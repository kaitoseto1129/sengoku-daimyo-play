// ======================================================================
// 床の層（floors.js）… docs/castle-design.md 4章
// 地面の上に重ねる「床」：櫓の中・石垣の上・塀の武者走り・天守の階など、
// world.heightAt だけでは表せない高さに人が立てる・登れるようにする土台。
// 戦ごとに FL.reset() で作り直す（稲葉山などの城の戦の setup の頭で呼ぶ）。
// 床の無い戦（大半の野戦）は decks が空のまま＝ groundAt は heightAt を返すだけで、重さは変わらない。
// ======================================================================

const GRID = 8;   // 探しを速くする升目の一辺（m）

export const FL = {
  decks: [],    // 平らな床：{ id, x0, x1, z0, z1, rot, cx, cz, y, name }
  ramps: [],    // 坂・石段：{ ax, az, bx, bz, w, ya, yb, step }
  ladders: [],  // 梯子：{ id, x, z, rot, y0, y1, deck, hp, team, name, speed }
  walls: [],    // 高さのある当たり：{ ax, az, bx, bz, r, y0, y1 }
  grid: null,   // Map('gx,gz' -> [deck idx...])
};

export function reset() {
  FL.decks.length = 0; FL.ramps.length = 0; FL.ladders.length = 0; FL.walls.length = 0;
  FL.grid = new Map();
}

function gridKey(x, z) { return `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`; }
function gridPut(d) {
  // 床は cx,cz を中心にした矩形（inDeck と同じ見方）。cx を渡した床（櫓・天守・御殿）の x0..x1 は中心からの値なので、
  // 前のように x0..x1 をそのまま升目にすると原点の近くにしか載らず、離れた所の床が拾えなかった（10/1）
  const hx = Math.abs(d.x1 - d.x0) / 2, hz = Math.abs(d.z1 - d.z0) / 2;
  const rx = d.rot ? Math.hypot(hx, hz) : hx, rz = d.rot ? Math.hypot(hx, hz) : hz;
  const gx0 = Math.floor((d.cx - rx - 0.4) / GRID), gx1 = Math.floor((d.cx + rx + 0.4) / GRID);
  const gz0 = Math.floor((d.cz - rz - 0.4) / GRID), gz1 = Math.floor((d.cz + rz + 0.4) / GRID);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const k = `${gx},${gz}`;
    if (!FL.grid.has(k)) FL.grid.set(k, []);
    FL.grid.get(k).push(d);
  }
}

// 床を足す。四角（x0..x1, z0..z1）、rot があれば cx,cz を中心に回した矩形として当たりを取る
export function addDeck(o) {
  const d = { id: FL.decks.length, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, rot: o.rot || 0, cx: o.cx ?? (o.x0 + o.x1) / 2, cz: o.cz ?? (o.z0 + o.z1) / 2, y: o.y, name: o.name || '', roof: o.roof };
  FL.decks.push(d);
  gridPut(d);
  return d.id;
}
export function addRamp(o) {
  FL.ramps.push({ ax: o.ax, az: o.az, bx: o.bx, bz: o.bz, w: o.w || 2, ya: o.ya, yb: o.yb, step: o.step || 0 });
  return FL.ramps.length - 1;
}
export function addLadder(o) {
  const l = { id: FL.ladders.length, x: o.x, z: o.z, rot: o.rot || 0, y0: o.y0, y1: o.y1, deck: o.deck, hp: o.hp ?? 30, team: o.team, name: o.name || '梯子', speed: o.speed || 1.6 };
  FL.ladders.push(l);
  return l.id;
}
export function addWall(o) {
  FL.walls.push({ ax: o.ax, az: o.az, bx: o.bx, bz: o.bz, r: o.r || 0.4, y0: o.y0, y1: o.y1 });
  return FL.walls.length - 1;
}

// 点 (x,z) が矩形の床の内かどうか（rot 対応）
function inDeck(d, x, z) {
  let lx = x - d.cx, lz = z - d.cz;
  if (d.rot) { const c = Math.cos(-d.rot), s = Math.sin(-d.rot); const rx = lx * c - lz * s, rz = lx * s + lz * c; lx = rx; lz = rz; }
  const hx = Math.abs(d.x1 - d.x0) / 2, hz = Math.abs(d.z1 - d.z0) / 2;
  return lx >= -hx - 0.4 && lx <= hx + 0.4 && lz >= -hz - 0.4 && lz <= hz + 0.4;
}
function nearbyDecks(x, z) {
  if (!FL.grid) return FL.decks;
  const k = gridKey(x, z);
  return FL.grid.get(k) || [];
}

// 床の上か：床の id（無ければ null）。y を渡せば、その床に「乗っている」高さの物だけ拾う
export function deckAt(x, z, y) {
  const list = nearbyDecks(x, z);
  let best = null;
  for (const d of list) {
    if (!inDeck(d, x, z)) continue;
    if (y != null && Math.abs(y - d.y) > 1.2) continue;
    if (!best || d.y > best.y) best = d;
  }
  return best ? best.id : null;
}

// 坂の上にいるか：戻り値は { y, ramp } か null
function rampAt(x, z) {
  for (const r of FL.ramps) {
    const dx = r.bx - r.ax, dz = r.bz - r.az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const t = ((x - r.ax) * dx + (z - r.az) * dz) / (len * len);
    if (t < -0.05 || t > 1.05) continue;
    const px = r.ax + dx * t, pz = r.az + dz * t;
    if (Math.hypot(x - px, z - pz) > (r.w || 2) / 2 + 0.3) continue;
    const tc = Math.max(0, Math.min(1, t));
    return r.ya + (r.yb - r.ya) * tc;
  }
  return null;
}

// 立つ高さ：地面 heightAt と、足の高さ y から 0.9m 以内（歩いて上がれる段差）の床・坂のうち、一番高い物
export function groundAt(world, x, z, y = 0) {
  const base = world.heightAt(x, z);
  if (!FL.decks.length && !FL.ramps.length) return base;
  let best = base;
  for (const d of nearbyDecks(x, z)) {
    if (!inDeck(d, x, z)) continue;
    if (d.y <= y + 0.9 + 0.01 || d.y <= best + 0.9 + 0.01) { if (d.y > best) best = d.y; }
    else if (d.y > y + 2.2) { /* 段差が高すぎる床は無視（下りるのは別の判定で拾う） */ }
  }
  const ry = rampAt(x, z);
  if (ry != null && ry > best - 3) best = Math.max(best, ry);
  return best;
}

// 線分 p→q が、y の高さで通れるか（塀・櫓の壁に遮られていないか）
export function blocked(x0, z0, x1, z1, y) {
  for (const w of FL.walls) {
    if (y != null && (y > w.y1 - 0.05 || y < w.y0)) continue;   // その高さより上（塀の上を歩ける）か下は素通り
    const d = segSegDist(x0, z0, x1, z1, w.ax, w.az, w.bx, w.bz);
    if (d < (w.r || 0.4)) return true;
  }
  return false;
}
function segSegDist(ax, az, bx, bz, cx, cz, dx, dz) {
  // ざっくりした線分どうしの最短距離（サンプル）
  let min = Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    const u = Math.max(0, Math.min(1, ((px - cx) * (dx - cx) + (pz - cz) * (dz - cz)) / (Math.hypot(dx - cx, dz - cz) ** 2 || 1)));
    const qx = cx + (dx - cx) * u, qz = cz + (dz - cz) * u;
    const dist = Math.hypot(px - qx, pz - qz);
    if (dist < min) min = dist;
  }
  return min;
}

// 梯子の足もとに近いか（登り始める距離）
export function ladderNear(x, z, r = 1.6) {
  let best = null, bd = r;
  for (const l of FL.ladders) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}
