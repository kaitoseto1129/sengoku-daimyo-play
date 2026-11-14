// ======================================================================
// 木漏れ日（kaito 11/11「森をもっとリアルに：杉檜・下草・木漏れ日」・台帳 K169）
// 林の中（近くに木が三本以上ある所）の地面に、葉の間から落ちる日の斑を薄く置く。
// 一つの形（柔らかい丸の絵・足し算の光・地面に沿う格子）にまとめて一回で描く。絵は全戦で一つを使い回す。
// 夜・嵐・雨・曇り（timeKey が night・storm・dusk・rain・after）は出さない。毎コマの仕事は無い。
// ======================================================================
import * as THREE from 'three';
import { rng } from './world_common.js';

let TEX = null;
function spotTex() {
  if (TEX) return TEX;
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  // 葉の隙間の形：丸い斑を三つ四つ重ね、縁をぼかす（一つの丸の判子に見せない）
  for (let k = 0; k < 4; k++) {
    const x = n * (0.32 + 0.36 * ((k * 37) % 10) / 10), y = n * (0.3 + 0.4 * ((k * 53) % 10) / 10), r = n * (0.16 + 0.05 * (k % 2));
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  TEX = new THREE.CanvasTexture(c); TEX.colorSpace = THREE.SRGBColorSpace;
  return TEX;
}

const OFF_TIMES = new Set(['night', 'storm', 'dusk', 'rain', 'after']);   // after＝曇り・雨上がり（日が差さない）

export function addKomorebi(world, max = 260) {
  const pts = world.treePoints;
  if (!pts || pts.length < 12 || world.def.noKomorebi || OFF_TIMES.has(world.timeKey) || world.def.rain) return null;
  // 升目に分けて近くの木を数える（全部の組を比べない）
  const C = 8, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const [x, z] of pts) { const k = key(Math.floor(x / C), Math.floor(z / C)); (grid.get(k) || grid.set(k, []).get(k)).push([x, z]); }
  const near = (x, z) => {
    let n = 0; const i0 = Math.floor(x / C), j0 = Math.floor(z / C);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const [a, b] of grid.get(key(i, j)) || []) if ((a - x) ** 2 + (b - z) ** 2 < 64) n++;
    return n - 1;
  };
  const R = rng((world.def.seed || 7) * 13 + 5);
  const spots = [];
  for (const [x, z] of pts) {
    if (spots.length >= max) break;
    if (near(x, z) < 3) continue;   // 林の中だけ（一本立ちの木の下には落とさない）
    const k = 1 + Math.floor(R() * 2);
    for (let i = 0; i < k && spots.length < max; i++) {
      const a = R() * Math.PI * 2, r = 1.2 + R() * 3.2;
      spots.push([x + Math.cos(a) * r, z + Math.sin(a) * r, 0.5 + R() * 1.1, R() * Math.PI]);
    }
  }
  if (!spots.length) return null;
  // 斑は地面の起伏に沿わせる（平らな板だと坂で半分が土に埋もれた）。四×四の格子を一つの形にまとめ、描くのは一回
  const G = 4, V = (G + 1) * (G + 1), pos = new Float32Array(spots.length * V * 3), uv = new Float32Array(spots.length * V * 2), idx = [];
  spots.forEach(([x, z, s, rot], n) => {
    const c = Math.cos(rot), sn = Math.sin(rot), hw = s * 1.1, hd = s * 0.7, o = n * V;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const lx = (i / G - 0.5) * 2 * hw, lz = (j / G - 0.5) * 2 * hd, wx = x + lx * c - lz * sn, wz = z + lx * sn + lz * c, k = o + j * (G + 1) + i;
      pos[k * 3] = wx; pos[k * 3 + 1] = world.heightAt(wx, wz) + 0.12; pos[k * 3 + 2] = wz; uv[k * 2] = i / G; uv[k * 2 + 1] = j / G;
    }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a0 = o + j * (G + 1) + i, a1 = a0 + 1, b0 = a0 + G + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map: spotTex(), color: 0xffe2a8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const im = new THREE.Mesh(geo, mat);
  im.castShadow = im.receiveShadow = false; im.renderOrder = 1; im.name = 'komorebi'; im.userData.spots = spots.length;
  world.scene.add(im);
  world.komorebi = im;
  return im;
}
