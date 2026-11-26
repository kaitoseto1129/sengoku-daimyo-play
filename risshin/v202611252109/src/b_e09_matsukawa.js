// 伊達家編 九戦目「松川の戦い」（慶長五年〔1600〕十月六日）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e09_matsukawa.md
//   出所：『貞山公治家記録』（B）・福島市の解説（C）。関ヶ原の北の戦い。東軍の政宗が北目城から出て、上杉景勝の本庄繁長と松川で戦った。数は諸説（推）
//   仕組み「馬印の勢い」の負ける日：馬印を前へ押し出すほど後ろの備が離れ、孤立しやすい（勢いの上限は五割・風は向かい風のまま）。受けて退く備を残して持ちこたえるのが勝ち筋
//   相手の色は蘆名の具足・紋を使い回す（上杉の紋は未）
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const UESUGI = { flag: 'ashina', armor: 0x24323a };
const SPAWN = { x: 140, z: 0 };
const RIVER = [[-40, -220], [-48, -100], [-40, 0], [-52, 110], [-44, 220]];   // 松川
const WIND = [1, 0.1];     // 向かい風（勢いは乗らない）
const FRONT = { x: 75, z: 4 };
const KAWA = { x: -20, z: 0 };
const FAR = { x: -110, z: 0 };
const NIDA = { x: 44, z: 30 };
const HATA = { x: SPAWN.x + 6, z: SPAWN.z - 10 };   // 政宗の旗本の前（上杉の武者が斬り込む所・K652⑥）          // 後ろの荷駄の列（須田長義が突く所・K652②）
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
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②（11/25 Sanae・10分）：伊達勢は松川を渡って福島城の外の上杉の陣へ攻め寄せた（『貞山公治家記録』B）
    { kind: 'fight', at: FAR, limit: 120, obj: '松川を渡り、福島城の外の上杉の陣を破る', title: '福島城の外', sub: '川を渡ると、福島城の櫓が見える',
      say: [['伊達政宗', '川を渡れ。福島の外の陣を破れば、城は目の前じゃ', 3.2]],
      foes: [{ name: '福島城の外の陣', from: { x: FAR.x - 8, z: FAR.z + 4 }, list: [uS(3), uA(15)] }, { name: '外の陣の鉄砲', from: { x: FAR.x - 16, z: FAR.z - 14 }, list: [uS(1), uG(5)] }],
      reward: '福島城の外の上杉の陣を破った' },
    // K652②：上杉の須田長義は伊達勢の後ろへ回り、荷駄を突いた。伊達は荷を失い、兵を引いた（『貞山公治家記録』B・『上杉家御年譜』B）
    { kind: 'hold', at: NIDA, label: '荷駄の列', obj: '後ろの荷駄を突く須田長義の手を、荷駄の列で受け止める', r: 16, dur: 60, limit: 110,
      title: '荷駄', sub: '前に出すぎた。上杉が後ろへ回った',
      say: [['片倉景綱', '殿！　須田の手が後ろの荷駄を突いております！', 3.2], ['伊達政宗', '戻れ、荷駄を守れ！　勢いだけでは勝てぬか', 3.2]],
      waves: [{ t: 6, say: ['須田長義', '伊達の荷を奪え！　米も旗も残すな！'], foes: [{ name: '須田長義の手', from: { x: NIDA.x + 10, z: NIDA.z + 40 }, list: [busho('須田長義', { mustLive: false }), uS(3), uA(13)] }] },
        { t: 30, say: ['組頭', '城からも打って出たぞ！'], foes: [{ name: '福島城の打って出る手', from: { x: NIDA.x - 40, z: NIDA.z - 10 }, list: [uS(2), uA(12), uG(3)] }] }],
      reward: '荷駄の列で須田長義の手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KAWA.x - 30, z: KAWA.z + 10 }, obj: '川の浅瀬の杭の陰で、渡る者を狙う上杉の弓を討つ', max: 100, limit: 90,
      say: [['組頭', '杭の弓を黙らせよ', 3.2]],
      foes: [{ name: '上杉の弓', from: { x: KAWA.x - 18, z: KAWA.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '浅瀬の弓を討った' },
    { kind: 'hold', at: { x: KAWA.x + 40, z: KAWA.z + 30 }, label: '川の手前の道', obj: '川の手前の道で、福島城から出る上杉の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '福島城から出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '福島城の兵', from: { x: KAWA.x + 52, z: KAWA.z + 18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '福島城の兵', from: { x: KAWA.x + 26, z: KAWA.z + 44 }, list: [uS(2), uA(7)] }] }],
      reward: '川の手前の道を守った' },
    { kind: 'fight', at: { x: KAWA.x - 70, z: KAWA.z + 8 }, obj: '川の向こうの陣の柵で、守る上杉の足軽を破る', max: 100, limit: 90,
      say: [['組頭', '陣の柵を破れ', 3.2]],
      foes: [{ name: '陣の上杉の足軽', from: { x: KAWA.x - 58, z: KAWA.z - 4 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '川の向こうの柵を破った' },
    { kind: 'hold', at: { x: KAWA.x - 100, z: KAWA.z + 10 }, label: '退く道で、追', obj: '退く道で、追って来る上杉の殿を受け止める', r: 16, dur: 45,
      say: [['見張り', '殿が追って来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '追う上杉の殿', from: { x: KAWA.x - 88, z: KAWA.z - 2 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '追う上杉の殿', from: { x: KAWA.x - 114, z: KAWA.z + 24 }, list: [uS(2), uA(7)] }] }],
      reward: '退く道を守った' },
    // K652⑥（11/25 クラウドわ）逸話の段：乱れの中で上杉の武者が政宗に斬りかかり、政宗の兜に刀の傷が残ったと伝わる（伝承・諸説）。本人が旗本へ駆け戻り、殿に迫る騎馬武者を斬り伏せる
    { kind: 'fight', at: HATA, limit: 110, obj: '旗本へ駆け戻り、殿に斬りかかる上杉の武者を斬り伏せる', title: '殿の兜', sub: '上杉の武者が、政宗の兜に斬りつけた',
      say: [['伊達成実', '殿の旗本に上杉の武者が斬り込んだ！　戻れ！', 3.2], ['伊達政宗', '兜を割られたか……。まだ首は付いておる！', 3.2]],
      foes: [{ name: '旗本へ斬り込む上杉の武者', from: { x: HATA.x - 14, z: HATA.z - 16 }, list: [uS(4), uA(9)] }],
      reward: '殿に斬りかかった上杉の武者を斬り伏せた' },
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
