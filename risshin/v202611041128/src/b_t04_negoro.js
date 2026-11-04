// ======================================================================
// 豊臣編 4　紀州征伐／根来寺（天正十三年（1585）三月二十三日。docs/chapter2_toyotomi.md の 4）
// 小牧・長久手の和睦の後、秀吉はおよそ十万で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻める。
// 三月二十一日、和泉の千石堀城で根来衆の主力が激しく戦い、火が煙硝蔵に入って落ちた。
// 二十三日、秀吉勢が根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は残った。
// 自分は部将として羽柴秀次の先手を率いる。押す兵が付いた竹束の陰で門前の坊舎へ寄る → 坊舎の縁・物見から堀秀政を狙う鉄砲衆を討つ →
// 丸太の組が山門を打ち破る → 味方と境内へ攻め入る → 大塔の前の行人方を崩し、大塔を焼かせない（AY 2〜5。自分が動かなくても味方で筋は進む）。
// 史実では根来寺での抵抗は少ない。寺に残った鉄砲衆の抵抗を厚くしたのは脚色（筋書きの一枚どおり）。
// 形の手本は docs/battle_refs/t04_negoro.md（文化庁の史跡解説・発掘・国土地理院の標高・堂の今の位置）。
// 向き：下の数は「谷の道の向き」に沿った手書きの座標（+z＝大門から大塔へ東北東、+x＝左＝北山の側）。
//   置く時に P() で本当の方角へ回す（地図の北が本当の北。大塔・堂は南を向く）。寸法は縮めた復元。
// ======================================================================
import * as THREE from 'three';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { flagTexture } from './textures.js';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { distToPolyline } from './world.js';
import { enemyGroup, allyGroup, wallLine, nm, centerOf } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { nobori, jinmaku, shogi, tsuiji, tawara, romon, ishigaki, solidRect, solidCircle, solidSeg } from './props.js';
import { sobo, kura, doja, hondo, shoro, monomidai } from './temple_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeRam } from './hajo.js';
import { addTaba, placeTaba, tickTabas, patchGunCover } from './taketaba.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';
import { MEM_TIGHT } from './settings.js';
import { routeTools } from './b_k_route.js';

// 国土地理院の標高（tools/dem.mjs の negoro。無い時は手書きの谷だけで遊べる）
let ngDem = null;
// 標高の束（tools/dem.mjs の negoro）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t04_negoro = Object.freeze([...assetsForBattle(''), 'dem_negoro']);
useTerrain('dem_negoro', (data) => { ngDem = data; ngRef = null; SITE_Y.clear(); });

// ---- 向き：手書きの座標（lx, lz）を本当の方角へ回す ----
// 大門（今の大門の位置）から大塔へは東北東（実測で東へ 521m・北へ 325m）。+lz をその向き、+lx を左（北）にする。
// 遊びの座標は x＝東、z＝南（地図の北が上）。P(lx, lz) が置く所、toL(x, z) がその逆。
const ROT = Math.atan2(0.849, -0.529);
const CR = Math.cos(ROT), SR = Math.sin(ROT);
const P = (x, z) => ({ x: x * CR + z * SR, z: -x * SR + z * CR });
const PA = (x, z) => [x * CR + z * SR, -x * SR + z * CR];
const toL = (x, z) => ({ x: x * CR - z * SR, z: x * SR + z * CR });
const dirL = (dx, dz) => ({ x: dx * CR + dz * SR, z: -dx * SR + dz * CR });   // 向き（長さ1の矢）を回す

// 手書きの座標（lx, lz）。参道は大門から菩提川の橋を渡り、大伝法堂と大塔の前の平場へ
const SANDO_L = [[0, -230], [0, -120], [0, -40], [0, 0], [0, 40], [-3, 70], [-5, 100], [-4, 140]];
const SANDO = SANDO_L.map(([x, z]) => PA(x, z));
// 道しるべ（AJ 11/3 kaito「坊舎に斬り込めと書いてあるが、そこまでどうやって辿り着くか分からない」）：
//   兵も地面の矢印も参道の曲がり角（門前の坊舎の間・大門の口・菩提川の橋・大塔の前）を一つずつ辿る。坊舎・塀の向こうへまっすぐ向かわせない
//   道の点は 8 歩ごとに細かく刻む（長い一筋のままだと、同じ筋の上の行き先へ塀越しにまっすぐ向かった）
const SANDO_FINE = [];
for (let i = 0; i < SANDO.length - 1; i++) {
  const [ax, az] = SANDO[i], [bx, bz] = SANDO[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 8));
  for (let k = 0; k < n; k++) SANDO_FINE.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
}
SANDO_FINE.push(SANDO[SANDO.length - 1]);
const { way: sandoWay0 } = routeTools(SANDO_FINE, 'ng');
// 曲がり角の着いたとみなす輪は一歩（二歩のままだと、角の二歩手前で止まり、次の角へ移らなかった）
const sandoWay = (army, u, want) => { const q = sandoWay0(army, u, want); if (q !== want) q.botRadius = 1; return q; };
let NG_RT = null;
const GATE = P(0, 0);                   // 大門（二重の大きな楼門。1585 年に焼け残り、のちに大和郡山城の門になったと伝わる）
const DAITO_L = { x: 18, z: 86 };
const DAITO = P(DAITO_L.x, DAITO_L.z);  // 大塔（参道の左＝北。北山の裾の平場に南を向いて立つ）
const DENPO = P(12, 60);                // 大伝法堂（本堂。大塔の西の前。焼け残り、秀吉が京へ運ばせた）
const DAISHI = P(32, 70);               // 大師堂（大塔のすぐ西。焼け残った）
const TOWER_FRONT_L = 106;
const TOWER_FRONT = P(0, TOWER_FRONT_L);        // 大塔を背にして、奥から来る行人方を受ける所
const MONZEN = P(0, -74);               // 門前（西坂本）の坊舎の並び
const SAIKA_EN = P(-11, -42);           // 奥の坊舎（門前の左）の縁。雑賀の鉄砲衆が参道へ向けて並ぶ
const YOSE = P(0, -96);               // 竹束の寄せ場
const START = P(0, -140);               // 門前の坊舎の屋根と大門が始めの画面に入る所
const WALL_X = 74;                      // 築地塀の左右の端（手書きの座標）
const BRIDGE_L = { x: 0, z: 40 };       // 菩提川の橋
const POND_L = { x: 46, z: -26, rx: 15, rz: 10 };   // 大門池（大門の外。今は図書館が建つ）
const HASHIBA = { armor: 0x2a2420, flag: 'toyotomi' };
const NEGORO = { armor: 0x3a342c, flag: 'maru' };
// 上の身分（足軽大将より上）は先手を率いる部将の言い方
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// ---- 地形 ----
// 実測（国土地理院）：北は和泉山脈の南の裾（北山）、南は東西に衝立のように延びる前山。その間の狭い平地と谷に堂と子院が並ぶ。
// 大門は前山の西の端の細い尾根と北山の間の口に立つ。手書きの座標を、道の向きに 8m・横に 4m で実測へ写し、高さは 0.3 倍
const DEM_T = { E: -79, S: 112 };       // 大塔の実の位置（標高の格子の中心からの m。東＋・南＋）
const DEM_AX = { E: 0.849, S: -0.529 }, DEM_LF = { E: -0.529, S: -0.849 };
const DEM_SZ = 8, DEM_SX = 4, DEM_V = 0.3;
let ngRef = null;
function demL(lx, lz) {
  const a = (lz - DAITO_L.z) * DEM_SZ, b = (lx - DAITO_L.x) * DEM_SX;
  return demSample(ngDem, DEM_T.E + a * DEM_AX.E + b * DEM_LF.E, DEM_T.S + a * DEM_AX.S + b * DEM_LF.S);
}
// 子院の平場（雛壇）：斜面を削って平らにし、低い側に石垣を積む（発掘で分かった子院の作り）。[lx, lz, 幅, 奥行]（幅と奥行は東西・南北）
const SITES_L = [
  [-46, 16, 12, 10], [-44, 56, 12, 10], [-50, 92, 12, 10], [44, 22, 12, 10], [54, 62, 12, 10], [-26, 118, 12, 10], [50, 120, 12, 10], [-26, 16, 12, 10],
  [36, 56, 12, 10], [56, 100, 10, 9],
];
const SITES = SITES_L.map(([x, z, w, d]) => ({ ...P(x, z), hw: w / 2 + 1, hd: d / 2 + 1 }));
// 堂の平場（基壇の下を均す）：大塔・大伝法堂・大師堂
const DOU_FLATS = [{ ...DAITO, r: 16 }, { ...DENPO, r: 13 }, { ...DAISHI, r: 9 }];
const SITE_Y = new Map();
// 菩提川：北山から下り、大門と堂の間で参道を横切って前山の側へ流れる（手書きの座標）
const BODAI_L = [[96, 52], [60, 46], [26, 42], [0, 40], [-30, 37], [-60, 32], [-96, 24]];
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// 標高の束が無い時の手書きの谷（手書きの座標）：西の田から東へゆるく上り、左右の尾根が谷を挟む
function base(x, z) {
  let h = 0.03 * (z + 220);
  const ax = Math.abs(x);
  if (ax > 78) h += Math.pow(ax - 78, 1.25) * 0.32;
  if (z > 132) h += (z - 132) * 0.55;
  h += 0.35 * Math.sin(x * 0.06 + 0.7) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 - x * 0.03);
  if (z < -120) h = Math.min(h, 0.03 * 100 + 0.08 * Math.sin(x * 0.2) + (ax > 78 ? Math.pow(ax - 78, 1.25) * 0.32 : 0));
  return h;
}
// 均す前の地面（手書きの座標）。実測を写し、参道の筋だけ横に均す（大門の口・堂の前の平地）
function rawL(lx, lz) {
  if (!ngDem) return base(lx, lz);
  if (ngRef === null) ngRef = demL(0, 0);
  const raw = (demL(lx, lz) - ngRef) * DEM_V;
  const cz = Math.max(-240, Math.min(150, lz));
  const hp = ((demL(0, cz - 8) + demL(0, cz) + demL(0, cz + 8)) / 3 - ngRef) * DEM_V;
  return hp + (raw - hp) * sm((Math.abs(lx) - 16) / 28) + 0.25 * Math.sin(lx * 0.07 + 0.7) * Math.cos(lz * 0.05);
}
// 子院の平場の高さ：四隅の一番高い所より少し上（低い側は石垣の上に立つ）
function siteY(i) {
  let y = SITE_Y.get(i);
  if (y === undefined) {
    const s = SITES[i];
    let top = -Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = toL(s.x + a * s.hw, s.z + b * s.hd); top = Math.max(top, rawL(q.x, q.z)); }
    const c = toL(s.x, s.z), mid = rawL(c.x, c.z);
    // 高い側は削り、低い側は石垣の高さ（2m ほど）までに留める
    y = Math.max(mid + 0.9, Math.min(top + 0.3, mid + 2.2));
    SITE_Y.set(i, y);
  }
  return y;
}
function douY(i) {
  const k = 'd' + i;
  let y = SITE_Y.get(k);
  if (y === undefined) { const f = DOU_FLATS[i], q = toL(f.x, f.z); y = rawL(q.x, q.z) + 0.3; SITE_Y.set(k, y); }
  return y;
}
function height(x, z) {
  const L = toL(x, z);
  let h = rawL(L.x, L.z);
  // 堂の平場
  for (let i = 0; i < DOU_FLATS.length; i++) {
    const f = DOU_FLATS[i], d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) h += (douY(i) - h) * sm((f.r - d) / (f.r * 0.35));
  }
  // 子院の雛壇（縁は切り立つ。低い側に石垣を積む）
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i], o = Math.max(Math.abs(x - s.x) - s.hw, Math.abs(z - s.z) - s.hd);
    if (o < 0.8) h += (siteY(i) - h) * sm(1 - o / 0.8);
  }
  // 大門池：大門の外の溜池
  const e = ((L.x - POND_L.x) / POND_L.rx) ** 2 + ((L.z - POND_L.z) / POND_L.rz) ** 2;
  if (e < 1.3) h -= 1.8 * sm((1.3 - e) / 0.5);
  // 菩提川の流れ（橋の下の参道は削らない）
  if (Math.abs(L.x) > 4 && Math.abs(L.z - 40) < 20) { const d = distToPolyline(L.x, L.z, BODAI_L); if (d < 2.8) h -= 1.1 * sm((2.8 - d) / 1.6); }
  return h;
}

// 段の数（右上の一行。stages.js の作りに乗せる）
const atStep = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES.t04_negoro = [
  ['竹束の陰について、門前の坊舎へ寄る'],
  ['堀秀政を狙う坊舎の鉄砲衆を討つ', atStep(2)],
  ['丸太の組を守り、山門を打ち破る', atStep(3)],
  ['味方と境内へ攻め入る', atStep(4)],
  ['大塔の前の行人方を崩し、大塔を守る', atStep(5)],
];
// 段に入った時に step を進める包み
const stepped = (n, st) => ({ ...st, start(rt, C, m, ctx) { rt.flags.step = n; rt.flags.stepT = rt.t; st.start(rt, C, m, ctx); } });
const alive = (g) => !!g && g.count > 0 && !g.routed;
const heads = (list) => list.reduce((a, g) => a + (alive(g) ? g.count : 0), 0);

// ---- 根来の鉄砲の持ち場（AY 2）：本物の鉄砲の兵を持ち場の床（u.perch）に据える。持ち場を離れず、撃つ度に硝煙を出す ----
// 撃ち手の姿は、具足の兵・白い裹頭の行人・剃った頭の小袖の僧・小柄な若い行人を順に混ぜる（根来衆は地侍の子弟が山内に入った僧兵の集団）
const SOHEI_LK = { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null };
const GUN_LOOKS = [{}, SOHEI_LK, {}, { kosode: 1, bozu: 1, flag: null }, {}, { ...SOHEI_LK, small: 1 }];
let KOSHI = null, ASHIBA = null;
const KOSHI_GEO = () => KOSHI || (KOSHI = new THREE.BoxGeometry(0.14, 1.0, 3.6));   // 縁の腰板（参道に向く側）
const STEP_GEO = () => ASHIBA || (ASHIBA = new THREE.BoxGeometry(1.3, 1.7, 1.0));   // 塀の内に積んだ足場
// spots：[{ x, z（手書きの座標）, dy（地面からの高さ）か abs（高さそのもの）, f（向き） }]
function gunPost(rt, name, spots) {
  if (!spots.length) return null;
  const W = rt.world;
  const list = spots.map((s, i) => ({ type: 'gun', n: 1, o: { ...NEGORO, ...GUN_LOOKS[i % GUN_LOOKS.length] } }));
  const g = enemyGroup(rt, { faction: 'saika', fixed: true, name, anchor: P(spots[0].x, spots[0].z), facing: Math.PI + ROT, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100, dmgMult: 0.32 }, list);
  g.units.forEach((u, i) => {
    const s = spots[i];
    if (!s) return;
    const q = P(s.x, s.z), y = s.abs ?? W.heightAt(q.x, q.z) + (s.dy || 0), d = dirL(s.f[0], s.f[1]);
    u.pos.set(q.x, y, q.z); u.perch = { x: q.x, y, z: q.z }; u.mesh.position.copy(u.pos);
    u.heading = Math.atan2(d.x, d.z); u.mesh.rotation.y = u.heading;
    u.gunAmmo = 60;
    if (list[i].o.small) { u.mesh.scale.multiplyScalar(0.84); u.bodyHeight *= 0.84; }
  });
  return g;
}
// 持ち場を捨てて逃げる（床から降りる）
const flee = (g) => { if (!g) return; g.noRout = false; g.morale = 0; g.focus = null; for (const u of g.units) u.perch = null; };

// ---- 大塔（多宝塔）：基本形を組んだ軽い一棟。材質は一度だけ作る ----
let TOWER_MAT = null;
function towerMats() {
  if (TOWER_MAT) return TOWER_MAT;
  const m = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  TOWER_MAT = { stone: m(0x8a857a), wood: m(0x4e3424), white: m(0xe2dccd), roof: m(0x3e3026, 0.95), bronze: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.5, metalness: 0.6 }),
    lattice: m(0x2a1c12), water: new THREE.MeshStandardMaterial({ color: 0x3a4a4c, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.86 }) };
  return TOWER_MAT;
}
function daitoModel(world, x, z) {
  const M = towerMats(), g = new THREE.Group();
  const y = world.heightAt(x, z);
  const add = (geo, mat, py, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.y = py; o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(17, 1.2, 17), M.stone, 0.6);                         // 基壇
  add(new THREE.BoxGeometry(14, 6, 14), M.white, 4.2);                           // 初重の壁
  for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) {                        // 柱
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(sx * 7, 4.2, k * 6.6);
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(k * 6.6, 4.2, sx * 7);
  }
  // 屋根は四角の錐台（軒の勾配はおよそ 27 度）。下から見上げても抜けないよう、軒裏の板で塞ぐ
  add(new THREE.CylinderGeometry(7.2, 14.5, 2.6, 4, 1, true), M.roof, 8.5, Math.PI / 4);   // 裳階の屋根
  add(new THREE.BoxGeometry(20.4, 0.25, 20.4), M.wood, 7.25);                        // 裳階の軒裏
  add(new THREE.CylinderGeometry(5.6, 6.4, 1.8, 24), M.white, 10.6);              // 亀腹
  add(new THREE.CylinderGeometry(5.2, 5.2, 5.2, 24), M.white, 13.6);              // 円い塔身
  add(new THREE.CylinderGeometry(5.4, 5.4, 0.6, 24), M.wood, 16.3);
  add(new THREE.CylinderGeometry(1.2, 13, 5.5, 4, 1, true), M.roof, 19.3, Math.PI / 4);   // 上重の屋根
  add(new THREE.BoxGeometry(18.3, 0.3, 18.3), M.wood, 16.6);                         // 上重の軒裏（組物の段）
  add(new THREE.CylinderGeometry(0.35, 0.45, 11, 8), M.bronze, 26.4);              // 相輪
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(1.1 - i * 0.06, 1.1 - i * 0.06, 0.22, 12), M.bronze, 22.4 + i * 0.75);
  add(new THREE.SphereGeometry(0.6, 10, 8), M.bronze, 32.2);
  g.position.set(x, y, z);
  return g;
}

const t04_negoro = {
  spawn: { x: START.x, z: START.z, heading: ROT },
  minutes: 5,
  noWake: true, noTaishoRaid: true, noDespair: true,
  // 目標は五つの段だけ（「敵を何人討つ」で埋めない。AW 3）
  stageGoalsOnly: true,
  // 11/4 jin（BH6・Simple）：敵を指す矢印と構えの案内は出さない。敵は頭上の▼で分かる
  meleeGuide: () => false,
  guardGuideAllowed: () => false,
  // 11/4 jin（AW3・AJ）：▼は段ごとに決まった一か所に立て、言葉もその段の行いにする（「門前の坊舎」を「門へ進め」と読み違えない）
  goalTargetOverride(rt) {
    const F = rt.flags, s = F.step || 0;
    if (F.ending || s < 1) return null;
    const T = F._ngTg || (F._ngTg = {});
    if (T.s !== s) {
      const at = s === 1 ? YOSE : s === 2 ? (F.posts.win ? centerOf(F.posts.win) : MONZEN) : s === 3 ? P(0, -3) : TOWER_FRONT;
      Object.assign(T, { s, x: at.x, z: at.z, unit: null, boss: false,
        action: ['', '坊舎へ寄れ', '鉄砲衆を討て', '山門を破れ', '大塔へ進め', '大塔を守れ'][s], label: ['', '門前の坊舎', '坊舎の鉄砲衆', '山門', '大塔', '大塔の前'][s] });
    }
    // 鉄砲衆は参道の左右の縁に分かれて据わる。真ん中の道を指さず、近い撃ち手の持ち場（動かない）を指す
    if (s === 2 && alive(F.posts.win) && !(T.unit && T.unit.alive)) {
      const p = rt.player.u.pos;
      let best = null, bd = 1e9;
      for (const u of F.posts.win.units) if (u.alive) { const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd) { bd = d; best = u; } }
      if (best) { T.unit = best; T.x = best.pos.x; T.z = best.pos.z; }
    }
    return T;
  },
  // 共通の奥の乱戦の補い（front_fill）は参道の正面に立って門前の坊舎と大門を隠すので、この戦では下の setup で参道の左右にだけ置く
  noFrontFill: true,
  introPlace: '紀伊国 根来寺（今の和歌山県岩出市根来）',
  introText: '竹束の陰について門前の坊舎へ寄れ。堀秀政を狙う鉄砲衆を討ち、丸太で山門を破って境内へ。大塔を焼かせるな。',
  world: {
    seed: 1585, time: 'day', muddy: 0.15, fogFar: 380, battleViewDistance: 110,   // 門前の坊舎・山門・大塔を霧に沈めない（11/2）
    paths: [SANDO],
    height,
    moveWay: sandoWay,
    guideWay: (u, p) => (NG_RT ? sandoWay(NG_RT.army, u, p) : p),
    // 11/4 jin（AW3・BK4）：行き先の▼は段の所に固定する（道の曲がり角へ動かさない）
    guideMarkerWay: false,
    tint(x, z, h, c) {
      const L = toL(x, z);
      // 参道は踏み固めた土、堂の前の平場は白い砂
      const d = distToPolyline(L.x, L.z, SANDO_L);
      if (d < 4) { const k = 1 - d / 4; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.37 * k, c.b * (1 - k) + 0.29 * k); }
      if (L.z > 50 && L.z < 120 && L.x > -26 && L.x < 40) c.setRGB(c.r * 0.8 + 0.1, c.g * 0.8 + 0.09, c.b * 0.8 + 0.07);
      // 北山と前山の斜面は濃い雑木の緑
      if (Math.abs(L.x) > 70 || L.z > 136) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.78);
    },
    paddy(x, z) {
      // 大門の外の田（紀の川の平地の条里は南北にそろう）
      const L = toL(x, z);
      if (L.z > -118 || L.z < -240 || Math.abs(L.x) < 7 || Math.abs(L.x) > 76) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => { const L = toL(x, z); return distToPolyline(L.x, L.z, SANDO_L) < 12 || (L.z > -112 && L.z < 124 && Math.abs(L.x) < 66) || Math.hypot(x - START.x, z - START.z) < 20; },
    trees: 520, tufts: 2600,
    treeDensity: (x, z) => { const L = toL(x, z); return Math.abs(L.x) > 70 || L.z > 132 ? 1.4 : L.z < -118 ? 0.05 : 0.25; },
    groves: [[-60, 128], [58, 126], [-82, -20], [84, 30]].map(([x, z], i) => ({ ...P(x, z), r: i < 2 ? 14 : 12, n: i < 2 ? 18 : 14 })),
    fleeOut: (x, z, team) => { const L = toL(x, z); return team === 1 && (L.z > 150 || Math.abs(L.x) > 110); },
  },
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '根来衆', mon: 'maru' } },
  date: () => '天正十三年三月二十三日　春・晴',

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.towerHp = 100; F.ending = false;
    NG_RT = rt;
    // 共通の乱戦の補い（frontline_density）は本人の横に数人の小勢を湧かせる（AW 6）。この戦では使わない
    rt.def.frontlineDensity = false;
    patchGunCover(rt);

    // ---- 寺の形：大門・築地塀・門前の坊舎・子院の雛壇と石垣・大伝法堂・大塔・大師堂・奥の院・大門池・菩提川 ----
    const tera0 = rt.scene.children.length;
    // 大門の左右の築地塀（口を空ける）。左右の塀は谷の奥へ折れ、北山と前山の裾を登る。塀は壊れない（打つのは大門の扉だけ）
    const WL = (pts) => wallLine(rt, pts.map(([x, z]) => PA(x, z)), { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8 });
    WL([[-WALL_X, 0], [-6.6, 0]]); WL([[6.6, 0], [WALL_X, 0]]);
    WL([[-WALL_X, 0], [-WALL_X, 118]]); WL([[WALL_X, 0], [WALL_X, 118]]);
    // 大門：三間一戸の二重門（今の門は 1850 年の建て直しで高さ 17m・幅 18m）。両脇の間は仁王の格子で塞ぐ
    const gy = W.heightAt(GATE.x, GATE.z);
    const daimon = romon(W, GATE.x, GATE.z, 8.4, ROT);
    daimon.scale.set(1.45, 1.6, 1.45);
    rt.scene.add(daimon);
    const bay = new THREE.Group();
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.6, 2.4), towerMats().wood);
      m.position.set(sx * 4.95, 2.8, 0); m.castShadow = true; bay.add(m);
      const r = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.4, 2.5), towerMats().lattice);
      r.position.set(sx * 4.95, 3.0, 0); bay.add(r);
      solidRect(...PA(sx * 4.95, 0), 3, 3, ROT);
    }
    bay.position.set(GATE.x, gy, GATE.z); bay.rotation.y = ROT; rt.scene.add(bay);
    for (const sx of [-1, 1]) wallLine(rt, [PA(sx * 3.4, 0), PA(sx * 6.6, 0)], { team: 1, hp: 1e9, name: '大門', mesh: () => new THREE.Group(), segLen: 4 });
    const gn = dirL(0, -1);
    F.gate = rt.army.addStruct({ seg: [...PA(-3.4, 0), ...PA(3.4, 0)], nx: gn.x, nz: gn.z, hp: 700, maxHp: 700, team: 1, name: '大門の門扉' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.2, 0.35), towerMats().wood);
    const gp = P(0, 0.3);
    F.gateMesh.position.set(gp.x, gy + 2.6, gp.z); F.gateMesh.rotation.y = ROT;
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    // 門前（西坂本）の坊舎：参道の左右に並ぶ。鉄砲衆が窓から撃つ
    F.monzen = [];
    for (const [x, z, r] of [[-18, -84, Math.PI / 2], [-18, -66, Math.PI / 2], [-32, -76, Math.PI / 2], [18, -84, -Math.PI / 2], [18, -66, -Math.PI / 2], [32, -76, -Math.PI / 2], [-20, -40, Math.PI / 2], [20, -40, -Math.PI / 2]]) {
      const q = P(x, z);
      const bo = sobo(W, q.x, q.z, r + ROT); bo.scale.setScalar(1.9); rt.scene.add(bo); F.monzen.push(q);   // 門前の坊舎は大きく（遠くからも寺と分かる。11/2）
      // 当たりも見た目の大きさにそろえる（元の大きさのままだと、兵が大きな屋根の下へ入り込み、壁の中に隠れて見えた。AJ）
      solidRect(q.x, q.z, 6.5 * 1.9, 5 * 1.9, r + ROT);
    }
    // 門前の坊舎の構え：坊舎の間と裏を築地塀で囲む（子院は塀で囲った一区画。AJ：坊舎の裏へ回り込んで、参道へ戻る道が分からなくなった）。
    //   参道に向く側は坊舎の戸口と縁だけ。兵も自分も裏へは入らない（塀は誰にも抜けない当たりも持つ）
    for (const s of [-1, 1]) {
      const B = (pts) => { const q = pts.map(([x, z]) => PA(s * x, z)); WL(pts.map(([x, z]) => [s * x, z])); for (let i = 0; i < q.length - 1; i++) solidSeg(q[i][0], q[i][1], q[i + 1][0], q[i + 1][1], 0.6); };
      B([[13.3, -90.2], [13.3, -96], [42, -96], [42, -28], [15.3, -28], [15.3, -33.8]]);
      B([[13.3, -77.8], [13.3, -72.2]]);
      B([[15.3, -59.8], [15.3, -46.2]]);
    }
    { const q = P(-34, -56); rt.scene.add(kura(W, q.x, q.z, Math.PI / 2 + ROT)); }
    { const q = P(36, -58); rt.scene.add(kura(W, q.x, q.z, -Math.PI / 2 + ROT)); }
    // 堂：大伝法堂（本堂）・大塔・大師堂は南を向く。焼け残った三つ
    rt.scene.add(hondo(W, DENPO.x, DENPO.z, 0));
    const daito = daitoModel(W, DAITO.x, DAITO.z); daito.scale.setScalar(1.15); rt.scene.add(daito);
    rt.scene.add(doja(W, DAISHI.x, DAISHI.z, 0));
    { const q = P(-12, 52); rt.scene.add(shoro(W, q.x, q.z, 0)); }
    // 子院：斜面を削った平場に建ち、低い側を石垣で留める（発掘の子院の作り）。坊舎は南を向く。最後の一つは奥の院
    F.keidai = [];
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i];
      rt.scene.add(i === SITES.length - 1 ? doja(W, s.x, s.z, 0) : sobo(W, s.x, s.z, 0));
      if (i < 8) F.keidai.push({ x: s.x, z: s.z });
    }
    const walls = [];
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i], y = siteY(i), x0 = s.x - s.hw, x1 = s.x + s.hw, z0 = s.z - s.hd, z1 = s.z + s.hd;
      // 辺は南・東・北・西の順（外へ向く側が右）
      for (const [ax, az, bx, bz, ox, oz] of [[x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x1, z0, x0, z0, 0, -1], [x0, z0, x0, z1, -1, 0]]) {
        const mx = (ax + bx) / 2 + ox * 3, mz = (az + bz) / 2 + oz * 3, drop = y - W.heightAt(mx, mz);
        // 地面の網目（2.5m）で縁がなだらかに見えるので、石垣は縁から 1m 外に、天端の高さを決めて積む
        if (drop > 0.35) walls.push({ drop, y, pts: [[ax + ox, az + oz], [bx + ox, bz + oz]] });
      }
    }
    walls.sort((p, q) => q.drop - p.drop);
    for (const w of walls.slice(0, MEM_TIGHT ? 8 : 28)) rt.scene.add(ishigaki(W, w.pts, { topY: w.y + 0.1, big: 1.5, maxH: 8, minH: 1.6 }));   // 坂の下の側で石垣の根が宙に浮かないよう、高さの上限を 8m に（11/4）
    for (const [x, z] of [[-8, -6], [8, -6], [-10, 64], [10, 64]]) { const q = P(x, z); rt.scene.add(nobori(W, q.x, q.z, NEGORO.flag, 5)); }
    // 大門池（大門の外の溜池）
    {
      const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2); g.scale(POND_L.rx * 0.92, 1, POND_L.rz * 0.92);
      const m = new THREE.Mesh(g, towerMats().water), q = P(POND_L.x, POND_L.z);
      m.position.set(q.x, rawL(POND_L.x, POND_L.z) - 0.75, q.z); m.rotation.y = ROT; m.receiveShadow = true; rt.scene.add(m);
      for (const k of [-0.55, 0, 0.55]) { const c = P(POND_L.x, POND_L.z + k * POND_L.rx); solidCircle(c.x, c.z, POND_L.rz * 0.8); }
    }
    // 菩提川の流れと参道の板橋
    for (let i = 0; i < BODAI_L.length - 1; i++) {
      let [ax, az] = BODAI_L[i], [bx, bz] = BODAI_L[i + 1];
      if (Math.abs(bx) < 4) { const t = (Math.abs(ax) - 4) / (Math.abs(ax) - Math.abs(bx)); bx = ax + (bx - ax) * t; bz = az + (bz - az) * t; }
      if (Math.abs(ax) < 4) { const t = (Math.abs(bx) - 4) / (Math.abs(bx) - Math.abs(ax)); ax = bx + (ax - bx) * t; az = bz + (az - bz) * t; }
      const A = P(ax, az), B = P(bx, bz), len = Math.hypot(B.x - A.x, B.z - A.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, len + 1.2), towerMats().water);
      m.position.set((A.x + B.x) / 2, Math.min(rawL(ax, az), rawL(bx, bz)) - 0.75, (A.z + B.z) / 2);
      m.rotation.y = Math.atan2(B.x - A.x, B.z - A.z); m.receiveShadow = true; rt.scene.add(m);
    }
    {
      const q = P(BRIDGE_L.x, BRIDGE_L.z), y = W.heightAt(q.x, q.z), br = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 8.5), towerMats().wood); deck.position.y = 0.2; br.add(deck);
      for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 8.5), towerMats().wood); r.position.set(sx * 2.5, 0.65, 0); br.add(r); }
      br.position.set(q.x, y, q.z); br.rotation.y = ROT; rt.scene.add(br);
    }
    // 門前の坊舎・蔵・大門は、田の寄せ口からでも霧に沈めない（根来の坊舎の屋根の並びが見える）
    farSight(rt.scene.children.slice(tera0), { W, ground: { ...P(0, -60), r: 70 } });
    // 秀吉の本陣：出だしの後ろ（田の中の寄せ口）に陣幕と幟。秀吉は幕の奥の床几に座る（AT3・AV7）
    const HJ = P(-24, -176);
    rt.scene.add(jinmaku(W, HJ.x, HJ.z, 12, 8, 4, { mon: HASHIBA.flag }));
    const SEAT = { x: HJ.x, z: HJ.z - 2 };
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, 0, { gunbai: true, color: 0x5a1a14 }));
    for (const [x, z] of [[-8, -190], [8, -190], [-42, -182], [26, -170]]) { const q = P(x, z); rt.scene.add(nobori(W, q.x, q.z, HASHIBA.flag, 6)); }
    { const q = P(20, -186); rt.scene.add(tawara(W, q.x, q.z, 0.3, 4)); }

    // ---- 羽柴勢：秀次の先手（自分が率いる）と筒井定次の手。名のある将は皆馬に乗る（AY 7） ----
    const H = { faction: 'oda', armor: HASHIBA.armor };
    F.vanG = allyGroup(rt, { ...H, name: '秀次の先手', anchor: P(-4, -132), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HASHIBA));
    F.tsutsuiG = allyGroup(rt, { ...H, name: '筒井定次の手', anchor: P(10, -136), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井定次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], HASHIBA));
    F.hidetsugu = allyGroup(rt, { ...H, name: '羽柴秀次の旗本', anchor: P(-16, -152), facing: ROT, width: 8, aggro: 4, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 6 }], HASHIBA));
    F.hidetsuguU = F.hidetsugu.units[0];
    // 紀州攻めの大将たち（battle_events_1101：秀吉・秀長・堀秀政・仙石秀久）。総大将の秀吉は後ろの本陣の床几に座って動かない。
    //   秀長は馬上で、旗本とともに本陣の前を固める。仙石は先手の右
    F.hideyoshi = allyGroup(rt, { ...H, name: '羽柴秀吉の本陣', anchor: SEAT, facing: ROT, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: false, hat: 'kabuto_m', haori: 0x8a6a1c, keep: true } }], HASHIBA));
    F.hideyoshi.stay = true; F.hideyoshi.noAI = true;
    for (const u of F.hideyoshi.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z + 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };   // 床几に腰を下ろしたまま（prelude の陣中の座りを使う）
    }
    { const q = P(-24, -164);
      F.hatamoto = allyGroup(rt, { ...H, name: '秀吉の旗本', anchor: q, facing: ROT, width: 12, aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, fullStrength: true },
        dress([{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true, hat: 'kabuto_m', keep: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 10, o: { keep: true } }], HASHIBA));
      F.hatamoto.stay = true; }
    // 堀秀政：坊舎の前へ馬を進め、根来の鉄砲に狙われる侍大将（AY 2「侍大将が鉄砲に狙われ、それを守る」）。討たれはせず、深手で退く
    F.horiG = allyGroup(rt, { ...H, name: '堀秀政の手', anchor: P(-14, -140), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], HASHIBA));
    F.horiU = F.horiG.units.find((u) => u.name === '堀秀政') || F.horiG.units[0];
    if (F.horiU) { F.horiU.maxHp *= 3; F.horiU.hp = F.horiU.maxHp; }
    F.sengokuG = allyGroup(rt, { ...H, name: '仙石秀久の手', anchor: P(30, -138), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], HASHIBA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad(P(4, -134), ROT, [{ kind: 'spear', n }]);
    F.friends = () => [F.vanG, F.tsutsuiG, F.horiG].filter((g) => g && g.count);
    // 十万の羽柴勢の後ろ（軽い作り）：田の向こうに控える。寺の中の見せかけの軍勢・目の前の作り物の乱戦は置かない（AF・AP 9）
    // 豊臣の旗は敵の紋の表にもあるので、側（team）をはっきり渡す
    [[-40, -206], [40, -206], [0, -226], [-60, -150], [60, -150]].forEach(([x, z], i) => {
      const q = P(x, z);
      const A = W.addDistantArmy({ x: q.x, z: q.z, w: 30, d: 14, count: 200, facing: ROT, armor: HASHIBA.armor, flagTex: flagTexture(HASHIBA.flag), mon: HASHIBA.flag, seed: 15850 + i, team: 0 });
      if (A && A.army) { A.army.team = 0; A.army.noWake = true; }
    });

    // ---- 根来衆の鉄砲（AY 2）：坊舎の縁・物見・大門の楼・築地塀の上・子院の石垣の上から撃つ。撃つ度に白い硝煙 ----
    F.posts = {};
    const lowQ = MEM_TIGHT;
    // 坊舎の縁：参道に向く側の腰板の陰（家の中から撃つ）。行人・僧・小柄な若い行人も鉄砲を持つ
    const win = [];
    for (const s of [-1, 1]) for (const [ax, zs] of [[12.6, [-87, -84, -81]], [12.6, [-69, -66, -63]], [14.6, [-43, -40, -37]]]) {
      for (const z of zs) win.push({ x: s * ax, z, dy: 0.45, f: [-s * 0.8, -0.6] });
      // 腰板（連子の下の板）：撃ち手の腰から下を隠す
      const q = P(s * (ax - 0.7), zs[1]), b = new THREE.Mesh(KOSHI_GEO(), towerMats().lattice);
      b.position.set(q.x, W.heightAt(q.x, q.z) + 0.95, q.z); b.rotation.y = ROT; b.castShadow = true; rt.scene.add(b);
    }
    F.posts.win = gunPost(rt, '坊舎の鉄砲衆', lowQ ? win.filter((_, i) => i % 3 !== 1) : win);
    // 物見：門前の囲いの奥の隅から撃ち下ろす（どこから狙われるか分からない）
    const mono = [];
    for (const s of [-1, 1]) {
      const q = P(s * 36, -90); rt.scene.add(monomidai(W, q.x, q.z, ROT));
      for (const o of [-0.5, 0.5]) mono.push({ x: s * 36 + o, z: -90.4, dy: 4.25, f: [-s * 0.5, -1] });
    }
    F.posts.mono = gunPost(rt, '物見の鉄砲', mono);
    // 大門の楼（上の縁）と、門の脇の築地塀の上（足場に立って塀越しに撃つ）
    const deck = [];
    for (let i = 0; i < (lowQ ? 4 : 6); i++) deck.push({ x: -4.5 + i * 9 / ((lowQ ? 4 : 6) - 1), z: -2.6, abs: gy + 7.35, f: [0, -1] });
    F.posts.deck = gunPost(rt, '大門の楼の鉄砲', deck);
    const wall = [];
    for (const s of [-1, 1]) for (const x of (lowQ ? [10, 18, 26] : [9, 13, 17, 21, 25, 29])) {
      wall.push({ x: s * x, z: 1.1, dy: 1.75, f: [0, -1] });
      const q = P(s * x, 1.1), m = new THREE.Mesh(STEP_GEO(), towerMats().wood);
      m.position.set(q.x, W.heightAt(q.x, q.z) + 0.85, q.z); m.rotation.y = ROT; m.castShadow = true; rt.scene.add(m);
    }
    F.posts.wall = gunPost(rt, '築地塀の鉄砲衆', wall);
    // 境内の子院の石垣の上：門を抜けた先の参道を左右から撃ち下ろす
    const kei = [];
    for (const i of [0, 3, 7]) { const s = SITES[i], y = siteY(i), L = toL(s.x, s.z); for (const o of [-1.2, 1.2]) kei.push({ x: L.x - Math.sign(L.x) * 4, z: L.z - 3.5 + o, abs: y + 0.05, f: [-Math.sign(L.x), -0.7] }); }
    F.posts.kei = gunPost(rt, '子院の鉄砲衆', kei);

    // ---- 竹束（AY 3）：一つの束を足軽二人が押して歩く。押す者がいなければ動かない。束は弾を止め、誰もすり抜けない ----
    F.tabaSet = [];
    for (const lx of [-8.4, -5, -1.7, 1.7, 5, 8.4]) {
      const g = allyGroup(rt, { ...H, name: '竹束の衆', anchor: P(lx, -124), facing: ROT, width: 1.6, aggro: 1, seekRange: 1, noRout: true, fixed: true, fullStrength: true },
        dress([{ type: 'ashigaru', n: 2, o: { keep: true } }], HASHIBA));
      // 共通の「味方も一緒にかかれ」（ally_charge）や大将の采配で押す役を外れない
      g.lane = lx; g.stay = true; g.noAI = true;
      const q = P(lx, -122.6);
      const tb = addTaba(rt, q.x, q.z, 0, { rot: ROT, fixed: true });
      for (const u of g.units) { u.tatake = tb.m; u.speed = 0.9; }
      F.tabaSet.push({ g, tb });
    }

    // ---- 丸太の組（AY 4）：大木を担いだ足軽が、山門の段で門扉を打ち破る。始めから担いで後ろに控える ----
    F.ramG = this.ramGroup(rt, P(-2, -146));
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.gate, get breached() { return !F.gate.alive; } }, kind: '丸太' });
    // ---- 戦の前の会話 ----
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '先手を率い、山門を破って根来寺の大塔まで攻め入る' : '山門を破り、境内の奥の大塔まで攻め入る', 'main');
    rt.say('羽柴秀吉', '十万で紀州へ入った。根来と雑賀の鉄砲を、根から絶て', 4);
    rt.after(4.3, () => rt.say('羽柴秀次', '千石堀で根来の者は多く死んだ。だが、寺にはまだ鉄砲が残っておる', 4.5));
    rt.after(9.1, () => rt.say('組頭', '坊舎の縁、物見、門の楼。どこからでも撃ってきます。坊主も小僧も鉄砲を持っておりますぞ', 4.5));
    rt.after(14, () => rt.say('羽柴秀次', `${nm(rt)}、竹束の陰について寄せよ。大塔は焼くな。殿下の仰せじゃ`, 4));
    rt.after(18, () => this.begin(rt));
  },

  // 丸太を担ぐ組：足軽八人。担ぎ手の半分が討たれると丸太は止まる（hajo.js）
  //   担ぎ手は陣笠と胴で弾を一つ二つは受けて歩く（門まで百歩を撃たれ通しで、着く前に皆倒れていた）
  ramGroup(rt, at) {
    const g = Object.assign(allyGroup(rt, { faction: 'oda', armor: HASHIBA.armor, name: '丸太の組', anchor: at, facing: ROT, width: 3, aggro: 1, seekRange: 1, noRout: true, fixed: true, fullStrength: true },
      dress([{ type: 'ashigaru', n: 8, o: { keep: true } }], HASHIBA)), { stay: true, noAI: true });
    for (const u of g.units) { u.maxHp *= 4; u.hp = u.maxHp; }
    return g;
  },

  begin(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    rt.setPhase('fight');
    sfx('taiko', 0.9);
    const ctx = { faction: 'saika', flag: NEGORO.flag, armor: NEGORO.armor, friends: F.friends, look: (list) => dress(list, NEGORO), dmg: 0.5, scale: 1.4, backing: false };
    depthStart(rt, ctx, [
      stepped(1, this.tabaStep()),
      stepped(2, this.horiStep()),
      stepped(3, this.gateStep()),
      stepped(4, this.enterStep()),
      // ⑤ 大塔の前の行人方を崩し、大塔を守り抜く（味方も一緒に守る。自分が討たずとも刻と味方の働きで済む）
      stepped(5, DP.hold({ at: TOWER_FRONT, r: 16, dur: 70, noRefill: true, label: '大塔の前', obj: '大塔の前の行人方を崩し、大塔を守れ',
        title: '大塔を焼かせるな', sub: '行人方が火をかけに来る',
        say: [['羽柴秀次', '大塔に火をかけさせるな！　あれは残せと殿下の仰せじゃ', 4]],
        waves: () => [
          { t: 2, say: ['足軽', '奥から行人方じゃ！　松明を持っておる！', 3], foes: () => [this.towerWave('前山の行人方', P(-44, 112))] },
          { t: 22, foes: () => [this.towerWave('北山の行人方', P(36, 132))] },
          { t: 42, say: ['組頭', 'まだ来る！　大塔の裏へ回らせるな！', 3], foes: () => [this.towerWave('奥の谷の衆', P(0, 128))] },
        ],
        reward: '大塔を焼かせずに守った' })),
    ], () => this.win(rt));
  },

  // 生きている竹束の、谷の道の向きの位置の平らし（押す者がいない束は数えない）
  tabaFront(F) {
    let s = 0, k = 0;
    for (const t of F.tabaSet) if (t.g.count) { s += toL(t.tb.x, t.tb.z).z; k++; }
    return k ? s / k : 0;
  },

  // ① 竹束の陰について寄る：押す衆が竹束を押し、先手はその後ろを歩く。自分が動かなくても寄せは進む（AY 3・5）
  tabaStep() {
    const self = this;
    return {
      kind: 'move', max: 80,
      start(rt, C) {
        const F = rt.flags;
        C.at = YOSE; C.goal = P(0, -108);
        rt.banner('竹束を前へ', '束の陰について寄せる');
        rt.obj('dp', '竹束の陰について、味方と門前の坊舎へ寄る', 'main');
        rt.marker('dp', YOSE, '門前の坊舎', { h: 3 });
        rt.say('組頭', '竹束を前へ！　押し立てて寄せよ！　束の陰から出るな！', 3.5);
        for (const t of F.tabaSet) { t.goal = -99; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, z = self.tabaFront(F);
        // 先手・筒井・堀の手は竹束の後ろについて歩く（竹束より前へ出ない）
        const behind = [[F.vanG, -3, 5], [F.tsutsuiG, 5, 7], [F.horiG, -11, 9], [F.ramG, -1, 22]];
        for (const [g, x, b] of behind) if (g && g.count) { g.order = 'move'; g.anchor = P(x, Math.min(z, -100) - b); }
        if (F.sengokuG.count) { F.sengokuG.order = 'move'; F.sengokuG.anchor = P(28, Math.min(z, -100) - 12); }
        C.goal = P(0, z - 2.5);
        rt.objProgress('dp', `あと ${Math.max(0, Math.round(-100 - z))}m`);
        if (el > 8 && !C.said) { C.said = true; rt.say('足軽', '弾が竹に当たっておる！　束の陰なら抜けぬぞ', 3); }
        return z >= -101 || !F.tabaSet.some((t) => t.g.count);
      },
      end(rt, C) {
        const F = rt.flags;
        rt.unmark('dp'); rt.objDone('dp');
        for (const t of F.tabaSet) { t.goal = null; t.g.order = 'hold'; t.g.anchor = { x: t.tb.x, z: t.tb.z }; }
        rt.award((t) => t.side.push('竹束で門前まで寄せた'), '竹束で寄せた');
      },
    };
  },

  // ② 堀秀政が坊舎の前へ馬を進める。根来の鉄砲は皆、堀を狙う。縁と物見の鉄砲衆を討って堀を守る（AY 2）
  horiStep() {
    return {
      kind: 'hori', max: 150,
      start(rt, C) {
        const F = rt.flags;
        C.at = MONZEN; C.goal = MONZEN; C.groups = []; C.later = [{ t: 20 }];
        rt.banner('堀秀政が狙われておる', '坊舎の鉄砲衆を討つ');
        sfx('taiko', 0.8);
        rt.say('堀秀政', '坊主ばらの鉄砲など恐るるな！　者ども、坊舎へかかれ！', 3.5);
        rt.after(4, () => rt.say('組頭', '鉄砲が皆、堀様を狙うておる！　縁の撃ち手を斬れ！', 3.5));
        F.horiG.order = 'attack'; F.horiG.seekRange = 40; F.horiG.anchor = P(-4, -76);
        // 竹束は参道の両脇へ寄せ、真ん中を丸太の組の通り道に空ける
        for (const t of F.tabaSet) { t.wide = 2.2; t.goal = -97; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
        // 丸太の組は先手の後ろへ詰める（山門の段ですぐ門へ寄れるように）
        F.ramG.order = 'move'; F.ramG.anchor = P(-1, -94);
        for (const g of [F.vanG, F.tsutsuiG]) if (g.count) { g.order = 'attack'; g.seekRange = 45; g.anchor = MONZEN; }
        for (const k of ['win', 'mono']) if (F.posts[k] && F.horiU) F.posts[k].focus = F.horiU;
        // 坊舎の戸口から行人方が斬って出る（参道の側から。裏や蔵の間には出さない。AJ）
        for (const [x, z] of [[-10, -64], [10, -66]]) {
          C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '坊舎の行人方', anchor: P(x, z), facing: Math.PI + ROT, order: 'attack', seekRange: 50, aggro: 12, width: 6, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.5 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], NEGORO)));
        }
        rt.obj('dp', '堀秀政を狙う坊舎の鉄砲衆を討ち、堀を守る', 'main');
        rt.marker('dp', centerOf(F.posts.win), '坊舎の鉄砲衆', { red: true, group: F.posts.win });
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, h = F.horiU;
        if (C.later.length && el > 20) {
          C.later.length = 0;
          rt.say('足軽', '雑賀の鉄砲衆じゃ！　奥の坊舎の縁から撃ってくるぞ、伏せよ！', 3);
          C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '雑賀の鉄砲衆', anchor: SAIKA_EN, facing: Math.PI + ROT, order: 'attack', seekRange: 50, aggro: 10, width: 5, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.4 },
            dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 6, o: { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null } }], NEGORO)));
        }
        // 堀が深手を負えば、旗本が抱えて退く（討たれはしない。守る目当ては果たせなかった事になる）
        if (h && !F.horiHurt && h.hp < h.maxHp * 0.3) {
          F.horiHurt = true; h.invuln = true;
          F.horiG.order = 'move'; F.horiG.anchor = P(-14, -140);
          for (const k of ['win', 'mono']) if (F.posts[k]) F.posts[k].focus = null;
          rt.say('堀秀政', '……不覚。いったん退く。あとは任せたぞ', 3.5);
        }
        const guns = heads([F.posts.win]);
        const foes = heads(C.groups);
        const g0 = alive(F.posts.win) ? F.posts.win : C.groups.find(alive);
        C.goal = g0 ? g0.center() : MONZEN;
        rt.objProgress('dp', `残る鉄砲 ${guns}挺${F.horiHurt ? '・堀は退いた' : ''}`);
        // 縁の撃ち手が減るか長引けば、残る根来衆は坊舎の裏へ逃げ出す（自分が討たなくても筋は進む）
        if ((guns <= 4 || el > 95) && !C.broke) { C.broke = true; for (const g of [...C.groups, F.posts.win]) if (g) { g.noRout = false; g.morale = Math.min(g.morale, 15); } if (el > 95) flee(F.posts.win); }
        return (guns <= 4 && foes <= 4 && !C.later.length) || el > 130;
      },
      end(rt, C) {
        const F = rt.flags;
        for (const g of [...C.groups, F.posts.win, F.posts.mono]) flee(g);
        rt.unmark('dp');
        if (F.horiHurt) rt.objFail('dp');
        else { rt.objDone('dp'); rt.award((t) => t.side.push('堀秀政を鉄砲から守った'), '堀秀政を守った'); }
        if (!F.horiHurt) rt.say('堀秀政', '鉄砲が黙ったな。よう守ってくれた', 3);
      },
    };
  },

  // ③ 山門：丸太の組が門扉を打つ。自分が丸太のそばにいれば皆で押して早く破れる（AY 4）
  gateStep() {
    const self = this;
    return {
      kind: 'gate', max: 150,
      start(rt, C) {
        const F = rt.flags;
        C.at = P(0, -6); C.goal = P(0, -10); C.groups = [];
        rt.banner('山門を打ち破れ', '丸太の組を守る');
        sfx('taiko', 0.8);
        rt.say('組頭', '丸太を前へ！　門扉を打ち破れ！　担ぎ手を撃たせるな！', 3.5);
        self.sendRam(rt);
        const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '山門の守り', anchor: P(0, -12), facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 12, width: 8, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], NEGORO));
        C.groups.push(g);
        // 味方は参道の左右から門の守りにかかり、真ん中を丸太の通り道に空ける
        F.friends().forEach((fg, i) => { fg.order = 'attack'; fg.seekRange = 40; fg.anchor = P(i % 2 ? 7 : -7, -14); });
        for (const t of F.tabaSet) { t.goal = -20; t.wide = 2.2; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
        rt.obj('dp', '丸太の組を守り、山門を打ち破る', 'main');
        rt.marker('dp', P(0, -3), '山門', { h: 4 });
      },
      tick(rt, C, m, ctx, el, dt) {
        const F = rt.flags, s = F.gate, pu = rt.player.u;
        if (s.alive) {
          // 丸太の組が尽きたら、後ろから新しい丸太の組が来る
          if ((F.ram.stopped || !F.ramG.count) && (C.reram || 0) < 3) {
            C.reram = (C.reram || 0) + 1;
            F.ramG = self.ramGroup(rt, P(0, -34)); F.ramZ = null;
            F.ram = makeRam(rt, { group: F.ramG, gate: { struct: s, get breached() { return !s.alive; } }, kind: '丸太' });
            self.sendRam(rt);
            rt.say('組頭', '新しい丸太を運べ！　門は目の前じゃ！', 3);
          }
          // 自分が丸太のそばにいれば、皆で声を合わせて押す（打つ力が増す）
          const mm = F.ram.mesh;
          if (mm.visible && Math.hypot(mm.position.x - pu.pos.x, mm.position.z - pu.pos.z) < 5 && Math.hypot(s.seg[0] / 2 + s.seg[2] / 2 - pu.pos.x, s.seg[1] / 2 + s.seg[3] / 2 - pu.pos.z) < 8) {
            C.pushT = (C.pushT || 0) + dt;
            if (!C.pushSaid) { C.pushSaid = true; rt.say('足軽', 'お頭も手を貸してくだされ！　一、二の、三！', 3); }
            if (C.pushT > 1.1) { C.pushT = 0; rt.army.damage(s, 24, pu, { kind: 'ram' }); }
          }
          if (el > 120) self.openGate(rt);
        }
        if (!s.alive && C.openT == null) C.openT = el;
        C.goal = s.alive ? (C.groups.find(alive)?.center() || P(0, -9)) : P(0, 8);
        rt.objProgress('dp', s.alive ? `門扉 ${Math.round(100 * (1 - s.hp / s.maxHp))}%` : '');
        return C.openT != null && el - C.openT > 2;
      },
      end(rt, C) {
        for (const g of C.groups) flee(g);
        rt.unmark('dp');
        rt.objDone('dp');
        rt.award((t) => t.side.push('丸太の組を守り、山門を破った'), '山門を破った');
      },
    };
  },

  // 丸太の組を門へ（門扉を的にして打つ）
  sendRam(rt) {
    const F = rt.flags;
    // 門の前までは歩かせる（着いたら update で門扉を的にする）
    F.ramG.order = 'move'; F.ramG.focus = null; F.ramG.anchor = P(0, -3.2); F.ramG.seekRange = 1;
  },

  // ④ 境内へ：門が破れたら、味方が勝手に攻め入る。自分が門の外にいても筋は進む（AY 5）
  enterStep() {
    return {
      kind: 'move', max: 60,
      start(rt, C) {
        const F = rt.flags;
        C.at = TOWER_FRONT; C.goal = P(0, 30); C.groups = [];
        for (const k of ['deck', 'wall']) flee(F.posts[k]);
        rt.say('堀秀政', '門が開いたぞ！　皆、境内へなだれ込め！', 3);
        for (const g of [...F.friends(), F.ramG, F.sengokuG]) if (g && g.count) { g.order = 'attack'; g.seekRange = 40; g.anchor = P(0, 96); }
        C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '橋の行人方', anchor: P(0, 50), facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 12, width: 8, morale: 80, fleeDir: dirL(0, 1), dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], NEGORO)));
        rt.obj('dp', '味方と境内へ攻め入り、大塔の前へ', 'main');
        rt.marker('dp', TOWER_FRONT, '大塔', { h: 4 });
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, p = toL(rt.player.u.pos.x, rt.player.u.pos.z);
        const g = F.vanG.count ? F.vanG : F.tsutsuiG;
        const c = g.count ? toL(g.center().x, g.center().z) : { z: 0 };
        C.goal = p.z < 30 ? P(0, 34) : TOWER_FRONT;
        rt.objProgress('dp', `大塔まで あと ${Math.max(0, Math.round(TOWER_FRONT_L - Math.max(p.z, c.z)))}m`);
        return (c.z > 60 || p.z > 90) && heads(C.groups) <= 3 || el > 55;
      },
      end(rt, C) {
        const F = rt.flags;
        for (const g of [...C.groups, F.posts.kei]) flee(g);
        rt.unmark('dp'); rt.objDone('dp');
      },
    };
  },

  // 大塔へ寄せる行人方：大塔の前へ駆け、近くに居る間は塔が焦げる（update で数える）
  towerWave(name, from) {
    return { name, from, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], dmg: 0.5, mass: 0, noRout: 20 };
  },

  openGate(rt) {
    const F = rt.flags, s = F.gate;
    // 丸太が打ち破った時（onStructDestroyed）も、ここで一度だけ知らせを出す
    if (F.gateOpened) return;
    F.gateOpened = true;
    if (s.alive) {
      s.hitFrom = P(0, -4); s.alive = false; s.hp = 0;
      rt.army.structFall(s);
    }
    sfx('taiko', 1);
    rt.banner('山門が破れた', '境内へ攻め入る');
    rt.say('足軽', '門扉が割れたぞ！　境内へ！', 2.5);
    // 史実：坊舎の多くが焼けた。境内の坊舎に火が回る（大塔と大師堂は残る）
    const W = rt.world;
    if (W.addBlaze && !F.blazes) {
      F.blazes = [];
      for (const q of [F.keidai[0], F.keidai[3], F.keidai[5], F.monzen[2], F.monzen[5]]) if (q) F.blazes.push(W.addBlaze(q.x, q.z, { w: 6.5, d: 5, h: 3.2 }));
      rt.after(5, () => rt.say('堀秀政', '坊舎に火が回った！　根来の寺が燃えるぞ。大塔へ火を渡すな', 3.5));
    }
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) this.openGate(rt);
  },

  // 竹束は押す二人の前について動く。押す者が皆倒れれば、その場に残る（誰もいないのに動かない）
  moveTabas(rt, dt) {
    const F = rt.flags;
    if (!F.tabaSet) return;
    const f = dirL(0, 1), k = Math.min(1, dt * 6);
    for (const t of F.tabaSet) {
      let n = 0, cx = 0, cz = 0;
      for (const u of t.g.units) if (u.alive && !u.fleeing) { cx += u.pos.x; cz += u.pos.z; n++; }
      if (n) {
        cx /= n; cz /= n;
        // 押す者は歩いて押す（走らない）：行き先を毎秒 0.85m ずつ先へ置く
        if (t.goal != null) { const L = toL(cx, cz); t.g.order = 'move'; t.g.anchor = P(t.g.lane * (t.wide || 1), Math.min(t.goal, L.z + 2.6, t.z0 + 0.85 * (rt.t - t.t0))); }
        t.tb.x += (cx + f.x * 0.85 - t.tb.x) * k; t.tb.z += (cz + f.z * 0.85 - t.tb.z) * k; t.tb.rot = ROT;
        placeTaba(rt, t.tb);
      }
      // 竹束の当たり：押す者のほかは、兵も自分も束を抜けない（幅 2.1m・厚み 0.6m の板として押し返す）
      const tb = t.tb;
      rt.army.forNear(tb.x, tb.z, 2.2, (u) => {
        if (u.isStruct || !u.alive || u.group === t.g || u.perch) return;
        const dx = u.pos.x - tb.x, dz = u.pos.z - tb.z, a = dx * f.x + dz * f.z, c = dx * f.z - dz * f.x;
        const pc = 1.4 - Math.abs(c), pa = 0.65 - Math.abs(a);
        if (pc <= 0 || pa <= 0) return;
        if (pc < pa) { const s = c < 0 ? -1 : 1; u.pos.x += f.z * pc * s; u.pos.z -= f.x * pc * s; }
        else { const s = a < 0 ? -1 : 1; u.pos.x += f.x * pa * s; u.pos.z += f.z * pa * s; }
      });
    }
  },

  carryRam(rt, dt) {
    const F = rt.flags, g = F.ramG, s = F.gate, FRONT = -3.4;
    const live = g.units.filter((u) => u.alive && !u.fleeing);
    if (!live.length) return;
    if (F.ramZ == null) { let z = 0; for (const u of live) z += toL(u.pos.x, u.pos.z).z; F.ramZ = Math.min(FRONT, z / live.length); }
    let off = 0;
    live.forEach((u, i) => {
      if (u.target && !u.target.isStruct) u.target = null;
      const q = P((i % 2 ? 0.6 : -0.6), F.ramZ + 1.3 - Math.floor(i / 2) * 0.9);
      const dx = q.x - u.pos.x, dz = q.z - u.pos.z, d = Math.hypot(dx, dz);
      off += d;
      // 人混みに押されても列へ戻る（歩く速さまで）
      if (d > 0.05) { const m = Math.min(d, 2.4 * dt) / d; u.pos.x += dx * m; u.pos.z += dz * m; }
    });
    // 皆が列に着いている間だけ前へ（一人ずつばらばらに門へ行かない）
    //   乱れている間は足をゆるめて待つ（止まり切らない。門の十二歩手前からは揃いを待たない）
    //   すぐ前に斬りかかる敵がいる間は、味方が退けるまで丸太を下げて待つ（担いだまま斬り合いへ突っ込まない）
    const ordered = off / live.length < 2 || F.ramZ > -12;
    const head = P(0, F.ramZ + 3);
    let foe = false;
    rt.army.forNear(head.x, head.z, 4, (u) => { if (!foe && u.alive && u.team === 1 && !u.isStruct && !u.perch && !u.fleeing && !u.downed && !u.dying) foe = true; });
    //   待つのは八秒まで（味方が退けきれない時も、丸太は門を目指す）
    F.ramWait = foe ? (F.ramWait || 0) + dt : Math.max(0, (F.ramWait || 0) - dt);
    if (F.ramZ < FRONT && (!foe || F.ramWait > 8)) F.ramZ = Math.min(FRONT, F.ramZ + (ordered ? 1.7 : 0.9) * dt);
    const at = P(0, F.ramZ);
    if (F.ramZ >= FRONT - 2.5) {
      if (g.order !== 'attack') { g.order = 'attack'; g.focus = s; g.seekRange = 1; }
      g.anchor = at;
      for (const u of live) u.target = s;   // 担ぎ手は皆、門扉を打つ
    }
    else { g.order = 'move'; g.focus = null; g.anchor = at; }
  },

  update(rt, dt) {
    const F = rt.flags;
    this.moveTabas(rt, dt);
    // 丸太の組は斬り合わない：参道を門の前まで担いで歩き、着いてから門扉を打つ（途中の敵に取り付いて、門へ着かなかった）
    //   担ぎ手は二列に並んで丸太の左右につき、組の真ん中（F.ramZ）は皆が揃っている時だけ歩く速さで前へ進む
    if (F.ramG && F.step === 3 && F.gate.alive) this.carryRam(rt, dt);
    if (F.ram) F.ram.tick(dt);
    tickTabas(rt, dt);
    depthTick(rt, dt);
    if (F.ending) return;
    // 大塔：近くに寄った根来衆の数だけ焦げる。焼け落ちたら負け
    if (F.step >= 5) {
      F.towerScanT = (F.towerScanT || 0) - dt;
      if (F.towerScanT <= 0) {
        F.towerScanT = 0.5;
        let k = 0;
        for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.perch && Math.hypot(u.pos.x - DAITO.x, u.pos.z - DAITO.z) < 13) k++;
        if (k) {
          F.towerHp = Math.max(0, F.towerHp - k * 0.2);
          if (!F.towerWarn && F.towerHp < 60) { F.towerWarn = true; rt.say('羽柴秀次', '大塔の縁に火がついた！　行人方を寄せつけるな！', 3); }
          if (F.towerHp < 40 && !F.towerFire && rt.world.addFire) F.towerFire = rt.world.addFire(DAITO.x - 4, DAITO.z + 10, { size: 1.6, h: 1.2 });
        }
        rt.objProgress('main', `大塔の守り ${Math.round(F.towerHp)}／100`);
        if (F.towerHp <= 0) { this.lose(rt, '大塔が焼け落ちた'); return; }
      }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    if (F.towerFire && rt.world.removeFire) rt.world.removeFire(F.towerFire);
    sfx('horagai', 0.8);
    rt.banner('根来寺、落ちる', '大塔と大師堂は残った');
    rt.award((t) => { t.main = true; t.special = { label: F.towerHp > 80 ? '大塔に火を付けさせずに守り抜いた' : '焦げた大塔を守り抜いた', pts: 18 }; }, '大塔を守った');
    // 戦の後の会話
    rt.player.u.invuln = true;
    rt.say('羽柴秀吉', '坊主の鉄砲も、これで終いじゃ', 3.5);
    rt.after(3.8, () => rt.say(rt.G.name || '自分', '大塔だけは残りました', 3));
    rt.after(7, () => rt.say('羽柴秀次', '弾の跡は残ろうと、塔は立っておる。よう働いた', 3.5));
    rt.after(11, () => rt.say('仙石秀久', '雑賀の衆も散り散りじゃ。紀州の鉄砲の守りは崩れましたぞ', 3.5));
    rt.finish({}, 15);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    if (rt.world.addBlaze) rt.world.addBlaze(DAITO.x, DAITO.z, { w: 14, d: 14, h: 12, n: 3 });
    rt.banner(why, '大塔の炎が谷を照らす');
    rt.say('羽柴秀次', '大塔が……！　殿下に何と申し上げればよい', 3.5);
    rt.finish({ failureReason: why }, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（羽柴勢はおよそ十万。根来寺に残った衆は数千の目安）
t04_negoro.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(100000 - (F.ak || 0) * 30), a0: 100000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
t04_negoro.history = '天正十三年（1585）三月、小牧・長久手の和睦を終えた羽柴秀吉は、およそ十万の兵で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻めるためである。三月二十一日、和泉の千石堀城では根来衆の主力が激しく戦ったが、火が煙硝蔵に入って城は落ちた。二十三日、秀吉勢は根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は焼け残り、大塔には今も弾の跡が残ると伝わる。史実では根来寺そのものでの抵抗は少なかった。遊びでは寺に残った鉄砲衆の抵抗を厚くし（坊舎の縁・物見・大門の楼・塀の上から撃つ）、竹束での寄せ・堀秀政を狙う鉄砲衆の討ち取り・丸太での山門破り・境内への突入・大塔の守りを一続きの段にまとめた。地形は国土地理院の実測（北山・前山・大門の口）を縮めて写し、堂の並びは今の大門・大伝法堂・大塔・大師堂の位置に合わせた。子院は斜面を削って石垣で平場を作る（発掘による）。寸法と子院の数、秀次・筒井定次の持ち場は推定。';

// bot：段の的へ進み、目の前の敵を突く（b_depth の頭）
t04_negoro.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (b.flags.ending) { inp.k.delete('KeyW'); return; }
  if (!b.flags.dp || !b.flags.dp.on) {
    // 段の始まる前は先手のそばで待つ
    const u = b.player.u;
    inp.k.delete('KeyW');
    const S8 = P(0, -132);
    if (Math.hypot(u.pos.x - S8.x, u.pos.z - S8.z) > 4) goTo(b.player, inp, S8.x, S8.z, 2);
    return;
  }
  depthBot(b, inp, goTo);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t04_negoro);

export { t04_negoro };
export default t04_negoro;
