// 近い歩き先だけを確かめる。遠回りの道探しは従来の移動に任せる。
const TURNS = [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57];
export function localClear(army, from, to) {
  if (army.wallBetween(from, -1, to)) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.75));
  const lim = army.world.def.moveLim || 176;
  if (Math.abs(to.x) > lim || Math.abs(to.z) > lim) return false;
  for (let i = 1; i <= steps; i++) if (!army.world.walkable(from.x + dx * i / steps, from.z + dz * i / steps)) return false;
  return true;
}
// 入れ物は呼び手の兵が持つ。壁や深みを越えて輪へ集まらない。
export function localPoint(army, u, out, x, z) {
  out.x = x; out.z = z; out.y = u.pos.y;
  if (localClear(army, u.pos, out)) return out;
  const h = Math.atan2(x - u.pos.x, z - u.pos.z), r = Math.min(4, Math.hypot(x - u.pos.x, z - u.pos.z));
  for (let scale = 1; scale >= 0.25; scale *= 0.5) for (const turn of TURNS) {
    out.x = u.pos.x + Math.sin(h + turn) * r * scale;
    out.z = u.pos.z + Math.cos(h + turn) * r * scale;
    if (localClear(army, u.pos, out)) return out;
  }
  out.x = u.pos.x; out.z = u.pos.z;
  return out;
}

// 出す時と、歩けない場所に残った時だけ、同じ側の近い足場へ戻す。
export function recoverGround(army, u) {
  if (u.isPlayer || u.climb || u.perch || u.naka || army.world.walkable(u.pos.x, u.pos.z)) return false;
  const q = u._groundRecovery || (u._groundRecovery = { x: 0, z: 0 });
  const lim = (army.world.def.moveLim || 176) - 0.3;
  for (let r = 0.5; r <= 8; r += 0.5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8; q.x = u.pos.x + Math.sin(a) * r; q.z = u.pos.z + Math.cos(a) * r;
    if (Math.abs(q.x) > lim || Math.abs(q.z) > lim || !army.world.walkable(q.x, q.z) || army.wallBetween(u.pos, -1, q)) continue;
    u.pos.x = q.x; u.pos.z = q.z; u.mv.x = u.mv.z = u.push.x = u.push.z = 0; return true;
  }
  return false;
}
