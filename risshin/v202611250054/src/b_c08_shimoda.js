// 長宗我部家編 十二「下田城の戦い」（天正十八年〔1590〕四月・伊豆国 下田城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：小田原の役で、豊臣の水軍（長宗我部元親・九鬼嘉隆・脇坂安治ら）は伊豆の下田城を海から囲んだ。城将の清水康英は五十日ほど守って城を開いた
//   （『北条五代記』B・下田市の解説 C。元親の水軍の参加は C・兵の数は推）。
// 仕組み：一領具足の呼び集め（浜に上げた舟の陰の舟子を、法螺で呼び集める形）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const HOJO = { flag: 'hojo', armor: 0x2e2a26 };
const coast = (x) => -86 + Math.sin(x * 0.02) * 4;   // 南の海の岸（z がこれより小さい所は海）
const SPAWN = { x: 0, z: -58 };
const HORA = { x: 30, z: -66 };     // 法螺の台（浜の岩）
const SAKU = { x: -4, z: 4 };       // 浜の柵
const KUCHI = { x: 6, z: 30 };      // 城の下の口
const OTE = { x: 0, z: 80 };        // 下田城の大手

export const c08_shimoda = chosoBattle({
  id: 'c08_shimoda',
  date: '天正十八年（1590）四月　朝　伊豆国 下田',
  intro: '小田原の北条を攻める戦。長宗我部の舟は、伊豆の下田の浜に着いた。舟の陰に土佐の舟子たち。山の上に北条の下田城。',
  history: '天正十八年（1590）、豊臣秀吉の小田原攻めで、長宗我部元親は豊臣の水軍に加わった。水軍は伊豆の下田城を海から囲み、城将の清水康英は五十日ほど守った末に城を開いた（元親の持ち場と兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '北条の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 2500, b: 600 },
  foeLook: HOJO,
  noMarch: true,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1590, time: 'morning', fogFar: 420,
    coast,
    sea: [{ pts: [[-320, -160], [0, -162], [320, -160]], w: 120, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[OTE.x, OTE.z + 30, 50, 22], [-120, 40, 60, 20], [130, 50, 60, 22], [0, 180, 90, 26]],
    paths: [{ pts: [[0, -70], [-4, 4], [6, 30], [0, 80], [0, 130]], w: 2.8 }],
    groves: [{ x: -120, z: 40, r: 30, n: 30 }, { x: 130, z: 50, r: 30, n: 30 }, { x: OTE.x + 40, z: OTE.z + 20, r: 24, n: 22 }],
    trees: 400, tufts: 1400,
    tint(x, z, h, c) {
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.14 * k, c.g * (1 - k) + 0.18 * k, c.b * (1 - k) + 0.2 * k); return; }
      if (z < cz + 12) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.6 * k, c.g * (1 - k) + 0.55 * k, c.b * (1 - k) + 0.45 * k); }
    },
  },
  fields: [{ at: { x: -50, z: -70 }, far: 0 }, { at: { x: 60, z: -72 }, far: 1 }, { at: { x: -90, z: -72 }, far: 2 }, { at: { x: 96, z: -74 }, far: 3 }],
  callSay: ['長宗我部元親', '舟子も槍を取れ！　土佐の者は皆、一領具足じゃ', '……遅い。集まった者で上がる'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 4 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '長宗我部盛親の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 2 }, list: [busho('長宗我部盛親'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '海から城を囲む。浜の柵を破って、城の下まで寄せよ', 3.2],
      ['組頭', '舟子らは舟の陰じゃ。浜の岩で法螺を吹け', 3],
      ['長宗我部盛親', '父上、北条の兵は少ない。されど城は固うござる', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '浜の岩へ走り、舟子を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの岩じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: SAKU, obj: '浜の柵の北条の兵を破る', title: '下田', sub: '浜の柵に北条の兵',
      say: [['長宗我部元親', '上がれ！　柵を破れ！', 2.6], ['北条の侍', '海から来たぞ！　浜で止めよ！', 3]],
      foes: [{ name: '北条の浜の兵', from: { x: SAKU.x + 4, z: SAKU.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['北条の侍', '鉄砲、浜を撃て！'], foes: [{ name: '北条の鉄砲', from: { x: SAKU.x + 20, z: SAKU.z + 18 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '浜の柵を破った' },
    { kind: 'hold', at: KUCHI, label: '城の下の口', obj: '城の下の口を守り、城兵の打って出を受ける', r: 16, dur: 60, title: '城の下', sub: '北条の城兵が打って出る',
      say: [['長宗我部盛親', '城の下を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['北条の侍', '打って出よ！'], foes: [{ name: '北条の城兵', from: { x: KUCHI.x - 8, z: KUCHI.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['北条の侍', '二の手、続け！'], foes: [{ name: '北条の城兵の二', from: { x: KUCHI.x + 18, z: KUCHI.z + 30 }, list: [uS(2), uA(8), uB(3)] }] }],
      reward: '城の下の口を守った' },
    { kind: 'fight', at: OTE, obj: '下田城の大手の兵を崩す', title: '大手', sub: '清水康英の兵が踏みとどまる', max: 140,
      say: [['長宗我部元親', '大手じゃ！　押せ！', 3]],
      foes: [{ name: '清水康英の備', from: { x: OTE.x, z: OTE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '清水康英', horse: false } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['北条の侍', '大手を守れ！'], foes: [{ name: '北条の大手の兵', from: { x: OTE.x - 14, z: OTE.z + 16 }, list: [uS(2), uA(8)] }] }],
      reward: '下田城の大手を崩した' },
  ],
  win: {
    banner: '下田の勝ち', sub: '北条の兵が城へ退く', award: '下田城の大手を崩した',
    say: [['組頭', '北条の兵が城へ逃げ込んだ。あとは囲むだけじゃ', 3.2],
      ['長宗我部元親', '土佐の舟子も、よう働いた', 3],
      ['長宗我部盛親', '小田原も、もう長くはございますまい', 3]],
  },
});
export default c08_shimoda;
