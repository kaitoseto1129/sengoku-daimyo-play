// 上杉編 十四戦目「新発田重家の乱」（天正十五年〔1587〕十月・越後 新発田城）。軽い型（light_battle.js）
//   史実：御館の乱の恩賞に不満を持った揚北衆の新発田重家は、天正九年（1581）に織田信長に通じて上杉景勝に背き、七年に渡って戦った。
//   豊臣秀吉と結んだ景勝は、天正十五年、まず五十公野城を落とし、十月に新発田城を攻めた。重家は城から打って出て討ち死にし、乱は終わった。
//   出所：Wikipedia「新発田重家」「新発田重家の乱」・新発田市の新発田城跡の案内。くわしくは docs/chapter_uesugi.md
//   新発田家の紋は手元の紋に無いので、旗は丸（maru）を当てた（家の紋の替わり）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const SHIBATA = { flag: 'maru', armor: 0x3e3832 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, -20], [-100, -14], [0, -22], [110, -16], [220, -24]];   // 新発田川（城の南の堀を兼ねる流れ）
const IJIMINO = { x: 20, z: -90 };      // 五十公野の口（先に落とした城の残りの兵）
const MOAT = { x: -10, z: -40 };        // 新発田城の南の堀の前
const CAMP = { x: 20, z: 10 };          // 堀を越えた寄せの陣（重家の打って出るのを受ける所）
const GATE = { x: 0, z: 70 };           // 新発田城の大手

export const u14_shibata = lightBattle({
  id: 'u14_shibata',
  date: '天正十五年（1587）十月　秋・曇り　越後国 新発田城',
  intro: '新発田重家が背いて七年。豊臣秀吉と結んだ上杉景勝は、五十公野城を落とし、ついに新発田城へ寄せる。',
  history: '天正九年（1581）、新発田重家は織田信長に通じて上杉景勝に背き、七年に渡って戦った。天正十五年、景勝は五十公野城を落とし、十月に新発田城を攻めた。重家は城から打って出て討ち死にし、乱は終わった。',
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '新発田重家の軍', mon: 'maru', faction: 'shibata' } },
  force: { a: 10000, b: 3000 },
  allyLook: UESUGI, foeLook: SHIBATA,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1587, overcast: true, time: 'day', autumn: true, fogFar: 400,
    river: RIVER, riverW: 12, riverDepth: 0.6,
    hills: [[-140, 100, 60, 8], [150, 80, 60, 10], [120, -180, 70, 16]],
    trees: 420, tufts: 2200,
  },
  allies: [
    { name: '上杉景勝の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉景勝'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉景勝', '五十公野は落ちた。残るは新発田の城だけじゃ', 3.2],
      ['直江兼続', '重家は戦上手。追い詰められれば必ず打って出て参りましょう', 3.4]] },
    { kind: 'fight', at: IJIMINO, obj: '五十公野の口で、逃げ込んだ新発田の兵を払う', title: '五十公野', sub: '落ちた城の兵が新発田へ逃げようとしている',
      say: [['組頭', '新発田の城へ入れさせるな！', 3]],
      foes: [{ name: '五十公野の残りの兵', from: { x: IJIMINO.x - 6, z: IJIMINO.z + 10 }, list: [uS(2), uA(24)] },
        { name: '新発田の弓', from: { x: IJIMINO.x + 16, z: IJIMINO.z + 14 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: IJIMINO.x + 30, z: IJIMINO.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '五十公野の兵を払った' },
    { kind: 'fight', at: MOAT, obj: '新発田城の南の堀の前で、守りの兵を崩す', title: '南の堀', sub: '堀の前に新発田の兵が構える',
      say: [['上杉景勝の使番', '御屋形様より。堀の前の兵を崩し、城を囲め', 3.2]],
      foes: [{ name: '堀の前の守り', from: { x: MOAT.x, z: MOAT.z + 12 }, list: [uS(3), uA(27)] },
        { name: '新発田の鉄砲', from: { x: MOAT.x + 18, z: MOAT.z + 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: MOAT.x + 30, z: MOAT.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '南の堀の前の守りを崩した' },
    { kind: 'hold', at: CAMP, label: '寄せの陣', obj: '寄せの陣で、新発田重家の打って出るのを受け止める', r: 18, dur: 100,
      title: '打って出る', sub: '重家が城の兵を率いて打って出た',
      say: [['直江兼続', '来ましたぞ。重家の最後の一合戦じゃ。陣を崩すな', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '城の門が開いた！　新発田の兵が出るぞ！'], foes: [{ name: '新発田の打って出る手', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(4), uA(24)] }] },
        { t: 34, say: ['組頭', '重家の旗本が来る！'], foes: [{ name: '新発田重家の旗本', from: { x: CAMP.x + 26, z: CAMP.z + 34 }, list: [uS(5), uA(12)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '新発田重家の打って出るのを受け止めた' },
    { kind: 'fight', at: GATE, obj: '新発田城の大手へ入り、残る兵を討つ', title: '新発田城', sub: '重家は討ち死にした。城に残る兵が最後まで守る',
      say: [['上杉景勝の使番', '重家殿、討ち死に！　城へ入れ！', 3.0]],
      foes: [{ name: '新発田城の残りの兵', from: { x: GATE.x, z: GATE.z + 8 }, list: [uS(3), uA(24)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '新発田城を落とした' },
  ],
  win: {
    banner: '落城', sub: '新発田重家は討ち死にし、七年続いた新発田の乱は終わった', award: '新発田城を落とした',
    say: [['上杉景勝の使番', '新発田城、落ちました。七年の乱はこれで終わりです', 3.2],
      ['上杉景勝', '重家ほどの者が敵であったのは惜しい。越後は一つに戻った', 3.4]],
  },
});
export default u14_shibata;
