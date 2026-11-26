// 北条家編 二戦目「河越夜戦」（天文十五年〔1546〕四月二十日・武蔵国 河越城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'④）
//   史実：山内・扇谷の両上杉と古河公方 足利晴氏の連合（八万と号す）が河越城を半年囲んだ。城は北条綱成が三千ほどで守った。
//   氏康は八千ほどで後詰に来て、夜に連合の陣を突いた。綱成も城から打って出て「勝った、勝った」と叫んで駆け、扇谷の上杉朝定は討死、連合は崩れた
//   （『北条五代記』B・『関八州古戦録』B・川越市の解説 C。兵数は軍記の数で、盛られた説あり）。
//   狼煙の網（hojo_noroshi.js）：城の西の櫓台で火を上げると、南の野に氏康の本隊が出る（城と後詰が合図で動いた話は推＝綱成の弟 福島勝広が囲みを抜けて氏康と通じた話を、火の合図に置き換えた）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';
import { withCastle } from './light_castle.js';
import { KAWAGOE_PLAN } from './castles/kawagoe.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const RENGO = { flag: 'uesugi', armor: 0x24221f };
const SPAWN = { x: 0, z: 40 };
const MON = { x: 0, z: 20 };          // 河越城の南の門の前
const BEACON = { x: -70, z: 30 };     // 西の櫓台（狼煙台）
const JIN = { x: 10, z: -50 };        // 扇谷上杉の陣（城の北）
const N = noroshi({
  beacon: BEACON, beaconStep: 2,
  far: [{ x: -180, z: 160 }, { x: -60, z: 260 }],
  reliefFrom: { x: 60, z: 140 }, reliefTo: { x: 10, z: -20 }, reliefFace: Math.PI,
  relief: { name: '北条氏康の本隊', list: [busho('北条氏康'), uS(4), uA(14), uG(3)], say: ['北条氏康', '夜討ちじゃ！　連合の陣を突け！'], foeSay: ['上杉の侍', '南から北条の大軍！　夜討ちじゃ！'] },
});

export const h01_kawagoe = withCastle(lightBattle({
  id: 'h01_kawagoe',
  date: '天文十五年（1546）四月二十日　夜　武蔵国 河越城',
  intro: '河越の城は半年も囲まれている。今宵、氏康様が後詰に来る。櫓台に火を上げて、夜討ちの合図を送る。',
  history: '天文十五年（1546）、両上杉と古河公方の連合（八万と号す）が河越城を囲んだ。城は北条綱成が守り、氏康は後詰に来て夜に連合の陣を突いた。綱成も城から打って出て、扇谷の上杉朝定は討死し、連合は崩れた。兵の数は軍記の数で、諸説ある。',
  sides: { a: { name: '北条綱成・氏康の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '両上杉と古河公方の連合', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 11000, b: 40000 },
  allyLook: HOJO, foeLook: RENGO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1546, time: 'night', fogFar: 360,
    river: [[-220, 90], [-100, 96], [0, 92], [100, 98], [220, 94]], riverW: 10, riverDepth: 0.5,
    hills: [[-70, 34, 30, 6], [80, -90, 60, 8]],
    paths: [{ pts: [[0, 160], [0, 40], [0, 20], [10, -50]], w: 3 }, { pts: [[0, 30], [-70, 30]], w: 2 }],
    groves: [{ x: -120, z: -40, r: 30, n: 30 }, { x: 110, z: 30, r: 26, n: 24 }],
    trees: 420, tufts: 1600,
  },
  allies: [
    { name: '北条綱成の手', at: { x: MON.x, z: MON.z + 14 }, fixed: true, list: [busho('北条綱成'), uS(4), uA(6)] },
    { name: '門の足軽', at: { x: MON.x - 10, z: MON.z + 2 }, face: Math.PI, list: [uS(2), uA(12)] },
    { name: '門の弓衆', at: { x: MON.x + 12, z: MON.z + 4 }, face: Math.PI, list: [uS(1), uB(8)] },
    { name: '狼煙番', at: { x: BEACON.x + 4, z: BEACON.z + 4 }, face: Math.PI, list: [uS(1), uA(5)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条綱成', '半年守った。今宵、殿が来られる', 3.2],
      ['組頭', '西の櫓台に火を上げれば、それが夜討ちの合図じゃ', 3.2],
      ['北条綱成', 'まずは門じゃ。連合の夜回りを追い返せ', 3]] },
    { kind: 'hold', at: MON, label: '南の門', obj: '南の門の前で、連合の夜回りを追い返す', r: 16, dur: 55, title: '南の門', sub: '連合の兵が門を探りに来る',
      say: [['上杉の侍', '城の兵は痩せておる。門を破れ！', 3]],
      waves: [
        { t: 2, foes: [{ name: '連合の夜回り', from: { x: MON.x - 4, z: MON.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 長野' } }, uS(2), uA(16)] }] },
        { t: 30, say: ['見張り', '堀の東からも来る！'], foes: [{ name: '連合の二の手', from: { x: MON.x + 24, z: MON.z - 36 }, list: [uS(2), uA(12)] }] }],
      reward: '南の門で連合の夜回りを追い返した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MON.x + -14, z: MON.z + -12 }, obj: '堀の際で、門へ梯子を掛ける連合の兵を討て', limit: 90,
      say: [['組頭', '梯子を掛ける連合の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '梯子を掛ける連合の兵', from: { x: MON.x + -22, z: MON.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '梯子を掛ける連合の兵を破った' },
    { kind: 'move', at: BEACON, label: '狼煙台', obj: '西の櫓台へ走る', r: 9, max: 100,
      say: [['北条綱成', '櫓台へ行け！　乱破が火を消しに来るぞ', 3]] },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '櫓台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '櫓台', sub: '乱破が台を狙う',
      say: [['組頭', '台から離れるな！　火が育つまで守れ！', 3]],
      waves: [
        { t: 3, say: ['上杉の乱破', '狼煙を上げさせるな！'], foes: [{ name: '上杉の乱破', from: { x: BEACON.x - 10, z: BEACON.z - 30 }, list: [uS(1), uA(8)] }] },
        { t: 32, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x - 34, z: BEACON.z + 20 }, list: [uS(1), uA(7)] }] }],
      reward: '櫓台を乱破から守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BEACON.x + -10, z: BEACON.z + 14 }, obj: '櫓台の下の草むらで、火矢を構える連合の乱破を討て', limit: 90,
      say: [['組頭', '火矢を構える連合の乱破じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '火矢を構える連合の乱破', from: { x: BEACON.x + -18, z: BEACON.z + 4 }, list: [uS(2), uA(10)] }],
      reward: '火矢を構える連合の乱破を破った' },
    { kind: 'hold', at: MON, label: '南の門', obj: '門へ戻り、打って出る支度の間、連合の寄せを受け止める', r: 16, dur: 55, title: '夜討ち', sub: '南の野で鬨の声が上がる',
      say: [['北条綱成', '殿の鬨じゃ！　門を開く支度をせよ', 3]],
      waves: [
        { t: 4, foes: [{ name: '連合の寄せ手', from: { x: MON.x - 10, z: MON.z - 42 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['見張り', '新手じゃ！'], foes: [{ name: '連合の新手', from: { x: MON.x + 16, z: MON.z - 46 }, list: [uS(2), uA(12)] }] }],
      reward: '門で連合の寄せを受け止めた' },
    { kind: 'fight', at: JIN, limit: 140, obj: '綱成と打って出、扇谷上杉の陣を崩す', title: '勝った、勝った', sub: '綱成が城から打って出た',
      say: [['北条綱成', '勝った！　勝った！　駆けよ！', 3]],
      foes: [{ name: '扇谷上杉の陣', from: { x: JIN.x, z: JIN.z - 10 }, list: [busho('扇谷上杉の侍大将', { mustLive: false, invuln: false }), uS(4), uA(20)] }],
      later: [{ t: 30, say: ['上杉の侍', '朝定様をお守りせよ！'], foes: [{ name: '扇谷上杉の旗本', from: { x: JIN.x - 20, z: JIN.z - 20 }, list: [uS(2), uA(12)] }] }],
      reward: '扇谷上杉の陣を崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: JIN.x + -12, z: JIN.z + -14 }, obj: '扇谷の陣の跡で、朝定を逃がす旗本を討て', limit: 90,
      say: [['組頭', '朝定を逃がす旗本じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '朝定を逃がす旗本', from: { x: JIN.x + -20, z: JIN.z + -24 }, list: [uS(2), uA(10)] }],
      reward: '朝定を逃がす旗本を破った' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [
      ['使番', '扇谷の朝定様、討たれたり！　連合の陣が揺れております', 3.2],
      ['北条氏康', '山内の陣が残っておる。立て直す前に突け', 3.2]] },
    // K652⑥ 逸話の段：山内上杉の老臣 難波田憲重は、崩れた陣の殿に踏みとどまり、北条勢に斬り込んで討死した（『関八州古戦録』B）。本人は丘の下で、その殿の手を受けて斬る
    { kind: 'fight', at: { x: 60, z: -56 }, limit: 100, obj: '丘の下で、難波田憲重の殿の手を斬り伏せる', title: '難波田憲重', sub: '老臣が殿に踏みとどまる',
      say: [['難波田憲重', '憲政様を落とす間じゃ。この老骨、ここで北条に斬り込む', 3.4]],
      foes: [{ name: '難波田憲重の殿', from: { x: 66, z: -66 }, list: [busho('難波田憲重', { mustLive: false, invuln: false }), uS(2), uA(10)] }],
      reward: '難波田憲重の殿の手を斬り伏せた' },
    { kind: 'fight', at: { x: 86, z: -70 }, limit: 140, obj: '東の丘の山内上杉の陣を突き崩す', title: '山内の陣', sub: '上杉憲政の兵が丘の上で立て直す',
      say: [['北条綱成', '丘を駆け上がれ！　憲政を逃がすな！', 3]],
      foes: [{ name: '山内上杉の陣', from: { x: 92, z: -84 }, list: [busho('山内上杉の侍大将', { mustLive: false, invuln: false }), uS(4), uA(18), uB(4)] }],
      later: [{ t: 30, say: ['上杉の侍', '憲政様を上野へ落とせ！　ここで食い止めよ！'], foes: [{ name: '山内の殿', from: { x: 66, z: -96 }, list: [uS(2), uA(12)] }] }],
      reward: '山内上杉の陣を崩した' },
    { kind: 'fight', at: { x: -76, z: -84 }, limit: 140, obj: '西の古河公方の陣を崩し、連合を追い散らす', title: '公方の陣', sub: '足利晴氏の陣が逃げ支度をしている',
      say: [['北条氏康', '公方の陣じゃ。旗を倒せば、連合は散る', 3.2]],
      foes: [{ name: '古河公方の陣', from: { x: -82, z: -98 }, list: [{ type: 'samurai', n: 1, o: { name: '公方の組頭' } }, uS(4), uA(18), uG(2)] }],
      later: [{ t: 28, say: ['見張り', '林から公方の兵が出た！'], foes: [{ name: '林の公方の兵', from: { x: -116, z: -52 }, list: [uS(2), uA(10)] }] }],
      reward: '古河公方の陣を追い散らした' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '河越の夜戦の勝ち', sub: '連合は崩れ、上杉朝定は討たれた', award: '河越の城を守り抜き、夜討ちで連合を破った',
    say: [['北条綱成', '半年の籠城が報われた。勝ったぞ', 3.2],
      ['北条氏康', '城が持ちこたえ、合図が届いた。だから勝てた', 3.4]],
  },
}), { plan: KAWAGOE_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default h01_kawagoe;
