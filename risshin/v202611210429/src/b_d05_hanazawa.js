// 武田編 五戦目「花沢城攻め」（元亀元年〔1570〕一月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：駿河の今川方の小原鎮実（資良）が籠もる山の上の花沢城を、信玄は正月に攻めた。城兵は険しい坂で強く守り、
//   寄せ手にも名のある者の討死・手負いが多く出た（勝頼・山県も坂で苦戦した）が、ついに開城させた（『甲陽軍鑑』・焼津市の史跡の案内）。
//   主人公は坂を上る寄せ手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const IMAGAWA = { flag: 'imagawa', armor: 0x2e2a26 };
const SPAWN = { x: 0, z: 140 };
const FUMOTO = { x: 4, z: 84 };       // 麓の口
const SAKA = { x: -6, z: 34 };        // 七曲りの坂
const KOGUCHI = { x: 2, z: -6 };      // 城の虎口
const HON = { x: 0, z: -40 };         // 本曲輪

export const d05_hanazawa = lightBattle({
  id: 'd05_hanazawa',
  date: '元亀元年（1570）一月　雪まじりの晴れ　駿河国 花沢城',
  intro: '駿河の花沢城は、細い七曲りの坂の上。今川の小原鎮実が、最後の今川の城として籠もる。',
  history: '元亀元年（1570）正月、武田信玄は駿河の今川方の花沢城を攻めた。城は険しい坂の上にあり、城兵は強く守って寄せ手に多くの討死・手負いが出たが、ついに開城させた。これで駿河の今川方の城はほぼ尽きた。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '小原鎮実の城兵', mon: 'imagawa', faction: 'imagawa' } },
  force: { a: 12000, b: 1000 },
  allyLook: TAKEDA, foeLook: IMAGAWA,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1570, snow: 0.25, time: 'day', winter: true, fogFar: 380,
    hills: [[0, -36, 50, 34], [-80, -10, 60, 26], [90, 0, 60, 24], [0, 30, 40, 14]],
    trees: 700, tufts: 1200,
  },
  allies: [
    { name: '武田の先手', at: { x: SPAWN.x + 10, z: SPAWN.z - 10 }, list: [busho('山県昌景'), uS(3), uA(16)] },
    { name: '武田勝頼の手', at: { x: SPAWN.x - 12, z: SPAWN.z - 6 }, list: [busho('武田勝頼'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['山県昌景', '坂は七つ曲がる。上から石と矢が来る。止まれば狙い撃ちじゃ', 3.4],
      ['武田勝頼', '今川の最後の城。ここを落とせば駿河は武田の物', 3.2]] },
    { kind: 'fight', at: FUMOTO, obj: '麓の口の柵を守る城兵を払う', title: '麓の口', sub: '坂の下の柵に城兵が出ている',
      say: [['今川の侍', '坂へ寄せさせるな！', 2.8]],
      foes: [{ name: '麓の守り', from: { x: FUMOTO.x, z: FUMOTO.z - 12 }, list: [uS(3), uA(22), uB(4)] }],
      reward: '麓の口を破った' },
    { kind: 'hold', at: SAKA, label: '七曲りの坂', obj: '七曲りの坂で、上からの石と槍を凌いで踏みとどまる', r: 14, dur: 55,
      title: '七曲り', sub: '坂の上から城兵が槍で突き落としに来る',
      say: [['組頭', '盾を前へ！　一曲がりずつ上るぞ！', 3]],
      waves: [
        { t: 6, say: ['今川の侍', '突き落とせ！'], foes: [{ name: '坂の上の槍', from: { x: SAKA.x, z: SAKA.z - 24 }, list: [uS(4), uA(19)] }] },
        { t: 30, say: ['組頭', '石が来る、身を低く！'], foes: [{ name: '坂の上の弓', from: { x: SAKA.x + 12, z: SAKA.z - 28 }, list: [uB(8)] }] }],
      reward: '七曲りを上り切った' },
    { kind: 'fight', at: KOGUCHI, obj: '虎口の城兵を崩し、城へ入る', title: '虎口', sub: '虎口に城兵が詰めて槍を揃える',
      say: [['山県昌景', '虎口を割れ。割れれば城は持たぬ', 3]],
      foes: [{ name: '虎口の守り', from: { x: KOGUCHI.x, z: KOGUCHI.z - 10 }, list: [uS(5), uA(22)] }],
      reward: '虎口を破った' },
    { kind: 'fight', at: HON, obj: '本曲輪の城兵を降す', title: '本曲輪', sub: '小原鎮実の旗本が最後の守りにつく',
      say: [['小原鎮実', '今川の城は、ここが最後じゃ……', 3]],
      foes: [{ name: '小原鎮実の旗本', from: { x: HON.x, z: HON.z - 6 }, list: [busho('小原鎮実'), uS(5), uA(16)] }],
      reward: '花沢城を開城させた' },
  ],
  win: {
    banner: '花沢城 開城', sub: '小原鎮実は城を明け渡した。駿河の今川方の城はほぼ尽きた', award: '花沢城を開城させた',
    say: [['使番', '小原殿、城を明け渡すと申しておりまする', 3],
      ['山県昌景', '坂で多くを失うた。だが駿河は手に入れた', 3.2]],
  },
});
export default d05_hanazawa;
