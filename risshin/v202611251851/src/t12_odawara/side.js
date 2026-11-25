// ======================================================================
// 小田原の陣の両軍の側（K661・11/25 Sanae。手本は shitaragahara/side.js）
//   元の戦（b_t12_odawara.js・本人は豊臣＝井伊の手）と、北条家編 h10（本人は総構えの内の北条）・伊達家編 e06（豊臣の陣へ参る）が、
//   同じ布陣（ODAWARA_ARMY：井伊・松平の手・囲みの陣の見張り・篠曲輪の鉄砲・総構えの土塁の守り・家康の旗本・北条の本丸・陣立ての表）を使う。
//   SH.toyo：豊臣方の team（元の戦と e06 は 0・h10 は 1）。SH.hojo：北条方の team（元の戦と e06 は 1・h10 は 0）。
//   allyGroup・enemyGroup：元の戦の「豊臣方の組」「北条方の組」を作る所。h10 では team だけを入れ替える（数と組の中身は同じ）。
//   合戦の部品箱（docs/battle_kit.md ③兵と布陣）：側の入れ替え。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, toyo: 0, hojo: 1 };
export function shSide(flip) {
  SH.flip = !!flip; SH.toyo = flip ? 1 : 0; SH.hojo = flip ? 0 : 1;
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.toyo } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.hojo } : o, list);
// 陣立ての表（def.depth）の A（豊臣）・B（北条）の team を側に合わせる。noHojo：北条の側を置かない（e06 は豊臣の陣だけ）
export function sideDepth(depth, flip, noHojo = false) {
  const A = { ...depth.A, team: flip ? 1 : 0 }, B = noHojo ? undefined : { ...depth.B, team: flip ? 0 : 1 };
  return { ...depth, A, B };
}
