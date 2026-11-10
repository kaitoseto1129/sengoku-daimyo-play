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
  bringHorse(rt);
}

// 11/11 関所の5（鳥取）：段の間に本人だけ遠くへ移すと、降りて待つ自分の馬が二百歩後ろに残り、呼んでも来ず乗れなかった。
//   口取りが曳いて来た心で、本人の後ろ五歩へ連れて来る（逃げた・下がった・死んだ馬はそのまま）。
export function bringHorse(rt) {
  const P = rt.player, u = P?.u, L = P?.loose, h = P?.horse;
  if (!u || !L || !h || L.mode === 'fled' || L.mode === 'back' || h.userData?.horse?.dead) return;
  if (Math.hypot(L.x - u.pos.x, L.z - u.pos.z) < 20) return;
  const lim = rt.world.def.moveLim || 176;
  L.x = Math.max(-lim, Math.min(lim, u.pos.x - Math.sin(u.heading) * 5));
  L.z = Math.max(-lim, Math.min(lim, u.pos.z - Math.cos(u.heading) * 5));
  L.heading = u.heading; L.spd = 0; L.mode = 'wait'; L.farT = 0;
  h.position.set(L.x, rt.world.heightAt(L.x, L.z), L.z);
}
