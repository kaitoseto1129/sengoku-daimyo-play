// 上杉編 七戦目「塩崎の対陣」（第五次川中島・永禄七年〔1564〕八月〜十月・信濃国 塩崎）。軽い型（light_battle.js）
//   史実：上杉輝虎は川中島へ出て、武田信玄は塩崎城（いま長野市篠ノ井塩崎）に陣を構えた。両軍は六十日ほど向き合ったが、
//   大きな戦いは起きず、どちらも兵を退いた。これが川中島での最後の対陣になった。
//   ※ 対陣の間の小競り合いの細かな記録は少ない。ここでは「物見の追い払い→夜討ちを受ける→退く時の殿」の形に推した（決戦は無い）。
//   出所：Wikipedia「川中島の戦い」（第五次合戦）・長野市の塩崎城跡の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { uView } from './u_view.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, 10], [-110, 4], [0, 12], [110, 2], [220, 8]];   // 犀川と千曲川の間の流れ（両陣の間）
const MONOMI = { x: -30, z: -60 };      // 川の手前の物見の場
const ASASE = { x: 30, z: -14 };        // 川の浅瀬の南の岸（武田の先手が渡ってくる所）
const JIN = { x: 10, z: -120 };         // 上杉の陣（夜討ちを受ける所）
const SHINGARI = { x: -20, z: -175 };   // 退く道の殿の場
// K652②（11/25 Sanae・家の編を10分前後に）：対陣の中の史実の段。輝虎は川を越えて塩崎の城の前まで兵を寄せ、信玄に決戦を挑んだが、信玄は城を出なかった（『上杉家御年譜』）。
//   六十日の対陣の間、両軍は互いの田を刈り取って兵糧を奪い合った。逸話の段（K652⑥）＝塩崎の城の下で、本人が信玄の旗の見える所まで寄せて誘う
const SHIOZAKI = { x: 36, z: 44 };      // 塩崎の城の下（川の北）
const KARITA = { x: -62, z: -108 };     // 陣の西の田（刈田の場）

export const u07_shiozaki = lightBattle({
  id: 'u07_shiozaki',
  date: '永禄七年（1564）八月　夏の終わり・晴れ　信濃国 塩崎',
  intro: '上杉輝虎は五たび川中島へ出た。武田信玄は塩崎の城に陣を構え、川を挟んで動かない。',
  history: '永禄七年（1564）、上杉輝虎は川中島へ出て、武田信玄は塩崎城に陣を構えた。両軍は六十日ほど向き合ったが大きな戦いは起きず、どちらも兵を退いた。これが川中島での最後の対陣となった。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 10000, b: 15000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1564, time: 'day', fogFar: 460,
    river: RIVER, riverW: 16, riverDepth: 0.7,
    hills: [[60, 120, 70, 20], [-120, 140, 60, 14], [-160, -120, 50, 8], [140, -60, 40, 6]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：川の手前の物見の場・川の浅瀬の南の岸・上杉の陣・退く道の殿の場 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[-20, -175], [0, -150], [10, -120], [-30, -60], [30, -14], [36, 44]], w: 3 }, { pts: [[10, -120], [-62, -108]], w: 3 }],
    groves: [{ x: 60, z: 120, r: 30, n: 30 }, { x: -120, z: 140, r: 30, n: 30 }],
    trees: 460, tufts: 2000,
  },
  allies: [
    { name: '上杉輝虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉輝虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  // K723 二回目：川を挟む両軍の陣（上杉は南の陣・武田は塩崎の城の山裾。幟が向かい合う）
  setup(rt) { uView(rt, [[-30, -150, 'uesugi', 0, 200], [50, -140, 'uesugi', 0, 160], [20, 90, 'takeda', Math.PI, 200], [90, 70, 'takeda', Math.PI, 160]], [[24, 100, 'takeda'], [36, 104, 'takeda'], [96, 82, 'takeda']]); },
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉輝虎', '信玄は塩崎の城に籠もって出てこぬ。こちらから川を越えれば、また八幡原の二の舞じゃ', 3.6],
      ['上杉輝虎', '川の手前に出た武田の物見を追い払え。陣を覗かせるな', 3.4]] },
    { kind: 'fight', at: MONOMI, obj: '川の手前で、武田の物見を捕える', title: '川の手前', sub: '武田の物見が川を渡ってきた',
      say: [['組頭', '物見じゃ！　殺すな、生け捕りにせよ！　武田の陣の様子を吐かせる', 3.2]],
      foes: [
        { name: '武田の物見', from: { x: MONOMI.x + 6, z: MONOMI.z + 10 }, list: [uS(2), uA(16)] },
        { name: '武田の物見の弓', from: { x: MONOMI.x + 22, z: MONOMI.z + 16 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '川の手前で武田の物見を捕えた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MONOMI.x + 14, z: MONOMI.z + 12 }, obj: '川の手前の葦の中で、伏せた武田の弓を討て', limit: 90,
      say: [['組頭', '伏せた武田の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた武田の弓', from: { x: MONOMI.x + 22, z: MONOMI.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた武田の弓を破った' },
    { kind: 'fight', at: ASASE, obj: '浅瀬の岸で、渡ってきた武田の先手を押し返す', title: '浅瀬', sub: '武田の先手が浅瀬を渡り、こちらの岸に取り付く',
      say: [['上杉輝虎の使番', '殿より。岸に上がらせるな。渡り切る前に押し返せ', 3.2]],
      foes: [
        { name: '武田の先手', from: { x: ASASE.x - 4, z: ASASE.z + 22 }, list: [uS(3), uA(20)] },
        { name: '武田の鉄砲', from: { x: ASASE.x + 20, z: ASASE.z + 30 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '上手からも渡ってくるぞ！'], foes: [{ name: '武田の上手の槍', from: { x: ASASE.x - 40, z: ASASE.z + 24 }, list: [uS(2), uA(14)] }] }],
      reward: '浅瀬の岸で武田の先手を押し返した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: ASASE.x + -14, z: ASASE.z + 10 }, obj: '浅瀬の杭の陰で、渡りかけた武田の足軽を討て', limit: 90,
      say: [['組頭', '渡りかけた武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '渡りかけた武田の足軽', from: { x: ASASE.x + -6, z: ASASE.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '渡りかけた武田の足軽を破った' },
    { kind: 'fight', at: SHIOZAKI, obj: '川を越えて塩崎の城の下まで寄せ、城の番手を払って信玄を誘う', title: '塩崎の城', sub: '城の上に信玄の旗。輝虎は決戦を挑む',
      say: [['上杉輝虎', '城の下まで寄せよ。信玄、出て来い。今日こそ決着をつける', 3.4], ['組頭', '城の旗が見えるところまで押せ！', 3]],
      foes: [{ name: '塩崎の城の番手', from: { x: SHIOZAKI.x + 4, z: SHIOZAKI.z + 14 }, list: [uS(3), uA(16)] },
        { name: '城の下の鉄砲', from: { x: SHIOZAKI.x - 16, z: SHIOZAKI.z + 18 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['見張り', '城の脇の口から兵が出てきた！　信玄ではない、番手の加勢じゃ！'], foes: [{ name: '塩崎の城の加勢', from: { x: SHIOZAKI.x + 30, z: SHIOZAKI.z + 20 }, list: [uS(2), uA(12)] }] }],
      reward: '塩崎の城の下まで寄せた（信玄は出なかった）' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SHIOZAKI.x + -14, z: SHIOZAKI.z + -12 }, obj: '塩崎の城の下の田で、打って出る武田の足軽を受け止めよ', limit: 90,
      say: [['組頭', '打って出る武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '打って出る武田の足軽', from: { x: SHIOZAKI.x + -6, z: SHIOZAKI.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '打って出る武田の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: JIN, label: '上杉の陣', obj: '陣へ戻り、武田の夜討ちを受け止める', r: 18, dur: 85,
      title: '対陣', sub: '向き合ったまま日が過ぎる。武田が夜討ちを仕掛ける',
      say: [['上杉輝虎', '深追いはせぬ。陣を固めよ。信玄は根比べのつもりじゃ', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　川の方から武田が来るぞ！'], foes: [{ name: '武田の夜討ち', from: { x: JIN.x - 12, z: JIN.z + 46 }, list: [uS(3), uA(20)] }] },
        { t: 40, say: ['組頭', '二の手が来る！　陣を崩すな！'], foes: [{ name: '武田の夜討ち 二の手', from: { x: JIN.x + 26, z: JIN.z + 42 }, list: [uS(2), uA(12), uG(4)] }] }],
      reward: '陣で武田の夜討ちを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: JIN.x + 16, z: JIN.z + 12 }, obj: '陣の外の暗がりで、忍び寄る武田の足軽を討て', limit: 90,
      say: [['組頭', '忍び寄る武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '忍び寄る武田の足軽', from: { x: JIN.x + 24, z: JIN.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '忍び寄る武田の足軽を破った' },
    { kind: 'hold', at: KARITA, label: '陣の西の田', obj: '陣の西の田で、刈田をする足軽を武田の手から守る', r: 16, dur: 70,
      title: '刈田', sub: '対陣は六十日。兵糧のため、互いの田を刈り取り合う',
      say: [['上杉輝虎の使番', '殿より。田を刈って兵糧にせよ。武田に刈らせるな', 3.2], ['足軽', '稲を束ねまする！　背中は頼みましたぞ！', 3]],
      waves: [
        { t: 6, say: ['武田の侍', '越後の者が刈田をしておる！　追い散らせ！'], foes: [{ name: '武田の刈田の妨げ', from: { x: KARITA.x + 10, z: KARITA.z + 44 }, list: [uS(3), uA(16)] }] },
        { t: 34, say: ['組頭', '西の畦からも来る！'], foes: [{ name: '武田の西の手', from: { x: KARITA.x - 30, z: KARITA.z + 30 }, list: [uS(2), uA(10), uG(3)] }] }],
      reward: '刈田を守り、兵糧を陣へ運んだ' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KARITA.x + -12, z: KARITA.z + 14 }, obj: '刈田の畦で、刈り取りを狙う武田の足軽を払え', limit: 90,
      say: [['組頭', '刈り取りを狙う武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '刈り取りを狙う武田の足軽', from: { x: KARITA.x + -4, z: KARITA.z + 26 }, list: [uS(2), uA(10)] }],
      reward: '刈り取りを狙う武田の足軽を破った' },
    // K723 ⑦武田陣が動く⑧上杉も陣を変える⑨大戦にならない（戦わずに陣を動かし合う）
    { kind: 'rest', dur: 12, heal: 0.2, say: [['見張り', '武田の陣が動いた！　幟が塩崎の山の北へ寄っておる', 3.2], ['上杉輝虎', '誘いには乗らぬ。陣を西へ移せ。向こうも打っては出られまい', 3.4], ['組頭', '陣を移しても、大戦にはならぬか……', 3]] },
    { kind: 'fight', at: SHINGARI, obj: '退く道の殿で、追ってくる武田を止める', title: '退く道', sub: '六十日の対陣の末、上杉は兵を退く',
      say: [['上杉輝虎の使番', '殿より。今度も大戦にはならなかった。越後へ退く。殿の組は追手を止めよ', 3.4]],
      foes: [{ name: '武田の追手', from: { x: SHINGARI.x + 8, z: SHINGARI.z + 30 }, list: [uS(3), uA(22)] }],
      later: [{ t: 30, say: ['組頭', '騎馬が来るぞ！　槍を揃えよ！'], foes: [{ name: '武田の追手の騎馬', from: { x: SHINGARI.x - 20, z: SHINGARI.z + 34 }, list: [uS(1), { type: 'cavalry', n: 5 }] }] }],
      reward: '退く道で武田の追手を止めた' },
  ],
  win: {
    banner: '双方、兵を退く', sub: '六十日の対陣は、決戦の無いまま終わった', award: '塩崎の対陣を守り抜いた',
    say: [['上杉輝虎の使番', '武田も陣を払い、塩崎から兵を退きまする。大きな戦は、ついに起きませなんだ', 3.4],
      ['上杉輝虎', '川中島はこれで終いじゃ。次は関東を固める', 3.4]],
  },
});
export default u07_shiozaki;
