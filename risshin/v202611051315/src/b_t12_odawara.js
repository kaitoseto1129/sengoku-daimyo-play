// ======================================================================
// 豊臣編 12　小田原征伐（天正十八年 1590・四月〜七月五日）　巨大包囲戦・天下統一
// 筋書きの正：docs/chapter2_toyotomi.md の「12. 小田原征伐」
// 秀吉はおよそ二十万で、町ごと堀と土塁で囲んだ小田原城（総構え）を囲む。石垣山に城を築き、木を伐って一夜で現れたように見せる。
// 11/3 p100_t12_odawara（手本 docs/battle_refs/t12_odawara.md）：主人公は秀吉の命で井伊直政の手に加わり、城の東の山王口の外の出丸・篠曲輪を攻める。
//   六月二十二日の雨の夜、井伊勢が堀を渡って篠曲輪を落とし旗を立てたが、城中から出た北条勢に防がれ、後押しが無く退いた（小田原の陣でほぼ唯一の城攻め）。
// 段：①山王川を渡り篠曲輪の木戸へ寄せる ②木戸から打って出た北条勢を迎え撃つ ③退く敵に続いて篠曲輪へ入る（付け入り） ④山王口から出た新手から井伊の旗を守る
//   ⑤直政の下知で山王川の東へ退く ⑥六月二十六日、石垣山の城が姿を見せる ⑦七月五日、官兵衛を本丸の門まで守り届け、開城
// 向き：北が -z。小田原城の本丸は真ん中の北、西（-x）に早川口と早川、南西に石垣山、東（+x）に山王口・篠曲輪・山王川・徳川の陣、南は海。
//   ゲームの 1 はおよそ実の 8m（国土地理院の標高 dem_odawara と同じ縮め）。東の総構えから本丸までは歩く道のりを縮めてある
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, hut, kagaribi, kobune, yagura, castleMat, ishigaki, tenshu, dobei, sumiyagura, kabukimon, solidSeg } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';

// ---- 場所（ゲームの座標） ----
const CASTLE = { x: 51, z: -131 };       // 小田原城の本丸
const KGATE = { x: 41, z: -110 };        // 本丸の南の門の前（官兵衛を届ける所）
const ISHI = { x: -68, z: 118 };         // 石垣山（一夜城）
const GATE = { x: -29, z: -30 };         // 総構えの早川口（西。遠くに見えるだけ）
// ---- 東：山王口・篠曲輪・山王川・井伊の陣・家康の本陣 ----
const SANNO = { x: 92, z: -62 };         // 総構えの山王口
const SANNO_IN = { x: 84, z: -62 };      // 山王口の内（北条の新手が出る所）
const SHINO = { x0: 104, x1: 116, z0: -72, z1: -56 };   // 篠曲輪（山王口の外の出丸。形は推定）
const SHINO_C = { x: 110, z: -64 };
const KIDO = { x: 116, z: -64 };         // 篠曲輪の東の木戸
const KIDO_F = { x: 122, z: -64 };       // 木戸の前（堀と山王川の間）
const II_JIN = { x: 146, z: -80 };       // 井伊直政の陣（徳川勢の一番海寄り）
const IE_JIN = { x: 164, z: -122 };      // 徳川家康の本陣（後ろ）
// 総構えの土塁（東の一辺。北の山から海まで）。堀はその外（東）
const SOGAMAE_E = [[80, -230], [86, -170], [90, -110], [92, -74], [92, -50], [94, -22]];
const MOAT_E = SOGAMAE_E.map(([x, z]) => [x + 8, z]);
const SHINO_HORI = [[[101, -75], [119, -75], [119, -66.6]], [[119, -61.4], [119, -53], [101, -53]]];
const SANNOGAWA = [[132, -230], [130, -150], [128, -90], [126, -60], [125, -24]];
const atShinoGap = (x, z) => Math.abs(z - SHINO_C.z) < 2.6 && (Math.abs(x - SHINO.x1) < 2.5 || Math.abs(x - SHINO.x0) < 2.5);
// 総構えの土塁（西の一辺）。堀はその外（西）。早川口の北で土塁が外へ折れ出て（横矢掛り）、口へ寄る敵を横から撃つ
const SOGAMAE = [[-14, 40], [-26, -10], [-26.6, -13], [-32, -16.5], [-27.6, -21], [-36, -70], [-46, -140], [-44, -230]];
// 早川口の内の土塁（二重外張）：口を入ると正面を塞ぎ、南へ曲がって町へ出る（枡形）
const MASU = [[-20, -31], [-20, -17], [-25, -15.5]];
// 北条の頃の本丸（石垣も天守も無い土の城）。平らな台を土塁で囲み、外を水堀。後ろ（北西）に詰の城の八幡山
const HON = { x0: CASTLE.x - 16, x1: CASTLE.x + 16, z0: CASTLE.z - 12, z1: CASTLE.z + 12 };
const HON_HORI = [[HON.x0 - 4, HON.z0 - 4], [HON.x1 + 4, HON.z0 - 4], [HON.x1 + 4, HON.z1 + 4], [HON.x0 - 4, HON.z1 + 4], [HON.x0 - 4, HON.z0 - 4]];
const HACHIMAN = { x: CASTLE.x - 40, z: CASTLE.z - 26 };
// 石垣山城（発掘と享保の古絵図）：尾根の頂の本城曲輪（北西の角に天守台）、北に一段低い馬屋曲輪、東に南曲輪。野面積みの石垣
const ISHI_K = [
  { x0: -78, x1: -58, z0: 106, z1: 122 },   // 本城曲輪
  { x0: -76, x1: -62, z0: 92, z1: 103.5 },  // 馬屋曲輪（二の丸）
  { x0: -56.5, x1: -46, z0: 108, z1: 121 }, // 南曲輪
];
const rectD = (R, x, z) => Math.max(R.x0 - x, x - R.x1, R.z0 - z, z - R.z1);   // 曲輪の縁からの距離（内は負）
const rectPts = (R, p = 0) => [[R.x0 - p, R.z0 - p], [R.x1 + p, R.z0 - p], [R.x1 + p, R.z1 + p], [R.x0 - p, R.z1 + p], [R.x0 - p, R.z0 - p]];
const MOAT = SOGAMAE.map(([x, z]) => [x - 8, z]);
// 早川（西の山から海へ）
const HAYAKAWA = [[-235, -10], [-170, 6], [-110, 22], [-60, 36], [-20, 44], [6, 52]];
// 官兵衛の道（山王口の外の土橋から町を抜けて本丸の門へ）
// 官兵衛は供の列の後ろ（行き先から 10 ほど東）を歩くので、口の内の辻は山王口より深く取る（浅いと官兵衛が口の外に残る）
const ENVOY = [{ x: 100, z: -62 }, { x: 77, z: -61 }, { x: 74, z: -80 }, { x: 60, z: -98 }, KGATE];
// 海岸線（これより南東は海）。早川の河口から北東へは城の南の浜、南西へは石垣山の東の裾を回って真鶴の方へ下る（前は西がずっと z=46 で、石垣山が海に沈んでいた）
const coastZ = (x) => (x > -2 ? 46 - (x + 2) * 0.62 : 46 + (-2 - x) * 3.4);

const TOYO = { flag: 'toyotomi' };
const KURODA = { flag: 'kuroda' };
const II = { armor: 0xa52b1c, lace: 0xb8342a, flag: 'ii' };   // 井伊の赤備え（天正十年から。史実の家の色）
const TOKU = { flag: 'tokugawa' };
const HOJO = { armor: 0x2e2a24, lace: 0x8a7a3a, flag: 'hojo' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, sl) => clamp01((hw + sl - d) / sl);

// ---- 地形：手で描いた形に、国土地理院の起伏（戦場の外だけ）を足す ----
let dem = null;
// 支度で標高を読む（11/5 共通の係：素材 asset_dem_odawara.js を tools/dem.mjs で作り、読む表に足した）
BATTLE_ASSETS.t12_odawara = Object.freeze([...assetsForBattle(''), 'dem_odawara']);
useTerrain('dem_odawara', (data) => { dem = data; });
function rawHeight(x, z) {
  let h = 0.4 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 西と北の山（箱根の裾）・石垣山・八幡山（城の北西の丘。総構えの北西の山へ尾根で続く）
  h += Math.max(0, -x - 130) * 0.16 + Math.max(0, -z - 150) * 0.1 * clamp01((-x - 40) / 60);
  h += 30 * gauss(x, z, ISHI.x, ISHI.z, 1800) + 8 * gauss(x, z, ISHI.x - 40, ISHI.z + 30, 2600);
  h += 9 * gauss(x, z, HACHIMAN.x, HACHIMAN.z, 1100) + 6 * gauss(x, z, HACHIMAN.x - 34, HACHIMAN.z - 26, 1800);
  // 本丸：平らな台（高さ 3.5）の縁に土塁、外に水堀（流れは streams）
  const dh = rectD(HON, x, z);
  h += 3.5 * clamp01((3 - dh) / 4) + 1.6 * trap(Math.abs(dh + 1.4), 0.8, 1.2);
  // 総構え：土塁（高さ 3）と、外の堀（深さ 2.4）。早川口は土塁が切れ、堀は土橋。口の内に枡形の土塁
  const atGate = Math.hypot(x - GATE.x, z - GATE.z);
  h += 3 * trap(distToPolyline(x, z, SOGAMAE), 2.2, 2.5) * clamp01((atGate - 5) / 3);
  h += 2.6 * trap(distToPolyline(x, z, MASU), 1.6, 2);
  h -= 2.4 * trap(distToPolyline(x, z, MOAT), 2.4, 1.6) * clamp01((atGate - 4) / 2);
  // 早川の河原と流れ
  h -= 1.4 * trap(distToPolyline(x, z, HAYAKAWA), 3, 4);
  // 東の総構え：土塁（高さ 3）と外の堀。山王口は土塁が切れ、堀は土橋で篠曲輪の西の口へ渡る
  if (x > 60) {
    const atS = Math.hypot(x - SANNO.x, z - SANNO.z), dobashi = Math.abs(z - SANNO.z) < 3 && x > SANNO.x && x < SHINO.x0 + 1;
    h += 3 * trap(distToPolyline(x, z, SOGAMAE_E), 2.2, 2.5) * clamp01((atS - 5) / 3);
    if (!dobashi) h -= 2.4 * trap(distToPolyline(x, z, MOAT_E), 2.4, 1.6);
    // 篠曲輪：一段高い台（1.2）の縁に土塁（1.3）。東の木戸と西の口は切る。三方の水堀と山王川は streams
    const ds = rectD(SHINO, x, z);
    h += 1.2 * clamp01((2 - ds) / 3) + (atShinoGap(x, z) ? 0 : 1.3 * trap(Math.abs(ds + 1), 0.6, 1));
    h -= 1.2 * trap(distToPolyline(x, z, SANNOGAWA), 2.5, 3);
  }
  // 海へ下る浜
  const cz = coastZ(x);
  if (z > cz - 10) h = h * clamp01((cz - z) / 10) - 1.6 * clamp01((z - cz + 2) / 8);
  // 国土地理院の起伏は西と北の山（箱根の裾）だけ。東の山王川の低地は平ら
  if (dem) h += demRelief(dem, x, z, { xy: 8, cx: -40, cz: -40, inner: 150, fade: 50, scale: 0.12 }) * clamp01((60 - x) / 30);
  return h;
}
// 石垣山の曲輪は尾根を削って平らにし、縁を石垣で切り立てる（曲輪の高さは真ん中の山の高さ）
function height(x, z) {
  let h = rawHeight(x, z);
  for (const R of ISHI_K) {
    const d = rectD(R, x, z);
    if (d > 24) continue;
    const top = R.top ?? rawHeight((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
    if (dem) R.top = top;
    // 内は平ら・縁は石垣の面（高さ 3.5）・その下は盛り土の裾（石垣が宙に浮かない）
    if (d <= 0) h = top;
    else if (d < 0.6) h = top - 3.5 * (d / 0.6);
    else h = Math.max(h, top - 3.5 - (d - 0.6) * 1.1);
  }
  return h;
}

// ---- 一夜城：石垣山の頂の白い壁と櫓。はじめは手前の林に隠れる ----
function ichiyajo(rt) {
  const W = rt.world, F = rt.flags;
  const castle = new THREE.Group();
  const [HJ, UM, MN] = ISHI_K;
  // 曲輪の縁の野面積みの石垣（割っただけの安山岩・穴太衆）。外へ向けて積む
  // 天端は曲輪の高さに決め打ち（地面の格子は 2.5 ごとなので、縁の線の上で読むと低く出る）
  for (const R of ISHI_K) castle.add(ishigaki(W, rectPts(R, 0.3), { kind: 'nozura', out: -1, topY: W.heightAt((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2) + 0.3, minH: 3.6, maxH: 6 }));
  // 天守台の上の望楼型の三重の天守（犬山・丸岡に近い形。瓦葺・白壁）。本城曲輪の北西の角
  castle.add(tenshu(W, HJ.x0 + 5, HJ.z0 + 4.5, { floors: 3, b: 8, base: 2.6, borou: true, stone: 'nozura', name: '石垣山の天守' }));
  // 白い漆喰の塀（小田原から見える北の面と東西）と、角の櫓
  const wallIn = 0.9;
  for (const [R, sides] of [[HJ, 'NEW'], [UM, 'NEW'], [MN, 'NE']]) {
    const x0 = R.x0 + wallIn, x1 = R.x1 - wallIn, z0 = R.z0 + wallIn, z1 = R.z1 - wallIn;
    if (sides.includes('N')) castle.add(dobei(W, [R === HJ ? x0 + 10 : x0, z0, x1, z0], { shikkui: true, hikae: 1 }));
    if (sides.includes('E')) castle.add(dobei(W, [x1, z0, x1, z1], { shikkui: true, hikae: 1 }));
    if (sides.includes('W')) castle.add(dobei(W, [x0, R === HJ ? z0 + 9 : z0, x0, z1], { shikkui: true, hikae: 1 }));
  }
  for (const [x, z] of [[HJ.x1 - 3, HJ.z0 + 2.6], [UM.x0 + 3, UM.z0 + 2.6], [UM.x1 - 3, UM.z0 + 2.6], [MN.x1 - 3, MN.z0 + 2.6]]) castle.add(sumiyagura(W, x, z, { w: 5, d: 4, base: 0.5, stone: 'nozura' }));
  for (const m of [castle, ...castle.children]) m.userData.camBlock = false;
  // 陣から石垣山は霧の見通し（110m）の先。城だけは霧に消さず、遠くの山と同じ青い霞の色を混ぜて見せる（材質はこの戦だけの写し）
  const haze = new THREE.Color(0xaab4bc), done = new Map();
  castle.traverse((o) => {
    if (!o.material) return;
    const one = (m) => { if (!done.has(m)) { const c = m.clone(); c.fog = false; if (c.color) c.color.lerp(haze, 0.42); done.set(m, c); } return done.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  castle.visible = false;
  rt.scene.add(castle);
  // 手前（北）の林：伐られると消える。天守の高さまで隠れる大きな杉
  const cone = new THREE.ConeGeometry(2.6, 15, 6);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2c3a24, roughness: 1 });
  const N = 72, wood = new THREE.InstancedMesh(cone, leaf, N), m4 = new THREE.Matrix4();
  const cx = (HJ.x0 + MN.x1) / 2, cz = (UM.z0 + HJ.z1) / 2;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI * 1.02 + (i / N) * Math.PI * 1.04, r = 24 + (i % 3) * 3;
    const x = cx + Math.cos(a) * r * 0.85, z = cz + Math.sin(a) * r;
    m4.makeScale(1, 1 + (i % 4) * 0.12, 1).setPosition(x, W.heightAt(x, z) + 7, z);
    wood.setMatrixAt(i, m4);
  }
  rt.scene.add(wood);
  F.ichiya = { castle, wood };
}

// ---- 総構えの塀と町（見た目だけ） ----
function sogamae(rt) {
  const W = rt.world;
  for (const [x, z] of [[-24, -2], [-31, -48], [-38, -90], [-44, -128]]) rt.scene.add(nobori(W, x + 2, z, 'hojo', 5));
  for (const [x, z, r] of [[-6, -48, 0.2], [4, -58, -0.3], [-2, -74, 0.4], [10, -70, 0.1], [16, -88, -0.2], [-10, -88, 0.3], [6, -40, 0.5], [22, -66, 0]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
  rt.scene.add(nobori(W, KGATE.x + 4, KGATE.z - 3, 'hojo', 7));
  rt.scene.add(nobori(W, KGATE.x - 4, KGATE.z - 3, 'hojo', 7));
}

// ---- 総構えの土塁の上の板塀（史実の目玉：町ごと囲む九km の総構え）。柱と板を一つの形にまとめて一回で描く。早川口は開ける ----
function sogamaeWall(rt) {
  // 本物に寄せる（小田原城の総構えの復元図・山中城の土塁の上の塀の復元）：下見板を横に重ね張りした板塀に、板葺の両流れの笠と、
  //   一間（1.8m）ごとの控え柱。板は castleMat('shitami')（城の下見板と同じ絵・材質を使い回す）。色は柱間ごとに褪せ方を変える
  const W = rt.world, parts = [], wood = [];
  const col = (g, r, gg, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const uvs = (g, w, h, d) => { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 2.4, uv.getY(i) * dims[f][1] / 2.4); } return g; };
  // bs：控え柱を立てる内の側（1＝線の進む向きの左）。狭間は外の面に、柱間ごとに二つ（城そのものが兵器：板塀の穴から撃つ）
  const line = (pts, bs, skip) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 3));
      const ry = Math.atan2(bx - ax, bz - az), sl = L / n;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (skip && skip(x, z)) continue;
        const y = W.heightAt(x, z) - 0.15, f = 0.82 + (Math.sin(k * 2.3 + i) * 0.5 + 0.5) * 0.3;
        const b = uvs(new THREE.BoxGeometry(0.12, 2.5, sl + 0.04), 0.12, 2.5, sl + 0.04); b.rotateY(ry); b.translate(x, y + 1.25, z); parts.push(col(b, f, f * 0.97, f * 0.93));
        // 板葺の笠：両へ流れる二枚の板（棟の木を挟む）
        for (const sd of [-1, 1]) { const c = new THREE.BoxGeometry(0.42, 0.05, sl + 0.12); c.rotateZ(sd * 0.42); c.translate(sd * 0.19, 0, 0); c.rotateY(ry); c.translate(x, y + 2.58, z); wood.push(col(c, 0.36 * f, 0.33 * f, 0.29 * f)); }
        const ridge = new THREE.BoxGeometry(0.1, 0.1, sl + 0.12); ridge.rotateY(ry); ridge.translate(x, y + 2.68, z); wood.push(col(ridge, 0.25, 0.22, 0.19));
        const q = new THREE.BoxGeometry(0.2, 2.75, 0.2); q.rotateY(ry); q.translate(x - Math.sin(ry) * sl / 2, y + 1.3, z - Math.cos(ry) * sl / 2); wood.push(col(q, 0.42 * f, 0.36 * f, 0.29 * f));
        // 鉄砲狭間（四角）と矢狭間（縦長）の黒い穴
        for (const [o, w, h] of [[-0.22, 0.26, 0.26], [0.22, 0.16, 0.5]]) { const s = new THREE.BoxGeometry(0.03, h, w); s.translate(0.075 * bs, 0, o * sl); s.rotateY(ry); s.translate(x, y + 1.45, z); wood.push(col(s, 0.05, 0.045, 0.04)); }
        // 控え柱（内へ斜めに支える）
        if (k % 2 === 0) { const h = new THREE.BoxGeometry(0.12, 2.2, 0.12); h.rotateZ(-0.5 * bs); h.translate(-0.62 * bs, 0.95, 0); h.rotateY(ry); h.translate(x - Math.sin(ry) * sl / 2, y, z - Math.cos(ry) * sl / 2); wood.push(col(h, 0.4 * f, 0.34 * f, 0.27 * f)); }
      }
    }
  };
  line(SOGAMAE, 1, (x, z) => Math.hypot(x - GATE.x, z - GATE.z) < 8);
  line(MASU, -1);
  // 本丸の土塁の上の板塀（南西の大手の口は開ける）
  line(rectPts(HON, -1.4), 1, (x, z) => Math.hypot(x - (HON.x0 + 6), z - HON.z1) < 3.5);
  // 東の総構え（山王口は開ける）と、篠曲輪の土塁の上の板塀（東の木戸と西の口は開ける）
  const sannoGap = (x, z) => Math.hypot(x - SANNO.x, z - SANNO.z) < 5;
  line(SOGAMAE_E, -1, sannoGap);
  line(rectPts(SHINO, -0.9), 1, atShinoGap);
  // 塀は通り抜けられない（kaito AP11）：口だけを通れる
  const solidLine = (pts, skip) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        if (skip(mx, mz)) continue;
        solidSeg(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.3);
      }
    }
  };
  solidLine(SOGAMAE_E.slice(1, 5), sannoGap);
  solidLine(rectPts(SHINO, -0.9), atShinoGap);
  rt.scene.add(kabukimon(W, SANNO.x, SANNO.z, 7, Math.PI / 2));
  rt.scene.add(kabukimon(W, KIDO.x - 0.9, KIDO.z, 4.6, Math.PI / 2));
  rt.scene.add(yagura(W, 88, -71));
  // 篠曲輪の中には櫓を建てない（狭い出丸で、木戸のそばの櫓の床がカメラの上をふさいだ）
  for (const [x, z] of [[SHINO.x1 - 2, SHINO.z1 - 2], [SHINO.x0 + 3, SHINO.z0 + 2], [88, -54]]) rt.scene.add(nobori(W, x, z, 'hojo', 6));
  // 総構えの内の東の町（板葺の町家。官兵衛の通る道は空ける）
  for (const [x, z, r] of [[80, -50, 0.1], [70, -66, -0.2], [84, -84, 0.3], [56, -78, 0.05], [50, -95, -0.25], [72, -104, 0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
  for (const [list, mat] of [[parts, castleMat('shitami')], [wood, new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a7a64 })]]) {
    const geo = mergeGeometries(list.map((g) => g.toNonIndexed())); for (const g of list) g.dispose();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    m.userData.camBlock = true;   // 塀の向こうへカメラが抜けて画面が塀でふさがらないように
    rt.scene.add(m);
  }
  // 土塁の上の物見の櫓（遠くから総構えの線が分かるように）
  for (const [x, z] of [[-18, 22], [-34, -46], [-40, -98], [-45, -160]]) rt.scene.add(yagura(W, x + 3, z));
  // 早川口：冠木門と、北の折れ（横矢）の上の櫓。口へ寄る者を正面と横から撃つ
  rt.scene.add(kabukimon(W, GATE.x + 0.6, GATE.z, 7, Math.PI / 2 + Math.atan2(36 - 27.6, 70 - 21)));
  rt.scene.add(yagura(W, -29.5, -16.5));
  // 北条の本丸：板葺の主殿と館、土塁の角の物見櫓、後ろの八幡山（詰の城）の櫓。白い天守と石垣は江戸の姿なので建てない
  rt.scene.add(hut(W, CASTLE.x + 3, CASTLE.z - 2, 14, 9, 0, { roof: 0x5a5046 }));
  rt.scene.add(hut(W, CASTLE.x - 8, CASTLE.z + 5, 8, 6, Math.PI / 2, { roof: 0x5a5046 }));
  for (const [x, z] of [[HON.x0 + 2, HON.z0 + 2], [HON.x1 - 2, HON.z0 + 2], [HON.x1 - 2, HON.z1 - 2], [HON.x0 + 2, HON.z1 - 2], [HACHIMAN.x, HACHIMAN.z]]) rt.scene.add(yagura(W, x, z));
  for (const [x, z] of [[HON.x0 + 3, HON.z1 - 4], [HON.x0 + 9, HON.z1 - 4], [HACHIMAN.x + 3, HACHIMAN.z + 2]]) rt.scene.add(nobori(W, x, z, 'hojo', 7));
}

// 11/3 p100（kaito AA・AF・AQ6）：前は総構えを囲む陣の列・地平の軍勢（軽い作り）と、早川口の作り物の斬り合いで囲みを見せていた。
//   近づくと消える兵は置かない。見える兵は全部本物（井伊勢・家康の本陣・篠曲輪の守り・本丸の旗本）。二十万の囲みは陣幕・幟・海の船と、上の人数で伝える

// ---- 徳川の陣：井伊直政の陣（海寄り）と、後ろの家康の本陣（陣幕・旗本） ----
function camps(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, II_JIN.x + 8, II_JIN.z - 2, 12, 9, 4, { mon: 'ii' }));
  for (const [x, z] of [[II_JIN.x - 2, II_JIN.z - 10], [II_JIN.x - 2, II_JIN.z + 8], [II_JIN.x + 10, II_JIN.z - 14]]) rt.scene.add(nobori(W, x, z, 'ii', 6));
  for (const [x, z] of [[II_JIN.x + 2, II_JIN.z - 4], [II_JIN.x + 2, II_JIN.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  rt.scene.add(jinmaku(W, IE_JIN.x + 4, IE_JIN.z, 16, 12, 5, { mon: 'tokugawa' }));
  for (const [x, z] of [[IE_JIN.x - 6, IE_JIN.z - 10], [IE_JIN.x - 6, IE_JIN.z + 10], [IE_JIN.x - 12, IE_JIN.z], [IE_JIN.x + 6, IE_JIN.z - 16]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 7));
  for (const [x, z] of [[IE_JIN.x - 4, IE_JIN.z - 5], [IE_JIN.x - 4, IE_JIN.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  // 囲みの豊臣方の陣（総構えの北と西の外）：陣幕と幟だけ。兵は置かない
  for (const [x, z, f] of [[-70, -20, 'toyotomi'], [-74, -110, 'toyotomi'], [-70, -165, 'toyotomi'], [120, -170, 'tokugawa']]) {
    rt.scene.add(jinmaku(W, x, z, 12, 9, 4, { mon: f }));
    rt.scene.add(nobori(W, x + 6, z + 6, f, 6)); rt.scene.add(nobori(W, x - 6, z + 6, f, 6));
  }
  // 陣幕の中に人がいない陣は意味が無い（kaito AV18・BH1）：囲みの陣それぞれに見張りの兵を置く
  const F = rt.flags;
  F.watch = [[-70, -20, TOYO], [-74, -110, TOYO], [-70, -165, TOYO], [120, -170, TOKU]].map(([x, z, lk], i) =>
    allyGroup(rt, { faction: 'oda', name: '陣の見張り', anchor: { x: x + 1, z }, facing: i < 3 ? Math.PI / 2 : -Math.PI / 2, width: 5, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], lk)));
  for (const g of F.watch) for (const u of g.units) u.invuln = true;
}

// ---- 海の囲み：相模の海に並ぶ豊臣の水軍の船（見た目だけ） ----
function fleet(rt) {
  const W = rt.world;
  for (const [x, z, r] of [[-6, 76, 0.4], [14, 66, 0.2], [34, 52, -0.1], [56, 40, -0.3], [76, 28, -0.5], [24, 88, 0.1], [50, 70, -0.2], [80, 52, -0.4], [100, 30, -0.6]]) {
    if (z < coastZ(x) + 6) continue;
    const b = kobune(x, Math.max(-1.2, W.heightAt(x, z)) + 0.3, z, Math.PI * 0.75 + r, 9);
    if (b) rt.scene.add(b);
  }
}

// ---- 段 ⑤：官兵衛を城の門まで守り届ける（使いが討たれたら負け） ----
function escort() {
  return {
    kind: 'escort', max: 300, idleAdvance: false,   // 使いは自分が付き添う間だけ歩く。止まった間に段を飛ばして負けにしない
    start(rt, C) {
      const F = rt.flags;
      const st = ENVOY[0];
      C.at = st; C.goal = st; C.i = 1; C.groups = []; C.waves = [8, 26, 44];   // 道が短いので、三つの寄せが門までに必ず出るように
      F.envoy = allyGroup(rt, { faction: 'oda', name: '黒田官兵衛の使い', anchor: { ...st }, fixed: true, noGuard: true, noAI: true, facing: -Math.PI / 2, width: 4, aggro: 0, noRout: true, morale: 100 },
        dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', hat: 'kabuto_m', haori: 0x2a2a2a, horse: false } }, { type: 'samurai', n: 3 }], KURODA));   // 供は少なく（説きに入る使い。守るのは自分と手勢）
      // 官兵衛は刀を預けた使いとして徒で城へ入る（開城の談判。馬は門の外に置く）
      F.envoy.fixed = false;   // 置く所は山王口の外の土橋（隠れた所へずらさない）。置いた後は歩く
      F.kanU = F.envoy.units[0];
      F.kanU.maxHp = (F.kanU.maxHp || 100) * 3; F.kanU.hp = F.kanU.maxHp;
      F.envoy.defMult = 1.6;
      sfx('horagai', 0.6);
      rt.say('黒田官兵衛', '刀は預けて参る。氏政殿・氏直殿に会うまで、道を開けてくだされ', 4);
      rt.obj('dp', '黒田官兵衛を守り、山王口から本丸の門まで連れて行け', 'main');
      // 印は一つ（kaito AV15）：官兵衛から離れている間は官兵衛の上、そばにいる間は本丸の門
      C.near = true;
      rt.marker('dp', () => (C.near ? KGATE : F.kanU.pos), () => (C.near ? '本丸の門' : '黒田官兵衛'), { h: 3 });
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, k = F.kanU;
      if (!k.alive) return true;
      // 抗う北条の侍が、町の辻から使いを狙う
      if (C.waves.length && el >= C.waves[0]) {
        C.waves.shift();
        // 本丸の方の町の辻から（使いの次の行き先の先。塀の外の向こう側には出さない）
        const nx = ENVOY[Math.min(C.i + 1, ENVOY.length - 1)], from = { x: nx.x - 8, z: nx.z - 12 };
        const g = enemyGroup(rt, { faction: 'hojo', name: '抗う北条の侍', anchor: from, facing: Math.PI / 2, order: 'attack', seekRange: 50, aggro: 14, width: 8, morale: 60, dmgMult: 0.42 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], HOJO));
        g.anchor = { x: k.pos.x, z: k.pos.z };
        C.groups.push(g);
        rt.say('北条の侍', '降るなど許さぬ！　使いを討て！', 3);
      }
      for (const g of C.groups) if (!gone(g) && g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
      // 自分が近くにいる間だけ、使いは前へ進む
      const p = rt.player.u.pos, tgt = ENVOY[Math.min(C.i, ENVOY.length - 1)];
      const near = C.near = Math.hypot(p.x - k.pos.x, p.z - k.pos.z) < 18;
      const threat = C.groups.some((g) => !gone(g) && g.units.some((u) => u.alive && !u.fleeing && Math.hypot(u.pos.x - k.pos.x, u.pos.z - k.pos.z) < 10));
      if (near && !threat) F.envoy.anchor = { x: tgt.x, z: tgt.z };
      // 官兵衛本人が辻に着いたら次の辻へ（列の真ん中で数えると、官兵衛が山王口を抜ける前に次へ向き、総構えの塀に阻まれて止まった）
      if (Math.hypot(k.pos.x - tgt.x, k.pos.z - tgt.z) < 11 && C.i < ENVOY.length - 1) C.i++;
      const left = Math.hypot(k.pos.x - KGATE.x, k.pos.z - KGATE.z);
      C.goal = threat || !near ? k.pos : tgt;
      rt.objProgress('dp', near ? `門まで あと${Math.round(left)}m` : '官兵衛のそばへ');
      return (F.envoyDone = C.i >= ENVOY.length - 1 && left < 12 && !threat);
    },
    end(rt, C) {
      const F = rt.flags;
      rt.unmark('dp');
      for (const g of C.groups) if (!gone(g)) { g.noRout = false; g.morale = 0; }
      if (F.kanU.alive) { rt.objDone('dp'); rt.award((t) => t.side.push('開城の使いを守り届けた'), '開城の使いを守り届けた'); }
    },
  };
}

// 篠曲輪の守り：東の木戸の内の板塀に鉄砲と槍が並び、寄せる者を撃つ（城そのものが兵器・kaito BA5）
function shinoGuard(rt) {
  const F = rt.flags;
  F.shinoGuns = enemyGroup(rt, { faction: 'hojo', name: '篠曲輪の鉄砲', anchor: { x: SHINO.x1 - 2.2, z: SHINO_C.z }, facing: Math.PI / 2, width: 12, fixed: true,
    noRout: true, order: 'hold', aggro: 0, formation: 'line', morale: 80, dmgMult: 0.2, fire: true },
  // 雨の夜は火縄と口薬が湿り、鉄砲は撃ちにくい（篠曲輪の夜討ちは六月二十二日の夜半の雨）。狭間は弓を主に、鉄砲は雨覆いの三挺だけ
  // 守りの将は山角康定（その子と助勢の高橋高盛も籠った。康定は生き延びて戦の後も仕えたので討てない）
  dress([{ type: 'busho', n: 1, o: { name: '山角康定', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'bow', n: 6 }, { type: 'gun', n: 3 }, { type: 'samurai', n: 2 }], HOJO));
  F.shinoGuns.secKind = 'bow';
}

// 本陣の将は後ろで旗本に守られ、前へ出ない（kaito AR3・AV7）。家康は東の本陣、北条の当主は本丸
function seats(rt) {
  const F = rt.flags;
  F.ieyasu = allyGroup(rt, { faction: 'oda', name: '家康の旗本', anchor: { x: IE_JIN.x - 2, z: IE_JIN.z }, facing: -Math.PI / 2, width: 8, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
    dress([{ type: 'busho', n: 1, o: { name: '徳川家康', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'samurai', n: 22 }, { type: 'ashigaru', n: 30 }, { type: 'gun', n: 8 }], TOKU));
  for (const u of F.ieyasu.units) u.invuln = true;
  // 総大将は本陣の床几に座る（kaito AV7。b_tottori の seatedCamp と同じ印）
  const sit = (u) => { if (u) { u._crouch = true; u._nest = true; } };
  sit(F.ieyasu.units[0]);
  F.hojo = enemyGroup(rt, { faction: 'hojo', name: '北条の本丸', anchor: { ...CASTLE }, facing: Math.PI / 2, width: 8, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
    dress([...['北条氏直', '北条氏政', '北条氏照'].map((name) => ({ type: 'busho', n: 1, o: { name, hat: 'kabuto_m', invuln: true, horse: false } })), { type: 'samurai', n: 18 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], HOJO));
  // 本丸の奥の当主は堀の向こうで討てない。遠くから名札と命の棒を出さない（kaito AS：討てない総大将を討てる所に見せない）
  for (const u of F.hojo.units) { u.invuln = true; if (u.name) u.isSub = true; }
  for (const u of F.hojo.units) if (u.type === 'busho') sit(u);
}

// 時が飛ぶ所：夜討ちの残りの北条勢は城の中へ引き揚げた（本丸の当主と旗本は残す）
function clearFoes(rt) {
  const keep = new Set(rt.flags.hojo ? rt.flags.hojo.units : []);
  for (const u of rt.army.units.slice()) if (u.team === 1 && !u.gone && !keep.has(u)) rt.army.despawn(u);
}
// 時が飛ぶ所：本人と手勢を次の目標のそばへ移す（無駄に歩かせない・kaito AT10）
function warpTo(rt, x, z, heading) {
  clearFoes(rt);
  const P = rt.player.u, W = rt.world;
  const put = (u, dx, dz) => { u.pos.x = x + dx; u.pos.z = z + dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.target = null; u.moveTo = null; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } };
  put(P, 0, 0);
  if (rt.player.vel) { rt.player.vel.x = 0; rt.player.vel.z = 0; }
  rt.player.lock = null;
  if (heading != null) rt.player.heading = heading;
  let i = 0;
  for (const g of [...(rt.squadGroups || []), rt.flags.mine]) if (g && g.units) {
    for (const u of g.units) if (u.alive && !u.isPlayer) { put(u, 4 + (i % 5) * 1.4, -6 + Math.floor(i / 5) * 1.4); i++; }
    g.anchor = { x: x + 6, z: z - 2 };
    if (g.order !== 'follow') g.order = 'hold';
  }
}

const t12_odawara = {
  spawn: { x: II_JIN.x + 2, z: II_JIN.z + 4, heading: -Math.PI / 2 },
  noWake: true,
  noFrontFill: true,         // 見える兵は全部本物（奥の軽い乱戦を置かない。11/3 p100）
  kumiLead: false,           // 行き先の印は今の目標の金の▼一つだけ（kaito AV15）
  noGoalCount: true,
  goalSignNameOnly: true,
  noLeaderFollow: true,
  missionPin: () => null,     // 白い旗のピンは出さない。行き先は今の目標の▼と名の札の一つだけ（kaito AV15・⑧）
  world: {
    seed: 1590,
    battleViewDistance: 110,
    time: 'storm',
    paths: [[[II_JIN.x + 20, II_JIN.z], [II_JIN.x, II_JIN.z + 2], [KIDO_F.x + 4, KIDO_F.z], [KIDO.x, KIDO.z], [SHINO_C.x, SHINO_C.z], [SANNO.x, SANNO.z], [SANNO_IN.x, SANNO_IN.z], [74, -80], [60, -98], [KGATE.x, KGATE.z]],
      [[II_JIN.x, II_JIN.z], [IE_JIN.x, IE_JIN.z]]],
    height,
    tint(x, z, h, c) {
      // 海と浜
      const cz = coastZ(x);
      if (z > cz - 4) { const k = clamp01((z - cz + 4) / 6); c.setRGB(c.r * (1 - k) + 0.16 * k, c.g * (1 - k) + 0.24 * k, c.b * (1 - k) + 0.28 * k); return; }
      if (z > cz - 12) { const k = 0.6; c.setRGB(c.r * (1 - k) + 0.55 * k, c.g * (1 - k) + 0.5 * k, c.b * (1 - k) + 0.4 * k); return; }
      // 土塁の土と堀の泥（西と東の総構え・篠曲輪の縁）
      const ds = Math.min(distToPolyline(x, z, SOGAMAE), distToPolyline(x, z, SOGAMAE_E), Math.abs(rectD(SHINO, x, z) + 1));
      const dm = Math.min(distToPolyline(x, z, MOAT), distToPolyline(x, z, MOAT_E));
      if (ds < 4.5) c.setRGB(c.r * 0.7 + 0.12, c.g * 0.68 + 0.09, c.b * 0.6 + 0.05);
      else if (dm < 3.6) c.setRGB(c.r * 0.45 + 0.08, c.g * 0.48 + 0.09, c.b * 0.45 + 0.07);
      // 早川と山王川の河原
      if (distToPolyline(x, z, HAYAKAWA) < 6 || distToPolyline(x, z, SANNOGAWA) < 4.5) c.setRGB(c.r * 0.5 + 0.25, c.g * 0.5 + 0.24, c.b * 0.5 + 0.21);
      if (h > 8) c.setRGB(c.r * 0.84, c.g * 0.93, c.b * 0.82);
    },
    clear: (x, z) => (x > -130 && x < 40 && z > -120 && z < 30) || (x > -92 && x < -36 && z > 76 && z < 125) || rectD(HON, x, z) < 7 || (x > 40 && x < 176 && z > -140 && z < -20),
    streams: [{ pts: HAYAKAWA, w: 5, depth: 1.0 }, { pts: HON_HORI, w: 2.2, depth: 1.6 }, { pts: SANNOGAWA, w: 3.2, depth: 0.7 },
      ...SHINO_HORI.map((pts) => ({ pts, w: 2.4, depth: 1.2 }))],
    trees: 380,
    tufts: 3600,
    // 石垣山の曲輪と北の面（小田原から見える側）は clear で伐られた後にする（伐る前の林は ichiyajo の杉）
    treeDensity: (x, z) => (z > coastZ(x) - 8 ? 0 : Math.hypot(x - ISHI.x, z - ISHI.z) < 55 ? 0.9 : x < -130 || z < -150 ? 0.8 : 0.15),
    groves: [{ x: -150, z: -80, r: 16, n: 22 }, { x: -60, z: 70, r: 12, n: 16 }, { x: ISHI.x + 30, z: ISHI.z + 10, r: 14, n: 18 }],
    // 北条方は総構えの内へ、豊臣方は東の端へ逃げ切る
    fleeOut: (x, z, team) => (team === 1 ? x < SANNO.x - 10 : x > 172),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.day = 0;
    // ---- 豊臣方：自分の手勢と、井伊直政の手（赤備え） ----
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: II_JIN.x - 4, z: II_JIN.z + 8 }, facing: -Math.PI / 2, width: 12, aggro: 9, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], TOYO));
    F.ii = allyGroup(rt, { faction: 'oda', name: '井伊勢', anchor: { x: II_JIN.x - 6, z: II_JIN.z - 6 }, facing: -Math.PI / 2, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '井伊直政', hat: 'kabuto_tentsuki', haori: 0x7a1a12, horse: true, invuln: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }], II));
    F.naomasa = F.ii.units[0];
    F.ii2 = allyGroup(rt, { faction: 'oda', name: '井伊勢の二の手', anchor: { x: II_JIN.x - 2, z: II_JIN.z - 18 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }], II));
    for (const g of [F.mine, F.ii, F.ii2]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: II_JIN.x + 2, z: II_JIN.z + 10 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    camps(rt);
    sogamae(rt);
    sogamaeWall(rt);
    ichiyajo(rt);
    fleet(rt);
    shinoGuard(rt);
    seats(rt);

    rt.world.setTime('storm');
    rt.setPhase('brief');
    rt.obj('main', '篠曲輪に井伊の旗を立て、のち黒田官兵衛を本丸の門まで守り届けよ', 'main');
    // 戦の前（使番が石垣山の殿下の下知を伝える。秀吉はここにいない）
    rt.say('使番', `殿下の下知じゃ。${nm(rt)}殿は井伊直政殿の手に加わり、城の東を攻めよ`, 4.5);
    rt.after(5, () => rt.say('井伊直政', '今宵は雨。山王口の外の出丸、篠曲輪を取る。松平康頼殿の手と、川と堀を渡って続け', 4.5));
    rt.after(10, () => rt.say('手勢の侍', '囲んで二月半、初めて城へ寄せる夜じゃ', 3.5));
    rt.after(14, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true;
    rt.setPhase('siege');
    sfx('taiko', 0.8);
    const friends = () => [F.mine, F.ii, F.ii2].filter((g) => !gone(g));
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends, look: (list) => dress(list, HOJO), scale: 1.4, mass: 0, backing: false, fixedSpawn: true, dmg: 0.6 }, [
      // ① 山王川を渡り、篠曲輪の木戸の前へ（板塀の狭間から鉄砲が来る）
      DP.move({ to: KIDO_F, obj: '山王川を渡り、篠曲輪の木戸の前まで寄せよ', label: '篠曲輪の木戸', r: 6, max: 90,
        say: [['井伊直政', '赤備え、続け！　川を渡って木戸へ寄せよ！'], ['足軽', '雨で火縄が湿っておる。狭間から来るのは矢じゃ']] }),
      // ② 木戸から打って出た北条勢を、木戸の前で迎え撃つ（付け入りの型・山中城の馬出し）
      DP.fight({ at: KIDO_F, title: '木戸が開いた', sub: '篠曲輪の兵が打って出た', obj: '木戸から打って出た北条勢を、木戸の前で迎え撃て',
        say: [['井伊直政', '出てきたぞ！　ここで返せ。退く敵に続いて木戸へ入る！']],
        foes: () => [{ name: '篠曲輪から打って出た北条勢', from: { x: SHINO_C.x + 2, z: SHINO_C.z }, width: 6, dmg: 0.45, noGuard: true, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }] }],
        later: [{ t: 22, foes: () => [{ name: '篠曲輪の二番手', from: { x: SHINO_C.x, z: SHINO_C.z + 3 }, width: 6, dmg: 0.45, noGuard: true, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }] }], say: ['足軽', '木戸からまだ出て来る！'] }],
        max: 150, noRefill: true, reward: '打って出た北条勢を返した', onEnd: (rt2) => rt2.player.treatWounds(0.3) }),
      // ③ 退く敵に紛れて木戸から篠曲輪へ（閉める前に入る）。中の鉄砲衆も槍で崩す
      DP.move({ to: SHINO_C, obj: '退く敵に続いて、木戸から篠曲輪の中へ入れ', label: '篠曲輪の中', r: 5, max: 70,
        say: [['井伊直政', '木戸を閉めさせるな！　続いて入れ！']],
        onEnd: (rt2) => {
          const G = rt2.flags.shinoGuns;
          if (G && !gone(G)) { G.noRout = false; G.morale = 0; }
          rt2.scene.add(nobori(rt2.world, SHINO_C.x + 1, SHINO_C.z - 2, 'ii', 7));
          rt2.award((t) => t.side.push('篠曲輪へ付け入った'), '篠曲輪へ付け入った');
        } }),
      // ④ 城中から山王口を出た北条の新手から、篠曲輪の井伊の旗を守る
      DP.hold({ at: { x: SHINO_C.x - 1, z: SHINO_C.z }, dur: 80, r: 9, label: '井伊の旗', title: '篠曲輪を取った', sub: '山王口から北条の新手が出てきた',
        obj: '篠曲輪の井伊の旗を、山王口から来る北条の新手から守れ',
        say: [['井伊直政', '旗を立てたぞ！　城の兵が山王口から出て来る。西の口で防げ！']],
        waves: () => [
          { t: 5, foes: () => [{ name: '山王口から出た北条勢', from: SANNO_IN, width: 8, list: [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }] }] },
          { t: 28, foes: () => [{ name: '北条の新手', from: { x: SANNO_IN.x, z: SANNO_IN.z + 4 }, width: 8, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }] }], say: ['足軽', '土橋をまた渡って来る！'] },
          { t: 54, foes: () => [{ name: '山王口の三番手', from: { x: SANNO_IN.x, z: SANNO_IN.z - 4 }, width: 8, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }] }], say: ['井伊直政', 'まだ来るぞ。旗を渡すな！'] },
        ], noRefill: true, reward: '篠曲輪の旗を守った' }),
      // ⑤ 後押しが無く、直政の下知で退く（史実）
      DP.move({ to: { x: II_JIN.x - 4, z: II_JIN.z + 2 }, obj: '井伊直政の下知で、山王川の東の井伊の陣へ退け', label: '井伊の陣', r: 8, max: 80,
        say: [['井伊直政', '後押しが来ぬ。旗は立てた、これまでじゃ。退け！'], ['足軽', '一番首は近藤殿と長野殿じゃ！']] }),
      // ⑥ 六月二十六日：石垣山の城が姿を見せる（何もしなくてよい場面。目標は出さない）
      DP.rest({ dur: 12, banner: ['六月二十六日', '石垣山の林が伐られ、山の上に白い城が現れた'],
        fn: (rt2) => {
          rt2.flags.day = 1; rt2.world.setTime('morning');
          const I = rt2.flags.ichiya; if (I) { I.castle.visible = true; I.wood.visible = false; }
          // 西の山の上の城へ目を向ける（陣から見える遠い眺め）
          rt2.player.cine = { x: ISHI.x, z: ISHI.z, t: 6, vista: true, encounter: true };
          sfx('horagai', 0.7);
          rt2.award((t) => t.side.push('篠曲輪を攻めた（翌日、殿下から褒美）'), '殿下から褒美');
        },
        say: [['使番', '殿下は篠曲輪の一番首の近藤殿・長野殿を召して、褒美を下された'], ['手勢の侍', '南西の山の上を見よ。一夜で城が建ったようじゃ'], ['使番', '八王子も韮山も落ちた。松田殿の内通も露見し、城の中は割れておる']] }),
      // ⑦ 七月の初め：時が飛ぶ。画面の真ん中に次の目標を出し、山王口の外へ移す（kaito AT7）
      //   官兵衛（孝高）は六月二十四日から滝川雄利と開城を説き、肩衣・袴で刀を帯びずに城へ入って氏政・氏直に会った（黒田家譜）。日は伝わらないので「七月の初め」。開城の申し出は七月五日
      DP.rest({ dur: 5, heal: 1, banner: ['七月の初め', '黒田官兵衛を山王口から本丸の門まで守れ'],
        fn: (rt2) => { rt2.flags.day = 2; rt2.world.setTime('day'); warpTo(rt2, ENVOY[0].x - 1, ENVOY[0].z + 3, -Math.PI / 2); },
        say: [['使番', '官兵衛殿が刀を帯びず、氏直殿に城を開くよう説きに参られる', 4]] }),
      escort(),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    // 勝ちは目標とひもづける（kaito AW4）：官兵衛が本丸の門に着いた時だけ
    if (!F.kanU || !F.kanU.alive || !F.envoyDone) return this.lose(rt, F.kanU && F.kanU.alive ? 'late' : 'dead');
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '小田原開城', pts: 60 }; }, '小田原城が開いた');
    sfx('horagai', 0.9);
    rt.banner('小田原城、開城', '天正十八年七月五日　氏直が城を出て降る');
    rt.player.u.invuln = true;
    // 戦の後（筋書きの一枚の言葉）
    rt.say('北条氏直', '城を開く。わしの腹ひとつで、城の者の命を助けてくだされ', 4.4);
    rt.after(4.8, () => rt.say('黒田官兵衛', 'そのお覚悟、しかと殿下に申し上げまする', 4.2));
    // 氏政・氏照の切腹は七月十一日、秀吉の入城と家康の関東は十三日（7/5 の場で決まった事のように言わない）
    rt.after(9.4, () => rt.say('使番', '十一日、氏政殿と氏照殿が腹を召された。氏直殿は高野山へ送られる', 4.6));
    rt.after(14.4, () => rt.say('使番', '十三日、殿下が城に入られた。北条の関東は徳川殿に任せる、との仰せじゃ', 4.6));
    rt.after(19.2, () => rt.say('徳川家康', '……ありがたく、お受けいたしまする', 3.6));
    rt.after(23.2, () => rt.say('井伊直政', `${nm(rt)}殿、篠曲輪の働き、殿下もお喜びじゃ`, 4));
    rt.after(27.6, () => rt.say('使番', '殿下より：足軽から、よう上がった。今日からおぬしも大名じゃ', 4.6));
    rt.finish({}, 33);
  },

  lose(rt, why = 'dead') {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('dp');
    rt.objFail('main');
    rt.tracker.main = false;
    const late = why === 'late';
    rt.banner('任務失敗', late ? '官兵衛が本丸の門に着けなかった' : '開城の使いが討たれた');
    rt.say('使番', late ? '日が暮れた。開城の話は、振り出しじゃ' : '官兵衛殿が討たれた……開城の話は、振り出しじゃ', 4);
    rt.finish({ failureReason: late ? '官兵衛を本丸の門まで届けられなかった' : '開城の使いの官兵衛が討たれた' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    // 本陣の将と旗本は持ち場を離れない（共通の寄せ・助けの下知が掛かっても、毎コマ本丸・本陣へ戻す。kaito AR3）
    for (const [g, at] of [[F.hojo, CASTLE], [F.ieyasu, { x: IE_JIN.x - 2, z: IE_JIN.z }]]) {
      if (!g) continue;
      g.order = 'hold'; g.aggro = 0; g.focus = null; g.onArrive = null; g.anchor.x = at.x; g.anchor.z = at.z;
      for (const u of g.units) if (u.alive && u.target && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 10) { u.target = null; u.atk = null; }
    }
    // 木戸から味方が打って出たら、篠曲輪の鉄砲は撃ち止めて槍で守る（味方の背を撃たない）
    const G = F.shinoGuns;
    if (G && F.dp && F.dp.i >= 1 && G.fire !== false) G.fire = false;
    if (F.kanU && !F.kanU.alive) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

t12_odawara.force = (rt) => ({ a: Math.round(210000 - (rt.flags.ak || 0) * 30), a0: 210000, b: Math.max(0, 50000 - (rt.flags.ek || 0) * 40), b0: 50000 });
t12_odawara.noTaishoRaid = true;   // 本丸の当主の旗本は本丸を出ない（本陣の将は前に出ない・kaito AR3）
t12_odawara.sides = { a: { name: '豊臣軍', mon: 'toyotomi' }, b: { name: '北条軍', mon: 'hojo' } };
t12_odawara.date = (rt) => (rt.flags.day === 2 ? '天正十八年（1590）七月の初め　夏・晴' : rt.flags.day === 1 ? '天正十八年　六月二十六日　朝' : '天正十八年　六月二十二日　雨の夜');
t12_odawara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t12_odawara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t12_odawara.history = '天正十八年（1590）、豊臣秀吉はおよそ二十一万の軍で関東の北条氏を攻めた。前の年、北条方が真田の名胡桃城を奪ったことが、秀吉の裁き（惣無事）を破ったとされ、戦の発端となった。徳川家康・前田利家・上杉景勝・宇喜多秀家・小早川隆景ら全国の大名が加わり、九鬼嘉隆・長宗我部元親らの水軍が海を塞いだ。北条氏政・氏直は、城下の町ごと堀と土塁で囲んだ小田原城の総構え（およそ九km）に、五万余りで籠もった。秀吉は総攻めをせず、城を見下ろす石垣山に城を築いた。家康は城の東、山王川と酒匂川の間に陣を置いた。六月二十二日の雨の夜、家康の家臣の井伊直政と松平康頼が堀を渡り、山王口の外の出丸・篠曲輪を攻めて旗を立てたが、城中から出た北条勢に防がれ、後押しも無く退いた。小田原の陣で城へ攻め入ったのは、ほぼこの一度だけである。二十六日ごろ、石垣山の城のまわりの木を伐り、一夜で現れたように見せたと伝わる（実は八十日ほどかけて築いた）。その間に山中・韮山・松井田・鉢形・八王子などの支城が次々に落ち、重臣の松田憲秀の内通も露見して城の中は揺れた。黒田官兵衛（孝高）・滝川雄利らが開城を説き（官兵衛は肩衣と袴で刀を帯びずに城へ入ったと伝わる）、七月五日に氏直が自らの命と引き換えに城の者を助けるよう申し出て降った。十一日に氏政と弟の氏照は腹を切り、氏直は高野山へ送られた。十三日に秀吉が城に入り、北条の旧領の関東は徳川家康に与えられ、家康は江戸へ移った。\n篠曲輪の形、井伊勢と篠曲輪の守りの人数、主人公が井伊の手に加わること、官兵衛を本丸の門まで送る道筋は遊びのための復元である。両軍の人数は推定で、北条方の数には別の伝えもある。';
t12_odawara.bushou = [{ name: '井伊直政', g: /直政/ }, { name: '黒田官兵衛', g: /官兵衛/ }];

// 素直な遊び手：段の頭（depthBot）に任せる。段の前は陣のそばで待つ
t12_odawara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, II_JIN.x, II_JIN.z + 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t12_odawara);

export { t12_odawara };
export default t12_odawara;
