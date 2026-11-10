// 深手・討死・敗走した者を、寄せ続ける兵に数えない。
export function fightingCount(g) {
  if (g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && u.hp > 0 && !u.dying && !u.gone &&
      !u.downed && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget) n++;
  return n;
}

// 時間だけで撃退にせず、本人が持ち場にいて、敵が実際に減った時に進む。
export function repelled(rt, left, remaining, at) {
  const u = rt.player.u;
  return u.alive && u.hp > 0 && !u.dying && left <= remaining &&
    Math.hypot(u.pos.x - at.x, u.pos.z - at.z) <= 32;
}
