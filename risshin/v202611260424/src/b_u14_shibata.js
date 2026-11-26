// 上杉編 十四戦目「新発田重家の乱」（天正十五年〔1587〕十月・越後 新発田城）。軽い型（light_battle.js）
//   史実：御館の乱の恩賞に不満を持った揚北衆の新発田重家は、天正九年（1581）に織田信長に通じて上杉景勝に背き、七年に渡って戦った。
//   豊臣秀吉と結んだ景勝は、天正十五年、まず五十公野城を落とし、十月に新発田城を攻めた。重家は城から打って出て討ち死にし、乱は終わった。
//   出所：Wikipedia「新発田重家」「新発田重家の乱」・新発田市の新発田城跡の案内。くわしくは docs/chapter_uesugi.md
//   新発田家の紋は手元の紋に無いので、旗は丸（maru）を当てた（家の紋の替わり）
import { withCastle } from './light_castle.js';
import { SHIBATA_PLAN } from './castles/shibata.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const SHIBATA = { flag: 'maru', armor: 0x3e3832 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, -20], [-100, -14], [0, -22], [110, -16], [220, -24]];   // 新発田川（城の南の堀を兼ねる流れ）
const IJIMINO = { x: 20, z: -90 };      // 五十公野の口（先に落とした城の残りの兵）
const MOAT = { x: -10, z: -40 };        // 新発田城の南の堀の前
const CAMP = { x: 20, z: 10 };          // 堀を越えた寄せの陣（重家の打って出るのを受ける所）
const GATE = { x: 0, z: 70 };           // 新発田城の大手
// K652②（11/25 Sanae・家の編を10分前後に）：史実の流れ。重家は会津の蘆名の後詰を頼みにした（赤谷城から兵と米が入った）。
//   逸話の段（K652⑥）＝十月二十五日、重家は城を出て、旧知の色部長真の陣へ斬り込み「親しき者の手にかかろう、首を取れ」と言って腹を切った（『上杉家御年譜』）
const AIZU = { x: 62, z: -62 };         // 会津から来る道（蘆名の後詰の荷駄）
const IROBE = { x: -42, z: 18 };        // 色部長真の陣

// 11/21 クラウド35（K563 ③の質）：新発田城（土塁と柵・堀の平城）を置く（castles/shibata.js・出所 docs/battle_refs/shibata.md）。遠景の軽い形
export const u14_shibata = withCastle(lightBattle({
  id: 'u14_shibata',
  date: '天正十五年（1587）十月　秋・曇り　越後国 新発田城',
  intro: '新発田重家が背いて七年。豊臣秀吉と結んだ上杉景勝は、五十公野城を落とし、ついに新発田城へ寄せる。',
  history: '天正九年（1581）、新発田重家は織田信長に通じて上杉景勝に背き、七年に渡って戦った。天正十五年、景勝は五十公野城を落とし、十月に新発田城を攻めた。重家は城から打って出て討ち死にし、乱は終わった。',
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '新発田重家の軍', mon: 'maru', faction: 'shibata' } },
  force: { a: 10000, b: 3000 },
  allyLook: UESUGI, foeLook: SHIBATA,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1587, overcast: true, time: 'day', autumn: true, fogFar: 400,
    river: RIVER, riverW: 12, riverDepth: 0.6,
    hills: [[-140, 100, 60, 8], [150, 80, 60, 10], [120, -180, 70, 16]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：五十公野の口・新発田城の南の堀の前・堀を越えた寄せの陣・新発田城の大手 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -150], [20, -90], [-10, -40], [20, 10], [0, 70]], w: 3 }, { pts: [[20, -90], [62, -62]], w: 3 }, { pts: [[20, 10], [-42, 18]], w: 3 }],
    groves: [{ x: 120, z: -180, r: 30, n: 30 }, { x: 150, z: 80, r: 30, n: 30 }],
    trees: 360, tufts: 2200,
  },
  allies: [
    { name: '上杉景勝の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉景勝'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉景勝', '五十公野は落ちた。残るは新発田の城だけじゃ', 3.2],
      ['直江兼続', '重家は戦上手。追い詰められれば必ず打って出て参りましょう', 3.4]] },
    { kind: 'fight', at: IJIMINO, obj: '五十公野の口で、逃げ込んだ新発田の兵を払う', title: '五十公野', sub: '落ちた城の兵が新発田へ逃げようとしている',
      say: [['組頭', '新発田の城へ入れさせるな！', 3]],
      foes: [{ name: '五十公野の残りの兵', from: { x: IJIMINO.x - 6, z: IJIMINO.z + 10 }, list: [uS(2), uA(24)] },
        { name: '新発田の弓', from: { x: IJIMINO.x + 16, z: IJIMINO.z + 14 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: IJIMINO.x + 30, z: IJIMINO.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '五十公野の兵を払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IJIMINO.x + 14, z: IJIMINO.z + 12 }, obj: '五十公野の柵の外で、伏せた新発田の弓を討て', limit: 90,
      say: [['組頭', '伏せた新発田の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた新発田の弓', from: { x: IJIMINO.x + 22, z: IJIMINO.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた新発田の弓を破った' },
    { kind: 'fight', at: AIZU, obj: '会津から来る道で、蘆名の後詰の荷駄と守りを断つ', title: '会津の道', sub: '会津の蘆名が、新発田へ兵と米を送る',
      say: [['直江兼続', '重家が強いのは会津の米があるから。道を断てば城は干上がる', 3.4]],
      foes: [{ name: '蘆名の後詰', from: { x: AIZU.x + 6, z: AIZU.z - 12 }, list: [uS(3), uA(18)] },
        { name: '荷駄の鉄砲', from: { x: AIZU.x - 14, z: AIZU.z - 16 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['見張り', '赤谷の方から新手が来る！'], foes: [{ name: '赤谷の兵', from: { x: AIZU.x + 30, z: AIZU.z + 8 }, list: [uS(2), uA(14)] }] }],
      reward: '会津の後詰の道を断った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: AIZU.x + -14, z: AIZU.z + 10 }, obj: '会津の道の荷駄の脇で、守る蘆名の足軽を討て', limit: 90,
      say: [['組頭', '荷駄を守る蘆名の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '荷駄を守る蘆名の足軽', from: { x: AIZU.x + -6, z: AIZU.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '荷駄を守る蘆名の足軽を破った' },
    { kind: 'fight', at: MOAT, obj: '新発田城の南の堀の前で、守りの兵を崩す', title: '南の堀', sub: '堀の前に新発田の兵が構える',
      say: [['上杉景勝の使番', '御屋形様より。堀の前の兵を崩し、城を囲め', 3.2]],
      foes: [{ name: '堀の前の守り', from: { x: MOAT.x, z: MOAT.z + 12 }, list: [uS(3), uA(27)] },
        { name: '新発田の鉄砲', from: { x: MOAT.x + 18, z: MOAT.z + 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: MOAT.x + 30, z: MOAT.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '南の堀の前の守りを崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MOAT.x + 14, z: MOAT.z + -12 }, obj: '南の堀の土橋で、橋を守る新発田の足軽を討て', limit: 90,
      say: [['組頭', '土橋の新発田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '土橋の新発田の足軽', from: { x: MOAT.x + 22, z: MOAT.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '土橋の新発田の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: CAMP, label: '寄せの陣', obj: '寄せの陣で、新発田重家の打って出るのを受け止める', r: 18, dur: 100,
      title: '打って出る', sub: '重家が城の兵を率いて打って出た',
      say: [['直江兼続', '来ましたぞ。重家の最後の一合戦じゃ。陣を崩すな', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '城の門が開いた！　新発田の兵が出るぞ！'], foes: [{ name: '新発田の打って出る手', from: { x: CAMP.x - 8, z: CAMP.z + 40 }, list: [uS(4), uA(24)] }] },
        { t: 34, say: ['組頭', '重家の旗本が来る！'], foes: [{ name: '新発田重家の旗本', from: { x: CAMP.x + 26, z: CAMP.z + 34 }, list: [uS(5), uA(12)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: CAMP.x - 30, z: CAMP.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '新発田重家の打って出るのを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: CAMP.x + -16, z: CAMP.z + 12 }, obj: '寄せの陣の外で、夜に忍ぶ新発田の足軽を討て', limit: 90,
      say: [['組頭', '忍ぶ新発田の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '忍ぶ新発田の足軽', from: { x: CAMP.x + -8, z: CAMP.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '忍ぶ新発田の足軽を破った' },
    { kind: 'fight', at: IROBE, obj: '色部長真の陣へ斬り込んだ重家の旗本を囲む', title: '重家の最期', sub: '重家は旧知の色部長真の陣へ斬り込んだ',
      say: [['色部の侍', '重家じゃ！　色部の殿の陣へ真っ直ぐ来るぞ！', 3.2], ['新発田重家', '長真、親しき者の手にかかろう。この首、取れ！', 3.6]],
      foes: [{ name: '新発田重家の最後の旗本', from: { x: IROBE.x + 4, z: IROBE.z + 12 }, list: [uS(5), uA(14)] },
        { name: '重家の供の侍', from: { x: IROBE.x - 14, z: IROBE.z + 14 }, list: [uS(3), uA(8)] }],
      later: [{ t: 35, say: ['組頭', '城からも重家を追って兵が出てくる！'], foes: [{ name: '城から出た新発田の兵', from: { x: IROBE.x + 26, z: IROBE.z + 30 }, list: [uS(2), uA(14)] }] }],
      reward: '重家の最後の旗本を囲んだ（重家は色部の陣で腹を切った）' },
    { kind: 'fight', at: GATE, obj: '新発田城の大手へ入り、残る兵を討つ', title: '新発田城', sub: '重家は討ち死にした。城に残る兵が最後まで守る',
      say: [['上杉景勝の使番', '重家殿、討ち死に！　城へ入れ！', 3.0]],
      foes: [{ name: '新発田城の残りの兵', from: { x: GATE.x, z: GATE.z + 8 }, list: [uS(3), uA(24)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '新発田城を落とした' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GATE.x + -12, z: GATE.z + 10 }, obj: '大手の門の内で、最後に槍を構える新発田の兵を払え', limit: 90,
      say: [['組頭', '最後の新発田の兵が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '最後の新発田の兵', from: { x: GATE.x + -4, z: GATE.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '最後の新発田の兵を破った' },
  ],
  win: {
    banner: '落城', sub: '新発田重家は討ち死にし、七年続いた新発田の乱は終わった', award: '新発田城を落とした',
    say: [['上杉景勝の使番', '新発田城、落ちました。七年の乱はこれで終わりです', 3.2],
      ['上杉景勝', '重家ほどの者が敵であったのは惜しい。越後は一つに戻った', 3.4]],
  },
}), { plan: SHIBATA_PLAN, at: { x: 0, z: 115 }, lift: 0, team: 1, life: false });
export default u14_shibata;
