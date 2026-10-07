import { FL } from './floors.js';
import { interiorWaypoint } from './interior_layouts.js';
// 城内の当たりと守備。座標・隊列は建てる時に作り、打ち合いでは数だけを調べる。
export const INTERIOR_WALLS = [];
function wallHit(w, p, q, eyeP = 1, eyeQ = 1) {
  const sx = w.bx - w.ax, sz = w.bz - w.az, len = Math.hypot(sx, sz);
  if (len < 1e-8) return -1;
  const ux = sx / len, uz = sz / len, px = p.x - w.ax, pz = p.z - w.az;
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const pos = k === 2 ? p.y + eyeP : k ? -px * uz + pz * ux : px * ux + pz * uz;
    const delta = k === 2 ? q.y + eyeQ - p.y - eyeP : k ? -(q.x - p.x) * uz + (q.z - p.z) * ux : (q.x - p.x) * ux + (q.z - p.z) * uz;
    const a = k === 2 ? w.yBot : -w.r, b = k === 2 ? w.yTop : k ? w.r : len + w.r;
    if (Math.abs(delta) < 1e-8) { if (pos < a || pos > b) return -1; }
    else { const t0 = (a - pos) / delta, t1 = (b - pos) / delta; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    if (lo > hi) return -1;
  }
  return lo;
}
// 内の床は階段の穴を除いた床片そのものを使う。射線にも落下にも使える。
export function interiorFloorBlocked(p, q, eyeP = 0, eyeQ = 0, interiorOnly = true) {
  const py = p.y + eyeP, qy = q.y + eyeQ, dy = qy - py;
  if (Math.abs(dy) < 1e-8) return false;
  for (const d of FL.decks) {
    if (interiorOnly && !d.interior) continue;
    const t = (d.y - py) / dy;
    if (t <= .001 || t >= .999) continue;
    const x = p.x + (q.x - p.x) * t - d.cx, z = p.z + (q.z - p.z) * t - d.cz;
    const c = Math.cos(d.rot), sn = Math.sin(d.rot), lx = x * c - z * sn, lz = x * sn + z * c;
    if (lx >= d.x0 && lx <= d.x1 && lz >= d.z0 && lz <= d.z1) return true;
  }
  return false;
}
// 城の中の壁を8m の区画に置いた表（壁の数が変わった時だけ作り直す）。線の通る区画の壁だけを返す
const WG = { src: null, n: -1, grid: new Map() }, WG_SET = new Set(), WG_OUT = [], WG_NONE = [];
function wallsNear(solids, x0, x1, z0, z1) {
  if (WG.src !== solids || WG.n !== solids.length) {
    WG.src = solids; WG.n = solids.length; WG.grid.clear();
    for (const w of solids) {
      if (w.ax == null) continue;
      const r = w.r || 0;
      for (let cx = Math.floor((Math.min(w.ax, w.bx) - r) / 8); cx <= Math.floor((Math.max(w.ax, w.bx) + r) / 8); cx++)
        for (let cz = Math.floor((Math.min(w.az, w.bz) - r) / 8); cz <= Math.floor((Math.max(w.az, w.bz) + r) / 8); cz++) {
          const k = cx * 8192 + cz; let a = WG.grid.get(k); if (!a) WG.grid.set(k, a = []); a.push(w);
        }
    }
  }
  const cx0 = Math.floor(x0 / 8), cx1 = Math.floor(x1 / 8), cz0 = Math.floor(z0 / 8), cz1 = Math.floor(z1 / 8);
  if (cx0 === cx1 && cz0 === cz1) return WG.grid.get(cx0 * 8192 + cz0) || WG_NONE;
  if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 25) return solids;
  WG_SET.clear(); WG_OUT.length = 0;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = WG.grid.get(cx * 8192 + cz); if (!a) continue;
    for (const w of a) if (!WG_SET.has(w)) { WG_SET.add(w); WG_OUT.push(w); }
  }
  return WG_OUT;
}
export function interiorBlocked(solids, p, q, spear = false, eyeP = 1, eyeQ = 1) {
  if (!solids || p.y == null || q.y == null) return false;
  if (interiorFloorBlocked(p, q, eyeP, eyeQ)) return true;
  // 先に囲み箱と高さで外す（岩村は城の中の壁が253枚あり、兵の組ごとに全部を調べて一コマ三百ミリ秒かかっていた。10/7）
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), z0 = Math.min(p.z, q.z), z1 = Math.max(p.z, q.z);
  const y0 = Math.min(p.y + eyeP, q.y + eyeQ), y1 = Math.max(p.y + eyeP, q.y + eyeQ);
  for (const w of wallsNear(solids, x0, x1, z0, z1)) {
    if (w.naka == null || w.k !== 's') continue;
    if (y1 < w.yBot || y0 > w.yTop) continue;
    const r = w.r || 0;
    if (Math.max(w.ax, w.bx) + r < x0 || Math.min(w.ax, w.bx) - r > x1 || Math.max(w.az, w.bz) + r < z0 || Math.min(w.az, w.bz) - r > z1) continue;
    const t = wallHit(w, p, q, eyeP, eyeQ);
    if (t < 0) continue;
    const y = p.y + eyeP + (q.y + eyeQ - p.y - eyeP) * t;
    if (y < w.yBot || y > w.yTop) continue;
    if (spear && w.fusuma && Math.hypot((q.x - p.x) * t, (q.z - p.z) * t) < 2.2) continue;
    return true;
  }
  return false;
}
// 設営時に家具、間仕切り、床の穴を避ける。奥の大将は同じ奥の間に保つ。
export function interiorSafeSpot(lv, x, z, out, room = null, occupied = null) {
  const clear = (px, pz) => {
    if (Math.abs(px) > lv.w / 2 - .5 || Math.abs(pz) > lv.d / 2 - .5) return false;
    if (room && (px < room.x0 + .45 || px > room.x1 - .45 || pz < room.z0 + .45 || pz > room.z1 - .45)) return false;
    if (!lv.pieces.some(v => px >= v[0] + .35 && px <= v[1] - .35 && pz >= v[2] + .35 && pz <= v[3] - .35)) return false;
    if (occupied?.some(p => Math.hypot(px - p.x, pz - p.z) < .8)) return false;
    if (lv.layout.props.some(p => Math.abs(px - p.x) < p.w / 2 + .45 && Math.abs(pz - p.z) < p.d / 2 + .45)) return false;
    return !lv.layout.walls.some(v => { const dx = v.bx - v.ax, dz = v.bz - v.az, len = dx * dx + dz * dz; const t = len ? Math.max(0, Math.min(1, ((px - v.ax) * dx + (pz - v.az) * dz) / len)) : 0; return Math.hypot(px - v.ax - dx * t, pz - v.az - dz * t) < .45; });
  };
  out.x = x; out.z = z;
  if (clear(x, z)) return true;
  let best = Infinity;
  for (let px = -lv.w / 2 + .55; px <= lv.w / 2 - .5; px += .45) for (let pz = -lv.d / 2 + .55; pz <= lv.d / 2 - .5; pz += .45) {
    if (!clear(px, pz)) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d < best) { best = d; out.x = px; out.z = pz; }
  }
  return Number.isFinite(best);
}

export function interiorSwingScale(solids, u, kind) {
  const spear = (u.wpnKind || u.lookWeapon || u.weapon) === 'spear';
  if (!u.naka || !solids || (kind !== 'sweep' && kind !== 'yoko' && kind !== 'slam' && !(spear && kind === 'thrust'))) return 1;
  // 突きでも長い柄を引く場所が要る。刀の小さな振りは狭い廊下でも通せる。
  const radius = spear ? (kind === 'thrust' ? 1.1 : 2.1) : .65;
  for (const w of solids) {
    if (w.naka !== u.naka - 1 || w.fusuma || u.pos.y + 1 < w.yBot || u.pos.y + 1 > w.yTop) continue;
    const dx = w.bx - w.ax, dz = w.bz - w.az, len = dx * dx + dz * dz;
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((u.pos.x - w.ax) * dx + (u.pos.z - w.az) * dz) / len));
    if (Math.hypot(u.pos.x - w.ax - dx * t, u.pos.z - w.az - dz * t) < radius) return 0.4;
  }
  return 1;
}

// 一つの階に槍と刀を一人ずつ。階段の口・襖の裏で列を守り、城全体でも二十四人まで。
export function makeInteriorGuards(rt, I, o = {}) {
  if (I.guards || !rt.army) return I.guards || [];
  const A = rt.army, groups = I.guards = [];
  I.guardTeam = o.team ?? 1;
  let live = 0, inner = 0;
  for (const u of A.units) if (u.alive && !u.isStruct) { live++; if (u._interiorGuard) inner++; }
  A.interiorGuardN = inner;
  for (const lv of I.levels) {
    const source = o.source;
    const eligible = source ? source.units.filter(u => u.alive && !u.isStruct && !u.isOfficer && !u.isGeneral && !u.name && !u._interiorGuard && !u.mounted) : null;
    const remaining = Math.min(source ? eligible.length : 250 - live, 24 - (A.interiorGuardN || 0));
    if (remaining <= 0) break;
    const st = lv.k > 0 ? I.stairs[lv.k - 1] : null;
    let lx = I.door.lx, lz = I.door.side * (lv.d / 2 - 2), facing = I.rot + (I.door.side > 0 ? 0 : Math.PI);
    if (st) { lx = st.headX; lz = st.headZ - st.sg * 1.4; facing = I.rot + Math.atan2(st.headX - lx, st.headZ - lz); }
    else if (I.okuZ != null) { lx = lv.w * 0.225 - 1.3; lz = I.okuZ - I.door.side * 0.65; }
    lx = Math.max(-lv.w / 2 + 0.65, Math.min(lv.w / 2 - 0.65, lx));
    lz = Math.max(-lv.d / 2 + 0.65, Math.min(lv.d / 2 - 0.65, lz));
    const [x, z] = I.P(lx, lz);
    let n = Math.min(2, remaining);
    const g = A.addGroup({ team: o.team ?? 1, faction: o.faction, name: `${I.name}の守り`, order: 'hold', formation: 'column', colW: 1, spacing: 0.85, facing, anchor: { x, z }, aggro: 2.2, morale: 95, noRout: true, noGuard: true, interiorHold: true });
    // 持ち場は廊下と階段の穴を避ける。二人目は刀で槍の背を守る。
    const slots = [], localSlots = [];
    for (let j = 0; j < n; j++) {
      let px = lx - Math.sin(facing - I.rot) * j * 0.9, pz = lz - Math.cos(facing - I.rot) * j * 0.9;
      px = Math.max(-lv.w / 2 + 0.65, Math.min(lv.w / 2 - 0.65, px));
      pz = Math.max(-lv.d / 2 + 0.65, Math.min(lv.d / 2 - 0.65, pz));
      const safe = { x: px, z: pz };
      if (!interiorSafeSpot(lv, px, pz, safe, null, localSlots)) continue;
      localSlots.push(safe);
      const [sx, sz] = I.P(safe.x, safe.z); slots.push({ x: sx, z: sz });
    }
    if (!slots.length) { A.groups.splice(A.groups.indexOf(g), 1); continue; }
    n = slots.length;
    g.anchor.x = slots[0].x; g.anchor.z = slots[0].z;
    g.slotPos = (j) => slots[Math.min(j, slots.length - 1)];
    const shot = I.profile === 'yagura' ? lv.shots?.find(p => p.s === -I.door.side) || lv.shots?.[0] : null;
    if (source) {
      for (const u of eligible.slice(0, n)) {
        source.units.splice(source.units.indexOf(u), 1); source.initial = Math.max(0, source.initial - 1);
        u.group = g; u.slot = g.units.length; g.units.push(u); g.initial++;
        u.target = null; u.perch = null;
      }
      for (let j = 0; j < source.units.length; j++) source.units[j].slot = j;
    } else A.spawn(g, [{ type: shot ? 'samurai' : 'ashigaru', n: 1, o: { armor: o.armor, flag: null } }, { type: shot ? 'bow' : 'samurai', n: n - 1, o: { armor: o.armor, flag: null } }]);
    g.fire = true;
    for (const u of g.units) {
      const p = u.type === 'bow' && shot ? shot : g.slotPos(u.slot);
      u.pos.set(p.x, p.y ?? lv.y, p.z); u.naka = I.id + 1;
      u._interiorGuard = true;
      if (u.type === 'bow' && shot) { u.perch = shot; u.heading = shot.heading; }
      if (u.mesh) u.mesh.position.copy(u.pos);
    }
    groups.push(g); if (!source) live += n; A.interiorGuardN = (A.interiorGuardN || 0) + n;
  }
  if (!groups.length) I.guards = null;
  return groups;
}

// 狭間から見える敵だけを選ぶ。目の高さで壁の区画を横切る線を調べる。
export function interiorShotClear(u, t) {
  if (!u.naka && !t.naka) return true;
  const p = u.pos, q = t.pos;
  if (interiorFloorBlocked(p, q, 1.46, 1.2)) return false;
  for (const w of INTERIOR_WALLS) {
    const a = wallHit(w, p, q, 1.46, 1.2);
    if (a < 0) continue;
    const y = p.y + 1.46 + (q.y + 1.2 - p.y - 1.46) * a;
    if (y >= w.yBot && y <= w.yTop) return false;
  }
  return true;
}

// 続く味方は一列で戸口→階段→本人へ進む。行き先の箱は一人につき一度だけ作る。
export function interiorFollow(rooms, u, want, p) {
  if (!rooms || !p?.alive || u.isPlayer || u.mounted || u.target || u.fleeing || u.stagger > 0 || u.atk || u.swing || !u.group?.isPlayerSquad || u.group.order !== 'follow') return want;
  for (const I of rooms) {
    if (I.disabled) continue;
    const pdx = p.pos.x - I.x, pdz = p.pos.z - I.z;
    const px = pdx * I.c - pdz * I.s, pz = pdx * I.s + pdz * I.c;
    let dest = null;
    for (let k = I.levels.length - 1; k >= 0; k--) {
      const l = I.levels[k];
      if (Math.abs(px) < l.w / 2 && Math.abs(pz) < l.d / 2 && p.pos.y >= l.y - 0.6 && p.pos.y <= l.y + l.h) { dest = l; break; }
    }
    const leaving = !dest && u.naka === I.id + 1;
    if (!dest && !leaving) continue;
    if (leaving) dest = I.levels[0];
    if (u._innerRoom !== I.id + 1) {
      u._innerRoom = I.id + 1; u._innerStair = null; u._innerStep = -1; u._innerEntry = 0;
    }
    const q = u._innerWay || (u._innerWay = { x: 0, z: 0 });
    const dx = u.pos.x - I.x, dz = u.pos.z - I.z, lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
    let lv = null;
    for (let k = I.levels.length - 1; k >= 0; k--) {
      const l = I.levels[k];
      if (Math.abs(lx) < l.w / 2 && Math.abs(lz) < l.d / 2 && u.pos.y >= l.y - 0.6 && u.pos.y <= l.y + l.h) { lv = l; break; }
    }
    if (!lv) {
      const out = I.doorOut;
      const near = Math.hypot(u.pos.x - out.x, u.pos.z - out.z) < 1.2;
      if (near) u._innerEntry = I.id + 1;
      if (Math.hypot(u.pos.x - out.x, u.pos.z - out.z) > I.R + 4) u._innerEntry = 0;
      const to = u._innerEntry === I.id + 1 ? I.doorIn : out;
      q.x = to.x; q.z = to.z; return q;
    }
    let tx, tz, onStair = false;
    const active = u._innerStair;
    const finishing = active && u._innerStep >= 0 && u._innerStep < active.points.length;
    if (finishing || lv.k !== dest.k) {
      const up = finishing ? u._innerUp : lv.k < dest.k, st = finishing ? active : I.stairs[up ? lv.k : lv.k - 1];
      if (u._innerStair !== st || u._innerUp !== up) {
        u._innerStair = st; u._innerUp = up; u._innerStep = up ? 0 : st.points.length - 1;
      }
      let pt = st.points[u._innerStep];
      const entry = up ? 0 : st.points.length - 1;
      const wait = u._innerStep === entry && u.group.units.some(v => v !== u && v.alive && v._innerStair === st && v._innerStep !== (v._innerUp ? 0 : st.points.length - 1) && v._innerStep >= 0 && v._innerStep < st.points.length);
      if (!wait && Math.hypot(lx - pt.x, lz - pt.z) < .55 && Math.abs(u.pos.y - pt.y) < .65) {
        u._innerStep += up ? 1 : -1;
        if (u._innerStep >= 0 && u._innerStep < st.points.length) pt = st.points[u._innerStep];
      }
      tx = pt.x; tz = pt.z; onStair = true;
      // 狭い段は一人ずつ。待つ味方は段の外の床へ寄る。
      if (wait) tz = pt.z - st.sg * Math.min(1.8, 1.2 + (u._innerRank || 0) * .2);
    } else {
      u._innerStair = null;
      if (leaving) {
        const goal = (lz * I.door.side > lv.d / 2 - .8) ? I.doorOut : I.doorIn;
        const gx = goal.x - I.x, gz = goal.z - I.z, tx = gx * I.c - gz * I.s, tz = gx * I.s + gz * I.c;
        const route = u._innerExit || (u._innerExit = { x: 0, z: 0 });
        interiorWaypoint(lv.layout, lx, lz, tx, tz, route);
        q.x = I.x + route.x * I.c + route.z * I.s; q.z = I.z - route.x * I.s + route.z * I.c;
        return q;
      }
      const back = 1 + (u._innerRank || 0) * 0.9, h = p.heading - I.rot;
      tx = Math.max(-lv.w / 2 + 0.6, Math.min(lv.w / 2 - 0.6, px - Math.sin(h) * back));
      tz = Math.max(-lv.d / 2 + 0.6, Math.min(lv.d / 2 - 0.6, pz - Math.cos(h) * back));
      if (I.okuZ != null && (lz - I.okuZ) * (tz - I.okuZ) < 0) {
        tx = lv.w * 0.225;
        tz = I.okuZ + (Math.abs(lx - tx) < 0.6 ? Math.sign(tz - I.okuZ) : Math.sign(lz - I.okuZ)) * 0.9;
      }
    }
    if (!onStair && lv.hallX != null && (lx - lv.hallX) * (tx - lv.hallX) < 0) {
      const end = (lz + tz >= 0 ? 1 : -1) * (lv.d / 2 - 0.85);
      if (Math.abs(lz - end) > 0.3) tx = lx;
      tz = end;
    }
    if (!onStair) { interiorWaypoint(lv.layout, lx, lz, tx, tz, q); tx = q.x; tz = q.z; }
    q.x = I.x + tx * I.c + tz * I.s; q.z = I.z - tx * I.s + tz * I.c;
    return q;
  }
  return want;
}
