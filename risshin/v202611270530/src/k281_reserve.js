// K281（11/19 司令塔の決め：本人の30〜60m に敵の本物四十以上・本人の三十歩内の味方は四十前後）：
//   本人の30〜60m に敵の後詰（本物の組）を一組置き続ける。後詰は本人から見て一番近い敵の組の向こう八十五m（遠く・画面の奥）に生まれ、
//   四十五m の所まで歩いて出てくる（行軍）。本人や味方が寄れば普通に戦う（K285：見せかけにしない）。六秒ごとに、中心が30〜60m を外れたら歩いて付き直す（瞬間移動はしない）。
//   make(at) は戦の側で控えの組を作って返す（上限の内かは戦の側で見る）。on(rt) が偽の段は控えを本人から遠い所で休ませる（消さない）。
import { hiddenSpot } from './spawn_sight.js';
export function keepReserve(rt, dt, key, make, on) {
  const F = rt.flags, P = rt.player?.u;
  const S = (F[key] ||= { t: 0, g: null });
  if (!P?.alive || (S.t -= dt) > 0) return;
  S.t = 6;
  // 段が過ぎたら後詰は退く（残すと次の段で味方と本人が後詰に引かれ、段が延びた：八尾若江 段2 368秒）
  if (!on(rt)) { if (S.g && S.g.count && !S.g.routed) { S.g.order = 'flee'; S.g.routed = true; } return; }
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
    const far0 = { x: P.pos.x + dx / L * 85, z: P.pos.z + dz / L * 85 };
    if (rt.world?.walkable?.(far0.x, far0.z) === false) return;
    // 11/20 K470（spawn_sight.js）：見えている所なら画面の外（横・奥）に生んで歩かせる（急に現れない）。置けなければ次の見直しに
    const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 20;
    const far = hiddenSpot(rt, far0, (q) => Math.abs(q.x) < lim && Math.abs(q.z) < lim && rt.world?.walkable?.(q.x, q.z) !== false, true);
    if (!far) return;
    S.g = make(far, Math.atan2(-dx, -dz));
    if (S.g) { Object.assign(S.g, { order: 'move', dest: at }); S.g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { ...at }; }; }
    return;
  }
  const v = g.units.filter((u) => u.alive && !u.gone); if (!v.length) return;
  const c = { x: v.reduce((k, u) => k + u.pos.x, 0) / v.length, z: v.reduce((k, u) => k + u.pos.z, 0) / v.length };
  const dc = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
  if (dc >= 32 && dc <= 58) return;
  Object.assign(g, { order: 'move', dest: at, anchor: at, facing: Math.atan2(-dx, -dz) });
  g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
}
