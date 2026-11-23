// 武田編（K563・docs/chapter_takeda.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
// 戦の def は prototype/src/b_d<番号>_<名>.js に置く。ここは並びと名前だけ。
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_takeda_late.js').then((m) => addEn(m.default)).catch(() => {});   // K516：武田編 d10〜d15 の画面の字の英訳（cloud-02・英語の時だけ読む）
export const TAKEDA_LINE = [
  { id: 'd01_kawanakajima', town: '甲府', name: '川中島の戦い', year: 1561, file: './b_d01_kawanakajima.js', place: '信濃国 八幡原（第四次川中島）' },
  { id: 'd02_minowa', town: '甲府', name: '箕輪城攻め', year: 1566, file: './b_d02_minowa.js', place: '上野国 箕輪城' },
  { id: 'd03_mimasetoge', town: '甲府', name: '三増峠の戦い', year: 1569, file: './b_d03_mimasetoge.js', place: '相模国 三増峠' },
  { id: 'd04_kanbara', town: '甲府', name: '蒲原城攻め', year: 1569, file: './b_d04_kanbara.js', place: '駿河国 蒲原城' },
  { id: 'd05_hanazawa', town: '駿府', name: '花沢城攻め', year: 1570, file: './b_d05_hanazawa.js', place: '駿河国 花沢城' },
  { id: 'd06_futamata', town: '駿府', name: '二俣城攻め', year: 1572, file: './b_d06_futamata.js', place: '遠江国 二俣城' },
  { id: 'd07_mikatagahara', town: '甲府', name: '三方ヶ原の戦い', year: 1572, file: './b_d07_mikatagahara.js', place: '遠江国 三方ヶ原' },
  { id: 'd08_noda', town: '甲府', name: '野田城攻め', year: 1573, file: './b_d08_noda.js', place: '三河国 野田城' },
  { id: 'd09_takatenjin1', town: '甲府', name: '高天神城の戦い（一）', year: 1574, file: './b_d09_takatenjin1.js', place: '遠江国 高天神城' },   // 11/21 cloud-41
  // 11/21 クラウド k365-cloud-10：武田編の後半（d09 は cloud-08）
  { id: 'd10_nagashinojo', town: '甲府', name: '長篠城攻め', year: 1575, file: './b_d10_nagashinojo.js', place: '三河国 長篠城' },
  { id: 'd11_shitaragahara', town: '甲府', name: '長篠・設楽原の戦い', year: 1575, file: './b_d11_shitaragahara.js', place: '三河国 設楽原' },
  { id: 'd12_takatenjin2', town: '甲府', name: '高天神城の戦い（二）', year: 1581, file: './b_d12_takatenjin2.js', place: '遠江国 高天神城' },
  { id: 'd13_toriitoge', town: '新府', name: '鳥居峠の戦い', year: 1582, file: './b_d13_toriitoge.js', place: '信濃国 鳥居峠' },
  { id: 'd14_takato', town: '新府', name: '高遠城の戦い', year: 1582, file: './b_d14_takato.js', place: '信濃国 高遠城' },
  { id: 'd15_tenmokuzan', town: '新府', name: '天目山の戦い', year: 1582, file: './b_d15_tenmokuzan.js', place: '甲斐国 田野' },
];
