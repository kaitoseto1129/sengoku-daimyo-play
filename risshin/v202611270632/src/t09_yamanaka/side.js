// ======================================================================
// 山中城の両軍の側（K661・11/26 Sanae。手本は t05_ichinomiya/side.js）
//   元の戦（b_t09_yamanaka.js・本人は秀次の寄せ手）と、北条家編 h15（本人は城を守る北条の組）が、
//   同じ布陣（YAMA_ARMY：一柳・中村・堀・山内の隊・秀次の旗本と本陣・岱崎出丸の間宮康俊の隊・竹束の後ろの鉄砲組・陣立ての表）を使う。
//   SH.toyo：豊臣方の team（元の戦 0・h15 では 1）。SH.choso：北条方の team（元の戦 1・h15 では 0）。
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
// 陣立ての表（def.depth）の A（豊臣）・B（北条）の team を側に合わせる
export function sideDepth(depth, flip) {
  if (!depth) return undefined;   // 山中城は陣立ての表を持たない（布陣の表 FUJIN だけ）
  return { ...depth, A: { ...depth.A, team: flip ? 1 : 0 }, ...(depth.B ? { B: { ...depth.B, team: flip ? 0 : 1 } } : {}) };
}
