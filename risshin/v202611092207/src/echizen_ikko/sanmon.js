// ======================================================================
// 越前・大滝寺の山狩り　夜の山門（9〜12分・夜・松明）（docs/oda15_plan_1108.md 19）
//   石段の上の山門の前で、本人と組が上の衆徒と押し合ったまま、山門を誰も打たずに八分止まった（11/9 の流し）。
//   山門の段が百五十秒を過ぎたら、既存の掛矢組を門前へ寄せ直す。実際の到着と打撃は本体の tickGateWorkers が扱う。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
export function tick(rt) {
  const F = rt.flags, st = F.gateSanmon?.struct;
  if (F.step !== 2 || F.ending || !st?.alive || F.mode !== 'attack') return;
  const M = F.ikSanmon || (F.ikSanmon = { at: rt.t, next: 0 });
  if (rt.t - M.at < 150) return;
  if (rt.t < M.next) return;
  M.next = rt.t + 8;
  const worker = F.gateWorkers?.find((w) => w.b._routeGate === st && !w.b.real?.routed &&
    w.b.real?.units.some((u) => u.alive && !u.fleeing && !u.woundOut && !u.rearWound &&
      !u.downed && !u.keep && u.hand && u.wpn));
  if (!worker) return;
  if (!M.said) {
    M.said = true;
    rt.say('組頭', '掛矢組、山門へ寄せよ！　組は石段の上を払え！', 3.6);
  }
  // 架空の打ち手で門を削らない。掛矢を振っている間は寄せ直さず、斬り合う敵がいれば打撃を待つ。
  if (worker.tool.visible) return;
  const x = (st.seg[0] + st.seg[2]) / 2, z = (st.seg[1] + st.seg[3]) / 2;
  const b = worker.b;
  // 門そのものへの下知は tickRoutes がすぐ突撃へ替える。手前の経由点を挟み、到着後に門攻めへ戻す。
  const current = b._route?.[b._i - 1];
  if (current?.[0] !== x || current?.[1] !== z - 2.5) {
    const rest = b._route?.slice(Math.max(0, (b._i || 1) - 1)) || [[x, z]];
    b._route = [[x, z - 2.5], ...rest]; b._i = 1;
  }
  b._gateWait = false;
  worker.b.order({ id: 'move', to: { x, z: z - 2.5 }, form: 'column' });
}
