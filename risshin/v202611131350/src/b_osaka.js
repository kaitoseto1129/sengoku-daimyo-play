// ======================================================================
// 大坂の陣　真田丸の戦い（慶長十九年十二月四日）
// 大坂城の南に突き出た出丸・真田丸。外に柵、その内に空堀、土塁の上に塀と櫓。塀の内から鉄砲が並ぶ。
// 足軽は前田利光の手（先手・山崎長徳の組）。徳川編の真田丸（b_k11_sanadamaru.js）と同じ縄張り・七段の流れ・台詞で遊ぶ：
//   ①篠山（もぬけ）②正面＝引きつけての一斉射 ③西から回り込み＝横の鉄砲衆と予備の槍 ④先走りの渋滞を整理
//   ⑤最大の攻め＝柵を破ると二の構えの一斉射と大助・伊木の打って出 ⑥攻撃中止 ⑦竹束の陣へ撤収（docs/sanadamaru_spec_1109.md）
// この筋書きだけの違いは下で上に重ねる（docs/check60/sanadamaru.md）
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ攻める
// ======================================================================
import { k11_sanadamaru } from './b_k11_sanadamaru.js';
import { STAGES } from './stages.js';

// 写しは getter ごと写す（battles.js の copyDef と同じ）。同じ object を二つの id に出すと .key の取り合いになる
const sanadamaru = Object.defineProperties({}, Object.getOwnPropertyDescriptors(k11_sanadamaru));
// 段の字は徳川編と同じ（右上の目標・終わりの札は STAGES[key] を引く）
STAGES.sanadamaru = STAGES.k11_sanadamaru;
// 段の名（柵の前・打って出）を phase にも出す（広告の撮り方 tools/pv1104_page.js が phase で待つ）
sanadamaru.fenceStart = function (rt) { k11_sanadamaru.fenceStart.call(this, rt); rt.setPhase('fence'); };
sanadamaru.sortie = function (rt) { k11_sanadamaru.sortie.call(this, rt); rt.setPhase('sortie'); };
// 携帯の横（高さ 500px まで）では目標の札を細く小さく（844×390 で札が画面の右半分を覆い、柵と塀が見えなかった。戦場の三分の二は空ける）
sanadamaru.goalsHud = function (rt) {
  k11_sanadamaru.goalsHud.call(this, rt);
  if (!rt.hud || !rt.hud.root || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = `@media (max-height: 500px) {
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode { max-width:min(300px, 36vw) !important; padding:5px 8px 6px 7px !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3, li) { font-size:12px !important; line-height:1.35 !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li.now { font-size:13px !important; padding:2px 4px !important; } }`;
  document.head.appendChild(st);
  const dispose = rt.dispose;
  rt.dispose = function () { st.remove(); return dispose.call(this); };
};
// 結果の札の一行は最後の段（殿）を果たした事を書く（大きな任務の札は①のままなので「篠山の頂まで登れを果たした」と出ていた）
sanadamaru.onFinish = (rt) => { if (rt.tracker.main === true) rt.lastMainDone = STAGES.sanadamaru[STAGES.sanadamaru.length - 1][0]; };
// 言葉：前田利常が家臣の前で家康を呼ぶ時は「大御所様」（敬いを落とさない。専門家の目・11/6）
sanadamaru.setup = function (rt) {
  const say = rt.say;
  rt.say = function (who, text, ...a) { return say.call(this, who, who === '前田利常' && typeof text === 'string' ? text.replace(/^大御所は/, '大御所様は') : text, ...a); };
  return k11_sanadamaru.setup.call(this, rt);
};
// 真田は砦を守る：寄せ手が崩れても塀の鉄砲や信繁の旗本が「追撃」に出ない（史実も信繁は丸を出ず、打って出たのは大助・伊木の手だけ。
//   11/10 遊んだ：⑥で「塀の内の鉄砲、追撃／真田信繁の旗本、追撃／塀の内の西の鉄砲衆、追撃」が中央に三枚重なった）
sanadamaru.noPursuit = true;
// 両軍の備は、本物の名の将が実際に討たれた時だけ「敵の大将を討った」「味方の大将が討たれた」と出す。
//   名目の損のくじや、名の無い組頭の死では出さない（11/10 遊んだ：④と⑤で「敵の大将を討った」、③で「味方の大将が討たれた」。
//   この日、真田の将も前田の山崎・本多も討たれていない）
function quietSanada(rt) {
  for (const S of rt.sonae || []) {
    if (S._sanaQuiet) continue;
    S._sanaQuiet = true;
    const w = S.watch;
    S.watch = function () { const u = this.b && this.b.taishoU; if (u && this.taisho && u.name === this.taisho) return w.call(this); };
  }
  // 段と段の合間（篠山の北の麓で組を立て直す間）の札は、その場の行い（共通の「組のそばで槍を構えよ」は構えの案内で、ここに合わない）
  const g = rt.missionGuide;
  if (g && g.waitObjective && !g.waitObjective._sana) {
    g.waitObjective._sana = true;
    // 撤収の後（和議の場面）は竹束の陣から丸を見る
    Object.defineProperty(g.waitObjective, 'text', { get: () => (rt.flags.ending ? '竹束の陣から真田丸を見よ' : '篠山の北の麓で組を立て直せ'), set() {}, configurable: true });
  }
}
// ⑦ 竹束の陣に着いた後、何も起きずに一分余り立って待った（11/10 遊んだ：着いて 65 秒）。着いて取り残された組が戻る間だけ待つ
sanadamaru.minEl = function (st, sec, label, radius) {
  return k11_sanadamaru.minEl.call(this, st, label === '竹束の陣' ? Math.min(sec, 40) : sec, label, radius);
};
// 締め：「振り返ると……六文銭の旗が、まだ立っている」の台詞で、本人が丸の方へ振り返る（11/10 遊んだ：竹束の陣で南を向いたまま、
//   和議・堀の埋め立て・丸の破却の場面（k11/wagi.js）が背中の側で起きて一つも見えなかった）。下知の台詞に合わせた一度だけの振り向き
sanadamaru.win = function (rt) {
  const was = rt.flags.ending;
  k11_sanadamaru.win.call(this, rt);
  if (!was && rt.flags.ending) rt.after(4.4, () => { rt.flags.sanaTurnT = rt.t; });
};
function turnBack(rt, dt) {
  const F = rt.flags, p = rt.player;
  if (F.sanaTurnT == null || !p || !p.u || rt.t - F.sanaTurnT > 2.4) return;
  const want = Math.atan2(0 - p.u.pos.x, -40 - p.u.pos.z);   // 真田丸の中心（b_k11_sanadamaru.js の C）
  let d = (want - p.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  p.yaw += d * Math.min(1, dt * 2.6);
}
// ③ 横の鉄砲衆を抑える段が三分半続いた（11/10 遊んだ：210→430 秒。手本は第二の攻め全体で二分半）。
//   百十秒寄せ続ければ、半ばを討てなくても鉄砲衆は塀の内へ引く（引かせ方は徳川編の段のまま）
sanadamaru.subdue = function (o) {
  const st = k11_sanadamaru.subdue.call(this, o), tick = st.tick;
  st.tick = (rt, C, m, ctx, el, dt) => { if (el > 110) C.pressT = Math.max(C.pressT || 0, 100); return tick.call(st, rt, C, m, ctx, el, dt); };
  return st;
};
sanadamaru.update = function (rt, dt) {
  quietSanada(rt);
  turnBack(rt, dt);
  return k11_sanadamaru.update.call(this, rt, dt);
};

export { sanadamaru };
