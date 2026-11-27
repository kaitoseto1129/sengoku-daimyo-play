// ======================================================================
// 武田編 十四戦目「高遠城の戦い」（天正十年〔1582〕三月二日）（K563・docs/chapter_takeda.md）
//   史実：甲州征伐で、勝頼の弟 仁科盛信は三千で高遠城に籠り、織田信忠の五万の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、
//   城は一日で落ち、盛信は討死した。諏訪勝右衛門の妻は刀を抜いて斬って回った（『信長公記』「比類なき働き」・伊那市の高遠城址の案内）。主人公は仁科の城兵。
//
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：
//   前の作り（K651）は高遠城の戦場（takatoField）だけを借り、兵は軽い型で別に置いていた。
//   今は織田家編の高遠城（b_takato.js・b_takato_siege.js）の setup・update を丸ごと呼び、側だけを入れ替える（設楽原 d11・長篠城 d10 と同じ型）。
//   城兵（三の丸の諏訪勝右衛門・塀の上の鉄砲・二の丸の小山田昌行・西の搦手・本丸の仁科の衆・城方の控え・はな・台所の若衆）・
//   寄せ手（大手の森長可・鉄砲・河尻秀隆の後詰・団忠正の第二陣・西の搦手の信忠の旗本・梯子の手・南の押さえ）・両口の陣立て・
//   大手の打って出・門の開け閉め（城の側＝team の入れ替え）・曲輪ごとの落ち（三の丸→二の丸→本丸）は元のまま。
//   元の段の進みは、元の本人（織田の寄せ手）が寄せ道を歩いたであろう所（takato/side.js の SH.ghost）で同じ順に進む。
//   この紙に書くのは、城兵の本人の出る所・組・任務の行・逸話（はな）・勝ち負けだけ。
// 史料：『信長公記』巻十五。布陣図は docs/fujin/takato.md（側を入れ替えただけ）。
// ======================================================================
import { takato as base, TAKATO_WORLD, TAKATO_AT } from './b_takato.js';
import { SH } from './takato/side.js';
import { FUJIN } from './fujin_layout.js';
import { RANKS } from './state.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

// 布陣の表（fujin_layout.js の takato）も側を入れ替えて同じ所に立てる（表は戦の key で引く）
//   元の戦では本人の側（織田）の備が本人の前へ付き直し、城方は表の持ち場で待つ。d14 も同じ仕組み（本人の側＝城兵の備が本人の脇へ付く）
// K722②（11/27 クラウドか）：要件書の見せ場「敵軍の量。長篠以上に、もう援軍は来ないと分からせる」が台詞だけだった（元の表は見せる数のため両軍同数の十八塊ずつ）。
//   d14 の写しだけ、城兵（元の side 1）の塊を曲輪の内に近い六つに絞り、織田の十八塊と三対一にする（布陣図の約十対一へ寄る・兵は減るので重くならない）
const D14_KEEP = new Set(['tkTa1', 'tkTa2', 'tkTb1', 'tkTb2', 'tkTw1', 'tkTw2']);
if (FUJIN.takato && !FUJIN.d14_takato) FUJIN.d14_takato = { ...FUJIN.takato, ...(FUJIN.takato.noAttach ? { noAttach: FUJIN.takato.noAttach.map((s) => 1 - s) } : {}), rows: FUJIN.takato.rows.filter((r) => r.side === 0 || D14_KEEP.has(r.key)).map((r) => ({ ...r, side: 1 - r.side })) };

const T = TAKATO_AT;
const TAKEDA = { flag: 'takeda', armor: 0x1d1b1a };   // 元の戦の仁科の城兵（黒い具足）
const SPAWN = { x: 60, z: -6 };                         // 三の丸（大手門の内の広場の西）
const OTE_IN = { x: 66, z: 0 };                         // 大手門の内
const SAN_N = { x: 46, z: -30 };                        // 三の丸の北の段の口
const NI = { x: 6, z: 6 };                              // 二の丸（二の丸門の内）
const HON_MON = { x: -36, z: -6 };                      // 本丸門の前
const HON = { x: -54, z: 2 };                           // 本丸（主殿の前）
// 城兵の側の声だけを通す（元の戦の織田の本人へ向けた声は出さない）
const TAKEDA_VOICE = /^(仁科|諏訪|はな|小山田|城兵|組頭|物見|台所|武田|足軽頭)/;
const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (alive(g) ? g.center?.() : null);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
// 元の織田の本人の任務の札・導き・bot の癖・始めの眺め・途中からの続きは使わない
for (const k of ['checkpointStep', 'resumeSteps', 'resumeAt', 'botBrain', 'botDuel', 'botEvacuating', 'botCoverRetreat', 'botRetreatWay', 'botCoverBlocked', 'botDbg',
  'frameCamera', 'introText', 'introTaskFirst', 'compactIntro', 'openingWait', 'openingLinkedLabel', 'missionDangerText', 'retryReason', 'retryAdvice',
  'routeGuidePriority', 'travelGuideLabel', 'guidePlaceName', 'beats', 'missionPin', 'missionOf', 'missionHeading', 'missions', 'missionPinCaption',
  'missionEnemyLabel', 'missionSingleLine', 'commanderTarget', 'namedGuideTarget', 'introGoal', 'goalSignOnly', 'goalSignNoLabel', 'noMissionCall', 'marchIn']) delete D[k];   // marchIn：元の本人（織田）の行軍の入り

// 任務の字は kaito の直した紙（K669・ninmu10_words.js の takeda:d14_takato）のまま。元の段（大手→三の丸→二の丸→本丸門→本丸）に当てる
const OBJ = ['大手門の内で、門を破って入る織田勢を押し返せ', '大手門の内で、梯子を掛けて上がる織田の足軽を討て',
  '三の丸の北の段から上がって来る織田勢を討て', '三の丸で、森長可の先手の侍を討ち、二の丸の口を開けよ',
  '二の丸で諏訪勝右衛門の妻と並び、門を越えて来る織田勢を斬る', '二の丸の塀の下で、梯子を掛ける織田の兵を討て',
  '本丸門の前で、信忠の旗本を押し戻す', '本丸門の前で、押し入る織田の侍を討て',
  '本丸で仁科盛信と共に、最後まで戦う', '本丸で、仁科盛信の前に迫る織田の兵を討ち、最後まで戦え'];

export const d14_takato = Object.assign(D, {
  id: 'd14_takato',
  key: 'd14_takato',
  sideFlip: true,   // takato/side.js：織田が team 1、城兵（仁科）が team 0（元の戦の setup の頭で決まる）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI / 2 },   // 東（大手門）を向く
  noHorse: true,
  // K643：布陣の表と陣立ての厚みは、元の本人（織田）の代わり（SH.ghost）の所から近い備を本物にする（元の戦と同じ数・同じ重さ。fujin_place.js・depth_real.js の lazyFrom）
  lazyFrom: () => SH.ghost,
  noMarch: true,   // 城兵は城の内から始める（march_open.js の行軍の入りは、敵と反対へ七十歩下げるので織田の陣へ出てしまう）
  date: () => '天正十年（1582）三月二日　春の冷え　信濃国 高遠城',   // 元の戦と同じく関数（main.js が呼ぶ）
  intro: '織田信忠の五万が高遠城を囲んだ。仁科盛信は降伏を退けた。城兵三千で、大手から本丸まで守り抜け。',
  introText: '織田信忠の五万が高遠城を囲んだ。仁科盛信は降伏を退けた。城兵三千で、大手から本丸まで守り抜け。',
  introLords: ['仁科盛信', '織田信忠'],
  introYou: false,
  introPeople: [],
  history: '天正十年（1582）、甲州征伐で勝頼の弟 仁科盛信は高遠城に三千で籠り、織田信忠の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、城は一日で落ち、盛信は討死した。諏訪勝右衛門の妻は刀を抜いて斬って回り、比類なき働きと記された。',
  sides: { a: { name: '仁科盛信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '織田信忠の寄せ手', mon: 'oda', faction: 'oda' } },
  taisho: { a: { name: '仁科盛信', use: true }, b: { name: '織田信忠', def: true } },
  survives: [...(base.survives || []), '織田信忠', '森長可', '河尻秀隆'],
  // 両軍の数は元の戦の表（寄せ手三万・城兵三千と討たれた数）を入れ替えただけ
  force: (rt) => { const f = base.force(rt); return { a: f.b, a0: f.b0, b: f.a, b0: f.a0 }; },
  // 元の新手の置き場の決まり（foe＝本人の敵）を、側を入れ替えて使う（城兵の新手は大手門の内・寄せ手は大手道の筋）
  reserveOk: (rt, p, foe) => base.reserveOk(rt, p, !foe),
  victoryCaption: '本丸で最後まで戦う',
  nameTagVisible: () => true,
  goalSignOff: () => false,
  goalSignTarget: (rt) => d14_takato.pin(rt),
  missionSignTarget: (rt) => d14_takato.pin(rt),

  stageOf(rt) {
    const F = rt.flags, G = F.gates;
    if (F.honFell || F.lordDying) return 4;
    if (F.niFell) return 3;
    if (F.sanFell) return 2;
    if (G?.oteInner?.opened || G?.oteInner?.breached) return 1;
    return 0;
  },
  pin(rt) {
    const F = rt.flags; if (F.dWon) return null;
    const s = F.dStage ?? 0;
    if (s >= 4) return { x: HON.x, z: HON.z, label: '本丸' };
    if (s === 3) return { x: HON_MON.x, z: HON_MON.z, label: '本丸門' };
    if (s === 2) return { x: NI.x, z: NI.z, label: '二の丸' };
    if (s === 1) { const c = center(F.oteSpear?.real); return c && c.x < 80 ? { x: c.x, z: c.z, label: '森長可の先手' } : { x: SAN_N.x, z: SAN_N.z, label: '三の丸' }; }
    return { x: OTE_IN.x, z: OTE_IN.z, label: '大手門の内' };
  },
  // 元の本人（織田の寄せ手）が歩いたであろう所（元の段を同じ順に進める物差し）
  ghostPin(rt) {
    const F = rt.flags, G = F.gates;
    if (!G) return { x: 113, z: 4 };
    if (!(G.oteInner?.opened || G.oteInner?.breached)) return { x: 97, z: 0 };
    if (!F.sanFell) return T.san;
    if (!F.niFell) return T.ni;
    return T.hon;
  },

  *setup(rt) {
    const army = rt.army;
    // 元の筋の織田の本人へ向けた任務・行き先・褒美・台詞は出さない（任務はこの戦の五つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner, bark0 = rt.bark;
    const OURS = new Set(OBJ);
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.objProgress = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f?.call(rt, id, ...r) : undefined))(rt.objProgress);
    rt.objRemove = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f?.call(rt, id, ...r) : undefined))(rt.objRemove);
    rt.marker = (id, pos, ...r) => mk0.call(rt, id, id === 'dpin' ? pos : () => null, ...r);   // 元の印は立てるが所を出さない（元の筋が rt.markers から印を引く）
    rt.award = (f, label, ...r) => (rt.flags._dObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._dSay || TAKEDA_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._dSay ? ban0.call(rt, t, s, ...r) : undefined);
    rt.bark = (t, ...r) => (rt.flags._dSay ? bark0?.call(rt, t, ...r) : undefined);
    // 本人の組は仁科の城兵（黒い具足・割菱）
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), flag: TAKEDA.flag, armor: TAKEDA.armor } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; rt.obj = obj0; rt.marker = mk0; rt.award = aw0; rt.say = say0; rt.banner = ban0; rt.bark = bark0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }   // 元の戦の setup（段に分けた function*）を丸ごと
    if (!SH.flip) console.warn('d14：側の入れ替えが効いていない');
    SH.ghost = { x: 115, y: 0, z: 0 };   // 元の本人（織田）の出る所（布陣の表が一コマ目から元と同じ所を本物にする）
    if (rt.player?.u) rt.player.u.faction = 'takeda';
    // 本人の組（元の戦では織田の寄せ手の陣に立つ組）を、大手門の内の三の丸に
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: SPAWN.x - 3, z: SPAWN.z + 4 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    const F = rt.flags;
    F.dStage = -1;
    mk0.call(rt, 'dpin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.dGo(rt, 0);
    this.dSay(rt, 1.5, '仁科盛信', '降れと申すか。武田の者に、降る者はおらぬ', 3.2);
    this.dSay(rt, 6, '組頭', '大手を固めよ。織田は今日、一気に来るぞ', 3);
    this.dSay(rt, 10, '城兵', '谷も尾根も、織田の旗で埋まっておる……', 3);
    this.dSay(rt, 14, '仁科盛信', '新府からの後詰は、もう来ぬ。この城が、武田の最後の意地じゃ', 3.4);
  },
  dObj(rt, text) { const F = rt.flags; F._dObj = true; try { if (F.dObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.dObjText = text; } finally { F._dObj = false; } },
  dSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.dWon) return; rt.flags._dSay = true; try { rt.say(who, text, d); } finally { rt.flags._dSay = false; } }); },
  dBanner(rt, t, s) { rt.flags._dSay = true; try { rt.banner(t, s); } finally { rt.flags._dSay = false; } },
  dGo(rt, n) {
    const F = rt.flags;
    if (F.dWon || (F.dStage ?? -1) >= n) return;
    F.dStage = n;
    F.dK0 = rt.stats?.kills ?? 0; F.dSub = 0;
    this.dObj(rt, OBJ[2 * n]);
    if (n === 1) {
      this.dBanner(rt, '大手門が破られた', '森長可の先手が三の丸へ');
      this.dSay(rt, 0.5, '物見', '大手門が破られた！　北の段にも梯子が掛かったぞ', 3);
      this.dSay(rt, 4, '仁科盛信', '上がって来る者を一人ずつ落とせ', 2.8);
    } else if (n === 2) {
      this.dBanner(rt, '三の丸、落ちる', '城兵は二の丸へ退く');
      this.dSay(rt, 0.5, '仁科盛信', '三の丸は保てぬ。二の丸へ退け', 3);
      this.dSay(rt, 4, '城兵', '諏訪殿の女房が、刀を取って二の丸へ！', 3);
      this.dSay(rt, 8, '城兵', '織田は数万。援軍は、ついに来なんだ……', 3);
      this.dHana(rt);
    } else if (n === 3) {
      this.dBanner(rt, '二の丸、落ちる', '信忠が自ら塀に上ったと');
      this.dSay(rt, 0.5, '城兵', '信忠が塀の上に！', 2.6);
      this.dSay(rt, 3.5, '仁科盛信', '本丸の門を渡すな！', 2.6);
    } else if (n === 4) {
      this.dBanner(rt, '本丸', '城の火の手が上がる');
      this.dSay(rt, 0.5, '仁科盛信', '残る者、本丸に揃え。ここが武田の意地じゃ', 3.4);
    }
  },
  // 逸話の段（K652⑥・前の d14 と同じ）：はな（諏訪勝右衛門の妻）が二の丸で本人と並んで斬る。元の戦では本丸の奥で待つ（lastStand で放つ）はなを、二の丸の段の頭で放つ
  dHana(rt) {
    const F = rt.flags, h = F.hana, g = F.hanaGroup;
    if (!h?.alive || !g || F.hanaReleased) return;
    F.hanaReleased = true;
    const P = rt.player.u.pos, x = P.x - 2, z = P.z + 2, y = rt.world.heightAt(x, z);
    h.perch = null; h.noTarget = false; h.aiT = 0; h.invuln = true;
    if (Math.hypot(h.pos.x - P.x, h.pos.z - P.z) > 30) { h.pos.set(x, y, z); if (h.mesh) h.mesh.position.copy(h.pos); }   // 本丸の奥（見えない所）から本人の脇へ
    g.noAI = false; g.fixed = false; g.order = 'attack'; g.aggro = 14; g.seekRange = 18; g.anchor = { x, z };
    this.dSay(rt, 1.5, 'はな', '夫と共に死ぬ覚悟。ここは一歩も通さぬ', 3.2);
  },
  dWin(rt) {
    const F = rt.flags; if (F.dWon) return;
    F.dWon = true;
    F._dObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '本丸で最後まで戦った');
    } finally { F._dObj = false; }
    this.dBanner(rt, '高遠城 最後まで戦う', '城は一日で落ち、仁科盛信は討死した');
    this.dSay(rt, 1, '城兵', '……仁科様、お討死', 2.8);
    this.dSay(rt, 4, '組頭', '生き残った者は新府へ走れ。御屋形様に、高遠は最後まで戦ったと伝えよ', 3.6);
    if (rt.player?.u) rt.player.u.invuln = true;
    if (!rt.over && !F.ending) { F.ending = true; rt.setPhase('end'); rt.finish({}, 9); }
  },
  // 元の勝ち（盛信を討って本丸の旗を守る）は織田の本人の物。城兵の本人は、本丸が落ちてから七十秒を生き抜くか、盛信が倒れるまで戦えば勝ち
  win() {},
  update(rt, dt) {
    const F = rt.flags;
    base.update.call(this, rt, dt);
    if (F.dWon || !rt.player?.u?.alive) return;
    this.dGo(rt, this.stageOf(rt));
    // K674：段ごとの二つ目の任務＝その段で寄せ手を四人討つ（本人が実際に戦った数）
    if (!F.dSub && (F.dStage ?? -1) >= 0 && (rt.stats?.kills ?? 0) - (F.dK0 ?? 0) >= 4) { F.dSub = 1; this.dObj(rt, OBJ[2 * F.dStage + 1]); }
    if ((F.honFell && rt.t - (F.honT ?? rt.t) > 70) || F.keep?.down || F.keepFell || F.lordState === 'dead') this.dWin(rt);
    else if (F.ending && rt.tracker.main === false) this.dWin(rt);   // 寄せ手が崩れて退いた（元の戦の負け）＝城兵の勝ち
  },
});
// 地面・川・道・木は元の戦の物（元の world は変えない）
d14_takato.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(TAKATO_WORLD));

export default d14_takato;
