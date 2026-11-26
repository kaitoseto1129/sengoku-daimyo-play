// ======================================================================
// 八尾・若江の両軍の側（K661・11/25 Sanae。shitaragahara/side.js と同じ型・合戦の部品箱 ③ 側の入れ替え）
//   元の戦（b_k14_yao_wakae.js・本人は井伊の手）と、長宗我部編 c15（本人は長宗我部の手）が、同じ setup・update を使う。
//   兵の置き方・数・段・伏せ槍・藤堂の二将の討死・若江の三段・木村の最期・長宗我部の退きは一つのまま。違うのは「どちらが team 0 か」だけ。
//   SH.tok：徳川方の team（元の戦 0・c15 では 1）。SH.osk：大坂方の team（元の戦 1・c15 では 0）。
//   shMe(rt)：元の筋で「本人」を見て段を進める所。c15 では元の本人（井伊の手）が任務の印を追って歩いたであろう者（SH.ghost）。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, tok: 0, osk: 1, ghost: null, me: null };
export function shSide(flip) {
  SH.flip = !!flip; SH.tok = flip ? 1 : 0; SH.osk = flip ? 0 : 1;
  SH.ghost = null; SH.me = null;   // 戦ごとに作り直す（前の戦の所を持ち越さない）
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.tok } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.osk } : o, list);
// 元の本人の代わり（c15）：任務の印へ毎秒 speed m で歩く（段を進める物差しとしてだけ使う。描かない・斬られない）
export function shGhostTick(rt, dt, pin, start, speed = 6) {
  if (!SH.flip) return;
  const G = SH.ghost || (SH.ghost = { x: start?.x ?? 0, y: 0, z: start?.z ?? 0 });
  if (!pin) return;
  const dx = pin.x - G.x, dz = pin.z - G.z, d = Math.hypot(dx, dz), s = Math.min(d, speed * dt);
  if (d > 0.01) { G.x += dx / d * s; G.z += dz / d * s; }
}
export function shMe(rt) {
  if (!SH.flip) return rt.player.u;
  const M = SH.me || (SH.me = { alive: true, hp: 110, maxHp: 110, isGhost: true, heading: -Math.PI / 2 });
  M.pos = SH.ghost || rt.player.u.pos; M.team = SH.tok;
  return M;
}
