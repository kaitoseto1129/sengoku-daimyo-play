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
  // 総大将の命（online_spec 1章）：総大将だけが出せる。他人は動かせず、相手の画面に紫の大きな印が立つだけ
  //   右翼前進＝右向きの矢／中央維持＝横長の壁／左翼包囲＝左向きの矢／予備待機＝三つの玉
  ordR: { col: 0xa04ad8, shape: 'arrR', ord: true }, ordC: { col: 0xa04ad8, shape: 'wall', ord: true },
  ordL: { col: 0xa04ad8, shape: 'arrL', ord: true }, ordW: { col: 0xa04ad8, shape: 'dots', ord: true },
};
export const SIG_KINDS = Object.keys(SIG).filter((k) => !SIG[k].ord);
export const ORD_KINDS = Object.keys(SIG).filter((k) => SIG[k].ord);
// 始める前に選べる武将（織田家）。その戦にすでに名前のある人は出さない（同じ名前が二人にならないように）
const COOP_GENERALS = ['森可成', '河尻秀隆', '池田恒興', '丹羽長秀', '蜂屋頼隆', '佐久間盛重', '斎藤新五', '坂井政尚'];
// PvP 野戦（&pvp=1）の西の席（敵方）で選べる武将。今川・斎藤・浅井など、その戦の敵方の将を先に、足りなければ汎用の名で
const WEST_GENERALS = ['岡部元信', '朝比奈泰朝', '鵜殿長照', '瀬名氏俊', '庵原忠縁', '三浦義就', '長井道利', '日比野清実'];
const candidates = (rt, side = 0) => {
  const used = new Set();
  for (const u of rt.army.units || []) if (u.name) used.add(u.name);
  return (side ? WEST_GENERALS : COOP_GENERALS).filter((n) => !used.has(n)).slice(0, 6);
};
const SIG_LIFE = 6;   // 秒

// 相手の分身（武将一人と侍三人）。名前は頭上の名札にそのまま出る。
function makeRemote(rt, name, at, team = 0) {
  // 西の席（敵方）の分身は、その戦の敵の家の見た目と旗で立てる
  const foe = team ? rt.army.groups.find((x) => x.team === 1 && x.faction && !x.civ) : null;
  const g = allyGroup(rt, { fixed: true, noAI: true, noRout: true, order: 'hold', aggro: 0, name: name + 'の旗本', anchor: { x: at.x, z: at.z }, facing: 0, width: 2, formation: 'line', team, ...(foe ? { faction: foe.faction } : {}) },
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
const meOf = (rt) => { const u = rt.player.u; return { x: r1(u.pos.x), z: r1(u.pos.z), yaw: r1(u.heading || 0), hp: Math.round(u.hp), g: rt.player.guard || u.guard ? 1 : 0, dn: rt.net?.meDown ? 1 : 0, sq: sqSpots(rt) }; };
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
  else if (S.shape === 'arrR' || S.shape === 'arrL') { top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 3), mat); top.position.y = 6.2; top.rotation.z = S.shape === 'arrR' ? -Math.PI / 2 : Math.PI / 2; }
  else if (S.shape === 'wall') { top = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 0.5), mat); top.position.y = 6; }
  else if (S.shape === 'dots') { top = new THREE.Group(); for (let i = -1; i <= 1; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mat); d.position.set(i * 1.8, 0, 0); top.add(d); } top.position.y = 6; }
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
  // &net=rtc：別々の機械の四人が WebRTC でホストに集まる（既定は同じブラウザの窓どうし bc）
  const kind = /[?&]net=rtc\b/.test(q) ? 'rtc' : 'bc';
  // &pvp=1：4対4 の野戦の席（0〜3 が東＝味方の側・4〜7 が西＝敵の側）。客は &side=west で西の席を頼む（ホストは東の 0）
  const pvp = /[?&]pvp=1\b/.test(q), mySide = !host && /[?&]side=west\b/.test(q) ? 1 : 0;
  const S = openSession({ role, room, kind, slots: pvp ? 8 : 4, sides: pvp, side: mySide, general: general || rt.G?.name || '' });
  const teamOf = (slot) => (pvp && slot >= 4 ? 1 : 0);
  // remotes：席（slot）ごとの相手の分身。席は戻っても同じ（切れた席は空きになり、戻った人が入る）
  const N = { role, host, pvp, teamOf, S, rt, remotes: new Map(), snapK: 0, snaps: 0, applied: 0, mes: 0, evs: 0, pinsGot: 0, sigs: [], maxK: 0, gotK: 0, firstK: 0, last: {}, log: [], aiTakeovers: 0, handBacks: 0, picks: new Map(), taken: [], myPick: null, ended: false, dispose: null };
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
    if (!R) { R = { slot, name, g: makeRemote(rt, name, at, teamOf(slot)), me: null, kills: 0 }; N.remotes.set(slot, R); if (pvp) armDuel(R); }
    else if (name && R.name !== name) { R.name = name; const u0 = R.g.units[0]; if (u0) u0.name = name; R.g.name = name + 'の旗本'; }
    return R;
  };
  const killsNow = () => rt.stats?.kills || 0;
  // ---- 攻城（&pvp=1&siege=1・K317）：区画（物見櫓・大手の木戸・肩・本丸の口・二の丸・本丸）の状態をホストが持ち、全員へ流す（net_siege.js） ----
  if (pvp && /[?&]siege=1\b/.test(q)) {
    import('./net_siege.js').then((M) => M.attachSiegeNet(rt, {
      host, send: (m) => S.send(m),
      players: () => { const out = []; const u = rt.player?.u; if (u) out.push({ x: u.pos.x, z: u.pos.z, team: 0 }); for (const R of N.remotes.values()) { const b = R.g.units.find((x) => x.alive); if (b && !R.down) out.push({ x: b.pos.x, z: b.pos.z, team: teamOf(R.slot) }); } return out; },
      onTaken: (k, pr) => { origin.banner(pr.fallen ? '本丸、落ちる' : M.SIEGE_NAMES[k] + '、破る', ''); if (pr.fallen && host) N.endPvp?.(true, '本丸、落ちる'); },
    })).then((L) => { N.siege = L; if (!L) N.log.push('siege: この戦は区画なし ' + rt.def?.key); }).catch((e) => N.log.push('siege ' + e.message));
  }
  // ---- 野戦の中の一騎打ち（PvP・K317）：東西の武将どうしの当たりは、斬った側が phit を送り、ホストが受けか当たりかと命を決めて pres で全員へ流す。
  //   一騎打ち（net_duel.js）と同じ決め方（前の左右 70 度で構えていれば受け・上段は受けても 1/4 通る・0.22 秒内の二度目は捨てる）。
  //   命は一騎打ちの命（100）で、NPC の兵の当たりとは別に数える。0 で「討ち取った／討ち取られた」。
  const D = N.duel = { hp: new Map(), log: [], sent: 0, res: 0 };
  const mySlot = () => (host ? 0 : S.slot);
  const hpOf = (sl) => D.hp.get(sl) ?? 100;
  const bodyOf = (sl) => (sl === mySlot() ? rt.player?.u : N.remotes.get(sl)?.g.units.find((u) => u.alive && u.type === 'busho') || null);
  let lastSwing = null, resN = 0;
  const lastAt = new Map();
  function armDuel(R) {
    const b = R.g.units.find((u) => u.type === 'busho') || R.g.units[0];
    if (!b) return;
    b.netDuel = (amount, src, opts) => {
      if (!src || !src.isPlayer || R.down || teamOf(R.slot) === teamOf(mySlot())) return;
      const P = rt.player.u;
      if (P.swing && lastSwing === P.swing) return;   // 一振りで一度
      lastSwing = P.swing;
      const m = { t: 'phit', a: mySlot(), d: R.slot, k: (opts && opts.kind) || 'kesa', dmg: Math.round(amount), gb: !!(opts && opts.guardBreak) };
      D.sent++;
      if (host) decideHit(m); else S.send(m);
    };
  }
  function decideHit(m) {
    const now = performance.now();
    if (now - (lastAt.get(m.d) || 0) < 220 || hpOf(m.d) <= 0 || hpOf(m.a) <= 0) return;   // 討たれた者の一撃は捨てる
    const du = bodyOf(m.d), au = bodyOf(m.a);
    if (!du || !au || teamOf(m.a) === teamOf(m.d)) return;
    const dx = au.pos.x - du.pos.x, dz = au.pos.z - du.pos.z, dl = Math.hypot(dx, dz) || 1;
    if (dl > 6) return;   // 届かない所からの当たりは捨てる
    lastAt.set(m.d, now);
    const front = (dx * Math.sin(du.heading || 0) + dz * Math.cos(du.heading || 0)) / dl > 0.34;
    const guard = (m.d === 0 ? !!(rt.player.guard || rt.player.u.guard) : !!N.remotes.get(m.d)?.me?.g) && front;
    const raw = Math.max(5, Math.min(40, +m.dmg || 0));
    const dmg = guard ? (m.gb ? Math.round(raw * 0.25) : 0) : raw;
    D.hp.set(m.d, Math.max(0, hpOf(m.d) - dmg));
    const r = { t: 'pres', n: ++resN, a: m.a, d: m.d, k: m.k, res: guard ? 'block' : 'hit', dmg, hp: [...D.hp.entries()], down: hpOf(m.d) <= 0 };
    S.send(r); applyHit(r);
  }
  // ---- 名乗りと見届けの輪（PvP・K317）：相手の側の武将と 9m に近づくと、相手が名乗り、すぐそばの兵（10m 内・二十人まで）が退いて
  //   二人の周り 8〜10m に輪を作り、真ん中を向いて見届ける。14m より離れるか、どちらかが討たれると輪を解く。
  //   見せ方だけ（各端末で自分の目に見える兵を動かす）。当たりと命はホストの決め（phit→pres）のまま。army_duel.js の AI の一騎打ちは使わない
  //   （あちらは相手を AI で動かし当たりもその場で決めるので、ネットの分身とぶつかる）。
  const RG = N.nanori = { on: null, n: 0, log: [] };
  const ringEnd = (why) => {
    const on = RG.on; if (!on) return;
    for (const w of on.units) { const o = w.u; o.noTarget = w.nt; o.netRing = false; }
    RG.log.push(['end', why, Math.round(rt.t)]); RG.on = null;
  };
  if (pvp) every(100, () => {
    const P = rt.player?.u;
    if (!P || rt.ended) return;
    const me = mySlot();
    if (!RG.on) {
      if (hpOf(me) <= 0) return;
      for (const R of N.remotes.values()) {
        if (R.down || teamOf(R.slot) === teamOf(me)) continue;
        const b = R.g.units.find((u) => u.alive && u.type === 'busho');
        if (!b || Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z) > 9) { if (RG.near === R) RG.near = null; continue; }
        // すれ違っただけで名乗らない：9m 内に一秒いてから
        if (RG.near !== R) { RG.near = R; RG.nearT = rt.t; continue; }
        if (rt.t - RG.nearT < 1) continue;
        const c = { x: (b.pos.x + P.pos.x) / 2, z: (b.pos.z + P.pos.z) / 2 };
        const units = [];
        for (const o of rt.army.units) {
          if (units.length >= 20 || !o.alive || o.isPlayer || o.netRing || o.fleeing || o.isStruct || o.isTaisho || o.isOfficer || o.civ || o.mounted || o.group?.netRemote || (rt.squad || []).includes(o)) continue;
          if (Math.hypot(o.pos.x - c.x, o.pos.z - c.z) > 10) continue;
          units.push({ u: o, nt: o.noTarget });
          o.netRing = true; o.noTarget = true; o.target = null; o.atk = null; o.swing = null;
        }
        RG.on = { R, b, c, units, t0: rt.t }; RG.n++;
        RG.log.push(['start', R.name, units.length, Math.round(rt.t)]);
        try { rt.army.play('eshout', b.pos, 1.2); } catch (e) { /* 声 */ }
        origin.say(R.name, '我こそは' + R.name + '。いざ、尋常に勝負！', 2.6);
        setTimeout(() => { try { rt.army.play('shout', c, 0.6); } catch (e) { /* どよめき */ } }, 1300);
        return;
      }
      return;
    }
    const on = RG.on, b = on.b;
    if (!b.alive || on.R.down || hpOf(me) <= 0) { ringEnd('down'); return; }
    const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
    if (d > 14 || rt.t - on.t0 > 90) { ringEnd(d > 14 ? 'far' : 'time'); return; }
    on.c.x = (b.pos.x + P.pos.x) / 2; on.c.z = (b.pos.z + P.pos.z) / 2;
    for (const w of on.units) {
      const o = w.u; if (!o.alive) continue;
      o.atk = null; o.swing = null; o.target = null;
      const dx = o.pos.x - on.c.x, dz = o.pos.z - on.c.z, dl = Math.hypot(dx, dz) || 1, r = 8 + (o.id % 3) * 0.9;
      if (dl < r) { const k = Math.min(0.35, r - dl); o.pos.x += dx / dl * k; o.pos.z += dz / dl * k; o.pos.y = rt.world.heightAt(o.pos.x, o.pos.z); }
      o.heading = Math.atan2(on.c.x - o.pos.x, on.c.z - o.pos.z);
    }
  });
  // ---- 討たれた後、副将の隊へ移る（PvP・K317・online_spec 6章）：自分なら、自分の側の近くの名のある将（分身でない・本人の組でない）の所へ移り、
  //   その将になり代わる（その将の体は戦から下げる）。命は戻り、組の士気は下がる。相手なら、分身を作り直す（次の me で立つ）。
  D.moves = [];
  const westLeader = () => { let w = -1; for (const sl of N.remotes.keys()) if (teamOf(sl) === 1 && (w < 0 || sl < w)) w = sl; return w; };
  // PvP の終わり（ホストだけ）：勝ち負けは東から見た値。西の客は受けて裏返す
  function endPvp(win, why) {
    if (!host || N.ended) return;
    N.ended = true;
    const players = resultPlayers();
    S.send({ t: 'end', win, players, why });
    N.result = { win, players, why };
    origin.banner(why, '');
    setTimeout(() => showResult({ win, players, meSlot: 0 }), 1500);
  }
  N.endPvp = endPvp;
  function moveToDeputy(m) {
    for (const [sl, h] of [[m.d, 100]]) D.hp.set(sl, h);
    const me = mySlot();
    if (m.d === me) {
      const P = rt.player?.u; if (!P) return;
      const myTeam = teamOf(me);
      let best = null, bd = 1e9;
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.team !== myTeam || !u.name || u.group?.netRemote || u.isTaisho || (rt.squad || []).includes(u)) continue;
        const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
        if (d < bd) { bd = d; best = u; }
      }
      const name = best?.name || '';
      if (best) {
        P.pos.x = best.pos.x; P.pos.z = best.pos.z; P.pos.y = rt.world.heightAt(P.pos.x, P.pos.z); P.heading = best.heading || P.heading;
        try { best.noTarget = true; rt.army.kill?.(best, null); } catch (e) { /* 下げる */ }
        if (best.mesh) best.mesh.visible = false;
        if (best.group && !best.group.noRout) best.group.morale = Math.max(0, (best.group.morale || 100) - 15);
      }
      P.hp = P.maxHp || 100;
      D.moves.push(['me', name, Math.round(rt.t)]);
      origin.banner(name ? name + 'の隊へ移る' : '副将の隊へ移る', '');
    } else {
      const R = N.remotes.get(m.d);
      if (R) { for (const u of R.g.units) if (u.mesh) u.mesh.visible = false; R.g.units.forEach((u) => { u.alive = false; u.gone = true; }); N.remotes.delete(m.d); }
      D.moves.push(['remote', m.d, Math.round(rt.t)]);
    }
  }
  function applyHit(r) {
    D.res++;
    D.log.push([r.n, r.a, r.d, r.k, r.res, r.dmg, r.down ? 1 : 0]);
    for (const [sl, h] of r.hp) D.hp.set(sl, h);
    const me = mySlot(), army = rt.army, du = bodyOf(r.d), au = bodyOf(r.a);
    if (!du) return;
    if (r.res === 'hit') {
      try { army.bleed(du, au || du, r.k, r.dmg / 100, 'torso'); } catch (e) { /* 血は無くても進む */ }
      try { army.hitFlash && army.hitFlash(du.pos.x, army.partY(du, 'torso'), du.pos.z, r.dmg >= 30); } catch (e) { /* 光 */ }
      try { army.play(r.a === me ? 'playerCut' : 'hit', du.pos, 1); } catch (e) { /* 音 */ }
      if (r.d === me) { du.hp = Math.max(1, Math.min(du.hp, hpOf(me))); try { rt.player.feelHit && rt.player.feelHit(r.dmg, au); } catch (e) { /* 揺れ */ } }
      else du.stagger = Math.max(du.stagger || 0, 0.34);
    } else {
      try { army.clashAt(au, du); } catch (e) { /* 火花 */ }
      try { army.play('clash', du.pos, 1); } catch (e) { /* 音 */ }
    }
    if (!r.down) return;
    // 総大将が討たれたら、その側の負け（PvP の勝ち方・online_spec 6章）。東の総大将はホスト（0 番席）、西は西の一番小さい席の人
    if (host && !N.ended) { const west = westLeader(); if (r.d === 0) endPvp(false, '東の総大将、討たれる'); else if (r.d === west) endPvp(true, '西の総大将、討たれる'); }
    // 討死は五秒戻らない（NG-09）。五秒後にホストが「副将へ移る」を全員へ流す
    if (host) setTimeout(() => { if (rt.ended || N.ended) return; D.hp.set(r.d, 100); const mv = { t: 'pmove', d: r.d }; S.send(mv); moveToDeputy(mv); }, 5000);
    const R = N.remotes.get(r.d);
    if (r.d === me) { rt.player.u.hp = 1; rt.player.u.invuln = true; N.meDown = true; origin.banner('討ち取られた', ''); }
    else {
      if (r.a === me) origin.banner((R?.name || '') + '、討ち取った', '');
      if (R) { R.down = true; const b = R.g.units.find((u) => u.type === 'busho'); if (b) { b.netDuel = null; b.invuln = false; army._k708R = (army._k708R || 0) + 1; try { army.kill(b, au); } catch (e) { /* 倒れ */ } finally { army._k708R--; } } }
    }
  }

  // ---- 合図（絵だけ）：長押しの輪・左の釦・Alt+1〜5 ----
  const sigs = N.sigs;
  const show = (kind, x, z) => { const s2 = makeSignal(rt, kind, x, z); if (s2) sigs.push(s2); };
  N.signal = (kind, at) => {
    if (!SIG[kind] || rt.ended || !rt.player?.u) return false;
    if (SIG[kind].ord && !host) return false;   // 命は総大将（ホスト）だけ
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
  const ringKinds = host ? [...SIG_KINDS, ...ORD_KINDS] : SIG_KINDS;
  N.ring = mountSignalRing({ kinds: ringKinds, colors, onPick: (kind, at) => N.signal(kind, at ? ground(at.x, at.y) : null) });
  const onKey = (e) => {
    if (!e.altKey) return;
    const k = { Digit1: 'attack', Digit2: 'hold', Digit3: 'here', Digit4: 'help', Digit5: 'retreat', Digit6: 'ordR', Digit7: 'ordC', Digit8: 'ordL', Digit9: 'ordW' }[e.code];
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
      else if (m.t === 'phit' && pvp && slot > 0) { m.a = slot; decideHit(m); }   // 差出人の席はつながりから（偽れない）
      else if (m.t === 'pick' && slot > 0) {
        const ok = candidates(rt, teamOf(slot)).includes(m.name) && !N.picks.has(slot) && ![...N.picks.values()].includes(m.name);
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
    // 西の席（敵方）に入ったら、自分の武将と組を敵の側へ移し、敵の本陣の近くから始める（PvP 野戦・K317）
    every(300, () => {
      if (N.myTeam != null || S.slot < 0 || !rt.player?.u) return;
      N.myTeam = teamOf(S.slot);
      if (!N.myTeam) return;
      const u = rt.player.u;
      let best = null, bn = 0;
      for (const g of rt.army.groups) if (g.team === 1 && !g.civ && !g.netRemote && g.count > bn) { bn = g.count; best = g; }
      const c = best ? best.center() : { x: u.pos.x, z: u.pos.z - 40 };
      const mates = (rt.squad || []).filter((x) => x && x.alive);
      for (const x of [u, ...mates]) { x.team = 1; }
      for (const g of new Set(mates.map((x) => x.group).filter(Boolean))) g.team = 1;
      const dx = u.pos.x - c.x, dz = u.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
      const nx = c.x + (dx / d) * 12, nz = c.z + (dz / d) * 12;
      for (const [i, x] of [u, ...mates].entries()) { x.pos.x = nx + (i % 3) * 1.5; x.pos.z = nz + Math.floor(i / 3) * 1.5; x.pos.y = rt.world.heightAt(x.pos.x, x.pos.z); }
      u.heading = Math.atan2(dx, dz);
      N.log.push('side west ' + Math.round(nx) + ',' + Math.round(nz));
      if (rt.objectives) { const keep = rt.objectives.filter((o) => o.id === 'p2'); rt.objectives.length = 0; rt.objectives.push(...keep); }   // 東の任務を下ろす
      origin.obj('p2', '旗本を率い、寄せ手の備を押し返せ', 'side');
      // 右上の目標（goals5.js の rt._g5）も西の目標に差し替える（東の段の目標を出さない）
      const kills = () => rt.stats?.kills || 0;
      const westMain = /[?&]siege=1\b/.test(q) ? '城の区画を守り、寄せ手の武将を討て' : '東の武将を討ち、本陣を守れ';
      rt._g5 = { goals: [
        { kind: 'main', text: westMain, noun: '東の武将', check: () => [...N.remotes.values()].some((R) => teamOf(R.slot) === 0 && R.down) },
        { kind: 'kill', text: '敵を八人討つ', noun: '敵', check: () => kills() >= 8, count: () => [Math.min(8, kills()), 8] },
      ], done: [], fail: [], late: [], pass: [], nowI: -1, nowT0: 0, own: new Set(), dead: new Set(), deep: false, t0: rt.t || 0, endT: null, bossU: null, tgAt: -1, tg: null };
      origin.obj('west', /[?&]siege=1\b/.test(q) ? '城の区画を守り、寄せ手の武将を討て' : '東の武将を討ち、本陣を守れ', 'main');
    });
    // 始める前の武将選び（?general= があれば選んだ事にする。無ければ画面で選ぶ）
    const cands = candidates(rt, mySide);
    const sendPick = (n) => S.send({ t: 'pick', name: n });
    if (general) { N.myPick = general; setTimeout(() => sendPick(general), 800); }
    else N.picker = showPicker({ names: cands, taken: [], onPick: sendPick });
    S.on('msg', (m) => {
      if (m.t === 'ev') {
        N.evs++;
        // 西の席（敵方）の客には、東の任務と行き先の印を流さない（自分の任務は下で出す）
        if (N.myTeam === 1 && ['obj', 'objDone', 'objFail', 'objProgress'].includes(m.f)) return;
        try { origin[m.f](...m.a); } catch (e) { N.log.push('ev ' + m.f + ' ' + e.message); }
      } else if (m.t === 'sig') { show(m.kind, m.x, m.z); }
      else if (m.t === 'pres' && pvp) applyHit(m);
      else if (m.t === 'pmove' && pvp) moveToDeputy(m);
      else if (m.t === 'siege') N.siege?.apply(m.p);
      else if (m.t === 'taken') { N.taken = m.list; N.picker?.update(m.list); }
      else if (m.t === 'pickres') { if (m.ok) { N.myPick = m.name; N.picker?.close(); N.picker = null; } else N.picker?.update(N.taken); }
      else if (m.t === 'end') {
        if (N.ended) return;
        const win = N.myTeam === 1 ? !m.win : m.win;   // 西の席は勝ち負けが裏返る
        if (m.why) origin.banner(m.why, '');
        N.ended = true; N.result = { win, players: m.players };
        showResult({ win, players: m.players, meSlot: S.slot });
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
    rt.after?.(1, () => origin.obj('p2', N.myTeam === 1 ? '旗本を率い、寄せ手の備を押し返せ' : '旗本を率い、先手の備を支えよ', 'side'));
    const p2pin = { x: 0, z: 0, has: false };
    every(1000, () => {
      if (rt.ended || !rt.player?.u) return;
      const P = rt.player.u.pos;
      let best = null, bd = 1e9;
      for (const g of rt.army.groups) {
        if (g.team !== 1 - (N.myTeam || 0) || g.count < 5 || g.civ) continue;
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
    N.siege?.dispose?.();
    ringEnd('dispose');
    S.close(); delete rt.net;
  };
  return N;
}
