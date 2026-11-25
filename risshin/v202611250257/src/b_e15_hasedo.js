// 伊達家編「長谷堂城救援（出羽合戦）」（慶長五年九月〔1600〕・出羽国 山形盆地 長谷堂）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e15_hasedo.md（K647・11/25 Sanae）
//   出所：『貞山公治家記録』（B）・山形市の解説（C）。上杉景勝・直江兼続に攻められた最上義光を、政宗が留守政景の援軍で助けた。関ヶ原の結果が届くと、上杉は退いた。数は推（援軍約3千・上杉約2万。clans_75_1121.md の表は1万対2万・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：はじめは向かい風で勢いが乗らない（上限三割）。関ヶ原の知らせが届いて風が追い風に回ると、勢いが乗って上杉を追う。字・札・釦は足さない
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x24323a };
const SPAWN = { x: 140, z: 0 };
const WIND = [1, 0.1];
const WOUT = [-1, 0.1];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.3, windStep: 1 });

export const e15_hasedo = lightBattle({
  id: 'e15_hasedo',
  date: '慶長五年（1600）九月　秋・晴れ　出羽国 山形盆地 長谷堂',
  intro: '関ヶ原の年の秋。上杉に攻められた最上義光を助けるため、政宗は援軍を山形盆地へ送った。',
  history: '慶長五年（1600）九月、上杉景勝の将・直江兼続は最上義光の長谷堂城を攻めた。伊達政宗は留守政景らを援軍に送ったが、関ヶ原で西軍が敗れた知らせが届くと、上杉は退き、最上と伊達の軍が追った（『貞山公治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '上杉の軍（直江兼続）', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 20000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.22,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1601, time: 'day', fogFar: 420, autumn: 0.9, sky: { wind: WIND, windStrength: 0.9, overcast: 0.3, mist: 0.2 },
    hills: [[0, -200, 90, 12], [-110, 150, 60, 14], [170, 140, 60, 10]],
    river: [[-40, -230], [-48, -100], [-40, 0], [-52, 110], [-44, 230]], riverW: 12, riverDepth: 0.5,
    groves: [{ x: 70, z: -60, r: 30, n: 24 }, { x: -90, z: 70, r: 30, n: 22 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 300, tufts: 2400,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '留守政景の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('留守政景'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['留守政景', '殿の名代で、山形の最上殿を助けに参りました。上杉は二万、手強うございます', 3.4],
      ['伊達政宗', '政景、無理はするな。最上の城が持てばよい', 3.2]] },
    { kind: 'hold', at: FRONT, label: '長谷堂の手前', obj: '長谷堂の手前で、上杉の先手を受け止める', r: 16, dur: 60,
      title: '長谷堂の手前', sub: '向かい風の中、上杉の先手が寄せる',
      say: [['組頭', '風が向かいじゃ！　田の畦を外すな！', 3.2]],
      waves: [
        { t: 6, say: ['上杉の侍', '最上も伊達も、まとめて討て！'], foes: [{ name: '上杉の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '上杉の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '長谷堂の手前を持ちこたえた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '風が変わった。馬印を押し出して、上杉勢を最上川の岸へ追う', title: '上杉の退き', sub: '関ヶ原の知らせで、上杉が退き始める',
      say: [['伊達成実', '殿、風が変わりました。上杉が退いております', 3.2]],
      foes: [{ name: '直江兼続の本隊', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('直江兼続', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '上杉の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '退く上杉勢を追い落とした' },
  ],
  update: umaTick,
  win: {
    banner: '長谷堂を持ちこたえる', sub: '知らせが戦場を変えた。上杉は山形から退いた', award: '長谷堂で最上を救った',
    say: [['留守政景', '上杉は引きました。最上殿も無事にございます', 3.2],
      ['伊達政宗', '天下の風が変わったのじゃ……', 3.2]],
  },
});
e15_hasedo.camPull = 1.6;
export default e15_hasedo;
