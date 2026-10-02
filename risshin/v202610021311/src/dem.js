// 国土地理院 標高タイルから作った asset_dem_<城>.js（prototype/tools/dem.mjs 製）を読む小さな道具。
// 出典：国土地理院 地理院タイル（DEM5A・DEM10B）。docs/CREDITS.md 参照。
// 使い方（各 b_*.js 側）：
//   let dem = null;
//   import('./asset_dem_inabayama.js').then((m) => { dem = m.default; });
//   height(x, z) { return dem ? demBlend(dem, x, z, base(x, z), { scale, floor }) : base(x, z); }

const cache = new WeakMap();
function arrOf(d) {
  let a = cache.get(d);
  if (!a) {
    const bin = atob(d.data), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    a = new Int16Array(buf.buffer);
    cache.set(d, a);
  }
  return a;
}

// 格子を双線形補間して、その地点の実測の相対標高（m、d.min を 0 とした値）を返す
export function demSample(d, x, z) {
  const arr = arrOf(d), n = d.n, step = d.step, half = (n - 1) / 2 * step;
  const fx = (x + half) / step, fz = (z + half) / step;
  const ix = Math.max(0, Math.min(n - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(n - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
  const at = (X, Z) => arr[Z * n + X] * 0.1;
  const h00 = at(ix, iz), h10 = at(ix + 1, iz), h01 = at(ix, iz + 1), h11 = at(ix + 1, iz + 1);
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

// 手書きの base(x,z) の手触りに合わせて、実測地形を混ぜる。
// o.scale：実測の relief（m）を、そのままゲームの高さの単位にどれだけ縮めるか（例 0.18）。
// o.floor：この高さより下にはしない（谷を掘りすぎない）。既定は base の値。
// o.xyScale：ゲームの座標1が実の何 m かの縮め（既定1＝城用。野戦は戦場が数 km あるので
//   例えば xyScale=4 なら、ゲームの x・z を4倍してから DEM を引く＝ゲーム内を1/4に縮めて収める）。
// 範囲外（|x|や|z|を xyScale で伸ばした後が d.range を超える）は base をそのまま返す（段・柵・城の部品の外側を壊さない）。
export function demBlend(d, x, z, base, o = {}) {
  const xy = o.xyScale ?? 1;
  const sx = x * xy, sz = z * xy;
  const r = d.range || (d.n - 1) / 2 * d.step;
  if (Math.abs(sx) > r || Math.abs(sz) > r) return base;
  const scale = o.scale ?? 1;
  const h = demSample(d, sx, sz) * scale;
  return o.floor !== undefined ? Math.max(o.floor, h) : h;
}
