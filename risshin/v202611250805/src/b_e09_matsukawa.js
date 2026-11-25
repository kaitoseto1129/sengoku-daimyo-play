// 伊達家編 九戦目「松川の戦い」（慶長五年〔1600〕十月六日）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e09_matsukawa.md
//   出所：『貞山公治家記録』（B）・福島市の解説（C）。関ヶ原の北の戦い。東軍の政宗が北目城から出て、上杉景勝の本庄繁長と松川で戦った。数は諸説（推）
//   仕組み「馬印の勢い」の負ける日：馬印を前へ押し出すほど後ろの備が離れ、孤立しやすい（勢いの上限は五割・風は向かい風のまま）。受けて退く備を残して持ちこたえるのが勝ち筋
//   相手の色は蘆名の具足・紋を使い回す（上杉の紋は未）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const UESUGI = { flag: 'ashina', armor: 0x24323a };
const SPAWN = { x: 140, z: 0 };
const RIVER = [[-40, -220], [-48, -100], [-40, 0], [-52, 110], [-44, 220]];   // 松川
const WIND = [1, 0.1];     // 向かい風（勢いは乗らない）
const FRONT = { x: 75, z: 4 };
const KAWA = { x: -20, z: 0 };
const FAR = { x: -110, z: 0 };
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 0.5 });

export const e09_matsukawa = lightBattle({
  id: 'e09_matsukawa',
  date: '慶長五年（1600）十月　秋　陸奥国 松川',
  intro: '関ヶ原の年。東軍に付いた伊達政宗は北目城を出て、松川の岸で上杉の本庄繁長と向き合った。',
  history: '慶長五年（1600）十月、東軍に付いた伊達政宗は、福島盆地の松川で上杉景勝の将・本庄繁長と戦った。伊達勢は押し返されて退き、政宗にとって勢いだけでは勝てない日となった（『貞山公治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '上杉の軍（本庄繁長）', mon: 'ashina', faction: 'ashina' } },
  force: { a: 5000, b: 6000 },
  allyLook: DATE, foeLook: UESUGI,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.22,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1600, time: 'day', fogFar: 380, autumn: 0.9, sky: { wind: WIND, windStrength: 0.9, overcast: 0.4 },
    river: RIVER, riverW: 14, riverDepth: 0.6,
    hills: [[0, -200, 90, 40], [-120, 160, 60, 14], [170, 140, 60, 12]],
    paths: [{ pts: [[150, 0], [80, 4], [-20, 0], [-110, 0]], w: 3 }],
    groves: [{ x: 70, z: -60, r: 30, n: 28 }, { x: -90, z: 70, r: 30, n: 26 }],
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
      ['片倉景綱', '殿、上杉は本庄繁長。手強うございます。旗を出しすぎませぬよう', 3.4],
      ['伊達政宗', '分かっておる。ここは関ヶ原の北の押さえじゃ', 3.2]] },
    { kind: 'hold', at: FRONT, label: '松川の手前', obj: '松川の手前で、上杉の先手を受け止める', r: 16, dur: 60,
      title: '松川', sub: '向かい風の中、上杉の先手が寄せる',
      say: [['組頭', '風が向かいじゃ！　槍を揃えて、馬印のそばを離れるな', 3.2]],
      waves: [
        { t: 6, say: ['上杉の侍', '伊達を松川から追い落とせ！'], foes: [{ name: '上杉の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '上杉の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '上杉の先手を受け止めた' },
    { kind: 'fight', at: KAWA, limit: 120, obj: '馬印を押し出して、松川の岸の上杉勢を押し返す', title: '松川の岸', sub: '馬印が川の手前へ出る',
      say: [['伊達成実', '殿、出すぎは禁物。後ろが付いてきておりますか', 3.2]],
      foes: [{ name: '上杉の本隊', from: { x: KAWA.x - 8, z: KAWA.z }, list: [busho('本庄繁長', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '上杉の鉄砲', from: { x: KAWA.x - 14, z: KAWA.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '松川の岸の上杉勢を押し返した' },
  ],
  update: umaTick,
  win: {
    banner: '松川を持ちこたえる', sub: '上杉は引いた。政宗は勢いだけでは勝てぬと知った', award: '松川で馬印の勢いを抑えて戦った',
    say: [['片倉景綱', '無理に出ず、よう持ちこたえました', 3.2],
      ['伊達政宗', '旗を出すだけが戦ではない……', 3.2]],
  },
});
e09_matsukawa.camPull = 1.6;
export default e09_matsukawa;
