// 伊達家編 二戦目「相馬攻め（初陣）」（天正十二年〔1584〕ごろ・伊達輝宗の下、十五歳ごろの政宗の初陣）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e01_soma.md
//   出所：『性山公治家記録』（B）。初陣の戦の名・場所は諸説（要確認）。伊達約3千・相馬約2千は推。小さな戦で、まだ慎重に馬印を前へ出す
//   仕組み「馬印の勢い」は date_uma.js（e05 と共通）。風は変わらず、受けの段が済むまで勢いは六割まで（慎重な初陣）。相手の色は蘆名の具足・紋を使い回す（相馬の紋は未）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const SOMA = { flag: 'ashina', armor: 0x4a3a2c };
const SPAWN = { x: 140, z: 0 };
const RIVER = [[-30, -220], [-38, -100], [-30, 0], [-42, 110], [-34, 220]];   // 川（相馬との境）
const WIND = [0.5, 0.3];
const FORD = { x: 20, z: 4 };        // 浅瀬の手前の丘
const FAR = { x: -90, z: 0 };        // 川の向こうの相馬の本陣
const NAKASU = { x: -14, z: 24 };    // 浅瀬の東の岸（川の中洲の相馬の鉄砲を払う・K652②）
const KAESHI = { x: -110, z: 20 };   // 取って返す相馬を受ける所（K652②）
const TORIDE = { x: -156, z: 6 };    // 相馬の砦（K652②）
const HAYARI = { x: -66, z: -26 };   // 逸って川を渡り過ぎた政宗の馬印（K652⑥）
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 0.6 });

export const e01_soma = lightBattle({
  id: 'e01_soma',
  date: '天正十二年（1584）ごろ　春　陸奥国 相馬領（諸説）',
  intro: '伊達輝宗の軍に、まだ十五歳の政宗が付いた。初めての戦。川の向こうに相馬勢が構えている。',
  history: '伊達輝宗は相馬との争いの中で、嫡子の政宗を初陣に連れていったと伝わる（『性山公治家記録』）。初陣の戦の名と場所には諸説ある。政宗は馬印のそばで戦を学び、伊達の勢いはここから伸びていった。',
  sides: { a: { name: '伊達輝宗の軍', mon: 'date', faction: 'date' }, b: { name: '相馬義胤の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 2000 },
  allyLook: DATE, foeLook: SOMA,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.28,
  friendsSend: 0,
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1584, time: 'day', fogFar: 420, sky: { wind: WIND, windStrength: 0.7 },
    river: RIVER, riverW: 12, riverDepth: 0.5,
    hills: [[FORD.x + 40, 0, 60, 9], [150, -90, 60, 12], [-100, 150, 60, 10]],
    paths: [{ pts: [[140, 0], [60, 2], [20, 4], [-30, 0], [-90, 0]], w: 3 }],
    groves: [{ x: 120, z: 110, r: 30, n: 26 }, { x: -60, z: -140, r: 34, n: 30 }],
    trees: 300, tufts: 2200,
  },
  allies: [
    { name: '伊達輝宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達輝宗'), uS(4), uA(8)] },
    { name: '伊達政宗の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 12 }, list: [busho('伊達政宗'), uS(2), uA(10)] },
    { name: '鬼庭左月の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('鬼庭良直'), uS(2), uA(10)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 20 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['伊達輝宗', '政宗、初陣じゃ。急くな。まず馬印のそばで戦を見よ', 3.4],
      ['鬼庭左月', '若殿の馬印を離れるな。足軽は旗の後ろに付くものじゃ', 3.4]] },
    { kind: 'move', at: FORD, label: '浅瀬の手前', obj: '馬印を浅瀬の手前の丘へ進める', r: 12,
      say: [['鬼庭左月', 'ゆるりと進め。若殿の初陣、乱れては恥じゃ', 3.2]] },
    { kind: 'hold', at: FORD, label: '浅瀬の手前', obj: '川を渡ってくる相馬の先手を受け止める', r: 16, dur: 60,
      title: '相馬攻め', sub: '川を渡って相馬の先手が寄せる',
      say: [['組頭', '槍を揃えよ！　若殿が見ておられる！', 3]],
      waves: [
        { t: 6, say: ['相馬の侍', '伊達の若子が出たぞ！　討て！'], foes: [{ name: '相馬の先手', from: { x: FORD.x - 40, z: FORD.z }, list: [uS(2), uA(10)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　馬印を守れ！'], foes: [{ name: '相馬の二の手', from: { x: FORD.x - 36, z: FORD.z + 14 }, list: [uS(2), uA(8)] }] }],
      reward: '相馬の先手を受け止めた' },
    // K652②（11/25 Sanae・10分）：川を渡る前に、中洲から撃つ相馬の鉄砲を払う（初陣の戦の細かい流れは諸説・推）
    { kind: 'fight', at: NAKASU, limit: 110, obj: '川を渡る前に、中洲から撃つ相馬の鉄砲を払う', title: '中洲の鉄砲', sub: '川の中洲から、相馬が撃ってくる',
      say: [['鬼庭左月', '中洲に鉄砲じゃ。あれを払わねば、若殿の馬印が渡れぬ', 3.2]],
      foes: [{ name: '中洲の相馬勢', from: { x: NAKASU.x - 16, z: NAKASU.z + 4 }, list: [uS(2), uA(10)] }, { name: '中洲の鉄砲', from: { x: NAKASU.x - 20, z: NAKASU.z - 10 }, list: [uS(1), uG(5)] }],
      reward: '中洲の相馬の鉄砲を払った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: FAR, limit: 120, obj: '馬印を押し出して、川向こうの相馬の本陣を崩す', title: '押し出し', sub: '政宗の馬印が川を渡る',
      say: [['伊達輝宗', '今じゃ！　政宗、旗を進めよ！', 3.2]],
      foes: [{ name: '相馬の本陣', from: { x: FAR.x - 6, z: FAR.z }, list: [busho('相馬義胤', { mustLive: false, invuln: false }), uS(3), uA(14)] },
        { name: '相馬の鉄砲', from: { x: FAR.x - 12, z: FAR.z + 14 }, list: [uS(1), uG(5)] }],
      reward: '相馬の本陣を崩した' },
    // K652⑥（11/26 クラウドわ）逸話の段：初陣の政宗は逸って前へ出過ぎ、老臣に止められたと伝わる（伝承・諸説・推）。本人が駆け付け、若殿の馬印に寄る相馬の伏せを斬り払う
    { kind: 'fight', at: HAYARI, limit: 100, obj: '前へ出過ぎた政宗の馬印へ駆け付け、寄る相馬の伏せを斬り払う', title: '若殿の逸り', sub: '政宗の馬印が、ひとりで先へ出過ぎた',
      say: [['鬼庭左月', '若殿が出過ぎじゃ！　誰か、馬印の脇を固めよ！', 3.2], ['伊達政宗', '退かぬ！　敵は目の前じゃ！', 2.8], ['組頭', '葦の中に伏せがおる！　若殿を守れ！', 3]],
      foes: [{ name: '相馬の伏せ', from: { x: HAYARI.x - 12, z: HAYARI.z - 10 }, list: [uS(2), uA(8)] }],
      reward: '若殿の馬印に寄る相馬の伏せを斬り払った' },
    { kind: 'hold', at: KAESHI, label: '相馬の取って返し', obj: '取って返す相馬の手を、馬印の前で受け止める', r: 16, dur: 60, limit: 110,
      title: '取って返し', sub: '退いた相馬が、もう一度寄せる',
      say: [['伊達輝宗', '政宗、退いた敵が返すのはよくある事じゃ。慌てるな', 3.2]],
      waves: [{ t: 6, say: ['相馬の侍', '若子の旗じゃ！　取って返せ！'], foes: [{ name: '相馬の取って返す手', from: { x: KAESHI.x - 36, z: KAESHI.z }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '横からも来るぞ！'], foes: [{ name: '相馬の横の手', from: { x: KAESHI.x - 10, z: KAESHI.z + 36 }, list: [uS(2), uA(10), uG(2)] }] }],
      reward: '取って返す相馬の手を受け止めた' },
    { kind: 'fight', at: TORIDE, limit: 120, obj: '馬印を進めて、相馬の砦を落とす', title: '相馬の砦', sub: '初陣の最後に、砦の柵を破る',
      say: [['鬼庭左月', '若殿、砦が見えまする。あれを落とせば、初陣の手柄じゃ', 3.2]],
      foes: [{ name: '砦の相馬勢', from: { x: TORIDE.x + 8, z: TORIDE.z }, list: [uS(3), uA(12)] }, { name: '砦の鉄砲', from: { x: TORIDE.x - 6, z: TORIDE.z + 14 }, list: [uS(1), uG(4)] }],
      reward: '相馬の砦を落とした' },
  ],
  update: umaTick,
  win: {
    banner: '初陣、勝ち', sub: '相馬勢は引いた。政宗は馬印の勢いを知った', award: '初陣で馬印を押し出した',
    say: [['伊達輝宗', 'よう旗を進めた。それでよい', 3.2],
      ['伊達政宗', '旗が前へ出ると、皆が付いてくる……', 3.2]],
  },
});
e01_soma.camPull = 1.6;
export default e01_soma;
