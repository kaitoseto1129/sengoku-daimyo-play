// 山城を本当の山にする持ち上げ（kaito 10/3「山城は本当に山城にしないと」）。
// 手書きの地形・曲輪（heightOf）の「後ろ」に足す：本丸から (tx,tz) までは一定の高さ rise を足す（曲輪の段の差・平らな床はそのまま）。
// そこから外へ R の間に、なだらかに 0 へ下がる（麓の陣・町は 0＝今まで通り）。
//   使い方：height(x, z) { return heightOf(...)(x, z) + yamaLift(x, z, LIFT); }
//   LIFT = { x, z（本丸）, tx, tz（一定の高さが終わる点＝麓側）, w（左右に広げる幅。曲輪が全部入る幅）, R（下がりきるまでの距離）, rise（足す高さ） }
function sstep(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
export function yamaLift(x, z, o) {
  const ax = o.tx - o.x, az = o.tz - o.z, l2 = ax * ax + az * az;
  let t = l2 > 0 ? ((x - o.x) * ax + (z - o.z) * az) / l2 : 0;
  const L = Math.sqrt(l2) || 1, tc = t < 0 ? 0 : t > 1 ? 1 : t;
  // 線の方向（along）と横（perp）に分ける。横は w までは平ら（曲輪が全部入る幅）、線の両端の外へは R で下がる
  const qx = o.x + ax * tc, qz = o.z + az * tc, vx = x - qx, vz = z - qz;
  const al = (t < 0 ? t : t > 1 ? t - 1 : 0) * L;
  const pp = L > 0 ? Math.abs((vx * -az + vz * ax) / L) : Math.hypot(vx, vz);
  const d = Math.hypot(al, Math.max(0, pp - (o.w || 0)));
  const f = d / o.R;
  if (f >= 1) return 0;
  // 直線と smoothstep の半々：麓の裾はなだらか・中腹は一定の坂・頂の肩は丸く
  return o.rise * (1 - (0.5 * f + 0.5 * sstep(f)));
}

// 九十九折りの道（kaito 10/3）：a から b へ、左右に振りながら登る点列（a と b は含む）。n 本の折れ、amp は左右の振れ幅
export function switchback(a, b, n, amp) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
  const out = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n, s = i % 2 ? 1 : -1;
    out.push([Math.round(a[0] + dx * t + px * amp * s), Math.round(a[1] + dz * t + pz * amp * s)]);
  }
  out.push(b);
  return out;
}

// 山道の腰（切り通し）：道の中心線の高さを、道の左右へ平らに広げる（横に傾いた道にならない）。外は元の坂へ戻る＝道の上と下に切岸ができる。
// hFn：元の高さの関数。lines：道の点列の配列。半幅 half の内は中心の高さ、そこから fade で元へ。
export function benchRoads(hFn, lines, half = 2.8, fade = 3.5) {
  return (x, z) => {
    const h0 = hFn(x, z);
    let bd = 1e9, bx = 0, bz = 0;
    for (const pts of lines) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, l2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
        if (d < bd) { bd = d; bx = qx; bz = qz; }
      }
    }
    if (bd >= half + fade) return h0;
    const k = bd <= half ? 1 : sstep(1 - (bd - half) / fade);
    return h0 + (hFn(bx, bz) - h0) * k;
  };
}
