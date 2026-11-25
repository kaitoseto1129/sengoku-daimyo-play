// 長宗我部家編「一領具足」（H3・K637・docs/house_chosokabe.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
//   戦の def は prototype/src/b_c<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。
//   この家だけの仕組み「一領具足の呼び集め」（法螺の台で田の畦の農兵を呼び、味方の備を太らせる）は b_c04_nakatomi.js の callUp
//   残りの九戦（c01 長浜・c02 朝倉・c03 渡川・c05 十河城・c06 一宮城・c07 戸次川・c08 小田原・c09 朝鮮・c10 関ヶ原 南宮山）は紙の②に名だけ。作ったらここへ足す
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_chosokabe.js').then((m) => addEn(m.default)).catch(() => {});   // K516：長宗我部家編の画面の字の英訳（英語の時だけ読む）
export const CHOSOKABE_LINE = [
  // K647（11/25 Sanae）：十五戦に。共通の部品は chosokabe_kit.js（呼び集めの写し）。並びは年の順（docs/house_chosokabe.md ②'）
  { id: 'c01_nagahama', town: '岡豊', townWhen: '永禄三年　五月', name: '長浜の戦い', year: 1560, place: '土佐国 長浜', file: './b_c01_nagahama.js' },
  { id: 'c02_asakura', town: '岡豊', townWhen: '永禄五年　九月', name: '朝倉城の戦い', year: 1562, place: '土佐国 朝倉', file: './b_c02_asakura.js' },
  { id: 'c11_yanagare', town: '岡豊', townWhen: '永禄十二年　七月', name: '八流の戦い', year: 1569, place: '土佐国 安芸 八流', file: './b_c11_yanagare.js' },
  { id: 'c03_shimanto', town: '岡豊', townWhen: '天正三年　秋', name: '渡川の戦い', year: 1575, place: '土佐国 渡川', file: './b_c03_shimanto.js' },
  { id: 'c12_okamoto', town: '岡豊', townWhen: '天正七年　五月', name: '岡本城の戦い', year: 1579, place: '伊予国 三間 岡本城', file: './b_c12_okamoto.js' },
  // H3（11/24 Sanae）：一戦目 中富川（天正十年〔1582〕八月）。前と後は夕刻の岡豊の城下（山城の麓・田の広がり）。上官屋敷の前で組頭から聞く（town_depart.js eveSetup）
  { id: 'c04_nakatomi', town: '岡豊', name: '中富川の戦い', year: 1582, place: '阿波国 中富川', file: './b_c04_nakatomi.js', townWhen: '天正十年　八月',
    eve: { who: '組頭 弥次兵衛', tod: 0, obj: '上官屋敷の前で、組頭から阿波攻めの話を聞く',
      lines: ['元親様が、阿波の十河存保を討つと決められた', '土佐中の一領具足に、触れが回る。田の者らは、槍と具足を畦に置いて寝ておる', '法螺が鳴れば、鍬を捨てて槍を取る。それが土佐の兵じゃ'],
      card: '弥次兵衛「法螺の台へ一番に走れ。遅れれば、皆が田へ帰ってしまう」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 弥次兵衛', '稲が色づく前に、帰って来られるとよいがのう', 2.8] } },
  { id: 'c13_hiketa', town: '岡豊', townWhen: '天正十一年　四月', name: '引田の戦い', year: 1583, place: '讃岐国 引田', file: './b_c13_hiketa.js' },
  { id: 'c05_sogo', town: '岡豊', townWhen: '天正十二年　六月', name: '十河城の戦い', year: 1584, place: '讃岐国 十河城', file: './b_c05_sogo.js' },
  { id: 'c14_takao', town: '岡豊', townWhen: '天正十三年　七月', name: '高尾城の戦い', year: 1585, place: '伊予国 高尾城', file: './b_c14_takao.js' },
  { id: 'c06_ichinomiya', town: '岡豊', townWhen: '天正十三年　七月', name: '一宮城の戦い', year: 1585, place: '阿波国 一宮城', file: './b_c06_ichinomiya.js' },
  { id: 'c07_hetsugi', town: '岡豊', townWhen: '天正十四年　十二月', name: '戸次川の戦い', year: 1586, place: '豊後国 戸次川', file: './b_c07_hetsugi.js' },
  { id: 'c08_shimoda', town: '岡豊', townWhen: '天正十八年　四月', name: '下田城の戦い', year: 1590, place: '伊豆国 下田', file: './b_c08_shimoda.js' },
  { id: 'c09_koseki', town: '岡豊', townWhen: '慶長二年　八月', name: '黄石山城の戦い', year: 1597, place: '朝鮮 慶尚道', file: './b_c09_koseki.js' },
  { id: 'c10_sekigahara', town: '岡豊', townWhen: '慶長五年　九月', name: '関ヶ原の戦い（南宮山）', year: 1600, place: '美濃国 南宮山', file: './b_c10_sekigahara.js' },
  { id: 'c15_yao', town: '岡豊', townWhen: '慶長二十年　五月', name: '八尾の戦い', year: 1615, place: '河内国 八尾', file: './b_c15_yao.js' },
];
