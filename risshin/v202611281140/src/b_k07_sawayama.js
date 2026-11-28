// ======================================================================
// 徳川編 7　佐和山城の戦い（慶長五年 1600・九月十七日払暁〜十八日）　関ヶ原のすぐ後の山城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「7. 佐和山城」
// 三成は関ヶ原で敗れて城にいない（ボスにしない）。城は父の石田正継、兄の正澄と子の朝成、舅の宇多頼忠ら二千八百ほどが守る。
// 小早川秀秋・脇坂安治は東の大手（東山道・鳥居本の側）から、田中吉政は西の搦手（琵琶湖・松原内湖の側）から攻め、
// 十八日に城内の長谷川守知が裏切って東軍を引き入れ、城は落ちた。主人公は小早川勢の先手に付き大手から攻める。
// 段（史実の時刻順）：①十七日払暁、大手の切り通しで石田勢を討つ → 日暮れの止み、三の丸の長谷川守知が城を出て小早川の先陣になる
//   ②その夜、長谷川の手引きで三の丸から石田正澄の隊を追い落とす（正澄は本丸へ退く）→ 十八日の明け ③二の丸の下の段 ④二の丸の上の段の宇多頼忠
//   ⑤本丸の天守の前で正継の旗本（田中吉政が搦手の水の手から乱入）→ 正継・正澄・朝成は天守で自害（『石田軍記』の炎上の説。開城に近いとの説は battle_learn に）
// 11/3 kaito AP〜AT：見せかけの軍勢（addDistantArmy）を消し、南の尾根の太鼓丸攻めも本物の兵に。秀秋は後ろの本陣で侍の旗本に囲む。
//   脇坂は輪違い、田中は家紋が確かでないので丸の旗（徳川の旗を立てない）。兵の比は東軍が城方の五倍ほど（一万五千対二千八百）。
// 負け方：日が暮れ切る（段ごとの時間とは別の、二十五分の保険）。
// 向き：北が -z、東が +x。山の背は南北で、頂に本丸（石垣・天守）。北の尾根に二の丸（三段）・三の丸、南の尾根に太鼓丸・法華丸、
// 西へ張り出す尾根に西の丸（塩硝櫓）。東の麓は鶴翼の二つの尾根の間の谷戸で、内堀（水）と土塁が塞ぎ、土橋の先に枡形の大手門。
// 手本と出所：docs/battle_refs/k07_sawayama.md（佐和山城絵図・発掘報告・現地の記録）。
// 縄張りは castle_plan.js（曲輪・虎口・塀・櫓）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs に鍵を足して asset_dem_sawayama.js を作ったら HAS_DEM を true にして山の外側の起伏を混ぜる。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, kagaribi, tenshu, sumiyagura, hut, farFireDots } from './props.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { MEM_TIGHT } from './settings.js';
import { MEM_BUDGET } from './device_tier.js';   // K564：記憶4GB 以下の携帯の本物の兵の予算
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, buildCastlePlanSteps, rectPoly } from './castle_plan.js';
import { horiboriHeight, mizubori } from './castle_parts.js';
import * as hata from './k07/hata.js';   // 曲輪が落ちるたび石田の幟が倒れる（11/8）
import * as hoi from './k07/hoi.js';     // 寄せ手一万五千の包囲（奥の軽い大軍・11/8）
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot, depthJump } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { revealName } from './battle_intel.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';
import { sectionTaken } from './siege_path.js';
import { isTouch } from './touch.js';
import { isEn, addEn } from './i18n.js';
import { sideGuard } from './guard_refill.js';   // 11/21 cloud-21：深手で囲まれたら近くの味方の組が本人の脇へ
// K516 英語版：英語の時だけ佐和山の字の表を読む（日本語の時は読まない・重さ0）。読み終えてから戦を組む
if (isEn()) { try { addEn((await import('./i18n_k07_sawayama.js')).default); } catch (e) {} }

const HAS_DEM = false;
let dem = null;
if (HAS_DEM) {
  BATTLE_ASSETS.k07_sawayama = Object.freeze([...assetsForBattle('k07_sawayama'), 'dem_sawayama']);
  useTerrain('dem_sawayama', (data) => { dem = data; });
}

// ---- 場所（ゲームの座標） ----
const START = { x: 152, z: 0 };          // 小早川勢の寄せ口（大手の外の田の中）
const OTE = { x: 104, z: -8 };           // 大手門の内（侍屋敷の谷戸）
const SAN_FOOT = { x: 82, z: -42 };     // 侍屋敷を抜けた三の丸の尾根の下（進軍の到着地点）
const SAN = { x: 4, z: -107 };           // 三の丸（北の尾根の先。石田正澄）
const NI3 = { x: -8, z: -78 };           // 二の丸の下の段
const NI1 = { x: -8, z: -34 };           // 二の丸の上の段（本丸の北の下）
const NI1_MOUTH = { x: -8, z: -40 };   // 二の丸の上の段の門（-8,-43）の内の口
const HON = { x: -10, z: -2 };           // 本丸（山の頂・天守）
const HON_YARD = { x: -3, z: -8 };      // 本丸の東の広場（天守の前。天守の土台に兵が埋もれない所で斬り合う）
const NISHI = { x: -48, z: -4 };        // 西の丸（塩硝櫓）
const TAIKO = { x: -10, z: 34 };         // 太鼓丸（南の尾根・本丸の手前）
const HOKKE = { x: -4, z: 64 };          // 法華丸（南の尾根の先）
const KARAME = { x: -100, z: -10 };      // 搦手（琵琶湖の側）から田中勢が出てくる所
const OPEN_CASTLE_WAIT = 12;   // 開城の使いと秀秋の承知を聞き終えてから、乱入を告げる
const LIMIT = 1050;   // 11/9：波の兵を 1.7→1.4 倍に（toku15_plan 7 は十五分。体力でなく人数で詰める）
                     // 十八日の日が暮れ切るまで（秒）。共通の打ち切り（battle_pacing の 1080 秒）より先にこの戦の言葉で締める。段ごとに b_depth の時間がある（AP の8）

// 大手の道：田から土橋を渡り枡形の大手門、侍屋敷の谷戸を北へ抜け、北の尾根を三の丸へ、尾根伝いに二の丸の三段、本丸へ
const ROUTE = [
  [170, 0], [START.x, START.z], [140, 0], [128, 0], [116, 0], [112.5, -0.5], [113, -4.5], [113, -9], [106, -14], [86, -26], [82, -42],
  [70, -64], [52, -86], [34, -100], [18, -106], [SAN.x, SAN.z], [-8, -96], [-8, -84], [NI3.x, NI3.z], [-8, -72], [-8, -62],
  [-8, -56], [-8, -50], [-8, -40], [NI1.x, NI1.z], [-8, -28], [-8, -18], [HON_YARD.x, HON_YARD.z],
];
// 侍屋敷を抜けた尾根の下から三の丸の門までの登り（木をまばらにする所）
const CLIMB_SAN = ROUTE.slice(10, 15);
// 搦手は西の丸の二つの口を通る。大手の道と分け、天守の土台の手前で本丸へ入る。
const KARAME_ROUTE = [[KARAME.x, KARAME.z], [-80, -4], [-62, -4], [-48, -4], [-34, -4], [-24, -4], [-22, -4]];
// 尾根の背（x, z, 高さ）：南北の山の背と、東へ張る二つの尾根（鶴翼）、西の丸の尾根
const SPINE = [
  [-6, -160, 16], [2, -130, 26], [SAN.x, SAN.z, 30], [-8, -90, 32], [-8, -78, 35], [-8, -67, 37.5], [-8, -56, 40], [-8, -45, 42.5],
  [-8, -34, 45], [-8, -23, 48], [HON.x, HON.z, 50], [-10, 21, 48], [TAIKO.x, TAIKO.z, 45], [-8, 48, 41], [HOKKE.x, HOKKE.z, 38], [-8, 92, 28], [-12, 130, 16],
];
const ARMS = [
  [[SAN.x, SAN.z, 30], [18, -106, 29], [34, -100, 26], [52, -86, 20], [70, -64, 13], [82, -42, 6], [96, -36, 2.5]],
  [[HOKKE.x, HOKKE.z, 38], [30, 74, 28], [60, 66, 16], [90, 46, 6], [120, 42, 2.5]],
  [[HON.x, HON.z, 50], [NISHI.x, NISHI.z, 44], [-80, -8, 30], [-112, -10, 12]],
];
// 堀：大手の内堀（水・土橋の所だけ掘り残す）、本丸の東の下の空堀、三の丸の北と法華丸の南の堀切
const MOAT = [[[128, -50], [128, -10]], [[128, 10], [128, 50]]];
const MOAT_O = { depth: 3.2, width: 12, wade: 'deep', freeboard: 1.4 };   // 11/8 八1・八3：水面を岸より一間ほど下げ、岸の段と水際の土を見せる   // 大手の内堀は背の立たない深い水堀（入れない。土橋だけで渡る。十一2）
const DIPS = [
  ...MOAT.map((p) => horiboriHeight(p, MOAT_O)),
  horiboriHeight([[16, -16], [16, 14]], { depth: 3, width: 8 }),
  horiboriHeight([[-22, -128], [22, -128]], { depth: 4, width: 9 }),
  horiboriHeight([[-26, 86], [16, 86]], { depth: 4, width: 9 }),
];

// 門（十一の3）：門は寄せ手の掛矢か内からの手引きでしか開かない。大手門と二の丸の二つの門は寄せ手が門前に詰めて打ち破り（待っても破れる）、
// 三の丸の門は日暮れに長谷川の手引きで、本丸の門は開城の使いの後に城方が開ける。stage はその門を破る段（b_depth の番号）
const SHUT = {
  ote: { stage: 0, at: [119, 0], wait: 30, say: ['脇坂の侍', '掛矢で大手の門扉を打ち破ったぞ！　枡形へ斬り込め'] },
  san_e: { stage: 1 },
  ni3_n: { stage: 5, at: [-8, -87], wait: 22, say: ['小早川の侍', '二の丸の下の段の門を打ち破った！'] },
  ni1_n: { stage: 6, at: [-8, -43], wait: 25, say: ['小早川の侍', '二の丸の門が破れたぞ！　本丸の石垣の下じゃ'] },
  hon: { stage: 7 },
};

// 11/18 クラウド持ち主 ⑥：朝の逆光（本丸の前・二の丸の段）で城方が縅も着物も黒く、人の形の見えない黒い影の塊になった（look200_1118.jpg・sawa_ato_6koma.jpg）。
//   具足は黒漆のまま、縅を藍に、着物を鉄紺に一段明るくして、胴・袖・脚の分かれが朝の光で見えるように
const ISHIDA = { armor: 0x2e2a24, lace: 0x34446c, cloth: 0x3a4152, flag: 'ishida' };   // 11/8 四3：胴の下の着物の赤茶が橙に見えた。着物も紺に   // 黒の具足に紺の縅（紫は使わない）
const KOBA = { flag: 'sashi:kobayakawa:#ece6d6:#16140f' };
const WAKI = { flag: 'wakisaka' };     // 脇坂の輪違い
const TANAKA = { flag: 'kuki', mon: 'kuki' };       // 田中吉政：関ヶ原で旗頭にした左三つ巴（Wikipedia「田中吉政」家紋の節。K365 11/18 クラウド k365-cloud-38。前は丸）
const II = { armor: 0x7e2418, lace: 0x7e2418, flag: 'ii' };   // 井伊の赤備え
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const SP_OUT = { d: 0, h: 0 };
function spineAt(line, x, z) {
  let best = Infinity, bh = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az, ah] = line[i], [bx, bz, bh2] = line[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bh = ah + (bh2 - ah) * t; }
  }
  SP_OUT.d = best; SP_OUT.h = bh;
  return SP_OUT;
}

// ---- 地形：東の田と谷戸・南北の山の背・鶴翼の尾根・西の湖の側。手で描いた形に、国土地理院の起伏を外側だけ足す ----
function base(x, z) {
  // 谷戸の底は大手から西へゆるく上がり、山の背の西は琵琶湖（内湖）の側へ下がる
  let h = x > -20 ? 2 + 0.07 * Math.max(0, 122 - x) : Math.max(1, 12.2 - 0.09 * (-20 - x));
  let s = spineAt(SPINE, x, z);
  h = Math.max(h, s.h - 0.55 * Math.max(0, s.d - 9));
  for (const a of ARMS) { s = spineAt(a, x, z); h = Math.max(h, s.h - 0.6 * Math.max(0, s.d - 6)); }
  h += 0.3 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  for (const f of DIPS) h += f(x, z);
  if (dem) h += demRelief(dem, x, z, { xy: 1, cx: 0, cz: 0, inner: 200, fade: 60, scale: 0.06 });
  return h;
}

// ---- 縄張り：大手の侍屋敷（土塁と内堀・枡形）・三の丸・二の丸の三段・本丸（石垣・天守）・西の丸・太鼓丸・法華丸 ----
// 石垣は本丸だけ（三成の頃の隅石が残る）。ほかは土塁の上に土塀
const CASTLE_FIRES = [[OTE.x - 6, OTE.z + 6], [SAN.x + 4, SAN.z - 4], [NI1.x + 6, NI1.z], [HON.x + 8, HON.z - 8], [TAIKO.x + 6, TAIKO.z]];
const RESIDENCES = [[80, 17, 9, 6], [91, 18, 8, 5.5], [101, 17, 8, 6], [79, 7, 7, 5], [100, 6, 6, 5]];
const PLAN = {
  mon: 'ishida', name: '佐和山城', type: 'yama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  // 通し確認：篝火が建物の中に浮き、切岸に小屋の屋根が刺さっていた。
  lifeHeightRange: 0.6,
  lifeAvoid: [...CASTLE_FIRES.map(([x, z]) => [x, z, 1.5]), ...RESIDENCES.map(([x, z, w, d]) => [x, z, Math.hypot(w, d) / 2 + 0.8])],
  kuruwa: [
    { id: 'ote', name: '大手の侍屋敷', level: 4, wall: 'dobei', dorui: 2, kind: 'san', poly: rectPoly(74, 116, -26, 26), gapAt: [[116, 0], [86, -26]], gapW: 6 },
    { id: 'san', name: '三の丸', level: 30, wall: 'dobei', kind: 'ni', poly: rectPoly(-12, 18, -118, -96), gapAt: [[18, -106], [-8, -96]], gapW: 5 },
    { id: 'ni3', name: '二の丸の下の段', level: 35, wall: 'dobei', kind: 'koshi', poly: rectPoly(-20, 2, -84, -72), gapAt: [[-8, -84], [-8, -72]], gapW: 5 },
    { id: 'ni2', name: '二の丸の中の段', level: 40, wall: 'dobei', kind: 'koshi', poly: rectPoly(-20, 2, -62, -50), gapAt: [[-8, -62], [-8, -50]], gapW: 5 },
    { id: 'ni1', name: '二の丸', level: 45, wall: 'dobei', kind: 'ni', poly: rectPoly(-20, 2, -40, -28), gapAt: [[-8, -40], [-8, -28]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 50, wall: 'ishigaki', kind: 'hon', poly: rectPoly(-24, 4, -18, 16), gapAt: [[-8, -18], [-24, -4]], gapW: 5 },
    { id: 'nishi', name: '西の丸', level: 44, wall: 'dobei', kind: 'koshi', poly: rectPoly(-62, -34, -14, 6), gapAt: [[-34, -4], [-62, -4]], gapW: 5 },
    { id: 'taiko', name: '太鼓丸', level: 45, wall: 'dobei', kind: 'koshi', poly: rectPoly(-22, 2, 26, 42), gapAt: [[-10, 26], [-10, 42]], gapW: 5 },
    { id: 'hokke', name: '法華丸', level: 38, wall: 'dobei', kind: 'koshi', poly: rectPoly(-18, 8, 54, 74), gapAt: [[-5, 54]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '大手門', from: 'out', to: 'ote', kind: 'masu', gate: ['kabuki', 'yagura'], at: [116, 0], rot: Math.PI / 2, turn: 1, w1: 4.6, w2: 4.2, size: 4.5 },
    { id: 'ote_n', name: '侍屋敷の北の口', from: 'ote', to: 'out', kind: 'hira', at: [86, -26], rot: Math.PI, w: 5 },
    { id: 'san_e', name: '三の丸の門', from: 'out', to: 'san', kind: 'hira', gate: 'yagura', at: [18, -106], rot: Math.PI / 2, w: 6 },
    { id: 'san_s', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [-8, -96], rot: 0, w: 4.4 },
    { id: 'ni3_n', name: '二の丸の下の段の口', from: 'out', to: 'ni3', kind: 'hira', gate: 'kabuki', at: [-8, -84], rot: Math.PI, w: 4.4 },
    { id: 'ni3_s', name: '二の丸の下の段の奥', from: 'ni3', to: 'out', kind: 'hira', at: [-8, -72], rot: 0, w: 4.4 },
    { id: 'ni2_n', name: '二の丸の中の段の口', from: 'out', to: 'ni2', kind: 'hira', at: [-8, -62], rot: Math.PI, w: 4.4 },
    { id: 'ni2_s', name: '二の丸の中の段の奥', from: 'ni2', to: 'out', kind: 'hira', at: [-8, -50], rot: 0, w: 4.4 },
    { id: 'ni1_n', name: '二の丸の門', from: 'out', to: 'ni1', kind: 'hira', gate: 'kabuki', at: [-8, -40], rot: Math.PI, w: 4.4 },
    { id: 'ni1_s', name: '二の丸の奥の口', from: 'ni1', to: 'out', kind: 'hira', at: [-8, -28], rot: 0, w: 4.4 },
    { id: 'hon', name: '本丸の門', from: 'out', to: 'hon', kind: 'hira', gate: 'yagura', at: [-8, -18], rot: Math.PI, w: 4.4 },
    { id: 'hon_w', name: '本丸の西の口', from: 'nishi', to: 'hon', kind: 'hira', at: [-24, -4], rot: -Math.PI / 2, w: 4.4 },
    // 塀の切れ目だけでなく、切岸を登れる坂も二つの口に作る。
    { id: 'nishi_w', name: '西の丸の西の口', from: 'out', to: 'nishi', kind: 'hira', at: [-62, -4], rot: -Math.PI / 2, w: 4.4 },
    { id: 'nishi_e', name: '西の丸の東の口', from: 'nishi', to: 'out', kind: 'hira', at: [-34, -4], rot: Math.PI / 2, w: 4.4 },
  ],
  // 櫓：大手門の左右（土橋と内堀へ横矢）、三の丸の門の脇、本丸の東の隅。三成が天守まで建てた近世の城なので、どれも白壁の二重櫓（丸太組みの井楼は陣城の仮の櫓で、ここには建てない）
  yagura: [
    { id: 'ote_n', kind: 'sumi', at: [112, -20], rot: Math.PI / 2 },
    { id: 'ote_s', kind: 'sumi', at: [112, 20], rot: Math.PI / 2 },
    { id: 'san_e', kind: 'sumi', at: [14, -114], rot: Math.PI / 2 },
    { id: 'hon_ne', kind: 'sumi', at: [0, -14], rot: Math.PI / 2 },
    { id: 'hon_se', kind: 'sumi', at: [0, 12], rot: Math.PI / 2 },
  ],
  // 本丸の東の広場（天守の前）は空けておく：蔵が建つと、斬り合いが蔵と塀の間の細い路地に詰まった（建物は道から離して建つ）
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }, { id: 'karame', kind: 'ote', pts: KARAME_ROUTE }, { id: 'hon_yard', kind: 'hon', pts: [[HON_YARD.x, HON_YARD.z], [-2, 4], [-2, 13]] }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

// ---- 道を外れない動き：道に沿って、一つ先の曲がり角へ（bot と兵の両方） ----
function routeAt(x, z, out, from = 0) {
  let best = Infinity, bs = 0, bx = x, bz = z;
  for (let i = from; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i], [cx, cz] = ROUTE[i + 1];
    const dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = i + t; bx = px; bz = pz; }
  }
  out.d = best; out.s = bs; out.x = bx; out.z = bz;
  return out;
}
// 三の丸の東の門 (18,-106・口の幅四・四歩) へ外から入る狙い。
// 11/19 08:15 UTC クラウド持ち主：act bot 一本で本人が門の南の塀の外際 (18,-111) に立ち、舵が内の (11,-106) へ真っ直ぐ向けて塀を五百秒押し続け、
//   段3〜段5 が進まず 847秒（足跡）。塀の外（x>18）で口の筋から外れていれば、先に門の正面の外 (23,-106) へ出し、筋に乗ってから内へ
// 11/21 16:00 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 三秒の足跡）：段3で本人が門の外 (22〜28,-98〜-105) を二百八十秒行き来して刻限負け。
//   外で揃える点 (23,-106) は櫓門の脇の角で寄れない（味方の道案内 sawayamaWay も同じ訳で八歩外 (26,-106) で揃える）→本人も (26,-106) で揃えてから入る
// 11/21 21:55 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 二秒の足跡）：段3で三の丸の内 (5,-103) から押し出された本人が
//   口の際 (19〜23,-104) で筋から二歩ずれただけで八歩外 (26,-106) へ戻され、さらに (29,-103) から斜めの (26,-106) へ押して百秒動かなかった。
//   口の内寄り（x<21）は口の幅の内（二・一歩）なら真っ直ぐ入れ、外で揃える時は斜めにせず、まず真南北に筋 z=-106 へ下ろす（x は二十六より東のまま）
function sanGateAim(q) {
  // 11/22 02:15 UTC クラウド sawayama 持ち主（K582 act bot 携帯 足跡 0200・0206：段3で (26〜30,-104.3〜-105) に百五十秒、門の筋から一歩北のまま
  //   櫓門の北の柱へ押し続けた）。門の外では筋 z=-106 の一歩の内（〇・七）まで揃えてから西へ入れる
  // 11/22 04:20 UTC クラウド sawayama 持ち主（K582・描かずの試し：門の開いた三の丸の東の門へ、(24〜32,-103〜-107) の五か所から真西へ押すと
  //   どこからも門柱を滑って八秒で三の丸の内 (-4〜3) まで入れた＝体を止める物は無い。止まりは揃える点 (30,-106) が着いた扱いの一歩二分の内で
  //   舵が手を離した事）。筋から三歩の内なら揃えずに三の丸の内へ真っ直ぐ、外れていれば筋の向こうへ一歩三分越した点で揃える
  // 11/28 13:55 UTC クラウド佐和山の持ち主（K582・描かずの試し _k07_trace.mjs）：段3で本人が門の北の塀の外の際 (18,-100) に立つと、
  //   x が十八歩を越えないため揃えずに三の丸の内 (11,-106) へ斜めに押し、塀に当たって動けないまま塀の外の加勢に斬られた（六秒で69→12）。塀の外の際（十七歩より東）でも先に筋へ揃える
  if (q.x > 17 && Math.abs(q.z + 106) > 3) return [Math.max(26, q.x), q.z > -106 ? -107.3 : -104.7];
  return [q.x > 18 && Math.abs(q.z + 106) > 0.7 ? q.x - 6 : 11, -106];
}
// 段の頭（depthBot）の後の舵。槍の届く敵がいる間は斬り合いに任せる
// 11/21 10:20 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 一秒の足跡）：携帯の操作では段の頭のスティック（inp.axis）が
//   下の舵の「前へ（KeyW）」より先に効き、三の丸の内で奥の口へ向けても本人が東の門の外の味方の所へ戻り、門の外で二〜三百秒行き来した。
//   舵が足を決める時はスティックを外す（パソコンの操作には効き目の違いなし）
function sawayamaSteer(b, inp) {
  const p = b.player, u = p.u, D = b.flags.dp, C = D && D.on && D.cur;
  // 11/19 05:10 UTC クラウド持ち主：段1で大手の外を東へ歩き出た本人が、寄せ口の東 (168,-6) で段2 の移る下知のまま九百秒動かず任務失敗（act bot 足跡・三本に一本）。
  //   寄せ口より東（x>150）へ出たら、段の種類を問わず大手の道 (138,0) へ戻す
  if (u && u.alive && C && !b.flags.dpBack && u.pos.x > 150 && !b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.isStruct)) {
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    // 11/19 05:50 UTC クラウド持ち主：act bot 三本に一本、本人が秀秋の本陣の陣幕の内 (166,2〜4) に入り込み、西の幕へ向いて千秒押し続け段1のまま任務失敗。
    //   陣幕（中 START.x+20・幅14・奥11）の口は南（+z）の四歩だけ。幕の内にいる時は先に南の口の外 (START.x+20, 9) へ出てから大手の道へ
    const jx = START.x + 20, inJin = Math.abs(u.pos.x - jx) < 7.2 && Math.abs(u.pos.z - START.z) < 5.8;
    const mid = inJin && Math.abs(u.pos.x - jx) > 1.2 && u.pos.z < START.z + 4;   // 口の真ん中の筋へ寄せてから南へ（斜めに出ると南の幕の端に当たる）
    // 11/22 08:10 UTC クラウド sawayama 持ち主（act bot 携帯の見なし 半秒の足跡に舵の名を足して）：本人が幕の南の口のすぐ外 (171,6) に立つと、
    //   一コマごとに「幕の内」（北の口の外 (172,9) へ）と「東」（大手の道 (138,0) へ＝南の幕を斜めに横切る）が入れ替わり、北と西を交互に向いて千秒動かず任務失敗。
    //   幕の口の前（幕の東西の幅の内・南の幕から六歩の内）にいれば、先に幕の西の端の外 (jx-9, START.z+9) へ回してから大手の道へ
    const before = !inJin && Math.abs(u.pos.x - jx) < 8.5 && u.pos.z > START.z + 5 && u.pos.z < START.z + 12;
    const tx = inJin ? jx : before ? jx - 9 : 138, tz = inJin ? START.z + (mid ? 1 : 9) : before ? START.z + 9 : 0;
    p.yaw = Math.atan2(tx - u.pos.x, tz - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = true; b._k07St = inJin ? '幕' : before ? '幕前' : '東'; return;
  }
  // 11/19 05:20 UTC クラウド持ち主：段3で三の丸の奥の口 (-8,-96) を出た本人が、塀の外を西 (-13,-103)→南 (-3〜8,-118) へ回り込み、
  //   三の丸の南の塀に外から当たって段3〜段4 を百五十秒余り動かず、宇多は保険で落ち 834秒（act bot 足跡）。三の丸の西・南の塀の外にいれば、
  //   塀の外沿いに西の角 (-15,-120) へ、角から北の尾根道 (-15,-92)→(-8,-90) へ戻す
  if (u && u.alive && C && !b.flags.dpBack && D.i >= 4 && !b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3)) {
    const south = u.pos.z < -118.3 && u.pos.z > -130 && u.pos.x > -16 && u.pos.x < 18;
    const west = u.pos.x < -12.3 && u.pos.x > -24 && u.pos.z > -122 && u.pos.z < -91;
    if (south || west) {
      const x = south && u.pos.x > -14.5 ? -15 : u.pos.z < -92.5 ? -15 : -8, z = south && u.pos.x > -14.5 ? -120 : u.pos.z < -92.5 ? -92 : -90;
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      p.yaw = Math.atan2(x - u.pos.x, z - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = true; b._k07St = '外' + x + ',' + z; return;
    }
  }
  // 11/19 07:20 UTC クラウド持ち主：段2（三の丸）の百八十秒に、本人が三の丸の南の塀の外 (16.6,-122.3) に立ち、坂の土の面だけが映った（写真 874×402）。
  //   段2で南の塀の外の東寄りにいれば、塀の外沿いに南東の角 (24,-121) へ、角から東の門の外 (26,-110) へ戻す（その先は下の東の門の舵が内へ入れる）
  if (u && u.alive && C && !b.flags.dpBack && D.i === 3 && u.pos.z < -118.3 && u.pos.z > -132 && u.pos.x > 1 && u.pos.x < 30 &&
      !b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3)) {
    const x = u.pos.x < 22.5 ? 24 : 26, z = u.pos.x < 22.5 ? -121 : -110;
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    p.yaw = Math.atan2(x - u.pos.x, z - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = true; b._k07St = '南' + x + ',' + z; return;
  }
  // 11/19 08:05 UTC クラウド持ち主：段3の初めに三の丸の東の門の外 (26〜37,-99〜-108) で、本人が気力の尽きた「退」と前へ出るのを繰り返し、
  //   七十秒門をくぐれなかった（act bot 足跡・まわりは逃げる兵だけ）。退く間は下の門の舵が切れていた。東の門の外では、十二歩内に戦える敵が
  //   いなければ退く間も門の内へ歩かせる（気力が半ばを切れば走らずに歩き、息を戻しながら）
  const retreatGoal = C && (C.goal || C.at);
  const sanGoalInside = D && D.i === 3 && retreatGoal && retreatGoal.x > -12 && retreatGoal.x < 17 && retreatGoal.z > -118 && retreatGoal.z < -96;
  if (u && u.alive && C && C.s.kind === 'fight' && b.flags.dpBack && (D.i >= 5 || (D.i === 3 && (u.pos.z < -108 || sanGoalInside))) &&
    u.pos.x > 17 && u.pos.x < 44 && u.pos.z > -118 && u.pos.z < -90 &&
    // 11/22 05:20 UTC クラウド sawayama 持ち主（K582 act bot 携帯 足跡 0510：段3〜段4 に東の門の外 (27〜37,-103) で四百七十秒・刻限負け 1068秒、
    //   近くの敵1）：塀の向こうの敵が十二歩内にいるだけで退く舵が手を離し、門の外に立ち続けた。塀を挟む敵は数えない（下の『敵』の見方と同じ）
    !b.army.nearestEnemy(u, 12, (o) => !o.downed && !o.dying && !o.fleeing && !o.isStruct && !o.perch && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    const [x, z] = sanGateAim(u.pos);
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    p.yaw = Math.atan2(x - u.pos.x, z - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = p.sta > p.maxSta * 0.5; b._k07St = '門退'; return;
  }
  // 11/21 08:30 UTC クラウドか（K582 の関所・act bot 足跡 四本）：段3で本人が三の丸の内 (4,-106) まで入っても、気力が二割を切って退く間に
  //   段の頭が味方の組（東の門の外）へ下げ、門の外 (25〜40,-98〜-105) で「走って入る→気力切れ→外へ退く」を三百〜四百七十秒繰り返した。
  //   段3・段4で三の丸の内にいて十二歩内に戦える敵がいなければ、退く間も外へ戻さず奥の口の筋 (-8,-100)→北の口 (-8,-90) へ歩かせる
  if (u && u.alive && C && C.s.kind === 'fight' && b.flags.dpBack && (D.i === 5 || D.i === 6) &&
    u.pos.x > -12 && u.pos.x <= 17 && u.pos.z > -118 && u.pos.z < -96.5 &&
    // 11/21 10:25 UTC クラウド sawayama 持ち主：十二歩内に敵がいると退く間に段の頭が東の門の外へ戻し、門の外との行き来が二百秒続いた（一秒の足跡）。五歩に詰める
    !b.army.nearestEnemy(u, 5, (o) => !o.downed && !o.dying && !o.fleeing && !o.isStruct && !o.perch && Math.abs(o.pos.y - u.pos.y) < 3)) {
    const x = -8, z = Math.abs(u.pos.x + 8) > 1.2 ? -100 : -90;
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    p.yaw = Math.atan2(x - u.pos.x, z - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = p.sta > p.maxSta * 0.5; b._k07St = '内退'; return;
  }
  if (!u || !u.alive || !C || C.s.kind !== 'fight' || b.flags.dpBack) { if (b.flags.dpBack) b._k07St = '退頭'; return; }
  // 11/22 12:05 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 足跡に味方の数）：段5 の初めに本人が二の丸の上の段 (-12,-34) から
  //   六秒で本丸の門 (-5,-21) へ一人で駆け上がり、門の内外の四十人に囲まれて二十秒で討たれた（その時 十二m 内の味方0〜1・先手は五十m 下）。
  //   人も城攻めでは味方の揃うのを待って門へ掛かる。段5 で門の坂の下 (z<-26) にいて十四m 内で本人と並ぶか前（門の側）の味方が六人に満たなければ、四十五秒までは
  //   二の丸の上の段 (-8,-34) で待つ（近くに斬り掛かる敵がいれば待たない）
  if (D.i === 8 && !C.k07Inside && u.pos.z < -26 && u.pos.z > -52 && Math.abs(u.pos.x + 8) < 12) {
    const W8 = b.flags._k07W8 || (b.flags._k07W8 = { t: b.t });
    let m = 0;
    for (const o of b.army.units) if (o !== u && o.alive && o.team === u.team && !o.isStruct && !o.fleeing && o.pos.z > u.pos.z - 3 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 14) m++;
    if (m < 6 && b.t - W8.t < 45 && !b.army.nearestEnemy(u, 5, (o) => !o.downed && !o.dying && !o.fleeing && !o.isStruct && !o.perch)) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      b._k07St = '待';
      if (Math.hypot(u.pos.x - NI1.x, u.pos.z - NI1.z) > 2.5) { p.yaw = Math.atan2(NI1.x - u.pos.x, NI1.z - u.pos.z); inp.k.add('KeyW'); } else inp.k.delete('KeyW');
      inp.axis = null; return;
    }
  }
  // 11/21 08:00 UTC クラウド sawayama 持ち主（K582 の関所・act bot 二本の一本 777秒で倒れた）：段5で本丸の門の坂の東の脇 (1,-29・高さ44) に
  //   三十六秒立ったまま、届かない相手へ太刀を振り続け、背から旗本の侍に三太刀（48ずつ）で討たれた。段5で曲輪の外にいて十秒に二歩も動かなければ、
  //   近くの敵がいても四秒だけ門の一筋の坂の下 (-8,-40) へ、次は門の口 (-8,-24) へ歩かせて筋へ戻す
  if (D.i === 8 && !C.k07Inside && u.pos.z < -17 && u.pos.z > -60 && u.pos.x > -22 && u.pos.x < 12) {
    const S = b._k07Hon || (b._k07Hon = { x: u.pos.x, z: u.pos.z, t: b.t, until: -1, n: 0, tx: 0, tz: 0 });
    if (Math.hypot(u.pos.x - S.x, u.pos.z - S.z) > 2) { S.x = u.pos.x; S.z = u.pos.z; S.t = b.t; }
    else if (b.t - S.t > 10 && b.t > S.until) {
      const low = S.n % 2 === 0 && Math.abs(u.pos.x + 8) > 1.2;
      S.tx = -8; S.tz = low ? -40 : -24; S.until = b.t + 4; S.t = b.t; S.n++;
    }
    if (b.t < S.until) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      p.yaw = Math.atan2(S.tx - u.pos.x, S.tz - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = true; b._k07St = '本抜' + S.tx + ',' + S.tz; return;
    }
  }
  // 11/21 10:00 UTC クラウド sawayama 持ち主（K582 の関所・cloud-11 の act bot 三本に一本）：段3で本人が三の丸の東の門の脇 (22〜27,-107) に
  //   八百秒立ったまま突き続け刻限（櫓の上の兵や門の向こうの届かない相手を「敵」と見て止まっていた）。櫓の上の兵は斬り合いの相手に数えず、
  //   段2・段3で門の外の脇に二十秒二歩も動かなければ、近くに敵がいても四秒だけ門の正面から内へ歩かせる
  if ((D.i === 3 || D.i === 5 || D.i === 6) && u.pos.x > 17 && u.pos.x < 34 && u.pos.z > -114 && u.pos.z < -99) {   // 11/22 05:20：段4（D.i 6）も同じ門の外で止まった（足跡 0510）
    const S = b._k07Gt || (b._k07Gt = { x: u.pos.x, z: u.pos.z, t: b.t, until: -1 });
    if (Math.hypot(u.pos.x - S.x, u.pos.z - S.z) > 2) { S.x = u.pos.x; S.z = u.pos.z; S.t = b.t; }
    else if (b.t - S.t > 10 && b.t > S.until) { S.until = b.t + 4; S.t = b.t; S.n = (S.n || 0) + 1; }   // 11/21 21:55：二十秒→十秒（門の外の止まりが百秒続いた）
    if (b.t < S.until) {
      // 11/21 21:20 UTC クラウド持ち主（K582 act bot 一秒の足跡・刻限負け 1070秒）：段3で (29,-103) に四百秒立ち、門脇の舵も
      //   斜めの的 (26,-106) へ押すだけで一歩も動かなかった。二度目ごとに、まず門の筋 z=-106 へ真っ直ぐ下ろしてから西へ入れる
      let [gx, gz] = sanGateAim(u.pos);
      if (S.n % 2 === 0 && Math.abs(u.pos.z + 106) > 1.6) { gx = u.pos.x + 0.5; gz = -106; }
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      p.yaw = Math.atan2(gx - u.pos.x, gz - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = p.sta > p.maxSta * 0.3; b._k07St = '門脇'; return;
    }
  }
  // 11/28 13:55：塀の際で二歩の内にいる相手は、塀を挟むと見えても斬り合いに任せる（塀の外の際で一歩先の加勢に斬られ続けた）
  if (b.army.nearestEnemy(u, 3.5, (o) => !o.downed && !o.dying && !o.fleeing && !o.isStruct && !o.perch && Math.abs(o.pos.y - u.pos.y) < 3 && (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2 || !b.army.wallBetween(u.pos, u.team, o.pos, false)))) { b._k07St = '敵'; return; }
  b._k07St = '';
  let x = null, z = null;
  // 11/19 01:50 UTC クラウド持ち主：段3（二の丸の下の段）の初め、段2で逃げる兵を追って三の丸の東の門 (18,-106) の外 (25〜32,-100〜-107) へ出た本人が、
  //   六十〜百八十秒そこに立った（act bot 足跡 六本のうち五本・段3の討ち取り0）。段3から先で東の門の外にいる時は、門の口の真ん中 (19,-106) へ、口に着けば三の丸の内 (11,-106) へ
  // 11/21 08:10 UTC クラウドか（K582 の関所・act bot：段2で三の丸の守りへのピンに180秒で16m までしか寄れず、段2 が283秒）：
  //   段2で段の的（守りの真ん中）が三の丸の塀の内にある間は、東の門の外の北寄り（z>-108）でも門の正面から内へ入れる
  const g2 = C.goal || C.at, sanIn2 = D.i === 3 && g2 && g2.x > -12 && g2.x < 17 && g2.z > -118 && g2.z < -96;
  if ((D.i >= 5 || (D.i === 3 && (u.pos.z < -108 || sanIn2))) && u.pos.x > 17 && u.pos.x < 44 && u.pos.z > -118 && u.pos.z < -90) { [x, z] = sanGateAim(u.pos); b._k07St = '門口'; }
  // 11/28 14:10 UTC クラウド佐和山の持ち主（K582・act bot --mobile 二本の足跡に舵の名）：段3で本人が大手の道の東の門の手前 (44,-96〜-102) に
  //   二本とも九十秒立った（門の舵の受け持ちの東の端 x 四十四歩の上で、舵が西へ・段の頭が東へと入れ替わり、速さ〇・二〜一・一）。段3から先でその東の際
  //   （四十四〜五十八歩・道の筋）にいれば、大手の道の門の前の点 (34,-100) へ歩かせて門の舵へ渡す
  else if (D.i >= 5 && u.pos.x >= 44 && u.pos.x < 58 && u.pos.z > -108 && u.pos.z < -84) { x = 34; z = -100; b._k07St = '門寄'; }
  // 11/21 16:10 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 三秒の足跡）：段2で本人が尾根の下 (70〜84,-43〜-64) を
  //   行き来して二百五十秒登らず（ピンへ最も近づけたのは五十〜七十m・刻限負けの元）。段2で尾根の登り（三十四歩より東）にいて
  //   槍の届く敵がいなければ、大手の道の一つ先の点へ歩かせて三の丸の門の前まで登らせる
  else if (D.i === 3 && u.pos.x >= 34 && u.pos.x < 92 && u.pos.z > -100 && u.pos.z < -38 && u.pos.y > 4) {
    let k = 10, best = Infinity;
    for (let i = 10; i <= 13; i++) { const d = Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z); if (d < best) { best = d; k = i; } }
    const j = Math.min(13, k + 1); x = ROUTE[j][0]; z = ROUTE[j][1]; b._k07St = '登' + x + ',' + z;
  }
  // 11/21 06:10 UTC クラウド持ち主（K582 の関所・act bot 足跡 二秒ごと）：段3で本人が東の門をくぐって三の丸の内 (15,-107) に入ると、
  //   段の頭が門の外へ逃げる鉄砲衆を追って東へ出し、上の舵がまた内へ戻す行き来を二百秒続け、戦が八百四十秒の打ち切りに届いた（三本続けて）。
  //   段3・段4で三の丸の内にいる間は、逃げる兵を追わず奥の口の筋 (-8,-100) へ寄せてから北の口 (-8,-90) へ抜ける
  else if ((D.i === 5 || D.i === 6) && u.pos.x > -12 && u.pos.x <= 17 && u.pos.z > -118 && u.pos.z < -96.5) {
    x = -8; z = Math.abs(u.pos.x + 8) > 1.2 ? -100 : -90; b._k07St = '奥' + x + ',' + z;
  }
  // 11/19 02:00 UTC クラウド持ち主：段4で二の丸の門が破れて六十〜百二十秒たっても本人が曲輪へ一度も入らず（k07Entered 0）、門の下の尾根 (-8,-48〜-65)・
  //   曲輪の東の外 (8,-41) をうろつき、宇多の隊は先に入った味方が討って段4の本人の討ち取り0〜2（act bot 足跡三本・POSLOG_X）。門が破れたら曲輪の内 (NI1) へ上がる
  else if (D.i === 6 && b.flags.gateOpen?.ni1_n && !C.k07Inside && u.pos.z < -39.5 && u.pos.z > -76 && u.pos.x > -24 && u.pos.x < 14) {
    // 尾根の口（-72・-62・-50・-40）はどれも x=-8 の一筋。sawayamaWay の半歩の揃える点 (-8,-59)(-8,-66) の前で六十〜百秒止まった（02:15 足跡）ので、筋へ寄せてから真っ直ぐ登る
    x = -8; z = Math.abs(u.pos.x + 8) > 1.2 ? u.pos.z + 2.5 : NI1.z; b._k07St = '曲' + Math.round(x) + ',' + Math.round(z);
  }
  // 11/19 03:00 UTC クラウド持ち主：段5（本丸）で本丸の門が開いても、本人が門の坂の下 (-8,-25〜-47・高さ45) を百〜二百秒行き来し、
  //   坂の上の門の口 (-8,-20・高さ48) に立つ旗本とは高さが三つ違って槍を合わせず、段5の討ち取り0〜1（act bot 足跡 六本とも）。
  //   門が開いて曲輪の外にいる間は、門の一筋 x=-8 へ寄せてから坂を登り本丸の内 (-8,-12) へ
  // 11/21 08:00 UTC クラウド sawayama 持ち主：段5で本丸の東の石垣の外 (4〜11,-17〜8) を百四十秒うろつき、門へ回らず時間切れ（act bot 1061秒）。
  //   門が開いて東の外にいれば、石垣の北東の角の外 (6,-24) へ回してから下の門の一筋の舵に渡す
  else if (D.i === 8 && b.flags.gateOpen?.hon && !C.k07Inside && u.pos.x > 4.5 && u.pos.x < 18 && u.pos.z >= -17 && u.pos.z < 16) {
    x = 6; z = -24; b._k07St = '本東';
  }
  // 11/22 11:00 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 三本続けて段5で倒れた・足跡に舵の名）：門の坂から東へ流れた本人が
  //   本丸の北東の角の外 (8〜14,-17〜-28・高さ41〜42) に出ると、上の二つの舵のどちらにも掛からず（本東は z≧-17・本は x<8）、段の頭が天守の前へ真っ直ぐ
  //   向けて石垣の下で旗本に囲まれ、十秒余りで討たれた。その間にいれば、角の外の坂の口 (5,-24) へ戻してから門の一筋の舵に渡す
  else if (D.i === 8 && b.flags.gateOpen?.hon && !C.k07Inside && u.pos.x >= 7.5 && u.pos.x < 18 && u.pos.z < -17 && u.pos.z > -30) {
    x = 5; z = -24; b._k07St = '本角';
  }
  else if (D.i === 8 && b.flags.gateOpen?.hon && !C.k07Inside && u.pos.z < -17 && u.pos.z > -60 && u.pos.x > -22 && u.pos.x < 8) {
    x = -8; z = Math.abs(u.pos.x + 8) > 1.2 ? u.pos.z + 2.5 : -12; b._k07St = '本' + Math.round(x) + ',' + Math.round(z);
  }
  // 11/21 04:10 UTC クラウド持ち主：act bot 五本のうち三本で段3（二の丸の下の段）に本人が三の丸の東の門の外 (23〜29,-98〜-105) か
  //   尾根の東の下 (91,-86・高さ4.5) に三百〜五百秒動けず、二本は段5で倒れた（足跡 POSLOG）。段2・段3で十二秒に二歩も動かず槍の届く敵もいなければ、
  //   五秒だけ大手の道（三の丸の尾根の登り）の近い点へ、二度目は一つ手前の点へ歩かせて筋へ戻す
  // 11/21 20:15 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 一秒の足跡 三本に一本の刻限負け 1069秒）：段3で東の門の外 (28〜34,-100〜-104) で
  //   十二秒の足止めの抜け道が大手の道の点 (34,-100)→(52,-86) へ東へ戻し、門から遠ざかって入り直すのを四百秒繰り返した。段3で東の門の外にいる間は
  //   この抜け道を使わず、上の門の脇の舵（二十秒動かなければ門の正面から内へ）に任せる
  const atSanGate = D.i === 5 && u.pos.x > 17 && u.pos.x < 44 && u.pos.z > -118 && u.pos.z < -90;
  // 11/28 11:20 UTC クラウド佐和山の持ち主（K582・描かずの試し _k07_sanprobe.mjs）：段3で本人が閉じた二の丸の下の段の門 (-8,-84.5) の前で
  //   掛矢の打ち破りを待って十二秒止まると、この抜け道が大手の道の一つ手前の点＝三の丸の内 (4,-107) へ下げ、門と三の丸の間を行き来して段3の討ち取り0。
  //   門が開くまでは門の前で待たせる（門が破れれば段の頭が内へ入れる）
  const atNi3Gate = D.i === 5 && !b.flags.gateOpen?.ni3_n && u.pos.z > -96 && u.pos.z < -84 && Math.abs(u.pos.x + 8) < 6;
  if ((D.i === 3 || D.i === 5) && !atSanGate && !atNi3Gate) {
    const S = b._k07Stk || (b._k07Stk = { x: u.pos.x, z: u.pos.z, t: b.t, until: -1, tx: 0, tz: 0, n: 0 });
    if (Math.hypot(u.pos.x - S.x, u.pos.z - S.z) > 2) { S.x = u.pos.x; S.z = u.pos.z; S.t = b.t; }
    else if (b.t - S.t > 12 && b.t > S.until) {
      let k = 9, best = Infinity;
      for (let i = 9; i <= 15; i++) { const d = Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z); if (d < best) { best = d; k = i; } }
      const j = S.n % 2 ? Math.max(9, k - 1) : (best < 3 ? Math.min(15, k + 1) : k);
      S.tx = ROUTE[j][0]; S.tz = ROUTE[j][1]; S.until = b.t + 5; S.t = b.t; S.n++;
      // 11/21 22:05 UTC クラウド sawayama 持ち主（K582・act bot 二秒の足跡）：段3で三の丸の内 (6,-105) に十二秒止まると、この抜け道が
      //   一つ手前の点＝東の門 (18,-106) へ戻し、門の外で四百秒行き来した（段3 が564秒）。三の丸の内では後ろへ戻さず、
      //   北の口 (-8,-96) と、南へ五歩よけた所を交互に指す
      if (D.i === 5 && u.pos.x > -12 && u.pos.x <= 17 && u.pos.z > -118 && u.pos.z < -96.5) {
        if (S.n % 2) { S.tx = -8; S.tz = -96; } else { S.tx = u.pos.x - 2; S.tz = Math.max(-116, u.pos.z - 5); }
      }
    }
    if (b.t < S.until) { x = S.tx; z = S.tz; b._k07St = '抜' + x + ',' + z; }
  }
  if (x == null || Math.hypot(x - u.pos.x, z - u.pos.z) < 1.2) return;
  inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
  // 11/21 クラウドか：気力が三割を切れば走らずに歩く（走り続けて二割を切ると段の頭が味方の後ろへ退かせ、門の外との行き来になる）
  p.yaw = Math.atan2(x - u.pos.x, z - u.pos.z); inp.axis = null; inp.k.add('KeyW'); inp.runHeld = p.sta > p.maxSta * (D.i === 5 || D.i === 6 ? 0.45 : 0.3);   // 段3・段4は四割五分で歩きに（二割二分を切ると段の頭が門の外へ退かせる）
}
const OTE_IN = 7;   // ROUTE の [113, -9]：枡形を出た所
const RF = { d: 0, s: 0, x: 0, z: 0 }, RT = { d: 0, s: 0, x: 0, z: 0 };
function sawayamaWay(army, u, want) {
  const q = u._k07Way || (u._k07Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  // 同じ曲輪の内で打ち合う時は虎口の整列点へ戻さない。
  // 門を抜けた直後も案内が穂先の行き先を奪い、守り手が打ち返せなくなっていた。
  const foe = u.target;
  if (foe?.alive && !foe.isStruct && Math.abs(foe.pos.y - u.pos.y) < 3 &&
    Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 10) {
    for (const yard of PLAN.kuruwa) {
      const p = yard.poly;
      if (u.pos.x > p[0][0] && u.pos.x < p[1][0] && u.pos.z > p[0][1] && u.pos.z < p[2][1] &&
        foe.pos.x > p[0][0] && foe.pos.x < p[1][0] && foe.pos.z > p[0][1] && foe.pos.z < p[2][1] &&
        !army.wallBetween(u.pos, u.team, foe.pos, false)) {
        q.active = false; q.t = -1;
        return want;
      }
    }
  }
  // 搦手の列も、押し合いで口の横へ出たら同じ側で中央へ揃えてから通す。
  // 道順だけに任せると、西の丸の東の口の脇で田中と侍が塀へ斜めに寄り続ける。
  // 先頭が本丸へ入って攻撃に替わっても、後続は西の丸と本丸の口を通す。
  if (u.group?._k07Karame && (u.group.order === 'path' || u.group.order === 'attack')) {
    for (const gate of PLAN.koguchi) {
      if (gate.id !== 'nishi_w' && gate.id !== 'nishi_e' && gate.id !== 'hon_w') continue;
      const x = gate.at[0], z = gate.at[1], side = u.pos.x <= x ? -1 : 1;
      if (Math.abs(u.pos.x - x) > 7 || Math.abs(u.pos.z - z) > 8 ||
        (want.x - x) * side >= 0) continue;
      q.z = z;
      q.x = Math.abs(u.pos.z - z) > 0.8 ? x + side * 4 : x - side * 4;
      q.botRadius = 0.5;
      return q;
    }
    // 本丸に近づいても大手側の尾根へ戻さない。
    return want;
  }
  // 次の曲輪への進軍や曲輪への戻りで行き先が替わったら、前の向きの道を使わない。
  if (q.wantX !== want.x || q.wantZ !== want.z) {
    q.wantX = want.x; q.wantZ = want.z; q.t = -1;
  }
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 2.4) return q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false; q.botRadius = 2;
  // 11/21 クラウド k365-cloud-10（act bot POSLOG：③の331〜530秒、本人が尾根の東の谷の底 (76〜91,-86・高さ5) に二百秒止まった）：
  //   道筋から三十歩より離れると行き先 (-8,-78・高さ35) へ真っ直ぐ向け、谷から尾根の崖へ押し続けていた。谷の底（高さ9未満）から
  //   尾根や城へ向かう時は、平らな谷を北へ歩いて三の丸の尾根の下（SAN_FOOT）へ戻し、そこから道筋で登らせる（人の行き先の案内 hud_route も同じ）
  //   （描かずで谷の底に置いて歩かせると、下の二の丸の段の口へ揃える決まり（x≥2・z-86〜-70）が先に効き、行き先が二歩南と尾根の下へ0.3秒ごとに替わって九十秒動かなかった。ここで先に見る）
  if (u.pos.x > 58 && u.pos.z < -56 && u.pos.z > -118 && u.pos.y < 7 && want.x < 60) {   // 尾根の下（高さ7〜9）では道筋へ渡す（行き来して止まらない）
    q.active = true; q.x = SAN_FOOT.x; q.z = SAN_FOOT.z - 4; return q;
  }
  // 三の丸の東門の脇へ押された長谷川の手も、塀へ斜めに寄らず門の正面へ揃える。
  // （21, -99）から最寄りの尾根道を指すだけでは、門の南の塀に当たり続ける。
  // 11/18 22:10 UTC クラウド持ち主：段3の初め、段2で逃げる兵を東の山腹 (43,-94) まで追った本人が (27,-99) の塀の外の斜面で七十秒止まった
  //   （act bot 足跡・段3が百六十秒で討ち取り0）。東の外は三十六歩まで、門の正面の尾根道へ揃えてから入る
  if (u.pos.x > 11 && u.pos.x < 36 && u.pos.z > -118 && u.pos.z < -92 &&
    ((u.pos.x >= 18 && want.x <= 18) || (u.pos.x < 18 && want.x >= 18))) {
    const side = u.pos.x >= 18 ? 1 : -1;
    q.active = true; q.botRadius = 0.5; q.z = -106;
    // 11/18 23:15 UTC クラウド持ち主：外から揃える点 (22,-106) は櫓門の脇の角で、(21,-102) から寄れず本人が五百秒動かなかった（act bot 足跡・段3〜段5 討ち取り1）。
    //   外から入る時は門の正面の八歩外 (26,-106) で揃える
    q.x = Math.abs(u.pos.z + 106) > 0.8 ? 18 + side * (side > 0 ? 8 : 4) : 18 - side * 4;
    return q;
  }
  // 三の丸の奥の口では、近い持ち場へも塀を斜めに横切らず、口の正面へ揃えてから出入りする。
  // 距離だけで道案内を省くと、長谷川の手が口の横の塀で止まる。
  // 行軍中は隊列の持ち場でなく進軍先で出入りを決め、口の三歩先まで通す。
  // 持ち場が口に残ると、先に出た長谷川が後列へ戻され続ける。
  const sanMarch = u.group?.order === 'move' && u.group._k07Go;
  const laneX = -8 + (sanMarch ? (u.slot % 2 ? 0.65 : -0.65) : 0);
  const sanTo = sanMarch || want;
  const sanOut = sanMarch ? u.pos.z < -93 && sanTo.z > -93 : u.pos.z <= -96 && sanTo.z > -96;
  const sanIn = sanMarch ? u.pos.z > -99 && sanTo.z < -99 : u.pos.z > -96 && sanTo.z < -96;
  if (u.pos.x > -12 && u.pos.x < 18 && u.pos.z > -110 && u.pos.z < -86 &&
    sanTo.x > -20 && sanTo.x < 18 && (sanOut || sanIn)) {
    // 口へ揃える幅は一歩。手前で一歩半〜二歩の到着扱いにすると、横へ揃わず同じ所で止まり続ける。
    q.active = true; q.x = laneX; q.botRadius = 0.5;
    const inside = sanOut;
    // 中央へ一歩以内に揃える前に到着扱いで止まらないよう、整列点には半歩まで寄せる。
    q.botRadius = 0.5;
    // 行軍中は境が -93・-99 なので、抜ける行き先を境と同じ点にすると、着いた兵が境の手前に残って止まる
    //   （11/18 クラウドせ act bot：長谷川の手7人と鉄砲衆が (-8,-93) に重なった）。一歩先へ送る。
    q.z = Math.abs(u.pos.x - laneX) > 0.8 ? (inside ? -99 : -93) : (inside ? (sanMarch ? -92 : -93) : (sanMarch ? -100 : -99));
    return q;
  }
  // 行軍の後列は持ち場が前の門に残っていても、次の曲輪へ通す。
  // 二の丸は入口だけでなく奥の口も中央へ揃え、中の段を通過する時も塀を斜めに横切らない。
  const niTo = sanMarch || want;
  for (const yard of PLAN.kuruwa) {
    if (yard.id !== 'ni3' && yard.id !== 'ni2' && yard.id !== 'ni1') continue;
    const north = yard.poly[0][1], south = yard.poly[2][1];
    if (niTo.x <= -20 || niTo.x >= 2) continue;
    if (niTo.z > north && niTo.z < south &&
      (u.pos.x <= -20 || u.pos.x >= 2) && u.pos.x > -50 && u.pos.x < 30 && u.pos.z > north - 2 && u.pos.z < south + 2) {   // 11/21 cloud-10：尾根の東の谷 (x80) にまで効いて南へ引き戻していた。段の脇（三十歩内）だけ
      q.active = true;
      q.x = u.pos.x <= -20 ? Math.min(u.pos.x, -22) : Math.max(u.pos.x, 4);
      q.z = north - 4;
      return q;
    }
    if (u.pos.x <= -20 || u.pos.x >= 2) continue;
    for (let side = 0; side < 2; side++) {
      const edge = side ? south : north;
      // 口を三歩抜けるまで誘導する。反対へ戻る時も同じ口を使う。
      const dir = niTo.z > edge + 1 ? 1 : niTo.z < edge - 1 ? -1 : 0;
      const along = (u.pos.z - edge) * dir;
      if (!dir || along < -7 || along >= 2.5) continue;
      q.active = true; q.botRadius = 0.5; q.x = laneX;
      // 11/19 01:15 UTC クラウド持ち主：本人が二の丸の下の段の奥の口 (-9,-74) で、口の中央から一歩ずれたまま味方に挟まれて揃えられず、
      //   揃える点 (-8,-76) の前で百三十秒動けなかった（act bot 足跡・段4の討ち取り0）。口の幅は五歩なので、本人は一歩半のずれまで通す
      q.z = Math.abs(u.pos.x - laneX) > (u.isPlayer ? 1.6 : 0.8) && along <= 0 ? edge - dir * 4 : edge + dir * 3;
      return q;
    }
  }
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
  // 11/28 08:00 UTC クラウド佐和山の持ち主（act bot --mobile 三本に一本 任務失敗 1068秒：段2『三の丸の尾根の下へ行け』で本人が
  //   大手門の内の北の隅 (109〜116,5〜7) に九百秒詰まった）：枡形の北の壁（z 4.5）と侍屋敷の東の土塁の間の隅では、
  //   近い道の点が枡形の中の曲がり (112.5,-0.5) になり、壁越しに戻そうとして動けなかった。隅にいて西（侍屋敷の奥）へ向かう時は、
  //   先に隅の口 (103,9) へ西へ出す（足跡では 109,7→97,13 と西へ開いている）
  if (u.pos.x > 105.5 && u.pos.x < 116.5 && u.pos.z > 4.6 && u.pos.z < 14 && want.x < 105) {
    q.active = true; q.x = 103; q.z = 9; return q;
  }
  routeAt(want.x, want.z, RT);
  // 侍屋敷の中から奥へ向かう時は、枡形の中の道（大手門の内の曲がり）へ戻さない（枡形の西の塀に詰まり、門の外へ押し出されていた）
  routeAt(u.pos.x, u.pos.z, RF, RT.s >= OTE_IN && u.pos.x > 74 && u.pos.x < 111 && Math.abs(u.pos.z) < 26 ? OTE_IN : 0);
  if (RF.d > 30 || RT.d > 30 || Math.abs(RT.s - RF.s) < 0.6) return want;
  q.active = true;
  if (RF.d > 4) { q.x = RF.x; q.z = RF.z; return q; }
  const fwd = RT.s > RF.s;
  let i = fwd ? Math.floor(RF.s) + 1 : Math.ceil(RF.s) - 1;
  i = Math.max(0, Math.min(ROUTE.length - 1, i));
  if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < 2.4) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RT.s : i < RT.s)) { q.x = RT.x; q.z = RT.z; }
  else { q.x = ROUTE[i][0]; q.z = ROUTE[i][1]; }
  return q;
}

// 隊の要（anchor）の次の行き先：道の上の一つ先の曲がり角（行き先が道から遠ければそのまま）
const RA = { d: 0, s: 0, x: 0, z: 0 }, RB = { d: 0, s: 0, x: 0, z: 0 };
function wayNext(p, to, out) {
  routeAt(to.x, to.z, RB); routeAt(p.x, p.z, RA, RB.s >= OTE_IN && p.x > 74 && p.x < 111 && Math.abs(p.z) < 26 ? OTE_IN : 0);
  if (RB.d > 30 || Math.abs(RB.s - RA.s) < 0.6) { out.x = to.x; out.z = to.z; return out; }
  if (RA.d > 3) { out.x = RA.x; out.z = RA.z; return out; }
  const fwd = RB.s > RA.s;
  let i = fwd ? Math.floor(RA.s) + 1 : Math.ceil(RA.s) - 1;
  if (Math.hypot(ROUTE[i][0] - p.x, ROUTE[i][1] - p.z) < 1.5) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RB.s : i < RB.s)) { out.x = to.x; out.z = to.z; }
  else { out.x = ROUTE[i][0]; out.z = ROUTE[i][1]; }
  return out;
}

// ---- 旗と篝火：東軍の寄せ口・石田の曲輪 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 20, START.z, 14, 11, 4, { mon: 'kobayakawa' }));   // 陣幕の中に秀秋と旗本（AV18・BH1）
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, KOBA.flag, 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  // 石田の旗：大手の土塁の上・三の丸・二の丸・本丸・西の丸・南の尾根の太鼓丸と法華丸
  //   曲輪が落ちるたびに倒すので覚えておく（k07/hata.js）
  rt.flags.ishidaFlags = [];
  for (const [x, z] of [[114, -10], [114, 10], [108, 12], [12, -100], [-2, -112], [-14, -80], [-14, -56], [-14, -34], [-18, -12], [-2, 8], [-48, -10], [-16, 30], [-4, 38], [-12, 60], [4, 70]]) {
    const g = nobori(W, x, z, 'ishida', 5);
    rt.scene.add(g);
    rt.flags.ishidaFlags.push({ g, x, z, y: g.position.y, r: (x * 7 + z * 3) % 6.28 });
  }
  for (const [x, z] of CASTLE_FIRES) rt.scene.add(kagaribi(W, x, z));
  // 11/18 クラウド35（K365 城の見た目）：夕暮れの段で、麓から山上の本丸・二の丸・太鼓丸の篝火が見えず、城山が暗いだけだった。
  //   篝火の所に遠くでも見える小さな橙の火の点（props.js の farFireDots・夕と夜だけ灯る・光源は増やさない）
  rt.scene.add(farFireDots(CASTLE_FIRES.map(([x, z]) => [x, W.heightAt(x, z) + 3.5, z]), W));
}

// 城内の守りは曲輪ごとの持ち場に置く。共通の出現位置の補正で塀の外や別の尾根へ移さない。
// 11/18 act bot「九分で八人・斬り合う相手が少なくて退屈」（味方の討ち取り174）：本人の二十歩内で打ちかかる敵の組を一つだけ本人へ向ける
//   （岩村・木津川口の huntPlayer の小さい形）。敵の数・強さは変えない。本人の命が六割半を切った時・塀を挟んだ時・組が崩れた時・持ち場を守る組は外す。
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u, D = F.dp;
  const on = P?.alive && D && D.on && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  // 11/19 cloud-10（司令塔「遊ぶ人にも起きうるので戦の側で」）：本人の十歩内に斬り合える敵が二十秒いない時は（塀の外で鉄砲を構えて立つ・遅れて歩く）、
  //   塀・段の高さを問わず六十歩内の組を本人へ向ける。兵は城の道（moveWay＝口）を通って来る。斬り合いが始まれば元の決まりへ戻る
  const near = P?.alive && rt.army.nearestEnemy(P, 10, (o) => !o.fleeing && !o.downed && !o.perch && !o.isStruct && Math.abs(o.pos.y - P.pos.y) < 3);
  F._quietT = near ? 0 : (F._quietT || 0) + 0.5;
  const quiet = F._quietT > 20;
  const ok = (g) => {
    if (!on || g.team !== 1 || g.routed || !g.count || (g.order !== 'attack' && g.order !== 'hold') || g.noHunt || g.fixed || /櫓/.test(g.name || '') || g.units.some((u) => u.perch)) return false;   // 櫓の上の守り（main の castle_plan の櫓門・隅櫓の守り）は降りて来ないので向けない（11/19 二つの枠を櫓の守りが取り、大手で斬り合いが起きなかった）   // fixed：本丸の床几の石田一族（討てない）は向けない
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    // 11/18 cloud-10：曲輪の持ち場（hold）の組も、本人が十六歩内・同じ段（高さの差三歩内）・塀を挟まない時は本人へ打ちかかる（act bot 十分で突き十七・討ち取り六〜九）
    // 大手・侍屋敷・三の丸（攻めの組）は本人から三十歩ほどで味方とぶつかり、本人は五分近く一人も討てなかった（描かずの通し 11/18）→攻めの組は三十五歩から本人へ
    // 11/19 cloud-10 中学生 bot：段の場から四十歩より遠くで遅れて歩く間（三の丸の段で印75〜90m・近くに敵無し30秒）は、攻めの組を七十歩から本人へ向けて迎えに来させる
    const at = D.cur?.at, far = at && Math.hypot(P.pos.x - at.x, P.pos.z - at.z) > 40;
    const r = g.order === 'hold' ? 22 : far ? 70 : 35;   // 持ち場の組は十六→二十二歩（11/18 二組にしても九分で八人の回が残った）
    if (quiet) return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < Math.max(r, 60);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < r && (g.order !== 'hold' || Math.abs(c.y - P.pos.y) < 3) && !rt.army.wallBetween(c, g.team, P.pos);
  };
  // 11/18 cloud-10：main と合わせた形の act bot 3回で「退屈」が戻った（討ち取り10・2・4）→本人へ向ける組を二つまで（11/19 三つにすると囲まれた本人が退いて突きが減った＝二つのまま）
  const H = F._hunters || (F._hunters = []);
  for (let i = H.length - 1; i >= 0; i--) {
    const g = H[i];
    if (g.focus === P && ok(g)) continue;
    if (g.focus === P) { g.focus = null; for (const u of g.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    H.splice(i, 1);
  }
  if (!on) return;
  for (const g of rt.army.groups) { if (H.length >= 2) break; if (!g.focus && !H.includes(g) && ok(g)) { g.focus = P; H.push(g); if (!g._k07Soft) { g._k07Soft = true; for (const u of g.units) if (u.alive && !u.name && u.maxHp) u.hp = Math.min(u.hp, u.maxHp * 0.7); } } }   // 11/19 本人へ来る組の名無しの兵は命を七割に（突き25で七人＝斬っても倒し切れず退屈）
}
const OTE_KEEP = () => keep('大手の守り', OTE, [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }]);
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92, dmg: o.dmg ?? 0.28, noGuard: o.noGuard !== false, ...(o.noRout ? { noRout: o.noRout } : {}) });

const k07_sawayama = {
  // 11/18 クラウド kaito2 K365（天王寺の出来へ）：裾野に寄せ手の塊（fujin_layout の k07_sawayama）を置いた分、本物の兵の上限を天王寺・岡山・森部と同じに（既定250）
  realCap: isTouch ? 270 : 340,
  // 身の回りの合戦の跡（timeslip_field.js）。佐和山：旧暦九月十七日（新暦十月下旬）の山城。乾いた土と落ちた矢・槍、秋の草
  timeslip: {
    wet: 0.15, dust: 0.5, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x9a9a60, grassTints: [0xffffff, 0xeadcb0, 0xd0c898], grassH: 1.05, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を八人討つ」で埋めない・三の1）
  pacingCap: 1320,   // 11/26 クラウドす（K674）：本丸の後に続きの段が五つ（各百秒まで）。共通の十八分の打ち切りを二十二分へ
  goalsAllRows: true,     // 共通の既定は今の一行だけ。始めから五つとも並べる。
  keepBattleSigns: true,  // 行き先の▼を出している間も、朝成らの名札と両軍の数を隠さない。
  forceBarAlways: true,   // 人数を渡すだけでは共通の棒は隠れる。寄せ口から落城まで両軍の残りを示す。
  // 始まりの話の間（段の前）は、印を①の大手門へ（前は戦の大目標の言葉から「山の頂の本丸 35m」と出て、指す所と名が違った）
  goalSignTarget: (rt) => {
    const F = rt.flags, D = F.dp;
    if (F.ending) return null;
    if (!F.begun || !D) return { x: 119, z: 0, label: '大手門' };
    // 11/28 10:05 UTC クラウド佐和山の持ち主（K582 act bot --mobile 足跡）：天守の後の続きの段（tokugawa_more2・F.k652m）では段の番号が 0 から数え直しになり、
    //   下の曲輪の行き先（三の丸・二の丸の下の段）を指したまま、本人が寄せる組を離れて尾根を下った（続きの五段で討ち取り0〜1）。続きの段の間は寄せる組の一番近い兵を指す
    if (F.k652m === 'on') {
      const me = rt.player.u?.pos;
      let best = null, bd = Infinity;
      if (me) for (const g of D.cur?.groups || []) for (const u of g.units) if (u.alive && !u.gone && !u.fleeing) {
        const d = (u.pos.x - me.x) ** 2 + (u.pos.z - me.z) ** 2;
        if (d < bd) { bd = d; best = u; }
      }
      return best ? { x: best.pos.x, z: best.pos.z, label: D.cur.s.title || '' } : null;
    }
    // 固有の指定が null を返すと共通の行き先も消える。敵が見えない間も次の曲輪を指す。
    const i = D.i;
    if (i === 0) return F.gateOpen?.ote ? { ...OTE, label: '大手門の内の侍屋敷' } : { x: 119, z: 0, label: '大手門' };
    // 夜の進軍は尾根の下への到着を待つ。三の丸を指すと到着地点を飛ばしてしまう。
    // 11/19 cloud-10 中学生 bot：侍屋敷の中から塀の向こうの尾根の下を指すピンへ真っ直ぐ歩き、塀に当たって五百秒（ピンへ0/49）
    //   →侍屋敷の内（と大手門の外）にいる間は、侍屋敷の北の口を指す
    const P0 = rt.player.u?.pos;
    if (i <= 2 && P0) {
      const inOte = P0.x > 73 && P0.x < 117 && P0.z > -27 && P0.z < 27;
      if (P0.x >= 117 && Math.abs(P0.z) < 30) return { x: 119, z: 0, label: '三の丸の尾根' };
      if (inOte && Math.hypot(P0.x - 86, P0.z + 28) > 5) return { x: 86, z: -28, label: '三の丸の尾根' };
    }
    if (i <= 2) return { ...SAN_FOOT, label: '三の丸の尾根' };
    // 曲輪の外にいる間は、塀越しの曲輪の中でなく門の外の前を指す（写真 480秒 ②：塀の外で止まり、ピンが塀のすぐ向こうで口へ回らなかった 11/18）
    const P = rt.player.u?.pos;
    const viaGate = (yardId, gate, inner, label) => {
      const y = PLAN.kuruwa.find((k) => k.id === yardId), pp = y.poly;
      const inYard = P && P.x > pp[0][0] - 1 && P.x < pp[1][0] + 1 && P.z > pp[0][1] - 1 && P.z < pp[2][1] + 1;
      if (!P || inYard || Math.hypot(P.x - gate.x, P.z - gate.z) < 5) return { ...inner, label };
      return { x: gate.x, z: gate.z, label };
    };
    if (i === 3) return viaGate('san', { x: 21, z: -106 }, SAN, '三の丸');
    if (i <= 5) return viaGate('ni3', { x: -8, z: -87 }, NI3, '二の丸の下の段');
    if (i === 6) return viaGate('ni1', { x: -8, z: -43 }, NI1, '二の丸の上の段');
    return viaGate('hon', { x: -8, z: -21 }, HON_YARD, '本丸の天守の前');
  },
  lethal: { max: 4, firstAt: 80, gap: 50 },   // 命懸けの戦場（docs/lethal_howto.md）：櫓の矢・落石・曲輪の門の前
  fearKind: { kind: '山城の死守', note: '狭い尾根で上から撃たれる', w: { losses: 1.4, flank: 1.2 }, line: '上から矢が来るぞ！' },
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  // 城兵は各段の守りと予告した新手だけ。共通の補充で別の城兵を足すと、
  // 落とした曲輪にも新手が残り、寄せ手が目標を離れて延々と戦ってしまう。
  frontFillLimit: 0,
  reserveNoEnemy: true,
  // 味方の待つ備を曲輪の口（幅五歩）の上に置かない。口に横陣で待つと一列に押し込まれて重なり、後から通る隊の道も塞ぐ
  //   （11/18 クラウドせ act bot：味方の新手12人が二の丸の中の段の口 (-8,-62) に縦一列で重なった）
  reserveOk: (rt, p, foe) => !foe && p.x < 158 && distToPolyline(p.x, p.z, ROUTE) < 3 &&
    !PLAN.kuruwa.some((k) => (k.gapAt || []).some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 5.5)),
  noDistantBattle: true,
  playerTaken: 0.5,   // 一太刀の最低被害にも半減を通す。入口で半減すると共通の六割の床で上書きされる。
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が続けての太刀で倒れて負けた）
  noWake: true,
  // 11/8 critic60：台詞の字が一つも出ず、長谷川の寝返りも天守の炎上も分からなかった（声だけの戦の決まりを外す）
  battleDialogue: true,
  // 11/8 五1：行き先の札が「この敵」の案内に替わった。段の一行のまま
  keepTaskLabel: true,
  // 構えた敵の前でも、場所と相手を書いた五つの目標を操作の案内に替えない。
  keepTaskPanel: true,
  // 11/8 五3：敵を指す印が▼でなく黄色い角の丸い枠になる時があった。行き先と相手の印は頭上の▼だけ
  goalSignOnly: true,
  goalSignTriangle: true,   // 行き先が画面の外でも、回る矢印へ替えず▼を保つ（五3）
  goalSignUnitNoLabel: true,   // 相手の印へ切り替わっても「ねらい」の案内を足さない。武将の名は頭上の名札に出す。
  // 討てない石田一族や、前の曲輪から退く兵へ目標の印を向けない。
  // 今の隊へ近づくまでは、曲輪の行き先を示す。
  actionGuideTarget(rt) {
    const C = rt.flags.dp?.cur, me = rt.player.u;
    if (rt.flags.ending || C?.s.kind !== 'fight') return null;
    let target = null, best = 30 * 30;
    for (const g of C.groups || []) for (const u of g.units) {
      if (!u.alive || u.team === me.team || u.invuln || u.noTarget || u.isStruct || u.perch || u.fleeing || u.dying || u.downed || u.woundOut || u.gone) continue;
      const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
      if (d >= best || Math.abs(u.pos.y - me.pos.y) >= 4 || rt.army.wallBetween(me.pos, me.team, u.pos, false)) continue;
      target = u; best = d;
    }
    return target;
  },
  keepCombatTaskHeading: true,
  // 11/8 九7：カメラが門の梁・土塁・枡形の壁・塀の面にめり込んだ。肩越しの目を体へ寄せる
  camPull: -1.2,
  clampCamera(rt, pos) {
    // 門の下で地形補正が視点を持ち上げても、渡櫓の床・梁へ入れない。
    const p = rt.player.u.pos;
    for (const box of rt.flags.gateCameraBoxes || []) {
      if (!box.containsPoint(pos)) continue;
      if (p.y + 1.5 < box.min.y) pos.y = box.min.y - 0.35;
    }
  },
  minutes: 25,
  world: {
    autumn: true,   // 11/19 史実照らし（docs/reki_sky_1119.md）：旧暦九月＝太陽暦十月。枯れ色の草と色づく木
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    // 描画側は world の指定を読む。寄せ口から約百七十メートル先の天守まで描く。
    landmarkViewFar: 200,
    seed: 1600921,
    time: 'morning',   // 十七日の払暁から攻めた
    marchMist: 45,   // 11/20 K474 クラウド34：慶長五年九月十七日の朝の大手門攻め。始めの四十五秒は薄い朝靄で、奥の城と敵陣が霞の影から現れる（world_update.js）
    // 夜の白い兵：小さな正の値でも共通の補光の下限が残る。兵だけの補光を止め、月光と篝火で照らす。
    unitNightScale: 0,
    groundHalf: 280,
    // 東の本陣と旗本の後列、日暮れの退路まで戦場に収める（共通の既定は176歩）。
    moveLim: 220,
    // 虎口で持ち場が塞がっても要の一点へ全員を寄せず、間隔のある足場を探す。
    mountainFormation: true,
    // 11/19 クラウド持ち主（写真 90秒）：背の立たない内堀なのに、通せんぼは堀の真ん中の四歩だけで、本人が水面の中ほどまで腰まで浸かって立てた。
    //   この戦の水は内堀だけなので、立てる水の深さを脛まで（0.3）にして、水際の段に留める
    wadeDepth: 0.3,
    muddyCastleFloor: 0.8,   // 曲輪の平場を真っ白な砂利にせず、踏み固めた乾いた土に（侍屋敷が白い砂の広場に見えた・八1）
    paths: [ROUTE.slice(0, 10), ROUTE.slice(9), KARAME_ROUTE],
    height,
    moveWay: sawayamaWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 麓は刈り入れの済んだ田（九月十七日は新暦の十月二十三日。乾いた刈り株）
      if (h < 4 && x > 134) { c.setRGB(c.r * 0.55 + 0.2, c.g * 0.55 + 0.16, c.b * 0.5 + 0.07); return; }
      if (h > 14) c.setRGB(c.r * 0.74, c.g * 0.84, c.b * 0.7);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || distToPolyline(x, z, KARAME_ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 480,
    tufts: 2400,
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
      // 三の丸への尾根の登り：肩越しのカメラが下の山腹の林を写し、木と暗い斜面が画面の半分を覆って上の敵が見えなかった（写真 300秒 ③ 11/18）→尾根の両脇十八歩はまばらに
      if (distToPolyline(x, z, CLIMB_SAN) < 18) return 0.08;
      if (x > 134) return 0.1;
      // 大手の田から、谷戸の奥の本丸の石垣と天守・左右の尾根の曲輪が見えるように、谷戸の木はまばらに
      // ただし谷戸の底だけ。底から上がる山腹は林に（大手から門の奥に見える山腹が草の小山に見えた・critic 四5）
      if (x > 60 && x < 134 && Math.abs(z) < 34) return base(x, z) - (2 + 0.07 * Math.max(0, 122 - x)) > 3 ? 0.95 : 0.15;
      // 本丸の東の山腹は林に（草の小山に見えた・四5）。
      if (x > 10 && x < 134 && Math.abs(z) < 34) return 0.75;
      // 木の数は決まっているので、平らな外の野より山腹へ寄せる（佐和山が林の山に見えるように）
      return base(x, z) > 8 ? 1.1 : 0.3;
    },
    // 近江の湖東の山は赤松が主（曲輪の中にソテツ・シュロのような葉の木が見えた・八1）。杉の葉の板がシュロに見えるので杉は植えず、松と広葉樹（11/7）
    treeMix: { sugi: 0, matsu: 0.85 },
    groves: [{ x: 110, z: 74, r: 16, n: 20, kind: 'matsu' }, { x: 70, z: -50, r: 16, n: 20, kind: 'matsu' }, { x: -40, z: 30, r: 18, n: 24, kind: 'matsu' }],
    fleeOut: (x, z, team) => (team === 1 ? x < -125 || z < -170 || z > 150 : x > 215),
  },

  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    // 11/18 クラウド kaito2 K365：段替わりの中央の青い札（右上の任務と同じ字）と中央の声が上の端で行き先の札と重なっていた（act bot 874×402）。
    //   青い札は出さず、中央の声の間は行き先の字の札を薄くする（天王寺・岡山と同じ扱い）
    if (typeof document !== 'undefined' && !document.getElementById('k07-cc-style')) {
      const st = document.createElement('style'); st.id = 'k07-cc-style';
      st.textContent = `html:root body #hud:has(#h-prog[data-battle="k07_sawayama"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="k07_sawayama"]):has(#center-call .cc:not(.blue)) #goal-sign .gs-tag { opacity:0 !important; }`;
      document.head.appendChild(st);
    }
    // 通し確認で出た瀕死の幕と札の重なり：幕は札より奥、戦場の中央は空ける。
    if (!document.getElementById('sawayama-hud-css')) {
      const st = document.createElement('style'); st.id = 'sawayama-hud-css';
      st.textContent = `
html body #hud:has(#h-prog[data-battle="k07_sawayama"]) #brinkfx { z-index:0; background:radial-gradient(ellipse at center, transparent 65%, rgba(40,0,0,.72) 100%); }
html body #hud:has(#h-prog[data-battle="k07_sawayama"]) :is(#h-prog,#jk-vit) { z-index:2; }
/* 共通の相手の印が刀の絵へ替わっても、この戦は赤い▼を保つ。 */
html body #hud.enemy-action-guide:has(#h-prog[data-battle="k07_sawayama"]) #goal-sign .gs-sword { display:none !important; }
html body #hud.enemy-action-guide:has(#h-prog[data-battle="k07_sawayama"]) #goal-sign .gs-tag i { display:block !important; background:#ff4a2e !important; }`;
      document.head.appendChild(st);
    }
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    // 櫓と櫓門の上の射手も石田の黒の具足と旗（既定の装いは武田の赤備えと武田の旗だった）
    F.C = yield* buildCastlePlanSteps(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, buildGates: true, buildTowers: true, interiorGuards: false, perchFaction: 'ishida', perchLook: ISHIDA });
    // 束ねた門の絵だけを線で拾うと、床板の裏や梁を見落とす。
    // 実際に建った櫓門（枡形の内門を含む）の床から、視点専用の箱を一度だけ作る。
    const boxes = F.gateCameraBoxes = [];
    for (const g of Object.values(F.C.gateObjs || {})) for (const gate of [g, g.outer, g.inner]) {
      const I = gate?.naka, lv = I?.levels?.[0];
      if (!lv) continue;
      const c = Math.abs(Math.cos(I.rot)), s = Math.abs(Math.sin(I.rot));
      const hw = (lv.w + 1) / 2, hd = (lv.d + 1) / 2;
      const rx = c * hw + s * hd, rz = s * hw + c * hd;
      boxes.push(new THREE.Box3(new THREE.Vector3(I.x - rx, lv.y - 0.65, I.z - rz),
        new THREE.Vector3(I.x + rx, lv.y + 4.5, I.z + rz)));
    }
    // 隅櫓も同じ（11/18 写真①：二の丸の下の塀の外で、視点が塀の上の櫓の床下へ入り梁越しに映った）。
    // 一階の床の少し下から二階の屋根まで（castle_parts.js の sumiyaguraTower と同じ寸法 7.2×6.2・台 2.6）。
    for (const y of PLAN.yagura) {
      if (y.kind !== 'sumi') continue;
      const [x, z] = y.at, f1 = W.heightAt(x, z) - 0.3 + 2.6, r = Math.max(y.w || 7.2, y.d || 6.2) / 2 + 0.5;
      boxes.push(new THREE.Box3(new THREE.Vector3(x - r, f1 - 0.65, z - r), new THREE.Vector3(x + r, f1 + 3.35 + 4.5, z + r)));
    }
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    const cameraBlock = W.cameraBlockFraction, ray = new THREE.Ray(), hitPoint = new THREE.Vector3();
    W.cameraBlockFraction = (from, to) => {
      let hit = cameraBlock?.call(W, from, to) ?? null;
      const length = ray.direction.copy(to).sub(from).length();
      if (length < 1e-6) return hit;
      ray.origin.copy(from); ray.direction.multiplyScalar(1 / length);
      for (const box of boxes) {
        // 渡櫓の室内へ上がった時は、共通の室内カメラへ任せる。
        if (from.y >= box.min.y) continue;
        if (!ray.intersectBox(box, hitPoint)) continue;
        const t = from.distanceTo(hitPoint) / length;
        if (t <= 1 && (hit === null || t < hit)) hit = t;
      }
      return hit;
    };
    // 門は閉じて始まる（十一の3。SHUT）。櫓と櫓門の上には石田の鉄砲・弓が立つ（横矢）
    F.gateOpen = {}; F.gateT0 = {}; F.ramT = {};
    for (const g of Object.values(F.C.gateObjs || {})) for (const d of [g, g.outer, g.inner]) if (d && d.struct) Object.assign(d.struct, { noTarget: true, fireProof: true });
    // 大手の内堀（水）。土橋の所だけ掘り残す
    for (const p of MOAT) mizubori(rt, p, MOAT_O);
    // 佐和山の頂の五重の天守（三成の居城。「三成に過ぎたるもの」の一つ。三成の頃の望楼の形）と、西の丸の塩硝櫓。大手の田から谷戸の奥の山の上に城が見える
    try {
      rt.scene.add(tenshu(W, HON.x - 4, HON.z + 2, { floors: 5, b: 11, base: 3.4, borou: true, old: true, rot: Math.PI / 2, team: 1, name: '佐和山城の天守', where: '本丸の天守' }));
      // 11/18 クラウド持ち主：⑤の天守の前で、後ろの目が天守の石垣と一重目の壁の中へ入り、黒い板が本人を覆い白い壁が宙に浮いて見えた（iMac 検品 k07_sawayama_6koma）。
      //   天守の束（BatchedMesh）は共通の視点の当たりに拾われないので、石垣から二重目までを視点専用の箱にする。本人が天守の上・中にいる時は共通の室内カメラに任せる
      const tx = HON.x - 4, tz = HON.z + 2, ty = W.heightAt(tx, tz) - 0.4, hx = (11 * 0.86 + 1.4) / 2 + 0.2, hz = (11 + 1.4) / 2 + 0.2;
      const tBox = new THREE.Box3(new THREE.Vector3(tx - hx, ty - 1, tz - hz), new THREE.Vector3(tx + hx, ty + 3.4 + 6.8, tz + hz));
      const tRay = new THREE.Ray(), tHit = new THREE.Vector3(), tPrev = W.cameraBlockFraction;
      W.cameraBlockFraction = (from, to) => {
        let hit = tPrev?.call(W, from, to) ?? null;
        if (from.x > tBox.min.x && from.x < tBox.max.x && from.z > tBox.min.z && from.z < tBox.max.z) return hit;
        const len = tRay.direction.copy(to).sub(from).length();
        if (len < 1e-6) return hit;
        tRay.origin.copy(from); tRay.direction.multiplyScalar(1 / len);
        if (tRay.intersectBox(tBox, tHit)) { const t = from.distanceTo(tHit) / len; if (t <= 1 && (hit === null || t < hit)) hit = t; }
        return hit;
      };
      rt.scene.add(sumiyagura(W, NISHI.x - 6, NISHI.z - 6, { w: 5, d: 4.4, base: 0.6, rot: Math.PI / 2 }));
    } catch (e) { console.warn(e); }
    // 大手の侍屋敷：土塁の内の南の半分に板葺きの屋敷を並べる（前は白い平場に篝火だけ・十の1）。北の半分は奥への道なので空ける。屋敷の陰から伏兵が出る
    for (const [x, z, w, d] of RESIDENCES) {
      try { rt.scene.add(hut(W, x, z, w, d, Math.PI, { ita: true, minka: false })); } catch (e) { console.warn(e); }
    }
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    farSight(rt.scene.children.slice(castle0), { W, ground: { x: 20, z: -20, r: 100 }, far: W.def.landmarkViewFar });
    flags(rt);
    // 見せかけの軍勢は近くに置かない（AA・AF・AQ6）。見える兵は全部本物。11/8：百五十歩より奥にだけ寄せ手一万五千の包囲を重ねる（k07/hoi.js）
    hoi.install(rt);
    // ---- 東軍：自分の手勢と脇坂の先手。総大将の秀秋は寄せ口の後ろの本陣で、侍の旗本に囲まれて動かない（O・AR3） ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '小早川秀秋の本陣', anchor: { x: START.x + 20, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: false } }, { type: 'samurai', n: 20 }], KOBA));
    F.hide = F.honjin.units.find((u) => u.name === '小早川秀秋');
    if (F.hide) F.hide._crouch = true;   // 総大将は床几に腰を下ろす（O・AR3）
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], KOBA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '脇坂安治の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }], WAKI));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.5; g.dmgMult = 1.5; g.aggro = 24; }   // 11/9：1.1→1.5（味方の寄せ手で曲輪が落ちるように。十五分に詰める）
    // 一万五千の囲み（一1・十二2）：大手の外の田の北と南に、朽木元綱・赤座直保の陣（陣幕・幟・馬上の将と旗本が控える）。
    //   竹束の陰に小早川の鉄砲衆が据わり、大手の櫓へ撃ちかける（竹束の陰に誰もいなかった・十の3）。西の搦手には田中吉政の陣の幟
    for (const [x, z, name, mon] of [[164, -40, '朽木元綱', 'kutsuki' /* 朽木は隅立て四つ目結（K365 11/18） */], [164, 40, '赤座直保', 'toyotomi']]) {
      rt.scene.add(jinmaku(W, x + 8, z, 12, 9, 4, { mon }));
      for (const [dx, dz] of [[-4, -8], [-4, 8], [0, -12], [0, 12], [-6, 0]]) rt.scene.add(nobori(W, x + dx, z + dz, mon, 6));
      allyGroup(rt, { faction: 'oda', name: `${name}の陣`, anchor: { x, z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8 }], { flag: mon }));   // 朽木・赤座の兵は自分の家の旗（田中の三つ巴を使い回さない）
    }
    F.tabaGun = allyGroup(rt, { faction: 'oda', name: '小早川の鉄砲衆', anchor: { x: 141.5, z: 0 }, facing: -Math.PI / 2, width: 22, aggro: 40, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'gun', n: 8 }], KOBA));
    for (const [x, z] of [[KARAME.x - 14, KARAME.z - 10], [KARAME.x - 14, KARAME.z + 6], [KARAME.x - 20, KARAME.z - 2]]) rt.scene.add(nobori(W, x, z, TANAKA.flag, 6));   // 11/18 クラウド cloud-k07：搦手の田中の陣の幟が丸のまま（兵の旗は三つ巴）→兵と同じ三つ巴に
    // 田中吉政は十七日の払暁から西の搦手に陣を据えた（布陣・11/7）。十八日の開城の段で水の手から本丸へ乱入する（tanaka）
    F.tanaka = allyGroup(rt, { faction: 'oda', name: '田中吉政の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: Math.PI / 2, width: 10, aggro: 3, noRout: true, order: 'hold', fixed: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TANAKA));
    // 井伊直政（攻め手に名がある。関ヶ原の鉄砲傷で床几に座る）：大手の南、家康の正法山の方に赤備えの陣（布陣・11/7）
    rt.scene.add(jinmaku(W, 176, 72, 12, 9, 4, { mon: 'ii' }));
    for (const [dx, dz] of [[-12, -8], [-12, 8], [-8, -14], [-8, 14]]) rt.scene.add(nobori(W, 176 + dx, 72 + dz, 'ii', 6));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.ii = allyGroup(rt, { faction: 'oda', name: '井伊直政の陣', anchor: { x: 170, z: 72 }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: false } }, { type: 'samurai', n: 5 }], II));   // 本物の兵は 250 人ほどまで（陣は旗本だけ）
    { const ii = F.ii.units.find((u) => u.name === '井伊直政'); if (ii) ii._crouch = true; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('main', '大手から佐和山城へ攻め上り、山の頂の本丸を落とせ', 'main');
    // 11/20 クラウド（④湧き出し：大手門の段が始まる十五秒に、大手の守り三十六人が本人の四十〜五十 m で一度に現れていた）：
    //   大手の守りは戦の始めから大手門の内に構えて待たせ、段①で起こす（数と顔ぶれは段で出すのと同じ）
    try { F.oteG = DP.preFoes(rt, this.dctx(rt), OTE, OTE_KEEP()); } catch (e) { F.oteG = null; }
    // 戦の前
    const opening = F.openReservation = {}, player = rt.player.u;
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    const after = (t, fn) => rt.after(t, () => {
      if (!rt.over && rt.flags === F && F.openReservation === opening && !F.ending &&
        rt.player.u === player && player.alive && !player.downed && !player.dying) fn();
    });
    rt.say('小早川秀秋', '関ヶ原は終わった。残るは治部（三成）の本拠、佐和山じゃ', 4.5);
    after(4.5, () => rt.say(nm(rt), '治部少輔はおらぬと聞きます。城には誰が', 3));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    after(7.5, () => rt.say('脇坂安治', '治部の父の正継、兄の正澄ら。二千八百ほどが籠もっておる', 3.5));
    // 城の守り手の名は始めに脇坂が告げる（右上の目標の名を「見えぬ敵の陣を物見する」に伏せない）
    for (const n of ['石田正継', '石田正澄', '石田朝成', '宇多頼忠']) after(7.5, () => revealName(rt, n));
    after(11, () => rt.say('小早川秀秋', '内府（家康）様は南の正法山に陣を取られた。田中殿は搦手、我らは大手じゃ。かかれ！', 4));
    after(15, () => this.begin(rt));
  },

  // 戦の途中の保存（battle_checkpoint.js・K211 kaito「途中が全部消えるのは最悪」）：三の丸へ（2）・三の丸（3）・二の丸の下（5）・上（6）・本丸（8）の始まりから続ける。
  //   段の番号は段の流れ（b_depth.js）の番号。門は段の番号で開く（gates）。飛ばした段の出来事（日暮れ・正澄の退き・夜明け・宇多の討死）は resumeFx で音もなく
  checkpointStep(rt) { const D = rt.flags.dp; return D && D.on ? D.i : -1; },
  resumeSteps: [2, 3, 5, 6, 8].map((k) => [k, function (rt) {
    const F = rt.flags;
    if (!F.begun) this.begin(rt);
    // 先に置いた大手の守り（段①で起こす組）は、段①を飛ばす続きでは片付ける
    if (F.oteG && F.dp?.i < 1) { for (const u of F.oteG.units) if (u.alive && !u.gone) rt.army.despawn(u); F.oteG = null; }
    if (!F.dp?.on) return;
    for (let j = F.dp.i; j < k; j++) this.resumeFx(rt, j);
    depthJump(rt, k);
  }]),
  resumeFx(rt, j) {
    if (j === 1) this.dusk(rt);
    if (j === 3) { this.sumiOut(rt); const u = rt.flags.sumiU; if (u?.alive) rt.army.despawn(u); rt.flags.sumiU = null; }
    if (j === 4) this.dawn(rt);
    if (j === 6) this.udaEnd(rt);
  },
  resumeAt(rt, step) {
    const P = { 2: OTE, 3: SAN_FOOT, 5: SAN, 6: NI3, 8: NI1 }[step];
    return P ? { x: P.x, z: P.z } : null;
  },
  // 段の流れの決まり（begin で段を始める・開戦の前に大手の守りを先に置く時にも使う）
  dctx(rt) {
    const F = rt.flags;
    if (F.dctx) return F.dctx;
    return (F.dctx = { faction: 'ishida', flag: 'ishida', armor: ISHIDA.armor, friends: () => [F.mine, F.saki, F.hasegawa], look: (list) => dress(list, ISHIDA), scale: 1.4, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40,   // 0.4 では命を戻さない流しで三の丸と二の丸の下の段の斬り合いで続けて討たれた（城方は老兵・若い兵が多く戦えたのは千ほど・battle_learn）
      // 近い敵も塀と段差を確かめる。二の丸の塀越しの相手を選び続けて、門への進軍が止まるのを防ぐ。
      routeFight: true,
      // 11/19 00:50 UTC クラウド持ち主：段4で尾根の東の斜面 (4〜10,-84〜-57) へ出た宇多の兵を遠くから追い、本人の道案内が尾根道を
      //   後ろ (-8,-72) へ戻して中の段の口を行き来し、段4の討ち取り0（act bot 足跡）。二の丸の段（④）では尾根の曲輪の幅の外の敵は追わない
      botFoeAllowed: (o) => !o.perch && !((F.dp?.i ?? -1) === 6 && (o.pos.x > 3 || o.pos.x < -21)),
      // 11/19 02:05 UTC クラウド持ち主：段の間の bot は def.botBrain を通らず共通の段の頭（depthBot）だけで歩く（botBrainDepth が無い）。段の頭の後の舵（botSteer）で二つを直す
      botSteer: (b, inp) => sawayamaSteer(b, inp) });
  },
  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    // 11/21 20:55 UTC クラウド持ち主（K582 携帯の見なし act bot 二回とも ★★「馬に乗ろうとしても乗れなかった」6回）：
    //   山城の尾根道と狭い門を攻め上る戦。位の高い者も馬を麓の陣に預け、徒で登る（有岡の夜討ちと同じ手）。空馬の手綱も出さない
    { const P = rt.player;
      if (P) { if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; } P.canRide = false; P.mayRide = false; if (P.u) P.u.mayRide = false; } }
    this.south(rt);
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // 11/17 K355 iMac n-kwatch（大乱関ヶ原 6巻から：関ヶ原の二日後、寝返った諸将が三成の本拠の寄せ手の先頭に立つ気まずさ）。足軽の小声一つ
    rt.after(20, () => { if (!F.ending && !rt.over) rt.say('小早川の足軽', '二日前まで治部の味方じゃった我らが、一番に攻めるとはな……', 3.4); }, true);
    // 寄せ手の竹束：内堀の手前の田に並べ、櫓と土塁の上の鉄砲・矢を受ける（陰にいる味方は前からの矢玉を八割五分防ぐ）
    patchGunCover(rt);
    for (const [x, z] of [[138, -5], [138, 5], [136, -16], [136, 16], [134, -26], [134, 26], [140, -34], [140, 34]]) addTaba(rt, x, z, 0, { fixed: true, rot: -Math.PI / 2 });
    // 三の丸の尾根：登る寄せ手へ、三の丸の守りが石と丸太を落とす（三の丸を落とすまで）
    //   落ちる筋は尾根の道の六歩ほど脇の斜面（道の真上だと、一つの石で登る列の十五人が倒れ、尾根で隊が崩れた）。列の端の者だけが巻き込まれる
    F.rocks = makeRockTraps(rt, { posts: [{ id: 'san', team: 1, stock: 2, interval: [16, 24],
      lane: [[20, -99], [30, -94.5], [48, -80.5], [64, -60.5]], active: () => (F.dp?.i ?? -1) === 3 },
      // 大手門の上から土橋へ、二の丸の下の段の門から尾根の道へ（十の3）。門が破れるまで
      { id: 'ote', team: 1, stock: 4, interval: [10, 16], lane: [[121, -1.5], [127, -0.5], [135, 0]], active: () => !F.gateOpen.ote },
      // 落ちる筋は門前の道の五歩脇の斜面（道の真上だと、門前で待つ主人公に石が続けて当たり、助けなしの流しで討たれた）
      { id: 'ni3', team: 1, stock: 3, interval: [12, 18], lane: [[-13, -88], [-13, -94], [-12, -100]], active: () => (F.dp?.i ?? -1) === 5 && !F.gateOpen.ni3_n }] });
    depthStart(rt, this.dctx(rt), [   // 櫓の上の射手は下から斬れない（追うと塀の下に詰まって段が進まなかった）
      // ① 大手門を破る（11/17 ③ 厚み：本人の60m内の敵が90秒16・200秒35と薄かった＝大手・侍屋敷・三の丸・二の丸の下の段の守りを五〜八人ずつ厚く。籠城は二千八百）
      DP.fight({ at: OTE, title: '大手門', sub: '内堀と土塁の奥に枡形の門', obj: '大手門の内の侍屋敷で石田勢を討て', max: 150, noRefill: true,   // 11/9 三巡（織田C）：新手の継ぎ足しで段が七分半続き、act が新手の大手の守りに倒れた。後の段と同じく継ぎ足さない

        say: [['脇坂の侍', '櫓と土塁の上から鉄砲と矢じゃ！　竹束の陰から土橋へ寄せ、掛矢で門扉を破れ'], ['小早川の侍', '先手が谷へ撃ち落とされておる。土塁の陰を伝え']],
        foes: () => [{ ...OTE_KEEP(), adopt: () => rt.flags.oteG }],
        later: [{ t: 30, say: ['小早川の侍', '侍屋敷から石田の新手が打って出たぞ！'], foes: () => [keep('侍屋敷の石田勢', { x: 96, z: -18 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }])] },
          // 老兵の福島次郎作は矢が尽きても他人の矢を拾って射続けた（『佐和山落城記』）
          { t: 48, say: ['脇坂の侍', '屋敷の南からも石田の手が出てきたぞ！'], foes: () => [keep('侍屋敷の石田の二の手', { x: 100, z: 16 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }])] },
          { t: 56, foes: () => [keep('大手の櫓下の石田勢', { x: OTE.x - 6, z: OTE.z + 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }])], say:['脇坂の侍', '櫓の上の老いた弓取り、矢が尽きても拾うて射てくる！'] },
          // 11/18 ③ 90秒の厚み：本人の60m内の敵が 35 で目安40に届かず。侍屋敷の奥から三の手を出す
          { t: 40, say: ['小早川の侍', '屋敷の奥から石田の三の手じゃ。押し返せ！'], foes: () => [keep('侍屋敷の石田の三の手', { x: 104, z: -8 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }])] }],
        // 11/18 20:50 UTC クラウド持ち主：戦の長さ（act bot 545秒＝九分。段1は最後の新手 t75 まで閉じず七十五秒・段2 百二十九秒）→段1の新手を 30/40/48/56 秒・段2を 25/45 秒へ詰め、大手門の待ちを四十→三十秒に
        reward: '大手門を破った' }),
      // 十七日の日暮れ：攻めは止み、三の丸を受け持つ大坂の援兵・長谷川守知が兵を連れて城を出て、小早川の先陣に付く（内応）
      DP.rest({ dur: 9, heal: 0.7, fn: (rt2) => this.dusk(rt2),
        say: [['小早川の侍', '日が暮れた。攻めは止みじゃ'], ['小早川秀秋', '三の丸から長谷川守知の手が出てくる。岡野殿の申された通りじゃ。通してやれ', 4.2]] }),
      DP.move({ to: SAN_FOOT, obj: '侍屋敷の北の口を抜け、三の丸の尾根の下へ行け', label: '三の丸の尾根', r: 8, max: 90,
        // 伏兵は北の口へ向かう道の脇（南の屋敷の間で出すと、追う主人公のカメラが屋敷の屋根の中に入った）
        ambush: { d: 30, say: ['小早川の侍', '侍屋敷の陰に伏兵じゃ！'], foes: () => [keep('侍屋敷の伏兵', { x: 96, z: -21 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      // ② 三の丸
      // 正澄は三の丸の奥で指揮し、隊が崩れると本丸へ退く。史実の退却まで無敵の将を斬り合いの相手にしない。
      DP.fight({ at: SAN, title: '三の丸', sub: '北の尾根の先に石田正澄', obj: '三の丸から石田正澄の隊を追い落とせ', max: 130, noRefill: true,   // 11/21 11:50 UTC 持ち主 クラウド（act bot 842秒＝十四分・4〜7分の決まりの倍）：180→130（半ば崩れ・口の十四歩内で入った見なしを五十秒早く）   // 長谷川の手引きで三の丸は一夜で落ちた。新手を足すと、崩れた兵が塀の内に溜まって百を超え、次の段で主人公を囲んだ
        say: [['長谷川守知', '三の丸の勝手は知っておる。我らが先に立つ'], ['石田正澄', '長谷川め、裏切ったか。石田木工頭正澄これにあり。一歩も通すな！']],
        foes: (rt2) => {
          const g = enemyGroup(rt2, { fixed: true, noGuard: true, noRetinue: true, faction: 'ishida', name: '石田正澄の指揮所', anchor: { x: -8, z: -100 }, facing: Math.PI / 2, order: 'hold', aggro: 0, seekRange: 1, noRout: true },
            dress([{ type: 'busho', n: 1, o: { name: '石田正澄', hat: 'kabuto_m', horse: true, invuln: true } }], ISHIDA));
          for (const u of g.units) u.noTarget = true;
          // 11/19 03:05 UTC クラウド持ち主：打って出た守りが三の丸から四十五歩の繋ぎ（seek）の端＝尾根の坂の上 (40〜47,-90〜-95) で止まり、本人は十歩下の坂 (52〜57,-80〜-87) で
          //   四十〜八十秒向き合ったまま斬り合わず、段2の本人の討ち取り0〜1（act bot 足跡 九本）。繋ぎを五十八歩にし、坂を下って寄せ手とぶつかる
          return [keep('三の丸の守り', SAN, [{ type: 'samurai', n: 8 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], { morale: 98, seek: 58 })];
        },
        later: [{ t: 25, say: ['石田正澄', '石田の鉄砲衆、曲輪の内から撃ちかけよ！'], foes: () => [keep('三の丸の石田鉄砲衆', { x: SAN.x + 4, z: SAN.z - 8 }, [{ type: 'gun', n: 3 }, { type: 'bow', n: 2 }, { type: 'samurai', n: 1 }])] },
          // 11/18 ③ 200秒の厚み（60m内の敵 35）：正澄の旗本が曲輪の奥から押し返す
          { t: 45, say: ['石田正澄', '旗本ども、押し返せ！'], foes: () => [keep('石田正澄の旗本', { x: SAN.x - 4, z: SAN.z - 6 }, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 7 }], { morale: 98 })] }],
        onEnd: (rt2) => this.sumiOut(rt2),
        reward: '三の丸を落とした' }),
      // 十八日の明け：残るは二の丸と本丸
      DP.rest({ dur: 6, heal: 0.7, fn: (rt2) => this.dawn(rt2), say: [['小早川秀秋', '夜が明けた。残るは二の丸と本丸じゃ。一気に攻め上れ']] }),
      // ③ 二の丸の三段
      // 三の丸が落ちると、本丸のほかの曲輪は次々と落ちた（歴史街道）。二の丸の二つの段は新手を足さず、居る兵を討てば次へ
      DP.fight({ at: NI3, title: '二の丸', sub: '尾根の段を一つずつ落とす', obj: '二の丸の下の段の石田勢を討て', max: 115, noRefill: true,   // 11/21 11:50 UTC：段3 が199秒（本人が守りの二十一歩より寄れず百八十秒）→160→115
        say: [['小早川の侍', '三の丸は落ちた。二の丸の段を一つずつ落とせ']],
        foes: () => [keep('二の丸の下の段の守り', NI3, [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], { seek: 22, noRout: 40 })],   // 一人討たれて皆逃げ、斬り合わずに段が済んだ（九の2）。四十秒は段の口で踏みとどまる
        // K306 の続き（11/18 クラウド k365-cloud-42）：十八日の朝、城方の津田清幽が城を下り、正継らの腹と引き換えに城兵の助命を家康の使いと談じた。
        //   話のさなかに寄せ手が攻め入ったので、のちの朝成の「約束を違えたか」に繋がる（『津田清幽覚書』）
        later: [{ t: 10, say: ['使番', '城から津田清幽と申す者が下りて参った。正継らの腹と引き換えに、城兵の命を乞うておる由'], foes: () => [] },
          { t: 18, say: ['小早川の侍', '話がまとまるのを待つ者はおらぬ。手柄は今のうちじゃ、登れ！'], foes: () => [] },
          { t: 30, say: ['小早川の侍', '中の段から石田の加勢が駆け下りてくるぞ！'], foes: () => [keep('二の丸の中の段の加勢', { x: -8, z: -56 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], { seek: 22 })] }],
        reward: '二の丸の下の段を落とした' }),
      // 宇多頼忠は落城の時に果てた。段が済んでまだ生きていれば、崩れて退くところを寄せ手に討たれる（udaEnd。目標の✔の後に名札が生きて残らない）
      DP.fight({ at: NI1, title: '二の丸の上の段', sub: '本丸の石垣の下', obj: '二の丸の上の段で宇多頼忠を討て', max: 160, noRefill: true,
        say: [['宇多頼忠', '婿どのの城じゃ。この老骨が二の丸を守る']],
        foes: () => [keep('宇多頼忠の隊', NI1, [{ type: 'busho', n: 1, o: { name: '宇多頼忠', hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 3 }], { morale: 98, seek: 22, noRout: 400, noGuard: true })],
        onEnd: (rt2) => this.udaEnd(rt2),
        reward: '二の丸を落とした' }),
      // 本丸から開城の使い：正継は一族の自害と引き替えに城の者を助けよと申し出た（歴史街道）。その最中に田中勢が水の手から乱入する（説）
      DP.rest({ dur: OPEN_CASTLE_WAIT, heal: 0.7, fn: (rt2) => this.tanaka(rt2),
        say: [['小早川の侍', '本丸から使いじゃ。正継殿は一族の腹と引き替えに、城の者を助けよと', 4.2], ['小早川秀秋', '……よかろう。城を開けさせよ', 3.4]] }),
      // ④ 本丸の天守
      // 正継・正澄・朝成は天守の前で床几に座り（討てない・tsugu）、旗本が打って出る。旗本が尽きると一族は天守に入って自害し、天守に火が回る
      DP.fight({ at: HON_YARD, title: '本丸', sub: '佐和山の頂、石垣と五層の天守', obj: '本丸の天守の前で石田正継の旗本を討て', max: 200, noRefill: true,   // 十八日は開城の約束の後の乱入で、本丸は短い斬り合いで終わった
        say: [['小早川の侍', '本丸の門じゃ。城を受け取りに上れ']],
        onEnd: (rt2) => this.burn(rt2),
        foes: (rt2) => { this.tsugu(rt2); return [keep('石田正継の旗本', HON_YARD, [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }], { morale: 100, seek: 12, noRout: 40, noGuard: true })]; },   // 11/18 戦の長さ（act bot 490〜542秒＝八分半）：百→六十五秒。本人が曲輪に入るまで段は閉じない（k07Inside）   // 四十秒で崩れると、主人公が本丸の門に着く前に段が済んだ（11/7）   // 侍十二では、本丸の門で囲まれて主人公が討たれる回があった（史実も乱入の後の短い斬り合い）
        reward: '本丸に攻め入った' }),
    ], (rt2) => this.win(rt2));
    // 共通の放置・時間切れでは曲輪を落とさない。主人公がその曲輪へ入り、
    // 守りを崩した時だけ次へ進む（本丸は田中勢の実際の乱入も待つ）。
    for (const s of F.dp.steps) if (s.kind === 'fight' || s.kind === 'move') {
      s.idleAdvance = false;
      s.limit = Infinity;
      s.noHardCap = true;
      if (s.kind !== 'fight') continue;
      const yardId = { 0: 'ote', 3: 'san', 5: 'ni3', 6: 'ni1', 8: 'hon' }[F.dp.steps.indexOf(s)];
      const yard = PLAN.kuruwa.find((k) => k.id === yardId);
      // 潰走も虎口と尾根の道を通って本丸へ退く。向きだけで逃がすと、
      // 三の丸・二の丸の塀の内に数十人が溜まり続ける。
      const retreat = ['ote', 'san', 'ni3', 'ni1'].includes(yardId)
        ? ROUTE.slice(Math.ceil(routeAt((yard.poly[0][0] + yard.poly[1][0]) / 2,
          (yard.poly[0][1] + yard.poly[2][1]) / 2, RT).s)) : null;
      const tick = s.tick;
      s.tick = (rt2, C, m, ctx, el, dt) => {
        if (retreat) for (const g of C.groups) if (!g.fleePath) g.fleePath = retreat;
        const p = rt2.player.u.pos;
        const inside = !!yard && p.x > yard.poly[0][0] && p.x < yard.poly[1][0] && p.z > yard.poly[0][1] && p.z < yard.poly[2][1] && Math.abs(p.y - yard.level) < 3;
        C.k07Inside = inside;
        // 11/18 戦の長さ（十分前後→4〜7分）：守りの六割半が崩れた後は、曲輪の口の六歩内まで来れば入ったと見なす（口の外から曲輪の奥まで歩き直させない）
        const edge = yard ? Math.hypot(Math.max(yard.poly[0][0] - p.x, 0, p.x - yard.poly[1][0]), Math.max(yard.poly[0][1] - p.z, 0, p.z - yard.poly[2][1])) : 99;
        // 11/18 04:46 UTC act bot：段3（二の丸の下の段）で本人が門の外の尾根を行き来し、曲輪に入らないまま十三分止まって日暮れの負け。
        //   段の始めから max＋四十秒を過ぎたら、半ば崩れで守りを退かせ、口の十四歩内まで来れば入ったと見なす（描かずの通し四回は段3が45〜120秒）
        const late = C.t0 != null && rt2.t - C.t0 > s.max + 40;
        // 11/18 21:05 UTC クラウド持ち主：act bot 一回で宇多を討った〔済〕の後、本人が崩れた兵を追って尾根を下り、曲輪へ戻るまで七十秒段が明けなかった（538→608秒）。
        //   守りが崩れて戻りを待つのが十五秒を越えたら、本丸のほかは本人の居場所を問わず段を明ける（次の段のピンが先を指す）
        const retLong = yardId !== 'hon' && C.k07RetT != null && rt2.t - C.k07RetT > 15;
        const atYard = inside || retLong || (!!C.k07SectionReady && (edge < 6 || (late && edge < 14)) && Math.abs(p.y - yard.level) < 4);
        if (inside) {
          C.k07Entered = true;
          C.k07EnteredAt ??= rt2.t;
          // 曲輪を離れて待つ時間は、宇多との斬り合いに含めない。
          C.k07FightTime = (C.k07FightTime || 0) + dt;
        }
        let cleared = tick(rt2, C, m, ctx, el, dt);
        // 共通の呼び戻しは遠い残兵を攻めへ戻す。制圧後の退却は、
        // 主人公の戻りや田中勢の到着を待つ間も取り消さない。
        for (const g of C.groups) if (g._spOut && !g.routed) {
          g.noRout = false; g.morale = 0; g.order = 'retreat';
        }
        // 外へ残兵を追った時も戦力の減りを調べ、制圧する曲輪へ戻す。
        // 戻るまでは退却も達成も起こさない。宇多の討死は udaTick の接敵判定に任せる。
        if (!C.later.length && rt2.t >= (C.k07ReadyAt || 0)) {
          C.k07ReadyAt = rt2.t + 0.5;
          // 各段の刻限は即達成にせず、曲輪の内で戦った時間として使う。
          // 長く攻めて半数を崩した後は守備を退かせ、塀裏の残兵で止めない。
          C.k07SectionRatio = C.k07FightTime >= s.max || yardId === 'san' || late ? 0.5 : 0.65;   // 三の丸は長谷川の手引きで一夜で落ちた：半ば崩れれば正澄は本丸へ退く
          C.k07SectionReady = sectionTaken(rt2, C.groups, { few: 0, keep: true, ratio: C.k07SectionRatio });
        }
        C.k07Return = !atYard && (cleared || C.k07SectionReady);
        if (C.k07Return) C.goal = C.at;
        // 11/19 クラウド29（中学生 bot 777秒：本丸の段で旗本を崩した後、本人が曲輪の外に居て、守りの組が尽きて赤い印も消え『印も無い・敵もいない』まま三十秒迷った）：
        //   曲輪へ戻る間は、曲輪の真ん中にピンを立てる（守りの組が残る間は組の赤い印を上書きしない）
        if (C.k07Return && !alive2(C.groups) && !C.k07RetMark) { C.k07RetMark = true; rt2.marker('dp', { x: C.at.x, z: C.at.z }, ({ ote: '大手', san: '三の丸', ni3: '二の丸の下の段', ni1: '二の丸の上の段', hon: '本丸' }[yardId] || '曲輪'), { h: 3 }); }
        else if (!C.k07Return && C.k07RetMark) { C.k07RetMark = false; if (!alive2(C.groups)) rt2.unmark('dp'); }
        if (C.k07Return && C.k07SectionReady && yardId !== 'hon') C.k07RetT ??= rt2.t; else if (!retLong) C.k07RetT = null;
        // 曲輪の中央へ攻め入り七割五分を崩せば残兵は退く。塀の裏の数人を全滅まで追わせない。
        // 宇多本人の討ち取りと、本丸への田中勢の乱入は従来どおり必要。
        if (!cleared && atYard && !C.later.length && (yardId !== 'ni1' || rt2.flags.udaDead)) {
          if (!C.k07SectionTaken && rt2.t >= (C.k07SectionAt || 0)) {
            C.k07SectionAt = rt2.t + 0.5;
            C.k07SectionTaken = sectionTaken(rt2, C.groups, { flag: C.at, few: 0, ratio: C.k07SectionRatio ?? 0.65,
              // 頭が生きた組は士気零だけでは退かない。制圧後は退く下知を出し、尾根の退路へ向かわせる。
              retreat: (g) => { g.noRout = false; g.morale = 0; g.order = 'retreat'; },
            });
          }
          cleared = !!C.k07SectionTaken;
        }
        C.k07Cleared = !!cleared;
        // 一度入って外へ戻った時も、曲輪へ入り直すまでは達成しない。
        // 乱入を告げた後の正継・朝成・東雲斎の言葉を終えてから落城へ進む。
        const enteredAt = rt2.flags.tanakaInT;
        // 共通の判定は隊の潰走でも済む。宇多本人の討死は、段を終える前に確かめる。
        // 終了処理で生存中の宇多を倒してから✔を付ける順にはしない。
        // 11/18 cloud-10：本丸の段の保険（act bot 七回のうち二回、本丸の段が六百秒を越えて止まり時間切れ）。三百秒を越えたら田中勢の乱入を告げ、
        //   旗本の六割半が崩れていれば本人の居場所を問わず済にする
        if (C.at === HON_YARD) {
          C.k07HonT ??= rt2.t;
          // 11/19 cloud-10 中学生 bot：旗本が崩れた後、田中勢が水の手から本丸へ着くのを三十秒余り待ち、印も敵も無い間が続いた（564秒）
          //   →本人が本丸の内で旗本を崩したら、八秒で田中勢の乱入を告げる（乱入は開城の約束の後・史実の順は変えない）
          if ((cleared || C.k07SectionReady) && !rt2.flags.tanakaIn && rt2.flags.tanakaGo) {   // 本人の居場所は問わない（中学生 bot は本丸の外で待っていた）
            C.k07HonClrT ??= rt2.t;
            if (rt2.t - C.k07HonClrT > 8) this.tanakaIn(rt2, true);
          }
          // 11/26 クラウドす：三百→百二十秒で乱入を告げ、百五十秒を過ぎれば旗本の崩れを問わず（田中勢と寄せ手が討つ）乱入の言葉の後に明ける
          if (rt2.t - C.k07HonT > 120) {
            const F2 = rt2.flags;
            if (!F2.tanakaIn) this.tanakaIn(rt2, true);
            if ((C.k07SectionReady || cleared || rt2.t - C.k07HonT > 150) && F2.tanakaIn) return rt2.t - F2.tanakaInT >= 15.4;
          }
        }
        // 11/18 cloud-10：曲輪の段の保険（act bot：宇多を討ち札が「済」になった後、本人が二の丸へ戻れず五百七十秒止まり時間切れ）。
        //   守りが崩れて（宇多の段は宇多の討死も）九十秒たてば、本人の居場所を問わず段を済にする（本丸は上の保険）
        // 11/26 16:50 UTC クラウドす（K674・act bot 1070秒の時間切れ：段2 294秒・段3 276秒・段4 152秒で本丸の段の初めが905秒＝続きの段の五つが入らない）：
        //   曲輪ごとに締めの秒（HARD）を置き、過ぎれば本人の居場所と討ち取りを問わず守りを退かせて段を明ける（三の丸の後は一夜で次々と落ちた・歴史街道）。
        //   宇多は段の締め（udaEnd）で寄せ手に討たれる。本丸は田中勢の乱入を告げてから明ける（下の本丸の保険）
        const hardT = { ote: 150, san: 120, ni3: 110, ni1: 120 }[yardId];
        if (hardT && C.t0 != null && rt2.t - C.t0 > hardT) {
          for (const g of C.groups) if (g.count && !g.routed) { g.noRout = false; g.morale = 0; g.order = 'retreat'; }
          return true;
        }
        const doneHere = (cleared || C.k07SectionReady) && (yardId !== 'ni1' || !!rt2.flags.udaDead);
        if (doneHere && C.at !== HON_YARD) { C.k07DoneAt ??= rt2.t; if (rt2.t - C.k07DoneAt > 10) return true; }   // 11/21 二十→十秒（戦の長さ）   // 11/19 九十→二十秒（崩れた後に本人が曲輪の外で七十〜八十秒何も無く立った＝退屈の元）
        return cleared && atYard && (yardId !== 'ni1' || !!rt2.flags.udaDead) && (C.at !== HON_YARD ||
          (rt2.flags.tanakaIn && enteredAt != null && rt2.t - enteredAt >= 15.4));
      };
    }
  },

  // 本丸の奥：城の総大将の石田正継と、三の丸から退いた正澄、正澄の子の朝成は天守の前で床几に座る（O・AR3）。
  //   討てない（名の札は出る）。前で旗本が打って出て、旗本が尽きると天守に入って自害する（史実）
  tsugu(rt) {
    const F = rt.flags;
    if (F.tsugu) return;
    // 本丸の段では南の小川の手を太鼓丸の下へ退かせる（正継の旗本が本丸を出て太鼓丸の小川勢へ打ちかかり、本丸の外の南の尾根で斬り合っていた・11/7）
    if (F.south && F.south.count) { F.south.order = 'hold'; F.south.anchor = { x: 70, z: 56 }; F.south.seekRange = 8; F.south.aggro = 3; }
    // 天守の土台は中心（-14, 0）から東へ約六歩まである。土台の中に座らせず、東の広場で三人の姿と名を見せる。
    // 守りの旗本は段の隊で出す。三人の座に護衛を自動追加せず、本丸の外への出現位置の補正も掛けない。
    F.tsugu = enemyGroup(rt, { fixed: true, noGuard: true, noRetinue: true, faction: 'ishida', name: '石田一族', anchor: { x: HON_YARD.x, z: HON.z + 6 }, facing: -Math.PI / 2, order: 'hold', aggro: 0, seekRange: 1, width: 5, morale: 100, noRout: true },
      dress(['石田正継', '石田正澄', '石田朝成'].map((name) => ({ type: 'busho', n: 1, o: { name, hat: 'kabuto_m', invuln: true, horse: false } })), ISHIDA));
    for (const u of F.tsugu.units) { u._crouch = true; u.noTarget = true; }
  },

  // 三の丸の隊が崩れたら、正澄は本丸へ退く（尾根の奥へ歩いて、見えなくなった所で下げる。十八日に本丸の天守の前に座る）
  sumiOut(rt) {
    const F = rt.flags;
    const u = rt.army.units.find((v) => v.alive && v.team === 1 && v.name === '石田正澄');
    if (!u) return;
    F.sumiU = u; F.sumiT = rt.t;
    u.noTarget = true;
    // 段の終わりの潰走は出現位置から逃げるだけなので、本丸へ続く尾根を退路にする。
    // 狙っていた寄せ手への太刀も止め、「退いた」の知らせの後に斬り合いへ戻さない。
    if (u.group) u.group.fleePath = [[-8, -96], [-8, -84], [-8, -72], [-8, -62], [-8, -50], [-8, -40], [-8, -28], [-8, -18]];
    u.fleeing = true; u.fleePathIdx = 0;
    u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null;
    u.aiT = 0;
    rt.say('小早川の侍', '正澄は本丸へ退いたぞ！　三の丸は我らの物じゃ', 3.4);
  },
  sumiTick(rt) {
    const F = rt.flags, u = F.sumiU;
    if (!u) return;
    const p = rt.player.u.pos, d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (!u.alive || d > 34 || rt.t - F.sumiT > 14) { if (u.alive) rt.army.despawn(u); F.sumiU = null; }
  },

  // 二の丸の上の段が済んだ時、宇多頼忠がまだ生きていれば、退くところを寄せ手に討たれる
  udaEnd(rt) {
    const u = rt.army.units.find((v) => v.alive && v.team === 1 && v.name === '宇多頼忠');
    if (!u) { rt.flags.udaDead = true; return; }
    // 名のある将は討ち手がいると組頭の立ち直り（officerStand）で死なず、札だけ出て④に✔が付かなかった。討ち手なしで倒す
    u.invuln = false; u.hp = 0; rt.army.kill(u, null);
    rt.flags.udaDead = true;
    // 札は共通の「宇多頼忠が討たれた」の一つだけ（前は「宇多頼忠、果つ」と二枚続いた・11/7）
  },

  // 二の丸の上の段：宇多の隊の兵が持ち場を離れて本丸の向こう（南の太鼓丸）へ走れば、そこで追わせない。
  //   段の外へ出た兵は本丸へ退いた事にして下げ、宇多が逃げかけた時は追いついた寄せ手が討つ（主人公が南の尾根まで六分追い回した・11/7）
  udaTick(rt) {
    const F = rt.flags, D = F.dp;
    if (!D || !D.on || D.i !== 6 || !D.cur?.groups) return;
    if ((F.udaT || 0) > rt.t) return;
    F.udaT = rt.t + 0.5;
    // 11/18 クラウド持ち主（act bot 段4が二百九十秒・宇多の隊へ十一mまでしか寄れず曲輪に入れなかった）：
    //   二分五十秒の保険は、本人が曲輪へ入る前にも効かせる（前は入るまで何も数えなかった）
    // 11/19 03:15 UTC クラウド持ち主：act bot 十八本のうち十本で宇多は百四十秒の保険で落ち、本人が討てなかった（名のある将 本人0/他1）。
    //   足跡では本人が宇多と槍を合わせて（二歩内）十〜三十秒、宇多の命 456 が 260〜370 まで減った所で保険が落としていた。
    //   本人が宇多の四歩内で斬り合っている間は、保険を百七十五秒まで待つ
    const pu = rt.player.u, udaU0 = !F.udaDead && rt.army.units.find((v) => v.alive && v.team === 1 && v.name === '宇多頼忠');
    // 11/19 04:00 UTC クラウド持ち主：その後の act bot 六本でも宇多は五本が保険で落ちた（本人0/他1）。本人は八歩ほどまで寄っても、
    //   馬上の宇多（命456）を削り切る前に保険か味方の寄せ（reached）が落とした → 本人が八歩内に来て段が八十秒を過ぎたら、
    //   老いた宇多は息が上がった事にして命を四割まで（一度だけ）。保険の延ばしも八歩内で効かせ、味方の寄せの保険はその間待つ
    const udaClose = !!(udaU0 && pu && pu.alive && !udaU0.fleeing && Math.hypot(udaU0.pos.x - pu.pos.x, udaU0.pos.z - pu.pos.z) < 8 && Math.abs(udaU0.pos.y - pu.pos.y) < 3);
    if (udaClose && !F.udaWeak && D.cur.t0 != null && rt.t - D.cur.t0 > 80) { F.udaWeak = true; udaU0.hp = Math.min(udaU0.hp, (udaU0.maxHp || 456) * 0.4); }
    const udaCap = udaClose ? 175 : 140;
    if (!F.udaDead && D.cur.t0 != null && rt.t - D.cur.t0 > udaCap) this.udaEnd(rt);
    if (!D.cur.k07Entered && !F.udaDead) return;
    // 宇多が討たれたら隊は主を失って崩れる（史実の決まり：組の頭が討たれた組は退く）。前は崩れない（noRout 400）ままで、討った後も八十秒斬り合いが続いた（11/6 流し）
    if (F.udaDead) for (const g of D.cur.groups) if (g.count && !g.routed) {
      // 生きた組頭が士気だけで立ち直って段が閉じなくなるのを防ぐ。
      // 共通の呼び戻しが動いた後も、主を失った隊は尾根の退路へ退く。
      g._udaLost = true; g.noRout = false; g.morale = 0; g.order = 'retreat';
    }
    // 11/18 クラウド kaito2 K365：隊が崩れて宇多だけが本丸の側へ逃げ、本人が追って曲輪の外へ出ると、宇多は生きたまま・本人は曲輪の外で、
    //   「④ 14/14」のまま八十秒余り何も起きなかった（874×402 の写真）。隊の全員が逃げる兵になって八秒たてば、宇多は落ちる途中で討たれた事にする
    // 11/17 クラウド kaito2：宇多の隊が本丸の側へ下がり、本人が追って曲輪の外（-7,-18）・本丸の西を十分あまり迷い、日暮れで失敗した（まとめの枝の act bot）。
    //   段4が四分を越えたら、曲輪の外にいても宇多は落城の時の討死とする（印は二の丸の上の段へ戻る＝k07Return）
    if (!F.udaDead && D.cur.t0 != null && rt.t - D.cur.t0 > udaCap) { this.udaEnd(rt); return; }   // 11/18 戦の長さ：四分→二分五十秒→二分二十秒（act bot で段4が百〜百三十秒・戦の全体が七〜八分）
    // 11/18 描かずの通し：宇多（命456）が隊の頭のまま南の口から本丸の門の内（-19,-8）へ歩き、本人が寄れずに段が延びた。
    //   崩れていない間に曲輪の南の口を越えたら、宇多の組を二の丸の上の段へ呼び戻し、追う間合いを曲輪の内に縮める
    if (!F.udaDead) for (const g of D.cur.groups) {
      const L = g.units.find((u) => u.alive && u.name === '宇多頼忠');
      if (!L || L.fleeing || g.routed) continue;
      if (L.pos.z > -26 || L.pos.y > 47) { g.anchor = { x: NI1.x, z: NI1.z }; g.order = 'hold'; g.seekRange = 8; g._udaPulled = true; }
      else if (g._udaPulled && L.pos.z < -30) { g.seekRange = 14; g._udaPulled = false; }
    }
    if (!F.udaDead) {
      const fleeing = D.cur.groups.every((g) => g.units.every((u) => !u.alive || u.gone || u.fleeing));
      const udaU = fleeing && rt.army.units.find((u) => u.alive && u.team === 1 && u.name === '宇多頼忠');
      if (udaU) { F.udaFleeT ??= rt.t; if (rt.t - F.udaFleeT > 8) { this.udaEnd(rt); return; } } else F.udaFleeT = null;
    }
    // 一度入っても、曲輪を離れた間は南へ出た兵の整理や討死の保険を動かさない。
    if (!D.cur.k07Inside) return;
    // 段の初めの十五秒は数えない：出た一コマで宇多が「南へ抜けた」と見なされて果て、④の斬り合いが無いまま段が済んだ（11/6 流しで再び出た）
    // 門の外で待った時間では討死させない。主人公が曲輪に入ってからの斬り合いを数える。
    const el = D.cur.k07FightTime || 0;
    if (el < 15) return;
    // 時間や退く位置だけでは討死にしない。壁・段差を隔てず、戦える寄せ手が槍の届く所にいる時だけ補う。
    const uda = !F.udaDead && rt.army.units.find((u) => u.alive && u.team === 1 && u.name === '宇多頼忠');
    const reached = uda && rt.army.units.some((u) => u.alive && u.team === 0 && !u.isStruct && !u.fleeing &&
      !u.downed && !u.dying && !u.woundOut && !u.gone && Math.abs(u.pos.y - uda.pos.y) < 3 &&
      (u.pos.x - uda.pos.x) ** 2 + (u.pos.z - uda.pos.z) ** 2 < 16 && !rt.army.wallBetween(u.pos, u.team, uda.pos, false));
    if (reached && el > (udaClose ? 110 : 65)) { this.udaEnd(rt); return; }   // 11/18 戦の長さ：百二十→九十→六十五秒（04:40 UTC act bot 423・485秒・段4が九十九〜百三十一秒）
    // 曲輪の内で四分戦っても宇多へ寄れない（段差・塀の裏に籠もる）時は、落城の時の討死として寄せ手が討つ（11/17 bot：宇多へ10mまでしか寄れず十二分止まった）
    if (uda && el > 240) { this.udaEnd(rt); return; }
    for (const g of D.cur.groups) for (const u of g.units.slice()) {
      if (!u.alive) continue;
      // 本丸の南（太鼓丸の側）へ抜けた者、本丸へ向けて逃げる者だけ（段の初めに隊が丸ごと消えて、宇多の段が一秒で済んだ・11/7）
      const away = u.pos.z > HON.z + 8 && u.pos.z < 200 && Math.hypot(u.pos.x - NI1.x, u.pos.z - NI1.z) > 40;
      if (u.name === '宇多頼忠') { if (away && reached) this.udaEnd(rt); continue; }
      if (away) rt.army.despawn(u);
    }
  },

  // 田中吉政の手：十八日、搦手（西・琵琶湖の側）の水の手から西の丸を抜け、本丸の西の口へ乱入する（説）
  tanaka(rt) {
    const F = rt.flags;
    if (F.tanakaGo || !F.tanaka) return;
    // 休みの始まりには、まだ開城の使いも秀秋の承知も出ていない。
    // 話を聞き終えてから開門し、水の手の隊を動かす。
    const D = F.dp;
    if (!D || D.i < 7 || (D.i === 7 && rt.t - D.cur.t0 < OPEN_CASTLE_WAIT)) return;
    F.tanakaGo = true;
    F.tanaka.fixed = false; F.tanaka.aggro = 12; F.tanaka.seekRange = 60;
    // 水の手から西の丸の尾根を登り、西の丸を抜けて本丸の西の口へ（まっすぐ寄せると西の丸の土塁の下に詰まった）
    F.tanaka.order = 'path'; F.tanaka.path = KARAME_ROUTE.map((p) => p.slice()); F.tanaka.pathIdx = 0;
    F.tanaka._k07Karame = true;
    F.tanaka.formation = 'column'; F.tanaka.roadColumn = true; F.tanaka.followColumnRoad = true;
    // 西の丸の口では一列に詰める。二列の端は馬の持ち場の揺れで道幅を外れ、切岸の下で止まる。
    F.tanaka.colW = 1;
    F.tanaka.dmgMult = 0.7;
    F.tanakaT = rt.t;
    this.openGate(rt, 'hon');   // 開城の使いの後、城方が本丸の門を開けた
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z - 4, 'maru', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  // 田中勢が本丸の西の口に着いたら乱入を告げる（言った物が本当にそこにいる）
  tanakaIn(rt, force = false) {
    const F = rt.flags;
    // 本丸の座標だけでは乱入にしない。開城を承知し、水の手から進軍を始めた後に限る。force は本丸の段の保険（三百秒）
    if (F.ending || F.tanakaIn || !F.tanaka) return;
    if (!force) {
    if (!F.tanakaGo || F.tanakaT == null) return;
    const since = rt.t - F.tanakaT;
    if (since < OPEN_CASTLE_WAIT) return;   // 早く着いても開城の話を遮らず、約束の後に乱入を告げる
    // 石垣の下を通る兵や、倒れた兵・離脱する兵を、本丸へ乱入した兵として数えない。
    const level = PLAN.kuruwa.find((k) => k.id === 'hon').level;
    const near = F.tanaka.units.some((u) => u.alive && !u.downed && !u.dying && !u.woundOut && !u.gone && !u.fleeing &&
      u.pos.x >= -24 && u.pos.x <= 4 && u.pos.z >= -18 && u.pos.z <= 16 && Math.abs(u.pos.y - level) < 3);
    if (!near) return;
    }
    F.tanakaIn = true;
    F.tanakaInT = rt.t;
    F.tanaka.order = 'attack'; F.tanaka.anchor = { x: HON_YARD.x, z: HON_YARD.z };
    rt.say('田中吉政', '水の手は田中が破った。本丸へ乗り込め', 3.4);
    // 再開で flags が替わった後は、前の乱入の台詞を新しい戦へ持ち越さない。
    const current = () => !rt.over && rt.flags === F && !F.ending;
    rt.after(3.8, () => { if (current()) rt.say('石田正継', '……内府も念の入ったことよ', 3.6); });
    rt.after(7.8, () => { if (current()) rt.say('石田朝成', '約束を違えたか。祖父上、天守は我らが守りまする！', 3.6); });
    // 家臣の土田東雲斎は蔵の金銀を投げて寄せ手に拾わせ、正継らの自害の時を稼いだ（歴史街道ほか）
    rt.after(11.8, () => { if (current() && !F.touun) { F.touun = true; rt.say('土田東雲斎', '蔵の金銀を撒け。殿の御最期の時を稼ぐのじゃ', 3.6); } });
  },

  // 十七日の日暮れ：攻めが止み、三の丸の長谷川守知が兵を連れて城を出て、尾根を下って小早川の先陣に付く（言った物が本当にそこにいる。AT の1）
  dusk(rt) {
    const F = rt.flags;
    if (F.hasegawa) return;
    F.dusk = true;
    rt.world.setTime('dusk');
    this.clearPerch(rt, (p) => p.x > 70);   // 大手門と左右の櫓
    this.openGate(rt, 'san_e');   // 長谷川の手が三の丸の門を内から開けて出る
    // 三の丸の門と櫓の上は長谷川が受け持った大坂の鉄砲衆。日暮れに長谷川と共に櫓を降りて城を出る（主人公は大手にいて見えない）。
    //   残すと下から斬れない射手の下に寄せ手が詰まり、三の丸へ入れなかった
    const A = rt.army;
    for (const u of A.units.slice()) if (u.alive && u.team === 1 && u.perch && u.pos.z < -90) {
      // 共通の退場処理で、射手に刺さった矢と攻撃の参照も片付ける。
      A.despawn(u);
    }
    F.hasegawa = allyGroup(rt, { faction: 'oda', name: '長谷川守知の手', anchor: { x: 20, z: -102 }, facing: Math.PI / 2, width: 8, aggro: 6, noRout: true, order: 'attack', seekRange: 20, fixed: true },
      dress([{ type: 'busho', n: 1, o: { name: '長谷川守知', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 6 }], TANAKA));
    F.hasegawa.anchor = { x: 76, z: -52 };
  },

  // 味方の手は虎口を通って次の持ち場へ。壁越し・段違いの敵では行軍を止めない。
  hurry(rt) {
    const F = rt.flags, C = F.dp && F.dp.on && F.dp.cur;
    if (!C || !C.at || C.s.kind === 'rest' || (F.hurryT || 0) > rt.t) return;
    F.hurryT = rt.t + 1;
    // 11/18 09:45 UTC クラウド持ち主：段4の二の丸の門が破れて十二秒の後も、後から着く名の無い攻めの組（七〜九人）が門の口（幅四・四歩）へ
    //   流れ込んで詰まり、本人が曲輪へ入れず討ち取り0〜1（act bot 足跡）。本人が門をくぐるまで（長くて四十秒）、手勢と先手のほかの寄せ手は
    //   門の外の中の段で左右に分かれて待つ。本人が入れば後から続く
    // 11/18 21:50 UTC クラウド持ち主：252秒 二の丸の下の段の門 (-8,-87) の前でも味方が口に縦に詰まり、本人が兵の中に埋もれた（写真 normal_8s_166s_252s_2110）
    //   → 同じ待ちを二の丸の下の段の門（ni3_n）にも掛ける
    const pu = rt.player.u, mk = F.dp.i === SHUT.ni3_n.stage ? 'ni3_n' : 'ni1_n', mo = SHUT[mk];
    const mouth = F.dp.i === mo.stage && F.gateOpen[mk] && pu && pu.alive && pu.pos.z < mo.at[1] + 1.5 &&
      rt.t - (F.gateOpenT?.[mk] ?? rt.t) < 40;
    for (const g of rt.army.groups) {
      if (g.team !== 0 || !g.count || g.routed || g === F.mine || g === F.saki || g === pu?.group) { if (g) g._k07Mouth = null; continue; }
      if (!mouth) {
        if (g._k07Mouth) { g._k07Mouth = null; g.order = 'attack'; g.anchor = { x: C.at.x, z: C.at.z }; }
        continue;
      }
      const c = g.center();
      // 11/19 00:50 UTC クラウド持ち主：門が破れた時に本人が中の段の口 (-8,-62〜-66) にいると、門の十六歩の外で本人のすぐ後ろの組（長谷川の手・
      //   名の無い攻めの組）が待たずに同じ口へ押し寄せ、本人が二十秒余り一歩ずつしか進めなかった（act bot 足跡 寄3〜5）。本人の六歩内の組も待たせる
      const nearMe = Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z) < 6;
      if (!g._k07Mouth && !nearMe && (Math.hypot(c.x - mo.at[0], c.z - mo.at[1]) > 16 || c.z > mo.at[1] + 1)) continue;
      // 11/18 16:00 UTC クラウド持ち主：待つ所が門の九歩手前（-8±5,-52）＝本人が門へ登る細い尾根の道の上で、本人がその組の中に
      //   四十秒余り挟まって門をくぐれず討ち取り0（act bot 足跡 -51〜-54）。待つ所を道の脇の十六歩手前（-8±7,-59）へ下げる
      // 11/18 18:05 UTC クラウド cloud-k07：(-8±7,-59) も尾根の道の上で、本人が -60〜-65 で待つ組に挟まれ六十秒門へ寄れず段4の討ち取り0（act bot 足跡 POSLOG）。
      //   本人より門に近い組は先に門をくぐらせ（待たせない）、本人より後ろの組だけを本人の七歩後ろで待たせる
      if (c.z > pu.pos.z + 2) { if (g._k07Mouth) { g._k07Mouth = null; g.order = 'attack'; g.anchor = { x: C.at.x, z: C.at.z }; } continue; }
      g._k07Mouth = g._k07Mouth || (c.x < mo.at[0] ? -7 : 7);
      let wz = Math.min(mo.at[1] - 16, pu.pos.z - 7);
      // 11/19 03:25 UTC クラウド持ち主：中の段へ先に上がった名の無い組（-15,-59）が、本人が口の下 (-8,-63〜-69) に来ると待つ所を -78 へ替えられ、
      //   幅五歩の口を本人と逆向きに下って百二十秒詰まらせた（act bot 足跡）。もう中の段にいる組は口へ戻さず、中の段の脇 (-56) で待つ
      if (mk === 'ni1_n' && c.z > -61) wz = -56;
      else if (mk === 'ni1_n' && wz < -61 && wz > -74) wz = -78;   // 中の段と下の段の間の細い尾根では待たせず、下の段の内の広い所で
      g.order = 'hold'; g.anchor = { x: mo.at[0] + g._k07Mouth, z: wz }; g.dest = null;
    }
    // 大手を抜いた鉄砲衆も尾根の道で次の曲輪へ送る。攻めの下知だけでは
    // 段違いの敵を遠くから狙い続け、二の丸の下で止まっていた。
    for (const g of rt.army.groups) {
      const reinforcement = g.team === 0 && g.isReserve && !g.stay;
      if (g !== F.mine && g !== F.saki && g !== F.hasegawa &&
        !(g === F.tabaGun && F.dp.i >= 2 && F.gateOpen.ote) && !reinforcement) continue;
      if (!g || !g.count || g.routed || g._k07Mouth) continue;
      const guns = g === F.tabaGun;
      if (guns) g.width = 4;
      // 倒れた兵を待って要を後ろへ戻し続けない。行軍できる兵だけで足並みを測る。
      const c = g._k07Center || (g._k07Center = { x: 0, z: 0 });
      let n = 0; c.x = 0; c.z = 0;
      for (const u of g.units) {
        if (!u.alive || u.downed || u.dying || u.woundOut || u.rearWound || u.evacuatedWound || u.gone || u.fleeing) continue;
        c.x += u.pos.x; c.z += u.pos.z; n++;
      }
      if (!n) continue;
      c.x /= n; c.z /= n;
      const d = Math.hypot(c.x - C.at.x, c.z - C.at.z);
      const from = g._k07Probe || (g._k07Probe = { x: 0, y: 0, z: 0 });
      from.x = c.x; from.z = c.z; from.y = rt.world.heightAt(c.x, c.z);
      const to = g._k07Target || (g._k07Target = { x: 0, y: 0, z: 0 });
      to.x = C.at.x; to.z = C.at.z; to.y = rt.world.heightAt(to.x, to.z);
      const arrived = d < 8 && Math.abs(from.y - to.y) < 3 && !rt.army.wallBetween(from, g.team, to, false);
      // 倒れた者や負傷離脱中の者は行軍を止める相手に数えない。
      const foe = rt.army.units.some((o) => o.alive && o.team === 1 && !o.isStruct && !o.fleeing && !o.noTarget && !o.invuln && !o.perch &&
        !o.downed && !o.dying && !o.woundOut && !o.gone &&
        (o.pos.x - c.x) ** 2 + (o.pos.z - c.z) ** 2 < (guns ? 900 : 36) && Math.abs(o.pos.y - from.y) < 3 && !rt.army.wallBetween(from, g.team, o.pos, false));
      if (g._k07Go && g._k07Go !== C.at) {
        g._k07Go = null; g.speed = g._k07Sp; g.fire = g._k07Fire;
        g.formation = g._k07Form; g.colW = g._k07Cols;
      }
      // 閉じた門の前では縦隊のまま門の一点へ詰めず、門の前に横に並んで破るのを待つ
      //   （11/18 クラウドせ act bot：手勢13人が二の丸の下の段の門の前 (-8,-88) に二度重なった）。
      let ram = null;
      if (!guns) for (const [id, s] of Object.entries(SHUT)) {
        if (s.at && s.stage === F.dp.i && !F.gateOpen[id] && Math.hypot(c.x - s.at[0], c.z - s.at[1]) < 10) ram = s;
      }
      if (ram) {
        if (g._k07Go) {
          g._k07Go = null; g.speed = g._k07Sp; g.fire = g._k07Fire;
          g.formation = g._k07Form; g.colW = g._k07Cols;
        }
        if (!g._k07Ram) g._k07Ram = [g.formation, g.width];
        g.formation = 'line'; g.width = 6; g.order = 'hold'; g.seekRange = 8;
        // 11/18 クラウド持ち主：手勢・脇坂の先手・長谷川の手が同じ門の一点を要にして一つに重なった（541秒・668秒）。
        //   隊ごとに門から外へ一歩半ずつ下げ、門前に横陣が重なりあって並ぶ形にする（四歩ずつ下げると門前の本人が一人になり、
        //   二の丸の下の段の門で宇多の足軽に討たれた・act 336秒）
        const fx = C.at.x - ram.at[0], fz = C.at.z - ram.at[1], fl = Math.hypot(fx, fz) || 1;
        const back = 1.5 * (g === F.mine ? 0 : g === F.saki ? 1 : g === F.hasegawa ? 2 : 1.5);
        g.anchor = { x: ram.at[0] - fx / fl * back, z: ram.at[1] - fz / fl * back };
        g.facing = Math.atan2(fx, fz);
        continue;
      }
      if (g._k07Ram) { [g.formation, g.width] = g._k07Ram; g._k07Ram = null; }
      if (!arrived && !foe) {
        // 11/22 11:55 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 足跡に隊の要と兵）：脇坂の先手（二十一人）が侍屋敷の谷戸と尾根の登り
        //   (80〜108,-14〜-42) で要の引き戻し（遅れの補い）と縦隊の詰まりで四百秒余り行き来し、段5 の本丸の坂でも尾根の下 (45,-84) に残って
        //   本人が一人で旗本に囲まれ討たれた（三本に二本）。本人から五十m より遠く、二十秒 大手の道を一点も進めない手は、本人の見えない所だけで
        //   道の次の二つ先の点へ兵を送る（着く先も本人から三十m より遠い時だけ。数・勝ち負けは変わらない）
        if (pu && (g === F.saki || g === F.mine || g === F.hasegawa)) {
          routeAt(c.x, c.z, RA);
          const pr = g._k07Adv || (g._k07Adv = { s: RA.s, t: rt.t });
          if (RA.s > pr.s + 0.5 || C.at !== pr.at) { pr.s = RA.s; pr.t = rt.t; pr.at = C.at; }
          else if (rt.t - pr.t > 20 && Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z) > 50) {
            routeAt(C.at.x, C.at.z, RB);
            const i = Math.min(Math.floor(RA.s) + 2, Math.floor(RB.s), ROUTE.length - 1);
            const [tx, tz] = ROUTE[i], [qx, qz] = ROUTE[i - 1], ql = Math.hypot(qx - tx, qz - tz) || 1, bx = (qx - tx) / ql, bz = (qz - tz) / ql;
            if (i > RA.s && Math.hypot(tx - pu.pos.x, tz - pu.pos.z) > 30) {
              let k = 0;
              // 道の上に二列の縦隊で、来た向き（一つ手前の点の側）へ並べる
              for (const u of g.units) {
                // 11/22 14:25 UTC クラウド sawayama 持ち主（act bot ★『兵が一息で飛んだ』手勢・脇坂の先手 (82,-40)→(89,-26)）：柵をよじ登る途中の兵を移すと、
                //   よじ登り（siege_ladder.js updateWallClimbs）が元の柵の上へ引き戻していた。よじ登り・塀の上の兵は移さない
                if (!u.alive || u.downed || u.dying || u.fleeing || u.gone || u.woundOut || u.climb || u.perch || Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 45) continue;
                const row = Math.min(Math.floor(k / 2) * 1.4, ql * 0.8), side = ((k % 2) - 0.5) * 1.6; k++;
                const x = tx + bx * row - bz * side, z = tz + bz * row + bx * side;
                u.pos.set(x, rt.world.heightAt(x, z), z); if (u.vel) u.vel.x = u.vel.z = 0; if (u.mesh) u.mesh.position.copy(u.pos);
                // 11/22 12:55 UTC：見えない所で意図して移した一度なので飛びと数えない（act bot ★★ 兵が一息で飛んだ 49回 (112,-7)→(114,0) の元）
                u.warpedOnce = true; u.target = null; u.moveTo = null; u._farWant = null;
              }
              if (k) { g.anchor.x = tx; g.anchor.z = tz; }
            }
            pr.s = RA.s; pr.t = rt.t;
          }
        }
        if (!g._k07Go) {
          g._k07Go = C.at; g._k07Sp = g.speed; g._k07Fire = g.fire;
          g._k07Form = g.formation; g._k07Cols = g.colW;
          g.anchor = { x: c.x, z: c.z };
        }
        // 横陣の全員を一つの整列点へ寄せず、虎口を通れる二列で進む。
        g.formation = 'column'; g.colW = 2;
        g.speed = Math.max(g._k07Sp || 0, 4.4); g.order = 'move';
        // 新手を放した時の追撃相手を残すと、移動の下知より古い敵を優先してしまう。
        g.focus = null;
        // 混成の手勢の鉄砲も、撃てる段へ着くまで銃を下げる。
        // 鉄砲隊だけを止めると、混成隊の射手が遠い敵を狙って道に残る。
        g.fire = false;
        // 虎口で縦に伸びた隊の中心は、整列済みでも要より六歩以上後ろになる。
        // 要との距離で戻すと二の丸の下で進めない。各兵の持ち場からの遅れだけを補う。
        const home = g._k07Slot || (g._k07Slot = { x: 0, z: 0 });
        let hx = 0, hz = 0;
        for (const u of g.units) {
          if (!u.alive || u.downed || u.dying || u.woundOut || u.rearWound || u.evacuatedWound || u.gone || u.fleeing) continue;
          g.slotPos(u.slot, g.initial, home); hx += home.x; hz += home.z;
        }
        const lagX = c.x - hx / n, lagZ = c.z - hz / n;
        if (Math.hypot(lagX, lagZ) > 6) { g.anchor.x += lagX; g.anchor.z += lagZ; }
        // 共通の新手の解放や号令でdestが消えても、行軍の印は残る。
        // 一度作った行き先を使い回し、毎秒の進軍で空の参照を渡さない。
        const dest = g._k07Dest || (g._k07Dest = { x: 0, z: 0 });
        wayNext(g.anchor, C.at, dest);
        g.dest = dest;
      } else if (g._k07Go) {
        g._k07Go = null; g.speed = g._k07Sp; g.fire = g._k07Fire;
        g.formation = g._k07Form; g.colW = g._k07Cols;
        g.order = C.s.kind === 'move' ? 'hold' : 'attack'; g.seekRange = 12;
        // 接敵で止まる時は今の場所から戦う。曲輪の中心へ要を飛ばさない。
        g.anchor.x = c.x; g.anchor.z = c.z;
      }
      if (guns && (arrived || foe)) {
        g.fire = true; g.order = 'hold';
        // 11/19 00:50 UTC クラウド持ち主：段4で小早川の鉄砲衆が中の段の口と道の上 (-8,-48〜-66) で構えて動かず、本人と手勢の通り道を塞いだ（act bot 足跡）。
        //   尾根道の上で構える時は道の脇の中の段 (-8±6,-60〜-52) へ寄って撃つ
        if (F.dp.i === 6 && Math.abs(c.x + 8) < 4 && c.z > -67 && c.z < -45) {
          g.anchor = { x: -8 + (c.x < -8 ? -6 : 6), z: Math.max(-58, Math.min(-52, c.z)) };
        }
      }
    }
  },

  // 落とした曲輪の櫓の上の射手は、寄せ手の鉄砲に撃たれて一人ずつ倒れる（下から斬れない射手が残り、味方の隊がその下に詰まっていた）
  clearPerch(rt, test) {
    const F = rt.flags, army = rt.army;
    let k = 0;
    for (const u of army.units) if (u.alive && u.team === 1 && u.perch && test(u.pos)) {
      rt.after(1 + k++ * 0.8, () => {
        // 終了・再開の後に、前の櫓の射手を今の軍勢の討死として数えない。
        if (rt.over || rt.flags !== F || rt.army !== army || F.ending || !u.alive || u.gone) return;
        u.hp = 0; army.kill(u, null);
      });
    }
  },

  // 門を開ける（破る・内から開ける）。開いた門は当たりを抜く
  openGate(rt, id) {
    const F = rt.flags;
    if (F.gateOpen[id]) return;
    F.gateOpen[id] = true;
    (F.gateOpenT ||= {})[id] = rt.t;
    const g = F.C.gateObjs && F.C.gateObjs[id];
    if (g) for (const d of [g, g.outer, g.inner]) if (d && d.struct) { d.open && d.open(); Object.assign(d.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
  },

  // 寄せ手が門前に四人以上で十秒詰めれば掛矢で破る。詰められなくても段の初めから wait 秒で破れる（二の5）
  gates(rt, dt) {
    const F = rt.flags, D = F.dp;
    if (!D || !D.on) return;
    for (const [id, s] of Object.entries(SHUT)) {
      if (F.gateOpen[id]) continue;
      if (D.i > s.stage) { this.openGate(rt, id); continue; }
      if (D.i < s.stage || !s.at) continue;
      F.gateT0[id] ??= rt.t;
      // 門が破れるまで、段の守りは門の内に構えて待つ（閉じた門の扉越しに槍で突き出て、門前の主人公が十秒ほどで討たれていた）
      const hold = s.stage >= 5 && D.cur && D.cur.groups;
      if (hold) for (const g of D.cur.groups) {
        g._k07Gate ??= { aggro: g.aggro, seek: g.seekRange };
        g.order = 'hold'; g.aggro = 3; g.seekRange = 3;
      }
      let n = 0;
      const gateY = rt.world.heightAt(s.at[0], s.at[1]);
      // 別の段の兵や、倒れた兵・退く兵は掛矢を打てない。門前で戦える寄せ手だけを数える。
      for (const u of rt.army.units) if (u.alive && u.team === 0 && !u.isStruct && !u.fleeing && !u.downed && !u.dying && !u.woundOut && !u.gone &&
        Math.abs(u.pos.y - gateY) < 3 && (u.pos.x - s.at[0]) ** 2 + (u.pos.z - s.at[1]) ** 2 < 100) n++;
      if (n >= 4) F.ramT[id] = (F.ramT[id] || 0) + dt;
      else F.ramT[id] = 0;   // 四人が門前を離れたら詰め直す。離れた前後の時間を足して破らない。
      if ((F.ramT[id] || 0) > 10 || rt.t - F.gateT0[id] > s.wait) {
        this.openGate(rt, id);
        // 破れた後、守りは曲輪の中の持ち場で迎え、門の口へ一度にどっと出ない（門前の主人公が十数本の槍に一度に囲まれて討たれた。助けなしの流し）。
        //   八秒は持ち場の近くだけを突き、その間に寄せ手の隊が門をくぐる
        if (hold) for (const g of D.cur.groups) if (g._k07Gate) {
          const o = g._k07Gate; g._k07Gate = null;
          g.order = 'attack'; g.aggro = o.aggro; g.anchor = { x: D.cur.at.x, z: D.cur.at.z }; g.seekRange = 9;
          rt.after(8, () => { if (g.count) g.seekRange = o.seek; });
        }
        // 破れた後も三つの隊を曲輪の同じ一点へ寄せない（脇坂の先手が手勢に重なった）。左右へ五歩ずつ散らす
        if (hold) [F.mine, F.saki, F.hasegawa].forEach((g, j) => {
          if (!g || !g.count || g.routed) return;
          const dx = D.cur.at.x - s.at[0], dz = D.cur.at.z - s.at[1], dl = Math.hypot(dx, dz) || 1, side = [0, 5, -5][j];
          g.order = 'attack'; g.anchor = { x: D.cur.at.x - dz / dl * side, z: D.cur.at.z + dx / dl * side }; g.seekRange = Math.max(g.seekRange || 0, 30);
        });
        // 11/18 09:10 UTC クラウド持ち主：段4の二の丸の門（幅四・四歩）が破れると、寄せ手の全部が一つの口へ流れ込み、口の七歩内に味方二十〜三十人、
        //   本人の二歩内に九〜十二人詰まって本人が曲輪に入れず、宇多の段の百秒余り討ち取り0（act bot 足跡）。手勢と先手だけを先に通し、
        //   ほかの寄せ手は門の外の中の段で十二秒待たせる
        if (hold && s.stage === 6) for (const g of rt.army.groups) {
          if (g.team !== 0 || !g.count || g === F.mine || g === F.saki || g === rt.player.u?.group || g.routed) continue;
          const c = g.center(); if (Math.hypot(c.x - s.at[0], c.z - s.at[1]) > 20) continue;
          g.order = 'hold'; g.anchor = { x: s.at[0], z: s.at[1] - 10 };
          rt.after(12, () => { if (g.count && !g.routed && D.cur) { g.order = 'attack'; g.anchor = { x: D.cur.at.x, z: D.cur.at.z }; } });
        }
        sfx('gateBreakWood', 0.8);
        rt.say(s.say[0], s.say[1], 3);
      }
    }
  },

  // 十八日の夜明け
  // 11/18 ⑥ 写真：夜の三の丸の尾根で、白く寄せた細い草の株が自ら光り（grassLift）、暗い斜面に骨のように浮いた。
  //   夜の間だけ草の株の色を落として光りを消し、夜明けに戻す（材質は共用。次の戦の初めに timeslipField が数値を入れ直す）
  nightGrass(rt, on) {
    rt.scene.traverse((o) => {
      const m = o.isInstancedMesh && o.material;
      if (!m || !m.customProgramCacheKey || m.customProgramCacheKey() !== 'tsGrassBlade4') return;
      const d = m.userData.k07Day || (m.userData.k07Day = { c: m.color.getHex(), e: m.emissive.getHex() });
      if (on) { m.color.setHex(d.c).multiplyScalar(0.5); m.emissive.setHex(0); }
      else { m.color.setHex(d.c); m.emissive.setHex(d.e); delete m.userData.k07Day; }
    });
  },

  dawn(rt) {
    const F = rt.flags;
    if (F.day18) return;
    F.day18 = true; F.dusk = false; F.night = false;
    rt.world.setTime('morning');
    this.nightGrass(rt, false);
    // 11/18 クラウド k365-cloud-27（zensen_1118 ③塊と幟 ✕）：二の丸の段を攻める間、本人の回りの味方が十数人しかいなかった
    //   （200〜330秒の流しで本人の40m内の味方 11〜15人、味方の全部は約280人＝小早川の二陣・後備えが大手の外の田に残っていた）。
    //   夜のうちに三の丸へ上がった体で、小早川の二陣を三の丸の内に並べ、二の丸の段を見上げて待たせる（本物の兵・上限の内。新しく作らない）
    const ni = { x: NI3.x, z: NI3.z };
    const san = PLAN.kuruwa.find((k) => k.id === 'san');
    // 11/17 クラウド持ち主：並べた列が三の丸の東の口 (18,-106) から北の口 (-8,-96) への道を塞ぎ、本人が東の口 (20,-104) で詰まって
    //   二の丸の下の段へ入れず、日暮れの負けになった（act bot 1065秒・段3/5）。列は曲輪の南の奥（z -117〜-110）に詰め、道から四歩離す。
    //   夜の間に上がった体なので、一度だけの移しは飛びと数えない（warpedOnce）
    const inSan = (x, z) => x > -11 && x < 12 && z > -118 && z <= -110;
    let k = 0;
    for (const g of rt.army.groups || []) {
      if (!g || g.team !== 0 || !/^小早川の二陣/.test(g.name || '')) continue;
      const live = (g.units || []).filter((u) => u.alive && !u.gone);
      if (!live.length || !san) continue;
      let sx = 0, sz = 0, n = 0;
      for (const u of live) {
        const x = -10 + (k % 13) * 1.65, z = -117 + Math.floor(k / 13) * 1.6;
        if (!inSan(x, z)) break;
        k++; n++; sx += x; sz += z;
        u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt ? rt.world.heightAt(x, z) : u.pos.y;
        u.target = null; u.moveTo = null; u.aiT = 0; u.warpedOnce = true;
        if (u.mesh) u.mesh.position.copy(u.pos);
      }
      if (!n) continue;
      const ax = sx / n, az = sz / n;
      g.anchor = { x: ax, z: az }; g.order = 'hold'; g.facing = Math.atan2(ni.x - ax, ni.z - az); g.seekRange = 10; g.aggro = 6;
    }
  },

  // 南の尾根：太鼓丸（篝尾口）は山田上野之助・隼人の父子が守った（『佐和山落城記』）。関ヶ原で寝返った小川祐忠（朽木・赤座と共に加わった）の手が太鼓丸へ取り付く。見せかけでなく本物の兵どうしが斬り合う（谷戸の向こうに見える）
  south(rt) {
    const F = rt.flags;
    if (F.south) return;
    F.south = allyGroup(rt, { faction: 'oda', name: '小川祐忠の手', anchor: { x: 96, z: 44 }, facing: -Math.PI / 2, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 70, fixed: true },
      dress([{ type: 'busho', n: 1, o: { name: '小川祐忠', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }], TANAKA));
    F.south.anchor = { x: TAIKO.x + 22, z: TAIKO.z };
    F.southFoe = enemyGroup(rt, { fixed: true, faction: 'ishida', name: '山田上野之助の手', anchor: { x: TAIKO.x + 18, z: TAIKO.z + 4 }, facing: Math.PI / 2, order: 'hold', aggro: 12, width: 10, morale: 95 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], ISHIDA));
    F.southFoe.dmgMult = 0.3; F.south.dmgMult = 0.35;
  },

  // 本丸の段の終わり：天守に火が回る（『石田軍記』『卜斎記』の炎上の説・落城）
  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    // 旗本が尽き、一族は天守へ入る（床几の三人は火と煙が上がってから下げる）。天守の層に火が回る
    const army = rt.army, family = F.tsugu;
    rt.after(3.5, () => {
      if (rt.over || rt.flags !== F || rt.army !== army || !F.burned || F.tsugu !== family) return;
      for (const u of (family?.units || []).slice()) if (u.alive) army.despawn(u);
    });
    const T = { x: HON.x - 4, z: HON.z + 2 };
    // 炎は天守の壁の外の面と屋根の上に出す（真ん中に置くと壁の内に隠れて、外から火が見えなかった）。黒煙の柱を頂から
    const W = rt.world;
    if (W.addFire) {
      for (const [dx, dz, h, s] of [[6.2, 0, 5, 3.2], [0, -5.6, 9, 3], [-6.2, 1, 12.5, 2.8], [3, 5.6, 15.5, 2.6], [0, 0, 20.5, 3.4]]) W.addFire(T.x + dx, T.z + dz, { size: s, h, blackSmoke: true });
      for (const [x, z, s] of [[HON.x + 6, HON.z - 8, 2], [NI1.x, NI1.z, 1.6], [SAN.x, SAN.z, 1.6]]) W.addFire(x, z, { size: s, h: 2 });
    }
    if (W.addSmokeColumn) W.addSmokeColumn(T.x, W.heightAt(T.x, T.z) + 24, T.z, { size: 4, black: true });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    sfx('horagai', 0.9);
    rt.player.u.invuln = true;
    // 締め（十九秒）：視点は主人公に任せ、落城の字と台詞を見せてから結果へ。
    //   共通の「合戦に勝利」の札は finish で出て、落城の字の上に重なって隠していたので、finish は字と台詞の後に呼ぶ
    // 再開前の落城が、新しい戦の台詞・戦功・結果を上書きしない。
    const ending = F.endReservation = {}, player = rt.player.u;
    const current = () => !rt.over && rt.flags === F && F.ending && F.endReservation === ending &&
      rt.player.u === player && player.alive && !player.downed && !player.dying;
    const say = (t, f) => rt.after(t, () => { if (current()) f(); });
    say(0.3, () => { if (!F.touun) { F.touun = true; rt.say('土田東雲斎', '蔵の金銀を撒け。殿の御最期の時を稼ぐのじゃ', 3.4); } });
    say(3.9, () => rt.say(nm(rt), '天守に火が！　正継殿・正澄殿・朝成殿は、天守で腹を召されたと', 3.8));
    say(4.2, () => rt.banner('佐和山城、落城', '慶長五年九月十八日　天守に火が回る'));
    say(8.2, () => rt.say('小早川秀秋', '……治部は城に戻れなんだ。主のおらぬ城を、我らは落としたのよ', 4));
    say(12.4, () => rt.banner('正継・正澄・朝成、天守に果つ', '二日の戦で佐和山城は落ちた'));
    // 11/19 クラウド29（司令塔の決め：城攻めの終わりの絵）：落城の後、味方の組が旗の下に集まり三度の勝鬨（army.celebrate＝本物の兵・字は出さない）（天守の自害の知らせの後に）
    say(14, () => rt.army.celebrate(rt.player.u.team));
    // 確かめの紙 Y6 の伝えを、秀秋の言葉の後、結果へ移る前に届ける。
    say(12.4, () => rt.say('小早川の侍', '女たちは、本丸の下の谷へ身を投げたと……', 2.8));
    // K306 の続き（11/18 クラウド k365-cloud-42）：乗り込んだ者は、城の中が荒壁のままで飾りも無いのに驚いた（『常山紀談』）
    say(15.4, () => rt.say('小早川の足軽', '城の中は荒壁ばかり、座敷に飾りの一つも無い。治部は己には何も貯めなんだのか', 3.2));
    // 11/8：寄せ手の大軍が城へ押し出す。「三成はおらぬ・逃げたか」は共通の落城の流れ（castle_fall_data.js）が finish の後に出す
    say(9, () => hoi.advance(rt));
    // 主の任務の済みも締めの直前に（共通の goalsDoneTick は主の任務が済んで二秒半で勝ちに締め、締めの十五秒を切っていた）
    say(18.7, () => {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '佐和山城を落とした', pts: 40 }; }, '佐和山城が落ちた');
      rt.finish({ scriptedEnd: true }, 4);
    });
  },
  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が暮れ切った', '城はまだ落ちぬ');
    rt.say('小早川秀秋', '日が暮れたか。今日のうちに落とせなんだ', 4);
    rt.finish({ failureReason: '日が暮れるまでに本丸を落とせなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    hata.tick(rt, dt);
    if (F.ending) return;
    // 11/21 cloud-21（司令塔・徳川編の章の通しで234秒に倒れた：三の丸の守り・侍屋敷の伏兵の足軽に195の傷）：敵は弱めず、
    //   深手で囲まれたら近くの味方の組が本人の脇へ寄る（共通の sideGuard）
    sideGuard(rt, { shot: true, key: '_swSG' });
    // 11/21 クラウド k07（K564 重くない）：携帯の見なしで生きた兵が 280〜331（上限 250）。道の始めの行軍の列（飾りの味方十八人・march_open.js）が
    //   段の掛け替えで「攻め」にされ、休ませ（idle_park）にも入らず、戦の終わりまで大手の外に立ち続けていた。
    //   大手の段（段0）が済んだら、列の誰もが本人の七十m の外なら外す（関ヶ原・天王寺岡山・真田丸と同じ手。数の札は despawn で足し戻る）
    { const mg = F.marchG, MP = rt.player?.u;
      if (MEM_TIGHT && mg && !F._mgOff && (F.dp?.i || 0) >= 1 && MP?.alive && (F._mgT = (F._mgT || 0) - dt) <= 0) {
        F._mgT = 1;
        const us = (mg.units || []).filter((u) => u.alive && !u.gone);
        if (!us.length) F._mgOff = true;
        else if (!us.some((u) => Math.hypot(u.pos.x - MP.pos.x, u.pos.z - MP.pos.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
      } }
    // 11/28 16:20 UTC クラウド佐和山の持ち主（K564 落ちない）：記憶4GB の携帯（MEM_BUDGET.real 205）の描かずの数え（tools/_k07_countprobe.mjs PHONE=1 QS=&mem=4）で
    //   大手の段（20〜90秒）に 258〜276（越え53〜71）。越えた分は持ち場で動かず待つ味方＝搦手の田中の手（本人から二百十m・二十四人）・
    //   本人の後ろ（カメラの後ろ六十〜七十m）の小早川の本陣・朽木・赤座の陣・行軍の列。紀州（t04b_ota/memtrim.js）と同じ手で、
    //   三秒ごとに、本人とカメラから百m 外（カメラの後ろは四十m 外）・hold・斬り合っていない味方の組の名の無い徒の兵を遠い組から外す（一組六人・田中の手は八人・二百五十m 外は四人まで残す）。
    //   敵（段の守り・後で掛かる新手）・名のある将と供回り・旗持ち・馬・本人の組・前で斬り合う組は減らさない。記憶の多い端末とパソコンは今まで通り
    { const MP = rt.player?.u;
      if (isTouch && MEM_BUDGET.real && MP?.alive && (F._swCapT = (F._swCapT || 0) - dt) <= 0) {
        F._swCapT = 3;
        let over = -MEM_BUDGET.real; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
        if (over > 0) {
          const me = MP.pos, cam = rt.camera?.position;
          const farR = (p, R) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
          const fw = cam && rt.camera.getWorldDirection ? rt.camera.getWorldDirection(F._swFw || (F._swFw = cam.clone())) : null;
          const behind = (p) => fw && cam && ((p.x - cam.x) * fw.x + (p.z - cam.z) * fw.z) < -0.3 * Math.hypot(p.x - cam.x, p.z - cam.z);
          const hide = (p) => farR(p, 100) || (behind(p) && farR(p, 40));
          const hard = (u) => u.name || u.isPlayer || u.isSub || u.invuln || u.mustLive || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho' || u.officerGuard?.alive;
          const gs = [];
          for (const g of rt.army.groups) {
            if (g.team !== 0 || g.isPlayerSquad || g.routed || g.order !== 'hold' || !g.units) continue;
            const us = g.units.filter((u) => u.alive && !u.gone);
            const lo = g === F.tanaka ? 8 : us.every((u) => farR(u.pos, 250)) ? 4 : 6;
            if (us.length <= lo || us.some((u) => u.atk || u.fleeing || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30) || !hide(u.pos))) continue;
            const c = g.center ? g.center() : us[0].pos;
            gs.push({ us, lo, d: Math.hypot(c.x - me.x, c.z - me.z) });
          }
          gs.sort((a, b) => b.d - a.d);
          for (const { us, lo } of gs) {
            if (over <= 0) break;
            const cut = us.filter((u) => !hard(u)).reverse();
            for (let k = 0; k < cut.length && over > 0 && us.length - k > lo; k++) { try { rt.army.despawn(cut[k]); over--; } catch (e) { /* そのまま */ } }
          }
        }
      } }
    depthTick(rt, dt);
    tickTabas(rt, dt);
    if (F.rocks) F.rocks.tick(dt);
    const D = F.dp;
    this.gates(rt, dt);
    if (D && D.on && D.i >= 7) { this.tanaka(rt); this.tanakaIn(rt); }
    this.hurry(rt);
    // 11/18 クラウド持ち主（act bot 507秒 達成・本人の討ち取り6／味方177「斬り合う相手が少なくて退屈」）：
    //   斬り合いの段で本人から二十五歩より遠い味方の隊は刃を半分に（遠くで先に討ち切らず、本人の行く先に相手を残す）。本人のそばの隊・敵の数と強さは同じ
    if (D && D.on && D.cur?.s?.kind === 'fight' && (F.farT = (F.farT || 0) - dt) <= 0) {
      F.farT = 1;
      const P = rt.player.u.pos, c = F._farC || (F._farC = {});
      for (const g of rt.army.groups) {
        if (g.team !== 0 || !g.count || g.routed || g === F.south || g === F.tanaka) continue;
        g._k07Dmg ??= g.dmgMult ?? 1;
        g.center(c);
        // 11/18 14:55 UTC クラウド持ち主：act bot で段2（三の丸）・段3（二の丸の下の段）の本人の討ち取りが0（味方132）＝
        //   本人のそばの手勢と先手（刃1.5）が先に討ち切る。斬り合いの段の間だけ手勢と先手の刃を六割に（曲輪の崩れの決まりと段の保険は同じ）
        // 11/18 16:15 UTC クラウド持ち主：段1（大手）も act bot の本人の討ち取りが0〜1（門の外で四十秒待ち、入ると脇坂・小早川の組が先に討ち切る）。段1だけは本人のそばの寄せ手の刃をみな六割に
        // 11/19 05:00 UTC クラウド持ち主：段1は六割でも本人が大手の門の外 (119〜143,0) で組と脇坂の先手に挟まれ、九十秒で討ち取り0〜2・味方が二十人を討つ（act bot 足跡 五本）
        //   → 段1だけ本人のそばの寄せ手の刃を四割に（段1は新手の継ぎ足しが無く、長さは百五十秒の上限で収まる）
        // 11/28 12:50 UTC クラウド佐和山の持ち主（K582・ledger 4526「段3・4で敵の多くを味方が先に討つ」）：段3（D.i 5）は六割でも本人の討ち取り0、
        //   段4（D.i 6）はそばの隊の刃が既定のままだった。段3・段4は段1と同じく本人のそばの寄せ手の刃を四割に（遠い隊の半分・敵の数は同じ）
        const near = (D.i === 0 || D.i === 5 || D.i === 6) ? 0.4 : (g === F.mine || g === F.saki || D.i === 3) ? 0.6 : 1;   // 11/18 18:20 UTC cloud-k07：段2・段3も本人の討ち取り0〜1（act bot 九回）＝そばの長谷川・小早川の二陣が先に討つ。段1と同じく本人のそばの寄せ手をみな六割に
        g.dmgMult = Math.hypot(c.x - P.x, c.z - P.z) > 25 ? g._k07Dmg * 0.5 : g._k07Dmg * near;
      }
      // 11/22 11:10 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 六本のうち四本が段5で倒れた）：倒した傷の主は名の無い石田の四人の組
      //   （taisho_guard.js が石田の名のある将に付ける旗本の輪）で、一太刀31＝正継の旗本（段の隊・刃0.3）の倍。輪は将の組の倍率を写すが、
      //   段の隊の刃（dctx の0.3）には揃わず、本丸の門の坂で本人を七秒で討った。石田の将の輪の刃を段の隊と同じ0.3までに抑える（数と動きは同じ）
      for (const g of rt.army.groups) if (g.team === 1 && g.taishoGuard && !(g.dmgMult <= 0.3)) g.dmgMult = 0.3;
      // 11/22 15:10 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 三本に二本 段5で倒れた・二秒の足跡）：倒れる前の十秒に
      //   本人の二十五m 内へ「石田一族」（床几の三人・討てない invuln）が attack で出て来ていた（天守の前から三十m 余り下の門の坂まで）。
      //   討てない将が打って出て本人を斬ると勝ち目が無い。床几の三人は天守に入るまで天守の前に座ったまま（hold・刃0）に戻す
      const T = F.tsugu;
      if (T && T.count && !F.burned) {
        if (T.order !== 'hold' || T.focus) { T.order = 'hold'; T.focus = null; T.dest = null; T.stay = true; T.seekRange = 1; T.aggro = 0; T.anchor = { x: HON_YARD.x, z: HON.z + 6 }; }
        T.dmgMult = 0;
      }
    }
    // 11/19 14:20 UTC k365-cloud-42（中学生 bot 足跡）：本人が大手から尾根を登る間（本人が三の丸の九十歩手前）に味方が三の丸を落とし切り、
    //   段2の本人の討ち取り0・百七十〜三百秒の百三十秒は本人の二十五歩内に敵が一人もいなかった。
    //   三の丸・二の丸の下の段の隊は、本人が段の場の四十歩内へ来るまで受けを三倍・崩れない（本人が着くまで曲輪が残る。三倍だけでは士気で崩れて逃げ、段2 討0 の回が残った）。着いたら元へ。敵の刃と数は同じ
    if (D && D.on && (F.k07DefT = (F.k07DefT || 0) - dt) <= 0) {
      F.k07DefT = 0.5;
      const at = D.cur?.at, P = rt.player.u?.pos;
      const far = (D.i === 3 || D.i === 5) && at && P && Math.hypot(P.x - at.x, P.z - at.z) > 40;
      const mine = D.cur?.groups || [];
      for (const g of F._k07DefG || []) { if (g._k07Def != null) { g.defMult = g._k07Def; g.noRout = g._k07NoRout; g._k07Def = null; } }
      F._k07DefG = [];
      // 11/21 08:20 UTC クラウドか（Opus・K582 act bot 足跡 POSLOG）：段2で三の丸の守りが曲輪を打って出て尾根 (52〜55,-74〜-82) で味方と斬り合う間、
      //   本人は二十〜三十歩下 (73〜77,-52〜-61) にいても段の場 (4,-105) から七十歩離れているので守りが三倍・崩れないまま二百六十秒（段2 討6→19・打ち切り 1075〜1086秒・二本とも任務失敗）。
      //   段の場から遠くても、その組の真ん中が本人の四十歩内にいれば三倍にしない（本人のそばで斬り合っている組は崩れてよい）
      const gc = F._k07DefC || (F._k07DefC = {});
      if (far) for (const g of mine) if (g.team === 1 && g.count && !g.routed && (g.center(gc), Math.hypot(gc.x - P.x, gc.z - P.z) > 40)) {
        if (g._k07Def == null) { g._k07Def = g.defMult || 1; g.defMult = g._k07Def * 3; g._k07NoRout = g.noRout; g.noRout = true; }
        F._k07DefG.push(g);
      }
    }
    this.sumiTick(rt);
    this.udaTick(rt);
    // 11/19 04:15 UTC クラウド持ち主：act bot 足跡（POSLOG 三本）で段4（宇多）は始め気力100でも、二の丸の中の段への急な登りと斬り合いで
    //   六十秒ほどで二十〜三十に尽き、本人が「退」で口の下 (-8,-56〜-62) へ下がり、宇多の隊（-8,-35）の十〜十六歩手前を行き来して討ち取り0〜2。
    //   段4の間に一度だけ、気力が三割半を切り八歩内に敵がいなければ息を整えた事にして気力を満たす（樫井・今福と同じ形。敵の数と強さは同じ）
    // 11/19 04:15 UTC：一度だけでは489秒の回に満たした二十秒後また尽きて段4 討0 → 二十五秒を空けて二度まで
    // 11/19 04:20 UTC：段3（二の丸の下の段）も尾根の登りで気力が四〜五割に落ちて段の討ち取りが0〜1の回 → 三の丸・二の丸の下の段・宇多の段のそれぞれで二度まで
    if (D && D.on && F.k07BreathI !== D.i) { F.k07BreathI = D.i; F.k07Breath = 0; }
    if (D && D.on && (D.i === 3 || D.i === 5 || D.i === 6) && (F.k07Breath || 0) < 2 && rt.t > (F.k07BreathT || 0) && rt.player?.maxSta && rt.player.sta < rt.player.maxSta * 0.35) {
      const pu = rt.player.u, near = pu && rt.army.units.some((u) => u.alive && u.team === 1 && !u.fleeing && Math.abs(u.pos.x - pu.pos.x) < 8 && Math.abs(u.pos.z - pu.pos.z) < 8);
      if (pu && !near) { F.k07Breath = (F.k07Breath || 0) + 1; F.k07BreathT = rt.t + 25; rt.player.sta = rt.player.maxSta; }
    }
    huntPlayer(rt, dt);
    // 11/18 クラウド持ち主：三の丸・二の丸から崩れて退いた兵（二十余り）が、閉じた本丸の門の前（二の丸の上の段の奥）に溜まり、
    //   宇多の段と本丸の段で本人の二十歩内に「崩れ」が二十人余り立ったまま残った（描かずの通し 380〜420秒）。
    //   退路の終わり（本丸の門の前〜本丸の広場）まで来た崩れの兵は、門の潜りから本丸の内へ逃げ込んだとして退場させる。今の段の隊と名のある将は外す。本人の八歩内では消さない
    if ((F._k07InT = (F._k07InT || 0) - dt) <= 0 && D && D.on) {
      F._k07InT = 1;
      const P = rt.player.u?.pos, cur = new Set(D.cur?.groups || []);
      // 11/18 07:40 UTC クラウド持ち主（act bot「9分で6人」）：描かずの通しで、三の丸の崩れが閉じた二の丸の下の段の門 (-8,-87) の前に四十三人、
      //   二の丸の下の段の崩れが閉じた二の丸の門 (-8,-43) の前に七十人溜まり、本人の二十歩内が逃げる兵で埋まって味方が門をくぐれず、
      //   本人は宇多の隊に一人で当たって命が半分になり、六十秒退いて討ち取りが4のまま。閉じた門の九歩内まで来た崩れの兵も、潜りから内へ逃げ込んだとして退場
      const shut = Object.entries(SHUT).filter(([k, s]) => s.at && !F.gateOpen?.[k]).map(([, s]) => s.at);
      for (const g of rt.army.groups) {
        if (g.team !== 1 || !g.routed || !g.count || cur.has(g) || g === F.tsugu) continue;
        for (const u of g.units.slice()) if (u.alive && !u.name && ((u.pos.z > -31 && Math.abs(u.pos.x + 6) < 14) || shut.some(([x, z]) => Math.hypot(u.pos.x - x, u.pos.z - z) < 9))
          && !(P && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 8)) rt.army.despawn(u);
      }
    }
    parkFarGuards(rt);
    // 11/21 20:45 UTC クラウド持ち主（K582 携帯の見なし act bot 481秒 ★★）：大手の外の田の塊（fujin_layout の小早川の二陣 二の手・十一人）が
    //   (164,1) で move のまま一点に重なって止まった（行き先35m・重なり9組）。move のまま十秒一・五 m も動かない小早川の二陣の手は、
    //   その場を持ち場にして構えさせる（槍の並びで散る。有岡の遠くの備と同じ手。数と強さは同じ）
    if ((F._swMvT = (F._swMvT || 0) - dt) <= 0) {
      F._swMvT = 1;
      for (const g of rt.army.groups) {
        // 11/21 21:15 UTC：井伊の後備え 二（七人）も (166,1) で同じく重なった（act bot 286秒）→ 大手の外の田（x 140 より東）の味方の塊はみな同じ手
        // 11/21 22:20 UTC：井伊の後備え 二（六人）が持ち場の無いまま（行き先無）move で (166,1) に重なった（act bot 376秒）→ 持ち場でなく塊の真ん中が x 140 より東かで見る
        // 11/22 13:10 UTC：行軍の列（十八人）も大手の段が済んだ後は同じ手（act bot 156秒 ★★ (141,0) で attack のまま重なり10組）
        // 11/28 07:55 UTC クラウド佐和山の持ち主（act bot --mobile 126秒 ★★ 行軍の列 十八人が (136,0) で attack・行き先無のまま重なり10組）：
        //   大手の段の間は列を外していたので、田の外（x 140 より西）で止まった列はどちらの手にも掛からなかった。
        //   六十秒より後は大手の段の間も、止まった列を下の『構えさせる』手に入れる（歩いている間・始めの行軍は十秒一・五m 動くので掛からない）
        //   大手の外の田（x 140 より東）の手は大手の段の間は掛けない（前の通り）
        if (!g || g.team !== 0 || !g.count) continue;
        if (g === F.marchG && !((F.dp?.i || 0) >= 1) && (rt.t < 60 || g.center().x > 140)) continue;
        const gc = g.center();
        // 11/22 14:05 UTC クラウド sawayama 持ち主（K582 携帯 act bot 301秒 ★★）：小早川の後備え 二の手（六人）が大手の内 (108,3) で
        //   attack・行き先無のまま一点に重なった（重なり6組・考えの間引き5・散らし無）。田の外でも、二十m 内に生きた敵のいない attack の手が
        //   十秒一・五m も動かなければ、その場を持ち場にして構えさせる（本人の組・脇坂の先手・長谷川の手は外す。数と強さは同じ）
        // 11/22 15:15 UTC クラウド sawayama 持ち主（携帯 act bot 221秒 ★★）：小早川の後備え 二の手（七人）が尾根の下 (81,-13) で move・行き先無のまま重なった（重なり5組）。move で行き先の無い手も同じく構えさせる
        if ((g.order === 'attack' || g.order === 'move') && !g.dest && gc.x <= 140 && g.count >= 5 && !g.isPlayerSquad && g !== F.mine && g !== F.saki && g !== F.hasegawa && !g.routed) {
          const s = g._swAtSt;
          if (!s || Math.hypot(gc.x - s.x, gc.z - s.z) > 1.5) { g._swAtSt = { x: gc.x, z: gc.z, t: rt.t }; continue; }
          if (rt.t - s.t < 10) continue;
          // 11/28 10:55 UTC クラウド佐和山の持ち主（act bot --mobile 202秒 ★★ 行軍の列 十六人が大手の土橋 (132,0) で attack のまま重なり10組）：
          //   閉じた大手門の向こうの守りと櫓の上の射手（届かない相手）を『近くの敵』と数えて構えさせなかった。櫓の上と塀の向こうの敵は数えない
          if (rt.army.units.some((u) => u.alive && !u.gone && u.team === 1 && !u.isStruct && !u.perch && Math.abs(u.pos.x - gc.x) < 20 && Math.abs(u.pos.z - gc.z) < 20
            && !rt.army.wallBetween(gc, 0, u.pos, false))) { s.t = rt.t; continue; }
          g._swAtSt = null;
          g.order = 'hold'; g.anchor = { x: gc.x, z: gc.z }; g.dest = null; g.onArrive = null; g.formation = 'yari';
          continue;
        }
        g._swAtSt = null;
        if (!(/^小早川の二陣/.test(g.name || '') || (g.anchor && g.anchor.x > 140) || gc.x > 140)) continue;
        // 11/21 21:25 UTC：井伊の後備え 一（七人）は attack のまま (167,0) で重なった（act bot 346秒）。田の塊は敵のいない外の田なので attack も同じ
        const east = (g.anchor && g.anchor.x > 140) || gc.x > 140;
        // 11/22 04:45 UTC クラウド持ち主（K582 act bot 461秒 ★★ 小早川の二陣 二の手 (165,1)）：hold にした後も、本人が城の内（百五十m 超え先）にいて
        //   考えを間引かれた田の塊は重なったまま散らなかった。本人の八十m の外（見えない遠さ）で半分の兵が0.5m 内に重なる東の塊は、
        //   その場で西を向いた五列の升目に並べ直す（一度の移しは飛びと数えない。数と強さは同じ）
        // 11/28 09:05 UTC クラウド佐和山の持ち主（K582 act bot --mobile 61秒 ★★ 小早川の旗本 後ろ南 一（七人）が (179,37) で hold のまま重なり4組）：
        //   本人が大手の内（七十八m）にいて八十m の内だったので散らさなかった。升目の並べ直しは一人三・五m 内の小さな動きなので、四十五m の外なら散らす
        //   11/28 09:00 UTC 同（act bot --mobile 60秒 ★★ 小早川の二陣 二の手（七人）が (175,0) で hold のまま重なり7組・本人は (133〜140,0) で三十五〜四十二m）：
        //   本人は西の大手門を向いて東の田は背の後ろ。四十五m 内でも、塊の兵がみな画面の外（後ろ）なら散らす
        //   升目の並べ直しは塊の真ん中が田（x 140 より東）にある時だけ。持ち場が田でも大手の内に入った塊（松野の備）を並べ直すと、
        //   大手の東の塀の内の隅 (115,-26) から十二m 飛んで塀に掛かった（act bot 731秒・足跡の仕掛け）
        const al0 = gc.x > 140 && rt.player.u ? g.units.filter((u) => u.alive && !u.gone && !u.isPlayer && !u.mounted) : null;
        if (al0 && (Math.hypot(gc.x - rt.player.u.pos.x, gc.z - rt.player.u.pos.z) > 45 || (al0.length && al0.every((u) => u.offscreen)))) {
          const al = al0;
          let close = 0;
          for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) if ((al[i].pos.x - al[j].pos.x) ** 2 + (al[i].pos.z - al[j].pos.z) ** 2 < 0.25) close++;
          if (al.length >= 5 && close > al.length / 2) {
            al.forEach((u, i) => {
              const x = gc.x + Math.floor(i / 5) * 1.6, z = gc.z + ((i % 5) - 2) * 1.7;
              u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt ? rt.world.heightAt(x, z) : u.pos.y;
              u.target = null; u.moveTo = null; u.aiT = 0; u.warpedOnce = true; u._farWant = null;
              if (u.mesh) u.mesh.position.copy(u.pos);
            });
            g.order = 'hold'; g.anchor = { x: gc.x, z: gc.z }; g.dest = null; g.onArrive = null; g.facing = -Math.PI / 2; g._swMvSt = null;
            continue;
          }
        }
        if (!(g.order === 'move' || (east && g.order === 'attack')) || g.routed || !g.count) { g._swMvSt = null; continue; }
        const c = g.center(), s = g._swMvSt;
        if (g.order === 'attack' && c.x < 140) { g._swMvSt = null; continue; }   // 大手の門で斬り合う組は外す
        if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._swMvSt = { x: c.x, z: c.z, t: rt.t }; continue; }
        if (rt.t - s.t < 10) continue;
        g._swMvSt = null;
        g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.onArrive = null; g.formation = 'yari';
      }
    }
    // 本丸の旗本は本丸の天守の前の広場を守り、本丸の門の外（二の丸）へ打って出ない。前は 'attack' で四十歩下の二の丸まで出て、
    //   主人公が本丸に一度も入らないまま⑤が済んだ（11/6 描いて遊んだ二回とも）
    //   二の丸の下・上の守りも、開門後は段の内に留める。三の丸の出口へ突進して門前の寄せ手を囲まない。
    //   宇多の隊も同じく、二の丸の門が破れた後は二の丸の上の段に留まる（本丸の西の口から本丸の内へ下がり、④が二百秒を超えた・11/6 流し）
    // 11/18 クラウド kaito2 K365：二の丸の門が破れても本人が門の外（-8,-55）に留まると、宇多の隊は上の段の持ち場で待ち続け、
    //   874×402 の写真で「④ 17/17」のまま百秒余り何も起きず、act bot も一度④で四百八十秒止まった。門が破れて四十五秒、本人が曲輪に入らなければ、
    //   宇多の隊は門の内の口（-8,-40）まで出て斬り結ぶ
    if (D && D.on && D.i === 6 && F.gateOpen.ni1_n) F.ni1OpenT ??= rt.t;
    // 11/18 23:05 UTC クラウド持ち主：act bot 足跡（POSLOG 八回）で、門が破れてから本人が中の段（-8,-50〜-65）と門の脇に四十〜九十秒立ち、
    //   宇多の隊は門の内で待つまま、段4の本人の討ち取り0〜1（3回に2回）。四十五秒→二十秒で門の内の口まで出す
    const udaLure = !!(D && D.on && D.i === 6 && F.ni1OpenT != null && rt.t - F.ni1OpenT > 20 && !D.cur?.k07Inside);
    const holdAt = D && D.on && D.cur?.groups ? (D.i === 8 ? HON_YARD : D.i === 5 && F.gateOpen.ni3_n ? NI3 : D.i === 6 && F.gateOpen.ni1_n ? (udaLure ? NI1_MOUTH : NI1) : null) : null;
    // 共通の段の誘導が遠ざかった隊を攻めへ戻しても、守備の命令を保つ。
    // 制圧後の退く下知は戻さない。本丸は乱入の台詞を待つため、制圧した後もこの段で更新が続く。
    if (holdAt) for (const g of D.cur.groups) if (g.count && !g._udaLost && !g._spOut && !g.routed && g.order !== 'retreat' && g.order !== 'flee') {
      if (!g._k07Hold) { g._k07Hold = true; g.anchor = { x: holdAt.x, z: holdAt.z }; }
      g.order = 'hold'; g.anchor.x = holdAt.x; g.anchor.z = holdAt.z; g.aggro = D.i === 5 ? 5 : udaLure ? 16 : 9; g.seekRange = g.aggro;
    }
    // 櫓門の上の射手（中の窓の場所が無く、屋根の瓦の上に立っていた）は置かない。横矢は左右の隅櫓の窓から（十一の2・十一の3）
    if (!F.gatePerchOff && rt.perch?.started) {
      F.gatePerchOff = true;
      for (const p of rt.perch.posts) if (p.kind === 'gate' && !(p.spots && p.spots.length) && p.group) for (const u of p.group.units.slice()) if (u.alive) rt.army.despawn(u);
    }
    // 城方の数の棒：城方の本物の兵の延べ（討った数＋今いる数）から、二千八百の減り方を決める（前は二十五人ずつ引き、③の初めに 0 になった）
    if ((F.eT || 0) <= rt.t) { F.eT = rt.t + 1; let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.isStruct) n++; F.eMax = Math.max(F.eMax || 0, (F.ek || 0) + n); }
    // 十七日の夜：長谷川の手引きで三の丸を夜のうちに攻める（夜の戦は夜に）
    // 11/18 ⑥ 写真：「日が暮れた。攻めは止みじゃ」の後も三の丸の尾根の登り（120秒）が真昼のままだった。夜への四十五秒の移ろいを日暮れの段から始める
    if (D && D.on && D.i >= 1 && D.i < 4 && !F.night) { F.night = true; rt.world.setTime('night'); this.nightGrass(rt, true); }
    // 11/26 クラウドす（K674）：本丸が落ちた後の続きの段（tokugawa_more2.js k07_sawayama）の間は日暮れの負けにしない（打ち切りは pacingCap）
    if (F.k652m) { /* 続きの段 */ }
    else if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('小早川の侍', '西の空が赤い！　日が暮れる、急げ', 3.5); }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    // 人数の棒と同じく、門・塀などの破壊は兵の損失に含めない。
    if (!v.isStruct) {
      if (v.team === 1) F.ek++;
      else if (v.team === 0) F.ak++;
    }
    if (v.name === '宇多頼忠') { F.udaDead = true; if (k === rt.player.u) rt.award((t) => { t.special = { label: '宇多頼忠を討ち取った', pts: 20 }; }, '宇多頼忠を討ち取った'); }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 右上の目標の一行は、五つの目標の言い方だけ（休み・行き着く段で別の言い方や番号に替えない・十の1）。休みと行き着く段では次の目標を出す
const alive2 = (gs) => (gs || []).some((g) => g && g.count > 0 && !g.routed);
const GOALS = ['大手門の内の侍屋敷で石田勢を討て', '三の丸から石田正澄の隊を追い落とせ', '二の丸の下の段の石田勢を討て', '二の丸の上の段で宇多頼忠を討て', '本丸の天守の前で石田正継の旗本を討て'];
// 右上の①〜⑤（goals5.js）：段の進みと、相手の将の様子で済ませる（三3・三4・九2）。
//   段の長さは史実の流れ（日暮れの止み・夜の三の丸）で決まるので、目標ごとの時切れの ✕ と残りの時計は付けない（始まりの台詞の間に時計が減っていた・十の2）。
//   goals5.js は sec の無い目標に二百秒を足すので、組み立ての間だけ sec を 1 と見せ、組み立てた後は 0（時計なし）を返す
const DP_I = (rt) => (rt.flags.dp ? (rt.flags.dp.on ? rt.flags.dp.i : 99) : -1);
k07_sawayama.goals5 = (rt) => {
  const F = rt.flags, cur = (k) => () => (DP_I(rt) === k ? F.dp.cur?.groups || [] : []);
  const list = [
    { text: '大手門の内の侍屋敷で石田勢を討つ', check: () => DP_I(rt) >= 1, groups: cur(0) },
    { text: '三の丸から石田正澄の隊を追い落とす', check: () => DP_I(rt) >= 4, groups: cur(3) },
    { text: '二の丸の下の段の石田勢を討つ', check: () => DP_I(rt) >= 6, groups: cur(5) },
    { text: '二の丸の上の段で宇多頼忠を討つ', check: () => DP_I(rt) >= 7 && !!F.udaDead, groups: cur(6) },
    { text: '本丸の天守の前で石田正継の旗本を討つ', check: () => DP_I(rt) >= 9 && !!F.burned, groups: cur(8) },
  ];
  // 全滅・退場で組の兵が片付いても、出した人数を分母に残す。
  // 田中勢の乱入待ちの間にも、本丸の旗本の人数を消さない。
  return list.map((g, k) => {
    const stage = [0, 3, 5, 6, 8][k];
    let total = 0, beaten = 0;
    const count = () => {
      const groups = g.groups();
      if (DP_I(rt) === stage) {
        let all = 0, left = 0;
        for (const group of groups) for (const u of group.units || []) {
          all++;
          if (u.alive && !u.gone && !u.fleeing) left++;
        }
        total = Math.max(total, F.dp.cur?.nTot || 0, all);
        beaten = Math.max(beaten, total - left);
      }
      return total ? [Math.min(beaten, total), total] : null;
    };
    return Object.defineProperty({ kind: 'stage', k, ...g, count }, 'sec', { get: () => (rt._g5?.goals?.length ? 0 : 1), enumerable: true });
  });
};
k07_sawayama.missionHeading = (rt) => {
  // 日暮れで途中の段を終えても、未到達の本丸へ目標を替えない。
  const i = rt.flags.dp?.i ?? 0;
  const k = i <= 0 ? 0 : i <= 3 ? 1 : i <= 5 ? 2 : i === 6 ? 3 : 4;
  return '①②③④⑤'[k] + GOALS[k];
};
// 城方：まだ出ていない曲輪の兵（後の段の分）を見込んで延べを三百二十より少なく見ない。落ちるまでは本丸に残る兵を数える（0 にしない）
k07_sawayama.force = (rt) => {
  // 天守に火が回っても、南の曲輪や櫓に残る守りまで零にはしない。
  let remaining = 0;
  for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.isStruct) remaining++;
  const F = rt.flags, all = Math.max(320, (F.eMax || 0) + 60);
  const estimate = F.burned ? remaining : Math.max(180, remaining, Math.round(2800 * (1 - (F.ek || 0) / all)));
  // 後の曲輪の兵が出て延べ人数が増えても、討たれた城兵の数を巻き戻さない。
  const b = Math.max(remaining, Math.min(F.forceEnemy ?? 2800, estimate));
  F.forceEnemy = b;
  return { a: Math.round(15000 - (F.ak || 0) * 20), a0: 15000, b, b0: 2800 };
};
// 11/22 01:50 UTC クラウド sawayama 持ち主（K582 act bot 携帯 0141 ★★「馬に乗ろうとしても乗れなかった」6回）：本人は徒で登る戦（begin で canRide を外す）なのに、
//   討たれた宇多・正澄の空馬へ手を伸ばし続けた。この戦では空馬に手を出さない
k07_sawayama.botMountAllowed = () => false;
k07_sawayama.sides = { a: { name: '東軍', mon: 'kobayakawa' }, b: { name: '石田方', mon: 'ishida' } };
// 落城の場面だけでなく、最後の結果の札にも佐和山の結末を残す。
k07_sawayama.winWord = '佐和山城、落城';
k07_sawayama.victoryCaption = '正継・正澄・朝成、天守に果つ';
// 始まりの札で折れないように短く（「秋・払／暁」と折れていた・五4）
k07_sawayama.date = (rt) => (rt.flags.day18 ? '慶長五年（1600）九月十八日　朝' : rt.flags.night ? '慶長五年（1600）九月十七日　夜' : rt.flags.dusk ? '慶長五年（1600）九月十七日　日暮れ' : '慶長五年（1600）九月十七日　払暁');
// 始まりの札：題は一行に収まる名、二三行の本文（五4）
k07_sawayama.introName = '佐和山城攻め';
k07_sawayama.introText = '関ヶ原の二日後。主の三成のいない佐和山城を、小早川秀秋ら一万五千が囲む。大手門を破り、尾根の曲輪を一つずつ落として、山の頂の本丸へ攻め上る。';
k07_sawayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k07_sawayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k07_sawayama.history = '慶長五年（1600）九月十五日、関ヶ原で西軍が敗れると、東軍は三成の本拠・佐和山城へ向かった。城は琵琶湖を見下ろす佐和山の頂に五層の天守を持つ山城で、三成は戻らず、父の石田正継、兄の正澄とその子の朝成、三成の舅の宇多頼忠らが二千八百ほどで守った。家康は城の南の正法山に陣を取り、小早川秀秋を先鋒に脇坂安治・朽木元綱・小川祐忠・赤座直保・井伊直政・田中吉政らおよそ一万五千が十七日の明け方から大手と搦手から攻めた。日暮れに攻めが止むと、三の丸を守っていた長谷川守知が兵を連れて城を出て東軍の先に立ち、十八日に城は落ちた。正継・正澄・朝成・宇多頼忠と三成の妻は自害したと伝えられる（正澄は討ち取られたとの伝えもある）。三成本人は関ヶ原の後に逃れ、九月二十一日に近江で田中吉政の手に捕らえられた。三成の子の重家は出家して生き延びた。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、攻め口の細かい道筋は推定である。内応や裏切りの伝えなど、史料により異なる点もある。';
k07_sawayama.bushou = [{ name: '石田正継', g: /正継/ }, { name: '石田正澄', g: /正澄/ }, { name: '宇多頼忠', g: /頼忠/ }, { name: '石田朝成', g: /朝成/ }];

const rt_gateOpen = (b, id) => !!b.flags.gateOpen?.[id];
// 11/22 10:55 UTC クラウド sawayama 持ち主：倒れた時の三秒の足跡に、退きの印（b_depth の dpBack）と舵の名・段の番号を足す
k07_sawayama.botDbg = (b) => `${b.flags.dpBack ? '退' : ''}${b._k07St || ''}#${b.flags.dp?.i ?? ''}`;
k07_sawayama.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  // 尾根の上の段（二の丸・本丸）では、斬り合いの場へ城の道（二の丸の奥の口→本丸の門）を通って行く。真っ直ぐ向かうと本丸の石垣に当たって外を回り、
  //   本丸に一度も入らないまま⑤が済んだ（11/6 描いて遊んだ二回とも）
  const D = F.dp, C = D && D.on && D.cur;
  // 五秒動けない時は八秒、道案内を使わない（下の三つの段の動きで同じ物差し）
  const SB = F._sb || (F._sb = { x: u.pos.x, z: u.pos.z, t: b.t, off: 0 });
  if (Math.hypot(u.pos.x - SB.x, u.pos.z - SB.z) > 1.5) { SB.x = u.pos.x; SB.z = u.pos.z; SB.t = b.t; }
  else if (b.t - SB.t > 5 && b.t > SB.off) { SB.off = b.t + 8; SB.t = b.t; }
  // 11/18 16:05 UTC クラウド持ち主：act bot で段3（二の丸の下の段）の守りが崩れた後、三の丸の東門の脇（21,-102）で
  //   道案内の整列点（22,-106）へ寄れず八百秒動かずに日暮れの負け（1065秒）。動けない間は道案内を外して曲輪へ直に向かう
  // 11/18 17:20 UTC クラウド持ち主：act bot 段3で三の丸の南の塀際 (2〜16,-118) を小刻みに行き来し（一歩半より動くので上の物差しに掛からない）、
  //   矢を受けたまま八百秒動けず日暮れの負け（1065秒）。斬り合いの段で曲輪の的へ二十五秒近づけない時も、十二秒は道案内を外して的へ直に向かう
  if (C && C.s.kind === 'fight' && C.at) {
    const dg = Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z), PG = F._k07Prog;
    if (!PG || PG.c !== C || dg < PG.d - 3) F._k07Prog = { c: C, d: dg, t: b.t };
    else if (b.t - PG.t > 25 && dg > 14) { SB.off = Math.max(SB.off, b.t + 12); PG.t = b.t; PG.d = dg; }
  }
  const unstick = b.t <= SB.off && SB.off > 0;
  // 守りが崩れた後は追撃を止め、曲輪の中まで登る。一度入って外へ出た時も戻る。
  if (C && C.s.kind === 'fight' && (C.k07Cleared || C.k07Return) && !C.k07Inside) {
    const q = unstick ? C.at : sawayamaWay(b.army, u, C.at);
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    goTo(p, inp, q.x, q.z, Math.min(1.5, q.botRadius ?? 1.5), true); inp.runHeld = true;
    return;
  }
  if (C && C.s.kind === 'fight' && D.i >= 5 && C.goal && !b.army.nearestEnemy(u, 7, (o) => !o.downed && !o.dying && !o.woundOut && !o.gone && !o.fleeing && !o.noTarget && !o.perch && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    // ④（二の丸の上の段）で本丸の門の前（南）まで上がってしまった時は、二の丸の中へ戻る（11/9 流し：本丸の門の前で矢を受けながら八分立ち往生）
    //   門の外（北）の口で立ち止まった時も、門をくぐって中へ（11/9 流し：破れた門の外で九分矢を受けていた）
    const back = D.i === 6 && (u.pos.z > -27 || (u.pos.z < -39.5 && u.pos.z > -52 && Math.abs(u.pos.x + 8) < 9 && rt_gateOpen(b, 'ni1_n')));
    // 11/18 23:10 UTC クラウド持ち主：⑤（本丸）の初めに本人が二の丸の中の段から尾根を下り (-31,-70) まで百秒さまよった（act bot 足跡・段5 討ち取り0）。
    //   段の的の組の中心が本丸から遠い時（崩れた組の残りで中心がずれる）は、本丸の天守の前へ向かう
    const far8 = D.i === 8 && Math.hypot(C.goal.x - HON_YARD.x, C.goal.z - HON_YARD.z) > 14;
    const want = back ? { x: NI1.x, z: NI1.z } : far8 ? { x: HON_YARD.x, z: HON_YARD.z } : { x: C.goal.x, z: C.goal.z }, q = unstick ? want : sawayamaWay(b.army, u, want);
    // 曲輪へ戻る時も、前の斬り合いの後退・横移動・攻撃を残さない。
    if (((back || far8) && q === want) || (q !== want && q.active)) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      goTo(p, inp, q.x, q.z, Math.min(1.5, q.botRadius ?? 1.5), true); inp.runHeld = true; return;
    }
  }
  // 大手と三の丸（D.i < 5）は開けた曲輪：曲輪の奥で構える守りへ自分から寄る（11/9 流し：入口に立ったまま、三十歩奥の守りに新手が足され続けて五分かかった）
  // 塀・枡形の向こうの敵は追わず、門を通る段の動きへ任せる。それでも五秒動けない時は、八秒は追わずに段の動き（depthBot）へ任せる（11/9 流し：大手の枡形の前で十五分）
  if (C && C.s.kind === 'fight' && D.i < 5 && b.t > SB.off) {
    // 11/19 06:05 UTC クラウド持ち主：段2（三の丸）で打って出た守り二十六人が尾根の坂の上 (34,-98) で味方と斬り合う間、本人は十八歩下 (49〜53,-88〜-93) に
    //   五十秒立ち討ち取り0（act bot 足跡）＝坂の高さの違いが四を越えて「高さの違う敵」と見て追わなかった。三の丸の尾根の段は遠い敵ほど高さの違いを許す（寄れば同じ坂の上で揃う）
    const dyOk = (o) => Math.abs(o.pos.y - u.pos.y) < (D.i === 3 ? Math.max(4, 0.4 * Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z)) : 4);
    const e = b.army.nearestEnemy(u, 50, (o) => !o.downed && !o.dying && !o.woundOut && !o.gone && !o.fleeing && !o.noTarget && !o.perch && !o.invuln && !o.isStruct && dyOk(o) && !b.army.wallBetween(u.pos, u.team, o.pos, false));
    // 11/18 18:15 UTC クラウド cloud-k07：段2で三の丸の東の口 (18,-106) の外 (35〜41,-95〜-100) から、塀の内の正澄の旗本へ真っ直ぐ寄ろうとして
    //   塀に当たり八十秒止まった（act bot 足跡・討ち取り0・段2が百六十〜百九十七秒）。曲輪の内の敵へ外から向かう時は、門を通る段の動き（depthBot）へ任せる
    const yardOf = (q) => PLAN.kuruwa.find((y) => { const pp = y.poly; return q.x > pp[0][0] && q.x < pp[1][0] && q.z > pp[0][1] && q.z < pp[2][1]; });
    if (e && yardOf(e.pos) && yardOf(e.pos) !== yardOf(u.pos) && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 4) { depthBot(b, inp, goTo); return; }
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) { goTo(p, inp, e.pos.x, e.pos.z, 2.2); inp.runHeld = d > 7; } else inp.k.delete('KeyW');
      if (patientStrike) patientStrike(p, inp, e, d, true);
      return;
    }
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k07_sawayama = [['大手門の内の侍屋敷で石田勢を討つ'], ['三の丸から石田正澄の隊を追い落とす', dpAt(3)], ['二の丸の下の段の石田勢を討つ', dpAt(5)], ['二の丸の上の段で宇多頼忠を討つ', dpAt(6)], ['本丸の天守の前で石田正継の旗本を討つ', dpAt(8)]];

// 11/21 クラウド K564（重くない）：佐和山は本人の外の本物の兵が二百四十余りいて、更新が全64戦で二番目に重かった（k399_heavy 336ms・
//   描かずの4倍遅くで 1コマ 86ms／山崎 30ms）。共通の休ませ（idle_park.js）は味方の組だけなので、山の上の櫓・隅櫓の射手と、
//   本人から遠い城方の待つ組（本人から百十m より遠く、味方の兵が五十m 内にいない・狙う相手も無い）を 0.5 秒ごとに休ませる。
//   兵の並び（army.units）からは外さないので、数え・勝ち負けは変わらない。遠景の束で同じ場所に描かれる。本人か味方が寄れば戻す
function parkFarGuards(rt) {
  const F = rt.flags; if ((F._pfT || 0) > rt.t) return;
  F._pfT = rt.t + 0.5;
  if (typeof location !== 'undefined' && /[?&]nopark\b/.test(location.search)) return;
  const me = rt.player?.u; if (!me) return;
  const P = me.pos, A = rt.army, ours = [];
  for (const o of A.units) if (o.alive && o.team === me.team && !o.isStruct && !o.idleSkip) ours.push(o.pos);
  // 櫓の上の射手は本人から百十m より遠ければ休ませる（寄せ手の足軽が下にいても、本人の見えない所の矢合わせは遠景の束で足りる）。地の上の待つ組は味方が五十m 内に来れば起こす
  const far = (x, z, perch) => {
    if (Math.hypot(x - P.x, z - P.z) < 110) return false;
    if (perch) return true;
    for (let i = 0; i < ours.length; i++) { const q = ours[i]; if (Math.abs(q.x - x) < 50 && Math.abs(q.z - z) < 50) return false; }
    return true;
  };
  for (const g of A.groups) {
    if (g.team === me.team || !g.units?.length) continue;
    const holdG = !g.routed && (g.order === 'hold' || g.order === 'yari') && !g.marching && (g.anchorSpeed || 0) < 0.1;
    for (const u of g.units) {
      if (u.idleSkip && !u._pfk) continue;   // ほかの手が休ませた兵はその手に任せる
      const on = !F.ending && u.alive && !u.gone && !u.name && u.type !== 'busho' && !u.mounted && !u.isStandard && !u.stdHeld && !u.isStruct &&
        (u.perch || !u.target && !u.atk) && !u.fleeing && (u.perch || holdG) && far(u.pos.x, u.pos.z, !!u.perch);
      if (!!u._pfk === on) continue;
      u._pfk = on; u.idleSkip = on;
      if (on && u.mesh?.parent) { u._pfParent = u.mesh.parent; u.mesh.parent.remove(u.mesh); }
      else if (!on && u.mesh && !u.mesh.parent && u._pfParent) { u._pfParent.add(u.mesh); u._pfParent = null; }
    }
  }
}
export { k07_sawayama };
export default k07_sawayama;
// 11/21 22:15 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 二秒の足跡）：段2で尾根の上 (48,-104) から生き残りの避け（退・避）が
//   三の丸の南の塀の外を西へ回り (-12,-106)、二の丸の下の段の守りの中 (-8,-84) へ出て倒れた（段2 で負け）。段2の避けの一歩は、
//   三の丸の南の外（z<-117・x<20）と西の外（x<-12）へ、さらに西へ踏み込む向きを選ばない（東へ戻る一歩は許す）
k07_sawayama.botRetreatStepAllowed = (b, step) => {
  const dp = b.flags.dp;
  if (!dp || !dp.on || dp.i !== 3) return true;
  const deep = (step.x < 20 && step.z < -117) || step.x < -12;
  return !deep || step.x >= b.player.u.pos.x;
};
// 11/22 15:00 UTC クラウド sawayama 持ち主（K582・act bot 携帯の見なし 三本に一本 段5 で倒れた・11:25 の足跡）：本丸の門の坂で傷を受けると
//   共通の survive が坂の下（二の丸の側）の味方へ退かせ、坂を南へ背を向けて下り、背から石田の旗本に斬られ続けた。
//   段5 で門の坂 (-22〜8, -17〜-34) にいて五m 内に槍・侍・名のある将が居て命が四割五分より多い間は、背を見せて下らず構えて受ける
//   （真田丸・高遠と同じ botDuel の口。敵は弱めない・遊びは変えない）
k07_sawayama.botDuel = (b) => {
  const dp = b.flags.dp, u = b.player && b.player.u;
  if (!dp || !dp.on || dp.i !== 8 || !u || !u.alive || u.hp <= u.maxHp * 0.45 || dp.cur?.k07Inside) return false;
  const P = u.pos;
  if (P.x < -22 || P.x > 8 || P.z > -17 || P.z < -34) return false;
  return b.army.units.some((e) => e.alive && !e.fleeing && !e.dying && !e.downed && !e.isStruct && e.team !== u.team && e.type !== 'gun' && e.type !== 'bow' && Math.hypot(e.pos.x - P.x, e.pos.z - P.z) < 5);
};
// K674（11/26 Sanae）：本丸の後の続きの段（tokugawa_more2.js の k07_sawayama）は書いたが、act bot が本丸の前で時間切れか倒れ（三回中三回・足す前も倒れた）続きの段まで届かず未確認＝呼び出しは止めてある
import { moreSteps, MORE } from './tokugawa_more.js';
moreSteps(k07_sawayama, MORE.k07_sawayama);
