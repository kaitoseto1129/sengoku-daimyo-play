// 長宗我部家編 五「岡本城の戦い」（天正七年〔1579〕五月・伊予国 三間 岡本城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：元親の重臣 久武親信は伊予の岡本城を攻めたが、城を守る土居清良の伏兵に遭って討たれ、長宗我部勢は退いた（『清良記』B・宇和島市の解説 C・兵の数は推）。
//   K720 二回目：要件書（docs/kaito_refs_all/20261126/chosokabe15_spec.md）の流れ①〜⑩＝開城までを遊ぶ（呼び集めは使わない）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { withCastle } from './light_castle.js';
import { OKAMOTO_PLAN } from './castles/okamoto.js';   // K657② 岡本城を戦場に（11/27 クラウドか）

const DOI = { flag: 'maru', armor: 0x302c28 };
const SPAWN = { x: 0, z: -40 };
const SLOPE = { x: 0, z: 30 };      // 城の坂の下
const GATE = { x: 4, z: 70 };       // 岡本城の木戸の前
const BACK = { x: -4, z: 0 };       // 退き口（谷の出口）
const RIDGE = { x: -60, z: 46 };    // 別の尾根（西の丘）
const KURUWA = { x: -10, z: 96 };   // 曲輪
const HONMARU = { x: 0, z: 118 };   // 本丸

export const c12_okamoto = withCastle(chosoBattle({
  id: 'c12_okamoto',
  date: '天正七年（1579）五月　昼　伊予国 三間 岡本城',
  intro: '久武親信様が、伊予の岡本城を攻める。城を守るのは土居清良。山の木立が、やけに静かだ。',
  history: '天正七年（1579）五月、長宗我部の重臣 久武親信は伊予の岡本城を攻めた。城を守る土居清良は伏兵で迎え、伊予攻めは長く手こずった。この戦では、尾根へ兵を回して城を開かせるまでを遊ぶ（城の最後は物語の上の筋・兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '土居の軍', mon: 'maru', faction: 'miyoshi' } },
  force: { a: 3000, b: 1000 },
  playerTaken: 0.32,   // 11/27 クラウドか：岡本城の柵の中は狭く囲まれやすい（act bot が本丸で二度倒れた）＝0.38→0.32。K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: DOI,
  thick: true,   // 11/25 act bot で討ち取り3（4分）＝受けの段に三の手・激突の段に新手（light_battle.js thickWaves）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1579, time: 'day', fogFar: 380, overcast: true,
    hills: [[GATE.x, GATE.z + 30, 40, 18], [-60, 40, 40, 16], [60, 40, 40, 16], [-80, -60, 50, 18], [80, -60, 50, 18], [0, -130, 60, 14]],
    paths: [{ pts: [[0, -140], [0, -78], [-4, 0], [0, 30], [4, 70], [0, 120]], w: 2.6 }],
    groves: [{ x: -60, z: 40, r: 30, n: 34 }, { x: 60, z: 40, r: 30, n: 34 }, { x: -80, z: -60, r: 30, n: 26 }, { x: 80, z: -60, r: 30, n: 26 }],
    trees: 460, tufts: 1500,
  },
  allies: [
    { name: '久武親信の手', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, list: [uS(4), uA(8)] },
    { name: '長宗我部の侍', at: { x: SPAWN.x - 10, z: SPAWN.z - 4 }, list: [busho('福留親政'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(2)] },
  ],
  flanks: [{ during: 4, at: { x: -78, z: 20 }, to: { x: RIDGE.x - 4, z: RIDGE.z + 20 }, n: 9, name: '尾根へ回る一領具足', delay: 5, say: ['福留親政', '林から旗が出た！　土居の横じゃ！'] }],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['久武親信', '岡本の城は小さい。一息に揉み落とせ', 3],
      ['組頭', '山の木立が静かすぎる。足元に気をつけよ', 3],
      ['福留親政', '久武殿、あまり深く入られるな', 3]] },
    // K720 二回目：流れ②〜⑩を紙の順に（山道→伏兵→先手が押される→別尾根→木戸→逆寄せ→曲輪→本丸孤立→開城）。史実の「久武討死・退き口」は外した（要件書は開城）
    { kind: 'move', at: { x: 0, z: 0 }, label: '山道', obj: '山道を進み、城の坂の下へ向かう', r: 10, max: 90,
      say: [['久武親信', '山道は細い。列を詰めよ。城は小さいぞ', 3]] },
    { kind: 'fight', at: GATE, obj: '木立から出た土居の伏兵を払う', title: '伏兵', sub: '木立から土居の兵が湧く', max: 120,
      say: [['土居清良', '今じゃ！　木立から出よ！', 3], ['組頭', '伏兵じゃ！　囲まれるな！', 3]],
      foes: [{ name: '土居の伏兵', from: { x: GATE.x - 22, z: GATE.z - 6 }, list: [uS(2), uA(10)] }, { name: '土居の伏兵の二', from: { x: GATE.x + 22, z: GATE.z - 4 }, list: [uS(2), uA(8)] }],
      reward: '伏兵を払った' },
    { kind: 'hold', at: SLOPE, label: '坂の下', obj: '押される先手を支え、坂の下で踏みとどまる', r: 16, dur: 60, title: '押される先手', sub: '坂の上から土居の備が押す',
      say: [['福留親政', '先手が押されておる！　坂の下で受けよ！', 3]],
      waves: [{ t: 0, say: ['土居の侍', '引きつけて討て！'], foes: [{ name: '土居の坂の備', from: { x: SLOPE.x + 4, z: SLOPE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['土居の侍', '弓、坂の上から射よ！'], foes: [{ name: '土居の弓', from: { x: SLOPE.x + 18, z: SLOPE.z + 36 }, list: [uS(1), uB(6)] }] }],
      reward: '坂の下で先手を支えた' },
    { kind: 'fight', at: RIDGE, obj: '別の尾根へ兵を回し、土居の側面の備を破る', title: '別の尾根', sub: '尾根から城の横へ', max: 110,
      say: [['久武親信', '正面は押せぬ。別の尾根へ回れ！', 3], ['福留親政', '一領具足、林を伝って横へ出よ！', 3]],
      foes: [{ name: '尾根の土居の備', from: { x: RIDGE.x - 4, z: RIDGE.z + 22 }, list: [uS(2), uA(10), uB(3)] }],
      reward: '別の尾根を取った' },
    { kind: 'fight', at: GATE, obj: '木戸を攻め、門を守る土居の兵を破る', title: '木戸', sub: '木戸の前に土居の鉄砲', max: 120,
      say: [['組頭', '尾根から回った。今度は木戸じゃ！', 3]],
      foes: [{ name: '木戸の土居の兵', from: { x: GATE.x, z: GATE.z + 16 }, list: [uS(2), uA(10), uG(3)] }],
      later: [{ t: 28, say: ['土居の侍', '木戸を破らせるな！'], foes: [{ name: '木戸の土居の二', from: { x: GATE.x + 14, z: GATE.z + 22 }, list: [uS(2), uA(8)] }] }],
      reward: '木戸を破った' },
    { kind: 'hold', at: { x: GATE.x, z: GATE.z + 12 }, label: '木戸の内', obj: '木戸の内で、城兵の逆寄せを受け止める', r: 16, dur: 50, title: '逆寄せ', sub: '城兵が打って出る',
      say: [['見張り', '城兵が打って出た！　木戸を渡すな！', 3]],
      waves: [{ t: 3, foes: [{ name: '城兵の逆寄せ', from: { x: GATE.x - 6, z: GATE.z + 30 }, list: [uS(3), uA(9)] }] },
        { t: 26, foes: [{ name: '城兵の逆寄せの二', from: { x: GATE.x - 14, z: GATE.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '城兵の逆寄せを受けきった' },
    { kind: 'fight', at: KURUWA, obj: '曲輪を取り、土居の守りを崩す', title: '曲輪', sub: '曲輪に土居の兵が籠もる', max: 120,
      say: [['久武親信', '曲輪を取れ！　本丸が見える！', 3]],
      foes: [{ name: '曲輪の土居の兵', from: { x: KURUWA.x - 4, z: KURUWA.z + 6 }, list: [uS(2), uA(11)] }],
      reward: '曲輪を確保した' },
    { kind: 'fight', at: HONMARU, obj: '本丸を孤立させ、土居清良の旗本を崩す', title: '本丸', sub: '本丸だけが残る', max: 130,
      say: [['福留親政', '曲輪は皆取った。本丸は孤立したぞ', 3]],
      foes: [{ name: '土居清良の旗本', from: { x: HONMARU.x, z: HONMARU.z + 10 }, list: [boss('土居清良'), uS(3), uA(10)] }],
      later: [{ t: 30, say: ['土居清良', '兵を殺すな。城は開く……', 3.2], foes: [{ name: '本丸の土居の兵', from: { x: HONMARU.x - 12, z: HONMARU.z + 18 }, list: [uS(2), uA(8)] }] }],
      reward: '本丸を孤立させた' },
    { kind: 'move', at: { x: HONMARU.x, z: HONMARU.z - 14 }, label: '本丸の門', obj: '開かれた本丸の門へ進む', r: 10, max: 80,
      say: [['土居清良', '城を開く。兵と民は助けてくれ', 3]] },
  ],
  win: {
    banner: '岡本城の勝ち', sub: '土居清良が城を開く', award: '岡本城を開城させた',
    say: [['土居清良', '兵を殺さぬと約束してくれ。それなら城を開こう', 3.2],
      ['福留親政', '岡本城が開いた。これで伊予への道が見えたぞ', 3.2],
      ['組頭', '土佐の中の戦が、四国の戦になった', 3]],
  },
}), { plan: OKAMOTO_PLAN, at: { x: 2, z: 106 }, lift: 0, team: 1, life: false });
export default c12_okamoto;
