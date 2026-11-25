// 北条家編 七戦目「小田原城攻め（武田信玄）」（永禄十二年〔1569〕十月一日〜四日・相模国 小田原）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：駿河をめぐって北条と手を切った武田信玄は、碓氷峠から武蔵を抜けて小田原城を四日囲み、城下に火を放って引き揚げた。
//   氏康・氏政は城を出ず、氏照・氏邦は帰り道の三増峠で待ち伏せた（『甲陽軍鑑』B・『北条五代記』B）。
//   城の絵は h02 と同じ castles/odawara1561.js（味方の城）。狼煙の網（hojo_noroshi.js）：東の丘の台に火を上げると玉縄の後詰が来て、城下の火付けを追う（推）
import { withCastle } from './light_castle.js';
import { ODAWARA1561_PLAN } from './castles/odawara1561.js';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const GATE = { x: 20, z: 44 };
const SPAWN = { x: 20, z: 52 };
const BEACON = { x: 112, z: 30 };
const TOWN = { x: 10, z: -20 };      // 城下の口（武田の火付け）
const N = noroshi({
  beacon: BEACON, beaconStep: 2,
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
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏政', '信玄は城を囲んでも長くはおらぬ。兵糧が続かぬ', 3.2],
      ['組頭', 'まずは門じゃ。武田の先手を受け止めよ', 3]] },
    { kind: 'hold', at: GATE, label: '蓮池門', obj: '蓮池門の前で、武田の先手を受け止める', r: 16, dur: 55, title: '蓮池門', sub: '武田の先手が門へ寄せる',
      say: [['武田の侍', '北条の門を叩け！', 3]],
      waves: [
        { t: 2, foes: [{ name: '武田の先手', from: { x: GATE.x - 4, z: GATE.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭 小幡' } }, uS(3), uA(14)] }] },
        { t: 30, say: ['見張り', '二の手が来る！'], foes: [{ name: '武田の二の手', from: { x: GATE.x + 14, z: GATE.z - 44 }, list: [uS(2), uA(12)] }] }],
      reward: '蓮池門の前で武田の先手を受け止めた' },
    { kind: 'move', at: BEACON, label: '狼煙台', obj: '東の丘の狼煙台へ走る', r: 9, max: 100,
      say: [['北条氏政', '狼煙台へ行け！　武田の乱破が来るぞ', 3]] },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '狼煙台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '乱破が台を狙う',
      say: [['組頭', '台から離れるな！　火が育つまで守れ！', 3]],
      waves: [
        { t: 3, say: ['武田の乱破', '狼煙を上げさせるな！'], foes: [{ name: '武田の乱破', from: { x: BEACON.x + 4, z: BEACON.z - 30 }, list: [uS(1), uA(8)] }] },
        { t: 30, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x + 30, z: BEACON.z + 26 }, list: [uS(1), uA(6)] }] }],
      reward: '狼煙台を乱破から守った' },
    { kind: 'fight', at: TOWN, limit: 140, obj: '城下の口で、町に火を付ける武田の兵を追う', title: '城下の火', sub: '武田が城下に火を放った',
      say: [['北条氏政', '城下が燃える！　火付けを追い払え！', 3]],
      foes: [{ name: '城下の武田の手', from: { x: TOWN.x, z: TOWN.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の侍大将', horse: true } }, uS(3), uA(16)] }],
      later: [{ t: 30, say: ['武田の侍', '引き揚げじゃ！　殿を残せ！'], foes: [{ name: '武田の殿', from: { x: TOWN.x - 16, z: TOWN.z - 24 }, list: [uS(2), uA(12)] }] }],
      reward: '城下の口から武田を追った' },
  ],
  setup: N.setup, update: N.update,
  win: {
    banner: '小田原を守り抜いた', sub: '信玄は四日で囲みを解き、甲斐へ向かった', award: '小田原城で武田を凌いだ',
    say: [['北条氏政', '武田は帰る。三増峠で氏照と氏邦が待っておる', 3.4],
      ['組頭', '城下の火を消せ。町の者を助けよ', 3]],
  },
}), { plan: ODAWARA1561_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 0, life: false });
export default h04_odawara_t;
