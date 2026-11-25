// ======================================================================
// 設楽原の両軍の側（K661・11/25 Sanae）
//   元の戦（b_shitaragahara.js・本人は織田・徳川の柵の内）と、武田編 d11（本人は武田の寄せ手）が、同じ setup・update を使う。
//   兵の置き方・鉄砲の段・竹束・柵の持ち場・後詰・大将・波の筋は一つのまま。違うのは「どちらの側が team 0（本人の側）か」だけ。
//   SH.oda：織田・徳川の team（元の戦 0・d11 では 1）。SH.tak：武田の team（元の戦 1・d11 では 0）。
//   allyGroup・enemyGroup：元の戦の「味方の組（織田・徳川）」「敵の組（武田）」を作る所。d11 では team だけを入れ替える（数と組の中身は同じ）。
//   shPos(rt)：元の筋で「本人の居る所」を見て段を進める所。d11 では本人は武田の側にいるので、
//     元の本人が任務の印（nfPinPoint）を追って歩いたであろう所（SH.ghost）を使う＝段は元の戦と同じ順・同じ間で進む。
//   合戦の部品箱（docs/battle_kit.md ③兵と布陣）：側の入れ替え。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, oda: 0, tak: 1, ghost: null };
export function shSide(flip) {
  SH.flip = !!flip; SH.oda = flip ? 1 : 0; SH.tak = flip ? 0 : 1;
  if (!flip) SH.ghost = null;
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.oda } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.tak } : o, list);
export const shPos = (rt) => (SH.flip && SH.ghost ? SH.ghost : rt.player.u.pos);
// 元の本人の代わり（d11）：任務の印へ毎秒 speed m で歩く。柵や川で止まらない（段を進める物差しとしてだけ使う）
export function shGhostTick(rt, dt, pin, speed = 5) {
  if (!SH.flip) return;
  const G = SH.ghost || (SH.ghost = { x: pin?.x ?? -10, y: 0, z: pin?.z ?? 0 });
  if (!pin) return;
  const dx = pin.x - G.x, dz = pin.z - G.z, d = Math.hypot(dx, dz), s = Math.min(d, speed * dt);
  if (d > 0.01) { G.x += dx / d * s; G.z += dz / d * s; }
}
// 元の本人の代わりの者（d11）：段を進める所が見る「本人」。所は SH.ghost、側は織田・徳川
export function shMe(rt) {
  if (!SH.flip) return rt.player.u;
  const M = SH.me || (SH.me = { alive: true, hp: 110, maxHp: 110, isGhost: true, heading: Math.PI / 2 });
  M.pos = SH.ghost || rt.player.u.pos; M.team = SH.oda;
  return M;
}
