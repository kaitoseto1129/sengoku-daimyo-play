// 武将ごとの主兵種と言葉（K601・docs/kaito_online_units_1121.md 3〜6・46〜47）。一人の武将＝その兵種だけの約1000人の一部隊。
//   主兵種は武将の表（bushou_online.js）の fav から読む（騎馬重視→騎馬・鉄砲重視→鉄砲・槍重視／守備／標準→槍）。弓の将は下の表で決める。
//   表に unit が書かれたら（登用の係が足した時）それを先に使う。言葉は編成の絞り（［騎馬］［鉄砲］［槍］［弓］［攻勢］［守備］［伏兵］）に使う。
export const TROOPS = 1000;
// K624⑤（kaito 11/22「全員1000人でなく、SS・S ほど率いる兵を多く。6000対6000である必要は無い」）：格で率いる兵を変える。
//   格の Cost（N10・R12・SR16・SSR22。11/24 前は A15・S18・SS22）と釣り合う目安。総兵力は軍団ごとに違ってよい（対戦は同じ将の数・同じ Cost の上限どうし）。
//   本物の兵（army4k の REAL4K・携帯 420 まで）は兵の数に寄らないので、iPhone の重さは変わらない（多い隊は軽い群れと名目の数で厚く見せる）
// 11/24 格を四つに：SR は前の A1000 と S1500 の間の1250（初めの4人の合計は前と同じ5100）。前の名の札も読む
export const TROOPS_BY_RANK = { N: 600, R: 800, SR: 1250, SSR: 2000, A: 1250, S: 1250, SS: 2000 };
/** 武将（{ rank } か { rarity } か { rare }）か格の字から、率いる兵の数 */
export const troopsOf = (b) => TROOPS_BY_RANK[typeof b === 'string' ? b : b?.rank || b?.rarity || b?.rare] || TROOPS;
export const UNITS = {
  kiba: { id: 'kiba', name: '騎馬' }, teppo: { id: 'teppo', name: '鉄砲' }, yari: { id: 'yari', name: '槍' }, yumi: { id: 'yumi', name: '弓' },
};
const YUMI = new Set(['小早川隆景', '乃美宗勝', '村上武吉', '毛利元就', '上杉景勝']);
const AMBUSH = new Set(['真田昌幸', '真田信繁', '島津家久', '服部半蔵', '山本勘助', '毛利元就', '黒田官兵衛', '宇佐美定満', '島津義弘', '本多正信']);
const FROM_FAV = { kiba: 'kiba', teppo: 'teppo', yari: 'yari', shubi: 'yari', std: 'yari' };
export function unitOf(b) {
  if (!b) return UNITS.yari;
  if (b.unit && UNITS[b.unit]) return UNITS[b.unit];
  if (YUMI.has(b.name)) return UNITS.yumi;
  return UNITS[FROM_FAV[b.fav] || 'yari'];
}
export function keywordsOf(b) {
  if (!b) return [];
  const u = unitOf(b), k = [u.name];
  const rank = b.rank || b.rare;
  if (b.fav === 'shubi') k.push('守備'); else if (u.id === 'kiba' || (u.id === 'yari' && (rank === 'SR' || rank === 'SSR' || rank === 'S' || rank === 'SS'))) k.push('攻勢');
  if (AMBUSH.has(b.name)) k.push('伏兵');
  return k;
}
// 兵種の小さな絵（字だけに頼らない）
const ICON = {
  kiba: '<path d="M5 20v-7l3-6 5-2 3 3h3l-1 3-3 1-1 8"/><path d="M8 13h8"/>',
  teppo: '<path d="M2 12h15l4-2v3l-4 1H9l-2 4H5l1-4H2z"/>',
  yari: '<path d="M4 20 18 6"/><path d="m18 6 3-4-4 1z"/>',
  yumi: '<path d="M7 3c8 4 8 14 0 18"/><path d="M7 3v18"/><path d="M7 12h12"/>',
};
export const unitIcon = (id, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;flex:none">${ICON[id] || ICON.yari}</svg>`;
