// ======================================================================
// 高遠城の両軍の側（K661・11/25 Sanae。nagashinojo/side.js を写した物＝docs/battle_kit.md ③側の入れ替え）
//   元の戦（b_takato.js・b_takato_siege.js・本人は織田の寄せ手）と、武田編 d14（本人は仁科の城兵）が、同じ setup・update を使う。
//   SH.oda：寄せ手の織田の team（元の戦 0・d14 では 1）。SH.tak：城兵の武田（仁科）の team（元の戦 1・d14 では 0）。
//   allyGroup・enemyGroup：元の戦の「織田の組」「城兵の組」を作る所。d14 では team だけを入れ替える（数と組の中身は同じ）。
//   shPos(rt)：元の筋で「本人の居る所」を見て段を進める所。d14 では、元の本人（織田の寄せ手）が寄せ道と任務の印を追って歩いたであろう所（SH.ghost）。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, oda: 0, tak: 1, ghost: null, me: null };
export function shSide(flip) {
  SH.flip = !!flip; SH.oda = flip ? 1 : 0; SH.tak = flip ? 0 : 1;
  SH.ghost = null; SH.me = null;   // 戦ごとに置き直す（前の戦の所を引き継がない）
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.oda } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.tak } : o, list);
export const shPos = (rt) => (SH.flip && SH.ghost ? SH.ghost : rt.player.u.pos);
// 元の本人の代わり（d14）：印へ毎秒 speed m で歩く。塀や崖で止まらない（段を進める物差しとしてだけ使う）
export function shGhostTick(rt, dt, pin, speed = 5) {
  if (!SH.flip) return;
  const G = SH.ghost || (SH.ghost = { x: pin?.x ?? 0, y: 0, z: pin?.z ?? 0 });
  if (!pin) return;
  const dx = pin.x - G.x, dz = pin.z - G.z, d = Math.hypot(dx, dz), s = Math.min(d, speed * dt);
  if (d > 0.01) { G.x += dx / d * s; G.z += dz / d * s; }
}
// 元の本人の代わりの者（d14）：段を進める所が見る「本人」。所は SH.ghost、側は織田
export function shMe(rt) {
  if (!SH.flip) return rt.player.u;
  const M = SH.me || (SH.me = { alive: true, hp: 110, maxHp: 110, isGhost: true, heading: Math.PI });
  M.pos = SH.ghost || rt.player.u.pos; M.team = SH.oda;
  return M;
}
