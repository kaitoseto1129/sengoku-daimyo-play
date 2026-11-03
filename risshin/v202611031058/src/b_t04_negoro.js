// ======================================================================
// 豊臣編 4　紀州征伐／根来寺（天正十三年（1585）三月二十三日。docs/chapter2_toyotomi.md の 4）
// 小牧・長久手の和睦の後、秀吉はおよそ十万で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻める。
// 三月二十一日、和泉の千石堀城で根来衆の主力が激しく戦い、火が煙硝蔵に入って落ちた。
// 二十三日、秀吉勢が根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は残った。
// 自分は部将として羽柴秀次の先手を率いる。竹束で門前の坊舎へ寄る → 坊舎の鉄砲衆を追い出す →
// 山門を開ける → 大塔の前の行人方を崩し、大塔を焼かせない。
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
import { enemyGroup, allyGroup, wallLine, nm } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, jinmaku, tsuiji, tawara, romon, ishigaki, solidRect, solidCircle } from './props.js';
import { sobo, kura, doja, hondo, shoro } from './temple_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { addTaba, makeTabaAdvance, tickTabas, patchGunCover } from './taketaba.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';
import { MEM_TIGHT } from './settings.js';

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
const GATE = P(0, 0);                   // 大門（二重の大きな楼門。1585 年に焼け残り、のちに大和郡山城の門になったと伝わる）
const DAITO_L = { x: 18, z: 86 };
const DAITO = P(DAITO_L.x, DAITO_L.z);  // 大塔（参道の左＝北。北山の裾の平場に南を向いて立つ）
const DENPO = P(12, 60);                // 大伝法堂（本堂。大塔の西の前。焼け残り、秀吉が京へ運ばせた）
const DAISHI = P(32, 70);               // 大師堂（大塔のすぐ西。焼け残った）
const TOWER_FRONT = P(0, 106);         // 大塔を背にして、奥から来る行人方を受ける所
const MONZEN = P(0, -74);               // 門前（西坂本）の坊舎の並び
const YOSE = P(0, -96);                 // 竹束の寄せ場
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
  ['竹束を押して、門前の坊舎へ寄る'],
  ['坊舎に斬り込み、鉄砲衆を追い出す', atStep(2)],
  ['山門を開け、境内へ入る', atStep(3)],
  ['大塔の前の行人方を崩し、大塔を守る', atStep(4)],
];
// 段に入った時に step を進める包み
const stepped = (n, st) => ({ ...st, start(rt, C, m, ctx) { rt.flags.step = n; rt.flags.stepT = rt.t; st.start(rt, C, m, ctx); } });
const alive = (g) => !!g && g.count > 0 && !g.routed;
const heads = (list) => list.reduce((a, g) => a + (alive(g) ? g.count : 0), 0);

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
  // 共通の奥の乱戦の補い（front_fill）は参道の正面に立って門前の坊舎と大門を隠すので、この戦では下の setup で参道の左右にだけ置く
  noFrontFill: true,
  introPlace: '紀伊国 根来寺（今の和歌山県岩出市根来）',
  introText: '竹束を押して門前の坊舎へ寄れ。鉄砲衆を追い出し、山門を開けて境内へ。大塔の前の行人方を崩し、大塔を焼かせるな。',
  world: {
    seed: 1585, time: 'day', muddy: 0.15, fogFar: 380, battleViewDistance: 110,   // 門前の坊舎・山門・大塔を霧に沈めない（11/2）
    paths: [SANDO],
    height,
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
    F.gate = rt.army.addStruct({ seg: [...PA(-3.4, 0), ...PA(3.4, 0)], nx: gn.x, nz: gn.z, hp: 260, maxHp: 260, team: 1, name: '大門の門扉' });
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
    for (const w of walls.slice(0, MEM_TIGHT ? 8 : 28)) rt.scene.add(ishigaki(W, w.pts, { topY: w.y + 0.1, big: 1.5, maxH: 4.5, minH: 1.6 }));
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
    // 秀次の陣：出だしの後ろに陣幕と幟
    { const q = P(-22, -158); rt.scene.add(jinmaku(W, q.x, q.z, 12, 8, 4, { mon: HASHIBA.flag })); }
    for (const [x, z] of [[-8, -178], [8, -178], [-26, -170], [26, -170]]) { const q = P(x, z); rt.scene.add(nobori(W, q.x, q.z, HASHIBA.flag, 6)); }
    { const q = P(20, -186); rt.scene.add(tawara(W, q.x, q.z, 0.3, 4)); }

    // ---- 羽柴勢：秀次の先手（自分が率いる）と筒井定次の手 ----
    const H = { faction: 'oda', armor: HASHIBA.armor };
    F.vanG = allyGroup(rt, { ...H, name: '秀次の先手', anchor: P(-6, -130), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HASHIBA));
    F.tsutsuiG = allyGroup(rt, { ...H, name: '筒井定次の手', anchor: P(14, -136), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井定次', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], HASHIBA));
    F.hidetsugu = allyGroup(rt, { ...H, name: '羽柴秀次の旗本', anchor: P(-22, -154), facing: ROT, width: 8, aggro: 4, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'samurai', n: 3 }], HASHIBA));
    F.hidetsuguU = F.hidetsugu.units[0];
    // 紀州攻めの大将たち（battle_events_1101：秀吉・秀長・堀秀政・仙石秀久）。秀吉と秀長は陣幕の前、堀と仙石は先手の両脇
    F.hideyoshi = allyGroup(rt, { ...H, name: '羽柴秀吉の本陣', anchor: P(-30, -164), facing: ROT, width: 6, aggro: 3, seekRange: 6, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x8a6a1c } }, { type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }], HASHIBA));
    F.horiG = allyGroup(rt, { ...H, name: '堀秀政の手', anchor: P(-34, -138), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }], HASHIBA));
    F.sengokuG = allyGroup(rt, { ...H, name: '仙石秀久の手', anchor: P(36, -138), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], HASHIBA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad(P(4, -134), ROT, [{ kind: 'spear', n }]);
    F.friends = () => [F.vanG, F.tsutsuiG].filter((g) => g && g.count);
    // 十万の羽柴勢（軽い作り）：田の向こうに控える
    // 豊臣の旗は敵の紋の表にもあるので、側（team）をはっきり渡す
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => {
      const q = P(x, z);
      const A = W.addDistantArmy({ x: q.x, z: q.z, w, d, count, facing: facing + ROT, armor, flagTex: flagTexture(flag), mon: flag, seed, team });
      if (A && A.army) { A.army.team = team; A.army.noWake = true; }
      return A;
    };
    [[-40, -206], [40, -206], [0, -226], [-60, -150], [60, -150]].forEach(([x, z], i) => DA(x, z, 30, 14, 200, 0, HASHIBA.armor, HASHIBA.flag, 15850 + i, 0));
    // 境内の奥の根来衆（軽い作り）
    DA(0, 120, 34, 10, 140, Math.PI, NEGORO.armor, NEGORO.flag, 15860, 1);

    // 田の左右で羽柴勢と根来の行人がぶつかる乱戦（軽い作り）。参道の正面は空け、門前の坊舎の屋根と大門を見せる
    for (const [x, z, sd] of [[-19, -106, 1], [21, -107, -1]]) {
      const q = P(x, z);
      W.addClash({ x: q.x, z: q.z, facing: 0.6 * sd + ROT, w: MEM_TIGHT ? 20 : 26, gap: 2.6, bw: 5, seed: 15870 + x, noWake: true, noRout: true, measuredMelee: true, killRate: 0.01, maxDrift: 2, corpses: MEM_TIGHT ? 10 : 20,
        A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: MEM_TIGHT ? 70 : 110, flagRate: 0.6 },
        B: { flag: NEGORO.flag, armor: NEGORO.armor, count: MEM_TIGHT ? 80 : 120, flagRate: 0.5, guns: true },
        host: MEM_TIGHT ? false : undefined,
        play: (k, q2, v) => rt.army.play(k, q2, v * 0.5), smoke: (x2, y, z2, sx, sz) => rt.army.smoke(x2, y, z2, sx, sz) });
    }

    // ---- 根来衆：門前の坊舎の鉄砲（はじめから撃ってくる） ----
    const R = { faction: 'saika', fixed: true, order: 'hold', fleeDir: dirL(0, 1) };
    F.bouGuns = [-1, 1].map((s) => enemyGroup(rt, { ...R, name: s < 0 ? '南の坊舎の鉄砲衆' : '北の坊舎の鉄砲衆', anchor: P(s * 12, -74), facing: Math.PI + ROT, width: 6, aggro: 10, seekRange: 70, dmgMult: 0.4, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }], NEGORO)));
    F.towerFoes = [];

    // ---- 竹束：先手と筒井の手の前に押し立てる ----
    for (const [x, z] of [[-3, -122], [3, -122], [-9, -124], [9, -124], [15, -128], [-15, -128]]) { const q = P(x, z); addTaba(rt, q.x, q.z, 0, { rot: Math.PI + ROT }); }
    F.TA = makeTabaAdvance(rt, {
      near: 60, speed: 1.6, maxPush: 90,
      items: [{ g: F.vanG, yose: P(-6, -96), until: () => (F.step ?? 0) >= 2 }, { g: F.tsutsuiG, yose: P(8, -94), until: () => (F.step ?? 0) >= 2 }],
      avoid: [this.spawn],
    });

    // ---- 戦の前の会話 ----
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '先手を率い、山門を破って根来寺の大塔まで攻め入る' : '山門を破り、境内の奥の大塔まで攻め入る', 'main');
    rt.say('羽柴秀吉', '十万で紀州へ入った。根来と雑賀の鉄砲を、根から絶て', 4);
    rt.after(4.3, () => rt.say('羽柴秀次', '千石堀で根来の者はほとんど死んだ。だが、寺にはまだ鉄砲が残っておる', 4.5));
    rt.after(9.1, () => rt.say('組頭', '一つの窓から三挺が撃ってきます。雑賀の鉄砲衆も寺へ逃げ込んだ由', 4));
    rt.after(13.4, () => rt.say('羽柴秀次', `${nm(rt)}、先手を率いよ。大塔は焼くな。殿下の仰せじゃ`, 4));
    rt.after(17.4, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    rt.setPhase('fight');
    sfx('taiko', 0.9);
    const ctx = { faction: 'saika', flag: NEGORO.flag, armor: NEGORO.armor, friends: F.friends, look: (list) => dress(list, NEGORO), dmg: 0.5, scale: 1.4, mass: 120 };
    depthStart(rt, ctx, [
      // ① 竹束を押して寄る（坊舎の鉄砲が撃ってくる）
      stepped(1, DP.move({ to: YOSE, r: 10, max: 110, label: '竹束の寄せ場', obj: '竹束を押して、門前の坊舎へ寄れ',
        say: [['組頭', '竹束を前へ！　押し立てて寄せよ！', 3]] })),
      // ② 坊舎に斬り込み、鉄砲衆を追い出す
      stepped(2, DP.fight({ at: MONZEN, max: 150, title: '坊舎へ斬り込め', sub: '窓の鉄砲衆を追い出す', obj: '坊舎に斬り込み、鉄砲衆を追い出せ',
        say: [['組頭', '今じゃ！　鉄砲は込め直す間に斬れ！', 3]],
        foes: () => [
          { name: '坊舎の行人方', from: P(-26, -60), list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }] },
          { name: '坊舎の行人方', from: P(26, -58), list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }] },
        ],
        later: [{ t: 30, say: ['足軽', '奥の坊舎からも出てきたぞ！', 3], foes: () => [{ name: '奥の坊舎の衆', from: P(0, -34), list: [{ type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }] }] },
          // 雑賀衆の鉄砲（必ず）：坊舎の屋根の陰から一斉に撃つ
          { t: 14, say: ['足軽', '雑賀の鉄砲衆じゃ！　坊舎の陰から撃ってくるぞ、伏せよ！', 3], foes: () => [{ name: '雑賀の鉄砲衆', from: P(-40, -46), list: [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }] }] }],
        reward: '門前の坊舎の鉄砲衆を追い出した',
        onEnd: (rt2) => { for (const g of rt2.flags.bouGuns) if (alive(g)) { g.noRout = false; g.morale = 0; } } })),
      // ③ 山門を開け、境内へ入る
      stepped(3, this.gateStep()),
      // ④ 大塔の前の行人方を崩し、大塔を守り抜く
      stepped(4, DP.hold({ at: TOWER_FRONT, r: 16, dur: 75, label: '大塔の前', obj: '大塔の前の行人方を崩し、大塔を守れ',
        title: '大塔を焼かせるな', sub: '行人方が火をかけに来る',
        say: [['羽柴秀次', '大塔に火をかけさせるな！　あれは残せと殿下の仰せじゃ', 4]],
        waves: () => [
          { t: 2, say: ['足軽', '奥から行人方じゃ！　松明を持っておる！', 3], foes: () => [this.towerWave('前山の行人方', P(-44, 112))] },
          { t: 22, foes: () => [this.towerWave('北山の行人方', P(36, 132))] },
          { t: 44, say: ['組頭', 'まだ来る！　大塔の裏へ回らせるな！', 3], foes: () => [this.towerWave('奥の谷の衆', P(0, 128))] },
        ],
        reward: '大塔を焼かせずに守った' })),
    ], () => this.win(rt));
  },

  // 大塔へ寄せる行人方：大塔の前へ駆け、近くに居る間は塔が焦げる（update で数える）
  towerWave(name, from) {
    return { name, from, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], dmg: 0.5, mass: 100, noRout: 20 };
  },

  // 山門：門の前の守りを崩し、門扉を打ち破る（自分が門の前に着けば味方が閂を外す）
  gateStep() {
    const self = this;
    return {
      kind: 'fight', max: 160,
      start(rt, C) {
        const F = rt.flags;
        C.at = P(0, -6); C.goal = C.at; C.groups = [];
        rt.banner('山門を開けよ', '門の前の守りを崩す');
        sfx('taiko', 0.8);
        rt.say('組頭', '山門の前に行人方が固めておる！　崩して門を破れ！', 3.5);
        const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '山門の守り', anchor: P(0, -8), facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 12, width: 10, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.5, noRout: true },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], NEGORO));
        rt.after(18, () => { g.noRout = false; });
        C.groups.push(g);
        KIT.backOf(rt, g, { flag: NEGORO.flag, armor: NEGORO.armor, kind: 'spear', w: 18, depth: 8, count: 80, seed: 15870 });
        rt.obj('dp', '根来寺の山門を守る行人方を崩し、門を開けて境内へ入る', 'main');
        rt.marker('dp', C.at, '山門', { h: 4 });
        for (const fg of F.friends()) { fg.order = 'attack'; fg.seekRange = 40; fg.anchor = { x: C.at.x, z: C.at.z - 4 }; }
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, p = rt.player.u.pos;
        const left = heads(C.groups);
        if (left < 4) for (const g of C.groups) if (alive(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
        const G3 = P(0, -3), near = Math.hypot(p.x - G3.x, p.z - G3.z) < 9;
        // 守りが崩れて自分が門の前に居る時、または長引いた時は、味方が門扉を破る
        if (F.gate.alive && ((left < 4 && near) || el > 110)) self.openGate(rt);
        if (!F.gate.alive && !C.opened) { C.opened = true; rt.marker('dp', P(0, 12), '境内', { h: 3 }); }
        C.goal = C.opened ? P(0, 12) : left ? (C.groups.find(alive)?.center() || C.at) : C.at;
        rt.objProgress('dp', C.opened ? '' : left ? `残り${left}人` : '');
        return C.opened && toL(p.x, p.z).z > 6;
      },
      end(rt, C) {
        for (const g of C.groups) if (alive(g)) { g.noRout = false; g.morale = 0; }
        rt.unmark('dp');
        rt.objDone('dp');
        rt.award((t) => t.side.push('山門を破り、境内へ入った'), '山門を破った');
        const F = rt.flags;
        for (const fg of F.friends()) { fg.order = 'attack'; fg.anchor = P(0, 96); }
      },
    };
  },

  openGate(rt) {
    const F = rt.flags, s = F.gate;
    // 味方が打ち破った時（onStructDestroyed）も、ここで一度だけ火と知らせを出す
    if (F.gateOpened) return;
    F.gateOpened = true;
    if (s.alive) {
      s.hitFrom = P(0, -4); s.alive = false; s.hp = 0;
      rt.army.structFall(s);
    }
    sfx('taiko', 1);
    rt.banner('山門が開いた', '境内へ攻め入る');
    rt.say('足軽', '門が破れたぞ！　境内へ！', 2.5);
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

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    depthTick(rt, dt);
    if (F.ending) return;
    // 大塔：近くに寄った根来衆の数だけ焦げる。焼け落ちたら負け
    if (F.step >= 4) {
      F.towerScanT = (F.towerScanT || 0) - dt;
      if (F.towerScanT <= 0) {
        F.towerScanT = 0.5;
        let k = 0;
        // 前の乱戦の補い（frontline_density の敵の小勢）は松明を持たない。数えるのは火をかけに来た根来衆だけ
        for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && u.group?.name !== '敵の小勢' && Math.hypot(u.pos.x - DAITO.x, u.pos.z - DAITO.z) < 13) k++;
        if (k) {
          F.towerHp = Math.max(0, F.towerHp - k * 0.2);
          if (!F.towerWarn && F.towerHp < 60) { F.towerWarn = true; rt.say('羽柴秀次', '大塔の縁に火がついた！　行人方を寄せつけるな！', 3); }
          if (F.towerHp < 40 && !F.towerFire && rt.world.addFire) F.towerFire = rt.world.addFire(DAITO.x - 4, DAITO.z + 10, { size: 1.6, h: 1.2 });
        }
        rt.objProgress('main', `大塔の守り ${Math.round(F.towerHp)}／100`);
        if (F.towerHp <= 0) { this.lose(rt, '大塔が焼け落ちた'); return; }
      }
    }
    // 時間：六分を過ぎても大塔へ届かなければ、行人方が大塔に火をかける
    if (rt.t > 420 && rt.canFailMission()) this.lose(rt, '刻を失い、大塔に火をかけられた');
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
t04_negoro.history = '天正十三年（1585）三月、小牧・長久手の和睦を終えた羽柴秀吉は、およそ十万の兵で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻めるためである。三月二十一日、和泉の千石堀城では根来衆の主力が激しく戦ったが、火が煙硝蔵に入って城は落ちた。二十三日、秀吉勢は根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は焼け残り、大塔には今も弾の跡が残ると伝わる。史実では根来寺そのものでの抵抗は少なかった。遊びでは寺に残った鉄砲衆の抵抗を厚くし、竹束での寄せ・坊舎の斬り込み・山門・大塔の守りを一続きの段にまとめた。地形は国土地理院の実測（北山・前山・大門の口）を縮めて写し、堂の並びは今の大門・大伝法堂・大塔・大師堂の位置に合わせた。子院は斜面を削って石垣で平場を作る（発掘による）。寸法と子院の数、秀次・筒井定次の持ち場は推定。';

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
