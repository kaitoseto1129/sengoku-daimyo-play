// 持ち場の最初の画面を「人の暮らした戦場」にする共通の部品（飛躍の9・leap_best_copy）。
// 点の高い三戦（箕作 64・雑賀 62・天王寺 60）に共通する作り方を、どの戦でも呼べる形にまとめた。
//   1. 地面：一色にしない。足もとから正面へ踏み跡の土、建物と岩の根に草、窪みに湿った泥（雑賀の頂点の配分の直し方）。
//      形も材質も増やさず、準備の時だけ地面の頂点の配分（splat・groundCover）を書き換える。
//   2. 小物：手前 6〜16m の左右に俵・材木・篝火・桶や袋、10〜40m に半分土に埋めた岩と根の草（箕作の陣と石）。
//      正面の真ん中は空け、戦場の 3 分の 2 を空ける決まりを守る。
//   3. 中景：30〜60m の左右に板葺き石置き屋根の小屋（雑賀・天王寺の番所）、間に板塀、塀ぞいに幟の列（箕作の赤い旗）、
//      片側に井楼一基（箕作の井楼）。どれも共通の束（makeSimpleBatch）にまとめて描く数を増やさない。
//   4. 光：任意で、日を持ち場の斜め横へ回して長い影を地面へ落とす（雑賀の sunDir の直し）。
// 置き場の判定：水・急な斜面・既にある建物の当たり（SOLIDS）・道（def.paths）・戦の avoid(x, z) を避ける。
// だから戦の setup の最後（建物や柵を置いた後）に呼ぶ。
//   import { dressStage } from './stage_dress.js';
//   dressStage(rt, { flag: 'oda', fire: true, huts: 3, yagura: true, avoid: (x, z) => ... });
// 兵は増やさない。字・札・ボタンは出さない。毎コマの処理は無い。
import * as THREE from 'three';
import { hut, nobori, tawara, lumber, campfire, castleBoardFence, yagura, SOLIDS, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { extScatter } from './props_ext.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { stoneTex } from './nature.js';
import { S as SETTINGS } from './settings.js';

// 決まった並びの乱数（戦ごとに同じ置き方になる）
function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function pathDist(x, z, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    d = Math.min(d, segDist(x, z, a.x ?? a[0], a.z ?? a[1], b.x ?? b[0], b.z ?? b[1]));
  }
  return d;
}

// 持ち場と向き。前は (sin h, cos h)、右は (cos h, -sin h)。
export function stageView(rt, o = {}) {
  const sp = o.at || rt.def?.spawn || { x: rt.player?.u?.pos.x ?? 0, z: rt.player?.u?.pos.z ?? 0 };
  const h = o.heading ?? sp.heading ?? rt.player?.yaw ?? 0;
  const fx = Math.sin(h), fz = Math.cos(h);
  return { x: sp.x, z: sp.z, h, fx, fz, rx: fz, rz: -fx,
    // 前へ d、右へ s の地点
    at(d, s) { return [this.x + fx * d + fz * s, this.z + fz * d - fx * s]; } };
}

// その地点に半径 r の物を置いてよいか
export function canPlace(W, x, z, r, o = {}) {
  const h0 = W.heightAt(x, z);
  if (!Number.isFinite(h0)) return false;
  if (W.inWaterAt?.(x, z) || (W.waterDepthAt?.(x, z) || 0) > 0.02) return false;
  let lo = h0, hi = h0;
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    const y = W.heightAt(x + dx, z + dz);
    if (!Number.isFinite(y) || W.inWaterAt?.(x + dx, z + dz)) return false;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  if (hi - lo > Math.max(0.5, r * (o.slope ?? 0.35))) return false;
  const m = r + (o.margin ?? 1.5);
  for (const s of SOLIDS) if (x + m > s.x0 && x - m < s.x1 && z + m > s.z0 && z - m < s.z1) return false;
  for (const p of W.def?.paths || []) if (pathDist(x, z, p) < (p.w ?? W.def.pathWidth ?? 2) / 2 + r + 0.5) return false;
  if (o.avoid?.(x, z)) return false;
  return true;
}

// 前 d0〜d1・横 s0〜s1（左右どちらも）の中で、置ける所を探す
function findSpot(W, view, R, d0, d1, s0, s1, r, o, side) {
  for (let k = 0; k < 14; k++) {
    const d = d0 + (d1 - d0) * R(), s = (s0 + (s1 - s0) * R()) * (side ?? (R() < 0.5 ? -1 : 1));
    const [x, z] = view.at(d, s);
    if (canPlace(W, x, z, r, o)) return [x, z];
  }
  return null;
}

// 1. 地面の配分。雑賀の saikaFieldSurface と同じく、準備の時だけ頂点の草・土・泥の割合を直す。
export function dressGround(W, view, o = {}) {
  const geo = W.terrain?.geometry, P = geo?.attributes.position;
  const splat = geo?.attributes.splat, cover = geo?.attributes.groundCover;
  if (!P || !splat) return;
  const R2 = (o.radius ?? 70) ** 2, wet = o.wet ?? 0.5, trodden = o.trodden ?? 0.8;
  const roots = o.roots || [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), dx = x - view.x, dz = z - view.z, dd = dx * dx + dz * dz;
    if (dd > R2) continue;
    const fade = 1 - Math.sqrt(dd / R2);
    const fwd = dx * view.fx + dz * view.fz, side = dx * view.rx + dz * view.rz;
    // 斑のゆらぎ（同じ式で毎回同じ）
    const n = Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07) * 0.5 + Math.sin(x * 1.3 + z * 1.7) * 0.25;
    // 踏み跡：持ち場から正面へ、くねった幅 2.5m ほどの土の帯と、足もとの踏み固め
    const wiggle = Math.sin(fwd * 0.08) * 3;
    const track = fwd > -4 ? Math.max(0, 1 - Math.abs(side - wiggle) / (2.2 + fwd * 0.03)) : 0;
    const yard = Math.max(0, 1 - Math.sqrt(dd) / 7);
    let soil = Math.min(1, Math.max(track * (0.75 + n * 0.3), yard * 0.8) * trodden);
    // 窪み：周りより低い所は湿った泥
    const y = P.getY(i);
    const ring = (W.heightAt(x + 3, z) + W.heightAt(x - 3, z) + W.heightAt(x, z + 3) + W.heightAt(x, z - 3)) / 4;
    const hollow = Number.isFinite(ring) ? Math.max(0, Math.min(1, (ring - y - 0.08) / 0.35)) * wet : 0;
    // 建物・岩の根は草が残る
    let root = 0;
    for (const [rx, rz, rr] of roots) { const d = Math.hypot(x - rx, z - rz); if (d < rr + 1.6) root = Math.max(root, 1 - Math.abs(d - rr - 0.5) / 1.1); }
    root = Math.max(0, root) * (0.6 + n * 0.4);
    // 道を外れた所の草の斑（一色に見せない）
    const patch = Math.max(0, n) * 0.45 * (1 - soil);
    let g = splat.getX(i), d = splat.getY(i), m = splat.getZ(i);
    const k = fade;
    const toSoil = g * soil * 0.85 * k;
    g -= toSoil; d += toSoil;
    const toMud = (g + d) * hollow * 0.6 * k;
    g -= toMud * (g / ((g + d) || 1)); d -= toMud * (d / ((g + d) || 1)); m += toMud;
    const toGrass = d * Math.max(root, patch) * 0.7 * k * (1 - soil);
    d -= toGrass; g += toGrass;
    const t = g + d + m || 1;
    splat.setXYZ(i, Math.max(0, g / t), Math.max(0, d / t), Math.max(0, m / t));
    if (cover) cover.setY(i, cover.getY(i) * (1 - soil * k));
  }
  splat.needsUpdate = true; if (cover) cover.needsUpdate = true;
}

// 半分土に埋めた岩（箕作の切岸の石の埋め方）。一つの InstancedMesh と根の草。
let ROCK_GEO = null, ROCK_MAT = null;
function placeRocks(rt, W, spots) {
  if (!spots.length) return;
  ROCK_GEO ||= rockShape(1, true, SETTINGS.quality === 'low' ? 1 : 2);
  ROCK_MAT ||= new THREE.MeshLambertMaterial({ map: stoneTex(), color: 0x8f877a });
  const rocks = new THREE.InstancedMesh(ROCK_GEO, ROCK_MAT, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  spots.forEach(([x, z, r, a], i) => {
    // 中心を地面より下に置き、上の半分だけを出す
    p.set(x, W.heightAt(x, z) - r * 0.45, z);
    q.setFromEuler(e.set((a - 0.5) * 0.5, a * 6.28, (a * 7 % 1 - 0.5) * 0.4));
    rocks.setMatrixAt(i, m.compose(p, q, s.set(r * (1.1 + a * 0.4), r * (0.7 + a * 0.3), r)));
  });
  rocks.userData.stageDress = true;
  rt.scene.add(rocks);
  groundRocks(W, rocks, 1);
}

const BOARD_ROOF = [0x786b57, 0x6d6252, 0x897354, 0x736b5d, 0x625b4e];

// 2・3. 小物と中景。返り値は置いた物の位置（地面の草の根に使う）。
export function dressProps(rt, view, o = {}) {
  const W = rt.world, R = seeded(o.seed ?? Math.round(view.x * 31 + view.z * 17 + 7));
  const roots = [], scene = rt.scene;
  const place = { avoid: o.avoid, margin: o.margin };
  const batch = makeSimpleBatch();
  // 中景の小屋：左右へ交互に。正面 ±12m は空ける。
  const huts = [];
  const nHut = o.huts ?? 3;
  for (let i = 0; i < nHut; i++) {
    const side = i % 2 ? 1 : -1, w = 6 + R() * 3, d = 4.5 + R() * 1.5;
    const spot = findSpot(W, view, R, 30, 58, 13, 34, Math.max(w, d) / 2 + 1, place, side);
    if (!spot) continue;
    const [x, z] = spot;
    // 棟を持ち場へ向けて妻ではなく軒を見せる
    const rot = view.h + Math.PI / 2 + (R() - 0.5) * 0.3;
    hut(W, x, z, w, d, rot, { ita: true, boardRoof: true, boardRoofColors: BOARD_ROOF, weatheredBoards: true,
      wall: i % 3 === 0 ? 0xb0a58d : 0x7e7464, h: 2.2 + R() * 0.4, minka: false, batch });
    huts.push([x, z, w, d, rot]); roots.push([x, z, Math.max(w, d) / 2]);
  }
  // 小屋の手前を結ぶ板塀（同じ側に二軒ある時）と、塀ぞいの幟
  const flags = [];
  if (o.fence !== false) {
    for (const s of [-1, 1]) {
      const own = huts.filter(([x, z]) => ((x - view.x) * view.rx + (z - view.z) * view.rz) * s > 0);
      let seg = null;
      if (own.length >= 2) {
        const [a, b] = own;
        seg = [a[0] - view.fx * (a[3] / 2 + 2), a[1] - view.fz * (a[3] / 2 + 2), b[0] - view.fx * (b[3] / 2 + 2), b[1] - view.fz * (b[3] / 2 + 2)];
      } else if (own.length === 1) {
        const [x, z, w, d] = own[0], ox = x - view.fx * (d / 2 + 2.5), oz = z - view.fz * (d / 2 + 2.5);
        seg = [ox - view.rx * w * 0.8, oz - view.rz * w * 0.8, ox + view.rx * w * 0.8, oz + view.rz * w * 0.8];
      }
      if (!seg || Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) > 30) continue;
      const mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
      if (o.avoid?.(mx, mz) || W.inWaterAt?.(mx, mz)) continue;
      castleBoardFence(W, seg, { h: 1.9, boardCap: true, plainBoards: true, batch });
      for (let t = 0.15; t <= 0.9; t += 0.25) flags.push([seg[0] + (seg[2] - seg[0]) * t - view.fx * 1.2, seg[1] + (seg[3] - seg[1]) * t - view.fz * 1.2]);
    }
  }
  if (o.flag !== false) for (const [x, z] of flags) scene.add(nobori(W, x, z, o.flag || 'oda', 4.6));
  finalizeSimpleBatch(rt, batch);
  // 井楼：片側の奥に一基
  if (o.yagura) {
    const spot = findSpot(W, view, R, 42, 62, 18, 30, 2.5, place, o.yaguraSide ?? (huts.length % 2 ? -1 : 1));
    if (spot) { scene.add(yagura(W, spot[0], spot[1], { rot: view.h, kind: 'seiro' })); roots.push([spot[0], spot[1], 1.8]); }
  }
  // 手前の小物：左右 6〜16m、横へ 4m より外（足もとと正面は空ける）
  const nClutter = o.clutter ?? 5, sacks = [];
  for (let i = 0; i < nClutter; i++) {
    const side = i % 2 ? 1 : -1;
    const spot = findSpot(W, view, R, 6, 16, 4.5, 11, 1.2, { ...place, margin: 0.4 }, side);
    if (!spot) continue;
    const [x, z] = spot, kind = i % 4;
    if (kind === 0) scene.add(tawara(W, x, z, view.h + R(), 4 + Math.floor(R() * 3), { solid: false }));
    else if (kind === 1) scene.add(lumber(W, x, z, view.h + Math.PI / 2 + (R() - 0.5)));
    else if (kind === 2 && o.fire !== false) { scene.add(campfire(W, x, z)); W.addFire?.(x, z, { h: 0.12, size: 0.7 }); }
    else for (let k = 0; k < 3; k++) sacks.push({ x: x + (R() - 0.5) * 1.6, z: z + (R() - 0.5) * 1.6, rot: R() * 6.28, s: 0.9 + R() * 0.2 });
    roots.push([x, z, 0.8]);
  }
  if (sacks.length) {
    const half = Math.ceil(sacks.length / 2);
    extScatter(scene, 'sack', sacks.slice(0, half), W);
    extScatter(scene, o.fire === false ? 'barrel' : 'bucket', sacks.slice(half), W);
  }
  // 岩：10〜40m に散らす。真ん中の 5m は空ける。
  const rocks = [];
  for (let i = 0; i < (o.rocks ?? 9); i++) {
    const r = 0.35 + R() * R() * 0.9;
    const spot = findSpot(W, view, R, 9, 40, 5, 26, r, { ...place, margin: 0.3, slope: 1.2 });
    if (spot) { rocks.push([spot[0], spot[1], r, R()]); roots.push([spot[0], spot[1], r]); }
  }
  placeRocks(rt, W, rocks);
  return roots;
}

// 4. 光：日の向きを持ち場から見て斜め横（既定は右前 110°）へ回す。高さは今のまま。
export function sideLight(W, view, o = {}) {
  if (!W.currentLook || !W.applyLook) return;
  const look = W.currentLook();
  const a = view.h + (o.angle ?? 1.9), flat = Math.hypot(look.sunDir.x, look.sunDir.z) || 1;
  look.sunDir.x = Math.sin(a) * flat; look.sunDir.z = Math.cos(a) * flat;
  look.sunDir.normalize();
  W.applyLook(look);
}

// まとめて：戦の setup の最後に一度だけ呼ぶ。
// o: { at, heading, flag('oda' など・false で無し), huts, fence, yagura, clutter, fire, rocks, ground, wet, trodden, light, avoid, seed }
export function dressStage(rt, o = {}) {
  const view = stageView(rt, o);
  const roots = dressProps(rt, view, o);
  if (o.ground !== false) dressGround(rt.world, view, { ...o, roots });
  if (o.light) sideLight(rt.world, view, o);
  return view;
}
