import { localPoint } from './army_local_way.js';
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
  const terrainLoad = moving > 0.5 ? (u._terrainTire || 0) : 0;
  const rate = fighting ? 1 / 90 : running ? 1 / 60 : u.restThreat ? 0 : moving > 0.5 ? -1 / 180 : -1 / 60;
  // 坂でも歩きは休息になる。全力走と斬り合いにだけ地面の負担を加える。
  u.fat = Math.max(0, Math.min(1, (u.fat || 0) + dt * (rate > 0 ? rate * (1 + terrainLoad * 0.6) : rate / (1 + terrainLoad))));
  if (u.mounted) {
    const galloping = moving > 0.5 && (moving > 6.2 || u.charging || u.cv === 'out');
    // 馬の息は短い休みでは戻り切らない。戦闘中や敵が近い間は、さらに回復が遅い。
    const horseRate = galloping ? (1 + terrainLoad * 0.6) / 360 : moving > 2.5 ? -1 / 300 : moving > 0.5 ? -1 / 150 : -1 / 90;
    u.hfat = Math.max(0, Math.min(1, (u.hfat || 0) + dt * (horseRate < 0 && (fighting || u.restThreat) ? horseRate * 0.5 : horseRate)));
    u.horseStam = 1 - u.hfat;
  }
}

export function reliefThink(army, u) {
  const g = u.group, now = army.time;
  if (u.reliefUntil > now) {
    if (g.routed || u.fleeing || u.woundOut || u.rearWound || u.climb || u.perch || g.order !== u.reliefOrder) {
      u.reliefUntil = 0; if (u.moveTo === u.reliefPoint) u.moveTo = null; return false;
    }
    // 後ろへ歩く途中で追いつかれた時だけ、その場で身を守る。
    const close = army.nearestEnemy(u, 1.8, (o) => !army.wallBetween(u.pos, -1, o.pos));
    u.target = close || null; u.watch = null;
    if (!close) {
      const h = g._face ?? g.facing, c = Math.cos(h), s = Math.sin(h);
      localPoint(army, u, u.reliefPoint, g.anchor.x + c * u.reliefX + s * u.reliefZ, g.anchor.z - s * u.reliefX + c * u.reliefZ);
      u.atk = null; u.moveTo = u.reliefPoint;
    }
    return true;
  }
  if (u.isPlayer || u.name || u.type === 'busho' || u.mounted || u.stdHeld || u === g.leader || u.fleeing || g.routed ||
      u.noTarget || u.dropped || u.downed || u.pinT > now || u.dragging || u.cover || u.escort || u.woundOut || u.rearWound || u.type === 'porter' || g.civ || u.climb || u.perch || u.atk || u.swing || u.bind || u.stagger > 0 || u.confused > 0 ||
      u.type === 'gun' || u.type === 'bow' || g.isGun || g.marching || g.cavShare > 0.1 ||
      (g.formation !== 'line' && g.formation !== 'yari') ||
      (g.order !== 'hold' && g.order !== 'attack' && g.order !== 'yari' && g.order !== 'follow') ||
      (u.fat || 0) < 0.55 || g.reliefAt > now || u.reliefAgainAt > now) return false;
  const { cols } = g.layout(g.initial);
  if (u.slot >= cols) return false;
  let next = null, best = Infinity;
  for (const o of g.units) {
    if (o === u || !o.alive || o.isPlayer || o.name || o === g.leader || o.mounted || o.stdHeld || o.fleeing || o.noTarget ||
        o.dropped || o.downed || o.pinT > now || o.dragging || o.cover || o.escort || o.type === 'gun' || o.type === 'bow' || o.type === 'porter' || o.climb || o.perch || o.woundOut || o.rearWound ||
        o.atk || o.swing || o.bind || o.stagger > 0 || o.confused > 0 || o.reliefUntil > now ||
        o.slot < cols || o.hp < o.maxHp * 0.6 || (o.fat || 0) > 0.3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const score = d + (o.slot % cols === u.slot % cols ? 0 : 6);
    if (d < 12 && Math.abs(o.pos.y - u.pos.y) < 1.8 && !army.wallBetween(u.pos, -1, o.pos) && score < best) { next = o; best = score; }
  }
  if (!next) return false;
  const slot = u.slot; u.slot = next.slot; next.slot = slot;
  reliefRows(g, u, next);
  const h = g._face ?? g.facing;
  const q = u.reliefPoint || (u.reliefPoint = { x: 0, z: 0 });
  // 入れ替わる者の横を通って、前線から六歩ほど下がる。
  const side = u.id % 2 ? 1.2 : -1.2;
  q.x = next.pos.x - Math.sin(h) * 3 + Math.cos(h) * side;
  q.z = next.pos.z - Math.cos(h) * 3 - Math.sin(h) * side;
  const dx = q.x - g.anchor.x, dz = q.z - g.anchor.z;
  u.reliefX = Math.cos(h) * dx - Math.sin(h) * dz;
  u.reliefZ = Math.sin(h) * dx + Math.cos(h) * dz;
  localPoint(army, u, q, q.x, q.z);
  u.reliefUntil = now + 24; u.reliefAgainAt = now + 45; u.reliefOrder = g.order;
  u.target = null; u.watch = null; u.moveTo = q; next.aiT = 0;
  g.reliefAt = now + 4;
  return true;
}

// 持ち場を交換した瞬間に、前後の段もそろえる。
export function reliefRows(g, u, next) {
  const cols = g.layout(g.initial).cols;
  for (const o of [u, next]) {
    o.aiRow = !g.marching && (g.formation === 'line' || g.formation === 'yari') ? Math.floor(o.slot / cols) : 0;
    o.row = g.formation === 'yari' ? o.aiRow : 0;
    o.pressBack = null; o.aiT = 0;
  }
}
