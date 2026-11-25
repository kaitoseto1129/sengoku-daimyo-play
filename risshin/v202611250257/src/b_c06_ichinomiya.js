// 長宗我部家編 十「一宮城の戦い」（天正十三年〔1585〕七月・阿波国 一宮城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：羽柴秀長の大軍が阿波へ入り、谷忠澄・江村親俊の守る一宮城を囲んだ。城は水の手を断たれるまで持ちこたえ、忠澄は元親に和を勧めた。
//   元親は降り、土佐一国を安堵された（『元親記』B。既存 t05_ichinomiya＝羽柴の側の反対の側。兵の数は通説・諸説）。
//   この戦の「勝ち」は、水の手が断たれるまで城を守り切る事（呼び集めは城の外の田の兵を、城の中へ呼び入れる形）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const HASHIBA = { flag: 'toyotomi', armor: 0x2a2420 };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: -22, z: -58 };    // 法螺の台（城の裏の田）
const GATE = { x: 0, z: 10 };       // 一宮城の大手の下
const WATER = { x: 34, z: 30 };     // 水の手
const NINO = { x: -4, z: -14 };     // 二の丸

export const c06_ichinomiya = chosoBattle({
  id: 'c06_ichinomiya',
  date: '天正十三年（1585）七月　昼　阿波国 一宮城',
  intro: '羽柴秀長の大軍が、阿波の一宮城を囲んだ。守るのは谷忠澄と江村親俊。城の裏の田に、まだ呼べる一領具足がいる。',
  history: '天正十三年（1585）、羽柴秀長の大軍が阿波へ入り、谷忠澄・江村親俊が守る一宮城を囲んだ。城は水の手を断たれるまで持ちこたえたが、忠澄は羽柴の兵の多さを見て元親に和を勧めた。元親は降り、土佐一国だけを残された（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '羽柴の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 5000, b: 50000 },
  foeLook: HASHIBA,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1585, time: 'day', fogFar: 420,
    hills: [[HORA.x, HORA.z, 7, 1.6], [0, -20, 44, 6], [-140, 80, 70, 18], [140, 90, 70, 18], [0, 200, 100, 24], [-160, -150, 80, 20]],
    paths: [{ pts: [[0, -140], [0, -40], [-4, -14], [0, 10], [0, 80], [0, 170]], w: 3 }, { pts: [[0, 10], [34, 30], [60, 60]], w: 2.4 }],
    paddy: (x, z) => (z < -30 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 110 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: -140, z: 80, r: 30, n: 26 }, { x: 140, z: 90, r: 30, n: 26 }, { x: 60, z: 60, r: 20, n: 20 }],
    trees: 360, tufts: 1700,
  },
  fields: [{ at: { x: -58, z: -44 }, far: 0 }, { at: { x: 40, z: -54 }, far: 1 }, { at: { x: -64, z: -98 }, far: 2 }, { at: { x: 56, z: -100 }, far: 3 }],
  callSay: ['谷忠澄', '城へ入れ！　大手を固めよ！', '……これだけか。集まった者で守る'],
  allies: [
    { name: '谷忠澄の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('谷忠澄'), uS(4), uA(8)] },
    { name: '江村親俊の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('江村親俊'), uS(3), uA(8)] },
    { name: '城の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(4)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['谷忠澄', '羽柴の兵は五万を超える。城で持ちこたえるしかない', 3.2],
      ['組頭', '裏の田に、まだ一領具足がおる。法螺で城へ呼び入れよ', 3.2],
      ['江村親俊', '大手に羽柴の先手が来るぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を城へ呼び入れる', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'hold', at: GATE, label: '大手の下', obj: '大手の下で、羽柴の寄せを受ける', r: 16, dur: 70, title: '一宮城', sub: '羽柴の先手が寄せる',
      say: [['谷忠澄', '大手を固めよ！　一歩も入れるな！', 3], ['羽柴の侍', 'かかれ！　小城じゃ、一息に揉め！', 3]],
      waves: [{ t: 0, say: ['羽柴の侍', '大手へかかれ！'], foes: [{ name: '羽柴の先手', from: { x: GATE.x + 6, z: GATE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 32, say: ['羽柴の侍', '鉄砲、撃ちかけよ！'], foes: [{ name: '羽柴の鉄砲', from: { x: GATE.x - 20, z: GATE.z + 30 }, list: [uS(1), uA(6), uG(4)] }] }],
      reward: '大手の下を守った' },
    { kind: 'fight', at: WATER, obj: '水の手を切りに来た羽柴の兵を払う', title: '水の手', sub: '羽柴の兵が水の手へ回る', max: 120,
      say: [['江村親俊', '水の手を取られたら、城は終わりじゃ！', 3]],
      foes: [{ name: '羽柴の水の手の兵', from: { x: WATER.x + 10, z: WATER.z + 16 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['羽柴の侍', '堰を切れ！'], foes: [{ name: '羽柴の土掘り', from: { x: WATER.x + 24, z: WATER.z + 8 }, list: [uS(1), uA(8)] }] }],
      reward: '水の手を守った' },
    { kind: 'hold', at: NINO, label: '二の丸', obj: '二の丸で、羽柴の新手を受ける', r: 16, dur: 60, title: '二の丸', sub: '羽柴の新手',
      say: [['谷忠澄', '二の丸まで来た。ここが最後の守りじゃ', 3]],
      waves: [{ t: 0, say: ['羽柴の侍', '二の丸へ押せ！'], foes: [{ name: '羽柴の新手', from: { x: NINO.x + 10, z: NINO.z + 36 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['羽柴の侍', '横からも回れ！'], foes: [{ name: '羽柴の新手の二', from: { x: NINO.x - 26, z: NINO.z + 24 }, list: [uS(2), uA(10), uB(3)] }] }],
      reward: '二の丸を守った' },
  ],
  win: {
    banner: '一宮城、持ちこたえた', sub: '谷忠澄が和を勧める', award: '一宮城を守り抜いた',
    say: [['谷忠澄', '城は守った。されど、羽柴の兵は尽きぬ', 3.2],
      ['谷忠澄', '殿に和を勧める。土佐を残すためじゃ', 3],
      ['組頭', '……田へ帰れる日が、来るのかのう', 3]],
  },
});
export default c06_ichinomiya;
