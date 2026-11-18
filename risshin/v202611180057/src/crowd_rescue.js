// 囲まれた本人への助け（11/17 クラウド kaito2 K365・司令塔「K360⑦の危機は残しつつ、味方の組の厚み・囲まれ時の救い」）
// 本人の命が三割五分を切り、三歩半の内に敵が三人以上いる時、四十歩内の味方の組（道を歩く下知の組は除く）を本人の所へ寄せる。
// 傷の重さや敵の強さは変えない（危機は残す）。一度寄せたら二十五秒は寄せ直さない。毎コマ new しない。
// o.hp：寄せ始める命の割合（既定 0.35）・o.n：三歩半の内の敵の数（既定 3）・o.r：寄せる味方の組の遠さ（既定 40）。墨俣の三の手のように大きな寄せが砦の内へ入る段だけ早める
export function crowdRescue(rt, o = {}) {
  const P = rt.player, u = P?.u;
  if (!u || !u.alive || u.dying || u.downed || rt.over || rt.flags?.ending) return;
  if (rt.t < (rt._crowdRescueAt || 0)) return;
  if (!(u.hp <= (u.maxHp || 100) * (o.hp ?? 0.35))) return;
  const p = u.pos;
  let near = 0;
  for (const e of rt.army.units) {
    if (!e.alive || e.team === u.team || e.fleeing || e.isStruct || e.noTarget || e.downed) continue;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
    if (dx * dx + dz * dz < 12.25 && Math.abs(e.pos.y - p.y) < 2) near++;
  }
  if (near < (o.n ?? 3)) { rt._crowdRescueAt = rt.t + 1; return; }
  rt._crowdRescueAt = rt.t + 25;
  for (const g of rt.army.groups) {
    if (g.team !== u.team || g.routed || !g.count || g.order === 'path' || g.isPlayerSquad) continue;
    const c = g.center?.();
    if (!c || Math.hypot(c.x - p.x, c.z - p.z) > (o.r ?? 40)) continue;
    g.order = 'attack'; g.focus = null; g.seekRange = Math.max(g.seekRange || 0, 20);
    g.anchor = { x: p.x, z: p.z };
  }
}
