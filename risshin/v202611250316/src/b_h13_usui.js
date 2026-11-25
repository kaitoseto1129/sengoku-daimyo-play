// 北条家編 六戦目「臼井城の戦い」（永禄九年〔1566〕三月・下総国 臼井城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   上杉編 u08_usui の同じ戦の、城の内の側（北条の加勢）。城の絵は同じ castles/usui.js を味方の城として使い回す。
//   史実：上杉輝虎が関東の諸将と臼井城を囲んだ。城主 原胤貞のもとに北条の加勢の白井入道（白井胤治）が入って指図し、城方が打って出て寄せ手を崩した。
//   上杉方は大きな損を出して囲みを解いた（佐倉市の解説 C・『関八州古戦録』B。細部は推）。
//   狼煙の網（hojo_noroshi.js）：台地の西の狼煙台に火を上げると、北条の加勢の新手が西から寄せ手の背に出る（加勢の時と道は推）
import { withCastle } from './light_castle.js';
import { USUI_PLAN } from './castles/usui.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const SPAWN = { x: 0, z: -6 };
const KIDO = { x: 0, z: -12 };        // 外の木戸の前（城は北・寄せ手は南から）
const BEACON = { x: -64, z: -40 };    // 台地の西の狼煙台
const UKE = { x: 6, z: 40 };          // 寄せ手の陣（打って出る先）
const N = noroshi({
  beacon: BEACON, beaconStep: 1,
  far: [{ x: -200, z: -60 }, { x: -300, z: 40 }],
  reliefFrom: { x: -120, z: 60 }, reliefTo: { x: 0, z: 20 }, reliefFace: Math.PI / 2,
  relief: { name: '北条の加勢の新手', list: [busho('北条の侍大将'), uS(4), uA(14), uG(3)], say: ['北条の侍大将', '北条の加勢じゃ！　寄せ手の背を突け！'], foeSay: ['上杉の侍', '西に三つ鱗の旗！　北条の加勢か！'] },
});

export const h13_usui = withCastle(lightBattle({
  id: 'h13_usui',
  date: '永禄九年（1566）三月　春・曇り　下総国 臼井城',
  intro: '上杉輝虎が臼井の城を囲んだ。小さな城じゃ。北条の加勢の白井入道様が、守りを指図する。',
  history: '永禄九年（1566）、上杉輝虎は関東の諸将と下総の臼井城を囲んだ。城主 原胤貞のもとに北条の加勢の白井入道が入って指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、関東の諸将の多くが北条の側へ移った。',
  sides: { a: { name: '臼井城の城方（原・北条）', mon: 'hojo', faction: 'hojo' }, b: { name: '上杉輝虎と関東の諸将', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 2000, b: 15000 },
  allyLook: HOJO, foeLook: UESUGI,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1566, overcast: true, time: 'day', fogFar: 380,
    river: [[-220, -150], [-110, -160], [0, -154], [110, -162], [220, -156]], riverW: 30, riverDepth: 1.2,
    hills: [[0, -60, 55, 14], [-70, -40, 40, 9], [70, -50, 40, 9]],
    paths: [{ pts: [[0, 160], [6, 40], [0, -12], [0, -24]], w: 3 }, { pts: [[0, -12], [-64, -40]], w: 2 }],
    groves: [{ x: 70, z: -50, r: 20, n: 26 }, { x: -150, z: 80, r: 30, n: 28 }],
    trees: 460, tufts: 1900,
  },
  allies: [
    { name: '白井入道の手', at: { x: KIDO.x, z: KIDO.z - 8 }, fixed: true, list: [busho('白井入道'), uS(3), uA(6)] },
    { name: '木戸の足軽', at: { x: KIDO.x - 10, z: KIDO.z + 2 }, list: [uS(2), uA(12)] },
    { name: '木戸の鉄砲衆', at: { x: KIDO.x + 12, z: KIDO.z }, list: [uS(1), uG(8)] },
    { name: '狼煙番', at: { x: BEACON.x + 4, z: BEACON.z + 4 }, list: [uS(1), uA(5)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['白井入道', '寄せ手は多いが、気が緩んでおる。木戸で受けて、時を待て', 3.4],
      ['組頭', '西の台地に狼煙台がある。火が上がれば、加勢が来る', 3.2]] },
    { kind: 'hold', at: KIDO, label: '外の木戸', obj: '外の木戸の前で、上杉の寄せ手を受け止める', r: 16, dur: 60, title: '外の木戸', sub: '関東の諸将の兵が木戸へ寄せる',
      say: [['上杉の侍', '小さな城じゃ！　揉み潰せ！', 3]],
      waves: [
        { t: 2, foes: [{ name: '関東の諸将の手', from: { x: KIDO.x - 4, z: KIDO.z + 42 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 安田' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '二の手が来る！'], foes: [{ name: '上杉の二の手', from: { x: KIDO.x + 20, z: KIDO.z + 44 }, list: [uS(2), uA(12)] }] }],
      reward: '外の木戸で寄せ手を受け止めた' },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '台地の狼煙台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '乱破が台を狙う',
      say: [['白井入道', '狼煙台へ行け！　火を上げよ', 3]],
      waves: [
        { t: 6, say: ['上杉の乱破', '狼煙を上げさせるな！'], foes: [{ name: '上杉の乱破', from: { x: BEACON.x - 10, z: BEACON.z + 34 }, list: [uS(1), uA(6)] }] },
        { t: 36, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x - 36, z: BEACON.z + 10 }, list: [uA(5)] }] }],
      reward: '狼煙台を乱破から守った' },
    { kind: 'hold', at: KIDO, label: '外の木戸', obj: '木戸へ戻り、寄せ手の大寄せを受け止める', r: 16, dur: 55, title: '大寄せ', sub: '輝虎の旗本が前へ出る',
      say: [['白井入道', 'あと一押しを凌げ。寄せ手は疲れておる', 3]],
      waves: [
        { t: 4, foes: [{ name: '上杉の大寄せ', from: { x: KIDO.x - 10, z: KIDO.z + 44 }, list: [uS(3), uA(14)] }] },
        { t: 30, foes: [{ name: '上杉の新手', from: { x: KIDO.x + 16, z: KIDO.z + 46 }, list: [uS(2), uA(12)] }] }],
      reward: '木戸で大寄せを受け止めた' },
    { kind: 'fight', at: UKE, limit: 140, obj: '木戸を開けて打って出、寄せ手の陣を崩す', title: '打って出', sub: '白井入道の指図で、城方が門を開いた',
      say: [['白井入道', '今じゃ！　門を開け。寄せ手の陣を突き崩せ！', 3.2]],
      foes: [{ name: '寄せ手の陣', from: { x: UKE.x, z: UKE.z + 10 }, list: [busho('上杉の侍大将', { mustLive: false, invuln: false }), uS(3), uA(16)] }],
      reward: '寄せ手の陣を突き崩した' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '臼井城を守り抜いた', sub: '上杉の寄せ手は大きな損を出し、囲みを解いた', award: '小さな城で上杉の大軍を退けた',
    say: [['白井入道', '城は小さくとも、守りようで落ちぬ', 3.2],
      ['組頭', '関東の諸将が、こぞって北条に付くぞ', 3]],
  },
}), { plan: USUI_PLAN, at: { x: 0, z: -72 }, lift: 0, team: 0, life: false });
export default h13_usui;
