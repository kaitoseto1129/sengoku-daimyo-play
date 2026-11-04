// ======================================================================
// 徳川編 11　真田丸の戦い（慶長十九年 1614・十二月四日）　大坂冬の陣でいちばん大きな戦
// 筋書きの正：docs/chapter3_tokugawa.md の「11. 真田丸」
// 真田信繁が大坂城の南（惣構の外）に出丸を築いた。外に柵、その内に空堀、土塁の上に塀と櫓。
// 徳川方は南へ回り、前田利常・井伊直孝・松平忠直が前面に並ぶ。前の篠山から撃たれていた前田勢が篠山を取りに出て、
// 真田の挑発に乗って丸へ攻めかかる。堀・土塁・柵で詰まった所へ、塀と櫓から一斉射撃と横矢。
// 城の中で火薬が爆ぜたのを内応の合図と思った井伊・松平も堀へ殺到し、撃ち崩される。真田が打って出る。
// 家康は力攻めをやめ、大筒で城を撃つことにする。
// 主人公は前田利常の先手（山崎長徳の組）。史実どおり攻めは失敗する。勝ち方＝味方を退かせ、生きて退き口まで戻る（殿）。
// 段：①篠山を取る ②挑発に乗り丸の柵へ ③堀の前で一斉射撃に耐え、柵を破る（井伊・松平の殺到）④真田の打って出を受け、退き口へ
// 負け方：討たれる。刻限は段ごと（全体の刻限は無い。AP8）。見せかけの軍勢は出さない（AA・AF・AQ6）：出る兵は全部本物。
// 総大将の家康は住吉の陣で戦場にいない（下知は使番）。信繁は丸の中の本陣。打って出るのは大助と伊木遠雄（docs/battle_refs/k11_sanadamaru.md）。
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ。真田丸は円の中心 C の南へ開いた弧。
// 地形：国土地理院の標高（dem_sanadamaru.js・tools/dem.mjs の sanadamaru）。ゲームの 1 が実の 4m。丸の周りは平らに均す。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_sanadamaru.js';
import { demSample } from './dem.js';
import { nobori, tawara, hut, stumps, tenshu, ishigaki, dobei, sumiyagura, kabukimon, solidSeg, jinmaku } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { farSight } from './far_sight.js';
import { timeslipField } from './timeslip_field.js';

// ---- 縄張り：真田丸の中心 C。手本は二つの復元模型（docs/sanadamaru_1102/ の ref_kaito_model2.jpg を主に、段々は ref_kaito_model.jpg）：半円に近い出丸。
//   塀は WALL_R の段の縁。外へ二段の段々（空堀の段。STEP1・STEP2）と各段の柵、いちばん外に柵 FENCE_R。
//   「半径」は角の丸い四角（超楕円 PW）の物差し：polar(a, r) は四角の縁の点、rOf はその逆。角は +z から測り、北（城の側）は開く ----
const C = { x: 0, z: -40 };
const PW = 2.5;                             // 角の丸み（2 で円、大きいほど四角）。二枚目の模型の半円に寄せ、一枚目の角を少し残す
const WALL_R = 30, STEP1 = { r0: 33.5, r1: 37 }, STEP2 = { r0: 40, r1: 43.5 }, FENCE_R = 46;
const MOAT = { r0: STEP1.r0, r1: STEP2.r1 };
const LV = { maru: 5, s1: 2.8, s2: -2.6 };  // 丸の内・上の段・空堀の底の高さ（空堀は野より深く掘り下げる。AV9「堀がある・簡単に入れない」）
const PERCH_R = 35.6, PERCH_A = 1.05;      // 上の段（堀の内）に並ぶ鉄砲の持ち場
const SPAN = 2.45;
const GATE = 0.97, GATE_W = 0.08;           // 左右の口（角の脇。東の口は石垣の虎口）
const SASA = { x: 22, z: 66, r: 9 };        // 篠山（丸の前の小さな丘）
const RETREAT = { x: 6, z: 96 };            // 退き口（篠山の南の竹束の列）
const TOWERS = [-1.55, -Math.PI / 4, 0, Math.PI / 4, 1.55];   // 角の櫓・正面と横の櫓

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = (a) => 1 / Math.pow(Math.abs(Math.sin(a)) ** PW + Math.abs(Math.cos(a)) ** PW, 1 / PW);
const polar = (a, r) => ({ x: C.x + Math.sin(a) * r * sq(a), z: C.z + Math.cos(a) * r * sq(a) });
const angOf = (x, z) => Math.atan2(x - C.x, z - C.z);
const rOf = (x, z) => Math.pow(Math.abs(x - C.x) ** PW + Math.abs(z - C.z) ** PW, 1 / PW);
const gone = (g) => !g || g.count === 0 || g.routed;
const PORT = (s) => polar(s * GATE, FENCE_R + 1);   // 丸の左右の口（真田はここから打って出る）

// 家ごとの見た目（足軽は御貸具足の色。名のある武将は kacchu_data の甲冑）
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MAEDA = { flag: 'maeda' };
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };
const ECHI = { flag: 'tokugawa' };
const TK = 0x24221f;
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// ---- 地形：上町台地の起伏（国土地理院）に、真田丸の土塁・空堀・惣構の堀を削り込む ----
const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function natural(x, z) {
  const h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.32;
  // 丸と寄せ手の地（篠山まで）は均して、起伏は外側だけ
  const near = clamp01((rOf(x, z) - 70) / 60) * clamp01((Math.hypot(x - SASA.x, z - SASA.z) - 40) / 50);
  return h * Math.max(near, 0.15);
}
function height(x, z) {
  let h = natural(x, z) + 0.25 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.15 * Math.sin(z * 0.06 + x * 0.02);
  h += 6 * gauss(x, z, SASA.x, SASA.z, 260);
  const r = rOf(x, z), a = Math.abs(angOf(x, z));
  const inArc = clamp01((SPAN + 0.15 - a) / 0.2);
  // 段々：丸の内（LV.maru）→ 切岸 → 上の段 → 切岸 → 下の段 → 外の野。塀の足もとは土塁で少し高い。段の面は内へわずかに凹む（空堀の底）
  const st = LV.s2 * (1 - ss(STEP2.r1, FENCE_R - 0.6, r)) + (LV.s1 - LV.s2) * (1 - ss(STEP1.r1, STEP2.r0, r)) + (LV.maru - LV.s1) * (1 - ss(WALL_R + 0.6, STEP1.r0, r))
    + 0.6 * clamp01(1 - Math.abs(r - WALL_R) / 1.6) - 0.35 * trap(Math.abs(r - (STEP1.r0 + STEP1.r1) / 2), 1.2, 1) - 0.35 * trap(Math.abs(r - (STEP2.r0 + STEP2.r1) / 2), 1.2, 1);
  h += st * inArc;
  h -= 4 * trap(Math.abs(z + 92), 6, 3) * (Math.abs(x) > 18 ? 1 : 0);   // 惣構の堀（丸の後ろ）
  return h;
}

// ---- 城の小道具（形は束ねて一つに） ----
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts, block = true) {
  const m = new THREE.Mesh(mergeGeometries(parts), MAT);
  m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = block;
  return m;
}
// 大坂城：惣構の向こうの石垣と五重の天守（遠景）。惣構の土塀と隅櫓
function osakaCastle(world, x, z) {
  const g = new THREE.Group();
  g.add(tenshu(world, x, z, { floors: 5, b: 17, base: 9, old: true, stone: 'uchikomi', goldShachi: true }));
  g.add(ishigaki(world, [[x - 60, z + 22], [x + 60, z + 22]], { kind: 'uchikomi', top: 0.1, minH: 5, maxH: 7 }));
  for (const [a, b] of [[-170, -22], [22, 170]]) g.add(dobei(world, [a, -100, b, -100], { hikae: -1, shikkui: true }));
  for (const wx of [-150, -90, -30, 30, 90, 150]) g.add(sumiyagura(world, wx, -102.5, { w: 6, d: 5, base: 1.4 }));
  for (const m of [g, ...g.children]) m.userData.camBlock = false;
  return g;
}
// 空堀の縁の柵（飾り。当たりなし）
function innerFence(world, spans, R) {
  const parts = [], post = new THREE.CylinderGeometry(0.1, 0.13, 2.6, 5), C0 = [0x5c4a34, 0x4e3e2c];
  for (const [a0, a1] of spans) {
    const n = Math.round((a1 - a0) * R / 1.1);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const q = polar(a0 + (a1 - a0) * i / n, R), y = world.heightAt(q.x, q.z);
      parts.push(paint(post.clone().translate(q.x, y + 1.1, q.z), C0[i % 2]));
      if (prev) for (const hh of [0.8, 1.9]) {
        const dx = q.x - prev.x, dz = q.z - prev.z, L = Math.hypot(dx, dz);
        const g = new THREE.BoxGeometry(0.07, 0.1, L + 0.2);
        g.rotateY(Math.atan2(dx, dz)); g.translate((q.x + prev.x) / 2, (y + prev.y) / 2 + hh, (q.z + prev.z) / 2);
        parts.push(paint(g, 0x6a5640));
      }
      prev = { x: q.x, z: q.z, y };
    }
  }
  return mesh(parts, false);
}
// 段の縁の塀：赤茶の板塀（模型）。縦板の濃淡・朱の笠木と腰の貫・柱・外の面の狭間（四角の鉄砲狭間と縦長の矢狭間）・内の控え柱。
//   seg は丸の角の小さい順に並べる（外の向き＝左手）。wallLine の mesh として一間ずつ作る
function itabei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), parts = [];
  if (len < 0.05) return new THREE.Group();
  const H = o.h || 2.3, rot = Math.atan2(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
  const at = (t) => ({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, y: world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.25 });
  const put = (g, hex, t, y, off = 0) => { const p = at(t); g.rotateY(rot); g.translate(p.x + nx * off, p.y + y, p.z + nz * off); parts.push(paint(g, hex)); };
  const nb = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i < nb; i++) put(new THREE.BoxGeometry(0.09, H, len / nb + 0.01), [0x5a3f2c, 0x644632, 0x4e3626, 0x5e422e][(i + Math.round(ax * 7)) % 4], (i + 0.5) / nb, H / 2);
  for (const [y, h, d] of [[H + 0.06, 0.2, 0.26], [0.55, 0.12, 0.16]]) put(new THREE.BoxGeometry(d, h, len + 0.04), y > 1 ? 0x7e3a2c : 0x4a3022, 0.5, y);   // 朱の笠木・腰の貫
  const np = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= np; i++) {
    put(new THREE.BoxGeometry(0.16, H + 0.2, 0.16), 0x4a2c22, i / np, (H + 0.2) / 2);
    if (i % 2 === 0) { const k = new THREE.BoxGeometry(0.1, 2.1, 0.1); k.rotateX(0.5); k.rotateY(Math.PI / 2); put(k, 0x4a3426, i / np, 0.9, -0.55); }   // 内の控え柱
  }
  const nh = Math.max(1, Math.round(len / (o.samaStep || 1.6)));
  for (let i = 0; i < nh; i++) {
    const ya = i % 3 === 1;
    put(new THREE.BoxGeometry(0.03, ya ? 0.5 : 0.2, ya ? 0.12 : 0.2), 0x120c0a, (i + 0.5) / nh, ya ? 1.45 : 1.15, 0.06);
  }
  return mesh(parts, true);
}
// 塀の角と口の櫓：塀の上に張り出した一重の小さな櫓（模型）。四本の柱に床、赤茶の板壁に狭間、板葺きの寄棟。rot は塀に沿う向き
function maruYagura(world, x, z, rot, w = 3.4) {
  const parts = [], y = world.heightAt(x, z) - 0.2, c = Math.cos(rot), s = Math.sin(rot);
  const put = (g, hex, lx, yy, lz) => { g.rotateY(rot); g.translate(x + lx * c + lz * s, y + yy, z - lx * s + lz * c); parts.push(paint(g, hex)); };
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.BoxGeometry(0.22, 2.6, 0.22), 0x5a2a1e, dx * (w / 2 - 0.2), 1.3, dz * (w / 2 - 0.2));
  put(new THREE.BoxGeometry(w + 0.3, 0.2, w + 0.3), 0x3e2a1e, 0, 2.6, 0);
  put(new THREE.BoxGeometry(w, 1.7, w), 0x58402e, 0, 3.55, 0);
  put(new THREE.BoxGeometry(w + 0.06, 0.16, w + 0.06), 0x7e3a2c, 0, 4.36, 0);
  for (const [lx, lz, ry] of [[0, w / 2 + 0.02, 0], [0, -w / 2 - 0.02, 0], [w / 2 + 0.02, 0, Math.PI / 2], [-w / 2 - 0.02, 0, Math.PI / 2]])
    for (const o of [-0.7, 0.7]) { const g = new THREE.BoxGeometry(0.5, 0.36, 0.03); g.rotateY(ry); put(g, 0x140e0a, lx + (ry ? 0 : o), 3.6, lz + (ry ? o : 0)); }
  const roof = new THREE.ConeGeometry(w * 0.86, 1.5, 4, 1); roof.rotateY(Math.PI / 4); put(roof, 0x3a332c, 0, 5.15, 0);
  return mesh(parts, true);
}
// 竹束の胴：面ごとに青竹一本ずつの濃淡を付け、束ねた竹の筋に見せる（平らな筒に見せない）
function stalks(geo, hex) {
  const g = geo.toNonIndexed(), P = g.attributes.position, n = P.count, a = new Float32Array(n * 3);
  const base = new THREE.Color(hex), c = new THREE.Color();
  for (let t = 0; t < n; t += 3) {
    const k = Math.floor(((Math.atan2(P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2), P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) + Math.PI) / (Math.PI * 2)) * 12);
    c.copy(base).multiplyScalar([1.2, 0.62, 1.0, 0.74][k % 4]);
    for (let j = 0; j < 3; j++) { a[(t + j) * 3] = c.r; a[(t + j) * 3 + 1] = c.g; a[(t + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// 寄せ手の竹束と置き盾の列。kind：'take' 竹束／'tate' 置き盾
function siegeRow(world, pts, kind) {
  const parts = [];
  for (const [x, z, rot] of pts) {
    const y = world.heightAt(x, z);
    const put = (g, hex) => { g.rotateY(rot); g.translate(x, y, z); parts.push(paint(g, hex)); };
    if (kind === 'take') {
      // 竹束：青竹を丸く束ねて縄で二か所締め、敵の方へ傾けて立てる（一列の平らな竹の簾に見せない）。二束を並べて一組
      for (const ox of [-0.36, 0.36]) {
        for (let i = 0; i < 7; i++) {
          const a = i * 1.047, r = i === 6 ? 0 : 0.17;
          const g = new THREE.CylinderGeometry(0.085, 0.095, 2.2 - (i % 3) * 0.12, 5);
          g.translate(ox + Math.cos(a) * r, 1.05, Math.sin(a) * r); g.rotateX(-0.2);
          put(g, [0x7c7a48, 0x6e6c3e, 0x86804e, 0x74703f][(i + (ox > 0 ? 1 : 0)) % 4]);
        }
        for (const yy of [0.5, 1.45]) { const b = new THREE.CylinderGeometry(0.27, 0.27, 0.07, 7); b.translate(ox, yy, 0); b.rotateX(-0.2); put(b, 0x3a2c1c); }
      }
      const k = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4); k.rotateX(0.6); k.translate(0, 0.7, 0.6); put(k, 0x5a4a30);
    } else {
      // 置き盾：縦の板五枚を横の桟二本で留め、裏の支え棒で傾けて立てる（一枚の平らな箱に見せない）
      const lean = -0.12, hs = [1.62, 1.7, 1.66, 1.72, 1.6];
      for (let i = 0; i < 5; i++) {
        const b = new THREE.BoxGeometry(0.27, hs[i], 0.06); b.translate((i - 2) * 0.29, hs[i] / 2, 0); b.rotateX(lean);
        put(b, [0x6e5a3e, 0x5e4c34, 0x766046, 0x584832, 0x6a563c][(i + Math.round(x)) % 5]);
      }
      for (const yy of [0.35, 1.3]) { const c = new THREE.BoxGeometry(1.5, 0.1, 0.05); c.translate(0, yy, 0.06); c.rotateX(lean); put(c, 0x3e3022); }
      const k = new THREE.BoxGeometry(0.08, 1.5, 0.08); k.rotateX(0.6); k.translate(0, 0.65, 0.45); put(k, 0x4a3a28);
    }
  }
  return mesh(parts, false);
}
const row = (W, z0, x0, x1, dx, k) => { const pts = []; for (let x = x0; x <= x1; x += dx) pts.push([x + Math.sin(x * 1.7) * 0.6, z0 + Math.cos(x * 0.9) * 1.2, Math.PI + Math.sin(x * 0.7) * 0.12]); return siegeRow(W, pts, k); };

// ---- 段の敵（b_depth.js）：真田の兵は塀の内から、左右の口から出ては引く ----
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });

const k11_sanadamaru = {
  // 身の回りの合戦の跡（timeslip_field.js）。真田丸：十二月初めの冬の朝。霜枯れの草、撃ち込まれた矢・倒れた槍と旗
  timeslip: {
    wet: 0.25, dust: 0.3, trample: 0.35, debris: 1.4, arrows: 1.3, maxSlope: 0.25,
    grass: 0xa8a070, grassTints: [0xffffff, 0xeee4c4, 0xd4c8a4], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: SASA.x - 2, z: SASA.z + 40, heading: Math.PI },
  noWake: true,
  minutes: 14,
  foeHit: 1.05,
  world: {
    seed: 1614124,
    time: 'day',
    mist: true,                 // 冬の夜明け・朝靄
    groundHalf: 260,
    paths: [[[0, 190], [4, 140], [10, 106], [SASA.x - 4, SASA.z + 10]]],
    height,
    tint(x, z, h, c) {
      const r = rOf(x, z), a = Math.abs(angOf(x, z));
      if (r < FENCE_R + 1.5 && a < SPAN + 0.2) {
        // 段の面は踏み固めた明るい土、切岸は削った濃い土（模型の段々の明暗）
        const slope = (r > WALL_R + 0.6 && r < STEP1.r0) || (r > STEP1.r1 && r < STEP2.r0) || (r > STEP2.r1 && r < FENCE_R - 0.6);
        if (slope) c.setRGB(c.r * 0.2 + 0.36, c.g * 0.16 + 0.27, c.b * 0.14 + 0.23);   // 緑を勝たせない（草を生やさない）
        else c.setRGB(c.r * 0.2 + 0.5, c.g * 0.16 + 0.41, c.b * 0.14 + 0.37);
        return;
      }
      c.setRGB(c.r * 0.5 + 0.25, c.g * 0.45 + 0.2, c.b * 0.4 + 0.09);   // 冬枯れの野と刈田
      if (Math.abs(z + 92) < 8 && Math.abs(x) > 18) c.setRGB(c.r * 0.6, c.g * 0.6, c.b * 0.6);
    },
    clear: (x, z) => Math.abs(x) < 95 && z > -95 && z < 160,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) > 105 || z > 160 ? 1 : 0.15),
    groves: [{ x: -84, z: 62, r: 12, n: 16 }, { x: 92, z: 44, r: 12, n: 16 }, { x: SASA.x + 8, z: SASA.z + 6, r: 6, n: 8 }],
    // 逃げる真田の兵は、柵の内へ入ったら丸の中へ消える（遊び手を塀の下まで釣り出さない）
    fleeOut: (x, z, team) => (team === 1 ? rOf(x, z) < FENCE_R - 1 && Math.abs(angOf(x, z)) < SPAN + 0.1 : z > 200),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false; F.shot = 0;
    // ---- 真田丸：土塁の上の塀（壊せない）・外の柵（正面の一間だけ破れる）・櫓・空堀の縁の柵 ----
    const maru0 = rt.scene.children.length;
    const arc = (r, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const q = polar(a0 + (a1 - a0) * i / n, r); pts.push([q.x, q.z]); } return pts; };
    const along = (a) => { const p = polar(a - 0.01, WALL_R), q = polar(a + 0.01, WALL_R); return Math.atan2(-(q.z - p.z), q.x - p.x); };
    // 段の縁の赤茶の板塀（左右の口で切る）
    const G0 = GATE - GATE_W, G1 = GATE + GATE_W;
    for (const [a0, a1, n] of [[-SPAN, -G1, 22], [-G0, G0, 30], [G1, SPAN, 22]]) wallLine(rt, arc(WALL_R, a0, a1, n), { team: 1, hp: 1e9, name: '塀', mesh: itabei, segLen: 5, sama: 1.6, h: 2.3 });
    // 左右の口：冠木門（閉じた扉。当たりで塞ぐ）。東の口は石垣を積んだ虎口（模型）
    for (const sd of [-1, 1]) {
      const p = polar(sd * G0, WALL_R), q = polar(sd * G1, WALL_R), m = polar(sd * GATE, WALL_R);
      rt.scene.add(kabukimon(W, m.x, m.z, Math.hypot(q.x - p.x, q.z - p.z) - 0.5, along(sd * GATE)));
      solidSeg(p.x, p.z, q.x, q.z, 0.3);
    }
    const stone = (r, a0, a1, top = 0.3) => rt.scene.add(ishigaki(W, arc(r, a0, a1, Math.max(2, Math.round((a1 - a0) * r * 1.2 / 4))), { kind: 'nozura', top, minH: 1.2, maxH: 2.6 }));
    stone(WALL_R + 0.9, G1 + 0.01, GATE + 0.5); stone(WALL_R + 0.9, GATE - 0.32, G0 - 0.01);
    stone(STEP1.r1 + 0.4, GATE - 0.12, GATE + 0.55); stone(STEP2.r1 + 0.4, GATE - 0.05, GATE + 0.4, 0.2);
    F.fence = [
      ...wallLine(rt, arc(FENCE_R, -SPAN + 0.1, -1.05, 10), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, -0.9, 0.9, 18), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, 1.05, SPAN - 0.1, 10), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
    ];
    const mid = (s) => Math.abs(angOf((s.seg[0] + s.seg[2]) / 2, (s.seg[1] + s.seg[3]) / 2));
    F.target = F.fence.slice().sort((a, b) => mid(a) - mid(b))[0];
    F.target.hp = F.target.maxHp = 700; F.target.armor = 0.2; F.target.name = '真田丸の柵';
    // 塀の角と横・正面の櫓（塀に跨る一重の櫓）
    for (const a of TOWERS) { const q = polar(a, WALL_R - 0.6); rt.scene.add(maruYagura(W, q.x, q.z, along(a), Math.abs(Math.abs(a) - Math.PI / 4) < 0.01 ? 4 : 3.4)); }
    // 塀に沿って並ぶ小屋掛けの小さな櫓（二枚目の模型：塀の上に櫓がたくさん）
    for (let a = -2.1; a <= 2.11; a += 0.35) {
      if (TOWERS.some((t) => Math.abs(t - a) < 0.18) || Math.abs(Math.abs(a) - GATE) < 0.18) continue;
      const q = polar(a, WALL_R - 0.6); rt.scene.add(maruYagura(W, q.x, q.z, along(a), 2.6));
    }
    // 各段の柵の列（切岸の足もと）
    rt.scene.add(innerFence(W, [[-SPAN + 0.12, -GATE - 0.1], [-GATE + 0.1, GATE - 0.1], [GATE + 0.1, SPAN - 0.12]], STEP1.r0 + 0.8));
    // 空堀の底の柵（壊せない）：堀へ降りた寄せ手は、ここで止まって上の段から撃たれる（簡単に入れない）
    for (const [a0, a1, n] of [[-SPAN + 0.12, -GATE - 0.1, 8], [-GATE + 0.1, GATE - 0.1, 16], [GATE + 0.1, SPAN - 0.12, 8]]) wallLine(rt, arc(STEP2.r0 + 0.8, a0, a1, n), { team: 1, hp: 1e9, name: '柵', segLen: 5 });
    rt.scene.add(osakaCastle(W, 0, -150));
    // 丸の中：真田の陣屋と小屋・俵、塀の内にぐるりと並ぶ旗
    // 真ん中の本陣：白い幕の囲いの中に陣屋（二枚目の模型）
    rt.scene.add(jinmaku(W, 0, -59, 13, 8, 4), hut(W, 0, -60, 7, 4, 0), hut(W, -20, -56, 7, 4, Math.PI / 2), hut(W, 20, -56, 7, 4, Math.PI / 2), hut(W, -24, -36, 4, 10, 0),
      hut(W, -15, -26, 5, 3.5, 0.1), hut(W, 15, -25, 5, 3.5, -0.1), tawara(W, 10, -46, 0.3, 5), tawara(W, -8, -64, 0.2, 4));
    // 赤い旗（真田の赤備え）：塀の内にずらり、本陣の周り、外の柵の一隊。幟は横木で張るので、寄せ手（南）へ布の面を向ける
    const flag = (x, z, h) => { const f = nobori(W, x, z, 'sanada', h); f.rotation.y = Math.sin(x * 3.1 + z) * 0.25; rt.scene.add(f); };
    for (let a = -2.25; a <= 2.26; a += 0.3) { if (Math.abs(Math.abs(a) - GATE) < 0.1) continue; const q = polar(a, WALL_R - 1.6); flag(q.x, q.z, 5.5); }
    for (const [x, z] of [[-8, -53], [8, -53], [-8, -65], [8, -65], [-14, -40], [14, -40]]) flag(x, z, 5);
    for (const a of [-0.7, -0.35, 0.35, 0.7]) { const q = polar(a, PERCH_R - 0.8); flag(q.x, q.z, 4.5); }   // 上の段の鉄砲衆の旗（兵のいる所にだけ）
    rt.scene.add(nobori(W, 0, -68, 'toyotomi', 7));
    // 丸の塀・櫓・柵は、篠山の下からでも霧に沈めない（丸の土塁と櫓の並びが見える）
    farSight(rt.scene.children.slice(maru0), { W, ground: { x: C.x, z: C.z, r: 60 } });

    // ---- 寄せ手の陣：前田の竹束と置き盾の列、本陣 ----
    rt.scene.add(row(W, 104, -40, 2, 2.6, 'take'), row(W, 108, -62, -44, 2.4, 'tate'), row(W, 98, -36, 8, 3.2, 'take'), row(W, 98, 34, 52, 3.2, 'take'));
    camp(rt, { x: -14, z: 160, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'maeda', armor: TK,
      general: { name: '前田利常', hat: 'kabuto_m', haori: 0x3a2e24 }, guard: 25, reserve: 0, runTo: { x: 0, z: 120 } });
    for (const [x, z, k, h] of [[-26, 150, 'maeda', 7], [-2, 118, 'maeda', 5], [14, 116, 'maeda', 5]]) rt.scene.add(nobori(W, x, z, k, h));
    KIT.farVillage(rt, 130, 170, { rot: Math.PI, n: 6, fields: 8, seed: 52 });

    // 見せかけの軍勢（軽い作り）は置かない（AA・AF・AQ6）。家康は住吉の陣にいて、この戦場にはいない（AR3・AT3）。
    // 真田丸の中：信繁の本陣と旗本（侍）。塀の内に構え、外へは出ない（総大将は討てる所に出さない）
    F.nobu = enemyGroup(rt, { faction: 'toyotomi', name: '真田信繁の旗本', anchor: { x: 0, z: -54 }, facing: 0, width: 8, aggro: 0, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, hat: 'kabuto_f', haori: 0x7a1a12 } }, uS(10), uG(4)], SANADA));
    for (const u of F.nobu.units) u.speed = u.run = 0;

    // ---- 味方：前田の先手（山崎長徳の組）・二の手（本多政重）・柵を破る組。槍衾の陣形で並ぶ ----
    F.yam = allyGroup(rt, { faction: 'tokugawa', name: '山崎長徳の組', anchor: { x: SASA.x - 4, z: SASA.z + 32 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山崎長徳', invuln: true, horse: true } }, uS(5), uA(24), uG(8)], MAEDA));
    F.second = allyGroup(rt, { faction: 'tokugawa', name: '本多政重の二の手', anchor: { x: -10, z: SASA.z + 36 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '本多政重', invuln: true, horse: true } }, uS(4), uA(20), uB(6)], MAEDA));
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: SASA.x + 12, z: SASA.z + 40 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14, o: { hat: 'jingasa_n' } }], MAEDA));
    F.rams = [F.ram];
    // 仕寄り：柵を破る組の前の者は竹束を押し立てて進む（AV9「仕寄りで柵を壊す部隊が見える」）
    F.take = [];
    for (let i = 0; i < 6; i++) {
      const m = siegeRow(W, [[0, 0, 0]], 'take');
      m.geometry.translate(0, -W.heightAt(0, 0), 0);
      m.visible = false; rt.scene.add(m); F.take.push(m);
    }
    for (const g of [F.yam, F.second]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SASA.x + 4, z: SASA.z + 36 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // ---- 真田方：塀の内の鉄砲と弓、櫓の上の射手（横矢）、篠山の鉄砲 ----
    F.wallG = enemyGroup(rt, { faction: 'toyotomi', name: '塀の内の鉄砲', anchor: { x: C.x, z: C.z + WALL_R - 4 }, facing: 0, width: 16, spacing: 2.4, aggro: 0, noRout: true },
      dress([uS(2), uG(12), uB(8)], SANADA));
    F.towerU = [];
    TOWERS.forEach((a, i) => {
      const q = polar(a, WALL_R - 3.5);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '櫓', anchor: q, facing: a, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        dress([uG(2), i % 2 ? uG(1) : uB(1)], SANADA));
      g.units.forEach((u, k) => { u.pos.x = q.x + (k - 1) * 0.7; u.pos.z = q.z; u.speed = u.run = 0; u.tower = q; F.towerU.push(u); });
    });
    // 上の段（空堀の内）の鉄砲と弓：柵と堀の内に並び、動かない。堀へ降りた寄せ手を上から撃つ（AV9）
    F.perch = [];
    for (const [a0, a1, nmx] of [[-PERCH_A, -0.08, '堀の内の西の鉄砲衆'], [0.08, PERCH_A, '堀の内の東の鉄砲衆']]) {
      const q0 = polar((a0 + a1) / 2, PERCH_R);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: nmx, anchor: q0, facing: (a0 + a1) / 2, width: 6, spacing: 1.4, aggro: 0, noRout: true },
        dress([uS(1), uG(10), uB(3)], SANADA));
      g.units.forEach((u, k) => { const q = polar(a0 + (a1 - a0) * (k + 0.5) / g.units.length, PERCH_R); u.pos.x = q.x; u.pos.z = q.z; u.pos.y = W.heightAt(q.x, q.z); u.heading = Math.atan2(q.x - C.x, q.z - C.z); u.speed = u.run = 0; });
      g.fire = false;
      F.perch.push(g);
    }
    for (const u of [...F.wallG.units, ...F.towerU, ...F.perch.flatMap((g) => g.units)]) { u.group.dmgMult = 0.4; if (u.type === 'gun') u.dmg *= 0.4; }
    F.wallG.fire = false;
    for (const u of F.towerU) u.group.fire = false;

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '篠山を取り、真田丸の柵を破って、生きて竹束の陣まで戻れ', 'main');
    // 戦の前：信繁が南に出丸を築いた。徳川は南へ回った
    rt.banner('真田丸', '慶長十九年十二月　大坂城の南');
    rt.say('山崎長徳', '見よ、城の南に突き出た出丸を。真田信繁が築いた真田丸じゃ', 4.4);
    rt.after(4, () => rt.say(nm(rt), '外に柵、その内に空堀。土塁の上に塀と櫓……', 3.6));
    rt.after(7, () => rt.say('前田利常', '大御所は南から攻めよと仰せじゃ。井伊は西、越前の松平殿は東に並ぶ', 4.4));
    rt.after(11, () => rt.say('山崎長徳', '前の篠山から真田の鉄砲に撃たれて、仕寄りが進まぬ。まず篠山を取る', 4.2));
    rt.after(14.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // backing: false … 段の敵の後ろに見せかけの控えを付けない（AA）。数は本物の兵で出す
    const ctx = { faction: 'toyotomi', flag: 'sanada', armor: SANADA.armor, dmg: 0.4, mass: 0, backing: false, scale: 1.6, look: (l) => dress(l, SANADA),
      friends: () => [F.yam, F.second].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 篠山を取る：夜明け前、丘の上の真田の鉄砲を追い落とす
      DP.fight({ at: SASA, title: '篠山へ', sub: '夜明け前の寄せ', obj: '篠山の上の真田の鉄砲を討て', max: 240,
        say: [['山崎長徳', '進め！　篠山の鉄砲を追い落とせ！']],
        foes: () => [{ name: '篠山の真田の鉄砲', from: { x: SASA.x - 6, z: SASA.z - 10 }, list: [uS(2), uG(6), uA(8)], morale: 60 }],
        reward: '篠山を取った', onEnd: (rt2) => this.taunt(rt2) }),
      // ② 挑発に乗って丸の柵の前へ
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.move({ to: { x: 4, z: C.z + FENCE_R + 12 }, label: '真田丸の柵', r: 8, max: 150, obj: '真田丸の柵の前まで攻め寄せよ',
        say: [['山崎長徳', 'おのれ、言わせておけば……！　柵まで寄せよ！']],
        ambush: { d: 30, say: ['足軽', '堀の内に鉄砲がずらりと……！　西の口から槍も出てきた！'], foes: () => { this.openFire(rt); return [{ name: '西の口の真田の槍', from: PORT(-1), list: [uS(2), uA(10)] }]; } },
        onEnd: (rt2) => this.fenceStart(rt2) }),
      // ③ 堀の前：柵を破る組を守り、一斉射撃と横矢に耐える。城内の爆発で井伊・松平が殺到
      DP.rest({ dur: 5, heal: 0.9 }),
      this.fenceStep(DP.hold({ at: { x: 6, z: C.z + FENCE_R + 10 }, dur: 80, r: 16, label: '柵の前', title: '堀と柵', sub: '塀と櫓から鉄砲が並ぶ',
        obj: '柵を破る組と一緒に、真田丸の柵を打ち倒せ',
        waves: [
          { t: 8, say: ['足軽', '東の口から真田の兵が出てきた！　柵を破る組を狙っておる！'], foes: () => [{ name: '東の口の真田の兵', from: PORT(1), list: [uS(2), uA(10)], mass: 160 }] },
          { t: 30, say: ['山崎長徳', '横の櫓からも撃ってくる！　竹束を前へ！　堀へは降りるな！'], foes: () => { rt.flags.volT = rt.t + 1; return []; } },
          { t: 52, say: ['足軽', '西の口からもじゃ！　横を突かれる！'], foes: () => [{ name: '西の口の真田の兵', from: PORT(-1), list: [uS(2), uA(11)], mass: 180 }] },
        ],
        reward: '堀の前で踏みとどまった', onEnd: (rt2) => this.sortie(rt2) })),
      // ④ 大御所の退きの下知（使番が伝える）：大助と伊木遠雄の打って出を受けて、竹束の陣まで
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: { x: 4, z: RETREAT.z - 22 }, dur: 75, r: 16, label: '竹束の陣', title: '退け', sub: '大御所の下知：寄せ手は引き揚げよ',
        obj: '竹束の陣の前で、打って出た真田大助の隊を食い止めよ',
        waves: [
          { t: 6, say: ['足軽', '六文銭の旗！　真田が丸から打って出た！'], foes: () => [{ name: '真田大助の隊', from: PORT(1), list: [{ type: 'busho', n: 1, o: { name: '真田大助', horse: true, hat: 'kabuto_m', haori: 0x7a1a12 } }, uS(8), uA(14), uG(4)], noRout: 30, dmg: 0.4 }] },
          { t: 26, say: ['足軽', '西の口からも！　伊木遠雄の隊じゃ！'], foes: () => [{ name: '伊木遠雄の隊', from: PORT(-1), off: { x: -10, z: 0 }, list: [{ type: 'busho', n: 1, o: { name: '伊木遠雄', horse: true, hat: 'kabuto_m' } }, uS(6), uA(12)], noRout: 20, dmg: 0.4 }] },
          { t: 48, say: ['山崎長徳', '塀の上で火縄が光った！　退く者を撃っておる、急げ！'], foes: () => { rt.flags.volT = rt.t + 0.5; return [{ name: '追い討ちの真田の槍', from: PORT(1), off: { x: 12, z: 0 }, list: [uS(3), uA(12)], dmg: 0.4 }]; } },
        ],
        reward: '真田の打って出を食い止めた' }),
    ], (rt2) => this.win(rt2));
  },

  // 柵の段：守る刻が過ぎても、柵を打ち倒すまでは済まない（時間で勝手に進めない。AB）。札に柵の残りを出す
  fenceStep(h) {
    const t0 = h.tick;
    h.max = 360;
    h.tick = (rt, C, m, ctx, el, dt) => {
      const done = t0(rt, C, m, ctx, el, dt), T = rt.flags.target;
      if (!T.alive) return done;
      rt.objProgress('dp', `柵 残り${Math.max(1, Math.ceil(T.hp / T.maxHp * 100))}%`);
      return false;
    };
    return h;
  },

  // 篠山はもぬけの殻。真田の兵の挑発（必ず）
  taunt(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.banner('篠山を取った', '真田の兵は丸へ引いていた');
    rt.say('真田の兵', '前田の衆は雉撃ちか！　寄せたければ、この丸まで来てみよ！', 4);
    rt.after(4.5, () => rt.say('足軽', 'あいつら、笑うておる……', 2.6));
  },

  // 柵の前：柵を破る組が柵にとりつく。塀と櫓が撃ち始める（一斉射撃）
  fenceStart(rt) {
    const F = rt.flags;
    F.step = 3; F.fenceT = rt.t;
    this.openFire(rt);
    const T = F.target, R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (T.alive ? T : null);
    for (const u of R.units) u.aiT = 0;
    const tq = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 };
    rt.marker('fence', tq, '真田丸の柵', { h: 3 });
    rt.after(18, () => this.blast(rt));
  },

  // 塀・櫓・堀の内の鉄砲が撃ち始める（一度だけ）。最初の一斉射撃は引きつけてから
  openFire(rt) {
    const F = rt.flags;
    if (F.fireOn) return;
    F.fireOn = true; F.volT = rt.t + 5;
    for (const g of [F.wallG, ...F.perch, ...new Set(F.towerU.map((u) => u.group))]) g.fire = true;
    rt.say('真田信繁', '引きつけよ。まだ撃つな……', 3);
  },

  // 城の中で火薬が爆ぜる → 内応の合図と思い込んだ井伊・松平が堀へ殺到（必ず）
  blast(rt) {
    const F = rt.flags;
    if (F.blasted || F.ending) return;
    F.blasted = true;
    sfx('thunder', 1); sfx('volley', 0.7);
    for (let i = 0; i < 8; i++) rt.army.smoke((Math.random() - 0.5) * 30, rt.world.heightAt(0, -140) + 18 + Math.random() * 8, -140 + (Math.random() - 0.5) * 20, 0, 1);
    if (rt.world.addFire) rt.world.addFire(-14, -128, { h: 12 });
    rt.banner('城内で火薬が爆ぜる', '寄せ手は内応の合図と思い込んだ');
    rt.say('足軽', '城の中で火が上がった！　内応じゃ、裏切りの合図じゃ！', 3.5);
    rt.after(3.5, () => rt.say('井伊直孝', '遅れるな！　赤備え、堀へかかれ！', 3));
    rt.after(7, () => rt.say('松平忠直', '越前勢、井伊に先を越させるな！', 3));
    F.surge = [];
    for (const [s, lk, nmx, gen] of [[-1, II, '井伊直孝の赤備え', '井伊直孝'], [1, ECHI, '松平忠直の越前勢', '松平忠直']]) {
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: { x: s * 60, z: 44 }, facing: Math.PI, width: 16, aggro: 6, speed: 3.4, morale: 90, fleeDir: { x: s * 0.2, z: 1 }, formation: 'yari' },
        dress([{ type: 'busho', n: 1, o: { name: gen, invuln: true, horse: true } }, uS(5), uA(22)], lk));
      g.order = 'move'; g.dest = polar(s * 1.1, MOAT.r1 + 2);
      F.surge.push(g);
    }
  },

  // 一斉射撃（塀と櫓の鉄砲が揃えて放つ）：堀と柵の前の寄せ手が倒れる。遊び手も堀の縁にいれば撃たれる
  volley(rt) {
    const F = rt.flags;
    F.shot++;
    sfx('volley', 0.9);
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + i * 0.27, q = polar(a, WALL_R + 0.5);
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 2.4, q.z, Math.sin(a), Math.cos(a));
    }
    for (let i = 0; i < 6; i++) {
      const a = -0.95 + i * 0.38, q = polar(a, PERCH_R);
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 1.4, q.z, Math.sin(a), Math.cos(a));
    }
    rt.army.play('gun', polar(0, WALL_R), 1.5);
    const shooter = F.wallG.units.find((u) => u.alive) || null;
    let fell = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u.invuln || fell >= 7) continue;
      const ru = rOf(u.pos.x, u.pos.z);
      if (ru < FENCE_R + 10 && Math.abs(angOf(u.pos.x, u.pos.z)) < SPAN && Math.random() < (ru < FENCE_R ? 0.7 : 0.35)) { rt.army.damage(u, u.maxHp * 0.9, shooter, { kind: 'gun', pierce: true }); fell++; }
    }
    const p = rt.player.u;
    const rp = rOf(p.pos.x, p.pos.z);
    if (p.alive && !p.invuln && rp < FENCE_R + 6 && Math.abs(angOf(p.pos.x, p.pos.z)) < SPAN && Math.random() < (rp < FENCE_R ? 0.85 : 0.5)) rt.army.damage(p, p.maxHp * (rp < FENCE_R ? 0.32 : 0.22), shooter, { kind: 'gun' });   // 堀の中は逃げ場が無い
    for (const g of F.surge || []) if (!gone(g)) g.morale -= 12;
    if (F.shot === 1) rt.say('真田信繁', '今じゃ、放て！', 2.4);
    else if (F.shot === 3) rt.say('足軽', '堀の底で、味方が折り重なって倒れていく……！', 3.2);
    else if (F.shot === 5) rt.say('山崎長徳', '竹束の陰に入れ！　放った後の、込め直す間に寄せよ！', 3.4);
  },

  // 真田の打って出・家康の退き命令（必ず）
  sortie(rt) {
    const F = rt.flags;
    F.step = 4; F.sortieT = rt.t;
    rt.unmark('fence');
    sfx('taiko', 1); sfx('horagai', 0.7);
    rt.say('使番', '大御所様の下知！　力攻めはやめよ、寄せ手は引き揚げよ！', 4);
    rt.after(4.5, () => rt.say('山崎長徳', `${nm(rt)}、しんがりじゃ！　味方が退くまで、真田を止めよ！`, 4));
    // 堀へ殺到した寄せ手は撃ち崩されて退く
    for (const g of F.surge || []) if (!gone(g)) { g.order = 'move'; g.dest = { x: g.anchor.x, z: RETREAT.z + 20 }; }
    for (const g of F.rams) if (!gone(g)) { g.order = 'move'; g.dest = { x: 18, z: RETREAT.z + 14 }; }
    for (let i = 0; i < 10; i++) rt.world.addCarrion(C.x + (Math.random() - 0.5) * 70, C.z + MOAT.r1 + Math.random() * 10);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '真田丸の前で殿を務めた', pts: 40 }; }, '真田の打って出を食い止め、生きて戻った');
    rt.player.u.invuln = true;
    rt.banner('寄せ手、退く', '慶長十九年十二月四日　徳川方、大きく損ず');
    rt.say('山崎長徳', '……ようしのいだ。じゃが、堀の底に、どれだけの者を残してきたか', 4.4);
    // 家康が力攻めをやめ、大筒へ（必ず）
    rt.after(5, () => rt.say('使番', '大御所様より：あの出丸は捨て置け。大筒を据え、城の奥まで撃ち込む', 4.4));
    rt.after(9.5, () => {
      rt.banner('大筒', '家康は力攻めをやめ、城を砲で撃つことにした');
      for (let i = 0; i < 3; i++) rt.after(i * 1.6, () => { sfx('thunder', 0.9); rt.army.smoke((Math.random() - 0.5) * 40, rt.world.heightAt(0, -150) + 14, -150 + (Math.random() - 0.5) * 16, 0, 1); });
    });
    rt.after(13, () => rt.say('前田利常', '真田め……あの丸がある限り、南からは寄せられぬわ', 4));
    rt.finish({}, 18);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('退き口を失った', '寄せ手は堀の前で崩れた');
    rt.say('山崎長徳', '退き口が……！　皆、散り散りに逃げよ！', 4);
    rt.finish({ failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 櫓の射手は櫓の床に立たせる
    for (const u of F.towerU) {
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + 5.58;
      u.pos.y = y;
      u.mesh.position.y = u.alive ? y : y - 0.1;
    }
    if (F.ending) return;
    depthTick(rt, dt);
    // 塀と櫓の鉄砲は、柵の前の寄せ手の群れを狙う（横矢）
    F.aimT = (F.aimT || 0) - dt;
    if (F.aimT <= 0 && F.step >= 3) {
      F.aimT = 1.5;
      const pool = [...(F.surge || []), ...F.rams, F.second, F.yam].filter((g) => g && g.count);
      for (const sg of [F.wallG, ...new Set(F.towerU.map((u) => u.group))]) {
        if (!sg || !sg.count) continue;
        const c = sg.center();
        let best = null, bd = 58;
        for (const g of pool) for (const u of g.units) if (u.alive) { const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z); if (d < bd) { bd = d; best = u; } }
        sg.focus = best;
      }
    }
    if (F.fireOn && F.step >= 2 && rt.t > F.volT) { F.volT = rt.t + (F.step === 3 ? 9 : 13) + Math.random() * 3; this.volley(rt); }
    // 竹束：柵を破る組の前の六人が、柵の方へ押し立てて進む。柵が倒れたら、その場に置いて退く
    if (F.take && F.step < 4 && F.target.alive) {
      const T = F.target, tq = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 };
      const men = F.rams.flatMap((g) => g.units).filter((u) => u.alive && !u.fleeing);
      F.take.forEach((m, i) => {
        const u = men[i];
        if (!u) return;
        const dx = tq.x - u.pos.x, dz = tq.z - u.pos.z, L = Math.hypot(dx, dz) || 1, k = Math.max(0, Math.min(1.1, L - 0.6));
        const x = u.pos.x + dx / L * k, z = u.pos.z + dz / L * k;
        m.visible = true;
        m.position.set(x, rt.world.heightAt(x, z), z); m.rotation.y = Math.atan2(dx, dz);
      });
    }
    if (F.step === 3 && F.target.alive) {
      // 柵を破る組が減ったら、後ろから次の者が出る
      const left = F.rams.reduce((a, g) => a + g.count, 0);
      if (left < 4 && F.rams.length < 3) {
        rt.say('山崎長徳', '柵の者が討たれた！　次の者、行けっ！', 3);
        const g = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: 10, z: SASA.z + 20 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], MAEDA));
        g.assault = F.ram.assault;
        F.rams.push(g);
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　真田の者が担いで丸へ引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (F.surge && F.surge.includes(g)) rt.say('足軽', `${g.name}が堀から逃げ戻ってくる……ひどい討たれようじゃ`, 3.5);
    else if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が丸へ引いていく！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.target) return;
    rt.scene.add(stumps(rt.world, s.seg));
    sfx('wood', 1.2);
    rt.unmark('fence');
    rt.award((t) => t.side.push('真田丸の柵を破った'), '真田丸の柵を破った');
    rt.say('足軽', '柵を倒したぞ！　……む、堀が深い。これは登れぬ', 3.5);
  },
};

// 両軍の総勢：大坂を囲む徳川方およそ二十万のうち、真田丸の前に並んだ前田・井伊・松平らを三万。真田丸の兵は五千ほど
k11_sanadamaru.force = (rt) => {
  const F = rt.flags;
  const shot = (F.shot || 0) * 180 + (F.step >= 4 ? Math.min(1, (rt.t - (F.sortieT || rt.t)) / 40) * 1500 : 0);
  return { a: Math.max(0, Math.round(30000 - (F.ak || 0) * 30 - shot)), a0: 30000, b: Math.max(0, 5000 - (F.ek || 0) * 12), b0: 5000 };
};
k11_sanadamaru.sides = { a: { name: '徳川方', mon: 'tokugawa' }, b: { name: '豊臣方 真田丸', mon: 'sanada' } };
k11_sanadamaru.date = (rt) => `慶長十九年（1614）十二月四日　冬・晴・${rt.t < 60 ? '夜明け' : '朝'}`;
k11_sanadamaru.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
k11_sanadamaru.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k11_sanadamaru.history = '慶長十九年（1614）の大坂冬の陣で、真田信繁は大坂城の南、惣構の外に出丸を築いた。のちに真田丸と呼ばれる。外に柵、その内に空堀、土塁の上に塀と櫓を備え、塀の内から鉄砲が並んだ。十二月四日、前の篠山から真田の鉄砲に妨げられていた前田利常の兵が篠山へ寄せたが、真田の兵はすでに引いていた。挑発に乗った前田勢は丸の空堀まで押し寄せ、塀と櫓から撃たれて大きく損じた。城内で火薬が爆ぜたのを内応の合図と思い込んだ井伊直孝・松平忠直の兵も堀へ殺到し、同じく撃ち崩された。徳川方の損害は数千とも伝わるが、数には諸説がある。この後、家康は力攻めをやめ、大筒で城を撃って和議へ持ち込んだ。\n丸の寸法は遊びのために縮めて復元したもので、形（半円か方形か）には諸説がある。篠山の位置と挑発の言葉は伝えによる。';
k11_sanadamaru.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '真田大助', g: /大助/ }, { name: '伊木遠雄', g: /伊木/ }];

// 素直な遊び手：段の的へ。柵の内や堀の底へは入らない
k11_sanadamaru.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, SASA.x - 2, SASA.z + 36, 3);
};

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
STAGES.k11_sanadamaru = [['篠山を取る'], ['挑発に乗り、丸の柵へ寄せる', st(2)], ['堀の前で一斉射撃に耐える', st(3)], ['殿として味方を退かせる', st(4)]];

export { k11_sanadamaru };
export default k11_sanadamaru;
