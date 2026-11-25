// 上杉編 十二戦目「手取川の戦い」（天正五年〔1577〕九月二十三日・加賀 手取川）。軽い型（light_battle.js）
//   史実：七尾城の救いに北へ上った柴田勝家らの織田勢は、手取川を渡った後に七尾が落ちたと知り、退き始めた。
//   上杉謙信は松任城に入ってこれを追い、雨で水かさの増した手取川で退く織田勢を夜に討ち、多くが川に呑まれた（織田編の手取川の裏側）。
//   出所：Wikipedia「手取川の戦い」・白山市の史跡の案内。戦の大きさは記録が少なく軍記の脚色を含む。くわしくは docs/chapter_uesugi.md
// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と川）をやめ、
//   織田家編の手取川（b_tedorigawa.js）の雨夜の川原・増水の濁流・二本の幟の浅瀬・刈田・在所・上杉の篝火の列を tedoField で建てる。
//   向きは織田編と同じ：北（−z）が上杉の寄せる側（謙信の本陣・篝火の列）、南（+z）が織田の退く先。遊ぶ側は上杉の先手の足軽。
// K652⑥（その戦の逸話を本人がやる段）：増水の手取川の浅瀬で、渡りかけた織田勢を川へ追い落とす（「上杉に逢うては織田も名取川」の落首）。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tedoField, TEDO_WORLD, TEDO_TIMESLIP, TEDO_AT } from './b_tedorigawa.js';   // K651：織田編の手取川の戦場をそのまま使う（素材は写さない）

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const ODA = { flag: 'oda', armor: 0x2c2c30 };
const AT = TEDO_AT, FORD = AT.ford;
const SPAWN = { x: 10, z: -168 };                       // 上杉の追手の先手（篝火の列の奥）
const MATTO = { x: 8, z: -116 };                        // 松任城から出た所（織田の物見を払う）
const FIELD = { x: -6, z: -60 };                        // 手取川の北の野（退く織田の殿の後ろ）
const BANK = { x: FORD.x + 4, z: FORD.z - 6 };          // 北の岸の渡り口（二本の幟の前）
// K652②（11/25 Sanae・家の編を10分前後に）：史実の流れ。織田勢は柴田・前田・丹羽らの備ごとに退いた。東の前田の備の殿を先に割り、
//   岸で崩れた後は、西の古い流れ筋（霞堤の内）へ逃げ込む丹羽の手を討つ。逸話（K652⑥）＝「上杉に逢うては織田も手取川　はねる謙信　逃ぐるとぶ長」の落首
const MAEDA = { x: 58, z: -70 };                        // 東の前田の備の殿（織田編の前田の備の所）
const NIWA = { x: -58, z: -44 };                        // 西の古い流れ筋（丹羽の手が逃げ込む所）

export const u12_tedorigawa = lightBattle({
  id: 'u12_tedorigawa',
  date: '天正五年（1577）九月二十三日　秋・雨の夜　加賀国 手取川',
  intro: '七尾城が落ちたと知り、柴田勝家の織田勢は手取川へ退き始めた。上杉謙信は松任城から、雨の夜にこれを追う。',
  history: '天正五年（1577）九月、七尾城を救いに来た柴田勝家らの織田勢は、七尾が落ちたと知って退いた。上杉謙信は松任城から追い、雨で水かさの増した手取川で退く織田勢を夜に討った。多くの兵が川に呑まれた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '柴田勝家の織田勢', mon: 'oda', faction: 'oda' } },
  force: { a: 20000, b: 30000, la: 0.06, lb: 0.12 },   // K652①：討ち取りに合わせて少しずつ。謙信の書状は織田の討ち取り千余と伝える（上杉の損は少ない）
  allyLook: UESUGI, foeLook: ODA,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },   // 南（+z）の手取川を向く
  world: { seed: 1577 },   // 下で織田編の手取川の world に置き換える（K651）
  allies: [
    { name: '上杉謙信の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉謙信'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉謙信', '織田は七尾が落ちたと知り、手取川へ退いておる', 3.2],
      ['上杉謙信', '雨で川は溢れておる。渡り切る前に追いつけ', 3.2]] },
    { kind: 'fight', at: MATTO, obj: '松任城の前で、織田の物見を払う', title: '松任', sub: '織田の物見が城の前に残っている',
      say: [['組頭', '物見を逃がすな！　本隊に知らせを走らせるな！', 3]],
      foes: [{ name: '織田の物見', from: { x: MATTO.x - 6, z: MATTO.z + 10 }, list: [uS(2), uA(21)] },
        { name: '織田の鉄砲', from: { x: MATTO.x + 16, z: MATTO.z + 14 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: MATTO.x + 30, z: MATTO.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '松任城の前で織田の物見を払った' },
    { kind: 'fight', at: MAEDA, obj: '東の在所で、退く前田の備の殿を割る', title: '前田の備', sub: '東の備が在所の垣を楯に退く',
      say: [['上杉謙信の使番', '殿より。東の備から割れ。柴田の本隊を一つずつ裸にする', 3.4]],
      foes: [{ name: '前田の備の殿', from: { x: MAEDA.x - 4, z: MAEDA.z + 12 }, list: [uS(3), uA(20)] },
        { name: '前田の鉄砲', from: { x: MAEDA.x + 16, z: MAEDA.z + 16 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '垣の陰から槍が出るぞ！'], foes: [{ name: '在所の垣の槍', from: { x: MAEDA.x + 28, z: MAEDA.z + 4 }, list: [uS(2), uA(14)] }] }],
      reward: '前田の備の殿を割った' },
    { kind: 'fight', at: FIELD, obj: '手取川の北の野で、退く織田の殿を崩す', title: '北の野', sub: '雨の中、織田の殿が退きながら構える',
      say: [['上杉謙信の使番', '殿より。殿を割れば、あとは川じゃ', 3.2]],
      foes: [{ name: '織田の殿', from: { x: FIELD.x, z: FIELD.z + 12 }, list: [uS(3), uA(30)] },
        { name: '柴田の鉄砲', from: { x: FIELD.x + 18, z: FIELD.z + 18 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '織田の新手が引き返して来る！'], foes: [{ name: '引き返した織田の手', from: { x: FIELD.x - 30, z: FIELD.z + 24 }, list: [uS(2), uA(18)] }] }],
      reward: '退く織田の殿を崩した' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: FIELD, label: '北の野の陣', obj: '雨の北の野で、引き返す織田勢の反撃を受け止める', r: 18, dur: 90,
      title: '反撃', sub: '退き道を開こうと、織田勢が死に物狂いで引き返す',
      say: [['上杉謙信', '追い詰められた兵は強い。一度受け止めてから押し返せ', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '雨の向こうから織田勢が引き返して来る！'], foes: [{ name: '織田の反撃の手', from: { x: FIELD.x - 8, z: FIELD.z + 30 }, list: [uS(3), uA(27)] }] },
        { t: 40, say: ['組頭', '脇からも来る！　鉄砲を揃えよ！'], foes: [{ name: '佐久間の手', from: { x: FIELD.x + 34, z: FIELD.z + 22 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: FIELD.x - 34, z: FIELD.z + 22 }, list: [uS(3), uA(18)] }] }],
      reward: '雨の野で織田の反撃を受け止めた' },
    { kind: 'fight', at: BANK, obj: '手取川の岸で、渡りかけた織田勢を討つ', title: '手取川', sub: '溢れた川の前で織田勢が足を止めた',
      say: [['上杉謙信', '川を背にした者は逃げ場が無い。押せ', 3.0]],
      foes: [{ name: '渡りかけた織田勢', from: { x: BANK.x - 6, z: BANK.z + 4 }, list: [uS(3), uA(33)] },
        { name: '柴田勝家の手', from: { x: BANK.x + 18, z: BANK.z - 2 }, list: [uS(4), uA(12)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: BANK.x - 30, z: BANK.z - 6 }, list: [uS(2), uA(15)] }] }],
      reward: '手取川の岸で織田勢を討った' },
    { kind: 'fight', at: NIWA, obj: '西の古い流れ筋へ逃げ込む丹羽の手を討つ', title: '古い流れ筋', sub: '溢れた川を渡れず、織田勢が霞堤の内へ逃げ込む',
      say: [['足軽', '上杉に逢うては織田も手取川、はねる謙信、逃ぐるとぶ長！', 3.4], ['上杉謙信', '水に足を取られた者を逃すな', 3]],
      foes: [{ name: '丹羽の手', from: { x: NIWA.x + 6, z: NIWA.z + 6 }, list: [uS(3), uA(24)] },
        { name: '堤の上の織田の鉄砲', from: { x: NIWA.x - 16, z: NIWA.z + 10 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '堤の向こうから引き返して来る！'], foes: [{ name: '丹羽の引き返しの手', from: { x: NIWA.x - 26, z: NIWA.z - 10 }, list: [uS(2), uA(14)] }] }],
      reward: '古い流れ筋で丹羽の手を討った' },
  ],
  // 11/21 cloud-07（司令塔・act bot 324秒「崩れた部隊が、また戦っている」織田の殿・織田の反撃の手 号令 flee）：崩れた織田の組は戦わずに退く。
  //   背を向けるまでの遅れの間に狙いを拾って打ち返していた（山崎と同じ）。崩れた組の逃げていない兵の狙いを毎コマ放す（崩れた組の兵だけ見る。軽い）
  update(rt) {
    const P = rt.player?.u; if (!P || !rt.army) return;
    for (const g of rt.army.groups) if (g.routed && g.team !== P.team) for (const u of g.units) {
      if (u.alive && !u.fleeing) { if (u.target || u.atk) { u.target = null; u.atk = null; u.aiT = 0; } u.cornerUntil = 0; u._fsT = rt.army.time; }
    }
  },
  win: {
    banner: '勝利', sub: '織田勢は溢れた手取川に追い落とされ、多くが川に呑まれた', award: '手取川で織田勢を破った',
    say: [['上杉謙信の使番', '織田勢、川を渡りきれず崩れました', 3.0],
      ['上杉謙信', '信長と聞いていたが、思ったよりも手弱いの', 3.4]],
  },
});
// K651：織田編の手取川の地面・増水の川・浅瀬・刈田・道をそのまま使う（getter も写すため descriptor ごと）。
//   崩れて逃げる先だけ入れ替える（織田編は上杉が北へ、ここは織田が南の岸へ逃げる）
u12_tedorigawa.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(TEDO_WORLD));
u12_tedorigawa.world.fleeOut = (x, z, team) => team === 1 && z > 60;
u12_tedorigawa.timeslip = TEDO_TIMESLIP;
// 戦場を建てる（織田編の手取川と同じ所）→ 軽い型の setup（上杉の組・段）
{ const s0 = u12_tedorigawa.setup; u12_tedorigawa.setup = function* (rt) { yield* tedoField(rt); s0.call(this, rt); }; }
export default u12_tedorigawa;
