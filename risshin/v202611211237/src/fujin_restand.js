// 11/21 クラウド k365-cloud-07（司令塔：根来の坊舎の通りに兵一人・一宮の谷の口に人なし。幟だけでは大軍に見えない）：
//   K285 の内（兵は足さない・総数は同じ）で、布陣の表の遠い塊（rt.flags._fj の行の key）を、本人がまだ遠い開戦の初めに一度だけ
//   本人の通る道の両の縁へ立て直す（持ち場ごと移して歩かせる。待つだけの塊のまま＝noEngage は表のまま）。立て直す先は戦のファイルが決める。
//   spots：[{ x, z, facing }] を塊の数だけ（足りなければ繰り返す）。本人が先の30m 内にいる間は立て直さない（目の前で兵が跳ばない）
export function fujinRestand(rt, keyRe, spots, o = {}) {
  const F = rt.flags, list = F && F._fj, me = rt.player?.u;
  const flag = o.flag || '_fjRestand';
  if (F[flag] || !list || !list.length || !me || !spots.length) return 0;
  const gs = list.filter((g) => g && g.units && keyRe.test(g._fjR?.key || ''));
  if (!gs.length) return 0;
  if (spots.some((p) => Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < (o.minDist ?? 30))) return 0;
  F[flag] = true;
  // 兵は跳ばさない（act bot「兵が一息で飛んだ（6m 超）」）：持ち場を移し、隊列のまま歩いて移る（本人が通りへ着く前に着く）
  gs.forEach((g, i) => {
    const p = spots[i % spots.length];
    for (const u of g.units) if (u._kyk) { u._kyk = false; u.idleSkip = false; if (u.mesh && !u.mesh.parent && u._kyParent) { u._kyParent.add(u.mesh); u._kyParent = null; } }
    g.anchor = { x: p.x, z: p.z }; g.dest = null; g.path = null; g.focus = null;
    g.order = 'hold'; g.stay = false; g.fixed = false; g.marching = false; g.speed = Math.max(g.speed || 0, o.speed ?? 3.6);
    if (p.facing != null) g.facing = p.facing;
    if (g._fjR) g._fjR = { ...g._fjR, x: p.x, z: p.z, facing: p.facing ?? g._fjR.facing };
  });
  return gs.length;
}
