// 戦線へ戻れない重傷者を待たない。毎コマ、数えるための配列も作らない。
export function live(g) {
  if (!g || g.routed || g.order === 'retreat' || g.order === 'flee') return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.dying && !u.fleeing && !u.evacuatedWound && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget) n++;
  return n;
}

// 士気だけでは、生きた組頭のいる隊は退かない。城方へ退く下知を共通の敗走処理に渡す。
export function retreat(g) {
  if (!g || g.routed) return;
  const c = g.center(), dx = -128 - c.x, dz = -182 - c.z, len = Math.hypot(dx, dz) || 1;
  g.noRout = false; g.morale = 0; g.order = 'retreat';
  g.path = null; g.dest = null; g.focus = null; g.onArrive = null;
  g.fleeDir = { x: dx / len, z: dz / len }; g.fleeSet = true;
}
