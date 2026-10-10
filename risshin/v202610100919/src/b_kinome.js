import * as THREE from 'three';
import { dirtTex, stoneTex } from './nature.js';
import { pressureTick } from './battle_pressure.js';
import { rosterPlan } from './jinkei_roster.js';
// ======================================================================
// 越前一向一揆・木ノ芽峠（docs/late6-1573-1575-spec.md 65〜79章。もしも、天正三年八月十五日頃）
// 「砦ひとつ」でなく、尾根ごとに分かれた四つの城を攻める：観音丸城（低い前衛）→木ノ芽峠城（一揆の中核。
// 十数の郭を木戸内・副郭・主郭の三段で表す）→東の大堀切を渡って西光寺丸城／西へ分かれて鉢伏城（最高所・詰の城）。
// どちらを先に攻めるかは軍議で選べる。残した城の守兵は、近くを通る味方へ横から撃ちかける（実兵の矢玉）。
// 正面攻略は補い。門前にいる本人と後詰が寄せを助け合い、先手と後備えが崩れれば、この組の攻めは失敗する。
// B 杉津口（海岸側）は背景の戦い（distantArmy・知らせ）だけで、A 木ノ芽峠口（この地図）が主役。
// castle_plan.js・castle_parts.js・siege_zones.js・siege_ai.js（makeMountainDefense・makeMountainAmbush）・
// butai.js の置き換えを使い、十三隊各十四人まで。主人公・組の枠を別に残す。
// ======================================================================
import { yamaLift } from './yamalift.js';
import { tawara, sakamogi, lumber, kabukimon, ishigaki, makeKitBatch, finalizeKitBatch, village } from './props.js';
import { ishidan, kura } from './temple_parts.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { nm, wallLine } from './bhelp.js';
import { sightRef } from './battle_sight.js';
import { ZONE_STATE } from './siege_zones.js';
import { makeKinomeZones } from './b_kinome_field.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { kido, monomi, goten, horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeMountainDefense, makeMountainAmbush } from './siege_ai.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, announceAdvance, patchGunCover } from './taketaba.js';
import { demBlend } from './dem.js';
import { runnerBlocked } from './denrei.js';
import {
  KINOME_PLAN, KINOME_ROADS, ROAD, BRANCH_EAST, BRANCH_WEST, KX, KZ,
  GATE_KANNON, GATE_KINOME, GATE_SAIKOJI, GATE_HACHIBUSE,
  EXIT_KANNON, EXIT_KINOME, EXIT_SAIKOJI, EXIT_HACHIBUSE,
  CLIFF_X, FOREST_X,
} from './castles/kinome.js';

const ODA = { armor: 0x2b3140, flag: 'oda' };
const IKKO = { armor: 0x3a342c, flag: 'namu' };
const MIX = { ashigaru: 0.55, samurai: 0.15, gun: 0.15, bow: 0.15 };

// 国土地理院の標高（木ノ芽峠。束0 の asset_dem_kinome.js）。手書きの四城の地形の上に、道から離れた
// 所だけ実測の起伏を薄く足す（道・曲輪の上はいつもどおり手書きのまま）
let kiDem = null;
import('./asset_dem_kinome.js').then((m) => { kiDem = m.default; }).catch(() => {});
const DEM_XY = 6;

function nearestRoadDist(x, z) { return Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, BRANCH_EAST), distToPolyline(x, z, BRANCH_WEST)); }

// 使番の直進は折れた山道の法面へ突き当たる。本道と左右の尾根をつないで歩く。
const RUNNER_JUNCTION = ROAD.findIndex(([x, z]) => x === BRANCH_EAST[0][0] && z === BRANCH_EAST[0][1]);
const RUNNER_LOWER = ROAD.slice(0, RUNNER_JUNCTION + 1);
const RUNNER_UPPER = ROAD.slice(RUNNER_JUNCTION).reverse();
const RUNNER_PATHS = [ROAD,
  [...RUNNER_LOWER, ...BRANCH_EAST.slice(1)], [...RUNNER_LOWER, ...BRANCH_WEST.slice(1)],
  [...RUNNER_UPPER, ...BRANCH_EAST.slice(1)], [...RUNNER_UPPER, ...BRANCH_WEST.slice(1)],
  [...BRANCH_WEST].reverse().concat(BRANCH_EAST.slice(1))];
const RUNNER_FROM = {}, RUNNER_TO = {}, RUNNER_TEST = {}, RUNNER_RT = {};
function runnerClear(army, u, a, b) {
  if (army.wallBetween(a, -1, b, false)) return false;
  RUNNER_RT.world = army.world; RUNNER_RT.army = army;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.2);
  for (let i = 1; i <= n; i++) {
    if (runnerBlocked(RUNNER_RT, a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
  }
  return true;
}
function runnerProject(path, p, out, army, u) {
  // 遠い道の点まで毎回歩けるか調べない。まず距離だけで近い道を絞る。
  let limit = Infinity;
  if (army) { runnerProject(path, p, out); limit = out.d + 4; }
  out.d = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d || d > limit) continue;
    RUNNER_TEST.x = x; RUNNER_TEST.z = z;
    if (army && !runnerClear(army, u, p, RUNNER_TEST)) continue;
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
function runnerWay(army, u, want) {
  if (!u.isPlayer && !u.group?.isRunner) return want;
  const q = u._kinomeWay || (u._kinomeWay = { x: 0, z: 0, t: -1, active: false });
  if (q.t > army.time && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.33; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 14 && runnerClear(army, u, u.pos, want)) return want;
  let best = Infinity;
  for (const path of RUNNER_PATHS) {
    // 壁の確かめは、距離だけで候補を絞ってから行う。重なる本道を六度歩いて調べない。
    runnerProject(path, u.pos, RUNNER_FROM);
    runnerProject(path, want, RUNNER_TO);
    if (RUNNER_FROM.d + RUNNER_TO.d >= best) continue;
    runnerProject(path, u.pos, RUNNER_FROM, army, u);
    const score = RUNNER_FROM.d + RUNNER_TO.d;
    if (!Number.isFinite(score) || score >= best) continue;
    best = score; q.active = true;
    if (RUNNER_FROM.d > 1.2) { q.x = RUNNER_FROM.x; q.z = RUNNER_FROM.z; continue; }
    const forward = RUNNER_TO.s > RUNNER_FROM.s;
    let i = forward ? Math.floor(RUNNER_FROM.s) + 1 : Math.ceil(RUNNER_FROM.s) - 1;
    if (i >= 0 && i < path.length && Math.hypot(path[i][0] - u.pos.x, path[i][1] - u.pos.z) < 1.2) i += forward ? 1 : -1;
    if (i < 0 || i >= path.length || (forward ? i > RUNNER_TO.s : i < RUNNER_TO.s)) {
      q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
      if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 1.2 && runnerClear(army, u, u.pos, want)) q.active = false;
    } else { q.x = path[i][0]; q.z = path[i][1]; }
  }
  return q.active ? q : want;
}

function baseTerrain(x, z) {
  let h = 0.4 * Math.sin(x * 0.05 + 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.05 - x * 0.03);
  h += Math.max(0, z + KZ(172)) * 0.07;         // 南（敦賀側）から峠へ緩く上る
  h += Math.max(0, -x - KX(10)) * 0.07;         // 西（鉢伏）はさらに高く
  h += Math.max(0, x - KX(20)) * 0.06;          // 東（西光寺丸）も尾根なりに高く
  const d = nearestRoadDist(x, z);
  h += Math.min(9, Math.max(0, d - 22) * 0.2);   // 道・曲輪の外は緩く荒れる程度（flank の兵が詰まらない広さを残す）
  // 西の崖を地図の端まで伸ばすと二千メートルの板になる。崖の肩から先は尾根へ丸める。
  if (x < CLIFF_X) h += 50 * (1 - Math.exp(-(CLIFF_X - x) * 2.2 / 50));
  if (kiDem && d > 16) h += demBlend(kiDem, x * DEM_XY, z * DEM_XY, 0, { scale: 0.05, floor: -6 });
  // 鉢伏の頂は木ノ芽より約百四十メートル高い。尾根間は連続した斜面。
  const west = Math.max(0, Math.min(1, (-x - KX(14)) / KX(20)));
  const east = Math.max(0, Math.min(1, (x - KX(14)) / KX(18)));
  const ridge = Math.max(0, Math.min(1, (z - KZ(-60)) / KZ(42)));
  // 下地の傾斜と郭の盛土も含め、県史の620・643・762mの差（東23m・西142m）に合わせる。
  h += ridge * (137.3 * west * west * (3 - 2 * west) + 29.1 * east * east * (3 - 2 * east));
  return h + yamaLift(x, z, LIFT);
}
// 堀の窪みを見た目の地形にも含める（城の当たりだけの溝にしない）。
const DITCH_BEDS = KINOME_PLAN.hori.map(h => horiboriHeight(h.pts, { depth: h.deep, width: h.w, closed: false }));
function baseWithDitches(x, z) { let h = baseTerrain(x, z); for (const f of DITCH_BEDS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function heightRaw(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(KINOME_PLAN, baseWithDitches, 3); return HEIGHT_FN(x, z); }

// 部隊（Butai）の多点の道：着いたら次の点へ。最後まで着いたら attack（b_echizen_ikko.js と同じやり方）
// ・b.assault が立てて（下の gateOf）あれば assault で着く：木戸は誰も打ちに掛からないと開かず詰まる
//   （見つけた問題：観音丸を軽くした後、守兵が尽きても木戸が壊れず進めなくなる事があった）。
//   assault 下知は、近くに敵がいればそちらと斬り合い、いなければ b.assault() の木戸を打つ（army_think.js）
function setRoute(b, pts) {
  if (!active(b)) return;
  b.setForm('column');
  b._route = pts; b._i = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(b.pos.x - pts[i][0], b.pos.z - pts[i][1]);
    if (d >= best) continue;
    if (b.real && !runnerClear(b.rt.army, b.real.units[0], b.pos, { x: pts[i][0], z: pts[i][1] })) continue;
    if (d < best) { best = d; b._i = i; }
  }
  advance(b);
}
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b.assault ? 'assault' : 'attack', form: b.kind === 'bow' ? 'line' : 'yari' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
  if (b.real) { b.real.stay = false; b.real.speed = 2.4; }
}
// 寄せ手 b の先に立つ木戸を討つ的にする（木戸が壊れれば null を返し、ふつうの attack に戻る）
function gateOf(gate) { return () => (gate.struct.alive ? gate.struct : null); }
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || !active(b)) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10 || (b.real && b.real.order === 'hold' && Math.hypot(b.real.anchor.x - x, b.real.anchor.z - z) < 2)) advance(b);
  }
}
// 一向宗の姿（B014・B027）：門徒は鉢巻と茶の衣、寺の衆徒・薙刀の僧兵は白い裹頭と袈裟（humans.js の sohei）
function mkB(rt, o) {
  const monk = /衆徒|薙刀|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  const look = monk ? { sohei: 1, hat: 'hachimaki', lace: 0xcfc7b4, cloth: 0xd8d2c2 } : { hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
  // 一人ずつの控えを準備時にだけ並べる。細道は四列、郭の守りは八列。
  // 共通の混成遠景が足す騎馬や、八メートルの奥行きへの数百人の詰め込みを避ける。
  const people = [], columns = o.team === 0 ? 4 : 8;
  const sn = Math.sin(o.facing || 0), cs = Math.cos(o.facing || 0);
  for (let i = 0; i < o.nominal; i++) {
    const row = Math.floor(i / columns), side = (i % columns - (columns - 1) / 2) * 1.2;
    const back = -row * 1.4;
    const k = o.kind === 'bow' ? 'bow' : o.mix && i % 20 < 3 ? 'gun'
      : o.mix && i % 20 < 6 ? 'bow' : i % 20 === 19 ? 'banner'
        : i >= o.nominal - columns ? 'samurai' : 'spear';
    people.push({ x: o.at.x + side * cs + back * sn, z: o.at.z - side * sn + back * cs,
      facing: o.facing || 0, k, flag: k === 'banner' ? 0 : 1 });
  }
  const W = rt.world, add = W.addDistantArmy;
  W.addDistantArmy = function (q) { return add.call(this, { ...q, people, team: o.team, host: false }); };
  try {
    return makeButai(rt, { real: Math.min(14, o.nominal), maxReal: 36, nearReal: 36, farReal: 6, noSwitch: true,
      ...(o.faction === 'ikko' ? { look } : {}), ...o });
  } finally { W.addDistantArmy = add; }
}
function bOk(b) { return !!(b && b.aliveNominal() > 0); }
function active(b) { return bOk(b) && !b.real?.routed && b.real?.order !== 'flee'; }

// 道の区切り（南→北。木戸ごとに歩かせ直す）
const IX = (z) => ROAD.findIndex((p) => p[1] === KZ(z));   // 道の点の位置（九十九折りの点が増えても、門の点を探せる）
const ROAD_TO_KANNON = ROAD.slice(0, IX(-120) + 1);
const ROAD_METERS = [0];
for (let i = 1; i < ROAD.length; i++) ROAD_METERS[i] = ROAD_METERS[i - 1] + Math.hypot(ROAD[i][0] - ROAD[i - 1][0], ROAD[i][1] - ROAD[i - 1][1]);
// 長い本道には四十五メートルごとに小勢。曲がり角でも敵のいない道を短くする。
// 座標と道の長さは準備時だけ作り、戦の最中には使い回す。
const ROAD_GUARD_POINTS = [];
for (let m = ROAD_METERS[IX(-90)] + 20; m < ROAD_METERS[IX(-30)] - 12; m += 45) {
  let i = IX(-90) + 1;
  while (ROAD_METERS[i] < m) i++;
  const t = (m - ROAD_METERS[i - 1]) / (ROAD_METERS[i] - ROAD_METERS[i - 1]);
  ROAD_GUARD_POINTS.push({ x: ROAD[i - 1][0] + (ROAD[i][0] - ROAD[i - 1][0]) * t,
    z: ROAD[i - 1][1] + (ROAD[i][1] - ROAD[i - 1][1]) * t });
}
// 木戸から同じ二十四メートルの手前でも、真南は九十九折りの法面になる。
// 最後の登り道の上から出発し、木戸へ向ける。山の高さと守りは変えない。
const APPROACH = ROAD[IX(-120) - 1];
const APPROACH_DX = GATE_KANNON.x - APPROACH[0], APPROACH_DZ = GATE_KANNON.z - APPROACH[1];
const APPROACH_LEN = Math.hypot(APPROACH_DX, APPROACH_DZ);
const openingAt = (back) => ({ x: GATE_KANNON.x - APPROACH_DX / APPROACH_LEN * back, z: GATE_KANNON.z - APPROACH_DZ / APPROACH_LEN * back });
const START = { x: GATE_KANNON.x - APPROACH_DX / APPROACH_LEN * 24,
  z: GATE_KANNON.z - APPROACH_DZ / APPROACH_LEN * 24, heading: Math.atan2(APPROACH_DX, APPROACH_DZ) };
// 門外の二人で構えを覚えてから寄せる。城内の守りと木戸は残す。
ROAD_GUARD_POINTS.unshift(openingAt(10));
const ROAD_TO_JUNCTION = ROAD.slice(0, IX(-60) + 1);
const ROAD_TO_KINOME = ROAD.slice(0, IX(-30) + 1);
const ROAD_TO_FUKU = ROAD.slice(0, IX(8) + 1);
const ROAD_TO_HON = ROAD;
// 東西の別働は、観音丸城が落ちてから（木戸が開いてから）放つ＝必ず junction まで本道を通ってから分かれる
// （観音丸城の塀に斜めから突っかけて動けなくなる事がないように。見つけた問題：行き先があるのに動かない兵）
const EAST_GATE_I = BRANCH_EAST.findIndex(([x, z]) => x === GATE_SAIKOJI.x && z === GATE_SAIKOJI.z);
const WEST_GATE_I = BRANCH_WEST.findIndex(([x, z]) => x === GATE_HACHIBUSE.x && z === GATE_HACHIBUSE.z);
const BRANCH_EAST_GO = [...ROAD_TO_JUNCTION, ...BRANCH_EAST.slice(1, EAST_GATE_I + 1)];
const BRANCH_WEST_GO = [...ROAD_TO_JUNCTION, ...BRANCH_WEST.slice(1, WEST_GATE_I + 1)];
const EAST_TO_HON = BRANCH_EAST.slice(BRANCH_EAST.findIndex(([x, z]) => x === EXIT_SAIKOJI[0] && z === EXIT_SAIKOJI[1]));
const WEST_TO_HON = BRANCH_WEST.slice(BRANCH_WEST.findIndex(([x, z]) => x === EXIT_HACHIBUSE[0] && z === EXIT_HACHIBUSE[1]));

const inCourt = (x, z) => KINOME_PLAN.kuruwa.some(k => inPoly(k.poly, x, z));
// 広い地図へ無作為に散らすだけでは道の際に木が来ない。道の両肩へ少量ずつ寄せる。
const ROAD_GROVES = [];
for (const line of KINOME_ROADS) for (let i = 1; i < line.length; i++) {
  const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  for (let m = 24; m < len; m += 60) for (const side of [-1, 1]) {
    const x = ax + dx * m / len - dz / len * 20 * side;
    const z = az + dz * m / len + dx / len * 20 * side;
    if (nearestRoadDist(x, z) > 14 && !inCourt(x, z)) ROAD_GROVES.push({ x, z, r: 3, n: 3 });
  }
}

// 色の格子は約十五メートル。細い道はその上へ幅七メートルの土を一枚だけ重ねる。
// 地面の三角形と同じ高さを使い、粗い斜面へ道が埋まらないようにする。
function surfaceY(W, x, z) {
  const n = Math.round(W.half * 2 / W.step), row = n + 1;
  const fx = (x + W.half) / W.step, fz = (z + W.half) / W.step;
  const ix = Math.max(0, Math.min(n - 1, Math.floor(fx))), iz = Math.max(0, Math.min(n - 1, Math.floor(fz)));
  const tx = fx - ix, tz = fz - iz, k = iz * row + ix, g = W.grid;
  return tx + tz <= 1 ? g[k] + (g[k + 1] - g[k]) * tx + (g[k + row] - g[k]) * tz
    : g[k + row + 1] + (g[k + row] - g[k + row + 1]) * (1 - tx) + (g[k + 1] - g[k + row + 1]) * (1 - tz);
}
function dressPass(rt) {
  const W = rt.world, pos = [], uv = [], colors = [], indices = [], shoulders = [];
  for (const line of KINOME_ROADS) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, steps = Math.ceil(len / 2);
    const first = pos.length / 3;
    for (let j = 0; j <= steps; j++) {
      const x = ax + dx * j / steps, z = az + dz * j / steps;
      for (let c = 0; c < 5; c++) {
        const off = (c - 2) * 1.75, px = x + nx * off, pz = z + nz * off;
        pos.push(px, surfaceY(W, px, pz) + .07, pz); uv.push(px * .23, pz * .23);
        const edge = c === 0 || c === 4;
        colors.push(edge ? .5 : .9, edge ? .57 : .72, edge ? .32 : .48);
      }
      if (j && !inCourt(x, z)) for (let c = 0; c < 4; c++) {
        const a = first + (j - 1) * 5 + c, b = a + 5;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    for (let m = 6; m < len; m += 12) for (const side of [-1, 1]) {
      const x = ax + dx * m / len + nx * side * 6, z = az + dz * m / len + nz * side * 6;
      if (nearestRoadDist(x, z) > 4 && !inCourt(x, z)) shoulders.push({ x, z, nx, nz, side });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: dirtTex(), vertexColors: true,
    roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  road.receiveShadow = true; rt.scene.add(road);

  // 岩と草は形と材質を使い回し、一度だけ並べる。道・城の当たりは増やさない。
  const blade = new THREE.BufferGeometry(), blades = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3, x = Math.cos(a) * .24, z = Math.sin(a) * .24;
    blades.push(-x, 0, -z, x, 0, z, x * .6, .75, z * .6);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3)); blade.computeVertexNormals();
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0x687448, roughness: 1, side: THREE.DoubleSide }), shoulders.length * 4);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x77745f, map: stoneTex(), roughness: 1 }), Math.ceil(shoulders.length / 3));
  const dummy = new THREE.Object3D(); let gi = 0, ri = 0;
  for (let i = 0; i < shoulders.length; i++) {
    const p = shoulders[i];
    for (let j = 0; j < 4; j++) {
      const x = p.x + p.nx * p.side * (j % 2) * 1.4 + Math.sin(i * 3 + j) * 1.2;
      const z = p.z + p.nz * p.side * (j % 2) * 1.4 + Math.cos(i * 3 + j) * 1.2;
      dummy.position.set(x, surfaceY(W, x, z), z); dummy.rotation.set(0, i + j, 0);
      dummy.scale.setScalar(.65 + (i % 4) * .13); dummy.updateMatrix(); grass.setMatrixAt(gi++, dummy.matrix);
    }
    if (i % 3 === 0) {
      dummy.position.set(p.x, surfaceY(W, p.x, p.z) + .25, p.z); dummy.rotation.set(.2, i, .1);
      dummy.scale.set(1.1 + i % 5 * .12, .65, .85); dummy.updateMatrix(); rocks.setMatrixAt(ri++, dummy.matrix);
    }
  }
  grass.count = gi; rocks.count = ri; rocks.receiveShadow = true;
  W.viewCull([grass, rocks], 0); rt.scene.add(grass, rocks);

  // 高い峠からも見える遠景。地図の外に二重の山並みを置き、遠い層ほど霞の色へ寄せる。
  for (let layer = 0; layer < 2; layer++) {
    const ridge = [], faces = [], radius = 1650 + layer * 320, count = 96;
    for (let i = 0; i <= count; i++) {
      const a = i / count * Math.PI * 2;
      const top = 320 + layer * 60 + 70 * Math.sin(a * 5 + layer) + 35 * Math.cos(a * 11);
      ridge.push(Math.sin(a) * radius, -80, Math.cos(a) * radius,
        Math.sin(a) * radius, top, Math.cos(a) * radius);
      if (i < count) { const k = i * 2; faces.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ridge, 3)); g.setIndex(faces);
    rt.scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: layer ? 0x87969a : 0x697f7d, side: THREE.DoubleSide, fog: false })));
  }
}

// 越前一向一揆は織田家編でこの城塞群を使う。信長公記巻八と城・野戦の参照表。
// 諸口の進軍は公記。峠口の仕寄り・郭別の人数・細かな攻め順は補い。
// 南無の旗は門徒の目印。各将の家紋は断定しない。
const JIN = [
  rosterPlan('峠口と杉津口の寄せ', 0, { x: KX(0), z: GATE_KANNON.z - 52 }, 0, [
    ['hq', '峠口の後詰', '織田の将（名は不明）', null, KX(6), KZ(-214), 'oda', 'oda', 0, { bind: 'jinHq' }],
    ['akechi', '峠口の仕寄り', '織田の将（名は不明）', 320, KX(0), GATE_KANNON.z - 36, 'akechi', 'akechi', 0, { bind: 'ake' }],
    ['hashiba', '東尾根の別手', '織田の将（名は不明）', 150, 0, GATE_KANNON.z - 156, 'oda', 'oda', 0, { bind: 'east' }],
    ['west', '西尾根の仕寄り', '明智光秀の配下（名は不明）', 150, 0, GATE_KANNON.z - 236, 'akechi', 'akechi', 0, { bind: 'west' }],
    ['reserve', '後備え・陣所', '明智光秀の配下（名は不明）', 120, KX(0), GATE_KANNON.z - 316, 'akechi', 'akechi', 0, { bind: 'reserve' }],
  ], '信長公記巻八、越前一向一揆の要件。全軍三万余とは別に、この峠口の仮の人数'),
  rosterPlan('四城の守り', 1, { x: KX(0), z: KZ(31) }, Math.PI, [
    ['kannon', '観音丸城', '西光寺の衆徒（将の名は不明）', 24, KX(0), KZ(-105), 'namu', 'namu', 0, { bind: 'd.kannon' }],
    ['sou', '木ノ芽峠城の木戸内', '西光寺の衆徒（将の名は不明）', 28, KX(0), KZ(-18), 'namu', 'namu', 0, { bind: 'd.kinomeSou' }],
    ['fuku', '木ノ芽峠城の副郭', '西光寺の衆徒（将の名は不明）', 15, KX(0), KZ(7), 'namu', 'namu', 0, { bind: 'd.kinomeFuku' }],
    ['saikoji', '本陣', '西光寺の衆徒（将の名は不明）', 36, KX(0), KZ(31), 'namu', 'namu', 0, { bind: 'd.kinomeHon' }],
    ['saikojiMae', '西光寺丸城の前郭', '本覚寺・西光寺の衆徒（将の名は不明）', 28, KX(26), KZ(19), 'namu', 'namu', 0, { bind: 'd.saikojiMae' }],
    ['saikojiHon', '西光寺丸城の本郭', '本覚寺・西光寺の衆徒（将の名は不明）', 32, KX(32), KZ(45), 'namu', 'namu', 0, { bind: 'd.saikojiHon' }],
    ['hachibuseMae', '鉢伏城の柵口', '専修寺の衆徒（将の名は不明）', 18, KX(-35), KZ(-7), 'namu', 'namu', 0, { bind: 'd.hachibuseMae' }],
    ['hachibuseHon', '鉢伏城の詰の郭', '阿波賀三郎', 27, KX(-41), KZ(18), 'namu', 'namu', 0, { bind: 'd.hachibuseHon' }],
    ['ambush', '東尾根の伏せ勢', '一揆の将（名は不明）', 20, KX(20), KZ(-18), 'namu', 'namu', 0, { bind: 'd.ambush' }],
  ], '城の参照表と既存の四城の曲輪。郭別の人数・守将は不明、人数は遊び用'),
];
const kinome = {
  jinkei: JIN,
  mapNotes: (rt) => rt.flags.mapNotes,
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noHorse: true,
  noSpearSpin: true, // 山道の隊列では長槍を頭上で一周させない。
  noRevive: true, // 倒れた後に傷と敵の攻撃を消して立たせない。
  lordSpawn: { x: KX(6), z: KZ(-214), heading: 0 },
  lordAt: { x: KX(6), z: KZ(-214), r: 14, why: 'もしも信長が峠口の後詰にいた場合の立ち所' },
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  noWake: true, // 本物への切り替えは部隊管理だけに任せ、遠景から別の隊を重ねて出さない。
  noTaishoRaid: true, // 塀の内外へ無経路で出す野戦の別手は使わず、城の守兵の出撃に任せる。
  spawn: START,
  world: {
    seed: 15901,
    groundHalf: 1100,
    moveLim: 1060,   // 広げた麓の陣と後詰も移動できる範囲に入れる。
    time: 'storm',
    mist: false,
    muddy: 0.25,
    paths: KINOME_ROADS,
    pathWidth: 8, // 広い地形の格子でも、土の道を一筋残す。木戸の幅は変えない。
    slopeForest: 0.75,
    terrainTags: true,
    // 山麓の谷川。流路と里の配置は推定、峠に海や水堀は置かない。
    streams: [{ pts: [[-180, -1040], [-156, -950], [-180, -880]], w: 2.2, depth: .6 }],
    moveWay: runnerWay,
    runnerWay,
    height,
    tint(x, z, h, c) {
      if (nearestRoadDist(x, z) < 8) { c.setRGB(.36, .30, .21); return; }
      if (x > FOREST_X) c.setRGB(c.r * 0.78, c.g * 0.88, c.b * 0.78);
      else if (nearestRoadDist(x, z) > 16) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.82);
    },
    clear: (x, z) => nearestRoadDist(x, z) < 14 || KINOME_PLAN.kuruwa.some(k => inPoly(k.poly, x, z))
      || (x > -210 && x < -80 && z > -1030 && z < -880),
    trees: 1600,
    tufts: 2400,
    treeDensity: (x, z) => { if (nearestRoadDist(x, z) < 14) return 0.08; if (x > FOREST_X) return 1.5; if (x < CLIFF_X + 10) return 0.5; return 0.9; },
    groves: [...ROAD_GROVES, { x: openingAt(35).x + 24, z: openingAt(35).z, r: 6, n: 10 },
      { x: openingAt(35).x - 24, z: openingAt(35).z - 22, r: 6, n: 10 },
      { x: KX(28), z: KZ(-18), r: 16, n: 20 }, { x: KX(34), z: KZ(40), r: 14, n: 18 }, { x: KX(-40), z: KZ(-4), r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z > KZ(70),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    dressPass(rt);
    F.step = 0; F.ek = 0; F.ak = 0;
    // 開戦の目線を、登る道へ向ける。総大将の陣所の目線はそのまま。
    if (!rt.G.lord) rt.player.pitch = .06;
    // 火縄の湿りは、近くで敵の筒を見た者の声にする。味方の不発を敵の知らせにしない。
    rt.army.hooks.onGunMisfire = (u) => {
      const p = rt.player.u;
      if (F.misfireSaid || F.ending || rt.over || !p.alive || !u.alive || u.team === p.team ||
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 30 ||
          rt.army.wallBetween(u.pos, -1, p.pos) || !sightRef(rt, u, u.pos)) return;
      F.misfireSaid = true;
      rt.say('足軽', '敵の筒が鳴らぬ。火縄が湿ったか', 3);
    };
    flReset();

    const C = F.C = buildCastlePlan(rt, KINOME_PLAN, { baseHeight: baseTerrain, edgeW: 3, life: false });
    const kannonC = C.kuruwa.kannon.centroid, souC = C.kuruwa.kinome_sou.centroid, fukuC = C.kuruwa.kinome_fuku.centroid,
      honC = C.kuruwa.kinome_hon.centroid, saiMaeC = C.kuruwa.saikoji_mae.centroid, saiHonC = C.kuruwa.saikoji_hon.centroid,
      hatiMaeC = C.kuruwa.hachibuse_mae.centroid, hatiHonC = C.kuruwa.hachibuse_hon.centroid;
    // 木戸を破ったら郭の中まで進む。広げた郭の守兵は、木戸からの索敵範囲に入らない。
    F.intoKannon = [[GATE_KANNON.x, GATE_KANNON.z], [kannonC.x, kannonC.z]];
    F.intoSou = [[GATE_KINOME.x, GATE_KINOME.z], [souC.x, souC.z]];
    F.intoEast = [[GATE_SAIKOJI.x, GATE_SAIKOJI.z], [saiMaeC.x, saiMaeC.z]];
    F.intoWest = [[GATE_HACHIBUSE.x, GATE_HACHIBUSE.z], [hatiMaeC.x, hatiMaeC.z]];

    // ---- 崖（鉢伏城のさらに西。通れない） ----
    for (const s of wallLine(rt, [[CLIFF_X, KZ(-70)], [CLIFF_X, KZ(50)]], { team: 1, hp: 1e9, name: '崖', segLen: 14 })) { s.noTarget = true; s.wall = true; }

    // ---- 木戸（四城の入口。塀は castle_plan が門の幅だけ開けて四方を閉じる。ここに実の破れる戸を据える） ----
    F.gateKannon = kido(rt, GATE_KANNON.x, GATE_KANNON.z, 3, 0, { team: 1, hp: 100, name: GATE_KANNON.name, gate: 0 });
    F.gateKinome = kido(rt, GATE_KINOME.x, GATE_KINOME.z, 3, 0, { team: 1, hp: 120, name: GATE_KINOME.name, gate: 1 });
    F.gateSaikoji = kido(rt, GATE_SAIKOJI.x, GATE_SAIKOJI.z, 3, 0, { team: 1, hp: 260, name: GATE_SAIKOJI.name, gate: 2 });
    F.gateHachibuse = kido(rt, GATE_HACHIBUSE.x, GATE_HACHIBUSE.z, 3, Math.PI / 2, { team: 1, hp: 240, name: GATE_HACHIBUSE.name, gate: 3 });
    // 奥への口（扉の無い冠木門。castles/kinome.js の EXIT_*）
    for (const [x, z] of [EXIT_KANNON, EXIT_KINOME, EXIT_SAIKOJI, EXIT_HACHIBUSE]) rt.scene.add(kabukimon(W, x, z, 4.6, 0, { doors: false }));
    for (const [x, z, r] of [[GATE_KANNON.x - 8, GATE_KANNON.z - 2, 0.2], [GATE_KINOME.x + 8, GATE_KINOME.z - 2, -0.2], [GATE_HACHIBUSE.x, GATE_HACHIBUSE.z - 4, 0]]) rt.scene.add(sakamogi(W, x, z, r, 5));
    // 倒木と逆茂木：峠道の両脇に切り倒した木と尖った枝（道の外側。速さを落とす荷の遅さを見せる）
    for (const [x, z, r] of [[-10, -78, 0.3], [11, -64, -0.4], [-11, -46, 1.2], [-30, -22, 0.2], [-38, -12, -0.5]]) rt.scene.add(lumber(W, KX(x), KZ(z), r));
    for (const [x, z, r] of [[-9, -84, 0], [10, -70, 0], [-26, -26, 1.2]]) rt.scene.add(sakamogi(W, KX(x), KZ(z), r, 4));

    // ---- 物見櫓（木ノ芽峠城・鉢伏城。鉢伏は詰の城で広く見張る） ----
    // 北へ15m寄せると地形の格子が小郭の切岸を拾い、梯子前が床より高くなる。
    // 中央の平場へ戻し、南北の柵と梯子の足もとを離す。
    F.towerKinome = monomi(rt, fukuC.x - 15, fukuC.z, { name: '木ノ芽峠城の物見櫓' });
    F.towerHachibuse = monomi(rt, hatiHonC.x + 20, hatiHonC.z + 20, { name: '鉢伏城の物見櫓（詰の城）' });

    F.towerKannon = monomi(rt, kannonC.x - 20, kannonC.z + 26, { name: '観音丸城の物見' });
    F.towerSaikoji = monomi(rt, saiHonC.x + 22, saiHonC.z + 18, { name: '西光寺丸城の物見' });

    // 番所・衆徒の詰所・長屋・兵糧蔵。板葺きと配置は当時の越前の陣城として推定。
    // 主道から離して置き、戸口・床・階段・壁の当たりは共通の室内でそろえる。
    const hall = (c, dx, dz, w, d, name, kind = 'nagaya', profile = null) => {
      const x = c.x + dx, z = c.z + dz;
      if (kind === 'kura') {
        // 蔵は板壁の外観だけ。既存の蔵の形と四角い当たりを使い、座敷を入れない。
        const mesh = kura(W, x, z);
        rt.scene.add(mesh);
        const struct = rt.army.addStruct({ x, z, r: 3, solidR: 0, hp: 160, maxHp: 160, team: 1, name, flammable: true });
        struct.mesh = mesh;
        return { mesh, struct };
      }
      return goten(rt, x, z, { w, d, name, kind, profile, tile: false, naka: true, door: -1, doorX: 0, team: 1, hp: 160, oku: .25 });
    };
    hall(kannonC, -15, -22, 7, 5, '観音丸城の番所');
    hall(kannonC, 15, 18, 10, 5, '観音丸城の長屋');
    // 西の小郭の内へ収める。中央側の旧位置は入口へ地面が上がり、戸口の横木に体が当たる。
    hall(souC, -35, -26.5, 7, 5, '木ノ芽峠城の番所');
    hall(fukuC, 15, 0, 12, 5, '木ノ芽峠城の長屋');
    hall(honC, -15, -24, 10, 7, '木ノ芽峠城の詰所', 'goten');
    hall(honC, 15, 26, 6, 5, '木ノ芽峠城の兵糧蔵', 'kura');
    hall(saiHonC, -16, 4, 10, 7, '西光寺丸城の衆徒の堂', 'temple');
    hall(saiMaeC, 22, -12, 12, 5, '西光寺丸城の僧坊');
    hall(hatiHonC, -18, 20, 10, 6, '鉢伏城の詰所', 'goten', 'kinome');
    hall(hatiMaeC, -16, -10, 8, 5, '鉢伏城の兵糧蔵', 'kura');
    for (const c of [souC, saiHonC, hatiHonC]) rt.scene.add(tawara(W, c.x + 12, c.z + 12, 0, 3));

    // 門脇だけの低い留め石に購入した城の部品を使う。総石垣の城にはしない。
    const rim = makeKitBatch();
    for (const [g, rot] of [[GATE_KANNON, 0], [GATE_KINOME, 0], [GATE_SAIKOJI, 0], [GATE_HACHIBUSE, Math.PI / 2]]) {
      const sn = Math.sin(rot), cs = Math.cos(rot);
      for (const side of [-1, 1]) {
        const x = g.x + side * 4 * cs, z = g.z - side * 4 * sn;
        ishigaki(W, [[x - sn * 2, z - cs * 2], [x + sn * 2, z + cs * 2]],
          { topY: W.heightAt(x, z) + .3, minH: .6, maxH: 1.1, out: side, batch: rim });
      }
      // 現存の敷石路を戦国期の全道へ写さず、虎口の短い段だけを推定で補う。
      rt.scene.add(ishidan(W, g.x - sn * 4, g.z - cs * 4, g.x + sn * 3, g.z + cs * 3, 2.8));
    }
    finalizeKitBatch(rt, rim);
    // 地名を確定しない山麓の里。田と茅葺きの家はまとめて描く。
    rt.scene.add(village(W, -130, -970, { n: 4, fields: 6, r: 26, smoke: 0, seed: 15935 }));

    // ======================================================================
    // 城と東尾根の守り（仮の228人。本道の小勢は別）：観音丸24・木ノ芽峠城（木戸内28・副郭15・主郭36）・
    // 西光寺丸城（前郭28・本郭32）・鉢伏城（柵口18・本陣27）・東の尾根の伏兵20
    // ======================================================================
    const D = F.d = {};
    D.kannon = mkB(rt, { name: '観音丸城の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: { x: GATE_KANNON.x, z: GATE_KANNON.z + 16 }, facing: Math.PI });
    D.kinomeSou = mkB(rt, { name: '木ノ芽峠城・木戸内の一揆勢', team: 1, faction: 'ikko', kind: 'ashigaru', mix: MIX, nominal: 28, armor: IKKO.armor, flag: IKKO.flag, at: { x: GATE_KINOME.x, z: GATE_KINOME.z + 16 }, facing: Math.PI });
    D.kinomeFuku = mkB(rt, { name: '木ノ芽峠城・副郭の弓衆', team: 1, faction: 'ikko', kind: 'bow', nominal: 15, armor: IKKO.armor, flag: IKKO.flag, at: fukuC, facing: Math.PI });
    D.kinomeHon = mkB(rt, { name: '西光寺の衆徒（主郭の守り）', team: 1, faction: 'ikko', kind: 'ashigaru', mix: MIX, nominal: 36, armor: IKKO.armor, flag: IKKO.flag, at: honC, facing: Math.PI });
    D.saikojiMae = mkB(rt, { name: '本覚寺・西光寺の衆徒（前郭）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 28, armor: IKKO.armor, flag: IKKO.flag, at: { x: GATE_SAIKOJI.x, z: GATE_SAIKOJI.z + 16 }, facing: Math.PI });
    D.saikojiHon = mkB(rt, { name: '本覚寺・西光寺の衆徒（本郭）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 32, armor: IKKO.armor, flag: IKKO.flag, at: saiHonC, facing: Math.PI });
    D.hachibuseMae = mkB(rt, { name: '鉢伏城・柵口の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 18, armor: IKKO.armor, flag: IKKO.flag, at: { x: GATE_HACHIBUSE.x - 16, z: GATE_HACHIBUSE.z }, facing: Math.PI / 2 });
    D.hachibuseHon = mkB(rt, { name: '専修寺・阿波賀三郎の手（詰の郭）', team: 1, faction: 'ikko', kind: 'ashigaru', mix: MIX, general: '阿波賀三郎', nominal: 27, armor: IKKO.armor, flag: IKKO.flag, at: hatiHonC, facing: Math.PI / 2 });
    D.ambush = mkB(rt, { name: '一揆の伏兵（東の尾根・森）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: KX(20), z: KZ(-18) }, facing: -Math.PI / 2 });
    const chief = D.hachibuseHon.taishoU;
    if (chief) {
      chief.pos.x = hatiHonC.x - 4; chief.pos.z = hatiHonC.z + 4;
      chief.keep = true;
    }
    F.roadGuards = ROAD_GUARD_POINTS.map((at, i) => {
      const b = mkB(rt, { name: '本道の一揆の小勢', team: 1, faction: 'ikko', kind: 'ashigaru',
        nominal: i === 0 ? 2 : 4, real: 0, armor: IKKO.armor, flag: IKKO.flag, at, facing: Math.PI });
      D[`road${i}`] = b;
      b._roadPost = true; b._openingPost = i === 0;
      return b;
    });
    F.defenders = Object.values(D);
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    for (const b of F.defenders) {
      b.order({ id: 'hold', form: b.kind === 'bow' ? 'line' : 'yari' });
      if (b.real) { b.real.noAI = true; b.real.stay = true; b.real.aggro = 10; b.real.seekRange = 45; }
    }

    // ======================================================================
    // 攻め手（明智光秀の手。織田。正面の主力・東西の別働・後備え）
    // ======================================================================
    F.ake = mkB(rt, { name: '織田の先手（峠口）', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, nominal: 320, armor: ODA.armor, flag: 'akechi', at: openingAt(30), facing: START.heading });
    F.east = mkB(rt, { name: '織田の先手（東の別手）', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, nominal: 150, armor: ODA.armor, flag: ODA.flag, at: openingAt(42), facing: START.heading });
    F.west = mkB(rt, { name: '明智配下・西の別働', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, nominal: 150, armor: ODA.armor, flag: 'akechi', at: { x: 0, z: GATE_KANNON.z - 236 }, facing: 0 });
    F.reserve = mkB(rt, { name: '明智配下・後備え', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 120, armor: ODA.armor, flag: 'akechi', at: { x: KX(0), z: GATE_KANNON.z - 316 }, facing: 0 });
    F.attackers = [F.ake, F.east, F.west, F.reserve];
    F.mapNotes = [
      { pos: C.kuruwa.kannon.centroid, id: 'kannon', name: '観音丸城', text: '' },
      { pos: C.kuruwa.kinome_hon.centroid, id: 'kinome_hon', name: '木ノ芽峠城', text: '' },
      { pos: C.kuruwa.saikoji_hon.centroid, id: 'saikoji_hon', name: '西光寺丸城', text: '' },
      { pos: C.kuruwa.hachibuse_hon.centroid, id: 'hachibuse_hon', name: '鉢伏城', text: '' },
      { pos: F.reserve.pos, butai: F.reserve, name: '後備え', text: '後備え：下知を待つ' },
      { pos: F.east.pos, butai: F.east, name: '東の別手', text: '東の別手：木戸が開くまで下知を待つ' },
      { pos: F.west.pos, butai: F.west, name: '西の別手', text: '西の別手：木戸が開くまで下知を待つ' },
    ];
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of F.attackers) b.order({ id: 'hold' });
    // 城へ登る三つの備えは縦列。木戸を通る台本の道は変えない。
    for (const b of F.attackers) b.setForm('column');
    F.waiting = [F.east, F.west, F.reserve];
    // 待つ別手は軽い隊列で見せ、近くの兵の半分を立ち尽くさせない。
    for (const b of F.waiting) b.shrinkReal(Math.max(0, b.realCount() - 2));

    // 海側の戦いは解説で伝える。別の海岸の兵を峠の西へ置かない。
    DA_SUGITSU(rt);

    // ---- 越前だけの制圧。通常は実兵と控えで判定し、詰まった段は後詰が進める ----
    F.SZ = makeKinomeZones(rt, {
      zones: [
        { id: 'kannon', name: '観音丸城', test: C.kuruwa.kannon.test, pos: kannonC, need: 3, hold: 7, gate: GATE_KANNON.name, next: 'kinome_sou' },
        { id: 'kinome_sou', before: 'kannon', name: '木ノ芽峠城・木戸内', test: C.kuruwa.kinome_sou.test, pos: souC, need: 3, hold: 6, gate: GATE_KINOME.name, next: 'kinome_fuku' },
        { id: 'kinome_fuku', before: 'kinome_sou', name: '木ノ芽峠城・副郭', test: C.kuruwa.kinome_fuku.test, pos: fukuC, need: 3, hold: 6, next: 'kinome_hon', max: 60 },
        { id: 'kinome_hon', before: 'kinome_fuku', name: '木ノ芽峠城・主郭', test: C.kuruwa.kinome_hon.test, pos: honC, need: 5, hold: 10, honmaru: true, max: 60 },
        { id: 'saikoji_mae', enabled: () => F.eastGo, gate: GATE_SAIKOJI.name, name: '西光寺丸城・前郭', test: C.kuruwa.saikoji_mae.test, pos: saiMaeC, need: 4, hold: 10, next: 'saikoji_hon' },
        { id: 'saikoji_hon', before: 'saikoji_mae', name: '西光寺丸城・本郭', test: C.kuruwa.saikoji_hon.test, pos: saiHonC, need: 4, hold: 12 },
        { id: 'hachibuse_mae', enabled: () => F.westGo, gate: GATE_HACHIBUSE.name, name: '鉢伏城・柵口', test: C.kuruwa.hachibuse_mae.test, pos: hatiMaeC, need: 3, hold: 10, next: 'hachibuse_hon' },
        { id: 'hachibuse_hon', before: 'hachibuse_mae', name: '鉢伏城・本陣（詰の城）', test: C.kuruwa.hachibuse_hon.test, pos: hatiHonC, need: 4, hold: 12 },
      ],
      defenders: F.defenders,
      attackers: F.attackers,
      retreat: (b) => {
        const post = F.MD?.posts.find((p) => p.butai === b);
        const next = post?.next && F.MD.byId[post.next];
        if (b.real) b.real.stay = false;
        if (next) {
          const points = post.id === 'kannon'
            ? [EXIT_KANNON, ...ROAD_TO_KINOME, [next.at.x, next.at.z]]
            : post.id === 'saikoji_mae' ? [[b.pos.x, b.pos.z], ...EAST_TO_HON]
              : post.id === 'hachibuse_mae' ? [[b.pos.x, b.pos.z], ...WEST_TO_HON]
                : [[b.pos.x, b.pos.z], [next.at.x, next.at.z]];
          setRoute(b, points);
        } else {
          b.noSwitch = true; b._route = null;
          if (b.real) { b.real.morale = 0; b.real.fleeDir = { x: 0, z: 1 }; }
          if (b.light) b.light.rout({ hideAfter: 40 });
        }
        return next ? 'regroup' : 'flee';
      },
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.win(rt),
    });

    // 一揆の頭（siege_ai.js）：崩れた郭は次の郭へ退く。鎖は fallbackTo（castles/kinome.js）と同じ並び
    F.MD = makeMountainDefense(rt, {
      zones: F.SZ,
      posts: [
        { id: 'kannon', butai: D.kannon, at: D.kannon.pos, next: 'kinome_sou' },
        { id: 'kinome_sou', butai: D.kinomeSou, at: D.kinomeSou.pos, next: 'kinome_fuku' },
        { id: 'kinome_fuku', butai: D.kinomeFuku, at: fukuC, next: 'kinome_hon' },
        { id: 'kinome_hon', butai: D.kinomeHon, at: honC },
        { id: 'saikoji_mae', butai: D.saikojiMae, at: D.saikojiMae.pos, next: 'saikoji_hon' },
        { id: 'saikoji_hon', butai: D.saikojiHon, at: saiHonC },
        { id: 'hachibuse_mae', butai: D.hachibuseMae, at: D.hachibuseMae.pos, next: 'hachibuse_hon' },
        { id: 'hachibuse_hon', butai: D.hachibuseHon, at: hatiHonC },
      ],
    });
    // 伏兵（東の尾根・森。siege_ai.js）：西光寺丸城へ寄せた手が近付くか、攻め手の力が集まったら横・後ろから出る
    F.AMB = makeMountainAmbush(rt, {
      zones: F.SZ,
      posts: [{ id: 'higashi', butai: D.ambush, at: D.ambush.pos, cover: '森の中', revealRange: 18, routeZoneId: 'saikoji_mae', concentrateShare: 2, side: 'flank' }],
    });

    // ---- 竹束の寄せ（taketaba.js）：それぞれの手は竹束を押し立て、ゆっくり木戸の前まで寄せて撃ち合う ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, {
      items: [
        { g: F.ake, yose: () => (F.kannonFell ? { x: GATE_KINOME.x, z: GATE_KINOME.z - 3 } : { x: GATE_KANNON.x, z: GATE_KANNON.z - 3 }), until: () => (F.kannonFell ? F.gateKinome.struct.hp <= 0 : F.gateKannon.struct.hp <= 0) },
        { g: F.east, yose: () => ({ x: GATE_SAIKOJI.x - 6, z: GATE_SAIKOJI.z - 8 }), until: () => !F.eastGo || F.gateSaikoji.struct.hp <= 0 },
        { g: F.west, yose: () => ({ x: GATE_HACHIBUSE.x + 8, z: GATE_HACHIBUSE.z }), until: () => !F.westGo || F.gateHachibuse.struct.hp <= 0 },
      ],
      max: 7, speed: 2.4, near: 24, holdMelee: 4, avoid: [this.spawn],
    });
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad(openingAt(32), START.heading, [{ kind: 'spear', n }]);
    // 麓から横に広がらず二列で登る。傷や敵の強さを変えず、組を道の上に収める。
    for (const g of rt.squadGroups) {
      g.formation = 'column'; g.colW = 2;
      for (const u of g.units) {
        const at = g.slotPos(u.slot, g.initial);
        u.pos.x = at.x; u.pos.z = at.z; u.pos.y = W.heightAt(at.x, at.z);
      }
    }

    rt.world.setTime('storm');
    rt.world.setRainTarget(0.8);
    rt.setPhase('brief');
    rt.obj('main', '味方のそばで構え、門外の小勢を受けよ', 'main');
    rt.say('組頭', `${nm(rt)}、峠口を押す下知じゃ。明智殿・羽柴殿は海側。組を離れるな`, 5);
    rt.after(10, () => {
      if (F.ending || rt.over || !rt.player.u.alive) return;
      rt.say('組頭', '敵を向いて構えよ。打ちに備え、味方のそばで受けよ', 5);
    });
    rt.objProgress('main', '先手の寄せを待て');
    rt.marker('ake', () => F.ake.pos, '先手の組頭', { group: F.ake.real });
    rt.after(30, () => this.assault(rt));
  },

  // ① 観音丸城から攻め上る（軍議の作戦で、東西の別働をいつ放つかが変わる）
  assault(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.progressAt = rt.t + 35;
    rt.setPhase('kannon');
    rt.unmark('ake');
    sfx('horagai', 0.85);
    announceAdvance(rt, '組頭');
    rt.obj('main', '本道を登れ。観音丸の木戸を破り、味方と中を押さえよ', 'main');
    runnerProject(ROAD, rt.player.u.pos, RUNNER_FROM, rt.army, rt.player.u);
    F.roadI = Number.isFinite(RUNNER_FROM.d) ? Math.min(IX(-120), Math.floor(RUNNER_FROM.s) + 1) : 1;
    F.roadPoint = { x: ROAD[F.roadI][0], z: ROAD[F.roadI][1] };
    rt.marker('road', () => F.roadPoint, '本道・次の曲がり角', { h: 3 });
    F.ake.assault = gateOf(F.gateKannon);
    setRoute(F.ake, ROAD_TO_KANNON);
    F.reserve.assault = gateOf(F.gateKannon);
    setRoute(F.reserve, ROAD_TO_KANNON);
    F.strategy = F.strategy || 'kinome_first';
    rt.marker('kannon', () => F.d.kannon.pos, '観音丸城の守り', { red: true });
  },

  // 東西の別働は、観音丸城の木戸が開いてから（道が一本しかないので、必ずここを通ってから分かれる）
  // 別働の居場所は陣形図で見る。本道の任務に別の攻め口の印を重ねない。
  releaseEast(rt) { const F = rt.flags; if (F.eastGo) return; F.eastGo = true; F.east.assault = gateOf(F.gateSaikoji); setRoute(F.east, BRANCH_EAST_GO); },
  releaseWest(rt) { const F = rt.flags; if (F.westGo) return; F.westGo = true; F.west.assault = gateOf(F.gateHachibuse); setRoute(F.west, BRANCH_WEST_GO); },

  // 郭の守りが退き、味方が押さえた時
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.progressAt = rt.t + 35;
    if (id === 'kannon' && !F.kannonFell) {
      rt.setPhase('kinome');
      F.kannonFell = true; F.roadI = Math.max(F.roadI, IX(-96));
      rt.unmark('kannon');
      rt.banner('観音丸城を落とした', '次は本道の木ノ芽峠城。東西の城は別手に任せる');
      rt.obj('main', '本道を進め。木戸内、奥の曲輪、主郭の順に押さえよ', 'main');
      F.ake.assault = gateOf(F.gateKinome);
      const taba = F.TA?.items.find((it) => it.g === F.ake);
      if (taba) { taba.st = 'ready'; for (const tb of taba.tabas) { tb.van = taba; tb.fixed = true; } }
      setRoute(F.ake, ROAD_TO_KINOME);
      rt.marker('kinome', () => F.d.kinomeSou.pos, '木ノ芽峠城の守り', { red: true });
      if (F.strategy === 'saikoji_first') this.releaseEast(rt);
      else if (F.strategy === 'hachibuse_first') this.releaseWest(rt);
      // 軍議で選んだ先手に、後備えを足す（kinome_first は本隊＝明智の手の後詰のまま）
      if (F.strategy === 'saikoji_first') { rt.say('別手の組頭', '手前は先に東の尾根より、西光寺丸城を衝き申す', 3.5); F.reserve.assault = gateOf(F.gateSaikoji); setRoute(F.reserve, BRANCH_EAST_GO); }
      else if (F.strategy === 'hachibuse_first') { rt.say('組頭', '先に鉢伏城の高みを押さえよ。西へ回れ', 3.5); F.reserve.assault = gateOf(F.gateHachibuse); setRoute(F.reserve, BRANCH_WEST_GO); }
      else { F.reserve.assault = gateOf(F.gateKinome); setRoute(F.reserve, ROAD_TO_KINOME); }
    } else if (id === 'kinome_sou' && !F.souFell) {
      rt.setPhase('fuku');
      F.souFell = true; F.roadI = Math.max(F.roadI, IX(-10));
      rt.unmark('kinome');
      rt.banner('木戸内を破った', '木ノ芽峠城の奥へ攻め入る');
      F.ake.assault = null;
      rt.obj('main', '本道を登り、奥の曲輪の弓衆を味方と崩せ', 'main');
      setRoute(F.ake, ROAD_TO_FUKU);
      if (F.strategy === 'kinome_first') { F.reserve.assault = null; setRoute(F.reserve, ROAD_TO_FUKU); }
    } else if (id === 'kinome_fuku') {
      rt.setPhase('hon');
      rt.obj('main', '奥の本陣へ。味方と主郭に入り、残る守りを崩せ', 'main');
      setRoute(F.ake, ROAD_TO_HON);
      if (F.strategy === 'kinome_first') setRoute(F.reserve, ROAD_TO_HON);
    } else if (id === 'saikoji_mae' && !F.saiMaeFell) {
      F.saiMaeFell = true;
      rt.award((t) => t.side.push('西光寺丸の前郭を押さえ、東の攻め口を開いた'), '東の別手の攻め口を開いた');
      F.east.assault = null; if (F.strategy === 'saikoji_first') F.reserve.assault = null;
      setRoute(F.east, EAST_TO_HON);
      if (F.strategy === 'saikoji_first') setRoute(F.reserve, EAST_TO_HON);
      rt.banner('西光寺丸城・前郭を破った', '本郭へ攻め寄せる');
    } else if (id === 'hachibuse_mae' && !F.hatiMaeFell) {
      F.hatiMaeFell = true;
      rt.award((t) => t.side.push('鉢伏の柵口を押さえ、西の高みへ道を開いた'), '西の別手の攻め口を開いた');
      F.west.assault = null; if (F.strategy === 'hachibuse_first') F.reserve.assault = null;
      setRoute(F.west, WEST_TO_HON);
      if (F.strategy === 'hachibuse_first') setRoute(F.reserve, WEST_TO_HON);
      rt.banner('鉢伏城の柵口を破った', '詰の城の本陣へ攻め上る');
    }
  },

  win(rt) {
    const F = rt.flags;
    const hon = F.SZ.byId.kinome_hon;
    if (F.ending || rt.over || !rt.player.u.alive || hon.owner !== ZONE_STATE.FRIEND ||
        hon.enemies > 0 || !F.C.kuruwa.kinome_hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (const id of ['road', 'kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
    rt.objDone('main');
    rt.tracker.main = true;
    for (const id of ['saikoji_hon', 'hachibuse_hon']) if (F.SZ.byId[id].owner === ZONE_STATE.FRIEND) rt.award((t) => t.side.push(id === 'saikoji_hon' ? '西光寺丸を確保し、東の側面を固めた' : '鉢伏城を確保し、西の高みを固めた'), '別手が側面を固めた');
    rt.award((t) => { t.main = true; t.special = { label: '木ノ芽峠城の主郭を確保した', pts: 24 }; }, '任務達成・木ノ芽峠城の主郭を確保した');
    sfx('kane', 0.5);
    rt.banner('木ノ芽峠城、落城', '主郭を押さえた。組を集め、府中への道に備えよ');
    rt.say('組頭', `${nm(rt)}、主郭を押さえたぞ。組を集めよ。次は府中・大滝寺へ進む`, 4.5);
    rt.finish({}, 10);
  },

  // この組が崩れた場合の退去。史実の越前侵攻全体の敗北とはしない。
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (const id of ['road', 'kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('本道の寄せをやめる', active(F.east) || active(F.west) ? '東西の別手は残るが、本道の先手と後備えが崩れた。本道から退け' : '先手も後備えも別手も崩れた。組を集め、本道から退け');
    rt.say('組頭', 'これ以上は支えられぬ。組を集め、来た道を退け！', 4.5);
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i]; if (m.group && (!m.group.count || m.group.routed)) rt.unmark(m.id);
    }
    for (const b of rt.butai || []) {
      // 共通の部隊集計は全滅した組を数えない。最後の損害もこの戦では残す。
      if (b.real && !b.real.count && b._prevRealAlive > 0) {
        b.lost = Math.min(b.nominal, b.lost + b._prevRealAlive);
        b._prevRealAlive = 0;
      }
      if (b.real?.routed || b.real?.order === 'flee') {
        b.noSwitch = true; b._route = null;
        if (b.light && !b.light.army.rout) b.light.rout({ hideAfter: 40 });
      }
    }
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) {
      pressureTick(rt, F.kannonFell ? F.souFell ? 3 : 2 : 1, F.defenders.map((b) => b.real), F.attackers.map((b) => b.real), '本道の印へ。木戸の打ち手を守り、曲輪の中を押さえよ');
      // 下知は木戸と郭の変化で伝える。共通の三十秒ごとの同じ声を重ねない。
      F.pressureSayAt = Infinity;
    }
    // 深手の声は共通の知らせへ任せ、この戦から同じ警告を重ねない。
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    if (F.SZ) F.SZ.tick(dt);
    if (F.step >= 1 && F.SZ.byId.kinome_hon.owner === ZONE_STATE.FRIEND && F.SZ.byId.kinome_hon.enemies === 0) this.win(rt);
    if (F.ending) return;
    if (F.MD) F.MD.tick(dt);
    if (F.AMB && active(F.d.ambush)) {
      F.AMB.tick(dt);
      if (F.AMB.posts[0].revealed && F.d.ambush.real) F.d.ambush.real.stay = false;
    }
    // 最初の三十秒は門外の二人だけ。奥の小勢は木戸を抜けた寄せ手に応じる。
    for (const b of F.roadGuards) {
      if (!active(b)) continue;
      if ((b._openingPost ? rt.t >= 12 : F.step >= 1 && !F.gateKannon.struct.alive) && !b._roadEngaged && (Math.hypot(b.pos.x - rt.player.u.pos.x, b.pos.z - rt.player.u.pos.z) < 45 ||
          Math.hypot(b.pos.x - F.ake.pos.x, b.pos.z - F.ake.pos.z) < 35)) {
        b._roadEngaged = true;
        // 実兵は下の人数枠から出し、上限を越えて足さない。
        b.order({ id: 'attack' });
      }
      if (b.real) { b.real.noAI = true; b.real.stay = !b._roadEngaged; b.real.seekRange = 45; }
    }
    // 主攻の後備えが分岐を抜けてから、副攻を同じ一本道へ入れる。
    if (F.kannonFell && !F.sideReleased && (!active(F.reserve) || F.reserve.pos.z >= KZ(-60) || rt.t - F.SZ.byId.kinome_sou.startedAt >= 30)) {
      F.sideReleased = true; this.releaseEast(rt); this.releaseWest(rt);
    }
    if (rt.t >= (F.budgetAt || 0)) {
      F.budgetAt = rt.t + 1.2;
      const p = rt.player.u.pos;
      for (const b of rt.butai || []) {
        const waiting = b.team === 0 && F.waiting.includes(b) && b.cmd.id === 'hold';
        b._nearBudget = !waiting && (!b._roadPost || b._roadEngaged) && (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 90 ||
          !!b.real?.units.some((u) => u.alive && !u.fleeing && u.target && !u.target.isStruct));
        if (waiting && b.realCount() > 2) b.shrinkReal(b.realCount() - 2);
        if (!b._nearBudget && active(b) && b.realCount() > 6) b.shrinkReal(Math.min(6, b.realCount() - 6));
      }
      let total = 0;
      for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) total++;
      for (const b of rt.butai || []) if (b._nearBudget && active(b) && total < 245 &&
          (rt.t >= 30 || b.team === 0 || b._openingPost)) {
        total += b.growReal(Math.min(4, (b._roadPost ? 4 : 36) - b.realCount(), 245 - total));
      }
    }
    if (F.step >= 1) tickRoutes(F.attackers);
    if (F.step >= 1) tickRoutes(F.defenders);
    if (F.step >= 1 && Math.hypot(rt.player.u.pos.x - F.roadPoint.x, rt.player.u.pos.z - F.roadPoint.z) < 24 &&
        (!active(F.ake) || !F.gateKannon.struct.alive && F.ake.aliveNominal() <= F.ake.nominal * 0.4) && active(F.reserve) && F.reserve.cmd.id === 'hold') {
      F.reserve.assault = gateOf(!F.kannonFell ? F.gateKannon : F.gateKinome);
      setRoute(F.reserve, !F.kannonFell ? ROAD_TO_KANNON : !F.souFell ? ROAD_TO_KINOME
        : F.SZ.byId.kinome_fuku.owner !== ZONE_STATE.FRIEND ? ROAD_TO_FUKU : ROAD_TO_HON);
    }
    if (F.step >= 1 && !F.kannonFell && !F.kannonEntered && !F.gateKannon.struct.alive) {
      F.kannonEntered = true; F.entryHint = 'kannon'; F.ake.assault = null;
      // 目の前で破れた木戸は使番を待たず、古い下知を取り消して札を替える。
      rt.obj('main', '木戸が開いた。味方と入り、観音丸の守りを崩せ', 'main', true);
      rt.say('組頭', '木戸が開いたぞ。槍をそろえ、中へ続け！', 3);
      setRoute(F.ake, F.intoKannon);
    }
    if (!F.kannonFell && !F.gateKannon.struct.alive && active(F.reserve)
        && F.reserve.cmd.id !== 'hold' && !F.reserveKannon
        && Math.hypot(F.reserve.pos.x - GATE_KANNON.x, F.reserve.pos.z - GATE_KANNON.z) < 12) {
      F.reserveKannon = true; F.reserve.assault = null; setRoute(F.reserve, F.intoKannon);
    }
    if (F.kannonFell && !F.souFell && !F.souEntered && !F.gateKinome.struct.alive) {
      F.souEntered = true; F.entryHint = 'sou'; F.ake.assault = null;
      rt.obj('main', '木戸を通れ。味方と木戸内の守りを崩せ', 'main', true);
      rt.say('組頭', '次の木戸も開いた。味方と中を押さえよ', 3);
      setRoute(F.ake, F.intoSou);
      if (F.strategy === 'kinome_first') { F.reserveSou = true; F.reserve.assault = null; setRoute(F.reserve, F.intoSou); }
    }
    if (F.kannonFell && !F.souFell && !F.gateKinome.struct.alive && active(F.reserve)
        && F.reserve.cmd.id !== 'hold' && !F.reserveSou
        && Math.hypot(F.reserve.pos.x - GATE_KINOME.x, F.reserve.pos.z - GATE_KINOME.z) < 12) {
      F.reserveSou = true; F.reserve.assault = null; setRoute(F.reserve, F.intoSou);
    }
    // 別手も木戸を打ってから前郭へ入る。前郭の確保までは本郭へ通り過ぎない。
    if (F.eastGo && !F.saiEntered && !F.gateSaikoji.struct.alive) {
      F.saiEntered = true; F.east.assault = null; setRoute(F.east, F.intoEast);
      if (F.strategy === 'saikoji_first') { F.reserve.assault = null; setRoute(F.reserve, F.intoEast); }
    }
    if (F.westGo && !F.hatiEntered && !F.gateHachibuse.struct.alive) {
      F.hatiEntered = true; F.west.assault = null; setRoute(F.west, F.intoWest);
      if (F.strategy === 'hachibuse_first') { F.reserve.assault = null; setRoute(F.reserve, F.intoWest); }
    }
    // 放つ前の東西の別働・後備えは、ai.js の「70m内に敵が来たら持ち場から出て戦う」に引っかかって
    // 動かせなくなる（号令：attack のまま動かない）ので、下知がまだ hold の間は g.stay で止めておく
    for (const b of F.waiting) if (b.real) b.real.stay = b.cmd.id === 'hold';

    if (F.step >= 1) {
      const p = rt.player.u.pos;
      const zoneId = !F.kannonFell ? 'kannon' : !F.souFell ? 'kinome_sou' : F.SZ.byId.kinome_fuku.owner !== 'friend' ? 'kinome_fuku' : 'kinome_hon';
      const state = F.SZ.byId[zoneId];
      if (rt.t >= (F.statusAt || 0)) {
        F.statusAt = rt.t + 0.5;
        // 曲がり角の印と人数札は半秒ごと。歩く兵の処理は毎コマ続ける。
        const roadEnd = !F.kannonFell ? IX(F.gateKannon.struct.alive ? -120 : -96)
          : !F.souFell ? IX(F.gateKinome.struct.alive ? -30 : -10)
            : F.SZ.byId.kinome_fuku.owner !== ZONE_STATE.FRIEND ? IX(8) : ROAD.length - 1;
        // 今いる道の区間へ投影し、曲がり角を外側から越えた時も先の印へ送る。
        runnerProject(ROAD, p, RUNNER_FROM);
        // 退いたら、以前の前線の印ではなく、今いる折れ目から戻す。
        if (Number.isFinite(RUNNER_FROM.d)) F.roadI = Math.min(roadEnd, Math.floor(RUNNER_FROM.s) + 1);
        while (F.roadI < roadEnd && (Math.hypot(p.x - ROAD[F.roadI][0], p.z - ROAD[F.roadI][1]) < 10 ||
          RUNNER_FROM.d < 14 && RUNNER_FROM.s >= F.roadI)) F.roadI++;
        F.roadPoint.x = ROAD[F.roadI][0]; F.roadPoint.z = ROAD[F.roadI][1];
        for (const note of F.mapNotes) {
          if (note.id) {
            const z = F.SZ.byId[note.id];
            note.text = `${note.name}：${!sightRef(rt, z, z.pos) ? '今の守りは未確認' : z.enemies > 0 ? `敵の守り${z.enemies}人` : z.owner === ZONE_STATE.FRIEND ? '味方が確保' : '確保前'}`;
          } else {
            const b = note.butai;
            const route = b._route, dst = route?.[route.length - 1];
            const target = dst ? Math.hypot(dst[0] - BRANCH_EAST_GO[BRANCH_EAST_GO.length - 1][0], dst[1] - BRANCH_EAST_GO[BRANCH_EAST_GO.length - 1][1]) < 10 ? '東の城へ' : Math.hypot(dst[0] - BRANCH_WEST_GO[BRANCH_WEST_GO.length - 1][0], dst[1] - BRANCH_WEST_GO[BRANCH_WEST_GO.length - 1][1]) < 10 ? '西の城へ' : !F.kannonFell ? '観音丸へ' : '本道の奥へ' : '今の持ち場を守る';
            note.text = `${note.name}：${!active(b) ? '列が崩れた' : b.cmd.id === 'hold' ? !F.kannonFell ? '木戸が開くまで下知を待つ' : '先の組が分かれ道を抜けるまで下知を待つ' : target}`;
          }
        }
        const gate = !F.kannonFell ? F.gateKannon : !F.souFell ? F.gateKinome : null;
        let gateStatus = '本道を進み、竹束の陰から木戸を破れ';
        const roadSegment = Math.min(ROAD.length - 2, Math.floor(RUNNER_FROM.s));
        const roadAt = ROAD_METERS[roadSegment] + (ROAD_METERS[roadSegment + 1] - ROAD_METERS[roadSegment]) * (RUNNER_FROM.s - roadSegment);
        const remaining = Math.ceil(Math.max(0, ROAD_METERS[roadEnd] - roadAt) + RUNNER_FROM.d);
        const bendDistance = Math.ceil(Math.hypot(p.x - F.roadPoint.x, p.z - F.roadPoint.z));
        if (gate?.struct.alive && sightRef(rt, gate.struct, { x: (gate.struct.seg[0] + gate.struct.seg[2]) / 2, z: (gate.struct.seg[1] + gate.struct.seg[3]) / 2 })) {
          let hitters = 0;
          for (const b of F.attackers) for (const u of b.real?.units || []) if (u.alive && !u.fleeing && !u.woundOut && (u.target === gate.struct || u.atk?.target === gate.struct)) hitters++;
          gateStatus = `木戸の強さ ${Math.ceil(100 * gate.struct.hp / gate.struct.maxHp)}％。${hitters ? `打ち手${hitters}人を守れ` : '打ち手を門前へ集めよ'}`;
        }
        if (!F.kannonFell && F.waiting.some((b) => active(b) && b.cmd.id === 'hold')) gateStatus += '。別手は木戸が開くまで下知を待つ';
        rt.objProgress('main', rt.player.u.hp < rt.player.u.maxHp * 0.5 && !rt.army.nearestEnemy(rt.player.u, 25, (o) => !o.fleeing && !o.noTarget && !o.isStruct)
          ? `${rt.player.bandaged ? '血は止まった' : '味方の後ろで止まり、血を止めよ'}。本道の印から、先手と${!F.kannonFell ? '観音丸の木戸' : !F.souFell ? '次の木戸' : '奥の曲輪'}へ`
          : state.honmaru && state.owner === ZONE_STATE.FRIEND
          ? '味方が主郭を押さえた。本道の印をたどり、中へ入れ'
          : gate?.struct.alive ? remaining > 30 ? `${!F.kannonFell ? '観音丸' : '木ノ芽峠城'}の木戸まで あと${remaining}メートル。次の道の印まで${bendDistance}メートル` : gateStatus
          : !sightRef(rt, state, state.pos) ? '組とともに、木戸を通って郭の中へ'
          : state.enemies > 0 ? `${state.name}に敵が残る。味方と押し返せ`
          : state.friends < state.need ? `${state.name}へ味方を集めよ（${state.friends}／${state.need}人）`
          : `${state.name}を守る あと${Math.max(0, Math.ceil(state.hold - state.holdT))}秒`);
      }
      if (rt.t >= F.progressAt) {
        F.progressAt = rt.t + 35;
        const gate = !F.kannonFell ? F.gateKannon : !F.souFell ? F.gateKinome : null;
        const zone = F.C.kuruwa[!F.kannonFell ? 'kannon' : !F.souFell ? 'kinome_sou' : 'kinome_hon'];
        if (gate && gate.struct.alive) {
          const hint = F.kannonFell ? 'kinome' : 'kannon';
          if (F.gateHint !== hint && Math.hypot(rt.player.u.pos.x - (gate.struct.seg[0] + gate.struct.seg[2]) / 2, rt.player.u.pos.z - (gate.struct.seg[1] + gate.struct.seg[3]) / 2) < 30) { F.gateHint = hint; rt.say('組頭', '木戸を打つ者を守れ。矢玉は構えで防げぬ。竹束の陰へ！', 4); }
        } else {
          const hint = !F.kannonFell ? 'kannon' : !F.souFell ? 'sou' : 'hon';
          if (F.entryHint !== hint && sightRef(rt, zone, zone.centroid)) { F.entryHint = hint; rt.say('組頭', '組を離れるな。木戸を通り、槍をそろえて中へ続け！', 4); }
        }
      }
    }
    if (F.step >= 1 && !F.lineWarned && (!active(F.ake) || F.ake.aliveNominal() < F.ake.nominal * 0.4)) {
      F.lineWarned = true;
      rt.say('組頭', '先手が危うい！　組を後備えのそばへ戻せ。両方崩れれば攻めは続けられぬ', 4);
    }
    // 時計では負けない。先手と後備えが実際に崩れたら退く。
    if (F.step >= 1 && !active(F.ake) && !active(F.reserve)) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || !sightRef(rt, g, g.anchor) || rt.t - (F.routSaidT ?? -99) < 8) return;
    // 同じ隊が立て直してはまた崩れる。名は一度だけ言う（見回り 10/2：同じ台詞が十数回）
    F.routSaid = F.routSaid || {}; if (F.routSaid[g.name]) return; F.routSaid[g.name] = 1;
    F.routSaidT = rt.t;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が崩れた`, 2.5);
  },
};

// この地図にいる峠口の後詰だけを描く。海側の別手は解説に残す。
function DA_SUGITSU(rt) {
  const W = rt.world;
  // 峠口の後詰。信長の敦賀本陣をこの近距離に置いたものではない。
  rt.flags.jinHq = W.addDistantArmy({ team: 0, flag: 'oda', mon: 'oda', x: KX(6), z: KZ(-214), w: 22, d: 26, count: 260, facing: 0, armor: 0x2b3140, flagTex: flagTexture('oda'), seed: 15922, host: false });
  // 遠景の中心を借りる。描画の入れ物の原点と取り違えず、兵は増やさない。
  for (const key of ['jinHq']) {
    const light = rt.flags[key], a = light.army, pos = { x: a.cx, z: a.cz };
    rt.flags[key] = {
      light,
      get pos() { pos.x = a.cx + a.off.x; pos.z = a.cz + a.off.z; return pos; },
      get routedL() { return !!a.rout; },
    };
  }

}

kinome.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + (active(b) ? b.aliveNominal() : 0), 0);
  const b = (F.defenders || []).reduce((s, b) => s + (active(b) ? b.aliveNominal() : 0), 0);
  return { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 };
};
kinome.sides = { a: { name: '織田の先手（峠口）', mon: 'oda' }, b: { name: '越前一向一揆・木ノ芽峠の城塞群', mon: 'namu' } };
kinome.famous = []; // 未確認の杉浦玄任を峠の将にしない。阿波賀三郎は鉢伏の手に置く。
kinome.date = () => '天正三年八月十五日頃　秋・風雨　もしも';
kinome.history = '信長公記巻八では八月十五日の風雨の中で諸口から進み、明智光秀・羽柴秀吉は海側の円強寺・若林の城を破った。その夜、府中龍門寺への侵入と放火を受け、木ノ芽峠・鉢伏などの守兵は府中へ退いた。信長は敦賀におり、翌十六日に一万余を率いて峠を越えた。木ノ芽峠の守りは石田の西光寺、鉢伏は専修寺・阿波賀兄弟と記す。県史の別史料による木ノ芽峠の下間筑後軍という記述とは区別する。この戦は、峠口の先手が正面から仕寄りを進めたら、という補いである。名の分からない組頭の下知に従い、主郭の確保を目指す。総大将で遊ぶ場合の信長の峠口への出陣も仮定。兵数はこの持ち場の仮の数で、全軍三万余ではない。観音丸を峠道の西へ寄せ、木ノ芽峠城の三つの守り場に十三の平場を補った。小郭の区画割り、土塁・柵・木戸・物見の高さ、番所・堂・僧坊・蔵の配置と板葺き、門脇の留め石と段、麓の里と谷川は推定。四城の距離と登りを縮めており、実測の縄張りを完全に写したものではない。道・郭・会話・雨量・攻め順は復元。峠の守りが退いた後も掃討が続き、多くの人が殺されたという史実を、この局地の勝ちで終わったことにはしない。';
kinome.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// 軍議（gungi.js）：四つの城のどれから崩すかの三択（既定＝観音丸城を落としてから東西へ別働を放つ）
kinome.gungi = (rt) => {
  const F = rt.flags;
  if (!rt.G.lord) return null;
  const G = {
    center: { x: KX(0), z: KZ(-140) }, dist: 110,
    units: [{ id: 'plan', name: '織田の先手（峠口）', group: () => F.ake && F.ake.real, nominal: () => (F.ake ? F.ake.aliveNominal() : 0) }],
    routes: [
      { id: 'kinome_first', name: '観音丸城を落とした後、後備えで木ノ芽峠城を押す' },
      { id: 'saikoji_first', name: '観音丸城を落とした後、後備えで東の尾根（西光寺丸城）を衝く' },
      { id: 'hachibuse_first', name: '観音丸城を落とした後、後備えで西（鉢伏城）の高みを押さえる' },
    ],
    default: { plan: 'kinome_first' },
    enemy: [
      { name: '観音丸城・木ノ芽峠城', known: false },
      { name: '西光寺丸城・鉢伏城', known: false },
      { name: '東の尾根・森が深い', known: false },
    ],
    onStart: (assign) => kinome.onGungiStart(rt, assign),
  };
  const auto = window.__kinomeStrategy || (/[?&]bot/.test(location.search) ? 'kinome_first' : null);
  if (auto) { kinome.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
kinome.onGungiStart = (rt, assign) => { rt.flags.strategy = (assign && assign.plan) || 'kinome_first'; };

// 素直な遊び手：敵へ向かって戦い、無ければ明智の手の中ほどへ
// 安全な味方の後ろへ退く。半秒ごとの探索で、道と入れ物を使い回す。
kinome.botTreatmentPoint = (b) => {
  const u = b.player.u, F = b.flags;
  const back = F.treatmentBack || (F.treatmentBack = { x: 0, z: 0, at: -1, found: false });
  if (back.at > b.t) return back.found ? back : null;
  back.at = b.t + 0.5;
  // 供が後から付いて来ても、止まる場所を引きずって退き続けない。
  if (back.found && back.mate?.alive && !back.mate.fleeing && !back.mate.woundOut &&
      Math.hypot(back.mate.pos.x - back.x, back.mate.pos.z - back.z) < 5) {
    let safe = true;
    for (const o of b.army.units) {
      if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.civ || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
      if (Math.hypot(o.pos.x - back.x, o.pos.z - back.z) < 14) { safe = false; break; }
    }
    if (safe) return back;
  }
  back.found = false;
  let best = Infinity;
  for (const mate of b.army.units) {
    if (mate === u || !mate.alive || mate.team !== u.team || mate.fleeing || mate.noTarget || mate.civ ||
        mate.isStruct || mate.farSim || mate.woundOut || mate.rearWound || mate.group?.routed ||
        mate.stagger > 0 || mate.hp < mate.maxHp * 0.35 || mate.type === 'porter' || mate.type === 'dummy' ||
        Math.hypot(mate.pos.x - u.pos.x, mate.pos.z - u.pos.z) > 24) continue;
    let foe = null, nearest = Infinity;
    for (const o of b.army.units) {
      if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.civ || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
      const d = (o.pos.x - mate.pos.x) ** 2 + (o.pos.z - mate.pos.z) ** 2;
      if (d < nearest) { nearest = d; foe = o; }
    }
    const dx = foe ? mate.pos.x - foe.pos.x : -Math.sin(mate.heading);
    const dz = foe ? mate.pos.z - foe.pos.z : -Math.cos(mate.heading);
    const len = Math.hypot(dx, dz) || 1;
    RUNNER_TEST.x = mate.pos.x + dx / len * 3;
    RUNNER_TEST.z = mate.pos.z + dz / len * 3;
    let safe = true;
    for (const o of b.army.units) {
      if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.civ || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
      if (Math.hypot(o.pos.x - RUNNER_TEST.x, o.pos.z - RUNNER_TEST.z) < 14) { safe = false; break; }
    }
    const d = Math.hypot(u.pos.x - RUNNER_TEST.x, u.pos.z - RUNNER_TEST.z);
    if (!safe || d >= best || !runnerClear(b.army, u, mate.pos, RUNNER_TEST)) continue;
    best = d; back.x = RUNNER_TEST.x; back.z = RUNNER_TEST.z; back.mate = mate; back.found = true;
  }
  return back.found ? back : null;
};

kinome.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (b.botTreatNext === Infinity && b.army.nearestEnemy(u, 25, (o) => !o.fleeing && !o.noTarget && !o.isStruct)) b.botTreatNext = 0;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.k.delete('KeyS');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups.some((g) => g.order !== 'follow')) {
    inp.quickCmd = 'follow'; b.botCmdT = b.t + 2;
  }
  // 別の高さや塀越しの敵には寄らず、打ち込んでくる相手を先に受ける。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    // 脅威の表は前の更新のもの。受け流して崩した相手まで受け続けない。
    const attacking = (o.atk && o.atk.target === u && !o.atk.bow) ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const over = (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (!attacking || !o.alive || o.fleeing || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 ||
        (over ? b.army.wallBetween(o.pos, -1, u.pos, true) : b.army.wallBetween(u.pos, -1, o.pos))) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  // 構えを解く間も同じ相手を保つ。毎回近い兵へ替えると、突く前に構え直してしまう。
  const gate = !F.kannonFell ? F.gateKannon : !F.souFell ? F.gateKinome : null;
  // 木戸の前では、こちらを打つ相手だけ受ける。柵越しの兵を追い続けて木戸を放置しない。
  const atGate = gate?.struct.alive && Math.hypot(u.pos.x - (gate.struct.seg[0] + gate.struct.seg[2]) / 2,
    u.pos.z - (gate.struct.seg[1] + gate.struct.seg[3]) / 2) < 12;
  const e = attacker || (atGate ? null : strikeTarget(b, 10));
  // 深手の退避と手当ては playbot の共通処理に任せる。自然回復はないので、体力の回復を待ち続けない。
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 柵越しに届く相手はその場で突く。通れない柵へ歩み続けない。
    if (d > reach * 0.85 && !e.charging && !b.army.wallBetween(u.pos, -1, e.pos, false)) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 振りかぶり中は受け、打ち終わりと受け流しの後は反撃する。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 道や木戸へ向く時は、遠い兵への狙いで更新中の向きを引き戻されないようにする。
  if (p.lock) inp.e.add('KeyQ');
  if (!F.step) return;
  if (gate && gate.struct.alive && !gate.opened) {
    const g = gate.struct, x = (g.seg[0] + g.seg[2]) / 2 - g.nx * 1.2, z = (g.seg[1] + g.seg[3]) / 2 - g.nz * 1.2;
    RUNNER_TEST.x = x; RUNNER_TEST.z = z;
    if (Math.hypot(u.pos.x - x, u.pos.z - z) < 12 && runnerClear(b.army, u, u.pos, RUNNER_TEST)) {
      // 戸から最大でも約1.5mまで寄る。以前は2m手前の点からさらに1.6m離れて止まり、槍が届かなかった。
      goTo(p, inp, x, z, 0.25);
      if (Math.hypot(u.pos.x - (x + g.nx * 1.2), u.pos.z - (z + g.nz * 1.2)) < 2) {
        // 槍が届いたら足を止めて打つ。閉じた木戸へ歩き続けない。
        inp.k.delete('KeyW'); p.yaw = Math.atan2(g.nx, g.nz);
        inp.leftPressed = !p.guard && p.time - (p.guardOffT ?? -9) > 0.45 && p.cd <= 0 && !p.pending;
      }
      return;
    }
  }
  if (gate && !gate.struct.alive) {
    const zone = F.C.kuruwa[!F.kannonFell ? 'kannon' : 'kinome_sou'];
    if (zone.test(u.pos.x, u.pos.z)) {
      const defender = b.army.nearestEnemy(u, 180, (o) => !o.noTarget && !o.fleeing && !o.invuln &&
        Math.abs(o.pos.y - u.pos.y) < 3 && zone.test(o.pos.x, o.pos.z) && !b.army.wallBetween(u.pos, -1, o.pos, false));
      if (defender) {
        const reach = p.weapon === 'sword' ? 1.9 : 2.8;
        goTo(p, inp, defender.pos.x, defender.pos.z, reach * 0.85);
        patientStrike(p, inp, defender, Math.hypot(u.pos.x - defender.pos.x, u.pos.z - defender.pos.z));
        return;
      }
    } else {
      // 遠くで味方が木戸を破っても、九十九折りを飛ばして口へ直進しない。
      // 道から口まで歩ける所に来てから郭へ入る。塀と法面の当たりは残す。
      const g = gate.struct;
      RUNNER_TEST.x = (g.seg[0] + g.seg[2]) / 2 + g.nx * 2;
      RUNNER_TEST.z = (g.seg[1] + g.seg[3]) / 2 + g.nz * 2;
      if (Math.hypot(u.pos.x - RUNNER_TEST.x, u.pos.z - RUNNER_TEST.z) < 12 &&
          runnerClear(b.army, u, u.pos, RUNNER_TEST)) {
        goTo(p, inp, RUNNER_TEST.x, RUNNER_TEST.z, 0.5);
      } else {
        inp.runHeld = true;
        goTo(p, inp, F.roadPoint.x, F.roadPoint.z, 3);
      }
      return;
    }
    goTo(p, inp, zone.centroid.x, zone.centroid.z, 2);
    return;
  }
  inp.runHeld = true;
  goTo(p, inp, F.roadPoint.x, F.roadPoint.z, 3);
};

export { kinome };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
// 下地と盛土を含む主郭と麓（後詰の位置）の差を約320mにする。道の点・広さは保つ。
const LIFT = { x: KX(0), z: KZ(31), tx: 0, tz: KZ(-30), w: KX(60), R: 600, rise: 254.2 };

// 道の点の高さを一度だけ取り、切岸と折れ目の傾きをならす。
let ROAD_BEDS = null, ROAD_GRID = null;
const ROAD_CELL = 32, ROAD_RADIUS = Math.SQRT2 * ROAD_CELL / 2;
// この縄張りの平場は全て長方形。外縁からの距離も準備して、肩の幅を滑らかにつなぐ。
const COURT_BOUNDS = KINOME_PLAN.kuruwa.map((k) => ({
  x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])),
  z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])),
}));
function height(x, z) {
  if (!ROAD_BEDS) {
    ROAD_BEDS = [];
    for (const line of KINOME_ROADS) {
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const dx = bx - ax, dz = bz - az;
        ROAD_BEDS.push({ ax, az, dx, dz, l2: dx * dx + dz * dz, h0: heightRaw(ax, az), h1: heightRaw(bx, bz) });
      }
    }
    // 中心の値と勾配の上限から、格子内のどこでも最小・最大になれない区間だけ省く。
    // 遠い区間も高さの上下限へ効くため、単なる距離で切らない。
    ROAD_GRID = new Map();
    for (let iz = -40; iz <= 40; iz++) for (let ix = -40; ix <= 40; ix++) {
      const cx = (ix + 0.5) * ROAD_CELL, cz = (iz + 0.5) * ROAD_CELL;
      const values = [];
      let minD = Infinity, minU = Infinity, maxL = -Infinity;
      for (const r of ROAD_BEDS) {
        const t = Math.max(0, Math.min(1, ((cx - r.ax) * r.dx + (cz - r.az) * r.dz) / (r.l2 || 1)));
        const d = Math.hypot(cx - r.ax - r.dx * t, cz - r.az - r.dz * t), h = r.h0 + (r.h1 - r.h0) * t;
        const e = (Math.abs(r.h1 - r.h0) / (Math.sqrt(r.l2) || 1) + 0.45) * ROAD_RADIUS + 1e-7;
        values.push({ r, d, u: h + d * 0.45, l: h - d * 0.45, e });
        minD = Math.min(minD, d + ROAD_RADIUS); minU = Math.min(minU, h + d * 0.45 + e); maxL = Math.max(maxL, h - d * 0.45 - e);
      }
      ROAD_GRID.set(iz * 1000 + ix, values.filter((v) => v.d - ROAD_RADIUS <= minD || v.u - v.e <= minU || v.l + v.e >= maxL).map((v) => v.r));
    }
  }
  let bd = Infinity, upper = Infinity, lower = -Infinity;
  for (const r of ROAD_GRID.get(Math.floor(z / ROAD_CELL) * 1000 + Math.floor(x / ROAD_CELL)) || ROAD_BEDS) {
    const t = Math.max(0, Math.min(1, ((x - r.ax) * r.dx + (z - r.az) * r.dz) / r.l2));
    const d = Math.hypot(x - r.ax - r.dx * t, z - r.az - r.dz * t);
    const h = r.h0 + (r.h1 - r.h0) * t;
    bd = Math.min(bd, d);
    // 近くの折れ同士の高さも合わせ、道の横断方向に急な段差を作らない。
    upper = Math.min(upper, h + d * 0.45);
    lower = Math.max(lower, h - d * 0.45);
  }
  const roadH = (upper + lower) * 0.5;
  const raw = heightRaw(x, z);
  // 郭の中は土塁と床を保つ。外の山道は地形の約十五メートルの格子より広く肩をならす。
  // 細い腰だけを持ち上げると、格子の頂点一つが尖った尾根になる。
  let courtD = Infinity;
  for (const k of COURT_BOUNDS) courtD = Math.min(courtD,
    Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1)));
  const spread = Math.min(1, courtD / 24);
  const half = 2.8 + 5.2 * spread, end = 9 + 15 * spread;
  if (bd <= half) return roadH;
  if (bd >= end) return raw;
  const t = (end - bd) / (end - half), k = t * t * (3 - 2 * t);
  return raw + (roadH - raw) * k;
}
