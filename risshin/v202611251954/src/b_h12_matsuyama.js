// 北条家編 四戦目「武蔵松山城攻め」（永禄六年〔1563〕二月・武蔵国 松山城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：北条氏康は武田信玄と組んで、上杉方の上杉憲勝が守る武蔵松山城を囲んだ。武田の金掘衆が城の下を掘り、
//   岩付の太田資正は外から後詰を試みた。越後の上杉輝虎（謙信）が救いに向かったが、着く前に城は開いた（『関八州古戦録』B・吉見町の解説 C。細部は推）。
//   主人公は氏康の手の足軽。①外の曲輪の口を破る ②金掘の穴の口を太田の後詰から守る ③本曲輪の門を崩す
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { withCastle } from './light_castle.js';
import { MATSUYAMA_PLAN } from './castles/matsuyama.js';   // K657② 松山城を戦場に（11/25 クラウドせ）

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const SPAWN = { x: 0, z: 150 };
const SOTO = { x: 6, z: 80 };       // 外の曲輪の口
const ANA = { x: -30, z: 40 };      // 金掘の穴の口（武田の金掘衆）
const HON = { x: 0, z: -20 };       // 本曲輪の門

export const h12_matsuyama = withCastle(lightBattle({
  id: 'h12_matsuyama',
  date: '永禄六年（1563）二月　冬・曇り　武蔵国 松山城',
  intro: '武田と組んで、上杉方の松山城を囲む。越後の輝虎が来る前に、城を落とす。',
  history: '永禄六年（1563）、北条氏康は武田信玄と組んで、上杉方の武蔵松山城を囲んだ。武田の金掘衆が城の下を掘り、岩付の太田資正は外から救おうとした。上杉輝虎が救いに向かったが、着く前に城は開いた。',
  sides: { a: { name: '北条氏康・武田信玄の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '松山城の上杉方と太田資正', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 30000, b: 5000 },
  allyLook: HOJO, foeLook: UESUGI,
  friendsSend: 1,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1563, time: 'day', overcast: true, winter: true, fogFar: 380,
    river: [[-220, -90], [-100, -86], [0, -92], [100, -84], [220, -90]], riverW: 14, riverDepth: 0.6,
    hills: [[0, -10, 60, 16], [-60, 20, 40, 8], [70, -40, 50, 10]],
    paths: [{ pts: [[0, 190], [0, 150], [6, 80], [-30, 40], [0, -20]], w: 3 }],
    groves: [{ x: -90, z: 60, r: 30, n: 30 }, { x: 90, z: 40, r: 26, n: 26 }],
    trees: 460, tufts: 1600,
  },
  allies: [
    { name: '北条氏康の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z + 10 }, fixed: true, list: [busho('北条氏康'), uS(4), uA(8)] },
    { name: '北条の先手', at: { x: SPAWN.x + 14, z: SPAWN.z - 10 }, list: [uS(3), uA(14)] },
    { name: '武田の金掘衆', at: { x: ANA.x - 6, z: ANA.z + 8 }, fixed: true, list: [uS(1), uA(8)] },
    { name: '北条の鉄砲衆', at: { x: SPAWN.x - 8, z: SPAWN.z - 12 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏康', '輝虎が雪の峠を越える前に、この城を落とす', 3.2],
      ['組頭', '武田の金掘衆が城の下を掘っておる。わしらは外の曲輪じゃ', 3.2]] },
    { kind: 'fight', at: SOTO, limit: 140, obj: '外の曲輪の口を守る上杉方を崩す', title: '外の曲輪', sub: '柵の内から矢が降る',
      say: [['組頭', '柵を引き倒せ！　口を開けよ！', 3]],
      foes: [
        { name: '外の曲輪の守り', from: { x: SOTO.x, z: SOTO.z - 12 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉方の組頭 難波田' } }, uS(2), uA(16)] },
        { name: '柵の弓', from: { x: SOTO.x + 18, z: SOTO.z - 16 }, list: [uS(1), uB(6)] }],
      reward: '外の曲輪の口を破った' },
    { kind: 'hold', at: ANA, label: '金掘の穴', obj: '金掘の穴の口を、外から来る太田の後詰から守る', r: 16, dur: 90, title: '岩付の後詰', sub: '太田資正の兵が、穴を埋めに来る',
      // K652⑥ 逸話の段：太田資正は岩付と松山の城の間に犬を飼い、首の筒に文を入れて走らせ、後詰を呼んだ（三楽犬・『甲陽軍鑑』B）。本人は文を受けて駆け付けた太田の後詰を、穴の口で受ける
      say: [['武田の金掘衆', '穴を潰されたら、ひと月の掘りが無駄になる！', 3.2], ['見張り', '城から犬が走って行ったぞ！　首に筒じゃ。岩付へ文を運んだな', 3.4]],
      waves: [
        { t: 4, say: ['太田の侍', '穴を埋めよ！　城を救え！'], foes: [{ name: '太田資正の先手', from: { x: ANA.x - 40, z: ANA.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '太田の組頭 恒岡' } }, uS(3), uA(20)] }] },
        { t: 36, say: ['見張り', '城からも打って出たぞ！'], foes: [{ name: '城の打って出', from: { x: ANA.x + 10, z: ANA.z - 34 }, list: [uS(2), uA(14)] }] },
        { t: 64, say: ['組頭', '太田の二の手じゃ！'], foes: [{ name: '太田の二の手', from: { x: ANA.x - 44, z: ANA.z - 10 }, list: [uS(2), uA(14)] }] }],
      reward: '金掘の穴の口を守り抜いた' },
    { kind: 'fight', at: HON, limit: 150, obj: '本曲輪の門の前の上杉方を崩す', title: '本曲輪', sub: '穴が崩れ、城の兵がうろたえる',
      say: [['物見', '本曲輪の塀が傾いだ！', 3], ['北条氏康', '今じゃ。門へ寄せよ', 3]],
      foes: [{ name: '本曲輪の守り', from: { x: HON.x, z: HON.z - 10 }, list: [busho('上杉方の侍大将', { mustLive: false, invuln: false }), uS(4), uA(22), uG(3)] }],
      reward: '本曲輪の門を崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '城方が降りまする！　されど太田資正の後詰が、また城の南へ来ておる由', 3.4],
      ['北条氏康', '城を渡すまで、後詰を近寄らせるな', 3]] },
    { kind: 'hold', at: SOTO, label: '外の曲輪', obj: '外の曲輪の口で、城を取り返しに来る太田の後詰を受け止める', r: 16, dur: 70, title: '太田の後詰', sub: '岩付の兵が戻って来る',
      say: [['組頭', '城が開くまでじゃ。持て！', 3]],
      waves: [
        { t: 3, foes: [{ name: '太田の後詰', from: { x: SOTO.x + 10, z: SOTO.z + 46 }, list: [{ type: 'samurai', n: 1, o: { name: '太田の組頭' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '太田の騎馬が回り込む！'], foes: [{ name: '太田の騎馬', from: { x: SOTO.x - 40, z: SOTO.z + 40 }, list: [{ type: 'cavalry', n: 4 }, uS(2), uA(8)] }] }],
      reward: '外の曲輪で太田の後詰を受け止めた' },
    { kind: 'fight', at: { x: 50, z: 110 }, limit: 140, obj: '退く太田の後詰の殿を追う', title: '追い', sub: '資正は岩付へ退く',
      say: [['北条氏康', '二度と後詰に来ぬよう、殿を叩いておけ', 3]],
      foes: [{ name: '太田の殿', from: { x: 56, z: 124 }, list: [busho('太田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(14), uB(3)] }],
      reward: '太田の殿を追い崩した' },
  ],
  win: {
    banner: '松山城の開城', sub: '輝虎が着く前に、城は開いた', award: '松山城を落とした',
    say: [['使番', '城方が降りました。越後勢はまだ峠の向こうにございます', 3.4],
      ['北条氏康', '間に合うたな。輝虎は空の城を見て帰るじゃろう', 3.4]],
  },
}), { plan: MATSUYAMA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default h12_matsuyama;
