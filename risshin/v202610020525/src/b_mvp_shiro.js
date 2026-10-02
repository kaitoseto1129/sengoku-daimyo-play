// ======================================================================
// 試しの城攻め（隠しの筋書き system_mvp 二つ目）：束11 MVP 城攻めテスト（docs/battle-system-plan.md 3-3）
// castles/takato.js の縄張りと高遠の地形を写して使う（b_takato_siege.js は直さない）。
// 攻め 1,500 を makeSonae で5つ（大手500・搦手300・鉄砲300・後詰300・本陣100）。
// 守り 700 は castleGarrison（shiro.js・束8）で5つの備に組む
// （大手門150・塀と櫓の鉄砲100・三の丸150・二の丸150・本丸150）。
// 殺し場は yokoya.js の makeKillZones（本物。大手門・搦手門の前）。
// 確かめ：NORENDER=1 node prototype/tools/snap.mjs - prototype/tools/mvp/shiro.js
// ======================================================================
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeKillZones } from './yokoya.js';
import { makeSonae, sonaeTick, sonaeById } from './sonae.js';
import { makeGunsei, gunseiTick } from './gunsei.js';
import { butaiTick } from './butai.js';
import { logEvent } from './senkyo.js';
import { distToPolyline } from './world.js';
import { castleGarrison } from './shiro.js';
import {
  TAKATO_PLAN, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI,
} from './castles/takato.js';

const SCALE = window.__mvpScale === 68;
const ODA = { armor: 0x2b3140, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };
const MIX = { ashigaru: 0.6, samurai: 0.15, gun: 0.15, bow: 0.1 };

function baseTerrain(x, z) {
  let h = 1 + 5 / (1 + Math.exp(-(z + 90) / 6));
  h += 0.3 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.045);
  if (z > CLIFF_Z) h -= (z - CLIFF_Z) * 3.2;
  if (x < NISHI_X) h -= (NISHI_X - x) * 1.8;
  if (x > 60) h -= (x - 60) * 0.15;
  return h;
}
const HORI_FNS = TAKATO_PLAN.hori.filter((h) => h.kind !== 'tatebori')
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3); return HEIGHT_FN(x, z); }

const mvp_shiro = {
  spawn: { x: 10, z: -112, heading: 0 },
  noReserve: true, noWake: true, noTaishoRaid: true, noDespair: true,
  world: {
    seed: 68001, time: 'day', muddy: 0.1, terrainTags: true,
    paths: [ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI],
    height,
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || distToPolyline(x, z, ROAD_KARAMETE) < 12,
    trees: 300, tufts: 1400,
    treeDensity: (x, z) => (x < NISHI_X - 6 ? 1.2 : 0.4),
    fleeOut: (x, z, team) => team === 1 && z < -140,
  },
  sides: { a: { name: '攻め手', mon: 'oda' }, b: { name: '城方', mon: 'takeda' } },
  taisho: { a: { name: '攻めの大将', def: true }, b: { name: '城主', def: true } },
  date: () => '試しの城攻め',

  setup(rt) {
    const F = rt.flags;
    F.ending = false; F.atkPhase = 'ote'; F.reserveSent = false;
    rt.player.u.invuln = true;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    resetGates(); flReset();
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, hodoinC = C.kuruwa.hodoin.centroid, honC = C.kuruwa.hon.centroid;
    const G = C.gateObjs;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    // ---- 攻め 1,500（800。__mvpScale=68 で 1,500）：5つの備 ----
    const atkN = SCALE ? { ote: 500, karamete: 300, gun: 300, gotsume: 300, honjin: 100 } : { ote: 300, karamete: 150, gun: 150, gotsume: 150, honjin: 50 };
    makeSonae(rt, { id: 'ote', name: '大手の備', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 1, slot: 'center', taisho: '大手衆の将', nominal: atkN.ote, mix: MIX, at: { x: 0, z: -100 }, facing: 0 });
    makeSonae(rt, { id: 'karamete', name: '搦手の備', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 1, slot: 'right', taisho: '搦手衆の将', nominal: atkN.karamete, mix: MIX, at: { x: 78, z: 10 }, facing: -Math.PI / 2 });
    makeSonae(rt, { id: 'gun', name: '鉄砲の備', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 1, slot: 'left', taisho: '鉄砲頭', nominal: atkN.gun, mix: { gun: 0.8, ashigaru: 0.2 }, at: { x: -14, z: -102 }, facing: 0 });
    makeSonae(rt, { id: 'gotsume', name: '後詰', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 'gotsume', slot: 'center', taisho: '後詰の将', nominal: atkN.gotsume, mix: MIX, at: { x: 0, z: -124 }, facing: 0 });
    makeSonae(rt, { id: 'honjin', name: '本陣', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 'honjin', slot: 'center', taisho: '攻めの大将', nominal: atkN.honjin, mix: { ashigaru: 0.4, samurai: 0.4, cavalry: 0.2 }, at: { x: 10, z: -134 }, facing: 0, major: true });

    // ---- 守り 700（400。__mvpScale=68 で 700）：castleGarrison（shiro.js・束8）で5つの備 ----
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const defN = SCALE ? { gate: 150, wall: 100, san: 150, ni: 150, hon: 150 } : { gate: 80, wall: 50, san: 80, ni: 80, hon: 80 };
    F.garrison = castleGarrison(rt, C, {
      team: 1, faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      lord: { name: '城主', kuruwa: 'hon' },
      posts: [
        { id: 'd_gate', name: '大手門の備え', role: '門', nominal: defN.gate, mix: { ashigaru: 0.7, samurai: 0.3 }, at: oteGP, taisho: '大手の番頭', gate: '大手門（一の門）', next: 'd_san' },
        { id: 'd_wall', name: '塀と櫓の鉄砲', role: '塀', nominal: defN.wall, mix: { gun: 1 }, at: { x: sanC.x + 8, z: sanC.z }, next: 'd_san' },
        { id: 'd_san', name: '三の丸番頭', role: '曲輪', nominal: defN.san, mix: MIX, at: { x: sanC.x, z: sanC.z + 6 }, taisho: '三の丸番頭', gate: '大手門（一の門）', next: 'd_ni' },
        { id: 'd_ni', name: '二の丸番頭', role: '曲輪', nominal: defN.ni, mix: MIX, at: niGP, taisho: '二の丸番頭', gate: GATE_NI.name, next: 'd_hon' },
        // 本丸は honC（曲輪の奥）に置く（門の真口に立たせると早々に城主が討たれてしまうため）
        { id: 'd_hon', name: '本丸の城主と旗本', role: '本丸', nominal: defN.hon, mix: { ashigaru: 0.3, samurai: 0.5, cavalry: 0.2 }, at: honC, gate: GATE_HON.name },
      ],
    });
    F.commander = { alive: true, get real() { return rt.army.units.find((u) => u.alive && u.name === '城主'); } };

    for (const team of [0, 1]) makeGunsei(rt, { team });

    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 6, hold: 12, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '法幢院曲輪', test: C.kuruwa.hodoin.test, pos: hodoinC, need: 5, hold: 12, gate: KARAMETE.name, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 8, hold: 14, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 10, hold: 16, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // 本物の兵（butai.js の real/nearReal、名目の数ではない）で比べる見込みの数（takato_siege と同じ理由）。
      // 試しは本陣の脇に立つだけで戦場を回らない（本物が farReal のまま）ので、降伏の早すぎる暴発を避け、
      // 実の落城（本丸）で決着させる（noReinforce は常に false）
      totalDefenders: 200,
      commander: () => F.commander,
      noReinforce: () => false,
      quietRange: [15, 30],
      onFall: (id) => { logEvent(rt, 'zoneFall', { team: 0, who: id }); if (id === 'san') this.onSanFall(rt); if (id === 'ni') this.onNiFall(rt); },
      onHonmaru: () => this.win(rt),
      onSurrender: () => this.win(rt),
    });
    // 束9の殺し場（yokoya.js。取り込みで main から来た本物に差し替え）：大手門・搦手門の前
    F.KZ = makeKillZones(rt, C, {
      gates: [{ at: oteGP, name: '大手門' }, { at: { x: KARAMETE.x, z: KARAMETE.z }, name: '搦手門' }],
      team: 1,
    });

    // 試しの攻めの頭：近づく→(到着)攻める、の二段（takato_siege の setRoute と同じ考え）。
    // 一つの下知「attack」だけでは門まで近寄らない事があるため、まず門の手前へ寄せてから攻めさせる
    F.atkMove = {
      ote: { to: { x: 0, z: -64 }, done: false },
      gun: { to: { x: -14, z: -68 }, done: false },
      karamete: { to: { x: 58, z: 4 }, done: false },
    };
    rt.obj('mvp_shiro', '試しの城攻め：城を落とせ', 'main');
    rt.say('使番', '試しの城攻めでござる。本陣の脇で、備の動きを見ておられよ', 4);
    rt.after(6, () => {
      sonaeById(rt, 'ote').order({ id: 'move', to: F.atkMove.ote.to });
      sonaeById(rt, 'gun').order({ id: 'move', to: F.atkMove.gun.to });
    });
    rt.after(8, () => sonaeById(rt, 'karamete').order({ id: 'move', to: F.atkMove.karamete.to }));
  },

  // 寄せた備が着いたら「攻め」へ切り替える（着いていなければ何もしない）
  tickAtkMove(rt) {
    const F = rt.flags;
    for (const id of Object.keys(F.atkMove)) {
      const m = F.atkMove[id];
      if (m.done) continue;
      const S = sonaeById(rt, id);
      if (!S || S.b.aliveNominal() <= 0) { m.done = true; continue; }
      if (Math.hypot(S.b.pos.x - m.to.x, S.b.pos.z - m.to.z) < 10) { m.done = true; S.order({ id: 'attack' }); }
    }
  },

  // 三の丸が落ちたら、後詰（攻め）を前へ送る
  onSanFall(rt) {
    const F = rt.flags;
    if (F.reserveSent) return;
    F.reserveSent = true;
    F.atkMove.gotsume = { to: { x: 0, z: -10 }, done: false };
    const g = sonaeById(rt, 'gotsume');
    if (g) g.order({ id: 'move', to: F.atkMove.gotsume.to });
    logEvent(rt, 'reserveSent', { team: 0, who: 'gotsume' });
    rt.bark('後詰、前へ');
  },

  // 二の丸が落ちたら、本陣（攻め）を本丸へ送る。搦手・法幢院の軽い道から先に二の丸が落ちる事もあるため、
  // 後詰（まだなら）も一緒に出す（本陣だけの少人数で本丸へ突っ込んで押し返される事を防ぐ）
  onNiFall(rt) {
    const F = rt.flags;
    this.onSanFall(rt);
    if (F.honSent) return;
    F.honSent = true;
    F.atkMove.honjin = { to: { x: 10, z: 20 }, done: false };
    const h = sonaeById(rt, 'honjin');
    if (h) h.order({ id: 'move', to: F.atkMove.honjin.to });
    rt.bark('本陣、本丸へ');
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    sonaeTick(rt, dt);
    gunseiTick(rt, dt);
    updateGates();
    if (F.garrison) F.garrison.tick(dt);
    F.SZ.tick(dt);
    F.KZ.tick(dt);
    this.tickAtkMove(rt);
    if (F.ending) return;
    rt.objProgress('mvp_shiro', `${Math.round(rt.t)}秒`);
    if (F.SZ.win) { this.win(rt); return; }
    if (rt.t > 600) this.lose(rt);
  },
  win(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.objDone('mvp_shiro');
    rt.banner('城、落城', '試しの城攻めが決した');
    rt.finish({}, 4);
  },
  lose(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.objFail('mvp_shiro');
    rt.banner('時切れ', '試しの城攻めが決せなんだ');
    rt.finish({}, 4);
  },
};

export { mvp_shiro };
