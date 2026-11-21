// 武田編 十四戦目「高遠城の戦い」（天正十年〔1582〕三月二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：甲州征伐で、勝頼の弟 仁科盛信は三千で高遠城に籠り、織田信忠の五万の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、
//   城は一日で落ち、盛信は討死した。武田方で最後まで戦った城として名を残す（『信長公記』・伊那市の高遠城址の案内）。主人公は仁科の城兵。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

// 11/21 cloud-10（章の通し九回目：組の無い本人が最後の段の大きな組に倒れた）：最後の段の組を今日厚くした（1.6倍）前の数に戻す（d14 は討てない河尻を討てる組頭に）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

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
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し二回目：組の無い足軽の本人が囲まれ50〜131秒で倒れた）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 15820302, time: 'morning', winter: true, overcast: true, fogFar: 380,
    river: [[-220, 90], [-80, 96], [0, 92], [80, 98], [220, 94]], riverW: 14, riverDepth: 0.8,
    hills: [[0, -30, 56, 18], [-120, -40, 60, 14], [120, -30, 60, 14]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：大手門の内・二の丸の塀・本丸の前 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -60], [0, -40], [-34, -4], [2, 20]], w: 3 }],
    groves: [{ x: -120, z: -40, r: 30, n: 30 }, { x: 120, z: -30, r: 30, n: 30 }],
    trees: 460, tufts: 1400,
  },
  // 11/21 cloud-41（章の通し）：通しの足軽が囲まれて十数秒で倒れる回が残った（受けの段・数十の槍）。敵は変えず、味方の刃を 0.25→0.45 に上げて味方が囲みを削る（本人の討ち取りは減ってもよい）
  allies: [
    { name: '仁科盛信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.45, list: [busho('仁科盛信'), uS(4), uA(16)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x + 12, z: SPAWN.z + 4 }, dmg: 0.45, list: [uS(1), uG(10)] },
    // 11/21 cloud-41（章の通し）：通しの本人（組の無い足軽）が二の丸で塀を越えた四十余に囲まれ110秒前後で倒れた。敵は変えず、本人の脇に城兵の槍衆を一組足す（高遠の城兵は三千）
    { name: '城兵の槍衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 10 }, dmg: 0.45, list: [uS(3), uA(18)] },
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
    // 11/21 cloud-41（章の通し）：大手の受けで命六割になったまま二の丸の段へ入り、塀を越えた四十余に107秒で倒れた回がある。段の間に手当て（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '大手は持たせた。傷を縛れ、二の丸の塀へ回るぞ', 2.8]] },
    { kind: 'fight', at: NINOMARU, obj: '二の丸の塀を越えて来た織田勢を討つ', title: '二の丸', sub: '信忠が自ら塀に上ったと',
      say: [['城兵', '信忠が塀の上に！', 2.6], ['仁科盛信', '二の丸を渡すな！', 2.6]],
      foes: [
        { name: '塀を越えた織田勢', from: { x: NINOMARU.x + 6, z: NINOMARU.z + 12 }, list: [uS(5), uA(22)] },
        { name: '塀の上の弓', from: { x: NINOMARU.x - 10, z: NINOMARU.z + 18 }, list: [uB(6)] }],
      reward: '二の丸で織田勢を討った' },
    // 11/21 cloud-41（章の通し）：通しの本人が二の丸で深手を負い、本丸の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['仁科盛信', '本丸へ退け。傷を縛れ。最後はここで迎える', 3]] },
    { kind: 'fight', at: HONMARU, obj: '本丸の前で、仁科盛信と共に最後まで戦う', title: '本丸', sub: '城の火の手が上がる',
      say: [['仁科盛信', '残る者、本丸の前に揃え。ここが武田の意地じゃ', 3.4]],
      foes: [{ name: '本丸へ寄せる織田勢', from: { x: HONMARU.x, z: HONMARU.z + 18 }, list: [{ type: 'samurai', n: 1, o: { name: '河尻秀隆の組頭' } }, uS(5), uA(24)] }],
      reward: '本丸の前で最後まで戦った' },
  ],
  win: {
    banner: '高遠城 最後まで戦う', sub: '城は一日で落ち、仁科盛信は討死した', award: '本丸の前で最後まで戦った',
    say: [['城兵', '……仁科様、お討死', 2.8],
      ['組頭', '生き残った者は新府へ走れ。御屋形様に、高遠は最後まで戦ったと伝えよ', 3.6]],
  },
});
export default d14_takato;
