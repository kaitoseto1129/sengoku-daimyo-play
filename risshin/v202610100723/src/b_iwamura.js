import { pressureTick } from './battle_pressure.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　岩村城の戦い・水晶山の夜討ち（天正三年十一月十日）
// 長篠の戦いの後、織田信忠は東美濃の岩村城（武田の秋山虎繁が守る）を囲んだ。
// 十一月十日の夜、水晶山の陣が夜討ちを受け、河尻秀隆・毛利長秀らがこれを退け、
// 城方の出撃と合流を阻んだ。城の開城・捕縛は後日の出来事。
// 足軽は河尻秀隆の手（信忠の軍）。①夕暮れ、水晶山の陣の柵の守りにつく ②夜、山道の夜討ちと城方の出撃を柵で受け止める
// ③退く武田勢を、城の麓まで追う
// 向き：北（-z）の山の上に岩村城。南（+z）の水晶山に信忠の陣
// ======================================================================
import { nobori, campfire, tawara, village, ishigaki, solidCircle } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { sightUnit } from './battle_sight.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { yamaLift, switchback } from './yamalift.js';
import { horiboriHeight, goten, monomi } from './castle_parts.js';
import { heightOf, buildCastlePlan, makeLordKeep, inPoly } from './castle_plan.js';
import { IWAMURA_SUISHOZAN_PLAN, IWAMURA_CASTLE_PLAN, HON as IWA_HON, SHU as IWA_SHU, ROAD as IWA_ROAD, SIDE_ROADS as IWA_SIDE_ROADS, castlePoint } from './castles/iwamura.js';

import { demDetail } from './dem.js';
import { distToPolyline } from './world.js';
// 国土地理院の標高（asset_dem_iwamura.js。山頂は格子の中心から z+70m）は、そのまま混ぜると桁違いに急だった。
// そこで山の形（高さ）は手書きのままにし、尾根と谷の凹凸（まわり平均との差）だけを 0.3 倍で足す。曲輪の段は広げた尾根の本丸を最高所にそろえる。
let dem = null;
import('./asset_dem_iwamura.js').then((m) => { if (!CASTLE_HEIGHT) dem = m.default; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FENCE_Z = -6;                         // 陣の柵
const CASTLE = { x: IWA_HON.x, z: IWA_HON.z };   // 岩村城・本丸（最高所。本丸約717m・山麓との差約180mの高い山城）
const FOOT = { x: 0, z: -90 };              // 城の麓（追う先。登城道はここから主郭・本丸へ折れながら登る）
const POSTS = [{ x: -16, z: FENCE_Z + 5 }, { x: 18, z: FENCE_Z + 5 }];   // 柵の持ち場（篝火を焚く所）
const RAID_PATHS = [
  [[0, -24], [0, FENCE_Z + 3]],
  [[66, -26], [66, 12]],
  [[0, FOOT.z], [20, -62], [0, -36], [0, FENCE_Z + 3]],
  [[-8, -24], [0, -18], [0, FENCE_Z + 3]],
  [[8, -30], [0, -24], [0, FENCE_Z + 3]],
  [[0, -36], [0, FENCE_Z + 3]],
];
// 柵の東の開口（z6〜20）を通り、陣幕より手前で両口をつなぐ。
// 自動操作も寄せ手も同じ道を使う。道と高さは初めに一度だけ作る。
const MOUTH_LINK = [[0, FENCE_Z + 3], [0, 14], [52, 14], [66, 12]];
const MOUTH_BACK = MOUTH_LINK.slice().reverse();
const RETURN_PATHS = RAID_PATHS.map((path, i) => {
  const back = path.slice().reverse();
  back.push([path[0][0], -132 - i * 8]);
  return back;
});
// 追撃も地形をならした九十九折りを通る。兵と自動操作で同じ道を使う。
const CHASE_PATH = [[0, FENCE_Z + 3], ...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20)];
const CHASE_EAST_PATH = [...MOUTH_BACK, ...CHASE_PATH.slice(1)];
const SCOUT_PATH = [[0, -10], [0, FENCE_Z + 3]];
let FIELD_PATHS_ = null; // 下で決まる道の並びを使うので、初めて要る時に組む
const fieldPaths = () => FIELD_PATHS_ || (FIELD_PATHS_ = [[[0, 120], [0, FENCE_Z], ...CHASE_PATH.slice(1), ...IWA_ROAD], ...IWA_SIDE_ROADS, ...RAID_PATHS, SCOUT_PATH, ...RETURN_PATHS, ...CAMP_ENTER, ...CAMP_EXIT]);
// 道の色と木の除け方は読み込み時だけ調べる。道の配列は共用する。
function fieldRoadDistance(x, z) {
  let d = Infinity;
  for (const path of fieldPaths()) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

// 六月頃から十一月の夜討ちまでを、待ち時間を足さず戦略の時間で縮める。
// 日数・蓄え・士気は遊びの補完。実際の兵糧量や包囲開始日を確定する数ではない。
const SIEGE_DAYS = [30, 31, 31, 30, 31, 10];
function siegeStart() {
  const s = { days: 0, food: 180, morale: 85, held: true, pressure: 0, relief: 'unknown' };
  for (const days of SIEGE_DAYS) {
    s.days += days;
    s.food = Math.max(0, s.food - days);
    // 籠城が長引いても夜討ちに出る力は残す。空腹だけで総崩れにはしない。
    if (s.food < 90) s.morale = Math.max(72, s.morale - days * 0.12);
  }
  return s;
}
function siegeRetreatRatio(s, leaderLost) {
  // 兵糧不足の寄せは損を抱えて長く戦えない。無傷の寄せを時間だけで退かせない。
  return (leaderLost ? 0.8 : 0.65) + Math.max(0, 1 - s.food / 30) * 0.05;
}

// 信忠の本陣は x±8、z38〜50 の陣幕。口は南だけで、北の幕は通れない。
// 入る使番も出る兵も南の口を通る。南の鍋（±11付近）と東の馬繋ぎを大回りし、道の配列は使い回す。
const CAMP_EXIT = [
  [[-6.4, 48], [0, 48], [0, 60], [-15, 60], [-15, 35]],
  [[6.4, 48], [0, 48], [0, 60], [15, 60], [15, 35]],
];
const CAMP_ENTER = [
  [[-15, 35], [-15, 60], [0, 60], [0, 48]],
  [[15, 35], [15, 60], [0, 60], [0, 48]],
];
function inCamp(x, z) { return Math.abs(x) < 8.7 && z > 37.3 && z < 50.7; }
function campWay(army, u, goal) {
  const p = u.pos;
  // 使番は戦闘隊と別の役目。南の口までの坂も道としてならしてある。
  const enter = inCamp(goal.x, goal.z);
  // 途中で下知が変わったら、前の入退場の道を引き継がない。
  if (u._iwEntering !== enter) { u._iwExit = null; u._iwEntering = enter; }
  let path = u._iwExit;
  if (!path && enter && !inCamp(p.x, p.z)) {
    path = u._iwExit = CAMP_ENTER[p.x < 0 ? 0 : 1]; u._iwExitI = 0;
    if (p.z >= 60) u._iwExitI = 1;
    if (p.z > 50 && Math.abs(p.x) < 3) u._iwExitI = 3;
  } else if (!path && !enter && inCamp(p.x, p.z)) {
    path = u._iwExit = CAMP_EXIT[p.x < 0 ? 0 : 1]; u._iwExitI = 0;
    // すでに口の前なら、床几の側まで戻らずそのまま出る。
    if (p.z > 47 && Math.abs(p.x) < 3) u._iwExitI = 2;
  }
  if (!path) return goal;
  while (u._iwExitI < path.length && Math.hypot(p.x - path[u._iwExitI][0], p.z - path[u._iwExitI][1]) < 1) u._iwExitI++;
  if (u._iwExitI >= path.length) { u._iwExit = null; return goal; }
  const q = u._iwWay || (u._iwWay = { x: 0, z: 0 });
  q.x = path[u._iwExitI][0]; q.z = path[u._iwExitI][1];
  return q;
}

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 水晶山（南の陣）と、岩村城の山（北。山城の尾根を復元。比高180mに合わせ、曲輪を実寸の平場へ広げる）
  h += 10 * gauss(x, z, 0, 50, 3000) + 92 * gauss(x, z, CASTLE.x, CASTLE.z + 40, 11000);
  if (dem) h += demDetail(dem, x, z, { xy: 1, ox: CASTLE.x, oz: CASTLE.z, cz: 70, win: 25, scale: 0.3 });
  // 城を囲む尾根・谷の奥の山並み（形は東美濃の山地として推定）。
  h += 54 * gauss(x, z, -210, -250, 12500) + 65 * gauss(x, z, 230, -210, 14500) + 42 * gauss(x, z, 80, -400, 18000);
  // 西南の村と刈田の小段。川・海や近世の城下の街割りを作り足さない。
  const d = Math.max(Math.abs(x + 175) - 42, Math.abs(z - 137) - 48);
  const t = Math.max(0, Math.min(1, d / 18));
  return 0.7 + (h - 0.7) * t * t * (3 - 2 * t);
}
// 水晶山砦（織田の陣）の段と、岩村城（曲輪の段）の二つを下地に重ねる（castles/iwamura.js）
const HORI_HEIGHTS = IWAMURA_CASTLE_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) {
    const campHeight = heightOf(IWAMURA_SUISHOZAN_PLAN, liftedTerrain, 6);
    const castleBase = (x, z) => { let h = campHeight(x, z); for (const dip of HORI_HEIGHTS) h += dip(x, z); return h; };
    CASTLE_HEIGHT = heightOf(IWAMURA_CASTLE_PLAN, castleBase, 3);
  }
  return CASTLE_HEIGHT(x, z);
}

// 曲輪と道だけ木を除く。建物・虎口に自動の木が食い込まない。
function castleClear(x, z) {
  if (z > -150) return false;
  for (const k of IWAMURA_CASTLE_PLAN.kuruwa) if (inPoly(k.poly, x, z)) return true;
  for (const path of IWAMURA_CASTLE_PLAN.paths) for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 4) return true;
  }
  return false;
}

const CASTLE_HOUSES = [
    [34, -191.5, 7, 5, '神宮寺の堂', 'temple'],
    [34, -201, 5, 4, '八幡の社', 'shrine'],
    [0, -189, 7, 6, '八幡曲輪の侍屋敷', 'yashiki'],
    [-16, -216, 5, 6, '二の丸の長屋', 'nagaya'],
    [1, -238, 4, 6, '主郭の長屋と蔵', 'nagaya'],
    [-7, -174, 5, 4, '三の丸の番所', 'nagaya'],
  ].map(([x, z, ...house]) => [...castlePoint(x, z), ...house]);


function buildIwamuraLife(rt) {
  const W = rt.world;
  // 八幡曲輪の道の両側に寺社・侍屋敷。場所・規模・屋根は同時代の推定。
  // 0_naibu の共通室内を使い、板床・畳・襖・障子・入口の段と壁の当たりをそろえる。
  rt.flags.castleHouses = CASTLE_HOUSES.map(([x, z, w, d, name, kind]) => goten(rt, x, z, {
    w, d, name, kind, team: 1, tile: false, naka: true, doorX: 0, profile: 'iwamura_' + kind, noTarget: true,
  }));
  // 本丸裏口の短い石留めだけ。現存の大石垣を1575年の総石垣としない。
  // 中世後期の野面積みという観光協会の記述を参考に、範囲は推定。
  // 中・高では cgt の石垣の部品に替わり、低では同じ場所の軽い形を使う。
  rt.scene.add(ishigaki(W, [[-8, -378], [6, -378]], {
    kind: 'nozura', topY: W.heightAt(0, -378) + .4, minH: 2, maxH: 2.5, out: -1, scene: rt.scene,
  }));
  // 霧ヶ井と本丸の井戸。屋根を板葺きにし、井筒・柱の形と当たりを合わせる。
  const stone = [], wood = [];
  for (const [x, z] of [[24, -206], [-5, -267]].map(([x, z]) => castlePoint(x, z))) {
    const y = W.heightAt(x, z);
    const ring = new THREE.CylinderGeometry(.85, .95, .8, 10, 1, true); ring.translate(x, y + .4, z); stone.push(ring);
    solidCircle(x, z, .95);
    for (const dx of [-1.1, 1.1]) {
      const post = new THREE.BoxGeometry(.14, 2.5, .14); post.translate(x + dx, y + 1.25, z); wood.push(post);
      solidCircle(x + dx, z, .12);
    }
    const beam = new THREE.BoxGeometry(2.5, .16, .16); beam.translate(x, y + 2.35, z); wood.push(beam);
    for (const sign of [-1, 1]) {
      const roof = new THREE.BoxGeometry(2.7, .09, 1); roof.rotateX(sign * .35); roof.translate(x, y + 2.7, z + sign * .42); wood.push(roof);
    }
    const bucket = new THREE.CylinderGeometry(.2, .17, .35, 8); bucket.translate(x + .45, y + .98, z); wood.push(bucket);
  }
  for (const [geos, color] of [[stone, 0x817a68], [wood, 0x66513b]]) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    for (const g of geos) g.dispose();
  }
  // 村・刈田は曲輪の外の一組にまとめる。十一月に水田を満水にしない。
  rt.scene.add(village(W, -175, 108, { n: 5, r: 24, fields: 10, autumn: true, smoke: 0, seed: 1575 }));
}

// 信長公記巻八・水精山の夜襲、城の参照表。河尻・毛利の迎撃は史料。
// 攻め口・曲輪別の兵数は補完。城内の個々の守将は不明なので名を作らない。
const JIN = [
  rosterPlan('包囲の陣', 0, { x: 0, z: 44 }, Math.PI, [
    ['nobutada', '本陣', '織田信忠', 8000, 0, 44, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['kawajiri', '水晶山の仕寄り', '河尻秀隆', 5000, -14, 16, 'oda', 'oda', 0, { bind: 'kawa' }],
    ['mori', '水晶山の仕寄り', '毛利河内', 5000, 20, 16, 'oda', 'oda', 0, { bind: 'mouri' }],
    ['left', '西の尾根の囲み', '浅野左近', 5000, -66, 48, 'oda', 'oda', 100, { w: 30, d: 24 }],
    ['right', '東の兵糧道の囲み', '猿荻甚太郎', 5000, 66, 48, 'eiraku', 'oda', 100, { w: 30, d: 24 }],
    ['road', '登城道の仕寄り', '河尻秀隆の配下（名は不明）', 2000, 24, -64, 'oda', 'oda', 24, { w: 10, d: 8 }],
  ], '信長公記巻八・水精山条、城の参照表の岩村'),
  rosterPlan('曲輪の守り', 1, CASTLE, 0, [
    ['akiyama', '本陣', '秋山虎繁', 500, CASTLE.x, CASTLE.z, 'takeda', 'takeda', 0, { bind: 'keep.lord' }],
    ['outer', '三の丸', '秋山虎繁の配下（名は不明）', 500, ...castlePoint(0, -172), 'takeda', 'takeda', 20, { w: 8, d: 8 }],
    ['hachiman', '八幡曲輪', '秋山虎繁の配下（名は不明）', 300, ...castlePoint(16, -196), 'takeda', 'takeda', 16, { w: 7, d: 7 }],
    ['ni', '二の丸', '秋山虎繁の配下（名は不明）', 500, ...castlePoint(-10, -218), 'takeda', 'takeda', 16, { w: 7, d: 7 }],
    ['shu', '主郭', '秋山虎繁の配下（名は不明）', 400, IWA_SHU.x, IWA_SHU.z, 'takeda', 'takeda', 12, { w: 6, d: 6 }],
    ['obi', '帯曲輪', '秋山虎繁の配下（名は不明）', 300, -46, -318, 'takeda', 'takeda', 12, { w: 5, d: 8 }],
    ['demaru', '出丸・東曲輪', '秋山虎繁の配下（名は不明）', 500, 28, -290, 'takeda', 'takeda', 12, { w: 5, d: 8 }],
  ], '信長公記巻八、岩村城の曲輪資料。各曲輪の守将・兵数は不明'),
];
const iwamura = {
  jinkei: JIN,
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noWake: true, // 囲みと城の備は遠景のまま。夜討ちを退けても新たな実兵を足さない。
  noHorse: true, // 柵の守りと山道の追撃は徒歩。
  armySignals: false, // 夜の守りは見張りの声と、一度の警報で知らせる。
  uchisute: true, // 持ち場を守る間は首を取らず、敵を押し返す。
  moveLim: 410, // 共通の置換も城の奥まで扱う。世界の通行範囲とそろえる。
  noTaishoRaid: true, // 本陣狙いの架空の新手を共通処理から出さない。
  taisho: { a: { use: true }, b: { def: true } },
  botOrders: true, // 追撃や手当ての道を、空馬への寄り道で上書きしない。
  spawn: { x: 6, z: 14, heading: Math.PI },
  world: {
    seed: 15755,
    blockedHint: () => '柵の内の左右へ。陣幕と小屋を回り、篝火へ進め',
    groundHalf: 430, // 地面の頂点数を増やさず、帯曲輪と外の堀まで地形の範囲に入れる。
    moveLim: 410,   // 広げた本丸・帯曲輪・裏道の兵を麓へ引き戻さない。
    time: 'dusk',
    winter: true,
    nightLift: 3.8, // 月明かりで山道の土と草、具足の面を読めるようにする。
    climbTan: 0.7, // 道のない切岸を駆け上がらせない。
    muddy: 0.3,
    mist: true,   // 霧が出やすい山城。戦の始めは霧が深く、しだいに薄れる。当夜の霧の濃さは復元
    paths: fieldPaths(),
    slopeForest: 0.45, // 林床を薄く重ね、道の土の筋も残す。
    pathWidth: 3.5, // 粗い地面でも山道に土の筋を残す。
    treePadMul: 0.7,
    tint(x, z, h, c) {
      const d = fieldRoadDistance(x, z);
      const patch = Math.sin(x * 0.09) * Math.cos(z * 0.07);
      const soil = Math.sin(x * 0.17 + z * 0.11) * Math.cos(z * 0.13);
      if (d < 3.5) c.setRGB(0.42 + patch * 0.05, 0.30 + soil * 0.04, 0.18);
      else if (z < -10) {
        // 色の緑の割合を共通の地面が草・土へ読み替える。斜面にも土の斑を残す。
        if (soil > 0.25) c.setRGB(0.36 + patch * 0.04, 0.29, 0.18);
        else c.setRGB(0.24 + patch * 0.05, 0.34 + soil * 0.05, 0.15);
      }
    },
    height,
    moveWay: campWay,
    runnerWay: campWay, // 遠くの点の使番も、姿を出す前から陣幕の口へ回る。
    // 陣の内と建物は空け、柵の外の斜面には木を残す。道は共通の植え分けで除く。
    clear: (x, z) => castleClear(x, z) || (Math.abs(x) < 80 && z > -14 && z < 80) || (Math.abs(x - 24) < 6 && Math.abs(z + 64) < 10) || (Math.abs(x + 175) < 50 && z > 88 && z < 190),
    trees: 520,
    tufts: 3000,
    treeDensity: (x, z) => (castleClear(x, z) ? 0 : Math.abs(x) < 80 && z > -110 && z < -14 ? 0.65 : 1),
    groves: [{ x: -50, z: -40, r: 12, n: 16 }, { x: 50, z: -60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  guideMarker: (rt) => {
    const F = rt.flags;
    if (F.step === 0) return 'kawa';
    if (F.step === 1 && F.lit < POSTS.length) return F.litPosts.has(0) ? 'p1' : 'p0';
    if (F.step < 3) return 'raidMouth';
    return F.chaseArrived ? F.roadMarker || 'foot' : 'chaseRoad';
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.stepT = rt.t; F.ek = 0; F.ak = 0; F.lit = 0;
    F.breach = 0; F.pollT = 0; F.quietSince = rt.t; F.duskAt = rt.t + 16; F.raidAt = rt.t + 60;
    F.siege = siegeStart();
    this.notices(rt);
    F.rescued = true; // この戦では倒れた主人公を共通の担ぎ起こしで戦列へ戻さない。
    // ---- 水晶山砦（castles/iwamura.js。陣の柵・木戸は下の wallLine で手組みのまま＝場と地形の段だけ借りる） ----
    F.C = buildCastlePlan(rt, IWAMURA_SUISHOZAN_PLAN, { baseHeight: liftedTerrain, edgeW: 6, skipWalls: ['honjin'], life: false });
    // ---- 岩村城（外側曲輪→八幡曲輪→二の丸→主郭→本丸。土塁・切岸・木柵・木戸。本丸を総石垣にしない） ----
    F.castleC = buildCastlePlan(rt, IWAMURA_CASTLE_PLAN, { baseHeight: liftedTerrain, edgeW: 3, buildGates: true, buildTowers: true, gateTeam: 1, towerTeam: 1, life: false });
    // 城方が出入りする夜討ちの木戸は開放。見た目と通行の当たりをそろえる。
    for (const g of Object.values(F.castleC.gateObjs)) { g.open(); g.struct.opened = true; }
    const lifeStart = rt.scene.children.length;
    buildIwamuraLife(rt);
    this.mountainScene(rt, lifeStart);
    // ---- 水晶山の陣：柵（中央に一つの口）、陣幕、小屋 ----
    F.fenceSegs = [   // F.fence とは名付けない（playbot は F.fence がある戦を設楽原の柵とみなす）
      ...wallLine(rt, [[-60, FENCE_Z + 4], [-8, FENCE_Z]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
      ...wallLine(rt, [[8, FENCE_Z], [60, FENCE_Z + 4]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
    ];
    // 東の迂回路に口を残し、陣の脇にも柵を置く。南は兵糧を運ぶため開ける。
    wallLine(rt, [[-60, -2], [-60, 30]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8 });
    wallLine(rt, [[60, -2], [60, 6]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8 });
    wallLine(rt, [[60, 20], [60, 30]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8 });
    rt.scene.add(tawara(W, -18, 30, 0.3, 6));
    goten(rt, 22, 28, { w: 7, d: 5, team: 0, tile: false, naka: true, doorX: 0, kind: 'nagaya', profile: 'iwamura_camp', name: '陣の番小屋', noTarget: true });
    // 水晶山の本陣（総大将 織田信忠）と、岩村城の城将 秋山虎繁の陣所
    F.honjin = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 0, z: FENCE_Z + 8 } });
    F.honjin.guard.order = 'move'; F.honjin.guard.dest = { x: 0, z: 34 };
    F.honjin.guard.onArrive = (g) => { g.order = 'hold'; };
    F.honjin.guard.formation = 'yari'; F.honjin.guard.aggro = 6;
    F.keep = makeLordKeep(rt, { name: '秋山虎繁', naka: F.castleC.seat.naka, faction: 'takeda', flag: 'takeda', guardN: 6 });
    F.keep.lord.invuln = true; F.keep.lord.mustLive = true; // 開城後に捕らえられる城将を夜の討取りにしない。
    monomi(rt, -30, FENCE_Z + 8, { name: '陣の西の物見' });
    monomi(rt, 30, FENCE_Z + 8, { name: '陣の東の物見' });
    for (const [x, z, k] of [[-8, 36, 'oda'], [8, 36, 'eiraku'], [-40, FENCE_Z + 8, 'oda'], [40, FENCE_Z + 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 包囲する織田の陣は水晶山一つに集めず、尾根・登城道の途中に散らす（見張り・兵糧所。大きな戦闘は置かない） ----
    monomi(rt, 24, -64, { name: '登城道の物見' });
    rt.scene.add(nobori(W, 24, -70, 'oda', 6));              // 見張り：登城道の折れを見張る物見
    rt.scene.add(tawara(W, -24, 60, 0.3, 8));
    goten(rt, -30, 66, { w: 6, d: 4, team: 0, tile: false, naka: true, doorX: 0, kind: 'nagaya', profile: 'iwamura_camp', name: '陣の兵糧小屋', noTarget: true });       // 兵糧所：本陣の裏に兵糧の俵と番小屋
    // ---- 岩村城の曲輪の建物（主殿・倉・番所くらい。大天守は置かない） ----
    // 本丸の主殿は縄張り（castles/iwamura.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に秋山虎繁（kaito 10/2）
    for (const [x, z] of [[CASTLE.x - 8, CASTLE.z + 6], [CASTLE.x + 8, CASTLE.z + 6]]) rt.scene.add(nobori(W, x, z, 'takeda', 7));
    // ---- 河尻秀隆の手（自分の持ち場）、毛利長秀の手 ----
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -14, z: FENCE_Z + 8 }, facing: Math.PI, fixed: true, width: 10, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }, { type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '河尻秀隆', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }], ODA));
    F.kawaU = F.kawa.units.find((u) => u.name === '河尻秀隆');
    F.mouri = allyGroup(rt, { name: '毛利河内の手', anchor: { x: 20, z: FENCE_Z + 8 }, facing: Math.PI, fixed: true, width: 10, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }, { type: 'busho', n: 1, o: { name: '毛利河内', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }], ODA));
    F.oda = [F.kawa, F.mouri]; F.front = F.oda.slice();
    for (const g of F.oda) { g.defMult = 1.25; g.dmgMult = 1; g.guardOn = true; g.leader = g.units.find((u) => u.name); }
    // 鉄砲・口の槍組も初めから持ち場に置く。夜になって突然作らない。
    F.fgun = allyGroup(rt, { fixed: true, name: '柵の内の鉄砲組', anchor: { x: 4, z: FENCE_Z + 8 }, facing: Math.PI, aggro: 4, formation: 'line' },
      battleLook(rt, [{ type: 'gun', n: 10 }], ODA));
    F.gate = allyGroup(rt, { fixed: true, name: '信忠の馬廻の一手', anchor: { x: 0, z: FENCE_Z + 3 }, facing: Math.PI, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda.push(F.gate);
    // 夜討ちの先触れ六人。登城道の下から中央の口へ歩く（配置は遊びの補完）。
    // 第一波から人数を分け、兵の総数を増やさない。
    F.scout = enemyGroup(rt, {
      faction: 'takeda', name: '登城道の見張り', anchor: { x: SCOUT_PATH[0][0], z: SCOUT_PATH[0][1] }, facing: 0,
      order: 'path', path: SCOUT_PATH, pathIdx: 1, formation: 'column', colW: 2, roadColumn: true,
      speed: 2.8, march: true, aggro: 4, seekRange: 32, noAI: true, morale: 85, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [{ type: 'ashigaru', n: 6 }], TAKEDA));
    F.scout.morale = F.siege.morale;
    F.scout.onArrive = (g) => { g.order = 'attack'; g.march = false; g.formation = 'loose'; g.focus = rt.player.u; };
    // 元の五十六人のうち八人を追撃路へ分ける。途中の補充はしない。
    F.directionSaid = new Set(); F.routSaid = new Set(); F.sentWaves = [];
    F.waves = RAID_PATHS.map((path, i) => enemyGroup(rt, {
      fixed: true, faction: 'takeda', name: i === 2 ? '城口から出た武田勢' : '山道の夜討ち勢',
      anchor: { x: path[0][0], z: path[0][1] }, facing: Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]), order: 'hold', formation: 'column', colW: 2, roadColumn: true,
      aggro: 4, seekRange: 28, noAI: true, morale: 85, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [
      { type: 'samurai', n: i < 3 ? 2 : 0 },
      { type: 'ashigaru', n: i < 3 ? [6, 12, 8][i] : i >= 4 ? 2 : 6 },
      { type: 'bow', n: i < 3 ? 0 : 2 },
    ], TAKEDA)));
    // 城へ退く手を守る小隊。ならした道の二つの折れに初めから置く（配置は遊びの補完）。
    // 追う段で敵に会わない間が長かった（10/6 測り：切れ目79秒）。道の奥の折れにも一組置く。
    F.roadGuards = [...new Set([2, 3, CHASE_PATH.length - 2])].map((i) => CHASE_PATH[i]).map(([x, z]) => enemyGroup(rt, {
      fixed: true, faction: 'takeda', name: '麓の道を守る武田勢', anchor: { x, z }, facing: 0,
      order: 'hold', formation: 'column', colW: 2, aggro: 4, seekRange: 8, noAI: true,
      morale: F.siege.morale, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [{ type: 'ashigaru', n: 4 }], TAKEDA)));
    F.roadDefenders = [...F.waves, ...F.roadGuards];
    for (let i = 0; i < F.waves.length; i++) {
      const g = F.waves[i];
      // 元の山道から口へ着き、必要な時だけ柵の内の連絡道へ回る。
      g.iwMouthPaths = [
        [...RAID_PATHS[i], ...(i === 1 ? MOUTH_BACK.slice(1, -1) : [[0, 14]])],
        [...RAID_PATHS[i], ...(i === 1 ? [] : MOUTH_LINK.slice(1))],
      ];
    }
    for (let i = 0; i < F.waves.length; i++) { F.waves[i].iwReturn = RETURN_PATHS[i].map((q) => q.slice()); F.waves[i].iwInitial = F.waves[i].count; }
    for (const g of F.waves) g.morale = F.siege.morale;
    F.contacts = [F.scout, ...F.waves];
    F.rearGroups = [...F.contacts, ...F.roadGuards];
    this.raidTorches(rt);
    // 待機する列は弓を射ず、夜討ちの下知を待つ。
    for (const g of F.waves) g.fire = false;
    F.raidInitial = F.contacts.reduce((n, g) => n + g.count, 0);
    const n = Math.min(RANKS[rt.G.rank].squad, battleRoom(rt));
    if (n) rt.makeSquad({ x: 4, z: FENCE_Z + 14 }, Math.PI, [{ kind: 'spear', n }]);
    const hosts = rosterBuild(rt, JIN);
    F.castleDA = hosts[1].ni;
    for (const [x, z] of [[-10, 40], [14, 42]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 柵の外の両口と山道の折れを照らす。兵の通る筋には置かず、光は共通の四灯を使う。
    for (const [x, z] of [[-6, -18], [72, 10], [-25, -34], [25, -62]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z);
    }
    // 城の坂の松明の列（遠くからも城の道筋が見える。B028・B030）
    for (let i = 2; i < IWA_ROAD.length; i += 3) { const [rx, rz] = IWA_ROAD[i]; W.addFire(rx + 3.5, rz, { torch: true, h: 1.6 }); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('siege', '囲みと兵糧道を守れ', 'side', true);
    rt.objProgress('siege', '長い囲みで城の兵糧は乏しい。後詰を警戒せよ');
    rt.obj('main', HI(rt) ? '組を率い、河尻の柵につけ' : '河尻の柵の守りにつけ', 'main', true);
    rt.say('河尻秀隆', '登城道に敵がおるぞ。柵の口を固め、篝火を焚け', 4);
    F.raidGuide = { x: 0, z: FENCE_Z + 3 };
    rt.marker('raidMouth', F.raidGuide, () => F.raidGuide.x ? '東の脇口' : '正面の口', { guideAlways: true });
    rt.marker('kawa', unitPos(F.kawaU), '河尻秀隆', {});
    rt.after(9, () => {
      if (F.ending || rt.over) return;
      F.siege.relief = 'reported';
      rt.objProgress('siege', '勝頼の後詰に備え、街道を押さえよ');
      rt.say('使番', '後詰への備えを怠るなとの御下知にござる。街道を固めよ', 4);
    });
    rt.after(5, () => this.prepare(rt));
  },

  // ① 篝火を焚く
  prepare(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('prepare');
    F.litPosts = new Set();
    rt.unmark('kawa');
    rt.obj('main', HI(rt) ? '組を率い、左右の篝火を焚け' : '柵の左右に篝火を焚け', 'main', true);
    rt.objProgress('main', `篝火 0／${POSTS.length}。篝火の印で長押し`);
    rt.say('組頭', '手を貸せ。暗くなる前に火を起こせ', 3);
    POSTS.forEach((q, i) => rt.after(12 + i * 6, () => { if (F.step === 1 && !F.ending && !rt.over) this.light(rt, i, true); }));
    POSTS.forEach((q, i) => {
      rt.marker('p' + i, q, '篝火', { h: 2 });
      rt.addInteract('p' + i, q, '篝火を焚く', () => this.light(rt, i), { r: 3, hold: 1.5 });
    });
  },
  light(rt, i, helper = false) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.litPosts.has(i) || !POSTS[i]) return;
    F.litPosts.add(i);
    const q = POSTS[i];
    rt.uninteract('p' + i); rt.unmark('p' + i);
    rt.scene.add(campfire(rt.world, q.x, q.z)); rt.world.addFire(q.x, q.z);
    F.lit++;
    if (!helper) F.playerLit = true;
    if (F.lit >= POSTS.length) {
      if (F.playerLit) rt.award((t) => t.side.push('篝火を焚いた'), '柵の篝火をそろえた');
      rt.obj('main', '柵の内で夜討ちに備えよ', 'main', true);
      rt.objProgress('main', '柵の口を守り、森の足音を聞け');
      rt.say('見張り', '火の向こうが見えんで、耳を澄ませよ', 4);
      // 支度を早く済ませても、夜討ちの時刻は変えない。
    }
    else rt.objProgress('main', `篝火 ${F.lit}／${POSTS.length}`);
  },

  // ② 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 2) return;
    F.step = 2; F.stepT = rt.t; F.pollT = 0.5;
    rt.setPhase('raid'); rt.objProgress('main', '柵の内で槍をそろえよ');
    for (let i = 0; i < POSTS.length; i++) { rt.uninteract('p' + i); rt.unmark('p' + i); }
    rt.obj('main', HI(rt) ? '組を率い、柵で夜討ちを防げ' : '柵で武田の夜討ちを防げ', 'main', true);
    // 先触れとは夕暮れから槍を合わせるため、静けさを語る声は重ねない。
    rt.say('組頭', '夜が来た。柵を守れ', 4);
    for (const g of F.oda) { g.order = 'hold'; g.aggro = 6; }
    // 寄せる敵の現在地は明かさず、山道から両口へ実際に歩かせる。
    const send = (i) => {
      if (F.ending || F.step !== 2) return;
      const g = F.waves[i]; g.iwSent = true; g.iwSentAt = rt.t; F.sentWaves.push(g);
      if (!g.count || g.routed) return;
      // 出現位置だけを固定する。行軍中は道幅に合わせて後列の持ち場を詰める。
      g.fixed = false; g.fire = true;
      // 中央は柵の口、東は脇の口まで寄せる。柵の外で止めない。
      g.order = 'path'; g.path = RAID_PATHS[i]; g.pathIdx = 1; g.speed = 2.8; g.march = true;
      g.aggro = 4; g.seekRange = 8; g.noAI = true;
      g.onArrive = (q) => { q.order = 'attack'; q.noAI = true; q.march = false; q.formation = 'loose'; q.seekRange = 45; };
    };
    // 両口と城口の松明が同じ下知で動く。後続は同じ道を順に寄せる。
    send(0); send(1); send(2);
    // 初戦後は十五秒ごとに次の手を寄せ、敵のいない切れ目を短くする。
    rt.after(30, () => send(3));
    rt.after(45, () => send(4));
    rt.after(60, () => send(5));
  },

  // ③ 城の麓まで追う
  chase(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    for (const g of F.roadGuards) { g.noAI = false; g.aggro = 14; g.seekRange = 22; }
    // 残った列で麓を押さえる。開戦時の人数を追撃の失敗条件にしない。
    F.chasePath = rt.player.u.pos.x > 40 ? CHASE_EAST_PATH : CHASE_PATH;
    F.chaseI = 0;
    F.chaseGuide = { x: F.chasePath[0][0], z: F.chasePath[0][1] };
    rt.marker('chaseRoad', F.chaseGuide, '麓へ続く山道', { guideAlways: true });
    rt.setPhase('chase'); rt.unmark('raidMouth');
    if (!gone(F.scout)) { F.scout.iwReturn = [...SCOUT_PATH.slice().reverse(), [0, -140]]; this.withdrawWave(rt, F.scout); }
    rt.award((t) => t.side.push('夜討ちを受け止めた'), '夜討ちを受け止めた');
    F.siege.pressure++;
    F.siege.morale = Math.max(55, F.siege.morale - 8);
    rt.objProgress('siege', '夜討ちの者が退く。城の麓を押さえよ');
    sfx('taiko', 1);
    battleEvent(rt, EVENT_RETREAT, FOOT, null, 1, true, '夜討ちの者が山道へ退く');
    rt.banner('追い討ちの下知', '河尻の手は麓へ');
    rt.say('組頭', '敵が退くぞ。河尻の手と麓へ追え。組を離れるな', 4);
    rt.obj('main', '山道を進み、麓の味方につけ', 'main', true);
    rt.objProgress('main', '');
    rt.marker('foot', FOOT, '城の麓', { h: 2 });
    rt.zone('foot', FOOT.x, FOOT.z, 8);
    for (const g of F.front) if (!gone(g)) {
      g.fixed = false; // 柵の持ち場を離れた列にも、山道の持ち場補正を使う。
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.roadColumn = true;
      g.path = g.anchor.x > 40 ? CHASE_EAST_PATH : CHASE_PATH;
      g.pathIdx = 0; g.speed = 2.2; g.aggro = 8; g.seekRange = 16;
      g.march = false; g.noAI = true;
      g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; };
    }
    // 馬廻と鉄砲組は陣に残り、追撃で本陣を空にしない。
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step !== 3 || F.joinHold < 3) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('chaseRoad');
    for (let i = 0; i < F.roadDefenders.length; i++) rt.unmark('roadEnemy' + i);
    rt.award((t) => t.side.push(`この持ち場の討死：味方${F.ak}人・敵${F.ek}人`), '持ち場の討死');
    rt.objDone('main');
    F.siege.pressure++;
    rt.objDone('siege');
    rt.award((t) => t.side.push('夜討ちを退け、囲みを守った'), '包囲の陣と麓の道を守った');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水晶山の夜討ちを退け、城の麓まで進んだ', pts: 20 }; }, '水晶山の守りを果たした');
    rt.banner('追い討ちを止める', '麓に留まり、囲みを保て');
    rt.say('組頭', '城へは踏み込むな', 4);
    // 十日の夜の任務はここまで。二十一日の捕縛・処刑は戦後の解説に分ける。
    rt.finish({}, 7);
  },

  lose(rt, reason = '') {
    if (!reason && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; rt.setPhase('end'); rt.tracker.main = false;
    // 局地の失敗は囲みの損として残す。後日の開城をこの夜の成功条件にしない。
    F.siege.held = false;
    F.siege.pressure = Math.max(0, F.siege.pressure - 1);
    rt.objFail('siege');
    rt.objFail('main');
    rt.objProgress('main', '');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('chaseRoad'); rt.unmark('kawa'); rt.unmark('raidMouth');
    for (let i = 0; i < POSTS.length; i++) { rt.unmark('p' + i); rt.uninteract('p' + i); }
    for (let i = 0; i < F.roadDefenders.length; i++) rt.unmark('roadEnemy' + i);
    rt.banner('持ち場を守れなかった', reason || (F.step === 3 ? '味方の列が崩れた。追い討ちを止め、陣へ退け' : F.front.every(gone) ? '柵の味方の列が崩れた。本陣へ退け' : '敵に陣の奥を奪われた。本陣へ退け'));
    rt.finish({}, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 置換した備も持ち場の槍の列に留める。追撃の下知を受けた二手へ勝手に加わらせない。
    for (const g of rt.army.groups) if (g.woke?.jinkeiGuard && !g.iwGuard) {
      g.iwGuard = true; g.guardOn = true; g.formation = 'yari'; g.aggro = 4; g.seekRange = 8;
    }
    F.keep.tick();
    this.torchTick(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    this.rearTick(rt);
    if (F.step >= 2 && rt.t >= (F.pressureAt || 0)) {
      // 道順の詰まりだけを助ける。下知は任務札に残るので同じ台詞を繰り返さない。
      if (F.pressureStage !== F.step) { F.pressureStage = F.step; F.pressureSince = rt.t; }
      F.pressureSayAt = Infinity;
      pressureTick(rt, F.step, F.sentWaves, F.front, '');
    }
    // 夕暮れから四十四秒かけて暗くする。毎コマの色づくりは共通の移ろいに任せる。
    if (!F.duskStarted && rt.t >= F.duskAt) {
      F.duskStarted = true;
      const W = rt.world, from = W.currentLook(), fromNight = W.nightAmount();
      W.setTime('night');
      if (W.fade) W.fade.dur = 44;
      else W.fade = { from, to: W.lookOf('night'), fromNight, t: 0, dur: 44, env: 0 };
    }
    // 夜討ちの始まりは時刻で知らせる。麓の確保は本人と組の到着を待つ。
    if (F.step === 0 && rt.t - F.stepT >= 5) this.prepare(rt);
    if (F.step >= 2 && rt.player.u.hp < rt.player.u.maxHp * 0.5 && !F.hurtHint) {
      this.hurtNotice(rt);
    }
    if (F.step < 3 && rt.t >= (F.contactAt || 0)) {
      F.contactAt = rt.t + 0.5;
      let near = null, distance = Infinity, nearWave = null, waveDistance = Infinity;
      for (const g of F.contacts) {
        if (gone(g) || g.iwWithdraw || g !== F.scout && !g.iwSent) continue;
        // 夜討ちの下知を受けた列は、守りの命令へ戻っても口への行軍を続ける。
        if (F.step === 2 && g.iwSent && (g.order === 'hold' || g.order === 'yari')) {
          g.order = g.onArrive ? 'path' : 'attack';
          g.march = !!g.onArrive;
        }
        // 曲がり角に先頭と隊の要が着けば次へ進む。後列待ちで夜討ちを止めない。
        if (g.order === 'path' && g.path?.length && g.onArrive) {
          const q = g.path[Math.min(g.pathIdx, g.path.length - 1)];
          const front = g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 5);
          if (front && Math.hypot(g.anchor.x - q[0], g.anchor.z - q[1]) < 1.5) {
            if (g.pathIdx < g.path.length - 1) g.pathIdx++;
            else { const deploy = g.onArrive; g.onArrive = null; deploy(g); }
          }
        }
        let canReach = false;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) {
          const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
          if (d < distance) { distance = d; near = u; }
          if (g.iwMouthPaths && d < waveDistance) { waveDistance = d; nearWave = g; }
          if (d < 45 && !rt.army.wallBetween(u.pos, -1, rt.player.u.pos) && !rt.army.terrainBlocks(u.pos, rt.player.u.pos)) canReach = true;
        }
        if (g.order === 'attack') g.focus = canReach ? rt.player.u : null;
      }
      if (distance <= 25 || F.step !== 2) F.quietSince = rt.t;
      // 四秒静かなら本人側の口へ回す。連絡道の移動も含め、三十秒以内に近づける余裕を取る。
      // 半秒ごとの既存の調べを使い、兵の追加や瞬間移動はしない。
      if (F.step === 2 && distance > 25 &&
          (rt.t - F.quietSince >= 4 || rt.t >= 150) && rt.t >= (F.mouthHelpAt || 0)) {
        const g = nearWave;
        if (g?.iwMouthPaths && !g.iwWithdraw && !gone(g)) {
          const side = rt.player.u.pos.x > 40 ? 1 : 0;
          const route = g.iwMouthPaths[side];
          const i = F.waves.indexOf(g);
          const next = g.order === 'path' && (g.path === RAID_PATHS[i] || g.path === route) ? g.pathIdx : RAID_PATHS[i].length - 1;
          g.path = route; g.pathIdx = next; g.order = 'path'; g.fixed = false;
          g.formation = 'column'; g.march = true; g.speed = 2.8; g.focus = null;
          g.onArrive = (q) => { q.order = 'attack'; q.march = false; q.formation = 'loose'; q.seekRange = 45; };
          F.mouthHelpAt = rt.t + 12;
        }
      }
      // 現在地の透視ではなく、見張りが知らせる迎撃の口を指す。
      F.raidGuide.x = near && near.pos.x > 40 ? 66 : 0;
      F.raidGuide.z = F.raidGuide.x ? 12 : FENCE_Z + 3;
      const squad = rt.squadGroups?.find((g) => g.count > 0);
      F.actionHint = distance > 25 ? '柵の内を通り、口へ進め' :
        !squad ? '口で敵を受けよ' : '組の槍をそろえ、口の敵を押し返せ';
    }
    if (F.step < 2 && rt.t >= (F.prepareAt || 0)) {
      F.prepareAt = rt.t + 1;
      rt.objProgress('main', F.lit < POSTS.length ? `篝火 ${F.lit}／${POSTS.length}。篝火の印で長押し` : '柵の口で槍をそろえ、森の足音を聞け');
    }
    if (F.step === 1 && rt.t - F.stepT > 22 && !F.litCall) {
      F.litCall = true; rt.say('組頭', '日が落ちるぞ。火を絶やすな。柵の口を固めよ', 4);
    }
    if (F.step === 1 && rt.t >= F.raidAt && !rt.world.fade) {
      for (let i = 0; i < POSTS.length; i++) this.light(rt, i, true);
      this.raid(rt);
    }
    if (F.step < 2 || (F.pollT -= dt) > 0) return;
    const span = 0.5 - F.pollT; F.pollT = 0.5;
    let inside = 0, deep = 0, guards = 0, seenRaid = 0;
    for (const g of F.waves) for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut) continue;
      if (sightUnit(rt, u)) seenRaid++;
      if (u.pos.z > -30) F.raidContact = true;
      if (Math.abs(u.pos.x) < 26 && u.pos.z > 26 && u.pos.z < 58) inside++;
      if (Math.abs(u.pos.x) < 12 && u.pos.z > 42 && u.pos.z < 58) deep++;
    }
    for (const g of [F.honjin.guard, F.gate, F.fgun]) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.abs(u.pos.x) < 14 && u.pos.z > 40 && u.pos.z < 60) guards++;
    const breached = inside > 0 && (inside >= 4 || deep > guards);
    F.breach = breached ? F.breach + span : Math.max(0, F.breach - span);
    if ((F.step === 2 && F.breach >= 8) || F.front.every(gone)) {
      this.lose(rt);
      if (F.ending || rt.over) return;
    }
    if (F.step === 2) {
      for (let i = 0; i < F.waves.length; i++) {
        const g = F.waves[i];
        // 先頭が口へ着いたら構える。後列全員の到着待ちで斬り合いを止めない。
        if (g.iwSent && !g.iwWithdraw && !gone(g) && g.order === 'path' && g.onArrive && g.pathIdx >= g.path.length - 1) {
          const mouth = g.path[g.path.length - 1];
          if (g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - mouth[0], u.pos.z - mouth[1]) < 8)) {
            const deploy = g.onArrive; g.onArrive = null; deploy(g);
          }
        }
        const seen = g.units.find((u) => u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u));
        const mouth = seen ? seen.pos.x > 20 ? '東' : seen.pos.x < -20 ? '西' : '正面' : null;
        if (mouth && g.iwSent && !F.directionSaid.has(mouth) && rt.t >= (F.directionAt || 0)) {
          F.directionSaid.add(mouth); F.directionAt = rt.t + 8;
          rt.say('見張り', `${mouth}の口だがや！　敵が来よるぞ！`, 4);
        }
      }
      if (!F.raidAlarm) {
        for (const g of F.waves) for (const u of g.units) if (!F.raidAlarm && u.alive && !u.fleeing && u.pos.z > -40 && sightUnit(rt, u)) {
          F.raidAlarm = true; sfx('horagai', 0.8);
          rt.banner('夜討ち', '篝火の向こうに武田の者がいる');
          rt.say('組頭', '槍を出せ！　柵から離れるな', 4);
        }
      }
      if (!F.raidAlarm && !F.raidNews && rt.t - F.stepT >= 8) {
        F.raidNews = true;
        rt.banner('夜討ちの報せ', '味方が山道の寄せを迎え撃っている');
        rt.say('使番', '山道で味方が夜討ちを受けておる。こちらの口も固めよ', 4);
      }
      rt.objProgress('main', breached ? `陣の奥の敵を押し返せ（あと${Math.max(0, Math.ceil(8 - F.breach))}秒）` : `${F.raidGuide.x ? '東の脇の口' : '正面の口'}へ。${seenRaid ? `見える敵 ${seenRaid}人` : '山道から敵が近づく'}。${F.actionHint || ''}`);
      let seenBroken = 0;
      for (const g of F.waves) if ((gone(g) || g.iwWithdraw) && g.units.some((u) => u.alive && sightUnit(rt, u))) seenBroken++;
      if (seenBroken && !F.brokenSaid) { F.brokenSaid = true; rt.say('見張り', '敵が崩れたがや！　まだ山道におるぞ！', 4); }
      // 損害で退く。時間を過ぎただけの無傷の寄せは退かせない。
      if (F.raidContact && inside === 0 && !F.front.every(gone)) {
        for (const g of F.waves) if (g.iwSent && !g.iwWithdraw && !gone(g)) {
          let fighting = 0, breached = false;
          for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { fighting++; if (Math.abs(u.pos.x) < 26 && u.pos.z > 26 && u.pos.z < 58) breached = true; }
          const leaderLost = g.leader && (!g.leader.alive || g.leader.woundOut);
          if (breached || fighting > g.iwInitial * siegeRetreatRatio(F.siege, leaderLost) || rt.t - (g.iwSentAt || F.stepT) < 30) continue;
          this.withdrawWave(rt, g);
        }
      }
      if (F.waves.every((g) => g.iwSent && (gone(g) || g.iwWithdraw)) && inside === 0 && !F.front.every(gone)) this.chase(rt);

    } else if (F.step === 3) {
      const p = rt.player.u.pos;
      // 道標は次の折れを指す。味方の先頭と隊の要が着けば後列待ちを解く。
      while (F.chaseI < F.chasePath.length - 1 &&
          Math.hypot(p.x - F.chasePath[F.chaseI][0], p.z - F.chasePath[F.chaseI][1]) < 6) F.chaseI++;
      F.chaseGuide.x = F.chasePath[F.chaseI][0]; F.chaseGuide.z = F.chasePath[F.chaseI][1];
      for (const g of F.front) if (!gone(g) && g.order === 'path' && g.onArrive) {
        const q = g.path[Math.min(g.pathIdx, g.path.length - 1)];
        if (Math.hypot(g.anchor.x - q[0], g.anchor.z - q[1]) < 1.5 &&
            g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 5)) {
          if (g.pathIdx < g.path.length - 1) g.pathIdx++;
          else { const deploy = g.onArrive; g.onArrive = null; deploy(g); }
        }
      }
      for (let i = 0; i < F.roadDefenders.length; i++) { const g = F.roadDefenders[i]; if (g.iwRoadMarked && (g.iwWithdraw || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && u.pos.z > FOOT.z - 4 && Math.abs(u.pos.x) < 30))) { g.iwRoadMarked = false; rt.unmark('roadEnemy' + i); } }
      let roadHeld = false, roadDistance = Infinity;
      F.roadMarker = null;
      for (const g of F.roadDefenders) if (!g.iwWithdraw) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && u.pos.z > FOOT.z - 4 && Math.abs(u.pos.x) < 30) {
          roadHeld = true;
          if (!g.iwRoadMarked && sightUnit(rt, u)) { g.iwRoadMarked = true; rt.marker('roadEnemy' + F.roadDefenders.indexOf(g), () => g.center(), '麓の道を守る敵の旗', { red: true, group: g }); }
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (g.iwRoadMarked && d < roadDistance) { roadDistance = d; F.roadMarker = 'roadEnemy' + F.roadDefenders.indexOf(g); }
        }
      }
      let joined = 0, available = 0;
      for (const g of F.front) if (!gone(g)) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - FOOT.x, u.pos.z - FOOT.z) < 16) joined++; }
      }
      const arrived = Math.hypot(p.x - FOOT.x, p.z - FOOT.z) < 8;
      F.chaseArrived = arrived;
      if (arrived && !F.joinOrder) {
        F.joinOrder = true;
        rt.obj('main', '麓の敵を退け、味方と留まれ', 'main', true);
        rt.say('組頭', '麓まで来たぞ。道の敵を退け、ここを押さえよ', 4);
      }
      const need = Math.min(6, Math.max(1, Math.ceil(available * 0.3)));
      if (available < 6 && !F.joinWarn) { F.joinWarn = true; rt.say('組頭', '手勢が減ったぞ。互いに離れるな', 4); }
      F.joinHold = arrived && available > 0 && joined >= need && !roadHeld ? (F.joinHold || 0) + span : 0;
      const progress = !arrived ? '山道の印をたどり、麓へ進め' : roadHeld ? '麓の道に敵が残る。味方と押し返せ' : joined < need ? `麓の列 ${joined}／${need}人。組を待て` : `麓で列を保つ あと${Math.max(0, Math.ceil(3 - F.joinHold))}秒`;
      rt.objProgress('main', progress);
      if (F.joinHold >= 3) this.win(rt);
    }
  },


  // 共通の台詞の入口を、この戦の実体だけで整える。他の戦の入口は変えない。
  notices(rt) {
    const F = rt.flags;
    F.noticeBark = rt.bark.bind(rt);
    const say = rt.say.bind(rt);
    const hurt = /深手だ！|深手じゃ！|危ない！|構え.*下がれ|あと一太刀|布を巻く間は動けない|お命が！/;
    rt.bark = (text, warn) => {
      if (rt.player.u.alive && hurt.test(text)) { this.hurtNotice(rt); return; }
      if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢玉じゃ|矢が当たった/.test(text)) { this.arrowNotice(rt); return; }
      if (text === '後ろだ！') return; // 接近の知らせと足音を先に出す。
      F.noticeBark(text, warn);
    };
    rt.say = (sp, text, dur) => {
      if (rt.player.u.alive && hurt.test(text)) { this.hurtNotice(rt); return; }
      if (text.startsWith('後ろから来た！')) return;
      say(sp, text, dur);
    };
    rt.army.hooks.onArrowAtPlayer = () => this.arrowNotice(rt);
    // 気づく前に間合いへ入った者にも、知らせから三秒の猶予を守る。
    const damage = rt.army.damage.bind(rt.army);
    rt.army.damage = (target, amount, src, opts = {}) => {
      if (target === rt.player.u && src?.team === 1 && src.pos &&
          opts.kind !== 'arrow' && opts.kind !== 'gun' && opts.kind !== 'fire' && !src.isStruct && this.isRear(rt, src)) {
        this.rearNotice(rt, src);
        if (rt.t < src.iwRearReady) { if (opts.out) opts.out.res = 'miss'; return; }
      }
      return damage(target, amount, src, opts);
    };
  },
  arrowNotice(rt) {
    const F = rt.flags;
    if (rt.t < 10 || rt.t < (F.arrowAt || 0) || (F.arrowN || 0) >= 3) return;
    F.arrowAt = rt.t + 20;
    F.noticeBark(['矢が来る。柵や小屋の陰へ', '射手が狙っている。口で立ち止まるな', '矢を避け、味方の陰へ'][F.arrowN || 0], true);
    F.arrowN = (F.arrowN || 0) + 1;
  },
  hurtNotice(rt) {
    const F = rt.flags;
    if (F.hurtHint || !rt.player.u.alive || rt.player.u.hp > rt.player.u.maxHp * 0.5) return;
    F.hurtHint = true;
    F.noticeBark('深手だ。構えて味方の後ろへ退き、止まって傷を縛れ', true);
  },
  isRear(rt, u) {
    const p = rt.player.u, dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    return d > 0.1 && (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / d < -0.25;
  },
  rearNotice(rt, u) {
    if (u.iwRearReady != null) return;
    const F = rt.flags;
    u.iwRearReady = rt.t + 3;
    if (rt.t >= (F.rearNoticeAt || 0)) {
      F.rearNoticeAt = rt.t + 8;
      F.noticeBark('後ろから来る。振り向いて構えよ', true);
    }
    rt.army.play('step', u.pos, 1.2);
    u.iwFootAt = rt.t + 0.7;
  },
  rearTick(rt) {
    const p = rt.player.u;
    for (const g of rt.flags.rearGroups) for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || g.iwWithdraw || u.type === 'bow' || u.type === 'gun') continue;
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      if (d > 16 || !this.isRear(rt, u)) { if (d > 20) u.iwRearReady = null; continue; }
      if (rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos)) continue;
      this.rearNotice(rt, u);
      const wait = u.iwRearReady - rt.t;
      if (wait > 0) {
        // 歩みは止めず、主人公への振り出しだけを待つ。味方との戦いは続ける。
        if (u.atk?.target === p) u.atk = null;
        if (u.swing?.target === p) u.swing = null;
        if (u.target === p) u.cd = Math.max(u.cd || 0, wait + 0.1);
        if (rt.t >= u.iwFootAt) { rt.army.play('step', u.pos, 0.9); u.iwFootAt = rt.t + 0.7; }
      }
    }
  },
  raidTorches(rt) {
    const F = rt.flags, W = rt.world;
    F.torches = [];
    for (const g of F.waves) {
      let n = 0;
      for (const u of g.units) if (u.type === 'ashigaru' && n++ < 2) {
        const fire = W.addFire(u.pos.x, u.pos.z, { torch: true, h: 2 });
        // 動く松明に固定した煙柱を残さない。光は既存の灯の枠を使う。
        W.removeSmokeColumn(fire.smoke); fire.smoke = null;
        F.torches.push({ u, fire });
      }
    }
    F.torchSticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.055, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0x725137 }), F.torches.length);
    F.torchSticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    F.torchSticks.frustumCulled = false;
    F.torchPose = new THREE.Object3D();
    rt.scene.add(F.torchSticks);
    this.torchTick(rt);
  },
  torchTick(rt) {
    const F = rt.flags, pose = F.torchPose;
    if (!pose) return;
    for (let i = 0; i < F.torches.length; i++) {
      const { u, fire } = F.torches[i];
      const live = u.alive && !u.woundOut;
      fire.lit = live; fire.flame.visible = fire.inner.visible = fire.glow.visible = live;
      const x = u.pos.x + Math.cos(u.heading) * 0.4, z = u.pos.z - Math.sin(u.heading) * 0.4;
      fire.x = x; fire.z = z; fire.base = u.pos.y + 2.2; fire.ly = 2.45;
      fire.flame.position.set(x, fire.base, z); fire.inner.position.set(x, fire.base - 0.06, z);
      fire.glow.position.set(x, u.pos.y + 0.06, z);
      if (!live && fire.light) fire.light.intensity = 0;
      pose.position.set(x, u.pos.y + 1.4, z); pose.scale.setScalar(live ? 1 : 0); pose.updateMatrix();
      F.torchSticks.setMatrixAt(i, pose.matrix);
    }
    F.torchSticks.instanceMatrix.needsUpdate = true;
  },
  mountainScene(rt, lifeStart) {
    const W = rt.world;
    // 道端の岩は一つの形・材質でまとめる。道の外に置き、歩く筋を塞がない。
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x77705b }), 36);
    const pose = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const q = CHASE_PATH[1 + i % (CHASE_PATH.length - 1)];
      const x = q[0] + (i % 2 ? -1 : 1) * (6 + i % 5), z = q[1] + Math.sin(i * 2.4) * 5;
      const size = 0.5 + i % 4 * 0.25;
      pose.position.set(x, W.heightAt(x, z) + size * 0.2, z);
      pose.rotation.set(i * 0.17, i * 1.3, i * 0.31); pose.scale.set(size * 1.3, size * 0.75, size); pose.updateMatrix();
      rocks.setMatrixAt(i, pose.matrix);
    }
    rocks.receiveShadow = true; rt.scene.add(rocks);
    const patches = [];
    for (let i = 0; i < 24; i++) {
      const q = CHASE_PATH[1 + i % (CHASE_PATH.length - 1)];
      const x = q[0] + (i % 2 ? -1 : 1) * (4 + i % 6), z = q[1] + Math.cos(i * 1.7) * 4;
      const geo = new THREE.CircleGeometry(2 + i % 3, 8); geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
      const soil = i % 3 === 0;
      for (let j = 0; j < pos.count; j++) {
        const px = x + pos.getX(j), pz = z + pos.getZ(j), shade = j === 0 ? 1 : 0.82 + (j % 3) * 0.07;
        pos.setXYZ(j, px, W.heightAt(px, pz) + 0.045, pz);
        colors[j * 3] = (soil ? 0.37 : 0.23) * shade;
        colors[j * 3 + 1] = (soil ? 0.27 : 0.32) * shade;
        colors[j * 3 + 2] = (soil ? 0.16 : 0.14) * shade;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals(); patches.push(geo);
    }
    const cover = new THREE.Mesh(mergeGeometries(patches), new THREE.MeshLambertMaterial({ vertexColors: true }));
    cover.receiveShadow = true; rt.scene.add(cover);
    for (const geo of patches) geo.dispose();

    // 当時の短い石留めだけを月明かりに残す。総石垣や天守は足さない。
    const center = new THREE.Vector3();
    for (let i = lifeStart; i < rt.scene.children.length; i++) rt.scene.children[i].traverse((m) => {
      if (!m.isMesh || !m.geometry || Array.isArray(m.material)) return;
      m.geometry.computeBoundingBox(); m.geometry.boundingBox.getCenter(center);
      m.updateWorldMatrix(true, false); center.applyMatrix4(m.matrixWorld);
      if (Math.abs(center.x) < 12 && center.z < -374 && center.z > -382) {
        m.material = m.material.clone(); m.material.fog = false;
        if (m.material.emissive) m.material.emissive.setHex(0x171b24);
      }
    });
    const lampGeo = new THREE.BoxGeometry(0.75, 0.45, 0.08);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffbb62, fog: false });
    for (const tower of rt.flags.castleC.towers) {
      tower.mesh.traverse((m) => {
        if (!m.isMesh || Array.isArray(m.material)) return;
        m.material = m.material.clone(); m.material.fog = false;
        if (m.material.color) m.material.color.multiplyScalar(0.65);
      });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(tower.x, tower.topY + 0.8, tower.z + 1.1); rt.scene.add(lamp);
      W.addFire(tower.x + 1, tower.z, { torch: true, h: tower.topY - W.heightAt(tower.x, tower.z) + 0.5 });
    }
  },

  withdrawWave(rt, g) {
    g.iwWithdraw = true; g.order = 'path'; g.formation = 'column'; g.path = g.iwReturn;
    // 寄せた道を戻る。東の端の兵を柵の中へ斜めに引き戻さない。
    let nearest = Infinity;
    for (let i = 0; i < g.path.length; i++) {
      const d = Math.hypot(g.anchor.x - g.path[i][0], g.anchor.z - g.path[i][1]);
      if (d < nearest) { nearest = d; g.pathIdx = i; }
    }
    g.speed = 2.2; g.aggro = 0; g.seekRange = 1.8; g.retreatOnly = true; g.noAI = true;
    g.focus = null;
    for (const u of g.units) { u.target = null; u.watch = null; }
    g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.noAI = false; q.aggro = 6; };
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    const F = rt.flags;
    const name = String(g.name).replace(/（[^）]*）/g, '');
    if (F.routSaid.has(name)) return;
    if (rt.t - (F.routSaidT ?? -99) < 8 || g.iwRoutSaid) return;
    if (!g.units.some((u) => u.alive && sightUnit(rt, u))) return;
    g.iwRoutSaid = true; F.routSaidT = rt.t; F.routSaid.add(name);
    rt.say('足軽', `${name}が退いてくがや！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!(F.fenceSegs || []).includes(s) || F.fenceWarned) return;
    F.fenceWarned = true; rt.bark('陣の柵が破られた！', true);
  },
};

// 両軍の総勢（織田信忠の軍 三万ほど、岩村城の武田勢 三千ほど。数には諸説ある）
// 全軍の参考人数を局地の損害で引き算しない。上の札はこの場の実兵。
iwamura.force = (rt) => {
  let a = 0, b = 0;
  for (const g of rt.flags.oda || []) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) a++;
  for (const g of rt.flags.waves || []) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) b++;
  const F = rt.flags;
  F.forceA0 ??= (F.oda || []).reduce((n, g) => n + g.initial, 0);
  return { a, a0: F.forceA0 || 1, b, b0: F.raidInitial || 1 };
};
iwamura.sides = { a: { name: '織田軍（信忠）', mon: 'oda' }, b: { name: '武田軍（岩村城）', mon: 'takeda' } };
// 座光寺は開城後に捕らえられる。夜襲隊へ名付きの討取り相手を追加しない。
iwamura.famous = [];
iwamura.date = (rt) => `天正三年十一月十日　冬・${rt.flags.step >= 2 ? '夜' : '夕暮れ'}`;
iwamura.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
iwamura.skip = (rt) => { if (rt.phase === 'brief') iwamura.prepare(rt); };
iwamura.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
iwamura.history = '天正三年、織田信忠は秋山虎繁らの守る岩村城を囲んだ。『信長公記』巻八によれば、十一月十日の夜、水精山の攻め衆が夜討ちを受け、河尻与兵衛・毛利河内・浅野左近・猿荻甚太郎が退けた。城方は柵を破り、夜討ちの者と合流しようとしたが、信忠が先駆けとなって城へ追い込んだ。勝頼の後詰の報せを受け、信長が京都を発ったのは十四日夜。十日夜の陣に報せが届いた時刻は分からない。後日、秋山・大島・座光寺は降伏の礼に出て捕らえられ、岐阜の長良川で磔にされた。本編は河尻の手が夜討ちを退け、麓を押さえるまでを描く。夜討ち勢の所属、各備の兵数、陣所・道・霧・夕暮れの支度は復元。総勢三万対三千は『信長公記』のこの条に記された人数ではない。';

// 素直な遊び手：篝火を焚き、柵の前で夜討ちを受け、城の麓まで追う
// 左右の柵は端へ向けて南へ傾く。内側に一歩残して槍を届かせる。
function fencePostZ(x) { return FENCE_Z + Math.max(0, Math.min(52, Math.abs(x) - 8)) * 4 / 52 + 1; }
iwamura.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
  if (!u.alive || F.ending) return;
  // 手当て済みなら待ち続けない。味方のいる後方まで退き、狙いを解いて止まる。
  if (u.hp < u.maxHp * 0.5 && !p.bandaged && p.treatmentLeft > 0) b.botRest = true;
  if (b.botRest && (u.hp > u.maxHp * 0.85 || p.bandaged || p.treatmentLeft <= 0)) b.botRest = false;
  if (b.botRest) {
    if (p.lock) inp.e.add('KeyQ');
    if (p.treatmentReady) inp.k.add('KeyE');
    else goTo(p, inp, 4, 32, 2);
    return;
  }
  // 実際の打ち手を先に受ける。塀越し・高低差のある敵へ歩き続けない。
  const reachable = (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.isStruct && o.type !== 'dummy' &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, F.step === 2 && p.weapon === 'spear');
  let attacker = null, ad = 5;
  for (const o of b.army.threats || []) if (o.alive && o.type !== 'gun' && o.type !== 'bow' && reachable(o)) {
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { ad = d; attacker = o; }
  }
  // 柵の口へ寄せる敵も見る。柵の内へ入るまで待つと、味方だけが斬り合ってしまう。
  // 塀越しは reachable で除き、追撃では遠い城兵より麓への下知を優先する。
  const e = attacker || b.army.nearestEnemy(u, 24, (o) => reachable(o) &&
    (F.step !== 3 || o.group && F.roadDefenders.includes(o.group) && !o.group.iwWithdraw && o.pos.z > FOOT.z - 4 && Math.abs(o.pos.x) < 30) &&
    (F.step !== 2 || o.pos.z > fencePostZ(o.pos.x) - reach + 0.1 && u.pos.z > FENCE_Z));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85 && !e.charging) {
      // 刀も届く所まで詰める。打ち手が五歩先にいるだけで立ち止まらない。
      // 夜討ち中は柵の内側で止め、口の外へ追い出ない。
      const z = F.step === 2 ? Math.max(e.pos.z, fencePostZ(e.pos.x)) : e.pos.z;
      goTo(p, inp, e.pos.x, z, z !== e.pos.z ? 0.5 : reach * 0.85);
    }
    if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups[0].order !== 'attack') {
      inp.e.add('KeyC'); b.botCmdT = b.t + 2;
    }
    patientStrike(p, inp, e, d);
    return;
  }
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups[0].order === 'attack') {
    inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
  }
  if (F.step === 1) {
    const it = b.interacts.find((q) => q.id.startsWith('p'));
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 兵の持ち場の中心へ無理に割り込まず、実際に焚ける範囲で止まる。
      if (d >= it.r - 0.3) goTo(p, inp, it.pos.x, it.pos.z, it.r - 0.5);
      else inp.k.add('KeyE');
    }
    return;
  }
  if (F.step === 2) {
    const east = F.raidGuide.x > 40;
    const path = east ? MOUTH_LINK : MOUTH_BACK;
    if (F.botMouthEast !== east) {
      F.botMouthEast = east;
      let nearest = 0, distance = Infinity;
      for (let i = 0; i < path.length; i++) {
        const d = Math.hypot(u.pos.x - path[i][0], u.pos.z - path[i][1]);
        if (d < distance) { distance = d; nearest = i; }
      }
      F.botMouthI = nearest;
    }
    while (F.botMouthI < path.length - 1 &&
      Math.hypot(u.pos.x - path[F.botMouthI][0], u.pos.z - path[F.botMouthI][1]) < 2) F.botMouthI++;
    const q = path[F.botMouthI];
    goTo(p, inp, q[0], q[1], 0.6);
    return;
  }
  if (F.step === 3) {
    const q = F.chaseGuide;
    goTo(p, inp, q.x, q.z, 1.5);
  }
};

// 生きた戦闘員だけで上限を数える。柵・門は兵の枠に入れない。
function battleRoom(rt) {
  let room = 225;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return Math.max(0, room);
}
function battleLook(rt, list, look) {
  let room = battleRoom(rt);
  return dress(list.map((q) => { const n = Math.min(q.n, room); room -= n; return { ...q, n }; }), look);
}

export { iwamura };

// 本丸と山裾の差を180mにそろえる。曲輪や道をならす前に持ち上げ、部品の基準をそろえる。
const LIFT = { x: CASTLE.x, z: CASTLE.z, tx: 0, tz: -172, w: 54, R: 170, rise: 1 };
// 麓も持ち上げの裾に入る。本丸だけの上げ幅ではなく、両地点の差で比高を求める。
LIFT.rise = (180 - (baseTerrain(CASTLE.x, CASTLE.z) + 6 - baseTerrain(FOOT.x, FOOT.z))) /
  (1 - yamaLift(FOOT.x, FOOT.z, LIFT));
function liftedTerrain(x, z) { return baseTerrain(x, z) + yamaLift(x, z, LIFT); }

let ROAD_HEIGHTS = null;
let RAID_RAMPS = null;
let HOUSE_PADS = null;
function height(x, z) {
  // 本丸までと枝道の全てをならす。道の高さを点の間でつなぎ、切岸の急な段差を登れる坂にする。
  if (!ROAD_HEIGHTS) {
    // 曲輪の中心を高さの基準にする。曲輪の外の高い下地を途中の木戸へ採ると、入口に急坂ができる。
    const main = IWA_ROAD.map(([px, pz]) => [px, pz, heightRaw(px, pz)]);
    const anchors = [{ i: 0, y: main[0][2] }];
    for (const [id, x, z] of [['outer', 0, -172], ['hachiman', 16, -196], ['ni', -10, -218], ['shu', 6, -240], ['hon', 0, -258]].map(([id, x, z]) => [id, ...castlePoint(x, z)])) {
      const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => q.id === id);
      anchors.push({ i: IWA_ROAD.findIndex((q) => q[0] === x && q[1] === z), y: k.level(liftedTerrain) });
    }
    for (let j = 1; j < anchors.length; j++) {
      const a = anchors[j - 1], b = anchors[j]; let len = 0, at = 0;
      for (let i = a.i + 1; i <= b.i; i++) len += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]);
      main[a.i][2] = a.y;
      for (let i = a.i + 1; i <= b.i; i++) {
        at += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]);
        main[i][2] = a.y + (b.y - a.y) * at / len;
      }
    }
    const heights = new Map(main.map(([px, pz, y]) => [px + ',' + pz, y]));
    // 枝道も平場の間を道の長さでつなぐ。曲輪外の高い下地を途中の坂に採らない。
    const branches = IWA_SIDE_ROADS.map((pts) => {
      const first = pts[0], last = pts[pts.length - 1];
      const y0 = heights.get(first.join(',')) ?? heightRaw(...first), y1 = heights.get(last.join(',')) ?? heightRaw(...last);
      let len = 0, at = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return pts.map(([px, pz], i) => {
        if (i) at += Math.hypot(px - pts[i - 1][0], pz - pts[i - 1][1]);
        const y = y0 + (y1 - y0) * at / (len || 1);
        heights.set(px + ',' + pz, y);
        return [px, pz, y];
      });
    });
    ROAD_HEIGHTS = [[...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20), ...IWA_ROAD], ...RAID_PATHS, MOUTH_LINK, ...RETURN_PATHS, ...CAMP_ENTER, ...CAMP_EXIT, [[0, -10], [0, -140]]]
      .map((pts) => pts.map(([px, pz]) => [px, pz, heights.get(px + ',' + pz) ?? heightRaw(px, pz)]));
    ROAD_HEIGHTS.push(...branches);
  }
  const raw = heightRaw(x, z);
  let weight = 0, roadH = 0, blend = 0;
  for (const pts of ROAD_HEIGHTS) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= 6.3) continue;
    const k = Math.max(0, Math.min(1, (6.3 - d) / 3.5)), w = k * k * (3 - 2 * k);
    weight += w; roadH += (a[2] + (b[2] - a[2]) * t) * w;
    blend = Math.max(blend, w);
  }
  // 二本の道の中間で最寄りを切り替えると、高さが数メートル跳ねて兵が止まる。
  // 重なる坂を重みでつなぎ、道の境にも高さの切れ目を作らない。
  let h = weight > 0 ? raw + (roadH / weight - raw) * blend : raw;
  // 口の外は一本の坂にそろえる。重なる九十九折りの横の段を馬や寄せ手へ踏ませない。
  // 中央は幅24m、東は幅12m。高さの基準は初めに一度だけ作り、切岸全体はならさない。
  if (!RAID_RAMPS) RAID_RAMPS = [
    [0, -62, FENCE_Z + 3, 12, heightRaw(0, -62), heightRaw(0, FENCE_Z + 3)],
    [66, -62, 12, 6, heightRaw(66, -62), heightRaw(66, 12)],
  ];
  for (const ramp of RAID_RAMPS) {
    const side = Math.max(0, Math.abs(x - ramp[0]) - ramp[3]) / 12;
    const end = Math.max(0, ramp[1] - z, z - ramp[2]) / 10;
    const fade = Math.max(side, end);
    if (fade >= 1) continue;
    const t = Math.max(0, Math.min(1, (z - ramp[1]) / (ramp[2] - ramp[1])));
    const y = ramp[4] + (ramp[5] - ramp[4]) * t;
    const k = 1 - fade * fade * (3 - 2 * fade);
    h += (y - h) * k;
  }
  // 道のなだらかさを家の床下へ持ち込まない。建物の足もとは曲輪と同じ平らな小段。
  // 初めに一度だけ作り、毎コマ配列や形を作らない。
  if (!HOUSE_PADS) HOUSE_PADS = CASTLE_HOUSES.map(([px, pz, w, d]) => {
    const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => inPoly(q.poly, px, pz));
    return [px, pz, w / 2 + .6, d / 2 + .6, k.level(liftedTerrain)];
  });
  for (const pad of HOUSE_PADS) {
    const d = Math.max(Math.abs(x - pad[0]) - pad[2], Math.abs(z - pad[1]) - pad[3]);
    if (d >= 1.4) continue;
    const t = Math.max(0, d / 1.4), k = 1 - t * t * (3 - 2 * t);
    h += (pad[4] - h) * k;
  }
  return h;
}
