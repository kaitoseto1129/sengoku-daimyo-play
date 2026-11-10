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
import { nobori, jinmaku, kagaribi, tenshu, sumiyagura, hut } from './props.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { horiboriHeight, mizubori } from './castle_parts.js';
import * as hata from './k07/hata.js';   // 曲輪が落ちるたび石田の幟が倒れる（11/8）
import * as hoi from './k07/hoi.js';     // 寄せ手一万五千の包囲（奥の軽い大軍・11/8）
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { revealName } from './battle_intel.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';
import { sectionTaken } from './siege_path.js';

const HAS_DEM = false;
let dem = null;
if (HAS_DEM) {
  BATTLE_ASSETS.k07_sawayama = Object.freeze([...assetsForBattle('k07_sawayama'), 'dem_sawayama']);
  useTerrain('dem_sawayama', (data) => { dem = data; });
}

// ---- 場所（ゲームの座標） ----
const START = { x: 152, z: 0 };          // 小早川勢の寄せ口（大手の外の田の中）
const OTE = { x: 104, z: -8 };           // 大手門の内（侍屋敷の谷戸）
const SAN = { x: 4, z: -107 };           // 三の丸（北の尾根の先。石田正澄）
const NI3 = { x: -8, z: -78 };           // 二の丸の下の段
const NI1 = { x: -8, z: -34 };           // 二の丸の上の段（本丸の北の下）
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
  ote: { stage: 0, at: [119, 0], wait: 40, say: ['脇坂の侍', '掛矢で大手の門扉を打ち破ったぞ！　枡形へ斬り込め'] },
  san_e: { stage: 1 },
  ni3_n: { stage: 5, at: [-8, -87], wait: 22, say: ['小早川の侍', '二の丸の下の段の門を打ち破った！'] },
  ni1_n: { stage: 6, at: [-8, -43], wait: 25, say: ['小早川の侍', '二の丸の門が破れたぞ！　本丸の石垣の下じゃ'] },
  hon: { stage: 7 },
};

const ISHIDA = { armor: 0x2e2a24, lace: 0x2a3040, cloth: 0x232833, flag: 'ishida' };   // 11/8 四3：胴の下の着物の赤茶が橙に見えた。着物も紺に   // 黒の具足に紺の縅（紫は使わない）
const KOBA = { flag: 'sashi:kobayakawa:#ece6d6:#16140f' };
const WAKI = { flag: 'wakisaka' };     // 脇坂の輪違い
const TANAKA = { flag: 'maru' };       // 田中吉政（家紋が確かでないので丸）
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
const PLAN = {
  mon: 'ishida', name: '佐和山城', type: 'yama', year: 1600, gateSlope: 7, lifeNoFlags: true,
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
    { id: 'san_e', name: '三の丸の門', from: 'out', to: 'san', kind: 'hira', gate: 'yagura', at: [18, -106], rot: Math.PI / 2, w: 4.4 },
    { id: 'san_s', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [-8, -96], rot: 0, w: 4.4 },
    { id: 'ni3_n', name: '二の丸の下の段の口', from: 'out', to: 'ni3', kind: 'hira', gate: 'kabuki', at: [-8, -84], rot: Math.PI, w: 4.4 },
    { id: 'ni3_s', name: '二の丸の下の段の奥', from: 'ni3', to: 'out', kind: 'hira', at: [-8, -72], rot: 0, w: 4.4 },
    { id: 'ni2_n', name: '二の丸の中の段の口', from: 'out', to: 'ni2', kind: 'hira', at: [-8, -62], rot: Math.PI, w: 4.4 },
    { id: 'ni2_s', name: '二の丸の中の段の奥', from: 'ni2', to: 'out', kind: 'hira', at: [-8, -50], rot: 0, w: 4.4 },
    { id: 'ni1_n', name: '二の丸の門', from: 'out', to: 'ni1', kind: 'hira', gate: 'kabuki', at: [-8, -40], rot: Math.PI, w: 4.4 },
    { id: 'ni1_s', name: '二の丸の奥の口', from: 'ni1', to: 'out', kind: 'hira', at: [-8, -28], rot: 0, w: 4.4 },
    { id: 'hon', name: '本丸の門', from: 'out', to: 'hon', kind: 'hira', gate: 'yagura', at: [-8, -18], rot: Math.PI, w: 4.4 },
    { id: 'hon_w', name: '本丸の西の口', from: 'nishi', to: 'hon', kind: 'hira', at: [-24, -4], rot: -Math.PI / 2, w: 4.4 },
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
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }, { id: 'hon_yard', kind: 'hon', pts: [[HON_YARD.x, HON_YARD.z], [-2, 4], [-2, 13]] }],
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
const OTE_IN = 7;   // ROUTE の [113, -9]：枡形を出た所
const RF = { d: 0, s: 0, x: 0, z: 0 }, RT = { d: 0, s: 0, x: 0, z: 0 };
function sawayamaWay(army, u, want) {
  const q = u._k07Way || (u._k07Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  // 次の曲輪への進軍や曲輪への戻りで行き先が替わったら、前の向きの道を使わない。
  if (q.wantX !== want.x || q.wantZ !== want.z) {
    q.wantX = want.x; q.wantZ = want.z; q.t = -1;
  }
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 2.4) return q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
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
  for (const [x, z] of [[OTE.x - 6, OTE.z + 6], [SAN.x + 4, SAN.z - 4], [NI1.x + 6, NI1.z], [HON.x + 8, HON.z - 8], [TAIKO.x + 6, TAIKO.z]]) rt.scene.add(kagaribi(W, x, z));
}

// 城内の守りは曲輪ごとの持ち場に置く。共通の出現位置の補正で塀の外や別の尾根へ移さない。
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92, dmg: o.dmg ?? 0.28, noGuard: o.noGuard !== false, ...(o.noRout ? { noRout: o.noRout } : {}) });

const k07_sawayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。佐和山：旧暦九月十七日（新暦十月下旬）の山城。乾いた土と落ちた矢・槍、秋の草
  timeslip: {
    wet: 0.15, dust: 0.5, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x9a9a60, grassTints: [0xffffff, 0xeadcb0, 0xd0c898], grassH: 1.05, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を八人討つ」で埋めない・三の1）
  goalsAllRows: true,     // 共通の既定は今の一行だけ。始めから五つとも並べる。
  keepBattleSigns: true,  // 行き先の▼を出している間も、朝成らの名札と両軍の数を隠さない。
  forceBarAlways: true,   // 人数を渡すだけでは共通の棒は隠れる。寄せ口から落城まで両軍の残りを示す。
  // 始まりの話の間（段の前）は、印を①の大手門へ（前は戦の大目標の言葉から「山の頂の本丸 35m」と出て、指す所と名が違った）
  goalSignTarget: (rt) => {
    const F = rt.flags, D = F.dp;
    if (F.ending) return null;
    if (!F.begun || !D) return { x: 119, z: 0, label: '大手門' };
    // 固有の指定が null を返すと共通の行き先も消える。敵が見えない間も次の曲輪を指す。
    const i = D.i;
    if (i === 0) return F.gateOpen?.ote ? { ...OTE, label: '大手門の内の侍屋敷' } : { x: 119, z: 0, label: '大手門' };
    if (i <= 3) return { ...SAN, label: '三の丸' };
    if (i <= 5) return { ...NI3, label: '二の丸の下の段' };
    if (i === 6) return { ...NI1, label: '二の丸の上の段' };
    return { ...HON_YARD, label: '本丸の天守の前' };
  },
  lethal: { max: 4, firstAt: 80, gap: 50 },   // 命懸けの戦場（docs/lethal_howto.md）：櫓の矢・落石・曲輪の門の前
  fearKind: { kind: '山城の死守', note: '狭い尾根で上から撃たれる', w: { losses: 1.4, flank: 1.2 }, line: '上から矢が来るぞ！' },
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
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
  minutes: 25,
  world: {
    // 描画側は world の指定を読む。寄せ口から約百七十メートル先の天守まで描く。
    landmarkViewFar: 200,
    seed: 1600921,
    time: 'morning',   // 十七日の払暁から攻めた
    // 夜の白い兵：小さな正の値でも共通の補光の下限が残る。兵だけの補光を止め、月光と篝火で照らす。
    unitNightScale: 0,
    groundHalf: 280,
    muddyCastleFloor: 0.8,   // 曲輪の平場を真っ白な砂利にせず、踏み固めた乾いた土に（侍屋敷が白い砂の広場に見えた・八1）
    paths: [ROUTE.slice(0, 10), ROUTE.slice(9)],
    height,
    moveWay: sawayamaWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 麓は刈り入れの済んだ田（九月十七日は新暦の十月二十三日。乾いた刈り株）
      if (h < 4 && x > 134) { c.setRGB(c.r * 0.55 + 0.2, c.g * 0.55 + 0.16, c.b * 0.5 + 0.07); return; }
      if (h > 14) c.setRGB(c.r * 0.74, c.g * 0.84, c.b * 0.7);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 480,
    tufts: 2400,
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
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

  setup(rt) {
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
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    // 櫓と櫓門の上の射手も石田の黒の具足と旗（既定の装いは武田の赤備えと武田の旗だった）
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, buildGates: true, buildTowers: true, interiorGuards: false, perchFaction: 'ishida', perchLook: ISHIDA });
    // 門は閉じて始まる（十一の3。SHUT）。櫓と櫓門の上には石田の鉄砲・弓が立つ（横矢）
    F.gateOpen = {}; F.gateT0 = {}; F.ramT = {};
    for (const g of Object.values(F.C.gateObjs || {})) for (const d of [g, g.outer, g.inner]) if (d && d.struct) Object.assign(d.struct, { noTarget: true, fireProof: true });
    // 大手の内堀（水）。土橋の所だけ掘り残す
    for (const p of MOAT) mizubori(rt, p, MOAT_O);
    // 佐和山の頂の五重の天守（三成の居城。「三成に過ぎたるもの」の一つ。三成の頃の望楼の形）と、西の丸の塩硝櫓。大手の田から谷戸の奥の山の上に城が見える
    try {
      rt.scene.add(tenshu(W, HON.x - 4, HON.z + 2, { floors: 5, b: 11, base: 3.4, borou: true, old: true, rot: Math.PI / 2, team: 1, name: '佐和山城の天守', where: '本丸の天守' }));
      rt.scene.add(sumiyagura(W, NISHI.x - 6, NISHI.z - 6, { w: 5, d: 4.4, base: 0.6, rot: Math.PI / 2 }));
    } catch (e) { console.warn(e); }
    // 大手の侍屋敷：土塁の内の南の半分に板葺きの屋敷を並べる（前は白い平場に篝火だけ・十の1）。北の半分は奥への道なので空ける。屋敷の陰から伏兵が出る
    for (const [x, z, w, d] of [[80, 17, 9, 6], [91, 18, 8, 5.5], [101, 17, 8, 6], [79, 7, 7, 5], [100, 6, 6, 5]]) {
      try { rt.scene.add(hut(W, x, z, w, d, Math.PI, { ita: true, minka: false })); } catch (e) { console.warn(e); }
    }
    farSight(rt.scene.children.slice(castle0), { W, ground: { x: 20, z: -20, r: 100 }, far: W.def.landmarkViewFar });
    flags(rt);
    // 見せかけの軍勢は近くに置かない（AA・AF・AQ6）。見える兵は全部本物。11/8：百五十歩より奥にだけ寄せ手一万五千の包囲を重ねる（k07/hoi.js）
    hoi.install(rt);
    // ---- 東軍：自分の手勢と脇坂の先手。総大将の秀秋は寄せ口の後ろの本陣で、侍の旗本に囲まれて動かない（O・AR3） ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '小早川秀秋の本陣', anchor: { x: START.x + 20, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: false } }, { type: 'samurai', n: 20 }], KOBA));
    F.hide = F.honjin.units.find((u) => u.name === '小早川秀秋');
    if (F.hide) F.hide._crouch = true;   // 総大将は床几に腰を下ろす（O・AR3）
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], KOBA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '脇坂安治の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }], WAKI));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.5; g.dmgMult = 1.5; g.aggro = 24; }   // 11/9：1.1→1.5（味方の寄せ手で曲輪が落ちるように。十五分に詰める）
    // 一万五千の囲み（一1・十二2）：大手の外の田の北と南に、朽木元綱・赤座直保の陣（陣幕・幟・馬上の将と旗本が控える）。
    //   竹束の陰に小早川の鉄砲衆が据わり、大手の櫓へ撃ちかける（竹束の陰に誰もいなかった・十の3）。西の搦手には田中吉政の陣の幟
    for (const [x, z, name, mon] of [[164, -40, '朽木元綱', 'maru'], [164, 40, '赤座直保', 'maru']]) {
      rt.scene.add(jinmaku(W, x + 8, z, 12, 9, 4, { mon }));
      for (const [dx, dz] of [[-4, -8], [-4, 8], [0, -12], [0, 12], [-6, 0]]) rt.scene.add(nobori(W, x + dx, z + dz, mon, 6));
      allyGroup(rt, { faction: 'oda', name: `${name}の陣`, anchor: { x, z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8 }], TANAKA));
    }
    F.tabaGun = allyGroup(rt, { faction: 'oda', name: '小早川の鉄砲衆', anchor: { x: 141.5, z: 0 }, facing: -Math.PI / 2, width: 22, aggro: 40, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'gun', n: 8 }], KOBA));
    for (const [x, z] of [[KARAME.x - 14, KARAME.z - 10], [KARAME.x - 14, KARAME.z + 6], [KARAME.x - 20, KARAME.z - 2]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // 田中吉政は十七日の払暁から西の搦手に陣を据えた（布陣・11/7）。十八日の開城の段で水の手から本丸へ乱入する（tanaka）
    F.tanaka = allyGroup(rt, { faction: 'oda', name: '田中吉政の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: Math.PI / 2, width: 10, aggro: 3, noRout: true, order: 'hold', fixed: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TANAKA));
    // 井伊直政（攻め手に名がある。関ヶ原の鉄砲傷で床几に座る）：大手の南、家康の正法山の方に赤備えの陣（布陣・11/7）
    rt.scene.add(jinmaku(W, 176, 72, 12, 9, 4, { mon: 'ii' }));
    for (const [dx, dz] of [[-12, -8], [-12, 8], [-8, -14], [-8, 14]]) rt.scene.add(nobori(W, 176 + dx, 72 + dz, 'ii', 6));
    F.ii = allyGroup(rt, { faction: 'oda', name: '井伊直政の陣', anchor: { x: 170, z: 72 }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: false } }, { type: 'samurai', n: 5 }], II));   // 本物の兵は 250 人ほどまで（陣は旗本だけ）
    { const ii = F.ii.units.find((u) => u.name === '井伊直政'); if (ii) ii._crouch = true; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('main', '大手から佐和山城へ攻め上り、山の頂の本丸を落とせ', 'main');
    // 戦の前
    rt.say('小早川秀秋', '関ヶ原は終わった。残るは治部（三成）の本拠、佐和山じゃ', 4.5);
    rt.after(4.5, () => rt.say(nm(rt), '治部少輔はおらぬと聞きます。城には誰が', 3));
    rt.after(7.5, () => rt.say('脇坂安治', '治部の父の正継、兄の正澄ら。二千八百ほどが籠もっておる', 3.5));
    // 城の守り手の名は始めに脇坂が告げる（右上の目標の名を「見えぬ敵の陣を物見する」に伏せない）
    for (const n of ['石田正継', '石田正澄', '石田朝成', '宇多頼忠']) rt.after(7.5, () => revealName(rt, n));
    rt.after(11, () => rt.say('小早川秀秋', '内府（家康）様は南の正法山に陣を取られた。田中殿は搦手、我らは大手じゃ。かかれ！', 4));
    rt.after(15, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    this.south(rt);
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
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
    depthStart(rt, { faction: 'ishida', flag: 'ishida', armor: ISHIDA.armor, friends: () => [F.mine, F.saki, F.hasegawa], look: (list) => dress(list, ISHIDA), scale: 1.4, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40,   // 0.4 では命を戻さない流しで三の丸と二の丸の下の段の斬り合いで続けて討たれた（城方は老兵・若い兵が多く戦えたのは千ほど・battle_learn）
      botFoeAllowed: (o) => !o.perch }, [   // 櫓の上の射手は下から斬れない（追うと塀の下に詰まって段が進まなかった）
      // ① 大手門を破る
      DP.fight({ at: OTE, title: '大手門', sub: '内堀と土塁の奥に枡形の門', obj: '大手門の内の侍屋敷で石田勢を討て', max: 150, noRefill: true,   // 11/9 三巡（織田C）：新手の継ぎ足しで段が七分半続き、act が新手の大手の守りに倒れた。後の段と同じく継ぎ足さない

        say: [['脇坂の侍', '櫓と土塁の上から鉄砲と矢じゃ！　竹束の陰から土橋へ寄せ、掛矢で門扉を破れ'], ['小早川の侍', '先手が谷へ撃ち落とされておる。土塁の陰を伝え']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }])],
        later: [{ t: 40, say: ['小早川の侍', '侍屋敷から石田の新手が打って出たぞ！'], foes: () => [keep('侍屋敷の石田勢', { x: 96, z: -18 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }])] },
          // 老兵の福島次郎作は矢が尽きても他人の矢を拾って射続けた（『佐和山落城記』）
          { t: 75, foes: () => [], say:['脇坂の侍', '櫓の上の老いた弓取り、矢が尽きても拾うて射てくる！'] }],
        reward: '大手門を破った' }),
      // 十七日の日暮れ：攻めは止み、三の丸を受け持つ大坂の援兵・長谷川守知が兵を連れて城を出て、小早川の先陣に付く（内応）
      DP.rest({ dur: 9, heal: 0.7, fn: (rt2) => this.dusk(rt2),
        say: [['小早川の侍', '日が暮れた。攻めは止みじゃ'], ['小早川秀秋', '三の丸から長谷川守知の手が出てくる。岡野殿の申された通りじゃ。通してやれ', 4.2]] }),
      DP.move({ to: { x: 82, z: -42 }, obj: '侍屋敷の北の口を抜け、三の丸の尾根の下へ行け', label: '三の丸の尾根', r: 8, max: 90,
        // 伏兵は北の口へ向かう道の脇（南の屋敷の間で出すと、追う主人公のカメラが屋敷の屋根の中に入った）
        ambush: { d: 30, say: ['小早川の侍', '侍屋敷の陰に伏兵じゃ！'], foes: () => [keep('侍屋敷の伏兵', { x: 96, z: -21 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      // ② 三の丸
      // 正澄は三の丸の奥で指揮し、隊が崩れると本丸へ退く。史実の退却まで無敵の将を斬り合いの相手にしない。
      DP.fight({ at: SAN, title: '三の丸', sub: '北の尾根の先に石田正澄', obj: '三の丸から石田正澄の隊を追い落とせ', max: 180, noRefill: true,   // 長谷川の手引きで三の丸は一夜で落ちた。新手を足すと、崩れた兵が塀の内に溜まって百を超え、次の段で主人公を囲んだ
        say: [['長谷川守知', '三の丸の勝手は知っておる。我らが先に立つ'], ['石田正澄', '長谷川め、裏切ったか。石田木工頭正澄これにあり。一歩も通すな！']],
        foes: (rt2) => {
          const g = enemyGroup(rt2, { fixed: true, noGuard: true, noRetinue: true, faction: 'ishida', name: '石田正澄の指揮所', anchor: { x: -8, z: -100 }, facing: Math.PI / 2, order: 'hold', aggro: 0, seekRange: 1, noRout: true },
            dress([{ type: 'busho', n: 1, o: { name: '石田正澄', hat: 'kabuto_m', horse: true, invuln: true } }], ISHIDA));
          for (const u of g.units) u.noTarget = true;
          return [keep('三の丸の守り', SAN, [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 98 })];
        },
        later: [{ t: 35, say: ['石田正澄', '石田の鉄砲衆、曲輪の内から撃ちかけよ！'], foes: () => [keep('三の丸の石田鉄砲衆', { x: SAN.x - 6, z: SAN.z - 8 }, [{ type: 'gun', n: 5 }, { type: 'bow', n: 3 }, { type: 'samurai', n: 1 }])] }],
        onEnd: (rt2) => this.sumiOut(rt2),
        reward: '三の丸を落とした' }),
      // 十八日の明け：残るは二の丸と本丸
      DP.rest({ dur: 6, heal: 0.7, fn: (rt2) => this.dawn(rt2), say: [['小早川秀秋', '夜が明けた。残るは二の丸と本丸じゃ。一気に攻め上れ']] }),
      // ③ 二の丸の三段
      // 三の丸が落ちると、本丸のほかの曲輪は次々と落ちた（歴史街道）。二の丸の二つの段は新手を足さず、居る兵を討てば次へ
      DP.fight({ at: NI3, title: '二の丸', sub: '尾根の段を一つずつ落とす', obj: '二の丸の下の段の石田勢を討て', max: 160, noRefill: true,
        say: [['小早川の侍', '三の丸は落ちた。二の丸の段を一つずつ落とせ']],
        foes: () => [keep('二の丸の下の段の守り', NI3, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { seek: 22, noRout: 40 })],   // 一人討たれて皆逃げ、斬り合わずに段が済んだ（九の2）。四十秒は段の口で踏みとどまる
        reward: '二の丸の下の段を落とした' }),
      // 宇多頼忠は落城の時に果てた。段が済んでまだ生きていれば、崩れて退くところを寄せ手に討たれる（udaEnd。目標の✔の後に名札が生きて残らない）
      DP.fight({ at: NI1, title: '二の丸の上の段', sub: '本丸の石垣の下', obj: '二の丸の上の段で宇多頼忠を討て', max: 160, noRefill: true,
        say: [['宇多頼忠', '婿どのの城じゃ。この老骨が二の丸を守る']],
        foes: () => [keep('宇多頼忠の隊', NI1, [{ type: 'busho', n: 1, o: { name: '宇多頼忠', hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 3 }], { morale: 98, seek: 22, noRout: 400, noGuard: true })],   // noGuard：曲輪の内に居た守りなので、共通の「見える所に湧かせない」で南の太鼓丸へずらさない（ずらされた宇多が出た一コマで「南へ抜けた」と果て、正継の旗本は南から本丸へ入っていた・11/6）。持ち場の段を離れて南の太鼓丸の寄せ手まで追わない。崩れて逃げると本丸の南の太鼓丸まで走り、主人公が六分追い回した（11/7）ので崩れない
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
        foes: (rt2) => { this.tsugu(rt2); return [keep('石田正継の旗本', HON_YARD, [{ type: 'samurai', n: 10 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], { morale: 100, seek: 12, noRout: 100, noGuard: true })]; },   // 四十秒で崩れると、主人公が本丸の門に着く前に段が済んだ（11/7）   // 侍十二では、本丸の門で囲まれて主人公が討たれる回があった（史実も乱入の後の短い斬り合い）
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
      const retreat = ['san', 'ni3', 'ni1'].includes(yardId)
        ? ROUTE.slice(Math.ceil(routeAt((yard.poly[0][0] + yard.poly[1][0]) / 2,
          (yard.poly[0][1] + yard.poly[2][1]) / 2, RT).s)) : null;
      const tick = s.tick;
      s.tick = (rt2, C, m, ctx, el, dt) => {
        if (retreat) for (const g of C.groups) if (!g.fleePath) g.fleePath = retreat;
        const p = rt2.player.u.pos;
        const inside = !!yard && p.x > yard.poly[0][0] && p.x < yard.poly[1][0] && p.z > yard.poly[0][1] && p.z < yard.poly[2][1] && Math.abs(p.y - yard.level) < 3;
        C.k07Inside = inside;
        if (inside) {
          C.k07Entered = true;
          C.k07EnteredAt ??= rt2.t;
          // 曲輪を離れて待つ時間は、宇多との斬り合いに含めない。
          C.k07FightTime = (C.k07FightTime || 0) + dt;
        }
        let cleared = tick(rt2, C, m, ctx, el, dt);
        // 曲輪の中央へ攻め入り七割五分を崩せば残兵は退く。塀の裏の数人を全滅まで追わせない。
        // 宇多本人の討ち取りと、本丸への田中勢の乱入は従来どおり必要。
        if (!cleared && inside && !C.later.length && (yardId !== 'ni1' || rt2.flags.udaDead)) {
          if (!C.k07SectionTaken && rt2.t >= (C.k07SectionAt || 0)) {
            C.k07SectionAt = rt2.t + 0.5;
            C.k07SectionTaken = sectionTaken(rt2, C.groups, { flag: C.at, few: 0 });
          }
          cleared = !!C.k07SectionTaken;
        }
        C.k07Cleared = !!cleared;
        // 一度入って外へ戻った時も、曲輪へ入り直すまでは達成しない。
        // 乱入を告げた後の正継・朝成・東雲斎の言葉を終えてから落城へ進む。
        const enteredAt = rt2.flags.tanakaInT;
        // 共通の判定は隊の潰走でも済む。宇多本人の討死は、段を終える前に確かめる。
        // 終了処理で生存中の宇多を倒してから✔を付ける順にはしない。
        return cleared && inside && (yardId !== 'ni1' || !!rt2.flags.udaDead) && (C.at !== HON_YARD ||
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
  //   段の外へ出た兵は本丸へ退いた事にして下げ、宇多が逃げかければその場で果てる（主人公が南の尾根まで六分追い回した・11/7）
  udaTick(rt) {
    const F = rt.flags, D = F.dp;
    if (!D || !D.on || D.i !== 6 || !D.cur?.groups || !D.cur.k07Entered) return;
    if ((F.udaT || 0) > rt.t) return;
    F.udaT = rt.t + 0.5;
    // 宇多が討たれたら隊は主を失って崩れる（史実の決まり：組の頭が討たれた組は退く）。前は崩れない（noRout 400）ままで、討った後も八十秒斬り合いが続いた（11/6 流し）
    if (F.udaDead) { for (const g of D.cur.groups) if (g.count && !g._udaLost) { g._udaLost = true; g.noRout = false; g.morale = Math.min(g.morale ?? 50, 8); } }
    // 一度入っても、曲輪を離れた間は南へ出た兵の整理や討死の保険を動かさない。
    if (!D.cur.k07Inside) return;
    // 段の初めの十五秒は数えない：出た一コマで宇多が「南へ抜けた」と見なされて果て、④の斬り合いが無いまま段が済んだ（11/6 流しで再び出た）
    // 門の外で待った時間では討死させない。主人公が曲輪に入ってからの斬り合いを数える。
    const el = D.cur.k07FightTime || 0;
    if (el < 15) return;
    // 二分の斬り合いで主人公が討てなければ、宇多は寄せ手の槍に果てる（史実も落城の中で果てた。④を長く引きずらない）
    if (!F.udaDead && el > 120) { this.udaEnd(rt); return; }
    for (const g of D.cur.groups) for (const u of g.units.slice()) {
      if (!u.alive) continue;
      // 本丸の南（太鼓丸の側）へ抜けた者、本丸へ向けて逃げる者だけ（段の初めに隊が丸ごと消えて、宇多の段が一秒で済んだ・11/7）
      const away = u.pos.z > HON.z + 8 && u.pos.z < 200 && Math.hypot(u.pos.x - NI1.x, u.pos.z - NI1.z) > 40;
      if (u.name === '宇多頼忠') { if (away) this.udaEnd(rt); continue; }
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
    F.tanaka.order = 'path'; F.tanaka.path = [[-80, -8], [-62, -4], [-48, -4], [-34, -4], [-24, -4], [HON.x - 6, HON.z - 6]]; F.tanaka.pathIdx = 0;
    F.tanaka.dmgMult = 0.7;
    F.tanakaT = rt.t;
    this.openGate(rt, 'hon');   // 開城の使いの後、城方が本丸の門を開けた
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z - 4, 'maru', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  // 田中勢が本丸の西の口に着いたら乱入を告げる（言った物が本当にそこにいる）
  tanakaIn(rt) {
    const F = rt.flags;
    if (F.tanakaIn || !F.tanaka) return;
    const since = rt.t - (F.tanakaT ?? rt.t);
    if (since < OPEN_CASTLE_WAIT) return;   // 早く着いても開城の話を遮らず、約束の後に乱入を告げる
    // 石垣の下を通る兵を、本丸へ入った兵として数えない。
    const level = PLAN.kuruwa.find((k) => k.id === 'hon').level;
    const near = F.tanaka.units.some((u) => u.alive && u.pos.x >= -24 && u.pos.x <= 4 && u.pos.z >= -18 && u.pos.z <= 16 && Math.abs(u.pos.y - level) < 3);
    if (!near) return;
    F.tanakaIn = true;
    F.tanakaInT = rt.t;
    F.tanaka.order = 'attack'; F.tanaka.anchor = { x: HON_YARD.x, z: HON_YARD.z };
    rt.say('田中吉政', '水の手は田中が破った。本丸へ乗り込め', 3.4);
    rt.after(3.8, () => rt.say('石田正継', '……内府も念の入ったことよ', 3.6));
    rt.after(7.8, () => rt.say('石田朝成', '約束を違えたか。祖父上、天守は我らが守りまする！', 3.6));
    // 家臣の土田東雲斎は蔵の金銀を投げて寄せ手に拾わせ、正継らの自害の時を稼いだ（歴史街道ほか）
    rt.after(11.8, () => { if (!F.ending && !F.touun) { F.touun = true; rt.say('土田東雲斎', '蔵の金銀を撒け。殿の御最期の時を稼ぐのじゃ', 3.6); } });
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
    for (const g of [F.mine, F.saki, F.hasegawa]) {
      if (!g || !g.count || g.routed) continue;
      const c = g.center(), d = Math.hypot(c.x - C.at.x, c.z - C.at.z);
      const from = g._k07Probe || (g._k07Probe = { x: 0, y: 0, z: 0 });
      from.x = c.x; from.z = c.z; from.y = rt.world.heightAt(c.x, c.z);
      const to = g._k07Target || (g._k07Target = { x: 0, y: 0, z: 0 });
      to.x = C.at.x; to.z = C.at.z; to.y = rt.world.heightAt(to.x, to.z);
      const arrived = d < 8 && Math.abs(from.y - to.y) < 3 && !rt.army.wallBetween(from, g.team, to, false);
      const foe = rt.army.units.some((o) => o.alive && o.team === 1 && !o.isStruct && !o.fleeing && !o.noTarget && !o.invuln && !o.perch &&
        (o.pos.x - c.x) ** 2 + (o.pos.z - c.z) ** 2 < 36 && Math.abs(o.pos.y - from.y) < 3 && !rt.army.wallBetween(from, g.team, o.pos, false));
      if (g._k07Go && g._k07Go !== C.at) { g._k07Go = null; g.speed = g._k07Sp; }
      if (!arrived && !foe) {
        if (!g._k07Go) {
          g._k07Go = C.at; g._k07Sp = g.speed;
          g.anchor = { x: c.x, z: c.z }; g.dest = { x: c.x, z: c.z };
        }
        g.speed = Math.max(g._k07Sp || 0, 4.4); g.order = 'move';
        // 要だけ先へ走らせず、実際の兵が曲がり角へ届いてから次へ送る。
        if (Math.hypot(g.anchor.x - c.x, g.anchor.z - c.z) > 6) { g.anchor.x = c.x; g.anchor.z = c.z; }
        wayNext(g.anchor, C.at, g.dest);
      } else if (g._k07Go) {
        g._k07Go = null; g.speed = g._k07Sp;
        g.order = C.s.kind === 'move' ? 'hold' : 'attack'; g.seekRange = 12;
        // 接敵で止まる時は今の場所から戦う。曲輪の中心へ要を飛ばさない。
        g.anchor.x = c.x; g.anchor.z = c.z;
      }
    }
  },

  // 落とした曲輪の櫓の上の射手は、寄せ手の鉄砲に撃たれて一人ずつ倒れる（下から斬れない射手が残り、味方の隊がその下に詰まっていた）
  clearPerch(rt, test) {
    let k = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && u.perch && test(u.pos)) { const v = u; rt.after(1 + k++ * 0.8, () => { if (v.alive) { v.hp = 0; rt.army.kill(v, null); } }); }
  },

  // 門を開ける（破る・内から開ける）。開いた門は当たりを抜く
  openGate(rt, id) {
    const F = rt.flags;
    if (F.gateOpen[id]) return;
    F.gateOpen[id] = true;
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
        if (hold) for (const g of [F.mine, F.saki, F.hasegawa]) if (g && g.count && !g.routed) { g.order = 'attack'; g.anchor = { x: D.cur.at.x, z: D.cur.at.z }; g.seekRange = Math.max(g.seekRange || 0, 30); }
        sfx('gateBreakWood', 0.8);
        rt.say(s.say[0], s.say[1], 3);
      }
    }
  },

  // 十八日の夜明け
  dawn(rt) {
    const F = rt.flags;
    if (F.day18) return;
    F.day18 = true; F.dusk = false; F.night = false;
    rt.world.setTime('morning');
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
    rt.after(3.5, () => { for (const u of (F.tsugu?.units || []).slice()) if (u.alive) rt.army.despawn(u); });
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
    // 締め（十五秒）：視点は主人公に任せ、落城の字と台詞を見せてから結果へ。
    //   共通の「合戦に勝利」の札は finish で出て、落城の字の上に重なって隠していたので、finish は字と台詞の後に呼ぶ
    const say = (t, f) => rt.after(t, () => { if (!rt.over) f(); });
    say(0.3, () => { if (!F.touun) { F.touun = true; rt.say('土田東雲斎', '蔵の金銀を撒け。殿の御最期の時を稼ぐのじゃ', 3.4); } });
    say(3.9, () => rt.say(nm(rt), '天守に火が！　正継殿・正澄殿・朝成殿は、天守で腹を召されたと', 3.8));
    say(4.2, () => rt.banner('佐和山城、落城', '慶長五年九月十八日　天守に火が回る'));
    say(8.2, () => rt.say('小早川秀秋', '……治部は城に戻れなんだ。主のおらぬ城を、我らは落としたのよ', 4));
    say(12.4, () => rt.banner('正継・正澄・朝成、天守に果つ', '二日の戦で佐和山城は落ちた'));
    // 確かめの紙 Y6 の伝えを、秀秋の言葉の後、結果へ移る前に届ける。
    say(12.4, () => rt.say('小早川の侍', '女たちは、本丸の下の谷へ身を投げたと……', 2.8));
    // 11/8：寄せ手の大軍が城へ押し出す。「三成はおらぬ・逃げたか」は共通の落城の流れ（castle_fall_data.js）が finish の後に出す
    say(9, () => hoi.advance(rt));
    // 主の任務の済みも締めの直前に（共通の goalsDoneTick は主の任務が済んで二秒半で勝ちに締め、締めの十五秒を切っていた）
    rt.after(15.3, () => {
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
    depthTick(rt, dt);
    tickTabas(rt, dt);
    if (F.rocks) F.rocks.tick(dt);
    const D = F.dp;
    this.gates(rt, dt);
    if (D && D.on && D.i >= 7) { this.tanaka(rt); this.tanakaIn(rt); }
    this.hurry(rt);
    this.sumiTick(rt);
    this.udaTick(rt);
    // 本丸の旗本は本丸の天守の前の広場を守り、本丸の門の外（二の丸）へ打って出ない。前は 'attack' で四十歩下の二の丸まで出て、
    //   主人公が本丸に一度も入らないまま⑤が済んだ（11/6 描いて遊んだ二回とも）
    //   二の丸の下・上の守りも、開門後は段の内に留める。三の丸の出口へ突進して門前の寄せ手を囲まない。
    //   宇多の隊も同じく、二の丸の門が破れた後は二の丸の上の段に留まる（本丸の西の口から本丸の内へ下がり、④が二百秒を超えた・11/6 流し）
    const holdAt = D && D.on && D.cur?.groups ? (D.i === 8 ? HON_YARD : D.i === 5 && F.gateOpen.ni3_n ? NI3 : D.i === 6 && F.gateOpen.ni1_n ? NI1 : null) : null;
    // 共通の段の誘導が遠ざかった隊を攻めへ戻しても、守備の命令を保つ。
    if (holdAt) for (const g of D.cur.groups) if (g.count && !g._udaLost) {
      if (!g._k07Hold) { g._k07Hold = true; g.anchor = { x: holdAt.x, z: holdAt.z }; }
      g.order = 'hold'; g.anchor.x = holdAt.x; g.anchor.z = holdAt.z; g.aggro = D.i === 5 ? 5 : 9; g.seekRange = g.aggro;
    }
    // 櫓門の上の射手（中の窓の場所が無く、屋根の瓦の上に立っていた）は置かない。横矢は左右の隅櫓の窓から（十一の2・十一の3）
    if (!F.gatePerchOff && rt.perch?.started) {
      F.gatePerchOff = true;
      for (const p of rt.perch.posts) if (p.kind === 'gate' && !(p.spots && p.spots.length) && p.group) for (const u of p.group.units.slice()) if (u.alive) rt.army.despawn(u);
    }
    // 城方の数の棒：城方の本物の兵の延べ（討った数＋今いる数）から、二千八百の減り方を決める（前は二十五人ずつ引き、③の初めに 0 になった）
    if ((F.eT || 0) <= rt.t) { F.eT = rt.t + 1; let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.isStruct) n++; F.eMax = Math.max(F.eMax || 0, (F.ek || 0) + n); }
    // 十七日の夜：長谷川の手引きで三の丸を夜のうちに攻める（夜の戦は夜に）
    if (D && D.on && D.i >= 2 && D.i < 4 && !F.night) { F.night = true; rt.world.setTime('night'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
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
  // groups から討った数と隊の全員を数える。空の count を置くと共通の人数表示まで止まる。
  return list.map((g, k) => Object.defineProperty({ kind: 'stage', k, ...g }, 'sec', { get: () => (rt._g5?.goals?.length ? 0 : 1), enumerable: true }));
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
k07_sawayama.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  // 尾根の上の段（二の丸・本丸）では、斬り合いの場へ城の道（二の丸の奥の口→本丸の門）を通って行く。真っ直ぐ向かうと本丸の石垣に当たって外を回り、
  //   本丸に一度も入らないまま⑤が済んだ（11/6 描いて遊んだ二回とも）
  const D = F.dp, C = D && D.on && D.cur;
  // 守りが崩れた後は追撃を止め、曲輪の中まで登る。一度入って外へ出た時も戻る。
  if (C && C.s.kind === 'fight' && C.k07Cleared && !C.k07Inside) {
    const q = sawayamaWay(b.army, u, C.at);
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
    goTo(p, inp, q.x, q.z, 1.5); inp.runHeld = true;
    return;
  }
  if (C && C.s.kind === 'fight' && D.i >= 5 && C.goal && !b.army.nearestEnemy(u, 7, (o) => !o.fleeing && !o.noTarget && !o.perch && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    // ④（二の丸の上の段）で本丸の門の前（南）まで上がってしまった時は、二の丸の中へ戻る（11/9 流し：本丸の門の前で矢を受けながら八分立ち往生）
    //   門の外（北）の口で立ち止まった時も、門をくぐって中へ（11/9 流し：破れた門の外で九分矢を受けていた）
    const back = D.i === 6 && (u.pos.z > -27 || (u.pos.z < -39.5 && u.pos.z > -52 && Math.abs(u.pos.x + 8) < 9 && rt_gateOpen(b, 'ni1_n')));
    const want = back ? { x: NI1.x, z: NI1.z } : { x: C.goal.x, z: C.goal.z }, q = sawayamaWay(b.army, u, want);
    // 曲輪へ戻る時も、前の斬り合いの後退・横移動・攻撃を残さない。
    if ((back && q === want) || (q !== want && q.active)) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false;
      goTo(p, inp, q.x, q.z, 1.5); inp.runHeld = true; return;
    }
  }
  // 大手と三の丸（D.i < 5）は開けた曲輪：曲輪の奥で構える守りへ自分から寄る（11/9 流し：入口に立ったまま、三十歩奥の守りに新手が足され続けて五分かかった）
  // 塀・枡形の向こうの敵は追わず、門を通る段の動きへ任せる。それでも五秒動けない時は、八秒は追わずに段の動き（depthBot）へ任せる（11/9 流し：大手の枡形の前で十五分）
  const SB = F._sb || (F._sb = { x: u.pos.x, z: u.pos.z, t: b.t, off: 0 });
  if (Math.hypot(u.pos.x - SB.x, u.pos.z - SB.z) > 1.5) { SB.x = u.pos.x; SB.z = u.pos.z; SB.t = b.t; }
  else if (b.t - SB.t > 5 && b.t > SB.off) { SB.off = b.t + 8; SB.t = b.t; }
  if (C && C.s.kind === 'fight' && D.i < 5 && b.t > SB.off) {
    const e = b.army.nearestEnemy(u, 50, (o) => !o.fleeing && !o.noTarget && !o.perch && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 4 && !b.army.wallBetween(u.pos, u.team, o.pos, false));
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

export { k07_sawayama };
export default k07_sawayama;
