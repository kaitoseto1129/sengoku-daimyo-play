// 時刻で勝たせず、既存の兵を寄せる。調べるのは五秒に一度だけ。
const ready = (u) => u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.campProtected;
export function pressureTick(rt, stage, enemies, friends, hint) {
  const F = rt.flags, p = rt.player.u;
  if (F.ending || rt.over || !p.alive) return;
  F.pressureAt = rt.t + 5;
  if (F.pressureStage !== stage) {
    F.pressureStage = stage; F.pressureSince = rt.t; F.pressureSayAt = rt.t + 45;
  }
  if (rt.t - F.pressureSince < 45) return;
  for (const g of enemies) {
    if (!g || g.routed || g.hidden || g.ambush || g.stay || g.civ || g.guard ||
        g.ttRetreat || g.iwWithdraw || g.retreatOnly || g.order === 'retreat' || g.order === 'flee') continue;
    // 坂と木戸の道順は残す。先頭の到着を確かめて列を進める。
    deployFront(rt, g, p, false);
    if (g.order === 'path' || g.order === 'move') continue;
    let front = null, distance = 60;
    for (const u of g.units) if (ready(u) && !u.isTaisho && u.type !== 'gun' && u.type !== 'bow') {
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      if (d < distance && !rt.army.wallBetween(u.pos, -1, p.pos) &&
          !rt.army.terrainBlocks(u.pos, p.pos)) { distance = d; front = u; }
    }
    if (!front && g.focus === p) g.focus = null;
    if (front) {
      g.order = 'attack'; g.focus = p; g.march = false; g.seekRange = Math.max(g.seekRange || 0, 60);
    }
  }
  // 味方の後列待ちだけを助ける。本人が離れている間は助けない。
  for (const g of friends) if (g && !g.routed && !g.isPlayerSquad) deployFront(rt, g, p, true);
  if (rt.t >= F.pressureSayAt) {
    F.pressureSayAt = rt.t + 30;
    rt.say('組頭', hint, 4);
    rt.objProgress('main', hint);
  }
}
function deployFront(rt, g, p, help) {
  if (g.order !== 'path' && g.order !== 'move' || !g.onArrive) return;
  if (g.order === 'path' && !g.path?.length) return;
  const pathIndex = g.order === 'path' ? Math.min(g.pathIdx, g.path.length - 1) : -1;
  const end = pathIndex >= 0 ? g.path[pathIndex] : null;
  const point = end ? { x: end[0], z: end[1] } : g.dest;
  if (!point) return;
  const goal = { x: point.x, y: rt.world.heightAt(point.x, point.z), z: point.z };
  if (help && (Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) > 24 ||
      rt.army.wallBetween(p.pos, -1, goal) || rt.army.terrainBlocks(p.pos, goal))) { g.pressureWait = 0; return; }
  let x = 0, z = 0, n = 0, arrived = false;
  for (const u of g.units) if (ready(u) || g.arriveNoncombat && u.alive && !u.fleeing && !u.woundOut && !u.gone) {
    x += u.pos.x; z += u.pos.z; n++;
    if (Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z) < 6) arrived = true;
  }
  if (!n) return;
  x /= n; z /= n;
  const stopped = g.pressureOrder === g.order && g.pressureGoalX === goal.x && g.pressureGoalZ === goal.z &&
    Math.hypot(x - g.pressureX, z - g.pressureZ) < 1;
  g.pressureWait = stopped ? (g.pressureWait || 0) + 5 : 0;
  g.pressureOrder = g.order; g.pressureGoalX = goal.x; g.pressureGoalZ = goal.z;
  g.pressureX = x; g.pressureZ = z;
  if (arrived && g.pressureWait >= 30) {
    // 曲がり角で後列待ちになったら、一つ先の道順へ。壁をまたぐ近道は作らない。
    if (g.order === 'path' && pathIndex < g.path.length - 1) {
      const next = g.path[pathIndex + 1];
      const to = { x: next[0], y: rt.world.heightAt(next[0], next[1]), z: next[1] };
      if (Math.hypot(g.anchor.x - goal.x, g.anchor.z - goal.z) < 3 &&
          !rt.army.wallBetween(g.anchor, -1, to) && !rt.army.terrainBlocks(goal, to)) {
        g.pathIdx++; g.pressureWait = 0;
      }
      return;
    }
    const deploy = g.onArrive; g.onArrive = null; deploy(g);
    g.pressureWait = 0;
  }
}
