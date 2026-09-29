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
const ITA_MAT = new THREE.MeshStandardMaterial({ map: woodTex(), bumpMap: woodTex(), bumpScale: 1.2, color: 0x8a8274, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });   // 灰茶に褪せた板葺き
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
    parts.push(paintWorn(post, vary(0x6f675a, i), y, h));   // 風雨で灰茶に褪せた丸太
    const tip = new THREE.ConeGeometry(rad * 0.9, 0.3 + r * 0.2, 7);
    tip.translate(x, y + h - 0.1 + 0.08, z);
    parts.push(paint(tip, vary(0x857b6c, i + 3)));
  }
  for (const hy of [0.75, 1.65]) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rail = new THREE.CylinderGeometry(0.06, 0.07, len, 6);
    rail.rotateX(Math.PI / 2); rail.rotateY(ang);
    rail.translate(mx - px * 0.14, world.heightAt(mx, mz) + hy, mz - pz * 0.14);
    parts.push(paint(rail, 0x5a5246));
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
    sh.vertexShader = 'uniform float uFlagT, uGust, uWet;\nattribute float jpin;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float jk = (1.0 - uv.y) * (0.25 + 0.75 * jpin);
      float jp = position.x * 0.9 + position.z * 0.7;
      float jA = (0.07 + uGust * 0.09) * (1.0 - uWet * 0.6);
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
    const pin = new Float32Array(P.count);
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k);
      const u = ((x + len / 2) / (len / n)) % 1;
      const sag = Math.sin(u * Math.PI);
      pin[k] = sag;
      P.setY(k, y - sag * 0.07 * (0.5 + (y + 0.8) / 1.6));
      P.setZ(k, sag * 0.12 * (0.3 + (0.8 - y) / 1.6 * 0.7) + Math.sin(x * 2.3 + ax) * 0.02);
    }
    // 絵は 4m ごとに繰り返す（幕を一つにまとめて描くので、絵の座標で伸ばす）
    const UV = geo.attributes.uv; for (let k = 0; k < UV.count; k++) UV.setX(k, UV.getX(k) * len / 4);
    geo.setAttribute('jpin', new THREE.BufferAttribute(pin, 1));   // 柱の所は留まり、柱の間ほど風にふくらむ
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
  // o.ita：板葺きの屋根に石を並べて置く（石置き屋根）。茅の代わりに灰茶の板と、押さえの丸太・石
  if (o.ita) {
    const th = Math.atan2(rh, w / 2 + eave), slope = Math.hypot(w / 2 + eave, rh);
    for (const sd of [1, -1]) for (let q = 0; q < 3; q++) {
      const t = (q + 0.5) / 3, lx = sd * (w / 2 + eave) * t, ly = H + rh * (1 - t) + 0.2;
      const bar = new THREE.CylinderGeometry(0.06, 0.06, d + eave * 2, 5); bar.rotateX(Math.PI / 2); bar.translate(lx, ly, 0); parts.push(paint(bar, 0x4e473c));
      for (let k2 = 0; k2 < 5; k2++) { const st = new THREE.DodecahedronGeometry(0.16 + ((q * 5 + k2) % 3) * 0.04, 0); st.scale(1.2, 0.7, 1); st.translate(lx, ly + 0.1, -d / 2 - eave + (k2 + 0.5) * (d + eave * 2) / 5); parts.push(paint(st, vary(0x7d7a72, q * 7 + k2))); }
    }
    void th; void slope;
  }
  const m = merged(parts);
  const roof = new THREE.Mesh(mergeGeometries(roofParts.map((g) => g.index ? g.toNonIndexed() : g)), o.ita ? ITA_MAT : THATCH);
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

// 井楼櫓（物見の櫓）：細い丸太の柱を四本、筋交いで組んで高く立て、上に板の囲いと、浅い切妻の板屋根。木は灰茶に褪せた色
export function yagura(world, x, z) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solidCircle(x + dx * 1.1, z + dz * 1.1, 0.25);
  const parts = [];
  const H = 6.6, W0 = 1.25, W1 = 1.05;   // 柱は上へ少しすぼまる
  const colP = 0x635b4e, colB = 0x6e675a;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = new THREE.Vector3(dx * W0, 0, dz * W0), b = new THREE.Vector3(dx * W1, H, dz * W1);
    const L = a.distanceTo(b), leg = new THREE.CylinderGeometry(0.09, 0.12, L + 0.3, 6);
    leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    leg.translate((a.x + b.x) / 2, H / 2, (a.z + b.z) / 2); parts.push(paint(leg, vary(colP, dx * 3 + dz)));
  }
  // 筋交い（四面をたすきに）と横木（三段）
  const side = [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]];
  const at = (sx, sz, y) => { const k = W0 + (W1 - W0) * (y / H); return new THREE.Vector3(sx * k, y, sz * k); };
  const rod = (p, q, r, col) => { const L = p.distanceTo(q), g = new THREE.CylinderGeometry(r, r, L, 5); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize())); g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); parts.push(paint(g, col)); };
  for (const [ax, az, bx, bz] of side) {
    for (const [y0, y1] of [[0.4, 3.1], [3.1, 5.8]]) { rod(at(ax, az, y0), at(bx, bz, y1), 0.045, 0x5a5346); rod(at(bx, bz, y0), at(ax, az, y1), 0.045, 0x5a5346); }
    for (const y of [0.4, 3.1, 5.8]) rod(at(ax, az, y), at(bx, bz, y), 0.05, 0x5e574a);
  }
  // 床と板の囲い（縦の板をすき間なく。手前に物見の開き）
  const floor = new THREE.BoxGeometry(2.7, 0.14, 2.7); floor.translate(0, H, 0); parts.push(paint(floor, 0x5e574a));
  let k = 0;
  for (const [ax, az, bx, bz] of [[-1.3, -1.3, 1.3, -1.3], [1.3, -1.3, 1.3, 1.3], [1.3, 1.3, -1.3, 1.3], [-1.3, 1.3, -1.3, -1.3]]) {
    const L = Math.hypot(bx - ax, bz - az), n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t, hb = 1.05 + ((k * 37) % 7) * 0.012;
      const b = new THREE.BoxGeometry(L / n - 0.01, hb, 0.04); b.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2); b.translate(px, H + 0.07 + hb / 2, pz); parts.push(paint(b, vary(colB, k++)));
    }
  }
  // 屋根の柱と、浅い切妻の板屋根（板を重ねた筋）
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 5); p.translate(dx * 1.22, H + 1.0, dz * 1.22); parts.push(paint(p, colP)); }
  for (const sd of [1, -1]) {
    for (let q = 0; q < 6; q++) {
      const g = new THREE.BoxGeometry(1.8, 0.05, 0.56); g.translate(0.9 * sd, 0, -1.4 + q * 0.56); g.rotateZ(sd * -0.36); g.translate(0, H + 2.35 + q * 0 , 0);
      parts.push(paint(g, vary(0x5a5448, q + (sd > 0 ? 0 : 9))));
    }
  }
  const rid = new THREE.CylinderGeometry(0.07, 0.07, 3.5, 5); rid.rotateX(Math.PI / 2); rid.translate(0, H + 2.4, 0); parts.push(paint(rid, 0x4a443a));
  // 梯子
  for (let r = 0; r < 11; r++) { const rung = new THREE.BoxGeometry(0.6, 0.05, 0.06); rung.translate(0, 0.4 + r * 0.6, 1.55); parts.push(paint(rung, 0x6e675a)); }
  for (const lx of [-0.3, 0.3]) { const sr = new THREE.BoxGeometry(0.06, H, 0.06); sr.translate(lx, H / 2, 1.55); parts.push(paint(sr, 0x5a5346)); }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}
// 土塁：柵の外に盛った土の斜面（草が生え、裾は土が出る）。seg に沿って、外の向き (nx, nz) へ w m 下る。h は柵の足もとの高さ
export function dorui(world, seg, nx, nz, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), w = o.w || 3.2, h = o.h || 0.7;
  const n = Math.max(2, Math.round(len / 1.5)), pos = [], col = [];
  const cT = new THREE.Color(0x5f7a3c), cM = new THREE.Color(0x6c7a44), cB = new THREE.Color(0x7a6448);
  const V = (t, u) => {
    const x = ax + (bx - ax) * t + nx * (u * w - 0.3), z = az + (bz - az) * t + nz * (u * w - 0.3);
    const j = Math.sin(t * 17 + u * 5 + ax) * 0.06;
    return [x, world.heightAt(x, z) + Math.max(0, h * (1 - u * u)) + j - (u > 0.98 ? 0.1 : 0), z];
  };
  const C = (t, u) => { const c = u < 0.3 ? cT.clone().lerp(cM, u / 0.3) : cM.clone().lerp(cB, (u - 0.3) / 0.7); const f = 0.9 + ((Math.sin(t * 31 + u * 13) + 1) * 0.08); return [c.r * f, c.g * f, c.b * f]; };
  const US = [0, 0.3, 0.65, 1];
  for (let i = 0; i < n; i++) for (let q = 0; q < US.length - 1; q++) {
    const t0 = i / n, t1 = (i + 1) / n, u0 = US[q], u1 = US[q + 1];
    const quad = [[t0, u0], [t1, u0], [t1, u1], [t0, u0], [t1, u1], [t0, u1]];
    for (const [t, u] of quad) { pos.push(...V(t, u)); col.push(...C(t, u)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // 巻きの向きで裏返っていても見えるよう両面で
  const m = new THREE.Mesh(g, DORUI_MAT);
  m.receiveShadow = true;
  return m;
}
const DORUI_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
// 細い丸太を格子に組んだ低い柵（曲輪の中の仕切り・畑の囲い）
export function koshisaku(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), H = o.h || 1.2, ang = Math.atan2(bx - ax, bz - az), parts = [];
  const n = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = world.heightAt(x, z); const p = new THREE.CylinderGeometry(0.035, 0.045, H + 0.2, 5); p.translate(x, y + H / 2 - 0.1, z); parts.push(paint(p, vary(0x6a6254, i))); }
  for (const hy of [0.35, H - 0.1]) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; const r = new THREE.CylinderGeometry(0.03, 0.03, len, 5); r.rotateX(Math.PI / 2); r.rotateY(ang); r.translate(mx, world.heightAt(mx, mz) + hy, mz); parts.push(paint(r, 0x5e574a)); }
  return merged(parts);
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
    const post = new THREE.CylinderGeometry(0.2, 0.24, H, 8); post.translate(sx, H / 2, 0); parts.push(paint(post, 0x6a6254));
    const brace = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6); brace.rotateX(0.5); brace.translate(sx, 0.7, -0.45); parts.push(paint(brace, 0x5a5448));
    // 板の扉（内へ開いたまま）：縦の板と、上下の横桟
    const dw = w / 2 - 0.25, dx = sx * 0.5 - Math.sign(sx) * 0.15;
    const door = new THREE.BoxGeometry(0.08, 2.6, dw); door.rotateY(sx > 0 ? -0.35 : 0.35); door.translate(sx - Math.sign(sx) * (dw / 2) * Math.cos(0.35) * 0 - Math.sign(sx) * 0.12, 1.35, -dw / 2 + 0.1);
    void dx; parts.push(paint(door, vary(0x6d6558, sx > 0 ? 3 : 7)));
    for (const hy of [0.4, 2.3]) { const cr = new THREE.BoxGeometry(0.1, 0.12, dw); cr.rotateY(sx > 0 ? -0.35 : 0.35); cr.translate(sx - Math.sign(sx) * 0.08, hy, -dw / 2 + 0.1); parts.push(paint(cr, 0x4e473c)); }
  }
  const beam = new THREE.BoxGeometry(w + 1.4, 0.3, 0.32); beam.translate(0, H - 0.1, 0); parts.push(paint(beam, 0x5c5548));
  const tie = new THREE.BoxGeometry(w, 0.18, 0.22); tie.translate(0, H - 0.75, 0); parts.push(paint(tie, 0x6a6254));
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
  // 稲の株の列：水面から立つ細い緑の筋（一つの形にまとめて軽く）。畑：家の脇に畝を立て、青物の列。道祖神：里の入口の小さな石の神
  const crops = [];
  for (let k = 0; k < nf; k++) {
    const ci = k % cols, ri = Math.floor(k / cols);
    const lx0 = (ci - cols / 2) * (fw + 0.8), lz0 = rad * 0.5 + 6 + ri * (fd + 0.8);
    const [mx, mz] = W(lx0 + fw / 2, lz0 + fd / 2);
    const my = world.heightAt(mx, mz) + 0.05;
    for (let q = 0.8; q < fw - 0.5; q += 0.9) {
      const [x0, z0] = W(lx0 + q, lz0 + 0.6), [x1, z1] = W(lx0 + q, lz0 + fd - 0.6);
      const L = Math.hypot(x1 - x0, z1 - z0), b = new THREE.BoxGeometry(0.1, 0.28, L);
      b.rotateY(Math.atan2(x1 - x0, z1 - z0)); b.translate((x0 + x1) / 2, my + 0.14, (z0 + z1) / 2);
      crops.push(paint(b, vary(0x5f7d3a, k + Math.round(q))));
    }
  }
  const nh = Math.min(3, spots.length);
  for (let i = 0; i < nh; i++) {
    const [lx, lz] = spots[i], ox = lx + (R() < 0.5 ? -1 : 1) * 7, oz = lz - 5;
    const cy = world.heightAt(...W(ox, oz));
    for (let q = 0; q < 5; q++) {
      const [x0, z0] = W(ox - 3, oz + q * 1.1), [x1, z1] = W(ox + 3, oz + q * 1.1);
      const L = Math.hypot(x1 - x0, z1 - z0), a2 = Math.atan2(x1 - x0, z1 - z0);
      const une = new THREE.BoxGeometry(0.6, 0.25, L); une.rotateY(a2); une.translate((x0 + x1) / 2, cy + 0.1, (z0 + z1) / 2);
      crops.push(paint(une, vary(0x5a4632, q + i)));
      const ao = new THREE.BoxGeometry(0.35, 0.3, L - 0.4); ao.rotateY(a2); ao.translate((x0 + x1) / 2, cy + 0.36, (z0 + z1) / 2);
      crops.push(paint(ao, vary(i % 2 ? 0x4f6e2c : 0x6a7f34, q)));
    }
  }
  {
    const [dx, dz] = W(-rad - 3, 2), dy = world.heightAt(dx, dz);
    const st = new THREE.CylinderGeometry(0.22, 0.3, 0.7, 7); st.translate(dx, dy + 0.35, dz); crops.push(paint(st, vary(0x7a776c, 1)));
    const base = new THREE.BoxGeometry(0.8, 0.18, 0.8); base.translate(dx, dy + 0.09, dz); crops.push(paint(base, vary(0x6a675e, 2)));
    const rf = new THREE.ConeGeometry(0.62, 0.35, 4); rf.rotateY(Math.PI / 4 + rot); rf.translate(dx, dy + 1.05, dz); crops.push(paint(rf, vary(0x4a3a2a, 3)));
    for (const sx of [-0.4, 0.4]) { const po = new THREE.BoxGeometry(0.06, 0.95, 0.06); po.translate(dx + sx * c, dy + 0.48, dz - sx * sn); crops.push(paint(po, vary(0x4a3a2a, 4))); }
    solidCircle(dx, dz, 0.5);
  }
  if (crops.length) grp.add(new THREE.Mesh(mergeGeometries(crops), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // 炊事の煙：いくつかの家の棟の端から昇る
  if (world.addSmokeColumn) roofMats.slice(0, o.smoke ?? 2).forEach((h) => world.addSmokeColumn(h.hx + Math.sin(h.ry + Math.PI / 2) * h.rl, h.top, h.hz + Math.cos(h.ry + Math.PI / 2) * h.rl, { size: 0.8 }));
  return grp;
}

// ---- 絵の道具（城の材質と瓦）：色と高さを一度に描き、高さから法線の絵を作る
const rnd = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
// 高さの絵（白いほど手前）から法線の絵を作る。少しぼかしてから差を取り、端は反対側へ回り込む（繰り返しても繋ぎ目が出ない）
function normalFrom(hc, k) {
  const w = hc.width, h = hc.height, s = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = s[i * 4] / 255;
  const at = (A, x, y) => A[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = (at(a, x, y) * 4 + at(a, x - 1, y) + at(a, x + 1, y) + at(a, x, y - 1) + at(a, x, y + 1)) / 8;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // 絵の下向きは v の逆（flipY）なので、縦の差は符号を返す
    const nx = -(at(b, x + 1, y) - at(b, x - 1, y)) * k, ny = (at(b, x, y + 1) - at(b, x, y - 1)) * k, l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// 色の絵と高さの絵を一度に描き、{ map, nrm } を返す。どれも最初の一度だけ作って使い回す
function pairTex(w, h, f, k = 6) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const c = mk(), hc = mk();
  f(c.getContext('2d'), hc.getContext('2d', { willReadFrequently: true }));
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  const nrm = new THREE.CanvasTexture(normalFrom(hc, k)); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  return { map, nrm };
}
const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
// 端にかかる物は反対側にも描く（繰り返しの繋ぎ目を消す）
const wrapDraw = (S, x0, y0, x1, y1, f) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x1 + ox > 0 && x0 + ox < S && y1 + oy > 0 && y0 + oy < S) f(ox, oy); };
const polyPath = (g, pts, ox, oy) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.closePath(); };

// 瓦の屋根：本瓦葺き。丸瓦の列（山）と平瓦（谷）、段ごとに瓦尻が一段高く、その下に影。瓦一枚ずつの濃淡・谷の苔・雨だれ・山の上の白い埃
// 色と法線の二枚（一度だけ作る）。一回りは 8 列 × 8 段
let tileTexC = null;
function tileTex() {
  if (tileTexC) return tileTexC;
  tileTexC = pairTex(256, 256, (g, hg) => {
    const S = 256, C = 32, R = rnd(41);
    g.fillStyle = '#34332f'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += C) {
      for (let x = 0; x < S; x += C) {
        const t = (R() - 0.5) * 16;
        // 平瓦（谷）：浅く窪み、両脇は丸瓦の影
        g.fillStyle = `rgb(${54 + t},${53 + t},${49 + t})`; g.fillRect(x, y, 20, C);
        const vg = g.createLinearGradient(x, 0, x + 20, 0); vg.addColorStop(0, 'rgba(0,0,0,.38)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); vg.addColorStop(0.7, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.3)');
        g.fillStyle = vg; g.fillRect(x, y, 20, C);
        const vh = hg.createLinearGradient(x, 0, x + 20, 0); vh.addColorStop(0, gray(110)); vh.addColorStop(0.5, gray(60)); vh.addColorStop(1, gray(110));
        hg.fillStyle = vh; hg.fillRect(x, y, 20, C);
        // 丸瓦（山）：左が明るく右が暗い丸み
        const mg = g.createLinearGradient(x + 20, 0, x + 32, 0); mg.addColorStop(0, `rgb(${112 + t},${111 + t},${106 + t})`); mg.addColorStop(0.4, `rgb(${80 + t},${79 + t},${75 + t})`); mg.addColorStop(1, '#1e1d1b');
        g.fillStyle = mg; g.fillRect(x + 20, y, 12, C);
        const mh = hg.createLinearGradient(x + 20, 0, x + 32, 0); mh.addColorStop(0, gray(130)); mh.addColorStop(0.45, gray(255)); mh.addColorStop(1, gray(130));
        hg.fillStyle = mh; hg.fillRect(x + 20, y, 12, C);
        // 山の上に白い埃
        g.fillStyle = `rgba(200,196,186,${0.04 + R() * 0.08})`; g.fillRect(x + 22, y, 3, C);
      }
      // 段：一枚の瓦は下（軒の側・絵の下）へ行くほど浮き、瓦尻で一段落ちる
      const sg = hg.createLinearGradient(0, y, 0, y + C); sg.addColorStop(0, gray(0, 0.35)); sg.addColorStop(0.6, gray(0, 0)); sg.addColorStop(1, gray(255, 0.25));
      hg.fillStyle = sg; hg.fillRect(0, y, S, C);
      // 瓦尻の縁の光と、下の段に落ちる影
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, y + C - 2, S, 1);
      const yy = (y + C) % S, dg = g.createLinearGradient(0, yy, 0, yy + 6); dg.addColorStop(0, 'rgba(0,0,0,.55)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = dg; g.fillRect(0, yy, S, 6);
    }
    // 谷の苔と、上から下へ流れた雨だれの白い筋
    for (let i = 0; i < 140; i++) { const x = Math.floor(R() * 8) * C + 3 + R() * 14; g.fillStyle = `rgba(${66 + R() * 30},${84 + R() * 30},50,${0.08 + R() * 0.16})`; g.fillRect(x, R() * S, 2 + R() * 4, 2 + R() * 9); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(200,196,186,${0.03 + R() * 0.05})`; g.fillRect(R() * S, 0, 1 + R(), S); }
  }, 8);
  return tileTexC;
}
const TILE = new THREE.MeshStandardMaterial({ map: tileTex().map, normalMap: tileTex().nrm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide });

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

// 石垣の面（城攻めの石垣の箱が使う大きな面。2.2m で一回り）：
// nozura（野面積み：丸みのある自然石を大小まぜて積み、隙間に間詰石。目地が深い）／uchikomi（打込接：角を叩いて面をそろえた石・目地は細い・鑿の跡）
// 石一つずつの膨らみ・目地の影・苔（目地と下の縁）・雨だれと白い流れの筋を、色と法線の二枚で
function stoneFace(kind) {
  const noz = kind === 'nozura', S = 512, R = rnd(noz ? 11 : 29);
  return pairTex(S, S, (g, hg) => {
    // 目地の奥：暗い裏込めと詰めた土
    g.fillStyle = noz ? '#1b1814' : '#27231e'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${60 + R() * 30},${52 + R() * 24},${40 + R() * 16},0.35)`; g.fillRect(R() * S, R() * S, 2 + R() * 5, 2 + R() * 4); }
    hg.fillStyle = gray(0); hg.fillRect(0, 0, S, S);
    const stone = (cx, cy, rx, ry, small) => {
      // 形：野面は歪んだ丸、打込接は角を少し落とした四角
      let pts;
      if (noz) { const n = 11, a0 = R() * 6.28; pts = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283, r = 0.8 + R() * 0.22; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); } }
      else { const j = () => (R() - 0.5) * 4, c = 3 + R() * 3; pts = [[cx - rx + c, cy - ry + j()], [cx + rx - c + j(), cy - ry + j()], [cx + rx + j(), cy - ry + c], [cx + rx + j(), cy + ry - c], [cx + rx - c, cy + ry + j()], [cx - rx + c + j(), cy + ry + j()], [cx - rx + j(), cy + ry - c], [cx - rx + j(), cy - ry + c]]; }
      const v = (noz ? 118 : 132) + R() * 64, t = R() * 18 - 9, hue = R();
      const col = hue < 0.25 ? [v + 12 + t, v + t * 0.5, v - 20] : hue > 0.8 ? [v - 8, v - 2, v + 6] : [v + t, v + t * 0.6, v - 10];
      const seed = [R(), R(), R(), R(), R()];
      wrapDraw(S, cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, (ox, oy) => {
        const x = cx + ox, y = cy + oy, Rs = rnd(1 + Math.floor(seed[0] * 1e6));
        // 色
        polyPath(g, pts, ox, oy); g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fill();
        g.save(); polyPath(g, pts, ox, oy); g.clip();
        // 膨らみ：上が明るく下が暗い（上からの光）
        const gr = g.createLinearGradient(0, y - ry, 0, y + ry); gr.addColorStop(0, 'rgba(255,248,230,0.2)'); gr.addColorStop(0.45, 'rgba(255,248,230,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.34)');
        g.fillStyle = gr; g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
        // 肌理：斑と小さな窪み
        for (let i = 0; i < rx * ry * 0.06; i++) { const q = 90 + Rs() * 140; g.fillStyle = `rgba(${q},${q - 4},${q - 12},0.22)`; g.fillRect(x - rx + Rs() * rx * 2, y - ry + Rs() * ry * 2, 1 + Rs() * 2.5, 1 + Rs() * 2.5); }
        // 地衣（白っぽい斑）と黒い汚れ
        if (seed[1] < 0.35) { g.fillStyle = `rgba(196,196,170,${0.18 + seed[2] * 0.2})`; g.beginPath(); g.ellipse(x + (seed[3] - 0.5) * rx, y + (seed[4] - 0.5) * ry, rx * 0.3, ry * 0.22, seed[2] * 3, 0, 7); g.fill(); }
        else if (seed[1] > 0.8) { g.fillStyle = 'rgba(30,30,26,0.22)'; g.beginPath(); g.ellipse(x + (seed[3] - 0.5) * rx, y, rx * 0.5, ry * 0.35, 0, 0, 7); g.fill(); }
        // 苔：石の下の縁に
        if (seed[2] < 0.3) { g.fillStyle = `rgba(66,${88 + seed[3] * 30},44,0.4)`; g.beginPath(); g.ellipse(x + (seed[4] - 0.5) * rx, y + ry * 0.85, rx * (0.4 + seed[3] * 0.4), ry * 0.25, 0, 0, 7); g.fill(); }
        // 打込接：叩いた鑿の跡（斜めの短い筋）
        if (!noz) { g.strokeStyle = 'rgba(40,36,30,0.16)'; g.lineWidth = 1; for (let i = 0; i < rx * ry * 0.02; i++) { const px = x - rx + Rs() * rx * 2, py = y - ry + Rs() * ry * 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 5, py + 3); g.stroke(); } }
        g.restore();
        // 縁の影（目地に落ちる所）
        polyPath(g, pts, ox, oy); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = noz ? 2.5 : 1.5; g.stroke();
        // 高さ：野面は丸い膨らみ、打込接は平らな面と面取り
        if (noz) {
          const hgr = hg.createRadialGradient(x - rx * 0.1, y - ry * 0.15, 0, x, y, Math.max(rx, ry) * 1.05);
          hgr.addColorStop(0, gray(small ? 170 : 240)); hgr.addColorStop(0.6, gray(small ? 130 : 185)); hgr.addColorStop(1, gray(80));
          polyPath(hg, pts, ox, oy); hg.fillStyle = hgr; hg.fill();
        } else {
          polyPath(hg, pts, ox, oy); hg.fillStyle = gray(150); hg.fill();
          const s = 1 - 4 / Math.min(rx, ry);
          polyPath(hg, pts.map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]), ox, oy); hg.fillStyle = gray(210); hg.fill();
        }
        hg.save(); polyPath(hg, pts, ox, oy); hg.clip();
        for (let i = 0; i < rx * ry * 0.03; i++) { hg.fillStyle = gray(Rs() < 0.5 ? 60 : 255, 0.12); hg.beginPath(); hg.ellipse(x - rx + Rs() * rx * 2, y - ry + Rs() * ry * 2, 1 + Rs() * 3, 1 + Rs() * 2, 0, 0, 7); hg.fill(); }
        if (!noz) { hg.strokeStyle = gray(120, 0.35); hg.lineWidth = 1; for (let i = 0; i < rx * ry * 0.02; i++) { const px = x - rx + Rs() * rx * 2, py = y - ry + Rs() * ry * 2; hg.beginPath(); hg.moveTo(px, py); hg.lineTo(px + 5, py + 3); hg.stroke(); } }
        hg.restore();
      });
    };
    // 間詰石：大きな石の間に詰めた小石（先に描き、大きな石の隙間にだけ残る）
    if (noz) for (let i = 0; i < 90; i++) { const r = 5 + R() * 8; stone(R() * S, R() * S, r * (1 + R() * 0.6), r, true); }
    // 段：高さを合わせてちょうど S にし、段ごとに石の幅もちょうど S にそろえる（上下左右とも繰り返せる）
    const rows = []; let sum = 0;
    while (sum < S) { const h = noz ? 40 + R() * 44 : 48 + R() * 12; rows.push(h); sum += h; }
    let y = 0;
    for (const h0 of rows) {
      const rh = h0 * S / sum, ws = []; let wsum = 0;
      while (wsum < S) { const w = noz ? 44 + R() * 90 : 72 + R() * 56; ws.push(w); wsum += w; }
      let x = R() * S;
      for (const w0 of ws) {
        const w = w0 * S / wsum, gap = noz ? 3 + R() * 3 : 1.6;
        // 野面は段が揺れる（石の大きさで上下にずれる）
        const dy = noz ? (R() - 0.5) * rh * 0.25 : 0, sh = noz ? 0.9 + R() * 0.22 : 1;
        stone((x + w / 2) % S, y + rh / 2 + dy, w / 2 - gap, rh / 2 * sh - gap, false);
        x += w;
      }
      y += rh;
    }
    // 目地の苔：高さの絵で目地（黒い所）を探して、緑の点を置く
    const hd = hg.getImageData(0, 0, S, S).data;
    for (let i = 0; i < 2600; i++) { const px = (R() * S) | 0, py = (R() * S) | 0; if (hd[(py * S + px) * 4] > 20) continue; g.fillStyle = `rgba(${58 + R() * 20},${80 + R() * 34},${40 + R() * 12},${0.35 + R() * 0.35})`; g.fillRect(px - 1, py - 1, 2 + R() * 3, 2 + R() * 3); }
    // 雨だれ：上から揺れながら下り、細く薄くなる筋（黒い水の跡と、白く乾いた流れ）
    for (let i = 0; i < (noz ? 34 : 42); i++) {
      const white = R() < 0.25, a0 = white ? 0.1 + R() * 0.08 : 0.12 + R() * 0.14, l = 80 + R() * 300, w = 2 + R() * 6;
      let x = R() * S; const y0 = R() * S;
      for (let yy = 0; yy < l; yy += 3) {
        x += (R() - 0.5) * 0.9;
        const a = a0 * (1 - yy / l), ww = w * (1 - yy / l * 0.6);
        g.fillStyle = white ? `rgba(222,216,198,${a})` : `rgba(22,26,20,${a})`;
        for (const oy of [0, -S]) for (const ox of [0, -S, S]) g.fillRect(x + ox, y0 + yy + oy, ww, 3);
      }
    }
  }, noz ? 9 : 7);
}
// 石の肌理：一つの石の面に貼る細かい凹凸（斑・小さな窪み・野面は瘤、打込接は鑿の跡）。縁は目地へ落ちて暗く、上から雨だれ、下に苔
function stoneGrain(kind) {
  const noz = kind === 'nozura', S = 128, R = rnd(noz ? 34 : 65);
  return pairTex(S, S, (g, hg) => {
    g.fillStyle = '#bab4a8'; g.fillRect(0, 0, S, S);
    hg.fillStyle = gray(170); hg.fillRect(0, 0, S, S);
    // 瘤と窪み（大きな起伏）
    for (let i = 0; i < (noz ? 22 : 8); i++) {
      const x = R() * S, y = R() * S, r = (noz ? 10 : 18) + R() * 20, up = R() < 0.6;
      wrapDraw(S, x - r, y - r, x + r, y + r, (ox, oy) => { const gr = hg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, gray(up ? 255 : 60, noz ? 0.35 : 0.15)); gr.addColorStop(1, gray(up ? 255 : 60, 0)); hg.fillStyle = gr; hg.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
      wrapDraw(S, x - r, y - r, x + r, y + r, (ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, up ? 'rgba(236,230,214,0.12)' : 'rgba(60,56,48,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
    }
    // 斑（石の粒）
    for (let i = 0; i < 1100; i++) { const v = 110 + R() * 130, x = R() * S, y = R() * S, s = 1 + R() * 2.5; g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`; g.fillRect(x, y, s, s); hg.fillStyle = gray(v, 0.25); hg.fillRect(x, y, s, s); }
    // 小さな窪み（気泡・欠け）
    for (let i = 0; i < 46; i++) { const x = R() * S, y = R() * S, rx = 1 + R() * 3, ry = 1 + R() * 2, a = R() * 3; g.fillStyle = `rgba(40,38,34,${0.15 + R() * 0.2})`; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); hg.fillStyle = gray(40, 0.7); hg.beginPath(); hg.ellipse(x, y, rx, ry, a, 0, 7); hg.fill(); }
    // 打込接：鑿の跡（斜めに平行な筋）
    if (!noz) for (let i = 0; i < 110; i++) { const x = R() * S, y = R() * S, a = -0.6 + (R() - 0.5) * 0.3, l = 5 + R() * 5; for (const [c, v] of [[g, 'rgba(60,56,50,0.22)'], [hg, gray(90, 0.5)]]) { c.strokeStyle = v; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); } }
    // 雨だれ（上から）と、下の縁の苔
    for (let i = 0; i < 7; i++) { const x = R() * S, l = 40 + R() * 80, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(34,36,30,0.16)'); gr.addColorStop(1, 'rgba(34,36,30,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1.5 + R() * 3, l); }
    const mg = g.createLinearGradient(0, S - 30, 0, S); mg.addColorStop(0, 'rgba(70,92,48,0)'); mg.addColorStop(1, 'rgba(70,92,48,0.3)'); g.fillStyle = mg; g.fillRect(0, S - 30, S, 30);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${60 + R() * 20},${86 + R() * 30},44,${0.2 + R() * 0.3})`; g.fillRect(R() * S, S - Math.pow(R(), 2) * 26, 1 + R() * 3, 1 + R() * 2); }
    // 縁：目地へ落ちる面取りと影（箱の一面ごとに縁が暗く丸くなる）
    const e = noz ? 16 : 8;
    for (const [x0, y0, x1, y1] of [[0, 0, 0, e], [0, S, 0, S - e], [0, 0, e, 0], [S, 0, S - e, 0]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(20,18,14,0.4)'); gr.addColorStop(1, 'rgba(20,18,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      const hr = hg.createLinearGradient(x0, y0, x1, y1); hr.addColorStop(0, gray(70, 0.9)); hr.addColorStop(1, gray(70, 0)); hg.fillStyle = hr; hg.fillRect(0, 0, S, S);
    }
  }, noz ? 5 : 4);
}
// 白壁：漆喰の塗りむらと鏝の跡・軒下の煤け・雨だれの筋・剥げて土壁がのぞく所（藁すさ）・罅・足もとの泥はねと藻
// 壁の一面にそのまま一枚貼る（上が軒、下が足もと）
const plasterTex = () => pairTex(512, 512, (g, hg) => {
  const S = 512, R = rnd(5);
  g.fillStyle = '#f0ebe0'; g.fillRect(0, 0, S, S);
  hg.fillStyle = gray(150); hg.fillRect(0, 0, S, S);
  // 塗りむら（色）と、鏝で撫でた浅い起伏（高さ）
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${200 + R() * 40},${196 + R() * 36},${180 + R() * 30},0.16)`; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 50, 6 + R() * 22, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 180; i++) { hg.fillStyle = gray(R() < 0.5 ? 120 : 185, 0.2); hg.beginPath(); hg.ellipse(R() * S, R() * S, 20 + R() * 60, 3 + R() * 6, (R() - 0.5) * 0.5, 0, 7); hg.fill(); }
  // 軒下の煤け（上ほど暗い、むらのある帯）
  const top = g.createLinearGradient(0, 0, 0, S * 0.2); top.addColorStop(0, 'rgba(56,50,42,0.42)'); top.addColorStop(1, 'rgba(56,50,42,0)'); g.fillStyle = top; g.fillRect(0, 0, S, S * 0.2);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,54,44,0.08)'; g.beginPath(); g.ellipse(R() * S, R() * 30, 20 + R() * 40, 6 + R() * 16, 0, 0, 7); g.fill(); }
  // 雨だれ：軒から垂れた水の筋。上で太く濃く、揺れながら細く薄くなり、止まった所に溜まりの染み
  for (let i = 0; i < 110; i++) {
    let x = R() * S; const y0 = R() * 40, l = 50 + R() * 380, w = 1 + R() * 3.5, a0 = 0.07 + R() * 0.14;
    for (let yy = 0; yy < l; yy += 3) { x += (R() - 0.5) * 0.7; const f = 1 - yy / l; g.fillStyle = `rgba(82,74,60,${a0 * f})`; g.fillRect(x, y0 + yy, w * (0.5 + f * 0.5), 3); }
    if (R() < 0.3) { g.fillStyle = `rgba(82,74,60,${a0 * 0.6})`; g.beginPath(); g.ellipse(x + w / 2, y0 + l, w * 1.4, 3, 0, 0, 7); g.fill(); }
  }
  // 剥げ：漆喰が欠けて土壁がのぞく（窪み）。縁は崩れた漆喰、中に藁すさ
  for (let i = 0; i < 4; i++) {
    const x = 20 + R() * (S - 40), y = 200 + R() * 260, w = 10 + R() * 26, h = 8 + R() * 16, pts = [];
    for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, r = 0.38 + R() * 0.24; pts.push([x + Math.cos(a) * w * r, y + Math.sin(a) * h * r]); }
    g.fillStyle = 'rgba(210,202,186,1)'; g.beginPath(); g.ellipse(x, y, w * 0.64, h * 0.64, R() * 0.5, 0, 7); g.fill();
    polyPath(g, pts, 0, 0); g.fillStyle = '#9c8262'; g.fill();
    polyPath(hg, pts, 0, 0); hg.fillStyle = gray(40); hg.fill();
    polyPath(g, pts, 0, 0); g.strokeStyle = 'rgba(50,38,26,0.5)'; g.lineWidth = 1.5; g.stroke();
    for (let k = 0; k < 18; k++) { const sx = x - w * 0.3 + R() * w * 0.6, sy = y - h * 0.3 + R() * h * 0.6, a = R() * 3.14; g.strokeStyle = `rgba(${170 + R() * 40},${140 + R() * 30},80,0.55)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5); g.stroke(); }
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(60,44,30,0.4)'; g.fillRect(x - w * 0.3 + R() * w * 0.6, y - h * 0.3 + R() * h * 0.6, 3, 1); }
    // 剥げの下へ流れた土の染み
    const st = g.createLinearGradient(0, y, 0, y + 60); st.addColorStop(0, 'rgba(120,96,66,0.22)'); st.addColorStop(1, 'rgba(120,96,66,0)'); g.fillStyle = st; g.fillRect(x - w * 0.2, y + h * 0.3, w * 0.3, 60);
  }
  // 細い罅（色も高さも凹む）
  for (let i = 0; i < 16; i++) {
    let x = R() * S, y = R() * S; const pts = [[x, y]];
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 26; y += R() * 20; pts.push([x, y]); }
    for (const [c, v, lw] of [[g, 'rgba(70,64,54,0.4)', 0.9], [hg, gray(60, 0.8), 1.2]]) { c.strokeStyle = v; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); }
  }
  // 足もと：泥はね（下ほど濃い点）と、湿って青い藻
  const bot = g.createLinearGradient(0, S * 0.8, 0, S); bot.addColorStop(0, 'rgba(96,78,54,0)'); bot.addColorStop(1, 'rgba(96,78,54,0.45)'); g.fillStyle = bot; g.fillRect(0, S * 0.8, S, S * 0.2);
  for (let i = 0; i < 1400; i++) { const y = S - Math.pow(R(), 2.2) * 110, s = 0.6 + R() * 2.2; g.fillStyle = `rgba(${86 + R() * 30},${68 + R() * 20},${46 + R() * 12},${0.2 + R() * 0.35})`; g.beginPath(); g.ellipse(R() * S, y, s, s * (0.6 + R() * 0.6), 0, 0, 7); g.fill(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(84,100,62,0.12)'; g.beginPath(); g.ellipse(R() * S, S - R() * 30, 10 + R() * 30, 4 + R() * 10, 0, 0, 7); g.fill(); }
}, 4);
// 下見板：黒く塗った板を横に重ね張りし、縦に押縁を打つ。板ごとの濃淡・木目と節・継ぎ目・重ねの段と影・日に焼けて褪せた所・剥げた墨
const shitamiTex = () => pairTex(256, 256, (g, hg) => {
  const S = 256, B = 32, R = rnd(9);
  g.fillStyle = '#2a2521'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += B) {
    const t = R() * 12;
    g.fillStyle = `rgb(${38 + t},${33 + t * 0.8},${28 + t * 0.6})`; g.fillRect(0, y, S, B);
    // 重ね張り：板の上は薄く（奥）、下の縁は厚く（手前）
    const hgr = hg.createLinearGradient(0, y, 0, y + B); hgr.addColorStop(0, gray(70)); hgr.addColorStop(1, gray(210)); hg.fillStyle = hgr; hg.fillRect(0, y, S, B);
    // 木目：揺れる筋（墨の下から浮く）
    for (let k = 0; k < 22; k++) {
      const yy = y + 2 + R() * (B - 5), ph = R() * 6, amp = 0.8 + R() * 1.6, lw = 0.6 + R() * 0.8;
      for (const [c, v] of [[g, `rgba(${92 + R() * 40},${80 + R() * 30},${64 + R() * 20},${0.06 + R() * 0.1})`], [hg, gray(R() < 0.5 ? 40 : 255, 0.14)]]) {
        c.strokeStyle = v; c.lineWidth = lw; c.beginPath(); c.moveTo(0, yy); for (let x = 0; x <= S; x += 8) c.lineTo(x, yy + Math.sin(x * 0.04 + ph) * amp); c.stroke();
      }
    }
    // 節
    if (R() < 0.6) { const x = R() * S, yy = y + 8 + R() * (B - 16); for (let r = 6; r > 0; r -= 1.5) { g.strokeStyle = `rgba(14,12,10,${0.3})`; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, yy, r * 1.8, r * 0.7, 0, 0, 7); g.stroke(); } hg.fillStyle = gray(60, 0.5); hg.beginPath(); hg.ellipse(x, yy, 4, 2, 0, 0, 7); hg.fill(); }
    // 上の縁は日に焼けて褪せる
    g.fillStyle = `rgba(150,136,116,${0.05 + R() * 0.07})`; g.fillRect(0, y, S, 8);
    // 板の継ぎ目（縦の隙間）
    for (let x = R() * 80; x < S; x += 80 + R() * 80) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 2, B); g.fillStyle = 'rgba(150,136,116,.1)'; g.fillRect(x + 2, y, 1, B); hg.fillStyle = gray(20); hg.fillRect(x, y, 2, B); }
  }
  // 重ねの影：上の板の下の縁が、下の板の頭に落とす影
  for (let y = B; y <= S; y += B) { const yy = y % S, sg = g.createLinearGradient(0, yy, 0, yy + 6); sg.addColorStop(0, 'rgba(0,0,0,.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(0, yy, S, 6); g.fillStyle = 'rgba(160,146,124,.12)'; g.fillRect(0, (y - 2 + S) % S, S, 1); }
  // 押縁（縦の細い材）と釘
  for (let x = 20; x < S; x += 64) {
    g.fillStyle = '#1c1916'; g.fillRect(x, 0, 7, S); g.fillStyle = 'rgba(140,126,106,.14)'; g.fillRect(x, 0, 2, S); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 7, 0, 2, S);
    hg.fillStyle = gray(255); hg.fillRect(x + 1, 0, 5, S); hg.fillStyle = gray(200); hg.fillRect(x, 0, 1, S); hg.fillRect(x + 6, 0, 1, S);
    for (let y = B - 6; y < S; y += B) { g.fillStyle = 'rgba(120,108,92,.5)'; g.fillRect(x + 2.5, y, 2, 2); }
  }
  // 墨が剥げて木地がのぞく所と、白く粉を吹いた褪せ
  for (let i = 0; i < 18; i++) { const x = R() * S, y = R() * S, w = 4 + R() * 18, h = 2 + R() * 5; g.fillStyle = `rgba(110,90,64,${0.15 + R() * 0.2})`; g.fillRect(x, y, w, h); hg.fillStyle = gray(90, 0.3); hg.fillRect(x, y, w, h); }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(170,160,146,0.05)'; g.beginPath(); g.ellipse(R() * S, R() * S, 20 + R() * 40, 8 + R() * 20, 0, 0, 7); g.fill(); }
}, 7);
let CK = null;
function ck() {
  if (CK) return CK;
  const st = (T, ns, rough = 0.95) => new THREE.MeshStandardMaterial({ vertexColors: true, map: T.map, normalMap: T.nrm, normalScale: new THREE.Vector2(ns, ns), roughness: rough, metalness: 0 });
  CK = {
    nozura: st(stoneGrain('nozura'), 1), uchikomi: st(stoneGrain('uchikomi'), 0.9),
    // 大きな面に石の並びを描いた物（城攻めの石垣の箱が使う）。face は野面積み、faceU は打込接
    face: st(stoneFace('nozura'), 1.3), faceU: st(stoneFace('uchikomi'), 1.1),
    plaster: st(plasterTex(), 0.6, 0.92),
    shitami: st(shitamiTex(), 1, 0.85),
    wood: MAT, tile: TILE, iron: IRON,
  };
  return CK;
}
// 城攻め（b_castle.js）も同じ石垣の素材を使う（k = 'uchikomi' で打込接の面）
export function castleStoneMat(k = 'nozura') { return k === 'uchikomi' ? ck().faceU : ck().face; }
export function castleMat(k) { return ck()[k]; }
// 部品を素材ごとに集める入れ物
const kit = () => ({ nozura: [], uchikomi: [], plaster: [], shitami: [], wood: [], tile: [], iron: [] });
// 汚れと陰：一つの部品の中で、下ほど雨の跳ねと泥で黒ずみ（石は湿りと苔で暗く）、白壁は軒のすぐ下が陰る
const WEATHER = { plaster: [0.8, 0.86], shitami: [0.84, 1], nozura: [0.86, 1], uchikomi: [0.88, 1] };
function weather(g, k) {
  const W = WEATHER[k];
  if (!W) return g;
  const P = g.attributes.position, C = g.attributes.color;
  if (!C) return g;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const h = Math.max(0.01, y1 - y0);
  for (let i = 0; i < P.count; i++) {
    const t = (P.getY(i) - y0) / h;
    // 下の 1.2m ほどが黒ずむ。白壁は上の端が軒の陰
    let f = W[0] + (1 - W[0]) * Math.min(1, (t * h) / 1.2);
    if (W[1] < 1 && t > 0.92) f *= W[1];
    C.setXYZ(i, C.getX(i) * f, C.getY(i) * f, C.getZ(i) * f);
  }
  return g;
}
function kitMesh(B, cam = true) {
  const M = ck(), grp = new THREE.Group();
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(B[k].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => weather(g.attributes.color ? g : paint(g, 0xffffff), k))), M[k]);
    m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = cam;
    grp.add(m);
  }
  return grp;
}
// 箱（中心 x,y,z、幅 w・高さ h・奥行き d、y 軸の回り rot）。uvk：絵の繰り返しを大きさに合わせる（m ごと）
function kbox(P, hex, x, y, z, w, h, d, rot = 0, uvk = 0) {
  // 高い面は縦に割る（下の黒ずみと軒下の陰を、面の途中で付けられるように）
  const g = new THREE.BoxGeometry(w, h, d, 1, !uvk && h > 0.8 ? 5 : 1, 1);
  if (uvk) { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / uvk, uv.getY(i) * dims[f][1] / uvk); } }
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(paint(g, hex));
}
// 寄棟の瓦屋根（軒 w×d、高さ h、軒の高さ y）。hipGeo の形に瓦の絵。W は漆喰の入れ物（棟の白い筋）
function ktile(P, W, x, y, z, w, d, h, rot = 0, ridge = 0.35) {
  const rl = Math.max(0.3, (w - d) / 2 + ridge);
  const g = hipGeo(w / 2, d / 2, h, 0, rl);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(g);
  const Q = Lr(x, z, rot);
  // 軒先：軒瓦の丸い縁（四方）
  for (const [lx, lz, L, a] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
    const e = new THREE.CylinderGeometry(0.1, 0.1, L, 6, 1, true); e.rotateZ(Math.PI / 2); e.rotateY(rot + a);
    const [ex, ez] = Q(lx, lz); e.translate(ex, y - 0.05, ez); P.push(paint(e, 0x3a3937));
  }
  // 棟：太い熨斗瓦の積み（丸い筒で）と、両端の鬼瓦
  const rg = new THREE.CylinderGeometry(0.2, 0.22, rl * 2 + 0.2, 8); rg.rotateZ(Math.PI / 2); rg.rotateY(rot); rg.translate(x, y + h + 0.1, z); P.push(paint(rg, 0x2e2d2b));
  // 熨斗瓦の段の間に白い漆喰の筋（両の面）と、上の冠瓦：空を映して明るい（棟の明かり）
  { const [lx, lz] = Q(0, 0.215), [rx2, rz2] = Q(0, -0.215); for (const [px, pz] of [[lx, lz], [rx2, rz2]]) { const b = new THREE.BoxGeometry(rl * 2 + 0.1, 0.05, 0.03); b.rotateY(rot); b.translate(px, y + h + 0.08, pz); W.push(paint(b, 0xd8d2c4)); } }
  const kg = new THREE.CylinderGeometry(0.11, 0.11, rl * 2 + 0.26, 8, 1, false, -Math.PI / 2, Math.PI); kg.rotateZ(Math.PI / 2); kg.rotateX(-Math.PI / 2); kg.rotateY(rot); kg.translate(x, y + h + 0.3, z); P.push(paint(kg, 0x8e8d88));
  for (const s of [-1, 1]) { const [ox, oz] = Q(s * (rl + 0.12), 0); const o = new THREE.BoxGeometry(0.16, 0.55, 0.5); o.rotateY(rot); o.translate(ox, y + h + 0.3, oz); P.push(paint(o, 0x2a2927)); }
  // 隅棟（四隅から棟の端へ）
  for (const [cx, cz, sx] of [[-w / 2, -d / 2, -1], [w / 2, -d / 2, 1], [w / 2, d / 2, 1], [-w / 2, d / 2, -1]]) {
    const [ax2, az2] = Q(cx, cz), [bx2, bz2] = Q(sx * rl, 0);
    const dv = new THREE.Vector3(bx2 - ax2, h, bz2 - az2), L = dv.length();
    const hg = new THREE.CylinderGeometry(0.12, 0.13, L, 6); hg.translate(0, L / 2, 0); hg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, dv.normalize())); hg.translate(ax2, y + 0.02, az2); P.push(paint(hg, 0x2e2d2b));
  }
}
const Lr = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

// ---- 石を一つずつ積む（A4）：石は凹凸のある小さな塊で、目地は奥の暗い裏込めが覗く。下ほど苔、ところどころ雨だれの筋
// 面の向き N（外向き）、線 a→b、上の高さ top と下の高さ bot（各点で関数）、勾配 lean と反り（下ほど外へ開く）
const hsh = (a, b) => { let h = Math.imul(Math.floor(a * 73.1) ^ Math.imul(Math.floor(b * 91.7), 2654435761), 1597334677) >>> 0; h ^= h >>> 15; return (h % 10007) / 10007; };
const UPV = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function stoneGeo(w, h, d, kind, seed, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, 1);
  const P = g.attributes.position, round = kind === 'nozura' ? 0.38 : 0.24;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const fx = Math.abs(x) / (w / 2), fy = Math.abs(y) / (h / 2);
    // 前の面の縁ほど奥へ（角が丸い石）。同じ所の頂点は同じだけ動かす（割れ目を作らない）
    if (z > 0) z -= (Math.max(fx, fy) ** 2) * d * round + hsh(seed + x * 3, y * 5) * d * (kind === 'nozura' ? 0.25 : 0.06);
    x *= 1 + (hsh(seed, y * 7 + 1) - 0.5) * (kind === 'nozura' ? 0.16 : 0.04);
    y *= 1 + (hsh(seed + 2, x * 7) - 0.5) * (kind === 'nozura' ? 0.14 : 0.04);
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function stoneCourse(B, kind, ax, az, bx, bz, topAt, botAt, lean, side, seed, big = 1) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return;
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side;
  const face = Math.atan2(nx, nz);
  const noz = kind === 'nozura';
  const gap = noz ? 0.07 : 0.018;
  // 裏込め（目地の奥の暗い面）：長さに沿って高さを追う帯を、石の少し奥に両面で張る（坂でも隙間から空が見えないように）
  {
    const NS = Math.max(2, Math.ceil(len / 2)), pos = [];
    const at = (t, up) => {
      const bot = botAt(t) - 0.15, top = topAt(t), H = Math.max(0.05, top - bot);
      const y = up ? top - 0.05 : bot, q = up ? 0 : 1, o = H * lean * Math.pow(q, 1.5) + 0.02;
      return [ax + tx * len * t + nx * o, y, az + tz * len * t + nz * o];
    };
    for (let k = 0; k < NS; k++) {
      const a0 = at(k / NS, false), a1 = at((k + 1) / NS, false), b0 = at(k / NS, true), b1 = at((k + 1) / NS, true);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0, ...a0, ...b1, ...a1, ...a0, ...b0, ...b1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    B[kind].push(paint(g, 0x2e2b27));
  }
  let y0 = 0, row = 0;
  const Hmax = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => topAt(t) - botAt(t)));
  while (y0 < Hmax - 0.05) {
    const rh = (noz ? 0.34 + hsh(seed + row, 3.3) * 0.36 : 0.42 + hsh(seed + row, 1.7) * 0.1) * big;
    let u = -hsh(seed + row, 9.1) * 0.6;
    let k = 0;
    while (u < len) {
      const sw = (noz ? 0.45 + hsh(seed + row * 31, u * 3 + 0.3) * 0.75 : 0.7 + hsh(seed + row * 17, u * 2) * 0.35) * big;
      const u0 = Math.max(0, u), u1 = Math.min(len, u + sw);
      u += sw; k++;
      if (u1 - u0 < 0.15) continue;
      const t = (u0 + u1) / 2 / len, bot = botAt(t), top = topAt(t), H = top - bot;
      const yb = y0, yt = Math.min(y0 + rh, H);
      if (yt - yb < 0.12 || yb >= H) continue;
      // 反り：上ほど立ち、下ほど外へ（高さの割合 q の所の張り出し）
      const q = 1 - (yb + yt) / 2 / Math.max(0.5, H);
      const out = H * lean * Math.pow(q, 1.5) + 0.12;
      const wS = u1 - u0 - gap, hS = yt - yb - gap, dS = noz ? 0.55 : 0.45;
      const g = stoneGeo(wS, hS, dS, kind, seed * 13 + row * 101 + k, big > 1 ? 1 : 2);
      const tilt = Math.atan(lean * 1.5 * Math.pow(Math.max(q, 0.01), 0.5));
      _e.set(-tilt, face, 0, 'YXZ'); g.applyQuaternion(_q.setFromEuler(_e));
      const cx = ax + tx * (u0 + u1) / 2 + nx * out, cz = az + tz * (u0 + u1) / 2 + nz * out;
      g.translate(cx, bot + (yb + yt) / 2, cz);
      // 色：石ごとの濃淡、下ほど苔の緑、雨だれの筋（縦に並ぶ石が暗い）
      const r = hsh(seed + k * 7, row * 3 + 0.5), r2 = hsh(seed + k * 3, row * 5 + 0.7), streak = hsh(Math.floor(cx * 1.3 + cz * 1.3), 7.7) < 0.12 ? 0.8 : 1;
      const c = new THREE.Color(noz ? 0xa29d90 : 0xb0aa9c).multiplyScalar((0.62 + r * 0.55) * streak);
      if (r2 < 0.3) c.lerp(new THREE.Color(0xa08a6a), 0.45);           // 赤み・黄みの石
      else if (r2 > 0.8) c.lerp(new THREE.Color(0x7e8890), 0.35);      // 青みの石
      const moss = Math.max(0, 1 - (yb / Math.max(0.5, H)) * 2.2) * (0.25 + hsh(k, row) * 0.5);
      c.lerp(new THREE.Color(0x4e5a38), moss);
      B[kind].push(paint(g, c.getHex()));
    }
    y0 += rh; row++;
  }
}
// 石垣：点の並び pts に沿って、進む向きの左手側（o.out = -1 で右手側）へ張り出す石の面。上端は線の地面の高さ + o.top、
// 下は外の地面より o.sink 深く（o.maxH まで）。o.kind：'nozura'（野面積み・既定）か 'uchikomi'（打込接）
export function ishigaki(world, pts, o = {}) {
  const B = kit(), kind = o.kind || 'nozura', side = o.out || 1;
  const lean = o.lean ?? (kind === 'nozura' ? 0.34 : 0.26);
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
    const nx = -(bz - az) / len * side, nz = (bx - ax) / len * side;
    const P = (t) => [ax + (bx - ax) * t, az + (bz - az) * t];
    const topAt = (t) => { const [x, z] = P(t); return world.heightAt(x, z) + (o.top ?? 0.4); };
    const botAt = (t) => { const [x, z] = P(t); const tp = topAt(t); const b = Math.min(world.heightAt(x + nx * 2.5, z + nz * 2.5), world.heightAt(x + nx * 5, z + nz * 5), tp - (o.minH ?? 2)) - (o.sink ?? 0.4); return Math.max(b, tp - (o.maxH ?? 4)); };
    stoneCourse(B, kind, ax, az, bx, bz, topAt, botAt, lean, side, s * 17 + Math.round(ax * 3 + az * 5), o.big || 1);
    // 天端の笠石：平たい石を一列（板に見えないよう、一つずつ）
    stoneCourse(B, kind, ax, az, bx, bz, (t) => topAt(t) + 0.22, (t) => topAt(t) - 0.02, 0, side, s * 23 + 7, o.big || 1);
  }
  return kitMesh(B);
}
// 四角い台（櫓・天守・門の脇）を石で積む：中心 x,z、幅 w・奥行き d、回り rot、高さ h（下は地面より 0.6 深く）
function stoneBase(B, world, kind, x, z, w, d, rot, h) {
  const P = Lr(x, z, rot), top = world.heightAt(x, z) - 0.3 + h;
  const c = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
  const lean = kind === 'nozura' ? 0.22 : 0.16;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    // 角を順に回ると外は右手側（side = -1）
    stoneCourse(B, kind, ax, az, bx, bz, () => top, (t) => Math.min(top - 0.5, world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.6), lean, -1, i * 29 + Math.round(x * 7 + z * 3));
  }
  kbox(B[kind], 0x8e897d, x, top + 0.06, z, w + 0.2, 0.16, d + 0.2, rot, 1.4);
  return top;
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
    if (i === 0) stoneCourse(B, 'nozura', ax, az, bx, bz, (t) => world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) + 0.75, (t) => world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.3, 0.1, 1, Math.round(ax * 5 + az * 3));   // 腰の石（外の面）
    kbox(B.nozura, 0x3a3630, mx, y + 0.3, mz, L, 1.1, 0.6, rot, 1.4);                     // 腰の芯（目地の奥）
    kbox(B.plaster, vary(0xc9c2b0, i), mx, y + 0.85 + (H - 0.85) / 2, mz, L, H - 0.85, 0.36, rot, 0);   // 漆喰
    kbox(B.shitami, 0x9a948a, mx, y + 1.05, mz, L, 0.5, 0.38, rot, 1.2);                   // 腰の下見板
    kbox(B.wood, 0x2c2622, mx, y + H - 0.12, mz, L, 0.1, 0.38, rot);                       // 長押
    // 瓦の笠：切妻に葺いた二枚の瓦の面（外と内へ傾け、軒は壁より張り出す）と、軒先の丸瓦の列の影、白い棟
    for (const sd of [1, -1]) {
      const g = new THREE.BoxGeometry(L + 0.02, 0.07, 0.62);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (L + 0.02) / 0.9, uv.getY(k) * 0.62 / 0.9);
      g.translate(0, 0, sd * 0.29); g.rotateX(sd * 0.42); g.rotateY(rot); g.translate(mx, y + H + 0.16, mz);
      B.tile.push(paint(g, 0xffffff));
      const nx0 = Math.sin(rot) * sd * 0.56, nz0 = Math.cos(rot) * sd * 0.56;
      kbox(B.iron, 0x1a1a1c, mx + nx0, y + H + 0.02, mz + nz0, L, 0.06, 0.05, rot);        // 軒先の瓦の口の影
    }
    kbox(B.plaster, 0xe2dccc, mx, y + H + 0.3, mz, L + 0.02, 0.1, 0.16, rot);              // 棟の漆喰
    kbox(B.tile, 0xffffff, mx, y + H + 0.37, mz, L + 0.02, 0.07, 0.2, rot);                // 棟瓦
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
  stoneBase(B, world, o.stone || 'uchikomi', x, z, w + 1.2, d + 1.2, rot, base + 0.3);
  let yy = y + base;
  // 一重：腰は下見板、上は白壁
  kbox(B.shitami, 0xa8a298, x, yy + 1.0, z, w, 2.0, d, rot, 2);
  kbox(B.plaster, 0xcdc6b4, x, yy + 2.5, z, w, 1.0, d, rot);
  // 格子窓と石落とし
  for (const s of [-1, 1]) {
    for (const q of [-1, 1]) { const [wx, wz] = P(q * w * 0.25, s * (d / 2 + 0.02)); kbox(B.iron, 0x121110, wx, yy + 2.45, wz, 0.9, 0.5, 0.04, rot); for (let b = -2; b <= 2; b++) { const [lx, lz] = P(q * w * 0.25 + b * 0.18, s * (d / 2 + 0.05)); kbox(B.wood, 0x3a2e24, lx, yy + 2.45, lz, 0.05, 0.54, 0.04, rot); } }
  }
  { const [sx, sz] = P(w / 2 - 0.6, d / 2 + 0.35); kbox(B.plaster, 0xe0dac8, sx, yy + 1.6, sz, 1.4, 1.0, 0.7, rot); kbox(B.iron, 0x0c0b0a, sx, yy + 1.08, sz, 1.2, 0.04, 0.55, rot); }
  ktile(B.tile, B.plaster, x, yy + 3.0, z, w + 1.8, d + 1.8, 0.9, rot, 0.9);
  yy += 3.35;
  const w2 = w * 0.72, d2 = d * 0.72;
  kbox(B.plaster, 0xd0c9b8, x, yy + 1.1, z, w2, 2.2, d2, rot);
  kbox(B.shitami, 0xa8a298, x, yy + 0.35, z, w2 + 0.02, 0.7, d2 + 0.02, rot, 2);
  for (const s of [-1, 1]) {
    const [wx, wz] = P(0, s * (d2 / 2 + 0.02)); kbox(B.iron, 0x121110, wx, yy + 1.35, wz, 1.1, 0.55, 0.04, rot);
    // 格子（太い木の縦格子）と、窓の上下の白い額縁
    for (let bq = -2; bq <= 2; bq++) { const [lx, lz] = P(bq * 0.2, s * (d2 / 2 + 0.05)); kbox(B.wood, 0x3a2e24, lx, yy + 1.35, lz, 0.07, 0.6, 0.06, rot); }
    for (const hy of [1.06, 1.64]) { const [fx, fz] = P(0, s * (d2 / 2 + 0.05)); kbox(B.plaster, 0xe6e0d0, fx, yy + hy, fz, 1.3, 0.08, 0.08, rot); }
  }
  ktile(B.tile, B.plaster, x, yy + 2.2, z, w2 + 1.9, d2 + 1.9, 1.5, rot, 0.4);
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
    stoneBase(B, world, o.stone || 'uchikomi', px, pz, 2.6, 4, rot, 2.9);
    const [cx, cz] = P(sx * (w / 2 + 0.1), 0);
    kbox(B.wood, 0x3e2e22, cx, y + 1.9, cz, 0.45, 3.8, 0.45, rot);
  }
  const Lw = w + 5.6;
  kbox(B.wood, 0x3a2a1c, x, y + 3.85, z, Lw, 0.3, 4.2, rot);
  kbox(B.shitami, 0xa8a298, x, y + 4.5, z, Lw - 0.2, 1.0, 3.8, rot, 2);
  kbox(B.plaster, 0xcdc6b4, x, y + 5.5, z, Lw - 0.2, 1.0, 3.8, rot);
  for (const s of [-1, 1]) for (const q of [-1, 0, 1]) { const [wx, wz] = P(q * 2.4, s * 1.92); kbox(B.iron, 0x121110, wx, y + 5.4, wz, 1.0, 0.5, 0.04, rot); }
  // 冠木（太い横木）と、柱の根巻きの金具・鎹
  kbox(B.wood, 0x33261b, x, y + 3.55, z, w + 1.2, 0.45, 0.5, rot);
  for (const sx of [-1, 1]) { const [cx, cz] = P(sx * (w / 2 + 0.1), 0); kbox(B.iron, 0x1a1816, cx, y + 0.35, cz, 0.52, 0.6, 0.52, rot); kbox(B.iron, 0x1a1816, cx, y + 3.2, cz, 0.5, 0.14, 0.5, rot); }
  // 扉（開いたまま、内へ）：縦の板に、黒い鉄の帯と乳金物
  for (const sx of [-1, 1]) {
    const [dx, dz] = P(sx * (w / 2 - 0.2), -1.4); kbox(B.wood, 0x3a2c20, dx, y + 1.6, dz, 0.18, 3.2, 2.4, rot);
    for (const yy of [0.5, 1.6, 2.7]) kbox(B.iron, 0x161412, dx, y + yy, dz, 0.22, 0.14, 2.42, rot);
    for (const zz of [-0.8, 0, 0.8]) for (const yy of [0.5, 1.6, 2.7]) { const [nx2, nz2] = P(sx * (w / 2 - 0.2) + sx * 0.12, -1.4 + zz); kbox(B.iron, 0x201d1a, nx2, y + yy, nz2, 0.06, 0.12, 0.12, rot); }
  }
  // 木組み：門柱の後ろの控柱と、門柱と結ぶ貫（上下二段）。控柱の根にも金具
  for (const sx of [-1, 1]) {
    const [bx2, bz2] = P(sx * (w / 2 + 0.1), -1.6);
    kbox(B.wood, 0x3a2b20, bx2, y + 1.3, bz2, 0.3, 2.6, 0.3, rot);
    kbox(B.iron, 0x1a1816, bx2, y + 0.25, bz2, 0.36, 0.4, 0.36, rot);
    for (const hy of [0.9, 2.4]) { const [mx2, mz2] = P(sx * (w / 2 + 0.1), -0.8); kbox(B.wood, 0x33261b, mx2, y + hy, mz2, 0.16, 0.22, 1.7, rot); }
  }
  // 渡櫓の床を支える腕木（梁の先が表に並ぶ）と、軒下の出桁
  for (let q = -4; q <= 4; q++) for (const s2 of [-1, 1]) { const [ax2, az2] = P(q * Lw / 9, s2 * 2.15); kbox(B.wood, 0x2e2219, ax2, y + 3.95, az2, 0.18, 0.2, 0.5, rot); }
  for (const s2 of [-1, 1]) { const [ex, ez] = P(0, s2 * 2.3); kbox(B.wood, 0x2a1f17, ex, y + 5.92, ez, Lw + 0.6, 0.16, 0.16, rot); }
  ktile(B.tile, B.plaster, x, y + 6.0, z, Lw + 1.6, 5.6, 1.6, rot, 0.3);
  return kitMesh(B);
}

// 曲輪の中（中を歩ける城の地面の上）：土蔵・番所・井戸・兵糧の俵・槍立て・石灯籠を、曲輪の広さ w×d に合わせて置く。
// 真ん中は通り道として空ける。o.seed でばらつき、o.rot で向き、o.kura（土蔵の数）
export function kuruwa(world, cx, cz, w, d, o = {}) {
  const rot = o.rot || 0, B = kit(), P = Lr(cx, cz, rot);
  let sd = (o.seed || 7) >>> 0; const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const grp = new THREE.Group();
  // 土蔵：黒い海鼠壁の腰・白い漆喰・瓦の置屋根・鉄の扉
  const nk = o.kura ?? Math.max(1, Math.round(w / 18));
  for (let i = 0; i < nk; i++) {
    const lx = -w / 2 + 5 + (i + 0.5) * (w - 10) / nk, lz = -d / 2 + 4.5;
    const [x, z] = P(lx, lz), y = world.heightAt(x, z), kw = 5.5 + R() * 1.5, kd = 4;
    solidRect(x, z, kw + 0.4, kd + 0.4, rot);
    kbox(B.nozura, 0x8a857a, x, y + 0.2, z, kw + 0.3, 0.5, kd + 0.3, rot, 1.4);
    kbox(B.shitami, 0x3a3834, x, y + 0.95, z, kw, 1.0, kd, rot, 2);
    kbox(B.plaster, 0xd6cfbe, x, y + 1.45 + 1.4, z, kw, 2.8, kd, rot);
    for (let q = -2; q <= 2; q++) { const [gx, gz] = P(lx + q * kw / 5.2, lz + kd / 2 + 0.02); kbox(B.plaster, 0xeae4d6, gx, y + 0.95, gz, 0.06, 0.95, 0.03, rot); }
    { const [dx, dz] = P(lx, lz + kd / 2 + 0.06); kbox(B.iron, 0x1c1a18, dx, y + 1.45, dz, 1.3, 2.1, 0.08, rot); kbox(B.plaster, 0xcfc8b6, dx, y + 2.75, dz, 1.8, 0.35, 0.3, rot); }
    ktile(B.tile, B.plaster, x, y + 4.25, z, kw + 1.2, kd + 1.2, 1.5, rot, 0.4);
  }
  // 番所：板葺きの小屋（柱と腰板、格子の窓）
  { const [x, z] = P(w / 2 - 5, d / 2 - 4), y = world.heightAt(x, z); solidRect(x, z, 4.4, 3.4, rot);
    kbox(B.wood, 0x4a3a2a, x, y + 1.1, z, 4, 2.2, 3, rot); for (const q of [-1, 1]) for (const r of [-1, 1]) { const [px, pz] = P(w / 2 - 5 + q * 2, d / 2 - 4 + r * 1.5); kbox(B.wood, 0x2e241a, px, y + 1.2, pz, 0.2, 2.4, 0.2, rot); }
    ktile(B.tile, B.plaster, x, y + 2.3, z, 5, 4, 1.0, rot, 0.4); }
  // 井戸（石の井筒と、つるべの屋根）
  { const [x, z] = P(-w / 2 + 6, d / 2 - 5), y = world.heightAt(x, z); solidCircle(x, z, 1);
    const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.8, 12, 1, true); ring.translate(x, y + 0.4, z); B.nozura.push(paint(ring, 0x8a857a));
    for (const q of [-1, 1]) { const [px, pz] = P(-w / 2 + 6 + q * 0.9, d / 2 - 5); kbox(B.wood, 0x3a2c20, px, y + 1.2, pz, 0.14, 2.4, 0.14, rot); }
    ktile(B.tile, B.plaster, x, y + 2.35, z, 2.4, 1.4, 0.6, rot, 0.5); }
  // 槍立て（槍を並べて立てる木の枠）と兵糧の俵、石灯籠
  { const [x, z] = P(-w / 2 + 3, 0), y = world.heightAt(x, z); kbox(B.wood, 0x3a2c20, x, y + 0.9, z, 0.15, 0.12, 3.5, rot + Math.PI / 2); kbox(B.wood, 0x3a2c20, x, y + 0.3, z, 0.15, 0.12, 3.5, rot + Math.PI / 2);
    for (let q = 0; q < 9; q++) { const [sx, sz] = P(-w / 2 + 3, -1.6 + q * 0.4); kbox(B.wood, 0x5a4630, sx, y + 1.9, sz, 0.05, 3.8, 0.05, rot); kbox(B.iron, 0x9a9a98, sx, y + 3.95, sz, 0.04, 0.35, 0.04, rot); } }
  grp.add(kitMesh(B));
  { const [x, z] = P(w / 2 - 4, -d / 2 + 5); grp.add(tawara(world, x, z, rot, 8)); }
  for (const q of [-1, 1]) {
    const [x, z] = P(q * 3.2, d / 2 - 2), y = world.heightAt(x, z), L = kit();
    kbox(L.nozura, 0x8a857a, x, y + 0.3, z, 0.7, 0.6, 0.7, rot, 1.4); kbox(L.nozura, 0x8a857a, x, y + 0.9, z, 0.3, 0.6, 0.3, rot, 1.4);
    kbox(L.uchikomi, 0x9a958a, x, y + 1.45, z, 0.6, 0.5, 0.6, rot, 1.4); const cap = new THREE.ConeGeometry(0.62, 0.4, 4); cap.rotateY(Math.PI / 4 + rot); cap.translate(x, y + 1.9, z); L.uchikomi.push(paint(cap, 0x8e897d));
    solidCircle(x, z, 0.45);
    grp.add(kitMesh(L));
  }
  return grp;
}

// 天守：石垣の天守台に、下見板と白壁の重ね。庇の瓦屋根・千鳥破風・最上階の廻縁と高欄・鯱。floors 階、b は一階の幅
// o.old：古い型（黒い下見板を多く・破風少なめ）。当たりは天守台
export function tenshu(world, x, z, o = {}) {
  const rot = o.rot || 0, floors = o.floors || 3, b = o.b || 9, B = kit(), P = Lr(x, z, rot);
  const y0 = world.heightAt(x, z) - 0.4;
  solidRect(x, z, b + 3, b * 0.86 + 3, rot);
  const base = o.base ?? 4;
  stoneBase(B, world, o.stone || 'nozura', x, z, b + 1.4, b * 0.86 + 1.4, rot, base + 0.1);
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
      ktile(B.tile, B.plaster, x, y + fh, z, w + 2.4, d + 2.4, 2.2, rot, 0.6);
      for (const s of [-1, 1]) { const [cx, cz] = P(s * (w / 2 + 0.6), 0); kbox(B.iron, 0x8a7640, cx, y + fh + 2.4, cz, 0.24, 0.7, 0.34, rot); }
    } else {
      ktile(B.tile, B.plaster, x, y + fh - 0.1, z, w + 2.6, d + 2.6, 1.0, rot, (w - d) / 2 + 0.6);
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
