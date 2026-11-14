// 自分の組の小頭（kaito 11/11 docs/kaito_ashigaru_ai_1111.md「組頭が細かい所を回す。討たれると反応が遅れ、隊列と斉射が乱れ、別の兵が代わる」）。
//   五人以上の組に、いちばん古参の兵を小頭に置く。小頭が討たれると、代わりが立つまで（6秒）号令への動きが遅れ（player_command）、
//   鉄砲の斉射がばらける（kumi.js volley）。組の士気と整いは頭の死として下がる（army_morale の commanderLostAt）。代わりは次に古参の兵。字は出さない。
const LAG_S = 6;
const vet = (u) => (u.roster ? (u.roster.battles || 0) + (u.roster.drill || 0) : 0) + (u.type === 'samurai' ? 3 : 0);
const ok = (u) => u.alive && !u.isPlayer && !u.fleeing && !u.woundOut && !u.isTomo;

export function squadHeadTick(rt) {
  const now = rt.t;
  for (const g of rt.squadGroups || []) {
    if (!g.count || g.isTomo) continue;
    const h = g.kogashira;
    if (h && ok(h)) continue;
    if (h && !g.kogaLostAt) {
      g.kogaLostAt = now; h.kogashira = false;
      g.commanderLostAt = rt.army.time; g.commanderLostMinor = true;
      continue;
    }
    if (g.kogaLostAt && now - g.kogaLostAt < LAG_S) continue;
    const pool = g.units.filter(ok);
    if (pool.length < (h ? 3 : 5)) continue;
    const nu = pool.reduce((a, u) => (vet(u) > vet(a) ? u : a), pool[0]);
    g.kogashira = nu; nu.kogashira = true;
    if (g.kogaLostAt && !(g._kogaSaid > now)) { g._kogaSaid = now + 20; rt.say(nu.name || '足軽', 'わしが組をまとめる！　続けい！', 2); }
    g.kogaLostAt = 0;
  }
}

// 小頭を失って代わりが立つまでの、号令への遅れ（秒）
export function headLag(g) {
  return g && g.kogaLostAt ? 1.2 + Math.random() * 1.3 : 0;
}
