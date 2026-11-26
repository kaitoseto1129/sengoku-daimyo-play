// 上杉編 二戦目「犀川の戦い」（第二次川中島・天文二十四年〔1555〕七月〜閏十月）。軽い型（light_battle.js）
//   史実：武田方の旭山城（善光寺の西の山）に兵が入り、景虎は善光寺の東に陣を構えて犀川を挟んで武田晴信と向き合った。
//   七月の犀川の小競り合いの後、二百日に及ぶ対陣となり、閏十月に今川義元の仲立ちで和睦、双方が退いた。旭山城は破却された。
//   出所：Wikipedia「川中島の戦い」（第二次合戦）・長野市の旭山城跡の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 20, z: -140 };
const RIVER = [[-220, -40], [-100, -46], [0, -40], [120, -48], [220, -42]];   // 犀川（南の善光寺の側と北の武田の陣の間）
const SHORE = { x: 10, z: -66 };        // 犀川の南の岸の物見の場
const FORD = { x: -20, z: -18 };        // 犀川の北の岸（渡った先）
const CAMP = { x: 20, z: -110 };        // 善光寺の東の陣（夜討ちを受ける所）
const ASAHI = { x: -50, z: -20 };        // 旭山の麓
// K652②（11/25 Sanae・家の編を10分前後に）：対陣の中の史実の段。晴信は旭山城に兵三千・弓八百・鉄砲三百を入れた（『勝山記』）。
//   景虎は旭山を押さえるため、北の葛山に付城を築いた（長野市の史跡の案内）。逸話の段（K652⑥）＝旭山の鉄砲三百の前へ、玉込めの間に駆け込む
const SLOPE = { x: -60, z: 0 };          // 旭山の東の裾（城の鉄砲が届く坂の下）
const KUZU = { x: -40, z: 22 };          // 葛山の付城の普請場

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
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1555, time: 'day', fogFar: 460,
    river: RIVER, riverW: 18, riverDepth: 0.7,
    hills: [[-110, 40, 50, 22], [-150, 0, 40, 14], [150, 120, 70, 16], [60, -200, 60, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：犀川の南の岸の物見の場・犀川の北の岸・善光寺の東の陣・旭山の麓 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[20, -140], [20, -110], [10, -66], [-60, 0], [-40, 22], [-50, -20], [-20, -18]], w: 3 }],
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
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SHORE.x + 14, z: SHORE.z + 12 }, obj: '犀川の岸の葦の陰で、伏せた武田の弓を討て', limit: 90,
      say: [['組頭', '伏せた武田の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた武田の弓', from: { x: SHORE.x + 22, z: SHORE.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた武田の弓を破った' },
    { kind: 'fight', at: FORD, obj: '犀川を渡り、北の岸の武田の先手を崩す', title: '北の岸', sub: '川を渡った先に武田の先手',
      say: [['長尾景虎の使番', '殿より。一度だけ川を越え、武田の先手を叩いて戻れ', 3.2]],
      foes: [{ name: '武田の先手', from: { x: FORD.x, z: FORD.z + 14 }, list: [uS(3), uA(22)] },
        { name: '武田の鉄砲', from: { x: FORD.x + 18, z: FORD.z + 20 }, list: [uS(1), uG(5)] }],
      later: [{ t: 35, say: ['組頭', '旭山から加勢が下りてくる！'], foes: [{ name: '旭山の加勢', from: { x: FORD.x - 40, z: FORD.z + 20 }, list: [uS(2), uA(12)] }] }],
      reward: '北の岸で武田の先手を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FORD.x + -14, z: FORD.z + -10 }, obj: '北の岸の浅瀬で、渡り返す武田の足軽を討て', limit: 90,
      say: [['組頭', '渡り返す武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '渡り返す武田の足軽', from: { x: FORD.x + -6, z: FORD.z + 2 }, list: [uS(2), uA(10)] }],
      reward: '渡り返す武田の足軽を破った' },
    { kind: 'hold', at: CAMP, label: '善光寺の東の陣', obj: '陣へ戻り、武田の夜討ちを受け止める', r: 18, dur: 70,
      title: '対陣', sub: '川を挟んで日が過ぎる。武田が夜討ちを仕掛ける',
      say: [['長尾景虎', '深追いはせぬ。陣へ戻れ。晴信は長く構えるつもりじゃ', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　川の方から武田が来るぞ！'], foes: [{ name: '武田の夜討ち', from: { x: CAMP.x - 10, z: CAMP.z + 44 }, list: [uS(3), uA(20)] }] },
        { t: 40, say: ['組頭', '二の手が来る！　陣を崩すな！'], foes: [{ name: '武田の夜討ち 二の手', from: { x: CAMP.x + 24, z: CAMP.z + 40 }, list: [uS(2), uA(12)] }] }],
      reward: '陣で武田の夜討ちを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: CAMP.x + 16, z: CAMP.z + 14 }, obj: '陣の外の篝火の間で、忍び寄る武田の足軽を討て', limit: 90,
      say: [['組頭', '忍び寄る武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '忍び寄る武田の足軽', from: { x: CAMP.x + 24, z: CAMP.z + 26 }, list: [uS(2), uA(10)] }],
      reward: '忍び寄る武田の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'fight', at: SLOPE, obj: '旭山の裾で、城の鉄砲の放ち手を玉込めの間に討つ', title: '旭山の鉄砲', sub: '晴信は旭山の城に鉄砲三百を入れた',
      say: [['組頭', '撃った後が好機じゃ。玉を込める間に駆け込め！', 3.2], ['長尾景虎の使番', '殿より。旭山の鉄砲を黙らせよ。付城の普請に掛かる', 3.2]],
      foes: [{ name: '旭山の鉄砲', from: { x: SLOPE.x - 8, z: SLOPE.z + 10 }, list: [uS(1), uG(10)] },
        { name: '旭山の鉄砲の守り', from: { x: SLOPE.x + 6, z: SLOPE.z + 6 }, list: [uS(2), uA(14)] }],
      later: [{ t: 40, say: ['武田の侍', '城から加勢じゃ！　鉄砲を守れ！'], foes: [{ name: '旭山の城兵', from: { x: SLOPE.x - 20, z: SLOPE.z + 18 }, list: [uS(2), uA(12)] }] }],
      reward: '旭山の鉄砲を黙らせた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SLOPE.x + -12, z: SLOPE.z + 14 }, obj: '旭山の坂の途中で、石を落とす武田の足軽を討て', limit: 90,
      say: [['組頭', '石を落とす武田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '石を落とす武田の足軽', from: { x: SLOPE.x + -4, z: SLOPE.z + 26 }, list: [uS(2), uA(10)] }],
      reward: '石を落とす武田の足軽を破った' },
    { kind: 'hold', at: KUZU, label: '葛山の普請場', obj: '葛山の付城の普請を、旭山から打って出る兵から守る', r: 16, dur: 70,
      title: '葛山の付城', sub: '旭山を押さえる城を、北の葛山に築く',
      say: [['長尾景虎', '旭山の向こうに城を築けば、晴信の兵は動けぬ', 3.4], ['普請の者', '柵を立てまする！　あと少し持ちこたえてくだされ！', 3.2]],
      waves: [
        { t: 6, say: ['武田の侍', '普請をさせるな！　打って出よ！'], foes: [{ name: '旭山の打って出', from: { x: KUZU.x - 30, z: KUZU.z + 26 }, list: [uS(3), uA(16)] }] },
        { t: 36, say: ['見張り', '犀川の方からも来る！'], foes: [{ name: '武田の後詰', from: { x: KUZU.x + 26, z: KUZU.z + 34 }, list: [uS(2), uA(12)] }] }],
      reward: '葛山の付城の普請を守り抜いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KUZU.x + 14, z: KUZU.z + -12 }, obj: '葛山の普請場の脇で、打って出た武田の鉄砲を払え', limit: 90,
      say: [['組頭', '打って出た武田の鉄砲が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '打って出た武田の鉄砲', from: { x: KUZU.x + 22, z: KUZU.z + 0 }, list: [uS(1), uA(6), uG(4)] }],
      reward: '打って出た武田の鉄砲を破った' },
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
