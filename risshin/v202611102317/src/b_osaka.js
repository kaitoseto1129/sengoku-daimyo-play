// ======================================================================
// 大坂の陣　真田丸の戦い（慶長十九年十二月四日）
// 大坂城の南に突き出た出丸・真田丸。外に柵、その内に空堀、土塁の上に塀と櫓。塀の内から鉄砲が並ぶ。
// 足軽は前田利常の手（先手・山崎長徳の組）。①篠山の頂（もぬけ）②挑発に乗って外の柵の前へ ③柵を破る組と柵を倒す
// （城内の爆発を合図と思い込んだ井伊・松平も堀へ殺到して撃ち崩される）④退きの下知の後、篠山の北の麓で大助の打って出を食い止める
// 11/6：古い作り（見せかけの軍勢・選ぶ札・柵の外に並ぶ真田の鉄砲・七尺を超える幟・晴の日差し）をやめ、
//   専門家の目で直し済みの徳川編の真田丸（b_k11_sanadamaru.js）と同じ縄張り・流れ・台詞で遊ぶ（docs/check60/sanadamaru.md）
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
  // 持ちこたえる段のピンは名が「持ち場」で、画面には「15m」だけ出た（行き先は場所の名と m。11/10 遊んだ）。地図で分かる名にする
  const marker = rt.marker;
  rt.marker = function (id, at, label, ...a) {
    if (id === 'dp' && label === '持ち場') label = (this.flags.step || 0) >= 5 ? '真田丸の柵' : '西の柵';
    return marker.call(this, id, at, label, ...a);
  };
  return k11_sanadamaru.setup.call(this, rt);
};
// 11/10 遊んだ：真田は丸の持ち場を守り、下がる寄せ手を全軍では追わない（docs/sanadamaru_spec_1109.md「砦を守る AI」）。
//   共通の追い討ち（gunsei の pursuit）で「塀の内の鉄砲、追撃」「真田信繁の旗本、追撃」が三つ重なって四十秒ごとに出、命の札まで隠していた
sanadamaru.noPursuit = true;
// 段の合間（立て直しの間）に任務が空になると、共通の待ちの札「組のそばで槍を構えよ」が真ん中に出た（構えの案内は出さない・Simple）。
//   合間も、右上の段と同じ字の任務を置く（済んだ段の後なら次の段の字）
sanadamaru.update = function (rt, dt) {
  const r = k11_sanadamaru.update.call(this, rt, dt);
  const F = rt.flags, L = STAGES.sanadamaru;
  if (rt.over || !F.begun) return r;
  const dp = rt.objectives.find((o) => o.id === 'dp');
  if (dp && dp.state === 'done') F.sanaDone = F.step;
  const live = rt.objectives.some((o) => !o.state && o.kind !== 'note' && o.id !== 'sana_now');
  const mine = rt.objectives.find((o) => o.id === 'sana_now');
  if (live) { if (mine) rt.objRemove('sana_now'); return r; }
  const s = F.step || 1, text = L[F.ending ? L.length - 1 : Math.min(L.length - 1, F.sanaDone === s ? s : s - 1)][0];   // 締めの和議の場面も最後の段の字のまま
  if (!mine || mine.text !== text) rt.obj('sana_now', text, 'guide', true);
  return r;
};
// 締め：「振り返ると……六文銭の旗が、まだ立っている」で、竹束の陣から真田丸の方へ向き直る（南を向いたままで、丸も和議の場面〔堀が埋まり丸が壊される〕も映らなかった）
sanadamaru.win = function (rt) {
  const was = rt.flags.ending;
  const r = k11_sanadamaru.win.call(this, rt);
  if (!was && rt.flags.ending) rt.after(4.4, () => { const P = rt.player.u.pos; rt.player.yaw = rt.player.u.heading = Math.atan2(0 - P.x, -40 - P.z); });
  return r;
};

export { sanadamaru };
