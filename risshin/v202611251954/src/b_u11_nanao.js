// 上杉編 十一戦目「七尾城の戦い」（天正四年〔1576〕十一月〜天正五年〔1577〕九月十五日・能登 七尾城）。軽い型（light_battle.js）
//   史実：上杉謙信は能登の七尾城（畠山氏の山城）を囲んだ。城を仕切る長続連は織田信長に救いを求めて固く守ったが、
//   城の中に疫病が広がり、九月十五日、遊佐続光・温井景隆らが内から上杉に応じて門を開き、長一族は討たれて城は落ちた。
//   出所：Wikipedia「七尾城の戦い」・七尾市の七尾城跡の案内。くわしくは docs/chapter_uesugi.md
//   畠山家の紋（二つ引両）は手元の紋に無いので、旗は釘抜（kuginuki）を当てた（城方の家の紋の替わり）
import { withCastle } from './light_castle.js';
import { NANAO_PLAN } from './castles/nanao.js';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const NANAO = { flag: 'kuginuki', armor: 0x403630 };
const SPAWN = { x: 0, z: -150 };
const FOOT = { x: 10, z: -80 };         // 城山の麓の口（城方の物見の砦）
const SLOPE = { x: -10, z: -10 };       // 城へ上る尾根の道
const CAMP = { x: 24, z: -40 };         // 尾根の陣（城方の打って出るのを受ける所）
const GATE = { x: 0, z: 60 };           // 七尾城の大手の門
// K652②（11/25 Sanae・家の編を10分前後に）：史実の流れ。城の中の遊佐続光・温井景隆らが上杉に内通した。続連は子の長連龍を城から抜け出させ、
//   安土の信長へ救いを求めに走らせた（『長家家譜』）。逸話の段（K652⑥）＝夜、搦手の谷で遊佐の使いから内応の文を受け取る／城を抜ける連龍の手を追う
const TANI = { x: -42, z: -44 };        // 搦手の谷（遊佐の使いと会う所）
const NUKE = { x: 44, z: -4 };          // 城の東の抜け道

// 11/21 クラウド35（K563 ③の質）：七尾城の縄張りを置く（castles/nanao.js・出所 docs/battle_refs/nanao.md）。大手口 (-66,-12)×0.7 を段の大手の門 (0,60) に合わせた。遠景の軽い形
export const u11_nanao = withCastle(lightBattle({
  id: 'u11_nanao',
  date: '天正五年（1577）九月　秋・晴れ　能登国 七尾城',
  intro: '上杉謙信は能登の七尾城を囲んで一年になる。城の中では病が広がり、内から上杉に応じる者が出始めた。',
  history: '天正四年（1576）から、上杉謙信は能登の七尾城を囲んだ。城を仕切る長続連は織田信長に救いを求めて固く守ったが、城の中に病が広がった。天正五年九月十五日、遊佐続光らが内から門を開き、七尾城は落ちた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '七尾城の長続連', mon: 'kuginuki', faction: 'hatakeyama' } },
  force: { a: 20000, b: 6000 },
  allyLook: UESUGI, foeLook: NANAO,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1577, time: 'day', autumn: true, fogFar: 420,
    hills: [[0, 100, 70, 34], [-80, 40, 50, 18], [80, 50, 50, 16], [0, 20, 40, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：城山の麓の口・城へ上る尾根の道・尾根の陣・七尾城の大手の門 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -150], [10, -80], [24, -40], [-10, -10], [0, 60]], w: 3 }, { pts: [[10, -80], [-42, -44]], w: 3 }, { pts: [[24, -40], [44, -4]], w: 3 }],
    groves: [{ x: 0, z: 100, r: 30, n: 30, kind: 'sugi' }, { x: -80, z: 40, r: 25, n: 30, kind: 'sugi' }],
    trees: 560, tufts: 1800,
  },
  allies: [
    { name: '上杉謙信の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉謙信'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉謙信', '城の中は病で弱っておる。今宵、内から門を開くという知らせが来た', 3.4],
      ['上杉謙信', 'その前に麓の砦を払い、尾根の道を取れ', 3.0]] },
    { kind: 'fight', at: FOOT, obj: '城山の麓の砦で、城方の物見を払う', title: '城山の麓', sub: '麓の砦に城方の物見',
      say: [['組頭', '砦の柵を越えよ！　城へ知らせを走らせるな！', 3]],
      foes: [{ name: '城方の物見', from: { x: FOOT.x - 6, z: FOOT.z + 8 }, list: [uS(2), uA(21)] },
        { name: '城方の弓', from: { x: FOOT.x + 14, z: FOOT.z + 12 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: FOOT.x + 30, z: FOOT.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '城山の麓の砦を取った' },
    { kind: 'move', at: TANI, label: '搦手の谷', obj: '夜の搦手の谷へ忍び、遊佐続光の使いから内応の文を受け取る', r: 10,
      say: [['上杉謙信', '遊佐の使いが谷へ下りてくる。長の者に見つかるな', 3.2], ['組頭', '松明を消せ。声を立てるな', 3]],
      ambush: { d: 16, say: ['城方の侍', '谷に人影！　遊佐の手の者か！　斬れ！'], foes: [{ name: '谷の見回り', from: { x: TANI.x - 20, z: TANI.z + 22 }, list: [uS(2), uA(12)] }] } },
    { kind: 'fight', at: SLOPE, obj: '尾根の道を上り、城方の守りを崩す', title: '尾根の道', sub: '細い尾根に城方が構える',
      say: [['上杉謙信の使番', '殿より。尾根の道を押さえ、門の前まで兵を寄せよ', 3.2]],
      foes: [{ name: '尾根の守り', from: { x: SLOPE.x, z: SLOPE.z + 12 }, list: [uS(3), uA(27)] },
        { name: '城方の鉄砲', from: { x: SLOPE.x + 16, z: SLOPE.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: SLOPE.x + 30, z: SLOPE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '尾根の道を取った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: CAMP, label: '尾根の陣', obj: '尾根の陣で、城から打って出た兵を受け止める', r: 18, dur: 100,
      title: '打って出る', sub: '長続連が最後の力で城から打って出る',
      say: [['上杉謙信', '長の者どもが死に物狂いで来る。陣を崩すな', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '城から兵が下りてくるぞ！'], foes: [{ name: '長続連の手', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(4), uA(24)] }] },
        { t: 34, say: ['組頭', '二の手じゃ！　脇を固めよ！'], foes: [{ name: '長綱連の手', from: { x: CAMP.x + 30, z: CAMP.z + 30 }, list: [uS(3), uA(15)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '城から打って出た兵を受け止めた' },
    { kind: 'fight', at: NUKE, obj: '城の東の抜け道で、安土へ走る長連龍の手を追う', title: '抜け道', sub: '長続連は子の連龍を城から抜け出させ、信長へ走らせた',
      say: [['見張り', '東の抜け道を下りる一手がおる！　長の旗じゃ！', 3.2], ['上杉謙信の使番', '殿より。信長に知らせを届けさせるな。追え！', 3.2]],
      foes: [{ name: '長連龍の供の手', from: { x: NUKE.x + 6, z: NUKE.z + 12 }, list: [uS(3), uA(16)] },
        { name: '抜け道の弓', from: { x: NUKE.x - 12, z: NUKE.z + 18 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 35, say: ['組頭', '殿を務める者が踏みとどまる！　連龍は先へ逃げた！'], foes: [{ name: '連龍の殿', from: { x: NUKE.x + 26, z: NUKE.z - 10 }, list: [uS(3), uA(12)] }] }],
      reward: '連龍の供の手を崩した（連龍は安土へ逃れた）' },
    { kind: 'fight', at: GATE, obj: '内から開いた大手の門へ入り、長の兵を討つ', title: '大手の門', sub: '遊佐続光らが内から門を開いた',
      say: [['上杉謙信の使番', '門が開いた！　内応の者には手を出すな。長の兵だけを討て', 3.4]],
      foes: [{ name: '長の残りの兵', from: { x: GATE.x, z: GATE.z + 8 }, list: [uS(4), uA(24)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '七尾城の大手の門を破った' },
  ],
  win: {
    banner: '落城', sub: '城の内から門が開き、七尾城は落ちた。能登は上杉の手に入った', award: '七尾城を落とした',
    say: [['上杉謙信の使番', '七尾の城、落ちました。長の一族は討たれました', 3.2],
      ['上杉謙信', '霜は軍営に満ちて秋気清し……。能登の月を見よ', 3.6]],
  },
}), { plan: NANAO_PLAN, at: { x: 46, z: 68 }, lift: 30, scale: 0.7, team: 1, life: false });
export default u11_nanao;
