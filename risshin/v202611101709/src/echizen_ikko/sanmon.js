// ======================================================================
// 越前・大滝寺の山狩り　夜の山門（9〜12分・夜・松明）（docs/oda15_plan_1108.md 19）
//   石段の上の山門の前で、本人と組が上の衆徒と押し合ったまま、山門を誰も打たずに八分止まった（11/9 の流し）。
//   惣門・山門に三十秒打撃が無ければ、既存の近い掛矢組を門前へ寄せ直す。実際の到着と打撃は本体の tickGateWorkers が扱う。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
// 討死や戦場からの離脱後も alive が残る。門を打てる兵だけを選び、外れた打ち手は交代する。
export function workerReady(u) {
  return !!(u?.alive && u.hp > 0 && !u.gone && !u.noTarget && !u.dying && !u.fleeing && !u.woundOut &&
    !u.rearWound && !u.downed && !u.keep && u.hand && u.wpn);
}

export function tick(rt) {
  const F = rt.flags, somon = F.step === 1;
  const st = (somon ? F.gateSomon : F.gateSanmon)?.struct;
  if ((!somon && F.step !== 2) || F.ending || !st?.alive || F.mode !== 'attack') return;
  const key = somon ? 'ikSomon' : 'ikSanmon';
  const M = F[key] || (F[key] = { at: rt.t, hp: st.hp, next: 0 });
  if (st.hp !== M.hp) { M.hp = st.hp; M.at = rt.t; }
  if (rt.t - M.at < 30) return;
  if (rt.t < M.next) return;
  M.next = rt.t + 8;
  const x = (st.seg[0] + st.seg[2]) / 2, z = (st.seg[1] + st.seg[3]) / 2;
  let worker = null, nearest = Infinity, arrived = false;
  for (const w of F.gateWorkers || []) {
    if (w.b._routeGate !== st || w.b.real?.routed || w.b.real?._pinH) continue;
    if (w.tool.visible) return;
    for (const u of w.b.real?.units || []) {
      if (!workerReady(u)) continue;
      const d = Math.hypot(u.pos.x - x, u.pos.z - z);
      // 麓の組を門へ直行させず、参道の門前か山門の石段まで着いた打ち手を呼ぶ。
      if (u.pos.z >= (somon ? -110 : -34) && d < nearest) {
        nearest = d; worker = w;
        arrived = d <= 3.5 && Math.abs(u.pos.y - rt.world.heightAt(x, z)) < 2;
      }
    }
  }
  if (!worker) return;
  if (!M.said) {
    M.said = true;
    rt.say('組頭', somon ? '掛矢組、惣門へ寄せよ！　組は門前を払え！' : '掛矢組、山門へ寄せよ！　組は石段の上を払え！', 3.6);
  }
  // 架空の打ち手で門を削らない。掛矢を振っている間は寄せ直さず、斬り合う敵がいれば打撃を待つ。
  if (worker.tool.visible) return;
  const b = worker.b;
  // 寄せ直した組が離れた守りを追うと、門へ届かず再び止まる。
  // 既存の門攻め優先で、目前の敵にだけ応戦して門へ戻す。破門後は通常の戦いへ戻る。
  if (b.assault) b.assault.gateOnly = true;
  // 縦隊の中心が石段に残っていても、門へ届いた打ち手は作業へ移れる。
  // 中心を門の手前へ寄せ直し続けると、到着済みの兵まで足止めされる。
  if (arrived) {
    b._gateWait = true;
    b.order({ id: 'assault', form: 'column' });
    b.light?.halt();
    return;
  }
  // 門そのものへの下知は tickRoutes がすぐ突撃へ替える。手前の経由点を挟み、到着後に門攻めへ戻す。
  const current = b._route?.[b._i - 1];
  if (current?.[0] !== x || current?.[1] !== z - 2.5) {
    // 古い石段の経由点を後ろへ足すと、門前に着いた直後に坂を下り直す。
    const gateAt = b._route?.findIndex((p) => p[0] === x && p[1] === z) ?? -1;
    const rest = gateAt >= 0 ? b._route.slice(gateAt) : somon ? [[x, z], [2, -46]] : [[x, z], [0, 20]];
    b._route = [[x, z - 2.5], ...rest]; b._i = 1;
  }
  b._gateWait = false;
  worker.b.order({ id: 'move', to: { x, z: z - 2.5 }, form: 'column' });
}
