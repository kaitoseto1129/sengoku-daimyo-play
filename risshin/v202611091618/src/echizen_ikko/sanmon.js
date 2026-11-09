// ======================================================================
// 越前・大滝寺の山狩り　夜の山門（9〜12分・夜・松明）（docs/oda15_plan_1108.md 19）
//   石段の上の山門の前で、本人と組が上の衆徒と押し合ったまま、山門を誰も打たずに八分止まった（11/9 の流し）。
//   山門の段が百五十秒を過ぎたら、味方の掛矢組が松明を掲げて門に取り付き、一・六秒ごとに打って破る（約十秒）。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
export function tick(rt, dt) {
  const F = rt.flags, st = F.gateSanmon?.struct;
  if (F.step !== 2 || F.ending || !st?.alive || F.mode !== 'attack') return;
  const M = F.ikSanmon || (F.ikSanmon = { at: rt.t, t: 0 });
  if (rt.t - M.at < 150) return;
  if (!M.said) {
    M.said = true;
    rt.say('組頭', '掛矢組が松明を掲げて山門に取り付いた！　組は石段の上を払え！', 3.6);
  }
  if ((M.t += dt) < 1.6) return;
  M.t = 0;
  // 打ち手は門の前の掛矢組（門の打ちは四歩内の味方からしか通らない決まり・本体の army.damage の包み）
  const x = (st.seg[0] + st.seg[2]) / 2, z = (st.seg[1] + st.seg[3]) / 2;
  M.src = M.src || { alive: true, team: rt.player.u.team, pos: { x, y: 0, z: z - 1.5 }, name: '掛矢組' };
  rt.army.damage(st, 42, M.src, { kind: 'gateWork' });
  try { rt.army.play('knock', M.src.pos, 1.1); } catch (e) { /* なし */ }
}
