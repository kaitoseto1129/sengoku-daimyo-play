// ======================================================================
// 桶狭間 14〜15分：余韻（谷の出口の旗に戻ってから）
//   義元の首は挙がり、今川勢は西の深田へ崩れた。旗に戻った組で勝鬨を三度。
//   使番が、大高城の松平元康（のちの家康）も兵をまとめて退いてゆくと知らせる（次の戦への伏線）。信長は「清洲へ帰る」。
//   遠くの別働の今川勢（大高・丸根の方）も退く。二十数秒は本人が動ける。その後に本体の finish。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.o15 || (F.o15 = {});
  if (v.yoinT) return;
  v.yoinT = rt.t;
  // 共通の終戦予約も最後の余韻にそろえ、三秒早く切り上げない。
  if (!rt.over) rt._closing = { at: rt.t + 28, info: { scriptedEnd: true }, delay: 4 };
  const lord = !!rt.G.lord, NOB = lord ? '自分' : '織田信長';
  // 遠くの別働の今川勢（丸根・鷲津・大高の方）も退いてゆく
  for (const m of F.detached || []) { try { m.rout?.({ hideAfter: 60 }); } catch (e) { /* 退かせられなくても進む */ } }
  const toki = (t, s) => rt.after(t, () => { rt.army.playFar?.('toki', rt.player.u.pos, 1.5); sfx('taiko', 1); rt.say('組頭 源八', s, 2.2); });
  rt.after(3, () => sfx('horagai', 0.8));
  toki(4.5, 'えい、えい！');
  rt.after(6, () => rt.say('織田の兵', 'おう！', 1.4));
  toki(7.8, 'えい、えい！');
  rt.after(9.3, () => rt.say('織田の兵', 'おう！', 1.4));
  toki(11, 'えい、えい！');
  rt.after(12.5, () => rt.say('織田の兵', 'おおう！', 1.8));
  rt.after(15, () => rt.say('使番', '大高の城の松平蔵人佐（元康）殿も、兵をまとめて三河へ退いてゆきまする！', 3.8));
  rt.after(19.5, () => rt.say(NOB, '二万の大軍も、大将を失えばこの通りじゃ。', 3.2));
  rt.after(28, () => { if (!rt.over) then(); });
}
