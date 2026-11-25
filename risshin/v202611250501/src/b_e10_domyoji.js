// 伊達家編 十戦目「道明寺の戦い（大坂夏の陣）」（慶長二十年〔1615〕五月六日）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e10_domyoji.md
//   既存の道明寺（b_domyoji.js・docs/fujin/domyoji.md）を伊達の側から写した物：石川（ISHI）・小松山（KOMA）・誉田の位置は b_domyoji.js と同じ。濃い霧の朝
//   片倉重綱の鉄砲騎馬隊が、小松山を下った後藤又兵衛の隊と当たる。伊達約1万・後藤約2,800（通説・本の通り）。出所：『貞山公治家記録』（B）・『大坂御陣覚書』（B）
//   仕組み「馬印の勢い」は date_uma.js（共通）。年を取った政宗の最後の戦＝若さの続き（遅れて来た男）：旗は前へ出すが、馬上の鉄砲の足で押す
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const GOTO = { flag: 'toyotomi', armor: 0x2a2624, lace: 0x5a2a1c };
const SPAWN = { x: 140, z: 14 };
const ISHI = [[-46, -180], [-52, -100], [-50, -30], [-56, 30], [-52, 100], [-58, 180]];   // 石川（b_domyoji.js と同じ）
const KOMA = { x: 4, z: -18 };           // 小松山の頂（同じ）
const FOOT = { x: 44, z: -8 };           // 小松山の東の麓
const HONDA = { x: -110, z: 80 };        // 誉田（同じ）
const WIND = [0.3, 0.1];
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e10_domyoji = lightBattle({
  id: 'e10_domyoji',
  date: '慶長二十年（1615）五月六日　霧の朝　河内国 道明寺',
  intro: '大坂夏の陣。霧の中、大和口から出た伊達勢の先頭に、片倉重綱の鉄砲騎馬隊が立つ。小松山には後藤又兵衛が待つ。',
  history: '慶長二十年（元和元年）五月六日、河内の道明寺で、後藤又兵衛の隊は濃い霧の朝に小松山へ登った。大和口から進んだ徳川方の先手のうち、伊達政宗の隊では片倉重綱の鉄砲騎馬隊が後藤隊を破った。又兵衛はここで討死した（『貞山公治家記録』・『大坂御陣覚書』）。数は通説で、伊達約一万・後藤約二千八百。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '後藤又兵衛の隊', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 10000, b: 2800 },
  allyLook: DATE, foeLook: GOTO,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1615, time: 'day', fogFar: 240, sky: { wind: WIND, windStrength: 0.6, mist: 0.6 },
    river: ISHI, riverW: 6, riverDepth: 1.0,
    hills: [[KOMA.x, KOMA.z, 46, 15], [KOMA.x + 26, KOMA.z - 26, 44, 8], [150, -110, 55, 12], [HONDA.x - 20, HONDA.z, 50, 3]],   // 小松山・東の山並み・誉田の台
    paths: [{ pts: [[178, 30], [110, 20], [60, 10], [30, 26], [-20, 20], [-60, 14], [-110, 30]], w: 3 }],
    groves: [{ x: KOMA.x - 6, z: KOMA.z + 14, r: 10, n: 16 }, { x: KOMA.x + 16, z: KOMA.z - 12, r: 9, n: 14 }, { x: HONDA.x + 10, z: HONDA.z + 20, r: 16, n: 26 }],
    trees: 300, tufts: 2000,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(10)] },
    { name: '片倉重綱の鉄砲騎馬隊', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉重綱'), { type: 'cavalry', n: 6 }, uG(10)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 24 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉重綱', '殿、霧が濃うございます。後藤は小松山に上ったとの知らせ', 3.4],
      ['伊達政宗', '遅れて来た身じゃ。ここで働かねば、いつ働く', 3.4]] },
    { kind: 'move', at: FOOT, label: '小松山の麓', obj: '霧の中を、小松山の東の麓まで進む', r: 14,
      say: [['片倉重綱', '足元に気を付けよ。石川の向こうは見えませぬ', 3.2]] },
    { kind: 'hold', at: FOOT, label: '小松山の麓', obj: '小松山を下る後藤の先手を受け止める', r: 16, dur: 60,
      title: '道明寺', sub: '霧の中、後藤又兵衛の隊が駆け下りる',
      say: [['組頭', '山から来るぞ！　槍を揃えよ！', 3]],
      waves: [
        { t: 6, say: ['後藤の侍', '又兵衛殿に続け！　伊達を押し返せ！'], foes: [{ name: '後藤の先手', from: { x: KOMA.x + 24, z: KOMA.z + 4 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　霧の中でも退くな！'], foes: [{ name: '山田外記の組', from: { x: KOMA.x + 20, z: KOMA.z - 14 }, list: [uS(2), uA(12), uG(2)] }] }],
      reward: '後藤の先手を受け止めた' },
    { kind: 'fight', at: KOMA, limit: 130, obj: '片倉の鉄砲騎馬隊と共に、小松山の後藤又兵衛を崩す', title: '鉄砲騎馬隊', sub: '馬上の鉄砲が霧を割る',
      say: [['片倉重綱', '鉄砲騎馬隊、前へ！　馬上から撃て！', 3.2], ['伊達政宗', '旗を進めよ！　後藤を破る', 3]],
      foes: [{ name: '後藤又兵衛の旗本', from: { x: KOMA.x - 4, z: KOMA.z }, list: [busho('後藤又兵衛', { mustLive: false, invuln: false }), uS(4), uA(16)] },
        { name: '後藤の鉄砲', from: { x: KOMA.x - 6, z: KOMA.z + 14 }, list: [uS(1), uG(5)] }],
      reward: '小松山の後藤隊を崩した' },
  ],
  update: umaTick,
  win: {
    banner: '道明寺、後藤隊を破る', sub: '片倉の鉄砲騎馬隊が霧の小松山を抜いた。遅れて来た男の最後の戦', award: '道明寺で後藤又兵衛の隊を破った',
    say: [['片倉重綱', '又兵衛殿、討死とのこと', 3.2],
      ['伊達政宗', '若い頃の勢いは、まだ消えておらぬな', 3.4]],
  },
});
e10_domyoji.camPull = 1.6;
export default e10_domyoji;
