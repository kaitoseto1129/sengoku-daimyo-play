// K281（11/19 司令塔の決め：本人の30〜60m に敵の本物四十以上・本人の三十歩内の味方は四十前後）：
//   本人の30〜60m に敵の控え（本物の兵・持ち場に立つ塊）を一組置き続ける。控えは斬り合わない（味方に狙われず・自分も寄らない）ので段の長さを変えない。
//   本人が近づいて斬れば倒れる（本人の一撃は通る）。六秒ごとに、控えの中心が本人の30〜60m を外れたら、本人から一番近い敵の組の方へ四十五m の所へ歩かせる。
//   make(at) は戦の側で控えの組を作って返す（上限の内かは戦の側で見る）。on(rt) が偽の段は控えを本人から遠い所で休ませる（消さない）。
export function keepReserve(rt, dt, key, make, on) {
  const F = rt.flags, P = rt.player?.u;
  const S = (F[key] ||= { t: 0, g: null });
  if (!P?.alive || (S.t -= dt) > 0) return;
  S.t = 6;
  if (!on(rt)) return;
  const own = new Set([S.g]);
  // 目当て：本人から一番近い敵の組（控え・崩れた組・一人組は除く）の中心
  let best = null, bd = 1e9;
  for (const g of rt.army.groups) {
    if (g.team === P.team || own.has(g) || g.routed || !g.count || g.count < 3) continue;
    const v = g.units.filter((u) => u.alive && !u.gone && !u.fleeing); if (!v.length) continue;
    const c = { x: v.reduce((k, u) => k + u.pos.x, 0) / v.length, z: v.reduce((k, u) => k + u.pos.z, 0) / v.length };
    const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  const dx = best.x - P.pos.x, dz = best.z - P.pos.z, L = Math.hypot(dx, dz) || 1;
  const at = { x: P.pos.x + dx / L * 45, z: P.pos.z + dz / L * 45 };
  if (rt.world?.walkable?.(at.x, at.z) === false) return;
  const g = S.g;
  if (!g || !g.count || g.routed) {
    S.g = make(at, Math.atan2(-dx, -dz));
    if (S.g) for (const u of S.g.units) u.noTarget = true;
    return;
  }
  const v = g.units.filter((u) => u.alive && !u.gone); if (!v.length) return;
  const c = { x: v.reduce((k, u) => k + u.pos.x, 0) / v.length, z: v.reduce((k, u) => k + u.pos.z, 0) / v.length };
  const dc = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
  if (dc >= 32 && dc <= 58) return;
  Object.assign(g, { order: 'move', dest: at, anchor: at, aggro: 0, seekRange: 0, facing: Math.atan2(-dx, -dz) });
  g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
}
