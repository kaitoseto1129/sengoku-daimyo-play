// ======================================================================
// 夏の陣の前哨戦（樫井・道明寺・八尾若江）で使う小さな決まり（kaito 11/8 樫井を遊んだ声）
//   guard ：家臣（手勢・自分の組）が主君を守る。斬りかかる敵がいれば、その敵へ皆で掛かる
//   wake  ：棒立ちの兵をなくす。持ち場で構えたままの味方の隊も、敵が十四歩まで寄れば槍を合わせる
//   volley：味方の鉄砲が撃つのが見えるように、寄せる敵へ揃えて放つ（音と煙。敵の気を少し落とす）
// 入れ方：各戦の update から tick(rt, dt, opt) を呼ぶ。opt.guards()・opt.keepHold(g)・opt.guns() で戦ごとに絞る。
// ======================================================================
const ok = (g) => g && g.count > 0 && !g.routed;

export function tick(rt, dt, opt = {}) {
  const F = rt.flags, K = F._kerai || (F._kerai = { gT: 0, wT: 0, vT: 4 });
  const P = rt.player && rt.player.u;
  if (!P || !P.alive || rt.over || F.ending) return;
  // 家臣が主君を守る（半秒ごと）
  if ((K.gT -= dt) <= 0) {
    K.gT = 0.5;
    const threat = rt.army.nearestEnemy(P, 8, (o) => !o.fleeing && !o.noTarget && !o.isStruct && !o.invuln);
    const gs = [...(opt.guards ? opt.guards(rt) : []), ...(rt.squadGroups || [])].filter(ok);
    for (const g of gs) {
      if (threat) {
        const c = g.center();
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 22) continue;   // 遠くの組は呼び戻さない（戦の流れを壊さない）
        g.calm = false; g.order = 'attack'; g.focus = threat; g.seekRange = Math.max(g.seekRange || 0, 12);
        g.anchor = { x: P.pos.x, z: P.pos.z };
      } else if (g.focus && (!g.focus.alive || g.focus.fleeing)) g.focus = null;
    }
  }
  // 棒立ちをなくす（一秒半ごと）。わざと構えさせている隊（keepHold）は除く
  if ((K.wT -= dt) <= 0) {
    K.wT = 1.5;
    for (const g of rt.army.groups) {
      if (g.team !== 0 || !ok(g) || g.order !== 'hold' || g.isPlayerSquad || (opt.keepHold && opt.keepHold(g))) continue;
      const c = g.center(), foe = rt.army.nearestEnemy({ pos: c, team: 0, id: -1 }, 14, (o) => !o.fleeing && !o.noTarget && !o.isStruct);
      if (!foe) continue;
      g.calm = false; g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 18); g.aggro = Math.max(g.aggro || 0, 14);
    }
  }
  // 味方の鉄砲の揃い撃ち（八秒に一度まで）
  if (opt.guns && (K.vT -= dt) <= 0) {
    K.vT = 1;
    for (const g of opt.guns(rt).filter(ok)) {
      if ((g._vNext || 0) > rt.t) continue;
      const c = g.center(), foe = rt.army.nearestEnemy({ pos: c, team: 0, id: -1 }, 42, (o) => !o.fleeing && !o.isStruct);
      if (!foe || Math.hypot(foe.pos.x - c.x, foe.pos.z - c.z) < 6) continue;
      g._vNext = rt.t + 8 + Math.random() * 3;
      rt.army.play('volley', c, 1.1);
      const fg = foe.group;
      if (fg && !fg.noRout) fg.morale = Math.max(0, (fg.morale ?? 100) - 4);
    }
  }
}
