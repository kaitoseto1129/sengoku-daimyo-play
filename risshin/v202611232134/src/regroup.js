// 11/21 cloud-26（K466・kaito「部隊ごと動く」・司令塔：③の戦の組のばらけ＝稲葉山の味方19%・桶狭間16%）：
//   攻めの組（order 'attack'）は斬り合いで相手を追って散り、斬り合いが終わっても散った所に立った（組の真ん中から二十五m より遠い兵が三割余り）。
//   二秒ごとに、本人の百五十m 内の攻めの組で、組の誰も三十m 内の敵と斬り合っていない時、旗持ち（いなければ将、無ければ兵の真ん中）から
//   十五m より離れた兵を、旗の三m 内へ寄り直させる。敵味方とも。本人の組・崩れた組・道を歩く組・待つ組は触らない。窓の __rgOff で切れる
export function regroupTick(rt) {
  if (typeof window !== 'undefined' && window.__rgOff) return;
  const F = rt.flags, me = rt.player?.u;
  if (!me || rt.over || (F._rgT || 0) > rt.t) return;
  F._rgT = (rt.t || 0) + 2;
  for (const g of rt.army.groups) {
    if (!g.units || g.order !== 'attack' || g.routed || g.civ || g.isPlayerSquad || g.isRunner || g.focus) continue;
    const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound);
    if (al.length < 5) continue;
    let cx = 0, cz = 0; for (const u of al) { cx += u.pos.x; cz += u.pos.z; } cx /= al.length; cz /= al.length;
    if (Math.hypot(cx - me.pos.x, cz - me.pos.z) > 150) continue;
    let busy = false;
    for (const u of al) { const t = u.target; if ((t && t.alive && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 30) || u.atk) { busy = true; break; } }
    if (busy) continue;
    const head = al.find((u) => u.stdHeld) || al.find((u) => u.type === 'busho' && u.name) || null;
    const fx = head ? head.pos.x : cx, fz = head ? head.pos.z : cz;
    for (const u of al) {
      if (u === head || Math.hypot(u.pos.x - fx, u.pos.z - fz) <= 15) continue;
      const a = ((u.id ?? 0) * 2.399) % (Math.PI * 2);
      u.target = null; u.moveTo = { x: fx + Math.cos(a) * 3, z: fz + Math.sin(a) * 3 }; u.aiT = 2;
    }
  }
}
