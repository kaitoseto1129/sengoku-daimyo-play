// 武田編 十四戦目「高遠城の戦い」（天正十年〔1582〕三月二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：甲州征伐で、勝頼の弟 仁科盛信は三千で高遠城に籠り、織田信忠の五万の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、
//   城は一日で落ち、盛信は討死した。武田方で最後まで戦った城として名を残す（『信長公記』・伊那市の高遠城址の案内）。主人公は仁科の城兵。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -60 };
const OTE = { x: 2, z: 20 };          // 大手門の内
const NINOMARU = { x: -34, z: -4 };   // 二の丸の塀
const HONMARU = { x: 0, z: -40 };     // 本丸の前

export const d14_takato = lightBattle({
  id: 'd14_takato',
  date: '天正十年（1582）三月二日　春の冷え　信濃国 高遠城',
  intro: '織田信忠の五万が高遠城を囲んだ。仁科盛信は降伏を退けた。城兵三千で、大手から本丸まで守り抜け。',
  history: '天正十年（1582）、甲州征伐で勝頼の弟 仁科盛信は高遠城に三千で籠り、織田信忠の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、城は一日で落ち、盛信は討死した。武田方で最後まで戦った城として名を残す。',
  sides: { a: { name: '仁科盛信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '織田信忠の寄せ手', mon: 'oda', faction: 'oda' } },
  force: { a: 3000, b: 50000 },
  allyLook: TAKEDA, foeLook: ODA,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 15820302, time: 'morning', winter: true, overcast: true, fogFar: 380,
    river: [[-220, 90], [-80, 96], [0, 92], [80, 98], [220, 94]], riverW: 14, riverDepth: 0.8,
    hills: [[0, -30, 56, 18], [-120, -40, 60, 14], [120, -30, 60, 14]],
    trees: 520, tufts: 1400,
  },
  allies: [
    { name: '仁科盛信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.25, list: [busho('仁科盛信'), uS(4), uA(16)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x + 12, z: SPAWN.z + 4 }, dmg: 0.25, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['仁科盛信', '降れと申すか。武田の者に、降る者はおらぬ', 3.2],
      ['組頭', '大手を固めよ。織田は今日、一気に来るぞ', 3]] },
    { kind: 'hold', at: OTE, label: '大手門の内', obj: '大手門の内で、門を破って入る織田勢を押し返す', r: 16, dur: 70,
      title: '大手', sub: '織田の寄せ手が大手門を破る',
      say: [['物見', '大手門が破られた！', 2.6]],
      waves: [
        { t: 6, say: ['織田の侍', '城へ入れ！　一番乗りじゃ！'], foes: [{ name: '大手の寄せ手', from: { x: OTE.x, z: OTE.z + 26 }, list: [uS(5), uA(38)] }] },
        { t: 30, say: ['物見', '塀を越えて鉄砲衆！'], foes: [{ name: '塀の上の鉄砲', from: { x: OTE.x + 14, z: OTE.z + 30 }, list: [uG(8)] }, { name: '大手の新手', from: { x: OTE.x - 10, z: OTE.z + 34 }, list: [uS(4), uA(26)] }] }],
      reward: '大手門の内で寄せ手を押し返した' },
    { kind: 'fight', at: NINOMARU, obj: '二の丸の塀を越えて来た織田勢を討つ', title: '二の丸', sub: '信忠が自ら塀に上ったと',
      say: [['城兵', '信忠が塀の上に！', 2.6], ['仁科盛信', '二の丸を渡すな！', 2.6]],
      foes: [
        { name: '塀を越えた織田勢', from: { x: NINOMARU.x + 6, z: NINOMARU.z + 12 }, list: [uS(6), uA(35)] },
        { name: '塀の上の弓', from: { x: NINOMARU.x - 10, z: NINOMARU.z + 18 }, list: [uB(6)] }],
      reward: '二の丸で織田勢を討った' },
    { kind: 'fight', at: HONMARU, obj: '本丸の前で、仁科盛信と共に最後まで戦う', title: '本丸', sub: '城の火の手が上がる',
      say: [['仁科盛信', '残る者、本丸の前に揃え。ここが武田の意地じゃ', 3.4]],
      foes: [{ name: '本丸へ寄せる織田勢', from: { x: HONMARU.x, z: HONMARU.z + 18 }, list: [busho('河尻秀隆'), uS(6), uA(38)] }],
      reward: '本丸の前で最後まで戦った' },
  ],
  win: {
    banner: '高遠城 最後まで戦う', sub: '城は一日で落ち、仁科盛信は討死した', award: '本丸の前で最後まで戦った',
    say: [['城兵', '……仁科様、お討死', 2.8],
      ['組頭', '生き残った者は新府へ走れ。御屋形様に、高遠は最後まで戦ったと伝えよ', 3.6]],
  },
});
export default d14_takato;
