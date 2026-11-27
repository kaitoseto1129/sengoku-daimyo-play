// 被弾の直後と退避の下知中は、火付けより退く案内を優先する。
export function retreatRequired(rt) {
  return !!rt && !rt.over && !rt.def.town && !rt.def.dojo && !!rt.player?.u?.alive &&
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
    u.rescueUntil = rt.t + (u.isPlayer ? 8 : 12);
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
  // 11/20 K463 クラウド k365-cloud-40（kaito「大軍の中で HP がどんどん減るのが当たり前」）：本人は、六歩の内の敵の刃が味方より三人以上多い（囲まれた）間は
  //   この止めを掛けない。三方ヶ原の敵の備の真ん中で命が一割で十二秒止まり、刺されても減らなかった（敵は一度に三人ほどしか斬りかからないので「三人以上多い」は満たさない）。
  //   ＝十歩の内の敵が味方より二人以上多い間は止めない。そうでない時の退く猶予も十二秒→五秒
  //   11/20 夜（司令塔：act bot で根来・真田丸が三回続けて達成しない）：囲まれの目安を二人→三人多い時に、ほかの時の猶予を五秒→八秒に戻し寄せる
  if (u.isPlayer) { const A = rt.army; if ((A.playerCrowd || 0) - (A.playerSupport || 0) >= 3) return amount; }
  return rt.t < (u.rescueUntil ?? -1) ? Math.min(amount, Math.max(0, u.hp - u.maxHp * (u.isPlayer ? 0.12 : 0.35))) : amount;
}
