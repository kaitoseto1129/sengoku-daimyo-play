// 描いた煙の位置と濃さから、目の前と見通しの煙を読む。粒や配列は作らない。
function puffDepth(ax, ay, az, dx, dy, dz, len, cx, cy, cz, r, alpha) {
  if (!(r > 0) || !(alpha > 0.004)) return 0;
  // 遠い粒は平方根を求めずに外す。兵が多い時も上限内の粒だけを読む。
  if (cx + r < Math.min(ax, ax + dx) || cx - r > Math.max(ax, ax + dx) ||
      cy + r < Math.min(ay, ay + dy) || cy - r > Math.max(ay, ay + dy) ||
      cz + r < Math.min(az, az + dz) || cz - r > Math.max(az, az + dz)) return 0;
  const x = cx - ax, y = cy - ay, z = cz - az;
  if (len < 0.001) return alpha * Math.max(0, 1 - Math.hypot(x, y, z) / r);
  const along = (x * dx + y * dy + z * dz) / len;
  const cross2 = x * x + y * y + z * z - along * along;
  if (cross2 >= r * r) return 0;
  const half = Math.sqrt(r * r - Math.max(0, cross2));
  const through = Math.max(0, Math.min(len, along + half) - Math.max(0, along - half));
  return alpha * through / 4;
}

export function smokeDepth(world, from, to = from) {
  const ay = (from.y ?? world.heightAt(from.x, from.z)) + 1.4;
  const by = (to.y ?? world.heightAt(to.x, to.z)) + 1.4;
  const dx = to.x - from.x, dy = by - ay, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  let depth = 0;
  const H = world.haze;
  if (H) for (let i = 0; i < H.list.length; i++) {
    const k = i * 3;
    depth += puffDepth(from.x, ay, from.z, dx, dy, dz, len,
      H.ctr[k], H.ctr[k + 1], H.ctr[k + 2], H.dat[k] * 0.5, H.dat[k + 1]);
    if (depth >= 1) return 1;
  }
  const S = world.smokeCol;
  if (S) {
    const wind = S.pts.material.uniforms.wind.value;
    // 一本を三つの高さで近似。描く側と同じ上昇・風下への曲がり・薄まりを使う。
    for (let i = 0; i < S.n; i++) {
      const k = i * S.PER, p = k * 3, size = S.seed[k * 2 + 1];
      if (S.pos[p + 1] < -900) continue;
      for (let j = 0; j < 3; j++) {
        const t = 0.12 + j * 0.24, drift = t * t * 12 * size;
        depth += puffDepth(from.x, ay, from.z, dx, dy, dz, len,
          S.pos[p] + wind.x * drift, S.pos[p + 1] + t * 16 * size,
          S.pos[p + 2] + wind.y * drift, (0.8 + t * 5) * size * 0.5,
          0.42 * (1 - t) * (1 - t));
        if (depth >= 1) return 1;
      }
    }
  }
  return depth;
}
