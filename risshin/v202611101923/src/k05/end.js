// ======================================================================
// 第二次上田の締め（kaito 11/8：docs/toku15_plan_1108.md の 5「攻城中止、中山道を西へ急ぐ。
//   『関ヶ原の戦はすでに始まろうとしている』→『秀忠軍、関ヶ原に間に合わず』」）
//   しんがりを果たした後（急使は⑤の城攻めの最中に着く）、染屋台の三万八千（軽い大軍）が陣を払って木曽路へ急ぎ出し、
//   日付が九月十五日へ飛んで、関ヶ原に間に合わなかった事を見せてから札へ。
// 入れ方：win で start(rt, ctx) を一度（ctx.armies＝染屋台の軽い大軍・ctx.talk＝戦の talk.after）。締めの finish もここで呼ぶ。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.k05End) return;
  F.k05End = true;
  const say = (t, f) => rt.after(t, () => { if (!rt.over) { try { f(); } catch (e) { /* 締めは止めない */ } } });
  const A = ctx.talk || [];
  say(1.2, () => rt.say(A[0][0], A[0][1], 3.6));
  // 急使は城攻めの最中に着いている（⑤の終わり）。ここは攻めを止めた後の陣払い
  say(5.4, () => rt.say(A[1][0], A[1][1], 3.8));
  // 攻めを止め、染屋台の諸隊が陣を払って木曽路（南）へ急ぐ
  say(8, () => {
    sfx('horagai', 0.9);
    let k = 0;
    for (const g of ctx.armies || []) { if (g && g.moveTo) { const c = g.army || {}, x = g.position.x + (c.cx || 0), z = g.position.z + (c.cz || 0); g.moveTo(x - 20, z + 220, 70 + k * 6); k++; } }
  });
  say(9.5, () => rt.say('榊原康政', '陣を払え！　木曽路を夜通し駆けるぞ', 3.2));
  say(13.5, () => rt.banner('九月十五日　美濃国 関ヶ原', '東西の大軍が、すでに霧の中で向き合っていた'));
  say(18, () => rt.banner('秀忠軍、関ヶ原に間に合わず', ''));
  rt.after(22, () => { try { ctx.done?.(); } catch (e) { /* 手柄が付かなくても締める */ } rt.finish({ scriptedEnd: true }, 4); });
}
