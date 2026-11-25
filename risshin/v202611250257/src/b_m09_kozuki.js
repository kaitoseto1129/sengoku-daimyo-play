// 毛利家編 九戦目「上月城の戦い」（天正六年〔1578〕六〜七月・播磨国 上月城）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：羽柴秀吉は尼子勝久・山中鹿介を上月城に入れて毛利に当たらせた。毛利は吉川元春・小早川隆景が大軍（約三万・通説）で上月城を囲み、
//   羽柴の援軍は三木城の別所に阻まれて動けず、城は落ち、勝久は自害、鹿介は捕らわれた（『陰徳太平記』B・佐用町の解説C。兵数は推）。
//   調略の糸：城内の一備へ密書を届け切ると、その備は旗の縁が赤→藍に変わり毛利に付く（城内の者を降らせる）。届けぬ時は敵のまま。城内の寝返りは推（B・諸説）。
//   山の城は武田編の山城型の丘の重ね（hills）を写した。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };   // 尼子勝久の旗は尼子の紋（折敷畑と同じ平四つ目結の染め）
const SPAWN = { x: 80, z: -84 };           // 毛利の本陣（城の東北の山）
const KAKOMI = { x: 34, z: -30 };          // 城を囲む線
const TURN = { x: -20, z: 22 };            // 城の下の曲輪の備（寝返らせる）
const KUGURI = { x: -34, z: 52 };          // 城の大手の曲輪
const HONMARU = { x: -50, z: 96 };         // 山の本丸（勝久・鹿介）

function scene(rt) {
  const W = rt.world;
  try { for (const [dx, dz] of [[-6, 4], [8, 8], [16, 14]]) rt.scene.add(nobori(W, HONMARU.x + dx, HONMARU.z + dz, 'kyogoku', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m09_kozuki = lightBattle({
  id: 'm09_kozuki',
  date: '天正六年（1578）六月　昼　播磨国 上月城',
  intro: '羽柴秀吉は尼子勝久と山中鹿介を上月城に入れた。毛利の大軍が城を囲む。元就の世から続く手で、城内の一備へ密書を送る。',
  history: '天正六年（1578）、尼子の再興をめざす尼子勝久・山中鹿介は、羽柴秀吉の後ろ盾で播磨の上月城に入った。毛利輝元の命を受け、吉川元春・小早川隆景が三万ほどの大軍で城を囲んだ。羽柴の援軍は三木城の別所に阻まれて動けない。毛利方は城内の者へ密書を送って内から崩し、城は落ちた。勝久は自害し、鹿介は捕らわれたのち護送の途中で討たれた（『陰徳太平記』・佐用町の解説。兵数は推）。',
  sides: { a: { name: '毛利の軍', mon: 'mori', faction: 'mori' }, b: { name: '尼子勝久の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 30000, b: 1000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.3,
  foeDmg: 0.75,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 0.8 },
  world: {
    seed: 1578, time: 'day', fogFar: 360,
    hills: [[-50, 96, 46, 30], [-34, 56, 34, 16], [90, -90, 56, 18], [30, -40, 30, 8], [-130, 30, 48, 14], [120, 40, 50, 10]],
    paths: [{ pts: [[80, -84], [34, -30], [-20, 22], [-34, 52], [-50, 96]], w: 2.8 }],
    groves: [{ x: -90, z: 40, r: 30, n: 28 }, { x: 110, z: 20, r: 32, n: 30 }, { x: 0, z: 100, r: 30, n: 24 }],
    trees: 460, tufts: 1700,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '小早川隆景の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('小早川隆景'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  // 調略の糸：城の下の曲輪に籠る一備（約二百を二十人で）
  turncoats: [{ key: 'johnai', name: '城内の一備', at: TURN, face: Math.PI * 0.2, list: [uS(2), uA(13), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'kyogoku', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['吉川元春', '上月の城は小さい。だが尼子の再興の火は、ここで消す', 3.4],
      ['小早川隆景', '力で攻めれば城方も死ぬ。城の中に、兵糧に困る者がおる。文で内から崩す', 3.6],
      ['吉川元春', 'お主、囲みを抜けて、その者へ書状を届けよ', 3.2]] },
    { kind: 'move', at: KAKOMI, label: '囲みの線', obj: '城を囲む線まで進む', r: 12, max: 120,
      say: [['組頭', '城の櫓から矢が来る。木の陰から出るな', 3]] },
    { kind: 'chouryaku', target: 'johnai', at: TURN, label: '城内の備', obj: '城内の一備へ、密書を届ける', r: 9, max: 90,
      say: [['小早川隆景', '飢えた備の頭は、勝久殿に見切りをつけておる。この書状を、鹿介に気取られぬよう渡せ', 3.8]],
      turnSay: ['城内の備の頭', '毛利殿の書状、確かに受け取った。これより毛利に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、上月城内の一備を毛利に付けた' },
    { kind: 'fight', at: KUGURI, obj: '山の城の大手の曲輪を攻める', title: '上月城の大手', sub: '内から崩れた城へ、大手の曲輪を押し上げる',
      say: [['吉川元春', '城内の備が寝返った。今じゃ、大手を押し上げよ！', 3.2]],
      foes: [{ name: '尼子の大手の備', from: { x: KUGURI.x + 6, z: KUGURI.z + 6 }, list: [uS(3), uA(16)] }, { name: '尼子の弓', from: { x: KUGURI.x - 10, z: KUGURI.z + 4 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '曲輪の奥から新手が出るぞ！'], foes: [{ name: '尼子の新手', from: { x: KUGURI.x - 18, z: KUGURI.z + 22 }, list: [uS(2), uA(12)] }] }],
      reward: '上月城の大手の曲輪を攻め落とした' },
    { kind: 'hold', at: KUGURI, label: '大手の曲輪', obj: '打って出る山中鹿介の手を、曲輪で受け止める', r: 16, dur: 65,
      title: '鹿介の手', sub: '山中鹿介が討って出る',
      say: [['小早川隆景', '山中鹿介が討って出た！　大手を空けるな！', 3.2]],
      waves: [{ t: 6, say: ['山中鹿介', '尼子の最後の戦じゃ！　一人でも多く連れて行け！'], foes: [{ name: '山中鹿介の手', from: { x: KUGURI.x - 10, z: KUGURI.z + 38 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', '背の山から、まだ来るぞ！'], foes: [{ name: '尼子の殿の手', from: { x: KUGURI.x + 14, z: KUGURI.z + 38 }, list: [uS(2), uA(12)] }] }],
      reward: '山中鹿介の討って出る手を受け止めた' },
    { kind: 'fight', at: HONMARU, obj: '山の本丸の尼子勝久を攻める', title: '本丸', sub: '勝久は本丸に籠もる',
      say: [['吉川元春', '勝久を逃がすな。本丸まで押し上げよ', 3.2]],
      foes: [{ name: '尼子勝久の旗本', from: { x: HONMARU.x + 6, z: HONMARU.z - 8 }, list: [uS(4), uA(12)] }],
      reward: '上月城の本丸を落とした' },
  ],
  win: {
    banner: '上月城の勝ち', sub: '尼子勝久は自害した', award: '上月城で尼子勝久の軍を破った',
    say: [['吉川元春', '勝久、腹を召した。尼子の旗は、これで消えた', 3.2],
      ['小早川隆景', '城の者を斬らずに降らせた。書状の力じゃ', 3.4],
      ['組頭 与三左', 'お主の届けた書状が、城の内を崩した。よう走った', 3.2]],
  },
});
export default m09_kozuki;
