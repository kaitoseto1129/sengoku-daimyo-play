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
// 負け方：討たれる・刻限（七分）。
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ。真田丸は円の中心 C の南へ開いた弧。
// 地形：国土地理院の標高（dem_sanadamaru.js・tools/dem.mjs の sanadamaru）。ゲームの 1 が実の 4m。丸の周りは平らに均す。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_sanadamaru.js';
import { demSample } from './dem.js';
import { nobori, yagura, tawara, hut, stumps, tenshu, ishigaki, dobei, sumiyagura } from './props.js';
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

// ---- 縄張り：真田丸の中心 C。土塁と塀は WALL_R、空堀は MOAT、外の柵は FENCE_R（どれも南へ開いた弧。角は +z から測る） ----
const C = { x: 0, z: -40 };
const WALL_R = 30, MOAT = { r0: 34, r1: 42 }, FENCE_R = 46, MOAT2 = { r0: 49, r1: 53 };
const SPAN = 1.75;
const SASA = { x: 22, z: 66, r: 9 };        // 篠山（丸の前の小さな丘）
const RETREAT = { x: 6, z: 96 };            // 退き口（篠山の南の竹束の列）
const TOWERS = [-0.9, -0.45, 0, 0.45, 0.9];
const LIMIT = 420;                          // 刻限（秒）

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const polar = (a, r) => ({ x: C.x + Math.sin(a) * r, z: C.z + Math.cos(a) * r });
const angOf = (x, z) => Math.atan2(x - C.x, z - C.z);
const rOf = (x, z) => Math.hypot(x - C.x, z - C.z);
const gone = (g) => !g || g.count === 0 || g.routed;
const PORT = (s) => polar(s * 0.97, FENCE_R + 1);   // 丸の左右の口（真田はここから打って出る）

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
  h += 2.2 * clamp01((WALL_R + 1 - r) / 2) * inArc + 1.2 * clamp01(1 - Math.abs(r - WALL_R) / 2.4) * inArc;
  h -= 3.6 * trap(Math.abs(r - (MOAT.r0 + MOAT.r1) / 2), (MOAT.r1 - MOAT.r0) / 2, 2.2) * inArc;
  h -= 1.5 * trap(Math.abs(r - (MOAT2.r0 + MOAT2.r1) / 2), (MOAT2.r1 - MOAT2.r0) / 2, 1.4) * inArc;
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
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });

const k11_sanadamaru = {
  // 身の回りの合戦の跡（timeslip_field.js）。真田丸：十二月初めの冬の朝。霜枯れの草、撃ち込まれた矢・倒れた槍と旗
  timeslip: {
    wet: 0.25, dust: 0.3, trample: 0.35, debris: 1.4, arrows: 1.3, maxSlope: 0.25,
    grass: 0xa8a070, grassTints: [0xffffff, 0xeee4c4, 0xd4c8a4], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: SASA.x - 2, z: SASA.z + 40, heading: Math.PI },
  noWake: true,
  minutes: 7,
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
      if (r < MOAT2.r1 + 2 && a < SPAN + 0.2) { c.setRGB(c.r * 0.55 + 0.17, c.g * 0.5 + 0.13, c.b * 0.45 + 0.09); return; }   // 土塁と空堀の土
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
    wallLine(rt, arc(WALL_R, -SPAN, SPAN, 18), { team: 1, hp: 1e9, name: '塀', mesh: dobei, segLen: 5, sama: 1.6, h: 2.3 });
    F.fence = [
      ...wallLine(rt, arc(FENCE_R, -SPAN + 0.1, -1.05, 5), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, -0.9, 0.9, 12), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, 1.05, SPAN - 0.1, 5), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
    ];
    const mid = (s) => Math.abs(angOf((s.seg[0] + s.seg[2]) / 2, (s.seg[1] + s.seg[3]) / 2));
    F.target = F.fence.slice().sort((a, b) => mid(a) - mid(b))[0];
    F.target.hp = F.target.maxHp = 700; F.target.armor = 0.2; F.target.name = '真田丸の柵';
    for (const a of TOWERS) { const q = polar(a, WALL_R - 3.5); rt.scene.add(yagura(W, q.x, q.z)); }
    rt.scene.add(innerFence(W, [[-SPAN + 0.12, -1.05], [-0.9, 0.9], [1.05, SPAN - 0.12]], 43));
    rt.scene.add(osakaCastle(W, 0, -150));
    rt.scene.add(hut(W, 0, -52, 10, 6, 0), hut(W, -12, -46, 6, 4, 0.2), tawara(W, 10, -46, 0.3, 5));
    for (const a of [-1.3, -0.6, 0.3, 1.0, 1.5]) { const q = polar(a, WALL_R - 5); rt.scene.add(nobori(W, q.x, q.z, 'sanada', 6)); }
    rt.scene.add(nobori(W, 0, -60, 'toyotomi', 7));
    // 丸の塀・櫓・柵は、篠山の下からでも霧に沈めない（丸の土塁と櫓の並びが見える）
    farSight(rt.scene.children.slice(maru0), { W, ground: { x: C.x, z: C.z, r: 60 } });

    // ---- 寄せ手の陣：前田の竹束と置き盾の列、本陣 ----
    rt.scene.add(row(W, 104, -40, 2, 2.6, 'take'), row(W, 108, -62, -44, 2.4, 'tate'), row(W, 98, -36, 8, 3.2, 'take'), row(W, 98, 34, 52, 3.2, 'take'));
    camp(rt, { x: -14, z: 160, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'maeda', armor: TK,
      general: { name: '前田利常', hat: 'kabuto_m', haori: 0x3a2e24 }, guard: 12, reserve: 0, runTo: { x: 0, z: 120 } });
    for (const [x, z, k, h] of [[-26, 150, 'maeda', 7], [-2, 118, 'maeda', 5], [14, 116, 'maeda', 5]]) rt.scene.add(nobori(W, x, z, k, h));
    KIT.farVillage(rt, 130, 170, { rot: Math.PI, n: 6, fields: 8, seed: 52 });

    // ---- 大軍（軽い作り）：徳川方が丸と城の南を埋める。陣立て：前田（中）・井伊（西）・松平忠直の越前勢（東）、後ろに家康 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    F.maedaDA = [DA(44, 150, 36, 6, 200, Math.PI, TK, 'maeda', 61, 'gun'), DA(-4, 176, 70, 12, 320, Math.PI, TK, 'maeda', 62, 'spear')];
    F.surgeDA = [DA(-80, 92, 30, 18, 280, Math.PI * 0.85, II.armor, 'ii', 63, 'mixed'), DA(82, 90, 30, 18, 280, -Math.PI * 0.85, TK, 'tokugawa', 64, 'spear')];
    DA(-140, 44, 30, 20, 220, Math.PI * 0.7, TK, 'todo', 65, 'gun');
    DA(140, 44, 30, 20, 220, -Math.PI * 0.7, TK, 'tokugawa', 66, 'spear');
    camp(rt, { x: -120, z: 170, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: TK,
      general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 12, reserve: 200, runTo: { x: -80, z: 120 } });
    // 真田丸の中の兵（塀の内に並ぶ鉄砲の大勢）
    DA(C.x, C.z - 8, 30, 10, 180, 0, SANADA.armor, 'sanada', 68, 'gun');

    // ---- 味方：前田の先手（山崎長徳の組）・二の手（本多政重）・柵を破る組。槍衾の陣形で並ぶ ----
    F.yam = allyGroup(rt, { faction: 'tokugawa', name: '山崎長徳の組', anchor: { x: SASA.x - 4, z: SASA.z + 32 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山崎長徳', invuln: true, horse: true } }, uS(3), uA(18), uG(6)], MAEDA));
    F.second = allyGroup(rt, { faction: 'tokugawa', name: '本多政重の二の手', anchor: { x: -10, z: SASA.z + 36 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '本多政重', invuln: true, horse: true } }, uS(2), uA(18), uB(5)], MAEDA));
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: SASA.x + 12, z: SASA.z + 40 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14, o: { hat: 'jingasa_n' } }], MAEDA));
    F.rams = [F.ram];
    for (const g of [F.yam, F.second]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    KIT.backOf(rt, F.yam, { flag: 'maeda', armor: TK, kind: 'spear', w: 22, depth: 10, count: 160, gap: 4, seed: 81 });
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SASA.x + 4, z: SASA.z + 36 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // ---- 真田方：塀の内の鉄砲と弓、櫓の上の射手（横矢）、篠山の鉄砲 ----
    F.wallG = enemyGroup(rt, { faction: 'toyotomi', name: '塀の内の鉄砲', anchor: { x: C.x, z: C.z + WALL_R - 4 }, facing: 0, width: 16, spacing: 2.4, aggro: 0, noRout: true },
      dress([uG(9), uB(6)], SANADA));
    F.towerU = [];
    TOWERS.forEach((a, i) => {
      const q = polar(a, WALL_R - 3.5);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '櫓', anchor: q, facing: a, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        dress([uG(2), i % 2 ? uG(1) : uB(1)], SANADA));
      g.units.forEach((u, k) => { u.pos.x = q.x + (k - 1) * 0.7; u.pos.z = q.z; u.speed = u.run = 0; u.tower = q; F.towerU.push(u); });
    });
    for (const u of [...F.wallG.units, ...F.towerU]) { u.group.dmgMult = 0.4; if (u.type === 'gun') u.dmg *= 0.4; }
    F.wallG.fire = false;
    for (const u of F.towerU) u.group.fire = false;

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '前田の先手として、城の南の真田丸の堀へ寄り、柵を破って中の真田勢を崩す', 'main');
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
    const ctx = { faction: 'toyotomi', flag: 'sanada', armor: SANADA.armor, dmg: 0.4, mass: 200, scale: 1.4, look: (l) => dress(l, SANADA),
      friends: () => [F.yam, F.second].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 篠山を取る：夜明け前、丘の上の真田の鉄砲を追い落とす
      DP.fight({ at: SASA, title: '篠山へ', sub: '夜明け前の寄せ', obj: '篠山の真田の鉄砲を追い落とせ', max: 70,
        say: [['山崎長徳', '進め！　篠山の鉄砲を追い落とせ！']],
        foes: () => [{ name: '篠山の真田の鉄砲', from: { x: SASA.x - 6, z: SASA.z - 10 }, list: [uS(1), uG(4), uA(6)], mass: 100, morale: 60 }],
        reward: '篠山を取った', onEnd: (rt2) => this.taunt(rt2) }),
      // ② 挑発に乗って丸の柵の前へ
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.move({ to: { x: 4, z: C.z + FENCE_R + 12 }, label: '真田丸の柵', r: 8, max: 60, obj: '丸の柵の前まで寄せよ',
        say: [['山崎長徳', 'おのれ、言わせておけば……！　柵まで寄せよ！']],
        ambush: { d: 26, say: ['足軽', '柵の外に鉄砲衆が並んでおる！'], foes: () => [gunLine('柵の前の真田の鉄砲衆', { x: -12, z: C.z + FENCE_R + 4 }, 8), { name: '西の口の真田の槍', from: PORT(-1), list: [uS(2), uA(10)], mass: 140 }] },
        onEnd: (rt2) => this.fenceStart(rt2) }),
      // ③ 堀の前：柵を破る組を守り、一斉射撃と横矢に耐える。城内の爆発で井伊・松平が殺到
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: { x: 6, z: C.z + FENCE_R + 10 }, dur: 80, r: 16, label: '柵の前', title: '堀と柵', sub: '塀と櫓から鉄砲が並ぶ',
        obj: '柵を破る組を守り、真田丸の柵を破れ',
        waves: [
          { t: 8, say: ['足軽', '東の口から真田の兵が出てきた！　柵を破る組を狙っておる！'], foes: () => [{ name: '東の口の真田の兵', from: PORT(1), list: [uS(2), uA(10)], mass: 160 }] },
          { t: 30, say: ['山崎長徳', '横の櫓からも撃ってくる！　竹束を前へ！'], foes: () => [gunLine('二の列の真田の鉄砲', { x: 14, z: C.z + FENCE_R + 3 }, 8)] },
          { t: 52, say: ['足軽', '西の口からもじゃ！　横を突かれる！'], foes: () => [{ name: '西の口の真田の兵', from: PORT(-1), list: [uS(2), uA(11)], mass: 180 }] },
        ],
        reward: '堀の前で踏みとどまった', onEnd: (rt2) => this.sortie(rt2) }),
      // ④ 家康の退き命令：真田の打って出を受けて、退き口まで
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: { x: 4, z: RETREAT.z - 22 }, dur: 75, r: 16, label: '退き口', title: '退け', sub: '大御所の下知：寄せ手は引き揚げよ',
        obj: '殿として真田の打って出を受け、味方を退かせよ',
        waves: [
          { t: 6, say: ['足軽', '六文銭の旗！　真田が丸から打って出た！'], foes: () => [{ name: '真田信繁の隊', from: PORT(1), list: [{ type: 'busho', n: 1, o: { name: '真田信繁', horse: true, hat: 'kabuto_f', haori: 0x7a1a12 } }, uS(4), uA(16), uG(4)], mass: 260, noRout: 30, dmg: 0.4 }] },
          { t: 26, say: ['足軽', '西の口からも！　若い将が率いておる！'], foes: () => [{ name: '真田大助の隊', from: PORT(-1), off: { x: -10, z: 0 }, list: [{ type: 'busho', n: 1, o: { name: '真田大助', horse: true, hat: 'kabuto_m' } }, uS(2), uA(12)], mass: 200, noRout: 20, dmg: 0.4 }] },
          { t: 48, say: ['山崎長徳', '柵の外で火縄が光った！　伏せよ！'], foes: () => [gunLine('追い撃つ真田の鉄砲衆', { x: -20, z: C.z + FENCE_R + 8 }, 9)] },
        ],
        reward: '殿を務め、味方を退かせた' }),
    ], (rt2) => this.win(rt2));
  },

  // 篠山はもぬけの殻。真田の兵の挑発（必ず）
  taunt(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.banner('篠山を取った', '真田の兵は丸へ引いていた');
    rt.say('真田の兵', '前田の衆は雉撃ちか！　寄せたければ、この丸まで来てみよ！', 4);
    rt.after(4.5, () => rt.say('足軽', 'あいつら、笑うておる……', 2.6));
    for (const m of F.maedaDA) m.advance(30, 12, {});
  },

  // 柵の前：柵を破る組が柵にとりつく。塀と櫓が撃ち始める（一斉射撃）
  fenceStart(rt) {
    const F = rt.flags;
    F.step = 3; F.fenceT = rt.t; F.volT = rt.t + 6;
    F.wallG.fire = true;
    for (const u of F.towerU) u.group.fire = true;
    const T = F.target, R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (T.alive ? T : null);
    for (const u of R.units) u.aiT = 0;
    const tq = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 };
    rt.marker('fence', tq, '真田丸の柵', { h: 3 });
    rt.say('真田信繁', '引きつけよ。まだ撃つな……', 3);
    rt.after(18, () => this.blast(rt));
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
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: { x: s * 60, z: 44 }, facing: Math.PI, width: 14, aggro: 6, speed: 3.4, morale: 90, fleeDir: { x: s * 0.2, z: 1 }, formation: 'yari' },
        dress([{ type: 'busho', n: 1, o: { name: gen, invuln: true, horse: true } }, uS(2), uA(16)], lk));
      g.order = 'move'; g.dest = polar(s * 1.1, MOAT.r1 + 2);
      F.surge.push(g);
      KIT.backOf(rt, g, { flag: lk.flag, armor: s < 0 ? II.armor : TK, kind: 'mixed', w: 18, depth: 12, count: 140, gap: 4, seed: 72 + s });
    }
    for (const m of F.surgeDA) m.advance(46, 16, { charge: true });
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
    rt.army.play('gun', polar(0, WALL_R), 1.5);
    const shooter = F.wallG.units.find((u) => u.alive) || null;
    let fell = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u.invuln || fell >= 5) continue;
      if (rOf(u.pos.x, u.pos.z) < FENCE_R + 10 && Math.abs(angOf(u.pos.x, u.pos.z)) < SPAN && Math.random() < 0.35) { rt.army.damage(u, u.maxHp * 0.9, shooter, { kind: 'gun', pierce: true }); fell++; }
    }
    const p = rt.player.u;
    if (p.alive && !p.invuln && rOf(p.pos.x, p.pos.z) < FENCE_R + 6 && Math.abs(angOf(p.pos.x, p.pos.z)) < SPAN && Math.random() < 0.5) rt.army.damage(p, p.maxHp * 0.22, shooter, { kind: 'gun' });
    for (const g of F.surge || []) if (!gone(g)) g.morale -= 12;
    if (F.shot === 1) rt.say('真田信繁', '今じゃ、放て！', 2.4);
    else if (F.shot === 3) rt.say('足軽', '堀の底で、味方が折り重なって倒れていく……！', 3.2);
  },

  // 真田の打って出・家康の退き命令（必ず）
  sortie(rt) {
    const F = rt.flags;
    F.step = 4; F.sortieT = rt.t;
    rt.unmark('fence');
    sfx('taiko', 1); sfx('horagai', 0.7);
    rt.say('徳川家康', '……もうよい。力攻めはやめじゃ。寄せ手を引かせよ', 4);
    rt.after(4.5, () => rt.say('山崎長徳', `${nm(rt)}、しんがりじゃ！　味方が退くまで、真田を止めよ！`, 4));
    // 堀へ殺到した寄せ手は撃ち崩されて退く
    F.surgeDA.forEach((m, i) => rt.after(2 + i * 4, () => m.rout({ hideAfter: 50 })));
    for (const g of F.surge || []) if (!gone(g)) { g.order = 'move'; g.dest = { x: g.anchor.x, z: RETREAT.z + 20 }; }
    for (const g of F.rams) if (!gone(g)) { g.order = 'move'; g.dest = { x: 18, z: RETREAT.z + 14 }; }
    rt.after(8, () => F.maedaDA[0].retreat(24, 20));
    for (let i = 0; i < 10; i++) rt.world.addCarrion(C.x + (Math.random() - 0.5) * 70, C.z + MOAT.r1 + Math.random() * 10);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '真田丸の前で殿を務めた', pts: 40 }; }, '殿を務め、味方を退かせた');
    rt.player.u.invuln = true;
    rt.banner('寄せ手、退く', '慶長十九年十二月四日　徳川方、大きく損ず');
    rt.say('山崎長徳', '……ようしのいだ。じゃが、堀の底に、どれだけの者を残してきたか', 4.4);
    // 家康が力攻めをやめ、大筒へ（必ず）
    rt.after(5, () => rt.say('徳川家康', 'あの出丸は落とせぬ。大筒を据えよ。城の奥まで撃ち込め', 4.4));
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
    if (F.step === 3 && rt.t > F.volT) { F.volT = rt.t + 9 + Math.random() * 3; this.volley(rt); }
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
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに退き口を保てなかった');
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
k11_sanadamaru.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '真田大助', g: /大助/ }];

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
