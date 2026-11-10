// 長い行軍を省いた開戦・場面替えでだけ使う。地形と兵の傷は変えない。
export function placeGroup(rt, g, x, z) {
  if (g.routed) return;
  g.anchor.x = x; g.anchor.z = z;
  g.order = 'hold'; g.dest = null; g.path = null; g.pathIdx = 0;
  g.onArrive = null; g.pending = null; g.focus = null;
  g.target = null;
  for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    const at = g.slotPos(u.slot, g.initial);
    u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z);
    u.mesh.position.copy(u.pos);
    u.moveTo = null; u.target = null;
    u._riverX = undefined; u._riverZ = undefined;
  }
}

export function placePlayer(rt, x, z, heading) {
  const u = rt.player.u, dx = x - u.pos.x, dz = z - u.pos.z;
  for (const t of rt.tomoUnits || []) if (t.alive && !t.gone && !t.woundOut) {
    t.pos.x += dx; t.pos.z += dz; t.pos.y = rt.world.heightAt(t.pos.x, t.pos.z);
    t.mesh.position.copy(t.pos); t.moveTo = null; t.target = null;
  }
  if (heading !== undefined) { u.heading = heading; rt.player.yaw = heading; }
  u.pos.set(x, rt.world.heightAt(x, z), z);
  u.mesh.position.copy(u.pos); u.moveTo = null; u.target = null;
  u._riverX = undefined; u._riverZ = undefined;
}
