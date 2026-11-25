// 長宗我部家編 二「朝倉城の戦い」（永禄五年〔1562〕九月・土佐国 朝倉城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：家を継いだ元親は本山茂辰の朝倉城を攻め、城の外の野で本山勢と戦った。本山は翌年に城を焼いて本山の山へ退いた
//   （『土佐物語』B・高知市の解説 C。年は永禄五〜六年の諸説・推）。
// 仕組み：初めての「一領具足の呼び集め」（法螺の台に着くと田の畦の影が立って走り寄る・遅れると遠い畦から田に残る）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const MOTO = { flag: 'maru', armor: 0x34302a };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 24, z: -60 };     // 法螺の台（田の中の塚）
const FIELD = { x: 0, z: 26 };      // 朝倉の野
const MORI = { x: -8, z: 50 };      // 鴻ノ森の裾
const CASTLE = { x: 4, z: 100 };    // 朝倉城の大手

export const c02_asakura = chosoBattle({
  id: 'c02_asakura',
  date: '永禄五年（1562）九月　朝　土佐国 朝倉',
  intro: '家を継いだ元親様が、本山の朝倉城を攻める。田の畦には、槍を置いた一領具足。法螺が鳴るのを待っている。',
  history: '永禄五年（1562）九月、家を継いだ長宗我部元親は本山茂辰の朝倉城を攻め、城の外で本山勢と戦った。翌年、茂辰は朝倉城を焼いて本山の山へ退き、長宗我部は土佐の中ほどを手に入れた（年と兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '本山の軍', mon: 'maru', faction: 'miyoshi' } },
  force: { a: 3000, b: 2000 },
  foeLook: MOTO,
  foeDmg: 0.72,   // 11/25 act bot「無傷で15人」＝本山の刃を少し強く（厳島と同じ手）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1562, time: 'day', fogFar: 440, autumn: true,
    hills: [[HORA.x, HORA.z, 7, 1.6], [MORI.x - 30, MORI.z + 10, 30, 8], [CASTLE.x, CASTLE.z + 30, 44, 16], [-160, -140, 80, 20], [160, -140, 80, 18]],
    paths: [{ pts: [[0, -140], [0, -40], [0, 26], [4, 100], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 120 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: MORI.x - 30, z: MORI.z + 10, r: 22, n: 22 }, { x: CASTLE.x, z: CASTLE.z + 34, r: 30, n: 26 }],
    trees: 360, tufts: 1800,
  },
  fields: [{ at: { x: 56, z: -44 }, far: 0 }, { at: { x: -40, z: -52 }, far: 1 }, { at: { x: 66, z: -98 }, far: 2 }, { at: { x: -54, z: -100 }, far: 3 }],
  callSay: ['長宗我部元親', '来たな。土佐の田の者は、皆わしの槍じゃ', '……遅い。集まった者だけで行く'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '吉良親貞の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('吉良親貞'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '朝倉の城を落とせば、本山は山へ逃げるしかない', 3.2],
      ['組頭', '法螺の台は田の中の塚じゃ。走って吹け。畦の者が起きる', 3.4],
      ['吉良親貞', '兄上、遅れれば田へ帰る者も出ますぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: FIELD, obj: '朝倉の野で、本山の先手を破る', title: '朝倉の野', sub: '本山の先手が城から出る',
      say: [['長宗我部元親', '一領具足、前へ！', 2.6], ['本山の侍', '土佐の百姓槍じゃ！　蹴散らせ！', 3]],
      foes: [{ name: '本山の先手', from: { x: FIELD.x + 4, z: FIELD.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['本山の侍', '弓、横から射よ！'], foes: [{ name: '本山の弓', from: { x: FIELD.x + 20, z: FIELD.z + 16 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '朝倉の野で本山の先手を破った' },
    { kind: 'hold', at: MORI, label: '森の裾', obj: '森の裾を守り、本山の寄せを受ける', r: 16, dur: 60, title: '森の裾', sub: '本山の寄せ',
      say: [['吉良親貞', '森の裾を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['本山の侍', '押し返せ！'], foes: [{ name: '本山の二の手', from: { x: MORI.x + 12, z: MORI.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['本山の侍', '森から回れ！'], foes: [{ name: '本山の三の手', from: { x: MORI.x - 20, z: MORI.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '森の裾を守った' },
    { kind: 'fight', at: CASTLE, obj: '朝倉城の大手の本山勢を崩す', title: '朝倉城', sub: '本山茂辰の旗が大手に立つ', max: 140,
      say: [['長宗我部元親', '茂辰はそこじゃ！　押せ！', 3]],
      foes: [{ name: '本山茂辰の備', from: { x: CASTLE.x, z: CASTLE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '本山茂辰', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['本山の侍', '殿を守れ！　鉄砲を前へ！'], foes: [{ name: '本山の旗本', from: { x: CASTLE.x - 14, z: CASTLE.z + 18 }, list: [uS(2), uA(8), uG(2)] }] }],
      reward: '本山茂辰の備を崩した' },
  ],
  win: {
    banner: '朝倉の勝ち', sub: '本山の兵が城へ逃げ込む', award: '朝倉で本山茂辰を破った',
    say: [['組頭', '本山が城へ逃げ込んだ。もう野には出てこられまい', 3.2],
      ['長宗我部元親', '一領具足の働き、見事であった', 3],
      ['吉良親貞', '本山が山へ退くのも、もう間もなくでございましょう', 3.2]],
  },
});
export default c02_asakura;
