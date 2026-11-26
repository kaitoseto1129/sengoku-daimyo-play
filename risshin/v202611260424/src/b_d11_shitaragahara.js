// ======================================================================
// 武田編 十一戦目「長篠・設楽原の戦い」（天正三年〔1575〕五月二十一日）（K563・docs/chapter_takeda.md）
//   史実：勝頼は長篠城の囲みを残し、設楽原で連吾川の向こうに馬防柵を三重に結んだ織田・徳川の三万八千へ、一万五千で攻めかかった。
//   山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した
//   （『信長公記』『甲陽軍鑑』・設楽原歴史資料館の案内）。主人公は山県昌景の赤備えの足軽。負け戦を生き延びるのが勝ち。
//
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：
//   前の作り（K651）は織田の設楽原の地形と柵（shitaraField）だけを借り、兵は軽い型で別に置いていた＝三重の柵の中も前も空、柵の鉄砲は十八丁。
//   今は織田家編の設楽原（b_shitaragahara.js）の setup・update を丸ごと呼び、側だけを入れ替える（三方ヶ原 d07・番外 真田 x15 と同じ型）。
//   両軍の備の置き方・柵の鉄砲の段・竹束・馬防柵の持ち場・後詰・大将・波（物見→試しの寄せ→真田→山県の赤備え・土屋→原→内藤→馬場の殿）・
//   鉄砲の壁（teppo_wall.js）・騎馬の波（k1119.js）・底撃（sokogeki.js）は元のまま。元の段の進みは、元の本人が任務の印を追って歩いた所
//   （shitaragahara/side.js の SH.ghost）で同じ順・同じ間に進む。
//   この紙に書くのは、武田の本人の出る所・任務の行・逸話・勝ち負けだけ。敵と味方の色・旗・隊の札は側で入れ替わる（team 0 が本人の側）。
// 史料：『信長公記』『甲陽軍鑑』。布陣図は docs/fujin/shitaragahara.md（側を入れ替えただけ）。入れ替えの手順は docs/k651_howto.md。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { shitaragahara as base, SHITARA_AT } from './b_shitaragahara.js';
import { SH } from './shitaragahara/side.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

if (BATTLE_ASSETS.shitaragahara) BATTLE_ASSETS.d11_shitaragahara = BATTLE_ASSETS.shitaragahara;

const FX = SHITARA_AT.fenceX, GATES = SHITARA_AT.gates, REAR = SHITARA_AT.rear;
const OMIYA = GATES[0];                                  // 大宮前の虎口（元の戦の本人が真田を受ける所）
const START = { x: 100, z: OMIYA + 18 };                 // 真田の寄せの後ろ（連吾川の東の段丘の下）。元の本人の持ち場の柵の向かい
const AKA = { armor: 0x8e1f16, lace: 0xc8a040, flag: 'akazonae' };
// 武田の側の声だけを通す（元の戦の織田・徳川の本人へ向けた声は出さない）
const TAKEDA_VOICE = /^(武田|山県|内藤|馬場|真田|土屋|原昌|小山田|穴山|甘利|高坂|勝頼|一条|赤備え|物見|足軽頭|使番)/;
const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (alive(g) ? g.center?.() : null);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
// 元の織田・徳川の本人の任務の札・印・導き・bot の癖は使わない（武田の側の任務は下の三つと退き口）
for (const k of ['checkpointStep', 'resumeSteps', 'resumeAt', 'missions', 'missionOf', 'missionHeading', 'missionPin', 'commanderTarget', 'missionSignTarget',
  'namedGuideTarget', 'waitGuardAllowed', 'attackOpening', 'waitOrderLabel', 'retreatGuideLabel', 'guardPostFrame', 'travelGuideLabel', 'guideMarker',
  'taskText', 'introTaskFirst', 'actionGuideTarget', 'botDuel', 'botRetreatWay', 'botBrain', 'botMountAllowed', 'botOrders', 'botDbg', 'botStat',
  'generalLines', 'canSkip', 'missionPinCaption', 'missionDetail', 'missionStatus', 'goalsAllRows', 'goalVisibleRows', 'goalRowsAhead', 'objectiveEnemies',
  'namedKillCompletesObjectives', 'waitGuardButtonText', 'guardStatusText', 'guardPurposeText', 'openingWait', 'releaseGuardForAttack', 'noLeaderFollow',
  'touchBattleControls', 'timeslip', 'introPeopleFolded', 'compactIntro', '__depth']) delete D[k];

// K674（11/26 Sanae）：一戦10任務。段ごとに最初の任務のあと、その段で四人・八人討て任務を足す（3・3・2・2）
const OBJ = [
  ['大宮前の柵へ、真田の寄せと共に寄せよ', '柵の前の岸で、出て来た徳川の兵を四人討て', '柵の前で、織田の鉄砲の下を走り、柵の兵を八人討て'],
  ['破れ目へ。山県昌景の赤備えと二の柵へ押し込め', '破れ目の中で、出て来た織田の槍を四人討て', '二の柵の前で、赤備えと共に鉄砲の兵を八人討て'],
  ['柳田前で、内藤昌豊の寄せに加われ', '柳田前の柵の前で、徳川の兵を四人討て'],
  ['退き口で馬場信春の殿に加わり、追う織田・徳川を食い止めよ', '退き口で、追う織田・徳川の兵を四人討て'],
];

export const d11_shitaragahara = Object.assign(D, {
  id: 'd11_shitaragahara',
  key: 'd11_shitaragahara',
  playerTaken: 0.4,   // 11/26 ヌ三：act bot（足軽）が193秒で柵の前で倒れたので本人の受ける傷を四割に（敵は変えない）
  sideFlip: true,   // shitaragahara/side.js：織田・徳川が team 1、武田が team 0（元の戦の setup の一番外で決まる）
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },   // 西（柵）を向く
  date: () => '天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原',   // 元の戦と同じく関数（battle.js が呼ぶ）
  intro: '連吾川の向こうに、織田・徳川の馬防柵が三重に並ぶ。赤備えの先駆けとして真田の寄せに付き、大宮前の柵へ寄せよ。',
  introText: '連吾川の向こうに、織田・徳川の馬防柵が三重に並ぶ。赤備えの先駆けとして真田の寄せに付き、大宮前の柵へ寄せよ。',
  introLords: ['武田勝頼', '織田信長'],
  introYou: false,
  introPeople: [],
  history: '天正三年（1575）五月二十一日、武田勝頼は設楽原で、馬防柵を結んだ織田・徳川の大軍へ攻めかかった。山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した。武田の名のある将の多くがこの日に失われた。',
  sides: { a: { name: '武田軍', mon: 'takeda', faction: 'takeda' }, b: { name: '織田・徳川軍', mon: 'oda', faction: 'oda' } },
  taisho: { a: { name: '武田勝頼', use: true }, b: { name: '織田信長', def: true } },
  survives: [...(base.survives || []), '武田勝頼', '織田信長', '徳川家康'],
  // 両軍の数は元の戦の表（布陣の総勢・討死の数）を入れ替えただけ
  force: (rt) => { const f = base.force(rt); return { a: f.b, a0: f.b0, b: f.a, b0: f.a0 }; },
  introFujin: (base.introFujin || []).map((e) => ({ ...e, team: 1 - (e.team || 0) })),
  victoryCaption: '退き口を生き延び、甲斐へ',
  // 元の新手の置き場の決まり（foe＝本人の敵）を、側を入れ替えて使う
  reserveOk: (rt, p, foe) => base.reserveOk(rt, p, !foe),
  reserveNoAlly: () => false,
  nameTagVisible: () => true,
  // 11/26 クラウドか：元の onStructDestroyed（柵が破れた時・信長で出陣か足軽大将以上）が this.taskText を呼び、消してあったので落ちた（234秒 TypeError）。武田の側の一言を返す
  taskText: () => '破れ目から押し込め',
  goalSignOff: () => false,
  goalSignTarget: (rt) => d11_shitaragahara.pin(rt),
  missionSignTarget: (rt) => d11_shitaragahara.pin(rt),

  stageOf(rt) {
    const F = rt.flags, N = F.nf;
    if (!N) return 0;
    if (N.step >= 4) return 3;
    if (N.step === 3) return 2;
    if (N.step === 2) return 1;
    return 0;
  },
  pin(rt) {
    const F = rt.flags; if (F.ending || F.dWon) return null;
    const s = F.dStage ?? 0;
    if (s >= 3) { const c = center(F.rear); return c ? { x: c.x, z: c.z, label: '馬場信春の殿' } : { x: REAR.x + 30, z: REAR.z, label: '退き口' }; }
    if (s === 2) { const c = center(F.waveGroups?.[1]); return c ? { x: c.x, z: c.z, label: '内藤昌豊の寄せ' } : { x: FX + 12, z: GATES[1] + 4, label: '柳田前' }; }
    if (s === 1) { const B = F.shBreach, c = center(B?.g) || center(B?.g2); return c ? { x: c.x, z: c.z, label: '山県の赤備え' } : B?.IN ? { x: FX + 6, z: B.IN.z, label: '破れ目' } : { x: FX + 10, z: -139, label: '破れ目' }; }
    // 11/26 クラウドか：先に試しの寄せ（鉄砲で止められるのを見せる十五人）を指していて、本人が一緒に柵へ駆けて100秒で撃ち倒された。
    //   ピンは真田の本隊（竹束の列）へ。試しの寄せは後ろから見せる（敵の強さは変えない）
    const c = center(F.waveGroups?.[0]) || center(F.shTame?.g); return c ? { x: c.x, z: c.z, label: '真田の寄せ' } : { x: FX + 8, z: OMIYA + 4, label: '大宮前の柵' };
  },

  *setup(rt) {
    const army = rt.army;
    // 元の筋の織田・徳川の本人へ向けた任務・行き先・褒美・台詞は出さない（任務はこの戦の四つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner;
    const OURS = new Set(OBJ.flat());
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.objRemove = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f?.call(rt, id, ...r) : undefined))(rt.objRemove);
    rt.marker = (id, ...r) => (id === 'dpin' ? mk0.call(rt, id, ...r) : undefined);
    rt.award = (f, label, ...r) => (rt.flags._dObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._dSay || TAKEDA_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._dSay ? ban0.call(rt, t, s, ...r) : undefined);
    // 本人の組は赤備え（山県昌景の手）
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), armor: AKA.armor, lace: AKA.lace, flag: AKA.flag } })); return sp0.call(this, g, list, ...r); };
    // 元の終わり（nfEnd）は rt.finish を呼ぶ。その前に本人の勝ちを決める（後だと「主の任務を果たせなかった」になった）
    const fin0 = rt.finish;
    rt.finish = (info = {}, ...r) => { if (info.scriptedEnd && !rt.flags.dWon && rt.player?.u?.alive) this.dWin(rt); return fin0.call(rt, info, ...r); };
    rt.cleanupTasks?.add(() => { rt.finish = fin0; army.spawn = sp0; rt.obj = obj0; rt.marker = mk0; rt.award = aw0; rt.say = say0; rt.banner = ban0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }   // 元の戦の setup（段に分けた function*）を丸ごと
    if (!SH.flip) console.warn('d11：側の入れ替えが効いていない');
    if (rt.player?.u) rt.player.u.faction = 'akazonae';
    const F = rt.flags;
    F.dStage = -1;
    mk0.call(rt, 'dpin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.dGo(rt, 0);
    this.dSay(rt, 1.5, '山県昌景', '柵は三重。だが鉄砲は込めるのに間がある。撃ち終えた所へ駆け込め', 3.4);
    this.dSay(rt, 5.5, '赤備えの足軽頭', '先駆けの組、真田の寄せに付け！　竹束の後ろから大宮前の柵へ！', 3.2);
  },
  dObj(rt, text) { const F = rt.flags; F._dObj = true; try { if (F.dObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.dObjText = text; } finally { F._dObj = false; } },
  dSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.dWon) return; rt.flags._dSay = true; try { rt.say(who, text, d); } finally { rt.flags._dSay = false; } }); },
  dBanner(rt, t, s) { rt.flags._dSay = true; try { rt.banner(t, s); } finally { rt.flags._dSay = false; } },
  dGo(rt, n) {
    const F = rt.flags;
    if (F.dWon || (F.dStage ?? -1) >= n) return;
    F.dStage = n; F.dK0 = rt.stats?.kills ?? 0; F.dSub = 0;
    this.dObj(rt, OBJ[n][0]);
    if (n === 1) {
      this.dBanner(rt, '真田信綱・昌輝、討死', '大宮前の柵は破れず');
      this.dSay(rt, 0.5, '山県昌景', '赤備え、口の無い所の柵を引き倒せ！　破れ目から押し込め！', 3.2);
      this.dSay(rt, 5, '土屋昌次', '土屋の手も続くぞ！　柵の杭を抜け！', 3);
    } else if (n === 2) {
      this.dBanner(rt, '山県昌景、討死', '内藤昌豊、柳田前の柵へ');
      this.dSay(rt, 0.5, '赤備えの侍', '山県様が撃たれた——！　お討死じゃ！', 3);
      this.dSay(rt, 4, '内藤昌豊', '真田も山県も討たれた。内藤の手、柳田前の柵を破れ！', 3.2);
    } else if (n === 3) {
      this.dBanner(rt, '武田勢、崩れる', '馬場信春が殿に残る');
      this.dSay(rt, 0.5, '馬場信春', 'わしが殿じゃ。御屋形様を落とせ。若い者は生きて甲斐へ帰れ', 3.6);
      this.dSay(rt, 5, '赤備えの足軽頭', '退き口へ！　馬場様の殿に加われ！', 3);
    }
  },
  dWin(rt) {
    const F = rt.flags; if (F.dWon) return;
    F.dWon = true; F.ending = true;
    F._dObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '退き口で殿を支えた');
    } finally { F._dObj = false; }
    this.dBanner(rt, '設楽原 退き口を生き延びる', '山県・内藤・馬場ら名のある将の多くが討死した');
    this.dSay(rt, 1, '使番', '御屋形様は、無事に甲斐へ向かわれました', 3);
    this.dSay(rt, 4.5, '赤備えの足軽頭', '……生きて帰れ、か。馬場様の言葉、忘れぬ', 3.4);
    if (rt.player?.u) rt.player.u.invuln = true;
  },
  // 元の勝ち負け（織田・徳川の本人の物）は使わない。元の終わり（nfEnd：武田の退却・余韻）が来たら、本人が生きていれば勝ち
  win() {},
  lose() {},
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags;
    if (F.dWon || !rt.player?.u?.alive) return;
    this.dGo(rt, this.stageOf(rt));
    { const L = OBJ[F.dStage], d = (rt.stats?.kills ?? 0) - (F.dK0 ?? 0); if (L && (F.dSub ?? 0) < L.length - 1 && d >= 4 * ((F.dSub ?? 0) + 1)) { F.dSub = (F.dSub ?? 0) + 1; this.dObj(rt, L[F.dSub]); } }
    if (F.ending && F.nf?.step >= 6) this.dWin(rt);
  },
});

export default d11_shitaragahara;
