// 武将の強さと近習。兵は増やさず、既存の侍・馬廻を使う。
export function officerBroken(u) {
  const g = u.group;
  if (!g) return true;
  let n = 0;
  for (const v of g.units) if (v !== u && v.alive && !v.fleeing && !v.woundOut) n++;
  return g.routed || n <= Math.floor(Math.max(0, g.initial - 1) * 0.25);
}

export function officerSetup(u) {
  if (u.isOfficer || u.isPlayer || u.isSub || u.isTomo || u.type === 'dummy' || !(u.type === 'busho' || (u.name && u.isLord))) return;
  u.isOfficer = true;
  u.maxHp *= 2.4; u.hp = u.maxHp;
  u.dmg *= 1.5;
  u.officerPoint = { x: u.pos.x, z: u.pos.z };
}

export function officerEscort(g) {
  if (g.isPlayerSquad) return;
  for (const chief of g.units) {
    if (!chief.isOfficer || !chief.alive) continue;
    let n = 0;
    for (const v of g.units) {
      if (v.officerGuard === chief) { n++; continue; }
      if (n >= 3 || !v.alive || v.name || v.officerGuard || v.type === 'gun' || v.type === 'bow' || v.type === 'porter' || v.type === 'dummy') continue;
      v.officerGuard = chief; v.officerGuardSlot = n++;
    }
  }
}

// 判断の間だけ呼ぶ。行き先の入れ物は作成時の物を使い回す。
export function officerThink(army, u, g) {
  if (g.isPlayerSquad || g.order === 'retreat' || g.routed || u.fleeing || u.woundOut || u.keep) return false;
  // 行軍では主将も近習も下知された持ち場を追う。
  // 隊の重心へ下がる判断を続けると、主将と近習が互いを待ち、列から取り残される。
  if ((g.order === 'path' || g.order === 'move') && (u.isOfficer || u.officerGuard || u.isStandard)) {
    const enemy = u.isStandard ? null : army.nearestEnemy(u, 1.8, (v) => !v.fleeing);
    u.target = enemy; u.watch = null;
    if (!enemy) {
      const slot = g.slotPos(u.slot, g.initial), p = u.officerPoint || u.moralePoint;
      p.x = slot.x; p.z = slot.z;
      u.atk = null; u.moveTo = p;
    }
    return true;
  }
  const chief = u.officerGuard;
  if (chief && chief.alive && chief.group === g && !chief.fleeing && !officerBroken(chief)) {
    const enemy = u.isStandard ? null : army.nearestEnemy(u, 5, (v) => !v.fleeing && Math.hypot(v.pos.x - chief.pos.x, v.pos.z - chief.pos.z) < 7);
    u.target = enemy; u.watch = null;
    if (!enemy) {
      const f = g.forward(), p = u.moralePoint, side = u.officerGuardSlot - 1;
      const ahead = u.isStandard ? -2.5 : 2.5;
      p.x = chief.pos.x + f.x * ahead + f.z * side * 1.8;
      p.z = chief.pos.z + f.z * ahead - f.x * side * 1.8;
      u.moveTo = p;
    }
    return true;
  }
  // 馬印持ちは、主将が倒れても竿を武器にして斬り合わない。崩れた時の退却は通常の仕組みに任せる。
  if (u.isStandard) { u.target = null; u.watch = null; u.moveTo = null; return true; }
  if (!u.isOfficer || officerBroken(u) || u.isTaisho) return false;
  const enemy = army.nearestEnemy(u, 2.3, (v) => !v.fleeing);
  u.watch = null; u.target = enemy;
  if (enemy && !(u.officerBackUntil > army.time) && u.hp > u.maxHp * 0.45) return true;
  const f = g.forward(), c = g.center(), p = u.officerPoint;
  const back = u.hp < u.maxHp * 0.45 || u.officerBackUntil > army.time ? 12 : 7;
  p.x = c.x - f.x * back; p.z = c.z - f.z * back;
  u.target = null; u.moveTo = p;
  if (!(u.cheerT > army.time)) { u.cheerT = army.time + 6; u.cheer = 1; }
  return true;
}
