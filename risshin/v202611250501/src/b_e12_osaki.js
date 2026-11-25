// 伊達家編「大崎合戦」（天正十六年〔1588〕・陸奥国 大崎領 新沼）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e12_osaki.md（K647・11/25 Sanae）
//   出所：『伊達治家記録』（B）・大崎市の解説（C）。政宗は大崎義隆を攻めたが、雪と湿地に阻まれ、新沼城の戦いで敗れて退いた。数は推（伊達約8千・大崎約1万は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：雪と湿地で勢いが乗らない（上限三割・向かい風）。馬印を出しすぎず、退く備を残して持ちこたえるのが勝ち筋。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x34302c };
const SPAWN = { x: 140, z: 0 };
const WIND = [1, 0.2];
const WOUT = [1, 0.2];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.3, windStep: 99 });

export const e12_osaki = lightBattle({
  id: 'e12_osaki',
  date: '天正十六年（1588）二月　冬・雪　陸奥国 大崎領',
  intro: '雪の大崎。大崎義隆を攻める政宗の軍は、狭い街道と湿地に足を取られた。',
  history: '天正十六年（1588）、伊達政宗は大崎義隆を攻めたが、雪と湿地に阻まれ、新沼城などで苦戦して退いた。最上義光の動きもあり、政宗は雪国で軍が動かない難しさを知った（『伊達治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '大崎義隆の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 8000, b: 10000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.22,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1588, time: 'day', fogFar: 300, autumn: 0, sky: { wind: WIND, windStrength: 0.9, overcast: 0.7, mist: 0.4 },
    hills: [[0, -190, 90, 12], [-110, 150, 60, 8]],
    river: [[-30, -220], [-40, -100], [-30, 0], [-45, 110], [-35, 220]], riverW: 12, riverDepth: 0.5,
    groves: [{ x: 70, z: 60, r: 30, n: 22 }, { x: 80, z: -60, r: 28, n: 20 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 220, tufts: 1200,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['伊達成実', '殿、雪が深うございます。大崎の沼は凍っておらず、足を取られまする', 3.4],
      ['伊達政宗', '分かっておる。無理に出ず、道の上で受けよ', 3.2]] },
    { kind: 'hold', at: FRONT, label: '雪の街道', obj: '雪の街道で、大崎の先手を受け止める', r: 16, dur: 60,
      title: '雪の街道', sub: '雪を踏んで、大崎の先手が寄せる',
      say: [['組頭', '足元に気を付けよ！　道を外れるな！', 3.2]],
      waves: [
        { t: 6, say: ['大崎の侍', '伊達を沼へ追い込め！'], foes: [{ name: '大崎の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '大崎の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '雪の街道を持ちこたえた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を抑えて、新沼の岸の大崎勢を押し返し、道を守る', title: '新沼の岸', sub: '湿地の向こうに、大崎の本隊が陣取る',
      say: [['伊達成実', '殿、出すぎは禁物。後ろの備が付いておりますか', 3.2]],
      foes: [{ name: '大崎の本隊', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('大崎義隆', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '大崎の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '新沼の岸で大崎勢を押し返した' },
  ],
  update: umaTick,
  win: {
    banner: '雪の大崎を持ちこたえる', sub: '伊達は退いた。雪国の戦の難しさを、政宗は知った', award: '雪と湿地で馬印の勢いを抑えて戦った',
    say: [['伊達成実', '無理に出ず、よう引き揚げました', 3.2],
      ['伊達政宗', '雪には勝てぬか……。次は春を待とう', 3.2]],
  },
});
e12_osaki.camPull = 1.6;
export default e12_osaki;
