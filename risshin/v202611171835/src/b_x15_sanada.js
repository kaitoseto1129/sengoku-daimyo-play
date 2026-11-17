// ======================================================================
// 番外　天王寺（真田幸村）　慶長二十年（1615）五月七日（台帳 K295 番外・kaito 11/17「真田として交換するだけ。ミッションも徳川の首をゲットするだけでいい」）
// 作り：b_k15_tennoji_okayama.js（天王寺・岡山）の地形・景色・陣の置き場をそのまま使い、側を入れ替える（作り直さない）。
//   本人と味方＝真田の赤備え・毛利勝永の隊（豊臣方）。敵＝本多忠朝の先手・松平忠直の越前勢・榊原の二陣・家康の旗本（徳川方）。
//   本人は真田信繁（赤備え・鹿角の兜・六文銭の旗・騎馬。units_data.js の「真田信繁」の具足の色と同じ）。
//   任務は一つ「家康を討つ」。家康の本陣にピン、家康を討てば勝ち。
// 本編の筋・位・セーブとは切り離す：徳川編の戦の並びの一番下の「番外」の札から、侍大将で出陣と同じ試し（G.practice）で始める。
// 史実：真田信繁は茶臼山から越前勢を突き抜け、家康の本陣へ三度突き掛かり、金扇の馬印を倒した（docs/battle_refs/k15_tennoji_okayama.md）。
// 向き：北が -z（大坂城）、南が +z（家康の本陣）。座標は天王寺の戦と同じ。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { timeslipField } from './timeslip_field.js';
import { allyGroup, enemyGroup } from './bhelp.js';
import { STAGES } from './stages.js';
import base, { k15Scenery } from './b_k15_tennoji_okayama.js';

BATTLE_ASSETS.x15_sanada = BATTLE_ASSETS.k15_tennoji_okayama;

const CHAUSU = { x: -106, z: 4 };    // 茶臼山（真田の陣・本人の出る所）
const SHITENNO = { x: -46, z: -14 }; // 四天王寺の南門の前（毛利勝永）
const ECHI = { x: -98, z: 54 };      // 茶臼山の正面（南）の越前勢
const FRONT = { x: -46, z: 40 };     // 天王寺口の先手（本多忠朝）
const NIJIN = { x: -44, z: 80 };     // 二陣（榊原康勝）
const HON = { x: -40, z: 165 };      // 家康の本陣
const START = { x: -104, z: 16 };
const S = Math.PI;                   // 北（大坂城）向き
const N2S = Math.atan2(HON.x - START.x, HON.z - START.z);   // 茶臼山から本陣への向き

const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MORI = { armor: 0x4a4036, flag: 'sashi:toyotomi:#221f1b:#ece6d6' };
const TOKU = { armor: 0x48443e, flag: 'tokugawa' };
const HONDA = { armor: 0x46403a, flag: 'honda' };
const sq = (side, type, n, o = {}) => ({ type, n, o: { flag: side.flag, armor: side.armor, ...(side.lace ? { lace: side.lace } : {}), ...(side === SANADA && type !== 'busho' ? { hatColor: SANADA.armor, helm: SANADA.armor } : {}), ...o } });
const alive = (g) => g && !g.routed && g.count > 0;

// 天王寺の def を写す（getter もそのまま）。戦の中身（段・筋書き・途中の保存）は持ち込まない
const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
for (const k of ['introMapLayout', 'introMapGround', 'resumeSteps', 'resumeAt', 'botStat', 'courierPath', 'nameTagVisible', 'goalSignOff', 'stageGoalsOnly', 'scoutRun', 'battleVoices']) delete D[k];
for (const [k, v] of Object.entries(base)) if (typeof v === 'function' && !['reserveOk', 'actionGuideTarget', 'routeGuidePriority', 'date'].includes(k)) delete D[k];

const x15_sanada = Object.assign(D, {
  spawn: { x: START.x, z: START.z, heading: N2S },
  pacingCap: 900,   // 十五分で打ち切り
  courierN: 0,
  // 真田の突撃は一騎で本陣まで届く強さ（天王寺の 0.42 より刃を軽く。一度に受ける刃は命の二割五分まで）
  cutFloor: 0.3, meleeGrace: { rate: 0.3, burst: 0.25, interval: 3 },
  // 両軍の人数（豊臣方 五万五千・徳川方 十五万。天王寺の force の側を入れ替える）
  force: (rt) => ({ a: Math.max(0, 55000 - (rt.flags.ak || 0) * 60), a0: 55000, b: Math.max(0, 150000 - (rt.flags.ek || 0) * 40), b0: 150000 }),
  introPeople: [],
  introText: () => '茶臼山から家康の本陣へ駆け、家康を討て。',
  introLords: ['真田信繁', '徳川家康'],
  introYou: false,
  introFujin: base.introFujin.map((e) => ({ ...e, team: 1 - e.team })),
  sides: { a: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' }, b: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' } },
  taisho: { a: { name: '真田信繁', def: true }, b: { name: '徳川家康', def: true } },
  // 本人の見た目：真田信繁（赤備え・鹿角の兜・六文銭の旗。player.js の def.playerLook）
  playerLook: { armor: SANADA.armor, lace: 0x232c40, hat: 'kabuto_sanada', hatColor: SANADA.armor, shu: 1, flag: 'sanada', mon: 'sanada', haori: 0, menpo: 0x7a1c14, menpoStyle: 'hanbo', real: 1, tack: 0x8e2218 },
  world: { ...base.world, playerHorse: true, fleeOut: (x, z, team) => (team === 1 ? z > 240 : z < -200) },   // 逃げる先も入れ替える（徳川方は南・豊臣方は城の北）
  goalSignTarget: (rt) => { const F = rt.flags; if (F.ending) return null; const u = F.ieyasu; return u?.alive ? { x: u.pos.x, z: u.pos.z, label: '徳川家康' } : { x: HON.x, z: HON.z, label: '徳川家康' }; },

  setup(rt) {
    timeslipField(rt);
    const F = rt.flags;
    F.step = 1; F.ending = false; F.t = 0; F.ek = 0; F.ak = 0;
    k15Scenery(rt);
    // 馬に乗って始める（騎馬の信繁）
    { const P = rt.player, L = P.loose; if (P.canRide && !P.mounted && L && L.mode !== 'fled' && P.u && Math.hypot(L.x - P.u.pos.x, L.z - P.u.pos.z) < 3.2) P.toggleMount(); }

    // ---- 味方（豊臣方）：本人の脇の赤備えの騎馬と旗本、四天王寺の前の毛利勝永 ----
    F.aka = allyGroup(rt, { faction: 'toyotomi', name: '真田の赤備え', anchor: { x: START.x + 6, z: START.z + 4 }, facing: N2S, width: 14, aggro: 12, seekRange: 18, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(SANADA, 'busho', 1, { name: '大谷吉治', horse: true, hat: 'kabuto_m' }), sq(SANADA, 'cavalry', 14), sq(SANADA, 'samurai', 6), sq(SANADA, 'gun', 4)]);
    F.hata = allyGroup(rt, { faction: 'toyotomi', name: '真田の旗本', anchor: { x: START.x - 6, z: START.z - 2 }, facing: N2S, width: 10, aggro: 12, seekRange: 18, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(SANADA, 'busho', 1, { name: '真田大助', horse: true, hat: 'kabuto_m' }), sq(SANADA, 'cavalry', 8), sq(SANADA, 'samurai', 6)]);
    F.mori = allyGroup(rt, { faction: 'toyotomi', name: '毛利勝永の隊', anchor: { x: SHITENNO.x, z: SHITENNO.z + 8 }, facing: 0, width: 12, aggro: 14, seekRange: 22, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(MORI, 'busho', 1, { name: '毛利勝永', invuln: true, horse: true }), sq(MORI, 'cavalry', 6), sq(MORI, 'samurai', 8), sq(MORI, 'ashigaru', 14), sq(MORI, 'gun', 6)]);
    for (const g of [F.aka, F.hata, F.mori]) { g.dmgMult = 1.1; g.defMult = 1.2; }

    // ---- 敵（徳川方）：茶臼山の正面の越前勢・天王寺口の本多の先手・二陣・家康の旗本 ----
    F.echizen = enemyGroup(rt, { fixed: true, faction: 'tokugawa', name: '松平忠直の越前勢', anchor: { x: ECHI.x, z: ECHI.z }, facing: S, width: 14, aggro: 20, seekRange: 26, order: 'hold', noRout: true },
      [sq(TOKU, 'busho', 1, { name: '松平忠直', hat: 'kabuto_shika', horse: true }), sq(TOKU, 'samurai', 6), sq(TOKU, 'ashigaru', 12), sq(TOKU, 'gun', 6)]);
    F.honda = enemyGroup(rt, { fixed: true, faction: 'tokugawa', name: '本多忠朝の先手', anchor: { x: FRONT.x, z: FRONT.z }, facing: S, width: 12, aggro: 18, seekRange: 26, order: 'hold', noRout: true },
      [sq(HONDA, 'busho', 1, { name: '本多忠朝', hat: 'kabuto_m', horse: true }), sq(HONDA, 'samurai', 5), sq(HONDA, 'ashigaru', 14), sq(HONDA, 'gun', 5)]);
    F.nijin = enemyGroup(rt, { fixed: true, faction: 'tokugawa', name: '榊原康勝の二陣', anchor: { x: NIJIN.x - 20, z: NIJIN.z + 10 }, facing: S, width: 12, aggro: 20, seekRange: 26, order: 'hold', noRout: true },
      [sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'busho', 1, { name: '榊原康勝', hat: 'kabuto_m', horse: true }), sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'samurai', 5), sq(TOKU, 'ashigaru', 10), sq(TOKU, 'gun', 4)]);
    F.hon = enemyGroup(rt, { fixed: true, faction: 'tokugawa', name: '大御所の旗本', anchor: { x: HON.x, z: HON.z + 5 }, facing: S, width: 14, aggro: 14, seekRange: 18, order: 'hold', noRout: true },
      [sq(TOKU, 'busho', 1, { name: '徳川家康', horse: true }), sq(TOKU, 'busho', 1, { name: '本多正純', horse: true, hat: 'kabuto_m', flag: 'honda' }), sq(TOKU, 'samurai', 16), sq(TOKU, 'gun', 6)]);
    F.ieyasu = F.hon.units.find((u) => u.name === '徳川家康');
    if (F.ieyasu) { F.ieyasu.invuln = false; F.ieyasu.hp = F.ieyasu.maxHp = Math.round((F.ieyasu.maxHp || 190) * 2); }
    for (const g of [F.echizen, F.honda, F.nijin]) { g.dmgMult = 0.6; g.defMult = 0.9; }
    F.hon.dmgMult = 0.7;

    rt.obj('main', '家康を討つ', 'main');
    rt.after(1.5, () => rt.say('真田信繁', '狙うは家康の首ただ一つ！', 3));
    rt.after(6, () => this.charge(rt));
  },

  // 赤備えと毛利の隊を家康の居所へ駆けさせる（天王寺の charge と同じ仕組み：持ち場を家康に置き、行く手を塞ぐ者とだけ斬り合う）
  charge(rt) {
    const F = rt.flags;
    const at = F.ieyasu?.alive ? F.ieyasu.pos : HON;
    for (const g of [F.aka, F.hata, F.mori]) {
      if (!alive(g)) continue;
      g.allOutRun = true; g.order = 'hold'; g._charge = true; g.stay = true; g.dest = null; g.path = null; g.focus = null;
      g.anchor = { x: at.x, z: at.z }; g.aggro = 12; g.seekRange = 16; g.morale = 100;
    }
    F.charged = true;
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    F.t += dt;
    // 本陣の行き先は家康の動きに付いていく（三秒ごと）
    if (F.charged && (F._reT = (F._reT || 0) + dt) > 3) { F._reT = 0; this.charge(rt); }
    // 本人が本陣へ迫ると家康は馬に乗り、旗本ごと南へ少し退く（金扇の馬印が倒れた史実）。逃げ切らせはしない
    const P = rt.player?.u, I = F.ieyasu;
    if (!F.flee && P && I?.alive && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 34) {
      F.flee = true;
      try { if (!I.mounted && rt.army.setMounted) rt.army.setMounted(I, true); } catch (e) { /* 馬が無くても進む */ }
      if (alive(F.hon)) F.hon.anchor = { x: HON.x + 8, z: HON.z + 28 };
      // 旗本の半ばは崩れて逃げる（史実：家康の旗本は総崩れで三里も逃げた）
      if (alive(F.hon)) { let k = 0; for (const o of F.hon.units) if (o.alive && o !== I && !o.name && k++ % 2 === 0) { o.fleeing = true; o.moraleFleeDir = { x: 0.2, z: 1 }; o.target = null; o.atk = null; } }
      rt.say('旗本', '上様、お退きを！', 2.6);
    }
  },

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v === F.ieyasu && !F.ending) this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.step = 2;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.side.push('徳川家康を討った'); }, '家康を討ち取った');
    for (const g of rt.army.groups) if (g.team === 1 && alive(g)) { g.fleeing = true; g.routed = true; for (const u of g.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: 1 }; u.target = null; u.atk = null; } }
    rt.player.u.invuln = true;
    rt.after(2.5, () => rt.say('真田信繁', '日の本一の兵、ここにあり！', 3.2));
    rt.finish({ scriptedEnd: true }, 9);
  },
});
// bot の頭（act bot で確かめる）：家康へまっすぐ駆け、行く手を塞ぐ者だけ払う。命が三割五分を切ったら茶臼山の側へ退いて息を整える
x15_sanada.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  const R = b._x15 || (b._x15 = { rest: false, t: b.t, x: u.pos.x, z: u.pos.z, until: 0, wx: 0, wz: 0, n: 0 });
  if (b.t < R.until) { goTo(p, inp, R.wx, R.wz, 2); return; }
  if (b.t - R.t >= 15) { if (Math.hypot(u.pos.x - R.x, u.pos.z - R.z) < 3 && !u.hit) { R.n++; R.wx = u.pos.x + (R.n % 2 ? 14 : -14); R.wz = u.pos.z + 4; R.until = b.t + 5; } R.t = b.t; R.x = u.pos.x; R.z = u.pos.z; }
  if (!R.rest && u.hp < u.maxHp * 0.35) R.rest = true;
  if (R.rest) { if (u.hp > u.maxHp * 0.8) R.rest = false; else { goTo(p, inp, u.pos.x - 30 * Math.sin(N2S), u.pos.z - 30 * Math.cos(N2S), 2); return; } }
  const I = F.ieyasu;
  const hit = (t, r = 2.6) => {
    const a = strikeTarget ? strikeTarget(b, 4) : null, e = a && a !== t && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 3.5 ? a : t;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > r) { goTo(p, inp, e.pos.x, e.pos.z, 2); return; }
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (patientStrike) patientStrike(p, inp, e, d); else if (Math.random() < 0.5) inp.leftPressed = true;
  };
  if (I?.alive && Math.hypot(I.pos.x - u.pos.x, I.pos.z - u.pos.z) < 14) { hit(I, p.mounted ? 3.2 : 2.6); return; }
  const e0 = b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.invuln);
  if (e0) { hit(e0); return; }
  const at = I?.alive ? I.pos : HON;
  goTo(p, inp, at.x, at.z, 2);
};
STAGES.x15_sanada = [['家康を討つ']];

export { x15_sanada };
export default x15_sanada;
