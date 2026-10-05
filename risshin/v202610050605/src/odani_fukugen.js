import * as THREE from 'three';
import { ishigaki, dobei, palisade, hut, kabukimon, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { monomi } from './castle_parts.js';
import { HON, OOHIROMA, SAKURABABA, ONMAYA, NAKAMARU, SANNO2, AKAO } from './castles/odani.js';

// 映像に合わせた景観の推定復元。主尾根の順序・大堀切・赤尾屋敷の居所は動かさない。
// 土の外庭を先に、御局屋敷の高台を後に重ねる。主尾根の攻め道から離した平場。
const OKU_OUT = { x: -35, z: 8, hw: 16, hd: 20, h: HON.level - 12 };
const OKU = { x: -35, z: 8, hw: 10, hd: 11, h: HON.level - 7 };
const BELOW_HORI = { x: 38, z: -48, hw: 12, hd: 12, h: Math.min(NAKAMARU.level - 13, HON.level - 4) };
const KOSHI = [
  { x: 54, z: 24, hw: 6, hd: 7, h: HON.level - 22 },
  { x: 56, z: 3, hw: 5, hd: 6, h: HON.level - 18 },
  { x: 56, z: -17, hw: 5, hd: 6, h: HON.level - 14 },
];
const PLATS = [OKU_OUT, OKU, BELOW_HORI, ...KOSHI];
// 台の南の口から外庭へ、腰曲輪の南北の口から次の段へつなぐ。
const LINKS = [
  { ax: OKU.x, az: OKU.z + OKU.hd, ay: OKU.h, bx: OKU.x, bz: OKU_OUT.z + OKU_OUT.hd, by: OKU_OUT.h, w: 2.6 },
  ...KOSHI.slice(1).map((p, i) => ({ ax: KOSHI[i].x, az: KOSHI[i].z - KOSHI[i].hd, ay: KOSHI[i].h, bx: p.x, bz: p.z + p.hd, by: p.h, w: 1.3 })),
  { ax: KOSHI[2].x, az: KOSHI[2].z - KOSHI[2].hd, ay: KOSHI[2].h, bx: BELOW_HORI.x + BELOW_HORI.hw, bz: BELOW_HORI.z + 5, by: BELOW_HORI.h, w: 1.3 },
];
for (const p of LINKS) { p.dx = p.bx - p.ax; p.dz = p.bz - p.az; p.len = Math.hypot(p.dx, p.dz); }

export function odaniExtraClear(x, z) {
  for (const p of PLATS) if (Math.abs(x - p.x) < p.hw + 3 && Math.abs(z - p.z) < p.hd + 3) return true;
  for (const p of LINKS) {
    const t = Math.max(0, Math.min(1, ((x - p.ax) * p.dx + (z - p.az) * p.dz) / (p.len * p.len)));
    if (Math.hypot(x - p.ax - p.dx * t, z - p.az - p.dz * t) < p.w + 2) return true;
  }
  return false;
}

export function odaniExtraHeight(x, z, h) {
  for (const p of PLATS) {
    const d = Math.max(Math.abs(x - p.x) - p.hw, Math.abs(z - p.z) - p.hd);
    if (d >= 3) continue;
    const t = d <= 0 ? 1 : 1 - d / 3;
    h += (p.h - h) * t * t * (3 - 2 * t);
  }
  for (const p of LINKS) {
    const t = ((x - p.ax) * p.dx + (z - p.az) * p.dz) / (p.len * p.len);
    if (t < 0 || t > 1) continue;
    const d = Math.abs((x - p.ax) * p.dz - (z - p.az) * p.dx) / p.len;
    if (d >= p.w + 1) continue;
    const k = d <= p.w ? 1 : p.w + 1 - d;
    h += (p.ay + (p.by - p.ay) * t - h) * k;
  }
  return h;
}

export function buildOdaniFukugen(rt, ramps, stoneKuruwa = []) {
  const W = rt.world, batch = makeSimpleBatch();
  const add = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  const stone = (pts, y, h = 4, out = 1) => add(ishigaki(W, pts, { batch, topY: y, minH: h, maxH: h + 2, lean: 0.18, big: 1.7, noKit: true, out }));
  const earth = (seg, y) => add(dobei(W, seg, { batch, baseY: y, h: 2.2, ita: true, tera: true, earth: 0xa38a61 }));
  const fence = (seg) => add(palisade(W, seg, { batch, h: 1.9, solid: true, mound: false }));
  // 本丸から下の三段。既存の土塀の足もとを積み、南北の門の幅を残す。
  for (const k of [HON, OOHIROMA, SAKURABABA, ONMAYA, NAKAMARU]) {
    // 主郭は縄張りの壁の区間から描く。ここでは残りの低い段だけを補う。
    if (stoneKuruwa.includes(k)) continue;
    const x0 = k.x - k.hw, x1 = k.x + k.hw, y = k.level + (k === ONMAYA ? 1.3 : 0.65);
    for (const z of [k.z0, k.z1]) {
      stone([[x0 + 3, z], [-3.8, z]], y, 4, z === k.z0 ? -1 : 1);
      stone([[3.8, z], [x1 - 3, z]], y, 4, z === k.z0 ? -1 : 1);
    }
    stone([[x0, k.z0 + 3], [x0, k.z1 - 3]], y);
    stone([[x1, k.z1 - 3], [x1, k.z0 + 3]], y);
    stone([[x1 - 3, k.z1], [x1, k.z1 - 3]], y);
    stone([[x1, k.z0 + 3], [x1 - 3, k.z0]], y);
    stone([[x0 + 3, k.z0], [x0, k.z0 + 3]], y);
    stone([[x0, k.z1 - 3], [x0 + 3, k.z1]], y);
  }
  // 本丸の幅広の直線階段。石垣の天端の土塀を、門の両脇まで続ける。
  for (const x of [-4.4, 4.4]) {
    stone([[x, OOHIROMA.z0], [x, HON.z1]], HON.level + 0.65, 5, x < 0 ? -1 : 1);
    earth([x, OOHIROMA.z0, x, HON.z1], HON.level + 0.65);
  }
  // 御局屋敷：五メートルの石の台、土塀、主屋と二棟。外庭は土と木柵。
  const enclose = (p, kind, gap = 2.8) => {
    const x0 = p.x - p.hw, x1 = p.x + p.hw, z0 = p.z - p.hd, z1 = p.z + p.hd;
    const north = KOSHI.includes(p) ? [[x0, z0, p.x - gap, z0], [p.x + gap, z0, x1, z0]] : [[x0, z0, x1, z0]];
    const east = p === BELOW_HORI ? [[x1, z0, x1, p.z + 3.3], [x1, p.z + 6.7, x1, z1]] : [[x1, z0, x1, z1]];
    const segs = [...north, ...east, [x1, z1, p.x + gap, z1], [p.x - gap, z1, x0, z1], [x0, z1, x0, z0]];
    for (const s of segs) {
      if (kind === 'stone') { stone([[s[0], s[1]], [s[2], s[3]]], p.h, 5, -1); earth(s, p.h); }
      else fence(s);
    }
  };
  enclose(OKU_OUT, 'wood'); enclose(OKU, 'stone');
  rt.scene.add(kabukimon(W, OKU.x, OKU.z + OKU.hd, 5.4));
  for (const [x, z, w, d] of [[OKU.x - 2, OKU.z - 4, 10, 6], [OKU.x + 5.5, OKU.z + 3, 4, 4], [OKU.x - 5, OKU.z + 5, 5, 3]]) add(hut(W, x, z, w, d, 0, { ita: true, batch }));
  // 赤尾屋敷は居所と入口を保ったまま、西の木戸を避けて台の石を見せる。
  const ax0 = AKAO.x - AKAO.hw, ax1 = AKAO.x + AKAO.hw, az0 = AKAO.z - AKAO.hd, az1 = AKAO.z + AKAO.hd;
  stone([[ax0, az1], [ax1, az1], [ax1, az0], [ax0, az0]], W.heightAt(AKAO.x, AKAO.z), 3);
  // 腰曲輪・帯曲輪の細い道は、南北の柵を開けて階段へ出られるようにする。
  for (const p of KOSHI) enclose(p, 'wood', 1.7);
  enclose(BELOW_HORI, 'wood');
  monomi(rt, BELOW_HORI.x - 7, BELOW_HORI.z - 7);
  // 奥の最高段。既存の野面積みの上に物見を置き、天守は足さない。
  monomi(rt, SANNO2.x - 3, SANNO2.z0 + 4);
  for (const k of [HON, SAKURABABA]) add(hut(W, k.x + k.hw - 4, k.cz + 7, 4, 3.4, 0, { ita: true, batch, wall: 0x6e6250 }));
  finalizeSimpleBatch(rt, batch);

  // 全て組み立て時だけ作る。石段は同じ箱と材質を使い、一度の描画にまとめる。
  const steps = [];
  const stair = (ax, az, bx, bz, w) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len / 0.4);
    const rise = Math.abs(W.heightAt(bx, bz) - W.heightAt(ax, az)) / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t;
      steps.push({ x, z, y: W.heightAt(x, z) + 0.04 - rise / 2, w, h: Math.max(0.12, rise + 0.12), d: len / n + 0.03, rot: Math.atan2(dx, dz) });
    }
  };
  for (const r of ramps) if (r.a[0] === 0 && r.b[0] === 0) stair(r.a[0], r.a[1], r.b[0], r.b[1], r.b[1] === HON.z1 - 3 ? 6.4 : r.w * 2 - 0.3);
  for (const p of LINKS) stair(p.ax, p.az, p.bx, p.bz, p.w * 2 - 0.2);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8b8579 }), steps.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]; dummy.position.set(s.x, s.y, s.z); dummy.rotation.y = s.rot; dummy.scale.set(s.w, s.h, s.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true; rt.scene.add(mesh);
}
