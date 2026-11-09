import { distToPolyline } from './world_common.js';

// ======================================================================
// 城と砦の縄張り（乱数の種で城ごとに変わる。同じ種なら毎回同じ）
// castlePlan({ seed, x, z, kind: 'fort'|'castle', n, r, base })：頂の主郭から、尾根と斜面へ段違いの曲輪を枝分かれに重ね、
//   曲輪の間を折れる坂道・二重の門（枡形）・土橋・堀切・空堀でつなぐ。返す物：{ kuruwa[], paths[], gates[], moats[], cuts[] }
//   kuruwa：{ x, z, w, d, rot, lv（主郭からの下がり m）, h（その面の高さ）, kind: 'hon'|'ni'|'koshi'|'umadashi', parent }
//   paths：坂道の折れ点の並び [[x, z], …]（下の曲輪の門から上の曲輪の門へ。途中で直角に折れ、上の曲輪の縁の下を通る＝横矢）
//   gates：{ x, z, rot, k（その曲輪）, masu（枡形の内の門なら true） }
// World は def.castle があれば、この縄張りで地形を段にする（曲輪は平ら、縁は急な土塁の斜面、堀は窪み、道は坂）
// ======================================================================
export function castlePlan(o) {
  let sd = (o.seed || 1) * 2654435761 >>> 0;
  const R = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  const fort = o.kind === 'fort', cx = o.x || 0, cz = o.z || 0, rad = o.r || (fort ? 40 : 70);
  const N = o.n || (fort ? 4 + Math.floor(R() * 2) : 7 + Math.floor(R() * 4));
  const top = (o.base || 0) + (o.rise ?? (fort ? 5 : 14));
  const rot0 = R() * Math.PI * 2;
  const K = [];
  const hon = { x: cx, z: cz, w: fort ? 20 : 26 + R() * 6, d: fort ? 15 : 18 + R() * 5, rot: rot0, lv: 0, kind: 'hon', parent: -1 };
  K.push(hon);
  const corners = (k, pad = 0) => { const c = Math.cos(k.rot), s2 = Math.sin(k.rot), hw = k.w / 2 + pad, hd = k.d / 2 + pad; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [k.x + a * c + b * s2, k.z - a * s2 + b * c]); };
  const overlap = (a, b, pad) => Math.hypot(a.x - b.x, a.z - b.z) < (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2 * 0.72 + pad;
  // 尾根の向き：主郭から二、三本の尾根が下る（曲輪はその上に段々に並ぶ）
  const ridges = [rot0, rot0 + Math.PI + (R() - 0.5) * 0.8, rot0 + Math.PI / 2 + (R() - 0.5) * 0.6].slice(0, fort ? 2 : 3);
  let tries = 0;
  while (K.length < N && tries++ < 400) {
    // 親：尾根の先の曲輪を好む（段が尾根に沿って続く）。ときどき脇へ腰曲輪
    const pi = R() < 0.65 ? K.length - 1 - Math.floor(R() * Math.min(3, K.length)) : Math.floor(R() * K.length);
    const P = K[Math.max(0, pi)];
    const side = R() < 0.3 || P.kind === 'koshi';
    const ridge = P.ridge ?? ridges[K.length % ridges.length];
    const ang = side ? ridge + (R() < 0.5 ? 1 : -1) * Math.PI / 2 : ridge + (R() - 0.5) * 0.7;
    const small = side || R() < 0.25;
    const w = small ? (fort ? 9 : 12) + R() * 6 : (fort ? 13 : 16) + R() * 10, d = small ? 6 + R() * 4 : (fort ? 9 : 11) + R() * 7;
    const gap = (fort ? 5 : 7) + R() * 5;
    const dist = Math.max(P.w, P.d) / 2 + Math.max(w, d) / 2 + gap;
    const k = { x: P.x + Math.sin(ang) * dist, z: P.z + Math.cos(ang) * dist, w, d, rot: ang + (R() - 0.5) * 0.5 + (R() < 0.5 ? Math.PI / 2 : 0),
      lv: P.lv + (fort ? 1.6 + R() * 1.4 : 2.5 + R() * 2.5), kind: side ? 'koshi' : K.length === 1 ? 'ni' : 'ni', parent: K.indexOf(P), ridge: side ? P.ridge ?? ridge : ridge };
    if (Math.hypot(k.x - cx, k.z - cz) > rad) continue;
    if (K.some((q) => overlap(q, k, 2))) continue;
    K.push(k);
  }
  // 馬出：一番下の曲輪の外に、小さな半円の出丸（門の前を守る）
  const low = K.reduce((a, b) => (b.lv > a.lv ? b : a));
  { const ang = Math.atan2(low.x - cx, low.z - cz), dist = Math.max(low.w, low.d) / 2 + 7;
    const m = { x: low.x + Math.sin(ang) * dist, z: low.z + Math.cos(ang) * dist, w: 9, d: 6, rot: ang, lv: low.lv + 1, kind: 'umadashi', parent: K.indexOf(low) };
    if (!K.some((q) => q !== low && overlap(q, m, 1))) K.push(m); }
  for (const k of K) k.h = top - k.lv;
  // 門と坂道：子の曲輪の、親に向いた縁の真ん中から出て、一度直角に折れ、親の縁の門へ（親の縁の下を通る＝上から横矢）
  const gates = [], paths = [];
  const edgeGate = (k, tx, tz) => {
    // k の四辺のうち (tx, tz) に向いた辺の、少し片寄った所
    const c = Math.cos(k.rot), s2 = Math.sin(k.rot), lx = (tx - k.x) * c - (tz - k.z) * s2, lz = (tx - k.x) * s2 + (tz - k.z) * c;
    const ax = Math.abs(lx) / (k.w / 2), az = Math.abs(lz) / (k.d / 2), off = (R() - 0.5) * 0.5;
    let gx, gz, rot;
    if (ax > az) { gx = Math.sign(lx) * k.w / 2; gz = off * k.d / 2; rot = k.rot + Math.PI / 2; } else { gx = off * k.w / 2; gz = Math.sign(lz) * k.d / 2; rot = k.rot; }
    return { x: k.x + gx * c + gz * s2, z: k.z - gx * s2 + gz * c, rot };
  };
  K.forEach((k, i) => {
    if (k.parent < 0) return;
    const P = K[k.parent];
    const a = edgeGate(k, P.x, P.z), b = edgeGate(P, k.x, k.z);
    gates.push({ ...a, k: i }, { ...b, k: k.parent, masu: P.kind === 'hon' });
    // 折れ点：a から親の縁に沿って横へ出てから b へ（L 字。遠ければ二度折れる）
    const mid = R() < 0.5 ? [a.x, b.z] : [b.x, a.z];
    const pts = [[a.x, a.z], mid, [b.x, b.z]];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 22) { const m2 = [(a.x + mid[0]) / 2 + (R() - 0.5) * 6, (a.z + mid[1]) / 2 + (R() - 0.5) * 6]; pts.splice(1, 0, m2); }
    paths.push({ pts, from: i, to: k.parent, lv0: k.h, lv1: P.h });
  });
  // 大手：一番下の曲輪から、外（主郭と反対）へ下る道
  { const k = K.reduce((a, b) => (b.lv > a.lv ? b : a)), ang = Math.atan2(k.x - cx, k.z - cz);
    const g = edgeGate(k, k.x + Math.sin(ang) * 99, k.z + Math.cos(ang) * 99);
    gates.push({ ...g, k: K.indexOf(k), ote: true });
    const out = [g.x + Math.sin(ang) * 18, g.z + Math.cos(ang) * 18];
    paths.push({ pts: [[g.x, g.z], [g.x + Math.sin(ang + 0.9) * 8, g.z + Math.cos(ang + 0.9) * 8], out], from: -1, to: K.indexOf(k), lv0: o.base || 0, lv1: k.h, ote: true }); }
  // 堀切：尾根の上で、曲輪と曲輪の間を断つ溝（道の所は土橋で渡る）。空堀：主郭のまわり
  const cuts = [];
  K.forEach((k, i) => { if (k.parent >= 0 && k.kind !== 'koshi' && R() < 0.6) { const P = K[k.parent]; const mx = (k.x + P.x) / 2, mz = (k.z + P.z) / 2, ang = Math.atan2(k.x - P.x, k.z - P.z); cuts.push({ x: mx, z: mz, rot: ang + Math.PI / 2, len: Math.max(k.w, k.d) * 0.9 + 6, w: 3.2 }); } });
  const moats = [{ pts: corners(hon, 4.5), closed: true, w: 3 }];
  return { year: o.year, stone: o.stone, tenshu: o.tenshu, kind: o.kind || 'castle', seed: o.seed || 1, x: cx, z: cz, top, base: o.base || 0, kuruwa: K, gates, paths, cuts, moats, corners };
}
// 曲輪の縁までの近さ（内は負）
function rectDist(k, x, z) {
  const c = Math.cos(k.rot), s = Math.sin(k.rot), lx = (x - k.x) * c - (z - k.z) * s, lz = (x - k.x) * s + (z - k.z) * c;
  const dx = Math.abs(lx) - k.w / 2, dz = Math.abs(lz) - k.d / 2;
  return Math.max(dx, dz) > 0 ? Math.hypot(Math.max(0, dx), Math.max(0, dz)) : Math.max(dx, dz);
}
export function castleInside(plan, x, z, pad = 0) { return plan.kuruwa.some((k) => rectDist(k, x, z) < pad); }
// 縄張りで地形を段にする：曲輪の面は平ら、縁は急な斜面（1m 下がるのに 0.8m）、堀切と空堀は窪み、坂道は両端の高さを結ぶ坂
export function castleHeight(plan, x, z, h0) {
  let h = h0, inK = false;
  for (const k of plan.kuruwa) {
    const d = rectDist(k, x, z);
    if (d < 0) { h = Math.max(h, k.h); inK = true; }
    else h = Math.max(h, k.h - d * 1.25);
  }
  // 坂道（幅 2.6m）：道の上では、道の両端の高さの間をなめらかに結ぶ（段を登れるように）
  for (const p of plan.paths) {
    let best = 9, bt = 0, acc = 0, tot = 0;
    for (let i = 0; i < p.pts.length - 1; i++) tot += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
      const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
      if (d < best) { best = d; bt = (acc + t * L) / tot; }
      acc += L;
    }
    if (best < 2.6) { const ph = p.lv0 + (p.lv1 - p.lv0) * bt; const k = best < 1.4 ? 1 : 1 - (best - 1.4) / 1.2; if (!inK || best < 1.4) h = h * (1 - k) + ph * k; }
  }
  // 堀切・空堀（道の所は土橋として残す）
  const onPath = (px, pz) => plan.paths.some((p) => distToPolyline(px, pz, p.pts) < 2);
  for (const c of plan.cuts) {
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot), lx = (x - c.x) * cs - (z - c.z) * sn, lz = (x - c.x) * sn + (z - c.z) * cs;
    if (Math.abs(lx) < c.len / 2 && Math.abs(lz) < c.w && !onPath(x, z)) h -= 2.4 * (1 - Math.abs(lz) / c.w);
  }
  for (const m of plan.moats) {
    const pts = m.closed ? [...m.pts, m.pts[0]] : m.pts, d = distToPolyline(x, z, pts);
    if (d < m.w && !onPath(x, z)) h -= 2.0 * (1 - d / m.w);
  }
  return h;
}

