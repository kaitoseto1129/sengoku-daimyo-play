// 伊達家編「郡山合戦」（天正十六年〔1588〕七月〜閏五月・陸奥国 郡山）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e04_koriyama.md
//   史実：佐竹義重・蘆名義広・相馬義胤ら連合が郡山へ寄せ、政宗は阿武隈川の西の陣で長く対陣した。決戦をせず、仲介で和睦（『伊達治家記録』B・郡山市の解説 C）。数は諸説で推
//   仕組み「馬印の勢い」（date_uma.js）の逆＝抑え。勢いの上限は低いまま上がらず、馬印を押し出さずに持ちこたえるのが勝ち（持久）。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const RENGO = { flag: 'ashina', armor: 0x4a3a2c };
const SPAWN = { x: 120, z: 0 };
const WIND = [0.4, 0.2];
const RIVER = [[-30, -220], [-36, -100], [-28, 0], [-40, 110], [-32, 220]];   // 阿武隈川
const JIN = { x: 30, z: 0 };     // 川の西の伊達の陣
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 0.3, windStep: 99 });   // 風は変わらず勢いは三割まで（持久）

export const e04_koriyama = lightBattle({
  id: 'e04_koriyama',
  date: '天正十六年（1588）夏　陸奥国 郡山',
  intro: '佐竹・蘆名・相馬の連合が、郡山の川向こうに陣を張った。政宗は馬印を押し出さず、陣に構えて持ちこたえる。',
  history: '天正十六年（1588）、佐竹義重・蘆名義広らが郡山へ寄せ、政宗は阿武隈川を挟んで長く対陣した。決戦は避けられ、やがて仲介で和睦となる（『伊達治家記録』）。若い政宗が、勢いを抑える事を学んだ戦である。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '佐竹・蘆名の連合', mon: 'ashina', faction: 'ashina' } },
  force: { a: 6000, b: 30000 },
  allyLook: DATE, foeLook: RENGO,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1588, time: 'day', fogFar: 420, sky: { wind: WIND, windStrength: 0.8 },
    river: RIVER, riverW: 12, riverDepth: 0.5,
    hills: [[JIN.x + 30, -30, 50, 7], [150, 80, 60, 9], [-110, 120, 60, 8]],
    paths: [{ pts: [[120, 0], [60, 2], [30, 0], [-28, 0], [-90, 0]], w: 3 }],
    groves: [{ x: 90, z: -100, r: 34, n: 28 }, { x: -70, z: -130, r: 30, n: 24 }],
    trees: 300, tufts: 2200,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 12 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、敵は三万。陣に構え、川を渡らせて討ちまする', 3.4],
      ['伊達政宗', '……旗は出さぬ。じっと耐えよ', 3.2]] },
    { kind: 'move', at: JIN, label: '川の西の陣', obj: '馬印を川の西の陣へ据える', r: 12,
      say: [['伊達成実', '馬印は陣の真ん中に。出しゃばってはなりませぬ', 3.2]] },
    { kind: 'hold', at: JIN, label: '川の西の陣', obj: '川を渡る連合の先手を、陣で受け止める', r: 18, dur: 75,
      title: '郡山', sub: '阿武隈川の向こうに、連合の旗が並ぶ',
      say: [['組頭', '持ち場を離れるな！　陣から出るな！', 3]],
      waves: [
        { t: 6, say: ['佐竹の侍', '伊達の若子を討て！　川を渡れ！'], foes: [{ name: '佐竹の先手', from: { x: JIN.x - 46, z: JIN.z }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　陣を崩すな！'], foes: [{ name: '蘆名の手', from: { x: JIN.x - 42, z: JIN.z + 18 }, list: [uS(2), uA(10)] }] }],
      reward: '連合の先手を陣で受け止めた' },
    { kind: 'hold', at: JIN, label: '川の西の陣', obj: '長い対陣を、陣から動かず持ちこたえる', r: 18, dur: 90,
      title: '対陣', sub: '日が過ぎても、連合は退かない',
      say: [['片倉景綱', '焦れて出れば、数で押し潰される。耐えるのじゃ', 3.2]],
      waves: [
        { t: 8, say: ['相馬の侍', '夜討ちじゃ！　陣を荒らせ！'], foes: [{ name: '相馬の夜討ち', from: { x: JIN.x - 40, z: JIN.z - 20 }, list: [uS(2), uA(10), uG(3)] }] },
        { t: 40, say: ['組頭', 'まだ来る！　槍を揃えよ！'], foes: [{ name: '連合の二の手', from: { x: JIN.x - 44, z: JIN.z + 14 }, list: [uS(3), uA(10)] }] }],
      reward: '長い対陣を持ちこたえた' },
  ],
  update: umaTick,
  win: {
    banner: '持ちこたえて、和睦', sub: '連合は退いた。政宗は勢いを抑える事を知った', award: '押し出さず、郡山で持ちこたえた',
    say: [['伊達成実', '連合が陣を払っていきます。仲介の和睦が決まりました', 3.2],
      ['伊達政宗', '旗を出さぬ強さもある……覚えておこう', 3.4]],
  },
});
e04_koriyama.camPull = 1.6;
export default e04_koriyama;
