// 高遠城の寄せ。交戦・門への攻撃・曲輪の確保は本体で判定する。
// 時間や門前への接近だけで、城兵を受けたことにしたり門を開いたりしない。
export function start(rt) {
  const F = rt.flags;
  if (F.k15yose) return;
  F.k15yose = true;
  // 道順と斬り合いを扱う高遠固有の頭へ戻す。
  F.k15on = false; F.k15fight = false; F.k15at = null;
  rt.unmark('k15');
}
