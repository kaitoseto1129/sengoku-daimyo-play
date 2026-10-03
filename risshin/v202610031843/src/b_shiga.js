// ======================================================================
// 織田家編　志賀の陣・宇佐山城（元亀元年九月）
// 信長が摂津の野田・福島に出ている間に、浅井・朝倉の三万が湖の西を下って坂本へ出てきた。
// 宇佐山城を守る森可成は、信長の弟・織田信治とともに坂本で迎え撃ち、二人とも討ち死にした。
// 城は残った者たちが守り通し、摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった。
// 足軽は森可成の手。①坂本の町口で朝倉の先手を迎え撃つ ②大軍に押され、宇佐山城へ退く
// ③宇佐山城の木戸を守る（寄せ手が木戸を破りにかかる）。信長の後詰が来るまで持ちこたえる
// 九月十六日の町口の小勝ち→十九日の両手からの攻撃→城への退き→端城の放火と籠城→二十四日の後詰。
// 日をまたぐ経過は札で示す。両手の位置と木戸の攻防は遊びのための推定復元。
// 向き：東（+x）が琵琶湖。北（-z）から浅井・朝倉が湖の西を下ってくる。南（+z）の山の上に宇佐山城。西に比叡山
// ======================================================================
import { yamaLift, benchRoads, switchback } from './yamalift.js';
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara, tobira } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_RETREAT, EVENT_FIRE_START, EVENT_REINFORCEMENT, EVENT_VOLLEY } from './battle_events.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { lines, camp } from './b_mid.js';
// 束5（docs/quality-upgrade-plan.md）：宇佐山城の縄張り（曲輪二つ・木戸）・実測の地形・町口の部隊・寄せの頭・竹束・本丸を守り切る勝ち
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, zoneWord, ZONE_STATE, WIN } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { gateUse } from './gate_use.js';
import { makeAttackAI } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { distToPolyline } from './world.js';
import { hieiWindow, PLACES } from './terrain_hiei.js';
import { USAYAMA_PLAN, HON_C, HILL_C, GATE_OUT, GATE_NI, GATE_HON, URA, WELL, ROAD, PATH_WELL, RAMPS, WALLS, ATTACK_ROUTES } from './castles/usayama.js';

function enemyGroup(rt, o, list) {
  let room = 245;
  for (const u of rt.army.units) if (u.alive && !u.farSim && u.type !== 'dummy') room--;
  const limited = [];
  for (const e of list) {
    const n = Math.max(0, Math.min(e.n, room));
    if (n) limited.push({ ...e, n });
    room -= n;
  }
  return spawnEnemy(rt, o, limited);
}

const TOWN = { x: 20, z: 10 };             // 坂本の町口
const USA = { x: HON_C.x, z: HON_C.z, r: 10 };   // 宇佐山城の本丸（縄張りは castles/usayama.js）
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };
const AZA = { flag: 'azai' };
// 後詰の言い方（信長で遊ぶ時は、自分が上様なので摂津の本隊）
const AID = (rt) => (rt.G.lord ? '摂津の本隊が着くまで' : '上様の後詰まで');
// 足軽大将ほどの身分で出た時は、城兵の一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 国土地理院の標高（1571比叡山の係が作った広域の切り出し terrain_hiei.js。宇佐山〜坂本〜比叡山が一枚の格子）。
// 1571比叡山（castles/hiei1571.js）と同じ xy・vs で切り出し、「同じ土地」にする。原点は宇佐山城の史跡の緯度経度、
// ゲーム内の中心は HILL_C（史跡に合わせた位置。castles/usayama.js で保つ）。
const HW = hieiWindow({ lat: PLACES.usayama.lat, lon: PLACES.usayama.lon, xy: 10, vs: 1 / 9 });
let HEIGHT_FN = null;
function baseTerrain(x, z) {
  let h = HW.height(x - HILL_C.x, z - HILL_C.z);
  // 地肌の細かい凹凸（広域の格子だけでは粗いので、足元の質感だけ足す）
  h += 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 南の山並み（大津・京都方面。広域の格子の外までは出ない、遠景の飾り）
  h += 20 * gauss(x, z, -60, 170, 4000);
  return h;
}
// 曲輪を平らにし（縁は切岸）、口の所だけ道の坂でならす（急な坂は登れず、道を通る）
function heightRaw(x, z) {
  if (!HEIGHT_FN) {
    const castle = heightOf(USAYAMA_PLAN, baseTerrain, 3);
    const R = RAMPS.map((r) => ({ ...r, h0: r.from ?? castle(r.a[0], r.a[1]) }));
    HEIGHT_FN = (px, pz) => {
      let h = castle(px, pz);
      for (const r of R) {
        const [ax, az] = r.a, [bx, bz] = r.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
        const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
        if (d >= r.w) continue;
        const k = d < r.w * 0.6 ? 1 : (r.w - d) / (r.w * 0.4);
        h = h * (1 - k) + (r.h0 + (r.h - r.h0) * t) * k;
      }
      return h;
    };
  }
  return HEIGHT_FN(x, z) + Math.max(yamaLift(x, z, LIFT), yamaLift(x, z, HON_LIFT));
}
// 部隊（butai.js）の本物の兵を決めた数より増やさない（味方も敵の大軍も、遠くで戦う軽い作りのまま）
function capReal(b, n) {
  b._mapPos = { x: 0, z: 0 };
  if (b.light && b.light.army) b.light.army.noWake = true;   // 軽い大軍は近づいても本物の兵に化けさせない（本物は部隊が決めた数だけ）
  b._autoSwitch = function (dt) {
    this._swT -= dt || 0.05;
    if (this._swT > 0) return;
    this._swT = 1.2;
    const have = this.realCount(), want = Math.min(n, this.aliveNominal());
    if (have > want) this.shrinkReal(have - want);
    else if (have < want && this.cmd.id === 'attack') this.growReal(Math.min(3, want - have));
  };
  return b;
}
function bPos(b) {
  if (b.real && b.real.count) return b.pos;
  if (b.light && b.light.army) { const A = b.light.army, p = b._mapPos; p.x = A.cx + (A.off ? A.off.x : 0); p.z = A.cz + (A.off ? A.off.z : 0); return p; }
  return b.pos;
}
const bDead = (b) => !b || b.aliveNominal() <= 0;
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// 味方の鉄砲の一斉射（受け持ちの戦で使い回す）：鉄砲の組は込めたまま待ち（holdFire）、敵の前線が at から r に入ったら「放て」。
// 撃った後、寄せた敵の隊の士気を下げて崩れやすくする。shots 回撃つか until 秒たてば、ふだんの撃ち方に戻す
export function volleyScene(rt, o) {
  const V = { n: 0, t0: rt.t, last: -99 }, shots = o.shots || 3;
  const guns = () => (o.guns() || []).filter((g) => g && g.count > 0 && !g.routed);
  for (const g of guns()) g.holdFire = true;
  const tick = () => {
    if (rt.over) return;
    const G = guns();
    if (!G.length) return;
    if (V.n >= shots || rt.t - V.t0 > (o.until || 150)) { for (const g of G) g.holdFire = false; return; }
    const at = typeof o.at === 'function' ? o.at(rt) : o.at, r = o.r || 38;
    let near = Infinity;
    const hit = [];
    for (const g of rt.army.groups) {
      if (g.team === 0 || g.routed || !(g.count > 0)) continue;
      let d = Infinity;
      for (const u of g.units) if (u.alive) d = Math.min(d, Math.hypot(u.pos.x - at.x, u.pos.z - at.z));
      near = Math.min(near, d);
      if (d < r) hit.push(g);
    }
    if (!V.warn && near < r + 28) { V.warn = true; rt.say(o.who, o.wait || 'まだじゃ……撃つな。引きつけよ', 2.5); }
    if (hit.length && rt.t - V.last >= 8) {
      V.last = rt.t; V.n++;
      for (const g of G) g.holdFire = false;
      battleEvent(rt, EVENT_VOLLEY, at, G[0], 0, false, '味方の鉄砲が一斉に放たれた');
      if (V.n === 1 && o.banner) rt.banner(o.banner[0], o.banner[1]);
      rt.say(o.who, V.n === 1 ? (o.fire || '放てぇっ！') : V.n === 2 ? '次の組、放て！' : 'もう一度、揃えて放て！', 1.6);
      for (const c of (o.clash ? o.clash(rt) : null) || []) if (c && c.volley) c.volley(o.side || 'A');
      rt.after(1.6, () => { if (V.n < shots) for (const g of guns()) g.holdFire = true; });
      rt.after(1.2, () => { for (const g of hit) if (g.count > 0 && !g.routed) g.morale = Math.max(0, g.morale - (o.hit || 14)); });
    }
    rt.after(0.4, tick);
  };
  rt.after(0.4, tick);
  return V;
}

const shiga = {
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  taisho: { b: { def: true } }, // 城の守りと後詰まで、戦の定義で終わりを決める。
  noWake: true,
  spawn: { x: TOWN.x + 4, z: TOWN.z + 8, heading: Math.PI },
  world: {
    seed: 15709,
    wind: [-0.3, 0.9], // 湖の北から吹く風を、旗と煙にもそろえる。
    time: 'day',
    muddy: 0.25,
    autumn: true,
    water: { x: 94, level: -2.4 },
    paths: [ROAD, PATH_WELL],
    terrainTags: true,   // 坂・道の速さを効かせる（曲輪の縁の切岸は登れず、道を通る）
    height,
    tint(x, z, h, c) {
      if (x > 74) { const k = Math.min(1, (x - 74) / 12); c.lerp({ r: 0.6, g: 0.57, b: 0.48 }, k * 0.7); }
      else if (h > 12) c.setRGB(c.r * 0.84, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x - TOWN.x) < 50 && z > -70 && z < 60) || (x > -48 && x < 6 && z > 64 && z < 116) || distToPolyline(x, z, PATH_WELL) < 5 || (x > -20 && x < 30 && z > 40 && z < 90) || Math.hypot(x - 40, z + 152) < 22 || Math.hypot(x + 34, z + 150) < 22,
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (x > -30 && x < 70 && z > -80 && z < 60 ? 0.15 : 1),
    groves: [{ x: -40, z: 0, r: 14, n: 20 }, { x: 50, z: 70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -140 || x < -90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { usayamaSite: 'HIST_A', sakamoto: 'HIST_A', mori: 'HIST_A', fire: 'HIST_A', kuruwa: 'HIST_B', twoFronts: 'HIST_B', volley: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 坂本の町（湖べりの町屋） ----
    for (const [x, z, r] of [[36, 20, 0.1], [44, 4, -0.2], [48, -14, 0.2], [34, -24, 0], [2, 24, 0.3], [-6, 6, -0.1], [52, 30, 0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x7b6448 }));
    rt.scene.add(tawara(W, 28, 30, 0.2, 5));
    // ---- 宇佐山城：縄張り（castles/usayama.js）。三の丸・二の丸・本丸の三つの曲輪、木戸三つ＋水の手口、櫓。縁は切岸で、道でしか上れない ----
    resetGates(); flReset();
    const GA = GATE_OUT.rot;   // 木戸の外の向き（北＝坂本の町の側）
    F.C = buildCastlePlan(rt, USAYAMA_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['san', 'ni', 'hon'], buildTowers: true, team: 0 });
    // 柵は城方（味方）の物：castle_plan の塀は寄せ手の側の物なので、口を空けた線で手置きする
    F.uwall = [];
    for (const pts of WALLS) for (const s of wallLine(rt, pts, { team: 0, hp: 1e9, name: '柵', segLen: 5 })) { s.noTarget = true; s.wall = true; F.uwall.push(s); }
    // 木戸（castle_parts.kido）を siege_gate の門に。外から叩けば壊れ、内に入られて門兵が居なくなれば開く
    // 大手木戸（三の丸の外）：寄せ手が最初に取り付く、今の「前の木戸」
    F.kido = kido(rt, GATE_OUT.x, GATE_OUT.z, 3.2, GATE_OUT.rot, { team: 0, hp: 2600, name: GATE_OUT.name, h: 2.8 });
    F.gate = F.kido.struct; F.gate.armor = 0.25;
    F.gateC = { x: GATE_OUT.x, z: GATE_OUT.z };
    F.gateN = { x: Math.sin(GA), z: Math.cos(GA) };
    rt.scene.add(kabukimon(W, GATE_OUT.x, GATE_OUT.z, 4.4, GATE_OUT.rot, { doors: false }));
    F.gateMk = makeGate(rt, F.kido, { name: GATE_OUT.name, guardTeam: 0 });
    // 二の丸の木戸（三の丸→二の丸）
    F.kidoNi = kido(rt, GATE_NI.x, GATE_NI.z, 3.2, GATE_NI.rot, { team: 0, hp: 2200, name: GATE_NI.name, h: 2.8 });
    F.gateNiMk = makeGate(rt, F.kidoNi, { name: GATE_NI.name, guardTeam: 0 });
    rt.scene.add(kabukimon(W, GATE_NI.x, GATE_NI.z, 4, GATE_NI.rot, { doors: false }));
    // 本丸の木戸（二の丸→本丸）
    F.kidoHon = kido(rt, GATE_HON.x, GATE_HON.z, 3, GATE_HON.rot, { team: 0, hp: 1800, name: GATE_HON.name });
    F.gateHonMk = makeGate(rt, F.kidoHon, { name: GATE_HON.name, guardTeam: 0 });
    // 水の手口（本丸の裏。木戸の無い口のままだと外から素通りできるので、ここにも木戸を立てる）
    F.kidoUra = kido(rt, URA.x, URA.z, 2.8, -Math.PI / 2, { team: 0, hp: 1500, name: URA.name });
    F.gateUraMk = makeGate(rt, F.kidoUra, { name: URA.name, guardTeam: 0 });
    // 寄せ手が木戸を破ってゆく順（大手→二の丸→本丸）。onStructHit/onStructDestroyed・HUD・assault の的に使う
    F.gates = [F.gate, F.kidoNi.struct, F.kidoHon.struct];
    // 自分の城の門は、門の前で押して開け閉めできる（城へ退く・打って出る時に。kaito 10/2）
    F.gu = gateUse(rt, [F.gateMk, F.gateNiMk, F.gateHonMk, F.gateUraMk], { team: 0 });
    rt.scene.add(hut(W, HON_C.x - 3, HON_C.z + 6, 9, 6, 0.2, { wall: 0x6a5238 }), hut(W, -8, 86, 6, 4.5, 0, { wall: 0x6a5238 }));
    for (const [x, z] of [[-15, 76], [-36, 92], [-24, 104], [-5, 88]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 森可成の手（自分の持ち場）と、織田信治の手 ----
    F.mori = allyGroup(rt, { name: '森可成の手', anchor: { x: TOWN.x, z: TOWN.z - 6 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '森可成', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.moriU = F.mori.units[0];
    F.nobuharu = allyGroup(rt, { name: '織田信治の手', anchor: { x: TOWN.x + 22, z: TOWN.z - 4 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '織田信治', invuln: true, hat: 'kabuto_m', haori: 0x6a1a14 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.nobuU = F.nobuharu.units[0];
    // 青地茂綱の手（信長公記に町口での討死が記される）
    F.sakai = allyGroup(rt, { name: '青地茂綱の手', anchor: { x: TOWN.x - 20, z: TOWN.z - 4 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '青地茂綱', invuln: true, hat: 'kabuto_g', haori: 0x5a2a1c } }, { type: 'ashigaru', n: 10 }], ODA));
    // 城に残る者（武藤五郎右衛門ら）
    F.keep = allyGroup(rt, { name: '宇佐山城の守り', anchor: { x: -11, z: 80 }, facing: GA, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '武藤五郎右衛門', invuln: true, hat: 'kabuto_w' } }, { type: 'samurai', n: 1, o: { name: '肥田彦左衛門', invuln: true } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.mori, F.nobuharu, F.sakai, F.keep];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: TOWN.x + 8, z: TOWN.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：湖の西を下ってくる浅井・朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.host = [DA(24, -150, 40, 16, 320, 0, 0x33291f, 'asakura', 15791), DA(-20, -160, 36, 14, 280, 0.2, 0x2e2a26, 'azai', 15792), DA(60, -170, 30, 12, 220, -0.1, 0x33291f, 'asakura', 15793)];
    for (const [x, z] of [[-2, -130], [14, -128], [40, -132]]) rt.scene.add(nobori(W, x, z, 'asakura', 7));
    // 浅井・朝倉の本陣（北の奥）：朝倉義景と浅井長政。見に行けば大将と旗本がいる（控えは軽い兵）
    F.campA = camp(rt, { x: 40, z: -152, facing: 0, team: 1, faction: 'saito', mon: 'asakura', armor: 0x33291f, general: { name: '朝倉義景', hat: 'kabuto_m', haori: 0x5a4020 }, guard: 15, reserve: 300, runTo: { x: 26, z: -80 } });
    F.campB = camp(rt, { x: -34, z: -150, facing: 0.1, team: 1, faction: 'saito', mon: 'azai', armor: 0x2e2a26, general: { name: '浅井長政', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 260, runTo: { x: 0, z: -80 } });
    for (const [x, z] of [[20, 40], [-10, 60]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 本陣の旗本は、陣幕の前で整った陣形のまま待つ（寄って来た者だけを相手にする）
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'line'; }
    // 本陣へ近づくほど敵が濃くなる（kaito 10/2）：本陣の前に備えを三重に置く。奥ほど人が多い（軽い作り。寄れば本物の兵に替わる）
    F.campHost = [];
    for (const c of [{ x: 40, z: -152, mon: 'asakura', armor: 0x33291f }, { x: -34, z: -150, mon: 'azai', armor: 0x2e2a26 }]) {
      [[52, 90, 24, 7], [30, 160, 30, 9], [16, 240, 34, 11]].forEach(([dz, cnt, w, d], i) => {
        F.campHost.push(W.addDistantArmy({ x: c.x + (i - 1) * 4, z: c.z + dz, w, d, count: cnt, facing: 0, armor: c.armor, flagTex: flagTexture(c.mon), mon: c.mon, seed: 15830 + F.campHost.length, team: 1 }));
      });
      for (const dz of [30, 46]) rt.scene.add(nobori(W, c.x - 14, c.z + dz, c.mon, 7), nobori(W, c.x + 14, c.z + dz, c.mon, 7));
    }
    // ---- 町口の戦いの部隊（butai.js）：前に立つ名のある組（本物）の後ろの本隊。本物はほとんど出さず、遠くで押し合う軽い作り ----
    const mkB = (o, real) => capReal(makeButai(rt, { real, ...o }), real);
    F.bMori = mkB({ name: '森可成の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 400, armor: 0x2b3140, flag: 'oda', at: { x: TOWN.x - 2, z: TOWN.z + 16 }, facing: Math.PI }, 0);
    F.bNobu = mkB({ name: '織田信治の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 300, armor: 0x2b3140, flag: 'oda', at: { x: TOWN.x + 30, z: TOWN.z + 12 }, facing: Math.PI }, 0);
    F.bAsa = mkB({ name: '朝倉の先手の本隊', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 500, armor: 0x33291f, flag: 'asakura', at: { x: 28, z: -96 }, facing: 0 }, 0);
    F.bAza = mkB({ name: '浅井の本隊', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 450, armor: 0x2e2a26, flag: 'azai', at: { x: -22, z: -92 }, facing: 0.15 }, 0);
    for (const b of [F.bMori, F.bNobu, F.bAsa, F.bAza]) b.order({ id: 'hold' });

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '森可成の下で町口の一手を預かり、坂本の町口を固めよ' : '森可成のもとで、坂本の町口を固めよ', 'main');
    rt.say('森可成', `${nm(rt)}、湖の西を浅井・朝倉が下ってくる。三万じゃ。殿（信長公）は摂津で三好と対陣しておられる`, 5);
    rt.say('織田信治', '京へ抜かれれば、殿は挟まれる。ここで一日でも止めるぞ', 4);
    rt.marker('mori', unitPos(F.moriU), '森可成', {});
    rt.after(7, () => rt.say('森可成', 'ここを通せば京が危うい。南下を止めよ。旗の濃い方が敵の本隊じゃ', 4));
    rt.after(12, () => this.first(rt));
  },

  // ① 朝倉の先手を迎え撃つ
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    // 町口と木戸の口の乱戦：自分へ同時に打ちかかる敵は二人まで（残りは周りで構えて間を計る。数の圧は見せたまま、一人で呑まれて即座に倒れない）
    F.cap0 = rt.army.maxAttackers || 3; rt.army.maxAttackers = Math.min(F.cap0, 2);
    rt.unmark('mori');
    sfx('horagai', 0.9);
    rt.banner('九月十六日・坂本の町口', '湖の西の道を、朝倉の旗が下ってくる');
    rt.obj('main', '町口で朝倉の先手を迎え撃て', 'main');
    for (const h of F.host) h.advance(40, 60);
    // 朝倉・浅井の本隊が町口の前の野を埋める（軽い作り。町口の斬り合いは名のある組の本物だけ。本隊は混ぜない）
    F.bAsa.order({ id: 'move', to: { x: 28, z: -50 } });
    F.bAza.order({ id: 'move', to: { x: -12, z: -54 } });
    F.clashT = true;
    const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 22, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.42, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], ASA));
    F.w1 = g;
    KIT.backOf(rt, g, { flag: 'asakura', armor: 0x33291f, kind: 'spear', w: 24, depth: 12, count: 260, seed: 15794 });
    // 町口の左右では、森・信治の手の後ろの者と朝倉の大軍が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -14, z: -14, facing: Math.PI, w: 30, seed: 15795, A: ['oda', 0x2b3140, 280, 'oda'], B: ['azai', 0x2e2a26, 460, 'saito'], surge: { every: 45, flank: 0.4 } },
      { x: 60, z: -18, facing: Math.PI, w: 24, seed: 15796, A: ['oda', 0x2b3140, 240, 'oda'], B: ['asakura', 0x33291f, 420, 'saito'], gunsB: true, surge: { every: 50, flank: 0.4 } },
    ]);
    F.lines.forEach((c, i) => rt.after(6 + i * 2, () => c.go()));
    // 町口の正面の幅いっぱいに押す大軍（行けない所の軽い作り。数を見せる）と、崩しても崩しても出てくる新手（本物）
    F.front = [
      rt.world.addDistantArmy({ x: 22, z: -112, w: 80, d: 16, count: 620, facing: 0, armor: 0x33291f, flagTex: flagTexture('asakura'), mon: 'asakura', seed: 15820, team: 1 }),
      rt.world.addDistantArmy({ x: -16, z: -106, w: 34, d: 12, count: 260, facing: 0.15, armor: 0x2e2a26, flagTex: flagTexture('azai'), mon: 'azai', seed: 15821, team: 1 }),
    ];
    for (const h of F.front) { h.army.noWake = true; h.advance(22, 60); }
    rt.after(24, () => { if (F.step === 1) { F.stream = [{ x: -4, next: rt.t }, { x: 20, next: rt.t + 18 }, { x: 44, next: rt.t + 9 }]; rt.say('足軽', '崩しても崩しても、後ろから次が出てくる……！', 3); } });
    rt.marker('w1', centerOf(g), () => `朝倉の先手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.say('森可成', '槍を揃えよ！　町口を一歩も通すな！', 3);
    // 勝ち筋：町口は狭く、大軍でも横に広がれぬ。口を塞いで鉄砲で頭を叩く
    rt.after(5, () => rt.say('森可成', '町口は狭い。敵は横に広がれぬ。口を塞げば、数は怖くない', 3.5));
    rt.obj('mouth', '町口を離れるな。深く追わず、口で押し返せ', 'order');
    // 一斉射：信治の鉄砲組を町口の前に並べ、先手が寄せた所で放つ（元亀元年、鉄砲はまだ少ない）
    F.guns = allyGroup(rt, { name: '信治の鉄砲組', anchor: { x: TOWN.x + 10, z: TOWN.z - 12 }, facing: Math.PI, width: 10, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 6 }], ODA));
    volleyScene(rt, { guns: () => [F.guns, F.nobuharu], at: { x: TOWN.x + 6, z: TOWN.z - 14 }, r: 34, who: '織田信治', shots: 3,
      banner: ['一斉射', '町口の鉄砲が、寄せる先手の頭を叩く'], clash: () => F.lines });
    rt.after(34, () => {
      if (F.step !== 1) return;
      F.w1b = enemyGroup(rt, { faction: 'saito', name: '朝倉の二の手', anchor: { x: 44, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.42 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASA));
      for (const u of F.w1b.units) if (u.type === 'gun') u.dmg *= 0.45;
      KIT.backOf(rt, F.w1b, { flag: 'asakura', armor: 0x33291f, kind: 'spear', w: 20, depth: 10, count: 200, seed: 15797 });
      rt.marker('w1b', centerOf(F.w1b), () => `朝倉の二の手・${moraleWord(F.w1b.morale)}`, { red: true, group: F.w1b });
      rt.say('織田信治', '湖べりからも来るぞ！', 2.5);
    });
  },

  // ①の後の段：町口の押し合い（浅井が背へ回る）→ ②へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.5) return;
    F.step = 1.5;
    rt.unmark('w1'); rt.unmark('w1b'); rt.objRemove('mouth');
    for (const q of [F.w1, F.w1b]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    // 新手の列は町口の前で踏みとどまる（数の圧は見せたまま、段の敵と重ねて押し潰さない）
    for (const q of F.streamG || []) if (!gone(q)) { const c = q.center(); q.order = 'hold'; q.anchor = { x: c.x + (c.x < TOWN.x ? 10 : 0), z: Math.min(c.z, TOWN.z - 34) }; q.aggro = 8; q.seekRange = 12; }
    rt.award((t) => t.side.push('朝倉の先手を退けた'), '朝倉の先手を退けた');
    for (const h of F.host) h.advance(30, 50);
    F.stepT = rt.t;
    rt.obj('main', '町口の左右から来る敵を受け止めよ', 'main');
    rt.obj('mouth', '深く追うな。南の城への道を空けておけ', 'order');
    rt.banner('九月十九日・両手からの大軍', '小勝ちの後、浅井・朝倉が再び押し寄せた');
    rt.say('森可成', '正面と山側から来る。町口で受けよ。退く道を塞がせるな！', 4);
    for (const c of F.lines || []) { c.reinforce('B', { count: 240 }); c.push('B', 0.7); }
    F.twoHands = [
      enemyGroup(rt, { faction: 'saito', name: '正面から押す朝倉勢', anchor: { x: 24, z: -48 }, facing: 0, order: 'attack', seekRange: 75, aggro: 12, morale: 95, dmgMult: 0.4 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ASA)),
      enemyGroup(rt, { faction: 'saito', name: '山側から押す浅井勢', anchor: { x: -35, z: -12 }, facing: Math.PI / 2, order: 'attack', seekRange: 75, aggro: 12, morale: 95, dmgMult: 0.4 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], AZA)),
    ];
  },
  // 端城の火の後も、閉じた木戸の内で後詰を待つ。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t; F.lastHeld = 0;
    rt.setPhase('relief');
    rt.objRemove('gate'); rt.objRemove('honmaru');
    rt.obj('main', '城の内に踏みとどまり、後詰を待て', 'main');
    rt.marker('castleHold', HON_C, '守る本丸', { h: 3 });
    rt.obj('inner', '木戸を開けるな。破られたら奥の木戸へ退け', 'order');
    rt.banner('城はまだ落ちぬ', '燃える端城の奥で、木戸を守り続ける');
    rt.say('肥田彦左衛門', '摂津の軍が京へ戻った。城を出るな。最後まで口を固めよ！', 4);
    rt.after(24, () => {
      if (F.ending) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '木戸へ迫る最後の寄せ手', anchor: { x: -8, z: 32 }, facing: 0, order: 'assault', seekRange: 45, aggro: 8, morale: 80, dmgMult: 0.4 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }], ASA));
      g.assault = () => F.gates.find((s) => s && s.alive && !s.opened) || null;
      F.waves.push(g);
      battleEvent(rt, EVENT_REINFORCEMENT, F.gateC, g, 1, false, '坂の下から最後の寄せ手');
    });
  },

  // ② 大軍に押され、宇佐山城へ退く
  fall(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fall');
    rt.unmark('w1'); rt.unmark('w1b');
    for (const h of F.host) h.advance(60, 50);
    // 朝倉・浅井の本隊が町口へなだれ込み、残った森・信治の本隊と押し合う（城へ退く背で。軽い作り）
    F.bAsa.order({ id: 'move', to: { x: 28, z: 0 } });
    F.bAza.order({ id: 'move', to: { x: -12, z: -8 } });
    F.bMori.order({ id: 'move', to: { x: TOWN.x - 2, z: TOWN.z + 6 } });
    for (const c of F.lines || []) c.rout('A', { from: 0, hideAfter: 20, minFight: 0 });
    rt.banner('浅井・朝倉の大軍', '比叡山の方からも、浅井の兵が回り込んでくる');
    const g = enemyGroup(rt, { faction: 'saito', name: '浅井の手', anchor: { x: -30, z: -30 }, facing: Math.PI * 0.7, order: 'attack', seekRange: 45, aggro: 14, width: 16, morale: 100, fleeDir: { x: -1, z: -1 }, dmgMult: 0.7 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }], AZA));
    F.w2 = g;
    // 町口を呑む浅井の手は、坂の下（町の内）までで止まる。追うのは追手の一組だけ
    rt.after(12, () => { if (!gone(g)) { g.order = 'hold'; g.anchor = { x: TOWN.x - 8, z: TOWN.z - 8 }; g.seekRange = 10; } });
    rt.marker('w2', centerOf(g), () => `浅井の手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.say('森可成', '町口は持たぬ！　南の坂道から宇佐山城へ退け。追手を深く追うな！', 4);
    battleEvent(rt, EVENT_RETREAT, TOWN, F.mori, 0, true, '町口が崩れた。宇佐山城へ退け');
    rt.objRemove('mouth');
    rt.say('織田信治', '城を頼む。殿が戻られるまで、城を渡すな！', 3.5);
    rt.obj('main', '宇佐山城へ退け', 'main');
    F.retreatPoint = { x: 12, z: 34 };
    rt.marker('usa', () => F.retreatPoint, '宇佐山城への坂道', { h: 3 });
    // 退く先は大手木戸の内（城の者が木戸を開けて待つ。入ったら自分で閉める）
    rt.zone('usa', F.gateC.x - F.gateN.x * 5, F.gateC.z - F.gateN.z * 5, 5);
    F.gu.open(F.gateMk);
    F.stream = null;
    for (const q of F.streamG || []) if (!gone(q)) { const c = q.center(); q.order = 'hold'; q.anchor = { x: c.x, z: Math.min(c.z, TOWN.z) }; q.aggro = 7; q.seekRange = 12; }
    // 史実の討死（kaito 10/2）：大軍が森可成・織田信治の周りを埋め、遠くからも見える形で討たれる
    rt.after(3, () => this.doom(rt, { u: F.nobuU, g: F.nobuharu, key: 'nobu', name: '織田信治', flag: ASA, last: '槍を揃えよ！　南の坂道を空けよ！', dur: 13 }));
    rt.after(8, () => this.doom(rt, { u: F.moriU, g: F.mori, key: 'mori', name: '森可成', flag: AZA, last: '町口は持たぬ。城の木戸へ退け！', dur: 15 }));
    // 森・信治の手は町口に踏みとどまる
    for (const q of [F.mori, F.nobuharu]) { q.order = 'hold'; q.aggro = 16; }
    rt.obj('path', '追手に構わず、坂を上れ', 'order');
    // 坂道を上る間：町口を抜けた浅井の追手が少し追いすがる（歩くだけの間を作らない）
    rt.after(10, () => {
      if (F.step !== 2) return;
      // 追手は自分の背（町口の側）から出る。行く手の坂道の上には出さない
      const pp = rt.player.u.pos, bx = pp.x - TOWN.x, bz = pp.z - (TOWN.z - 20), bl = Math.hypot(bx, bz) || 1;
      const ca = { x: pp.x - bx / bl * 16, z: pp.z - bz / bl * 16 };
      F.chase = enemyGroup(rt, { faction: 'saito', name: '追いすがる浅井勢', anchor: ca, facing: Math.PI, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 55, fleeDir: { x: 0, z: -1 }, dmgMult: 0.4, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], AZA));
      rt.marker('chase', centerOf(F.chase), () => `追手・${moraleWord(F.chase.morale)}`, { red: true, group: F.chase });
      rt.say('足軽', '後ろから浅井の追手じゃ！　振り返って一突きして、また上れ！', 3);
    });
    rt.after(4, () => { if (F.step === 2) rt.say('武藤五郎右衛門', '木戸は開けてある！　味方が入ったら、門の前で閉めよ！', 3.5); });
  },

  // ③ 宇佐山城を守る
  siege(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('siege');
    rt.unmark('usa'); rt.unzone('usa'); rt.unmark('w2'); rt.unmark('chase'); rt.objRemove('path');
    if (F.chase && !gone(F.chase)) { F.chase.noRout = false; F.chase.morale = 0; }
    // 坂本の町口の戦いの終わり（史実：森可成・織田信治は討ち死に）
    const late = !F.moriDead || !F.nobuDead;
    for (const u of [F.moriU, F.nobuU]) { u.invuln = false; if (u.alive) rt.army.kill(u, null); }
    F.moriDead = F.nobuDead = true;
    const aochi = F.sakai.units.find((u) => u.name === '青地茂綱');
    if (aochi && aochi.alive) { aochi.invuln = false; rt.army.kill(aochi, null); }
    F.sakai.noRout = false; F.sakai.morale = 0;
    for (const q of [F.mori, F.nobuharu]) { q.noRout = false; q.morale = 0; q.fleeDir = { x: -0.4, z: 1 }; }
    if (F.w2 && !gone(F.w2)) { F.w2.noRout = false; F.w2.morale = 0; }
    for (const q of F.streamG || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    F.stream = null;
    if (late) { sfx('kane', 0.4); rt.banner('森可成・織田信治、討ち死に', '坂本の町口で、二人とも最後まで戦った'); }
    rt.say('武藤五郎右衛門', '木戸を閉めよ！　わしと肥田彦左衛門で城を固める。奥の本丸を渡すな！', 5);
    // 開いたままの大手木戸は、自分で閉める（閉めなければ、しばらくして城の者が閉める）
    if (F.gateMk.opened && !F.gateMk.breached) {
      F.gateHint = true;
      rt.obj('inner', '大手木戸の前で「門を閉める」を押せ', 'order');
      rt.after(16, () => { if (F.gateMk.opened && !F.gateMk.breached && F.gu.close(F.gateMk)) rt.say('武藤五郎右衛門', '木戸はわしらが閉めた！　槍を揃えよ！', 2.5); });
    }
    rt.obj('main', HI(rt) ? `城兵の一手を率いて宇佐山城に籠り、三の丸→二の丸→本丸の順に木戸を守れ（${AID(rt)}）` : `宇佐山城に籠り、三の丸→二の丸→本丸の順に木戸を守れ（${AID(rt)}）`, 'main');
    
    if (!F.gateMk.opened) rt.obj('inner', '木戸の内で受けよ。本丸を百二十五秒守る。危うければ奥へ退け', 'order');
    if (HI(rt)) rt.say('武藤五郎右衛門', `${nm(rt)}、木戸の口はそなたの手に預ける。わしは櫓から弓を指図する`, 4);
    F.keep.order = 'hold'; F.keep.anchor = { x: F.gateC.x - F.gateN.x * 4, z: F.gateC.z - F.gateN.z * 4 }; F.keep.facing = Math.atan2(F.gateN.x, F.gateN.z); F.keep.aggro = 12;
    rt.marker('gate', F.gateC, () => { const g = F.gates.find((s) => s && s.alive) || F.gates[F.gates.length - 1]; return `${g.name} ${Math.round(Math.max(0, g.hp) / g.maxHp * 100)}%`; }, { h: 4 });
    F.waves = [];
    // ---- 守る持ち場の区域（siege_zones.js）：三の丸・二の丸・本丸は初めから味方。本丸を 125 秒保てば最後の守りへ（WIN.timeHeld） ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.san.test, pos: F.C.kuruwa.san.centroid, need: 6, hold: 10 },
        { id: 'ni', name: '二の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.ni.test, pos: F.C.kuruwa.ni.centroid, need: 6, hold: 12 },
        { id: 'hon', name: '本丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.hon.test, pos: F.C.kuruwa.hon.centroid, need: 6, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      winWhen: [[WIN.timeHeld('hon', 125)]],
      onWin: () => { if (F.step === 3) this.midB(rt); },
      onFall: (id) => this.onZone(rt, id),
    });
    // ---- 城へ迫る浅井・朝倉の大軍（butai.js・軽い作り）。寄せる道は攻めの頭（siege_ai.js の makeAttackAI）が選ぶ ----
    if (F.bMori && F.bMori.light && F.bMori.light.rout) F.bMori.light.rout({ hideAfter: 20 });
    if (F.bNobu && F.bNobu.light && F.bNobu.light.rout) F.bNobu.light.rout({ hideAfter: 20 });
    F.clashT = false;
    const mkS = (name, at, flag, armor, n, look = HILL_C, kind = 'ashigaru') => capReal(makeButai(rt, { name, team: 1, faction: 'saito', kind, nominal: n, real: 0, armor, flag, at, facing: faceTo(at, look) }), 0);
    F.bSiege = [
      mkS('城へ迫る朝倉の本隊', { x: 34, z: 22 }, 'asakura', 0x33291f, 420),
      mkS('城へ迫る浅井の本隊', { x: -6, z: 20 }, 'azai', 0x2e2a26, 380),
      mkS('尾根を回る浅井の手', { x: -74, z: 52 }, 'azai', 0x2e2a26, 260, ATTACK_ROUTES[2].entry),
    ];
    // 軽い大軍は向いた方へしか進めないので、選ばれた道の入口へは「向きに沿って、山を越えない所まで」だけ寄せる
    const proxy = (b) => ({
      id: b.id, real: null,
      order(cmd) {
        if (!cmd.to || !b.light || !b.light.advance) return;
        const p = bPos(b), fx = Math.sin(b.facing), fz = Math.cos(b.facing);
        b.light.advance(Math.max(0, Math.min(60, (cmd.to.x - p.x) * fx + (cmd.to.z - p.z) * fz)));
        b.cmd = { id: 'move', to: cmd.to, target: null, form: 'line' };
      },
    });
    F.AA = makeAttackAI(rt, { attackers: F.bSiege.map(proxy), routes: ATTACK_ROUTES, feintChance: 0.6, feintShare: 0.34 });
    // 寄せ手の竹束：城の弓から身を隠しつつ、木戸の下まで押してゆっくり寄せる（陰の者には前からの矢がほとんど当たらない）
    patchGunCover(rt);
    const STAGE = [{ x: -9, z: 57 }, { x: -15, z: 58 }, { x: -5, z: 59 }];
    const mk = (i) => {
      const flag = i % 2 ? AZA : ASA;
      const from = [[-2, 34], [-16, 36], [6, 40]][i];
      const g = enemyGroup(rt, { faction: 'saito', name: ['城へ寄せる朝倉勢', '城へ寄せる浅井勢', '朝倉の新手'][i], anchor: { x: from[0], z: from[1] }, facing: 0, order: 'hold', aggro: 6, width: 10, morale: 95, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.5 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, ...(i === 2 ? [{ type: 'gun', n: 3 }] : [])], flag));
      const st = STAGE[i];
      const go = (q) => { if (q.order === 'assault' || gone(q)) return; q.order = 'assault'; q.aggro = 6; };
      g.order = 'move'; g.dest = { x: st.x, z: st.z }; g.speed = 1.2; g.onArrive = go;
      rt.after(40, () => go(g));
      for (const off of [-3, 3]) addTaba(rt, from[0] + off, from[1] + 3, 1, { van: g, off, faceSign: 1, vanDist: 3, rot: 0 });
      if (i === 0) rt.say('武藤五郎右衛門', '竹束を押し立てて来おる。矢は竹に止まる。竹束を捨てて坂を上る所を射よ！', 4);
      g.assault = () => F.gates.find((s) => s && s.alive && !s.opened) || null;
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      KIT.backOf(rt, g, { flag: flag.flag, armor: 0x33291f, kind: 'spear', w: 20, depth: 10, count: 200, seed: 15798 + i });
      F.waves.push(g);
      rt.army.play('eshout', { x: from[0], z: from[1] }, 1.6);
      rt.marker('x' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    // kaito 10/1：波の間を詰めた（50→38・95→70。遊んで10分ほどかかる戦を4〜7分に）
    rt.after(8, () => { mk(0); rt.say('足軽', '寄せてくるぞ！　木戸に取り付かせるな！', 3); });
    rt.after(26, () => { if (!F.ending) { mk(1); rt.say('足軽', '浅井の旗じゃ、また来る！', 2.5); } });
    rt.after(46, () => { if (!F.ending) mk(2); });
    rt.after(38, () => {
      if (F.ending || F.step !== 3) return;
      const fire = { x: -18, z: 52 };
      rt.world.addFire(fire.x, fire.z, { size: 3, big: true });
      rt.world.addFire(-3, 58, { size: 2.4, big: true });
      battleEvent(rt, EVENT_FIRE_START, fire, null, 1, true, '城の外側に火の手。奥の木戸を守れ');
      rt.banner('端城に火の手', '城の外側は燃えても、本丸は渡すな');
      rt.say('肥田彦左衛門', '外の曲輪が燃えておる！　火へ寄るな。木戸の内で寄せ手を止めよ！', 4);
    });
    // 湖西街道を押さえる意味：敵の一手は城を無視して南の京へ抜けようとするが、街道を押さえる城から矢を浴び、
    // 背に城を残せず引き返して城へ寄せる（城を落とさねば南へ抜けられない）
    rt.after(34, () => {
      if (F.ending || F.step !== 3) return;
      const bg = enemyGroup(rt, { faction: 'saito', name: '街道を南へ抜ける朝倉の手', anchor: { x: 34, z: -6 }, facing: 0, order: 'move', aggro: 4, width: 10, morale: 80, speed: 2.4, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }], ASA));
      F.bypass = bg;
      bg.dest = { x: 30, z: 150 };
      rt.marker('bypass', centerOf(bg), () => `街道を抜ける朝倉の手・${moraleWord(bg.morale)}`, { red: true, group: bg });
      rt.say('武藤五郎右衛門', '街道を南へ抜ける敵じゃ。櫓の弓で射よ！　木戸の兵は持ち場を離れるな！', 4.5);
      rt.after(16, () => {
        if (gone(bg)) { rt.unmark('bypass'); return; }
        bg.order = 'attack'; bg.seekRange = 60; bg.anchor = { x: GATE_OUT.x + 6, z: GATE_OUT.z - 6 };
        rt.banner('背に城を残せぬ敵', '街道の敵が城へ引き返してくる');
        rt.after(30, () => rt.unmark('bypass'));
      });
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('castleHold'); rt.unmark('ni'); rt.unmark('hon');
    rt.unmark('gate'); for (let i = 0; i < 3; i++) rt.unmark('x' + i);
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const h of F.host) h.retreat(60, 40);
    for (const b of F.bSiege || []) b.order({ id: 'retreat' });
    const aid = rt.world.addDistantArmy({ x: 30, z: 154, w: 28, d: 14, count: 600, facing: Math.PI, armor: 0x2b3140, flagTex: flagTexture('oda'), mon: 'oda', team: 0, seed: 15924 });
    aid.army.noWake = true; aid.advance(42, 12);
    battleEvent(rt, EVENT_REINFORCEMENT, { x: 30, z: 125 }, null, 0, true, '九月二十四日、南から信長の本隊');
    rt.objDone('main'); rt.objRemove('inner'); rt.objRemove('mouth');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '宇佐山城を守り通した', pts: 20 }; }, '任務達成・宇佐山城を守り通した');
    sfx('horagai', 0.8);
    rt.banner('九月二十四日・宇佐山城、守り通す', '摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった');
    rt.say('武藤五郎右衛門', '南から味方の旗じゃ！　城は守った。敵を追って山へ入るな！', 5);
    rt.after(6, () => rt.say('', '――浅井・朝倉は比叡山に籠もり、延暦寺がこれをかくまった。この冬、信長は和を結ぶ。翌年、比叡山は焼かれる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },
  lose(rt, sub) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objFail('main'); rt.objRemove('inner'); rt.tracker.main = false;
    for (const id of ['usa', 'gate', 'castleHold', 'ni', 'hon']) rt.unmark(id);
    rt.unzone('usa');
    rt.banner('宇佐山城、守り破れる', sub);
    rt.say('武藤五郎右衛門', `${sub}。敵を追わず、城の内へ戻って木戸と本丸を守るのじゃ。今は裏の口から退け！`, 4);
    rt.player.u.invuln = true;
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 大軍から目を覚ました敵の兵は、名のある組より当たりを弱める（三万に一人で呑まれて、町口で倒れ続けないように）
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if ((g.woke || g.name === '備の兵') && g.team === 1 && !g.shDm) { g.shDm = true; g.dmgMult = (g.dmgMult || 1) * 0.55; for (const u of g.units || []) if (u.type === 'gun') u.dmg *= 0.5; } }
    butaiTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    updateGates();
    if (F.gu) F.gu.tick();
    this.tickStream(rt);
    this.tickCamps(rt);
    this.tickBreath(rt, dt);
    this.tickShut(rt, dt);
    if (F.gateHint && F.gateMk.opened === false && !F.gateHintDone) { F.gateHintDone = true; rt.obj('inner', '木戸の内で受けよ。本丸を百二十五秒守る。危うければ奥へ退け', 'order'); }
    tickTabas(rt, dt);
    if (F.SZ && (F.step === 3 || F.step === 3.5)) F.SZ.tick(dt);
    if (F.step === 3 || F.step === 3.5) {
      const hon = F.SZ.byId.hon;
      F.honLostT = hon.owner === ZONE_STATE.ENEMY ? (F.honLostT || 0) + dt : 0;
      if (F.honLostT >= 45) { this.lose(rt, '本丸を取り返せず、浅井・朝倉に城を奪われた'); return; }
      if (rt.t - F.stepT > (F.step === 3 ? 260 : 180)) { this.lose(rt, '城の守りを立て直せず、後詰を待ちきれなかった'); return; }
    }
    this.tickLight(rt, dt);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const qs = [F.w1, F.w1b].filter(Boolean);
      rt.objProgress('main', `討った敵 ${F.ek || 0}人・寄せ手はまだ尽きぬ`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.w1b && qs.every(gone) && rt.t - F.stepT > 60) || rt.t - F.stepT > 65) this.midA(rt);
    }
    if (F.step === 1.5) {
      rt.objProgress('main', `町口を支える あと${Math.max(0, Math.ceil(55 - (rt.t - F.stepT)))}秒`);
      if (rt.t - F.stepT >= 55) this.fall(rt);
    }
    if (F.step === 3.5) {
      const hon = F.SZ.byId.hon;
      const inCastle = F.C.kuruwa.san.test(p.x, p.z) || F.C.kuruwa.ni.test(p.x, p.z) || F.C.kuruwa.hon.test(p.x, p.z);
      if (hon.owner === ZONE_STATE.FRIEND && inCastle) F.lastHeld += dt;
      rt.objProgress('main', hon.owner === ZONE_STATE.ENEMY ? `本丸を取り返せ・あと ${Math.max(0, Math.ceil(45 - F.honLostT))}秒` : !inCastle ? '城の木戸の内へ戻れ' : `後詰まで ${Math.max(0, Math.ceil(85 - F.lastHeld))}秒`);
      if (F.lastHeld >= 85) this.win(rt);
    }
    if (F.step === 2) {
      const next = p.z < 30 ? 0 : p.z < 47 ? 1 : 2;
      F.retreatPoint.x = next === 0 ? 12 : next === 1 ? -6 : F.gateC.x - F.gateN.x * 5;
      F.retreatPoint.z = next === 0 ? 34 : next === 1 ? 48 : F.gateC.z - F.gateN.z * 5;
      const d = Math.hypot(p.x - (F.gateC.x - F.gateN.x * 5), p.z - (F.gateC.z - F.gateN.z * 5));
      rt.objProgress('main', d < 6 && !F.moriDead ? '木戸の内で待て' : `城まで ${Math.max(0, Math.round(d))}メートル`);
      const inSan = F.C && F.C.kuruwa.san.test(p.x, p.z);
      if ((d < 6 || inSan) && F.moriDead && F.nobuDead) this.siege(rt);
      else if (rt.t - F.stepT > 100) { this.lose(rt, '町口から城へ退けず、坂道を敵に断たれた'); return; }
    }
    if (F.step === 3) {
      const L = F.waves || [];
      // 後詰までの時は「本丸を味方が持ち続ける間」だけ進む（siege_zones の WIN.timeHeld。本丸を取られたら数え直し）
      const hon = F.SZ && F.SZ.byId.hon;
      const left = Math.max(0, 125 - (hon ? hon.friendHeldT : rt.t - F.stepT));
      const honLost = hon && hon.owner !== ZONE_STATE.FRIEND;
      const fg = F.gates.find((s) => s && s.alive) || F.gates[F.gates.length - 1];
      rt.objProgress('main', `${fg.name} ${Math.round(Math.max(0, fg.hp) / fg.maxHp * 100)}%・${honLost ? `本丸を取り返せ・あと ${Math.max(0, Math.ceil(45 - F.honLostT))}秒` : `木戸を支える あと${Math.ceil(left)}秒`}`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (hon && hon.friendHeldT >= 125) this.midB(rt);
    }
    // 危うい時の退き道：三の丸の大手木戸が傷めば二の丸へ、二の丸の木戸が傷むか自分が深手を負えば本丸へ退かせる
    if ((F.step === 3 || F.step === 3.5) && !F.backedNi && (!F.gate.alive || F.gate.hp < F.gate.maxHp * 0.3)) this.toNinomaru(rt);
    if ((F.step === 3 || F.step === 3.5) && !F.backed && (!F.kidoNi.struct.alive || F.kidoNi.struct.hp < F.kidoNi.struct.maxHp * 0.3 || rt.player.u.hp < rt.player.u.maxHp * 0.3)) this.toHonmaru(rt);
    if (F.backed && !F.inHon && F.C.kuruwa.hon.test(p.x, p.z)) {
      F.inHon = true;
      rt.objDone('honmaru');
      rt.unmark('hon');
      rt.say('武藤五郎右衛門', 'よう戻った。本丸の口で槍を揃えよ。ここなら寄せ手は横に広がれぬ', 3.5);
    }
  },

  // 門を閉めた城の内（曲輪の中で、近くに敵がいない）では、息を整えて傷が少しずつ癒える（城へ退けば守れる）
  tickBreath(rt, dt) {
    const F = rt.flags, u = rt.player.u;
    if (!F.C || !u.alive || F.step < 1 || !F.gateMk || F.ending) return;
    const p = u.pos, K = F.C.kuruwa;
    // 町口の段は、味方の列の後ろ（町の内）へ下がれば息がつける。城では、木戸を閉めた曲輪の内
    // 自分のいる曲輪の口の木戸が閉まっていること（破られていれば息はつけない）
    const shutG = K.hon.test(p.x, p.z) ? F.gateHonMk : K.ni.test(p.x, p.z) ? F.gateNiMk : K.san.test(p.x, p.z) ? F.gateMk : null;
    const inside = F.step < 2 ? p.z > TOWN.z + 4 : !!shutG && !shutG.opened && !shutG.breached && shutG.struct.alive;
    if (!inside) { F.breathT = 0; return; }
    if ((F.breathChk = (F.breathChk || 0) - dt) <= 0) {
      F.breathChk = 0.5;
      F.breathSafe = !rt.army.nearestEnemy(u, 9, (o) => !o.fleeing);
    }
    if (!F.breathSafe) { F.breathT = 0; return; }
    F.breathT = (F.breathT || 0) + dt;
    if (F.breathT < 2 || u.hp >= u.maxHp) return;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.035 * dt);
    if (u.hp < u.maxHp * 0.7) {
      const k = F.step < 2 ? 'breathSaidT' : 'breathSaid';
      if (!F[k]) { F[k] = true; rt.bark(F.step < 2 ? '列の後ろで、息を整える' : '木戸の内で、息を整える', true); }
    }
  },
  // 退く時に開けた内の木戸：自分が内へ入ったら城の者が閉める（入らなくても 30 秒で閉める）
  tickShut(rt, dt) {
    const F = rt.flags, S = F.shut, u = rt.player.u;
    if (!S) return;
    if (!S.G.opened || S.G.breached) { F.shut = null; return; }
    S.inT = S.test(u.pos.x, u.pos.z) ? S.inT + dt : 0;
    if ((S.inT > 1.5 || rt.t - S.t0 > 30) && F.gu.close(S.G)) { F.shut = null; rt.say('武藤五郎右衛門', `${S.G.name}を閉めた！　内で息を整えよ`, 2.5); }
  },
  // 町口の正面に、崩しても崩しても新手が出る（持ち場ごとに本物の一組。崩れれば少し置いて後ろから次。本物の兵は 250 人ほどまで）
  tickStream(rt) {
    const F = rt.flags;
    if (!F.stream || F.step !== 1) return;
    F.streamG = F.streamG || [];
    let real = 0;
    for (const g of rt.army.groups) real += g.count || 0;
    for (let i = 0; i < F.stream.length; i++) {
      const S = F.stream[i];
      if (S.g && !gone(S.g) && S.g.count >= 5) { S.next = rt.t + 5; continue; }
      if (S.g && !gone(S.g)) { S.g.noRout = false; S.g.morale = Math.min(S.g.morale, 15); }
      if (rt.t < S.next || real > 135) continue;
      const az = i === 0 || (S.n || 0) % 3 === 2, flag = az ? AZA : ASA;
      S.n = (S.n || 0) + 1; S.next = rt.t + 6;
      const g = enemyGroup(rt, { faction: 'saito', name: az ? '浅井の新手' : '朝倉の新手', anchor: { x: S.x + (Math.random() - 0.5) * 8, z: -62 }, facing: 0, order: 'attack', seekRange: 110, aggro: 14, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.34, formation: 'yari' },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, ...(S.n % 2 ? [{ type: 'bow', n: 2 }] : [])], flag));
      KIT.backOf(rt, g, { flag: flag.flag, armor: az ? 0x2e2a26 : 0x33291f, kind: 'spear', w: 18, depth: 9, count: 150, seed: 15840 + i * 7 + S.n });
      S.g = g; F.streamG.push(g);
      real += g.count;
      if (S.n === 2 && i === 1) rt.say('森可成', '口を塞いで押し返せ！　三万の敵を追って出るな！', 3.5);
    }
  },
  // 本陣へ寄った時：奥ほど敵が濃いのを知らせ、本陣の印を出す
  tickCamps(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (!F.campNear && p.z < -70) { F.campNear = true; rt.say('足軽', '奥へ行くほど、旗が濃くなる……この奥に浅井・朝倉の本陣があるぞ', 3.5); }
    for (const [id, c, label] of [['campA', F.campA, '朝倉義景の本陣'], ['campB', F.campB, '浅井長政の本陣']]) {
      if (!c || F['mk_' + id] || Math.hypot(p.x - c.pos.x, p.z - c.pos.z) > 75) continue;
      F['mk_' + id] = true;
      rt.marker(id, { x: c.pos.x, z: c.pos.z }, label, { red: true, h: 4 });
      rt.bark(`${label}が見えた`, true);
    }
  },
  // 史実の討死：大軍が武将の周りを埋めて寄せ、遠くからも見える形で討つ（助けに行っても止められない）
  doom(rt, o) {
    const F = rt.flags, u = o.u;
    if (!u || !u.alive || F.step >= 3) return;
    const c = { x: u.pos.x, z: u.pos.z };
    sfx('horagai', 0.7);
    rt.banner(`${o.name}、大軍に囲まれる`, '浅井・朝倉の大軍が、町口を呑みこんでゆく');
    rt.say('足軽', `${o.name}の手が敵に包まれる！　南の坂道へ退け！`, 3);
    
    // 周りの四方から、軽い大軍が輪を縮める（城の坂からも見える）
    const ring = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4, r = 34, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r, fl = k % 2 ? 'azai' : 'asakura';
      ring.push(rt.world.addDistantArmy({ x, z, w: 26, d: 9, count: 200, facing: Math.atan2(c.x - x, c.z - z), armor: fl === 'azai' ? 0x2e2a26 : 0x33291f, flagTex: flagTexture(fl), mon: fl, seed: 15860 + k + (o.key === 'mori' ? 10 : 0), team: 1 }));
    }
    for (const h of ring) h.advance(24, o.dur - 2, { charge: true });
    // 本物の兵の一組が武将へ斬り込む
    const g = enemyGroup(rt, { faction: 'saito', name: `${o.name}を囲む${o.flag === AZA ? '浅井' : '朝倉'}勢`, anchor: { x: c.x + 4, z: c.z - 16 }, fixed: true, facing: 0, order: 'attack', seekRange: 26, aggro: 14, width: 10, morale: 100, noRout: true, dmgMult: 0.9 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }], o.flag));
    if (o.g) { o.g.order = 'hold'; o.g.aggro = 18; }
    rt.after(o.dur - 4, () => { if (u.alive) rt.say(o.name, o.last, 3); });
    rt.after(o.dur, () => {
      if (u.alive) { u.invuln = false; rt.army.kill(u, g.units.find((q) => q.alive) || null); }
      F[o.key + 'Dead'] = true;
      rt.unmark('doom_' + o.key);
      sfx('kane', 0.5);
      rt.banner(`${o.name}、討ち死に`, o.key === 'mori' ? '宇佐山城の主・森可成、坂本の町口に散る' : '信長の弟・織田信治、坂本の町口に散る');
      rt.bark(`${o.name}が討ち死にした`, true);
      if (o.g) { o.g.noRout = false; o.g.morale = 0; o.g.fleeDir = { x: -0.4, z: 1 }; }
      rt.after(3, () => rt.say('足軽', `${o.name}の手はもう持たぬ。城の木戸へ急げ！`, 2.5));
      rt.after(14, () => { for (const h of ring) h.rout({ hideAfter: 20 }); g.noRout = false; if (!gone(g)) g.morale = 0; });
    });
  },
  // 二の丸への退き：三の丸が危うい時、城の守りを二の丸の木戸へ下げる
  toNinomaru(rt) {
    const F = rt.flags;
    if (F.backedNi) return;
    F.backedNi = true;
    rt.unmark('gate');
    rt.marker('ni', F.C.kuruwa.ni.centroid, '二の丸へ退け', { h: 3 });
    rt.obj('inner', '二の丸の木戸の内へ退き、寄せ手を受けよ', 'order');
    rt.bark('危うい。二の丸へ退け', true);
    rt.say('武藤五郎右衛門', F.gate.alive ? '三の丸は持たぬ！　二の丸の木戸で受けよ！' : '大手が破られた！　二の丸へ退け！', 3.5);
    // 二の丸の木戸の内（三の丸の側）で槍を揃える
    F.keep.anchor = { x: GATE_NI.x, z: GATE_NI.z + 3.5 }; F.keep.facing = Math.PI;
    // 二の丸の木戸を開けて迎え入れ、入ったら城の者が閉める（閉めれば、その内で息がつける）
    if (F.gu.open(F.gateNiMk)) F.shut = { G: F.gateNiMk, test: (x, z) => F.C.kuruwa.ni.test(x, z) || F.C.kuruwa.hon.test(x, z), t0: rt.t, inT: 0 };
  },
  // 本丸への退き：印を出し、城の守りを本丸の口へ下げる。任務は続く（持てば勝ち）
  toHonmaru(rt) {
    const F = rt.flags;
    F.backed = true;
    rt.unmark('ni');
    rt.marker('hon', { x: USA.x, z: USA.z }, '本丸', { h: 3 });
    rt.obj('inner', '本丸へ退き、本丸の木戸の内で持ちこたえよ', 'order');
    rt.bark('危うい。本丸へ退け', true);
    rt.say('武藤五郎右衛門', F.kidoNi.struct.alive ? '無理をするな！　本丸へ下がって、口で受けよ！' : '二の丸の木戸はもう持たぬ！　本丸へ退け、本丸の口で受けよ！', 3.5);
    // 本丸の木戸の内（切岸の上の口）で槍を揃える
    F.keep.anchor = { x: GATE_HON.x - 3.5, z: GATE_HON.z }; F.keep.facing = Math.PI / 2;
    if (F.gu.open(F.gateHonMk)) F.shut = { G: F.gateHonMk, test: (x, z) => F.C.kuruwa.hon.test(x, z), t0: rt.t, inT: 0 };
    rt.player.u.hp = Math.max(rt.player.u.hp, rt.player.u.maxHp * 0.3);
  },
  // 守る区域の持ち主が変わった（siege_zones.js の onFall）：三の丸→二の丸→本丸の順に退く
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z || F.ending) return;
    if (id === 'san' && z.owner === ZONE_STATE.ENEMY && !F.backedNi) this.toNinomaru(rt);
    if (id === 'ni' && z.owner === ZONE_STATE.ENEMY && !F.backed) this.toHonmaru(rt);
    if (id === 'hon' && z.owner === ZONE_STATE.ENEMY) {
      rt.marker('hon', HON_C, '取り返す本丸', { h: 3 });
      rt.say('武藤五郎右衛門', '本丸に入られた！　四十五秒以内に敵を追い出し、城兵を六人以上、本丸へ集めよ！', 3.5);
    }
    if (z.owner === ZONE_STATE.FRIEND && F['lost_' + id]) rt.say('武藤五郎右衛門', `${z.name}を取り返した！`, 2.5);
    if (z.owner === ZONE_STATE.ENEMY) F['lost_' + id] = true;
  },
  // 軽い部隊の押し合い（町口の前）と、城へ迫る大軍が切岸の下で削られる様子
  tickLight(rt, dt) {
    const F = rt.flags;
    const near = (a, b, r) => { const p = bPos(a), q = bPos(b); return Math.hypot(p.x - q.x, p.z - q.z) < r; };
    if (F.clashT) {
      for (const e of [F.bAsa, F.bAza]) for (const o of [F.bMori, F.bNobu]) if (!bDead(e) && !bDead(o) && near(e, o, 30)) lightClash(e, o, dt, 0.3);
    }
    if (F.step !== 3 || !F.AA || !F.bSiege) return;
    F.AA.tick(dt);
    if (!F.aaSaid && F.AA.mainRoute) {
      F.aaSaid = true;
      const m = F.AA.mainRoute, f = F.AA.feintRoute;
      rt.after(14, () => { if (!F.ending && F.step === 3) rt.say('足軽', `寄せ手の大軍が、${m.name}に取り付いた！${f ? `${f.name}にも旗が見える！` : ''}`, 3.5); });
    }
    // 切岸の下に取り付いた大軍は、城の弓と落とす石で少しずつ減る（数だけの軽い作り）
    for (const b of F.bSiege) {
      if (bDead(b)) continue;
      const id = F.AA.stat().assign[b.id];
      const r = ATTACK_ROUTES.find((q) => q.id === id);
      if (r && near(b, { pos: r.entry, real: null, light: null }, 22)) { b.lost = Math.min(b.nominal, b.lost + dt * 0.6); b.morale = Math.max(10, b.morale - dt * 0.15); }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が崩れて退くぞ！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (!F.gates || !F.gates.includes(s)) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(s._saidPct || []).includes(q));
    if (next) { s._saidPct = [...(s._saidPct || []), next]; rt.bark(`${s.name}が叩かれている（残り ${pct}%）`, true); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!F.gates || !F.gates.includes(s)) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();   // 扉が内へ倒れる
    sfx('wood', 1.2);
    rt.say('武藤五郎右衛門', `${s.name}が破られた！　口で押し返せ、中へ入れるな！`, 3.5);
    for (const q of F.waves || []) { q.order = 'attack'; q.seekRange = 60; }
  },
};

// ---------------- 町口の押し合いと、宇佐山城の夜の段 ----------------
// 両軍の総勢（宇佐山城の森可成の兵 千ほど、浅井・朝倉 三万ほど。数には諸説ある）
shiga.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 1000 - (F.ak || 0) * 8 - (F.step >= 3 ? 300 : 0)), a0: 1000, b: Math.max(0, 30000 - (F.ek || 0) * 20), b0: 30000 };
};
shiga.sides = { a: { name: '織田軍（宇佐山城）', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'asakura' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
shiga.famous = [];
shiga.date = () => '元亀元年九月十六日〜二十四日　秋';
shiga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '可成の話を飛ばす' : '');
shiga.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
shiga.history = '『信長公記』巻三「志賀御陣之事」では、九月十六日、森可成は千人に満たない兵で坂本の町はずれへ下り、浅井・朝倉の先手に小勝ちを得た。十九日、三万ほどの敵が両手から押し寄せ、森可成・織田信治・青地茂綱らが討ち死にした。二十日とも伝わるが、本戦は信長公記の十九日に合わせた。敵は端城まで攻め上って火を放ったが、武藤五郎右衛門・肥田彦左衛門が城を守った。二十四日、摂津から戻った信長が逢坂を越えると、坂本の敵は比叡山へ上がった。兵数や城内の並びには諸説ある。両手を北の正面と西の山側に分けた布陣、少数の鉄砲の射撃、木戸ごとの攻防と時間は遊びのための復元であり、史料にない夜襲は設けていない。対陣は十二月の和議まで続いた。';

// 素直な遊び手：町口で朝倉と戦い、城へ退き、木戸に取り付く寄せ手を討つ
shiga.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;

  // 本丸へは道（木戸→二の丸→本丸の木戸）を通る。切岸は登れないので、間の口を順に踏む
  const inHon = F.C && F.C.kuruwa.hon.test(u.pos.x, u.pos.z);
  const inNi = !inHon && F.C && F.C.kuruwa.ni.test(u.pos.x, u.pos.z);
  const inSan = !inHon && !inNi && F.C && F.C.kuruwa.san.test(u.pos.x, u.pos.z);
  const inside = inHon ? { x: USA.x, z: USA.z } : inNi ? { x: GATE_HON.x - 4, z: GATE_HON.z } : inSan ? { x: GATE_NI.x, z: GATE_NI.z + 4 } : { x: GATE_OUT.x, z: GATE_OUT.z + 4 };
  if (b.botRest && F.step !== 2) { inp.guardHold = false; const r = F.step >= 3 ? inside : { x: TOWN.x + 4, z: TOWN.z + 16 }; goTo(p, inp, r.x, r.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 2 || ((F.backed || F.backedNi) && !(F.backed ? inHon : inNi || inHon)) ? 2.5 : 12, (o) => !o.fleeing && !o.noTarget && (F.step < 3 || F.C.kuruwa.san.test(o.pos.x, o.pos.z) || F.C.kuruwa.ni.test(o.pos.x, o.pos.z) || F.C.kuruwa.hon.test(o.pos.x, o.pos.z)) && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const inG = { x: F.gateC.x - F.gateN.x * 5, z: F.gateC.z - F.gateN.z * 5 };
  // 町口では口を塞ぐ：列の前に立ち、寄せてくる者だけを討つ（大軍の中へ一人で深く追わない）
  if (F.step === 1.5) { goTo(p, inp, TOWN.x, TOWN.z, 3); return; }
  if (F.step === 1) { const q = [F.w1, F.w1b].find((x) => x && !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, TOWN.z - 16), 2); return; } }
  if (F.step === 2) {
    // 切岸は登れないので、町口→坂の下→坂（RAMPS）→木戸の内の順に道を踏む
    const wp = u.pos.z < 30 && Math.hypot(u.pos.x - 12, u.pos.z - 34) > 4 ? { x: 12, z: 34 } : u.pos.z < 47 ? { x: -6, z: 48 } : inG;
    goTo(p, inp, wp.x, wp.z, 1.5); return;
  }
  if (F.step === 3 || F.step === 3.5) {
    // 木戸の内で、破って入る寄せ手を討つ（木戸は閉めてある）
    // 退けの声が出たら、内の曲輪へ入って、その口の内で受ける
    if (F.backed || F.backedNi) {
      const inner = F.backed ? inHon : inNi || inHon;
      const hold = F.backed ? { x: GATE_HON.x - 4, z: GATE_HON.z } : { x: GATE_NI.x, z: GATE_NI.z + 4 };
      const t = inner ? hold : inside;
      goTo(p, inp, t.x, t.z, 2); return;
    }
    const gk = inG;
    
    goTo(p, inp, gk.x, gk.z, 2);
    return;
  }
  const a = F.moriU.pos; goTo(p, inp, a.x + 3, a.z + 4, 3);
};

shiga.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
export { shiga };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: -30, z: 96, tx: -12, tz: 60, w: 14, R: 52, rise: 55 };
// 長い本丸の全体を同じ高さに保つ。町口を持ち上げず、山側だけへ延ばす。
const HON_LIFT = { x: -135, z: 99, tx: -20, tz: 99, w: 15, R: 32, rise: 55 };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [ROAD.slice(0, 9)]);
  return BENCHED(x, z);
}
