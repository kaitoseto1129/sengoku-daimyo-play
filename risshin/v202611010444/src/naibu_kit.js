// 和の部屋の購入部品を指定の寸法へ合わせる。近づいて室内を作る時だけ呼ぶ。
import { cgtOn, cgtBox, cgtParts, cgtSpend } from './cgt.js';
export function addNaibu(batch, name, x, y, z, w, h, d, rot = 0) {
  if (!cgtOn()) return false;
  const key = 'naibu_' + name, bounds = cgtBox(key);
  if (!bounds) return false;
  const parts = cgtParts(key);
  const tris = parts.reduce((sum, p) => sum + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (!cgtSpend(tris)) return false;
  const sx = w / (2 * bounds.h[0]), sy = h / (2 * bounds.h[1]), sz = d / (2 * bounds.h[2]);
  // 箱の中心のずれも吸収し、当たりに合わせて中央の足もとへ置く。
  const dx = bounds.c[0] * sx, dz = bounds.c[2] * sz;
  return batch.add(key, x - dx * Math.cos(rot) - dz * Math.sin(rot), y - (bounds.c[1] - bounds.h[1]) * sy,
    z + dx * Math.sin(rot) - dz * Math.cos(rot), rot, sx, sy, sz);
}

// 元の階段の長い向きと上がる側を一度だけ調べ、当たりの坂（局所＋横）へ合わせる。
const stairDirections = new Map();
export function addNaibuStairs(batch, x, y, z, run, rise, width, rot = 0) {
  const key = 'naibu_stairs_a', bounds = cgtBox(key);
  if (!bounds) return false;
  if (!stairDirections.has(key)) {
    const axis = bounds.h[0] >= bounds.h[2] ? 0 : 2;
    let slope = 0;
    for (const part of cgtParts(key)) {
      const p = part.geo.attributes.position;
      for (let i = 0; i < p.count; i++) slope += ((axis === 0 ? p.getX(i) : p.getZ(i)) - bounds.c[axis]) * (p.getY(i) - bounds.c[1]);
    }
    stairDirections.set(key, { axis, angle: axis === 0 ? (slope < 0 ? Math.PI : 0) : (slope < 0 ? -Math.PI / 2 : Math.PI / 2) });
  }
  const dir = stairDirections.get(key);
  return addNaibu(batch, 'stairs_a', x, y, z, dir.axis === 0 ? run : width, rise, dir.axis === 0 ? width : run, rot + dir.angle);
}
