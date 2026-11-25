// 長宗我部家編 十「一宮城の戦い」（天正十三年〔1585〕七月・阿波国 一宮城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：羽柴秀長の大軍が阿波へ入り、谷忠澄・江村親俊の守る一宮城を囲んだ。城は水の手を断たれるまで持ちこたえ、忠澄は元親に和を勧めた。
//   元親は降り、土佐一国を安堵された（『元親記』B。既存 t05_ichinomiya＝羽柴の側の反対の側。兵の数は通説・諸説）。
//   この戦の「勝ち」は、水の手が断たれるまで城を守り切る事（呼び集めは城の外の田の兵を、城の中へ呼び入れる形）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { ichiField, ICHI_WORLD, ICHI_AT } from './b_t05_ichinomiya.js';   // K651：豊臣編の一宮城の戦場をそのまま使う（素材は写さない）
import { BATTLE_ASSETS } from './asset_manifest.js';

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：
//   前の別の戦場（手書きの丘と田）をやめ、豊臣編 t05 の一宮城（鮎喰川の河原・東西の尾根の城・西の谷の湧き水・金掘りの坑道・麓の砦・秀長の本陣）を ichiField で建てる。
//   遊ぶ側は城を守る長宗我部（城と櫓は味方の持ち）。北（−z）の河原から羽柴が寄せ、西の谷の湧き水（水の手）を断ちに来る。行き先は ICHI_AT で置く。
// K652⑥（その戦の逸話を本人がやる段）：秀長は金掘り衆に坑道を掘らせて城の水の手を断った（『南海治乱記』）。本人が坑道の口へ斬り込み、金掘り衆を追う。
const HASHIBA = { flag: 'toyotomi', armor: 0x2a2420 };
const AT = ICHI_AT;
const SPAWN = { x: AT.honGate.x + 4, z: AT.honGate.z - 12 };   // 搦手の門の前の坂（城の内からは門を出る所で act bot が四分止まった）
const HORA = { ...AT.mid };                               // 法螺の台（搦手の道の中ほどの段。西の谷の田へ吹く）
const GATE = { x: AT.honGate.x, z: AT.honGate.z - 8 };    // 搦手の口（門の前の坂）
const WATER = { ...AT.waterFront };                       // 水の手（谷の湧き水の溜めの前）
const ADIT = { ...AT.aditFront };                         // 金掘り衆の坑道の口

export const c06_ichinomiya = chosoBattle({
  id: 'c06_ichinomiya',
  date: '天正十三年（1585）七月　昼　阿波国 一宮城',
  intro: '羽柴秀長の大軍が、阿波の一宮城を囲んだ。守るのは谷忠澄と江村親俊。城の裏の田に、まだ呼べる一領具足がいる。',
  history: '天正十三年（1585）、羽柴秀長の大軍が阿波へ入り、谷忠澄・江村親俊が守る一宮城を囲んだ。城は水の手を断たれるまで持ちこたえたが、忠澄は羽柴の兵の多さを見て元親に和を勧めた。元親は降り、土佐一国だけを残された（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '羽柴の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 9000, b: 50000, la: 0.35, lb: 0.06 },   // K652①：城兵九千・秀長の阿波勢五万（t05 と同じ数）。討ち取りに合わせて少しずつ
  foeLook: HASHIBA,
  foeDmg: 0.45,   // 11/25 K651：豊臣編の戦場（谷の坂・坑道の口）で act bot が110秒で倒れた（侍の一太刀22・足軽19）＝c07 と同じ手
  playerTaken: 0.45,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },   // 北（河原）を向く
  world: { seed: 1585, time: 'day' },   // 下で豊臣編の一宮城の world に置き換える（K651）
  fields: [{ at: { x: -64, z: 58 }, far: 0 }, { at: { x: -98, z: 58 }, far: 1 }, { at: { x: -104, z: 22 }, far: 2 }, { at: { x: -58, z: 16 }, far: 3 }],   // 西の谷の田（湧き水の周り）
  callSay: ['谷忠澄', '城へ入れ！　大手を固めよ！', '……これだけか。集まった者で守る'],
  allies: [
    { name: '谷忠澄の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 2 }, list: [busho('谷忠澄'), uS(4), uA(8)] },
    { name: '江村親俊の手', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [busho('江村親俊'), uS(3), uA(8)] },
    { name: '城の一領具足', at: { x: SPAWN.x - 2, z: SPAWN.z - 6 }, list: [uS(1), ICHIRYO(10), uG(4)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['谷忠澄', '羽柴の兵は五万を超える。城で持ちこたえるしかない', 3.2],
      ['組頭', '裏の田に、まだ一領具足がおる。法螺で城へ呼び入れよ', 3.2],
      ['江村親俊', '羽柴の兵が水の手へ回るぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を城へ呼び入れる', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: WATER, obj: '水の手を切りに来た羽柴の兵を払う', title: '水の手', sub: '羽柴の兵が水の手へ回る', max: 120,
      say: [['江村親俊', '水の手を取られたら、城は終わりじゃ！', 3]],
      foes: [{ name: '羽柴の水の手の兵', from: { x: AT.valley.x - 4, z: AT.valley.z + 14 }, list: [uS(2), uA(12)] }],
      reward: '水の手を守った' },
    { kind: 'fight', at: ADIT, obj: '坑道の口へ斬り込み、金掘り衆を追う', title: '金掘り', sub: '羽柴の金掘り衆が水脈を掘る', max: 110,
      say: [['江村親俊', '土の下から水を断つ気じゃ！　掘らせるな！', 3], ['羽柴の侍', '金掘りを守れ！', 2.6]],
      foes: [{ name: '羽柴の土掘り', from: { x: ADIT.x - 2, z: ADIT.z + 2 }, list: [uA(8)] }, { name: '金掘りの守り', from: { x: ADIT.x + 10, z: ADIT.z - 12 }, list: [uS(2), uA(8)] }],
      reward: '金掘り衆を追った' },
    { kind: 'hold', at: GATE, label: '搦手の口', obj: '搦手の口で、羽柴の寄せを受ける', r: 16, dur: 70, title: '一宮城', sub: '羽柴の新手',
      say: [['谷忠澄', '水が細ってきた。ここが最後の守りじゃ', 3], ['羽柴の侍', 'かかれ！　小城じゃ、一息に揉め！', 3]],
      waves: [{ t: 0, say: ['羽柴の侍', '搦手へかかれ！'], foes: [{ name: '羽柴の先手', from: { x: AT.mid.x + 6, z: AT.mid.z - 4 }, list: [uS(2), uA(12)] }] },
        { t: 32, say: ['羽柴の侍', '鉄砲、撃ちかけよ！'], foes: [{ name: '羽柴の鉄砲', from: { x: AT.low.x + 4, z: AT.low.z - 4 }, list: [uS(1), uA(6), uG(4)] }, { name: '羽柴の新手', from: { x: AT.up.x + 6, z: AT.up.z - 6 }, list: [uS(2), uA(8), uB(3)] }] }],
      reward: '搦手の口を守った' },
  ],
  // 城は味方の持ち：搦手の門と本丸の門を開けて置く（追われた兵が城の内へ退ける）
  update(rt) {
    const F = rt.flags;
    if (F.c6Gates || !F.C?.gateObjs) return;
    F.c6Gates = true;
    for (const id of ['karamete', 'hon']) { const g = F.C.gateObjs[id]; if (g && g.struct) { g.open && g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); } }
  },
  win: {
    banner: '一宮城、持ちこたえた', sub: '谷忠澄が和を勧める', award: '一宮城を守り抜いた',
    say: [['谷忠澄', '城は守った。されど、羽柴の兵は尽きぬ', 3.2],
      ['谷忠澄', '殿に和を勧める。土佐を残すためじゃ', 3],
      ['組頭', '……田へ帰れる日が、来るのかのう', 3]],
  },
});
// K651：豊臣編の一宮城の地面・鮎喰川・城山・谷・道をそのまま使う（getter も写すため descriptor ごと）
c06_ichinomiya.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ICHI_WORLD));
c06_ichinomiya.world.fleeOut = (x, z, team) => team === 1 && z < -150;   // 崩れた羽柴は北の河原の向こうへ（城の南へ逃げない）
BATTLE_ASSETS.c06_ichinomiya = BATTLE_ASSETS.t05_ichinomiya;   // 一宮の標高（dem_ichinomiya）を使い回す
// 戦場を建てる（豊臣編の一宮城と同じ所・城と櫓は長宗我部の持ち）→ 軽い型の setup（長宗我部の組・段）
{ const s0 = c06_ichinomiya.setup; c06_ichinomiya.setup = function* (rt) { yield* ichiField(rt, { team: 0 }); s0.call(this, rt); }; }
export default c06_ichinomiya;
