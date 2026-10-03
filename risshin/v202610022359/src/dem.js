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

// 戦場の外側の遠景にだけ、実測の起伏を「足す」小さな道具（手書きの地形・縄張りは壊さない）。
// (cx,cz) を中心に inner までは 0、inner〜inner+fade で実測へ。中心より低い所は足さない（谷を掘らない）。
// o.xy：ゲームの座標 1 が実の何 m か。o.scale：実測の高さをゲームの高さへ縮める率。
export function demRelief(d, x, z, o = {}) {
  const xy = o.xy ?? 1, cx = o.cx ?? 0, cz = o.cz ?? 0, inner = o.inner ?? 60, fade = o.fade ?? 40;
  const r = Math.hypot((x - cx) * (o.ax ?? 1), (z - cz) * (o.az ?? 1));
  if (r <= inner) return 0;
  const t = Math.min(1, (r - inner) / fade), m = t * t * (3 - 2 * t);
  const sx = x * xy, sz = z * xy, lim = d.range || (d.n - 1) / 2 * d.step;
  if (Math.abs(sx) > lim || Math.abs(sz) > lim) return 0;
  const ref = demSample(d, cx * xy, cz * xy);
  return Math.max(0, demSample(d, sx, sz) - ref) * (o.scale ?? 0.2) * m;
}

// 実測の「細かい起伏」だけを返す道具（手書きの山の形はそのまま、尾根と谷の凹凸だけを足す）。
// 実測の標高から、まわり（±win m）の平均を引いた差に scale を掛ける。範囲の縁では 0 へ薄れる。
// o.xy：ゲームの座標 1 が実の何 m か。o.ox・o.oz：実測の原点に当たるゲームの座標。o.cz：実測側の z のずらし（m）。
export function demDetail(d, x, z, o = {}) {
  const xy = o.xy ?? 1, win = o.win ?? 60, scale = o.scale ?? 0.4, lim = d.range || (d.n - 1) / 2 * d.step;
  const sx = (x - (o.ox ?? 0)) * xy, sz = (z - (o.oz ?? 0)) * xy + (o.cz ?? 0);
  const edge = Math.min(lim - Math.abs(sx), lim - Math.abs(sz));
  if (edge <= win) return 0;
  const f = Math.min(1, (edge - win) / 60);
  const avg = (demSample(d, sx + win, sz) + demSample(d, sx - win, sz) + demSample(d, sx, sz + win) + demSample(d, sx, sz - win) + demSample(d, sx, sz)) / 5;
  return (demSample(d, sx, sz) - avg) * scale * f;
}
