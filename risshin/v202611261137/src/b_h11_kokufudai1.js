// 北条家編 一戦目「第一次国府台合戦」（天文七年〔1538〕十月七日・下総国 国府台）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：北条氏綱・氏康は江戸川（太日川）を松戸の側で渡り、相模台で小弓公方 足利義明の軍とぶつかった。義明は自ら打って出て討死し、
//   国府台に陣した里見義堯は戦わずに安房へ退いた（『快元僧都記』A・『北条五代記』B・市川市・松戸市の解説 C。兵数は北条約二万・小弓方約一万の通説）。
//   主人公は初陣の足軽（氏康の手）。①渡し ②相模台で小弓方の打って出るのを受ける ③義明の旗本を崩す ④退く里見の殿を追う
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const KOYUMI = { flag: 'maru', armor: 0x3a2e24 };
const SPAWN = { x: 0, z: 150 };
const WATASHI = { x: -6, z: 96 };     // 松戸の渡しの岸（北の岸）
const SAGAMIDAI = { x: 10, z: 40 };   // 相模台
const HONJIN = { x: -8, z: -14 };     // 義明の旗本
const KONODAI = { x: 24, z: -70 };    // 国府台の里見の陣の口

export const h11_kokufudai1 = lightBattle({
  id: 'h11_kokufudai1',
  date: '天文七年（1538）十月七日　晴れ　下総国 相模台',
  intro: '氏綱様と氏康様が、松戸の渡しで川を越える。台の上には小弓公方の旗。これが初陣じゃ。',
  history: '天文七年（1538）十月、北条氏綱・氏康は江戸川を渡り、下総の相模台で小弓公方 足利義明の軍と戦った。義明は自ら打って出て討死し、国府台に陣していた里見義堯は戦わずに退いた。この勝ちで北条は下総へ力を伸ばした。',
  sides: { a: { name: '北条氏綱・氏康の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '小弓公方 足利義明と里見義堯', mon: 'maru', faction: 'satomi' } },
  force: { a: 20000, b: 10000 },
  allyLook: HOJO, foeLook: KOYUMI,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1538, time: 'day', autumn: true, fogFar: 400,
    river: [[-220, 120], [-100, 116], [0, 120], [100, 114], [220, 118]], riverW: 14, riverDepth: 0.5,
    hills: [[10, 30, 60, 12], [30, -70, 70, 18], [-80, -20, 50, 8]],
    paths: [{ pts: [[0, 190], [0, 150], [-6, 96], [10, 40], [-8, -14], [24, -70]], w: 3 }],
    groves: [{ x: -70, z: 40, r: 26, n: 26 }, { x: 80, z: -30, r: 30, n: 30 }],
    trees: 480, tufts: 1800,
  },
  allies: [
    { name: '北条氏康の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 10 }, list: [busho('北条氏康'), uS(3), uA(14)] },
    { name: '北条の先手', at: { x: SPAWN.x - 14, z: SPAWN.z - 14 }, list: [uS(3), uA(14)] },
    { name: '北条の弓衆', at: { x: SPAWN.x, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏康', '川を越えれば相模台じゃ。小弓の公方様が台の上で待っておる', 3.4],
      ['組頭', '初陣じゃな。わしの背から離れるな', 3]] },
    { kind: 'move', at: WATASHI, label: '松戸の渡し', obj: '松戸の渡しで川を越え、北の岸へ上がる', r: 12, max: 110,
      say: [['組頭', '浅瀬を選べ。具足を濡らすな', 3]],
      ambush: { t: 6, foes: [{ name: '岸の物見', from: { x: WATASHI.x + 16, z: WATASHI.z - 20 }, list: [uS(1), uA(8)] }] } },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: WATASHI.x + 10, z: WATASHI.z + -18 }, obj: '渡しの北の岸で、岸を窺う小弓方の物見を討て', limit: 90,
      say: [['組頭', '岸を窺う小弓方の物見じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '岸を窺う小弓方の物見', from: { x: WATASHI.x + 18, z: WATASHI.z + -28 }, list: [uS(2), uA(10)] }],
      reward: '岸を窺う小弓方の物見を破った' },
    { kind: 'hold', at: SAGAMIDAI, label: '相模台', obj: '相模台の下で、小弓方の打って出るのを受け止める', r: 16, dur: 75, title: '相模台', sub: '台の上から小弓方が駆け下りる',
      say: [['北条氏康', '公方様の兵は勇ましい。じゃが数はわしらが多い。崩れるな', 3.4]],
      waves: [
        { t: 3, say: ['小弓方の侍', '北条を川へ追い落とせ！'], foes: [{ name: '小弓方の先手', from: { x: SAGAMIDAI.x - 6, z: SAGAMIDAI.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '小弓方の組頭 逸見' } }, uS(2), uA(14)] }] },
        { t: 34, say: ['見張り', '林から弓が来る！'], foes: [{ name: '小弓方の弓', from: { x: SAGAMIDAI.x + 30, z: SAGAMIDAI.z - 26 }, list: [uS(1), uB(8)] }] },
        { t: 60, say: ['組頭', '二の手じゃ！　槍を揃えよ！'], foes: [{ name: '小弓方の二の手', from: { x: SAGAMIDAI.x - 26, z: SAGAMIDAI.z - 34 }, list: [{ type: 'samurai', n: 1, o: { name: '小弓方の組頭 佐野' } }, uS(2), uA(12)] }] }],
      reward: '相模台で小弓方の打って出るのを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAGAMIDAI.x + 30, z: SAGAMIDAI.z + -22 }, obj: '相模台の林で、伏せた小弓方の弓を討て', limit: 90,
      say: [['組頭', '伏せた小弓方の弓じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた小弓方の弓', from: { x: SAGAMIDAI.x + 38, z: SAGAMIDAI.z + -32 }, list: [uS(2), uA(8), uB(3)] }],
      reward: '伏せた小弓方の弓を破った' },
    { kind: 'fight', at: HONJIN, limit: 150, obj: '台の上の足利義明の旗本を崩す', title: '公方の旗本', sub: '義明が自ら槍を取って打って出た',
      // K652⑥ 逸話の段：小弓公方 足利義明は自ら先頭で北条勢に斬り込み、相模の横井神助の矢を受けて討死した（『快元僧都記』A・『小弓御所様御討死軍物語』B）。本人は義明の前に立ち、その槍を受けて斬る
      say: [['物見', '公方様が自ら前へ出られた！', 3], ['足利義明', '北条ごときに退く公方ではない。わしに続け！', 3.2], ['北条氏綱', '公方様の前を塞げ。横井神助、弓を放て', 3.2]],
      foes: [{ name: '足利義明の旗本', from: { x: HONJIN.x, z: HONJIN.z - 10 }, list: [busho('足利義明', { mustLive: false, invuln: false }), uS(3), uA(18)] }],
      reward: '公方の旗本を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HONJIN.x + -14, z: HONJIN.z + -22 }, obj: '義明の旗の後ろへ逃げ込む小弓方の侍を追え', limit: 90,
      say: [['組頭', '逃げ込む小弓方の侍じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '逃げ込む小弓方の侍', from: { x: HONJIN.x + -22, z: HONJIN.z + -32 }, list: [uS(2), uA(10)] }],
      reward: '逃げ込む小弓方の侍を破った' },
    { kind: 'fight', at: KONODAI, limit: 140, obj: '国府台の口で、退く里見の殿を追う', title: '国府台', sub: '里見義堯は戦わずに安房へ退く',
      say: [['使番', '公方様、お討死！　里見は陣を払うぞ！', 3.2], ['組頭', '殿を追え。じゃが深追いはするな', 3]],
      foes: [{ name: '里見の殿', from: { x: KONODAI.x, z: KONODAI.z - 12 }, list: [uS(3), uA(20), uG(3)] }],
      reward: '里見の殿を追った' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KONODAI.x + -16, z: KONODAI.z + -12 }, obj: '国府台の口で、取って返す里見の足軽を払え', limit: 90,
      say: [['組頭', '取って返す里見の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '取って返す里見の足軽', from: { x: KONODAI.x + -24, z: KONODAI.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '取って返す里見の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '足利義明様、お討死！　弟の基頼様が残りの兵をまとめておりまする', 3.4],
      ['北条氏綱', '基頼を討てば、小弓の方は終わる', 3]] },
    { kind: 'fight', at: { x: -60, z: -24 }, limit: 140, obj: '台の西で、残りの兵をまとめる基頼の手を崩す', title: '基頼の手', sub: '小弓方が台の西で固まる',
      say: [['組頭', '旗を立て直す前に突け！', 3]],
      foes: [{ name: '基頼の手', from: { x: -70, z: -30 }, list: [busho('足利基頼', { mustLive: false, invuln: false }), uS(4), uA(16), uB(3)] }],
      later: [{ t: 30, say: ['小弓の侍', '公方様の仇じゃ！'], foes: [{ name: '小弓の新手', from: { x: -90, z: 0 }, list: [uS(2), uA(10)] }] }],
      reward: '基頼の手を崩した' },
  ],
  win: {
    banner: '相模台の勝ち', sub: '小弓公方は討たれ、里見は安房へ退いた', award: '初陣で小弓方を破った',
    say: [['北条氏綱', '公方様は討たれた。これで下総へ道が開ける', 3.4],
      ['組頭', 'よう生きて帰った。それが一番の手柄じゃ', 3]],
  },
});
export default h11_kokufudai1;
