// 長宗我部家編 一「長浜の戦い」（永禄三年〔1560〕五月・土佐国 長浜・戸の本）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：本山茂辰の長浜城を長宗我部国親が攻め、戸の本で本山勢と戦った。二十二歳の元親の初陣。槍の突き方を家臣に問い、
//   「目を突け」と聞いて自ら駆け入ったと伝わる（『土佐物語』B・『元親記』B・高知市の解説 C）。兵の数は諸説（長宗我部約千・本山約二千の説・推）。
//   この戦は呼び集めを使わない（一領具足の姿を見せるだけ）。本物の兵は味方・敵を合わせて百八十人ほどまで
import { chosoBattle, ICHIRYO, uS, uA, uB, busho } from './chosokabe_kit.js';

const MOTO = { flag: 'maru', armor: 0x34302a };
const SPAWN = { x: 0, z: -40 };
const TONO = { x: -4, z: 22 };       // 戸の本の野
const SIDE = { x: 6, z: 44 };        // 元親の横
const GATE = { x: 0, z: 96 };        // 長浜城の門前

export const c01_nagahama = chosoBattle({
  id: 'c01_nagahama',
  date: '永禄三年（1560）五月　朝　土佐国 長浜',
  intro: '国親様が本山の長浜城を攻める。若殿の元親様は、これが初陣。戸の本の野に、本山の兵が出てきた。',
  history: '永禄三年（1560）五月、長宗我部国親は本山茂辰の長浜城を攻め、戸の本で本山勢と戦った。二十二歳の元親はこれが初陣で、家臣に槍の突き方を問い、自ら駆け入って武功を挙げたと伝わる。この年に国親が没し、元親が家を継いだ（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '本山の軍', mon: 'maru', faction: 'miyoshi' } },
  force: { a: 1000, b: 2000 },
  foeLook: MOTO,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1560, time: 'morning', fogFar: 420,
    hills: [[-150, 60, 70, 14], [150, 80, 70, 16], [GATE.x, GATE.z + 40, 40, 10], [-140, -140, 80, 20], [140, -150, 80, 18]],
    paths: [{ pts: [[0, -140], [0, -40], [-4, 22], [0, 96], [0, 160]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -120 && Math.abs(x) > 8 && Math.abs(x) < 110 && (Math.abs(x) % 22) > 1.4 && (Math.abs(z) % 20) > 1.4 ? 1 : 0),
    groves: [{ x: -150, z: 60, r: 30, n: 26 }, { x: 150, z: 80, r: 30, n: 26 }],
    trees: 360, tufts: 1800,
  },
  allies: [
    { name: '長宗我部国親の旗本', at: { x: SPAWN.x - 10, z: SPAWN.z - 10 }, fixed: true, list: [busho('長宗我部国親'), uS(4), uA(6)] },
    { name: '長宗我部元親の手', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [busho('長宗我部元親'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '秦泉寺、槍はどう突くのじゃ', 3],
      ['秦泉寺豊後', '敵の目を突きなされ。大将は先を駆けず、後ろにおるものでござる', 3.6],
      ['組頭', '若殿の初陣じゃ。わしらが前で槍を揃えるぞ', 3]] },
    { kind: 'fight', at: TONO, obj: '戸の本の野で、本山の先手を破る', title: '戸の本', sub: '本山の先手が野に出る',
      say: [['長宗我部元親', '者ども、続け！', 2.6], ['本山の侍', '姫若子の初陣か！　討ち取れ！', 3]],
      foes: [{ name: '本山の先手', from: { x: TONO.x + 6, z: TONO.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 26, say: ['本山の侍', '弓、放て！'], foes: [{ name: '本山の弓', from: { x: TONO.x - 18, z: TONO.z + 18 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '戸の本で本山の先手を破った' },
    { kind: 'hold', at: SIDE, label: '元親の横', obj: '駆け入った元親の横を守る', r: 16, dur: 60, title: '若殿の槍', sub: '本山の二の手が寄せる',
      say: [['組頭', '若殿が駆け入った！　横を空けるな！', 3]],
      waves: [{ t: 0, say: ['本山の侍', '若殿を囲め！'], foes: [{ name: '本山の二の手', from: { x: SIDE.x + 16, z: SIDE.z + 30 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['本山の侍', 'まだじゃ、押し包め！'], foes: [{ name: '本山の三の手', from: { x: SIDE.x - 16, z: SIDE.z + 34 }, list: [uS(2), uA(10)] }] }],
      reward: '元親の横を守った' },
    { kind: 'fight', at: GATE, obj: '長浜城の門前の本山勢を崩す', title: '長浜城', sub: '門の前で本山勢が踏みとどまる', max: 140,
      say: [['長宗我部国親', '城へ押せ！　本山を土佐から追え！', 3]],
      foes: [{ name: '本山の城兵', from: { x: GATE.x, z: GATE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '本山の侍大将', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['本山の侍', '門を守れ！'], foes: [{ name: '本山の門の兵', from: { x: GATE.x + 14, z: GATE.z + 16 }, list: [uS(2), uA(8)] }] }],
      reward: '長浜城の門前を崩した' },
  ],
  win: {
    banner: '長浜の勝ち', sub: '本山の兵が城を捨てて退く', award: '長浜で元親の初陣に付いた',
    say: [['組頭', '本山の兵が退いていく。長浜の城は取ったぞ', 3.2],
      ['秦泉寺豊後', '若殿、大将は後ろにと申したはずでござる', 3],
      ['長宗我部元親', 'ははは。槍は、目を突けばよいのじゃな', 3]],
  },
});
export default c01_nagahama;
