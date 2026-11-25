// 北条家編 十二戦目「山中城の戦い」（天正十八年〔1590〕三月二十九日・伊豆国 山中城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t09_yamanaka の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。
//   史実：豊臣秀次を大将に七万ほどが、松田康長・北条氏勝ら四千ほどの守る山中城（箱根の西の坂）を攻め、城は半日で落ちた。
//   岱崎出丸の間宮康俊、城将の松田康長は討死し、北条氏勝は囲みを抜けて玉縄城へ退いた（三島市の解説 C・『北条五代記』B）。
//   主人公は氏勝の組。①岱崎出丸で寄せ手を受ける ②三の丸の門で受ける ③氏勝の退き道を開く（負け戦・落城）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TOYO = { flag: 'toyotomi', armor: 0x3a2a1e };
const SPAWN = { x: 0, z: 40 };
const DEMARU = { x: -30, z: 70 };     // 岱崎出丸
const SANNO = { x: 0, z: 10 };        // 三の丸の門
const NIGE = { x: 20, z: -80 };       // 北の退き道（箱根の峠へ）

export const h15_yamanaka = lightBattle({
  id: 'h15_yamanaka',
  date: '天正十八年（1590）三月二十九日　春・晴れ　伊豆国 山中城',
  intro: '箱根の西の山中城。秀次の七万が坂を上って来る。守りは四千。',
  history: '天正十八年（1590）三月、豊臣秀次を大将に七万ほどが、北条の山中城を攻めた。守りは松田康長・北条氏勝ら四千ほど。岱崎出丸の間宮康俊、城将の松田康長は討死し、城は半日で落ちた。北条氏勝は囲みを抜けて玉縄城へ退いた。',
  sides: { a: { name: '山中城の城方', mon: 'hojo', faction: 'hojo' }, b: { name: '豊臣秀次の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 4000, b: 70000 },
  allyLook: HOJO, foeLook: TOYO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1590, time: 'morning', fogFar: 380, sky: { mist: true },
    hills: [[0, -60, 90, 30], [-60, 70, 30, 6], [80, 40, 50, 12]],
    paths: [{ pts: [[0, 190], [0, 120], [0, 10], [20, -80]], w: 3 }, { pts: [[0, 60], [-30, 70]], w: 2 }],
    groves: [{ x: -90, z: 0, r: 30, n: 34, kind: 'sugi' }, { x: 90, z: -20, r: 30, n: 34, kind: 'sugi' }],
    trees: 560, tufts: 1600,
  },
  allies: [
    { name: '間宮康俊の手', at: { x: DEMARU.x, z: DEMARU.z - 8 }, list: [busho('間宮康俊', { mustLive: false, invuln: false }), uS(3), uA(12)] },
    { name: '北条氏勝の旗本', at: { x: SANNO.x + 10, z: SANNO.z - 12 }, fixed: true, list: [busho('北条氏勝'), uS(4), uA(6)] },
    { name: '城の鉄砲衆', at: { x: DEMARU.x + 10, z: DEMARU.z - 6 }, list: [uS(1), uG(10)] },
    { name: '三の丸の足軽', at: { x: SANNO.x - 8, z: SANNO.z - 4 }, list: [uS(2), uA(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏勝', '城はまだ作りかけじゃ。じゃが、ここで止めねば箱根が抜かれる', 3.4],
      ['組頭', '岱崎の出丸へ行け。間宮様の手に加われ', 3]] },
    { kind: 'hold', at: DEMARU, label: '岱崎出丸', obj: '岱崎出丸で、坂を上る寄せ手を受け止める', r: 16, dur: 80, title: '岱崎出丸', sub: '豊臣の旗が坂を埋めて上って来る',
      say: [['間宮康俊', '撃て！　坂の上はわしらじゃ！', 3]],
      waves: [
        { t: 3, say: ['豊臣の侍', '出丸を揉み潰せ！'], foes: [{ name: '一柳直末の手', from: { x: DEMARU.x - 6, z: DEMARU.z + 44 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 一柳' } }, uS(2), uA(14)] }] },
        { t: 34, say: ['見張り', '新手じゃ！　数が知れぬ！'], foes: [{ name: '中村一氏の手', from: { x: DEMARU.x + 26, z: DEMARU.z + 40 }, list: [uS(1), uA(10)] }] },
        { t: 60, foes: [{ name: '豊臣の鉄砲', from: { x: DEMARU.x - 30, z: DEMARU.z + 36 }, list: [uS(1), uG(8)] }] }],
      reward: '岱崎出丸で寄せ手を受け止めた' },
    { kind: 'hold', at: SANNO, label: '三の丸の門', obj: '三の丸の門まで退き、門の前で寄せ手を受ける', r: 16, dur: 70, title: '三の丸', sub: '出丸が落ちた。間宮様、お討死',
      say: [['使番', '出丸が落ちた！　三の丸へ退け！', 3]],
      waves: [
        { t: 4, foes: [{ name: '秀次の寄せ手', from: { x: SANNO.x - 6, z: SANNO.z + 44 }, list: [uS(2), uA(14)] }] },
        { t: 36, foes: [{ name: '秀次の二の手', from: { x: SANNO.x + 26, z: SANNO.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 渡辺' } }, uS(1), uA(10)] }] }],
      reward: '三の丸の門で寄せ手を受けた' },
    { kind: 'fight', at: NIGE, limit: 140, obj: '北の退き道を塞ぐ豊臣の手を崩し、氏勝様を落とす', title: '落ちる道', sub: '松田様、お討死。城は落ちる',
      say: [['北条氏勝', '……城はもたぬ。玉縄へ落ちる。道を開け', 3.2]],
      foes: [{ name: '退き道の豊臣の手', from: { x: NIGE.x, z: NIGE.z - 10 }, list: [busho('豊臣の侍大将', { mustLive: false, invuln: false }), uS(3), uA(20)] }],
      reward: '退き道を開き、氏勝を落とした' },
  ],
  win: {
    banner: '山中城の落城', sub: '城は半日で落ちたが、氏勝は玉縄へ落ちた', award: '落城の中で氏勝を落とした',
    say: [['北条氏勝', '間宮も松田も死んだ。わしは生きて、玉縄を守る', 3.4],
      ['組頭', '箱根が抜かれた。次は小田原じゃ', 3]],
  },
});
export default h15_yamanaka;
