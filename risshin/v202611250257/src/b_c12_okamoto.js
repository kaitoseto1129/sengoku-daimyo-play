// 長宗我部家編 五「岡本城の戦い」（天正七年〔1579〕五月・伊予国 三間 岡本城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：元親の重臣 久武親信は伊予の岡本城を攻めたが、城を守る土居清良の伏兵に遭って討たれ、長宗我部勢は退いた（『清良記』B・宇和島市の解説 C・兵の数は推）。
//   この家の負け戦。勝ち負けの「勝ち」は、退き口を守り切って味方を土佐へ帰す事（呼び集めは使わない）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const DOI = { flag: 'maru', armor: 0x302c28 };
const SPAWN = { x: 0, z: -40 };
const SLOPE = { x: 0, z: 30 };      // 城の坂の下
const GATE = { x: 4, z: 70 };       // 岡本城の木戸の前
const BACK = { x: -4, z: 0 };       // 退き口（谷の出口）
const PASS = { x: 0, z: -78 };      // 土佐へ帰る峠の口

export const c12_okamoto = chosoBattle({
  id: 'c12_okamoto',
  date: '天正七年（1579）五月　昼　伊予国 三間 岡本城',
  intro: '久武親信様が、伊予の岡本城を攻める。城を守るのは土居清良。山の木立が、やけに静かだ。',
  history: '天正七年（1579）五月、長宗我部の重臣 久武親信は伊予の岡本城を攻めたが、城を守る土居清良の伏兵に遭って討たれ、長宗我部勢は土佐へ退いた。伊予攻めは、この後も長く手こずった（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '土居の軍', mon: 'maru', faction: 'miyoshi' } },
  force: { a: 3000, b: 1000 },
  foeLook: DOI,
  thick: true,   // 11/25 act bot で討ち取り3（4分）＝受けの段に三の手・激突の段に新手（light_battle.js thickWaves）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1579, time: 'day', fogFar: 380, overcast: true,
    hills: [[GATE.x, GATE.z + 30, 40, 18], [-60, 40, 40, 16], [60, 40, 40, 16], [-80, -60, 50, 18], [80, -60, 50, 18], [0, -130, 60, 14]],
    paths: [{ pts: [[0, -140], [0, -78], [-4, 0], [0, 30], [4, 70], [0, 120]], w: 2.6 }],
    groves: [{ x: -60, z: 40, r: 30, n: 34 }, { x: 60, z: 40, r: 30, n: 34 }, { x: -80, z: -60, r: 30, n: 26 }, { x: 80, z: -60, r: 30, n: 26 }],
    trees: 460, tufts: 1500,
  },
  allies: [
    { name: '久武親信の手', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, list: [uS(4), uA(8)] },
    { name: '長宗我部の侍', at: { x: SPAWN.x - 10, z: SPAWN.z - 4 }, list: [busho('福留親政'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(2)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['久武親信', '岡本の城は小さい。一息に揉み落とせ', 3],
      ['組頭', '山の木立が静かすぎる。足元に気をつけよ', 3],
      ['福留親政', '久武殿、あまり深く入られるな', 3]] },
    { kind: 'fight', at: SLOPE, obj: '坂の下の土居の備を破る', title: '岡本城', sub: '坂の下に土居の備',
      say: [['久武親信', '押せ！　城は目の前じゃ！', 2.8], ['土居の侍', '引きつけよ。まだ出るな', 3]],
      foes: [{ name: '土居の坂の備', from: { x: SLOPE.x + 4, z: SLOPE.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 26, say: ['土居の侍', '弓、坂の上から射よ！'], foes: [{ name: '土居の弓', from: { x: SLOPE.x + 18, z: SLOPE.z + 20 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '坂の下の備を破った' },
    { kind: 'fight', at: GATE, obj: '木戸の前で、出てきた伏兵を払う', title: '伏兵', sub: '木立から土居の兵が湧く', max: 120,
      say: [['土居清良', '今じゃ！　木立から出よ！', 3], ['組頭', '伏兵じゃ！　囲まれるな！', 3]],
      foes: [{ name: '土居の伏兵', from: { x: GATE.x - 22, z: GATE.z - 6 }, list: [uS(2), uA(10)] }, { name: '土居の伏兵の二', from: { x: GATE.x + 22, z: GATE.z - 4 }, list: [uS(2), uA(8)] }],
      reward: '伏兵を払った' },
    { kind: 'rest', dur: 10, heal: 0.25, banner: ['久武親信 討死', '伊予 岡本城'], say: [
      ['組頭', '久武様が、討たれた……！', 3],
      ['福留親政', '退け！　土佐へ退くぞ！　一領具足は退き口を守れ！', 3.4]] },
    { kind: 'hold', at: BACK, label: '退き口', obj: '谷の出口で追手を止め、味方を退かせる', r: 16, dur: 70, title: '退き口', sub: '土居の追手',
      say: [['組頭', 'ここで止めるぞ。皆が峠を越えるまでじゃ', 3]],
      waves: [{ t: 0, say: ['土居の侍', '逃がすな！　追え！'], foes: [{ name: '土居の追手', from: { x: BACK.x + 6, z: BACK.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 32, say: ['土居の侍', '横から回れ！'], foes: [{ name: '土居の追手の二', from: { x: BACK.x - 22, z: BACK.z + 26 }, list: [uS(2), uA(10)] }] }],
      reward: '退き口を守った' },
    { kind: 'move', at: PASS, label: '峠の口', obj: '峠の口まで退く', r: 10, max: 90,
      say: [['福留親政', 'よし、退け！　峠へ！', 2.8]] },
  ],
  win: {
    banner: '退き口を守った', sub: '長宗我部勢が土佐へ戻る', award: '岡本城の退き口を守った',
    say: [['組頭', '……生きて帰れる者は、皆帰したぞ', 3],
      ['福留親政', '久武殿の首は、伊予に残ってしもうた', 3.2],
      ['組頭', '伊予は手強い。土居清良、覚えておけ', 3]],
  },
});
export default c12_okamoto;
