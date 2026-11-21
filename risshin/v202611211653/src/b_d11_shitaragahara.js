// 武田編 十一戦目「長篠・設楽原の戦い」（天正三年〔1575〕五月二十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：勝頼は長篠城の囲みを残し、設楽原で連吾川の向こうに馬防柵を三重に結んだ織田・徳川の三万八千へ、一万五千で攻めかかった。
//   山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した
//   （『信長公記』『甲陽軍鑑』・設楽原歴史資料館の案内）。主人公は山県昌景の赤備えの足軽。負け戦を生き延びるのが勝ち。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { fence } from './castle_parts.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const AKA = { flag: 'akazonae', armor: 0x8e1f16 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 150 };
const RENGO = [[-220, 40], [-100, 46], [0, 40], [100, 48], [220, 42]];   // 連吾川（柵の手前の浅い川）
const KAWA = { x: 6, z: 62 };        // 連吾川の岸（柵の三十歩手前）
const SAKU1 = { x: -30, z: 22 };     // 一の柵（徳川の大久保の前）
const SAKU2 = { x: 40, z: 20 };      // 二の柵の破れ目
const SHINGARI = { x: 0, z: 120 };   // 退き口（馬場の殿）
// 11/21 cloud-10（cloud-31 の頼み・司令塔）：馬防柵を連吾川の西（z 14）に一筋。柵は兵を止める（共通の柵 castle_parts.js fence・壊せる）。
//   口は四つ（x -80・-30・40・80 のあたり、十二歩ずつ）：設楽原の柵は所々に出入りの口を空け、そこから打って出た（『信長公記』）。
//   鉄砲の組は柵の三十〜四十歩後ろ（z -18〜-22）に下げ、持ち場（off）も柵の後ろに置いて柵越しに撃つ（前は柵の口から前へ出て来た）
const FENCE_Z = 14;
const FENCE = [[-120, FENCE_Z], [120, FENCE_Z]];
const FENCE_GAPS = [6, 7, 15, 16, 26, 27, 33, 34];   // 六歩の区画の番号（x = -120 + 6k）

export const d11_shitaragahara = lightBattle({
  id: 'd11_shitaragahara',
  date: '天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原',
  intro: '連吾川の向こうに、織田・徳川の馬防柵が三重に並ぶ。山県昌景の赤備えと共に、柵へ寄せよ。',
  history: '天正三年（1575）五月二十一日、武田勝頼は設楽原で、馬防柵を結んだ織田・徳川の大軍へ攻めかかった。山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した。武田の名のある将の多くがこの日に失われた。',
  sides: { a: { name: '山県昌景の赤備え', mon: 'takeda', faction: 'takeda' }, b: { name: '織田・徳川の柵の兵', mon: 'oda', faction: 'oda' } },
  force: { a: 15000, b: 38000 },
  allyLook: AKA, foeLook: ODA,
  minutes: 6,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 15750521, time: 'morning', wetStart: 0.55, mist: 0.5, fogFar: 380,
    river: RENGO, riverW: 8, riverDepth: 0.4,
    hills: [[0, -60, 70, 14], [-140, -10, 60, 12], [140, -20, 60, 12], [0, 170, 60, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：連吾川の岸・一の柵・二の柵の破れ目・退き口 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, 150], [0, 120], [6, 62], [-30, 22], [40, 20]], w: 3 }],
    groves: [{ x: 0, z: -60, r: 30, n: 30 }, { x: -140, z: -10, r: 30, n: 30 }],
    trees: 400, tufts: 2000,
  },
  allies: [
    { name: '山県昌景の赤備え', at: { x: SPAWN.x - 12, z: SPAWN.z - 8 }, dmg: 0.15, list: [busho('山県昌景', { armor: AKA.armor }), uS(4), uA(16)] },
    { name: '内藤昌豊の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 6 }, dmg: 0.15, list: [busho('内藤昌豊'), uS(3), uA(14)] },
    { name: '馬場信春の手', at: { x: SPAWN.x, z: SPAWN.z + 12 }, dmg: 0.15, list: [busho('馬場信春'), uS(3), uA(12)] },
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
        { name: '大久保の手', from: { x: SAKU1.x + 4, z: SAKU1.z - 10 }, list: [uS(5), uA(35)] },
        { name: '柵の内の鉄砲', seek: 6, off: { x: -8, z: FENCE_Z - 32 - SAKU1.z }, from: { x: SAKU1.x - 8, z: FENCE_Z - 32 }, list: [uG(10)] }],
      later: [{ t: 25, say: ['物見', '柵の口から徳川の新手！'], foes: [{ name: '柵の口の新手', from: { x: SAKU1.x - 14, z: SAKU1.z - 8 }, list: [uS(3), uA(26)] }] }, { t: 55, say: ['組頭', 'まだ来るぞ！'], foes: [{ name: '大久保の二の手', from: { x: SAKU1.x + 14, z: SAKU1.z - 10 }, list: [uS(3), uA(22)] }] }],
      reward: '一の柵へ取り付いた' },
    { kind: 'fight', at: SAKU2, obj: '二の柵の破れ目で、出て来た織田の兵を押し返す', title: '二の柵', sub: '山県様が撃たれた——',
      say: [['赤備えの侍', '山県様、お討死！', 2.8], ['内藤昌豊', '山県の仇じゃ！　破れ目から押し込め！', 3]],
      foes: [
        { name: '織田の柵の兵', from: { x: SAKU2.x, z: SAKU2.z - 12 }, list: [uS(6), uA(35)] },
        { name: '二の柵の鉄砲', seek: 6, off: { x: 10, z: FENCE_Z - 36 - SAKU2.z }, from: { x: SAKU2.x + 10, z: FENCE_Z - 36 }, list: [uG(8)] }],
      later: [{ t: 25, say: ['織田の侍', '破れ目を塞げ！'], foes: [{ name: '破れ目の新手', from: { x: SAKU2.x - 12, z: SAKU2.z - 10 }, list: [uS(3), uA(26)] }] }],
      reward: '二の柵の破れ目で戦った' },
    { kind: 'hold', at: SHINGARI, label: '退き口', obj: '退き口で馬場信春の殿と共に、追う織田・徳川を食い止める', r: 18, dur: 65,
      title: '殿', sub: '御屋形様を甲斐へ落とせ',
      say: [['馬場信春', 'わしが殿じゃ。御屋形様を落とせ。若い者は生きて甲斐へ帰れ', 3.6]],
      waves: [
        { t: 6, say: ['徳川の侍', '逃がすな！　追え！'], foes: [{ name: '追う徳川の手', from: { x: SHINGARI.x - 20, z: SHINGARI.z - 40 }, list: [uS(5), uA(32)] }] },
        { t: 28, say: ['織田の侍', '武田の殿を討て！'], foes: [{ name: '追う織田の手', from: { x: SHINGARI.x + 20, z: SHINGARI.z - 40 }, list: [uS(5), uA(29)] }] }],
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
// 柵を立てる（軽い型の setup の後）
{ const s0 = d11_shitaragahara.setup; d11_shitaragahara.setup = function (rt) { s0.call(this, rt); try { rt.flags.d11Fence = fence(rt, FENCE, { team: 1, hp: 300, segLen: 6, gaps: FENCE_GAPS }); } catch (e) { console.warn('d11 柵', e); } }; }
// 柵の後ろの鉄砲の組は、段の動きに寄せ直されても一秒ごとに持ち場（柵の三十〜三十六歩後ろ）へ戻して構えさせる（撃つ間合いは鉄砲の決まりのまま）
const GUN_POST = { '柵の内の鉄砲': { x: SAKU1.x - 8, z: FENCE_Z - 32 }, '二の柵の鉄砲': { x: SAKU2.x + 10, z: FENCE_Z - 36 } };
{ const u0 = d11_shitaragahara.update; d11_shitaragahara.update = function (rt, dt) {
  u0.call(this, rt, dt);
  const F = rt.flags; if ((F.d11GunT = (F.d11GunT || 0) - dt) > 0) return; F.d11GunT = 1;
  for (const g of rt.army.groups) { const at = g.team === 1 && g.count && !g.routed && GUN_POST[g.name]; if (!at) continue;
    g.anchor = { x: at.x, z: at.z }; g.order = 'hold'; g.stay = true; g.seekRange = 6; g.dest = null; g.path = null; g.focus = null; g.fire = true; }
}; }
export default d11_shitaragahara;
