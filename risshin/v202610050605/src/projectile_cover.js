// 弾と矢に共通の当たり。線の途中で最初に触れた物だけを返す。
// 升目と結果の入れ物は使い回す。形や材質を飛翔中に作らない。
export function boxEntry(x, y, z, dx, dy, dz, x0, x1, y0, y1, z0, z1) {
  let lo = 0, hi = 1;
  if (Math.abs(dx) < 1e-10) { if (x < x0 || x > x1) return 2; }
  else { const a = (x0 - x) / dx, b = (x1 - x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  if (Math.abs(dy) < 1e-10) { if (y < y0 || y > y1) return 2; }
  else { const a = (y0 - y) / dy, b = (y1 - y) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  if (Math.abs(dz) < 1e-10) { if (z < z0 || z > z1) return 2; }
  else { const a = (z0 - z) / dz, b = (z1 - z) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
  return lo <= hi ? lo : 2;
}
function rectEntry(x, y, z, dx, dy, dz, cx, cz, c, s, hw, hd, bottom, top) {
  const px = x - cx, pz = z - cz;
  return boxEntry(px * c - pz * s, y, px * s + pz * c, dx * c - dz * s, dy, dx * s + dz * c, -hw, hw, bottom, top, -hd, hd);
}
function accept(h, q, object, type, host = null) {
  if (q >= h.q) return;
  h.q = q; h.object = object; h.type = type; h.host = host;
}
const cellKey = (x, z) => (x + 20000) * 40000 + z + 20000;
function groundHeight(W, x, z) {
  const base = W.heightAt(x, z); let top = base;
  if (W.missileEarth) for (const b of W.missileEarth) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    const dx = x - b.ax, dz = z - b.az;
    const t = (dx * (b.bx - b.ax) + dz * (b.bz - b.az)) / (b.len2 || 1);
    const u = (dx * b.nx + dz * b.nz + 0.3) / b.w;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) top = Math.max(top, base + b.h * (1 - u * u));
  }
  return top;
}
export function projectileCover(army, x, y, z, ex, ey, ez, owner) {
  const h = army._missileHit || (army._missileHit = { q: 2, object: null, type: 'dust', host: null });
  h.q = 2; h.object = h.host = null; h.type = 'dust';
  const dx = ex - x, dy = ey - y, dz = ez - z, W = army.world;
  for (const o of army.structs) {
    if (!o.alive) continue;
    const name = o.name || '', height = o.h || (/塀|壁|門|石垣|櫓/.test(name) ? 3 : 2.1);
    let q = 2;
    if (o.seg) {
      const a = o.seg, vx = a[2] - a[0], vz = a[3] - a[1], L = Math.hypot(vx, vz) || 1;
      const cx = (a[0] + a[2]) * 0.5, cz = (a[1] + a[3]) * 0.5, bottom = W.heightAt(cx, cz);
      q = rectEntry(x, y, z, dx, dy, dz, cx, cz, vx / L, -vz / L, L * 0.5, o.thick || 0.12, bottom, bottom + height);
    } else if (o.solidR) {
      const bottom = W.heightAt(o.x, o.z), r = o.solidR;
      q = boxEntry(x, y, z, dx, dy, dz, o.x - r, o.x + r, bottom, bottom + height, o.z - r, o.z + r);
    }
    accept(h, q, o, /土|石|堤/.test(name) ? 'dust' : 'wood');
  }
  if (army.solids) for (const o of army.solids) {
    if ((!o.missileH && o.naka == null) || (o.struct && !o.struct.alive)) continue;
    let q = 2;
    if (o.k === 'r') {
      const bottom = W.heightAt(o.x, o.z);
      q = rectEntry(x, y, z, dx, dy, dz, o.x, o.z, o.c, o.s, o.hw, o.hd, bottom, bottom + o.missileH);
    } else if (o.k === 's') {
      const vx = o.bx - o.ax, vz = o.bz - o.az, L = Math.hypot(vx, vz) || 1;
      const cx = (o.ax + o.bx) * .5, cz = (o.az + o.bz) * .5, bottom = o.naka != null ? o.yBot : W.heightAt(cx, cz);
      q = rectEntry(x, y, z, dx, dy, dz, cx, cz, vx / L, -vz / L, L * .5, o.r, bottom, o.naka != null ? o.yTop : bottom + o.missileH);
    }
    accept(h, q, o.struct || o, o.missileType);
  }
  // 階を分ける板床も矢玉を止める。階段と石落としの穴は床の残りの四角から除かれている。
  for (const I of army.interiorRooms || []) {
    if (I.disabled || Math.max(x, ex) < I.x - I.R || Math.min(x, ex) > I.x + I.R || Math.max(z, ez) < I.z - I.R || Math.min(z, ez) > I.z + I.R) continue;
    for (const lv of I.levels) {
      if (Math.min(y, ey) > lv.y || Math.max(y, ey) < lv.y - .12) continue;
      for (const p of lv.pieces) {
        const lx = (p[0] + p[1]) * .5, lz = (p[2] + p[3]) * .5;
        const cx = I.x + lx * I.c + lz * I.s, cz = I.z - lx * I.s + lz * I.c;
        accept(h, rectEntry(x, y, z, dx, dy, dz, cx, cz, I.c, I.s, (p[1] - p[0]) * .5, (p[3] - p[2]) * .5, lv.y - .12, lv.y), I, 'wood');
      }
    }
  }
  // 携行する竹束は向きと幅と高さで受ける。味方の束も弾を止める。
  for (const o of army.units) {
    if (!o.alive || !o.tatake || o === owner) continue;
    const c = Math.cos(o.heading), s = Math.sin(o.heading);
    const cx = o.pos.x + c * 0.05 + s * 0.62, cz = o.pos.z - s * 0.05 + c * 0.62;
    const q = rectEntry(x, y, z, dx, dy, dz, cx, cz, c, s, 0.42, 0.09, o.pos.y, o.pos.y + 1.85);
    accept(h, q, o, 'wood', o.tatake);
  }
  // 木の幹・枝を八メートルの升目に登録。矢一本につき森全部は調べない。
  if (army._woodSource !== W.missileWood) {
    army._woodSource = W.missileWood;
    const grid = army._woodGrid = new Map();
    for (const b of W.missileWood || []) {
      for (let ix = Math.floor(b.x0 / 8); ix <= Math.floor(b.x1 / 8); ix++) for (let iz = Math.floor(b.z0 / 8); iz <= Math.floor(b.z1 / 8); iz++) {
        const key = cellKey(ix, iz); let list = grid.get(key);
        if (!list) { list = []; grid.set(key, list); } list.push(b);
      }
    }
  }
  const grid = army._woodGrid, visit = army._missileVisit = (army._missileVisit || 0) + 1;
  if (grid) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 4));
    // 隅をまたぐ線も拾うため、通る升と隣の升を調べる。
    for (let i = 0; i <= steps; i++) {
      const ix = Math.floor((x + dx * i / steps) / 8), iz = Math.floor((z + dz * i / steps) / 8);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const list = grid.get(cellKey(ix + ox, iz + oz)); if (!list) continue;
        for (const b of list) { if (b._visit === visit) continue; b._visit = visit; accept(h, boxEntry(x, y, z, dx, dy, dz, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1), b, 'wood'); }
      }
    }
  }
  // 土塁・尾根・地面。途中も調べ、丘の裏の兵より先に土へ当てる。
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz)));
  for (let i = 0; i <= n; i++) {
    const q = i / n; if (q > h.q) break;
    if (y + dy * q > groundHeight(W, x + dx * q, z + dz * q)) continue;
    let lo = Math.max(0, (i - 1) / n), hi = q;
    for (let k = 0; k < 7; k++) { const m = (lo + hi) * 0.5; if (y + dy * m > groundHeight(W, x + dx * m, z + dz * m)) lo = m; else hi = m; }
    accept(h, hi, null, 'dust'); break;
  }
  return h;
}
