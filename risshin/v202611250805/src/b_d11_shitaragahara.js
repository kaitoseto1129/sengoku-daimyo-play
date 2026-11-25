// 武田編 十一戦目「長篠・設楽原の戦い」（天正三年〔1575〕五月二十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：勝頼は長篠城の囲みを残し、設楽原で連吾川の向こうに馬防柵を三重に結んだ織田・徳川の三万八千へ、一万五千で攻めかかった。
//   山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した
//   （『信長公記』『甲陽軍鑑』・設楽原歴史資料館の案内）。主人公は山県昌景の赤備えの足軽。負け戦を生き延びるのが勝ち。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { shitaraField, SHITARA_WORLD, SHITARA_AT } from './b_shitaragahara.js';   // K651：織田の設楽原の戦場をそのまま使う（素材は写さない）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

// 11/25 K651（kaito「今の織田の長篠をコピーしたらできるじゃん。立場を入れ替えるだけでできるやつはそうしよう」）：
//   前の別の戦場（手書きの丘と一筋の柵）をやめ、織田の設楽原（b_shitaragahara.js）の地形・連吾川・三重の馬防柵・野の小物を shitaraField で建てる。
//   遊ぶ側を武田（柵の外から馬防柵へ攻める）に入れ替え、行き先は織田の戦場の物差し（SHITARA_AT）で置く。山県昌景は南の竹広（徳川の大久保の前）へ寄せた（布陣図 docs/fujin/shitaragahara.md）
const AKA = { flag: 'akazonae', armor: 0x8e1f16 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const FX = SHITARA_AT.fenceX, GAP = SHITARA_AT.gap, TAKE = SHITARA_AT.gates[2];   // 一の柵の x・柵の間・竹広の虎口の z
const SPAWN = { x: 82, z: TAKE - 6 };                         // 柵から七十m 東の野（田の東の縁。味方の組と一緒に寄せる。百三十m では本人だけ先に着いて囲まれた・act bot 11/25）
const KAWA = { x: SHITARA_AT.rengoX(TAKE + 4) + 9, z: TAKE + 4 };   // 連吾川の東の岸（柵の前の田）
const SAKU1 = { x: FX + 5, z: TAKE - 10 };     // 一の柵（徳川の大久保の前・竹広の虎口の北）
const SAKU2 = { x: FX + 5, z: TAKE - 55 };     // 二の柵の破れ目（竹広から北へ）
const SHINGARI = { x: 125, z: TAKE - 40 };     // 退き口（馬場の殿）
const GUN_Z = FX - 2 * GAP - 4;                // 柵の鉄砲は三の柵の後ろ（柵越しに撃つ）
export const d11_shitaragahara = lightBattle({
  id: 'd11_shitaragahara',
  date: '天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原',
  intro: '連吾川の向こうに、織田・徳川の馬防柵が三重に並ぶ。山県昌景の赤備えと共に、柵へ寄せよ。',
  history: '天正三年（1575）五月二十一日、武田勝頼は設楽原で、馬防柵を結んだ織田・徳川の大軍へ攻めかかった。山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した。武田の名のある将の多くがこの日に失われた。',
  sides: { a: { name: '山県昌景の赤備え', mon: 'takeda', faction: 'takeda' }, b: { name: '織田・徳川の柵の兵', mon: 'oda', faction: 'oda' } },
  force: { a: 15000, b: 38000 },
  allyLook: AKA, foeLook: ODA,
  minutes: 6,
  playerTaken: 0.35,   // 11/25 K651：織田の設楽原の田と沼（muddy・horiAt で足が落ちる）で寄せるので 0.45→0.35。11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },   // 西（柵）を向く
  world: { seed: 57 },   // 下で織田の設楽原の world に置き換える（K651）
  allies: [
    { name: '山県昌景の赤備え', at: { x: SPAWN.x - 8, z: SPAWN.z - 12 }, dmg: 0.15, list: [busho('山県昌景', { armor: AKA.armor }), uS(4), uA(16)] },
    { name: '内藤昌豊の手', at: { x: SPAWN.x - 6, z: SPAWN.z + 16 }, dmg: 0.15, list: [busho('内藤昌豊'), uS(3), uA(14)] },
    { name: '馬場信春の手', at: { x: SPAWN.x + 12, z: SPAWN.z }, dmg: 0.15, list: [busho('馬場信春'), uS(3), uA(12)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['山県昌景', '柵は三重。だが鉄砲は込めるのに間がある。撃ち終えた所へ駆け込め', 3.4],
      ['組頭', '赤備え、川を渡るぞ！', 2.6]] },
    { kind: 'move', at: KAWA, label: '連吾川の岸', obj: '連吾川を渡り、柵の前の岸へ寄せる', r: 12,
      say: [['物見', '柵の向こうで火縄の煙！　伏せよ！', 3]] },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を継げ、傷を縛れ。次が来るぞ', 2.8]] },   // 11/21 cloud-10（章の通し）：段の間の手当ての一息（41 の d13 と同じ形）
    { kind: 'fight', at: SAKU1, obj: '一の柵へ寄せ、柵の前に出た徳川の兵を討つ', title: '一の柵', sub: '柵の内から鉄砲が鳴る',
      say: [['山県昌景', '怯むな！　柵に取り付け！', 2.8], ['大久保忠世', '一人も柵を越えさせるな！', 2.6]],
      foes: [
        { name: '大久保の手', from: { x: SAKU1.x + 4, z: TAKE + 6 }, list: [uS(5), uA(35)] },
        { name: '柵の内の鉄砲', seek: 6, off: { x: GUN_Z - SAKU1.x, z: -4 }, from: { x: GUN_Z, z: SAKU1.z - 4 }, list: [uG(10)] }],
      later: [{ t: 25, say: ['物見', '柵の口から徳川の新手！'], foes: [{ name: '柵の口の新手', from: { x: FX + 3, z: TAKE + 10 }, list: [uS(3), uA(26)] }] }, { t: 55, say: ['組頭', 'まだ来るぞ！'], foes: [{ name: '大久保の二の手', from: { x: FX + 4, z: TAKE + 14 }, list: [uS(3), uA(22)] }] }],
      reward: '一の柵へ取り付いた' },
    { kind: 'fight', at: SAKU2, obj: '二の柵の破れ目で、出て来た織田の兵を押し返す', title: '二の柵', sub: '山県様が撃たれた——',
      say: [['赤備えの侍', '山県様、お討死！', 2.8], ['内藤昌豊', '山県の仇じゃ！　破れ目から押し込め！', 3]],
      foes: [
        { name: '織田の柵の兵', from: { x: SAKU2.x + 3, z: SAKU2.z - 12 }, list: [uS(6), uA(35)] },
        { name: '二の柵の鉄砲', seek: 6, off: { x: GUN_Z - SAKU2.x, z: 4 }, from: { x: GUN_Z, z: SAKU2.z + 4 }, list: [uG(8)] }],
      later: [{ t: 25, say: ['織田の侍', '破れ目を塞げ！'], foes: [{ name: '破れ目の新手', from: { x: SAKU2.x + 3, z: SAKU2.z + 14 }, list: [uS(3), uA(26)] }] }],
      reward: '二の柵の破れ目で戦った' },
    { kind: 'hold', at: SHINGARI, label: '退き口', obj: '退き口で馬場信春の殿と共に、追う織田・徳川を食い止める', r: 18, dur: 65,
      title: '殿', sub: '御屋形様を甲斐へ落とせ',
      say: [['馬場信春', 'わしが殿じゃ。御屋形様を落とせ。若い者は生きて甲斐へ帰れ', 3.6]],
      waves: [
        { t: 6, say: ['徳川の侍', '逃がすな！　追え！'], foes: [{ name: '追う徳川の手', from: { x: SHINGARI.x - 45, z: SHINGARI.z - 20 }, list: [uS(5), uA(32)] }] },
        { t: 28, say: ['織田の侍', '武田の殿を討て！'], foes: [{ name: '追う織田の手', from: { x: SHINGARI.x - 45, z: SHINGARI.z + 20 }, list: [uS(5), uA(29)] }] }],
      reward: '退き口で殿を支えた' },
  ],
  // 11/21 cloud-31（司令塔「柵越しの鉄砲が武田の騎馬を撃ち、撃たれて崩れる感じ」）：描かずの192秒で柵の鉄砲は10発だけ（1分に3発）だった。
  //   六秒ごとに、柵の鉄砲の組の込め終えた筒を揃えて、七十m 内の武田の組へ放たせる（本人は狙わない・弾も音も本物の発砲と同じ。撃った筒は込め直す）
  update(rt, dt) {
    const F = rt.flags;
    if ((F.d11VolT = (F.d11VolT ?? 4) - dt) > 0) return;
    F.d11VolT = 6;
    const A = rt.army, mine = A.groups.filter((g) => g.team === 0 && g.count && !g.routed);
    for (const g of A.groups) if (g.team === 1 && g.count && !g.routed && /鉄砲/.test(g.name || '')) A.scriptSalvo?.(g, mine, 12, 70);
  },
  win: {
    banner: '設楽原 退き口を生き延びる', sub: '山県・内藤・馬場ら名のある将の多くが討死した', award: '退き口で殿を支えた',
    say: [['使番', '御屋形様は、無事に甲斐へ向かわれました', 3],
      ['組頭', '……生きて帰れ、か。馬場様の言葉、忘れぬ', 3.4]],
  },
});
// K651：織田の設楽原の地面・川・田・道・柵の道筋をそのまま使う（getter も写すため descriptor ごと）。武田の寄せの朝に合わせ霧と時刻だけ足す
d11_shitaragahara.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(SHITARA_WORLD));
// 戦場を建てる（織田の設楽原と同じ所）→ 軽い型の setup（武田の組・段）
{ const s0 = d11_shitaragahara.setup; d11_shitaragahara.setup = function* (rt) { yield* shitaraField(rt); s0.call(this, rt); }; }
// 柵の後ろの鉄砲の組は、段の動きに寄せ直されても一秒ごとに持ち場（柵の三十〜三十六歩後ろ）へ戻して構えさせる（撃つ間合いは鉄砲の決まりのまま）
const GUN_POST = { '柵の内の鉄砲': { x: GUN_Z, z: SAKU1.z - 4 }, '二の柵の鉄砲': { x: GUN_Z, z: SAKU2.z + 4 } };
{ const u0 = d11_shitaragahara.update; d11_shitaragahara.update = function (rt, dt) {
  u0.call(this, rt, dt);
  const F = rt.flags; if ((F.d11GunT = (F.d11GunT || 0) - dt) > 0) return; F.d11GunT = 1;
  for (const g of rt.army.groups) { const at = g.team === 1 && g.count && !g.routed && GUN_POST[g.name]; if (!at) continue;
    g.anchor = { x: at.x, z: at.z }; g.order = 'hold'; g.stay = true; g.seekRange = 6; g.dest = null; g.path = null; g.focus = null; g.fire = true; }
}; }
export default d11_shitaragahara;
