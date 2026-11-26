// 毛利家編 一戦目「厳島の戦い」（弘治元年〔1555〕九月晦日〜十月朔日）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④⑤）
//   史実：陶晴賢は約二万で厳島に渡り、元就の築いた宮尾城を囲んだ。元就は暴風雨の夜に地御前から島の東の包ヶ浦へ渡り（約二千）、
//   博奕尾の山を越えて、夜明けに塔の岡の陶の本陣を背から突いた。小早川隆景の手は海から大鳥居の側へ上がって挟み、
//   村上水軍（能島・来島）が海を塞いだ。陶の軍は崩れ、晴賢は大江浦へ逃れて自害した。
//   出所：『毛利家文書』（A・書状）・『陰徳太平記』（B）・宮島町の解説（C）。毛利約四千・陶約二万は通説。
//   この家だけの仕組み「調略の糸」（house_mori.md ①）：博奕尾の下に陣を張る陶方の国人の備へ、本人が密書を届け切ると、その備は旗の縁が赤→藍に変わって
//   毛利に付く。届ける前に時が切れると敵のまま打ちかかる。陶方の国人が厳島で寝返った事は推（江良房栄の件＝偽の内通の噂で晴賢に討たせた話を、
//   足軽の手で運ぶ密書の形に縮めた。B・諸説）。新しい札・ボタン・字は足さない
//   海：北の海は静かな水面（light_battle.js の sea）、浜に上げた小舟と沖の村上の舟は小田原の海と同じく kobune を並べた見た目だけ
import * as THREE from 'three';
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { kobune, jinmaku, nobori } from './props.js';
import { funeJirushi } from './house_gear.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const SUE = { flag: 'sue', armor: 0x3c3630 };
const coast = (x) => -74 + Math.sin(x * 0.021) * 4 - (x > 110 ? (x - 110) * 0.12 : 0);   // 北の海の岸（包ヶ浦は東で少し入り込む）
const SPAWN = { x: 150, z: -66 };          // 包ヶ浦の浜
const BAKUCHIO = { x: 86, z: -4 };         // 博奕尾の峠
const KOKUJIN = { x: 44, z: -14 };         // 博奕尾の下の陶方の国人の備
const TONO = { x: -40, z: -34 };           // 塔の岡（陶の本陣）
const TONO_HOLD = { x: -30, z: -20 };      // 塔の岡の南の坂
const OOE = { x: -96, z: 96 };             // 大江浦への道（晴賢の落ちた先）
const HAMA = { x: -80, z: -58 };           // 塔の岡の下の浜（舟を奪おうとする陶の兵・K652②）
const KOMAGA = { x: -124, z: 34 };         // 駒ヶ林（弥山の尾根。弘中隆兼が籠もった・K652②）

function scene(rt) {
  const W = rt.world, F = rt.flags;
  const at = (x, z) => Math.max(-0.5, W.heightAt(x, z)) + 0.05;
  // 包ヶ浦の浜に乗り上げた毛利の小舟（夜の渡海の跡）
  for (let i = 0; i < 9; i++) {
    const x = 128 + i * 6 + ((i * 7) % 3), z = coast(x) - 2 - (i % 3) * 3;
    try { const b = funeJirushi(kobune(x, at(x, z), z, Math.PI * 0.95 + ((i * 5) % 7 - 3) * 0.07, 8 + (i % 2)), 8, 'mori', 4); if (b) rt.scene.add(b); } catch (e) { /* 舟の形が無くても戦は続ける */ }
  }
  // 沖を塞ぐ村上水軍の舟（見た目だけ）
  for (let i = 0; i < 16; i++) {
    const x = -150 + i * 22 + ((i * 13) % 9), z = coast(x) - 40 - (i % 3) * 14;
    // K657②（せ 11/25）：9m の茶の小舟は嵐の夜の海に沈んで見えなかった。小早の長さに上げ、艫に村上の白い船印（丸に上）を立てて、夜の沖に並ぶ舟が見えるように
    const len = 12 + (i % 3);
    try { const b = funeJirushi(kobune(x, -0.45, z, Math.PI * 0.5 + ((i * 11) % 7 - 3) * 0.1, len), len, 'murakami', 6); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
  // 塔の岡の陶の本陣（陣幕と幟）
  try {
    rt.scene.add(jinmaku(W, TONO.x - 8, TONO.z - 10, 14, 10, 4, { mon: 'sue' }));
    for (const [dx, dz] of [[-6, 4], [6, 4], [16, -2]]) rt.scene.add(nobori(W, TONO.x + dx, TONO.z + dz, 'sue', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
  // 厳島の大鳥居（小早川の手が上がる側の浅瀬。海の側からも浜からも見える）
  try {
    const tx = TONO.x - 54, tz = coast(tx) - 10;
    rt.scene.add(ootorii(tx, -0.5, tz, 0));
  } catch (e) { /* 鳥居が無くても戦は続ける */ }
  F.kobaya = null;
}

// 厳島神社の大鳥居（K657②）：朱の両部鳥居を基本形で組む。海の浅瀬に立つ（柱二本・島木・笠木・貫・額束）。材質と形は一度だけ作る
function ootorii(x, y, z, rot) {
  const red = new THREE.MeshStandardMaterial({ color: 0xc23a1c, roughness: 0.75 });
  const blk = new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.9 });
  const g = new THREE.Group();
  const add = (geo, m, px, py, pz, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.z = rz; g.add(o); return o; };
  const pillar = new THREE.CylinderGeometry(0.62, 0.78, 12.5, 10);
  const sub = new THREE.CylinderGeometry(0.3, 0.34, 11.6, 8);
  for (const sx of [-4.4, 4.4]) {
    add(pillar, red, sx, 6.2, 0);
    for (const dz of [-1.5, 1.5]) add(sub, red, sx, 5.8, dz * 1.0 + (dz < 0 ? -0.2 : 0.2) + 0 * sx).scale.set(0.9, 0.55, 0.9);
  }
  add(new THREE.BoxGeometry(11.6, 0.6, 0.7), red, 0, 8.4, 0);          // 貫
  add(new THREE.BoxGeometry(12.6, 0.8, 0.9), red, 0, 11.6, 0);         // 島木
  const kasa = add(new THREE.BoxGeometry(14.6, 0.9, 1.5), blk, 0, 12.5, 0);   // 笠木（黒い上面）
  kasa.scale.y = 1;
  add(new THREE.BoxGeometry(1.1, 2.6, 0.4), red, 0, 10.1, 0);          // 額束
  g.position.set(x, y, z); g.rotation.y = rot;
  return g;
}

// 夜明け：雨が上がり、空が白む。塔の岡を突く段（三つ目）に入った時に一度だけ
function dawn(rt) {
  const F = rt.flags, W = rt.world;
  if (F.dawn) return;
  F.dawn = true;
  try { W.setTime?.('morning'); } catch (e) { /* 時の移ろいが無くても戦は続ける */ }
  W.setRainTarget?.(0.12);
}
// 小早川隆景の手が海から大鳥居の側へ上がって挟む（塔の岡を突く段の二十秒後）
function kobayakawa(rt) {
  const F = rt.flags;
  if (F.kobaya) return;
  F.kobaya = allyGroup(rt, { name: '小早川隆景の手', flag: 'mori', anchor: { x: TONO.x - 54, z: coast(TONO.x - 54) + 8 }, facing: Math.PI * 0.6, fullStrength: true, noRout: true, aggro: 14, morale: 95, dmgMult: 0.3, order: 'hold' },
    dress([busho('小早川隆景'), uS(3), uA(12)], MORI));
  (F.allies || (F.allies = [])).push(F.kobaya);
  rt.banner('小早川の手', '海から大鳥居の側へ上がる');
}

export const m03_itsukushima = lightBattle({
  id: 'm03_itsukushima',
  date: '弘治元年（1555）九月晦日　暴風雨の夜　安芸国 厳島',
  intro: '陶晴賢の二万が厳島に渡り、宮尾の城を囲んだ。元就は嵐の夜に島の東へ渡り、山を越えて陶の本陣を背から突く。',
  history: '弘治元年（1555）九月、陶晴賢はおよそ二万の兵で厳島に渡り、毛利元就の築いた宮尾城を囲んだ。九月晦日の暴風雨の夜、元就は灯を消して島の東の包ヶ浦へ渡り、博奕尾の山を越えた。十月朔日の夜明け、元就の本隊は塔の岡の陶の本陣を背から突き、小早川隆景の手は海から大鳥居の側へ上がって挟んだ。村上水軍が海を塞いだため陶の兵は逃げ場を失い、晴賢は大江浦で自害した。この勝ちで毛利は安芸の一国人から、中国の大名へ上ってゆく。',
  sides: { a: { name: '毛利元就の軍', mon: 'mori', faction: 'mori' }, b: { name: '陶晴賢の軍', mon: 'sue', faction: 'sue' } },
  force: { a: 4000, b: 20000 },
  allyLook: MORI, foeLook: SUE,
  thick: true,
  noMarch: true,   // 嵐の夜の渡海の後、包ヶ浦の浜から始める（行軍の入りは後ろの海へ道を引いてしまう）
  allyDmg: 0.3,
  foeDmg: 0.75,   // 陶の刃（既定 0.6 では act bot が無傷で二十一人を討った・11/24）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI * 0.62 },
  world: {
    seed: 1555, time: 'night', fogFar: 300, rain: 0.9, lightning: true, overcast: true, wetStart: true,
    coast,
    sea: [{ pts: [[-320, -150], [0, -152], [320, -150]], w: 74, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[86, 6, 40, 16], [130, 40, 60, 20], [20, 130, 90, 30], [-40, -40, 22, 5], [-150, 40, 60, 14], [70, 120, 50, 18]],
    paths: [{ pts: [[150, -66], [120, -36], [86, -4], [44, -14], [0, -26], [-40, -34]], w: 2.6 }, { pts: [[-40, -34], [-30, -20], [-70, 40], [-96, 96]], w: 2.6 }],
    groves: [{ x: 130, z: 40, r: 34, n: 34 }, { x: 20, z: 130, r: 40, n: 36 }, { x: -150, z: 40, r: 30, n: 24 }],
    trees: 440, tufts: 1600,
    tint(x, z, h, c) {
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.14 * k, c.g * (1 - k) + 0.18 * k, c.b * (1 - k) + 0.2 * k); return; }
      if (z < cz + 9) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.52 * k, c.g * (1 - k) + 0.48 * k, c.b * (1 - k) + 0.4 * k); }
    },
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 10, z: SPAWN.z - 2 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '毛利隆元の手', at: { x: SPAWN.x - 14, z: SPAWN.z + 4 }, list: [busho('毛利隆元'), uS(3), uA(12)] },
    { name: '吉川元春の手', at: { x: SPAWN.x - 4, z: SPAWN.z + 12 }, list: [busho('吉川元春'), uS(3), uA(14)] },
    { name: '弓衆', at: { x: SPAWN.x + 16, z: SPAWN.z + 8 }, list: [uS(1), uB(8)] },
  ],
  // 調略の糸：博奕尾の下に陣を張る陶方の国人の備（約四百を二十人で）
  turncoats: [{ key: 'kokujin', name: '陶方の国人の備', at: KOKUJIN, face: Math.PI * 0.4, list: [uS(2), uA(13), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'yose_sue', flag: null, weapon: 'none', dmg: 0 } }] }],   // 幟持ち一人：寝返った時の縁の赤→藍を遠くからも見せる
  setup: scene,
  update(rt, dt) {
    const F = rt.flags;
    if ((F.step || 0) >= 2 && !F.dawn) dawn(rt);
    if (F.dawn && !F.kobaya && F.dp?.on && (F._kbT = (F._kbT || 0) + dt) > 20) kobayakawa(rt);   // 夜明けの二十秒後
  },
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '舟の灯を消せ。声を立てるな。この嵐が、我らを島へ運んだのじゃ', 3.6],
      ['毛利隆元', '包ヶ浦に皆上がりました。陶の陣は、山の向こうの塔の岡', 3.4],
      ['毛利元就', '博奕尾を越え、夜明けに陶の背を突く。山道を急げ', 3.4]] },
    { kind: 'move', at: BAKUCHIO, label: '博奕尾の峠', obj: '嵐の中、博奕尾の山道を登る', r: 12, max: 140,
      say: [['組頭', '足元を見よ。滑れば下の谷まで落ちるぞ', 3]] },
    { kind: 'chouryaku', target: 'kokujin', at: KOKUJIN, label: '国人の備', obj: '陶方の国人の備へ、密書を届ける', r: 9, max: 90,
      say: [['毛利元就', 'あの備の頭とは、前から書状を交わしておる。この密書を、夜の明けぬうちに渡せ', 3.8]],
      turnSay: ['国人の備の頭', '毛利殿の書状、確かに受け取った。これより毛利に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、陶方の国人を毛利に付けた' },
    { kind: 'fight', at: TONO, obj: '夜明け、塔の岡の陶の本陣を背から突く', title: '塔の岡', sub: '博奕尾から駆け下り、陶の本陣の背を突く',
      say: [['毛利元就', '今じゃ！　山を下れ。陶の背は、がら空きぞ！', 3.2]],
      foes: [
        { name: '陶の本陣の備', from: { x: TONO.x + 8, z: TONO.z + 6 }, list: [uS(3), uA(16)] },
        { name: '陶の弓', from: { x: TONO.x - 10, z: TONO.z + 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '寝起きの陶の兵が、陣から湧いて来るぞ！'], foes: [{ name: '陶の寝起きの兵', from: { x: TONO.x - 20, z: TONO.z + 18 }, list: [uS(2), uA(12)] }] }],
      reward: '塔の岡の陶の本陣を突き崩した' },
    // K652②（11/25 Sanae・10分）：崩れた陶の兵は浜へ走り舟を奪おうとしたが、村上の水軍が海を塞いでいた（『陰徳太平記』B）
    { kind: 'fight', at: HAMA, obj: '浜で舟を奪おうとする陶の兵を討つ', title: '浜', sub: '沖には村上の舟。陶の兵は舟を奪い合う',
      say: [['吉川元春', '陶の兵が浜へ走るぞ！　舟を取らせるな！', 3.2], ['組頭', '沖は村上殿の舟じゃ。浜で止めればよい', 3]],
      foes: [{ name: '浜へ逃げる陶の兵', from: { x: HAMA.x + 10, z: HAMA.z + 12 }, list: [uS(3), uA(15)] }, { name: '陶の舟手', from: { x: HAMA.x - 14, z: HAMA.z - 4 }, list: [uS(1), uA(8), uB(4)] }],
      reward: '浜で舟を奪う陶の兵を討った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: TONO_HOLD, label: '塔の岡の南の坂', obj: '弘中隆兼の手を、坂で受け止める', r: 16, dur: 70,
      title: '弘中の手', sub: '陶の将・弘中隆兼が引き返して来る',
      say: [['毛利隆元', '弘中の手が戻って来た！　坂の上で槍を揃えよ！', 3.2]],
      waves: [
        { t: 6, say: ['弘中隆兼', '晴賢様をお逃がしするのじゃ！　押し返せ！'], foes: [{ name: '弘中隆兼の手', from: { x: TONO_HOLD.x - 8, z: TONO_HOLD.z + 40 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', 'まだ来るぞ！　退くな！'], foes: [{ name: '陶の二の手', from: { x: TONO_HOLD.x + 18, z: TONO_HOLD.z + 40 }, list: [uS(2), uA(12)] }] }],
      reward: '塔の岡の坂で弘中の手を受け止めた' },
    { kind: 'fight', at: OOE, obj: '大江浦へ落ちる陶の旗本を追う', title: '大江浦', sub: '海は村上の舟に塞がれ、陶の兵に逃げ場は無い',
      say: [['毛利元就', '晴賢を海へ逃がすな。浦の道を追え', 3.2]],
      foes: [{ name: '陶の旗本の殿', from: { x: OOE.x + 6, z: OOE.z - 8 }, list: [uS(4), uA(12)] }],
      reward: '大江浦で陶の旗本の殿を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BAKUCHIO.x - 16, z: BAKUCHIO.z + 8 }, obj: '博奕尾の山道で、暗がりから出る陶の足軽を討つ', max: 100, limit: 90,
      say: [['毛利元就', '嵐の闇じゃ。音を立てるな', 3.2]],
      foes: [{ name: '陶の足軽', from: { x: BAKUCHIO.x - 4, z: BAKUCHIO.z - 4 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '博奕尾の山道を進んだ' },
    { kind: 'hold', at: { x: BAKUCHIO.x - 30, z: BAKUCHIO.z + 22 }, label: '塔の岡の下の', obj: '塔の岡の下の坂で、陶の後続の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '陶の後続が坂を上る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '陶の後続', from: { x: BAKUCHIO.x - 18, z: BAKUCHIO.z + 10 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '陶の後続', from: { x: BAKUCHIO.x - 44, z: BAKUCHIO.z + 36 }, list: [uS(2), uA(7)] }] }],
      reward: '塔の岡の下の坂を守った' },
    { kind: 'fight', at: { x: BAKUCHIO.x - 50, z: BAKUCHIO.z + 24 }, obj: '大江の浜で、舟へ逃れる陶の兵を討つ', max: 100, limit: 90,
      say: [['毛利元就', '舟へ乗せるな', 3.2]],
      foes: [{ name: '浜の陶の兵', from: { x: BAKUCHIO.x - 38, z: BAKUCHIO.z + 12 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '大江の浜を押さえた' },
    // K652②：弘中隆兼は駒ヶ林（弥山の尾根）に籠もって三日戦い、討たれた（『陰徳太平記』B）
    { kind: 'fight', at: KOMAGA, obj: '駒ヶ林に籠もった弘中隆兼の手を攻める', title: '駒ヶ林', sub: '弘中隆兼は山の尾根で最後まで戦う',
      say: [['吉川元春', '弘中が駒ヶ林の尾根に籠もった。あれは陶の家の一の剛の者じゃ', 3.4], ['毛利元就', '惜しい男よ。じゃが、残せば島が静まらぬ。攻め上れ', 3.4]],
      foes: [{ name: '弘中隆兼の籠もる手', from: { x: KOMAGA.x - 8, z: KOMAGA.z + 6 }, list: [busho('弘中隆兼', { mustLive: false, invuln: false }), uS(3), uA(14)] }, { name: '駒ヶ林の弓', from: { x: KOMAGA.x + 10, z: KOMAGA.z - 10 }, list: [uS(1), uB(6)] }],
      reward: '駒ヶ林で弘中隆兼の手を討った' },
  ],
  win: {
    banner: '厳島の勝ち', sub: '陶晴賢は大江浦で自害した', award: '厳島で陶の本陣を背から突いた',
    say: [['毛利隆元', '晴賢、大江浦にて腹を召されたとの事', 3.2],
      ['毛利元就', '嵐の海を渡った甲斐があった。島を血で汚した。社を清めて帰る', 3.6],
      ['組頭 与三左', 'お主の届けた書状が、あの備を動かした。よう走った', 3.2]],
  },
});
export default m03_itsukushima;
