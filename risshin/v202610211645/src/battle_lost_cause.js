// 史実の負け戦（三方ヶ原・本能寺）の初めの一回：任務の札に「心得」を一枚。
// 勝てぬ戦で、生き延びる事が勝ちだと先に伝える。倒れても筋は進む（討死の設定の時はそう書かない）。
export function lostCauseNote(rt, goal) {
  if (rt.game?.fails?.[rt.index] > 0) return;
  // 選んで遊ぶ稽古では筋が無いので、先へ進むとは書かない。
  const tail = rt.G?.practice ? '' : rt.D?.perma ? '（討たれれば終わる）' : '（倒れても話は先へ進む）';
  rt.after(4, () => {
    if (rt.over || rt.objectives.some((o) => o.id === 'lostcause')) return;
    rt.obj('lostcause', `史実の負け戦。${goal}${tail}`, 'note', true);
  });
}
