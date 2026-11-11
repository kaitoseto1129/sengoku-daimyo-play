import { runnerBlocked } from '../denrei.js';

// 閉じた大手を横切らず、本丸の門と搦手の細道から知らせを届ける。
const POINTS = [
  [-20, -16], [-5, -12], [-5, 6], [-5, 14], [3, 18], [21, 18],
  [21, 36], [21, 43], [33, 44], [41, 47], [48, 51], [55, 55], [58, 58.5],
  [40, 32], [40, -32], [-44, -32],
].map(([x, z]) => ({ x, z }));

function clear(rt, a, b) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (runnerBlocked(rt, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

export function runnerWay(army, u, want) {
  if (!u.group?.isRunner) return want;
  const goal = u.group.dest || want;
  const q = u._nagaRunner || (u._nagaRunner = {
    x: 0, z: 0, at: -1, direct: true, gx: Infinity, gz: Infinity,
    distance: new Float64Array(POINTS.length), first: new Int16Array(POINTS.length),
    used: new Uint8Array(POINTS.length),
  });
  if (q.at > army.time && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 3 &&
      (q.direct || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.direct ? goal : q;
  q.at = army.time + 0.75; q.gx = goal.x; q.gz = goal.z;
  const rt = army._nagaRunnerWorld || (army._nagaRunnerWorld = { army, world: army.world });
  q.direct = clear(rt, u.pos, goal);
  if (q.direct) return goal;
  // 城の道のつながりは一度だけ調べる。破れた塀にも頼らず、開いている口を使う。
  const edges = army._nagaRunnerEdges || (army._nagaRunnerEdges = POINTS.map((a) =>
    POINTS.map((b) => clear(rt, a, b) ? Math.hypot(b.x - a.x, b.z - a.z) : Infinity)));
  const { distance, first, used } = q;
  used.fill(0);
  for (let i = 0; i < POINTS.length; i++) {
    distance[i] = clear(rt, u.pos, POINTS[i]) ? Math.hypot(POINTS[i].x - u.pos.x, POINTS[i].z - u.pos.z) : Infinity;
    first[i] = i;
  }
  let best = Infinity, next = -1;
  for (let n = 0; n < POINTS.length; n++) {
    let at = -1;
    for (let i = 0; i < POINTS.length; i++) if (!used[i] && (at < 0 || distance[i] < distance[at])) at = i;
    if (at < 0 || !Number.isFinite(distance[at])) break;
    used[at] = 1;
    const p = POINTS[at], total = distance[at] + Math.hypot(goal.x - p.x, goal.z - p.z);
    if (total < best && clear(rt, p, goal)) { best = total; next = first[at]; }
    for (let i = 0; i < POINTS.length; i++) if (!used[i] && distance[at] + edges[at][i] < distance[i]) {
      distance[i] = distance[at] + edges[at][i]; first[i] = first[at];
    }
  }
  if (next < 0) { q.at = -1; return want; }
  q.x = POINTS[next].x; q.z = POINTS[next].z;
  return q;
}
