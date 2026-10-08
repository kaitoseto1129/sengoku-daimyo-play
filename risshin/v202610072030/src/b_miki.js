// 三木城・平田と大村の合戦（天正七年九月十日）。城外の兵糧搬入阻止。
// 城は南東、平田・大村は北西、平井山の本陣は北東。距離・局地の兵数は復元。
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
import { nobori, hut, yagura, tawara, dorui, umatsunagi, hyoro, village, kabukimon, makeSimpleBatch, finalizeSimpleBatch, palisade, solidCircle, SOLIDS } from './props.js';
import * as THREE from 'three';
import { goten, monomi, horiboriHeight } from './castle_parts.js';
import { MIKI_JO, MIKI_KURUWA, MIKI_ROAD, TSUKESHIRO_CHAIN, MIKI_BRANCHES, MIKI_HORI, MIKI_FORTS } from './castles/miki.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { weatherSees } from './weather_gameplay.js';
import { gauss, enemyGroup, allyGroup, nm, ringWall, wallLine } from './bhelp.js';
import { dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { camp } from './b_mid.js';
import { makeKakoi, advanceDay, campWear, kakoiEvent } from './kakoi.js';

const MIKI = { x: 70, z: 30 };
const HIRATA = { x: -80, z: -64, r: 14 };
const OMURA = { x: -64, z: -118, r: 22 };
const BATTLE_LIMIT = 390;
// 搬入を止める間の持ち場。遠景の城域まで一人で走り抜けさせない。
const CONVOY_BOUNDS = { minX: -155, maxX: 35, minZ: -160, maxZ: 10, pushBack: 2 };
const HONJIN = { x: 120, z: -184 };
const GATE = { x: HIRATA.x, z: HIRATA.z + HIRATA.r + 6 };
const CASTLE_ROAD = MIKI_ROAD.map(([x, z]) => [MIKI.x + x, MIKI.z + z]);
const LANE = [[-190, -82], [-130, -74], [-104, -44], [-30, -40], [10, -26], [50, -8], [70, 10]];
const SALLY_PATH = [[10, -26], [10, -40], [-30, -40], [GATE.x + 8, GATE.z]];
// 柵の外を北西から南の口へ回る足場。遮断線との間に歩ける幅を残す。
const HIRATA_PATH = [[-80, -84], [-94, -78], [-100, -64], [-94, -50], [-80, -44]];
// 開始位置から南の合流口へ。荷駄道から外れていた足元も同じ坂でつなぐ。
const ASSEMBLY_PATH = [[-40, -48], [-60, -44], [-82, -44], [-104, -48]];
const ASSEMBLY_TURNS = ASSEMBLY_PATH.map(([x, z]) => ({ x, z }));
const INNER_ROADS = MIKI_BRANCHES.map(pts => pts.map(([x, z]) => [x + MIKI.x, z + MIKI.z]));
const FORT_ROADS = MIKI_FORTS.map(q => [[q.x, q.z + 24], [q.x, q.z + 13], [q.x, q.z + 5], [q.x - 6, q.z + 5], [q.x - 6, q.z + 3]]);
const HONJIN_PATH = [[120, -184], [120, -160], [100, -142], [60, -120], [20, -110], [-28, -60]];
const HONJIN_ROOM = [[120, -176], [110, -176], [110, -185]];
// 井楼の梯子と蔵の前まで、主殿を避けて平場の内側を通す。
const SERVICE_ROADS = MIKI_KURUWA.flatMap(q => {
  const x = MIKI.x + q.dx, z = MIKI.z + q.dz, left = x - q.cw / 2 + 20;
  return [[[x + 7, z + q.cd / 2 - 20], [left, z + q.cd / 2 - 20], [left, z - q.cd / 2 + 25], [left - 5, z - q.cd / 2 + 17.9]],
    [[x + 7, z + q.cd / 2 - 20], [x + q.cw / 2 - 20, z + q.cd / 2 - 20], [x + q.cw / 2 - 20, z - q.cd / 2 + 25], [x + q.cw / 2 - 15, z - q.cd / 2 + 18]],
    [[left, z + q.cd / 2 - 20], [x - q.cw / 2 + 16, z + q.cd / 2 - 12]]];
});
const ROADS = [LANE, CASTLE_ROAD, SALLY_PATH, HIRATA_PATH, ASSEMBLY_PATH, ...INNER_ROADS, ...FORT_ROADS, HONJIN_PATH, HONJIN_ROOM, [[-80, -54], [-85, -58], [-85, -65]], ...SERVICE_ROADS];
const DITCHES = MIKI_HORI.map(pts => horiboriHeight(pts.map(([x, z]) => [x + MIKI.x, z + MIKI.z]), { depth: 2.4, width: 5 }));
const ODA = { flag: 'oda' }, BESSHO = { flag: 'maru' }, MORI = { flag: 'mori' };
// 原点を移したため、旧原点の標高素材を混ぜない。古図との照合は調査表に残す。
function height(x, z) { return heightBase(x, z); }
function castleBlend(x, z) {
  const q = MIKI_JO.sotogamae;
  const r = Math.hypot((x - MIKI.x - q.dx) / (q.w / 2), (z - MIKI.z - q.dz) / (q.d / 2));
  return Math.max(0, Math.min(1, (1.04 - r) / 0.04));
}
function rawTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 三木城の台地（南東）、平井山（北東の本陣）、大村坂の丘
  h += 16 * gauss(x, z, MIKI.x, MIKI.z, 5000) + 18 * gauss(x, z, HONJIN.x, HONJIN.z, 3000) + 10 * gauss(x, z, OMURA.x + 20, OMURA.z - 20, 1600);
  // 北・東・西は切岸、南へ続く台地は尾根道で登る。石垣や天守は置かない。
  const k = castleBlend(x, z);
  h += (22 - (z - MIKI.z) * 0.009 - h) * k;
  // 付城の小高い所
  h += 3 * Math.max(0, Math.min(1, (HIRATA.r + 4 - Math.hypot(x - HIRATA.x, z - HIRATA.z)) / 5));
  // 美嚢川の谷。旧河道と浅瀬の位置は未確定なので縮尺の復元。
  const rz = -32 + 9 * Math.exp(-((x - 90) ** 2) / 9000);
  h -= 5 * Math.exp(-((z - rz) ** 2) / 130);
  return h;
}
// 五曲輪の平場と急な土の法面。三木は平山城なので山城の盛り上げを加えない。
const FORT_LEVELS = MIKI_FORTS.map(q => rawTerrain(q.x, q.z) + 1.8);
const HONJIN_LEVEL = rawTerrain(HONJIN.x, HONJIN.z);
function terrainHeight(x, z) {
  let h = rawTerrain(x, z), best = 0, level = h;
  for (const q of MIKI_KURUWA) {
    const d = Math.max(Math.abs(x - MIKI.x - q.dx) - q.cw / 2, Math.abs(z - MIKI.z - q.dz) - q.cd / 2);
    const k = Math.max(0, Math.min(1, 1 - d / 3.5));
    if (k > best) { best = k; level = q.level; }
  }
  h += (level - h) * best;
  for (let i = 0; i < MIKI_FORTS.length; i++) {
    const q = MIKI_FORTS[i], d = Math.hypot(x - q.x, z - q.z);
    const k = Math.max(0, Math.min(1, (q.r + 4 - d) / 4));
    h += (FORT_LEVELS[i] - h) * k;
    // 付城の外の浅い空堀。南の土橋を残す（位置・断面は推定）。
    if (!(z > q.z && Math.abs(x - q.x) < 5)) h -= 1.6 * Math.max(0, 1 - Math.abs(d - q.r - 4) / 2.2);
  }
  // 恒久化した平井山本陣の平場と空堀。断面は推定、南の木戸と下知の道は土橋でつなぐ。
  const hx = x - HONJIN.x, hz = z - HONJIN.z, hr = Math.hypot(hx, hz);
  h += (HONJIN_LEVEL - h) * Math.max(0, Math.min(1, (22 - hr) / 4));
  if (!(hz > 0 && Math.abs(hx) < 7)) h -= 2 * Math.max(0, 1 - Math.abs(hr - 26) / 3);
  for (const dip of DITCHES) h += dip(x, z);
  return h;
}
// 道の端の高さは最初にだけ作る。毎コマ配列や物を作らず、道幅の中を緩い坂にする。
const ROAD_HEIGHTS = ROADS.map((pts) => pts.map(([x, z]) => terrainHeight(x, z)));
// 曲輪の南の踊り場を同じ床高にそろえる。短い門前だけで六メートル登る坂を作らない。
for (let i = 0; i < MIKI_KURUWA.length; i++) for (let j = 1; j < ROAD_HEIGHTS[5 + i].length; j++) ROAD_HEIGHTS[5 + i][j] = MIKI_KURUWA[i].level;
function roadBlend(x, z) { return roadHeight(x, z, 0, true); }
function roadHeight(x, z, base, weightOnly = false) {
  let best = 0, sum = 0, weight = 0;
  for (let j = 0; j < ROADS.length; j++) {
    const pts = ROADS[j];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      const half = j >= ROADS.length - SERVICE_ROADS.length || j >= 5 && j < 5 + INNER_ROADS.length + FORT_ROADS.length ? 3 : 7;
      const k = Math.max(0, Math.min(1, (half - d) / 1.5));
      best = Math.max(best, k);
      if (!weightOnly && d < half) {
        // 曲がり角・合流では近い道の高さを混ぜ、道幅内に段差を作らない。
        const w = (half - d) * (half - d);
        sum += (ROAD_HEIGHTS[j][i - 1] * (1 - t) + ROAD_HEIGHTS[j][i] * t) * w;
        weight += w;
      }
    }
  }
  return weightOnly ? best : weight > 0 ? base + (sum / weight - base) * best : base;
}
function heightBase(x, z) { return roadHeight(x, z, terrainHeight(x, z)); }

function lineDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
// 中点が道の外でも、柵の端は道へ突き出す。準備時に線全体と道幅を比べる。
function crossesRoad(seg) {
  const [ax, az, bx, bz] = seg, dx = bx - ax, dz = bz - az;
  for (const pts of ROADS) for (let i = 1; i < pts.length; i++) {
    const [cx, cz] = pts[i - 1], [ex, ez] = pts[i];
    const rx = ex - cx, rz = ez - cz, det = dx * rz - dz * rx;
    if (Math.abs(det) > 1e-8) {
      const t = ((cx - ax) * rz - (cz - az) * rx) / det;
      const s = ((cx - ax) * dz - (cz - az) * dx) / det;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return true;
    }
    // 道の幅に、土塁の半幅と徒歩・馬の体の幅を加える。
    if (Math.min(lineDistance(ax, az, cx, cz, ex, ez), lineDistance(bx, bz, cx, cz, ex, ez),
      lineDistance(cx, cz, ax, az, bx, bz), lineDistance(ex, ez, ax, az, bx, bz)) < 8.7) return true;
  }
  return false;
}

// 平田の柵は南だけが開く。射手の前の持ち場へも、柵を横切らず口へ回る。
function hirataWay(army, u, want) {
  const x = u.pos.x - HIRATA.x, z = u.pos.z - HIRATA.z;
  const gx = want.x - HIRATA.x, gz = want.z - HIRATA.z;
  const r = Math.hypot(x, z), gr = Math.hypot(gx, gz);
  // 柵の内側の一メートルを外と扱うと、外向きに柵へ押し付け続ける。
  const inside = r < HIRATA.r, goalInside = gr < HIRATA.r;
  if (inside && goalInside) return want;
  const dx = gx - x, dz = gz - z;
  const t = Math.max(0, Math.min(1, -(x * dx + z * dz) / (dx * dx + dz * dz || 1)));
  if (!inside && !goalInside && Math.hypot(x + dx * t, z + dz * t) > HIRATA.r + 2) return want;
  const q = u._hirataWay || (u._hirataWay = { x: 0, z: 0 });
  if (inside) {
    // 内側から斜めに口の外を目指すと柵を横切る。まず口の内側へ寄る。
    q.x = HIRATA.x;
    q.z = HIRATA.z + (Math.abs(x) > 1.2 || z < HIRATA.r - 4.2 ? HIRATA.r - 3 : HIRATA.r + 5);
    return q;
  }
  const a = Math.atan2(x, z);
  if (goalInside && Math.abs(a) < 0.18) return want;
  const goal = goalInside ? 0 : Math.atan2(gx, gz);
  const turn = ((goal - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  // まず柵から離す。短い弧の弦でも柵に触れない余白を取る。
  const next = r < HIRATA.r + 3 ? a : a + Math.max(-0.45, Math.min(0.45, turn));
  q.x = HIRATA.x + Math.sin(next) * (HIRATA.r + 5);
  q.z = HIRATA.z + Math.cos(next) * (HIRATA.r + 5);
  return q;
}

// 一戦の目安は両軍の備え表で統一。城内の者と搬入側の兵を分ける。
// 全体の総数・各備の内訳は史料で確定しない。撃破一人を数十人へ換算しない。
const JIN = [
  rosterPlan('羽柴の囲み', 0, HONJIN, Math.PI, [
    ['honjin', '本陣の備え', '羽柴秀吉の陣（留守役は不明）', 5000, HONJIN.x, HONJIN.z, 'oda', 'oda', 100, { w: 20, d: 14 }],
    ['hide', '大村への手', '羽柴秀吉', 10400, -28, -60, 'oda', 'oda', 0, { bind: 'hide' }],
    ['hirata', '平田の持ち場', '谷大膳（谷衛好）の手', 200, HIRATA.x, HIRATA.z, 'oda', 'oda', 0, { bind: 'hirata' }],
    ['west', '西の付城', '羽柴の配下（名は不明）', 150, -160, -140, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['south', '南西の付城', '羽柴の配下（名は不明）', 150, -100, 90, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['north', '北の付城', '羽柴の配下（名は不明）', 150, 20, -110, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['east', '東の付城', '羽柴の配下（名は不明）', 150, TSUKESHIRO_CHAIN[4][0], TSUKESHIRO_CHAIN[4][1], 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['reserve', '本陣の後備え', '羽柴の配下（名は不明）', 2000, 154, -164, 'oda', 'oda', 100],
    ['road', '道を押さえる手', '羽柴の配下（名は不明）', 1800, -126, -26, 'oda', 'oda', 100, { facing: -Math.PI / 2 }],
  ], '総勢二万は復元の目安。秀長の当日の留守役は確定しない'),
  rosterPlan('城の守りと搬入の手', 1, MIKI, Math.PI, [
    ['nagaharu', '本陣', '別所長治', 1000, MIKI.x + MIKI_JO.honmaru.dx, MIKI.z + MIKI_JO.honmaru.dz, 'maru', 'maru', 0, { bind: 'ehon' }],
    ['ni', '二の丸', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.ninomaru.dx, MIKI.z + MIKI_JO.ninomaru.dz, 'maru', 'maru', 40, { w: 6, d: 4 }],
    ['shinjo', '新城', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.shinjo.dx, MIKI.z + MIKI_JO.shinjo.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['takao', '鷹尾山城', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.takao.dx, MIKI.z + MIKI_JO.takao.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['miyanoue', '宮ノ上要害', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.miyanoue.dx, MIKI.z + MIKI_JO.miyanoue.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['sally', '城からの出撃', '別所の配下（名は不明）', 1700, -30, -48, 'maru', 'maru', 0, { bind: 'sally' }],
    ['supply', '兵糧隊の護衛', '搬入側の将（名は不明）', 2000, -154, -82, 'mori', 'mori', 0, { bind: 'escort' }],
  ], '城方五千五百と搬入側二千、合計七千五百は復元の目安。荷を担ぐ者は含めない'),
];
function move(g, x, z, then = 'hold') {
  if (gone(g)) return;
  g.order = 'move'; g.dest = { x, z }; g.march = false;
  g.onArrive = (q) => { q.order = then; q.onArrive = null; };
}
function flee(g, x, z) {
  g.routed = true; g.order = 'flee'; g.fleeDir.x = x; g.fleeDir.z = z;
  for (const u of g.units) { u.fleeing = true; u.target = null; }
}
const miki = {
  jinkei: JIN, noWake: true, noTaishoRaid: true, noDistantBattle: true,
  botOrders: true, // 下知待ち・柵の回り道・反撃を、性格の突進や持ち替えで上書きしない。
  frontlineDensity: { phases: ['convoy', 'omura'], scoutAdvance: true },
  taisho: { a: { name: '羽柴秀吉', def: true }, b: { name: '別所長治', def: true } },
  spawn: { x: -82, z: -40, heading: Math.atan2(-22, -8) },
  // 今の持ち場を優先する。城の馬印や済んだ俵へ案内を戻さない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.roadTurn >= 0) return 'road-turn';
    if (F.step === 2 && F.foes.every(gone)) return 'omura';
    if (F.joinGroup) return 'join';
    return F.step === 2 ? 'omura' : F.dropped ? 'hirata' : 'road';
  },
  world: {
    // 城域と東の付城を地面の内に収める。共通地形の頂点数は増やさない。
    seed: 15799, groundHalf: 780, moveLim: 750, time: 'morning', fogFar: 300,
    // 西の荷駄道・北の本陣から城域と東の付城まで。遠景の広さと遊べる端を分ける。
    playerBounds: { minX: -245, maxX: 720, minZ: -255, maxZ: 720 },
    playerBoundsAt: (rt) => rt.flags.step === 1 && !rt.flags.dropped && !rt.flags.ending && !rt.over ? CONVOY_BOUNDS : null,
    autumn: true, muddy: 0.15, paths: ROADS,
    height, moveWay: hirataWay, riverCross: true,
    blockedHint: (rt) => rt.player.u.pos.z > -35 ? '川は東の浅瀬を渡れ。平田へは南の口から入る' : rt.flags.step === 2 ? '大村へは平田の柵の外を西へ回り、北の坂道を進め' : '西の合流口へは南の道を進め。平田の柵は南に口がある',
    streams: [{ pts: [[-230, -35], [-100, -35], [0, -28], [100, -22], [230, -35]], w: 6, depth: 1.2, fords: [{ x: 10, w: 9 }] }],
    clear: (x, z) => (x < 30 && z > -150 && z < 30) || castleBlend(x, z) > 0 || roadBlend(x, z) > 0,
    fieldStage: 'stubble', trees: 360, tufts: 3600,
    treeDensity: (x, z) => castleBlend(x, z) > 0 || roadBlend(x, z) > 0 ? 0 : x < 30 && z > -150 && z < 30 ? 0.12 : 1,
    groves: [{ x: -120, z: -110, r: 12, n: 16 }, { x: -38, z: -154, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (x < -215 || x > 215),
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.blockades = []; F.step = 0; F.taken = 0; F.massRetired = [false, false];
    // 根拠のある出来事・推定の復元・遊びの補いを内部で分ける。画面には英字を出さない。
    F.hist = { siege: 'HIST_A', supplyBattle: 'HIST_A', taniDeath: 'HIST_A', honjinSite: 'HIST_A',
      castleShape: 'HIST_B', honjinDitch: 'HIST_B', forts: 'HIST_B', roads: 'GAME_C',
      foodDays: 'GAME_C', moraleShock: 'GAME_C', blockadeRepair: 'GAME_C' };
    // 長い囲みで蓄えが減った状態を復元。九月十日の戦闘中には日を送らない。
    F.kakoi = makeKakoi({ foodDays: 60, morale: 75 });
    advanceDay(F.kakoi, 30);
    // ---- 平田の付城（柵の囲い。口は南） ----
    const hirataWalls = ringWall(rt, HIRATA.x, HIRATA.z, HIRATA.r, { gapAt: 0, gapW: 0.5, team: 0, hp: 1e9, name: '柵', segLen: 5 });
    for (const s of hirataWalls) { s.noTarget = true; s.wall = true; }
    goten(rt, HIRATA.x - 5, HIRATA.z - 4, { w: 6, d: 4, tile: false, naka: true, noTarget: true, team: 0, profile: 'miki', doorX: 0, name: '平田の番所' });
    monomi(rt, HIRATA.x + 6, HIRATA.z - 6);
    rt.scene.add(kabukimon(W, HIRATA.x, HIRATA.z + HIRATA.r, 6, 0, { doors: false }));
    for (const [x, z] of [[HIRATA.x - 6, HIRATA.z + 8], [HIRATA.x + 6, HIRATA.z + 8]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    const batch = makeSimpleBatch();
    for (const wall of hirataWalls) dorui(W, wall.seg, wall.nx, wall.nz, { h: .7, w: 2, batch });
    hut(W, HIRATA.x + 6, HIRATA.z + 1, 5, 4, 0, { ita: true, batch });
    // 代表四付城も柵と土塁・南の木戸・番所と兵糧蔵・井楼を備える。
    for (const q of MIKI_FORTS) {
      const walls = ringWall(rt, q.x, q.z, q.r, { gapAt: 0, gapW: .65, team: 0, hp: 1e9, name: '付城の柵', segLen: 5, meshOpt: { batch } });
      for (const wall of walls) {
        wall.noTarget = true; wall.wall = true;
        dorui(W, wall.seg, wall.nx, wall.nz, { h: .8, w: 2, batch });
      }
      rt.scene.add(kabukimon(W, q.x, q.z + q.r, 7, 0, { doors: false }));
      goten(rt, q.x - 6, q.z, { w: 6, d: 4, tile: false, naka: true, noTarget: true, team: 0, profile: 'miki', doorX: 0, name: '付城の番所' });
      hut(W, q.x + 6, q.z + 2, 5, 4, 0, { ita: true, batch });
      monomi(rt, q.x + 6, q.z - 6);
      rt.scene.add(nobori(W, q.x - 4, q.z + 7, 'oda', 6));
    }
    // 平場の縁。道と戸口への枝道は全幅を開け、土塁・柵・当たりを同じ線へ置く。
    for (const q of MIKI_KURUWA) {
      const x = MIKI.x + q.dx, z = MIKI.z + q.dz;
      goten(rt, x, z, { w: q.w, d: q.d, tile: false, naka: true, noTarget: true, team: 1, profile: 'miki', doorX: 0,
        name: q === MIKI_JO.honmaru ? '本丸の主殿' : q === MIKI_JO.ninomaru ? '二の丸の控えの間' : q.name + 'の番所' });
      const pts = [[x-q.cw/2,z-q.cd/2],[x+q.cw/2,z-q.cd/2],[x+q.cw/2,z+q.cd/2],[x-q.cw/2,z+q.cd/2]];
      for (let i = 0; i < 4; i++) {
        const a = pts[i], b = pts[(i+1)%4], n = Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12);
        for (let j = 0; j < n; j++) {
          const seg = [a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n];
          if (crossesRoad(seg)) continue;
          const len = Math.hypot(seg[2]-seg[0], seg[3]-seg[1]);
          const nx = -(seg[3]-seg[1])/len, nz = (seg[2]-seg[0])/len;
          dorui(W, seg, nx, nz, { h: .8, w: 2, batch });
          for (const wall of wallLine(rt, [[seg[0],seg[1]],[seg[2],seg[3]]], { team: 1, hp: 1e9, name: '曲輪の柵', segLen: 12, mesh: palisade, meshOpt: { batch } })) { wall.noTarget = true; wall.wall = true; }
        }
      }
      rt.scene.add(kabukimon(W, x + 7, z + q.cd/2, 7, 0, { doors: false }));
      monomi(rt, x - q.cw/2 + 15, z - q.cd/2 + 15);
      hut(W, x + q.cw/2 - 15, z - q.cd/2 + 15, 6, 4, 0, { ita: true, batch });
      hut(W, x - q.cw/2 + 16, z + q.cd/2 - 15, 7, 4, 0, { ita: true, batch });
    }
    // かんかん井戸。径約３．６の井桁を共通形で作る。深さは歩行地形へ穴を開けず暗い水面で表す。
    const wx = MIKI.x + MIKI_JO.honmaru.dx - 11, wz = MIKI.z + MIKI_JO.honmaru.dz, wy = W.heightAt(wx, wz);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, .75, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x746b56, side: THREE.DoubleSide }));
    rim.position.set(wx, wy + .375, wz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.65, 12), new THREE.MeshLambertMaterial({ color: 0x171d17 }));
    water.rotation.x = -Math.PI/2; water.position.set(wx, wy + .04, wz);
    rt.scene.add(rim, water); solidCircle(wx, wz, 1.85);
    finalizeSimpleBatch(rt, batch);
    for (const [x, z] of [[MIKI.x + MIKI_JO.honmaru.dx - 8, MIKI.z + MIKI_JO.honmaru.dz + 20], [MIKI.x + MIKI_JO.honmaru.dx + 8, MIKI.z + MIKI_JO.honmaru.dz + 20]]) rt.scene.add(nobori(W, x, z, 'maru', 7));
    // 台地全体を楕円の柵で囲う根拠はない。縁の守りは五曲輪の土塁・柵と三方の切岸に置く。
    // 城下（町屋）と、付城をつなぐ土塁・木柵の遮断線（兵糧の道を断つ網。付城は城下まで遠巻きに囲む）
    rt.scene.add(village(W, MIKI.x + MIKI_JO.jokamachi.dx, MIKI.z + MIKI_JO.jokamachi.dz, { n: MIKI_JO.jokamachi.n, r: MIKI_JO.jokamachi.r, rot: 0.1, fields: 5, bamboo: 0, smoke: 0, seed: 1579 }));
    for (let i = 0; i < TSUKESHIRO_CHAIN.length - 1; i++) {
      let [ax, az] = TSUKESHIRO_CHAIN[i], [bx, bz] = TSUKESHIRO_CHAIN[i + 1];
      // 囲いの中心まで延びていた翼の柵は、周回路の外から始める。
      // 見える柵・土塁・当たりを一緒に置き直し、南だけが開く囲いは保つ。
      const span = Math.hypot(bx - ax, bz - az), apron = HIRATA.r + 11;
      if (ax === HIRATA.x && az === HIRATA.z) { ax += (bx - ax) / span * apron; az += (bz - az) / span * apron; }
      else if (bx === HIRATA.x && bz === HIRATA.z) { bx += (ax - bx) / span * apron; bz += (az - bz) / span * apron; }
      const len = Math.hypot(bx - ax, bz - az), nseg = Math.max(2, Math.round(len / 10));
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let k = 0; k < nseg; k++) {
        const s0 = k / nseg, s1 = (k + 1) / nseg;
        if (s0 > 0.28 && s1 < 0.72) continue;   // 付城と付城のあいだは空ける（荷駄が抜けようとする隙。遮断線は両の付城から延びる翼）
        const seg = [ax + (bx - ax) * s0, az + (bz - az) * s0, ax + (bx - ax) * s1, az + (bz - az) * s1];
        // 川を柵で横断しない。荷駄道にも道幅ぶんの口を残す。
        const mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
        if (W.inWaterAt(mx, mz) || crossesRoad(seg)) continue;
        for (const wall of wallLine(rt, [[seg[0], seg[1]], [seg[2], seg[3]]], { team: 0, hp: 180, name: '付城の柵', meshOpt: { mound: true } })) {
          wall.noTarget = true; wall.wall = true;
          const q = { wall, x: mx, z: mz, broken: false, damage: 0 }; F.blockades.push(q);
          const id = 'repair' + F.blockades.length;
          rt.addInteract(id, () => q.broken && !F.ending ? q : null, '付城の柵を直す', () => {
            if (!q.broken || F.ending || rt.over || !rt.player.u.alive) return;
            q.broken = false; q.damage = 0; wall.opened = false; wall.wall = true;
            if (wall.mesh) wall.mesh.visible = true;
            rt.bark('付城の柵を直した。兵糧の道をふさげ');
          }, { r: 3, hold: 6 });
        }
        rt.scene.add(dorui(W, seg, nx, nz, { h: 0.5, w: 2 }));
      }
    }
    for (const [x, z] of TSUKESHIRO_CHAIN) rt.scene.add(nobori(W, x, z, 'oda', 7));
    // 秀吉は槍列の後ろ。護衛と鉄砲を別の列に置き、本人だけ突っ込ませない。
    F.hide = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴秀吉の手', anchor: { x: -28, z: -60 }, facing: -Math.PI / 2, width: 6, aggro: 5, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true } }, { type: 'samurai', n: 5 }], ODA));
    F.hideU = F.hide.units[0]; F.hideU.allyOk = true;
    F.guard = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴の槍組', anchor: { x: -42, z: -62 }, facing: -Math.PI / 2, formation: 'yari', aggro: 12 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 24 }], ODA));
    F.hgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴の鉄砲組', anchor: { x: -24, z: -84 }, facing: -Math.PI / 2, formation: 'line', width: 6, aggro: 5 }, dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.hirata = allyGroup(rt, { fixed: true, fullStrength: true, name: '平田の付城の守り', anchor: { x: HIRATA.x, z: HIRATA.z + 4 }, facing: 0, formation: 'yari', aggro: 9 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -78, z: -38 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // 平井山は美嚢川の北東側。留守役を秀長と断定せず、護衛の備だけ置く。
    F.honjin = camp(rt, { ...HONJIN, compact: true, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 0, runTo: { x: -28, z: -60 } });
    const honjinBatch = makeSimpleBatch();
    for (const wall of ringWall(rt, HONJIN.x, HONJIN.z, 20, { gapAt: 0, gapW: 0.7, team: 0, hp: 1e9, name: '本陣の柵', segLen: 8, meshOpt: { batch: honjinBatch } })) { wall.noTarget = true; wall.wall = true; dorui(W, wall.seg, wall.nx, wall.nz, { h: .8, w: 2, batch: honjinBatch }); }
    finalizeSimpleBatch(rt, honjinBatch);
    // 控えの間を陣幕の西へ収め、奥の襖も幕から一人ぶん離す。
    goten(rt, HONJIN.x - 13.5, HONJIN.z - 5, { w: 8, d: 5, tile: false, naka: true, noTarget: true, team: 0, profile: 'miki', doorX: 0, name: '平井山の控えの間' });
    rt.scene.add(hut(W, HONJIN.x + 9, HONJIN.z - 7, 6, 4, 0, { ita: true }), kabukimon(W, HONJIN.x, HONJIN.z + 20, 8, 0, { doors: false }));
    // 円い柵の弦から、梯子の足と一歩手前まで離す。
    monomi(rt, HONJIN.x - 14, HONJIN.z + 10);
    rt.scene.add(hyoro(W, HONJIN.x - 8, HONJIN.z + 8, 0), umatsunagi(W, HONJIN.x + 10, HONJIN.z + 8, 0, 8));
    F.ehon = camp(rt, { x: MIKI.x + MIKI_JO.honmaru.dx + 22, z: MIKI.z + MIKI_JO.honmaru.dz + 18, facing: Math.PI, team: 1, faction: 'saito', mon: 'maru', general: { name: '別所長治' }, guard: 20, reserve: 0, runTo: { x: MIKI.x + MIKI_JO.honmaru.dx, z: MIKI.z + MIKI_JO.honmaru.dz + 30 } });
    F.ehon.general.allyOk = true;
    // 開始時に全員を置く。段が変わっても同じ兵が歩き、損失を保つ。
    // 先手は荷より先に坂へ出ている。道幅に収まる三列で、南の合流口へ向ける。
    F.escort = enemyGroup(rt, { fixed: true, faction: 'saito', name: '荷駄の護衛', anchor: { x: -126, z: -70 }, facing: Math.atan2(22, 26), formation: 'column', colW: 3, width: 10, aggro: 12, morale: 90, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }], MORI));
    F.egun = enemyGroup(rt, { fixed: true, faction: 'saito', name: '荷駄を守る鉄砲組', anchor: { x: -174, z: -98 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 8, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], MORI));
    F.sally = enemyGroup(rt, { fixed: true, faction: 'saito', name: '城から出た別所勢', anchor: { x: 50, z: -8 }, facing: -Math.PI / 2, formation: 'yari', aggro: 12, fleeDir: { x: 1, z: 0.4 } }, dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }], BESSHO));
    F.reserve = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大村の控え', anchor: { x: OMURA.x, z: OMURA.z }, facing: 0, formation: 'yari', aggro: 12, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 4 }], BESSHO));
    F.carts = enemyGroup(rt, { fixed: true, faction: 'saito', name: '兵糧を担ぐ者', anchor: { x: LANE[0][0], z: LANE[0][1] }, facing: Math.PI / 2, formation: 'column', colW: 2, speed: 1.2, aggro: 0, civ: true, noRout: true, fleeDir: { x: -1, z: 0 } }, [{ type: 'porter', n: 6, o: { flag: null } }]);
    for (const u of F.carts.units) { u.noTarget = true; u.dmg = 0; }
    F.cartArrived = new Uint8Array(F.carts.units.length); F.delivered = 0;
    // 回収役も開始時から置く。戦う列から兵を抜かず、俵一つずつを南の口へ運ぶ。
    F.loadTaken = [false, false]; F.storedLoads = 0;
    const solidStart = SOLIDS.length;
    const sack = tawara(W, 0, 0, 0, 1);
    SOLIDS.splice(solidStart); // 運べる俵に、元の場所へ残り続ける当たりを作らない。
    F.sacks = Array.from({ length: 8 }, (_, i) => {
      const mesh = i ? sack.clone() : sack;
      mesh.visible = false; rt.scene.add(mesh);
      return { mesh, load: Math.floor(i / 4), worker: null, stored: false };
    });
    F.haulers = [0, 1].map(i => {
      const x = HIRATA.x + (i ? 1 : -1), z = HIRATA.z + 10;
      const g = allyGroup(rt, { fixed: true, fullStrength: true, name: '俵の運び手', anchor: { x, z },
        facing: 0, width: 1, speed: 1.2, aggro: 0, civ: true, noAI: true, arriveNoncombat: true, arriveRadius: 1.5 },
      [{ type: 'porter', n: 1, o: { flag: null } }]);
      const u = g.units[0]; u.noTarget = true; u.dmg = 0;
      const h = { g, u, sack: null, carrying: false, paused: false,
        out: [[x, GATE.z + 4], [-104, -44], [0, 0]],
        back: [[-104, -44], [x, GATE.z + 4], [x, z]], store: { x, z } };
      h.arrive = () => this.haulArrive(rt, h);
      return h;
    });
    F.foes = [F.escort, F.egun, F.sally, F.reserve];
    F.oda = [F.hide, F.guard, F.hgun, F.hirata];
    placeGroup(rt, F.guard, -90, -48);
    placeGroup(rt, F.hgun, -70, -42);
    placeGroup(rt, F.hide, -66, -52);
    // 下知の道が決まる隊は、別の回り込みを同時に探さない。索敵と実戦は続ける。
    for (const g of [...F.oda, ...F.foes, F.carts]) g.noAI = true;
    for (const g of F.oda) campWear(g, 30, 80);
    for (const g of [F.sally, F.reserve]) campWear(g, 35, F.kakoi.morale);
    const hosts = rosterBuild(rt, JIN);
    F.castleHost = hosts[1].shinjo;
    // 既存の兵を軽い控えで厚く見せる。新しい戦う兵は出さない。
    F.escortMass = W.addDistantArmy({ x: -192, z: -113, w: 26, d: 14, count: 240, facing: Math.PI / 2, team: 1, flag: 'mori', kind: 'mixed', seed: 15791 });
    F.sallyMass = W.addDistantArmy({ x: 48, z: 8, w: 22, d: 12, count: 180, facing: -Math.PI / 2, team: 1, flag: 'maru', kind: 'mixed', seed: 15792 });
    F.hideMass = W.addDistantArmy({ x: 4, z: -94, w: 24, d: 14, count: 240, facing: -Math.PI / 2, team: 0, flag: 'oda', kind: 'mixed', seed: 15793 });
    for (const host of [F.escortMass, F.sallyMass, F.hideMass]) host.army.noWake = true;
    // 後列も実兵の同じ道をたどる。参照する位置は準備時に一つだけ持つ。
    for (const [host, group] of [[F.sallyMass, F.sally], [F.hideMass, F.guard]]) {
      const at = { x: group.anchor.x, z: group.anchor.z, facing: group.facing };
      host.follow(() => {
        if (gone(group)) return null;
        at.x = group.anchor.x; at.z = group.anchor.z; at.facing = group.facing; return at;
      }, { gap: 16 });
    }
    rt.setPhase('brief');
    // 打ち込む直前の向きを知らせる。威力や振りかぶる時間は変えない。
    const windup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (enemy, target) => {
      if (windup) windup(enemy, target);
      if (target !== rt.player.u || F.ending || rt.over || !target.alive || rt.t < (F.dangerSaidT ?? -8) + 8) return;
      const dx = enemy.pos.x - target.pos.x, dz = enemy.pos.z - target.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const front = (dx * Math.sin(target.heading) + dz * Math.cos(target.heading)) / len;
      const side = dx * Math.cos(target.heading) - dz * Math.sin(target.heading);
      const dir = front > 0.7 ? '前' : front < -0.7 ? '後ろ' : side > 0 ? '右' : '左';
      F.dangerSaidT = rt.t;
      rt.bark(`${dir}の敵が振りかぶった。敵へ向いて構え、味方の列で受けよ`, true);
    };
    rt.obj('main', '下知から六分半で寄せを止め、兵糧の道を守れ', 'main');
    rt.banner('九月十日　長い囲みの中', '城の蓄えは減っている。囲む味方にも疲れがたまる');
    rt.say('組頭', `${nm(rt)}、西から兵糧の荷が来る。護衛を押し返し、道をふさげ`, 5);
    rt.marker('road', { x: -104, z: -48 }, '兵糧の道・味方との合流口', { guideAlways: true });
    rt.player.yaw = rt.player.u.heading = Math.atan2(-104 - rt.player.u.pos.x, -48 - rt.player.u.pos.z);
    this.roadTurn(rt);
    rt.objProgress('main', '西の道の印で槍組と合流せよ');
    rt.after(5, () => this.convoy(rt));
  },
  convoy(rt) {
    const F = rt.flags;
    if (F.step || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t; F.battleT = rt.t; rt.setPhase('convoy');
    F.roadGoal = { x: -104, z: -48 };
    rt.marker('road', () => F.roadGoal, '兵糧の道・槍組と護衛を押し返せ', { guideAlways: true });
    rt.obj('main', '兵糧の道で護衛を押し返せ。荷を城へ通すな', 'main');
    rt.say('組頭', '道の槍組と平田の守りが共に崩れたら退く。両方の持ち場を守れ', 5);
    F.carts.order = 'path'; F.carts.path = LANE.slice(1); F.carts.pathIdx = 0;
    // 坂の道に沿う約三十四歩。通常の歩みでも下知から十六秒ほどで合流口へ届く。
    // 北へ外れた位置で後列の到着を待たず、味方の持ち場まで先手を進める。
    move(F.escort, -104, -44, 'attack');
    F.escort.march = true;
    F.escort.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.march = false; q.dest = null; q.onArrive = null; };
    move(F.egun, -136, -86);
    // 槍組は南西の道、鉄砲組はその後ろへ。北の柵際へ分断しない。
    for (const [g, path, then] of [
      [F.guard, [[-104, -48], [-108, -48]], 'attack'],
      [F.hgun, [[-90, -42]], 'hold'],
    ]) {
      if (gone(g)) continue;
      g.order = 'path'; g.path = path; g.pathIdx = 0; g.march = true;
      g.onArrive = (q) => { q.order = then; q.march = false; q.onArrive = null; };
    }
    rt.after(24, () => {
      if (F.ending || F.step !== 1 || rt.over) return;
      // 城からの出撃は搬入と同時。三木城の手前で新兵を作らない。
      if (!gone(F.sally)) {
        F.sally.order = 'path'; F.sally.path = SALLY_PATH; F.sally.pathIdx = 0; F.sally.march = true;
        F.sally.onArrive = (q) => { q.order = 'attack'; q.march = false; };
      }
      rt.say('組頭', '城からも兵が来る！　柵の外を南へ回り、平田の口を守れ！', 4);
      rt.marker('hirata', GATE, '平田の付城の口', {});
    });
  },
  roadTurn(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 合流前、南の道を歩く時だけ折れ目を示す。柵の内側へ横切らせない。
    let turn = -1;
    if (F.step <= 1 && !F.dropped && p.z > -52 && p.z < -36 && p.x > -82 && p.x < -30) {
      turn = p.x > -56 ? 1 : 2;
      if (Math.hypot(p.x - ASSEMBLY_TURNS[turn].x, p.z - ASSEMBLY_TURNS[turn].z) < 5) turn++;
      if (turn >= ASSEMBLY_TURNS.length - 1) turn = -1;
    }
    if (turn === F.roadTurn) return;
    F.roadTurn = turn;
    rt.unmark('road-turn');
    if (turn >= 0) rt.marker('road-turn', ASSEMBLY_TURNS[turn], '南の道の折れ目・ここから西へ', {});
  },
  dropLoads(rt) {
    const F = rt.flags;
    if (F.dropped || F.supplyThrough) return;
    F.dropped = true; F.supplyBlocked = true;
    this.roadTurn(rt);
    rt.award((t) => t.side.push('兵糧の護衛を退け、搬入を止めた'), '兵糧の搬入を止めた');
    // 阻止は追加の補給がない事。城の既存の兵糧を四日分消す処理は呼ばない。
    const c = F.carts.center();
    flee(F.carts, -1, 0);
    rt.say('組頭', '荷は止まった。平田の口を守れ。俵は後でよい', 4);
    F.loads = [{ x: c.x - 3, z: c.z + 2 }, { x: c.x + 4, z: c.z - 3 }];
    rt.obj('loads', '余裕があれば、俵の印で長押しして押さえよ', 'side');
    F.loads.forEach((q, i) => {
      for (let j = 0; j < 4; j++) {
        const mesh = F.sacks[i * 4 + j].mesh;
        const x = q.x + (j % 2) * 1.2, z = q.z + Math.floor(j / 2) * 1.2;
        mesh.position.set(x, rt.world.heightAt(x, z), z); mesh.visible = true;
      }
      rt.marker('ld' + i, q, i === 0 ? '一束目の俵' : '二束目の俵', { h: 2 });
      rt.addInteract('ld' + i, q, '俵を押さえる', () => this.take(rt, i), { r: 3, hold: 1.4 });
    });
  },
  take(rt, i) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || !F.dropped || !Number.isInteger(i) || i < 0 || i >= F.loads.length || F.loadTaken?.[i]) return;
    if (!F.loadTaken) F.loadTaken = [false, false];
    F.loadTaken[i] = true; F.taken++;
    rt.uninteract('ld' + i); rt.marker('ld' + i, F.loads[i], '押さえた俵・済', { h: 2 });
    rt.objProgress('loads', `${F.taken}／2束。城兵が寄せていれば、持ち場を先に守れ`);
    if (F.taken >= 2) rt.objDone('loads');
    const label = i === 0 ? '一束目の兵糧を押さえた' : '二束目の兵糧を押さえた';
    rt.award((t) => t.side.push(label), label);
  },
  haulArrive(rt, h) {
    const F = rt.flags, s = h.sack;
    if (!s || F.ending || rt.over || !h.u.alive || h.u.fleeing || h.u.woundOut) return;
    if (!h.carrying) {
      // 要だけの到着では運ばない。本物の担ぎ手が俵の所へ来た時だけ持ち上げる。
      if (Math.hypot(h.u.pos.x - s.mesh.position.x, h.u.pos.z - s.mesh.position.z) > 2.5) {
        h.g.onArrive = h.arrive; return;
      }
      h.carrying = true; rt.scene.remove(s.mesh); h.u.mesh.add(s.mesh);
      s.mesh.position.set(0, 1.05, 0.15); s.mesh.rotation.y = 0;
      s.mesh.scale.set(1 / h.u.mesh.scale.x, 1 / h.u.mesh.scale.y, 1 / h.u.mesh.scale.z);
      h.g.path = h.back; h.g.pathIdx = 0; h.g.onArrive = h.arrive;
    } else {
      if (Math.hypot(h.u.pos.x - h.store.x, h.u.pos.z - h.store.z) > 2) {
        h.g.onArrive = h.arrive; return;
      }
      h.u.mesh.remove(s.mesh); rt.scene.add(s.mesh);
      s.mesh.scale.set(1, 1, 1);
      const n = F.storedLoads++;
      const x = HIRATA.x - 2 + (n % 4) * 1.1, z = HIRATA.z + 7 + Math.floor(n / 4) * 1.1;
      s.mesh.position.set(x, rt.world.heightAt(x, z), z);
      s.stored = true; s.worker = null; h.sack = null; h.carrying = false;
      h.g.order = 'hold'; h.g.onArrive = null;
    }
  },
  haulLoads(rt) {
    const F = rt.flags;
    if (!F.dropped) return;
    for (const h of F.haulers) {
      if (!h.u.alive || h.u.fleeing || h.u.woundOut) {
        if (h.sack) {
          const s = h.sack;
          if (h.carrying) {
            h.u.mesh.remove(s.mesh); rt.scene.add(s.mesh); s.mesh.position.copy(h.u.pos); s.mesh.scale.set(1, 1, 1);
          }
          s.worker = null; h.sack = null; h.carrying = false;
        }
        continue;
      }
      // 寄せ手が近い間は運搬を止める。回収待ちを勝敗の条件にしない。
      let danger = false;
      for (const g of F.foes) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
          Math.hypot(u.pos.x - h.u.pos.x, u.pos.z - h.u.pos.z) < 14) danger = true;
      }
      if (danger) { if (h.sack) { h.g.order = 'hold'; h.paused = true; } continue; }
      if (h.paused) { h.paused = false; h.g.order = 'path'; }
      if (h.sack) continue;
      for (const s of F.sacks) {
        if (s.stored || s.worker || !F.loadTaken[s.load]) continue;
        h.sack = s; s.worker = h;
        h.out[2][0] = s.mesh.position.x; h.out[2][1] = s.mesh.position.z + 1;
        h.g.order = 'path'; h.g.path = h.out; h.g.pathIdx = 0; h.g.march = true; h.g.onArrive = h.arrive;
        break;
      }
    }
  },
  omura(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t; rt.setPhase('omura');
    rt.unmark('road'); rt.unmark('hirata');
    rt.obj('main', '大村の印で味方と合流し、寄せ手を押し返せ', 'main');
    rt.marker('omura', OMURA, '大村の持ち場', {});
    rt.zone('omura', OMURA.x, OMURA.z, OMURA.r);
    // 坂の地面に沿わせ、判定と同じ輪を一度だけ作る。
    rt.drapeRing(rt.rings[rt.rings.length - 1], OMURA.x, OMURA.z);
    rt.say('伝令', '平田の別の持ち場が破られ、谷大膳様が討たれました。大村へ続けとの下知です！', 5);
    // 谷大膳は見せている組と別の持ち場。見える兵を秒数で殺さない。
    // 討死の知らせを受ける近くの組だけが動揺する。損失を戻さず、西の道への後退と再集結へつなぐ。
    for (const g of [F.guard, F.hgun, F.hirata]) {
      if (gone(g)) continue;
      g.morale = Math.max(0, g.morale - 8);
    }
    rt.after(5, () => {
      if (!F.ending && !rt.over && rt.player.u.alive && F.step === 2) rt.say('組頭', '西の道へいったん下がれ。列をそろえ、大村で受けるぞ', 4);
    });
    // 柵を横切る直線の下知を避け、槍・鉄砲・大将の順で西の坂へ回る。
    for (const [g, x, z, then] of [
      [F.guard, OMURA.x + 4, OMURA.z + 12, 'attack'],
      [F.hgun, OMURA.x + 30, OMURA.z + 32, 'hold'],
      [F.hide, OMURA.x + 18, OMURA.z + 44, 'hold'],
    ]) {
      if (gone(g) || g === F.hide && F.hideRetired) continue;
      g.order = 'path'; g.march = true; g.dest = null;
      g.path = [[-104, -48], [-100, -64], [-94, -78], [-80, -84], [x, z]];
      g.pathIdx = 0;
      g.onArrive = (q) => { q.order = then; q.march = false; q.facing = Math.PI; q.onArrive = null; };
    }
    // 同じ後列を槍組に続かせる。位置の入れ物は一度だけ作り、毎コマ使い回す。
    const rear = { x: 0, z: 0, facing: 0 };
    F.hideMass.follow(() => {
      if (F.ending || rt.over || F.guard.routed) return null;
      let x = 0, z = 0, n = 0;
      for (const u of F.guard.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        x += u.pos.x; z += u.pos.z; n++;
      }
      if (!n) return null;
      rear.x = x / n; rear.z = z / n; rear.facing = F.guard._face ?? F.guard.facing;
      return rear;
    }, { gap: 18 });
    // 控えは大村を守る槍列。近くへ来た敵を受け、城方まで深追いしない。
    if (!gone(F.reserve)) {
      F.reserve.order = 'yari'; F.reserve.formation = 'yari';
      F.reserve.focus = null; F.reserve.dest = null; F.reserve.onArrive = null;
      F.reserve.aggro = 12; F.reserve.seekRange = 12;
      for (const u of F.reserve.units) { u.target = null; u.watch = null; }
    }
  },
  end(rt, won, reason) {
    // 荷の到着・両持ち場の崩れ・退く下知は決着。近くの敵との打ち合いで先延ばしにしない。
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true;
    for (const h of F.haulers) { h.g.order = 'hold'; h.g.onArrive = null; }
    rt.setPhase('end'); rt.objProgress('main', '');
    rt.objRemove('loads');
    for (const id of ['road', 'road-turn', 'hirata', 'omura', 'join', 'ld0', 'ld1', 'hide-retreat']) rt.unmark(id);
    rt.unzone('omura');
    rt.uninteract('ld0'); rt.uninteract('ld1');
    rt.tracker.main = won;
    if (won) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; }, '兵糧の道を守った');
      rt.banner('兵糧の道を守った', `三木城の蓄えは約${Math.ceil(F.kakoi.foodDays)}日分。補給を断ち、囲みを続ける`);
      rt.say('組頭', '城はまだ落ちておらぬ。囲みを守れ。次は有岡じゃ', 4);
    } else {
      rt.objFail('main'); rt.banner('持ち場を保てなかった', F.supplyThrough ? `${reason}。城の蓄えは約${Math.ceil(F.kakoi.foodDays)}日分に増えた` : reason);
      rt.say('組頭', '馬印の後ろへ退け。囲みを立て直すぞ', 4);
      move(F.hide, -20, -100); move(F.guard, -32, -92); move(F.hgun, -8, -104);
    }
    // 決着の理由を、結果待ちの被弾で上書きしない。手傷は戻さない。
    rt.player.u.invuln = true;
    rt.finish({}, 8);
  },
  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.poll = (F.poll || 0) - dt;
    if (F.poll > 0) return;
    F.poll = 0.5;
    this.haulLoads(rt);
    this.roadTurn(rt);
    if (!F.step) return;
    const hit = rt.player.lastHit;
    if (hit && rt.t - hit.t < 2 && rt.player.u.alive && rt.t >= (F.dangerSaidT ?? -8) + 8) {
      F.dangerSaidT = rt.t;
      rt.bark(hit.ranged
        ? '矢玉が来ている。構えだけでは防げぬ。柵の陰へ下がれ'
        : hit.back || hit.side
          ? '横や後ろから打たれた。敵へ向き直り、味方の列へ下がれ'
          : hit.guardBroken || hit.exhausted
            ? '構えを崩された。味方の列の後ろへ下がり、息を整えよ'
            : '正面から打たれた。敵へ向いて構え、味方の列で受けよ', true);
    }
    if (gone(F.escort) && gone(F.egun) && !F.massRetired[0]) { F.massRetired[0] = true; F.escortMass.retreat(30, 20); }
    if (gone(F.sally) && !F.massRetired[1]) { F.massRetired[1] = true; F.sallyMass.retreat(30, 20); }
    // 手傷を負った秀吉は護衛の後ろで退く。時間による治癒・復帰はさせない。
    if (F.hideU.woundOut && !F.hideRetired) { F.hideRetired = true; move(F.hide, -12, -112); rt.marker('hide-retreat', F.hideU.pos, '手負いの秀吉の馬印', { group: F.hide }); rt.say('組頭', '殿が手傷じゃ。退く馬印の前を固めよ', 3); }
    // 持ち場が押し破られた所だけ開く。修復すると同じ柵と当たりへ戻す。
    let opening = false;
    for (const q of F.blockades) {
      if (q.broken) { opening = true; continue; }
      let enemy = 0, friend = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct) continue;
        if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 12) continue;
        if (u.team === 1) enemy++; else friend++;
      }
      q.damage = enemy > friend ? q.damage + (enemy - friend) * 0.5 : Math.max(0, q.damage - 0.5);
      if (q.damage >= 12) {
        q.broken = true; opening = true; q.wall.opened = true; q.wall.wall = false;
        if (q.wall.mesh) q.wall.mesh.visible = false;
        rt.bark('付城の柵が破れた。兵糧の道をふさぎ、柵を直せ');
      }
    }
    if (!F.dropped && !F.supplyThrough) {
      // 柵の持ち場が残る間は合流口で荷を止める。隙が開けば搬入を再開する。
      if (F.carts.anchor.x > -108 && F.carts.anchor.x < -90 && !opening && !gone(F.hirata)) {
        if (F.carts.order === 'path') { F.carts.order = 'hold'; F.convoyHeld = true; }
      } else if (F.convoyHeld) { F.carts.order = 'path'; F.convoyHeld = false; }
      // 先頭の荷も見落とさず、一度通った荷だけを搬入分に数える。
      for (let i = 0; i < F.carts.units.length; i++) {
        const u = F.carts.units[i];
        if (F.cartArrived[i] || !u.alive || u.fleeing || u.woundOut || u.pos.x <= 60 || u.pos.z <= 0) continue;
        F.cartArrived[i] = 1; F.delivered++;
      }
      if (F.delivered > 0) {
        F.supplyThrough = true; kakoiEvent.supplyThrough(F.kakoi, 5 * F.delivered / F.carts.units.length);
        return this.end(rt, false, '兵糧の荷が城の口を抜けた');
      }
      // 槍の護衛が崩れれば、鉄砲組も荷を捨てて退く。遠い射手の全滅を待たせない。
      if (gone(F.escort)) {
        if (!gone(F.egun)) flee(F.egun, -1, 0);
        this.dropLoads(rt);
      }
    }
    if (gone(F.guard) && gone(F.hirata)) return this.end(rt, false, '道と付城の槍組が崩れた');
    const left = Math.max(0, Math.ceil(BATTLE_LIMIT - (rt.t - F.battleT)));
    const deadline = left <= 60 ? `。退くまで ${left}秒` : '';
    if (F.dropped && F.taken < 2) rt.objProgress('loads', `${F.taken}／2束。${gone(F.sally) && (F.step !== 2 || F.foes.every(gone)) ? '余裕があれば俵を押さえよ' : '俵は後でよい。持ち場の城兵を先に退けよ'}`);
    let guide = '';
    if (F.step === 1) guide = F.dropped
      ? gone(F.sally) ? '搬入は止まった。大村へ移る下知を待て' : '柵の外を南へ回れ。平田の口で城兵を退けよ'
      : '道の印で味方の槍組と合流し、西の護衛を退けよ';
    if (F.step === 1 && F.dropped && gone(F.sally)) this.omura(rt);
    if (F.step === 2) guide = F.foes.every(gone)
      ? '寄せ手は退いた。大村の印へ戻れ'
      : '大村の印で味方と寄せ手を押し返せ';
    // 搬入阻止の間は同じ印を保つ。通り過ぎても失敗のような「戻れ」に替えない。
    const p = rt.player.u.pos;
    const onRoad = F.step === 1 && !F.dropped;
    if (onRoad) {
      const guardUp = !gone(F.guard), c = guardUp ? F.guard.center() : GATE;
      F.roadGoal.x = c.x - (guardUp ? 3 : 0); F.roadGoal.z = c.z;
      let nearest = null, distance = Infinity;
      for (const u of F.escort.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 20) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < distance && !rt.army.wallBetween(p, -1, u.pos)) { nearest = u; distance = d; }
      }
      if (nearest) {
        F.roadGoal.x = nearest.pos.x; F.roadGoal.z = nearest.pos.z;
        if (distance < 12 && !F.clashHint) {
          F.clashHint = true;
          rt.hud.hint('敵が近い。走るのを止め、槍組と共に斬り合え', '', 5000);
        }
      }
    }
    let nearby = 0;
    for (const u of rt.army.units) {
      if (u.team !== rt.player.u.team || u.isPlayer || u.isStruct || !u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
      if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 18 && !rt.army.wallBetween(p, -1, u.pos)) nearby++;
      if (nearby >= 5) break;
    }
    let join = null;
    if (!onRoad && nearby < 5) {
      if (F.step === 1 && F.dropped && !gone(F.sally) && !gone(F.hirata)) join = F.hirata;
      else if (!gone(F.guard)) join = F.guard;
      else if (!gone(F.hirata)) join = F.hirata;
    }
    if (join !== F.joinGroup) {
      rt.unmark('join'); F.joinGroup = join;
      if (join) rt.marker('join', () => {
        let soldier = null;
        for (const u of join.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          if (u.stdHeld) return u.pos;
          if (!soldier) soldier = u;
        }
        return soldier ? soldier.pos : null;
      }, '味方の槍組・共に戦う持ち場', { group: join, guideAlways: true });
    }
    if (join) guide = F.step === 2 ? '味方の槍組と共に大村を守れ' : '味方の槍組と共に戦え。柵は南の口を回れ';
    if (F.roadTurn >= 0) guide = '南の道の折れ目を通り、西の道で槍組と合流せよ';
    if (F.step === 2 && F.foes.every(gone)) guide = '寄せ手は退いた。大村の輪の内へ戻り、持ち場を固めよ';
    // 物見した荷だけ知らせる。見失った位置を現在地として出し続けない。
    let loadGuide = '';
    if (!F.dropped && !F.supplyThrough) {
      const yaw = rt.player.yaw;
      for (const u of F.carts.units) {
        if (!u.alive || u.fleeing) continue;
        const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d > 70 || dx * Math.sin(yaw) + dz * Math.cos(yaw) < d * 0.5 ||
          !weatherSees(rt.world, p, u.pos) || rt.army.terrainBlocks(p, u.pos) || rt.army.wallBetween(p, -1, u.pos)) continue;
        const place = u.pos.x < -104 ? '西の道' : u.pos.x < 10 ? '平田の南の道' : '城へ向かう道';
        const distance = Math.ceil(Math.hypot(70 - u.pos.x, 10 - u.pos.z) / 10) * 10;
        loadGuide = `見える荷は${place}。城の口まで約${distance}歩`;
        break;
      }
    }
    rt.objProgress('main', `${guide}${loadGuide ? '。' + loadGuide : ''}${deadline}`);
    if (F.step === 2 && F.supplyBlocked && F.foes.every(gone)) {
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - OMURA.x, p.z - OMURA.z) < OMURA.r) return this.end(rt, true);
    }
    if (left <= 30 && !F.deadlineSaid) { F.deadlineSaid = true; rt.bark('あと三十秒で退く。味方と寄せ手を押し返せ', true); }
    // 期限だけで勝たせない。長引けば荷駄を防ぐ持ち場を維持できなかった結果。
    if (rt.t - F.battleT >= BATTLE_LIMIT) this.end(rt, false, '寄せ手を押し返せず、持ち場から退く');
  },
};
miki.sides = { a: { name: '羽柴の囲み', mon: 'oda' }, b: { name: '別所勢・兵糧隊', mon: 'mori' } };
miki.canSkip = (rt) => rt.phase === 'brief' && !rt.over && !rt.flags.ending && rt.t > 3 ? '下知を受けて進む' : '';
miki.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) miki.convoy(rt); };
miki.date = () => '天正七年九月十日　秋';
miki.history = '天正六年から八年にかけて、羽柴秀吉は三木城の別所長治を付城と土塁で包囲した。天正七年九月十日、毛利方の兵糧搬入勢と城内からの別所勢が平田・大村で連携して攻めた。羽柴方は谷大膳（谷衛好）を失ったが、秀吉の攻勢で搬入勢は大きな損害を受けた。十月には付城をさらに寄せ、翌年正月の最終攻勢と降伏交渉を経て、一族の自害と城兵の助命により開城した。この一戦で城が落ちたわけではない。開始の朝の明るさ・天候、浅瀬、備えの位置と人数は復元。包囲全体の二万、城方五千五百と搬入側二千は確定した人数ではない。別所の丸の旗は代用。谷大膳の討死は、目の前の組とは別の平田の持ち場からの知らせとして扱う。';
miki.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  if (!u.alive || F.ending) return;
  // 近い振りかぶりへ向き続けず、先に当たる打ち込みを受ける。
  let attacker = null, hitIn = Infinity, attackDist = 6;
  for (const q of b.army.units) {
    if (!q.alive || q.team === u.team || q.fleeing || q.noTarget || Math.abs(q.pos.y - u.pos.y) >= 3) continue;
    const swing = q.swing && !q.swing.done && q.swing.target === u ? q.swing : null;
    const atk = q.atk && !q.atk.bow && !q.atk.ranged && q.atk.target === u ? q.atk : null;
    const charge = q.charging && q.target === u;
    if (!swing && !atk && !charge) continue;
    const d = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z);
    // 柵越しに届くかは、打つ敵の武器・技と柵からの距離で決まる。
    const over = (q.wpnKind || q.lookWeapon) === 'spear' && (swing || atk)?.kind === 'thrust' && d <= q.reach + 0.3;
    if (d >= 6 || b.army.wallBetween(q.pos, q.team, u.pos, over)) continue;
    const soon = charge ? 0 : swing ? Math.max(0, swing.dur * swing.at - swing.t) : Math.max(0, atk.t);
    if (soon < hitIn || soon === hitIn && d < attackDist) { attacker = q; hitIn = soon; attackDist = d; }
  }
  // 合流口から護衛の列までは十歩ほど。味方と合流したら、その前の敵へ詰める。
  // 遠くの敵を追う前には、任務どおり味方の持ち場へ戻る。
  const front = F.step === 2 ? OMURA : F.dropped ? GATE : F.guard.anchor;
  const atFront = F.step && Math.hypot(u.pos.x - front.x, u.pos.z - front.z) < 16;
  const e = attacker || strikeTarget(b, atFront ? 14 : F.step ? 6 : 3);
  const danger = attacker || b.army.nearestEnemy(u, 6, (q) => !q.fleeing && !q.noTarget && !b.army.wallBetween(u.pos, -1, q.pos));
  // 傷は自然には治らない。手当て済みなら深手でも任務へ戻る。
  // 気力は回復するまで休み、性格の突進で休息を上書きさせない。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if ((u.hp < u.maxHp * 0.5 && canTreat) || p.sta < p.maxSta * 0.22) b.botRest = true;
  if ((!canTreat || u.hp >= u.maxHp * 0.5) && p.sta >= p.maxSta * 0.45) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = !!danger;
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    // 狙いで向きを引き戻されると、手当てする場所へ歩けない。
    if (!danger && p.lock) inp.e.add('KeyQ');
    if (!danger && p.treatmentReady && canTreat) inp.k.add('KeyE');
    else {
      goTo(p, inp, F.hide.anchor.x, F.hide.anchor.z + 4, 2);
      if (danger) {
        // 道の折れをたどりつつ、構えは打ち手へ向ける。敵に背を向けて構えない。
        const walking = inp.k.delete('KeyW'), retreatYaw = p.yaw, face = attacker || danger;
        if (p.lock && p.lock !== face) inp.e.add('KeyQ');
        p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
        if (walking) {
          const fw = Math.cos(retreatYaw - p.yaw), side = -Math.sin(retreatYaw - p.yaw);
          if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
          if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
        }
      }
    }
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 敵が近くても、平田の柵を横切らず口へ回る。届く少し手前まで詰める。
    if (d >= reach && !attacker) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) {
      inp.e.add('KeyC'); b.botCmdT = b.t + 2;
    }
    // 近いだけで構え続けず、打ち込みを受けた後の隙に突き返す。
    patientStrike(p, inp, e, d); return;
  }
  inp.guardHold = false;
  // 下知待ちは開始地点の道で待つ。北の槍組へ直進すると道を外れる。
  if (!F.step) { goTo(p, inp, b.def.spawn.x, b.def.spawn.z, 1); return; }
  if (F.step === 2) { goTo(p, inp, OMURA.x, OMURA.z + 8, 3); return; }
  // 任務に書かれた合流口を使う。敵隊の中心を追うと、柵の北へ一人で回り込んでしまう。
  if (!F.dropped) {
    if (F.roadTurn >= 0) {
      const turn = ASSEMBLY_TURNS[F.roadTurn];
      goTo(p, inp, turn.x, turn.z, 2); return;
    }
    const c = F.guard.center();
    if (!gone(F.guard) && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 8) goTo(p, inp, c.x + 3, c.z + 3, 4);
    else goTo(p, inp, -104, -48, 3);
  } else if (!gone(F.sally)) goTo(p, inp, GATE.x, GATE.z, 3);
};
export { miki };
