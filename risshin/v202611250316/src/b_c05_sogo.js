// 長宗我部家編 八「十河城の戦い」（天正十二年〔1584〕六月・讃岐国 十河城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：中富川で破れた十河存保の残りの兵は讃岐の十河城に籠もった。元親は城を長く囲み、天正十二年六月に落とした。存保は大坂へ逃れた
//   （『土佐物語』B・高松市の解説 C・兵の数は推）。
// 仕組み：一領具足の呼び集め（囲みの後詰の兵を、法螺で呼ぶ形）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const MIYOSHI = { flag: 'miyoshi', armor: 0x3a3226 };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 22, z: -58 };     // 法螺の台
const SAKU = { x: -4, z: 28 };      // 城の外の柵
const DASHI = { x: 8, z: 50 };      // 城兵の打って出る口
const GATE = { x: 0, z: 96 };       // 十河城の大手

export const c05_sogo = chosoBattle({
  id: 'c05_sogo',
  date: '天正十二年（1584）六月　昼　讃岐国 十河城',
  intro: '十河存保の残りの兵が、十河城に籠もって二年。元親様は、今日こそ落とすと決めた。後詰の一領具足が、田で法螺を待つ。',
  history: '中富川で破れた十河存保の兵は、讃岐の十河城に籠もって抗った。長宗我部元親は城を長く囲み、天正十二年（1584）六月に落とした。存保は大坂へ逃れ、讃岐はほぼ長宗我部の物となった（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '十河の軍', mon: 'miyoshi', faction: 'miyoshi' } },
  force: { a: 10000, b: 1500 },
  foeLook: MIYOSHI,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1584, time: 'day', fogFar: 420, overcast: true,
    hills: [[HORA.x, HORA.z, 7, 1.6], [GATE.x, GATE.z + 30, 46, 18], [-150, 60, 70, 16], [150, 70, 70, 18], [-150, -150, 80, 20]],
    paths: [{ pts: [[0, -140], [0, -40], [-4, 28], [8, 50], [0, 96], [0, 150]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 110 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: -150, z: 60, r: 30, n: 26 }, { x: 150, z: 70, r: 30, n: 26 }, { x: GATE.x + 40, z: GATE.z + 30, r: 24, n: 24 }],
    trees: 360, tufts: 1700,
  },
  fields: [{ at: { x: 56, z: -44 }, far: 0 }, { at: { x: -42, z: -52 }, far: 1 }, { at: { x: 64, z: -98 }, far: 2 }, { at: { x: -56, z: -100 }, far: 3 }],
  callSay: ['香川親和', '後詰が来た！　柵を越えるぞ！', '……遅い。集まった者だけで寄せる'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, fixed: true, list: [busho('長宗我部元親'), uS(4), uA(6)] },
    { name: '香川親和の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('香川親和'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '二年も籠もりおって。今日で終わらせる', 3],
      ['組頭', '後詰の一領具足は田におる。法螺の台へ走れ', 3],
      ['香川親和', '城の柵の外に、十河の兵が出ておりまする', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、後詰の一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: SAKU, obj: '城の外の柵の十河の兵を破る', title: '十河城', sub: '柵の外に十河の兵',
      say: [['香川親和', '柵を破れ！', 2.6], ['十河の侍', '土佐の者に城は渡さぬ！', 3]],
      foes: [{ name: '十河の柵の兵', from: { x: SAKU.x + 4, z: SAKU.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['十河の侍', '弓、柵の内から射よ！'], foes: [{ name: '十河の弓', from: { x: SAKU.x + 20, z: SAKU.z + 18 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '城の外の柵を破った' },
    { kind: 'hold', at: DASHI, label: '城の下', obj: '城の下を守り、打って出た城兵を受ける', r: 16, dur: 60, title: '打って出る', sub: '十河の城兵',
      say: [['組頭', '城兵が打って出てくるぞ！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['十河の侍', '打って出よ！　寄せ手を崩せ！'], foes: [{ name: '十河の城兵', from: { x: DASHI.x - 8, z: DASHI.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['十河の侍', '二の手、続け！'], foes: [{ name: '十河の城兵の二', from: { x: DASHI.x + 18, z: DASHI.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '打って出た城兵を受けた' },
    { kind: 'fight', at: GATE, obj: '十河城の大手を破る', title: '大手', sub: '十河の残りの兵が踏みとどまる', max: 140,
      say: [['長宗我部元親', '大手を破れ！　押せ！', 3]],
      foes: [{ name: '十河の大手の兵', from: { x: GATE.x, z: GATE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '十河の城将', horse: false } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['十河の侍', '最後の一人まで守れ！'], foes: [{ name: '十河の旗本', from: { x: GATE.x - 14, z: GATE.z + 16 }, list: [uS(3), uA(8)] }] }],
      reward: '十河城の大手を破った' },
  ],
  win: {
    banner: '十河城の勝ち', sub: '十河存保が大坂へ逃れる', award: '十河城を落とした',
    say: [['組頭', '城が落ちたぞ。二年かかったわ', 3],
      ['長宗我部元親', '讃岐も、これで手に入った', 3],
      ['香川親和', '存保は大坂へ。羽柴を頼るつもりでしょう', 3.2]],
  },
});
export default c05_sogo;
