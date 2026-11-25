// 伊達家編 八戦目「朝鮮出兵（伊達者の行列）」（文禄元年〔1592〕）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e08_korea.md
//   出所：『貞山公治家記録』（B）。政宗は肥前名護屋から三千の兵で出陣し、道中の派手な装束が評判になった（伊達者の語り・逸話 B）。伊達約3千は通説※・敵の数は推
//   前半は名護屋の浜への行列（金糸の飾りの具足・長い列の味方）、後半は朝鮮の山道の短い戦。馬印の勢いは date_uma.js（共通）。相手の色は蘆名の具足・紋を使い回す
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18, lace: 0xc8a448, lace2: 0xb83a30, lace3: 0xd8c070 };   // 派手な装束：金と朱の縅
const FOE = { flag: 'ashina', armor: 0x3a4a5a };
const SPAWN = { x: 125, z: 10 };
const WIND = [0.6, 0.2];
const HAMA = { x: 70, z: 8 };         // 名護屋の浜への道
const PASS = { x: 10, z: 0 };         // 朝鮮の山道の入口
const FAR = { x: -90, z: -6 };        // 谷の向こうの敵の陣
const MURA = { x: -36, z: 22 };       // 山あいの村（伏せた兵・K652②）
const KAESHI = { x: -116, z: 24 };    // 取った陣（取り返しに来る敵を受ける所・K652②）
const SAKU = { x: -150, z: -10 };     // 城の外の柵（K652②）
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e08_korea = lightBattle({
  id: 'e08_korea',
  date: '文禄元年（1592）　春　肥前国 名護屋→朝鮮',
  intro: '豊臣の大軍が朝鮮へ渡る。伊達政宗は三千の兵を、金と朱で飾った装束で名護屋の浜へ進めた。',
  history: '文禄元年（1592）、豊臣秀吉の朝鮮出兵で、伊達政宗は三千の兵を率いて肥前名護屋に着き、海を渡った。道中の兵の派手な装束は人々の目を引き、「伊達者」の語りのもとになったと伝わる（『貞山公治家記録』・逸話）。戦そのものは短く、数の多さと装いが見せ場となった。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '朝鮮・明の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 4000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1592, time: 'day', fogFar: 420, sky: { wind: WIND, windStrength: 0.8 },
    hills: [[-40, -150, 80, 26], [-40, 150, 80, 22], [PASS.x + 40, 0, 50, 7], [180, -120, 70, 12]],   // 山道の両脇の山
    paths: [{ pts: [[125, 10], [HAMA.x, HAMA.z], [PASS.x, PASS.z], [-90, -6]], w: 3.4 }],
    groves: [{ x: 40, z: 60, r: 30, n: 30 }, { x: -30, z: -70, r: 34, n: 34 }],
    trees: 320, tufts: 1900,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(10)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 6, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(14)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 6, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 6, z: SPAWN.z + 24 }, list: [uS(1), uG(10)] },
    { name: '後備の列', at: { x: SPAWN.x + 30, z: SPAWN.z }, list: [uS(3), uA(18)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['伊達成実', '殿、人が見ておりますぞ。金の縅が朝日に映えます', 3.4],
      ['伊達政宗', '見せてやれ。伊達の者は、行列から違うとな', 3.2]] },
    { kind: 'move', at: HAMA, label: '名護屋の浜', obj: '行列を整えて、名護屋の浜へ進む', r: 14,
      say: [['組頭', '列を乱すな！　諸国の衆が見ておる', 3.2]] },
    { kind: 'hold', at: PASS, label: '山道の入口', obj: '朝鮮の山道の入口で、寄せる敵を受け止める', r: 16, dur: 60,
      title: '朝鮮の山道', sub: '谷の向こうから敵が寄せる',
      say: [['片倉景綱', '見慣れぬ旗じゃ。鉄砲を前へ出せ', 3.2]],
      waves: [
        { t: 6, say: ['敵の将', '倭の兵を山から追い返せ！'], foes: [{ name: '敵の先手', from: { x: PASS.x - 40, z: PASS.z }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['組頭', '新手が出た！　列を固めよ！'], foes: [{ name: '敵の二の手', from: { x: PASS.x - 36, z: PASS.z + 14 }, list: [uS(2), uA(10)] }] }],
      reward: '山道の入口で敵の先手を受け止めた' },
    // K652②（11/25 Sanae・10分）：渡海した軍は、山あいの道で土地の兵の伏せに何度も遭った（『貞山公治家記録』B）
    { kind: 'fight', at: MURA, limit: 120, obj: '山あいの村に伏せた敵の手を払う', title: '山あいの村', sub: '村の陰から、伏せた兵が出る',
      say: [['片倉景綱', '村の陰に伏せがおりまする。列を崩さず払え', 3.2]],
      foes: [{ name: '村に伏せた手', from: { x: MURA.x - 10, z: MURA.z + 10 }, list: [uS(2), uA(13)] }, { name: '村の弓', from: { x: MURA.x - 16, z: MURA.z - 10 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '山あいの村の伏せを払った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: FAR, limit: 120, obj: '馬印を押し出して、谷の向こうの敵の陣を崩す', title: '押し出し', sub: '金の装束の列が山道を抜ける',
      say: [['伊達政宗', '馬印を前へ！　見せ場じゃ', 3.2]],
      foes: [{ name: '敵の本陣', from: { x: FAR.x - 6, z: FAR.z }, list: [busho('敵の将', { mustLive: false, invuln: false }), uS(3), uA(14)] },
        { name: '敵の弓', from: { x: FAR.x - 12, z: FAR.z + 14 }, list: [uS(1), uG(5)] }],
      reward: '谷の向こうの敵の陣を崩した' },
    { kind: 'hold', at: KAESHI, label: '取った陣', obj: '取った陣を、取り返しに来る敵から守る', r: 16, dur: 60, limit: 110,
      title: '取り返し', sub: '敵が陣を取り返しに来る',
      say: [['伊達成実', '敵の新手が谷を下りて来る！　取った陣を渡すな', 3.2]],
      waves: [{ t: 6, say: ['敵の侍', '陣を取り返せ！'], foes: [{ name: '敵の新手', from: { x: KAESHI.x - 36, z: KAESHI.z }, list: [uS(3), uA(13)] }] },
        { t: 30, say: ['組頭', '横の尾根からも来るぞ！'], foes: [{ name: '尾根の敵', from: { x: KAESHI.x - 10, z: KAESHI.z + 36 }, list: [uS(2), uA(10), { type: 'bow', n: 3 }] }] }],
      reward: '取った陣を守り抜いた' },
    { kind: 'fight', at: SAKU, limit: 120, obj: '城の外の柵に籠もる敵を崩す', title: '城の外の柵', sub: '山の城の外に、柵が組まれている',
      say: [['伊達政宗', 'もう一押しじゃ。伊達の旗を、あの柵の上に立てよ', 3.2]],
      foes: [{ name: '柵の敵', from: { x: SAKU.x + 8, z: SAKU.z }, list: [uS(3), uA(14)] }, { name: '柵の弓', from: { x: SAKU.x - 6, z: SAKU.z + 14 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '城の外の柵の敵を崩した' },
  ],
  update: umaTick,
  win: {
    banner: '朝鮮の山道を抜ける', sub: '金と朱の装束の列は、海を渡っても崩れなかった', award: '朝鮮の山道で馬印を押し出した',
    say: [['伊達成実', '殿の装束、敵も目を見張ったでしょう', 3.2],
      ['伊達政宗', '派手に出て、派手に勝つ。それが伊達じゃ', 3.2]],
  },
});
e08_korea.camPull = 1.6;
export default e08_korea;
