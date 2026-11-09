// ======================================================================
// 豊臣編⑤　四国征伐／一宮城（天正十三年 1585 六月〜七月。旧暦の六月は晩夏、七月は初秋）　docs/chapter2_toyotomi.md の「5.」が正
// 羽柴秀長・秀次の大軍が阿波へ渡り、長宗我部方の谷忠澄・江村親俊が守る一宮城を囲んだ。秀長は城の水の手を断ち、
// 城兵は水に苦しんだ。谷忠澄は城を開き、元親に降伏を説いた。
// 自分は秀長の下の部将。水の手を断つ別の手を率いる：
//   1 鮎喰川を渡り、麓の砦を落とす → 2 西の谷の口の伏兵を討つ → 3 城へ水を引く湧き水の番兵を追い払う
//   → 4 金掘り衆が坑道で水脈を断つまで、取り返しに来る城兵を退ける（水脈を断った伝えは『太閤記』『南海治乱記』など軍記の話）
//   → 5 退く城兵に付け入って搦手の門へ駆け込み、小倉丸を取る（山中城の付け入りの型）→ 本丸の口で開城の使者を迎える。
//   秀長の本隊は東の大手を攻め、城は東・北・西から囲まれる（谷忠澄の伝え）。秀次は岩倉城・脇城へ回り、ここにはいない。負け方：水場を取り返される。
// 兵数（docs/battle_refs/t05_ichinomiya.md）：秀長の阿波勢およそ五万、城兵およそ九千。総大将の秀長は河原の北の本陣を動かない。
// 座標：北が −z、南が +z（右上の地図の「北」と同じ）。一宮城は鮎喰川の南岸の山城で、川を前に、背に山を負う。
// 北の河原から川を渡り、南の城山へ攻め上る。城山・西の尾根・川筋は一宮町の形を縮めて置いた推定（11/5 までは川が城の南にあった）。
// 縄張り（docs/battle_refs/t05_ichinomiya.md）：城山は東西に延びる尾根。西の頂に本丸、東の峰に明神丸、間を堀切で断つ。
// 本丸の北の下に小倉丸、明神丸の北に才蔵丸。天正十三年は長宗我部の土の城（切岸・土塁・板塀。天守は無い。本丸の石垣は後の蜂須賀の普請とみる）。
// 城の貯水池は曲輪の中（小倉丸・椎丸・水手丸が囲む）。攻め手が断ったのは、そこへ水を引く谷の湧き水（水脈）とする。
// 鮎喰川は城山の北の河原を東へ流れ、東で北へ曲がって吉野川へ向かう。大手は東の麓から明神丸へ、搦手は西の谷（水の手）から小倉丸へ。
// 国土地理院の標高（asset_dem_ichinomiya.js・tools/dem.mjs の ichinomiya）が読めた時だけ、遠い山肌に実測の凹凸を足す。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { distToPolyline } from './world.js';
import { nobori, hut, yagura, jinmaku, palisade, takataba } from './props.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { TOYO_HACHISUKA_KACCHU } from './kacchu_data.js';
import { heightOf, buildCastlePlan, rectPoly, inPoly } from './castle_plan.js';
import { castleBoardFence, ishigaki, solidRect } from './props.js';
import { RANKS } from './state.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, depthBot, rest, fight, hold, move } from './b_depth.js';
import { STAGES } from './stages.js';
// 約15分の段（docs/toyo15_plan_1108.md の 8）：足した段の中身は src/t05_ichinomiya/ の各ファイル
import { install as ichiIntro } from './t05_ichinomiya/intro.js';
import { oshiStep } from './t05_ichinomiya/oshimodoshi.js';
import { depth as ichiDepth } from './t05_ichinomiya/depth.js';
import { withGuard } from './toyo_bot.js';

// ---------------- 場所 ----------------
const SPAWN = { x: 24, z: -168 };
const HONJIN = { x: 52, z: -166 };              // 秀長の本陣（河原の北）。11/9 二巡：移動の限り（176）の内へ（旗本が戦場の外に出ていた）
const HILL = { x: 0, z: 112 };                  // 一宮城山（東西の尾根の真ん中）
// 尾根の背 [x, z, 高さ]：西の頂が本丸、鞍部（堀切）を挟んで東の峰が明神丸、東の麓（大手）へ下る
const SPINE = [[-150, 150, 18], [-72, 124, 34], [-20, 118, 44], [6, 112, 37], [34, 108, 42], [82, 96, 24], [140, 78, 6]];
const RIDGE = { x: -178, z: 50 }, RIDGE_H = 30, RIDGE_R = 104;    // 西の尾根（城山との間が水の手の谷）
const FORT = { x: 30, z: -52 };                 // 麓の砦
const VALLEY = { x: -70, z: -18 };              // 谷の口
const KNOLL_W = { x: -108, z: -8 }, KNOLL_E = { x: -40, z: 6 };   // 谷の口の両脇の小山（林）
const OGURA_IN = { x: -16, z: 98 };             // 小倉丸の中（搦手の門をくぐった所）
const OGURA_POLY = rectPoly(-32, 0, 90, 106);
const WATER = { x: -86, z: 40 };                // 水の手（城へ水を引く湧き水）
const WATER_FRONT = { x: -86, z: 30 };          // 溜めの前（溜めは石積みで入れない。行き先と守る所はその北の前）
const ADIT = { x: -78, z: 50 };                 // 金掘り衆の坑道の口（水脈を断つ）
// 坑道の口の前（溜めの東。湧き水を守る段の持ち場。前は溜めの北の前を持ち場にし、坑道の口へ寄せる城兵と二十m 離れて一度も斬り合わなかった。11/6 遊び）
const ADIT_FRONT = { x: -74, z: 44 };
const HON_GATE = { x: -16, z: 90 };             // 本丸の前（搦手の口）
// 鮎喰川（西から東へ）。浅瀬が多く、どこでも歩いて渡れる深さにする
// 東で北へ曲がる（一宮の町の先で鮎喰川は北東へ向きを変え、吉野川へ注ぐ）
const RIVER = [[-300, -96], [-200, -108], [-110, -98], [-20, -110], [60, -100], [150, -108], [205, -130], [236, -190], [252, -260], [262, -340]];
const ROAD = [[SPAWN.x, SPAWN.z], [26, -120], [30, -70], [FORT.x, FORT.z]];
const VALLEY_ROAD = [[FORT.x, FORT.z], [-20, -34], [VALLEY.x, VALLEY.z], [WATER.x, WATER.z]];
// 搦手の道：水の手から尾根の裾を斜めに上り、門の正面（北）へ回り込む（前は門の西の切岸の裾へ突き当たり、そこで立ち往生した。11/6 遊び）
const KARAMETE = [[WATER.x, WATER.z], [-62, 68], [-40, 79], [-18, 81], [HON_GATE.x, HON_GATE.z]];
// 右上の目標は戦の間ずっと同じ五つの一行（言い替えない。地図で分かる場所の名と行い。kaito 三1・九1・十1）
const NUM = '①②③④⑤⑥';
// 右上の一行が二行に折れて「攻め入／る」と一字だけ落ちた（11/8 critic60 五）。一行に収まる短さに
const GOALS = ['鮎喰川を渡り麓の砦を落とす', '西の谷の口で伏兵を討つ', '谷の湧き水の番兵を追い払う', '谷の湧き水で金掘り衆を守る', '山道で城兵の打ち出しを押し返す', '搦手の門から小倉丸へ入る'];
// 二つ目の竹束から曲輪へ直進すると門の西の塀に当たる。門の正面を経由する。
const COVER_ROUTE = [{ x: -46, z: 69 }, { x: -30, z: 73 }, { x: HON_GATE.x, z: 81 }, OGURA_IN];
const OTE = [[150, 50], [104, 70], [74, 88], [56, 106]];   // 大手道（東の麓から明神丸の東の口へ。見せるだけ）

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
let dem = null;
// 標高の束（tools/dem.mjs の ichinomiya）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t05_ichinomiya = Object.freeze([...assetsForBattle(''), 'dem_ichinomiya']);
useTerrain('dem_ichinomiya', (d) => { dem = d; });
// 折れ線（高さ付き）への最も近い所の距離と背の高さ
function spineAt(x, z) {
  let best = Infinity, bh = 0;
  for (let i = 0; i < SPINE.length - 1; i++) {
    const [ax, az, ah] = SPINE[i], [bx, bz, bh2] = SPINE[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bh = ah + (bh2 - ah) * t; }
  }
  return [best, bh];
}
// 尾根を横に断つ溝（堀切・竪堀）：a→b の線から w/2 の内を、深さ deep の薬研に掘る
const CUTS = [
  { a: [6, 96], b: [6, 130], w: 8, deep: 4.5 },        // 本丸と明神丸の間の堀切
  { a: [-48, 104], b: [-52, 138], w: 7, deep: 3.5 },   // 本丸の西の堀切（尾根続きを断つ）
  { a: [62, 96], b: [74, 62], w: 3.2, deep: 1.6 },     // 明神丸の北東の竪堀
  { a: [14, 96], b: [16, 64], w: 3.2, deep: 1.6 },     // 鞍部から北へ落ちる竪堀
];
function cutAt(x, z) {
  let dip = 0;
  for (const c of CUTS) {
    const [ax, az] = c.a, [bx, bz] = c.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = ((x - ax) * dx + (z - az) * dz) / l2;
    if (t < -0.05 || t > 1.05) continue;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t), hw = c.w / 2;
    if (d < hw) dip = Math.max(dip, c.deep * (1 - d / hw) * sm(Math.min(t + 0.05, 1.05 - t) / 0.15));
  }
  return dip;
}
// 水の手の湧き水（石で囲った四角い溜め。底は 1.3m 下がる。ここから城の貯水池へ水が通う）
const POOL = { x0: WATER.x - 5, x1: WATER.x + 5, z0: WATER.z - 3.5, z1: WATER.z + 3.5 };
let HOLLOW = null;
// 坑道の口の土手：口の後ろの山肌を 2.4m 盛り上げ、前に掘り込んだ切り面を作る（地形そのものなので草と土の色が続く）
const ADIT_FACE = Math.atan2(WATER.x - ADIT.x, WATER.z - ADIT.z);
function bankAt(x, z) {
  const fx = Math.sin(ADIT_FACE), fz = Math.cos(ADIT_FACE), rx = x - ADIT.x, rz = z - ADIT.z;
  const b = -(rx * fx + rz * fz), l = Math.abs(rx * fz - rz * fx);
  if (b < 0 || b > 10 || l > 6) return 0;
  return 3.4 * sm(b / 0.7) * sm((10 - b) / 3) * sm((6 - l) / 2.2);   // 前の面を切り立て、口の上にも土が被さる（前は 2.4m のなだらかな土手で、黒い板を坂に立てたように見えた。11/6 critic60）
}
function base(x, z) {
  let h = 2 + 0.6 * Math.sin(x * 0.02) * Math.cos(z * 0.017);
  // 城山：背から横へ 9m を越えると 0.45 の勾配で麓へ落ちる（尾根の上は細い平らな背）
  const [sd, sh] = spineAt(x, z);
  h = Math.max(h, sh - 0.45 * Math.max(0, sd - 9) + 0.8 * Math.sin(x * 0.07) * Math.cos(z * 0.05));
  h += RIDGE_H * sm(1 - Math.hypot(x - RIDGE.x, z - RIDGE.z) / RIDGE_R);
  // 城の背（南）と西の外は阿波の山並み（東竜王山）へ上がる（東は鮎喰川の谷の向こうで上がる）
  h += Math.max(0, z - 190) * 0.35 +Math.max(0, -x - 200) * 0.3 + Math.max(0, x - 285) * 0.3;
  // 西の谷の口：両脇に木の茂る小山を置き、道はその間の窪みを通る（前は谷の口が平らな野原で、伏兵が丸見えで横一列に待った。11/6 critic60）
  h += 13 * sm(1 - Math.hypot(x - KNOLL_W.x, z - KNOLL_W.z) / 34) + 12 * sm(1 - Math.hypot(x - KNOLL_E.x, z - KNOLL_E.z) / 30);
  h -= cutAt(x, z);
  // 湧き水は谷の窪み（半径十m）に溜まる。地面の格子は数m と粗く、坂のままでは上の側の土が溜めの水面を突き抜けた（11/5 写真）。
  // 窪みの底を溜めの所の高さより下げて平らにする
  const hd = Math.hypot(x - WATER.x, z - WATER.z);
  if (hd < 11 && HOLLOW !== false) {
    if (HOLLOW == null) { HOLLOW = false; HOLLOW = base(WATER.x, WATER.z - 5) - 0.6; }   // 底の高さは窪みを掘る前の溜めの北の地面から（一度だけ）
    h += (Math.min(h, HOLLOW) - h) * sm((11 - hd) / 5);
  }
  if (((x - WATER.x) / 5) ** 2 + ((z - WATER.z) / 3.5) ** 2 < 1) h -= 1.3;   // 湧き水の溜めは丸い窪み（前は四角い石積みでコンクリートの水槽に見えた。11/6 critic60）
  h += bankAt(x, z);
  // 河原は広く平らに
  const rd = distToPolyline(x, z, RIVER);
  if (rd < 30) h -= (1 - rd / 30) * 1.2;
  // 実測の凹凸は、戦う所から離れた山肌だけ
  if (dem) {
    const away = sm((Math.min(Math.hypot(x - HILL.x, z - HILL.z), Math.hypot(x - WATER.x, z - WATER.z), Math.hypot(x - FORT.x, z - FORT.z)) - 120) / 40);
    if (away > 0) h += away * demDetail(dem, x, z, { xy: 1, win: 60, scale: 0.3 });
  }
  return h;
}

// ---------------- 縄張り（castle_plan.js） ----------------
// 曲輪の高さはその所の地形から決める（尾根の背の形を変えても追随する）。塀は狭間を切った板塀、縁は土塁と切岸
const lv = (x, z, up = 0.5) => (b) => b(x, z) + up;
const PLAN = {
  mon: 'chosokabe', name: '一宮城', type: 'yama', year: 1585, gateSlope: 7, terrainBanks: true, continuousEdges: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: lv(-20, 118), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'hon', poly: rectPoly(-36, -6, 110, 128), gapAt: [[-16, 110]], gapW: 4.4 },
    { id: 'ogura', name: '小倉丸', level: lv(-16, 98), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'ni', poly: rectPoly(-32, 0, 90, 106), gapAt: [[-16, 106], [HON_GATE.x, 90]], gapW: 4.4 },
    { id: 'myojin', name: '明神丸', level: lv(34, 108), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'ni', poly: [[20, 96], [48, 96], [54, 108], [46, 124], [18, 122]], gapAt: [[54, 108], [34, 96]], gapW: 4.4 },
    { id: 'saizo', name: '才蔵丸', level: lv(34, 86, 0.4), wall: 'saku', kind: 'koshi', poly: rectPoly(22, 46, 78, 92), gapAt: [[34, 92]], gapW: 4.4 },
  ],
  koguchi: [
    { id: 'karamete', name: '搦手の門', from: 'out', to: 'ogura', kind: 'hira', gate: 'yagura', at: [HON_GATE.x, 90], rot: Math.PI, w: 4.4 },
    { id: 'hon', name: '本丸の口', from: 'ogura', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-16, 110], rot: Math.PI, w: 4.4 },
    { id: 'ote', name: '大手の門', from: 'out', to: 'myojin', kind: 'hira', gate: 'yagura', at: [54, 108], rot: Math.PI / 2, w: 4.4 },
    { id: 'saizo', name: '才蔵丸の口', from: 'saizo', to: 'myojin', kind: 'hira', at: [34, 96], rot: Math.PI, w: 4.4 },
  ],
  // 横矢：搦手の門の両脇と、大手の門の上に井楼。狭間の板塀と合わせて、門へ寄る者を二方から撃つ
  yagura: [
    { id: 'kara_w', name: '搦手の西の櫓', at: [-29, 93], rot: Math.PI },
    { id: 'kara_e', name: '搦手の東の櫓', at: [-3, 93], rot: Math.PI },
    { id: 'hon_n', name: '本丸の櫓', at: [-32, 124], rot: 0 },
    { id: 'myo_e', name: '明神丸の櫓', at: [44, 100], rot: Math.PI / 2 },
  ],
  // 天守の無い土の城：本丸の奥に板葺きの主殿（北城の将・江村親俊の居所。谷忠澄は南城の側を守った）
  lordSeat: { kind: 'goten', at: [-22, 121], rot: Math.PI, w: 11, d: 6, name: '本丸の主殿', boardRoof: true },
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }
// 曲輪とその縁の m の内（木を生やさない所）
const inCastle = (x, z, m) => PLAN.kuruwa.some((k) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].some(([dx, dz]) => inPoly(k.poly, x + dx, z + dz)));

// 長宗我部方の見た目：七つ片喰の旗と、黒茶の具足（FACTION に無い家なので o で分ける）
// 威し糸は紺に近い黒（前は鶯の緑。標準 四3「緑・紫・橙は出さない」）
const CHOSO = { flag: 'chosokabe', armor: 0x3a3024, lace: 0x2c3038, hatColor: 0x2e2a22 };
const look = (list) => list.map((q) => ({ ...q, o: { ...CHOSO, ...(q.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uB = (n) => ({ type: 'bow', n }), uG = (n) => ({ type: 'gun', n });

// ---------------- 小道具 ----------------
function buildStage(rt) {
  const W = rt.world, S = rt.scene;
  // 麓の砦：柵の輪（川の側＝北の口を空ける）と井楼、片喰の旗
  const R = 13, N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    if (Math.cos((a0 + a1) / 2) < -0.9) continue;   // 北（−z）の口
    S.add(palisade(W, [FORT.x + Math.sin(a0) * R, FORT.z + Math.cos(a0) * R, FORT.x + Math.sin(a1) * R, FORT.z + Math.cos(a1) * R]));
  }
  // 井楼は柵の内の南東の隅（前は南西の隅にあり、加勢を迎える斬り合いで肩越しのカメラが井楼の中へ入った。11/6 遊び）
  S.add(yagura(W, FORT.x + 7, FORT.z + 6, { team: 1, mon: 'chosokabe' }));
  for (const [dx, dz] of [[-9, -8], [9, -8], [0, 11]]) S.add(nobori(W, FORT.x + dx, FORT.z + dz, 'chosokabe', 5));
  // 城：曲輪・切岸・土塁・狭間の板塀・櫓門・井楼・主殿（縄張りは PLAN）
  rt.flags.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, buildGates: true, buildTowers: true, interiorGuards: false });
  // 水の手：城へ水を引く湧き水を石で囲った溜めと、番小屋
  // 谷の窪みに湧いた水：丸い水面を、大小の自然の石がぐるりと縁取る（前は四角い石積みで、コンクリートの水槽に見えた。11/6 critic60）
  const P = POOL, ring = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ring.push([WATER.x + Math.sin(a) * 5.1, WATER.z + Math.cos(a) * 3.6]); }
  const rimY = Math.min(...ring.map(([x, z]) => W.heightAt(x, z))) - 0.35;
  {
    const stoneGeo = new THREE.DodecahedronGeometry(1, 0), stoneMat = new THREE.MeshLambertMaterial({ color: 0x6b665c });
    const rocks = new THREE.InstancedMesh(stoneGeo, stoneMat, 26), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08, rr = 1 + Math.sin(i * 3.1) * 0.06;
      const x = WATER.x + Math.sin(a) * 5.2 * rr, z = WATER.z + Math.cos(a) * 3.7 * rr, sc = 0.45 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 0.5;
      e.set(Math.sin(i) * 0.6, i * 1.7, Math.cos(i * 2.3) * 0.5); q.setFromEuler(e); v.set(sc * 1.3, sc * 0.8, sc);
      m4.compose(new THREE.Vector3(x, W.heightAt(x, z) - sc * 0.25, z), q, v); rocks.setMatrixAt(i, m4);
    }
    S.add(rocks);
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x24342e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9 }));
  pond.scale.set(4.9, 3.4, 1);
  pond.rotation.x = -Math.PI / 2; pond.position.set(WATER.x, rimY, WATER.z);
  S.add(pond, hut(W, WATER.x - 12, WATER.z + 8, 5, 4, 0.3, { h: 2.4 }));
  solidRect(WATER.x, WATER.z, P.x1 - P.x0, P.z1 - P.z0);   // 坂の下では水面が地面より上にある。人と馬は溜めへ入らない
  // 金掘り衆の坑道の口：山肌へ掘り込んだ暗い穴を、丸太の枠（二本の柱と冠木）で支える。掘り出した土の山を脇に
  {
    const y = W.heightAt(ADIT.x, ADIT.z), face = Math.atan2(WATER.x - ADIT.x, WATER.z - ADIT.z);
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), dark = new THREE.MeshBasicMaterial({ color: 0x0b0907 });
    const g = new THREE.Group(); g.position.set(ADIT.x, y, ADIT.z); g.rotation.y = face;
    // 穴は地形の土手（base の bankAt）の前の面に口を開ける。前は土の楔を板で組み、坂の上に平たい茶色の板が突き出て見えた（11/6 遊び）。
    //   口の暗がりは丸太の枠の内いっぱいに立て、枠の後ろへ土手が続く（寝かせた暗がりは斜めから歪んだ台形に見えた。11/6 写真）
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.98), dark); hole.position.set(0, 0.99, -0.25);
    // 口の奥へ続く暗がり（横から見ても板一枚に見えないよう、山肌の内へ二m の黒い穴を通す）と、冠木の上の土留めの板
    const lining = new THREE.MeshLambertMaterial({ color: 0x493c2b, side: THREE.BackSide });
    const deep = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.98, 2.2), lining); deep.position.set(0, 0.99, -1.1);
    hole.position.z = -2.18;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 0.12), wood); plank.position.set(0, 2.35, 0.05);
    g.add(deep, plank);
    const post = new THREE.CylinderGeometry(0.11, 0.13, 2.1, 6);
    const p1 = new THREE.Mesh(post, wood), p2 = new THREE.Mesh(post, wood); p1.position.set(-0.9, 1.05, 0.1); p2.position.set(0.9, 1.05, 0.1);
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.3, 6), wood); lintel.rotation.z = Math.PI / 2; lintel.position.set(0, 2.1, 0.1);
    // 掘り出した土の山は形で置かない（滑らかな橙の円盤に見えた。11/6 写真）。土手の盛り上がりがそれを兼ねる
    g.add(hole, p1, p2, lintel);
    S.add(g);
  }
  // 寄せ手が押し立てた竹束（城の鉄砲・矢を防ぐ。前＝+z を城へ向ける）：湧き水の前（搦手から下りる城兵の側）と、搦手の門へ上る道の脇
  const toKara = Math.atan2(-50 - WATER.x, 74 - WATER.z);
  for (const [x, z] of [[-76, 33], [-74.2, 34.2], [-72.4, 35.4], [-96, 31], [-94, 32]]) S.add(takataba(W, x, z, toKara));
  // 搦手の道（門の正面へ回り込む）を塞がないよう、道の北の脇へ寄せる
  for (const [x, z] of [[-32, 75.4], [-29.8, 76], [-27.6, 76.4], [-48, 70.6], [-46, 71.6]]) S.add(takataba(W, x, z, 0));
  // 城の曲輪の塀の内に片喰の幟を並べる（河原から見上げて、尾根の上が城と分かる。前は尾根に何も立たず普通の山に見えた。11/6 critic60）
  for (let x = -29; x <= -3; x += 6.5) S.add(nobori(W, x, 92.5, 'chosokabe', 6));
  for (let x = -33; x <= -9; x += 8) S.add(nobori(W, x, 112, 'chosokabe', 6));
  for (const [x, z] of [[24, 98], [36, 98], [46, 100]]) S.add(nobori(W, x, z, 'chosokabe', 6));
  // 秀長の本陣
  S.add(jinmaku(W, HONJIN.x, HONJIN.z, 14, 10, 6));
  for (const dx of [-8, 0, 8]) S.add(nobori(W, HONJIN.x + dx, HONJIN.z + 7, 'toyotomi', 6));
  // 城を囲む羽柴の本隊（東の大手・北東の川べり）。遊ぶ所から百五十m より遠い所だけに置く（kaito AA・AQ6）。
  // 前は始めの河原の目の前に軽い大軍と作り物の斬り合い（toyoClash）があり、近づくと何も無かったので外した。
  // 明神丸の軽い城兵（近づくと本物に替わった）と、出だしの三十七m 先の本陣の軽い兵も外した（kaito 四1「近づいて替わらない」）
  KIT.farHost(rt, 195, 62, 34, 16, 300, -Math.PI / 2, KIT.ARMOR.oda, 'toyotomi', 1585, 'spear');   // 大手を攻める秀長の本隊
  KIT.farHost(rt, 200, -10, 30, 14, 240, Math.atan2(-200, 122), KIT.ARMOR.oda, 'toyotomi', 1586, 'mixed');  // 北東から囲む藤堂高虎・増田長盛らの手（秀次は岩倉城へ）
  KIT.farHost(rt, 175, -280, 30, 14, 220, 0, KIT.ARMOR.oda, 'toyotomi', 1587, 'mixed');        // 本陣の後ろの後詰め
  // 東の大手の口で、秀長の本隊と城兵が組み合う（河原からも尾根からも見える遠い斬り合い。前は五万のはずが百人の小競り合いに見えた。11/8 critic60 十二1・十二2）
  try {
    const C = W.addClash({ x: 175, z: 60, facing: Math.atan2(-38, 22), w: 40, bw: 6, gap: 2.6, seed: 1588, rt,
      play: (k, p, v) => rt.army?.play(k, p, v), smoke: (x, y, z, ax, az) => rt.army?.smoke(x, y, z, ax, az),
      noRout: true, killRate: 0.004, maxDrift: 3, host: false, corpses: 10,
      A: { flag: 'toyotomi', armor: KIT.ARMOR.oda, count: 120, flagRate: 0.25, guns: true },
      B: { flag: 'chosokabe', armor: CHOSO.armor, count: 90, flagRate: 0.25 } });
    if (C && C.go) C.go();
    rt.flags.oteClash = C;
  } catch (e) { console.warn(e); }
}

// ---------------- 段 ----------------
function ctxOf(rt) {
  const F = rt.flags;
  // 定義した人数のまま出す。共通の一・七倍では谷の伏兵が味方を上回り、本人が囲まれた。
  // 段の直後に付く軽い控えも出さない。近づくと本物へ替わり、定義した兵数を超えて本人を囲んでいた。
  return { faction: 'oda', flag: 'chosokabe', armor: CHOSO.armor, look, dmg: 0.6, scale: 1, backing: false, fixedSpawn: true,
    friends: () => F.allies.filter((g) => g && g.count && !g.routed),
    aid: { name: '秀長の手の後続', faction: 'oda', flag: 'toyotomi', list: [uS(1), uA(9)] }, aidSaid: '秀長の手の後続が加わった', aidBacking: false,
    // 湧き水を守る段は、味方を湧き水の前に留める（止まって二十秒で味方が坂の上へ攻め上がり、湧き水の前が空になった。11/6 遊び）
    idleWait: (r, C) => C.s.kind === 'hold',
    // bot：付け入りの段は門の正面（北）へ回ってから門をくぐる（敵の組の真ん中へ真っ直ぐ向かい、門の西の切岸の裾で立ち往生した。11/6 流し）
    botSteer: (b, inp) => {
      if (b.flags.step !== 5 || !inp.k.has('KeyW')) return;
      const p = b.player, u = p.u;
      if (inPoly(OGURA_POLY, u.pos.x, u.pos.z)) return;   // 小倉丸に入るまで門へ導く（前は z だけを見て、塀の西の外の坂へ回り込んで討たれた。11/6 描いた通し）
      const off = Math.abs(u.pos.x - HON_GATE.x) > 2.5 && u.pos.z > HON_GATE.z - 12;
      const tx = HON_GATE.x, tz = off ? HON_GATE.z - 9 : HON_GATE.z + 6;
      p.yaw = Math.atan2(tx - u.pos.x, tz - u.pos.z);
    } };
}
// 足した段（src/t05_ichinomiya/）へ渡す道具。搦手の山道の下・中・上
const NG = { CHOSO, GOALS, LOW: { x: -72, z: 50 }, MID: { x: -58, z: 68 }, UP: { x: -44, z: 76 } };
function steps(rt) {
  const F = rt.flags, me = (r) => nm(r);
  return [
    // いくつもの方面から四国へ・総大将は秀長（battle_events_1101）
    rest({ dur: 15, heal: 0, say: [['羽柴秀長', '上様に代わり、この秀長が総大将じゃ。宇喜多と官兵衛は讃岐、小早川は伊予から入った', 3.4],
      ['羽柴秀長', '本隊は東の大手を攻める。そなたの手は西の谷から城の水の手を断て', 3.4], [me, '水が無ければ、城は持ちませぬな', 2.6], ['蜂須賀正勝', '城兵は九千。麓の砦から手強う抗うてきますぞ', 3], ['羽柴秀長', 'まず鮎喰川を渡り、麓の砦を落とせ', 2.6]] }),
    fight({ at: FORT, noRefill: true, title: '鮎喰川', sub: '川を渡り、麓の砦へ', obj: GOALS[0],
      foes: () => [{ name: '麓の砦の槍組', from: { x: FORT.x, z: FORT.z }, list: [uS(2), uA(12)], mass: 0, width: 4 },
        { name: '麓の砦の鉄砲組', from: { x: FORT.x + 5, z: FORT.z + 4 }, list: [uG(4)], mass: 0, width: 3 }],
      // 守兵は柵の内に留まって鉄砲と槍で守る（前は柵の外へ出て横一列に突っ立った。11/6 critic60 十一3）
      onShout: (rt, C) => { for (const g of C.groups) {
        g.order = 'hold'; g.fixed = true; g.facing = Math.PI;
        g.anchor = { x: FORT.x + (g.isGun ? 5 : 0), z: FORT.z + (g.isGun ? 4 : 0) };
        g.aggro = g.isGun ? 55 : 5; g.seekRange = g.aggro;
      } },
      later: [{ t: 28, say: ['足軽', '城山から加勢が下りてくる！'], foes: () => [{ name: '砦の加勢', from: { x: FORT.x - 10, z: FORT.z + 30 }, list: [uS(1), uA(10)], mass: 100 }] }],
      max: 120, reward: '麓の砦を落とした', onEnd: () => { F.step = 1; } }),
    // 歩くだけの段はやめ、谷の口で待ち伏せる兵と戦いながら水の手へ進む（kaito AT10）
    fight({ at: VALLEY, noRefill: true, title: '西の谷', sub: '水の手へ通じる谷の口', obj: GOALS[1],
      say: [['羽柴秀長の使番', '砦は落ちた。西の谷へ回れ。城の水の手はその奥じゃ', 3.5]],
      // 伏兵は谷の口の両脇の小山の林に潜み、寄せ手が谷へ入ると左右から襲う（前は平地に旗を立てて横一列に丸見えで待った。11/6 critic60 二1）
      foes: () => [{ name: '西の林の伏兵', from: { x: -93, z: -5 }, list: [uS(1), uA(6), uB(4)], mass: 0, width: 8 },
        { name: '東の林の伏兵', from: { x: -50, z: 2 }, list: [uS(1), uA(6)], mass: 0, width: 8 }],
      onShout: (rt, C) => lurk(C, 5),
      max: 110, reward: '谷の口の伏兵を破った', onEnd: () => { F.step = 2; } }),
    // 城の貯水池は曲輪の中にある。ここは谷でそこへ水を引く湧き水（水脈）。金掘り衆が坑道で水脈を断つ（軍記の伝え）
    fight({ at: WATER_FRONT, noRefill: true, title: '水の手', sub: '城へ水を引く谷の湧き水', obj: GOALS[2],
      foes: () => [{ name: '水の手の番兵', from: { x: WATER.x + 4, z: WATER.z + 6 }, list: [uS(2), uA(12), uB(3)], mass: 130, width: 8 }],
      // 番兵は湧き水の脇で番をし、寄せ手が来てから討って出る（前は一人で坂を上る本人を斜面で横一列に待った。11/6 critic60）
      onShout: (rt, C) => lurk(C, 9, 25),
      later: [{ t: 24, say: ['足軽', '尾根の陰から伏兵じゃ！'], foes: () => [{ name: '尾根の伏兵', from: { x: WATER.x - 26, z: WATER.z - 10 }, list: [uS(1), uA(9)], mass: 80 }] }],
      max: 120, reward: '水の手の番兵を追い払った', onEnd: () => { F.step = 3; } }),
    // 新手の継ぎ足し（b_depth の AB）はしない：本人が二人討つまで新手が来続け、坂の上で止まる新手を待って守る段が七分に延びた（11/6 流し）
    hold({ at: ADIT_FRONT, dur: 75, r: 14, noRefill: true, title: '水脈を断つ', sub: '金掘り衆が坑道を掘る', label: '坑道の口',
      obj: GOALS[3],
      say: [['羽柴秀長の使番', '金掘り衆が水脈を断つまで、ここを渡すな。城の池が干上がる', 3.5]],
      waves: [
        { t: 4, say: ['足軽', '搦手から城兵が下りてくる！'], foes: () => [{ name: '水を取り返す城兵', from: { x: -50, z: 74 }, list: [uS(2), uA(12)], mass: 150 }] },
        { t: 24, say: ['足軽', '搦手の門の内に江村の旗じゃ。城将が自ら指図しておる！'], foes: (rt) => { emuraOut(rt); return [{ name: '江村親俊の手', from: { x: -40, z: 60 }, list: [uS(3), uA(10), uG(3)], mass: 130 }]; } },
      ],
      reward: '城の水脈を断った', lost: ['羽柴秀長の使番', '水場を取り返されたか……'],
      onEnd: (r, m, won) => {
        if (!won) { ichinomiya.lose(r, '水場を取り返された'); return; }
        F.step = 4;
        r.say('羽柴秀長の使番', '水脈は断った。城の池はもう干上がるぞ', 3);
        // 付け入り：退く城兵を入れるため、搦手の門と本丸の口が開いたまま（閉まった門の前で立ち往生し、櫓から撃たれ続けた。11/4 測り）
        for (const id of ['karamete', 'hon']) { const g = F.C?.gateObjs?.[id]; if (g && g.struct) { g.open && g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); } }
        // 讃岐から回ってきた官兵衛と蜂須賀家政の手が水の手に加わる（植田城を捨て置いて屋島から阿波へ回った）。旗は各家の紋
        // 将は馬上で旗本と湧き水の前に留まって指図し、手の兵だけが門へ攻め上る（将が門の斬り合いに出ない。11/6 critic60 一2）
        allyGroup(r, { name: '黒田官兵衛の旗本', flag: 'kuroda', anchor: { x: WATER.x + 14, z: WATER.z - 14 }, facing: 0, noAI: true, order: 'hold', noRout: true, aggro: 4, fullStrength: true },
          [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, flag: 'kuroda' } }, uS(2)]);
        allyGroup(r, { name: '蜂須賀家政の旗本', flag: 'hachisuka', anchor: { x: WATER.x + 24, z: WATER.z - 12 }, facing: 0, noAI: true, order: 'hold', noRout: true, aggro: 4, fullStrength: true },
          [{ type: 'busho', n: 1, o: { name: '蜂須賀家政', invuln: true, horse: true, flag: 'hachisuka' } }, uS(2)]);
        F.kanbei = allyGroup(r, { name: '黒田の手', flag: 'kuroda', anchor: { x: WATER.x + 18, z: WATER.z - 20 }, facing: 0, noRout: true, aggro: 10, fullStrength: true }, [uS(2), uA(12)]);
        F.iemasa = allyGroup(r, { name: '蜂須賀家政の手', flag: 'hachisuka', anchor: { x: WATER.x + 28, z: WATER.z - 16 }, facing: 0, noRout: true, aggro: 10, fullStrength: true }, [uS(2), uA(12)]);
        // 二つの手の兵は付け入りの段の味方の組に入れ、搦手の門へ一緒に攻め上らせる（前は湧き水に残り、門の前で本人が一人になった。11/6 遊び・十3）
        F.allies.push(F.kanbei, F.iemasa);
        // 二つの手は少し後ろ（谷の下）から上って来る（押し戻しの段で加わる）
        for (const g of [F.kanbei, F.iemasa]) { g.order = 'hold'; g.anchor = { x: WATER.x + 10, z: WATER.z - 34 }; }
      } }),
    // 押し戻し（城兵の出撃・味方の増援）は src/t05_ichinomiya/oshimodoshi.js
    oshiStep(NG),
    // 付け入り（docs/kaito_refs_1103 の山中城の型）：水を断たれて退く城兵が搦手の門へ逃げ込む。門が閉まる前に紛れて入り、小倉丸を取る
    // 付け入りは門が閉まる前の一押し。新手の継ぎ足し（AB）はしない（継ぎ足しで門の前の斬り合いが六分を超えた。11/6 流し）
    intoOgura(fight({ at: HON_GATE, title: '付け入り', noRefill: true, sub: '退く城兵に紛れて、搦手の門へ', obj: GOALS[5],
      say: [['黒田官兵衛', '讃岐から回って参った。退く者の背に付いて、門が閉まる前に入れ', 3.4], ['足軽', '城の内は水が尽きて騒いでおるぞ', 2.8]],
      // 水を断たれて気の挫けた城兵（士気を低く・傷を浅く）。門を背に崩れやすい
      // 曲輪の中は軽い控え（mass）を付けない：本丸の塀の内で目覚めた控えが切岸の上に残り、段が終わらなかった（11/3 測り）
      foes: () => [{ name: '搦手の門の守兵', from: { x: HON_GATE.x, z: HON_GATE.z + 8 }, list: [uS(2), uA(8), uG(3)], mass: 0, morale: 55, dmg: 0.4 }],   // 門の内の守り（前は足軽十二＝二十人で、逃げ込む城兵と合わせ本人の周り十五m に四十人が重なった。11/6 流し）
      later: [{ t: 22, say: ['足軽', '小倉丸の奥から加勢が来る！'], foes: () => [{ name: '小倉丸の加勢', from: { x: -6, z: 100 }, list: [uS(1), uA(6)], mass: 0, morale: 60, dmg: 0.4 }] }],
      max: 130, reward: '搦手の門を破り、小倉丸を取った', onEnd: () => { F.step = 6; } })),
  ].map((stage, i) => {
    if (stage.kind === 'hold') {
      // noGroundGuide は画面の案内だけに効く。守備範囲の輪も消し、坑道の口の▼だけを残す。
      const start = stage.start;
      stage.start = (r, C, m, ctx) => { start(r, C, m, ctx); r.unzone('dp'); };
    }
    if (stage.kind === 'fight' || stage.kind === 'hold') {
      // 討ち終わる前や入城前に、停止・時間切れだけで目標を果たしたことにしない。
      // 金掘り衆も、本人が持ち場を守るまで勝手に失敗させない。
      stage.idleAdvance = false;
      stage.limit = Infinity;
      const tick = stage.tick;
      stage.tick = (r, C, m, ctx, el, dt) => {
        const held = C.inT || 0;
        const done = tick(r, C, m, ctx, el, dt);
        if (stage.kind === 'hold') {
          // 共通の守備判定は半径に三十mの余裕がある。この戦は坑道の前で守った時間だけ数える。
          const p = r.player.u.pos;
          C.inT = held + (Math.hypot(p.x - C.at.x, p.z - C.at.z) < C.botRadius ? dt : 0);
          // 経過時間だけで「守り終えた」と見せない。坑道の前を離れた間は進まない。15分の戦（11/8）：坑道は七十五秒守る
          const need = stage.needIn ?? 75;
          if (!stage.needIn) r.objProgress('dp', C.inT < need ? '坑道の口で金掘り衆を守る' : '坑道の口の寄せを退ける');
          return done && C.inT >= need;
        }
        // ①〜③は味方だけが敵を退けても、本人が目標の場所へ着くまで待つ。
        if (i <= 3) {
          // 画面の▼だけでなく、隊と自動操作の目当ても場所に留める。
          C.goal = C.at;
          const p = r.player.u.pos;
          // 15分の戦（11/8）：一つの段を一分で済ませない（加勢・知らせの間を取る。敵の体力は増やさない）
          return done && el > ([0, 130, 120, 115][i] || 0) && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 18;
        }
        return done;
      };
    }
    return stage;
  });
}

// 潜む敵：段の始めは潜んだ所に留め、本人か味方の組が近づくか、時が過ぎてから討って出る（update の lurkTick）
function lurk(C, aggro, wait = 45) {
  C.lurkWait = wait;
  // 潜む間は身を低く屈める（斜面に二十人が横一列に突っ立ったまま動かなかった。11/8 critic60 一3）。討って出る時に立つ
  for (const g of C.groups) { const c = g.center(); g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g._lurkAt = g.anchor; g._lurkAI = g.noAI; g.noAI = true; g.aggro = aggro; g._lurk = true; for (const u of g.units) if (u.type !== 'busho') u._crouch = true; }
}
function lurkTick(rt) {
  const C = rt.flags.dp?.cur;
  if (!C || !C.groups) return;
  const p = rt.player.u.pos;
  for (const g of C.groups) {
    if (!g._lurk || !g.count) continue;
    const c = g.center(), el = rt.t - C.t0;
    let near = Math.hypot(p.x - c.x, p.z - c.z) < 22;
    if (!near) for (const friend of rt.flags.allies) {
      if (!friend?.count || friend.routed) continue;
      const f = friend.center();
      if (Math.hypot(f.x - c.x, f.z - c.z) < 28) { near = true; break; }
    }
    // 共通の采配と段の呼び寄せより、林に潜む下知を優先する。
    if (!near && el < (C.lurkWait ?? 45)) { g.order = 'hold'; g.anchor = g._lurkAt; continue; }
    for (const u of g.units) u._crouch = false;
    g.noAI = g._lurkAI; g._lurk = false; g.order = 'attack'; g.anchor = { x: C.at.x, z: C.at.z }; g.seekRange = 60; g.aggro = 14;
    if (/伏兵/.test(g.name || '') && !C.lurkSaid) { C.lurkSaid = true; rt.say('足軽', '林から伏兵じゃ！左右から来るぞ！', 3); }
    rt.army.play('eshout', c, 1.4);
  }
}
// ⑤：門の守りを崩しても、本人が搦手の門をくぐって小倉丸へ入るまで済まない（前は門の外の坂で勝ちになった。11/6 critic60 三2）
function intoOgura(f) {
  const t0 = f.tick;
  f.tick = (rt, C, m, ctx, el) => {
    if (!t0(rt, C, m, ctx, el)) return false;
    C.at = OGURA_IN; C.goal = OGURA_IN;
    const p = rt.player.u.pos;
    if (inPoly(OGURA_POLY, p.x, p.z)) return true;
    if (!C.inSaid) { C.inSaid = true; rt.say('黒田官兵衛', '門の守りは崩れた。小倉丸へ踏み込め', 3); }
    return false;
  };
  return f;
}
// 城将の江村親俊：馬上で旗本に囲まれ、小倉丸の搦手の門の内から城兵を指図する（前は寄せの兵と一緒に下り、寄せ手の竹束の陰にいた。11/6 critic60 十一3）
//   門の外の坂に置くと、討たれない城将と本人が坂で斬り合い続けて付け入りが進まなかった（11/6 描いた通し）
function emuraOut(rt) {
  const F = rt.flags;
  if (F.emura) return;
  F.emura = enemyGroup(rt, { name: '江村親俊の旗本', anchor: { x: -22, z: 101 }, facing: Math.PI, fixed: true, order: 'hold', noRout: true, aggro: 3, width: 6 },
    look([{ type: 'busho', n: 1, o: { name: '江村親俊', horse: true, invuln: true } }, uS(3)]));
}
// 城から撃ち下ろす鉄砲：小倉丸の塀の内、搦手の門の脇から坂を撃つ（前は坂を上る間、城から鉄砲も矢も来なかった。11/6 critic60 二3・十3）
function castleGuns(rt) {
  const F = rt.flags;
  if (F.cGuns) return;
  F.cGuns = [[-25, 93.5], [-6, 93.5]].map(([x, z]) => enemyGroup(rt, { name: '小倉丸の鉄砲', anchor: { x, z }, facing: Math.PI, fixed: true, order: 'hold', noRout: true, aggro: 60, seekRange: 60, width: 4 }, look([uG(3), uB(2)])));
  // 遠い撃ち下ろしで当たりは浅い（本人が門の前で数発で倒れない。寄せ手の足軽はばたばた倒れる）
  for (const g of F.cGuns) g.dmgMult = 0.2;
}
// 目付の蜂須賀正勝は旗本と後ろから見届ける（前は六十歳の目付が本人の足元に付いて門の斬り合いまで来た。11/6 critic60 一2）
const MASAKATSU_AT = [{ x: SPAWN.x - 10, z: SPAWN.z + 12 }, { x: FORT.x - 8, z: FORT.z - 16 }, { x: FORT.x - 18, z: FORT.z + 6 }, { x: -60, z: -16 }, { x: -64, z: 8 }, { x: -64, z: 8 }, { x: -64, z: 8 }];
// 右上の目標と同じ場所の名で、行き先の▼を固定の場所に立てる（前は逃げる番兵と一緒に動き、⑤は▼が出ず目付の名札が行き先に見えた。11/6 critic60）
const DEST = [{ ...FORT, label: '麓の砦' }, { ...VALLEY, label: '西の谷の口' }, { ...WATER_FRONT, label: '谷の湧き水' }, { ...ADIT_FRONT, label: '坑道の口' }];
function destOf(rt) {
  const F = rt.flags;
  if (F.ending) return null;
  const k = Math.min(5, F.step || 0);
  if (k < 4) return { ...DEST[k] };
  // ⑤押し戻しの段は、山道の今の持ち場（下がる・また上る）
  if (k === 4) { const g = F.dp?.cur?.goal || NG.MID; return { x: g.x, z: g.z, label: '搦手の山道' }; }
  const u = rt.player.u.pos;
  if (inPoly(OGURA_POLY, u.x, u.z)) return { ...OGURA_IN, label: '小倉丸' };
  // 守兵を崩した後は、門の外で止まらず入城する場所を示す。
  if (F.dp?.cur?.inSaid && Math.abs(u.x - HON_GATE.x) <= 4) return { ...OGURA_IN, label: '小倉丸', r: 2 };
  // 門の正面（北の坂）から入る。脇から寄ると塀の外の細い段へ入り、狭間の下で囲まれた（11/6 描いた通し）。脇にいる間は▼を門の正面の坂に立てる
  if (Math.abs(u.x - HON_GATE.x) > 4 && u.z > HON_GATE.z - 14) return { x: HON_GATE.x, z: HON_GATE.z - 9, label: '搦手の門', r: 3 };
  return { ...HON_GATE, label: '搦手の門', r: 2 };
}

// 湧き水を守る段（step 3）：
//  ・坑道の口に金掘り衆を置く（目標に書いた金掘り衆がどこにもいなかった。11/6 遊び）。甲冑を着けない小袖の人夫
//  ・搦手から下りる城兵は湧き水の前まで下りて来させる。敵の采配（ai.js）が数の多い味方を見て坂の途中（三十〜四十m 上）で止め、
//    湧き水の前では一度も斬り合いにならなかった（11/6 遊び・九2）。この段の寄せは坑道の口の金掘り衆を狙わせる（指定の敵へは采配に関わらず歩いて寄り、
//    途中で塞ぐ味方とは斬り合う）。金掘り衆は討たれない（invuln）ので、寄せは湧き水の前で味方と本人に討たれるまで退かない
const WAVE_NAMES = /水を取り返す城兵|江村親俊の手/;
function waterTick(rt) {
  const F = rt.flags;
  if (!F.miners) {
    const face = Math.atan2(WATER.x - ADIT.x, WATER.z - ADIT.z);
    F.miners = allyGroup(rt, { name: '金掘り衆', anchor: { x: ADIT.x + Math.sin(face) * 2.2, z: ADIT.z + Math.cos(face) * 2.2 }, facing: face + Math.PI, fixed: true, noAI: true, order: 'hold', noRout: true, aggro: 0, fullStrength: true, width: 3 },
      [{ type: 'porter', n: 4, o: { flag: null, hat: 'none', kosode: 1, kosodeCol: 0x5a4c3a, obi: 0x2e261c, horse: false, invuln: true, keep: true } }]);
  }
  if ((F.waveScanT ?? -1) > rt.t) return;
  F.waveScanT = rt.t + 1;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !g.count || g.routed || g._t05w || !WAVE_NAMES.test(g.name || '')) continue;
    const m = F.miners.units.find((u) => u.alive);
    g._t05w = true; g.order = 'attack'; g.seekRange = 70; g.anchor = { x: ADIT_FRONT.x, z: ADIT_FRONT.z };
    if (m) g.focus = m;
  }
}

export const t05_ichinomiya = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  noReserve: true, noTaishoRaid: true, stageGoalsOnly: true, goalsAllRows: true,
  goalSignTarget: destOf,
  // 行き先の▼とは別に共通の段処理が出す「敵の隊」の札を重ねない。
  dpNoMark: true,
  // 始まりの札に二三行の説明（前は年・名・両軍の名だけで、何をする戦か分からなかった。11/8 critic60 五4・十二1）
  introText: () => '羽柴秀長の五万が阿波へ攻め入った。一宮城には谷忠澄・江村親俊ら九千が籠もる。西の谷から城の水の手を断ち、城を開かせよ。',
  noGroundGuide: true,
  // 見出しは終わりと討ち取りだけ（「敵の隊が崩れた」が三度大きく出た。11/8 critic60 五1）
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵の隊が崩れた' && t !== '味方の隊が崩れた',       // 地面の楕円の輪を描かない（印は真上の▼一つ。11/8 critic60 五3）
  actionGuideTarget: () => null,
  // 右上は①〜⑤の決まった一行（始めの「味方の旗へ」・段ごとの別の言い方・櫓を取る脇の目標を出さない。kaito 三1・十1）
  missionHeading: (rt) => { const k = Math.min(5, Math.max(0, rt.flags.step || 0)); return NUM[k] + GOALS[k]; },
  missionSingleLine: true,
  noYaguraTask: true,
  // 付け入りの門の前は城兵が三十人を超えて囲む。本人だけが数秒で倒れないよう、受ける傷を少し軽く（kaito 十二3）
  playerTaken: 0.45,   // 15分の戦（11/8）：山道の押し戻しと付け入りで囲まれる。0.6 から軽く
  waitForPortrait: true,   // 黒い人影を出さず、撮れた本人の顔だけを一度表示する
  hidePlayerSign: true,      // 足もとの白い輪は写真に無い作り物の印（標準 五1・八）。肩越しで本人は見える
  noFrontFill: true,         // 奥の作り物の乱戦（front_fill.js）を置かない：始めの河原の左に、近づくと無い軽い軍勢の列が見えた（kaito AA・AF）
  frontlineDensity: false,   // 共通の小勢を足さない（織田の旗の小勢・見せかけの軍勢を出さない。kaito AQ4・AT）
  world: {
    namedKacchu: TOYO_HACHISUKA_KACCHU,
    seed: 1585, time: 'day', muddy: 0.15, fogFar: 440,
    waterSlow: true,  // 鮎喰川を渡る間は遅くなる（地面と同じ速さで歩けた。11/8 critic60 一8）
    hatDropRate: 0,   // 持ち主の無い陣笠が地面に転がって残った（11/8 critic60 九4）
    muddyCastleFloor: 0.8,   // 曲輪の内は白い砂利でなく踏み固めた土（雪かコンクリートに見えた。11/8 critic60 八1）
    clearAir: true,   // 札は「晴れ」。谷が真っ白な霧に沈み、尾根の城も見えなかった（11/8 critic60 八1・四5）。晴れた日の澄んだ空気に
    paths: [ROAD, VALLEY_ROAD, KARAMETE, OTE],
    height,
    // 鮎喰川は一宮の前で広い河原を流れる大きな川。流れの幅を八から十二へ（前は小川に見えた。浅瀬でどこでも渡れる深さのまま）
    streams: [{ pts: RIVER, w: 12, depth: 0.7 }],
    // 河原は白い砂利、山は夏の濃い緑
    tint(x, z, h, c) {
      const rd = distToPolyline(x, z, RIVER);
      if (rd < 26) { const k = (1 - rd / 26) * 0.75; c.setRGB(c.r * (1 - k) + 0.62 * k, c.g * (1 - k) + 0.6 * k, c.b * (1 - k) + 0.54 * k); }
      else if (h > 10) { const k = Math.min(1, (h - 10) / 20) * 0.45; c.setRGB(c.r * (1 - k) + 0.12 * k, c.g * (1 - k) + 0.26 * k, c.b * (1 - k) + 0.1 * k); }
    },
    clear: (x, z) => Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16 || Math.hypot(x - FORT.x, z - FORT.z) < 18 || Math.hypot(x - WATER.x, z - WATER.z) < 14 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 14 ||
      inCastle(x, z, 6) || distToPolyline(x, z, OTE) < 4 || distToPolyline(x, z, ROAD) < 5 || distToPolyline(x, z, VALLEY_ROAD) < 5 || distToPolyline(x, z, KARAMETE) < 7 ||
      Math.hypot(x - HON_GATE.x, z - HON_GATE.z + 6) < 16,   // 搦手の門の前は切り開いた斜面（前は門の前まで杉が茂り、門の前で木に阻まれて立ち往生した。11/6 描いた通し）
    trees: 900, tufts: 2400,
    treeDensity: (x, z) => (distToPolyline(x, z, RIVER) < 26 ? 0 : height(x, z) > 9 ? 1.3 : 0.25),
    fleeOut: (x, z, team) => team === 1 && z > 170,
  },
  sides: { a: { name: '羽柴秀長の軍', mon: 'toyotomi', faction: 'oda' }, b: { name: '長宗我部方（一宮城）', mon: 'chosokabe' } },
  minutes: 15, expectMin: 15,
  depth: ichiDepth, lethal: true,   // 武将の備（t05_ichinomiya/depth.js）と命懸けの戦場（lethal.js）
  noCavalryMix: true,   // 寺の境内・山城の狭い道：共通の「敵の組に騎馬を混ぜる」をしない（路地と山道で馬の突きに何度も倒された）
  date: () => '天正十三年七月　初秋・晴れ',   // 旧暦の七月は秋（七〜九月が秋）。暑さは残る

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 印は一つだけ（kaito AS・AT・AV15）：行き先は頭上の金の▼（#goal-sign）に任せ、白い旗のピンは描かない。この戦の間だけ効く
    if (typeof document !== 'undefined' && !document.getElementById('t05-one-mark')) {
      const st = document.createElement('style'); st.id = 't05-one-mark';
      // 共通の行き先表示と field-clean は名札の親まで隠す。将ごとの表示判定を生かし、この戦では名前を残す。
      st.textContent = 'html body #hud:has(#h-prog[data-battle="t05_ichinomiya"]):has(#goal-sign:not([hidden])) #mission-goal:not(.fire-action):not(.talk-action) svg{display:none!important}' +
        'html body #hud:not(.photo):not(.ending):has(#h-prog[data-battle="t05_ichinomiya"]) .field-names{display:block!important}';
      document.head.appendChild(st);
    }
    buildStage(rt);
    // 味方：秀長の旗本（本陣に残る）と、自分が率いる別の手の二組
    // 総大将の秀長は本陣に座り、旗本に囲まれて前に出ない（kaito AR3・AV7）
    // 本陣の後ろの軽い兵（出だしから三十七m）は外し、旗本を本物の兵で厚くした（kaito 四1）
    F.honjin = allyGroup(rt, { name: '羽柴秀長の旗本', anchor: { x: HONJIN.x, z: HONJIN.z - 2 }, facing: 0, fixed: true, noAI: true, order: 'hold', noRout: true, aggro: 4 },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, flag: 'toyotomi', horse: false } }, uS(6), uA(14), uG(4)]);
    // 敵は ctxOf の scale: 1 で定義どおり。味方も共通の六割五分への間引きを避け、谷へ進む三組の人数を保つ。
    F.allies = [
      // 阿波口の目付は蜂須賀正勝（小六）。子の家政は官兵衛と讃岐から回り、後から加わる
      allyGroup(rt, { name: '蜂須賀の手', flag: 'hachisuka', anchor: { x: SPAWN.x - 24, z: SPAWN.z + 4 }, facing: 0, fullStrength: true, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 }, [uS(2), uA(14)]),
      allyGroup(rt, { name: '手勢の先手', flag: 'toyotomi', anchor: { x: SPAWN.x - 8, z: SPAWN.z + 10 }, facing: 0, fullStrength: true, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 }, [uS(2), uA(20)]),
      allyGroup(rt, { name: '手勢の二陣', flag: 'toyotomi', anchor: { x: SPAWN.x + 10, z: SPAWN.z + 6 }, facing: 0, fullStrength: true, noRout: true, aggro: 12, morale: 90, dmgMult: 0.55 }, [uS(2), uA(10), uG(6)]),
    ];
    // 味方の後ろの軽い控え（backOf）は付けない：いつも本人のそばを歩くので、近づける所の作り物になる（kaito AA）
    // 目付の正勝は馬上で旗本二人と、段ごとに一つ後ろの所から見届ける（MASAKATSU_AT）
    F.masakatsu = allyGroup(rt, { name: '蜂須賀正勝の旗本', flag: 'hachisuka', anchor: { ...MASAKATSU_AT[0] }, facing: 0, noAI: true, order: 'hold', noRout: true, aggro: 4, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '蜂須賀正勝', invuln: true, horse: true, flag: 'hachisuka' } }, uS(2)]);
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: SPAWN.x + 2, z: SPAWN.z - 4 }, 0, [{ kind: 'spear', n }]);
    rt.after(10, () => { if (!F.ending) F.t0 = rt.t; });
    depthStart(rt, ctxOf(rt), steps(rt), () => ichinomiya.envoy(rt));
    ichiIntro(rt);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    if (F.step === 3) waterTick(rt);
    if (F.step >= 3 && !F.ending) castleGuns(rt);
    // 二陣は竹束の下側を順に通り、陰で射撃してから次の竹束へ進む。
    const cover = F.allies[2];
    if (F.step === 5 && cover?.count && !F.ending && (F.coverLeg || 0) < COVER_ROUTE.length) {
      const leg = F.coverLeg || 0, at = COVER_ROUTE[leg];
      if (cover._coverAt !== at) {
        cover._coverAt = at; cover.anchor = at; cover.order = 'move'; cover.aggro = 6; F.coverWait = 0;
      }
      const c = cover.center();
      if (Math.hypot(c.x - at.x, c.z - at.z) < 4) {
        cover.order = 'hold'; cover.facing = 0;
        if (!F.coverWait) F.coverWait = rt.t + 3;
        if (rt.t >= F.coverWait) F.coverLeg = leg + 1;
      }
    }
    // 付け入りで寄せ手が門に取り付いたら、門の脇の鉄砲は小倉丸の奥へ退く（撃たれ続けて門の前で物陰に釘付けになり、四十五秒で段が流れた。11/6 描いた通し）
    if (F.step === 5 && F.cGuns && !F.gunsOff && Math.hypot(rt.player.u.pos.x - HON_GATE.x, rt.player.u.pos.z - HON_GATE.z) < 12) {
      F.gunsOff = true;
      for (const g of F.cGuns) if (g.count) { g.noRout = false; g.morale = 0; }
    }
    if (F.step <= 2) lurkTick(rt);
    const ma = MASAKATSU_AT[Math.min(6, F.step || 0)];
    if (F.masakatsu && F.masakatsu.count && F.masakatsu._at !== ma) { F.masakatsu._at = ma; F.masakatsu.anchor = { x: ma.x, z: ma.z }; F.masakatsu.order = 'hold'; }
  },

  // 本丸の前：谷忠澄が開城の使者として出てくる
  envoy(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    for (const g of rt.army.groups) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    // 塀に隠れない曲輪の内側で使者を迎え、台詞と帰城の動きを見せてから締める。
    const pp = rt.player.u.pos;
    const envoy = allyGroup(rt, { name: '開城の使者', anchor: { x: Math.max(-24, Math.min(-8, pp.x)), z: pp.z < 98 ? 101 : 94 }, facing: pp.z < 98 ? Math.PI : 0, width: 2, fixed: true, order: 'hold', noRout: true, aggro: 0, fullStrength: true },
      [{ type: 'busho', n: 1, o: { ...CHOSO, name: '谷忠澄', invuln: true } }, { type: 'samurai', n: 2, o: { ...CHOSO, keep: true } }]);
    // 共通の勝鬨で開城の会話を上書きせず、十二秒間は主人公を動かせる。
    rt._closing = { at: rt.t + 30, info: { scriptedEnd: true }, delay: 1 };
    rt.banner('一宮城、開城', '谷忠澄が城を開き、白地城の元親へ降伏を説きに戻る');
    // 元親は阿波の西の白地城にいて、ここにはいない。谷は白地へ戻って降伏を説き、元親は怒ったが重臣に諫められて降った（七月下旬）
    rt.after(0.5, () => rt.say('谷忠澄', '水が尽きた。これ以上は兵が死ぬだけじゃ', 2.6));
    rt.after(3.2, () => rt.say('羽柴秀長の使番', '殿より。城を開けば、土佐一国は上様に取りなす、との仰せ', 2.8));
    rt.after(6.2, () => rt.say('谷忠澄', '白地の城へ戻り、殿に降るよう説きまする', 2.6));
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水の手を断ち、一宮城を開かせた', pts: 15 }; }, '一宮城を開かせた');
    rt.after(9, () => { envoy.fixed = false; envoy.order = 'move'; envoy.anchor = { x: -16, z: 105 }; });
    // 城主を討って終わらせない：防衛線が崩れ、元親が継戦を諦めて降る（七月）。四国平定
    rt.after(12, () => rt.say('羽柴秀長の使番', '白地の元親、降伏を申し出ました！　阿波・讃岐・伊予を返し、土佐一国を守るとの事', 4));
    rt.after(16.5, () => rt.banner('四国平定', '羽柴の大軍が四国を一つにした'));
    rt.after(18, () => rt.say('羽柴秀長の使番', '本陣の殿より。戦わずに済む所は戦わぬ。上様の天下は、もう目の前じゃ、との仰せ', 4));
    rt.after(23, () => rt.say('蜂須賀正勝', '次は九州か。島津は長宗我部より手強いと聞く', 4));
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.banner('一宮城、落ちず', why);
    rt.finish({ failureReason: why }, 6);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
};
const ichinomiya = t05_ichinomiya;

// 兵数は諸説。秀長の阿波勢は五万余、城兵は九千余（谷忠澄の伝え・解説は「一万近く」）。比はおよそ五対一
t05_ichinomiya.force = (rt) => {
  const F = rt.flags;
  const b = Math.max(0, 9000 - (F.ek || 0) * 30 - (F.step || 0) * 600);
  return { a: 50000 - (F.ak || 0) * 20, a0: 50000, b: F.ending && rt.tracker.main ? Math.min(b, 5000) : b, b0: 9000 };
};
t05_ichinomiya.history = '天正十三年（1585）六月、羽柴秀吉は弟の秀長を総大将に、甥の秀次らと合わせて大軍を四国へ送った。阿波へ渡った秀長は、長宗我部元親の家臣、谷忠澄・江村親俊らが守る一宮城を囲んだ。\n秀長は城の水の手を断ち、城兵は水に苦しんだと伝わる。七月、谷忠澄は城を開き、元親のもとへ戻って降伏を説いた。元親は降り、土佐一国だけを許された。\n砦・水場・尾根の道の置き場、両軍の人数、台詞は遊びのための推定である。';
t05_ichinomiya.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  depthBot(b, inp, goTo);
  // 付け入り：遊ぶ人と同じく行き先の▼（搦手の門→小倉丸）へ向かい、斬るのは目の前の敵だけ（逃げる城兵を追って塀の西の外へ回り込み、討たれた。11/6 描いた通し）
  const u = b.player.u;
  // ⑤押し戻し：山道の持ち場（下・中ほど）から離れて門の下まで上らない
  const cur = b.flags.dp?.cur;
  if (b.flags.step === 4 && cur?.at && Math.hypot(u.pos.x - cur.at.x, u.pos.z - cur.at.z) > 16) { inp.leftPressed = false; goTo(b.player, inp, cur.at.x, cur.at.z, 3); return; }
  if (b.flags.step === 5 && !inPoly(OGURA_POLY, u.pos.x, u.pos.z)) {
    const near = b.army.units.some((o) => o.alive && o.team === 1 && !o.isStruct && !o.fleeing && (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 < 5);
    if (!near) {
      const d = destOf(b);
      inp.leftPressed = false;
      goTo(b.player, inp, d.x, d.label === '搦手の門' && d.r === 2 ? OGURA_IN.z : d.z, 1);
    }
  }
};

// 右上の一行（stages.js の作りをそのまま使う。共通の表は直さず、ここで足す）
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
// 段は史実の順の五つだけ（「敵を何人討つ」で埋めない。kaito AW3・stageGoalsOnly）
// 右上の一行（missionHeading）と同じ言葉・同じ順（言い替えない。kaito 十1）
STAGES.t05_ichinomiya = GOALS.map((g, k) => (k ? [g, s(k)] : [g]));

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t05_ichinomiya);
