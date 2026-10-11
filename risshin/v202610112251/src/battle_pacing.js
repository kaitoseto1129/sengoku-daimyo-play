// 全戦共通の打ち切り。史実の勝敗を作らず、足軽本人の任務を締める。
// 戦の時計は操作開始・手ほどき・一時停止の処理に従う。
// 一時の寄せは隊の下知を替えず、戦の側が持ち場や下知を変えたらすぐ解く。
export function pacingOrderActive(g, army) {
  const p = g._pacing;
  return !!p && p.until > army.time && !g.routed && !g.focus && !g.stay && !g.guard &&
    !g.reserve && !g.historicalOrders && !g.retreatOnly && !g.siegeAI && !g.civ &&
    g.order === p.order && g.anchor.x === p.ax && g.anchor.z === p.az &&
    g.seekRange === p.seek && g.fire === p.fire && g.noAI === p.noAI &&
    g.formation === p.formation && g.path === p.path && g.pathIdx === p.pathIdx && !g.onArrive &&
    p.target.alive && !p.target.noTarget && !p.target.fleeing;
}

function enemyPacingTick(rt) {
  if (!rt.ai || rt.flags.ending || rt.aftermath || rt.withdrawal ||
      rt.prelude && rt.prelude !== 'done' || rt.t < (rt.pacingScanAt ?? 0)) return;
  rt.pacingScanAt = rt.t + 1;
  const P = rt.player.u;
  let near = false;
  for (const g of rt.army.groups) {
    if (g.team === P.team || g.civ || g.routed) continue;
    for (const u of g.units) {
      if (u.alive && !u.noTarget && !u.fleeing && !u.woundOut && !u.dropped &&
          u.type !== 'dummy' && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 20 &&
          Math.abs(u.pos.y - P.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, P.pos)) {
        near = true; break;
      }
    }
    if (near) break;
  }
  if (near) rt.pacingEmptyAt = rt.t;
  else if (rt.pacingEmptyAt == null) rt.pacingEmptyAt = rt.t;
  // 敵が途切れて三十秒、または近い守兵が三十秒止まった時、小勢だけを寄せる。
  rt.ai.pressIdleEnemy(!near && rt.t - rt.pacingEmptyAt >= 30);
}

export function battlePacingTick(rt) {
  if (rt.over || rt.def.dojo || rt.def.town || !rt.player.u.alive || rt.retryOpen) return;
  enemyPacingTick(rt);
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
