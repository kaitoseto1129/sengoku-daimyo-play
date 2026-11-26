// ======================================================================
// 一宮城の両軍の側（K661・11/25 Sanae。手本は t12_odawara/side.js）
//   元の戦（b_t05_ichinomiya.js・本人は羽柴秀長の手）と、長宗我部家編 c06（本人は城を守る長宗我部）が、
//   同じ布陣（ICHI_ARMY：秀長の旗本・蜂須賀の手・手勢の先手と二陣・蜂須賀正勝の旗本・陣立ての表）を使う。
//   SH.toyo：羽柴方の team（元の戦 0・c06 では 1）。SH.choso：長宗我部方の team（元の戦 1・c06 では 0）。
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
// 陣立ての表（def.depth）の A（羽柴）・B（長宗我部）の team を側に合わせる
export function sideDepth(depth, flip) {
  return { ...depth, A: { ...depth.A, team: flip ? 1 : 0 }, B: { ...depth.B, team: flip ? 0 : 1 } };
}
