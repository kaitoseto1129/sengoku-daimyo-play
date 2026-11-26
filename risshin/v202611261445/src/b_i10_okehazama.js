// 今川家編 十戦目「桶狭間の戦い（今川の側）」（永禄三年〔1560〕五月十九日・尾張国 桶狭間）（H3・docs/house_imagawa.md ①④⑤）
//   史実：今川義元は約二万五千（通説。『信長公記』A は四万五千）で尾張へ入り、朝に丸根・鷲津の砦を落とした。昼、桶狭間山に本陣を据えて休む所へ、
//   西から急な雨（石氷を投げ打つような雨・楠が東へ倒れた）。雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。
//   義元は旗本三百騎ほどに丸く囲まれて退いたが、二度三度と打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』A）。
//
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと。立場を交換している戦は全部」）：
//   前の作り（K651）は織田の桶狭間の戦場（okeField）だけを借り、兵は軽い型で別に置いていた（本陣の旗本は十四人・織田は段ごとに十五人ほど）。
//   今は織田家編の桶狭間（b_okehazama.js）の setup・update を丸ごと呼び、側だけを入れ替える（設楽原 d11 と同じ型・docs/k651_howto.md 五）。
//   織田の行軍の四組・信長の馬廻（服部小平太・毛利新介）・松井宗信の先手と後備・前の備え・井伊直盛・義元の旗本の囲み・新手（depth_reserve）・
//   雨と雹・十五分の出来事（okehazama/*.js：集まり・谷の物見・雨宿りの鉄砲衆・坂の弓・近習・最期・引き揚げ）は元のまま。
//   元の段は、元の本人（織田の槍組の足軽）が任務の行き先を追って歩いたであろう所（okehazama/side.js の SH.ghost）で、同じ順・同じ間に進む。
//   源八の手ほどき（okehazama/tutor.js）は元の本人だけ（SH.flip で止める）。
//   この紙に書くのは、今川の本人の出る所・任務の行・逸話（服部小平太の膝の口）・この家の仕組み「大軍の綻び」の帯・勝ち負けだけ。
//   今川の側の「勝ち」（K514 史実のまま・義元は討たれる）：義元の旗本として最後まで本陣を守り、生き残った者を沓掛の方へ退かせて生き延びること。
// 史料：『信長公記』。布陣図は docs/fujin/okehazama.md（側を入れ替えただけ）。
// ======================================================================
import { okehazama as base, OKE_AT } from './b_okehazama.js';
import { SH } from './okehazama/side.js';
import { enemyGroup as commonGroup } from './bhelp.js';
import { sfx } from './audio.js';
import { obiTick } from './imagawa_obi.js';
export { obiTick };   // 前からの名で読む所のため

// ---- 場所：織田の戦場の内の座標（OKE_AT.point(x, z)。内の z が負へ行くほど桶狭間山の本陣・その奥が沓掛の方） ----
const P = OKE_AT.point;
const HONJIN = OKE_AT.honjin;           // 桶狭間山の本陣（陣幕の内）
const SPAWN = P(38, -118);              // 本陣の幕の東の外。本人は旗本の足軽
const GATE = OKE_AT.mouth;              // 本陣の幕の口（輿の前）
const KUTSU = P(10, -178);              // 沓掛の方へ退く所
const IMAGAWA = { armor: 0x302e2a, lace: 0x685b43, flag: 'imagawa' };
const headTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const FACE_W = headTo(HONJIN, OKE_AT.exit);   // 谷の出口（織田の来る方）へ向く
// 今川の側の声だけを通す（元の戦の織田の本人へ向けた組頭・源八・弥七の声は出さない）
const IMAGAWA_VOICE = /^(今川|松井|井伊|山田新右衛門|由比|朝比奈|岡部|旗本|御輿|輿添)/;
const ready = (u) => u && u.alive && !u.gone && !u.fleeing && !u.woundOut;
const live = (g) => g && !g.routed && g.count > 0 && g.units?.some(ready);
const center = (g) => (live(g) ? g.center() : null);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
D.__depth = true;   // 奥の層（okehazama/depth.js）は元の setup の包みの中で一度だけ立てる（側は b_okehazama.js の okehazama.depth が SH.flip で入れ替える）
// 元の織田の本人の任務の札・印・行き先・bot の癖・名乗りは使わない（今川の側の任務は下の六つ）
for (const k of ['missions', 'missionOf', 'missionHeading', 'missionAlly', 'missionFollowAlly', 'missionPin', 'missionSignTarget', 'commanderTarget',
  'missionStatus', 'missionDetail', 'missionDangerText', 'missionDangerSpeech', 'missionAllyLabel', 'missionTimeText', 'missionPinCaption', 'missionContext',
  'enemyOrder', 'enemyTaskLabel', 'meleeApproachText', 'combatTaskLabel', 'passageGuideUnits', 'passageGuideDestination', 'taskLabel', 'waitOrderLabel',
  'waitTravelLabel', 'taskDetail', 'guideMarker', 'attackOpening', 'guardGuideTarget', 'guardGuideAllowed', 'waitGuardAllowed', 'guardLabel',
  'botBrain', 'botOrders', 'generalLines', 'retryReason', 'introPeople', 'introPeopleFolded', 'introSides', 'introName', 'introTaskFirst', 'compactIntro',
  'timeslip', 'lordSpawn', 'lordAt', 'noLeaderFollow', 'taskDetails', 'keepCombatTask', 'keepCombatTaskHeading', 'missionAllyEdge', 'missionAllyNamed',
  'passageTaskDestination', 'flagTravelLabel', 'edgeDestinationCaption']) delete D[k];

// K674（一戦十任務・今川家編）の十の言葉を、元の段の順に当てる（言葉は前の i10 の段のまま＝英語の表と任務十の紙がそのまま効く）
const OBJ = ['細った帯をたどり、前備へ号令を届ける', '前備の坂の下で、雨に紛れて来る織田の足軽を討つ', '雨の中、列の切れ目から入った織田の手を止める',
  '本陣の幕の前で、輿へ寄る織田の手を、旗本と共に受け止める', '義元様の輿の前で、旗本と共に守る', '幕の内で、義元様と共に服部小平太を斬り伏せる',
  '生き残った者と、沓掛の方へ退く', '沓掛の道で、追って来る織田の手を止める', '後備の陣の跡に入り込んだ織田の手を払い、道を開ける',
  '帯をたどり、沓掛の道へ戻って生き残った者をまとめる'];
const ATO = P(20, -165);                // 後備（朝比奈ら）の陣の跡：本陣の奥・沓掛の方

export const i10_okehazama = Object.assign(D, {
  id: 'i10_okehazama',
  key: 'i10_okehazama',
  sideFlip: true,   // okehazama/side.js：織田が team 1、今川が team 0（元の戦の setup の一番外で決まる）
  kumiLead: false,  // 組頭について歩く共通の手（kumi_lead.js）は使わない（任務の行き先は下の印）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE_W },
  date: () => '永禄三年（1560）五月十九日　午の刻　尾張国 桶狭間',
  intro: '丸根と鷲津の砦は落ちた。義元様は桶狭間山で休んでおられる。大軍の列は長く伸びている。あなたは旗本の足軽。',
  introText: '丸根と鷲津の砦は落ちた。義元様は桶狭間山で休んでおられる。大軍の列は長く伸びている。あなたは旗本の足軽。',
  introLords: ['今川義元', '織田信長'],
  introYou: false,
  history: '永禄三年（1560）五月、今川義元は約二万五千（通説。『信長公記』は四万五千と書く）で尾張へ入った。十九日の朝、松平元康が丸根、朝比奈泰朝が鷲津の砦を落とし、義元は桶狭間山に本陣を据えて休んだ。昼すぎ、西から石氷を投げ打つような急な雨が降り、雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。義元は旗本三百騎ほどに丸く囲まれて退いたが、何度も打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』）。大軍は長く伸びた列のまま、本陣だけを突かれた。',
  sides: { a: { name: '今川義元の旗本', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信長の手', mon: 'oda', faction: 'oda' } },
  taisho: { b: { name: '織田信長', def: true } },
  // 両軍の数は元の戦の表（攻め手 約二千・本陣周辺 約六千）を入れ替えただけ
  force: (rt) => { const f = base.force(rt); return { a: f.b, a0: f.b0, b: f.a, b0: f.a0, aCaption: f.bCaption, bCaption: f.aCaption }; },
  jinkei: (base.jinkei || []).map((p) => ({ ...p, team: 1 - (p.team || 0) })),
  honjinStandards: () => null,
  // 布陣の表（fujin_layout.js の FUJIN.i10_okehazama＝元の表の side を入れ替えた写し。side は team）と奥の層は、元の本人の代わり（SH.ghost）の所から
  //   近い備を本物にし、織田の塊（side 1）はその代わりについて来る（fujin_place.js・depth_real.js の lazyFrom・fujinFollowSide。元の戦と同じ数・同じ重さ・K643）
  lazyFrom: () => (SH.flip && SH.ghost ? SH.ghost : null),
  fujinFollowSide: 1,
  objectiveEnemies: () => [],
  nameTagVisible: () => true,
  goalSignOff: () => false,
  goalSignTarget: (rt) => i10_okehazama.pin(rt),
  missionSignTarget: (rt) => i10_okehazama.pin(rt),
  victoryCaption: '沓掛の方へ退き、生き延びる',

  stageOf(rt) {
    const F = rt.flags;
    if (F.victory || !F.yoshimoto?.alive) return 6;
    if (F.koshiLeft || F.hattoriMet || F.yoshiDown) return 5;
    if (F.guardOpened) return 4;
    if (F.entered) return 3;
    if (rt.phase === 'assault') return 2;
    if (rt.phase === 'wait') return 1;
    return 0;
  },
  pin(rt) {
    const F = rt.flags; if (F.iWon) return null;
    const s = F.iStage ?? 0;
    if (s === 8) { const c = center(F.iRear); return c ? { x: c.x, z: c.z, label: '後備の陣の跡' } : { x: ATO.x, z: ATO.z, label: '後備の陣の跡' }; }
    if (s >= 6) return { x: KUTSU.x, z: KUTSU.z, label: s >= 7 ? '沓掛の道' : '沓掛' };
    if (s === 5) {
      const h = F.nobKill?.[0], m = F.nobKill?.[1];
      if (ready(h) && !F.hattoriWounded) return { x: h.pos.x, z: h.pos.z, label: '服部小平太' };
      if (ready(m)) return { x: m.pos.x, z: m.pos.z, label: '毛利新介' };
      const y = F.yoshimoto; return y?.alive ? { x: y.pos.x, z: y.pos.z, label: '義元様' } : { x: GATE.x, z: GATE.z, label: '輿の前' };
    }
    if (s === 3 || s === 4) return { x: GATE.x, z: GATE.z, label: s === 3 ? '幕の前' : '輿の前' };
    if (s === 1) { const c = center(F.road?.[0]); return c ? { x: c.x, z: c.z, label: '坂の下' } : { x: OKE_AT.matsui.x, z: OKE_AT.matsui.z, label: '坂の下' }; }
    if (s === 2) {
      const B = F.road?.[Math.min(Math.max(F.roadStep ?? 0, 0), 2)], c = center(B);
      return c ? { x: c.x, z: c.z, label: '列の切れ目' } : { x: GATE.x, z: GATE.z, label: '幕の口' };
    }
    const c = center(F.road?.[2]); return c ? { x: c.x, z: c.z, label: '前備' } : { x: OKE_AT.matsui.x, z: OKE_AT.matsui.z, label: '前備' };
  },

  *setup(rt) {
    const army = rt.army;
    // 元の筋の織田の本人へ向けた任務・行き先・褒美・台詞・札は出さない（任務はこの戦の六つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner, fin0 = rt.finish;
    const OURS = new Set(OBJ);
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._iObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._iObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.objRemove = ((f) => (id, ...r) => (id === 'main' && rt.flags._iObj ? f?.call(rt, id, ...r) : undefined))(rt.objRemove);
    rt.objProgress = ((f) => (id, ...r) => (id === 'main' ? f?.call(rt, id, ...r) : undefined))(rt.objProgress);
    rt.marker = (id, ...r) => (id === 'ipin' ? mk0.call(rt, id, ...r) : undefined);
    rt.award = (f, label, ...r) => (rt.flags._iObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._iSay || IMAGAWA_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._iSay ? ban0.call(rt, t, s, ...r) : undefined);
    // 元の終わり（織田の勝ち・織田の崩れ）は、今川の本人の勝ち負けに読み替える（本人が討たれた時だけ負け）
    rt.finish = (info = {}, delay) => {
      if (info.down || rt.flags._iFin) return fin0.call(rt, info, delay);
      if (!rt.player?.u?.alive) return undefined;
      // 元の締め（織田が首を持って引き揚げ終えた）が今川の退きの段（沓掛の追手・後備の跡・まとめ）より先に来たら、今川の段が済むまで待つ
      if (!info.failureReason && rt.flags.victory && (rt.flags.iStage ?? 0) < 9) { rt.flags.iBaseDone = true; return undefined; }
      i10_okehazama.iWin(rt, info.failureReason ? '本陣を守り切った' : null);
      return undefined;
    };
    // 本人の組は今川の旗本の具足と旗
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), ...IMAGAWA } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; rt.obj = obj0; rt.marker = mk0; rt.award = aw0; rt.say = say0; rt.banner = ban0; rt.finish = fin0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }   // 元の戦の setup（段に分けた function*）を丸ごと
    if (!SH.flip) console.warn('i10：側の入れ替えが効いていない');
    if (rt.player?.u) rt.player.u.faction = 'imagawa';
    const F = rt.flags;
    // この家の仕組み「大軍の綻び」：前備（松井宗信）・旗本・後備（本陣の後ろの備え）の間の金の帯（imagawa_obi.js）
    F.allies = [F.road?.[2], F.hatamoto, F.enemies?.[4]];
    F.obi = { a: 1, b: 1, t: 0 };
    F.obiAt = [OKE_AT.matsui, HONJIN, P(-4, -134)];
    F.iStage = -1;
    mk0.call(rt, 'ipin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.iGo(rt, 0);
    this.iSay(rt, 2, '今川義元', '丸根も鷲津も落ちたか。まことに目出度い。ここで一息入れよ', 3.6);
    this.iSay(rt, 6.5, '旗本の組頭', '列が長う伸びておる。お主が走れ。前備の松井殿に、本陣へ寄れと伝えよ', 3.6);
    this.iSay(rt, 11, '旗本の組頭', '金の帯をたどれ。細うなった所が、列の切れかけじゃ', 3.2);
  },
  iObj(rt, text) { const F = rt.flags; F._iObj = true; try { if (F.iObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.iObjText = text; } finally { F._iObj = false; } },
  iSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.iWon) return; rt.flags._iSay = true; try { rt.say(who, text, d); } finally { rt.flags._iSay = false; } }); },
  iBanner(rt, t, s) { rt.flags._iSay = true; try { rt.banner(t, s); } finally { rt.flags._iSay = false; } },
  iGo(rt, n) {
    const F = rt.flags;
    if (F.iWon || (F.iStage ?? -1) >= n) return;
    F.iStage = n;
    this.iObj(rt, OBJ[n]);
    if (n === 1) {
      this.iSay(rt, 0.5, '旗本の組頭', '西の空が暗い……。雨じゃ！　ひどい雨が来るぞ', 3.2);
      this.iSay(rt, 5, '旗本の組頭', '坂の下へ織田の物見が来る。雨に紛れて討て！', 3.2);
    } else if (n === 2) {
      this.iSay(rt, 0.5, '旗本の組頭', '帯が切れた！　その切れ目から、敵が入って来るぞ！', 3.2);
    } else if (n === 3) {
      this.iSay(rt, 0.5, '旗本の組頭', '幕の前まで来たぞ！　輿へ寄せるな！', 3);
    } else if (n === 4) {
      this.iBanner(rt, '旗本', '義元様を一人にしない');
      this.iSay(rt, 0.5, '今川義元', '慌てるな。三百騎で丸く囲め。輿は捨てよ、馬を引け', 3.6);
      this.iSay(rt, 5, '旗本の組頭', '二度、三度と来る！　囲みを崩すな！', 3);
    } else if (n === 5) {
      this.iBanner(rt, '膝の口', '義元、小平太の膝を斬る');
      this.iSay(rt, 0.5, '服部小平太', '義元公とお見受けいたす！', 2.8);
      this.iSay(rt, 3.4, '今川義元', '推参なり！', 2.4);
      this.iSay(rt, 6, '旗本の組頭', '御大将の脇を固めよ！　小平太を斬れ！', 3);
    } else if (n === 6) {
      this.iBanner(rt, '今川義元、討死', '旗本は五十騎ほどに減っていた');
      this.iSay(rt, 0.5, '旗本の組頭', '……御大将が討たれた。旗が倒れた。退け、沓掛へ退け！', 3.6);
      this.iSay(rt, 5, '旗本の組頭', '振り向くな。生きて駿河へ帰るのじゃ', 3);
    } else if (n === 7) {
      this.iSay(rt, 0.5, '使番', '織田の追手が沓掛の道へ回りまする！', 3);
      this.iSay(rt, 4, '旗本の組頭', 'ここで止めねば、皆討たれる', 3);
      // 追手：信長の馬廻の一手が本陣の跡から沓掛の道へ（本物の兵は 250 人の枠の内。数は前の i10 の追手と同じ十六）
      const from = { x: KUTSU.x + (HONJIN.x - KUTSU.x) * 0.55, z: KUTSU.z + (HONJIN.z - KUTSU.z) * 0.55 };
      F.iChase = this.iOda(rt, '織田の追手', from, KUTSU, 3, 12); F.iChaseT = rt.t;
    } else if (n === 8) {
      this.iSay(rt, 0.5, '旗本の組頭', '朝比奈の後備はもう退いた。陣の跡に入った織田を払い、道を開けよ', 3.4);
      F.iRear = this.iOda(rt, '後備の跡の織田', { x: ATO.x + 10, z: ATO.z - 10 }, ATO, 2, 10); F.iRearT = rt.t;
    } else if (n === 9) {
      this.iSay(rt, 0.5, '旗本の組頭', '生き残った者を集めよ。帯をたどって沓掛の道へ戻れ', 3.2);
    }
  },
  // 織田の小勢（本物の兵・team は織田の側）
  iOda(rt, name, from, to, sam, ash) {
    return commonGroup(rt, { team: SH.oda, faction: 'oda', name, anchor: from, facing: headTo(from, to), order: 'attack', aggro: 16, seekRange: 30, morale: 80 },
      [{ type: 'samurai', n: 1, o: { name: '', flag: 'oda' } }, { type: 'samurai', n: sam, o: { flag: 'oda' } }, { type: 'ashigaru', n: ash, o: { flag: 'oda' } }]);
  },
  iWin(rt, sub) {
    const F = rt.flags; if (F.iWon) return;
    F.iWon = true;
    F._iObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '桶狭間で義元の旗本として最後まで守り、生き延びた');
    } finally { F._iObj = false; }
    this.iBanner(rt, '桶狭間', sub || '本陣を守り、生き延びた');
    this.iSay(rt, 1, '旗本の組頭', '三百騎が、五十騎になるまで囲んだ。わしらは最後まで御大将を一人にせなんだ', 3.6);
    this.iSay(rt, 5, '朝比奈の侍', '後備は沓掛で固める。鳴海の岡部殿は、まだ城を守っておられるそうな', 3.4);
    if (rt.player?.u) rt.player.u.invuln = true;
    F._iFin = true;
    rt.after(9, () => { if (!rt.over) rt.finish({ scriptedEnd: true }, 4); });
  },
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags, O = F.obi, me = rt.player?.u;
    // 元の戦では織田の本人（倒れにくい本人と組）が今川の兵を討ち、寄せの先で刃を受けていた。この戦では本人が今川の側にいて、その分だけ織田の寄せが
    //   早く溶けた（描かずの数え：二百四十秒の織田の本物 元 56・入れ替え 24。布陣の表を元の本人の代わりから立てた後は 1.4 倍で百八十秒 72 対 元 141〜219・二百四十秒 20 対 元 56）。織田の組の受ける傷を二で割り、元の戦と同じ数の寄せが本陣まで届くようにする
    if (rt.t >= (F.iOdaT || 0)) {
      F.iOdaT = rt.t + 2;
      for (const g of rt.army.groups) if (g.team === SH.oda && !g._iOda && g.count) { g._iOda = true; g.defMult = (g.defMult || 1) * 2; }
    }
    // 元の戦では、坂の松井宗信は寄せた織田の兵（多くは本人のそば）が討つまで道を塞いだ。織田の寄せが届かないまま九十秒たてば、史実どおり討死させて段を進める
    { const m = F.matsui; if (m?.alive && F.matsuiAt != null && rt.t - F.matsuiAt > 90) { m.invuln = false; m.officerSaved = true; rt.army.kill(m, null); } }
    // 松井が討たれた後も本隊が坂に残り続けると段が進まない（元の戦では本人と組が討ち減らした）。三十秒たてば、元の坂の一・二の組と同じく崩れて退く
    { const m = F.matsui, mb = F.road?.[2];
      if (m && !m.alive && live(mb)) { F.iMatsuiDeadT ??= rt.t; if (rt.t - F.iMatsuiDeadT > 30 && mb.order !== 'retreat') { mb.order = 'retreat'; mb.noRout = false; mb.morale = 0; } } }
    if (!O || F.iWon || !me?.alive) return;
    const s = Math.max(F.iStage ?? 0, this.stageOf(rt));
    this.iGo(rt, s);
    const i = F.iStage;
    // 帯の太さ：前備へ走る間は細っていく（列が伸びる）。号令が届くと戻る。雨の段で切れる。本陣の守りの間に後ろの帯も細る
    if (i === 0) {
      const c = center(F.road?.[2]) || OKE_AT.matsui;
      if (!F.iMaeDone && Math.hypot(me.pos.x - c.x, me.pos.z - c.z) < 14) {
        F.iMaeDone = true; O.a = 1; sfx('kakegoe', 0.6);
        this.iSay(rt, 0.3, '松井宗信', '承った。前備は本陣へ寄せる', 3);
      } else if (!F.iMaeDone) O.a = Math.max(0.28, O.a - dt / 45);
    } else if (i === 1) {
      O.rainT = (O.rainT || 0) + dt;
      if (O.rainT > 4) O.a = Math.max(0, O.a - dt / 4);
    } else if (i >= 2) {
      O.a = 0;
      O.b = Math.max(0.2, O.b - dt / 70);
    }
    obiTick(rt, dt);
    // 退く段：沓掛に着いたら追手を止める段、追手を払うか七十秒持ちこたえたら勝ち
    if (i === 6 && Math.hypot(me.pos.x - KUTSU.x, me.pos.z - KUTSU.z) < 18) this.iGo(rt, 7);
    if (i === 7) {
      const g = F.iChase, left = g ? g.units.filter(ready).length : 0;
      if (left <= 4 || rt.t - (F.iChaseT ?? rt.t) > 70) this.iGo(rt, 8);
    }
    if (i === 8) {
      const g = F.iRear, left = g ? g.units.filter(ready).length : 0;
      if (left <= 3 || rt.t - (F.iRearT ?? rt.t) > 60) this.iGo(rt, 9);
    }
    if (i === 9 && Math.hypot(me.pos.x - KUTSU.x, me.pos.z - KUTSU.z) < 16) this.iWin(rt);
    // 元の筋（織田の本人の側）の終わりが来た時も、本人が生きて沓掛の方へ退いていれば勝ち
    if (i >= 9 && F.ending && F.returnDone && Math.hypot(me.pos.x - HONJIN.x, me.pos.z - HONJIN.z) > 40) this.iWin(rt);
  },
});

// 織田の桶狭間の地面・雨・田・道・林をそのまま使う（getter も写すため descriptor ごと）。迷った時の一言だけ今川の側に
i10_okehazama.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base.world));
i10_okehazama.world.blockedHint = () => '本陣へは幕の口から入れ';
export default i10_okehazama;
