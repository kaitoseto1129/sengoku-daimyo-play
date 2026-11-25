// 長宗我部家編 十五「八尾の戦い」（慶長二十年〔1615〕五月六日・河内国 八尾＝大坂夏の陣）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   既存の k14_yao_wakae（徳川の側）の反対の、長宗我部の足軽の側（作り直しでなく軽い型で写した）。
//   史実：土佐を失って京で寺子屋の師をしていた盛親は、大坂城に入った。夏の陣で八尾へ出て、長瀬川の堤に兵を伏せ、
//   藤堂高虎の先手を引きつけて崩し、藤堂高刑・藤堂氏勝らを討った。だが若江で木村重成が敗れ、盛親は大坂へ退いた（『大坂御陣覚書』B・兵の数は推）。
// 仕組み：一領具足の呼び集め（堤の陰に伏せた旧臣を、法螺で起こす。土佐から盛親を慕って来た者たち）
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';

const TODO = { flag: 'todo', armor: 0x24221f };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 24, z: -58 };     // 法螺の台（堤の上の塚）
const TSUTSUMI = { x: -4, z: 24 };  // 長瀬川の堤
const TAKANORI = { x: 10, z: 56 };  // 藤堂高刑の手
const KUCHI = { x: 0, z: 90 };      // 藤堂の二陣の口
const RIVER = [[-220, -8], [-100, -10], [0, -6], [100, -10], [220, -6]];

export const c15_yao = chosoBattle({
  id: 'c15_yao',
  date: '慶長二十年（1615）五月六日　朝　河内国 八尾',
  intro: '土佐を失って十五年。盛親様は大坂城に入り、八尾へ出た。長瀬川の堤の陰に、土佐から付いてきた一領具足が伏せている。霧の中から藤堂の兵。',
  history: '慶長二十年（1615）五月六日、大坂方の長宗我部盛親は河内の八尾で藤堂高虎の兵と戦った。長瀬川の堤に兵を伏せて藤堂の先手を引きつけ、藤堂高刑らを討って藤堂勢を崩した。だが隣の若江で木村重成が敗れ、盛親は大坂へ退いた。大坂城が落ちた後、盛親は捕らえられて斬られ、長宗我部の家は絶えた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '藤堂の軍', mon: 'todo', faction: 'tokugawa' } },
  force: { a: 5000, b: 5000 },
  foeLook: TODO,
  foeDmg: 0.5,   // 11/25 act bot が197秒で倒れた（藤堂の二陣の段）＝刃を弱める
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1615, time: 'morning', fogFar: 340, mist: 0.5,
    river: RIVER, riverW: 10, riverDepth: 0.4,
    hills: [[HORA.x, HORA.z, 7, 1.6], [0, 8, 160, 1.6], [-160, 120, 80, 10], [160, 120, 80, 10], [-150, -150, 80, 12]],
    paths: [{ pts: [[0, -140], [0, -40], [-4, 24], [10, 56], [0, 90], [0, 160]], w: 3 }],
    paddy: (x, z) => (z < -20 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 120 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: -100, z: 60, r: 24, n: 22 }, { x: 100, z: 60, r: 24, n: 22 }, { x: -150, z: -150, r: 30, n: 22 }],
    trees: 300, tufts: 1800,
  },
  fields: [{ at: { x: 56, z: -44 }, far: 0 }, { at: { x: -42, z: -50 }, far: 1 }, { at: { x: 66, z: -98 }, far: 2 }, { at: { x: -58, z: -100 }, far: 3 }],
  callSay: ['長宗我部盛親', '皆、よう来てくれた。土佐の槍を、もう一度見せてやれ', '……来られたのは、これだけか。よい、行くぞ'],
  allies: [
    { name: '長宗我部盛親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部盛親'), uS(4), uA(8)] },
    { name: '吉田重康の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('吉田重康'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部盛親', '藤堂が来る。堤の陰で待ち、引きつけて叩く', 3.2],
      ['組頭', '土佐から付いてきた者らが、堤の田に伏せておる。法螺で起こせ', 3.4],
      ['吉田重康', '殿、関ヶ原の借りを、今日返しましょうぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、旧臣の一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: TSUTSUMI, obj: '長瀬川の堤で、藤堂の先手を崩す', title: '八尾', sub: '霧の中から藤堂の先手',
      say: [['長宗我部盛親', '今じゃ！　堤から出よ！', 2.8], ['藤堂の侍', '伏兵じゃ！　堤の陰に！', 3]],
      foes: [{ name: '藤堂の先手', from: { x: TSUTSUMI.x + 4, z: TSUTSUMI.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['藤堂の侍', '鉄砲、堤を撃て！'], foes: [{ name: '藤堂の鉄砲', from: { x: TSUTSUMI.x + 22, z: TSUTSUMI.z + 16 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '長瀬川の堤で藤堂の先手を崩した' },
    { kind: 'fight', at: TAKANORI, obj: '藤堂高刑の手を崩す', title: '藤堂高刑', sub: '藤堂の一門が踏みとどまる', max: 130,
      say: [['吉田重康', '藤堂の一門じゃ！　討ち取れ！', 3]],
      foes: [{ name: '藤堂高刑の手', from: { x: TAKANORI.x, z: TAKANORI.z + 12 }, list: [{ type: 'samurai', n: 1, o: { name: '藤堂高刑', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['藤堂の侍', '高刑様を守れ！'], foes: [{ name: '藤堂の旗本', from: { x: TAKANORI.x - 16, z: TAKANORI.z + 18 }, list: [uS(2), uA(8)] }] }],
      reward: '藤堂高刑の手を崩した' },
    { kind: 'hold', at: KUCHI, label: '二陣の口', obj: '二陣の口で、藤堂の新手を受ける', r: 16, dur: 60, title: '藤堂の新手', sub: '高虎の旗本が押し出す',
      say: [['長宗我部盛親', '藤堂の本陣が出てきた。ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['藤堂の侍', '押し返せ！'], foes: [{ name: '藤堂の二陣', from: { x: KUCHI.x + 10, z: KUCHI.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['藤堂の侍', '三陣、かかれ！'], foes: [{ name: '藤堂の三陣', from: { x: KUCHI.x - 20, z: KUCHI.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '藤堂の新手を受けた' },
  ],
  win: {
    banner: '八尾の勝ち', sub: '藤堂勢が崩れる', award: '八尾で藤堂勢を崩した',
    say: [['組頭', '藤堂が崩れた！　土佐の槍じゃ！', 3],
      ['吉田重康', '殿……若江の木村殿が、討たれたとの知らせ', 3.2],
      ['長宗我部盛親', '……そうか。皆、大坂へ退く。今日の槍、忘れぬぞ', 3.4]],
  },
});
export default c15_yao;
