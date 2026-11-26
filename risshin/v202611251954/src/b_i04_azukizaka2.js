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
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '信秀の旗本が崩れた！　されど織田の殿が坂の上で踏み留まる', 3.2], ['太原雪斎', '坂を取り切れ。帯を切らすな', 3]] },
    { kind: 'fight', at: { x: SAKA.x + 40, z: SAKA.z - 30 }, obj: '坂の上で踏み留まる織田の殿を崩す', title: '坂の上', sub: '織田信広の手が坂の上に残る', max: 120, limit: 120,
      say: [['組頭', '坂の上を取れば、勝ちが決まる', 3]],
      foes: [{ name: '織田の殿', from: { x: SAKA.x + 48, z: SAKA.z - 40 }, list: [busho('織田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(14), uB(3)] }],
      later: [{ t: 30, say: ['織田の侍', '信広様をお守りせよ！'], foes: [{ name: '信広の手', from: { x: SAKA.x + 60, z: SAKA.z - 10 }, list: [uS(2), uA(10)] }] }],
      reward: '坂の上の織田の殿を崩した' },
    { kind: 'hold', at: { x: SAKA.x + 30, z: SAKA.z - 20 }, label: '坂の上', obj: '坂の上で、取り返しに来る織田の兵を受け止める', r: 16, dur: 60, title: '取り返し', sub: '織田の兵が坂を上り返す',
      say: [['太原雪斎', '坂の上は我らの物じゃ。渡すな', 3]],
      waves: [
        { t: 3, foes: [{ name: '上り返す織田', from: { x: SAKA.x - 10, z: SAKA.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '織田の組頭' } }, uS(3), uA(12)] }] },
        { t: 30, say: ['見張り', '横からも来る！'], foes: [{ name: '横の織田', from: { x: SAKA.x + 60, z: SAKA.z + 10 }, list: [uS(2), uA(10)] }] }],
      reward: '坂の上を守り切った' },
    { kind: 'move', at: { x: SAKA.x + 60, z: SAKA.z - 50 }, label: '坂の向こう', obj: '帯をつないだまま、退く織田を坂の向こうまで追う', r: 16, max: 100,
      say: [['組頭', '追い過ぎるな。帯が切れたら止まれ', 3]] },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: SAKA.x + 60, z: SAKA.z - 50 }, label: '坂の向こう', obj: '坂の向こうで、信秀の殿の最後の寄せを受け止める', r: 16, dur: 70, title: '殿', sub: '信秀の殿が最後に向き直る',
      say: [['太原雪斎', 'これを受ければ、織田は三河を手放す', 3]],
      waves: [
        { t: 3, foes: [{ name: '信秀の殿', from: { x: SAKA.x + 90, z: SAKA.z - 80 }, list: [busho('織田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '弓じゃ！'], foes: [{ name: '織田の弓', from: { x: SAKA.x + 100, z: SAKA.z - 40 }, list: [uS(1), uB(7), uA(4)] }] }],
      reward: '信秀の殿の最後の寄せを受け止めた' },
    // K656 K652⑥ 逸話の段（信秀の弟・織田信光が殿に立ったと伝わる（『信長公記』A・諸説））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: FUSE.x + 10, z: FUSE.z + 6 }, obj: '伏せた手で横から崩された織田信秀の弟・信光の殿を討つ', title: '坂の陰', sub: '信光の殿', max: 100, limit: 100,
      say: [['織田信光', '兄上を退かせよ。ここはわしが止める！', 3], ['組頭', '信光の殿を崩せ。信秀は逃げるぞ！', 3]],
      foes: [{ name: '織田信光の手', from: { x: FUSE.x + 10 + 12, z: FUSE.z + 6 + -14 }, list: [busho('織田信光', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '信秀の弟・信光の殿を崩した' },
  ],
  win: { banner: '小豆坂', sub: '織田を破った', award: '第二次小豆坂で伏せの手から織田を崩した', say: [['太原雪斎', '勝った。これで三河は今川に付く', 3.4]] },
  land: {
    height, muddy: 0.15, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-20, 25], [60, -30]]],
    treeDensity: () => 0.9, clear: (x, z) => [SPAWN, SAKA, FUSE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 440, tufts: 1800,
  },
});
export default i04_azukizaka2;
