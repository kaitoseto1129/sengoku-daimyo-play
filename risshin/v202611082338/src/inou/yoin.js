// ======================================================================
// 稲生 14〜15分：余韻（戦が終わってすぐ結果へ行かない）
//   美作守が討たれると、信勝方は走って北の霞へ逃げる。太鼓が止み、勝鬨を三度。
//   信長が「勘十郎は末森へ逃げたか」と言い（後に母の取りなしで信勝・柴田・林は赦される＝次の伏線）、
//   組頭が初陣の主人公を褒める（初めての戦功の評価）。二十四秒ほど本人は動ける。その後に本体の finish。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.v15 || (F.v15 = {});
  if (v.yoinT) return;
  v.yoinT = rt.t;
  // 共通の締め（十四秒）より長く余韻を見せる。締めの間に来た勝ちの知らせは受けない（一宮城と同じ形）
  if (!rt.over) rt._closing = { at: rt.t + 27, info: { scriptedEnd: true }, delay: 5 };
  // 逃げる者は走る（歩いて去らない）
  for (const g of F.groups || []) if (g.routing || g.order === 'retreat') { g.speed = 4.6; g.morale = 0; }
  const lord = !!rt.G.lord;
  const say = (t, who, s, d = 3) => rt.after(t, () => rt.say(who, s, d));
  const toki = (t, s) => rt.after(t, () => {
    const P = rt.player.u.pos;
    rt.army.play('toki', { x: P.x, z: P.z - 6 }, 1.6); sfx('taiko', 1);
    rt.say('組頭', s, 2.4);
  });
  rt.after(5.5, () => sfx('horagai', 0.8));
  toki(7, 'えい、えい！');
  rt.after(8.6, () => rt.say('足軽', 'おう！', 1.4));
  toki(10.6, 'えい、えい！');
  rt.after(12.2, () => rt.say('足軽', 'おう！', 1.4));
  toki(14.2, 'えい、えい！');
  rt.after(15.8, () => rt.say('足軽', 'おおう！', 1.8));
  if (!lord) say(18, '織田信長', '勘十郎は末森へ逃げたか。……母上が詫びに来られよう。', 3.4);
  else say(18, '自分', '勘十郎は末森へ逃げたか。……母上が詫びに来られよう。', 3.4);
  say(22, '組頭', '初陣でよう槍を振るうた。殿の御目にも留まったぞ。', 3.2);
  rt.after(23, () => rt.award((t) => t.side.push('稲生で初陣の槍を振るった'), '稲生で初陣の槍を振るった'));
  rt.after(29, () => { if (!rt.over) then(); });
}
