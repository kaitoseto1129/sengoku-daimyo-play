// 伊達家編「白石城の戦い」（慶長五年七月〔1600〕・陸奥国 白石城）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e14_shiroishi.md（K647・11/25 Sanae）
//   出所：『貞山公治家記録』（B）・白石市の解説（C）。関ヶ原の裏で、政宗は上杉方の白石城を攻め、片倉景綱の手で落とした。数は推（伊達の一部と城方約2千は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：山城の登りで勢いが乗る（上限七割・追い風）。城の門で馬印が詰まり、石垣の上の鉄砲が痛い。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x24323a };
const SPAWN = { x: 140, z: 0 };
const WIND = [-0.8, 0.3];
const WOUT = [-0.8, 0.3];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const SOTO = { x: 104, z: -6 };         // 外曲輪の柵（K652②）
const MACHI = { x: 88, z: 20 };         // 白石の城下の町屋（K652⑥）
const SAN = { x: 16, z: 10 };           // 三の丸（K652②）
const NI = { x: -24, z: -14 };          // 二の丸の門（K652②）
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.7, windStep: 99 });

export const e14_shiroishi = lightBattle({
  id: 'e14_shiroishi',
  date: '慶長五年（1600）七月　夏・晴れ　陸奥国 白石城',
  intro: '関ヶ原の年の夏。東軍に付いた政宗は、上杉方の白石城を攻めに向かう。',
  history: '慶長五年（1600）七月、東軍に付いた伊達政宗は、上杉方の白石城を攻めて落とした。城は後に片倉景綱に与えられた。関ヶ原の裏で、東北でも戦が動いていた（『貞山公治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '上杉方の白石城兵', mon: 'ashina', faction: 'ashina' } },
  force: { a: 6000, b: 2000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.28,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1600, time: 'day', fogFar: 360, autumn: 0, sky: { wind: WIND, windStrength: 0.9, overcast: 0.15, mist: 0.1 },
    hills: [[-85, 0, 50, 22], [-10, -120, 50, 10], [140, 120, 50, 8]],
    groves: [{ x: 70, z: -60, r: 30, n: 28 }, { x: 40, z: 70, r: 28, n: 22 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 320, tufts: 1900,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、白石は山城。大手の門を破れば、城は落ちまする', 3.4],
      ['伊達政宗', '景綱、ここはそちに任せる。城は取りきれ', 3.2]] },
    // K652②（11/25 Sanae・10分）：慶長五年七月、伊達勢は白石城の外曲輪から攻め、三の丸・二の丸と破って、城は降った（『伊達日記』B・『貞山公治家記録』B）
    { kind: 'fight', at: SOTO, limit: 120, obj: '白石城の外曲輪の柵を破る', title: '外曲輪', sub: '城の外の柵と土塁から、上杉方が狙う',
      say: [['片倉景綱', 'まず外曲輪じゃ。柵を倒せば大手が近うなる', 3.2]],
      foes: [{ name: '外曲輪の城方', from: { x: SOTO.x - 14, z: SOTO.z - 6 }, list: [uS(3), uA(14)] }, { name: '外曲輪の鉄砲', from: { x: SOTO.x - 22, z: SOTO.z + 12 }, list: [uS(1), uG(5)] }],
      reward: '白石城の外曲輪の柵を破った' },
    // K652⑥（11/25 クラウドわ）逸話の段：伊達勢はまず白石の城下に火を掛け、城方を城の内へ追い込んでから攻めたと伝わる（『貞山公治家記録』B・日と順は要確認）。本人が町屋を守る城方を斬り払い、火を掛ける
    { kind: 'fight', at: MACHI, limit: 110, obj: '城下の町屋を守る城方を斬り払い、町に火を掛ける', title: '城下の火', sub: '白石の城下に、城方が立て籠もる',
      say: [['片倉景綱', '城下に火を掛けよ。城方を城の内へ追い込むのじゃ', 3.4], ['組頭', '町屋の陰に城方が潜んでおる！　斬り払え！', 3.2]],
      foes: [{ name: '町屋を守る城方', from: { x: MACHI.x - 12, z: MACHI.z + 6 }, list: [uS(3), uA(13)] }, { name: '町屋の陰の鉄砲', from: { x: MACHI.x - 18, z: MACHI.z - 10 }, list: [uS(1), uG(4)] }],
      reward: '城下の城方を斬り払い、町に火を掛けた' },
    { kind: 'hold', at: FRONT, label: '白石城の大手', obj: '白石城の大手で、城から打って出る上杉方を受け止める', r: 16, dur: 60,
      title: '白石城の大手', sub: '石垣の上から鉄砲が鳴る',
      say: [['組頭', '石垣の下は危うい！　門の前で揃えよ！', 3.2]],
      waves: [
        { t: 6, say: ['城方の侍', '伊達を門から追い返せ！'], foes: [{ name: '城方の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '城方の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '白石城の大手を持ちこたえた' },
    { kind: 'fight', at: SAN, limit: 120, obj: '大手を抜けて、三の丸の城方を崩す', title: '三の丸', sub: '三の丸の屋敷の間で斬り合う',
      say: [['伊達成実', '大手は抜けた！　三の丸の屋敷に潜む者に気を付けよ', 3.2]],
      foes: [{ name: '三の丸の城方', from: { x: SAN.x - 12, z: SAN.z + 6 }, list: [uS(3), uA(15)] }, { name: '三の丸の弓', from: { x: SAN.x - 18, z: SAN.z - 12 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '三の丸の城方を崩した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: NI, label: '二の丸の門', obj: '二の丸の門の前で、城方の決死の打って出を受け止める', r: 16, dur: 60, limit: 110,
      title: '二の丸', sub: '城方が二の丸の門を開いて打って出る',
      say: [['片倉景綱', '門が開いた！　出て来るぞ、構えよ！', 3.2]],
      waves: [{ t: 6, say: ['城方の侍', '上杉の意地を見せよ！'], foes: [{ name: '二の丸の決死の手', from: { x: NI.x - 34, z: NI.z }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', 'まだ来る！　門を閉めさせるな！'], foes: [{ name: '二の丸の二の手', from: { x: NI.x - 30, z: NI.z + 16 }, list: [uS(2), uA(12), uG(3)] }] }],
      reward: '二の丸の門の前で城方の打って出を受け止めた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を押し出して、白石城の本丸の城兵を崩す', title: '白石城の本丸', sub: '門を破り、本丸の石段へ',
      say: [['伊達成実', '殿、門は破れました。馬印を石段の上へ', 3.2]],
      foes: [{ name: '白石城の城兵', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('甘粕景継', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '白石城の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '白石城の本丸の城兵を崩した' },
  ],
  update: umaTick,
  win: {
    banner: '白石城、落ちる', sub: '上杉方の城は伊達の手に。片倉の名が立った', award: '白石城で馬印を押し出して戦った',
    say: [['片倉景綱', '白石、落ちました。この城は守りに良い城にございます', 3.2],
      ['伊達政宗', '関ヶ原の北は、伊達が押さえた', 3.2]],
  },
});
e14_shiroishi.camPull = 1.6;
export default e14_shiroishi;
