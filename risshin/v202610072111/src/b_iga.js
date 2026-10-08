// ======================================================================
// 織田家編　天正伊賀の乱・比自山城（天正九年九月）
// 信長公記巻十四は九月三日の諸口侵攻を記す。比自山の夜討ち・攻めあぐね・退去は伊乱記の伝承で補う。
// 丹羽の一組で、夜討ちを退ける→南の土橋を押さえる→攻めあぐねて包囲へ→夜の出撃を止める→空城の曲輪を調べる。
// 比自山の退去日を佐奈具の九月十一日と混同しない。数・各隊の位置・時間配分は遊びの復元。
// 北（-z）に尾根の曲輪、南（+z）に大手と織田の陣。城域南北約350m・比高約150mを実寸で使う。
// ======================================================================
import { yamaLift, switchback } from './yamalift.js';
import { SOLIDS, nobori, hut, yagura, campfire, kabukimon, tawara, tobira } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos, ringWall } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { depthStart, depthTick, rest, move, depthBot } from './b_depth.js';
import { uS, uA, lines, camp } from './b_mid.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { HIJIYAMA_PLAN, SHU, KITA, KITASOTO, HIGASHI, OKU, KITAEND } from './castles/hijiyama.js';
import { demRelief } from './dem.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { battleEvent, EVENT_FIRE_START, EVENT_RETREAT, EVENT_UNIT_BREAK, EVENT_MESSENGER } from './battle_events.js';
let igDem = null;
import('./asset_dem_hijiyama.js').then((m) => { igDem = m.default; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CAMP = { x: 0, z: 40 };                     // 丹羽の陣
const FORT = { x: SHU.x, z: SHU.z, r: 18 };       // 比自山城・主郭（観音寺跡。口は南）
const NAGATA = { x: -150, z: -60 };               // 長田丸（伊賀衆を支える小城館・丘の上）
const ASAYA = { x: 160, z: -40 };                 // 朝屋丸（同上。山から下りた伊賀衆の連絡先）
import { jinkeiBuild } from './jinkei.js';
// 大手の道は南の土橋を必ず通り、曲輪の口と同じ中心線を使う。
const APPROACH = [...switchback([CAMP.x, CAMP.z], [0, -42], 6, 24), [0, -48], [0, -54], [4, -63], [0, SHU.z + 18]];
const RIDGE = [[0, SHU.z + 18], [0, SHU.z], [0, SHU.z - 18], [0, KITA.z + 11], [0, KITA.z - 11], [0, KITASOTO.z + 10], [0, KITASOTO.z - 10], [0, OKU.z + 14], [0, OKU.z - 14], [0, KITAEND.z + 10], [0, KITAEND.z - 10], [0, KITAEND.z - 37]];
const EAST = [[0, SHU.z], [18, SHU.z], [HIGASHI.x - 10, HIGASHI.z], [HIGASHI.x, HIGASHI.z]];
const ROAD = [...APPROACH, ...RIDGE.slice(1)];

// 坂を直線で横切らず、作った道の折れ目と曲輪の口を通る。
// 道の位置と次の一歩は兵ごとに使い回し、調べ直すのは短い間隔を置く。
function roadPoint(p, out) {
  out.d = Infinity;
  for (let i = 1; i < ROAD.length; i++) {
    const a = ROAD[i - 1], b = ROAD[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d < out.d) { out.x = x; out.z = z; out.d = d; out.s = i - 1 + t; }
  }
}
// 陣の小屋や焚き火の当たりは、塀の検査だけでは分からない。
// 準備時に作った角を使い、壁へ進んで押し戻される前に外側へ回る。
const CAMP_AXES = ['x', 'z'];
function campCross(a, b, box) {
  let lo = 0, hi = 1;
  for (const key of CAMP_AXES) {
    const d = b[key] - a[key], min = box[key + '0'] + 0.4, max = box[key + '1'] - 0.4;
    if (Math.abs(d) < 1e-8) { if (a[key] <= min || a[key] >= max) return false; }
    else {
      const t0 = (min - a[key]) / d, t1 = (max - a[key]) / d;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo >= hi) return false;
    }
  }
  return hi > 0 && lo < 1;
}
function igaCampWay(army, u, goal) {
  const boxes = army.igaCampBoxes;
  if (!boxes || u.pos.z < 10) return goal;
  const q = u._igaCampWay || (u._igaCampWay = { x: 0, z: 0, gx: 0, gz: 0, active: false, t: -1, next: null, end: { x: 0, z: 0 }, botRadius: 0.35 });
  // 兵の持ち場が小屋の中なら、今いる側の外縁へ寄せる。消火の中心印はそのまま使う。
  if (!u.isPlayer) for (const box of boxes) {
    if (goal.x <= box.x0 || goal.x >= box.x1 || goal.z <= box.z0 || goal.z >= box.z1) continue;
    const end = q.end; end.x = goal.x; end.z = goal.z;
    const left = Math.hypot(u.pos.x - box.x0, u.pos.z - goal.z), right = Math.hypot(u.pos.x - box.x1, u.pos.z - goal.z);
    const south = Math.hypot(u.pos.x - goal.x, u.pos.z - box.z0), north = Math.hypot(u.pos.x - goal.x, u.pos.z - box.z1);
    const nearest = Math.min(left, right, south, north);
    if (nearest === left) end.x = box.x0; else if (nearest === right) end.x = box.x1;
    else if (nearest === south) end.z = box.z0; else end.z = box.z1;
    goal = end;
  }
  const sameGoal = Math.hypot(goal.x - q.gx, goal.z - q.gz) < 0.75;
  // 古い角へ戻り続けたり、別の小屋に阻まれたまま待ったりしない。
  if (q.active && !(q.checkAt > army.time)) {
    if (Math.hypot(u.pos.x - (q.px ?? u.pos.x), u.pos.z - (q.pz ?? u.pos.z)) < 0.3) q.active = false;
    q.px = u.pos.x; q.pz = u.pos.z; q.checkAt = army.time + 1.5;
  }
  // 一つ目の角に着いたら、覚えておいた二つ目へ進む。同じ角を選び直さない。
  if (q.active && sameGoal && q.next && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) <= 0.8) {
    q.x = q.next.x; q.z = q.next.z; q.next = null;
  }
  if (q.active && sameGoal && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 0.8) return q;
  if (!q.active && q.t > army.time && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1) return goal;
  q.active = false; q.next = null; q.t = army.time + 0.35; q.gx = goal.x; q.gz = goal.z;
  for (const box of boxes) {
    // 消火の印は小屋の中心。外から水が届くので、中心を囲む角へは誘導しない。
    if (goal.x > box.x0 && goal.x < box.x1 && goal.z > box.z0 && goal.z < box.z1) continue;
    if (!campCross(u.pos, goal, box)) continue;
    // 壁の外でも、体の余裕を含む帯の中から歩き始めることがある。
    if (u.pos.x > box.x0 && u.pos.x < box.x1 && u.pos.z > box.z0 && u.pos.z < box.z1) {
      const left = u.pos.x - box.x0, right = box.x1 - u.pos.x, south = u.pos.z - box.z0, north = box.z1 - u.pos.z;
      const nearest = Math.min(left, right, south, north);
      q.x = u.pos.x; q.z = u.pos.z;
      if (nearest === left) q.x = box.x0; else if (nearest === right) q.x = box.x1;
      else if (nearest === south) q.z = box.z0; else q.z = box.z1;
      q.active = true; return q;
    }
    let best = Infinity, first = null, second = null;
    for (let i = 0; i < 4; i++) {
      const a = box.corners[i];
      if (boxes.some((ob) => campCross(u.pos, a, ob))) continue;
      const start = Math.hypot(a.x - u.pos.x, a.z - u.pos.z);
      for (let j = 0; j < 4; j++) {
        const b = box.corners[j];
        if (boxes.some((ob) => campCross(a, b, ob) || campCross(b, goal, ob))) continue;
        const length = start + Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(goal.x - b.x, goal.z - b.z);
        if (length < best) { best = length; first = a; second = b; }
      }
    }
    if (first) {
      // 既に着いた角を経由点にせず、出口側の角へ歩く。
      const atFirst = Math.hypot(first.x - u.pos.x, first.z - u.pos.z) <= 0.8;
      const point = atFirst ? second : first;
      q.x = point.x; q.z = point.z; q.next = !atFirst && second !== first ? second : null;
      q.active = true; return q;
    }
  }
  return goal;
}
function igaCombatSpace(army, u) {
  const p = u.pos;
  // 近い五人が前へ出て、後続は外側から味方の兵と戦う。全員で本人へ殺到させない。
  const player = army.playerUnit, front = army.igaFront;
  if (front && player?.alive && u.team !== player.team && !u.fleeing && !u.group?.routed && !u.group?.ambush) {
    if (army.igaFrontAt !== army.time) {
      army.igaFrontAt = army.time; front.length = 0;
      for (const o of army.units) {
        if (!o.alive || o.team === player.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct || o.group?.ambush || o.group?.routed) continue;
        o._igaPlayerD = Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z);
        if (o._igaPlayerD > 14) continue;
        let i = 0;
        while (i < front.length && front[i]._igaPlayerD <= o._igaPlayerD) i++;
        if (i < 5) {
          const end = Math.min(4, front.length);
          for (let j = end; j > i; j--) front[j] = front[j - 1];
          front[i] = o;
        }
      }
    }
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 12 && !front.includes(u) && (d < 8 || u.target === player || u.atk?.target === player)) {
      const q = u._igaWait || (u._igaWait = { x: 0, z: 0 });
      const a = d > 0.1 ? Math.atan2(dx, dz) : u.heading;
      q.x = player.pos.x + Math.sin(a) * 9; q.z = player.pos.z + Math.cos(a) * 9;
      return q;
    }
  }
  return null;
}
function igaWay(army, u, goal) {
  const p = u.pos;
  if (goal === u._igaWait) return igaCampWay(army, u, goal);
  const campGoal = igaCampWay(army, u, goal);
  if (campGoal !== goal) return campGoal;
  // 陣の中の迎撃や、東西の林の兵には山道の行軍を強いない。
  if (Math.min(p.z, goal.z) > -5 || Math.max(Math.abs(p.x), Math.abs(goal.x)) > 32 ||
      (u.target?.alive && Math.hypot(u.target.pos.x - p.x, u.target.pos.z - p.z) < 3) || Math.hypot(goal.x - p.x, goal.z - p.z) < 3) return goal;
  const q = u._igaWay || (u._igaWay = { x: 0, z: 0, t: -1, gx: 0, gz: 0, active: false, from: {}, to: {}, botRadius: 0.35 });
  if (q.t > army.time && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 2 &&
      (!q.active || Math.hypot(q.x - p.x, q.z - p.z) > 1)) return q.active ? q : goal;
  q.t = army.time + 0.35; q.gx = goal.x; q.gz = goal.z; q.active = false;
  roadPoint(p, q.from); roadPoint(goal, q.to);
  if (q.from.d > 20 || q.to.d > 20) return goal;
  q.active = true;
  if (q.from.d > 2.8) { q.x = q.from.x; q.z = q.from.z; return q; }
  const forward = q.to.s > q.from.s;
  let i = forward ? Math.floor(q.from.s) + 1 : Math.ceil(q.from.s) - 1;
  if (i >= 0 && i < ROAD.length && Math.hypot(ROAD[i][0] - p.x, ROAD[i][1] - p.z) < 1.2) i += forward ? 1 : -1;
  if (i < 0 || i >= ROAD.length || (forward ? i > q.to.s : i < q.to.s)) {
    q.active = false; return goal;
  }
  q.x = ROAD[i][0]; q.z = ROAD[i][1];
  return q;
}

function igaFleeWay(army, u, goal) {
  const path = u.group?.igaRetreat;
  if (!path?.length) return goal;
  const q = u._igaFlee || (u._igaFlee = { x: 0, z: 0, i: 0 });
  if (q.i >= path.length) return goal;
  while (q.i < path.length && Math.hypot(u.pos.x - path[q.i][0], u.pos.z - path[q.i][1]) < 2) q.i++;
  if (q.i >= path.length) return goal;
  q.x = path[q.i][0]; q.z = path[q.i][1];
  return q;
}

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
      flagRate: plan.team ? 0 : 0.15, kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = false;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記は侵攻の口、伊乱記・伊賀市の城跡資料は蒲生・堀・筒井の囲みを根拠とする。
// 北伊賀の土豪の曲輪別の将名・旗紋は確定せず、丸は見分けるための代用。
const IGA_ATTACK = sonaePlan('比自山の囲み', 0, { x: CAMP.x + 6, z: CAMP.z + 18 }, Math.PI, [
  ['honjin', '本陣', '堀秀政', 5000, CAMP.x + 6, CAMP.z + 18, Math.PI, 'oda', 'none'],
  ['niwa', '南の仕寄り', '丹羽長秀', 2000, -70, 70, Math.PI, 'sujikai', 'sujikai', 160, 28, 10],
  ['gamo', '東の包囲陣', '蒲生氏郷', 4000, 70, -40, -Math.PI / 2, 'oda', 'none', 160, 24, 10],
  ['tsutsui', '西の包囲陣', '筒井順慶', 4000, -90, -40, Math.PI / 2, 'igeta', 'igeta', 160, 24, 10],
]);
const IGA_DEFEND = sonaePlan('曲輪と尾根の守り', 1, SHU, 0, [
  ['shu', '主郭の南辺', '名は伝わらない', 1500, SHU.x - 8, SHU.z, 0, 'maru', 'none', 48, 8, 8],
  ['kita', '北の尾根曲輪', '名は伝わらない', 800, KITA.x, KITA.z, Math.PI, 'maru', 'none', 32, 8, 6],
  ['kitasoto', '北外郭の退き口', '名は伝わらない', 500, KITASOTO.x, KITASOTO.z, Math.PI, 'maru', 'none', 24, 7, 6],
  ['higashi', '東の脇曲輪', '名は伝わらない', 700, HIGASHI.x, HIGASHI.z, Math.PI / 2, 'maru', 'none', 32, 7, 6],
]);

const ODA = { flag: 'oda' };
// 伊賀の地侍と足軽。装いと指物の省略は、両軍を見分けるための復元。
const IGA = { armor: 0x343a42, lace: 0x8a9098, cloth: 0x3a4048, hat: 'hachimaki', flag: null };   // 闇でも見分けがつくよう、鈍い青灰と薄い金属の光（B091）

// 地山（曲輪の段・堀切は heightOf が castles/hijiyama.js の縄張りから被せる）。長田丸・朝屋丸は丘の上
function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += 22 * gauss(x, z, FORT.x, FORT.z, 5200) + 16 * gauss(x, z, NAGATA.x, NAGATA.z, 8000) + 16 * gauss(x, z, ASAYA.x, ASAYA.z, 8000);
  // 国土地理院の標高：戦場の外の遠い山並みにだけ、実際の起伏を足す（1 が実の 5m）
  // 城域と退去路の外だけに足す。読込時刻で曲輪の床や道の高さが変わらない。
  if (igDem) h += demRelief(igDem, x, z, { xy: 5, cx: 0, cz: 0, inner: 450, fade: 60, scale: 0.18 });
  return h;
}
function castleTerrain(x, z) { return baseTerrain(x, z) + yamaLift(x, z, LIFT); }
const HORI_HEIGHTS = HIJIYAMA_PLAN.hori.map(h => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
function castleGround(x, z) {
  let h = castleTerrain(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  return h;
}
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) CASTLE_HEIGHT = heightOf(HIJIYAMA_PLAN, castleGround, 3);
  return CASTLE_HEIGHT(x, z);
}

const iga = {
  jinkei: [IGA_ATTACK, IGA_DEFEND],
  noWake: false, wakeRoom: 250, moveLim: 440, // 共通の枠を使い、近い備えを同じ場所で本物へ替える。
  noReserve: true, noDistantBattle: true,
  botOrders: true, // 山へ追わず、消火・土橋・陣の口の下知を守る。
  botBrainDepth: true, // 守る段も、比自山の持ち場に沿った迎撃を使う。
  // 城内の確認は実際の到着を必要とする。放置しても城を押さえた扱いにしない。
  taisho: { a: null, b: null }, // この城で百地丹波を討つ筋にはしない。
  spawn: { x: 6, z: 50, heading: Math.PI },
  world: {
    seed: 15819, moveLim: 440, groundHalf: 450,
    time: 'night',
    wind: [0.5, 1],
    autumn: true,
    muddy: 0.25,
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    noticeRepeatGap: 32, quietMarch: true,
    // 大手道（南）＋北の搦手・裏の尾根（KITA→KITASOTO）に加え、犬走り（斜面沿いの細道。主郭の周り→北・東の曲輪へ）
    paths: [[[0, 150], ...APPROACH], RIDGE, EAST],
    moveWay: igaWay, fleeWay: igaFleeWay, combatSpace: igaCombatSpace,
    height,
    clear: (x, z) => (Math.abs(x) < 50 && z > -10 && z < 90) || Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 8
      || Math.hypot(x - KITA.x, z - KITA.z) < 14 || Math.hypot(x - KITASOTO.x, z - KITASOTO.z) < 13 || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 13
      || (Math.abs(x) < 18 && z < 0 && z > KITAEND.z - 40) || Math.hypot(x - NAGATA.x, z - NAGATA.z) < 16 || Math.hypot(x - ASAYA.x, z - ASAYA.z) < 16,
    trees: 680,
    tufts: 3000,
    treeDensity: (x, z) => ((Math.abs(x) < 50 && z > -10 && z < 90) || (Math.abs(x) < 20 && z < -80 && z > KITAEND.z - 40) || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 16) ? 0.1 : 1,
    // 盆地・丘陵・森の伊賀。山城だけでなく、山麓の集落（小屋二つ）と、長田丸・朝屋丸の小城館の森
    groves: [{ x: -60, z: 30, r: 14, n: 22 }, { x: 60, z: 10, r: 14, n: 22 }, { x: NAGATA.x, z: NAGATA.z, r: 16, n: 18 }, { x: ASAYA.x, z: ASAYA.z, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && (z < KITAEND.z - 24 || Math.abs(x) > 90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_A', nightRaid: 'HIST_B', emptyCastle: 'HIST_B', nagata: 'HIST_B', asaya: 'HIST_B', approach: 'GAME_C', distantFires: 'GAME_C', ridgeHq: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.doused = 0;
    rt.army.igaFront = [];
    rt._rfN = 3; // 共通の段処理による、出所のない新手をこの戦では出さない。
    // ---- 丹羽の陣：陣幕と小屋 ----
    // 比自山を囲む堀秀政の陣。信雄の総本陣とは分ける。
    F.honjin = camp(rt, { x: CAMP.x + 6, z: CAMP.z + 18, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '堀秀政', hat: 'kabuto_m', haori: 0x6a1d2a }, guard: 15, reserve: 260, runTo: { x: 0, z: 36 } });
    // 本陣の大将は陣で下知する。自動の出撃で閉じた木戸へ追わせず、近づいた敵は迎え撃つ。
    if (F.honjin.general) {
      const g = F.honjin.general.group; g.stay = true; g.noAI = true;
      g.anchor = { x: CAMP.x + 6, z: CAMP.z + 18 };
      g.order = 'hold'; g.guard = true; g.guardSight = 12; g.guardLeash = 8; g.seekRange = 8;
    }
    F.huts = [[-20, 30, 0.1], [18, 26, -0.2], [-8, 60, 0.2], [26, 56, 0]].map(([x, z, r]) => { const m = hut(W, x, z, 7, 5, r, { wall: 0x6e5a40 }); rt.scene.add(m); return { x, z, m }; });
    rt.scene.add(tawara(W, 4, 34, 0.3, 6), tawara(W, -30, 46, -0.2, 5));
    for (const [x, z, k] of [[-10, 20, 'oda'], [10, 20, 'eiraku'], [-34, 30, 'oda'], [34, 34, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[-4, 44], [14, 40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 比自山城：主郭→北の尾根曲輪→堀切→北外郭、主郭→堀切→東の脇曲輪（一本道でない）。南の大手だけ手組みの木戸 ----
    F.castleC = buildCastlePlan(rt, HIJIYAMA_PLAN, { baseHeight: castleTerrain, edgeW: 3, buildSeat: false, life: false });
    // 土塁は歩く地形に一度だけ盛る。柵の下へ別の土手を重ねない。
    for (const s of F.castleC.walls) { s.noTarget = true; s.wall = true; }
    // 北・東の木戸は退去路を開けた冠木門。南だけが台本で閉じる木戸。
    for (const g of HIJIYAMA_PLAN.koguchi) if (g.id !== 'kido_shu') {
      rt.scene.add(kabukimon(W, g.at[0], g.at[1], 5.4, g.id === 'kido_higashi' ? Math.PI / 2 : 0, { doors: false }));
    }
    // 柵と土塁は縄張りの口を共用し、北と東の道を二重の囲いで塞がない。
    F.shikisho = monomi(rt, FORT.x - 9, FORT.z - 12, { team: 1, name: '主郭の物見' });
    // 北へ続く尾根道の幅を空け、退く守備兵と城内を調べる組を通す。
    rt.scene.add(hut(W, SHU.x - 9, SHU.z - 4, 8, 6, 0, { wall: 0x6e5a40 }));
    // 遠くの別方向の戦い・火・狼煙：長田丸・朝屋丸のあたり、山の向こう
    for (const [x, z, s2] of [[NAGATA.x, NAGATA.z - 30, 2.4], [ASAYA.x, ASAYA.z - 24, 3.2], [-120, -170, 2.0], [140, -150, 2.2]]) { W.addSmokeColumn(x, W.heightAt(x, z) + 4, z, { size: s2 }); }
    for (const [x, z] of [[-150, -100], [165, -80]]) W.addFire(x, z, { h: 1.2 });
    const seg = [-2.5, SHU.z + 18, 2.5, SHU.z + 18];
    F.gate = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 260, maxHp: 260, armor: 0.2, team: 1, name: '木戸', noTarget: true });
    F.gz = seg[1];
    const dm = tobira(W, FORT.x, F.gz, seg[2] - seg[0] - 0.2, 0, { h: 2.8 });
    F.gate.mesh = dm;
    // 観音寺跡の主郭。名のある城主・最後の一騎打ちは置かない。
    rt.scene.add(dm, kabukimon(W, FORT.x, F.gz, seg[2] - seg[0] + 0.8, 0, { doors: false }), yagura(W, FORT.x + 10, FORT.z + 6));
    // ---- 周りの小城館：長田丸・朝屋丸（遠景・連絡の拠点。柵の囲いと物見・旗だけの軽い作り） ----
    for (const [S, nm2] of [[NAGATA, '長田丸'], [ASAYA, '朝屋丸']]) {
      const rr = ringWall(rt, S.x, S.z, 9, { gapAt: Math.PI, gapW: 0.5, team: 1, hp: 1e9, name: nm2 + 'の柵', segLen: 5 });
      for (const s of rr) s.noTarget = true;
      rt.scene.add(hut(W, S.x, S.z, 7, 5, 0, { wall: 0x5a4a38 }), yagura(W, S.x + 6, S.z - 6), nobori(W, S.x - 6, S.z + 6, 'maru', 6));
    }
    // ---- 丹羽長秀の手（自分の持ち場）、筒井の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { fixed: true, formation: 'ring', guard: true, guardLeash: 8, name: '丹羽長秀の手', anchor: { x: 0, z: 36 }, facing: Math.PI, width: 14, aggro: 10, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.tsutsui = allyGroup(rt, { fixed: true, formation: 'line', guard: true, guardLeash: 12, name: '西の押さえの組', anchor: { x: -26, z: 40 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { fixed: true, name: '木戸を破る組', anchor: { x: 20, z: 44 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.niwa, F.tsutsui, F.ram];
    F.niwa.leader = F.niwaU;
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 48 }, Math.PI, [{ kind: 'spear', n }]);
    F.honjin.guard.anchor = { x: CAMP.x + 6, z: CAMP.z + 7 };
    F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 10;
    F.jinHosts = buildSonae(rt, this.jinkei);
    // 夜討ちの全組を準備時に林へ置く。時刻で新しく湧かせず、同じ兵へ進撃を命じる。
    F.raiders = [igaEnemy(rt, -32, 20, 3, '西から忍び寄る伊賀衆'), igaEnemy(rt, 32, 50, 5, '東から忍び寄る伊賀衆'), igaEnemy(rt, -30, 95, 5, '裏へ回る伊賀衆')];
    F.waveA = [igaEnemy(rt, 32, 25, 9, '東の林の伊賀衆'), igaEnemy(rt, -32, 50, 9, '西の林の伊賀衆'), igaEnemy(rt, 0, 78, 8, '陣の裏の伊賀衆')];
    F.waveB = [igaEnemy(rt, ...APPROACH[3], 10, '城から出る伊賀衆'), igaEnemy(rt, ...APPROACH[2], 10, '林を回る伊賀衆')];
    F.sally = igaEnemy(rt, 55, -46, 12, '林の伊賀衆');
    F.wallBow = igaEnemy(rt, FORT.x, F.gz - 5, 8, '土塁の伊賀衆', [{ type: 'bow', n: 6 }, { type: 'gun', n: 2 }]);
    F.wallBow.ambush = false; F.wallBow.aggro = 34; F.wallBow.facing = 0;
    // 登りと退きの道を三人ずつが守る。城の放棄後に新手を出さない。
    // 長い折れ目の中ほどへ準備時に置き、実兵の上限は igaEnemy で守る。
    F.roadGuards = [];
    for (let i = 1; i < 7; i++) {
      const a = APPROACH[i - 1], b = APPROACH[i];
      for (const step of [2, 2.5]) {
        const g = igaEnemy(rt, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3, '山道の伊賀衆');
        g.igaStep = step; g.aggro = 0;
        for (const u of g.units) u.noTarget = true;
        F.roadGuards.push(g);
      }
    }
    F.igun = allyGroup(rt, { fixed: true, name: '丹羽の鉄砲組', anchor: { x: 14, z: 28 }, facing: Math.PI, formation: 'line', width: 4, aggro: 4 }, dress([{ type: 'gun', n: 6 }], ODA));
    // 夜討ちの切れ目を埋める二人組。道と陣の外縁へ先に置き、既存の隊の人数を削らない。
    F.raidPatrols = [];
    for (const [x, z] of [[-12, 14], [12, 14], [-12, 72], [12, 72], [-34, 38], [34, 38], APPROACH[1], APPROACH[2]]) {
      const g = igaEnemy(rt, x, z, 2, '道に潜む伊賀衆');
      g.aggro = 0;
      for (const u of g.units) u.noTarget = true;
      F.raidPatrols.push(g);
    }
    // 陣の中で寝ずの番をする織田の兵：焚き火を囲んで座る者・立つ番の者。夜でも火に照らされて見える
    {
      const ppl = [];
      for (const [fx, fz] of [[-8, 24], [12, 18]]) for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + fx * 0.1, r = k % 3 === 2 ? 3.2 : 2.1;
        ppl.push({ x: fx + Math.sin(a) * r, z: fz + Math.cos(a) * r, k: k % 3 === 2 ? 'spear' : 'seated', facing: a + Math.PI, flag: 0 });
      }
      W.addDistantArmy({ people: ppl, armor: 0x2b3140, team: 0, flagTex: flagTexture('oda'), seed: 15814 });   // 見張りの姿は軽い遠景のまま
      for (const [x, z] of [[-8, 24], [12, 18]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    }

    // 陣幕の線と、見張りの焚き火も置き終えてから、迂回の当たりをそろえる。
    rt.army.igaCampBoxes = SOLIDS.filter((s) => s.z0 > 10).map((s) => {
      const x0 = s.x0 - 0.9, x1 = s.x1 + 0.9, z0 = s.z0 - 0.9, z1 = s.z1 + 0.9;
      return { x0, x1, z0, z1, corners: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] };
    });

    applyLook(rt, NIGHT); rt.world.lookDark = true;   // 夜の明るさを独自に強めない。月齢と天気は不明。
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '陣の見張りの一手を預かれ' : '陣の見張りにつけ', 'main');
    rt.say('丹羽の組頭', `${nm(rt)}、伊賀の者は夜に来る。山と林は敵の陣じゃ。火を消し、陣の口を守れ`, 5);
    rt.marker('niwa', unitPos(F.niwaU), '丹羽長秀', {});
    rt.after(6, () => this.raid(rt));
  },

  // ① 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    F.raidNearT = rt.t + 24; // 最初の夜討ちの間合いと順番は保つ。
    rt.setPhase('raid');
    rt.unmark('niwa');
    sfx('kane', 0.6);
    rt.banner('夜討ち', '陣の中に伊賀の者が忍び込み、小屋の軒に火をつけた');
    rt.obj('main', '山へ登るな。小屋の敵を味方の列へ引き離し、印で八秒長押しして火を消せ', 'main');
    rt.say('足軽', '火じゃ！　小屋が燃えておる！', 2.5);
    rt.say('丹羽の組頭', '慌てるな！　火を消せ。火の明かりに浮かぶ者を討て！', 3.5);
    const W = rt.world;
    battleEvent(rt, EVENT_FIRE_START, CAMP, F.niwa, 1, true, '夜討ちで陣に火の手が上がった');
    F.fires = [];
    F.huts.slice(0, 3).forEach((h, i) => {
      const f = W.addFire(h.x, h.z, { h: 0.7, size: 0.8 });
      F.fires.push(f);
      rt.marker('f' + i, { x: h.x, z: h.z }, '火を消す', { h: 3 });
      // 小屋のどの外側からも水を掛けられる。反対側の一点へ壁を突っ切らせない。
      rt.addInteract('f' + i, { x: h.x, z: h.z }, '桶の水で軒の火を消す', () => this.douse(rt, i), { r: 5.2, hold: 8 });
    });
    // 出陣三十秒で最初の三人が陣へ寄る。次の組は、その組を退けてから。
    rt.after(24, () => { if (F.step === 1 && !F.ending) igaAdvance(F.raiders[0], CAMP); });
  },
  douse(rt, i, byPlayer = true) {
    const F = rt.flags;
    if (F.ending || rt.over || F.step !== 1 || !F.fires[i]) return;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fires[i]); F.fires[i] = null;
    sfx('wood', 0.4);
    F.doused++;
    rt.objProgress('main', `火を消した小屋 ${F.doused}／3軒`);
    if (!byPlayer) rt.bark(`小屋の火を消した（${F.doused}／3軒）`);
    if (F.doused === 1) {
      F.bucketOn = true; F.bucketIndex = -1; F.bucketT = 0;
      rt.say('丹羽の組頭', '残る小屋は桶の組が消す。そなたは敵を防げ。近づけぬ時は手を貸せ', 4);
    }
    if (byPlayer) rt.award((t) => t.side.push(`夜討ちの火を消した（${i + 1}軒目）`), `小屋の火を消した（${F.doused}／3軒）`);
  },

  // 夜討ちを退けても追い散らさない。山道へ進む前に、陣の口を固める。
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.5 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1.5;
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.unmark('r' + i); if (F.fires[i]) rt.world.removeFire(F.fires[i]); }
    retireRaid(rt, F.raiders);
    rt.obj('main', '陣の口で組をそろえ、次の夜討ちに備えよ', 'main');
    depthStart(rt, igaCtx(rt), igaA(rt), () => { rt.objRemove('dp'); if (!F.ending) this.assault(rt); });
  },

  // 南の守りへ取り付く。強い土塁と空堀が、正面攻めを押し返す。
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t;
    for (const g of F.raidPatrols) if (!g.ambush) retireRaid(rt, [g]);
    rt.setPhase('gate');
    applyLook(rt, DAWN); rt.world.lookDark = false;
    rt.world.setTime('morning');
    sfx('horagai', 1);
    rt.banner('幾度かの攻防の後の朝', '時を省いている。空堀の道で木戸の組を守る');
    rt.obj('main', HI(rt) ? '組を率い、南の土橋で木戸の組を守れ' : '南の土橋で木戸の組を守れ', 'main');
    rt.say('丹羽の組頭', '南は堀と土塁が深い。道の印へ進め。木戸の組を、林からの敵に渡すな', 5);
    F.gate.noTarget = false;
    F.bridge = { x: 0, z: -48 };
    rt.marker('bridge', F.bridge, '南の土橋', { h: 3 });
    rt.zone('bridge', 0, -48, 12);
    F.bridgeT = 0;
    for (const [g, x, z] of [[F.ram, 0, -42], [F.niwa, ...APPROACH[4]], [F.tsutsui, ...APPROACH[3]], [F.igun, ...APPROACH[5]]]) {
      g.formation = 'column'; g.colW = 2;
      // 出す場所の固定はここまで。行軍中は道幅と持ち場を合わせる。
      g.fixed = false; g._fitAt = 0;
      g.noAI = true; g.focus = null;
      g.order = 'path'; g.path = []; g.pathIdx = 0; g.speed = 2.3;
      // 山道の折れ目から土橋へ。護衛の列を崩して直進しない。
      for (const point of APPROACH) { if (point[1] < g.anchor.z && point[1] > z) g.path.push(point); }
      g.path.push([x, z]); g.dest = null;
      g.onArrive = (q) => { q.order = 'hold'; q.aggro = 16; };
    }
    F.lines = lines(rt, [
      { x: -48, z: -55, facing: Math.PI, w: 28, seed: 15821, A: ['oda', 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'saito'], flagRateB: 0, bowsB: true, surge: false },
      { x: 48, z: -55, facing: Math.PI, w: 28, seed: 15822, A: ['eiraku', 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'saito'], flagRateB: 0, gunsB: true, surge: false },
    ]);
    for (const c of F.lines) { c.go(); c.push('B', 0.55); }
    // 鉄砲は実際の弾込め・射線・命中で働く。号令だけで敵の士気を下げない。
    F.igun.holdFire = false;
    rt.after(20, () => {
      if (F.step !== 2) return;
      igaAdvance(F.sally, F.bridge);
      F.sally.focus = F.ram.units.find((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget) || null;
      if (!F.sally.focus) { F.sally.anchor.x = CAMP.x; F.sally.anchor.z = CAMP.z; }
      rt.say('足軽', '東の林から出た！　土橋の組を守れ！', 3);
    });
    rt.after(45, () => { if (F.step === 2) { for (const c of F.lines) c.volley('B'); rt.say('丹羽の組頭', '土塁の上から撃ち下ろすぞ。堀へ降りるな。土橋を保て', 4); } });
  },

  // 攻めあぐねた正面を離れ、麓を囲む。撤退と敗走は共通の仕掛けに任せる。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('bridge'); rt.unzone('bridge');
    rt.obj('main', '陣の口へ退き、組をそろえて山の麓を囲め', 'main');
    if (F.bridgeT >= 20 && !gone(F.ram)) rt.award((t) => t.side.push('南の土橋で木戸の組を守った'), '南の土橋を保った');
    for (const g of F.oda) { g.order = 'retreat'; g.anchor = { x: CAMP.x, z: CAMP.z }; g.dest = null; g.onArrive = null; }
    for (const c of F.lines) { c.push('A', -0.5); c.shake('A', 12); }
    battleEvent(rt, EVENT_RETREAT, F.bridge, F.niwa, 0, true, '正面攻めをやめ、山の麓を囲む');
    if (F.sally) retireRaid(rt, [F.sally]);
    F.igun.order = 'retreat'; F.igun.anchor = { x: 14, z: 30 }; F.igun.holdFire = false;
    rt.say('丹羽の組頭', '土塁は破れぬ。下がって麓を囲め。陣の口を守るぞ', 5);
    depthStart(rt, igaCtx(rt), igaB(rt), () => { rt.objRemove('dp'); if (!F.ending) this.withdraw(rt); });
  },

  withdraw(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 3; F.stepT = rt.t;
    retireRaid(rt, F.roadGuards);
    rt.setPhase('withdraw');
    // 既存の北の口から退く。柵を壊したり、守備兵を秒数だけで消したりしない。
    F.wallBow.noRout = false; F.wallBow.focus = null; F.wallBow.dest = null;
    F.wallBow.formation = 'column'; F.wallBow.colW = 2; F.wallBow.march = true;
    // 退去の下知では、遠い攻め手への射撃をやめて北の口へ歩く。
    F.wallBow.retreatOnly = true;
    F.wallBow.order = 'path'; F.wallBow.path = RIDGE.slice(1); F.wallBow.pathIdx = 0;
    F.wallBow.onArrive = (g) => { g.order = 'retreat'; g.path = null; g.march = false; g.onArrive = null; };
    F.wallBow.fleeDir = { x: 0, z: -1 };
    for (const h of F.jinHosts) if (h.army.team === 1) {
      // 退く備えから新しい守備兵を出さず、既に替えた兵にも同じ退去の下知を出す。
      h.army.noWake = true; h.army.facing = 0;
      h.moveTo(h.army.cx + h.army.off.x, h.army.cz + h.army.off.z - 110, 40, { back: true });
      for (const g of h.army.wk?.groups || []) {
        g.noAI = true; g.guard = false; g.focus = null; g.dest = null;
        g.retreatOnly = true; g.formation = 'column'; g.colW = 2; g.march = true;
        g.order = 'path'; g.path = [];
        if (g.anchor.x > 18) g.path.push([HIGASHI.x - 10, SHU.z], [18, SHU.z], [0, SHU.z]);
        for (const point of RIDGE) if (point[1] < g.anchor.z) g.path.push(point);
        g.pathIdx = 0; g.fleeDir = { x: 0, z: -1 };
        g.onArrive = (q) => { q.order = 'retreat'; q.path = null; q.march = false; q.onArrive = null; };
      }
    }
    for (const c of F.lines) c.rout('B', { hideAfter: Infinity, minFight: 0 });
    rt.obj('main', '陣の口を守り、城兵の退去を確かめよ。山中へ追うな', 'main');
    rt.say('伝令', '城兵が北へ退いております。南の木戸と曲輪を見張りまする', 4);

  },

  // 無人になった木戸を開け、複数の曲輪を調べる。最後の衆・奪回軍は作らない。
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    // 夜の退去を確かめてから、木戸と曲輪を調べる。
    // 遠景の兵は尾根の先へ歩かせたまま残す。
    rt.setPhase('inside');
    applyLook(rt, DAWN); rt.world.lookDark = false; rt.world.setTime('morning');
    // 既に破れた扉を、退去後に新品の開いた扉へ戻さない。
    if (F.gate.alive) F.gate.mesh.userData.open();
    F.gate.alive = false; F.gate.noTarget = true;
    rt.obj('main', '寺跡の主郭から、北の曲輪を調べよ', 'main');
    rt.banner('城の射撃が止んだ', '時を省き、山道を上った後の主郭へ移る');
    // 空城までの長い登りは朝への場面替えで省く。確認する曲輪は残す。
    const P = rt.player.u;
    let seat = 0;
    for (const g of rt.squadGroups || []) {
      for (const u of g.units) if (u.alive) {
        u.pos.x = seat % 2 ? 1.5 : -1.5; u.pos.z = SHU.z + 4 + Math.floor(seat++ / 2) * 1.1;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        u.target = null; u.moveTo = null; u.vel.x = 0; u.vel.z = 0;
      }
      g.anchor.x = SHU.x; g.anchor.z = SHU.z + 7;
    }
    seat = 0;
    for (const u of rt.tomoUnits || []) if (u.alive) {
      u.pos.x = seat % 2 ? 3 : -3; u.pos.z = SHU.z + 3 + Math.floor(seat++ / 2) * 1.1;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.target = null; u.moveTo = null; u.vel.x = 0; u.vel.z = 0;
    }
    P.pos.set(SHU.x, rt.world.heightAt(SHU.x, SHU.z + 5), SHU.z + 5);
    P.vel.x = 0; P.vel.z = 0; rt.player.vel.x = 0; rt.player.vel.z = 0; rt.player.lock = null;
    rt.say('丹羽の組頭', '夜のうちに城を捨てたか。主郭から北の曲輪へ進め。伏兵がいないか確かめよ', 5);
    depthStart(rt, igaCtx(rt), [
      igaMove({ to: SHU, r: 3, max: 45, label: '主郭', obj: '寺跡の主郭を調べよ' }),
      igaMove({ to: KITA, r: 9, max: 45, label: '北の曲輪', obj: '空堀の道を越え、北の曲輪を調べよ', say: [['足軽', '堂も空じゃ。北の曲輪へ、足跡が続いておる', 4]] }),
      rest({ dur: 8, fn: (r) => r.obj('main', '北の曲輪で組をそろえ、物見の報せを待て', 'main'), say: [['伝令', '比自山に敵影なし。柏原へ移ったとの報せにござる', 4]] }),
    ], () => { rt.objRemove('dp'); if (!F.ending) this.win(rt); });
  },

  lose(rt, reason) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    if (F.dp) F.dp.on = false;
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('turn'); rt.unmark('bridge'); rt.unzone('bridge');
    for (let i = 0; i < 3; i++) { rt.unmark('f' + i); rt.uninteract('f' + i); rt.unmark('r' + i); }
    rt.setPhase('end'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('持ち場を守れず', reason);
    rt.player.u.invuln = true;
    rt.finish({}, 9);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.obj('main', '比自山城の曲輪を押さえた', 'main'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '比自山城を押さえた', pts: 20 }; }, '任務達成・比自山城を押さえた');
    sfx('horagai', 0.6);
    rt.banner('比自山城を押さえた', '幾度も攻めを退けた伊賀衆は、夜のうちに城を離れた');
    rt.say('丹羽の組頭', `${nm(rt)}、山の守りと夜討ちを侮るな。城の口へ組を置け`, 4);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 山麓の集落→森→外郭→堀切→主尾根→主郭、と進む流れの呼び名（足軽のいる所で変わる）
  stageOf(z) { return z > 30 ? '山麓の集落' : z > 5 ? '森の道' : z > -40 ? '外郭' : z > -62 ? '堀切' : z > FORT.z + FORT.r ? '主尾根' : '主郭'; },
  update(rt, dt) {
    const F = rt.flags;
    depthTick(rt, dt);
    // 印を調べるための毎コマの配列コピーは作らない。
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    if (!rt.player.u.alive || rt.over) return;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.5 && !(F.retreatHintAt > rt.t)) {
      F.retreatHintAt = rt.t + 30;
      rt.bark('下がれ！　来た道から味方の後ろへ。離れて傷の手当てをせよ', true);
    }
    // 本物へ替えた備えも持ち場を守る。近づいただけで城兵が麓へ突撃しない。
    if (!(F.sonaeCheckAt > rt.t)) {
      F.sonaeCheckAt = rt.t + 0.3;
      for (const h of F.jinHosts) for (const g of h.army.wk?.groups || []) {
        if (g.igaGuard) continue;
        g.igaGuard = true;
        if (F.step >= 3 && g.team === 1) continue;
        g.noAI = true; g.order = 'hold'; g.guard = true;
        g.guardLeash = 6; g.guardSight = 12; g.seekRange = 8;
      }
    }
    // 本陣の待機と道詰まりを区別する。堀の奥の守りを解いて前線へ出さない。
    const chief = F.honjin?.general, cg = chief?.group;
    if (chief?.alive && !chief.fleeing && !chief.woundOut && !chief.target && chief.moving < 0.1 &&
        (cg.order === 'attack' || cg.order === 'assault' || cg.order === 'move' || cg.order === 'path')) {
      F.campWaitT = (F.campWaitT || 0) + dt;
      if (F.campWaitT > 8 && !(F.campWaitSayT > rt.t) && rt.distTo(chief.pos) < 50) {
        F.campWaitSayT = rt.t + 20;
        rt.bark(chief.stk?.n > 0 || chief.stk?.d > 0 || chief._gated
          ? '本陣の使い「道が詰まっております。旗本の列を通してから進みまする」'
          : '本陣の使い「堀様は奥で下知を出される。旗本は本陣を固めよ」', true);
      }
    } else F.campWaitT = 0;
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    if (guide && (F.step === 1 || F.step === 1.5)) igaRaidPatrol(rt);
    if (guide && (F.step === 2 || F.step === 2.5)) {
      for (const g of F.roadGuards) {
        if (!g.ambush || g.igaStep !== F.step || rt.distTo(g.anchor) > 25) continue;
        for (const u of g.units) u.noTarget = false;
        igaAdvance(g, g.igaHome);
        g.guard = true; g.guardLeash = 10; g.guardSight = 25;
      }
    }
    if (F.step === 1) {
      if (F.bucketOn && F.doused < 3 && !gone(F.ram)) {
        let i = F.bucketIndex;
        if (i < 0 || !F.fires[i]) {
          i = F.fires.findIndex(Boolean); F.bucketIndex = i; F.bucketT = 0;
          if (i >= 0) {
            const h = F.huts[i];
            F.ram.noAI = true; F.ram.formation = 'column'; F.ram.colW = 2;
            F.ram.order = 'move'; F.ram.dest = { x: h.x, z: h.z + 4.5 };
            F.ram.onArrive = (g) => { g.order = 'hold'; };
          }
        }
        if (i >= 0) {
          const h = F.huts[i]; let buckets = 0;
          for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
              !u.atk && !u.swing && !u.target?.alive && Math.hypot(u.pos.x - h.x, u.pos.z - h.z) <= 5.2) buckets++;
          F.bucketAble = buckets;
          F.bucketT = buckets >= 2 ? F.bucketT + dt : 0;
          if (F.bucketT >= 8) this.douse(rt, i, false);
        }
      }
      const L = F.raiders || [];
      // 一組ずつ陣へ寄せ、最初の斬り合いで大勢に囲まれない。
      if (L[1]?.ambush && !L[0]?.ambush && gone(L[0])) {
        igaAdvance(L[1], { x: 12, z: 40 }); rt.say('足軽', '東の林から来るぞ！　味方の列で迎えよ', 2);
      }
      if (L[2]?.ambush && !L[1]?.ambush && gone(L[0]) && gone(L[1])) {
        igaAdvance(L[2], CAMP); rt.say('足軽', '裏の道から来るぞ！', 2);
      }
      if (guide) rt.objProgress('main', F.doused < 3 ? `火を消した小屋 ${F.doused}／3軒。${F.bucketOn ? F.bucketAble >= 2 ? '桶の組の二人を守れ。消火は八秒' : '小屋の敵を味方へ引き離せ。その後、印で八秒長押し' : '山へ登るな。小屋の敵を味方へ引き離し、印で八秒長押し'}` : `火は消えた。夜討ちの残る隊 ${L.reduce((n, g) => n + (!g.ambush && !gone(g) ? 1 : 0), 0)}組。陣の口を守れ`);
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 組頭が消火の場所を知らせる。離れた場所の火を味方の台詞だけで消さない。
      const w = rt.t - F.stepT, foes = L.length >= 3 && L.every(gone);
      if (F.doused < 3 && w > 55 && !F.nudge) { F.nudge = true; rt.say('丹羽の組頭', `${nm(rt)}、火がまだ残っておる！　燃える小屋の前で「桶の水で軒の火を消す」を長く押せ`, 4); }
      if (guide) {
        const trace = F.raidTrace || (F.raidTrace = { fires: 0, holding: '', held: 0, enemies: 0, nearest: 0 });
        trace.fires = F.fires.reduce((n, f) => n + (f ? 1 : 0), 0);
        trace.holding = rt.holdId || ''; trace.held = rt.holdT || 0; trace.enemies = 0; trace.nearest = Infinity;
        for (const g of L) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) {
          trace.enemies++; trace.nearest = Math.min(trace.nearest, Math.hypot(u.pos.x - CAMP.x, u.pos.z - CAMP.z));
        }
      }
      if ((gone(F.niwa) && gone(F.tsutsui)) || w >= 150) {
        this.lose(rt, '火と夜討ちを抑えきれず、陣を退く'); return;
      }
      if (F.doused >= 3 && foes) this.midA(rt);

    }
    if (F.step === 3 && guide && rt.t - F.stepT <= 8) rt.objProgress('main', '物見が木戸と曲輪を見張っている');
    if (F.step === 3 && rt.t - F.stepT > 8) {
      let clear = true;
      // 北の曲輪を出たら南から調べ始める。尾根の最北端まで退く間を空待ちにしない。
      for (const u of F.wallBow.units) if (u.alive && !u.woundOut && u.pos.z > KITA.z - 22) { clear = false; break; }
      if (clear) for (const u of rt.army.units) {
        if (u.team !== 1 || !u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.civ) continue;
        if (Math.hypot(u.pos.x - F.bridge.x, u.pos.z - F.bridge.z) < 28 || Math.hypot(u.pos.x - SHU.x, u.pos.z - SHU.z) < 22 || Math.hypot(u.pos.x - KITA.x, u.pos.z - KITA.z) < 22) { clear = false; break; }
      }
      if (guide) rt.objProgress('main', clear ? '城の射撃は止んだ。物見の下知を待て' : '陣の口を守れ。城兵が北の尾根へ退いている');
      if (clear) this.inside(rt);
    }
    if (F.step === 2) {
      const p = rt.player.u.pos;
      let friends = 0, foes = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.civ || Math.hypot(u.pos.x - F.bridge.x, u.pos.z - F.bridge.z) >= 24) continue;
        if (u.team === 0) friends++; else foes++;
      }
      let supported = false;
      for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && Math.hypot(u.pos.x - F.bridge.x, u.pos.z - F.bridge.z) < 24 && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) < 12 && !rt.army.wallBetween(p, -1, u.pos)) { supported = true; break; }
      // 山道の小隊と戦う間に、土橋の守備時間を使い切らない。
      if (F.bridgeStarted == null && Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) <= 24) F.bridgeStarted = rt.t;
      const elapsed = F.bridgeStarted == null ? 0 : rt.t - F.bridgeStarted;
      if (supported && foes > 0 && friends > foes && Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) <= 12) F.bridgeT += dt;
      if (guide) rt.objProgress('main', F.bridgeStarted == null ? '道沿いの敵を押し返し、南の土橋へ進め' : `木戸の生きた組のそばで寄せを防げ。副手柄 ${Math.min(20, Math.floor(F.bridgeT))}／20秒。下がる合図まで ${Math.max(0, Math.ceil(75 - elapsed))}秒`);
      if (!F.ram.count && !F.ramLost) { F.ramLost = true; rt.say('丹羽の組頭', '木戸の組が崩れた！　その方は土橋を保ち、味方が退く道を空けよ', 4); }
      if (F.sally && F.sally.count < 4 && !gone(F.sally)) { F.sally.noRout = false; F.sally.morale = Math.min(F.sally.morale, 20); }
      if (elapsed >= 75 || (elapsed >= 25 && gone(F.sally) && friends > 0 && Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) <= 12)) this.midB(rt);
    }
  },

  onKill(rt, v) {
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onStructDestroyed(rt, s) {
    if (s !== rt.flags.gate) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();
    sfx('wood', 1.2);
    rt.bark('木戸が破れた。城兵はまだ残る。土橋の持ち場を守れ', true);
    // 門の破損は勝利にも退去にも直結させない。曲輪の守りと包囲は続く。
  },
};

// 比自山周辺の設定兵力。退去を討死として減らさない。伊賀全土の四万余を、この一城の兵と混ぜない。
iga.force = () => ({ a: 15000, a0: 15000, b: 3500, b0: 3500 });
iga.sides = { a: { name: '織田の包囲勢（推定）', mon: 'oda' }, b: { name: '比自山の伊賀衆（推定）', mon: 'maru' } };
iga.famous = []; // 東の包囲陣の将を、南の木戸組へ重複して置かない。
iga.date = (rt) => `天正九年九月　秋・景色の時刻 ${rt.flags.step === 2 || rt.flags.step >= 3.5 ? '朝' : '夜'}`;
iga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '見張りを始める' : '');
iga.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) iga.raid(rt); };
iga.history = '信長公記巻十四は、天正九年九月三日、信雄らが甲賀・信楽・加太・大和などの口から伊賀へ入ったと記す。九月十一日の夜間退去は佐奈具の城の記録で、比自山の落城日とは別である。比自山の詳しい攻防は後世の伊乱記で補い、蒲生氏郷・堀秀政・筒井順慶らの包囲、繰り返す攻めへの抵抗、夜討ち、夜の城の放棄を描いた。守り手は柏原へ移ったとも伝わる。城跡は寺跡を使い、比高約百五十メートル、南北約三百五十メートルに曲輪と空堀が続く。南辺の土塁と空堀が強く、守りの正面と考えられる。丹羽の一組の役割、各隊の場所、陣の小屋の消火、土橋の鉄砲、時間配分は遊びのための復元。兵数には諸説あり、設定の味方一万五千・守り三千五百は比自山周辺の推定で、伊賀全土の総勢でも、城に逃れた非戦の者を含む数でもない。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。 曲輪の守将の名と家紋は確定せず、丸の旗を代用した。朝と夜は数日にわたる攻防を縮めた景色で、当日の時刻・天気・月齢を確定するものではない。総本陣の信雄はこの狭い戦場には置かず、堀の局地の本陣と区別した。 城域の長さと比高は縮めず、曲輪の輪郭と道、長田丸・朝屋丸の位置は推定である。近隣の川や旧河道を測量どおりに復元した地形ではない。';

// 任務の印へ向かう自動の遊び手。
iga.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) {
    const C = F.dp.cur;
    const needsTreatment = u.hp < u.maxHp * 0.5 && p.treatmentLeft > 0 && !p.bandaged;
    if (F.step === 2.5 && C?.s.kind === 'move' && !needsTreatment && !F.dpBack &&
        igaFightBot(b, inp, goTo, patientStrike, u.pos, 18)) return;
    if (C?.s.kind === 'hold' && !F.dpBack && !needsTreatment && p.sta >= p.maxSta * 0.22) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
      // 印と敵へ同じコマに歩かせると、行き先が毎回変わって小屋を回る避け足が消える。
      // 迎撃の相手を先に決め、敵がいない時だけ印へ戻る。
      if (!igaFightBot(b, inp, goTo, patientStrike, C.at, C.botRadius + 12)) goTo(p, inp, C.at.x, C.at.z, 4);
      return;
    }
    depthBot(b, inp, goTo);
    return;
  }
  // 傷は自然には戻らない。手当てを済ませ、息が戻れば任務に戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if ((u.hp < u.maxHp * 0.5 && canTreat) || p.sta < p.maxSta * 0.22) b.botRest = true;
  if (b.botRest && (u.hp >= u.maxHp * 0.5 || !canTreat) && p.sta > p.maxSta * 0.55) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    if (p.treatmentReady && canTreat) inp.k.add('KeyE');
    else goTo(p, inp, CAMP.x, CAMP.z + 8, 2);
    return;
  }
  const post = F.step === 2 ? b.distTo(F.bridge) > 24 ? u.pos : F.bridge : CAMP;
  if ((F.step === 1 || F.step === 2) && igaFightBot(b, inp, goTo, patientStrike, post, F.step === 2 ? 24 : 44)) return;
  inp.guardHold = false;
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('f')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 4.8) goTo(p, inp, it.pos.x, it.pos.z, 4.8); else inp.k.add('KeyE'); return; }
  }
  if (F.step === 2) { goTo(p, inp, 0, -48, 4); return; }
  goTo(p, inp, CAMP.x + 4, CAMP.z, 3);
};

// 持ち場の周りの、同じ高さで道が通る敵だけを迎える。敗走や城内の守り手は追わない。
function igaFightBot(b, inp, goTo, patientStrike, post, radius) {
  const p = b.player, u = p.u;
  const eligible = (o) => o.alive && o.team !== u.team && !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln && o.type !== 'dummy' &&
    o.pos.z > b.flags.gz + 0.8 && Math.hypot(o.pos.x - post.x, o.pos.z - post.z) <= radius &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false);
  // 寄せる間も相手を保つ。毎回近い兵へ替えると、どの相手にも届かない。
  const previous = p.igaFightFoe;
  const e = previous && eligible(previous) && Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < 30
    ? previous : b.army.nearestEnemy(u, 30, eligible);
  p.igaFightFoe = e;
  if (!e) return false;
  const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  inp.k.delete('KeyE');
  const reach = p.weapon === 'sword' ? 1.7 : 2.8;
  if (p.lock && p.lock !== e) inp.e.add('KeyQ');
  goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
  // 届く所で敵を向く。移動中に向きを戻すと、焚き火や小屋を避ける歩みを打ち消す。
  if (d < reach && !inp.k.has('KeyW')) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  const threatened = (b.army.threats || []).some((o) => o.alive && !o.fleeing && o.team !== u.team &&
    o.atk?.target === u && o.type !== 'gun' && o.type !== 'bow' &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  // 構えたままの一押しは槍の払いになる。隙に構えを解き、突けるまで待つ。
  inp.guardHold = threatened; inp.leftPressed = false; inp.chargeHold = false;
  if (d < reach && !threatened) patientStrike(p, inp, e, d);
  return true;
}

// 準備時に実兵を置き、波はその兵への下知で表す。携帯用の実兵枠を越えない。
function igaEnemy(rt, x, z, n, name, list = null) {
  let live = 0;
  for (const u of rt.army.units) if (u.alive) live++;
  let room = Math.max(0, 240 - live);
  const troops = [];
  for (const q of list || [uS(1), uA(n - 1)]) {
    const count = Math.min(room, q.n); room -= count;
    if (count) troops.push({ ...q, n: count });
  }
  return enemyGroup(rt, { fixed: true, ambush: !list, faction: 'saito', name, anchor: { x, z },
    facing: Math.atan2(-x, CAMP.z - z), formation: 'column', colW: 2, width: 2,
    igaHome: { x, z }, order: 'hold', noAI: true, aggro: 8, morale: 85, fleeDir: { x: Math.sign(x), z: -1 }, dmgMult: 1 }, dress(troops, IGA));
}
// 半秒ごとに近くの戦える敵を調べる。十二秒途切れたら、近い伏兵だけを寄せる。
// 三十六メートル以内の二人組が歩いて来る余裕を残し、瞬間移動や毎コマの兵作りはしない。
function igaRaidPatrol(rt) {
  const F = rt.flags, p = rt.player.u;
  if (rt.t - F.stepT < 24) return;
  for (const u of rt.army.units) {
    if (!u.alive || u.team === p.team || u.isStruct || u.fleeing || u.woundOut || u.noTarget || u.group?.ambush) continue;
    if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= 12 && Math.abs(u.pos.y - p.pos.y) < 3 &&
        !rt.army.wallBetween(p.pos, -1, u.pos, false)) { F.raidNearT = rt.t; return; }
  }
  if (rt.t - F.raidNearT < 12) return;
  let next = null, nearest = 36;
  for (const g of F.raidPatrols) {
    if (!g.ambush) continue;
    // 待機兵は狙えなくしてあるため、gone ではなく生存で調べる。
    if (!g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) continue;
    const d = rt.distTo(g.anchor);
    if (d < nearest && Math.abs(rt.world.heightAt(g.anchor.x, g.anchor.z) - p.pos.y) < 3) { next = g; nearest = d; }
  }
  if (!next) return;
  for (const u of next.units) u.noTarget = false;
  igaAdvance(next, p.pos);
  next.order = 'attack'; next.path = null; next.focus = p;
  F.raidNearT = rt.t;
  rt.bark('道の脇に敵がおる！　味方のそばで迎えよ');
}

function igaAdvance(g, at) {
  if (!g || gone(g)) return;
  g.ambush = false; g.noAI = true; g.seekRange = 60; g.aggro = 14;
  g.fixed = false; g._fitAt = 0;
  const home = g.igaHome || { x: g.anchor.x, z: g.anchor.z };
  const path = [];
  if (Math.abs(home.x) < 20 && home.z < -5) {
    for (let i = APPROACH.length - 1; i >= 0; i--) if (APPROACH[i][1] > home.z && APPROACH[i][1] < at.z) path.push(APPROACH[i]);
  } else if (at.z < -5) path.push([home.x, -20], [0, -20]);
  path.push([at.x, at.z]);
  g.igaIngress = [[home.x, home.z], ...path];
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'attack'; q.path = null; };
  for (const u of g.units) u._crouch = false;
}

// 持ち場を守った時間と、実際の敵の退き方で決める。秒数だけで敵の士気を落とさない。
function igaHold(o) {
  return {
    kind: 'hold', max: Infinity,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.inT = 0; C.outT = 0; C.botRadius = o.r;
      C.waves = o.waves.slice();
      rt.banner(o.title, o.sub); rt.obj('dp', o.obj, 'main');
      rt.marker('dp', C.at, o.label, { h: 3 }); rt.zone('dp', C.at.x, C.at.z, o.r);
      for (const [who, line, dur] of o.say || []) rt.say(who, line, dur);
      for (let i = 0; i < rt.flags.oda.length; i++) {
        const g = rt.flags.oda[i];
        g.order = 'hold'; g.dest = null; g.onArrive = null;
        g.anchor = { x: C.at.x + (i - 1) * 8, z: C.at.z + 5 };
        g.formation = g === rt.flags.niwa ? 'ring' : 'yari'; g.aggro = 8;
      }
    },
    tick(rt, C, m, ctx, el, dt) {
      for (let i = C.waves.length - 1; i >= 0; i--) {
        const w = C.waves[i];
        if (el < w.t) continue;
        C.waves.splice(i, 1); C.groups.push(w.group); igaAdvance(w.group, C.at);
        if (w.say) rt.say(w.say[0], w.say[1], 3.5);
      }
      // 仲間を失った少人数の組は退ける。林の最後の一人を探す任務にしない。
      for (const g of C.groups) if (g.count < 3 && !gone(g)) { g.noRout = false; g.morale = Math.min(g.morale, 20); }
      const p = rt.player.u.pos;
      const d = Math.hypot(p.x - C.at.x, p.z - C.at.z);
      let friend = 0, enemy = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.isStruct || u.noTarget || u.fleeing || u.woundOut || u.group?.civ) continue;
        if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > o.r ||
            Math.abs(u.pos.y - rt.world.heightAt(C.at.x, C.at.z)) > 3) continue;
        if (u.team === 0) friend++; else enemy++;
      }
      // 槍を合わせて敵を押し返す時間も、持ち場を守った時間に含める。
      if (d <= o.r && friend >= 2 && friend >= enemy) C.inT += dt;
      C.outT = d <= o.r + 6 ? 0 : C.outT + dt; // 短い押し出しでは離脱にしない。
      C.breachT = enemy > friend || friend < 2 ? (C.breachT || 0) + dt : 0;
      if (C.breachT >= 15 || el > o.dur + 90) { iga.lose(rt, '陣の口を保てず、後ろの備えへ退く'); return false; }
      C.guideT = (C.guideT || 0) - dt;
      if (C.guideT <= 0) {
        C.guideT = 0.5;
        rt.objProgress('dp', C.outT > 0
          ? `陣の印へ戻れ（持ち場を失うまで ${Math.max(0, Math.ceil(35 - C.outT))}秒）`
          : C.inT < o.dur * 0.6 && o.dur - el < o.dur * 0.6 - C.inT + 10
            ? `陣を支えた時間が足りぬ。ここであと ${Math.ceil(o.dur * 0.6 - C.inT)}秒守れ`
          : C.waves.length || el < o.dur ? `陣を支えた時間 ${Math.floor(C.inT)}秒。次の下知まで ${Math.max(0, Math.ceil(o.dur - el))}秒`
            : '陣の口に残る敵を押し返せ。林へ追うな');
      }
      const clear = !C.waves.length && C.groups.every(gone);
      if (C.outT > 35) { iga.lose(rt, '陣の口を離れ、組を支えられなかった'); return false; }
      return el >= o.dur && clear && C.inT >= o.dur * 0.6;
    },
    end(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp');
      const won = C.inT >= o.dur * 0.6;
      if (!won) { iga.lose(rt, '陣の口を離れ、組を支えられなかった'); return; }
      rt.objDone('dp');
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
      if (o.onEnd) o.onEnd(rt, m, won);
    },
  };
}

function igaMove(o) {
  const s = move(o), start = s.start;
  s.start = (rt, C, m, ctx) => {
    for (const g of rt.flags.oda) { g.formation = 'column'; g.colW = 2; }
    start(rt, C, m, ctx);
    C.guideUnit = { pos: rt.player.u.pos }; C.guideAt = 0;
    C.lastDistance = Infinity; C.stuckT = 0; C.corner = { x: 0, z: 0 }; C.roadFrom = {}; C.roadTo = {};
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    const distance = Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z);
    if (!C.arr && distance < (o.r || 8)) { C.arr = true; rt.unmark('dp'); rt.unzone('dp'); }
    const arrived = !!C.arr;
    if (!C.arr && rt.t >= C.guideAt) {
      C.guideAt = rt.t + 0.5;
      const d = Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z);
      C.stuckT = d < C.lastDistance - 0.5 ? 0 : C.stuckT + 0.5; C.lastDistance = d;
      let next = igaWay(rt.army, C.guideUnit, C.at);
      if (C.stuckT >= 8 && next === C.at) {
        roadPoint(rt.player.u.pos, C.roadFrom); roadPoint(C.at, C.roadTo);
        if (C.roadFrom.d > 2.8) { C.corner.x = C.roadFrom.x; C.corner.z = C.roadFrom.z; }
        else {
          const forward = C.roadTo.s > C.roadFrom.s;
          const i = Math.max(0, Math.min(ROAD.length - 1, forward ? Math.floor(C.roadFrom.s) + 1 : Math.ceil(C.roadFrom.s) - 1));
          C.corner.x = ROAD[i][0]; C.corner.z = ROAD[i][1];
        }
        next = C.corner;
      }
      if (next !== C.at) {
        rt.marker('turn', next, '道の折れ目', { h: 3 }); C.goal = next;
        rt.objProgress('dp', '道の折れ目の印へ回れ。堀や小屋を横切るな');
      } else { rt.unmark('turn'); C.goal = C.at; rt.objProgress('dp', `印まで あと ${Math.round(d)}歩`); }
    }
    if (C.arr) rt.unmark('turn');
    return arrived;
  };
  s.max = Infinity; // 到着前の時間切れを、確認済みにはしない。
  return s;
}

// 生き残りは歩いて退く。実際に見えなくなった時の退場は共通の逃走判定に任せる。
function retireRaid(rt, groups) {
  for (const g of groups || []) {
    g.noRout = false; g.focus = null; g.ambush = false;
    const home = g.igaHome;
    g.igaRetreat = (g.igaIngress || (home ? [[home.x, home.z]] : RIDGE)).slice().reverse();
    // 最後に陣を出た地点は飛ばし、来た林・山道を逆に歩く。
    if (g.igaRetreat.length > 1) g.igaRetreat.shift();
    g.order = 'path'; g.path = g.igaRetreat; g.pathIdx = 0; g.dest = null;
    g.formation = 'column'; g.colW = 2; g.noAI = true;
    g.onArrive = (q) => { q.order = 'retreat'; q.path = null; };
    if (home) { g.fleeDir.x = Math.sign(home.x); g.fleeDir.z = home.z > CAMP.z ? 1 : -1; }
  }
}

function igaCtx(rt) {
  const F = rt.flags;
  // 波は準備時に置いた隊を使う。遠景の控えを追加せず、総勢を重ねて見せない。
  return { faction: 'saito', flag: 'maru', armor: IGA.armor, dmg: 1, scale: 1, backing: false, look: (l) => dress(l, IGA), friends: () => F.oda };
}
function igaA(rt) {
  return [
    rest({ dur: 8, say: [['丹羽の組頭', '火を消したら陣の口を固めよ。闇の林へ追い出すな', 4]] }),
    igaHold({ at: CAMP, dur: 70, r: 16, title: '陣の口を守れ', sub: '山から下りた伊賀衆が、左右の林へ回る', label: '陣の口', obj: '陣の口を守り、左右からの夜討ちを退けよ',
      waves: [
        { t: 5, group: rt.flags.waveA[0], say: ['足軽', '右の林から！　陣の火を背に、槍を向けよ'] },
        { t: 30, group: rt.flags.waveA[1], say: ['足軽', '左からも来る！　山道へ追うな'] },
        { t: 52, group: rt.flags.waveA[2], say: ['丹羽の組頭', '後ろの道にも槍を向けよ。陣の口を空けるな'] },
      ], reward: '陣の口で夜討ちを退けた', onEnd: (rt) => retireRaid(rt, rt.flags.dp.cur.groups) }),
  ];
}
function igaB(rt) {
  return [
    // 帰りの道を歩く段を先に置く。休息が退却を止め、帰陣前に守備の失敗を数えない。
    igaMove({ to: CAMP, r: 10, label: '包囲の陣', obj: '道の折れ目を戻り、麓の陣へ退け' }),
    rest({ dur: 8, banner: ['包囲を続けた夜', '正面攻めをやめ、陣の口を守る'], fn: (rt) => {
      applyLook(rt, NIGHT); rt.world.lookDark = true; rt.world.setTime('night');
      battleEvent(rt, EVENT_MESSENGER, CAMP, null, 0, true, '蒲生・堀・筒井の手が山の麓を囲んだ');
      for (const c of rt.flags.lines) c.push('A', 0.25);
    } }),
    igaHold({ at: CAMP, dur: 70, r: 16, title: '包囲の夜', sub: '城から出た伊賀衆が、麓の陣へ切り込む', label: '陣の口', obj: '陣の口を守れ。城から出る伊賀衆を押し返せ',
      say: [['丹羽の組頭', '蒲生・堀・筒井の手も山を囲む。陣の口を保ち、城から出る敵を止めよ', 5]],
      waves: [
        { t: 8, group: rt.flags.waveB[0], say: ['足軽', '城の道から来る！'] },
        { t: 36, group: rt.flags.waveB[1], say: ['足軽', '西へ回った敵が、陣の横を突くぞ！'] },
      ], reward: '包囲の陣を夜討ちから守った', onEnd: (rt) => {
        retireRaid(rt, rt.flags.dp.cur.groups);
        battleEvent(rt, EVENT_UNIT_BREAK, CAMP, null, 1, true, '夜討ちの隊が、山へ退いた');
      } }),
  ];
}

export { iga };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
// 北端の外まで尾根を保ち、最後の木戸の直後に急な落差を作らない。
const LIFT = { x: 0, z: KITAEND.z - 37, tx: 0, tz: -80, w: 45, R: 110, rise: 123.4 };

let GRADED = null;
// 道の高さは準備時に一度だけ決める。曲輪の口では床と同じ高さにし、
// 麓から木戸までは九十九折りの道の長さで均等に登る。堀の中央は土橋になる。
function prepareRoadHeights() {
  const level = id => HIJIYAMA_PLAN.kuruwa.find(k => k.id === id).level(castleTerrain);
  const shu = level('shu'), kita = level('kita'), soto = level('kitasoto'), oku = level('oku'), end = level('kitaend');
  const lengths = [0];
  for (let i = 1; i < APPROACH.length; i++) lengths[i] = lengths[i - 1] + Math.hypot(APPROACH[i][0] - APPROACH[i - 1][0], APPROACH[i][1] - APPROACH[i - 1][1]);
  const start = heightRaw(CAMP.x, CAMP.z);
  const rows = [
    [APPROACH, lengths.map(d => start + (shu - start) * d / lengths[lengths.length - 1])],
    [RIDGE, [shu, shu, shu, kita, kita, soto, soto, oku, oku, end, end, heightRaw(0, KITAEND.z - 37)]],
    [EAST, [shu, shu, level('higashi'), level('higashi')]],
  ];
  const segments = [];
  for (const [pts, ys] of rows) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    segments.push({ x: a[0], z: a[1], dx, dz, l2: dx * dx + dz * dz, y: ys[i - 1], dy: ys[i] - ys[i - 1] });
  }
  return segments;
}
function height(x, z) {
  if (!GRADED) GRADED = prepareRoadHeights();
  const h = heightRaw(x, z);
  let best = 6.3, roadY = h;
  for (const s of GRADED) {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.l2));
    const d = Math.hypot(x - s.x - s.dx * t, z - s.z - s.dz * t);
    if (d < best) { best = d; roadY = s.y + s.dy * t; }
  }
  if (best >= 6.3) return h;
  const t = Math.min(1, (6.3 - best) / 3.5), blend = t * t * (3 - 2 * t);
  return h + (roadY - h) * blend;
}
