// 伊達家編 三戦目「小浜城・宮森城の戦い」（天正十三年〔1585〕十月〜十一月）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e02_kobama.md
//   史実：十月、二本松義継が輝宗を拉致して連れ去り、粟之巣で輝宗は討たれた（政宗の父を失う）。政宗は怒って二本松を攻め、小浜城・宮森城のあたりで戦った。
//   出所：『伊達日記』（B）・『性山公治家記録』（B）。伊達約6千・二本松約3千は推。残酷な場面は描かない。字は使わず、荒れた色調（曇り・霧）で見せる
//   仕組み「馬印の勢い」は date_uma.js（e05 と共通）。怒りの戦なので勢いの上限は初めから満ち、風は変わらない。相手の色は蘆名の具足・紋を使い回す（二本松の紋は未）
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';
import { withCastle } from './light_castle.js';
import { palisade, kabukimon, village, nobori, yagura } from './props.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const NIHON = { flag: 'ashina', armor: 0x4a3a2c };
const SPAWN = { x: 150, z: 20 };
const WIND = [0.9, -0.3];
const HAYASHI = { x: 50, z: 10 };     // 安達太良の麓の林
const KOBAMA = { x: -50, z: 0 };      // 小浜城の城下
const MIYA = { x: -120, z: -10 };     // 宮森城
const TORIDE = { x: 0, z: -24 };      // 小浜城の外の砦（K652②）
const ATO = { x: -84, z: 22 };        // 宮森から出た後詰を受ける所（K652②）
const OCHI = { x: -68, z: -22 };      // 小浜城の裏の落ち道（大内定綱が夜に城を捨てて落ちた・K652⑥）
// K718/K655 11/27 クラウドわ：場に城が無く、曇りの林と道だけだった（サムネもどの戦か分からない）→道の南の丘に小浜城、宮森の小山に宮森城の柵と木戸を置く
const SHIRO = { x: -55, z: -66 };       // 小浜城（大手は北＝城下の道と落ち道を向く。二の丸の北の柵が z -32）
const MIYAJO = { x: -128, z: -40 };     // 宮森城（宮森の小山の頂・柵と木戸と櫓だけの小さな城）
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
// 小浜城（二本松市岩代町小浜の小浜城跡・大内定綱の居城）。手本：二本松市の解説（C）・同じ頃の安達郡の土の山城の型（曲輪二つ・柵・堀切・天守石垣なし・e11 小手森と同じ型）。曲輪の広さは推。+z が伊達の寄せる側
const KOBAMA_PLAN = {
  mon: 'ashina', name: '小浜城', type: 'yamajiro', year: 1585, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 6,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -4, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-16, 16, 14, 34), gapAt: [[0, 34], [8, 34], [-8, 34], [16, 24], [16, 18], [16, 30], [-16, 24], [0, 14], [8, 14], [-8, 14]], gapW: 7 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-13, 13, -12, 10), gapAt: [[0, 10], [7, 10], [-7, 10], [10, -12], [-10, -12], [0, -12], [13, 0], [13, -6], [-13, 0]], gapW: 8 },
  ],
  koguchi: [{ id: 'ote', name: '大手門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, 34], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 }],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 46], [0, 34], [0, 14], [0, 10], [0, 0]] }],
  hori: [{ kind: 'karabori', pts: [[-11, 12], [-3, 12]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[3, 12], [11, 12]], w: 3, deep: 2.5 }],
  yagura: [{ id: 'ote', kind: 'monomi', at: [11, 30], rot: 0 }, { id: 'ote2', kind: 'monomi', at: [-11, 30], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-9, -8], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [3, -4], w: 10, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
// 宮森城（二本松市岩代町の宮森城跡）：小山の頂を柵で囲い、北の木戸と櫓だけ（小さな支城）・小浜城と宮森城の大内（二本松方）の幟・小浜の城下の家並み。柵は通り抜けられる飾り（solid なし）
function scene(rt) {
  const W = rt.world, M = MIYAJO;
  try {
    for (const sg of [[M.x - 18, M.z + 14, M.x - 4, M.z + 14], [M.x + 4, M.z + 14, M.x + 18, M.z + 14], [M.x + 18, M.z + 14, M.x + 18, M.z - 12], [M.x + 18, M.z - 12, M.x - 18, M.z - 12], [M.x - 18, M.z - 12, M.x - 18, M.z + 14]])
      rt.scene.add(palisade(W, sg, { solid: false, h: 2.4 }));
  } catch (e) { /* 柵が無くても戦は続ける */ }
  try { rt.scene.add(kabukimon(W, M.x, M.z + 14, 5.2, 0, { doors: false })); } catch (e) { /* 門が無くても戦は続ける */ }
  try { for (const [dx, dz] of [[12, 9], [-12, -7]]) rt.scene.add(yagura(W, M.x + dx, M.z + dz, { kind: 'ro', rot: 0 })); } catch (e) { /* 櫓が無くても戦は続ける */ }
  try { for (const [dx, dz] of [[-6, 16], [6, 16], [0, 0], [-10, 6]]) rt.scene.add(nobori(W, M.x + dx, M.z + dz, 'ashina', 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
  try { for (const [dx, dz] of [[-6, 2], [6, 4], [-8, 36], [8, 36], [0, -6]]) rt.scene.add(nobori(W, SHIRO.x + dx, SHIRO.z + dz, 'ashina', 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
  try { rt.scene.add(village(W, KOBAMA.x - 4, KOBAMA.z + 26, { n: 5, r: 12, rot: 0, fields: 1, smoke: 0, autumn: true, seed: 1585, groundedHomes: true })); } catch (e) { /* 町が無くても戦は続ける */ }
}
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e02_kobama = withCastle(lightBattle({
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
  // 11/27 K718：限りの無い守りの段（hold）が bot で三百秒かかり、戦の時間切れで終わった。限りの無い fight・hold の段は七十秒で次へ
  stepLimit: 70,
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 12 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 7, heal: 0, say: [
      ['片倉景綱', '殿、お気持ちは分かります。されど怒りに任せてはなりませぬ', 3.4],
      ['伊達政宗', '分かっておる。馬印を前へ。父上の無念、必ず晴らす', 3.4]] },
    { kind: 'hold', at: HAYASHI, label: '麓の林', obj: '麓の林で、二本松の伏せ勢を受け止める', r: 16, dur: 25,
      title: '小浜城', sub: '曇りの林の中、二本松の兵が打って出る',
      say: [['組頭', '林の中じゃ！　固まって槍を揃えよ！', 3]],
      waves: [
        { t: 6, say: ['二本松の侍', '政宗を討て！　一歩も通すな！'], foes: [{ name: '二本松の先手', from: { x: HAYASHI.x - 38, z: HAYASHI.z }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　ここで退くな！'], foes: [{ name: '二本松の二の手', from: { x: HAYASHI.x - 34, z: HAYASHI.z + 16 }, list: [uS(2), uA(10)] }] }],
      reward: '二本松の先手を受け止めた' },
    // K652②（11/25 Sanae・10分）：小浜城の周りには砦がいくつもあり、伊達勢は一つずつ落とした（『伊達日記』B）
    { kind: 'fight', at: TORIDE, limit: 130, obj: '小浜城の外の砦の鉄砲を潰す', title: '外の砦', sub: '城の外の砦から、鉄砲が林を撃つ',
      say: [['片倉景綱', '砦の鉄砲を潰さねば、城下へは寄れませぬ', 3.2]],
      foes: [{ name: '砦の二本松勢', from: { x: TORIDE.x - 12, z: TORIDE.z - 6 }, list: [uS(2), uA(9)] }, { name: '砦の鉄砲', from: { x: TORIDE.x - 18, z: TORIDE.z + 10 }, list: [uS(1), uG(3)] }],
      reward: '小浜城の外の砦を潰した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: KOBAMA, limit: 80, obj: '馬印を押し出して、小浜城の城下の兵を崩す', title: '押し出し', sub: '政宗の馬印が林を抜ける',
      say: [['伊達政宗', '今じゃ、馬印を前へ！', 3.2], ['伊達成実', '殿の旗が出たぞ！　遅れるな！', 3]],
      foes: [{ name: '小浜城の兵', from: { x: KOBAMA.x - 6, z: KOBAMA.z }, list: [uS(4), uA(18)] },
        { name: '二本松の鉄砲', from: { x: KOBAMA.x - 14, z: KOBAMA.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '小浜城の城下を崩した' },
    // K652⑥（11/26 クラウドわ）逸話の段：小浜城主の大内定綱は、伊達勢に囲まれて夜のうちに城を捨て、二本松へ落ちた（『伊達治家記録』B・日は諸説）。本人が裏の落ち道へ回り、定綱の殿を追い崩す
    { kind: 'fight', at: OCHI, limit: 70, obj: '城を捨てて落ちる大内定綱の殿を、裏の道で追い崩す', title: '定綱の落ち', sub: '夜のうちに、大内定綱が小浜城を捨てて落ちる',
      say: [['伊達成実', '城の裏に松明が動いておる。定綱め、城を捨てて落ちる気じゃ！', 3.4], ['伊達政宗', '逃がすな。裏の道を塞げ', 2.8], ['組頭', '殿の松明を目当てに斬り込め！', 3]],
      foes: [{ name: '大内定綱の殿', from: { x: OCHI.x - 14, z: OCHI.z - 6 }, list: [uS(4), uA(12)] }, { name: '落ちる大内の鉄砲', from: { x: OCHI.x - 22, z: OCHI.z + 8 }, list: [uS(1), uG(4)] }],
      reward: '落ちる大内定綱の殿を追い崩した' },
    { kind: 'hold', at: ATO, label: '宮森への道', obj: '宮森から出た二本松の後詰を、道で受け止める', r: 16, dur: 25, limit: 70,
      title: '後詰', sub: '宮森城から、二本松の後詰が出る',
      say: [['伊達成実', '宮森から後詰じゃ！　殿の旗の前を固めよ', 3.2]],
      waves: [{ t: 6, say: ['二本松の侍', '小浜を取り返せ！'], foes: [{ name: '宮森の後詰', from: { x: ATO.x - 36, z: ATO.z - 10 }, list: [uS(2), uA(8)] }] },
        { t: 15, say: ['組頭', '横の林からも来る！'], foes: [{ name: '林の二本松勢', from: { x: ATO.x - 10, z: ATO.z + 36 }, list: [uS(1), uA(6), uG(1)] }] }],
      reward: '宮森から出た後詰を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KOBAMA.x + 60, z: KOBAMA.z + 10 }, obj: '安達太良の山道で、荷を運ぶ二本松の足軽を討つ', max: 60, limit: 40,
      say: [['組頭', '荷駄を押さえよ', 3.2]],
      foes: [{ name: '荷を運ぶ二本松の足軽', from: { x: KOBAMA.x + 72, z: KOBAMA.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '山道の荷駄を押さえた' },
    { kind: 'hold', at: { x: KOBAMA.x + 20, z: KOBAMA.z + 20 }, label: '小浜の城下の', obj: '小浜の城下の道で、城から出る二本松の兵を受け止める', r: 16, dur: 22,
      say: [['見張り', '城から打って出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '二本松の兵', from: { x: KOBAMA.x + 32, z: KOBAMA.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 15, foes: [{ name: '二本松の兵', from: { x: KOBAMA.x + 6, z: KOBAMA.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '小浜の城下の道を守った' },
    { kind: 'fight', at: { x: KOBAMA.x - 30, z: KOBAMA.z - 14 }, obj: '小浜城の門で、守りを固める二本松の旗本を崩す', max: 60, limit: 40,
      say: [['伊達政宗', '門を破れ。城は目の前じゃ', 3.2]],
      foes: [{ name: '二本松の旗本', from: { x: KOBAMA.x - 18, z: KOBAMA.z - 26 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '小浜城の門を破った' },
    // K718 二回目（11/26）：見せ場「一つの丘から小浜城と宮森城の両方の旗が見える」・⑦輝宗の陣へ合流（要件書の並び）
    { kind: 'move', at: { x: -85, z: -30 }, label: '両城の見える丘', obj: '丘に上り、小浜城と宮森城の両方の旗を見る', r: 24, max: 50,
      say: [['伊達成実', '殿、あの丘へ。小浜と宮森の両方の旗が見えまする', 3.2], ['伊達政宗', '二つの旗が見える。連絡の道を断たせるな', 3.2]] },
    { kind: 'hold', at: { x: KOBAMA.x - 60, z: KOBAMA.z - 10 }, label: '宮森城への道', obj: '宮森城への道で、落ちる二本松の兵を追う者を受け止める', r: 16, dur: 22,
      say: [['見張り', '殿が返して来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '二本松の殿', from: { x: KOBAMA.x - 48, z: KOBAMA.z - 22 }, list: [uS(3), uA(9)] }] },
        { t: 15, foes: [{ name: '二本松の殿', from: { x: KOBAMA.x - 74, z: KOBAMA.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '宮森城への道を守った' },
    { kind: 'fight', at: { x: KOBAMA.x - 100, z: KOBAMA.z - 10 }, obj: '宮森城の木戸で、籠る二本松の兵を斬り払う', max: 60, limit: 40,
      say: [['伊達政宗', '木戸を破れ', 3.2]],
      foes: [{ name: '宮森城の兵', from: { x: KOBAMA.x - 88, z: KOBAMA.z - 22 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '宮森城の木戸を破った' },
    { kind: 'fight', at: MIYA, limit: 75, obj: '宮森城へ、二本松の旗本を追い落とす', title: '宮森城', sub: '崩れた二本松勢が宮森へ退く',
      say: [['片倉景綱', '宮森まで追え。ここで二本松が決まる', 3.2]],
      foes: [{ name: '二本松の旗本', from: { x: MIYA.x - 4, z: MIYA.z }, list: [busho('畠山義綱', { mustLive: false, invuln: false }), uS(4), uA(14)] }],
      reward: '宮森城へ二本松の旗本を追い落とした' },
  ],
  setup: scene,
  update: umaTick,
  win: {
    banner: '二本松を攻め取る', sub: '小浜城・宮森城のあたりを押さえた。政宗は父の無念を胸に', award: '小浜・宮森で馬印を押し出した',
    say: [['伊達成実', '二本松勢、宮森から落ちていきます！', 3.2],
      ['片倉景綱', '二つの城をつなぐ道は押さえました。次は二本松の本城。支度に入りまする', 3.4],
      ['伊達政宗', '……父上。まだ戦は終わらぬ', 3.4]],
  },
}), { plan: KOBAMA_PLAN, at: SHIRO, lift: 10, team: 1, life: false });
e02_kobama.camPull = 1.6;
export default e02_kobama;
