// ======================================================================
// 織田家編　野田・福島の戦い（元亀元年八月〜九月）
// 三好三人衆が摂津の野田・福島に砦を構え、信長はこれを囲んだ。織田方には紀伊の根来・雑賀の鉄砲衆も加わり、
// 昼も夜も鉄砲の撃ち合いが続いた。九月十二日の夜、石山本願寺が早鐘を撞いて蜂起し、織田の陣を襲った。
// 足軽は前田利家の手。①竹束を据えて鉄砲で支える ②浅瀬・中洲を渡り、野田・福島へ総攻め
// ③本願寺の早鐘。後ろと横から一揆勢が寄せ、堤へ戻って退き口を保つ
// ④浅井・朝倉が京へ迫る知らせ。囲みを解き、本陣の退き口へ退く（数日にわたる戦を続く段にまとめる）
// 向き：北（-z）の川の向こうに野田砦。南（+z）に織田の陣。南東の遠くに石山本願寺
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, tawara, campfire, carryTorches, dou } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { battleEvent, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { applyLook, NIGHT, DAWN, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, fight, depthBot } from './b_depth.js';
import { volleyScene } from './b_shiga.js';
import { uS, uA, gunLine, lines, leanAll, camp } from './b_mid.js';
// 束5（docs/quality-upgrade-plan.md）：河川砦の縄張り二つ・堤の土塁・竹束・三好と一揆の部隊・夜の寄せの頭・持ち場の区域
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { doruiLine, doruiHeight, horiboriHeight, sakamogiRow } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, zoneWord, ZONE_STATE } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeAttackAI } from './siege_ai.js';
import { fordWatch } from './toride.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { tabaGeo, tabaMat, addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { NODA_PLAN, FUKU_PLAN, NODA_GATE, FUKU_GATE, FORT_Z, LEVEE_Z, LEVEE_DORUI, LEVEE_TABA, LEVEE_ZONE, ODA_HONJIN, IKKO_ROUTES, RANKUI_LINES, SAKAMOGI_LINES } from './castles/nodafukushima.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-220, -24], [-110, -32], [0, -30], [110, -24], [220, -30]];
const PILE = { x: 2, z: 10 };               // 竹束の置き場
const SPOTS = [{ x: -14, z: -13 }, { x: 0, z: -14 }, { x: 14, z: -13 }];   // 竹束を据える所（堤の川側の肩）
const HONGAN = { x: 170, z: 170 };          // 石山本願寺（遠く）
const ODA = { flag: 'oda' };
const MIYOSHI = { flag: 'miyoshi' };
// 一揆の門徒：具足は軽く、鉢巻に、南無阿弥陀仏の旗
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
function cappedList(rt, list) {
  let room = 225; // 新手を出す時だけ数え、味方の追いつく分を空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.farSim && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
const enemyGroup = (rt, o, list) => spawnEnemy(rt, o, cappedList(rt, list));

// 共通の絵を使い、どの戦から始めても旗と指物に紋が出る
function sagarifujiTex() { return flagTexture('sagarifuji'); }
function namuTex() { return flagTexture('namu'); }

function baseHeight(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 堤（川の南岸を東西に）。真ん中の持ち場は少し高く、背を平らに
  const lv = Math.exp(-((z - LEVEE_Z) ** 2) / 26) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 120) / 30);
  h += 2.6 * lv;
  // 砦の島は少し高い
  h += 1.2 * Math.max(0, Math.min(1, (-(z + 36)) / 8)) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 70) / 20);
  // 遠くの上町台地（本願寺）
  h += 12 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  return h;
}
// 砦の水堀の窪み・堤の土塁の盛りを混ぜてから、二つの砦の曲輪を平らに（castle_plan の heightOf を重ねる）
const HORI_FNS = [...NODA_PLAN.hori, ...FUKU_PLAN.hori].map((q) => horiboriHeight(q.pts, { depth: q.deep ?? 2, width: q.w ?? 6 }));
const DORUI_H = doruiHeight(LEVEE_DORUI, { w: 3, h: 0.7 });
function withHori(x, z) { let h = baseHeight(x, z) + DORUI_H(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) { const noda = heightOf(NODA_PLAN, withHori, 3); HEIGHT_FN = heightOf(FUKU_PLAN, noda, 3); }
  return HEIGHT_FN(x, z);
}
// 部隊（butai.js）の本物の兵を、決めた数より増やさない（味方は遠くで戦う軽い作りのまま。ごちゃごちゃさせない）
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
// 軽い部隊の今の真ん中（本物が居なければ、軽い大軍の動いた先）
function bPos(b) {
  if (b.real && b.real.count) return b.pos;
  if (b.light && b.light.army) { const A = b.light.army, p = b._mapPos; p.x = A.cx + (A.off ? A.off.x : 0); p.z = A.cz + (A.off ? A.off.z : 0); return p; }
  return b.pos;
}
const bDead = (b) => !b || b.aliveNominal() <= 0;
function bDist(a, b) { const p = bPos(a), q = bPos(b); return Math.hypot(p.x - q.x, p.z - q.z); }

// 竹束：青竹を束ねて縄でくくった盾（taketaba.js の形と材質を使い回す。毎回 new しない）
// rot は今までどおり「前を向ける向き」（Math.PI＝北の砦の側）
function takeTaba(W, x, z, rot = 0) {
  const m = new THREE.Mesh(tabaGeo(), tabaMat());
  m.castShadow = true;
  m.rotation.set(0, rot + Math.PI, 0);
  m.position.set(x, W.heightAt(x, z), z);
  return m;
}

// 水際の乱杭：先を尖らせた杭を水の縁に不揃いに並べる（見た目のみ。柵・逆茂木は castle_parts 側の当たりで足りる）
let RANKUI_GEO = null, RANKUI_MAT = null;
function rankui(W, x, z, rot) {
  if (!RANKUI_GEO) { RANKUI_GEO = new THREE.ConeGeometry(0.06, 1, 5); RANKUI_MAT = new THREE.MeshStandardMaterial({ color: 0x4e3c28, roughness: 0.95 }); }
  const m = new THREE.Mesh(RANKUI_GEO, RANKUI_MAT);
  m.rotation.set(0.45, rot, 0);
  m.position.set(x, W.heightAt(x, z) - 0.25, z);
  m.castShadow = true;
  return m;
}
function rankuiLine(rt, pts, spacing = 1.5) {
  const [[ax, az], [bx, bz]] = pts;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / spacing));
  const ang = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = ((i * 7919) % 101) / 101 - 0.5;
    const x = ax + (bx - ax) * t + r * 0.5, z = az + (bz - az) * t + r * 0.5;
    rt.scene.add(rankui(rt.world, x, z, ang + Math.PI / 2 + r * 0.4));
  }
}

const nodafukushima = {
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  taisho: { b: { def: true } }, // 砦の大将の討ち取りで、早鐘や撤退を飛ばさない。
  spawn: { x: 6, z: 16, heading: Math.PI },
  world: {
    seed: 1570,
    wind: [-0.9, -0.3],   // 海からの風（西へ）
    time: 'after',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.55,
    waterSlow: true,   // 川・水路・水田が本当に足を遅くする（terrain_tags.js の 'water'。歩兵は遅く、騎馬はもっと遅い）
    paths: [[[0, 160], [0, 40], [0, 12], [0, LEVEE_Z]], NODA_PLAN.paths[0].pts, FUKU_PLAN.paths[0].pts],
    height,
    tint(x, z, h, c) {
      // 川べりの葦と泥
      if (z < -16 && z > -42) c.lerp({ r: 0.42, g: 0.44, b: 0.32 }, 0.4);
    },
    clear: (x, z) => (z > -60 && z < 60 && Math.abs(x) < 90) || Math.hypot(x, z - 56) < 22 || (Math.abs(x) < 26 && z > -100 && z < -58) || (x > -142 && x < -102 && z > -106 && z < -48),
    streams: [{ pts: RIVER, w: 12, depth: 0.9 }],
    // 摂津の低い田（淀川の河口の島々）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 36) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260,
    tufts: 5200,
    treeDensity: (x, z) => (z > -70 && z < 70 ? 0.1 : 0.6),
    groves: [{ x: 90, z: 40, r: 14, n: 18 }, { x: -90, z: 50, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z < -90 || x > 150 || z > 150),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.placed = 0; F.carry = false;
    sagarifujiTex(); namuTex();
    resetGates(); flReset();
    // ---- 野田砦・福島砦：河川砦の縄張り二つ（castles/nodafukushima.js。岸の広場の土塀・門・櫓・水堀） ----
    F.noda = buildCastlePlan(rt, NODA_PLAN, { baseHeight: withHori, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    F.fuku = buildCastlePlan(rt, FUKU_PLAN, { baseHeight: withHori, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    F.nodaGate = makeGate(rt, F.noda.gateObjs.mon, { name: NODA_GATE.name, guardTeam: 1 });
    F.fukuGate = makeGate(rt, F.fuku.gateObjs.mon, { name: FUKU_GATE.name, guardTeam: 1 });
    // 束34：土橋（野田砦・福島砦の水堀の渡り口）を、一揆勢の物見に足す（知らせだけ。縄張り・勝ち方は変えない）
    F.fordWatch = fordWatch(rt, { fords: [[0, -42], [-122, -54]], team: 1, range: 26 });
    // 総攻めは門前まで。史実どおり落城前に囲みを解くため、塀・門は壊させない
    // 門も同じ（追いかけた味方が門を破って砦の奥の三好の本陣まで雪崩れ込み、夜の筋の前に戦が終わらないように）
    for (const s of [...F.noda.walls, ...F.fuku.walls, F.nodaGate.struct, F.fukuGate.struct]) if (s && s.seg) { s.noTarget = true; s.wall = true; s.hp = s.maxHp = 1e9; }
    // ---- 野田砦の左右の柵（岸の広場の土塀から、川べりを東西へ） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fortWall = noT(wallLine(rt, [[-64, FORT_Z + 2], [-30, FORT_Z], [-20.5, FORT_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.fortWall.push(...noT(wallLine(rt, [[20.5, FORT_Z], [30, FORT_Z], [64, FORT_Z + 2]], { team: 1, hp: 1e9, name: '柵', segLen: 5 })));
    for (const [x, z, r] of [[-30, -60, 0.1], [8, -62, -0.2], [36, -58, 0.3], [-9, -64, 0]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x6a5238 }));
    for (const [x, z] of [[-40, FORT_Z - 3], [-12, FORT_Z - 3], [12, FORT_Z - 3], [40, FORT_Z - 3], [0, -70]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 福島の砦（西の島。遠く）
    for (const [x, z, r] of [[-129, -70, 0.2], [-116, -74, -0.1]]) rt.scene.add(hut(W, x, z, 6, 4.5, r, { wall: 0x6a5238 }));
    for (const [x, z] of [[-128, -60], [-112, -60], [-122, -92]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // ---- 水際の乱杭・陸路の逆茂木（野田・福島とも、柵の切れ目でない所から回り込めないように） ----
    for (const pts of RANKUI_LINES) rankuiLine(rt, pts);
    for (const pts of SAKAMOGI_LINES) sakamogiRow(rt, pts, { team: 1, hp: 140, spacing: 5 });
    // ---- 堤の土塁（鉄砲衆の胸壁） ----
    F.dorui = doruiLine(rt, LEVEE_DORUI, { w: 3, h: 0.7, name: '堤の土塁' });
    // ---- 石山本願寺（遠く、南東の台地の上） ----
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 15, 9, 0.6 + Math.PI, { h: 4.2 }));   // 本願寺の御影堂（瓦の大屋根。正面は織田の陣の側）
    for (const [x, z, w, d] of [[HONGAN.x - 22, HONGAN.z + 10, 10, 7], [HONGAN.x + 14, HONGAN.z - 16, 10, 7]]) rt.scene.add(hut(W, x, z, w, d, 0.6, { h: 3.6, wall: 0x7a5a3c, roof: 0x3a3430 }));
    for (const [x, z] of [[HONGAN.x - 20, HONGAN.z - 12], [HONGAN.x - 6, HONGAN.z - 20], [HONGAN.x + 8, HONGAN.z - 26]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    // ---- 織田勢：前田利家の手（自分の持ち場）、佐々成政の手、鉄砲衆 ----
    F.maeda = allyGroup(rt, { name: '前田利家の手', anchor: { x: 0, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], ODA));
    F.maedaU = F.maeda.units[0];
    F.sassa = allyGroup(rt, { name: '佐々成政の手', anchor: { x: -30, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }], ODA));
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 26, z: LEVEE_Z + 2 }, facing: Math.PI, width: 12, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.maeda, F.sassa, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 8, z: LEVEE_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦の鉄砲 ----
    F.fortGun = enemyGroup(rt, { faction: 'saito', name: '砦の鉄砲', anchor: { x: 0, z: FORT_Z - 2.5 }, facing: 0, width: 30, aggro: 50, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }, { type: 'bow', n: 3 }], MIYOSHI));
    for (const u of F.fortGun.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 陣と旗・竹束の置き場 ----
    // 堤の後ろの織田の本陣：信長と旗本（信長で遊ぶ時は旗本だけ）。控えは軽い兵で後ろに
    F.campA = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 300, runTo: { x: 0, z: LEVEE_Z + 10 } });
    rt.scene.add(tawara(W, -14, 30, 0.4, 6));
    for (const [x, z, k] of [[-6, 34, 'oda'], [6, 34, 'eiraku'], [-40, 0, 'oda'], [40, 0, 'oda'], [-4, LEVEE_Z + 4, 'oda'], [30, LEVEE_Z + 5, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (let i = 0; i < 4; i++) rt.scene.add(takeTaba(W, PILE.x - 2 + (i % 2) * 2.2, PILE.z + Math.floor(i / 2) * 1.6, 0.1));
    // 堤の上に、はじめから据えてある竹束（鉄砲衆の前）。陰の者には砦からの矢玉がほとんど当たらない
    patchGunCover(rt);
    for (const [x, z] of LEVEE_TABA) this.cover(rt, x, z);
    // ---- 大軍（軽い作り）：天満の信長の本陣の後ろの控え ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(40, 90, 36, 14, 240, Math.PI, 0x2b3140, flagTexture('oda'), 15703);
    // 堤の手前に構える織田の手（見た目だけ。起こさない）：竹束を据える所の左右に、川を挟んで砦と睨み合う大軍
    for (const [x, z, s, k] of [[-24, -2, 15704, 'oda'], [30, -1, 15705, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 100, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const [x, z] of [[-20, 60], [24, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 部隊（butai.js）：囲む織田の手・野田と福島の三好勢。本物はほんの少し（遠くで戦う軽い作り。携帯の重さのため名目も小さめ） ----
    const mk = (o, real) => capReal(makeButai(rt, { real, ...o }), real);
    F.bOdaW = mk({ name: '柴田勝家の手', general: '柴田勝家', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 500, armor: 0x2b3140, flag: 'oda', at: { x: -82, z: 10 }, facing: Math.PI }, 0);
    F.bOdaE = mk({ name: '根来・雑賀の鉄砲衆', team: 0, faction: 'oda', kind: 'gun', nominal: 400, armor: 0x2b3140, flag: 'eiraku', at: { x: 84, z: 6 }, facing: Math.PI }, 0);
    F.bOdaS = mk({ name: '佐久間信盛の手', general: '佐久間信盛', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 450, armor: 0x2b3140, flag: 'oda', at: { x: 56, z: 34 }, facing: Math.PI * 0.75 }, 0);
    F.bNoda = mk({ name: '野田砦の三好勢（三好長逸）', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 500, armor: 0x35382c, flag: 'miyoshi', at: { x: 30, z: -104 }, facing: 0 }, 0);
    F.bFuku = mk({ name: '福島砦の三好勢（三好宗渭）', general: '三好宗渭', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 400, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -68 }, facing: 0.15 }, 0);
    F.bFukuGun = mk({ name: '福島砦の鉄砲', team: 1, faction: 'saito', kind: 'gun', nominal: 120, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -61 }, facing: 0 }, 0);
    F.bSally = mk({ name: '浅瀬を渡る三好の本隊（岩成友通）', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 450, armor: 0x33302a, flag: 'miyoshi', at: { x: -82, z: -62 }, facing: 0 }, 0);
    for (const b of [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally]) b.order({ id: 'hold' });
    F.bAll = [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally];
    F.lightOda = [F.bOdaE, F.bOdaS];
    // 野田砦の奥（本陣の曲輪）の三好の本陣：三好長逸と旗本（控えは軽い兵）。旗本は整った陣形で待つ
    F.campB = camp(rt, { x: 0, z: -84, facing: 0, team: 1, faction: 'saito', mon: 'miyoshi', armor: 0x35382c, general: { name: '三好長逸', hat: 'kabuto_m', haori: 0x3a3a2a }, guard: 15, reserve: 240, runTo: { x: 10, z: FORT_Z - 6 } });
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'line'; }
    // ---- 持ち場の区域（siege_zones.js）：堤の上・織田の本陣（味方）、野田砦・福島砦（三好） ----
    const LZ = LEVEE_ZONE;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'levee', name: '堤の持ち場', start: ZONE_STATE.FRIEND, test: (x, z) => x > LZ.x0 && x < LZ.x1 && z > LZ.z0 && z < LZ.z1, pos: { x: 0, z: LEVEE_Z }, need: 8, hold: 14 },
        { id: 'honjin', name: '織田の本陣', start: ZONE_STATE.FRIEND, test: (x, z) => Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < ODA_HONJIN.r, pos: ODA_HONJIN, need: 8, hold: 16 },
        // kaito 10/1：野田・福島の hold を 20→14 に詰めた（遊んで10分ほどかかる戦を4〜7分に）
        { id: 'noda', name: '野田砦', test: F.noda.kuruwa.kishi.test, pos: F.noda.kuruwa.kishi.centroid, need: 10, hold: 14 },
        { id: 'fuku', name: '福島砦', test: F.fuku.kuruwa.kishi.test, pos: F.fuku.kuruwa.kishi.centroid, need: 10, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => this.onZone(rt, id),
    });

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '前田利家と並んで堤の一手を預かる。下知を待て' : '前田利家のもとで、下知を待て', 'main');
    rt.say('前田利家', `${nm(rt)}、川の向こうが三好の野田砦じゃ。砦からも鉄砲を撃ってくる。頭を上げるなよ`, 5);
    rt.banner('水路の向こうの二つの砦', '竹束と鉄砲の列を前に、野田・福島へ総攻め');
    rt.say('前田利家', 'ここ海老江から水路を渡り、二つの砦へ詰め寄せる。殿は落とすおつもりじゃ', 4.5);
    rt.say('前田利家', '堤の上に竹束を並べ、鉄砲衆の盾にする。竹束を運べ。弾はよけられぬが、竹はよける', 4.5);
    // 印の前田に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('maeda', unitPos(F.maedaU), '前田利家（話を聞く）', {});
    rt.addInteract('talk', { x: 0, z: LEVEE_Z + 6 }, '前田利家の話を聞く', () => { rt.uninteract('talk'); rt.say('前田利家', 'よし、置き場の竹束を担げ', 2); rt.after(2, () => this.carryStart(rt)); }, { r: 5 });
    rt.after(15, () => this.carryStart(rt));
    // 砦との撃ち合いの音（遠くで絶えず）
    F.shotT = 3;
  },

  // 竹束（弾よけ）の当たり
  cover(rt, x, z) {
    // 見た目と「陰の者に前からの矢玉がほとんど当たらない」は taketaba.js の竹束（据え置き）。当たりはここで足す
    addTaba(rt, x, z, 0, { fixed: true, rot: Math.PI });
    const s = rt.army.addStruct({ seg: [x - 0.9, z, x + 0.9, z], nx: 0, nz: -1, hp: 1e9, maxHp: 1e9, team: 0, name: '竹束' });
    s.noTarget = true;
    return s;
  },

  // ① 竹束を運ぶ
  carryStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('carry');
    rt.unmark('maeda'); rt.uninteract('talk');
    F.spots = SPOTS.map((q) => ({ ...q }));
    rt.obj('main', HI(rt) ? `預かった手の先に立ち、竹束を堤の上へ据えさせよ（${SPOTS.length}つ）` : `竹束を堤の上へ運んで据えよ（${SPOTS.length}つ）`, 'main');
    this.nextPick(rt);
    // 竹束をどこに据えるか（選ばなければ鉄砲衆の前）
    rt.after(2, () => rt.choose('前田「竹束をどこに並べる？」', [
      { label: '堤の真ん中（鉄砲衆の前）', note: '鉄砲衆が撃ち返しやすい' },
      { label: '西寄り（佐々の手の前）', note: '浅瀬の渡り口に近い。打って出る敵を受けやすい' },
    ], (i) => {
      if (i === 1) {
        for (const q of F.spots) q.x -= 16;
        rt.say('前田利家', 'よかろう、浅瀬の口を塞ぐのじゃな。西寄りに並べよ', 3);
        if (F.carry) { const q = F.spots[F.placed]; rt.uninteract('spot'); rt.unzone('spot'); rt.marker('spot', q, '竹束を据える', { h: 2 }); rt.zone('spot', q.x, q.z, 2); rt.addInteract('spot', q, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2 }); }
      } else rt.say('前田利家', 'よし、鉄砲衆の前じゃ', 2.5);
    }, 15));
  },
  // 担いだ竹束を背に見せる
  backTaba(rt, on) {
    const F = rt.flags;
    if (on && !F.backMesh) {
      const m = takeTaba(rt.world, 0, 0, 0);
      m.position.set(0, 0.2, -0.35); m.rotation.set(0.25, 0, 0); m.scale.setScalar(0.62);
      rt.player.u.mesh.add(m);
      F.backMesh = m;
    } else if (!on && F.backMesh) { rt.player.u.mesh.remove(F.backMesh); F.backMesh = null; }
  },
  nextPick(rt) {
    const F = rt.flags;
    rt.marker('pile', PILE, '竹束の置き場', { h: 2 });
    rt.addInteract('pile', PILE, '竹束を担ぐ', () => {
      F.carry = true;
      this.backTaba(rt, true);
      F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
      rt.uninteract('pile'); rt.unmark('pile');
      const s = F.spots[F.placed];
      rt.marker('spot', s, '竹束を据える', { h: 2 });
      rt.zone('spot', s.x, s.z, 2);
      rt.addInteract('spot', s, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2 });
      rt.bark('竹束を担いだ（重くて速くは歩けない）。堤の上の印まで運べ');
    }, { r: 3, hold: 0.8 });
  },
  place(rt) {
    const F = rt.flags;
    const s = F.spots[F.placed];
    rt.uninteract('spot'); rt.unmark('spot'); rt.unzone('spot');
    this.cover(rt, s.x, s.z);
    F.carry = false;
    this.backTaba(rt, false);
    F.placed++;
    rt.award((t) => { t.special = { label: '竹束を据えた', pts: 4 * F.placed }; }, '竹束を据えた');
    if (F.placed >= SPOTS.length) this.sallyStart(rt);
    else if (F.placed === 1 && rt.squad.filter((u) => u.alive).length >= 2) {
      // 組のある身分なら、残りは組の者が一束ずつ担いで運ぶ（自分は一往復で済む）
      rt.say('前田利家', '手本は見せた。残りは組の者に担がせよ', 3);
      const sg = rt.squadGroups.find((g) => g.count);
      if (sg) { sg.order = 'move'; sg.dest = { x: F.spots[1].x, z: F.spots[1].z + 3 }; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; }; }
      rt.objProgress('main', `${F.placed}／${SPOTS.length}・組の者が運んでいる`);
      for (let k = F.placed; k < SPOTS.length; k++) rt.after(7 + (k - 1) * 5, () => {
        if (F.step !== 1) return;
        const q = F.spots[k];
        this.cover(rt, q.x, q.z);
        F.placed = Math.max(F.placed, k + 1);
        rt.army.play('knock', q, 0.8);
        if (F.placed >= SPOTS.length) { rt.award((t) => t.side.push('組で竹束を並べた'), '組で竹束を並べた'); if (sg) sg.order = 'follow'; this.sallyStart(rt); }
      });
    } else if (F.placed === SPOTS.length - 1) {
      // 最後の一束は前田の手の者が担いで来る（同じ往復を三度させない）
      rt.say('前田利家', 'ようやった。最後の一束はわしの手の者に運ばせる。堤の上で待て', 3);
      rt.objProgress('main', `${F.placed}／${SPOTS.length}・前田の手の者が運んでいる`);
      rt.after(6, () => {
        if (F.step !== 1) return;
        const q = F.spots[SPOTS.length - 1];
        this.cover(rt, q.x, q.z);
        F.placed = SPOTS.length;
        rt.army.play('knock', q, 0.8);
        this.sallyStart(rt);
      });
    } else { rt.objProgress('main', `${F.placed}／${SPOTS.length}`); this.nextPick(rt); }
  },

  // ② 織田の総攻め。浅瀬を渡り、打って出た三好勢を押し戻す
  sallyStart(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('assault');
    F.carry = false; this.backTaba(rt, false);
    for (const id of ['pile', 'spot']) { rt.uninteract(id); rt.unmark(id); }
    rt.unzone('spot');
    rt.obj('main', '浅瀬を渡り、野田・福島の砦へ攻め寄せよ', 'main');
    rt.marker('assault', { x: 0, z: -37 }, '浅瀬の先・野田砦へ', { h: 2 });
    rt.say('前田利家', '竹束は並んだ！　鉄砲は撃ち返せ、槍は浅瀬を渡れ！', 3.5);
    F.teppo.order = 'move'; F.teppo.dest = { x: 0, z: LEVEE_Z - 1 }; F.teppo.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: LEVEE_Z - 1 }; };
    rt.after(7, () => {
      if (F.step !== 2) return;
      // 砦の門の前（土橋の外）から、竹束を押し立てて浅瀬をゆっくり渡り、渡りきったら堤へ掛かる（束5：攻め手は竹束で寄せる）
      F.sally = enemyGroup(rt, { faction: 'saito', name: '打って出た三好勢', anchor: { x: -4, z: -37 }, facing: 0, order: 'hold', seekRange: 70, aggro: 9, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6, formation: 'yari' },
        dress([{ type: 'busho', n: 1, o: { name: '岩成友通' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], MIYOSHI));
      F.sally.order = 'move'; F.sally.dest = { x: -2, z: LEVEE_Z - 13 }; F.sally.speed = 1.3;
      const charge = (g) => { if (g.order === 'attack') return; g.order = 'attack'; g.seekRange = 70; g.aggro = 14; rt.say('岩成友通', '竹束を捨てよ！　堤へ掛かれ！', 2.5); };
      F.sally.onArrive = charge;
      rt.after(30, () => { if (F.sally && !gone(F.sally)) charge(F.sally); });
      for (const off of [-4, 0, 4]) addTaba(rt, -4 + off, -34, 1, { van: F.sally, off, faceSign: 1, vanDist: 3, rot: 0 });
      // 西では、福島から渡った三好の本隊と柴田の手が、堤の西の端の向こうで押し合う（軽い作り）
      F.bSally.order({ id: 'move', to: { x: -82, z: -26 } });
      F.bOdaW.order({ id: 'move', to: { x: -122, z: -40 } });
      F.bOdaE.order({ id: 'move', to: { x: 36, z: -34 } });
      F.clashW = true;
      KIT.backOf(rt, F.sally, { flag: 'miyoshi', armor: 0x33302a, kind: 'spear', w: 22, depth: 12, count: 240, seed: 15707 });
      // 左右でも、浅瀬を渡る織田の大軍が二つの砦へ押し寄せる（軽い作り）
      F.lines = lines(rt, [
        { x: -58, z: -32, facing: Math.PI, w: 40, seed: 15708, A: ['oda', 0x2b3140, 420, 'oda'], B: ['miyoshi', 0x33302a, 520, 'saito'], gunsA: true, gunsB: true, surge: { every: 50, count: 140, flank: 0.3 } },
        { x: 60, z: -32, facing: Math.PI, w: 40, seed: 15709, A: ['oda', 0x2b3140, 420, 'oda'], B: ['miyoshi', 0x33302a, 500, 'saito'], gunsB: true, surge: { every: 55, count: 130, flank: 0.3 } },
      ]);
      F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
      sfx('horagai', 0.6);
      rt.army.play('eshout', { x: 0, z: -40 }, 1.6);
      rt.banner('野田・福島へ総攻め', '鉄砲の援護で浅瀬を渡る。砦から三好勢が打って出た');
      rt.obj('main', '浅瀬の三好勢を押し戻し、砦へ攻め寄せよ', 'main');
      rt.say('前田利家', '三好が出た！　槍を揃え、浅瀬の向こうへ押し返せ！', 3.5);
      rt.after(5, () => rt.say('前田利家', '水路も湿地も足を取る。印の浅瀬を渡れ、深みに入るな', 3.5));
      // 一斉射：鉄砲衆は竹束の陰で込めたまま待ち、三好勢が浅瀬を上りきる所で揃えて放つ
      volleyScene(rt, { guns: () => [F.teppo], at: { x: 0, z: LEVEE_Z - 6 }, r: 12, who: '前田利家', shots: 3, wait: 'まだ撃つな……浅瀬を上りきるまで待て',
        banner: ['一斉射', '竹束の陰から、鉄砲衆が揃えて放つ'], clash: () => F.lines });
      rt.zone('levee', 0, LEVEE_Z - 2, 22);
      rt.marker('sally', centerOf(F.sally), () => `打って出た三好勢・${moraleWord(F.sally.morale)}`, { red: true, group: F.sally });
      for (const [g, x] of [[F.maeda, 0], [F.sassa, -10]]) {
        g.order = 'move'; g.dest = { x, z: -37 }; g.aggro = 14;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; };
      }
    });
  },

  // ②の後の段（昼）：中洲を押さえて砦へ迫る → ③へ
  midA(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('sally'); rt.unmark('assault'); rt.unzone('levee');
    if (F.sally && !gone(F.sally)) { F.sally.noRout = false; F.sally.morale = Math.min(F.sally.morale, 15); }
    if (!late) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    F.sallyDone = true;
    rt.obj('main', '組を集め、浅瀬から砦へ寄せる下知を待て', 'main');
    depthStart(rt, ndCtx(rt), ndA(), () => this.night(rt, true));
  },
  // 退き口を保ったら、敵を追わず囲みを解く
  midB(rt) {
    if (rt.flags.step !== 3) return;
    rt.flags.step = 3.5;
    this.win(rt);
  },

  // ③ 夜、本願寺の早鐘
  night(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('night');
    rt.unmark('sally'); rt.unmark('assault');
    rt.objRemove('dp');
    rt.obj('main', '砦攻めを止め、堤へ戻れ。後ろと横の一揆勢を防げ', 'main');
    rt.marker('leveeHold', { x: 6, z: LEVEE_Z + 3 }, '堤の持ち場', { h: 2 });
    rt.unzone('levee');
    if (!late && !F.sallyDone) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    // 本願寺の側（南東）から寄せる一揆の大群と、堤の東の端の味方が押し合う（軽い作り）
    rt.after(14, () => {
      if (F.ending) return;
      F.lines2 = lines(rt, [{ x: 62, z: 30, facing: Math.PI * 0.25, w: 44, seed: 15710, A: ['oda', 0x2b3140, 380, 'oda'], B: ['namu', IKKO.armor, 640, 'saito'], gunsB: true, surge: { every: 45, count: 160, flank: 0.35 } }]);
      F.lines2.forEach((c) => c.go());
      leanAll(F.lines2, 'B', 0.3);
    });
    // 墨の帯で「その夜」。空を暗くしてから、早鐘
    rt.banner('攻めの背後で早鐘', '砦へ詰め寄せた織田の背に、本願寺が動く');
    applyLook(rt, MID);
    rt.after(3, () => { applyLook(rt, NIGHT); rt.banner('本願寺の早鐘', '夜更け、石山から鐘が鳴り、一揆勢が打って出た'); });
    for (let k = 0; k < 8; k++) rt.after(3 + k * 0.9, () => sfx('kane', 0.9 - k * 0.07));
    // 本願寺の台地から、松明を持った門徒の列が下りてくる（遠景）
    F.monto = rt.world.addDistantArmy({ x: HONGAN.x - 26, z: HONGAN.z - 30, w: 30, d: 10, count: 160, facing: -Math.PI * 0.75, armor: IKKO.armor, flagTex: namuTex(), seed: 15706 });
    rt.after(6, () => { if (F.monto.advance) F.monto.advance(50, 70); });
    for (let k = 0; k < 7; k++) rt.after(5 + k * 2, () => { const t = k / 6; rt.world.addFire(HONGAN.x - 40 - t * 50, HONGAN.z - 44 - t * 50, { torch: true, h: 1.5 }); });
    rt.after(4, () => {
      rt.say('足軽', '……あの鐘は、本願寺か？　後ろの方から火が来る！', 3.5);
      rt.say('前田利家', '本願寺が起った！　堤を背に受けよ。囲まれるな！', 4.5);
      rt.obj('main', '砦攻めを止め、堤へ戻れ。後ろと横の一揆勢を防げ', 'main');
    });
    rt.after(36, () => {
      if (F.step !== 3 || F.ending) return;
      F.kyotoNews = true;
      battleEvent(rt, EVENT_MESSENGER, { x: 6, z: LEVEE_Z + 3 }, null, 0, true, '浅井・朝倉が京へ迫る知らせ');
      rt.say('伝令', '浅井・朝倉が坂本から逢坂を越え、山科まで進出！　京へ迫っております！', 4.5);
      rt.obj('main', '囲まれる前に退け。堤で寄せを防ぎ、退きの下知を待て', 'main');
      rt.after(6, () => rt.say('前田利家', '砦へは戻るな！　後ろの畦道を空け、退き口を保て！', 3.5));
    });
    // 本願寺の方に篝火
    for (const [x, z] of [[120, 120], [100, 96], [134, 90]]) rt.world.addFire(x, z, { torch: true, h: 1.4 });
    // 夜番の何人かが松明を持つ（組の者と前田の手の足軽）
    rt.after(4, () => { F.torches = carryTorches(rt.world, [...rt.squad.filter((u) => u.alive).slice(0, 2), ...F.maeda.units.filter((u) => u.type === 'ashigaru').slice(0, 3)]); });
    // 味方は堤の上で南東を向く
    for (const [g, x] of [[F.maeda, 6], [F.sassa, -16], [F.teppo, 22]]) { g.onArrive = null; g.order = 'hold'; g.anchor = { x, z: LEVEE_Z + 3 }; g.facing = Math.PI * 0.2; g.aggro = 14; }
    F.waves = [];
    F.nightHeld = 0;
    // 本願寺の門徒の大群（butai.js・軽い作り）。寄せる道は攻めの頭（siege_ai.js の makeAttackAI）が、
    // 守りの厚さ・道の長さ・口の狭さに揺らぎを掛けて選ぶ（毎回同じ道で来ない）。本物の斬り合いは下の波（名のある組）
    if (F.bSally && !bDead(F.bSally)) F.bSally.order({ id: 'retreat' });
    F.clashW = false;
    const face = Math.atan2(46 - 130, 4 - 120);
    const mkI = (name, x, z, kind, n, gen) => capReal(makeButai(rt, { name, general: gen, team: 1, faction: 'saito', kind, nominal: n, real: 0, armor: IKKO.armor, flag: 'namu', at: { x, z }, facing: face }), 0);
    F.bIkko = [mkI('本願寺の門徒（下間頼廉）', 128, 118, 'ashigaru', 380, '下間頼廉'), mkI('門徒の新手', 118, 132, 'ashigaru', 320), mkI('鉄砲を持った門徒', 140, 110, 'gun', 200)];
    F.AA = makeAttackAI(rt, { attackers: F.bIkko, routes: IKKO_ROUTES, feintChance: 0.6, feintShare: 0.34 });
    // 後ろ・東・西から順に寄せる。前の波が崩れれば次の波を早める
    rt.after(12, () => this.wave(rt, 0));
    rt.after(30, () => this.wave(rt, 1));
    rt.after(50, () => this.wave(rt, 2));
  },
  wave(rt, i) {
    const F = rt.flags;
    if (F.ending || F.step !== 3 || F.waves[i]) return;
    // 一の波は本陣の後ろ、二の波は堤の東、三の波は西の湿地から
    const [x, z] = [[18, 70], [68, 4], [-62, 24]][i];
    const g = enemyGroup(rt, { faction: 'saito', name: ['一揆勢', '一揆勢の新手', '鉄砲を持った門徒'][i], anchor: { x, z }, facing: Math.atan2(-x, LEVEE_Z - z), order: 'attack', seekRange: 120, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0.6, z: 0.8 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', flag: 'sagarifuji' } }, { type: 'ashigaru', n: [16, 14, 10][i] }, { type: 'gun', n: i === 2 ? 5 : 3, o: { flag: 'sagarifuji' } }], IKKO));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
    KIT.backOf(rt, g, { flag: 'namu', armor: IKKO.armor, kind: i === 2 ? 'gun' : 'spear', w: 22, depth: 12, count: 260, seed: 15711 + i });
    F.waves[i] = g;
    rt.army.play('eshout', { x, z }, 1.8);
    rt.say('一揆の門徒', ['南無阿弥陀仏、南無阿弥陀仏！', '南無阿弥陀仏！　仏敵の信長を討て！', '横から回れ！　退き口を塞げ！'][i], 3.5);
    g.ikko = true;
    rt.marker('w' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    // 一揆の松明
    for (let k = 0; k < 3; k++) rt.world.addFire(x - 6 + k * 6, z + 6, { torch: true, h: 1.5 });
  },

  // 京の危機の知らせを受け、目標は「城を落とせ」から「囲まれる前に退け」に変わり、織田の撤退で終わる
  win(rt) {
    const F = rt.flags;
    if (F.ending || F.retreating) return;
    F.retreating = true; F.retreatT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('leveeHold');
    battleEvent(rt, EVENT_RETREAT, { x: 0, z: 44 }, F.maeda, 0, true, '囲みを解き、本陣へ退く');
    for (const g of F.oda) {
      g.onArrive = null; g.order = 'move'; g.dest = { x: g === F.sassa ? -14 : 12, z: 44 };
    }
    for (const b of [F.bOdaW, F.bOdaE, F.bOdaS]) b.order({ id: 'retreat' });
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2');
    rt.world.setTime('morning');
    sfx('horagai', 0.8);
    rt.banner('囲みを解いて退け', '浅井・朝倉が京へ迫る。殿の備を残し、囲みを解く');
    rt.say('織田信長', '京へ入らせるな。野田・福島の囲みを解く。柴田と和田を殿に、兵を返せ！', 4.5);
    rt.obj('main', '囲まれる前に、堤から本陣へ退け（織田の撤退）', 'main');
    rt.marker('retreat', { x: 0, z: 44 }, '本陣（退き口）', { h: 3 });
    rt.zone('retreat', 0, 44, 10);
  },
  winEnd(rt) {
    const F = rt.flags;
    if (F.ending) return;
    rt.unmark('retreat'); rt.unzone('retreat');
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2');
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines2 || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.world.setTime('morning');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '囲まれる前に退いた', pts: 20 }; }, '任務達成・囲みを解いて退いた');
    sfx('horagai', 0.6);
    rt.banner('織田、野田・福島から撤退', '砦を落とす前に攻めを止め、京へ兵を返す');
    rt.say('前田利家', `${nm(rt)}、よう退いた。次は京へ向かう。まだ気を緩めるな`, 4.5);
    rt.after(6, () => rt.say('', '――織田は野田・福島から引き払い、京へ戻る。浅井・朝倉との志賀の陣へ続く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('retreat'); rt.unzone('retreat');
    rt.banner('退き口を断たれる', '本陣へ退けず、一揆勢に囲まれた');
    rt.say('前田利家', '本陣の印まで戻れぬうちに、退く道を塞がれた。敵を追わず、堤から本陣へ退くのじゃ！', 4);
    rt.player.u.invuln = true;
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    butaiTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.torches) F.torches.update();
    if (F.retreating && !F.ending) {
      const pp = rt.player.u.pos, d = Math.hypot(pp.x - 0, pp.z - 44);
      rt.objProgress('main', `本陣まで ${Math.max(0, Math.round(d))}メートル・退くまで ${Math.max(0, Math.ceil(90 - (rt.t - F.retreatT)))}秒`);
      if (d < 10) this.winEnd(rt);
      else if (rt.t - F.retreatT > 90) this.lose(rt);
      else if (rt.t - F.retreatT > 35 && !F.retreatCall) { F.retreatCall = true; rt.say('前田利家', '戦い続けるな！　本陣の印へ退け！', 3); }
      return;
    }
    if (F.ending) return;
    updateGates();
    tickTabas(rt, dt);
    if (F.fordWatch) F.fordWatch.tick();
    if (F.SZ) F.SZ.tick(dt);
    if (F.AA && F.step === 3) F.AA.tick(dt);
    this.tickLight(rt, dt);
    // 砦との撃ち合い（遠くの鉄砲の音と煙）
    // 夜も遠くの撃ち合いは弱く続く（昼も夜も絶えなかったと伝わる）
    if ((F.shotT -= dt) <= 0) {
      const night = F.step >= 3;
      F.shotT = night ? 4 + Math.random() * 6 : 1.2 + Math.random() * 2.5;
      const x = -60 + Math.random() * 120;
      rt.army.play('gun', { x, z: FORT_Z - 1 }, night ? 0.3 : 0.5);
      rt.army.smoke(x, rt.world.heightAt(x, FORT_Z) + 1.4, FORT_Z - 1, 0, 1, 0.6);
    }
    // 竹束を担いでいる間は重くて速く歩けない（前の足どりの六割に）
    if (F.carry && F.carryPrev) {
      const u = rt.player.u;
      u.pos.x = F.carryPrev.x + (u.pos.x - F.carryPrev.x) * 0.6;
      u.pos.z = F.carryPrev.z + (u.pos.z - F.carryPrev.z) * 0.6;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    }
    if (F.carryPrev) { F.carryPrev.x = rt.player.u.pos.x; F.carryPrev.z = rt.player.u.pos.z; }
    if (F.step === 1) {
      rt.objProgress('main', `${F.placed}／${SPOTS.length}${F.carry ? '・担いでいる' : ''}`);
      // 運びに来ない時は、前田がやり方を言う（担いでいない時だけ。一度）
      if (rt.t - F.stepT > 55 && !F.carry && !F.placed && !F.carryCall) { F.carryCall = true; rt.say('前田利家', `${nm(rt)}、竹束の置き場で「竹束を担ぐ」を長く押し、堤の上の印まで運べ`, 4); }
      if (rt.t - F.stepT > 140 || (rt.t - F.stepT > 110 && !F.placed && !F.carry)) { if (!F.placed) rt.objFail('main'); rt.say('前田利家', 'よい、残りはほかの者が据えた。堤へ上がれ！', 3); F.carry = false; this.backTaba(rt, false); for (let i = F.placed; i < SPOTS.length; i++) { const s = F.spots[i]; this.cover(rt, s.x, s.z); } F.placed = SPOTS.length; this.sallyStart(rt); }
    }
    if (F.step === 2 && F.sally) {
      rt.objProgress('main', `三好勢 ${F.sally.count}人`);
      if (F.sally.count < 5 && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 20);
      if (gone(F.sally) && !F.nightAt) { F.nightAt = rt.t + 8; rt.say('前田利家', '三好を押し戻した！　浅瀬を渡り、中洲から砦の口へ迫れ！', 3.5); }
      if (F.nightAt && rt.t > F.nightAt && rt.player.u.pos.z < -24) this.midA(rt);
      else if (rt.t - F.stepT > 95) this.midA(rt, true);
    }
    if (F.step === 3) {
      // 夜明けまでの時は「堤の持ち場を味方が持っている間」だけ進む（取られたら取り返すまで止まる。WIN.timeHeld と同じ考え）
      const lv = F.SZ && F.SZ.byId.levee;
      const held = !lv || lv.owner === ZONE_STATE.FRIEND;
      if (held) F.nightHeld = (F.nightHeld || 0) + dt;
      if (!held && !F.leveeLostSaid) { F.leveeLostSaid = true; rt.say('前田利家', '堤を取られた！　取り返せ、退き口を塞がれるぞ！', 3.5); }
      if (held) F.leveeLostSaid = false;
      const left = Math.max(0, 100 - F.nightHeld);
      let alive = 0;
      for (const g of F.waves) if (g && !gone(g)) alive += g.count;
      // 時は刻で見せ、夜明けが近づくと東の空が白む
      const koku = left > 75 ? '丑の刻' : left > 35 ? '寅の刻' : '夜明け前';
      rt.objProgress('main', `一揆勢 ${alive}人・${koku}${held ? '' : '・堤を取られた'}`);
      if (rt.t - F.stepT > 105 && F.kyotoNews) this.midB(rt);
      if (left <= 35 && !F.dawn) { F.dawn = true; applyLook(rt, DAWN); rt.bark('東の空が白んできた。もう少しじゃ'); }
      if (F.waves[0] && gone(F.waves[0]) && !F.waves[1] && !F.w1Q) { F.w1Q = true; rt.after(5, () => this.wave(rt, 1)); }
      if (F.waves[1] && gone(F.waves[1]) && !F.waves[2] && !F.w2Q) { F.w2Q = true; rt.after(5, () => this.wave(rt, 2)); }
      for (const g of F.waves || []) if (g && g.count < 5 && !gone(g)) g.morale = Math.min(g.morale, 20);
      if (F.kyotoNews && rt.t - F.stepT >= 65 && ((F.waves.length >= 3 && F.waves.every(gone)) || left <= 0)) this.midB(rt);
    }
  },

  // 軽い部隊どうしの押し合い（遠くの戦い）。昼は堤の西の端の向こう、夜は一揆の大群と織田の手
  tickLight(rt, dt) {
    const F = rt.flags;
    if (F.clashW && !bDead(F.bSally) && !bDead(F.bOdaW) && bDist(F.bSally, F.bOdaW) < 30) lightClash(F.bSally, F.bOdaW, dt, 0.35);
    if (F.step !== 3 || !F.bIkko || !F.AA) return;
    // 攻めの頭が道を決めたら、どこから来るかを伝令が知らせる（一度だけ）
    if (!F.oaSent && F.AA.mainRoute) {
      F.oaSent = true;
      rt.after(8, () => { if (!F.ending) rt.say('伝令', `一揆の大群は、${F.AA.mainRoute.name}から寄せてまいります！${F.AA.feintRoute ? `${F.AA.feintRoute.name}にも別の手が！` : ''}`, 4); });
    }
    // 寄せた大群は、いちばん近い織田の手と押し合う（堤の東・南の畦の外で。軽い作り）
    for (const b of F.bIkko) {
      if (bDead(b)) continue;
      let o = null, dist = 42;
      for (const q of F.lightOda) {
        if (bDead(q)) continue;
        const d = bDist(b, q);
        if (d < dist) { o = q; dist = d; }
      }
      if (o) lightClash(b, o, dt, 0.3);
    }
  },
  // 持ち場の区域の持ち主が変わった（siege_zones.js の onFall）
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z) return;
    if ((id === 'noda' || id === 'fuku') && z.owner === ZONE_STATE.FRIEND && !F['took_' + id]) {
      F['took_' + id] = true;
      rt.award((t) => t.side.push(`${z.name}の岸に踏み込んだ`), `${z.name}の岸に踏み込んだ`);
      rt.say('前田利家', F.step < 3 ? '岸まで詰めた！　砦の奥の鉄砲に気をつけよ。槍を揃え、口を押さえよ' : '砦へ入るな！　堤へ戻り、退き口を保て', 3);
    }
    if (id === 'honjin' && z.owner === ZONE_STATE.ENEMY) rt.say('伝令', '本陣に敵が入り申した！', 3);
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 一揆勢は三好の数に入れず、別に数える
    if (v.team === 1 && v.group && v.group.ikko) F.ikkoK = (F.ikkoK || 0) + 1;
    else if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、野田・福島の三好勢 八千ほど。本願寺の一揆勢は数に入れない。数には諸説ある）
nodafukushima.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 8000 - (F.ek || 0) * 30), b0: 8000 };
};
nodafukushima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '三好三人衆', mon: 'miyoshi' } };
nodafukushima.noWake = true;   // 遠景を本物に替えず、組を含めて約二百人に収める
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nodafukushima.famous = [
  { name: '下間頼廉', g: /一揆/, loose: 1, line: '本願寺の下間頼廉なり！　仏敵信長を討て！' },
];
nodafukushima.date = (rt) => `元亀元年九月十二日〜二十三日　秋・${rt.flags.retreating ? '撤退' : rt.flags.step >= 3 ? '本願寺蜂起' : '砦攻め'}`;
nodafukushima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '竹束の下知まで待つ' : '');
nodafukushima.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// 夕方から夜へ移る途中の色
const MID = { sky: 0x4c4a5c, fog: 0x403e50, sun: 0xd08a64, sunI: 0.85, hs: 0x8c88a4, hg: 0x2a2624, hI: 1.15, top: 0x283048, glow: 0.14, dir: [-0.9, 0.1, 0.3], mount: 0x1c1e26 };
nodafukushima.history = '『信長公記』巻三による。元亀元年（1570）八月、信長は摂津の野田・福島に籠る三好勢を囲んだ。九月十二日には足利義昭と海老江に詰陣し、土手や櫓を築いて砦へ攻め寄せた。根来・雑賀・湯川など紀伊の鉄砲衆も加わり、昼夜の銃撃が続いた。同夜、本願寺が早鐘を鳴らして兵を集め、織田方へ敵対した。十四日には天満が森から出た本願寺勢と春日井堤で戦い、佐々成政、前田利家らが掛かり合った。一方、浅井・朝倉は坂本口へ進み、二十一日には逢坂を越えて醍醐・山科を焼いた。二十二日に知らせを受けた信長は、京への乱入を防ぐため、二十三日に野田・福島から撤退。柴田勝家と和田惟政を殿とし、江口では一揆勢が渡し舟を隠す中、浅くなっていた川を徒歩で渡った。砦の落城による勝利ではなく、志賀の陣へ兵を返した戦である。遊びでは数日にわたる総攻め・蜂起・知らせ・撤退を続く段にまとめ、水路の渡り方と一揆勢の寄せ口は地形を使うための表現とした。兵数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nodafukushima.lordAt = { x: 0, z: 40, r: 12, why: '堤の後ろの織田の陣（信長は海老江へ詰陣し、野田・福島を囲んだ）' };
nodafukushima.lordSpawn = { x: 0, z: 36, heading: Math.PI };

// 素直な遊び手：竹束を据え、浅瀬を渡って攻め、早鐘の後は堤へ戻って退く
const nearIt = (b, id) => b.interacts.find((x) => x.id === id);
nodafukushima.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.retreating) { inp.guardHold = false; inp.runHeld = true; goTo(p, inp, 0, 44, 2); return; }
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 14, 2); return; }
  // 竹束を運ぶ最中（step1）は、柵際まで釣られて詰まらないよう、すぐ側の敵だけを見る
  const e = F.step === 1
    ? b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && o.pos.z > FORT_Z + 2)
    : b.army.nearestEnemy(u, F.step >= 2 ? 12 : 5, (o) => !o.fleeing && o.pos.z > FORT_Z + 2);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    const it = nearIt(b, F.carry ? 'spot' : 'pile');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { goTo(p, inp, 0, -37, 2); return; }   // 水路の浅瀬を渡り、野田砦の口へ迫る
  if (F.step === 3) { const t = (F.waves || []).find((g) => !gone(g)); if (t) { const c = t.center(); if (Math.hypot(c.x - 6, c.z - LEVEE_Z) < 50) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, 8, LEVEE_Z + 4, 2); return; }
  const a = F.maedaU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
};

// ---------------- 中洲から砦の口へ詰め寄せる段 ----------------
const BAR = { x: 0, z: -37 };
function ndCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'miyoshi', armor: 0x33302a, dmg: 0.64, scale: 1, look: (l) => dress(cappedList(rt, l), MIYOSHI), friends: () => [F.maeda].filter((g) => g && g.count), aid: { name: '前田の手の一組', list: [uS(1), uA(8)] }, aidSaid: '前田の手から一組が加わった', keepZ: FORT_Z + 2 };
}
function ndA() {
  return [
    rest({ dur: 6, say: [['前田利家', '左右の手も福島と野田へ寄せておる。湿地を避け、浅瀬から砦の口へ詰めよ']] }),
    fight({ at: BAR, max: 65, title: '浅瀬から砦へ', sub: '水路の中洲を押さえ、二つの砦へ詰め寄せる', obj: '浅瀬を渡り、中洲の三好勢を崩して砦へ迫れ',
      foes: () => [gunLine('中洲の三好の鉄砲衆', { x: 12, z: -38 }, BAR, 8, { off: { x: 10, z: -1 } }), { name: '砦の口を守る三好勢', from: { x: 0, z: -39 }, list: [uS(2), uA(10)], mass: 180 }],
      reward: '浅瀬を渡って砦へ攻め寄せた' }),
  ];
}

nodafukushima.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
export { nodafukushima };
export { namuTex, sagarifujiTex };
