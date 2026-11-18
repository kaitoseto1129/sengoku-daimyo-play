// 深手・討死・敗走した者を、寄せ続ける兵に数えない。
// 11/18 クラウド持ち主：名乗り合いの輪で下がって見ている兵（duelW・一時の noTarget）は寄せ続ける兵に数える。
//   数えから外していたため、城の徒士頭が本人と名乗り合った途端に「城兵 1／10」となり、段3の札が1.6秒で済んでいた（描かずの数え）
export function fightingCount(g) {
  if (g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && u.hp > 0 && !u.dying && !u.gone &&
      !u.downed && !u.fleeing && !u.woundOut && !u.rearWound && (!u.noTarget || u.duelW)) n++;
  return n;
}

// 時間だけで撃退にせず、本人が持ち場にいて、敵が実際に減った時に進む。
export function repelled(rt, left, remaining, at) {
  const u = rt.player.u;
  return u.alive && u.hp > 0 && !u.dying && !u.gone && !u.downed &&
    !u.woundOut && !u.rearWound && left <= remaining &&
    Math.hypot(u.pos.x - at.x, u.pos.z - at.z) <= 32;
}
