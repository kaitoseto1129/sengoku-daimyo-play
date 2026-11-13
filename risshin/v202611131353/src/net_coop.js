// 二窓の二人 Co-op（オンライン P0・docs/online_design_1111.md）。URL に ?coop=host / ?coop=guest（&room=名）が付いた時だけ main.js が読む。
// ソロの戦は一行も変えない：Battle の口は main.js の「戦が始まった所」の一行だけ。
//
// 作り（設計 3・4 章の P0 の切り詰め）：
//   ホスト（窓A）＝今の戦そのまま。戦の進み・任務・勝ち負けを持ち、全部隊の状態を流す（snap）。
//   客（窓B）＝同じ戦を自分の端末で組み立てる（地形・建物・隊）。戦の台詞・任務・印・終わりはホストから受けた物だけを出し、
//             隊は snap の中心・人数へ寄せる。自分の武将（P2）は自分の端末で歩く。
//   お互いの武将は「相手の分身（busho 一人＋侍三人の小さな隊）」として自分の端末に立ち、受けた位置へ動く（me / snap.pl）。
// 送る物：snap（部隊・変わった物だけ）・me（自分の武将と隊の頭）・ev（台詞・札・任務・終わり）・pins（行き先の印）・sig（合図）。
// 足軽一人ずつの座標は送らない。
import * as THREE from 'three';
import { openSession } from './net_session.js';
import { allyGroup } from './bhelp.js';
import { mountSignalRing, showPicker, showResult } from './net_coop_ui.js';

const SNAP_MS = 100, ME_MS = 100, PIN_MS = 1000, KEEP_S = 2, FAR_EVERY = 5, NEAR_M = 90;
const r1 = (v) => Math.round(v * 10) / 10;
const keyOf = (g, seen) => { const base = g.name || g.label || (g.faction + ':' + g.team); const n = seen[base] = (seen[base] || 0) + 1; return base + '#' + n; };
// 合図：絵だけ（字は使わない）。色と形で分ける。
//   attack 赤い三角（上向き）／hold 青い四角／here 黄の丸／help 橙の二重の輪／retreat 白の下向き三角
const SIG = {
  attack: { col: 0xd8372a, shape: 'tri' }, hold: { col: 0x3b78d8, shape: 'box' }, here: { col: 0xe8c43a, shape: 'ball' },
  help: { col: 0xf08a24, shape: 'ring2' }, retreat: { col: 0xf1efe6, shape: 'tridown' },
};
export const SIG_KINDS = Object.keys(SIG);
// 始める前に選べる武将（織田家）。その戦にすでに名前のある人は出さない（同じ名前が二人にならないように）
const COOP_GENERALS = ['森可成', '河尻秀隆', '池田恒興', '丹羽長秀', '蜂屋頼隆', '佐久間盛重', '斎藤新五', '坂井政尚'];
const candidates = (rt) => {
  const used = new Set();
  for (const u of rt.army.units || []) if (u.name) used.add(u.name);
  return COOP_GENERALS.filter((n) => !used.has(n)).slice(0, 6);
};
const SIG_LIFE = 6;   // 秒

// 相手の分身（武将一人と侍三人）。名前は頭上の名札にそのまま出る。
function makeRemote(rt, name, at, team = 0) {
  const g = allyGroup(rt, { fixed: true, noAI: true, noRout: true, order: 'hold', aggro: 0, name: name + 'の旗本', anchor: { x: at.x, z: at.z }, facing: 0, width: 2, formation: 'line', team },
    [{ type: 'busho', n: 1, o: { name, invuln: true, horse: false } }, { type: 'samurai', n: 3 }]);
  g.noRetinue = true; g.netRemote = true;
  return g;
}
function place(rt, g, p) {
  if (!g || !p || g.netAI) return;
  const us = g.units.filter((u) => u.alive);
  const spots = [[p.x, p.z], ...(p.sq || [])];
  for (let i = 0; i < us.length; i++) {
    const s = spots[Math.min(i, spots.length - 1)] || spots[0];
    const u = us[i];
    const dx = s[0] - u.pos.x, dz = s[1] - u.pos.z, d = Math.hypot(dx, dz);
    const k = d > 30 ? 1 : 0.5;
    u.pos.x += dx * k; u.pos.z += dz * k; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    if (i === 0 && p.yaw != null) u.heading = p.yaw;
    u.mv && (u.mv.x = 0, u.mv.z = 0);
  }
}
const sqSpots = (rt) => {
  const out = [];
  for (const s of (rt.squad || [])) if (s && s.alive && out.length < 3) out.push([r1(s.pos.x), r1(s.pos.z)]);
  return out;
};
const meOf = (rt) => { const u = rt.player.u; return { x: r1(u.pos.x), z: r1(u.pos.z), yaw: r1(u.heading || 0), hp: Math.round(u.hp), sq: sqSpots(rt) }; };
// ev に載せられる引数だけ（文字・数・真偽）。関数や物を含む呼び出しは流さない
const plain = (a) => a.every((x) => x == null || ['string', 'number', 'boolean'].includes(typeof x));

// 分身の隊を AI に渡す／戻す（切断と戻り。設計 6 章）
function handToAI(rt, g) {
  if (!g || g.netAI) return;
  g.netAI = true; g.noAI = false; g.fixed = false; g.order = 'attack'; g.aggro = 14; g.seekRange = 60; g.noRout = false;
  for (const u of g.units) { u.noTarget = false; }
}
function handBack(rt, g) {
  if (!g || !g.netAI) return;
  g.netAI = false; g.noAI = true; g.fixed = true; g.order = 'hold'; g.aggro = 0; g.noRout = true;
}

// 合図の絵（地面の輪と立つ印）。時間で薄くなって消える
function makeSignal(rt, kind, x, z) {
  const S = SIG[kind]; if (!S) return null;
  const y = rt.world.heightAt(x, z);
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  const mat = new THREE.MeshBasicMaterial({ color: S.col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 32), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; grp.add(ring);
  if (S.shape === 'ring2') { const r2 = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.1, 32), mat); r2.rotation.x = -Math.PI / 2; r2.position.y = 0.15; grp.add(r2); }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), mat); pole.position.y = 2.5; grp.add(pole);
  let top;
  if (S.shape === 'tri' || S.shape === 'tridown') { top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.5, 3), mat); top.position.y = 5.8; if (S.shape === 'tridown') top.rotation.z = Math.PI; }
  else if (S.shape === 'box') { top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mat); top.position.y = 5.7; }
  else { top = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), mat); top.position.y = 5.7; }
  grp.add(top);
  rt.scene.add(grp);
  return { grp, mat, t: 0, kind, spin: top };
}

export function attachCoop(rt, game, { role, room, general } = {}) {
  const q = location.search;
  role = role || (/[?&]coop=guest/.test(q) ? 'guest' : 'host');
  room = room || (/[?&]room=([\w-]+)/.exec(q) || [])[1] || 'okehazama';
  general = general || (/[?&]general=([^&]+)/.exec(q) || [])[1];
  if (general) general = decodeURIComponent(general);
  const host = role === 'host';
  const S = openSession({ role, room, slots: 4, general: general || rt.G?.name || '' });
  // remotes：席（slot）ごとの相手の分身。席は戻っても同じ（切れた席は空きになり、戻った人が入る）
  const N = { role, host, S, rt, remotes: new Map(), snapK: 0, snaps: 0, applied: 0, mes: 0, evs: 0, pinsGot: 0, sigs: [], maxK: 0, gotK: 0, firstK: 0, last: {}, log: [], aiTakeovers: 0, handBacks: 0, picks: new Map(), taken: [], myPick: null, ended: false, dispose: null };
  Object.defineProperty(N, 'remote', { get() { return N.remotes.values().next().value?.g || null; } });
  rt.net = N;
  window.__net = N;
  const timers = [];
  const every = (ms, f) => timers.push(setInterval(f, ms));
  const origin = rt._netOrigin || (rt._netOrigin = {});
  const names = ['obj', 'objDone', 'objFail', 'objProgress', 'say', 'banner', 'bark', 'finish', 'marker', 'unmark'];
  for (const f of names) if (!origin[f]) origin[f] = rt[f].bind(rt);
  const slotOf = (id) => S.peers.get(id)?.slot ?? -1;
  const remoteFor = (slot, name, at) => {
    let R = N.remotes.get(slot);
    if (!R) { R = { slot, name, g: makeRemote(rt, name, at, 0), me: null, kills: 0 }; N.remotes.set(slot, R); }
    else if (name && R.name !== name) { R.name = name; const u0 = R.g.units[0]; if (u0) u0.name = name; R.g.name = name + 'の旗本'; }
    return R;
  };
  const killsNow = () => rt.stats?.kills || 0;

  // ---- 合図（絵だけ）：長押しの輪・左の釦・Alt+1〜5 ----
  const sigs = N.sigs;
  const show = (kind, x, z) => { const s2 = makeSignal(rt, kind, x, z); if (s2) sigs.push(s2); };
  N.signal = (kind, at) => {
    if (!SIG[kind] || rt.ended || !rt.player?.u) return false;
    const u = rt.player.u, h = u.heading || 0;
    let x = u.pos.x + Math.sin(h) * 6, z = u.pos.z + Math.cos(h) * 6;
    if (at && at.wx != null) { x = at.wx; z = at.wz; }
    show(kind, x, z);
    S.send({ t: 'sig', kind, x: r1(x), z: r1(z) });
    return true;
  };
  // 画面の点を地面の点にする（長押しした所に合図が立つ）
  const ground = (px, py) => {
    try {
      const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
      const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, rt.camera);
      const P = rt.player.u.pos; const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -P.y);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(pl, hit)) return null;
      const d = Math.hypot(hit.x - P.x, hit.z - P.z);
      if (d > 60) { hit.x = P.x + (hit.x - P.x) * 60 / d; hit.z = P.z + (hit.z - P.z) * 60 / d; }
      return { wx: hit.x, wz: hit.z };
    } catch (e) { return null; }
  };
  const colors = Object.fromEntries(SIG_KINDS.map((k) => [k, SIG[k].col]));
  N.ring = mountSignalRing({ kinds: SIG_KINDS, colors, onPick: (kind, at) => N.signal(kind, at ? ground(at.x, at.y) : null) });
  const onKey = (e) => {
    if (!e.altKey) return;
    const k = { Digit1: 'attack', Digit2: 'hold', Digit3: 'here', Digit4: 'help', Digit5: 'retreat' }[e.code];
    if (k) { N.signal(k); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);
  every(50, () => {
    for (let i = sigs.length - 1; i >= 0; i--) {
      const s2 = sigs[i]; s2.t += 0.05;
      s2.mat.opacity = Math.max(0, Math.min(0.9, (SIG_LIFE - s2.t) / 1.5));
      s2.spin.rotation.y += 0.08;
      if (s2.t >= SIG_LIFE) { rt.scene.remove(s2.grp); s2.grp.traverse((o) => o.geometry?.dispose()); s2.mat.dispose(); sigs.splice(i, 1); }
    }
  });

  const resultPlayers = () => {
    const players = [{ slot: 0, name: rt.G?.name || '主人公', kills: killsNow() }];
    for (const R of N.remotes.values()) players.push({ slot: R.slot, name: R.name, kills: R.kills || 0 });
    return players;
  };

  if (host) {
    // ---- ホスト：出来事を流す。戦の関数はそのまま働き、呼ばれたら同じ引数を客へ送る ----
    for (const f of ['obj', 'objDone', 'objFail', 'objProgress', 'say', 'banner', 'bark', 'finish']) {
      rt[f] = function (...a) {
        const r = origin[f](...a);
        if (plain(a)) S.send({ t: 'ev', f, a });
        N.evs++;
        return r;
      };
    }
    const broadcastTaken = () => { N.taken = [...N.picks.values()]; S.send({ t: 'taken', list: N.taken }); };
    S.on('join', (j) => {
      const R = N.remotes.get(j.slot);
      if (R) { handBack(rt, R.g); N.handBacks++; }   // 戻り：AI から人へ
      S.start({ battle: rt.def?.key || '' });
      N.full = true;
      S.send({ t: 'taken', list: N.taken }, j.id);
    });
    S.on('leave', (j) => {   // 切断：その席の分身の隊を AI が継ぐ（隊も武将も消さない）
      const R = N.remotes.get(j.slot);
      if (R) { handToAI(rt, R.g); N.aiTakeovers++; }
      N.picks.delete(j.slot); broadcastTaken();   // 選んだ武将は空ける
    });
    S.on('msg', (m) => {
      const slot = slotOf(m.from);
      if (m.t === 'me' && slot > 0) {
        N.mes++;
        const R = remoteFor(slot, N.picks.get(slot) || m.name || ('P' + (slot + 1)), m);
        R.me = m; R.kills = m.k || 0;
        N.last.me = m;
        place(rt, R.g, m);
      } else if (m.t === 'sig') { show(m.kind, m.x, m.z); }
      else if (m.t === 'pick' && slot > 0) {
        const ok = candidates(rt).includes(m.name) && !N.picks.has(slot) && ![...N.picks.values()].includes(m.name);
        if (ok) { N.picks.set(slot, m.name); const R = N.remotes.get(slot); if (R) remoteFor(slot, m.name); }
        S.send({ t: 'pickres', ok, name: m.name }, m.from);
        broadcastTaken();
      }
    });
    const sent = new Map();
    let tick = 0;
    every(SNAP_MS, () => {
      if (rt.ended || !rt.player?.u) return;
      tick++;
      const seen = {}, groups = [];
      const P = rt.player.u.pos;
      const rpos = [...N.remotes.values()].map((R) => R.g.units.find((u) => u.alive)?.pos).filter(Boolean);
      for (const g of rt.army.groups) {
        const key = keyOf(g, seen);
        if (g.netRemote || g.isPlayerSquad || g.name === 'player' || g.civ) continue;
        const c = g.center(), n = g.count;
        const near = Math.hypot(c.x - P.x, c.z - P.z) < NEAR_M || rpos.some((R) => Math.hypot(c.x - R.x, c.z - R.z) < NEAR_M);
        if (!near && !N.full && tick % FAR_EVERY) continue;
        const row = [key, r1(c.x), r1(c.z), r1(g.facing || 0), g.formation, g.order, n, Math.round(g.morale || 0), g.routed ? 1 : 0];
        const old = sent.get(key);
        if (old && !N.full && Math.hypot(old.x - row[1], old.z - row[2]) < 0.4 && old.n === n && old.o === row[5] && old.mor === row[7] && old.r === row[8] && tick - old.tick < KEEP_S * 10) continue;
        sent.set(key, { x: row[1], z: row[2], n, o: row[5], mor: row[7], r: row[8], tick });
        groups.push(row);
      }
      N.full = false;
      // 全員の武将（席・名前・位置）。客は自分以外を分身として立てる
      const pls = [{ slot: 0, name: rt.G?.name || '主人公', ...meOf(rt) }];
      for (const R of N.remotes.values()) { const u = R.g.units.find((x) => x.alive); if (u) pls.push({ slot: R.slot, name: R.name, x: r1(u.pos.x), z: r1(u.pos.z), yaw: r1(u.heading || 0), sq: R.me?.sq || [] }); }
      S.send({ t: 'snap', k: ++N.snapK, tt: r1(rt.t), step: rt.flags?.step ?? null, g: groups, pls });
    });
    every(PIN_MS, () => {
      if (rt.ended) return;
      const list = [];
      for (const m of rt.markers || []) {
        let p = null, label = '';
        try { p = typeof m.pos === 'function' ? m.pos() : m.pos; label = typeof m.label === 'function' ? m.label() : m.label; } catch (e) { p = null; }
        if (!p || typeof label !== 'string' || !label) continue;
        list.push([m.id, r1(p.x), r1(p.z), label, m.red ? 1 : 0]);
        if (list.length >= 8) break;
      }
      S.send({ t: 'pins', list });
    });
    // 終わり：全体と一人ずつの結果を、全員の画面へ
    every(500, () => {
      if (N.ended || !rt.over) return;
      N.ended = true;
      const win = rt.tracker?.main === true && !rt.result?.down;
      const players = resultPlayers();
      S.send({ t: 'end', win, players });
      N.result = { win, players };
      showResult({ win, players, meSlot: 0 });
    });
  } else {
    // ---- 客：戦の筋書きの出力を止める。台詞・札・任務・印・終わりはホストから受けた物だけ ----
    for (const f of names) rt[f] = function () { return undefined; };
    rt.markers.length = 0;
    const pinned = new Map();
    S.on('start', () => { N.started = true; });
    // 始める前の武将選び（?general= があれば選んだ事にする。無ければ画面で選ぶ）
    const cands = candidates(rt);
    const sendPick = (n) => S.send({ t: 'pick', name: n });
    if (general) { N.myPick = general; setTimeout(() => sendPick(general), 800); }
    else N.picker = showPicker({ names: cands, taken: [], onPick: sendPick });
    S.on('msg', (m) => {
      if (m.t === 'ev') {
        N.evs++;
        try { origin[m.f](...m.a); } catch (e) { N.log.push('ev ' + m.f + ' ' + e.message); }
      } else if (m.t === 'sig') { show(m.kind, m.x, m.z); }
      else if (m.t === 'taken') { N.taken = m.list; N.picker?.update(m.list); }
      else if (m.t === 'pickres') { if (m.ok) { N.myPick = m.name; N.picker?.close(); N.picker = null; } else N.picker?.update(N.taken); }
      else if (m.t === 'end') {
        if (N.ended) return;
        N.ended = true; N.result = { win: m.win, players: m.players };
        showResult({ win: m.win, players: m.players, meSlot: S.slot });
      }
      else if (m.t === 'pins') {
        N.pinsGot++;
        const ids = new Set();
        for (const [id, x, z, label, red] of m.list) {
          ids.add(id);
          let rec = pinned.get(id);
          if (!rec) {
            rec = { x, z };
            pinned.set(id, rec);
            origin.marker('net:' + id, () => ({ x: rec.x, z: rec.z, y: rt.world.heightAt(rec.x, rec.z) }), label, red ? { red: true } : {});
          } else { rec.x = x; rec.z = z; }
        }
        for (const id of [...pinned.keys()]) if (!ids.has(id)) { origin.unmark('net:' + id); pinned.delete(id); }
      } else if (m.t === 'snap') {
        N.snaps++;
        if (!N.firstK) N.firstK = m.k;
        N.gotK++; N.maxK = Math.max(N.maxK, m.k);
        if (m.k <= (N.snapK || 0)) return;
        N.snapK = m.k; N.last.snap = m;
        N.hostStep = m.step;
        for (const p of m.pls || []) {
          if (p.slot === S.slot) continue;
          const R = remoteFor(p.slot, p.name || ('P' + (p.slot + 1)), p);
          place(rt, R.g, p);
        }
        const seen = {}, byKey = new Map();
        for (const g of rt.army.groups) { const key = keyOf(g, seen); if (!g.netRemote && !g.isPlayerSquad && g.name !== 'player') byKey.set(key, g); }
        for (const [key, cx, cz, f, fm, order, n, mor, routed] of m.g) {
          const g = byKey.get(key); if (!g) continue;
          N.applied++;
          g.morale = mor; if (routed) g.routed = true;
          const c = g.center();
          const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
          if (d > 1.5) {
            const k = d > 40 ? 1 : d > 10 ? 0.6 : 0.5;
            for (const u of g.units) if (u.alive) { u.pos.x += dx * k; u.pos.z += dz * k; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
            g.anchor = { x: cx, z: cz };
          }
          let extra = g.count - n;
          if (extra > 0) {
            const P = rt.player.u.pos;
            const alive = g.units.filter((u) => u.alive && !u.dying && !u.isPlayer);
            alive.sort((a, b) => Math.hypot(b.pos.x - P.x, b.pos.z - P.z) - Math.hypot(a.pos.x - P.x, a.pos.z - P.z));
            for (const u of alive) { if (extra-- <= 0) break; rt.army.kill?.(u, null); }
          }
        }
      }
    });
    rt.after?.(1, () => origin.obj('p2', '旗本を率い、先手の備を支えよ', 'side'));
    const p2pin = { x: 0, z: 0, has: false };
    every(1000, () => {
      if (rt.ended || !rt.player?.u) return;
      const P = rt.player.u.pos;
      let best = null, bd = 1e9;
      for (const g of rt.army.groups) {
        if (g.team !== 1 || g.count < 5 || g.civ) continue;
        const c = g.center(), d = Math.hypot(c.x - P.x, c.z - P.z);
        if (d < bd) { bd = d; best = { x: c.x, z: c.z }; }
      }
      if (!best) { if (p2pin.has) { origin.unmark('net:p2'); p2pin.has = false; } return; }
      p2pin.x = best.x; p2pin.z = best.z;
      if (!p2pin.has) { p2pin.has = true; origin.marker('net:p2', () => ({ x: p2pin.x, z: p2pin.z, y: rt.world.heightAt(p2pin.x, p2pin.z) }), '先手の備', { red: true }); }
    });
  }
  // 自分の武将と隊の頭の位置・討ち取りの数を 10Hz で相手へ（客→ホスト。ホストは snap の pls で全員へ返す）
  every(ME_MS, () => {
    if (rt.ended || !rt.player?.u || host) return;
    S.send({ t: 'me', name: N.myPick || general || rt.G?.name || 'P2', k: killsNow(), ...meOf(rt) });
  });
  N.dispose = () => {
    for (const t of timers) clearInterval(t);
    document.removeEventListener('keydown', onKey);
    N.ring?.dispose();
    N.picker?.close();
    for (const s2 of sigs.splice(0)) { rt.scene.remove(s2.grp); s2.mat.dispose(); }
    S.close(); delete rt.net;
  };
  return N;
}
