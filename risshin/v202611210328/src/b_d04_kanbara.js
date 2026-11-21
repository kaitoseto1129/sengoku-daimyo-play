// 武田編 四戦目「蒲原城攻め」（永禄十二年〔1569〕十二月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：駿河へ攻め入った信玄は、北条方の北条氏信（綱重）の守る蒲原城を攻めた。勝頼と信豊が城の下の町へ火を放って城兵を誘い出し、
//   打って出た城兵を破ってそのまま城へ攻め入り、一日で落とした。氏信は討死（『甲陽軍鑑』・静岡市の史跡の案内）。勝頼の早い手柄の一つ。
//   主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const MACHI = { x: -8, z: 86 };       // 城の下の町（火を放つ）
const NO = { x: 6, z: 50 };           // 打って出た城兵と当たる野
const OTE = { x: 0, z: 10 };          // 大手の坂
const HON = { x: -2, z: -32 };        // 本曲輪

export const d04_kanbara = lightBattle({
  id: 'd04_kanbara',
  date: '永禄十二年（1569）十二月六日　晴れ　駿河国 蒲原城',
  intro: '駿河の海を見下ろす蒲原城に、北条氏信が籠もる。勝頼は城の下の町に火を放ち、城兵を誘い出す。',
  history: '永禄十二年（1569）、武田信玄は駿河の蒲原城を攻めた。勝頼らが城の下に火を放って城兵を誘い出し、打って出た城兵を破ってそのまま攻め入り、一日で城を落とした。城主の北条氏信は討死した。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏信の城兵', mon: 'hojo', faction: 'hojo' } },
  force: { a: 6000, b: 1200 },
  allyLook: TAKEDA, foeLook: HOJO,
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1569, time: 'day', winter: true, fogFar: 420,
    hills: [[0, -30, 44, 24], [-90, -60, 60, 30], [100, -50, 60, 28], [60, 110, 40, 6]],
    trees: 520, tufts: 1500,
  },
  allies: [
    { name: '武田勝頼の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, list: [busho('武田勝頼'), uS(4), uA(16)] },
    { name: '武田信豊の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [busho('武田信豊'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '町に火を放て。城の者が黙って見てはおれぬ', 3.2],
      ['武田信豊', '城兵が出れば、そのまま城の門へ付いて入る', 3]] },
    { kind: 'move', at: MACHI, label: '城の下の町', obj: '城の下の町へ火を放ちに走る', r: 14,
      say: [['組頭', '松明を持て！　町の端から火をかけよ！', 3]] },
    { kind: 'fight', at: NO, obj: '打って出た城兵を、野で迎え討つ', title: '打って出', sub: '火を見た城兵が門を開けて駆け下りて来る',
      say: [['北条の侍', '町を焼かせるな！　出て払え！', 3]],
      foes: [
        { name: '打って出た城兵', from: { x: NO.x, z: NO.z - 18 }, list: [uS(5), uA(26)] },
        { name: '城兵の鉄砲', from: { x: NO.x + 16, z: NO.z - 24 }, list: [uG(6)] }],
      reward: '打って出た城兵を破った' },
    { kind: 'fight', at: OTE, obj: '退く城兵に付いて、大手の坂を駆け上る', title: '大手の坂', sub: '城兵が門へ逃げ込む。門を閉じる前に付いて入る',
      say: [['武田勝頼', '門を閉じさせるな！　逃げる者の背に付いて入れ！', 3.2]],
      foes: [{ name: '大手の守り', from: { x: OTE.x, z: OTE.z - 10 }, list: [uS(4), uA(22), uB(4)] }],
      reward: '大手を破った' },
    { kind: 'fight', at: HON, obj: '本曲輪で北条氏信の旗本を討つ', title: '本曲輪', sub: '北条氏信が最後の旗本と踏みとどまる',
      say: [['北条氏信', '小田原の名を汚すな。ここで死ぬぞ', 3.2]],
      foes: [{ name: '北条氏信の旗本', from: { x: HON.x, z: HON.z - 6 }, list: [busho('北条氏信', { mustLive: false, invuln: false }), uS(6), uA(13)] }],
      reward: '蒲原城を一日で落とした' },
  ],
  win: {
    banner: '蒲原城 落城', sub: '城主 北条氏信 討死。駿河の東の口が開いた', award: '蒲原城を落とした',
    say: [['武田信豊', '一日で落ちた。勝頼殿の火の手柄じゃ', 3.2],
      ['武田勝頼', '次は駿府じゃ。今川の残りを掃う', 3]],
  },
});
export default d04_kanbara;
