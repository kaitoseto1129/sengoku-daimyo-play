import { pressureTick } from './battle_pressure.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　信貴山城の戦い（天正五年十月）
// 石山本願寺攻めの陣を勝手に払い、信長に背いた松永久秀は、大和の信貴山城に籠もった。
// 織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶らが城を囲み、十月十日、久秀は天守に火を放って自害した。
// 足軽は信忠の軍の筒井順慶の手に付く。①筒井の者の案内で、尾根道を登る（横から伏兵）
// ②門脇の物見櫓に火を放つ ③実際に門を破り、北尾根の曲輪を押さえる ④本丸の守りを崩し、味方と確保する
// 向き：北（-z）の山の上に城。南（+z）の麓に織田の陣
// ======================================================================
import { yamaLift } from './yamalift.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior } from './naka.js';
import { stoneTex, barkTex } from './nature.js';
import { nobori, hut, yagura, campfire, kagaribi, kabukimon, tawara, tobira, tsuiji, ishigaki, solidRect, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { monomi, horiboriHeight, goten } from './castle_parts.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { steerRing } from './b_depth.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { localClear } from './army_local_way.js';
import { buildCastlePlan, makeLordKeep, heightOf } from './castle_plan.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';

import { SHIGISAN_PLAN, TOP, GATE, TOWER, RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI, MEDAKE, TEMPLE, ROAD as SITE_ROAD, TEMPLE_ZONE, ROUTES } from './castles/shigisan.js';
import { demRelief } from './dem.js';
let sgDem = null;
import('./asset_dem_shigisan.js').then((m) => { sgDem = m.default; ROAD_SEGMENTS = null; ROOM_LEVELS = null; GATE_LEVELS = null; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ODA = { flag: 'oda' };
const TSUTSUI = { flag: 'igeta', flagScale: 1.5, hachi: 0x3f7a52 };   // 筒井の手：井筒の旗を大きく・緑の鉢巻
const MATSU = { flag: 'todo' };            // 松永の蔦（藤堂蔦の紋で代える）
// 陣幕は南にしか口がない。登城道・遊び手・組の出発地点を囲わぬよう、道の東へ置く。
const TSUTSUI_CAMP = { x: 26, z: 104 };
// 門内で西の櫓の足元を斜めに横切らず、奥まで抜けてから西へ折れる。
const ROAD = SITE_ROAD.flatMap((p) => p[0] === GATE.x && p[1] === GATE.z ? [p, [GATE.x, GATE.z - 12]] : [p]);
// 火掛けは柵の外から。空堀の上を横切らず、土橋から櫓の足元へ寄る。
const TOWER_FIRE = { x: TOWER.x + 2, z: GATE.z + 7 };
const TOWER_APPROACH = [[GATE.x, GATE.z + 6], [TOWER_FIRE.x, TOWER_FIRE.z]];
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
const ROAD_HALF = 6; // 馬が向きを変え、二列の兵とすれ違える平らな幅。

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
  paths: SHIGISAN_PLAN.paths.map((p) => p.id === 'ote' ? { ...p, pts: ROAD } : p),
  kuruwa: SHIGISAN_PLAN.kuruwa.map((k) => k.gapW ? { ...k, gapW: 9 } : k),
  koguchi: SHIGISAN_PLAN.koguchi.map((g) => ({ ...g, w: g.id === 'gate' ? 11.4 : 7.4 })),
};
const TERRAIN_EDGE = 8; // 地面の格子より広くつなぎ、曲輪の縁を鋭い破片にしない。
const TERRAIN = heightOf(ATTACK_PLAN, base, TERRAIN_EDGE);
// 堀の形は読み込み時に一度だけ作り、地形と城の区域で同じ寸法を使う。
const HORI_HEIGHTS = SHIGISAN_PLAN.hori.map((h) => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
const FLAT_PADS = [[GATE.x, GATE.z - 12, 15], [TEMPLE.x, TEMPLE.z, 14]];
const DEM_RELIEF = { xy: 1, cx: 0, cz: 0, inner: 270, fade: 40, scale: 0.16, az: 0.8 };
function heightRaw(x, z) {
  let h = base(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  h = TERRAIN(x, z, h);
  // 門内の平場と、戦いの外の寺の境内も水平にする。
  for (const [cx, cz, r] of FLAT_PADS) {
    const t = Math.max(0, Math.min(1, (r + 3 - Math.hypot(x - cx, z - cz)) / 3));
    h += (base(cx, cz) - h) * t;
  }
  // 国土地理院の標高：城の外の遠い山肌にだけ、実際の起伏を足す（座標1は約1m。山肌も横を縮めない）
  if (sgDem) h += demRelief(sgDem, x, z, DEM_RELIEF);
  return h;
}

// 建物と戸口を共通室内に渡す。主殿・堂は檜皮葺き、番所・長屋・蔵は板葺き（推定）。
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
// 道の縦の高さは準備時だけ計算。曲輪間は坂でつなぎ、段の縁の急変を避ける。
const ROAD_LEVELS = SHIGISAN_PLAN.kuruwa.filter((k) => k.id !== 'medake').map((k) => {
  const x = k.poly.reduce((n, p) => n + p[0], 0) / k.poly.length, z = k.poly.reduce((n, p) => n + p[1], 0) / k.poly.length;
  return { x, z, r: Math.max(...k.poly.map((p) => Math.hypot(p[0] - x, p[1] - z))), h: k.level(base) };
});
function roadLevel(x, z) {
  let best = Infinity, h = base(x, z);
  for (const q of ROAD_LEVELS) {
    const d = Math.hypot(x - q.x, z - q.z), score = d / q.r;
    if (d < q.r + 6 && score < best) { best = score; h = q.h; }
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
      if (z <= GATE.z + 6) continue;
      const t = Math.max(0, Math.min(1, ((x - b.ax) * b.dx + (z - b.az) * b.dz) / (b.dx * b.dx + b.dz * b.dz || 1)));
      if (Math.hypot(x - b.ax - b.dx * t, z - b.az - b.dz * t) < ROAD_HALF * 2) b.cuts.push(t);
    }
  }
  const segments = lines.flatMap((q) => {
    const cuts = [...new Set(q.cuts)].sort((a, b) => a - b);
    return cuts.slice(1).flatMap((t, i) => {
      const t0 = cuts[i], ax = q.ax + q.dx * t0, az = q.az + q.dz * t0;
      const dx = q.dx * (t - t0), dz = q.dz * (t - t0), l2 = dx * dx + dz * dz;
      return l2 < 1e-8 ? [] : [{ ax, az, dx, dz, l2, h0: roadLevel(ax, az), h1: roadLevel(ax + dx, az + dz) }];
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
    if (a.z > GATE.z + 6 && b.z > GATE.z + 6 && d < ROAD_HALF * 2) nearby.push({ a, b, rise: d * 0.2 });
  }
  // 道の切り通しを造り、どの分岐も同じ床・勾配上限にそろえる。毎コマは行わない。
  for (let pass = 0; pass < nodes.size; pass++) {
    let changed = false;
    for (const q of segments) {
      const rise = Math.sqrt(q.l2) * 0.58;
      if (q.a.h > q.b.h + rise + 1e-6) { q.a.h = q.b.h + rise; changed = true; }
      if (q.b.h > q.a.h + rise + 1e-6) { q.b.h = q.a.h + rise; changed = true; }
    }
    for (const q of nearby) {
      if (q.a.h > q.b.h + q.rise + 1e-6) { q.a.h = q.b.h + q.rise; changed = true; }
      if (q.b.h > q.a.h + q.rise + 1e-6) { q.b.h = q.a.h + q.rise; changed = true; }
    }
    if (!changed) break;
  }
  for (const q of segments) { q.h0 = q.a.h; q.h1 = q.b.h; delete q.a; delete q.b; }
  return segments;
}
let ROAD_SEGMENTS = null;
function roadHeight(x, z) {
  let best = Infinity, h = heightRaw(x, z), total = 0, weight = 0;
  if (!ROAD_SEGMENTS) ROAD_SEGMENTS = makeRoadSegments();
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; h = q.h0 + (q.h1 - q.h0) * t; }
    if (d < ROAD_HALF + 6) {
      const w = Math.pow(1 - d / (ROAD_HALF + 6), 2);
      total += (q.h0 + (q.h1 - q.h0) * t) * w; weight += w;
    }
  }
  if (weight > 0) h = total / weight;
  const t = Math.max(0, Math.min(1, (ROAD_HALF + 6 - best) / 6));
  const f = t * t * (3 - 2 * t);
  return heightRaw(x, z) * (1 - f) + h * f;
}
let ROOM_LEVELS = null;
let GATE_LEVELS = null;
function gateGround(h, x, z) {
  // 門の両側と物見櫓の足元を、登城道と同じ坂の平場にする。
  // 道だけを深く切ると、二歩先の守兵や柵の根元と十数メートル離れてしまう。
  const gateBlend = Math.max(0, Math.min(1, (34 - Math.abs(x - GATE.x)) / 6,
    (z - (GATE.z - 15)) / 6, ((GATE.z + 20) - z) / 6));
  if (gateBlend > 0) {
    if (!GATE_LEVELS) GATE_LEVELS = [roadHeight(GATE.x, GATE.z - 6), roadHeight(GATE.x, GATE.z + 6)];
    const t = (z - (GATE.z - 6)) / 12;
    const floor = GATE_LEVELS[0] + (GATE_LEVELS[1] - GATE_LEVELS[0]) * t;
    const k = gateBlend * gateBlend * (3 - 2 * gateBlend);
    h += (floor - h) * k;
  }
  return h;
}
function height(x, z) {
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
    const t = Math.max(0, Math.min(1, 1 - Math.max(dx, dz) / 1.2));
    if (t > 0) h += (ROOM_LEVELS[i] - h) * t;
  }
  return h;
}

// 材質・基本形は全棟で共有。外壁の戸口と共通室内の当たりを同じ幅にする。
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOM_MAT = new THREE.MeshLambertMaterial({ color: 0x69523c });
// 踏み石：苔と土で汚れた灰色の石（白く光る板にしない）
const STEP_MAT = new THREE.MeshLambertMaterial({ color: 0x7a7266, map: stoneTex() });
// 岩は崩れた石垣ではなく山肌の自然石。道の合流・戸口・曲輪の戦う平場には置かない。
function stoneSpace(x, z) {
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
function boardRoom(rt, q) {
  const y = rt.world.heightAt(q.x, q.z), parts = [], H = 2.6;
  const box = (x, yy, z, w, h, d, rot = 0) => {
    const g = ROOM_BOX.clone().scale(w, h, d); g.rotateX(rot); g.translate(q.x + x, y + yy, q.z + z); parts.push(g);
  };
  box(0, 0.15, 0, q.w, 0.3, q.d);
  box(0, H / 2 + 0.2, -q.d / 2, q.w, H, 0.14);
  for (const side of [-1, 1]) {
    box(side * q.w / 2, H / 2 + 0.2, 0, 0.14, H, q.d);
    box(side * (q.w + 1.6) / 4, H / 2 + 0.2, q.d / 2, (q.w - 1.6) / 2, H, 0.14);
    box(0, H + 0.45, side * (q.d + 1.2) / 4, q.w + 1.2, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  box(0, 2.6, q.d / 2, 1.6, 0.4, 0.14);
  // 隅柱・戸口の柱・貫と屋根の押さえ木（大和の板葺き小屋として推定）。
  for (const x of [-q.w / 2, q.w / 2, -0.8, 0.8]) box(x, H / 2 + 0.2, q.d / 2, 0.16, H, 0.2);
  for (const side of [-1, 1]) {
    box(side * q.w / 2, 1.45, 0, 0.2, 0.12, q.d);
    for (const x of [-q.w / 3, 0, q.w / 3]) box(x, H + 0.52, side * (q.d + 1.2) / 4, 0.1, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), ROOM_MAT); mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
  for (const g of parts) g.dispose();
  const naka = addInterior(rt.world, { ...q, team: 1, wins: () => [], levels: [{ y: y + 0.3, w: q.w - 0.14, d: q.d - 0.14, h: H }], door: { side: 1, lx: 0, w: 1.4 }, approach: { pad: 0.35, len: 1.2 }, oku: 0 });
  return { mesh, naka };
}

// この山だけ地面の格子を細分する。歩行と同じ双線形補間で、斜めの楔を曲面にする。
// 草・土・岩の共通材質と属性は再利用し、準備時に一度だけ組み直す。
function ridgeTerrain(W) {
  const old = W.terrain.geometry, nx = old.parameters.widthSegments, nz = old.parameters.heightSegments;
  const xs = [], zs = [];
  for (let i = 0; i <= nx; i++) {
    const x = -W.half + i * W.step; xs.push(x);
    if (i < nx && Math.abs(x) < 110) xs.push(x + W.step / 2);
  }
  for (let j = 0; j <= nz; j++) {
    const z = -W.half + j * W.step; zs.push(z);
    if (j < nz && z > -270 && z < 30) zs.push(z + W.step / 2);
  }
  const g = new THREE.BufferGeometry(), count = xs.length * zs.length;
  for (const [name, attr] of Object.entries(old.attributes)) {
    if (name === 'normal') continue;
    const values = new Float32Array(count * attr.itemSize);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      const x = xs[i], z = zs[j], fx = (x + W.half) / W.step, fz = (z + W.half) / W.step;
      const ix = Math.min(nx - 1, Math.floor(fx)), iz = Math.min(nz - 1, Math.floor(fz));
      const tx = fx - ix, tz = fz - iz, a = iz * (nx + 1) + ix;
      const k = (j * xs.length + i) * attr.itemSize;
      for (let n = 0; n < attr.itemSize; n++) {
        const read = (v) => attr.array[v * attr.itemSize + n];
        values[k + n] = (read(a) * (1 - tx) + read(a + 1) * tx) * (1 - tz)
          + (read(a + nx + 1) * (1 - tx) + read(a + nx + 2) * tx) * tz;
      }
      if (name === 'position') { values[k] = x; values[k + 1] = W.heightAt(x, z); values[k + 2] = z; }
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

// 土の城の段を保ち、入口を避けた縁の一部だけ低い石積みで支える（推定）。
function terraceStone(rt) {
  const batch = makeSimpleBatch();
  for (const c of [RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI]) {
    for (const side of [-1, 1]) {
      const a = [c.x + side * (c.w - 3), c.z + c.r - 0.6], b = [c.x + side * 6, c.z + c.r - 0.6];
      const pts = side < 0 ? [a, b] : [b, a];
      const m = ishigaki(rt.world, pts, { top: 0.05, minH: 0.8, maxH: 1.8, lean: 0.22, out: 1, noKit: true, batch });
      if (!m.isBatchedPart) rt.scene.add(m);
    }
  }
  finalizeSimpleBatch(rt, batch);
}

// 土道は地面自身の草・土・岩の材質で描く。別の帯を重ねて三角の破片を作らない。
function ridgeSoil(rt) {
  const stones = [], roots = [], W = rt.world;
  for (const q of ROAD_SEGMENTS) {
    if (q.az < -218 || q.az > OPEN_PT[1] + 30) continue;
    const len = Math.sqrt(q.l2), nx = q.dz / len, nz = -q.dx / len;
    const n = Math.max(1, Math.ceil(len / 1.2));
    // 木と岩は道の外へ。土に半ば埋めた岩と根は当たりを増やさない。
    for (let i = 0; i < n; i += 12) {
      const t = (i + 0.5) / n, side = i % 24 ? -1 : 1;
      const x = q.ax + q.dx * t + nx * side * (ROAD_HALF + 3);
      const z = q.az + q.dz * t + nz * side * (ROAD_HALF + 3);
      if (!stoneSpace(x, z)) continue;
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
  for (let i = 0; i < stones.length; i++) {
    const [x, z] = stones[i]; dummy.position.set(x, W.heightAt(x, z) - 0.12, z);
    dummy.rotation.set(0.08, i * 1.7, 0.06); dummy.scale.set(0.5 + i % 3 * 0.08, 0.4, 0.6); dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix);
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
  rock.receiveShadow = root.receiveShadow = true; rt.scene.add(rock, root, trunk, crown);
}

// 石段は一段を四つの踏み石に分ける。上端を低い地面に合わせ、箱の側面は土へ埋める。
function entranceSteps(rt) {
  const pts = [];
  for (const q of ROAD_SEGMENTS) {
    const len = Math.sqrt(q.l2);
    if (Math.abs(q.h1 - q.h0) / len < 0.18 || q.az > GATE.z + 15 || q.az < -218) continue;
    const n = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const side = (k - 1.5) * 0.78;
      pts.push({ x: q.ax + q.dx * (i + 0.5) / n + q.dz / len * side,
        z: q.az + q.dz * (i + 0.5) / n - q.dx / len * side, d: len / n * 0.85, rot: Math.atan2(q.dx, q.dz) });
    }
  }
  if (!pts.length) return;
  const mesh = new THREE.InstancedMesh(ROOM_BOX, STEP_MAT, pts.length), dummy = new THREE.Object3D();
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i], hx = Math.sin(q.rot) * q.d / 2, hz = Math.cos(q.rot) * q.d / 2;
    let low = Infinity;
    for (const side of [-1, 0, 1]) for (const end of [-1, 0, 1]) {
      low = Math.min(low, rt.world.heightAt(q.x + Math.cos(q.rot) * side * 0.37 + hx * end, q.z - Math.sin(q.rot) * side * 0.37 + hz * end));
    }
    // 最も低い縁から十二センチだけ見せる。上り側は土に隠れ、遠い段も空に突き出ない。
    dummy.position.set(q.x, low - 0.18, q.z);
    dummy.rotation.set(0, q.rot, 0); dummy.scale.set(0.74, 0.6, q.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
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
    if (!army.world.walkable(x, z) || Math.abs(y - u.pos.y) > 0.6 || army.wallBetween(u.pos, -1, q)) {
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

// 信長公記巻十の信忠・明智・羽柴・筒井・細川による包囲。
// 城の参照表と既存の尾根道に合わせる。曲輪の守将・人数・仕寄りの位置は補完。
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
  ], '信長公記巻十、城の参照表の信貴山'),
  rosterPlan('尾根と曲輪の守り', 1, TOP, 0, [
    ['hisahide', '本陣', '松永久秀', 2400, TOP.x, TOP.z, 'todo', 'todo', 0, { bind: 'ehon.lord' }],
    ['gate', '大手の木戸', '松永久秀の配下（名は不明）', 1600, GATE.x + 8, GATE.z - 5, 'todo', 'todo', 0, { bind: 'arch' }],
    ['lower', '北尾根の下の曲輪', '松永久秀の配下（名は不明）', 1600, RIDGE1.x, RIDGE1.z, 'todo', 'todo', 0, { bind: 'rg1' }],
    ['upper', '北尾根の上の曲輪', '松永久秀の配下（名は不明）', 800, RIDGE2.x, RIDGE2.z, 'todo', 'todo', 0, { bind: 'rg2' }],
    ['yashiki', '松永屋敷', '松永久秀の配下（名は不明）', 1600, YASHIKI.x, YASHIKI.z, 'todo', 'todo', 0, { bind: 'ryk' }],
  ], '信長公記巻十、信貴山城の曲輪資料。朝護孫子寺に守備隊は置かない'),
];
const shigisan = {
  noticeOnce: true, // 同じ下知・使番の知らせは一戦に一度だけ。
  sideTaskAfter: Infinity, // 櫓の中を取る別任務で、火掛けと曲輪取りを邪魔しない。
  battleVoices: { lines: { ally: {
    ambient: ['信貴山の城を囲んでおる。先手と進め', '尾根道では前の仲間に続け', '松永勢は曲輪におる。槍をそろえよ'],
    order: ['信忠「諸口の味方と寄せよ。尾根の口を押さえよ！」'],
  } } },
  noHorse: true, // 山城の細い石段を登る。徒歩で出る
  jinkei: JIN,
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noTaisho: true, // 自害の戦を、共通の城主討取り勝利にしない。両将はこの戦で置く。
  noWake: false, // 包囲の同じ兵を近い所から本物へ替える。城の守備は増やさない。
  noReserve: true, // 麓の兵を主人公の補充兵へ変えない。
  wakeRoom: 247, // 包囲の交代兵を含め、実兵は二百五十人ほどまで。
  openingSafe: 12, // 下知と敵の姿を確かめる間は、手傷と落馬を防ぐ。
  attackWarningDelay: 1, // 向きの合図から一秒は避ける間を残す。
  strictHits: true, // 続けて打たれた時も、手傷を自動で軽くしない。
  enemyTactics: { advance: false, withdraw: false, flank: false, reinforce: false },
  botOrders: true, // 柵の口への回り道・門の外の持ち場を、遊び手の突進で上書きしない。
  spawn: { x: OPEN_PT[0], z: OPEN_PT[1], heading: Math.atan2(OPEN_NEXT[0] - OPEN_PT[0], OPEN_NEXT[1] - OPEN_PT[1]) },
  world: {
    seed: 15770,
    groundHalf: 280, // 北端の屋敷の切岸まで。草木・実兵の数は増やさない。
    moveLim: 270, // 北端の屋敷へ実際に歩いて入れる範囲。城や兵の大きさは変えない。
    fieldStage: 'stubble',
    paddy: (x, z) => x > 84 && x < 130 && z > 164 && z < 204 ? 1 : 0,
    time: 'night',
    nightLift: 3.8,
    fogFar: 310, // 月明かりの尾根越しに、城の櫓の輪郭を見せる。
    treePadMul: 2.5, // 共通の木・竹も道から離す。
    winter: true,
    muddy: 0.3,
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    combatSpace: shigisanCombatSpace,
    paths: WALK_LINES,   // 大手のほか、西の尾根道・寺の側の道・裏道
    pathWidth: ROAD_HALF, // 整地した道の半幅と合わせ、列の端を切岸と誤って止めない。
    height,
    blockedEscape: true, // 柵際で五秒詰まった時だけ、歩ける向きへ退く。
    blockedHint: (rt) => rt.flags.step < 2 ? '尾根道の曲がり角の印へ戻れ。急な山肌は登れない' : rt.flags.step < 3.5 ? '門前の道を進め。門が開くまで先手を守れ' : '曲輪へは柵の口と尾根道を進め。本丸へは西を回り南の口へ',
    tint(x, z, h, c) { if (h > 14) c.setRGB(Math.min(1, c.r * 1.12 + 0.06), Math.min(1, c.g * 1.18 + 0.08), Math.min(1, c.b * 1.1 + 0.05)); },
    clear: (x, z) => Math.abs(x) < 40 && z > YASHIKI.z - 24 && z < 130,
    trees: 420,
    rocks: 0, // 共通の散布岩は使わず、道と平場を避けた少量の自然石だけにする。
    tufts: 1800,
    treeDensity: (x, z) => (Math.abs(x) < 44 && z > YASHIKI.z - 24 ? 0.15 : 1),
    groves: [], // 密林の手置きは道の空きを無視するので、この攻め口には置かない。
    fleeOut: (x, z, team) => team === 1 && (z < YASHIKI.z - 28 || Math.abs(x) > 110),
  },

  waitForPlayer: false, // 組頭の下知の後、法螺の合図で寄せる。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', mainKeep: 'HIST_B', ridgeKuruwa: 'HIST_B', templeArea: 'HIST_B', matsunagaEnd: 'HIST_A', tsutsuiRidge: 'HIST_B', routes: 'GAME_C', sally: 'GAME_C' };
    F.sgFront = []; F.sgFrontAt = 0; rt.army.shigisanFlags = F;
    F.step = 0; F.ek = 0; F.ak = 0; F.firstFoe = null; F.firstFightT = null;
    // 縄張り（castle_plan.js）：曲輪の囲いと段を共通化。大手の閉じた門だけは戦の側で作る
    ridgeTerrain(W);
    F.C = buildCastlePlan(rt, ATTACK_PLAN, { life: false, ladders: true, baseHeight: base, edgeW: TERRAIN_EDGE });
    // 下の曲輪・屋敷の木柵は破れる。切岸・空堀と本丸の囲いは保つ。
    for (const s of F.C.walls) if (s && s.seg) { s.hp = s.maxHp = 650; s.noTarget = false; s.wall = true; }
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // ---- 門の曲輪：柵と門、脇の物見櫓 ----
    noT(wallLine(rt, [[-28, GATE.z + 4], [-5.5, GATE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[5.5, GATE.z], [28, GATE.z + 4]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.gate = rt.army.addStruct({ seg: [-5.5, GATE.z, 5.5, GATE.z], nx: 0, nz: 1, hp: 1800, maxHp: 1800, armor: 0.22, team: 1, name: '門' });
    const dm = tobira(W, GATE.x, GATE.z, 11, 0);   // 閉じた扉（破られると根元から倒れる）
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, GATE.x, GATE.z, 11.4, 0, { doors: false }));
    F.tower = yagura(W, TOWER.x, TOWER.z);
    rt.scene.add(F.tower, yagura(W, -12, GATE.z - 6));
    // ---- 本丸（雄嶽の主郭）：柵の囲い（南に口）と、木造の高櫓（近世の大天守にしない。docs 60〜74） ----
    noT(F.C.walls.filter((w) => w.name === '主郭（高櫓）'));
    rt.scene.add(kabukimon(W, 0, TOP.z + TOP.r, 7.4, 0, { doors: false }));
    // 松永の小さな高櫓は縄張りの lordSeat から建てる。主郭は土の切岸のままにする。
    // 門前と天守の戸口に篝火。道と火掛けの足元は空け、炎を鉄籠の高さに合わせる。
    for (const [x, z] of [[-6, GATE.z + 8], [6, GATE.z + 8], [TOP.x - 5.6, TOP.z - 1.5], [TOP.x + 1.6, TOP.z - 1.5]]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 });
    }
    // 高い尾根からも生駒の稜線を見せる。裾は地面の下のまま、共通の遠景の形を使う。
    for (const m of W.mountains.children) m.scale.y = 3;
    ridgeSoil(rt);
    terraceStone(rt);
    entranceSteps(rt);
    well(rt, TOP.x - 11, TOP.z + 2);
    well(rt, YASHIKI.x - 11, YASHIKI.z - 5);
    F.rooms = BUILDINGS.map((q) => ['goten', 'hondo'].includes(q.kind) ? goten(rt, q.x, q.z, { ...q, tile: false, team: 1, naka: true, doorX: 0, noTarget: true }) : boardRoom(rt, q));
    for (const room of F.rooms) room.naka.guards = []; // 入れる建物に兵を増やさない。寺は戦の外。
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [TOP.x - 16, TOP.z + 6], [TOP.x + 14, TOP.z + 10]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // 五段の土塁と柵は共通の縄張りからまとめて描く。口だけ開いた木戸。
    F.monomi = SHIGISAN_PLAN.yagura.filter((y) => y.id !== 'monomi_gate').map((y) => monomi(rt, y.at[0], y.at[1], { team: 1, name: '物見櫓' }));
    for (const c of [RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI]) rt.scene.add(kabukimon(W, c.x, c.z + c.r, 7, 0, { doors: false }));
    // 主尾根の正面は東。閉門を増やさず、既存の道の開口と同じ位置に木戸を置く。
    for (const c of [RIDGE1, YASHIKI]) rt.scene.add(kabukimon(W, c.x + c.w, c.z, 7.4, Math.PI / 2, { doors: false }));
    // 遠い二段の兵糧小屋は板葺きで材質ごとにまとめる（室内なし）。
    const huts = makeSimpleBatch();
    for (const c of [RIDGE3, RIDGE4]) hut(W, c.x + 5, c.z, 3.5, 3, 0, { ita: true, minka: false, batch: huts });
    finalizeSimpleBatch(rt, huts);
    for (const [x, z] of [[RIDGE1.x + 7, RIDGE1.z - 1], [RIDGE2.x - 6, RIDGE2.z + 1]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // ---- 松永屋敷（北尾根のさらに奥の郭。主殿・家臣の詰所・倉。暮らしと政治の区域。通り抜けを塞がぬよう、壁は装飾の低い塀だけ） ----
    rt.scene.add(tawara(W, YASHIKI.x + 8, YASHIKI.z + 1, 0.2, 5));
    rt.scene.add(nobori(W, YASHIKI.x - YASHIKI.r + 1, YASHIKI.z, 'todo', 6));
    // ---- 朝護孫子寺の区域（今の建物は写さない。寺と軍事の区域を分ける。装飾のみ・戦いの的にしない） ----
    rt.scene.add(tsuiji(W, [TEMPLE.x - TEMPLE.r, TEMPLE.z - TEMPLE.r, TEMPLE.x + TEMPLE.r, TEMPLE.z - TEMPLE.r], { h: 2.2 }));
    // 山門脇の低い留め石だけに購入した城の部品を使う。
    for (const z of [TEMPLE.z - 3, TEMPLE.z + 3]) rt.scene.add(ishigaki(W, [[TEMPLE.x - TEMPLE.r - 0.6, z], [TEMPLE.x - TEMPLE.r + 0.6, z]], { topY: W.heightAt(TEMPLE.x - TEMPLE.r, z) + 0.35, minH: 0.35, maxH: 0.5, lean: 0.08, big: 1.2 }));
    KIT.farVillage(rt, 104, 180, { n: 5, fields: 5, seed: 1577 });
    // 寺の区域は城の区域と分ける：四方を築地で囲み、山門を西（城の登城道の側）へ向け、境内の灯と僧の姿を置く。戦いの的にしない
    {
      const P = TEMPLE_ZONE.poly, R = TEMPLE.r;
      for (const seg of [[TEMPLE.x - R, TEMPLE.z + R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x + R, TEMPLE.z - R, TEMPLE.x + R, TEMPLE.z + R]]) rt.scene.add(tsuiji(W, seg, { h: 2.2 }));
      rt.scene.add(tsuiji(W, [TEMPLE.x - R, TEMPLE.z - R, TEMPLE.x - R, TEMPLE.z - 2], { h: 2.2 }), tsuiji(W, [TEMPLE.x - R, TEMPLE.z + 2, TEMPLE.x - R, TEMPLE.z + R], { h: 2.2 }));
      rt.scene.add(kabukimon(W, TEMPLE_ZONE.sanmon.x, TEMPLE_ZONE.sanmon.z, 4.4, Math.PI / 2, { doors: false }));
      rt.marker('tera', { x: TEMPLE.x, z: TEMPLE.z }, '朝護孫子寺（戦の外）', { h: 5, noGuide: true });
      F.templeZone = TEMPLE_ZONE;
    }
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
    F.arch = enemyGroup(rt, { fixed: true, faction: 'saito', name: '木戸の弓', anchor: { x: 8, z: GATE.z - 3 }, facing: 0, width: 14, aggro: 40, noRout: false, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'bow', n: 7 }, { type: 'gun', n: 2 }], MATSU));
    // ---- 麓の織田の陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, -16, 132, 0.3, 6));
    // 麓の総大将 織田信忠の本陣と、本丸の松永久秀の陣所（旗本は本丸の内に控える）
    F.honjin = camp(rt, { x: 0, z: 142, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 2, z: 92 } });
    F.honjin.guard.anchor.z = 127; F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 12;
    F.tsuCamp = camp(rt, { ...TSUTSUI_CAMP, facing: Math.PI, team: 0, mon: 'igeta', general: { name: '筒井順慶' }, guard: 15, reserve: 0, runTo: { x: 2, z: 80 } });
    // 旗本は南の口を守る。閉じた北の幕を横切る持ち場へ動かさない。
    F.tsuCamp.guard.guard = true; F.tsuCamp.guard.guardLeash = 12;
    F.ehon = makeLordKeep(rt, { name: '松永久秀', naka: F.C.seat.naka, faction: 'saito', flag: 'todo', guardN: 4 });
    rt.army.spawn(F.ehon.lord.group, [{ type: 'busho', n: 1, o: { name: '松永久通', x: F.ehon.spot.x + 1.5, z: F.ehon.spot.z, invuln: true } }]);
    F.hisamichi = F.ehon.lord.group.units[1];
    F.hisamichi.keep = true; F.hisamichi.noTarget = true; F.hisamichi.pos.y = F.ehon.spot.y;
    F.ehon.lord.invuln = true; F.ehon.lord.noTarget = true; F.ehon.lord.group.noAI = true;
    for (const u of [F.ehon.lord, F.hisamichi]) { u.aiT = Infinity; u.perch = { x: u.pos.x, z: u.pos.z }; }
    // 史料の最期は自害。室内の共通の一騎打ち案内は使わない。
    F.C.seat.naka.onEnter = null; F.C.seat.naka.onLevel = null;
    F.amb = enemyGroup(rt, { fixed: true, ambush: true, faction: 'saito', name: '尾根の松永勢', anchor: { x: AMBUSH_PT[0], z: AMBUSH_PT[1] }, facing: Math.atan2(OPEN_PT[0] - AMBUSH_PT[0], OPEN_PT[1] - AMBUSH_PT[1]), formation: 'column', order: 'hold', aggro: 16, width: 5, morale: 90, fleeDir: { x: -1, z: -0.5 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], MATSU));
    // 後列も登城道に沿わせ、藪の急斜面へ並べない。下知までは動かさない。
    march(F.amb, [OPEN_PT]);
    F.amb.path = [OPEN_NEXT, AMBUSH_PT, OPEN_PT]; F.amb.pathIdx = 2; F.amb.speed = 0;
    for (const u of F.amb.units) {
      const q = F.amb.slotPos(u.slot, F.amb.initial);
      u.pos.set(q.x, W.heightAt(q.x, q.z), q.z); u.mesh.position.copy(u.pos);
    }
    F.sally = enemyGroup(rt, { fixed: true, faction: 'saito', name: '木戸脇の控え', anchor: { x: 22, z: GATE.z - 10 }, facing: 0, formation: 'yari', order: 'hold', aggro: 8, width: 6, morale: 90, fleeDir: { x: 0.5, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], MATSU));
    F.rg1 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '下の曲輪の松永勢', anchor: { x: RIDGE1.x - 3, z: RIDGE1.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    F.rg2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の曲輪の松永勢', anchor: { x: RIDGE2.x, z: RIDGE2.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 9, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], MATSU));
    F.ryk = enemyGroup(rt, { fixed: true, faction: 'saito', name: '松永屋敷の守り', anchor: { x: YASHIKI.x + 11, z: YASHIKI.z - 1 }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 1, z: 0 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    const mk = (x, z, name, list) => enemyGroup(rt, { fixed: true, faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 20, aggro: 16, width: 7, formation: 'yari', morale: 100, noRout: false, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(list, MATSU));
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

    rt.world.setTime('night');
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '一手を率い、先手と尾根道へ進め' : '先手と尾根道へ進め', 'main');
    rt.say('組頭', 'ここから城へ寄せるぞ。先手に続け、尾根の松永勢を退けよ！', 5);
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
    sfx('horagai', 1);
    rt.banner('かかれ', '筒井の衆に続き、尾根道を登れ');
    rt.obj('main', '先手について尾根道を登れ', 'main');
    F.guideI = OPEN_I; F.guidePoint = { x: OPEN_PT[0], z: OPEN_PT[1] };
    rt.marker('climb', () => F.guidePoint, '尾根道・次の曲がり角');
    const road = ROAD.slice(0, ROAD.findIndex((p) => p[1] === GATE.z));
    F.gateGather = { x: GATE.x, z: GATE.z + 6 };
    F.oda.forEach((g, i) => march(g, road.slice(Math.max(1, OPEN_I - i) + 1)));
    F.ambCommitted = true; F.amb.ambush = false; F.amb.noAI = false; F.amb.speed = 2.3;
    F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'column'; g.colW = 2; g.seekRange = 24; };
    for (const u of F.amb.units) { u._crouch = false; u.aiT = 0; }
  },

  // ② 物見櫓に火を放つ
  tower(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('tower'); rt.objProgress('main', '');
    rt.unmark('amb'); rt.unmark('climb');
    rt.award((t) => t.side.push('尾根の伏兵を退けた'), '伏兵を退けた');
    rt.banner('門の前', '木戸の内から矢が降ってくる');
    rt.obj('main', HI(rt) ? '手の者と門脇の櫓に火を放て' : '門脇の櫓に火を放て', 'main');
    rt.say('組頭', '矢に備えよ！　門脇の櫓に火をかけるのじゃ！', 4);
    const P = TOWER_FIRE;
    F.tp = P;
    rt.marker('tower', P, '火をかける所', { h: 3 });
    rt.addInteract('tower', P, '櫓に火をかける', () => this.fireTower(rt), { r: 3.2, hold: 2 });
    rt.zone('tower', P.x, P.z, 3.2);
    // 打ち手は登城道の最後まで進める。門脇へ下げると、空堀と壊せない柵へ向かってしまう。
    F.ram.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    // 遅れた先手も折り返しを通る。鉄砲組は道の後ろに止め、斜面への近道をさせない。
    for (let i = 0; i < 2; i++) {
      const g = F.oda[i];
      if (gone(g)) continue;
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
  fireTower(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || F.towerLit) return;
    F.towerLit = true;
    rt.uninteract('tower'); rt.unmark('tower'); rt.unzone('tower');
    const W = rt.world;
    for (const [dx, dz, h] of [[0, 0, 3], [0.6, 0.6, 5]]) {
      const fire = W.addFire(TOWER.x + dx, TOWER.z + dz, { h });
      // 共通の水平な七歩の光は坂へ刺さる。櫓の四本の根元に合う幅で地面へ沿わせる。
      const g = new THREE.PlaneGeometry(3.8, 3.8, 4, 4); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position, ground = W.heightAt(TOWER.x, TOWER.z);
      for (let i = 0; i < pos.count; i++) pos.setY(i, W.heightAt(TOWER.x + pos.getX(i), TOWER.z + pos.getZ(i)) - ground + 0.08);
      g.computeVertexNormals(); fire.glow.geometry = g;
      fire.glow.scale.setScalar(1); fire.glow.position.set(TOWER.x, ground, TOWER.z);
      if (dx) fire.glow.visible = false; // 同じ足元に光を二枚重ねない。
    }
    W.addSmokeColumn(TOWER.x, W.heightAt(TOWER.x, TOWER.z) + 8, TOWER.z, { size: 2.6 });
    F.tower.rotation.z = 0.12;
    F.arch.noRout = false; F.arch.morale = 10;
    rt.award((t) => t.side.push('物見櫓に火を放った'), '物見櫓に火を放った');
    rt.say('組頭', '火が回ったぞ！　掛矢の衆、門へ取り付け！', 3);
    this.gateFight(rt);
  },

  // ③ 門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '手の者と打ち手を守り、門を破れ' : '打ち手を守り、門を破れ', 'main');
    const R = F.ram;
    // 遅れた打ち手も九十九折りを登り切り、土橋の正面から門へ取り付く。
    const approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    // 土橋で北へ向き直ってから到着を判定する。斜めの縦隊のままだと後列が空堀へ出る。
    approach.push([GATE.x, GATE.z + 6], [GATE.x, GATE.z + 4]);
    march(R, approach);
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
    rt.marker('gate', hitPoint, '門を打つ所', { h: 4 });
    rt.addInteract('ramgate', hitPoint, '掛矢で門を打つ', () => {
      if (F.step !== 3 || F.ending || rt.over || !rt.player.u.alive || !F.gate.alive) return;
      rt.army.damage(F.gate, 55, rt.player.u);
      rt.army.play('wood', GATE, 1.1);
      rt.game.hitstop = 0.05;
    }, { r: 3.4, hold: 0.6 });
    F.sally.aggro = 16; // 木戸の内で構え、攻め手を受ける。
    if (!F.gate.alive) this.interior(rt);

  },

  // ③.5 北尾根の曲輪群（castle_plan.js の縄張り・siege_zones.js の区域：それぞれ独立して守る。
  // 下の曲輪を取れば、正面（上の曲輪）と裏（松永屋敷）の二手に分かれる。どちらかを抜ければ主郭へ）
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
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('門、破れる', '先手に続き、北尾根の下の曲輪へ進む');
    rt.obj('main', '北尾根の下の曲輪へ入り、敵を退けよ', 'main');
    rt.say('組頭', '門を抜けたぞ！　北の曲輪へ寄せよ、足場を渡すな！', 4);
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
      // 退く兵・負傷兵・天守内の父子で曲輪の確保を止めない。
      unitFilter: (u) => !u.fleeing && !u.woundOut && !u.gone && !u.noTarget,
      onFall: (id) => this.onZoneFall(rt, id),
    });
    rt.marker('rg1', RIDGE1, '北尾根の下の曲輪');

  },
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.SZ.byId[id].owner !== ZONE_STATE.FRIEND) return;
    if (id === 'ridge1') {
      if (F.lowerTaken) return;
      F.lowerTaken = true; F.stepT = rt.t;
      rt.award((t) => t.side.push('北尾根の下の曲輪を取った'), '下の曲輪を取った');
      rt.unmark('rg1'); F.innerDone = true; F.innerRoute = 'ridge2';
      rt.say('組頭', '下の曲輪は取った！　先手と尾根道を戻り、本丸の南の口へ寄せよ！', 4.5);
      this.honmaru(rt);
    } else if ((id === 'ridge2' || id === 'yashiki') && F.lowerTaken) {
      rt.award((t) => t.side.push(id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ'), id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ');
    }
  },

  // ④ 天守の前
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru'); rt.objProgress('main', '');
    rt.unmark('gate'); rt.unmark('sally');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('本丸へ', '木戸の内で、松永の衆が槍をそろえる');
    rt.obj('main', '守りを崩し、味方と本丸を取れ', 'main');
    rt.marker('l1', centerOf(F.last[0]), '本丸の守り', { red: true, group: F.last[0] });
    rt.unmark('rg2'); rt.unmark('yashiki'); rt.unmark('branch'); rt.uninteract('yashikiRoute'); rt.marker('honmaru', { x: TOP.x, z: TOP.z + 8 }, '本丸の持ち場');
    const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
    const route = F.innerRoute === 'yashiki' ? ROUTES.find((q) => q.id === 'yashiki').pts.slice(6).concat([[0, TOP.z + 8]]) : ROAD.slice(a);
    for (const q of F.oda) march(q, route);
  },

  win(rt, otherFront = false) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (const id of ['tsu', 'amb', 'branch', 'climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
    rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower');
    // 落城を見聞きできる本丸の兵だけに伝える。離れた曲輪の守りは残す。
    for (const q of F.last || []) if (!gone(q) && Math.hypot(q.center().x - TOP.x, q.center().z - TOP.z) < TOP.r + 12) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    if (otherFront) {
      rt.objFail('main'); rt.tracker.main = false;
      rt.say('組頭', '諸口の味方が本丸へ入った！　こちらは持ち場を守れ！', 5);
    } else {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.special = { label: '信貴山城の天守の前まで攻め入った', pts: 20 }; }, '信貴山城を攻め落とした');
    }
    sfx('horagai', 0.8);
    rt.banner('信貴山城、落ちる', '松永久秀は天守に火を放ち、焼死した');
    const W = rt.world;
    // 天守の内に隠れた小火ではなく、南の軒へ噴き出す炎を本丸から見せる。
    F.castleFire = W.addFire(TOP.x - 2, TOP.z - 2, { size: 2, h: 2 });
    F.castleFireAt = rt.t;
    // 城内の自害は戦後の語りで知らせ、足軽による討取りにしない。
    for (const u of [F.ehon.lord, F.hisamichi]) { u.alive = false; u.noTarget = true; if (u.mesh) u.mesh.visible = false; }
    rt.after(2, () => rt.say('', '――久秀・久通父子は、信貴山城で最期を迎えた', 5));
    rt.after(7, () => rt.say('', '――松永の城は落ち、大和に筒井順慶の勢いが増した', 4.5));
    // 固有の終幕を保つ。共通の追撃へ移ると、父子の最期を伝える台詞が消える。
    rt.after(0.5, function growFire() {
      shigisan.withdrawTick(rt);
      if (!rt.ended && rt.t - F.castleFireAt < 12) rt.after(0.5, growFire);
    });
    rt.finish({ scriptedEnd: true }, 13);
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
        if (d > 12 || Math.abs(u.pos.y - p.pos.y) > 3 || rt.army.wallBetween(u.pos, -1, p.pos)) continue;
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
    // 八分で諸口の夜攻めが決着する。本人の本丸取りの戦功は実際に取った時だけ。
    // 十三秒の父子の最期まで含め、五百秒より前に終幕を閉じる。
    if (rt.t >= 480) { this.win(rt, true); return; }
    // 門の内の控えを門外へ呼び出さない。段を越えた守兵だけを寄せる。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, F.step < 3.5 ? [F.amb] : F.step < 4 ? [F.rg1, F.rg2, F.ryk] : F.last, F.oda, F.step === 1 ? '先手と尾根の敵を押し返せ' : F.step === 2 ? '門の右の櫓に火をかけよ' : F.step === 3 ? '門前で打ち手を守り、門を打て' : '先手と敵を崩し、曲輪を取れ');
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
      while (F.guideI < end) {
        const a = ROAD[F.guideI], b = ROAD[F.guideI + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1);
        const nearRoad = t >= 0 && t <= 1 && Math.hypot(p.x - (a[0] + dx * t), p.z - (a[1] + dz * t)) < 8;
        if (Math.hypot(p.x - a[0], p.z - a[1]) >= 8 && !nearRoad) break;
        F.guideI++;
      }
      F.guidePoint.x = ROAD[F.guideI][0]; F.guidePoint.z = ROAD[F.guideI][1];
      if (!F.ambSeen && F.amb.units.some((u) => u.alive && (u.target || !u._crouch))) {
        F.ambSeen = true;
        rt.say('足軽', '尾根に松永勢がおるがや！', 3);
        rt.obj('main', '尾根の松永勢を退け、門の前へ進め', 'main');
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
      if ((gone(F.amb) || F.ambCommitted && !roadThreat) && need > 0 && arrived >= need && Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 20) this.tower(rt);
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
      F.guideT = 1;
      if (F.step === 1) {
        rt.objProgress('main', gone(F.amb) ? '敵は退いた。先手と門前へ' : sightPoint(rt, F.amb.anchor) ? '先手と尾根の松永勢を退けよ' : '尾根道を進め。先手を離れるな');
      }
      if (F.step === 2) rt.objProgress('main', '門の右の櫓に火をかけよ');
      if (F.step === 3.5 || F.step === 4) {
        const id = F.step === 4 ? 'shu' : F.SZ.byId.ridge1.owner !== ZONE_STATE.FRIEND ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
        const zone = F.SZ.byId[id];
        rt.objProgress('main', !sightPoint(rt, zone.pos) ? `${zone.name}へ先手と進め` : zone.enemies > 0 ? `${zone.name}の敵を味方と退けよ` : zone.friends < zone.need ? `${zone.name}の入口へ先手と入れ` : `${zone.name}で${zone.hold}秒、守りを固めよ`);
      }
      if (F.step === 3) {
        let hitters = 0, near = 0;
        for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut) { if (Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 10) near++; if (u.target === F.gate || u.atk?.target === F.gate) hitters++; }
        rt.objProgress('main', sightPoint(rt, GATE) ? `${gateWord(F.gate)}。${hitters ? '門を打つ味方を守れ' : near ? '打ち手は門前。掛矢で門を打て' : '打ち手を門前へ集めよ'}` : '門の正面へ。掛矢で門を打て');
      }
    }
    // 攻め口の兵が崩れれば、時間で勝たせず寄せを打ち切る。
    let ready = 0;
    for (const q of F.oda) for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) ready++;
    const exhausted = F.step >= 1 && ready < (F.step >= 3.5 ? 1 : 5);
    if (!F.ending && F.step >= 1 && (F.oda.every(gone) || exhausted)) {
      F.ending = true; rt.objFail('main'); rt.say('組頭', 'これ以上は寄せられぬ。麓へ退け！', 4); rt.tracker.main = false; rt.setPhase('end'); rt.objProgress('main', '');
      for (const id of ['tsu', 'amb', 'branch', 'climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
      rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower'); rt.finish({ scriptedEnd: true }, 6);
      return;
    }
    if (F.step >= 3.5 && F.SZ) {
      F.SZ.tick(dt);
      const s = F.SZ.byId;
      if (F.step === 4 && F.lowerTaken && s.shu.owner === ZONE_STATE.FRIEND && s.shu.test(rt.player.u.pos.x, rt.player.u.pos.z) && F.last.every((g) => gone(g) || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - TOP.x, u.pos.z - TOP.z) < TOP.r + 12))) this.win(rt);
    }
    if (F.ending || rt.over) return;
    // 十五秒ごとに距離と戦果を比べる。四十五秒の停滞には先手の援護を出す。
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

  // 四十五秒間、距離も戦果も変わらなければ、同じ兵を道に沿って押し出す。
  // 兵の追加・瞬間移動・時間だけの勝利は行わない。
  assistAdvance(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const id = F.step === 4 ? 'shu' : F.step === 3.5 ? (!F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2') : String(F.step);
    const goal = F.SZ?.byId[id]?.pos || (F.step === 2 ? TOWER_FIRE : GATE);
    let distance = Math.hypot(p.x - goal.x, p.z - goal.z);
    for (const g of F.oda) if (!gone(g)) {
      const c = g.center(); distance = Math.min(distance, Math.hypot(c.x - goal.x, c.z - goal.z));
    }
    const hp = F.gate.alive ? F.gate.hp : 0;
    if (F.advanceId !== id || distance < F.advanceDistance - 3 || F.advanceKills !== F.ek || F.advanceGateHp !== hp) {
      F.advanceId = id; F.advanceDistance = distance; F.advanceKills = F.ek; F.advanceGateHp = hp; F.advanceT = rt.t;
    }
    if (rt.t - F.advanceT < 45) return;
    F.advanceT = rt.t; rt.unmark('gather');
    if (F.step === 2) {
      // 近くの味方が火掛けを引き継ぐ。遠方から火を付けない。
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 18) { this.fireTower(rt); return; }
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
    const path = id === 'yashiki' ? ROUTES.find((r) => r.id === 'yashiki').pts : ROAD;
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
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();   // 扉が内へ倒れる
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
shigisan.history = '天正五年（1577）八月、石山本願寺を囲む陣にいた松永久秀は、勝手に陣を払って大和の信貴山城に籠もり、再び信長に背いた。信長は嫡男の織田信忠を大将に、佐久間信盛・羽柴秀吉・明智光秀・丹羽長秀らを諸口へ向かわせ、筒井順慶・細川藤孝らも攻めに加わり、支城の片岡城を落としてから信貴山城を囲んだ。十月十日の晩、諸口から夜攻めが行われ、城は落ち、久秀は天守に火を放って焼死した。この日は、十年前に東大寺の大仏殿が焼けた日と同じで、人々は因果と噂したと『信長公記』は伝える。久秀が名物の茶釜「平蜘蛛」を打ち砕いて死んだという話は、のちの伝えである。大和はその後、筒井順慶が治めた（大和一国を正式に任されたのは天正八年）。松永の紋は蔦で、ここでは近い形の蔦の紋で旗を描いている。兵の数には諸説ある。織田四万・松永八千はこの戦の仮の目安で、『信長公記』に当夜の両軍の総数は記されていない。各将の攻め口・北尾根の細かな攻め順・伏兵・櫓の放火・天守の形は推定で、当夜の天気は確定していない。';

function march(g, pts) {
  if (gone(g)) return;
  // 後列の持ち場に使う、通って来た道を残す。
  let history = g.order === 'path' && g.path ? g.path.slice(0, g.pathIdx) : [];
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

// 素直な遊び手：筒井について登り、伏兵と戦い、櫓に火をかけ、門を破る組を守り、天守の前で戦う
shigisan.botBrain = (b, inp, o) => { sgBot(b, inp, o); steerRing(b, inp, HONMARU); gateSteer(b, inp); };
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
  const e = strikeTarget(b, F.step === 2 ? 6 : 12);
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
    const goal = F.ambSeen && !gone(F.amb) ? F.amb.center() : F.guidePoint;
    climbBotWay(p, inp, goal.x, goal.z, 2, goTo);
    return;
  }
  if (F.step === 2) {
    const it = b.interacts.find((q) => q.id === 'tower');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 伏兵から櫓へ斜めに近道せず、登城道を登り切って土橋から火掛けの道へ進む。
      if (u.pos.z > GATE.z + 9) climbBotWay(p, inp, GATE.x, GATE.z + 6, 1, goTo);
      else if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1);
      else inp.k.add('KeyE');
    }
    return;
  }
  if (F.step === 3) {
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
    const useBranch = F.innerRoute === 'yashiki' && F.lowerTaken && u.pos.z <= RIDGE1.z + 14;
    const goal = id === 'shu' ? HONMARU_POST : id === 'yashiki' && !useBranch ? RIDGE1 : F.SZ.byId[id].pos;
    // 屋敷に残る敵を追い続けず、確保する曲輪まで先手と同じ道を通る。
    const path = useBranch ? ROUTES.find((q) => q.id === 'yashiki').pts : ROAD;
    castleBotWay(p, inp, path, goal, goTo);
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
function climbBotWay(p, inp, x, z, r, goTo) {
  const from = p._sgRoadFrom || (p._sgRoadFrom = {}), to = p._sgRoadTo || (p._sgRoadTo = {});
  const goal = p._sgRoadGoal || (p._sgRoadGoal = {});
  goal.x = x; goal.z = z; goal.y = p.u.pos.y;
  climbRoadPoint(p.u.pos.x, p.u.pos.z, from);
  climbRoadPoint(x, z, to);
  // 最後は道の脇の伏兵へ寄る。道から離れた事だけで引き戻さない。
  if (Math.abs(from.s - to.s) < 0.08 && Math.hypot(x - p.u.pos.x, z - p.u.pos.z) < 12 && localClear(p.rt.army, p.u.pos, goal, true)) {
    goTo(p, inp, x, z, r); return;
  }
  if (from.d > ROAD_HALF - 1) { goTo(p, inp, from.x, from.z, 1); return; }
  const forward = to.s > from.s;
  let i = forward ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
  if (i >= 0 && i <= CLIMB_END && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 1.2) i += forward ? 1 : -1;
  if (i >= 0 && i <= CLIMB_END && (forward ? i <= to.s : i >= to.s)) {
    goTo(p, inp, ROAD[i][0], ROAD[i][1], 1);
  } else if (Math.hypot(to.x - p.u.pos.x, to.z - p.u.pos.z) > 1.2) {
    goTo(p, inp, to.x, to.z, 1);
  } else if (localClear(p.rt.army, p.u.pos, goal, true)) goTo(p, inp, x, z, r);
  else { inp.k.delete('KeyW'); inp.runHeld = false; inp.chargeHold = false; }
}

const HONMARU = { x: TOP.x, z: TOP.z, r: TOP.r, gap: 0 };
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
  f.base = ground + 2.7 + t * 5;
  // 大きくなった火は周りを照らす光を受け取り、内の炎も一緒に持ち上げる
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
