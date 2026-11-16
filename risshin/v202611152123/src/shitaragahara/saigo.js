// 11/16 クラウドし（台帳 K340 長篠「討ち取り0で勝つ」）：段の終わりに武田の名のある将がまだ生きていると、
//   すぐ rt.army.kill(lord, null) で討死させていた（act bot：名のある将7人とも段の終わりの kill・本人0）。
//   本人が30m内に居る時だけ、将は最後に本人へ向かって来る（最長二十秒・体力は半ばまで）。本人が討てばその手柄、
//   討てなければ今まで通り討死にして段を進める。離れていれば今まで通りすぐ討死。
// 呼び方：段の終わりの判定の後、`if (lordGrace(rt, S, lord)) return 続ける値;` を kill の前に置く。
export function lordGrace(rt, S, lord, r = 30, sec = 20) {
  if (!lord?.alive || lord.fleeing && S.graceT == null) return false;
  const P = rt.player?.u;
  if (!P?.alive || P.noTarget || P.invuln) return false;
  const d = Math.hypot(lord.pos.x - P.pos.x, lord.pos.z - P.pos.z);
  if (S.graceT == null) {
    if (d > r) return false;
    S.graceT = rt.t;
    lord.invuln = false; lord.noTarget = false; lord.cover = null; lord.fleeing = false;
    lord.hp = Math.min(lord.hp, lord.maxHp * 0.5);
    rt.say(lord.name, 'まだ終わらぬ！　そこの者、勝負じゃ！', 2.6);
  }
  if (rt.t - S.graceT > sec || d > r + 20) return false;
  // 旗本の割って入り（army_think の cover）と同じ道で、将の足を本人へ向ける（持ち場・下知に上書きされない）。
  //   柵越しなら柵の口・破れ目を回る歩みは歩き方の側のまま。二m半の内の敵には斬りかかる
  lord.fleeing = false; lord.watch = null; lord.graceT = rt.t;   // bot（b_shitaragahara の botBrain）が名乗った将へ向かう印
  lord.cover = { t: rt.army.time + 0.6, x: P.pos.x, z: P.pos.z };
  return true;
}
