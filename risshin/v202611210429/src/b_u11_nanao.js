// 上杉編 十一戦目「七尾城の戦い」（天正四年〔1576〕十一月〜天正五年〔1577〕九月十五日・能登 七尾城）。軽い型（light_battle.js）
//   史実：上杉謙信は能登の七尾城（畠山氏の山城）を囲んだ。城を仕切る長続連は織田信長に救いを求めて固く守ったが、
//   城の中に疫病が広がり、九月十五日、遊佐続光・温井景隆らが内から上杉に応じて門を開き、長一族は討たれて城は落ちた。
//   出所：Wikipedia「七尾城の戦い」・七尾市の七尾城跡の案内。くわしくは docs/chapter_uesugi.md
//   畠山家の紋（二つ引両）は手元の紋に無いので、旗は釘抜（kuginuki）を当てた（城方の家の紋の替わり）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const NANAO = { flag: 'kuginuki', armor: 0x403630 };
const SPAWN = { x: 0, z: -150 };
const FOOT = { x: 10, z: -80 };         // 城山の麓の口（城方の物見の砦）
const SLOPE = { x: -10, z: -10 };       // 城へ上る尾根の道
const CAMP = { x: 24, z: -40 };         // 尾根の陣（城方の打って出るのを受ける所）
const GATE = { x: 0, z: 60 };           // 七尾城の大手の門

export const u11_nanao = lightBattle({
  id: 'u11_nanao',
  date: '天正五年（1577）九月　秋・晴れ　能登国 七尾城',
  intro: '上杉謙信は能登の七尾城を囲んで一年になる。城の中では病が広がり、内から上杉に応じる者が出始めた。',
  history: '天正四年（1576）から、上杉謙信は能登の七尾城を囲んだ。城を仕切る長続連は織田信長に救いを求めて固く守ったが、城の中に病が広がった。天正五年九月十五日、遊佐続光らが内から門を開き、七尾城は落ちた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '七尾城の長続連', mon: 'kuginuki', faction: 'hatakeyama' } },
  force: { a: 20000, b: 6000 },
  allyLook: UESUGI, foeLook: NANAO,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1577, time: 'day', autumn: true, fogFar: 420,
    hills: [[0, 100, 70, 34], [-80, 40, 50, 18], [80, 50, 50, 16], [0, 20, 40, 8]],
    trees: 620, tufts: 1800,
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
    { kind: 'fight', at: SLOPE, obj: '尾根の道を上り、城方の守りを崩す', title: '尾根の道', sub: '細い尾根に城方が構える',
      say: [['上杉謙信の使番', '殿より。尾根の道を押さえ、門の前まで兵を寄せよ', 3.2]],
      foes: [{ name: '尾根の守り', from: { x: SLOPE.x, z: SLOPE.z + 12 }, list: [uS(3), uA(27)] },
        { name: '城方の鉄砲', from: { x: SLOPE.x + 16, z: SLOPE.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: SLOPE.x + 30, z: SLOPE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '尾根の道を取った' },
    { kind: 'hold', at: CAMP, label: '尾根の陣', obj: '尾根の陣で、城から打って出た兵を受け止める', r: 18, dur: 100,
      title: '打って出る', sub: '長続連が最後の力で城から打って出る',
      say: [['上杉謙信', '長の者どもが死に物狂いで来る。陣を崩すな', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '城から兵が下りてくるぞ！'], foes: [{ name: '長続連の手', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(4), uA(24)] }] },
        { t: 34, say: ['組頭', '二の手じゃ！　脇を固めよ！'], foes: [{ name: '長綱連の手', from: { x: CAMP.x + 30, z: CAMP.z + 30 }, list: [uS(3), uA(15)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '城から打って出た兵を受け止めた' },
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
});
export default u11_nanao;
