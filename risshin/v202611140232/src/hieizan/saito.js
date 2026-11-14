// ======================================================================
// 比叡山攻め　後の段「西塔・横川」（6〜15分。docs/oda15_plan_1108.md の 12）
// - 根本中堂を押さえた後、西塔の鐘（hiei_mtn.bellSaito）→ 西塔の釈迦堂（p6）→ 横川中堂（p7）→ 締め（win）。
//   もとは長くなるので止めていた続き。15分の構成で戻し、到着と守りの敗退を確かめる。
// - 西塔で火が山じゅうへ回り煙で見えにくくなる（p6）・逃げる人々の山道と横川の抵抗（p7）・各地の炎上と静まり（締めの語り）。
// ======================================================================
// 到着・合流・残敵の判定は本体に揃える。時の経過や到着だけで目標を飛ばさない。
export function tick(rt) {
  const F = rt.flags;
  if (rt.G.lord || F.ending || rt.over || !F.bell2 || !rt.player.u.alive) return;
  if (F.step === 6 && !F.hieiQuiet && rt.t - F.stepT > 40) {
    F.hieiQuiet = true;
    rt.say('足軽', '東塔も西塔も……堂塔のあちこちが燃えておる', 3.4);
    rt.after(5, () => !F.ending && rt.say('明智光秀', '列を離れるな。逃げる者は後の手に任せ、横川の堂の前を押さえよ', 4));
  }
}

// bot：段の道筋の次の点へ。近い敵は突く。返り値 true で動きを決めた
export function bot(b, goTo, p, inp, strike, route) {
  const F = b.flags;
  if (b.G.lord || F.ending || !F.bell2 || F.step < 4) return false;
  const u = p.u;
  const e = b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.noTarget && !o.civ);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, d);
    return true;
  }
  const R = route(F);
  let bi = 0, bd = Infinity;
  for (let i = 0; i < R.length; i++) { const d = Math.hypot(R[i][0] - u.pos.x, R[i][1] - u.pos.z); if (d < bd) { bd = d; bi = i; } }
  const q = R[Math.min(R.length - 1, bd < 3 ? bi + 1 : bi)];
  if (q) goTo(p, inp, q[0], q[1], .6);
  return true;
}
