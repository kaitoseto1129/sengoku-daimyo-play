// 上杉編 九戦目「本庄繁長の乱」（永禄十一年〔1568〕十一月〜永禄十二年〔1569〕三月・越後 本庄城〔村上城〕）。軽い型（light_battle.js）
//   史実：揚北衆の本庄繁長が武田信玄に通じて背いた。上杉輝虎（謙信）は越中から戻って雪の中で本庄城を囲み、
//   繁長は城から夜討ちを仕掛けて囲みを苦しめたが、翌年三月、蘆名盛氏・伊達輝宗の仲立ちで子の千代丸を人質に出して降った。
//   出所：Wikipedia「本庄繁長」「本庄繁長の乱」・村上市の村上城跡の案内。くわしくは docs/chapter_uesugi.md
//   本庄家の紋は手元の紋に無いので、旗は一文字（ichimonji）を当てた（同じ揚北衆の色・家の紋の替わり）
import { withCastle } from './light_castle.js';
import { HONJO_PLAN } from './castles/honjo.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HONJO = { flag: 'ichimonji', armor: 0x3a3430 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, -96], [-90, -90], [0, -94], [100, -88], [220, -92]];   // 三面川（南の上杉の陣と北の本庄城の間の浅い流れ）
const FORD = { x: 6, z: -70 };          // 三面川の北の岸
const TOWN = { x: -20, z: -20 };        // 城下（本庄の兵が待つ町口）
const CAMP = { x: 30, z: 10 };          // 囲みの陣（夜討ちを受ける所）
const GATE = { x: 6, z: 62 };           // 本庄城（臥牛山）の麓の大手口
// K652②（11/25 Sanae・家の編を10分前後に）：逸話の段（K652⑥）＝永禄十二年正月、繁長の夜討ちで囲みの一手の色部勝長が討たれた（『上杉家御年譜』）。
//   本人は燃える色部の陣へ駆けつけ、本庄勢を追い払う。年が明けてからは、臥牛山の西の谷の水の手を断って城を干す
const IROBE = { x: 64, z: -24 };        // 色部勝長の陣（囲みの東の一手）
const MIZU = { x: -46, z: 48 };         // 臥牛山の西の谷の水の手

// 11/21 クラウド35（K563 ③の質）：本庄城（臥牛山の木柵の山城）を置く（castles/honjo.js・出所 docs/battle_refs/honjo.md）。遠景の軽い形
export const u09_honjo = withCastle(lightBattle({
  id: 'u09_honjo',
  date: '永禄十一年（1568）十一月　冬・雪　越後国 本庄城',
  intro: '揚北衆の本庄繁長が、武田信玄に通じて背いた。上杉輝虎は雪の中を本庄城へ向かい、城を囲む。',
  history: '永禄十一年（1568）、本庄繁長は武田信玄に通じて上杉輝虎に背いた。輝虎は雪の中で本庄城を囲み、繁長は夜討ちで囲みを苦しめた。翌年三月、蘆名盛氏と伊達輝宗の仲立ちで、繁長は子の千代丸を人質に出して降った。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '本庄繁長の軍', mon: 'ichimonji', faction: 'honjo' } },
  force: { a: 10000, b: 3000 },
  allyLook: UESUGI, foeLook: HONJO,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1568, snow: 0.5, overcast: true, time: 'day', winter: true, fogFar: 380,
    river: RIVER, riverW: 12, riverDepth: 0.5,
    hills: [[4, 110, 60, 26], [-120, 80, 60, 14], [140, 60, 70, 12], [-60, -220, 70, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：三面川の北の岸・城下・囲みの陣・本庄城 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -150], [6, -70], [-20, -20], [30, 10], [6, 62]], w: 3 }, { pts: [[30, 10], [64, -24]], w: 3 }, { pts: [[-20, -20], [-46, 48]], w: 3 }],
    groves: [{ x: 4, z: 110, r: 30, n: 30, kind: 'sugi' }, { x: -120, z: 80, r: 30, n: 30, kind: 'sugi' }],
    trees: 420, tufts: 1200,
  },
  allies: [
    { name: '上杉輝虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉輝虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉輝虎', '繁長め、信玄の誘いに乗ったか。雪が深くなる前に城を囲む', 3.4],
      ['上杉輝虎', '川を越え、城下の兵を払え。城へ逃げ込む道を塞ぐのじゃ', 3.4]] },
    { kind: 'fight', at: FORD, obj: '三面川を渡り、岸を守る本庄の兵を払う', title: '三面川', sub: '雪の川岸に本庄の兵',
      say: [['組頭', '足を取られるな！　岸へ上がれば押し返せる！', 3]],
      foes: [{ name: '本庄の岸の守り', from: { x: FORD.x - 6, z: FORD.z + 10 }, list: [uS(2), uA(24)] },
        { name: '本庄の弓', from: { x: FORD.x + 16, z: FORD.z + 14 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: FORD.x + 30, z: FORD.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '三面川の岸を取った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FORD.x + 14, z: FORD.z + 12 }, obj: '三面川の洲で、渡る者を狙う本庄の弓を討て', limit: 90,
      say: [['組頭', '洲の本庄の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '洲の本庄の弓', from: { x: FORD.x + 22, z: FORD.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '洲の本庄の弓を破った' },
    { kind: 'fight', at: TOWN, obj: '城下の町口で、本庄の兵を崩す', title: '城下', sub: '本庄の兵が町口を固める',
      say: [['上杉輝虎の使番', '殿より。町口を破り、城の麓まで兵を進めよ', 3.2]],
      foes: [{ name: '本庄の町口の守り', from: { x: TOWN.x, z: TOWN.z + 12 }, list: [uS(3), uA(30)] },
        { name: '本庄の鉄砲', from: { x: TOWN.x + 18, z: TOWN.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 35, say: ['組頭', '城から加勢が下りてくる！'], foes: [{ name: '本庄の加勢', from: { x: TOWN.x - 30, z: TOWN.z + 30 }, list: [uS(2), uA(18)] }] }],
      reward: '城下の町口を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TOWN.x + -14, z: TOWN.z + 10 }, obj: '町の路地で、横から出る本庄の足軽を討て', limit: 90,
      say: [['組頭', '路地の本庄の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '路地の本庄の足軽', from: { x: TOWN.x + -6, z: TOWN.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '路地の本庄の足軽を破った' },
    { kind: 'fight', at: IROBE, obj: '燃える色部の陣へ駆けつけ、夜討ちの本庄勢を追い払う', title: '色部の陣', sub: '繁長の夜討ち。囲みの東の色部勝長の陣が燃える',
      say: [['見張り', '東の陣が燃えておる！　色部殿の陣じゃ！', 3.2], ['上杉輝虎', '色部を見捨てるな。走れ！', 3]],
      foes: [{ name: '本庄の夜討ちの手', from: { x: IROBE.x - 4, z: IROBE.z + 10 }, list: [uS(3), uA(20)] },
        { name: '本庄の火矢', from: { x: IROBE.x + 16, z: IROBE.z + 16 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      later: [{ t: 35, say: ['色部の侍', '殿が……色部さまが討たれた！　仇を討て！'], foes: [{ name: '本庄の夜討ちの退き手', from: { x: IROBE.x + 24, z: IROBE.z + 30 }, list: [uS(2), uA(14)] }] }],
      reward: '色部の陣から本庄の夜討ちを追い払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IROBE.x + 14, z: IROBE.z + -12 }, obj: '色部の陣の柵の外で、火を掛ける本庄の足軽を討て', limit: 90,
      say: [['組頭', '火を掛ける本庄の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '火を掛ける本庄の足軽', from: { x: IROBE.x + 22, z: IROBE.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '火を掛ける本庄の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: CAMP, label: '囲みの陣', obj: '囲みの陣で、本庄の夜討ちを受け止める', r: 18, dur: 100,
      title: '囲み', sub: '雪の夜、繁長が城から打って出る',
      say: [['上杉輝虎', '繁長は戦上手じゃ。夜に来るぞ。陣を崩すな', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　城の方から本庄が来るぞ！'], foes: [{ name: '本庄の夜討ち', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(3), uA(30)] }] },
        { t: 40, say: ['組頭', '二の手が回り込む！　脇を固めよ！'], foes: [{ name: '本庄の夜討ち 二の手', from: { x: CAMP.x + 34, z: CAMP.z + 30 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '雪の夜の夜討ちを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: CAMP.x + -16, z: CAMP.z + 12 }, obj: '陣の外の篝火のそばで、忍び寄る本庄の足軽を討て', limit: 90,
      say: [['組頭', '忍び寄る本庄の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '忍び寄る本庄の足軽', from: { x: CAMP.x + -8, z: CAMP.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '忍び寄る本庄の足軽を破った' },
    { kind: 'fight', at: MIZU, obj: '臥牛山の西の谷へ回り、水の手を守る本庄の兵を払う', title: '水の手', sub: '年が明けた。城の水を断てば、繁長も長くは持たぬ',
      say: [['上杉輝虎の使番', '殿より。西の谷の水の手を断て。雪解けまで待たずに城を干す', 3.4]],
      foes: [{ name: '水の手の守り', from: { x: MIZU.x + 4, z: MIZU.z + 12 }, list: [uS(3), uA(18)] },
        { name: '谷の上の弓', from: { x: MIZU.x - 14, z: MIZU.z + 16 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      later: [{ t: 40, say: ['組頭', '城から水を守りに下りてくる！'], foes: [{ name: '本庄の水の手の加勢', from: { x: MIZU.x + 26, z: MIZU.z + 24 }, list: [uS(2), uA(14)] }] }],
      reward: '水の手を断った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MIZU.x + 12, z: MIZU.z + -12 }, obj: '水の手の谷で、柵を守る本庄の足軽を討て', limit: 90,
      say: [['組頭', '柵を守る本庄の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '柵を守る本庄の足軽', from: { x: MIZU.x + 20, z: MIZU.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '柵を守る本庄の足軽を破った' },
    { kind: 'fight', at: GATE, obj: '本庄城の大手口へ寄せ、守りを崩す', title: '大手口', sub: '年が明け、城の兵糧が尽きかけている',
      say: [['上杉輝虎の使番', '城の兵は飢えておる。大手口を押せば、繁長も折れよう', 3.4]],
      foes: [{ name: '本庄の大手口の守り', from: { x: GATE.x, z: GATE.z + 8 }, list: [uS(3), uA(27)] },
        { name: '本庄繁長の旗本', from: { x: GATE.x + 14, z: GATE.z + 16 }, list: [uS(4), uA(9)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '本庄城の大手口を崩した' },
  ],
  win: {
    banner: '降伏', sub: '蘆名と伊達の仲立ちで、本庄繁長は子の千代丸を人質に出して降った', award: '本庄城を降らせた',
    say: [['上杉輝虎の使番', '繁長が降りました。千代丸殿を人質に差し出すとのこと', 3.2],
      ['上杉輝虎', '許す。繁長ほどの者を失うのは越後の損じゃ', 3.4]],
  },
}), { plan: HONJO_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default u09_honjo;
