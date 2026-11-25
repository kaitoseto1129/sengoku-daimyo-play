// 北条家編 十四戦目「八王子城の戦い」（天正十八年〔1590〕六月二十三日・武蔵国 八王子城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t11_hachioji の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。
//   史実：城主の北条氏照は小田原に籠もっており、城は横地監物・狩野一庵らの少ない兵と、近くの村の者が守った。
//   前田利家・上杉景勝の北国勢が霧の夜明けに攻め、城は一日で落ちた（八王子市の解説 C・『関八州古戦録』B）。
//   主人公は横地監物の組。①山下曲輪の口で受ける ②御主殿の門で受ける ③横地様と山の奥の道へ落ちる（負け戦・落城）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const HOKKOKU = { flag: 'toyotomi', armor: 0x3a2a1e };
const SPAWN = { x: 0, z: 40 };
const SANKA = { x: 0, z: 70 };        // 山下曲輪の口
const GOSHUDEN = { x: -20, z: 10 };   // 御主殿の門
const OKU = { x: -30, z: -80 };       // 山の奥の道

export const h08_hachioji = lightBattle({
  id: 'h08_hachioji',
  date: '天正十八年（1590）六月二十三日　夏・霧　武蔵国 八王子城',
  intro: '殿の氏照様は小田原におられる。城に残るのは少ない兵と村の者だけ。霧の中を、北国勢が来る。',
  history: '天正十八年（1590）六月、城主の北条氏照が小田原に籠もる間、八王子城は横地監物らの少ない兵と近くの村の者が守った。前田利家・上杉景勝の北国勢が霧の夜明けに攻め、城は一日で落ちた。',
  sides: { a: { name: '八王子城の城方', mon: 'hojo', faction: 'hojo' }, b: { name: '前田利家・上杉景勝の北国勢', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 3000, b: 15000 },
  allyLook: HOJO, foeLook: HOKKOKU,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1592, time: 'morning', fogFar: 300, sky: { mist: true },
    river: [[-220, 20], [-100, 26], [0, 22], [100, 28], [220, 24]], riverW: 6, riverDepth: 0.3,
    hills: [[-30, -60, 70, 34], [60, -30, 50, 18]],
    paths: [{ pts: [[0, 190], [0, 70], [-20, 10], [-30, -80]], w: 3 }],
    groves: [{ x: 60, z: 60, r: 30, n: 34, kind: 'sugi' }, { x: -90, z: 40, r: 30, n: 34, kind: 'sugi' }],
    trees: 620, tufts: 1500,
  },
  allies: [
    { name: '横地監物の手', at: { x: GOSHUDEN.x + 10, z: GOSHUDEN.z - 10 }, fixed: true, list: [busho('横地監物'), uS(3), uA(6)] },
    { name: '山下曲輪の足軽', at: { x: SANKA.x - 10, z: SANKA.z - 6 }, list: [uS(2), uA(12)] },
    { name: '御主殿の守り', at: { x: GOSHUDEN.x - 10, z: GOSHUDEN.z - 4 }, list: [uS(2), uA(10)] },
    { name: '村の者', at: { x: SANKA.x + 12, z: SANKA.z - 6 }, list: [uA(10)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z - 8 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['横地監物', '霧の向こうに北国勢じゃ。数は知れぬ', 3],
      ['組頭', '山下の口で受ける。村の者を前に出すな', 3]] },
    { kind: 'hold', at: SANKA, label: '山下曲輪', obj: '山下曲輪の口で、霧から出て来る寄せ手を受け止める', r: 16, dur: 80, title: '山下曲輪', sub: '霧の中から前田の兵が現れる',
      say: [['前田の侍', '城は手薄じゃ！　一気に揉み潰せ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '前田の先手', from: { x: SANKA.x - 6, z: SANKA.z + 44 }, list: [{ type: 'samurai', n: 1, o: { name: '前田の組頭 奥村' } }, uS(3), uA(20)] }] },
        { t: 34, say: ['見張り', '脇の沢からも来る！'], foes: [{ name: '沢の寄せ手', from: { x: SANKA.x + 34, z: SANKA.z + 30 }, list: [uS(2), uA(14)] }] },
        { t: 60, foes: [{ name: '前田の鉄砲', from: { x: SANKA.x - 30, z: SANKA.z + 36 }, list: [uS(1), uG(8)] }] }],
      reward: '山下曲輪の口で寄せ手を受け止めた' },
    { kind: 'hold', at: GOSHUDEN, label: '御主殿', obj: '御主殿の門まで退き、上杉の寄せ手を受ける', r: 16, dur: 70, title: '御主殿', sub: '山下が破られた',
      say: [['使番', '山下が破られた！　御主殿へ退け！', 3]],
      waves: [
        { t: 4, foes: [{ name: '上杉景勝の手', from: { x: GOSHUDEN.x - 6, z: GOSHUDEN.z + 44 }, list: [uS(2), uA(14)] }] },
        { t: 36, foes: [{ name: '上杉の二の手', from: { x: GOSHUDEN.x + 26, z: GOSHUDEN.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 藤田' } }, uS(1), uA(10)] }] }],
      reward: '御主殿の門で寄せ手を受けた' },
    { kind: 'fight', at: OKU, limit: 140, obj: '山の奥の道を塞ぐ兵を崩し、横地様と落ちる', title: '山の奥へ', sub: '城は落ちる',
      say: [['横地監物', '……ここまでじゃ。生きて殿に城の最後を伝えよ。奥の道へ', 3.4]],
      foes: [{ name: '奥の道の寄せ手', from: { x: OKU.x, z: OKU.z - 10 }, list: [busho('前田の侍大将', { mustLive: false, invuln: false }), uS(2), uA(14)] }],
      reward: '山の奥の道を開いて落ちた' },
  ],
  win: {
    banner: '八王子城の落城', sub: '城は一日で落ちた。山の奥へ落ち延びた', award: '落城の中を落ち延びた',
    say: [['横地監物', '城は守れなんだ。じゃが、守った者がいたことは伝えよ', 3.4],
      ['組頭', '小田原へ行くぞ。殿に伝えねばならぬ', 3]],
  },
});
export default h08_hachioji;
