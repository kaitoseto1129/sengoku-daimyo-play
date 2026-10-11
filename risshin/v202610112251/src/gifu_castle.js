// 信長の岐阜城。三層の望楼と四階の山麓御殿。寸法・配置は推定。
// 城下と地図の戦で使う外観だけを設営時にまとめる。床や毎コマの処理は持たない。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect, castleStoneMat } from './props.js';

export const isGifuCastle = (name, year) => /^岐阜(?:城|\s|$)/u.test(name || '') && year >= 1567;
let MATERIAL;
function builder(rt, material = null) {
  const parts = [];
  const add = (g, color) => {
    const p = g.index ? g.toNonIndexed() : g;
    if (p !== g) g.dispose();
    const c = new THREE.Color(color), a = new Float32Array(p.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    p.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(p);
  };
  const box = (w, h, d, x, y, z, c, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, y, z); add(g, c);
  };
  const roof = (x, y, z, w, d) => {
    const run = d / 2 + .8, rise = Math.min(2, d * .22), slope = Math.atan2(rise, run);
    for (const s of [-1, 1]) box(w + 1.6, .22, Math.hypot(run, rise), x, y + rise / 2, z + s * run / 2, 0x41474a, s * slope);
  };
  const finish = (shadow = true) => {
    MATERIAL ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const g = mergeGeometries(parts); for (const p of parts) p.dispose();
    const m = new THREE.Mesh(g, material || MATERIAL); m.castShadow = shadow; m.receiveShadow = true; rt.scene.add(m);
  };
  return { add, box, roof, finish };
}

export function gifuTower(rt, x, z, y = rt.world.heightAt(x, z), width = 10) {
  const B = builder(rt), d = width * .86;
  // 天守台だけを石積みにする。城全体を高石垣や白い櫓で囲わない。
  const stone = builder(rt, castleStoneMat('nozura'));
  const base = new THREE.CylinderGeometry(width * .75, width * .84, 3, 4);
  base.rotateY(Math.PI / 4); base.scale(1, 1, .86); base.translate(x, y + 1.5, z); stone.add(base, 0xbcb5a6); stone.finish();
  let floorY = y + 3;
  for (let k = 0; k < 3; k++) {
    const w = k < 2 ? width : width * .54, depth = k < 2 ? d : d * .54;
    B.box(w, 3, depth, x, floorY + 1.5, z, k === 2 ? 0xd0c6ae : 0x544536);
    for (const s of [-1, 1]) for (const dx of [-.28, 0, .28]) B.box(.65, 1.1, .08, x + dx * w, floorY + 1.7, z + s * (depth / 2 + .05), 0x20201b);
    // 広い入母屋の二階建てに、小さな望楼を載せる。
    if (k > 0) B.roof(x, floorY + 3, z, w, depth);
    else B.box(w + .8, .18, depth + .8, x, floorY + 3, z, 0x41474a);
    floorY += k === 1 ? 3 + Math.min(2, depth * .22) : 3.3;
  }
  B.finish(); solidRect(x, z, width + 2, d + 2, 0, y + 3);
}

export function gifuResidence(rt, x, z) {
  const B = builder(rt), y = rt.world.heightAt(x, z), w = 16, d = 10;
  // 四階を床の帯と格子窓で示す。詳細な間取りは作らない。
  B.box(w, 13.2, d, x, y + 6.6, z, 0x826d50);
  for (let k = 0; k < 4; k++) {
    B.box(w + .4, .18, d + .4, x, y + k * 3.3 + .4, z, 0x49382a);
    for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) {
      B.box(1.6, 1.6, .1, x + i * 2.7, y + k * 3.3 + 1.9, z + s * (d / 2 + .05), 0x302e24);
      B.box(.08, 1.6, .14, x + i * 2.7, y + k * 3.3 + 1.9, z + s * (d / 2 + .1), 0xa18a64);
    }
  }
  B.roof(x, y + 13.2, z, w, d);
  // 庭に面した能舞台。四本の柱と板床、屋根。
  const sx = x + 16, sz = z + 1, sy = rt.world.heightAt(sx, sz);
  B.box(6, .6, 6, sx, sy + .5, sz, 0x8e7351);
  for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) B.box(.25, 3.4, .25, sx + dx, sy + 2.3, sz + dz, 0x5e4830);
  B.roof(sx, sy + 4, sz, 6, 6);
  // 自然の岩と池を生かした庭。水面も静かな形だけ。
  const gx = x - 17, gy = rt.world.heightAt(gx, z);
  const pond = new THREE.CircleGeometry(5, 12); pond.rotateX(-Math.PI / 2); pond.scale(1, 1, .65); pond.translate(gx, gy + .1, z); B.add(pond, 0x40595b);
  for (let i = 0; i < 5; i++) {
    const rx = gx - 5 + i * 2.5, rz = z - 5 - (i % 2), ry = rt.world.heightAt(rx, rz);
    const rock = new THREE.IcosahedronGeometry(1.2 + i % 2, 0); rock.scale(1, .7, .8); rock.translate(rx, ry + .6, rz); B.add(rock, 0x777367);
  }
  B.finish(); solidRect(x, z, w, d, 0); solidRect(sx, sz, 6, 6, 0);
}

export function gifuTownMountain(rt) {
  const B = builder(rt), x = 0, z = 265, y = rt.world.heightAt(x, 120);
  // 比高約三百メートル。町から見上げる遠景で、山道や曲輪の実測復元ではない。
  const mountain = new THREE.CylinderGeometry(12, 145, 300, 18, 6);
  const p = mountain.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i), f = Math.sin((yy + 150) / 300 * Math.PI);
    const scale = 1 + .1 * f * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5 + yy * .02);
    p.setXYZ(i, p.getX(i) * scale, yy, p.getZ(i) * scale);
  }
  mountain.computeVertexNormals(); mountain.translate(x, y + 150, z); B.add(mountain, 0x4c5741); B.finish(false);
  gifuTower(rt, x, z, y + 300);
}

export function gifuRiver(rt, x, z) {
  const B = builder(rt);
  // 町の西を流れる長良川。川幅と流路は背景用の推定。
  const river = new THREE.PlaneGeometry(22, 280, 1, 14); river.rotateX(-Math.PI / 2); river.translate(x, 0, z);
  const p = river.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, rt.world.heightAt(p.getX(i), p.getZ(i)) + .08);
  river.computeVertexNormals(); B.add(river, 0x40595b); B.finish(false);
}
