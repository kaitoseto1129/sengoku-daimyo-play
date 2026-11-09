// ======================================================================
// 森部 14〜15分：余韻（勝ち戦の後すぐ結果へ行かない）
//   両将が討たれ、斎藤勢は墨俣へ退いた。雨が細る中で勝鬨を三度。首実検は薬師堂の前（本体）。
//   組頭が「墨俣に砦を築けば美濃は取れる」と次の戦（墨俣）を匂わせる。二十秒余りは本人が動ける。その後に本体の finish。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.m15 || (F.m15 = {});
  if (v.yoinT) return;
  v.yoinT = rt.t;
  if (!rt.over) rt._closing = { at: rt.t + 20, info: { scriptedEnd: true }, delay: 6 };
  const toki = (t, s) => rt.after(t, () => { rt.army.playFar?.('toki', rt.player.u.pos, 1.4); sfx('taiko', 1); rt.say('組頭 源八（げんぱち）', s, 2.2); });
  toki(9, 'えい、えい！');
  rt.after(10.4, () => rt.say('織田の兵', 'おう！', 1.3));
  toki(12, 'えい、えい！');
  rt.after(13.4, () => rt.say('織田の兵', 'おおう！', 1.6));
  rt.after(15.5, () => rt.say('足軽', '斎藤勢は墨俣の方へ逃げてゆく……墨俣は川の中洲じゃ。あそこに砦があれば美濃は目の前ぞ', 4));
  rt.after(28, () => { if (!rt.over) then(); });
}
