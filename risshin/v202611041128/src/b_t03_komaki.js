// ======================================================================
// 豊臣編　小牧の対陣（天正十二年三月十七日〜四月）。調べは docs/battle_refs/t03_komaki.md。
// 長久手（四月九日）は別の戦（b_t03b_nagakute.js）。AR の 2（kaito 11/3）：小牧と長久手を分ける。
// 11/4 jin（布陣の作り直し）：羽黒の戦いは、南（小牧山の方）から奥平信昌・榊原康政の先手が正面に、
//   酒井忠次の手が西から回り込んで退き道を断とうとし、森勢は北の犬山へ退いた（森 三千・徳川 五千＝およそ 3:5）。
// ①羽黒：森長可の陣の前で、南から寄せる奥平・榊原の先手を押し返す（二十秒後、西から酒井の手が横を突く）
// ②森長可の鶴丸の旗と共に、八幡林の北の犬山への道の口まで退く（追われる。森勢は主人公を待たずに退く）
// ③十日後・二重堀の砦（楽田の秀吉の本陣の前）：小牧山から寄せる徳川の手を、木戸の前で通さない
// ④砦の兵と木戸を出て、堀の前の徳川の鉄砲組を追い払う。最後に池田恒興が三河への中入りを言い出す
// 負け：森長可が討たれる・木戸を破られる・連れた兵がほとんど討たれる。
// 家康・信雄は南の小牧山の本陣、秀吉は北の楽田の本陣で、陣幕の中の床几に座り、旗本に守られ前に出ない（AR の 3・AV の 7）。
// 名のある将（森長可・奥平信昌・酒井忠次）は馬上で、旗本の組に囲まれる。行き先は金の▼一つで、段ごとに場所は固定。
// 旗は戦った家だけ：羽柴（秀吉の砦）・森（鶴丸）・徳川（奥平・榊原・酒井を含む）・信雄（本陣だけ）。
// 向き：西（−x）が楽田と二重堀の砦、東（+x）が羽黒の八幡林、北（−z）が犬山、南（+z）の奥が小牧山。間隔は縮めた復元。
// ======================================================================
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';

const XW = 158, ZN = -120, ZS = 120;                   // 見えない壁
const ROAD = [[156, -8], [110, -10], [60, -22], [10, -26], [-40, -22], [-70, -18], [-156, -24]];
const HAGURO = { x: 110, z: -10 };                     // 羽黒・八幡林の森長可の陣
const NROAD = [[110, -10], [106, -48], [98, -92], [94, -150]];   // 八幡林から北の犬山への道
const INU = { x: 98, z: -96 };                         // 犬山への道の口（森勢の退く先）
const RAKUDA = { x: -74, z: -76 };                     // 楽田の秀吉の本陣（砦の北の後ろ）
const FORT = { x: -70, z: -18 };                       // 二重堀の砦（楽田の前）
const GATE = { x: -70, z: -4 };                        // 砦の南の木戸
const FIELD = { x: -70, z: 40 };                       // 堀の前の野（徳川の鉄砲組が出る所）
const KOMAKI = { x: -40, z: 190 };                     // 小牧山（見えない壁の外）
const HONJIN = { x: -40, z: 150 };                     // 家康・信雄の本陣（小牧山の麓・壁の外）
const REAL_CAP = 220;
export const ARMOR = KIT.ARMOR;
export const TOKU = { armor: ARMOR.tokugawa, cloth: 0x5a4632, lace: 0x7a5a3a, flag: 'tokugawa' };
// 一つの家の旗を、組の全員に付ける（allyGroup の既定は織田の旗。羽柴方は家の旗を明かす）
export const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(s.o || {}) } }));
export const dressT = (list, kit = TOKU) => list.map((s) => ({ ...s, o: { ...kit, ...(s.o || {}) } }));
export const foeKnot = (n = 9, kit = TOKU) => dressT([{ type: 'ashigaru', n: Math.ceil(n * 0.5), o: { flagScale: 1 } }, { type: 'ashigaru', n: Math.floor(n * 0.2) },
  { type: 'gun', n: Math.max(1, Math.floor(n * 0.15)) }, { type: 'samurai', n: Math.max(1, n - Math.ceil(n * 0.5) - Math.floor(n * 0.2) - Math.max(1, Math.floor(n * 0.15))) }], kit);
export const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
export const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0) : 0);
// 本物の兵の数（壁の外の本陣は、描く数がほぼ要らないので数えない）
export const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && u.type !== 'porter' && !u.group?.honjin ? 1 : 0), 0);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 本陣（床几の大将は陣幕の中に座る）の前を囲む旗本。動かず、討てない
function campGuard(rt, team, at, facing, name, flag, n, faction) {
  const mk = team ? enemyGroup : allyGroup;
  const list = [{ type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } }, { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }];
  const g = mk(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99, ...(faction ? { faction } : { fullStrength: true }) },
    team ? dressT(fl(list, flag)) : fl(list, flag));
  g.honjin = true;
  for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  return g;
}
// 名のある敵の将：馬上で、旗本（侍・足軽・鉄砲）の組に囲まれて、先手の後ろを進む。討てない
function foeGeneral(rt, name, at, n = 14) {
  const g = enemyGroup(rt, { faction: 'tokugawa', name: name + 'の旗本', anchor: { ...at }, facing: Math.PI, width: 5, formation: 'line', morale: 95, dmgMult: 0.4,
    order: 'hold', seekRange: 10, aggro: 6, speed: 3.4, noRout: true },
  dressT([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } },
    { type: 'ashigaru', n: Math.round(n * 0.4), o: { flagScale: 1 } }, { type: 'gun', n: Math.max(1, n - Math.round(n * 0.45) - Math.round(n * 0.4)) }]));
  g.leader = g.units.find((u) => u.name === name);
  rt.flags.waves.push(g);
  return g;
}
// 時が飛ぶ所：本人と連れた兵を次の持ち場のそばへ移す（無駄に歩かせない・AT の 10）
function warpTo(rt, x, z, heading) {
  const P = rt.player.u, W = rt.world;
  const put = (u, dx, dz) => { u.pos.x = x + dx; u.pos.z = z + dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.target = null; u.moveTo = null; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } };
  put(P, 0, 0);
  if (rt.player.vel) { rt.player.vel.x = 0; rt.player.vel.z = 0; }
  rt.player.lock = null;
  if (heading != null) rt.player.heading = heading;
  let i = 0;
  for (const g of [...(rt.squadGroups || []), rt.flags.men]) if (g && g.units) {
    for (const u of g.units) if (u.alive && !u.isPlayer) { put(u, -5 + (i % 6) * 1.6, -3 - Math.floor(i / 6) * 1.5); i++; }
    g.anchor = { x, z: z - 4 };
  }
}

// 家康・信雄の本陣（AR の 3）：金扇の馬印のまわりに旗本・馬廻の侍と足軽・鉄砲。動かず、前に出ない。討てない
export function ieyasuHonjin(rt, at, facing) {
  const o = { faction: 'tokugawa', facing, width: 9, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99 };
  const ie = enemyGroup(rt, { ...o, name: '徳川家康の旗本', anchor: { x: at.x, z: at.z } },
    dressT([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 18, o: { keep: true } },
      { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 6 }]));
  const nb = enemyGroup(rt, { ...o, faction: 'nobukatsu', name: '織田信雄の旗本', anchor: { x: at.x + 16, z: at.z + 4 }, width: 6 },
    [{ type: 'busho', n: 1, o: { name: '織田信雄', invuln: true, horse: true, flag: 'oda' } }, { type: 'samurai', n: 8, o: { flag: 'oda', keep: true } }, { type: 'ashigaru', n: 6, o: { flag: 'oda', flagScale: 1 } }]);
  for (const g of [ie, nb]) { g.honjin = true; for (const u of g.units) { u.invuln = true; u.noTarget = true; } }
  return [ie, nb];
}
// 見えない壁：本陣（壁の外）の兵だけは外に置いたまま
export function walls(rt, xw, zn, zs) {
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.group?.honjin) continue;
    if (u.pos.x > xw) u.pos.x = xw; else if (u.pos.x < -xw) u.pos.x = -xw;
    if (u.pos.z > zs) u.pos.z = zs; else if (u.pos.z < zn) u.pos.z = zn;
  }
}

function height(x, z) {
  // 尾張北部の平らな田と低い丘。羽黒は東の林の高み、小牧山は南の壁の外に独りで立つ山
  let h = 1.2 * Math.sin(x * 0.02 + 0.4) * Math.cos(z * 0.017 - 0.3) + 0.6 * Math.sin(x * 0.06 - z * 0.05);
  h += 4 * gauss(x, z, 130, -40, 2200);                    // 八幡林の高み
  h += 2 * gauss(x, z, RAKUDA.x, RAKUDA.z, 700);           // 楽田城の小高い所
  h += 3 * gauss(x, z, FORT.x - 8, FORT.z - 14, 900);      // 砦の小高い所
  h += 46 * gauss(x, z, KOMAKI.x, KOMAKI.z, 1500);         // 小牧山（高さ八十六 m の独立した山を縮めて）
  const r = Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, NROAD));
  if (r < 6) h *= 0.7 + r * 0.05;
  return h;
}

const STAGE_TEXT = ['',
  '羽黒の森長可様の陣の前で、南から寄せる奥平・榊原の先手を押し返す',
  '森長可様と共に、八幡林の北の犬山への道の口まで退く',
  '二重堀の砦の柵の切れ目に立ち、寄せる徳川勢から守る',
  '砦の兵と堀の前の田へ出て、徳川の鉄砲組を崩す'];
const FRONT1 = { x: HAGURO.x, z: HAGURO.z + 10 };   // 森の陣の前（南の田に面した所）
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03_komaki = {
  spawn: { x: HAGURO.x - 6, z: HAGURO.z + 6, heading: 0 },
  minutes: 8,
  compactIntro: true,
  introText: () => '羽黒の森長可様の陣に、夜明けの徳川勢が寄せてくる。',
  missionSingleLine: true,
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,   // 作り物の乱戦を足さない（AR の 7）
  goalSignOnly: true,  // 行き先は頭上の金の▼一つだけ（地面の矢印・持ち場の輪を出さない。BH の 6）
  kumiLead: false,     // 組頭の青い印も出さない（印は一つ。AV の 15）
  noLeaderFollow: true,
  noHatamotoMass: true,   // 将の後ろの軽い作りの備を置かない（見える兵は全部本物。AF）
  frontlineDensity: false,   // 小勢を足さない（織田の旗の小勢が出た・本物の兵の枠を段の寄せに残す）
  alwaysMelee: false,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending) return null;
    // 行き先は段ごとに固定（人や組の動きで動かさない。AW の 3・BK の 4）
    const p = F.stage === 1 ? FRONT1 : F.stage === 2 ? INU : F.stage === 3 ? GATE : FIELD;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 2 ? 12 : 8;
    return PIN;
  },
  world: {
    seed: 15843,
    time: 'morning',
    mist: 0.35,
    groundHalf: 220,
    height,
    paths: [{ pts: ROAD, w: 3.5 }, { pts: NROAD, w: 3 }],
    patchyGround: true,
    tint(x, z, h, c) {
      const k = 0.5 + 0.5 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.04);
      c.setRGB(c.r * (0.86 + k * 0.28), c.g * (0.88 + k * 0.24), c.b * (0.8 + k * 0.24));
    },
    // 八幡林・小牧山の木々・楽田の方の林
    groves: [
      { x: 132, z: -42, r: 28, n: 110, kind: 'matsu' },
      { x: 150, z: 20, r: 14, n: 30 },
      { x: KOMAKI.x, z: KOMAKI.z, r: 30, n: 90 },
      { x: -120, z: -70, r: 24, n: 50, kind: 'sugi' },
      { x: 30, z: -70, r: 16, n: 30 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, HAGURO) < 16 || dist({ x, z }, FORT) < 26 || dist({ x, z }, RAKUDA) < 18 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, NROAD) < 6,
    trees: 200,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 60 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? z > 170 || x > 170 : x < -170),
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = [];
    const me = rt.G?.name || '自分';
    // 森長可と馬廻（討たれたら負け）
    F.moriG = allyGroup(rt, { name: '森長可の旗本', fullStrength: true, anchor: { ...HAGURO }, facing: 0, width: 6, aggro: 6, speed: 4.4, order: 'hold', noRout: true, dmgMult: 0.55 },
      fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true } }, { type: 'samurai', n: 10 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
    F.moriU = F.moriG.units.find((u) => u.name === '森長可');
    if (F.moriU) { F.moriU.maxHp = F.moriU.hp = 900; F.moriU.invuln = true; }
    // 森勢の先手（陣の前の田に向けて槍と鉄砲を並べる）と、西の脇の備（退き道の側を固める）
    F.moriFront = allyGroup(rt, { name: '森勢の先手', fullStrength: true, anchor: { x: HAGURO.x + 4, z: HAGURO.z + 16 }, facing: 0, width: 10, formation: 'line', aggro: 10, seekRange: 14, speed: 4.2, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 6 }, { type: 'samurai', n: 3 }], 'tsuru'));
    F.moriSide = allyGroup(rt, { name: '森勢の脇備', fullStrength: true, anchor: { x: HAGURO.x - 18, z: HAGURO.z - 2 }, facing: -Math.PI / 2, width: 6, formation: 'line', aggro: 10, seekRange: 14, speed: 4.2, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 3 }, { type: 'samurai', n: 2 }], 'tsuru'));
    // 連れた兵（主人公の組）
    F.men = allyGroup(rt, { name: '森隊の足軽', fullStrength: true, anchor: { x: HAGURO.x - 6, z: HAGURO.z + 10 }, facing: 0, width: 5, aggro: 10, speed: 3.9, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }], 'tsuru'));
    F.men.ai = true;
    F.menN0 = aliveN(F.men);
    // 二重堀の砦：南向きの柵と木戸（羽柴の砦の兵が中に）
    const L = FORT.x - 34, R = FORT.x + 34, Z = GATE.z;
    F.saku = [...wallLine(rt, [[L, Z], [GATE.x - 4, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[GATE.x + 4, Z], [R, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[L, Z - 30], [L, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[R, Z], [R, Z - 30]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' })];
    F.fort = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の兵', anchor: { x: FORT.x, z: FORT.z - 4 }, facing: 0, width: 12, aggro: 6, order: 'hold', fixed: true, noRout: true, dmgMult: 0.45 },
      fl([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }], 'toyotomi'));
    // 楽田の秀吉の本陣（砦の北の後ろ）：陣幕の中の床几に秀吉が座り、幕の前を旗本が固める
    KIT.honjin(rt, RAKUDA.x, RAKUDA.z, { mon: 'toyotomi', fire: false });
    F.rakuda = campGuard(rt, 0, { x: RAKUDA.x, z: RAKUDA.z + 12 }, 0, '羽柴秀吉の旗本', 'toyotomi', 22);
    // 小牧山の家康・信雄の本陣（壁の外。床几に座り、旗本が前を固める。動かない）
    KIT.honjin(rt, HONJIN.x, HONJIN.z + 6, { mon: 'tokugawa', fire: false, yoroi: false });
    F.honjin = [campGuard(rt, 1, { x: HONJIN.x, z: HONJIN.z - 8 }, Math.PI, '徳川家康の旗本', 'tokugawa', 30, 'tokugawa'),
      campGuard(rt, 1, { x: HONJIN.x + 22, z: HONJIN.z }, Math.PI, '織田信雄の旗本', 'oda', 10, 'nobukatsu')];
    rt.obj('main', STAGE_TEXT[1], 'main');
    const T = [['森長可', '小牧山は家康に取られたか。ならば羽黒から睨んでくれる', 0.5], [me, '殿、南の田の向こうに旗が……', 3.6],
      ['物見', '徳川勢！　奥平・榊原の旗にござる！', 6.2], ['森長可', '鬼武蔵の陣に朝駆けとは。者ども、槍を取れ！', 8.6]];
    for (const [who, s, t] of T) rt.after(t, () => rt.say(who, s, 2.7));
    rt.after(10.4, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n) {
    const F = rt.flags;
    F.stage = n; F.st0 = rt.t;
    rt.obj('main', STAGE_TEXT[n], 'main');
    if (n === 1) {
      // 奥平信昌・榊原康政の先手：南の田から正面に三つの組で（後ろに奥平の旗本）
      sfx('horagai', 0.9);
      F.front = [0, 1, 2].map((i) => this.wave(rt, { x: HAGURO.x - 16 + i * 16, z: HAGURO.z + 52 + (i % 2) * 6 }, 14, FRONT1, i === 2 ? '榊原康政の手' : '奥平信昌の手'));
      F.okuG = foeGeneral(rt, '奥平信昌', { x: HAGURO.x - 6, z: HAGURO.z + 74 }, 12);
      F.frontN = F.front.reduce((s, g) => s + aliveN(g), 0);
      rt.army.play('toki', { x: HAGURO.x, z: HAGURO.z + 46 }, 1.4);
      // 二十秒後、西の田から酒井忠次の手が横へ回り、北の犬山への退き道を断ちにかかる（挟まれる）
      rt.after(20, () => {
        if (F.stage !== 1) return;
        F.flank = [0, 1].map((i) => this.wave(rt, { x: 34, z: -18 - i * 18 }, 14, i ? { x: 104, z: -40 } : { x: HAGURO.x - 14, z: HAGURO.z }, '酒井忠次の手'));
        F.sakaiG = foeGeneral(rt, '酒井忠次', { x: 18, z: -26 }, 12);
        F.sakaiG.order = 'move'; F.sakaiG.dest = { x: 60, z: -28 };
        rt.army.play('toki', { x: 40, z: -24 }, 1.4);
        rt.say('物見', '西の田からも！　酒井忠次の旗じゃ、退き道を断たれる！', 2.8);
      });
    } else if (n === 2) {
      rt.say('森長可', '前と横からでは持たぬ。犬山へ退く！　殿は鉄砲で防げ', 2.8);
      // 森勢は主人公を待たずに北の道を退く（AY の 5）。先手と脇備がその後ろを守る
      F.moriU.invuln = true;
      for (const [g, dx, dz] of [[F.moriG, 0, 0], [F.moriFront, 4, 14], [F.moriSide, -6, 8]]) {
        if (!live(g)) continue;
        // 森長可の旗本は斬り合いに留まらず退く（retreat）。先手と脇備は打ち合いながら後ろを守って下がる（move）
        g.order = g === F.moriG ? 'retreat' : 'move'; g.dest = { x: INU.x + dx, z: INU.z + dz }; g.speed = 3.6; g.fixed = false;
      }
      // 追う徳川勢は鶴丸の旗（森長可）を狙う。退く者を背から突くので、斬り合いより手は軽い
      F.chaseHit = 0.3;
      for (const g of F.waves) if (live(g)) { g.order = 'attack'; g.seekRange = 50; g.focus = F.moriU; g.dmgMult = Math.min(g.dmgMult ?? 1, F.chaseHit); }
      if (F.okuG) { F.okuG.order = 'move'; F.okuG.dest = { x: HAGURO.x, z: HAGURO.z + 8 }; }
      rt.after(12, () => { if (F.stage === 2) this.wave(rt, { x: 70, z: -60 }, 12, null, '酒井忠次の手', F.moriU); });
      rt.after(28, () => { if (F.stage === 2) this.wave(rt, { x: 140, z: -20 }, 12, null, '榊原康政の手', F.moriU); });
    } else if (n === 3) {
      // 十日後（時が飛ぶ：画面の真ん中に次の行いを出す。AT の 7）。本人と連れた兵を砦の木戸の内へ移す
      for (const g of F.waves) for (const u of g.units) if (u.alive) rt.army.despawn(u);
      F.waves = [];
      for (const g of [F.moriG, F.moriFront, F.moriSide]) if (g) for (const u of g.units) if (u.alive) rt.army.despawn(u);
      warpTo(rt, GATE.x, GATE.z - 6, 0);
      rt.banner('十日後　二重堀の砦', '柵の切れ目を守れ');
      rt.after(2.5, () => rt.say('羽柴秀吉', '家康は小牧山から出て来ぬ。こちらも砦を固めて待て', 3.2));
      F.gateWaves = [];
      // 小牧山の麓から田を渡って寄せる三つの組（物見の見える所から。待つだけの間を作らない）
      const send = (i) => { if (F.stage !== 3) return; const g = this.wave(rt, { x: GATE.x - 22 + i * 22, z: 78 + (i % 2) * 8 }, 12, { x: GATE.x, z: GATE.z + 2 }, '徳川勢'); if (g) F.gateWaves.push(g); };
      rt.after(4, () => { send(1); rt.army.play('toki', { x: GATE.x, z: 70 }, 1.2); rt.say('物見', '小牧山から徳川の手が寄せて来る！', 2.6); });
      rt.after(16, () => send(0));
      rt.after(30, () => send(2));
      F.inside = 0;
    } else if (n === 4) {
      rt.say('羽柴秀吉', '堀の前に鉄砲を並べおった。追い払え', 2.8);
      F.guns = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の鉄砲組', anchor: { ...FIELD }, facing: Math.PI, width: 10, formation: 'line', morale: 90, dmgMult: 0.35,
        order: 'hold', seekRange: 30, aggro: 10, noRout: false },
      dressT([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'samurai', n: 2 }]));
      F.gunsN = aliveN(F.guns);
      F.waves.push(F.guns);
      // 砦の兵の一手が木戸を出て、本人と一緒に堀の前へ押し出す（味方の隊も目標へ動く。BK の 1）
      F.sortie = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の打って出る組', fullStrength: true, anchor: { x: GATE.x, z: GATE.z + 4 }, facing: 0, width: 6, formation: 'line', aggro: 12, seekRange: 30, speed: 4.2, order: 'attack', noRout: true, dmgMult: 0.5 },
        fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 3 }], 'toyotomi'));
      F.sortie.dest = { x: FIELD.x, z: FIELD.z - 4 };
      rt.army.play('toki', { x: GATE.x, z: GATE.z + 4 }, 1.2);
    }
  },

  // 徳川勢の一組。to へ寄せ、focus があればその者を狙う
  wave(rt, at, n, to, name = '徳川勢', focus) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 4, formation: 'line', morale: 85, dmgMult: 0.42,
      order: 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n));
    if (to) g.dest = { x: to.x, z: to.z };
    if (F.stage === 2 && F.chaseHit) g.dmgMult = F.chaseHit;
    if (F.stage === 3) g.dmgMult = 0.36;   // 木戸は柵の陰から迎える（柵越しの打ち合い）
    F.waves.push(g);
    return g;
  },
  nameFoe(g, name) {
    const u = g && (g.units.find((q) => q.alive && q.type === 'samurai') || g.units.find((q) => q.alive));
    if (u) { u.name = name; u.invuln = true; u.horse = true; }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const P = rt.player.u;
    walls(rt, XW, ZN, ZS);
    // 連れた兵は主人公の脇に付く
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.men) && F.men.center();
      if (c) {
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 8) { F.men.order = 'move'; F.men.dest = { x: P.pos.x + 2, z: P.pos.z + 2 }; F.men.speed = 4.2; }
        else { F.men.order = 'attack'; F.men.seekRange = 14; }
      }
    }
    if (F.moriU && !F.moriU.alive && F.stage <= 2) return this.lose(rt, '森長可様が討たれた');
    if (F.menN0 >= 3 && aliveN(F.men) < Math.ceil(F.menN0 / 6)) return this.lose(rt, '連れた兵がほとんど討たれた');
    const el = rt.t - F.st0;
    if (F.stage === 1) {
      // 森長可は陣の旗の下に構え、田へ追って出ない（大将が前の斬り合いへ出ない）
      if ((F.moriT = (F.moriT || 0) - dt) <= 0 && F.moriU?.alive) {
        F.moriT = 0.6;
        const away = dist(F.moriU.pos, HAGURO) > 10;
        if (away) { F.moriG.order = 'retreat'; F.moriG.dest = { ...HAGURO }; } else if (F.moriG.order === 'retreat') F.moriG.order = 'hold';
      }
      const left = F.front.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 30 && left <= F.frontN * 0.4) || el > 75) {
        rt.award((t) => t.side.push('羽黒で奥平・榊原の先手を押し返した'), '羽黒で奥平・榊原の先手を押し返した');
        this.stage(rt, 2);
      }
    } else if (F.stage === 2) {
      // 森長可は旗本と北の犬山への道を退く（本人を待たない）。止まった時は行き先を言い直す
      const M = F.moriU;
      if ((F.moriT = (F.moriT || 0) - dt) <= 0) {
        F.moriT = 0.6;
        if (live(F.moriG) && dist(M.pos, INU) > 10) { F.moriG.order = 'retreat'; F.moriG.dest = { x: INU.x, z: INU.z }; }
        // 本人が殿（しんがり）として近くにいる間は、追手は森長可に届かない。離れて見捨てると討たれ得る
        M.invuln = dist(M.pos, P.pos) < 40;
      }
      if (dist(M.pos, INU) < 16) {
        rt.say('森長可', '……三百も討たれたか。この借りは返す', 2.6);
        rt.award((t) => t.side.push('森長可を犬山への道まで退かせた'), '森長可を犬山への道まで退かせた', M.pos);
        this.stage(rt, 3);
      } else if (el > 110) { M.pos.x = INU.x; M.pos.z = INU.z + 4; }   // 道で詰まった時の保険
      // 遠く後ろ（南）の敵は去らせる
      if ((F.gcT = (F.gcT || 0) - dt) <= 0) { F.gcT = 1; for (const g of F.waves) for (const u of g.units) if (u.alive && !u.gone && !u.isSub && !g.leader && u.pos.z - P.pos.z > 80) rt.army.despawn(u); }
    } else if (F.stage === 3) {
      // 木戸を破られる：徳川の兵が砦の中（木戸より北）に六人
      let inside = 0;
      for (const g of F.gateWaves) for (const u of g.units) if (u.alive && !u.gone && u.pos.z < GATE.z - 3 && Math.abs(u.pos.x - GATE.x) < 34) inside++;
      if (inside >= 6) return this.lose(rt, '木戸を破られた');
      const left = F.gateWaves.reduce((s, g) => s + aliveN(g), 0);
      if ((F.gateWaves.length >= 3 && left <= 4) || el > 120) {
        for (const g of F.gateWaves) if (live(g)) { g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 }; }
        rt.say('物見', '徳川勢、小牧山へ引いていく', 2.4);
        rt.award((t) => t.side.push('二重堀の木戸を守った'), '二重堀の木戸を守った');
        this.stage(rt, 4);
      }
    } else if (F.stage === 4) {
      const n = aliveN(F.guns);
      if (n <= F.gunsN * 0.35 || F.guns.routed || el > 100) this.win(rt);
    }
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.failWhy = why;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    if (live(F.guns)) { F.guns.order = 'retreat'; F.guns.dest = { x: FIELD.x, z: ZS + 20 }; }
    rt.award((t) => t.side.push('堀の前の鉄砲組を追い払った'), '堀の前の鉄砲組を追い払った');
    rt.banner('小牧のにらみ合い', 'どちらも砦から出ない');
    rt.say('池田恒興', '睨み合うたままでは埒があかぬ。家康の留守の三河を突けば、家康は小牧を捨てて戻る', 3.6);
    rt.after(4, () => rt.say('森長可', '羽黒の借り、三河で返す。わしも行く', 3));
    rt.after(7.4, () => rt.say('羽柴秀吉', 'よかろう。秀次を総大将に、二万で回り込め', 3.2));
    rt.finish({ scriptedEnd: true }, 12);
  },

  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = b.army.nearestEnemy(u, F.stage === 2 ? 6 : 10, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = FIELD;
    if (F.stage === 1) t = FRONT1;
    else if (F.stage === 2) t = F.moriU?.alive ? { x: F.moriU.pos.x + 2, z: F.moriU.pos.z + 3 } : INU;
    else if (F.stage === 3) t = { x: GATE.x, z: GATE.z - 2 };   // 木戸の内（柵の陰）に立つ
    else if (live(F.guns)) t = F.guns.center();
    goTo(p, inp, t.x, t.z, 2);
  },
};
t03_komaki.sides = { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '徳川・織田信雄勢', mon: 'tokugawa' } };
t03_komaki.force = () => ({ a: 3000, a0: 3000, b: 5000, b0: 5000 });
t03_komaki.date = () => '天正十二年三月十七日　夜明け';
t03_komaki.history = '天正十二年（1584）、織田信雄は徳川家康と組んで羽柴秀吉と手を切った。秀吉方に付いた池田恒興が犬山城を落とすと、家康は先に小牧山を取って堀と土塁で固めた。三月十七日の朝、小牧山を狙って羽黒に陣を張った森長可は、奥平信昌・榊原康政の先手に前から、回り込んだ酒井忠次の手に横から襲われ、三百ほどを失って犬山へ退いた（羽黒の戦い・徳川方およそ五千）。その後、秀吉は楽田に本陣を置き、二重堀などの砦を並べて小牧山の家康・信雄とにらみ合った。どちらも砦から出ず、物見と鉄砲の小競り合いが続いた。膠着を破ろうと、池田恒興は家康の留守の三河を突く中入りを言い出す。羽黒と二重堀の間隔は縮めた復元で、主人公の組の動きは遊びのための筋書き。';
t03_komaki.famous = [];
// bot：森長可と退く段は、打ち込みを受けても歩みを止めない
t03_komaki.botGuardFlee = (b) => b.flags.stage === 2;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03_komaki = STAGE_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
withGuard(t03_komaki);

export { t03_komaki };
export default t03_komaki;
