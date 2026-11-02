// 第三章「徳川編」の戦の並び（kaito 11/1）。各戦の係が自分の戦を一行ずつ足す。
// 戦の def は prototype/src/b_k<番号>_<名>.js に置く。ここは並びと名前だけ。筋書きは docs/chapter3_tokugawa.md。
export const TOKUGAWA_LINE = [
  { id: 'k01_fushimi', name: '伏見城の戦い', year: 1600, file: './b_k01_fushimi.js' },
  { id: 'k02_kawada', name: '河田木曽川渡河・米野の戦い', year: 1600, file: './b_k02_kawada.js' },
  { id: 'k03_gifu', name: '岐阜城の戦い', year: 1600, file: './b_k03_gifu.js' },
  { id: 'k08_osaka_kizu', name: '大坂冬の陣・木津川口の戦い', year: 1614, file: './b_k08_osaka_kizu.js' },
  { id: 'k07_sawayama', name: '佐和山城の戦い', year: 1600, file: './b_k07_sawayama.js' },
  { id: 'k12_kashii', name: '樫井の戦い', year: 1615, file: './b_k12_kashii.js' },
  { id: 'k11_sanadamaru', name: '真田丸の戦い', year: 1614, file: './b_k11_sanadamaru.js' },
];
