// 北条家編 十三戦目「鉢形城の戦い」（天正十八年〔1590〕五月〜六月十四日・武蔵国 鉢形城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：北条氏邦の守る鉢形城を、前田利家・上杉景勝・真田昌幸らの北国勢が囲んだ。城は一月ほど持ちこたえたが、
//   氏邦は城兵の命と引き換えに開いた（『北条五代記』B・寄居町の解説 C。細部は推）。
//   狼煙の網（hojo_noroshi.js）：西の山の台に火を上げると、秩父の地侍が搦手の外に出る（網はもう小田原へは届かない。地侍の加勢は推）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';
import { withCastle } from './light_castle.js';
import { HACHIGATA_PLAN } from './castles/hachigata.js';   // K657② 鉢形城を戦場に（11/25 クラウドす）

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const HOKKOKU = { flag: 'toyotomi', armor: 0x3a2a1e };
const SPAWN = { x: 0, z: 30 };
const OTE = { x: 0, z: 50 };          // 大手の門の前（寄せ手は南から）
const BEACON = { x: -80, z: -10 };    // 西の山の狼煙台
const SHIYORI = { x: 30, z: 110 };    // 上杉の仕寄り（竹束の陣）
const N = noroshi({
  beacon: BEACON, beaconStep: 1,
  far: [{ x: -220, z: -80 }, { x: -320, z: 30 }],
  reliefFrom: { x: -140, z: 120 }, reliefTo: { x: 10, z: 80 }, reliefFace: Math.PI / 2,
  relief: { name: '秩父の地侍', list: [busho('秩父の組頭'), uS(3), uA(14)], say: ['秩父の組頭', '秩父の衆じゃ！　寄せ手の脇を突け！'], foeSay: ['前田の侍', '西の山から地侍が出た！'] },
});

export const h09_hachigata = withCastle(lightBattle({
  id: 'h09_hachigata',
  date: '天正十八年（1590）六月　夏・雨　武蔵国 鉢形城',
  intro: '氏邦様の鉢形城を、前田と上杉の北国勢が囲む。支城は一つずつ落ちていく。',
  history: '天正十八年（1590）、北条氏邦の守る鉢形城を、前田利家・上杉景勝・真田昌幸らの北国勢が囲んだ。城は一月ほど持ちこたえたが、氏邦は城兵の命と引き換えに城を開いた。',
  sides: { a: { name: '北条氏邦の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '前田利家・上杉景勝らの北国勢', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 3000, b: 35000 },
  allyLook: HOJO, foeLook: HOKKOKU,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1591, time: 'day', overcast: true, rain: 0.4, fogFar: 360,
    river: [[-220, -40], [-100, -36], [0, -44], [100, -38], [220, -42]], riverW: 20, riverDepth: 0.8,
    hills: [[0, 0, 50, 10], [-80, -10, 40, 16], [100, 80, 60, 10]],
    paths: [{ pts: [[0, 190], [30, 110], [0, 50], [0, 20]], w: 3 }, { pts: [[0, 20], [-80, -10]], w: 2 }],
    groves: [{ x: -90, z: 60, r: 30, n: 30, kind: 'sugi' }, { x: 100, z: 20, r: 28, n: 28 }],
    trees: 480, tufts: 1800,
  },
  allies: [
    { name: '北条氏邦の旗本', at: { x: OTE.x, z: OTE.z - 16 }, fixed: true, list: [busho('北条氏邦'), uS(4), uA(6)] },
    { name: '大手の足軽', at: { x: OTE.x - 10, z: OTE.z - 2 }, list: [uS(2), uA(12)] },
    { name: '大手の鉄砲衆', at: { x: OTE.x + 12, z: OTE.z - 4 }, list: [uS(1), uG(8)] },
    { name: '狼煙番', at: { x: BEACON.x + 4, z: BEACON.z + 4 }, list: [uS(1), uA(5)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏邦', '小田原への狼煙は、もう応えぬ。じゃが秩父の衆はまだおる', 3.4],
      ['組頭', '大手を守れ。それから西の山の台に火を上げる', 3]] },
    { kind: 'hold', at: OTE, label: '大手の門', obj: '大手の門の前で、前田の寄せ手を受け止める', r: 16, dur: 60, title: '大手', sub: '前田の兵が竹束を押して寄せる',
      say: [['前田の侍', '大手を破れ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '前田の先手', from: { x: OTE.x - 4, z: OTE.z + 44 }, list: [{ type: 'samurai', n: 1, o: { name: '前田の組頭 山崎' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '鉄砲が来る！'], foes: [{ name: '前田の鉄砲', from: { x: OTE.x + 26, z: OTE.z + 40 }, list: [uS(1), uG(8)] }] }],
      reward: '大手で前田の寄せ手を受け止めた' },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '西の山の狼煙台のそばに立ち、守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '真田の乱破が台を狙う',
      say: [['北条氏邦', '狼煙台へ行け！　秩父の衆を呼べ', 3]],
      waves: [
        { t: 6, say: ['真田の乱破', '狼煙を上げさせるな！'], foes: [{ name: '真田の乱破', from: { x: BEACON.x - 10, z: BEACON.z + 34 }, list: [uS(1), uA(8)] }] },
        { t: 36, foes: [{ name: '林の乱破', from: { x: BEACON.x - 36, z: BEACON.z - 10 }, list: [uS(1), uA(7)] }] }],
      reward: '狼煙台を守り、火を上げた' },
    { kind: 'hold', at: OTE, label: '大手の門', obj: '大手へ戻り、上杉の大寄せを受け止める', r: 16, dur: 55, title: '大寄せ', sub: '上杉景勝の兵が寄せる',
      say: [['北条氏邦', '凌げ！　秩父の衆が来る！', 3]],
      waves: [
        { t: 4, foes: [{ name: '上杉景勝の手', from: { x: OTE.x - 10, z: OTE.z + 44 }, list: [uS(3), uA(14)] }] },
        { t: 30, foes: [{ name: '上杉の新手', from: { x: OTE.x + 16, z: OTE.z + 46 }, list: [uS(2), uA(12)] }] }],
      reward: '大手で上杉の大寄せを受け止めた' },
    { kind: 'fight', at: SHIYORI, limit: 140, obj: '打って出て、上杉の仕寄りの陣を崩す', title: '打って出', sub: '竹束の陣を崩せば、城は時を稼げる',
      say: [['北条氏邦', '打って出よ！　仕寄りを焼け！', 3]],
      foes: [{ name: '上杉の仕寄り', from: { x: SHIYORI.x, z: SHIYORI.z + 10 }, list: [busho('上杉の侍大将', { mustLive: false, invuln: false }), uS(3), uA(20)] }],
      reward: '上杉の仕寄りを崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '西の山に真田の別手が上がった！　狼煙台の尾根を取りに来まする', 3.2],
      ['北条氏邦', '尾根を取られれば城の中が丸見えじゃ。追い落とせ', 3.2]] },
    { kind: 'fight', at: { x: BEACON.x + 10, z: BEACON.z + 26 }, limit: 140, obj: '西の山の尾根に上がった真田の別手を追い落とす', title: '西の尾根', sub: '真田の兵が尾根に柵を立てる',
      say: [['組頭', '柵が立つ前じゃ。駆け上がれ！', 3]],
      foes: [{ name: '真田の別手', from: { x: BEACON.x + 4, z: BEACON.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '真田の組頭' } }, uS(3), uA(14), uG(4)] }],
      later: [{ t: 30, say: ['真田の侍', '尾根を渡すな！'], foes: [{ name: '真田の新手', from: { x: BEACON.x - 26, z: BEACON.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '西の尾根から真田の別手を追い落とした' },
    { kind: 'hold', at: OTE, label: '大手の門', obj: '大手へ戻り、前田と上杉の最後の大寄せを受け止める', r: 16, dur: 70, title: '最後の寄せ', sub: '寄せ手が一度に寄せる',
      say: [['北条氏邦', 'これを受け切れば、寄せ手も無理には攻めぬ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '前田の寄せ', from: { x: OTE.x - 10, z: OTE.z + 42 }, list: [uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '上杉の旗じゃ！'], foes: [{ name: '上杉の寄せ', from: { x: OTE.x + 30, z: OTE.z + 40 }, list: [busho('上杉の侍大将', { mustLive: false, invuln: false }), uS(2), uA(12)] }] }],
      reward: '大手で最後の大寄せを受け切った' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '鉢形の開城', sub: '一月持ちこたえた後、氏邦は城兵の命と引き換えに城を開いた', award: '鉢形城を最後まで守った',
    say: [['北条氏邦', '城兵の命は助かる。それでよい', 3.2],
      ['組頭', '狼煙は上がった。じゃが、もう小田原は応えなんだ', 3.2]],
  },
}), { plan: HACHIGATA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default h09_hachigata;
