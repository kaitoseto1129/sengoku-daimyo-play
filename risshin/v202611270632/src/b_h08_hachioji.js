// 北条家編 十四戦目「八王子城の戦い」（天正十八年〔1590〕六月二十三日・武蔵国 八王子城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t11_hachioji の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。
//   史実：城主の北条氏照は小田原に籠もっており、城は横地監物・狩野一庵らの少ない兵と、近くの村の者が守った。
//   前田利家・上杉景勝の北国勢が霧の夜明けに攻め、城は一日で落ちた（八王子市の解説 C・『関八州古戦録』B）。
//   主人公は横地監物の組。①山下曲輪の口で受ける ②御主殿の門で受ける ③横地様と山の奥の道へ落ちる（負け戦・落城）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { hachiojiField, HACHI_WORLD, HACHI_AT, HACHI_ARMY, HACHI_DEPTH, hachiSide, t11_hachioji } from './b_t11_hachioji.js';   // K651：豊臣編の八王子城の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と川）をやめ、豊臣編 t11 の八王子城
//   （城山川の谷・山下曲輪・曳橋・御主殿の石段と虎口・尾根の金子丸〜本丸・霧の夜）を hachiojiField で建てる。曲輪の柵と館は北条（本人の側）の物。
//   行き先は八王子城の物差し（HACHI_AT）で置く（+x が寄せ口の谷・−z が尾根の上の本丸）
const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const HOKKOKU = { flag: 'toyotomi', armor: 0x3a2a1e };
const A = HACHI_AT;
const SPAWN = { x: A.ote.x - 4, z: A.ote.z };                  // 山下曲輪の中
const SANKA = { x: A.ote.x + 6, z: A.ote.z };                  // 山下曲輪の大手の木戸の内
const GOSHUDEN = { x: A.koguchi.x - 6, z: A.koguchi.z - 1 };   // 御主殿の虎口（石段の上）
const OKU = { x: 72, z: -30 };                                 // 金子丸の下の坂（尾根の奥へ落ちる道）

export const h08_hachioji = lightBattle({
  id: 'h08_hachioji',
  date: '天正十八年（1590）六月二十三日　夏・霧　武蔵国 八王子城',
  intro: '殿の氏照様は小田原におられる。城に残るのは少ない兵と村の者だけ。霧の中を、北国勢が来る。',
  history: '天正十八年（1590）六月、城主の北条氏照が小田原に籠もる間、八王子城は横地監物らの少ない兵と近くの村の者が守った。前田利家・上杉景勝の北国勢が霧の夜明けに攻め、城は一日で落ちた。',
  sides: { a: { name: '八王子城の城方', mon: 'hojo', faction: 'hojo' }, b: { name: '前田利家・上杉景勝の北国勢', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 3000, b: 15000, la: 0.7, lb: 0.08 },   // K652①：討ち取りに合わせて少しずつ。城は一日で落ち、城方は大方討たれた
  allyLook: HOJO, foeLook: HOKKOKU,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  stepLimit: 75,   // K721：高丸の段が420秒まで延び十八分で終わらなかった（act bot）ので段の上限を75秒に
  playerTaken: 0.35,   // 11/25 K651：豊臣編の八王子城の坂と石段で、信長で出陣の試し（act bot）が金子丸の下で倒れた（215秒・足軽の傷150）→ 0.45→0.35。信長で出陣の試しでも倒れ切らないように
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI / 2 },   // 東（寄せ口の谷）を向く
  world: { seed: 1592, time: 'night' },   // 下で豊臣編の八王子城の world に置き換える（K651）
  allies: [
    { name: '横地監物の手', at: { x: GOSHUDEN.x - 14, z: GOSHUDEN.z - 8 }, fixed: true, list: [busho('横地監物'), uS(3), uA(6)] },
    { name: '近藤出羽守の手', at: { x: SANKA.x - 4, z: SANKA.z - 7 }, list: [busho('近藤出羽守', { mustLive: false, invuln: false }), uS(2), uA(12)] },
    { name: '御主殿の守り', at: { x: GOSHUDEN.x - 10, z: GOSHUDEN.z - 4 }, list: [uS(2), uA(10)] },
    { name: '村の者', at: { x: SANKA.x - 8, z: SANKA.z + 7 }, list: [uA(10)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x - 4, z: SPAWN.z + 6 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    // K721（11/26）要件書の流れ：①夜明け前 ②前田・上杉勢が山麓へ ③山下曲輪を守る ④木戸を破られる ⑤御主殿へ敵が入る ⑥別の尾根から敵 ⑦金子丸を守る ⑧城内が混乱 ⑨本丸へ退く ⑩落城（婦女子の伝承は見世物にしない。遠景・音・戦後の静けさで）
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['横地監物', '夜明け前の霧の向こうに、前田と上杉の北国勢が山の麓へ着いた。数は知れぬ', 3.4],
      ['組頭', '山下の口で受ける。村の者を前に出すな', 3]] },
    { kind: 'hold', at: SANKA, label: '山下曲輪', obj: '山下曲輪の口で、霧から出て来る寄せ手を受け止める', r: 16, dur: 80, title: '山下曲輪', sub: '霧の中から前田の兵が現れる',
      say: [['前田の侍', '城は手薄じゃ！　一気に揉み潰せ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '前田の先手', from: { x: SANKA.x + 40, z: SANKA.z - 2 }, list: [{ type: 'samurai', n: 1, o: { name: '前田の組頭 奥村' } }, uS(3), uA(20)] }] },
        { t: 34, say: ['見張り', '脇の沢からも来る！'], foes: [{ name: '沢の寄せ手', from: { x: SANKA.x + 38, z: SANKA.z + 12 }, list: [uS(2), uA(14)] }] },
        { t: 60, foes: [{ name: '前田の鉄砲', from: { x: SANKA.x + 36, z: SANKA.z - 10 }, list: [uS(1), uG(8)] }] }],
      reward: '山下曲輪の口で寄せ手を受け止めた' },
    // K652⑥ 逸話の段：山下曲輪を守った近藤出羽守は、木戸の内で前田勢と斬り結んで討死した（『関八州古戦録』B）。本人はその横で木戸を破った寄せ手を斬る
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SANKA.x + 10, z: SANKA.z + -12 }, obj: '曲輪の口の霧の中で、先に抜けた前田の足軽を討て', limit: 90,
      say: [['組頭', '先に抜けた前田の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '先に抜けた前田の足軽', from: { x: SANKA.x + 18, z: SANKA.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '先に抜けた前田の足軽を破った' },
    { kind: 'fight', at: SANKA, limit: 90, obj: '近藤様の横で、木戸を破った前田の兵を斬る', title: '近藤出羽守', sub: '木戸が破られた',
      say: [['近藤出羽守', '山下はわしが預かった。一人でも多く道連れにせよ', 3.4]],
      foes: [{ name: '木戸を破った前田の手', from: { x: SANKA.x + 18, z: SANKA.z + 2 }, list: [{ type: 'samurai', n: 1, o: { name: '前田の侍' } }, uS(2), uA(8)] }],
      reward: '近藤出羽守の横で斬った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SANKA.x + -12, z: SANKA.z + -10 }, obj: '木戸の内の櫓で、射掛ける前田の弓を討て', limit: 90,
      say: [['組頭', '射掛ける前田の弓じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '射掛ける前田の弓', from: { x: SANKA.x + -20, z: SANKA.z + -20 }, list: [uS(2), uA(8), uB(3)] }],
      reward: '射掛ける前田の弓を破った' },
    { kind: 'rest', dur: 8, heal: 0.3, banner: ['近藤出羽守 討死', '山下曲輪'], say: [['組頭', '近藤様、お討死……。曳橋を渡って御主殿へ退け！', 3.2]] },
    { kind: 'hold', at: GOSHUDEN, label: '御主殿', obj: '御主殿の虎口まで退き、石段を上る前田の寄せ手を受ける', r: 14, dur: 70, title: '御主殿', sub: '山下が破られた',
      say: [['使番', '山下が破られた！　石段の上で受けよ！', 3]],
      waves: [
        { t: 4, foes: [{ name: '前田の二の手', from: { x: A.landing.x, z: A.landing.z + 4 }, list: [uS(2), uA(14)] }] },
        { t: 36, foes: [{ name: '前田の三の手', from: { x: A.bridgeN.x, z: A.bridgeN.z + 4 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 藤田' } }, uS(1), uA(10)] }] }],
      reward: '御主殿の門で寄せ手を受けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GOSHUDEN.x + 12, z: GOSHUDEN.z + 12 }, obj: '石段の下で、登る前田の鉄砲を討て', limit: 90,
      say: [['組頭', '石段を登る前田の鉄砲じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '石段を登る前田の鉄砲', from: { x: GOSHUDEN.x + 20, z: GOSHUDEN.z + 2 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '石段を登る前田の鉄砲を破った' },
    { kind: 'fight', at: OKU, limit: 140, obj: '別の尾根から入った上杉の兵を、金子丸の下の坂で食い止める', title: '山の奥へ', sub: '搦手から上杉勢が入った',
      say: [['横地監物', '……ここまでじゃ。生きて殿に城の最後を伝えよ。奥の道へ', 3.4]],
      foes: [{ name: '搦手から回った上杉の手', from: { x: A.kaneko.x, z: A.kaneko.z + 2 }, list: [busho('上杉の侍大将', { mustLive: false, invuln: false }), uS(2), uA(14)] }],
      reward: '山の奥の道を開いて落ちた' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OKU.x + -12, z: OKU.z + -14 }, obj: '尾根の道で、追って来る上杉の足軽を払え', limit: 90,
      say: [['組頭', '追って来る上杉の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '追って来る上杉の足軽', from: { x: OKU.x + -20, z: OKU.z + -24 }, list: [uS(2), uA(10)] }],
      reward: '追って来る上杉の足軽を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '城の内が乱れておりまする。曲輪ごとに、持ち場が崩れ始めました', 3.4],
      ['横地様', '本丸の高丸へ退く。ここで追手を引き付け、一人でも多く退かせよ', 3.4]] },
    { kind: 'hold', at: { x: A.taka.x + 14, z: A.taka.z + 10 }, label: '高丸の下', obj: '本丸の高丸の下まで退き、追う前田の兵を引き付ける', r: 16, dur: 70, title: '高丸', sub: '前田の兵が尾根を回って来る',
      say: [['横地様', '一人でも多く落とせ。ここで少し持て', 3]],
      waves: [
        { t: 3, foes: [{ name: '尾根の前田', from: { x: A.taka.x + 30, z: A.taka.z + 26 }, list: [{ type: 'samurai', n: 1, o: { name: '前田の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '上からも来る！'], foes: [{ name: '小宮曲輪の上杉', from: { x: A.matsuki.x + 20, z: A.matsuki.z + 10 }, list: [uS(2), uA(10), uG(2)] }] }],
      reward: '高丸の下で追手を引き付けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: { x: A.taka.x + 14, z: A.taka.z + 10 }.x + 14, z: { x: A.taka.x + 14, z: A.taka.z + 10 }.z + -10 }, obj: '高丸の下の岩陰で、回り込む前田の別手を払え', limit: 90,
      say: [['組頭', '回り込む前田の別手じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '回り込む前田の別手', from: { x: { x: A.taka.x + 14, z: A.taka.z + 10 }.x + 22, z: { x: A.taka.x + 14, z: A.taka.z + 10 }.z + -20 }, list: [uS(2), uA(10)] }],
      reward: '回り込む前田の別手を破った' },
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['横地監物', '……本丸はもう持たぬ。城は落ちる', 3.4],
      ['組頭', '山を渡る風の音だけじゃ。鬨の声も、もう遠い', 3.4]] },
  ],
  win: {
    banner: '八王子城の落城', sub: '城は一日で落ちた。戦の後の山は静かだった', award: '落城の中を落ち延びた',
    say: [['横地監物', '城は守れなんだ。じゃが、守った者がいたことは伝えよ', 3.4],
      ['組頭', '小田原へ行くぞ。殿に伝えねばならぬ', 3]],
  },
});
// K651：豊臣編の八王子城の地面・霧の夜・谷の道・林をそのまま使う（getter も写すため descriptor ごと）。逃げ切る向きだけ入れ替える（寄せ手は谷の下・城方は尾根の奥）
h08_hachioji.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(HACHI_WORLD));
h08_hachioji.world.fleeOut = (x, z, team) => (team === 1 ? x > 245 : z < -170 || x < -130);
delete h08_hachioji.world.fleeWay;   // 豊臣編の「城兵は本丸の西口へ退く」道は、ここでは寄せ手の側になるので使わない
// 戦場を建てる（豊臣編の八王子城と同じ所・曲輪の柵と館は北条の物）→ 軽い型の setup（北条の組・段）
// 11/26 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：豊臣編の寄せ手の布陣（HACHI_ARMY）を側を入れ替えて置く＝
//   前田利家の本陣（陣幕の床几）・手勢・前田の先手・利長の旗本・前田の二の手（寄せ口の谷の下）、陣立ての表（前田・上杉の備七つ）と布陣の表（谷の北と東の野の寄せ手の備）。
//   豊臣編の筋（霧の谷→山下曲輪→曳橋→御主殿→坂→本丸）は前田の本人の物なので使わず、北条の本人の段はこの紙の段
h08_hachioji.sideFlip = true;
h08_hachioji.depth = HACHI_DEPTH(true);
h08_hachioji.realCap = t11_hachioji.realCap;   // 本物の兵の上限も豊臣編と同じ（携帯は 250 のまま・パソコンは布陣の表の分を足す）
{ const [x, z] = t11_hachioji.marchIn.road[0]; const P = { x, z }; h08_hachioji.lazyFrom = () => P; }   // 布陣の表の備・陣立ての厚みは、豊臣編の本人の入る所（谷の東の下）から測って立てる＝豊臣編と同じ時に同じ備
{ const s0 = h08_hachioji.setup; h08_hachioji.setup = function* (rt) {
  hachiSide(true);   // K661：前田・上杉方 team 1・北条方 team 0
  yield* hachiojiField(rt, { team: 0 });
  rt.world.setTime('night', true);
  HACHI_ARMY.maeda(rt);   // 豊臣編と同じ所・同じ数の前田勢
  HACHI_ARMY.hold(rt);    // 寄せ口の谷の下で待つ（豊臣編で本人と段が動かす前と同じ）
  yield;
  s0.call(this, rt);
}; }
// 御主殿へ退く頃に夜が白む（豊臣編と同じ）
{ const u0 = h08_hachioji.update; h08_hachioji.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags;
  if (!F.h08Dawn && (F.step || 0) >= 2) { F.h08Dawn = true; rt.world.setTime('morning'); if (rt.world.fade) rt.world.fade.dur = 150; }
}; }
export default h08_hachioji;
