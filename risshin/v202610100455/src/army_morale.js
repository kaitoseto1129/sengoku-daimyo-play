import { localClear, localPoint } from './army_local_way.js';
// 身分にかかわらず、前で敵と打ち合う姿を見た近い味方が踏みとどまる。
// 四秒に一度だけ。死傷の上限・敗走・退く下知は取り消さない。
export function moralePlayerFight(army, p, t) {
  const now = army.time;
  if (!p.alive || p.fleeing || p.woundOut || p.downed || p.pinT > now || p.group?.routed ||
      p.playerFightAt > now || t.team === p.team || t.isStruct || t.type === 'dummy' || t.fleeing || t.woundOut ||
      Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) > 6) return;
  p.playerFightAt = now + 4;
  for (const g of army.groups) {
    if (g.team !== p.team || g.civ || g.routed || g.morale < 22 || g.order === 'retreat' || g.order === 'flee') continue;
    let seen = false;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.downed || u.pinT > now ||
          Math.abs(u.pos.y - p.pos.y) > 3 || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 14 ||
          !localClear(army, p.pos, u.pos)) continue;
      seen = true;
      u.fright = Math.max(0, (u.fright || 0) - 3);
    }
    if (seen && g.morale < 75) g.morale = Math.min(75, g.morale + 2);
  }
}

// 兵一人の気持ち。近くの様子は間引いて調べ、行き先の入れ物は使い回す。
export function moraleState(u) {
  const m = (u.group ? u.group.morale : 100) - (u.fright || 0);
  u.moraleState = u.fleeing ? '敗走' : u.woundOut || u.hp < u.maxHp * 0.35 ? '負傷'
    : u.confused > 0 ? '混乱' : m < 45 || u.backUntil > (u.group?._t ?? 0) ? '恐怖'
    : m >= 75 && u.id % 4 === 0 ? '勇敢' : '普通';
  return m;
}

// 周りを見る関数と結果の入れ物を、兵ごとに作り直さない。
function senseNearby(o, sense) {
  const u = sense.u;
  if (o === u || !o.alive || o.isStruct || o.type === 'dummy' || o.farSim || Math.abs(o.pos.y - u.pos.y) > 3) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
  if (o.team !== u.team && sense.army.wallBetween(u.pos, -1, o.pos)) return;
  if (d2 < 36 && !o.fleeing && !o.woundOut && !o.rearWound && !o.dropped && !o.downed && !(o.pinT > sense.army.time)) { if (o.team === u.team) sense.friends++; else sense.foes++; }
  if (o.team === u.team) {
    // 下知による退きや手傷による退きは、恐慌の連鎖に数えない。
    if (o.fleeing && !o.woundOut && o.group && (o.group.routed || o.moraleFleeDir) && d2 < 36) { sense.runners++; sense.runner = o; }
  } else if (!u.mounted && o.mounted && !o.fleeing && !o.woundOut && !o.downed && !(o.pinT > sense.army.time) && !(o.stagger > 0.3) && d2 < sense.horseD && o.mv && o.mv.x * o.mv.x + o.mv.z * o.mv.z > 9 && dx * o.mv.x + dz * o.mv.z < -2) {
    sense.horse = o; sense.horseD = d2;
  }
}

export function moraleThink(army, u) {
  const g = u.group, now = army.time;
  if (!g || u.isPlayer || u.type === 'dummy' || u.farSim) return;
  // 号令などで立ち直った者は、個人の逃げる向きも忘れる。
  if (!u.fleeing && u.moraleFleeDir) { u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; }
  if (u.fleeing || u.noTarget || u.downed || u.pinT > now || u.rearWound || g.civ || u.type === 'porter' || u.climb || u.perch || u.woundOut || u.cover || u.escort || u.duelW || army.duel && u === army.duel.foe) { moraleState(u); return; }
  if (u.senseAt > now) return;
  u.senseAt = now + 0.6 + (u.id % 5) * 0.08;
  commanderAdvance(army, u);
  const sense = army.moraleSense;
  sense.army = army; sense.u = u; sense.horse = sense.runner = null; sense.horseD = 100; sense.runners = 0; sense.friends = sense.foes = 0;
  army.forNear(u.pos.x, u.pos.z, 9, senseNearby, sense);
  const horse = sense.horse, runner = sense.runner, runners = sense.runners;
  sense.u = sense.horse = sense.runner = null;
  const brace = !u.dropped && !u.downed && !(u.pinT > now) && !(u.stagger > 0.3) && !u.woundOut && (u.wpnKind || u.lookWeapon) === 'spear' && g.formation === 'yari' && (g.order === 'yari' || g.order === 'hold') && g.morale >= 45;
  if (horse && !brace && !(u.horseFearAt > now)) {
    u.horseFearAt = now + 6;
    u.fright = Math.min(45, u.fright + 12);
    const dx = u.pos.x - horse.pos.x, dz = u.pos.z - horse.pos.z, len = Math.hypot(dx, dz) || 1;
    u.moralePoint.x = u.pos.x + dx / len * 2.8;
    u.moralePoint.z = u.pos.z + dz / len * 2.8;
    u.backFace = Math.atan2(-dx, -dz); u.backUntil = now + 0.85;
    u.atk = null;
  }
  if (runners && g.morale < 55 && !(u.routFearAt > now)) {
    u.routFearAt = now + 6;
    u.fright = Math.min(45, u.fright + Math.min(16, runners * 7));
  }
  // 近くの味方が倒れ、敵に囲まれるほど恐怖が続く。敵一人だけでは包囲と数えない。
  if (sense.foes >= 3 && sense.foes > sense.friends + 1) {
    u.fright = Math.min(45, u.fright + 2 + Math.min(4, sense.foes - sense.friends));
  }
  u.fearSafe = sense.foes === 0 && !horse && !u.atk && !u.swing;
  const m = moraleState(u);
  // 個人の逃亡は弱った無名の兵から。筋書きの不退転・武将・備の頭を守る。
  if (!g.noRout && !g.routed && !u.invuln && !u.name && u.type !== 'busho' && !u.isTaisho && u !== g.leader && m < 22 && (runners || horse || sense.foes >= 3 || g.morale < 30)) {
    const f = runner && (runner.moraleFleeDir || runner.group.fleeDir);
    u.moraleDir.x = f ? f.x : -Math.sin(g.facing);
    u.moraleDir.z = f ? f.z : -Math.cos(g.facing);
    const q = localPoint(army, u, u.moralePoint, u.pos.x + u.moraleDir.x * 4, u.pos.z + u.moraleDir.z * 4);
    const dx = q.x - u.pos.x, dz = q.z - u.pos.z, len = Math.hypot(dx, dz);
    if (len > 0.1) { u.moraleDir.x = dx / len; u.moraleDir.z = dz / len; }
    u.moraleFleeDir = u.moraleDir;
    u.fleeing = true; u.fleeT = now; u.target = null; u.atk = null; u.swing = null; u.confused = 0;
    u.backUntil = 0; u.lookUntil = 0; u.aiT = 0;
    g.morale = Math.max(0, g.morale - 6 / Math.max(6, g.initial));
    // 一部は得物も捨てる。地面へ置くのは、この瞬間の一度だけ。
    if (m < 16 && u.id % 3 === 0 && u.wpn && u.wpn.parent && !u.dropped && !u.mounted) {
      army.dropWeapon(u);
      u.wpn = null; u.wpnKind = 'none';
    }
    moraleState(u);
  }
}

// 武将が実際に前へ二歩出た時だけ、近くの隊へ伝える。静止や後退では鼓舞しない。
function commanderAdvance(army, u) {
  const g = u.group, now = army.time;
  if (g.routed || u.confused > 0 || !(u.isTaisho || u === g.leader && (u.type === 'busho' || u.type === 'samurai' || u.name))) return;
  const x = u.pos.x, z = u.pos.z, h = g._face ?? g.facing;
  if (u.chiefX === undefined) { u.chiefX = x; u.chiefZ = z; return; }
  const forward = (x - u.chiefX) * Math.sin(h) + (z - u.chiefZ) * Math.cos(h);
  const elapsed = Math.max(0, now - (u.chiefSampleAt ?? now));
  u.chiefSampleAt = now; u.chiefX = x; u.chiefZ = z;
  const walking = u.mv.x * Math.sin(h) + u.mv.z * Math.cos(h);
  if (u.atk || u.swing || u.downed || u.pinT > now || u.stagger > 0 || walking < 0.2 || Math.hypot(u.push.x, u.push.z) > 0.3) { u.chiefSteps = 0; return; }
  if (g.order !== 'attack' && g.order !== 'move' || g.focus || g.isPlayerSquad || forward <= 0.02) { u.chiefSteps = 0; return; }
  u.chiefSteps = (u.chiefSteps || 0) + Math.min(forward, walking * elapsed);
  if (u.chiefSteps < 2 || u.chiefNext > now) return;
  u.chiefSteps = 0;
  if (!army.nearestEnemy(u, 30)) return;
  u.chiefNext = now + 12;
  g.commanderAdvanceAt = now;
  for (const n of army.groups) {
    if (!n.count || n.team !== u.team || n.civ || n.routed || n.isPlayerSquad || n.focus || n.order !== 'attack' && n.order !== 'move') continue;
    const c = n.center();
    let witness = null, distance = Infinity;
    for (const o of n.units) if (o.alive && !o.fleeing && (o === n.leader || o.stdHeld || !witness)) {
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (d < distance) { witness = o; distance = d; }
    }
    // 旗を見渡せる同じ高さの隊だけが応じる。谷や閉じた壁を越えない。
    if (Math.hypot(c.x - x, c.z - z) > 30 || !witness || Math.abs(witness.pos.y - u.pos.y) > 3 ||
        !localClear(army, u.pos, witness.pos) || n.commanderBoostAt > now - 8) continue;
    n.commanderBoostAt = now;
    n.morale = Math.min(100, n.morale + 8);
    n.commanderPush = u; n.commanderPushUntil = now + 8;
    for (const o of n.units) if (o.alive && !o.fleeing && !o.isPlayer) {
      o.fright = Math.max(0, (o.fright || 0) - 8);
      o.aiT = Math.min(o.aiT, 0.2);
    }
    for (const s of n.stds || []) if (s.userData.std) s.userData.std.dipT = 0.9;
  }
  army.play('eshout', u.pos, 0.7);
}

export function moraleAct(army, u, dt) {
  if (u.fearSafe && !u.restThreat && !u.atk && !u.swing && !u.fleeing && !u.confused) u.fright = Math.max(0, u.fright - dt * 0.8);
  if (u.backUntil <= army.time) u.backUntil = 0;
  moraleState(u);
  if (u.fleeing || u.noTarget || u.group.civ || u.type === 'porter' || u.climb || u.perch || u.woundOut || u.cover || u.escort || u.bind || u.downed || u.pinT > army.time || u.stagger > 0 || u.confused > 0 || u.group.routed) return false;
  // 出始めた一撃は終えてから反応する。
  if (u.swing || u.atk) return false;
  if (u.backUntil > army.time) {
    u.target = null;
    army.steer(u, dt, u.moralePoint, u.speed * 0.65, u.backFace);
    return true;
  }
  if (u.lookUntil > army.time) {
    army.steer(u, dt, null, 0, u.lookFace);
    return true;
  }
  return false;
}

export function moraleDeath(army, t) {
  if (t.type === 'dummy' || t.farSim) return;
  const chief = t.isTaisho || t.type === 'busho' || t.group && t === t.group.leader;
  if (chief) {
    if (t.group) { t.group.commanderLostAt = army.time; t.group.commanderLostMinor = !(t.isTaisho || t.type === 'busho'); }
    for (const g of army.groups) {
      if (g.commanderPush === t) { g.commanderPush = null; g.commanderPushUntil = 0; }
      if (!g.count || g.team !== t.team || g.civ || g === t.group) continue;
      const c = g.center();
      if (Math.hypot(c.x - t.pos.x, c.z - t.pos.z) <= 30 && g.units.some(u => u.alive && Math.abs(u.pos.y - t.pos.y) <= 3 && localClear(army, t.pos, u.pos))) g.morale = Math.max(0, g.morale - 8);
    }
    army.play('cry', t.pos, 0.9);
  }
  army.forNear(t.pos.x, t.pos.z, chief ? 30 : 4, (u) => {
    if (!u.alive || u.isPlayer || u.noTarget || u.group && u.group.civ || u.fleeing || u.type === 'porter' || u.type === 'dummy' || u.farSim || u.team !== t.team || Math.abs(u.pos.y - t.pos.y) > 3) return;
    const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > (chief ? 900 : 16) || army.wallBetween(t.pos, -1, u.pos)) return;
    u.fright = Math.min(45, u.fright + (chief ? 18 : 10));
    if (chief) {
      u.confused = Math.max(u.confused, 1.5 + (u.id % 4) * 0.4);
      // 混乱の後、一歩退く。士気の低い兵は既存の敗走へつながる。
      const h = u.group ? u.group.facing : u.heading;
      localPoint(army, u, u.moralePoint, u.pos.x - Math.sin(h) * 3, u.pos.z - Math.cos(h) * 3);
      u.backFace = h; u.backUntil = army.time + u.confused + 1.2;
    }
    if (d2 < 16 && !(u.lookAgainAt > army.time)) {
      u.lookFace = Math.atan2(dx, dz); u.lookUntil = army.time + 0.45; u.lookAgainAt = army.time + 3;
    }
    moraleState(u);
  });
}
