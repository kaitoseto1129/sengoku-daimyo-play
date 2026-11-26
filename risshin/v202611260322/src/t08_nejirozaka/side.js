// ======================================================================
// 根白坂の両軍の側（K661・11/26 Sanae。手本は t05_ichinomiya/side.js）
//   元の戦（b_t08_nejirozaka.js・本人は砦を守る宮部の手）と、島津家編 s06（本人は夜襲する島津の足軽）が、
//   同じ布陣（NEJIRO_ARMY：坂の下の島津義珍の本陣と控え・宮部継潤の本陣・宮部の手・塀の内の鉄砲・陣立ての表）を使う。
//   SH.toyo：豊臣方の team（元の戦 0・s06 では 1）。SH.choso：島津方の team（元の戦 1・s06 では 0）。
//   合戦の部品箱（docs/battle_kit.md ③兵と布陣）：側の入れ替え。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, toyo: 0, choso: 1 };
export function shSide(flip) {
  SH.flip = !!flip; SH.toyo = flip ? 1 : 0; SH.choso = flip ? 0 : 1;
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.toyo } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.choso } : o, list);
// 陣立ての表（def.depth）の A（豊臣）・B（島津）の team を側に合わせる
export function sideDepth(depth, flip) {
  return { ...depth, A: { ...depth.A, team: flip ? 1 : 0 }, ...(depth.B ? { B: { ...depth.B, team: flip ? 0 : 1 } } : {}) };
}
