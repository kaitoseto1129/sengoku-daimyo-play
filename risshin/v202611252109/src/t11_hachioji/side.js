// ======================================================================
// 八王子城の両軍の側（K661・11/26 Sanae。手本は t05_ichinomiya/side.js）
//   元の戦（b_t11_hachioji.js・本人は前田の手）と、北条家編 h08（本人は城を守る横地監物の組）が、
//   同じ布陣（HACHI_ARMY：利家の本陣・手勢・前田の先手・利長の旗本・前田の二の手・陣立ての表）を使う。
//   SH.toyo：前田・上杉方の team（元の戦 0・h08 では 1）。SH.choso：北条方の team（元の戦 1・h08 では 0）。
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
// 陣立ての表（def.depth）の A（前田・上杉）・B（無ければ置かない）の team を側に合わせる
export function sideDepth(depth, flip) {
  return { ...depth, A: { ...depth.A, team: flip ? 1 : 0 }, ...(depth.B ? { B: { ...depth.B, team: flip ? 0 : 1 } } : {}) };
}
