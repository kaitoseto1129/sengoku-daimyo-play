// ======================================================================
// 手取川の両軍の側（K661・11/25 Sanae。手本は shitaragahara/side.js）
//   元の戦（b_tedorigawa.js・本人は柴田の殿の足軽）と、上杉家編 u12（本人は上杉の追手）が、同じ布陣（TEDO_ARMY：柴田・丹羽・前田の手・殿と弓組・
//   先に退く足軽・北の後衛・陣立ての表の遠景の大軍・滝川と謙信の本陣・謙信の馬廻・上杉の物見の先手・追手の列・上杉の後方の将）を使う。
//   SH.oda：織田方の team（元の戦 0・u12 では 1）。SH.ue：上杉方の team（元の戦 1・u12 では 0）。
//   合戦の部品箱（docs/battle_kit.md ③兵と布陣）：側の入れ替え。
// ======================================================================
import { allyGroup as allyGroup0, enemyGroup as enemyGroup0 } from '../bhelp.js';

export const SH = { flip: false, oda: 0, ue: 1 };
export function shSide(flip) {
  SH.flip = !!flip; SH.oda = flip ? 1 : 0; SH.ue = flip ? 0 : 1;
  return SH.flip;
}
export const allyGroup = (rt, o, list) => allyGroup0(rt, SH.flip ? { ...o, team: SH.oda } : o, list);
export const enemyGroup = (rt, o, list) => enemyGroup0(rt, SH.flip ? { ...o, team: SH.ue } : o, list);
