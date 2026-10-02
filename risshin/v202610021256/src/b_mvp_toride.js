// ======================================================================
// 試しの砦攻め（隠しの筋書き system_mvp 三つ目）：束14 MVP 砦テスト（docs/battle-system-plan.md 3-4）
// castles/kinome.js の砦をそのまま読む（b_kinome.js は直さない）。城塞群の中心（観音丸城→木ノ芽峠城・
// 木戸内の郭→主郭）だけを使う小さな試し（西光寺丸城・鉢伏城は省く。取り込みで castles/kinome.js が
// 城塞群に作り直された後の形に合わせた）。
// 攻め 600（正面300・側面300）を makeSonae。守り 200 は castleGarrison が無いため、makeDefenseAI に
// 直に小さな butai（木戸80・主郭の鉄砲40・予備50・守将と本陣30）を渡す（束13 の watch・sallyGate を使う）。
// 殺し場は yokoya.js の makeKillZones（取り込みで main から来た本物）。
// 確かめ：NORENDER=1 node prototype/tools/snap.mjs - prototype/tools/mvp/toride.js
// ======================================================================
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeDefenseAI } from './siege_ai.js';
import { makeKillZones } from './yokoya.js';
import { makeSonae, sonaeTick, sonaeById } from './sonae.js';
import { makeGunsei, gunseiTick } from './gunsei.js';
import { makeButai, butaiTick } from './butai.js';
import { logEvent } from './senkyo.js';
import { distToPolyline } from './world.js';
import { KINOME_PLAN, ROAD, BRANCH_EAST, GATE_KANNON, GATE_KINOME, KINOME_HON, CLIFF_X, FOREST_X } from './castles/kinome.js';

const SCALE = window.__mvpScale === 69;
const ODA = { armor: 0x2b3140, flag: 'oda' };
const IKKO = { armor: 0x3a342c, flag: 'namu' };
const MIX = { ashigaru: 0.6, samurai: 0.15, gun: 0.15, bow: 0.1 };

function baseTerrain(x, z) {
  let h = 0.4 * Math.sin(x * 0.05 + 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.06 - x * 0.03);
  h += Math.max(0, z + 170) * 0.06;
  const d = distToPolyline(x, z, ROAD);
  h += Math.min(26, Math.max(0, d - 14) * 0.5);
  if (x < CLIFF_X) h += (CLIFF_X - x) * 2.4;
  return h;
}
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(KINOME_PLAN, baseTerrain, 3); return HEIGHT_FN(x, z); }

const mvp_toride = {
  spawn: { x: 0, z: -180, heading: 0 },
  noReserve: true, noWake: true, noTaishoRaid: true, noDespair: true,
  world: {
    seed: 69001, time: 'day', muddy: 0.2,
    paths: [ROAD, BRANCH_EAST], height,
    clear: (x, z) => distToPolyline(x, z, ROAD) < 14 || (x > -18 && x < 18 && z > -18 && z < 50),
    trees: 500, tufts: 2000,
    treeDensity: (x, z) => (x > FOREST_X ? 1.4 : x < CLIFF_X + 6 ? 0.6 : distToPolyline(x, z, ROAD) < 16 ? 0.08 : 0.9),
    fleeOut: (x, z, team) => team === 1 && z > 150,
  },
  sides: { a: { name: '攻め手', mon: 'oda' }, b: { name: '一揆勢', mon: 'namu' } },
  taisho: { a: { name: '攻めの大将', def: true }, b: { name: '守将', def: true } },
  date: () => '試しの砦攻め',

  setup(rt) {
    const F = rt.flags;
    F.ending = false; F.reserveSent = false;
    rt.player.u.invuln = true;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    flReset();
    // b_kinome.js と同じ作法：この縄張りの koguchi は gate を持たない（door は kido() で手置き）
    const C = F.C = buildCastlePlan(rt, KINOME_PLAN, { baseHeight: baseTerrain, edgeW: 3 });
    const kannonC = C.kuruwa.kannon.centroid, souC = C.kuruwa.kinome_sou.centroid, honC = C.kuruwa.kinome_hon.centroid;
    F.gateKannon = kido(rt, GATE_KANNON.x, GATE_KANNON.z, 3, 0, { team: 1, hp: 220, name: GATE_KANNON.name, gate: 0 });
    F.gateKinome = kido(rt, GATE_KINOME.x, GATE_KINOME.z, 3, 0, { team: 1, hp: 200, name: GATE_KINOME.name, gate: 1 });

    // ---- 攻め 600（800 既定。__mvpScale=69 で 600）：正面・側面の2つの備 ----
    const atkN = SCALE ? { front: 300, flank: 300 } : { front: 250, flank: 250 };
    makeSonae(rt, { id: 'front', name: '正面の備', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 1, slot: 'center', taisho: '正面の将', nominal: atkN.front, mix: MIX, at: { x: 0, z: -140 }, facing: 0 });
    makeSonae(rt, { id: 'flank', name: '尾根を回る手', team: 0, faction: 'oda', armor: ODA.armor, flag: ODA.flag, line: 1, slot: 'right', taisho: '別動の将', nominal: atkN.flank, mix: MIX, at: { x: 6, z: -70 }, facing: 0 });
    for (const team of [0, 1]) makeGunsei(rt, { team });

    // ---- 守り 200（castleGarrison の代わりに直に butai。makeDefenseAI に watch・sallyGate） ----
    const defN = SCALE ? { gate: 80, naka: 40, reserve: 50, hon: 30 } : { gate: 60, naka: 30, reserve: 35, hon: 25 };
    const gateB = makeButai(rt, { name: '観音丸城の木戸の守り', general: '一揆勢の番頭', team: 1, faction: 'saito', kind: 'ashigaru', nominal: defN.gate, armor: IKKO.armor, flag: IKKO.flag, at: kannonC, facing: 0 });
    const nakaB = makeButai(rt, { name: '木戸内の郭の鉄砲', team: 1, faction: 'saito', kind: 'gun', nominal: defN.naka, armor: IKKO.armor, flag: IKKO.flag, at: souC, facing: 0 });
    const reserveB = makeButai(rt, { name: '予備', team: 1, faction: 'saito', kind: 'ashigaru', nominal: defN.reserve, armor: IKKO.armor, flag: IKKO.flag, at: { x: souC.x, z: (souC.z + honC.z) / 2 }, facing: 0 });
    const honB = makeButai(rt, { name: '守将と本陣', general: '守将', team: 1, faction: 'saito', kind: 'ashigaru', nominal: defN.hon, armor: IKKO.armor, flag: IKKO.flag, at: { x: KINOME_HON.x, z: KINOME_HON.z - 6 }, facing: 0 });
    F.commander = { alive: true, get real() { return rt.army.units.find((u) => u.alive && u.name === '守将'); } };

    F.DA = makeDefenseAI(rt, {
      team: 1,
      posts: [
        { id: 'kannon', butai: gateB, at: kannonC, gate: GATE_KANNON.name, next: 'kinome_sou', watch: [{ at: { x: 0, z: -170 }, range: 40 }], sallyGate: GATE_KANNON.name },
        { id: 'kinome_sou', butai: nakaB, at: souC, gate: GATE_KINOME.name, next: 'kinome_hon' },
        { id: 'kinome_hon', butai: honB, at: { x: KINOME_HON.x, z: KINOME_HON.z - 6 }, honjin: true },
      ],
      reserves: [reserveB],
      fallback: { x: KINOME_HON.x, z: KINOME_HON.z },
    });
    // 束9の殺し場（yokoya.js。取り込みで main から来た本物に差し替え）：観音丸城・木ノ芽峠城の木戸の前
    F.KZ = makeKillZones(rt, C, {
      gates: [{ at: kannonC, name: GATE_KANNON.name }, { at: souC, name: GATE_KINOME.name }],
      team: 1,
    });

    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'kannon', name: '観音丸城', test: C.kuruwa.kannon.test, pos: kannonC, need: 5, hold: 10, gate: GATE_KANNON.name, next: 'kinome_sou' },
        { id: 'kinome_sou', name: '木ノ芽峠城・木戸内の郭', test: C.kuruwa.kinome_sou.test, pos: souC, need: 5, hold: 10, gate: GATE_KINOME.name, next: 'kinome_hon' },
        { id: 'kinome_hon', name: '木ノ芽峠城・主郭', test: C.kuruwa.kinome_hon.test, pos: honC, need: 6, hold: 12, honmaru: true },
      ],
      links: [['kannon', 'kinome_sou'], ['kinome_sou', 'kinome_hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 100,
      commander: () => F.commander,
      noReinforce: () => false,
      onFall: (id) => { logEvent(rt, 'zoneFall', { team: 0, who: id }); if (id === 'kannon') this.onFrontFall(rt); },
      onHonmaru: () => this.win(rt),
      onSurrender: () => this.win(rt),
    });

    rt.obj('mvp_toride', '試しの砦攻め：砦を落とせ', 'main');
    rt.say('使番', '試しの砦攻めでござる。本陣の脇で、備の動きを見ておられよ', 4);
    F.atkMove = { front: { to: { x: 0, z: -96 }, done: false }, flank: { to: { x: 0, z: -34 }, done: false } };
    rt.after(6, () => {
      sonaeById(rt, 'front').order({ id: 'move', to: F.atkMove.front.to });
      sonaeById(rt, 'flank').order({ id: 'move', to: F.atkMove.flank.to });
    });
  },

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

  onFrontFall(rt) {
    const F = rt.flags;
    if (F.reserveSent) return;
    F.reserveSent = true;
    logEvent(rt, 'reserveSent', { team: 0, who: 'flank' });
    rt.bark('別動、主郭へ');
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    sonaeTick(rt, dt);
    gunseiTick(rt, dt);
    F.DA.tick(dt);
    F.SZ.tick(dt);
    F.KZ.tick(dt);
    this.tickAtkMove(rt);
    if (F.ending) return;
    rt.objProgress('mvp_toride', `${Math.round(rt.t)}秒`);
    if (F.SZ.win) { this.win(rt); return; }
    if (rt.t > 400) this.lose(rt);
  },
  win(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.objDone('mvp_toride');
    rt.banner('砦、落城', '試しの砦攻めが決した');
    rt.finish({}, 4);
  },
  lose(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.objFail('mvp_toride');
    rt.banner('時切れ', '試しの砦攻めが決せなんだ');
    rt.finish({}, 4);
  },
};

export { mvp_toride };
