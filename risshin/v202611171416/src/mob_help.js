// K365 クラウド（11/18）：本人が三人以上に囲まれたら、近く（四十五m 内）の味方の組を二つ、本人の所へ駆け寄らせる。
//   本能寺の供が庇うのと同じ考え。傷の重さ（K360⑦）は変えず、作りの側で囲みを解く。越前・金ヶ崎で使う。
export function mobHelp(rt, key = 'mob', say = true) {
  const F = rt.flags, me = rt.player?.u, k = key + 'HelpT';
  if (!me?.alive || rt.over || rt.t < (F[k] || 0)) return false;
  F[k] = rt.t + 2;
  let n = 0;
  for (const o of rt.army.units) if (o.alive && o.team !== me.team && !o.fleeing && !o.isStruct && Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) < 5) n++;
  if (n < 3) return false;
  F[k] = rt.t + 10;
  const near = rt.army.groups.filter((g) => g.team === me.team && g.count && !g.routed && !g.isPlayerSquad && !g.isTomo && g.order !== 'path' && g.anchor)
    .map((g) => ({ g, d: Math.hypot(g.anchor.x - me.pos.x, g.anchor.z - me.pos.z) })).filter((o) => o.d < 45 && o.d > 4).sort((a, b) => a.d - b.d).slice(0, 2);
  for (const { g } of near) {
    g.order = 'attack'; g.stay = false; g.focus = null; g.seekRange = Math.max(g.seekRange || 0, 20); g.aggro = Math.max(g.aggro || 0, 20);
    g.anchor.x = me.pos.x; g.anchor.z = me.pos.z;
  }
  if (say && near.length && rt.t - (F[key + 'SaidT'] ?? -99) > 20) { F[key + 'SaidT'] = rt.t; rt.say('組頭', `${rt.G?.name || '弥五郎'}が囲まれた！　皆、寄れ！`, 2.5); }
  return near.length > 0;
}
