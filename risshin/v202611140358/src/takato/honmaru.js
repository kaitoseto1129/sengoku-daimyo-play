// 高遠城の本丸。門への攻撃・はなと近習との戦い・奥の間の対面を経る。
// 本丸に着いてからの秒数で盛信を果てさせず、本体の最期と旗の守りへつなぐ。
export function start(rt) {
  const F = rt.flags;
  if (F.ending || F.k15hon) return;
  F.k15hon = true; F.k15stage = 'honmaru';
  // 喰違い・主殿の戸口・奥の間は既存の道案内を使う。
  // 城兵は盛信の最期の後も、旗を守る間は降らずに戦う。
  F.k15on = false; F.k15fight = false; F.k15at = null;
  rt.unmark('k15');
}
