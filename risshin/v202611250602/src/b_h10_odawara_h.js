// 北条家編 十五戦目「小田原の陣」（天正十八年〔1590〕四月〜七月五日・相模国 小田原）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t12_odawara・伊達編 e06_odawara の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。城の絵は h02 と同じ castles/odawara1561.js。
//   史実：豊臣秀吉は二十万ほどで小田原を囲み、石垣山に城を築いた。北条は惣構えに籠もり、太田氏房は蒲生氏郷の陣へ夜討ちをかけた。
//   支城が次々と落ち、七月五日に北条氏直は城を出て降った（小田原市の解説 C・『北条五代記』B。夜討ちの細部は推）。
//   主人公は氏直の使番の組。①惣構えの早川口で受ける ②太田氏房と夜討ち ③惣構えの大寄せを受ける。終わりは開城（降る場面）
import { withCastle } from './light_castle.js';
import { ODAWARA1561_PLAN } from './castles/odawara1561.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TOYO = { flag: 'toyotomi', armor: 0x3a2a1e };
const GATE = { x: 20, z: 44 };        // 惣構えの早川口
const SPAWN = { x: 20, z: 52 };
const GAMO = { x: 10, z: -30 };       // 蒲生氏郷の陣

export const h10_odawara_h = withCastle(lightBattle({
  id: 'h10_odawara_h',
  date: '天正十八年（1590）六月　夏・晴れ　相模国 小田原',
  intro: '秀吉の二十万が小田原を囲んだ。支城は次々と落ちる。三度目の籠城。今度は、どこからも後詰は来ない。',
  history: '天正十八年（1590）、豊臣秀吉は二十万ほどで小田原を囲み、石垣山に城を築いた。北条は惣構えに籠もり、太田氏房は蒲生氏郷の陣へ夜討ちをかけた。支城が次々と落ち、七月五日に北条氏直は城を出て降った。北条の五代は、ここで終わった。',
  sides: { a: { name: '北条氏直の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '豊臣秀吉の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 50000, b: 200000 },
  allyLook: HOJO, foeLook: TOYO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1593, time: 'day', fogFar: 420,
    river: [[-200, -96], [-80, -92], [0, -98], [100, -90], [200, -96]], riverW: 16, riverDepth: 0.5,
    hills: [[30, 110, 60, 24], [-60, 130, 60, 18], [-120, -40, 60, 30]],
    paths: [{ pts: [[20, 44], [10, -30], [-10, -60], [-30, -90]], w: 3 }],
    groves: [{ x: -60, z: 130, r: 30, n: 30 }, { x: 150, z: 70, r: 26, n: 24 }],
    trees: 400, tufts: 1800,
  },
  allies: [
    { name: '北条氏直の旗本', at: { x: GATE.x, z: GATE.z + 12 }, fixed: true, list: [busho('北条氏直'), uS(4), uA(6)] },
    { name: '太田氏房の手', at: { x: GATE.x - 12, z: GATE.z + 2 }, list: [busho('太田氏房'), uS(2), uA(12)] },
    { name: '早川口の鉄砲衆', at: { x: GATE.x + 12, z: GATE.z + 4 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏直', '景虎も信玄も、この城は落とせなんだ。秀吉も同じじゃ', 3.2],
      ['組頭', '……じゃが、支城の狼煙は一つも上がらぬ', 3]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '惣構えの早川口で、豊臣の寄せ手を受け止める', r: 16, dur: 90, title: '早川口', sub: '豊臣の兵が惣構えの堀へ寄せる',
      say: [['豊臣の侍', '堀を越えよ！　北条を追い詰めよ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '豊臣の先手', from: { x: GATE.x - 4, z: GATE.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 堀' } }, uS(3), uA(18)] }] },
        { t: 34, say: ['見張り', '鉄砲が並んだ！'], foes: [{ name: '豊臣の鉄砲', from: { x: GATE.x + 26, z: GATE.z - 36 }, list: [uS(1), uG(8)] }] },
        { t: 60, say: ['組頭', '堀を渡って来たぞ！　槍で落とせ！'], foes: [{ name: '堀を渡る豊臣の手', from: { x: GATE.x - 24, z: GATE.z - 38 }, list: [uS(2), uA(14)] }] }],
      reward: '早川口で寄せ手を受け止めた' },
    { kind: 'fight', at: GAMO, limit: 150, obj: '太田氏房と夜討ちに出て、蒲生の陣を突く', title: '夜討ち', sub: '惣構えの外へ打って出る',
      say: [['太田氏房', '籠もるだけでは士気が落ちる。蒲生の陣を突くぞ', 3.2]],
      foes: [{ name: '蒲生氏郷の陣', from: { x: GAMO.x, z: GAMO.z - 10 }, list: [busho('蒲生の侍大将', { mustLive: false, invuln: false }), uS(4), uA(20)] }],
      later: [{ t: 30, say: ['蒲生の侍', '夜討ちじゃ！　陣を固めよ！'], foes: [{ name: '蒲生の二の手', from: { x: GAMO.x + 20, z: GAMO.z - 20 }, list: [uS(2), uA(12)] }] }],
      reward: '夜討ちで蒲生の陣を突いた' },
    { kind: 'hold', at: GATE, label: '早川口', obj: '早川口へ戻り、豊臣の大寄せを受け止める', r: 16, dur: 90, title: '石垣山', sub: '一夜で城が現れた',
      say: [['見張り', '石垣山に城が……一夜で建ったぞ！', 3.2], ['北条氏直', '動じるな。持ち場を守れ', 3]],
      waves: [
        { t: 4, foes: [{ name: '豊臣の大寄せ', from: { x: GATE.x - 10, z: GATE.z - 44 }, list: [uS(3), uA(16)] }] },
        { t: 34, foes: [{ name: '豊臣の新手', from: { x: GATE.x + 16, z: GATE.z - 46 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 池田' } }, uS(2), uA(12)] }] },
        { t: 62, say: ['見張り', '三の手じゃ！'], foes: [{ name: '豊臣の三の手', from: { x: GATE.x + 2, z: GATE.z - 48 }, list: [uS(2), uA(12)] }] }],
      reward: '早川口で大寄せを受け止めた' },
  ],
  win: {
    banner: '小田原の開城', sub: '支城はすべて落ち、氏直は城を出て降った', award: '小田原の籠城を最後まで務めた',
    say: [['北条氏直', '城兵の命と引き換えに、わしが城を出る', 3.4],
      ['組頭', '早雲様から五代。城は最後まで落ちなんだ。開いたのじゃ', 3.4]],
  },
}), { plan: ODAWARA1561_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 0, life: false });
export default h10_odawara_h;
