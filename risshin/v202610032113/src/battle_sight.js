// 画面の知らせ用の見通し。戦う兵の判断や保存には触れない。
import { weatherSight, weatherSees } from './weather_gameplay.js';
const cache = new WeakMap();
function cross(ax, az, bx, bz) { return ax * bz - az * bx; }
function cuts(a, b, x0, z0, x1, z1) {
  const dx = b.x - a.x, dz = b.z - a.z, ex = x1 - x0, ez = z1 - z0;
  const den = cross(dx, dz, ex, ez);
  if (Math.abs(den) < 0.00001) return false;
  const t = cross(x0 - a.x, z0 - a.z, ex, ez) / den;
  const s = cross(x0 - a.x, z0 - a.z, dx, dz) / den;
  return t > 0.001 && t < 0.999 && s >= 0 && s <= 1;
}
function boxCuts(ax, az, bx, bz, hw, hd) {
  let lo = 0.001, hi = 0.999;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 0.00001) { if (Math.abs(ax) > hw) return false; }
  else { const a = (-hw - ax) / dx, b = (hw - ax) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  if (Math.abs(dz) < 0.00001) { if (Math.abs(az) > hd) return false; }
  else { const a = (-hd - az) / dz, b = (hd - az) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  return lo <= hi;
}
// 描いている煙の位置・高さ・濃さから、視線上の重なりを数える。
// 既存の入れ物と数値だけを使い、呼ぶたびに物を作らない。
function veilDepth(H, a, p, ay, by, d) {
  if (!H || d < 0.01) return 0;
  const dx = p.x - a.x, dz = p.z - a.z, d2 = d * d;
  let depth = 0;
  for (let i = 0; i < H.list.length; i++) {
    const q = H.list[i], size = q.size || q.s0, r = size * 0.8;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / d2));
    const ex = a.x + dx * t - q.x, ez = a.z + dz * t - q.z;
    const side2 = ex * ex + ez * ez;
    if (side2 >= r * r) continue;
    const cy = H.ctr[i * 3 + 1], y = ay + (by - ay) * t;
    const height = size * (H.low ? 0.25 : 0.275);
    if (Math.abs(y - cy) >= height) continue;
    depth += H.dat[i * 3 + 1] * Math.min(d, 2 * Math.sqrt(r * r - side2))
      * (1 - Math.abs(y - cy) / height);
  }
  return depth;
}
export function sightPoint(rt, p, limit = 170) {
  if (!p) return false;
  const a = rt.player.u.pos, W = rt.world;
  const dx = p.x - a.x, dz = p.z - a.z;
  if (dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw) < 0) return false;
  const d = Math.hypot(dx, dz);
  const forward = dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw);
  const side = dx * Math.cos(rt.player.yaw) - dz * Math.sin(rt.player.yaw);
  const halfView = Math.atan(Math.tan((rt.camera?.fov || 60) * Math.PI / 360) * (rt.camera?.aspect || 1.8));
  if (d > 0.2 && Math.abs(Math.atan2(side, forward)) > halfView) return false;
  if (d > Math.min(limit, weatherSight(W), W.vis ?? 680) || !weatherSees(W, a, p)) return false;
  // 煙の中は近く以外を知らせない。燃える物の配列をそのまま読む。
  if (d > 25) for (const f of rt.army.burning || []) {
    if (!f.fireF) continue;
    const x = f.seg ? (f.seg[0] + f.seg[2]) / 2 : f.x;
    const z = f.seg ? (f.seg[1] + f.seg[3]) / 2 : f.z;
    if (Math.hypot(p.x - x, p.z - z) < 14 + Math.min(90, f.burnT || 0) * 0.28) return false;
  }
  const ay = a.y + 1.6, by = (p.y ?? W.heightAt(p.x, p.z)) + 1.6;
  if (veilDepth(W.haze, a, p, ay, by, d) + veilDepth(W.dustVeil, a, p, ay, by, d) > 0.45) return false;
  const steps = Math.max(2, Math.min(24, Math.ceil(d / 6)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (p.x - a.x) * t, z = a.z + (p.z - a.z) * t;
    if (W.heightAt(x, z) > ay + (by - ay) * t - 0.3) return false;
    for (const gv of W.def.groves || []) if (d > 25 && Math.hypot(x - gv.x, z - gv.z) < gv.r) return false;
  }
  for (const s of rt.army.structs || []) {
    if (!s.alive || !s.seg || /柵|逆茂木/.test(s.name || '')) continue;
    if (cuts(a, p, ...s.seg)) return false;
  }
  for (const w of rt.army.solids || []) {
    if (w.struct && !w.struct.alive || w.k !== 'r') continue;
    if (w.yTop != null && Math.min(ay, by) > w.yTop || w.yBot != null && Math.max(ay, by) < w.yBot) continue;
    const ax = a.x - w.x, az = a.z - w.z, bx = p.x - w.x, bz = p.z - w.z;
    if (boxCuts(ax * w.c - az * w.s, ax * w.s + az * w.c, bx * w.c - bz * w.s, bx * w.s + bz * w.c, w.hw, w.hd)) return false;
  }
  return true;
}
export function sightRef(rt, ref, p) {
  if (!ref || !p) return false;
  let c = cache.get(ref);
  if (!c) { c = { rt: null, t: -99, seen: false }; cache.set(ref, c); }
  if (c.rt !== rt || rt.t < c.t || rt.t - c.t >= 0.2) {
    c.rt = rt; c.t = rt.t; c.seen = sightPoint(rt, p);
  }
  return c.seen;
}
export function sightUnit(rt, u) {
  if (!u.alive || u.offscreen || u.mesh?.visible === false) return false;
  const a = rt.player.u.pos, dx = u.pos.x - a.x, dz = u.pos.z - a.z;
  if (dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw) < 0) return false;
  return sightRef(rt, u, u.pos);
}
export function numberHint(n) { return n <= 0 ? '姿なし' : n < 20 ? 'わずか' : n < 60 ? 'ひと群れ' : '大勢'; }
export function woundHint(u) { return u.lastHitT < 10 && u.hp < u.maxHp * 0.35 ? '深手に見える' : u.lastHitT < 5 ? '手傷あり' : '構えている'; }
export function knownName(u) { return u.team === 0 || u.announced ? u.name : ''; }
