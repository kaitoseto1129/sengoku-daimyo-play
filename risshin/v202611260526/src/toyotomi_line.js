// 第二章「豊臣編」の戦の並び（kaito 11/1）。各戦の係が自分の戦を一行ずつ足す。
// 戦の def は prototype/src/b_t<番号>_<名>.js に置く。ここは並びと名前だけ。
export const TOYOTOMI_LINE = [
  { id: 't01_yamazaki', town: '姫路', name: '山崎の戦い', year: 1582, file: './b_t01_yamazaki.js' },
  // 11/24 Sanae：山崎の後（賤ヶ岳の前）は歩く長浜の城下（甲府・春日山と同じ手・main.js houseBefore）。天正十一年三月、柴田勝家が雪の中を柳ヶ瀬へ出て、
  //   秀吉は長浜から余呉湖のまわりに砦を構えた（賤ヶ岳の戦いの history）。足軽は城の軍議に入れない。上官屋敷の前で組頭から聞く（形・音は足さない）
  { id: 't02_shizugatake', town: '長浜', townWhen: '天正十一年　三月', name: '賤ヶ岳の戦い', year: 1583, file: './b_t02_shizugatake.js',
    eve: { who: '組頭 小助', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く',
      lines: ['筑前様が長浜の城で軍議を開かれた。柴田様が雪を踏み分けて、柳ヶ瀬まで出て来られたそうじゃ', '余呉の湖のまわりの山に砦を構えて、北国街道を塞ぐ。わしらは桑山様の手で賤ヶ岳に入る', '軍議は城の奥で決まる。わしら足軽は、門の外で篝火を仰ぐだけじゃ'],
      card: '小助「雪が解ければ柴田様が来る。砦の柵から離れるな」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 小助', '草鞋を替えておけ。余呉の山道はぬかるむぞ', 2.6] } },
  { id: 't03_komaki', town: '大坂', name: '小牧・長久手 一', year: 1584, file: './b_t03_komaki.js', place: '尾張国 楽田・二重堀' },
  { id: 't03b_nagakute', town: '犬山', name: '小牧・長久手 二', year: 1584, file: './b_t03b_nagakute.js', place: '尾張国 長久手' },
  { id: 't04a_sengokubori', town: '岸和田', name: '紀州征伐／千石堀城', year: 1585, file: './b_t04_kishu.js', cap: 200, place: '和泉国 千石堀城', ceil: 4 },
  { id: 't04_negoro', town: '岸和田', name: '紀州征伐／根来寺', year: 1585, file: './b_t04_negoro.js', cap: 240, place: '紀伊国 根来寺', ceil: 4 },
  { id: 't04b_ota', town: '岸和田', name: '紀州征伐／太田城', year: 1585, file: './b_t04_kishu.js', cap: 180, place: '紀伊国 太田城', ceil: 4 },
  { id: 't05_ichinomiya', town: '堺', townPlace: '堺の湊', name: '四国征伐／一宮城', year: 1585, file: './b_t05_ichinomiya.js' },
  { id: 't06_hetsugi', town: '府内', townPlace: '豊後府内の町', name: '戸次川の戦い', year: 1586, file: './b_t06_hetsugi.js' },
  { id: 't07_ganjaku', town: '小倉', name: '岩石城攻め', year: 1587, file: './b_t07_ganjaku.js' },
  { id: 't08_nejirozaka', town: '府内', townPlace: '豊後府内の町', name: '根白坂の戦い', year: 1587, file: './b_t08_nejirozaka.js', place: '日向国 根白坂の砦' },
  { id: 't09_yamanaka', town: '沼津', name: '山中城の戦い', year: 1590, file: './b_t09_yamanaka.js' },
  { id: 't10_oshi', town: '館林', name: '忍城攻め', year: 1590, file: './b_t10_oshi.js', place: '武蔵国 忍城', winWord: '忍城、開城', victoryCaption: '水攻めでは落とせず、小田原開城の後に明け渡された' },
  { id: 't11_hachioji', town: '鉢形', name: '八王子城の戦い', year: 1590, file: './b_t11_hachioji.js' },
  { id: 't12_odawara', town: '沼津', name: '小田原征伐', year: 1590, file: './b_t12_odawara.js', place: '相模国 小田原城' },
];
