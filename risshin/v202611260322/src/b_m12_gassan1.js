// 毛利家編 十二戦目「第一次月山富田城の戦い」（天文十一〜十二年〔1542〜43〕・出雲国 月山富田城）。軽い型（light_battle.js）・K647（docs/house_mori.md ⑥）
//   史実：大内義隆は尼子晴久の月山富田城を三万ほどの大軍で囲んだが、味方の国人が次々に尼子へ寝返り、攻めあぐねて総崩れの退却となった。
//   毛利元就も大内方で従軍し、退き口で追われた。家臣の渡辺通が元就の身代わりになって討たれたという（『陰徳太平記』B・安来市の解説C。兵数は推）。
//   仕組み：毛利が「負ける側」の戦（第二次木津川口と同じ）。山の城攻め→寝返りで囲みが崩れる→退き口を走り→殿で追手を受ける。勝ちは「生きて退く」。調略は無し（こちらが寝返られる側）。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };
const SPAWN = { x: 80, z: 70 };            // 大内勢の囲みの陣（月山の南）
const SHIOYA = { x: 20, z: 10 };           // 塩谷口の前（攻める口）
const CHIKE = { x: 0, z: 40 };             // 囲みが崩れる所（寝返りの国人の陣）
const EXIT = { x: 150, z: 120 };           // 退き口（山を下りる道）
const TONO = { x: 110, z: 96 };            // 殿が追手を受ける坂
const DEJIRO = { x: 60, z: 0 };            // 月山の麓の尼子の出城（K652②）
const MICHI = { x: 172, z: 146 };          // 退く道を塞ぐ一揆（K652②）

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-12, -34], [14, -40]]) rt.scene.add(yagura(W, SHIOYA.x + dx, SHIOYA.z + dz, { rot: 0 }));
    rt.scene.add(palisade(W, [SHIOYA.x - 30, SHIOYA.z - 22, SHIOYA.x + 30, SHIOYA.z - 22], { solid: true, h: 2.4 }));
    for (const [dx, dz] of [[-4, -50], [6, -52]]) rt.scene.add(nobori(W, SHIOYA.x + dx, SHIOYA.z + dz, 'kyogoku', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m12_gassan1 = lightBattle({
  id: 'm12_gassan1',
  date: '天文十二年（1543）一月　昼　出雲国 月山富田城',
  intro: '大内義隆の三万が、尼子の月山富田城を囲んだ。ところが味方の国人が寝返り始める。毛利は、生きて退く道を探す。',
  history: '天文十一年（1542）、大内義隆は尼子晴久の月山富田城を三万ほどの大軍で囲んだ。毛利元就も大内方として従軍した。ところが長い囲みの中で味方の国人が次々に尼子へ寝返り、大内勢は総崩れの退却となった。元就も退き口で追われ、家臣の渡辺通が身代わりになって討たれたという。同じ山城を二十年あまり後、元就は囲みと兵糧断ちで落とすことになる（『陰徳太平記』・安来市の解説。兵数は推）。',
  sides: { a: { name: '大内・毛利の軍', mon: 'mori', faction: 'mori' }, b: { name: '尼子の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 30000, b: 10000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.3,
  foeDmg: 0.8,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.3 },
  world: {
    seed: 1542, time: 'day', fogFar: 340, overcast: true,
    hills: [[0, -60, 60, 30], [-80, -20, 44, 18], [20, -20, 36, 12], [150, 30, 50, 10], [-140, 60, 50, 9]],
    paths: [{ pts: [[80, 70], [20, 40], [20, 10]], w: 2.8 }, { pts: [[0, 40], [60, 80], [110, 96], [150, 120]], w: 2.6 }],
    groves: [{ x: -110, z: 80, r: 30, n: 26 }, { x: 120, z: 20, r: 32, n: 28 }, { x: 60, z: 130, r: 28, n: 22 }],
    trees: 420, tufts: 1500,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '渡辺通の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('渡辺通'), uS(3), uA(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '月山は出雲の山城じゃ。三万でも、一つの口しか攻められぬ', 3.6],
      ['渡辺通', '囲みが長いと、陣中の心がもろくなる。足元を固めて参りましょう', 3.4],
      ['組頭', '塩谷口を攻める。柵と櫓の間から矢が来るぞ', 3.2]] },
    // K652②（11/25 Sanae・10分）：大内勢は月山の周りの尼子の出城を一つずつ攻めてから、城の口に取り付いた（『陰徳太平記』B）
    { kind: 'fight', at: DEJIRO, obj: '月山の麓の尼子の出城を落とす', title: '麓の出城', sub: '城の口へ寄る前に、麓の出城を払う',
      say: [['渡辺通', '麓の出城を残しては、口を攻める背を突かれまする', 3.2]],
      foes: [{ name: '出城の尼子勢', from: { x: DEJIRO.x - 8, z: DEJIRO.z - 10 }, list: [uS(3), uA(14)] }, { name: '出城の弓', from: { x: DEJIRO.x + 10, z: DEJIRO.z - 14 }, list: [uS(1), uB(5)] }],
      reward: '月山の麓の尼子の出城を落とした' },
    { kind: 'fight', at: SHIOYA, obj: '塩谷口の尼子の砦を攻める', title: '塩谷口', sub: '山城の口は狭く、攻める者が削られる',
      say: [['毛利元就', '口が狭い。固まって押せ、散るな', 3.2]],
      foes: [{ name: '塩谷口の尼子勢', from: { x: SHIOYA.x + 4, z: SHIOYA.z - 12 }, list: [uS(3), uA(14)] }, { name: '尼子の弓', from: { x: SHIOYA.x - 10, z: SHIOYA.z - 18 }, list: [uS(1), uB(8)] }],
      later: [{ t: 40, say: ['組頭', '曲輪の上から新手が来るぞ！'], foes: [{ name: '尼子の新手', from: { x: SHIOYA.x - 14, z: SHIOYA.z - 34 }, list: [uS(2), uA(12)] }] }],
      reward: '塩谷口の尼子の砦を攻めた' },
    { kind: 'hold', at: CHIKE, label: '崩れる囲み', obj: '寝返った国人の備が突いてくる囲みの端を、受け止める', r: 18, dur: 65,
      title: '寝返り', sub: '味方の国人が、尼子へ旗を替えた',
      say: [['渡辺通', '味方の備が尼子に付いたぞ！　囲みの端が崩れる！', 3.2]],
      waves: [
        { t: 6, say: ['寝返った国人', '大内に義理は無い！　尼子殿に付く！', 3], foes: [{ name: '寝返った国人の備', from: { x: CHIKE.x - 24, z: CHIKE.z + 6 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', '尼子が打って出た！　退くな、まだ退くな！'], foes: [{ name: '尼子の打って出る手', from: { x: CHIKE.x - 6, z: CHIKE.z - 36 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '寝返りで崩れる囲みの端を受け止めた' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'move', at: EXIT, label: '退き口', obj: '総崩れの陣を抜け、退き口へ走る', r: 14, max: 140,
      say: [['毛利元就', '大内殿の陣は崩れた。ここで死んではならぬ。山を下りるぞ', 3.4], ['組頭', '背に追手じゃ！　振り返るな！', 3]] },
    { kind: 'hold', at: TONO, label: '殿の坂', obj: '追ってくる尼子の手を、坂で受け止める', r: 16, dur: 60,
      title: '殿', sub: '渡辺通が、元就の身代わりに立つ',
      say: [['渡辺通', '殿はお先へ。ここは通が受け持つ', 3.4]],
      waves: [{ t: 6, say: ['尼子の侍', '毛利の大将首じゃ！　逃がすな！'], foes: [{ name: '尼子の追手', from: { x: TONO.x - 30, z: TONO.z - 30 }, list: [uS(2), uA(10)] }] },
        { t: 34, say: ['組頭', '新手の追手じゃ！　もう少しで安芸じゃ！'], foes: [{ name: '尼子の二の追手', from: { x: TONO.x - 40, z: TONO.z - 16 }, list: [uS(2), uA(8)] }] }],
      reward: '殿で尼子の追手を受け止め、元就を逃がした' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SHIOYA.x - 20, z: SHIOYA.z + 20 }, obj: '塩谷口の下で、石を落とす尼子の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '石に気をつけて登れ', 3.2]],
      foes: [{ name: '石を落とす尼子の足軽', from: { x: SHIOYA.x - 8, z: SHIOYA.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '塩谷口の下を押さえた' },
    { kind: 'hold', at: { x: SHIOYA.x + 30, z: SHIOYA.z + 30 }, label: '囲みの陣で、', obj: '囲みの陣で、夜に打って出る尼子の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '夜討ちじゃ！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '夜の尼子の兵', from: { x: SHIOYA.x + 42, z: SHIOYA.z + 18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '夜の尼子の兵', from: { x: SHIOYA.x + 16, z: SHIOYA.z + 44 }, list: [uS(2), uA(7)] }] }],
      reward: '囲みの陣を守った' },
    { kind: 'fight', at: { x: SHIOYA.x + 100, z: SHIOYA.z + 80 }, obj: '退き口の道で、追って来る尼子の先手を討つ', max: 100, limit: 90,
      say: [['組頭', '追っ手を止めよ', 3.2]],
      foes: [{ name: '追う尼子の先手', from: { x: SHIOYA.x + 112, z: SHIOYA.z + 68 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '退き口の道を守った' },
    // K652②：大内勢の退き口では、土地の一揆が落ちて行く兵を襲った（『陰徳太平記』B）
    { kind: 'fight', at: MICHI, obj: '退く道を塞ぐ一揆を払い、安芸への道を開く', title: '落ち武者狩り', sub: '負けた軍には、土地の者も牙をむく',
      say: [['組頭', '道に一揆が出たぞ！　負けた軍の首と具足を狙っておる！', 3.2], ['毛利元就', '払え。ここを抜ければ安芸じゃ', 3]],
      foes: [{ name: '退く道の一揆', from: { x: MICHI.x + 10, z: MICHI.z + 8 }, list: [uS(1), uA(16)] }, { name: '一揆の弓', from: { x: MICHI.x - 12, z: MICHI.z + 14 }, list: [uB(5)] }],
      reward: '退く道の一揆を払い、安芸への道を開いた' },
  ],
  win: {
    banner: '月山富田城の退き戦', sub: '大内は総崩れ。毛利は生きて安芸へ戻った', award: '月山の負け戦を生き延びて安芸へ退いた',
    say: [['毛利元就', '大軍でも、山城一つ落とせぬ。この負けを忘れぬ', 3.4],
      ['毛利元就', '通の働きを、毛利は代々語り継ぐ', 3.2],
      ['組頭 与三左', '生きて戻れた者が、次の勝ちを作る。それが足軽の勤めじゃ', 3.2]],
  },
});
export default m12_gassan1;
