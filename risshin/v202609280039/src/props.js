import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, jinmakuTexture } from './textures.js';
import { GUST, WIND_STATE, WET } from './world.js';
import { woodTex, thatchTex, barkTex, dirtTex } from './nature.js';
import { FLAG_T } from './units.js';

// ---------------- 置き物の当たり ----------------
// 建物・陣幕・置き物の足もとの形（人と馬が通り抜けないように）。戦の始めに battle.js が空にして army.solids に渡し、
// units.js の collide が押し戻す（柵・門のような「壊せる・戦の筋に関わる」物は army.addStruct のまま。こちらは押し戻すだけ）
// 形は三つ：'r' 回した四角（x, z が真ん中、hw・hd が半分の幅と奥行き、rot）、'c' 円、's' 太さのある線分
export const SOLIDS = [];
const aabb = (o, pts) => { o.x0 = Math.min(...pts.map((p) => p[0])); o.x1 = Math.max(...pts.map((p) => p[0])); o.z0 = Math.min(...pts.map((p) => p[1])); o.z1 = Math.max(...pts.map((p) => p[1])); return o; };
export function solidRect(x, z, w, d, rot = 0) {
  const c = Math.cos(rot), sn = Math.sin(rot), hw = w / 2, hd = d / 2;
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * sn, z - lx * sn + lz * c]);
  const o = aabb({ k: 'r', x, z, hw, hd, c, s: sn }, pts);
  SOLIDS.push(o);
  return o;
}
export function solidCircle(x, z, r) { const o = { k: 'c', x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r }; SOLIDS.push(o); return o; }
export function solidSeg(ax, az, bx, bz, r = 0.12) { const o = aabb({ k: 's', ax, az, bx, bz, r }, [[ax - r, az - r], [bx + r, bz + r], [ax + r, az + r], [bx - r, bz - r]]); SOLIDS.push(o); return o; }

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
  // o.solid：飾りの柵にも当たりを付ける（壊せる柵は army.addStruct の方で当たる）
  if (o.solid) solidSeg(ax, az, bx, bz, 0.15);
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

// 陣幕の布：風（幟と同じ時計と突風）で裾ほど大きく、ゆっくりふくらむ。濡れると重く揺れが小さい（A4）
function jinmakuMat(t) {
  const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T; sh.uniforms.uGust = GUST; sh.uniforms.uWet = WET;
    sh.vertexShader = 'uniform float uFlagT, uGust, uWet;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float jk = 1.0 - uv.y;
      float jp = position.x * 0.9 + position.z * 0.7;
      float jA = (0.05 + uGust * 0.05) * (1.0 - uWet * 0.6);
      transformed += objectNormal * (sin(uFlagT * 1.1 + jp) * 0.6 + sin(uFlagT * 2.3 + jp * 2.1) * 0.4) * jA * jk;`);
  };
  return m;
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
  // 幕は通り抜けられない（開いた口だけ通れる）
  if (o.solid !== false) for (const [ax, az, bx, bz] of sides) if (Math.hypot(bx - ax, bz - az) > 0.5) solidSeg(ax, az, bx, bz, 0.12);
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
    const m = new THREE.Mesh(mergeGeometries(cloths), jinmakuMat(t));
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
  // 幟ごとに高さと竿の傾きを少しずつ変える（手で立てた幟が一列に揃いすぎないように。場所で決まるので毎回同じ）
  const rr = (k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.7) * 43758.5453; return v - Math.floor(v); };
  h *= 0.92 + rr(1) * 0.16;
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
  grp.rotation.x = (rr(2) - 0.5) * 0.07; grp.rotation.z = (rr(3) - 0.5) * 0.07;
  grp.userData.flag = flag;
  return grp;
}

export function hut(world, x, z, w, d, rot = 0, o = {}) {
  const y = world.heightAt(x, z);
  if (o.solid !== false) solidRect(x, z, w + 0.3, d + 0.3, rot);
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
  solidRect(x, z, 4.1, 1.4, rot);
  return m;
}

export function yagura(world, x, z) {
  // 櫓の四本の脚（下は通れる）
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solidCircle(x + dx * 1.1, z + dz * 1.1, 0.25);
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
  solidCircle(x, z, 0.55);
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
  { const c = Math.cos(rot), sn = Math.sin(rot); for (const [dx, dz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) solidCircle(x + dx * c + dz * sn, z - dx * sn + dz * c, 0.2); }
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
  solidRect(x, z, 1.1, n > 3 ? 1.8 : 1.3, rot);
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
    const t = i / n, r = ((i * 7919) % 101) / 101, r2 = ((i * 104729 + Math.round(ax * 7)) % 97) / 97;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const y = world.heightAt(x, z);
    const h = 1.85 + r * 0.35;
    // 丸太は山から伐ったまま：太さも傾きも一本ずつ違う
    const rad = 0.06 + r2 * 0.045;
    const post = new THREE.CylinderGeometry(rad, rad * 1.25, h + 0.4, 7);
    post.rotateZ((r - 0.5) * 0.12); post.rotateX((r2 - 0.5) * 0.1);
    post.translate(x, y + h / 2 - 0.2, z);
    parts.push(paintWorn(post, vary(0x7a5c40, i), y, h));
    // 柱の頭は斜めに切る
    const tip = new THREE.ConeGeometry(rad * 1.05, 0.18, 7);
    tip.translate(x + (r - 0.5) * 0.1, y + h + 0.08, z);
    parts.push(paint(tip, vary(0x9a7a56, i + 5)));
    // 敵の側へ倒した支え（三本に一本）
    if (i % 3 === 1) {
      const br = new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6);
      br.rotateX(0.62); br.rotateY(ang);
      br.translate(x - px * 0.55, y + 0.62, z - pz * 0.55);
      parts.push(paintWorn(br, 0x5e4630, y, 1.4));
    }
  }
  // 柵の前（敵の側）の乱杭：先を尖らせた短い杭を、敵へ向けて斜めに不揃いに打つ（A4。見た目だけ）
  for (let i = 0; i < n; i++) {
    const r = ((i * 7919 + 13) % 101) / 101, r2 = ((i * 104729 + 7) % 97) / 97;
    const t = (i + 0.3 + r * 0.4) / n, d = 1.1 + r2 * 0.9;
    const x = ax + (bx - ax) * t + px * d, z = az + (bz - az) * t + pz * d, y = world.heightAt(x, z);
    const h = 0.7 + r * 0.5;
    const g = new THREE.CylinderGeometry(0.012, 0.05, h, 5);
    g.translate(0, h / 2, 0); g.rotateX(0.55 + r2 * 0.3); g.rotateY(ang + Math.PI / 2 + (r - 0.5) * 0.5);   // 上を敵の側（+p）へ倒す
    g.translate(x, y - 0.1, z);
    parts.push(paintWorn(g, vary(0x6e5236, i + 9), y, h));
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
  solidRect(x, z, 2.6, 1.2, rot);
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
  solidSeg(x - len / 2 * Math.cos(rot), z + len / 2 * Math.sin(rot), x + len / 2 * Math.cos(rot), z - len / 2 * Math.sin(rot), 0.15);
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
  solidCircle(x, z, 0.7);
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
  // 口の外に、手盾（板の楯）を並べて口の左右を固める。本陣へは口からしか入れない
  if (o.tate !== false) {
    const g2 = (o.gap || 6) / 2, zf = cz + d / 2 + 2.2;
    grp.add(tateNarabi(world, cx - w / 2 - 1, zf, cx - g2 - 1.2, zf), tateNarabi(world, cx + g2 + 1.2, zf, cx + w / 2 + 1, zf));
  }
  // 陣太鼓（台に据えた大太鼓）と、床几の脇の法螺貝
  grp.add(jindaiko(world, cx + w / 2 - 2, cz - d / 2 + 2.2, -0.4));
  grp.add(horagai(world, cx + 0.7, cz - d / 2 + 2.1));
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
  const ry0 = (i) => rot + i * 1.3;
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
    solidRect(hx, hz, hw * 2 + 0.3, hd * 2 + 0.3, ry);
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
  // 井戸（石の井筒と、つるべの屋根）・干し物（竿に掛けた布）・置き去りの荷車。家ごとに少しずつ
  spots.forEach(([lx, lz], i) => {
    const k = R();
    if (i === 0 || k < 0.25) {
      const [wx, wz] = W(lx + 6, lz + 4); const wy = world.heightAt(wx, wz);
      const ring = new THREE.CylinderGeometry(0.6, 0.65, 0.7, 10, 1, true); ring.translate(wx, wy + 0.35, wz); walls.push(paint(ring, 0x7a756a));
      solidCircle(wx, wz, 0.75);
      const water = new THREE.CircleGeometry(0.55, 10); water.rotateX(-Math.PI / 2); water.translate(wx, wy + 0.5, wz); walls.push(paint(water, 0x1a1c1c));
      for (const sx of [-0.7, 0.7]) { const p = new THREE.BoxGeometry(0.1, 1.9, 0.1); p.translate(wx + sx, wy + 0.95, wz); walls.push(paint(p, 0x4a3a28)); }
      const rf = new THREE.BoxGeometry(1.9, 0.08, 1.2); rf.rotateZ(0.05); rf.translate(wx, wy + 1.95, wz); walls.push(paint(rf, 0x3a342c));
    } else if (k < 0.6) {
      const [ax, az] = W(lx - 4, lz + 4), [bx, bz] = W(lx + 1, lz + 4.6);
      for (const [px2, pz2] of [[ax, az], [bx, bz]]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 1.8, 4); p.translate(px2, world.heightAt(px2, pz2) + 0.9, pz2); walls.push(paint(p, 0x5a4a34)); }
      for (let q = 0; q < 3; q++) {
        const t = 0.2 + q * 0.28, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        const cl = new THREE.PlaneGeometry(0.7, 0.9); cl.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2); cl.translate(cx, world.heightAt(cx, cz) + 1.3, cz);
        walls.push(paint(cl, [0x3a4a6a, 0xa89a80, 0x6a4a3a][q]));
      }
    } else if (k < 0.75) {
      // 荷車：二つの車輪と荷台。逃げた後に置き去りにされ、荷が崩れている
      const [cx, cz] = W(lx + 5, lz - 3); const cy = world.heightAt(cx, cz), cr = ry0(i);
      solidRect(cx, cz, 1.8, 2.6, cr);
      const bed = new THREE.BoxGeometry(1.2, 0.12, 2.4); bed.rotateX(0.18); bed.rotateY(cr); bed.translate(cx, cy + 0.55, cz); walls.push(paint(bed, 0x5a4630));
      for (const sd of [-1, 1]) { const wh = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10); wh.rotateZ(Math.PI / 2); wh.rotateY(cr); wh.translate(cx + Math.cos(cr) * sd * 0.7, cy + 0.5, cz - Math.sin(cr) * sd * 0.7); walls.push(paint(wh, 0x3a2c1e)); }
      for (let q = 0; q < 3; q++) { const b = new THREE.BoxGeometry(0.5, 0.35, 0.4); b.rotateY(q); b.translate(cx + (q - 1) * 0.6 + 0.9, cy + 0.18, cz + (q % 2) * 0.5); walls.push(paint(b, vary(0x8a7650, q))); }
    }
  });
  // 竹林：家並みの裏（田と反対の側）に、細く高い竹が群れて立つ（尾張・美濃の里の景色）
  const bam = o.bamboo ?? 2;
  for (let bI = 0; bI < bam; bI++) {
    const [bx, bz] = W((R() - 0.5) * rad * 1.6, -rad * 0.6 - 6 - R() * 6);
    for (let q = 0; q < 26; q++) {
      const x = bx + (R() - 0.5) * 9, z = bz + (R() - 0.5) * 6, y = world.heightAt(x, z), H = 8 + R() * 5;
      const st = new THREE.CylinderGeometry(0.05, 0.07, H, 5); st.rotateZ((R() - 0.5) * 0.12); st.translate(x, y + H / 2, z);
      trees.push(paint(st, vary(0x7a8a4a, q)));
      // 竹の葉：上の方にしだれる細い葉の塊
      for (let l = 0; l < 2; l++) { const lf = new THREE.ConeGeometry(0.9 + R() * 0.5, 2.6, 5); lf.rotateX(Math.PI); lf.translate(x + (R() - 0.5), y + H - 1 - l * 1.8, z + (R() - 0.5)); trees.push(paint(lf, vary(0x4e6a34, q + l))); }
    }
  }
  const grp = new THREE.Group();
  if (walls.length) { const m = merged(walls, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.castShadow = false; grp.add(m); }
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

// 瓦の屋根：黒灰の瓦の筋（縦の丸瓦の列と、軒の段）を描いた絵
let tileTexC = null;
function tileTex() {
  if (tileTexC) return tileTexC;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4846'; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) { g.fillStyle = '#2c2b2a'; g.fillRect(x, 0, 3, 64); g.fillStyle = '#5a5856'; g.fillRect(x + 3, 0, 1, 64); }
  for (let y = 0; y < 64; y += 16) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, 64, 2); }
  // 雨だれの汚れと、ところどころの苔
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${60 + Math.random() * 30},${70 + Math.random() * 30},50,${Math.random() * 0.15})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 4, 2 + Math.random() * 6); }
  tileTexC = new THREE.CanvasTexture(c);
  tileTexC.wrapS = tileTexC.wrapT = THREE.RepeatWrapping;
  tileTexC.colorSpace = THREE.SRGBColorSpace;
  return tileTexC;
}
const TILE = new THREE.MeshStandardMaterial({ map: tileTex(), bumpMap: tileTex(), bumpScale: 1.4, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide });

// 寄棟の屋根の形（軒 ex×ez、高さ rh、棟の半分 rl、軒先の反り）。y は軒の高さ
function hipGeo(ex, ez, rh, y, rl = Math.max(0.4, ex - ez)) {
  const v = [
    [-ex, y, ez], [ex, y, ez], [rl, y + rh, 0], [-rl, y + rh, 0],
    [ex, y, -ez], [-ex, y, -ez], [-rl, y + rh, 0], [rl, y + rh, 0],
  ];
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(v[0], v[1], v[2], v[3]); quad(v[4], v[5], v[6], v[7]);
  pos.push(ex, y, ez, ex, y, -ez, rl, y + rh, 0, -ex, y, -ez, -ex, y, ez, -rl, y + rh, 0);
  // 軒の厚み
  const t = 0.22, ring = [[-ex, ez], [ex, ez], [ex, -ez], [-ex, -ez], [-ex, ez]];
  for (let k = 0; k < 4; k++) { const [ax, az] = ring[k], [bx, bz] = ring[k + 1]; quad([ax, y - t, az], [bx, y - t, bz], [bx, y, bz], [ax, y, az]); }
  quad([-ex, y - t, -ez], [ex, y - t, -ez], [ex, y - t, ez], [-ex, y - t, ez]);
  const uv = [];
  for (let k = 0; k < pos.length; k += 3) uv.push((pos[k] + pos[k + 2] * 0.3) * 0.5, (pos[k + 1] + Math.abs(pos[k + 2])) * 0.5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 楼門：二階建ての寺の門。下は柱の間を通り、上に高欄を回した楼、二重の瓦の屋根。
// 冠木門（kabukimon）と同じく、w は通り道の幅、rot で向き（rot = π/2 で東西に通る）
export function romon(world, x, z, w = 6.4, rot = 0) {
  const parts = [], tiles = [];
  // 両脇の柱の並び（真ん中は通れる）
  { const c = Math.cos(rot), sn = Math.sin(rot), W2 = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) { const [ax, az] = W2(sx, -1.6), [bx, bz] = W2(sx, 1.6); solidSeg(ax, az, bx, bz, 0.35); } }
  const D = 1.6, H = 3.6, col = 0x5e4230;
  for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) for (const sz of [-D, 0, D]) {
    const p = new THREE.CylinderGeometry(0.2, 0.22, H + 2.6, 10); p.translate(sx, (H + 2.6) / 2, sz); parts.push(paint(p, vary(col, sx * 3 + sz)));
    const base = new THREE.CylinderGeometry(0.34, 0.4, 0.28, 8); base.translate(sx, 0.14, sz); parts.push(paint(base, 0x8a857a));
  }
  // 貫と、上の楼の床
  for (const y of [H - 0.8, H]) { const b = new THREE.BoxGeometry(w + 1.2, 0.26, 0.24); b.translate(0, y, D); parts.push(paint(b, 0x4e3624)); const b2 = b.clone(); b2.translate(0, 0, -2 * D); parts.push(paint(b2, 0x4e3624)); }
  // 下の屋根（腰の屋根）
  tiles.push(hipGeo(w / 2 + 1.9, D + 1.7, 0.7, H + 0.2, w / 2 + 1.2));
  // 楼：板壁と、まわりの高欄
  const room = new THREE.BoxGeometry(w + 0.4, 2.0, 2 * D + 0.2); room.translate(0, H + 1.9, 0); parts.push(paint(room, 0x6a4c34));
  const plaster = new THREE.BoxGeometry(w + 0.44, 0.6, 2 * D + 0.24); plaster.translate(0, H + 2.5, 0); parts.push(paint(plaster, 0xcfc6b2));
  const deck = new THREE.BoxGeometry(w + 1.6, 0.14, 2 * D + 1.4); deck.translate(0, H + 0.95, 0); parts.push(paint(deck, 0x4a3422));
  for (const [lx, lz, L, rotY] of [[0, D + 0.7, w + 1.6, 0], [0, -D - 0.7, w + 1.6, 0], [w / 2 + 0.8, 0, 2 * D + 1.4, Math.PI / 2], [-w / 2 - 0.8, 0, 2 * D + 1.4, Math.PI / 2]]) {
    const r = new THREE.BoxGeometry(L, 0.08, 0.1); r.rotateY(rotY); r.translate(lx, H + 1.55, lz); parts.push(paint(r, 0x3a2818));
  }
  // 上の大屋根と棟
  tiles.push(hipGeo(w / 2 + 2.2, D + 2.0, 1.9, H + 3.0, w / 2 + 0.6));
  const mune = new THREE.BoxGeometry(w + 1.6, 0.34, 0.4); mune.translate(0, H + 4.95, 0); parts.push(paint(mune, 0x222120));
  const grp = new THREE.Group();
  grp.add(merged(parts));
  const tm = new THREE.Mesh(mergeGeometries(tiles), TILE); tm.castShadow = true; tm.receiveShadow = true; tm.userData.camBlock = true;
  grp.add(tm);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 寺の堂：石の基壇に柱を並べ、縁側を回し、軒の深い瓦の大屋根。w×d は堂の身舎（もや）の大きさ、rot で向き（正面は +z）
export function dou(world, x, z, w = 10, d = 7, rot = 0, o = {}) {
  const parts = [], tiles = [];
  solidRect(x, z, w + 3.4, d + 3.4, rot);
  const y0 = 0.7, H = o.h || 3.6;
  // 基壇（まわりの地面の低い所に合わせて深めに）
  const base = new THREE.BoxGeometry(w + 3.4, y0 + 1.2, d + 3.4); base.translate(0, y0 / 2 - 0.6, 0); parts.push(paint(base, 0x8a857a));
  // 縁側と、正面の階
  const en = new THREE.BoxGeometry(w + 2.4, 0.12, d + 2.4); en.translate(0, y0 + 0.3, 0); parts.push(paint(en, 0x5a4230));
  for (let s = 0; s < 3; s++) { const st = new THREE.BoxGeometry(2.4, 0.2, 0.5); st.translate(0, 0.1 + s * 0.2, d / 2 + 1.5 + (2 - s) * 0.45); parts.push(paint(st, 0x7a756a)); }
  // 身舎：板壁の下半分と、白い上半分。正面は格子戸の暗がり
  const wall = new THREE.BoxGeometry(w, H, d); wall.translate(0, y0 + 0.3 + H / 2, 0); parts.push(paint(wall, o.wall || 0x5a3e2a));
  const up = new THREE.BoxGeometry(w + 0.04, H * 0.3, d + 0.04); up.translate(0, y0 + 0.3 + H * 0.85, 0); parts.push(paint(up, 0xcdc4b0));
  const door = new THREE.BoxGeometry(w * 0.5, H * 0.62, 0.06); door.translate(0, y0 + 0.3 + H * 0.31, d / 2 + 0.03); parts.push(paint(door, 0x1c1610));
  for (let i = 0; i <= 6; i++) { const b = new THREE.BoxGeometry(0.05, H * 0.62, 0.08); b.translate(-w * 0.25 + i * w * 0.5 / 6, y0 + 0.3 + H * 0.31, d / 2 + 0.07); parts.push(paint(b, 0x4a3422)); }
  // 縁の柱
  const nx = Math.max(2, Math.round(w / 2.4)), nz = Math.max(2, Math.round(d / 2.4));
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) { const p = new THREE.CylinderGeometry(0.17, 0.19, H + 0.4, 8); p.translate(-w / 2 - 0.5 + i * (w + 1) / nx, y0 + 0.3 + (H + 0.4) / 2, sz * (d / 2 + 0.5)); parts.push(paint(p, vary(0x5e4230, i))); }
  for (let i = 1; i < nz; i++) for (const sx of [-1, 1]) { const p = new THREE.CylinderGeometry(0.17, 0.19, H + 0.4, 8); p.translate(sx * (w / 2 + 0.5), y0 + 0.3 + (H + 0.4) / 2, -d / 2 - 0.5 + i * (d + 1) / nz); parts.push(paint(p, vary(0x5e4230, i + 5))); }
  // 大屋根：軒は深く、屋根は高く
  const ey = y0 + H + 0.8;
  tiles.push(hipGeo(w / 2 + 2.4, d / 2 + 2.4, (d / 2 + 2.4) * 0.8, ey, w / 2 * 0.55));
  const mune = new THREE.BoxGeometry(w * 0.55 + 0.6, 0.4, 0.5); mune.translate(0, ey + (d / 2 + 2.4) * 0.8 + 0.1, 0); parts.push(paint(mune, 0x222120));
  const grp = new THREE.Group();
  grp.add(merged(parts));
  const tm = new THREE.Mesh(mergeGeometries(tiles), TILE); tm.castShadow = true; tm.receiveShadow = true; tm.userData.camBlock = true;
  grp.add(tm);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  grp.userData.roofY = ey;
  return grp;
}

// 梯子：竹の二本の親柱に横木。foot と top は世界の座標 { x, y, z }
export function hashigo(foot, top) {
  const parts = [];
  const dx = top.x - foot.x, dy = top.y - foot.y, dz = top.z - foot.z;
  const len = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz) || 1;
  const sx = -dz / hl * 0.28, sz = dx / hl * 0.28;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.045, 0.055, len + 0.5, 5);
    g.applyQuaternion(q); g.translate(foot.x + dx / 2 + sx * s, foot.y + dy / 2 + 0.25, foot.z + dz / 2 + sz * s);
    parts.push(paint(g, 0x8a7a50));
  }
  const n = Math.round(len / 0.36);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const g = new THREE.CylinderGeometry(0.028, 0.028, 0.6, 4); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(sz, -sx) + Math.PI / 2);
    g.translate(foot.x + dx * t, foot.y + dy * t, foot.z + dz * t);
    parts.push(paint(g, 0x6b5a3c));
  }
  return merged(parts);
}

// 小舟：川を渡る平底の舟（舳先が反り上がる）。前は +z。水面の高さ y に浮かべる
export function kobune(x, y, z, rot = 0, len = 7) {
  const parts = [];
  const hw = 0.8, n = 6;
  for (let i = 0; i < n; i++) {
    const t0 = i / n - 0.5, t1 = (i + 1) / n - 0.5;
    const w0 = hw * (1 - Math.pow(Math.abs(t0) * 2, 3) * 0.6), w1 = hw * (1 - Math.pow(Math.abs(t1) * 2, 3) * 0.6);
    const L = (t1 - t0) * len, zc = (t0 + t1) / 2 * len, lift = t1 > 0.3 ? (t1 - 0.3) * 1.6 : 0;
    const bot = new THREE.BoxGeometry((w0 + w1), 0.08, L + 0.02); bot.translate(0, 0.05 + lift * 0.5, zc); parts.push(paint(bot, 0x4a3a28));
    for (const s of [-1, 1]) { const side = new THREE.BoxGeometry(0.07, 0.5, L + 0.04); side.translate(s * (w0 + w1) / 2, 0.3 + lift * 0.6, zc); parts.push(paint(side, vary(0x5a4630, i))); }
  }
  // 棹
  const sao = new THREE.CylinderGeometry(0.03, 0.03, 4.5, 4); sao.rotateX(0.5); sao.translate(0.4, 1.6, -len * 0.3); parts.push(paint(sao, 0x8a7a50));
  const m = merged(parts);
  m.userData.camBlock = false;
  m.position.set(x, y, z);
  m.rotation.y = rot;
  return m;
}

// 稲架（はさ）：刈った稲を掛けて干す木組み。刈田の畦に立てる。前は +z
export function hasa(world, x, z, rot = 0, len = 8) {
  const parts = [];
  solidRect(x, z, len + 0.4, 0.6, rot);
  const n = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const lx = (i / n - 0.5) * len;
    for (const s of [-1, 1]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 2.1, 4); p.rotateX(s * 0.18); p.translate(lx, 1.0, s * 0.18); parts.push(paint(p, 0x5a4a34)); }
  }
  for (const y of [1.0, 1.5]) {
    const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.4, 4); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); parts.push(paint(bar, 0x6a5a40));
    // 掛けた稲束（黄金の藁の房が並ぶ）
    for (let k = 0; k < Math.round(len / 0.35); k++) {
      const lx = -len / 2 + 0.2 + k * 0.35;
      const b = new THREE.ConeGeometry(0.17, 0.75, 4); b.rotateX(Math.PI); b.translate(lx, y - 0.32, 0);
      parts.push(paint(b, vary(0xb89a50, k)));
    }
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 塗輿（ぬりごし）：黒漆に金の金具の輿。二本の長柄で担ぐ。前は +z
export function koshi(world, x, z, rot = 0, o = {}) {
  const parts = [];
  if (!o.moving) solidRect(x, z, 1.4, 1.6, rot);
  const tilt = o.dropped ? 0.12 : 0;
  const body = new THREE.BoxGeometry(1.0, 1.05, 1.3); body.translate(0, 0.95, 0); parts.push(paint(body, 0x141210));
  const roof = new THREE.BoxGeometry(1.25, 0.14, 1.55); roof.translate(0, 1.55, 0); parts.push(paint(roof, 0x1a1816));
  const roof2 = new THREE.BoxGeometry(0.9, 0.12, 1.25); roof2.translate(0, 1.68, 0); parts.push(paint(roof2, 0x141210));
  // 金の縁と金具、簾の窓
  for (const y of [0.45, 1.46]) { const b = new THREE.BoxGeometry(1.04, 0.05, 1.34); b.translate(0, y, 0); parts.push(paint(b, 0xb08a38)); }
  const win = new THREE.BoxGeometry(0.02, 0.45, 0.8); win.translate(0.51, 1.0, 0); parts.push(paint(win, 0x6a5a38));
  const win2 = win.clone(); win2.translate(-1.02, 0, 0); parts.push(paint(win2, 0x6a5a38));
  // 長柄（担ぎ棒）
  for (const sx of [-0.62, 0.62]) { const p = new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6); p.rotateX(Math.PI / 2); p.translate(sx, 0.95, 0); parts.push(paint(p, 0x2a1c12)); }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z) + (o.dropped ? -0.45 : 0), z);
  m.rotation.set(tilt, rot, o.dropped ? 0.08 : 0);
  return m;
}

// 陣太鼓：胴の太い太鼓を木の台に斜めに据える（号令の太鼓）
export function jindaiko(world, x, z, rot = 0) {
  const parts = [];
  solidCircle(x, z, 0.6);
  const body = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14, 1, true); body.rotateZ(Math.PI / 2); body.scale(1, 1.08, 1.08); body.translate(0, 1.05, 0); parts.push(paint(body, 0x5a2a1a));
  for (const sx of [-0.26, 0.26]) { const hd = new THREE.CircleGeometry(0.45, 14); hd.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); hd.translate(sx, 1.05, 0); parts.push(paint(hd, 0xc8b690)); }
  for (const sx of [-0.25, 0.25]) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const nb = new THREE.SphereGeometry(0.025, 4, 3); nb.translate(sx, 1.05 + Math.sin(a) * 0.44, Math.cos(a) * 0.44); parts.push(paint(nb, 0x1a1816)); }
  // 台
  for (const sz of [-0.35, 0.35]) { const l = new THREE.BoxGeometry(0.08, 0.9, 0.08); l.rotateX(sz > 0 ? -0.25 : 0.25); l.translate(0, 0.45, sz); parts.push(paint(l, 0x3a2c1e)); }
  const bar = new THREE.BoxGeometry(0.1, 0.08, 0.9); bar.translate(0, 0.62, 0); parts.push(paint(bar, 0x3a2c1e));
  // 撥
  for (const sz of [-0.1, 0.1]) { const b = new THREE.CylinderGeometry(0.02, 0.025, 0.45, 5); b.rotateZ(1.2); b.translate(0.45, 0.66, sz); parts.push(paint(b, 0x6a5a40)); }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}
// 法螺貝：床几の脇の小さな台に置く
export function horagai(world, x, z) {
  const parts = [];
  const shell = new THREE.ConeGeometry(0.12, 0.42, 9); shell.rotateZ(Math.PI / 2); shell.translate(0, 0.52, 0); parts.push(paint(shell, 0xd8c8a4));
  const mouth = new THREE.TorusGeometry(0.1, 0.03, 5, 10); mouth.rotateY(Math.PI / 2); mouth.translate(-0.21, 0.52, 0); parts.push(paint(mouth, 0xb88a6a));
  const tbl = new THREE.BoxGeometry(0.4, 0.4, 0.3); tbl.translate(0, 0.2, 0); parts.push(paint(tbl, 0x2a1e14));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}

// 手に持つ松明：units の者の手もとに小さな火を付け、update() で一緒に動かす（倒れたら消す）
// 夜の戦で、兵の一部にだけ持たせる（足もとが明るく、光の数は絞る）
export function carryTorches(world, units) {
  const list = units.filter((u) => u && u.alive).map((u) => {
    const f = world.addFire(u.pos.x, u.pos.z, { torch: true, h: 2.1 });
    if (f.smoke != null && world.removeSmokeColumn) { world.removeSmokeColumn(f.smoke); f.smoke = null; }
    return { u, f };
  });
  return {
    update() {
      for (const c of list) {
        const u = c.u, f = c.f;
        if (!f) continue;
        if (!u.alive) { world.removeFire(f); c.f = null; continue; }
        const h = u.heading || 0, x = u.pos.x + Math.cos(h) * 0.35, z = u.pos.z - Math.sin(h) * 0.35, y = world.heightAt(x, z) + 2.1;
        f.x = x; f.z = z; f.base = y + f.size * 0.3;
        f.flame.position.set(x, f.base, z); f.inner.position.set(x, f.base - f.size * 0.08, z);
        if (f.glow) f.glow.position.set(x, world.heightAt(x, z) + 0.06, z);
        if (f.light) f.light.position.set(x, y + 0.8, z);
      }
    },
  };
}

// 手盾の並び：板を矧いだ楯を、斜めの支えで地に立てて一列に並べる（当たり付き）
export function tateNarabi(world, ax, az, bx, bz) {
  const parts = [];
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.95)), ang = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = world.heightAt(x, z);
    const pl = new THREE.BoxGeometry(0.9, 1.6, 0.06); pl.rotateX(-0.12); pl.rotateY(ang + Math.PI / 2); pl.translate(x, y + 0.8, z); parts.push(paint(pl, vary(0x6a5238, i)));
    for (const yy of [0.35, 1.25]) { const b = new THREE.BoxGeometry(0.92, 0.07, 0.08); b.rotateY(ang + Math.PI / 2); b.translate(x, y + yy, z); parts.push(paint(b, 0x2e241a)); }
    const st = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4); st.rotateX(0.6); st.rotateY(ang + Math.PI / 2); st.translate(x - Math.cos(ang) * 0.4, y + 0.6, z + Math.sin(ang) * 0.4); parts.push(paint(st, 0x4a3826));
  }
  solidSeg(ax, az, bx, bz, 0.25);
  return merged(parts);
}

// 武将について歩く馬印：馬印持ちが武将の 2m 後ろで竿を立てて付いて行く（update() を毎コマ呼ぶ）
export function umaFollow(world, scene, unit, kind = 'ogi') {
  const m = umajirushi(world, unit.pos.x, unit.pos.z, 0, kind);
  scene.add(m);
  return {
    mesh: m,
    update(dt) {
      if (!unit.alive) { m.rotation.z = Math.min(1.3, m.rotation.z + dt * 1.5); return; }
      const h = unit.heading || 0, x = unit.pos.x - Math.sin(h) * 2.2, z = unit.pos.z - Math.cos(h) * 2.2;
      m.position.x += (x - m.position.x) * Math.min(1, dt * 3); m.position.z += (z - m.position.z) * Math.min(1, dt * 3);
      m.position.y = world.heightAt(m.position.x, m.position.z);
      m.rotation.y = h;
    },
  };
}

// ======================================================================
// 城の部品（石垣・土塀・隅櫓・櫓門・天守・逆茂木・竹束・篝火）
// 稲葉山・小谷・有岡・墨俣など、戦の定義から置く。素材は一揃いを使い回し、一つの建物は素材ごとに一つの形にまとめる
// 当たり：土塀は wallLine の柵（army.addStruct）が受け持つ。櫓・天守は足もとの四角だけ SOLIDS に入れる。石垣は見た目だけ（斜面に置く）
// ======================================================================
const cnv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
const rnd = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
// 石垣の面：nozura（野面積み：丸みのある自然石を大小まぜて積む・目地が深い）／uchikomi（打込接：角を叩いて面をそろえた石・目地は細い）
function stoneFace(kind) {
  const R = rnd(kind === 'nozura' ? 11 : 29);
  return cnv(256, 256, (g) => {
    g.fillStyle = kind === 'nozura' ? '#2a2723' : '#4a463f'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256;) {
      const h = kind === 'nozura' ? 18 + R() * 26 : 24 + R() * 10;
      for (let x = -R() * 30; x < 256;) {
        const w = kind === 'nozura' ? 20 + R() * 40 : 34 + R() * 26;
        const v = 128 + R() * 70, t = R() * 16 - 8, gap = kind === 'nozura' ? 3 + R() * 3 : 1.2;
        g.fillStyle = `rgb(${v + t},${v + t * 0.5},${v - 10})`;
        g.beginPath();
        if (kind === 'nozura') g.ellipse(x + w / 2, y + h / 2, w / 2 - gap, h / 2 - gap, (R() - 0.5) * 0.4, 0, 7);
        else { const j = () => (R() - 0.5) * 3; g.moveTo(x + gap + j(), y + gap); g.lineTo(x + w - gap + j(), y + gap + j()); g.lineTo(x + w - gap, y + h - gap + j()); g.lineTo(x + gap + j(), y + h - gap); g.closePath(); }
        g.fill();
        g.fillStyle = 'rgba(255,250,235,0.08)'; g.fillRect(x + 4, y + 3, w - 8, 3);
        g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 4, y + h - 7, w - 8, 3);
        // 苔と水の筋（下の石ほど青く）
        if (R() < 0.35) { g.fillStyle = `rgba(70,${90 + R() * 30},50,${0.12 + (y / 256) * 0.22})`; g.beginPath(); g.ellipse(x + R() * w, y + h * 0.7, 6 + R() * 10, 3 + R() * 4, 0, 0, 7); g.fill(); }
        x += w;
      }
      y += h;
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(20,22,18,0.10)'; g.fillRect(R() * 256, 0, 2 + R() * 3, 256); }
  });
}
// 白壁：雨だれの筋・軒下の影・足もとの泥はね
const plasterTex = () => cnv(128, 128, (g) => {
  const R = rnd(5);
  g.fillStyle = '#f2eee4'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,84,72,${0.03 + R() * 0.07})`; g.fillRect(R() * 128, 0, 1 + R() * 2, 20 + R() * 90); }
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(60,56,48,.28)'); gr.addColorStop(0.18, 'rgba(60,56,48,0)'); gr.addColorStop(0.82, 'rgba(80,66,48,0)'); gr.addColorStop(1, 'rgba(80,66,48,.35)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
// 下見板：黒く塗った板を横に重ね張り（板の継ぎ目と、日に焼けて褪せた所）
const shitamiTex = () => cnv(128, 128, (g) => {
  const R = rnd(9);
  g.fillStyle = '#26221e'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y + 13, 128, 3); g.fillStyle = `rgba(120,110,95,${0.05 + R() * 0.08})`; g.fillRect(0, y, 128, 5); }
  for (let x = 0; x < 128; x += 32) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + R() * 4, 0, 3, 128); }
});
let CK = null;
function ck() {
  if (CK) return CK;
  const st = (t) => new THREE.MeshStandardMaterial({ vertexColors: true, map: t, bumpMap: t, bumpScale: 2.2, roughness: 0.95, metalness: 0 });
  CK = {
    nozura: st(stoneFace('nozura')), uchikomi: st(stoneFace('uchikomi')),
    plaster: new THREE.MeshStandardMaterial({ vertexColors: true, map: plasterTex(), roughness: 0.92, metalness: 0 }),
    shitami: new THREE.MeshStandardMaterial({ vertexColors: true, map: shitamiTex(), roughness: 0.85, metalness: 0 }),
    wood: MAT, tile: TILE, iron: IRON,
  };
  return CK;
}
// 部品を素材ごとに集める入れ物
const kit = () => ({ nozura: [], uchikomi: [], plaster: [], shitami: [], wood: [], tile: [], iron: [] });
function kitMesh(B, cam = true) {
  const M = ck(), grp = new THREE.Group();
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(B[k].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.attributes.color ? g : paint(g, 0xffffff)))), M[k]);
    m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = cam;
    grp.add(m);
  }
  return grp;
}
// 箱（中心 x,y,z、幅 w・高さ h・奥行き d、y 軸の回り rot）。uvk：絵の繰り返しを大きさに合わせる（m ごと）
function kbox(P, hex, x, y, z, w, h, d, rot = 0, uvk = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvk) { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / uvk, uv.getY(i) * dims[f][1] / uvk); } }
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(paint(g, hex));
}
// 寄棟の瓦屋根（軒 w×d、高さ h、軒の高さ y）。hipGeo の形に瓦の絵
function ktile(P, x, y, z, w, d, h, rot = 0, ridge = 0.35) {
  const g = hipGeo(w / 2, d / 2, h, 0, Math.max(0.3, (w - d) / 2 + ridge));
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(g);
}
const Lr = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

// 石垣：点の並び pts に沿って、進む向きの左手側（o.out = -1 で右手側）へ張り出す石の面。上端は線の地面の高さ + o.top、
// 下は外の地面より o.sink 深く。勾配（上が内へ寄る）を付ける。o.kind：'nozura'（既定）か 'uchikomi'
export function ishigaki(world, pts, o = {}) {
  const B = kit(), kind = o.kind || 'nozura', side = o.out || 1;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
    const nx = -(bz - az) / len * side, nz = (bx - ax) / len * side;
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = world.heightAt(x, z) + (o.top ?? 0.4);
      const bot = Math.min(world.heightAt(x + nx * 2.5, z + nz * 2.5), world.heightAt(x + nx * 5, z + nz * 5), top - (o.minH ?? 2)) - (o.sink ?? 0.5);
      // 高さは o.maxH まで（急な山では下を斜面に埋める）
      const h = Math.min(o.maxH ?? 4, top - bot), lean = kind === 'nozura' ? 0.3 : 0.22;
      const bot2 = top - h;
      const g = new THREE.BoxGeometry(len / n + 0.08, h, 1.6);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / n) / 2.6, uv.getY(k) * h / 2.6);
      g.rotateX(-lean); g.rotateY(Math.atan2(nx, nz));
      const off = 0.6 + h * lean * 0.5;
      g.translate(x + nx * off, bot2 + h / 2, z + nz * off);
      B[kind].push(paint(g, vary(kind === 'nozura' ? 0x8e897d : 0x9c968a, i + s * 5)));
      // 天端の石（笠石）
      kbox(B[kind], vary(0x9c968a, i + 3), x + nx * 0.35, top + 0.08, z + nz * 0.35, len / n + 0.1, 0.3, 1.0, Math.atan2(bx - ax, bz - az) - Math.PI / 2, 1.3);
    }
  }
  return kitMesh(B);
}

// 土塀（wallLine の mesh にそのまま渡せる形）：石の腰・白い漆喰・長押の黒い筋・瓦の笠。両の面に狭間
// o.samaStep：狭間の間合い（bhelp の samaTs と同じ割り方）。o.h：壁の高さ（既定 2.3）
export function dobei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const B = kit();
  const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(-(bz - az), bx - ax);
  const H = o.h || 2.3;
  const n = Math.max(1, Math.round(len / 1.8));
  const step = o.samaStep || 1.8, holes = Math.max(1, Math.round(len / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
    const y = world.heightAt(mx, mz), L = len / n + 0.02;
    kbox(B.nozura, vary(0x8a8579, i), mx, y + 0.3, mz, L, 1.1, 0.7, rot, 1.4);            // 腰の石
    kbox(B.plaster, vary(0xc9c2b0, i), mx, y + 0.85 + (H - 0.85) / 2, mz, L, H - 0.85, 0.36, rot, 0);   // 漆喰
    kbox(B.shitami, 0x9a948a, mx, y + 1.05, mz, L, 0.5, 0.38, rot, 1.2);                   // 腰の下見板
    kbox(B.wood, 0x2c2622, mx, y + H - 0.12, mz, L, 0.1, 0.38, rot);                       // 長押
    kbox(B.tile, 0xffffff, mx, y + H + 0.08, mz, L + 0.02, 0.14, 1.05, rot, 0.9);          // 瓦の笠
    kbox(B.wood, 0x24221f, mx, y + H + 0.22, mz, L + 0.02, 0.16, 0.26, rot);               // 棟
  }
  // 狭間：三角・丸・四角を交互に（外と内の同じ所）
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  for (let k = 0; k < holes; k++) {
    const t = (k + 0.5) / holes, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = world.heightAt(x, z);
    const gun = k % 2 === 0, hy = y + (gun ? 1.35 : 1.8), hs = gun ? 0.2 : 0.34;
    for (const s of [1, -1]) kbox(B.iron, 0x0e0d0c, x + nx * s * 0.185, hy, z + nz * s * 0.185, gun ? 0.2 : 0.12, hs, 0.03, rot);
  }
  return kitMesh(B);
}

// 隅櫓（二重櫓）：石垣の台・下見板の一重・白壁の二重・瓦の屋根。石落としと格子窓。rot で正面の向き
export function sumiyagura(world, x, z, o = {}) {
  const rot = o.rot || 0, w = o.w || 6, d = o.d || 5, B = kit();
  const y = world.heightAt(x, z) - 0.3;
  solidRect(x, z, w + 1.6, d + 1.6, rot);
  const P = Lr(x, z, rot);
  const base = o.base ?? 2.2;
  // 台の石垣（四方へ少し裾を広げる）
  { const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.28, 1, 4, 1, true); g.rotateY(Math.PI / 4); g.scale(w + 1.2, base + 0.8, d + 1.2); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w + d) / 2, uv.getY(k) * base / 2.4); if (rot) g.rotateY(rot); g.translate(x, y + (base + 0.8) / 2 - 0.8, z); B[o.stone || 'uchikomi'].push(paint(g, 0xb0aa9c)); }
  let yy = y + base;
  // 一重：腰は下見板、上は白壁
  kbox(B.shitami, 0xa8a298, x, yy + 1.0, z, w, 2.0, d, rot, 2);
  kbox(B.plaster, 0xcdc6b4, x, yy + 2.5, z, w, 1.0, d, rot);
  // 格子窓と石落とし
  for (const s of [-1, 1]) {
    for (const q of [-1, 1]) { const [wx, wz] = P(q * w * 0.25, s * (d / 2 + 0.02)); kbox(B.iron, 0x121110, wx, yy + 2.45, wz, 0.9, 0.5, 0.04, rot); for (let b = -2; b <= 2; b++) { const [lx, lz] = P(q * w * 0.25 + b * 0.18, s * (d / 2 + 0.05)); kbox(B.wood, 0x3a2e24, lx, yy + 2.45, lz, 0.05, 0.54, 0.04, rot); } }
  }
  { const [sx, sz] = P(w / 2 - 0.6, d / 2 + 0.35); kbox(B.plaster, 0xe0dac8, sx, yy + 1.6, sz, 1.4, 1.0, 0.7, rot); kbox(B.iron, 0x0c0b0a, sx, yy + 1.08, sz, 1.2, 0.04, 0.55, rot); }
  ktile(B.tile, x, yy + 3.0, z, w + 1.8, d + 1.8, 0.9, rot, 0.9);
  yy += 3.35;
  const w2 = w * 0.72, d2 = d * 0.72;
  kbox(B.plaster, 0xd0c9b8, x, yy + 1.1, z, w2, 2.2, d2, rot);
  kbox(B.shitami, 0xa8a298, x, yy + 0.35, z, w2 + 0.02, 0.7, d2 + 0.02, rot, 2);
  for (const s of [-1, 1]) { const [wx, wz] = P(0, s * (d2 / 2 + 0.02)); kbox(B.iron, 0x121110, wx, yy + 1.35, wz, 1.1, 0.55, 0.04, rot); }
  ktile(B.tile, x, yy + 2.2, z, w2 + 1.9, d2 + 1.9, 1.5, rot, 0.4);
  // 棟の鯱
  for (const s of [-1, 1]) { const [cx, cz] = P(s * (w2 / 2 + 0.2), 0); kbox(B.iron, 0x2a2622, cx, yy + 3.85, cz, 0.18, 0.5, 0.26, rot); }
  return kitMesh(B);
}

// 櫓門：門柱の上に渡櫓（白壁と下見板・格子窓）を渡し、瓦の屋根。w は通り道の幅。当たりは門柱と両脇の石垣だけ（通り道は空ける）
export function yaguramon(world, x, z, w = 5, rot = 0, o = {}) {
  const B = kit(), P = Lr(x, z, rot);
  const y = world.heightAt(x, z);
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (w / 2 + 1.4), 0);
    solidRect(px, pz, 2.6, 4, rot);
    kbox(B[o.stone || 'uchikomi'], 0xb0aa9c, px, y + 1.2, pz, 2.6, 3.2, 4, rot, 2.4);
    const [cx, cz] = P(sx * (w / 2 + 0.1), 0);
    kbox(B.wood, 0x3e2e22, cx, y + 1.9, cz, 0.45, 3.8, 0.45, rot);
  }
  const Lw = w + 5.6;
  kbox(B.wood, 0x3a2a1c, x, y + 3.85, z, Lw, 0.3, 4.2, rot);
  kbox(B.shitami, 0xa8a298, x, y + 4.5, z, Lw - 0.2, 1.0, 3.8, rot, 2);
  kbox(B.plaster, 0xcdc6b4, x, y + 5.5, z, Lw - 0.2, 1.0, 3.8, rot);
  for (const s of [-1, 1]) for (const q of [-1, 0, 1]) { const [wx, wz] = P(q * 2.4, s * 1.92); kbox(B.iron, 0x121110, wx, y + 5.4, wz, 1.0, 0.5, 0.04, rot); }
  // 扉（開いたまま、内へ）
  for (const sx of [-1, 1]) { const [dx, dz] = P(sx * (w / 2 - 0.2), -1.4); kbox(B.wood, 0x3a2c20, dx, y + 1.6, dz, 0.18, 3.2, 2.4, rot); }
  ktile(B.tile, x, y + 6.0, z, Lw + 1.6, 5.6, 1.6, rot, 0.3);
  return kitMesh(B);
}

// 天守：石垣の天守台に、下見板と白壁の重ね。庇の瓦屋根・千鳥破風・最上階の廻縁と高欄・鯱。floors 階、b は一階の幅
// o.old：古い型（黒い下見板を多く・破風少なめ）。当たりは天守台
export function tenshu(world, x, z, o = {}) {
  const rot = o.rot || 0, floors = o.floors || 3, b = o.b || 9, B = kit(), P = Lr(x, z, rot);
  const y0 = world.heightAt(x, z) - 0.4;
  solidRect(x, z, b + 3, b * 0.86 + 3, rot);
  const base = o.base ?? 4;
  { const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.3, 1, 4, 1, true); g.rotateY(Math.PI / 4); g.scale(b + 1.4, base + 1, b * 0.86 + 1.4); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * b / 1.3, uv.getY(k) * base / 2.4); if (rot) g.rotateY(rot); g.translate(x, y0 + (base + 1) / 2 - 1, z); B[o.stone || 'nozura'].push(paint(g, 0xb0aa9c)); }
  let y = y0 + base, w = b, d = b * 0.86;
  for (let k = 0; k < floors; k++) {
    const top = k === floors - 1, fh = top ? 2.9 : 3.2;
    const black = o.old ? 0.75 : 0.4;
    kbox(B.shitami, 0xa8a298, x, y + fh * black / 2, z, w, fh * black, d, rot, 2);
    kbox(B.plaster, 0xd0c9b8, x, y + fh * black + fh * (1 - black) / 2, z, w, fh * (1 - black), d, rot);
    const nw = Math.max(2, Math.round(w / 2.6));
    for (let q = 0; q < nw; q++) {
      const lx = -w / 2 + (q + 0.5) * w / nw;
      for (const s of [-1, 1]) {
        const [ax, az] = P(lx, s * (d / 2 + 0.02)); kbox(B.iron, 0x121110, ax, y + fh * 0.62, az, 0.8, 0.5, 0.04, rot);
        const [cx, cz] = P(s * (w / 2 + 0.02), lx * d / w); kbox(B.iron, 0x121110, cx, y + fh * 0.62, cz, 0.04, 0.5, 0.8 * d / w, rot);
      }
    }
    if (top) {
      kbox(B.wood, 0x33261c, x, y + 0.12, z, w + 1.4, 0.14, d + 1.4, rot);
      for (const [lx, lz, ww, dd] of [[0, (d + 1.3) / 2, w + 1.4, 0.06], [0, -(d + 1.3) / 2, w + 1.4, 0.06], [(w + 1.3) / 2, 0, 0.06, d + 1.4], [-(w + 1.3) / 2, 0, 0.06, d + 1.4]]) { const [px, pz] = P(lx, lz); kbox(B.wood, 0x3a2a1c, px, y + 0.7, pz, ww, 0.08, dd, rot); }
      ktile(B.tile, x, y + fh, z, w + 2.4, d + 2.4, 2.2, rot, 0.6);
      for (const s of [-1, 1]) { const [cx, cz] = P(s * (w / 2 + 0.6), 0); kbox(B.iron, 0x8a7640, cx, y + fh + 2.4, cz, 0.24, 0.7, 0.34, rot); }
    } else {
      ktile(B.tile, x, y + fh - 0.1, z, w + 2.6, d + 2.6, 1.0, rot, (w - d) / 2 + 0.6);
      // 千鳥破風（正面と裏に、階ごとに互い違い）
      if (!o.old || k === 0) for (const s of [-1, 1]) { const [hx, hz] = P(0, s * (d / 2 + 0.5)); const g = new THREE.ConeGeometry(1.6, 1.1, 3); g.rotateZ(0); g.rotateY(rot + (s > 0 ? 0 : Math.PI)); g.scale(1, 1, 0.5); g.translate(hx, y + fh + 0.45, hz); B.tile.push(g); }
    }
    y += fh + 0.4; w *= 0.78; d *= 0.8;
  }
  return kitMesh(B);
}

// 逆茂木：枝を払った木を、先を外（rot の向きの +z）へ向けて寝かせ並べる。len の長さに n 本
export function sakamogi(world, x, z, rot = 0, len = 6) {
  const B = kit(), P = Lr(x, z, rot);
  const n = Math.max(3, Math.round(len / 0.55));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * len / n, j = ((i * 7919) % 11) / 11;
    const [ax, az] = P(lx, -0.4), [bx, bz] = P(lx + (j - 0.5) * 0.6, 1.4 + j * 0.6);
    const ya = world.heightAt(ax, az), yb = world.heightAt(bx, bz) + 0.8 + j * 0.4;
    const dv = new THREE.Vector3(bx - ax, yb - ya, bz - az), L = dv.length();
    const g = new THREE.CylinderGeometry(0.03, 0.08, L, 5); g.translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize()));
    g.translate(ax, ya + 0.15, az);
    B.wood.push(paintWorn(g, vary(0x5a4634, i), ya, L));
    // 払い残した枝
    if (i % 2 === 0) { const t = 0.55 + j * 0.25, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, cy = ya + (yb - ya) * t; const br = new THREE.CylinderGeometry(0.015, 0.03, 0.7, 4); br.rotateZ(0.9 * (j > 0.5 ? 1 : -1)); br.rotateY(rot); br.translate(cx, cy + 0.2, cz); B.wood.push(paint(br, 0x4e3c2c)); }
  }
  { const [ax, az] = P(-len / 2, -0.3), [bx, bz] = P(len / 2, -0.3); const mx = (ax + bx) / 2, mz = (az + bz) / 2; kbox(B.wood, 0x4a3a2a, mx, world.heightAt(mx, mz) + 0.2, mz, len, 0.16, 0.16, rot); }
  return kitMesh(B, false);
}

// 竹束（置き物）：青竹を束ねて縄で縛った楯を、支えの棒で立てる。rot の向き（+z）が前
let TAKE_G = null;
export function takataba(world, x, z, rot = 0) {
  if (!TAKE_G) {
    const P = [];
    for (let i = 0; i < 11; i++) { const g = new THREE.CylinderGeometry(0.075, 0.085, 2.2, 6); g.rotateX(-0.18); g.translate((i - 5) * 0.15, 1.05, (i % 2) * 0.05); P.push(paint(g, [0x7c7a48, 0x6e6c3e, 0x86804e, 0x8e8a58][i % 4])); }
    for (const yy of [0.5, 1.5]) { const b = new THREE.BoxGeometry(1.8, 0.07, 0.1); b.translate(0, yy, 0.02 + yy * 0.18); P.push(paint(b, 0x4a3a22)); }
    const s = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5); s.rotateX(0.75); s.translate(0, 0.72, -0.55); P.push(paint(s, 0x5a4a32));
    TAKE_G = mergeGeometries(P.map((g) => (g.index ? g.toNonIndexed() : g)));
  }
  const m = new THREE.Mesh(TAKE_G, ck().wood);
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, world.heightAt(x, z), z); m.rotation.y = rot;
  solidRect(x, z, 1.9, 0.6, rot);
  return m;
}

// 篝火：三本脚の上に鉄の籠。薪を籠に盛る（火は world.addFire で別に灯す。灯す高さは y + 1.35）
let KAGA = null;
export function kagaribi(world, x, z) {
  if (!KAGA) {
    const I = [], Wd = [];
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; const g = new THREE.CylinderGeometry(0.025, 0.03, 1.5, 4); g.rotateZ(0.22); g.rotateY(a); g.translate(Math.cos(a) * 0.17, 0.72, -Math.sin(a) * 0.17); I.push(g); }
    const ring = new THREE.TorusGeometry(0.28, 0.02, 4, 12); ring.rotateX(Math.PI / 2); ring.translate(0, 1.2, 0); I.push(ring);
    const ring2 = ring.clone(); ring2.scale(1.25, 1, 1.25); ring2.translate(0, 0.28, 0); I.push(ring2);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const b = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 3); b.rotateX(0.35); b.rotateY(a); b.translate(Math.cos(a) * 0.31, 1.34, -Math.sin(a) * 0.31); I.push(b); }
    for (let k = 0; k < 6; k++) { const g = new THREE.CylinderGeometry(0.04, 0.045, 0.5, 4); g.rotateZ(Math.PI / 2 - 0.5); g.rotateY(k); g.translate(0, 1.33, 0); Wd.push(paint(g, 0x2a1f16)); }
    KAGA = { iron: mergeGeometries(I.map((g) => paint(g.index ? g.toNonIndexed() : g, 0x1e1c1a))), wood: mergeGeometries(Wd) };
  }
  const grp = new THREE.Group();
  const a = new THREE.Mesh(KAGA.iron, ck().iron), b = new THREE.Mesh(KAGA.wood, ck().wood);
  a.castShadow = true; grp.add(a, b);
  grp.position.set(x, world.heightAt(x, z), z);
  solidCircle(x, z, 0.35);
  return grp;
}
