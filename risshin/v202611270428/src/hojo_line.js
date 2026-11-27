// 北条家編「籠城と支城の網」（H3・H8・K637・docs/house_hojo.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
//   戦の def は prototype/src/b_h<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。
//   この家だけの仕組み「狼煙の網」（狼煙台を乱破から守って火を上げると、遠くの支城の後詰が囲みの背後に出る）は b_h02_odawara_k.js の中
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_hojo.js').then((m) => addEn(m.default)).catch(() => {});   // K516：北条家編の画面の字の英訳（英語の時だけ読む）
export const HOJO_LINE = [
  // K647（11/25 Sanae）：15戦に（docs/house_hojo.md ②'）。年の順。h02 のほかは b_h<番号>_<名>.js（軽い型）。狼煙の網は hojo_noroshi.js（h01・h13・h04・h06・h09）
  { id: 'h11_kokufudai1', town: '小田原', name: '第一次国府台合戦', year: 1538, file: './b_h11_kokufudai1.js', place: '下総国 相模台' },
  { id: 'h01_kawagoe', town: '小田原', name: '河越夜戦', year: 1546, file: './b_h01_kawagoe.js', place: '武蔵国 河越城' },
  // H3（11/24 Sanae）：一戦目 小田原城攻め（永禄四年〔1561〕三月・上杉謙信の大軍を籠城で凌ぐ）。前と後は夕刻の小田原の城下（組頭 弥太郎の声・相模の海）
  { id: 'h02_odawara_k', town: '小田原', name: '小田原城攻め（上杉謙信）', year: 1561, place: '相模国 小田原', file: './b_h02_odawara_k.js', townWhen: '永禄四年　三月',
    eve: { who: '組頭 弥太郎', tod: 0, obj: '上官屋敷の前で、組頭から籠城の話を聞く',
      lines: ['越後の長尾景虎が、関東の諸将を連れて来る。十万と号しておるそうな', '氏康様は城を出ぬと決められた。小田原の城は、落ちぬ', 'わしらの役目は、門と狼煙台じゃ。火が上がれば、玉縄の兵が来る'],
      card: '弥太郎「守り抜けば、敵が先に飢える。焦るな」', pick: '具足を締めて門へ上がる', after: [0.4, '組頭 弥太郎', '海の風が冷たい。今宵は篝火を絶やすな', 2.8] } },
  { id: 'h12_matsuyama', town: '小田原', name: '武蔵松山城攻め', year: 1563, file: './b_h12_matsuyama.js', place: '武蔵国 松山城' },
  { id: 'h03_kokufudai', town: '小田原', name: '第二次国府台合戦', year: 1564, file: './b_h03_kokufudai.js', place: '下総国 国府台' },
  { id: 'h13_usui', town: '小田原', name: '臼井城の戦い', year: 1566, file: './b_h13_usui.js', place: '下総国 臼井城' },
  { id: 'h04_odawara_t', town: '小田原', name: '小田原城攻め（武田信玄）', year: 1569, file: './b_h04_odawara_t.js', place: '相模国 小田原' },
  { id: 'h05_mimase', town: '小田原', name: '三増峠の戦い', year: 1569, file: './b_h05_mimase.js', place: '相模国 三増峠' },
  { id: 'h06_kanna', town: '小田原', name: '神流川の戦い', year: 1582, file: './b_h06_kanna.js', place: '上野国 神流川' },
  { id: 'h07_wakamiko', town: '小田原', name: '若御子の対陣', year: 1582, file: './b_h07_wakamiko.js', place: '甲斐国 黒駒' },
  { id: 'h14_numajiri', town: '小田原', name: '沼尻の合戦', year: 1584, file: './b_h14_numajiri.js', place: '下野国 沼尻' },
  { id: 'h15_yamanaka', town: '小田原', name: '山中城の戦い', year: 1590, file: './b_h15_yamanaka.js', place: '伊豆国 山中城' },
  { id: 'h09_hachigata', town: '小田原', name: '鉢形城の戦い', year: 1590, file: './b_h09_hachigata.js', place: '武蔵国 鉢形城' },
  { id: 'h08_hachioji', town: '小田原', name: '八王子城の戦い', year: 1590, file: './b_h08_hachioji.js', place: '武蔵国 八王子城' },
  { id: 'h10_odawara_h', town: '小田原', name: '小田原の陣', year: 1590, file: './b_h10_odawara_h.js', place: '相模国 小田原' },
];
