// 描いた煙の位置と濃さから、目の前と見通しの煙を読む。粒や配列は作らない。
// 11/21 クラウド k365-03（K564 掃除の跳ね・alloc_prof：smokeDepth が兵の索敵ごとに一コマ百KB 余りを割り当て）：
//   十二の小数を引数で渡すと、呼ぶたびに数の箱が作られていた。線と粒は使い回す Float64Array に置いて渡す（計算と答えは同じ）
const SEG = new Float64Array(13);   // ax ay az dx dy dz len 足した濃さ ｜ 粒の cx cy cz r alpha（引数で小数を渡さない）
function puffDepth() {
  const cx = SEG[8], cy = SEG[9], cz = SEG[10], r = SEG[11], alpha = SEG[12];
  if (!(r > 0) || !(alpha > 0.004)) return;
  const ax = SEG[0], ay = SEG[1], az = SEG[2], dx = SEG[3], dy = SEG[4], dz = SEG[5], len = SEG[6];
  // 遠い粒は平方根を求めずに外す。兵が多い時も上限内の粒だけを読む。
  if (cx + r < Math.min(ax, ax + dx) || cx - r > Math.max(ax, ax + dx) ||
      cy + r < Math.min(ay, ay + dy) || cy - r > Math.max(ay, ay + dy) ||
      cz + r < Math.min(az, az + dz) || cz - r > Math.max(az, az + dz)) return;
  const x = cx - ax, y = cy - ay, z = cz - az;
  if (len < 0.001) { SEG[7] += alpha * Math.max(0, 1 - Math.sqrt(x * x + y * y + z * z) / r); return; }
  const along = (x * dx + y * dy + z * dz) / len;
  const cross2 = x * x + y * y + z * z - along * along;
  if (cross2 >= r * r) return;
  const half = Math.sqrt(r * r - Math.max(0, cross2));
  const through = Math.max(0, Math.min(len, along + half) - Math.max(0, along - half));
  SEG[7] += alpha * through / 4;
}

// 音の経路では発音点とカメラの耳の高さをそのまま渡す。耳を二重に持ち上げない。
export function smokeDepth(world, from, to = from, fromY = null, toY = null) {
  const ay = fromY ?? (from.y ?? world.heightAt(from.x, from.z)) + 1.4;
  const by = toY ?? (to.y ?? world.heightAt(to.x, to.z)) + 1.4;
  const dx = to.x - from.x, dy = by - ay, dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);   // 三つ引数の hypot は配列を作る（毎コマ何千回）
  SEG[0] = from.x; SEG[1] = ay; SEG[2] = from.z; SEG[3] = dx; SEG[4] = dy; SEG[5] = dz; SEG[6] = len; SEG[7] = 0;
  const H = world.haze;
  if (H) for (let i = 0; i < H.list.length; i++) {
    const k = i * 3;
    SEG[8] = H.ctr[k]; SEG[9] = H.ctr[k + 1]; SEG[10] = H.ctr[k + 2]; SEG[11] = H.dat[k] * 0.5; SEG[12] = H.dat[k + 1]; puffDepth();
    if (SEG[7] >= 1) return 1;
  }
  const S = world.smokeCol;
  if (S) {
    const wind = S.pts.material.uniforms.wind.value;
    // 11/9 重さ：線の四角から三つの粒が全部外れる煙の柱は、一度の比べで飛ばす（答えは同じ。鉄砲の多い戦で兵の索敵ごとに全部の柱を見ていた）
    const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x), z0 = Math.min(from.z, to.z), z1 = Math.max(from.z, to.z);
    const wx = Math.abs(wind.x) * 4.32 + 1.9, wz = Math.abs(wind.y) * 4.32 + 1.9;
    // 一本を三つの高さで近似。描く側と同じ上昇・風下への曲がり・薄まりを使う。
    for (let i = 0; i < S.n; i++) {
      const k = i * S.PER, p = k * 3, size = S.seed[k * 2 + 1];
      if (S.pos[p + 1] < -900) continue;
      const as = Math.abs(size), px = S.pos[p], pz = S.pos[p + 2];
      if (px + as * wx < x0 || px - as * wx > x1 || pz + as * wz < z0 || pz - as * wz > z1) continue;
      for (let j = 0; j < 3; j++) {
        const t = 0.12 + j * 0.24, drift = t * t * 12 * size;
        SEG[8] = S.pos[p] + wind.x * drift; SEG[9] = S.pos[p + 1] + t * 16 * size;
        SEG[10] = S.pos[p + 2] + wind.y * drift; SEG[11] = (0.8 + t * 5) * size * 0.5;
        SEG[12] = 0.42 * (1 - t) * (1 - t); puffDepth();
        if (SEG[7] >= 1) return 1;
      }
    }
  }
  return SEG[7];
}
