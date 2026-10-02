// ======================================================================
// 織田家編　志賀の陣・宇佐山城（元亀元年九月）
// 信長が摂津の野田・福島に出ている間に、浅井・朝倉の三万が湖の西を下って坂本へ出てきた。
// 宇佐山城を守る森可成は、信長の弟・織田信治とともに坂本で迎え撃ち、二人とも討ち死にした。
// 城は残った者たちが守り通し、摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった。
// 足軽は森可成の手。①坂本の町口で朝倉の先手を迎え撃つ ②大軍に押され、宇佐山城へ退く
// ③宇佐山城の木戸を守る（寄せ手が木戸を破りにかかる）。信長の後詰が来るまで持ちこたえる
// ①と②の間・③の後に段（b_depth.js）：浅井が比叡山の麓から背へ回る（西へ止めに行くか、町口で囲まれるか）→湖べりの町屋の鉄砲衆
// →夜の城攻め（打って出るか、木戸を閉めて守るか）→夜明けの総攻め。町口の左右では大軍が押し合う（軽い作り）
// 向き：東（+x）が琵琶湖。北（-z）から浅井・朝倉が湖の西を下ってくる。南（+z）の山の上に宇佐山城。西に比叡山
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara, tobira } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uG, uB, uC, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
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
function height(x, z) {
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
  return HEIGHT_FN(x, z);
}
// 部隊（butai.js）の本物の兵を決めた数より増やさない（味方も敵の大軍も、遠くで戦う軽い作りのまま）
function capReal(b, n) {
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
  if (b.light && b.light.army) { const A = b.light.army; return { x: A.cx + (A.off ? A.off.x : 0), z: A.cz + (A.off ? A.off.z : 0) }; }
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
    if (hit.length && rt.t - V.last > 7.5) {
      V.last = rt.t; V.n++;
      for (const g of G) g.holdFire = false;
      if (V.n === 1 && o.banner) rt.banner(o.banner[0], o.banner[1]);
      rt.say(o.who, V.n === 1 ? (o.fire || '放てぇっ！') : '次の組、放て！', 1.6);
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
  spawn: { x: TOWN.x + 4, z: TOWN.z + 8, heading: Math.PI },
  world: {
    seed: 15709,
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
    // 坂井政尚の手（同じく町口の守りに加わる。この年の暮れ、堅田で討死する）
    F.sakai = allyGroup(rt, { name: '坂井政尚の手', anchor: { x: TOWN.x - 20, z: TOWN.z - 4 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '坂井政尚', invuln: true, hat: 'kabuto_g', haori: 0x5a2a1c } }, { type: 'ashigaru', n: 10 }], ODA));
    // 城に残る者（各務元正ら）
    F.keep = allyGroup(rt, { name: '宇佐山城の守り', anchor: { x: -11, z: 80 }, facing: GA, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '各務元正', invuln: true, hat: 'kabuto_w' } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 4 }], ODA));
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
    F.bAsa = mkB({ name: '朝倉の先手の本隊', general: '朝倉景鏡', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 500, armor: 0x33291f, flag: 'asakura', at: { x: 28, z: -96 }, facing: 0 }, 0);
    F.bAza = mkB({ name: '浅井の手（浅井政澄）', general: '浅井政澄', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 450, armor: 0x2e2a26, flag: 'azai', at: { x: -22, z: -92 }, facing: 0.15 }, 0);
    for (const b of [F.bMori, F.bNobu, F.bAsa, F.bAza]) b.order({ id: 'hold' });

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '森可成の下で町口の一手を預かり、坂本の町口を固めよ' : '森可成のもとで、坂本の町口を固めよ', 'main');
    rt.say('森可成', `${nm(rt)}、湖の西を浅井・朝倉が下ってくる。三万じゃ。殿（信長公）は摂津で三好と対陣しておられる`, 5);
    rt.say('織田信治', '京へ抜かれれば、殿は挟まれる。ここで一日でも止めるぞ', 4);
    rt.marker('mori', unitPos(F.moriU), '森可成', {});
    rt.after(7, () => rt.say('森可成', '敵の本陣は北の奥、湖の西の道の先じゃ。旗の濃い方ほど、本陣が近い', 4));
    rt.after(12, () => this.first(rt));
  },

  // ① 朝倉の先手を迎え撃つ
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.unmark('mori');
    sfx('horagai', 0.9);
    rt.banner('朝倉の先手', '湖の西の道を、朝倉の旗が下ってくる');
    rt.obj('main', '町口で朝倉の先手を迎え撃て', 'main');
    for (const h of F.host) h.advance(40, 60);
    // 朝倉・浅井の本隊が町口の前の野を埋める（軽い作り。町口の斬り合いは名のある組の本物だけ。本隊は混ぜない）
    F.bAsa.order({ id: 'move', to: { x: 28, z: -50 } });
    F.bAza.order({ id: 'move', to: { x: -12, z: -54 } });
    F.clashT = true;
    const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 22, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55, formation: 'yari' },
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
    // 一斉射：信治の鉄砲組を町口の前に並べ、先手が寄せた所で放つ（元亀元年、鉄砲はまだ少ない）
    F.guns = allyGroup(rt, { name: '信治の鉄砲組', anchor: { x: TOWN.x + 10, z: TOWN.z - 12 }, facing: Math.PI, width: 10, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 6 }], ODA));
    volleyScene(rt, { guns: () => [F.guns, F.nobuharu], at: { x: TOWN.x + 6, z: TOWN.z - 14 }, r: 34, who: '織田信治', shots: 3,
      banner: ['一斉射', '町口の鉄砲が、寄せる先手の頭を叩く'], clash: () => F.lines });
    rt.after(34, () => {
      if (F.step !== 1) return;
      F.w1b = enemyGroup(rt, { faction: 'saito', name: '朝倉の二の手', anchor: { x: 44, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
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
    rt.unmark('w1'); rt.unmark('w1b');
    for (const q of [F.w1, F.w1b]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('朝倉の先手を退けた'), '朝倉の先手を退けた');
    for (const h of F.host) h.advance(30, 50);
    depthStart(rt, shigaCtx(rt), shigaA(), () => this.fall(rt));
  },
  // ③の後の段：夜の城攻め → 夜明けの総攻め → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    for (let i = 0; i < 3; i++) rt.unmark('x' + i);
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('木戸に取り付く寄せ手を退けた'), '木戸を守った');
    rt.world.setTime('dusk');
    for (const b of F.bSiege || []) if (!bDead(b)) b.order({ id: 'retreat' });
    depthStart(rt, shigaCtx(rt), shigaB(), () => this.win(rt));
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
    const g = enemyGroup(rt, { faction: 'saito', name: '浅井の手', anchor: { x: -30, z: -30 }, facing: Math.PI * 0.7, order: 'attack', seekRange: 100, aggro: 14, width: 16, morale: 100, fleeDir: { x: -1, z: -1 }, dmgMult: 0.7 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }], AZA));
    F.w2 = g;
    rt.marker('w2', centerOf(g), () => `浅井の手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.say('森可成', `……多すぎる。${nm(rt)}、そなたらは宇佐山の城へ上がれ。わしと信治殿がここで食い止める`, 5);
    rt.say('織田信治', '城を頼む。殿が戻られるまで、城を渡すな！', 3.5);
    rt.obj('main', '宇佐山城へ退け', 'main');
    rt.marker('usa', F.gateC, '宇佐山城', { h: 3 });
    // 退く先は大手木戸の内（城の者が木戸を開けて待つ。入ったら自分で閉める）
    rt.zone('usa', F.gateC.x - F.gateN.x * 5, F.gateC.z - F.gateN.z * 5, 5);
    F.gu.open(F.gateMk);
    // 史実の討死（kaito 10/2）：大軍が森可成・織田信治の周りを埋め、遠くからも見える形で討たれる
    rt.after(6, () => this.doom(rt, { u: F.nobuU, g: F.nobuharu, key: 'nobu', name: '織田信治', flag: ASA, last: '兄上……殿、あとを頼みまする！', dur: 16 }));
    rt.after(13, () => this.doom(rt, { u: F.moriU, g: F.mori, key: 'mori', name: '森可成', flag: AZA, last: `ここまでじゃ……${nm(rt)}、城を頼むぞ！`, dur: 18 }));
    // 森・信治の手は町口に踏みとどまる
    for (const q of [F.mori, F.nobuharu]) { q.order = 'hold'; q.aggro = 16; }
    rt.obj('path', '追手に構わず、坂を上れ', 'order');
    // 坂道を上る間：町口を抜けた浅井の追手が少し追いすがる（歩くだけの間を作らない）
    rt.after(10, () => {
      if (F.step !== 2) return;
      F.chase = enemyGroup(rt, { faction: 'saito', name: '追いすがる浅井勢', anchor: { x: TOWN.x - 6, z: TOWN.z + 16 }, facing: Math.PI, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 70, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZA));
      rt.marker('chase', centerOf(F.chase), () => `追手・${moraleWord(F.chase.morale)}`, { red: true, group: F.chase });
      rt.say('足軽', '後ろから浅井の追手じゃ！　振り返って一突きして、また上れ！', 3);
    });
    rt.after(4, () => { if (F.step === 2) rt.say('各務元正', '木戸は開けてある！　味方が入ったら、門の前で閉めよ！', 3.5); });
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
    for (const q of [F.mori, F.nobuharu]) { q.noRout = false; q.morale = 0; q.fleeDir = { x: -0.4, z: 1 }; }
    if (F.w2 && !gone(F.w2)) { F.w2.noRout = false; F.w2.morale = 0; }
    for (const q of F.streamG || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    F.stream = null;
    if (late) { sfx('kane', 0.4); rt.banner('森可成・織田信治、討ち死に', '坂本の町口で、二人とも最後まで戦った'); }
    rt.say('各務元正', '……殿（可成）の仇は、城を守って返す。木戸を閉めよ！　上様が戻られるまで守り抜く', 5);
    // 開いたままの大手木戸は、自分で閉める（閉めなければ、しばらくして城の者が閉める）
    if (F.gateMk.opened && !F.gateMk.breached) {
      F.gateHint = true;
      rt.obj('gate', '大手木戸の前で「門を閉める」を押せ', 'order');
      rt.after(16, () => { if (F.gateMk.opened && !F.gateMk.breached && F.gu.close(F.gateMk)) rt.say('各務元正', '木戸はわしらが閉めた！　槍を揃えよ！', 2.5); });
    }
    rt.obj('main', HI(rt) ? `城兵の一手を率いて宇佐山城に籠り、三の丸→二の丸→本丸の順に木戸を守れ（${AID(rt)}）` : `宇佐山城に籠り、三の丸→二の丸→本丸の順に木戸を守れ（${AID(rt)}）`, 'main');
    rt.obj('honmaru', '危うい時は、城の奥の本丸へ退いて持て', 'side');
    if (HI(rt)) rt.say('各務元正', `${nm(rt)}、木戸の口はそなたの手に預ける。わしは櫓から弓を指図する`, 4);
    F.keep.order = 'hold'; F.keep.anchor = { x: F.gateC.x + F.gateN.x * 4, z: F.gateC.z + F.gateN.z * 4 }; F.keep.facing = Math.atan2(F.gateN.x, F.gateN.z); F.keep.aggro = 12;
    rt.marker('gate', F.gateC, () => { const g = F.gates.find((s) => s && s.alive) || F.gates[F.gates.length - 1]; return `${g.name} ${Math.round(Math.max(0, g.hp) / g.maxHp * 100)}%`; }, { h: 4 });
    F.waves = [];
    // ---- 守る持ち場の区域（siege_zones.js）：三の丸・二の丸・本丸は初めから味方。本丸を 140 秒持ちこたえれば勝ち（WIN.timeHeld） ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.san.test, pos: F.C.kuruwa.san.centroid, need: 6, hold: 10 },
        { id: 'ni', name: '二の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.ni.test, pos: F.C.kuruwa.ni.centroid, need: 6, hold: 12 },
        { id: 'hon', name: '本丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.hon.test, pos: F.C.kuruwa.hon.centroid, need: 6, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      winWhen: [[WIN.timeHeld('hon', 140)]],
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
      const g = enemyGroup(rt, { faction: 'saito', name: ['城へ寄せる朝倉勢', '城へ寄せる浅井勢', '朝倉の新手'][i], anchor: { x: from[0], z: from[1] }, facing: 0, order: 'hold', aggro: 6, width: 10, morale: 95, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, ...(i === 2 ? [{ type: 'gun', n: 3 }] : [])], flag));
      const st = STAGE[i];
      const go = (q) => { if (q.order === 'assault' || gone(q)) return; q.order = 'assault'; q.aggro = 6; };
      g.order = 'move'; g.dest = { x: st.x, z: st.z }; g.speed = 1.2; g.onArrive = go;
      rt.after(40, () => go(g));
      for (const off of [-3, 3]) addTaba(rt, from[0] + off, from[1] + 3, 1, { van: g, off, faceSign: 1, vanDist: 3, rot: 0 });
      if (i === 0) rt.say('各務元正', '竹束を押し立てて来おる。矢は竹に止まる。竹束を捨てて坂を上る所を射よ！', 4);
      g.assault = () => F.gates.find((s) => s && s.alive && !s.opened) || null;
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      KIT.backOf(rt, g, { flag: flag.flag, armor: 0x33291f, kind: 'spear', w: 20, depth: 10, count: 200, seed: 15798 + i });
      F.waves.push(g);
      rt.army.play('eshout', { x: from[0], z: from[1] }, 1.6);
      rt.marker('x' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    // kaito 10/1：波の間を詰めた（50→38・95→70。遊んで10分ほどかかる戦を4〜7分に）
    rt.after(8, () => { mk(0); rt.say('足軽', '寄せてくるぞ！　木戸に取り付かせるな！', 3); });
    rt.after(38, () => { if (!F.ending) { mk(1); rt.say('足軽', '浅井の旗じゃ、また来る！', 2.5); } });
    rt.after(70, () => { if (!F.ending) mk(2); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gate'); for (let i = 0; i < 3; i++) rt.unmark('x' + i);
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const h of F.host) h.retreat(60, 40);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '宇佐山城を守り通した', pts: 20 }; }, '任務達成・宇佐山城を守り通した');
    sfx('horagai', 0.8);
    rt.banner('宇佐山城、守り通す', '摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった');
    rt.say('各務元正', `${nm(rt)}、ようやった。……殿（可成）に、城は渡さなんだと申し上げられる`, 5);
    rt.after(6, () => rt.say('', '――浅井・朝倉は比叡山に籠もり、延暦寺がこれをかくまった。この冬、信長は和を結ぶ。翌年、比叡山は焼かれる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 大軍から目を覚ました敵の兵は、名のある組より当たりを弱める（三万に一人で呑まれて、町口で倒れ続けないように）
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if (g.woke && g.team === 1 && !g.shDm) { g.shDm = true; g.dmgMult = (g.dmgMult || 1) * 0.55; } }
    butaiTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    updateGates();
    if (F.gu) F.gu.tick();
    this.tickStream(rt);
    this.tickCamps(rt);
    if (F.gateHint && F.gateMk.opened === false && !F.gateHintDone) { F.gateHintDone = true; rt.objDone('gate'); }
    tickTabas(rt, dt);
    if (F.SZ && F.step === 3) F.SZ.tick(dt);
    this.tickLight(rt, dt);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const qs = [F.w1, F.w1b].filter(Boolean);
      rt.objProgress('main', `討った敵 ${F.ek || 0}人・寄せ手はまだ尽きぬ`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.w1b && qs.every(gone) && rt.t - F.stepT > 80) || rt.t - F.stepT > 115) this.midA(rt);
    }
    if (F.step === 2) {
      const zc = { x: F.gateC.x - F.gateN.x * 5, z: F.gateC.z - F.gateN.z * 5 };
      const d = Math.hypot(p.x - zc.x, p.z - zc.z);
      rt.objProgress('main', d < 6 && !F.moriDead ? '城の内で、町口を見よ' : `城まで ${Math.max(0, Math.round(d))}m`);
      if ((d < 6 && F.moriDead && F.nobuDead) || rt.t - F.stepT > 100) this.siege(rt);
    }
    if (F.step === 3) {
      const L = F.waves || [];
      // 後詰までの時は「本丸を味方が持っている間」だけ進む（siege_zones の WIN.timeHeld。本丸を取られたら数え直し）
      const hon = F.SZ && F.SZ.byId.hon;
      const left = Math.max(0, 140 - (hon ? hon.friendHeldT : rt.t - F.stepT));
      const honLost = hon && hon.owner !== ZONE_STATE.FRIEND;
      const fg = F.gates.find((s) => s && s.alive) || F.gates[F.gates.length - 1];
      rt.objProgress('main', `${fg.name} ${Math.round(Math.max(0, fg.hp) / fg.maxHp * 100)}%・${honLost ? '本丸を取り返せ' : `後詰まで ${Math.ceil(left)}秒`}`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 260) this.midB(rt);
    }
    // 危うい時の退き道：三の丸の大手木戸が傷めば二の丸へ、二の丸の木戸が傷むか自分が深手を負えば本丸へ退かせる
    if (F.step >= 3 && !F.backedNi && (!F.gate.alive || F.gate.hp < F.gate.maxHp * 0.3)) this.toNinomaru(rt);
    if (F.step >= 3 && !F.backed && (!F.kidoNi.struct.alive || F.kidoNi.struct.hp < F.kidoNi.struct.maxHp * 0.3 || rt.player.u.hp < rt.player.u.maxHp * 0.3)) this.toHonmaru(rt);
    if (F.backed && !F.inHon && F.C.kuruwa.hon.test(p.x, p.z)) {
      F.inHon = true;
      rt.objDone('honmaru');
      rt.unmark('hon');
      rt.say('各務元正', 'よう戻った。本丸の口で槍を揃えよ。ここなら寄せ手は横に広がれぬ', 3.5);
    }
  },

  // 町口の正面に、崩しても崩しても新手が出る（持ち場ごとに本物の一組。崩れれば少し置いて後ろから次。本物の兵は 250 人ほどまで）
  tickStream(rt) {
    const F = rt.flags;
    if (!F.stream || F.step >= 3 || F.step === 1.5) return;
    F.streamG = F.streamG || [];
    let real = 0;
    for (const g of rt.army.groups) real += g.count || 0;
    for (let i = 0; i < F.stream.length; i++) {
      const S = F.stream[i];
      if (S.g && !gone(S.g) && S.g.count >= 5) { S.next = rt.t + 5; continue; }
      if (S.g && !gone(S.g)) { S.g.noRout = false; S.g.morale = Math.min(S.g.morale, 15); }
      if (rt.t < S.next || real > 200) continue;
      const az = i === 0 || (S.n || 0) % 3 === 2, flag = az ? AZA : ASA;
      S.n = (S.n || 0) + 1; S.next = rt.t + 6;
      const g = enemyGroup(rt, { faction: 'saito', name: az ? '浅井の新手' : '朝倉の新手', anchor: { x: S.x + (Math.random() - 0.5) * 8, z: -62 }, facing: 0, order: 'attack', seekRange: 110, aggro: 14, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.42, formation: 'yari' },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, ...(S.n % 2 ? [{ type: 'bow', n: 2 }] : [])], flag));
      KIT.backOf(rt, g, { flag: flag.flag, armor: az ? 0x2e2a26 : 0x33291f, kind: 'spear', w: 18, depth: 9, count: 150, seed: 15840 + i * 7 + S.n });
      S.g = g; F.streamG.push(g);
      real += g.count;
      if (S.n === 2 && i === 1) rt.say('森可成', '退くな！　三万じゃ、尽きるまで斬ろうと思うな。口を塞いで押し返せ！', 3.5);
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
    rt.say('足軽', `${o.name}様の周りが、敵の旗で埋まった……！`, 3);
    rt.marker('doom_' + o.key, unitPos(u), `${o.name}（囲まれる）`, { red: true, h: 4 });
    // 周りの四方から、軽い大軍が輪を縮める（城の坂からも見える）
    const ring = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4, r = 34, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r, fl = k % 2 ? 'azai' : 'asakura';
      ring.push(rt.world.addDistantArmy({ x, z, w: 26, d: 9, count: 200, facing: Math.atan2(c.x - x, c.z - z), armor: fl === 'azai' ? 0x2e2a26 : 0x33291f, flagTex: flagTexture(fl), mon: fl, seed: 15860 + k + (o.key === 'mori' ? 10 : 0), team: 1 }));
    }
    for (const h of ring) h.advance(24, o.dur - 2, { charge: true });
    // 本物の兵の一組が武将へ斬り込む
    const g = enemyGroup(rt, { faction: 'saito', name: `${o.name}を囲む${o.flag === AZA ? '浅井' : '朝倉'}勢`, anchor: { x: c.x + 4, z: c.z - 16 }, fixed: true, facing: 0, order: 'attack', seekRange: 60, aggro: 18, width: 10, morale: 100, noRout: true, dmgMult: 0.9 },
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
      rt.after(3, () => rt.say('足軽', o.key === 'mori' ? '森様が……！　城へ、城へ上がれ！' : '信治様まで……！', 2.5));
      rt.after(14, () => { for (const h of ring) h.rout({ hideAfter: 20 }); g.noRout = false; if (!gone(g)) g.morale = 0; });
    });
  },
  // 二の丸への退き：三の丸が危うい時、城の守りを二の丸の木戸へ下げる
  toNinomaru(rt) {
    const F = rt.flags;
    if (F.backedNi) return;
    F.backedNi = true;
    rt.bark('危うい。二の丸へ退け', true);
    rt.say('各務元正', F.gate.alive ? '三の丸は持たぬ！　二の丸の木戸で受けよ！' : '大手が破られた！　二の丸へ退け！', 3.5);
    // 二の丸の木戸の内（三の丸の側）で槍を揃える
    F.keep.anchor = { x: GATE_NI.x, z: GATE_NI.z + 3.5 }; F.keep.facing = Math.PI;
  },
  // 本丸への退き：印を出し、城の守りを本丸の口へ下げる。任務は続く（持てば勝ち）
  toHonmaru(rt) {
    const F = rt.flags;
    F.backed = true;
    rt.marker('hon', { x: USA.x, z: USA.z }, '本丸', { h: 3 });
    rt.obj('honmaru', '本丸へ退き、本丸の口で持ちこたえよ', 'side');
    rt.bark('危うい。本丸へ退け', true);
    rt.say('各務元正', F.kidoNi.struct.alive ? '無理をするな！　本丸へ下がって、口で受けよ！' : '二の丸の木戸はもう持たぬ！　本丸へ退け、本丸の口で受けよ！', 3.5);
    // 本丸の木戸の内（切岸の上の口）で槍を揃える
    F.keep.anchor = { x: GATE_HON.x - 3.5, z: GATE_HON.z }; F.keep.facing = Math.PI / 2;
    rt.player.u.hp = Math.max(rt.player.u.hp, rt.player.u.maxHp * 0.3);
  },
  // 守る区域の持ち主が変わった（siege_zones.js の onFall）：三の丸→二の丸→本丸の順に退く
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z || F.ending) return;
    if (id === 'san' && z.owner === ZONE_STATE.ENEMY && !F.backedNi) this.toNinomaru(rt);
    if (id === 'ni' && z.owner === ZONE_STATE.ENEMY && !F.backed) this.toHonmaru(rt);
    if (id === 'hon' && z.owner === ZONE_STATE.ENEMY) rt.say('各務元正', '本丸に入られた！　押し返せ、ここを取られては後詰が間に合わぬ！', 3.5);
    if (z.owner === ZONE_STATE.FRIEND && F['lost_' + id]) rt.say('各務元正', `${z.name}を取り返した！`, 2.5);
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
    if (g.team !== 1) return;
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
    rt.say('各務元正', `${s.name}が破られた！　口で押し返せ、中へ入れるな！`, 3.5);
    for (const q of F.waves || []) { q.order = 'attack'; q.seekRange = 60; }
  },
};

// ---------------- 町口の押し合いと、宇佐山城の夜の段 ----------------
function shigaCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'asakura', armor: 0x33291f, dmg: 0.64, look: (l) => dress(l, ASA), friends: () => (F.step < 2 ? [F.mori, F.nobuharu] : [F.keep]).filter((g) => g && g.count), aid: { name: '森の手の一組', list: [uS(1), uA(8)] }, aidSaid: '森の手から一組が加わった' };
}
// 木戸の外（寄せ手の来る側）
const outGate = (rt, k = 8) => ({ x: rt.flags.gateC.x + rt.flags.gateN.x * k, z: rt.flags.gateC.z + rt.flags.gateN.z * k });
function shigaA() {
  const T = { x: TOWN.x, z: TOWN.z - 4 };
  const R = round(T, Math.PI, 46);
  const WEST = { x: -10, z: 4 };
  const LAKE = { x: 42, z: -4 };
  return [
    rest({ dur: 8, say: [['森可成', '先手は退けた。……じゃが見よ、湖の西が旗で埋まっておる'], ['足軽', 'あれが三万……']] }),
    pick({ title: '浅井の手が比叡山の麓を回り、町口の西（背）へ出ようとしている。どうする？',
      pre: (rt) => rt.say('伝令', '浅井の旗が比叡山の麓を回っておりまする！　町口の背を断つ気でございます！', 3.5),
      options: [{ label: '西の山裾へ回り、浅井の先を止める', note: '背を断たれずに済む。町口の森殿の手が手薄になる' }, { label: '町口の森殿のそばを離れない', note: '町口は固い。浅井に背と横へ回られ、囲まれる' }],
      on: (rt, m, i) => { m.sgWest = i === 0; rt.say('森可成', i === 0 ? 'よし、西へ走れ！　山裾で浅井の頭を叩け' : 'よし、ここで槍を揃えよ。背にも目を配れ', 3); } }),
    fight({ skip: (rt, m) => !m.sgWest, at: WEST, max: 150, title: '比叡山の麓', sub: '山裾を回る浅井の手の頭を叩く', obj: '山裾を回る浅井の手を止めよ',
      foes: () => [{ name: '山裾を回る浅井の手', from: { x: -60, z: -40 }, flag: 'azai', list: dress([uS(2), uA(14)], AZA), mass: 240, noRout: 20 }],
      later: [
        { t: 35, title: '新手', sub: '浅井の新手が山から下りる', say: ['足軽', '山の上からも浅井じゃ！'], foes: () => [{ name: '山から下りる浅井勢', from: { x: -60, z: 20 }, flag: 'azai', list: dress([uS(1), uA(10), uB(3)], AZA), mass: 160 }] },
        { t: 70, say: ['足軽', '町口の方で、朝倉が押しておる……！　後ろからも来るぞ'], foes: () => [{ name: '町口を抜けた朝倉勢', from: { x: 20, z: -30 }, list: [uS(1), uA(10)], mass: 140 }] },
      ],
      reward: (t) => { t.special = { label: '比叡山の麓で浅井の手を止めた', pts: 20 }; }, rewardLabel: '浅井の手を止めた' }),
    hold({ skip: (rt, m) => m.sgWest, at: T, dur: 85, r: 14, title: '町口', sub: '朝倉の正面、浅井の横と背', label: '坂本の町口', obj: '町口で踏みとどまり、囲みにかかる浅井・朝倉を退けよ',
      waves: [
        { t: 5, say: ['足軽', '朝倉が正面から押してくる！'], foes: () => [{ name: '朝倉の三の手', from: R.front, list: [uS(2), uA(14)], mass: 260 }] },
        { t: 35, say: ['足軽', '左じゃ！　浅井の旗が山裾から！'], foes: () => [{ name: '横へ出た浅井の手', from: R.left, flag: 'azai', list: dress([uS(2), uA(12)], AZA), mass: 220 }] },
        { t: 70, say: ['森可成', '背へ回られた……！　囲まれるな、背を合わせよ！'], foes: () => [{ name: '背へ回った浅井の手', from: R.back, flag: 'azai', list: dress([uS(1), uA(10)], AZA), mass: 160 }] },
      ],
      reward: '町口で囲みに耐えた' }),
  ];
}
function shigaB() {
  return [
    rest({ dur: 10, bark: '木戸の傷みを板で塞げ', say: [['各務元正', '日が暮れる。……寄せ手は夜も来る'], ['足軽', '坂本の町が燃えておる……']] }),
    pick({ title: '夜、寄せ手が城の左右の尾根から回り込み、木戸を囲みにかかる。どうする？',
      options: [{ label: '木戸を開けて打って出て、寄せ手の頭を叩く', note: '寄せ手を先に崩せば手柄。城の外で囲まれる' }, { label: '木戸を閉めて、口の内外で守る', note: '木戸を背に守る。木戸は叩かれ、鉄砲を浴びる' }],
      on: (rt, m, i) => {
        const F = rt.flags, G = F.gateMk;
        m.sgOut = i === 0;
        rt.say('各務元正', i === 0 ? 'よし、大手木戸の前で「門を開ける」を押し、打って出よ！　戻ったら閉めよ' : 'よし、閉めよ！　木戸の内に槍を揃えよ', 3.5);
        if (G.breached) return;
        if (i === 0) rt.after(14, () => { if (!G.opened) F.gu.open(G); });
        else F.gu.close(G);
      } }),
    fight({ skip: (rt, m) => !m.sgOut, at: (rt) => outGate(rt, 22), max: 150, title: '打って出る', sub: '夜の坂道を、寄せ手が上ってくる', obj: '城の外に打って出て、寄せ手の頭を崩せ',
      foes: (rt) => { const o = outGate(rt, 22); return [{ name: '夜の寄せ手（朝倉勢）', from: { x: o.x + 30, z: o.z - 40 }, list: [uS(2), uA(14)], mass: 260, noRout: 20 }]; },
      later: [
        { t: 30, title: '囲まれる', sub: '左右の尾根から、浅井勢が下りる', say: ['足軽', '左右の尾根から……！　城へ戻る道を断たれる！'], foes: (rt) => { const o = outGate(rt, 22); return [{ name: '左の尾根の浅井勢', from: { x: o.x - 40, z: o.z - 10 }, flag: 'azai', list: dress([uS(1), uA(10)], AZA), mass: 160 }, { name: '右の尾根の浅井勢', from: { x: o.x + 40, z: o.z + 10 }, flag: 'azai', list: dress([uS(1), uA(10)], AZA), mass: 160 }]; } },
        { t: 65, say: ['足軽', '坂の下に鉄砲が並んだ……！'], foes: (rt) => { const o = outGate(rt, 22); return [gunLine('坂の下の朝倉の鉄砲衆', { x: o.x + 20, z: o.z - 44 }, o, 9)]; } },
      ],
      reward: (t) => { t.special = { label: '夜に打って出て、寄せ手の頭を崩した', pts: 25 }; }, rewardLabel: '夜に打って出た' }),
    hold({ skip: (rt, m) => m.sgOut, at: (rt) => outGate(rt, 6), dur: 85, r: 11, title: '夜の木戸', sub: '闇の坂から、たいまつが次々に上ってくる', label: '木戸の前', obj: '木戸の前で、夜の寄せ手を退けよ',
      waves: [
        { t: 5, say: ['足軽', 'たいまつが……坂いっぱいじゃ'], foes: (rt) => { const o = outGate(rt, 6); return [{ name: '夜の寄せ手（朝倉勢）', from: { x: o.x + 20, z: o.z - 44 }, list: [uS(2), uA(14)], mass: 260 }]; } },
        { t: 35, say: ['足軽', '左の尾根からも……！'], foes: (rt) => { const o = outGate(rt, 6); return [{ name: '左の尾根の浅井勢', from: { x: o.x - 40, z: o.z - 14 }, flag: 'azai', list: dress([uS(1), uA(12)], AZA), mass: 180 }]; } },
        { t: 65, say: ['各務元正', '鉄砲じゃ、伏せよ！　撃ち終わりに突け！'], foes: (rt) => { const o = outGate(rt, 6); return [gunLine('坂の下の朝倉の鉄砲衆', { x: o.x + 16, z: o.z - 40 }, o, 11)]; } },
        { t: 85, say: ['足軽', '右の尾根も……囲まれた！'], foes: (rt) => { const o = outGate(rt, 6); return [{ name: '右の尾根の浅井勢', from: { x: o.x + 40, z: o.z + 10 }, flag: 'azai', list: dress([uS(1), uA(10)], AZA), mass: 160 }]; } },
      ],
      reward: '夜の木戸を守りぬいた' }),
    // 夜更け：水の手（谷の井戸）を断ちにかかる浅井の手
    rest({ dur: 6, heal: 0.25, say: [['足軽', '……城の裏の谷で、松明が動いておる'], ['各務元正', '水の手じゃ。井戸を断たれれば、城は三日と持たぬ']] }),
    pick({ title: '夜更け、浅井の手が城の水の手（谷の井戸）を断ちにかかる。どうする？',
      options: [{ label: '谷へ下りて、水の手を守る', note: '水があれば明日も戦える。そのあいだ木戸が手薄になる' }, { label: '水を分けて耐え、木戸を固める', note: '木戸は固い。喉の渇いた兵で、夜明けの総攻めを受ける' }],
      on: (rt, m, i) => { m.sgDry = i === 1; rt.say('各務元正', i === 0 ? '谷へ下りよ！　井戸の口を背にして槍を揃えれば、狭い谷は一人で三人を止められる' : 'よし、水は一人一口ずつじゃ。木戸の前を固めよ', 3.5); } }),
    fight({ skip: (rt, m) => m.sgDry, at: WELL, max: 150, title: '水の手', sub: '城の裏の谷で、井戸を断ちに来た浅井の手とぶつかる',
      obj: (rt) => (HI(rt) ? '預かった手を連れて谷へ下り、水の手を守りぬけ' : '谷の水の手で、井戸を断ちに来た浅井の手を退けよ'),
      foes: () => [{ name: '水の手を断つ浅井勢', from: { x: WELL.x - 30, z: WELL.z - 8 }, flag: 'azai', list: dress([uS(2), uA(14)], AZA), mass: 220, noRout: 20 }],
      later: [{ t: 40, title: '谷の上から', sub: '尾根の浅井の弓が、谷へ射下ろす', say: ['足軽', '尾根の上から矢じゃ！　井戸の陰へ！'], foes: () => [{ name: '尾根の浅井の弓', from: { x: WELL.x - 20, z: WELL.z + 26 }, flag: 'azai', list: dress([uS(1), uA(6), uB(6)], AZA), mass: 140 }] }],
      reward: (t) => { t.special = { label: '宇佐山城の水の手を守りぬいた', pts: 20 }; }, rewardLabel: '水の手を守った',
      onEnd: (rt, m, won) => { if (won) rt.say('各務元正', 'ようやった。これで明日も戦える。木戸へ戻れ！', 3); } }),
    hold({ skip: (rt, m) => !m.sgDry, at: (rt) => outGate(rt, 6), dur: 55, r: 11, title: '渇きの夜', sub: '水の手を断たれ、喉が焼ける', label: '木戸の前',
      obj: (rt) => (HI(rt) ? '預かった手を木戸の前に並べ、夜討ちを受けよ' : '木戸の前で、夜討ちを受けよ'),
      waves: [{ t: 6, say: ['足軽', '夜討ちじゃ……！　喉がからからで、声も出ぬ'], foes: (rt) => { const o = outGate(rt, 6); return [{ name: '夜討ちの浅井勢', from: { x: o.x - 30, z: o.z - 30 }, flag: 'azai', list: dress([uS(2), uA(12)], AZA), mass: 200 }]; } }],
      reward: '渇きの夜を耐えた' }),
    rest({ dur: 10, bark: '夜が白む。息を整えよ', say: [['足軽', '……夜が明ける。まだ生きておる'], ['各務元正', '寄せ手が、坂の下で揃うておる。……最後の総攻めじゃ']], fn: (rt) => rt.world.setTime('morning') }),
    hold({ at: (rt) => outGate(rt, 6), dur: 70, r: 11, title: '夜明けの総攻め', sub: '浅井・朝倉の旗が、坂の下を埋める', label: '木戸の前', obj: '夜明けの総攻めを、木戸の前で受け止めよ（後詰まで）',
      say: [['各務元正', '持ちこたえよ！　上様は、もうそこまで来ておられる！']],
      waves: [
        { t: 4, say: ['足軽', '坂の下が旗で埋まった……！'], foes: (rt, m) => { const o = outGate(rt, 6); return [{ name: '朝倉の総攻め', from: { x: o.x + 10, z: o.z - 46 }, list: [uS(3), uA((m.sgOut ? 12 : 16) + (m.sgDry ? 4 : 0))], mass: 320, noRout: 25 }, gunLine('朝倉の鉄砲衆', { x: o.x + 36, z: o.z - 36 }, o, 10)]; } },
        { t: 45, say: ['足軽', '浅井の新手が尾根から……！'], foes: (rt) => { const o = outGate(rt, 6); return [{ name: '浅井の新手', from: { x: o.x - 44, z: o.z - 20 }, flag: 'azai', list: dress([uS(2), uA(12)], AZA), mass: 220 }]; } },
      ],
      reward: '夜明けの総攻めを受け止めた' }),
  ];
}

// 両軍の総勢（宇佐山城の森可成の兵 千ほど、浅井・朝倉 三万ほど。数には諸説ある）
shiga.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 1000 - (F.ak || 0) * 8 - (F.step >= 3 ? 300 : 0)), a0: 1000, b: Math.max(0, 30000 - (F.ek || 0) * 20), b0: 30000 };
};
shiga.sides = { a: { name: '織田軍（宇佐山城）', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'asakura' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
shiga.famous = [];
shiga.date = () => '元亀元年九月二十日　秋・晴';
shiga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '可成の話を飛ばす' : '');
shiga.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
shiga.history = '元亀元年（1570）九月、信長が摂津の野田・福島で三好三人衆と対陣している間に、浅井長政・朝倉義景の三万ほどが琵琶湖の西を下って近江の坂本へ出てきた。宇佐山城を守っていた森可成は、信長の弟・織田信治とともに坂本で迎え撃ったが、九月二十日、二人とも討ち死にした。城は各務元正らが守り通した。信長が急いで摂津から戻ると、浅井・朝倉は比叡山に上がり、延暦寺がこれをかくまった。対陣は冬まで続き、十二月、将軍義昭らの仲立ちで和が結ばれた（志賀の陣）。翌年九月、信長は比叡山を攻める。森可成は、のちの森長可・森成利（蘭丸）の父である。兵の数には諸説ある。';

// 素直な遊び手：町口で朝倉と戦い、城へ退き、木戸に取り付く寄せ手を討つ
shiga.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  // 本丸へは道（木戸→二の丸→本丸の木戸）を通る。切岸は登れないので、間の口を順に踏む
  const inHon = F.C && F.C.kuruwa.hon.test(u.pos.x, u.pos.z);
  const inNi = !inHon && F.C && F.C.kuruwa.ni.test(u.pos.x, u.pos.z);
  const inSan = !inHon && !inNi && F.C && F.C.kuruwa.san.test(u.pos.x, u.pos.z);
  const inside = inHon ? { x: USA.x, z: USA.z } : inNi ? { x: GATE_HON.x - 4, z: GATE_HON.z } : inSan ? { x: GATE_NI.x, z: GATE_NI.z + 4 } : { x: GATE_OUT.x, z: GATE_OUT.z + 4 };
  if (b.botRest && F.step !== 2) { inp.guardHold = false; const r = F.step >= 3 ? inside : { x: TOWN.x + 4, z: TOWN.z + 16 }; goTo(p, inp, r.x, r.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 2 ? 2.5 : 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const out = { x: F.gateC.x + F.gateN.x * 5, z: F.gateC.z + F.gateN.z * 5 }, inG = { x: F.gateC.x - F.gateN.x * 5, z: F.gateC.z - F.gateN.z * 5 };
  if (F.step === 1) { const q = [F.w1, F.w1b].find((x) => x && !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 2) { goTo(p, inp, inG.x, inG.z, 1.5); return; }
  if (F.step === 3) {
    // 木戸の内で、破って入る寄せ手を討つ（木戸は閉めてある）
    const q = (F.waves || []).find((x) => !gone(x));
    const gk = F.gateMk.opened || F.gateMk.breached ? out : inG;
    if (q && gk === out) { const c = q.center(); if (Math.hypot(c.x - F.gateC.x, c.z - F.gateC.z) < 26) { goTo(p, inp, c.x, c.z, 2); return; } }
    goTo(p, inp, gk.x, gk.z, 2);
    return;
  }
  const a = F.moriU.pos; goTo(p, inp, a.x + 3, a.z + 4, 3);
};

shiga.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
export { shiga };
