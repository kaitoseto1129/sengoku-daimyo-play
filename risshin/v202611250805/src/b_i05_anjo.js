// 今川家編 五戦目「安城城の戦い」（天文十八年〔1549〕十一月・三河国 安城城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：太原雪斎の今川の軍が織田の安城城を囲んで攻め、城主の織田信広（信長の兄）を生け捕った。信広と、織田の下にいた竹千代を取り替えた（『三河物語』B・安城市の解説 C）。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, ANJO = { x: 40, z: -10 }, HON = { x: -110, z: 60 }, ATO = { x: -150, z: 80 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 1.8 * Math.sin(x * 0.02 + 1) * Math.cos(z * 0.018) + 7 * gauss(x, z, ANJO.x, ANJO.z, 1400);

export const i05_anjo = imagawaBattle({
  id: 'i05_anjo',
  date: '天文十八年（1549）十一月　三河国 安城城',
  intro: '織田の安城城を囲む。城主は信長の兄の信広。生け捕れば、竹千代を取り戻せる。あなたは雪斎様の手の足軽。',
  history: '天文十八年（1549）十一月、太原雪斎の今川の軍は織田の安城城を攻め、城主の織田信広を生け捕った。今川は信広と、織田の下にいた松平竹千代を取り替え、竹千代は駿府へ移った（『三河物語』B・安城市の解説 C）。',
  sides: { a: { name: '雪斎の手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信広の城方', mon: 'oda', faction: 'oda' } },
  force: { a: 7000, b: 1000 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1549, time: 'day', overcast: true, fogFar: 340 },
  allies: [
    { name: '雪斎の先手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('太原雪斎'), uS(3), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: ANJO.x - 8, z: ANJO.z + 6 }, { x: ANJO.x + 8, z: ANJO.z + 6 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['太原雪斎', '安城を囲む。信広を生け捕れ。竹千代と取り替える', 3.4], ['組頭', '囲みが切れれば城から逃げられる。帯を見よ', 3.2]] },
    { kind: 'move', at: { x: -50, z: 30 }, label: '安城の堀の手前', obj: '細った帯をたどり、本隊を寄せながら囲みを詰める', r: 16, max: 100,
      say: [['組頭', '囲みが薄い。本隊に寄せと伝えよ', 3.2]] },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '打って出た城方を押し返す', title: '安城の堀', sub: '織田信広の手', max: 120, limit: 110,
      say: [['織田の侍', '囲みを破れ！　尾張へ戻るのじゃ', 3]],
      foes: [{ name: '安城の城方', from: { x: ANJO.x - 6, z: ANJO.z - 14 }, list: [uS(4), uA(12), uG(3)] }],
      later: [{ t: 30, say: ['組頭', '裏の門からも出た！　逃がすな'], foes: [{ name: '安城の別手', from: { x: ANJO.x - 30, z: ANJO.z + 22 }, list: [uS(2), uA(7), uB(2)] }] }],
      reward: '打って出た安城の城方を押し返した' },
    { kind: 'move', at: { x: ANJO.x - 4, z: ANJO.z + 4 }, label: '安城城', obj: '城の門まで詰め、信広を囲む', r: 14, max: 110,
      say: [['太原雪斎', '門まで詰めよ。信広を討つな。生け捕りじゃ', 3.2]] },
  ],
  win: { banner: '安城城', sub: '信広を生け捕った', award: '安城城を落とし、竹千代を取り戻す道を開いた', say: [['太原雪斎', 'よし。信広と竹千代を取り替える。竹千代は駿府で学ばせる', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, ANJO.x + 4, ANJO.z - 6)); },
  land: {
    height, muddy: 0.3, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-50, 30], [40, -10]]],
    treeDensity: () => 0.5, clear: (x, z) => [SPAWN, ANJO, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 340, tufts: 1700,
  },
});
export default i05_anjo;
