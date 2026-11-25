// 武田編 十五戦目「天目山（田野）の戦い」（天正十年〔1582〕三月十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：新府城を焼いて逃れた勝頼は、小山田信茂にも背かれ、天目山を目指して田野の里に至った。滝川一益の兵に追い付かれ、
//   土屋昌恒は狭い道で片手で藤の蔓をつかみ、一人で多くの敵を斬った（片手千人斬りの伝え）。勝頼・信勝は自刃し、武田は滅んだ
//   （『信長公記』『甲陽軍鑑』・甲州市の景徳院の案内）。主人公は土屋昌恒の手の足軽。勝頼の最期の間を稼ぐ（負ける側の物語・K509）。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

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
  force: { a: 40, b: 4000, la: 0.6, lb: 0.15 },   // K652：史実は四十余りが討死して敵の損害は小さい（負ける側）
  allyLook: TAKEDA, foeLook: ODA,
  minutes: 6,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し二回目：組の無い足軽の本人が囲まれ50〜131秒で倒れた）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 15820311, time: 'morning', overcast: true, fogFar: 320,
    river: RIVER, riverW: 10, riverDepth: 0.6,
    hills: [[40, 20, 40, 26], [40, 120, 40, 24], [-110, 40, 50, 20]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：狭い道・片手千人斬りの道の口・田野の里 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -40], [6, -20], [-4, 30], [2, 70]], w: 3 }],
    groves: [{ x: 40, z: 20, r: 20, n: 30, kind: 'sugi' }, { x: 40, z: 120, r: 20, n: 30, kind: 'sugi' }],
    trees: 640, tufts: 1200,
  },
  // 11/21 cloud-41（章の通し）：通しの足軽が囲まれて十数秒で倒れる回が残った（受けの段・数十の槍）。敵は変えず、味方の刃を 0.25→0.45 に上げて味方が囲みを削る（本人の討ち取りは減ってもよい）
  allies: [
    { name: '土屋昌恒の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 6 }, dmg: 0.45, list: [busho('土屋昌恒'), uS(3), uA(8)] },
    { name: '勝頼の旗本', at: { x: TANO.x + 4, z: TANO.z - 8 }, dmg: 0.45, list: [busho('武田勝頼'), busho('武田信勝'), uS(4)] },
    // 11/21 cloud-41（章の通し）：通しの本人が道の口で滝川勢に囲まれ107秒で倒れた回がある。敵は変えず、天目山で最後まで従った小宮山友晴の手を本人の脇に（『甲陽軍鑑』）
    { name: '小宮山友晴の手', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, dmg: 0.45, list: [busho('小宮山友晴', { mustLive: false, invuln: false }), uS(2), uA(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '小山田までも背いたか……。ここまでじゃ', 3],
      ['土屋昌恒', '御屋形様が御心を定められるまで、一人も通さぬ', 3.4]] },
    { kind: 'hold', at: MICHI, label: '狭い道', obj: '崖と谷川の間の狭い道で、追手を止める', r: 14, dur: 90,
      title: '狭い道', sub: '滝川一益の兵が追って来る',
      say: [['土屋昌恒', '道は一人しか通れぬ。ここなら千人でも止められる', 3.2]],
      waves: [
        { t: 6, say: ['滝川の侍', '武田の残りじゃ！　逃がすな！'], foes: [{ name: '追手の先駆け', from: { x: MICHI.x, z: MICHI.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 篠岡' } }, uS(5), uA(32)] }] },
        { t: 30, say: ['物見', '崖の上に鉄砲！'], foes: [{ name: '崖の上の鉄砲', from: { x: MICHI.x + 16, z: MICHI.z + 24 }, list: [uG(7)] }] },
        { t: 50, say: ['滝川の侍', '数で押し通せ！'], foes: [{ name: '追手の二の手', from: { x: MICHI.x - 6, z: MICHI.z + 34 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 稲田' } }, uS(2), uA(20)] }] }],
      reward: '狭い道で追手を止めた' },
    // 11/21 cloud-41（章の通し）：通しの本人が狭い道の受けで深手を負い、道の口の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.5, say: [['土屋昌恒', '追手は止めた。傷を縛れ。次は道の口じゃ', 2.8]] },
    { kind: 'fight', at: KATAGE, obj: '道の口へ出て、押し寄せる滝川勢を斬る', title: '片手千人斬り', sub: '土屋昌恒が藤の蔓をつかみ、片手で斬る',
      say: [['土屋昌恒', '来い！　この土屋が相手じゃ！', 2.8], ['滝川の侍', '化け物か……！', 2.4]],
      foes: [
        { name: '滝川勢', from: { x: KATAGE.x, z: KATAGE.z + 14 }, list: [uS(5), uA(24)] },
        { name: '滝川の新手', from: { x: KATAGE.x + 10, z: KATAGE.z + 24 }, list: [uS(4), uA(26)] }],
      later: [{ t: 30, say: ['滝川の侍', 'まだ斬られに来るか……いや、押せ！'], foes: [{ name: '道の口の新手', from: { x: KATAGE.x - 8, z: KATAGE.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 日比野' } }, uS(2), uA(22)] }] }],
      reward: '道の口で滝川勢を斬った' },
    { kind: 'hold', at: TANO, label: '田野の里', obj: '田野の里で、御屋形様の最期の間を守る', r: 14, dur: 70,
      title: '田野', sub: '御屋形様が御心を定められた',
      say: [['土屋昌恒', '……御屋形様。土屋も、すぐに参ります', 3.2]],
      waves: [{ t: 8, say: ['滝川一益', '勝頼の首を取れ！'], foes: [{ name: '滝川一益の手', from: { x: TANO.x, z: TANO.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 津田' } }, uS(6), uA(32)] }] },
        { t: 26, say: ['組頭', '里の裏の山からも来る！'], foes: [{ name: '里の裏の手', from: { x: TANO.x - 24, z: TANO.z + 30 }, list: [uS(2), uA(16)] }] },
        { t: 46, say: ['滝川の侍', '武田の最後の者どもじゃ！　残らず討て！'], foes: [{ name: '田野の三の手', from: { x: TANO.x + 20, z: TANO.z + 36 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 滝川益重' } }, uS(2), uA(20)] }] }],
      reward: '御屋形様の最期を守った' },
  ],
  win: {
    banner: '天目山 武田、滅ぶ', sub: '勝頼・信勝は田野で自刃した', award: '御屋形様の最期を守った',
    say: [['武田の侍', '御屋形様、御自害……', 2.8],
      ['土屋昌恒', '武田は滅んでも、甲斐の者の戦いぶりは語り継がれよう', 3.6]],
  },
});
export default d15_tenmokuzan;
