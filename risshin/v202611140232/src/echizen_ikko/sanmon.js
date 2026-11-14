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
  const gateY = rt.world.heightAt(x, z);
  let worker = null, nearest = Infinity, arrived = false;
  // 指定した掛矢組が全員離脱した時だけ、近くの物見が引き継ぐ。
  // 物見は惣門の下知を残しているため、門の一致だけで探すと交代できない。
  for (let pass = 0; pass < 2 && !worker; pass++) {
    for (const w of F.gateWorkers || []) {
      if (w.b.real?.routed || w.b.real?._pinH) continue;
      if (pass === 0 ? w.b._routeGate !== st : w.b !== F.scout || w.b._routeGate?.alive) continue;
      if (w.tool.visible) return;
      for (const u of w.b.real?.units || []) {
        if (!workerReady(u)) continue;
        const d = Math.hypot(u.pos.x - x, u.pos.z - z);
        const atGate = d <= 3.5 && Math.abs(u.pos.y - gateY) < 2;
        // 外堂の下で止まった組も交代に呼ぶ。山門へは下の参道を経由させる。
        // 平面上で近い段下の兵より、門と同じ高さへ到着した打ち手を優先する。
        if (u.pos.z >= -110 &&
            (atGate && !arrived || atGate === arrived && d < nearest)) {
          nearest = d; worker = w;
          arrived = atGate;
        }
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
  if (b._routeGate !== st) {
    b._routeGate = st;
    // 前の外堂への経路を残さず、破門後も門の口から堂へ進ませる。
    b._route = somon ? [[x, z], [2, -46]] : [[x, z], [0, 20]];
    b._i = 1; b._arriveHold = true; b._arriveFacing = null;
  }
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
  // 外堂の縁で止まった掛矢組を除外すると、石段に誰も着かず救済も働かない。
  // 平場の外から切岸を横切らず、開いた惣門、外堂の参道、石段の順に歩く。
  if (!somon && b.pos.z < -34) {
    if (!b._route || b._sanmonApproach !== b._route) {
      const road = [];
      if (b.pos.z < -70) road.push([0, -86]);
      road.push([2, -46], [0, -20], [x, z - 2.5], [x, z], [0, 20]);
      b._route = b._sanmonApproach = road; b._i = 1;
    }
    // 八秒ごとの点検で最初の点へ戻さず、今向かっている経由点へ下知を掛け直す。
    const [px, pz] = b._route[b._i - 1];
    b._gateWait = false;
    b.order({ id: 'move', to: { x: px, z: pz }, form: 'column' });
    return;
  }
  // 門そのものへの下知は tickRoutes がすぐ突撃へ替える。手前の経由点を挟み、到着後に門攻めへ戻す。
  const from = Math.max(0, (b._i || 1) - 1);
  const gateAt = b._route?.findIndex((p) => p[0] === x && p[1] === z) ?? -1;
  const approach = b._route?.[gateAt - 1];
  if (gateAt < 0 || approach?.[0] !== x || approach?.[1] !== z - 2.5) {
    // 未通過の石段を省くと切岸へ直進して止まる。残る道順だけを門前の点につなぐ。
    // 通過済みの点は戻さず、呼び直すたびに門前の点を重ねて足さない。
    const remaining = gateAt >= from ? b._route.slice(from, gateAt) : [];
    const rest = gateAt >= 0 ? b._route.slice(gateAt) : somon ? [[x, z], [2, -46]] : [[x, z], [0, 20]];
    b._route = [...remaining, [x, z - 2.5], ...rest]; b._i = 1;
  }
  const [nextX, nextZ] = b._route[b._i - 1];
  b._gateWait = false;
  b.order({ id: 'move', to: { x: nextX, z: nextZ }, form: 'column' });
}
