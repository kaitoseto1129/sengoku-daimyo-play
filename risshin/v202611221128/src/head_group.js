// 11/21 cloud-06（司令塔：act bot「歯ごたえがない（無傷で大勢倒せる）」を、敵を強くせずに直す。cloud-10 の武田編 d07 の組頭の小組と同じ形）：
//   戦が続いている（本人の八十m 内に敵が十人以上）のに、本人の二十五m 内の敵が三人より少ない時が十五秒続いたら、
//   本人の十八歩前に「討てる名のある組頭一人と侍一人・足軽八人」の小組を出して本人へ打ちかからせる。一つの戦で o.max 組（既定三）まで、七十秒あけて。
//   元の大軍は味方の組が先に討ち切り、本人の前に相手が残らなかった。足すのは本人の前の一組だけ・敵の強さは変えない。
//   o：{ names: ['〇〇の組頭', …], faction, look: { flag, armor }, max, gap, active(rt) }
import { enemyGroup } from './bhelp.js';

export function headGroupTick(rt, dt, o) {
  const F = rt.flags, P = rt.player?.u;
  if (!P?.alive || F.ending || rt.over || (o.active && !o.active(rt))) return;
  const S = F._hg || (F._hg = { n: 0, quietT: 0, nextT: 0, chkT: 0 });
  if (S.n >= (o.max ?? 3) || rt.t < S.nextT) return;
  if ((S.chkT -= dt) > 0) return;
  S.chkT = 0.5;
  let near = 0, mid = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team === P.team || u.fleeing || u.civ || u.isStruct) continue;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z;
    if (Math.abs(dx) > 80 || Math.abs(dz) > 80) continue;
    const d = Math.hypot(dx, dz);
    if (d < 25) near++;
    if (d < 80) mid++;
  }
  S.quietT = near < 3 && mid >= 10 ? S.quietT + 0.5 : 0;
  if (S.quietT < 15) return;
  S.quietT = 0;
  // 本人の前（向き）十八歩。歩けない所・枠の外なら左右へ四十五度ずつ振る
  const lim = (rt.world.def?.moveLim || rt.def?.moveLim || 176) - 10;
  let x = null, z = null;
  for (const da of [0, 0.8, -0.8, 1.6, -1.6]) {
    const h = (P.heading || 0) + da, qx = P.pos.x + Math.sin(h) * 18, qz = P.pos.z + Math.cos(h) * 18;
    if (Math.abs(qx) < lim && Math.abs(qz) < lim && rt.world.walkable?.(qx, qz) !== false && Math.abs(rt.world.heightAt(qx, qz) - P.pos.y) < 3) { x = qx; z = qz; break; }
  }
  if (x == null) { S.nextT = rt.t + 10; return; }
  const name = o.names[S.n % o.names.length];
  const L = o.look || {};
  try {
    const g = enemyGroup(rt, { faction: o.faction, name: name + 'の手', anchor: { x, z }, facing: Math.atan2(P.pos.x - x, P.pos.z - z), width: 6, aggro: 16, seekRange: 22, order: 'attack', fullStrength: true, fixed: true },
      [{ type: 'samurai', n: 1, o: { name, ...L } }, { type: 'samurai', n: 1, o: { ...L } }, { type: 'ashigaru', n: 8, o: { ...L } }]);
    if (g) for (const u of g.units) u.target = P;
  } catch (e) { console.warn('組頭の小組', e); }
  S.n++; S.nextT = rt.t + (o.gap ?? 70);
}
