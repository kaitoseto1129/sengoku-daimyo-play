import { frontlineMelee } from './frontline_density.js';
// 長柄の前列は叩き合い、柄が押し下げられた所だけ刀の侍が踏み込む。
// 時計は当たった時だけ更新し、行き先には兵が持っている入れ物を使う。
export function longYari(u) {
  if (!u || !u.alive || u.mounted || u.isStruct || (u.wpnKind || u.lookWeapon || u.weapon) !== 'spear') return false;
  const length = u.wpn?.userData.spec?.L;
  return length != null ? length >= 4.2 : u.type === 'ashigaru' && u.reach >= 3;
}

export function yariMatch(u, t, time) {
  if (!longYari(u) || !longYari(t) || u.team === t.team || u.fleeing || t.fleeing ||
    u.group?.routed || t.group?.routed || t.confused > 0 || t.stagger > 0 ||
    t.yariOpenUntil > time || u.yariOpenUntil > time || Math.abs(u.pos.y - t.pos.y) > 1.2) return false;
  const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z, d = Math.hypot(dx, dz);
  return d >= 1.5 && d <= Math.min(u.reach, t.reach) + 0.3 &&
    (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d > 0.55 &&
    (-dx * Math.sin(u.heading) - dz * Math.cos(u.heading)) / d > 0.55;
}

export function yariClash(army, u, t, out) {
  if (!yariMatch(u, t, army.time)) return false;
  if (out) out.res = 'block';
  t.guardFlash = 0.3;
  const strength = (o) => (0.6 + 0.4 * o.hp / o.maxHp) * (1 - 0.5 * (o.fat || 0)) *
    (0.65 + 0.35 * Math.max(0, Math.min(100, o.group?.morale ?? 100)) / 100);
  const recovered = Math.max(0, army.time - (t.yariPressureT ?? army.time)) * 0.035;
  t.yariPressure = Math.max(0, (t.yariPressure || 0) - recovered) +
    Math.max(0.2, Math.min(0.5, 0.34 * strength(u) / Math.max(0.2, strength(t))));
  t.yariPressureT = army.time;
  u.fat = Math.min(1, (u.fat || 0) + 0.025);
  t.fat = Math.min(1, (t.fat || 0) + 0.035);
  if (!t.isPlayer && t.push) {
    const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    t.push.x += dx / d * 0.8; t.push.z += dz / d * 0.8;
  }
  if (u.camD < 30 || t.camD < 30) army.play('wood', t.pos, 0.65);
  if (t.yariPressure >= 1) {
    t.yariPressure = 0; t.yariOpenUntil = army.time + 4;
    t.atk = null; t.swing = null; t.guarding = 0;
    t.stagger = Math.max(t.stagger || 0, 0.85);
    t.cd = Math.max(t.cd || 0, 1.1);
    if (t.group && !t.group.noRout) t.group.morale = Math.max(0, t.group.morale - 2);
  }
  return true;
}

export function yariLineThink(army, u, engage) {
  const g = u.group;
  if (g.focus || g.marching || g.isGun || g.cavShare > 0.1 ||
    (g.formation !== 'line' && g.formation !== 'yari') ||
    (g.order !== 'hold' && g.order !== 'yari' && g.order !== 'attack' && g.order !== 'follow')) return false;
  if (frontlineMelee(army, u)) {
    const foe = army.nearestEnemy(u, Math.max(engage, 10), o => !o.isPlayer && !o.fleeing &&
      army.crowdOk(u, o) && !army.wallBetween(u.pos, u.team, o.pos));
    if (foe) { u.target = foe; u.watch = null; u.pressBack = null; return true; }
    return false;
  }
  const h = g._face ?? g.facing, fx = Math.sin(h), fz = Math.cos(h);
  if (longYari(u)) {
    u.pressBack = null;
    // 本人が槍の間合いへ入った時は、前列を支える下知より身を守る。
    // 後列の一歩半だけを見ると、すぐそばの本人を無視して待ち続ける。
    const p = army.playerUnit;
    if (p?.alive && p.team !== u.team && !p.noTarget && !p.invuln && !p.fleeing &&
        Math.abs(p.pos.y - u.pos.y) < 1.8 &&
        Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < Math.min(u.reach, 3.5) &&
        !army.wallBetween(u.pos, u.team, p.pos, true)) {
      u.target = p; u.watch = null; return true;
    }
    // 後列も自分の組も、前の者が打ち合う間は列の後ろで支える。
    if (u.aiRow > 0) {
      const close = army.nearestEnemy(u, 1.6, (o) => !army.wallBetween(u.pos, u.team, o.pos));
      if (close) { u.target = close; u.watch = null; return true; }
      const cols = g.layout(g.initial).cols;
      let front = null;
      for (const o of g.units) if (o.slot === u.slot - cols && o.alive && !o.fleeing) { front = o; break; }
      if (!front || !front.target?.alive || front.target.isStruct) return false;
      const q = u.moralePoint;
      q.x = front.pos.x - fx * 1.6; q.z = front.pos.z - fz * 1.6;
      u.target = null; u.watch = null; u.pressBack = front; u.moveTo = q;
      return true;
    }
    const foe = army.nearestEnemy(u, engage, (o) => {
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      return longYari(o) && !o.fleeing && dx * fx + dz * fz > 0 &&
        Math.abs(dx * fz - dz * fx) < 1.5 && !army.wallBetween(u.pos, u.team, o.pos) && army.crowdOk(u, o);
    });
    if (!foe) return false;
    u.target = foe; u.watch = null; return true;
  }
  if (u.type !== 'samurai' || u.mounted || (u.wpnKind || u.lookWeapon || u.weapon) !== 'sword') return false;
  // 目の前の敵には応戦。明示した狙い・城攻め・退却の下知は上の条件で優先する。
  if (army.nearestEnemy(u, 1.8, (o) => !army.wallBetween(u.pos, u.team, o.pos))) return false;
  let screen = null;
  army.forNear(u.pos.x, u.pos.z, 6, (o) => {
    if (o.team !== u.team || !longYari(o) || o.fleeing || !longYari(o.target)) return;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
    if (dx * dx + dz * dz <= 36 && dx * fx + dz * fz > 0 && Math.abs(dx * fz - dz * fx) < 3 &&
      (!screen || army.distTo(u, o) < army.distTo(u, screen))) screen = o;
  });
  if (!screen) return false;
  const gap = army.nearestEnemy(u, Math.min(engage, 12), (o) => {
    if (!longYari(o) || !(o.yariOpenUntil > army.time || o.fleeing || o.group?.routed) ||
      !army.crowdOk(u, o) || army.wallBetween(u.pos, u.team, o.pos)) return false;
    // 奥の隙を見つけても、手前の元気な槍の列へ突っ込まない。
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    let blocked = false;
    army.forNear(o.pos.x, o.pos.z, 3, (v) => {
      if (v === o || v.team === u.team || !longYari(v) || v.fleeing || v.group?.routed || v.yariOpenUntil > army.time) return;
      const vx = v.pos.x - u.pos.x, vz = v.pos.z - u.pos.z, along = (vx * dx + vz * dz) / d;
      if (along > 0 && along < d - 0.4 && Math.abs(vx * dz - vz * dx) / d < 0.85) blocked = true;
    });
    return !blocked;
  });
  u.watch = null;
  if (gap) { u.target = gap; return true; }
  const q = u.moralePoint;
  q.x = screen.pos.x - fx * 1.8; q.z = screen.pos.z - fz * 1.8;
  u.target = null; u.moveTo = q;
  return true;
}
