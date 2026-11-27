// 長宗我部家編 十五「八尾の戦い」（慶長二十年〔1615〕五月六日・河内国 八尾＝大坂夏の陣）。K647（docs/house_chosokabe.md ②'）
//   史実：土佐を失って京で寺子屋の師をしていた盛親は、大坂城に入った。夏の陣で八尾へ出て、長瀬川の堤に兵を伏せ、
//   藤堂高虎の先手を引きつけて崩し、藤堂高刑・藤堂氏勝らを討った。だが若江で木村重成が敗れ、盛親は大坂へ退いた（『大坂御陣覚書』B・兵の数は推）。
//
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと。立場を交換している戦は全部」）：
//   前の作り（K651）は徳川編 k14 の八尾・若江の戦場（yaoField）だけを借り、兵は軽い型で別に置いていた。
//   今は徳川編の八尾・若江（b_k14_yao_wakae.js）の setup・update を丸ごと呼び、側だけを入れ替える（d11 設楽原と同じ型・k14/side.js）。
//   両軍の備の置き方・数（井伊の先手・庵原・安藤・騎馬・藤堂高刑・桑名・藤堂の鉄砲衆・高虎の旗本／木村・山口・内藤・長宗我部の先手・伏せ槍・横の備・盛親の旗本）、
//   陣立ての奥の層（k14/depth.js）、八尾の二将の討死・若江の三段・木村の最期・長宗我部の退きは元のまま。
//   元の段の進みは、元の本人（井伊の手）が任務の印を追って歩いた所（k14/side.js の SH.ghost）で同じ順に進む。
//   この紙に書くのは、長宗我部の本人の出る所・任務の行・逸話・勝ち負けだけ。
// K652⑥（逸話）：長瀬川の堤に伏せた一領具足を法螺で起こす＝元の戦の「堤の伏せ槍が一斉に立つ」所を、本人が法螺の台で吹いて起こす。
// 史料：『大坂御陣覚書』。布陣図は docs/fujin/k14_yao_wakae.md（側を入れ替えただけ）。入れ替えの手順は docs/k651_howto.md の五。
import { BATTLE_ASSETS } from './asset_manifest.js';
import { k14_yao_wakae as base, YAO_AT } from './b_k14_yao_wakae.js';
import { SH, shMe } from './k14/side.js';
import { sfx, stopMusic } from './audio.js';

const AT = YAO_AT;
const SPAWN = { x: AT.choA.x - 2, z: AT.choA.z + 14 };         // 長宗我部の先手の後ろ（長瀬川の東）
const HORA = { x: AT.fuse.x + 2, z: AT.fuse.z - 6 };            // 法螺の台（長瀬川の東岸の堤の上・伏せ槍の前）
const KUCHI = { x: AT.yaoFront.x + 58, z: AT.yaoFront.z + 6 };   // 藤堂の二陣の口（高虎の本陣への道）
const E = Math.PI / 2;   // 東（藤堂の方）を向く
const CHOSO = { armor: 0x2a2622, cloth: 0x3a4a2a, lace: 0x4a6a2a, flag: 'chosokabe' };
// 長宗我部の側の声だけを通す（元の戦の井伊・藤堂の本人へ向けた声は出さない）
const CHOSO_VOICE = /^(長宗我部|吉田|増田|組頭|一領具足|足軽)/;
// K674（11/26 クラウドか）：任務を十に。元の段（k14）の進みは触らず、長宗我部の側の段だけを足した（③横の備・⑥高虎の本陣・⑧増田盛次の組・⑨殿）。
//   史実：藤堂良勝・高刑・桑名吉成が八尾で討死し、高虎の本隊も押された。増田盛次（長盛の子）も長宗我部の手で藤堂と戦い討死。若江の崩れを聞いて盛親は退き、
//   藤堂の渡辺了（勘兵衛）が下知を待たず追った（『大坂御陣覚書』『渡辺水庵覚書』）。
const OBJ = ['法螺の台へ走り、旧臣の一領具足を呼び集める', '長瀬川の堤で、藤堂の先手を崩す', '藤堂高刑の手を崩す', '横の備の所で、北から回った藤堂良勝の手を受ける',
  '二陣の口で、藤堂の新手を受ける', '堤の北で、藤堂氏勝の手を崩す', '高虎の本陣の前の旗本を突く', '二陣の口の先で、藤堂の旗本の最後の押しを受ける',
  '増田盛次の組を助け、堤の上で藤堂の槍を押し返す', '大坂へ退く。殿に立ち、追いすがる渡辺勘兵衛の手を止める'];
const alive = (g) => g && !g.routed && g.count > 0;
const nAlive = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const F_ = (rt) => rt.flags;
const center = (g) => (alive(g) ? g.center?.() : null);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
// 元の井伊の本人の任務の印・案内・台詞・bot の癖は使わない（長宗我部の側の任務は下の六つ）
for (const k of ['missionPin', 'mapMarks', 'botBrain', 'botStat', 'talk', 'introText', 'compactIntro', 'resumeSteps', 'goalsAllRows', 'stageGoalsOnly', 'goalSignOnly']) delete D[k];
D.__depth = true;   // 奥の層（k14/depth.js）は元の setup の包みの中で一度だけ立てる（写しをもう一度包まない）

export const c15_yao = Object.assign(D, {
  id: 'c15_yao',
  key: 'c15_yao',
  sideFlip: true,   // k14/side.js：徳川方が team 1、大坂方が team 0（元の戦の setup の頭で決まる）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: E },
  date: () => '慶長二十年（1615）五月六日　朝　河内国 八尾',
  intro: '土佐を失って十五年。盛親様は大坂城に入り、八尾へ出た。長瀬川の堤の陰に、土佐から付いてきた一領具足が伏せている。霧の中から藤堂の兵。',
  introText: '土佐を失って十五年。盛親様は大坂城に入り、八尾へ出た。長瀬川の堤の陰に、土佐から付いてきた一領具足が伏せている。霧の中から藤堂の兵。',
  history: '慶長二十年（1615）五月六日、大坂方の長宗我部盛親は河内の八尾で藤堂高虎の兵と戦った。長瀬川の堤に兵を伏せて藤堂の先手を引きつけ、藤堂高刑らを討って藤堂勢を崩した。だが隣の若江で木村重成が敗れ、盛親は大坂へ退いた。大坂城が落ちた後、盛親は捕らえられて斬られ、長宗我部の家は絶えた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '藤堂の軍', mon: 'todo', faction: 'tokugawa' } },
  survives: [...(base.survives || []), '長宗我部盛親', '藤堂高虎', '井伊直孝'],
  // 両軍の数は元の戦の表（八千二百 対 一万・討死の数）を入れ替えただけ
  force: (rt) => { const f = base.force(rt); return { a: f.b, a0: f.b0, b: f.a, b0: f.a0 }; },
  lazyFrom: (rt) => shMe(rt).pos,   // 布陣の表の備・奥の層は元の本人の代わりの所から測って立てる（fujin_place.js・depth_real.js の lazyFrom・元の戦と同じ時に同じ備）
  playerTaken: 0.45,   // K652②（前の c15 と同じ）：長い戦で体が持つよう受ける傷を少し軽く（元の k14 の本人は井伊の騎馬と組に囲まれて進む）
  victoryCaption: '八尾で藤堂を崩し、大坂へ退く',
  world: (() => { const w = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base.world)); w.fleeOut = (x, z, team) => (team === 1 ? x > 240 : x < -315); return w; })(),   // 崩れた徳川方は東へ・大坂方は西へ

  pin(rt) {
    const F = rt.flags; if (F.ending || F.dWon) return null;
    const s = F.dStage ?? 0;
    if (s <= 0) return { ...HORA, label: '法螺の台' };
    if (s === 1) {
      const P = rt.player.u.pos; let best = null, bd = 1e9;
      for (const g of [F.takanoriG, F.kuwanaG, F.todoGun]) { const c = center(g); if (c) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd) { bd = d; best = c; } } }
      return best ? { x: best.x, z: best.z, label: '藤堂の先手' } : { x: AT.yaoFront.x + 20, z: AT.yaoFront.z, label: '藤堂の先手' };
    }
    if (s === 2) { const c = center(F.takanoriG); return c ? { x: c.x, z: c.z, label: '藤堂高刑' } : { x: AT.yaoFront.x + 28, z: AT.yaoFront.z - 8, label: '藤堂高刑' }; }
    if (s === 3) {   // 北から回った藤堂良勝の手（本人の近くに置き続ける藤堂の後詰を、横の備へ回して当てる）
      const R = F._k281R?.g, c = R && R.count >= 3 ? center(R) : null;
      return c && Math.hypot(c.x - AT.flank.x, c.z - AT.flank.z) < 70 ? { x: c.x, z: c.z, label: '藤堂良勝' } : { ...AT.flank, label: '横の備' };
    }
    if (s === 4) return { ...KUCHI, label: '二陣の口' };
    if (s === 6) { const c = center(F.todoG); return c ? { x: c.x, z: c.z, label: '高虎の本陣' } : { ...AT.todoHq, label: '高虎の本陣' }; }
    if (s === 8) { const c = this.nearFoe(rt); return c ? { x: c.x, z: c.z, label: '藤堂の押し' } : { ...AT.yaoFront, label: '藤堂の押し' }; }
    if (s === 9) { const c = this.nearFoe(rt); return c ? { x: c.x, z: c.z, label: '追手' } : { ...AT.yaoFront, label: '追手' }; }
    if (s === 5) {   // 藤堂氏勝の鉄砲衆。崩れた後は、一番近い藤堂・徳川の組（元の戦の k281 の後詰を側を入れ替えて置いた藤堂の後詰も）
      const c = center(F.todoGun) || this.nearFoe(rt); return c ? { x: c.x, z: c.z, label: '藤堂氏勝' } : { ...KUCHI, label: '藤堂氏勝' };
    }
    // 高虎の本陣（床几の陣）へは入らない（act bot が旗本の中で倒れた）。二陣の口の先で、寄せて来る藤堂の後詰を受ける
    const c = this.nearFoe(rt); return c && Math.hypot(c.x - KUCHI.x, c.z - KUCHI.z) < 40 ? { x: c.x, z: c.z, label: '二陣の口の先' } : { ...KUCHI, label: '二陣の口の先' };
  },

  nearFoe(rt) {
    const P = rt.player.u.pos; let best = null, bd = 150;
    // 筋書きの藤堂の組（先手・鉄砲衆・後詰・新手）だけ。布陣の表の備（藤堂の二陣の後ろなど四十四人の塊）へは案内しない（act bot がその中で倒れた）
    for (const g of [F_(rt).takanoriG, F_(rt).kuwanaG, F_(rt).todoGun, F_(rt)._k281R?.g, F_(rt).ywClash?.[0]]) {
      if (!g || g.team !== 1 || g.routed || !g.count || g.count < 3) continue;
      const c = g.center?.(); if (!c) continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd) { bd = d; best = c; }
    }
    return best;
  },
  *setup(rt) {
    const army = rt.army;
    // 元の筋の井伊の本人へ向けた任務・行き先・褒美・台詞は出さない（任務はこの戦の六つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner;
    const OURS = new Set(OBJ);
    rt.obj = (id, t, ...r) => (OURS.has(t) ? obj0.call(rt, id, t, ...r) : undefined);
    rt.objDone = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objDone);
    rt.objFail = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f.call(rt, id, ...r) : undefined))(rt.objFail);
    rt.objRemove = ((f) => (id, ...r) => (id === 'main' && rt.flags._dObj ? f?.call(rt, id, ...r) : undefined))(rt.objRemove);
    rt.marker = (id, ...r) => (id === 'cpin' ? mk0.call(rt, id, ...r) : undefined);
    rt.award = (f, label, ...r) => (rt.flags._dObj ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => (rt.flags._dSay || CHOSO_VOICE.test(who || '') ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (rt.flags._dSay ? ban0.call(rt, t, s, ...r) : undefined);
    // 本人の組は長宗我部の具足と旗
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), ...CHOSO } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; rt.obj = obj0; rt.marker = mk0; rt.award = aw0; rt.say = say0; rt.banner = ban0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }   // 元の戦の setup（段に分けた function*）を丸ごと
    if (!SH.flip) console.warn('c15：側の入れ替えが効いていない');
    const F = rt.flags;
    // 高虎の旗本（床几の陣・侍十）は、元の戦では本人が寄らない所。長宗我部の本人が突く段では、本人への一太刀を軽く（他の兵どうしは元のまま）
    if (F.todoG) F.todoG.dmgMultPlayer = 0.5;
    F.dStage = -1;
    mk0.call(rt, 'cpin', () => { const p = this.pin(rt); return p ? { x: p.x, z: p.z } : null; }, () => this.pin(rt)?.label || '', { h: 3 });
    this.dGo(rt, 0);
    this.dSay(rt, 1, '長宗我部盛親', '藤堂が来る。堤の陰で待ち、引きつけて叩く', 3.2);
    this.dSay(rt, 4.6, '組頭', '土佐から付いてきた者らが、堤の田に伏せておる。法螺で起こせ', 3.4);
    this.dSay(rt, 8.4, '吉田重康', '殿、関ヶ原の借りを、今日返しましょうぞ', 3);
    this.dSay(rt, 12, '組頭', 'あの塚じゃ！　上がって吹け！', 3);
  },
  dObj(rt, text) { const F = rt.flags; F._dObj = true; try { if (F.dObjText) rt.objDone('main'); rt.obj('main', text, 'main', true); F.dObjText = text; } finally { F._dObj = false; } },
  dSay(rt, at, who, text, d) { rt.after(at, () => { if (rt.flags.dWon) return; rt.flags._dSay = true; try { rt.say(who, text, d); } finally { rt.flags._dSay = false; } }); },
  dBanner(rt, t, s) { rt.flags._dSay = true; try { rt.banner(t, s); } finally { rt.flags._dSay = false; } },
  dAward(rt, label) { const F = rt.flags; F._dObj = true; try { rt.award((t) => t.side.push(label), label); } finally { F._dObj = false; } },
  // 元の若江の段（k14 の本人の代わり）は、八尾の段が⑧に来るまで山口の段の先へ進めない（若江が先に終わると八尾の段を飛ばして退きになる）
  ghostPin(rt) { const F = rt.flags; if ((F.step ?? 0) >= 3 && (F.dStage ?? 0) < 8 && !F.ending) return null; return base.ghostPin.call(this, rt); },
  dGo(rt, n) {
    const F = rt.flags;
    if (F.dWon || (F.dStage ?? -1) >= n) return;
    const was = F.dStage ?? -1;
    F.dStage = n; F.dT = rt.t; F.dK0 = rt.stats?.kills ?? 0;
    this.dObj(rt, OBJ[n]);
    if (was >= 1) { const l = ['', '長瀬川の堤で藤堂の先手を崩した', '藤堂高刑の手を崩した', '藤堂良勝の手を受けきった', '藤堂の新手を受けた', '藤堂氏勝の手を崩した', '高虎の本陣を突いた', '藤堂の最後の押しを受けきった', '増田盛次の組を助けた'][was]; if (l) this.dAward(rt, l); }
    if (n === 1) {
      sfx('horagai', 0.9);
      this.dBanner(rt, '八尾', '霧の中から藤堂の先手');
      this.dSay(rt, 0.4, '長宗我部盛親', '皆、よう来てくれた。土佐の槍を、もう一度見せてやれ', 3.2);
      this.dSay(rt, 4, '長宗我部盛親', '今じゃ！　堤から出よ！', 2.8);
    } else if (n === 2) {
      this.dSay(rt, 0.5, '吉田重康', '藤堂の一門じゃ！　討ち取れ！', 3);
    } else if (n === 3) {
      this.dBanner(rt, '藤堂高刑、討死', '藤堂の一門が北から回る');
      this.dSay(rt, 0.5, '組頭', '北から回ってきた！　横を空けるな！', 3);
      const R = F._k281R?.g; if (R && !R.routed && R.count >= 3) { R.order = 'attack'; R.seekRange = 40; R.aggro = 16; }
    } else if (n === 4) {
      this.dBanner(rt, '桑名吉成、討死', '藤堂の本陣が出てくる');
      this.dSay(rt, 0.5, '長宗我部盛親', '藤堂の本陣が出てきた。ここで受けよ！', 3);
    } else if (n === 5) {
      this.dSay(rt, 0.5, '長宗我部盛親', '藤堂をもう一つ崩せ。大坂の意地を見せよ', 3.2);
    } else if (n === 6) {
      this.dSay(rt, 0.5, '組頭', '高虎の本陣が見えるぞ！　一太刀でも！', 3);
    } else if (n === 7) {
      this.dSay(rt, 0.5, '長宗我部盛親', 'ここで藤堂を崩しきる。土佐の槍を見せよ', 3);
    } else if (n === 8) {
      this.dSay(rt, 0.5, '組頭', '増田殿の組が、堤で藤堂に囲まれておる！', 3);
      this.dSay(rt, 4, '長宗我部盛親', '増田を見殺しにするな。押し返せ', 2.8);
    } else if (n === 9) {
      this.dBanner(rt, '木村重成、討死', '若江が崩れる');
      this.dSay(rt, 0.5, '吉田重康', '殿……若江の木村殿が、討たれたとの知らせ', 3.2);
      this.dSay(rt, 4, '長宗我部盛親', '……そうか。大坂へ退く。わしが殿に立つ', 3);
      this.dSay(rt, 7.4, '組頭', '藤堂の渡辺勘兵衛が、下知も待たず追うて来る！', 3);
      // 追う手：まだ崩れていない藤堂の組を一つ、本人へ向ける（元の戦の締めの三十秒の内に済む）
      for (const g of [F._k281R?.g, F.todoGun, F.kuwanaG, F.takanoriG, F.ywClash?.[0]]) {
        if (!g || g.team !== 1 || g.routed || !g.count || g.count < 2) continue;
        g.order = 'attack'; g.seekRange = 50; g.aggro = 18; g.fixed = false; g.stay = false; break;
      }
    }
  },
  dWin(rt) {
    const F = rt.flags; if (F.dWon) return;
    F.dWon = true;
    F._dObj = true;
    try {
      rt.objDone('main'); rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '八尾で藤堂勢を崩した');
    } finally { F._dObj = false; }
    this.dBanner(rt, '八尾の勝ち', '追手が止まる');
    this.dSay(rt, 0.5, '組頭', '追手が止まった！　土佐の槍じゃ！', 3);
    this.dSay(rt, 4, '長宗我部盛親', '皆、大坂へ。今日の槍、忘れぬぞ', 3.2);
    // K720：最後の演出＝遠くに大坂城の炎上。曲は止め、土佐の旗を持った生き残りが少数で道を歩く（長宗我部家の戦国の終わり）
    try {
      stopMusic(3);
      const P = rt.player.u.pos, W = rt.world;
      W.addFire?.(P.x - 150, P.z - 30, { size: 14, h: W.heightAt(P.x - 150, P.z - 30), blackSmoke: true, smoke: true });
      W.addFire?.(P.x - 164, P.z - 12, { size: 9, h: W.heightAt(P.x - 164, P.z - 12), blackSmoke: true });
    } catch (e) { /* 火が建てられない時は台詞だけ */ }
    this.dSay(rt, 8, '組頭', '……西の空が赤い。大坂のお城が、燃えておる', 3.2);
    if (rt.player?.u) rt.player.u.invuln = true;
  },
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags;
    if (F.dWon || !rt.player?.u?.alive || !F.begun) return;
    // 元の終わり（木村の討死→長宗我部の退き）が来たら⑨殿。元の戦はその三十秒後に締めるので、殿は十四秒までで勝ちに
    const s = F.dStage ?? 0, P = rt.player.u.pos, t = rt.t - (F.dT ?? rt.t), k = (rt.stats?.kills ?? 0) - (F.dK0 ?? 0);
    if (F.ending) {
      if (s < 9) this.dGo(rt, 9);
      else if ((k >= 2 && t > 5) || t > 14) this.dWin(rt);
      return;
    }
    if (s === 0) {
      // 逸話：法螺の台で吹くと、堤の伏せ槍（元の戦の長宗我部の伏せ槍）が一斉に立つ。元の本人の代わりが先に堤へ寄った時も立つ
      if (Math.hypot(P.x - HORA.x, P.z - HORA.z) < 7 && base.fuseRise(rt)) this.dGo(rt, 1);
      else if (F.step >= 1 && F.fuseG && !F.fuseG.ambush) this.dGo(rt, 1);
    } else if (s === 1) {
      if (t > 45 || F.takanoriFell) this.dGo(rt, 2);
    } else if (s === 2) {
      if ((F.takanoriFell && t > 5) || t > 90) this.dGo(rt, 3);
    } else if (s === 3) {
      if (t > 8 && (k >= 3 || t > 40)) this.dGo(rt, 4);
    } else if (s === 4) {
      if ((F.step >= 2 && t > 6 && (k >= 2 || t > 25)) || t > 60) this.dGo(rt, 5);
    } else if (s === 5) {
      if ((!alive(F.todoGun) && t > 10) || (k >= 4 && t > 15) || t > 60) this.dGo(rt, 6);
    } else if (s === 6) {
      if ((k >= 2 && t > 8) || t > 30) this.dGo(rt, 7);
    } else if (s === 7) {
      if ((k >= 4 && t > 20) || t > 50) this.dGo(rt, 8);
    }
    // 長宗我部の先手（元の戦では藤堂の先手を崩して堤の前へ戻る組）は、段2から本人の脇に付いて進む（元の戦の手勢が井伊の本人に付くのと同じ役）
    if (s >= 2 && (F._cEscT = (F._cEscT || 0) - dt) <= 0) {
      F._cEscT = 1;
      const g = F.choA, c = alive(g) && g.order !== 'flee' && g.order !== 'retreat' ? g.center() : null;
      if (c) {
        const d = Math.hypot(c.x - P.x, c.z - P.z);
        if (d > 22) { g.order = 'move'; g.dest = { x: P.x - 6, z: P.z + 4 }; g.speed = 5; g.focus = null; g.fixed = false; g.stay = false; }
        else if (g.order === 'move') { g.order = 'attack'; g.seekRange = 24; g.aggro = 14; }
      }
    }
  },
});

BATTLE_ASSETS.c15_yao = BATTLE_ASSETS.k14_yao_wakae;
export default c15_yao;
