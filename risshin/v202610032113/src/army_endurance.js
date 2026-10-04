// 兵の息と前後の交代。兵を増やさず、持ち場だけを交換して歩いて替わる。
export function enduranceTick(army, u, dt) {
  if (u.isPlayer || u.type === 'dummy' || u.farSim) return;
  const t = u.target;
  const fighting = !!(u.atk || u.swing || u.bind || (t && t.alive && !t.isStruct && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 5));
  const moving = Math.hypot(u.mv.x, u.mv.z);
  const running = !u.mounted && moving > u.speed * 1.15;
  // 敵が間近にいる間は、手を止めただけでは休めない。調べるのは一秒に一度。
  if (!(u.restCheckAt > army.time)) {
    u.restCheckAt = army.time + 1;
    u.restThreat = !!army.nearestEnemy(u, 9);
  }
  const rate = fighting ? 1 / 90 : running ? 1 / 120 : u.restThreat ? 0 : moving > 0.5 ? -1 / 180 : -1 / 60;
  u.fat = Math.max(0, Math.min(1, (u.fat || 0) + dt * ((moving > 0.5 && u._terrainTire > 0 ? Math.max(0, rate) : rate) + (moving > 0.5 ? (u._terrainTire || 0) * moving / 600 : 0))));
  if (u.mounted) {
    const galloping = moving > 6.2 || u.charging || u.cv === 'out';
    // 馬の息は短い休みでは戻り切らない。戦闘中や敵が近い間は、さらに回復が遅い。
    u.hfat = Math.max(0, Math.min(1, (u.hfat || 0) + dt * ((galloping ? 1 / 160 : fighting || u.restThreat ? -1 / 900 : -1 / 480) + (moving > 0.5 ? (u._terrainTire || 0) * moving / 750 : 0))));
    u.horseStam = 1 - u.hfat;
  }
}

export function reliefThink(army, u) {
  const g = u.group, now = army.time;
  if (u.reliefUntil > now) {
    if (g.routed || u.fleeing || g.order !== u.reliefOrder) { u.reliefUntil = 0; return false; }
    // 後ろへ歩く途中で追いつかれた時だけ、その場で身を守る。
    const close = army.nearestEnemy(u, 1.8);
    u.target = close || null; u.watch = null;
    if (!close) { u.atk = null; u.moveTo = u.reliefPoint; }
    return true;
  }
  if (u.isPlayer || u.name || u.type === 'busho' || u.mounted || u.stdHeld || u === g.leader || u.fleeing || g.routed ||
      u.noTarget || g.civ || u.climb || u.perch || u.atk || u.swing || u.bind || u.stagger > 0 || u.confused > 0 ||
      u.type === 'gun' || u.type === 'bow' || g.isGun || g.marching || g.cavShare > 0.1 ||
      (g.formation !== 'line' && g.formation !== 'yari') ||
      (g.order !== 'hold' && g.order !== 'attack' && g.order !== 'yari' && g.order !== 'follow') ||
      (u.fat || 0) < 0.55 || g.reliefAt > now || u.reliefAgainAt > now) return false;
  const { cols } = g.layout(g.initial);
  if (u.slot >= cols) return false;
  let next = null, best = Infinity;
  for (const o of g.units) {
    if (o === u || !o.alive || o.isPlayer || o.name || o === g.leader || o.mounted || o.stdHeld || o.fleeing || o.noTarget ||
        o.type === 'gun' || o.type === 'bow' || o.type === 'porter' || o.climb || o.perch || o.woundOut || o.rearWound ||
        o.atk || o.swing || o.bind || o.stagger > 0 || o.confused > 0 || o.reliefUntil > now ||
        o.slot < cols || o.hp < o.maxHp * 0.6 || (o.fat || 0) > 0.3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const score = d + (o.slot % cols === u.slot % cols ? 0 : 6);
    if (d < 12 && score < best) { next = o; best = score; }
  }
  if (!next) return false;
  const slot = u.slot; u.slot = next.slot; next.slot = slot;
  const h = g._face ?? g.facing;
  const q = u.reliefPoint || (u.reliefPoint = { x: 0, z: 0 });
  // 入れ替わる者の横を通って、前線から六歩ほど下がる。
  const side = u.id % 2 ? 1.2 : -1.2;
  q.x = next.pos.x - Math.sin(h) * 3 + Math.cos(h) * side;
  q.z = next.pos.z - Math.cos(h) * 3 - Math.sin(h) * side;
  u.reliefUntil = now + 24; u.reliefAgainAt = now + 45; u.reliefOrder = g.order;
  u.target = null; u.watch = null; u.moveTo = q; next.aiT = 0;
  g.reliefAt = now + 4;
  return true;
}
