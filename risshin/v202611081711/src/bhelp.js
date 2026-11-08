// 戦の定義で使う共通の道具（battles.js と、戦ごとの b_*.js から使う）
import * as THREE from 'three';
import { palisade, stumps, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { GENERALS } from './units_data.js';
import { mixFor } from './army_mix.js';

export const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);

// 数を日本語の数詞に（1500→千五百、15000→一万五千）。兵力の差の札で使う
const KANJI_D = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function jpNum(n) {
  n = Math.round(n);
  if (n <= 0) return '0';
  const man = Math.floor(n / 10000), rest = n % 10000;
  const four = (x) => {
    if (x <= 0) return '';
    const sen = Math.floor(x / 1000), hya = Math.floor(x / 100) % 10, ju = Math.floor(x / 10) % 10, ichi = x % 10;
    let s = '';
    if (sen) s += (sen > 1 ? KANJI_D[sen] : '') + '千';
    if (hya) s += (hya > 1 ? KANJI_D[hya] : '') + '百';
    if (ju) s += (ju > 1 ? KANJI_D[ju] : '') + '十';
    if (ichi) s += KANJI_D[ichi];
    return s;
  };
  return (man ? four(man) + '万' : '') + four(rest);
}
// 兵力の差を数の札で見せる（長篠城で始めた物を、戦の定義の兵数から共通で出す。kaito 10/2）
// ally・enemy は戦の定義が持つ数（実際に出す本物の数ではなく、史実・設定の総数）
export function strengthBanner(rt, ally, enemy) {
  rt.banner('兵力の差', `味方 ${jpNum(ally)}、敵 ${jpNum(enemy)}`);
}

// 深手の大将はこの戦の間、奥で手当てを続ける。短時間で傷を治して戦列へ戻さない。
// 史実の接触を進行条件にしている者だけ、呼び出し側で例外を明示する。
export function guardRecover(rt, u, dt, o = {}) {
  if (!u || !u.alive || !u.invuln || !u.woundOut) return;
  if (!u._recov) {
    u._recov = true;
    if (o.line) rt.say(o.line[0], o.line[1], o.line[2] ?? 3);
  }
  if (!o.historicalReturn) return;
  const heal = o.heal ?? 0.04, back = o.back ?? 0.85;
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * heal * dt);
  if (u.hp >= u.maxHp * back && u.noTarget) {
    u._recov = false; u.noTarget = false; u.woundOut = null;
    if (o.backLine) rt.say(o.backLine[0], o.backLine[1], o.backLine[2] ?? 2.5);
  }
}

// 近い（20m 以内）・傷ついた本物の兵の頭上に、小さな体力の棒を出す（InstancedMesh 一つ。kaito 10/2）
// 味方は青、敵は赤。設定 K.hpBars が false の時は呼び出し側で update を止めれば消える
export function hpBarSystem(rt, cap = 48) {
  const geo = new THREE.PlaneGeometry(0.8, 0.1);
  geo.translate(0.4, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: true, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  rt.scene.add(mesh);
  const dummy = new THREE.Object3D();
  const ALLY = new THREE.Color(0x4fd0ff), ENEMY = new THREE.Color(0xff5a3c);
  const NEAR2 = 400;   // 20m
  return {
    mesh,
    dispose() { rt.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
    update(groups) {
      const P = rt.player.u.pos;
      const yaw = (rt.player.yaw || 0) + (rt.player.camYawOff || 0);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let n = 0;
      for (let gi = 0; gi < groups.length && n < cap; gi++) {
        const g = groups[gi];
        if (!g || !g.units) continue;
        for (let i = 0; i < g.units.length && n < cap; i++) {
          const u = g.units[i];
          if (!u.alive || u.hp >= u.maxHp || u.hp <= 0 || u.type === 'dummy' || u.type === 'porter') continue;
          const dx = u.pos.x - P.x, dz = u.pos.z - P.z;
          if (dx * dx + dz * dz > NEAR2) continue;
          const ratio = Math.max(0.03, u.hp / u.maxHp);
          dummy.position.set(u.pos.x - rx * 0.4, (u.pos.y || 0) + 2.05, u.pos.z - rz * 0.4);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(ratio, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          const c = u.team === 0 ? ALLY : ENEMY;
          mesh.instanceColor.setXYZ(n, c.r, c.g, c.b);
          n++;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// 援兵・伏兵の出る位置は戦の定義が決めた場所を保つ。視線で反対側へ移さない。
export function hiddenFrom(rt, pos) { return pos; }

// o.fixed は既存の戦の定義との互換のために残す。持ち場はどの隊も動かさない。
// o.ambush: true を付けると、見つかって動き出す（敵に気付く・u.target が付く）までしゃがんで旗を倒した姿で待つ（army_anim.js の u._crouch）
// 兵の割合（kaito 10/28 の表・army_mix.js）：槍だけの大きな組（足軽 8 人から）の一部を、後ろの列の鉄砲と弓に。
//   鉄砲は戦の年で（稲生・桶狭間は少なく、長篠から表どおり）。鉄砲・弓を既に持つ組・名のある者・o.keep・def.keepMix は替えない。人数の合計は変えない
// 11/7 kaito（全戦）：家ごとの兵の作り。島津・伊達・織田・雑賀・明智は鉄砲が多い、武田は騎馬が多い、毛利・細川は弓が多い。
//   家（faction）か旗（flag）の名で引く。戦の定義が鉄砲・弓・騎馬を自分で決めた組はそのまま
const CLAN_MIX = {
  shimazu: { gun: 0.12 }, date: { gun: 0.12 }, oda: { gun: 0.06 }, saika: { gun: 0.25 }, akechi: { gun: 0.1 },
  takeda: { cav: 0.75 }, akazonae: { cav: 0.75 },
  mori: { bow: 0.2 }, hosokawa: { bow: 0.2 },
};
function clanOf(g) { return CLAN_MIX[g?.faction] || CLAN_MIX[g?.flag] || null; }
function mixList(rt, list, ally, g = null) {
  if (!Array.isArray(list) || rt.def?.keepMix || list.some((e) => e && (e.type === 'gun' || e.type === 'bow'))) return list;
  // 鉄砲・弓を多く（緊迫感。十八の7・BZ）：鉄砲はその年の割合どおり、弓は一割
  const clan = clanOf(g), m = mixFor(rt.def?.key), gr = Math.min(0.5, m.gun * (ally ? 1 : 0.9) + (clan?.gun || 0)), br = 0.1 + (clan?.bow || 0);
  const out = [];
  for (const e of list) {
    if (!e || e.type !== 'ashigaru' || !(e.n >= 8) || (e.o && (e.o.name || e.o.keep))) { out.push(e); continue; }
    const ng = Math.round(e.n * gr), nb = Math.round(e.n * br);
    out.push({ ...e, n: e.n - ng - nb });
    if (ng) out.push({ ...e, type: 'gun', n: ng });
    if (nb) out.push({ ...e, type: 'bow', n: nb });
  }
  return out;
}
// 騎馬隊（十八の7・BZ「騎馬に乗るのが侍大将だけ」）：名の無い侍が三人より多い組は、その四割を騎馬武者に（馬廻・騎馬の組）。
//   城や塀の内では units.js が馬を下りさせる。戦の定義が騎馬を決めている組（cavalry がある）と def.noCavalryMix の戦はそのまま
// 11/8 kaito（樫井・全戦）：敵の騎馬が少ない。兵の割合の表（army_mix.js：騎馬武者4・侍大将組頭1 ＝ 5%）を敵の組の下限にする。
//   侍の少ない組（2〜3人）も、組の人数の5%ほどを馬に乗せる（足で残す侍は一人以上。侍がいなければ槍足軽から一人）。人数の合計は変えない
const ENEMY_CAV = 0.05;
function horseList(rt, list, g = null, enemy = false) {
  if (!Array.isArray(list) || rt.def?.noCavalryMix || rt.def?.keepMix || list.some((e) => e && e.type === 'cavalry')) return list;
  const out = [];
  const free = (e) => e && !(e.o && (e.o.name || e.o.keep || e.o.ashiTaisho));
  for (const e of list) {
    if (!e || e.type !== 'samurai' || !(e.n >= 4) || !free(e)) { out.push(e); continue; }
    const nc = Math.round(e.n * (clanOf(g)?.cav || 0.4));
    out.push({ ...e, n: e.n - nc }, { ...e, type: 'cavalry', n: nc });
  }
  if (!enemy) return out;
  const total = out.reduce((s, e) => s + (e?.n || 0), 0);
  let need = total >= 12 ? Math.round(total * ENEMY_CAV) - out.reduce((s, e) => s + (e?.type === 'cavalry' ? e.n : 0), 0) : 0;
  for (const kind of ['samurai', 'ashigaru']) {
    for (let i = 0; i < out.length && need > 0; i++) {
      const e = out[i];
      if (!free(e) || e.type !== kind || !(e.n >= 2)) continue;
      const k = Math.min(need, kind === 'samurai' ? e.n - 1 : 1);
      if (k <= 0) continue;
      out.splice(i, 1, { ...e, n: e.n - k }, { ...e, type: 'cavalry', n: k });
      need -= k; i++;
    }
  }
  return out;
}
// 足軽大将（kaito 11/1 の手本 docs/ashigaru_ref_1101 の ref5・6）：武将のいない足軽の組の、名の無い侍の一人目を足軽大将の姿に（units.js の o.ashiTaisho）
function taishoList(list) {
  if (!Array.isArray(list) || list.some((e) => e && e.type === 'busho') || !list.some((e) => e && ['ashigaru', 'gun', 'bow'].includes(e.type))) return list;
  const i = list.findIndex((e) => e && e.type === 'samurai' && e.n >= 1 && !(e.o && (e.o.name || e.o.hat || e.o.armor)));
  if (i < 0) return list;
  const e = list[i], out = list.slice();
  out.splice(i, 1, { ...e, n: 1, o: { ...(e.o || {}), ashiTaisho: 1 } }, ...(e.n > 1 ? [{ ...e, n: e.n - 1 }] : []));
  return out;
}
export function enemyGroup(rt, o, list) {
  const { ambush, ...go } = o;
  const anchor = (!go.fixed && go.anchor) ? hiddenFrom(rt, go.anchor) : go.anchor;
  const g = rt.army.addGroup({ team: 1, order: 'hold', aggro: 8, ...go, ...(anchor ? { anchor } : {}) });
  rt.army.spawn(g, taishoList(horseList(rt, mixList(rt, list, false, g), g, true)));
  const lead = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
  if (lead) g.leader = lead;
  if (ambush) { g.ambush = true; for (const u of g.units) u._crouch = true; }
  return g;
}
// 名のある武将の護衛（同じ隊の侍・騎馬）は、その武将の家の具足の色と威に揃える（馬廻・旗本が大将と同じ色で固まって見えるよう）
// 足軽は家の揃いのまま。list の中で、すでに色を決めてある者（o.armor・o.lace）はそのまま
function escortLook(list) {
  const lead = list.find((e) => e && e.type === 'busho' && e.o && e.o.name && GENERALS[e.o.name.replace(/^.* /, '')]);
  if (!lead) return list;
  const gd = GENERALS[lead.o.name.replace(/^.* /, '')];
  return list.map((e) => (e === lead || !e || (e.type !== 'samurai' && e.type !== 'cavalry')) ? e
    : { ...e, o: { armor: gd.armor, lace: gd.lace, ...(e.o || {}) } });
}
// 本物の味方の兵は、どの戦でも6〜7割ほどに（kaito 10/1「味方が多すぎてごちゃごちゃ。もう少し軽くてもいい」）
//   名のある武将（o.name）・o.keep を付けた兵・o.fullStrength を付けた隊（大殿の旗本など）は減らさない
const ALLY_SCALE = 0.65;
function scaleAllyList(list, full) {
  if (full) return list;
  return list.map((e) => {
    if (!e || !(e.n > 1) || (e.o && (e.o.name || e.o.keep))) return e;
    return { ...e, n: Math.max(1, Math.round(e.n * ALLY_SCALE)) };
  });
}
export function allyGroup(rt, o, list) {
  const { fullStrength, ...go } = o || {};
  // 味方の新手も、戦の定義が決めた持ち場から進む。
  const anchor = (!go.fixed && go.anchor) ? hiddenFrom(rt, go.anchor) : go.anchor;
  const g = rt.army.addGroup({ team: 0, faction: 'oda', order: 'hold', aggro: 9, ...go, ...(anchor ? { anchor } : {}) });
  rt.army.spawn(g, taishoList(escortLook(horseList(rt, mixList(rt, scaleAllyList(list, fullStrength), true, g), g))));
  // 名のある武将の隊は、戦の秒数・合図で動く。自由な判断は g.ai = true で明示する。
  g.historicalOrders = list.some((e) => e.o && e.o.name && (e.type === 'busho' || e.type === 'samurai'));
  return g;
}
// 家来が遊び手を呼ぶ名。信長で遊ぶ時は「殿」（家来が主君を呼び捨てにしない。lord.js が「殿殿」などを整える）
export const nm = (rt) => (rt.G.lord ? '殿' : rt.G.name);
export const centerOf = (g) => () => { if (!g) return null; const c = g.center(); return { x: c.x, z: c.z }; };
export const unitPos = (u) => () => (u?.alive ? { x: u.pos.x, z: u.pos.z, y: u.pos.y } : null);

// 狭間（塀の撃つ穴）の並び：長さ len の区画を step ごとに割り、その真ん中（0〜1 の割合）に穴を開ける
// 塀の形（穴の見た目）と、兵が立って撃つ所（units.js の samasOf）は、どちらもこれで決める
export function samaTs(len, step = 1.5) {
  const n = Math.max(1, Math.round(len / step));
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}
// 形の上に描いた穴（{ x, z, y, kind }）を、いちばん近い塀の区画の狭間にする（塀の形を別に描く城で使う）
export function attachSama(segs, holes) {
  for (const s of segs) s.sama = s.sama || [];
  for (const h of holes) {
    let best = null, bd = 0.35;
    for (const s of segs) { const d = segDist(h.x, h.z, s.seg); if (d < bd) { bd = d; best = s; } }
    if (!best) continue;
    const [ax, az, bx, bz] = best.seg, L = Math.hypot(bx - ax, bz - az) || 1;
    best.sama.push({ s: best, x: h.x, z: h.z, y: h.y, kind: h.kind, nx: -(bz - az) / L, nz: (bx - ax) / L, by: null });
  }
}
function segDist(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

// 塀・柵の線：点の並び pts（[[x,z],…]）を区画に分けて、当たりと体力のある柵にする
// o: { team = 0, hp = 400, segLen = 6, closed = false, gaps = [区画の番号…], name = '柵', mesh = palisade, tall }
// o.sama：狭間の間合い（m）。塀の形（mesh）には meshOpt.samaStep として渡すので、同じ所に穴を描く。o.h：塀の高さ（上越しに撃てるか・矢が越えるか）
// 区画の外向き（nx, nz）は、点の並びの左手側。閉じた輪を時計回りに並べると外向きになる
export function wallLine(rt, pts, o = {}) {
  const { team = 0, hp = 400, segLen = 6, closed = false, gaps = [], name = '柵', side = '' } = o;
  const out = [];
  const P = closed ? [...pts, pts[0]] : pts;
  let k = 0;
  // 普通の柵の線は、区画（壊れる単位）を保ったまま一つの束で描く（区画ごとに一回ずつ描いていた）
  const own = !o.mesh && !(o.meshOpt && o.meshOpt.batch) ? makeSimpleBatch() : null;
  if (own) o = { ...o, meshOpt: { ...(o.meshOpt || {}), batch: own } };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / segLen));
    for (let j = 0; j < n; j++, k++) {
      if (gaps.includes(k)) continue;
      const t0 = j / n, t1 = (j + 1) / n;
      const seg = [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1];
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const s = rt.army.addStruct({ seg, side, nx, nz, hp, maxHp: hp, team, name, idx: k });
      if (o.sama) s.samaStep = o.sama;
      if (o.h) s.h = o.h;
      s.mesh = (o.mesh || palisade)(rt.world, seg, o.sama ? { ...(o.meshOpt || {}), samaStep: o.sama } : o.meshOpt || {});
      if (!s.mesh.isBatchedPart) rt.scene.add(s.mesh);
      out.push(s);
    }
  }
  if (own) finalizeSimpleBatch(rt, own);
  return out;
}
// 円い囲い（砦・馬出）。gapAt：口を開ける向き（ラジアン、0 = +z）、gapW：口の幅（ラジアン）
export function ringWall(rt, cx, cz, r, o = {}) {
  const n = Math.max(6, Math.round((2 * Math.PI * r) / (o.segLen || 5)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (o.gapAt !== undefined) {
      let d = Math.abs(((a - o.gapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < (o.gapW || 0.5) / 2) { pts.push(null); continue; }
    }
    pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  // 口のところで線を切って、いくつかの線にする
  const runs = []; let cur = [];
  const order = o.gapAt !== undefined ? rotateToGap(pts) : [...pts, pts[0]];
  for (const p of order) { if (!p) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p); }
  if (cur.length > 1) runs.push(cur);
  return runs.flatMap((pp) => wallLine(rt, pp, { ...o, segLen: 999 }));
}
function rotateToGap(pts) {
  const i = pts.indexOf(null);
  return [...pts.slice(i), ...pts.slice(0, i), null];
}
// 壊れた柵の跡（切り株）を置く
export function brokenWall(rt, s) {
  s.stumps = stumps(rt.world, s.seg);
  rt.scene.add(s.stumps);
}
// 柵の破れ目を探す（攻め手が入り込む所）
export function nearestGap(segs, x, z) {
  let gap = null, gd = Infinity;
  for (const s of segs) {
    if (s.alive) continue;
    const d = Math.hypot(x - (s.seg[0] + s.seg[2]) / 2, z - (s.seg[1] + s.seg[3]) / 2);
    if (d < gd) { gd = d; gap = s; }
  }
  return gap;
}
