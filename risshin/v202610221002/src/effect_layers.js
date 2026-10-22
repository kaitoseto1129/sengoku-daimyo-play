// 近景は全枚、中景は二層、遠景は一層を目安に、重なる粒だけまとめる。
// 表は使い回し、粒の移動・寿命・視界判定には手を入れない。
export class EffectLayers {
  constructor() {
    this.x = new Int32Array(2048); this.z = new Int32Array(2048);
    this.tier = new Uint8Array(2048); this.first = new Int32Array(2048);
    this.second = new Int32Array(2048); this.hits = new Uint16Array(2048);
    this.stamps = new Uint32Array(2048); this.generation = 0;
    this.reset();
  }
  reset() {
    this.generation = (this.generation + 1) >>> 0;
    if (!this.generation) { this.stamps.fill(0); this.generation = 1; }
    this.count = 0; this.examined = 0; this.merged = 0;
  }
  slot(x, z, distanceSq) {
    this.examined++;
    if (distanceSq < 2025) return this.count++;
    const tier = distanceSq < 14400 ? 1 : 2, cell = tier === 1 ? 5 : 12;
    const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
    let h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ tier) & 2047;
    while (this.stamps[h] === this.generation && (this.x[h] !== ix || this.z[h] !== iz || this.tier[h] !== tier)) h = (h + 1) & 2047;
    if (this.stamps[h] !== this.generation) {
      this.stamps[h] = this.generation;
      this.x[h] = ix; this.z[h] = iz; this.tier[h] = tier;
      this.first[h] = this.count++; this.second[h] = -1; this.hits[h] = 0;
      return this.first[h];
    }
    if (tier === 1 && this.second[h] < 0) return (this.second[h] = this.count++);
    this.merged++;
    return tier === 1 && this.hits[h]++ % 2 ? this.second[h] : this.first[h];
  }
  // 中心も動かして両方を包む。元の二枚より面積が増える組は別々に描く。
  merge(positions, sizes, j, x, y, z, size, width = 1, height = 1) {
    const dx = x - positions[j], dy = y - positions[j + 1], dz = z - positions[j + 2];
    const distance = Math.sqrt(dx * dx + dz * dz) / width + Math.abs(dy) / height;
    const old = sizes[j], span = Math.max(old, size, distance + (old + size) * 0.5);
    if (span * span > old * old + size * size) { this.merged--; return false; }
    const shift = distance > 0 ? Math.max(0, Math.min(1, (span - old) / (2 * distance))) : 0;
    positions[j] += dx * shift; positions[j + 1] += dy * shift; positions[j + 2] += dz * shift;
    sizes[j] = span;
    return true;
  }
}
