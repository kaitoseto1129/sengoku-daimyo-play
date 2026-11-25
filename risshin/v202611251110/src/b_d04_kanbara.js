// 武田編 四戦目「蒲原城攻め」（永禄十二年〔1569〕十二月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：駿河へ攻め入った信玄は、北条方の北条氏信（綱重）の守る蒲原城を攻めた。勝頼と信豊が城の下の町へ火を放って城兵を誘い出し、
//   打って出た城兵を破ってそのまま城へ攻め入り、一日で落とした。氏信は討死（『甲陽軍鑑』・静岡市の史跡の案内）。勝頼の早い手柄の一つ。
//   主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { withCastle } from './light_castle.js';
import { KANBARA_PLAN } from './castles/kanbara.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const MACHI = { x: -8, z: 86 };       // 城の下の町（火を放つ）
const NO = { x: 6, z: 50 };           // 打って出た城兵と当たる野
const OTE = { x: 0, z: 10 };          // 大手の坂
const HON = { x: -2, z: -32 };        // 本曲輪
const BANSHO = { x: 40, z: 84 };       // 東海道の北条の番所（町の東の口・K652②）
const NINO = { x: 2, z: -12 };        // 二の曲輪（大手の坂の上・K652②）

// 11/21 クラウド35（K563 ③の質）：蒲原城（本曲輪・善福寺曲輪・二ノ・三ノ曲輪）を置く（castles/kanbara.js・出所 docs/battle_refs/kanbara.md）。遠景の軽い形
export const d04_kanbara = withCastle(lightBattle({
  id: 'd04_kanbara',
  date: '永禄十二年（1569）十二月六日　晴れ　駿河国 蒲原城',
  intro: '駿河の海を見下ろす蒲原城に、北条氏信が籠もる。勝頼は城の下の町に火を放ち、城兵を誘い出す。',
  history: '永禄十二年（1569）、武田信玄は駿河の蒲原城を攻めた。勝頼らが城の下に火を放って城兵を誘い出し、打って出た城兵を破ってそのまま攻め入り、一日で城を落とした。城主の北条氏信は討死した。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏信の城兵', mon: 'hojo', faction: 'hojo' } },
  force: { a: 6000, b: 1200 },
  allyLook: TAKEDA, foeLook: HOJO,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1569, time: 'day', winter: true, fogFar: 420,
    hills: [[0, -30, 44, 24], [-90, -60, 60, 30], [100, -50, 60, 28], [60, 110, 40, 6]],
    // 11/21 cloud-19（K563 地形・手書き）：城の下の町を東西に東海道が通り、大手の坂が町から本曲輪へ上る。城山の背は松と雑木
    paths: [{ pts: [[-200, 92], [-8, 86], [200, 80]], w: 4 }, { pts: [[0, 140], [-8, 86], [6, 50], [0, 10], [-2, -32]], w: 2.6 }],
    groves: [{ x: -40, z: -50, r: 24, n: 26 }, { x: 40, z: -44, r: 22, n: 22 }],
    trees: 470, tufts: 1500,
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
    // K652②（11/25 Sanae・10分に）：蒲原は東海道の宿。町の東の口に北条の番所があった（駿河へ入る北条の番の兵）。先に番所を破って町へ入る
    { kind: 'fight', at: BANSHO, limit: 110, obj: '東海道の北条の番所を破り、町の口を取る', title: '番所', sub: '町の口の番所に北条の番兵',
      say: [['武田信豊', '番所を破れ。町の口を押さえねば火はかけられぬ', 3.2]],
      foes: [
        { name: '番所の番兵', from: { x: BANSHO.x + 8, z: BANSHO.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の番頭 清水' } }, uS(3), uA(18)] },
        { name: '番所の弓', from: { x: BANSHO.x + 16, z: BANSHO.z - 4 }, list: [uB(5)] }],
      later: [{ t: 38, say: ['組頭', '宿の奥から番兵の助けが来る！'], foes: [{ name: '宿の番兵', from: { x: BANSHO.x - 14, z: BANSHO.z - 16 }, list: [uS(2), uA(12)] }] }],
      reward: '東海道の番所を破った' },
    { kind: 'rest', dur: 8, heal: 0.7, say: [['組頭', '番所は破った。傷を縛れ、町へ走るぞ', 2.8]] },
    { kind: 'move', at: MACHI, label: '城の下の町', obj: '城の下の町へ火を放ちに走る', r: 14,
      say: [['組頭', '松明を持て！　町の端から火をかけよ！', 3]] },
    // 11/21 cloud-41（章の通し）：大手の坂の段が259秒かかり627秒になった回がある。斬り合いの段に上限150秒（六割崩していれば済）
    { kind: 'fight', at: NO, limit: 150, obj: '打って出た城兵を、野で迎え討つ', title: '打って出', sub: '火を見た城兵が門を開けて駆け下りて来る',
      say: [['北条の侍', '町を焼かせるな！　出て払え！', 3]],
      foes: [
        { name: '打って出た城兵', from: { x: NO.x, z: NO.z - 18 }, list: [uS(5), uA(26)] },
        { name: '城兵の鉄砲', from: { x: NO.x + 16, z: NO.z - 24 }, list: [uG(6)] }],
      // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：野の受けに城兵の二の手・三の手を足した
      later: [{ t: 35, say: ['北条の侍', '二の手、出よ！　町を守れ！'], foes: [{ name: '城兵の二の手', from: { x: NO.x - 18, z: NO.z - 22 }, list: [uS(3), uA(18)] }] },
        { t: 70, say: ['組頭', '門からまた出て来るぞ！'], foes: [{ name: '城兵の三の手', from: { x: NO.x + 8, z: NO.z - 26 }, list: [uS(3), uA(16)] }] }],
      reward: '打って出た城兵を破った' },
    { kind: 'rest', dur: 8, heal: 0.6, say: [['組頭', '一度は退けた。傷を縛れ。門からまた来るぞ', 2.8]] },   // K652②：打って出と取り返しが続き、取り返しの段で倒れた回がある（act bot 11/25）
    // 11/21 cloud-50（4分以上に・二度目）：野の迎え討ちの後に、門から取り返しに来る城兵を受ける段を足した
    { kind: 'hold', at: NO, label: '野の備え', obj: '門から取り返しに来る城兵を、野で受け止める', r: 16, dur: 50,
      title: '取り返し', sub: '城兵が町を取り返しに門から押し出す',
      say: [['組頭', '退くな。ここで受ければ、門は開いたままじゃ', 3]],
      waves: [
        { t: 4, say: ['北条の侍', '町を取り返せ！'], foes: [{ name: '取り返しの城兵', from: { x: NO.x - 6, z: NO.z - 30 }, list: [uS(3), uA(18)] }] },
        { t: 28, say: ['組頭', '横の谷からも来る！'], foes: [{ name: '谷の城兵', from: { x: NO.x + 22, z: NO.z - 18 }, list: [uS(2), uA(14)] }] }],
      reward: '野で城兵を受け止めた' },
    { kind: 'fight', at: OTE, limit: 150, obj: '退く城兵に付いて、大手の坂を駆け上る', title: '大手の坂', sub: '城兵が門へ逃げ込む。門を閉じる前に付いて入る',
      say: [['武田勝頼', '門を閉じさせるな！　逃げる者の背に付いて入れ！', 3.2]],
      foes: [{ name: '大手の守り', from: { x: OTE.x, z: OTE.z - 10 }, list: [uS(4), uA(22), uB(4)] }],
      reward: '大手を破った' },
    // K652②：大手の上の二の曲輪で、北条の侍が取り返しに打ちかかる（城は一日で落ちたが、城兵は最後まで退かなかった）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '大手は破った。息を継げ。二の曲輪から来るぞ', 2.8]] },
    { kind: 'hold', at: NINO, label: '二の曲輪', obj: '二の曲輪で、取り返しに来る北条の侍を受け止める', r: 14, dur: 65,
      title: '二の曲輪', sub: '北条の侍が曲輪を取り返しに来る',
      say: [['武田勝頼', 'ここを持てば本曲輪は裸じゃ。一歩も退くな', 3.2]],
      waves: [
        { t: 5, say: ['北条の侍', '曲輪を取り返せ！　小田原の名にかけて！'], foes: [{ name: '二の曲輪の侍', from: { x: NINO.x - 4, z: NINO.z - 18 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 狩野' } }, uS(4), uA(16)] }] },
        { t: 32, say: ['組頭', '横の土塁から弓じゃ！'], foes: [{ name: '土塁の弓', from: { x: NINO.x + 14, z: NINO.z - 14 }, list: [uB(6), uS(2), uA(8)] }] }],
      reward: '二の曲輪を持ちこたえた' },
    // 11/21 cloud-41：最後の段が七分の上限まで延びた（通しで箕輪 731・蒲原 709秒）。旗本を六割崩せば 150 秒で済ます
    { kind: 'fight', at: HON, limit: 150, obj: '本曲輪で北条氏信の旗本を討つ', title: '本曲輪', sub: '北条氏信が最後の旗本と踏みとどまる',
      say: [['北条氏信', '小田原の名を汚すな。ここで死ぬぞ', 3.2]],
      foes: [{ name: '北条氏信の旗本', from: { x: HON.x, z: HON.z - 6 }, list: [busho('北条氏信', { mustLive: false, invuln: false }), uS(6), uA(13)] }],
      reward: '蒲原城を一日で落とした' },
  ],
  win: {
    banner: '蒲原城 落城', sub: '城主 北条氏信 討死。駿河の東の口が開いた', award: '蒲原城を落とした',
    say: [['武田信豊', '一日で落ちた。勝頼殿の火の手柄じゃ', 3.2],
      ['武田勝頼', '次は駿府じゃ。今川の残りを掃う', 3]],
  },
}), { plan: KANBARA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default d04_kanbara;
