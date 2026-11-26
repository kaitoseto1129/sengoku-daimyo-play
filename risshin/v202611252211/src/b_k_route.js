// 徳川編の山城・渡河の戦で使う「道に沿って動く」道具（b_k07_sawayama.js の routeAt・Way と同じ作り）。
// 兵も bot も、曲輪の口・浅瀬のような一本道を外れずに、道の曲がり角を一つずつ辿る。
export function routeTools(ROUTE, tag) {
  const key = `_${tag}Way`;
  const RF = { d: 0, s: 0, x: 0, z: 0 }, RT = { d: 0, s: 0, x: 0, z: 0 };
  function routeAt(x, z, out) {
    let best = Infinity, bs = 0, bx = x, bz = z;
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const [ax, az] = ROUTE[i], [cx, cz] = ROUTE[i + 1];
      const dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bs = i + t; bx = px; bz = pz; }
    }
    out.d = best; out.s = bs; out.x = bx; out.z = bz;
    return out;
  }
  function way(army, u, want) {
    const q = u[key] || (u[key] = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
    if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) return q;
    if (q.t > army.time && !q.active) return want;
    q.t = army.time + 0.3; q.active = false;
    if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
    routeAt(u.pos.x, u.pos.z, RF); routeAt(want.x, want.z, RT);
    if (RF.d > 30 || RT.d > 30 || Math.abs(RT.s - RF.s) < 0.6) return want;
    q.active = true;
    if (RF.d > 4) { q.x = RF.x; q.z = RF.z; return q; }
    const fwd = RT.s > RF.s;
    let i = fwd ? Math.floor(RF.s) + 1 : Math.ceil(RF.s) - 1;
    i = Math.max(0, Math.min(ROUTE.length - 1, i));
    if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < 1.5) i += fwd ? 1 : -1;
    if (i < 0 || i >= ROUTE.length || (fwd ? i > RT.s : i < RT.s)) { q.x = RT.x; q.z = RT.z; }
    else { q.x = ROUTE[i][0]; q.z = ROUTE[i][1]; }
    return q;
  }
  return { routeAt, way };
}
