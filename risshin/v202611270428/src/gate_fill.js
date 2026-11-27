// K665・K666 門の脇の隙間を埋める（kaito 11/25 伏見の大手「こういう隙間とかおかしい」・「城とか砦系はこういう隙間がないか全部チェック」）
//   戦の間（組み立てと段の変わり目）に gap_probe.js が集めた塀の線と門の柱から、門の柱（櫓門は脇の台）の外の端と、その脇の一番近い塀の間が
//   0.3m より空き、7.5m 内（門の前後へは 5m 内）に塀がある所へ、同じ種類の短い塀（袖塀）を一本足す。門の柱より外（通り道の外）だけを結ぶので、
//   門の通れる幅は変わらない。当たりは本人だけ（寄せ手・守り手の道と段の運びは今までどおり。伏見の石垣の上の塀と同じ）。
import { dobei, palisade, castleBoardFence, ishigaki, solidSeg, makeKitBatch, finalizeKitBatch } from './props.js';

const MAXFILL = 7.5, MAXN = 5, THICK = 0.35, GAP = 0.3;
// 門の柱 P から見て、門の脇（門の中心から sd の側へ half-0.2 より外）にある塀 w の一番近い点
// maxN：門の前後（門の向き）へ離れてよい幅（袖塀を引く時は MAXN。道具の物差しは限り無し）
function nearSide(P, G, tx, tz, sd, half, w, maxN = Infinity) {
  let best = null;
  const nx = -tz, nz = tx;
  // 一次の式 f(t) = fa + (fb - fa) t が lo 以上 hi 以下の t の範囲へ [t0, t1] を狭める
  const clip = (fa, fb, lo, hi, r) => {
    if (Math.abs(fb - fa) < 1e-9) return fa >= lo && fa <= hi;
    let ta = (lo - fa) / (fb - fa), tb = (hi - fa) / (fb - fa);
    if (ta > tb) [ta, tb] = [tb, ta];
    r[0] = Math.max(r[0], ta); r[1] = Math.min(r[1], tb);
    return r[0] <= r[1];
  };
  for (let j = 0; j + 1 < w.pts.length; j++) {
    const [ax, az] = w.pts[j], [bx, bz] = w.pts[j + 1];
    const la = sd * ((ax - G.x) * tx + (az - G.z) * tz), lb = sd * ((bx - G.x) * tx + (bz - G.z) * tz), L0 = half - 0.2;
    const r = [0, 1];
    if (!clip(la, lb, L0, Infinity, r)) continue;
    if (maxN < Infinity && !clip((ax - G.x) * nx + (az - G.z) * nz, (bx - G.x) * nx + (bz - G.z) * nz, -maxN, maxN, r)) continue;
    const [t0, t1] = r;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(t0, Math.min(t1, ((P[0] - ax) * dx + (P[1] - az) * dz) / L2));
    const q = [ax + dx * t, az + dz * t], d = Math.hypot(q[0] - P[0], q[1] - P[1]);
    if (!best || d < best.d) best = { d, q };
  }
  return best;
}

// 門の脇（柱の内の端から外 0.3m まで）を塀が横切るか突き当たる時は、その脇は閉じている（山中の櫓門の脇の台に柵が当たる所）
function abutsSide(G, tx, tz, sd, half, w) {
  const ax = G.x + sd * tx * half * 0.3, az = G.z + sd * tz * half * 0.3, bx = G.x + sd * tx * (half + 0.3), bz = G.z + sd * tz * (half + 0.3);
  const cr = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  for (let j = 0; j + 1 < w.pts.length; j++) {
    const [cx, cz] = w.pts[j], [dx, dz] = w.pts[j + 1];
    const d1 = cr(cx, cz, dx, dz, ax, az), d2 = cr(cx, cz, dx, dz, bx, bz), d3 = cr(ax, az, bx, bz, cx, cz), d4 = cr(ax, az, bx, bz, dx, dz);
    if (Math.abs(d1) < 1e-6 && Math.abs(d2) < 1e-6) {   // 門の線の上に並ぶ塀：門の脇の幅に重なる時だけ
      const u = (px, pz) => (px - G.x) * tx * sd + (pz - G.z) * tz * sd, lo = half * 0.3, hi = half + 0.3;
      if (Math.max(u(cx, cz), u(dx, dz)) >= lo && Math.min(u(cx, cz), u(dx, dz)) <= hi) return true;
      continue;
    }
    if (d1 * d2 <= 0 && d3 * d4 <= 0) return true;
  }
  return false;
}

// 道具（tools/k666_gaps.mjs）の物差し：門ごとに、両脇の柱から脇の一番近い塀までの隙間（m。塀の厚みを引く）
export function gateSides(rec) {
  const out = [], seen = new Set();
  for (const g of rec.gates) {
    const key = Math.round(g.x * 2) + ',' + Math.round(g.z * 2);
    if (seen.has(key)) continue; seen.add(key);
    const tx = Math.cos(g.rot), tz = -Math.sin(g.rot), side = [];
    for (const sd of [-1, 1]) {
      const P = [g.x + sd * tx * g.half, g.z + sd * tz * g.half];
      let best = null, bw = null;
      for (const w of rec.walls) { if (abutsSide(g, tx, tz, sd, g.half, w)) { best = { d: 0 }; bw = w; break; } const b = nearSide(P, g, tx, tz, sd, g.half, w); if (b && (!best || b.d < best.d)) { best = b; bw = w; } }
      side.push(best ? { d: +Math.max(0, best.d - THICK).toFixed(2), kind: bw.kind } : { d: 999, kind: '' });
    }
    out.push({ kind: g.kind, x: +g.x.toFixed(1), z: +g.z.toFixed(1), side });
  }
  return out;
}

// 塀と門の記録 rec（{walls, gates}）から、埋める袖塀の並びを返す
export function gateFills(rec, from = 0) {
  const out = [], seen = new Set();
  for (const g of rec.gates.slice(from)) {
    const key = Math.round(g.x * 2) + ',' + Math.round(g.z * 2);
    if (seen.has(key)) continue; seen.add(key);
    const tx = Math.cos(g.rot), tz = -Math.sin(g.rot);
    for (const sd of [-1, 1]) {
      const P = [g.x + sd * tx * g.half, g.z + sd * tz * g.half];
      if (rec.walls.some((w) => abutsSide(g, tx, tz, sd, g.half, w))) continue;
      let best = null, bw = null;
      for (const w of rec.walls) { const b = nearSide(P, g, tx, tz, sd, g.half, w, MAXN); if (b && (!best || b.d < best.d)) { best = b; bw = w; } }
      if (!best || best.d - THICK <= GAP || best.d > MAXFILL) continue;
      out.push({ a: P, b: best.q, kind: bw.kind, baseY: bw.baseY });
    }
  }
  return out;
}

// K666 継ぎ目・角：塀の端が同じ層（石垣は除く）のほかの塀に触れず、0.3〜1m（兵の通れない幅）離れて切れている所を、端から
//   相手の塀の一番近い点まで同じ種類の短い塀で継ぐ。1m より広い切れ目は通り口として残す（兵の通り道は変えない）。門の柱の 4m 内は門の袖塀が受け持つ
export const SEAM_MIN = 0.3, SEAM_MAX = 1.0;
const segNear = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); const q = [ax + dx * t, az + dz * t]; return { d: Math.hypot(q[0] - px, q[1] - pz), q }; };
export function wallSeams(rec, lo = SEAM_MIN, hi = SEAM_MAX) {
  const out = [], seen = new Set();
  const nearGate = (x, z) => rec.gates.some((q) => Math.hypot(q.x - x, q.z - z) < q.half + 4);
  rec.walls.forEach((w, wi) => {
    if (w.kind === 'ishigaki') return;
    for (const e of [w.pts[0], w.pts[w.pts.length - 1]]) {
      let best = null, bw = null;
      rec.walls.forEach((v, vi) => {
        if (vi === wi || v.kind === 'ishigaki') return;
        for (let j = 0; j + 1 < v.pts.length; j++) { const r = segNear(e[0], e[1], ...v.pts[j], ...v.pts[j + 1]); if (!best || r.d < best.d) { best = r; bw = v; } }
      });
      if (!best || best.d <= lo || best.d > hi || nearGate(e[0], e[1])) continue;
      const k = Math.round(e[0] * 2) + ',' + Math.round(e[1] * 2);
      if (seen.has(k)) continue; seen.add(k);
      out.push({ a: [e[0], e[1]], b: best.q, d: best.d, kind: w.kind, other: bw.kind, baseY: w.baseY });
    }
  });
  return out;
}
// 石垣どうしの継ぎ目（0.3〜1m）：端の石垣と同じ作り（記録した world と引数）で、継ぎ目に両の石垣へ 0.25m ずつ食い込む短い石垣を積む
export function stoneSeams(rec, lo = SEAM_MIN, hi = SEAM_MAX) {
  const out = [], seen = new Set(), st = rec.walls.filter((w) => w.kind === 'ishigaki');
  const nearGate = (x, z) => rec.gates.some((q) => Math.hypot(q.x - x, q.z - z) < q.half + 4);
  st.forEach((w, wi) => {
    for (const [e, first] of [[w.pts[0], true], [w.pts[w.pts.length - 1], false]]) {
      let best = null;
      st.forEach((v, vi) => { if (vi !== wi) for (let j = 0; j + 1 < v.pts.length; j++) { const r = segNear(e[0], e[1], ...v.pts[j], ...v.pts[j + 1]); if (!best || r.d < best.d) best = r; } });
      if (!best || best.d <= lo || best.d > hi || nearGate(e[0], e[1])) continue;
      const k = Math.round(e[0] * 2) + ',' + Math.round(e[1] * 2);
      if (seen.has(k)) continue; seen.add(k);
      // 石の面の向き（左手が外）を端の石垣と同じにする：始めの端なら継ぎ目→端、終わりの端なら端→継ぎ目
      const a = first ? best.q : [e[0], e[1]], b = first ? [e[0], e[1]] : best.q;
      out.push({ a, b, d: best.d, kind: 'ishigaki', other: 'ishigaki', meta: w.meta });
    }
  });
  return out;
}
function buildStone(rt, f, batch) {
  if (!f.meta || !f.meta.world) return false;
  const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const pts = [[f.a[0] - ux * 0.25, f.a[1] - uz * 0.25], [f.b[0] + ux * 0.25, f.b[1] + uz * 0.25]];
  const m = ishigaki(f.meta.world, pts, { ...f.meta.o, batch, k666Fill: true, scene: rt.scene });
  if (m && !m.isBatchedPart && rt.scene) rt.scene.add(m);
  return true;
}
function buildFill(rt, f, batch) {
  if (f.kind === 'ishigaki' && f.meta) return buildStone(rt, f, batch);   // 門の袖塀（石垣の脇）は今までどおり石垣の上の土塀
  const W = rt.world, seg = [f.a[0], f.a[1], f.b[0], f.b[1]];
  if (f.kind === 'palisade' || f.kind === 'koshisaku') { if (rt.scene) rt.scene.add(palisade(W, seg)); }
  else if (f.kind === 'itabei') { if (rt.scene) rt.scene.add(castleBoardFence(W, seg)); }
  else dobei(W, seg, { batch, shikkui: f.kind !== 'dobei' || f.baseY != null, ...(f.baseY != null ? { baseY: f.baseY } : {}) });
  const y = f.baseY != null ? f.baseY : W.heightAt((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2);
  Object.assign(solidSeg(seg[0], seg[1], seg[2], seg[3], THICK), { yTop: y + 2.4, playerOnly: true });
}

// 組み終えた時に一度、その後は段の変わり目などで門が足された時（battle.js の update が数を見る）に、新しい門だけを埋める
export function fillGateGaps(rt) {
  const rec = globalThis.__K665;
  if (!rec || !rt.world || (rec.owner && rec.owner !== rt)) return 0;
  // 継ぎ目は組み終えた時に一度（塀の数が増えた時だけ見直す）
  if (rec.walls.length && (rec.seamWalls || 0) < rec.walls.length) {
    const seams = [...wallSeams(rec), ...stoneSeams(rec)].filter((f) => !(rec.seamKeys || (rec.seamKeys = new Set())).has(Math.round(f.a[0] * 2) + ',' + Math.round(f.a[1] * 2)));
    for (const f of seams) rec.seamKeys.add(Math.round(f.a[0] * 2) + ',' + Math.round(f.a[1] * 2));
    rt.seamFills = (rt.seamFills || 0) + seams.length;
    if (seams.length) { const batch = makeKitBatch(); for (const f of seams) buildFill(rt, f, batch); if (rt.scene) finalizeKitBatch(rt, batch); }
    rec.seamWalls = rec.walls.length;
  }
  if ((rec.done || 0) >= rec.gates.length) return 0;
  const from = rec.done || 0; rec.done = rec.gates.length;
  const fills = rec.walls.length ? gateFills(rec, from) : [];
  rt.gateFills = (rt.gateFills || 0) + fills.length;   // 道具が数える（足した袖塀の数）
  if (!fills.length) return 0;
  const batch = makeKitBatch();
  for (const f of fills) buildFill(rt, f, batch);
  if (rt.scene) finalizeKitBatch(rt, batch);
  return fills.length;
}
