// 上杉編 十五戦目「長谷堂城の戦い」（慶長五年〔1600〕九月〜十月・出羽 長谷堂城）。軽い型（light_battle.js）
//   史実：関ヶ原の戦いと同じ時、上杉景勝の家老 直江兼続は最上義光の出羽へ攻め入り、山形城の前の長谷堂城を囲んだ。
//   城将 志村光安はよく守り、伊達政宗の援けの留守政景も着いた。九月二十九日、関ヶ原で西軍が敗れた報が届き、兼続は十月一日に退いた。
//   最上・伊達の追い討ちを、兼続は自ら殿を務めて鉄砲で防ぎ、米沢へ退き遂げた。
//   出所：Wikipedia「慶長出羽合戦」「長谷堂城の戦い」・山形市の長谷堂城跡の案内。くわしくは docs/chapter_uesugi.md
//   最上家の紋（丸に二つ引両）は手元の紋に無いので、旗は一文字（ichimonji）を当てた（家の紋の替わり）
import { withCastle } from './light_castle.js';
import { HASEDO_PLAN } from './castles/hasedo.js';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const MOGAMI = { flag: 'ichimonji', armor: 0x3a3632 };
const SPAWN = { x: 0, z: -140 };
const SUGESAWA = { x: 10, z: -100 };    // 菅沢山の陣の前（城方の打って出るのを受ける所）
const FOOT = { x: -10, z: -30 };        // 長谷堂城の麓の田（深田）
const PASS = { x: 20, z: 40 };          // 退く道の口（最上・伊達の追い手を止める所）
const REAR = { x: -10, z: 110 };        // 殿の最後の構え

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：長谷堂の地面（菅沢山・城山・道と杉の森）。伊達編 e15 も同じ戦場を使う（城も同じ所）
export const HASEDO_LAND = {
  seed: 1600, marchMist: 90, marchMistFar: 75, time: 'day', autumn: true, fogFar: 260,
  hills: [[0, -200, 60, 22], [-30, 20, 40, 16], [120, 80, 60, 14], [-130, 120, 60, 18]],
  // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：菅沢山の陣の前・長谷堂城の麓の田・退く道の口・殿の最後の構え を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
  paths: [{ pts: [[0, -140], [10, -100], [-10, -30], [20, 40], [-10, 110]], w: 3 }],
  groves: [{ x: -130, z: 120, r: 30, n: 30, kind: 'sugi' }, { x: -30, z: 20, r: 20, n: 30, kind: 'sugi' }],
  trees: 460, tufts: 2000,
};

export const HASEDO_CASTLE_AT = { x: -34, z: 20 };   // 長谷堂城の置き場（e15 も同じ所）
// 11/21 クラウド35（K563 ③の質）：長谷堂城（長谷堂城山の山城）を置く（castles/hasedo.js・出所 docs/battle_refs/hasedo.md）。遠景の軽い形
export const u15_hasedo = withCastle(lightBattle({
  id: 'u15_hasedo',
  date: '慶長五年（1600）九月　秋・霧　出羽国 長谷堂城',
  intro: '関ヶ原と同じ時、直江兼続は出羽へ攻め入り、長谷堂城を囲んだ。城は固く、最上と伊達の援けも近い。',
  history: '慶長五年（1600）、直江兼続は最上義光の出羽へ攻め入り、長谷堂城を囲んだ。城将 志村光安はよく守った。九月二十九日、関ヶ原で西軍が敗れた報が届き、兼続は十月一日に退いた。最上と伊達の追い討ちを、兼続は自ら殿を務めて防ぎ、米沢へ退き遂げた。',
  sides: { a: { name: '直江兼続の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '最上義光の軍', mon: 'ichimonji', faction: 'mogami' } },
  force: { a: 18000, b: 7000 },
  allyLook: UESUGI, foeLook: MOGAMI,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: HASEDO_LAND,
  allies: [
    { name: '直江兼続の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('直江兼続'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['直江兼続', '長谷堂の城は小さいが、志村光安はしぶとい', 3.2],
      ['直江兼続', '霧に紛れて城の兵が打って出る。陣の前で受けよ', 3.2]] },
    { kind: 'hold', at: SUGESAWA, label: '菅沢山の陣の前', obj: '菅沢山の陣の前で、城から打って出た兵を受け止める', r: 18, dur: 100,
      title: '菅沢山', sub: '霧の中、長谷堂の城兵が打って出る',
      say: [['組頭', '霧で敵が見えぬ！　声のする方へ槍を向けよ！', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '霧の向こうから城兵じゃ！'], foes: [{ name: '志村光安の手', from: { x: SUGESAWA.x - 6, z: SUGESAWA.z + 36 }, list: [uS(3), uA(27)] }] },
        { t: 34, say: ['組頭', '脇から鉄砲を撃ちかけてくる！'], foes: [{ name: '城方の鉄砲', from: { x: SUGESAWA.x + 28, z: SUGESAWA.z + 30 }, list: [uS(1), uG(6)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: SUGESAWA.x - 30, z: SUGESAWA.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '城から打って出た兵を受け止めた' },
    { kind: 'fight', at: FOOT, obj: '長谷堂城の麓の田で、城方の守りを崩す', title: '麓の田', sub: '深い田の向こうに城方が構える',
      say: [['直江兼続の使番', '殿より。田に足を取られるな。畦を伝って寄せよ', 3.2]],
      foes: [{ name: '麓の守り', from: { x: FOOT.x, z: FOOT.z + 12 }, list: [uS(3), uA(27)] },
        { name: '伊達の援け 留守政景の手', from: { x: FOOT.x + 24, z: FOOT.z + 22 }, list: [uS(3), uA(15)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: FOOT.x + 30, z: FOOT.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '長谷堂城の麓の守りを崩した' },
    { kind: 'fight', at: PASS, obj: '退く道の口で、最上の追い手を食い止める', title: '退き口', sub: '関ヶ原で西軍が敗れた。兼続は退くと決めた',
      say: [['直江兼続', '関ヶ原は負けた。ここに留まる理由は無い。退くぞ。殿はわしが務める', 3.6]],
      foes: [{ name: '最上の追い手', from: { x: PASS.x - 6, z: PASS.z - 10 }, list: [uS(3), uA(30)] },
        { name: '最上の鉄砲', from: { x: PASS.x + 18, z: PASS.z - 14 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: PASS.x + 30, z: PASS.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '退く道の口で追い手を食い止めた' },
    { kind: 'hold', at: REAR, label: '殿の構え', obj: '殿の構えで、最上義光の追い討ちを防ぎ切る', r: 18, dur: 100,
      title: '殿', sub: '最上義光が自ら追ってくる',
      say: [['直江兼続', '鉄砲を揃えよ。引きつけて一度に放て', 3.0]],
      waves: [
        { t: 6, say: ['見張り', '最上の本隊じゃ！　義光が自ら来るぞ！'], foes: [{ name: '最上義光の旗本', from: { x: REAR.x - 10, z: REAR.z - 36 }, list: [uS(5), uA(21)] }] },
        { t: 30, say: ['組頭', '伊達の兵も追ってくる！'], foes: [{ name: '伊達の追い手', from: { x: REAR.x + 28, z: REAR.z - 30 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: REAR.x - 30, z: REAR.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '殿を務め、追い討ちを防ぎ切った' },
  ],
  win: {
    banner: '退き遂げる', sub: '直江兼続は殿を務めて追い討ちを防ぎ、米沢へ退き遂げた', award: '長谷堂の殿を務め上げた',
    say: [['直江兼続の使番', '追い手は引きました。全軍、米沢への道に入ります', 3.2],
      ['直江兼続', '負け戦でも、退き方で家の名は残る。よく戦うた', 3.4]],
  },
}), { plan: HASEDO_PLAN, at: HASEDO_CASTLE_AT, lift: 0, team: 1, life: false });
export default u15_hasedo;
