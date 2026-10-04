// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。内応で開いた木戸から入り、侍町へ進み、奪った口を守る。
// 向き：北は -z、東は +x。主郭は中央〜東寄り。西に滝川の陣。
// ======================================================================
import { nobori, hut, yagura, campfire, kabukimon, tawara, dobei, ishigaki, yaguramon, sumiyagura, kagaribi, tamon, tobira, makeKitBatch, finalizeKitBatch, dorui, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_GATE_BREAK } from './battle_events.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, dress, gone as groupGone, burnHouse } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeKakoi, kakoiEvent } from './kakoi.js';
import { demBlend } from './dem.js';
import { horiboriHeight, mizubori, dobashi, goten } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, patchGunCover } from './taketaba.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { makeNawabari } from './nawabari.js';
import {
  WALL_Z, GATE, SOTO_MOAT, SOTO_MOAT_SEGS, SOTO_BRIDGE,
  ROU, CAMP, HON_ISHIGAKI_SEGS, HON_MOAT, HON_MOAT_SEGS, TENSHU_POS,
  HON_W, HON_E, HON_N, HON_Z, HON_X, HON_CENTER_Z, HON_GAP, HON_ENTRY_X,
  SOKAKU_X, SOKAKU_N, KISHI_TORIDE, JORO_TORIDE, HON_W_MOAT, HON_W_MOAT_SEGS,
  ARIOKA_PLAN, MACHIYA_Z,
} from './castles/arioka.js';
const ARIOKA_BATTLE_PLAN = ARIOKA_PLAN;
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
// 岸は渡辺勘大夫、鵯塚は野村丹後。細かな持ち場と人数は推定。荒木の旗・紋は丸の代用（既存の表示）。
const ARIOKA_ATTACK = sonaePlan('惣構えの囲み', 0, { x: CAMP.x, z: CAMP.z + 4 }, Math.PI, [
  ['honjin', '本陣', '織田信忠', 20000, -120, SOKAKU_N - 80, Math.PI / 2, 'oda', 'oda'],
  ['takijin', '西の攻め口の陣', '滝川一益', 5000, CAMP.x, CAMP.z + 4, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '南の仕寄り', '滝川一益の配下', 5000, -36, 70, Math.PI, 'takigawa', 'takigawa', 90, 30, 14],
  ['niwa', '西の付城の控え', '丹羽長秀', 10000, -92, -58, Math.PI / 2, 'sujikai', 'sujikai', 70, 20, 16],
  ['north', '北の付城の控え', '名は伝わらない', 10000, -24, SOKAKU_N - 24, 0, 'oda', 'oda', 70, 28, 14],
]);
const ARIOKA_DEFEND = sonaePlan('三砦と主郭の守り', 1, { x: HON_X - 2, z: HON_CENTER_Z - 6 }, 0, [
  ['honjin', '本陣', '荒木久左衛門', 1200, HON_X - 2, HON_CENTER_Z - 6, 0, 'maru', 'maru'],
  ['kishi', '岸の砦', '渡辺勘大夫', 500, 20, SOKAKU_N + 26, 0, 'maru', 'maru', 70, 28, 14],
  ['joro', '上ろう塚砦', '中西新八郎ら', 300, JORO_TORIDE.x + 12, JORO_TORIDE.z, -Math.PI / 2, 'maru', 'maru', 0, 8, 10],
  ['hiyodori', '鵯塚砦', '野村丹後', 600, 28, WALL_Z - 10, 0, 'maru', 'maru', 35, 18, 10],
  ['town', '侍町の控え', '荒木久左衛門の配下', 400, -26, -76, 0, 'maru', 'maru', 0, 8, 6],
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
// 塀と堀を直線で横切らず、手前で道の中央へ寄り、口を抜けてから行き先へ向かう。
// 兵と試し役が同じ道を使う。曲がり角の入れ物は一人につき一つを使い回す。
function gateWay(army, u, goal) {
  const p = u.pos;
  // 西の塀・堀を越える時は、上ろう塚の木戸と土橋へそろえる。
  const outward = goal.x < p.x;
  for (let i = 0; i < 2; i++) {
    const moat = outward ? i === 1 : i === 0;
    const x = GATE.x - (moat ? 5 : 0);
    // 堀や塀の中心線を越えても、体が口から出るまでは真っすぐ進む。
    const nearBank = !moat && Math.abs(goal.x - x) >= 0.5 && Math.abs(goal.x - x) < 1.5;
    const onBridge = Math.abs(p.z - GATE.z) <= 1.5 && Math.abs(p.x - x) < (moat ? 4.5 : 1.5) &&
      (!moat || Math.abs(p.x - goal.x) > 0.1) &&
      (Math.abs(goal.x - x) >= (moat ? 4 : 1.5) || (nearBank && Math.abs(p.x - goal.x) > 0.1));
    if ((p.x - x) * (goal.x - x) >= 0 && !onBridge) continue;
    if (Math.abs(p.z - GATE.z) <= 1.5 && Math.abs(goal.z - GATE.z) <= 1.5) continue;
    const side = onBridge ? (outward ? 1 : -1) : p.x > x ? 1 : -1;
    // 塀の西へ回る足場は堀の外岸。五メートル西では堀の底へ案内してしまう。
    const margin = moat ? 6 : side < 0 ? (p.x > GATE.x - 1 ? 0.75 : 12) : 5;
    const q = u._ariWay || (u._ariWay = { x: 0, z: 0 });
    if (Math.abs(p.z - GATE.z) > 1.5) {
      q.x = x + side * margin;
      q.z = Math.abs(p.x - x) < margin - 0.5 ? p.z : GATE.z;
    } else { q.x = moat ? x - side * margin : nearBank ? goal.x : GATE.x + (side > 0 ? -12 : 5); q.z = GATE.z; }
    return q;
  }
  return goal;
}
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
  // 六甲の山は城下に盛らない。伊丹段丘の平地を保つ。
  // 水堀（惣構えの木戸の外・本丸の石垣の手前）
  for (const f of MOAT_FNS) h += f(x, z);
  return h;
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
  if (!F.fireGuide) { F.fireGuide = true; rt.bark('侍町へ火が広がった。燃える家を避け、南の町の辻と木戸を結ぶ道を使え'); }
  if (!F.civsFled) {
    F.civsFled = true; rt.obj('evac', '町の者の逃げる道を空けよ。追うな', 'side');
    for (const c of F.civs) {
      c.noAI = true; c.march = true; c.formation = 'column'; c.colW = 2;
      c.order = 'path'; c.pathIdx = 0;
      c.path = [[-24, GATE.z], [GATE.x + 6, GATE.z], [GATE.x - 10, GATE.z], [CAMP.x, GATE.z]];
      c.onArrive = (g) => { g.order = 'hold'; g.march = false; };
    }
  }
}

const arioka = {
  jinkei: [ARIOKA_ATTACK, ARIOKA_DEFEND],
  botOrders: true, // 木戸と城下は、この戦の下知に従う。
  noTaisho: true, // 信忠の本陣は局地の範囲外。共通処理で木戸前へ出さない。
  noWake: true, // 城下の段で出す兵だけが戦う。遠景と自動増援は重ねない。
  spawn: { x: GATE.x - 22, z: GATE.z, heading: Math.PI / 2 },
  world: {
    seed: 15791, moveLim: 260,
    time: 'night',
    winter: true,
    wind: [0.4, 1],
    muddy: 0.1,
    paths: [[[GATE.x - 50, GATE.z], [GATE.x, GATE.z], [-24, GATE.z], [-12, -70], [0, -14]], [[-12, -70], [HON_ENTRY_X, HON_Z + 14], [HON_ENTRY_X, HON_Z - 6]]],
    height,
    moveWay: gateWay,
    // 遠くの使番も同じ木戸へ回す。姿を出す前から塀と堀に詰まらせない。
    runnerWay: gateWay,
    // 東の低地に猪名川。南へ下り、尼崎へ向かう（遠景）。
    streams: [{ pts: [[148, -260], [153, -60], [146, 60], [151, 180]], w: 11, depth: 1.3 }],
    clear: (x, z) => (Math.abs(x) < SOKAKU_X + 5 && z > SOKAKU_N - 15 && z < 130) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45),
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => ((Math.abs(x) < SOKAKU_X + 10 && z > SOKAKU_N - 20 && z < 140) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45) ? 0.05 : 0.6),
    groves: [{ x: 50, z: -20, r: 10, n: 10 }, { x: -60, z: 40, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && x > HON_W && x < HON_E && z > HON_N && z < HON_Z,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.civs = [];
    rt._rfN = 3; // 共通の自動救援は使わず、初めから後詰を置く。
    // 長い包囲（kakoi.js）：荒木村重は一年近く籠もり、兵糧と士気は細っている。夜討ちの結果で動く
    F.kakoi = makeKakoi({ day: 300, foodDays: 25, morale: 55 });
    flReset();   // 床の層（石垣の上・水堀の土橋）を、この戦の分で作り直す
    // ---- 惣構えの柵（西の上ろう塚の木戸が内応で開く） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // 塀（百枚近く）と城の建物は材質ごとに一つの形へまとめて描く（一枚ずつだと描く回数が五百を越え、携帯で重かった）
    const KB = makeKitBatch();
    noT(wallLine(rt, [[-SOKAKU_X, WALL_Z], [SOKAKU_X, WALL_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1, batch: KB } }));
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3.5, GATE.x, GATE.z + 3.5], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '上ろう塚の木戸' });
    F.gate.noTarget = true;
    const dm = tobira(W, GATE.x, GATE.z, 7.0, Math.PI / 2);   // 閉じた扉（破られると根元から倒れる）
    F.door = dm;
    // 木戸の上に渡櫓（櫓門）。両脇の隅に二重の櫓（A4）
    rt.scene.add(dm); yaguramon(W, GATE.x, GATE.z, 7.4, Math.PI / 2, { doors: false, batch: KB }); sumiyagura(W, -30, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB }); sumiyagura(W, 34, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB });
    // 惣構えの水堀（木戸の正面だけ切って、土橋で渡す。docs/castle-design.md 1-4・5-2）
    for (const pts of SOTO_MOAT_SEGS) mizubori(rt, pts, { depth: SOTO_MOAT.depth, width: SOTO_MOAT.width });
    dobashi(rt, SOTO_BRIDGE.a, SOTO_BRIDGE.b, SOTO_BRIDGE.w, { name: '惣構えの土橋' });
    for (const [x, z] of [[GATE.x - 3, GATE.z - 7], [GATE.x - 3, GATE.z + 7]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 惣構え全体の囲い（東西約800m・南北約1,700mを縮尺。四方を閉じ、開くのは西の上ろう塚の木戸だけ） ----
    // 南の塀は東西の土塁につなぎ、木戸以外に隙間を残さない。
    noT(wallLine(rt, [[-SOKAKU_X, WALL_Z], [-SOKAKU_X, GATE.z + 3.5]], { team: 1, hp: 1e9, name: '惣構えの土塁（西）', segLen: 8, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[-SOKAKU_X, GATE.z - 3.5], [-SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（西）', segLen: 8, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[SOKAKU_X, WALL_Z], [SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（東）', segLen: 8, mesh: dobei, meshOpt: { hikae: 1, batch: KB } }));
    noT(wallLine(rt, [[-SOKAKU_X, SOKAKU_N], [SOKAKU_X, SOKAKU_N]], { team: 1, hp: 1e9, name: '惣構えの土塁（岸の砦）', segLen: 8, mesh: dobei, meshOpt: { hikae: 1, batch: KB } }));
    // 惣構えの土塁：塀の外へ盛った土の斜面（見た目だけ。一つの形にまとめる。木戸の前は空ける）と、四隅の隅櫓、町の木戸（大通りの町境）
    {
      const db = makeSimpleBatch();
      for (const [seg, nx, nz] of [[[-SOKAKU_X, WALL_Z, -6, WALL_Z], 0, 1], [[6, WALL_Z, SOKAKU_X, WALL_Z], 0, 1], [[-SOKAKU_X, WALL_Z, -SOKAKU_X, GATE.z + 6], -1, 0], [[-SOKAKU_X, GATE.z - 6, -SOKAKU_X, SOKAKU_N], -1, 0], [[SOKAKU_X, WALL_Z, SOKAKU_X, SOKAKU_N], 1, 0], [[-SOKAKU_X, SOKAKU_N, SOKAKU_X, SOKAKU_N], 0, -1]]) {
        const d = dorui(W, seg, nx, nz, { batch: db, w: 3, h: 0.9 });
        if (!d.isBatchedPart) rt.scene.add(d);
      }
      finalizeSimpleBatch(rt, db);
      for (const [x, z] of [[-SOKAKU_X + 4, WALL_Z - 4], [SOKAKU_X - 4, WALL_Z - 4], [-SOKAKU_X + 4, SOKAKU_N + 4], [SOKAKU_X - 4, SOKAKU_N + 4]]) sumiyagura(W, x, z, { rot: 0, w: 6, d: 5, base: 1.2, batch: KB });
      rt.scene.add(kabukimon(W, 0, MACHIYA_Z[1], 7, 0, { doors: false }));   // 町屋と侍町の境の木戸（開いたまま。通れる）
    }
    // 三砦（北＝岸の砦・西＝上ろう塚砦・南＝鵯塚砦）。物見の櫓と旗で目印を置く（HIST_B）
    rt.scene.add(yagura(W, KISHI_TORIDE.x, KISHI_TORIDE.z + 5), nobori(W, KISHI_TORIDE.x + 4, KISHI_TORIDE.z + 3, 'maru', 6));
    rt.scene.add(yagura(W, JORO_TORIDE.x + 5, JORO_TORIDE.z - 12));
    F.joroFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'maru', 6); rt.scene.add(F.joroFlag);
    F.joroOdaFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'oda', 6); F.joroOdaFlag.visible = false; rt.scene.add(F.joroOdaFlag);
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    // 南寄り（木戸に近い）が町屋、北寄り（本丸に近い）が侍町。道は細く、家は密集させる（GAME_C）
    // 城下に松明（敵の居所が見える。主郭の館からも城下の灯が見える。B079・B080）
    for (const [x, z] of [[-14, -12], [14, -14], [-30, -44], [30, -46], [0, -58], [ROU.x - 5, ROU.z + 4], [HON_E - 3, HON_Z - 3], [TENSHU_POS.x, TENSHU_POS.z + 4]]) W.addFire(x, z, { torch: true, h: 1.6 });
    F.houses = [
      [-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2],
      [-48, -16, 0.15], [36, -20, -0.1], [-18, -40, 0.1], [50, -50, 0.2], [-44, -62, -0.15],
    ].map(([x, z, r], i) => {
      // 放火される侍町は既存の閉じた小屋を保つ。町屋三軒には通り庭と奥の間を設ける。
      const open = i < 3;
      const m = open ? goten(rt, x, z, { w: 7, d: 5, rot: r, team: 1, tile: false, naka: true, noTarget: true, kind: 'machiya', profile: 'arioka', name: '町屋', doorX: 0 }).mesh
        : hut(W, x, z, 7, 5, r, { wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      if (!open) rt.scene.add(m);
      return { x, z, m, samurai: z <= -46 };
    });
    rt.scene.add(hut(W, HON_W + 7, HON_N + 6, 8, 5, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }), yagura(W, HON_E - 3, HON_Z - 4));
    // 本丸：台地の縁に野面積みの石垣（牢へ上る道は空ける）と、石垣の上に館（確かな姿の分からない三重天守は置かない）
    for (const [a, b] of HON_ISHIGAKI_SEGS) ishigaki(W, [a, b], { kind: 'nozura', top: 0.1, minH: 2.6, batch: KB });
    // 本丸の水堀（石垣の手前・町側。道の口＝HON_GAP はそのまま地続きで、水に入らず上がれる）
    for (const pts of HON_MOAT_SEGS) mizubori(rt, pts, { depth: HON_MOAT.depth, width: HON_MOAT.width });
    // 本丸の西の堀（ほかの三面と同じ幅・深さ）
    for (const pts of HON_W_MOAT_SEGS) mizubori(rt, pts, { depth: HON_W_MOAT.depth, width: HON_W_MOAT.width });
    // 十月の攻めでは本丸は持ちこたえる。館を作るだけで開城や救出の筋は進めない。
    goten(rt, TENSHU_POS.x, TENSHU_POS.z, { w: 8, d: 5, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', name: '本丸の館' });
    tamon(W, [HON_W + 2, HON_N + 1, HON_E - 2, HON_N + 1], { out: -1, batch: KB });   // 本丸の北の縁を囲う多聞櫓
    finalizeKitBatch(rt, KB);   // 塀・櫓門・隅櫓・石垣・多聞をまとめて描く
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
    F.taki = allyGroup(rt, { fixed: true, name: '滝川一益の手', anchor: { x: GATE.x - 20, z: GATE.z }, facing: Math.PI / 2, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], ODA));
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { fixed: true, formation: 'yari', name: '滝川の先手', anchor: { x: GATE.x - 26, z: GATE.z + 12 }, facing: Math.PI / 2, width: 6, aggro: 10, },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川の組頭', hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { flag: 'oda' }));
    F.kuriU = F.kuri.units[0];
    F.tgun = allyGroup(rt, { fixed: true, name: '滝川の射手', anchor: { x: GATE.x - 34, z: GATE.z - 10 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 10 }, dress([{ type: 'gun', n: 4 }], ODA));
    F.oda = [F.taki, F.kuri, F.tgun];
    for (const g of F.oda) g.noAI = true;
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.noRout = false; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: GATE.x - 30, z: GATE.z }, Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：合図を待つ間に、滝川の手が竹束を押し立て、ゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, { items: [{ g: F.taki, yose: { x: GATE.x - 12, z: GATE.z }, until: () => F.step >= 1 }], avoid: [this.spawn, { x: GATE.x - 30, z: GATE.z + 5 }] });
    rt.after(3, () => { if (F.step === 0) { F.taki.order = 'move'; F.taki.dest = { x: GATE.x - 12, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: GATE.x - 12, z: GATE.z }; }; } });
    // 先手は本人の踏み込みを待たず、合図で進む。
    // 縄張り（castle_plan.js）：壁は今まで通り手組み（skipWalls）。惣構えの内を町屋・侍町・主郭の場に分け、
    // siege_zones.js の区域で、取った所から次が開く流れとして持つ（HUD・任務の進み具合に使う）
    F.C = buildCastlePlan(rt, ARIOKA_BATTLE_PLAN, { ladders: false, baseHeight: height, edgeW: 3, skipWalls: ['hiyodori', 'kishi', 'joro', 'machiya', 'samuraimachi', 'honmaru'] });
    // 三つの砦（岸・上ろう塚・鵯塚）も区域に。上ろう塚＝①で実際に戦う木戸の口（位置は復元）。
    // 岸は別働の織田勢の攻め、上ろう塚は内応で移る遠景の砦。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hiyodori', name: '上ろう塚の木戸', test: F.C.kuruwa.hiyodori.test, pos: F.C.kuruwa.hiyodori.centroid, need: 4, hold: 8 },
        { id: 'kishi', name: '岸の砦', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 999, hold: 999 },
        { id: 'joro', name: '上ろう塚砦', test: F.C.kuruwa.joro.test, pos: F.C.kuruwa.joro.centroid, need: 999, hold: 999 },
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
    for (const [x, z, k] of [[-14, CAMP.z - 10, 'oda'], [20, CAMP.z - 10, 'eiraku'], [-30, 80, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（この口の攻め手 滝川一益）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '滝川一益', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 0, runTo: { x: GATE.x - 20, z: GATE.z } });
    F.ehon = camp(rt, { x: HON_X - 2, z: HON_CENTER_Z - 6, facing: 0, team: 1, faction: 'saito', mon: 'maru', armor: 0x2e2a26, general: { name: '荒木久左衛門', hat: 'kabuto_m', haori: 0x3a2e2a }, guard: 15, reserve: 0, runTo: { x: HON_ENTRY_X, z: HON_Z - 5 } });
    F.jinHosts = buildSonae(rt, this.jinkei);
    prepareDefenders(rt);
    F.hongate = rt.army.addStruct({ seg: [HON_GAP[0], HON_Z, HON_GAP[1], HON_Z], nx: 0, nz: 1, hp: 1e9, team: 1, name: '主郭の閉じた木戸' });
    F.hongate.noTarget = true;
    // 開門で当たりを外しても、扉は壊れていない。縄張りには「開く」と伝える。
    F.gateStatus = { struct: { hp: 1e9, maxHp: 1e9, alive: true }, get opened() { return F.step >= 1; } };
    F.K = makeNawabari(rt, F.C, { SZ: F.SZ, team: 1, friendTeam: 0, gates: { gate: F.gateStatus, hongap: F.hongate } }); rt.nawabari = F.K;
    rt.scene.add(tobira(W, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0));
    F.aid = allyGroup(rt, { fixed: true, name: '滝川の後詰', anchor: { x: CAMP.x - 14, z: GATE.z }, facing: Math.PI / 2, order: 'hold', width: 10, formation: 'yari', aggro: 8 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ODA));
    const c = enemyGroup(rt, { fixed: true, name: '町の者', anchor: { x: -32, z: -57 }, width: 5, aggro: 0, morale: 100, fleeDir: { x: 0, z: -1 }, speed: 2.4 }, [{ type: 'porter', n: 6, o: { flag: null, hat: 'none', mon: null } }]);
    c.civ = true; for (const u of c.units) { u.noTarget = true; u.dmg = 0; } F.civs.push(c);
    // 惣構えの前に詰める織田の仕寄せの列と、その篝火（見た目だけ。起こさない）：夜の土塁を前に、味方の厚みと行く先の明かり
    for (const [x, z, s, k] of [[-24, WALL_Z + 22, 15790, 'oda'], [26, WALL_Z + 23, 15791, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 45, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const x of [-26, -12, 14, 28]) { const z = WALL_Z + 12; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    for (const [x, z] of [[-30, 60], [30, 64], [0, 86]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    // 城下の町屋と塀の陰は月明かりだけではほぼ黒になる（見回り 10/2）。月と空の明かりを少し強めた夜に
    applyLook(rt, { ...NIGHT, hI: 0.12, sunI: 0.08 }); W.lookDark = true;
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、滝川一益の合図を待て' : '滝川一益のもとで、合図を待て', 'main');
    rt.say('滝川の組頭', `${nm(rt)}、上ろう塚に内応が出る。上ろう塚の木戸から続き、惣構えの内へ入るぞ`, 5);
    rt.say('滝川の組頭', '木戸から入ったら、町の辻を押さえる。本丸へは勝手に進むな', 4.5);
    rt.marker('taki', unitPos(F.kuriU), '組頭のもと', {});
    rt.after(15, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    torideFall(rt, 'joro', '上ろう塚砦', '上ろう塚の内応で、滝川の先手が入った');
    F.joroFlag.visible = false; F.joroOdaFlag.visible = true;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.userData.open();
    sfx('wood', 0.9); rt.after(1, () => sfx('horagai', 1));
    rt.banner('上ろう塚に内応', '滝川の先手が入った。上ろう塚の木戸から城下へ続け');
    battleEvent(rt, EVENT_GATE_BREAK, GATE, F.taki, 0, true, '上ろう塚の内応で先手が町へ入った');
    rt.obj('main', HI(rt) ? '手の者を率いて木戸から攻め入り、砦の兵を退けよ' : '開いた木戸から攻め入り、砦の兵を退けよ', 'main');
    rt.say('滝川の組頭', 'かかれ！　声を上げよ、城じゅうに内応が出たと思わせよ！', 3.5);
    F.taki.formation = 'column'; F.taki.colW = 2;
    F.taki.order = 'move'; F.taki.dest = { x: GATE.x + 14, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'yari'; g.onArrive = null; }; F.taki.seekRange = 35;
    kakoiEvent.campRaided(F.kakoi, 0);   // 内応の夜討ち：守りの士気が落ちる
    // 長い斬り合いに、滝川の後詰が加わる（救いの手。B086）
    rt.after(110, () => this.sendAid(rt));
    // 村重はこの夜より前に尼崎へ移っている。今夜の脱出としては描かない。
    rt.after(50, () => { if (!F.ending) rt.say('滝川の組頭', '村重はすでに尼崎へ移った。本丸にはまだ守りがいるぞ', 4); });
    F.kuri.formation = 'column'; F.kuri.colW = 2;
    F.kuri.order = 'move'; F.kuri.dest = { x: GATE.x + 6, z: GATE.z + 10 }; F.kuri.onArrive = (g) => { g.order = 'hold'; g.formation = 'yari'; };
    rt.say('滝川の組頭', '木戸の口は縦の列で通れ。横を突かれたら構え、木戸の外の土塁へ下がれ', 4);
    F.tgun.noAI = true; F.tgun.formation = 'column'; F.tgun.colW = 2;
    F.tgun.order = 'move'; F.tgun.dest = { x: GATE.x + 6, z: GATE.z - 10 };
    F.tgun.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'line'; g.onArrive = null; };
    F.g1.order = 'hold'; F.g1.aggro = 16;
    for (const g of F.wallG) { g.aggro = 20; g.fire = true; }
    rt.marker('g1', centerOf(F.g1), '上ろう塚の守り', { red: true, group: F.g1 });
    // 侍町への火は、城下へ進む段の下知で付ける。
  },

  sendAid(rt) {
    const F = rt.flags;
    if (F.aidSent || F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.dpOn || ariSpent(F.aid)) return;
    F.aidSent = true;
    const g = F.aid; g.noAI = true; g.formation = 'column'; g.colW = 2;
    g.path = null; g.focus = null; g.order = 'move'; g.dest = { x: GATE.x + 10, z: GATE.z + 8 };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = 'yari'; q.onArrive = null; rt.marker('aid', q.anchor, '着いた後詰との合流口', { group: q }); };
    sfx('horagai', 0.7);
    rt.say('滝川の組頭', '後詰は同じ木戸へ続け！　先手の後ろを固めよ', 3.5);
  },

  // 段を重ねる：城下の辻へ攻め入り、奪った木戸で反撃を受ける。
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which] || F.ending) return;
    F['dp' + which] = true;

    F.dpOn = true;
    rt.obj('main', which === 'A' ? '城下の辻の敵を崩し、惣構えの内へ進め' : '奪った木戸の口を固めよ', 'main');
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); if (!F.ending) then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.obj('main', '惣構えの木戸を確保した', 'main'); rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '惣構えに入り、木戸を確保した', pts: 20 }; }, '任務達成・惣構えの木戸を確保した');
    sfx('horagai', 0.6);
    rt.banner('有岡城の惣構え、破れる', '本丸はなお持ちこたえる。奪った木戸を固めよ');
    rt.say('滝川の組頭', `${nm(rt)}、木戸を守れ。本丸の囲みはまだ続くぞ`, 4);
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  lose(rt, reason) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    if (F.dp) F.dp.on = false;
    F.dpOn = false; rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.setPhase('end'); rt.obj('main', '惣構えの攻めを果たせず', 'main'); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('惣構えの攻めを果たせず', reason);
    rt.say('滝川の組頭', `${reason}。組をそろえ、木戸の外へ退け`, 5);
    rt.player.u.invuln = true; rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    if (F.K) F.K.tick(dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    if (F.farRout && rt.t >= (F.farRoutT || 0)) {
      F.farRout = false; F.farRoutT = rt.t + 20;
      rt.say('伝令', '別の持ち場で敵が退きました。この木戸の守りは続いています', 3);
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
        if (!u.alive || !u.fleeing || u.pos.z >= -90 || rt.distTo(u.pos) > 45 || rt.army.wallBetween(rt.player.u.pos, -1, u.pos)) continue;
        F.evacSeen = true; rt.objDone('evac');
        rt.award((t) => t.side.push('町の者が避難するのを見届けた'), '町の者の避難を見届けた'); break;
      }
    }
    if (F.dpOn) { depthTick(rt, dt); return; }
    const p = rt.player.u.pos;
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    if (F.step === 1) {
      if (guide) rt.objProgress('main', gone(F.g1)
        ? '守りは崩れた。上ろう塚の木戸へ戻れ'
        : `組と槍をそろえ、上ろう塚の守りを崩せ。寄せを止めるまで ${Math.max(0, Math.ceil(180 - (rt.t - F.stepT)))}秒`);
      if (gone(F.g1) && Math.hypot(p.x - GATE.x, p.z - GATE.z) < 20) {
        rt.unmark('g1');
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        // 主任務は木戸の防衛が済んで初めて達成。
        this.deep(rt, 'A', () => this.deep(rt, 'C', () => this.win(rt)));
      } else if (rt.t - F.stepT > 180) this.lose(rt, '上ろう塚の守りを崩せず、寄せを止める');
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
  // 内応は全城兵を一律に弱らせない。
}

// 全て準備時に配置する。合図では既存の組へ行き先を渡すだけ。
function prepareDefenders(rt) {
  const F = rt.flags;
  F.defenders = new Map();
  const add = (sp, at = sp.from) => {
    const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: sp.name,
      anchor: at, facing: Math.PI * 1.5, order: 'hold', width: sp.kind === 'gun' ? 10 : 12,
      formation: sp.formation || 'yari', aggro: 8, morale: 85,
      fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(sp.list, ARAKI));
    F.defenders.set(sp.name, g);
    return g;
  };
  F.g1 = add({ name: '木戸の荒木勢', from: { x: GATE.x + 14, z: GATE.z }, list: [uS(2), uA(16), uG(2)] });
  F.wallG = [-16, 16].map((offset) => add({ name: offset < 0 ? '木戸の北の射手' : '木戸の南の射手', from: { x: GATE.x + 4, z: GATE.z + offset },
    list: [uG(3), { type: 'bow', n: 3 }], kind: 'gun', formation: 'line' }));
  const positions = [
    { x: -10, z: -40 }, { x: 22, z: -30 }, { x: -46, z: -4 }, { x: 10, z: -72 },
    { x: -22, z: -96 }, { x: -48, z: -136 }, { x: -30, z: -118 }, { x: -12, z: -148 },
  ];
  let i = 0;
  for (const step of [...ariA(), ...ariC()]) {
    if (!step.ariOrders) continue;
    for (const order of step.ariOrders) for (const sp of order.foes(rt, {})) add(sp, positions[i++]);
  }
}

const ariSpent = (g) => !g || gone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
function sendAriFriends(rt, at, hold) {
  let i = 0;
  for (const g of [...rt.flags.oda, rt.flags.aid]) {
    if (ariSpent(g)) continue;
    const ranged = g === rt.flags.tgun;
    const offset = ranged ? 0 : i++ * 7;
    g.noAI = true; g.seekRange = 35; g.formation = 'column'; g.colW = 2;
    g.path = null; g.onArrive = null;
    g.order = 'move'; g.focus = null;
    g.dest = { x: at.x + (ranged ? -8 : offset - 7), z: at.z + (ranged ? 14 : 3) };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = hold || ranged ? 'hold' : 'attack'; q.formation = ranged ? 'line' : 'yari'; q.onArrive = null; };
  }
}
function ariStage(o, defending) {
  const orders = defending ? o.waves : [{ t: 0, foes: o.foes }, ...o.later];
  return {
    kind: defending ? 'hold' : 'fight', max: defending ? o.dur + 60 : o.max,
    ariOrders: orders,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.orders = orders.slice(); C.inT = 0; C.lostT = 0;
      C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
      C.botRadius = o.r || 16; C.scanAt = 0; C.enemy = 0; C.friend = 0;
      rt.banner(o.title, o.sub); rt.objRemove('main'); rt.obj('dp', o.obj(rt), 'main');
      if (!defending) rt.marker('turn', { x: -24, z: GATE.z }, '木戸の内から町の辻へ', {});
      rt.marker('dp', o.at, defending ? '木戸の持ち場' : '城下の辻', {});
      if (defending) rt.zone('dp', o.at.x, o.at.z, o.r);
      sendAriFriends(rt, o.at, defending);
      for (const [who, words, dur] of o.say || []) rt.say(who, words, dur || 4);
    },
    tick(rt, C, m, ctx, el, dt) {
      if (rt.flags.ending) return false;
      for (let i = C.orders.length - 1; i >= 0; i--) {
        const order = C.orders[i]; if (el < order.t) continue;
        C.orders.splice(i, 1);
        if (order.say) rt.say(order.say[0], order.say[1], 4);
        for (const sp of order.foes(rt, m)) {
          const g = rt.flags.defenders.get(sp.name); if (ariSpent(g)) continue;
          g.noAI = true; g.focus = null; g.path = null;
          g.order = 'move'; g.seekRange = 35; g.dest = C.at;
          g.facing = Math.atan2(C.at.x - g.anchor.x, C.at.z - g.anchor.z);
          g.onArrive = (q) => { q.order = 'hold'; };
          g.aggro = 16;
          C.groups.push(g);
        }
      }
      const p = rt.player.u.pos;
      if (!defending) {
        const g = C.groups.find((q) => !ariSpent(q)); C.goal = g ? g.center() : C.at;
        rt.objProgress('dp', g ? '組と進み、辻の守りを崩せ'
          : C.orders.length ? '辻で組をそろえよ。次の寄せに備えよ' : '守りは崩れた。辻の印へ進め');
        return !C.orders.length && !g && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 20;
      }
      if (rt.t >= C.scanAt) {
        C.scanAt = rt.t + 0.25; C.enemy = 0; C.friend = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.civ) continue;
          if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > o.r) continue;
          if (Math.abs(u.pos.y - C.post.y) > 3 || rt.army.wallBetween(u.pos, -1, C.post)) continue;
          if (u.team === 0) C.friend++; else C.enemy++;
        }
      }
      const enemy = C.enemy, friend = C.friend;
      const present = Math.hypot(p.x - C.at.x, p.z - C.at.z) <= o.r;
      const secure = present && friend > 1 && enemy === 0;
      const lastRepelled = el >= o.dur && !C.orders.length && C.groups.every(ariSpent);
      C.supportT = present && friend > 1 ? (C.supportT || 0) + dt : (C.supportT || 0);
      C.inT = lastRepelled && secure ? C.inT + dt : 0;
      C.lostT = enemy > friend ? C.lostT + dt : 0;
      if (C.lostT >= 12) { C.failed = true; return true; }
      if (rt.t < (C.guideAt || 0)) return lastRepelled && C.inT >= 12;
      C.guideAt = rt.t + 0.5;
      const deadline = `。寄せを止めるまで ${Math.max(0, Math.ceil(o.dur + 60 - el))}秒`;
      rt.objProgress('dp', (!present ? '木戸の印へ戻れ'
        : C.lostT > 0 ? `木戸が押されている。敵を退けよ（退くまで ${Math.max(1, Math.ceil(12 - C.lostT))}秒）`
          : enemy ? '木戸に敵が入った。十二秒の確保を初めからやり直せ'
            : friend <= 1 ? '木戸の輪へ味方を集めよ。一人では口を固められぬ'
            : C.orders.length || el < o.dur ? `木戸で槍をそろえよ。次の下知まで ${Math.max(0, Math.ceil(o.dur - el))}秒`
              : `木戸を固めよ。あと ${Math.max(0, Math.ceil(12 - C.inT))}秒`) + deadline);
      return el >= o.dur && !C.orders.length && C.groups.every(ariSpent) && C.inT >= 12;
    },
    end(rt, C, m) {
      const won = !C.timeout && !C.failed && !rt.flags.ending;
      rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      if (won) { rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward); }
      else rt.objFail('dp');
      if (!won) m.ariFailure = C.failed ? '木戸へ敵に押し込まれた。次は組と口を守れ'
        : defending ? '木戸を固める前に寄せの限界が来た。敵を退けて口へ戻れ'
          : '辻を押さえる前に寄せの限界が来た。敵を退けて辻の印へ進め';
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
      rt.unmark('dp'); rt.unzone('dp');
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
    friends: () => [F.taki, F.kuri, F.aid].filter((g) => g && g.count && !g.routed), botSteer: wallSteer };
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
  const at = { x: -2, z: -14 };
  return [
    rest({ dur: 7, say: [['滝川の組頭', '木戸は開いた。町にはまだ守りがいる。組から離れるな'], ['滝川の組頭', '辻の敵を崩せ。組を失う前に、後詰と槍をそろえよ']] }),
    rest({ dur: 3, say: [['滝川の組頭', '滝川様の下知じゃ。侍町に火をかけ、辻へ進め！']], fn: (rt, m) => { m.fire = true; rt.flags.houses.filter((h) => h.samurai).forEach((h, k) => rt.after(1 + k * 15, () => { if (!rt.flags.ending) burnSpread(rt, h); })); } }),
    ariFight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: (rt) => (HI(rt) ? '手の者を率いて、城下の辻の荒木勢を崩せ' : '城下の辻の荒木勢を崩せ'),
      say: [['滝川の組頭', '町屋の陰の鉄砲を先に潰せ。撃たせたまま辻へ出れば、狙い撃ちじゃ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: -10, z: -40 }, list: [uS(2), uA(12)], morale: m.fire ? 60 : 90 }, gunLine('町屋の陰の鉄砲', { x: 22, z: -30 }, 6, {})],
      later: [
        { t: 34, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来る！　横を突かれるぞ！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -SOKAKU_X + 10, z: -4 }, list: [uS(2), uA(11)], morale: m.fire ? 65 : 90 }] },
        { t: 70, say: ['滝川の組頭', '侍町の控えが来るぞ！　木戸と辻を押さえろ！'], foes: (rt, m) => [{ name: '侍町から出る新手', from: { x: 10, z: -66 }, list: [uS(3), uA(12)], morale: m.fire ? 70 : 95 }] },
      ],
      max: 150, reward: '城下の辻を押し通った',
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '辻の守りを崩せず、寄せを止める'); } }),
  ];
}
// C 城下へ入った後：木戸を奪い返しに来る荒木勢を、木戸の口で防ぐ
function ariC() {
  const at = { x: GATE.x - 9, z: GATE.z };
  return [
    rest({ dur: 7, bark: '奪った木戸へ組を集め直せ', say: [ ['滝川の組頭', '……荒木の者が、木戸を奪い返しに来るぞ。ここで口を塞がれては、明日の攻めが立たぬ'], ['滝川の組頭', '木戸の外で槍をそろえよ。狭い口へ敵を詰まらせろ', 4.5]] }),
    ariHold({ at, dur: 88, r: 13, title: '木戸の口', sub: '荒木勢が木戸を奪い返しに押し寄せる', label: '上ろう塚の木戸', obj: (rt) => (HI(rt) ? '手の者を木戸の口に並べ、押し寄せる荒木勢を防げ' : '木戸の口で、押し寄せる荒木勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '来た！　町の中から、どっと押し寄せる！'], foes: () => [{ name: '木戸へ寄せる荒木勢', from: { x: 0, z: -10 }, list: [uS(3), uA(13)] }] },
        { t: 30, say: ['滝川の組頭', '塀の狭間に鉄砲が並んだ！　口の脇の土塁に寄れ！'], foes: () => [gunLine('塀の内の鉄砲衆', { x: -18, z: WALL_Z - 4 }, 6, {})] },
        { t: 46, say: ['足軽', '東の塀沿いから木戸へ来る！'], foes: () => [{ name: '塀沿いに来る荒木勢', from: { x: 40, z: WALL_Z - 6 }, list: [uS(2), uA(10)] }] },
        { t: 64, title: '最後の寄せ', sub: '城の控えが木戸へ進む', say: ['足軽', '城の控えが来た！　木戸を渡すな！'], foes: () => [{ name: '荒木久左衛門の手', from: { x: 12, z: -30 }, list: [uS(4), uA(12)] }] },
      ],
      reward: '木戸の口を守り抜いた', lost: ['滝川の組頭', '押し込まれたか……陣から後詰を出せ！'],
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '木戸の持ち場を守れなかった'); } }),
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
arioka.date = () => '天正七年十月十五日　冬・夜';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) arioka.open(rt); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った黒田官兵衛（孝高。小寺家の家老で、羽柴秀吉のもとで働いていた）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重はわずかな供と城を抜けて尼崎城へ移った。十月十五日、城の中から織田方に内応する者が出て、滝川一益らが惣構えの内へ攻め入った。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は救い出されたが（救い出された日には諸説ある）、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋の絵はまだ無いので、ここでは丸の旗で代えている。この戦では十月の惣構えへの攻めと木戸の確保までを扱い、本丸の開城や官兵衛の救出を同じ夜に重ねない。内応は上ろう塚で起きたと公記は記す。操作する木戸は西の上ろう塚に置く。三砦の細かな位置と城下の道は推定で、鵯塚の内応とはしない。辻の反撃と各隊の細かな位置は復元で、日付や人数には諸説ある。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

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
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
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
arioka.history += ' 城に残る人数は公記に三千ともある。囲み五万は包囲全体の目安で、この木戸の兵数ではない。総大将の信忠は局地の木戸には置かず、この口の滝川の陣と主郭の荒木久左衛門を描く。内応口は西の上ろう塚へ合わせたが、木戸の寸法・道と家並み・夜の明るさや天気・局地の反撃は推定である。岸の砦の撤退と鵯塚の降伏はこの木戸の防衛任務に重ねない。';
