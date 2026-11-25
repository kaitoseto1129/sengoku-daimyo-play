// 伊達家編「小手森城の戦い」（天正十三年閏八月〔1585〕・陸奥国 安達郡 小手森城）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e11_kogamori.md（K647・11/25 Sanae）
//   出所：『伊達日記』（B）・二本松市の解説（C）。大内定綱の小手森城を政宗が攻め、城兵を討ち果たした（伊達の怖さを広めた戦）。数は推（伊達約8千・城方約2千は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：山城を攻めるので勢いは高めに乗る（上限八割・追い風）。馬印が城の坂を登るほど旗が荒れる。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x2c2a26 };
const SPAWN = { x: 140, z: 0 };
const WIND = [-1, 0.15];
const WOUT = [-1, 0.15];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.8, windStep: 99 });

export const e11_kogamori = lightBattle({
  id: 'e11_kogamori',
  date: '天正十三年（1585）閏八月　秋・晴れ　陸奥国 小手森城',
  intro: '父を失う前の秋、政宗は大内定綱を討つため、山城の小手森城へ兵を向けた。',
  history: '天正十三年（1585）閏八月、伊達政宗は大内定綱の小手森城を攻め、城兵を討ち果たした。この苛烈さが東北に伊達の名を知らしめ、周りの大名を震え上がらせた（『伊達日記』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '大内定綱の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 8000, b: 2000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1585, time: 'day', fogFar: 380, autumn: 0.8, sky: { wind: WIND, windStrength: 0.9, overcast: 0.2, mist: 0.1 },
    hills: [[-80, 0, 60, 26], [-20, -110, 50, 14], [150, 120, 50, 9]],
    groves: [{ x: 60, z: -60, r: 30, n: 28 }, { x: 40, z: 70, r: 30, n: 26 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 340, tufts: 2000,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、小手森は山城。麓の木戸を落とせば、坂は一気に登れまする', 3.4],
      ['伊達政宗', 'よい。大内に、伊達の旗を見せてやれ', 3.2]] },
    { kind: 'hold', at: FRONT, label: '小手森の麓', obj: '小手森の麓で、城から打って出る大内勢を受け止める', r: 16, dur: 60,
      title: '小手森の麓', sub: '山城の木戸から、大内勢が打って出る',
      say: [['組頭', '坂の下じゃ！　槍を揃えて受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['大内の侍', '伊達を坂から追い落とせ！'], foes: [{ name: '大内の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '大内の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '小手森の麓を持ちこたえた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を押し出して、小手森城の本丸の大内勢を崩す', title: '小手森の城', sub: '馬印が坂を登る',
      say: [['伊達成実', '殿、追い風にござる。馬印を坂の上へ', 3.2]],
      foes: [{ name: '小手森の城兵', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('大内定綱', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '小手森の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '小手森城の大内勢を崩した' },
  ],
  update: umaTick,
  win: {
    banner: '小手森城、落ちる', sub: '伊達の旗が山城に立った。この戦の噂は、東北に広まる', award: '小手森城で馬印を押し出して戦った',
    say: [['片倉景綱', '城は落ちました。伊達の名が響きましょう', 3.2],
      ['伊達政宗', '怖れられるのも、天下を取る道じゃ……', 3.2]],
  },
});
e11_kogamori.camPull = 1.6;
export default e11_kogamori;
