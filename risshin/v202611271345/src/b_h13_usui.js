// 北条家編 六戦目「臼井城の戦い」（永禄九年〔1566〕三月・下総国 臼井城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   上杉編 u08_usui の同じ戦の、城の内の側（北条の加勢）。城の絵は同じ castles/usui.js を味方の城として使い回す。
//   史実：上杉輝虎が関東の諸将と臼井城を囲んだ。城主 原胤貞のもとに北条の加勢の白井入道（白井胤治）が入って指図し、城方が打って出て寄せ手を崩した。
//   上杉方は大きな損を出して囲みを解いた（佐倉市の解説 C・『関八州古戦録』B。細部は推）。
//   狼煙の網（hojo_noroshi.js）：台地の西の狼煙台に火を上げると、北条の加勢の新手が西から寄せ手の背に出る（加勢の時と道は推）
import { withCastle } from './light_castle.js';
import { USUI_PLAN } from './castles/usui.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { USUI_LAND } from './b_u08_usui.js';   // K651：上杉編 u08 の臼井の地面をそのまま使う（同じ戦は一つの戦場に。城も同じ所）
import { noroshi } from './hojo_noroshi.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const SPAWN = { x: 0, z: -6 };
const KIDO = { x: 0, z: -12 };        // 外の木戸の前（城は北・寄せ手は南から）
const BEACON = { x: -64, z: -40 };    // 台地の西の狼煙台
const UKE = { x: 6, z: 40 };          // 寄せ手の陣（打って出る先）
const N = noroshi({
  beacon: BEACON, beaconStep: 5,
  far: [{ x: -200, z: -60 }, { x: -300, z: 40 }],
  reliefFrom: { x: -120, z: 60 }, reliefTo: { x: 0, z: 20 }, reliefFace: Math.PI / 2,
  relief: { name: '北条の加勢の新手', list: [busho('北条の侍大将'), uS(4), uA(14), uG(3)], say: ['北条の侍大将', '北条の加勢じゃ！　寄せ手の背を突け！'], foeSay: ['上杉の侍', '西に三つ鱗の旗！　北条の加勢か！'] },
});

export const h13_usui = withCastle(lightBattle({
  id: 'h13_usui',
  date: '永禄九年（1566）三月　春・曇り　下総国 臼井城',
  intro: '上杉輝虎が臼井の城を囲んだ。小さな城じゃ。北条の救援に駆けつけ、湿地を抜けて城方と合流する。',
  history: '永禄九年（1566）、上杉輝虎は関東の諸将と下総の臼井城を囲んだ。城主 原胤貞のもとに北条の加勢の白井入道が入って指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、関東の諸将の多くが北条の側へ移った。',
  sides: { a: { name: '臼井城の城方（原・北条）', mon: 'hojo', faction: 'hojo' }, b: { name: '上杉輝虎と関東の諸将', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 2000, b: 15000 },
  allyLook: HOJO, foeLook: UESUGI,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: 24, z: 130, heading: Math.PI },
  world: { ...USUI_LAND },

  allies: [
    { name: '北条の救援軍', at: { x: 24, z: 136 }, face: Math.PI, list: [uS(2), uA(12), uG(3)] },
    { name: '北条の救援の足軽', at: { x: 14, z: 138 }, face: Math.PI, list: [uS(1), uA(10)] },
    { name: '白井入道の手', at: { x: KIDO.x, z: KIDO.z - 8 }, fixed: true, list: [busho('白井入道'), uS(3), uA(6)] },
    { name: '木戸の足軽', at: { x: KIDO.x - 10, z: KIDO.z + 2 }, list: [uS(2), uA(12)] },
    { name: '木戸の鉄砲衆', at: { x: KIDO.x + 12, z: KIDO.z }, list: [uS(1), uG(8)] },
    { name: '狼煙番', at: { x: BEACON.x + 4, z: BEACON.z + 4 }, list: [uS(1), uA(5)] },
  ],
  steps: [
    // K721（11/26）要件書の流れ：①城へ救援 ②上杉の先手と接触 ③湿地で足が遅くなる ④城方と合流 ⑤上杉が総攻撃 ⑥城門を守る ⑦敵が横へ回る ⑧打って出る ⑨敵が崩れる ⑩囲みを解かせる
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条の侍大将', '臼井の小城が上杉の大軍に囲まれておる。救援に駆けつけるぞ', 3.4],
      ['組頭', '道は湿地じゃ。足を取られるな。城の白井入道様と合流せよ', 3.2]] },
    { kind: 'fight', at: { x: 20, z: 96 }, limit: 100, obj: '救援に駆けつけ、行く手の上杉の先手と接触する', title: '先手', sub: '囲みの外の上杉の先手',
      say: [['組頭', '上杉の先手じゃ。蹴散らして城へ進め', 3.2]],
      foes: [{ name: '上杉の先手', from: { x: 16, z: 84 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 柿崎' } }, uS(1), uA(8)] }],
      reward: '上杉の先手を蹴散らした' },
    { kind: 'move', at: { x: 10, z: 60 }, label: '湿地', obj: '湿地の道を、足を取られながら城へ進む', r: 12, max: 120,
      say: [['組頭', '泥が深い。急ぐな。脇から弓が来るぞ', 3]],
      ambush: { t: 6, foes: [{ name: '湿地の上杉の弓', from: { x: 26, z: 50 }, list: [uS(1), uA(4), uB(3)] }] } },
    { kind: 'move', at: { x: KIDO.x + 2, z: KIDO.z + 22 }, label: '城方と合流', obj: '外の木戸の前で、城方の白井入道と合流する', r: 12, max: 100,
      say: [['白井入道', 'よう来た。寄せ手は多いが、気が緩んでおる。木戸で受けて、時を待て', 3.4]] },
    { kind: 'hold', at: KIDO, label: '外の木戸', obj: '外の木戸を守り、上杉の総攻撃を受け止める', r: 16, dur: 60, title: '外の木戸', sub: '関東の諸将の兵が木戸へ寄せる',
      say: [['上杉の侍', '小さな城じゃ！　揉み潰せ！', 3]],
      waves: [
        { t: 2, foes: [{ name: '関東の諸将の手', from: { x: KIDO.x - 4, z: KIDO.z + 42 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 安田' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '二の手が来る！'], foes: [{ name: '上杉の二の手', from: { x: KIDO.x + 20, z: KIDO.z + 44 }, list: [uS(2), uA(12)] }] }],
      reward: '外の木戸で寄せ手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + -14, z: KIDO.z + -12 }, obj: '堀沿いに横へ回り、梯子を掛ける寄せ手を討て', limit: 90,
      say: [['組頭', '梯子を掛ける寄せ手じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '梯子を掛ける寄せ手', from: { x: KIDO.x + -22, z: KIDO.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '梯子を掛ける寄せ手を破った' },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '台地の狼煙台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '乱破が台を狙う',
      say: [['白井入道', '狼煙台へ行け！　火を上げよ', 3]],
      waves: [
        { t: 6, say: ['上杉の乱破', '狼煙を上げさせるな！'], foes: [{ name: '上杉の乱破', from: { x: BEACON.x - 10, z: BEACON.z + 34 }, list: [uS(1), uA(6)] }] },
        { t: 36, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x - 36, z: BEACON.z + 10 }, list: [uA(5)] }] }],
      reward: '狼煙台を乱破から守った' },
    { kind: 'hold', at: KIDO, label: '外の木戸', obj: '木戸へ戻り、城門を守って寄せ手の大寄せを受け止める', r: 16, dur: 55, title: '大寄せ', sub: '輝虎の旗本が前へ出る',
      say: [['白井入道', 'あと一押しを凌げ。寄せ手は疲れておる', 3]],
      waves: [
        { t: 4, foes: [{ name: '上杉の大寄せ', from: { x: KIDO.x - 10, z: KIDO.z + 44 }, list: [uS(3), uA(14)] }] },
        { t: 30, foes: [{ name: '上杉の新手', from: { x: KIDO.x + 16, z: KIDO.z + 46 }, list: [uS(2), uA(12)] }] }],
      reward: '木戸で大寄せを受け止めた' },
    { kind: 'fight', at: UKE, limit: 140, obj: '木戸を開けて打って出、寄せ手の陣を崩す', title: '打って出', sub: '白井入道の指図で、城方が門を開いた',
      say: [['白井入道', '今じゃ！　門を開け。寄せ手の陣を突き崩せ！', 3.2]],
      foes: [{ name: '寄せ手の陣', from: { x: UKE.x, z: UKE.z + 10 }, list: [busho('上杉の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      // K652⑥ 逸話の段：北条の加勢の松田孫太郎康郷が朱の槍で打って出の先に立ち、寄せ手の中へ斬り込んだと伝わる（『関八州古戦録』B・佐倉の伝え C。細部は推）。本人は孫太郎の脇で、孫太郎を囲む上杉の槍の組頭を斬る
      later: [{ t: 16, say: ['松田孫太郎', '北条の加勢、松田孫太郎じゃ！　続け！'], foes: [{ name: '孫太郎を囲む槍', from: { x: UKE.x + 18, z: UKE.z + 4 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の槍の組頭' } }, uS(1), uA(5)] }] },
        { t: 22, say: ['白井入道', '孫太郎を囲ませるな！　あの組頭を斬れ！'], foes: [] }],
      reward: '寄せ手の陣を突き崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: UKE.x + 16, z: UKE.z + -10 }, obj: '崩れた陣の後ろの櫓で、射掛ける関東の弓を討て', limit: 90,
      say: [['組頭', '射掛ける関東の弓じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '射掛ける関東の弓', from: { x: UKE.x + 24, z: UKE.z + -20 }, list: [uS(2), uA(8), uB(3)] }],
      reward: '射掛ける関東の弓を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '寄せ手の陣が崩れた！　輝虎は旗本をまとめて退く支度じゃ', 3.2],
      ['白井入道', 'まだ終わらぬ。退く前に、もう一度だけ寄せて来るぞ', 3.2]] },
    { kind: 'hold', at: UKE, label: '寄せ手の陣', obj: '取った陣の跡で、輝虎の旗本の押し返しを受け止める', r: 16, dur: 70, limit: 110, title: '押し返し', sub: '輝虎の旗本が前へ出る',
      say: [['組頭', '旗本じゃ。固まって受けよ', 3]],
      waves: [
        { t: 3, foes: [{ name: '輝虎の旗本', from: { x: UKE.x - 6, z: UKE.z + 44 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の旗本の組頭' } }, uS(4), uA(14)] }] },
        { t: 32, say: ['見張り', '騎馬じゃ！'], foes: [{ name: '上杉の騎馬', from: { x: UKE.x + 36, z: UKE.z + 34 }, list: [{ type: 'cavalry', n: 4 }, uS(2), uA(8)] }] }],
      reward: '輝虎の旗本の押し返しを受け止めた' },
    { kind: 'fight', at: { x: -30, z: 90 }, limit: 140, obj: '退く寄せ手の殿を追い、囲みを解かせて臼井から追い払う', title: '追い', sub: '関東の諸将が散って退く',
      say: [['白井入道', '追え。二度と臼井に寄せぬように', 3]],
      foes: [{ name: '寄せ手の殿', from: { x: -36, z: 102 }, list: [busho('関東の侍大将', { mustLive: false, invuln: false }), uS(3), uA(16), uB(3)] }],
      reward: '寄せ手の殿を追い払った' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: -16, z: 102 }, obj: '退く道の辻で、火矢を捨てて逃げる寄せ手を払え', limit: 90,
      say: [['組頭', '火矢を捨てて逃げる寄せ手じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '火矢を捨てて逃げる寄せ手', from: { x: -8, z: 92 }, list: [uS(2), uA(10)] }],
      reward: '火矢を捨てて逃げる寄せ手を破った' },
    { kind: 'hold', at: KIDO, label: '外の木戸', obj: '木戸へ戻り、退き際に火矢を射掛ける寄せ手を払う', r: 16, dur: 60, limit: 100, title: '火矢', sub: '寄せ手が退き際に火矢を射る',
      say: [['白井入道', '火を消せ。火矢の弓衆を払え', 3]],
      waves: [
        { t: 3, foes: [{ name: '火矢の弓衆', from: { x: KIDO.x + 20, z: KIDO.z + 40 }, list: [uS(2), uB(8), uA(6)] }] },
        { t: 30, say: ['見張り', '槍が来る！'], foes: [{ name: '寄せ手の槍', from: { x: KIDO.x - 20, z: KIDO.z + 40 }, list: [uS(2), uA(12)] }] }],
      reward: '火矢の弓衆を払い、城を守った' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '臼井城を守り抜いた', sub: '上杉の寄せ手は大きな損を出し、囲みを解いた', award: '小さな城で上杉の大軍を退けた',
    say: [['白井入道', '城は小さくとも、守りようで落ちぬ', 3.2],
      ['組頭', '松田孫太郎の朱の槍、見事であった', 3],
      ['組頭', '関東の諸将が、こぞって北条に付くぞ', 3]],
  },
}), { plan: USUI_PLAN, at: { x: 0, z: -72 }, lift: 0, team: 0, life: false });
export default h13_usui;
