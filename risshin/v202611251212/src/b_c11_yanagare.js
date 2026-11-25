// 長宗我部家編 三「八流の戦い」（永禄十二年〔1569〕七月・土佐国 安芸 八流）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：元親は東の安芸国虎を攻め、浜の道の八流で安芸勢を破った。国虎は安芸城に籠もったが、やがて城を開いて自害した
//   （『土佐物語』B・安芸市の解説 C。長宗我部約七千・安芸約五千の説・推）。
// 仕組み：一領具足の呼び集め（浜の松原の外の田に伏せた影を、法螺で呼ぶ）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const AKI = { flag: 'janome', armor: 0x30302c };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: -26, z: -56 };    // 法螺の台
const BEACH = { x: 6, z: 28 };      // 八流の浜道
const PINE = { x: 14, z: 52 };      // 松原の口
const AKIJO = { x: 0, z: 104 };     // 安芸の本陣（城の前）

export const c11_yanagare = chosoBattle({
  id: 'c11_yanagare',
  date: '永禄十二年（1569）七月　朝　土佐国 安芸 八流',
  intro: '元親様が東の安芸国虎を攻める。浜の道の先、八流の松原に安芸の兵。田の畦の一領具足が法螺を待つ。',
  history: '永禄十二年（1569）七月、長宗我部元親は東の安芸国虎を攻め、浜の道の八流で安芸勢を破った。国虎は安芸城に籠もったが、城を開いて自害し、土佐の東は長宗我部の物となった（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '安芸の軍', mon: 'janome', faction: 'miyoshi' } },
  force: { a: 7000, b: 5000 },
  thick: true, playerTaken: 0.38,   // K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: AKI,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1569, time: 'morning', fogFar: 440,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 40, 80, 22], [-150, 140, 70, 24], [AKIJO.x - 30, AKIJO.z + 40, 40, 14], [-160, -140, 80, 20]],
    paths: [{ pts: [[0, -140], [0, -40], [6, 28], [14, 52], [0, 104], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && x > -120 && x < 60 && Math.abs(x) > 6 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: PINE.x + 40, z: PINE.z, r: 26, n: 30 }, { x: 60, z: 90, r: 26, n: 26 }, { x: -170, z: 40, r: 30, n: 26 }],
    trees: 380, tufts: 1700,
  },
  fields: [{ at: { x: -60, z: -40 }, far: 0 }, { at: { x: 34, z: -50 }, far: 1 }, { at: { x: -70, z: -96 }, far: 2 }, { at: { x: 40, z: -100 }, far: 3 }],
  callSay: ['香宗我部親泰', '集まった！　兄上、浜の道を押しましょう', '……遅い。集まった者だけで行く'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '香宗我部親泰の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('香宗我部親泰'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(2)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '安芸を討てば、土佐の東は一つになる', 3.2],
      ['組頭', '法螺の台へ走れ。畦の者を起こすのじゃ', 3],
      ['香宗我部親泰', '浜の松原に、安芸の兵が待っておりまする', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: BEACH, obj: '八流の浜道で、安芸の先手を破る', title: '八流', sub: '浜道に安芸の先手',
      say: [['長宗我部元親', '浜を押せ！', 2.6], ['安芸の侍', '岡豊の田舎者を、海へ追い落とせ！', 3]],
      foes: [{ name: '安芸の先手', from: { x: BEACH.x + 6, z: BEACH.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['安芸の侍', '松原から射よ！'], foes: [{ name: '安芸の弓', from: { x: BEACH.x + 24, z: BEACH.z + 16 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '八流の浜道を破った' },
    { kind: 'hold', at: PINE, label: '松原の口', obj: '松原の口を守り、安芸の寄せを受ける', r: 16, dur: 60, title: '松原の口', sub: '安芸の寄せ',
      say: [['香宗我部親泰', '松原の口を取った！　ここを守れ！', 3]],
      waves: [{ t: 0, say: ['安芸の侍', '取り返せ！'], foes: [{ name: '安芸の二の手', from: { x: PINE.x + 10, z: PINE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['安芸の侍', '松原から回れ！'], foes: [{ name: '安芸の三の手', from: { x: PINE.x + 30, z: PINE.z + 20 }, list: [uS(2), uA(10)] }] }],
      reward: '松原の口を守った' },
    { kind: 'fight', at: AKIJO, obj: '安芸国虎の旗本を崩す', title: '安芸国虎', sub: '安芸城の前で踏みとどまる', max: 140,
      say: [['長宗我部元親', '国虎の旗じゃ！　押せ！', 3]],
      foes: [{ name: '安芸国虎の旗本', from: { x: AKIJO.x, z: AKIJO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '安芸国虎', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['安芸の侍', '殿を城へ！　ここで止めよ！'], foes: [{ name: '安芸の殿の兵', from: { x: AKIJO.x - 14, z: AKIJO.z + 18 }, list: [uS(2), uA(8)] }] }],
      reward: '安芸国虎の旗本を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '国虎は安芸の城へ籠った。囲むぞ', 3]]),
    fightS({ x: 30, z: 120 }, '安芸城の堀端で、城の弓を払う', '安芸城', '堀端に安芸の弓', [['長宗我部元親', '堀端を払え。城を囲む', 3]],
      [foe('堀端の安芸の弓', 40, 134, [uS(1), uB(8)]), foe('堀端の安芸の槍', 20, 138, [uS(2), uA(8)])], { later: [wave(28, '安芸の侍', '堀を越えさせるな！', [foe('安芸の堀の守り', 54, 118, [uS(2), uA(8)])])], reward: '堀端を払った' }),
    holdS({ x: -24, z: 96 }, '城の西の口', '西の口を守り、水を求めて出る城兵を受ける', '水の手', '井戸に毒が入り、城兵が水を求めて出る', [['組頭', '城の井戸に毒が入ったそうじゃ。水を取りに出てくるぞ', 3.2]],
      [wave(0, '安芸の侍', '川の水を取れ！', [foe('水を求める城兵', -30, 124, [uS(2), uA(12)])]), wave(30, '安芸の侍', '押し通れ！', [foe('水を求める城兵の二', -50, 110, [uS(2), uA(10)])]),
        wave(52, '安芸の侍', '弓、射かけよ！', [foe('安芸の弓の二', -10, 128, [uS(1), uA(8), uB(3)])])], { reward: '城兵を水から遠ざけた' }),
    fightS({ x: 0, z: 130 }, '安芸城の大手の門を破る', '大手', '安芸の城兵が門を守る', [['長宗我部元親', '城兵は渇いておる。今じゃ', 3]],
      [foe('大手の城兵', 0, 144, [uS(3), uA(12)])], { later: [wave(26, '安芸の侍', '門を守れ！', [foe('大手の鉄砲', -16, 150, [uS(2), uA(8), uG(2)])])], reward: '安芸城の大手を破った' }),
    fightS({ x: 24, z: 136 }, '城の奥で、最後まで戦う安芸の旗本を討つ', '安芸の旗本', '国虎に殉じる家臣', [['組頭', '国虎は腹を切るそうじゃ……。供の者が最後まで戦う', 3.2]],
      [foe('安芸の旗本の残り', 24, 150, [boss('黒岩越前', false), uS(3), uA(10)])], { later: [wave(30, '安芸の侍', '殿の御最期を汚させるな！', [foe('安芸の最後の兵', 8, 154, [uS(2), uA(8)])])], reward: '安芸城を落とした' }),
  ],
  win: {
    banner: '八流の勝ち', sub: '安芸城が落ちる', award: '八流で安芸国虎を破った',
    say: [['組頭', '安芸の城が落ちた。国虎殿は浄貞寺で腹を召された', 3.2],
      ['長宗我部元親', '土佐の東も、これで一つじゃ', 3],
      ['香宗我部親泰', '次は西の一条でござるな', 3]],
  },
});
export default c11_yanagare;
