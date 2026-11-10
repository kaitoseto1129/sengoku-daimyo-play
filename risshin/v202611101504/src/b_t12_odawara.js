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
import { TOYO_MAEDA_KACCHU, TOYO_GAMO_KACCHU } from './kacchu_data.js';
import { nobori, jinmaku, hut, kagaribi, kobune, yagura, castleMat, ishigaki, tenshu, dobei, sumiyagura, kabukimon, solidSeg, dou, kuruwaBldg, yaguramon } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 15）で足した段。中身は t12_odawara/ に一段一ファイル
import * as jinmawari from './t12_odawara/jinmawari.js';   // 始め：六月の初めの昼、陣の間を家康の本陣へ（城は攻めるな）
import * as ishigakiSt from './t12_odawara/ishigaki.js';    // 六月二十五日の夜、石垣山の普請を物見から守る
import * as junkai from './t12_odawara/junkai.js';          // 七月の初め、前田・上杉の陣と浜の長宗我部の船陣を回る
import * as kaijoSt from './t12_odawara/kaijo.js';          // 官兵衛の後、槍を置いて城を出る北条の兵を見届ける
import * as tenka from './t12_odawara/tenka.js';            // 終幕：開城・天下統一の日本地図・家康「次は、関八州か。」
import * as hojin from './t12_odawara/hojin.js';
import * as shijo from './t12_odawara/shijo.js';            // 11/10 指示書：殿下の陣の関東の図で、支城の旗が一つずつ外れる
import * as hyojo from './t12_odawara/hyojo.js';            // 11/10 指示書：城の中の評定（敵方の短い場面）            // 囲みの全国の大名の陣（布陣図どおりの兵数の比で遠景の軍勢）

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
// 11/6 kaito 二1：前は井伊の陣が木戸から川一本（約二百m）で弓の届く所にあった。徳川勢は山王川と酒匂川の間（城の東・海から約1km）に陣した。
//   井伊の陣は山王川の東およそ四百m、徳川勢の一番海寄り。家康の本陣はその北およそ六百m・篠曲輪からおよそ九百m（名札の見えない遠さ。地図の東の端は 180 まで）
const II_JIN = { x: 164, z: -90 };       // 井伊直政の陣（徳川勢の一番海寄り）
const IE_JIN = { x: 170, z: -160 };      // 徳川家康の本陣（後ろ）
const YASU_JIN = { x: 156, z: -112 };    // 松平康頼の手（井伊の北に並ぶ。共に篠曲輪へ寄せる）
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
// 11/6 kaito 二6：前は七月に主人公を山王口の外へ一瞬で移していた。官兵衛は井伊の陣へ来て、そこから共に歩く（山王川・篠曲輪の木戸と西の口・土橋・山王口）
const ENVOY = [{ x: II_JIN.x - 10, z: II_JIN.z + 6 }, { x: 140, z: -66 }, { x: 128, z: -64 }, { x: 121, z: -64 }, { x: 110, z: -64 }, { x: 100, z: -62 }, { x: 77, z: -61 }, { x: 74, z: -80 }, { x: 60, z: -98 }, KGATE];
// 海岸線（これより南東は海）。早川の河口から北東へは城の南の浜、南西へは石垣山の東の裾を回って真鶴の方へ下る（前は西がずっと z=46 で、石垣山が海に沈んでいた）
const coastZ = (x) => (x > -2 ? 46 - (x + 2) * 0.62 : 46 + (-2 - x) * 3.4);

const TOYO = { flag: 'toyotomi' };
const KURODA = { flag: 'kuroda' };
// 開城を説きに入る使いは鎧を着ず、刀を預けた小袖の姿（黒田家譜：肩衣・袴で刀を帯びずに入城。肩衣の形は共通の人の作りに無いので小袖で代える）
const CALM = { kosode: 1, obi: 0x2a231c, hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0, horo: 0, horse: false, weapon: 'none', dmg: 0 };
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
  h -= 2.4 * trap(distToPolyline(x, z, MOAT), 2.4, 1.6) * clamp01((Math.hypot(x - (GATE.x - 8), z - GATE.z) - 4) / 2);
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
    h -= 1.6 * trap(distToPolyline(x, z, SANNOGAWA), 3.2, 3);   // 梅雨の雨で増えた川（膝より深い）
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
  // 遠い眺めの写し（ichiyaView）で縮めて置く時、城だけが空に浮かないよう、石垣山の頂の山肌も一緒に持つ（城と同じ高さの式）
  {
    const R = 70, n = 36, g = new THREE.PlaneGeometry(R * 2, R * 2, n, n); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = ISHI.x + pos.getX(i), z = ISHI.z + pos.getZ(i); pos.setXYZ(i, x, W.heightAt(x, z) - 0.25 - Math.max(0, Math.hypot(x - ISHI.x, z - ISHI.z) - R * 0.8) * 0.6, z); }
    g.computeVertexNormals();
    castle.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x4f5a3e })));
  }
  for (const m of [castle, ...castle.children]) m.userData.camBlock = false;
  // 陣から石垣山は霧の見通し（110m）の先。城だけは霧に消さず、遠くの山と同じ青い霞の色を混ぜて見せる（材質はこの戦だけの写し）
  const haze = new THREE.Color(0xaab4bc), done = new Map();
  castle.traverse((o) => {
    if (!o.material) return;
    const one = (m) => { if (!done.has(m)) { const c = m.clone(); c.fog = false; if (c.color) c.color.lerp(haze, 0.42); done.set(m, c); } return done.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  castle.visible = false;
  castle.userData.noFreeze = true;   // 動かない物の束ね（static_freeze）に、見えない間に入れられて二十六日に出なかった（11/6）
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
  wood.userData.noFreeze = true;
  rt.scene.add(wood);
  F.ichiya = { castle, wood };
}

// 描く遠さは全戦で 150 まで（world.js）。山肌の半径七十も収まるよう、視点を中心に縮めて百の所へ置く。
//   視点から見た向きと見かけの大きさは変わらない（遠い眺めの写し）。城は霧に消さない材質なので、遠さの霞は ichiyajo の色で出す
function ichiyaView(rt) {
  const I = rt.flags.ichiya, cam = rt.camera;
  if (!I || !I.castle.visible || !cam) return;
  const c = cam.position, d = Math.hypot(ISHI.x - c.x, ISHI.z - c.z);
  const k = d > 100 ? 100 / d : 1;
  I.castle.scale.setScalar(k);
  I.castle.position.set(c.x * (1 - k), c.y * (1 - k), c.z * (1 - k));
}

// ---- 総構えの塀と町（見た目だけ） ----
function sogamae(rt) {
  const W = rt.world;
  for (const [x, z] of [[-24, -2], [-31, -48], [-38, -90], [-44, -128]]) rt.scene.add(nobori(W, x + 2, z, 'hojo', 5));
  for (const [x, z, r] of [[-6, -48, 0.2], [4, -58, -0.3], [-2, -74, 0.4], [10, -70, 0.1], [16, -88, -0.2], [-10, -88, 0.3], [6, -40, 0.5], [22, -66, 0]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
  // 開城の時に下げる北条の旗（t12_odawara/tenka.js）
  rt.flags.hojoFlags = [nobori(W, KGATE.x + 4, KGATE.z - 3, 'hojo', 7), nobori(W, KGATE.x - 4, KGATE.z - 3, 'hojo', 7)].filter(Boolean);
  for (const f of rt.flags.hojoFlags) rt.scene.add(f);
}

// ---- 総構えの土塁の上の板塀（史実の目玉：町ごと囲む九km の総構え）。柱と板を一つの形にまとめて一回で描く。早川口は開ける ----
function sogamaeWall(rt) {
  // 本物に寄せる（小田原城の総構えの復元図・山中城の土塁の上の塀の復元）：下見板を横に重ね張りした板塀に、板葺の両流れの笠と、
  //   一間（1.8m）ごとの控え柱。板は castleMat('shitami')（城の下見板と同じ絵・材質を使い回す）。色は柱間ごとに褪せ方を変える
  // 11/6 kaito 四5：前は板塀が 2.5（人の背の一倍半）で、土塁の上から見上げると人の三倍の箱の壁に見えた。土塁の上の板塀は人の背より少し高いほど（約2m）
  const W = rt.world, parts = [], wood = [], FH = 1.9;
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
        const b = uvs(new THREE.BoxGeometry(0.12, FH, sl + 0.04), 0.12, FH, sl + 0.04); b.rotateY(ry); b.translate(x, y + FH / 2, z); parts.push(col(b, f, f * 0.97, f * 0.93));
        // 板葺の笠：両へ流れる二枚の板（棟の木を挟む）
        for (const sd of [-1, 1]) { const c = new THREE.BoxGeometry(0.42, 0.05, sl + 0.12); c.rotateZ(sd * 0.42); c.translate(sd * 0.19, 0, 0); c.rotateY(ry); c.translate(x, y + FH + 0.08, z); wood.push(col(c, 0.36 * f, 0.33 * f, 0.29 * f)); }
        const ridge = new THREE.BoxGeometry(0.1, 0.1, sl + 0.12); ridge.rotateY(ry); ridge.translate(x, y + FH + 0.18, z); wood.push(col(ridge, 0.25, 0.22, 0.19));
        const q = new THREE.BoxGeometry(0.2, FH + 0.25, 0.2); q.rotateY(ry); q.translate(x - Math.sin(ry) * sl / 2, y + (FH + 0.25) / 2 - 0.05, z - Math.cos(ry) * sl / 2); wood.push(col(q, 0.42 * f, 0.36 * f, 0.29 * f));
        // 鉄砲狭間（四角）と矢狭間（縦長）の黒い穴
        for (const [o, w, h] of [[-0.22, 0.26, 0.26], [0.22, 0.16, 0.5]]) { const s = new THREE.BoxGeometry(0.03, h, w); s.translate(0.075 * bs, 0, o * sl); s.rotateY(ry); s.translate(x, y + FH * 0.6, z); wood.push(col(s, 0.05, 0.045, 0.04)); }
        // 控え柱（内へ斜めに支える）
        if (k % 2 === 0) { const h = new THREE.BoxGeometry(0.12, FH * 0.85, 0.12); h.rotateZ(-0.5 * bs); h.translate(-0.5 * bs, FH * 0.38, 0); h.rotateY(ry); h.translate(x - Math.sin(ry) * sl / 2, y, z - Math.cos(ry) * sl / 2); wood.push(col(h, 0.4 * f, 0.34 * f, 0.27 * f)); }
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
  // 見える板塀と同じ範囲を塞ぐ。西の総構え・枡形・本丸も、門だけを通す。
  solidLine(SOGAMAE, (x, z) => Math.hypot(x - GATE.x, z - GATE.z) < 8);
  solidLine(MASU, () => false);
  solidLine(rectPts(HON, -1.4), (x, z) => Math.hypot(x - (HON.x0 + 6), z - HON.z1) < 3.5);
  solidLine(SOGAMAE_E, sannoGap);
  solidLine(rectPts(SHINO, -0.9), atShinoGap);
  rt.scene.add(kabukimon(W, SANNO.x, SANNO.z, 7, Math.PI / 2));
  { const kido = kabukimon(W, KIDO.x - 0.9, KIDO.z, 4.6, Math.PI / 2); kido.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; }); rt.scene.add(kido); }
  // 11/8 critic60 小田原 4：木戸の前と篠曲輪の中で画面が丸ごと真っ黒になった。守りの篝火を木戸の内と曲輪の奥に焚き、戦う相手を照らす（木戸の門の屋根にもカメラを入れない）
  for (const [x, z] of [[KIDO.x - 3, KIDO.z - 4], [SHINO_C.x - 2, SHINO_C.z + 5], [SHINO.x0 + 2, SHINO_C.z - 4]]) rt.scene.add(kagaribi(W, x, z));
  rt.scene.add(yagura(W, 88, -71));
  // 篠曲輪の中には櫓を建てない（狭い出丸で、木戸のそばの櫓の床がカメラの上をふさいだ）
  for (const [x, z] of [[SHINO.x1 - 2, SHINO.z1 - 2], [SHINO.x0 + 3, SHINO.z0 + 2], [88, -54]]) rt.scene.add(nobori(W, x, z, 'hojo', 6));
  // 総構えの内の東の町（板葺の町家。官兵衛の通る道は空ける）
  for (const [x, z, r] of [[80, -50, 0.1], [70, -66, -0.2], [84, -84, 0.3], [56, -78, 0.05], [50, -95, -0.25], [72, -104, 0.2]]) {
    const house = hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 });
    // 屋根だけでなく板壁もカメラを遮る。本丸前から横を向いても家の中へ入れない。
    house.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; });
    rt.scene.add(house);
  }
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
  // 11/6 kaito 四5：前は茅葺の家と丸太の物見だけで村の砦に見えた。五代の本城らしく、主殿（大きな入母屋の御殿）・蔵・土塁の角の隅櫓（板壁・瓦。低い台）・南の大手の櫓門（土の城の門）
  try {
    rt.scene.add(dou(W, CASTLE.x + 3, CASTLE.z - 3, 16, 10, 0));
    // 開城の列の後ろが蔵の中に出ないよう、門へ続く通路の北西に寄せる。
    rt.scene.add(kuruwaBldg(W, 'kura', CASTLE.x - 11, CASTLE.z - 5, Math.PI / 2, { ita: true, boardRoof: true }));
    rt.scene.add(kuruwaBldg(W, 'kura', CASTLE.x + 11, CASTLE.z + 6, 0, { ita: true, boardRoof: true }));
    for (const [x, z] of [[HON.x0 + 2.5, HON.z0 + 2.5], [HON.x1 - 2.5, HON.z0 + 2.5], [HON.x1 - 2.5, HON.z1 - 2.5]]) rt.scene.add(sumiyagura(W, x, z, { w: 4.2, d: 3.6, base: 0.3, inside: false }));
    rt.scene.add(yaguramon(W, HON.x0 + 6, HON.z1 - 1.4, 5, 0, { doors: false, inside: false, earth: true }));
    // 門の中央と脇で土塁の高さが違う。渡櫓の床まで板囲いの台を延ばし、下を空洞にしない。
    const gateX = HON.x0 + 6, gateZ = HON.z1 - 1.4;
    const floorY = W.heightAt(gateX, gateZ) + 3.85;
    const supportGeo = new THREE.BoxGeometry(2.6, 1, 4);
    const supportMat = new THREE.MeshLambertMaterial({ color: 0x786a55 });
    for (const side of [-1, 1]) {
      const x = gateX + side * 3.9;
      let bottom = W.heightAt(x, gateZ) - 0.4;
      for (const dx of [-1.3, 1.3]) for (const dz of [-2, 2]) bottom = Math.min(bottom, W.heightAt(x + dx, gateZ + dz) - 0.4);
      const support = new THREE.Mesh(supportGeo, supportMat);
      support.scale.y = Math.max(0.1, floorY - bottom);
      support.position.set(x, bottom + support.scale.y / 2, gateZ);
      support.castShadow = true; support.receiveShadow = true; support.userData.camBlock = true;
      rt.scene.add(support);
    }
  } catch (e) { console.warn(e); }
  rt.scene.add(yagura(W, HACHIMAN.x, HACHIMAN.z));
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
  rt.scene.add(jinmaku(W, IE_JIN.x - 1, IE_JIN.z, 14, 12, 5, { mon: 'tokugawa' }));
  // 松平康頼の陣（井伊の北に並ぶ）
  rt.scene.add(jinmaku(W, YASU_JIN.x + 6, YASU_JIN.z - 2, 10, 8, 4, { mon: 'tokugawa' }));
  rt.scene.add(kagaribi(W, YASU_JIN.x + 1, YASU_JIN.z + 3));
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

// ---- 段 ⑦：官兵衛に付き添い、井伊の陣から本丸の門まで送り届ける ----
// 場所へ着く・寄せを返す・旗を守る目標は、放置や時間切れで済ませない。
const castleViewPoint = new THREE.Vector3();
function castleReveal(step) {
  return { ...step, key: 'ichiya', idleAdvance: false, noHardCap: true, max: Infinity, limit: Infinity,
    tick(rt, C, m, ctx, el, dt) {
      const I = rt.flags.ichiya, p = rt.player.u.pos;
      let visible = false;
      if (I?.castle.visible && rt.camera && Math.hypot(p.x - II_JIN.x, p.z - II_JIN.z) < 20) {
        // 遠景として縮めた城の天守を、現在のカメラで測る。視点は動かさない。
        castleViewPoint.set(ISHI.x - 4, rt.world.heightAt(ISHI.x, ISHI.z) + 24, ISHI.z)
          .multiplyScalar(I.castle.scale.x).add(I.castle.position).project(rt.camera);
        visible = Math.abs(castleViewPoint.x) < 0.85 && Math.abs(castleViewPoint.y) < 0.85 && Math.abs(castleViewPoint.z) < 1;
      }
      // 二秒見届けた後は、辺りを見回しても確認済みのままにする。
      if (!(C.castleSeen >= 2)) C.castleSeen = visible ? (C.castleSeen || 0) + dt : 0;
      return step.tick(rt, C, m, ctx, el, dt) && C.castleSeen >= 2;
    },
  };
}

function requiredStep(step) {
  if (step.kind === 'rest') return step;
  const tick = step.tick;
  // 共通の四分・七分の打ち切りでも、未達の目標を済ませない。
  return { ...step, idleAdvance: false, noHardCap: true, max: Infinity, limit: Infinity,
    tick(rt, C, m, ctx, el, dt) {
      const done = tick(rt, C, m, ctx, el, dt);
      if (step.kind === 'fight') {
        // 打って出の残兵は、塀を横切る向きへ逃がさず、自分の城の口へ返す。
        // 新手にも戦っている間に退路を渡し、段の終わりより先に崩れた兵も通す。
        if (C.later) for (const g of C.groups || []) if (!g.fleePath) {
          g.fleePath = [[KIDO_F.x, KIDO_F.z], [KIDO.x, KIDO.z],
            [SHINO_C.x, SHINO_C.z], [100, SANNO.z], [SANNO_IN.x, SANNO_IN.z]];
        }
        const p = rt.player.u.pos;
        const near = Math.hypot(p.x - C.at.x, p.z - C.at.z) < 18;
        // 打って出の段は全滅を待たない。上限を無効にした後も、現地で
        // 元の刻限まで持ちこたえれば、塀に残った兵は end の下知で退く。
        // 普請の物見は独自の撤退条件を持つため、この数え方には入れない。
        if (C.later && near && rt.player.u.alive) C.repulseHold = (C.repulseHold || 0) + dt;
        // 木戸や塀の奥に残った敵を追わせず、刻限後は守る場所を示す。
        // 持ち場で耐えた時間だけを数えるため、陣で待つだけでは済まない。
        if (C.later && ((C.later.length === 0 && el >= step.max && !done) || (done && !near))) {
          C.goal = C.at;
          // 共通処理は残兵の組が替わるたび印を替え、全て退くと消す。
          // その場合も本人が戻る持ち場の印を保つ。
          if (!C.repulseMarked || C.repulseEnemy !== C.marked) {
            C.repulseMarked = true;
            C.repulseEnemy = C.marked;
            rt.unmark('dp');
            rt.marker('dp', C.at, '篠曲輪の木戸の前', { h: 3 });
          }
        }
        const repulsed = C.later?.length === 0 && C.repulseHold >= step.max;
        if (repulsed && !done) rt.say('井伊直政', '北条勢が退くぞ。追うな、山王川の岸へ戻れ！', 3.6);
        // 味方だけが木戸の敵を返しても、本人が陣に残ったまま達成にしない。
        if (done && !near) {
          C.goal = C.at;
          rt.objProgress('dp', step.key === 'ishigaki' ? '石垣山の普請場へ戻れ' : step.key === 'sortie' || step.key === 'kuzure' ? '山王川の岸へ戻れ' : '篠曲輪の木戸の前へ戻れ');
        }
        return (done || repulsed) && near;
      }
      if (step.kind !== 'hold') return done;
      const p = rt.player.u.pos;
      const near = Math.hypot(p.x - C.at.x, p.z - C.at.z) < 17;
      if (near) C.flagHold = (C.flagHold || 0) + dt;
      // 守った時間は達成の判定だけに使い、画面には場所と行いを示す。
      rt.objProgress('dp', !near ? '篠曲輪の井伊の旗のそばへ戻れ' : C.flagHold < 80 ? '篠曲輪の井伊の旗を守れ' : '山王口から来た残りの北条勢を押し返せ');
      return done && near && C.flagHold >= 80;
    },
  };
}

// 11/6 kaito（史実・二2・一3）：開城を説く使いの道で斬り合いにしない（前は「抗う北条の侍」が三度寄せ、門の前で血と死体が出た）。
//   北条方は使いを通す：山王口の番が道を開け、本丸の門から出迎えの侍が来て先に立つ。本丸の旗本は門の前に並んで迎える
function ceasefire(rt) {
  // 使いの供は三人だけ。寄せ手と本人の組は城外の持ち場に留める。
  for (const { g, at } of rt.flags.envoyWait || []) {
    g.order = 'hold'; g.ai = false; g.noAI = true; g.fixed = true;
    g.aggro = 0; g.focus = null; g.onArrive = null;
    g.anchor.x = at.x; g.anchor.z = at.z;
  }
  for (const u of rt.army.units) if (u.alive) {
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    u.noTarget = true; u.invuln = true;
    if (u.group) { u.group.peaceful = true; u.group.fire = false; }
  }
}

function escort() {
  return {
    kind: 'escort', max: 300, idleAdvance: false,   // 使いは自分が付き添う間だけ歩く。止まった間に段を飛ばして負けにしない
    start(rt, C) {
      const F = rt.flags;
      const st = ENVOY[0];
      C.at = st; C.goal = st; C.i = 1; C.met = false;
      F.envoyWait = [...new Set([F.mine, F.ii, F.ii2, F.yasu, ...(rt.squadGroups || [])])]
        .filter((g) => g && !gone(g)).map((g) => ({ g, at: { ...g.center() } }));
      F.envoy = allyGroup(rt, { faction: 'oda', name: '黒田官兵衛の使い', anchor: { ...st }, fixed: true, fullStrength: true, noGuard: true, noAI: true, facing: -Math.PI / 2, width: 4, aggro: 0, noRout: true, morale: 100 },
        dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', ...CALM, kosodeCol: 0x2e2c2a } }, { type: 'samurai', n: 3, o: { ...CALM, kosodeCol: 0x3a3630 } }], KURODA));   // 供は少なく（説きに入る使い）
      F.envoy.fixed = false;
      F.kanU = F.envoy.units[0];
      F.kanU.maxHp = (F.kanU.maxHp || 100) * 3; F.kanU.hp = F.kanU.maxHp;
      for (const u of F.envoy.units) u.invuln = true;
      // 山王口の番（槍を立てて口の内の両脇に並ぶ。使いが来ると道を開ける）
      F.sannoBan = enemyGroup(rt, { faction: 'hojo', name: '山王口の番', anchor: { x: SANNO_IN.x - 2, z: SANNO_IN.z - 6 }, facing: Math.PI / 2, width: 6, fixed: true, noAI: true, noRout: true, order: 'hold', aggro: 0 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], HOJO));
      for (const u of F.sannoBan.units) u.invuln = true;
      ceasefire(rt);
      sfx('horagai', 0.6);
      rt.say('黒田官兵衛', '刀は預けて参る。氏政殿・氏直殿に会うて、城を開くよう説く', 4);
      rt.after(4.6, () => rt.say('井伊直政', `${nm(rt)}殿、黒田殿の供をいたせ。こちらから手を出すな`, 4));
      rt.obj('dp', '黒田官兵衛に付き添い、井伊の陣から山王口を通って本丸の門まで送り届けよ', 'main');
      C.near = true;
      // 塀を横切る最短線ではなく、使いと通る木戸・辻を順に示す。
      rt.marker('dp', () => (C.near ? ENVOY[Math.min(C.i, ENVOY.length - 1)] : F.kanU.pos),
        () => (!C.near ? '黒田官兵衛' : C.i <= 3 ? '篠曲輪の木戸' : C.i <= 5 ? '篠曲輪の西の口' : C.i <= 7 ? '山王口' : '本丸の門'), { h: 3 });
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, k = F.kanU;
      // 討たれた使いを到着扱いにせず、update の任務失敗へ渡す。
      if (!k.alive) { F.envoyDone = false; return false; }
      // 使いが山王口に近づくと、口の番は道の脇へ退いて通す。本丸の門から出迎えの侍が来て先に立つ
      if (!C.met && Math.hypot(k.pos.x - SANNO.x, k.pos.z - SANNO.z) < 22) {
        C.met = true;
        if (F.sannoBan) F.sannoBan.anchor = { x: SANNO_IN.x - 3, z: SANNO_IN.z - 9 };
        F.demukae = enemyGroup(rt, { faction: 'hojo', name: '北条の出迎え', anchor: { x: KGATE.x + 2, z: KGATE.z + 2 }, facing: Math.PI / 2, width: 4, noAI: true, noRout: true, order: 'hold', aggro: 0 },
          dress([{ type: 'samurai', n: 3 }], HOJO));
        for (const u of F.demukae.units) u.invuln = true;
        F.demukae.anchor = { x: ENVOY[6].x - 2, z: ENVOY[6].z - 4 };
        rt.say('山王口の番', '黒田殿の使いじゃ。道を開けい。手を出すな', 3.4);
        rt.after(4, () => rt.say('北条の侍', '黒田殿か。氏直様がお待ちでござる。こちらへ', 3.6));
      }
      // 出迎えの侍は使いの少し先を歩いて本丸の門へ案内する
      if (F.demukae && C.i >= 6) { const nx = ENVOY[Math.min(C.i + 1, ENVOY.length - 1)]; F.demukae.anchor = { x: nx.x, z: nx.z }; }
      // 自分が近くにいる間だけ、使いは前へ進む
      const p = rt.player.u.pos, tgt = ENVOY[Math.min(C.i, ENVOY.length - 1)];
      const near = C.near = Math.hypot(p.x - k.pos.x, p.z - k.pos.z) < 18;
      if (near) F.envoy.anchor = { x: tgt.x, z: tgt.z };
      else if (!C.waiting) { const c = F.envoy.center(); F.envoy.anchor = { x: c.x, z: c.z }; }
      C.waiting = !near;
      // 官兵衛本人が辻に着いたら次の辻へ（木戸・西の口・山王口は細かく辻を置き、塀の角を切らない）
      if (near && Math.hypot(k.pos.x - tgt.x, k.pos.z - tgt.z) < (C.i <= 6 ? 3 : 11) && C.i < ENVOY.length - 1) C.i++;
      const left = Math.hypot(k.pos.x - KGATE.x, k.pos.z - KGATE.z);
      C.goal = !near ? k.pos : tgt;
      rt.objProgress('dp', near ? '黒田官兵衛を本丸の門まで送り届けよ' : '黒田官兵衛のそばへ戻れ');
      // 一目盛りは約八メートル。十二では門から約百メートル手前でも
      // 交渉が済んでしまうので、最後は官兵衛本人の門前への到着を待つ。
      return (F.envoyDone = near && C.i >= ENVOY.length - 1 && left < 4);
    },
    end(rt, C) {
      const F = rt.flags;
      rt.unmark('dp');
      if (F.kanU.alive && F.envoyDone) { rt.objDone('dp'); rt.award((t) => t.side.push('開城の使いを送り届けた'), '開城の使いを送り届けた'); }
    },
  };
}

// 篠曲輪の守り：東の木戸の内の板塀に鉄砲と槍が並び、寄せる者を撃つ（城そのものが兵器・kaito BA5）
// 暗転の間に、本人と組を次の場所へ置き直す（t12_odawara/ の段。時が飛ぶ所だけ）
function warpTo(rt, x, z, heading) {
  const P = rt.player, u = P.u;
  const put = (o, px, pz) => { o.pos.set(px, rt.world.heightAt(px, pz), pz); if (o.vel) o.vel.x = o.vel.y = o.vel.z = 0; if (o.mesh) o.mesh.position.copy(o.pos); o.target = null; };
  put(u, x, z);
  u.heading = heading; P.yaw = heading; P.camYawOff = 0;
  (rt.squad || []).forEach((o, i) => { if (o.alive && !o.gone) put(o, x - Math.sin(heading) * (2 + (i >> 2)) + ((i % 4) - 1.5) * 1.3, z - Math.cos(heading) * (2 + (i >> 2))); });
}

function shinoGuard(rt) {
  const F = rt.flags;
  F.shinoGuns = enemyGroup(rt, { faction: 'hojo', name: '篠曲輪の鉄砲', anchor: { x: SHINO.x1 - 2.2, z: SHINO_C.z }, facing: Math.PI / 2, width: 12, fixed: true,
    noRout: true, order: 'hold', aggro: 0, formation: 'line', morale: 80, dmgMult: 0.2, fire: true },
  // 雨の夜は火縄と口薬が湿り、鉄砲は撃ちにくい（篠曲輪の夜討ちは六月二十二日の夜半の雨）。狭間は弓を主に、鉄砲は雨覆いの三挺だけ
  // 守りの将は山角康定（その子と助勢の高橋高盛も籠った。康定は生き延びて戦の後も仕えたので討てない）
  // 狭い出丸の守りなので康定は徒（馬は曲輪に入らない）。そばに子と家来の侍を固めて置く（kaito 一2）
  dress([{ type: 'busho', n: 1, o: { name: '山角康定', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'samurai', n: 5 }, { type: 'bow', n: 6 }, { type: 'gun', n: 3, o: { gunRainCover: true } }], HOJO));
  F.shinoGuns.secKind = 'bow';
  // 11/9 二巡：討てない康定に斬りかかっても傷がつかず「不死身」に見えた。狙いの的にせず、旗本の後ろに置く（斬り合う相手は供の侍と弓）
  for (const u of F.shinoGuns.units) if (u.name === '山角康定') u.noTarget = true;
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
  for (const u of F.hojo.units) {
    u.invuln = true;
    if (u.name) u.isSub = true;
    // 氏直らは討ち取る相手ではなく、開城を決める当主。名札だけを
    // 隠すと近寄った兵が斬り続けるため、康定と同じく狙いから外す。
    if (u.type === 'busho') u.noTarget = true;
  }
  for (const u of F.hojo.units) if (u.type === 'busho') sit(u);
}

// 時が飛ぶ所：夜討ちの残りの北条勢は城の中へ引き揚げた（本丸の当主と旗本は残す）
function clearFoes(rt) {
  const keep = new Set(rt.flags.hojo ? rt.flags.hojo.units : []);
  for (const u of rt.army.units.slice()) if (u.team === 1 && !u.gone && !keep.has(u)) rt.army.despawn(u);
}

// 川を渡る足の水しぶき。共通の粒の固定枠を使い、兵ごとの歩幅だけを覚える。
function riverFeet(rt) {
  const F = rt.flags, W = rt.world;
  if (rt.t < (F.riverFootAt || 0)) return;
  F.riverFootAt = rt.t + 0.12;
  let emitted = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.mounted || distToPolyline(u.pos.x, u.pos.z, SANNOGAWA) > 5) { u.odawaraFootX = undefined; continue; }
    const moved = u.odawaraFootX === undefined ? 0 : Math.hypot(u.pos.x - u.odawaraFootX, u.pos.z - u.odawaraFootZ);
    u.odawaraFootX = u.pos.x; u.odawaraFootZ = u.pos.z;
    if (moved > 2 || W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) < 0.05) { u.odawaraStride = 0; continue; }
    u.odawaraStride = (u.odawaraStride || 0) + moved;
    if (u.odawaraStride < 0.6 || emitted >= 2) continue;
    u.odawaraStride %= 0.6;
    W.spray(u.pos.x, u.pos.z, 3); emitted++;
  }
}
const t12_odawara = {
  lethal: true,   // 命懸けの戦場（lethal.js。先取り 11/9 豊臣B）
  victoryTitle: '小田原城、開城',
  victoryCaption: '北条氏直が降伏',
  spawn: { x: II_JIN.x + 2, z: II_JIN.z + 4, heading: -Math.PI / 2 },
  noWake: true,
  minutes: 17,
  // 11/9 軍勢の厚み（docs/army_depth_howto.md）：囲みの陣立て。どちらの備も自分からは出ない（hold。秀吉の「城は攻めるな」）。
  //   東の酒匂川の側は徳川勢の備が層をなし、総構えの内は北条の備が口ごとに固める。本物の隊は bind で結ぶ（描かず、本物から読む）
  depth: {
    A: { name: '豊臣', facing: -Math.PI / 2, honjin: { x: IE_JIN.x, z: IE_JIN.z }, mpu: 8, formation: '包囲', terrain: 'plain', flag: 'tokugawa', armor: 0x1f1e1c, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'ii', layer: 'sakite', wing: 'center', men: 3000, taisho: '井伊直政', flag: 'ii', bind: (rt) => rt.flags.ii, hold: true },
        { id: 'yasu', layer: 'ichi', wing: 'right', men: 1500, taisho: '松平康頼', bind: (rt) => rt.flags.yasu, hold: true },
        { id: 'honda', layer: 'ichi', wing: 'left', men: 3000, taisho: '本多忠勝', flag: 'honda', at: { x: 150, z: -186 }, hold: true },
        { id: 'toku2', layer: 'ni', wing: 'right', men: 4000, taisho: '', at: { x: 178, z: -118 }, hold: true },
        { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 18500, taisho: '徳川家康', bind: (rt) => rt.flags.ieyasu, hold: true },
      ] },
    B: { name: '北条', facing: Math.PI / 2, honjin: { x: CASTLE.x, z: CASTLE.z }, mpu: 8, formation: '方円', terrain: 'castle', flag: 'hojo', armor: 0x2e2a24, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'sanno', layer: 'ichi', wing: 'center', men: 3000, taisho: '', at: { x: SANNO_IN.x - 10, z: SANNO_IN.z }, hold: true },
        { id: 'kita', layer: 'ichi', wing: 'left', men: 4000, taisho: '', at: { x: 74, z: -160 }, hold: true },
        { id: 'umi', layer: 'ni', wing: 'right', men: 3000, taisho: '', at: { x: 66, z: -40 }, hold: true },
        { id: 'hon', layer: 'hatamoto', wing: 'center', men: 16000, taisho: '北条氏直', bind: (rt) => rt.flags.hojo, hold: true },
      ] },
    honjinView: { A: false, B: false },   // 陣幕と本丸は戦のファイルが作る
  },
  pacingCap: 1500,   // 11/8 15分の構成（この戦だけ15〜18分）。共通の打ち切り（十八分）を二十五分へ
  noFrontFill: true,         // 見える兵は全部本物（奥の軽い乱戦を置かない。11/3 p100）
  kumiLead: false,           // 行き先の印は今の目標の金の▼一つだけ（kaito AV15）
  noGoalCount: true,
  // 全件で画面を埋めず、今の目標から五件を順番どおりに並べる。
  goalsVisibleRows: 5,
  goalCountLabel: '退けた',   // 討死だけでなく退いた敵も数える。数字だけの札にしない。
  goalSignNameOnly: true,
  noLeaderFollow: true,
  // 雨の夜討ちの弓・雨覆いの鉄砲と、狭い出丸の徒歩の守りを共通の兵種補充で替えない。
  keepMix: true,
  missionPin: () => null,     // 白い旗のピンは出さない。行き先は今の目標の▼と名の札の一つだけ（kaito AV15・⑧）
  introMapPlaces: hojin.places(),   // 開戦前の地図に囲みの大名の名
  world: {
    namedKacchu: { ...TOYO_MAEDA_KACCHU, ...TOYO_GAMO_KACCHU },
    // 昼の包囲中と味方の打って出では、近い主人公にも撃ち止めの下知を守る。
    strictFireOrders: true,
    // 夜の篠曲輪で、倒れた兵から外れた陣笠が黒い皿のように散らばって見えた（critic60 小田原 29）。この戦は笠を落とさない
    hatDropRate: 0,
    // 東の端の陣も、旗本の後列まで戦場の内に収めて出す（全戦の通し確認）。
    keepSpawnInside: true,
    seed: 1590,
    battleViewDistance: 110,
    // 六月二十二日の夜半の雨（梅雨）：夜の暗さと雨。前は 'storm'（昼の曇り）だけで、雨も降らず昼の明るさだった
    time: 'night',
    nightLift: 3.6,
    nightFogFar: 110,
    unitNightScale: 0.8,   // 雨の夜も赤備えと北条の黒の色を残す（11/8 critic60 小田原 5：0.4 では兵が色の無い黒い影のマネキンに見えた。兵の補光を倍に）
    nightLight: { cover: 0.95, cloud: 0, top: 0x0e1218, sky: 0x1c232c, fog: 0x262d36 },   // 雲に覆われ、月も星も見えない
    wetStart: 0.7,
    noGroundArrows: true,   // 水中の川床へ矢を立てない。人や塀に刺さった矢は残す
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
    clear: (x, z) => (x > -130 && x < 40 && z > -120 && z < 30) || (x > -92 && x < -36 && z > 76 && z < 125) || rectD(HON, x, z) < 7 || (x > 40 && x < 178 && z > -176 && z < -20),
    streams: [{ pts: HAYAKAWA, w: 5, depth: 1.0 }, { pts: HON_HORI, w: 2.2, depth: 1.6 }, { pts: SANNOGAWA, w: 4.4, depth: 1.1 },
      ...SHINO_HORI.map((pts) => ({ pts, w: 2.4, depth: 1.2 })),
      // 総構えの水堀。山王口と早川口の土橋には水を張らない。
      ...[ [...MOAT_E.slice(0, 4), [100, -65]], [[100, -59], ...MOAT_E.slice(4)],
        [...MOAT.slice(0, 5), [-36.6286, -27]], [[-37.6571, -33], ...MOAT.slice(5)]
      ].map((pts) => ({ pts, w: 2.4, depth: 1.6 }))],
    trees: 380,
    tufts: 3600,
    // 石垣山の曲輪と北の面（小田原から見える側）は clear で伐られた後にする（伐る前の林は ichiyajo の杉）
    treeDensity: (x, z) => (z > coastZ(x) - 8 ? 0 : Math.hypot(x - ISHI.x, z - ISHI.z) < 55 ? 0.9 : x < -130 || z < -150 ? 0.8 : 0.15),
    groves: [{ x: -150, z: -80, r: 16, n: 22 }, { x: -60, z: 70, r: 12, n: 16 }, { x: ISHI.x + 30, z: ISHI.z + 10, r: 14, n: 18 }],
    // 北条方は総構えの内へ、豊臣方は東の端へ逃げ切る
    fleeOut: (x, z, team) => (team === 1 ? x < SANNO.x - 10 : x > 176),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.day = 0; F.keisen = 100;   // 北条の継戦の見込み（画面には出さない。支城・石垣山・伊達・評定で下がる）
    // ---- 豊臣方：自分の手勢と、井伊直政の手（赤備え） ----
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: II_JIN.x - 4, z: II_JIN.z + 8 }, facing: -Math.PI / 2, width: 12, aggro: 9, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }, { type: 'gun', n: 2 }], TOYO));   // 雨の夜討ちは寄せ手も火縄が湿る。飛び道具は弓を主に
    F.ii = allyGroup(rt, { faction: 'oda', name: '井伊勢', anchor: { x: II_JIN.x - 6, z: II_JIN.z - 6 }, facing: -Math.PI / 2, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '井伊直政', hat: 'kabuto', haori: 0, horse: true, invuln: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 4 }, { type: 'gun', n: 2 }], II));
    F.naomasa = F.ii.units[0];
    F.ii2 = allyGroup(rt, { faction: 'oda', name: '井伊勢の二の手', anchor: { x: II_JIN.x - 2, z: II_JIN.z - 18 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }], II));
    // 松平康頼の手（史実：井伊と共に篠曲輪へ寄せた。前は名も旗も無かった）
    F.yasu = allyGroup(rt, { faction: 'oda', name: '松平康頼の手', anchor: { x: YASU_JIN.x - 4, z: YASU_JIN.z }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平康頼', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], TOKU));
    for (const g of [F.mine, F.ii, F.ii2, F.yasu]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: II_JIN.x + 2, z: II_JIN.z + 10 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    camps(rt);
    // 雲に覆われた雨の夜：支度の時から星と月を出さず、遠くの山並み（白く浮いて雪山に見えた・稜線がはっきり見えた）も雲に隠す（critic60 小田原 21）。二十六日の朝に戻す
    { const W0 = rt.world; if (W0.stars) W0.stars.visible = false; if (W0.moon) W0.moon.visible = false; if (W0.mountains) W0.mountains.visible = false; }
    sogamae(rt);
    sogamaeWall(rt);
    ichiyajo(rt);
    fleet(rt);
    hojin.place(rt, { CASTLE });   // 11/9 布陣図（docs/fujin/t12_odawara.md）：石垣山の秀吉・早川口の宇喜多・北の秀次ら
    shinoGuard(rt);
    seats(rt);

    // 11/8 15分の構成：始めは六月の初めの昼（陣を回る段）。六月二十二日の雨の夜は sortie.js の night の段で
    rt.world.setTime('day', true);
    rt.world.setRainTarget(0); rt.world.rainLevel = 0;
    if (W.mountains) W.mountains.visible = true;
    F.day = -1;
    this.shinoArm(rt, false);
    rt.setPhase('brief');
    rt.obj('main', '囲みを保ち、小田原城を開かせる', 'main');   // 戦の全体の目当て（段ごとの行き先は depth の 'dp'。前は一つ目の段の字が最後まで残った）
    // 戦の前（使番が石垣山の殿下の下知を伝える。秀吉はここにいない）
    rt.say('使番', `${nm(rt)}殿は井伊直政殿の手に加われ。家康殿の本陣へ下知を受けに参られよ`, 4.5);
    rt.after(5, () => rt.say('井伊直政', '天正十八年の夏。殿下の囲みは、もう二月になる', 4));
    rt.after(9.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true;
    rt.setPhase('siege');
    sfx('taiko', 0.8);
    const friends = () => [F.mine, F.ii, F.ii2, F.yasu].filter((g) => !gone(g));
    // 段のファイル（t12_odawara/*.js）へ渡す場所と道具
    const H = F.endH = { IE_FRONT: { x: IE_JIN.x - 18, z: IE_JIN.z + 6 }, IE_WAY: { x: 146, z: -114 }, LOOKOUT: { x: 138, z: -96 }, KGATE, WATCH: { x: KGATE.x + 6, z: KGATE.z + 10 }, II_JIN, ISHI, CASTLE, SANNO_IN, KIDO_F, BANK: { x: 136, z: -78 }, RIVER_X: 131,
      FUSHIN: { x: -64, z: 82 }, SCOUT_FROM: [{ x: -36, z: 56 }, { x: -24, z: 74 }, { x: -46, z: 50 }],
      MAEDA_JIN: { x: 142, z: -150 }, UJINORI: { x: 152, z: -170 }, UESUGI_JIN: { x: 150, z: -134 }, BEACH: { x: 150, z: -58 }, IE_VIEW: { x: 140, z: -100 },
      HOJO, TOYO, dress, clearFoes, warp: (rt2, x, z, h) => warpTo(rt2, x, z, h), shinoArm: (rt2, on) => this.shinoArm(rt2, on) };
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends, look: (list) => dress(list, HOJO), scale: 1.4, mass: 0, backing: false, fixedSpawn: true, dmg: 0.6 }, [
      jinmawari.step(H),
      // 11/10 指示書（docs/odawara_spec_1109.md 2:30〜5:00）：総構えへ近づき、正面からは無理だと自分で確かめる（昼。城内へは入らない）
      DP.move({ to: KIDO_F, obj: '北条方の防御線を確かめよ。山王川を渡り、総構えの堀の前まで寄せよ', label: '総構えの堀', r: 7, max: 90,
        say: [['井伊直政', '殿下は城を攻めるなと仰せじゃ。されど堀と土塁を、この目で確かめて参れ'], ['足軽', '土塁の上に鉄砲が並んでおる……']],
        ambush: { d: 30, say: ['手勢の侍', '土塁と櫓から一斉に撃って来る！　伏せよ！'], foes: () => [] } }),
      DP.fight({ at: KIDO_F, title: '北条勢が打って出た', sub: '篠曲輪の木戸から', obj: '木戸から打って出た北条勢を、堀の前で押し返せ。城内へは入るな',
        say: [['井伊直政', '返せ！　ただし木戸へは入るな。深入りすれば、総構えの鉄砲の的じゃ']],
        foes: () => [{ name: '篠曲輪から打って出た北条勢', from: { x: SHINO_C.x + 2, z: SHINO_C.z }, width: 6, dmg: 0.45, noGuard: true, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }] }],
        later: [{ t: 22, foes: () => [{ name: '篠曲輪の二番手', from: { x: SHINO_C.x, z: SHINO_C.z + 3 }, width: 6, dmg: 0.45, noGuard: true, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }] }], say: ['足軽', '木戸からまだ出て来る！'] }],
        max: 150, noRefill: true, reward: '打って出た北条勢を返した', onEnd: (rt2) => rt2.player.treatWounds(0.3) }),
      DP.move({ to: H.BANK, obj: '前衛を退かせろ。山王川の東の岸まで退け', label: '山王川の岸', r: 8, max: 80,
        say: [['使番', '深入りするな！　殿下の下知じゃ。岸まで退け！'], ['手勢の侍', 'あの堀と土塁……正面から攻めれば、何千と死ぬ'], ['井伊直政', 'それゆえの囲みよ。城は攻めずに、心を折る']] }),
      shijo.step(H),
      junkai.step(H),
      // 石垣山の普請の時の経ち（山林→普請→石垣→櫓→陣幕）。一晩で魔法のように建てない
      DP.rest({ dur: 13, heal: 0, fn: (rt2) => {
        rt2.banner('四月', '笠懸山の林の中で、普請が始まる');
        rt2.after(4.3, () => rt2.banner('五月', '林に隠れて、石垣を積む'), true);
        rt2.after(8.6, () => rt2.banner('六月', '櫓と白壁、陣幕が揃う'), true);
      }, say: [['普請の奉行', '小田原の側の林は残せ。城の中から見えてはならぬ', 4], ['普請の奉行', '人足四万、八十日。……あと一晩で仕上げる', 4]] }),
      ishigakiSt.step(H),
      // ⑥ 六月二十六日：井伊の陣から石垣山の城を見届ける。
      // 11/6 kaito 二4：前は 12 秒で過ぎ、城が写らなかった（陣から石垣山は約三百 = 実の二・四km で、全戦で描く遠さ 150 の外だった）。
      //   場面を長くし、城は視点から同じ向き・同じ見かけの大きさのまま百の内へ縮めて置く（update の ichiyaView）
      castleReveal(DP.rest({ dur: 26, banner: ['六月二十六日', '石垣山の林が伐られ、山の上に白い城が現れた'],
        fn: (rt2) => {
          rt2.flags.day = 1; rt2.world.setTime('morning', true); rt2.world.setRainTarget(0); rt2.world.rainLevel = 0;   // 雨は上がり、土だけ湿る
          if (rt2.world.mountains) rt2.world.mountains.visible = true;
          const I = rt2.flags.ichiya; if (I) { I.castle.visible = true; I.wood.visible = false; }
          // 南西の山の上の城へ行き先の印を立てる（カメラは勝手に回さない。印と目標で振り向かせる）
          rt2.marker('dp', () => ({ x: ISHI.x - 4, z: ISHI.z }), () => '石垣山の城', { h: 24 });
          sfx('horagai', 0.7);
          rt2.flags.keisen = Math.max(0, (rt2.flags.keisen ?? 100) - 25);
          // 伊達政宗の参陣：北から新しい旗の列がまた豊臣方へ（戦わせない。遠くに見せるだけ）
          rt2.after(12, () => {
            const g = allyGroup(rt2, { faction: 'oda', name: '伊達の列', anchor: { x: 172, z: -226 }, facing: Math.PI, width: 3, formation: 'column', aggro: 0, noRout: true, noAI: true, fullStrength: true,
              order: 'move', dest: { x: 176, z: -176 }, speed: 2 },
            dress([{ type: 'busho', n: 1, o: { name: '伊達政宗', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 }], { flag: 'date', armor: 0x1e1e22 }));
            g.peaceful = true; for (const u of g.units) { u.invuln = true; u.noTarget = true; }
            rt2.flags.dateCol = g;
          });
        },
        say: [['北条の兵（土塁の上）', '山の上に城が……！　一夜で、城が建ったぞ！'], ['手勢の侍', '昨日まで林だった所に、石垣と白壁と、殿下の旗……'], ['井伊直政', '北条の者は、戦わずに見せつけられた。……もう逃げ道は無い'],
          ['使番', '奥州の伊達政宗殿の勢、なお続々と着到！　北の道を来られる'], ['手勢の侍', 'まだ増えるのか……東北の果てまで、殿下に従うたか'], ['使番', '海は九鬼殿の船が塞いだ。陸も海も、囲みは閉じた']] })),
      hyojo.step(H),
      // ⑦ 七月の初め：時が飛ぶ。官兵衛が井伊の陣に来て、主人公と城へ歩く
      //   官兵衛（孝高）は六月二十四日から滝川雄利と開城を説き、肩衣・袴で刀を帯びずに城へ入って氏政・氏直に会った（黒田家譜）。日は伝わらないので「七月の初め」。開城の申し出は七月五日
      DP.rest({ dur: 5, heal: 1, banner: ['七月の初め', '井伊の陣へ黒田官兵衛が来た'],
        fn: (rt2) => {
          const F2 = rt2.flags; F2.day = 2; rt2.world.setTime('day');
          rt2.unmark('dp');
          clearFoes(rt2);   // 瞬時に移さない（kaito 二6）。夜討ちの残りの北条勢は城へ引き揚げた。主人公は井伊の陣のまま
          ceasefire(rt2);   // 使いの到着の札を出す五秒間も、夜討ちの狙いと振りかぶりを残さない
        },
        say: [['使番', '黒田勘解由殿が刀を帯びず、氏直殿に城を開くよう説きに参られる', 4]] }),
      escort(),
      kaijoSt.step(H),
    ].map(requiredStep), (rt2) => this.win(rt2));
    F.dpIx = Object.fromEntries(F.dp.steps.map((s0, i) => [s0.key || i, i]));
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
    rt.banner('小田原城　開城', '天正十八年七月五日　氏直が城を出て降る');
    rt.player.u.invuln = true;
    // 戦の後：北条の旗が下がり、天下統一の日本地図、家康の「次は、関八州か。」（t12_odawara/tenka.js）
    tenka.ending(rt, F.endH || { IE_VIEW: { x: 140, z: -100 }, CASTLE, warp: warpTo });
    rt.finish({}, 54);
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
    rt.say('使番', late ? '日が暮れた。開城の話は、振り出しじゃ' : '黒田殿が討たれた……開城の話は、振り出しじゃ', 4);
    rt.finish({ failureReason: late ? '官兵衛を本丸の門まで届けられなかった' : '開城の使いの官兵衛が討たれた' }, 6);
  },

  // 総構えの偵察・打って出の間は狭間から撃ち、撤退と開城の使いの道では止める。
  shinoArm(rt, on) {
    const G = rt.flags.shinoGuns;
    if (!G) return;
    G.fire = !!on;
    for (const u of G.units) if (u.type === 'gun') u.gunAmmo = on ? 20 : 0;
  },

  update(rt, dt) {
    const F = rt.flags;
    ichiyaView(rt);
    tenka.tick(rt);
    if (F.settleKaijo) F.settleKaijo();
    if (F.ending) return;
    depthTick(rt, dt);
    riverFeet(rt);
    // 使いの道から開城の見届けまで停戦と城外の待機を保つ。
    if (F.envoy) ceasefire(rt);
    // 本陣の将と旗本は持ち場を離れない（共通の寄せ・助けの下知が掛かっても、毎コマ本丸・本陣へ戻す。kaito AR3）
    for (const [g, at] of [[F.hojo, CASTLE], [F.ieyasu, { x: IE_JIN.x - 2, z: IE_JIN.z }]]) {
      if (!g) continue;
      g.order = 'hold'; g.aggro = 0; g.focus = null; g.onArrive = null; g.anchor.x = at.x; g.anchor.z = at.z;
      for (const u of g.units) if (u.alive && u.target && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 10) { u.target = null; u.atk = null; }
    }
    // 夜討ちの段を外した後も、偵察で近づいた寄せ手を実際に狙う。
    const G = F.shinoGuns;
    const firing = !F.envoy && F.dp?.on && (F.dp.i === 1 || F.dp.i === 2);
    if (G && G.fire !== !!firing) this.shinoArm(rt, !!firing);
    if (F.kanU && !F.kanU.alive) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.demukae || g === F.sannoBan || g === F.hojo) return;   // 出迎え・口の番・本丸は戦っていない（勝ちの後に「崩れた」と言わない）
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

t12_odawara.force = (rt) => ({ a: Math.round(210000 - (rt.flags.ak || 0) * 30), a0: 210000, b: Math.max(0, 50000 - (rt.flags.ek || 0) * 40), b0: 50000 });
t12_odawara.noTaishoRaid = true;   // 本丸の当主の旗本は本丸を出ない（本陣の将は前に出ない・kaito AR3）
t12_odawara.sides = { a: { name: '豊臣軍', mon: 'toyotomi' }, b: { name: '北条軍', mon: 'hojo' } };
t12_odawara.date = (rt) => { const d = rt.flags.day; return d === 3 ? '天正十八年（1590）七月五日　開城' : d === 2 ? '天正十八年（1590）七月の初め　初秋・晴' : d === 1 ? '天正十八年　六月二十六日　朝' : d === 0.5 ? '天正十八年　六月二十五日　夜' : d === -0.5 ? '天正十八年　六月二十四日　昼' : d === -1 ? '天正十八年（1590）六月の初め　昼' : '天正十八年　六月二十二日　雨の夜'; };
t12_odawara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t12_odawara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t12_odawara.history = '天正十八年（1590）、豊臣秀吉はおよそ二十一万の軍で関東の北条氏を攻めた。前の年、北条方が真田の名胡桃城を奪ったことが、秀吉の裁き（惣無事）を破ったとされ、戦の発端となった。徳川家康・前田利家・上杉景勝・宇喜多秀家・小早川隆景ら全国の大名が加わり、九鬼嘉隆・長宗我部元親らの水軍が海を塞いだ。北条氏政・氏直は、城下の町ごと堀と土塁で囲んだ小田原城の総構え（およそ九km）に、五万余りで籠もった。秀吉は総攻めをせず、城を見下ろす石垣山に城を築いた。家康は城の東、山王川と酒匂川の間に陣を置いた。六月二十二日の雨の夜、家康の家臣の井伊直政と松平康頼が堀を渡り、山王口の外の出丸・篠曲輪を攻めて旗を立てたが、城中から出た北条勢に防がれ、後押しも無く退いた。小田原の陣で城へ攻め入ったのは、ほぼこの一度だけである。二十六日ごろ、石垣山の城のまわりの木を伐り、一夜で現れたように見せたと伝わる（実は八十日ほどかけて築いた）。その間に山中・韮山・松井田・鉢形・八王子などの支城が次々に落ち、重臣の松田憲秀の内通も露見して城の中は揺れた。黒田官兵衛（孝高）・滝川雄利らが開城を説き（官兵衛は肩衣と袴で刀を帯びずに城へ入ったと伝わる）、七月五日に氏直が自らの命と引き換えに城の者を助けるよう申し出て降った。十一日に氏政と弟の氏照は腹を切り、氏直は高野山へ送られた。十三日に秀吉が城に入り、北条の旧領の関東は徳川家康に与えられ、家康は江戸へ移った。\n篠曲輪の形、井伊勢と篠曲輪の守りの人数、主人公が井伊の手に加わること、官兵衛を本丸の門まで送る道筋は遊びのための復元である。両軍の人数は推定で、北条方の数には別の伝えもある。';
t12_odawara.bushou = [{ name: '井伊直政', g: /直政/ }, { name: '黒田官兵衛', g: /官兵衛/ }];

// 素直な遊び手：段の頭（depthBot）に任せる。段の前は陣のそばで待つ
t12_odawara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  // 人が印を見て振り向くのと同じく、自動の遊び手だけが城へ向く。
  // 休む段には歩く行き先が無いため、段の頭だけでは城を見ないまま止まる。
  if (F.dp?.on && F.dp.cur?.s.key === 'ichiya') {
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    inp.leftPressed = false; inp.guardHold = false; inp.runHeld = false; inp.chargeHold = false;
    if (Math.hypot(u.pos.x - II_JIN.x, u.pos.z - II_JIN.z) >= 20) {
      goTo(p, inp, II_JIN.x - 2, II_JIN.z + 6, 4);
    } else {
      p.yaw = Math.atan2(ISHI.x - 4 - u.pos.x, ISHI.z - u.pos.z);
      p.camYawOff = 0;
      p.pitch = Math.atan2(b.world.heightAt(ISHI.x, ISHI.z) + 24 - u.pos.y - 1.6,
        Math.hypot(ISHI.x - 4 - u.pos.x, ISHI.z - u.pos.z));
    }
    return;
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, II_JIN.x, II_JIN.z + 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t12_odawara);

export { t12_odawara };
export default t12_odawara;
