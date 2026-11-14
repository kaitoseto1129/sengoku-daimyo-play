// 墨俣の目標と勝利は、同じ実際の戦果で判定する。
export function sunomataNorthStopped(F) {
  const g = F.W3a;
  if (F.wave !== 3 || !g) return false;
  // 控えの場所で崩れただけでは済ませない。柵へ来た隊の退却か、実際の全員の討死・負傷で止める。
  // 弓で柵の手前に討ち倒した時も、倒れた敵を柵へ歩かせる必要はない。
  // 11/10 詰まらない決まり：柵へ来る前に「主な兵が二割以下・最大の時間」で退いた時も止めた事にする（fushin.js）
  return (!!F.northAtFence && (g.routed || !g.units.some((u) =>
    u.alive && !(u.hp <= 0) && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget))) ||
    (g.routed && (g._fsT != null || (F.fsForce && F.foughtWave === 3))) ||
    (g.units.length > 0 && g.units.every((u) => (!u.alive && u.hp <= 0) || u.dying || u.woundOut));
}

function reliefCanFight(g) {
  return !!g && !g.routed && g.units?.some((u) => u.alive && !(u.hp <= 0) &&
    !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
}

export function sunomataReliefSpent(F) {
  // 到着扱いにはせず、代わりの射手も残っていない場合だけ退却の判断へ渡す。
  return !!(F.reinforceCalled || F.reinforceReserve) &&
    !reliefCanFight(F.reinforceReserve) && !reliefCanFight(F.gunReserve) && !reliefCanFight(F.bowReserve);
}

export function sunomataPincerDone(F) {
  // 西の寄せ手を討ち果たした時も済み（全員が討たれると routed の印が立たず、伏兵の到着も要らないまま最後の段が永久に終わらなかった。11/12 実測）
  if (F.wave === 3 && F.W3b && F.W3b.count === 0) return true;
  // 生きた伏兵が行軍中なら、西の退却だけで挟撃を済ませない。
  // 伏兵と代わりの射手が全て戦えなくなった場合は、最後の寄せの退却で終えられる。
  if (F.wave === 3 && F.W3b?.routed &&
      (F.reinforceArrived || sunomataReliefSpent(F))) return true;
  // 停滞救済で寄せ手が退いても、生きた伏兵は実着を待つ。
  // 道で止まった隊は asa.js の経路の引き直しで進め、戦果を先に付けない。
  return F.wave === 3 && !!F.reinforceArrived && !!F.W3b &&
    (F.W3b.routed || F.W3b.units.filter((u) => u !== F.yoseBoss && u.alive && !(u.hp <= 0) && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget).length <= 4);
}

export function sunomataBossKilled(F) {
  // 生きて退場した兵も despawn で alive=false になる。討死は命が尽きた事まで確かめる。
  const B = F.yoseBoss;
  return F.wave === 3 && !!B && B.alive === false && B.hp <= 0;
}

export function sunomataFinalGoalsDone(F) {
  return sunomataNorthStopped(F) && sunomataPincerDone(F) && sunomataBossStopped(F);
}

export function sunomataBossStopped(F) {
  // 討死と退却を区別したまま、最後の寄せを退けた戦果を共有する。
  const B = F.yoseBoss;
  return sunomataBossKilled(F) || (F.wave === 3 &&
    (!!B && (B.group?.routed || B.fleeing || B.gone) || !!F.s15?.lastRetreat && !!F.W3b?.routed));
}
