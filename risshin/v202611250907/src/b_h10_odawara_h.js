// 北条家編 十五戦目「小田原の陣」（天正十八年〔1590〕四月〜七月五日・相模国 小田原）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t12_odawara・伊達編 e06_odawara の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。城と町は豊臣編 t12 の戦場（K651）。
//   史実：豊臣秀吉は二十万ほどで小田原を囲み、石垣山に城を築いた。北条は惣構えに籠もり、太田氏房は蒲生氏郷の陣へ夜討ちをかけた。
//   支城が次々と落ち、七月五日に北条氏直は城を出て降った（小田原市の解説 C・『北条五代記』B。夜討ちの細部は推）。
//   主人公は氏直の使番の組。①惣構えの早川口で受ける ②太田氏房と夜討ち ③惣構えの大寄せを受ける。終わりは開城（降る場面）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { odawaraField, ODAWARA_FIELD, ODAWARA_WORLD, ODAWARA_AT } from './b_t12_odawara.js';   // K651：豊臣編の小田原の陣の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と 1561 年の城の絵）をやめ、
//   豊臣編 t12 の小田原（総構えの土塁と堀・早川口の枡形・城下町・早川・海の船・石垣山の一夜城・囲みの陣の帯）を odawaraField で建てる。
//   本人は総構えの内（北条の側）。行き先は小田原の物差し（ODAWARA_AT）で置く（−x が総構えの外の西・早川口の外に豊臣の陣）
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
    { name: '北条氏直の旗本', at: { x: GATE.x + 20, z: GATE.z - 6 }, fixed: true, list: [busho('北条氏直'), uS(4), uA(6)] },
    { name: '太田氏房の手', at: { x: GATE.x + 6, z: GATE.z - 6 }, list: [busho('太田氏房'), uS(2), uA(12)] },
    { name: '早川口の鉄砲衆', at: { x: GATE.x + 4, z: GATE.z + 8 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏直', '景虎も信玄も、この城は落とせなんだ。秀吉も同じじゃ', 3.2],
      ['組頭', '……じゃが、支城の狼煙は一つも上がらぬ', 3]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '惣構えの早川口で、豊臣の寄せ手を受け止める', r: 16, dur: 90, title: '早川口', sub: '豊臣の兵が惣構えの堀へ寄せる',
      say: [['豊臣の侍', '堀を越えよ！　北条を追い詰めよ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '宇喜多の先手', from: { x: G0.x - 34, z: G0.z + 2 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 堀' } }, uS(3), uA(18)] }] },
        { t: 34, say: ['見張り', '鉄砲が並んだ！'], foes: [{ name: '宇喜多の鉄砲', from: { x: G0.x - 30, z: G0.z + 14 }, list: [uS(1), uG(8)] }] },
        { t: 60, say: ['組頭', '堀を渡って来たぞ！　槍で落とせ！'], foes: [{ name: '堀を渡る豊臣の手', from: { x: G0.x - 32, z: G0.z - 12 }, list: [uS(2), uA(14)] }] }],
      reward: '早川口で寄せ手を受け止めた' },
    { kind: 'move', at: OUT, label: '早川口の外', obj: '夜、太田氏房と早川口を出る', r: 10, max: 90,
      say: [['太田氏房', '籠もるだけでは士気が落ちる。今夜、蒲生の陣を突くぞ', 3.2]] },
    { kind: 'fight', at: GAMO, limit: 150, obj: '太田氏房と夜討ちに出て、蒲生の陣を突く', title: '夜討ち', sub: '惣構えの外へ打って出る',
      say: [['太田氏房', '声を立てるな。幕の内へ斬り込め', 3.2]],
      foes: [{ name: '蒲生氏郷の陣', from: { x: GAMO.x - 4, z: GAMO.z - 8 }, list: [busho('蒲生の侍大将', { mustLive: false, invuln: false }), uS(2), uA(20)] }],   // 寝込みを突く（11/25 K651：侍四人に囲まれて倒れた→二人）
      later: [{ t: 30, say: ['蒲生の侍', '夜討ちじゃ！　陣を固めよ！'], foes: [{ name: '蒲生の二の手', from: { x: GAMO.x - 10, z: GAMO.z - 24 }, list: [uS(2), uA(12)] }] }],
      reward: '夜討ちで蒲生の陣を突いた' },
    // 11/25 K651：act bot が夜討ちの後そのまま大寄せの段に入り、傷を負ったまま倒れた（2回）→ 早川口へ戻って一息（手当て）を挟む
    { kind: 'move', at: GATE, label: '早川口', obj: '夜明け前に、早川口の内へ戻る', r: 10, max: 100 },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['組頭', '傷を縛れ。夜が明ける', 2.8]] },
    { kind: 'hold', at: GATE, label: '早川口', obj: '早川口へ戻り、豊臣の大寄せを受け止める', r: 16, dur: 90, title: '石垣山', sub: '一夜で城が現れた',
      say: [['見張り', '石垣山に城が……一夜で建ったぞ！', 3.2], ['北条氏直', '動じるな。持ち場を守れ', 3]],
      waves: [
        { t: 4, foes: [{ name: '豊臣の大寄せ', from: { x: G0.x - 34, z: G0.z - 4 }, list: [uS(3), uA(16)] }] },
        { t: 34, foes: [{ name: '豊臣の新手', from: { x: G0.x - 36, z: G0.z + 12 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 池田' } }, uS(2), uA(12)] }] },
        { t: 62, say: ['見張り', '三の手じゃ！'], foes: [{ name: '豊臣の三の手', from: { x: G0.x - 32, z: G0.z - 16 }, list: [uS(2), uA(12)] }] }],
      reward: '早川口で大寄せを受け止めた' },
  ],
  win: {
    banner: '小田原の開城', sub: '支城はすべて落ち、氏直は城を出て降った', award: '小田原の籠城を最後まで務めた',
    say: [['北条氏直', '城兵の命と引き換えに、わしが城を出る', 3.4],
      ['組頭', '早雲様から五代。城は最後まで落ちなんだ。開いたのじゃ', 3.4]],
  },
});
// K651：豊臣編の小田原の地面・総構え・堀・早川・海・草木をそのまま使う（getter も写すため descriptor ごと）。逃げ切る向きだけ入れ替える（寄せ手は西の外・城方は城の内）
h10_odawara_h.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ODAWARA_WORLD));
h10_odawara_h.world.fleeOut = (x, z, team) => (team === 1 ? x < -130 : x > 40);
// 戦場を建てる（豊臣編の小田原と同じ所）→ 昼に戻す（豊臣編の始めと同じ）→ 軽い型の setup（北条の組・段）
{ const s0 = h10_odawara_h.setup; h10_odawara_h.setup = function* (rt) {
  yield* odawaraField(rt);
  const W = rt.world; W.setTime('day', true); W.setRainTarget?.(0); W.rainLevel = 0; if (W.mountains) W.mountains.visible = true;
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
