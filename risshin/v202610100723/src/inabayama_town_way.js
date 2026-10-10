// 家の当たりを残し、角を回る道を兵と試験の遊び手で共有する。
export function makeTownWay(houses) {
  const blocks = houses.map(([x, z, r], i) => ({ x, z, c: Math.cos(r), s: Math.sin(r), w: (6 + i % 3) / 2 + 0.59, d: 2.84 }));
  const points = [];
  for (const h of blocks) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (h.w + 0.8), z = sz * (h.d + 0.8);
    points.push({ x: h.x + x * h.c + z * h.s, z: h.z - x * h.s + z * h.c });
  }
  const clear = (a, b) => {
    for (const h of blocks) {
      const ax = (a.x - h.x) * h.c - (a.z - h.z) * h.s;
      const az = (a.x - h.x) * h.s + (a.z - h.z) * h.c;
      const dx = (b.x - a.x) * h.c - (b.z - a.z) * h.s;
      const dz = (b.x - a.x) * h.s + (b.z - a.z) * h.c;
      let lo = 0, hi = 1;
      if (Math.abs(dx) < 1e-8) { if (Math.abs(ax) >= h.w) continue; }
      else { const t0 = (-h.w - ax) / dx, t1 = (h.w - ax) / dx; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      if (Math.abs(dz) < 1e-8) { if (Math.abs(az) >= h.d) continue; }
      else { const t0 = (-h.d - az) / dz, t1 = (h.d - az) / dz; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      if (lo < hi) return false;
    }
    return true;
  };
  const edges = points.map(() => []);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (clear(points[i], points[j])) {
    const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
    edges[i].push([j, d]); edges[j].push([i, d]);
  }
  const dist = new Float64Array(points.length), used = new Uint8Array(points.length);
  return (army, u, want) => {
    if (u.pos.z < 30 || want.z < 30 || u.pos.z > 140 || want.z > 140 || Math.abs(u.pos.x) > 64 || Math.abs(want.x) > 64) return want;
    const q = u._townWay || (u._townWay = { x: 0, z: 0, gx: 0, gz: 0, until: -1, active: false, botRadius: 0.2 });
    if (q.until > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 0.5 && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 0.4)) return q.active ? q : want;
    q.until = army.time + 0.5; q.gx = want.x; q.gz = want.z; q.active = false;
    if (clear(u.pos, want)) return want;
    used.fill(0);
    for (let i = 0; i < points.length; i++) dist[i] = clear(points[i], want) ? Math.hypot(points[i].x - want.x, points[i].z - want.z) : Infinity;
    for (let k = 0; k < points.length; k++) {
      let best = -1, d = Infinity;
      for (let i = 0; i < points.length; i++) if (!used[i] && dist[i] < d) { best = i; d = dist[i]; }
      if (best < 0) break;
      used[best] = 1;
      for (const edge of edges[best]) dist[edge[0]] = Math.min(dist[edge[0]], d + edge[1]);
    }
    let best = -1, d = Infinity;
    for (let i = 0; i < points.length; i++) {
      const step = Math.hypot(points[i].x - u.pos.x, points[i].z - u.pos.z);
      if (step < 0.3 || dist[i] + step >= d || !clear(u.pos, points[i])) continue;
      best = i; d = dist[i] + step;
    }
    if (best < 0) return want;
    q.x = points[best].x; q.z = points[best].z; q.active = true;
    return q;
  };
}
