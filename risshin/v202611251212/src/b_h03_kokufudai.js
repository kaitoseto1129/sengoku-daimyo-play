// 北条家編 五戦目「第二次国府台合戦」（永禄七年〔1564〕一月七日〜八日・下総国 国府台）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：里見義弘が国府台に陣した。一日目、北条の先手の遠山綱景・富永直勝は江戸川を渡って攻めかかり、討死した。
//   勝った里見の陣が気を緩めた次の夜明け、氏康は回り込んで里見の陣を突き、大いに破った（『関八州古戦録』B・市川市の解説 C）。
//   主人公は氏康の手。①一日目、崩れた遠山の手を川岸で受けて退かせる ②夜明けに里見の陣を突く ③義弘の旗本を崩す
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const SATOMI = { flag: 'maru', armor: 0x3a2e24 };
const SPAWN = { x: 0, z: 150 };
const KISHI = { x: 0, z: 104 };     // 江戸川の岸（北条の側）
const JIN = { x: 20, z: 20 };       // 里見の陣（国府台の下）
const HATA = { x: 0, z: -40 };      // 里見義弘の旗本（台の上）

export const h03_kokufudai = lightBattle({
  id: 'h03_kokufudai',
  date: '永禄七年（1564）一月　冬・晴れ　下総国 国府台',
  intro: '里見が国府台に陣した。先手の遠山様が川を渡ったが、崩れて戻って来る。',
  history: '永禄七年（1564）一月、里見義弘は国府台に陣した。一日目、北条の先手の遠山綱景・富永直勝は江戸川を渡って攻め、討死した。勝って気を緩めた里見の陣を、氏康は次の夜明けに回り込んで突き、大いに破った。',
  sides: { a: { name: '北条氏康・氏政の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '里見義弘の軍', mon: 'maru', faction: 'satomi' } },
  force: { a: 20000, b: 8000 },
  allyLook: HOJO, foeLook: SATOMI,
  friendsSend: 1,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1564, time: 'morning', winter: true, fogFar: 380, sky: { mist: true },
    river: [[-220, 90], [-100, 86], [0, 92], [100, 84], [220, 90]], riverW: 14, riverDepth: 0.5,
    hills: [[0, -40, 70, 18], [-80, -10, 50, 8]],
    paths: [{ pts: [[0, 190], [0, 150], [0, 104], [20, 20], [0, -40]], w: 3 }],
    groves: [{ x: -70, z: 30, r: 28, n: 28 }, { x: 80, z: -20, r: 30, n: 30 }],
    trees: 480, tufts: 1700,
  },
  allies: [
    { name: '北条氏政の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 8 }, list: [busho('北条氏政'), uS(3), uA(14)] },
    { name: '北条の先手', at: { x: SPAWN.x - 14, z: SPAWN.z - 14 }, list: [uS(3), uA(14)] },
    { name: '北条の鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['使番', '遠山様、富永様、お討死！　先手が川を戻って来まする！', 3.4],
      ['北条氏康', '岸で受けよ。里見を川のこちらへ渡らせるな', 3.2]] },
    { kind: 'hold', at: KISHI, label: '江戸川の岸', obj: '江戸川の岸で、追って来る里見の兵を受け止める', r: 16, dur: 90, title: '川岸', sub: '崩れた先手を追って、里見の兵が川を渡る',
      say: [['組頭', '味方を岸へ上げよ。追手はここで止める！', 3]],
      waves: [
        { t: 4, say: ['里見の侍', '北条は崩れたぞ！　追え！'], foes: [{ name: '里見の追手', from: { x: KISHI.x - 6, z: KISHI.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '里見の組頭 正木' } }, uS(3), uA(20)] }] },
        { t: 36, say: ['見張り', '下の浅瀬からも渡って来る！'], foes: [{ name: '浅瀬の里見', from: { x: KISHI.x + 36, z: KISHI.z - 30 }, list: [uS(2), uA(14)] }] },
        { t: 64, foes: [{ name: '里見の弓', from: { x: KISHI.x - 30, z: KISHI.z - 34 }, list: [uS(1), uB(8)] }] }],
      reward: '川岸で里見の追手を止めた' },
    { kind: 'rest', dur: 10, heal: 0.4, say: [
      ['北条氏康', '里見は勝ったと酒を飲んでおる。夜明けに上の浅瀬から回り込む', 3.4],
      ['組頭', '声を立てるな。夜明けまで待て', 3]] },
    { kind: 'fight', at: JIN, limit: 150, obj: '夜明けに里見の陣へ斬り込む', title: '夜明けの突き', sub: '里見の陣はまだ眠っている',
      say: [['北条氏康', '今じゃ！　突け！', 2.6]],
      foes: [{ name: '里見の陣', from: { x: JIN.x, z: JIN.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '里見の組頭 多賀' } }, uS(4), uA(22)] }],
      later: [{ t: 30, say: ['里見の侍', '北条の夜討ちじゃ！　起きよ！'], foes: [{ name: '里見の陣の二の手', from: { x: JIN.x + 24, z: JIN.z - 20 }, list: [uS(2), uA(12)] }] }],
      reward: '里見の陣を破った' },
    { kind: 'fight', at: HATA, limit: 150, obj: '台の上の里見義弘の旗本を崩す', title: '国府台', sub: '義弘が台の上で兵を立て直す',
      say: [['北条氏政', '義弘の旗が台の上じゃ！　押し上がれ！', 3]],
      foes: [{ name: '里見義弘の旗本', from: { x: HATA.x, z: HATA.z - 10 }, list: [busho('里見の侍大将', { mustLive: false, invuln: false }), uS(4), uA(20), uG(3)] }],
      reward: '里見義弘の旗本を崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '義弘様は馬を替えて逃れた由。里見の兵が台の東の谷へ落ちて行きまする', 3.4],
      ['北条氏康', '谷で拾え。安房へ帰る兵を減らしておけ', 3]] },
    { kind: 'fight', at: { x: 70, z: -26 }, limit: 140, obj: '台の東の林で、落ちる里見の兵をまとめる侍を討つ', title: '東の林', sub: '里見の兵が林で固まる',
      say: [['組頭', '林の中で固まっておる。まとめる侍を討てば散る', 3]],
      foes: [{ name: '林の里見', from: { x: 80, z: -30 }, list: [{ type: 'samurai', n: 1, o: { name: '里見の侍 正木' } }, uS(3), uA(16), uB(3)] }],
      later: [{ t: 30, say: ['里見の侍', '義弘様の落ちる間を稼げ！'], foes: [{ name: '里見の殿', from: { x: 40, z: -70 }, list: [uS(2), uA(10)] }] }],
      reward: '東の林の里見の兵を散らした' },
  ],
  win: {
    banner: '国府台の勝ち', sub: '里見は大きく崩れ、安房へ退いた', award: '国府台で里見を破った',
    say: [['北条氏康', '遠山と富永の仇は討った', 3.2],
      ['組頭', '勝って気を緩めれば、こうなる。わしらも忘れるな', 3.2]],
  },
});
export default h03_kokufudai;
