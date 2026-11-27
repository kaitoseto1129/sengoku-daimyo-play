// 毛利家編 二戦目「折敷畑の戦い」（天文二十三年〔1554〕・安芸国 折敷畑）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：毛利元就は陶晴賢と結び、尼子方（新宮党の勢力下）の宮川房長が安芸へ入るのを折敷畑で迎え撃った。元就・隆元の手は山の上から坂を下って宮川勢を破り、
//   房長は討たれた（『陰徳太平記』B・広島市の解説C。兵数は諸説・毛利約三千・宮川約三千は推）。
//   この戦で初めて「調略の糸」（house_mori.md ①）を使う：宮川方の一備へ本人が密書を届け切ると、その備は旗の縁が赤→藍に変わり、毛利に付いて側面を向く。
//   宮川方の一備の寝返りは推（要確認・調略は毛利の常の手＝B）。届けられぬ時は敵のまま（戦は続く）。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';
import { plant, rise, hide } from './mori_show.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };   // 宮川は尼子方＝平四つ目結（textures.js の kyogoku）
const SPAWN = { x: 70, z: -70 };           // 折敷畑の峰の上（毛利）
const SLOPE = { x: 30, z: -20 };           // 坂の途中
const SIDE = { x: -46, z: 4 };             // 宮川方の側面の備（寝返らせる）
const FOOT = { x: -10, z: 56 };            // 坂の下（宮川の本隊）
const FUSANAGA = { x: -50, z: 108 };       // 房長の落ちる先
const USHIRO = { x: 30, z: 84 };           // 宮川の後詰（元春・隆景と挟む所・K652②）
const MINE = { x: 54, z: -50 };            // 峰の陣の前（宮川の先手が登って来る・K652②）

let RINBAN = [];   // K716 見せ場：谷の左右の林に伏せた毛利の旗（敵が谷へ入ると一斉に立つ）
function scene(rt) {
  const W = rt.world;
  RINBAN = plant(rt, [[FOOT.x - 56, FOOT.z - 30], [FOOT.x - 66, FOOT.z - 12], [FOOT.x - 48, FOOT.z - 2], [FOOT.x + 44, FOOT.z - 30], [FOOT.x + 58, FOOT.z - 14], [FOOT.x + 40, FOOT.z - 2]], 'mori', 5.5); hide(RINBAN);
  try { for (const [dx, dz] of [[-6, 6], [8, 4], [16, 14]]) rt.scene.add(nobori(W, FOOT.x + dx, FOOT.z + dz, 'kyogoku', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m02_oshikibata = lightBattle({
  id: 'm02_oshikibata',
  date: '天文二十三年（1554）　朝　安芸国 折敷畑',
  intro: '尼子方の宮川房長が、安芸へ攻め入った。元就は峰の上で待ち、宮川の備の一つへ密書を送って味方に付ける。',
  history: '天文二十三年（1554）五月、毛利元就は陶晴賢と手を切り、安芸の国人を従えはじめた。尼子方の宮川房長（新宮党の流れ）が約三千で安芸へ入ると、元就と隆元は折敷畑の峰の上で待ち受けた。元就は宮川の陣の一備へ密書を送って寝返りを誘い（推）、その備が側面を向くと同時に、毛利の本隊が坂の上から駆け下った。宮川勢は崩れ、房長は討たれた。毛利が陶と手を切って後の最初の野戦の勝ちで、これが厳島への道を開いた。',
  sides: { a: { name: '毛利元就の軍', mon: 'mori', faction: 'mori' }, b: { name: '宮川房長の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 3000, b: 3000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.55,   // K716 二回目：信長で出陣の通しが峰の陣で倒れた（146秒）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 0.85 },
  world: {
    seed: 1554, time: 'day', fogFar: 300, mist: 0.35,   // K716：山・谷・林で視界を悪く
    hills: [[70, -90, 60, 24], [30, -40, 40, 12], [-90, -20, 50, 10], [120, 60, 56, 14], [-110, 120, 50, 12]],
    paths: [{ pts: [[70, -70], [30, -20], [-10, 56], [-50, 108]], w: 3 }, { pts: [[30, -20], [-46, 4]], w: 2.4 }],
    groves: [{ x: -80, z: 10, r: 28, n: 26 }, { x: 110, z: 20, r: 32, n: 30 }, { x: -120, z: 80, r: 34, n: 28 }, { x: FOOT.x - 58, z: FOOT.z - 16, r: 22, n: 30 }, { x: FOOT.x + 50, z: FOOT.z - 16, r: 22, n: 30 }],
    trees: 400, tufts: 1800,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '毛利隆元の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('毛利隆元'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  // 調略の糸：坂の側面に陣を張る宮川方の一備（約五百を二十人で）
  turncoats: [{ key: 'miyagawa', name: '宮川方の一備', at: SIDE, face: Math.PI * 0.3, list: [uS(2), uA(13), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'kyogoku', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '宮川の三千は坂の下に陣を張った。まともに当たれば互角じゃ', 3.6],
      ['毛利隆元', '父上、宮川の側面の備には、前から文を通じてあります', 3.4],
      ['毛利元就', 'うむ。その密書を届ける者が要る。お主、走れ。届けば、坂の上から一気に下る', 3.6]] },
    // K652②（11/25 Sanae・10分）：宮川勢は先に折敷畑の峰へ登って来た。峰の上で受け止め、坂の下へ押し返してから密書を走らせる（『陰徳太平記』B・推）
    { kind: 'hold', at: MINE, label: '峰の陣の前', obj: '峰へ登って来る宮川の先手を、陣の前で受け止める', r: 16, dur: 60, limit: 110,
      title: '峰の陣', sub: '宮川の先手が、峰を目がけて登って来る',
      say: [['毛利隆元', '宮川が登って来る！　坂の上の利を捨てるな', 3.2]],
      waves: [{ t: 8, say: ['宮川の侍', '毛利の峰を取れ！'], foes: [{ name: '宮川の先手', from: { x: MINE.x - 30, z: MINE.z + 34 }, list: [uS(3), uA(13)] }] },
        { t: 34, say: ['組頭', '横の谷からも来るぞ！'], foes: [{ name: '宮川の横の手', from: { x: MINE.x - 40, z: MINE.z + 6 }, list: [uS(2), uA(10), uB(3)] }] }],
      reward: '峰へ登る宮川の先手を受け止めた' },
    { kind: 'move', at: SLOPE, label: '坂の途中', obj: '峰を下り、坂の途中まで進む', r: 12, max: 120,
      say: [['組頭', '宮川に見つかるな。木の陰を伝え', 3]] },
    // K652②（11/25 Sanae・10分）：坂に出ていた宮川の物見を、密書の道を開くために先に討つ
    { kind: 'fight', at: SLOPE, obj: '坂に出た宮川の物見を、声を立てさせずに討つ', title: '物見', sub: '密書の道を開く',
      say: [['毛利隆元', '物見に見られては、密書も何もない。黙らせよ', 3.2]],
      foes: [{ name: '宮川の物見', from: { x: SLOPE.x - 14, z: SLOPE.z + 18 }, list: [uS(2), uA(10)] }],
      reward: '坂の宮川の物見を討った' },
    { kind: 'chouryaku', target: 'miyagawa', at: SIDE, label: '宮川方の備', obj: '宮川方の側面の備へ、密書を届ける', r: 9, max: 90,
      say: [['毛利元就', 'あの備の頭は、尼子に不満を持つ者じゃ。この書状を、宮川に気取られぬうちに渡せ', 3.8]],
      turnSay: ['宮川方の備の頭', '毛利殿の書状、確かに受け取った。これより毛利に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、宮川方の一備を毛利に付けた' },
    // K716 二回目：要件書「正面から受けず、林へ伏せる・敵を引き込む・左右から出る」→ 林へ伏せる段と、谷へ入った瞬間に左右の林から旗が立つ段
    { kind: 'move', at: { x: FOOT.x - 40, z: FOOT.z - 20 }, label: '谷の左の林', obj: '谷の左の林へ入り、木の陰に伏せる', r: 10, max: 100,
      say: [['毛利隆元', '宮川を谷へ引き込む。林に伏せて、旗を上げるな', 3.2]] },
    { kind: 'rest', dur: 8, heal: 0, fn: (rt) => rise(rt, RINBAN, 3),
      say: [['組頭', '来た。宮川の先手が谷へ入ったぞ', 2.8], ['毛利元就', '今じゃ！　左右の林から、毛利の旗を立てよ！', 3.2]] },
    { kind: 'fight', at: FOOT, obj: '坂の上から駆け下り、宮川の本隊を突く', title: '折敷畑', sub: '峰から坂を下って、宮川の本隊を突く',
      say: [['毛利元就', '今じゃ！　坂を下れ。宮川は、側面の備に気を取られておる！', 3.2]],
      foes: [{ name: '宮川の本隊', from: { x: FOOT.x + 6, z: FOOT.z + 6 }, list: [uS(3), uA(16)] }, { name: '宮川の弓', from: { x: FOOT.x - 10, z: FOOT.z + 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '宮川の二の手が来るぞ！'], foes: [{ name: '宮川の二の手', from: { x: FOOT.x + 20, z: FOOT.z + 22 }, list: [uS(2), uA(12)] }] }],
      reward: '折敷畑の坂の下で宮川の本隊を突き崩した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: FOOT, label: '坂の下', obj: '立ち直って戻る宮川の手を、坂の下で受け止める', r: 16, dur: 60,
      title: '宮川の反撃', sub: '宮川房長が踏みとどまる',
      say: [['毛利隆元', '房長が手を立て直した！　槍を揃えよ！', 3.2]],
      waves: [{ t: 6, say: ['宮川房長', '退くな！　ここで踏みとどまれ！'], foes: [{ name: '宮川房長の旗本', from: { x: FOOT.x - 10, z: FOOT.z + 40 }, list: [uS(3), uA(14)] }] }],
      reward: '宮川房長の反撃を坂の下で受け止めた' },
    // K652②：元就は隆元・元春・隆景らの手を分けて宮川の陣を囲んだ（『陰徳太平記』B）。後詰を元春・隆景の手と挟む
    { kind: 'fight', at: USHIRO, obj: '元春・隆景の手と共に、宮川の後詰を挟み討つ', title: '挟み討ち', sub: '分けた毛利の手が、宮川の後ろへ回った',
      say: [['毛利元就', '元春と隆景の手が、宮川の後ろへ回った。前から押せ、挟んで潰す', 3.6]],
      foes: [{ name: '宮川の後詰', from: { x: USHIRO.x - 8, z: USHIRO.z + 10 }, list: [uS(3), uA(15)] }, { name: '宮川の後詰の弓', from: { x: USHIRO.x + 12, z: USHIRO.z + 16 }, list: [uS(1), uB(5)] }],
      reward: '宮川の後詰を挟み討った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SLOPE.x - 20, z: SLOPE.z + 10 }, obj: '坂の途中で、駆け上がる宮川の足軽を討つ', max: 100, limit: 90,
      say: [['毛利元就', '登らせるな。上から突け', 3.2]],
      foes: [{ name: '宮川の足軽', from: { x: SLOPE.x - 8, z: SLOPE.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '坂の途中の足軽を討った' },
    { kind: 'hold', at: { x: SLOPE.x - 40, z: SLOPE.z + 70 }, label: '坂の下の林で', obj: '坂の下の林で、逃げる宮川の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '宮川が落ちて来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '落ちる宮川の兵', from: { x: SLOPE.x - 28, z: SLOPE.z + 58 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '落ちる宮川の兵', from: { x: SLOPE.x - 54, z: SLOPE.z + 84 }, list: [uS(2), uA(7)] }] }],
      reward: '坂の下の林を守った' },
    { kind: 'fight', at: FUSANAGA, obj: '落ちて行く宮川房長の殿を追う', title: '房長', sub: '房長は川の方へ逃げる',
      say: [['毛利元就', '房長を逃がすな。川の道を追え', 3.2]],
      foes: [{ name: '宮川房長の殿', from: { x: FUSANAGA.x + 6, z: FUSANAGA.z - 8 }, list: [uS(4), uA(12)] }],
      later: [{ t: 14, say: ['宮川房長', '無念……尼子の旗を、安芸に立てられなんだか', 3.4], foes: [{ name: '宮川房長の最後の旗本', from: { x: FUSANAGA.x + 10, z: FUSANAGA.z - 14 }, list: [uS(2), uA(8)] }] }],
      reward: '宮川房長の殿を崩し、房長を討ち取った' },
  ],
  win: {
    banner: '折敷畑の勝ち', sub: '宮川房長は討たれた', award: '折敷畑で宮川の軍を破った',
    say: [['毛利隆元', '房長、討ち取りましたぞ', 3.2],
      ['毛利元就', '一枚の書状が、千の槍に勝つ事がある。よい手伝いをした', 3.6],
      ['組頭 与三左', 'お主の届けた書状が、あの備を動かした。よう走った', 3.2]],
  },
});
export default m02_oshikibata;
