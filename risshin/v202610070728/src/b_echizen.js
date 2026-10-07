// 旧越前の入口も、実寸の木ノ芽峠の定義を使う。
// 縮めた二砦・敵だけ弱い傷・時刻による救済・本陣への斬り込みは重ねない。
import { kinome } from './b_kinome.js';

const echizen = Object.defineProperties({}, Object.getOwnPropertyDescriptors(kinome));
export { echizen };
