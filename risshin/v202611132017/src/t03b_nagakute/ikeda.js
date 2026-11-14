// ======================================================================
// 小牧・長久手 二　仏ヶ根の段の後半「池田勝入様の旗本へ駆けつける」（9〜12分）
//   森長可が撃たれた後、池田元助の先手が崩れ、恒興の旗本が赤備えと金扇の旗本に囲まれる。
//   主人公は恒興の旗本へ駆けつけるが、救いは間に合わない（着いて二十秒ほどで恒興が討たれる。戻らない）。
//   その後「羽柴軍を退かせよ」へ（⑦細ヶ根）。
// ======================================================================
export function at(F, HOTOKE) { return { x: HOTOKE.x - 8, z: HOTOKE.z + 12 }; }

// 深手で終戦した後や、退却へ移った後に救援の声を出さない。
function laterSay(rt, delay, who, line, sec, check = null) {
  rt.after(delay, () => { if (!rt.flags.ending && !rt.over && rt.player?.u?.alive !== false && rt.flags.stage === 5.5 && (!check || check())) rt.say(who, line, sec); });
}

export function start(rt, K) {
  const F = rt.flags;
  rt.say('池田恒興', '之助が……！　者ども、退くな、退くなぁ！', 3);
  // 榊原の手は檜ヶ根で退去済み。予約した声も、発言時に残る赤備えを確かめる。
  const redPresent = () => (F.aka || []).some((g) => g && !g.routed && g.order !== 'retreat' && g.order !== 'flee' && g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget));
  laterSay(rt, 3.4, '使番', '勝入様の旗本、赤備えに囲まれておりまする！　お救いを！', 3.2, redPresent);
  laterSay(rt, 10, '物見', '井伊直政の赤備えが、勝入様の旗本へ迫っておりまする！', 3, redPresent);
}
export function tick(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, A = at(F, K.HOTOKE);
  if (F.ending || rt.over || rt.player?.u?.alive === false || F.stage !== 5.5) return;
  const near = Math.hypot(P.x - A.x, P.z - A.z) < 14;
  if (!F.ikeArr && near) {
    F.ikeArr = rt.t;
    laterSay(rt, 1, '池田恒興', '来てくれたか……だが、もう遅い', 3);
    laterSay(rt, 12, '池田恒興', '退け！　お主らは生きて筑前に伝えよ。この首、くれてやるわ', 3.4);
  }
  // 一度着いてから先に細ヶ根へ走っても、見えない所で勝入の最期を済ませない。
  const lord = F.ikeG?.units.find((u) => u.name === '池田恒興' && u.alive);
  const watching = lord && Math.hypot(P.x - lord.pos.x, P.z - lord.pos.z) <= 35;
  if (F.ikeArr && !F.ikeFell && watching && rt.t - F.ikeArr > 30) {
    F.ikeFell = true;
    K.fall(F.ikeG, '池田恒興', '勝入様、永井直勝に討たれましてござる！');
    rt.after(6, () => { if (!F.ending && !rt.over && rt.player?.u?.alive !== false && F.stage === 5.5) K.next(); });
  }
}
