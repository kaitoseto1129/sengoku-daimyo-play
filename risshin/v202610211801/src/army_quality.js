// 距離の段は全端末で共通。戦力や人数を減らさず、判断と描画の細かさだけ替える。
export function qualityHero(u) {
  return !!(u.isPlayer || u.name || u.isSub || u.type === 'busho');
}
export function qualityTier(previous, distance) {
  if (previous == null) return distance <= 12 ? 0 : distance <= 35 ? 1 : 2;
  if (distance <= 12) return 0;
  if (distance > 40) return 2;
  if (previous === 0) return distance > 14 ? 1 : 0;
  if (previous === 2) return distance <= 35 ? 1 : 2;
  return 1;
}
function special(u) {
  return qualityHero(u) || u.isStandard || u.stdHeld || u.isStruct || u.type === 'dummy' ||
    u.type === 'porter' || u.invuln || u.mustLive || u.onWound || u.noTarget || u.climb || u.perch ||
    u.naka || u.dragging || u.downed || u.woundOut || u.rearWound || u.escort || u.jinchu || u.loopWall;
}
export function prepareQuality(army, focus, cam, frustum, dt) {
  for (const g of army.groups) { g.qualityFar = true; }
  for (const u of army.units) {
    u.focusD = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
    u.camD = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : u.focusD;
    const distance = Math.min(u.focusD, u.camD);
    u.qualityDistance = distance;
    u.qualityWasOffscreen = u.offscreen;
    u.qualityTier = qualityHero(u) ? 0 : qualityTier(u.qualityTier, distance);
    if (frustum) {
      army.tmpSphere.center.set(u.pos.x, u.pos.y + 1, u.pos.z);
      army.tmpSphere.radius = Math.max(u.mounted ? 6 : 3.4, (u.wpn?.userData.spec?.L || 0) + 1);
      u.offscreen = !frustum.intersectsSphere(army.tmpSphere);
    } else u.offscreen = false;
  }
  for (const u of army.units) {
    const distance = u.qualityDistance;
    // 近接の相手が近景に残る間は、背後の敵も同じ当たり計算で戦う。
    const closeTarget = u.target?.pos && u.target.alive && (qualityHero(u.target) || u.target.qualityTier === 0) &&
      Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 14;
    const wasAbstract = u.qualityAbstract;
    u.qualityAbstract = !!(u.alive && !special(u) && !closeTarget &&
      (u.qualityTier === 2 || u.offscreen && distance > 14));
    if (wasAbstract && !u.qualityAbstract) {
      u.aiT = 0; u.detailNextAt = 0; u.detailSenseAt = 0; u.qualityMoveDt = 0;
      u.vel.x = u.vel.z = 0; u.motionDt = 0; u.motionFrame = 0;
    }
    if (u.alive && u.group && u.qualityTier !== 2) u.group.qualityFar = false;
  }
  // 全員の段を決めてから古い攻撃を外す。相手の段の判定を巡回順に左右させない。
  for (const u of army.units) if (u.qualityAbstract) {
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    u.hit = null; u.contactStopT = 0;
  }
  // 部隊の損耗は毎秒約1.7回。双方の人数を先に集めてから同時に計上する。
  army.qualityDt = (army.qualityDt || 0) + dt;
  if (army.qualityDt < 0.6) return;
  const elapsed = army.qualityDt; army.qualityDt = 0;
  for (const g of army.groups) {
    g.qualityCombat = false;
    const q = g.qualityWork || (g.qualityWork = { n: 0, x: 0, z: 0, y: 0, x0: 0, x1: 0, z0: 0, z1: 0, loss: 0, source: null, members: [] });
    q.n = q.x = q.z = q.y = q.loss = 0; q.source = null; q.members.length = 0;
    q.x0 = q.z0 = Infinity; q.x1 = q.z1 = -Infinity;
    for (const u of g.units) {
      if (!u.alive || !u.qualityAbstract || u.fleeing || g.routed) continue;
      q.members.push(u); q.n++; q.x += u.pos.x; q.z += u.pos.z; q.y += u.pos.y; q.source = u;
      q.x0 = Math.min(q.x0, u.pos.x); q.x1 = Math.max(q.x1, u.pos.x);
      q.z0 = Math.min(q.z0, u.pos.z); q.z1 = Math.max(q.z1, u.pos.z);
    }
    if (q.n) { q.x /= q.n; q.z /= q.n; q.y /= q.n; }
  }
  for (let i = 0; i < army.groups.length; i++) {
    const a = army.groups[i], p = a.qualityWork;
    if (!p.n || a.hidden || a.civ) continue;
    for (let j = i + 1; j < army.groups.length; j++) {
      const b = army.groups[j], q = b.qualityWork;
      if (!q.n || b.team === a.team || b.hidden || b.civ || Math.abs(p.y - q.y) > 1.8) continue;
      const dx = Math.max(0, p.x0 - q.x1, q.x0 - p.x1), dz = Math.max(0, p.z0 - q.z1, q.z0 - p.z1);
      if (dx * dx + dz * dz > 25) continue;
      // 広がった隊同士の囲みだけで接敵扱いにしない。部隊の接点を一つだけ求める。
      let contactA = null, contactB = null, best = 25;
      for (const au of p.members) for (const bu of q.members) {
        if (Math.abs(au.pos.y - bu.pos.y) > 1.8) continue;
        const gap = (au.pos.x - bu.pos.x) ** 2 + (au.pos.z - bu.pos.z) ** 2;
        if (gap <= best) { best = gap; contactA = au; contactB = bu; }
      }
      if (!contactA || army.wallBetween(contactA.pos, -1, contactB.pos)) continue;
      a.qualityCombat = b.qualityCombat = true;
      // 接する前列の数・士気・兵種で押し合いの損耗を決める。個々の振りと当たりは作らない。
      const front = Math.min(p.n, q.n, Math.max(1, Math.sqrt(Math.min(p.n, q.n))));
      p.loss += front * elapsed * 0.09 * (0.5 + b.morale / 100) * (q.source.mounted ? 1.5 : 1);
      q.loss += front * elapsed * 0.09 * (0.5 + a.morale / 100) * (p.source.mounted ? 1.5 : 1);
      p.foe = contactB; q.foe = contactA;
    }
  }
  for (const g of army.groups) {
    const q = g.qualityWork;
    g.qualityLoss = (g.qualityLoss || 0) + q.loss;
    if (!q.loss) continue;
    for (const u of g.units) {
      if (g.qualityLoss < 1) break;
      if (!u.alive || !u.qualityAbstract || u.fleeing || special(u)) continue;
      // 討死の通知と士気は従来の入口へ渡し、任務と人数の集計を一致させる。
      army.kill(u, q.foe);
      if (!u.alive) g.qualityLoss--;
    }
  }
}

export function qualityThink(army, u) {
  if (u.qualityTier !== 1 || special(u) || u.fleeing || u.group.routed || u.mounted) {
    army.think(u); return;
  }
  const g = u.group;
  const decisions = g.qualityDecisions || (g.qualityDecisions = new Map());
  let q = decisions.get(u.type);
  if (!q) { q = { at: 0, target: null, dx: 0, dz: 0, moving: false, slot: { x: 0, z: 0 } }; decisions.set(u.type, q); }
  if (q.at <= army.time || q.order !== g.order || q.signal !== g.signalSerial || q.target && !q.target.alive) {
    // 兵種ごとの代表だけが索敵する。移動先は各自の持ち場へ同じ差分を渡す。
    army.think(u);
    const slot = g.slotPos(u.slot, g.initial, q.slot);
    q.target = u.target; q.moving = !!u.moveTo;
    q.dx = u.moveTo ? u.moveTo.x - slot.x : 0; q.dz = u.moveTo ? u.moveTo.z - slot.z : 0;
    q.at = army.time + 0.2; q.order = g.order; q.signal = g.signalSerial;
    return;
  }
  u.target = q.target; u.watch = null;
  if (q.moving) {
    const point = u.qualityPoint || (u.qualityPoint = { x: 0, z: 0 });
    g.slotPos(u.slot, g.initial, point); point.x += q.dx; point.z += q.dz; u.moveTo = point;
  } else u.moveTo = null;
}
