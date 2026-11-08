// 墨俣の目標と勝利は、同じ実際の戦果で判定する。
export function sunomataNorthStopped(F) {
  const g = F.W3a;
  // 三の手が柵まで来て、討たれるか退くまでは済ませない（来ないまま印を付けない。11/8 墨俣 九2）
  const fought = !!g && (g.routed || g.units.some((u) => !u.alive || u.dying || u.fleeing || u.woundOut || u.gone));
  return F.wave === 3 && !!g && fought && (g.routed || !g.units.some((u) =>
    u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget));
}

export function sunomataPincerDone(F) {
  return F.wave === 3 && !!F.reinforceArrived && !!F.W3b &&
    F.W3b.units.filter((u) => u !== F.yoseBoss && u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut).length <= 4;
}

export function sunomataBossKilled(F) {
  return F.wave === 3 && !!F.yoseBoss && F.yoseBoss.alive === false;
}

export function sunomataFinalGoalsDone(F) {
  return sunomataNorthStopped(F) && sunomataPincerDone(F) && sunomataBossKilled(F);
}
