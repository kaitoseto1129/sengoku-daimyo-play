import { pressureTick } from './battle_pressure.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　刀根坂の戦い（天正元年八月十三日）
// 小谷城を囲む信長に、朝倉義景が後詰に出てきた。大嵐の夜、信長は朝倉方の砦を落とし、
// 朝倉が陣を払って越前へ退くと見るや、自ら先に立って追った。刀根坂で追いついた織田勢は朝倉勢を崩し、
// 名のある者が多く討たれた。美濃を追われて朝倉に身を寄せていた斎藤龍興も、ここで討ち死にしたと伝わる。
// 足軽は信長の馬廻の供。①夜、信長について峠道を追う ②殿（しんがり）の一の手を破る
// ③山崎吉家・斎藤龍興の殿を破る ④刀根坂の峠を越え、街道から一乗谷の城下まで追う
// 向き：南東の余呉から北西の刀根坂・敦賀へ上る峠道。
// ======================================================================
import { hut, tawara } from './props.js';
import { RANKS } from './state.js';
import { gauss, enemyGroup, allyGroup, unitPos } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { demSample } from './dem.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { butaiTick, adoptGroup } from './butai.js';
import { fieldButai } from './b_yasen.js';
import { SWING } from './units.js';

// 足軽大将ほどの身分：馬廻の足軽の一手を預かり、信長の脇を固めて追う
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 略図の余呉→刀根坂（西へ約2500m、北へ約17000m）に向きを合わせる。
// 回転だけで道幅・距離・坂の高さ・兵の間隔を保つ。変換は配置時、逆変換は数値だけ。
const TURN = Math.atan2(2500, 17000), CS = Math.cos(TURN), SN = Math.sin(TURN);
const at = (x, z) => ({ x: x * CS + z * SN, z: z * CS - x * SN });
const xz = (x, z) => [x * CS + z * SN, z * CS - x * SN];
const along = (x, z) => x * SN + z * CS;
const NORTHWEST = at(0, -1), EAST = at(1, 0);
// 地形の元の座標と、実際に歩く北西向きの道を分ける。
const LOCAL_ROAD = [[4, 170], [0, 110], [-10, 60], [-4, 10], [10, -40], [6, -90], [-8, -140], [-4, -190]];
const ROAD = LOCAL_ROAD.map(([x, z]) => xz(x, z));
const PASS = at(-6, -150);           // 刀根坂の峠
// 敦賀・府中を経る数日の追撃を、場の内に縮める。実際の距離・方角を表す道ではない。
const LOCAL_CHASE = [[-6, -150], [24, -160], [62, -148], [94, -128], [120, -104], [132, -80]];
const CHASE_ROAD = LOCAL_CHASE.map(([x, z]) => xz(x, z));
const CHASE_POINTS = CHASE_ROAD.map(([x, z]) => ({ x, z }));
const STREET = at(62, -148), TOWN = at(120, -104), INNER = at(132, -80);
// 街道の曲がりにかかる家を西へ寄せ、奥への通りを空ける。家の当たりと火は同じ場所を使う。
const TOWN_HOUSES = [[96, -108], [130, -120], [102, -78], [148, -96]].map(([x, z]) => xz(x, z));
const chaseNear = (x, z) => distToPolyline(x, z, CHASE_ROAD);
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };

const FIRST_END = at(-4, 8);
const SAKA = at(4, -88);             // 刀根坂の中ほど（殿が構える坂）
// 国土地理院の標高（刀根坂。束0 の asset_dem_tonezaka.js）。ゲームの 1 を実の 3m に縮め、道の谷から離れた所の
// 尾根と沢の起伏だけを足す（道の上は手書きのまま：登れる坂は道だけ）
let tzDem = null;
let terrainDem = null;
let terrainFixed = false;
import('./asset_dem_tonezaka.js').then((m) => { tzDem = m.default; }).catch(() => {});
const DEM_XY = 3, DEM_OX = 900;
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 元の座標で、峠道の z における道の x。
function roadX(z) {
  for (let i = 0; i < LOCAL_ROAD.length - 1; i++) {
    const [x0, z0] = LOCAL_ROAD[i], [x1, z1] = LOCAL_ROAD[i + 1];
    if (z <= z0 && z >= z1) return x0 + (x1 - x0) * ((z0 - z) / (z0 - z1));
  }
  return z > LOCAL_ROAD[0][1] ? LOCAL_ROAD[0][0] : LOCAL_ROAD[LOCAL_ROAD.length - 1][0];
}
// 兵も主人公も長い移動では街道の折れをたどる。近い斬り合いでは行き先を保つ。
function chaseWay(army, u, want) {
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 14) return want;
  const z = along(u.pos.x, u.pos.z), end = along(want.x, want.z);
  const x = u.pos.x * CS - u.pos.z * SN, endX = want.x * CS - want.z * SN;
  // 峠から東へ曲がった街道は別の道。城下の兵を元の峠道へ戻さない。
  if ((x > 18 || endX > 18) && z < -58 && end < -58) {
    let from = 0, to = 0, fromD = Infinity, toD = Infinity, lane = 0;
    for (let i = 0; i < CHASE_ROAD.length - 1; i++) {
      const a = CHASE_ROAD[i], b = CHASE_ROAD[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len2));
      const v = Math.max(0, Math.min(1, ((want.x - a[0]) * dx + (want.z - a[1]) * dz) / len2));
      const d = Math.hypot(u.pos.x - a[0] - t * dx, u.pos.z - a[1] - t * dz);
      const e = Math.hypot(want.x - a[0] - v * dx, want.z - a[1] - v * dz);
      if (d < fromD) { fromD = d; from = i; lane = Math.max(-2, Math.min(2, ((u.pos.x - a[0]) * dz - (u.pos.z - a[1]) * dx) / Math.sqrt(len2))); }
      if (e < toD) { toD = e; to = i; }
    }
    if (from === to) return want;
    let i = to > from ? from + 1 : from;
    if (Math.hypot(u.pos.x - CHASE_ROAD[i][0], u.pos.z - CHASE_ROAD[i][1]) < 3) i += to > from ? 1 : -1;
    i = Math.max(0, Math.min(CHASE_ROAD.length - 1, i));
    const a = CHASE_ROAD[Math.max(0, i - 1)], b = CHASE_ROAD[Math.max(1, i)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
    q.x = CHASE_ROAD[i][0] + dz / len * lane; q.z = CHASE_ROAD[i][1] - dx / len * lane;
    return q;
  }
  if (z < -150 || end < -150) return want;
  const lane = Math.max(-3, Math.min(3, x - roadX(z)));
  let next = end;
  if (Math.abs(x - roadX(z)) > 5) next = z;
  else if (end < z) {
    for (const p of LOCAL_ROAD) if (p[1] < z - 2 && p[1] > end) { next = p[1]; break; }
  } else {
    for (let i = LOCAL_ROAD.length - 1; i >= 0; i--) {
      const p = LOCAL_ROAD[i];
      if (p[1] > z + 2 && p[1] < end) { next = p[1]; break; }
    }
  }
  if (next === end) return want;
  const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
  const side = roadX(next) + lane;
  q.x = side * CS + next * SN; q.z = next * CS - side * SN;
  return q;
}
// 道の両側の急な山腹。見えない壁は置かず、実際の傾斜を使う。
const KIRI = { z0: 16, z1: 104, off: 20 };
function kiriH(x, z) {
  const fz = sstep(KIRI.z0, KIRI.z0 + 8, z) * sstep(KIRI.z1, KIRI.z1 - 8, z);
  if (fz <= 0) return 0;
  return 6 * fz * sstep(KIRI.off - 2, KIRI.off + 1, Math.abs(x - roadX(z)));
}
function height(wx, wz) {
  const x = wx * CS - wz * SN, z = along(wx, wz);
  if (!terrainFixed) { terrainDem = tzDem; terrainFixed = true; }
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 道に沿って上る谷。両側は山
  h += z >= -150 ? Math.max(0, 120 - z) * 0.11 : Math.max(8, 29.7 + (z + 150) * 0.12);
  const d = distToPolyline(x, z, LOCAL_ROAD);
  h += Math.min(34, Math.max(0, d - 14) * 0.5);
  h += 16 * gauss(x, z, 70, -60, 2600) + 18 * gauss(x, z, -70, -100, 2600);
  h += kiriH(x, z);
  if (terrainDem && d > 55) {
    const sx = x * DEM_XY + DEM_OX, sz = z * DEM_XY;
    if (Math.abs(sx) < 1580 && Math.abs(sz) < 1580) h += sstep(55, 85, d) * Math.max(0, demSample(terrainDem, sx, sz) - 60) * 0.05;
  }
  // 元の峠と尾根を残し、その先だけ城下へ下る谷道にする。
  const blend = sstep(20, 54, x) * sstep(-58, -108, z);
  if (blend > 0) h += (31 + Math.min(22, Math.max(0, distToPolyline(x, z, LOCAL_CHASE) - 18) * 0.35) - h) * blend;
  return h;
}

// 戦える殿が残る間は、秒数だけで敗走させない。
const fighter = (u) => u.alive && !u.dying && !u.evacuatedWound && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget;
const fighting = (g) => g && !g.routed && g.units.some(fighter);
function fighters(g) {
  if (!g || g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (fighter(u)) n++;
  return n;
}
function arrived(g, p, r) {
  if (!g || g.routed) return false;
  let n = 0;
  for (const u of g.units) if (fighter(u) && !u.rearWound && !u.downed && !u.climb && !(u.pinT > g._t) && near(u.pos, p, r)) n++;
  return n >= Math.min(3, fighters(g)) && n > 0;
}
const near = (p, at, r) => Math.hypot(p.x - at.x, p.z - at.z) < r;
function march(g, path, arrive) {
  if (!g || !g.count || g.routed) return;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true;
  // 後列も、出発点から街道の曲がりをたどる。山腹へ列を伸ばさない。
  g.path = [[g.anchor.x, g.anchor.z], ...path]; g.pathIdx = 1; g.speed = 2.8;
  g.onArrive = arrive || ((q) => { q.order = 'hold'; q.formation = 'yari'; q.yariRanks = 3; });
}
function retreat(g) {
  if (!g || g.routed) return;
  g.noRout = false; g.routed = true; g.order = 'flee';
  for (const u of g.units) if (u.alive) u.fleeing = true;
}

// 前の備が崩れたら、既にいる次の備が街道で返し合わせる。味方の到着待ちと分ける。
const COUNTER_PATHS = [
  [xz(roadX(-40), -40), xz(roadX(-24), -24)],
  [xz(roadX(-90), -90), xz(roadX(-64), -64)],
  [xz(roadX(-140), -140), xz(roadX(-112), -112)],
  [CHASE_ROAD[1]], [CHASE_ROAD[3]],
];
function counterMarch(g, path) {
  if (!fighting(g) || g._countermarch) return;
  g._countermarch = true;
  march(g, path, (q) => { q.order = 'hold'; q.formation = 'yari'; q.yariRanks = 3; });
}

// 後衛の敗走は、夜の知らせと実際に流れ込む兵で次の備へ伝わる。
// 五つの備だけを半秒ほどごとに調べ、同じ敗走で士気を削り続けない。
function retreatCascade(rt) {
  const F = rt.flags;
  for (let i = 0; i < F.rears.length; i++) {
    const rear = F.rears[i];
    if (fighting(rear)) continue;
    if (rear._collapseAt == null) {
      rear._collapseAt = rt.t;
      F.pursueUntil = rt.t + 8;
    }
    const next = F.rears[i + 1];
    if (next && fighting(next) && !rear._collapseSent && rt.t >= rear._collapseAt + 6) {
      rear._collapseSent = true;
      // 知らせだけで無傷の備を敗走させず、将と供は奥で守りを続ける。
      next.morale = Math.min(next.morale, Math.max(24, next.morale - 12));
    }
    for (let j = i + 1; j < F.rears.length; j++) {
      const g = F.rears[j], bit = 1 << i;
      if (!fighting(g) || (g._fleeContact & bit)) continue;
      let touched = false;
      for (const v of rear.units) {
        if (!v.alive || !v.fleeing || v.gone) continue;
        for (const u of g.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget ||
              Math.abs(u.pos.y - v.pos.y) > 2 || !near(u.pos, v.pos, 4)) continue;
          touched = true;
          if (!u.name && !u.mounted) { u.confused = Math.max(u.confused || 0, 2.5); u.aiT = 0; }
        }
      }
      if (touched) { g._fleeContact |= bit; g.morale = Math.min(g.morale, Math.max(24, g.morale - 8)); }
    }
  }
  for (const g of F.oda) if (g.order === 'path' && !g.routed) g.speed = rt.t < F.pursueUntil ? 3.2 : 2.8;
}

const tonezaka = {
  spawn: { ...at(6, 70), heading: Math.PI + TURN },
  world: {
    seed: 15738,
    // 本物の義景の供と南の後続は歩ける地面に収め、軽い本隊は場の外に置く。
    moveLim: 280,
    groundHalf: 300,
    time: 'night',   // 十三日夜中の追撃から始める。
    nightContour: true, // 近い兵の輪郭を、共有材質の補光で見せる。
    lightning: false, // 追撃の夜まで雷が続いたとは確定できない。
    muddy: 0.95,
    terrainTags: true,   // F1：ぬかるみ・坂・道で速さと疲れが変わる（terrain_tags.js。騎馬はぬかるみと坂で弱る）
    keepSpawnInside: true,
    noticeRepeatGap: 1e9, // この戦で一度見た知らせは再掲しない。任務の札は残す。
    blockedEscape: true,
    blockedEscapeAfter: 0.7, // 通れる横道を確かめて列の脇へ出る。
    blockedHint: (rt) => `${rt.blockedMove?.cause || '道の障り'}で足が止まった。${rt.phase === 'brief' ? '下知を聞き、馬廻が動いてから続け' : '山腹へ登らず、街道の内で列の脇を通れ'}`,
    paths: [ROAD, CHASE_ROAD],
    height,
    moveWay: chaseWay,
    tint(x, z, h, c) { if (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) > 16) c.setRGB(c.r * 0.82, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 13 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38,
    trees: 700,
    tufts: 2600,
    treeDensity: (x, z) => (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 18 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38 ? 0.15 : 1),
    groves: [{ ...at(30, 40), r: 12, n: 16 }, { ...at(-34, -60), r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && along(x, z) < -235,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world, F = rt.flags;
    W.setRainTarget(0.35); // 十二日の大風雨と、十三日夜の雨量は分ける。弱い雨は補完。
    F.step = 0; F.ek = 0; F.ak = 0; F.poll = 0; F.pollAt = rt.t; F.briefAt = rt.t;
    F.roadGuide = { x: FIRST_END.x, z: FIRST_END.z };
    F.chaseWait = { t: 0, step: 0, enemies: 0, joined: false, umaX: 0, umaZ: 0, lateX: 0, lateZ: 0, umaStopped: false, lateStopped: false, rearX: 0, rearZ: 0 };
    const chief = (name, survives = false, horse = false) => ({ type: 'busho', n: 1, o: { name, horse, invuln: survives } });
    const A = (n) => ({ type: 'ashigaru', n }), S = (n) => ({ type: 'samurai', n });
    const foe = (name, at, list, width = 5) => enemyGroup(rt, {
      fixed: true, noAI: true, faction: 'saito', name, anchor: at, facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, width, aggro: 8, morale: 78, guardOn: true,
      fleeDir: { ...NORTHWEST },
    }, dress(list, ASA));
    F.uma = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '信長の馬廻', anchor: at(2, 66), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      dress(rt.G.lord ? [S(4), S(4), A(16)] : [A(8), S(4), chief('織田信長', true, true), S(4), A(8)], ODA));
    F.nobuU = rt.G.lord ? rt.player.u : F.uma.units.find((u) => u.name === '織田信長');
    F.uma.leader = rt.G.lord ? F.uma.units[0] : F.nobuU;
    if (!rt.G.lord) F.nobuU.allyOk = true;
    F.late = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '柴田勝家の手', anchor: at(6, 90), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      dress([S(3), chief('柴田勝家', true, true), S(3), A(14)], ODA));
    F.late.leader = F.late.units.find((u) => u.type === 'busho'); F.late.leader.allyOk = true;
    F.oda = [F.uma, F.late];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad(at(10, 76), Math.PI + TURN, [{ kind: 'spear', n }]);
    // 供は馬廻の後ろから出る。傷は通すが、疲れた殿の一突きで組が溶けないようにする。
    for (const g of rt.squadGroups) g.defMult = 1.25;
    // 全ての戦う兵を初めに置く。武将は槍の前列より後ろで供に守られる。
    F.r1 = foe('河合吉統の殿', at(-6, 40), [A(6), S(2), chief('河合吉統'), S(2)]);
    F.r1b = foe('朝倉の殿の二の手', at(-4, 8), [A(6), S(2)]);
    F.r2 = foe('山崎吉家の手', at(4, -74), [A(7), S(2), chief('山崎吉家'), S(2)]);
    F.r3 = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: '斎藤龍興の手', anchor: at(6, -106), facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, width: 5, aggro: 8, morale: 78, guardOn: true, fleeDir: { ...NORTHWEST } },
      dress([A(6), S(1), chief('斎藤龍興'), S(2)], { flag: 'saito' }));
    F.r4 = foe('詫美越後守の殿', at(-4, -142), [A(6), S(2), chief('詫美越後守'), S(2)]);
    F.roadG = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: '街道で向き直る朝倉勢', anchor: STREET, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, aggro: 8, morale: 65, fleeDir: { ...EAST } }, dress([A(6), S(2)], ASA));
    F.townG = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: '城下に残った朝倉の兵', anchor: TOWN, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, aggro: 8, morale: 65, fleeDir: { ...EAST } }, dress([A(6), S(2)], ASA));
    F.hurtG = foe('道脇を退く朝倉の兵', at(-8, -48), [A(4)], 2);
    for (const u of F.hurtG.units) { u.hp = Math.min(u.hp, u.maxHp * 0.25); u.dmg = 0; u.yariOpenUntil = 1e9; }
    retreat(F.hurtG);
    // 義景は峠の向こうへ退く本隊の内。静止した陣幕・床几は置かない。
    F.yoshikage = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: '朝倉義景と旗本', anchor: at(-4, -200), facing: Math.PI + TURN,
      order: 'hold', formation: 'column', colW: 2, aggro: 2, morale: 60, noRout: true, arriveNoncombat: true, fleeDir: { ...NORTHWEST } },
      dress([S(4), chief('朝倉義景', true, true), S(5), A(6)], ASA));
    // 峠の殿が持ちこたえる間は、供と先の曲がりで待つ。開戦直後の逃亡札を出さない。
    for (const u of F.yoshikage.units) u.noTarget = true;
    march(F.yoshikage, [xz(-4, -216)], (g) => { g.order = 'hold'; });
    F.yoshikage.speed = 0.6; F.yoshikage.aggro = 0;
    F.rears = [F.r1, F.r1b, F.r2, F.r3, F.r4];
    // 殿だけが先に向き直る。中ほどの備は疲れた二列の退き足で、接敵してから槍をそろえる。
    for (let i = 0; i < F.rears.length; i++) {
      const g = F.rears[i];
      g.morale = i < 2 ? 68 : 58; g._fleeContact = 0;
      for (const u of g.units) { u.fat = Math.max(u.fat || 0, 0.35); if (u.mounted) u.hfat = Math.max(u.hfat || 0, 0.3); }
      if (i < 2) continue;
      const z = along(g.anchor.x, g.anchor.z) - 8;
      march(g, [xz(roadX(z), z)], (q) => { q.order = 'hold'; });
      g.speed = 1.6; g.facing = Math.PI + TURN; g._retreatColumn = true;
      // 疲れた徒歩は歩幅も間隔もそろわない。接敵後は元の槍の持ち場へ戻す。
      const slot = g.slotPos;
      g.slotPos = function (i, n) {
        const p = slot.call(this, i, n);
        if (this._retreatColumn) {
          const side = this.slotJit(i, 4) * 0.45, lag = (i % 4) * 0.55;
          p.x += side * CS + lag * SN; p.z += lag * CS - side * SN;
        }
        return p;
      };
      for (let j = 0; j < g.units.length; j++) {
        const u = g.units[j];
        if (!u.mounted && !u.name) { u.fat = 0.35 + (j % 4) * 0.08; u.speed *= 0.85 + (j % 3) * 0.05; }
      }
    }
    F.defenders = [...F.rears, F.roadG, F.townG];
    // 正面決戦の精兵ではなく、退きながら道を塞ぐ疲れた小勢。
    for (const g of F.defenders) g.dmgMult = 0.85;
    for (const g of [...F.rears, F.roadG, F.townG, F.yoshikage]) for (const u of g.units) u.duelDone = true;
    // 遠景は道幅に合わせた長い列。近い退く兵だけ、共通の人数枠の中で本物へ替える。
    const fb = (name, team, nominal, x, z, facing) => fieldButai(rt, {
      name, team, nominal, at: at(x, z), facing: facing + TURN, kind: 'ashigaru', faction: team ? 'saito' : 'oda',
      armor: team ? 0x33291f : 0x2b3140, flag: team ? 'asakura' : 'oda',
      lightWidth: 5, lightDepth: 24, realMax: team ? 6 : 0, morale: team ? 60 : 85,
    });
    // 後続の将と供も初めから本物。先の馬廻へ新手として加えず、後ろの列を守る。
    F.followers = [];
    const follow = (name, nominal, x, z) => {
      const b = fb(name + 'の備', 0, nominal, x, z, Math.PI);
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: name + 'と供',
        anchor: at(x, z), facing: Math.PI + TURN, formation: 'column', colW: 2, width: 5, aggro: 4 },
        dress([S(2), chief(name, true, true), S(2)], ODA));
      g.leader = g.units.find((u) => u.type === 'busho'); g.leader.allyOk = true;
      adoptGroup(b, g);
      // fieldButai の固有の切替は noSwitch を読まないため、この備では明示して止める。
      b._autoSwitch = () => {};
      F.followers.push(g);
      return b;
    };
    F.bO = {
      niwa: follow('丹羽長秀', 150, 2, 186),
      hashiba: follow('羽柴秀吉', 150, 10, 214),
      takigawa: follow('滝川一益', 120, -2, 238),
      sakuma: follow('佐久間信盛', 60, 4, 260),
    };
    // 峠の向こうの旗と退く列を残す。近い義景の供は上で本物を置く。
    F.fleeB = [fb('朝倉義景の本隊', 1, 260, -4, -230, Math.PI), fb('朝倉の荷駄と後備え', 1, 200, 10, -260, Math.PI)];
    for (const b of F.fleeB) {
      b.realMax = 0; // 義景の供は既に置いてある。逃げる本隊から戦う兵を足さない。
      b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 40, z: b.pos.z + NORTHWEST.z * 40 }, form: 'column' });
      b.light.moveTo(b.pos.x + NORTHWEST.x * 40, b.pos.z + NORTHWEST.z * 40, 500, { back: true });
    }
    // 荷駄の歩みは遅く、前が止まれば後ろも詰まる。戦う殿の進みを待たせない。
    F.baggage = F.fleeB[1]; F.baggageStopAt = rt.t + 12; F.baggageResumeAt = 0;
    F.baggageTo = { x: F.baggage.pos.x + NORTHWEST.x * 100, z: F.baggage.pos.z + NORTHWEST.z * 100 };
    F.baggage.light.moveTo(F.baggageTo.x, F.baggageTo.z, 85, { back: true });
    const loadX = F.baggage.pos.x + NORTHWEST.x * (100 * 12 / 85), loadZ = F.baggage.pos.z + NORTHWEST.z * (100 * 12 / 85);
    rt.scene.add(tawara(W, loadX + CS * 3, loadZ - SN * 3, TURN, 4));
    for (const [x, z, r] of [[-14, 30, 0.4], [16, -20, -0.3], [-10, -70, 0.2], [14, -118, 0.1]]) { const p = at(x, z); rt.scene.add(tawara(W, p.x, p.z, r + TURN, 4)); }
    { const p = at(-30, 70); rt.scene.add(hut(W, p.x, p.z, 6, 4, 0.3 + TURN, { wall: 0x5a4a38 })); }
    for (const [x, z] of TOWN_HOUSES) rt.scene.add(hut(W, x, z, 7, 5, TURN, { wall: 0x6a5844 }));
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '預かった組で馬廻の列を支えよ' : '信長公の供の列に続け', 'main');
    rt.say('組頭', '信長公が先に出られた。朝倉は刀根口へ退く。供の列を離れるな', 5);
    rt.marker('nobu', unitPos(F.nobuU), '信長公の馬廻', {});
    rt.marker('asakuraMain', unitPos(F.yoshikage.units.find((u) => u.name === '朝倉義景')), '峠の先へ退く朝倉の旗', {});
    rt.after(5, () => { if (rt.phase === 'brief') this.chase(rt); });
  },
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; rt.setPhase('chase');
    rt.banner('刀根坂の追い討ち', '退く朝倉勢が、街道で向き直る');
    rt.obj('main', '馬廻の列と、街道で向き直る敵を押し崩せ', 'main');
    march(F.uma, [[-10, 60], [-6, 48], [-4, 16]].map(([x, z]) => xz(x, z)));
    march(F.late, [[0, 82], [-10, 60], [-6, 48], [-4, 24]].map(([x, z]) => xz(x, z)));
    for (const b of Object.values(F.bO)) {
      if (b.light) b.light.advance(60, 45);
      const z = along(b.real.anchor.x, b.real.anchor.z);
      march(b.real, [xz(roadX(z - 60), z - 60)]);
    }
  },
  second(rt) {
    const F = rt.flags;
    F.step = 2; rt.setPhase('second');
    rt.marker('toneRoad', () => F.roadGuide, '坂へ向かう街道', { h: 2 });
    rt.award((t) => t.side.push('街道の殿を崩した'), '街道の殿を崩した');
    rt.obj('main', '味方と坂を上り、向き直る敵の槍を崩せ', 'main');
    rt.say('組頭', '坂の敵が引き返すぞ。味方と槍をそろえて受けよ', 4);
    counterMarch(F.r2, COUNTER_PATHS[0]);
    march(F.uma, [...ROAD.slice(3, 6), xz(roadX(-98), -98)]);
    march(F.late, ROAD.slice(3, 6));
  },
  toPass(rt) {
    const F = rt.flags;
    F.step = 3; rt.setPhase('pass'); rt.unmark('toneRoad');
    rt.obj('main', '峠口の敵を崩し、味方の列と峠の印へ', 'main');
    rt.unmark('nobu'); rt.marker('pass', PASS, '刀根坂の峠', { h: 2 });
    rt.say('組頭', '退く者を追って列を割るな。峠口の槍を押し崩せ', 4);
    march(F.uma, ROAD.slice(6, 7)); march(F.late, ROAD.slice(6, 7));
  },
  toIchijodani(rt) {
    const F = rt.flags;
    F.step = 4; F.chaseIdx = 1; rt.setPhase('road');
    rt.unmark('asakuraMain'); retreat(F.yoshikage);
    for (const b of F.fleeB) b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 100, z: b.pos.z + NORTHWEST.z * 100 }, form: 'column' });
    rt.unmark('pass'); rt.unmark('nobu');
    rt.world.setRainTarget(0); rt.world.setTime('morning');
    // 実際には敦賀に十四〜十六日留まり、十七日に木ノ芽峠を越える。
    rt.banner('越前への追撃', '数日の道のりをまとめてたどる。敦賀から木ノ芽峠を越え、府中へ');
    rt.say('組頭', '信長公は府中へ進まれる。先の組につき、街道を進め', 4);
    rt.obj('main', '先の組に続き、越前の街道を進め', 'main');
    rt.marker('chase', () => CHASE_POINTS[Math.min(F.chaseIdx, 3)], '街道の行き先', { h: 2 });
    for (const g of F.oda) march(g, CHASE_ROAD.slice(0, 4));
  },
  townAttack(rt) {
    const F = rt.flags;
    F.step = 5; rt.setPhase('town'); rt.unmark('chase');
    rt.world.setTime('day');
    rt.banner('一乗谷の城下', '八月十八日以後。信長公は府中、先手は一乗谷へ');
    rt.say('伝令', '勝家様の手に加われとの下知。城下の道を押さえよ', 4);
    rt.obj('main', '勝家の手に続き、城下の道を押さえよ', 'main');
    rt.marker('town', TOWN, '城下の道', { h: 2 });
    // 府中で下知する信長を城下へ同行させない。街道の位置は場の圧縮。
    march(F.uma, [CHASE_ROAD[2]]);
    F.townFriends = [F.late]; march(F.late, CHASE_ROAD.slice(3, 5));
  },
  townFire(rt) {
    const F = rt.flags;
    F.step = 6; F.stepT = rt.t; F.secureT = 0;
    rt.setPhase('fire'); rt.unmark('town');
    rt.say('伝令', '織田の先手が城下へ火をかけたとの報せです。道の守りを離れるな', 4);
    TOWN_HOUSES.forEach(([x, z], i) => rt.after(i * 2, () => { rt.world.addFire(x, z, { h: 2, size: 2.4 }); }));
    rt.banner('一乗谷の火', '城下に火が上がる。義景は大野へ逃れたという');
    rt.obj('main', '勝家の手と共に、城下の奥の道を固めよ', 'main');
    rt.marker('inner', INNER, '奥の道の守り場', { h: 2 }); rt.zone('inner', INNER.x, INNER.z, 12);
    march(F.late, CHASE_ROAD.slice(4));
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('inner'); rt.unzone('inner');
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '城下の道を押さえた', pts: 20 }; }, '任務達成・城下の道を押さえた');
    rt.banner('城下の道を押さえた', '先手と共に、峠・街道・城下を進んだ');
    // 未来の自害を、十八日の足軽へ即時に知らせない。後日の解説に残す。
    rt.say('組頭', '道は押さえた。先の追手は大野へ向かう。我らは近江へ戻るぞ', 4);
    rt.player.u.invuln = true; rt.finish({}, 10);
  },
  lose(rt, why) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('toneRoad'); rt.unmark('asakuraMain');
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('nobu'); rt.unmark('pass'); rt.unmark('chase'); rt.unmark('town'); rt.unmark('inner');
    rt.say('組頭', '残る者は近江側の道へ退け。列を寄せ直すぞ！', 4);
    rt.banner('追い手の列が崩れた', why || 'この組では追い討ちを続けられぬ'); rt.objProgress('main', why || ''); rt.unzone('inner');
    rt.finish({ failureReason: why || 'この組では追い討ちを続けられぬ' }, 8);
  },
  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    const bag = F.baggage;
    if (!F.baggageResumeAt && rt.t >= F.baggageStopAt) {
      bag.light.halt(); F.baggageResumeAt = rt.t + 4;
    } else if (F.baggageResumeAt && rt.t >= F.baggageResumeAt) {
      bag.light.moveTo(F.baggageTo.x, F.baggageTo.z, 60, { back: true });
      F.baggageResumeAt = 0; F.baggageStopAt = Infinity;
    }
    // 見えない近い敵は声の方角で知らせる。同じ方角は連呼せず、声が途切れてから知らせ直す。
    if (F.step >= 1 && rt.t >= (F.enemyListenAt || 0)) {
      F.enemyListenAt = rt.t + 1;
      const p = rt.player.u.pos;
      let closest = null, distance = 30;
      for (const u of rt.army.units) {
        if (!fighter(u) || u.rearWound || u.downed || u.team === rt.player.u.team || u.group?.hidden || u.group?.ambush) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d >= distance || sightUnit(rt, u)) continue;
        closest = u; distance = d;
      }
      if (closest) F.enemyHeardAt = rt.t;
      else if (rt.t - (F.enemyHeardAt ?? rt.t) >= 8) F.enemyVoiceDirection = '';
      if (closest && rt.t >= (F.enemyVoiceAt || 0)) {
        const dx = closest.pos.x - p.x, dz = closest.pos.z - p.z;
        const e = rt.camera?.matrixWorld.elements;
        const side = e ? dx * e[0] + dz * e[2] : dx * Math.cos(rt.player.yaw) - dz * Math.sin(rt.player.yaw);
        const front = e ? -dx * e[8] - dz * e[10] : dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw);
        const direction = Math.abs(side) > Math.abs(front) ? side > 0 ? '右' : '左' : front > 0 ? '前' : '後ろ';
        if (direction !== F.enemyVoiceDirection) {
          F.enemyVoiceDirection = direction; F.enemyVoiceAt = rt.t + 8;
          rt.bark(`${direction}に敵の声！`, true);
        }
      }
    }
    // 味方の曲がり角での停滞だけをほどく。殿全隊が主人公へ総攻撃する下知は出さない。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, [], F.oda, F.step <= 3 ? '街道を北西へ。味方と向き直る敵を押し返せ' : '街道の印へ。先手と城下の道を押さえよ');
    const hit = rt.player.lastHit;
    if (hit && rt.t - hit.t < 8 && hit.t !== F.hurtHitT && rt.t >= (F.hurtWarnT || 0)) {
      F.hurtHitT = hit.t; F.hurtWarnT = rt.t + 8;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった。' : '鉄砲で撃たれた。') : hit.back ? '背を突かれた。' : hit.side ? '横から打たれた。' : '正面から打たれた。';
      rt.bark(cause + (hit.ranged ? '横へ避け、味方の列の後ろへ下がれ' : hit.exhausted || hit.guardBroken ? '気力が尽きて構えが崩れた。味方の後ろへ退き、気力を戻せ' : '敵へ向いて構え、味方の列の後ろへ下がれ'), true);
    }
    for (const g of F.rears) if (!g._shown && fighting(g)) {
      let seen = false;
      for (const u of g.units) if (u.alive && near(u.pos, rt.player.u.pos, 30) && sightPoint(rt, u.pos)) { seen = true; break; }
      if (seen) g._shown = true;
    }
    if (rt.t >= (F.chiefNoteT || 0)) for (const g of F.rears) {
      if (g._chiefNamed || !fighting(g)) continue;
      const u = g.units.find((q) => q.type === 'busho' && q.alive && !q.fleeing);
      if (u && near(u.pos, rt.player.u.pos, 30) && sightPoint(rt, u.pos)) {
        g._chiefNamed = true; F.chiefNoteT = rt.t + 8;
        rt.say('物見', `${u.name}の旗が見える。退く備の将じゃ。味方と槍の列を崩せ`, 3.5); break;
      }
    }
    for (let i = 0; i < F.rears.length; i++) if (!fighting(F.rears[i])) rt.unmark('rear' + i);
    F.poll -= dt;
    if (F.poll > 0) return;
    const elapsed = Math.max(0, rt.t - F.pollAt); F.pollAt = rt.t; F.poll = 0.4;
    const p = rt.player.u.pos;
    if (F.step >= 1 && F.step <= 3) {
      for (const g of F.rears) {
        if (!g._retreatColumn || !fighting(g)) continue;
        let close = near(p, g.anchor, 24);
        for (const a of F.oda) for (const u of a.units) {
          if (u.alive && !u.fleeing && !u.woundOut && near(u.pos, g.anchor, 24)) close = true;
        }
        if (!close) continue;
        g._retreatColumn = false; g.order = 'hold'; g.path = null;
        g.formation = 'yari'; g.yariRanks = 3; g.facing = TURN; g._face = TURN;
      }
      retreatCascade(rt);
    }
    // 列の八割以上が戦えなくなった備は退く。残兵探しや秒数だけの敗走にしない。
    for (const g of F.defenders) {
      const n = fighters(g);
      if (n > 0 && n <= 3 && n <= g.initial * 0.2) { retreat(g); this.onRout(rt, g); }
    }
    if (F.step >= 1 && !fighting(F.r1) && !fighting(F.r1b)) {
      counterMarch(F.r2, COUNTER_PATHS[0]);
      if (!fighting(F.r2)) {
        counterMarch(F.r3, COUNTER_PATHS[1]);
        if (!fighting(F.r3)) {
          counterMarch(F.r4, COUNTER_PATHS[2]);
          if (!fighting(F.r4)) {
            counterMarch(F.roadG, COUNTER_PATHS[3]);
            if (!fighting(F.roadG)) counterMarch(F.townG, COUNTER_PATHS[4]);
          }
        }
      }
    }
    if (F.step === 0) rt.objProgress('main', `あと${Math.max(0, Math.ceil(5 - (rt.t - F.briefAt)))}秒で馬廻が進む。動き出した列に続け`);
    if (F.step >= 1 && F.step <= 3) {
      const joined = arrived(F.uma, p, 22) || arrived(F.late, p, 22);
      const n = F.step === 1 ? fighters(F.r1) + fighters(F.r1b) : F.step === 2 ? fighters(F.r2) + fighters(F.r3) : fighters(F.r4);
      const wait = F.chaseWait, uc = F.uma.center(), lc = F.late.center();
      wait.umaStopped = wait.t > 0 && Math.hypot(uc.x - wait.umaX, uc.z - wait.umaZ) < 0.1;
      wait.lateStopped = wait.t > 0 && Math.hypot(lc.x - wait.lateX, lc.z - wait.lateZ) < 0.1;
      wait.t = rt.t; wait.step = F.step; wait.enemies = n; wait.joined = joined;
      wait.umaX = uc.x; wait.umaZ = uc.z; wait.lateX = lc.x; wait.lateZ = lc.z;
      let seenRear = null, rearDist = Infinity;
      for (const g of F.rears) if (g._shown && fighting(g)) {
        const c = g.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 30 && d < rearDist && sightPoint(rt, c)) { rearDist = d; seenRear = g; wait.rearX = c.x; wait.rearZ = c.z; }
      }
      if (F.step === 2) {
        // 見える槍の持ち場を示す。崩れた後や見えない時は、坂までの曲がり角を示す。
        const guide = seenRear ? seenRear.center() : chaseWay(rt.army, rt.player.u, SAKA);
        F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
      }
      const direction = along(wait.rearX, wait.rearZ) < along(p.x, p.z) ? '北西' : '南東';
      const remaining = seenRear ? `敵の槍は${direction}じゃ。味方と押せ` : '街道を北西へ進め。向き直る敵を味方と押せ';
      rt.objProgress('main', n ? remaining : !joined ? '味方の旗へ戻り、列と進め' : F.step === 1 ? '敵の槍は崩れた。街道を北西へ、坂の入口へ進め' : F.step === 2 ? '坂の槍は崩れた。曲がる街道を北西へ進め' : '峠口の敵は退いた。刀根坂の峠の印へ');
    }
    else if (F.step === 4) rt.objProgress('main', F.chaseIdx === 2 && fighting(F.roadG) ? '街道で向き直る敵を味方と押し戻せ' : !(arrived(F.uma, p, 22) || arrived(F.late, p, 22)) ? '味方の旗へ戻り、列と街道の印へ進め' : `街道の印 ${Math.min(F.chaseIdx, 3)}／3。先の組に続け`);
    else if (F.step === 5) rt.objProgress('main', fighting(F.townG) ? '城下に残る敵を味方と退けよ' : !arrived(F.late, TOWN, 22) ? '勝家の旗へ戻り、列と城下の道へ進め' : '城下の道の印へ進め');
    else if (F.step === 6) {
      rt.objProgress('main', !near(p, INNER, 12) ? '奥の印へ寄り、道を守れ' : !arrived(F.late, INNER, 18) ? '勝家の旗へ戻り、列を奥の道へ導け' : `味方と道を守っている ${Math.min(8, Math.floor(F.secureT))}／8秒`);
    }
    // 馬廻は士気だけで総崩れにしない。供が実際に倒れ、三人を切った時だけ追撃を断つ。
    const shaky = (F.step >= 5 && !fighting(F.late)) || (F.step > 0 && F.step < 5 && !fighting(F.uma) && !fighting(F.late));
    if (shaky && !F.shakyWarn) { F.shakyWarn = true; rt.say('組頭', F.step >= 5 ? '勝家の先手が崩れかけておる！　勝家の旗へ寄って支えよ' : '馬廻が浮き足立った！　信長公の旗へ寄り、列を立て直せ', 4); }
    if ((F.step >= 5 && fighters(F.late) < 3) || (F.step > 0 && F.step < 5 && fighters(F.uma) < 3 && fighters(F.late) < 3)) {
      this.lose(rt, F.step >= 5 ? '城下の道を守る先手が崩れた' : '峠へ追う信長公の馬廻と後続が崩れた'); return;
    }
    // 目の前の槍の構えを崩す。主人公の到着と列の進みを求める。
    if (F.step === 1 && !fighting(F.r1) && !fighting(F.r1b) && along(p.x, p.z) < 35 && (arrived(F.uma, p, 22) || arrived(F.late, p, 22))) this.second(rt);
    else if (F.step === 2 && !fighting(F.r2) && !fighting(F.r3) && along(p.x, p.z) < -80 && (arrived(F.uma, p, 22) || arrived(F.late, p, 22))) this.toPass(rt);
    else if (F.step === 3 && !fighting(F.r4) && near(p, PASS, 10) && (arrived(F.uma, PASS, 24) || arrived(F.late, PASS, 24))) this.toIchijodani(rt);
    else if (F.step === 4) {
      const at = CHASE_POINTS[Math.min(F.chaseIdx, 3)];
      if (near(p, at, 12) && (F.chaseIdx !== 2 || !fighting(F.roadG)) && (arrived(F.uma, p, 22) || arrived(F.late, p, 22))) F.chaseIdx++;
      if (F.chaseIdx >= 4) this.townAttack(rt);
    } else if (F.step === 5 && near(p, TOWN, 14) && !fighting(F.townG) && arrived(F.late, TOWN, 22)) this.townFire(rt);
    else if (F.step === 6) {
      if (near(p, INNER, 12) && arrived(F.late, INNER, 18) && !fighting(F.townG)) F.secureT += elapsed;
      else F.secureT = 0;
      if (F.secureT >= 8) this.win(rt);
    }
  },
  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.type === 'busho' && v.team === 1 && v.group) v.group.morale -= 35;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0) || !near(rt.player.u.pos, g.center(), 35)) return;
    g._routSaid = true; F.routSayT = rt.t + 8;
    const line = F.routLine = ((F.routLine || 0) + 1) % 3;
    rt.say('足軽', line === 0 ? '敵が退くぞ！　味方の旗に続け！' : line === 1 ? '槍の列が崩れた！　街道を押さえろ！' : '道が開いた！　一人で追うな！', 3);
  },
};
// 総勢は参考値。局地の一人の死を三十人・六十人の死へ換算しない。
tonezaka.force = () => ({ a: 30000, a0: 30000, b: 20000, b0: 20000 });
tonezaka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '朝倉軍', mon: 'asakura' } };
tonezaka.taisho = { a: null, b: null }; // 固有の馬廻と退く本隊を使い、共通の討ち取り勝ちを足さない。
tonezaka.noTaishoRaid = true;
tonezaka.noWake = true;
tonezaka.noRevive = true; // 深手から数秒で体力を戻し、戦い直す救済を足さない。
tonezaka.noDistantBattle = true;
tonezaka.lordHata = { spear: 12 };
tonezaka.rts = false;
tonezaka.gungi = () => null; // 足軽が柴田勝家の進路・全軍の作戦を決める軍議を作らない。
tonezaka.famous = []; // 河合らは初めから供と配置し、共通の名将追加を重ねない。
tonezaka.date = (rt) => rt.flags.step >= 5 ? '天正元年八月十八日以後　一乗谷の城下' : rt.flags.step >= 4 ? '天正元年八月十四日〜十八日　越前への追撃' : '天正元年八月十三日〜十四日　刀根坂の追撃';
tonezaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '追い討ちの下知まで待つ' : '');
tonezaka.skip = (rt) => { if (rt.phase === 'brief') tonezaka.chase(rt); };
tonezaka.history = '天正元年（1573）八月、織田信長は浅井長政の小谷城を囲んだ。後詰に出てきた朝倉義景は、大嵐の夜に大嶽などの砦を落とされると、陣を払って越前へ退き始めた。信長はこれを読んでいて、諸将に「油断するな」と命じていた。しかし先手の諸将は遅れ、信長は自ら先に立って追った（あとで諸将を叱ったと『信長公記』は伝える）。刀根坂で追いついた織田勢は朝倉勢を崩し、三千余りを討った。朝倉の重臣・山崎吉家や、美濃を追われて朝倉に身を寄せていた斎藤龍興も討ち死にしたと伝わる。義景は一乗谷へ逃れたが、織田勢の追撃は敦賀から府中へ続いた。『信長公記』巻六は、八月十八日に信長が府中の龍門寺に陣を置き、義景が一乗谷を捨てて大野へ逃れ、柴田勝家らが追ったと記す。一乗谷は焼かれた。朝倉景鏡は織田方へ寝返り、八月二十日、義景は大野で自害して朝倉家は滅んだ。史実の流れは『信長公記』を先にしている。兵の数には諸説ある。遊びでは数日の道のりを縮め、街道や城下に残る兵との戦いを補っている。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tonezaka.lordAt = { ...at(2, 128), r: 12, why: '馬廻の先頭（信長は自ら馬を出し、朝倉勢を追った）' };

// 自動操作も、戦う殿と持ち場を同じ条件で進む。
tonezaka.botOrders = true;
tonezaka.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups.some((g) => g.order !== 'follow')) {
    inp.quickCmd = 'follow'; b.botCmdT = b.t + 2;
  }
  // 下知の間は静止した馬廻の中央へ歩かない。列が進み始めてから供として続く。
  if (F.step === 0) return;
  // 近い兵より、実際にこちらへ打ち込んでいる兵を先に受ける。
  let attacker = null, ad = 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos, false)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 馬廻や組の兵への振りを、自分への打ち込みとして受け続けない。
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow;
    if (!charge && !atk && !swing) continue;
    // 近い兵がまだ溜めていても、横の兵の穂先が先に届くならそちらを受ける。
    const motion = atk ? (SWING[o.atk.kind] || SWING.thrust) : null;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) :
      o.atk.t + motion[0] * motion[1] * (o.atk.fast ? 0.7 : 1);
    if (d < 10 && (soon < soonest || soon === soonest && d < ad)) { attacker = o; ad = d; soonest = soon; }
  }
  // 坂の上や物陰の兵を、届く相手として追い続けない。
  const e = attacker || strikeTarget(b, 12);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 敵へ詰める時も、当たりで止まったら回り込む共通の歩きを使う。
    // 狙いの固定で、その回り込みの向きへ引き戻されないようにする。
    if (p.lock) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵の槍は三歩余り、自分の槍は二歩余り。打ち込みを見た時に足を止めると、
    // こちらだけ届かない所で受け続ける。騎馬の突進以外は受けながら間合いを詰める。
    if (d > reach * 0.85 && !e.charging) {
      goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 回り込む歩みを残し、突きも構えも相手へ向ける。
      // 間合いの端で歩く向きのまま突くと、敵の横へ空振りする。
      const walk = p.yaw;
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyW');
      const turn = walk - p.yaw;
      if (Math.cos(turn) > 0.3) inp.k.add('KeyW');
      else if (Math.cos(turn) < -0.3) inp.k.add('KeyS');
      if (Math.sin(turn) > 0.3) inp.k.add('KeyA');
      else if (Math.sin(turn) < -0.3) inp.k.add('KeyD');
    }
    if (attacker) {
      // 振りかぶりの初めから構えると、穂先が来る頃には受け流しの間が終わる。
      // 大振りも、実際に穂先が届く直前に構える。長い溜めの間は気力を戻す。
      const guardLead = p.parryWin() * (u.mobbed ? 0.7 : 1) * 0.65;
      inp.guardHold = !!e.charging || soonest <= guardLead;
      if (inp.guardHold) p.botStrikeUntil = 0;
      // 打ち手が交代しても、まだ長く溜めているなら普通の突きを出せる。
      // 全ての打ち手のうち最も早い一撃まで、余裕がある時だけ割り込む。
      else if (d < reach && soonest > 0.85 && e.atk?.t > 0.65) patientStrike(p, inp, e, d, true);
    }
    // 構えをくじで切り替えると、解いた直後の払いに化けて気力が尽きる。
    // 打ち込みを受けた後、構えを解く時間を保ってから突く。
    else if (d < reach) patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  const tgt = F.step === 1 ? [F.r1, F.r1b].find(fighting) : F.step === 2 ? [F.r2, F.r3].find(fighting) : F.step === 3 ? (fighting(F.r4) ? F.r4 : null) : F.step === 4 ? (fighting(F.roadG) ? F.roadG : null) : F.step === 5 && fighting(F.townG) ? F.townG : null;
  if (tgt) {
    // 隊の中心には、深手で戦えない兵も含まれる。そこへ着いて待ち続けず、戦える兵へ向かう。
    let next = null, distance = Infinity;
    for (const o of tgt.units) {
      if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.gone) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < distance) { distance = d; next = o; }
    }
    if (next) { goTo(p, inp, next.pos.x, next.pos.z, 2); return; }
  }
  const at = F.step === 1 ? FIRST_END : F.step === 2 ? SAKA : F.step === 3 ? PASS : F.step === 4 ? CHASE_POINTS[Math.min(F.chaseIdx, 3)] : F.step === 5 ? TOWN : F.step === 6 ? INNER : F.uma.center();
  goTo(p, inp, at.x, at.z, 3);
};

// 信長公記巻六：信長の先駆けと遅れる先手、朝倉の退却。
// 長蛇は軍学上の史実の陣名でなく、細い街道に沿う並びの呼び名。
installBattleJinkei(tonezaka, [
  battleJin('街道に続く追い手', 0, at(2, 124), Math.PI + TURN, [
    ['tone_nobunaga', '追い手の先頭・馬廻', '織田信長', 2000, at(2, 124), 'eiraku', 'oda', (r) => r.flags.uma, { form: 'column' }],
    ['tone_shibata', '遅れて追いつく先手', '柴田勝家', 6000, at(6, 164), 'oda', 'oda', (r) => r.flags.late, { form: 'column' }],
    ['tone_niwa', '後続の備え', '丹羽長秀', 6000, at(2, 186), 'oda', 'oda', (r) => r.flags.bO?.niwa],
    ['tone_hashiba', '後続の備え', '羽柴秀吉', 6000, at(10, 214), 'oda', 'oda', (r) => r.flags.bO?.hashiba],
    ['tone_takigawa', '後続の備え', '滝川一益', 5000, at(-2, 238), 'takigawa', 'takigawa', (r) => r.flags.bO?.takigawa],
    ['tone_sakuma', '後続の備え', '佐久間信盛', 5000, at(4, 260), 'oda', 'oda', (r) => r.flags.bO?.sakuma],
  ], '諸将の参戦を採用。備ごとの数と後続の順は推定で、信長が先手を待たず追う筋を保つ。'),
  battleJin('殿から峠へ続く退きの備え', 1, at(-4, -200), TURN, [
    ['tone_kawai', '街道の殿', '河合吉統', 2000, at(-6, 40), 'asakura', 'asakura', (r) => r.flags.r1],
    ['tone_yamazaki', '坂の返し合わせ', '山崎吉家', 3000, at(4, -74), 'asakura', 'asakura', (r) => r.flags.r2],
    ['tone_saito', '坂の脇の備え', '斎藤龍興', 1500, at(6, -106), 'saito', 'saito', (r) => r.flags.r3],
    ['tone_takumi', '峠口の後備え', '詫美越後守', 2500, at(-4, -142), 'asakura', 'asakura', (r) => r.flags.r4],
    ['tone_yoshikage', '峠を越える本隊', '朝倉義景', 6000, at(-4, -200), 'asakura', 'asakura', (r) => r.flags.fleeB?.[0]],
    ['tone_nida', '先へ退く荷駄と後備え', '将の名は不明', 5000, at(10, -240), 'asakura', 'asakura', (r) => r.flags.fleeB?.[1], { named: false }],
  ], '朝倉二万の参考兵数を割り振った復元。朝倉は初めから疲れと乱れがあり、向きをそろえて正面決戦にはしない。'),
]);

export { tonezaka };
