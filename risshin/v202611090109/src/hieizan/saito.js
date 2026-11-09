// ======================================================================
// 比叡山攻め　後の段「西塔・横川」（6〜15分。docs/oda15_plan_1108.md の 12）
// - 根本中堂を押さえた後、西塔の鐘（hiei_mtn.bellSaito）→ 西塔の釈迦堂（p6）→ 横川中堂（p7）→ 締め（win）。
//   もとは長くなるので止めていた続き。15分の構成で戻し、各段に時の保険を足す（道で詰まって止まらない。敵の命は増やさない）。
// - 西塔で火が山じゅうへ回り煙で見えにくくなる（p6）・逃げる人々の山道と横川の抵抗（p7）・各地の炎上と静まり（締めの語り）。
// ======================================================================
export const WEST_MAX = 95, SAITO_MAX = 110, YOKAWA_MAX = 150;

// ctx：{ P, route(step), p6(), p7(), win(why), back（明智の後続）, walk, pts }
export function tick(rt, ctx) {
  const F = rt.flags;
  if (rt.G.lord || F.ending || rt.over || !F.bell2 || !rt.player.u.alive) return;
  const u = rt.player.u.pos, near = (q, r) => Math.hypot(u.x - q.x, u.z - q.z) < r;
  if (F.step === 4) {
    if (near(ctx.P.westGate, 16) || rt.t - F.westT > WEST_MAX) { ctx.p6(); if (ctx.back) ctx.walk(ctx.back, ctx.pts('saito', 4), 2.2); }
  } else if (F.step === 5) {
    if (near(ctx.P.saito, 16) || rt.t - F.stepT > SAITO_MAX) { ctx.p7(); if (ctx.back) ctx.walk(ctx.back, ctx.pts('yokawa'), 2.1); }
  } else if (F.step === 6) {
    if (!F.hieiQuiet && rt.t - F.stepT > 40) {
      F.hieiQuiet = true;
      rt.say('足軽', '東塔も西塔も……山じゅうが燃えておる', 3.4);
      rt.after(5, () => !F.ending && rt.say('明智光秀', '逃げる者は追うな。横川の堂の前を押さえれば、それで務めは終わる', 4));
    }
    if (near(ctx.P.yokawa, 16) || rt.t - F.stepT > YOKAWA_MAX) ctx.win('燃える堂の間を抜け、横川への山道の掃討を終えた');
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
