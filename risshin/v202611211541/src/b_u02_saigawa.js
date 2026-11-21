// 上杉編 二戦目「犀川の戦い」（第二次川中島・天文二十四年〔1555〕七月〜閏十月）。軽い型（light_battle.js）
//   史実：武田方の旭山城（善光寺の西の山）に兵が入り、景虎は善光寺の東に陣を構えて犀川を挟んで武田晴信と向き合った。
//   七月の犀川の小競り合いの後、二百日に及ぶ対陣となり、閏十月に今川義元の仲立ちで和睦、双方が退いた。旭山城は破却された。
//   出所：Wikipedia「川中島の戦い」（第二次合戦）・長野市の旭山城跡の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 20, z: -140 };
const RIVER = [[-220, -40], [-100, -46], [0, -40], [120, -48], [220, -42]];   // 犀川（南の善光寺の側と北の武田の陣の間）
const SHORE = { x: 10, z: -66 };        // 犀川の南の岸の物見の場
const FORD = { x: -20, z: -18 };        // 犀川の北の岸（渡った先）
const CAMP = { x: 20, z: -110 };        // 善光寺の東の陣（夜討ちを受ける所）
const ASAHI = { x: -50, z: -20 };        // 旭山の麓

export const u02_saigawa = lightBattle({
  id: 'u02_saigawa',
  date: '天文二十四年（1555）七月　夏・晴れ　信濃国 犀川',
  intro: '武田晴信が旭山城に兵を入れ、犀川の北に陣を張った。長尾景虎は善光寺の東に陣を構え、川を挟んで向き合う。',
  history: '天文二十四年（1555）、武田方は旭山城に兵を入れ、長尾景虎は善光寺の東に陣を構えた。両軍は犀川を挟んで七月に小競り合いをした後、二百日も向き合った。閏十月、今川義元の仲立ちで和睦し、旭山城は壊され、双方が兵を退いた。',
  sides: { a: { name: '長尾景虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田晴信の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 8000, b: 12000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  thick: true,   // 型の受けの段の厚み（三の手・新手）を使う
  allyDmg: 0.3,   // 味方の刃（11/21 型の既定 0.4 では味方が先に討ち切り、本人の討ち取りが少なかった）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1555, time: 'day', fogFar: 460,
    river: RIVER, riverW: 18, riverDepth: 0.7,
    hills: [[-110, 40, 50, 22], [-150, 0, 40, 14], [150, 120, 70, 16], [60, -200, 60, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：犀川の南の岸の物見の場・犀川の北の岸・善光寺の東の陣・旭山の麓 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[20, -140], [20, -110], [10, -66], [-50, -20], [-20, -18]], w: 3 }],
    groves: [{ x: -110, z: 40, r: 25, n: 30 }, { x: 150, z: 120, r: 30, n: 30 }],
    trees: 460, tufts: 2000,
  },
  allies: [
    { name: '長尾景虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('長尾景虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長尾景虎', '晴信は旭山に兵を籠め、犀川の向こうから動かぬ', 3.4],
      ['長尾景虎', '川辺に出た武田の物見を追い払え。こちらの陣を覗かせるな', 3.4]] },
    { kind: 'fight', at: SHORE, obj: '犀川の岸で、武田の物見を追い払う', title: '犀川', sub: '武田の物見が南の岸まで渡ってきた',
      say: [['組頭', '物見じゃ！　川へ追い落とせ！', 3]],
      foes: [{ name: '武田の物見', from: { x: SHORE.x - 6, z: SHORE.z + 8 }, list: [uS(2), uA(16)] },
        { name: '武田の物見の弓', from: { x: SHORE.x + 16, z: SHORE.z + 14 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '犀川の岸で武田の物見を追い払った' },
    { kind: 'fight', at: FORD, obj: '犀川を渡り、北の岸の武田の先手を崩す', title: '北の岸', sub: '川を渡った先に武田の先手',
      say: [['長尾景虎の使番', '殿より。一度だけ川を越え、武田の先手を叩いて戻れ', 3.2]],
      foes: [{ name: '武田の先手', from: { x: FORD.x, z: FORD.z + 14 }, list: [uS(3), uA(22)] },
        { name: '武田の鉄砲', from: { x: FORD.x + 18, z: FORD.z + 20 }, list: [uS(1), uG(5)] }],
      later: [{ t: 35, say: ['組頭', '旭山から加勢が下りてくる！'], foes: [{ name: '旭山の加勢', from: { x: FORD.x - 40, z: FORD.z + 20 }, list: [uS(2), uA(12)] }] }],
      reward: '北の岸で武田の先手を崩した' },
    { kind: 'hold', at: CAMP, label: '善光寺の東の陣', obj: '陣へ戻り、武田の夜討ちを受け止める', r: 18, dur: 70,
      title: '対陣', sub: '川を挟んで日が過ぎる。武田が夜討ちを仕掛ける',
      say: [['長尾景虎', '深追いはせぬ。陣へ戻れ。晴信は長く構えるつもりじゃ', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　川の方から武田が来るぞ！'], foes: [{ name: '武田の夜討ち', from: { x: CAMP.x - 10, z: CAMP.z + 44 }, list: [uS(3), uA(20)] }] },
        { t: 40, say: ['組頭', '二の手が来る！　陣を崩すな！'], foes: [{ name: '武田の夜討ち 二の手', from: { x: CAMP.x + 24, z: CAMP.z + 40 }, list: [uS(2), uA(12)] }] }],
      reward: '陣で武田の夜討ちを受け止めた' },
    { kind: 'fight', at: ASAHI, thin: true, obj: '旭山の麓で、退く武田の兵を追い崩す', title: '旭山の麓', sub: '和睦の前に、武田が旭山から兵を引く',
      say: [['長尾景虎の使番', '今川殿の仲立ちで和睦が決まりそうじゃ。旭山から退く兵を見届けよ', 3.4]],
      foes: [{ name: '旭山の武田の殿', from: { x: ASAHI.x + 6, z: ASAHI.z - 6 }, list: [uS(3), uA(18)] }],
      reward: '旭山から退く武田の殿を崩した' },
  ],
  win: {
    banner: '和睦', sub: '今川義元の仲立ちで、武田と長尾は兵を退く。旭山城は壊された', award: '二百日の対陣を守り抜いた',
    say: [['長尾景虎の使番', '旭山の城は壊すと決まりました。武田も兵を退きます', 3.2],
      ['長尾景虎', '晴信は北信濃をあきらめてはおらぬ。いずれまた来る', 3.4]],
  },
});
export default u02_saigawa;
