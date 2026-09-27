import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, jinmakuTexture } from './textures.js';
import { GUST, WIND_STATE, WET } from './world.js';
import { woodTex, thatchTex, barkTex, dirtTex } from './nature.js';
import { FLAG_T } from './units.js';

// 柵・陣幕・幟・小屋などの小道具
// 木肌の絵に色を掛ける（丸太ごとに少しずつ色を変える）
// 木目・干割れ・藁の束・樹皮の割れ目は、同じ絵を凹凸（bumpMap）にも使って、光の当たり方で浮き出させる
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), bumpMap: woodTex(), bumpScale: 1.2, roughness: 0.88, metalness: 0 });
const THATCH = new THREE.MeshStandardMaterial({ map: thatchTex(), bumpMap: thatchTex(), bumpScale: 1.5, roughness: 0.97, metalness: 0, side: THREE.DoubleSide });
const BARK = new THREE.MeshStandardMaterial({ vertexColors: true, map: barkTex('pine'), bumpMap: barkTex('pine'), bumpScale: 1.5, roughness: 0.95, metalness: 0 });
const vary = (hex, k) => { const c = new THREE.Color(hex); const f = 0.82 + (((k * 7919) % 37) / 37) * 0.36; return c.multiplyScalar(f).getHex(); };

function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

// 根元ほど泥で黒ずみ、上ほど日に褪せて灰がかる色を塗る（y0 は地面の高さ、h は丸太の長さ）
const MUD = new THREE.Color(0x2e261c), BLEACH = new THREE.Color(0x9a9288);
function paintWorn(geo, hex, y0, h) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const base = new THREE.Color(hex), c = new THREE.Color();
  const P = g.attributes.position, n = P.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = P.getY(i) - y0;
    const mud = 1 - Math.min(1, Math.max(0, (y - 0.05) / 0.45));
    const top = Math.min(1, Math.max(0, (y - h * 0.55) / (h * 0.45)));
    c.copy(base).lerp(BLEACH, top * 0.28).lerp(MUD, mud * 0.7);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merged(parts, mat = MAT) {
  const g = mergeGeometries(parts);
  const m = new THREE.Mesh(g, mat);
  // カメラが建物や柵にめり込まないよう、当たりを調べる相手にする
  m.userData.camBlock = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 柵（先を尖らせた丸太を並べ、横木で結ぶ）
export function palisade(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 0.34));
  const parts = [];
  const H = o.h || 2.4;
  const ang = Math.atan2(bx - ax, bz - az);
  const px = Math.cos(ang), pz = -Math.sin(ang);   // 柵に直角な向き
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = ((i * 7919) % 101) / 101, r2 = ((i * 104729) % 97) / 97;
    // 太さ・高さ・色・傾きを少しずつ変え、手で打ち込んだ柵らしく
    const off = (r2 - 0.5) * 0.08;
    const x = ax + (bx - ax) * t + px * off, z = az + (bz - az) * t + pz * off;
    const y = world.heightAt(x, z);
    const h = H * (0.86 + r * 0.22);
    const rad = 0.085 + r2 * 0.05;
    const post = new THREE.CylinderGeometry(rad * 0.9, rad * 1.1, h, 7);
    post.rotateZ((r - 0.5) * 0.08); post.rotateX((r2 - 0.5) * 0.06);
    post.translate(x, y + h / 2 - 0.25, z);
    parts.push(paintWorn(post, vary(0x7a5c40, i), y, h));
    const tip = new THREE.ConeGeometry(rad * 0.9, 0.3 + r * 0.2, 7);
    tip.translate(x, y + h - 0.1 + 0.08, z);
    parts.push(paint(tip, vary(0x9a7a56, i + 3)));
  }
  for (const hy of [0.75, 1.65]) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rail = new THREE.CylinderGeometry(0.06, 0.07, len, 6);
    rail.rotateX(Math.PI / 2); rail.rotateY(ang);
    rail.translate(mx - px * 0.14, world.heightAt(mx, mz) + hy, mz - pz * 0.14);
    parts.push(paint(rail, 0x5a4430));
    // 縄の結び目
    for (let i = 0; i <= n; i += 3) {
      const t = i / n, x = ax + (bx - ax) * t - px * 0.12, z = az + (bz - az) * t - pz * 0.12;
      const knot = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6);
      knot.translate(x, world.heightAt(x, z) + hy, z);
      parts.push(paint(knot, 0x8a7a58));
    }
  }
  return merged(parts);
}

// 破られた柵の残骸
export function stumps(world, seg) {
  const [ax, az, bx, bz] = seg;
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const x = ax + (bx - ax) * t + (Math.random() - 0.5) * 0.6, z = az + (bz - az) * t + (Math.random() - 0.5) * 0.6;
    const y = world.heightAt(x, z);
    const log = new THREE.CylinderGeometry(0.1, 0.12, i % 2 ? 2.2 : 0.6, 5);
    if (i % 2) { log.rotateZ(Math.PI / 2 - 0.2); log.rotateY(Math.random() * 3); log.translate(x, y + 0.15, z); }
    else log.translate(x, y + 0.2, z);
    parts.push(paint(log, 0x5a4430));
  }
  return merged(parts);
}

// 陣幕：柱の間で布が少したるみ、風にふくらむ。o.mon で幕に家紋を染め抜く
export function jinmaku(world, cx, cz, w, d, gapSouth = 6, o = {}) {
  const tex = jinmakuTexture(o.mon);
  const grp = new THREE.Group();
  const sides = [
    [cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2],
    [cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2],
    [cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2, cx - gapSouth / 2, cz + d / 2],
    [cx + gapSouth / 2, cz + d / 2, cx + w / 2, cz + d / 2],
  ];
  const poles = [], cloths = [];
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const n = Math.max(1, Math.round(len / 3));
    // 布：柱の間でたるみ（上の縁が下がる）、外へふくらむ
    const geo = new THREE.PlaneGeometry(len, 1.6, Math.max(4, n * 6), 3);
    const P = geo.attributes.position;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k);
      const u = ((x + len / 2) / (len / n)) % 1;
      const sag = Math.sin(u * Math.PI);
      P.setY(k, y - sag * 0.07 * (0.5 + (y + 0.8) / 1.6));
      P.setZ(k, sag * 0.12 * (0.3 + (0.8 - y) / 1.6 * 0.7) + Math.sin(x * 2.3 + ax) * 0.02);
    }
    // 絵は 4m ごとに繰り返す（幕を一つにまとめて描くので、絵の座標で伸ばす）
    const UV = geo.attributes.uv; for (let k = 0; k < UV.count; k++) UV.setX(k, UV.getX(k) * len / 4);
    geo.computeVertexNormals();
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    geo.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2);
    geo.translate(mx, world.heightAt(mx, mz) + 1.25, mz);
    cloths.push(geo);
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      const p = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 4);
      p.translate(x, world.heightAt(x, z) + 1.1, z);
      poles.push(paint(p, 0x3a2c1c));
    }
    // 幕を吊る縄
    const rope = new THREE.CylinderGeometry(0.015, 0.015, len, 3);
    rope.rotateX(Math.PI / 2); rope.rotateY(Math.atan2(bx - ax, bz - az));
    rope.translate(mx, world.heightAt(mx, mz) + 2.07, mz);
    poles.push(paint(rope, 0x6a5a40));
  }
  if (cloths.length) {
    const t = tex.clone(); t.needsUpdate = true; t.userData.clone = true; t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.Mesh(mergeGeometries(cloths), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true;
    grp.add(m);
  }
  grp.add(merged(poles));
  return grp;
}

// 幟の布：竿から離れるほど、下へ行くほど大きくはためく
const noboriMats = new Map();
function noboriMaterial(kind) {
  if (noboriMats.has(kind)) return noboriMats.get(kind);
  const m = new THREE.MeshStandardMaterial({ map: flagTexture(kind), side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T;
    sh.uniforms.uGust = GUST;
    sh.uniforms.uWet = WET;
    // 突風が来ると大きく速くはためく（草と同じ風）。濡れた布は重く、はためきが小さい
    sh.vertexShader = 'uniform float uFlagT, uGust, uWet;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fo = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = fo.x * 0.53 + fo.z * 0.37;
      float k = clamp((position.x - 0.05) / 0.75, 0.0, 1.0);
      float gA = (0.6 + uGust * 0.45) * (1.0 - uWet * 0.6);
      transformed.z += (sin(uFlagT * (2.6 + uGust * 0.8) + position.x * 7.0 + position.y * 1.6 + ph) * 0.09 * gA + sin(uFlagT * 1.3 + ph) * 0.06 * (1.0 - uWet * 0.5)) * k;`);
    // 濡れた布は色が濃い
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 1.0 - uWet * 0.3;');
    sh.uniforms.uWet = WET;
  };
  noboriMats.set(kind, m);
  return m;
}

export function nobori(world, x, z, kind, h = 5) {
  const grp = new THREE.Group();
  const y = world.heightAt(x, z);
  const pole = new THREE.CylinderGeometry(0.04, 0.05, h, 5);
  pole.translate(0, h / 2, 0);
  const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0.4, h - 0.1, 0);
  grp.add(merged([paint(pole, 0x2f2419), paint(bar, 0x2f2419)]));
  const fg = new THREE.PlaneGeometry(0.75, 2.8, 6, 14);
  fg.translate(0.42, h - 1.55, 0);
  const flag = new THREE.Mesh(fg, noboriMaterial(kind));
  flag.castShadow = true;
  grp.add(flag);
  grp.position.set(x, y, z);
  // 布は風下へなびく向きに（みな同じ風を受けて、ほぼそろう）
  grp.rotation.y = Math.atan2(-WIND_STATE.dirZ, WIND_STATE.dirX) + (Math.random() - 0.5) * 1.1;
  grp.userData.flag = flag;
  return grp;
}

export function hut(world, x, z, w, d, rot = 0, o = {}) {
  const y = world.heightAt(x, z);
  const parts = [];
  const H = o.h || 2.6;
  // 板壁：縦の板を並べ、隅に柱
  const boards = Math.max(4, Math.round((w + d) * 2 / 0.3));
  const perim = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]];
  let k = 0;
  for (const [ax, az, bx, bz] of perim) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const bx2 = ax + (bx - ax) * t, bz2 = az + (bz - az) * t;
      // 戸口は開けておく
      if (az === d / 2 && bz === d / 2 && Math.abs(bx2) < 0.6) continue;
      const b = new THREE.BoxGeometry(len / n - 0.012, H, 0.05);
      b.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2);
      b.translate(bx2, H / 2, bz2);
      parts.push(paint(b, vary(o.wall || 0x7b6448, k++)));
    }
  }
  void boards;
  for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    const post = new THREE.BoxGeometry(0.16, H + 0.2, 0.16); post.translate(cx, (H + 0.2) / 2, cz); parts.push(paint(post, 0x4a3826));
  }
  // 戸口の暗がり
  const dark = new THREE.BoxGeometry(1.1, 1.8, 0.02); dark.translate(0, 0.9, d / 2 - 0.3); parts.push(paint(dark, 0x120e0a));
  // 茅葺きの切妻屋根（厚みと、張り出した軒）
  const roofParts = [];
  const eave = 0.55, rh = Math.max(w, d) * 0.42 + 0.6;
  for (const sd of [1, -1]) {
    const slope = Math.hypot(w / 2 + eave, rh);
    const g = new THREE.BoxGeometry(slope, 0.32, d + eave * 2);
    g.translate(slope / 2, 0, 0);
    // 棟から軒へ下る向きに倒す（右は右下、左は左下）
    const th = Math.atan2(rh, w / 2 + eave);
    g.rotateZ(sd > 0 ? -th : Math.PI + th);
    g.translate(0, H + rh, 0);
    roofParts.push(g);
  }
  // 妻壁（三角の板壁）
  for (const zz of [d / 2, -d / 2]) {
    const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh * (w / 2) / (w / 2 + eave))]);
    const tg = new THREE.ShapeGeometry(tri); if (zz < 0) tg.rotateY(Math.PI); tg.translate(0, H, zz);
    parts.push(paint(tg, vary(o.wall || 0x7b6448, 5)));
  }
  const m = merged(parts);
  const roof = new THREE.Mesh(mergeGeometries(roofParts.map((g) => g.index ? g.toNonIndexed() : g)), THATCH);
  roof.userData.camBlock = true;
  roof.geometry.computeVertexNormals();
  roof.castShadow = true; roof.receiveShadow = true;
  // 棟木
  const ridge = new THREE.CylinderGeometry(0.1, 0.1, d + eave * 2 + 0.2, 6); ridge.rotateX(Math.PI / 2); ridge.translate(0, H + rh + 0.12, 0);
  const grp = new THREE.Group();
  grp.add(m, roof, merged([paint(ridge, 0x3a2c1c)]));
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  // 呼び出し側が mesh として扱っても困らないよう、材質の参照を持たせる
  grp.castShadow = true;
  return grp;
}

export function lumber(world, x, z, rot = 0) {
  const parts = [];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const log = new THREE.CylinderGeometry(0.16, 0.16, 4, 8);
      log.rotateZ(Math.PI / 2);
      log.translate(0, 0.16 + row * 0.28, (i - (3 - row) / 2) * 0.33);
      parts.push(paint(log, vary(0x9a7a56, k++)));
    }
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

export function yagura(world, x, z) {
  const parts = [];
  const H = 5.5;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.CylinderGeometry(0.1, 0.12, H, 5);
    leg.translate(dx * 1.1, H / 2, dz * 1.1);
    parts.push(paint(leg, 0x5a4430));
  }
  const floor = new THREE.BoxGeometry(2.8, 0.15, 2.8);
  floor.translate(0, H, 0);
  parts.push(paint(floor, 0x6b5238));
  // 手すりの板と、脚の筋交い・梯子
  for (const [dx, dz, rw, rd] of [[0, -1.4, 2.8, 0.06], [0, 1.4, 2.8, 0.06], [-1.4, 0, 0.06, 2.8], [1.4, 0, 0.06, 2.8]]) {
    const rl = new THREE.BoxGeometry(rw, 0.9, rd); rl.translate(dx, H + 0.5, dz); parts.push(paint(rl, vary(0x6b5238, dx * 3 + dz * 7 + 11)));
  }
  for (const [ax, az, bx, bz] of [[-1.1, -1.1, 1.1, -1.1], [-1.1, 1.1, 1.1, 1.1], [-1.1, -1.1, -1.1, 1.1], [1.1, -1.1, 1.1, 1.1]]) {
    for (const yy of [1.2, 3.2]) {
      const len = Math.hypot(bx - ax, bz - az, 2);
      const b = new THREE.CylinderGeometry(0.05, 0.05, len, 5);
      b.rotateZ(Math.atan2(len, 2) * 0 + Math.atan2(2, Math.hypot(bx - ax, bz - az)) - Math.PI / 2);
      b.rotateY(Math.atan2(bx - ax, bz - az) - Math.PI / 2);
      b.translate((ax + bx) / 2, yy + 1, (az + bz) / 2);
      parts.push(paint(b, 0x5a4430));
    }
  }
  for (let r = 0; r < 9; r++) { const rung = new THREE.BoxGeometry(0.6, 0.05, 0.06); rung.translate(0, 0.4 + r * 0.6, 1.5); parts.push(paint(rung, 0x6b5238)); }
  for (const lx of [-0.3, 0.3]) { const sr = new THREE.BoxGeometry(0.06, H, 0.06); sr.translate(lx, H / 2, 1.5); parts.push(paint(sr, 0x5a4430)); }
  const roof = new THREE.ConeGeometry(2.4, 1.2, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, H + 2.2, 0);
  parts.push(paint(roof, 0x4e4234));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}

export function campfire(world, x, z) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const log = new THREE.CylinderGeometry(0.06, 0.06, 0.8, 4);
    log.rotateZ(Math.PI / 2 - 0.3);
    log.rotateY(i * 1.25);
    log.translate(0, 0.15, 0);
    parts.push(paint(log, 0x2a1f16));
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}

// 普請の足場（丸太を組んだ枠）
export function scaffold(world, x, z, rot = 0) {
  const parts = [];
  const H = 4.2;
  for (const [dx, dz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) {
    const p = new THREE.CylinderGeometry(0.07, 0.08, H, 5);
    p.translate(dx, H / 2, dz);
    parts.push(paint(p, 0x7a5c3c));
  }
  for (const y of [1.4, 2.8, 4.0]) {
    for (const [ax, az, bx, bz] of [[-2, -1, 2, -1], [-2, 1, 2, 1], [-2, -1, -2, 1], [2, -1, 2, 1]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const b = new THREE.CylinderGeometry(0.05, 0.05, len, 4);
      b.rotateZ(Math.PI / 2);
      b.rotateY(Math.atan2(bx - ax, bz - az) - Math.PI / 2);
      b.translate((ax + bx) / 2, y, (az + bz) / 2);
      parts.push(paint(b, 0x6b5238));
    }
  }
  const plank = new THREE.BoxGeometry(4.2, 0.08, 2.2);
  plank.translate(0, 2.85, 0);
  parts.push(paint(plank, 0x8a6b48));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 冠木門：二本の柱に横木を渡した砦の門
export function kabukimon(world, x, z, w = 6.4, rot = 0) {
  const parts = [];
  const H = 3.6;
  for (const sx of [-w / 2, w / 2]) {
    const post = new THREE.CylinderGeometry(0.2, 0.24, H, 8); post.translate(sx, H / 2, 0); parts.push(paint(post, 0x6b5238));
    const brace = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6); brace.rotateX(0.5); brace.translate(sx, 0.7, -0.45); parts.push(paint(brace, 0x5a4430));
  }
  const beam = new THREE.BoxGeometry(w + 1.4, 0.3, 0.32); beam.translate(0, H - 0.1, 0); parts.push(paint(beam, 0x5a4430));
  const tie = new THREE.BoxGeometry(w, 0.18, 0.22); tie.translate(0, H - 0.75, 0); parts.push(paint(tie, 0x6b5238));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 俵（兵糧）：藁の俵を積み、縄で縛る
export function tawara(world, x, z, rot = 0, n = 6) {
  const parts = [];
  let k = 0;
  for (let row = 0; row < 3 && k < n; row++) {
    for (let i = 0; i < 3 - row && k < n; i++, k++) {
      const g = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10); g.rotateZ(Math.PI / 2);
      // 俵は胴がふくらむ
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) { const t = 1 - Math.pow(p.getX(v) / 0.375, 2) * 0.35; p.setY(v, p.getY(v) * t); p.setZ(v, p.getZ(v) * t); }
      g.translate(0, 0.26 + row * 0.46, (i - (2 - row) / 2) * 0.54);
      parts.push(paint(g, vary(0xc8b07a, k)));
      for (const bx of [-0.22, 0.22]) { const r = new THREE.TorusGeometry(0.265, 0.018, 4, 12); r.rotateY(Math.PI / 2); r.translate(bx, 0.26 + row * 0.46, (i - (2 - row) / 2) * 0.54); parts.push(paint(r, 0x6a5a3a)); }
    }
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 馬防柵：騎馬を止めるための柵。柱を間を空けて立て（鉄砲を隙間から撃てる）、横木を二段に縄で結び、ところどころに斜めの支え
export function bobosaku(world, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const ang = Math.atan2(bx - ax, bz - az);
  const px = Math.cos(ang), pz = -Math.sin(ang);   // 柵に直角（敵の側が +）
  const n = Math.max(2, Math.round(len / 1.05));
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = ((i * 7919) % 101) / 101;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const y = world.heightAt(x, z);
    const h = 1.85 + r * 0.35;
    const post = new THREE.CylinderGeometry(0.07, 0.09, h + 0.4, 7);
    post.rotateZ((r - 0.5) * 0.08);
    post.translate(x, y + h / 2 - 0.2, z);
    parts.push(paintWorn(post, vary(0x7a5c40, i), y, h));
    // 柱の頭は斜めに切る
    const tip = new THREE.ConeGeometry(0.075, 0.18, 7);
    tip.translate(x, y + h + 0.08, z);
    parts.push(paint(tip, vary(0x9a7a56, i + 5)));
    // 敵の側へ倒した支え（三本に一本）
    if (i % 3 === 1) {
      const br = new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6);
      br.rotateX(0.62); br.rotateY(ang);
      br.translate(x - px * 0.55, y + 0.62, z - pz * 0.55);
      parts.push(paintWorn(br, 0x5e4630, y, 1.4));
    }
  }
  for (const hy of [0.7, 1.45]) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rail = new THREE.CylinderGeometry(0.05, 0.06, len + 0.4, 6);
    rail.rotateX(Math.PI / 2); rail.rotateY(ang);
    rail.translate(mx + px * 0.1, world.heightAt(mx, mz) + hy, mz + pz * 0.1);
    parts.push(paint(rail, 0x5a4430));
    for (let i = 0; i <= n; i += 2) {
      const t = i / n, x = ax + (bx - ax) * t + px * 0.09, z = az + (bz - az) * t + pz * 0.09;
      const knot = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6);
      knot.translate(x, world.heightAt(x, z) + hy, z);
      parts.push(paint(knot, 0x8a7a58));
    }
  }
  const m = merged(parts);
  m.add(fenceMound(world, seg));
  return m;
}

// 柵の根元の土：柱を打ち込んで踏み固めた、低い土の盛り（柵の線に沿って）
const MOUND = new THREE.MeshStandardMaterial({ map: dirtTex(), color: 0x9a8c78, roughness: 0.97, metalness: 0 });
function fenceMound(world, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 1.5));
  const geo = new THREE.CylinderGeometry(0.45, 0.45, 1, 6, 1, true);
  geo.rotateX(Math.PI / 2);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const g = geo.clone();
    g.scale(1 + ((i * 7919) % 13) / 30, 0.35, len / n + 0.3);
    g.rotateY(Math.atan2(bx - ax, bz - az));
    g.translate(x, world.heightAt(x, z) - 0.07, z);
    parts.push(g);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), MOUND);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------- 陣の小道具 ----------------
// どれも (world, x, z, 向き) で置き、返す物を rt.scene.add する。当たり判定は無い（見た目だけ）

// 鉄の鍋（鈍い照り返し）
const IRON = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.55, metalness: 0.6 });

// 床几（しょうぎ）：脚を X に組んだ折りたたみの腰掛け。o.gunbai で軍配を載せる
export function shogi(world, x, z, rot = 0, o = {}) {
  const parts = [];
  for (const sz of [-0.2, 0.2]) {
    for (const s of [1, -1]) {
      const leg = new THREE.CylinderGeometry(0.022, 0.022, 0.66, 5);
      leg.rotateZ(s * 0.62); leg.translate(0, 0.27, sz);
      parts.push(paint(leg, 0x2a2018));
    }
  }
  for (const sx of [-0.2, 0.2]) { const bar = new THREE.CylinderGeometry(0.02, 0.02, 0.44, 5); bar.rotateX(Math.PI / 2); bar.translate(sx, 0.5, 0); parts.push(paint(bar, 0x2a2018)); }
  // 座：たるんだ革
  const seat = new THREE.PlaneGeometry(0.42, 0.44, 3, 1); seat.rotateX(-Math.PI / 2);
  const P = seat.attributes.position; for (let k = 0; k < P.count; k++) P.setY(k, 0.5 - Math.cos(P.getX(k) / 0.21 * Math.PI / 2) * 0.035);
  parts.push(paint(seat, o.color || 0x3a2a20));
  const grp = new THREE.Group();
  grp.add(merged(parts));
  if (o.gunbai) {
    // 軍配：瓢箪形の団扇に柄。漆の黒に金の縁
    const fan = new THREE.CylinderGeometry(0.13, 0.13, 0.012, 14); fan.scale(1, 1, 1.15); fan.translate(0, 0.52, 0.02);
    const hdl = new THREE.CylinderGeometry(0.012, 0.014, 0.22, 5); hdl.rotateZ(Math.PI / 2); hdl.translate(0.2, 0.52, 0.02);
    const fm = new THREE.Mesh(mergeGeometries([paint(fan, 0x141210), paint(hdl, 0x5a3a20)]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }));
    fm.rotation.y = 0.4; grp.add(fm);
  }
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 旗竿の束：巻いた幟を何本も、横木の架けに立て掛ける。kind は家紋（巻いた布の色に使う）
export function hatazao(world, x, z, rot = 0, n = 7, kind = 'tokugawa') {
  const parts = [];
  const bg = new THREE.Color(0xe8e2d2);
  if (kind === 'oda' || kind === 'eiraku') bg.set(0xd9b43c); else if (kind === 'akazonae' || kind === 'sanada') bg.set(0x8e2a1e); else if (kind === 'furin') bg.set(0x1f2a44);
  // 架け：二本の柱に横木
  for (const sx of [-1.1, 1.1]) { const p = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5); p.translate(sx, 1.2, 0); parts.push(paint(p, 0x4a3826)); }
  const bar = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, 2.2, 0); parts.push(paint(bar, 0x4a3826));
  for (let i = 0; i < n; i++) {
    const r = ((i * 7919) % 97) / 97;
    const px = -0.95 + (i / Math.max(1, n - 1)) * 1.9 + (r - 0.5) * 0.1, lean = 0.18 + r * 0.1, H = 5 + r * 0.8;
    const pole = new THREE.CylinderGeometry(0.025, 0.032, H, 5);
    pole.translate(0, H / 2, 0); pole.rotateX(-lean); pole.translate(px, 0, 0.55);
    parts.push(paint(pole, 0x2f2419));
    // 竿に巻き付けた布
    const furl = new THREE.CylinderGeometry(0.06, 0.075, 1.9, 6);
    furl.translate(0, H - 1.4, 0.04); furl.rotateX(-lean); furl.translate(px, 0, 0.55);
    parts.push(paint(furl, bg.clone().multiplyScalar(0.85 + r * 0.2).getHex()));
    const tie = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 6);
    tie.translate(0, H - 1.0, 0.04); tie.rotateX(-lean); tie.translate(px, 0, 0.55);
    parts.push(paint(tie, 0x6a5a3a));
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 馬を繋ぐ杭：杭を並べて縄を張る（len m の長さ、向き rot）
export function umatsunagi(world, x, z, rot = 0, len = 8) {
  const parts = [];
  const n = Math.max(2, Math.round(len / 2.2));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5, lx = t * len;
    const wx = x + lx * c, wz = z - lx * s;
    const r = ((i * 7919) % 101) / 101;
    const post = new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6);
    post.rotateZ((r - 0.5) * 0.1);
    post.translate(wx, world.heightAt(wx, wz) + 0.5, wz);
    parts.push(paint(post, vary(0x6b5238, i)));
  }
  // 縄は杭の間で少したるむ
  for (let i = 0; i < n; i++) {
    const t0 = i / n - 0.5, t1 = (i + 1) / n - 0.5;
    for (let k = 0; k < 4; k++) {
      const a = t0 + (t1 - t0) * k / 4, b = t0 + (t1 - t0) * (k + 1) / 4;
      const sagA = Math.sin((k / 4) * Math.PI) * 0.12, sagB = Math.sin(((k + 1) / 4) * Math.PI) * 0.12;
      const ax = x + a * len * c, az = z - a * len * s, bx = x + b * len * c, bz = z - b * len * s;
      const ay = world.heightAt(ax, az) + 1.05 - sagA, by = world.heightAt(bx, bz) + 1.05 - sagB;
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      const seg = new THREE.CylinderGeometry(0.014, 0.014, L, 3);
      seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()));
      seg.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      parts.push(paint(seg, 0x7a6a48));
    }
  }
  return merged(parts);
}

// 炊事の鍋：三本の木を組んで鉄鍋を吊り、下で薪が燃え、湯気と煙が昇る
// 返す物の userData.fire は world.removeFire に渡せる
export function nabe(world, x, z, o = {}) {
  const y = world.heightAt(x, z);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.3;
    const leg = new THREE.CylinderGeometry(0.03, 0.04, 1.9, 5);
    leg.translate(0, 0.95, 0); leg.rotateX(0.38); leg.rotateY(a); leg.translate(Math.sin(a) * -0.02, 0, Math.cos(a) * -0.02);
    parts.push(paint(leg, 0x3a2c1c));
  }
  const chain = new THREE.CylinderGeometry(0.008, 0.008, 0.9, 3); chain.translate(0, 1.3, 0); parts.push(paint(chain, 0x1a1816));
  // 薪と、火を囲う石
  for (let i = 0; i < 5; i++) { const log = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 4); log.rotateZ(Math.PI / 2 - 0.25); log.rotateY(i * 1.25); log.translate(0, 0.1, 0); parts.push(paint(log, 0x2a1f16)); }
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; const st = new THREE.DodecahedronGeometry(0.1 + (i % 3) * 0.02, 0); st.translate(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45); parts.push(paint(st, vary(0x6a655c, i))); }
  const grp = new THREE.Group();
  grp.add(merged(parts));
  // 鍋：胴のふくらんだ鉄鍋と、つる
  const pot = new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65); pot.translate(0, 0.62, 0);
  const rim = new THREE.TorusGeometry(0.22, 0.02, 4, 14); rim.rotateX(Math.PI / 2); rim.translate(0, 0.82, 0);
  const handle = new THREE.TorusGeometry(0.2, 0.01, 3, 12, Math.PI); handle.translate(0, 0.83, 0);
  const pm = new THREE.Mesh(mergeGeometries([pot, rim, handle].map((g) => (g.index ? g.toNonIndexed() : g))), IRON);
  pm.castShadow = true;
  grp.add(pm);
  grp.position.set(x, y, z);
  if (o.fire !== false && world.addFire) grp.userData.fire = world.addFire(x, z, { h: 0.08 });
  if (world.addSmokeColumn) world.addSmokeColumn(x, y + 1.0, z, { size: 0.55 });
  return grp;
}

// 兵糧の置き場：俵の山をいくつかと、上に掛けた筵（むしろ）
export function hyoro(world, x, z, rot = 0) {
  const grp = new THREE.Group();
  const c = Math.cos(rot), s = Math.sin(rot);
  const put = (lx, lz, r, n) => { const m = tawara(world, x + lx * c + lz * s, z - lx * s + lz * c, rot + r, n); grp.add(m); };
  put(0, 0, 0, 6); put(0, 1.9, 0.08, 6); put(1.6, 0.9, 1.5, 3);
  // 筵：藁で編んだ敷物を俵の山に掛ける
  const mat = new THREE.PlaneGeometry(1.9, 1.5, 4, 4);
  const P = mat.attributes.position; for (let k = 0; k < P.count; k++) { const u = P.getX(k) / 0.95; P.setZ(k, Math.max(0, 1 - u * u) * 0.5); }
  mat.rotateX(-Math.PI / 2); mat.rotateY(Math.PI / 2);
  const mm = new THREE.Mesh(mat, new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0xb8a57a, roughness: 1, side: THREE.DoubleSide }));
  mm.position.set(x, world.heightAt(x, z) + 1.0, z); mm.rotation.y = rot; mm.castShadow = true;
  grp.add(mm);
  return grp;
}

// 馬印：大将の居場所を示す大きな印。竿の上に金の扇（kind が 'fukube' なら金の瓢箪）
const GOLD = new THREE.MeshStandardMaterial({ color: 0xc9a040, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
export function umajirushi(world, x, z, rot = 0, kind = 'ogi') {
  const grp = new THREE.Group();
  const pole = new THREE.CylinderGeometry(0.05, 0.07, 7.2, 6); pole.translate(0, 3.6, 0);
  grp.add(merged([paint(pole, 0x241a12)]));
  let g;
  if (kind === 'fukube') {
    g = mergeGeometries([new THREE.SphereGeometry(0.42, 10, 8).translate(0, 7.4, 0), new THREE.SphereGeometry(0.3, 10, 8).translate(0, 7.95, 0)]);
  } else {
    // 開いた扇：骨の数だけ少し折れる
    g = new THREE.CircleGeometry(1.0, 16, Math.PI * 0.12, Math.PI * 0.76);
    const P = g.attributes.position;
    for (let k = 0; k < P.count; k++) { const a = Math.atan2(P.getY(k), P.getX(k)); P.setZ(k, Math.sin(a * 16) * 0.03 * Math.hypot(P.getX(k), P.getY(k))); }
    g.computeVertexNormals(); g.translate(0, 6.7, 0.06);
  }
  const m = new THREE.Mesh(g, GOLD); m.castShadow = true; grp.add(m);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 陣一式：陣幕の囲い、中に床几の大将と左右に居並ぶ諸将、後ろに馬印と旗本の旗、口に番の兵、脇に旗竿の束・兵糧・馬を繋ぐ杭・炊事の鍋と煙
// (cx, cz) は陣幕の真ん中、w×d は陣幕の大きさ、mon は幕と旗の家紋。開いた口は南（+z）
// 人（大将・諸将・旗本・番の兵）は world.addDistantArmy の軽い兵で置く（少しずつ動く）。返す物の userData.people にその隊が入る
// o.people === false で人を置かない。o.armor は具足の色、o.generalArmor は大将と諸将の具足の色
export function jinCamp(world, cx, cz, o = {}) {
  const w = o.w || 16, d = o.d || 12, mon = o.mon || 'tokugawa';
  const grp = new THREE.Group();
  grp.add(jinmaku(world, cx, cz, w, d, o.gap || 6, { mon }));
  // 奥に大将の床几、左右に並ぶ諸将の床几
  grp.add(shogi(world, cx, cz - d / 2 + 2, 0, { gunbai: true, color: 0x5a1a14 }));
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) grp.add(shogi(world, cx + sx * 2.4, cz - d / 2 + 3.6 + i * 1.6, sx * Math.PI / 2));
  grp.add(hatazao(world, cx - w / 2 - 2.2, cz - d / 4, Math.PI / 2, 7, mon));
  grp.add(hyoro(world, cx + w / 2 + 2.6, cz - d / 4, 0.2));
  grp.add(umatsunagi(world, cx + w / 2 + 3, cz + d / 2 + 3, Math.PI / 2 + 0.2, 9));
  grp.add(nabe(world, cx - w / 2 - 3, cz + d / 2 + 3));
  if (o.fire !== false) grp.add(nabe(world, cx + w / 2 + 1.5, cz + d / 2 + 6));
  // 馬印は幕の後ろ、大将の真後ろに高く
  grp.add(umajirushi(world, cx + 0.6, cz - d / 2 - 1.2, 0, o.uma || 'ogi'));
  // 口の両脇に家紋の幟
  for (const sx of [-1, 1]) grp.add(nobori(world, cx + sx * ((o.gap || 6) / 2 + 0.6), cz + d / 2 + 0.6, mon, 5.5));
  if (o.people !== false && world.addDistantArmy) {
    const P = [{ x: cx, z: cz - d / 2 + 2, facing: 0, k: 'seated' }];
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) P.push({ x: cx + sx * 2.4, z: cz - d / 2 + 3.6 + i * 1.6, facing: -sx * Math.PI / 2, k: 'seated', helm: i === 2 ? 0 : 1 });
    // 大将の後ろに控える小姓と、幕の内の隅に立つ旗本
    P.push({ x: cx - 1.4, z: cz - d / 2 + 1.1, facing: 0, k: 'samurai', flag: 0 }, { x: cx + w / 2 - 1.2, z: cz + d / 2 - 1.4, facing: -2.4, k: 'samurai' }, { x: cx - w / 2 + 1.2, z: cz + d / 2 - 1.4, facing: 2.4, k: 'samurai' });
    const lead = world.addDistantArmy({ people: P, armor: o.generalArmor || 0x2a2622, flag: mon, seed: 5 + Math.round(cx), near: true });
    const G = [];
    // 口の番：槍を立てた兵が両脇に三人ずつ
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) G.push({ x: cx + sx * ((o.gap || 6) / 2 + 1.2 + i * 0.9), z: cz + d / 2 + 1.6 + (i % 2) * 0.5, facing: sx * 0.2, k: 'spear' });
    // 幕の後ろの旗本：幟を立てて並ぶ
    for (let i = 0; i < 8; i++) G.push({ x: cx - w / 2 + 1 + i * (w - 2) / 7, z: cz - d / 2 - 2.8 - (i % 2) * 0.8, facing: 0, k: 'banner' });
    // 脇に控える兵（鍋の周り・兵糧の番）
    G.push({ x: cx - w / 2 - 2.2, z: cz + d / 2 + 4.2, facing: 1.2, k: 'spear' }, { x: cx - w / 2 - 3.8, z: cz + d / 2 + 2.2, facing: 2.2, k: 'gun' }, { x: cx + w / 2 + 3.8, z: cz - d / 4 + 1.8, facing: -1.6, k: 'spear' });
    const guard = world.addDistantArmy({ people: G, armor: o.armor || 0x33302a, flag: mon, seed: 9 + Math.round(cz), near: true });
    grp.userData.people = [lead, guard];
  }
  return grp;
}

// 村（遠景）：茅葺きの家並み、田と畦、炊事の煙、柿の木。どれもまとめて少ない描画で
// o：{ n 家の数（既定 7）, r 家の散らばる広さ（既定 22）, rot 田の並びの向き, fields 田の数（既定 12）, smoke 煙を上げる家の数（既定 2）, seed, autumn（柿の実）}
// 田は家並みの南（rot の向きの前）に広がる。返す物は scene に add する
export function village(world, x, z, o = {}) {
  let s = (o.seed || 11) >>> 0; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = o.n ?? 7, rad = o.r ?? 22, rot = o.rot ?? 0;
  const c = Math.cos(rot), sn = Math.sin(rot);
  const W = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const walls = [], roofs = [], trees = [];
  const spots = [];
  for (let k = 0; k < n * 8 && spots.length < n; k++) {
    const lx = (R() - 0.5) * rad * 2, lz = (R() - 0.5) * rad;
    if (spots.some((q) => Math.hypot(q[0] - lx, q[1] - lz) < 11)) continue;
    spots.push([lx, lz]);
  }
  const roofMats = [];
  spots.forEach(([lx, lz], i) => {
    const [hx, hz] = W(lx, lz);
    const y = world.heightAt(hx, hz);
    const hw = 3.2 + R() * 1.6, hd = 2.4 + R() * 0.8, H = 2.1, rh = 3.2 + R() * 0.8, e = 0.9;
    const ry = rot + (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.3;
    const place = (g) => { g.rotateY(ry); g.translate(hx, y, hz); return g; };
    // 壁：下は板、上は土壁。戸口の暗がり
    const wall = new THREE.BoxGeometry(hw * 2, H, hd * 2); wall.translate(0, H / 2, 0); walls.push(paint(place(wall), vary(0x6e5a42, i)));
    const band = new THREE.BoxGeometry(hw * 2 + 0.04, 0.7, hd * 2 + 0.04); band.translate(0, H - 0.5, 0); walls.push(paint(place(band), vary(0xa89878, i + 3)));
    const door = new THREE.BoxGeometry(1.6, 1.7, 0.05); door.translate(-hw * 0.3, 0.85, hd + 0.02); walls.push(paint(place(door), 0x16120e));
    // 寄棟の厚い茅葺き屋根：四つの面と、軒の厚み、棟
    const ex = hw + e, ez = hd + e, rl = Math.max(0.6, ex - ez);
    const v = [
      [-ex, H, ez], [ex, H, ez], [rl, H + rh, 0], [-rl, H + rh, 0],
      [ex, H, -ez], [-ex, H, -ez], [-rl, H + rh, 0], [rl, H + rh, 0],
      [ex, H, ez], [ex, H, -ez], [rl, H + rh, 0],
      [-ex, H, -ez], [-ex, H, ez], [-rl, H + rh, 0],
    ];
    const pos = [], uv = [];
    const quad = (a, b, cc, d2) => { pos.push(...a, ...b, ...cc, ...a, ...cc, ...d2); };
    quad(v[0], v[1], v[2], v[3]); quad(v[4], v[5], v[6], v[7]);
    pos.push(...v[8], ...v[9], ...v[10], ...v[11], ...v[12], ...v[13]);
    // 軒の厚み（茅の切り口）
    const t = 0.45, ring = [[-ex, ez], [ex, ez], [ex, -ez], [-ex, -ez], [-ex, ez]];
    for (let k = 0; k < 4; k++) { const [ax, az] = ring[k], [bx, bz] = ring[k + 1]; quad([ax, H - t, az], [bx, H - t, bz], [bx, H, bz], [ax, H, az]); }
    // 軒の下（下から見ても中が抜けない）
    quad([-ex, H - t, -ez], [ex, H - t, -ez], [ex, H - t, ez], [-ex, H - t, ez]);
    for (let k = 0; k < pos.length; k += 3) uv.push((pos[k] + pos[k + 2]) * 0.35, pos[k + 1] * 0.5);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.computeVertexNormals();
    roofs.push(place(rg));
    // 棟（竹と杉皮で押さえた黒い棟）
    const mune = new THREE.BoxGeometry(rl * 2 + 0.6, 0.35, 0.5); mune.translate(0, H + rh + 0.05, 0); walls.push(paint(place(mune), 0x2a241c));
    roofMats.push({ hx, hz, top: y + H + rh, ry, rl });
    // 家の脇に柿の木
    if (R() < 0.75) {
      const [tx, tz] = W(lx + (R() < 0.5 ? -1 : 1) * (hw + 3 + R() * 2), lz + (R() - 0.5) * 4);
      const ty = world.heightAt(tx, tz);
      const trunk = new THREE.CylinderGeometry(0.14, 0.2, 2.4, 5); trunk.rotateZ((R() - 0.5) * 0.3); trunk.translate(tx, ty + 1.2, tz); trees.push(paint(trunk, 0x3a3026));
      for (let q = 0; q < 3; q++) {
        const cr = new THREE.IcosahedronGeometry(1.4 + R() * 0.6, 1); cr.scale(1.2, 0.8, 1.1);
        cr.translate(tx + (R() - 0.5) * 1.6, ty + 3 + R() * 0.8, tz + (R() - 0.5) * 1.6);
        trees.push(paint(cr, vary(0x3e4a2c, q + i)));
      }
      if (o.autumn) for (let q = 0; q < 14; q++) { const f = new THREE.OctahedronGeometry(0.12, 0); f.translate(tx + (R() - 0.5) * 3.2, ty + 2.6 + R() * 1.6, tz + (R() - 0.5) * 3.2); trees.push(paint(f, 0xd8701c)); }
    }
  });
  const grp = new THREE.Group();
  if (walls.length) { const m = merged(walls, new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = false; grp.add(m); }
  if (roofs.length) {
    const rm = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshLambertMaterial({ map: thatchTex(), color: 0x9a8a6a }));
    rm.userData.camBlock = true; grp.add(rm);
  }
  if (trees.length) grp.add(new THREE.Mesh(mergeGeometries(trees), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // 田と畦：家並みの前に、段になった小さな田が並ぶ。水を張った田に空が映る
  const nf = o.fields ?? 12, cols = Math.max(2, Math.round(Math.sqrt(nf * 1.6))), fw = 14, fd = 9;
  const water = [], aze = [];
  for (let k = 0; k < nf; k++) {
    const ci = k % cols, ri = Math.floor(k / cols);
    const lx0 = (ci - cols / 2) * (fw + 0.8), lz0 = rad * 0.5 + 6 + ri * (fd + 0.8);
    const g = new THREE.PlaneGeometry(fw, fd, 4, 3); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    // 田の面は平ら（真ん中の高さ）、畦は縁の高さに沿う
    const [mx, mz] = W(lx0 + fw / 2, lz0 + fd / 2);
    const my = world.heightAt(mx, mz) + 0.05;
    for (let q = 0; q < P.count; q++) { const [wx, wz] = W(lx0 + fw / 2 + P.getX(q), lz0 + fd / 2 + P.getZ(q)); P.setXYZ(q, wx, Math.max(my, world.heightAt(wx, wz) + 0.03), wz); }
    g.computeVertexNormals();
    water.push(g);
    const ring = [[0, 0], [fw, 0], [fw, fd], [0, fd], [0, 0]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = ring[e], [bx, bz] = ring[e + 1];
      for (let q = 0; q < 3; q++) {
        const t0 = q / 3, t1 = (q + 1) / 3;
        const [x0, z0] = W(lx0 + ax + (bx - ax) * t0, lz0 + az + (bz - az) * t0), [x1, z1] = W(lx0 + ax + (bx - ax) * t1, lz0 + az + (bz - az) * t1);
        const L = Math.hypot(x1 - x0, z1 - z0);
        const b = new THREE.BoxGeometry(0.5, 0.3, L + 0.1);
        b.rotateY(Math.atan2(x1 - x0, z1 - z0));
        const bxm = (x0 + x1) / 2, bzm = (z0 + z1) / 2;
        b.translate(bxm, Math.max(my, world.heightAt(bxm, bzm)) + 0.08, bzm);
        aze.push(paint(b, vary(0x6a6a44, e + q + k)));
      }
    }
  }
  if (water.length) {
    const wm = new THREE.Mesh(mergeGeometries(water), new THREE.MeshStandardMaterial({ color: 0x5f6e62, roughness: 0.28, metalness: 0.15 }));
    wm.receiveShadow = true; grp.add(wm);
    // 植えたばかりの苗の筋（水面の上に薄い緑）
    const ne = new THREE.Mesh(mergeGeometries(water.map((g) => g.clone().translate(0, 0.04, 0))), new THREE.MeshLambertMaterial({ color: 0x6f8a4a, transparent: true, opacity: 0.35, depthWrite: false }));
    grp.add(ne);
  }
  if (aze.length) grp.add(new THREE.Mesh(mergeGeometries(aze), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // 炊事の煙：いくつかの家の棟の端から昇る
  if (world.addSmokeColumn) roofMats.slice(0, o.smoke ?? 2).forEach((h) => world.addSmokeColumn(h.hx + Math.sin(h.ry + Math.PI / 2) * h.rl, h.top, h.hz + Math.cos(h.ry + Math.PI / 2) * h.rl, { size: 0.8 }));
  return grp;
}
