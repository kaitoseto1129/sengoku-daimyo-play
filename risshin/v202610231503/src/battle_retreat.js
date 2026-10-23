// 決着の後も退き口では命を失う。既にいる兵だけで追撃と殿を動かす。
const fighter = (u) => u.alive && !u.noTarget && !u.civ && u.type !== 'dummy' && u.type !== 'porter';
const fightingGroup = (g) => !g.civ && !g.people && !g.isRunner && g.units.some(fighter);

export function retreatStart(rt, battleId) {
  // 退き口を果たした手柄は、合戦そのものの勝利ではない。
  const retreatBattle = battleId === 'kanegasaki' || battleId === 'mikatagahara' || battleId === 'honnoji';
  const army = rt.army, losing = retreatBattle ? 0 : rt.tracker.main ? 1 : 0;
  army.withdrawal = true;
  let guard = null, best = Infinity;
  // 崩れていない、武器を持つ隊が敵に近い所で殿になる。兵や体力は足さない。
  for (const g of army.groups) {
    if (g.team !== losing || !fightingGroup(g) || g.routed || g.morale < 45) continue;
    const c = g.center();
    let armed = 0;
    for (const u of g.units) if (fighter(u) && !u.isPlayer && !u.fleeing && !u.dropped && !u.woundOut && u.wpn && u.wpn.parent) armed++;
    if (armed < 3) continue;
    const enemy = army.nearestEnemy({ pos: c, team: g.team }, 55);
    if (!enemy) continue;
    const d = Math.hypot(enemy.pos.x - c.x, enemy.pos.z - c.z);
    if (d < best) { best = d; guard = g; }
  }
  for (const g of army.groups) {
    if (!fightingGroup(g)) continue;
    g.pending = null; g.focus = null; g.victory = false;
    g.path = null; g.dest = null; g.assault = null; g.marching = false;
    // 決着済みの任務から兵を補充したり、再び集めたりしない。
    g.recyclable = false; g.noRally = true;
    if (g.team !== losing) {
      if (!g.routed) {
        if (g.team === 0 && rt.def.holdLine) {
          const c = g.center();
          g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = c.z;
        } else { g.pursuing = true; g.order = 'attack'; }
      }
    } else {
      g.noRout = false;
      if (g === guard) {
        const c = g.center();
        if (!g.fleeSet) {
          const enemy = army.nearestEnemy({ pos: c, team: g.team }, 55);
          let dx = enemy ? c.x - enemy.pos.x : -Math.sin(g.facing);
          let dz = enemy ? c.z - enemy.pos.z : -Math.cos(g.facing);
          let d = Math.hypot(dx, dz);
          if (d < 0.5) { dx = -Math.sin(g.facing); dz = -Math.cos(g.facing); d = 1; }
          g.fleeDir.x = dx / d; g.fleeDir.z = dz / d;
        }
        g.anchor.x = c.x; g.anchor.z = c.z;
        g.facing = Math.atan2(-g.fleeDir.x, -g.fleeDir.z);
        g.order = 'hold'; g.aggro = Math.min(g.aggro, 8);
      } else if (!g.routed) {
        const path = rt.def.withdrawRoute?.(rt, g);
        if (path?.length) {
          g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2;
          g.aggro = 6; g.seekRange = 12; g.onArrive = (q) => { q.order = 'hold'; };
        } else g.morale = Math.min(g.morale, 15);
      }
    }
    for (const u of g.units) if (u.alive && !u.isPlayer) u.aiT = 0;
  }
  rt.withdrawal = { losing, guard, elapsed: 0, scan: 0,
    sound: { heat: 0.2, calm: false, rain: false, hurt: false, march: 0.5,
      night: rt.world.timeKey === 'dusk' || rt.world.timeKey === 'night', flap: 0, pant: 0 } };
  rt.endT = 32;
  rt.tracker.finalized = false;
  rt.player.lock = null; rt.player.cine = null;
  // 足軽本人には決着後の無敵を付けない。史実の武将の保護はそのまま。
  if (!rt.G.lord) rt.player.u.invuln = false;
  // 勝敗が決まっても、飛んでいる矢や振り出した刃は消えない。
  rt.timers.length = 0;
  rt.bark(losing === 1 ? '敵が逃げる。殿の槍に気をつけよ' : '味方が崩れた。殿の後ろへ退け', true);
}

export function retreatTick(rt, dt) {
  const r = rt.withdrawal;
  r.elapsed += dt;
  rt.def.withdrawTick?.(rt, dt);
  if ((r.scan -= dt) > 0) return;
  r.scan = 0.5;
  const g = r.guard;
  if (g && (g.routed || !g.count)) r.guard = null;
  if (g && !g.routed && g.count) {
    const c = g.center();
    let exposed = false;
    for (const u of rt.army.units) {
      if (!fighter(u) || u.team !== r.losing || u.group === g) continue;
      // 殿の近くに取り残された味方がいれば、もう少し踏みとどまる。
      if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 22) { exposed = true; break; }
    }
    if (r.elapsed >= 12 && (!exposed || r.elapsed >= 22)) {
      // 殿も永久には残らない。士気が残る者は武器を保って退く。
      const path = rt.def.withdrawRoute?.(rt, g);
      g.order = path?.length ? 'path' : 'retreat';
      if (path?.length) { g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.onArrive = (q) => { q.order = 'hold'; }; }
      const lim = rt.world.def.moveLim || 176;
      g.anchor.x = path?.length ? c.x : Math.max(-lim, Math.min(lim, c.x + g.fleeDir.x * 45));
      g.anchor.z = path?.length ? c.z : Math.max(-lim, Math.min(lim, c.z + g.fleeDir.z * 45));
      g.facing = Math.atan2(-g.fleeDir.x, -g.fleeDir.z);
      for (const u of g.units) if (u.alive && !u.isPlayer) { u.target = null; u.atk = null; u.aiT = 0; }
      r.guard = null;
      rt.bark('殿も退く。追手に背を取られるな', true);
    }
  }
  // 近くの敵が離れてから戦の場面を閉じる。深追いを延々と続けない。
  if (r.elapsed >= 18 && !r.guard && !rt.army.nearestEnemy(rt.player.u, 28)) rt.endT = Math.min(rt.endT, 2);
}
