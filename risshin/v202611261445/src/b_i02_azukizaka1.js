// 今川家編 二戦目「第一次小豆坂の戦い」（天文十一年〔1542〕八月・三河国 小豆坂）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：今川の軍は生田原から小豆坂を上り、織田信秀の軍とぶつかった。織田方は「小豆坂の七本槍」の働きで今川を押し返したと伝わる（『信長公記』A 首巻・岡崎市の解説 C。年は1542説を取る＝諸説）。
//   坂の上で織田の寄せを受け止め、帯を切らさず退く戦。字・札・ボタンは足さない。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, SAKA = { x: -10, z: 20 }, HON = { x: -110, z: 62 }, ATO = { x: -150, z: 82 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2.5 * Math.sin(x * 0.02) * Math.cos(z * 0.022 + 1) + 14 * gauss(x, z, SAKA.x + 30, SAKA.z - 20, 2600);

export const i02_azukizaka1 = imagawaBattle({
  id: 'i02_azukizaka1',
  date: '天文十一年（1542）八月　三河国 小豆坂',
  intro: '今川の大軍が、三河の小豆坂を上る。坂の上に尾張の織田がいる。あなたは雪斎様の手の足軽。',
  history: '天文十一年（1542）八月、今川の軍は三河の小豆坂で織田信秀の軍とぶつかった。織田の侍たちが坂の上から槍で押し、「小豆坂の七本槍」と呼ばれた（『信長公記』A・岡崎市の解説 C。この戦が本当にあったかは諸説ある）。',
  sides: { a: { name: '今川の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信秀の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 3000, b: 2000 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1542, time: 'day', fogFar: 360 },
  allies: [
    { name: '雪斎の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('太原雪斎'), uS(3), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: SAKA.x + 34, z: SAKA.z - 30 }, { x: SAKA.x + 44, z: SAKA.z - 22 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['太原雪斎', '坂を上る。列を詰めよ。坂では列が伸びる', 3.4], ['組頭', '帯が細うなったら、走って本隊を寄せよ', 3.2]] },
    { kind: 'move', at: SAKA, label: '小豆坂', obj: '細った帯をたどり、本隊を寄せながら坂を上る', r: 16, max: 100,
      say: [['組頭', '坂の上に織田の旗じゃ。後ろを離すな', 3.2]] },
    { kind: 'hold', at: SAKA, label: '小豆坂', obj: '坂の上から来る織田の槍を受け止める', r: 16, dur: 70,
      title: '織田の槍', sub: '坂の上から七本槍が押してくる',
      say: [['太原雪斎', '槍を揃えよ。坂で崩れれば、下まで追われる', 3.2]],
      waves: [
        { t: 6, say: ['織田の侍', '坂の上じゃ。押し落とせ！'], foes: [{ name: '織田の槍の手', from: { x: SAKA.x + 30, z: SAKA.z - 30 }, list: [busho('織田信光', { horse: false }), uS(4), uA(12)] }] },
        { t: 34, say: ['組頭', '新手じゃ！　横に回るぞ'], foes: [{ name: '織田の新手', from: { x: SAKA.x + 36, z: SAKA.z + 10 }, list: [uS(2), uA(8), uB(3)] }] },
      ], reward: '小豆坂で織田の槍を受け止めた' },
    { kind: 'move', at: { x: -80, z: 50 }, label: '坂の下', obj: '本隊と一つになり、坂の下へ引く', r: 16, max: 100,
      say: [['太原雪斎', '今日はここまで。列を切らさず退け。また来る', 3.4]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['太原雪斎', '織田は坂の上で勝ち誇っておる。また来るぞ', 3.2], ['組頭', '本隊の前に立て。帯は今、太い', 3]] },
    { kind: 'hold', at: { x: -80, z: 50 }, label: '坂の下', obj: '坂の下で、追って来る織田の兵を本隊と受け止める', r: 16, dur: 70, title: '坂の下', sub: '織田の兵が坂を駆け下りる',
      say: [['太原雪斎', '下りて来た者は、坂の下で囲めば崩れる', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '坂を下りる織田', from: { x: -30, z: 24 }, list: [{ type: 'samurai', n: 1, o: { name: '織田の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '小豆坂の七本槍じゃ！'], foes: [{ name: '織田の槍の衆', from: { x: -20, z: 40 }, list: [uS(4), uA(8)] }] }],
      reward: '坂の下で織田の追手を受け止めた' },
    { kind: 'fight', at: { x: -40, z: 40 }, obj: '押し返し、坂の中ほどの織田の旗を崩す', title: '押し返し', sub: '織田の旗が坂の中ほどで揺れる', max: 120, limit: 120,
      say: [['組頭', '今じゃ。帯をつないだまま押し上げよ！', 3]],
      foes: [{ name: '坂の中の織田', from: { x: -30, z: 30 }, list: [busho('織田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12), uB(3)] }],
      later: [{ t: 30, say: ['織田の侍', '退くな！　坂を守れ！'], foes: [{ name: '坂の上の織田', from: { x: 0, z: 10 }, list: [uS(2), uA(10)] }] }],
      reward: '坂の中ほどの織田の旗を崩した' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '織田は安城へ退く！', 3], ['太原雪斎', '深追いはせぬ。列を整えて退く', 3]] },
    { kind: 'hold', at: HON, label: '本隊', obj: '本隊の前で、最後に寄せる織田の殿を受けて、列を整える', r: 16, dur: 50, title: '列を整える', sub: '織田の殿が最後に寄せる',
      say: [['組頭', '帯を太く保て。列が整えば、勝ちじゃ', 3]],
      waves: [{ t: 3, foes: [{ name: '織田の殿', from: { x: -60, z: 30 }, list: [uS(2), uA(12)] }] }],
      reward: '列を整えて退いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKA.x - 30, z: SAKA.z + 20 }, obj: '坂の途中で、横から出る織田の足軽組を崩す', max: 100, limit: 90,
      say: [['組頭', '横から来る。槍を揃えよ', 3.2]],
      foes: [{ name: '織田の足軽組', from: { x: SAKA.x - 18, z: SAKA.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '坂の横の足軽組を崩した' },
    { kind: 'hold', at: { x: SAKA.x + 10, z: SAKA.z + 40 }, label: '坂の下の道で', obj: '坂の下の道で、回り込む織田の弓を受け止める', r: 16, dur: 45,
      say: [['見張り', '弓が回り込んでいる！　本隊の脇を守れ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '回り込む織田の弓', from: { x: SAKA.x + 22, z: SAKA.z + 28 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '回り込む織田の弓', from: { x: SAKA.x - 4, z: SAKA.z + 54 }, list: [uS(2), uA(7)] }] }],
      reward: '坂の下の道を守った' },
    { kind: 'fight', at: { x: SAKA.x + 30, z: SAKA.z - 20 }, obj: '坂の上の織田の旗を、槍を揃えて崩す', max: 100, limit: 90,
      say: [['組頭', '旗を倒せ。上を取らせるな', 3.2]],
      foes: [{ name: '坂の上の旗の守り', from: { x: SAKA.x + 42, z: SAKA.z - 32 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '坂の上の旗を崩した' },
    // K656 K652⑥ 逸話の段（織田の侍たちが槍で押したと伝わる（七本槍。『信長公記』A・諸説））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: SAKA, obj: '坂の上から押し下ろす織田の「七本槍」を受け止めて斬り伏せる', title: '小豆坂', sub: '七本槍、坂を下る', max: 100, limit: 100,
      say: [['下方貞清', '七本槍の名にかけて、坂を押し下れ！', 3], ['組頭', '坂の上の槍に負けるな。雪斎様の列を保て！', 3]],
      foes: [{ name: '小豆坂の七本槍', from: { x: SAKA.x + 12, z: SAKA.z + -14 }, list: [busho('下方貞清', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '小豆坂の七本槍を退けた' },
  ],
  win: { banner: '小豆坂', sub: '列を守って退いた', award: '第一次小豆坂で織田の槍を受け止め、列を守って退いた', say: [['太原雪斎', 'よう持ちこたえた。三河は、まだこれからじゃ', 3.4]] },
  land: {
    height, muddy: 0.15, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-10, 20], [60, -30]]],
    treeDensity: () => 0.7, clear: (x, z) => [SPAWN, SAKA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 400, tufts: 1800,
  },
});
export default i02_azukizaka1;
