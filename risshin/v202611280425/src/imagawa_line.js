// 今川家編「大軍の綻び」（H3・K637・docs/house_imagawa.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
//   戦の def は prototype/src/b_i<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。
//   この家だけの仕組み「大軍の綻び」（備の間の金の帯。進むと細り、号令を届けると太く戻り、雨の中で切れる）は b_i10_okehazama.js の obiTick
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_imagawa.js').then((m) => addEn(m.default)).catch(() => {});   // K516：今川家編の画面の字の英訳（英語の時だけ読む）
export const IMAGAWA_LINE = [
  // K647（11/25 Sanae）：一〜六戦目（義元の世の前半・花倉から福谷まで）。福谷は善徳寺の会盟（戦でない）の替わり＝docs/house_imagawa.md ⑥
  { id: 'i01_hanakura', town: '駿府', name: '花倉の乱', year: 1536, place: '駿河国 花倉城', file: './b_i01_hanakura.js', townWhen: '天文五年　六月' },
  { id: 'i02_azukizaka1', town: '駿府', name: '第一次小豆坂の戦い', year: 1542, place: '三河国 小豆坂', file: './b_i02_azukizaka1.js', townWhen: '天文十一年　八月' },
  { id: 'i03_tahara', town: '駿府', name: '田原城の戦い', year: 1547, place: '三河国 田原城', file: './b_i03_tahara.js', townWhen: '天文十六年　九月' },
  { id: 'i04_azukizaka2', town: '駿府', name: '第二次小豆坂の戦い', year: 1548, place: '三河国 小豆坂', file: './b_i04_azukizaka2.js', townWhen: '天文十七年　三月' },
  { id: 'i05_anjo', town: '駿府', name: '安城城の戦い', year: 1549, place: '三河国 安城城', file: './b_i05_anjo.js', townWhen: '天文十八年　十一月' },
  { id: 'i06_fukaya', town: '駿府', name: '福谷城の戦い', year: 1556, place: '三河国 福谷城', file: './b_i06_fukaya.js', townWhen: '弘治二年　三月' },
  // H3（11/25 Sanae）：七〜九戦目（元康の初陣・大高の兵糧入れ・丸根と鷲津）。城下は駿府の噂だけ（house_towns.js）。年の順に十戦目の前へ並べる
  { id: 'i07_terabe', town: '駿府', name: '寺部城の戦い', year: 1558, place: '三河国 寺部城', file: './b_i07_terabe.js', townWhen: '永禄元年　二月' },
  { id: 'i08_otaka', town: '駿府', name: '大高城の兵糧入れ', year: 1560, place: '尾張国 大高城', file: './b_i08_otaka.js', townWhen: '永禄三年　五月' },
  { id: 'i09_marune', town: '駿府', name: '丸根・鷲津砦の戦い', year: 1560, place: '尾張国 丸根・鷲津', file: './b_i09_marune.js', townWhen: '永禄三年　五月' },
  // H3（11/24 Sanae）：最初の一戦は十戦目の桶狭間（今川の側）。織田家編の桶狭間の裏（同じ地形・同じ雨）。
  //   前は夕刻の駿府の城下。永禄三年（1560）五月十二日、義元は駿府を発った（『信長公記』A・今川の動きは通説 C）。
  //   足軽は今川館の評定に入れない。上官屋敷の前で、組頭から尾張の話を聞く（town_depart.js eveSetup をそのまま使う。甲府・春日山と同じ手。形・音は足さない）
  { id: 'i10_okehazama', town: '駿府', name: '桶狭間の戦い', year: 1560, place: '尾張国 桶狭間', file: './b_i10_okehazama.js', townWhen: '永禄三年　五月',
    eve: { who: '組頭 弥次郎', tod: 0, obj: '上官屋敷の前で、組頭から尾張の話を聞く',
      lines: ['御屋形様が、尾張へ出られる。二万五千の大軍じゃ', '尾張の織田は、兵が二千か三千。砦を落とせば、道は開く', 'じゃが、大軍は列が長う伸びる。前と後ろが離れぬよう、走る者が要る'],
      card: '弥次郎「列を切らすな。切れた所から、敵は入る」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 弥次郎', '館の庭で、まだ鞠の音がしておる。のどかなものよ', 2.8] } },
  // K647（11/25 Sanae）：十一〜十五戦目（桶狭間の後・氏真の代。掛川城の明け渡しまで）
  { id: 'i11_kariya', town: '駿府', name: '刈谷城の戦い', year: 1560, place: '三河国 刈谷城', file: './b_i11_kariya.js', townWhen: '永禄三年　五月' },
  { id: 'i12_ushikubo', town: '駿府', name: '牛久保城の戦い', year: 1561, place: '三河国 牛久保城', file: './b_i12_ushikubo.js', townWhen: '永禄四年　四月' },
  { id: 'i13_hikuma', town: '駿府', name: '曳馬城の戦い', year: 1564, place: '遠江国 曳馬城', file: './b_i13_hikuma.js', townWhen: '永禄七年' },
  { id: 'i14_satta', town: '駿府', name: '薩埵峠の戦い', year: 1568, place: '駿河国 薩埵峠', file: './b_i14_satta.js', townWhen: '永禄十一年　十二月' },
  { id: 'i15_kakegawa', town: '駿府', name: '掛川城の戦い', year: 1569, place: '遠江国 掛川城', file: './b_i15_kakegawa.js', townWhen: '永禄十二年' },
];
