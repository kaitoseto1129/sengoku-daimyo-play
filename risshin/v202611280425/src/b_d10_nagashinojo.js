// ======================================================================
// 武田編 十戦目「長篠城攻め」（天正三年〔1575〕五月十四日〜十六日）（K563・docs/chapter_takeda.md）
//   史実：勝頼は奥平信昌が五百で籠る長篠城を一万五千で囲んだ。城は寒狭川（豊川）と宇連川の合わさる崖の上。武田は北の大手と塀へ寄せ、
//   金掘りで塀を崩し、火矢で兵糧蔵を焼き、竹束で鉄砲を防いで攻めた。城の鳥居強右衛門は夜に宇連川を潜って囲みを抜け、岡崎へ援軍を頼み、
//   戻る所を捕らえられ、城の対岸で「援軍は来る」と叫んで磔にされた（『信長公記』『三河物語』・新城市の長篠城址史跡保存館の案内）。主人公は寄せ手の足軽。
//
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：
//   前の作り（K651）は長篠城の戦場（nagaField）だけを借り、兵は軽い型で別に置いていた。
//   今は長篠編の長篠城籠城（b_nagashinojo.js）の setup・update を丸ごと呼び、側だけを入れ替える（設楽原 d11 と同じ型・docs/k651_howto.md の五）。
//   城兵（奥平信昌・槍の組三つ・狭間の鉄砲十八・櫓の鉄砲二・本丸の守り）・武田の囲み（井楼の鉄砲・竹束の鉄砲・勝頼の本陣・陣立ての備）・
//   寄せの波（一の寄せ→火矢→夕暮れに強右衛門が抜ける→二日後の磔→総がかり）・梯子・金掘り・塀の破れは元のまま。
//   元の段の進みは、元の本人（城兵）が持ち場を追って歩いた所（nagashinojo/side.js の SH.ghost）で同じ順・同じ間に進む。
//   この紙に書くのは、武田の本人の出る所・任務の行・台詞・勝ち負けだけ。敵と味方の色・旗・隊の札は側で入れ替わる（team 0 が本人の側）。
//   城の鉄砲（holdFire の訳）：bhelp の号令待ち（holdFire）は、四十五m の内の本人へは army_think.js の closeShot が号令を飛ばして撃つ
//   （近すぎる敵は待たずに撃つ決まり）。前の作りで塀の内に据えた鉄砲が動かない本人を二十秒で倒したのはそのため。
//   ここでは止めずに撃たせ（城攻めの本当の怖さ）、城兵の組の本人への倍（dmgMultPlayer）だけを前の d10 と同じ〇・三五に。
// 史料：『信長公記』『三河物語』。布陣図は docs/fujin/nagashinojo.md（側を入れ替えただけ）。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { nagashinojo as base, NAGA_AT, NAGA_WORLD } from './b_nagashinojo.js';
import { SH, allyGroup, enemyGroup } from './nagashinojo/side.js';
import { palisade, makeSimpleBatch, finalizeSimpleBatch, nobori } from './props.js';
import { FUJIN } from './fujin_layout.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

if (BATTLE_ASSETS.nagashinojo) BATTLE_ASSETS.d10_nagashinojo = BATTLE_ASSETS.nagashinojo;
// 布陣の表（fujin_layout.js の nagashinojo：武田の北の坂・医王寺山・有海原の備）も側を入れ替えて同じ所に立てる（表は戦の key で引く）
if (FUJIN.nagashinojo && !FUJIN.d10_nagashinojo) FUJIN.d10_nagashinojo = { ...FUJIN.nagashinojo, noAttach: (FUJIN.nagashinojo.noAttach || []).map((s) => 1 - s), rows: FUJIN.nagashinojo.rows.map((r) => ({ ...r, side: 1 - r.side })) };

const A = NAGA_AT, GX = A.GATE.x, NZ = A.N_Z;
const START = { x: GX - 8, z: -76 };                     // 北の坂の下（竹束の列の三十m 手前）。前の d10 と同じ
const TAKETABA = { x: GX - 6, z: NZ - 21 };              // 竹束の列（大手道の脇）
const WATCH = { x: 45, z: 53 };                          // 宇連川の川べりの見張り（元の戦の F.watch の持ち場）
const TAIGAN = { x: 24, z: 74 };                         // 城の対岸の磔の場の脇
// 武田の側の声だけを通す（元の戦の城兵の本人へ向けた声は出さない）
const TAKEDA_VOICE = /^(鳥居強右衛門|武田|勝頼|小山田|山県|内藤|馬場|真田|土屋|穴山|一条|金掘り|赤備え|物見|組頭|足軽頭|使番|井楼)/;
const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (alive(g) ? g.center?.() : null);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
// 元の城兵の本人の導き・持ち場・bot の癖・始めの眺め・天下の縁は使わない
for (const k of ['autoLeadTarget', 'frameCamera', 'botBrain', 'canSkip', 'skip', 'onFinish', 'takenMult', 'tutorialHold', 'camLift', 'quietArmyCalls', 'marchIn']) delete D[k];   // marchIn：元の本人（城兵）の行軍の入り

// 任務の字は kaito の直した紙（K669・ninmu10_words.js の takeda:d10_nagashinojo）のまま。元の段の順（一の寄せ→火矢→夕暮れ→強右衛門→二日後の磔→総がかり）に当てる
// 11/27 クラウドわ（K722 ①包囲 ②柵を作る・K656 長さ）：火矢の後・夕暮れの前に「鹿垣を結ぶ」段（2）を足した。
//   史実：力攻めで落ちぬと見た勝頼は、城の周りに鹿垣を結い回して囲み、兵糧攻めに替えた（『三河物語』）。
const OBJ = ['竹束の列を抜けて塀の前へ寄せ、打って出る城兵を押し返せ', '北東の角の金掘りの穴を守り、打って出た城兵を討て',
  '北の野に鹿垣を結ぶ足軽を守り、打って出る城兵を押し返せ', '城の東の崖下を回り、宇連川の岸へ下りる',
  '鳴子が鳴った。川を渡って城へ戻る鳥居強右衛門を捕らえよ', '城の対岸の磔の前で、怒って打って出る城兵を受ける', '大手門へ寄せ、門の前に出た奥平の手を押し戻す'];
// K674（11/26 Sanae）：一戦10任務。段のうち四つに、その段で城兵を四人討て任務を足す
const SUB = { 0: '竹束の陰から、塀の狭間の鉄砲を撃つ城兵の足軽を四人討て', 1: '火矢の隊を狙う、城の弓の兵を四人討て', 2: '杭を打つ足軽へ斬り込む城兵を四人討て', 5: '磔の前へ打って出た奥平の侍を四人討て', 6: '大手門の前の、奥平の旗本を四人討て' };
const SAKU = [[-36, -54], [-25, -58], [-14, -62]];       // 鹿垣の筋（大手道の西・北の野の坂。大手道と崖は塞がない）
const SAKU_C = { x: -25, z: -58 };
const SAKU_OUT = { x: -28, z: -31 };                    // 城兵が打って出る北西の塀の脇
const KAWA = { x: 68, z: 40 };                           // 城の東の崖下（宇連川へ下りる所）
// 11/28 クラウド 長篠城の持ち主（act bot --mobile 3本：竹束・金掘りの二段の任務は「打って出る城兵」なのに一人も出ず、
//   本人は塀の前で塀の内の槍の組（自分の塀の二・五m 内は塀越しに届く）に一方的に突かれた＝突き31・当たり0・倒れ2／3、金掘りの印で6秒何も起きない）。
//   史実でも城兵は門脇・塀の角から打って出て寄せ手の竹束・金掘りを崩した（『三河物語』）。二段とも塀の外の野へ城兵の組を出し、印をそこへ向ける
const OUT0 = { x: GX + 12, z: NZ - 9 };                  // 大手門の東の塀の脇（竹束の列の東の野へ打って出る）
const OUT1 = { x: A.kanahori.x - 3, z: A.kanahori.z + 5 };   // 北東の角の外（金掘りの穴の城の側）

export const d10_nagashinojo = Object.assign(D, {
  id: 'd10_nagashinojo',
  key: 'd10_nagashinojo',
  sideFlip: true,   // nagashinojo/side.js：城兵（奥平）が team 1、武田が team 0（元の戦の setup の頭で決まる）
  spawn: { x: START.x, z: START.z, heading: 0 },   // 南（城）を向く
  noHorse: true,   // 崖の上の城への坂。寄せ手も徒歩（元の戦と同じ）
  // 一太刀の床（player_hurt.js：命の五割×組の倍）は、組の倍を〇・三五にしても半分止まりで、塀越しの槍が毎回25になっていた（act bot 11/28：
  //   足軽が一の寄せ 73〜83秒に槍の組の25を六度受けて倒れた・3回に2回）。城兵の組の倍（〇・三五／塀の槍〇・一五）を床にも四分の一まで効かせる
  floorGmMin: 0.25,
  intro: '奥平の城兵五百が、川の崖の上の長篠城に籠っている。竹束の陰から、大手門と北の塀へ寄せよ。',
  introText: '奥平の城兵五百が、川の崖の上の長篠城に籠っている。竹束の陰から、大手門と北の塀へ寄せよ。',
  introLords: ['武田勝頼', '奥平信昌'],
  introYou: false,
  introPeople: [],
  history: '天正三年（1575）五月、武田勝頼は奥平信昌の籠る長篠城を一万五千で囲んだ。武田は北の大手と塀へ寄せ、金掘りで塀の下を崩し、火矢で兵糧蔵を焼いたが、城は持ちこたえた。城の鳥居強右衛門は囲みを抜けて岡崎へ援軍を頼み、戻る所を捕らえられ、城の対岸で援軍の来ることを叫んで磔にされた。数日の後、織田・徳川の大軍が設楽原に着く。',
  sides: { a: { name: '武田勝頼の寄せ手', mon: 'takeda', faction: 'takeda' }, b: { name: '奥平信昌の城兵', mon: 'okudaira', faction: 'tokugawa' } },
  taisho: { a: { name: '武田勝頼', use: true }, b: { name: '奥平信昌', def: true } },
  survives: [...(base.survives || []), '武田勝頼', '奥平信昌'],
  // 両軍の数は元の戦の表（城兵五百・寄せ手一万五千と討たれた数）を入れ替えただけ
  force: (rt) => { const f = base.force(rt); return { a: f.b, a0: f.b0, b: f.a, b0: f.a0 }; },
  victoryCaption: '囲みを保ち、設楽原へ',
  nameTagVisible: () => true,
  goalSignOff: () => false,
  goalSignTarget: (rt) => d10_nagashinojo.pin(rt),
  missionSignTarget: (rt) => d10_nagashinojo.pin(rt),
  // 元の段（phase）から武田の任務の段を決める
  stageOf(rt) {
    const F = rt.flags, ph = rt.phase, P = rt.player.u.pos;
    if (ph === 'final' || ph === 'end') return 6;
    if (ph === 'news') return 5;
    if (ph === 'sune' && (F.d10Kawa || Math.hypot(P.x - KAWA.x, P.z - KAWA.z) < 16 || (F.suneG?.pathIdx || 0) >= 3)) { F.d10Kawa = true; return 4; }
    if (ph === 'sune' || (ph === 'lull' && F.d10SakuDone)) return 3;
    if (F.d10Saku) return 2;
    if (rt.flags.fire === 'active') return 1;
    return 0;
  },
  pin(rt) {
    const F = rt.flags; if (F.dWon) return null;
    const s = F.dStage ?? 0;
    if (s >= 6) { const g = (F.d10Out6 || []).find(alive) || (F.fin || []).find(alive), c = center(g); return c ? { x: c.x, z: c.z, label: g.name } : { x: GX, z: NZ - 6, label: '大手門' }; }
    if (s === 5) { const c = center(F.d10Sally); return c ? { x: c.x, z: c.z, label: '搦手の打って出' } : { x: TAIGAN.x, z: TAIGAN.z, label: '磔の場' }; }
    if (s === 4) { const q = F.sune; return q?.alive ? { x: q.pos.x, z: q.pos.z, label: '鳥居強右衛門' } : { x: WATCH.x, z: WATCH.z, label: '宇連川の岸' }; }
    if (s === 3) return { x: KAWA.x, z: KAWA.z, label: '城の東の崖下' };
    if (s === 2) { const g = (F.d10SakuE || []).find(alive) || (F.d10SakuW || []).find(alive), c = center(g); return c ? { x: c.x, z: c.z, label: g.name } : { x: SAKU_C.x, z: SAKU_C.z, label: '鹿垣' }; }
    if (s === 1) { const g = (F.d10Out1 || []).find(alive), c = center(g); return c ? { x: c.x, z: c.z, label: g.name } : { x: A.kanahori.x + 2, z: A.kanahori.z - 4, label: '金掘りの穴' }; }
    const g = (F.d10Out0 || []).find(alive) || (F.w1 || []).find(alive), c = center(g);
    return c ? { x: c.x, z: c.z, label: g.name } : { x: TAKETABA.x, z: TAKETABA.z, label: '竹束の列' };
  },
  // 元の本人（城兵）が歩いたであろう所（元の段を同じ順に進める物差し）
  ghostPin(rt) {
    const F = rt.flags, ph = rt.phase;
    if (ph === 'sune' && F.sune?.alive) return F.sune.pos;
    if (ph === 'news' || ph === 'end') return { x: 6, z: A.S_Z - 5 };
    if (F.fire === 'active') return { x: A.KURA.x, z: A.KURA.z - 4 };
    if (ph === 'final') return { x: GX, z: NZ + 8 };
    return { x: -28, z: -20.8 };   // 元の戦の始めの持ち場（北の塀の西の端）
  },

  setup(rt) {
    const army = rt.army;
    // 元の筋の城兵の本人へ向けた任務・行き先・褒美・台詞・手ほどき・掟は出さない（任務はこの戦の五つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner, bark0 = rt.bark, ia0 = rt.addInteract, vio0 = rt.violation;
    const OURS = new Set([...OBJ, ...Object.values(SUB)]);
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.objProgress = ((f) => (id, ...r) => (id === 'main' ? f?.call(rt, id, ...r) : undefined))(rt.objProgress);
    rt.objRemove = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f?.call(rt, id, ...r) : undefined))(rt.objRemove);
    rt.marker = (id, ...r) => (id === 'dpin' ? mk0.call(rt, id, ...r) : undefined);
    rt.award = (f, label, ...r) => (rt.flags._dObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._dSay || TAKEDA_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._dSay ? ban0.call(rt, t, s, ...r) : undefined);
    rt.bark = (t, ...r) => (rt.flags._dSay ? bark0.call(rt, t, ...r) : undefined);
    rt.addInteract = (id, ...r) => (/^fire/.test(id) ? undefined : ia0?.call(rt, id, ...r));   // 蔵の火を消すのは城兵
    rt.violation = () => {};
    // 本人の組は武田の花菱
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), flag: 'takeda' } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; rt.obj = obj0; rt.marker = mk0; rt.award = aw0; rt.say = say0; rt.banner = ban0; rt.bark = bark0; rt.addInteract = ia0; rt.violation = vio0; });
    base.setup.call(this, rt);   // 元の戦の setup を丸ごと（城兵・囲み・井楼・竹束の鉄砲・勝頼の本陣・遠景・一の寄せの時刻）
    if (!SH.flip) console.warn('d10：側の入れ替えが効いていない');
    if (rt.player?.u) rt.player.u.faction = 'takeda';
    const F = rt.flags;
    F.dStage = -1;
    mk0.call(rt, 'dpin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.dGo(rt, 0);
    this.dSay(rt, 1.5, '武田信豊', '城の鉄砲は塀の狭間から撃ってくる。竹束を楯に寄せよ', 3.2);
    this.dSay(rt, 6, '組頭', '南と西は崖じゃ。攻め口は北の大手しかない。寄せの太鼓を待て', 3);
  },
  dObj(rt, text) { const F = rt.flags; F._dObj = true; try { if (F.dObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.dObjText = text; } finally { F._dObj = false; } },
  dSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.dWon) return; rt.flags._dSay = true; try { rt.say(who, text, d); } finally { rt.flags._dSay = false; } }); },
  dBanner(rt, t, s) { rt.flags._dSay = true; try { rt.banner(t, s); } finally { rt.flags._dSay = false; } },
  dGo(rt, n) {
    const F = rt.flags;
    if (F.dWon || (F.dStage ?? -1) >= n) return;
    F.dStage = n; F.dK0 = rt.stats?.kills ?? 0; F.dSub = 0;
    this.dObj(rt, OBJ[n]);
    if (n === 0) {
      F.d10Out0 = [];
      rt.after(26, () => { if (!F.dWon && (F.dStage ?? 0) === 0) F.d10Out0.push(this.dSally(rt, '大手脇の打って出', OUT0, 1, 7, '大手の脇から城兵が打って出た！　竹束を崩しに来るぞ')); });
    } else if (n === 1) {
      F.d10Out1 = [];
      rt.after(2.5, () => { if (!F.dWon && F.dStage === 1) F.d10Out1.push(this.dSally(rt, '角の打って出', OUT1, 1, 6, '北東の角から城兵が出た！　金掘りの穴を埋めに来る')); });
      this.dSay(rt, 0.5, '武田の弓頭', '火矢を番えよ！　狙うは二の丸の兵糧蔵じゃ', 3);
      this.dSay(rt, 4.5, '組頭', '火矢の隊を城兵に討たせるな！', 2.8);
    } else if (n === 2) {
      this.dBanner(rt, '鹿垣を結ぶ', '力攻めをやめ、城を囲んで兵糧を断つ');
      this.dSay(rt, 0.5, '武田勝頼', '城は力では落ちぬ。鹿垣を結い回し、蟻の這い出る隙もなく囲め', 3.4);
      this.dSay(rt, 5, '組頭', '杭を打つ者を守れ！　城兵が打って出てくるぞ', 2.8);
    } else if (n === 3) {
      this.dBanner(rt, '夕暮れ', '寄せ手はいったん兵を引いた');
      this.dSay(rt, 1, '武田勝頼', '川べりの見張りを固めよ。鳴子の綱を見張れ', 3);
    } else if (n === 4) {
      this.dSay(rt, 0.5, '物見', '城の搦手の崖を、人が下りて行く！　宇連川へ潜る気じゃ', 3.4);
      this.dSay(rt, 4, '足軽', '鳴子が鳴った！　川の中に人影じゃ！', 2.8);
    } else if (n === 5) {
      this.dBanner(rt, '――二日後', '強右衛門を捕らえた');
      this.dSay(rt, 0.5, '武田勝頼', '強右衛門を城の対岸へ引き出せ。城へ「援軍は来ぬ」と言わせよ', 3.4);
      // K722 ⑧⑨：遠くの城兵へ強右衛門の声が届き、城内から歓声（磔の姿は見せず声だけ）
      this.dSay(rt, 5, '鳥居強右衛門', '援軍は来る！　あと数日、持ちこたえよ！', 3.2);
      this.dSay(rt, 9, '城兵', 'おおーっ！　援軍が来るぞ！', 2.8);
      // K722②⑨（11/27 クラウドし）：城内の歓声が台詞だけで、対岸から見る城に何も起きなかった。
      //   歓声に合わせ、南の塀の内に奥平・徳川の幟を東から西へ一本ずつ起こし、しばらく左右に振る（城の気が上がったのを絵で）。
      //   字は足さない。幟は当たりを持たない（形・材質は nobori の共用）。この段で初めて作る
      rt.after(8.6, () => this.dCheer(rt));
      this.dSay(rt, 14, '武田勝頼', '……見事な者よ。城の気は、かえって上がったか', 3.2);
      // 逸話の段（K652⑥・前の d10 と同じ）：強右衛門の声を聞いた城兵が、搦手から打って出る（城の側の組・本人への倍は他の城兵と同じ）
      rt.after(9, () => {
        const F = rt.flags; if (F.dWon || rt.phase !== 'news') return;
        F.d10Sally = allyGroup(rt, { faction: 'tokugawa', name: '搦手の打って出', anchor: { x: TAIGAN.x + 10, z: TAIGAN.z - 14 }, facing: 0, order: 'attack', aggro: 30, seekRange: 40, width: 6, morale: 90, dmgMultPlayer: 0.35 },
          [{ type: 'samurai', n: 2, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: 12, o: { flag: 'okudaira' } }]);
        this.dSay(rt, 0.5, '物見', '搦手から城兵が打って出た！　強右衛門の仇と叫んでおる！', 3);
      });
    } else if (n === 6) {
      // 11/28 クラウド 長篠城の持ち主（act bot 3本：総がかりの印が味方の寄せの塊で、着いても塀の向こうの城兵に届かず6秒何も起きない・4本に7度）：
      //   任務の通り「門の前に出た奥平の手」を大手の脇から出す（討ち払うたびに次・四度まで）
      F.d10Out6 = []; F.d10Out6T = rt.t + 6;
      this.dBanner(rt, '武田の総がかり', '大手門と北の塀へ');
      this.dSay(rt, 0.5, '小山田昌行', '総がかりじゃ！　大手門を打ち破れ！', 3);
      this.dSay(rt, 5, '組頭', '梯子を掛けよ！　塀の上の槍に気をつけい', 2.8);
    }
  },
  dCheer(rt) {
    const F = rt.flags; if (F.dWon || F.d10Cheer) return;
    F.d10Cheer = true;
    const S = A.S_Z - 3;
    [[26, S, 'okudaira'], [18, S - 1, 'tokugawa'], [10, S, 'okudaira'], [2, S - 1, 'okudaira'], [-6, S, 'tokugawa'], [-14, S - 1, 'okudaira'], [-22, S, 'okudaira'], [-30, S - 1, 'okudaira']].forEach(([x, z, k], i) => {
      const n = nobori(rt.world, x, z, k, 6.5);
      n.userData.noFreeze = true; n.visible = false; rt.scene.add(n);
      const r0 = n.rotation.z, r1 = r0 - 1.4, t0 = i * 0.45;
      rt.after(t0, () => { n.rotation.z = r1; n.visible = true; });
      for (let j = 1; j <= 12; j++) rt.after(t0 + j * 0.08, () => { n.rotation.z = r1 + (r0 - r1) * (1 - (1 - j / 12) ** 2); });
      // 起きた後、八秒ほど左右に振る（振れ幅は次第に小さく）
      for (let j = 1; j <= 40; j++) rt.after(t0 + 1 + j * 0.2, () => { n.rotation.z = r0 + Math.sin(j * 0.9 + i) * 0.22 * (1 - j / 40); });
    });
  },
  // 元の戦は一の寄せの後の一息（lull）から十秒で夕暮れ（startSune）へ進む。d10 は間に鹿垣の段を挟み、済んでから元の夕暮れへ
  startSune(rt) {
    const F = rt.flags;
    if (F.d10SakuDone || F.dWon) return base.startSune.call(this, rt);
    if (!F.d10Saku) this.dSakuStart(rt);
  },
  dSakuStart(rt) {
    const F = rt.flags;
    F.d10Saku = { t0: rt.t, w2: false };
    F.d10SakuW = [enemyGroup(rt, { name: '鹿垣を結ぶ足軽', faction: 'takeda', anchor: { ...SAKU_C }, fixed: true, facing: 0, order: 'hold', aggro: 6, width: 8, morale: 85 },
      [{ type: 'ashigaru', n: 8, o: { flag: 'takeda' } }])];
    F.d10SakuE = [];
    rt.after(6, () => { if (!F.dWon && !F.d10SakuDone) F.d10SakuE.push(this.dSakuSally(rt, '奥平の打って出', 1, 8)); });
  },
  // 竹束・金掘りの段の打って出（塀の外の野で斬り合う。組の本人への倍は他の城兵と同じ〇・三五）
  dSally(rt, name, at, sam, ash, call) {
    const g = allyGroup(rt, { faction: 'tokugawa', name, anchor: { ...at }, facing: Math.PI, order: 'attack', aggro: 30, seekRange: 40, width: 6, morale: 80, dmgMultPlayer: 0.35 },
      [{ type: 'samurai', n: sam, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: ash, o: { flag: 'okudaira' } }]);
    this.dSay(rt, 0.3, '物見', call, 2.8);
    return g;
  },
  // 一の打って出を討ち払ったら、同じ段のうちにもう一度（印に着いて何も起きない間を作らない・段ごとに二度まで）
  dSallyTick(rt) {
    const F = rt.flags, s = F.dStage;
    if (s === 6) {
      const L6 = F.d10Out6; if (!L6 || L6.length >= 4 || L6.some(alive) || rt.t < F.d10Out6T) return;
      const w = L6.length % 2 === 0;
      L6.push(this.dSally(rt, L6.length ? `奥平の手（${'一二三四'[L6.length]}）` : '奥平の手', w ? { x: GX - 10, z: NZ - 7 } : OUT0, 1 + (L6.length >> 1), 6, w ? '門の西の塀の脇から、奥平の手が打って出た！' : '門の東から城兵が出た！　押し戻せ'));
      F.d10Out6T = rt.t + 8;
      return;
    }
    const L = s === 0 ? F.d10Out0 : s === 1 ? F.d10Out1 : null;
    if (!L || L.length !== 1 || L.some(alive)) return;
    if (s === 0) L.push(this.dSally(rt, '大手脇の打って出（二）', OUT0, 1, 8, 'また大手の脇から打って出た！'));
    else L.push(this.dSally(rt, '角の打って出（二）', OUT1, 2, 7, '角から新手の城兵じゃ！　穴を守れ'));
  },
  dSakuSally(rt, name, sam, ash) {
    const g = allyGroup(rt, { faction: 'tokugawa', name, anchor: { ...SAKU_OUT }, fixed: true, facing: Math.PI, order: 'attack', aggro: 30, seekRange: 45, width: 6, morale: 80, dmgMultPlayer: 0.35 },
      [{ type: 'samurai', n: sam, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: ash, o: { flag: 'okudaira' } }]);
    this.dSay(rt, 0.3, '物見', '北西の塀の脇から、城兵が鹿垣へ打って出た！', 2.8);
    return g;
  },
  dSakuTick(rt) {
    const F = rt.flags, S = F.d10Saku; if (!S || F.d10SakuDone || F.dWon) return;
    const el = rt.t - S.t0, E = F.d10SakuE;
    // 一の打って出を討ち払ったら、待たせずに二の打って出（印に着いて何も起きない間を作らない）
    if (!S.w2 && (el > 50 || (E.length >= 1 && !E.some(alive) && el > 14))) { S.w2 = true; E.push(this.dSakuSally(rt, '奥平の打って出（二）', 2, 10)); }
    const clear = S.w2 && E.length >= 2 && !E.some(alive);
    if (!((clear && el > 95) || el > 170)) return;
    F.d10SakuDone = true;
    for (const g of E) if (alive(g)) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeDir = { x: 0, z: 1 }; g.fleeSet = true; }
    // 結い終えた鹿垣（飾りの柵。当たりは付けず、後の段の道を塞がない）
    const batch = makeSimpleBatch();
    for (let i = 0; i < SAKU.length - 1; i++) {
      const [ax, az] = SAKU[i], [bx, bz] = SAKU[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 6));
      for (let j = 0; j < n; j++) {
        const m = palisade(rt.world, [ax + (bx - ax) * j / n, az + (bz - az) * j / n, ax + (bx - ax) * (j + 1) / n, az + (bz - az) * (j + 1) / n], { batch });
        if (m && !m.isBatchedPart) rt.scene.add(m);
      }
    }
    finalizeSimpleBatch(rt, batch);
    this.dBanner(rt, '鹿垣が結ばれた', '長篠城は囲まれた');
    this.dSay(rt, 0.5, '武田勝頼', 'これで城の兵糧は尽きる。あとは待つだけじゃ', 3);
    rt.after(4, () => base.startSune.call(this, rt));
  },
  dWin(rt) {
    const F = rt.flags; if (F.dWon) return;
    F.dWon = true;
    F._dObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '長篠城の囲みを保った');
    } finally { F._dObj = false; }
    this.dBanner(rt, '長篠城 囲みを保つ', '城は落ちぬまま、織田・徳川の大軍が設楽原に着いた');
    this.dSay(rt, 1, '使番', '織田・徳川の大軍が、設楽原の連吾川の向こうに柵を結んでおりますと', 3.4);
    this.dSay(rt, 5, '武田勝頼', '城は後じゃ。設楽原で信長と家康を討てば、この戦は終わる', 3.4);
    if (rt.player?.u) rt.player.u.invuln = true;
  },
  // 元の勝ち（後詰の旗が見えるまで守り抜く）は武田の側では「囲みを保って設楽原へ向かう」。元の win が後詰の旗・寄せ手の退き・終わりの時刻を受け持つ
  win(rt) { base.win.call(this, rt); this.dWin(rt); },
  // 本丸の館が落ちれば城攻めの勝ち（史実では落ちない）
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s && s === F.hall) { if (!F.dWon) { this.dWin(rt); F.won = true; rt.setPhase('end'); rt.finish({}, 7); } return; }
    return base.onStructDestroyed.call(this, rt, s);
  },
  update(rt, dt) {
    const F = rt.flags;
    // 城兵の組の刃と弾は本人へは前の d10 と同じ〇・三五（城兵どうし・寄せ手への強さは元のまま）。
    // 塀に付いて塀越しに突く槍の組（wallGuard）は〇・一五（act bot 11/28：足軽が一の寄せ 83秒に塀の内の槍の組に見えない向きから六度突かれ倒れた・3回に2回）
    if ((F.d10HurtT = (F.d10HurtT || 0) - dt) <= 0) { F.d10HurtT = 1; for (const g of rt.army.groups) if (g.team === SH.oda && g.dmgMultPlayer == null) g.dmgMultPlayer = g.wallGuard ? 0.15 : 0.35; }
    base.update.call(this, rt, dt);
    if (F.dWon || !rt.player?.u?.alive) return;
    this.dSakuTick(rt);
    this.dSallyTick(rt);
    this.dGo(rt, this.stageOf(rt));
    if (!F.dSub && SUB[F.dStage] && (rt.stats?.kills ?? 0) - (F.dK0 ?? 0) >= 4) { F.dSub = 1; this.dObj(rt, SUB[F.dStage]); }
  },
});
// 地面と崖・川は元の戦の物。本人へ同時に打ち込む数は前の d10 と同じ二人（元の world は変えない）
d10_nagashinojo.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(NAGA_WORLD));
d10_nagashinojo.world.playerAtkMax = 2;

export default d10_nagashinojo;
