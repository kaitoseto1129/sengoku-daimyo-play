// 上杉編 八戦目「臼井城の戦い」（永禄九年〔1566〕三月・下総国 臼井城）。軽い型（light_battle.js）
//   史実：上杉輝虎は関東の諸将を率いて、北条方の原胤貞が守る下総の臼井城（いま千葉県佐倉市臼井）を囲んだ。
//   城には北条の加勢の白井入道（白井胤治）が入って守りを指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、退いた。
//   この負けの後、関東の諸将の多くが北条の側へ移った。上杉の関東での勢いが落ちる切っ掛けになった戦い。
//   ※ 城攻めの細かな経過は軍記によって違う。ここでは「城下へ寄る→外の木戸を攻める→城方の打って出るのを受ける→囲みを解いて退く殿」の形に推した。
//   出所：Wikipedia「臼井城の戦い」・佐倉市の臼井城跡の案内。天気は docs/weather_takeda_uesugi.md（春の曇り）。くわしくは docs/chapter_uesugi.md
import { withCastle } from './light_castle.js';
import { USUI_PLAN } from './castles/usui.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HOJO = { flag: 'hojo', armor: 0x2e2a26 };
const SPAWN = { x: 0, z: 160 };
const NUMA = [[-220, -150], [-110, -160], [0, -154], [110, -162], [220, -156]];   // 城の北の印旛沼の岸（城の後ろ）
const JOKA = { x: 10, z: 80 };          // 臼井の城下の口
const KIDO = { x: 0, z: 0 };            // 外の木戸（城の南の口）
const UKE = { x: 6, z: 30 };            // 木戸の前の陣（打って出る城方を受ける所）
const SHINGARI = { x: -10, z: 120 };    // 囲みを解いて退く道の殿の場
// K652②（11/25 Sanae・家の編を10分前後に）：逸話の段（K652⑥）＝白井入道浄三は寄せ手を西の堀際へ引きつけ、土塁を崩して寄せ手を下敷きにしたと伝わる（『関八州古戦録』）。
//   本人は堀際で、崩れた土に埋まった味方の横で土塁の上の城方を崩す。負けた後、関東の諸将は次々に陣を払って国へ帰り、北条へ寝返る者も出た
const HORI = { x: -34, z: -8 };         // 城の西の堀際
const JINBARAI = { x: 34, z: 92 };      // 城下の東の諸将の陣（陣払い）

// 11/21 クラウド35（K563 ③の質）：臼井城（台地の土塁と柵の城）を置く（castles/usui.js・出所 docs/battle_refs/usui.md）。遠景の軽い形
// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：臼井の地面（印旛沼・城の台地・城下の道と森）。北条編 h13 も同じ戦場を使う（城は同じ castles/usui.js・同じ所）
export const USUI_LAND = {
  seed: 1566, overcast: true, time: 'day', fogFar: 380,
  river: NUMA, riverW: 30, riverDepth: 1.2,
  hills: [[0, -60, 55, 14], [-70, -40, 40, 9], [70, -50, 40, 9], [-150, 100, 60, 6]],
  // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：臼井の城下の口・外の木戸・木戸の前の陣・囲みを解いて退く道の殿の場 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
  paths: [{ pts: [[0, 160], [-10, 120], [10, 80], [6, 30], [0, 0]], w: 3 }],
  groves: [{ x: 0, z: -60, r: 28, n: 30 }, { x: -70, z: -40, r: 20, n: 30 }],
  trees: 500, tufts: 2000,
};

export const u08_usui = withCastle(lightBattle({
  id: 'u08_usui',
  date: '永禄九年（1566）三月　春・曇り　下総国 臼井城',
  intro: '上杉輝虎は関東の諸将を率いて、北条方の臼井城を囲んだ。城には北条の加勢、白井入道が入っている。',
  history: '永禄九年（1566）、上杉輝虎は関東の諸将を率いて下総の臼井城を囲んだ。城を守る原胤貞のもとに北条の加勢の白井入道が入って指図し、城方が打って出て寄せ手を崩した。上杉方は大きな損を出して囲みを解き、退いた。この後、関東の諸将の多くが北条の側へ移った。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '臼井城の城方（原・北条）', mon: 'hojo', faction: 'hojo' } },
  force: { a: 15000, b: 2000 },
  allyLook: UESUGI, foeLook: HOJO,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: USUI_LAND,
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
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: JOKA.x + 14, z: JOKA.z + 12 }, obj: '城下の町屋の陰で、伏せた城方の弓を討て', limit: 90,
      say: [['組頭', '伏せた城方の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた城方の弓', from: { x: JOKA.x + 22, z: JOKA.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた城方の弓を破った' },
    { kind: 'fight', at: KIDO, obj: '城の外の木戸へ寄せ、守りの兵を崩す', title: '外の木戸', sub: '城の南の木戸。上から矢と鉄砲が降る',
      say: [['上杉輝虎の使番', '殿より。木戸を破れ。城の内へ押し込め', 3.2]],
      foes: [
        { name: '木戸の守り', from: { x: KIDO.x, z: KIDO.z - 10 }, list: [uS(3), uA(24)] },
        { name: '木戸の鉄砲', from: { x: KIDO.x + 16, z: KIDO.z - 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '城の内から加勢が出てくる！'], foes: [{ name: '城の内の加勢', from: { x: KIDO.x - 24, z: KIDO.z - 18 }, list: [uS(2), uA(12)] }] }],
      reward: '外の木戸の守りを崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + -14, z: KIDO.z + 10 }, obj: '木戸の櫓の下で、鉄砲を構える城方を討て', limit: 90,
      say: [['組頭', '鉄砲を構える城方が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '鉄砲を構える城方', from: { x: KIDO.x + -6, z: KIDO.z + 22 }, list: [uS(1), uA(6), uG(4)] }],
      reward: '鉄砲を構える城方を破った' },
    { kind: 'fight', at: HORI, obj: '城の西の堀際へ回り、土塁の上の城方を崩す', title: '西の堀際', sub: '白井入道の指図。城方は寄せ手を堀際へ引きつける',
      say: [['関東の侍', '西の堀は浅いぞ！　ここから登れる！', 3], ['組頭', '……土塁が崩れる！　下がれ、埋まるぞ！', 3.2]],
      foes: [{ name: '土塁の上の城方', from: { x: HORI.x - 4, z: HORI.z - 12 }, list: [uS(3), uA(18)] },
        { name: '土塁の上の弓', from: { x: HORI.x + 14, z: HORI.z - 18 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      later: [{ t: 30, say: ['関東の侍', '土に埋まった者がおる！　城方が下りてきて首を取る気じゃ！'], foes: [{ name: '堀へ下りた城方', from: { x: HORI.x - 20, z: HORI.z - 6 }, list: [uS(2), uA(14)] }] }],
      reward: '堀際で城方を崩し、埋まった味方を引き出した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HORI.x + 14, z: HORI.z + -12 }, obj: '西の堀際で、土塁から石を落とす城方を討て', limit: 90,
      say: [['組頭', '石を落とす城方が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '石を落とす城方', from: { x: HORI.x + 22, z: HORI.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '石を落とす城方を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: UKE, label: '木戸の前の陣', obj: '城方の打って出る兵を、木戸の前で受け止める', r: 18, dur: 80,
      title: '城方、打って出る', sub: '白井入道の指図で、城方が門を開いて打って出た',
      say: [['関東の侍', '城方が打って出たぞ！　白井入道の旗じゃ！', 3.2], ['組頭', '退くな！　陣を崩せば総崩れになる！', 3]],
      waves: [
        { t: 6, foes: [{ name: '打って出た城方', from: { x: UKE.x - 6, z: UKE.z - 40 }, list: [uS(4), uA(22)] }] },
        { t: 36, say: ['見張り', '脇の沼の道からも来るぞ！'], foes: [{ name: '沼の道の城方', from: { x: UKE.x + 40, z: UKE.z - 30 }, list: [uS(2), uA(14), uG(4)] }] }],
      reward: '木戸の前で城方の打って出るのを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: UKE.x + -16, z: UKE.z + 12 }, obj: '木戸の前で、横の道から出る城方の足軽を受け止めよ', limit: 90,
      say: [['組頭', '横の道から出る城方が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '横の道から出る城方', from: { x: UKE.x + -8, z: UKE.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '横の道から出る城方を破った' },
    { kind: 'hold', at: JINBARAI, label: '諸将の陣', obj: '陣を払う関東の諸将の後ろを、城方の追い討ちから守る', r: 16, dur: 70,
      title: '陣払い', sub: '寄せ手の損は大きい。関東の諸将が次々に陣を払う',
      say: [['関東の侍', '我らは国へ帰らせてもらう。北条とも、話をつけねばならぬ', 3.4], ['上杉輝虎の使番', '殿より。去る者の後ろも守れ。上杉の名を落とすな', 3.2]],
      waves: [
        { t: 6, say: ['城方の侍', '陣を払うておる！　今が討ち時じゃ！'], foes: [{ name: '城方の追い討ち', from: { x: JINBARAI.x - 6, z: JINBARAI.z - 44 }, list: [uS(3), uA(18)] }] },
        { t: 34, say: ['見張り', '沼の岸からも回ってくる！'], foes: [{ name: '北条の加勢の手', from: { x: JINBARAI.x + 34, z: JINBARAI.z - 30 }, list: [uS(2), uA(12), uG(3)] }] }],
      reward: '陣を払う諸将の後ろを守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: JINBARAI.x + 14, z: JINBARAI.z + 12 }, obj: '陣払いの道で、荷を狙う城方の足軽を払え', limit: 90,
      say: [['組頭', '荷を狙う城方の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '荷を狙う城方の足軽', from: { x: JINBARAI.x + 22, z: JINBARAI.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '荷を狙う城方の足軽を破った' },
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
}), { plan: USUI_PLAN, at: { x: 0, z: -72 }, lift: 0, team: 1, life: false });
export default u08_usui;
