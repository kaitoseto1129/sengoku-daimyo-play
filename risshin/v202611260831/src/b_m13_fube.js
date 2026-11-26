// 毛利家編 十三戦目「布部山の戦い」（元亀元年〔1570〕二月・出雲国 布部山）。軽い型（light_battle.js）・K647（docs/house_mori.md ⑥）
//   史実：山中鹿介ら尼子の残党は尼子勝久を立てて出雲へ入り、各地の旧臣を集めて布部山に陣を敷いた。毛利は吉川元春・小早川隆景が出雲へ入り、
//   布部山で尼子勢を破った。鹿介らはいったん退いた（『陰徳太平記』B・安来市の解説C。兵数は毛利約一万・尼子約七千で推）。
//   調略の糸：尼子方についた国人の一備へ密書を届け切ると、その備は旗の縁が赤→藍に変わり毛利に付く（寝返りは推）。届けぬ時は敵のまま。
//   山の斜面を駆け上がる戦（山の型）。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };
const SPAWN = { x: 90, z: 90 };            // 毛利の本陣（布部の南の谷）
const FUMOTO = { x: 40, z: 50 };           // 山の麓
const TURN = { x: -10, z: 22 };            // 寝返らせる国人の備
const MIDDLE = { x: -30, z: -10 };         // 山腹の尼子の陣
const HONJIN = { x: -50, z: -60 };         // 尼子の本陣（山頂近く）
const KANDO = { x: -96, z: -16 };          // 間道から回った先（尼子の陣の横・K652②）
const OCHI = { x: -110, z: -96 };          // 山の裏の尼子の落ち口（K652②）

function scene(rt) {
  const W = rt.world;
  try { for (const [dx, dz] of [[-6, 4], [8, 8], [16, 14]]) rt.scene.add(nobori(W, HONJIN.x + dx, HONJIN.z + dz, 'kyogoku', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m13_fube = lightBattle({
  id: 'm13_fube',
  date: '元亀元年（1570）二月　昼　出雲国 布部山',
  intro: '滅んだはずの尼子が、山中鹿介と共に蘇った。布部山に陣を敷く。毛利は、国人の一備へ密書を送り、山を駆け上がる。',
  history: '元亀元年（1570）、山中鹿介ら尼子の残党は、尼子勝久を立てて出雲へ入り、旧臣を集めて布部山に陣を敷いた。毛利は吉川元春・小早川隆景が出雲へ入り、布部山で尼子勢を破った。鹿介らはいったん退いた。滅びた家が蘇る怖さを、毛利が味わった戦である（『陰徳太平記』・安来市の解説。兵数は推）。',
  sides: { a: { name: '毛利の軍', mon: 'mori', faction: 'mori' }, b: { name: '尼子再興の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 10000, b: 7000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.3,
  foeDmg: 0.75,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.25 },
  world: {
    seed: 1570, time: 'day', fogFar: 330,
    hills: [[-50, -60, 54, 28], [-30, -10, 40, 16], [10, 30, 34, 8], [120, 20, 48, 10], [-130, 40, 50, 12]],
    paths: [{ pts: [[90, 90], [40, 50], [-10, 22], [-30, -10], [-50, -60]], w: 2.8 }],
    groves: [{ x: -100, z: 50, r: 30, n: 28 }, { x: 110, z: 50, r: 32, n: 30 }, { x: 0, z: 100, r: 28, n: 22 }],
    trees: 460, tufts: 1600,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '小早川隆景の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('小早川隆景'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  turncoats: [{ key: 'kokujin', name: '尼子方の国人の備', at: TURN, face: Math.PI * 0.2, list: [uS(2), uA(13), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'kyogoku', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['吉川元春', '尼子は滅んだはず。それが山中鹿介の下に、また集まっておる', 3.6],
      ['小早川隆景', '集まったのは旧臣ばかり。心は一つではない。国人の一備へ、文を送る', 3.6],
      ['吉川元春', 'お主、麓の備へ走れ。書状を渡して戻れ', 3.2]] },
    { kind: 'move', at: FUMOTO, label: '山の麓', obj: '山の麓まで進む', r: 12, max: 120,
      say: [['組頭', '山の上から見られておる。木の陰を伝って行け', 3]] },
    { kind: 'chouryaku', target: 'kokujin', at: TURN, label: '国人の備', obj: '尼子方の国人の備へ、密書を届ける', r: 9, max: 90,
      say: [['小早川隆景', 'あの備の頭は、尼子再興に半信半疑じゃ。この書状を、鹿介に気取られぬよう渡せ', 3.8]],
      turnSay: ['国人の備の頭', '毛利殿の書状、受け取った。これより毛利に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、布部山の国人の一備を毛利に付けた' },
    { kind: 'fight', at: MIDDLE, obj: '山腹の尼子の陣を駆け上がって攻める', title: '山腹', sub: '坂の上から、尼子の矢が降る',
      say: [['吉川元春', '備が一つ抜けた。今じゃ、山腹を押し上げよ！', 3.2]],
      foes: [{ name: '山腹の尼子勢', from: { x: MIDDLE.x + 6, z: MIDDLE.z - 6 }, list: [uS(3), uA(16)] }, { name: '尼子の弓', from: { x: MIDDLE.x - 10, z: MIDDLE.z - 14 }, list: [uS(1), uB(8)] }],
      later: [{ t: 40, say: ['組頭', '上の曲輪から新手が降りて来るぞ！'], foes: [{ name: '尼子の新手', from: { x: MIDDLE.x - 18, z: MIDDLE.z - 28 }, list: [uS(2), uA(12)] }] }],
      reward: '布部山の山腹を攻め上がった' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: MIDDLE, label: '山腹の陣', obj: '打って出る山中鹿介の手を、山腹で受け止める', r: 16, dur: 60,
      title: '鹿介の手', sub: '山中鹿介が、尼子再興をかけて討って出る',
      say: [['小早川隆景', '山中鹿介が降りて来た！　ここを空けるな！', 3.2]],
      waves: [{ t: 6, say: ['山中鹿介', '七難八苦を我に与えたまえ！　尼子の再興はこの一戦じゃ！'], foes: [{ name: '山中鹿介の手', from: { x: MIDDLE.x - 14, z: MIDDLE.z - 36 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', '横の谷からも来るぞ！'], foes: [{ name: '尼子の横手の備', from: { x: MIDDLE.x + 22, z: MIDDLE.z - 30 }, list: [uS(2), uA(12)] }] }],
      reward: '山中鹿介の討って出る手を受け止めた' },
    // K652②（11/25 Sanae・10分）：毛利は正面から攻める手と、山の間道を回る手に分け、尼子の陣の横を突いた（『陰徳太平記』B）
    { kind: 'fight', at: KANDO, obj: '間道を回った手と共に、尼子の陣の横を突く', title: '間道', sub: '山の裏道から、尼子の横腹へ',
      say: [['小早川隆景', '間道の手が着いた。横から突けば、尼子の陣は二つに割れる', 3.4]],
      foes: [{ name: '尼子の横の陣', from: { x: KANDO.x + 10, z: KANDO.z - 8 }, list: [uS(3), uA(14)] }, { name: '横の陣の弓', from: { x: KANDO.x + 4, z: KANDO.z - 18 }, list: [uS(1), uB(5)] }],
      reward: '間道から尼子の陣の横を突いた' },
    { kind: 'fight', at: HONJIN, obj: '尼子勝久の本陣を攻める', title: '尼子の本陣', sub: '山頂近くの本陣へ押し上げる',
      say: [['吉川元春', '鹿介を押し返した。本陣へ、一気に登れ！', 3.2]],
      foes: [{ name: '尼子勝久の旗本', from: { x: HONJIN.x + 6, z: HONJIN.z - 6 }, list: [uS(4), uA(12)] }],
      reward: '布部山の尼子の本陣を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MIDDLE.x + 30, z: MIDDLE.z + 40 }, obj: '山の麓の道で、山へ上がる尼子の荷駄の守りを討つ', max: 100, limit: 90,
      say: [['組頭', '荷駄を押さえよ', 3.2]],
      foes: [{ name: '尼子の荷駄の守り', from: { x: MIDDLE.x + 42, z: MIDDLE.z + 28 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '麓の荷駄を押さえた' },
    { kind: 'hold', at: { x: MIDDLE.x - 10, z: MIDDLE.z + 30 }, label: '山腹の道で、', obj: '山腹の道で、坂を下る尼子の足軽を受け止める', r: 16, dur: 45,
      say: [['見張り', '尼子が坂を駆け下る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '駆け下る尼子の足軽', from: { x: MIDDLE.x + 2, z: MIDDLE.z + 18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '駆け下る尼子の足軽', from: { x: MIDDLE.x - 24, z: MIDDLE.z + 44 }, list: [uS(2), uA(7)] }] }],
      reward: '山腹の道を守った' },
    { kind: 'fight', at: { x: MIDDLE.x - 20, z: MIDDLE.z - 30 }, obj: '山頂近くの柵で、本陣を守る尼子の旗本を崩す', max: 100, limit: 90,
      say: [['毛利元就', '本陣は近い。押し上げろ', 3.2]],
      foes: [{ name: '尼子の旗本', from: { x: MIDDLE.x - 8, z: MIDDLE.z - 42 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '山頂近くの柵を破った' },
    // K652②：布部山で敗れた尼子勢は山を越えて落ちた。落ちて行く尼子の殿を払う
    { kind: 'fight', at: OCHI, obj: '山の裏へ落ちて行く尼子の殿を払う', title: '落ち口', sub: '鹿介の殿が、勝久を逃がす',
      say: [['吉川元春', '勝久を逃がすな！　殿の備を崩せ', 3.2]],
      foes: [{ name: '尼子の殿', from: { x: OCHI.x + 8, z: OCHI.z + 6 }, list: [uS(3), uA(13)] }],
      reward: '落ちて行く尼子の殿を崩した' },
  ],
  win: {
    banner: '布部山の勝ち', sub: '尼子再興の軍は崩れ、鹿介は山を下りた', award: '布部山で尼子再興の軍を破った',
    say: [['吉川元春', '尼子の旗は下りた。だが鹿介は逃げた。この火はまだ消えぬ', 3.4],
      ['小早川隆景', '国人の備が抜けたのが効いた。書状の力じゃ', 3.2],
      ['組頭 与三左', 'お主の走りで山が開けた。よう届けた', 3.2]],
  },
});
export default m13_fube;
