// もしも編（K664・K671・docs/chapter_if.md の頭が正）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
// 戦の def は prototype/src/b_if<番号>_<名>.js。ここは並びと名前だけ。題の画面（SCENARIO_PICK）へは、落ち0の通しと実機の動画が揃ってから出す（K576）。
// 作る順（K664）：①長篠 → ⑬関ヶ原 → ⑥本能寺 → 残り。
import { isEn, addEn } from './i18n.js';
// K516：読み込みの札（戦のファイルより先に出る）の名と場所の英訳
if (isEn()) addEn([['長篠、家康の裏切り', 'Nagashino: Ieyasu Betrays'], ['三河国 設楽原（もしも）', 'Shitaragahara, Mikawa (What if)'], ['設楽原（もしも）', 'Shitaragahara (What if)'], ['もしも編', 'What-If Campaign'], ['関ヶ原、寝返らぬ秀秋', 'Sekigahara: Hideaki Stays Loyal'], ['美濃国 関ヶ原（もしも）', 'Sekigahara, Mino (What if)']]);
export const IF_LINE = [
  { id: 'if01_nagashino', town: '岐阜城下', name: '長篠、家康の裏切り', year: 1575, file: './b_if01_nagashino.js', place: '三河国 設楽原（もしも）' },
  { id: 'if13_sekigahara', town: '江戸城下', name: '関ヶ原、寝返らぬ秀秋', year: 1600, file: './b_if13_sekigahara.js', place: '美濃国 関ヶ原（もしも）' },
];
