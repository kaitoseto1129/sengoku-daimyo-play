// 長宗我部家編 四「渡川の戦い」（天正三年〔1575〕・土佐国 渡川＝四万十川）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：豊後から戻った一条兼定が渡川の西に陣し、川に杭を打って待った。元親は福留親政らに上の瀬を渡らせて横を突き、一条勢を破って土佐を一つにした
//   （『土佐物語』B・四万十市の解説 C。長宗我部約七千・一条約三千五百の説・推）。
// 仕組み：一領具足の呼び集め（川の東の田の影を法螺で呼び、横の備を太らせる）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const ICHIJO = { flag: 'sagarifuji', armor: 0x2e2a2a };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 26, z: -58 };     // 法螺の台
const FORD = { x: -30, z: 36 };     // 上の瀬の向こう岸
const BANK = { x: -10, z: 54 };     // 西の岸
const KANE = { x: 8, z: 108 };      // 一条兼定の本陣
const RIVER = [[-220, 20], [-100, 18], [0, 24], [100, 20], [220, 26]];

export const c03_shimanto = chosoBattle({
  id: 'c03_shimanto',
  date: '天正三年（1575）秋　朝　土佐国 渡川',
  intro: '豊後から戻った一条兼定が、渡川の西に陣を張った。川には杭。元親様は、上の瀬を渡って横を突くと決めた。',
  history: '天正三年（1575）、豊後から土佐へ戻った一条兼定は、渡川（四万十川）の西に陣を張り、川に杭を打って長宗我部を待った。元親は兵の一手に上の瀬を渡らせて横から突き、一条勢を破った。兼定は再び豊後へ逃れ、土佐は長宗我部の手で一つになった（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '一条の軍', mon: 'sagarifuji', faction: 'miyoshi' } },
  force: { a: 7000, b: 3500 },
  foeLook: ICHIJO,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1575, time: 'morning', fogFar: 440, autumn: true, mist: 0.25,
    river: RIVER, riverW: 16, riverDepth: 0.6,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 110, 80, 24], [160, 130, 80, 22], [0, 240, 110, 26], [-150, -150, 80, 20], [150, -150, 80, 22]],
    paths: [{ pts: [[0, -140], [0, -40], [-30, 36], [-10, 54], [8, 108], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 120 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: -170, z: 110, r: 30, n: 26 }, { x: 160, z: 130, r: 30, n: 26 }, { x: 150, z: -150, r: 30, n: 22 }],
    trees: 360, tufts: 1800,
  },
  fields: [{ at: { x: 60, z: -42 }, far: 0 }, { at: { x: -44, z: -52 }, far: 1 }, { at: { x: 70, z: -98 }, far: 2 }, { at: { x: -56, z: -98 }, far: 3 }],
  callSay: ['福留親政', '集まったぞ！　上の瀬へ回る！', '……遅い。集まった者だけで渡る'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '福留親政の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('福留親政'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '正面の瀬には杭がある。上の瀬を渡って横を突け', 3.4],
      ['組頭', 'まず法螺の台じゃ。畦の者を呼んで、手を太らせる', 3.2],
      ['福留親政', '霧の晴れぬうちに渡りまするぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: FORD, obj: '上の瀬を渡り、一条の横の備を破る', title: '渡川', sub: '上の瀬の向こうに一条の備',
      say: [['福留親政', '渡れ！　一条の横を突け！', 2.8], ['一条の侍', '瀬を渡ってきたぞ！　防げ！', 3]],
      foes: [{ name: '一条の横の備', from: { x: FORD.x + 4, z: FORD.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['一条の侍', '弓、瀬を射よ！'], foes: [{ name: '一条の弓', from: { x: FORD.x + 22, z: FORD.z + 16 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '渡川の上の瀬を渡った' },
    { kind: 'hold', at: BANK, label: '西の岸', obj: '西の岸を守り、一条の寄せを受ける', r: 16, dur: 60, title: '西の岸', sub: '一条の寄せ',
      say: [['長宗我部元親', '岸を取った！　本隊も渡るぞ、そこを守れ！', 3.2]],
      waves: [{ t: 0, say: ['一条の侍', '川へ押し戻せ！'], foes: [{ name: '一条の先陣', from: { x: BANK.x + 10, z: BANK.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['一条の侍', '二陣、かかれ！'], foes: [{ name: '一条の二陣', from: { x: BANK.x + 26, z: BANK.z + 28 }, list: [uS(2), uA(10)] }] }],
      reward: '西の岸を守った' },
    { kind: 'fight', at: KANE, obj: '一条兼定の本陣を崩す', title: '一条兼定', sub: '本陣の幕の前で踏みとどまる', max: 140,
      say: [['長宗我部元親', '兼定の本陣じゃ！　押せ！', 3]],
      foes: [{ name: '一条兼定の本陣', from: { x: KANE.x, z: KANE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '一条兼定', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['一条の侍', '御所様を守れ！'], foes: [{ name: '一条の旗本', from: { x: KANE.x - 14, z: KANE.z + 18 }, list: [uS(3), uA(8)] }] }],
      reward: '一条兼定の本陣を崩した' },
  ],
  win: {
    banner: '渡川の勝ち', sub: '一条兼定が豊後へ逃れる', award: '渡川で一条兼定を破った',
    say: [['組頭', '一条の兵が散っていく。土佐はこれで一つじゃ', 3.2],
      ['長宗我部元親', '一領具足の槍、見事であった', 3],
      ['福留親政', '次は、四国でございますな', 3]],
  },
});
export default c03_shimanto;
