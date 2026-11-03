// ======================================================================
// 徳川編 7　佐和山城の戦い（慶長五年 1600・九月十八日〜二十日）　関ヶ原のすぐ後の山城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「7. 佐和山城」
// 三成は関ヶ原で敗れて城にいない（ボスにしない）。城は父の石田正継、兄の正澄、子の重成ら二千八百ほどが守る。
// 小早川秀秋・脇坂安治は東の大手（東山道・鳥居本の側）から、田中吉政は西の搦手（琵琶湖・松原内湖の側）から攻め、
// 十八日に城内の長谷川守知が裏切って東軍を引き入れ、城は落ちた。主人公は小早川勢の先手に付き大手から攻める。
// 段：①大手門を破る ②三の丸の石田正澄を崩す ③二の丸の三段を登る ④本丸の天守を落とす（正継は自害）
// 負け方：日が暮れ切る（七分）。
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
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { horiboriHeight, mizubori } from './castle_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';

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
const NISHI = { x: -48, z: -4 };         // 西の丸（塩硝櫓）
const TAIKO = { x: -10, z: 34 };         // 太鼓丸（南の尾根・本丸の手前）
const HOKKE = { x: -4, z: 64 };          // 法華丸（南の尾根の先）
const KARAME = { x: -100, z: -10 };      // 搦手（琵琶湖の側）から田中勢が出てくる所
const LIMIT = 420;                       // 日が暮れ切るまで（秒）

// 大手の道：田から土橋を渡り枡形の大手門、侍屋敷の谷戸を北へ抜け、北の尾根を三の丸へ、尾根伝いに二の丸の三段、本丸へ
const ROUTE = [
  [170, 0], [START.x, START.z], [140, 0], [128, 0], [116, 0], [112.5, -0.5], [113, -4.5], [113, -9], [106, -14], [86, -26], [82, -42],
  [70, -64], [52, -86], [34, -100], [18, -106], [SAN.x, SAN.z], [-8, -96], [-8, -84], [NI3.x, NI3.z], [-8, -72], [-8, -62],
  [-8, -56], [-8, -50], [-8, -40], [NI1.x, NI1.z], [-8, -28], [-8, -18], [HON.x, HON.z],
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

const ISHIDA = { armor: 0x2e2a24, lace: 0x4a4468, flag: 'ishida' };
const KOBA = { flag: 'kobayakawa' };
const TOKU = { flag: 'tokugawa' };
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
function routeAt(x, z, out) {
  let best = Infinity, bs = 0, bx = x, bz = z;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i], [cx, cz] = ROUTE[i + 1];
    const dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = i + t; bx = px; bz = pz; }
  }
  out.d = best; out.s = bs; out.x = bx; out.z = bz;
  return out;
}
const RF = { d: 0, s: 0, x: 0, z: 0 }, RT = { d: 0, s: 0, x: 0, z: 0 };
function sawayamaWay(army, u, want) {
  const q = u._k07Way || (u._k07Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 2.4) return q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
  routeAt(u.pos.x, u.pos.z, RF); routeAt(want.x, want.z, RT);
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

// ---- 旗と篝火：東軍の寄せ口・石田の曲輪 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 10, START.z, 12, 9, 4, { mon: 'kobayakawa' }));
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, 'kobayakawa', 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  // 石田の旗：大手の土塁の上・三の丸・二の丸・本丸・西の丸・南の尾根の太鼓丸と法華丸
  for (const [x, z] of [[114, -10], [114, 10], [90, 18], [12, -100], [-2, -112], [-14, -80], [-14, -56], [-14, -34], [-18, -12], [-2, 8], [-48, -10], [-16, 30], [-4, 38], [-12, 60], [4, 70]]) rt.scene.add(nobori(W, x, z, 'ishida', 5));
  for (const [x, z] of [[OTE.x - 6, OTE.z + 6], [SAN.x + 4, SAN.z - 4], [NI1.x + 6, NI1.z], [HON.x + 8, HON.z - 8], [TAIKO.x + 6, TAIKO.z]]) rt.scene.add(kagaribi(W, x, z));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92, dmg: o.dmg ?? 0.28 });

const k07_sawayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。佐和山：九月半ばの山城。乾いた土と落ちた矢・槍、秋の草
  timeslip: {
    wet: 0.15, dust: 0.5, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x9a9a60, grassTints: [0xffffff, 0xeadcb0, 0xd0c898], grassH: 1.05, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が続けての太刀で倒れて負けた）
  noWake: true,
  minutes: 7,
  world: {
    seed: 1600921,
    time: 'day',
    groundHalf: 280,
    paths: [ROUTE.slice(0, 10), ROUTE.slice(9)],
    height,
    moveWay: sawayamaWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 麓は刈り入れ前の田（秋）
      if (h < 4 && x > 134) { c.setRGB(c.r * 0.6 + 0.26, c.g * 0.6 + 0.22, c.b * 0.5 + 0.06); return; }
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
    // 麓に控える東軍の大軍（軽い作り）と、山肌に並ぶ石田の旗
    W.addDistantArmy({ x: START.x + 40, z: START.z - 4, w: 50, d: 36, count: 380, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'kobayakawa', seed: 16001 });
    W.addDistantArmy({ x: START.x + 10, z: START.z + 44, w: 36, d: 22, count: 220, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16002 });
    // 南の尾根（太鼓丸・法華丸）へ取り付く小早川の別の手。谷戸の向こうに見える
    W.addDistantArmy({ x: 60, z: 70, w: 30, d: 14, count: 140, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'kobayakawa', seed: 16003 });
    // ---- 東軍：自分の手勢と小早川の先手。秀秋は寄せ口の本陣に残る ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '小早川秀秋の本陣', anchor: { x: START.x + 8, z: START.z }, facing: -Math.PI / 2, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], KOBA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], KOBA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '脇坂安治の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], TOKU));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '日が暮れ切る前に、佐和山城を落とせ', 'main');
    // 戦の前
    rt.say('小早川秀秋', '関ヶ原は終わった。残るは治部（三成）の本拠、佐和山じゃ', 4.5);
    rt.after(5, () => rt.say(nm(rt), '治部少輔はおらぬと聞きます。城には誰が', 3.5));
    rt.after(9, () => rt.say('脇坂安治', '父の石田正継、兄の正澄ら。二千八百ほどが籠もっておる', 4));
    rt.after(13.5, () => rt.say('小早川秀秋', '田中吉政殿が搦手から回る。我らは大手じゃ。かかれ！', 3.6));
    rt.after(17.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'ishida', flag: 'ishida', armor: ISHIDA.armor, friends: () => [F.mine, F.saki], look: (list) => dress(list, ISHIDA), scale: 1.3, backing: false, fixedSpawn: true, dmg: 0.4, botSeek: 40 }, [
      // ① 大手門を破る
      DP.fight({ at: OTE, title: '大手門', sub: '内堀と土塁の奥に枡形の門', obj: '大手門の守りを崩せ', max: 60,
        say: [['脇坂の侍', '櫓の上から鉄砲じゃ！　土橋を駆け抜けよ']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }])],
        reward: '大手門を破った' }),
      DP.move({ to: { x: 82, z: -42 }, obj: '三の丸の尾根まで進め', label: '三の丸の尾根', r: 8, max: 50,
        ambush: { d: 30, say: ['小早川の侍', '侍屋敷の陰に伏兵じゃ！'], foes: () => [keep('侍屋敷の伏兵', { x: 90, z: 8 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 三の丸
      DP.fight({ at: SAN, title: '三の丸', sub: '北の尾根の先に石田正澄', obj: '三の丸の石田正澄を崩せ', max: 65,
        say: [['石田正澄', '三成の兄ここにあり。一歩も通すな！']],
        foes: () => [keep('三の丸の守り', SAN, [{ type: 'busho', n: 1, o: { name: '石田正澄', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 98 })],
        reward: '三の丸を落とした' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ③ 二の丸の三段
      DP.fight({ at: NI3, title: '二の丸', sub: '尾根の段を一つずつ落とす', obj: '二の丸の下の段を落とせ', max: 55,
        say: [['小早川の侍', '搦手に田中家の旗！　長谷川守知が内から門を開いたぞ']],
        foes: () => [keep('二の丸の下の段の守り', NI3, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 4 }])],
        reward: '二の丸の下の段を落とした' }),
      DP.fight({ at: NI1, title: '二の丸の上の段', sub: '本丸の石垣の下', obj: '二の丸を落とせ', max: 50,
        foes: () => [keep('二の丸の守り', NI1, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 3 }])],
        reward: '二の丸を落とした' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 本丸の天守
      DP.fight({ at: HON, title: '本丸', sub: '佐和山の頂、石垣と五層の天守', obj: '本丸の石田正継を追い詰めよ', max: 80,
        say: [['石田正継', '倅の城を、ただでは渡さぬ！'], ['石田重成', '父上、城に火を放ちまする！']],
        onEnd: (rt2) => this.burn(rt2),
        foes: () => [keep('本丸の守り', HON, [{ type: 'busho', n: 1, o: { name: '石田正継', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 1, o: { name: '石田重成', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], { morale: 100, seek: 30 })],
        reward: '本丸に攻め入った' }),
    ], (rt2) => this.win(rt2));
  },

  // 田中吉政の手：二の丸の段で、搦手（西・琵琶湖の側）から西の丸へ攻め上る（城内の長谷川守知の手引き）
  tanaka(rt) {
    const F = rt.flags;
    if (F.tanaka) return;
    F.tanaka = allyGroup(rt, { faction: 'oda', name: '田中吉政の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: 0, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 60 },
      dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TOKU));
    F.tanaka.anchor = { x: NISHI.x + 6, z: NISHI.z };
    F.tanaka.dmgMult = 0.7;
    rt.after(1.5, () => rt.say('田中吉政', '搦手は田中が破る。小早川殿に遅れるな', 3.4));
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z - 4, 'tokugawa', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  // 本丸の段の終わり：天守に火が回る（炎上・落城）
  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
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
    rt.banner('佐和山城、落城', '慶長五年九月　石田家、滅ぶ');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say(nm(rt), '天守が燃えておりまする。正継殿は、中で自害なされたと', 4));
    rt.after(6.5, () => rt.say('小早川秀秋', '……三成は城に戻れなんだ。主のおらぬ城を、我らは落としたのよ', 4.4));
    rt.after(11, () => rt.say('田中吉政', '治部（三成）は伊吹の山に逃れた。我が手の者が捜し出す', 4.4));
    rt.finish({}, 16);
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
    if (D && D.on && D.i >= 4) this.tanaka(rt);
    if (D && D.on && D.i >= 6 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('小早川の侍', '西の空が赤い！　日が暮れる、急げ', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '石田正継') rt.award((t) => { t.special = { label: '石田正継を追い詰めた', pts: 30 }; }, '石田正継を追い詰めた');
    if (v.name === '石田正澄') rt.award((t) => { t.special = { label: '石田正澄を討ち取った', pts: 20 }; }, '石田正澄を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k07_sawayama.force = (rt) => ({ a: Math.round(15000 - (rt.flags.ak || 0) * 20), a0: 15000, b: Math.max(0, 2800 - (rt.flags.ek || 0) * 25), b0: 2800 });
k07_sawayama.sides = { a: { name: '東軍', mon: 'kobayakawa' }, b: { name: '石田方', mon: 'ishida' } };
k07_sawayama.date = (rt) => (rt.flags.dusk ? '慶長五年（1600）九月　秋・夕暮れ' : '慶長五年（1600）九月　秋・昼');
k07_sawayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k07_sawayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k07_sawayama.history = '慶長五年（1600）九月十五日、関ヶ原で西軍が敗れると、東軍は三成の本拠・佐和山城へ向かった。城は琵琶湖を見下ろす佐和山の頂に五層の天守を持つ山城で、三成は戻らず、父の石田正継、兄の正澄、子の重成らが二千八百ほどで守った。小早川秀秋・田中吉政・脇坂安治・朽木元綱らおよそ一万五千が大手と搦手から攻め、十八日に城内の長谷川守知が裏切って東軍を引き入れ、城は落ちた。正継と正澄は自害したと伝えられ、石田家は滅んだ。三成本人は関ヶ原の後に逃れ、近江で捕らえられた。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、攻め口の細かい道筋は推定である。内応や裏切りの伝えなど、史料により異なる点もある。';
k07_sawayama.bushou = [{ name: '石田正継', g: /正継/ }, { name: '石田正澄', g: /正澄/ }];

k07_sawayama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k07_sawayama = [['大手門を破る'], ['三の丸の石田正澄を崩す', dpAt(2)], ['二の丸の三段を登る', dpAt(3)], ['本丸の天守を落とす', dpAt(5)]];

export { k07_sawayama };
export default k07_sawayama;
