// 突っ立ちの見張り（kaito 10/28「動かない敵はマジクソ。突っ立ってるだけとか」）：
//   本人から34m 内の敵で、足も向きも手も止まったまま一〜二秒半たった者は、その場で何かさせる。
//   歩ける者は敵の方へ半歩踏み込む・引く・左右へ踏み替える（向きは敵へ）。櫓・舟・膝つきの槍衾・伏せ・下敷きの者は
//   その場で向き直り、槍を構え直す（体の向きを左右に振る）。戦の定義の待ち場（combatSpace）・持ち場で詰まった者・
//   逃げ道で詰まった者も同じ。行き先・号令・隊の数は変えない。兵の判断（think）の後に一度だけ足と向きを上書きする。
//   重さ：近い敵だけ・数の比べだけ。敵を探すのは踏み直しを始める時だけ（一人あたり一〜二秒に一度）。
const R2 = 34 * 34;
export function aliveGuard(army, u, dt) {
  const P = army.playerUnit;
  if (!P || u.team === P.team || u.isPlayer || u.type === 'dummy' || u.isStruct || u.dying || !u.alive) return;
  const dx0 = u.pos.x - P.pos.x, dz0 = u.pos.z - P.pos.z;
  if (dx0 * dx0 + dz0 * dz0 > R2) { if (u._alv) u._alv.t = army.time; return; }
  const now = army.time;
  u._alvSeen = now;   // 本人の近くにいる印（army_move.js の idleFx は、この間は持ち場で座り込ませない）
  const A = u._alv || (u._alv = { x: u.pos.x, z: u.pos.z, h: u.heading, t: now, on: 0, k: u.id % 4, px: 0, pz: 0, step: false, face: 0, wait: 1 + (u.id % 7) * 0.12, pt: { x: 0, z: 0 } });
  // 自分で手を動かしている者（突き・振り・弾込め・打たれ・救い・登り）は見張らない
  if (u.atk || u.swing || u.bind || u.hit || u.stagger > 0 || u.reload || u.dragging || u.climb || u.dodging || u.lastHitT < 0.6 || u.cheer > 0.05 || u.fireT > 0 || u.jinchu) {
    A.x = u.pos.x; A.z = u.pos.z; A.h = u.heading; A.t = now; A.on = 0; return;
  }
  if (A.on > 0) {
    A.on -= dt;
    if (A.step) {
      const d = Math.hypot(A.pt.x - u.pos.x, A.pt.z - u.pos.z);
      if (d > 0.12) { army.steer(u, dt, A.pt, Math.min(u.speed, 1.4), A.face); army.turn(u, A.face, dt, 2.5); return; }
      A.step = false;
    }
    army.turn(u, A.face, dt, 6);   // 持ち場の向きへ戻す判断より強く回す
    return;
  }
  const mx = u.pos.x - A.x, mz = u.pos.z - A.z;
  let dh = Math.abs(u.heading - A.h) % 6.283185307; if (dh > Math.PI) dh = 6.283185307 - dh;
  if (mx * mx + mz * mz > 0.06 || dh > 0.25) { A.x = u.pos.x; A.z = u.pos.z; A.h = u.heading; A.t = now; return; }
  if (now - A.t < A.wait) return;
  // 踏み直しを始める：向く先は本人（近ければ）か、いちばん近い敵
  const pd = Math.sqrt(dx0 * dx0 + dz0 * dz0);
  let foe = P.alive && pd < 30 && Math.abs(P.pos.y - u.pos.y) < 3 ? P : null;
  if (!foe || pd > 12) { const o = army.nearestEnemy(u, 20, (q) => !q.isStruct && !q.civ && Math.abs(q.pos.y - u.pos.y) < 3); if (o) foe = o; }
  const fh = foe ? Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) : u.group ? u.group._face ?? u.group.facing : u.heading;
  const k = A.k++ & 3;
  const still = u.perch || u.pinT > now || u.downed || u.naka || u.idl?.sit > 0.5 || u._crouch || u.woundRest > 0.5;
  A.step = false;
  if (!still) {
    // 前へ半歩・引く・右・左の順（一人ずつずらす）。歩けない所なら向き直るだけ
    const fx = Math.sin(fh), fz = Math.cos(fh), s = 0.45 + (u.id % 3) * 0.08;
    const ox = k === 0 ? fx * s : k === 1 ? -fx * s : k === 2 ? fz * s : -fz * s;
    const oz = k === 0 ? fz * s : k === 1 ? -fz * s : k === 2 ? -fx * s : fx * s;
    const x = u.pos.x + ox, z = u.pos.z + oz;
    if (!army.world.walkable || army.world.walkable(x, z, u.pos.y)) { A.pt.x = x; A.pt.z = z; A.step = true; }
  }
  // 向きは敵の左右へ交互に振って構え直す（人垣に挟まれて足が出ない者も、穂先と体の向きは動く）
  A.face = fh + (k & 1 ? 0.45 : -0.45) * (A.step ? 0.8 : 1.35);
  A.on = A.step ? 0.9 : 0.8;
  A.wait = 0.9 + Math.random() * 1.1;
  A.x = u.pos.x; A.z = u.pos.z; A.h = u.heading; A.t = now;
  if (A.step) army.steer(u, dt, A.pt, Math.min(u.speed, 1.4), A.face);
  army.turn(u, A.face, dt, 6);
}
