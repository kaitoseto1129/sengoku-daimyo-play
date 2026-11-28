// 伊達家編「大崎合戦」（天正十六年〔1588〕・陸奥国 大崎領 新沼）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e12_osaki.md（K647・11/25 Sanae）
//   出所：『伊達治家記録』（B）・大崎市の解説（C）。政宗は大崎義隆を攻めたが、雪と湿地に阻まれ、新沼城の戦いで敗れて退いた。数は推（伊達約8千・大崎約1万は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：雪と湿地で勢いが乗らない（上限三割・向かい風）。馬印を出しすぎず、退く備を残して持ちこたえるのが勝ち筋。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';
import { withCastle } from './light_castle.js';
import { palisade, kabukimon, nobori } from './props.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x34302c };
const SPAWN = { x: 140, z: 0 };
const WIND = [1, 0.2];
const WOUT = [1, 0.2];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const NAKA = { x: 14, z: -12 };         // 中新田城の前の深田（K652②）
const KURO = { x: -24, z: 26 };         // 黒川晴氏が背いて突いて来る所（K652②）
const NIINUMA = { x: -112, z: 10 };     // 新沼城（泉田重光らが籠もる・K652②）
const NAKASHIRO = { x: 6, z: -58 };     // K718/K655 11/27 クラウドか：場に城が無く雪の野だった→深田（NAKA）の南に中新田城（大手は北の深田と伊達を向く）
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
// 中新田城（加美町の城跡・大崎方の南条隆信が守った平城）。手本：加美町の解説（C）・同じ頃の奥州の平城の型（土塁と柵・空堀・館）。
//   天守・石垣は出さない。曲輪の広さは推。+z が深田と伊達の寄せる側。段の行き先（NAKA・深田の畦・退き口）は城の外に残す
const NAKANIIDA_PLAN = {
  mon: 'ashina', name: '中新田城', type: 'hirajiro', year: 1588, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 4,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -2, wall: 'saku', hp: 600, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-20, 20, 2, 20), gapAt: [[0, 20], [-12, 20], [12, 20], [-20, 10], [20, 10], [0, 2], [-10, 2], [10, 2]], gapW: 8 },
    { id: 'hon', name: '本丸', level: 0, wall: 'dobei', hp: 900, kind: 'hon', capacity: 90, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 14, -22, -2), gapAt: [[0, -2], [-8, -2], [8, -2], [-14, -12], [14, -12]], gapW: 7 },
  ],
  koguchi: [{ id: 'ote', name: '大手門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, 20], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 }],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 34], [0, 20], [0, 2], [0, -2], [0, -10]] }],
  hori: [{ kind: 'karabori', pts: [[-20, 24], [-5, 24]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[5, 24], [20, 24]], w: 3, deep: 2.5 }],
  yagura: [{ id: 'ote', kind: 'monomi', at: [16, 16], rot: 0 }, { id: 'ote2', kind: 'monomi', at: [-16, 16], rot: 0 }, { id: 'hon', kind: 'monomi', at: [10, -18], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [0, -14], w: 10, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
// 中新田城の大崎の幟・新沼城（伊達の泉田らが籠もる小さな城）の柵と門と伊達の幟
function scene(rt) {
  const W = rt.world;
  try { for (const [dx, dz] of [[-6, 22], [6, 22], [-18, 4], [18, 4], [-6, -6], [6, -6]]) rt.scene.add(nobori(W, NAKASHIRO.x + dx, NAKASHIRO.z + dz, 'ashina', 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
  try {
    const x0 = NIINUMA.x - 32, x1 = NIINUMA.x - 12, z0 = NIINUMA.z - 12, z1 = NIINUMA.z + 12;
    for (const seg of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, NIINUMA.z - 3], [x1, NIINUMA.z + 3, x1, z1]]) rt.scene.add(palisade(W, seg, { solid: false, h: 2.6 }));
    rt.scene.add(kabukimon(W, x1, NIINUMA.z, 5.2, -Math.PI / 2, { doors: false }));
    for (const [dx, dz] of [[-16, -6], [-16, 6], [-28, 0]]) rt.scene.add(nobori(W, NIINUMA.x + dx, NIINUMA.z + dz, 'date', 5.5));
  } catch (e) { /* 新沼城が無くても戦は続ける */ }
}
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.3, windStep: 99 });

export const e12_osaki = withCastle(lightBattle({
  id: 'e12_osaki',
  date: '天正十六年（1588）二月　冬・雪　陸奥国 大崎領',
  intro: '雪の大崎。大崎義隆を攻める政宗の軍は、狭い街道と湿地に足を取られた。',
  history: '天正十六年（1588）、伊達政宗は大崎義隆を攻めたが、雪と湿地に阻まれ、新沼城などで苦戦して退いた。最上義光の動きもあり、政宗は雪国で軍が動かない難しさを知った（『伊達治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '大崎義隆の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 8000, b: 10000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3, foeDmg: 0.38,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1588, time: 'day', fogFar: 300, autumn: 0, sky: { wind: WIND, windStrength: 0.9, overcast: 0.7, mist: 0.4, snow: 0.35, winter: true, snowGround: 0.6 },   // K655 11/27 クラウドか：二月の雪の大崎（地面が緑のままだった）
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
      say: [['組頭', '足元に気を付けよ！　道を外れるな！', 3.2], ['伊達成実', '道が狭まる。列が伸びきって、前が動けぬ！', 3.2]],
      waves: [
        { t: 6, say: ['大崎の侍', '伊達を沼へ追い込め！'], foes: [{ name: '大崎の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '大崎の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '雪の街道を持ちこたえた' },
    // K652②（11/25 Sanae・10分）：天正十六年二月、伊達勢は雪の中で中新田城を攻めたが、深田に足を取られて攻めあぐねた（『伊達日記』B・『貞山公治家記録』B）
    { kind: 'fight', at: NAKA, limit: 70, obj: '中新田城の前の深田で、城から出る大崎の手と押し合う', title: '中新田城', sub: '雪と深田に、足が沈む',
      say: [['組頭', '田に入るな！　畦の上で受けよ！', 3.2], ['伊達成実', '城の手は少ない。じゃが、この足では追えぬ', 3.2]],
      foes: [{ name: '中新田の城兵', from: { x: NAKA.x - 14, z: NAKA.z - 8 }, list: [uS(3), uA(14)] }, { name: '中新田の鉄砲', from: { x: NAKA.x - 22, z: NAKA.z + 8 }, list: [uS(1), uG(5)] }],
      reward: '中新田城の前で大崎の手と押し合った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②：伊達方に付いていた黒川晴氏が大崎に寝返り、伊達勢を背から突いた（『伊達日記』B）
    { kind: 'hold', at: KURO, label: '背いた黒川', obj: '寝返った黒川晴氏の手を、街道の脇で受け止める', r: 16, dur: 60, limit: 110,
      title: '黒川の寝返り', sub: '味方のはずの黒川が、背を突いて来る',
      say: [['伊達成実', '黒川が背いた！　後ろからも来るぞ、固まれ！', 3.2]],
      waves: [{ t: 6, say: ['黒川晴氏', '大崎殿に付く！　伊達を雪に埋めよ！'], foes: [{ name: '黒川晴氏の手', from: { x: KURO.x + 30, z: KURO.z + 30 }, list: [busho('黒川晴氏', { mustLive: false }), uS(3), uA(13)] }] },
        { t: 30, say: ['組頭', '大崎の手も来る！　挟まれるな！'], foes: [{ name: '大崎の挟みの手', from: { x: KURO.x - 36, z: KURO.z - 6 }, list: [uS(2), uA(12)] }] }],
      reward: '寝返った黒川の手を受け止めた' },
    { kind: 'fight', at: GOAL, limit: 70, obj: '馬印を抑えて、新沼の岸の大崎勢を押し返し、道を守る', title: '新沼の岸', sub: '湿地の向こうに、大崎の本隊が陣取る',
      say: [['伊達成実', '殿、出すぎは禁物。後ろの備が付いておりますか', 3.2]],
      foes: [{ name: '大崎の本隊', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('大崎義隆', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '大崎の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '新沼の岸で大崎勢を押し返した' },
    // K652②：退き遅れた泉田重光・留守政景らは新沼城に囲まれた（のち和議で出た）。城の囲みの外の大崎勢を払い、退く道を開ける
    { kind: 'fight', at: NIINUMA, limit: 70, obj: '新沼城を囲む大崎の手を払い、籠もる味方の退く道を開ける', title: '新沼城', sub: '退き遅れた味方が、城に囲まれている',
      say: [['伊達政宗', '泉田たちを見捨てはせぬ。囲みの一角を払え', 3.2]],
      foes: [{ name: '新沼の囲みの大崎勢', from: { x: NIINUMA.x + 10, z: NIINUMA.z + 12 }, list: [uS(3), uA(14)] }, { name: '囲みの鉄砲', from: { x: NIINUMA.x - 6, z: NIINUMA.z + 22 }, list: [uS(1), uG(4)] }],
      reward: '新沼城の囲みの一角を払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: NAKA.x - 30, z: NAKA.z + 16 }, obj: '深田の畦で、足を取られた大崎の足軽を討つ', max: 60, limit: 50,
      say: [['組頭', '泥に嵌まった。叩け', 3.2]],
      foes: [{ name: '深田の大崎の足軽', from: { x: NAKA.x - 18, z: NAKA.z + 4 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '深田の畦を押さえた' },
    { kind: 'hold', at: { x: NAKA.x + 50, z: NAKA.z - 20 }, label: '雪の街道で、', obj: '雪の街道で、中新田から救いに出る大崎の兵を受け止める', r: 16, dur: 45, limit: 110,   // 11/27 クラウドか：上限が無く act bot がこの段で380秒止まり1080秒の失敗（前も同じ）。ほかの受けの段と同じ110秒に
      say: [['見張り', '中新田から救いが出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '大崎の救いの兵', from: { x: NAKA.x + 62, z: NAKA.z - 32 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '大崎の救いの兵', from: { x: NAKA.x + 36, z: NAKA.z - 6 }, list: [uS(2), uA(7)] }] }],
      reward: '雪の街道を守った' },
    // K718 二回目：流れ⑧⑨（集落で防衛し、散らばった味方をまとめる）
    { kind: 'rest', dur: 8, say: [['伊達成実', '雪の集落に入れ。分かれた備をここで一つにまとめよ', 3.4], ['組頭', '柵代わりに家を使え。点呼じゃ、遅れた者はおらぬか', 3.2]] },
    // K656 見せ場：囲みを解いて退く伊達勢の殿（しんがり）。雪の街道で追う大崎の手を受け止め、政宗を退かせる（『伊達治家記録』B・順は諸説）
    { kind: 'hold', at: { x: 40, z: -4 }, label: '雪の退き口', obj: '殿に立ち、追う大崎の手を雪の街道で受け止めて、政宗を退かせる', r: 16, dur: 50, limit: 110,
      title: '雪の退き口', sub: '退く伊達勢の背へ、大崎が追って来る',
      say: [['伊達成実', '殿は某が受ける。政宗様を先に退かせよ', 3.2]],
      waves: [{ t: 6, say: ['大崎の侍', '逃がすな！　雪の中で討ち取れ！'], foes: [{ name: '大崎の追手', from: { x: 40 - 40, z: -4 + 6 }, list: [uS(3), uA(14)] }] },
        { t: 28, say: ['組頭', '追手が増えた！　街道を塞げ！'], foes: [{ name: '大崎の二の追手', from: { x: 40 - 36, z: -4 - 12 }, list: [uS(2), uA(12)] }] }],
      reward: '雪の退き口で、殿を務めた' },
  ],
  setup: scene,
  update: umaTick,
  win: {
    banner: '雪の大崎を持ちこたえる', sub: '伊達は退いた。雪国の戦の難しさを、政宗は知った', award: '雪と湿地で馬印の勢いを抑えて戦った',
    say: [['伊達成実', '無理に出ず、よう引き揚げました', 3.2],
      ['伊達政宗', '雪には勝てぬか……。次は春を待とう', 3.2]],
  },
}), { plan: NAKANIIDA_PLAN, at: NAKASHIRO, lift: 3, team: 1, life: false });
e12_osaki.camPull = 1.6;
export default e12_osaki;
