// 伊達家編 三戦目「小浜城・宮森城の戦い」（天正十三年〔1585〕十月〜十一月）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e02_kobama.md
//   史実：十月、二本松義継が輝宗を拉致して連れ去り、粟之巣で輝宗は討たれた（政宗の父を失う）。政宗は怒って二本松を攻め、小浜城・宮森城のあたりで戦った。
//   出所：『伊達日記』（B）・『性山公治家記録』（B）。伊達約6千・二本松約3千は推。残酷な場面は描かない。字は使わず、荒れた色調（曇り・霧）で見せる
//   仕組み「馬印の勢い」は date_uma.js（e05 と共通）。怒りの戦なので勢いの上限は初めから満ち、風は変わらない。相手の色は蘆名の具足・紋を使い回す（二本松の紋は未）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const NIHON = { flag: 'ashina', armor: 0x4a3a2c };
const SPAWN = { x: 150, z: 20 };
const WIND = [0.9, -0.3];
const HAYASHI = { x: 50, z: 10 };     // 安達太良の麓の林
const KOBAMA = { x: -50, z: 0 };      // 小浜城の城下
const MIYA = { x: -120, z: -10 };     // 宮森城
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e02_kobama = lightBattle({
  id: 'e02_kobama',
  date: '天正十三年（1585）十月　秋・曇り　陸奥国 二本松領',
  intro: '父・輝宗を失った政宗は、怒りを抑えて二本松領へ兵を進めた。安達太良の麓の林の向こうに、小浜城と宮森城が見える。',
  history: '天正十三年（1585）十月、二本松義継は輝宗を拉致して連れ去り、粟之巣で輝宗は命を落とした。政宗は二本松を攻め、小浜城・宮森城のあたりで戦った。政宗が家を継いで間もない頃の、激しい戦である。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '二本松の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 6000, b: 3000 },
  allyLook: DATE, foeLook: NIHON,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1585, time: 'day', fogFar: 330, autumn: 0.8,
    sky: { wind: WIND, windStrength: 1.0, overcast: 0.85, mist: 0.35 },   // 荒れた色調（曇りと霧）
    hills: [[0, -200, 100, 60], [-10, 40, 60, 9], [-120, -30, 40, 14], [160, 140, 60, 14]],   // 北に安達太良の裾・宮森の小山
    paths: [{ pts: [[150, 20], [50, 10], [-50, 0], [-120, -10]], w: 3 }],
    groves: [{ x: HAYASHI.x, z: HAYASHI.z + 40, r: 40, n: 44 }, { x: HAYASHI.x, z: HAYASHI.z - 40, r: 34, n: 34 }],
    trees: 380, tufts: 2000,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 12 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、お気持ちは分かります。されど怒りに任せてはなりませぬ', 3.4],
      ['伊達政宗', '分かっておる。馬印を前へ。父上の無念、必ず晴らす', 3.4]] },
    { kind: 'hold', at: HAYASHI, label: '麓の林', obj: '麓の林で、二本松の伏せ勢を受け止める', r: 16, dur: 60,
      title: '小浜城', sub: '曇りの林の中、二本松の兵が打って出る',
      say: [['組頭', '林の中じゃ！　固まって槍を揃えよ！', 3]],
      waves: [
        { t: 6, say: ['二本松の侍', '政宗を討て！　一歩も通すな！'], foes: [{ name: '二本松の先手', from: { x: HAYASHI.x - 38, z: HAYASHI.z }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　ここで退くな！'], foes: [{ name: '二本松の二の手', from: { x: HAYASHI.x - 34, z: HAYASHI.z + 16 }, list: [uS(2), uA(10)] }] }],
      reward: '二本松の先手を受け止めた' },
    { kind: 'fight', at: KOBAMA, limit: 130, obj: '馬印を押し出して、小浜城の城下の兵を崩す', title: '押し出し', sub: '政宗の馬印が林を抜ける',
      say: [['伊達政宗', '今じゃ、馬印を前へ！', 3.2], ['伊達成実', '殿の旗が出たぞ！　遅れるな！', 3]],
      foes: [{ name: '小浜城の兵', from: { x: KOBAMA.x - 6, z: KOBAMA.z }, list: [uS(4), uA(18)] },
        { name: '二本松の鉄砲', from: { x: KOBAMA.x - 14, z: KOBAMA.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '小浜城の城下を崩した' },
    { kind: 'fight', at: MIYA, limit: 120, obj: '宮森城へ、二本松の旗本を追い落とす', title: '宮森城', sub: '崩れた二本松勢が宮森へ退く',
      say: [['片倉景綱', '宮森まで追え。ここで二本松が決まる', 3.2]],
      foes: [{ name: '二本松の旗本', from: { x: MIYA.x - 4, z: MIYA.z }, list: [busho('畠山義綱', { mustLive: false, invuln: false }), uS(4), uA(14)] }],
      reward: '宮森城へ二本松の旗本を追い落とした' },
  ],
  update: umaTick,
  win: {
    banner: '二本松を攻め取る', sub: '小浜城・宮森城のあたりを押さえた。政宗は父の無念を胸に', award: '小浜・宮森で馬印を押し出した',
    say: [['伊達成実', '二本松勢、宮森から落ちていきます！', 3.2],
      ['伊達政宗', '……父上。まだ戦は終わらぬ', 3.4]],
  },
});
e02_kobama.camPull = 1.6;
export default e02_kobama;
