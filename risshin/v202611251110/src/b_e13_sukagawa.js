// 伊達家編「須賀川城の戦い」（天正十七年十月〔1589〕・陸奥国 須賀川）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e13_sukagawa.md（K647・11/25 Sanae）
//   出所：『伊達治家記録』（B）・須賀川市の解説（C）。摺上原の後、政宗は二階堂氏の須賀川城を攻めて落とした。数は推（伊達約1万2千・城方約4千は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：城下町の狭い通りで戦う。町の角で勢いが途切れ（上限五割・向かい風）、蔵の間に敵が潜む。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x2e2a2a };
const SPAWN = { x: 140, z: 0 };
const WIND = [0.7, 0.4];
const WOUT = [0.7, 0.4];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.5, windStep: 99 });

export const e13_sukagawa = lightBattle({
  id: 'e13_sukagawa',
  date: '天正十七年（1589）十月　秋・曇り　陸奥国 須賀川',
  intro: '摺上原の勝ちの後、政宗は二階堂氏の須賀川へ兵を向けた。城下の町の中の戦いになる。',
  history: '天正十七年（1589）十月、摺上原で蘆名を破った伊達政宗は、二階堂氏の須賀川城を攻めて落とした。町の中の戦いで、政宗は南奥州の覇者となった（『伊達治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '二階堂の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 12000, b: 4000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.26,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1589, time: 'day', fogFar: 340, autumn: 0.9, sky: { wind: WIND, windStrength: 0.9, overcast: 0.5, mist: 0.15 },
    hills: [[-90, 0, 40, 14], [150, 130, 50, 8]],
    groves: [{ x: 80, z: -70, r: 28, n: 24 }, { x: -20, z: 80, r: 26, n: 20 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 260, tufts: 1500,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、須賀川は町の中。蔵と門の間に敵が潜みまする', 3.4],
      ['伊達政宗', '町を焼くな。通りを一つずつ取れ', 3.2]] },
    { kind: 'hold', at: FRONT, label: '須賀川の町の入口', obj: '須賀川の町の入口で、二階堂の先手を受け止める', r: 16, dur: 60,
      title: '須賀川の町', sub: '町の通りから、二階堂勢が打って出る',
      say: [['組頭', '通りの角に気を付けよ！　槍を揃えて進め！', 3.2]],
      waves: [
        { t: 6, say: ['二階堂の侍', '町から伊達を追い出せ！'], foes: [{ name: '二階堂の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '二階堂の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '町の入口を持ちこたえた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を町の奥へ押し出して、須賀川城の二階堂勢を崩す', title: '須賀川の城', sub: '町の奥の城の門が見える',
      say: [['伊達成実', '殿、町の角で後ろが離れませぬよう', 3.2]],
      foes: [{ name: '須賀川の城兵', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('二階堂行親', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '須賀川の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '須賀川城の二階堂勢を崩した' },
  ],
  update: umaTick,
  win: {
    banner: '須賀川城、落ちる', sub: '伊達は町の中の戦を制した。南奥州は政宗のものになった', award: '須賀川の町の中で馬印を押し出して戦った',
    say: [['片倉景綱', '須賀川、落ちました。町も無事にございます', 3.2],
      ['伊達政宗', 'これで奥羽に、伊達に並ぶ者は無い', 3.2]],
  },
});
e13_sukagawa.camPull = 1.6;
export default e13_sukagawa;
