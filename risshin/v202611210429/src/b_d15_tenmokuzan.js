// 武田編 十五戦目「天目山（田野）の戦い」（天正十年〔1582〕三月十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：新府城を焼いて逃れた勝頼は、小山田信茂にも背かれ、天目山を目指して田野の里に至った。滝川一益の兵に追い付かれ、
//   土屋昌恒は狭い道で片手で藤の蔓をつかみ、一人で多くの敵を斬った（片手千人斬りの伝え）。勝頼・信勝は自刃し、武田は滅んだ
//   （『信長公記』『甲陽軍鑑』・甲州市の景徳院の案内）。主人公は土屋昌恒の手の足軽。勝頼の最期の間を稼ぐ（負ける側の物語・K509）。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -40 };
const RIVER = [[-60, -220], [-50, -100], [-56, 0], [-48, 100], [-58, 220]];   // 日川（道の西の谷川）
const MICHI = { x: -4, z: 30 };     // 狭い道（崖と谷川の間）
const KATAGE = { x: 2, z: 70 };     // 片手千人斬りの道の口
const TANO = { x: 6, z: -20 };      // 田野の里（勝頼の最期の陣）

export const d15_tenmokuzan = lightBattle({
  id: 'd15_tenmokuzan',
  date: '天正十年（1582）三月十一日　曇り　甲斐国 田野',
  intro: '小山田にも背かれ、御屋形様の供は四十余り。滝川一益の兵が追って来る。土屋昌恒と共に、狭い道で追手を止めよ。',
  history: '天正十年（1582）三月、新府城を焼いて逃れた武田勝頼は、小山田信茂にも背かれ、天目山を目指して田野の里に至った。滝川一益の兵に追い付かれ、土屋昌恒は狭い道で多くの敵を斬った。勝頼と子の信勝は自刃し、武田は滅んだ。',
  sides: { a: { name: '土屋昌恒の手', mon: 'takeda', faction: 'takeda' }, b: { name: '滝川一益の追手', mon: 'oda', faction: 'oda' } },
  force: { a: 40, b: 4000 },
  allyLook: TAKEDA, foeLook: ODA,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 15820311, time: 'morning', overcast: true, fogFar: 320,
    river: RIVER, riverW: 10, riverDepth: 0.6,
    hills: [[40, 20, 40, 26], [40, 120, 40, 24], [-110, 40, 50, 20]],
    trees: 700, tufts: 1200,
  },
  allies: [
    { name: '土屋昌恒の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 6 }, dmg: 0.25, list: [busho('土屋昌恒'), uS(3), uA(8)] },
    { name: '勝頼の旗本', at: { x: TANO.x + 4, z: TANO.z - 8 }, dmg: 0.25, list: [busho('武田勝頼'), busho('武田信勝'), uS(4)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '小山田までも背いたか……。ここまでじゃ', 3],
      ['土屋昌恒', '御屋形様が御心を定められるまで、一人も通さぬ', 3.4]] },
    { kind: 'hold', at: MICHI, label: '狭い道', obj: '崖と谷川の間の狭い道で、追手を止める', r: 14, dur: 70,
      title: '狭い道', sub: '滝川一益の兵が追って来る',
      say: [['土屋昌恒', '道は一人しか通れぬ。ここなら千人でも止められる', 3.2]],
      waves: [
        { t: 6, say: ['滝川の侍', '武田の残りじゃ！　逃がすな！'], foes: [{ name: '追手の先駆け', from: { x: MICHI.x, z: MICHI.z + 30 }, list: [uS(5), uA(32)] }] },
        { t: 30, say: ['物見', '崖の上に鉄砲！'], foes: [{ name: '崖の上の鉄砲', from: { x: MICHI.x + 16, z: MICHI.z + 24 }, list: [uG(7)] }] }],
      reward: '狭い道で追手を止めた' },
    { kind: 'fight', at: KATAGE, obj: '道の口へ出て、押し寄せる滝川勢を斬る', title: '片手千人斬り', sub: '土屋昌恒が藤の蔓をつかみ、片手で斬る',
      say: [['土屋昌恒', '来い！　この土屋が相手じゃ！', 2.8], ['滝川の侍', '化け物か……！', 2.4]],
      foes: [
        { name: '滝川勢', from: { x: KATAGE.x, z: KATAGE.z + 14 }, list: [uS(6), uA(38)] },
        { name: '滝川の新手', from: { x: KATAGE.x + 10, z: KATAGE.z + 24 }, list: [uS(4), uA(26)] }],
      reward: '道の口で滝川勢を斬った' },
    { kind: 'hold', at: TANO, label: '田野の里', obj: '田野の里で、御屋形様の最期の間を守る', r: 14, dur: 55,
      title: '田野', sub: '御屋形様が御心を定められた',
      say: [['土屋昌恒', '……御屋形様。土屋も、すぐに参ります', 3.2]],
      waves: [{ t: 8, say: ['滝川一益', '勝頼の首を取れ！'], foes: [{ name: '滝川一益の手', from: { x: TANO.x, z: TANO.z + 40 }, list: [busho('滝川一益'), uS(5), uA(32)] }] }],
      reward: '御屋形様の最期を守った' },
  ],
  win: {
    banner: '天目山 武田、滅ぶ', sub: '勝頼・信勝は田野で自刃した', award: '御屋形様の最期を守った',
    say: [['武田の侍', '御屋形様、御自害……', 2.8],
      ['土屋昌恒', '武田は滅んでも、甲斐の者の戦いぶりは語り継がれよう', 3.6]],
  },
});
export default d15_tenmokuzan;
