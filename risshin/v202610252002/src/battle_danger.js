// 被弾の直後と退避の下知中は、火付けより退く案内を優先する。
export function retreatRequired(rt) {
  return !!rt && !rt.over && !rt.def.town && !rt.def.dojo && rt.player.u.alive &&
    (rt.t < (rt.retreatUntil || 0) || rt.flags.retreatMarked ||
      rt.player.u.hp < rt.player.u.maxHp * .3 || rt.player.u.mobbed || rt.player.sta < 20);
}

export function rescueTarget(rt) {
  const u = rt.rescueTarget;
  return u?.alive && !u.gone && !u.fleeing && !u.woundOut && rt.t < u.rescueUntil ? u : null;
}

// 一度だけ立て直す間を残す。史実の討死や戦固有の決着を取り消さない。
export function rescueDamage(rt, u, amount) {
  if (!(amount > 0) || rt.over || rt.def.dojo || rt.def.town || rt.def.duel || !u.alive || u.team !== 0 ||
      u.invuln || u.mustLive || u.woundOut || u.fleeing || u.isStruct || u.civ) return amount;
  const leader = !u.isPlayer && (u.type === 'busho' || u.name || u.group?.leader === u);
  if (!u.isPlayer && (!leader || u.group?.hidden || rt.distTo(u.pos) > 60)) return amount;
  if (u.rescueUntil === undefined && u.hp - amount <= u.maxHp * 0.3) {
    u.rescueUntil = rt.t + 12;
    if (!u.isPlayer) {
      rt.missionDangerUntil = Math.max(rt.missionDangerUntil || 0, u.rescueUntil);
      if (!rescueTarget(rt)) rt.rescueTarget = u;
    } else rt.retreatUntil = Math.max(rt.retreatUntil || 0, u.rescueUntil);
    const text = u.isPlayer ? '危ない！　味方の列か物陰へ退け' : rt.def.guardLabel?.(rt, u) || 'この人を守れ';
    // 人物救援の案内を使わない戦でも、本人の危険と立て直す猶予は残す。
    if (u.isPlayer || rt.def.guardGuideAllowed?.(rt) !== false)
      rt.hud.notices.push(text, 95, 12, 'warn', () => !rt.over && u.alive && rt.t < u.rescueUntil);
  }
  // 十二秒を過ぎたら再び同じ札で延ばさない。体力を回復させず、最後の一撃だけ止める。
  return rt.t < (u.rescueUntil ?? -1) ? Math.min(amount, Math.max(0, u.hp - u.maxHp * (u.isPlayer ? 0.12 : 0.35))) : amount;
}
