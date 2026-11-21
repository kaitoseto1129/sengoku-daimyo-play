// 武田編（K563・docs/chapter_takeda.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
// 戦の def は prototype/src/b_d<番号>_<名>.js に置く。ここは並びと名前だけ。
export const TAKEDA_LINE = [
  { id: 'd01_kawanakajima', town: '甲府', name: '川中島の戦い', year: 1561, file: './b_d01_kawanakajima.js', place: '信濃国 八幡原（第四次川中島）' },
  { id: 'd02_minowa', town: '甲府', name: '箕輪城攻め', year: 1566, file: './b_d02_minowa.js', place: '上野国 箕輪城' },
  { id: 'd03_mimasetoge', town: '甲府', name: '三増峠の戦い', year: 1569, file: './b_d03_mimasetoge.js', place: '相模国 三増峠' },
  { id: 'd04_kanbara', town: '甲府', name: '蒲原城攻め', year: 1569, file: './b_d04_kanbara.js', place: '駿河国 蒲原城' },
  { id: 'd05_hanazawa', town: '駿府', name: '花沢城攻め', year: 1570, file: './b_d05_hanazawa.js', place: '駿河国 花沢城' },
  { id: 'd06_futamata', town: '駿府', name: '二俣城攻め', year: 1572, file: './b_d06_futamata.js', place: '遠江国 二俣城' },
  { id: 'd07_mikatagahara', town: '甲府', name: '三方ヶ原の戦い', year: 1572, file: './b_d07_mikatagahara.js', place: '遠江国 三方ヶ原' },
  { id: 'd08_noda', town: '甲府', name: '野田城攻め', year: 1573, file: './b_d08_noda.js', place: '三河国 野田城' },
];
