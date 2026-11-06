// ======================================================================
// 徳川編 16　秘密の戦「天下分け目の淀の野」（もしもの戦・元和元年 1615 五月）
// 筋書きの正：docs/chapter3_tokugawa.md の「出世と軍勢・秘密の最後の戦（kaito 11/1 夜）」。手本の調べ：docs/battle_refs/k16_secret.md
// 徳川編の15戦にすべて勝つと開く（tokugawa_secret.js）。史実ではない。
// 大坂の陣の後、大名になった主人公が二万を率いて、京へ戻る家康の三万と淀の野で戦う。家康を討ち、征夷大将軍に任じられる。
// 見せかけの軍勢は置かない（AA・AF・AP9・AQ6・AT4）。見える兵は全部本物で、初めから持ち場に並ぶ（段で湧かせない。AT17）。
//   本物の兵：自分の側およそ八十・徳川方およそ百五十（二万対三万の二対三）
// 徳川方は五重：京街道の藤堂の先手（渡辺勘兵衛）→東の井伊の赤備え→丘の下の鉄砲衆→本多正純の旗本→丘の上の家康の本陣（床几）
//   総大将の家康と藤堂高虎は後ろの本陣で座ったまま動かない（AR3・AT3）。高虎は討てない
// 段（目標ごとの刻限）：①勘兵衛の先手 ②直孝の赤備え ③鉄砲衆 ④正純の旗本 ⑤陣幕の内の家康
// 勝った後：勅使が将軍の位を告げ、出世の道（足軽→…→天下人→征夷大将軍）を一段ずつ灯して締める。
// 向き：北が -z（家康の本陣・京の方）。自分の軍は南（+z）から北へ。
// ======================================================================
import { nobori, tawara, hut } from './props.js';
import { RANKS, LADDER } from './state.js';
import { STAGES, KILLS, cut } from './stages.js';
import { GENERALS } from './units_data.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { timeslipField } from './timeslip_field.js';

const ID = 'k16_secret';
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
// 井伊は朱漆の具足と金の天衝（井伊家伝来の具足）。ほかは黒の具足
give('井伊直孝', { armor: 0x8e1f16, lace: 0xb8342a, hat: 'kabuto_tentsuki', haori: 0x7a1a12, mon: 'ii', tack: 0x6a1a12,
  face: face({ age: 25, jaw: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.1, goat: 0, side: 0, stub: 0.3 } }) });
give('渡辺勘兵衛', { armor: 0x1e1c1a, lace: 0x4a3a2a, hat: 'kabuto_m', haori: 0x2a241e, mon: 'todo',
  face: face({ age: 50, gaunt: 0.35, brow: 1.4, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.4, side: 0.4, stub: 0.9 } }) });
give('本多正純', { armor: 0x1c1a18, lace: 0x2a2a3a, hat: 'kabuto_m', haori: 0x2a2a30, mon: 'honda',
  face: face({ age: 50, beard: { mus: 0.5, musW: 1, droop: 0.3, goat: 0.2, side: 0, stub: 0.5 } }) });
give('藤堂高虎', { armor: 0x1a1816, lace: 0x3a2a1a, hat: 'kabuto_s', haori: 0x2a2018, mon: 'todo', lord: true,
  face: face({ age: 59, gaunt: 0.3, brow: 1.3, jaw: 1.2, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.4, side: 0.3, stub: 0.8 } }) });

const HQ = { x: 0, z: -118 };            // 家康の本陣（小高い丘・陣幕と金扇）
const START = { x: 4, z: 64 };           // 自分の軍の持ち場（京街道の南）
const SAKITE = { x: 0, z: -4 };          // 京街道の藤堂の先手（渡辺勘兵衛）
const TODO_HQ = { x: -44, z: -44 };      // 藤堂高虎の本陣（先手の後ろの西の林の脇）
const II_AT = { x: 74, z: -40 };         // 井伊の赤備え（東の巨椋池の縁の林の陰で待つ）
const YOKO = { x: 8, z: -26 };           // 赤備えが横から突っ込む所
const TEPPO = { x: 0, z: -62 };          // 丘の下の徳川の鉄砲衆
const HONDA_AT = { x: 0, z: -92 };       // 本陣の前の本多正純の旗本
const STEP_T = [0, 190, 200, 160, 180, 240];   // 目標ごとの刻限（AP8：全体ではなく一つ一つに）
// 目標の言い方は場所と行いだけ（kaito_standard 三1：「崩す」「攻める」「討つ（将でない隊）」は使わない）
const STEP_TEXT = ['', '京街道の土手で、渡辺勘兵衛の先手を北へ退かせる', '東の林から来る井伊の赤備えを土手で食い止める', '本陣の高みの下の鉄砲衆へ斬り込む', '金扇の前の本多正純の旗本を斬り抜ける', '陣幕に入り、床几の徳川家康を討つ'];
const STEP_AT = [null, SAKITE, YOKO, TEPPO, HONDA_AT, HQ];
const OWN = { armor: 0x2a2420, lace: 0xb8342a, flag: 'maru' };   // 主人公の軍（丸の旗・朱の威）
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };      // 井伊の赤備え（全員朱）
const TODO = { armor: 0x24221f, flag: 'todo' };
const TK = { armor: 0x1f1e1c, flag: 'tokugawa' };
const HONDA = { armor: 0x1c1a18, flag: 'honda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, ...o } });
const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const KEEP = 0.4;   // 段の隊は四割まで減れば崩れて退く（倒す数＝六割）

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.05 + x * 0.02);
  // 淀は標高およそ十 m の平らな野で丘は無い（docs/battle_learn/k16_secret.md）。本陣は川沿いの微高地（自然堤防の高まり。二 m ほど）に置く
  h += 2.2 * gauss(x, z, HQ.x, HQ.z - 6, 700);
  h += 1.2 * gauss(x, z, -120, 40, 1400) + 1.2 * gauss(x, z, 130, -30, 1600);
  // 京街道は田の中を通る土手道（文禄堤の上の道。高さ一 m 余り）。堤の上が戦いの縄張りになる（若江の玉串川・八尾の長瀬川）
  const rx = z > 80 ? 2 * (190 - z) / 110 : z > 0 ? 2 * z / 80 : 0;
  h += 1.3 * Math.exp(-((x - rx) ** 2) / 16) * Math.min(1, Math.max(0, (z + 100) / 14));
  h -= 1.6 * Math.exp(-((x + 150) ** 2) / 300);        // 西の淀川の低み
  h += 1.8 * Math.exp(-((x + 122) ** 2) / 30);         // 淀川の川岸の堤（川除け）
  h -= 1.2 * Math.exp(-((x - 190) ** 2) / 900);        // 東の巨椋池の縁の湿りの低み
  return h;
}

const k16_secret = {
  // 身の回りの合戦の跡（timeslip_field.js）。淀の野（もしもの戦）：大坂の陣の後の初夏。土埃と踏み荒らした草、倒れた槍と旗
  timeslip: {
    wet: 0.15, dust: 0.65, trample: 0.4, debris: 1.3, arrows: 0.9,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a3a],
  },
  spawn: { x: START.x, z: START.z + 6, heading: Math.PI },
  minutes: 14,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  frontlineDensity: false,
  compactIntro: true,
  introText: () => '大坂の陣の後、京へ戻る徳川家康の三万が淀の野に陣を敷いた。二万を率いて京街道を北へ押し、金扇の下の家康を討て。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    const g = F.stepG;
    const p = live(g) && dist(g.center(), STEP_AT[F.step]) < 40 ? g.center() : STEP_AT[F.step];
    PIN.x = p.x; PIN.z = p.z;
    return PIN;
  },
  world: {
    seed: 1615516,
    time: 'day',
    groundHalf: 260,
    paths: [[[0, 190], [2, 80], [0, 0], [0, HQ.z + 20]]],
    height,
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.7 + 0.08, c.g * 0.8 + 0.1, c.b * 0.6 + 0.04);   // 初夏の青田と野
      if (x < -140 || x > 175) c.setRGB(c.r * 0.7, c.g * 0.75, c.b * 0.8);   // 西の川・東の巨椋池の縁の湿り
    },
    clear: (x, z) => Math.abs(x) < 200 && z > -170 && z < 240,
    trees: 240,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) > 205 || z < -175 || z > 245 ? 1 : 0.1),
    // 赤備えが待つ東の林・藤堂高虎の本陣の脇の林・本陣の丘の後ろの林
    groves: [{ x: -62, z: -54, r: 10, n: 12 }, { x: 92, z: -46, r: 13, n: 16 }, { x: 30, z: HQ.z - 26, r: 10, n: 10 }],
    fleeOut: (x, z, team) => (team === 1 ? z < -190 : z > 200),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags, S = Math.PI;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ek = 0; F.ak = 0; F.ending = false;
    const foe = (name, at, list, o = {}) => {
      const g = enemyGroup(rt, { faction: 'tokugawa', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: o.facing ?? 0, width: o.width || 8, noRout: true, formation: o.formation || 'yari',
        morale: o.morale || 95, dmgMult: o.dmg || 0.45, order: 'hold', seekRange: o.seek || 14, aggro: o.aggro || 12, speed: o.speed || 3.7, ...(o.fire ? { fire: true } : {}) }, list);
      F.foes.push(g);
      return g;
    };

    // ---- 徳川方：丘の上の家康の本陣（陣幕・金扇の馬印・床几）。旗本が陣幕の口を固める ----
    F.camp = camp(rt, { x: HQ.x, z: HQ.z, facing: 0, team: 1, faction: 'tokugawa', mon: 'tokugawa', armor: TK.armor, uma: 'ogi', guard: 20, guardFlag: 'tokugawa', reserve: 0, runTo: { x: 0, z: -60 } });
    if (F.camp.guard) { F.camp.guard.noRout = true; F.camp.guard.name = '本陣の旗本'; F.foes.push(F.camp.guard); }
    F.hon = foe('徳川家康の本陣', { x: HQ.x, z: HQ.z - 3 }, dress([busho('徳川家康', { horse: false, invuln: true }), uS(18), uG(4)], TK), { width: 6, morale: 100, seek: 6, aggro: 6, dmg: 0.6 });
    F.ieyasu = F.hon.units.find((u) => u.name === '徳川家康');
    // 床几に腰を下ろす。元和元年の家康は七十四歳：太刀は振るうが、若い将のように一騎打ちで押し勝ちはしない
    if (F.ieyasu) { F.ieyasu._crouch = true; F.ieyasu.dmg *= 0.4; F.ieyasu.maxHp *= 0.6; F.ieyasu.hp = F.ieyasu.maxHp; }
    F.hon.defMult = 1.1; F.hon.fire = false;   // 陣幕の内の供の鉄砲は野へ追って出ない
    // 本陣の丘を葵の幟で囲む（Q：旗がぶわっと並ぶ。旗は動かない陣にだけ立て、隊が去った後に旗だけ残さない AR5）
    for (const [x, z, h] of [[-18, HQ.z + 10, 7], [18, HQ.z + 10, 7], [-34, HQ.z - 4, 6], [34, HQ.z - 4, 6], [-9, HQ.z + 13, 7], [9, HQ.z + 13, 7], [-28, HQ.z + 4, 6], [28, HQ.z + 4, 6], [-24, HQ.z - 16, 6], [24, HQ.z - 16, 6]]) rt.scene.add(nobori(W, x, z, 'tokugawa', h));
    rt.scene.add(hut(W, -40, HQ.z - 24, 8, 5, 0.1), tawara(W, 40, HQ.z - 20, 0.2, 5));
    // 本陣の前の本多正純の旗本・丘の下の鉄砲衆
    F.honda = foe('本多正純の旗本', HONDA_AT, dress([busho('本多正純', { hat: 'kabuto_m' }), uS(12), uA(8), uC(3)], HONDA), { width: 9, morale: 98 });
    for (const [x, z] of [[-14, HONDA_AT.z - 8], [0, HONDA_AT.z - 10], [14, HONDA_AT.z - 8]]) rt.scene.add(nobori(W, x, z, 'honda', 6));
    F.teppo = foe('徳川の鉄砲衆', TEPPO, dress([uS(2), uG(14)], TK), { width: 12, formation: 'line', fire: true, seek: 30 });
    // 東の林の陰の井伊の赤備え（騎馬を厚く。直孝は自ら前に出る将）
    F.ii = foe('井伊直孝の赤備え', II_AT, dress([busho('井伊直孝', { hat: 'kabuto_tentsuki' }), uC(7), uS(4), uA(12)], II), { facing: -1.2, width: 9, morale: 100, seek: 8, aggro: 8, speed: 4.2 });
    // 京街道の藤堂の先手と、後ろの林の脇の藤堂高虎の本陣（高虎は座ったまま動かない）
    F.todo = foe('藤堂の先手', SAKITE, dress([busho('渡辺勘兵衛'), uS(6), uA(22), uG(6)], TODO), { width: 12, morale: 92, seek: 18 });
    F.takatora = foe('藤堂高虎の本陣', TODO_HQ, dress([busho('藤堂高虎', { horse: false, invuln: true }), uS(8)], TODO), { width: 5, morale: 100, seek: 6, aggro: 4 });
    F.takatora.fire = false;   // 高虎の本陣は座ったまま。供の鉄砲が獲物を追って野へ出ない
    const tk = F.takatora.units.find((u) => u.name === '藤堂高虎');
    if (tk) tk._crouch = true;
    for (const [x, z] of [[-52, -38], [-36, -38], [-56, -48], [-32, -48], [-44, -54]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // 徳川方の備は段ごとの下知だけで動く（共通の敵の頭 ai.js に任せると、家康の本陣・旗本・高虎の本陣まで持ち場を出て前線へ来る。一2）
    //   後ろの備は自分の段まで持ち場を動かない（stay：本人を見て一人ずつ駆け出さない）。本陣・旗本・高虎の本陣は最後まで動かない
    for (const g of F.foes) { g.noAI = true; if (g !== F.todo) g.stay = true; }

    // ---- 自分の軍：左右の備と、自分の組（大将の旗本） ----
    const ally = (name, at, list, o = {}) => {
      const g = allyGroup(rt, { faction: 'oda', flag: OWN.flag, name, anchor: at, facing: S, width: 12, aggro: 12, seekRange: 18, speed: 3.8, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari', ...o }, dress(list, OWN));
      g.defMult = 1.6; g.dmgMult = 0.85;
      return g;
    };
    F.ally = ally;
    F.left = ally('左の備', { x: -16, z: 52 }, [uS(4), uA(20), uG(6)]);
    F.right = ally('右の備', { x: 22, z: 52 }, [uS(4), uA(18), uC(6)]);
    const n = RANKS[rt.G.rank].squad;
    rt.makeSquad({ x: START.x, z: START.z }, S, [{ kind: 'spear', n: Math.max(10, Math.min(n || 10, 16)) }]);
    for (const [x, z, h] of [[-10, 70, 7], [12, 70, 7], [0, 84, 8], [-22, 76, 6], [24, 76, 6], [-8, 90, 6], [10, 90, 6]]) rt.scene.add(nobori(W, x, z, OWN.flag, h));
    KIT.farVillage(rt, -150, 120, { rot: Math.PI / 2, n: 6, fields: 8, seed: 73 });

    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('s1', STEP_TEXT[1], 'main');   // 采配までの間も右上は①（共通の「味方の旗へ」を出さない。三3）
    rt.say('家臣', '殿、あの高みの金扇が家康の本陣にござる。三万', 3.6);
    rt.after(4, () => rt.say('家臣', '京街道の先手は藤堂、その後ろの林に高虎。東の林の陰には井伊の赤い旗', 3.8));
    rt.after(8.2, () => rt.say(nm(rt), '足軽から槍一本で上がってきた。今日、天下を取る', 3.6));
    rt.after(12, () => rt.say('家臣', '二万、殿の采配を待っておりまする', 3));
    rt.after(15, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 段の隊が崩れた：生き残りは名のある将ごと北へ退く（討ち死にさせ尽くさない）
  fall(rt, g) {
    if (!live(g)) return;
    g.order = 'retreat'; g.dest = { x: g.center().x * 0.5, z: -200 }; g.speed = 4.2; g.aggro = 0; g.noRout = false;
  },

  // 段を進める（右上の目標と行き先のピン）。味方の備は段の場所へ一緒に走る（AP5・AQ7）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step && !F.failed) rt.objDone('s' + F.step);
    F.failed = false;
    F.step = n; F.stepT = rt.t; F.stepN = 0;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    const mine = [null, null, F.ii, F.teppo, F.honda][n];
    if (mine) mine.stay = false;   // 自分の段の備だけ持ち場を出る
    const go = (g, p, seek = 30) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.speed = 3.9; };
    const atk = (g, p, seek = 40) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.aggro = 18; };
    const both = (p) => { for (const [g, dx] of [[F.left, -8], [F.right, 8], [F.aid, 0]]) go(g, { x: p.x + dx, z: p.z + 6 }); };
    // 後ろの二の備が京街道を駆け上がって来る（二万の後続。見えない遠さの南から本物の兵で。倒れた分を埋める）
    const aid = (name, list) => {
      if (live(F.aid) && aliveN(F.aid) > 8) return;
      F.aid = F.ally(name, { x: 2, z: Math.max(rt.player.u.pos.z + 90, 120) }, list, { speed: 4.2 });
      rt.after(6, () => rt.say('家臣', `${name}が追いついた！`, 2.6));
    };
    if (n === 1) {
      rt.setPhase('battle');
      sfx('horagai', 0.9); rt.after(1.2, () => sfx('taiko', 0.9));
      F.stepG = F.todo;
      both(SAKITE);
      atk(F.todo, { x: SAKITE.x, z: SAKITE.z + 20 }, 30);
      rt.army.play('toki', START, 1.4);
      rt.say(nm(rt), '者ども、かかれっ！　京街道を押し通る！', 3.2);
      rt.after(4, () => rt.say('渡辺勘兵衛', '藤堂の先手、一歩も退くな！', 3));
    } else if (n === 2) {
      // 先手を割った所へ、東の林から赤備えが横槍に出る（言った隊は初めから林の陰にいた）
      F.stepG = F.ii;
      aid('二の備', [uS(5), uA(20), uG(4)]);
      atk(F.ii, YOKO, 50); F.ii.speed = 4.6;
      both(YOKO);
      rt.army.play('eshout', F.ii.center(), 1.6);
      rt.say('家臣', '東から赤備え！　井伊の騎馬じゃ！　槍を揃えて受けよ！', 3.4);
      rt.after(4, () => rt.say('井伊直孝', '井伊の赤備え、掛かれ！　横腹を突け！', 3.2));
    } else if (n === 3) {
      F.stepG = F.teppo;
      both(TEPPO);
      F.teppo.seekRange = 40;
      rt.say('家臣', '高みの下に鉄砲が並んでおる！　固まって一息に寄せよ！', 3.2);
      rt.after(3, () => sfx('taiko', 0.7));
    } else if (n === 4) {
      F.stepG = F.honda;
      aid('三の備', [uS(5), uA(14), uC(4)]);
      both(HONDA_AT);
      atk(F.honda, { x: HONDA_AT.x, z: HONDA_AT.z + 14 }, 30);
      rt.after(1, () => rt.say('本多正純', '大御所様の御前ぞ！　一人も通すな！', 3));
      rt.after(5, () => rt.say(nm(rt), '狙うは家康の首ひとつ！', 2.8));
    } else if (n === 5) {
      F.stepG = F.hon;
      if (F.ieyasu) F.ieyasu.invuln = false;
      both({ x: HQ.x, z: HQ.z + 10 });
      aid('三の備', [uS(5), uA(14), uC(4)]);
      // 天王寺口の手本：前の備が崩れると本陣の旗本も浮き足立って散り、金扇の周りが手薄になった（docs/battle_learn/k16_secret.md）。
      //   陣幕の内の侍（家康の本陣）は最後まで床几の家康を囲む
      if (live(F.camp.guard)) { this.fall(rt, F.camp.guard); rt.after(2, () => rt.say('家臣', '旗本が散ったぞ！　金扇の周りが手薄じゃ！', 3)); }
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = 100; F.hon.aggro = 14; F.hon.seekRange = 12; }
      rt.after(1, () => rt.say('徳川家康', '……来たか。わしの首、取れるものなら取ってみよ', 3.6));
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '徳川家康を討ち取った', pts: 100 }; }, '徳川家康を討ち取った');
    rt.player.u.invuln = true;
    if (F.ieyasu && F.ieyasu.alive) { F.ieyasu.invuln = false; rt.army.damage(F.ieyasu, F.ieyasu.maxHp * 9, rt.player.u, { pierce: true }); }
    for (const g of F.foes) if (g !== F.takatora) this.fall(rt, g);
    if (live(F.takatora)) { F.takatora.order = 'hold'; F.takatora.aggro = 0; F.takatora.seekRange = 0; }
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.after(3, () => rt.army.celebrate(0));
    rt.banner('家康、討ち取ったり', 'もしもの天下　元和元年五月');
    rt.say('家臣', '金扇が倒れた！　徳川の軍勢が退いていく！', 3.6);
    rt.after(3.8, () => rt.say(nm(rt), '……槍一本で始めた道が、ここまで来たか', 3.4));
    // 将軍の位：宣下は後日の儀なので、戦場には帝の内意（内々の御意）を伝える使いが来る形にする。締めは短く（三3）
    rt.after(7.4, () => rt.say('勅使', `帝の御内意にござる。${nm(rt)}殿を征夷大将軍に任ずべし、と`, 4));
    rt.after(11.6, () => rt.say(nm(rt), '謹んで、お受けいたす', 2.6));
    rt.after(14.4, () => rt.say('家臣', '将軍様じゃ！　我らが殿が、将軍様じゃ！', 3));
    rt.after(8, () => this.shogun(rt));
    rt.finish({ scriptedEnd: true }, 19);
  },

  // 終わりの場面：出世の道を下から一段ずつ灯し、最後に金の「征夷大将軍」（字は位の名だけ）
  shogun(rt) {
    if (typeof document === 'undefined' || rt.ended) return;
    const rm = document.body.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = [...LADDER.map((L) => L.name), '征夷大将軍'];
    const el = document.createElement('div');
    el.id = 'shogun-end';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `出世の道。${steps.join('、')}`);
    el.innerHTML = `<style>
      #shogun-end { position: fixed; inset: 0; z-index: 40; pointer-events: none; display: flex; align-items: flex-end; justify-content: center; padding: 0 4vw 9vh; background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(10,8,6,.72) 100%); }
      #shogun-end ol { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 6px; }
      #shogun-end li { font: 600 13px/1.2 serif; color: #ece4d2; background: rgba(28,22,16,.82); border: 1px solid rgba(236,228,210,.3); padding: 6px 7px; writing-mode: vertical-rl; opacity: ${rm ? 1 : 0}; ${rm ? '' : 'animation: shgUp .5s ease-out forwards;'} }
      #shogun-end li.top { font-size: 18px; color: #2a1c08; background: linear-gradient(160deg, #f6e3a1, #c9a24a 60%, #f3d98a); border-color: #fff3c4; box-shadow: 0 0 18px rgba(240,200,110,.7); }
      @keyframes shgUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    </style><ol>${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'top' : ''}" style="margin-bottom:${i * 9}px;animation-delay:${(i * 0.45).toFixed(2)}s">${s}</li>`).join('')}</ol>`;
    document.body.appendChild(el);
    rt.flags.endEl = el;
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.say('家臣', '殿、退きましょう！　天下は、また次に……', 4);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  onFinish(rt) {
    const el = rt.flags.endEl;
    if (el) { el.remove(); rt.flags.endEl = null; }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const P = rt.player.u;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    // 退いた徳川方は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
      // 本陣・旗本・高虎の本陣の者は持ち場から三十 m より先へ追わない（一2）
      for (const g of [F.hon, F.camp.guard, F.takatora]) if (g && g.order !== 'retreat') for (const u of g.units) if (u.alive && u.target && dist(u.pos, g.anchor) > 30) u.target = null;
    }
    if (left > 0) rt.objProgress('s' + F.step, `あと${mmss(left)}`);
    // 家康の段：家康が倒れれば勝ち（旗本が減っても家康は床几から逃げない）
    if (F.step === 5) {
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = Math.max(F.hon.morale, 60); }
      if (F.ieyasu && !F.ieyasu.alive) { this.win(rt); return; }
      if (left <= 0) this.lose(rt, '家康を討ち漏らした', '刻限のうちに家康に届かず、徳川の軍勢が持ち直した');
      return;
    }
    const g = F.stepG;
    if (!F.stepN || F.stepNg !== g) { F.stepNg = g; F.stepN = Math.max(1, aliveN(g)); }   // 数えるのは段の始めに立っていた兵（前の段で味方が削った分は数えない）
    const gone = F.stepN - aliveN(g);
    if (!F.next && gone >= Math.round(F.stepN * (1 - KEEP))) {
      F.next = true;
      this.fall(rt, g);
      rt.say('家臣', F.step === 1 ? '藤堂の先手が崩れた！　勘兵衛が退いていく！' : `${g.name}が崩れた！`, 2.6);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    } else if (!F.next && left <= 0) {
      // 刻限を過ぎた目標は果たせなかった印を付け、隊は退いて次の目標へ（二つ果たせなければ負け）
      const why = ['', '京街道で押し返された', '赤備えに横腹を破られた', '鉄砲衆の前で足が止まった', '本多の旗本を抜けなんだ'][F.step];
      F.miss = (F.miss || 0) + 1;
      if (F.miss >= 2) { this.lose(rt, why, '刻限のうちに果たせず、徳川の軍勢が持ち直した'); return; }
      F.next = true;
      rt.objFail('s' + F.step); F.failed = true;
      this.fall(rt, g);
      rt.say('家臣', '時を食い過ぎた！　次でしくじれば天下は無いぞ！', 3);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.team === 1 && v.name === '徳川家康') { this.win(rt); return; }
    if (v.type === 'busho' && v.team === 1 && v.name) {
      rt.say('家臣', `${v.name}、討ち取ったり！`, 2.8);
      rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 30 }; }, `${v.name}を討ち取った`);
    }
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    inp.quickCmd = null;
    if (F.holdPlayer || !F.step || F.ending || !u.alive) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && !(o.group && (o.group.order === 'retreat' || o.group === F.takatora));
    const e = b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      if (patientStrike) patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = (F.step === 5 && F.ieyasu && F.ieyasu.alive) ? F.ieyasu.pos : (this.missionPin(b) || STEP_AT[F.step]);
    goTo(p, inp, t.x, t.z, 2);
  },
};

// 両軍の総勢（もしもの数）：自分の二万、家康の三万。段の隊が崩れるたびに大きく減る
k16_secret.force = (rt) => {
  const F = rt.flags, st = Math.max(0, (F.step || 1) - 1);
  return { a: Math.max(8000, Math.round(20000 - (F.ak || 0) * 25 - st * 600)), a0: 20000, b: Math.max(4000, Math.round(30000 - (F.ek || 0) * 30 - st * 3500)), b0: 30000 };
};
k16_secret.sides = { a: { name: '自分の軍', mon: 'maru' }, b: { name: '徳川軍', mon: 'tokugawa' } };
k16_secret.date = (rt) => `元和元年（1615）五月　夏・晴・${rt.t < 300 ? '朝' : '昼'}　もしもの戦`;
k16_secret.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '采配を振るまで待つ' : '');
k16_secret.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k16_secret.history = 'この戦は史実ではない、もしもの戦である。元和元年（1615）五月、大坂夏の陣で豊臣家は滅び、徳川家康は天下の主となった。家康は翌年に世を去り、征夷大将軍の位は慶長十年（1605）からすでに子の秀忠が継いでいた。徳川の世は、この後二百六十年ほど続く。\n淀は桂川・宇治川・木津川が寄り合う所で、秀吉が淀川の左岸に築いた堤の上を、伏見と大坂を結ぶ京街道が通っていた。東には巨椋池が広がっていた。\n淀の野で家康を討ち、主人公が征夷大将軍になる筋は、足軽から出世してきた道の締めとして作った物語である。徳川方の五重の構え（先手・横槍・鉄砲・旗本・本陣）と、本陣へ切り込む流れは、夏の陣の天王寺口で真田信繁が先手を割って家康の本陣に迫った戦いを手本にした。';
k16_secret.bushou = [{ name: '徳川家康', g: /家康/ }, { name: '井伊直孝', g: /井伊/ }, { name: '渡辺勘兵衛', g: /藤堂の先手|勘兵衛/ }, { name: '本多正純', g: /本多/ }, { name: '藤堂高虎', g: /高虎/ }];

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
STAGES[ID] = [[STEP_TEXT[1]], [STEP_TEXT[2], st(2)], [STEP_TEXT[3], st(3)], [STEP_TEXT[4], st(4)], [STEP_TEXT[5], st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）。家康の段は家康一人
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending || !F.stepG || !F.stepN || F.step === 5) return null;
  return cut(F.stepN, aliveN(F.stepG), Math.round(F.stepN * KEEP));
};

export { k16_secret };
export default k16_secret;
