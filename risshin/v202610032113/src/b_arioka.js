// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。内応で開いた木戸から入り、侍町へ進み、奪った口を守る。
// 向き：北は -z、東は +x。主郭は中央〜東寄り。南（+z）に織田の陣。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara, dobei, ishigaki, tenshu, yaguramon, sumiyagura, kagaribi, tamon, tobira, makeKitBatch, finalizeKitBatch, dorui, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_GATE_BREAK } from './battle_events.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, dress, gone, burnHouse, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, fight, hold } from './b_depth.js';
import { makeKakoi, kakoiEvent, kakoiGaugeText } from './kakoi.js';
import { demBlend } from './dem.js';
import { horiboriHeight, mizubori, dobashi } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, patchGunCover } from './taketaba.js';
import { makeFirstIn, makeSiegeZones, zoneWord, ZONE_STATE } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { makeNawabari } from './nawabari.js';
import {
  WALL_Z, GATE, SOTO_MOAT, SOTO_MOAT_SEGS, SOTO_BRIDGE,
  ROU, CAMP, HON_ISHIGAKI_SEGS, HON_MOAT, HON_MOAT_SEGS, TENSHU_POS,
  HON_W, HON_E, HON_N, HON_Z, HON_X, HON_CENTER_Z, HON_GAP, HON_ENTRY_X,
  SOKAKU_X, SOKAKU_N, KISHI_TORIDE, JORO_TORIDE, HON_W_MOAT, HON_W_MOAT_SEGS,
  ARIOKA_PLAN, MACHIYA_Z,
} from './castles/arioka.js';
// 三砦の位置には推定が残る。操作する木戸を鵯塚の内応口と断定しない。
const ARIOKA_BATTLE_PLAN = { ...ARIOKA_PLAN,
  kuruwa: ARIOKA_PLAN.kuruwa.map((k) => k.id === 'hiyodori' ? { ...k, name: '町口の木戸' } : k),
  koguchi: ARIOKA_PLAN.koguchi.map((g) => g.id === 'gate' ? { ...g, name: '町口の木戸' } : g),
};
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

import { jinkeiBuild } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記の十月の攻め。村重は尼崎へ移っており、有岡の本陣には置かない。
// 三砦の守将の配りは確定しない。荒木の旗・紋は丸の代用（既存の表示）。
const ARIOKA_ATTACK = sonaePlan('惣構えの囲み', 0, { x: CAMP.x, z: CAMP.z + 4 }, Math.PI, [
  ['honjin', '本陣', '織田信忠', 20000, CAMP.x, CAMP.z + 4, Math.PI, 'oda', 'oda'],
  ['taki', '南の仕寄り', '滝川一益', 10000, -60, 70, Math.PI, 'takigawa', 'takigawa', 180, 30, 12],
  ['niwa', '西の付城の控え', '丹羽長秀', 10000, -90, -58, Math.PI / 2, 'sujikai', 'sujikai', 150, 18, 12],
  ['north', '北の付城の控え', '名は伝わらない', 10000, -24, SOKAKU_N - 24, 0, 'oda', 'oda', 150, 24, 10],
]);
const ARIOKA_DEFEND = sonaePlan('三砦と主郭の守り', 1, { x: HON_X + 5, z: HON_CENTER_Z + 6 }, 0, [
  ['honjin', '本陣', '荒木久左衛門', 1800, HON_X + 5, HON_CENTER_Z + 6, 0, 'maru', 'maru'],
  ['kishi', '岸の砦', '名は伝わらない', 1000, 20, SOKAKU_N + 26, 0, 'maru', 'maru', 180, 26, 12],
  ['joro', '上ろう塚砦', '名は伝わらない', 800, JORO_TORIDE.x + 12, JORO_TORIDE.z, -Math.PI / 2, 'maru', 'maru', 70, 8, 10],
  ['hiyodori', '鵯塚砦', '名は伝わらない', 800, 28, WALL_Z - 10, 0, 'maru', 'maru', 70, 14, 6],
  ['town', '侍町の控え', '荒木久左衛門の配下', 600, -26, -76, 0, 'maru', 'maru', 50, 8, 6],
]);

const ODA = { flag: 'oda' };
const ARAKI = { flag: 'maru' };            // 荒木の紋（無いので丸で代える）

// 水堀（惣構えの木戸の外・本丸の石垣の手前）の窪み。地形の焼きだけに使う純な関数（castles/arioka.js の縄張り）
const MOAT_FNS = [
  ...SOTO_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: SOTO_MOAT.depth, width: SOTO_MOAT.width })),
  ...HON_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: HON_MOAT.depth, width: HON_MOAT.width })),
  ...HON_W_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: HON_W_MOAT.depth, width: HON_W_MOAT.width })),
];
// 国土地理院の標高（asset_dem_arioka.js）：伊丹段丘の東の縁の段差を、手書きの高さに薄く混ぜる
let ariDem = null;
import('./asset_dem_arioka.js').then((m) => { ariDem = m.default; }).catch(() => {});
const clamp = (v) => Math.max(0, Math.min(1, v));
function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  if (ariDem) h = demBlend(ariDem, x, z, h, { scale: 0.18, floor: h - 1.2 });
  // 惣構えの土塁（木戸の下）
  h += 2.2 * Math.exp(-((z - WALL_Z) ** 2) / 10) * (Math.abs(x) > 5 ? 1 : 0.2);
  // 東の段丘の縁。その外は猪名川の低地。
  h -= 4 / (1 + Math.exp(-(x - SOKAKU_X - 3) / 2));
  // 主郭だけを盛る。南面の道の口は20mの緩い坂で、堀と石垣を避けて牢へ登れる。
  const eastWest = clamp((x - HON_W + 3) / 3) * clamp((HON_E + 3 - x) / 3);
  const north = clamp((z - HON_N + 3) / 3);
  const mouth = clamp(Math.min(x - HON_GAP[0], HON_GAP[1] - x) / 2);
  const south = clamp((HON_Z + 3 - z) / 3);
  const ramp = clamp((HON_Z + 14 - z) / 20);
  h += 5 * eastWest * north * (south * (1 - mouth) + ramp * mouth);
  // 六甲の山並み（遠く）
  h += 40 * gauss(x, z, -200, -240, 16000);
  // 水堀（惣構えの木戸の外・本丸の石垣の手前）
  for (const f of MOAT_FNS) h += f(x, z);
  return h;
}

// 火は町屋から隣の町屋・侍屋敷へ燃え移る（近い家ほど早い。風に乗って広がる）。焼け出された町の者は逃げ惑う
function burnSpread(rt, h) {
  if (h.burnt) return;
  burnHouse(rt, h);
  const F = rt.flags;
  for (const o of F.noFire ? [] : (F.houses || [])) {
    if (o.burnt || o === h) continue;
    const d = Math.hypot(o.x - h.x, o.z - h.z);
    if (d < 16) rt.after(6 + d * 0.8 + Math.random() * 5, () => { if (!F.ending) burnSpread(rt, o); });
  }
  // 焼け出された住民（戦わない。逃げ惑う。誰にも狙われない）
  if (!h.civDone && F.civs && F.civs.length < 6) {
    h.civDone = true;
    const c = enemyGroup(rt, { faction: 'imagawa', name: '焼け出された町の者', anchor: { x: h.x + 2, z: h.z + 3 }, facing: 0, width: 4, aggro: 0, morale: 0, fleeDir: { x: Math.random() < 0.5 ? -1 : 1, z: 0.4 }, speed: 2.4 },
      [{ type: 'porter', n: 3, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    c.routed = true; c.order = 'flee'; c.civ = true;
    for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
    F.civs.push(c);
  }
}

const arioka = {
  jinkei: [ARIOKA_ATTACK, ARIOKA_DEFEND],
  botOrders: true, // 木戸と城下は、この戦の下知に従う。
  noWake: true, // 城下の段で出す兵だけが戦う。遠景と自動増援は重ねない。
  spawn: { x: 6, z: 70, heading: Math.PI },
  world: {
    seed: 15791,
    time: 'night',
    autumn: true,
    wind: [0.4, 1],
    muddy: 0.35,
    paths: [[[0, 150], [0, WALL_Z], [0, -30], [20, -70], [HON_ENTRY_X, HON_Z + 14], [HON_ENTRY_X, HON_Z - 6], [ROU.x, ROU.z + 6]]],
    height,
    // 東の低地に猪名川。南へ下り、尼崎へ向かう（遠景）。
    streams: [{ pts: [[148, -260], [153, -60], [146, 60], [151, 180]], w: 11, depth: 1.3 }],
    clear: (x, z) => Math.abs(x) < SOKAKU_X + 5 && z > SOKAKU_N - 15 && z < 130,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) < SOKAKU_X + 10 && z > SOKAKU_N - 20 && z < 140 ? 0.05 : 0.6),
    groves: [{ x: 50, z: -20, r: 10, n: 10 }, { x: -60, z: 40, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && (z < SOKAKU_N + 5 || Math.abs(x) > SOKAKU_X + 20),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.civs = [];
    // 長い包囲（kakoi.js）：荒木村重は一年近く籠もり、兵糧と士気は細っている。夜討ちの結果で動く
    F.kakoi = makeKakoi({ day: 300, foodDays: 25, morale: 55 });
    flReset();   // 床の層（石垣の上・水堀の土橋）を、この戦の分で作り直す
    // ---- 惣構えの柵（真ん中に木戸。内応で開く） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // 塀（百枚近く）と城の建物は材質ごとに一つの形へまとめて描く（一枚ずつだと描く回数が五百を越え、携帯で重かった）
    const KB = makeKitBatch();
    noT(wallLine(rt, [[-SOKAKU_X, WALL_Z], [-3.5, WALL_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[3.5, WALL_Z], [SOKAKU_X, WALL_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1, batch: KB } }));
    F.gate = rt.army.addStruct({ seg: [-3.5, WALL_Z, 3.5, WALL_Z], nx: 0, nz: 1, hp: 1e9, maxHp: 1e9, team: 1, name: '砦の木戸' });
    F.gate.noTarget = true;
    const dm = tobira(W, GATE.x, GATE.z, 7.0, 0);   // 閉じた扉（破られると根元から倒れる）
    F.door = dm;
    // 木戸の上に渡櫓（櫓門）。両脇の隅に二重の櫓（A4）
    rt.scene.add(dm); yaguramon(W, GATE.x, GATE.z, 7.4, 0, { doors: false, batch: KB }); sumiyagura(W, -30, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB }); sumiyagura(W, 34, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB });
    // 惣構えの水堀（木戸の正面だけ切って、土橋で渡す。docs/castle-design.md 1-4・5-2）
    for (const pts of SOTO_MOAT_SEGS) mizubori(rt, pts, { depth: SOTO_MOAT.depth, width: SOTO_MOAT.width });
    dobashi(rt, SOTO_BRIDGE.a, SOTO_BRIDGE.b, SOTO_BRIDGE.w, { name: '惣構えの土橋' });
    for (const [x, z] of [[-7, WALL_Z + 3], [7, WALL_Z + 3]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 惣構え全体の囲い（東西約800m・南北約1,700mを縮尺。四方を閉じ、開くのは南の木戸だけ） ----
    // 南の塀は東西の土塁につなぎ、木戸以外に隙間を残さない。
    noT(wallLine(rt, [[-SOKAKU_X, WALL_Z], [-SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（西）', segLen: 8, mesh: dobei, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[SOKAKU_X, WALL_Z], [SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（東）', segLen: 8, mesh: dobei, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[-SOKAKU_X, SOKAKU_N], [SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（岸の砦）', segLen: 8, mesh: dobei, meshOpt: { hikae: 1, batch: KB } }));
    // 惣構えの土塁：塀の外へ盛った土の斜面（見た目だけ。一つの形にまとめる。木戸の前は空ける）と、四隅の隅櫓、町の木戸（大通りの町境）
    {
      const db = makeSimpleBatch();
      for (const [seg, nx, nz] of [[[-SOKAKU_X, WALL_Z, -6, WALL_Z], 0, 1], [[6, WALL_Z, SOKAKU_X, WALL_Z], 0, 1], [[-SOKAKU_X, WALL_Z, -SOKAKU_X, SOKAKU_N], -1, 0], [[SOKAKU_X, WALL_Z, SOKAKU_X, SOKAKU_N], 1, 0], [[-SOKAKU_X, SOKAKU_N, SOKAKU_X, SOKAKU_N], 0, -1]]) {
        const d = dorui(W, seg, nx, nz, { batch: db, w: 3, h: 0.9 });
        if (!d.isBatchedPart) rt.scene.add(d);
      }
      finalizeSimpleBatch(rt, db);
      for (const [x, z] of [[-SOKAKU_X + 4, WALL_Z - 4], [SOKAKU_X - 4, WALL_Z - 4], [-SOKAKU_X + 4, SOKAKU_N + 4], [SOKAKU_X - 4, SOKAKU_N + 4]]) sumiyagura(W, x, z, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB });
      rt.scene.add(kabukimon(W, 0, MACHIYA_Z[1], 7, 0, { doors: false }));   // 町屋と侍町の境の木戸（開いたまま。通れる）
    }
    // 三砦（北＝岸の砦・西＝上ろう塚砦・南＝鵯塚砦＝惣構えの木戸と同じ）。物見の櫓と旗で目印を置く（HIST_B）
    rt.scene.add(yagura(W, KISHI_TORIDE.x, KISHI_TORIDE.z + 5), nobori(W, KISHI_TORIDE.x + 4, KISHI_TORIDE.z + 3, 'maru', 6));
    rt.scene.add(yagura(W, JORO_TORIDE.x + 5, JORO_TORIDE.z), nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 2, 'maru', 6));
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    // 南寄り（木戸に近い）が町屋、北寄り（本丸に近い）が侍町。道は細く、家は密集させる（GAME_C）
    // 城下に松明（敵の居所が見える。天守の窓の外にも城下の灯が見える。B079・B080）
    for (const [x, z] of [[-14, -12], [14, -14], [-30, -44], [30, -46], [0, -58], [ROU.x - 5, ROU.z + 4], [HON_E - 3, HON_Z - 3], [TENSHU_POS.x, TENSHU_POS.z + 4]]) W.addFire(x, z, { torch: true, h: 1.6 });
    F.houses = [
      [-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2],
      [-48, -16, 0.15], [36, -20, -0.1], [-18, -40, 0.1], [50, -50, 0.2], [-44, -62, -0.15],
    ].map(([x, z, r], i) => {
      const m = hut(W, x, z, 7, 5, r, { wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      rt.scene.add(m);
      return { x, z, m };
    });
    rt.scene.add(hut(W, HON_W + 7, HON_N + 6, 8, 5, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }), yagura(W, HON_E - 3, HON_Z - 4));
    // 本丸：台地の縁に打込接の石垣（牢へ上る道は空ける）と、石垣の上に三重の天守（形は今までの補いを保つ）
    for (const [a, b] of HON_ISHIGAKI_SEGS) ishigaki(W, [a, b], { kind: 'uchikomi', top: 0.1, minH: 2.6, batch: KB });
    // 本丸の水堀（石垣の手前・町側。道の口＝HON_GAP はそのまま地続きで、水に入らず上がれる）
    for (const pts of HON_MOAT_SEGS) mizubori(rt, pts, { depth: HON_MOAT.depth, width: HON_MOAT.width });
    // 本丸の西の堀（ほかの三面と同じ幅・深さ）
    for (const pts of HON_W_MOAT_SEGS) mizubori(rt, pts, { depth: HON_W_MOAT.depth, width: HON_W_MOAT.width });
    tenshu(W, TENSHU_POS.x, TENSHU_POS.z, { floors: 3, b: 10, old: true, stone: 'uchikomi', batch: KB });
    tamon(W, [HON_W + 2, HON_N + 1, HON_E - 2, HON_N + 1], { out: -1, batch: KB });   // 本丸の北の縁を囲う多聞櫓
    finalizeKitBatch(rt, KB);   // 塀・櫓門・隅櫓・石垣・天守・多聞をまとめて描く
    // 岸の砦の控えは備えの表から、牢への道を空けて置く。
    // 本丸の石垣の上に並んで、城下を見下ろして構える鉄砲・弓の者と旗（軽い作り。牢へ上る道の口は空ける）
    {
      const crew = [];
      for (let x = HON_W + 1, k = 0; x <= HON_E - 1; x += 3.4, k++) {
        if (x > HON_GAP[0] - 1 && x < HON_GAP[1] + 1) continue;
        crew.push({ x: x + ((k * 37) % 10) / 10 - 0.5, z: HON_Z - 2.2 - ((k * 53) % 7) / 10, k: ['gun', 'gun', 'bow', 'spear'][k % 4], facing: ((k * 29) % 9 - 4) * 0.06 });
        if (k % 5 === 2) crew.push({ x: x + 1.2, z: HON_Z - 4.5, k: 'banner', facing: 0 });
      }
      W.addDistantArmy({ people: crew, armor: 0x2e2a26, team: 1, flagTex: flagTexture('maru'), seed: 15794 });
    }
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { h: 1.8, wall: 0x3a3228 });
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [HON_W + 2, HON_CENTER_Z], [HON_E - 2, HON_CENTER_Z]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // ---- 滝川一益の手（自分の持ち場）と先手の一組 ----
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: 0, z: 62 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '池田知正', invuln: true } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { name: '滝川の先手', anchor: { x: -16, z: 66 }, facing: Math.PI, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川の組頭', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { flag: 'oda' }));
    F.kuriU = F.kuri.units[0];
    F.oda = [F.taki, F.kuri];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 72 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：合図を待つ間に、滝川の手が竹束を押し立て、ゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, { items: [{ g: F.taki, yose: { x: 0, z: WALL_Z + 14 }, until: () => F.step >= 1 }], avoid: [this.spawn, { x: 10, z: 72 }] });
    rt.after(3, () => { if (F.step === 0) { F.taki.order = 'move'; F.taki.dest = { x: 0, z: WALL_Z + 14 }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: WALL_Z + 14 }; }; } });
    // ---- 一番乗り（siege_zones.js）：木戸が開いても、自分が踏み込むまで味方は木戸の外で待つ ----
    F.FI = makeFirstIn(rt, { from: this.spawn, gates: [{ gate: F.gate, name: '砦の木戸' }] });
    // 縄張り（castle_plan.js）：壁は今まで通り手組み（skipWalls）。惣構えの内を町屋・侍町・主郭の場に分け、
    // siege_zones.js の区域で、取った所から次が開く流れとして持つ（HUD・任務の進み具合に使う）
    F.C = buildCastlePlan(rt, ARIOKA_BATTLE_PLAN, { ladders: true, baseHeight: height, edgeW: 3, skipWalls: ['hiyodori', 'kishi', 'joro', 'machiya', 'samuraimachi', 'honmaru'] });
    // 三つの砦（岸・上ろう塚・鵯塚）も区域に。町口＝①で実際に戦う木戸の口（位置は復元）。
    // 岸は別働の織田勢の攻め、上ろう塚は内応で移る遠景の砦。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hiyodori', name: '町口の木戸', test: F.C.kuruwa.hiyodori.test, pos: F.C.kuruwa.hiyodori.centroid, need: 4, hold: 8 },
        { id: 'kishi', name: '岸の砦', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 999, hold: 999 },
        { id: 'joro', name: '上ろう塚砦', test: F.C.kuruwa.joro.test, pos: F.C.kuruwa.joro.centroid, need: 999, hold: 999 },
        { id: 'machiya', name: '町屋', test: F.C.kuruwa.machiya.test, pos: F.C.kuruwa.machiya.centroid, need: 6, hold: 10 },
        { id: 'samuraimachi', name: '侍町', test: F.C.kuruwa.samuraimachi.test, pos: F.C.kuruwa.samuraimachi.centroid, need: 6, hold: 10 },
        { id: 'honmaru', name: '主郭', test: F.C.kuruwa.honmaru.test, pos: F.C.kuruwa.honmaru.centroid, need: 6, hold: 12 },
      ],
      links: [['hiyodori', 'machiya'], ['kishi', 'machiya'], ['joro', 'machiya'], ['machiya', 'samuraimachi'], ['samuraimachi', 'honmaru']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・堀・道の数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, F.C, { SZ: F.SZ, team: 1, friendTeam: 0 });
    rt.nawabari = F.K;
    rt.marker('kishi', KISHI_TORIDE, () => `岸の砦・${zoneWord(F.SZ.byId.kishi)}`, { h: 5 });
    rt.marker('joro', JORO_TORIDE, () => `上ろう塚砦・${zoneWord(F.SZ.byId.joro)}`, { h: 5 });
    // 岸の砦は別働の織田勢の攻めとして進める。上ろう塚は木戸が開く時の内応で移る。
    // 実際の間隔は分からないため、秒数は進行用。
    rt.after(70, () => kishiTorideFall(rt));

    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    for (const [x, z, k] of [[-14, CAMP.z - 10, 'oda'], [20, CAMP.z - 10, 'eiraku'], [-30, 80, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（城攻めの総大将 織田信忠）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 0, z: 62 } });
    F.ehon = camp(rt, { x: HON_X + 5, z: HON_CENTER_Z + 6, facing: 0, team: 1, faction: 'saito', mon: 'maru', armor: 0x2e2a26, general: { name: '荒木久左衛門', hat: 'kabuto_m', haori: 0x3a2e2a }, guard: 15, reserve: 100, runTo: { x: 0, z: -40 } });
    F.jinHosts = buildSonae(rt, this.jinkei);
    // 惣構えの前に詰める織田の仕寄せの列と、その篝火（見た目だけ。起こさない）：夜の土塁を前に、味方の厚みと行く先の明かり
    for (const [x, z, s, k] of [[-24, WALL_Z + 22, 15790, 'oda'], [26, WALL_Z + 23, 15791, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 100, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const x of [-26, -12, 14, 28]) { const z = WALL_Z + 12; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    for (const [x, z] of [[-30, 60], [30, 64], [0, 86]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    // 城下の町屋と塀の陰は月明かりだけではほぼ黒になる（見回り 10/2）。月と空の明かりを少し強めた夜に
    applyLook(rt, { ...NIGHT, hI: NIGHT.hI * 1.55, sunI: NIGHT.sunI * 1.4, hg: 0x3a3a3c }); W.lookDark = true;
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、滝川一益の合図を待て' : '滝川一益のもとで、合図を待て', 'main');
    rt.say('滝川一益', `${nm(rt)}、上ろう塚に内応が出る。町口から続き、惣構えの内へ入るぞ`, 5);
    rt.say('滝川の組頭', '木戸から入ったら、町の辻を押さえる。本丸へは勝手に進むな', 4.5);
    rt.marker('taki', unitPos(F.takiU), '滝川一益', {});
    rt.after(15, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    torideFall(rt, 'joro', '上ろう塚砦', '上ろう塚の内応で、滝川の先手が入った');
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.userData.open();
    sfx('wood', 0.9); rt.after(1, () => sfx('horagai', 1));
    rt.banner('上ろう塚に内応', '滝川の先手が入った。町口から城下へ続け');
    battleEvent(rt, EVENT_GATE_BREAK, GATE, F.taki, 0, true, '上ろう塚の内応で先手が町へ入った');
    rt.obj('main', HI(rt) ? '手の者を率いて木戸から攻め入り、砦の兵を退けよ' : '開いた木戸から攻め入り、砦の兵を退けよ', 'main');
    rt.say('滝川一益', 'かかれ！　声を上げよ、城じゅうに内応が出たと思わせよ！', 3.5);
    F.taki.order = 'attack'; F.taki.seekRange = 60;
    kakoiEvent.campRaided(F.kakoi, 0); kakoiEvent.nightRaidWon(F.kakoi, 8);   // 内応の夜討ち：守りの士気が落ちる
    // 長い斬り合いに、滝川の後詰が加わる（救いの手。B086）
    rt.after(110, () => {
      if (F.ending) return;
      const aid = allyGroup(rt, { name: '滝川の後詰', anchor: { x: 0, z: WALL_Z + 24 }, facing: Math.PI, order: 'attack', seekRange: 70, width: 10, aggro: 12, noRout: true },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ODA));
      void aid; sfx('horagai', 0.7);
      rt.say('滝川一益', '後詰を出す！　疲れた者は下がって息を継げ！', 3.5);
    });
    // 村重はこの夜より前に尼崎へ移っている。今夜の脱出としては描かない。
    rt.after(50, () => { if (!F.ending) rt.say('滝川の組頭', '村重はすでに尼崎へ移った。本丸にはまだ守りがいるぞ', 4); });
    F.kuri.order = 'move'; F.kuri.dest = { x: -6, z: WALL_Z - 10 }; F.kuri.onArrive = (g) => { g.order = 'hold'; };
    F.g1 = enemyGroup(rt, { faction: 'saito', name: '砦の荒木勢', anchor: { x: 6, z: WALL_Z - 16 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 14, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'gun', n: 2 }], ARAKI));
    for (const u of F.g1.units) if (u.type === 'gun') u.dmg *= 0.45;
    // 塀の狭間に付く守り（A4）：木戸の左右の塀の内から、鉄砲と弓で寄せ手を撃つ（任務の数には入れない）
    F.wallG = [-26, 26].map((x) => enemyGroup(rt, { faction: 'saito', name: '塀の守り', anchor: { x, z: WALL_Z - 2.5 }, facing: 0, order: 'hold', aggro: 30, width: 10, morale: 70, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'gun', n: 3 }, { type: 'bow', n: 3 }], ARAKI)));
    for (const g of F.wallG) for (const u of g.units) u.dmg *= 0.4;   // 町屋の鉄砲で倒れて終わる事が多かった（見回り 10/2）
    rt.marker('g1', centerOf(F.g1), () => `砦の荒木勢・${moraleWord(F.g1.morale)}`, { red: true, group: F.g1 });
    // 侍町への火は、城下へ進む段の下知で付ける。
  },

  // 段を重ねる：城下の辻へ攻め入り、奪った木戸で反撃を受ける。
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which] || F.ending) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    rt.obj('main', which === 'A' ? '城下の辻の敵を崩し、惣構えの内へ進め' : '奪った木戸の口を固めよ', 'main');
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('dp');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '惣構えに入り、木戸を確保した', pts: 20 }; }, '任務達成・惣構えの木戸を確保した');
    sfx('horagai', 0.6);
    rt.banner('有岡城の惣構え、破れる', '本丸はなお持ちこたえる。奪った木戸を固めよ');
    rt.say('滝川一益', `${nm(rt)}、木戸を守れ。本丸の囲みはまだ続くぞ`, 4);
    rt.after(5, () => rt.say('', '――村重の妻子や家臣の家族の多くは、のちに信長の命で殺された。惨い話として今に伝わる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  lose(rt, reason) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('惣構えの攻めを果たせず', reason);
    rt.say('滝川一益', `${reason}。組をそろえ、木戸の外へ退け`, 5);
    rt.player.u.invuln = true; rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    if (F.K) F.K.tick(dt);
    if (F.ending) return;
    if (F.dpOn) { depthTick(rt, dt); return; }
    if (F.TA) F.TA.tick(dt);
    if (F.FI) F.FI.tick();
    if (F.SZ) F.SZ.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `包囲 ${F.kakoi.day}日・${kakoiGaugeText(F.kakoi, '兵糧')}・荒木勢 ${F.g1.count}人`);
      if (F.g1.count < 5 && !gone(F.g1)) F.g1.morale = Math.min(F.g1.morale, 20);
      if (gone(F.g1) || rt.t - F.stepT > 120) {
        rt.unmark('g1');
        if (!gone(F.g1)) F.g1.morale = 0;
        for (const g of F.wallG) if (!gone(g)) g.morale = 0;
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        rt.objDone('main');
        this.deep(rt, 'A', () => this.deep(rt, 'C', () => this.win(rt)));
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 9;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が退いた！`, 2.5);
  },
};

// 岸・上ろう塚砦：別働の織田勢が惣構えの外から攻め落とす遠景の出来事（kaito 10/1「三砦も攻め落とせる区域に」）
function torideFall(rt, id, name, message) {
  const F = rt.flags;
  if (F.ending || !F.SZ) return;
  const z = F.SZ.byId[id];
  if (!z || z.owner === ZONE_STATE.FRIEND) return;
  z.owner = ZONE_STATE.FRIEND; z.fallen = true;
  rt.bark(message || `${name}が落ちた（別働の織田勢）`);
  for (const g of rt.army.groups) if (g.team === 1) g.morale = Math.max(5, g.morale - 6);
}
function kishiTorideFall(rt) { torideFall(rt, 'kishi', '岸の砦'); }

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 城攻めの夜：荒木勢は惣構えの内の辻ごとに固まり、本丸から次々に新手を出す。一つの波は数百の城兵が後ろに付く
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 80, kind: 'gun', dmg: 0.35, ...o });
function ariCtx(rt) {
  const F = rt.flags;
  return { routeFight: true, backing: false, faction: 'saito', flag: 'maru', armor: 0x2e2a26, dmg: 0.58, mass: 220, look: (l) => dress(l, ARAKI),
    friends: () => [F.taki, F.kuri].filter((g) => g && g.count && !g.routed), botSteer: wallSteer,
    aid: { name: '滝川の後詰の一組', faction: 'oda', flag: 'oda', list: [uS(1), uA(9)] }, aidSaid: '滝川の手から一組が加わった' };
}
// 塀と木戸脇の篝火を避ける。口へは塀に沿って回り、正面から通る。
function wallSteer(b, inp) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u, fz = Math.cos(p.yaw), fx = Math.sin(p.yaw);
  const az = u.pos.z + fz * 3, ax = u.pos.x + fx * 3;
  if (Math.abs(u.pos.x) < 2.5 && Math.abs(ax) < 2.5) return;
  if (u.pos.z > WALL_Z + 0.3 && (az < WALL_Z + 1.5 || Math.abs(u.pos.x) > 2.5 && u.pos.z < WALL_Z + 5 && az < WALL_Z + 6)) p.yaw = Math.atan2(-u.pos.x, Math.max(0, WALL_Z + 1.5 - u.pos.z));
  else if (u.pos.z < WALL_Z - 0.3 && (az > WALL_Z - 1.5 || Math.abs(u.pos.x) > 2.5 && u.pos.z > WALL_Z - 5 && az > WALL_Z - 6)) p.yaw = Math.atan2(-u.pos.x, Math.min(0, WALL_Z - 1.5 - u.pos.z));
}
// A 砦を取った後：滝川の下知で侍町へ進み、辻の敵を崩す。
function ariA() {
  const at = { x: -2, z: -14 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['滝川一益', '砦は取った。じゃが惣構えの内には、荒木の兵がまだ千はおる'], ['滝川の組頭', '辻の敵を崩せ。組を失う前に、後詰と槍をそろえよ']] }),
    rest({ dur: 3, say: [['滝川一益', '侍町に火をかけ、辻へ進め！']], fn: (rt, m) => { m.fire = true; rt.flags.houses.forEach((h, k) => rt.after(1 + k * 2.5, () => { if (!rt.flags.ending) burnSpread(rt, h); })); } }),
    fight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: (rt) => (HI(rt) ? '手の者を率いて、城下の辻の荒木勢を崩せ' : '城下の辻の荒木勢を崩せ'),
      say: [['滝川一益', '町屋の陰の鉄砲を先に潰せ。撃たせたまま辻へ出れば、狙い撃ちじゃ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: -10, z: -40 }, list: [uS(2), uA(12)], mass: 280, morale: m.fire ? 60 : 90 }, gunLine('町屋の陰の鉄砲', { x: 22, z: -30 }, 6, { morale: m.fire ? 50 : 85 })],
      later: [
        { t: 34, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来る！　横を突かれるぞ！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -SOKAKU_X + 10, z: -4 }, list: [uS(2), uA(11)], mass: 240, morale: m.fire ? 65 : 90 }] },
        { t: 70, say: ['滝川の組頭', '本丸から新手じゃ……！　木戸と辻を押さえろ！'], foes: (rt, m) => [{ name: '本丸から下りた新手', from: { x: 10, z: -66 }, list: [uS(3), uA(12)], mass: 300, morale: m.fire ? 70 : 95 }] },
      ],
      max: 150, reward: '城下の辻を押し通った',
      onEnd: (rt, m, won) => { if (!won) rt.say('滝川の組頭', '辻の敵を六割まで崩せず、道を開く手柄は逃した。後詰が辻を引き受ける。残る組をそろえ、奪った木戸を守れ！', 5); } }),
  ];
}
// C 城下へ入った後：木戸を奪い返しに来る荒木勢を、木戸の口で防ぐ
function ariC() {
  const at = { x: 0, z: WALL_Z + 8 };
  return [
    rest({ dur: 7, heal: 0.4, bark: '奪った木戸へ組を集め直せ', say: [ ['滝川一益', '……荒木の者が、木戸を奪い返しに来るぞ。ここで口を塞がれては、明日の攻めが立たぬ'], ['滝川一益', '木戸の外で槍をそろえよ。狭い口へ敵を詰まらせろ', 4.5]] }),
    hold({ at, dur: 88, r: 13, title: '木戸の口', sub: '荒木勢が木戸を奪い返しに押し寄せる', label: '砦の木戸', obj: (rt) => (HI(rt) ? '手の者を木戸の口に並べ、押し寄せる荒木勢を防げ' : '木戸の口で、押し寄せる荒木勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '来た！　町の中から、どっと押し寄せる！'], foes: () => [{ name: '木戸へ寄せる荒木勢', from: { x: 0, z: -10 }, list: [uS(3), uA(13)], mass: 360, noRout: 20 }] },
        { t: 30, say: ['滝川一益', '塀の狭間に鉄砲が並んだ！　口の脇の土塁に寄れ！'], foes: () => [gunLine('塀の内の鉄砲衆', { x: -18, z: WALL_Z - 4 }, 6, { mass: 0 })] },
        { t: 46, say: ['足軽', '東の土塁の端を越えて来る！'], foes: () => [{ name: '土塁を越える荒木勢', from: { x: 40, z: WALL_Z - 6 }, list: [uS(2), uA(10)], mass: 200 }] },
        { t: 64, title: '最後の寄せ', sub: '荒木久左衛門の手が、自ら木戸へ', say: ['足軽', '荒木の大将旗じゃ！　木戸を渡すな！'], foes: () => [{ name: '荒木久左衛門の手', from: { x: 12, z: -30 }, list: [uS(4), uA(12)], mass: 300 }] },
      ],
      reward: '木戸の口を守り抜いた', lost: ['滝川一益', '押し込まれたか……陣から後詰を出せ！'],
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, '木戸の持ち場を守れなかった'); } }),
  ];
}

// 両軍の総勢（有岡城を囲む織田勢 五万ほど、城に残った荒木勢 数千。数には諸説ある）
arioka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 30), a0: 50000, b: Math.max(0, 5000 - (F.ek || 0) * 40), b0: 5000 };
};
arioka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '荒木軍', mon: 'maru' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 渡辺勘大夫は岸の砦を退いた後に処刑されたと公記にある。この夜の討取り相手にはしない。
arioka.famous = [];
arioka.date = () => '天正七年十月十五日　冬・夜';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った黒田官兵衛（孝高。小寺家の家老で、羽柴秀吉のもとで働いていた）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重はわずかな供と城を抜けて尼崎城へ移った。十月十五日、城の中から織田方に内応する者が出て、滝川一益らが惣構えの内へ攻め入った。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は救い出されたが（救い出された日には諸説ある）、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋の絵はまだ無いので、ここでは丸の旗で代えている。この戦では十月の惣構えへの攻めと木戸の確保までを扱い、本丸の開城や官兵衛の救出を同じ夜に重ねない。内応は上ろう塚で起きたと公記は記す。操作する町口の木戸、三砦の位置と城下の道は推定で、鵯塚の内応とはしない。辻の反撃と各隊の細かな位置は復元で、日付や人数には諸説ある。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 素直な遊び手：木戸から入り、辻で戦い、奪った木戸を守る
arioka.botBrain = (b, inp, o) => { ariBot(b, inp, o); wallSteer(b, inp); };
function ariBot(b, inp, { goTo }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest && F.step < 3) { inp.guardHold = false; const c = F.taki.center(); goTo(p, inp, c.x, c.z + 4, 2); return; }
  // 塀越しに近い敵を狙って動かなくなる不具合の直し：塀が間にある敵は「見えていない」扱いにする
  // （木戸を開けた直後、まだ塀の外にいるのに塀の内の敵へ向き直って突き続け、一撃も当たらないまま突進しない事があった。kaito 9/30）
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step >= 1 ? true : o.pos.z > WALL_Z) && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  // 木戸（x -3.5〜3.5）を通らず、塀のある x で真っ直ぐ進んで立ち往生しないよう、WALL_Z-1 まで木戸口へ寄せてから進む（kaito 9/30）
  if (F.step === 1) { if (u.pos.z > WALL_Z - 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, WALL_Z + 4, 1); return; } const c = gone(F.g1) ? { x: 0, z: 0 } : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }

}

export { arioka };
