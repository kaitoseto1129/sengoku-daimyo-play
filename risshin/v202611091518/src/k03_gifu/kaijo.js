// ======================================================================
// 岐阜城　連続の知らせ・木瓜の旗が下りる（docs/toku15_plan_1108.md の 3）
//  ・3〜6分：使番「池田隊、百曲りへ！」「福島隊、七曲りより登ります！」
//  ・9〜12分：「西の曲輪、突破！」「下の曲輪、落ちました！」と続けて届き、城方が本丸へ集まる
//  ・12〜15分：秀信は討たない。刀を置き、本丸の織田木瓜の旗が下りる
// 軍勢は本体の実兵だけ。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';
import { onceWhen } from '../k_toku_a/sonae.js';

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world, T = { flags: [] };
  F.k03k = T;
  const step = () => F.step ?? 0;
  // 岐阜城は見せかけの軍勢を置かない。寄せ手は本体の池田・浅野・福島の隊だけにする。
  // 本丸の織田木瓜の旗（開城で下りる）
  for (const [dx, dz] of [[4, -5], [4, 5]]) {
    try { const m = nobori(W, 2 + dx, dz, 'oda', 6); rt.scene.add(m); T.flags.push({ m, y0: m.position.y }); } catch (e) { /* 立てられない時は置かない */ }
  }

  // 段の知らせが遅れて降伏の台詞に割り込まないよう、届く時にも段を確かめる。
  const report = (n, delay, fn) => rt.after(delay, () => { if (!F.ending && step() === n) fn(); });
  T.tick = onceWhen(rt, [
    [() => step() >= 3, () => report(3, 8, () => rt.say('使番', '池田隊、百曲りへ！　福島隊は七曲りより登ります！', 3.4))],
    [() => step() >= 4, () => report(4, 12, () => { sfx('horagai', 0.5); rt.say('使番', '西の曲輪、突破！', 2.6); })],
    [() => step() >= 5, () => {
      // 本体の使番（一秒）と秀信（五秒）の台詞を遮らず、順に届ける。
      report(5, 9, () => rt.say('使番', '下の曲輪、落ちました！　城方は本丸へ集まっております', 3.4));
      report(5, 14, () => rt.say('池田長吉', '岐阜中納言殿は討つな。殿の仰せじゃ', 3));
    }],
  ]);

  // 開城：秀信が刀を置いた後、本丸の木瓜の旗がゆっくり下りる
  T.ending = () => {
    rt.after(19.5, () => {
      sfx('taiko', 0.4);
      for (let k = 1; k <= 12; k++) rt.after(k * 0.35, () => { for (const f of T.flags) { f.m.position.y = f.y0 - k * 0.5; if (k === 12) f.m.visible = false; } });
    });
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}
