// 上杉編 三戦目「上野原の戦い」（第三次川中島・弘治三年〔1557〕八月）。軽い型（light_battle.js）
//   史実：弘治三年二月、武田方が雪の中で葛山城（長野市の西）を落とした。景虎は四月に出陣して善光寺に入り、武田方の城を攻めたが
//   晴信は決戦を避けた。八月、上野原（今の長野市上野か）で両軍が戦い、勝ち負けははっきりせず、景虎は九月に越後へ戻った。
//   出所：Wikipedia「川中島の戦い」（第三次合戦）・長野市の葛山城跡の案内。天気は docs/weather_takeda_uesugi.md（晩夏の晴れ）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: -10, z: -140 };
const KATSURA = { x: -70, z: -70 };      // 葛山の麓（落ちた城の下の武田の番兵）
const ROAD = { x: -20, z: -20 };        // 善光寺の北の道
const UENO = { x: 20, z: 30 };          // 上野原の野
const RIDGE = { x: 60, z: 96 };         // 上野原の北の尾根の口

export const u03_uenohara = lightBattle({
  id: 'u03_uenohara',
  date: '弘治三年（1557）八月　晩夏・晴れ　信濃国 上野原',
  intro: '葛山城が武田に落とされた。長尾景虎は善光寺に入り、北信濃の武田方を追い払おうとする。',
  history: '弘治三年（1557）二月、武田方は雪の中で葛山城を落とした。景虎は四月に善光寺へ出陣し、武田方の城を攻めたが、晴信は決戦を避けた。八月、上野原で両軍が戦ったが勝負はつかず、景虎は九月に越後へ戻った。',
  sides: { a: { name: '長尾景虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田晴信の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 8000, b: 9000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  thick: true,   // 型の受けの段の厚み（三の手・新手）を使う
  allyDmg: 0.3,   // 味方の刃（11/21 型の既定 0.4 では味方が先に討ち切り、本人の討ち取りが少なかった）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1557, time: 'day', fogFar: 460,
    hills: [[-120, -60, 50, 26], [-150, 0, 50, 18], [90, 140, 70, 22], [150, 40, 60, 12]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：葛山の麓・善光寺の北の道・上野原の野・上野原の北の尾根の口 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[-10, -140], [-70, -70], [-20, -20], [20, 30], [60, 96]], w: 3 }],
    groves: [{ x: -120, z: -60, r: 25, n: 30, kind: 'sugi' }, { x: 90, z: 140, r: 30, n: 30, kind: 'sugi' }],
    trees: 500, tufts: 2000,
  },
  allies: [
    { name: '長尾景虎の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z - 10 }, fixed: true, list: [busho('長尾景虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長尾景虎', '葛山の城を落とされた。落合の者らの仇を討つ', 3.4],
      ['長尾景虎', '葛山の麓に武田の番兵が残る。まずそれを払え', 3.2]] },
    { kind: 'fight', at: KATSURA, obj: '葛山の麓で、武田の番兵を払う', title: '葛山', sub: '落ちた城の下に武田の番兵が残る',
      say: [['組頭', '城の下の柵じゃ。槍を揃えて押せ！', 3]],
      foes: [{ name: '武田の番兵', from: { x: KATSURA.x + 6, z: KATSURA.z + 8 }, list: [uS(3), uA(16)] },
        { name: '武田の番の弓', from: { x: KATSURA.x - 12, z: KATSURA.z + 14 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      reward: '葛山の麓で武田の番兵を払った' },
    { kind: 'move', at: ROAD, label: '善光寺の北の道', obj: '善光寺の北の道へ出る', r: 12,
      say: [['長尾景虎の使番', '殿より。晴信の兵が上野原へ出た。道を北へ', 3.2]] },
    { kind: 'fight', at: UENO, obj: '上野原で、武田の先手とぶつかる', title: '上野原', sub: '武田の先手が野に出てきた',
      say: [['武田の侍', '越後の者を野で討ち取れ！', 3]],
      foes: [{ name: '武田の先手', from: { x: UENO.x - 4, z: UENO.z + 12 }, list: [uS(3), uA(20)] },
        { name: '武田の鉄砲', from: { x: UENO.x + 16, z: UENO.z + 18 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '右から武田の槍が来るぞ！'], foes: [{ name: '武田の脇の槍', from: { x: UENO.x + 30, z: UENO.z + 4 }, list: [uS(2), uA(14)] }] }],
      reward: '上野原で武田の先手を押し返した' },
    { kind: 'hold', at: { x: UENO.x + 6, z: UENO.z + 24 }, label: '上野原の畦', obj: '畦で、武田の新手を受け止める', r: 16, dur: 80,
      title: '武田の新手', sub: '尾根から武田の新手が下りてくる',
      say: [['長尾景虎', '退くな。ここで受ければ晴信も出ては来られぬ', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '尾根から新手じゃ！'], foes: [{ name: '武田の新手', from: { x: UENO.x + 10, z: UENO.z + 64 }, list: [uS(3), uA(18)] }] },
        { t: 36, say: ['組頭', '二の手が来る！　畦を離れるな！'], foes: [{ name: '武田の二の手', from: { x: UENO.x - 20, z: UENO.z + 60 }, list: [uS(2), uA(14)] }] }],
      reward: '畦で武田の新手を受け止めた' },
    { kind: 'fight', at: RIDGE, obj: '尾根の口で、退く武田の殿を崩す', title: '尾根の口', sub: '武田が尾根へ退く',
      say: [['長尾景虎の使番', '晴信は退く。尾根の口まで追え。山へは入るな', 3.2]],
      foes: [{ name: '武田の殿', from: { x: RIDGE.x, z: RIDGE.z + 6 }, list: [uS(4), uA(16)] }],
      reward: '尾根の口で武田の殿を崩した' },
  ],
  win: {
    banner: '上野原', sub: '勝負はつかず、晴信はまた山へ退いた', award: '上野原で武田の新手を受け止めた',
    say: [['長尾景虎の使番', '武田は尾根の向こうへ。追っても出ては来ませぬ', 3.2],
      ['長尾景虎', '晴信め、また戦わずに逃げるか。秋が来る前に越後へ戻る', 3.4]],
  },
});
export default u03_uenohara;
