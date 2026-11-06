// ======================================================================
// 徳川編 7　佐和山城の戦い（慶長五年 1600・九月十七日払暁〜十八日）　関ヶ原のすぐ後の山城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「7. 佐和山城」
// 三成は関ヶ原で敗れて城にいない（ボスにしない）。城は父の石田正継、兄の正澄と子の朝成、舅の宇多頼忠ら二千八百ほどが守る。
// 小早川秀秋・脇坂安治は東の大手（東山道・鳥居本の側）から、田中吉政は西の搦手（琵琶湖・松原内湖の側）から攻め、
// 十八日に城内の長谷川守知が裏切って東軍を引き入れ、城は落ちた。主人公は小早川勢の先手に付き大手から攻める。
// 段（史実の時刻順）：①十七日払暁、大手の切り通しで石田勢を討つ → 日暮れの止み、三の丸の長谷川守知が城を出て小早川の先陣になる
//   ②その夜、長谷川の手引きで三の丸の石田正澄を討つ → 十八日の明け ③二の丸の下の段 ④二の丸の上の段の宇多頼忠
//   ⑤本丸（田中吉政が搦手の水の手から乱入）→ 正継・正澄・朝成は天守で自害（『石田軍記』の炎上の説。開城に近いとの説は battle_learn に）
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
import { nobori, jinmaku, kagaribi, tenshu, sumiyagura } from './props.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { horiboriHeight, mizubori } from './castle_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { revealName } from './battle_intel.js';

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
const LIMIT = 1050;                      // 十八日の日が暮れ切るまで（秒）。共通の打ち切り（battle_pacing の 1080 秒）より先にこの戦の言葉で締める。段ごとに b_depth の時間がある（AP の8）

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
const MOAT_O = { depth: 2.6, width: 12 };
const DIPS = [
  ...MOAT.map((p) => horiboriHeight(p, MOAT_O)),
  horiboriHeight([[16, -16], [16, 14]], { depth: 3, width: 8 }),
  horiboriHeight([[-22, -128], [22, -128]], { depth: 4, width: 9 }),
  horiboriHeight([[-26, 86], [16, 86]], { depth: 4, width: 9 }),
];

const ISHIDA = { armor: 0x2e2a24, lace: 0x2a3040, flag: 'ishida' };   // 黒の具足に紺の縅（紫は使わない）
const KOBA = { flag: 'kobayakawa' };
const WAKI = { flag: 'wakisaka' };     // 脇坂の輪違い
const TANAKA = { flag: 'maru' };       // 田中吉政（家紋が確かでないので丸）
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
  // 櫓：大手門の左右（土橋と内堀へ横矢）、三の丸の門の脇、本丸の東の隅
  yagura: [
    { id: 'ote_n', kind: 'monomi', at: [112, -20], rot: Math.PI / 2, boarded: true },
    { id: 'ote_s', kind: 'monomi', at: [112, 20], rot: Math.PI / 2, boarded: true },
    { id: 'san_e', kind: 'monomi', at: [14, -114], rot: Math.PI / 2 },
    { id: 'hon_ne', kind: 'sumi', at: [0, -14], rot: Math.PI / 2 },
    { id: 'hon_se', kind: 'sumi', at: [0, 12], rot: Math.PI / 2 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }],
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
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, 'kobayakawa', 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  // 石田の旗：大手の土塁の上・三の丸・二の丸・本丸・西の丸・南の尾根の太鼓丸と法華丸
  for (const [x, z] of [[114, -10], [114, 10], [90, 18], [12, -100], [-2, -112], [-14, -80], [-14, -56], [-14, -34], [-18, -12], [-2, 8], [-48, -10], [-16, 30], [-4, 38], [-12, 60], [4, 70]]) rt.scene.add(nobori(W, x, z, 'ishida', 5));
  for (const [x, z] of [[OTE.x - 6, OTE.z + 6], [SAN.x + 4, SAN.z - 4], [NI1.x + 6, NI1.z], [HON.x + 8, HON.z - 8], [TAIKO.x + 6, TAIKO.z]]) rt.scene.add(kagaribi(W, x, z));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92, dmg: o.dmg ?? 0.28, ...(o.noRout ? { noRout: o.noRout } : {}) });

const k07_sawayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。佐和山：九月半ばの山城。乾いた土と落ちた矢・槍、秋の草
  timeslip: {
    wet: 0.15, dust: 0.5, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x9a9a60, grassTints: [0xffffff, 0xeadcb0, 0xd0c898], grassH: 1.05, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を八人討つ」で埋めない・三の1）
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が続けての太刀で倒れて負けた）
  noWake: true,
  minutes: 25,
  world: {
    seed: 1600921,
    time: 'morning',   // 十七日の払暁から攻めた
    groundHalf: 280,
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
      if (x > 10 && x < 134 && Math.abs(z) < 34) return 0.15;
      return 1.1;
    },
    groves: [{ x: 110, z: 74, r: 16, n: 20, kind: 'sugi' }, { x: 70, z: -50, r: 16, n: 20, kind: 'sugi' }, { x: -40, z: 30, r: 18, n: 24, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? x < -125 || z < -170 || z > 150 : x > 215),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, buildGates: true, buildTowers: true, interiorGuards: false });
    // 門は開けたまま（城方が打って出た所。道の流れを止めない）。櫓と櫓門の上には石田の鉄砲・弓が立つ（横矢）
    for (const g of Object.values(F.C.gateObjs || {})) for (const d of [g, g.outer, g.inner]) if (d && d.struct) { d.open && d.open(); Object.assign(d.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    // 大手の内堀（水）。土橋の所だけ掘り残す
    for (const p of MOAT) mizubori(rt, p, MOAT_O);
    // 佐和山の頂の五重の天守（三成の居城。「三成に過ぎたるもの」の一つ。三成の頃の望楼の形）と、西の丸の塩硝櫓。大手の田から谷戸の奥の山の上に城が見える
    try {
      rt.scene.add(tenshu(W, HON.x - 4, HON.z + 2, { floors: 5, b: 11, base: 3.4, borou: true, old: true, rot: Math.PI / 2, team: 1, name: '佐和山城の天守', where: '本丸の天守' }));
      rt.scene.add(sumiyagura(W, NISHI.x - 6, NISHI.z - 6, { w: 5, d: 4.4, base: 0.6, rot: Math.PI / 2 }));
    } catch (e) { console.warn(e); }
    farSight(rt.scene.children.slice(castle0), { W, ground: { x: 20, z: -20, r: 100 } });
    flags(rt);
    // 見せかけの軍勢は置かない（AA・AF・AQ6）。見える兵は全部本物
    // ---- 東軍：自分の手勢と脇坂の先手。総大将の秀秋は寄せ口の後ろの本陣で、侍の旗本に囲まれて動かない（O・AR3） ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '小早川秀秋の本陣', anchor: { x: START.x + 20, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: false } }, { type: 'samurai', n: 20 }], KOBA));
    F.hide = F.honjin.units.find((u) => u.name === '小早川秀秋');
    if (F.hide) F.hide._crouch = true;   // 総大将は床几に腰を下ろす（O・AR3）
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], KOBA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '脇坂安治の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }], WAKI));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('main', '大手から佐和山城へ攻め上り、山の頂の本丸を落とせ', 'main');
    // 戦の前
    rt.say('小早川秀秋', '関ヶ原は終わった。残るは治部（三成）の本拠、佐和山じゃ', 4.5);
    rt.after(5, () => rt.say(nm(rt), '治部少輔はおらぬと聞きます。城には誰が', 3.5));
    rt.after(9, () => rt.say('脇坂安治', '治部の父の正継、兄の正澄ら。二千八百ほどが籠もっておる', 4));
    // 城の守り手の名は始めに脇坂が告げる（右上の目標の名を「見えぬ敵の陣を物見する」に伏せない）
    for (const n of ['石田正継', '石田正澄', '石田朝成', '宇多頼忠']) rt.after(9, () => revealName(rt, n));
    rt.after(13.5, () => rt.say('小早川秀秋', '内府（家康）様は南の正法山に陣を取られた。田中殿は搦手、我らは大手じゃ。かかれ！', 4));
    rt.after(18, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    this.south(rt);
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'ishida', flag: 'ishida', armor: ISHIDA.armor, friends: () => [F.mine, F.saki, F.hasegawa], look: (list) => dress(list, ISHIDA), scale: 1.7, backing: false, fixedSpawn: true, dmg: 0.4, botSeek: 40,
      botFoeAllowed: (o) => !o.perch }, [   // 櫓の上の射手は下から斬れない（追うと塀の下に詰まって段が進まなかった）
      // ① 大手門を破る
      DP.fight({ at: OTE, title: '大手門', sub: '内堀と土塁の奥に枡形の門', obj: '大手門の前の石田勢を討て', max: 150,
        say: [['脇坂の侍', '櫓と土塁の上から鉄砲と矢じゃ！　土橋を駆け抜けよ'], ['小早川の侍', '先手が谷へ撃ち落とされておる。土塁の陰を伝え']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }])],
        later: [{ t: 40, say: ['小早川の侍', '侍屋敷から石田の新手が打って出たぞ！'], foes: () => [keep('侍屋敷の石田勢', { x: 96, z: -18 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }])] },
          // 老兵の福島次郎作は矢が尽きても他人の矢を拾って射続けた（『佐和山落城記』）
          { t: 75, foes: () => [], say:['脇坂の侍', '櫓の上の老いた弓取り、矢が尽きても拾うて射てくる！'] }],
        reward: '大手門を破った' }),
      // 十七日の日暮れ：攻めは止み、三の丸を受け持つ大坂の援兵・長谷川守知が兵を連れて城を出て、小早川の先陣に付く（内応）
      DP.rest({ dur: 9, heal: 0.7, fn: (rt2) => this.dusk(rt2),
        say: [['小早川の侍', '日が暮れた。攻めは止みじゃ'], ['小早川秀秋', '三の丸から長谷川守知の手が出てくる。岡野殿の申された通りじゃ。通してやれ', 4.2]] }),
      DP.move({ to: { x: 82, z: -42 }, obj: '侍屋敷の北の口を抜け、三の丸の尾根の下へ行け', label: '三の丸の尾根', r: 8, max: 90,
        ambush: { d: 30, say: ['小早川の侍', '侍屋敷の陰に伏兵じゃ！'], foes: () => [keep('侍屋敷の伏兵', { x: 90, z: 8 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      // ② 三の丸
      DP.fight({ at: SAN, title: '三の丸', sub: '北の尾根の先に石田正澄', obj: '三の丸の石田正澄の隊を討て', max: 180,
        say: [['長谷川守知', '三の丸の勝手は知っておる。我らが先に立つ'], ['石田正澄', '長谷川め、裏切ったか。石田木工頭正澄これにあり。一歩も通すな！']],
        foes: () => [keep('三の丸の守り', SAN, [{ type: 'busho', n: 1, o: { name: '石田正澄', hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 98 })],
        later: [{ t: 35, say: ['石田正澄', '大坂の鉄砲衆、櫓から撃ちかけよ！'], foes: () => [keep('大坂の鉄砲衆', { x: SAN.x - 6, z: SAN.z - 8 }, [{ type: 'gun', n: 5 }, { type: 'bow', n: 3 }, { type: 'samurai', n: 1 }])] }],
        reward: '三の丸を落とした' }),
      // 十八日の明け：残るは二の丸と本丸
      DP.rest({ dur: 6, heal: 0.7, fn: (rt2) => this.dawn(rt2), say: [['小早川秀秋', '夜が明けた。残るは二の丸と本丸じゃ。一気に攻め上れ']] }),
      // ③ 二の丸の三段
      // 三の丸が落ちると、本丸のほかの曲輪は次々と落ちた（歴史街道）。二の丸の二つの段は新手を足さず、居る兵を討てば次へ
      DP.fight({ at: NI3, title: '二の丸', sub: '尾根の段を一つずつ落とす', obj: '二の丸の下の段の石田勢を討て', max: 160, noRefill: true,
        say: [['小早川の侍', '三の丸は落ちた。二の丸の段を一つずつ落とせ']],
        foes: () => [keep('二の丸の下の段の守り', NI3, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { seek: 22, noRout: 40 })],   // 一人討たれて皆逃げ、斬り合わずに段が済んだ（九の2）。四十秒は段の口で踏みとどまる
        reward: '二の丸の下の段を落とした' }),
      DP.fight({ at: NI1, title: '二の丸の上の段', sub: '本丸の石垣の下', obj: '二の丸の上の段の宇多頼忠の隊を討て', max: 160, noRefill: true,
        say: [['宇多頼忠', '婿どのの城じゃ。この老骨が二の丸を守る']],
        foes: () => [keep('宇多頼忠の隊', NI1, [{ type: 'busho', n: 1, o: { name: '宇多頼忠', hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 4 }], { morale: 98, seek: 22 })],   // 持ち場の段を離れて南の太鼓丸の寄せ手まで追わない
        reward: '二の丸を落とした' }),
      // 本丸から開城の使い：正継は一族の自害と引き替えに城の者を助けよと申し出た（歴史街道）。その最中に田中勢が水の手から乱入する（説）
      DP.rest({ dur: 12, heal: 0.7, fn: (rt2) => this.tanaka(rt2),
        say: [['小早川の侍', '本丸から使いじゃ。正継殿は一族の腹と引き替えに、城の者を助けよと', 4.2], ['小早川秀秋', '……よかろう。城を開けさせよ', 3.4]] }),
      // ④ 本丸の天守
      DP.fight({ at: HON_YARD, title: '本丸', sub: '佐和山の頂、石垣と五層の天守', obj: '本丸へ攻め入り、天守の前の石田朝成の隊を討て', max: 200, noRefill: true,   // 十八日は開城の約束の後の乱入で、本丸は短い斬り合いで終わった
        say: [['小早川の侍', '本丸の門じゃ。城を受け取りに上れ']],
        onEnd: (rt2) => this.burn(rt2),
        foes: (rt2) => { this.tsugu(rt2); return [keep('本丸の旗本', HON_YARD, [{ type: 'busho', n: 1, o: { name: '石田朝成', hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 12 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], { morale: 100, seek: 22 })]; },
        reward: '本丸に攻め入った' }),
    ], (rt2) => this.win(rt2));
  },

  // 本丸の奥：城の総大将の石田正継は天守の前で床几に座り、侍の旗本に囲まれて動かない（O・AR3）。旗本が崩れると自害する（史実）
  tsugu(rt) {
    const F = rt.flags;
    if (F.tsugu) return;
    F.tsugu = enemyGroup(rt, { fixed: true, faction: 'ishida', name: '石田正継の旗本', anchor: { x: HON.x - 12, z: HON.z + 6 }, facing: -Math.PI / 2, order: 'hold', aggro: 4, seekRange: 10, width: 8, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '石田正継', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'samurai', n: 10 }], ISHIDA));
    const u = F.tsugu.units.find((v) => v.name === '石田正継');
    if (u) u._crouch = true;
  },

  // 田中吉政の手：十八日、搦手（西・琵琶湖の側）の水の手から西の丸を抜け、本丸の西の口へ乱入する（説）
  tanaka(rt) {
    const F = rt.flags;
    if (F.tanaka) return;
    F.tanaka = allyGroup(rt, { faction: 'oda', name: '田中吉政の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: 0, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 60 },
      dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TANAKA));
    // 水の手から西の丸の尾根を登り、西の丸を抜けて本丸の西の口へ（まっすぐ寄せると西の丸の土塁の下に詰まった）
    F.tanaka.order = 'path'; F.tanaka.path = [[-80, -8], [-62, -4], [-48, -4], [-34, -4], [-24, -4], [HON.x - 6, HON.z - 6]]; F.tanaka.pathIdx = 0;
    F.tanaka.dmgMult = 0.7;
    F.tanakaT = rt.t;
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z - 4, 'maru', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  // 田中勢が本丸の西の口に着いたら乱入を告げる（言った物が本当にそこにいる）
  tanakaIn(rt) {
    const F = rt.flags;
    if (F.tanakaIn || !F.tanaka) return;
    const since = rt.t - (F.tanakaT ?? rt.t);
    if (since < 6) return;   // 出たばかりの兵の位置はまだ定まらない。使いの話の後に告げる
    const near = F.tanaka.units.some((u) => u.alive && u.pos.x < -14 && Math.hypot(u.pos.x - HON.x, u.pos.z - HON.z) < 26);
    if (!near && since < 45) return;
    F.tanakaIn = true;
    F.tanaka.order = 'attack'; F.tanaka.anchor = { x: HON_YARD.x, z: HON_YARD.z };
    rt.say('田中吉政', '水の手は田中が破った。本丸へ乗り込め', 3.4);
    rt.after(3.8, () => rt.say('石田正継', '……内府も念の入ったことよ', 3.6));
    rt.after(7.8, () => rt.say('石田朝成', '約束を違えたか。祖父上、天守は我らが守りまする！', 3.6));
  },

  // 十七日の日暮れ：攻めが止み、三の丸の長谷川守知が兵を連れて城を出て、尾根を下って小早川の先陣に付く（言った物が本当にそこにいる。AT の1）
  dusk(rt) {
    const F = rt.flags;
    if (F.hasegawa) return;
    F.dusk = true;
    rt.world.setTime('dusk');
    this.clearPerch(rt, (p) => p.x > 70);   // 大手門と左右の櫓
    // 三の丸の門と櫓の上は長谷川が受け持った大坂の鉄砲衆。日暮れに長谷川と共に櫓を降りて城を出る（主人公は大手にいて見えない）。
    //   残すと下から斬れない射手の下に寄せ手が詰まり、三の丸へ入れなかった
    const A = rt.army;
    for (const u of A.units.slice()) if (u.alive && u.team === 1 && u.perch && u.pos.z < -90) {
      A.scene.remove(u.mesh); A.units.splice(A.units.indexOf(u), 1);
      if (u.group) u.group.units.splice(u.group.units.indexOf(u), 1);
      u.alive = false; u.gone = true;
    }
    F.hasegawa = allyGroup(rt, { faction: 'oda', name: '長谷川守知の手', anchor: { x: 20, z: -102 }, facing: Math.PI / 2, width: 8, aggro: 6, noRout: true, order: 'attack', seekRange: 20, fixed: true },
      dress([{ type: 'busho', n: 1, o: { name: '長谷川守知', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 6 }], TANAKA));
    F.hasegawa.anchor = { x: 76, z: -52 };
  },

  // 味方の手は自分と同じ速さで次の持ち場へ（九の4・一の5）。持ち場まで遠く、近くに敵がいない間は隊のまま駆け足で進み、着くか敵に当たれば攻めに戻る
  hurry(rt) {
    const F = rt.flags, C = F.dp && F.dp.on && F.dp.cur;
    if (!C || !C.at || C.s.kind === 'rest' || (F.hurryT || 0) > rt.t) return;
    F.hurryT = rt.t + 1;
    for (const g of [F.mine, F.saki, F.hasegawa]) {
      if (!g || !g.count || g.routed) continue;
      const c = g.center(), d = Math.hypot(c.x - C.at.x, c.z - C.at.z);
      const foe = rt.army.units.some((o) => o.alive && o.team === 1 && !o.fleeing && !o.noTarget && !o.perch && (o.pos.x - c.x) ** 2 + (o.pos.z - c.z) ** 2 < 400);
      if (!g._k07Go && d > 28 && !foe) { g._k07Go = { x: C.at.x, z: C.at.z }; g._k07Sp = g.speed; g.speed = Math.max(g.speed || 0, 4.4); g.order = 'move'; g.anchor = { x: c.x, z: c.z }; g.dest = { x: c.x, z: c.z }; }
      if (g._k07Go && (d < 14 || foe || Math.hypot(g._k07Go.x - C.at.x, g._k07Go.z - C.at.z) > 1)) { g._k07Go = null; g.speed = g._k07Sp; g.order = C.s.kind === 'move' ? 'hold' : 'attack'; g.seekRange = 45; g.anchor = { x: C.at.x, z: C.at.z }; }
      // 隊の要は尾根の道の曲がり角を一つずつ（まっすぐ斜面を突っ切ると、曲輪の土塁の下に詰まった）
      else if (g._k07Go) wayNext(g.anchor, C.at, g.dest);
    }
  },

  // 落とした曲輪の櫓の上の射手は、寄せ手の鉄砲に撃たれて一人ずつ倒れる（下から斬れない射手が残り、味方の隊がその下に詰まっていた）
  clearPerch(rt, test) {
    let k = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && u.perch && test(u.pos)) { const v = u; rt.after(1 + k++ * 0.8, () => { if (v.alive) { v.hp = 0; rt.army.kill(v, null); } }); }
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
    for (const [x, z, s] of [[HON.x, HON.z, 2.6], [HON.x - 8, HON.z + 6, 2], [HON.x + 6, HON.z - 6, 2.2], [NI1.x, NI1.z, 1.6], [SAN.x, SAN.z, 1.6]]) {
      if (rt.world.addFire) rt.world.addFire(x, z, { size: s, h: 2 });
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '佐和山城を落とした', pts: 40 }; }, '佐和山城が落ちた');
    sfx('horagai', 0.9);
    rt.banner('佐和山城、落城', '慶長五年九月十八日　正継・正澄、天守に果つ');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say(nm(rt), F.sumiDead ? '天守が燃えておりまする。正継殿は天守で自害、正澄殿は討ち死になされたと' : '天守が燃えておりまする。正継殿・正澄殿は、天守で自害なされたと', 4));
    rt.after(6.5, () => rt.say('小早川秀秋', '……三成は城に戻れなんだ。主のおらぬ城を、我らは落としたのよ', 4.4));
    rt.after(11, () => rt.say('脇坂安治', '城の女たちは、本丸の下の谷へ身を投げたと……', 4));
    rt.after(15.5, () => rt.say('田中吉政', '治部（三成）は伊吹の山に逃れた。我が手の者が捜し出す', 4.4));
    rt.finish({}, 20);
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
    if (F.ending) return;
    depthTick(rt, dt);
    const D = F.dp;
    if (D && D.on && D.i >= 7) { this.tanaka(rt); this.tanakaIn(rt); }
    this.hurry(rt);
    // 十七日の夜：長谷川の手引きで三の丸を夜のうちに攻める（夜の戦は夜に）
    if (D && D.on && D.i >= 2 && D.i < 4 && !F.night) { F.night = true; rt.world.setTime('night'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('小早川の侍', '西の空が赤い！　日が暮れる、急げ', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '石田朝成') rt.award((t) => { t.special = { label: '石田朝成を討ち取った', pts: 30 }; }, '石田朝成を討ち取った');
    if (v.name === '宇多頼忠') rt.award((t) => { t.special = { label: '宇多頼忠を討ち取った', pts: 20 }; }, '宇多頼忠を討ち取った');
    if (v.name === '石田正澄') F.sumiDead = true;
    if (v.name === '石田正澄') rt.award((t) => { t.special = { label: '石田正澄を討ち取った', pts: 20 }; }, '石田正澄を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k07_sawayama.force = (rt) => ({ a: Math.round(15000 - (rt.flags.ak || 0) * 20), a0: 15000, b: Math.max(0, 2800 - (rt.flags.ek || 0) * 25), b0: 2800 });
k07_sawayama.sides = { a: { name: '東軍', mon: 'kobayakawa' }, b: { name: '石田方', mon: 'ishida' } };
k07_sawayama.date = (rt) => (rt.flags.day18 ? '慶長五年（1600）九月十八日　秋・朝' : rt.flags.night ? '慶長五年（1600）九月十七日　秋・夜' : rt.flags.dusk ? '慶長五年（1600）九月十七日　秋・日暮れ' : '慶長五年（1600）九月十七日　秋・払暁');
k07_sawayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k07_sawayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k07_sawayama.history = '慶長五年（1600）九月十五日、関ヶ原で西軍が敗れると、東軍は三成の本拠・佐和山城へ向かった。城は琵琶湖を見下ろす佐和山の頂に五層の天守を持つ山城で、三成は戻らず、父の石田正継、兄の正澄とその子の朝成、三成の舅の宇多頼忠らが二千八百ほどで守った。家康は城の南の正法山に陣を取り、小早川秀秋を先鋒に脇坂安治・朽木元綱・小川祐忠・赤座直保・田中吉政らおよそ一万五千が十七日の明け方から大手と搦手から攻めた。日暮れに攻めが止むと、三の丸を守っていた長谷川守知が兵を連れて城を出て東軍の先に立ち、十八日に城は落ちた。正継・正澄・朝成・宇多頼忠と三成の妻は自害したと伝えられ、石田家は滅んだ。三成本人は関ヶ原の後に逃れ、近江で捕らえられた。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、攻め口の細かい道筋は推定である。内応や裏切りの伝えなど、史料により異なる点もある。';
k07_sawayama.bushou = [{ name: '石田正継', g: /正継/ }, { name: '石田正澄', g: /正澄/ }, { name: '宇多頼忠', g: /頼忠/ }, { name: '石田朝成', g: /朝成/ }];

k07_sawayama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k07_sawayama = [['大手門の石田勢を討つ'], ['三の丸の石田正澄を討つ', dpAt(3)], ['二の丸の下の段を落とす', dpAt(5)], ['二の丸の上の段の宇多頼忠を討つ', dpAt(6)], ['本丸の天守の前の石田朝成を討つ', dpAt(8)]];

export { k07_sawayama };
export default k07_sawayama;
