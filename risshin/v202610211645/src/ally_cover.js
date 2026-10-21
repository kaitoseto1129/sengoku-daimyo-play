// 味方の盾：深手の自分へ打ち込む敵には、そばの味方が向き直って斬り結ぶ。
// 敵の数と一撃の重さは変えない。一人の敵に一人の味方まで、四秒ずつ受け持つ。毎コマ呼んでよい（一秒に一度だけ調べる）。
export function allyCover(rt, P, { below = 0.5, reach = 4, near = 10 } = {}) {
  const F = rt.flags;
  if (!P.alive || P.hp >= P.maxHp * below || rt.t < (F.allyCoverAt || 0)) return;
  F.allyCoverAt = rt.t + 1;
  rt.army.forNear(P.pos.x, P.pos.z, reach, (o) => {
    if (!o.alive || o.team === P.team || o.fleeing || o.isStruct || o.noTarget || o.target !== P ||
        o.type === 'gun' && !o.sidearm || o.type === 'bow' || Math.abs(o.pos.y - P.pos.y) > 2.5) return;
    let mate = null, md = near;
    rt.army.forNear(o.pos.x, o.pos.z, near, (m) => {
      if (!m.alive || m.isPlayer || m.team !== P.team || m.fleeing || m.woundOut || m.isStruct || m.noTarget || m.civ ||
          m.type === 'porter' || m.type === 'gun' || m.type === 'bow' || m.coverUntil > rt.t || Math.abs(m.pos.y - o.pos.y) > 2.5 ||
          rt.army.wallBetween(m.pos, -1, o.pos)) return;
      const d = Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z);
      if (d < md) { md = d; mate = m; }
    });
    if (!mate) return;
    mate.target = o; mate.aiT = 0; mate.coverUntil = rt.t + 4;
    o.target = mate; o.atk = null; o.swing = null; o.aiT = 0.5;
  });
}
