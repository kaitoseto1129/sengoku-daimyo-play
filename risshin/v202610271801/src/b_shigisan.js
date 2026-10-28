import { useTerrain } from './asset_manifest.js';
import { pressureTick } from './battle_pressure.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　信貴山城の戦い（天正五年十月）
// 石山本願寺攻めの陣を勝手に払い、信長に背いた松永久秀は、大和の信貴山城に籠もった。
// 片岡城の落城後、織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶らが城を囲み、十月十日に夜攻め。
// 森好久の内通は後世の伝え。信長公記では久秀自身が天主に火をかけて焼死した。
// 足軽は信忠の軍の筒井順慶の手に付く。①筒井の者の案内で、尾根道を登る（横から伏兵）
// ②矢を受けながら打ち手を守る ③木戸を破り、北尾根の曲輪を押さえる ④寝返りと火の手、久秀自害の知らせ
// 向き：北（-z）の山の上に城。南（+z）の麓に織田の陣
// ======================================================================
import { yamaLift } from './yamalift.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior, facePanels, nakaGuide } from './naka.js';
import { stoneTex, barkTex, woodTex, dirtTex, mudTex } from './nature.js';
import { nobori, hut, yagura, campfire, kagaribi, kabukimon, gateRoofFrame, tawara, tobira, palisade, solidRect, makeSimpleBatch, finalizeSimpleBatch, castleStoneMat, castleMat, ishigaki, makeKitBatch, finalizeKitBatch } from './props.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { localClear } from './army_local_way.js';
import { groundAt } from './floors.js';
import { cloneRoomNearMaterial } from './player.js';
import { buildCastlePlan, makeLordKeep, heightOf, inPoly } from './castle_plan.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';

import { timeslipField } from './timeslip_field.js';
import { SHIGISAN_PLAN, TOP, GATE, TOWER, RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI, MEDAKE, TEMPLE, ROAD as SITE_ROAD, TEMPLE_ZONE, ROUTES } from './castles/shigisan.js';
import { demRelief } from './dem.js';
let sgDem = null;
useTerrain('dem_shigisan', (data) => { sgDem = data; ROAD_SEGMENTS = null; ROOM_LEVELS = null; GATE_LEVELS = null; });
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 本の足軽写真：黒漆の貸し胴・赤茶の陣笠・藍の着物。既存の形と材質を共用する。
const LOAN_LOOK = { armor: 0x302824, hatColor: 0x63372e, cloth: 0x253740, doStyle: 'okegawa', kasaDrape: true };
const ODA = { ...LOAN_LOOK, flag: 'oda' };
const TSUTSUI = { ...LOAN_LOOK, flag: 'igeta', hachi: 0x3f7a52 };   // 筒井の手：井筒の旗・緑の鉢巻。背旗は通常の寸法。
const MATSU = { ...LOAN_LOOK, flag: 'todo' };            // 松永の蔦（藤堂蔦の紋で代える）
// 陣幕は南にしか口がない。登城道・遊び手・組の出発地点を囲わぬよう、道の東へ置く。
const TSUTSUI_CAMP = { x: 26, z: 104 };
// 門内で西の櫓の足元を斜めに横切らず、奥まで抜けてから西へ折れる。
const ROAD = SITE_ROAD.flatMap((p) => p[0] === GATE.x && p[1] === GATE.z ? [p, [GATE.x, GATE.z - 12]] : [p[0] === -36 && p[1] >= -132 ? [-48, p[1]] : p]);
// 門脇の守りは柵の外から。空堀を横切らず、土橋から持ち場へ寄る。
// 櫓の脚元へ潜らず、門と櫓の間の土橋から打ち手を守る。
const TOWER_POST = { x: GATE.x + 8, z: GATE.z + 6 };
const SG_TS = { world: null };   // 身の回りの置き物で切岸を外すための今の世界
const TOWER_APPROACH = [[GATE.x, GATE.z + 6], [TOWER_POST.x, TOWER_POST.z]];
const CLIMB_END = ROAD.findIndex((q) => q[1] === GATE.z) - 1;
// 長い登りは出陣前に済ませ、門前へ続く最後の折り返しから始める。
// 尾根の戦いの後も、敵のいない九十九折りを何分も歩かせない。
const OPEN_I = CLIMB_END - 1;
const OPEN_PT = ROAD[OPEN_I];
// 最初の敵は同じ折り返しの十二歩先。谷の斜面から先手を待たせない。
const OPEN_NEXT = ROAD[OPEN_I + 1];
const AMBUSH_T = 12 / Math.hypot(OPEN_NEXT[0] - OPEN_PT[0], OPEN_NEXT[1] - OPEN_PT[1]);
const AMBUSH_PT = [OPEN_PT[0] + (OPEN_NEXT[0] - OPEN_PT[0]) * AMBUSH_T, OPEN_PT[1] + (OPEN_NEXT[1] - OPEN_PT[1]) * AMBUSH_T];
const AMBUSH_APPROACH = [OPEN_NEXT, AMBUSH_PT];
const INNER_HALF = 3.2; // 城内は細い土道。切岸から離れた西の帯道を通る。
const ROAD_HALF = 6; // 馬が向きを変え、二列の兵とすれ違える平らな幅。

// 山上の城下町を作らず、既存の麓の里と朝護孫子寺に民を置く。
// 城と寺の関係は奈良県の城跡解説を参照。里・民・避難路の細かな位置は推定。
// https://www.pref.nara.lg.jp/ikasu-nara/naranoshiro/shigisanjo/index.html
// 山門から寺側の道を下り、羽柴の囲みと細川の後備えの東を通る。
// 麓では家並み・田を横切らず、東端の畦から南の里外れへ退く。
const PEOPLE_ROADS = [
  [[70, 30], [104, 54], [132, 100], [136, 150], [136, 186], [136, 230]],
  [[104, 154], [120, 154], [136, 150]],
];
const peopleRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  // 堂の西側から山門の開口へ。北・南・東の木柵を横切らない。
  { x: TEMPLE.x - 6, z: TEMPLE.z, mode: 'inside', kinds: ['monk', 'monk', 'woman', 'child'],
    route: peopleRoute([[49, 14], [46, 14], [46, 30], ...PEOPLE_ROADS[0]]) },
  // 寺の参道と里の外れで遠巻きに見る人。軍の本陣や城の番所には足さない。
  { x: 104, z: 54, kinds: ['monk', 'merchant', 'farmer', 'woman', 'child'],
    route: peopleRoute(PEOPLE_ROADS[0].slice(2)) },
  { x: 104, z: 154, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    route: peopleRoute([...PEOPLE_ROADS[1].slice(1), ...PEOPLE_ROADS[0].slice(4)]) },
  { x: 136, z: 186, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: peopleRoute(PEOPLE_ROADS[0].slice(5)) },
];

// 実際の先手から合成の合図を出す。任務の文から推測する共通合図との二重打ちを防ぐ。
function siegeSignal(rt, kind) {
  if (kind === 'kakari' || kind === 'nobiki') (rt.cueAt || (rt.cueAt = {}))[kind] = rt.t;
  rt.army.playFar('sig_' + kind, rt.flags.tsuU.pos, 0.9);
}

// 本人の道案内は、実際の一歩と同じ段差・下り・床を調べる。
// 道の印だけで急な段を通せると判断せず、横が急でも縦に歩ける坂は通す。
function guideClear(rt, from, to) {
  const W = rt.world, lim = W.def.moveLim || 176;
  if (Math.abs(to.x) > lim || Math.abs(to.z) > lim || rt.army.wallBetween(from, -1, to)) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
  let x = from.x, z = from.z, y = groundAt(W, x, z, from.y ?? rt.player.u.pos.y);
  for (let i = 1; i <= n; i++) {
    const nx = from.x + dx * i / n, nz = from.z + dz * i / n;
    const h = groundAt(W, nx, nz, y);
    if (h - y > 0.91 || y - h > W.def.maxWalkDrop || !rt.player.canStep(x, z, nx, nz, y)) return false;
    x = nx; z = nz; y = h;
  }
  return true;
}

// 櫓の脚や柵の端を挟んだ印へ直進させず、両側から歩いて届く近い曲がり角を示す。
// 道の順番は変えない。近い障害だけを調べ、入れ物と見つけた角を使い回す。
function guideAround(rt, p, goal) {
  const q = rt.flags.castleGuideBend, W = rt.world;
  q.goal.x = goal.x; q.goal.z = goal.z; q.goal.y = W.heightAt(goal.x, goal.z);
  if (guideClear(rt, p, q.goal)) { q.active = false; return false; }
  // 二つの角で壁を回る時は、最初の角に着いたら再探索を待たず、歩ける保存済みの次の角へ渡す。
  // 探索の二秒待ちで案内を消したり、着いた角を選び直して足元を指し続けない。
  if (q.active && q.twoTurns && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1
      && Math.hypot(p.x - q.point.x, p.z - q.point.z) <= 0.8
      && guideClear(rt, p, q.turn) && guideClear(rt, q.turn, q.goal)) {
    q.point.x = q.turn.x; q.point.y = q.turn.y; q.point.z = q.turn.z;
    q.twoTurns = false;
  }
  // 曲がり角の一歩手前でも、壁の向こうへ直進できるまでは同じ角を保つ。
  if (q.active && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1
      && guideClear(rt, p, q.point)
      && (q.twoTurns ? guideClear(rt, q.point, q.turn) && guideClear(rt, q.turn, q.goal) : guideClear(rt, q.point, q.goal))) {
    goal.x = q.point.x; goal.z = q.point.z; return true;
  }
  q.active = false;
  if (rt.t < q.next || Math.hypot(p.x - goal.x, p.z - goal.z) > 40) return false;
  q.next = rt.t + 2;
  q.twoTurns = false;
  const heading = Math.atan2(goal.x - p.x, goal.z - p.z), probe = q.probe;
  let best = Infinity;
  // 八歩幅の番所の壁際でも角へ回れるよう、十歩まで。二秒ごとの探索に限る。
  for (let r = 2; r <= 10; r += 2) for (let i = 0; i < 8; i++) {
    const a = heading + i * Math.PI / 4;
    probe.x = p.x + Math.sin(a) * r; probe.z = p.z + Math.cos(a) * r;
    const cost = r + Math.hypot(probe.x - goal.x, probe.z - goal.z);
    if (cost >= best) continue;
    probe.y = W.heightAt(probe.x, probe.z);
    if (!guideClear(rt, p, probe) || !guideClear(rt, probe, q.goal)) continue;
    best = cost; q.point.x = probe.x; q.point.y = probe.y; q.point.z = probe.z; q.active = true;
  }
  // 壁の反対側へは二つの角が要る。一つの角から印が見えなくても、壁際で案内を失わない。
  // 建物ごとの四隅だけを使い、隣り合う角の二通りを調べる。探索も二秒に一度だけ。
  if (!q.active) for (const corners of q.corners) {
    for (const c of corners) {
      c.near = Math.hypot(p.x - c.x, p.z - c.z) <= 12;
      c.from = c.near && guideClear(rt, p, c);
      c.to = Math.hypot(goal.x - c.x, goal.z - c.z) <= 16 && guideClear(rt, c, q.goal);
    }
    for (let i = 0; i < 4; i++) for (const offset of [1, 3]) {
      const a = corners[i], b = corners[(i + offset) % 4];
      if (!a.from || !b.to) continue;
      const cost = Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(a.x - b.x, a.z - b.z)
        + Math.hypot(b.x - goal.x, b.z - goal.z);
      if (cost >= best || !guideClear(rt, a, b)) continue;
      best = cost; q.point.x = a.x; q.point.y = a.y; q.point.z = a.z;
      q.turn.x = b.x; q.turn.y = b.y; q.turn.z = b.z;
      q.active = q.twoTurns = true;
    }
  }
  if (!q.active) return false;
  q.gx = goal.x; q.gz = goal.z;
  goal.x = q.point.x; goal.z = q.point.z;
  return true;
}

// 番所へ押し込まれた時は、外壁越しの道でなく戸口を順に通る。
// 戸口の内側にそろえてから踏み段の外へ。建物を出切るまで同じ出口を保つ。
function castleExitGuide(rt, goal) {
  const F = rt.flags, u = rt.player.u, p = u.pos, exit = F.castleExit;
  // 外の印へ戻した時、室内の階の高さを持ち越さない。
  goal.y = undefined;
  if (!exit.room && u.naka != null) {
    if (F.C.seat.naka.id + 1 === u.naka) exit.room = F.C.seat.naka;
    else for (const room of F.rooms) if (room.naka.id + 1 === u.naka) {
      exit.room = room.naka; break;
    }
    if (exit.room) {
      exit.through = false;
      // 入った時だけ用意し、上階からも実際の階段と間取りを通って戸口へ戻す。
      exit.guide = nakaGuide(exit.room, exit.room.doorIn);
    }
  }
  const I = exit.room;
  if (!I) return false;
  const dx = p.x - I.x, dz = p.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = (dx * I.s + dz * I.c) * I.door.side;
  // 出口の点を踏み越しても、戸口から地面へ出ていれば道案内へ戻す。
  // 壁の横や上階から外へ出た場合は、出口を通過した扱いにしない。
  const outsideDoor = exit.through && u.naka == null && lz > I.levels[0].d / 2
    && Math.abs(lx - I.door.lx) < I.door.w / 2 + 0.6
    && Math.abs(p.y - rt.world.heightAt(p.x, p.z)) < 0.8;
  if (outsideDoor || Math.hypot(p.x - I.doorOut.x, p.z - I.doorOut.z) < 0.65 && Math.abs(p.y - I.doorOut.y) < 0.8) {
    exit.room = null; return false;
  }
  if (!exit.through && Math.hypot(p.x - I.doorIn.x, p.z - I.doorIn.z) < 0.55 && Math.abs(p.y - I.doorIn.y) < 0.8) exit.through = true;
  if (exit.through) {
    goal.x = I.doorOut.x; goal.z = I.doorOut.z; goal.y = I.doorOut.y;
  } else {
    const q = exit.guide();
    if (!q) { exit.room = null; return false; }
    goal.x = q.x; goal.z = q.z; goal.y = q.y;
  }
  F.castleGuideArrived = false;
  return true;
}

// 退く先の支配と、そこまでの道を読む。調べる点は準備時の入れ物を使い回す。
function withdrawalOpen(rt, w) {
  if (rt.flags.SZ?.byId[w.to]?.owner === ZONE_STATE.FRIEND || !w.path.length) return false;
  const c = w.g.center(), a = w.probeA, b = w.probeB;
  let start = 0, best = Infinity;
  for (let i = 0; i < w.path.length; i++) {
    const p = w.path[i], d = Math.hypot(c.x - p[0], c.z - p[1]);
    if (d < best) { best = d; start = i; }
  }
  a.x = c.x; a.z = c.z; a.y = rt.world.heightAt(a.x, a.z);
  for (let i = start; i < w.path.length; i++) {
    const p = w.path[i], dx = p[0] - a.x, dz = p[1] - a.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 3));
    const ax = a.x, az = a.z;
    for (let k = 1; k <= n; k++) {
      b.x = ax + dx * k / n; b.z = az + dz * k / n; b.y = rt.world.heightAt(b.x, b.z);
      if (!rt.world.walkable(b.x, b.z) || rt.army.wallBetween(a, -1, b)) return false;
      for (const u of rt.army.units) if (u.alive && !u.isStruct && u.team !== w.g.team && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - b.x, u.pos.z - b.z) < 3 && Math.abs(u.pos.y - b.y) < 3) return false;
      a.x = b.x; a.y = b.y; a.z = b.z;
    }
  }
  w.start = start;
  return true;
}

// 麓から雄嶽まで約300m。道は分岐を含め最大勾配0.58の切り通しでつなぐ。
const LIFT = { x: 0, z: -242, tx: 0, tz: -60, w: 40, R: 150, rise: 250 };
function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 信貴山（北が高い）。kaito 10/3：比高約300m に近づける持ち上げ
  h += yamaLift(x, z, LIFT);
  h += 46 * gauss(x, z, 0, -110, 4200) + 10 * gauss(x, z, -60, -80, 2000) + 12 * gauss(x, z, 70, -120, 2400);
  // 南の雌嶽は雄嶽より低い山腹を持つ。峰を足しても道の勾配上限は共通の整地で保つ。
  h = Math.max(h, (LIFT.rise + 46 + 3 - 37) * gauss(x, z, MEDAKE.x, MEDAKE.z, 3600));
  // 生駒の山並み
  h += 30 * gauss(x, z, -200, -140, 10000);
  return h;
}
// 曲輪の段・土塁・切岸を、柵と同じ縄張りから読む。
// この攻め口だけ、門の先の柵の口も二列で抜けられる幅にする。
const ATTACK_PLAN = { ...SHIGISAN_PLAN,
  exactGapEdges: true, // 道と柵の実際の交点を使い、重なる口の間へ逆向きの板塀を残さない。
  continuousEdges: true, // 土の段は内外を同じ高さでつなぎ、縁に七歩の裂け目を作らない。
  terrainBanks: true, // 土塁は歩く地面に含める。別格子の薄い土の帯を重ね、切岸から浮かせない。
  sakamogiMaxRise: 1.1, // 逆茂木は緩い足場だけ。切岸をまたぐ長い伐り木にしない。
  lordSeat: { ...SHIGISAN_PLAN.lordSeat, floors: 2, b: 8, name: '山頂の小さな天守' },
  paths: SHIGISAN_PLAN.paths.map((p) => p.id === 'ote' ? { ...p, pts: ROAD } : p),
  kuruwa: SHIGISAN_PLAN.kuruwa.map((k) => ({ ...k, ...(k.gapW ? { gapW: 9 } : {}) })),
  koguchi: SHIGISAN_PLAN.koguchi.map((g) => ({ ...g, w: g.id === 'gate' ? 11.4 : 7.4 })),
};
const TERRAIN_EDGE = 20; // 曲輪の床は保ち、外の山肌へ二十歩でつなぐ。切岸の長い壁状の面を和らげる。
let TERRAIN = heightOf(ATTACK_PLAN, base, TERRAIN_EDGE);
let SUMMIT_CUT = 0;
// 道と曲輪を下げた分は周りの尾根にも反映する。元の山頂だけ残すと城が深い穴になる。
function groundCut(x, z) { return SUMMIT_CUT * yamaLift(x, z, LIFT) / LIFT.rise; }
// 堀の形は読み込み時に一度だけ作り、地形と城の区域で同じ寸法を使う。
const HORI_HEIGHTS = SHIGISAN_PLAN.hori.map((h) => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
const FLAT_PADS = [[GATE.x, GATE.z - 12, 15], [TEMPLE.x, TEMPLE.z, 14]];
// 標高読みの郭群の外に、左右の枝尾根へ小さな段を128連ねる。
// 調査の「120を超える曲輪」を示す推定の遠景。実兵・建物・当たりは増やさない。
// 一点につき段を一つだけ読む。全曲輪の多角形を毎回調べない。
const SIDE_TERRACES = Array.from({ length: 8 }, (_, row) => {
  const z = YASHIKI.z + row * 24, shift = Math.sin(row * 0.8) * 5;
  return { z, shift, levels: [-1, 1].map((side) => Array.from({ length: 8 }, (_, col) => base(side * (164 + col * 20 + shift), z) + 1)) };
});
function sideTerraceHeight(x, z, h) {
  const row = Math.round((z - YASHIKI.z) / 24);
  if (row < 0 || row >= SIDE_TERRACES.length) return h;
  const q = SIDE_TERRACES[row], col = Math.round((Math.abs(x) - 164 - q.shift) / 20);
  if (col < 0 || col >= 8) return h;
  const dx = Math.abs(Math.abs(x) - (164 + col * 20 + q.shift)), dz = Math.abs(z - q.z);
  const blend = Math.max(0, Math.min(1, (10 - dx) / 3, (12 - dz) / 3));
  const cx = (x < 0 ? -1 : 1) * (164 + col * 20 + q.shift);
  return h + (q.levels[x < 0 ? 0 : 1][col] - groundCut(cx, q.z) - h) * blend;
}
const DEM_RELIEF = { xy: 1, cx: 0, cz: 0, inner: 420, fade: 40, scale: 0.16, az: 0.8 };
function heightRaw(x, z) {
  let h = base(x, z) - groundCut(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  h = TERRAIN(x, z, h);
  // 門内の平場と、戦いの外の寺の境内も水平にする。
  for (const [cx, cz, r] of FLAT_PADS) {
    const t = Math.max(0, Math.min(1, (r + 3 - Math.hypot(x - cx, z - cz)) / 3));
    h += (roadProfile(cx, cz) - h) * t;
  }
  // 国土地理院の標高：城の外の遠い山肌にだけ、実際の起伏を足す（座標1は約1m。山肌も横を縮めない）
  if (sgDem) h += demRelief(sgDem, x, z, DEM_RELIEF);
  return sideTerraceHeight(x, z, h);
}

// 建物と戸口を共通室内に渡す。板壁と板葺きの簡素な建物で推定復元する。
const BUILDINGS = [
  { x: TOP.x + 10, z: TOP.z + 2, w: 7, d: 5, name: '本丸の番所', kind: 'bansho' },
  { x: -21, z: GATE.z - 5, w: 8, d: 4, name: '門の長屋', kind: 'nagaya' },
  { x: 16, z: GATE.z - 20, w: 6, d: 4, name: '門の兵糧蔵', kind: 'kura' },
  { x: RIDGE1.x + 9, z: RIDGE1.z, w: 4, d: 3, name: '北尾根の番所', kind: 'bansho' },
  { x: RIDGE2.x + 9, z: RIDGE2.z - 2, w: 4, d: 3, name: '上の曲輪の詰所', kind: 'bansho' },
  { x: YASHIKI.x, z: YASHIKI.z - 3, w: 11, d: 7, name: '松永屋敷の主殿', kind: 'goten' },
  { x: YASHIKI.x + 10, z: YASHIKI.z - 7, w: 5, d: 3.5, name: '屋敷の長屋', kind: 'nagaya' },
  { x: YASHIKI.x + 11, z: YASHIKI.z + 5, w: 4, d: 3, name: '屋敷の蔵', kind: 'kura' },
  { x: TEMPLE.x, z: TEMPLE.z, w: 9, d: 7, name: '朝護孫子寺の堂', kind: 'hondo' },
];
const ROOM_PATHS = [
  [[0, -98], [10, -98], [10, -104]], [[0, -66], [0, -68], [-21, -68], [-21, -67.5]],
  [[0, -66], [0, -72], [24, -72], [24, -80], [16, -80], [16, -82.5]],
  [[RIDGE1.x, RIDGE1.z + 4], [RIDGE1.x + 9, RIDGE1.z + 4], [RIDGE1.x + 9, RIDGE1.z + 3]],
  [[RIDGE2.x, RIDGE2.z + 2], [RIDGE2.x + 9, RIDGE2.z + 2], [RIDGE2.x + 9, RIDGE2.z + 1]],
  [[YASHIKI.x, YASHIKI.z + 7], [YASHIKI.x, YASHIKI.z + 2]],
  [[YASHIKI.x + 15, YASHIKI.z], [YASHIKI.x + 15, YASHIKI.z - 3], [YASHIKI.x + 10, YASHIKI.z - 3]],
  [[YASHIKI.x + 15, YASHIKI.z], [YASHIKI.x + 15, YASHIKI.z + 9], [YASHIKI.x + 11, YASHIKI.z + 9]],
  [[TEMPLE.x - TEMPLE.r, TEMPLE.z], [TEMPLE.x - 6, TEMPLE.z + 6], [TEMPLE.x, TEMPLE.z + 6]],
];
const WALK_LINES = [ROAD, TOWER_APPROACH, AMBUSH_APPROACH, ...ROUTES.slice(1).map((r) => r.pts), ...ROOM_PATHS];
// 民の道は城の道の整地計算から分ける。城の曲輪・戦う兵の足場を下げない。
let PEOPLE_LEVELS = null;
function peopleHeight(x, z, h) {
  if (x < 60 || x > 145 || z < 26 || z > 239) return h;
  if (!PEOPLE_LEVELS) {
    const nodes = new Map();
    PEOPLE_LEVELS = PEOPLE_ROADS.map((pts, line) => {
    const levels = pts.map(([px, pz]) => heightWithoutPeople(px, pz));
    // 既存の道との合流点は保ち、里へ下る道だけ勾配を抑える。
    for (let i = 1; !line && i < pts.length; i++) {
      const rise = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 0.5;
      levels[i] = Math.max(levels[i - 1] - rise, Math.min(levels[i - 1], levels[i]));
    }
    // 里の枝道は、先に作った下り道の合流点から逆向きに整える。
    if (line) {
      levels[pts.length - 1] = nodes.get(pts[pts.length - 1].join(','));
      for (let i = pts.length - 2; i >= 0; i--) {
        const rise = Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]) * 0.5;
        levels[i] = Math.max(levels[i + 1] - rise, Math.min(levels[i + 1] + rise, levels[i]));
      }
    }
    for (let i = 0; i < pts.length; i++) nodes.set(pts[i].join(','), levels[i]);
    return pts.slice(1).map((b, i) => ({ ax: pts[i][0], az: pts[i][1], dx: b[0] - pts[i][0], dz: b[1] - pts[i][1], h0: levels[i], h1: levels[i + 1] }));
    });
  }
  let best = Infinity, floor = h;
  for (const line of PEOPLE_LEVELS) for (const q of line) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / (q.dx * q.dx + q.dz * q.dz)));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; floor = q.h0 + (q.h1 - q.h0) * t; }
  }
  const t = Math.max(0, Math.min(1, (9 - best) / 4));
  return h + (floor - h) * t * t * (3 - 2 * t);
}
// 道の縦の高さは準備時だけ計算。曲輪間は坂でつなぎ、段の縁の急変を避ける。
const ROAD_LEVELS = SHIGISAN_PLAN.kuruwa.filter((k) => k.id !== 'medake').map((k) => {
  const x = k.poly.reduce((n, p) => n + p[0], 0) / k.poly.length, z = k.poly.reduce((n, p) => n + p[1], 0) / k.poly.length;
  return { id: k.id, poly: k.poly, offset: k.level(base) - SHIGISAN_PLAN.kuruwa.find((q) => q.id === 'shu').level(base), x, z, r: Math.max(...k.poly.map((p) => Math.hypot(p[0] - x, p[1] - z))), h: SHIGISAN_PLAN.kuruwa.find((q) => q.id === k.id).level(base) };
});
function roadLevel(x, z) {
  let best = Infinity, h = base(x, z);
  for (const q of ROAD_LEVELS) if (inPoly(q.poly, x, z)) return q.h;
  for (const q of ROAD_LEVELS) {
    const d = Math.hypot(x - q.x, z - q.z), score = d / q.r;
    if (d < Math.min(q.r, 20) + 3 && score < best) { best = score; h = q.h; }
  }
  if (best === Infinity && Math.hypot(x - GATE.x, z - GATE.z + 12) < 22) h = base(GATE.x, GATE.z - 12);
  if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 17) h = base(TEMPLE.x, TEMPLE.z);
  return h;
}
function makeRoadSegments() {
  const lines = WALK_LINES.flatMap((pts) => pts.slice(1).map((b, i) => {
    const a = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    return { ax: a[0], az: a[1], dx, dz, cuts: [0, 1] };
  }));
  // 分岐・交差点にも同じ高さを与え、別の道へ移る所に段差を作らない。
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j], den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-8) continue;
    const x = b.ax - a.ax, z = b.az - a.az;
    const t = (x * b.dz - z * b.dx) / den, u = (x * a.dz - z * a.dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
  }
  // 山腹で道の幅が重なる所にも高さの節を置く。交差しない近い道も谷底と尾根に分けない。
  for (const a of lines) for (const b of lines) {
    if (a === b) continue;
    for (const end of [0, 1]) {
      const x = a.ax + a.dx * end, z = a.az + a.dz * end;
      const t = Math.max(0, Math.min(1, ((x - b.ax) * b.dx + (z - b.az) * b.dz) / (b.dx * b.dx + b.dz * b.dz || 1)));
      if (Math.hypot(x - b.ax - b.dx * t, z - b.az - b.dz * t) < ROAD_HALF * 2) b.cuts.push(t);
    }
  }
  const segments = lines.flatMap((q) => {
    const cuts = [...new Set(q.cuts)].sort((a, b) => a - b);
    return cuts.slice(1).flatMap((t, i) => {
      const t0 = cuts[i], ax = q.ax + q.dx * t0, az = q.az + q.dz * t0;
      const dx = q.dx * (t - t0), dz = q.dz * (t - t0), l2 = dx * dx + dz * dz;
      return l2 < 1e-8 ? [] : [{ ax, az, dx, dz, l2, half: az + dz / 2 < GATE.z - 10 ? INNER_HALF : ROAD_HALF, h0: roadLevel(ax, az), h1: roadLevel(ax + dx, az + dz) }];
    });
  });
  const nodes = new Map();
  const node = (x, z, h) => {
    const key = x.toFixed(5) + ',' + z.toFixed(5);
    if (!nodes.has(key)) nodes.set(key, { x, z, h });
    return nodes.get(key);
  };
  for (const q of segments) { q.a = node(q.ax, q.az, q.h0); q.b = node(q.ax + q.dx, q.az + q.dz, q.h1); }
  const nearby = [], points = [...nodes.values()];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i], b = points[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < ROAD_HALF * 2) nearby.push({ a, b, rise: d * (a.z < GATE.z - 10 && b.z < GATE.z - 10 ? 0.14 : 0.2) });
  }
  const relax = () => {
    // 道の切り通しを造り、どの分岐も同じ床・勾配上限にそろえる。毎コマは行わない。
    for (let pass = 0; pass < nodes.size; pass++) {
      let changed = false;
      for (const q of segments) {
        // 城内の折り返しは描画格子の補間でも歩行上限を越えない余裕を残す。
        const rise = Math.sqrt(q.l2) * (q.half === INNER_HALF ? 0.38 : 0.58);
        if (q.a.h > q.b.h + rise + 1e-6) { q.a.h = q.b.h + rise; changed = true; }
        if (q.b.h > q.a.h + rise + 1e-6) { q.b.h = q.a.h + rise; changed = true; }
      }
      for (const q of nearby) {
        if (q.a.h > q.b.h + q.rise + 1e-6) { q.a.h = q.b.h + q.rise; changed = true; }
        if (q.b.h > q.a.h + q.rise + 1e-6) { q.b.h = q.a.h + q.rise; changed = true; }
      }
      if (!changed) break;
    }
  };
  relax();
  // 登城道の勾配から共通の基準高だけを下げ、測った平場同士の高低差は保つ。
  let summit = Infinity;
  for (const p of points) {
    p.pad = ROAD_LEVELS.find((q) => inPoly(q.poly, p.x, p.z));
    if (p.pad) summit = Math.min(summit, p.h - p.pad.offset);
  }
  for (const q of ROAD_LEVELS) q.h = summit + q.offset;
  for (const p of points) if (p.pad) p.h = p.pad.h;
  relax();
  for (const q of segments) { q.h0 = q.a.h; q.h1 = q.b.h; delete q.a; delete q.b; }
  return segments;
}
let ROAD_SEGMENTS = null;
// 切り通しで下がった道と曲輪の床をそろえる。元の床のままだと五十歩以上の崖が道の脇に残る。
function prepareRoadGround() {
  PEOPLE_LEVELS = null;
  // 標高素材が届いて再計算する時も、前回下げた床を出発点にしない。
  for (const q of ROAD_LEVELS) q.h = SHIGISAN_PLAN.kuruwa.find((k) => k.id === q.id).level(base);
  ROAD_SEGMENTS = makeRoadSegments();
  const summit = ROAD_LEVELS.find((q) => q.id === 'shu').h;
  SUMMIT_CUT = Math.max(0, base(TOP.x, TOP.z) + 3 - summit);
  for (const k of ATTACK_PLAN.kuruwa) {
    // 雌嶽も同じ基準高へ。雄嶽より三十七歩低い関係を保つ。
    if (k.id === 'medake') { k.level = summit - 37; continue; }
    const pad = ROAD_LEVELS.find((q) => q.id === k.id);
    if (!pad) continue;
    k.level = pad.h;
  }
  TERRAIN = heightOf(ATTACK_PLAN, base, TERRAIN_EDGE);
}
function roadProfile(x, z) {
  let best = Infinity, h = 0, total = 0, weight = 0;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t), floor = q.h0 + (q.h1 - q.h0) * t;
    if (d < best) { best = d; h = floor; }
    // 並走する別の高さの道で、中心線まで波打たせない。交点は同じ高さでなじむ。
    // 山肌へ戻す十五歩の範囲まで同じ重みを残す。四歩で打ち切ると、
    // まだ道の高さを混ぜる場所で最寄りの別の道へ切り替わり、壁や尖った峰になる。
    if (d < q.half + 15) { const w = Math.pow(1 - d / (q.half + 15), 2) / (d * d + 0.04); total += floor * w; weight += w; }
  }
  return weight > 0 ? total / weight : h;
}
function roadHeight(x, z) {
  if (!ROAD_SEGMENTS) prepareRoadGround();
  let blend = 0, shoulder = Infinity, foot = -Infinity;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    // 幅の違う道の境で、最寄りの一本が切り替わっても山肌の高さを跳ねさせない。
    blend = Math.max(blend, Math.max(0, Math.min(1, (q.half + 15 - d) / 12)));
    // 切り通しの脇も道から続く土の斜面にする。点ごとの最小値なので途中で崖へ跳ねない。
    const floor = q.h0 + (q.h1 - q.h0) * t;
    shoulder = Math.min(shoulder, floor + Math.max(0, d - q.half) * 0.85);
    // 盛った道の下にも山腹をつなぐ。削る側だけを制限すると、
    // 元の谷底へ十二歩で百歩落ちる薄い尾根や、尖った土の壁が残る。
    foot = Math.max(foot, floor - Math.max(0, d - q.half) * 0.85);
  }
  // 合流する道は同じ高さへなじませ、脇だけ土の斜面へ戻す。
  const f = blend * blend * (3 - 2 * blend);
  return Math.max(foot, Math.min(heightRaw(x, z), shoulder)) * (1 - f) + roadProfile(x, z) * f;
}
let ROOM_LEVELS = null;
let GATE_LEVELS = null;
function gateGround(h, x, z) {
  // 門の両側と物見櫓の足元を、登城道と同じ坂の平場にする。
  // 道だけを深く切ると、二歩先の守兵や柵の根元と十数メートル離れてしまう。
  // 西の帰り道（x=-30）まで門の高さで上書きすると、本丸へ戻る坂を塞ぐ。
  let gateBlend = Math.max(0, Math.min(1, (26 - Math.abs(x - GATE.x)) / 6,
    // 最後の折り返しへ広げると、道を横切る急斜面になる。門脇の土橋までに限る。
    (z - (GATE.z - 12)) / 6, ((GATE.z + 10) - z) / 6));
  if (gateBlend > 0) {
    // 門脇の整地で最後の折り返しを再び削らない。道幅の内側は計算済みの
    // 坂を保ち、外へ二歩で門脇の平場になじませる。足場は準備時だけ計算する。
    for (const q of ROAD_SEGMENTS) {
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
      gateBlend = Math.min(gateBlend, Math.max(0, Math.min(1, (d - q.half) / 2)));
    }
    if (gateBlend === 0) return h;
    if (!GATE_LEVELS) GATE_LEVELS = [roadHeight(GATE.x, GATE.z - 6), roadHeight(GATE.x, GATE.z + 6)];
    const t = (z - (GATE.z - 6)) / 12;
    const floor = GATE_LEVELS[0] + (GATE_LEVELS[1] - GATE_LEVELS[0]) * t;
    const k = gateBlend * gateBlend * (3 - 2 * gateBlend);
    h += (floor - h) * k;
  }
  return h;
}
function heightWithoutPeople(x, z) {
  let h = gateGround(roadHeight(x, z), x, z);
  if (!ROOM_LEVELS) ROOM_LEVELS = BUILDINGS.map((q) => {
    const z = q.z + q.d / 2 + 1.5;
    return gateGround(roadHeight(q.x, z), q.x, z);
  });
  for (let i = 0; i < BUILDINGS.length; i++) {
    const q = BUILDINGS[i];
    // 床下だけをならす。戸口の外は道の高さを保ち、共通室内の踏み段で床へつなぐ。
    if (z > q.z + q.d / 2 + 0.2) continue;
    const dx = Math.abs(x - q.x) - q.w / 2 - 0.2;
    const dz = z < q.z ? q.z - z - q.d / 2 - 0.2 : z - q.z - q.d / 2 - 1.5;
    // 戸口の前で整地を突然打ち切らず、最後の一歩で元の道へつなぐ。
    const front = Math.max(0, Math.min(1, (q.z + q.d / 2 + 0.2 - z) / 1.2));
    const t = Math.max(0, Math.min(1, 1 - Math.max(dx, dz) / 1.2)) * front;
    if (t > 0) h += (ROOM_LEVELS[i] - h) * t;
  }
  return h;
}
function height(x, z) { return peopleHeight(x, z, heightWithoutPeople(x, z)); }

// 材質・基本形は全棟で共有。外壁の戸口と共通室内の当たりを同じ幅にする。
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOM_MAT = new THREE.MeshLambertMaterial({ color: 0x594735, map: woodTex() });
// この城の板壁と板葺きは褪せた灰褐色。木目を重ねても夜に黒くつぶれない色にする。
// 雨に褪せた屋根・乾いた壁・地際の黒ずみを頂点色で分ける。
const ROOM_WORN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() });
// 信貴山の木戸だけ、反り・箱棟・懸魚を付けない直線の板葺きにする。
// 柱と通り幅は共通部品を使い、館の表門は控柱まで屋根を掛ける推定復元。
function boardGate(W, x, z, w, rot = 0, house = false) {
  const high = true;
  const gate = kabukimon(W, x, z, w, rot, high ? { doors: false, roof: false, yakui: house } : { doors: false });
  // 木戸には室内番号がない。梁の下や柱際の視点も、この門だけの透かしに含める。
  gate.userData.sgView = { gate: true, x, z, c: Math.cos(rot), s: Math.sin(rot),
    levels: [{ w: w + 1.6, d: house ? 6 : 3.5, y: W.heightAt(x, z), h: 5 }] };
  gate.userData.noMerge = true;
  if (!high) return gate;
  const parts = [], details = [], half = house ? 2.1 : 1.35, pitch = house ? .38 : .32, offset = house ? -.8 : 0, eave = 3.65;
  let detail = false;
  const box = (px, py, pz, bw, bh, bd, tilt = 0, tone = 0x887b67) => {
    const g = ROOM_BOX.clone().scale(bw, bh, bd), color = new THREE.Color(tone);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateX(tilt); g.translate(px, py, pz); (detail ? details : parts).push(g);
  };
  for (const side of [-1, 1]) {
    const cy = eave + half * Math.tan(pitch) / 2;
    box(0, cy, offset + side * half / 2, w + 1.4, .1, half / Math.cos(pitch), side * pitch, 0x969183);
    // 棟から軒へ流れる古板と差し替え板。細部は近くの木戸だけに残す。
    detail = true;
    const count = Math.ceil((w + 1.4) / .55), step = (w + 1.4) / count;
    for (let i = 0; i < count; i++) box(-(w + 1.4) / 2 + (i + .5) * step,
      cy + .065 + i % 3 * .008, offset + side * half / 2,
      step - .012, .035, half / Math.cos(pitch), side * pitch,
      (i + (side > 0 ? 2 : 0)) % 7 === 0 ? 0x8a7358 : i % 3 === 0 ? 0x62665a : 0x7c7768);
    detail = false;
    // 葺き段と横の押さえ木は少数の長い板で表す。
    for (const t of [.28, .66, 1]) box(0, eave + half * (1 - t) * Math.tan(pitch) + .08,
      offset + side * half * t, w + 1.5, .07, .1);
  }
  box(0, eave + half * Math.tan(pitch) + .09, offset, w + 1.6, .12, .24);
  const roof = new THREE.Mesh(mergeGeometries(parts), ROOM_WORN_MAT);
  for (const g of parts) g.dispose();
  roof.castShadow = roof.receiveShadow = true; roof.userData.camBlock = true; gate.add(roof);
  gate.add(gateRoofFrame(w, { eave, half, rise: half * Math.tan(pitch), offset }));
  const lod = new THREE.LOD(), boards = new THREE.Mesh(mergeGeometries(details), ROOM_WORN_MAT);
  boards.receiveShadow = true; boards.userData.camNear = true;
  lod.addLevel(boards, 0); lod.addLevel(new THREE.Group(), 65); gate.add(lod);
  for (const g of details) g.dispose();
  return gate;
}
// 家臣の小屋を曲輪ごとの屋敷に見せる細い木柵。正面中央の六歩は開ける。
// 遠景は小屋と幟を残し、細い格子は省く。当たりや守兵は足さない。
const FENCE_POLE = new THREE.CylinderGeometry(.5, .6, 1, 5);
function branchFence(rt, x, z) {
  const parts = [], W = rt.world, y = W.heightAt(x, z);
  const box = (px, py, pz, w, h, d, rot = 0, pole = false, tone = 0x625d4e) => {
    const g = (pole ? FENCE_POLE : ROOM_BOX).clone().scale(w, h, d);
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), color = new THREE.Color(tone);
    const ground = W.heightAt(x + px, z + pz) - y;
    // 地際は湿った暗色、上は日に褪せた灰褐色。共通の木材は染め直さない。
    for (let i = 0; i < p.count; i++) {
      const f = 1 - Math.max(0, 1 - (py + p.getY(i) - ground) / .55) * .28;
      colors[i * 3] = color.r * f; colors[i * 3 + 1] = color.g * f; colors[i * 3 + 2] = color.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateY(rot); g.translate(px, py, pz); parts.push(g);
  };
  for (const [ax, az, bx, bz] of [[-11, -5.5, 11, -5.5], [-11, -5.5, -11, 5], [11, -5.5, 11, 5], [-11, 5, -3, 5], [3, 5, 11, 5]]) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len / .55);
    for (let i = 0; i <= n; i++) {
      const px = ax + dx * i / n, pz = az + dz * i / n, ground = W.heightAt(x + px, z + pz) - y;
      const width = .09 + i % 3 * .012;
      box(px, ground + .68, pz, width, 1.46 + (i % 5) * .035, width, i * .7, true,
        i % 7 === 0 ? 0x82735b : i % 3 === 0 ? 0x555b4c : 0x696657);
      // 要所の支柱に二段の縄掛け。輪を細分せず、角を回す短い帯で示す。
      if (i % 4 === 0) for (const h of [.4, 1.15]) box(px, ground + h, pz, .16, .065, .17, 0, false, 0x8c7d61);
    }
    // 短い横木を地面に沿わせ、段の縁で宙に浮く一本の材にしない。
    for (let i = 0; i < Math.ceil(len / 2); i++) {
      const count = Math.ceil(len / 2), t = (i + .5) / count, px = ax + dx * t, pz = az + dz * t;
      const ground = W.heightAt(x + px, z + pz) - y;
      for (const h of [.4, 1.15]) box(px, ground + h, pz, len / count + .08, .08, .1, Math.atan2(-dz, dx));
    }
  }
  const near = new THREE.Mesh(mergeGeometries(parts), ROOM_WORN_MAT), lod = new THREE.LOD();
  for (const g of parts) g.dispose();
  near.receiveShadow = true; lod.position.set(x, y, z);
  lod.addLevel(near, 0); lod.addLevel(new THREE.Group(), 110); rt.scene.add(lod);
}
// 道脇の自然石は灰色の石肌を使う。
const STEP_MAT = new THREE.MeshLambertMaterial({ color: 0x7a7266, map: stoneTex() });
const ROOF_STONE = new THREE.IcosahedronGeometry(1, 0);
// 石段の踏面と石積みの側面は、他の城の石垣の目地・濃淡を使い回す。
// 共通材質の色は変えず、この夜の石だけ土に近い暗い灰茶にする。
let STAIR_MAT = null;
function stairMaterial() {
  if (STAIR_MAT) return STAIR_MAT;
  STAIR_MAT = castleStoneMat('warishi').clone();
  STAIR_MAT.vertexColors = false;
  STAIR_MAT.color.setHex(0x625d51);
  // 各段の実寸で目地を貼る。高い側面も絵を引き伸ばさず、段ごとに貼る位置をずらす。
  STAIR_MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 sgSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 sgFace = abs(normal.x) > 0.5 ? sgSize.zy : (abs(normal.y) > 0.5 ? sgSize.xz : sgSize.xy);
        vec2 sgUV = uv * sgFace / 2.2 + instanceMatrix[3].xz / 2.2;
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(sgUV, 1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(sgUV, 1.0)).xy;
        #endif
      #endif`);
  };
  STAIR_MAT.customProgramCacheKey = () => '信貴山の石段';
  return STAIR_MAT;
}
// 基本形は一つ。目地の大きさは段の実寸から材質側でそろえる。
const STAIR_BOX = ROOM_BOX.clone();
// 岩は崩れた石垣ではなく山肌の自然石。道の合流・戸口・曲輪の戦う平場には置かない。
function stoneSpace(x, z, flat = false) {
  // 急な切岸へ小石を刺すと、底の黒い面だけが土から突き出す。
  // 道の整地は変えず、露頭を置く足場だけ準備時に選ぶ。
  if (flat) {
    const h = height(x, z);
    if (Math.max(Math.abs(height(x + 1, z) - h), Math.abs(height(x - 1, z) - h),
      Math.abs(height(x, z + 1) - h), Math.abs(height(x, z - 1) - h)) > 0.7) return false;
  }
  if (ROAD_LEVELS.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 3)) return false;
  if (BUILDINGS.some((q) => Math.abs(x - q.x) < q.w / 2 + 3 && Math.abs(z - q.z) < q.d / 2 + 3)) return false;
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 6) return false;
  for (const line of WALK_LINES) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < ROAD_HALF + 2) return false;
  }
  return true;
}
// 平蜘蛛の釜と天守が爆ぜる（のちの伝えを絵にする）：望楼の上の階に火の玉・閃き・黒煙・飛び散る板と瓦。
// 形と材質は一度だけ作り、破片は一つの InstancedMesh で動かす（毎コマ new しない）。
const KEEP_AT = { x: TOP.x - 2, z: TOP.z - 8, up: 5.3 };
let BLAST_KIT = null;
function blastKit() {
  if (BLAST_KIT) return BLAST_KIT;
  // 縁のぼけた丸をキャンバスに一度だけ描き、火の玉と煙の板に使い回す
  const soft = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const glow = soft([[0, 'rgba(255,255,225,1)'], [0.15, 'rgba(255,235,145,0.9)'], [0.38, 'rgba(255,165,55,0.5)'], [0.65, 'rgba(255,130,35,0.12)'], [0.88, 'rgba(255,130,35,0)'], [1, 'rgba(255,130,35,0)']]);
  const puff = soft([[0, 'rgba(40,34,30,0.95)'], [0.55, 'rgba(32,28,25,0.6)'], [1, 'rgba(25,22,20,0)']]);
  const add = { map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
  BLAST_KIT = {
    fireMat: new THREE.SpriteMaterial({ color: 0xffffff, opacity: 0.7, ...add }),
    coreMat: new THREE.SpriteMaterial({ color: 0xffffff, opacity: 1, ...add }),
    smokeMat: new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    chip: new THREE.BoxGeometry(1, 1, 1),
    chipMat: new THREE.MeshLambertMaterial({ color: 0x3a2a1c }),
    emberMat: new THREE.MeshBasicMaterial({ color: 0xff9a40, fog: false }),
  };
  return BLAST_KIT;
}
function keepBlast(rt) {
  const F = rt.flags, W = rt.world, K = blastKit();
  if (F.blast) return;
  const x = KEEP_AT.x, z = KEEP_AT.z, y = W.heightAt(x, z) + KEEP_AT.up;
  const root = new THREE.Group();
  // 上の階の幅（3.8）ほどの炎を、小さな玉五つで作る。ずれと膨らみで丸い板の輪郭を残さない。
  const flames = [], core = new THREE.Sprite(K.coreMat.clone());
  const lobes = [[0, 0.2, 0, 3], [-0.65, 0.55, 0.2, 2.5], [0.7, 0.35, -0.25, 2.6], [-0.15, 1, -0.6, 2.3], [0.3, -0.4, 0.6, 2.4]];
  for (const [dx, dy, dz, size] of lobes) {
    const m = new THREE.Sprite(K.fireMat.clone());
    m.position.set(x + dx, y + dy, z + dz); m.scale.setScalar(size);
    flames.push({ m, dx, dy, dz, size }); root.add(m);
  }
  core.position.set(x, y + 0.2, z);
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Sprite(K.smokeMat.clone());
    p.position.set(x + (Math.random() - 0.5) * 2, y + 0.5, z + (Math.random() - 0.5) * 2); p.scale.setScalar(0.1);
    puffs.push({ m: p, vx: (Math.random() - 0.5) * 1.6, vy: 2.2 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.6, s: 2.2 + Math.random() * 1.6 });
    root.add(p);
  }
  // 板・瓦の破片（暗い木）と火の粉（光る）
  const N = 36, E = 18;
  const chips = new THREE.InstancedMesh(K.chip, K.chipMat, N), embers = new THREE.InstancedMesh(K.chip, K.emberMat, E);
  chips.frustumCulled = embers.frustumCulled = false;
  const bits = [];
  for (let i = 0; i < N + E; i++) {
    const a = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.9, sp = (i < N ? 7 : 10) + Math.random() * 9;
    bits.push({ x, y: y + (Math.random() - 0.3), z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * up + 3, vz: Math.sin(a) * sp * (1 - up * 0.5),
      rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14,
      sx: i < N ? 0.25 + Math.random() * 0.6 : 0.12, sy: i < N ? 0.05 + Math.random() * 0.08 : 0.12, sz: i < N ? 0.2 + Math.random() * 0.35 : 0.12, rest: false });
  }
  root.add(core, chips, embers);
  rt.scene.add(root);
  const B = F.blast = { t: 0, root, flames, core, puffs, chips, embers, bits, N, E, x, y, z };
  const o3 = new THREE.Object3D();
  const step = () => {
    const dt = 0.033;
    B.t += dt;
    const t = B.t;
    // 小さな炎が広がりながら薄れ、一秒以内に黒煙へ移る。白黄の芯は短い閃きだけ。
    const spread = 1 - Math.exp(-t * 5), fadeFire = Math.max(0, 1 - t / 0.95);
    for (const f of flames) {
      f.m.scale.setScalar(f.size * (1 + spread * 0.45));
      f.m.position.set(x + f.dx * (1 + spread), y + f.dy * (1 + spread * 0.7) + t * 0.9, z + f.dz * (1 + spread));
      f.m.material.opacity = 0.7 * fadeFire * fadeFire;
      f.m.visible = f.m.material.opacity > 0.01;
    }
    core.scale.setScalar(1.8 + spread * 0.7); core.material.opacity = Math.max(0, 1 - t / 0.35);
    core.visible = core.material.opacity > 0.01;
    for (const p of puffs) {
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.vy *= 0.985;
      p.m.scale.setScalar(Math.min(p.s * 3, 0.5 + t * p.s * 1.4));
      p.m.material.opacity = Math.max(0, 0.85 * Math.min(1, t / 0.65) * (1 - t / 9));
    }
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      if (!b.rest) {
        b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.wx * dt; b.ry += b.wy * dt;
        const g = W.heightAt(b.x, b.z) + 0.04;
        if (b.y < g) { b.y = g; b.rest = true; }
      }
      o3.position.set(b.x, b.y, b.z); o3.rotation.set(b.rest ? 0 : b.rx, b.ry, 0);
      const fade = i >= N ? Math.max(0.001, 1 - t / 2.6) : 1;
      o3.scale.set(b.sx * fade, b.sy * fade, b.sz * fade); o3.updateMatrix();
      (i < N ? chips : embers).setMatrixAt(i < N ? i : i - N, o3.matrix);
    }
    chips.instanceMatrix.needsUpdate = true; embers.instanceMatrix.needsUpdate = true;
    if (t < 10) rt.after(dt, step);
    else { for (const p of puffs) root.remove(p.m); for (const f of flames) root.remove(f.m); root.remove(core, embers); }
  };
  step();
  // 上の階が燃え続ける。黒煙の柱を二本
  F.keepFire = W.addFire(x, z, { size: 2.2, h: KEEP_AT.up - 0.6, blackSmoke: true });
  W.addSmokeColumn(x, y + 2, z, { size: 2.6, black: true });
  W.addSmokeColumn(x + 1.5, y + 1, z - 1, { size: 2, black: true });
  if (rt.army) rt.army.playFar('tenshuBlast', { x, y, z }, 1); else sfx('tenshuBlast', 1);
  rt.player?.addShake?.(0.4);
}

function boardRoom(rt, q) {
  const y = rt.world.heightAt(q.x, q.z), parts = [], details = [], stones = [], H = 2.6, high = true;
  const lattice = high && ['goten', 'nagaya', 'bansho'].includes(q.kind), windowW = Math.min(1.4, q.d - 1);
  let detail = false;
  const tint = (g, hex, yy, wall = false) => {
    if (!high) return;
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color(hex);
    const seed = Math.sin(q.x * 3.1 + q.z * 1.7) * .035;
    for (let i = 0; i < p.count; i++) {
      const damp = wall ? Math.max(0, 1 - (yy + p.getY(i)) / .85) * .3 : 0;
      const f = 1 + seed - damp;
      colors[i * 3] = c.r * f; colors[i * 3 + 1] = c.g * f; colors[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const box = (x, yy, z, w, h, d, rot = 0, tone = null) => {
    const g = ROOM_BOX.clone().scale(w, h, d), uv = g.attributes.uv, normal = g.attributes.normal;
    // 床も壁も木目を同じ大きさで貼り、広い板を引き伸ばした平面にしない。
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(normal.getX(i)) > 0.5, top = Math.abs(normal.getY(i)) > 0.5;
      const u = uv.getX(i), v = uv.getY(i);
      // 板葺きの木目は棟から軒へ。壁の縦板とは向きを変える。
      if (high && tone && top) uv.setXY(i, v * d / 3, u * w / 3);
      else uv.setXY(i, u * (side ? d : w) / 3, v * (top ? d : h) / 3);
    }
    tint(g, tone ?? 0x9a8b76, yy, tone === null);
    g.rotateX(rot); g.translate(q.x + x, y + yy, q.z + z); (detail ? details : parts).push(g);
  };
  // 板屋根は軒から棟まで壁の上へ載せ、妻をふさぐ。細い押縁だけ遠景で省く。
  const roof = (w, d, eave, pitch) => {
    const half = (d + 1.2) / 2, cy = eave + half * Math.tan(pitch) / 2 + .08;
    for (const side of [-1, 1]) box(0, cy, side * half / 2, w + 1.2, .1, half / Math.cos(pitch), side * pitch, 0x8b897c);
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, d / 2 * Math.tan(pitch)); shape.closePath();
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false, steps: 1, curveSegments: 1 });
      // 箱と同じ索引付きの形へそろえてから結合する。
      g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
      tint(g, 0x9a8b76, eave);
      g.rotateY(Math.PI / 2); g.translate(q.x + side * w / 2 - .07, y + eave + .08 + .6 * Math.tan(pitch), q.z); parts.push(g);
    }
    box(0, eave + half * Math.tan(pitch) + .16, 0, w + 1.4, .14, .18, 0, 0x514c40);
    detail = true;
    for (const side of [-1, 1]) {
      // 薄板を軒から棟へ重ねた葺き段。遠くは下の一枚屋根だけに戻す。
      const rows = Math.ceil(half / .5), step = half / rows;
      for (let i = 0; i < rows; i++) {
        const t = (i + .5) / rows;
        box(0, eave + half * (1 - t) * Math.tan(pitch) + .14,
          side * half * t, w + 1.2, .045, (step + .07) / Math.cos(pitch), side * pitch,
          i === rows - 1 ? 0x555a4b : i % 3 === 1 ? 0x827565 : 0x969183);
      }
      for (let x = -w / 2; x <= w / 2; x += .65) box(x, cy + .105, side * half / 2, .035, .035, half / Math.cos(pitch), side * pitch);
      for (const t of [.35, .78]) {
        const yy = eave + half * (1 - t) * Math.tan(pitch) + .23;
        box(0, yy, side * half * t, w + 1.3, .09, .1);
        // 押さえ木に沿う少数の平たい自然石。屋根の左右で間隔と大きさをずらす。
        for (const sx of [-1, 1]) stones.push([sx * w * .28 + side * .12, yy + .12,
          side * half * t, .18 + t * .08, .1, .15 + (sx === side ? .05 : 0)]);
      }
    }
    detail = false;
  };
  box(0, high ? .24 : .15, 0, q.w, high ? .12 : .3, q.d);
  // 描画格子の斜面は建物の途中も横切る。四辺とも二歩以内の間隔で束を下ろし、
  // 長屋の端や側面を空中へ張り出させない。既存の木材へ結合し、描画回数は増やさない。
  const support = (x, z) => {
    const bottom = rt.world.heightAt(q.x + x, q.z + z) - y - .12, top = .18;
    if (bottom < top) box(x, (bottom + top) / 2, z, .32, top - bottom, .32, 0, high ? 0x4c493d : null);
  };
  const halfW = q.w / 2 - .25, halfD = q.d / 2 - .25;
  const across = Math.max(1, Math.ceil(halfW * 2 / 1.5)), along = Math.max(1, Math.ceil(halfD * 2 / 1.5));
  for (const side of [-1, 1]) {
    for (let i = 0; i <= across; i++) support(-halfW + halfW * 2 * i / across, side * halfD);
    for (let i = 1; i < along; i++) support(side * halfW, -halfD + halfD * 2 * i / along);
  }
  box(0, H / 2 + 0.2, -q.d / 2, q.w, H, 0.14);
  for (const side of [-1, 1]) {
    if (lattice) {
      // 写真の屋敷の格子窓。板壁自体を割り、暗い窓の絵を貼るだけにしない。
      for (const [a, b, low, top] of facePanels(q.d, H, [{ t0: -windowW / 2, t1: windowW / 2, y0: .9, y1: 1.9 }])) {
        box(side * q.w / 2, .2 + (low + top) / 2, (a + b) / 2, .14, top - low, b - a);
      }
      for (const yy of [1.08, 2.12]) box(side * (q.w / 2 + .08), yy, 0, .12, .1, windowW + .2);
      for (let i = 0; i <= 6; i++) box(side * (q.w / 2 + .08), 1.6, -windowW / 2 + windowW * i / 6, .08, 1, .045);
      // 上へ跳ね上げた板戸と支え。軒下に収まり、歩く当たりは増やさない。
      box(side * (q.w / 2 + .32), 2.22, 0, .65, .07, windowW + .15, 0, 0x8b897c);
    } else box(side * q.w / 2, H / 2 + 0.2, 0, 0.14, H, q.d);
    box(side * (q.w + 1.6) / 4, H / 2 + 0.2, q.d / 2, (q.w - 1.6) / 2, H, 0.14);
    if (q.keep && !high) {
      for (const sx of [-1, 1]) box(sx * (q.w + 5.4) / 4, H + 0.45, side * (q.d + 1.2) / 4, (q.w - 3) / 2, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3, high ? 0x8b897c : null);
      box(0, H + 0.15, side * (q.d + 4.6) / 4, 4.2, 0.1, (q.d - 2.2) / (2 * Math.cos(0.3)), side * 0.3, high ? 0x8b897c : null);
    } else if (!high) box(0, H + 0.45, side * (q.d + 1.2) / 4, q.w + 1.2, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  if (high && !q.keep) roof(q.w, q.d, H + .2, q.kind === 'hondo' ? .45 : .32);
  if (high && q.keep) {
    // 望楼の下屋は上階の四面へ取り付く寄棟。分かれた長方形の屋根の間に隙間を残さない。
    // 形が確定していない天守の推定。外周・床・戸口は動かさず、屋根だけをつなぐ。
    const outer = [[-q.w / 2 - .6, -q.d / 2 - .6], [q.w / 2 + .6, -q.d / 2 - .6],
      [q.w / 2 + .6, q.d / 2 + .6], [-q.w / 2 - .6, q.d / 2 + .6]];
    const inner = [[-1.9, -1.6], [1.9, -1.6], [1.9, 1.6], [-1.9, 1.6]];
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4, a = outer[side], b = outer[next], c = inner[next], d = inner[side];
      const p = [a[0], 2.9, a[1], b[0], 2.9, b[1], c[0], 4.14, c[1], d[0], 4.14, d[1]];
      const g = new THREE.BufferGeometry();
      // 厚みのある四枚の台形を同じ隅棟で合わせ、上階の板壁へ差し込む。
      g.setAttribute('position', new THREE.Float32BufferAttribute([...p, ...p.map((v, i) => i % 3 === 1 ? v - .1 : v)], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: 8 }, (_, i) => {
        const k = i % 4; return [p[k * 3] / 3, p[k * 3 + 2] / 3];
      }).flat(), 2));
      g.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
      g.computeVertexNormals(); tint(g, side % 2 ? 0x969183 : 0x8b897c, 0);
      g.translate(q.x, y, q.z); parts.push(g);
      // 葺き段と押さえ木は台形の幅へ縮め、隅棟から隣の屋根へ突き抜けない。
      detail = true;
      const cross = side % 2 === 1;
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const topSpan = Math.hypot(c[0] - d[0], c[1] - d[1]);
      const run = Math.hypot((a[0] + b[0] - c[0] - d[0]) / 2, (a[1] + b[1] - c[1] - d[1]) / 2);
      const pitch = Math.atan2(1.24, run) * (side === 0 || side === 3 ? -1 : 1);
      for (const t of [.2, .4, .6, .8]) {
        const xx = (a[0] + b[0]) / 2 * (1 - t) + (c[0] + d[0]) / 2 * t;
        const zz = (a[1] + b[1]) / 2 * (1 - t) + (c[1] + d[1]) / 2 * t;
        const length = span * (1 - t) + topSpan * t;
        const rail = ROOM_BOX.clone().scale(length, .055, .09);
        rail.rotateX(pitch); if (cross) rail.rotateY(Math.PI / 2);
        tint(rail, t === .4 || t === .8 ? 0x514c40 : 0x827565, 0);
        rail.translate(q.x + xx, y + 2.97 + 1.24 * t, q.z + zz); details.push(rail);
        if (t === .4 || t === .8) for (const sx of [-1, 1]) stones.push([
          xx + (cross ? 0 : sx * length * .27), 3.1 + 1.24 * t,
          zz + (cross ? sx * length * .27 : 0), .24, .11, .19]);
      }
      detail = false;
    }
  }
  box(0, 2.6, q.d / 2, 1.6, 0.4, 0.14);
  // 隅柱・戸口の柱・貫と屋根の押さえ木（大和の板葺き小屋として推定）。
  for (const x of [-q.w / 2, q.w / 2, -0.8, 0.8]) box(x, H / 2 + 0.2, q.d / 2, 0.16, H, 0.2);
  for (const side of [-1, 1]) {
    if (lattice) {
      for (const end of [-1, 1]) box(side * q.w / 2, 1.45, end * (q.d + windowW) / 4, .2, .12, (q.d - windowW) / 2);
    } else box(side * q.w / 2, 1.45, 0, 0.2, 0.12, q.d);
    if (!high) for (const x of [-q.w / 3, 0, q.w / 3]) box(x, H + 0.52, side * (q.d + 1.2) / 4, 0.1, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  if (high) {
    detail = true;
    for (let x = -q.w / 2 + .4; x < q.w / 2; x += .55) {
      box(x, 1.5, -q.d / 2 - .08, .045, H - .1, .045);
      if (Math.abs(x) > .95) box(x, 1.5, q.d / 2 + .08, .045, H - .1, .045);
    }
    for (const side of [-1, 1]) for (let z = -q.d / 2 + .4; z < q.d / 2; z += .55) {
      if (lattice && Math.abs(z) < windowW / 2 + .08) continue;
      box(side * (q.w / 2 + .08), 1.5, z, .045, H - .1, .045);
    }
    // 細い板の押縁と、屋敷を支える太い柱・足固め・桁を分ける。
    // 春日山の長屋のような軸組。格子窓と中央の戸口には材を渡さない。
    const wallBays = Math.ceil(q.w / 1.8);
    for (let i = 0; i <= wallBays; i++) {
      const px = -q.w / 2 + q.w * i / wallBays;
      box(px, 1.5, -q.d / 2 - .1, .14, H, .16, 0, 0x514b3e);
      if (Math.abs(px) > 1) box(px, 1.5, q.d / 2 + .1, .14, H, .16, 0, 0x514b3e);
    }
    for (const yy of [.4, 2.7]) {
      box(0, yy, -q.d / 2 - .1, q.w + .2, .15, .16, 0, 0x514b3e);
      for (const side of [-1, 1]) {
        box(side * (q.w + 1.6) / 4, yy, q.d / 2 + .1, (q.w - 1.6) / 2, .15, .16, 0, 0x514b3e);
        box(side * (q.w / 2 + .1), yy, 0, .16, .15, q.d, 0, 0x514b3e);
      }
    }
    const sideBays = Math.ceil(q.d / 1.8);
    for (const side of [-1, 1]) for (let i = 0; i <= sideBays; i++) {
      const pz = -q.d / 2 + q.d * i / sideBays;
      if (lattice && Math.abs(pz) < windowW / 2 + .12) continue;
      box(side * (q.w / 2 + .1), 1.5, pz, .16, H, .14, 0, 0x514b3e);
    }
    detail = false;
    // 主殿と番所に柱で支える庇。戸口と通り道の中央は空ける。
    if (['goten', 'bansho', 'nagaya'].includes(q.kind)) {
      box(0, 2.25, q.d / 2 + .65, q.w + .5, .09, 1.5, .18, 0x8b897c);
      // 長い庇を両端だけで飛ばさず、写真の長屋のように二間弱ごとに受ける。
      // 正面中央の二歩は戸口と参入路に残す。柱は既存の縁板の端に収める。
      const bays = Math.max(1, Math.ceil((q.w - .5) / 2));
      for (let i = 0; i <= bays; i++) {
        const px = -(q.w / 2 - .25) + (q.w - .5) * i / bays;
        if (Math.abs(px) < 1) continue;
        box(px, 1.1, q.d / 2 + 1.25, .12, 2.2, .12);
        detail = true;
        box(px, 1.88, q.d / 2 + .94, .09, .1, .85, .65, 0x625643);
        detail = false;
      }
      box(0, 2.08, q.d / 2 + 1.25, q.w - .25, .14, .16, 0, 0x514b3e);
      // 庇の下の縁板と束。戸口中央と室内への踏み込みは空ける。
      detail = true;
      // 一枚の灰色の庇を、棟側から軒へ流す薄い板と褪せの違いで割る。
      // 下地は遠景に残し、近くの葺き板だけ既存の細部と一緒に結合する。
      const canopyBoards = Math.ceil((q.w + .5) / .4), canopyStep = (q.w + .5) / canopyBoards;
      for (let i = 0; i < canopyBoards; i++) {
        box(-(q.w + .5) / 2 + (i + .5) * canopyStep, 2.31 + i % 3 * .006,
          q.d / 2 + .65, canopyStep - .012, .035, 1.5, .18,
          i % 7 === 2 ? 0x8a7358 : i % 3 === 0 ? 0x62665a : 0x7c7768);
      }
      for (const side of [-1, 1]) box(side * (q.w / 2 + .25), 2.26,
        q.d / 2 + .65, .09, .13, 1.56, .18, 0x514b3e);
      // 写真の庇は細い垂木を並べ、端の柱を斜めの控えで桁へつなぐ。
      for (let x = -q.w / 2; x <= q.w / 2 + .01; x += .6) {
        box(x, 2.16, q.d / 2 + .65, .065, .1, 1.55, .18, 0x514b3e);
      }
      for (const side of [-1, 1]) {
        box(side * (q.w + 1.8) / 4, .23, q.d / 2 + .55, (q.w - 1.8) / 2, .12, .9);
        box(side * (q.w / 2 - .25), .08, q.d / 2 + .85, .18, .24, .18);
      }
      detail = false;
    }
  }
  const levels = [{ y: y + 0.3, w: q.w - 0.14, d: q.d - 0.14, h: H }];
  if (q.keep) {
    // 広い下屋の上に小さな望楼。白壁・石垣の台・鯱・層塔は付けない。
    const w = 3.8, d = 3.2, floor = 4.1, h = 2.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * w / 2, floor / 2, sz * d / 2, 0.16, floor, 0.16);
    for (const side of [-1, 1]) {
      if (high) {
        // 望楼の四面に実際の窓を空け、板の箱の姿を崩す。
        for (const [bottom, tall] of [[0, .9], [1.9, .5]]) {
          box(0, floor + bottom + tall / 2, side * d / 2, w, tall, .14);
          box(side * w / 2, floor + bottom + tall / 2, 0, .14, tall, d);
        }
        for (const end of [-1, 1]) {
          box(end * (w / 2 - .35), floor + 1.4, side * d / 2, .7, 1, .14);
          box(side * w / 2, floor + 1.4, end * (d / 2 - .35), .14, 1, .7);
        }
      } else {
        box(0, floor + h / 2, side * d / 2, w, h, .14);
        box(side * w / 2, floor + h / 2, 0, .14, h, d);
        box(0, floor + h + .45, side * (d + 1.2) / 4, w + 1.2, .12, (d + 1.2) / (2 * Math.cos(.38)), side * .38);
      }
      box(0, floor + 0.8, side * (d + 0.8) / 2, w + 1, 0.1, 0.1);
      box(side * (w + 0.8) / 2, floor + 0.8, 0, 0.1, 0.1, d + 1);
    }
    if (high) roof(w, d, floor + h, .38);
    levels.push({ y: y + floor + 0.08, w: w - 0.14, d: d - 0.14, h });
  }
  const naka = addInterior(rt.world, { ...q, team: 1,
    wins: () => lattice ? [-1, 1].map((s) => ({ face: 'x', s, t: 0, w: windowW, y0: .8, y1: 1.8 })) : [],
    levels, door: { side: 1, lx: 0, w: 1.4 }, approach: { pad: 0.35, len: 1.2 }, oku: 0 });
  if (q.keep) for (const [x0, x1, z0, z1] of naka.levels[1].pieces) box((x0 + x1) / 2, levels[1].y - y - 0.08, (z0 + z1) / 2, x1 - x0, 0.16, z1 - z0);
  const roomMat = high ? ROOM_WORN_MAT : ROOM_MAT;
  const mesh = new THREE.Mesh(mergeGeometries(parts), roomMat); mesh.castShadow = true; mesh.receiveShadow = true;
  // 自作の板壁・屋根も視点を止める。外を歩く本人の背後へ壁が入り込むのを防ぐ。
  mesh.userData.camBlock = true; mesh.userData.naka = naka; rt.scene.add(mesh);
  if (details.length) {
    const geo = mergeGeometries(details); geo.translate(-q.x, -y, -q.z);
    const lod = new THREE.LOD(), near = new THREE.Mesh(geo, roomMat);
    near.receiveShadow = true; lod.position.set(q.x, y, q.z);
    const close = new THREE.Group(); close.add(near);
    if (stones.length) {
      const ballast = new THREE.InstancedMesh(ROOF_STONE, STEP_MAT, stones.length), dummy = new THREE.Object3D();
      for (let i = 0; i < stones.length; i++) {
        const [sx, sy, sz, w, h, d] = stones[i];
        dummy.position.set(sx, sy, sz); dummy.scale.set(w, h, d); dummy.rotation.y = i * 1.7;
        dummy.updateMatrix(); ballast.setMatrixAt(i, dummy.matrix);
      }
      ballast.castShadow = ballast.receiveShadow = true; close.add(ballast);
    }
    lod.addLevel(close, 0); lod.addLevel(new THREE.Group(), 85); mesh.add(lod);
    for (const g of details) g.dispose();
  }
  for (const g of parts) g.dispose();
  return { mesh, naka };
}

// 兵糧小屋の裏の槍架けと積み材。配置は推定。道と戦う平場の当たりは増やさない。
function ridgeEquipment(rt) {
  const W = rt.world, frames = [], shafts = [], heads = [];
  for (const [x, z] of [[RIDGE3.x + 5, RIDGE3.z - 2.7], [RIDGE4.x + 5, RIDGE4.z - 2.7], [YASHIKI.x + 11, YASHIKI.z + 2.7]]) {
    const y = W.heightAt(x, z);
    if (Math.abs(W.heightAt(x - 1.2, z) - y) > .5 || Math.abs(W.heightAt(x + 1.2, z) - y) > .5) continue;
    for (const side of [-1, 1]) frames.push([x + side * 1.1, y + .8, z, .12, 1.9, .12]);
    frames.push([x, y + 1.5, z, 2.5, .12, .12]);
    for (let i = 0; i < 5; i++) {
      const px = x - .85 + i * .42;
      shafts.push([px, y + 1.8, z + .18, .035, 3.6, .035, -.09]);
      heads.push([px, y + 3.7, z + .35, .07, .3, .07, -.09]);
    }
    for (let i = 0; i < 4; i++) shafts.push([x, y + .12 + Math.floor(i / 2) * .2, z - .5 - i % 2 * .22, .1, 2.8, .1, Math.PI / 2]);
  }
  const dummy = new THREE.Object3D();
  const put = (geo, mat, items) => {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const [x, y, z, sx, sy, sz, rot = 0] = items[i];
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rot === Math.PI / 2 ? 0 : rot, 0, rot === Math.PI / 2 ? rot : 0);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh); W.viewCull([mesh], 0);
  };
  put(ROOM_BOX, ROOM_MAT, frames);
  put(new THREE.CylinderGeometry(1, 1, 1, 5), ROOM_MAT, shafts);
  put(new THREE.ConeGeometry(1, 1, 4), STEP_MAT, heads);
}

// 夜攻めの備え。物の種類は本の野戦兵器・清洲の裏方小屋を参考にした推定配置。
// 道・戸口・戦う中央を空け、小屋の裏と郭の端だけに置く。当たりも実兵も増やさない。
function siegeStores(rt) {
  const W = rt.world;
  const box = ROOM_BOX, pole = new THREE.CylinderGeometry(1, 1, 1, 5);
  const ring = new THREE.TorusGeometry(1, .035, 3, 8);
  const pot = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() });
  const pose = new THREE.Object3D(), color = new THREE.Color();
  let bambooKit = null;
  // 一地点一束で描き、遠くは竹束の輪郭と屋根だけ。細い縄・節・薪は近くでだけ送る。
  const site = (x, z, kind) => {
    const y = W.heightAt(x, z), coarse = [], detail = [];
    if (kind === 'bamboo' && bambooKit) {
      const copy = bambooKit.clone(); copy.position.set(x, y, z); rt.scene.add(copy); return;
    }
    const footAt = (dx, dz) => W.heightAt(x + dx, z + dz) - y;
    const add = (parts, geo, tint, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const g = geo.clone();
      pose.position.set(px, py, pz); pose.scale.set(sx, sy, sz); pose.rotation.set(rx, ry, rz);
      pose.updateMatrix(); g.applyMatrix4(pose.matrix);
      const a = new Float32Array(g.attributes.position.count * 3); color.setHex(tint);
      for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    };
    if (kind === 'bamboo') {
      // 二束だけの控え。黄色一色の壁でなく、切口・節・二か所の縄で束ねた青竹にする。
      for (let b = 0; b < 2; b++) {
        const bx = b * .86 - .43, h = 1.65 + b * .16;
        add(coarse, pole, 0x696747, bx, h / 2, 0, .38, h, .38);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, px = bx + Math.cos(a) * .34, pz = Math.sin(a) * .34;
          const ph = h + (i % 3 - 1) * .045;
          add(detail, pole, i % 2 ? 0x8a8854 : 0x657044, px, ph / 2, pz, .075, ph, .075);
          add(detail, pole, 0xb5a477, px, ph + .008, pz, .067, .018, .067);
          for (const yy of [.36, .86, 1.35]) add(detail, pole, 0x9a9764, px, yy, pz, .083, .028, .083);
        }
        for (const yy of [.5, 1.18]) add(detail, ring, 0x51432f, bx, yy, 0, .44, .44, .44, Math.PI / 2);
      }
    } else if (kind === 'shelter') {
      // 幕囲いの脇の板葺き陣小屋。南は開け、兵糧と運搬具を雨露から守る。
      const rise = Math.max(0, ...[-1.7, 1.7].flatMap(dx => [-1.1, 1.1].map(dz => footAt(dx, dz))));
      for (const dx of [-1.7, 1.7]) for (const dz of [-1.1, 1.1]) {
        const foot = footAt(dx, dz);
        add(coarse, pole, 0x60503b, dx, (foot + rise + 2.35) / 2, dz, .085, rise + 2.35 - foot, .085);
      }
      for (const dz of [-1.1, 1.1]) add(coarse, box, 0x69563c, 0, rise + 2.28, dz, 3.9, .13, .13);
      for (const side of [-1, 1]) {
        add(coarse, box, 0x726451, 0, rise + 2.57, side * .66, 4.1, .10, 1.48, side * .3);
        for (let i = 0; i < 10; i++) add(detail, box, i % 2 ? 0x83755f : 0x625844,
          -1.85 + i * .41, rise + 2.63, side * .66, .032, .035, 1.48, side * .3);
        add(detail, pole, 0x574a37, 0, rise + 2.74, side * .68, .055, 4.25, .055, 0, 0, Math.PI / 2);
      }
      for (let i = 0; i < 7; i++) {
        const px = -1.53 + i * .51, foot = footAt(px, -1.1), top = rise + 2.15;
        add(detail, box, i % 2 ? 0x6e604a : 0x81745b, px, (foot + top) / 2, -1.1, .49, top - foot, .055);
      }
      // 縄を掛けた木箱と担ぎ棒。戦国の山道なので車輪付き攻城具は置かない。
      for (let i = 0; i < 3; i++) {
        const px = -.9 + i * .75, foot = footAt(px, -.45);
        add(coarse, box, 0x79684c, px, foot + .3, -.45, .67, .6, .75);
        for (const dx of [-.22, .22]) add(detail, box, 0x4e4231, px + dx, foot + .31, -.45, .035, .63, .79);
      }
      for (const dx of [-1.3, 1.3]) {
        const foot = footAt(dx, .5), top = rise + .12;
        add(detail, box, 0x514430, dx, (foot + top) / 2, .5, .12, top - foot, .65);
      }
      for (let i = 0; i < 3; i++) add(detail, pole, 0x887149, .2, rise + .17 + i * .1, .5, .045, 3.6, .045, 0, 0, Math.PI / 2);
    } else {
      // 既存の焚火の上に鍋。灯り・炎・煙の仕組みは共用し、照明は増やさない。
      for (const dx of [-.75, .75]) {
        const foot = footAt(dx, 0);
        add(coarse, pole, 0x60503c, dx, (foot + 1.64) / 2, 0, .055, 1.64 - foot, .055);
      }
      add(coarse, pole, 0x60503c, 0, 1.62, 0, .06, 1.8, .06, 0, 0, Math.PI / 2);
      add(detail, pole, 0x39362e, 0, 1.27, 0, .023, .65, .023);
      add(coarse, pot, 0x302e28, 0, .94, 0, .43, .43, .43);
      add(detail, ring, 0x4b4638, 0, .94, 0, .43, .43, .43, Math.PI / 2);
      for (let i = 0; i < 5; i++) add(detail, pole, 0x67533c, 1.25, footAt(1.25, -.3) + .08 + Math.floor(i / 3) * .14,
        -.5 + (i % 3) * .17, .07, .9, .07, 0, 0, Math.PI / 2);
    }
    const root = new THREE.Group(); root.position.set(x, y, z);
    const put = (parts) => {
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.receiveShadow = true;
      for (const g of parts) g.dispose();
      return mesh;
    };
    const silhouette = put(coarse), fine = put(detail);
    const near = new THREE.Mesh(mergeGeometries([silhouette.geometry, fine.geometry]), mat);
    near.receiveShadow = true; fine.geometry.dispose();
    const lod = new THREE.LOD(); lod.userData.noMerge = true; lod.addLevel(near, 0);
    lod.addLevel(new THREE.Mesh(silhouette.geometry, mat), 48);
    lod.addLevel(new THREE.Group(), 125); root.add(lod); rt.scene.add(root);
    if (kind === 'bamboo') bambooKit = root;
  };
  for (const [x, z] of [[14, GATE.z - 10], [16, GATE.z - 2], [RIDGE1.x - 10, RIDGE1.z - 3], [RIDGE3.x - 8, RIDGE3.z]]) site(x, z, 'bamboo');
  site(-26, 140, 'shelter');
  site(-20, 124, 'cook');
  W.addSmokeColumn(-20, W.heightAt(-20, 124) + 1, 124, { size: .4 });
  pole.dispose(); ring.dispose(); pot.dispose();
}

// この山だけ地面の格子を細分する。歩行も描く三角形の面へ合わせる。
// 草・土・岩の共通材質と属性は再利用し、準備時に一度だけ組み直す。
function ridgeTerrain(W) {
  const old = W.terrain.geometry, nx = old.parameters.widthSegments, nz = old.parameters.heightSegments;
  // 低画質の描画格子は歩行格子より粗い。元の面の幅から読み、山の端まで覆う。
  const stepX = old.parameters.width / nx, stepZ = old.parameters.height / nz;
  const xs = [], zs = [];
  for (let i = 0; i <= nx; i++) {
    const x = -W.half + i * stepX; xs.push(x);
    if (i < nx && Math.abs(x) < 140) xs.push(x + stepX / 2);
  }
  for (let j = 0; j <= nz; j++) {
    const z = -W.half + j * stepZ; zs.push(z);
    if (j < nz && z > YASHIKI.z - 26 && z < 30) zs.push(z + stepZ / 2);
  }
  const oldHeight = W.heightAt.bind(W), heights = new Float32Array(xs.length * zs.length);
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
    const x = xs[i], z = zs[j];
    heights[j * xs.length + i] = height(x, z);
  }
  // 切岸の中の孤立した高い頂点は細い三角になる。道と建物を避け、周囲へ丸くなじませる。
  const sourceHeights = heights.slice(), stride = xs.length;
  for (let j = 1; j < zs.length - 1; j++) for (let i = 1; i < xs.length - 1; i++) {
    if (Math.abs(xs[i]) > 140 || zs[j] < YASHIKI.z - 26 || zs[j] > 30) continue;
    const k = j * stride + i, h = sourceHeights[k];
    const rim = Math.max(sourceHeights[k - 1], sourceHeights[k + 1], sourceHeights[k - stride], sourceHeights[k + stride]);
    if (h > rim + 3 && stoneSpace(xs[i], zs[j])) heights[k] = rim + 1;
  }
  // 描く格子と歩く格子を共有する。細い道へ粗い格子の崖が被さらないようにする。
  const findCell = (list, v) => {
    let lo = 0, hi = list.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m] <= v) lo = m; else hi = m; }
    return lo;
  };
  W.heightAt = (x, z) => {
    if (x < xs[0] || x > xs[xs.length - 1] || z < zs[0] || z > zs[zs.length - 1]) return oldHeight(x, z);
    const i = findCell(xs, x), j = findCell(zs, z), a = j * xs.length + i;
    const tx = (x - xs[i]) / (xs[i + 1] - xs[i]), tz = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const h00 = heights[a], h10 = heights[a + 1], h01 = heights[a + xs.length], h11 = heights[a + xs.length + 1];
    return tx + tz <= 1
      ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
      : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
  const g = new THREE.BufferGeometry(), count = xs.length * zs.length;
  for (const [name, attr] of Object.entries(old.attributes)) {
    if (name === 'normal') continue;
    const values = new Float32Array(count * attr.itemSize);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      const x = xs[i], z = zs[j], fx = (x + W.half) / stepX, fz = (z + W.half) / stepZ;
      const ix = Math.min(nx - 1, Math.floor(fx)), iz = Math.min(nz - 1, Math.floor(fz));
      const tx = fx - ix, tz = fz - iz, a = iz * (nx + 1) + ix;
      const k = (j * xs.length + i) * attr.itemSize;
      for (let n = 0; n < attr.itemSize; n++) {
        const read = (v) => attr.array[v * attr.itemSize + n];
        values[k + n] = (read(a) * (1 - tx) + read(a + 1) * tx) * (1 - tz)
          + (read(a + nx + 1) * (1 - tx) + read(a + nx + 2) * tx) * tz;
      }
      if (name === 'position') { values[k] = x; values[k + 1] = W.heightAt(x, z); values[k + 2] = z; }
      if (name === 'splat' && z < GATE.z - 10) {
        for (const q of ROAD_SEGMENTS) {
          const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
          if (Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t) < q.half) {
            values[k] = 0.04; values[k + 1] = 0.94; values[k + 2] = 0.02; break;
          }
        }
      }
    }
    g.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
  }
  const indices = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + xs.length;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setIndex(indices); g.computeVertexNormals();
  W.terrain.geometry = g; old.dispose();
}

// 土道は地面自身の草・土・岩の材質で描く。別の帯を重ねて三角の破片を作らない。
function ridgeSoil(rt) {
  const stones = [], roots = [], W = rt.world;
  // 平場の外の切岸にも露頭と根を置く。道・建物の当たりには加えない。
  for (let z = -216; z <= -76; z += 14) for (const side of [-1, 1]) {
    const x = side * (42 + 7 * Math.sin(z * 0.19));
    if (!stoneSpace(x, z, true)) continue;
    stones.push([x, z]); roots.push([x + side * 0.8, z + 0.7, z * 0.13]);
  }
  for (const q of ROAD_SEGMENTS) {
    if (q.az < -218 || q.az > OPEN_PT[1] + 30) continue;
    const len = Math.sqrt(q.l2), nx = q.dz / len, nz = -q.dx / len;
    const n = Math.max(1, Math.ceil(len / 1.2));
    // 木と岩は道の外へ。土に半ば埋めた岩と根は当たりを増やさない。
    for (let i = 0; i < n; i += 12) {
      const t = (i + 0.5) / n, side = i % 24 ? -1 : 1;
      const x = q.ax + q.dx * t + nx * side * (ROAD_HALF + 3);
      const z = q.az + q.dz * t + nz * side * (ROAD_HALF + 3);
      if (!stoneSpace(x, z, true)) continue;
      stones.push([x, z]); roots.push([x + nx * side * 0.5, z + nz * side * 0.5, Math.atan2(q.dx, q.dz)]);
    }
  }
  const dummy = new THREE.Object3D();
  const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), STEP_MAT, stones.length);
  const rootGeo = new THREE.CylinderGeometry(0.07, 0.13, 1, 5); rootGeo.rotateZ(Math.PI / 2);
  const treeN = Math.ceil(stones.length / 3);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 4.8, 5), new THREE.MeshLambertMaterial({ color: 0x796047, map: barkTex() }), treeN);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5.6, 6), new THREE.MeshLambertMaterial({ color: 0x384a30 }), treeN);
  const root = new THREE.InstancedMesh(rootGeo, new THREE.MeshLambertMaterial({ color: 0x806344, map: barkTex() }), roots.length);
  let planted = 0;
  const rockPoint = new THREE.Vector3(), rockVertices = rock.geometry.attributes.position;
  for (let i = 0; i < stones.length; i++) {
    const [x, z] = stones[i]; dummy.position.set(x, W.heightAt(x, z) - 0.12, z);
    dummy.rotation.set(0.08, i * 1.7, 0.06); dummy.scale.set(0.7 + i % 3 * 0.35, 0.5 + i % 4 * 0.18, 0.9); dummy.updateMatrix();
    // 中心だけで接地させると、下り側の縁が宙へ出る。準備時に下半分を土へ埋める。
    let sink = 0;
    for (let j = 0; j < rockVertices.count; j++) {
      if (rockVertices.getY(j) > -0.25) continue;
      rockPoint.fromBufferAttribute(rockVertices, j).applyMatrix4(dummy.matrix);
      sink = Math.max(sink, rockPoint.y - W.heightAt(rockPoint.x, rockPoint.z) + 0.12);
    }
    dummy.position.y -= sink; dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) {
      const [rx, rz] = roots[i], tx = x + (rx - x) * 30, tz = z + (rz - z) * 30, y = W.heightAt(tx, tz);
      let near = !!W.def.clear?.(tx, tz);
      for (const q of ROAD_SEGMENTS) {
        const t = Math.max(0, Math.min(1, ((tx - q.ax) * q.dx + (tz - q.az) * q.dz) / q.l2));
        if (Math.hypot(tx - q.ax - q.dx * t, tz - q.az - q.dz * t) < 16) { near = true; break; }
      }
      if (!near) {
        dummy.rotation.set(0, i * 1.7, 0); dummy.scale.set(1, 1, 1);
        dummy.position.set(tx, y + 2.25, tz); dummy.updateMatrix(); trunk.setMatrixAt(planted, dummy.matrix);
        dummy.position.y = y + 5; dummy.updateMatrix(); crown.setMatrixAt(planted++, dummy.matrix);
      }
    }
    const [rx, rz, rot] = roots[i], dx = Math.cos(rot) * 0.7, dz = -Math.sin(rot) * 0.7;
    const ha = W.heightAt(rx - dx, rz - dz), hb = W.heightAt(rx + dx, rz + dz);
    dummy.position.set(rx, (ha + hb) / 2 + 0.04, rz);
    dummy.rotation.set(0, rot, Math.atan2(hb - ha, 1.4)); dummy.scale.set(1.4, 1, 1); dummy.updateMatrix(); root.setMatrixAt(i, dummy.matrix);
  }
  trunk.count = crown.count = planted;
  // 露頭の脇に寝かせた根の丸太は、岩と並ぶと斜面に浮いた金槌の形に見えた（10/28 資料との差の調べ）。根は描かない。
  root.count = 0;
  rock.receiveShadow = root.receiveShadow = true; rt.scene.add(rock, root, trunk, crown);
  // 固有の露頭・根・木も、共通の草木と同じく画面外の個体を束から外す。
  // 幹と葉は同じ並びで詰め、木の数や道・斜面の当たりは変えない。
  W.viewCull([rock], 0);
  W.viewCull([root], 0);
  W.viewCull([trunk, crown], 16);
}

// 曲輪へ降りる西の帯道だけ、崖へ出る所を低い木柵で区切る。分岐の口は塞がない。
// 組み立て時だけ柵の両側を読む。素手で越える二歩ほどの間に切岸があれば口へ回る。
function unsafeFenceClimb(W, seg) {
  const [ax, az, bx, bz] = seg, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 0.01) return true;
  const nx = -dz / len, nz = dx / len, n = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= n; i++) {
    const x = ax + dx * i / n, z = az + dz * i / n;
    const a = W.heightAt(x + nx * 1.6, z + nz * 1.6), b = W.heightAt(x - nx * 1.6, z - nz * 1.6);
    const y = W.heightAt(x, z);
    if (Math.max(a, b, y) - Math.min(a, b, y) > 1.5) return true;
  }
  return false;
}
function innerRails(rt, batch) {
  const first = ROAD.findIndex((p) => p[1] === GATE.z - 12);
  const end = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
  for (let i = first + 1; i <= end; i++) {
    const a = ROAD[i - 1], b = ROAD[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 5), nx = dz / len, nz = -dx / len;
    for (const side of [-1, 1]) for (let j = 1; j < n - 1; j++) {
      const t = (j + 0.5) / n, x = a[0] + dx * t, z = a[1] + dz * t;
      const fx = x + nx * side * (INNER_HALF + 1), fz = z + nz * side * (INNER_HALF + 1);
      if (Math.abs(rt.world.heightAt(fx + nx * side * 3, fz + nz * side * 3) - rt.world.heightAt(x, z)) < 2.1) continue;
      let mouth = false;
      for (const q of ROAD_SEGMENTS) {
        const u = Math.max(0, Math.min(1, ((fx - q.ax) * q.dx + (fz - q.az) * q.dz) / q.l2));
        if (Math.hypot(fx - q.ax - q.dx * u, fz - q.az - q.dz * u) < q.half + 0.5) { mouth = true; break; }
      }
      if (mouth) continue;
      const half = len / n * 0.5;
      const pts = [[fx - dx / len * half, fz - dz / len * half], [fx + dx / len * half, fz + dz / len * half]];
      for (const w of wallLine(rt, pts, { team: 1, hp: 1e9, name: '道脇の柵', h: 1.2, meshOpt: { h: 1.2, batch }, segLen: 6 })) { w.noTarget = true; w.wall = true; w.noClimb = true; }
    }
  }
}

// 曲輪の縁を低い石積みで留める推定復元。通り道と土塁の口は残す。
function terraceStone(rt) {
  const W = rt.world, corners = [], dummy = new THREE.Object3D(), batch = makeKitBatch();
  for (const id of ['shu', 'ridge1']) {
    const k = ATTACK_PLAN.kuruwa.find((q) => q.id === id);
    const cx = k.poly.reduce((s, p) => s + p[0], 0) / k.poly.length;
    const cz = k.poly.reduce((s, p) => s + p[1], 0) / k.poly.length;
    for (let i = 0; i < k.poly.length; i++) {
      const start = k.poly[i], end = k.poly[(i + 1) % k.poly.length];
      const pieces = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 2.5);
      for (let part = 0; part < pieces; part++) {
        const a = [start[0] + (end[0] - start[0]) * part / pieces, start[1] + (end[1] - start[1]) * part / pieces];
        const b = [start[0] + (end[0] - start[0]) * (part + 1) / pieces, start[1] + (end[1] - start[1]) * (part + 1) / pieces];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        const side = (-dz * ((a[0] + b[0]) / 2 - cx) + dx * ((a[1] + b[1]) / 2 - cz)) > 0 ? 1 : -1;
        const nx = -dz / len * side, nz = dx / len * side;
        const rim = [a, b].map((p) => W.heightAt(p[0], p[1]));
        const top = Math.min(...rim) + 0.12;
        if (Math.max(...rim) - Math.min(...rim) > 0.6) continue;
        // 切岸の裾に面を置き、天端を内側の曲輪へつなぐ。二〜三メートルの落差だけ使う。
        let offset = 0;
        for (const d of [1, 2, 3, 4, 5, 6]) {
          if ([a, b].every((p) => {
            const drop = top - W.heightAt(p[0] + nx * d, p[1] + nz * d);
            return drop >= 2 && drop <= 2.7;
          })) { offset = d; break; }
        }
        if (!offset) continue;
        const pts = [a, b].map((p) => [p[0] + nx * offset, p[1] + nz * offset]);
        // 東の木戸・枝道を含め、兵の通る帯と交わる石積みは作らない。
        let mouth = false;
        for (let j = 0; j <= Math.ceil(len); j++) {
          const t = j / Math.ceil(len), x = pts[0][0] + dx * t, z = pts[0][1] + dz * t;
          for (const q of ROAD_SEGMENTS) {
            const u = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
            if (Math.hypot(x - q.ax - q.dx * u, z - q.az - q.dz * u) < q.half + 2) mouth = true;
          }
        }
        if (mouth) continue;
        // 天端は平場の高さ。裏側の石敷きを縁まで戻し、独立した板にしない。
        ishigaki(W, pts, { topY: top, minH: 2.2, maxH: 3, lean: 0.28, capIn: offset, out: side, noKit: true, batch });
        for (let end = 0; end < 2; end++) for (let row = 0; row < 5; row++) {
          if (end !== 0 || part !== 0) continue;
          const prev = k.poly[(i + k.poly.length - 1) % k.poly.length];
          const px = start[0] - prev[0], pz = start[1] - prev[1];
          if (Math.abs(px * dz - pz * dx) / (Math.hypot(px, pz) * len) < 0.2) continue;
          const p = pts[end], q = 1 - (row + 0.5) / 5, out = 0.7 * Math.pow(q, 1.5);
          corners.push({ x: p[0] + nx * out, z: p[1] + nz * out, y: top - 2.5 + row * 0.5 + 0.25,
            rot: Math.atan2(-dz, dx) + (row % 2 ? Math.PI / 2 : 0) });
        }
      }
    }
  }
  finalizeKitBatch(rt, batch);
  // 石の形と間詰石はそのまま、一石の肌に煉瓦状の目地を重ねない。
  for (const m of batch.meshes) {
    if (m.material === castleMat('nozura')) m.material = castleStoneMat('warishiGrain');
    else if (m.material === castleStoneMat('nozura')) m.material = castleStoneMat('warishi');
  }
  if (!corners.length) return;
  // 隅の長石を交互に組む算木積み。基本形・材質を使い回して一束にする。
  const mesh = new THREE.InstancedMesh(STAIR_BOX, stairMaterial(), corners.length);
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i]; dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(1.1, 0.46, 0.55); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 本人へ寄る兵は段ごとに二人、門内では三人まで。後続は味方と戦い、道の外へ押し出さない。
function shigisanCombatSpace(army, u) {
  const p = army.playerUnit, F = army.shigisanFlags;
  if (!p?.alive || !F || u.team === p.team || u.noTarget || u.isStruct || u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || ((u.type === 'gun' || u.type === 'bow') && !u.sidearm)) return null;
  const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  if (d >= 12 || Math.abs(u.pos.y - p.pos.y) > 3) return null;
  if (u.target?.alive && u.target !== p && u.target.team === p.team) return null;
  const rest = F.sgRest;
  if (!rest && F.sgFront.includes(u)) return null;
  if (d >= 7 && u.target !== p && u.atk?.target !== p) return null;
  const q = u.sgWait;
  if (!q) return null;
  // 退き足は一歩ずつ。坂と柵で退けなければその場で構える。
  q.x = u.pos.x; q.z = u.pos.z; q.y = u.pos.y;
  if (d < 7 && d > 0.1) {
    const x = q.x + dx / d * 1.2, z = q.z + dz / d * 1.2, y = army.world.heightAt(x, z);
    q.x = x; q.z = z; q.y = y;
    if (!army.world.walkable(x, z) || Math.abs(y - u.pos.y) > 0.6 || army.wallBetween(u.pos, -1, q)
        || army.world.onRoad(u.pos.x, u.pos.z) && !army.world.onRoad(x, z)) {
      q.x = u.pos.x; q.z = u.pos.z; q.y = u.pos.y;
    }
  }
  return q;
}
function well(rt, x, z) {
  const y = rt.world.heightAt(x, z), parts = [];
  for (const side of [-1, 1]) {
    const a = ROOM_BOX.clone().scale(1.8, 0.65, 0.14).translate(x, y + 0.325, z + side * 0.83);
    const b = ROOM_BOX.clone().scale(0.14, 0.65, 1.8).translate(x + side * 0.83, y + 0.325, z); parts.push(a, b);
  }
  rt.scene.add(new THREE.Mesh(mergeGeometries(parts), ROOM_MAT));
  for (const g of parts) g.dispose();
  solidRect(x, z, 1.8, 1.8, 0); // 木枠の井戸の見た目と当たりを合わせる（場所・形は推定）。
}

// 信長公記巻十は信忠の下知で佐久間・羽柴・明智・丹羽が諸口から夜攻めしたと記す。
// https://ja.wikisource.org/wiki/信長公記
// 筒井・細川は片岡城攻めの記事に見える。城の参照表と既存の尾根道に合わせ、人数・攻め口の位置は補完。
// 松永の蔦は既存の近い蔦の紋で代える。
const JIN = [
  rosterPlan('山麓の包囲', 0, { x: 0, z: 142 }, Math.PI, [
    ['nobutada', '本陣', '織田信忠', 8000, 0, 142, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['tsutsui', '大手の仕寄り', '筒井順慶', 3000, TSUTSUI_CAMP.x, TSUTSUI_CAMP.z, 'igeta', 'igeta', 0, { bind: 'tsuCamp' }],
    ['akechi', '西尾根の仕寄り', '明智光秀', 5000, -70, 20, 'akechi', 'akechi', 200, { w: 24, d: 25, generalRear: true }],
    ['hashiba', '寺側の道の囲み', '羽柴秀吉', 5000, 70, 10, 'oda', 'oda', 200, { w: 24, d: 25, generalRear: true }],
    ['hosokawa', '東の後備え', '細川藤孝', 3000, 60, 120, 'oda', 'oda', 220, { w: 26, d: 25, generalRear: true }],
    ['sakuma', '西の攻め口', '佐久間信盛', 5000, -106, -12, 'oda', 'oda', 160, { w: 22, d: 24, generalRear: true }],
    ['niwa', '東の攻め口', '丹羽長秀', 5000, 106, -12, 'oda', 'oda', 160, { w: 22, d: 24, generalRear: true }],
    ['reserve', '西の後備え', '織田信忠の配下（名は不明）', 6000, -60, 120, 'eiraku', 'oda', 220, { w: 26, d: 25, generalRear: true }],
  ], '信長公記巻十の夜攻め。両軍の総数・各備の人数・攻め口の位置は遊びの推定'),
  rosterPlan('尾根と曲輪の守り', 1, TOP, 0, [
    ['hisahide', '本陣', '松永久秀', 2200, TOP.x, TOP.z, 'todo', 'todo', 0, { bind: 'ehon.lord' }],
    ['mori', '城内の鉄砲組', '森好久', 200, TOP.x - 10, TOP.z + 4, 'todo', 'todo', 0, { bind: 'mori' }],
    ['gate', '大手の木戸', '松永久秀の配下（名は不明）', 1600, GATE.x + 8, GATE.z - 5, 'todo', 'todo', 0, { bind: 'arch' }],
    ['lower', '北尾根の下の曲輪', '松永久秀の配下（名は不明）', 1600, RIDGE1.x, RIDGE1.z, 'todo', 'todo', 0, { bind: 'rg1' }],
    ['upper', '北尾根の上の曲輪', '松永久秀の配下（名は不明）', 800, RIDGE2.x, RIDGE2.z, 'todo', 'todo', 0, { bind: 'rg2' }],
    ['yashiki', '松永屋敷', '松永久秀の配下（名は不明）', 1600, YASHIKI.x, YASHIKI.z, 'todo', 'todo', 0, { bind: 'ryk' }],
  ], '信貴山城の曲輪資料。守兵の人数・持ち場と森好久の内通は推定・伝承。朝護孫子寺に守備隊は置かない'),
];
// 包囲の備えと陣幕の周りだけを空ける。山腹全体を伐採した平場にはしない。
// 位置は備え表から一度だけ作り、兵の持ち場へ木を生やさない。
const CAMP_CLEARINGS = JIN[0].sonae.map((s) => ({
  x: JIN[0].honjin.x - s.at.right, z: JIN[0].honjin.z - s.at.front,
  hw: (s.w || 32) / 2 + 8, hd: (s.d || 32) / 2 + 8,
}));
// 今の攻め口の残敵だけを選ぶ。道案内と共用し、別の曲輪や屋内の久秀へ突進させない。
function shigisanFoe(rt) {
  const F = rt.flags, me = rt.player.u, p = me.pos;
  if (F.ending || rt.over || !me.alive) return null;
  if (F.foePickT === rt.t && F.foePickStep === F.step && (!F.foePick ||
      F.foePick.alive && F.foePick.hp > 0 && !F.foePick.dying && !F.foePick.downed &&
      !F.foePick.gone && !F.foePick.fleeing && !F.foePick.woundOut && !F.foePick.noTarget)) return F.foePick;
  F.foePickStep = F.step;
  F.foePickT = rt.t;
  const zone = F.step >= 3.5 ? F.SZ?.byId[F.step === 4 ? 'shu' : 'ridge1'] : null;
  let best = null, distance = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.hp <= 0 || u.team === me.team || u.isStruct || u.civ || u.group?.civ ||
        u.gone || u.dying || u.downed || u.woundOut || u.fleeing || u.noTarget || u.invuln ||
        u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || u.group?.routed) continue;
    if (F.step === 1 ? u.group !== F.amb : !zone || !zone.test(u.pos.x, u.pos.z)) continue;
    if (zone && (!zone.test(p.x, p.z) || !F.castleGuideArrived)) continue;
    if (Math.abs(u.pos.y - p.y) > 3) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance && guideClear(rt, p, u.pos)) { best = u; distance = d; }
  }
  return (F.foePick = best);
}

const shigisan = {
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  quietMiss: true,
  noPlayerFoot: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  speechAllowed: (rt) => rt.over || !!rt.flags.ending,
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討死|討ち取|崩れ/.test(text),
  missions: ['味方と進め', '▼の敵を倒せ', 'ここを守れ', '門を打ち破れ', '曲輪へ進め', '本丸へ進め', '味方と集まれ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return 6;
    if (F.step === 2) return 2;
    if (F.step === 3) return F.gate?.alive ? 3 : 4;
    if (shigisanFoe(rt)) return 1;
    if (F.step >= 3.5) return F.castleGuideArrived && !F.castleGuideLeaving ? 2 : F.step === 4 ? 5 : 4;
    return F.gateWaitT != null ? 2 : 0;
  },
  missionHeading(rt) { return this.missions[this.missionOf(rt)]; },
  missionSignTarget: shigisanFoe,
  foeMarkVisible(rt, u) { return u === this.commanderSignTarget(rt); },
  // 久秀は屋内で自害する大将。討取りの対象にせず、地図と戦場の大将印だけを出す。
  commanderSignTarget(rt) {
    const u = rt.flags.ehon?.lord;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying ? u : null;
  },
  missionPin(rt) {
    const F = rt.flags, p = rt.player;
    if (F.ending || rt.over || !p.u.alive) return null;
    const q = F.missionPin || (F.missionPin = { always: true, silent: true, arrow: false });
    const enemy = shigisanFoe(rt);
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false;
    q.defend = false; q.route = false; q.gate = false; q.marker = null;
    q.r = q.hide = .5; q.y = undefined;
    if (enemy) {
      if (p.inRange && p.rangeCueTarget === enemy) return null;
      q.key = 'foe'; q.unit = enemy; q.enemy = true;
      q.x = enemy.pos.x; q.z = enemy.pos.z;
      return q;
    }
    const id = this.guideMarker(rt);
    const marker = rt.markers.find((m) => m.id === id);
    let pos = marker && (typeof marker.pos === 'function' ? marker.pos() : marker.pos);
    const defending = this.missionOf(rt) === 2;
    // 着いた後も持ち場のピンを残す。敵が消えた同じコマで守りへ替える。
    if (defending) pos = F.step === 2 ? F.approachByRoad ? F.approachGuide : TOWER_POST
      : F.step === 1 ? F.gateGather : F.castleGuidePoint;
    if (!pos) return null;
    q.key = id; q.marker = marker; q.x = pos.x; q.z = pos.z; q.y = pos.y;
    q.waiting = q.defend = defending; q.route = !defending;
    q.gate = F.step === 3; q.r = q.hide = defending ? 3.2 : .5;
    q.arrived = defending && Math.hypot(p.u.pos.x - q.x, p.u.pos.z - q.z) < q.r;
    return q;
  },
  introText: '味方の旗に続いて、尾根道を登ろう。門に着いたら、木づちで門を打つ味方を守ろう。兵数と攻め口は推定です。',
  compactIntro: true,
  introTaskFirst: true, // 城の紹介より先に、最初の下知と勝つ条件を読む。
  noticeOnce: true, // 同じ下知・使番の知らせは一戦に一度だけ。
  sideTaskAfter: Infinity, // 櫓の中を取る別任務で、打ち手の守りと曲輪取りを邪魔しない。
  battleVoices: { lines: { ally: {
    ambient: ['信貴山の城を囲んでおる。先手と進め', '尾根道では前の仲間に続け', '松永勢は曲輪におる。槍をそろえよ'],
    order: ['信忠「諸口の味方と寄せよ。尾根の口を押さえよ！」'],
  }, enemy: {
    ambient: ['松永の城を守れ。木戸を渡すな！', '久秀様と久通様は本丸の館におられる。持ち場を守れ！'],
    push: ['尾根の口で押し返せ！'],
    waver: ['次の曲輪へ下がれ。列を立て直せ！'],
  } } },
  noHorse: true, // 山城の細い石段を登る。徒歩で出る
  jinkei: JIN,
  // 共通の民の描画・兵と火の接近判定を使う。兵数・当たり・戦功には入れない。
  civilianCrowd: { bands: PEOPLE_BANDS },
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noTaisho: true, // 自害の戦を、共通の城主討取り勝利にしない。両将はこの戦で置く。
  noWake: false, // 包囲の同じ兵を近い所から本物へ替える。城の守備は増やさない。
  noReserve: true, // 麓の兵を主人公の補充兵へ変えない。
  wakeRoom: 247, // 包囲の交代兵を含め、実兵は二百五十人ほどまで。
  openingSafe: 12, // 下知と敵の姿を確かめる間は、手傷と落馬を防ぐ。
  attackWarningDelay: 1, // 向きの合図から一秒は避ける間を残す。
  meleeThreatRange: 4.5, // 別の段や離れた控えを、目前の打ち手として囲まない。
  meleeThreatHeight: 3,
  releaseGuardForAttack: true,
  waitGuardButtonText: '押し続けて ふせぐ',
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (enemy.playerOpeningBlocked || enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        !localClear(rt.army, enemy.pos, u.pos, true)) return false;
    // 別の兵が打ち込む時は守りを保つ。打ち終わりだけ、構えの長押しを解いて反撃へ。
    for (const e of rt.army.units) {
      if (e.team === u.team || !e.alive || e.fleeing || e.woundOut || e.gone || e.noTarget || e.playerOpeningBlocked) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.abs(e.pos.y - u.pos.y) < 3 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          localClear(rt.army, e.pos, u.pos, true)) return false;
    }
    return true;
  },
  armySignals: false, // 合図は siegeSignal で鳴らす。「敵を退け」を味方の退却と誤読させない。
  compactThreats: true, // 「前・敵の槍」だけでなく、向きと防ぎ方を短く伝える。
  avoidWaymarkThreats: true, // 危険札は尾根道の印と距離を覆わない。
  strictHits: true, // 続けて打たれた時も、手傷を自動で軽くしない。
  enemyTactics: { advance: false, withdraw: false, flank: false, reinforce: false },
  botOrders: true, // 柵の口への回り道・門の外の持ち場を、遊び手の突進で上書きしない。
  taskDetails: true, // 門の操作と曲輪の守りの進み具合を、携帯でも読めるようにする。
  keepCombatTask: true, // 避ける操作中も、打ち手の守りや曲輪取りの下知を残す。
  keepCombatTaskHeading: true, // 接敵の押し方へ替えず、門や曲輪で果たす下知を残す。
  keepCombatTaskDetail: true, // 斬り合いの案内中も、任務の進み具合と補足を残す。
  keepTaskPanel: true, keepApproachTaskPanel: true, // 敵の位置へ札を移さず、同じ知らせ欄で読む。
  keepTaskWithGuard: true, keepGuardTaskLabel: true, // 構えている間も、門の打ち手や曲輪を守る下知を残す。
  keepTaskWithDodge: true, // 回避の札だけにせず、今の持ち場も残す。
  keepOpeningTaskLabel: true, // 指の動かし方で、最初の行き先を消さない。
  keepTaskLabel: true,
  keepDestinationTask: true,
  keepFlagTravelTask: true, keepFlagArrivalTask: true,
  // 先手を待つ印へ向かう時も、指の操作だけで曲輪取りの下知を消さない。
  waitTravelLabel(rt) { return this.taskLabel(rt, '先手の旗に続け'); },
  hideGuideSteps: true, // 尾根の敵と戦う札へ、遠い旗の直線距離を差し込まない。行き先は道の印で示す。
  immediateTaskChanges: true,
  distanceUnit: 'steps',
  distanceText: () => '',
  taskDetail: () => '',
  keepRetreatReason: true, // 「わを見て」へ縮めず、仲間の後ろへ下がる指図を保つ。
  // 止血した浅い傷は任務へ戻す。傷そのものと歩み・槍への影響は残す。
  // 表示と道案内が別の退避判定を持つと、命が十分でも終戦まで下がれと出続ける。
  woundRetreatNeeded(rt) {
    const u = rt.player.u;
    return u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.3 || u.woundSlow > 0.25 || u.armWound > 0.25;
  },
  treatmentGuideNeeded(rt) {
    const p = rt.player, u = p.u;
    return p.treatmentLeft > 0 && !(p.treatmentNext > rt.t) &&
      (u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.6);
  },
  // 口へ着いたら道順より守兵との戦いを示す。別の段の敵を追わせない。
  castleFightNeeded(rt) {
    const F = rt.flags;
    if (F.castleGuideLeaving) return false;
    if (F.ending || !F.castleGuideArrived || F.step !== 3.5 && F.step !== 4) return false;
    const zone = F.SZ?.byId[F.step === 4 ? 'shu' : 'ridge1'];
    const player = rt.player.u, p = player.pos;
    if (!zone || !zone.enemies || !zone.test(p.x, p.z)) return false;
    // 郭の奥や柵の向こうに残る人数だけで、空き地に反撃を命じない。
    // 同じ持ち場で、目前に見え、槍を交わせる高さと通り道の敵だけを見る。
    for (const u of rt.army.units) {
      if (u.team === player.team || !u.alive || u.isStruct || u.fleeing || u.woundOut || u.downed || u.gone || u.noTarget ||
          u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || u.group?.routed || u.group?.order === 'flee') continue;
      if (Math.abs(u.pos.y - p.y) > 3 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 12 || !zone.test(u.pos.x, u.pos.z)) continue;
      if (localClear(rt.army, p, u.pos, true) && sightUnit(rt, u)) return true;
    }
    return false;
  },
  // 道案内を空き地への退避で消さない。深手・疲れ・近い敵・射撃予告は守りを優先。
  routeGuidePriority(rt) {
    const F = rt.flags, p = rt.player, u = p.u;
    // 打ち合いの余韻だけで退かせない。手当て済みの浅手は、傷が残っても任務へ戻す。
    if (F.ending || F.step < 1 || this.castleFightNeeded(rt) || this.woundRetreatNeeded(rt) || this.treatmentGuideNeeded(rt) ||
        u.mobbed || p.sta < 20 || rt.t < (rt.retreatUntil || 0)) return false;
    for (const enemy of rt.army.units) {
      if (enemy.team === u.team || !enemy.alive || enemy.fleeing || enemy.woundOut || enemy.gone || enemy.noTarget || enemy.isStruct ||
          enemy.playerOpeningBlocked || enemy.group?.noAI || enemy.group?.ambush || enemy.group?.retreatOnly) continue;
      const dx = enemy.pos.x - u.pos.x, dz = enemy.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 4.5 * 4.5 && Math.abs(enemy.pos.y - u.pos.y) < 3 && localClear(rt.army, enemy.pos, u.pos, true)) return false;
      if (d2 < 8100 && enemy.shotWarnUntil > rt.army.time && sightUnit(rt, enemy)) return false;
    }
    return true;
  },
  // 退く印も実際に歩ける道へ限る。仲間の後ろでも切岸へ下ろさない。
  retreatPointAllowed(rt, point) {
    return rt.world.onRoad(point.x, point.z) && guideClear(rt, rt.player.u.pos, point);
  },
  retreatGuideLabel(rt, reached) {
    // 退く間は今の一手だけ。次の行き先は任務の説明に残し、携帯で二行に割らない。
    if (this.woundRetreatNeeded(rt)) return reached ? '手傷が深い。構えよ' : '手傷が深い。味方へ';
    if (rt.player.u.mobbed) return reached ? '味方と囲みを防げ' : '囲まれた。味方へ退け';
    if (rt.player.sta < 20) return reached ? '止まり、息を整えよ' : '息切れ。味方へ下がれ';
    return reached ? '味方の後ろで構えよ' : '味方の後ろへ下がれ';
  },
  dodgeGuideLabel: (_rt, arrived, rain) => rain
    ? arrived ? 'ここで構え、矢をやり過ごせ' : '矢印の方へよけよ'
    : arrived ? 'ここで槍を構えよ' : '敵から少し離れよ',
  // 矢の雨は別の表示口を使う。実物の旗へ逃げる下知と取り違えない。
  rainDodgeGuideLabel: (_rt, arrived) => arrived ? 'ここで矢をやり過ごせ' : '矢印の方へよけよ',
  dodgeActionText: '押し続ける', // 横画面の札で末尾の「る」だけを次の行へ落とさない。
  dodgePointAllowed(rt, point) {
    return this.retreatPointAllowed(rt, point);
  },
  dodgeTurnLabel: (rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞり、退く先を見る`
    : `手元の操作器を${right ? '右' : '左'}へ動かし、退く先を見る`,
  dodgeTurnDuration: 3.5,
  pauseTurnPractice: false, // 振り向く手ほどきでも合戦を止めず、案内は短時間だけ添える。
  dodgeAvoidNotices: true, // 携帯の退避札と指の絵も、任務の札を避ける。
  taskLabel(rt, text) {
    const F = rt.flags;
    if (F.ending || F.step < 1) return text;
    if (F.step === 1 && F.gateWaitT != null) return '門前で先手を待て';
    if (F.castleGuideBlocked) return '崖を避け、来た道へ戻れ';
    if (F.castleGuideLeaving) return rt.player.u.nakaLevel > 0 ? '階段を下り、戸口から尾根道へ戻れ' : '建物の戸口から尾根道へ戻れ';
    if (F.castleGuideDetouring) return '建物や柵を回り、道の印へ';
    if (F.castleGuideReturning) return '道の印へ。そこから尾根道を進め';
    if (F.step < 3.5 && F.climbReturning && (F.step === 1 || F.approachByRoad)) return '尾根道の印へ戻れ';
    // 接敵後も「進め」だけでは、目前の敵を素通りしてよいように見える。
    if (F.step === 1) return F.ambSeen && ambLive(F.amb)
      ? '先手と尾根の敵を退けよ' : '先手と尾根道を進め';
    if (F.step === 2) return '門の右脇で打ち手を守れ';
    if (F.step === 3) return '門の印で、掛矢を使い続けよ';
    if (this.castleFightNeeded(rt)) return F.step === 4 ? '先手と本丸の敵を討て' : '先手と曲輪の敵を討て';
    if (F.castleGuideArrived) return F.step === 4 ? '先手と本丸の南口を守れ' : '先手と曲輪を取れ';
    return F.step === 4 ? '西の尾根道から、本丸の南口へ' : '門を抜け、西の道から曲輪へ';
  },
  waitOrderLabel(rt) { return this.missionHeading(rt); },
  compactFieldGuides: true, // 兵や退き道を太い輪で覆わず、小さな印で示す。
  compactCombatGuides: true, // 敵へ向く矢印を短くし、近い兵の胴や槍を隠さない。
  compactDodgeGuide: true, // 回避先の旗・輪・矢印を小さくそろえ、足元を空ける。
  compactFloorGuides: true, groundCombatMarkers: true, // 退く先の輪は小さく地面に沿わせる。切岸越しには描かない。
  singleRetreatArrow: true, // 回避も退避も短い矢印一本。兵の列を横切る点線を重ねない。
  retreatArrowLength: 90, // 退く向きは足元の短い線で示し、兵や尾根を横断しない。
  escapePlaceLabel: (_rt, rain, side) => rain ? `${side}へよけ、矢を避けよ` : '退く先の印へ',
  compactRetreatArea: true,
  smallTaskAreas: true, smallRetreatAreas: true, // 門前の持ち場も退く範囲も、小さな地面の印で示す。
  compactDestinationArea: true,
  subtleTargetFrames: true, // 狙う相手は細い隅の印で示し、太い四角で具足を囲まない。
  hidePlayerSign: true, // 肩越しに見える本人の白輪を消し、足の接地と尾根道を見せる。
  noUnitContrast: true, // 胴に重なる白い人形の線を消し、具足と姿勢で本人を見せる。
  nearSceneryScreenCut: false, // 画面中央の四角で門の柱・屋根を切らない。目の直前の面だけ避ける。
  nearAllyFadeRadius: 2.2,
  nearAllySolidBody: true, // 視点を味方の体から避け、顔・胴・具足を別々に透かさない。
  nearAllyWholeOcclusion: true, // 本人を隠す味方も全身で避け、首や得物だけを宙に残さない。
  groundLockRing: true, // 狙う相手の輪も尾根の傾斜へ沿わせ、坂から浮かせない。
  coverGuidePlace: true, // 射線を遮る柱や壁を、存在しない旗と呼ばない。
  // 遠い柵や山肌で止まった射線を、足元の物かげと取り違えない。
  // 道から歩いて届き、胸と頭を守る実物が二歩ほど以内にある所だけ案内する。
  coverHitAllowed(rt, hit, point, shooter) {
    return !!hit.object && (1 - hit.q) * Math.hypot(point.x - shooter.pos.x, point.z - shooter.pos.z) <= 2.25
      && guideClear(rt, rt.player.u.pos, point);
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.castleGuideLeaving) return rt.player.u.nakaLevel > 0 ? '下り階段へ' : '戸口から外へ';
    if (F.castleGuideDetouring) return '回り道の印へ';
    if (F.castleGuideReturning) return '道へ戻る';
    if (F.step < 3.5 && F.climbReturning && (F.step === 1 || F.approachByRoad)) return '尾根道へ';
    return F.step === 1 ? '尾根道へ' : F.step === 2 ? '門の右脇へ'
      : F.step === 3 ? '門の正面へ' : F.step === 3.5 ? '曲輪の入口へ' : '本丸の南口へ';
  },
  immediatePhaseTasks: true,
  largeWaymarks: true, // 夜の尾根でも、戻る向きと曲がり角の名を読み取れるようにする。
  singleDestinationArrow: true, // 足元を指す下矢印と、進む向きの上矢印を重ねない。
  compactDestinationSign: true, // 携帯の近い兵や槍を、大きな行き先の矢印で覆わない。
  groundFlagGuides: true, footFlagGuides: true, // 先手の幟を白い大輪で囲まず、根元の小旗で示す。
  avoidDestinationNotices: true, // 行き先が任務札と重なる時は、空いている側で向きを示す。
  avoidAllDestinationNotices: true, // 道の印が旗の形でも、任務札や退く操作の札を避ける。
  // 文と印の名が違っても、今の段の行き先を必ず選ぶ。敵の印へ直進させない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || F.castleGuideBlocked) return null;
    // 尾根で戦う間は敵の奥へ進ませない。道へ戻る時と門前待機は印を残す。
    if (this.taskLabel(rt, '') === '先手と尾根の敵を退けよ' || this.castleFightNeeded(rt)) return null;
    return F.step === 1 ? 'climb' : F.step === 2 ? 'tower' : F.step === 3 ? 'gate'
      : F.step === 3.5 ? 'rg1' : F.step === 4 ? 'honmaru' : null;
  },
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（稲生の標準。kaito 10/24「動かない味方と敵は一切排除」）
  noControlsHelp: true, // 操作の字（なぞって動く・つく）は出さない（操作は尾張の戦で覚える。kaito 10/20）
  spawn: { x: OPEN_PT[0], z: OPEN_PT[1], heading: Math.atan2(OPEN_NEXT[0] - OPEN_PT[0], OPEN_NEXT[1] - OPEN_PT[1]) },
  // 身の回りの当時の場（timeslip_field.js）。天正五年十月十日は今の十一月半ば・晩秋の山城の夜。
  // 尾根道と曲輪は乾いた土に落ち葉と折れ枝、枯れた尾花。門前と曲輪の口ほど倒れた槍・矢・松永方の旗が散る。切岸と石垣の面には置かない。
  timeslip: {
    wet: 0, dust: 0.35, trample: 0.3, debris: 1, arrows: 0.8, branches: 0.08,
    grass: 0x8c7e52, grassTints: [0xffffff, 0xe4d0a0, 0xc8b48a], grassH: 0.95, tallGrass: 0.6,
    flagColors: [0xe4ded0, 0x22201c, 0x4a5a3a],
    fights: [[GATE.x, GATE.z + 8, 30], [TOWER_POST.x, TOWER_POST.z, 22], [RIDGE1.x, RIDGE1.z, 26], [TOP.x, TOP.z, 30]],
    skip: (x, z) => { const W = SG_TS.world; if (!W) return false; const h = W.heightAt(x, z); return Math.abs(W.heightAt(x + 1.5, z) - h) > 1 || Math.abs(W.heightAt(x, z + 1.5) - h) > 1; },
  },
  world: {
    seed: 15770,
    groundHalf: 420, // 北端の屋敷の切岸まで。草木・実兵の数は増やさない。
    maxWalkDrop: 1.2, // 列を避ける一歩で切岸へ下りず、尾根道と木戸を通る。
    terrainTriangles: true, // 兵と門の足元を、見えている地面の三角形へそろえる。
    lookoutLogFrame: true, // 高画質の井楼へ丸太組みの指定を通す。通し柱を垂直にし、横木の木口を交互に出す。
    keepTerrainGrid: true, // 携帯でも足場と同じ格子。粗い地面の切岸に人物と道を埋めない。
    armyHeightLOD: true, // 麓と山上の控えは、高低差も含めて遠い兵の細部を省く。
    nearAllyFadeRadius: 2.2, // 共通の部分隠しを止め、この戦の全身での視点よけにそろえる。
    noHorse: true, // 軍勢も徒歩。武将や後から現れる兵を細い尾根へ騎馬で送らない。
    distantFootOnly: true, // 軽い包囲兵の大将も徒立ちにし、尾根へ馬を混ぜない。
    naturalArrowRain: true, // 遠矢を太い黒い棒へ拡大せず、実寸と夜の霧で見せる。
    arrowRainPerBow: 1, // 少数の守弓から数十本を増やさず、射手の人数に合わせる。
    enemyArrowWarnings: true, // 味方の斉射で持ち場を離れさせない。矢と当たりは残す。
    arrowRainGroundCue: false, // 門前を白黒の太い帯で囲まない。矢の影・警告・退き先の案内は残す。
    noGroundArrows: true, // 一本ずつの矢も一斉射ちも、外れ矢を門前へ積み重ねない。
    moveLim: 410, // 北端の屋敷へ実際に歩いて入れる範囲。城や兵の大きさは変えない。
    fieldStage: 'stubble',
    paddy: (x, z) => x > 84 && x < 130 && z > 164 && z < 204 ? 1 : 0,
    time: 'night',
    nightLift: 1.6, // 月光の強さは保ち、空から一様に当たる光だけを抑えて夜の陰を残す。
    unitNightScale: 0, // 兵だけの白い縁取りを止め、道と同じ月光・篝火で漆と布を照らす。
    fogFar: 310, // 月明かりの尾根越しに、城の櫓の輪郭を見せる。
    treePadMul: 1.2, // 幹は道の半幅六歩より外。折り返しの外の林縁を近づける。
    cedarBoughs: true, raggedPineCrowns: true, // 共通の枝房を使い、杉の大きな葉幕と松の水平な板の縁を崩す。
    nearTreeFadeRadius: 8, // 肩越しの視点から尾根までをふさぐ近い幹・葉房を透かす。木の数や当たりは保つ。
    autumn: true, // 枯草と葉の残る雑木。山全体を冬枯れの裸地にしない。
    treeMix: { sugi: 0.24, matsu: 0.62 }, // 杉ばかりの尖った列にせず、松と雑木の樹冠を交ぜる。
    slopeForest: 0.65, cliffRock: 0.18, // 道の土を保ち、切岸には林床・苔・露岩の斑を残す。
    slopeForestTint: true, // 既存の山肌の色で沢の陰と緑褐色の斑を残し、一面の裸土を抑える。
    muddy: 0.3,
    softEarthCrust: true, // 土塊の陰を塊の縁に限り、山道を四角い板の継ぎ目にしない。
    stableSlopeGrain: true, // 坂の細かな起伏で土の模様を細い縞へ引き延ばさない。
    stableCliffGrain: true, // 切岸の苔も連続した座標で読み、面の曲がり目で細い筋にしない。
    // 兵数・間隔・移動速度・技の時計は保ち、山道の歩調と槍衾の息だけをずらす。
    variedMarch: true, livingSpearHedge: true,
    noHaori: true, // 足軽を主にし、武将にも陣羽織と母衣を足さない。
    variedInfantry: true, // 貸し具足の仕立て・使い込みに既存の差を付ける。
    ordinaryFlagStride: 3, // 無名の長柄足軽の指物は三人に一本。先手の幟と本人の組は残す。
    strideLimit: 1.25, // 敗走でも腿を頭まで振り上げず、足の踏み替えで駆ける。
    fallPaceSpread: 0.35, // 同時に討たれた兵も、膝が折れる間は一人ずつ変える。
    groundedFalls: true, settleSideFalls: true, // 横倒しの胴を支え、肩を山道の斜面へ寝かせる。
    contactFalls: true, // 体が地を打った所で一度だけ、具足と土の音を鳴らす。
    groundStains: true, // 血の跡を地面へ沿わせ、坂から浮く四角い面を残さない。
    wetEarthBursts: true, // 湿った足元には、既存の粒で低く短い土跳ねを添える。
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    combatSpace: shigisanCombatSpace,
    paths: [ { pts: ROAD.slice(0, CLIMB_END + 3), w: ROAD_HALF }, { pts: ROAD.slice(CLIMB_END + 2), w: INNER_HALF }, ...WALK_LINES.slice(1).map((pts) => ({ pts, w: pts[0][1] < GATE.z - 10 ? INNER_HALF : ROAD_HALF })), ...PEOPLE_ROADS.map((pts) => ({ pts, w: 5 })) ],   // 登城道と、寺・里から下る民の道
    pathWidth: ROAD_HALF, // 整地した道の半幅と合わせ、列の端を切岸と誤って止めない。
    height,
    blockedEscape: true, // 柵際で五秒詰まった時だけ、歩ける向きへ退く。
    blockedHint: (rt) => rt.flags.step < 2 ? '尾根道の曲がり角の印へ戻れ。急な山肌は登れない' : rt.flags.step < 3.5 ? '門前の道を進め。門が開くまで先手を守れ' : '曲輪へは柵の口と尾根道を進め。本丸へは西を回り南の口へ',
    // 草土の割合を読む色は共通のまま。暗くするために緑を減らすと、山腹まで裸土になる。
    // 曲輪の形だけ空け、段と段の間の山腹を一括で裸地にしない。道の空きは paths で保つ。
    clear: (x, z) => CAMP_CLEARINGS.some((p) => Math.abs(x - p.x) < p.hw && Math.abs(z - p.z) < p.hd)
      || (Math.abs(z - GATE.z) < 10 && Math.abs(x) < 48)
      || Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 17
      || ATTACK_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z)),
    trees: 276,
    rocks: 0, // 共通の散布岩は使わず、道と平場を避けた少量の自然石だけにする。
    tufts: 1800,
    // 本数は据え置き。見えない遠い外周より、尾根を囲む近い斜面へ配分する。
    treeDensity: (x, z) => (Math.abs(x) < 144 && z > YASHIKI.z - 24 && z < 130 ? 1 : 0.06),
    // 同じ百四十四本を、最初の折り返しと西の帯道の林縁へ配る。
    // 東西六十八歩では道から遠すぎる。西の帯道は中心が六十歩なので、その外へ置く。
    // 追加の林にも道・曲輪・本陣の空きを適用し、当たりと案内を塞がない。
    clearGroves: true,
    groves: [
      { x: -48, z: -30, r: 7, line: [0, 32], n: 24 },
      { x: 48, z: -30, r: 7, line: [0, 32], n: 24 },
      { x: -76, z: -112, r: 7, line: [0, 48], n: 24 },
      { x: 48, z: -112, r: 7, line: [0, 48], n: 24 },
      { x: -76, z: -180, r: 7, line: [0, 48], n: 24 },
      { x: 32, z: -202, r: 7, line: [0, 48], n: 24 },
    ],
    fleeOut: (x, z, team) => team === 1 && (z < YASHIKI.z - 28 || Math.abs(x) > 160),
  },

  waitForPlayer: false, // 組頭の下知の後、法螺の合図で寄せる。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    SG_TS.world = W; timeslipField(rt);   // 身の回りの落ち葉・倒れた槍と旗・枯れ草（def.timeslip。切岸は外す）
    // 待機専用の描画は小さな任務印の指定を通らない。崖をまたぐ白い大輪を足元の印へ替える。
    // 到着半径と先手を待つ時間は保ち、終戦時に共通の描画へ戻す。
    const waitFrame = rt.hud.drawWaitFrame;
    rt.hud.drawWaitFrame = function (g, battle, pos, radius) {
      return battle === rt ? this.drawTargetFootRing(g, battle, pos, 0.65)
        : waitFrame.call(this, g, battle, pos, radius);
    };
    // 谷側の空き地へ誘わず、尾根道から歩いて届く場所だけを矢の退き先にする。
    rt.army.hooks.rainEscapePointAllowed = (point) => this.dodgePointAllowed(rt, point);
    const dispose = rt.dispose;
    rt.dispose = function () {
      this.hud.drawWaitFrame = waitFrame;
      return dispose.call(this);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', mainKeep: 'HIST_B', ridgeKuruwa: 'HIST_B', templeArea: 'HIST_B', matsunagaEnd: 'HIST_A', tsutsuiRidge: 'HIST_B', routes: 'GAME_C', sally: 'GAME_C' };
    F.sgFront = []; F.sgFrontAt = 0; rt.army.shigisanFlags = F;
    F.step = 0; F.ek = 0; F.ak = 0; F.firstFoe = null; F.firstFightT = null;
    // 縄張り（castle_plan.js）：曲輪の囲いと段を共通化。大手の閉じた門だけは戦の側で作る
    ridgeTerrain(W);
    W.noClimb = W.noClimb || [];
    W.noClimb.push((x, z) => z < GATE.z - 10 && z > -270 && Math.abs(x) < 110 && !W.onRoad(x, z) && W.slopeTan(x, z) > 0.70);
    // 星は遠い空の点にする。携帯の小さな画面で白い粒が降っているように見せない。
    if (W.stars) { W.stars.material.size = 0.35; W.stars.material.opacity = 0.22; }
    if (W.stars) W.stars.geometry.setDrawRange(0, 100);
    // 旧暦十日は上弦を過ぎ、満月より前。満ちていく月を約七割の明るい面で推定する。
    // https://www.nao.ac.jp/faq/a0201.html （月相と旧暦の日付）。正確な当夜の傾き・天気は未確定。
    // 元の月の絵・材質を準備時にだけ使い直し、夜攻めの足元の明るさは保つ。
    if (W.moon) {
      const tex = W.moon.material.map, c = tex.image;
      c.width = c.height = 256;
      const ctx = c.getContext('2d'), r = 48;
      const glow = ctx.createRadialGradient(140, 115, 0, 128, 128, r);
      glow.addColorStop(0, '#f0f4ff'); glow.addColorStop(1, '#b4c4e6');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(128, 128, r, -Math.PI / 2, Math.PI / 2);
      ctx.ellipse(128, 128, r * 0.36, r, 0, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath(); ctx.fill();
      tex.needsUpdate = true;
      W.moon.scale.setScalar(10);
    }
    // 山道に土塊と足形を升目のように繰り返さない。粒と連続した濃淡の絵を準備時に共有する。
    // 切岸にも同じ土を使い、生成した土壁の四角い区画を山肌へ貼らない。
    W.groundU.tDirt.value = W.groundU.tBank.value = dirtTex(true);
    W.groundU.tMud.value = mudTex(true);
    // この城の崖だけ、細かな岩を面の向きごとに貼る。縦筋や座標を混ぜて潰さない。
    const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey.bind(mat);
    // 月明かりの強さは保ち、この戦の地面だけを湿った褐色に寄せる。
    // 土・草・岩の絵は共用し、別の面や材質を足さない。
    mat.color.setRGB(0.86, 0.78, 0.64);
    mat.customProgramCacheKey = () => cacheKey() + '|信貴山の岩肌';
    mat.onBeforeCompile = (sh, renderer) => {
      compile.call(mat, sh, renderer);
      sh.uniforms.sgStoneFace = { value: stoneTex() };
      sh.fragmentShader = 'uniform sampler2D sgStoneFace;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('col = mix(col, cliff, steep);', `
        vec3 rw = pow(abs(gN), vec3(4.0)); rw /= max(0.001, rw.x + rw.y + rw.z);
        vec3 stoneFace = texture2D(sgStoneFace, vWP.zy / 2.2).rgb * rw.x
          + texture2D(sgStoneFace, vWP.xy / 2.2).rgb * rw.z
          + texture2D(sgStoneFace, vWP.xz / 2.2).rgb * rw.y;
        // 山肌は土と自然石。石垣の目地を山全体へ貼らない。
        // 計算済みの雨溝・土塊・苔を残す。元の土の絵だけへ戻すと巨大な灰色の壁になる。
        vec3 bankSoil = mix(earth, cliff, 0.25) * vec3(0.92, 0.96, 0.84);
        float exposure = smoothstep(0.56, 0.78, macro2) * 0.45;
        float stoneShade = dot(stoneFace, vec3(0.3, 0.55, 0.15));
        vec3 dampStone = mix(stoneFace * vec3(0.62, 0.67, 0.61), vec3(stoneShade) * vec3(0.42, 0.51, 0.36), smoothstep(0.52, 0.76, macro2) * 0.65);
        cliff = mix(bankSoil, dampStone, exposure);
        // 切岸の大きな面にも湿った土色を通し、月光で白い壁に見えるのを抑える。
        cliff *= vec3(0.78, 0.80, 0.72);
        col = mix(col, cliff, steep);`);
      // 近い急斜面でも林床・苔の斑を残す。道の踏み跡による抑制は保ち、
      // 足場・曲輪の高さ・木の数を変えず、一面の白い土壁を和らげる。
      sh.fragmentShader = sh.fragmentShader.replace(
        'mix(1.0 - 0.85 * steep, 1.0, farK)', 'mix(1.0 - 0.35 * steep, 1.0, farK)');
      // 赤橙の斑だけを抑え、土の褐色を残す。夜の山肌を一面の灰色にしない。
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
        float warmPatch = smoothstep(0.02, 0.16, col.r - col.g);
        vec3 nightSoil = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.84, 0.78, 0.66);
        col = mix(col, nightSoil, warmPatch * 0.35);
        diffuseColor.rgb *= col;`);
    };
    // 地面は透かさず、空・星と草木を深さで遮る。近い切岸は共通のカメラ退避で避ける。
    // 大きな一枚の地形を半透明の列へ入れると、草木や建物との描く順が不安定になる。
    mat.userData.camNearSolid = true;
    mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.alphaHash = false;
    mat.needsUpdate = true;
    // 館の板塀と、奥の段の透ける木柵を分け、切岸とひな壇を見せる。
    // 画質は戦の開始時に読む。ほかの画質の縄張りと当たりは保つ。
    const visualPlan = { ...ATTACK_PLAN,
      kuruwa: ATTACK_PLAN.kuruwa.map((k) => ['ridge2', 'ridge3', 'ridge4'].includes(k.id)
        ? { ...k, wallOpt: { ...k.wallOpt, openFence: true, h: 1.8 } } : k) };
    F.C = buildCastlePlan(rt, { ...visualPlan, lifeDense: 1.6, lifeNoFlags: true, lifeFires: 8 }, { life: true, ladders: true, buildSeat: false, baseHeight: base, edgeW: TERRAIN_EDGE });
    // 共通の天守は白壁と層を重ねる形なので、この城だけ板壁の小さな望楼にする。
    const seat = boardRoom(rt, { x: TOP.x - 2, z: TOP.z - 8, w: 8, d: 6, name: '山頂の小さな天守', kind: 'tenshu', keep: true });
    F.C.seat = { naka: seat.naka, spot: seat.naka.lordSpot, where: seat.naka.where, team: 1 };
    rt.castleSeat = F.C.seat;
    // 下の曲輪・屋敷の木柵は破れる。切岸・空堀と本丸の囲いは保つ。
    for (const s of F.C.walls) if (s && s.seg) {
      s.hp = s.maxHp = 650; s.noTarget = false; s.wall = true;
      // 切岸をまたぐ柵は素手で越えない。数十歩上の地面へ空中を登る動きを防ぐ。
      s.noClimb = unsafeFenceClimb(W, s.seg);
    }
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; s.noClimb = true; } return segs; };
    // この戦で足す木柵は材質・近い区画ごとにまとめる。
    // 区画の当たりと壊れる窓口は既存の一括描画の仕組みで保つ。
    const fences = makeSimpleBatch();
    fences.mergeFence = true;
    // ---- 門の曲輪：柵と門、脇の物見櫓 ----
    // 写真の山城の門脇は細い杭と二段の横木。館の板塀とは透け方を分ける。
    // 高さ・柵の当たり・開口は保ち、共通部品の高画質用の疎な柵を使う。
    const gateFenceOpt = { batch: fences, lightFence: true };
    noT(wallLine(rt, [[-28, GATE.z + 4], [-5.5, GATE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5, meshOpt: gateFenceOpt }));
    noT(wallLine(rt, [[5.5, GATE.z], [28, GATE.z + 4]], { team: 1, hp: 1e9, name: '柵', segLen: 5, meshOpt: gateFenceOpt }));
    F.gate = rt.army.addStruct({ seg: [-5.5, GATE.z, 5.5, GATE.z], nx: 0, nz: 1, hp: 1800, maxHp: 1800, armor: 0.22, team: 1, name: '門' });
    const dm = tobira(W, GATE.x, GATE.z, 11, 0);   // 閉じた扉（破られると根元から倒れる）
    F.gate.mesh = dm;
    rt.scene.add(dm, boardGate(W, GATE.x, GATE.z, 11.4));
    // 写真の常設井楼のように、横木の木口と開いた脚組を見せる。床の高さは保つ。
    const towerOpt = { logFrame: true, boarded: false, mon: MATSU.flag };
    F.tower = yagura(W, TOWER.x, TOWER.z, towerOpt);
    rt.scene.add(F.tower, yagura(W, -12, GATE.z - 6, towerOpt));
    // ---- 本丸（雄嶽の主郭）：柵の囲い（南に口）と、板葺きの館 ----
    noT(F.C.walls.filter((w) => w.name === '主郭（館）'));
    rt.scene.add(boardGate(W, 0, TOP.z + TOP.r, 7.4, 0, true));
    // 松永の小さな天守は板壁の望楼。切岸は土を主にし、縁の一部だけ低い石積みを添える。
    // 門前の篝火は尾根道の幅六歩と、門の右脇の守りから離す。炎は鉄籠の高さに合わせる。
    for (const [x, z] of [[-9, GATE.z + 12], [10, GATE.z + 12], [TOP.x - 5.6, TOP.z - 1.5], [TOP.x + 1.6, TOP.z - 1.5]]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 });
    }
    // 夜の高い尾根では近い遠景の板が空へせり出す。山の板を消して同じ空へつなぐ。
    W.mountains.visible = false;
    ridgeSoil(rt);
    terraceStone(rt);
    // 道は整地済みの土の坂。全尾根へ連続する推定の石段を重ねない。
    innerRails(rt, fences);
    well(rt, TOP.x - 11, TOP.z + 2);
    well(rt, YASHIKI.x - 11, YASHIKI.z - 5);
    F.rooms = BUILDINGS.map((q) => boardRoom(rt, q));
    for (const room of F.rooms) room.naka.guards = []; // 入れる建物に兵を増やさない。寺は戦の外。
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [TOP.x - 16, TOP.z + 6], [TOP.x + 14, TOP.z + 10]]) rt.scene.add(nobori(W, x, z, 'todo', z < TOP.z + 12 ? 8 : 6));
    // 五段の土塁と柵は共通の縄張りからまとめて描く。口だけ開いた木戸。
    F.monomi = SHIGISAN_PLAN.yagura.filter((y) => y.id !== 'monomi_gate').map((y) => monomi(rt, y.at[0], y.at[1], { ...towerOpt, height: 8.8, team: 1, name: '物見櫓' }));
    for (const c of [RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI]) rt.scene.add(boardGate(W, c.x, c.z + c.r, 7, 0, c === YASHIKI));
    // 主尾根の正面は東。閉門を増やさず、既存の道の開口と同じ位置に木戸を置く。
    for (const c of [RIDGE1, YASHIKI]) rt.scene.add(boardGate(W, c.x + c.w, c.z, 7.4, Math.PI / 2, c === YASHIKI));
    // 遠い二段の兵糧小屋は板葺きで材質ごとにまとめる（室内なし）。
    const huts = makeSimpleBatch();
    // 高画質では共通部品の板葺きを指定。各屋根三十個の石を並べる姿を避ける。
    const hutRoof = { boardRoof: true, weatheredBoards: true, boardRoofColors: [0x777062, 0x69685b, 0x82745f, 0x726a58] };
    for (const c of [RIDGE3, RIDGE4]) hut(W, c.x + 5, c.z, 3.5, 3, 0, { ita: true, minka: false, batch: huts, ...hutRoof });
    if (true) {
      // 枝尾根の既存の平場にだけ家臣の小屋を対で置く。中央と道の口は空ける。
      // 写真の並びを参考にした推定。城下の民家や新しい守兵にはしない。
      for (const [id, buildings, flag] of [
        ['branch1', [[-6, -1.5, 7, 4, 0], [6.5, -1, 3.5, 3, Math.PI / 2]], [2, -3.7]],
        ['branch4', [[-6.5, -1, 4, 3, Math.PI / 2], [5.5, -2, 7, 4, 0]], [-2, -3.7]],
        ['branch10', [[-5.5, -2, 8, 4, 0], [6.5, -.5, 4, 3, Math.PI / 2]], [2, -3.7]],
      ]) {
        const k = ATTACK_PLAN.kuruwa.find((p) => p.id === id);
        const x = k.poly.reduce((sum, p) => sum + p[0], 0) / k.poly.length;
        const z = k.poly.reduce((sum, p) => sum + p[1], 0) / k.poly.length;
        // 同寸の二棟を反復せず、主屋と妻を向けた付属屋で庭を囲む。入口中央は空ける。
        for (const [dx, dz, w, d, rot] of buildings) hut(W, x + dx, z + dz, w, d, rot, { ita: true, minka: false, solid: false, batch: huts, ...hutRoof });
        branchFence(rt, x, z);
        rt.scene.add(nobori(W, x + flag[0], z + flag[1], MATSU.flag, 5));
      }
      for (const c of [RIDGE3, RIDGE4]) rt.scene.add(nobori(W, c.x - 7, c.z - 3, MATSU.flag, 5));
    }
    finalizeSimpleBatch(rt, huts);
    ridgeEquipment(rt);
    for (const [x, z] of [[RIDGE1.x + 7, RIDGE1.z - 1], [RIDGE2.x - 6, RIDGE2.z + 1]]) rt.scene.add(nobori(W, x, z, 'todo', z < TOP.z + 12 ? 8 : 6));
    // ---- 松永屋敷（北尾根のさらに奥の郭。主殿・家臣の詰所・倉。暮らしと政治の区域。通り抜けを塞がぬよう、壁は装飾の低い塀だけ） ----
    rt.scene.add(tawara(W, YASHIKI.x + 8, YASHIKI.z + 1, 0.2, 5));
    rt.scene.add(nobori(W, YASHIKI.x - YASHIKI.r + 1, YASHIKI.z, 'todo', 6));
    // ---- 朝護孫子寺の区域（今の建物は写さない。寺と軍事の区域を分ける。装飾のみ・戦いの的にしない） ----
    palisade(W, [TEMPLE.x - TEMPLE.r, TEMPLE.z - TEMPLE.r, TEMPLE.x + TEMPLE.r, TEMPLE.z - TEMPLE.r], { h: 2.2, batch: fences });
    KIT.farVillage(rt, 104, 180, { n: 5, fields: 5, seed: 1577 });
    // 寺の区域は城の区域と分ける：四方を木柵で囲み、山門を西（城の登城道の側）へ向け、境内の灯と僧の姿を置く。戦いの的にしない
    {
      const P = TEMPLE_ZONE.poly, R = TEMPLE.r;
      for (const seg of [[TEMPLE.x - R, TEMPLE.z + R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x + R, TEMPLE.z - R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x - R, TEMPLE.z - R, TEMPLE.x - R, TEMPLE.z - 2], [TEMPLE.x - R, TEMPLE.z + 2, TEMPLE.x - R, TEMPLE.z + R]]) palisade(W, seg, { h: 2.2, batch: fences });
      rt.scene.add(kabukimon(W, TEMPLE_ZONE.sanmon.x, TEMPLE_ZONE.sanmon.z, 4.4, Math.PI / 2, { doors: false }));
      rt.marker('tera', { x: TEMPLE.x, z: TEMPLE.z }, '朝護孫子寺（戦の外）', { h: 5, noGuide: true });
      F.templeZone = TEMPLE_ZONE;
    }
    finalizeSimpleBatch(rt, fences);
    // ---- 筒井の先手・鉄砲組・門を破る組 ----
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: 2, z: 92 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], TSUTSUI));
    F.tsuU = F.tsutsui.units[0]; // 尾根道の先導。順慶本人は麓の陣に置く。
    F.ake = allyGroup(rt, { name: '筒井の鉄砲組', anchor: { x: -20, z: 100 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 6 }], TSUTSUI));
    F.ram = allyGroup(rt, { name: '門を破る組', anchor: { x: 14, z: 108 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.tsutsui, F.ake, F.ram];
    for (const g of F.oda) { g.noRout = false; g.formation = 'column'; g.width = 5; g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 3, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    F.oda.forEach((g, i) => {
      const start = Math.max(1, OPEN_I - i), at = ROAD[start];
      placeGroup(rt, g, at[0], at[1]);
      // 出発時の後列も折れた道へ置く。直線の並びでは切岸に立ってしまう。
      g.order = 'path'; g.path = ROAD; g.pathIdx = start + 1; g.roadColumn = true; g.colW = 2;
      for (const u of g.units) {
        const p = g.slotPos(u.slot, g.initial);
        u.pos.set(p.x, W.heightAt(p.x, p.z), p.z); u.mesh.position.copy(u.pos);
      }
      g.path = ROAD.slice(0, start + 1); g.pathIdx = start; g.speed = 0;
      for (const u of g.units) u.moveTo = null;
    });
    // ---- 木戸の内の弓と鉄砲 ----
    F.arch = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '木戸の弓', anchor: { x: 8, z: GATE.z - 3 }, facing: 0, width: 14, aggro: 40, noRout: false, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'bow', n: 7 }, { type: 'gun', n: 2 }], MATSU));
    // ---- 麓の織田の陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, -16, 132, 0.3, 6));
    // 麓の総大将 織田信忠の本陣と、本丸の松永久秀の陣所（旗本は本丸の内に控える）
    F.honjin = camp(rt, { x: 0, z: 142, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 2, z: 92 } });
    F.honjin.guard.anchor.z = 127; F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 12;
    F.tsuCamp = camp(rt, { ...TSUTSUI_CAMP, facing: Math.PI, team: 0, mon: 'igeta', general: { name: '筒井順慶' }, guard: 15, reserve: 0, runTo: { x: 2, z: 80 } });
    // 旗本は南の口を守る。閉じた北の幕を横切る持ち場へ動かさない。
    F.tsuCamp.guard.guard = true; F.tsuCamp.guard.guardLeash = 12;
    F.ehon = makeLordKeep(rt, { name: '松永久秀', naka: F.C.seat.naka, faction: 'matsunaga', flag: 'todo', guardN: 4 });
    rt.army.spawn(F.ehon.lord.group, [{ type: 'busho', n: 1, o: { name: '松永久通', x: F.ehon.spot.x + 1.5, z: F.ehon.spot.z, invuln: true } }]);
    F.hisamichi = F.ehon.lord.group.units[1];
    F.hisamichi.keep = true; F.hisamichi.noTarget = true; F.hisamichi.pos.y = F.ehon.spot.y;
    F.ehon.lord.invuln = true; F.ehon.lord.noTarget = true; F.ehon.lord.group.noAI = true;
    for (const u of [F.ehon.lord, F.hisamichi]) { u.aiT = Infinity; u.perch = { x: u.pos.x, z: u.pos.z }; }
    // 史料の最期は自害。室内の共通の一騎打ち案内は使わない。
    F.C.seat.naka.onEnter = null; F.C.seat.naka.onLevel = null;
    F.amb = enemyGroup(rt, { fixed: true, ambush: true, faction: 'matsunaga', name: '尾根の松永勢', anchor: { x: AMBUSH_PT[0], z: AMBUSH_PT[1] }, facing: Math.atan2(OPEN_PT[0] - AMBUSH_PT[0], OPEN_PT[1] - AMBUSH_PT[1]), formation: 'column', order: 'hold', aggro: 16, width: 5, morale: 90, fleeDir: { x: -1, z: -0.5 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], MATSU));
    // 後列も登城道に沿わせ、藪の急斜面へ並べない。下知までは動かさない。
    march(F.amb, [OPEN_PT]);
    F.amb.path = [OPEN_NEXT, AMBUSH_PT, OPEN_PT]; F.amb.pathIdx = 2; F.amb.speed = 0;
    for (const u of F.amb.units) {
      const q = F.amb.slotPos(u.slot, F.amb.initial);
      u.pos.set(q.x, W.heightAt(q.x, q.z), q.z); u.mesh.position.copy(u.pos);
    }
    F.sally = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '木戸脇の控え', anchor: { x: 22, z: GATE.z - 10 }, facing: 0, formation: 'yari', order: 'hold', aggro: 8, width: 6, morale: 90, fleeDir: { x: 0.5, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], MATSU));
    F.rg1 = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '下の曲輪の松永勢', anchor: { x: RIDGE1.x - 3, z: RIDGE1.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    F.rg2 = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '上の曲輪の松永勢', anchor: { x: RIDGE2.x, z: RIDGE2.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 9, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], MATSU));
    F.ryk = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '松永屋敷の守り', anchor: { x: YASHIKI.x + 11, z: YASHIKI.z - 1 }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 1, z: 0 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    const mk = (x, z, name, list) => enemyGroup(rt, { fixed: true, faction: 'matsunaga', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 20, aggro: 16, width: 7, formation: 'yari', morale: 100, noRout: false, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(list, MATSU));
    // 森好久の鉄砲二百は備え表で示す。近くの四人だけを実兵にする。
    // 内通の知らせまで控え、討取りで伝承に沿う寝返りの段を消さない。
    F.mori = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '森好久の鉄砲組', anchor: { x: TOP.x - 10, z: TOP.z + 4 }, facing: 0, order: 'hold', formation: 'gun', width: 5, noRout: true, morale: 100, aggro: 0 }, dress([{ type: 'gun', n: 4 }], MATSU));
    F.mori.noAI = true;
    for (const u of F.mori.units) { u.noTarget = true; u.invuln = true; }
    // 実際に戦う守兵だけを絞る。包囲の総勢と、父子が城内で自害する筋は保つ。
    F.last = [mk(TOP.x, TOP.z + TOP.r - 4, '松永の旗本', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }])];
    F.last.push(mk(TOP.x + 11, TOP.z + 10, '本丸の控え', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }]));
    for (const [x, z, k] of [[-8, 130, 'oda'], [8, 130, 'eiraku'], [-30, 110, 'akechi'], [30, 110, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const g of [F.arch, F.amb, F.sally, F.rg1, F.rg2, F.ryk, ...F.last, F.ehon.guard, ...F.ehon.kin]) { g.noAI = true; g.noRout = false; }
    F.amb.noAI = true; // 登りの下知で、同じ道の敵を必ず前へ出す。
    for (const u of rt.army.units) if (u.team === 1) {
      u.playerOpeningBlocked = true; u.sgWait = { x: u.pos.x, y: u.pos.y, z: u.pos.z };
      u.cdBase = Math.max(u.cdBase || 0, u.type === 'gun' || u.type === 'bow' ? 4.5 : 2.4);
    }
    for (const g of F.oda) g.noAI = true;
    // 傷ついた守りは同じ兵のまま次の曲輪へ歩いて下がる。
    F.withdraw = [
      { g: F.sally, path: ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1) },
      { g: F.rg1, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z), ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z) + 1) },
      { g: F.rg2, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z)) },
      { g: F.ryk, path: ROUTES.find((r) => r.id === 'yashiki').pts.slice(6).concat([[TOP.x, TOP.z + 8]]) },
    ];
    for (let i = 0; i < F.withdraw.length; i++) {
      const w = F.withdraw[i]; w.to = ['ridge1', 'ridge2', 'shu', 'shu'][i];
      w.probeA = { x: 0, y: 0, z: 0 }; w.probeB = { x: 0, y: 0, z: 0 };
    }
    rosterBuild(rt, JIN);
    // 包囲の備えだけを交代させる。城へ勝手に登らず、元の兵種と損害を引き継ぐ。
    for (const m of Object.values(F.jinRoster[0])) m.army.noWake = false;
    for (const a of W.armies || []) if (a.team === undefined) { a.team = 0; a.noWake = false; a.jinkeiGuard = true; }
    for (const [x, z] of [[-20, 124], [20, 126]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    siegeStores(rt);

    // 物見の床だけでなく地上の脚組も、近い視点の見通しに含める。
    // 当たり・床・梯子は保ち、この戦の櫓にだけ範囲を持たせる。
    rt.scene.traverse(o => {
      const I = o.userData.naka;
      if (I?.kind !== 'yagura' || !I.open) return;
      const y = W.heightAt(I.x, I.z), top = I.levels[I.levels.length - 1];
      o.userData.sgView = { id: I.id, x: I.x, z: I.z, c: I.c, s: I.s,
        levels: [{ w: 4, d: 4, y, h: top.y + top.h - y }] };
      o.userData.noMerge = true;
    });
    // 棟・木戸・櫓ごとに近い梁・板壁だけを透かす。離れた門や柵は深さを保つ。
    const smoothCopies = new Map();
    const smoothMat = (mat, owner) => {
      let copies = smoothCopies.get(owner);
      if (!copies) { copies = new Map(); smoothCopies.set(owner, copies); }
      if (!copies.has(mat)) {
        // 共有材質へ前の見通し処理が付いていても、同じ処理を二重に足さない。
        const m = cloneRoomNearMaterial(mat, { value: 0 }); m.userData.sgSmoothNear = true;
        // ほぼ透明な手前の板を何層も重ねると、門の中が白い箱に見える。
        // この戦の近い壁だけ抜き、残る板は奥の板を深さで遮る。
        const compile = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = (sh, renderer) => {
          compile.call(m, sh, renderer);
          sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.a *= camKeep;',
            'if (camKeep < 0.65) discard;');
        };
        m.customProgramCacheKey = () => key() + '|信貴山の近い板';
        m.transparent = false; m.depthWrite = true; m.alphaHash = false;
        m.forceSinglePass = true;
        copies.set(mat, m);
      }
      return copies.get(mat);
    };
    const prepareNearMesh = (o, room = null) => {
      if (!o.isMesh) return;
      let owner = room;
      for (let at = o; !owner && at && at !== rt.scene; at = at.parent) {
        if (at.userData.sgView) { owner = at.userData.sgView; break; }
        if (at.userData.naka?.sgOverhead) { owner = at.userData.naka; break; }
      }
      if (!owner) return;
      o.userData.camNear = true;
      o.material = Array.isArray(o.material) ? o.material.map(m => smoothMat(m, owner)) : smoothMat(o.material, owner);
      // 本人も視点も外にいる間は壁を残す。棟へ入り込んだ時だけ近い面を透かす。
      const materials = Array.isArray(o.material) ? o.material : [o.material], before = o.onBeforeRender;
      o.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        before.call(this, renderer, scene, camera, geometry, material, group);
        // 本人が外でも、肩越しの視点だけ棟へ入る場合は近い梁を透かす。
        // この棟の範囲だけを調べ、離れた門・柵の深さは保つ。
        const dx = camera.position.x - owner.x, dz = camera.position.z - owner.z;
        const lx = dx * owner.c - dz * owner.s, lz = dx * owner.s + dz * owner.c;
        let inside = !owner.gate && rt.player.u.naka === owner.id + 1;
        for (const lv of owner.levels) {
          // 壁のすぐ外でも肩越しの視点をふさぐ。足場と遠い壁は共通処理で残す。
          if (Math.abs(lx) < lv.w / 2 + 2 && Math.abs(lz) < lv.d / 2 + 2
              && camera.position.y > lv.y - .3 && camera.position.y < lv.y + lv.h + 2) { inside = true; break; }
        }
        for (const m of materials) m.userData.sgRoomInside.value = inside ? 1 : 0;
      };
    };
    rt.scene.traverse(o => prepareNearMesh(o));
    // 室内は接近してから作られる。開始時の走査にない壁にも同じ見通しを付ける。
    W.def.prepareInteriorMesh = (mesh, room) => mesh.traverse(o => prepareNearMesh(o, room));

    rt.world.setTime('night');
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.banner('片岡城、落ちる', '光秀らが支城を落とした。次は信貴山城');
    rt.obj('main', HI(rt) ? '一手を率い、先手と尾根道へ進め' : '先手と尾根道へ進め', 'main');
    rt.say('組頭', '筒井の旗に続け。尾根道を進むぞ！', 5);
    rt.marker('tsu', unitPos(F.tsuU), '先手の持ち場', {});
    rt.after(5, () => this.climb(rt));
    F.climbTimer = rt.timers[rt.timers.length - 1];
  },

  // ① 尾根道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.assaultT = rt.t; F.stepT = rt.t;
    rt.setPhase('climb'); rt.objProgress('main', '');
    rt.unmark('tsu');
    siegeSignal(rt, 'susume');
    rt.banner('進みの合図', '法螺貝と進み太鼓。筒井の衆に続け');
    rt.obj('main', '法螺貝と進み太鼓の合図。先手について尾根道を登れ', 'main');
    rt.say('組頭', '法螺と進み太鼓じゃ！　列を離れず、先手に続け！', 4);
    F.guidePoint = { x: OPEN_PT[0], z: OPEN_PT[1] };
    rt.marker('climb', () => this.taskLabel(rt, '') === '先手と尾根の敵を退けよ' ? null : F.guidePoint, () => F.gateWaitT != null ? '先手を待つ所' : F.climbReturning ? '尾根道へ戻る' : '尾根道の角', { guideAlways: true, guideNear: 2 });
    F.climbMarker = rt.markers.find((m) => m.id === 'climb');
    const road = ROAD.slice(0, ROAD.findIndex((p) => p[1] === GATE.z));
    F.gateGather = { x: GATE.x, z: GATE.z + 6 };
    F.oda.forEach((g, i) => march(g, road.slice(Math.max(1, OPEN_I - i) + 1)));
    F.ambCommitted = true; F.amb.ambush = false; F.amb.noAI = false; F.amb.speed = 2.3;
    F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'column'; g.colW = 2; g.seekRange = 24; };
    for (const u of F.amb.units) { u._crouch = false; u.aiT = 0; }
  },

  // ② 物見からの矢を受けながら打ち手を守る
  tower(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t;
    F.climbReturning = false; F.approachByRoad = false;
    rt.setPhase('tower'); rt.objProgress('main', '');
    rt.unmark('amb'); rt.unmark('climb');
    rt.award((t) => t.side.push('尾根の伏兵を退けた'), '伏兵を退けた');
    rt.banner('門の前', '木戸の内から矢が降ってくる');
    rt.obj('main', HI(rt) ? '手の者と門脇に立ち、打ち手を守れ' : '門脇に立ち、打ち手を守れ', 'main');
    rt.say('組頭', '門の右脇へ寄れ。矢を避け、打ち手を守れ！', 3.5);
    const P = TOWER_POST;
    F.tp = P;
    F.approachGuide = { x: P.x, z: P.z };
    rt.marker('tower', () => F.approachGuide, () => F.approachByRoad ? F.climbReturning ? '尾根道へ戻る' : '尾根道の角' : '打ち手を守る所', { h: 3, guideAlways: true, guideNear: 2 });
    rt.addInteract('tower', P, '門脇で打ち手を守る', () => this.coverTower(rt), { r: 3.2, hold: 2 });
    rt.zone('tower', P.x, P.z, 3.2);
    // 打ち手は登城道の最後まで進める。門脇へ下げると、空堀と壊せない柵へ向かってしまう。
    F.ram.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    const cover = F.oda[0];
    if (!gone(cover)) {
      const approach = cover.order === 'path' && cover.path ? cover.path.slice(cover.pathIdx) : [];
      march(cover, approach.concat(TOWER_APPROACH));
      cover.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    }
    // 遅れた先手も折り返しを通る。鉄砲組は道の後ろに止め、斜面への近道をさせない。
    for (let i = 0; i < 2; i++) {
      const g = F.oda[i];
      if (gone(g) || g === cover) continue;
      if (g.order === 'path' && g.path) {
        let stop = 0, best = Infinity;
        for (let j = 0; j < g.path.length; j++) {
          const p = g.path[j], d = Math.hypot(p[0] - GATE.x, p[1] - (GATE.z + 20 + i * 8));
          if (d < best) { best = d; stop = j; }
        }
        if (stop >= g.pathIdx) g.path = g.path.slice(0, stop + 1);
        else g.order = 'hold';
      }
      g.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    }
  },
  coverTower(rt, byPlayer = true) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || F.towerCovered) return;
    F.towerCovered = true;
    rt.uninteract('tower'); rt.unmark('tower'); rt.unzone('tower');
    // 攻め手は櫓に火を放たず、門前の打ち手を守る。
    if (byPlayer) rt.award((t) => t.side.push('矢を防ぎ、門前の打ち手を守った'), '門前の打ち手を守った');
    this.gateFight(rt);
  },

  // ③ 門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.climbReturning = false; F.approachByRoad = false;
    rt.setPhase('gate'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '手の者で打ち手を守れ。門の印で「掛矢で門を打つ」を押し続けよ' : '門の印へ。「掛矢で門を打つ」を押し続けよ', 'main');
    rt.say('組頭', '門の正面へ！　打ち手と力を合わせ、門を打ち破れ！', 3.5);
    // 持ち場の下知は任務の案内から読む。古い門脇の台詞を次の段へ持ち越さない。
    const R = F.ram;
    // 遅れた打ち手も九十九折りを登り切り、土橋の正面から門へ取り付く。
    const approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    // 土橋で北へ向き直ってから到着を判定する。斜めの縦隊のままだと後列が空堀へ出る。
    approach.push([GATE.x, GATE.z + 6], [GATE.x, GATE.z + 4]);
    march(R, approach);
    // 門前の一人が持ち場へ着けば打ち始める。後列五人を待って止めない。
    R.arriveCount = 1; R.arriveRadius = 2;
    R.aggro = 2;
    R.onArrive = (q) => {
      q.order = 'assault'; q.formation = 'column'; q.facing = Math.PI;
      q.assault = () => (F.gate.alive ? F.gate : null);
    };
    for (const g of [F.tsutsui, F.ake]) {
      if (g.order === 'path') g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; q.seekRange = 20; };
      else { g.order = 'hold'; g.formation = 'yari'; g.facing = Math.PI; g.seekRange = 20; }
    }
    const hitPoint = { x: GATE.x, z: GATE.z + 1.4 };
    F.gateHitPoint = hitPoint;
    F.approachGuide = { x: hitPoint.x, z: hitPoint.z };
    rt.marker('gate', () => F.approachGuide, () => F.approachByRoad ? F.climbReturning ? '尾根道へ戻る' : '尾根道の角' : '門を打つ所', { h: 4, guideAlways: true, guideNear: 2 });
    rt.addInteract('ramgate', hitPoint, '掛矢で門を打つ', () => {
      if (F.step !== 3 || F.ending || rt.over || !rt.player.u.alive || !F.gate.alive) return;
      rt.army.damage(F.gate, 55, rt.player.u);
      rt.army.play('wood', GATE, 1.1);
      rt.game.hitstop = 0.05;
    }, { r: 3.4, hold: 0.6 });
    F.sally.aggro = 16; // 木戸の内で構え、攻め手を受ける。
    if (!F.gate.alive) this.interior(rt);

  },

  // ③.5 下の曲輪を足場に取り、西の尾根道から本丸の南の口へ寄せる。
  // 屋敷は独立した守りとして残し、遠い曲輪の全掃討を勝利条件にしない。
  interior(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t;
    rt.setPhase('interior'); rt.objProgress('main', '');
    rt.uninteract('ramgate'); rt.uninteract('tower'); rt.unzone('tower');
    for (const id of ['tower', 'gate', 'sally', 'gather']) rt.unmark(id);
    for (const o of rt.objectives.slice()) if (o.id.startsWith('yagura_take_')) { rt.objRemove(o.id); rt.unmark(o.id); }
    for (const id of Array.from(rt.orderObjectives?.keys() || [])) if (id.startsWith('yagura_take_')) rt.objRemove(id);
    rt.award((t) => t.side.push('門を破った'), '門を破った');
    siegeSignal(rt, 'kakari');
    rt.after(1.8, () => {
      if (!F.ending && !rt.over && rt.player.u.alive && F.step === 3.5) rt.army.play('toki', F.tsuU.pos, 0.7);
    });
    rt.banner('門、破れる', '先手に続き、北尾根の下の曲輪へ進む');
    rt.obj('main', '道の印に続け。下の曲輪の敵を退けよ', 'main');
    rt.say('組頭', '早打ちは懸かれの合図じゃ！　門を抜け、北の曲輪へ寄せよ！', 4);
    for (const q of F.oda) march(q, ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1));
    F.ram.assault = null;
    // 柵の口から八歩も曲輪に含める。後列五人の到着を待たず、敵を退ければ確保できる。
    const entry = (id, c) => (x, z) => F.C.kuruwa[id].test(x, z)
      || Math.hypot(x - c.x, z - c.z - c.r) <= 8;
    const entryShu = (x, z) => (F.C.kuruwa.shu.test(x, z) && z > TOP.z - 1)
      || Math.hypot(x - TOP.x, z - TOP.z - TOP.r) <= 8;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'ridge1', name: '北尾根の曲輪（下）', test: entry('ridge1', RIDGE1), pos: F.C.kuruwa.ridge1.centroid, need: 1, hold: 5 },
        { id: 'ridge2', name: '北尾根の曲輪（上）', test: F.C.kuruwa.ridge2.test, pos: F.C.kuruwa.ridge2.centroid, need: 5, hold: 10 },
        { id: 'yashiki', name: '松永屋敷', test: F.C.kuruwa.yashiki.test, pos: F.C.kuruwa.yashiki.centroid, need: 5, hold: 10 },
        { id: 'shu', name: '本丸', test: entryShu, pos: { x: TOP.x, z: TOP.z + 8 }, need: 2, hold: 8 },
      ],
      links: [['ridge1', 'ridge2'], ['ridge1', 'yashiki'], ['ridge2', 'shu'], ['yashiki', 'shu']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      // 退く兵・負傷兵・本丸の館内の父子で曲輪の確保を止めない。
      unitFilter: (u) => !u.fleeing && !u.woundOut && !u.gone && !u.noTarget,
      onFall: (id) => this.onZoneFall(rt, id),
    });
    this.castleGuide(rt, ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1), 'rg1', '敵のいる下の曲輪');
    F.lowerBest = Infinity; F.lowerStallAt = rt.t;

  },
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.SZ.byId[id].owner !== ZONE_STATE.FRIEND) return;
    if (id === 'ridge1') {
      if (F.lowerTaken) return;
      F.lowerTaken = true; F.stepT = rt.t;
      rt.award((t) => t.side.push('北尾根の下の曲輪を取った'), '下の曲輪を取った');
      rt.unmark('rg1'); F.innerDone = true; F.innerRoute = 'ridge2';
      rt.say('組頭', 'よし、味方の足場ができた！　西の尾根道を回り、本丸の南の口へ寄せよ！', 4.5);
      this.honmaru(rt);
    } else if ((id === 'ridge2' || id === 'yashiki') && F.lowerTaken) {
      rt.award((t) => t.side.push(id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ'), id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ');
    }
  },

  // ④ 本丸の館の前
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru'); rt.objProgress('main', '');
    rt.unmark('gate'); rt.unmark('sally');
    siegeSignal(rt, 'susume');
    rt.banner('本丸へ', '木戸の内で、松永の衆が槍をそろえる');
    rt.obj('main', '道の印で西の尾根道から本丸の南口へ。敵を退け、先手と守れ', 'main');
    rt.say('組頭', '進み太鼓じゃ！　西の尾根道から本丸の南口へ！　敵を退け、先手と口を守れ！', 4);
    rt.marker('l1', centerOf(F.last[0]), '本丸の守り', { red: true, group: F.last[0] });
    rt.unmark('rg2'); rt.unmark('yashiki'); rt.unmark('branch'); rt.uninteract('yashikiRoute');
    const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
    // 本丸への下知で上の曲輪の中心へ往復させない。屋敷からの帰路にもある西の帯道を使う。
    // 別の先手へ任せた下の曲輪にも入り直さず、南の口から同じ帯道へ進む。
    const west = ROAD.findIndex((p) => p[0] === -60 && p[1] === -166);
    const route = F.innerRoute === 'yashiki' ? ROUTES.find((q) => q.id === 'yashiki').pts.slice(6).concat([[0, TOP.z + 8]])
      : ROAD.slice(F.lowerBypass ? a + 1 : a, a + 2).concat(ROAD.slice(west));
    const approachEnd = F.lowerBypass ? ROAD[a] : route[0];
    for (const q of F.oda) {
      // 遅れた隊は通りかけの道から合流。未通過の柵や切岸を直線で横切らせない。
      const end = q.path?.[q.path.length - 1];
      const approach = q.order === 'path' && end && end[0] === approachEnd[0] && end[1] === approachEnd[1]
        ? q.path.slice(q.pathIdx, -1) : [];
      march(q, approach.concat(route));
    }
    // 本人も通過前の角を保つが、任せた曲輪の中心へ向かう最後の区間だけは外す。
    let previous = F.castleRoute || [];
    const from = F.castleGuideI || 1;
    if (F.lowerBypass) {
      const mouth = previous.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z + RIDGE1.r);
      if (mouth >= 0) previous = previous.slice(0, mouth + 1);
    }
    this.castleGuide(rt, previous.concat(route), 'honmaru', '本丸の南口');
    // 六歩に分け直すと丸め誤差で古い区間が再分割される。同じ番号でなく、同じ角を引き継ぐ。
    const oldPoint = previous[Math.min(from, previous.length - 1)];
    if (oldPoint) {
      const index = F.castleRoute.findIndex((p) => Math.hypot(p[0] - oldPoint[0], p[1] - oldPoint[1]) < 0.01);
      F.castleGuideI = index > 0 ? index : Math.min(from, F.castleRoute.length - 1);
    }
    F.castleGuidePoint.x = F.castleRoute[F.castleGuideI][0];
    F.castleGuidePoint.z = F.castleRoute[F.castleGuideI][1];
    rt.after(6, () => { if (!F.ending && !rt.over && rt.player.u.alive) this.betrayal(rt); });
  },

  // 遠い目的地へ直進させず、味方と同じ道の次の角を示す。入れ物は段の始めに一度だけ作る。
  castleGuide(rt, route, id, label) {
    const F = rt.flags;
    // 登城道への帰り指示を、門を抜けた後の下知へ持ち越さない。
    F.climbReturning = false;
    // 長い直線も六歩ずつ示す。遠い角だけを指して、途中の坂や柵を横切らせない。
    const points = [route[0]];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (distance < 0.01) continue; // 前の道の終点と、次の道の始点の重複を除く。
      const n = Math.max(1, Math.ceil(distance / 6));
      for (let k = 1; k <= n; k++) points.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    route = points;
    F.castleRoute = route; F.castleGuideI = 1; F.castleGuideReturning = false; F.castleGuideArrived = false;
    F.castleGuidePoint = { x: route[1][0], z: route[1][1] };
    F.castleGuideProbe = { x: 0, z: 0 };
    F.castleExit = { room: null, through: false, guide: null };
    F.castleGuideLeaving = false; F.castleGuideBlocked = false;
    // 外壁と櫓の脚組みを回る角は、この段の始めに一度だけ用意する。
    const obstacles = [...BUILDINGS, { ...TOWER, w: 5, d: 5 },
      { x: RIDGE1.x - 7, z: RIDGE1.z - 4, w: 5, d: 5 },
      { x: RIDGE4.x - 5, z: RIDGE4.z + 1.5, w: 5, d: 5 },
      { x: YASHIKI.x - 6, z: YASHIKI.z + 7, w: 5, d: 5 }];
    const corners = obstacles.map((o) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const x = o.x + sx * (o.w / 2 + 1.2), z = o.z + sz * (o.d / 2 + 1.2);
      return { x, y: rt.world.heightAt(x, z), z, near: false, from: false, to: false };
    }));
    // 押されて柵の外へ出た時も、実際の端から口へ戻す。建物の角だけでは
    // 長い板塀の脇に戻り口が見つからない。道に近い区画の角を支度時だけ足す。
    for (const s of rt.army.units) {
      if (!s.alive || !s.isStruct || !s.seg) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.1 || !route.some(([x, z]) => Math.min(Math.hypot(x - ax, z - az), Math.hypot(x - bx, z - bz)) < 12)) continue;
      const tx = dx / len * 1.2, tz = dz / len * 1.2, nx = -tz, nz = tx;
      corners.push([[ax - tx + nx, az - tz + nz], [bx + tx + nx, bz + tz + nz],
        [bx + tx - nx, bz + tz - nz], [ax - tx - nx, az - tz - nz]].map(([x, z]) =>
        ({ x, y: rt.world.heightAt(x, z), z, near: false, from: false, to: false })));
    }
    F.castleGuideBend = { goal: { x: 0, y: 0, z: 0 }, probe: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 },
      turn: { x: 0, y: 0, z: 0 }, corners, twoTurns: false, active: false, next: 0 };
    F.castleGuideDetouring = false;
    rt.marker(id, () => F.castleGuideBlocked || this.castleFightNeeded(rt) ? null : F.castleGuidePoint, () => F.castleGuideLeaving ? rt.player.u.nakaLevel > 0 ? '下り階段へ' : '戸口から外へ' : F.castleGuideDetouring ? '建物や柵の回り道' : F.castleGuideReturning ? '道へ戻る' : F.castleGuideI === route.length - 1 ? label : id === 'honmaru' ? '本丸へ続く尾根道' : '曲輪へ続く尾根道', { guideAlways: true, guideNear: 2 });
  },

  // 内通の伝承を遊びの段として残す。久秀による天主の放火とは分ける。
  betrayal(rt) {
    const F = rt.flags;
    if (F.betrayed) return;
    F.betrayed = true; F.betrayalAt = rt.t;
    const g = F.mori;
    g.team = 0; g.noAI = false; g.aggro = 18; g.seekRange = 24; g.order = 'hold'; g.facing = Math.PI;
    for (const u of g.units) { u.team = 0; u.noTarget = false; u.invuln = false; u.target = null; u.aiT = 0; u.playerOpeningBlocked = false; }
    // 古い敵の狙いを消す。味方になった鉄砲組へ味方が撃ち続けない。
    for (const u of rt.army.units) if (u.target?.team === u.team) { u.target = null; u.aiT = 0; }
    rt.banner('城内の内通', '森好久の寝返りは、後世の伝えに沿う場面');
    rt.say('使番', '城内の鉄砲組が織田方へ寝返ったとの知らせじゃ！', 5);
  },

  win(rt, otherFront = false) {
    const F = rt.flags;
    if (F.ending || F.endPending) return;
    // 諸口の決着が先でも、内通の段を父子の最期の知らせより前に見せる。
    if (!F.betrayed || rt.t - F.betrayalAt < 8) {
      this.betrayal(rt); F.endPending = true;
      rt.after(Math.max(0.5, 8 - (rt.t - F.betrayalAt)), () => {
        F.endPending = false;
        // 待つ間に本丸を押し返された時は、本人の城取りをまだ認めない。
        const zone = F.SZ?.byId.shu;
        const held = otherFront || zone?.owner === ZONE_STATE.FRIEND && zone.test(rt.player.u.pos.x, rt.player.u.pos.z);
        if (held && !F.ending && !rt.over && rt.player.u.alive) this.win(rt, otherFront);
      });
      return;
    }
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (const id of ['tsu', 'amb', 'branch', 'climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
    rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower');
    // 落城を見聞きできる本丸の兵だけに伝える。離れた曲輪の守りは残す。
    for (const q of F.last || []) if (!gone(q) && Math.hypot(q.center().x - TOP.x, q.center().z - TOP.z) < TOP.r + 12) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    if (otherFront && F.reachedShu) {
      rt.objDone('main'); rt.tracker.main = true;
      rt.say('組頭', '諸口の味方と本丸へ攻め入ったぞ！　口を固めよ！', 5);
      rt.award((t) => { t.main = true; t.special = { label: '信貴山城の本丸の南口まで攻め上った', pts: 15 }; }, '信貴山城を攻め落とした');
    } else if (otherFront) {
      rt.objFail('main'); rt.tracker.main = false;
      rt.say('組頭', '諸口の味方が本丸へ入った！　こちらは持ち場を守れ！', 5);
    } else {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.special = { label: '信貴山城の本丸の館の前まで攻め入った', pts: 20 }; }, '信貴山城を攻め落とした');
    }
    sfx('horagai', 0.8);
    rt.banner('久秀、天主に火をかける', '信長公記は、久秀が自ら火をかけて焼死したと記す');
    const W = rt.world;
    // 館の南壁から火を出す。軒の外の空中へ置かず、根元は壁の足元に残す。
    F.castleFire = W.addFire(KEEP_AT.x, KEEP_AT.z + ATTACK_PLAN.lordSeat.d / 2 - 0.2,
      { size: 2, h: 0.45, blackSmoke: true });
    F.castleFireAt = rt.t;
    // 城内の自害は戦後の語りで知らせ、足軽による討取りにしない。
    for (const u of [F.ehon.lord, F.hisamichi]) { u.alive = false; u.noTarget = true; if (u.mesh) u.mesh.visible = false; }
    // 天守の上の階で、久秀が名物の茶釜「平蜘蛛」とともに果てる（釜を砕いた・火薬で爆ぜたは、のちの伝え）
    rt.marker('keep', { x: KEEP_AT.x, z: KEEP_AT.z }, '天守の上の階', { h: KEEP_AT.up + 2 });
    rt.after(1.2, () => rt.say('', '――久秀が天主に火をかけた。ここからの平蜘蛛と爆発の場面は、後世の伝えに沿う', 3));
    rt.after(2.0, () => {
      // 爆ぜる場面を見せる。動きを減らす設定でも向きを変えるだけ（揺れは設定に従う）
      const P = rt.player?.u?.pos;
      if (P && rt.player.u.alive && !rt.player.lock && Math.hypot(KEEP_AT.x - P.x, KEEP_AT.z - P.z) < 90) rt.player.cine = { x: KEEP_AT.x, z: KEEP_AT.z, up: KEEP_AT.up, t: 5 };
    });
    rt.after(3.4, () => { keepBlast(rt); rt.banner('天守が爆ぜた（伝承）', '平蜘蛛と爆発は、信長公記に記されていない'); });
    rt.after(5.2, () => rt.say('', '――天守の上の階が火を噴いた。久秀は平蜘蛛の釜とともに果てたと伝わる。久通も城内で最期を迎えた', 5));
    rt.after(10.5, () => { rt.unmark('keep'); rt.say('', '――大和の山城は落ちた。だが、大坂では本願寺との戦が続く', 4.5); });
    // 固有の終幕を保つ。共通の追撃へ移ると、父子の最期を伝える台詞が消える。
    rt.after(0.5, function growFire() {
      shigisan.withdrawTick(rt);
      if (!rt.ended && rt.t - F.castleFireAt < 12) rt.after(0.5, growFire);
    });
    rt.finish({ scriptedEnd: true, failureReason: otherFront && !F.reachedShu
      ? '本丸の持ち場を取る前に、別の攻め口の味方が城を落とした。' : undefined }, 15);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    // 最初の一人を見失っても、他の守兵がいつまでも本人を見逃さない。
    if (F.step >= 1 && rt.t - F.assaultT >= 25) F.firstFightDone = true;
    // 最初は見える徒歩の敵一人だけが本人へ打ちかかる。味方との戦いは続く。
    if (F.step >= 1 && rt.t >= 12 && !F.firstFoe && !F.firstFightDone) {
      let nearest = 12;
      for (const u of F.amb.units) if (u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u) && !rt.army.wallBetween(u.pos, -1, rt.player.u.pos)) {
        const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
        if (d < nearest) { nearest = d; F.firstFoe = u; }
      }
      if (F.firstFoe) { rt.say('組頭', '敵が来るぞ！　槍をそろえ、ここで食い止めよ！', 4); }
      else if (F.step >= 2 && gone(F.amb)) F.firstFightDone = true;
    }
    if (F.firstFoe && !F.firstFightDone) {
      const u = F.firstFoe, p = rt.player.u;
      if (!u.alive || u.fleeing || u.woundOut) F.firstFightDone = true;
      else {
        u.target = p; u.aiT = 0.5;
        if (F.firstFightT == null && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 3 && !rt.army.wallBetween(u.pos, -1, p.pos)) F.firstFightT = rt.t;
        if (F.firstFightT != null && rt.t - F.firstFightT >= 12) F.firstFightDone = true;
      }
    }
    if (rt.t >= F.sgFrontAt) {
      F.sgFrontAt = rt.t + 0.5; F.sgFront.length = 0;
      const p = rt.player.u, limit = F.firstFightDone ? (F.step < 3.5 ? 2 : 3) : 1;
      for (const u of rt.army.units) {
        if (u.team === p.team || !u.alive || u.fleeing || u.woundOut || u.gone || u.noTarget || u.isStruct || u.group?.noAI || u.group?.ambush) continue;
        if ((u.type === 'gun' || u.type === 'bow') && !u.sidearm || !F.firstFightDone && u !== F.firstFoe) continue;
        const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
        if (d > 12 || Math.abs(u.pos.y - p.pos.y) > 3 || !localClear(rt.army, u.pos, p.pos, true)) continue;
        u.sgDistance = d;
        let i = 0;
        while (i < F.sgFront.length && F.sgFront[i].sgDistance <= d) i++;
        if (i < limit) {
          for (let j = Math.min(limit - 1, F.sgFront.length); j > i; j--) F.sgFront[j] = F.sgFront[j - 1];
          F.sgFront[i] = u;
        }
      }
    }
    F.sgRest = F.firstFightDone && (rt.t - F.assaultT) % 8 >= 6;
    for (const u of rt.army.units) if (u.team === 1) {
      const ranged = (u.type === 'gun' || u.type === 'bow') && !u.sidearm;
      u.playerOpeningBlocked = rt.t < 12 || (!F.firstFightDone ? u !== F.firstFoe : !ranged && (F.sgRest || !F.sgFront.includes(u)));
    }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    // 六分半で諸口の夜攻めが決着する。内通八秒と終幕十五秒を含めても七分以内。
    // 本人の本丸取りの戦功は実際に取った時だけ。
    // 内通の段と、久秀による放火・父子の最期の知らせを順に伝えて終える。
    // 本丸の南口まで攻め上り、口で二十秒戦えば、諸口の味方と本丸を落とした事にする（館の守り二十人を一人で討ち尽くさせない。bot 10/26）。
    if (F.step === 4 && !F.reachedShu) {
      const P = rt.player.u.pos, z = F.SZ?.byId.shu;
      if (z?.test(P.x, P.z) || Math.hypot(P.x - TOP.x, P.z - (TOP.z + TOP.r + 4)) < 10) { F.shuT = (F.shuT || 0) + dt; if (F.shuT >= 20) { F.reachedShu = true; F.reachedWinAt = rt.t + 15; } }
    }
    if (F.reachedWinAt && rt.t >= F.reachedWinAt) { this.win(rt, true); return; }
    if (rt.t >= 390) { this.win(rt, true); return; }
    // 別口による落城を、戦後に初めて知らされないよう一度だけ伝える。
    if (rt.t >= 330 && !F.otherFrontSaid) {
      F.otherFrontSaid = true;
      rt.say('使番', F.step >= 3.5
        ? '別の攻め口の味方が本丸へ迫る！　こちらも先手と本丸の南口へ！'
        : '別の攻め口の味方が本丸へ迫る！　こちらは先手と今の持ち場を守れ！', 6);
    }
    // 門の内の控えを門外へ呼び出さない。段を越えた守兵だけを寄せる。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, F.step < 3.5 ? [F.amb] : F.step < 4 ? [F.rg1, F.rg2, F.ryk] : F.last, F.oda, this.taskLabel(rt, '先手の旗に続け'));
    F.watchT = (F.watchT || 0) - dt;
    if (F.watchT <= 0) {
      F.watchT = 0.5;
      // 交代した兵は元の備えの並びへ戻る。将を一番前の枠へ寄せない。
      for (const a of rt.world.armies || []) if (a.jinkeiGuard) for (const g of a.wk?.groups || []) {
        if (g.sgSlots) continue;
        g.noAI = true; g.guard = true; g.guardLeash = 12;
        g.sgSlots = g.units.map((u) => ({ dx: u.pos.x - g.anchor.x, dz: u.pos.z - g.anchor.z, x: u.pos.x, z: u.pos.z }));
        const slotPos = g.slotPos;
        g.slotPos = function (i, n) {
          const p = this.sgSlots[i];
          if (!p || this.order !== 'hold' || this.routed) return slotPos.call(this, i, n);
          p.x = this.anchor.x + p.dx; p.z = this.anchor.z + p.dz; return p;
        };
      }
      // 本丸の控えだけを、つながる上の曲輪へ送る。大将の護衛は動かさない。
      if (F.SZ && !F.defenseSent && !gone(F.last[1]) &&
          F.SZ.byId.ridge2.owner !== ZONE_STATE.FRIEND &&
          (F.rg2.count <= F.rg2.initial * 0.6 || F.SZ.byId.ridge2.friends > 0)) {
        F.defenseSent = true;
        const i = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
        march(F.last[1], ROAD.slice(i).reverse());
        F.last[1].onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; q.seekRange = 18; };
      }
      if (F.defenseSent && !F.counterSent && !gone(F.last[1]) && F.last[1].order === 'hold' &&
          F.SZ.byId.ridge2.owner !== ZONE_STATE.FRIEND && F.SZ.byId.ridge1.owner === ZONE_STATE.FRIEND) {
        F.counterSent = true;
        const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
        const b = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
        march(F.last[1], ROAD.slice(a, b + 1).reverse());
        F.last[1].onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.seekRange = 18; };
      }
      for (const w of F.withdraw) if (!gone(w.g) && (!w.sent || w.g.order === 'path') && (w.g.count <= w.g.initial * 0.55 || w.g.morale < 55)) {
        if (!withdrawalOpen(rt, w)) { w.sent = false; w.g.order = 'hold'; w.g.formation = 'yari'; w.g.aggro = 14; w.g.onArrive = null; continue; }
        if (w.sent) continue;
        w.sent = true; march(w.g, w.path); w.g.pathIdx = w.start + 1; w.g.facing = 0; w.g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.facing = 0; q.aggro = 14; };
      }
    }
    if (F.step === 1) {
      const p = rt.player.u.pos, end = CLIMB_END;
      climbWayPoint(rt.player, ROAD[end][0], ROAD[end][1], F.guidePoint);
      if (!F.ambSeen && F.amb.units.some((u) => u.alive && (u.target || !u._crouch))) {
        F.ambSeen = true;
        rt.say('足軽', '尾根に松永勢がおるがや！', 3);
        rt.obj('main', '尾根の松永勢を崩し、門の前へ進め', 'main');
        rt.marker('amb', centerOf(F.amb), '尾根の松永勢', { red: true, group: F.amb });
      }
      let available = 0, arrived = 0;
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - F.gateGather.x, u.pos.z - F.gateGather.z) < 18) arrived++; }
      const need = Math.min(5, Math.ceil(available / 2));
      let roadThreat = false;
      for (const u of F.amb.units) if (u.alive && !u.fleeing && !u.woundOut) {
        for (let i = 1; i <= CLIMB_END; i++) if (Math.hypot(u.pos.x - ROAD[i][0], u.pos.z - ROAD[i][1]) < 18) { roadThreat = true; break; }
        if (roadThreat) break;
      }
      const atGate = Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 20;
      const wait = F.climbWait || (F.climbWait = { arrived: 0, need: 0 });
      wait.arrived = arrived; wait.need = need;
      if ((gone(F.amb) || F.ambCommitted && !roadThreat) && need > 0 && arrived >= need && atGate) this.tower(rt);
      // 先手が切岸の上の物見へ槍を向けて坂の途中で止まると、門前に揃わず次の段へ進めなかった（bot が 480 秒で失敗）。
      // 敵が道から退いたら、遅れた隊をすぐ道へ戻す。十二秒で着いた者から門脇へ移る。
      // 尾根の伏兵が道の脇に残って退かないと、門前で三分待たせていた（bot 10/26）。門前に着いて一分たてば、残りは先手に任せて進める。
      else if (F.step === 1 && atGate && (!roadThreat || rt.t - F.stepT > 60)) {
        F.gateWaitT = F.gateWaitT ?? rt.t;
        if (F.reMarchT == null || rt.t - F.reMarchT >= 8) {
          F.reMarchT = rt.t;
          const road = ROAD.slice(0, ROAD.findIndex((q) => q[1] === GATE.z));
          for (const g of F.oda) {
            if (gone(g)) continue;
            const c = g.center();
            if (Math.hypot(c.x - F.gateGather.x, c.z - F.gateGather.z) < 18) continue;
            let near = 0, nd = Infinity;
            for (let i = 0; i < road.length; i++) { const d = Math.hypot(road[i][0] - c.x, road[i][1] - c.z); if (d < nd) { nd = d; near = i; } }
            g.focus = null; g.aggro = 6; g.seekRange = 8;
            for (const u of g.units) { u.target = null; u.aiT = 0; }
            march(g, road.slice(near + 1));
          }
          if (!F.waitSaid) { F.waitSaid = true; rt.say('組頭', '後ろの者を呼び寄せる。門前で備えよ。すぐ打ち手を守るぞ！', 3.5); }
        }
        if (rt.t - F.gateWaitT >= 12) this.tower(rt);
      } else if (F.step === 1) {
        F.gateWaitT = null;
        F.reMarchT = null; F.waitSaid = false;
        // 伏兵が崩れて二分たてば、先手が門前を押さえた事にして次の段（門脇の守り）へ。印が門へ導く。
        if (!ambLive(F.amb) && !roadThreat && rt.t - F.stepT > 120) this.tower(rt);
      }
      // 待つ下知の間は歩数と進む矢印を出さない。離れたら元の尾根道の案内へ戻す。
      // 門前の判定・十二秒の待ち時間はそのまま、既存の印を待機用に切り替える。
      if (F.step === 1) {
        const waiting = F.gateWaitT != null, marker = F.climbMarker;
        marker.waitGuide = waiting; marker.guideRadius = waiting ? 20 : 2;
        if (waiting) {
          F.guidePoint.x = F.gateGather.x; F.guidePoint.z = F.gateGather.z;
        }
      }
      // 走り抜けても伏兵を退けたことにしない。門前に寄せ、同じ兵と戦わせる。
      if (F.step === 1 && roadThreat && !F.gateChallenge && Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 20) {
        F.gateChallenge = true; F.amb.ambush = false; F.ambCommitted = true;
        if (!gone(F.amb)) {
          march(F.amb, ROAD.slice(OPEN_I + 1, CLIMB_END + 1));
          F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.seekRange = 24; };
        }
        rt.say('組頭', gone(F.amb) ? '門前に敵が残るぞ！　槍をそろえて押し返せ！' : '尾根の敵が追って来るぞ！　先手と踏みとどまれ！', 4);
      }
    }
    F.guideT = (F.guideT || 0) - dt;
    if (F.guideT <= 0) {
      F.guideT = F.step >= 3.5 ? 0.5 : 1;
      if (F.step === 1) {
        // 伏兵が逃げ散ったら、崖の上下を指す赤い印を消し、道の印だけを残す。
        if (F.ambSeen && !ambLive(F.amb)) rt.unmark('amb');
        rt.objProgress('main', F.gateWaitT != null && F.climbWait ? `門前で備えよ。あと${Math.max(0, Math.ceil(12 - (rt.t - F.gateWaitT)))}秒で門脇へ` : !ambLive(F.amb) ? '敵は退いた。先手と門前へ' : sightPoint(rt, F.amb.anchor) ? '先手と尾根の松永勢を退けよ' : '尾根道を進め。先手を離れるな');
      }
      if (F.step === 2 || F.step === 3) {
        const p = rt.player.u.pos, target = F.step === 2 ? TOWER_POST : F.gateHitPoint;
        // 南北の位置が門に近くても、櫓横の切岸から持ち場へは直進できない。
        F.approachByRoad = p.z > GATE.z + 9 || !guideClear(rt, p, target);
        if (F.approachByRoad) climbWayPoint(rt.player, GATE.x, GATE.z + 6, F.approachGuide);
        else {
          // 道から持ち場へ着いたら、前の折り返しで出した「道へ戻れ」を解除する。
          F.climbReturning = false;
          F.approachGuide.x = target.x; F.approachGuide.z = target.z;
        }
      }
      if (F.step === 2) rt.objProgress('main', '門の右脇の印へ。「門脇で打ち手を守る」を押し続けよ');
      if (F.step === 3.5 || F.step === 4) {
        const route = F.castleRoute, p = rt.player.u.pos;
        const id = F.step === 4 ? 'shu' : F.SZ.byId.ridge1.owner !== ZONE_STATE.FRIEND ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
        const zone = F.SZ.byId[id];
        const inside = zone.test(p.x, p.z);
        // 口を離れたら、同じ平場でも到着扱いを解く。
        // 歩いて戻れる事と、今ここで守れる事は別。道案内を再開して先手へ戻す。
        if (F.castleGuideArrived && !inside) F.castleGuideArrived = false;
        // 戦いながら目的の口へ着いた者を、未通過の古い曲がり角へ戻さない。
        // 同じ平場から最後の印まで歩ける時だけ。柵越し・切岸の上下は到着にしない。
        if (!F.castleGuideArrived && inside) {
          const goal = route[route.length - 1], probe = F.castleGuideProbe;
          probe.x = goal[0]; probe.z = goal[1];
          if (guideClear(rt, p, probe)) {
            F.castleGuideI = route.length - 1; F.castleGuideArrived = true;
          }
        }
        // 打ち合いで数歩先へ押されても、通過済みの角まで引き返させない。
        // 近い先の道に実際に歩いて届く時だけ進める。柵越しや別の段は飛ばさない。
        if (!F.castleGuideArrived) {
          const probe = F.castleGuideProbe;
          let nearest = Infinity, next = F.castleGuideI;
          for (let i = F.castleGuideI; i < Math.min(route.length, F.castleGuideI + 13); i++) {
            const a = route[i - 1], b = route[i], dx = b[0] - a[0], dz = b[1] - a[1];
            // 行き帰りが重なる曲輪の口でも、折り返す先を先読みしない。
            // まず今の道の端へ着いてから、下の到着判定で次へ進める。
            if (i > F.castleGuideI) {
              const prev = route[i - 2];
              if ((a[0] - prev[0]) * dx + (a[1] - prev[1]) * dz < 0) break;
            }
            const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
            probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
            const d = Math.hypot(p.x - probe.x, p.z - probe.z);
            if (d >= INNER_HALF || d >= nearest - 0.25 || !guideClear(rt, p, probe)) continue;
            // 道の横へ届いても、その先が板壁なら次の角へ飛ばさない。
            const end = F.castleGuideBend.goal;
            end.x = b[0]; end.z = b[1];
            if (!guideClear(rt, p, end)) continue;
            nearest = d; next = i;
          }
          F.castleGuideI = next;
        }
        while (F.castleGuideI < route.length - 1) {
          const a = route[F.castleGuideI - 1], b = route[F.castleGuideI];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1);
          // 打ち合いで角の先へ押された者にも、今立つ道の続きを示す。
          // 曲輪へ入り、同じ道を戻る折り返しは実際に角まで進ませる。
          const c = route[F.castleGuideI + 1], nx = c[0] - b[0], nz = c[1] - b[1];
          const nextT = ((p.x - b[0]) * nx + (p.z - b[1]) * nz) / (nx * nx + nz * nz || 1);
          const pastCorner = dx * nx + dz * nz >= 0 && nextT > 0 && nextT <= 1
            && Math.hypot(p.x - b[0] - nx * nextT, p.z - b[1] - nz * nextT) < INNER_HALF;
          // 城内の細道の幅で到着を読む。柵や切岸を挟む角は、近くても通ったことにしない。
          const probe = F.castleGuideProbe;
          probe.x = b[0]; probe.z = b[1];
          if (Math.hypot(p.x - b[0], p.z - b[1]) >= 3 && !pastCorner && !(t >= 1 && t < 1.2 && Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < INNER_HALF)) break;
          if (!guideClear(rt, p, probe)) break;
          // 角の三歩手前で曲がると柵の内側へ食い込む。次の印へ通れる所まで角を保つ。
          probe.x = c[0]; probe.z = c[1];
          // 角に着いても次が番所で隠れる時は、次の区間へ進めて回り道を探す。
          // 古い角を足元に残したままでは、回り道の探索まで届かない。
          if (!guideClear(rt, p, probe) && Math.hypot(p.x - b[0], p.z - b[1]) > 0.8) break;
          F.castleGuideI++;
        }
        F.castleGuidePoint.x = route[F.castleGuideI][0]; F.castleGuidePoint.z = route[F.castleGuideI][1];
        if (inside && F.castleGuideI === route.length - 1 && Math.hypot(p.x - F.castleGuidePoint.x, p.z - F.castleGuidePoint.z) < 3
            && guideClear(rt, p, F.castleGuidePoint)) F.castleGuideArrived = true;
        // 道を外れた時は、いま通る区間へ戻る場所を示す。遠い角への斜めの近道を避ける。
        const a = route[F.castleGuideI - 1], b = route[F.castleGuideI];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const probe = F.castleGuideProbe;
        probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
        // 押し合いで通過済みの道へ落ちた時は、そこから戻れる口を探す。
        // 今の角だけを指すと、間の切岸を登ろうとして何分も止まる。
        let returnDistance = Math.hypot(p.x - probe.x, p.z - probe.z);
        // 道端から三歩以内でも、切岸や柵を挟めば直進できない。
        const blockedCorner = !F.castleGuideArrived && !guideClear(rt, p, F.castleGuidePoint);
        const detouring = blockedCorner && guideAround(rt, p, F.castleGuidePoint);
        let rejoined = false;
        // 道の上で次の角が塞がれただけなら、末尾の回り道で避ける。
        // 足元に近い通過済みの道へ戻すと、番所の脇で案内が前後し続ける。
        // 戻り口を探すのは、道幅の外か、今の道との間に柵・切岸がある時だけ。
        if (!F.castleGuideArrived && !detouring && blockedCorner && (returnDistance > INNER_HALF || !guideClear(rt, p, probe))) {
          let best = Infinity, rejoin = F.castleGuideI, rx = probe.x, rz = probe.z;
          // 打ち合いで先の道へ出た者も、歩いて届く区間へ戻す。
          // 通過済みの道だけを探すと、背後の切岸を登れず足元の印から動けなくなる。
          // 押し合いで先の曲輪へ出た時は、十三区間先より遠い道にも戻れる。
          // 直進できる点とその先の角だけを選ぶ。遠い区間は一度の距離計算で外す。
          const current = F.castleGuideI, last = route.length - 1;
          for (let i = 1; i <= last; i++) {
            const ra = route[i - 1], rb = route[i], vx = rb[0] - ra[0], vz = rb[1] - ra[1];
            const s = Math.max(0, Math.min(1, ((p.x - ra[0]) * vx + (p.z - ra[1]) * vz) / (vx * vx + vz * vz || 1)));
            if (Math.hypot(p.x - ra[0] - vx * s, p.z - ra[1] - vz * s) > Math.min(60, best)) continue;
            // 真横の一点が柵で塞がれていても、同じ道の口から戻れる。
            // 六歩以下の区間を一歩半ずつ調べ、入れ物は使い回す。
            const n = Math.max(1, Math.ceil(Math.hypot(vx, vz) / 1.5));
            for (let k = -1; k <= n; k++) {
              const t = k < 0 ? s : k / n;
              probe.x = ra[0] + vx * t; probe.z = ra[1] + vz * t;
              const d = Math.hypot(p.x - probe.x, p.z - probe.z);
              const score = d + Math.abs(i - current) * .1;
              if (d > 60 || score >= best || !guideClear(rt, p, probe)) continue;
              // 戻った点から道の次の角まで歩ける事も確かめる。
              // 足元だけ通れる行き止まりを選ぶと、同じ切岸を登り続ける。
              const end = F.castleGuideBend.goal;
              end.x = rb[0]; end.z = rb[1]; end.y = rt.world.heightAt(end.x, end.z);
              if (!guideClear(rt, probe, end)) continue;
              best = score; rejoin = i; rx = probe.x; rz = probe.z;
            }
          }
          if (best < Infinity) {
            probe.x = rx; probe.z = rz;
            F.castleGuideI = rejoin;
            F.castleGuidePoint.x = route[rejoin][0]; F.castleGuidePoint.z = route[rejoin][1];
            returnDistance = Math.hypot(p.x - rx, p.z - rz);
            rejoined = true;
          } else {
            // 戻れる口がなければ、元の角を残して近場の回り道を探す。
            probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
          }
        }
        // 道端で札が行き来しないよう、一度戻し始めたら中央近くまで案内を保つ。
        // 戻り口に着いたら次の角へ。塞がれた古い角の判定で足元を指し続けない。
        F.castleGuideReturning = !F.castleGuideArrived && !detouring && (blockedCorner || rejoined) && (rejoined || guideClear(rt, p, probe))
          && returnDistance > (F.castleGuideReturning || rejoined ? 1.2 : INNER_HALF);
        if (F.castleGuideReturning) { F.castleGuidePoint.x = probe.x; F.castleGuidePoint.z = probe.z; }
        F.castleGuideDetouring = detouring || !F.castleGuideArrived && guideAround(rt, p, F.castleGuidePoint);
        F.castleGuideLeaving = castleExitGuide(rt, F.castleGuidePoint);
        // 回り道も戻り口も見つからない時は、崖の向こうの角を進む印にしない。
        // 次の探索で歩ける道が見つかれば、自動で印を戻す。道順と終戦の時計は保つ。
        // 室内の階段は地面の道と別の床。外の崖判定で出口の案内を消さない。
        F.castleGuideBlocked = !F.castleGuideLeaving && !F.castleGuideArrived && !guideClear(rt, p, F.castleGuidePoint);
        rt.objProgress('main', F.castleGuideLeaving ? rt.player.u.nakaLevel > 0 ? '下り階段の印へ。下の階から戸口へ戻れ' : F.castleExit.through ? '戸口を抜け、踏み段から道へ戻れ' : '戸口の内側の印へ。壁を回って外へ戻れ'
          : F.castleGuideDetouring ? '建物や柵を回り、印から尾根道へ進め'
          : (F.castleGuideReturning || !rt.world.onRoad(p.x, p.z)) && !inside ? '崖を登らず、道の印へ戻れ。そこから尾根道を進め'
          : zone.owner === ZONE_STATE.FRIEND ? F.step === 4 ? !inside ? '本丸を取った。南口の印で先手と守れ' : '先手と南口を守り、残る敵を退けよ' : '味方が曲輪を取った。道の印から本丸の南口へ'
          : zone.enemies > 0 ? !inside ? F.step === 4 ? '西の道から本丸の南口へ。敵を退けよ' : '道の印から曲輪の入口へ。敵を退けよ' : F.step === 4 ? '先手と本丸の敵を討て' : '先手と曲輪の敵を討て'
          : !inside ? F.step === 4 ? '敵は退いた。道の印から本丸の南口へ' : '敵は退いた。道の印から曲輪の入口へ'
          : zone.friends < zone.need ? `先手と入口へ集まれ（味方 ${zone.friends}／${zone.need}人）`
          : rt.t < zone.quietUntil ? `先手と入口を守れ。あと${Math.ceil(zone.quietUntil - rt.t)}秒で確保を始める`
          : `敵は退いた。あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒、ここを守れ`);
      }
      if (F.step === 3) {
        rt.objProgress('main', sightPoint(rt, GATE) ? gateWord(F.gate) : '門の正面へ回れ。柵の脇からは打てない');
      }
    }
    // 攻め口の兵が崩れれば、時間で勝たせず寄せを打ち切る。
    let ready = 0;
    for (const q of F.oda) for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) ready++;
    const exhausted = F.step >= 1 && ready < (F.step >= 3.5 ? 1 : 5);
    if (!F.ending && F.step >= 1 && (F.oda.every(gone) || exhausted)) {
      F.ending = true;
      siegeSignal(rt, 'nobiki');
      rt.objFail('main');
      rt.obj('withdraw', '法螺貝と間を空けた二つ打ちの退き太鼓。来た尾根道を麓へ退け', 'main', true);
      rt.say('組頭', '退き太鼓じゃ！　これ以上は寄せられぬ。来た尾根道を麓へ退け！', 4);
      rt.tracker.main = false; rt.setPhase('end'); rt.objProgress('main', '');
      for (const id of ['tsu', 'amb', 'branch', 'climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
      rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower'); rt.finish({ scriptedEnd: true }, 6);
      return;
    }
    if (F.step >= 3.5 && F.SZ) {
      F.SZ.tick(dt);
      const s = F.SZ.byId;
      if (F.step === 3.5) {
        const z = s.ridge1;
        if (z.enemies < F.lowerBest || z.holdT > (F.lowerHold || 0)) F.lowerStallAt = rt.t;
        F.lowerBest = Math.min(F.lowerBest, z.enemies); F.lowerHold = z.holdT;
        // 一分間進まなければ別の先手が道を開く。本人の曲輪取りの戦功は与えない。
        if (rt.t - F.lowerStallAt >= 60) {
          F.innerDone = true; F.innerRoute = 'ridge2'; F.lowerBypass = true;
          rt.unmark('rg1'); rt.unmark('gather');
          rt.say('組頭', '別の先手が道を開いた！　下の曲輪は味方に任せ、本丸へ続け！', 5);
          this.honmaru(rt);
        }
      }
      if (F.step === 4 && (F.lowerTaken || F.lowerBypass) && s.shu.owner === ZONE_STATE.FRIEND && s.shu.test(rt.player.u.pos.x, rt.player.u.pos.z) && F.last.every((g) => gone(g) || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - TOP.x, u.pos.z - TOP.z) < TOP.r + 12))) this.win(rt);
    }
    if (F.ending || rt.over) return;
    // 十五秒ごとに距離と戦果を比べる。三十秒の停滞には先手の援護を出す。
    if (!F.ending && F.step >= 1 && rt.t >= (F.stallCheckT || 0)) {
      F.stallCheckT = rt.t + 15;
      this.assistAdvance(rt);
      for (const q of F.oda) {
        if (gone(q)) continue;
        const c = q.center();
        const stopped = q.sgStep === F.step && Math.hypot(c.x - q.sgX, c.z - q.sgZ) < 2;
        q.sgStall = stopped ? (q.sgStall || 0) + 15 : 0;
        q.sgStep = F.step; q.sgX = c.x; q.sgZ = c.z;
        if (q.sgStall >= 45 && F.stallSaidStep !== F.step && rt.t >= (F.stallSayT || 0) && sightPoint(rt, c)) {
          F.stallSayT = rt.t + 45; F.stallSaidStep = F.step;
          const waypoint = q.order === 'path' ? q.path?.[q.pathIdx] : null;
          const blocked = waypoint && rt.army.wallBetween(c, -1, { x: waypoint[0], z: waypoint[1] });
          rt.say('組頭', q.order === 'assault' || blocked ? '門か柵に阻まれたか。先手へ戻り、打ち手を守れ！' : q.order === 'path' ? '列が止まっておるぞ。尾根道へ戻り、先手に続け！' : '先手が待っておるぞ。兵をそろえ、敵を崩せ！', 5);
          const stalledStep = F.step;
          rt.marker('gather', () => gone(q) || F.ending || F.step !== stalledStep || q.sgStall < 45 ? null : q.center(), '先手へ集まれ', { group: q });
          break;
        }
      }
    }

  },

  // 三十秒間、距離も戦果も変わらなければ、同じ兵を道に沿って押し出す。
  // 兵の追加・瞬間移動・時間だけの勝利は行わない。
  assistAdvance(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const id = F.step === 4 ? 'shu' : F.step === 3.5 ? (!F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2') : String(F.step);
    const goal = F.SZ?.byId[id]?.pos || (F.step === 2 ? TOWER_POST : GATE);
    let distance = Math.hypot(p.x - goal.x, p.z - goal.z);
    for (const g of F.oda) if (!gone(g)) {
      const c = g.center(); distance = Math.min(distance, Math.hypot(c.x - goal.x, c.z - goal.z));
    }
    const hp = F.gate.alive ? F.gate.hp : 0;
    if (F.advanceId !== id || distance < F.advanceDistance - 3 || F.advanceKills !== F.ek || F.advanceGateHp !== hp) {
      F.advanceId = id; F.advanceDistance = distance; F.advanceKills = F.ek; F.advanceGateHp = hp; F.advanceT = rt.t;
    }
    if (rt.t - F.advanceT < 30) return;
    F.advanceT = rt.t; rt.unmark('gather');
    if (F.step === 2) {
      // 近くの先手が打ち手の守りを引き継ぐ。
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 18) { this.coverTower(rt, false); return; }
    }
    if (F.step === 3) {
      for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 10) {
        rt.say('組頭', '打ち手よ、力を合わせよ！　門を押し開けるぞ！', 4);
        rt.army.damage(F.gate, F.gate.hp / (1 - F.gate.armor) + 1, u);
        return;
      }
      this.gateFightApproach(rt);
      return;
    }
    // 停滞時の先手も、本人と同じ本丸への道へ。古い曲輪往復へ戻さない。
    const path = F.step === 4 && F.castleRoute ? F.castleRoute
      : id === 'yashiki' ? ROUTES.find((r) => r.id === 'yashiki').pts : ROAD;
    let end = F.step < 3.5 ? CLIMB_END : 0, best = Infinity;
    if (F.step >= 3.5) for (let i = 0; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - goal.x, path[i][1] - goal.z);
      if (d < best) { best = d; end = i; }
    }
    const start = F.step < 3.5 ? OPEN_I : path === ROAD ? CLIMB_END + 1 : 0;
    for (const g of F.oda) if (!gone(g)) {
      let from = start, near = Infinity;
      const c = g.center();
      for (let i = start; i <= end; i++) {
        const d = Math.hypot(c.x - path[i][0], c.z - path[i][1]);
        if (d < near) { near = d; from = i; }
      }
      // 通った道へ引き返さず、線分の先へ向かう。後列も同じ列に戻す。
      if (from < end && Math.hypot(c.x - path[from + 1][0], c.z - path[from + 1][1]) < Math.hypot(path[from][0] - path[from + 1][0], path[from][1] - path[from + 1][1])) from++;
      march(g, path.slice(from, end + 1));
      for (const u of g.units) if (u.alive) { u.target = null; u.moveTo = null; u.aiT = 0; }
    }
    const enemy = F.step < 3.5 ? F.amb : id === 'ridge1' ? F.rg1 : id === 'ridge2' ? F.rg2 : id === 'yashiki' ? F.ryk : F.last[0];
    if (enemy && !gone(enemy) && !enemy.retreatOnly) {
      enemy.ambush = false;
      // 門を抜けた味方へ、守りの同じ兵が曲輪の口まで出る。
      march(enemy, path.slice(Math.max(start, end - 1), end + 1).reverse());
      enemy.onArrive = (g) => { g.order = 'attack'; g.seekRange = 24; g.aggro = 18; };
    }
    rt.say('組頭', F.step < 3.5 ? '先手よ、尾根道を押し上がれ！' : F.step === 4 ? '味方は本丸へ寄せよ！　残る守りを崩せ！' : F.lowerTaken ? '下の曲輪は味方が取った。先手よ、上へ進め！' : '門は開いた。先手よ、西の道から曲輪へ進め！', 4);
  },
  gateFightApproach(rt) {
    const F = rt.flags;
    const R = F.ram;
    let approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    if (!approach.length && R.anchor.z > GATE.z + 9) {
      let from = OPEN_I, best = Infinity;
      for (let i = 0; i <= CLIMB_END; i++) {
        const d = Math.hypot(R.anchor.x - ROAD[i][0], R.anchor.z - ROAD[i][1]);
        if (d < best) { best = d; from = i; }
      }
      approach = ROAD.slice(from, CLIMB_END + 1);
    }
    approach.push([GATE.x, GATE.z + 6], [GATE.x, GATE.z + 4]);
    march(R, approach);
    R.arriveCount = 1; R.arriveRadius = 2;
    F.ram.onArrive = (g) => { g.order = 'assault'; g.facing = Math.PI; g.assault = () => F.gate.alive ? F.gate : null; };
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !sightPoint(rt, g.anchor) || rt.t < (F.routSayT || 0)) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が逃げてくがや！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    if (!F.gateCreek && s.hp < s.maxHp * 0.5) { F.gateCreek = true; rt.bark('門の板が割れてきた'); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    if (s.mesh) brokenGate(rt, s.mesh);
    sfx('wood', 1.2);
    rt.unmark('gate'); rt.unmark('sally');
    if (!F.ending && !rt.over && rt.player.u.alive && F.step === 3) this.interior(rt);
  },

};

// 総勢は諸説ある。見える一人の死から全軍の死者を作らない。
shigisan.force = () => ({ a: 40000, a0: 40000, b: 8000, b0: 8000 });
shigisan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '松永軍', mon: 'todo' } };
// 父子は高櫓の内。架空の名乗り・討取りの段は設けない。
shigisan.famous = []; // 海老名は片岡城の討死記事。久通を木戸外の討取り役にしない。
shigisan.date = () => '天正五年十月十日　冬・夜攻め';
shigisan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '城攻めの下知まで待つ' : '');
shigisan.skip = (rt) => {
  const F = rt.flags;
  if (F.step === 0 && !F.ending && F.climbTimer) F.climbTimer.t = Math.min(F.climbTimer.t, 0.2);
};
shigisan.history = '天正五年（1577）八月、石山本願寺を囲む陣にいた松永久秀は、勝手に陣を払って大和の信貴山城に籠もり、再び信長に背いた。信長は嫡男の織田信忠を大将に、佐久間信盛・羽柴秀吉・明智光秀・丹羽長秀らを諸口へ向かわせ、筒井順慶・細川藤孝らも攻めに加わり、支城の片岡城を落としてから信貴山城を囲んだ。『信長公記』は十月十日の晩に諸口から夜攻めが行われ、守兵が防戦する中、久秀が自ら天主に火をかけて焼死したと記す。森好久が鉄砲二百を率いて寝返った話は後世の伝えで、同書には記されていない。遊びでは内通の段を残し、天主の火は久秀による放火として描く。この日は、十年前に東大寺の大仏殿が焼けた日と同じで、人々は因果と噂したと『信長公記』は伝える。久秀が名物の茶釜「平蜘蛛」を打ち砕いて死んだという話は、のちの伝えである。遊びで天守の上の階が釜とともに爆ぜる場面は、火薬で爆ぜたという江戸時代より後の伝えを絵にしたもので、確かな記録ではない。大和はその後、筒井順慶が治めた（大和一国を正式に任されたのは天正八年）。松永の紋は蔦で、ここでは近い形の蔦の紋で旗を描いている。兵の数には諸説ある。織田四万・松永八千はこの戦の仮の目安で、『信長公記』に当夜の両軍の総数は記されていない。城には百二十を超える曲輪があり、北尾根には松永屋敷がある。山頂の小さな天守は安土の先がけともいわれるが、形は確定していない。各将の攻め口・北尾根の細かな攻め順・伏兵・枝尾根の小曲輪の配置・板壁の望楼の形は推定で、当夜の天気は確定していない。月の形は旧暦十日から満月前と推定したもので、当夜の正確な月齢・傾きや見え方を再現したものではない。';

function march(g, pts) {
  if (gone(g)) return;
  // 止まっても後列は通った道に沿う。門前で北へ向き直ると、直線の後列は切岸へ出る。
  if (!g.sgRoadSlots) {
    g.sgRoadSlots = true;
    const slotPos = g.slotPos;
    g.slotPos = function (i, n) {
      if (this.routed || !this.roadColumn || !this.path?.length ||
          (this.order !== 'hold' && this.order !== 'assault')) return slotPos.call(this, i, n);
      const order = this.order, formation = this.formation;
      this.order = 'path'; this.formation = 'column';
      try { return slotPos.call(this, i, n); }
      finally { this.order = order; this.formation = formation; }
    };
  }
  // 後列の持ち場に使う、通って来た道を残す。
  let history = g.roadColumn && g.path ? g.path.slice(0, Math.min(g.pathIdx, g.path.length)) : [];
  if (!history.length) {
    const i = ROAD.findIndex((p) => Math.hypot(p[0] - g.anchor.x, p[1] - g.anchor.z) < 1);
    if (i > 0) history = ROAD.slice(0, i);
  }
  g.order = 'path'; g.path = [...history, [g.anchor.x, g.anchor.z], ...pts]; g.pathIdx = history.length + 1; g.roadColumn = true; g.formation = 'column'; g.colW = 2; g.width = 5; g.speed = 2.8; g.guard = false;
  // 五人が自分の持ち場へ着けば展開する。後列待ちで曲輪の確保を何分も止めない。
  if (g.team === 0) { g.arriveCount = 5; g.arriveRadius = 4; }
  g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.aggro = 14; };
}
function gateWord(g) {
  return g.hp > g.maxHp * 0.65 ? '門はまだ堅い' : g.hp > g.maxHp * 0.3 ? '門の板が割れてきた' : '門が大きくきしむ';
}

// 壊れた木戸は短い割れ板へ。一枚の扉全体を最高点まで持ち上げ、黒い床板にしない。
// 破壊時に一度だけ作り、共通の箱と木肌を二十四本で使い回す。当たりや道の高さは変えない。
function brokenGate(rt, gate) {
  if (gate.userData.sgBroken) return;
  gate.userData.sgBroken = true; gate.visible = false;
  const W = rt.world, mesh = new THREE.InstancedMesh(ROOM_BOX, ROOM_MAT, 24);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3(), along = new THREE.Vector3(), across = new THREE.Vector3();
  const basis = new THREE.Matrix4(), contact = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    const col = i % 12, row = Math.floor(i / 12);
    // 開口の両脇へ短い板を散らす。通り口を二列の床板で敷き詰めない。
    const side = col < 6 ? -1 : 1, n = col % 6;
    const x = GATE.x + side * (2.8 + n * .42) + Math.sin(i * 2.4) * .16;
    const z = GATE.z - .4 - row * 1.3 + Math.sin(i * 1.7) * .55;
    const length = .45 + (i * 7 % 11) * .05, angle = Math.sin(i * 2.1) * .95;
    const dx = Math.sin(angle), dz = Math.cos(angle), halfWidth = .07 + (i % 4) * .015;
    // 長手の坂だけでなく横の傾きも読む。回転後の実際の底を地面へ接地させる。
    const h = W.heightAt(x, z), span = .25;
    const sx = (W.heightAt(x + span, z) - W.heightAt(x - span, z)) / (span * 2);
    const sz = (W.heightAt(x, z + span) - W.heightAt(x, z - span)) / (span * 2);
    normal.set(-sx, 1, -sz).normalize();
    along.set(dx, sx * dx + sz * dz, dz).normalize();
    across.crossVectors(normal, along).normalize();
    normal.crossVectors(along, across).normalize();
    basis.makeBasis(across, normal, along); dummy.quaternion.setFromRotationMatrix(basis);
    dummy.position.set(x, h, z); dummy.scale.set(halfWidth * 2, .07, length); dummy.updateMatrix();
    let y = -Infinity;
    for (const side of [-.5, 0, .5]) for (const end of [-.5, 0, .5]) {
      contact.set(side, -.5, end).applyMatrix4(dummy.matrix);
      y = Math.max(y, W.heightAt(contact.x, contact.z) - contact.y);
    }
    dummy.position.y += y - .015; dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.receiveShadow = true; mesh.castShadow = true; rt.scene.add(mesh);
}

// 素直な遊び手：筒井について登り、伏兵と戦い、門脇で矢を防ぎ、門を破る組を守り、天守の前で戦う
// 本丸は東西に長い柵。円を仮定した回り道で、道の印へ進む向きを上書きしない。
shigisan.botBrain = (b, inp, o) => { sgBot(b, inp, o); gateSteer(b, inp); };
function sgBot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然に戻らず、手当ても五％まで。処置を済ませたら任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.5 && canTreat) b.botRest = true;
  if (!canTreat || u.hp >= u.maxHp * 0.5) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 麓の定点で待つと味方から離れ、傷を縛れない。近い味方へ戻って止まる。
    let mate = null, md = Infinity;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.type === 'dummy' || o.noTarget ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < md) { mate = o; md = d; }
    }
    if (mate) { goTo(p, inp, mate.pos.x, mate.pos.z, 4); return; }
    b.botRest = false;
  }
  // 柵越しに届く打ち手を先に受け、構えを解く間は反撃の相手を保つ。
  // 毎回いちばん近い兵へ替えると、半秒の待ちをやり直して突けなくなる。
  // 門を破る段では、柵越しに槍が届く木戸の弓を突き続けて門へ行かないことがあった。柵の向こうの相手は門の後に回す。
  let e = strikeTarget(b, F.step === 2 || F.step >= 3.5 ? 6 : 12);
  if (e && F.step === 3 && b.army.wallBetween(u.pos, -1, e.pos)) e = null;
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    const attacking = e.atk?.target === u || e.swing?.target === u || e.charging && e.target === u;
    // 門内では谷へ逃げた兵を追わない。届く打ち込みを受けたら、道の順に戻る。
    // 曲輪の外の一人へ寄り続けると、案内から五十歩離れて夜攻めが終わっていた。
    if (F.step >= 1 && d > reach * 0.85 &&
        (!b.world.onRoad(e.pos.x, e.pos.z) || !guideClear(b, u.pos, e.pos))) e = null;
    if (e && F.step >= 3.5 && d > reach * 0.85 && F.castleRoute && !F.castleGuideArrived) {
      // 同じ道にいても、通り過ぎた敵を追って任務から逆戻りしない。
      const a = F.castleRoute[F.castleGuideI - 1], c = F.castleRoute[F.castleGuideI];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len > 0.01 && ((e.pos.x - u.pos.x) * dx + (e.pos.z - u.pos.z) * dz) / len < -2) e = null;
      // 別の道に立つ敵も「道の上」になる。今の尾根から横へ追って谷へ下らない。
      if (e) {
        const t = Math.max(0, Math.min(1, ((e.pos.x - a[0]) * dx + (e.pos.z - a[1]) * dz) / (len * len || 1)));
        if (F.castleGuideReturning || Math.hypot(e.pos.x - a[0] - dx * t, e.pos.z - a[1] - dz * t) > INNER_HALF + 1) e = null;
      }
    }
    // 届く打ち込みには応じる。離れた控えや別の段の兵を追って、道の案内を止めない。
    if (e && d > reach && !attacking && (e.playerOpeningBlocked || !guideClear(b, u.pos, e.pos))) e = null;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 狙いの固定が別の兵へ向け直し、打ち手に背を向けるのを防ぐ。
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    // 山の別の段の敵を追わず、通れる相手へ寄る。詰まった時は共通の回り道を使う。
    if (d > reach * 0.85 && !e.charging && !b.army.wallBetween(u.pos, -1, e.pos)) {
      if (F.step === 1) climbBotWay(p, inp, e.pos.x, e.pos.z, reach * 0.85, goTo);
      else goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    }
    // 構えたままの連打は槍の払いになり、気力を失う。受けた後に構えを解いて突く。
    patientStrike(p, inp, e, d);
    // 道や回り道を向いたまま受けたり突いたりしない。打ち合う時は相手へ向き直って止まる。
    if (inp.guardHold || inp.leftPressed) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyW');
    }
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    // 先手も伏兵も、別の折り返しから直線で追うと切岸へ出てしまう。
    // 人が見ている道の印をたどり、伏兵へ戻る時も同じ道で戻る。
    // 近くで戦える相手は上で選ぶ。逃げた者も含む隊の平均位置を追うと、道を外れて谷へ下る。
    climbBotWay(p, inp, ROAD[CLIMB_END][0], ROAD[CLIMB_END][1], 2, goTo);
    return;
  }
  if (F.step === 2) {
    const it = b.interacts.find((q) => q.id === 'tower');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 伏兵から櫓へ斜めに近道せず、登城道を登り切って土橋から門脇の道へ進む。
      if (F.approachByRoad) goTo(p, inp, F.approachGuide.x, F.approachGuide.z, 1);
      else if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1);
      // 物見の梯子の札が近い時に押すと、梯子へ登って門脇へ戻れなくなる。門脇の札が一番近い時だけ押す。
      else if (b.nearestInteract() === it) inp.k.add('KeyE');
      else goTo(p, inp, it.pos.x, it.pos.z, 0.4);
    }
    return;
  }
  if (F.step === 3) {
    if (F.approachByRoad) { goTo(p, inp, F.approachGuide.x, F.approachGuide.z, 1); return; }
    const it = b.interacts.find((q) => q.id === 'ramgate');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 櫓から斜めに門へ向かわず、造成した道を戻って土橋の正面へ出る。
      // 馬や打ち手に押されても、実際に操作が届く範囲なら門を打つ。
      if (d < it.r && b.nearestInteract() === it) {
        inp.k.delete('KeyW'); inp.runHeld = false; inp.chargeHold = false;
        p.yaw = Math.PI; inp.k.add('KeyE');
      } else if (Math.abs(u.pos.x - GATE.x) > 2.5) {
        goTo(p, inp, GATE.x, GATE.z + 6, 1);
      } else goTo(p, inp, it.pos.x, it.pos.z, it.r - 0.4);
    }
    return;
  }
  if (F.step === 3.5 || F.step === 4) {
    if (u.pos.z > GATE.z + 9) { climbBotWay(p, inp, GATE.x, GATE.z + 6, 1, goTo); return; }
    if (u.pos.z > GATE.z - 4) {
      if (u.pos.z > GATE.z && Math.abs(u.pos.x - GATE.x) > 3.5) goTo(p, inp, GATE.x, GATE.z + 6, 1);
      else goTo(p, inp, GATE.x, GATE.z - 6, 1);
      return;
    }
    const id = F.step === 4 ? 'shu' : !F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
    // 行きと帰りが重なる尾根道を毎回「近い線」で選ぶと、同じ角へ戻り続ける。
    // 人に示す順番と同じ角を通り、最後は曲輪の持ち場へ入る。
    // 人に出す帰り先と同じ印を使う。独自の狭い幅で戻すと、札が前を指しても横へ歩き続ける。
    // 最後の角も実際に通ってから曲輪へ入る。柵の口を斜めに飛ばさない。
    const goal = F.castleGuideArrived ? id === 'shu' ? HONMARU_POST : F.SZ.byId[id].pos : F.castleGuidePoint;
    goTo(p, inp, goal.x, goal.z, F.castleGuideLeaving ? 0.35 : F.castleGuideArrived ? 1.5 : 0.8);
    return;
  }
  // 開戦前は尾根の先手と待つ。筒井の陣所は麓にあり、直線で追うと道を外れて下ってしまう。
  inp.guardHold = false;
  inp.runHeld = false; inp.chargeHold = false;
}

// 門内の尾根道も曲がり角をたどる。直線の近道で柵や切岸へ進ませない。
function castleBotWay(p, inp, path, goal, goTo) {
  const pos = p.u.pos;
  let from = 0, to = 0, bestFrom = Infinity, bestTo = Infinity;
  for (let i = 0; i < path.length; i++) {
    const q = path[i], d = Math.hypot(q[0] - goal.x, q[1] - goal.z);
    if (d < bestTo) { bestTo = d; to = i; }
  }
  // 点の近さだけで選ぶと、門の六歩内から門へ戻って永遠に往復する。
  // 目的地までの道の線分へ位置を写し、その先の曲がり角へ進む。
  for (let i = 1; i <= to; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pos.x - a[0]) * dx + (pos.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(pos.x - a[0] - dx * t, pos.z - a[1] - dz * t);
    if (d < bestFrom - 0.01 || Math.abs(d - bestFrom) < 0.01 && i > from) { bestFrom = d; from = i; }
  }
  if (from === to || !to) { goTo(p, inp, goal.x, goal.z, 2); return; }
  if (Math.hypot(path[from][0] - pos.x, path[from][1] - pos.z) < 3) from++;
  const q = path[Math.min(from, to)];
  goTo(p, inp, q[0], q[1], 1.5);
}
// 登城道上の位置を、折り返しの番号と割合で表す。結果の入れ物は使い回す。
function climbRoadPoint(x, z, out) {
  out.d = Infinity;
  for (let i = 0; i < CLIMB_END; i++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d >= out.d) continue;
    out.x = qx; out.z = qz; out.s = i + t; out.d = d;
  }
}
// 伏兵に、まだ刃を向けて来る者が残るか（逃げる者・深手の者は数えない）
function ambLive(g) { return !gone(g) && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut); }
function climbWayPoint(p, x, z, out) {
  const from = p._sgRoadFrom || (p._sgRoadFrom = {}), to = p._sgRoadTo || (p._sgRoadTo = {});
  const goal = p._sgRoadGoal || (p._sgRoadGoal = {});
  goal.x = x; goal.z = z; goal.y = p.u.pos.y;
  climbRoadPoint(p.u.pos.x, p.u.pos.z, from);
  climbRoadPoint(x, z, to);
  // 道の幅内でも、切岸の下や柵の外へ押される事がある。距離だけで復帰を済ませない。
  p.rt.flags.climbReturning = from.d > ROAD_HALF - 1 || !guideClear(p.rt, p.u.pos, from);
  // 真横の道が切岸の上なら、歩いて戻れる道の口を探す。再探索は半秒に一度だけ。
  if (p.rt.flags.climbReturning) {
    const q = p._sgRejoin || (p._sgRejoin = { x: 0, z: 0, at: -1, found: false, probe: {} });
    if (p.rt.t >= q.at) {
      q.at = p.rt.t + 0.5; q.found = false;
      let best = Infinity;
      for (let i = 0; i < CLIMB_END; i++) {
        const a = ROAD[i], b = ROAD[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
        for (let k = 0; k <= n; k++) {
          const probe = q.probe;
          probe.x = a[0] + (b[0] - a[0]) * k / n; probe.z = a[1] + (b[1] - a[1]) * k / n;
          const d = Math.hypot(probe.x - p.u.pos.x, probe.z - p.u.pos.z);
          if (d > 60 || d >= best || !guideClear(p.rt, p.u.pos, probe)) continue;
          // 戻り口から次の角まで進める所だけ選ぶ。足元の行き止まりへ戻し続けない。
          const end = to.s < i ? a : b;
          goal.x = end[0]; goal.z = end[1]; goal.y = p.rt.world.heightAt(goal.x, goal.z);
          if (!guideClear(p.rt, probe, goal)) continue;
          best = d; q.x = probe.x; q.z = probe.z; q.found = true;
        }
      }
    }
    out.x = q.found ? q.x : from.x; out.z = q.found ? q.z : from.z; return;
  }
  // 最後は同じ道の上の伏兵へ寄る。
  if (Math.abs(from.s - to.s) < 0.08 && Math.hypot(x - p.u.pos.x, z - p.u.pos.z) < 12 && guideClear(p.rt, p.u.pos, goal)) {
    out.x = x; out.z = z; return;
  }
  const forward = to.s > from.s;
  let i = forward ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
  // 曲がり角は 2.5m 内で済みとする。1.2m だと、角に味方が立つと「角へ戻る／次へ進む」を一歩ごとに繰り返し、
  // 指の操作の bot が 33,-46 の角で 480 秒止まった（角に寄れる距離より判定が狭かった）。
  if (i >= 0 && i <= CLIMB_END && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 2.5) { if (forward) p._sgCornerDone = i; i += forward ? 1 : -1; }
  // 一度済ませた角へは、近くにいる間は戻らない（済みの判定の縁で行き来しない）。
  else if (forward && p._sgCornerDone === i && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 8) i++;
  if (i >= 0 && i <= CLIMB_END && (forward ? i <= to.s : i >= to.s)) {
    out.x = ROAD[i][0]; out.z = ROAD[i][1];
  } else if (Math.hypot(to.x - p.u.pos.x, to.z - p.u.pos.z) > 1.2) {
    out.x = to.x; out.z = to.z;
  } else if (guideClear(p.rt, p.u.pos, goal)) { out.x = x; out.z = z; }
  else { out.x = p.u.pos.x; out.z = p.u.pos.z; }
}

// 人に示す角と同じ順で進む。任務が変わっても、谷から門へ直進しない。
function climbBotWay(p, inp, x, z, r, goTo) {
  const out = p._sgWayPoint || (p._sgWayPoint = {});
  climbWayPoint(p, x, z, out);
  goTo(p, inp, out.x, out.z, out.x === x && out.z === z ? r : 1);
}

const HONMARU_POST = { x: TOP.x, z: TOP.z + 8 };
function gateSteer(b, inp) {
  if (!inp.k.has('KeyW') || (b.flags.gate && b.flags.gate.alive)) return;
  const p = b.player, u = p.u, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const az = u.pos.z + fz * 3, ax = u.pos.x + fx * 3;
  if (Math.abs(u.pos.x) < 4.5 || Math.abs(u.pos.x) > 30 || Math.abs(ax) < 4.5) return;
  const wz = GATE.z + (Math.min(28, Math.abs(u.pos.x)) - 5.5) / 22.5 * 4;   // その x での柵の z
  if (u.pos.z > wz + 0.3 && az < wz + 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z + 4 - u.pos.z);
  else if (u.pos.z < wz - 0.3 && az > wz - 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z - 3 - u.pos.z);
}

shigisan.withdrawTick = (rt) => {
  const F = rt.flags, f = F.castleFire;
  if (!f) return;
  const t = Math.min(1, (rt.t - F.castleFireAt) / 12);
  f.size = 2 + t * 2;
  const ground = rt.world.heightAt(f.x, f.z);
  // 火勢は増しても根元を上空へ運ばない。増えた高さは炎自身の大きさで表す。
  f.base = ground + 0.45 + f.size * 0.35;
  // 内の炎・照り返し・煙も、壁に接した炎と同じ高さへそろえる。
  f.big = f.size >= 2; f.inner.position.y = f.base - f.size * 0.08;
  f.ly = f.base - ground + f.size * 0.3;
  f.glow?.scale.setScalar(7 * Math.max(1, f.size / 1.3));
  if (rt.t >= (F.castleSmokeAt || 0) && f.smoke != null && rt.world.smokeCol) {
    F.castleSmokeAt = rt.t + 0.5;
    const smoke = rt.world.smokeCol;
    for (let k = 0; k < smoke.PER; k++) { const i = f.smoke * smoke.PER + k; smoke.pos[i * 3 + 1] = f.base + f.size * 0.5; smoke.seed[i * 2 + 1] = Math.min(4, f.size * 0.9); }
    smoke.pts.geometry.attributes.position.needsUpdate = smoke.pts.geometry.attributes.seed.needsUpdate = true;
  }
};
export { shigisan };
