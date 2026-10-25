// 本陣から見た右と前を正にする。数・位置は戦の定義で上書きできる。
const EMPTY = [];
export function jinkeiSlot(name, i, n, w = 60, d = 60) {
  const t = n > 1 ? i / (n - 1) : 0.5;
  let right = (t - 0.5) * w, front = 0;
  if (name === '魚鱗') {
    const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
    const rows = Math.ceil((Math.sqrt(8 * n + 1) - 1) / 2);
    right = (i - row * (row + 1) / 2 - row / 2) * w / Math.max(1, rows - 1);
    front = d * (1 - row / Math.max(1, rows - 1));
  } else if (name === '鶴翼') front = d * Math.abs(t - 0.5);
  else if (name === '方円') { right = Math.cos(i / n * Math.PI * 2) * w / 2; front = Math.sin(i / n * Math.PI * 2) * d / 2; }
  else if (name === '雁行') front = (t - 0.5) * d;
  else if (name === '偃月') front = d * (1 - Math.pow((t - 0.5) * 2, 2)) / 2;
  else if (name === '長蛇') { right = Math.sin(t * Math.PI * 2) * w / 6; front = (1 - t) * d; }
  else if (name === '衡軛') front = (i % 2) * d / 2;
  return { right, front };
}

export function jinkeiPoint(plan, s, i = 0, out = {}) {
  const p = s.at || jinkeiSlot(plan.name, i, plan.sonae.length, plan.width, plan.depth);
  const r = p.right + (s.shift?.right || 0), f = p.front + (s.shift?.front || 0);
  const sn = Math.sin(plan.facing || 0), cs = Math.cos(plan.facing || 0);
  out.x = plan.honjin.x + r * cs + f * sn;
  out.z = plan.honjin.z - r * sn + f * cs;
  return out;
}

// 戦の定義は備えの表と既存の作り手を渡す。川・崖の時だけ五〜十メートルずらす。
export function jinkeiBuild(rt, plan, make) {
  const list = {};
  plan.sonae.forEach((s, i) => {
    if (s.role === '本陣' || s.bindOnly) return;
    const at = jinkeiPoint(plan, s, i);
    if (!rt.world.walkable(at.x, at.z)) {
      for (const offset of [5, -5, 10, -10]) {
        const x = at.x + Math.cos(plan.facing) * offset, z = at.z - Math.sin(plan.facing) * offset;
        if (rt.world.walkable(x, z)) { at.x = x; at.z = z; break; }
      }
    }
    list[s.id] = make(s, at, plan);
  });
  return list;
}

// 既存の備・本陣へ結ぶだけ。兵も描画も増やさず、台本の前進や退却を優先する。
export function jinkeiInit(rt) {
  const plans = rt.def.jinkei;
  if (!plans) return;
  rt.jinkei = plans.map((p) => ({ plan: p, slots: p.sonae.map((s, i) => ({
    spec: s, b: s.bind ? s.bind(rt) : null, home: jinkeiPoint(p, s, i), filled: false, guardAt: null,
  })), t: 0 }));
  for (const J of rt.jinkei) for (const S of J.slots) if (S.b) {
    S.home.x = S.b.pos.x; S.home.z = S.b.pos.z;
  }
}

export function jinkeiTick(rt, dt) {
  for (const J of rt.jinkei || EMPTY) {
    J.t -= dt;
    if (J.t > 0) continue;
    J.t = 1;
    if (rt.over || (rt.def.jinkeiActive && !rt.def.jinkeiActive(rt))) continue;
    for (const S of J.slots) {
      const b = S.b, s = S.spec;
      if (!b || b.routedL || b.fallen || b.regroupT || b.morale < 25) continue;
      if (s.role === '旗本衆' && J.plan.head) {
        const u = J.plan.head(rt);
        if (!u || !u.alive) continue;
        if (!S.guardAt) S.guardAt = { x: u.pos.x, z: u.pos.z, dx: b.pos.x - u.pos.x, dz: b.pos.z - u.pos.z };
        S.home.x = u.pos.x + S.guardAt.dx;
        S.home.z = u.pos.z + S.guardAt.dz;
        if (!b.light?.army.tw && Math.hypot(b.pos.x - S.home.x, b.pos.z - S.home.z) > 3) b.order({ id: 'move', to: S.home });
      } else if (s.relief && !S.filled) {
        const front = J.slots.find((q) => q.spec.id === s.relief);
        if (!front?.b || !(front.b.routedL || front.b.fallen || front.b.morale < 25)) continue;
        S.filled = true;
        S.home.x = front.b.pos.x; S.home.z = front.b.pos.z;
        b.order({ id: 'move', to: S.home });
      } else if (s.role === '遊軍' && !S.filled) {
        S.filled = true;
        S.home.x += Math.cos(J.plan.facing) * (s.flank || 24);
        S.home.z -= Math.sin(J.plan.facing) * (s.flank || 24);
        b.order({ id: 'move', to: S.home });
      }
    }
  }
}
