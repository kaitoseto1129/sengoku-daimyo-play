// ======================================================================
// 長篠編　諏訪原城攻め（天正三年八月）
// 大井川を見下ろす台地の山城。本曲輪の正面に丸馬出、そのまわりに三日月堀。
// 足軽大将候補として組二十人を率い、堀の際まで寄せ、馬出の出撃を押し返し、門破りの組を守って大手の枡形（一の門・二の門）を破る。
// 門が破れたら本曲輪へ押し込み、城将・今福浄閑を討つか城兵を崩せば勝ち
// 向き：寄せ手は南（+z）から北（-z）へ攻め上る。東（+x）の崖の下に大井川
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { jinmaku, nobori, hut, yagura, tawara, stumps } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { camp } from './b_mid.js';

// 縄張り（城の形）
const HON = { x0: -30, x1: 30, z0: -88, z1: -34 };   // 本曲輪（南の辺 z1 に大手門）
const GATE = { x: 0, z: HON.z1, w: 6.4 };            // 大手 一の門（高麗門）
const MASU = { hw: 8, zN: -46 };                     // 枡形：一の門の内の四角い囲い（x は ±hw、北の辺が zN）
const GATE2 = { x: 8, z: -40, w: 5 };                // 二の門（櫓門）：枡形の東の辺。一の門から折れ曲がって通る
const MOAT = { z: -29, hw: 3.6 };                    // 本曲輪の前の空堀（z の中心と半幅）
const UMA = { x: 0, z: -19, r: 9.5, span: 1.75 };    // 丸馬出（半円の土塁と柵。span は南から左右へ開く角）
const MIKA = { r0: 11.6, r1: 18.4, span: 1.2 };        // 三日月堀（馬出を囲む弧）
const EDGE = { x: 0, z: 5, r: 7 };                   // 寄せの目当て：三日月堀の際
const TOWERS = [[-25.5, -38.5], [25.5, -38.5]];      // 隅櫓（上に弓・鉄砲）
const DECK = 3.7;                                    // 隅櫓の上の床の高さ
const TIME_LIMIT = 540;                              // 日暮れまで（秒）

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 堀の断面：底が平らで、縁が edge の幅で立ち上がる
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const inHon = (x, z) => Math.abs(x) < HON.x1 && z < HON.z1 - 0.3 && z > HON.z0;
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const inMasu = (x, z) => Math.abs(x) < MASU.hw && z < HON.z1 - 0.3 && z > MASU.zN;
const inUma = (x, z) => Math.hypot(x - UMA.x, z - UMA.z) < UMA.r && z > MOAT.z + MOAT.hw;

// 台地と城の土木（空堀・土塁・丸馬出・三日月堀）
function height(x, z) {
  let h = 0.6 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.07 + x * 0.02);
  // 台地：南の裾から攻め上る
  h += 7 * smooth(58, 6, z);
  h += 4 * gauss(x, z, -110, 60, 2600) + 3 * gauss(x, z, -120, -60, 3000);
  // 東の崖と大井川、北の崖
  if (x > 72) h -= Math.min(24, (x - 72) * 0.95);
  if (z < -104) h -= Math.min(16, (-104 - z) * 0.7);
  // 本曲輪：一段高く、縁に土塁
  const inX = smooth(HON.x1 + 2, HON.x1 - 1, Math.abs(x));
  const inZ = smooth(HON.z1 + 2, HON.z1 - 1, z) * smooth(HON.z0 - 2, HON.z0 + 1, z);
  h += 2.6 * inX * inZ;
  const dEdge = Math.min(segDist(x, z, HON.x0, HON.z1, HON.x1, HON.z1), segDist(x, z, HON.x1, HON.z1, HON.x1, HON.z0),
    segDist(x, z, HON.x1, HON.z0, HON.x0, HON.z0), segDist(x, z, HON.x0, HON.z0, HON.x0, HON.z1));
  if (!(Math.abs(x) < 5 && Math.abs(z - HON.z1) < 3)) h += 1.5 * clamp01(1 - dEdge / 3);
  // 空堀：本曲輪の前（土橋のところだけ残す）と左右
  // 深い箱堀：底は平らで、法面は斜め（堀底まで下りられる）
  const front = trap(Math.abs(z - MOAT.z), MOAT.hw, 2.6) * smooth(39, 35, Math.abs(x)) * smooth(2.6, 5.2, Math.abs(x));
  const side = trap(Math.abs(Math.abs(x) - 35.5), 3.4, 2.4) * smooth(MOAT.z + 2, MOAT.z - 1, z) * smooth(HON.z0 - 6, HON.z0 - 2, z);
  h -= 5 * Math.max(front, side);
  // 丸馬出：半円の内を少し盛り、縁に土塁
  const dr = Math.hypot(x - UMA.x, z - UMA.z);
  const ang = Math.abs(Math.atan2(x - UMA.x, z - UMA.z));
  if (z > MOAT.z + MOAT.hw - 1) h += 0.8 * smooth(UMA.r + 1.5, UMA.r - 1, dr);
  if (ang < UMA.span) h += 1.5 * clamp01(1 - Math.abs(dr - UMA.r) / 2.4);
  // 三日月堀：馬出を囲む弧の形に掘り下げる
  const mid = (MIKA.r0 + MIKA.r1) / 2, hw = (MIKA.r1 - MIKA.r0) / 2;
  h -= 4.6 * trap(Math.abs(dr - mid), hw, 2.6) * clamp01((MIKA.span + 0.12 - ang) / 0.2);
  return h;
}

// ---------------- 城の作り（塀・門・櫓・館・蔵・逆茂木・乱杭）。動かない物は一つの形にまとめて軽くする ----------------
const WALLMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), WALLMAT);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.camBlock = true;
  return m;
}
// 箱を線 (ax,az)-(bx,bz) の向きに置く（out：外向きへずらす量）
function boxAlong(parts, hex, ax, az, bx, bz, w, h, d, y, out = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len * w, h, d);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  g.rotateY(Math.atan2(-(bz - az), bx - ax));
  g.translate((ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out);
  parts.push(paint(g, hex));
}
// 置いた向きの箱（rot は y 軸まわり）
function box(parts, hex, x, y, z, w, h, d, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(rot); g.translate(x, y, z);
  parts.push(paint(g, hex));
}
// 切妻の屋根：棟の向き rot、幅 w（棟に沿う長さ）、奥行 d、軒の高さ y、勾配 pitch
function gable(parts, hex, x, y, z, w, d, rot, pitch = 0.5, th = 0.16) {
  for (const s of [-1, 1]) {
    const half = d / 2 / Math.cos(pitch);
    const g = new THREE.BoxGeometry(w, th, half + 0.3);
    g.rotateX(s * pitch);
    g.translate(0, y + Math.sin(pitch) * half / 2, s * d / 4);
    g.rotateY(rot); g.translate(x, 0, z);
    parts.push(paint(g, hex));
  }
  const ridge = new THREE.BoxGeometry(w + 0.2, 0.2, 0.3);
  ridge.translate(0, y + Math.tan(pitch) * d / 2 + 0.05, 0);
  ridge.rotateY(rot); ridge.translate(x, 0, z);
  parts.push(paint(ridge, 0x2a2828));
}

// 土塀：石の腰、白い漆喰、瓦の屋根。外向きに狭間（丸・三角・四角の撃つ穴）
function dobeiParts(parts, world, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
    const y = world.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
    const tone = [0xd8d1c0, 0xd2cab8, 0xdcd6c6][i % 3];
    boxAlong(parts, 0x5e5a52, x0, z0, x1, z1, 1.02, 1.0, 0.55, y + 0.05);      // 腰の石垣
    boxAlong(parts, tone, x0, z0, x1, z1, 1.02, 1.9, 0.34, y + 1.45);          // 漆喰の壁
    boxAlong(parts, 0x2f2c28, x0, z0, x1, z1, 1.02, 0.08, 0.36, y + 2.42);     // 長押の黒い筋
    boxAlong(parts, 0x3b3a3a, x0, z0, x1, z1, 1.04, 0.14, 1.05, y + 2.52);     // 瓦
    boxAlong(parts, 0x2e2d2d, x0, z0, x1, z1, 1.04, 0.16, 0.26, y + 2.64);     // 棟
    // 狭間：外の面に、低い鉄砲狭間と高い矢狭間を交互に
    boxAlong(parts, 0x161412, x0, z0, x1, z1, 0.14, i % 2 ? 0.34 : 0.18, 0.05, y + (i % 2 ? 1.75 : 1.2), 0.18);
  }
}

// 一の門（高麗門）の屋根と控え柱
function koraimon(parts, world, x, z, w) {
  const y = world.heightAt(x, z);
  for (const sx of [-1, 1]) {
    box(parts, 0x4e3a28, x + sx * (w / 2 + 0.1), y + 1.9, z, 0.42, 3.8, 0.42);
    box(parts, 0x4e3a28, x + sx * (w / 2 + 0.1), y + 1.3, z - 2.2, 0.26, 2.6, 0.26);   // 控え柱
    box(parts, 0x3b3a3a, x + sx * (w / 2 + 0.1), y + 2.75, z - 1.1, 1.0, 0.12, 2.6);    // 控え柱の小屋根
  }
  box(parts, 0x3f2e20, x, y + 3.65, z, w + 1.6, 0.36, 0.4);          // 冠木
  gable(parts, 0x3b3a3a, x, y + 3.95, z, w + 2.6, 1.9, 0, 0.45);      // 本屋根
}
// 門の扉と閂（破れると消える）。seg に沿って二枚
function doorMesh(world, seg) {
  const parts = [];
  const [ax, az, bx, bz] = seg;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const y = world.heightAt(mx, mz);
  for (const [t0, t1, c] of [[0.02, 0.49, 0x4a3a2a], [0.51, 0.98, 0x46372a]]) {
    const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
    boxAlong(parts, c, x0, z0, x1, z1, 1, 3.1, 0.16, y + 1.6);
    for (const yy of [0.5, 1.6, 2.7]) boxAlong(parts, 0x2a2622, x0, z0, x1, z1, 0.96, 0.12, 0.22, y + yy);
    for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; boxAlong(parts, 0x1c1a18, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, x0 + (x1 - x0) * t + 0.01, z0 + (z1 - z0) * t, 12, 0.12, 0.24, y + 1.0); }
  }
  boxAlong(parts, 0x3a2a1c, ax, az, bx, bz, 0.9, 0.26, 0.3, y + 1.55, -0.28);   // 閂
  return mesh(parts);
}
// 二の門（櫓門）：門の上に白壁の櫓を渡す。seg は門の口
function yaguramon(parts, world, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len, uz = (bz - az) / len;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const y = world.heightAt(mx, mz);
  const rot = Math.atan2(-uz, ux);
  for (const s of [-1, 1]) {
    const px = mx + ux * s * (len / 2 + 0.2), pz = mz + uz * s * (len / 2 + 0.2);
    box(parts, 0x4e3a28, px, y + 1.9, pz, 0.5, 3.8, 0.5, rot);
  }
  const L = len + 3.2;
  // 門の両脇：櫓を支える白壁（塀より一段厚い）
  for (const sd of [-1, 1]) {
    const ex = mx + ux * sd * (len / 2 + 0.95), ez = mz + uz * sd * (len / 2 + 0.95);
    box(parts, 0x5e5a52, ex, y + 0.45, ez, 1.5, 0.9, 3.0, rot);
    box(parts, 0xd6cfbe, ex, y + 2.3, ez, 1.4, 2.9, 2.8, rot);
  }
  box(parts, 0x3a2a1c, mx, y + 3.9, mz, L, 0.3, 3.2, rot);                   // 床
  box(parts, 0xd6cfbe, mx, y + 5.0, mz, L - 0.2, 1.9, 2.8, rot);             // 白壁の櫓
  box(parts, 0x2f2c28, mx, y + 5.95, mz, L, 0.1, 2.9, rot);
  for (let k = -1; k <= 1; k++) box(parts, 0x161412, mx + ux * k * 2, y + 5.1, mz + uz * k * 2, 0.9, 0.5, 2.86, rot);   // 窓
  gable(parts, 0x3b3a3a, mx, y + 6.0, mz, L + 1.2, 3.8, rot, 0.5);
}
// 隅櫓：石の台に白壁の一階、上は射手の立つ見晴らしの床と屋根
function sumiyagura(parts, world, x, z) {
  const y = world.heightAt(x, z);
  box(parts, 0x5e5a52, x, y + 0.3, z, 5.6, 1.2, 5.6);
  box(parts, 0xd6cfbe, x, y + 2.1, z, 4.8, 2.6, 4.8);
  for (const r of [0, Math.PI / 2]) for (const s of [-1, 1]) box(parts, 0x161412, x + Math.sin(r) * s * 2.42, y + 2.3, z + Math.cos(r) * s * 2.42, 0.7, 0.45, 0.05, r);
  box(parts, 0x3b3a3a, x, y + 3.45, z, 5.6, 0.12, 5.6);                       // 一階の庇
  box(parts, 0x5a4430, x, y + DECK - 0.08, z, 4.9, 0.16, 4.9);               // 上の床
  for (const [dx, dz, w, d] of [[0, -2.4, 4.9, 0.08], [0, 2.4, 4.9, 0.08], [-2.4, 0, 0.08, 4.9], [2.4, 0, 0.08, 4.9]]) box(parts, 0x6b5238, x + dx, y + DECK + 0.45, z + dz, w, 0.8, d);
  for (const dx of [-2.3, 2.3]) for (const dz of [-2.3, 2.3]) box(parts, 0x4e3a28, x + dx, y + DECK + 1.2, z + dz, 0.18, 2.4, 0.18);
  const roof = new THREE.ConeGeometry(4.3, 1.7, 4); roof.rotateY(Math.PI / 4); roof.translate(x, y + DECK + 3.1, z); parts.push(paint(roof, 0x3b3a3a));
}
// 城将の館（板葺き）：縁側と格子の窓
function yakata(parts, world, x, z, w, d) {
  const y = world.heightAt(x, z);
  box(parts, 0x4a3a2a, x, y + 0.35, z, w + 1.6, 0.7, d + 1.6);                // 縁側
  box(parts, 0x3e3024, x, y + 1.9, z, w, 2.4, d);                              // 板壁
  for (let k = -2; k <= 2; k++) box(parts, 0xcfc6b2, x + k * w / 5.5, y + 2.0, z + d / 2 + 0.03, w / 8, 1.3, 0.04);   // 障子
  gable(parts, 0x5a4a38, x, y + 3.1, z, w + 1.8, d + 2.4, 0, 0.42, 0.2);      // 板葺きの屋根
  for (let k = -3; k <= 3; k++) box(parts, 0x3a3026, x + k * (w + 1.8) / 7, y + 3.45, z + (d + 2.4) / 4, 0.1, 0.12, (d + 2.4) / 2 + 0.4, 0);   // 押さえの桟
}
// 兵糧の蔵（土蔵）：白壁に瓦
function kura(parts, world, x, z, w, d, rot = 0) {
  const y = world.heightAt(x, z);
  box(parts, 0x5e5a52, x, y + 0.35, z, w + 0.3, 0.7, d + 0.3, rot);
  box(parts, 0xdcd5c4, x, y + 2.0, z, w, 2.8, d, rot);
  box(parts, 0x2f2c28, x + Math.sin(rot) * (d / 2 + 0.03), y + 1.4, z + Math.cos(rot) * (d / 2 + 0.03), 1.3, 1.9, 0.06, rot);   // 扉
  gable(parts, 0x3b3a3a, x, y + 3.35, z, w + 0.8, d + 1.2, rot, 0.5);
}
// 逆茂木：枝を払った木を、先を外へ向けて寝かせ並べる
function sakamogi(parts, world, x, z, out) {
  const y = world.heightAt(x, z);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.CylinderGeometry(0.05, 0.1, 2.2 + (i % 3) * 0.3, 5);
    g.rotateX(Math.PI / 2 - 0.45 - (i % 2) * 0.15);
    g.rotateY(out + (i - 2) * 0.28);
    g.translate(x + Math.sin(out) * 0.6 + (i - 2) * 0.35 * Math.cos(out), y + 0.45, z + Math.cos(out) * 0.6 - (i - 2) * 0.35 * Math.sin(out));
    parts.push(paint(g, [0x5a4632, 0x4e3c2a, 0x66523a][i % 3]));
  }
  const b = new THREE.CylinderGeometry(0.1, 0.1, 2.2, 5); b.rotateZ(Math.PI / 2); b.rotateY(out + Math.PI / 2); b.translate(x, y + 0.15, z); parts.push(paint(b, 0x4a3a28));
}
// 乱杭：先を尖らせた杭を不揃いに打ち込む
function rankui(parts, world, x, z, k) {
  const y = world.heightAt(x, z);
  const h = 1.1 + ((k * 37) % 7) * 0.1;
  const g = new THREE.CylinderGeometry(0.02, 0.09, h, 5);
  g.rotateX(((k * 13) % 9 - 4) * 0.07); g.rotateZ(((k * 29) % 9 - 4) * 0.07);
  g.translate(x, y + h / 2 - 0.15, z);
  parts.push(paint(g, [0x6b5238, 0x5a4430, 0x7a5c40][k % 3]));
}
// 竹束：竹を束ねて立てた盾（鉄砲・矢を防ぐ）
function takeTaba(parts, world, x, z, rot) {
  const y = world.heightAt(x, z);
  const put = (g, hex) => { g.rotateY(rot); g.translate(x, y, z); parts.push(paint(g, hex)); };
  for (let i = 0; i < 9; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
    g.rotateX(-0.22); g.translate((i - 4) * 0.15, 1.0, (i % 2) * 0.05);
    put(g, [0x7c7a48, 0x6e6c3e, 0x86804e][i % 3]);
  }
  for (const yy of [0.5, 1.4]) { const b = new THREE.BoxGeometry(1.45, 0.06, 0.08); b.translate(0, yy, -0.15 + yy * 0.2); put(b, 0x5a4a32); }
  const s = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5); s.rotateX(0.7); s.translate(0, 0.7, 0.55); put(s, 0x5a4a32);
}

// ---------------- 道すじ ----------------
// 城のまわりは塀と柵で塞がれているので、馬出の脇の口 → 馬出の中 → 土橋 → 一の門 → 枡形 → 二の門 の順に通す
function route(rt, x, z, final) {
  const F = rt.flags;
  // 枡形の内：二の門へ。破れていれば二の門をくぐって東へ出る
  if (inMasu(x, z)) return F.gate2.alive ? F.gate2 : { x: GATE2.x + 5, z: GATE2.z };
  if (inHon(x, z)) {
    // 枡形の脇にいるときは、枡形の角を回ってから目当てへ
    if (Math.abs(x) >= MASU.hw - 0.5 && z > MASU.zN - 2.5 && Math.abs(final.x) < MASU.hw + 3) return { x: Math.sign(x) * (MASU.hw + 4), z: MASU.zN - 5 };
    return final;
  }
  // 土橋：一の門へ。破れていれば枡形へ
  if (Math.abs(x) < 5 && z < MOAT.z + MOAT.hw + 0.5 && z > HON.z1 - 1) return F.gate.alive ? F.gate : { x: 0, z: HON.z1 - 6 };
  if (inUma(x, z)) return { x: 0, z: MOAT.z + 1 };
  const s = Math.sign(x) || 1;
  // 馬出の脇（北の半分）：口の外 → 口をくぐって中へ
  if (z < UMA.z + 1) {
    if (Math.abs(x) > UMA.r - 0.5 && z > -22.5) return { x: s * Math.max(Math.abs(x), 12.5), z: -24 };
    return { x: s * 3, z: -24 };
  }
  // 馬出の前に張り付いていたら、弧に沿って脇へ回る
  if (Math.hypot(x - UMA.x, z - UMA.z) < 13.5) return { x: s * 14, z: -12 };
  return { x: s * 17, z: -23 };
}
// いま破っている門（一の門 → 二の門）と、その残りの割合
const curGate = (F) => (F.gate.alive ? F.gate : F.gate2);
const gatePct = (F) => { const g = curGate(F); return Math.round(Math.max(0, g.hp) / g.maxHp * 100); };
const gateName = (F) => (F.gate.alive ? '一の門' : '二の門（櫓門）');
// 門の前で立つ所（門の外向きへ少し離れる）
const gateFront = (g, d = 1.8) => ({ x: (g.seg[0] + g.seg[2]) / 2 + g.nx * d, z: (g.seg[1] + g.seg[3]) / 2 + g.nz * d });
const ramCount = (F) => F.rams.reduce((a, g) => a + g.count, 0);
const gone = (g) => !g || g.count === 0 || g.routed;

const suwahara = {
  spawn: { x: 4, z: 56, heading: Math.PI },
  world: {
    seed: 75,
    time: 'day',
    water: { x: 112, level: -12 },
    paths: [[[-6, 176], [-2, 130], [2, 90], [4, 62], [2, 30]]],
    height,
    tint(x, z, h, c) {
      // 堀と土塁、城の中は土が出ている
      const dr = Math.hypot(x - UMA.x, z - UMA.z);
      const earth = inHon(x, z) || dr < MIKA.r1 + 1.5 || (Math.abs(z - MOAT.z) < MOAT.hw + 1.5 && Math.abs(x) < 38) || (Math.abs(Math.abs(x) - 35) < 4 && z < MOAT.z && z > HON.z0 - 4);
      if (earth) c.setRGB(c.r * 0.55 + 0.17, c.g * 0.5 + 0.13, c.b * 0.45 + 0.08);
      // 堀の底は湿って黒ずむ（台地の高さより低い所）
      const low = 7 * smooth(58, 6, z) - h;
      if (earth && low > 1) { const k = Math.min(1, (low - 1) / 1.8); c.setRGB(c.r * (1 - 0.4 * k), c.g * (1 - 0.38 * k), c.b * (1 - 0.3 * k)); }
      // 寄せ手の踏み荒らした坂
      if (Math.abs(x) < 40 && z > -2 && z < 60) c.setRGB(c.r * 0.85 + 0.05, c.g * 0.85 + 0.04, c.b * 0.8 + 0.02);
      // 崖の岩肌
      if (x > 78 || z < -110) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.7 + 0.09, c.b * 0.7 + 0.08);
    },
    clear: (x, z) => (Math.abs(x) < 68 && z > -96 && z < 96) || Math.hypot(x - 108, z - 118) < 34,   // 後は東の村
    trees: 320,
    tufts: 3800,
    treeDensity: (x, z) => (z < -100 || x < -80 ? 1 : 0.4),
    groves: [{ x: -110, z: -40, r: 16, n: 26 }, { x: -95, z: 70, r: 14, n: 20 }, { x: 40, z: -120, r: 14, n: 18 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0;

    // ---- 城：本曲輪の土塀と枡形（team 1。プレイヤーの側からは壊せない）----
    const none = () => new THREE.Group();   // 形はあとで一つにまとめる
    const wallOpt = { team: 1, hp: 1e9, name: '塀', mesh: none, segLen: 5 };
    const G1 = GATE.w / 2, G2 = GATE2.w / 2;
    F.walls = [
      ...wallLine(rt, [[HON.x0, HON.z1], [GATE.x - G1, HON.z1]], wallOpt),
      ...wallLine(rt, [[GATE.x + G1, HON.z1], [HON.x1, HON.z1]], wallOpt),
      ...wallLine(rt, [[HON.x1, HON.z1], [HON.x1, HON.z0], [HON.x0, HON.z0], [HON.x0, HON.z1]], wallOpt),
      // 枡形：一の門をくぐると四角い囲い。二の門は東の辺にあり、右へ折れて通る
      ...wallLine(rt, [[-MASU.hw, HON.z1], [-MASU.hw, MASU.zN], [MASU.hw, MASU.zN], [MASU.hw, GATE2.z - G2]], wallOpt),
      ...wallLine(rt, [[MASU.hw, GATE2.z + G2], [MASU.hw, HON.z1]], wallOpt),
    ];
    F.gate = rt.army.addStruct({ seg: [GATE.x - G1, GATE.z, GATE.x + G1, GATE.z], nx: 0, nz: 1, hp: 1300, maxHp: 1300, armor: 0.2, team: 1, name: '一の門' });
    F.gate2 = rt.army.addStruct({ seg: [GATE2.x, GATE2.z - G2, GATE2.x, GATE2.z + G2], nx: -1, nz: 0, hp: 900, maxHp: 900, armor: 0.2, team: 1, name: '二の門' });
    for (const g of [F.gate, F.gate2]) { g.mesh = doorMesh(W, g.seg); rt.scene.add(g.mesh); }
    // 丸馬出：半円の土塁の上に柵（脇に口が二つ。北は土橋へ抜ける）
    const arc = [];
    for (let i = 0; i <= 14; i++) {
      const a = -UMA.span + (2 * UMA.span * i) / 14;
      arc.push([UMA.x + Math.sin(a) * UMA.r, UMA.z + Math.cos(a) * UMA.r]);
    }
    F.uma = wallLine(rt, arc, { team: 1, hp: 1e9, name: '馬出の柵', segLen: 3 });
    const pal = F.uma.map((s) => s.mesh);
    const palM = new THREE.Mesh(mergeGeometries(pal.map((m) => m.geometry)), pal[0].material);
    palM.castShadow = true; palM.receiveShadow = true; palM.userData.camBlock = true;
    for (const s of F.uma) { rt.scene.remove(s.mesh); s.mesh = null; }
    rt.scene.add(palM);

    // 動かない城の形はまとめて数個の形にする（塀は十区画ずつ、門・櫓・館・蔵は一つずつ。カメラの当たりも軽く）
    const one = (fn) => { const pp = []; fn(pp); rt.scene.add(mesh(pp)); };
    for (let i = 0; i < F.walls.length; i += 10) one((pp) => { for (const s of F.walls.slice(i, i + 10)) dobeiParts(pp, W, s.seg); });
    one((pp) => koraimon(pp, W, GATE.x, GATE.z, GATE.w));
    one((pp) => yaguramon(pp, W, F.gate2.seg));
    for (const [x, z] of TOWERS) one((pp) => sumiyagura(pp, W, x, z));
    one((pp) => yakata(pp, W, -12, -64, 13, 7));
    one((pp) => { kura(pp, W, 18, -57, 6, 4.5); kura(pp, W, 20, -68, 5, 4, Math.PI / 2); });
    // 小さな物（逆茂木・乱杭・竹束）は一つにまとめ、カメラの当たりにはしない
    const P = [];
    // 逆茂木：馬出の柵の外と、空堀の外の縁
    for (let a = -1.55; a <= 1.56; a += 0.2) sakamogi(P, W, UMA.x + Math.sin(a) * 11, UMA.z + Math.cos(a) * 11, a);
    for (const s of [-1, 1]) for (let x = 17; x <= 33; x += 3.2) sakamogi(P, W, s * x, MOAT.z + MOAT.hw + 1.4, 0);
    // 乱杭：三日月堀と空堀の底
    for (let k = 0; k < 46; k++) {
      const a = -1.12 + (2.24 * k) / 45 + Math.sin(k * 7.1) * 0.03, r = (MIKA.r0 + MIKA.r1) / 2 + ((k * 5) % 3 - 1) * 1.3;
      rankui(P, W, UMA.x + Math.sin(a) * r, UMA.z + Math.cos(a) * r, k);
    }
    for (let k = 0; k < 36; k++) { const x = (k < 18 ? -1 : 1) * (7 + (k % 18) * 1.55); rankui(P, W, x, MOAT.z + ((k * 7) % 5 - 2) * 0.5, k + 50); }
    // 竹束：寄せ手が堀の手前に並べた盾
    for (let x = -26; x <= 26; x += 4.5) if (Math.abs(x) > 3) takeTaba(P, W, x + Math.sin(x) * 0.6, 10 + Math.cos(x * 0.7) * 1.2, Math.PI + Math.sin(x) * 0.12);
    const small = mesh(P);
    small.userData.camBlock = false;
    rt.scene.add(small);
    // 物見櫓と足軽小屋・兵糧の俵
    rt.scene.add(yagura(W, -22, -80), yagura(W, 22, -82));
    rt.scene.add(hut(W, -2, -78, 8, 4.5, 0));
    rt.scene.add(tawara(W, 14, -61, 0.3, 6), tawara(W, 23, -61, -0.2, 4));
    // 武田の旗と幟
    for (const [x, z, k] of [[-22, -37, 'takeda'], [-14, -37, 'furin'], [14, -37, 'takeda'], [22, -37, 'furin'], [-5, -13, 'takeda'], [5, -13, 'takeda'],
      [-6, -44, 'takeda'], [6, -44, 'furin'], [-18, -59, 'furin'], [-6, -59, 'takeda'], [10, -74, 'takeda']]) rt.scene.add(nobori(W, x, z, k, 5.5));

    // ---- 寄せ手の陣：大久保の陣幕と、殿（家康）の本陣 ----
    rt.scene.add(jinmaku(W, -30, 62, 14, 10, 5));
    // 家康の本陣：見に行けば家康と旗本がいる（後ろの控えは下の DA(0, 152) の軽い兵）
    F.hqCamp = camp(rt, { x: 0, z: 128, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f, general: { name: '徳川家康' }, guard: 15, reserve: 0, runTo: { x: -8, z: 60 } });
    for (const [x, z, k, h] of [[-25, 56, 'okubo', 6], [-35, 56, 'okubo', 6], [-12, 117, 'onri', 7], [12, 117, 'tokugawa', 6.5], [-18, 44, 'tokugawa', 5], [16, 44, 'tokugawa', 5], [30, 40, 'katabami', 5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 遠景の村（東の茶畑の下の在所）
    KIT.farVillage(rt, 104, 118, { rot: Math.PI / 2, n: 5, fields: 6, seed: 14, autumn: true });

    // ---- 大軍：城を囲む徳川勢と、城に籠もる武田勢（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const TK = 0x24221f;
    F.mainDA = DA(0, 88, 70, 18, 320, Math.PI, TK, 'tokugawa', 81, 'mixed');
    DA(0, 152, 60, 16, 240, Math.PI, TK, 'onri', 82, 'spear');
    F.sideDA = [DA(-56, 34, 22, 30, 220, 2.44, TK, 'okubo', 83, 'spear'), DA(54, 32, 22, 30, 220, -2.44, TK, 'katabami', 84, 'spear')];
    DA(-64, -40, 16, 44, 220, Math.PI / 2, TK, 'tokugawa', 85, 'spear');
    DA(-52, -104, 30, 14, 160, 0.9, TK, 'tokugawa', 86, 'mixed');
    DA(58, -40, 12, 36, 150, -Math.PI / 2, TK, 'tokugawa', 87, 'spear');
    // 西の台地の果てに、高天神の方から来た武田の騎馬の塊が見える（軽い作り。kaito 0929）
    DA(-128, -64, 44, 22, 260, Math.PI / 2, 0x3a2622, 'takeda', 88, 'cavalry');
    DA(-136, -10, 30, 18, 180, Math.PI / 2, 0x8e1f16, 'akazonae', 89, 'cavalry');
    // 本曲輪の奥に詰める城兵
    F.garDA = DA(0, -81, 44, 8, 140, 0, 0x3a2622, 'takeda', 88, 'spear');

    // ---- 味方 ----
    const n = RANKS[rt.G.rank].squad;
    if (n) {
      const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
      rt.makeSquad({ x: 4, z: 61 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    }
    const ok = allyGroup(rt, { faction: 'tokugawa', name: '大久保組', anchor: { x: -8, z: 52 }, facing: Math.PI, width: 8, aggro: 9, noRout: true },
      [{ type: 'samurai', n: 1, o: { name: '大久保忠世', invuln: true, horse: true } }, { type: 'ashigaru', n: 16 }]);
    F.okubo = ok.units[0];
    F.okuboG = ok;
    F.left = allyGroup(rt, { faction: 'tokugawa', name: '先手・左', anchor: { x: -24, z: 48 }, facing: Math.PI, width: 8, aggro: 8, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }, { type: 'gun', n: 2 }]);
    F.right = allyGroup(rt, { faction: 'tokugawa', name: '先手・右', anchor: { x: 22, z: 48 }, facing: Math.PI, width: 8, aggro: 8, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 6 }]);
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '門破りの組', anchor: { x: -14, z: 42 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      [{ type: 'samurai', n: 1, o: { name: '門破りの頭 本多作左' } }, { type: 'ashigaru', n: 14, o: { hat: 'jingasa_n' } }]);

    // ---- 城兵（武田） ----
    // 丸馬出の守り：柵の内から鉄砲・弓
    F.umaG = enemyGroup(rt, { faction: 'takeda', name: '馬出の守り', anchor: { x: 0, z: -14.5 }, facing: 0, width: 7, aggro: 5, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 3 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 9 }]);
    // 枡形の奥の塀の内：弓と鉄砲（一の門を破って枡形に入った者を上から撃つ）
    F.wallG = enemyGroup(rt, { faction: 'takeda', name: '大手の守り', anchor: { x: 0, z: MASU.zN - 5 }, facing: 0, width: 12, aggro: 0, noRout: true },
      [{ type: 'gun', n: 2 }, { type: 'bow', n: 5 }]);
    // 櫓の上の射手（足を止め、櫓の床の高さに立たせる）
    F.towerU = [];
    TOWERS.forEach(([x, z], i) => {
      const g = enemyGroup(rt, { faction: 'takeda', name: '櫓', anchor: { x, z }, facing: 0, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        [{ type: i ? 'gun' : 'bow', n: 2 }, { type: 'bow', n: 2 }]);
      g.units.forEach((u, k) => {
        u.pos.x = x + (k % 2 ? 0.55 : -0.55); u.pos.z = z + (k < 2 ? 0.55 : -0.55);
        u.speed = u.run = 0; u.tower = { x, z };
        F.towerU.push(u);
      });
    });
    // 城からの鉄砲・矢は、当たれば痛いが一発では倒れない強さに
    for (const g of [F.umaG, F.wallG, ...TOWERS.map((_, i) => F.towerU[i * 4].group)]) {
      g.dmgMult = 0.42;
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.38;
    }
    // 本曲輪：城将・今福浄閑と城兵（門が破れるまでは奥に控え、塀越しの矢の届かない所にいる）
    F.hon = enemyGroup(rt, { faction: 'takeda', name: '本曲輪の城兵', anchor: { x: 2, z: -70 }, facing: 0, width: 9, aggro: 3, fleeDir: { x: 0.3, z: -1 } },
      [{ type: 'busho', n: 1, o: { name: '今福浄閑' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }]);
    F.jokan = F.hon.units[0];
    // 名乗りと討ち取りは門が破れてから（塀越しに討たれないように）
    F.jokan.announced = true; F.jokan.invuln = true;

    rt.setPhase('brief');
    rt.obj('main', '諏訪原城を落とせ', 'main');
    rt.obj('loose', '組を散開させて堀へ寄せよ', 'side');
    rt.say('大久保忠世', `${nm(rt)}、あれが諏訪原の城じゃ。大井川を見下ろす台地の端に建っておる`, 4.5);
    rt.say('大久保忠世', '正面の丸い土塁が丸馬出、そのまわりの弧の堀が三日月堀。寄せ手を馬出から横ざまに突く、武田の縄張りよ', 5.5);
    rt.say('大久保忠世', 'その方の組は先手じゃ。堀の際まで寄せ、門破りの者どもを大手門へ通す', 4.5);
    rt.say('大久保忠世', '馬出の兵は左右の脇の口からしか出られぬ。出てきた所を撃って押し返せば、その隙に門へ寄れる', 5);
    rt.after(17, () => this.approach(rt));
  },

  // ① 三日月堀の際まで寄せる
  approach(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('approach');
    sfx('taiko', 1);
    rt.banner('寄せよ', '三日月堀の際まで');
    rt.obj('main', '組を率いて三日月堀の際まで寄せよ', 'main');
    rt.say('大久保忠世', '寄せよ！　城の鉄砲と矢が来る。固まって歩けば的になるぞ', 4);
    rt.say('大久保忠世', '組を散らせ。散開すれば鉄砲も矢も当たりにくい', 4);
    rt.say('', '散開：Tab → 9（陣形）を押すたびに、横陣→縦陣→散開と変わる。散開した組には、鉄砲も矢も当たりにくい', 7);
    rt.zone('edge', EDGE.x, EDGE.z, EDGE.r);
    rt.marker('edge', { x: EDGE.x, z: EDGE.z }, '三日月堀の際', { h: 2.5 });
    // 味方の先手も堀の手前まで出る
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.facing = Math.PI; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 8; }; };
    go(F.okuboG, -9, 8); go(F.left, -24, 6); go(F.right, 22, 6); go(F.ram, -15, 17);
    // 後ろの大勢も、堀へ向かって押し出す
    F.mainDA.advance(18, 16);
  },

  // ② 丸馬出から打って出る
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('sortie');
    rt.unzone('edge'); rt.unmark('edge');
    rt.award((t) => t.side.push('堀の際まで寄せた'), '堀の際まで寄せた');
    rt.say('大久保忠世', 'よし、ここで踏みとどまれ！　……むっ、馬出の脇の口が開いたぞ', 3.5);
    rt.after(3, () => {
      F.sorties = [-1, 1].map((s) => {
        const g = enemyGroup(rt, { faction: 'takeda', name: '馬出の出撃', anchor: { x: s * 4.5, z: -23.5 }, facing: s * Math.PI / 2, width: 5, aggro: 10, morale: 90, fleeDir: { x: s, z: 0.15 } },
          [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]);
        g.order = 'move'; g.dest = { x: s * 17, z: -23.5 }; g.speed = 3.4; g.dmgMult = 0.8;
        g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 45; };
        KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 8, depth: 8, count: 50, gap: 3, seed: 91 + s });
        return g;
      });
      sfx('taiko', 1);
      rt.army.play('eshout', { x: 0, z: -18 }, 2);
      rt.banner('丸馬出より打って出る', '左右の脇の口から');
      rt.say('足軽', '馬出から出てきたぞ！　左右から回り込んでくる！', 3);
      rt.say('大久保忠世', '受け止めよ！　槍を揃えて押し返せ！', 3);
      rt.obj('main', '丸馬出の出撃を受け止め、押し返せ', 'main');
      rt.obj('sortie', '打って出た敵を崩せ', 'side');
      F.sorties.forEach((g, i) => rt.marker('so' + i, centerOf(g), () => `打って出た敵・${moraleWord(g.morale)}`, { red: true, group: g }));
      // 一斉射：脇の口から出て横に回る所を、先手の鉄砲が揃えて撃つ（勝ち筋：出てきた所が一番脆い）
      rt.after(3.5, () => volley(rt, [F.left, F.right], { who: '大久保忠世', waitLine: '脇の口から出た所を狙え。まだ撃つな……', wait: 2.2, line: '先手の鉄砲、放てぇっ！', banner: ['一斉射', '先手の鉄砲が、馬出から出た敵へ揃えて放つ'], r: 60, hit: 26 }));
    });
  },

  // ③ 門破り
  breach(rt, pushedBack) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('breach');
    rt.unmark('so0'); rt.unmark('so1');
    if (pushedBack) {
      rt.objDone('sortie');
      rt.award((t) => t.side.push('馬出の出撃を押し返した'), '副任務：馬出の出撃を押し返した');
    } else rt.objFail('sortie');
    sfx('horagai', 0.9);
    rt.banner('門を破れ', '門破りの組、大手の一の門へ');
    for (const m of F.sideDA) m.advance(14, 9, { charge: true });
    rt.say('大久保忠世', pushedBack ? 'ようやった！　敵は馬出へ逃げ込んだ。今じゃ、門破りを通せ！' : '構うな、今のうちに門破りを通すぞ！', 4);
    rt.say('大久保忠世', `${nm(rt)}、門破りの者どもを守れ。馬出の脇の口から入り、土橋を渡って一の門。その奥の枡形で右へ折れて二の門じゃ`, 6);
    rt.obj('main', '門破りの組を守り、大手の門（一の門・二の門）を破れ', 'main');
    rt.obj('guard', '門破りの組を半分より多く生かして、門を破れ', 'side');
    F.rams = [F.ram];
    F.ramN0 = F.ram.count;
    // 門破りの組は道すじに沿って門へ。大久保組は馬出へ斬り込み、中の城兵を抑える
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 3;
    R.assault = (u) => route(rt, u.pos.x, u.pos.z, { x: 0, z: -40 });
    F.okuboG.order = 'assault'; F.okuboG.aggro = 7;
    F.okuboG.assault = (u) => (inUma(u.pos.x, u.pos.z) ? { x: 0, z: -16 } : route(rt, u.pos.x, u.pos.z, { x: 0, z: -44 }));
    for (const g of [F.okuboG, R]) for (const u of g.units) u.aiT = 0;
    rt.marker('ram', () => (R.count ? R.center() : F.rams[F.rams.length - 1].center()), () => `門破りの組（${ramCount(F)}人）`);
    rt.marker('gate', () => gateFront(curGate(F), 0), () => `${gateName(F)} ${gatePct(F)}%`, { h: 4.5 });
    F.ramNextT = 0; F.ramWaves = 0;
    // その方の弓組の役目：隅櫓の射手を射落とす（黙らせれば門破りがはかどる）
    rt.obj('towers', '弓組で隅櫓の射手を射落とせ（黙らせれば門破りが早まる）', 'side');
    TOWERS.forEach(([x, z], i) => rt.marker('tw' + i, { x, z, y: rt.world.heightAt(x, z) + DECK + 1 }, () => `隅櫓の射手 ${F.towerU.filter((u) => u.alive && u.tower.x === x).length}人`, { red: true, h: 2 }));
    rt.after(6, () => {
      rt.say('大久保忠世', '隅櫓の弓と鉄砲が、門破りの者を上から狙うておる。その方の弓組で射落とせ！', 4.5);
      rt.say('', '弓組だけに号令：Tab → G で「弓隊」を選び、照準を櫓の射手に合わせて Tab → 5（敵を狙え）', 7);
    });
    // 門にかかったころ、搦手から城兵が回り込んで門破りを狙う
    rt.after(28, () => this.flankers(rt));
  },

  // 搦手から城兵が堀沿いに回り込み、門破りを狙う（一度目は西、二度目は東）
  flankers(rt, east) {
    const F = rt.flags;
    if (F.step !== 3) return;
    const s = east ? 1 : -1;
    const g = enemyGroup(rt, { faction: 'takeda', name: '搦手の城兵', anchor: { x: s * 46, z: -25 }, facing: -s * Math.PI / 2, width: 4, aggro: 8, order: 'attack', seekRange: 60, fleeDir: { x: s, z: 0.2 } },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: east ? 11 : 9 }]);
    g.focus = F.rams.flatMap((r) => r.units).find((u) => u.alive) || null;
    // 回り込む城兵の後ろに、同じ旗の控えが堀沿いに続く（軽い作り。数人ずつに見せない）
    KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 8, depth: 10, count: 60, gap: 3, seed: 95 + (east ? 1 : 0) });
    F.flanks = [...(F.flanks || []), g];
    F.flank = g;
    rt.banner('搦手より城兵', `${east ? '東' : '西'}の堀沿いから門破りを狙う`);
    rt.say('足軽', `${east ? '東' : '西'}の堀沿いから城兵が回り込んでくる！　門破りの者が危ない！`, 3.5);
    rt.marker('flank', centerOf(g), () => `搦手の城兵・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ④ 本曲輪へ
  storm(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('storm');
    rt.unmark('gate'); rt.unmark('ram');
    if (F.ram.count > F.ramN0 / 2) { rt.objDone('guard'); rt.award((t) => t.side.push('門破りの組を守った'), '副任務：門破りの組を守った'); } else rt.objFail('guard');
    sfx('horagai', 1);
    rt.banner('二の門、破れる', '本曲輪へ押し込め');
    rt.say('足軽', '二の門が破れたぞーっ！', 2.5);
    rt.say('大久保忠世', '押し込め！　城将の今福浄閑を探せ。討てば城は落ちる！', 4);
    rt.obj('main', '本曲輪へ押し込み、城将・今福浄閑を討て（城兵を崩しても勝ち）', 'main');
    rt.obj('jokan', '今福浄閑を自ら（組で）討ち取れ', 'side');
    const target = () => (F.jokan.alive ? { x: F.jokan.pos.x, z: F.jokan.pos.z } : F.hon.center());
    for (const g of [F.okuboG, F.left, F.right, ...F.rams]) {
      g.order = 'assault'; g.aggro = 9; g.noRout = true;
      g.assault = (u) => route(rt, u.pos.x, u.pos.z, target());
      for (const u of g.units) u.aiT = 0;
    }
    F.hon.aggro = 18;
    F.hon.anchor = { x: 0, z: -52 };
    F.jokan.announced = false; F.jokan.invuln = false;
    rt.marker('jokan', unitPos(F.jokan), '城将・今福浄閑', { red: true });
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('jokan');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '諏訪原城を落とした');
    if (!F.jokanByUs) rt.objFail('jokan');
    if (!F.towersDone) rt.objFail('towers');
    for (const g of [F.hon, F.umaG, F.wallG, ...(F.flanks || []), ...(F.sorties || [])]) if (g && g.count) { g.noRout = false; g.morale = 0; }
    sfx('horagai', 0.9);
    rt.banner('諏訪原城、落つ', how);
    F.garDA.rout({ hideAfter: 40 });
    rt.say('大久保忠世', `城が落ちたぞ！　${nm(rt)}、見事な先手であった`, 4);
    rt.say('大久保忠世', '殿はこの城を牧野城と改め、遠江の押さえとされるそうな', 4);
    rt.finish({}, 10);
  },

  lose(rt, big, small) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.banner(big, small);
    rt.finish({}, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    // 櫓の射手は櫓の床に立たせる
    for (const u of F.towerU) {
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + DECK + 0.08;
      u.mesh.position.y = u.alive ? y : y - 0.1;
    }
    if (F.ending) return;
    // 散開したか
    if (F.step >= 1 && !F.looseDone && rt.squadGroups.some((g) => g.formation === 'loose')) {
      F.looseDone = true; rt.objDone('loose');
      rt.award((t) => t.side.push('組を散開させた'), '副任務：組を散開させた');
      rt.say('大久保忠世', 'それでよい。間を空ければ、鉄砲一発で二人は倒れぬ', 3);
    }
    if (F.step === 1) {
      const d = Math.hypot(p.x - EDGE.x, p.z - EDGE.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d - EDGE.r))}m`);
      if ((d < EDGE.r && rt.t - F.stepT > 12) || rt.t - F.stepT > 50) {
        if (!F.looseDone) rt.objFail('loose');
        this.sortie(rt);
      }
    }
    if (F.step === 2 && F.sorties) {
      const live = F.sorties.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `打って出た敵 ${live}人`);
      const t = rt.t - F.stepT;
      if (F.sorties.every(gone)) this.breach(rt, true);
      else if (t > 110) {
        // 押し返しきれないまま長引いたら、城兵は馬出へ引き揚げる（先へ進めるように）
        for (const g of F.sorties) { g.noRout = false; g.morale = 0; }
        this.breach(rt, false);
      }
    }
    if (F.step >= 3 && !F.towersDone) {
      const left = F.towerU.filter((u) => u.alive).length;
      rt.objProgress('towers', `残り ${left}/${F.towerU.length}人`);
      if (!left) {
        F.towersDone = true;
        rt.objDone('towers'); rt.unmark('tw0'); rt.unmark('tw1');
        rt.award((t) => t.side.push('隅櫓の射手を黙らせた'), '副任務：隅櫓の射手を黙らせた');
        rt.say('大久保忠世', '櫓が黙ったぞ！　門破りの者ども、今のうちに叩け！', 3.5);
        F.ramBoost = true;
        for (const g of F.rams) for (const u of g.units) u.dmg *= 1.5;
      }
      for (let i = 0; i < TOWERS.length; i++) if (!F.towerU.some((u) => u.alive && u.tower.x === TOWERS[i][0])) rt.unmark('tw' + i);
    }
    if (F.step === 3) {
      rt.objProgress('main', `${gateName(F)} ${gatePct(F)}% ・ 門破り ${ramCount(F)}人`);
      // 門破りが減ったら、後ろから次の者が駆けつける（止まらないように。三度まで）
      if (ramCount(F) < 8 && rt.t > F.ramNextT && F.ramWaves < 3) {
        F.ramWaves++; F.ramNextT = rt.t + 30;
        rt.say('大久保忠世', '門破りが減った！　次の者、行けっ！', 3);
        const g = allyGroup(rt, { faction: 'tokugawa', name: '門破りの組', anchor: { x: -16, z: 40 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, order: 'assault' },
          [{ type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }]);
        g.assault = F.ram.assault;
        if (F.ramBoost) for (const u of g.units) u.dmg *= 1.5;
        F.rams.push(g);
      }
      if (F.flank && gone(F.flank) && !F.flank.done) { F.flank.done = true; rt.unmark('flank'); rt.say('大久保忠世', '搦手の者を追い払ったか。門はもうすぐじゃ！', 3); }
      if ((!F.gate.alive || gatePct(F) <= 40) && !F.flank2) { F.flank2 = true; this.flankers(rt, true); }
    }
    if (F.step === 4) {
      const live = F.hon.count;
      rt.objProgress('main', `本曲輪の城兵 ${live}人`);
      if (!F.jokan.alive) this.win(rt, '城将・今福浄閑、討たれる');
      else if ((F.hon.routed || live <= 3) && rt.t - F.stepT > 15) this.win(rt, '城兵は城を捨てて落ちていく');
      // 保険：本曲輪で長く揉み合ったら、城兵は城を捨てて落ちる
      else if (rt.t - F.stepT > 170 && !F.hon.routed) { F.hon.noRout = false; F.hon.morale = 0; }
    }
    // 日暮れ（時間切れ）
    const left = TIME_LIMIT - rt.t;
    if (F.step >= 3 && left < 150) {
      const o = rt.objectives.find((x) => x.id === 'main');
      if (o) o.progress = `${o.progress}・日暮れまで ${Math.max(0, Math.ceil(left / 60))}分`;
    }
    if (left < 200 && !F.after) { F.after = true; rt.world.setTime('after'); }
    if (left < 90 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); rt.say('大久保忠世', '日が傾いてきた。急げ、日暮れまでに城を落とすのじゃ！', 3.5); }
    if (left <= 0) {
      rt.say('大久保忠世', '……日が暮れた。今日の攻めはここまでじゃ。退けい', 4);
      this.lose(rt, '日暮れ', '城は落ちず、寄せ手は陣へ引き揚げた');
    }
    // 組の全滅
    if (rt.squad.length && !rt.squad.some((s) => s.alive)) {
      rt.say('大久保忠世', `${nm(rt)}の組が潰えたか……下がれ、下がって手当てを受けよ`, 4);
      this.lose(rt, '組、潰える', '預かった二十人を失った');
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v === F.jokan) {
      if (k && (k.isPlayer || k.isSub)) { F.jokanByUs = true; rt.objDone('jokan'); rt.award((t) => { t.special = { label: '城将討ち取り', pts: 30 }; }, '城将・今福浄閑を討ち取った'); }
      else rt.say('足軽', '今福浄閑、討ち取ったりーっ！', 3);
      F.hon.morale -= 40;
    }
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (F.sorties && F.sorties.includes(g)) rt.say('足軽', '馬出の敵が逃げ戻っていくぞ！', 2.5);
  },

  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate && s !== F.gate2) return;
    const pct = gatePct(F);
    const said = (F.gateSaid = F.gateSaid || {})[s.name] = F.gateSaid[s.name] || [];
    const next = [75, 50, 25].find((q) => pct <= q && !said.includes(q));
    if (next) {
      said.push(next);
      rt.bark(`${gateName(F)}が軋んでいる（残り ${pct}%）`);
      if (next === 25) rt.say('門破りの頭 本多作左', 'もう一息じゃ！　閂が折れるぞ！', 2.5);
    }
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate && s !== F.gate2) return;
    rt.scene.add(stumps(rt.world, s.seg));
    sfx('wood', 1.2);
    if (s === F.gate2) { this.storm(rt); return; }
    rt.banner('一の門、破れる', '枡形へ押し込め');
    rt.obj('main', '枡形の奥、二の門（櫓門）を破れ。門破りの組を守れ', 'main');
    rt.say('足軽', '一の門が破れたぞ！', 2.5);
    rt.say('大久保忠世', '枡形じゃ！　四方の塀から撃たれるぞ、止まるな。右へ折れて二の門を破れ！', 4);
  },

  onFinish(rt) {
    const R = rt.G.rel && rt.G.rel.okubo;
    if (R && rt.tracker.main) { R.trust += 10; R.like += 8; }
  },
};

// 両軍の総勢（徳川 約一万、城兵 約千）。討たれた兵一人を、遠くの大勢の損害に見立てる
suwahara.force = (rt) => {
  const F = rt.flags;
  const b = Math.max(0, 1000 - (F.ek || 0) * 6 - (F.step >= 4 ? 100 : 0) - (F.ending && rt.tracker.main ? 400 : 0));
  return { a: 10000 - (F.ak || 0) * 25, a0: 10000, b, b0: 1000 };
};
suwahara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
suwahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
suwahara.sides = { a: { name: '徳川軍', mon: 'tokugawa' }, b: { name: '武田方 諏訪原城', mon: 'takeda' } };
suwahara.date = (rt) => {
  const w = rt.world;
  const time = { day: '昼', storm: '昼', after: '昼下がり', dusk: '夕暮れ' }[w.timeKey] || '昼';
  return `天正三年八月　秋・${w.rainLevel > 0.5 ? '雨' : '晴'}・${time}`;
};
suwahara.history = '諏訪原城は、武田方が大井川の西の台地に築いた遠江攻めの拠点で、丸馬出と三日月堀の縄張りが残る。天正三年、長篠の戦いの後に徳川家康はこの城を攻め、八月に落とした。城兵の多くは小山城の方へ退いたと伝わり、城将・今福浄閑の最期には諸説がある。家康は城を牧野城と改め、武田方の高天神城に向き合う押さえとした。';

// 素直な遊び手：印へ向かい、近くの敵を突く。散開・突撃・ついて来いの号令も使う
const WAIT = { x: -3, z: -36.5 };   // 枡形の入口の脇（二の門の前を空け、奥の塀の射手から遠い所）
suwahara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  const cmd = (id) => { if (!(b.botCmdT > b.t)) { inp.quickCmd = id; b.botCmdT = b.t + 2; } };
  // 前の号令で弓組だけを選んでいたら、全隊に戻す
  if (b.botSelBow) { b.botSelBow = false; p.selGroup = 'all'; p.lock = null; }
  // 門破りの間、弓組に隅櫓の射手を狙わせる（弓組を選び、射手に狙いを定めて「敵を狙え」）
  const bowG = b.squadGroups.find((g) => g.kind === 'bow' && g.count);
  if (F.step === 3 && bowG && !F.towersDone && !(bowG.focus && bowG.focus.alive) && !(b.botCmdT > b.t)) {
    const tw = F.towerU.filter((o) => o.alive).sort((a1, a2) => Math.hypot(a1.pos.x - u.pos.x, a1.pos.z - u.pos.z) - Math.hypot(a2.pos.x - u.pos.x, a2.pos.z - u.pos.z))[0];
    if (tw) { p.selGroup = 'bow'; p.lock = tw; inp.quickCmd = 'focus'; b.botCmdT = b.t + 2; b.botSelBow = true; return; }
  }
  // 寄せ始めたら組を散開させる
  if (F.step >= 1 && F.step < 3 && b.squad.length && !b.squadGroups.every((g) => g.formation === 'loose')) cmd('form');
  // 同じ囲いの中の敵だけを追う（塀越しの敵に吸い寄せられない）
  // 囲いごとの区分（枡形は二の門が破れるまで本曲輪と別）
  const reg = (x, z) => (inMasu(x, z) ? (F.gate2.alive ? 3 : 2) : inHon(x, z) ? 2 : inUma(x, z) ? 1 : 0);
  const my = reg(u.pos.x, u.pos.z);
  const range = F.step === 2 ? 9 : F.step === 3 ? 18 : 11;
  const e = b.army.nearestEnemy(u, range, (o) => !o.tower && !o.fleeing && !o.invuln && (reg(o.pos.x, o.pos.z) === my || (my === 1 && reg(o.pos.x, o.pos.z) === 0 && o.pos.z < -22) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3));
  // 門破りの間に深手を負ったら、馬出の内まで下がって息を整える
  if (F.step === 3 && u.hp < u.maxHp * 0.45 && !inUma(u.pos.x, u.pos.z)) {
    const back = inMasu(u.pos.x, u.pos.z) || (Math.abs(u.pos.x) < 5 && u.pos.z < MOAT.z + 4) ? { x: 0, z: -20 } : route(b, u.pos.x, u.pos.z, { x: 0, z: -20 });
    if (!back.isStruct) { goTo(p, inp, back.x, back.z, 1.5); inp.guardHold = false; return; }
  }
  // 深手なら組の後ろへ下がって息を整える
  if (e && u.hp < u.maxHp * 0.45) {
    p.yaw = F.step === 2 ? Math.atan2(-u.pos.x, 18 - u.pos.z) : Math.atan2(u.pos.x - e.pos.x, u.pos.z - e.pos.z);
    inp.k.add('KeyW');
    inp.guardHold = false;
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && d < 14) cmd('attack');
    return;
  }
  inp.guardHold = false;
  if (b.squad.length && b.squadGroups[0].order === 'attack') cmd('follow');
  // 行き先
  let q = null;
  if (F.step === 0) q = null;
  else if (F.step === 1) q = { x: EDGE.x, z: EDGE.z };
  else if (F.step === 2) q = { x: 0, z: 6 };
  else if (F.step === 3) {
    // 搦手の敵が門破りに迫っていれば迎え撃ち、そうでなければ門破りと一緒に門へ
    const fl = F.flank && !gone(F.flank) ? F.flank.center() : null;
    // 門破りの組の少し後ろについて行き、門にかかったら馬出の内で搦手からの敵に備える（先走って矢玉を一人で浴びない）
    const live = F.rams.find((r) => r.count) || F.ram;
    const rc = live.center();
    const atGate = F.gate.alive && Math.abs(rc.x) < 5 && rc.z < MOAT.z + 3;
    const fq = { x: rc.x, z: rc.z + 3 };
    // 二の門にかかったら、門の前を塞がないよう枡形の西の端で待つ
    if (!F.gate.alive && inMasu(u.pos.x, u.pos.z)) { q = WAIT; if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.5) goTo(p, inp, q.x, q.z, 1.5); return; }
    const follow = reg(rc.x, rc.z) === my && Math.hypot(rc.x - u.pos.x, rc.z - u.pos.z) > 4 ? fq : route(b, u.pos.x, u.pos.z, fq);
    q = fl && reg(fl.x, fl.z) === 0 && my === 0 && Math.hypot(fl.x - u.pos.x, fl.z - u.pos.z) < 30 ? fl : atGate ? (my === 1 || (Math.abs(u.pos.x) < 5 && u.pos.z < MOAT.z + 4) ? { x: 0, z: -22 } : route(b, u.pos.x, u.pos.z, { x: 0, z: -22 })) : follow;
  } else if (F.step === 4) {
    // 門が破れた直後は味方を先に行かせ、枡形で一息おいてから押し込む
    const j = F.jokan.alive ? F.jokan.pos : F.hon.center();
    q = b.t - F.stepT < 14 ? (inMasu(u.pos.x, u.pos.z) ? WAIT : route(b, u.pos.x, u.pos.z, WAIT)) : route(b, u.pos.x, u.pos.z, { x: j.x, z: j.z });
  }
  if (q) {
    if (q.isStruct) q = gateFront(q);
    goTo(p, inp, q.x, q.z, 1.5);
  }
};

export { suwahara };
