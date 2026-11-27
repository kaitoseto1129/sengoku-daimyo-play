// 長宗我部家編 二「朝倉城の戦い」（永禄五年〔1562〕九月・土佐国 朝倉城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：家を継いだ元親は本山茂辰の朝倉城を攻め、城の外の野で本山勢と戦った。本山は翌年に城を焼いて本山の山へ退いた
//   （『土佐物語』B・高知市の解説 C。年は永禄五〜六年の諸説・推）。
// 仕組み：初めての「一領具足の呼び集め」（法螺の台に着くと田の畦の影が立って走り寄る・遅れると遠い畦から田に残る）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { withCastle } from './light_castle.js';
import { ASAKURA_TOSA_PLAN } from './castles/asakura_tosa.js';   // K657② 朝倉城を戦場に（11/25 クラウドす）

const MOTO = { flag: 'maru', armor: 0x34302a };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 24, z: -60 };     // 法螺の台（田の中の塚）
const FIELD = { x: 0, z: 26 };      // 朝倉の野
const MORI = { x: -8, z: 50 };      // 鴻ノ森の裾
const CASTLE = { x: 4, z: 100 };    // 朝倉城の大手

export const c02_asakura = withCastle(chosoBattle({
  id: 'c02_asakura',
  date: '永禄五年（1562）九月　朝　土佐国 朝倉',
  intro: '家を継いだ元親様が、本山の朝倉城を攻める。田の畦には、槍を置いた一領具足。法螺が鳴るのを待っている。',
  history: '永禄五年（1562）九月、家を継いだ長宗我部元親は本山茂辰の朝倉城を攻め、城の外で本山勢と戦った。翌年、茂辰は朝倉城を焼いて本山の山へ退き、長宗我部は土佐の中ほどを手に入れた（年と兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '本山の軍', mon: 'maru', faction: 'miyoshi' } },
  force: { a: 3000, b: 2000 },
  foeLook: MOTO,
  foeDmg: 0.62,   // 11/25 act bot「無傷で15人」＝本山の刃を少し強く（厳島と同じ手）
  thick: true,   // 11/25 act bot 討ち取り4（5分）＝厚みを足す
  stepLimit: 110,   // K720 二回目：act bot が1080秒（上限）で終わらず＝一つの段を110秒で次へ（light_battle.js stepLimit）
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
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FIELD.x - 30, z: FIELD.z + 14 }, obj: '朝倉城の外の田で、出て来た本山の足軽組を崩す', max: 100, limit: 90,
      say: [['長宗我部元親', '田の畦を使え。一領具足、前へ', 3.2]],
      foes: [{ name: '本山の足軽組', from: { x: FIELD.x - 18, z: FIELD.z + 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '田の足軽組を崩した' },
    { kind: 'hold', at: { x: FIELD.x + 26, z: FIELD.z + 30 }, label: '城の外の道で', obj: '城の外の道で、朝倉へ急ぐ本山の後詰を受け止める', r: 16, dur: 45,
      say: [['見張り', '本山の後詰が来る！　道を塞げ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '本山の後詰', from: { x: FIELD.x + 38, z: FIELD.z + 18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '本山の後詰', from: { x: FIELD.x + 12, z: FIELD.z + 44 }, list: [uS(2), uA(7)] }] }],
      reward: '城の外の道を守った' },
    { kind: 'fight', at: CASTLE, obj: '朝倉城の大手の本山勢を崩す', title: '朝倉城', sub: '本山茂辰の旗が大手に立つ', max: 140,
      say: [['長宗我部元親', '茂辰はそこじゃ！　押せ！', 3]],
      foes: [{ name: '本山茂辰の備', from: { x: CASTLE.x, z: CASTLE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '本山茂辰', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['本山の侍', '殿を守れ！　鉄砲を前へ！'], foes: [{ name: '本山の旗本', from: { x: CASTLE.x - 14, z: CASTLE.z + 18 }, list: [uS(2), uA(8), uG(2)] }] }],
      reward: '本山茂辰の備を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '本山は城へ籠った。鴻ノ森の砦から矢が来るぞ', 3]]),
    fightS({ x: -40, z: 80 }, '鴻ノ森の砦の本山の弓衆を払う', '鴻ノ森', '森の砦から矢が降る', [['長宗我部元親', '森の弓を黙らせよ。大手はその後じゃ', 3]],
      [foe('鴻ノ森の弓衆', -50, 92, [uS(1), uB(8)]), foe('鴻ノ森の守り', -30, 96, [uS(2), uA(10)])], { later: [wave(28, '本山の侍', '森から槍を出せ！', [foe('鴻ノ森の槍', -60, 70, [uS(2), uA(8)])])], reward: '鴻ノ森の砦を払った' }),
    holdS({ x: 30, z: 76 }, '城の東の口', '城の東の口で、打って出た本山貞茂の手を受ける', '本山貞茂', '本山の若殿が打って出る', [['組頭', '本山の若殿じゃ！　強いぞ、崩れるな！', 3]],
      [wave(0, '本山貞茂', '父の城を守れ！　土佐の田舎者に負けるな！', [foe('本山貞茂の手', 40, 104, [boss('本山貞茂'), uS(2), uA(12)])]), wave(30, '本山の侍', '鉄砲、前へ！', [foe('本山の鉄砲', 54, 90, [uS(1), uA(6), uG(3)])]),
        wave(54, '本山の侍', '押し包め！', [foe('本山の押しの手', 10, 110, [uS(2), uA(8)])])], { reward: '本山貞茂の打って出を受けきった' }),
    fightS({ x: -20, z: 110 }, '城の西の曲輪の柵を破る', '西の曲輪', '柵の内に本山の兵', [['長宗我部元親', '西の曲輪を取れば、城は持たぬ', 3]],
      [foe('西の曲輪の兵', -24, 124, [uS(2), uA(12)])], { later: [wave(26, '本山の侍', '曲輪を守れ！', [foe('西の曲輪の弓', -6, 130, [uS(2), uA(8), uB(3)])])], reward: '西の曲輪を破った' }),
    // K720 二回目：流れ⑧⑨＝水と兵糧の道を断ち、城兵が退き始める
    holdS({ x: 4, z: 80 }, '水の手の道', '城の水の手と兵糧の道を断ち、退き始める城兵を受ける', '兵糧の道', '荷駄を断てば、城は持たぬ', [['組頭', '兵糧の荷駄が来る。道を断て。城は干上がるぞ', 3]],
      [wave(0, '本山の侍', '荷駄を通せ！　城が持たぬ！', [foe('本山の荷駄の護り', 20, 124, [uS(2), uA(10)])]), wave(30, '本山の侍', '城を捨てて山へ退け！', [foe('退き始める城兵', 4, 124, [uS(2), uA(12)])]), wave(52, '本山の侍', '殿を頼む！　引け！', [foe('本山の殿の兵', -24, 118, [uS(1), uA(8)])])], { reward: '水と兵糧の道を断った' }),
  ],
  win: {
    banner: '朝倉の勝ち', sub: '夜が明けると、本山の旗が無い', award: '朝倉で本山茂辰を破った',
    say: [['組頭', '夜が明けたぞ……。城の櫓に、昨日まであった本山の旗が、一本も無い', 3.4],
      ['長宗我部元親', '力で落としたのではない。何日も耐えて、相手が退いたのじゃ', 3.2],
      ['吉良親貞', '本山は山へ退きました。土佐の中ほどは、兄上の物でございます', 3.2]],
  },
}), { plan: ASAKURA_TOSA_PLAN, at: { x: 4, z: 142 }, lift: 0, team: 1, life: false });
export default c02_asakura;
