// ======================================================================
// 攻城 C7・C9　高遠城の戦い・縄張り版（docs/siege-plan.md C7・C9／siege-spec.md 57・62・69章）
// 天正十年（1582）三月二日。武田の城々が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり降らなかった。
// 織田信忠の手が城を攻め、その日のうちに落ちた。ここは castle_plan.js の縄張り（castles/takato.js）・
// 門（siege_gate.js）・梯子（siege_ladder.js）・区域制圧（siege_zones.js）・城の頭（siege_ai.js）を
// 使った縄張り版（今の b_takato.js は別の一戦として残す）。
// C9：攻め方で結果が変わる【城62】。①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で
//      ④二の丸を取って高い所から本丸を撃つ、の四つ（軍議・window.__takatoStrategy で選ぶ）。
// ======================================================================
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight, goten } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, zoneWord, makeFirstIn } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeNawabari } from './nawabari.js';
import { placeLadder, startClimb, knockDown, updateLadders, resetLadders } from './siege_ladder.js';
import { makeDefenseAI, chooseRoute } from './siege_ai.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance } from './taketaba.js';
import {
  TAKATO_PLAN, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU,
} from './castles/takato.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const ODA = { armor: 0x2b3140, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };

// ---------------- 地形：南は崖（三峰川）、西は切岸（梯子が要る）、北から緩く台地へ ----------------
function baseTerrain(x, z) {
  let h = 1 + 5 / (1 + Math.exp(-(z + 90) / 6));   // 南の平地から台地へ（z が増すほど高い）
  h += 0.3 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.045);
  if (z > CLIFF_Z) h -= (z - CLIFF_Z) * 3.2;         // 本丸の裏、三峰川の崖
  if (x < NISHI_X) h -= (NISHI_X - x) * 1.8;         // 西の切岸
  if (x > 60) h -= (x - 60) * 0.15;                  // 東（法幢院曲輪の先）へ緩く下る
  return h;
}
// 堀切の窪み（横堀の hori だけ。竪堀は西の切岸そのものが十分に急なので、地形の焼きには混ぜない＝pure）
const HORI_FNS = TAKATO_PLAN.hori.filter((h) => h.kind !== 'tatebori')
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3);
  return HEIGHT_FN(x, z);
}

// 部隊の多点の道：着いたら次の点へ、最後は attack（b_hiei_mtn.js の setRoute・advance・tickRoutes と同じ形）。
// b.assault（下で門ごとに持たせる）があれば、最後は assault にする：塀・門ごしで敵に届かない間、
// 立ち尽くさず（確かめで見つけた「道があるのに20秒動かない兵」）門を打ちに掛かる
function setRoute(b, pts) { b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b.assault ? 'assault' : 'attack' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
}
// 破れていない門をまとめて渡すと、生きている最初の一つを的にする（外の門が破れれば内の門、という順）
function gateAssault(...gates) {
  return () => { for (const g of gates) if (g && g.struct && g.struct.alive && !g.opened) return g.struct; return null; };
}
// 陽動の手：決まった的（門）が無いので、近い城方の塀・柵を的にする（確かめで見つけた「陽動の手が20秒止まる」の直し）
function nearWallAssault(rt) {
  return (u) => {
    let best = null, bd = 45;
    for (const s of rt.army.structs) {
      if (!s.alive || !s.seg || s.team !== 1) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
function mkB(rt, o) { return makeButai(rt, { real: Math.min(14, o.nominal), ...o }); }
function deadB(b) { return !b || b.aliveNominal() <= 0; }

const takato_siege = {
  spawn: { x: 0, z: -118, heading: 0 },
  world: {
    seed: 15930,
    time: 'day',
    mist: false,
    muddy: 0.1,
    terrainTags: true,     // M1：坂・道の速さ・向き変えを効かせる（西の切岸が本当に登りにくくなる）
    paths: [ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU],
    height,
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || distToPolyline(x, z, ROAD_KARAMETE) < 12,
    trees: 500,
    tufts: 1800,
    treeDensity: (x, z) => (x < NISHI_X - 6 ? 1.2 : 0.4),
    groves: [{ x: -40, z: 30, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -140,
  },

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true;
    resetGates(); resetLadders(); flReset();

    // ---- 縄張り：塀・門・櫓を castle_plan.js に建てさせる（C1・C2） ----
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, hodoinC = C.kuruwa.hodoin.centroid, honC = C.kuruwa.hon.centroid;

    // ---- 門（C5）：枡形は一の門・二の門の二つ、それぞれに makeGate。struct.name を一つずつに直す ----
    const G = C.gateObjs;
    G.ote.outer.struct.name = '大手門（一の門）'; G.ote.inner.struct.name = OTE.name;
    G.gate_hon.outer.struct.name = '本丸門（一の門）'; G.gate_hon.inner.struct.name = GATE_HON.name;
    G.gate_ni.struct.name = GATE_NI.name;
    G.karamete.struct.name = KARAMETE.name;
    G.gate_hodoin.struct.name = GATE_HODOIN.name;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    // ---- 本丸の主殿（見た目だけ。飾り） ----
    // 城主の居所（kaito 10/1）：天守の無い戦国期の城なので、仁科盛信は主殿（茅葺・質素な館）の中。
    // 江戸期の御殿にしない（final7-1579-1582-spec 73〜74章）。旗本が北の上がり口を守り、
    // 攻め手が主殿へ上がるまでは討てない。主殿は人が上がれるよう、丸い当たり（solidR）を外す
    const gt = goten(rt, honC.x, honC.z + 8, { team: 1, w: 12, d: 7, tile: false, name: '主殿' });
    gt.struct.solidR = 0;

    // ---- 西の切岸の梯子（C3）：足場（ROAD_NISHI の終わり）から、二の丸の西の縁のすぐ内へ ----
    const foot = { x: NISHI_X - 2, z: 8 };
    F.nishiLadder2 = placeLadder(rt.world, { foot, topY: rt.world.heightAt(-22, 6) + 0.2, topX: -22, topZ: 6, hp: 50, team: 0, name: '西の切岸の梯子' });

    // ---- 守り（仁科盛信・2,000）。区域ごとに小さく（butai.js。S1） ----
    // 門の内の口（inner）のすぐそばに立たせる：siege_gate.js は「門兵（guardTeam）が居なくなったら開く」ので、
    // 曲輪の真ん中に置くと（遠すぎて）始めから門兵が居ない事になり、すぐ開いてしまう（確かめで見つけた）
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const karaGP = midOf(F.gates.karamete.struct), honGP = midOf(F.gates.honInner.struct);
    F.sanSpear = mkB(rt, { name: '三の丸の備え（諏訪勝右衛門）', general: '諏訪勝右衛門', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 500, armor: TAKEDA.armor, flag: TAKEDA.flag, at: oteGP, facing: Math.PI });
    F.sanGun = mkB(rt, { name: '三の丸の鉄砲（塀の上）', team: 1, faction: 'takeda', kind: 'gun', nominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: sanC.x + 8, z: sanC.z }, facing: Math.PI });
    F.niSpear = mkB(rt, { name: '二の丸の備え（小山田昌行）', general: '小山田昌行', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: niGP, facing: Math.PI });
    F.hodoinSpear = mkB(rt, { name: '法幢院曲輪の備え', team: 1, faction: 'takeda', kind: 'bow', nominal: 300, armor: TAKEDA.armor, flag: TAKEDA.flag, at: karaGP, facing: -Math.PI / 2 });
    F.honGuard = mkB(rt, { name: '本丸の仁科盛信の衆', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: honGP, facing: Math.PI });
    F.reserveDef = mkB(rt, { name: '城方の予備', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: (niGP.x + 24) / 2, z: 2 }, facing: Math.PI });
    F.defenders = [F.sanSpear, F.sanGun, F.niSpear, F.hodoinSpear, F.honGuard, F.reserveDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.keep = makeLordKeep(rt, {
      name: '仁科盛信', spot: { x: honC.x, z: honC.z + 8 }, mouth: { x: honC.x, z: honC.z + 2 }, facing: Math.PI, guardN: 6,
      faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      onReach: () => { rt.banner('主殿へ踏み込んだ', '仁科盛信が刀を抜いた。討ち取れ'); rt.say('仁科盛信', '来たか。高遠は降らぬ', 3); },
    });
    F.commander = { alive: true, get real() { return rt.army.units.find((u) => u.alive && u.name === '仁科盛信'); } };

    // ---- 攻め（織田信忠の手・5,000）。小さな部隊（butai.js） ----
    F.oteSpear = mkB(rt, { name: '大手の先手（森長可の組・槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 0, z: -108 }, facing: 0 });
    F.oteGun = mkB(rt, { name: '大手の先手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 400, armor: ODA.armor, flag: ODA.flag, at: { x: 6, z: -108 }, facing: 0 });
    F.karameteSpear = mkB(rt, { name: '搦手の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 500, armor: ODA.armor, flag: ODA.flag, at: { x: 76, z: 4 }, facing: -Math.PI / 2 });
    F.karameteBow = mkB(rt, { name: '搦手の手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: 82, z: 4 }, facing: -Math.PI / 2 });
    F.nishiLadder = mkB(rt, { name: '西の切岸の手（梯子）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -50, z: 12 }, facing: Math.PI / 2 });
    F.yodou = mkB(rt, { name: '陽動の手', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 200, armor: ODA.armor, flag: ODA.flag, at: { x: -54, z: -74 }, facing: 0 });
    F.reserve = mkB(rt, { name: '予備', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: -8, z: -114 }, facing: 0 });
    F.nobutada = mkB(rt, { name: '織田信忠の旗本', general: '織田信忠', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 1500, armor: ODA.armor, flag: ODA.flag, at: { x: 8, z: -116 }, facing: 0 });
    // 信忠は本陣（旗本）に留まり、前線には出さない。taisho.js の adopt() は invuln 持ちの味方の総大将に
    // 深手（討たれない）の退きを与えるので、ここで立てておく（kaito 10/1。滝川一益の手と同じ作り）
    if (F.nobutada.taishoU) F.nobutada.taishoU.invuln = true;
    F.attackers = [F.oteSpear, F.oteGun, F.karameteSpear, F.karameteBow, F.nishiLadder, F.yodou, F.reserve, F.nobutada];
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    // 徒歩の槍：道の先が塀・門ごしで敵に届かなければ、立ち尽くさず門を打ちに掛かる（確かめで見つけた「20秒動かない兵」の直し）
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    F.karameteSpear.assault = gateAssault(F.gates.karamete);
    F.reserve.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
    F.nobutada.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
    for (const b of [...F.attackers, ...F.defenders]) b.order({ id: 'hold' });

    // ---- 区域の網（siege_zones.js。F3）：三の丸・法幢院曲輪→二の丸→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 8, hold: 15, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '法幢院曲輪', test: C.kuruwa.hodoin.test, pos: hodoinC, need: 6, hold: 14, gate: KARAMETE.name, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 10, hold: 15, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 12, hold: 18, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // siege_zones.js の兵力比は「今、本物（real）の兵」で数える（butai.js は名目の多くを軽い大軍で持つ）。
      // 名目の 2,000 をそのまま渡すと、本物の枠（235）はいつも遥かに下回り、本丸に一人でも寄っただけで
      // 「降伏」が暴発してしまう（確かめで見つけた）。実際に本物として出せる見込みの数で渡す
      totalDefenders: 200,
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [20, 40], reserves: [F.reserveDef],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.honTaken(rt),
      onSurrender: () => this.win(rt),
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・ルートの数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, C, {
      SZ: F.SZ, team: 1, friendTeam: 0,
      gates: {
        ote: [F.gates.oteOuter, F.gates.oteInner], gate_ni: F.gates.gateNi,
        gate_hon: [F.gates.honOuter, F.gates.honInner], karamete: F.gates.karamete, gate_hodoin: F.gates.hodoin,
      },
    });

    // ---- 城の頭（siege_ai.js・F4・C8）：守りは持ち場・門・退き・出撃、攻めは道を選ぶ ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanSpear, at: sanC, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', butai: F.hodoinSpear, at: hodoinC, gate: KARAMETE.name, next: 'ni' },
        { id: 'ni', butai: F.niSpear, at: niC, next: 'hon' },
        { id: 'hon', butai: F.honGuard, at: honC },
      ],
      reserves: [],
      fallback: { x: honC.x, z: honC.z },
    });
    // 攻めの頭（軍議で作戦を選ばなければ、道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ
    // ＝味方 AI の手も同じ頭で動く【城39】。道の指図そのものは runStrategy の walkRoute に渡す）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 3.2, pathLen: 60, chokeWidth: 4.2 },
      { id: 'karamete', defThickness: 1.6, pathLen: 46, chokeWidth: 4.4 },
    ];

    // ---- 竹束の寄せ（taketaba.js）：大手・搦手の先手は竹束を押し立て、ゆっくり寄せ場まで進んで撃ち合う ----
    const oteOpen = () => F.gates.oteOuter.opened, karaOpen = () => F.gates.karamete.opened;
    F.TA = makeTabaAdvance(rt, {
      items: [
        { g: F.oteSpear, yose: { x: -4, z: -82 }, until: oteOpen }, { g: F.oteGun, yose: { x: 6, z: -84 }, until: oteOpen },
        { g: F.karameteSpear, yose: { x: 68, z: -3 }, until: karaOpen }, { g: F.karameteBow, yose: { x: 70, z: 5 }, until: karaOpen },
      ],
      avoid: [this.spawn, { x: -4, z: -112 }],
    });
    // ---- 一番乗り（siege_zones.js）：門が破れても、自分が踏み込むまで味方は門の外で待つ ----
    const K = C.kuruwa;
    F.FI = makeFirstIn(rt, {
      from: this.spawn,
      gates: [
        { gate: F.gates.oteOuter }, { gate: F.gates.oteInner, zone: K.san.test }, { gate: F.gates.gateNi, zone: K.ni.test },
        { gate: F.gates.honOuter }, { gate: F.gates.honInner, zone: K.hon.test },
        { gate: F.gates.karamete, zone: K.hodoin.test }, { gate: F.gates.hodoin, zone: K.ni.test },
      ],
    });

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -4, z: -112 }, 0, [{ kind: 'spear', n }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    sfx('siegeDistant', 0.4);
    rt.obj('main', hi(rt) ? '信忠様の先手の一隊を預かり、高遠城を攻め落とせ' : '織田信忠のもとで、下知を待て', 'main');
    // ②降伏の勧め→断る（final7-1579-1582-spec 79章「流れ：1包囲→2降伏の勧め→3攻撃開始…」）。
    // 使者を出す段を一言で見せてから、信忠が攻め掛かりを告げる
    rt.say('織田信忠', '仁科盛信へ使者を出せ。今ならば城と兵の命は助ける、と', 4);
    rt.after(4, () => rt.say('仁科盛信', '返す言葉は無い。高遠は降らぬ', 3));
    rt.after(7.5, () => rt.say('織田信忠', `${nm(rt)}、聞いての通りだ。夜明けとともに攻める。作戦は軍議で決める`, 5));
    rt.after(10, () => this.assault(rt));
  },

  // ① 軍議で選んだ作戦（無ければ攻めの頭が自分で選ぶ）に沿って、部隊を動かす（C9）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('assault');
    sfx('horagai', 0.85);
    announceAdvance(rt, '織田信忠');
    F.strategy = window.__takatoStrategy || F.strategy || null;
    if (!F.strategy) {
      // 軍議を経ていない（AI どうしの確かめ）：攻めの頭（siege_ai.js の chooseRoute）に選ばせる【城39】
      F.aiPicked = true;
      rt.obj('main', '道は、こちらで決める', 'main');
    } else {
      rt.obj('main', '仁科盛信の高遠城を攻め落とせ', 'main');
    }
    this.runStrategy(rt, F.strategy);
    // 陽動の手：どの作戦でも、西の切岸の下へ出て塀際を脅す（決まった的が無いまま hold で待ち続けて、
    // 他家の見張りに「道があるのに20秒動かない」と見つかった兵。kaito 10/1）
    F.yodou.assault = nearWallAssault(rt);
    setRoute(F.yodou, [...ROAD_YODOU]);
    rt.marker('san', F.sanSpear.pos, () => `三の丸・${moraleWord(F.sanSpear.morale)}`, { red: true });
    rt.marker('hon', F.honGuard.pos, () => `本丸・${moraleWord(F.honGuard.morale)}`, { red: true });
  },

  // C9 の四つの作戦：①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で ④二の丸を取って本丸を撃つ
  runStrategy(rt, strat) {
    const F = rt.flags;
    if (strat === 'karamete') {
      rt.say('織田信忠', '大手で引きつける。搦手から本隊が回る', 4);
      setRoute(F.oteGun, [...ROAD_OTE.slice(1, 4)]);   // 大手の枡形の手前までで止まり、引きつけるだけ
      F.oteGun._pin = true;
      setRoute(F.karameteSpear, [...ROAD_KARAMETE.slice(1)]);
      setRoute(F.karameteBow, [...ROAD_KARAMETE.slice(1)]);
      F.pushVia = 'karamete';
    } else if (strat === 'nishi') {
      rt.say('織田信忠', '西の切岸を梯子で登る。夜明けの霧に紛れよ', 4);
      setRoute(F.nishiLadder, [...ROAD_NISHI.slice(1)]);
      setRoute(F.oteGun, [...ROAD_OTE.slice(1, 3)]);   // 大手は小さく構えるだけ
      F.oteGun._pin = true;
      F.pushVia = 'nishi';
    } else if (strat === 'ni_bombard') {
      rt.say('織田信忠', 'まず二の丸を取る。高い所から本丸を撃ち崩してから攻める', 4);
      setRoute(F.oteSpear, [...ROAD_OTE.slice(1)]);
      setRoute(F.oteGun, [...ROAD_OTE.slice(1)]);
      F.pushVia = 'ni_bombard';
    } else if (!strat) {
      // 作戦を選んでいない（AI どうしの確かめ）：攻めの頭（siege_ai.js の chooseRoute）が
      // 道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ【城39】。選んだ道を、いつもの walkRoute で歩かせる
      const picked = chooseRoute(F.AI_ROUTES, Math.random);
      F.pushVia = (picked && picked.id) || 'ote';
      rt.bark(`攻めの頭：${F.pushVia === 'karamete' ? '搦手' : '大手'}を主に攻める`);
      if (F.pushVia === 'karamete') {
        setRoute(F.karameteSpear, [...ROAD_KARAMETE.slice(1)]);
        setRoute(F.karameteBow, [...ROAD_KARAMETE.slice(1)]);
        setRoute(F.oteGun, [...ROAD_OTE.slice(1, 4)]); F.oteGun._pin = true;
      } else {
        setRoute(F.oteSpear, [...ROAD_OTE.slice(1)]);
        setRoute(F.oteGun, [...ROAD_OTE.slice(1)]);
      }
    } else {
      // 'ote'（大手だけ）
      setRoute(F.oteSpear, [...ROAD_OTE.slice(1)]);
      setRoute(F.oteGun, [...ROAD_OTE.slice(1)]);
      F.pushVia = 'ote';
    }
  },

  // 区域が落ちた（siege_zones.js の onFall）
  // 本丸を取った（区域か、本丸の衆が大きく減った時）：勝ちはまだ。主殿の城主へ寄せる
  honTaken(rt) {
    const F = rt.flags;
    if (F.honFell || F.ending) return;
    F.honFell = true; F.honT = rt.t;
    rt.banner('本丸を取った', '主殿の仁科盛信を討て');
    rt.obj('main', '主殿の仁科盛信を討ち取れ', 'main');
    const to = F.keep ? [[GATE_HON.x, GATE_HON.z], [F.keep.spot.x, F.keep.spot.z - 6]] : [[GATE_HON.x, GATE_HON.z], [-2, 30]];
    for (const b of [F.reserve, F.nobutada]) if (b && b.aliveNominal() > 0) setRoute(b, to);
  },

  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      // 信忠（旗本）は本陣に留め、前線へは予備だけを進める（kaito 10/1）
      if (F.pushVia === 'ote' || F.pushVia === 'ni_bombard') setRoute(F.reserve, [...ROAD_OTE.slice(2)]);
    } else if (id === 'hodoin' && !F.hodoinFell) {
      F.hodoinFell = true;
      if (F.pushVia === 'karamete') setRoute(F.reserve, [...ROAD_KARAMETE.slice(2)]);
    } else if (id === 'ni' && !F.niFell) {
      F.niFell = true;
      rt.unmark('hon');
      rt.marker('hon', F.honGuard.pos, () => `本丸・${moraleWord(F.honGuard.morale)}`, { red: true });
      if (F.oteGun && F.oteGun._pin) { F.oteGun._pin = false; F.oteGun.order({ id: 'attack' }); }
      if (F.pushVia === 'ni_bombard') {
        F.bombardUntil = rt.t + 22;
        rt.banner('二の丸を取った', '高い所から、本丸へ鉄砲を撃ちかける');
        F.oteGun.order({ id: 'move', to: { x: F.C.kuruwa.ni.centroid.x, z: F.C.kuruwa.ni.centroid.z } });
      } else {
        if (F.reserve._route == null && F.reserve.aliveNominal() > 0) setRoute(F.reserve, [[GATE_HON.x, GATE_HON.z], [-2, 30]]);
      }
    } else if (id === 'hon' && !F.honFell) {
      this.honTaken(rt);
    }
  },

  // 名目の兵力比の保険：siege_zones.js の「区域の占有」は、ごく僅かに残った城兵が区域の中で
  // 死にきらないと、いつまでも「争い中」のまま進まない事がある（確かめで見つけた）。守りの部隊が
  // 大きく（7割）減ったら、占有を待たずに次の場へ進ませる（SZ 自身がうまく占有を決められた時は
  // onZoneFall が二重に呼ばれるだけで、どちらも一度しか効かない作りなので壊れない）
  checkAttrition(rt) {
    const F = rt.flags;
    const chk = (id, b) => { if (b && !b._ratioFell && b.nominal > 0 && b.aliveNominal() / b.nominal <= 0.45) { b._ratioFell = true; this.onZoneFall(rt, id); } };
    chk('san', F.sanSpear); chk('hodoin', F.hodoinSpear); chk('ni', F.niSpear);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城を攻め落とした', pts: 24 }; }, '任務達成・高遠城を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('本丸、落ちる', '仁科盛信、最後まで刀を取って戦い、城と共に果てた');
    rt.say('織田信忠', `${nm(rt)}、城は落ちた。……この日のうちに、とはな`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    if (F.ending) return;
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    updateGates();
    updateLadders(rt.army, dt);
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 1) { tickRoutes(F.attackers); this.checkAttrition(rt); }
    if (F.FI) F.FI.tick();

    // 西の切岸の梯子：着いた兵を一人ずつ登らせ、守りが時おり押し倒す
    if (F.nishiLadder2 && F.nishiLadder2.hp > 0) {
      for (const u of (F.nishiLadder.real ? F.nishiLadder.real.units : [])) {
        if (!u.alive || u.climb) continue;
        if (Math.hypot(u.pos.x - F.nishiLadder2.x, u.pos.z - F.nishiLadder2.z) < 2.2) startClimb(u, F.nishiLadder2);
      }
      F._kdT = (F._kdT || 0) - dt;
      if (F._kdT <= 0 && !deadB(F.niSpear) && Math.random() < 0.4) { F._kdT = 6; knockDown(F.nishiLadder2, rt.army); }
    }
    // 二の丸からの鉄砲の高所撃ち【城74】：本丸を静かに削る（かかった数だけ）
    if (F.bombardUntil && rt.t < F.bombardUntil && !deadB(F.honGuard)) {
      F.honGuard.lost = Math.min(F.honGuard.nominal - 1, F.honGuard.lost + dt * 1.1);
      F.honGuard.morale = Math.max(20, F.honGuard.morale - dt * 0.6);
    } else if (F.bombardUntil && rt.t >= F.bombardUntil && !F.bombardDone) {
      F.bombardDone = true;
      rt.banner('本丸への攻め口が開いた', '予備の手が、本丸へ攻め上る');
      if (F.reserve.aliveNominal() > 0) setRoute(F.reserve, [[GATE_HON.x, GATE_HON.z], [-2, 30]]);
    }
    if (F.step >= 1 && !F.ending) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.niFell) rt.objProgress('main', `三の丸・${zoneWord(st.san)}／二の丸・${zoneWord(st.ni)}`);
      else rt.objProgress('main', `本丸・${zoneWord(st.hon)}`);
    }
    // 本丸の仁科盛信の衆が大きく減ったら、城は落ちたとする（名目の兵力比で見る。確かめで見つけた：
    // siege_zones.js の「場の占有」だけだと、ごく僅かに残った城兵が区域の中で死にきらず、
    // いつまでも「争い中」のままになる事がある。60 秒は様子を見てから）
    if (!F.ending && rt.t - F.stepT > 60 && F.honGuard && F.honGuard.aliveNominal() / F.honGuard.nominal <= 0.4) this.honTaken(rt);
    // 城主は主殿の中（kaito 10/1）：討てば勝ち。本丸を取っても討てずに長くかかれば、城主は自ら果てる（4〜7 分の内）
    if (F.keep) {
      F.keep.tick();
      if (F.keep.down) { this.win(rt); return; }
      if (F.honFell && rt.t - F.honT > 80) { this.win(rt); return; }
    }
    // 時をかけすぎたら、確かめを止めない保険で決着させる（遊んで 4〜7 分の目安）
    if (rt.t - (F.stepT || 0) > 380 && !F.ending) this.win(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

takato_siege.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 };
};
takato_siege.sides = { a: { name: '織田軍（織田信忠）', mon: 'oda' }, b: { name: '武田軍（仁科盛信）', mon: 'takeda' } };
takato_siege.famous = [
  { name: '小山田昌行', team: 1, g: /二の丸/, loose: 1, line: '武田の小山田昌行なり！　高遠は仁科様と共に果てる！' },
  { name: '諏訪勝右衛門', team: 1, g: /三の丸/, loose: 1, line: '諏訪勝右衛門なり！　女子供まで刀を取っておるわ！' },
];
takato_siege.date = () => '天正十年三月二日　夜明け';
takato_siege.history = '天正十年（1582）三月二日、甲州征伐で伊那口の武田の城が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり、降るようにとの勧めを退けた。織田信忠の手が城を攻め、城兵は女までが刀を取って戦ったというが、城はその日のうちに落ち、盛信は討ち死にした。ここでは縄張り（三の丸・二の丸・法幢院曲輪・本丸、大手門・搦手門・枡形・西の切岸）を使い、攻め方（大手一本・大手で引きつけ搦手・西の切岸を梯子で・二の丸を取って本丸を撃つ）で結果が変わる仕組みの見本として遊べるようにした一戦。兵の数には諸説ある。';

// 軍議（gungi.js・C6）：城を回して見て、作戦を一つ選ぶ【城19〜22・68】
takato_siege.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: 0 }, dist: 130,
    landmarks: [
      { name: '大手門', x: OTE.x, z: OTE.z }, { name: '搦手門', x: KARAMETE.x, z: KARAMETE.z },
      { name: '三の丸', x: 0, z: -38 }, { name: '二の丸', x: 0, z: -2 },
      { name: '法幢院曲輪', x: 36, z: -1 }, { name: '本丸', x: 0, z: 29 }, { name: '西の切岸', x: NISHI_X, z: 8 },
    ],
    lines: [
      { name: '三の丸', owner: '敵' }, { name: '法幢院曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '織田信忠の手（全軍）', group: () => F.nobutada && F.nobutada.real, nominal: () => (F.nobutada ? F.nobutada.aliveNominal() : 0) }],
    routes: [
      { id: 'ote', name: '大手から正面へ攻める' },
      { id: 'karamete', name: '大手で引きつけ、搦手を突く' },
      { id: 'nishi', name: '西の切岸を梯子で登る' },
      { id: 'ni_bombard', name: '二の丸を取り、高所から本丸を撃つ' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '三の丸の備え', known: true, count: () => (F.sanSpear ? F.sanSpear.aliveNominal() : 0) + (F.sanGun ? F.sanGun.aliveNominal() : 0) },
      { name: '法幢院曲輪の備え', known: false },
      { name: '二の丸・本丸の備え', known: false },
    ],
    cinema: { attackers: { x: 0, z: -100 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: F.honGuard ? F.honGuard.pos.x : 0, z: F.honGuard ? F.honGuard.pos.z : 29 } },
    onStart: (assign) => takato_siege.onGungiStart(rt, assign),
  };
  // F9：bot・sim で確かめる時、作戦を渡していれば window.__takatoStrategy で決め打ち。
  // 渡していなければ（AI どうしの確かめ）軍議の札を出さず、攻めの頭（siege_ai.js）に選ばせる
  if (window.__takatoStrategy) { takato_siege.onGungiStart(rt, { main: window.__takatoStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
takato_siege.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'ote'; };

// 素直な遊び手：敵へ向かって戦い、無ければ大手へ
takato_siege.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const tgt = F.oteSpear ? F.oteSpear.pos : { x: u.pos.x, z: u.pos.z };
  goTo(p, inp, tgt.x, tgt.z + 4, 3);
};

export { takato_siege };
