// ======================================================================
// 稲葉山城 15分の構成（docs/oda15_plan_1108.md 5）　⑤「龍興撤退・城内制圧・落城・岐阜への改称の伏線」（13〜15分）
// 合図の火の後、開城の暗転を挟み、すぐ結果の札へ行かずに三十秒ほどの余韻を見せる。
// 燃え落ちる城（castle_fall.js は finish で自動）・倒れる斎藤の旗・味方の勝鬨・藤吉郎の一言・岐阜への一行。
// 呼び方：b_inabayama.js の win() で play(rt, ctx, at)。at は開城の暗転の後の秒。返す数は終幕の長さ（finish の秒）。
// ======================================================================
export function play(rt, ctx, at) {
  const F = rt.flags;
  const { officer, shout } = ctx;
  const live = () => !rt.ended;
  rt.after(at + 6, () => { if (!live()) return; rt.say('足軽', '斎藤の旗が倒れたぞ！　本丸は織田のものじゃ！', 3.2); });
  rt.after(at + 10, () => {
    if (!live()) return;
    try { shout?.(); } catch (e) { /* 鬨の声が出せない時も台詞は続ける */ }
    rt.say('組頭', 'えい、えい、おう！', 3);
  });
  rt.after(at + 14.5, () => { if (live()) rt.say(F.kinoU?.alive ? '木下藤吉郎' : officer(rt), '美濃は取った。殿はこの井口を新しい名で呼ぶそうじゃ', 3.8); });
  rt.after(at + 19.5, () => { if (live()) rt.say('', '――信長は井口を「岐阜」と改め、「天下布武」の印を使い始めた', 4.2); });
  return at + 28;
}
