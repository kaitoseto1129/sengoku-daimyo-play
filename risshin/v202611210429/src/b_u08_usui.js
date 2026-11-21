// 上杉編 八戦目「臼井城の戦い」（永禄九年〔1566〕三月・下総国 臼井城）。軽い型（light_battle.js）
//   史実：上杉輝虎は関東の諸将を率いて、北条方の原胤貞が守る下総の臼井城（いま千葉県佐倉市臼井）を囲んだ。
//   城には北条の加勢の白井入道（白井胤治）が入って守りを指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、退いた。
//   この負けの後、関東の諸将の多くが北条の側へ移った。上杉の関東での勢いが落ちる切っ掛けになった戦い。
//   ※ 城攻めの細かな経過は軍記によって違う。ここでは「城下へ寄る→外の木戸を攻める→城方の打って出るのを受ける→囲みを解いて退く殿」の形に推した。
//   出所：Wikipedia「臼井城の戦い」・佐倉市の臼井城跡の案内。天気は docs/weather_takeda_uesugi.md（春の曇り）。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HOJO = { flag: 'hojo', armor: 0x2e2a26 };
const SPAWN = { x: 0, z: 160 };
const NUMA = [[-220, -150], [-110, -160], [0, -154], [110, -162], [220, -156]];   // 城の北の印旛沼の岸（城の後ろ）
const JOKA = { x: 10, z: 80 };          // 臼井の城下の口
const KIDO = { x: 0, z: 0 };            // 外の木戸（城の南の口）
const UKE = { x: 6, z: 30 };            // 木戸の前の陣（打って出る城方を受ける所）
const SHINGARI = { x: -10, z: 120 };    // 囲みを解いて退く道の殿の場

export const u08_usui = lightBattle({
  id: 'u08_usui',
  date: '永禄九年（1566）三月　春・曇り　下総国 臼井城',
  intro: '上杉輝虎は関東の諸将を率いて、北条方の臼井城を囲んだ。城には北条の加勢、白井入道が入っている。',
  history: '永禄九年（1566）、上杉輝虎は関東の諸将を率いて下総の臼井城を囲んだ。城を守る原胤貞のもとに北条の加勢の白井入道が入って指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、退いた。この後、関東の諸将の多くが北条の側へ移った。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '臼井城の城方（原・北条）', mon: 'hojo', faction: 'hojo' } },
  force: { a: 15000, b: 2000 },
  allyLook: UESUGI, foeLook: HOJO,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1566, time: 'day', fogFar: 380,
    river: NUMA, riverW: 30, riverDepth: 1.2,
    hills: [[0, -60, 55, 14], [-70, -40, 40, 9], [70, -50, 40, 9], [-150, 100, 60, 6]],
    trees: 560, tufts: 2000,
  },
  allies: [
    { name: '上杉輝虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z + 12 }, fixed: true, list: [busho('上杉輝虎'), uS(6), uA(10)] },
    { name: '関東の諸将の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z - 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 26, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉輝虎', '臼井は小さな城じゃ。一気に揉み潰せ', 3.2],
      ['関東の侍', '城には北条の白井入道が入ったと聞きまする。油断はなりませぬ', 3.4]] },
    { kind: 'fight', at: JOKA, obj: '臼井の城下の口で、城方の足軽を追い払う', title: '臼井の城下', sub: '城下の口に城方の足軽が出て構える',
      say: [['組頭', '城下へ入るぞ！　口を塞ぐ足軽を蹴散らせ！', 3]],
      foes: [
        { name: '城下の口の足軽', from: { x: JOKA.x - 4, z: JOKA.z - 12 }, list: [uS(2), uA(22)] },
        { name: '城下の弓', from: { x: JOKA.x + 18, z: JOKA.z - 18 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 25, say: ['組頭', '町家の陰からも出てくるぞ！'], foes: [{ name: '町家の陰の足軽', from: { x: JOKA.x + 26, z: JOKA.z - 6 }, list: [uS(1), uA(12)] }] }],
      reward: '臼井の城下の口を破った' },
    { kind: 'fight', at: KIDO, obj: '城の外の木戸へ寄せ、守りの兵を崩す', title: '外の木戸', sub: '城の南の木戸。上から矢と鉄砲が降る',
      say: [['上杉輝虎の使番', '殿より。木戸を破れ。城の内へ押し込め', 3.2]],
      foes: [
        { name: '木戸の守り', from: { x: KIDO.x, z: KIDO.z - 10 }, list: [uS(3), uA(24)] },
        { name: '木戸の鉄砲', from: { x: KIDO.x + 16, z: KIDO.z - 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '城の内から加勢が出てくる！'], foes: [{ name: '城の内の加勢', from: { x: KIDO.x - 24, z: KIDO.z - 18 }, list: [uS(2), uA(12)] }] }],
      reward: '外の木戸の守りを崩した' },
    { kind: 'hold', at: UKE, label: '木戸の前の陣', obj: '城方の打って出る兵を、木戸の前で受け止める', r: 18, dur: 80,
      title: '城方、打って出る', sub: '白井入道の指図で、城方が門を開いて打って出た',
      say: [['関東の侍', '城方が打って出たぞ！　白井入道の旗じゃ！', 3.2], ['組頭', '退くな！　陣を崩せば総崩れになる！', 3]],
      waves: [
        { t: 6, foes: [{ name: '打って出た城方', from: { x: UKE.x - 6, z: UKE.z - 40 }, list: [uS(4), uA(22)] }] },
        { t: 36, say: ['見張り', '脇の沼の道からも来るぞ！'], foes: [{ name: '沼の道の城方', from: { x: UKE.x + 40, z: UKE.z - 30 }, list: [uS(2), uA(14), uG(4)] }] }],
      reward: '木戸の前で城方の打って出るのを受け止めた' },
    { kind: 'fight', at: SHINGARI, obj: '囲みを解いて退く道で、追ってくる城方を止める', title: '退く道', sub: '寄せ手は大きな損を出し、輝虎は囲みを解いた',
      say: [['上杉輝虎', '……囲みを解く。この城は落ちぬ。殿の組は追手を止めよ', 3.4]],
      foes: [{ name: '城方の追手', from: { x: SHINGARI.x + 6, z: SHINGARI.z - 32 }, list: [uS(3), uA(26)] }],
      later: [{ t: 28, say: ['組頭', '北条の加勢の旗が追ってくる！'], foes: [{ name: '北条の加勢の追手', from: { x: SHINGARI.x - 26, z: SHINGARI.z - 30 }, list: [uS(2), uA(12)] }] }],
      reward: '退く道で城方の追手を止めた' },
  ],
  win: {
    banner: '囲みを解く', sub: '臼井城は落ちず、上杉の寄せ手は退いた', award: '負け戦の殿を務め、味方を退かせた',
    say: [['上杉輝虎の使番', '寄せ手の損は大きゅうございます。関東の者どもの顔色が変わりました', 3.4],
      ['上杉輝虎', '小さな城と侮った。この負けは、関東で長く響くぞ', 3.4]],
  },
});
export default u08_usui;
