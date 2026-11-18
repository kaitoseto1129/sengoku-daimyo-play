// 深手・討死・敗走した者を、寄せ続ける兵に数えない。
// 11/18 クラウド持ち主：名乗り合いの輪で下がって見ている兵（duelW・一時の noTarget）は寄せ続ける兵に数える。
//   数えから外していたため、城の徒士頭が本人と名乗り合った途端に「城兵 1／10」となり、段3の札が1.6秒で済んでいた（描かずの数え）
export function fightingCount(g) {
  if (g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && u.hp > 0 && !u.dying && !u.gone &&
      !u.downed && !u.fleeing && !u.woundOut && !u.rearWound && (!u.noTarget || u.duelW)) n++;
  return n;
}

// 時間だけで撃退にせず、本人が持ち場にいて、敵が実際に減った時に進む。
export function repelled(rt, left, remaining, at) {
  const u = rt.player.u;
  return u.alive && u.hp > 0 && !u.dying && !u.gone && !u.downed &&
    !u.woundOut && !u.rearWound && left <= remaining &&
    Math.hypot(u.pos.x - at.x, u.pos.z - at.z) <= 32;
}

// 11/18 クラウド持ち主 08:00（act bot「無傷で17〜24人討った」・歯ごたえ★1）：本人へ打ち込んだ敵の太刀は550秒で一度だけ
//   （一時の数え）。城兵は脇の味方の組とばかり打ち合い、本人は横から突くだけだった。斬り合いの間だけ、本人の十m 内の
//   城兵のうち三人までが本人へ向き直る（本人を狙う者が三人に満たない時だけ。振りかぶり中・名のある者・使者は除く）。
//   一度に斬りかかる数は共通の playerAtkMax のまま。強さ・数は変えない。
const PRESS_R = 10, PRESS_N = 3;
export function pressPlayer(rt) {
  const A = rt.army, P = rt.player.u;
  if (!P?.alive || P.noTarget || P.invuln || A.duel || rt.over) return;
  if (rt.t < (rt._ttPressT || 0)) return;
  rt._ttPressT = rt.t + 0.5;
  let on = 0;
  const cand = [];
  for (const u of A.units) {
    if (!u.alive || u.team === P.team || u.dying || u.downed || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z;
    if (Math.abs(dx) > PRESS_R || Math.abs(dz) > PRESS_R) continue;
    const d = Math.hypot(dx, dz);
    if (d > PRESS_R || Math.abs(u.pos.y - P.pos.y) > 2) continue;
    if (u.target === P) { on++; continue; }
    const g = u.group;
    if (u.name || u.noTarget || u.campProtected || u.civ || u.mounted || u.climb || u.perch || u.bind) continue;
    if (u.type === 'gun' || u.type === 'bow' || u.type === 'busho' || u.type === 'porter') continue;
    if (!g || g.routed || g.civ || g.peaceful || g.order === 'flee' || g.order === 'retreat' || g.retreatOnly) continue;
    if ((u.atk && !u.atk.done) || (u.swing && !u.swing.done)) continue;
    if (A.wallBetween && A.wallBetween(u.pos, u.team, P.pos, (u.wpnKind || u.lookWeapon) === 'spear')) continue;
    cand.push([d, u]);
  }
  if (on >= PRESS_N || !cand.length) return;
  cand.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < cand.length && on < PRESS_N; i++, on++) {
    const u = cand[i][1];
    u.target = P; u.watch = null; u.moveTo = null; u.pullUntil = A.time + 2.5;
    // 08:15：向き直った者が打つ間（cdBase 2.4）を待つ間に本人の一突きで倒れ、太刀が届かなかった（3回中2回なお無傷）。
    //   飢えた死に物狂いの寄せとして、向き直った時だけ次の一振りをすぐ構える（振りかぶりの長さ・傷の重さはそのまま）
    u.cd = Math.min(u.cd ?? 0.3, 0.3);
  }
}
