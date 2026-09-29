// 戦の定義で使う共通の道具（battles.js と、戦ごとの b_*.js から使う）
import { palisade, stumps } from './props.js';
import { GENERALS } from './units_data.js';

export const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);

export function enemyGroup(rt, o, list) {
  const g = rt.army.addGroup({ team: 1, order: 'hold', aggro: 8, ...o });
  rt.army.spawn(g, list);
  const lead = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
  if (lead) g.leader = lead;
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
export function allyGroup(rt, o, list) {
  const g = rt.army.addGroup({ team: 0, faction: 'oda', order: 'hold', aggro: 9, ...o });
  rt.army.spawn(g, escortLook(list));
  return g;
}
// 家来が遊び手を呼ぶ名。信長で遊ぶ時は「殿」（家来が主君を呼び捨てにしない。lord.js が「殿殿」などを整える）
export const nm = (rt) => (rt.G.lord ? '殿' : rt.G.name);
export const centerOf = (g) => () => { const c = g.center(); return { x: c.x, z: c.z }; };
export const unitPos = (u) => () => (u.alive ? { x: u.pos.x, z: u.pos.z, y: u.pos.y } : null);

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
      rt.scene.add(s.mesh);
      out.push(s);
    }
  }
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
