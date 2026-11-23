// 砦の壁と傾いた屋根を、面を調べる回数の上限によらず避ける。
// 開口を除いた板だけを設営時に控える。判定中は入れ物を作らない。
export function panelCameraHit(panel, from, to) {
  const x = from.x - panel.x, y = from.y - panel.y, z = from.z - panel.z;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? x : axis === 1 ? y * panel.c + z * panel.s : -y * panel.s + z * panel.c;
    const delta = axis === 0 ? dx : axis === 1 ? dy * panel.c + dz * panel.s : -dy * panel.s + dz * panel.c;
    const half = (axis === 0 ? panel.w : axis === 1 ? panel.h : panel.d) / 2 + .04;
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return null;
      continue;
    }
    const a = (-half - start) / delta, b = (half - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  // 妻の三角形は、箱の上隅を斜辺で切る。棟より外の空間まで壁にしない。
  if (panel.triangle) {
    const slope = panel.h * 2 / panel.d;
    for (let side = -1; side <= 1; side += 2) {
      const start = y + side * z * slope;
      const delta = dy + side * dz * slope;
      const top = panel.h / 2 + .04;
      if (Math.abs(delta) < 1e-8) {
        if (start > top) return null;
        continue;
      }
      const edge = (top - start) / delta;
      if (delta > 0) leave = Math.min(leave, edge);
      else enter = Math.max(enter, edge);
      if (enter > leave) return null;
    }
  }
  return enter;
}

export function installFortCamera(rt, panels) {
  const world = rt.world, previous = world.cameraBlockFraction, dispose = rt.dispose;
  world.cameraBlockFraction = function (from, to) {
    let nearest = previous?.call(this, from, to) ?? null;
    for (const panel of panels) {
      const hit = panelCameraHit(panel, from, to);
      if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
    }
    return nearest;
  };
  rt.dispose = function (...args) {
    world.cameraBlockFraction = previous;
    return dispose.apply(this, args);
  };
}
