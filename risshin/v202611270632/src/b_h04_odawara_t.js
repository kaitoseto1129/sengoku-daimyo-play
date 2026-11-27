// 北条家編 七戦目「小田原城攻め（武田信玄）」（永禄十二年〔1569〕十月一日〜四日・相模国 小田原）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：駿河をめぐって北条と手を切った武田信玄は、碓氷峠から武蔵を抜けて小田原城を四日囲み、城下に火を放って引き揚げた。
//   氏康・氏政は城を出ず、氏照・氏邦は帰り道の三増峠で待ち伏せた（『甲陽軍鑑』B・『北条五代記』B）。
//   城の絵は h02 と同じ castles/odawara1561.js（味方の城）。狼煙の網（hojo_noroshi.js）：東の丘の台に火を上げると玉縄の後詰が来て、城下の火付けを追う（推）
import { withCastle } from './light_castle.js';
import { ODAWARA1561_PLAN } from './castles/odawara1561.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const GATE = { x: 20, z: 44 };
const SPAWN = { x: 20, z: 52 };
const BEACON = { x: 112, z: 30 };
const TOWN = { x: 10, z: -20 };      // 城下の口（武田の火付け）
const N = noroshi({
  beacon: BEACON, beaconStep: 4,
  far: [{ x: 230, z: 120 }, { x: 330, z: 40 }],
  reliefFrom: { x: 150, z: -24 }, reliefTo: { x: 30, z: 14 }, reliefFace: -Math.PI / 2,
  relief: { name: '玉縄の後詰', list: [busho('北条綱成'), uS(4), uA(14), uG(4)], say: ['北条綱成', '玉縄の綱成、推参！　武田の背を突け！'], foeSay: ['武田の侍', '後ろに北条の旗！　支城から来たか！'] },
});

export const h04_odawara_t = withCastle(lightBattle({
  id: 'h04_odawara_t',
  date: '永禄十二年（1569）十月　秋・晴れ　相模国 小田原',
  intro: '武田信玄が小田原を囲んだ。八年前の景虎と同じく、城は出ない。守って、狼煙で支城を呼ぶ。',
  history: '永禄十二年（1569）十月、武田信玄は武蔵を抜けて小田原城を四日囲み、城下に火を放って引き揚げた。北条氏康・氏政は城を出ず、氏照・氏邦は帰り道の三増峠で武田を待ち伏せた。',
  sides: { a: { name: '北条氏康・氏政の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 12000, b: 20000 },
  allyLook: HOJO, foeLook: TAKEDA,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1569, time: 'day', autumn: true, fogFar: 420,
    river: [[-200, -96], [-80, -92], [0, -98], [100, -90], [200, -96]], riverW: 16, riverDepth: 0.5,
    hills: [[30, 110, 60, 24], [-60, 130, 60, 18], [124, 34, 40, 10]],
    paths: [{ pts: [[20, 44], [10, -20], [-10, -50], [-30, -80]], w: 3 }, { pts: [[20, 44], [70, 36], [112, 30]], w: 2 }],
    groves: [{ x: -60, z: 130, r: 30, n: 30 }, { x: 150, z: 70, r: 26, n: 24 }],
    trees: 400, tufts: 1800,
  },
  allies: [
    { name: '北条氏政の旗本', at: { x: GATE.x, z: GATE.z + 12 }, fixed: true, list: [busho('北条氏政'), uS(4), uA(6)] },
    { name: '蓮池門の足軽', at: { x: GATE.x - 10, z: GATE.z + 2 }, face: Math.PI, list: [uS(2), uA(12)] },
    { name: '門の鉄砲衆', at: { x: GATE.x + 12, z: GATE.z + 4 }, face: Math.PI, list: [uS(1), uG(8)] },
    { name: '狼煙番', at: { x: BEACON.x - 4, z: BEACON.z + 4 }, face: Math.PI, list: [uS(1), uA(5)] },
  ],
  steps: [
    // K721（11/26）要件書の流れ（上杉の大軍包囲と違い、武田は動きが速く陣替えが多い）：①進軍の報 ②住民を内へ ③先手が城下へ ④火の手 ⑤門を守る ⑥攻めきらず陣を変える ⑦物見 ⑧突然の撤退 ⑨追撃軍が出る ⑩三増峠へ追う
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['使番', '武田信玄、碓氷を越えて武蔵を抜け、小田原へ進軍！　足が速い。もう間近じゃ', 3.4],
      ['北条氏政', '信玄は城を囲んでも長くはおらぬ。兵糧が続かぬ。まずは町の者を内へ入れよ', 3.4]] },
    { kind: 'move', at: { x: GATE.x - 10, z: GATE.z - 18 }, label: '城下の口', obj: '城外の住民を城の内へ入れる', r: 12, max: 100,
      say: [['組頭', '武田が来る。町の者を内へ！　急げ！', 3]] },
    { kind: 'hold', at: GATE, label: '蓮池門', obj: '武田の先手が城下へ迫る。蓮池門の前で受け止める', r: 16, dur: 55, title: '蓮池門', sub: '武田の先手が門へ寄せる',
      say: [['武田の侍', '北条の門を叩け！', 3]],
      waves: [
        { t: 2, foes: [{ name: '武田の先手', from: { x: GATE.x - 4, z: GATE.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭 小幡' } }, uS(3), uA(14)] }] },
        { t: 30, say: ['見張り', '二の手が来る！'], foes: [{ name: '武田の二の手', from: { x: GATE.x + 14, z: GATE.z - 44 }, list: [uS(2), uA(12)] }] }],
      reward: '蓮池門の前で武田の先手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GATE.x + -16, z: GATE.z + -12 }, obj: '城門を守り、堀で竹束を押す武田の足軽を討て', limit: 90,
      say: [['組頭', '竹束を押す武田の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '竹束を押す武田の足軽', from: { x: GATE.x + -24, z: GATE.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '竹束を押す武田の足軽を破った' },
    { kind: 'move', at: BEACON, label: '狼煙台', obj: '東の丘の狼煙台へ走る', r: 9, max: 100,
      say: [['北条氏政', '狼煙台へ行け！　武田の乱破が来るぞ', 3]] },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '狼煙台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '乱破が台を狙う',
      say: [['組頭', '台から離れるな！　火が育つまで守れ！', 3]],
      waves: [
        { t: 3, say: ['武田の乱破', '狼煙を上げさせるな！'], foes: [{ name: '武田の乱破', from: { x: BEACON.x + 4, z: BEACON.z - 30 }, list: [uS(1), uA(8)] }] },
        { t: 30, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x + 30, z: BEACON.z + 26 }, list: [uS(1), uA(6)] }] }],
      reward: '狼煙台を乱破から守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BEACON.x + -14, z: BEACON.z + 16 }, obj: '丘の裏の道で、狼煙台を狙う武田の透波を討て', limit: 90,
      say: [['組頭', '狼煙台を狙う武田の透波じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '狼煙台を狙う武田の透波', from: { x: BEACON.x + -22, z: BEACON.z + 6 }, list: [uS(2), uA(10)] }],
      reward: '狼煙台を狙う武田の透波を破った' },
    { kind: 'fight', at: TOWN, limit: 140, obj: '城下の口で、町に火を付ける武田の兵を追う', title: '城下の火', sub: '武田が城下に火を放った',
      say: [['北条氏政', '城下が燃える！　火付けを追い払え！', 3]],
      foes: [{ name: '城下の武田の手', from: { x: TOWN.x, z: TOWN.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の侍大将', horse: true } }, uS(3), uA(16)] }],
      later: [{ t: 30, say: ['武田の侍', '引き揚げじゃ！　殿を残せ！'], foes: [{ name: '武田の殿', from: { x: TOWN.x - 16, z: TOWN.z - 24 }, list: [uS(2), uA(12)] }] }],
      reward: '城下の口から武田を追った' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TOWN.x + 18, z: TOWN.z + -14 }, obj: '城下の井戸の辺りで、火矢を射る武田の弓を討て', limit: 90,
      say: [['組頭', '火矢を射る武田の弓じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '火矢を射る武田の弓', from: { x: TOWN.x + 26, z: TOWN.z + -24 }, list: [uS(2), uA(8), uB(3)] }],
      reward: '火矢を射る武田の弓を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '武田の別手が、西の町屋にも火を付けて回っております！　備の置き所がまた替わった。攻めきるつもりはなさそうじゃ', 3.6],
      ['組頭', '火消しは後じゃ。付け火の兵を先に討て', 3]] },
    { kind: 'fight', at: { x: -66, z: -36 }, limit: 140, obj: '城下の西で、火を付けて回る武田の別手を討つ', title: '西の町屋', sub: '町屋が燃えている',
      say: [['武田の侍', '小田原の町を焼き払え！', 3]],
      foes: [{ name: '武田の付け火の手', from: { x: -72, z: -46 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭' } }, uS(3), uA(16)] }],
      later: [{ t: 30, say: ['見張り', '辻から武田の新手！'], foes: [{ name: '辻の武田', from: { x: -40, z: -60 }, list: [uS(2), uA(10), uB(3)] }] }],
      reward: '西の町屋の付け火の兵を討った' },
    { kind: 'hold', at: TOWN, label: '城下の口', obj: '城下の口へ戻り、陣を替えて押し返して来る武田を受け止める', r: 16, dur: 70, title: '押し返し', sub: '武田の備が退く前に一押しする',
      say: [['北条氏政', '武田は四日で退く支度じゃ。最後の一押しを受け切れ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '武田の備', from: { x: TOWN.x + 6, z: TOWN.z - 42 }, list: [uS(3), uA(16)] }] },
        // K652⑥ 逸話の段：小田原攻めには山県昌景の赤備えが加わり、城下の蓮池まで寄せた（『甲陽軍鑑』B）。本人は城下の口で、赤備えの侍大将を斬って止める
        { t: 32, say: ['見張り', '赤備えじゃ！　山県昌景の手が来る！'], foes: [{ name: '山県の赤備え', from: { x: TOWN.x + 36, z: TOWN.z - 34 }, list: [{ type: 'cavalry', n: 4 }, { type: 'samurai', n: 1, o: { name: '赤備えの侍大将', horse: true } }, uS(1), uA(8)] }] },
        { t: 38, say: ['北条氏政', '赤備えの大将を討て！　城下の口から先へ通すな！'], foes: [] }],
      reward: '城下の口で武田の一押しを受け切った' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [
      ['物見', '武田が突然、陣を払い始めました！　帰るつもりじゃ！', 3.2],
      ['北条氏政', '勝った、武田が退いた。……追撃軍を出せ。峠で叩く', 3.2]] },
    { kind: 'fight', at: { x: -24, z: -80 }, limit: 140, obj: '武田が退いた。追撃軍に加わり、酒匂川へ退く武田の殿を追う', title: '酒匂川', sub: '信玄は相模川の方へ退く',
      // K652⑥：信玄は囲みを解く時、城の前で勝鬨を上げさせて退いた（『甲陽軍鑑』B）
      say: [['武田の侍', 'えい、えい、おう！　勝鬨を上げて引き揚げよ！', 2.8], ['北条氏政', '勝鬨など上げさせておけ。追え！　三増の峠で兄上たちが待っておる', 3.4]],
      foes: [{ name: '武田の殿', from: { x: -30, z: -90 }, list: [busho('武田の殿の侍大将', { mustLive: false, invuln: false }), uS(4), uA(16), uG(3)] }],
      reward: '酒匂川で武田の殿を追った' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '小田原を守り抜いた', sub: '信玄は四日で囲みを解き、甲斐へ向かった', award: '小田原城で武田を凌いだ',
    say: [['北条氏政', '武田は帰る。三増峠で氏照と氏邦が待っておる', 3.4],
      ['北条氏政', '赤備えも勝鬨も、城の門は一つも破れなんだ', 3],
      ['組頭', '城下の火を消せ。町の者を助けよ', 3]],
  },
}), { plan: ODAWARA1561_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 0, life: false });
export default h04_odawara_t;
