// 北条家編 十二戦目「山中城の戦い」（天正十八年〔1590〕三月二十九日・伊豆国 山中城）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   豊臣編 t09_yamanaka の同じ戦の、城の内の側（重い作りは写さず、軽い型で北条の側から）。
//   史実：豊臣秀次を大将に七万ほどが、松田康長・北条氏勝ら四千ほどの守る山中城（箱根の西の坂）を攻め、城は半日で落ちた。
//   岱崎出丸の間宮康俊、城将の松田康長は討死し、北条氏勝は囲みを抜けて玉縄城へ退いた（三島市の解説 C・『北条五代記』B）。
//   主人公は氏勝の組。①岱崎出丸で寄せ手を受ける ②三の丸の門で受ける ③氏勝の退き道を開く（負け戦・落城）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { yamanakaField, YAMA_WORLD, YAMA_AT } from './b_t09_yamanaka.js';   // K651：豊臣編の山中城の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘）をやめ、豊臣編 t09 の山中城
//   （箱根の標高・岱崎出丸・障子堀・三の丸の大手の枡形・二の丸・本丸・東海道）を yamanakaField で建てる。柵と門は北条（本人の側）の物。
//   行き先は山中城の物差し（YAMA_AT）で置く（+z が三島の側＝寄せ手・−z が箱根の峠＝本丸）
const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TOYO = { flag: 'toyotomi', armor: 0x3a2a1e };
const K = YAMA_AT.kuruwa, SP = YAMA_AT.sp;
const SPAWN = { x: K.dai.x + 6, z: K.dai.z - 4 };          // 岱崎出丸の中（東の柵の内）
const DEMARU = { x: K.dai.x + 12, z: K.dai.z };            // 出丸の東の口（柵の内。土橋の向こうから一柳・中村が寄せる）
const KITA = { x: K.dai.x - 6, z: YAMA_AT.shoji.z0 - 20 }; // 出丸の北の口を出て、障子堀の西を回る道
const SANNO = { x: SP.x - 16, z: SP.z - 22 };              // 三の丸の内（大手の門の西）
const NIGE = { x: K.ni.x, z: K.ni.z + 14 };                // 二の丸の口（箱根の峠へ落ちる道）

export const h15_yamanaka = lightBattle({
  id: 'h15_yamanaka',
  date: '天正十八年（1590）三月二十九日　春・晴れ　伊豆国 山中城',
  intro: '箱根の西の山中城。秀次の七万が坂を上って来る。守りは四千。',
  history: '天正十八年（1590）三月、豊臣秀次を大将に七万ほどが、北条の山中城を攻めた。守りは松田康長・北条氏勝ら四千ほど。岱崎出丸の間宮康俊、城将の松田康長は討死し、城は半日で落ちた。北条氏勝は囲みを抜けて玉縄城へ退いた。',
  sides: { a: { name: '山中城の城方', mon: 'hojo', faction: 'hojo' }, b: { name: '豊臣秀次の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 4000, b: 70000, la: 0.6, lb: 0.03 },   // K652①：討ち取りに合わせて少しずつ。城方は半日で大方討たれ、寄せ手の損は小さい
  allyLook: HOJO, foeLook: TOYO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI / 2 },   // 東（土橋）を向く
  world: { seed: 1590, time: 'morning' },   // 下で豊臣編の山中城の world に置き換える（K651）
  allies: [
    { name: '間宮康俊の手', at: { x: DEMARU.x - 4, z: DEMARU.z - 8 }, list: [busho('間宮康俊', { mustLive: false, invuln: false }), uS(3), uA(12)] },
    { name: '北条氏勝の旗本', at: { x: SANNO.x - 6, z: SANNO.z - 14 }, fixed: true, list: [busho('北条氏勝'), uS(4), uA(6)] },
    { name: '城の鉄砲衆', at: { x: DEMARU.x - 4, z: DEMARU.z + 8 }, list: [uS(1), uG(10)] },
    { name: '三の丸の足軽', at: { x: SANNO.x + 6, z: SANNO.z - 4 }, list: [uS(2), uA(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏勝', '城はまだ作りかけじゃ。じゃが、ここで止めねば箱根が抜かれる', 3.4],
      ['組頭', '岱崎の出丸へ行け。間宮様の手に加われ', 3]] },
    { kind: 'hold', at: DEMARU, label: '岱崎出丸', obj: '岱崎出丸で、坂を上る寄せ手を受け止める', r: 16, dur: 80, title: '岱崎出丸', sub: '豊臣の旗が坂を埋めて上って来る',
      say: [['間宮康俊', '撃て！　坂の上はわしらじゃ！', 3]],
      waves: [
        { t: 3, say: ['豊臣の侍', '出丸を揉み潰せ！'], foes: [{ name: '一柳直末の手', from: { x: DEMARU.x + 30, z: DEMARU.z + 2 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 一柳' } }, uS(2), uA(14)] }] },
        { t: 34, say: ['見張り', '新手じゃ！　数が知れぬ！'], foes: [{ name: '中村一氏の手', from: { x: DEMARU.x + 32, z: DEMARU.z + 14 }, list: [uS(1), uA(10)] }] },
        { t: 60, foes: [{ name: '豊臣の鉄砲', from: { x: DEMARU.x + 34, z: DEMARU.z - 10 }, list: [uS(1), uG(8)] }] }],
      reward: '岱崎出丸で寄せ手を受け止めた' },
    // K652⑥ 逸話の段：七十三の間宮康俊は出丸に踏みとどまって討死した（『北条五代記』B）。本人はその横で最後の寄せを斬る
    { kind: 'fight', at: DEMARU, limit: 90, obj: '間宮様の横で、柵を越えた寄せ手を斬る', title: '間宮康俊', sub: '老将は退かぬ',
      say: [['間宮康俊', '年寄りは退かぬ。若い者は三の丸へ行け。じゃが、その前にもう一度だけ斬れ', 3.6]],
      foes: [{ name: '柵を越えた一柳の手', from: { x: DEMARU.x + 14, z: DEMARU.z + 4 }, list: [{ type: 'samurai', n: 1, o: { name: '一柳の侍' } }, uS(2), uA(8)] }],
      reward: '間宮康俊の横で斬った' },
    { kind: 'rest', dur: 8, heal: 0.3, banner: ['間宮康俊 討死', '岱崎出丸'], say: [['組頭', '間宮様、お討死……。北の口から三の丸へ退け！', 3.2]] },
    { kind: 'move', at: KITA, label: '障子堀の西', obj: '出丸の北の口を出て、障子堀の西を三の丸へ退く', r: 12, max: 100 },
    { kind: 'hold', at: SANNO, label: '三の丸の内', obj: '三の丸の内で、大手と東の尾根から入った寄せ手を受ける', r: 16, dur: 70, title: '三の丸', sub: '大手の門が破られた',
      say: [['使番', '大手の門が破られた！　堀秀政の手が東の尾根から回ったぞ！', 3.2]],
      waves: [
        { t: 4, foes: [{ name: '秀次の寄せ手', from: { x: SP.x + 18, z: SP.z - 26 }, list: [uS(2), uA(14)] }] },
        { t: 36, foes: [{ name: '堀秀政の手', from: { x: SP.x + 34, z: SP.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '豊臣の組頭 渡辺' } }, uS(1), uA(10)] }] }],
      reward: '三の丸の門で寄せ手を受けた' },
    { kind: 'fight', at: NIGE, limit: 140, obj: '二の丸の口を塞ぐ豊臣の手を崩し、氏勝様を落とす', title: '落ちる道', sub: '松田様、お討死。城は落ちる',
      say: [['北条氏勝', '……城はもたぬ。玉縄へ落ちる。道を開け', 3.2]],
      foes: [{ name: '西の丸から回った豊臣の手', from: { x: NIGE.x - 4, z: NIGE.z - 16 }, list: [busho('豊臣の侍大将', { mustLive: false, invuln: false }), uS(3), uA(20)] }],
      reward: '退き道を開き、氏勝を落とした' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['北条氏勝', 'わしは玉縄へ戻る。そなたらは峠の道で、追手を一度止めよ', 3.4],
      ['組頭', '振り返るな。氏勝様が峠を越えるまでじゃ', 3]] },
    { kind: 'hold', at: NIGE, label: '峠の道', obj: '箱根の峠の道で、氏勝様を追う豊臣の手を止める', r: 16, dur: 70, title: '峠の道', sub: '豊臣の追手が二の丸を抜けて来る',
      say: [['組頭', '道は狭い。ここなら少ない兵でも止められる', 3]],
      waves: [
        { t: 3, foes: [{ name: '豊臣の追手', from: { x: SANNO.x + 8, z: SANNO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '中村の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '鉄砲じゃ！　伏せよ'], foes: [{ name: '豊臣の鉄砲', from: { x: SANNO.x - 14, z: SANNO.z + 6 }, list: [uS(1), uG(6), uA(8)] }] }],
      reward: '峠の道で追手を止め、氏勝様が落ちた' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'fight', at: SANNO, limit: 140, obj: '三の丸へ取って返し、残った城兵を助けに斬り込む', title: '取って返し', sub: '三の丸にまだ味方が残る',
      say: [['組頭', '一人でも多く連れて落ちる。斬り込め！', 3]],
      foes: [{ name: '三の丸の豊臣', from: { x: SANNO.x + 10, z: SANNO.z + 10 }, list: [busho('豊臣の侍大将', { mustLive: false, invuln: false }), uS(3), uA(14), uG(3)] }],
      reward: '三の丸の味方を連れて落ちた' },
  ],
  win: {
    banner: '山中城の落城', sub: '城は半日で落ちたが、氏勝は玉縄へ落ちた', award: '落城の中で氏勝を落とした',
    say: [['北条氏勝', '間宮も松田も死んだ。わしは生きて、玉縄を守る', 3.4],
      ['組頭', '箱根が抜かれた。次は小田原じゃ', 3]],
  },
});
// K651：豊臣編の山中城の地面・堀・霧・道・林をそのまま使う（getter も写すため descriptor ごと）。逃げ切る向きだけ入れ替える（寄せ手は三島の側・城方は箱根の峠）
h15_yamanaka.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(YAMA_WORLD));
h15_yamanaka.world.fleeOut = (x, z, team) => (team === 1 ? z > 232 : z < -175);
// 戦場を建てる（豊臣編の山中城と同じ所・柵と門は北条の物・狭間の鉄砲は出さない）→ 軽い型の setup（北条の組・段）
{ const s0 = h15_yamanaka.setup; h15_yamanaka.setup = function* (rt) { yield* yamanakaField(rt, { team: 0, fire: false }); s0.call(this, rt); }; }
// 三の丸の段に入ったら大手の門と枡形の内の門を開ける（破られた形。寄せ手が門から入る）
{ const u0 = h15_yamanaka.update; h15_yamanaka.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags, K2 = F.K;
  // 出丸の段が済んだら、東の柵（土橋の正面）が破られる（間宮の段の寄せ手が柵を越えて来る）
  if (!F.h15Break && (F.step || 0) >= 1 && F.daiWall) {
    F.h15Break = true;
    for (const w of F.daiWall) {
      const cx = (w.seg[0] + w.seg[2]) / 2, cz = (w.seg[1] + w.seg[3]) / 2;
      if (!w.alive || cx < K.dai.x + 14 || Math.abs(cz - K.dai.z) > 9) continue;
      w.alive = false; w.hp = 0; w.hitFrom = { x: cx + 4, z: cz }; rt.army.structFall?.(w);
    }
  }
  if (!F.h15Open && (F.step || 0) >= 3 && K2) {
    F.h15Open = true;
    for (const G of [K2.gate, K2.masu?.inner]) if (G?.struct && !G.struct.opened) { G.struct.opened = true; G.open?.(); }
  }
}; }
export default h15_yamanaka;
