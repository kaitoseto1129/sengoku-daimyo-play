// ======================================================================
// 桶狭間の両軍の側（K661・11/25 Sanae）。shitaragahara/side.js を写した物（docs/battle_kit.md ③兵と布陣・側の入れ替え）
//   元の戦（b_okehazama.js・本人は織田の槍組の足軽）と、今川家編 i10（本人は今川義元の旗本の足軽）が、同じ setup・update を使う。
//   兵の置き方・行軍の四組・馬廻・松井の先手・井伊・旗本の囲み・雨・十五分の出来事（okehazama/*.js）は一つのまま。違うのは「どちらが team 0 か」だけ。
//   SH.oda：織田の team（元の戦 0・i10 では 1）。SH.ima：今川の team（元の戦 1・i10 では 0）。
//   shMe(rt)：元の筋で「本人」を見て段を進める所。i10 では元の本人（織田の足軽）の代わりの者（SH.ghost＝任務の印を追って歩く所・側は織田）。
// ======================================================================
export const SH = { flip: false, oda: 0, ima: 1, ghost: null, me: null };
export function shSide(flip) {
  SH.flip = !!flip; SH.oda = flip ? 1 : 0; SH.ima = flip ? 0 : 1;
  if (!flip) { SH.ghost = null; SH.me = null; }
  return SH.flip;
}
export const shPos = (rt) => (SH.flip && SH.ghost ? SH.ghost : rt.player.u.pos);
// 元の本人の代わり（i10）：任務の印へ毎秒 speed m で歩く。段を進める物差しとしてだけ使う（兵ではない・当たらない）
export function shGhostTick(rt, dt, pin, speed = 5) {
  if (!SH.flip) return;
  const G = SH.ghost || (SH.ghost = { x: pin?.x ?? 0, y: 0, z: pin?.z ?? 0 });
  if (!pin) return;
  const dx = pin.x - G.x, dz = pin.z - G.z, d = Math.hypot(dx, dz), s = Math.min(d, speed * dt);
  if (d > 0.01) { G.x += dx / d * s; G.z += dz / d * s; }
  G.y = rt.world?.heightAt ? rt.world.heightAt(G.x, G.z) : 0;
}
export function shMe(rt) {
  if (!SH.flip) return rt.player.u;
  const M = SH.me || (SH.me = { alive: true, hp: 110, maxHp: 110, isGhost: true, heading: 0, name: '' });
  M.pos = SH.ghost || rt.player.u.pos; M.team = SH.oda;
  return M;
}
