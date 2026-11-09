// ======================================================================
// 天王寺の戦い　再攻撃の段「二段で打って出る」の出来事（約9〜12分。b_tennoji.js の sortie から入れる）
// 史実：家臣は味方の少なさから再戦を諫めたが、信長は敵が間近に寄った今こそ好機と、二段に立て直して打って出た（信長公記巻九）。
// 遊び：打って出た後の約二分半に、①足を引く信長が旗を進める ②本願寺の鉄砲衆の一斉射 ③横の新手（本の sortie）を見せる。
//   本隊が二分半たっても崩れない時は、本隊の大将の旗が下がって崩れ始める（兵の体力で長引かせない・待たせない）。
// ======================================================================
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { spent } = ctx;
  const t0 = rt.t;
  let tick = 0, broke = false;
  rt.after(28, () => {
    if (F.step !== 3 || F.ending) return;
    sfx('horagai', 0.7);
    rt.say(rt.G.lord ? '佐久間信盛' : '織田信長', rt.G.lord ? '殿の旗が進む！　二段目、遅れるな！' : '足など構うな、旗を進めよ！　一段目が押すうちに、二段目は横から突け！', 4);
  });
  rt.after(70, () => {
    if (F.step !== 3 || F.ending) return;
    const g = F.last?.[1];
    sfx('volley', 1);
    if (g && !spent(g)) rt.army.play?.('volley', g.center(), 1.2);
    rt.say('組頭', '本願寺の鉄砲じゃ！　玉込めの間に寄せよ、止まるな！', 3.5);
  });
  return {
    update(dt) {
      if (broke || F.step !== 3 || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 1;
      if (rt.t - t0 < 150) return;
      broke = true;
      // 本隊の大将の旗が下がり、残りが北へ崩れる（b_tennoji.js の update が全部崩れたと見て追撃の段へ）
      for (const g of F.last || []) {
        if (spent(g) || g.routed) continue;
        g.noRout = false; g.morale = 0; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true;
        for (const u of g.units) if (u.alive && !u.woundOut) { u.fleeing = true; u.moraleFleeDir = { x: (Math.random() - 0.5) * 0.4, z: -1 }; u.target = null; }
      }
      rt.army.play?.('toki', rt.player.u.pos, 1.0);
      rt.say('足軽', '本願寺の大将の旗が下がった！　崩れるぞ！', 3.5);
    },
  };
}
