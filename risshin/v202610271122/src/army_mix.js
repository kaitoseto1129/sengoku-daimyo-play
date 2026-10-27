// 軍勢の兵の割合（kaito 10/28 の表）。遠くの軽い大軍（world_army_geometry.js の armyLayout・後詰め）がこれで並ぶ。
//   槍足軽35・鉄砲足軽15・弓足軽7・旗持ち伝令など8・徒歩の侍10・騎馬武者4・侍大将組頭1・小者陣夫荷駄馬方20（%）
//   小者・陣夫・荷駄は隊の後ろ（荷駄の列・本陣の裏）に置き、前線には出さない。荷を担いで行き来する（突っ立たせない）
export const MIX = { spear: 0.35, gun: 0.15, bow: 0.07, banner: 0.08, samurai: 0.10, cavalry: 0.04, chief: 0.01, porter: 0.20 };
// 鉄砲は戦の年で変える（稲生 1556・桶狭間 1560 は少なめ、長篠 1575 以降は表どおり）。
// 史実で特別な戦は差を一行で残す。
const YEAR = {
  inou: 1556, okehazama: 1560, moribe: 1561, sunomata: 1566, inabayama: 1567, mitsukuri: 1568, okawachi: 1569,
  kanegasaki: 1570, anegawa: 1570, nodafukushima: 1570, shiga: 1570, hieizan: 1571, mikatagahara: 1572,
  tonezaka: 1573, odani: 1573, nagashima: 1574,
};
const SPECIAL = {
  nodafukushima: { gun: 0.24 },   // 本願寺・雑賀の鉄砲衆が加わる（鉄砲が多い）
  saika: { gun: 0.26 },           // 雑賀衆は鉄砲が多い
  kizugawa: { gun: 0.2 },         // 毛利水軍・本願寺は鉄砲と焙烙
  shitaragahara: { gun: 0.18 },   // 織田・徳川は鉄砲を集めた（武田の騎馬が目立つのは隊の kind 'cavalry'・寄せの横隊のまま）
  tano: { gun: 0.15 },
};
// 戦の鍵（def.battleKey）から、その戦の割合を返す。年の分からない戦（長篠以降）は表どおり
export function mixFor(key) {
  const y = YEAR[key];
  const gun = SPECIAL[key]?.gun ?? (y == null ? MIX.gun : y < 1560 ? 0.04 : y < 1566 ? 0.07 : y < 1570 ? 0.10 : y < 1575 ? 0.13 : MIX.gun);
  // 減らした鉄砲の分は槍へ
  return { ...MIX, gun, spear: MIX.spear + (MIX.gun - gun) };
}
// 兵の種類の番号（aInfo.y）：0 槍　1 鉄砲　2 弓　3 侍　4 旗持ち　5 騎馬　6 床几の大将　7 小者・陣夫（荷を担ぐ）
export const K_PORTER = 7;
