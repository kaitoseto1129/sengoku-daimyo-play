// 第二章「豊臣編」の戦の並び（kaito 11/1）。各戦の係が自分の戦を一行ずつ足す。
// 戦の def は prototype/src/b_t<番号>_<名>.js に置く。ここは並びと名前だけ。
export const TOYOTOMI_LINE = [
  { id: 't01_yamazaki', name: '山崎の戦い', year: 1582, file: './b_t01_yamazaki.js' },
  { id: 't02_shizugatake', name: '賤ヶ岳の戦い', year: 1583, file: './b_t02_shizugatake.js' },
  { id: 't03_komaki', name: '小牧の対陣', year: 1584, file: './b_t03_komaki.js', place: '尾張国 楽田・二重堀' },
  { id: 't03b_nagakute', name: '小牧・長久手 二', year: 1584, file: './b_t03b_nagakute.js', place: '尾張国 長久手' },
  { id: 't04a_sengokubori', name: '紀州征伐／千石堀城', year: 1585, file: './b_t04_kishu.js', cap: 200, place: '和泉国 千石堀城', ceil: 4 },
  { id: 't04_negoro', name: '紀州征伐／根来寺', year: 1585, file: './b_t04_negoro.js', cap: 240, place: '紀伊国 根来寺', ceil: 4 },
  { id: 't04b_ota', name: '紀州征伐／太田城', year: 1585, file: './b_t04_kishu.js', cap: 180, place: '紀伊国 太田城', ceil: 4 },
  { id: 't05_ichinomiya', name: '四国征伐／一宮城', year: 1585, file: './b_t05_ichinomiya.js' },
  { id: 't06_hetsugi', name: '戸次川の戦い', year: 1586, file: './b_t06_hetsugi.js' },
  { id: 't07_ganjaku', name: '岩石城攻め', year: 1587, file: './b_t07_ganjaku.js' },
  { id: 't08_nejirozaka', name: '根白坂の戦い', year: 1587, file: './b_t08_nejirozaka.js' },
  { id: 't09_yamanaka', name: '山中城の戦い', year: 1590, file: './b_t09_yamanaka.js' },
  { id: 't10_oshi', name: '忍城攻め', year: 1590, file: './b_t10_oshi.js', place: '武蔵国 忍城', winWord: '忍城、開城', victoryCaption: '水攻めでは落とせず、小田原開城の後に明け渡された' },
  { id: 't11_hachioji', name: '八王子城の戦い', year: 1590, file: './b_t11_hachioji.js' },
  { id: 't12_odawara', name: '小田原征伐', year: 1590, file: './b_t12_odawara.js', place: '相模国 小田原城' },
];
