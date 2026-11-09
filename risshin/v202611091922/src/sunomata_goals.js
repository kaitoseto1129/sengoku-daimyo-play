// 墨俣の目標と勝利は、同じ実際の戦果で判定する。
export function sunomataNorthStopped(F) {
  const g = F.W3a;
  if (F.wave !== 3 || !g) return false;
  // 控えの場所で崩れただけでは済ませない。柵へ来た隊の退却か、実際の全員の討死・負傷で止める。
  // 弓で柵の手前に討ち倒した時も、倒れた敵を柵へ歩かせる必要はない。
  return (!!F.northAtFence && (g.routed || !g.units.some((u) =>
    u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget))) ||
    (g.units.length > 0 && g.units.every((u) => (!u.alive && u.hp <= 0) || u.dying || u.woundOut));
}

export function sunomataPincerDone(F) {
  return F.wave === 3 && !!F.reinforceArrived && !!F.W3b &&
    F.W3b.units.filter((u) => u !== F.yoseBoss && u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut).length <= 4;
}

export function sunomataBossKilled(F) {
  // 生きて退場した兵も despawn で alive=false になる。討死は命が尽きた事まで確かめる。
  return F.wave === 3 && !!F.yoseBoss && F.yoseBoss.alive === false && F.yoseBoss.hp <= 0;
}

export function sunomataFinalGoalsDone(F) {
  return sunomataNorthStopped(F) && sunomataPincerDone(F) && sunomataBossKilled(F);
}
