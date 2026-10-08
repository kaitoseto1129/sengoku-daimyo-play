// 近い歩き先を確かめ、山城の追従は既存の道へ回す。
import { groundAt } from './floors.js';
const TURNS = [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57];
const MOUNTAIN_BATTLES = new Set(['shigisan', 'odani', 'inabayama', 'mitsukuri', 'iwamura', 'takato', 'takato_siege', 'tottori', 'iga', 'miki']);
function mountainFoot(W, x, z, y) {
  return W.walkable(x, z, y) && (!W.slopeTan || W.slopeTan(x, z) <= (W.def.climbTan ?? 0.70) || W.onRoad(x, z));
}
export function localClear(army, from, to, mountain = false) {
  if (army.wallBetween(from, -1, to)) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.75));
  const lim = army.world.def.moveLim || 176;
  if (Math.abs(to.x) > lim || Math.abs(to.z) > lim) return false;
  let y = from.y;
  // 押し合いで道の外へ出た者は、登らずに低い側の道へ戻れる。
  let escaping = mountain && !mountainFoot(army.world, from.x, from.z, y);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + dx * i / steps, z = from.z + dz * i / steps;
    const nextY = groundAt(army.world, x, z, y);
    const clear = mountain ? mountainFoot(army.world, x, z, y) : army.world.walkable(x, z, y);
    if (!clear && !(escaping && army.world.walkable(x, z, y) && nextY <= y + 0.02)) return false;
    if (clear) escaping = false;
    y = nextY;
  }
  return true;
}
// 入れ物は呼び手の兵が持つ。壁や深みを越えて輪へ集まらない。
export function localPoint(army, u, out, x, z, frontline = false) {
  out.x = x; out.z = z; out.y = u.pos.y;
  const road = mountainWay(army, u, out, frontline);
  if (road !== out) return road;
  if (localClear(army, u.pos, out)) return out;
  const h = Math.atan2(x - u.pos.x, z - u.pos.z), r = Math.min(4, Math.hypot(x - u.pos.x, z - u.pos.z));
  for (let scale = 1; scale >= 0.25; scale *= 0.5) for (const turn of TURNS) {
    out.x = u.pos.x + Math.sin(h + turn) * r * scale;
    out.z = u.pos.z + Math.cos(h + turn) * r * scale;
    if (localClear(army, u.pos, out)) return out;
  }
  out.x = u.pos.x; out.z = u.pos.z;
  return out;
}

// 山城の追従は、近い避け足だけでは九十九折りの内側へ戻り続ける。
// 描いた道の交差をつなぎ、閉じた門・切岸を越えない道だけを使う。
function mountainNet(army) {
  const nodes = [], segments = [];
  for (const path of army.world.def.paths) {
    const pts = path.pts || path;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      segments.push({ x: a[0], z: a[1], dx: b[0] - a[0], dz: b[1] - a[1], cuts: [0, 1] });
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-8) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = (dx * b.dz - dz * b.dx) / den, s = (dx * a.dz - dz * a.dx) / den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) { a.cuts.push(t); b.cuts.push(s); }
  }
  const point = (x, z) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 0.05) return i;
    nodes.push({ x, z, y: army.world.heightAt(x, z), links: [] });
    return nodes.length - 1;
  };
  for (const s of segments) {
    s.cuts.sort((a, b) => a - b);
    let prev = point(s.x, s.z);
    for (let i = 1; i < s.cuts.length; i++) {
      const lo = s.cuts[i - 1], hi = s.cuts[i], n = Math.ceil(Math.hypot(s.dx, s.dz) * (hi - lo) / 3);
      for (let k = 1; k <= n; k++) {
        const t = lo + (hi - lo) * k / n, next = point(s.x + s.dx * t, s.z + s.dz * t);
        if (next !== prev) {
          const e = { a: prev, b: next, d: Math.hypot(nodes[next].x - nodes[prev].x, nodes[next].z - nodes[prev].z), at: -1, clear: false };
          nodes[prev].links.push(e); nodes[next].links.push(e);
        }
        prev = next;
      }
    }
  }
  const n = nodes.length;
  return { nodes, dist: new Float64Array(n), prev: new Int32Array(n), queued: new Uint8Array(n), queue: new Int32Array(n + 1) };
}

// 行軍中の兵は既に持っている道順を使う。全員に道網の探索を繰り返させない。
function columnWay(army, u, want) {
  const q = u._columnWay || (u._columnWay = { x: 0, z: 0, at: -1, gx: Infinity, gz: Infinity });
  if (q.at > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 2) return q;
  q.at = army.time + 0.5; q.gx = want.x; q.gz = want.z;
  q.x = want.x; q.z = want.z;
  if (localClear(army, u.pos, want, true)) return q;
  const g = u.group, path = g.path;
  let from = 1, to = 1, near = Infinity, goal = Infinity, px = u.pos.x, pz = u.pos.z, gx = want.x, gz = want.z;
  for (let i = 1; i <= Math.min(g.pathIdx, path.length - 1); i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], d2 = dx * dx + dz * dz;
    if (d2 < 0.01) continue;
    const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / d2));
    const x = a[0] + dx * t, z = a[1] + dz * t;
    const d = Math.hypot(u.pos.x - x, u.pos.z - z) + Math.abs(u.pos.y - army.world.heightAt(x, z));
    if (d < near) { near = d; from = i; px = x; pz = z; }
    const s = Math.max(0, Math.min(1, ((want.x - a[0]) * dx + (want.z - a[1]) * dz) / d2));
    const wx = a[0] + dx * s, wz = a[1] + dz * s, wd = Math.hypot(want.x - wx, want.z - wz);
    if (wd < goal) { goal = wd; to = i; gx = wx; gz = wz; }
  }
  if (Math.hypot(u.pos.x - px, u.pos.z - pz) > 1.5) { q.x = px; q.z = pz; }
  else if (from !== to) { const p = path[from < to ? from : from - 1]; q.x = p[0]; q.z = p[1]; }
  else { q.x = gx; q.z = gz; }
  return q;
}
export function mountainWay(army, u, want, frontline = false) {
  const W = army.world, g = u.group;
  const front = frontline || u.frontlineStep?.gap && u.frontlineStep.until > army.time;
  if (want && !u.isPlayer && !u.target && !u.fleeing && W.def.battleKey === 'shigisan' && g?.team === 0 && g.roadColumn && g.order === 'path' && g.path?.length > 1) return columnWay(army, u, want);
  // 寄せる小勢も既存の道を使う。門や崖の向こうへ直進させない。
  if (!want || want === u._mountainWant || u.isPlayer || u.naka || u.climb || u.fleeing || u.target && !front ||
      !front && (!g?.isPlayerSquad || (g.order !== 'follow' && g.order !== 'attack') ||
      (!MOUNTAIN_BATTLES.has(W.def.battleKey) && !W.noClimb && W.def.climbTan == null)) || !W.def.paths?.length) return want;
  const q = u._mountainWant || (u._mountainWant = { x: 0, z: 0, y: 0, path: [], idx: 0, at: -1, gx: Infinity, gz: Infinity });
  // 陣形の端が崖に入った時は、組頭のいる足場へ寄る。登れる傾きは緩めない。
  const goal = !front && !mountainFoot(W, want.x, want.z, u.pos.y) ? g.isPlayerSquad && army.playerUnit?.alive ? army.playerUnit.pos : g.anchor : want;
  if (q.at <= army.time || Math.hypot(goal.x - q.gx, goal.z - q.gz) > 4) {
    q.at = army.time + (front ? 2 : 0.7) + (u.id % 7) * 0.04; q.gx = goal.x; q.gz = goal.z;
    q.path.length = 0; q.idx = 0; q.direct = false;
    if (localClear(army, u.pos, goal, true)) {
      if (goal === want) return want;
      q.x = goal.x; q.z = goal.z; q.y = u.pos.y;
      q.direct = true; return q;
    }
    q.direct = false;
    const net = army._mountainNet || (army._mountainNet = mountainNet(army));
    const { nodes, dist, prev, queued, queue } = net;
    dist.fill(Infinity); prev.fill(-1); queued.fill(0);
    let head = 0, tail = 0;
    // 合流点は自分から歩いて届く道だけ。近くの別の折れへ飛び移らない。
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i], d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
      if (d > 12 || !localClear(army, u.pos, p, true)) continue;
      dist[i] = d; queue[tail] = i; tail = (tail + 1) % queue.length; queued[i] = 1;
    }
    while (head !== tail) {
      const i = queue[head]; head = (head + 1) % queue.length; queued[i] = 0;
      for (const e of nodes[i].links) {
        const j = e.a === i ? e.b : e.a, d = dist[i] + e.d;
        if (d >= dist[j]) continue;
        if (e.at <= army.time) { e.at = army.time + 0.5; e.clear = localClear(army, nodes[e.a], nodes[e.b], true); }
        if (!e.clear) continue;
        dist[j] = d; prev[j] = i;
        if (!queued[j]) { queue[tail] = j; tail = (tail + 1) % queue.length; queued[j] = 1; }
      }
    }
    let end = -1, best = Infinity;
    const gy = W.heightAt(goal.x, goal.z);
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i], d = Math.hypot(p.x - goal.x, p.z - goal.z);
      if (!Number.isFinite(dist[i]) || d > 24) continue;
      // 崖上の持ち場も、同じ高さの近い道へ収める。近い別の曲輪を選ばない。
      const score = d + Math.abs(p.y - gy) * 2 + dist[i] * 0.002;
      if (score < best) { best = score; end = i; }
    }
    for (let i = end; i >= 0; i = prev[i]) q.path.push(i);
    q.path.reverse();
  }
  if (q.direct) { q.x = goal.x; q.z = goal.z; return q; }
  if (!q.path.length) {
    if (!front) return want;
    q.x = u.pos.x; q.z = u.pos.z; q.y = u.pos.y;
    return q;
  }
  const nodes = army._mountainNet.nodes;
  while (q.idx < q.path.length - 1 && Math.hypot(nodes[q.path[q.idx]].x - u.pos.x, nodes[q.path[q.idx]].z - u.pos.z) < 1.2 &&
    localClear(army, u.pos, nodes[q.path[q.idx + 1]], true)) q.idx++;
  const p = nodes[q.path[q.idx]];
  q.x = p.x; q.z = p.z; q.y = u.pos.y;
  if (q.idx === q.path.length - 1 && localClear(army, u.pos, goal, true)) { q.x = goal.x; q.z = goal.z; }
  return q;
}

// 出す時と、歩けない場所に残った時だけ、同じ側の近い足場へ戻す。
export function recoverGround(army, u, relocate = true) {
  if (u.isPlayer || u.climb || u.perch || u.naka || army.world.walkable(u.pos.x, u.pos.z, u.pos.y)) return false;
  const q = u._groundRecovery || (u._groundRecovery = { x: 0, z: 0 });
  const lim = (army.world.def.moveLim || 176) - 0.3;
  for (let r = 0.5; r <= 8; r += 0.5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8; q.x = u.pos.x + Math.sin(a) * r; q.z = u.pos.z + Math.cos(a) * r;
    if (Math.abs(q.x) > lim || Math.abs(q.z) > lim || !army.world.walkable(q.x, q.z, u.pos.y) || army.wallBetween(u.pos, -1, q)) continue;
    // 出現時だけ置き直す。遊んでいる兵は見つけた足場へ歩いて戻る。
    if (!relocate) return q;
    u.pos.x = q.x; u.pos.z = q.z; u.mv.x = u.mv.z = u.push.x = u.push.z = 0; return true;
  }
  return false;
}
