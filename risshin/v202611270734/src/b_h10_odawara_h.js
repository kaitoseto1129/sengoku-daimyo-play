// 北条家編 十五戦目「小田原の陣」（天正十八年〔1590〕四月〜七月五日・相模国 小田原）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t12_odawara・伊達編 e06_odawara の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。城と町は豊臣編 t12 の戦場（K651）。
//   史実：豊臣秀吉は二十万ほどで小田原を囲み、石垣山に城を築いた。北条は惣構えに籠もり、太田氏房は蒲生氏郷の陣へ夜討ちをかけた。
//   支城が次々と落ち、七月五日に北条氏直は城を出て降った（小田原市の解説 C・『北条五代記』B。夜討ちの細部は推）。
//   主人公は氏直の使番の組。①惣構えの早川口で受ける ②太田氏房と夜討ち ③惣構えの大寄せを受ける。終わりは開城（降る場面）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { odawaraField, ODAWARA_FIELD, ODAWARA_WORLD, ODAWARA_AT, ODAWARA_ARMY, ODAWARA_DEPTH, odawaraSide, t12_odawara } from './b_t12_odawara.js';   // K651：豊臣編の小田原の陣の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と 1561 年の城の絵）をやめ、
//   豊臣編 t12 の小田原（総構えの土塁と堀・早川口の枡形・城下町・早川・海の船・石垣山の一夜城・囲みの陣の帯）を odawaraField で建てる。
//   本人は総構えの内（北条の側）。行き先は小田原の物差し（ODAWARA_AT）で置く（−x が総構えの外の西・早川口の外に豊臣の陣）
// 11/25 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：豊臣編の両軍の布陣（ODAWARA_ARMY）を側を入れ替えて置く＝
//   井伊・松平の手と家康の旗本（豊臣・東の酒匂川の側）・囲みの陣の見張り・篠曲輪の山角康定の鉄砲と弓・総構えの土塁の上の鉄砲と槍の四組・本丸の氏直・氏政・氏照と旗本、
//   陣立ての表（豊臣の備五つ・北条の備四つ。本人が近づくと本物の兵に替わる）。総構えの塀・堀・櫓は豊臣編と同じ物（塀は柵の struct ではなく形だけ＝側は無い）。
//   豊臣編の筋（陣回り・石垣山の普請・官兵衛の使い）は豊臣の本人の物なので使わず、北条の本人の段（早川口・夜討ち・大寄せ・仕寄り）はこのまま。
//   氏直は本丸の床几に座る（布陣の通り）。前は早川口の旗本の組にもう一人の氏直を置いていた→旗本の組だけにした
const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TOYO = { flag: 'toyotomi', armor: 0x3a2a1e };
const G0 = ODAWARA_AT.gate;
const GATE = { x: G0.x + 8, z: G0.z - 9 };        // 惣構えの早川口の内（枡形の土塁の南を回った所）
const SPAWN = { x: G0.x + 24, z: G0.z - 8 };
const OUT = { x: G0.x - 16, z: G0.z - 4 };        // 早川口を出た土橋の先
const GAMO = { x: -66, z: -100 };                 // 総構えの西の外の豊臣方の陣（蒲生氏郷の陣に当てた）

export const h10_odawara_h = lightBattle({
  id: 'h10_odawara_h',
  date: '天正十八年（1590）六月　夏・晴れ　相模国 小田原',
  intro: '秀吉の二十万が小田原を囲んだ。支城は次々と落ちる。三度目の籠城。今度は、どこからも後詰は来ない。',
  history: '天正十八年（1590）、豊臣秀吉は二十万ほどで小田原を囲み、石垣山に城を築いた。北条は惣構えに籠もり、太田氏房は蒲生氏郷の陣へ夜討ちをかけた。支城が次々と落ち、七月五日に北条氏直は城を出て降った。北条の五代は、ここで終わった。',
  sides: { a: { name: '北条氏直の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '豊臣秀吉の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 50000, b: 200000, la: 0.08, lb: 0.03 },   // K652①：討ち取りに合わせて少しずつ。囲みの間の小競り合いで、両方の損は小さい
  allyLook: HOJO, foeLook: TOYO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.35,   // 11/25 K651：豊臣編の小田原の総構えの外の夜討ちで、信長で出陣の試し（act bot）が蒲生の陣で侍に囲まれ倒れた（162秒・侍の傷140）→ 0.45→0.35
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },   // 西（早川口）を向く
  world: { seed: 1593, time: 'day' },   // 下で豊臣編の小田原の world に置き換える（K651）
  allies: [
    { name: '北条氏直の旗本', at: { x: GATE.x + 20, z: GATE.z - 6 }, fixed: true, list: [uS(4), uA(6)] },   // K661：氏直その人は本丸（ODAWARA_ARMY.hojoHon）
    { name: '太田氏房の手', at: { x: GATE.x + 6, z: GATE.z - 6 }, list: [busho('太田氏房'), uS(2), uA(12)] },
    { name: '早川口の鉄砲衆', at: { x: GATE.x + 4, z: GATE.z + 8 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    // K721（11/26）要件書の流れ（普通の攻城戦にしない）：①惣構えを見回る ②早川口を守る ③夜に打って出る ④豊臣の陣を襲う ⑤夜明け前に戻る ⑥仕寄りを壊す ⑦大寄せを防ぐ ⑧石垣山を見る ⑨評定 ⑩開城
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏直', '見よ。城の外を囲む旗を。徳川、上杉、前田、毛利、長宗我部、伊達……これまで戦った顔がみな、秀吉の下で一つの軍としてこちらを向いておる', 4.2],
      ['組頭', '景虎も信玄も、この城は落とせなんだ。……じゃが、支城の狼煙は一つも上がらぬ', 3.2]] },
    { kind: 'move', at: { x: GATE.x - 4, z: GATE.z + 6 }, label: '惣構え', obj: '惣構えの土塁の上を見回り、囲む全国の旗を見渡す', r: 10, max: 100,
      say: [['組頭', 'どこまでも旗じゃ。惣構えは長い。持ち場を忘れるな', 3.2]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '惣構えの早川口で、豊臣の寄せ手を受け止める', r: 16, dur: 90, title: '早川口', sub: '豊臣の兵が惣構えの堀へ寄せる',
      say: [['豊臣の侍', '堀を越えよ！　北条を追い詰めよ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '宇喜多の先手', from: { x: G0.x - 34, z: G0.z + 2 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 堀' } }, uS(3), uA(18)] }] },
        { t: 34, say: ['見張り', '鉄砲が並んだ！'], foes: [{ name: '宇喜多の鉄砲', from: { x: G0.x - 30, z: G0.z + 14 }, list: [uS(1), uG(8)] }] },
        { t: 60, say: ['組頭', '堀を渡って来たぞ！　槍で落とせ！'], foes: [{ name: '堀を渡る豊臣の手', from: { x: G0.x - 32, z: G0.z - 12 }, list: [uS(2), uA(14)] }] }],
      reward: '早川口で寄せ手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GATE.x + -14, z: GATE.z + -12 }, obj: '堀の縁で、土橋を渡る豊臣の足軽を討て', limit: 90,
      say: [['組頭', '土橋を渡る豊臣の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '土橋を渡る豊臣の足軽', from: { x: GATE.x + -22, z: GATE.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '土橋を渡る豊臣の足軽を破った' },
    { kind: 'move', at: OUT, label: '早川口の外', obj: '夜、太田氏房と早川口を出る', r: 10, max: 90,
      say: [['太田氏房', '籠もるだけでは士気が落ちる。今夜、蒲生の陣を突くぞ', 3.2]] },
    { kind: 'fight', at: GAMO, limit: 150, obj: '太田氏房と夜討ちに出て、蒲生の陣を突く', title: '夜討ち', sub: '惣構えの外へ打って出る',
      say: [['太田氏房', '声を立てるな。幕の内へ斬り込め', 3.2]],
      foes: [{ name: '蒲生氏郷の陣', from: { x: GAMO.x - 4, z: GAMO.z - 8 }, list: [busho('蒲生の侍大将', { mustLive: false, invuln: false }), uS(2), uA(20)] }],   // 寝込みを突く（11/25 K651：侍四人に囲まれて倒れた→二人）
      later: [{ t: 30, say: ['蒲生の侍', '夜討ちじゃ！　陣を固めよ！'], foes: [{ name: '蒲生の二の手', from: { x: GAMO.x - 10, z: GAMO.z - 24 }, list: [uS(2), uA(12)] }] }],
      reward: '夜討ちで蒲生の陣を突いた' },
    // 11/25 K651：act bot が夜討ちの後そのまま大寄せの段に入り、傷を負ったまま倒れた（2回）→ 早川口へ戻って一息（手当て）を挟む
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GAMO.x + 14, z: GAMO.z + 8 }, obj: '蒲生の陣の厩で、馬を繋ぐ豊臣の兵を討て', limit: 90,
      say: [['組頭', '馬を繋ぐ豊臣の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '馬を繋ぐ豊臣の兵', from: { x: GAMO.x + 22, z: GAMO.z + -2 }, list: [uS(2), uA(10)] }],
      reward: '馬を繋ぐ豊臣の兵を破った' },
    { kind: 'move', at: GATE, label: '早川口', obj: '夜明け前に、早川口の内へ戻る', r: 10, max: 100 },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['組頭', '傷を縛れ。夜が明ける', 2.8]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '早川口へ戻り、朝、石垣山に現れた城を横目に、豊臣の大寄せを受け止める', r: 16, dur: 90, title: '石垣山', sub: '一夜で城が現れた',
      say: [['見張り', '石垣山に城が……一夜で建ったぞ！', 3.2], ['北条氏直', '動じるな。持ち場を守れ', 3]],
      waves: [
        { t: 4, foes: [{ name: '豊臣の大寄せ', from: { x: G0.x - 34, z: G0.z - 4 }, list: [uS(3), uA(16)] }] },
        { t: 34, foes: [{ name: '豊臣の新手', from: { x: G0.x - 36, z: G0.z + 12 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 池田' } }, uS(2), uA(12)] }] },
        { t: 62, say: ['見張り', '三の手じゃ！'], foes: [{ name: '豊臣の三の手', from: { x: G0.x - 32, z: G0.z - 16 }, list: [uS(2), uA(12)] }] }],
      reward: '早川口で大寄せを受け止めた' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '豊臣の手が早川口の堀へ竹束を寄せ、仕寄りを作っておりまする', 3.2],
      ['太田氏房', '仕寄りが堀に届けば、口が危うい。出て崩せ', 3.2]] },
    { kind: 'fight', at: OUT, limit: 140, obj: '早川口を出て、堀へ寄せる豊臣の仕寄りの手を崩す', title: '仕寄り', sub: '竹束が土橋の先に並ぶ',
      say: [['組頭', '竹束の後ろへ回れ。前から突いても槍が通らぬ', 3]],
      foes: [{ name: '豊臣の仕寄りの手', from: { x: OUT.x - 14, z: OUT.z - 16 }, list: [{ type: 'samurai', n: 1, o: { name: '細川の組頭' } }, uS(3), uA(16), uG(3)] }],
      later: [{ t: 30, say: ['見張り', '池田の兵が助けに来る！'], foes: [{ name: '池田の手', from: { x: OUT.x - 30, z: OUT.z + 10 }, list: [uS(2), uA(12)] }] }],
      reward: '早川口の外の仕寄りを崩した' },
    // 11/26 act bot が仕寄りの後 586秒で倒れた→押し返しの前に早川口で一息（手当て）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OUT.x + 16, z: OUT.z + -12 }, obj: '仕寄りの後ろで、竹束を守る豊臣の鉄砲を討て', limit: 90,
      say: [['組頭', '竹束を守る豊臣の鉄砲じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '竹束を守る豊臣の鉄砲', from: { x: OUT.x + 24, z: OUT.z + -22 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '竹束を守る豊臣の鉄砲を破った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['組頭', '傷を縛れ。まだ来るぞ', 2.8]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '早川口へ戻り、仕寄りを崩された豊臣の押し返しを受け止める', r: 16, dur: 70, title: '押し返し', sub: '豊臣の兵が口へ寄せる',
      say: [['太田氏房', '籠城は三月になる。まだ落ちぬと見せてやれ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '豊臣の寄せ手', from: { x: OUT.x - 10, z: OUT.z - 30 }, list: [uS(3), uA(16)] }] },
        { t: 32, say: ['見張り', '新手じゃ！'], foes: [{ name: '豊臣の新手', from: { x: OUT.x - 26, z: OUT.z + 20 }, list: [busho('豊臣の侍大将', { mustLive: false, invuln: false }), uS(2), uA(10)] }] }],
      reward: '早川口で豊臣の押し返しを受け止めた' },
    // K656/K658：史実の終わり（支城が落ち、氏政・氏照が切腹、氏直は家康の婿として助命され降る）
    { kind: 'rest', dur: 10, heal: 0.2, title: '開城の使い', sub: '氏政・氏照の切腹と氏直の降伏', say: [
      ['使番', '支城はすべて落ちました。徳川殿が、氏直様の命だけは助けると', 3.2],
      ['北条氏直', '父と叔父の腹で、城兵の命を買う。わしが城を出よう', 3.4]] },
    { kind: 'move', at: { x: SPAWN.x + 4, z: SPAWN.z + 4 }, label: '本丸の庭', obj: '評定の間の外の庭で、主戦派と降伏派の論の結果を待つ', r: 10, max: 100,
      say: [['北条氏政', '籠城を続けるべきじゃ。ここで折れては関東の主の名が泣く', 3.4], ['北条氏直', '城の民と兵の命が先じゃ。……開城する', 3.4]] },
    { kind: 'move', at: GATE, label: '早川口', obj: '城門が開く。槍を置き、豊臣の軍を迎え入れる', r: 10, max: 100,
      say: [['組頭', '槍を置け。城門を開けよ。……北条の旗が、今、下がる', 3.4]] },
  ],
  win: {
    banner: '小田原の開城', sub: '支城はすべて落ち、氏直は城を出て降った', award: '城内の民と兵を生かしたまま、開城まで持ちこたえた',
    say: [['北条氏直', '城兵の命と引き換えに、わしが城を出る', 3.4],
      ['組頭', '早雲様から五代。城は最後まで落ちなんだ。開いたのじゃ', 3.4]],
  },
});
// K651：豊臣編の小田原の地面・総構え・堀・早川・海・草木をそのまま使う（getter も写すため descriptor ごと）。逃げ切る向きだけ入れ替える（寄せ手は西の外・城方は城の内）
h10_odawara_h.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ODAWARA_WORLD));
h10_odawara_h.world.fleeOut = (x, z, team) => (team === 1 ? x < -130 : x > 40);
// K661：側を入れ替えた写し（豊臣方 team 1・北条方 team 0）。陣立ての表・本物の兵の上限・重なりの散らしは豊臣編と同じ
h10_odawara_h.sideFlip = true;
h10_odawara_h.depth = ODAWARA_DEPTH(true);
h10_odawara_h.realCap = t12_odawara.realCap;
h10_odawara_h.holdUnstack = true;
h10_odawara_h.keepMix = true;
h10_odawara_h.lateUpdate = t12_odawara.lateUpdate;
// 戦場を建てる（豊臣編の小田原と同じ所）→ 昼に戻す（豊臣編の始めと同じ）→ 軽い型の setup（北条の組・段）
{ const s0 = h10_odawara_h.setup; h10_odawara_h.setup = function* (rt) {
  yield* odawaraField(rt);
  const W = rt.world; W.setTime('day', true); W.setRainTarget?.(0); W.rainLevel = 0; if (W.mountains) W.mountains.visible = true;
  odawaraSide(true);   // K661：豊臣方 team 1・北条方 team 0
  ODAWARA_ARMY.all(rt);   // 豊臣編と同じ順・同じ数の両軍の布陣
  ODAWARA_ARMY.hold(rt);   // 豊臣の手は陣で待つ（豊臣編で筋書きが下知を出す前と同じ）
  yield;
  s0.call(this, rt);
}; }
// 夜討ちの段は夜、戻ったら朝。石垣山の段で一夜城が林の陰から現れる（豊臣編と同じ一夜城・遠い眺めの写し）
{ const u0 = h10_odawara_h.update; h10_odawara_h.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags, n = F.step || 0;
  if (!F.h10Night && n >= 1) { F.h10Night = true; rt.world.setTime('night'); }
  // 早川口へ戻ったら、総構えの外に残った蒲生の兵は追って来ない（夜討ちの後の陣に残る）
  if (!F.h10Back && n >= 3) {
    F.h10Back = true;
    const P = rt.player?.u?.pos;
    for (const u of rt.army.units.slice()) if (u.alive && u.team === 1 && /蒲生/.test(u.group?.name || '') && (!P || Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 12)) { try { rt.army.despawn(u); } catch (e) { /* なし */ } }
  }
  if (!F.h10Ishi && n >= 4) { F.h10Ishi = true; rt.world.setTime('morning'); ODAWARA_FIELD.reveal(rt); }
  ODAWARA_FIELD.view(rt);
}; }
export default h10_odawara_h;
