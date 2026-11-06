// 第三章「徳川編」の戦の並び（kaito 11/1）。各戦の係が自分の戦を一行ずつ足す。
// 戦の def は prototype/src/b_k<番号>_<名>.js に置く。ここは並びと名前だけ。筋書きは docs/chapter3_tokugawa.md。
// 徳川編は錠で入れる：できた戦から開く。
export const TOKUGAWA_LINE = [
  { id: 'k01_fushimi', name: '伏見城の戦い', year: 1600, file: './b_k01_fushimi.js' },
  { id: 'k02_kawada', name: '河田木曽川渡河・米野の戦い', year: 1600, file: './b_k02_kawada.js' },
  { id: 'k03_gifu', name: '岐阜城の戦い', year: 1600, file: './b_k03_gifu.js' },
  { id: 'k04_kuisegawa', name: '杭瀬川の戦い', year: 1600, file: './b_k04_kuisegawa.js' },
  { id: 'k05_ueda', name: '第二次上田合戦', year: 1600, file: './b_k05_ueda.js' },
  { id: 'k06_sekigahara', name: '関ヶ原の戦い', year: 1600, file: './b_k06_sekigahara.js' },
  { id: 'k07_sawayama', name: '佐和山城の戦い', year: 1600, file: './b_k07_sawayama.js' },
  { id: 'k08_osaka_kizu', name: '大坂冬の陣・木津川口の戦い', year: 1614, file: './b_k08_osaka_kizu.js' },
  { id: 'k09_imafuku', name: '今福の戦い', year: 1614, file: './b_k09_imafuku.js' },
  { id: 'k10_shigino', name: '鴫野の戦い', year: 1614, file: './b_k10_shigino.js' },
  { id: 'k11_sanadamaru', name: '真田丸の戦い', year: 1614, place: '大坂城の南、真田丸の前', file: './b_k11_sanadamaru.js' },
  { id: 'k12_kashii', name: '樫井の戦い', year: 1615, place: '和泉の樫井', file: './b_k12_kashii.js' },
  { id: 'k13_domyoji', name: '道明寺の戦い', year: 1615, file: './b_k13_domyoji.js' },
  { id: 'k14_yao_wakae', name: '八尾・若江の戦い', year: 1615, file: './b_k14_yao_wakae.js' },
  { id: 'k15_tennoji_okayama', name: '天王寺・岡山の戦い', year: 1615, file: './b_k15_tennoji_okayama.js' },
  // 秘密の最後の戦（もしもの戦）。15戦に勝つと開く（tokugawa_secret.js）。本陣では虹色の縁の札
  //   noKubi：勝った後の首実検の場面（影絵の板の絵）を出さない。総大将の自分が家康を討った締めは、戦の中の勝鬨と出世の道で済ませる
  { id: 'k16_secret', name: '淀の野の戦い', year: 1615, place: '淀の野', secret: true, noKubi: true, file: './b_k16_secret.js' },
];

// 徳川編の出世の段（docs/chapter3_tokugawa.md「出世と軍勢」）。出世の道（state.js の LADDER）の段の番号。
// 関ヶ原までは侍大将、冬の陣は部将、夏の陣は家老として二〜三万の軍に加わり、秘密の戦は国持大名として二万を率いる
export function tokuStep(id) {
  const n = +String(id || '').slice(1, 3) || 0;
  return n >= 16 ? 7 : n >= 12 ? 5 : n >= 8 ? 4 : 3;
}
