// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。内応で開いた木戸から入り、侍町へ進み、奪った口を守る。
// 向き：北は -z、東は +x。主郭は中央〜東寄り。西に滝川の陣。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hut, yagura, campfire, kabukimon, tawara, dobei, ishigaki, yaguramon, kagaribi, tamon, tobira, makeKitBatch, finalizeKitBatch, dorui, makeSimpleBatch, finalizeSimpleBatch, palisade, solidCircle } from './props.js';
import { flagTexture } from './textures.js';
import { dirtTex } from './nature.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, dress, gone as groupGone, burnHouse } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeKakoi, kakoiEvent } from './kakoi.js';
import { demBlend } from './dem.js';
import { horiboriHeight, mizubori, goten } from './castle_parts.js';
import { reset as flReset, addDeck, addRamp } from './floors.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, patchGunCover } from './taketaba.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { makeNawabari } from './nawabari.js';
import {
  WALL_Z, GATE, SOTO_MOAT, SOTO_MOAT_SEGS, SOTO_BRIDGE,
  ROU, CAMP, HON_ISHIGAKI_SEGS, HON_MOAT, HON_MOAT_SEGS, TENSHU_POS,
  HON_W, HON_E, HON_N, HON_Z, HON_X, HON_CENTER_Z, HON_GAP, HON_ENTRY_X, HON_APPROACH_Z,
  SOKAKU_X, SOKAKU_N, KISHI_TORIDE, JORO_TORIDE, HON_W_MOAT, HON_W_MOAT_SEGS,
  ARIOKA_PLAN, MACHIYA_Z, TORIDE_WORKS, ARIOKA_ROADS, TOWN_X, TOWN_SOUTH_Z,
} from './castles/arioka.js';
const ARIOKA_BATTLE_PLAN = ARIOKA_PLAN;
// 石段と小物は共有の形・材質を使う。毎コマの作り直しはしない。
const ARI_BOX = new THREE.BoxGeometry(1, 1, 1);
const ARI_ROCK = new THREE.DodecahedronGeometry(1, 0);
const ARI_STONE = new THREE.MeshLambertMaterial({ color: 0x817d6d });
const ARI_EARTH = new THREE.MeshLambertMaterial({ color: 0x514432, side: THREE.DoubleSide });
const ARI_WOOD = new THREE.MeshLambertMaterial({ color: 0x57412c });
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
      kind: 'mixed', host: false, flagRate: 0.18, banners: 2, general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記の十月の攻め。村重は尼崎へ移っており、有岡の本陣には置かない。
// 岸は渡辺勘大夫、鵯塚は野村丹後。細かな持ち場と人数は推定。荒木の旗・紋は丸の代用（既存の表示）。
const ARIOKA_ATTACK = sonaePlan('惣構えの囲み', 0, { x: CAMP.x, z: CAMP.z + 4 }, Math.PI, [
  ['honjin', '本陣', '織田信忠', 20000, GATE.x - 60, SOKAKU_N - 80, Math.PI / 2, 'oda', 'oda'],
  ['takijin', '西の攻め口の陣', '滝川一益', 5000, CAMP.x, CAMP.z + 4, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '南の仕寄り', '滝川一益の配下', 5000, -36, 70, Math.PI, 'takigawa', 'takigawa', 90, 30, 14],
  ['niwa', '西の付城の控え', '丹羽長秀', 10000, GATE.x - 32, -58, Math.PI / 2, 'sujikai', 'sujikai', 70, 20, 16],
  ['north', '北の付城の控え', '名は伝わらない', 10000, -24, SOKAKU_N - 24, 0, 'oda', 'oda', 70, 28, 14],
]);
const ARIOKA_DEFEND = sonaePlan('三砦と主郭の守り', 1, { x: HON_X - 2, z: HON_CENTER_Z - 6 }, 0, [
  ['honjin', '本陣', '荒木久左衛門', 1200, HON_X - 2, HON_CENTER_Z - 6, 0, 'maru', 'maru'],
  ['kishi', '岸の砦', '渡辺勘大夫', 500, 20, SOKAKU_N + 26, 0, 'maru', 'maru', 70, 28, 14],
  ['joro', '上ろう塚砦', '中西新八郎ら', 300, JORO_TORIDE.x + 12, JORO_TORIDE.z, -Math.PI / 2, 'maru', 'maru', 0, 8, 10],
  ['hiyodori', '鵯塚砦', '野村丹後', 600, 28, WALL_Z - 10, 0, 'maru', 'maru', 35, 18, 10],
  ['town', '侍町の控え', '荒木久左衛門の配下', 400, TOWN_X - 26, -76, 0, 'maru', 'maru', 0, 8, 6],
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
// 地形を作る前に標高をそろえる。後から地面だけ変わり、石段・床・建物とずれるのを防ぐ。
import ariDem from './asset_dem_arioka.js';
const ARI_DEM_OPT = { scale: 0.18, floor: 0 };
const clamp = (v) => Math.max(0, Math.min(1, v));
// 塀と堀を直線で横切らず、手前で道の中央へ寄り、口を抜けてから行き先へ向かう。
// 兵と試し役が同じ道を使う。曲がり角の入れ物は一人につき一つを使い回す。
function gateWay(army, u, goal) {
  const p = u.pos, outward = goal.x < p.x;
  const q = u._ariWay || (u._ariWay = { x: 0, z: 0 });
  // 曲がり角の目標を現在地に戻さない。中心を越えても出口まで同じ向きへ進む。
  for (let i = 0; i < 2; i++) {
    const moat = outward ? i === 1 : i === 0, x = GATE.x - (moat ? 5 : 0);
    const clearance = moat ? 4.5 : 1.5;
    const crossing = (p.x - x) * (goal.x - x) < 0;
    const leaving = Math.abs(p.x - x) < clearance && Math.abs(goal.x - x) >= clearance;
    if (!crossing && !leaving) continue;
    if (Math.abs(p.z - GATE.z) <= 2.5 && Math.abs(goal.z - GATE.z) <= 2.5) continue;
    const side = p.x < x ? -1 : 1, exit = goal.x < x ? -1 : 1;
    q.x = Math.abs(p.z - GATE.z) > 2.5
      ? (side < 0 ? GATE.x - 12 : GATE.x + 5)
      : (exit < 0 ? GATE.x - 12 : GATE.x + 5);
    q.z = GATE.z;
    return q;
  }
  const fort = TORIDE_WORKS[1];
  for (let i = 0; i < 2; i++) {
    const x = outward ? (i === 0 ? fort.x1 : fort.x0) : (i === 0 ? fort.x0 : fort.x1);
    const crossing = (p.x - x) * (goal.x - x) < 0;
    const leaving = Math.abs(p.x - x) < 1.5 && Math.abs(goal.x - x) >= 1.5;
    if (!crossing && !leaving) continue;
    const crossingZ = crossing ? p.z + (goal.z - p.z) * (x - p.x) / (goal.x - p.x) : p.z;
    if (crossingZ < fort.z0 - 1 || crossingZ > fort.z1 + 1) continue;
    if (Math.abs(p.z - GATE.z) <= 5.5 && Math.abs(goal.z - GATE.z) <= 5.5) continue;
    const side = Math.abs(p.z - GATE.z) > 5.5 ? (p.x < x ? -1 : 1) : (goal.x < x ? -1 : 1);
    q.x = x + side * 3; q.z = GATE.z;
    return q;
  }
  return goal;
}
// 敗走も道路と土橋を歩く。敵は主郭南の口、味方と町の者は西の木戸へ退く。
// 遠い兵の簡略移動にも同じ道を渡し、塀の向こうへ飛ばさない。
function fleeWay(army, u, goal) {
  if (u.team === 0 || u.group.civ) {
    const q = u._ariRetreat || (u._ariRetreat = { x: CAMP.x - 20, z: GATE.z });
    return gateWay(army, u, q);
  }
  const p = u.pos, fort = TORIDE_WORKS[1];
  const q = u._ariRetreat || (u._ariRetreat = { x: 0, z: 0, stage: p.x < TOWN_X - 20 ? 0 : 1 });
  if (p.x > HON_W && p.x < HON_E && p.z < HON_Z) q.stage = 4;
  if (q.stage === 0) {
    q.x = TOWN_X - 24; q.z = GATE.z;
    if (p.x < fort.x1 + 3) return gateWay(army, u, q);
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 1;
  }
  if (q.stage === 1) {
    q.x = TOWN_X - 12; q.z = -70;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 2;
  }
  if (q.stage === 2) {
    q.x = HON_ENTRY_X; q.z = HON_APPROACH_Z;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 3;
  }
  if (q.stage === 3) {
    q.x = HON_ENTRY_X; q.z = HON_Z - 8;
    if (p.z < HON_Z - 4) q.stage = 4;
  }
  if (q.stage === 4) { q.x = HON_ENTRY_X + 12; q.z = HON_Z - 16; }
  return q;
}

// 城兵が口へ戻り、追手が離れている間だけ門番が開ける。大将の陣は動かさない。
function retreatGateTick(rt) {
  const F = rt.flags, gate = F.hongate;
  if (!gate || F.honGateCheckAt > rt.t) return;
  F.honGateCheckAt = rt.t + 0.5;
  let returning = false, crossing = false, threat = false;
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || u.group?.civ || u.noTarget) continue;
    const dx = Math.abs(u.pos.x - HON_ENTRY_X), dz = Math.abs(u.pos.z - HON_Z);
    if (u.team === 0 && dx < 25 && dz < 25) threat = true;
    if (u.team === 1 && u.fleeing && dx < 5) {
      if (u.pos.z >= HON_Z - 4 && u.pos.z < HON_Z + 16) returning = true;
      if (dz < 2) crossing = true;
    }
  }
  const opened = crossing || returning && !threat;
  if (opened === !!gate.opened) return;
  gate.opened = opened;
  if (opened) F.honDoor.userData.open();
  else {
    for (const leaf of F.honDoor.userData.leaves) leaf.rotation.y = 0;
    F.honDoor.children[2].visible = true;
  }
}

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  if (ariDem) { ARI_DEM_OPT.floor = h - 1.2; h = demBlend(ariDem, x, z, h, ARI_DEM_OPT); }
  // 惣構えの土塁（木戸の下）
  h += 0.9 * Math.exp(-((z - WALL_Z) ** 2) / 10);
  // 東の段丘の縁。その外は猪名川の低地。
  h -= 4 / (1 + Math.exp(-(x - SOKAKU_X - 3) / 2));
  // 主郭だけを盛る。南面の道の口は堀の外からの緩い坂で、堀と石垣を避けて牢へ登れる。
  const eastWest = clamp((x - HON_W + 3) / 3) * clamp((HON_E + 3 - x) / 3);
  const north = clamp((z - HON_N + 3) / 3);
  const mouth = clamp(Math.min(x - HON_GAP[0], HON_GAP[1] - x) / 2);
  const south = clamp((HON_Z + 3 - z) / 3);
  const ramp = clamp((HON_APPROACH_Z - z) / (HON_APPROACH_Z - HON_Z + 6));
  h += 5 * eastWest * north * (south * (1 - mouth) + ramp * mouth);
  // 六甲の山並み（遠く）
  // 六甲の山は城下に盛らない。伊丹段丘の平地を保つ。
  // 水堀の曲がり角は深い方を採り、重ねて二倍の深さにしない。
  let dip = 0;
  for (const f of MOAT_FNS) dip = Math.min(dip, f(x, z));
  h += dip;
  return h;
}

// 大きな地面の格子は増やさず、堀・主郭・内応口のある升だけを準備時に細かくする。
// 元の升を外して差し替えるため、粗い地面で堀が埋まらない。歩く高さも同じ式へ結ぶ。
function refineAriTerrain(rt) {
  const W = rt.world, terrain = W.terrain;
  if (!terrain) return;
  const old = terrain.geometry, step = W.step, half = W.half, n = Math.round(half * 2 / step);
  const cells = new Uint8Array(n * n), bounds = [];
  for (const [segs, moat] of [[SOTO_MOAT_SEGS, SOTO_MOAT], [HON_MOAT_SEGS, HON_MOAT], [HON_W_MOAT_SEGS, HON_W_MOAT]]) {
    for (const pts of segs) for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], m = moat.width / 2 + step;
      bounds.push([Math.min(a[0], b[0]) - m, Math.max(a[0], b[0]) + m, Math.min(a[1], b[1]) - m, Math.max(a[1], b[1]) + m]);
    }
  }
  bounds.push([HON_W - step, HON_E + step, HON_N - step, HON_APPROACH_Z + step],
    [GATE.x - 50, TOWN_X + 65, GATE.z - 65, TOWN_SOUTH_Z + 35]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step;
    if (bounds.some((b) => x + step >= b[0] && x <= b[1] && z + step >= b[2] && z <= b[3])) cells[j * n + i] = 1;
  }
  const coarse = W.heightAt.bind(W);
  const refined = (x, z) => {
    const i = Math.floor((x + half) / step), j = Math.floor((z + half) / step);
    if (i < 0 || j < 0 || i >= n || j >= n || !cells[j * n + i]) return coarse(x, z);
    const dx = x + half - i * step, dz = z + half - j * step;
    let fade = 1;
    // 差し替えた面の外縁だけ元の格子へつなぎ、隣の面との裂け目を防ぐ。
    if (!i || !cells[j * n + i - 1]) fade = Math.min(fade, dx / 3);
    if (i === n - 1 || !cells[j * n + i + 1]) fade = Math.min(fade, (step - dx) / 3);
    if (!j || !cells[(j - 1) * n + i]) fade = Math.min(fade, dz / 3);
    if (j === n - 1 || !cells[(j + 1) * n + i]) fade = Math.min(fade, (step - dz) / 3);
    const h = coarse(x, z); return h + (height(x, z) - h) * clamp(fade);
  };
  const pos = [], splat = [], water = [], keep = [], idx = old.index.array;
  const emit = (i, j, u, v) => {
    const x = -half + (i + u) * step, z = -half + (j + v) * step;
    pos.push(x, refined(x, z), z);
    const ids = [j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i, (j + 1) * (n + 1) + i + 1];
    const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    for (let k = 0; k < 3; k++) {
      let c = 0; for (let q = 0; q < 4; q++) c += old.attributes.splat.array[ids[q] * 3 + k] * weights[q]; splat.push(c);
    }
    let w = 0; for (let q = 0; q < 4; q++) w += old.attributes.water.array[ids[q]] * weights[q]; water.push(w);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const offset = (j * n + i) * 6;
    if (!cells[j * n + i]) { for (let k = 0; k < 6; k++) keep.push(idx[offset + k]); continue; }
    const x = -half + (i + .5) * step, z = -half + (j + .5) * step;
    const div = Math.ceil(step / (Math.abs(x - GATE.x) < 25 && Math.abs(z - GATE.z) < 30 ? 1.5 : 4));
    for (let b = 0; b < div; b++) for (let a = 0; a < div; a++) {
      for (const [u, v] of [[a, b], [a, b + 1], [a + 1, b], [a, b + 1], [a + 1, b + 1], [a + 1, b]]) emit(i, j, u / div, v / div);
    }
  }
  old.setIndex(keep);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('splat', new THREE.Float32BufferAttribute(splat, 3));
  g.setAttribute('water', new THREE.Float32BufferAttribute(water, 1)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, terrain.material); mesh.receiveShadow = true; rt.scene.add(mesh);
  W.heightAt = refined;
}

// 火は町屋から隣の町屋・侍屋敷へ燃え移る（近い家ほど早い。風に乗って広がる）。焼け出された町の者は逃げ惑う
function burnSpread(rt, h) {
  if (h.burnt) return;
  burnHouse(rt, h);
  const F = rt.flags;
  for (const o of F.houses || []) {
    if (o.burnt || o.fireScheduled || o === h) continue;
    const d = Math.hypot(o.x - h.x, o.z - h.z);
    const wind = rt.world.def.wind, wx = wind?.[0] || 0, wz = wind?.[1] || 0;
    const down = d > 0 ? ((o.x - h.x) * wx + (o.z - h.z) * wz) / (d * (Math.hypot(wx, wz) || 1)) : 0;
    if (d < 14 + Math.max(0, down) * 8) {
      o.fireScheduled = true;
      rt.after(Math.max(4, 6 + d * (0.8 - down * 0.3)), () => { if (!F.ending && !rt.over) burnSpread(rt, o); });
    }
  }
  // 住民は準備時に置いた組が徒歩で退く。その場に新しく出さない。
  if (!F.fireGuide) { F.fireGuide = true; rt.bark('侍町に火が回った。火を避け、南の辻から木戸へ通れ'); }
  if (!F.civsFled) {
    F.civsFled = true; rt.obj('evac', '町の者の逃げ道を空けよ', 'side');
    for (const c of F.civs) {
      c.noAI = true; c.arriveNoncombat = true; c.march = true; c.formation = 'column'; c.colW = 2;
      c.order = 'path'; c.pathIdx = 0;
      c.path = [[TOWN_X - 24, GATE.z], [GATE.x + 6, GATE.z], [GATE.x - 14, GATE.z], [CAMP.x - 20, GATE.z]];
      c.onArrive = (g) => { g.order = 'hold'; g.march = false; };
    }
  }
}

// この戦の行き先は一つ。仲間・敵・曲がり角の別々の印を重ねない。
function ariMark(rt, id, at, label) {
  for (const old of ['taki', 'turn', 'g1', 'aid', 'dp']) rt.unmark(old);
  rt.marker(id, at, label);
}

// 通りの土・水たまり・軒の提灯は準備時に作り、材質ごとにまとめる。
// 灯りは自ら光る材質と地面の淡い光で示し、点光源や毎コマの処理を増やさない。
function ariStreetDress(rt) {
  const W = rt.world, soil = [], wet = [], paper = [], wood = [], glow = [];
  const bridgeY = Math.max(W.heightAt(...SOTO_BRIDGE.a), W.heightAt(...SOTO_BRIDGE.b));
  const floor = (x, z) => x >= SOTO_BRIDGE.a[0] && x <= SOTO_BRIDGE.b[0] && Math.abs(z - GATE.z) <= SOTO_BRIDGE.w / 2
    ? bridgeY : W.heightAt(x, z);
  const disk = new THREE.CircleGeometry(1, 12); disk.rotateX(-Math.PI / 2);
  const body = new THREE.CylinderGeometry(.24, .24, .55, 8).toNonIndexed();
  const ring = new THREE.CylinderGeometry(.25, .25, .055, 8).toNonIndexed();
  const strap = ARI_BOX.toNonIndexed();
  const place = (list, shape, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const g = shape.clone(); g.scale(sx, sy, sz); g.translate(x, y, z); list.push(g);
  };
  // 木戸から辻への通りと南北の町筋。三メートルごとに地形へ沿わせる。
  for (const road of [ARIOKA_ROADS[0], ARIOKA_ROADS[4]]) {
    const pos = [], uv = [];
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz), n = Math.ceil(len / 3), nx = -dz / len, nz = dx / len;
      for (let j = 0; j < n; j++) {
        const points = [];
        for (const [t, side] of [[j / n, -1], [j / n, 1], [(j + 1) / n, -1], [(j + 1) / n, 1]]) {
          const x = a[0] + dx * t + nx * side * 2.1, z = a[1] + dz * t + nz * side * 2.1;
          points.push([x, floor(x, z) + .035, z]);
        }
        for (const k of [0, 1, 2, 1, 3, 2]) { pos.push(...points[k]); uv.push(points[k][0] * .4, points[k][2] * .4); }
        // 不規則な小さな水たまり。土橋には置かない。
        if (j % 7 === 3) {
          const t = (j + .5) / n, x = a[0] + dx * t + nx * .8, z = a[1] + dz * t + nz * .8;
          if (x > GATE.x + 24) place(wet, disk, x, floor(x, z) + .065, z, .7 + (j % 3) * .2, 1, .45);
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); soil.push(g);
  }
  for (const h of rt.flags.houses) {
    // 家の南側の軒に下げ、家と一緒に傾いた向きへそろえる。
    const x = h.x + Math.sin(h.m.rotation.y) * 2.8, z = h.z + Math.cos(h.m.rotation.y) * 2.8;
    const y = W.heightAt(h.x, h.z) + 2.3;
    place(paper, body, x, y, z);
    for (const dy of [-.28, 0, .28]) place(wood, ring, x, y + dy, z);
    place(wood, strap, x, y + .55, z, .04, .5, .04);
    place(glow, disk, x, floor(x, z) + .05, z, 1.8, 1, 1.4);
  }
  const mats = [
    new THREE.MeshLambertMaterial({ color: 0xcbb88f, map: dirtTex(), side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0x8198ac, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0xffce83 }), ARI_WOOD,
    new THREE.MeshBasicMaterial({ color: 0xe6b565, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }),
  ];
  [soil, wet, paper, wood, glow].forEach((parts, i) => {
    if (!parts.length) return;
    // 平面の頂点番号を外し、他の形と同じ形式でまとめる。
    const flat = parts.map((g) => g.index ? g.toNonIndexed() : g);
    const mesh = new THREE.Mesh(mergeGeometries(flat), mats[i]);
    mesh.receiveShadow = i === 0; rt.scene.add(mesh);
    for (const g of flat) g.dispose();
    for (const g of parts) if (!flat.includes(g)) g.dispose();
  });
  disk.dispose(); body.dispose(); ring.dispose(); strap.dispose();
}

const arioka = {
  jinkei: [ARIOKA_ATTACK, ARIOKA_DEFEND],
  botOrders: true, // 木戸と城下は、この戦の下知に従う。
  noticeOnce: true, // 首の催促や組の同じ掛け声は、この戦で一度だけ。
  noDistantBattle: true, // 備え表にない控え・本陣・押し合いを重ねない。
  strictHits: true, // 斬り合いの一撃は通常どおり。
  rangedWarning: true, // 発射前に矢印と「鉄砲」で方向を示す。
  openingGunGrace: 30, // 最初の鉄砲では退く時間を残す。
  sideTaskAfter: Infinity, // 本丸や櫓取りへ誘わず、木戸と辻の任務に従う。
  guideMarker(rt) {
    if (rt.flags.ending || rt.over) return null;
    if (rt.flags.coverUntil > rt.t) return 'ariCover';
    return rt.flags.step === 0 ? 'taki' : rt.flags.dpOn ? 'dp' : 'turn';
  },
  downDelay: 3.5, // 倒れたら屋根を見続けず、戦の結果へ。
  noTaisho: true, // 信忠の本陣は局地の範囲外。共通処理で木戸前へ出さない。
  noWake: true, // 城下の段で出す兵だけが戦う。遠景と自動増援は重ねない。
  spawn: { x: GATE.x - 40, z: GATE.z, heading: Math.PI / 2 },
  world: {
    seed: 15791, moveLim: 1080, groundHalf: 1100,
    time: 'night',
    winter: true,
    wind: [0.4, 1],
    muddy: 0.1,
    paths: ARIOKA_ROADS,
    // 猪名川の西の平地に収穫後の田。囲みの陣・土橋・村の前は空ける。
    paddy: (x, z) => x > SOKAKU_X + 24 && x < SOKAKU_X + 66 && z > -190 && z < -25 ? 1 : 0,
    height,
    moveWay: gateWay, fleeWay, fleeFar: false,
    // 遠くの使番も同じ木戸へ回す。姿を出す前から塀と堀に詰まらせない。
    runnerWay: gateWay,
    // 東の低地に猪名川。南へ下り、尼崎へ向かう（遠景）。
    streams: [{ pts: [[SOKAKU_X + 88, SOKAKU_N - 25], [SOKAKU_X + 93, -60], [SOKAKU_X + 86, 60], [SOKAKU_X + 91, WALL_Z + 50]], w: 11, depth: 1.3 }],
    clear: (x, z) => (Math.abs(x) < SOKAKU_X + 5 && z > SOKAKU_N - 15 && z < WALL_Z + 15) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45),
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => ((Math.abs(x) < SOKAKU_X + 10 && z > SOKAKU_N - 20 && z < WALL_Z + 20) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45) ? 0.05 : 0.6),
    groves: [{ x: TOWN_X + 50, z: -20, r: 10, n: 10 }, { x: GATE.x, z: 40, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && x > HON_W && x < HON_E && z > HON_N && z < HON_Z,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.rescued = true; // 深手からその場で体力を戻して立たせる共通の救助は使わない。
    F.civs = [];
    rt._rfN = 3; // 共通の自動救援は使わず、初めから後詰を置く。
    // 長い包囲（kakoi.js）：荒木村重は一年近く籠もり、兵糧と士気は細っている。夜討ちの結果で動く
    F.kakoi = makeKakoi({ day: 300, foodDays: 25, morale: 55 });
    flReset();   // 床の層（石垣の上・水堀の土橋）を、この戦の分で作り直す
    // ---- 惣構えの柵（西の上ろう塚の木戸が内応で開く） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // 塀（百枚近く）と城の建物は材質ごとに一つの形へまとめて描く（一枚ずつだと描く回数が五百を越え、携帯で重かった）
    const KB = makeKitBatch(), PB = makeSimpleBatch();
    refineAriTerrain(rt);
    const farWood = [], farEarth = [];
    const farFence = (world, seg) => {
      const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
      const g = ARI_BOX.clone(); g.scale(.22, 2.4, len); g.rotateY(Math.atan2(bx - ax, bz - az));
      g.translate((ax + bx) / 2, world.heightAt((ax + bx) / 2, (az + bz) / 2) + 1.2, (az + bz) / 2);
      farWood.push(g.toNonIndexed()); g.dispose();
      return { isBatchedPart: true };
    };
    const townFence = (world, seg) => {
      const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
      const angle = Math.atan2(bx - ax, bz - az), n = Math.ceil(len / .5);
      const H = 2.45; // 背丈一・六三メートルの一・五倍。杭の間は約三十センチ空ける。
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        const g = ARI_BOX.toNonIndexed(); g.scale(.2, H, .2);
        g.translate(x, world.heightAt(x, z) + H / 2, z); farWood.push(g);
      }
      for (const y of [.65, 1.65]) {
        const g = ARI_BOX.toNonIndexed(); g.scale(.14, .14, len); g.rotateY(angle);
        g.translate((ax + bx) / 2, world.heightAt((ax + bx) / 2, (az + bz) / 2) + y, (az + bz) / 2);
        farWood.push(g);
      }
      return { isBatchedPart: true };
    };
    const outerWall = (pts) => noT(wallLine(rt, pts, { team: 1, hp: 1e9, name: '惣構えの柵', segLen: 24, mesh: farFence }));
    outerWall([[-SOKAKU_X, WALL_Z], [SOKAKU_X, WALL_Z]]);
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3.5, GATE.x, GATE.z + 3.5], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '上ろう塚の木戸' });
    F.gate.noTarget = true;
    const dm = tobira(W, GATE.x, GATE.z, 7.0, Math.PI / 2);   // 閉じた扉（破られると根元から倒れる）
    F.door = dm;
    // 木戸の上に渡櫓。購入部品はこの一門へ使い、土の囲いの物見は木造の井楼とする（推定）
    rt.scene.add(dm, yaguramon(W, GATE.x, GATE.z, 7.4, Math.PI / 2, { doors: false, earth: true })); rt.scene.add(yagura(W, -30, WALL_Z - 5), yagura(W, 34, WALL_Z - 5));
    // 惣構えの水堀（木戸の正面だけ切って、土橋で渡す。docs/castle-design.md 1-4・5-2）
    // heightAt はすでに堀の底。水をさらに下げず、底から水深を戻す。
    const water = (pts, moat) => {
      const a = pts[0], b = pts[1];
      mizubori(rt, pts, { ...moat, y: W.heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + moat.depth * 0.6 });
    };
    for (const pts of SOTO_MOAT_SEGS) {
      for (let i = 1; i < pts.length; i++) water([pts[i - 1], pts[i]], SOTO_MOAT);
    }
    // 土橋は東西。床の長い向きも東西へそろえ、七メートル幅を丸ごと歩ける。
    const bridgeY = Math.max(W.heightAt(...SOTO_BRIDGE.a), W.heightAt(...SOTO_BRIDGE.b));
    addDeck({ x0: SOTO_BRIDGE.a[0], x1: SOTO_BRIDGE.b[0], z0: GATE.z - SOTO_BRIDGE.w / 2, z1: GATE.z + SOTO_BRIDGE.w / 2, y: bridgeY, name: '惣構えの土橋' });
    for (const [x, z] of [[GATE.x - 3, GATE.z - 7], [GATE.x - 3, GATE.z + 7]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 惣構え全体の囲い（東西約800m・南北約1,700mを実寸。四方を閉じ、開くのは西の上ろう塚の木戸だけ） ----
    // 南の塀は東西の土塁につなぎ、木戸以外に隙間を残さない。
    outerWall([[-SOKAKU_X, WALL_Z], [-SOKAKU_X, GATE.z + 45]]);
    outerWall([[-SOKAKU_X, GATE.z - 45], [-SOKAKU_X, SOKAKU_N]]);
    for (const pts of [[[GATE.x, GATE.z + 45], [GATE.x, GATE.z + 3.5]], [[GATE.x, GATE.z - 3.5], [GATE.x, GATE.z - 45]]]) {
      noT(wallLine(rt, pts, { team: 1, hp: 1e9, name: '惣構えの柵', segLen: 8, mesh: townFence, h: 2.45, sama: .5 }));
    }
    outerWall([[SOKAKU_X, WALL_Z], [SOKAKU_X, SOKAKU_N]]);
    outerWall([[-SOKAKU_X, SOKAKU_N], [SOKAKU_X, SOKAKU_N]]);
    // 惣構えの土塁：塀の外へ盛った土の斜面（見た目だけ。一つの形にまとめる。木戸の前は空ける）と、四隅の木造の物見、町の木戸（大通りの町境）
    {
      for (const [seg, nx, nz] of [[[-SOKAKU_X, WALL_Z, SOKAKU_X, WALL_Z], 0, 1], [[-SOKAKU_X, WALL_Z, -SOKAKU_X, GATE.z + 6], -1, 0], [[-SOKAKU_X, GATE.z - 6, -SOKAKU_X, SOKAKU_N], -1, 0], [[SOKAKU_X, WALL_Z, SOKAKU_X, SOKAKU_N], 1, 0], [[-SOKAKU_X, SOKAKU_N, SOKAKU_X, SOKAKU_N], 0, -1]]) {
        // 遠い土塁は二十メートルごとの法面でまとめる。口の六メートルは空ける。
        const [ax, az, bx, bz] = seg, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 20);
        const pos = [];
        for (let i = 0; i < n; i++) {
          const points = [];
          for (const [t, u] of [[i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1], [i / n, 1]]) {
            const x = ax + (bx - ax) * t + nx * u * 3, z = az + (bz - az) * t + nz * u * 3;
            points.push([x, W.heightAt(x, z) + .9 * (1 - u), z]);
          }
          for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...points[k]);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); farEarth.push(g);
      }
      for (const [x, z] of [[-SOKAKU_X + 4, WALL_Z - 4], [SOKAKU_X - 4, WALL_Z - 4], [-SOKAKU_X + 4, SOKAKU_N + 4], [SOKAKU_X - 4, SOKAKU_N + 4]]) rt.scene.add(yagura(W, x, z));
      rt.scene.add(kabukimon(W, TOWN_X, MACHIYA_Z[1], 7, 0, { doors: false }));   // 町屋と侍町の境の木戸（開いたまま。通れる）
    }
    // 三砦（北＝岸の砦・西＝上ろう塚砦・南＝鵯塚砦）。物見の櫓と旗で目印を置く（HIST_B）
    rt.scene.add(yagura(W, 10, KISHI_TORIDE.z + 10), nobori(W, KISHI_TORIDE.x + 4, KISHI_TORIDE.z + 3, 'maru', 6));
    rt.scene.add(yagura(W, JORO_TORIDE.x + 5, JORO_TORIDE.z - 12));
    F.joroFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'maru', 6); rt.scene.add(F.joroFlag);
    F.joroOdaFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'oda', 6); F.joroOdaFlag.visible = false; rt.scene.add(F.joroOdaFlag);
    // 三砦は木造の物見・板葺きの兵舎と蔵・土塁と柵を備える。寸法と建物は摂津の推定復元。
    // 遠い岸・鵯塚も材質ごとにまとめ、実際の兵は増やさない。
    {
      const db = makeSimpleBatch();
      const edge = (a, b, nx, nz) => {
        const d = dorui(W, [...a, ...b], nx, nz, { batch: db, w: 1.8, h: .8 });
        if (!d.isBatchedPart) rt.scene.add(d);
        noT(wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6, mesh: townFence, h: 2.45 }));
      };
      for (const t of TORIDE_WORKS) {
        const { x0, x1, z0, z1 } = t, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        for (const [z, nz, open] of [[z0, -1, t.side === 'north'], [z1, 1, t.side === 'south']]) {
          if (open) { edge([x0, z], [cx - 3.5, z], 0, nz); edge([cx + 3.5, z], [x1, z], 0, nz); }
          else edge([x0, z], [x1, z], 0, nz);
        }
        for (const [x, nx] of [[x0, -1], [x1, 1]]) {
          // 渡櫓の脇の外階段も砦の内へ入る。戸の口と階段の幅を合わせて柵を空ける。
          if (t.side === 'cross') { edge([x, z0], [x, cz - 7], nx, 0); edge([x, cz + 7], [x, z1], nx, 0); }
          else edge([x, z0], [x, z1], nx, 0);
        }
        if (t.side !== 'cross') rt.scene.add(kabukimon(W, cx, t.side === 'north' ? z0 : z1, 7, 0, { doors: false }));
        // 上ろう塚の道の両側、ほかの砦の町側に入口を向ける。
        hut(W, t.id === 'joro' ? x1 - 7 : cx - 7, t.id === 'joro' ? cz + 12 : cz + 1, 7, 4, 0, { ita: true, batch: db });
        hut(W, t.id === 'joro' ? x1 - 7 : cx + 7, t.id === 'joro' ? cz - 12 : t.id === 'kishi' ? cz + 5 : cz - 4, 4, 3, 0, { ita: true, batch: db });
      }
      rt.scene.add(yagura(W, 9, WALL_Z - 11));
      finalizeSimpleBatch(rt, db);
    }
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    // 南寄り（木戸に近い）が町屋、北寄り（本丸に近い）が侍町。道は細く、家は密集させる（GAME_C）
    // 城下に松明（敵の居所が見える。主郭の館からも城下の灯が見える。B079・B080）
    for (const [x, z] of [[TOWN_X - 14, -12], [TOWN_X + 14, -14], [TOWN_X - 30, -44], [TOWN_X + 30, -46], [TOWN_X, -58], [ROU.x - 5, ROU.z + 4], [HON_E - 3, HON_Z - 3], [TENSHU_POS.x, TENSHU_POS.z + 4]]) W.addFire(x, z, { torch: true, h: 1.6 });
    F.houses = [
      [-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2],
      [-48, -16, 0.15], [36, -20, -0.1], [-18, -40, 0.1], [50, -50, 0.2], [-44, -62, -0.15],
      [-10, -10, Math.PI / 2], [14, -10, -Math.PI / 2], [-10, -26, Math.PI / 2], [14, -26, -Math.PI / 2],
      [-12, GATE.z + 38, Math.PI / 2], [12, GATE.z + 38, -Math.PI / 2],
    ].map(([dx, z, r], i) => {
      const x = TOWN_X + dx;
      // 放火される侍町は既存の閉じた小屋を保つ。町屋三軒には通り庭と奥の間を設ける。
      const open = i < 3;
      const m = open ? goten(rt, x, z, { w: 7, d: 5, rot: r, team: 1, tile: false, naka: true, noTarget: true, kind: 'machiya', profile: 'arioka', name: '町屋', doorX: 0 }).mesh
        : hut(W, x, z, 7, 5, r, { wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      if (!open) rt.scene.add(m);
      return { x, z, m, samurai: z <= -46 };
    });
    noT(wallLine(rt, [[TOWN_X + 8, -22], [TOWN_X + 8, -6]],
      { team: 1, hp: 1e9, name: '町屋の柵', mesh: townFence, h: 2.45, sama: .5 }));
    // 北の多聞櫓の床・外階段と重ねず、長屋の裏にも歩ける庭を残す。
    goten(rt, HON_W + 5, HON_N + 14, { w: 7, d: 4, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '主郭の長屋' });
    rt.scene.add(yagura(W, HON_E - 3, HON_Z - 4));
    // 本丸：台地の縁に野面積みの石垣（牢へ上る道は空ける）と、石垣の上に館（確かな姿の分からない三重天守は置かない）
    for (const [a, b] of HON_ISHIGAKI_SEGS) {
      ishigaki(W, [a, b], { kind: 'nozura', top: 0.1, minH: 2.6, batch: KB });
      noT(wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '主郭の土塀', segLen: 5, mesh: dobei, meshOpt: { h: 1.9, batch: KB } }));
    }
    rt.scene.add(kabukimon(W, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0, { doors: false }));
    // 本丸の水堀（石垣の手前・町側。道の口＝HON_GAP はそのまま地続きで、水に入らず上がれる）
    for (const pts of HON_MOAT_SEGS) water(pts, HON_MOAT);
    // 本丸の西の堀（南面と同じ幅・深さ）
    for (const pts of HON_W_MOAT_SEGS) water(pts, HON_W_MOAT);
    // 十月の攻めでは本丸は持ちこたえる。館を作るだけで開城や救出の筋は進めない。
    goten(rt, TENSHU_POS.x, TENSHU_POS.z, { w: 8, d: 5, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '本丸の館' });
    tamon(W, [HON_W + 2, HON_N + 1, HON_E - 2, HON_N + 1], { out: -1, batch: KB });   // 本丸の北の縁を囲う多聞櫓
    for (const [parts, mat] of [[farWood, ARI_WOOD], [farEarth, ARI_EARTH]]) {
      const g = mergeGeometries(parts), mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; rt.scene.add(mesh);
      for (const part of parts) part.dispose();
    }
    finalizeSimpleBatch(rt, PB);
    finalizeKitBatch(rt, KB);   // 塀・櫓門・隅櫓・石垣・多聞をまとめて描く
    // 岸の砦の控えは備えの表から、牢への道を空けて置く。
    // 本丸の石垣の上に並んで、城下を見下ろして構える鉄砲・弓の者と旗（軽い作り。牢へ上る道の口は空ける）
    {
      const crew = [];
      for (let x = HON_W + 1, k = 0; x <= HON_E - 1; x += 3.4, k++) {
        if (x > HON_GAP[0] - 1 && x < HON_GAP[1] + 1) continue;
        crew.push({ x: x + ((k * 37) % 10) / 10 - 0.5, z: HON_Z - 2.2 - ((k * 53) % 7) / 10, k: ['gun', 'gun', 'bow', 'spear'][k % 4], flag: k % 6 === 0 ? 1 : 0, facing: ((k * 29) % 9 - 4) * 0.06 });
        if (k % 5 === 2) crew.push({ x: x + 1.2, z: HON_Z - 4.5, k: 'banner', facing: 0 });
      }
      W.addDistantArmy({ people: crew, armor: 0x2e2a26, team: 1, flagTex: flagTexture('maru'), seed: 15794 });
    }
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { ita: true, h: 1.8, wall: 0x3a3228 });
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [HON_W + 2, HON_CENTER_Z], [HON_E - 2, HON_CENTER_Z]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // 主郭の番所・蔵と侍屋敷。入れる建物は既存の室内の作り（購入した和の部屋）へ結ぶ。
    // 牢は十月の任務では開けない。建物の配置・檜皮葺きの姿は推定。
    // 南の土塀から外階段の下まで離し、戸口へ向かう庭を残す。
    goten(rt, HON_W + 3.5, HON_Z - 8, { w: 4.5, d: 3.5, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '主郭の番所', doorX: 0 });
    goten(rt, HON_E - 4, HON_CENTER_Z + 2, { w: 4, d: 3, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '主郭の武具蔵', kind: 'yagura', doorX: 0 });
    goten(rt, TOWN_X - 18, -166, { w: 9, d: 6, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '侍町の屋敷', doorX: 0 });
    // 荒村寺跡の庭園が見つかった地域。堂と庭の細かな姿・位置は推定として復元。
    goten(rt, 8, HON_N - 13, { w: 9, d: 7, team: 1, tile: false, naka: true, noTarget: true, kind: 'temple', name: '城内の寺', doorX: 0 });
    {
      const db = makeSimpleBatch();
      // 町の北の長屋と板葺きの倉。寺への道と南北の大通りを空ける。
      for (const [x, z, w, d] of [[-32, -184, 12, 4], [30, -174, 12, 4], [32, -202, 7, 4]]) hut(W, TOWN_X + x, z, w, d, 0, { ita: true, batch: db });
      // 猪名川へ下る平地の村。川と田の両側に寄せて置く。
      for (const [x, z] of [[94, -211], [109, -212], [120, -8], [101, 3]]) hut(W, SOKAKU_X + x - 60, z, 6, 4, .1, { batch: db });
      finalizeSimpleBatch(rt, db);
    }
    // 石段・土橋の表面・井戸・庭石は一度だけ作り、材質ごとに一つにまとめる。
    {
      const stone = [], earth = [], wood = [];
      // 庭石は頂点番号を持たないため、石段と土橋も同じ形にそろえてまとめる。
      const box = (list, x, y, z, w, h, d) => { const g = ARI_BOX.toNonIndexed(); g.scale(w, h, d); g.translate(x, y, z); list.push(g); };
      box(earth, (SOTO_BRIDGE.a[0] + SOTO_BRIDGE.b[0]) / 2, bridgeY - .12, GATE.z, SOTO_BRIDGE.b[0] - SOTO_BRIDGE.a[0], .24, SOTO_BRIDGE.w);
      for (let i = 0; i < HON_APPROACH_Z - HON_Z + 6; i++) {
        const az = HON_APPROACH_Z - i, bz = az - 1;
        const ya = W.heightAt(HON_ENTRY_X, az) + .06, yb = W.heightAt(HON_ENTRY_X, bz) + .06;
        box(stone, HON_ENTRY_X, (ya + yb) / 2 - .12, (az + bz) / 2, 6, .24, 1);
        addRamp({ ax: HON_ENTRY_X, az, bx: HON_ENTRY_X, bz, w: 6, ya, yb, step: .25 });
      }
      const wx = HON_X + 1, wz = HON_CENTER_Z + 4, wy = W.heightAt(wx, wz);
      // 木枠の井戸は中央を空け、井桁の上は入れない。足の当たりも井桁と同じ大きさ。
      for (const q of [-1, 1]) {
        box(wood, wx + q * .65, wy + .38, wz, .18, .76, 1.5);
        box(wood, wx, wy + .38, wz + q * .65, 1.5, .76, .18);
        box(wood, wx + q * .75, wy + 1.1, wz, .12, 2.2, .12);
      }
      box(wood, wx, wy + 2.2, wz, 1.7, .16, .16);
      box(earth, wx, wy + .03, wz, 1.1, .06, 1.1);
      solidCircle(wx, wz, .85);
      for (const [x, z, w] of [[15, HON_N - 20, 1.2], [18, HON_N - 16, .9], [14, HON_N - 23, .7]]) {
        const g = ARI_ROCK.clone(); g.scale(w, w * .6, w * .8); g.translate(x, W.heightAt(x, z) + w * .2, z); stone.push(g); solidCircle(x, z, w * .6);
      }
      for (const [parts, mat] of [[stone, ARI_STONE], [earth, ARI_EARTH], [wood, ARI_WOOD]]) {
        const g = mergeGeometries(parts), mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = true; mesh.castShadow = true; rt.scene.add(mesh);
        for (const part of parts) part.dispose();
      }
    }
    // ---- 滝川一益の手（自分の持ち場）と先手の一組 ----
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益の手', anchor: { x: GATE.x - 20, z: GATE.z }, facing: Math.PI / 2, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], ODA));
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', name: '滝川の先手', anchor: { x: GATE.x - 26, z: GATE.z + 12 }, facing: Math.PI / 2, width: 6, aggro: 10, },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川の組頭', hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { flag: 'oda' }));
    F.kuriU = F.kuri.units[0];
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の射手', anchor: { x: GATE.x - 34, z: GATE.z - 10 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 10 }, dress([{ type: 'gun', n: 4 }], ODA));
    F.oda = [F.taki, F.kuri, F.tgun];
    for (const g of F.oda) g.noAI = true;
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.noRout = false; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: GATE.x - 46, z: GATE.z }, Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：合図を待つ間に、滝川の手が竹束を押し立て、ゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, { items: [{ g: F.taki, yose: { x: GATE.x - 12, z: GATE.z }, until: () => F.step >= 1 }], avoid: [this.spawn, { x: GATE.x - 30, z: GATE.z + 5 }] });
    rt.after(3, () => { if (F.step === 0) { F.taki.order = 'move'; F.taki.dest = { x: GATE.x - 12, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: GATE.x - 12, z: GATE.z }; }; } });
    // 先手は本人の踏み込みを待たず、合図で進む。
    // 縄張り（castle_plan.js）：壁は今まで通り手組み（skipWalls）。惣構えの内を町屋・侍町・主郭の場に分け、
    // siege_zones.js の区域で、取った所から次が開く流れとして持つ（HUD・任務の進み具合に使う）
    F.C = buildCastlePlan(rt, ARIOKA_BATTLE_PLAN, { ladders: false, baseHeight: height, edgeW: 3, skipWalls: ['hiyodori', 'kishi', 'joro', 'machiya', 'samuraimachi', 'honmaru'] });
    // 三砦の区域を実際の囲いへ合わせる。西の上ろう塚だけが内応で移る。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hiyodori', name: '鵯塚砦', test: F.C.kuruwa.hiyodori.test, pos: F.C.kuruwa.hiyodori.centroid, need: 999, hold: 999 },
        { id: 'kishi', name: '岸の砦', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 999, hold: 999 },
        { id: 'joro', name: '上ろう塚砦', test: F.C.kuruwa.joro.test, pos: F.C.kuruwa.joro.centroid, need: 4, hold: 8 },
        { id: 'machiya', name: '町屋', test: F.C.kuruwa.machiya.test, pos: F.C.kuruwa.machiya.centroid, need: 6, hold: 10 },
        { id: 'samuraimachi', name: '侍町', test: F.C.kuruwa.samuraimachi.test, pos: F.C.kuruwa.samuraimachi.centroid, need: 6, hold: 10 },
        { id: 'honmaru', name: '主郭', test: F.C.kuruwa.honmaru.test, pos: F.C.kuruwa.honmaru.centroid, need: 999, hold: 999 },
      ],
      links: [['hiyodori', 'machiya'], ['kishi', 'machiya'], ['joro', 'machiya'], ['machiya', 'samuraimachi'], ['samuraimachi', 'honmaru']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・堀・道の数の表。読むだけで、戦の動きは変えない ----
    // 門の実体を置いた後で、縄張りの状態へ結ぶ。
    // 遠くの砦の占領状態を常時知らせない。岸の撤退はこの任務で時限処理しない。

    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    for (const [x, z, k] of [[CAMP.x - 14, CAMP.z - 10, 'oda'], [CAMP.x + 20, CAMP.z - 10, 'eiraku'], [CAMP.x - 30, GATE.z + 40, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（この口の攻め手 滝川一益）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '滝川一益', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 0, runTo: { x: GATE.x - 20, z: GATE.z } });
    // 主郭の狭い庭へ十六メートルの陣幕を重ねず、館の城将と庭の旗本に分ける。人数は従来のまま。
    const castleLord = enemyGroup(rt, { fixed: true, name: '荒木久左衛門の本陣', anchor: { x: TENSHU_POS.x, z: TENSHU_POS.z + 1 }, width: 1, facing: 0, aggro: 4, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '荒木久左衛門', invuln: true, hat: 'kabuto_m', haori: 0x3a2e2a } }], ARAKI));
    const castleGuard = enemyGroup(rt, { fixed: true, name: '主郭の旗本', anchor: { x: HON_X, z: HON_Z - 5 }, width: 6, facing: 0, aggro: 14, morale: 100, formation: 'line' },
      dress([{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 4 }], ARAKI));
    castleLord.noAI = true; castleGuard.noAI = true;
    F.honjin.guard.noAI = true;
    if (F.honjin.general) F.honjin.general.group.noAI = true;
    F.ehon = { general: castleLord.units[0], guard: castleGuard, pos: { x: TENSHU_POS.x, z: TENSHU_POS.z } };
    F.jinHosts = buildSonae(rt, this.jinkei);
    prepareDefenders(rt);
    F.hongate = rt.army.addStruct({ seg: [HON_GAP[0], HON_Z, HON_GAP[1], HON_Z], nx: 0, nz: 1, hp: 1e9, team: 1, name: '主郭の閉じた木戸' });
    F.hongate.noTarget = true;
    // 開門で当たりを外しても、扉は壊れていない。縄張りには「開く」と伝える。
    F.gateStatus = { struct: { hp: 1e9, maxHp: 1e9, alive: true }, get opened() { return F.step >= 1; } };
    F.K = makeNawabari(rt, F.C, { SZ: F.SZ, team: 1, friendTeam: 0, gates: { gate: F.gateStatus, hongap: F.hongate } }); rt.nawabari = F.K;
    F.honDoor = tobira(W, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0);
    rt.scene.add(F.honDoor);
    F.aid = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の後詰', anchor: { x: CAMP.x - 14, z: GATE.z }, facing: Math.PI / 2, order: 'hold', width: 10, formation: 'yari', aggro: 8 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ODA));
    // 二組の後詰は初めから陣に置き、段ごとに道を歩かせる。倒れた兵は戻さない。
    // 身分で増える組の兵も含め、後から来る供の余地を残して二百五十人以内にする。
    const soldiers = rt.army.units.reduce((n, u) => n + (!u.isStruct && u.type !== 'dummy' && u.type !== 'porter' ? 1 : 0), 0);
    const reserveSize = Math.min(8, Math.max(0, Math.floor((244 - soldiers) / 2)));
    F.reserves = reserveSize ? [0, 1].map((i) => allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の控え',
      anchor: { x: CAMP.x - 24 - i * 8, z: GATE.z + 10 }, facing: Math.PI / 2,
      order: 'hold', width: 6, formation: 'yari', aggro: 8 }, dress([{ type: 'ashigaru', n: reserveSize }], ODA))) : [];
    for (const g of F.reserves) g.noAI = true;
    const c = enemyGroup(rt, { fixed: true, name: '町の者', anchor: { x: TOWN_X - 32, z: -57 }, width: 5, aggro: 0, morale: 100, fleeDir: { x: 0, z: -1 }, speed: 2.4 }, [{ type: 'porter', n: 6, o: { flag: null, hat: 'none', mon: null } }]);
    c.civ = true; for (const u of c.units) { u.noTarget = true; u.dmg = 0; } F.civs.push(c);
    // 惣構えの前に詰める織田の仕寄せの列と、その篝火（見た目だけ。起こさない）：夜の土塁を前に、味方の厚みと行く先の明かり
    for (const [x, z, s, k] of [[-24, WALL_Z + 22, 15790, 'oda'], [26, WALL_Z + 23, 15791, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 45, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), host: false, flagRate: 0.18, banners: 2, seed: s }).army.noWake = true;
    for (const x of [-26, -12, 14, 28]) { const z = WALL_Z + 12; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    for (const [x, z] of [[CAMP.x - 30, GATE.z + 35], [CAMP.x + 20, GATE.z + 39], [CAMP.x, GATE.z + 45]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    // 月夜のまま、土と草の違い・軒の灯りを読める明るさにする。
    applyLook(rt, { ...NIGHT, hI: 0.65, sunI: 0.3 }); W.lookDark = true;
    ariStreetDress(rt);
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '手の者をそろえ、滝川の合図を待て' : '滝川の陣で合図を待て', 'main');
    rt.say('滝川の組頭', `${nm(rt)}、中西新八郎が味方に付いたぞ。合図で続け`, 4);
    rt.after(4.5, () => { if (F.step === 0 && !F.ending) rt.say('滝川の組頭', '狙うは木戸の先の辻じゃ。本丸へは進むな', 4); });
    ariMark(rt, 'taki', unitPos(F.kuriU), '組頭のもと');
    rt.after(10, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    torideFall(rt, 'joro', '上ろう塚砦', false);
    F.joroFlag.visible = false; F.joroOdaFlag.visible = true;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.userData.open();
    sfx('wood', 0.9); rt.after(1, () => sfx('horagai', 1));
    rt.banner('上ろう塚に内応', '中西新八郎らが滝川勢を引き入れた。木戸から続け');
    rt.obj('main', '先手に続き、木戸の先の敵を退けよ', 'main');
    ariMark(rt, 'turn', () => rt.player.u.pos.x < GATE.x + 8 ? GATE : F.g1.anchor,
      () => rt.player.u.pos.x < GATE.x + 8 ? '上ろう塚の木戸' : '木戸の先の敵');
    rt.after(6, () => { if (!F.ending && !rt.over) rt.say('滝川の組頭', '木戸が開いたぞ！　馬を抑え、先手の後から入れ', 4); });
    F.taki.formation = 'column'; F.taki.colW = 2;
    F.taki.order = 'move'; F.taki.dest = { x: GATE.x + 30, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'yari'; g.onArrive = null; }; F.taki.seekRange = 35;
    kakoiEvent.campRaided(F.kakoi, 0);   // 内応の夜討ち：守りの士気が落ちる
    // 長い斬り合いに、滝川の後詰が加わる（救いの手。B086）
    rt.after(18, () => this.sendAid(rt));
    // 村重はこの夜より前に尼崎へ移っている。今夜の脱出としては描かない。
    rt.after(50, () => { if (!F.ending) rt.say('滝川の組頭', '村重は尼崎じゃ。本丸の兵はまだ抗うぞ', 4); });
    F.kuri.formation = 'column'; F.kuri.colW = 2;
    F.kuri.order = 'move'; F.kuri.dest = { x: GATE.x + 28, z: GATE.z + 4 }; F.kuri.onArrive = (g) => { g.order = 'hold'; g.formation = 'yari'; };
    rt.after(14, () => { if (!F.ending && F.step === 1 && !F.dpOn) rt.say('滝川の組頭', '二列で通れ。押されたら槍を向けて退け', 4); });
    F.tgun.noAI = true; F.tgun.formation = 'column'; F.tgun.colW = 2;
    F.tgun.order = 'move'; F.tgun.dest = { x: GATE.x + 6, z: GATE.z - 10 };
    F.tgun.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'line'; g.onArrive = null; };
    F.g1.order = 'move'; F.g1.aggro = 16; F.g1.formation = 'column'; F.g1.colW = 2;
    F.g1.dest = { x: GATE.x + 10, z: GATE.z };
    F.g1.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.onArrive = null; };
    // 先手が入る間は射撃を待つ。開門を飛ばしても出陣の時計で猶予を残す。
    rt.after(Math.max(0, 25 - rt.t), () => {
      if (F.ending || rt.over) return;
      F.g1.fire = true;
      for (const g of F.wallG) { g.aggro = 20; g.fire = true; }
    });
    // 侍町への火は、城下へ進む段の下知で付ける。
  },

  sendAid(rt) {
    const F = rt.flags;
    if (F.aidSent || F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.dpOn || ariSpent(F.aid)) return;
    F.aidSent = true;
    const g = F.aid; g.noAI = true; g.formation = 'column'; g.colW = 2;
    g.path = null; g.focus = null; g.order = 'move'; g.dest = { x: GATE.x + 10, z: GATE.z + 8 };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = 'yari'; q.onArrive = null; };
    sfx('horagai', 0.7);
    rt.say('滝川の組頭', '後詰、木戸へ入れ！　先手の背を固めよ', 3.5);
  },

  // 段を重ねる：城下の辻へ攻め入り、奪った木戸で反撃を受ける。
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which] || F.ending) return;
    F['dp' + which] = true;

    F.dpOn = true; rt.objRemove('dp');
    rt.obj('main', which === 'A' ? '城下の辻へ進み、敵を崩せ' : '奪った木戸の口を固めよ', 'main');
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); if (!F.ending) then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.unmark('ariCover'); rt.objRemove('ariCover');
    rt.setPhase('end');
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.obj('main', '惣構えの木戸を押さえた', 'main'); rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '惣構えに入り、木戸を押さえた', pts: 20 }; }, '任務達成・惣構えの木戸を押さえた');
    sfx('horagai', 0.6);
    rt.banner('木戸を守り抜いた', '木戸は織田方の手に。本丸の囲みは続く');
    rt.say('滝川の組頭', `${nm(rt)}、見事じゃ。手の者をそろえ、陣へ戻れ`, 4);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 8);
  },

  lose(rt, reason) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.unmark('ariCover'); rt.objRemove('ariCover');
    if (F.dp) F.dp.on = false;
    F.dpOn = false; rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.setPhase('end'); rt.obj('main', '惣構えの攻めを果たせず', 'main'); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('惣構えの攻めを果たせず', reason);
    rt.say('滝川の組頭', `${reason}。これまでじゃ。木戸の外へ退け`, 5);
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: reason }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    retreatGateTick(rt);
    if (F.K) F.K.tick(dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    if (!F.coverTaught && (rt.aimedT || 0) > 0) {
      F.coverTaught = true; F.coverUntil = rt.t + 8; F.gunResumeAt = rt.t + 6;
      const p = rt.player.u.pos;
      F.coverAt = p.x < GATE.x + 1
        ? { x: GATE.x - 12, z: GATE.z + (p.z < GATE.z ? -9 : 9) }
        : p.x < TOWN_X - 24
          ? { x: TORIDE_WORKS[1].x1 - 1.8, z: GATE.z + (p.z < GATE.z ? -10 : 10) }
          : { x: TOWN_X + 5, z: -14 };
      rt.obj('ariCover', '矢印の鉄砲から、柵の陰へ退け', 'side');
      rt.marker('ariCover', F.coverAt, '柵の陰へ退く');
      rt.say('滝川の組頭', '矢印の方から鉄砲じゃ。柵の陰へ横に退け', 4);
      const paused = [];
      for (const g of F.defenders.values()) if (g.fire !== false) { paused.push(g); g.fire = false; }
      rt.after(6, () => { for (const g of paused) g.fire = true; });
    }
    if (F.coverUntil && (rt.t >= F.coverUntil || rt.distTo(F.coverAt) < 3)) {
      if (rt.distTo(F.coverAt) < 3) { rt.objDone('ariCover'); rt.bark('ここなら柵が盾になる。組と進め'); }
      rt.unmark('ariCover'); rt.objRemove('ariCover'); F.coverUntil = 0;
    }
    if (F.farRout && rt.t >= (F.farRoutT || 0)) {
      F.farRout = false; F.farRoutT = rt.t + 20;
      rt.say('伝令', '別口の敵は退き申した。木戸は渡すなとの下知にござる', 3);
    }
    if (F.TA) F.TA.tick(dt);
    if (F.FI) F.FI.tick();
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    // 先手の損害を見て、初めからいる後詰に下知する。
    if (F.step === 1 && !F.dpOn && !F.aidSent && !(F.aidCheckAt > rt.t)) {
      F.aidCheckAt = rt.t + 0.5;
      let able = 0;
      for (const u of F.taki.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) able++;
      if (ariSpent(F.kuri) || able <= 11) this.sendAid(rt);
    }
    if (F.civsFled && !F.evacSeen) {
      for (const g of F.civs) for (const u of g.units) {
        if (!u.alive || u.pos.x > GATE.x - 12 || Math.abs(u.pos.z - GATE.z) > 5 || rt.distTo(u.pos) > 45 || rt.army.wallBetween(rt.player.u.pos, -1, u.pos)) continue;
        F.evacSeen = true; rt.objDone('evac');
        rt.award((t) => t.side.push('町の者が避難するのを見届けた'), '町の者の避難を見届けた'); break;
      }
    }
    if (F.dpOn) { depthTick(rt, dt); return; }
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    if (F.step === 1) {
      if (guide) rt.objProgress('main', gone(F.g1)
        ? '敵は退いた。城下の辻へ進め'
        : rt.t - F.stepT >= 150 ? '組と木戸の先の敵を急ぎ崩せ'
          : '組と進み、木戸の先の敵を崩せ');
      if (gone(F.g1)) {
        rt.unmark('g1');
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        // 主任務は木戸の防衛が済んで初めて達成。
        this.deep(rt, 'A', () => this.deep(rt, 'C', () => this.win(rt)));
      } else if (rt.t - F.stepT > 180) this.lose(rt, '木戸の先の敵が崩れぬ');
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t < (rt.flags.routSayT || 0)) return;
    const c = g.center();
    if (Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) > 35 ||
        rt.army.wallBetween(rt.player.u.pos, -1, { x: c.x, y: rt.world.heightAt(c.x, c.z), z: c.z })) {
      rt.flags.farRout = true; return;
    }
    rt.flags.routSayT = rt.t + 9;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が逃げよった！`, 2.5);
  },
};

// 岸・上ろう塚砦：別働の織田勢が惣構えの外から攻め落とす遠景の出来事（kaito 10/1「三砦も攻め落とせる区域に」）
function torideFall(rt, id, name, message) {
  const F = rt.flags;
  if (F.ending || !F.SZ) return;
  const z = F.SZ.byId[id];
  if (!z || z.owner === ZONE_STATE.FRIEND) return;
  z.owner = ZONE_STATE.FRIEND; z.fallen = true;
  if (message !== false) rt.bark(message || `別手の織田勢が${name}を取った`);
  // 内応は全城兵を一律に弱らせない。
}

// 全て準備時に配置する。合図では既存の組へ行き先を渡すだけ。
function prepareDefenders(rt) {
  const F = rt.flags;
  F.defenders = new Map();
  const add = (sp, at = sp.from) => {
    const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: sp.name,
      anchor: at, facing: Math.PI * 1.5, order: 'hold', width: sp.kind === 'gun' ? 10 : 12,
      formation: sp.formation || 'yari', aggro: 8, morale: sp.morale ?? 85,
      fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(sp.list, ARAKI));
    g.fire = false;
    g.noAI = true; // 控えは下知まで持ち場を守り、勝手に木戸へ出ない。
    F.defenders.set(sp.name, g);
    return g;
  };
  F.g1 = add({ name: '木戸の荒木勢', from: { x: GATE.x + 36, z: GATE.z }, list: [uS(2), uA(10), uG(2)] });
  F.wallG = [-8, 8].map((offset) => add({ name: offset < 0 ? '木戸の北の射手' : '木戸の南の射手', from: { x: GATE.x + 42, z: GATE.z + offset },
    list: [uG(2), { type: 'bow', n: 2 }], kind: 'gun', formation: 'line' }));
  F.g1.fire = false;
  for (const g of F.wallG) g.fire = false;
  const positions = [
    { x: -16, z: GATE.z + 22 }, { x: 22, z: -30 }, { x: -46, z: -4 }, { x: 10, z: -72 },
    { x: -22, z: -96 }, { x: -48, z: -136 }, { x: -30, z: -118 }, { x: -12, z: -148 },
  ].map((p) => ({ x: TOWN_X + p.x, z: p.z }));
  let i = 0;
  for (const step of [...ariA(), ...ariC()]) {
    if (!step.ariOrders) continue;
    for (const order of step.ariOrders) for (const sp of order.foes(rt, {})) add(sp, positions[i++]);
  }
}

const ariSpent = (g) => !g || gone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
function sendAriFriends(rt, at, hold) {
  let i = 0;
  for (const g of [...rt.flags.oda, rt.flags.aid, ...(rt.flags.committed || [])]) {
    if (ariSpent(g)) continue;
    const ranged = g === rt.flags.tgun;
    const offset = ranged ? 0 : i++ * 7;
    g.noAI = true; g.seekRange = 35; g.formation = 'column'; g.colW = 2;
    g.path = null; g.onArrive = null;
    g.order = 'move'; g.focus = null;
    // 木戸を守る列は西岸に置く。水堀の上へ横に広げない。
    g.dest = hold ? { x: at.x - (ranged ? 11 : 5), z: at.z + (ranged ? 0 : offset * .55 - 7) }
      : { x: at.x + (ranged ? -8 : offset - 7), z: at.z + (ranged ? 14 : 3) };
    g.onArrive = (q) => { q.order = hold || ranged ? 'hold' : 'attack'; q.formation = ranged ? 'line' : 'yari'; if (hold) q.facing = Math.PI / 2; q.onArrive = null; };
  }
}
function ariStage(o, defending) {
  const orders = defending ? o.waves : [{ t: 0, foes: o.foes }, ...o.later];
  return {
    kind: defending ? 'hold' : 'fight', max: defending ? o.dur + 60 : o.max,
    ariOrders: orders,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.orders = orders.slice(); C.inT = 0; C.lostT = 0; C.lastOrderT = -8;
      C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
      C.botRadius = o.r || 16; C.scanAt = 0; C.enemy = 0; C.friend = 0;
      rt.banner(o.title, o.sub); rt.objRemove('main'); rt.obj('dp', o.obj(rt), 'main');
      ariMark(rt, 'dp', () => gateWay(rt.army, rt.player.u, C.at),
        () => defending ? '木戸の持ち場' : C.arrived ? '辻を守る' : '城下の辻へ進む');
      const reserve = rt.flags.reserves[defending ? 1 : 0];
      if (!ariSpent(reserve)) {
        (rt.flags.committed || (rt.flags.committed = [])).push(reserve);
        rt.bark('後詰が続く。組と持ち場を固めよ');
      }
      if (defending) rt.zone('dp', o.at.x, o.at.z, o.r);
      sendAriFriends(rt, o.at, defending);
      for (const [who, words, dur] of o.say || []) rt.say(who, words, dur || 4);
    },
    tick(rt, C, m, ctx, el, dt) {
      if (rt.flags.ending) return false;
      // 時間切れや木戸の陥落は、この段で理由を示して終える。
      if (el > (defending ? o.dur + 60 : o.max)) { C.timeout = true; return true; }
      while (C.orders.length) {
        const order = C.orders[0];
        if (el < order.t && !(C.groups.every(ariSpent) && el - C.lastOrderT >= 8)) break;
        // 前の寄せが厚い間は次の隊を控えさせ、同時に押し寄せる数を抑える。
        let fighting = 0;
        for (const g of C.groups) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) fighting++;
        if (fighting > 20) break;
        C.orders.shift(); C.lastOrderT = el;
        if (order.say) rt.say(order.say[0], order.say[1], 4);
        for (const sp of order.foes(rt, m)) {
          const g = rt.flags.defenders.get(sp.name); if (ariSpent(g)) continue;
          g.noAI = true; g.fire = !(rt.flags.gunResumeAt > rt.t); g.focus = null; g.path = null;
          if (!g.fire) rt.after(rt.flags.gunResumeAt - rt.t, () => { g.fire = true; });
          g.order = 'move'; g.seekRange = 35;
          g.formation = 'column'; g.colW = 2;
          g.dest = { x: C.at.x, z: C.at.z };
          if (sp.morale !== undefined) g.morale = Math.min(g.morale, sp.morale);
          g.facing = Math.atan2(C.at.x - g.anchor.x, C.at.z - g.anchor.z);
          g.onArrive = (q) => { q.order = 'hold'; q.formation = sp.formation || 'yari'; if (defending) q.facing = -Math.PI / 2; };
          g.aggro = 16;
          C.groups.push(g);
        }
      }
      const p = rt.player.u.pos;
      if (rt.t >= C.scanAt) {
        C.scanAt = rt.t + 0.25; C.enemy = 0; C.friend = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.civ) continue;
          if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (o.r || 16)) continue;
          if (Math.abs(u.pos.y - C.post.y) > 3 || rt.army.wallBetween(u.pos, -1, C.post)) continue;
          if (u.team === 0) C.friend++; else C.enemy++;
        }
      }
      const enemy = C.enemy, friend = C.friend;
      const present = Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16);
      if (!defending && present && !C.arrived) {
        C.arrived = true;
        ariMark(rt, 'dp', C.at, '辻を守る');
        rt.obj('dp', o.obj(rt), 'main');
      }
      const secure = present && friend > 1 && friend > enemy && enemy <= 2;
      const lastRepelled = !C.orders.length && C.groups.every(ariSpent);
      C.inT = secure ? C.inT + dt : Math.max(0, C.inT - dt);
      if (!defending) {
        // 全滅を求めず、一つの辻を組と十二秒確保すれば次の下知へ。
        C.goal = C.at;
        if (rt.t >= (C.guideAt || 0)) {
          C.guideAt = rt.t + 0.5;
          rt.objProgress('dp', !present ? '組と辻の印へ進め' : secure
            ? `辻を固めよ。あと${Math.max(0, Math.ceil(12 - C.inT))}秒` : '辻の敵を退け、組を集めよ');
        }
        return C.inT >= 12;
      }
      C.lostT = enemy > friend ? C.lostT + dt : 0;
      // 敵が上回る状態が続いた時だけ、木戸を失ったとする。
      if (C.lostT >= 24) { C.failed = true; return true; }
      if (rt.t < (C.guideAt || 0)) return (lastRepelled || el >= o.dur) && C.inT >= 12;
      C.guideAt = rt.t + 0.5;
      rt.objProgress('dp', (!present ? '木戸の口へ戻れ'
        : C.lostT > 0 ? '木戸の敵を急ぎ押し返せ'
          : enemy ? '組と木戸の敵を押し返せ'
            : friend <= 1 ? '木戸の口に味方を集めよ'
            : !C.groups.every(ariSpent) ? '木戸で組と敵を迎え撃て'
            : C.orders.length ? '木戸で槍をそろえ、新手に備えよ'
              : '木戸で組と槍をそろえよ') +
        (el >= o.dur + 30 ? '。急げ' : ''));
      return (lastRepelled || el >= o.dur) && C.inT >= 12;
    },
    end(rt, C, m) {
      const won = !C.timeout && !C.failed && !rt.flags.ending;
      rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      if (won) {
        // 取った辻の守りは退き、未出動の控えは主郭の守りに残る。
        if (!defending) for (const g of C.groups) if (!ariSpent(g)) { g.noRout = false; g.morale = 0; }
        rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward);
      }
      else rt.objFail('dp');
      if (!won) m.ariFailure = C.failed ? '敵に木戸を奪われた'
        : defending ? '木戸の守りが整わぬ。寄せを引くぞ'
          : '辻を取れぬ。寄せを引くぞ';
      o.onEnd(rt, m, won);
    },
  };
}
function ariFight(o) { return ariStage(o, false); }
function ariHold(o) { return ariStage(o, true); }
// 下知と隊の立て直し。待つだけでは手当てを消費せず、傷も戻さない。
function rest(o) {
  return {
    kind: 'rest', max: o.dur + 1,
    start(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
      if (o.at) {
        C.at = o.at; C.goal = o.at;
        ariMark(rt, 'dp', () => gateWay(rt.army, rt.player.u, C.at), o.hold ? '木戸へ戻る' : '城下の辻へ進む');
        rt.obj('main', o.hold ? '組と木戸の外へ戻り、口を守れ' : '組と城下の辻へ進め', 'main');
        sendAriFriends(rt, o.at, !!o.hold);
      }
      if (o.bark) rt.bark(o.bark);
      let wait = 0.5;
      for (const [who, words, dur] of o.say || []) {
        rt.after(wait, () => { if (!rt.flags.ending) rt.say(who, words, dur || 4); });
        wait += (dur || 4) + 0.3;
      }
      if (o.fn) o.fn(rt, m);
    },
    tick(rt, C, m, ctx, el) { return el >= o.dur; },
  };
}

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 城攻めの夜：荒木勢は惣構えの内の辻ごとに固まり、侍町の控えが道を歩いて木戸へ進む。新しく兵を作らない
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, kind: 'gun', dmg: 1, ...o });
function ariCtx(rt) {
  const F = rt.flags;
  return { routeFight: true, botSeek: 60, botAttackOrders: true, backing: false,
    friends: () => [F.taki, F.kuri, F.aid, ...(F.committed || [])].filter((g) => g && g.count && !g.routed), botSteer: wallSteer };
}
// 塀と木戸脇の篝火を避ける。口へは塀に沿って回り、正面から通る。
function wallSteer(b, inp) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u;
  // 道案内が選んだ短い歩みを八メートル先まで延ばすと、次の堀へ誤って回り直す。
  if (p._botGoToT === b.t && Math.abs(p.yaw - p._botGoToYaw) < 0.001) return;
  const goal = u._ariLook || (u._ariLook = { x: 0, z: 0 });
  goal.x = u.pos.x + Math.sin(p.yaw) * 8; goal.z = u.pos.z + Math.cos(p.yaw) * 8;
  const q = gateWay(b.army, u, goal);
  if (q === goal) return;
  // 構えは正面だけに効く。塀を回る歩みで打ち手への向きを変えない。
  if (inp.guardHold) {
    const dx = q.x - u.pos.x, dz = q.z - u.pos.z;
    const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
    const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
    inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  if (p.lock) inp.e.add('KeyQ');
  inp.leftPressed = false; inp.chargeHold = false;
  p.yaw = Math.atan2(q.x - u.pos.x, q.z - u.pos.z);
}
// A 砦を取った後：滝川の下知で侍町へ進み、辻の敵を崩す。
function ariA() {
  const at = { x: TOWN_X - 2, z: -14 };
  return [
    rest({ dur: 4, at, say: [['滝川の組頭', '足並みをそろえよ。次は辻を取るぞ']] }),
    rest({ dur: 3, at, say: [['滝川の組頭', '侍町に火をかけよ。町の者は追うな']], fn: (rt, m) => { m.fire = true; burnSpread(rt, rt.flags.houses[16]); burnSpread(rt, rt.flags.houses[12]); rt.flags.houses.filter((h) => h.samurai).forEach((h, k) => rt.after(1 + k * 15, () => { if (!rt.flags.ending) burnSpread(rt, h); })); } }),
    ariFight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: (rt) => (HI(rt) ? '手の者と辻を十二秒押さえよ' : '組と辻を十二秒押さえよ'),
      say: [['滝川の組頭', '塀を盾に進め。町屋の鉄砲衆を先に崩せ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: TOWN_X - 10, z: -40 }, list: [uS(2), uA(8)], morale: m.fire ? 60 : 90 }, gunLine('町屋の陰の鉄砲', { x: TOWN_X + 22, z: -30 }, 4, {})],
      later: [
        { t: 18, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来よった！　横槍だがや！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -SOKAKU_X + 10, z: -4 }, list: [uS(2), uA(7)], morale: m.fire ? 65 : 90 }] },
        { t: 36, say: ['滝川の組頭', '侍町から新手じゃ！　辻を渡すでない！'], foes: (rt, m) => [{ name: '侍町から出る新手', from: { x: TOWN_X + 10, z: -66 }, list: [uS(3), uA(7)], morale: m.fire ? 70 : 95 }] },
      ],
      max: 180, reward: '城下の辻を押し通った',
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '辻の敵が崩れぬ'); } }),
  ];
}
// C 城下へ入った後：木戸を奪い返しに来る荒木勢を、木戸の口で防ぐ
function ariC() {
  const at = { x: GATE.x - 9, z: GATE.z };
  return [
    rest({ dur: 7, at, hold: true, say: [['滝川の組頭', '敵の狙いは木戸じゃ。手の者と戻れ'], ['滝川の組頭', '木戸の外で槍をそろえよ', 3]] }),
    ariHold({ at, dur: 88, r: 13, title: '木戸の口', sub: '荒木勢が木戸を奪い返しに押し寄せる', label: '上ろう塚の木戸', obj: (rt) => (HI(rt) ? '手の者を並べ、木戸への寄せを防げ' : '木戸の口で荒木勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '来よった！　町から押し寄せるぞ！'], foes: () => [{ name: '木戸へ寄せる荒木勢', from: { x: TOWN_X, z: -10 }, list: [uS(3), uA(9)] }] },
        { t: 18, say: ['滝川の組頭', '鉄砲衆じゃ！　木戸脇の土塁を盾にせよ！'], foes: () => [gunLine('町の内の鉄砲衆', { x: TOWN_X - 18, z: TOWN_SOUTH_Z - 4 }, 4, {})] },
        { t: 36, say: ['足軽', '東からも来よったぞ！'], foes: () => [{ name: '道から来る荒木勢', from: { x: TOWN_X + 40, z: TOWN_SOUTH_Z - 6 }, list: [uS(2), uA(7)] }] },
        { t: 54, title: '最後の寄せ', sub: '城の控えが木戸へ進む', say: ['足軽', '城の控えだがや！　木戸は渡さんぞ！'], foes: () => [{ name: '荒木久左衛門の手', from: { x: TOWN_X + 12, z: -30 }, list: [uS(4), uA(8)] }] },
      ],
      reward: '木戸の口を守り抜いた', lost: ['滝川の組頭', '押し込まれたか……後詰を出せ！'],
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '木戸を守りきれぬ'); } }),
  ];
}

// 両軍の総勢（有岡城を囲む織田勢 五万ほど、城に残った荒木勢 三千とも。数には諸説ある）
arioka.force = (rt) => {
  const F = rt.flags;
  return { a: 50000, a0: 50000, b: 3000, b0: 3000 }; // 総勢の目安。木戸の死傷を全軍から引かない。
};
arioka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '荒木軍', mon: 'maru' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 渡辺勘大夫は岸の砦を退いた後に処刑されたと公記にある。この夜の討取り相手にはしない。
arioka.famous = [];
arioka.date = () => '天正七年十月十五日　冬・夜（復元）';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) arioka.open(rt); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った黒田官兵衛（孝高。小寺家の家老で、羽柴秀吉のもとで働いていた）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重はわずかな供と城を抜けて尼崎城へ移った。十月十五日、城の中から織田方に内応する者が出て、滝川一益らが惣構えの内へ攻め入った。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は救い出されたが（救い出された日には諸説ある）、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋の絵はまだ無いので、ここでは丸の旗で代えている。この戦では十月の惣構えへの攻めと木戸の確保までを扱い、本丸の開城や官兵衛の救出を同じ夜に重ねない。内応は上ろう塚で起きたと公記は記す。操作する木戸は西の上ろう塚に置く。三砦の細かな位置と城下の道は推定で、鵯塚の内応とはしない。辻の反撃と各隊の細かな位置は復元で、人数は目安である。公記の十月十五日の条に時刻や天気の記述はなく、夜の場面は復元である。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 素直な遊び手：木戸から入り、辻で戦い、奪った木戸を守る
arioka.botBrain = (b, inp, o) => { ariBot(b, inp, o); wallSteer(b, inp); };
arioka.botSteer = wallSteer;
// 負けて退く時も、惣構えと水堀は木戸の土橋から抜ける。
// 殿の向きだけで退き先を決めると、城下の塀や堀に突き当たり追手に捕まる。
arioka.botWithdraw = (b, inp, { goTo }) => {
  goTo(b.player, inp, CAMP.x, CAMP.z, 3);
};
function ariBot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn) {
    if (F.dp?.cur?.failed) { goTo(p, inp, CAMP.x, CAMP.z, 3); return; }
    depthBot(b, inp, goTo); return;
  }
  // 退避と手当ては共通の頭で先に判断済み。ここで深手だけを見て構えを
  // 解くと、敵のいる滝川の前列へ戻り、六秒の安全な待ち時間を作れない。
  b.botRest = false;
  // 塀越しに近い敵を狙って動かなくなる不具合の直し：塀が間にある敵は「見えていない」扱いにする
  // （木戸を開けた直後、まだ塀の外にいるのに塀の内の敵へ向き直って突き続け、一撃も当たらないまま突進しない事があった。kaito 9/30）
  // 構えを解いている半秒の間は、届く相手を保って突きまでつなぐ。
  let e = strikeTarget(b, 12);
  // 近い敵を追う間も、横から実際に打ち込む兵を先に受ける。
  let ad = 10;
  for (const t of b.army.threats || []) {
    if (!t.alive || t.fleeing || t.noTarget || t.type === 'gun' || t.type === 'bow' ||
        Math.abs(t.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, t.pos)) continue;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d < ad) { e = t; ad = d; }
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 構えたまま突くと短い払いになり、槍の間合いでは届かない。
    // 受けた後に構えを解き、突きが出せる間を待って反撃する。
    patientStrike(p, inp, e, d);
    const g = b.squadGroups[0];
    // 遠い敵への突撃は「移動」を経る。同じ号令を二秒後に重ねると取り消しになる。
    if (F.step === 1 && g?.count && g.order !== 'attack' &&
        !(g.order === 'move' && p.lastCmd?.id === 'attack') && !(b.botCmdT > b.t)) {
      inp.e.add('KeyC'); b.botCmdT = b.t + 4.5;
    }
    return;
  }
  inp.guardHold = false;
  if (b.squadGroups[0]?.order === 'attack' && !(b.botCmdT > b.t)) {
    inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
  }
  if (F.step === 1) { const c = gone(F.g1) ? GATE : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }

}

export { arioka };

// 当日の細かな時刻・天気・各備えの人数と町割りは復元。
arioka.history += ' 城の復元は伊丹市の解説と遺構をもとに、主郭の人工の堀を西と南に置いた。三砦の内側の囲いと兵舎・蔵、主郭の番所・長屋・館・井戸、寺の堂と庭、屋根の姿、村と田の位置は当時の摂津の作りからの推定である。 城に残る人数は公記に三千ともある。囲み五万は包囲全体の目安で、この木戸の兵数ではない。総大将の信忠は局地の木戸には置かず、この口の滝川の陣と主郭の荒木久左衛門を描く。内応口は西の上ろう塚へ合わせたが、木戸の寸法・道と家並み・夜の明るさや天気・局地の反撃は推定である。岸の砦の撤退と鵯塚の抗戦はこの木戸の防衛任務に重ねない。';

arioka.history += ' 城兵の退き道と、門番が追手の離れた時に門を開ける段取り、町の者が西の木戸から避難する道は推定である。';
