// ======================================================================
// 天王寺の戦い　再攻撃の段「二段で打って出る」の出来事（約9〜12分。b_tennoji.js の sortie から入れる）
// 史実：家臣は味方の少なさから再戦を諫めたが、信長は敵が間近に寄った今こそ好機と、二段に立て直して打って出た（信長公記巻九）。
// 遊び：打って出た後の約二分半に、①足を引く信長が旗を進める ②本願寺の鉄砲衆の一斉射 ③横の新手（本の sortie）を見せる。
//   二分半以降、討ち減らされた備えから北へ退く。無傷の備えを時間だけで崩さない。
// ======================================================================
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { spent } = ctx;
  const t0 = rt.t;
  let tick = 0, announced = false;
  rt.after(28, () => {
    if (F.step !== 3 || F.ending || rt.over) return;
    sfx('horagai', 0.7);
    rt.say(rt.G.lord ? '佐久間信盛' : '織田信長', rt.G.lord ? '殿の旗が進む！　二段目、遅れるな！' : '足など構うな、旗を進めよ！　一段目が押すうちに、二段目は横から突け！', 4);
  });
  rt.after(70, () => {
    if (F.step !== 3 || F.ending || rt.over) return;
    const g = F.last?.[1];
    // 銃声は射手の発砲処理で鳴る。時刻だけで架空の斉射を重ねない。
    if (!g || spent(g) || !g.units.some((u) => u.type === 'gun' && u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && u.fireT > 0)) return;
    rt.say('組頭', '本願寺の鉄砲じゃ！　玉込めの間に寄せよ、止まるな！', 3.5);
  });
  return {
    update(dt) {
      if (F.step !== 3 || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 1;
      if (rt.t - t0 < 150) return;
      let retreated = false;
      // 各備えの四分の一が討死・深手になった時だけ退く下知を出す。
      // 味方が一方を崩しても、戦っていない別の備えまで逃がさない。
      for (const g of F.last || []) {
        if (spent(g) || g.routed) continue;
        let lost = 0;
        for (const u of g.units) if (!u.alive || u.dying || u.woundOut) lost++;
        if (lost < Math.ceil(g.units.length / 4)) continue;
        g.noRout = false; g.morale = 0; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true;
        for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.woundOut) { u.fleeing = true; u.moraleFleeDir = { x: (Math.random() - 0.5) * 0.4, z: -1 }; u.target = null; }
        retreated = true;
      }
      if (!retreated || announced) return;
      announced = true;
      rt.army.play?.('toki', rt.player.u.pos, 1.0);
      rt.say('足軽', '本願寺の一手が退くぞ！　残る囲みも押し返せ！', 3.5);
    },
  };
}
