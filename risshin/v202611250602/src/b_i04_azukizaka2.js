// 今川家編 四戦目「第二次小豆坂の戦い」（天文十七年〔1548〕三月・三河国 小豆坂）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：太原雪斎・朝比奈泰能の今川の軍が、小豆坂で織田信秀の軍を破った。今川は坂の陰に伏せた手で織田を崩したと伝わる（『三河物語』B・岡崎市の解説 C）。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, SAKA = { x: -20, z: 25 }, FUSE = { x: 20, z: 40 }, HON = { x: -110, z: 62 }, ATO = { x: -150, z: 82 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2.5 * Math.sin(x * 0.02 + 0.5) * Math.cos(z * 0.022 + 1) + 14 * gauss(x, z, SAKA.x + 30, SAKA.z - 20, 2600) + 5 * gauss(x, z, FUSE.x, FUSE.z, 500);

export const i04_azukizaka2 = imagawaBattle({
  id: 'i04_azukizaka2',
  date: '天文十七年（1548）三月　三河国 小豆坂',
  intro: 'ふたたび小豆坂。織田信秀が坂を下りて来る。雪斎様は坂の陰に手を伏せた。あなたはその伏せの足軽。',
  history: '天文十七年（1548）三月、太原雪斎と朝比奈泰能が率いる今川の軍は、小豆坂で織田信秀の軍とぶつかった。今川は坂の陰に伏せた手で織田を横から崩し、勝った。これで三河の多くが今川に付いた（『三河物語』B・岡崎市の解説 C）。',
  sides: { a: { name: '雪斎の伏せの手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信秀の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 10000, b: 4000 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1548, time: 'morning', fogFar: 340, mist: true },
  allies: [
    { name: '雪斎の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('太原雪斎'), uS(3), uA(8)] },
    { name: '朝比奈泰能の本隊', at: HON, face: FACE, list: [busho('朝比奈泰能'), uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: SAKA.x + 40, z: SAKA.z - 34 }, { x: SAKA.x + 50, z: SAKA.z - 26 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['太原雪斎', '織田は坂を下りて来る。坂の陰に伏せ、横から突く', 3.4], ['組頭', '伏せの手と本隊の帯を切らすな', 3.2]] },
    { kind: 'move', at: FUSE, label: '坂の陰', obj: '細った帯をたどり、本隊を寄せながら坂の陰へ回る', r: 16, max: 100,
      say: [['組頭', '静かに。本隊から離れすぎるな', 3.2]] },
    { kind: 'hold', at: FUSE, label: '坂の陰', obj: '坂の陰で、下りて来る織田を待ち受ける', r: 16, dur: 60,
      title: '伏せ', sub: '織田が坂を下りて来る',
      say: [['太原雪斎', 'まだじゃ。引きつけよ', 3]],
      waves: [
        { t: 6, say: ['織田の侍', '今川は坂の下じゃ。一気に下れ！'], foes: [{ name: '織田の先手', from: { x: FUSE.x + 30, z: FUSE.z - 36 }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '後ろからも来るぞ！'], foes: [{ name: '織田の二の手', from: { x: FUSE.x + 40, z: FUSE.z - 10 }, list: [uS(2), uA(8), uB(3)] }] },
      ], reward: '坂の陰で織田の先手を受け止めた' },
    { kind: 'fight', at: { x: SAKA.x + 26, z: SAKA.z - 18 }, obj: '横から突き、織田の旗本を崩す', title: '小豆坂', sub: '織田信秀の旗本', max: 120, limit: 110,
      say: [['太原雪斎', '今じゃ。横から突け！', 3]],
      foes: [{ name: '織田の旗本', from: { x: SAKA.x + 40, z: SAKA.z - 30 }, list: [busho('織田信秀', { horse: true }), uS(4), uA(10)] }],
      reward: '織田の旗本を横から崩した' },
  ],
  win: { banner: '小豆坂', sub: '織田を破った', award: '第二次小豆坂で伏せの手から織田を崩した', say: [['太原雪斎', '勝った。これで三河は今川に付く', 3.4]] },
  land: {
    height, muddy: 0.15, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-20, 25], [60, -30]]],
    treeDensity: () => 0.9, clear: (x, z) => [SPAWN, SAKA, FUSE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 440, tufts: 1800,
  },
});
export default i04_azukizaka2;
