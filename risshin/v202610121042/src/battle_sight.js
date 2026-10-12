// 画面の知らせ用の見通し。戦う兵の判断や保存には触れない。
import { weatherSight, weatherSees } from './weather_gameplay.js';
import { smokeDepth } from './wind_smoke.js';
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
function boxCuts(ax, az, bx, bz, hw, hd, ay, by, bottom, top) {
  let lo = 0.001, hi = 0.999;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 0.00001) { if (Math.abs(ax) > hw) return false; }
  else { const a = (-hw - ax) / dx, b = (hw - ax) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  if (Math.abs(dz) < 0.00001) { if (Math.abs(az) > hd) return false; }
  else { const a = (-hd - az) / dz, b = (hd - az) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  const dy = by - ay;
  const y0 = bottom ?? -Infinity, y1 = top ?? Infinity;
  if (Math.abs(dy) < 0.00001) { if (ay < y0 || ay > y1) return false; }
  else { const a = (y0 - ay) / dy, b = (y1 - ay) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
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
export function sightPoint(rt, p, limit = 170, distant = false, targetHeight = 1.6) {
  if (!p) return false;
  const a = distant && rt.camera ? rt.camera.position : rt.player.u.pos, W = rt.world;
  const dx = p.x - a.x, dz = p.z - a.z;
  if (rt.camera) {
    // 見えるかは、画面に映る範囲で決める（三人称ではカメラと体の向きが違う。体の向きで決めると、映っている兵を「姿なし」と数えていた）
    const e = rt.camera.matrixWorldInverse.elements, y = (p.y ?? W.heightAt(p.x, p.z)) + targetHeight;
    const vx = e[0] * p.x + e[4] * y + e[8] * p.z + e[12];
    const vy = e[1] * p.x + e[5] * y + e[9] * p.z + e[13];
    const vz = e[2] * p.x + e[6] * y + e[10] * p.z + e[14];
    const pe = rt.camera.projectionMatrix.elements;
    if (vz >= -rt.camera.near || Math.abs(vx * pe[0]) > -vz || Math.abs(vy * pe[5]) > -vz) return false;
  } else if (dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw) < 0) return false;
  const viaCam = !!rt.camera;
  const d = Math.hypot(dx, dz);
  const forward = dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw);
  const side = dx * Math.cos(rt.player.yaw) - dz * Math.sin(rt.player.yaw);
  const halfView = Math.atan(Math.tan((rt.camera?.fov || 60) * Math.PI / 360) * (rt.camera?.aspect || 1.8));
  if (!viaCam && !distant && d > 0.2 && Math.abs(Math.atan2(side, forward)) > halfView) return false;
  // 遠景も朝霧と距離で隠れる。描画を止める遠さを「見える遠さ」にしない。
  if (d > Math.min(limit, weatherSight(W), W.vis ?? 680) || !weatherSees(W, a, p)) return false;
  const ay = a.y + (distant ? 0 : 1.6), by = (p.y ?? W.heightAt(p.x, p.z)) + targetHeight;
  // 描画の霧と同じ距離・高さの減衰。谷の兵が霞に沈んだら帯にも数えない。
  const fogVis = Math.max(20, Math.floor(W.scene?.fog?.far ?? W.vis ?? 680));
  const fogD = Math.hypot(d, by - ay), fogH = Math.exp(-Math.max(-30, Math.min(120, by - ay)) * 0.024);
  const ft = Math.max(0, Math.min(1, (fogD - 3) / 25));
  if ((1 - Math.exp(-fogD / fogVis * 1.9 * fogH)) * (0.3 + 0.7 * ft * ft * (3 - 2 * ft)) > 0.72) return false;
  if (smokeDepth(W, a, p, ay, by) + veilDepth(W.dustVeil, a, p, ay, by, d) > 0.45) return false;
  const steps = Math.max(2, Math.min(24, Math.ceil(d / 6)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (p.x - a.x) * t, z = a.z + (p.z - a.z) * t;
    if (W.heightAt(x, z) > ay + (by - ay) * t - 0.3) return false;
    // 遠くの旗は木の間からも見える。林の円全体を壁にしない。
    if (!distant) for (const gv of W.def.groves || []) if (d > 25 && Math.hypot(x - gv.x, z - gv.z) < gv.r) return false;
  }
  for (const s of rt.army.structs || []) {
    if (!s.alive || !s.seg || /柵|逆茂木/.test(s.name || '')) continue;
    if (cuts(a, p, ...s.seg)) return false;
  }
  for (const w of rt.army.solids || []) {
    if (w.struct && !w.struct.alive) continue;
    // 窓と戸口は既存の壁の切れ目を通す。上下の階の壁も視線の高さで判定する。
    if (w.k === 's' && w.naka != null) {
      const ex = w.bx - w.ax, ez = w.bz - w.az, len = Math.hypot(ex, ez);
      if (len < 0.001) continue;
      const c = ex / len, sn = ez / len, mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2;
      const ax = a.x - mx, az = a.z - mz, bx = p.x - mx, bz = p.z - mz;
      if (boxCuts(ax * c + az * sn, -ax * sn + az * c, bx * c + bz * sn, -bx * sn + bz * c, len / 2, w.r, ay, by, w.yBot, w.yTop)) return false;
      continue;
    }
    if (w.k !== 'r') continue;
    if (w.yTop != null && Math.min(ay, by) > w.yTop || w.yBot != null && Math.max(ay, by) < w.yBot) continue;
    const ax = a.x - w.x, az = a.z - w.z, bx = p.x - w.x, bz = p.z - w.z;
    if (boxCuts(ax * w.c - az * w.s, ax * w.s + az * w.c, bx * w.c - bz * w.s, bx * w.s + bz * w.c, w.hw, w.hd, ay, by, w.yBot, w.yTop)) return false;
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
  return sightRef(rt, u, u.pos);
}
// 上の帯はカメラから見える体を数える。主人公の背後に見える組も含む。
const screenUnitCache = new WeakMap();
export function sightScreenUnit(rt, u) {
  if (!u.alive || u.gone || u.camHidden || u.mesh?.visible === false) return false;
  let c = screenUnitCache.get(u);
  if (!c) { c = { rt: null, t: -99, seen: false }; screenUnitCache.set(u, c); }
  if (c.rt !== rt || rt.t < c.t || rt.t - c.t >= 0.2) {
    c.rt = rt; c.t = rt.t;
    c.seen = sightPoint(rt, u.pos, 170, true, u.mounted ? 2.4 : 1.6) ||
      sightPoint(rt, u.pos, 170, true, u.mounted ? 1.6 : 0.8);
  }
  return c.seen;
}
const distantCache = new WeakMap();
// 備えの中央と四隅を見る。見える一部があれば軍勢の気配を知らせる。
export function sightDistant(rt, ref, x, z, hw, hd, facing = 0) {
  let c = distantCache.get(ref);
  if (!c) { c = { rt: null, t: -99, seen: false, p: { x: 0, y: 0, z: 0 } }; distantCache.set(ref, c); }
  if (c.rt === rt && rt.t >= c.t && rt.t - c.t < 0.25) return c.seen;
  c.rt = rt; c.t = rt.t; c.seen = false;
  const sn = Math.sin(facing), cs = Math.cos(facing), W = rt.world;
  for (let i = 0; i < 5; i++) {
    const lx = i ? (i <= 2 ? -hw : hw) : 0, lz = i ? (i % 2 ? -hd : hd) : 0;
    c.p.x = x + lx * cs + lz * sn; c.p.z = z - lx * sn + lz * cs;
    c.p.y = W.heightAt(c.p.x, c.p.z); // 幟だけ丘から出ていても、兵が見えた数にしない
    if (sightPoint(rt, c.p, (W.vis || 230) * 1.5 + 30, true)) { c.seen = true; break; }
  }
  return c.seen;
}
// 描画中の束から気配を読む。最大48か所だけ見通しを調べ、入れ物は使い回す。
// 隠した一人・間引いた列・押し引き・後詰めの網目も同じ条件で数える。
const meshSightCache = new WeakMap();
export function sightArmyMesh(rt, mesh, U, clash = false) {
  if (!mesh || !mesh.count || !mesh.visible) return 0;
  for (let parent = mesh.parent; parent; parent = parent.parent) if (!parent.visible) return 0;
  let c = meshSightCache.get(mesh);
  if (!c) { c = { rt: null, t: -99, n: 0, p: { x: 0, y: 0, z: 0 } }; meshSightCache.set(mesh, c); }
  if (c.rt === rt && rt.t >= c.t && rt.t - c.t < 0.5) return c.n;
  c.rt = rt; c.t = rt.t; c.n = 0;
  mesh.updateWorldMatrix(true, false);
  const mat = mesh.instanceMatrix.array, e = mesh.matrixWorld.elements;
  const info = mesh.geometry.attributes.aInfo?.array, host = mesh.geometry.attributes.aHost?.array;
  const slots = clash ? mesh.geometry.attributes.aClash.array : null;
  const count = mesh.count, samples = Math.min(48, count), cam = rt.camera?.position || rt.player.u.pos;
  let seen = 0;
  for (let j = 0; j < samples; j++) {
    const i = Math.floor((j + 0.5) * count / samples), k = i * 16;
    if (mat[k] * mat[k] + mat[k + 2] * mat[k + 2] < 0.000001) continue;
    let ox = 0, oz = 0;
    if (slots) {
      const b = U.uBlk.value[Math.round(slots[i * 4])], b2 = U.uBlk2.value[Math.round(slots[i * 4])];
      if (b2.w > 0.5 || slots[i * 4 + 1] + 0.5 <= b.z) continue;
      const kc = b.z / Math.max(1, b2.z), fr = Math.floor(kc), row = slots[i * 4 + 2];
      oz = U.uSide.value * b.x + (row <= fr + 0.5 ? fr : kc) * 1.15 + U.uApp.value;
    }
    const x = mat[k + 12] + mat[k] * ox + mat[k + 8] * oz;
    const z = mat[k + 14] + mat[k + 2] * ox + mat[k + 10] * oz;
    c.p.x = e[0] * x + e[8] * z + e[12]; c.p.z = e[2] * x + e[10] * z + e[14];
    c.p.y = rt.world.heightAt(c.p.x, c.p.z);
    const d = Math.hypot(c.p.x - cam.x, c.p.z - cam.z);
    if (d < (U.uNearHide?.value || U.uNear?.value || 0)) continue;
    const f = host?.[i] > 0 ? Math.max(0, Math.min(1, (d - 24) / 24)) : 1;
    const cover = f * f * (3 - 2 * f);
    if (cover < 0.15) continue;
    const height = info?.[i * 4 + 1] === 4 ? 4.5 : 1.6;
    if (sightPoint(rt, c.p, (rt.world.vis || 230) * 1.5 + 30, true, height)) seen += cover;
  }
  c.n = seen ? Math.max(1, Math.round(count * seen / samples)) : 0;
  return c.n;
}
export function numberHint(n) { return n <= 0 ? '姿なし' : n < 5 ? 'わずか' : n < 10 ? '数人' : n < 20 ? '十数人' : n < 60 ? 'ひと群れ' : '大勢'; }
export function woundHint(u) { return u.lastHitT < 10 && u.hp < u.maxHp * 0.35 ? '深手に見える' : u.lastHitT < 5 ? '手傷あり' : '構えている'; }
export function knownName(u) { return u.team === 0 || u.announced ? u.name : ''; }

// 札の人数と構えは、今見通せる組だけから読む。
export function groupSeen(rt, g) {
  for (const u of g.units) if (sightUnit(rt, u)) return true;
  return false;
}
