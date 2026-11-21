// 上杉編 九戦目「本庄繁長の乱」（永禄十一年〔1568〕十一月〜永禄十二年〔1569〕三月・越後 本庄城〔村上城〕）。軽い型（light_battle.js）
//   史実：揚北衆の本庄繁長が武田信玄に通じて背いた。上杉輝虎（謙信）は越中から戻って雪の中で本庄城を囲み、
//   繁長は城から夜討ちを仕掛けて囲みを苦しめたが、翌年三月、蘆名盛氏・伊達輝宗の仲立ちで子の千代丸を人質に出して降った。
//   出所：Wikipedia「本庄繁長」「本庄繁長の乱」・村上市の村上城跡の案内。くわしくは docs/chapter_uesugi.md
//   本庄家の紋は手元の紋に無いので、旗は一文字（ichimonji）を当てた（同じ揚北衆の色・家の紋の替わり）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HONJO = { flag: 'ichimonji', armor: 0x3a3430 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, -96], [-90, -90], [0, -94], [100, -88], [220, -92]];   // 三面川（南の上杉の陣と北の本庄城の間の浅い流れ）
const FORD = { x: 6, z: -70 };          // 三面川の北の岸
const TOWN = { x: -20, z: -20 };        // 城下（本庄の兵が待つ町口）
const CAMP = { x: 30, z: 10 };          // 囲みの陣（夜討ちを受ける所）
const GATE = { x: 6, z: 62 };           // 本庄城（臥牛山）の麓の大手口

export const u09_honjo = lightBattle({
  id: 'u09_honjo',
  date: '永禄十一年（1568）十一月　冬・雪　越後国 本庄城',
  intro: '揚北衆の本庄繁長が、武田信玄に通じて背いた。上杉輝虎は雪の中を本庄城へ向かい、城を囲む。',
  history: '永禄十一年（1568）、本庄繁長は武田信玄に通じて上杉輝虎に背いた。輝虎は雪の中で本庄城を囲み、繁長は夜討ちで囲みを苦しめた。翌年三月、蘆名盛氏と伊達輝宗の仲立ちで、繁長は子の千代丸を人質に出して降った。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '本庄繁長の軍', mon: 'ichimonji', faction: 'honjo' } },
  force: { a: 10000, b: 3000 },
  allyLook: UESUGI, foeLook: HONJO,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1568, time: 'day', winter: true, fogFar: 380,
    river: RIVER, riverW: 12, riverDepth: 0.5,
    hills: [[4, 110, 60, 26], [-120, 80, 60, 14], [140, 60, 70, 12], [-60, -220, 70, 8]],
    trees: 480, tufts: 1200,
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
    { kind: 'fight', at: TOWN, obj: '城下の町口で、本庄の兵を崩す', title: '城下', sub: '本庄の兵が町口を固める',
      say: [['上杉輝虎の使番', '殿より。町口を破り、城の麓まで兵を進めよ', 3.2]],
      foes: [{ name: '本庄の町口の守り', from: { x: TOWN.x, z: TOWN.z + 12 }, list: [uS(3), uA(30)] },
        { name: '本庄の鉄砲', from: { x: TOWN.x + 18, z: TOWN.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 35, say: ['組頭', '城から加勢が下りてくる！'], foes: [{ name: '本庄の加勢', from: { x: TOWN.x - 30, z: TOWN.z + 30 }, list: [uS(2), uA(18)] }] }],
      reward: '城下の町口を破った' },
    { kind: 'hold', at: CAMP, label: '囲みの陣', obj: '囲みの陣で、本庄の夜討ちを受け止める', r: 18, dur: 100,
      title: '囲み', sub: '雪の夜、繁長が城から打って出る',
      say: [['上杉輝虎', '繁長は戦上手じゃ。夜に来るぞ。陣を崩すな', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　城の方から本庄が来るぞ！'], foes: [{ name: '本庄の夜討ち', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(3), uA(30)] }] },
        { t: 40, say: ['組頭', '二の手が回り込む！　脇を固めよ！'], foes: [{ name: '本庄の夜討ち 二の手', from: { x: CAMP.x + 34, z: CAMP.z + 30 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '雪の夜の夜討ちを受け止めた' },
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
});
export default u09_honjo;
