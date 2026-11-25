// ======================================================================
// 武田編 7　三方ヶ原の戦い（元亀三年十二月二十二日・1572）（K563・docs/chapter_takeda.md）
// 作り：織田家編の三方ヶ原（b_mikatagahara.js・徳川方の本人）を丸ごと写し、側だけ入れ替える（番外 真田＝b_x15_sanada.js と同じ型。作り直さない）。
//   地形・布陣（魚鱗と鶴翼）・兵の数・赤備え・夕暮れ・浜松への道は元のまま。元の段の兵の動き（first＝先手の寄せ・crash＝赤備えと二の陣・retreat＝徳川の敗走）を時で呼ぶ。
//   元の筋は徳川の本人へ向けた物（平手の持ち場・家康を浜松へ帰す）なので、任務・行き先・褒美・本人へ向けた台詞は出さず、武田の側の任務を三つ立てる。
//   本人は武田の先手（小山田信茂の手）の足軽。①鶴翼の左の織田の援軍（平手の槍列）へ懸かる ②崩れた徳川を追い家康の本陣へ ③浜松へ退く家康を城の口まで追う。
//   勝ちは家康が浜松城へ逃げ込むまで追い詰めた時（史実：家康は浜松城へ逃げ帰り、武田は城を囲まず西へ去った）。家康は討たない（元の mustLive のまま）。
// 史料：『甲陽軍鑑』『三河物語』『信長公記』。布陣図は docs/fujin/mikatagahara.md（側を入れ替えただけ）。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { mikatagahara as base } from './b_mikatagahara.js';
import { enemyGroup } from './bhelp.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

BATTLE_ASSETS.d07_mikatagahara = BATTLE_ASSETS.mikatagahara;

// 元の戦の座標（b_mikatagahara.js と同じ値）
const LINE_Z = -260 / 16;
const HIRATE_POST = { x: 260 / 16 + 3, z: LINE_Z + 4 };
const HAMA = { x: 0, z: 2800 / 16 };
const START = { x: HIRATE_POST.x - 4, z: LINE_Z - 46 };   // 武田の先手（小山田の手）の後ろ
const TAKEDA = { armor: 0x2b2b30, lace: 0x8a2a22, flag: 'takeda' };
const TAKEDA_SIDE = new Set(['takeda', 'akazonae']), TOKU_SIDE = new Set(['tokugawa', 'oda']);
const alive = (g) => g && !g.routed && g.count > 0;
const TOKU_NAME = /^(徳川|織田|平手|佐久間|水野|酒井|本多|榊原|石川|松平|小笠原|大久保|鳥居|家康|夏目|殿を逃がす)/;
const TAKEDA_NAME = /^(武田|山県|小山田|馬場|内藤|勝頼|小幡|穴山|信玄|赤備え|高坂)/;
// 武田の側の声だけを通す（元の戦の徳川方の本人へ向けた声は出さない）
const TAKEDA_VOICE = /^(武田|小山田|山県|馬場|内藤|高坂|勝頼|穴山|甘利|武田の|足軽頭|物見)/;

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
for (const k of ['resumeSteps', 'resumeAt', 'botStat', 'botEvacuating', 'marchIn', 'missions', 'missionOf', 'missionHeading', 'missionPin',
  'commanderTarget', 'missionSignTarget', 'namedGuideTarget', 'guideMarker', 'travelGuideLabel', 'waitTravelLabel', 'guardTravelLabel', 'waitOrderLabel',
  'waitActionText', 'taskDetail', 'taskLabel', 'retreatTaskLabel', 'lethal', 'civilianCrowd', 'timeslip', 'softOpen', 'noLeaderFollow']) delete D[k];

const d07_mikatagahara = Object.assign(D, {
  key: 'd07_mikatagahara',
  sideFlip: true,
  spawn: { x: START.x, z: START.z, heading: 0 },   // 南（+z）の徳川の鶴翼を向く
  // 両軍（武田方 二万七千・徳川織田方 一万一千）
  force: (rt) => ({ a: Math.max(0, 27000 - (rt.flags.ak || 0) * 30), a0: 27000, b: Math.max(0, 11000 - (rt.flags.ek || 0) * 25), b0: 11000 }),
  sides: { a: { name: '武田方', mon: 'takeda', faction: 'takeda' }, b: { name: '徳川・織田方', mon: 'tokugawa', faction: 'tokugawa' } },
  taisho: { a: null, b: { name: '徳川家康', def: true } },
  survives: [...(base.survives || []), '徳川家康'],
  introText: '武田の魚鱗が三方ヶ原の坂を下る。先手の槍で徳川の鶴翼に懸かり、浜松へ逃げる家康を追え。',
  introLords: ['武田信玄', '徳川家康'],
  introYou: false,
  introPeople: [],
  introFujin: (base.introFujin || []).map((e) => ({ ...e, team: 1 - (e.team || 0) })),
  victoryCaption: '徳川家康、浜松城へ逃げ込む',
  nameTagVisible: () => true,
  goalSignOff: () => false,
  goalSignTarget: (rt) => d07_mikatagahara.pin(rt),
  missionSignTarget: (rt) => d07_mikatagahara.pin(rt),
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',

  pin(rt) {
    const F = rt.flags; if (F.ending) return null;
    const ie = F.campA?.general;
    if ((F.dStage || 0) >= 3 && ie?.alive) return { x: ie.pos.x, z: ie.pos.z, label: '徳川家康' };
    if ((F.dStage || 0) >= 2) return ie?.alive ? { x: ie.pos.x, z: ie.pos.z, label: '家康の本陣' } : null;
    return { x: HIRATE_POST.x, z: HIRATE_POST.z, label: '鶴翼の左の槍列' };
  },

  *setup(rt) {   // K626：元の戦の段分けの setup を yield* で回す
    const army = rt.army, add0 = army.addGroup;
    // 側の入れ替え：本人の隊と本人の組のほかは、武田（赤備えも）を味方（0）・徳川と織田を敵（1）に
    army.addGroup = function (o) {
      if (o && o.name !== 'player' && o.order !== 'follow' && !o.isPlayerSquad) {
        // 名で先に決める（共通の味方の塊の部品は家を sides.a＝武田にするので、徳川の後備えの塊が武田に入っていた）
        const nm = o.name || '';
        const t = TOKU_NAME.test(nm) ? 1 : TAKEDA_NAME.test(nm) ? 0 : TAKEDA_SIDE.has(o.faction) ? 0 : TOKU_SIDE.has(o.faction) ? 1 : (o.team === 1 ? 0 : 1);
        if (t === 1 && TAKEDA_SIDE.has(o.faction)) o = { ...o, faction: 'tokugawa' };
        o = { ...o, team: t };
      }
      return add0.call(this, o);
    };
    rt.cleanupTasks?.add(() => { army.addGroup = add0; });
    // 元の筋の徳川の本人へ向けた任務・行き先・褒美・台詞は出さない（任務はこの戦の三つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner;
    const OURS = new Set(['徳川の鶴翼の左へ懸かれ', '崩れた徳川を追い、家康の本陣へ', '浜松へ逃げる家康を追え']);
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.marker = (id, ...r) => (id === 'dpin' ? mk0.call(rt, id, ...r) : undefined);
    rt.award = (f, label, ...r) => (rt.flags._dObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._dSay || TAKEDA_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._dSay ? ban0.call(rt, t, s, ...r) : undefined);
    // 本人の組も武田の具足・花菱の旗
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), armor: TAKEDA.armor, lace: TAKEDA.lace, flag: TAKEDA.flag } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }   // K626：元の戦の setup は段に分けてある（function*）
    const F = rt.flags;
    // 鶴翼（徳川・F.bA）と魚鱗（武田・F.bT）の部隊（遠景の大軍と、近づくと本物になる仕組み）の側も入れ替える。
    //   元の戦では徳川が本人の側で、近づいても本物にならない（味方の遠景）＝側を入れ替えると敵の本物が十数人しかいなかった（描かずの通し 11/21）
    for (const list of [F.bA, F.bT]) for (const b of Object.values(list || {})) {
      if (!b || typeof b !== 'object') continue;
      b.team = b.team === 1 ? 0 : 1;
      if (b.light?.army) b.light.army.team = b.team;
    }
    if (rt.player?.u) rt.player.u.faction = 'takeda';
    F.dStage = 0; F.dT0 = rt.t;
    this.dObj(rt, '徳川の鶴翼の左へ懸かれ');
    mk0.call(rt, 'dpin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.dSay(rt, 1.5, '小山田信茂', '先手、坂を下れ！　徳川の鶴翼を一揉みに揉み潰せ！', 3);
    // 元の段の兵の動きを時で呼ぶ（①先手の寄せ ②赤備えと二の陣・徳川の崩れ ③徳川の敗走）
    rt.after(8, () => this.dStage(rt, 1));
  },
  // 11/21 cloud-10（司令塔「本人の討ち取り5以上」）：段の始めに、本人の十八歩前へ徳川の組頭の小組（討てる名のある組頭一人と足軽）を出し、本人へ打ちかからせる。
  //   元の大軍は味方の武田が先に討ち切り、本人の前に相手が残らなかった（K582 の表 d07 討6）。数を足すのは本人の前の一組だけ・敵の強さは変えない
  headGroup(rt, name) {
    const P = rt.player?.u; if (!P?.alive || rt.flags.ending) return;
    const h = P.heading || 0, x = P.pos.x + Math.sin(h) * 18, z = P.pos.z + Math.cos(h) * 18;
    try {
      const g = enemyGroup(rt, { faction: 'tokugawa', name: name + 'の手', anchor: { x, z }, facing: h + Math.PI, width: 6, aggro: 16, seekRange: 22, order: 'attack', fullStrength: true, fixed: true },   // fixed：見えない所へずらさず本人の前に置く
        [{ type: 'samurai', n: 1, o: { name, flag: 'tokugawa', armor: 0x2a2622 } }, { type: 'samurai', n: 1, o: { flag: 'tokugawa', armor: 0x2a2622 } }, { type: 'ashigaru', n: 8, o: { flag: 'tokugawa', armor: 0x2a2622 } }]);
      if (g) { g.team = 1; for (const u of g.units) { u.team = 1; u.target = P; } }
    } catch (e) { console.warn('d07 組頭', e); }
  },
  dObj(rt, text) { const F = rt.flags; F._dObj = true; try { if (F.dObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.dObjText = text; } finally { F._dObj = false; } },
  dSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.ending) return; rt.flags._dSay = true; try { rt.say(who, text, d); } finally { rt.flags._dSay = false; } }); },
  dBanner(rt, t, s) { rt.flags._dSay = true; try { rt.banner(t, s); } finally { rt.flags._dSay = false; } },
  dStage(rt, n) {
    const F = rt.flags;
    if (F.ending || F.dStage >= n) return;
    F.dStage = n;
    const run = (f) => { try { f(); } catch (e) { console.warn('d07 段', n, e); } };
    if (n === 1) { run(() => base.first.call(this, rt)); rt.after(70, () => this.dStage(rt, 2)); rt.after(12, () => this.headGroup(rt, '酒井の組頭')); rt.after(40, () => this.headGroup(rt, '石川の組頭')); }
    if (n === 2) {
      run(() => base.crash.call(this, rt));
      this.dObj(rt, '崩れた徳川を追い、家康の本陣へ');
      this.dBanner(rt, '赤備え', '山県の赤備え、徳川の右へ駆け入る');
      this.dSay(rt, 1, '山県昌景', '赤備え、続け！　鶴翼の腹を食い破れ！', 3);
      rt.after(80, () => this.dStage(rt, 3));
      rt.after(6, () => this.headGroup(rt, '本多の組頭')); rt.after(40, () => this.headGroup(rt, '榊原の組頭'));
    }
    if (n === 3) {
      run(() => base.retreat.call(this, rt));
      this.dObj(rt, '浜松へ逃げる家康を追え');
      this.dBanner(rt, '徳川の敗走', '家康、浜松城へ逃げる');
      this.dSay(rt, 1, '武田の足軽頭', '徳川が崩れたぞ！　家康の馬印を追え、浜松まで追い落とせ！', 3.2);
      F.dRetreatT = rt.t;
      rt.after(8, () => this.headGroup(rt, '鳥居の組頭'));
    }
  },
  // 元の勝ち（本人と家康が浜松城へ入った）・負け（本人の退く道が断たれた）は徳川の本人の物なので使わない
  win() {},
  lose() {},
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags;
    if (F.ending || F.dStage < 3 || F.dWon) return;
    // 勝ち：家康が浜松城の口へ逃げ込んだ（追い詰めた）。家康が見つからない・道で止まった時は、退きの段から百五十秒で締める
    const ie = F.campA?.general;
    const inCastle = ie?.alive && Math.abs(ie.pos.x - HAMA.x) < 26 && ie.pos.z > HAMA.z - 14;
    if (inCastle || rt.t - F.dRetreatT > 150) this.dWin(rt);
  },
  dWin(rt) {
    const F = rt.flags; if (F.dWon) return;
    F.dWon = true; F.ending = true;
    F._dObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '徳川を浜松城へ追い落とした');
    } finally { F._dObj = false; }
    this.dBanner(rt, '三方ヶ原', '武田軍 大勝　徳川家康、浜松城へ逃げ込む');
    this.dSay(rt, 1, '武田信玄', '城は攻めぬ。家康の肝は十分に冷えたであろう。西へ向かうぞ', 4);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 18);   // 締めの台詞を聞く間をとって締める（light_battle.js と同じ scriptedEnd）
  },
  // 本人の組の者に討たれた徳川の名のある将は、元の戦と同じく手負いで退く（史実で生きた将を討たない）
  onKill(rt, v, k) { return base.onKill?.call(this, rt, v, k); },
});

export { d07_mikatagahara };
export default d07_mikatagahara;
