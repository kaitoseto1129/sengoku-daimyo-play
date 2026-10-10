// 全戦共通の打ち切り。史実の勝敗を作らず、足軽本人の任務を締める。
// 戦の時計は操作開始・手ほどき・一時停止の処理に従う。
export function battlePacingTick(rt) {
  if (rt.over || rt.def.dojo || rt.def.town || !rt.player.u.alive || rt.retryOpen) return;
  if (rt.t >= 440 && !rt.pacingWarned) {
    rt.pacingWarned = true;
    rt.say('組頭', 'いつまでも寄せられぬ。今の任務を急げ。間に合わねば退くぞ', 4);
  }
  if (rt.t < 480 || rt.pacingExpired) return;
  rt.pacingExpired = true;
  rt.flags.ending = true;
  // 未達の任務を時間だけで成功にしない。既に得た手柄と史実の武将は保つ。
  if (rt.tracker.main !== true) {
    rt.tracker.main = false;
    for (const o of rt.objectives) if (o.kind === 'main' && !o.state) rt.objFail(o.id);
  }
  rt.timers.length = 0;
  rt.say('組頭', rt.tracker.main ? '役目は果たした。組をまとめ、陣へ戻れ' : 'この寄せはここまでじゃ。組をまとめて退け', 4);
  // 共通の追撃を重ねず、短い終幕へ。失敗時のやり直しの札は従来どおり。
  rt.finish({ scriptedEnd: true, failureReason: rt.tracker.main ? undefined : '寄せの間に任務を果たせなかった。次は味方の旗に続き、任務の印へ進もう。' }, 6);
}
