// ======================================================================
// 有岡城 終幕の余韻（約30秒）：官兵衛を迎えた後、すぐ結果へ行かない。
// 構成：docs/oda15_plan_1108.md の 27（12〜15 官兵衛救出・有岡城陥落）と共通5。
// 燃える侍町・夜明けの鐘・官兵衛と滝川の言葉・本丸の開城（十一月十九日）と村重の一族の行く末への伏線。
// ======================================================================
import { sfx } from '../audio.js';

export const YOIN_LEN = 30;

export function start(rt, finish) {
  const F = rt.flags;
  if (F.arYoin) return;
  F.arYoin = { t0: rt.t };
  const say = (t, who, words, d) => rt.after(t, () => rt.say(who, words, d || 4), true);
  rt.after(2, () => { rt.army.play('eiei', rt.player.u.pos, 0.9); sfx('toki', 0.6); }, true);
  say(5, '滝川一益', '勝鬨はほどほどにせよ。本丸の久左衛門は、まだ降っておらぬ');
  say(11, '小寺官兵衛', '村重殿は……妻子と家臣を、この城に置いて行かれたのか', 4.5);
  rt.after(17, () => rt.army.playFar('kane', { x: rt.player.u.pos.x + 200, z: rt.player.u.pos.z }, 0.5), true);
  say(18, '栗山善助', '殿、夜のうちに城を離れましょう。播磨の方へ、ゆるりと参りましょう', 4.5);
  say(24, '滝川一益', '本丸も長くは持つまい。この城、ひと月のうちに落ちよう', 4);
  rt.after(YOIN_LEN, finish, true);
}
