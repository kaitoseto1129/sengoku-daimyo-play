// 毛利家編 一戦目「厳島の戦い」（弘治元年〔1555〕九月晦日〜十月朔日）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④⑤）
//   史実：陶晴賢は約二万で厳島に渡り、元就の築いた宮尾城を囲んだ。元就は暴風雨の夜に地御前から島の東の包ヶ浦へ渡り（約二千）、
//   博奕尾の山を越えて、夜明けに塔の岡の陶の本陣を背から突いた。小早川隆景の手は海から大鳥居の側へ上がって挟み、
//   村上水軍（能島・来島）が海を塞いだ。陶の軍は崩れ、晴賢は大江浦へ逃れて自害した。
//   出所：『毛利家文書』（A・書状）・『陰徳太平記』（B）・宮島町の解説（C）。毛利約四千・陶約二万は通説。
//   この家だけの仕組み「調略の糸」（house_mori.md ①）：博奕尾の下に陣を張る陶方の国人の備へ、本人が密書を届け切ると、その備は旗の縁が赤→藍に変わって
//   毛利に付く。届ける前に時が切れると敵のまま打ちかかる。陶方の国人が厳島で寝返った事は推（江良房栄の件＝偽の内通の噂で晴賢に討たせた話を、
//   足軽の手で運ぶ密書の形に縮めた。B・諸説）。新しい札・ボタン・字は足さない
//   海：北の海は静かな水面（light_battle.js の sea）、浜に上げた小舟と沖の村上の舟は小田原の海と同じく kobune を並べた見た目だけ
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { kobune, jinmaku, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const SUE = { flag: 'sue', armor: 0x3c3630 };
const coast = (x) => -74 + Math.sin(x * 0.021) * 4 - (x > 110 ? (x - 110) * 0.12 : 0);   // 北の海の岸（包ヶ浦は東で少し入り込む）
const SPAWN = { x: 150, z: -66 };          // 包ヶ浦の浜
const BAKUCHIO = { x: 86, z: -4 };         // 博奕尾の峠
const KOKUJIN = { x: 44, z: -14 };         // 博奕尾の下の陶方の国人の備
const TONO = { x: -40, z: -34 };           // 塔の岡（陶の本陣）
const TONO_HOLD = { x: -30, z: -20 };      // 塔の岡の南の坂
const OOE = { x: -96, z: 96 };             // 大江浦への道（晴賢の落ちた先）

function scene(rt) {
  const W = rt.world, F = rt.flags;
  const at = (x, z) => Math.max(-0.5, W.heightAt(x, z)) + 0.05;
  // 包ヶ浦の浜に乗り上げた毛利の小舟（夜の渡海の跡）
  for (let i = 0; i < 9; i++) {
    const x = 128 + i * 6 + ((i * 7) % 3), z = coast(x) - 2 - (i % 3) * 3;
    try { const b = kobune(x, at(x, z), z, Math.PI * 0.95 + ((i * 5) % 7 - 3) * 0.07, 8 + (i % 2)); if (b) rt.scene.add(b); } catch (e) { /* 舟の形が無くても戦は続ける */ }
  }
  // 沖を塞ぐ村上水軍の舟（見た目だけ）
  for (let i = 0; i < 16; i++) {
    const x = -150 + i * 22 + ((i * 13) % 9), z = coast(x) - 40 - (i % 3) * 14;
    try { const b = kobune(x, -0.45, z, Math.PI * 0.5 + ((i * 11) % 7 - 3) * 0.1, 9 + (i % 3)); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
  // 塔の岡の陶の本陣（陣幕と幟）
  try {
    rt.scene.add(jinmaku(W, TONO.x - 8, TONO.z - 10, 14, 10, 4, { mon: 'sue' }));
    for (const [dx, dz] of [[-6, 4], [6, 4], [16, -2]]) rt.scene.add(nobori(W, TONO.x + dx, TONO.z + dz, 'sue', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
  F.kobaya = null;
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
  ],
  win: {
    banner: '厳島の勝ち', sub: '陶晴賢は大江浦で自害した', award: '厳島で陶の本陣を背から突いた',
    say: [['毛利隆元', '晴賢、大江浦にて腹を召されたとの事', 3.2],
      ['毛利元就', '嵐の海を渡った甲斐があった。島を血で汚した。社を清めて帰る', 3.6],
      ['組頭 与三左', 'お主の届けた書状が、あの備を動かした。よう走った', 3.2]],
  },
});
export default m03_itsukushima;
