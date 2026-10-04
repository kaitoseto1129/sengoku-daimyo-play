import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　小谷城の戦い（天正元年八月〜九月）　docs/late6-1573-1575-spec.md 14〜37章
// 刀根坂で朝倉を破った信長は、その足で北近江の小谷城を囲んだ。羽柴秀吉は夜、清水谷から尾根の真ん中の
// 京極丸へ攻め上り、南の本丸（浅井長政）と北の小丸（父の久政）とを切り離した。
// 足軽は羽柴秀吉の手。①清水谷（浅井の居館と屋敷の谷）を登る ②京極丸を取る ③分断：両方からの寄せを受ける
// ④小丸へ攻め上がる（久政の最期） ⑤本丸から出されたお市の方と三人の姫の一行を、谷の織田の陣まで供する
// （長政の最期は史実の文で）。そのあいだ南の大手では、織田の本隊が番所→御茶屋→御馬屋→桜馬場→黒金御門と
// 一段ずつ攻め上がっていく（遠景の合戦）。「本丸を取れば終わり」でなく、城の真ん中を割って崩す戦。
// 縄張りは castles/odani.js（梯郭の曲輪・大堀切・門・櫓・清水谷の道）。大将格（長政・久政）は前線に出さない。
// 向き：主尾根は南北（北 -z が高い）。清水谷は尾根の西（-x）。信長の本陣（虎御前山）は南の遠く。
// ======================================================================
import * as THREE from 'three';
import { yokoyaZa, hiddenGunNest, takaDorui, nobori, hut, campfire, koshi, ishigaki, kagaribi, umatsunagi, dou, kabukimon, dorui, palisade, tawara, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { applyLook, dress, gone, DAWN } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
// 新しい波を出す時だけ数える。武将と供の余地を残し、遠景は本物へ替えない。
function depthLook(rt, list, style) {
  KIT.freeRoom(rt, list.reduce((n, q) => n + q.n, 0));
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.gone) room--;
  return dress(list.map((q) => {
    const n = Math.min(q.n, Math.max(0, room)); room -= n;
    return { ...q, n };
  }).filter((q) => q.n > 0), style);
}

import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
import { buildCastlePlan, heightOf, inPoly } from './castle_plan.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeNawabari } from './nawabari.js';
import { reset as flReset } from './floors.js';
import {
  ODANI_PLAN, RIDGE, crestAt, BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, SANNO2,
  UMAARAI, OHORIKIRI, GATE_KURO, GATE_NAKA_KYO, GATE_KYO_KOMA, GATE_WEST, SHIMIZU, SHIMIZU_FLOOR, CLIMB_UP, KOMA_WEST, demH, KUICHIGAI, NESTS, YOKOYA, ONOGI, AKAO, KYOKAN, TERA, YASHIKI, ROAD_RIDGE,
} from './castles/odani.js';

// 縄張りの床は回転した標高の尾根に沿わせ、清水谷と門の道だけ歩ける幅にならす。
const KC = { x: KYO.x, z: KYO.cz };                       // 京極丸の真ん中
const KOMC = { x: KOM.x, z: KOM.cz };
const HONC = { x: HON.x, z: HON.cz };
const MOUTH = { x: -93, z: 86 };   // 清水谷の中ほど（羽柴の手が集まる所。谷の口から忍んで入った）
const HEAD = { x: SHIMIZU[SHIMIZU.length - 1][0], z: SHIMIZU[SHIMIZU.length - 1][1] };   // 谷の奥
const BELOW = { x: CLIMB_UP[2][0], z: CLIMB_UP[2][1] };   // 京極丸の西の口の下
const ODA_POST = { x: -70, z: 6 };   // 谷に置いた羽柴の陣（お市の方の一行の行き先）
const CLIMB = [...SHIMIZU, ...CLIMB_UP.slice(1)];
// 谷と尾根の口を結ぶ道。組の後ろへ直進せず、曲がり角を一つずつ通す。
const ROUTE_N = [...CLIMB, [KC.x, KC.z], ...ROAD_RIDGE.filter((q) => q[1] < KC.z)];
const ROUTE_S = [...CLIMB, [KC.x, KC.z], ...ROAD_RIDGE.filter((q) => q[1] > KC.z).reverse()];
const ROUTE_W = [...CLIMB, ...KOMA_WEST];
// 大野木屋敷は南の木戸から入る。谷の兵が屋敷の横の柵へ直進しない。
const ROUTE_O = [...CLIMB.slice(0, SHIMIZU.length + 1), [-49, -77], [ONOGI.x, ONOGI.z + ONOGI.hd + 3], [ONOGI.x, ONOGI.z + 4]];
const ROUTE_FROM = { x: 0, z: 0, s: 0, d: 0 }, ROUTE_TO = { x: 0, z: 0, s: 0, d: 0 };
const ROAD_TEST = { x: 0, z: 0 };
function onRidge(p) {
  if (Math.abs(p.x) < 2.6) return true;
  for (const k of ODANI_PLAN.kuruwa) if (inPoly(k.poly, p.x, p.z)) return true;
  return false;
}
function westWay(p) { return p.x < -3 && p.z < KYO.z0 + 4 && p.z > KOM.z0; }
function roadClear(army, u, a, b) {
  if (army.wallBetween(a, u.team, b, false)) return false;
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.min(48, Math.ceil(d / 1.5));
  for (let i = 1; i <= n; i++) if (!army.world.walkable(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
  return true;
}
function roadPoint(path, p, out, army, u) {
  out.d = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d) continue;
    // 近くても塀の向こうの道には合流できない。歩ける側の候補を選ぶ。
    if (army) { ROAD_TEST.x = x; ROAD_TEST.z = z; if (!roadClear(army, u, p, ROAD_TEST)) continue; }
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
function roadWay(army, u, want) {
  const q = u._odaniWay || (u._odaniWay = { x: 0, z: 0, t: -1, active: false });
  if (q.t > army.time && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.3; q.active = false;
  if (roadClear(army, u, u.pos, want)) return want;
  // 横陣の持ち場が切岸の上にある時は、組頭のいる道へ合流する。
  // 「かかれ」の旗持ちと、指定の敵がいない者も組頭に付く。道の端の持ち場で止めない。
  const g = u.group;
  const joinPlayer = g?.isPlayerSquad && (g.order === 'follow' || g.order === 'attack' && !u.target && (u.stdHeld || !g.focus?.alive));
  const target = joinPlayer && army.playerUnit ? army.playerUnit.pos : want;
  // 西の切岸の外も x 座標だけなら尾根に見えてしまう。曲輪の内か、中央の道かで分ける。
  const inOnogi = Math.abs(target.x - ONOGI.x) < ONOGI.hw && Math.abs(target.z - ONOGI.z) < ONOGI.hd + 3;
  const ridge = onRidge(u.pos) ? u.pos : target;
  const path = u.group?.order === 'path' && u.group.path ? u.group.path : inOnogi ? ROUTE_O : westWay(u.pos) || westWay(target) ? ROUTE_W : onRidge(u.pos) && onRidge(target) ? ROAD_RIDGE : ridge.z > KC.z ? ROUTE_S : ROUTE_N;
  roadPoint(path, u.pos, ROUTE_FROM, army, u); roadPoint(path, target, ROUTE_TO);
  if (ROUTE_FROM.d > 40 || ROUTE_TO.d > 40) return want;
  q.active = true;
  if (ROUTE_FROM.d > 3) { q.x = ROUTE_FROM.x; q.z = ROUTE_FROM.z; return q; }
  const forward = ROUTE_TO.s > ROUTE_FROM.s;
  let i = forward ? Math.floor(ROUTE_FROM.s) + 1 : Math.ceil(ROUTE_FROM.s) - 1;
  i = Math.max(0, Math.min(path.length - 1, i));
  if (Math.hypot(path[i][0] - u.pos.x, path[i][1] - u.pos.z) < 1.3) i += forward ? 1 : -1;
  if (i < 0 || i >= path.length || (forward ? i > ROUTE_TO.s : i < ROUTE_TO.s)) { q.x = ROUTE_TO.x; q.z = ROUTE_TO.z; }
  else { q.x = path[i][0]; q.z = path[i][1]; }
  // 道の近くにいても、角を斜めに切ると塀に当たる。まず歩ける合流点まで寄る。
  if (!roadClear(army, u, u.pos, q) && ROUTE_FROM.d > 0.2) { q.x = ROUTE_FROM.x; q.z = ROUTE_FROM.z; }
  return q;
}
// お市の方の一行が下る道：（本丸から大堀切の土橋を渡って来た）中丸 → 京極丸 → 西の口 → 清水谷 → 谷の羽柴の陣
const ESCORT = [[0, NAKAMARU.cz], [0, KYO.cz], [GATE_WEST.x + 3, GATE_WEST.z], ...CLIMB_UP.slice(0, -1).reverse(), [SHIMIZU[4][0], SHIMIZU[4][1]], [ODA_POST.x, ODA_POST.z]];
const ESCORT_SPEED = 2.6; // 人足の走りより遅い歩調。制限時間の基準も据え置く
const ESCORT_SECONDS = ESCORT.reduce((n, p, i) => i ? n + Math.hypot(p[0] - ESCORT[i - 1][0], p[1] - ESCORT[i - 1][1]) / ESCORT_SPEED : n, 0);
const ODA = { flag: 'oda' };
const AZAI = { flag: 'azai' };
const AZ_ARMOR = 0x2e2a26, ODA_ARMOR = 0x2b3140;
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { if (!rt.flags.ending) rt.obj('main', text, 'main'); };
// 羽柴秀吉の見た目（units.js の GENERALS は「木下藤吉郎」の名で持つので、同じ兜・羽織を渡す）
const HIDE = { hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a };
// 未明（夜明け前）の色：夜の青さを残しつつ、尾根と曲輪の形が読める明るさ（真っ暗にしない）
const PREDAWN = { sky: 0x5c647a, fog: 0x555c6e, sun: 0xd2cae2, sunI: 1.4, hs: 0xb4bcd6, hg: 0x44403a, hI: 1.7, top: 0x323c5a, glow: 0.16, dir: [0.9, 0.16, -0.1], mount: 0x22262e };

// ---------------- 地形 ----------------
// 点 (x,z) から折れ線への最短距離と、線の上の位置（0〜1）
const LINE_LENGTHS = new Map();
const LINE_POS = { d: 0, t: 0 };
function alongLine(pts, x, z) {
  let best = Infinity, bt = 0, acc = 0;
  let info = LINE_LENGTHS.get(pts);
  if (!info) {
    const lens = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
    info = { lens, tot }; LINE_LENGTHS.set(pts, info);
  }
  const { lens, tot } = info;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = lens[i - 1] || 1e-6;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l); t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
    if (d < best) { best = d; bt = (acc + t * l) / tot; }
    acc += l;
  }
  LINE_POS.d = best; LINE_POS.t = bt; return LINE_POS;
}
function floorAt(t) {
  const n = SHIMIZU_FLOOR.length - 1, f = t * n, i = Math.min(n - 1, Math.floor(f));
  return SHIMIZU_FLOOR[i] + (SHIMIZU_FLOOR[i + 1] - SHIMIZU_FLOOR[i]) * (f - i);
}
// 周りの砦（遠景・AI の戦い。中は作らない）：x, z, 平らにする高さ, 旗
const FORTS = [
  { id: 'otake', name: '大嶽', x: -128, z: -160, h: 0, flag: 'oda' },
  { id: 'kingo', name: '金吾丸', x: -32, z: 168, h: 0, flag: 'oda' },
  { id: 'fukuju', name: '福寿丸', x: -150, z: 142, h: 0, flag: 'oda' },
  { id: 'yamazaki', name: '山崎丸', x: -154, z: 64, h: 0, flag: 'oda' },
  { id: 'gessho', name: '月所丸', x: 58, z: -102, h: 0, flag: 'azai' },
];
// 屋敷の平場：斜面を削って平らにする（大野木屋敷・赤尾屋敷）。高さは中心の元の高さ
const TERR = [{ x: ONOGI.x, z: ONOGI.z, r: 12 }, { x: AKAO.x, z: AKAO.z, r: 12 }, ...FORTS.map((f) => ({ x: f.x, z: f.z, r: 9, f }))];
// 登り道（九十九折り）：谷の奥から京極丸の西の口へ。道の高さは長さに沿って一定の勾配で上る
const CLIMB_LEN = [0];
for (let i = 1; i < CLIMB_UP.length; i++) CLIMB_LEN.push(CLIMB_LEN[i - 1] + Math.hypot(CLIMB_UP[i][0] - CLIMB_UP[i - 1][0], CLIMB_UP[i][1] - CLIMB_UP[i - 1][1]));
function climbGrade(x, z) {
  let bestD = Infinity, bestH = 0, sum = 0, weight = 0;
  for (let i = 1; i < CLIMB_UP.length; i++) {
    const [ax, az] = CLIMB_UP[i - 1], [bx, bz] = CLIMB_UP[i], l = CLIMB_LEN[i] - CLIMB_LEN[i - 1] || 1e-6;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l); t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
    const h = climbH(CLIMB_LEN[i - 1] + t * l);
    if (d < bestD) { bestD = d; bestH = h; }
    // 折れ返しで近い道が切り替わっても、高さが飛ばないよう肩をつなぐ。
    if (d < 10) { const w = (1 - d / 10) ** 2; sum += h * w; weight += w; }
  }
  CLIMB_GRADE.d = bestD; CLIMB_GRADE.h = weight ? sum / weight : bestH;
  return CLIMB_GRADE;
}
const CLIMB_GRADE = { d: 0, h: 0 };
function climbH(s) {
  const h0 = SHIMIZU_FLOOR[SHIMIZU_FLOOR.length - 1], h1 = KYO.level, sg = CLIMB_LEN[2];
  return h0 + (h1 - h0) * Math.min(1, s / sg);
}
function baseTerrain(x, z) {
  let h = baseRaw(x, z);
  // 清水谷の谷底の道沿い：平らに（屋敷の並ぶ平場）。谷の奥は登り道へつながる
  if (x < 4) {
    const L = alongLine(SHIMIZU, x, z);
    if (L.d < 32) {
      const k = L.d < 11 ? 1 : 1 - (L.d - 11) / 21, kk = k * k * (3 - 2 * k);
      h += (floorAt(L.t) + L.d * 0.05 - h) * kk;
    }
    const G = climbGrade(x, z);
    if (G.d < 28) {
      const k = G.d < 4.5 ? 1 : 1 - (G.d - 4.5) / 23.5, kk = k * k * (3 - 2 * k);
      h += (G.h - h) * kk;
    }
  }
  for (const t of TERR) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d >= t.r + 6) continue;
    if (t.h == null) t.h = baseRaw(t.x, t.z);
    const k = d <= t.r ? 1 : 1 - (d - t.r) / 6;
    h += (t.h - h) * k * k * (3 - 2 * k);
  }
  return Math.max(0, h);
}
// 国土地理院の標高そのまま（castles/odani.js の demH）に、細かい起伏を少し足す
// 尾根の背の広さ（曲輪の半幅＋2m。曲輪の間は外へ薄れる）：背をこの幅で平らにし、両側へ 0.75 の勾配で落とす。
// 実測の背は曲輪より細く、そのままだと曲輪の縁が数十 m の垂直の壁になる
const RIDGE_ALL = [...RIDGE, SANNO2];
function ridgeHW(z) {
  let w = 9;
  for (const k of RIDGE_ALL) w = Math.max(w, k.hw + 3 - Math.max(0, k.z0 - z, z - k.z1) * 0.35);
  return w;
}
function baseRaw(x, z) {
  const dem = demH(x, z);
  const plat = crestAt(z) - Math.max(0, Math.abs(x) - ridgeHW(z)) * 0.75;
  return Math.max(dem, plat) + 0.35 * Math.sin(x * 0.07 + 0.3) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 + x * 0.03);
}
// 門の上がり坂：曲輪の切岸は縁で 2.7m ほど切れ落ちるので、口の所だけ下の曲輪から上の曲輪へ坂でつなぐ
const RAMPS = [];
for (let i = 0; i < RIDGE.length - 1; i++) {
  const lo = RIDGE[i], up = RIDGE[i + 1];
  RAMPS.push({ a: [0, lo.z0 + 3], b: [0, up.z1 - 3], w: 2.6 });
}
RAMPS.push({ a: [0, BANSHO.z1 + 10], b: [0, BANSHO.z1 - 3], w: 2.6 });
RAMPS.push({ a: [0, SANNO.z0 + 6], b: [0, SANNO2.z1 - 2], w: 2.2 });
// 西の脇道は、曲輪の平場から小丸の脇口まで坂をつなぐ。堀全体や切岸はならさない。
const WEST_LEN = [0];
for (let i = 1; i < KOMA_WEST.length; i++) WEST_LEN.push(WEST_LEN[i - 1] + Math.hypot(KOMA_WEST[i][0] - KOMA_WEST[i - 1][0], KOMA_WEST[i][1] - KOMA_WEST[i - 1][1]));
const westH = (i) => KYO.level + (KOM.level - KYO.level) * Math.max(0, (WEST_LEN[i] - WEST_LEN[2]) / (WEST_LEN[WEST_LEN.length - 1] - WEST_LEN[2]));
for (let i = 1; i < KOMA_WEST.length; i++) RAMPS.push({ a: KOMA_WEST[i - 1], b: KOMA_WEST[i], w: 1.4, ha: westH(i - 1), hb: westH(i) });
for (let i = ROUTE_O.length - 2; i < ROUTE_O.length; i++) RAMPS.push({ a: ROUTE_O[i - 1], b: ROUTE_O[i], w: 1.6 });
// 堀切の窪み（castle_plan.js が C.height に混ぜるのと同じ物を、世界の高さにも混ぜる）
const HORI = ODANI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
const baseWithHori = (x, z) => HORI.reduce((a, f) => a + f(x, z), baseTerrain(x, z));
let H0 = null;
function height(x, z) {
  if (!H0) {
    H0 = heightOf(ODANI_PLAN, baseWithHori, 6);
    for (const r of RAMPS) { r.ha ??= H0(r.a[0], r.a[1]); r.hb ??= H0(r.b[0], r.b[1]); r.len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) || 1; }
  }
  let h = H0(x, z);
  for (const r of RAMPS) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
    const t = ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (r.len * r.len);
    if (t < 0 || t > 1) continue;
    const d = Math.abs((x - r.a[0]) * dz - (z - r.a[1]) * dx) / r.len;
    if (d > r.w + 1.5) continue;
    const hr = r.ha + (r.hb - r.ha) * t;
    const k = d <= r.w ? 1 : 1 - (d - r.w) / 1.5;
    h = h + (hr - h) * k;
  }
  // 曲輪の切岸を重ねた後にも、西の口までの幅9mの足場を残す。
  // 板塀と食い違い土塁の当たりはそのまま効く。
  if (x < GATE_WEST.x + 5 && z < -35) {
    const g = climbGrade(x, z);
    if (g.d < 7) {
      const k = g.d <= 4.5 ? 1 : (7 - g.d) / 2.5;
      h += (g.h - h) * k * k * (3 - 2 * k);
    }
  }
  // 池の石組みの内側だけ浅く下げる。御馬屋の土塁を水面へ重ねない。
  const pd = Math.max(Math.abs(x - UMAARAI.x) - UMAARAI.w / 2, Math.abs(z - UMAARAI.z) - UMAARAI.d / 2);
  if (pd < 0.4) {
    const k = pd <= 0 ? 1 : 1 - pd / 0.4;
    h += (ONMAYA.level - 0.35 - h) * k;
  }
  return h;
}

const odani = {
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  spawn: { x: MOUTH.x + 1, z: MOUTH.z + 6, heading: Math.PI - 0.2 },   // 屋敷（YASHIKI[1]）の軒から 6m 離す（肩越しのカメラの右を軒が塞いでいた。見回り 10/3）
  world: {
    seed: 1573,
    climbTan: 0.7,   // 山城：尾根の両側は急な切岸（登れない）、道と段の間の坂は登れる
    wind: [-0.7, 0.7],
    time: 'dusk',
    muddy: 0,   // 踏み固めた山道。薄い泥でも全員が転びやすくなる指定は外す
    paths: [CLIMB, ROAD_RIDGE, KOMA_WEST, ROUTE_O],
    height,
    moveWay: roadWay,
    tint(x, z, h, c) {
      // 尾根の曲輪の土と、清水谷の道沿いの踏み固めた土
      if (Math.abs(x) < 20 && z < 168 && z > -155) c.lerp({ r: 0.46, g: 0.42, b: 0.34 }, 0.42);
      else if (x < -30 && x > -125 && z > -60 && z < 165 && alongLine(SHIMIZU, x, z).d < 9) c.lerp({ r: 0.42, g: 0.38, b: 0.3 }, 0.3);
      else if (h > 12) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x) < 24 && z < 174 && z > -157)
      || (x < -14 && x > -125 && z > CLIMB_UP[1][1] - 16 && z < 170 && alongLine(CLIMB, x, z).d < 14)
      || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 22 || Math.hypot(x - AKAO.x, z - AKAO.z) < 17 || Math.hypot(x - ONOGI.x, z - ONOGI.z) < 17 || FORTS.some((f) => Math.hypot(x - f.x, z - f.z) < 13),
    trees: 640,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 24 ? 0.15 : 1),
    // 桜馬場は名の通り、尾根の中でそこだけ桜の群れ
    groves: [{ x: 30, z: -10, r: 12, n: 20 }, { x: 36, z: -60, r: 12, n: 20 }, { x: -28, z: 100, r: 12, n: 18 }, { x: -18, z: SAKURABABA.cz, r: 8, n: 12 }, { x: 18, z: SAKURABABA.cz + 6, r: 8, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && (x > 60 || z < -150 || z > 168),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 30000, 5000);
    // ---- 主尾根の梯郭：塀・門・櫓は castle_plan.js に建てさせる（castles/odani.js の縄張り） ----
    flReset();
    const C = F.C = buildCastlePlan(rt, ODANI_PLAN, { ladders: true, baseHeight: baseTerrain, edgeW: 6, buildGates: true, buildTowers: true, team: 1 });
    // 塀は壊させない・的にしない（攻め口は門だけ）。門は大手の物も開けておく（夜討ちの前に内から開けた・GAME_C）。
    // 京極丸の西の口だけは閉じていて、蜂須賀の手が塀を越えて内から開ける
    for (const s of C.walls) if (s && s.seg) { s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; }
    for (const [id, g] of Object.entries(C.gateObjs || {})) {
      if (!g || !g.struct) continue;
      g.struct.hp = g.struct.maxHp = 1e9; g.struct.noTarget = true;
      if (id !== 'g_west') { g.struct.opened = true; if (g.open) g.open(); }
    }
    F.westGate = C.gateObjs && C.gateObjs.g_west;
    F.K = makeNawabari(rt, C, { team: 1, friendTeam: 0, enemyTeam: 1 });
    // 画面の制圧の札（rt.nawabari）は渡さない：携帯の横で小地図と重なり、本丸の兵（塀の内の軽い作り）を数えられず
    // 「本丸 空き」と出てしまう。何をするかは任務の札と台詞で示す
    // 野面積みの石垣：山王丸（大きな石垣・HIST_A）と、本丸・大広間・京極丸の正面（HIST_B）。黒金御門の両脇
    {
      const side = (k, which, o = {}) => {
        const x0 = k.x - k.hw - 0.6, x1 = k.x + k.hw + 0.6;
        const pts = which === 's' ? [[x0 + 3, k.z1 + 0.6], [-3.4, k.z1 + 0.6]] : which === 's2' ? [[3.4, k.z1 + 0.6], [x1 - 3, k.z1 + 0.6]]
          : which === 'w' ? [[x0, k.z1 - 3], [x0, k.z0 + 3]] : [[x1, k.z0 + 3], [x1, k.z1 - 3]];
        rt.scene.add(ishigaki(W, pts, { topY: k.level + 1.3, minH: o.h || 3.2, maxH: (o.h || 3.2) + 3, lean: 0.18, out: which === 'w' || which === 'e' ? -1 : 1, big: 1.5 }));
      };
      for (const k of [HON, OOHIROMA]) { side(k, 's'); side(k, 's2'); side(k, 'w'); side(k, 'e'); }
      // 山王丸の大石垣は約5m。門の正面は道の幅を空ける。
      for (const face of ['s', 's2', 'w', 'e']) side(SANNO, face, { h: 5 });
      side(KYO, 's'); side(KYO, 's2'); side(KYO, 'e');
      side(SANNO2, 's'); side(SANNO2, 's2');
      rt.scene.add(ishigaki(W, [[-4.2, GATE_KURO.z + 3], [-9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
      rt.scene.add(ishigaki(W, [[4.2, GATE_KURO.z + 3], [9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
    }
    // ---- 曲輪の中の建物 ----
    // 本丸：長政の御殿（天守は無い）。大広間：大きな建物。中丸・京極丸・小丸：陣屋と篝火
    // 御殿の中へ入れる作りを残し、建物を西へ寄せて尾根の道を空ける。
    F.honHouse = goten(rt, HON.x - 7.2, HON.cz - 4, { team: 1, w: 8, d: 7, tile: false, name: '本丸の御殿', naka: true }).naka;
    F.komaHouse = goten(rt, KOM.x - 5.4, KOM.z0 + 4.5, { team: 1, w: 5, d: 4.5, tile: false, name: '小丸の館', naka: true }).naka;
    rt.scene.add(hut(W, OOHIROMA.x - 9, OOHIROMA.cz - 6, 12, 8, 0, { h: 3.6, wall: 0x6a5238 }), hut(W, OOHIROMA.x + 9, OOHIROMA.cz + 8, 6, 5, 0.1));
    // 京極丸の真ん中を空け、北東の物見櫓から離して館を南東へ。小丸の館と櫓も別の側へ置く。
    rt.scene.add(hut(W, KYO.x + 10, KYO.z1 - 10, 5, 3.6, 0, { wall: 0x6a5238 }));
    rt.scene.add(hut(W, NAKAMARU.x - 6, NAKAMARU.cz, 5, 4, 0, { wall: 0x5e4a34 }));
    // 尾根の道と上の段への坂を、建物の足もとの当たりで塞がない。
    rt.scene.add(hut(W, SANNO.x + 8, SANNO.cz + 6, 6, 5, 0, { wall: 0x5e4a34 }), hut(W, SANNO2.x + 4.5, SANNO2.cz - 2, 4, 4, 0, { wall: 0x6a5238 }));
    rt.scene.add(hut(W, SAKURABABA.x + 5.5, SAKURABABA.cz, 5, 5, -0.1), hut(W, ONMAYA.x + 6, ONMAYA.cz - 2, 5, 14, 0, { wall: 0x5a4a34 }), umatsunagi(W, ONMAYA.x - 6, ONMAYA.cz - 7, 0, 6));
    rt.scene.add(hut(W, OCHAYA.x + 5.8, OCHAYA.cz, 4.5, 5, 0, { wall: 0x6a5238 }), hut(W, BANSHO.x + 4.8, BANSHO.cz, 3.4, 3.6, 0, { wall: 0x4a3a2a }));
    // 小丸の南東は門から開く隊列と退き道。俵は北東の隅へ寄せる。
    rt.scene.add(tawara(W, KYO.x + 11, KYO.z1 - 3, 0.3, 5), tawara(W, KOM.x + 6, KOM.z0 + 4, -0.2, 5));
    // 馬洗池は南北9m・東西6.6m。石組みの縁も水面も道の西へ収める。
    {
      const { x, z, w, d } = UMAARAI, y = ONMAYA.level;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 }));
      water.rotation.x = -Math.PI / 2; water.position.set(x, y + 0.04, z); rt.scene.add(water);
      rt.scene.add(ishigaki(W, [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], { topY: y + 0.35, minH: 0.4, maxH: 0.5, lean: 0, out: -1, noKit: true, big: 1.5 }));
    }
    // 浅井の旗：本丸と小丸に馬印（大将の居場所。長政・久政は建物の奥にいて、前には出ない）
    F.flagsKom = [];
    for (const [x, z, h] of [[HON.x - 9, HON.z1 - 4, 6], [HON.x + 6, HON.cz - 9, 7], [KOM.x - 6, KOM.cz, 6], [KOM.x + 6, KOM.z0 + 3, 7], [SANNO.x - 4, SANNO.cz, 6], [OOHIROMA.x - 10, OOHIROMA.cz, 6], [NAKAMARU.x + 6, NAKAMARU.cz, 5], [KYO.x - 12, KYO.z0 + 2, 6], [KYO.x - 12, KYO.z1 - 2, 6]]) {
      const n2 = nobori(W, x, z, 'azai', h); rt.scene.add(n2);
      if (z < KOM.z1 + 1 && z > KOM.z0 - 1) F.flagsKom.push(n2);
      if (z < KYO.z1 && z > KYO.z0) (F.flagsKyo = F.flagsKyo || []).push(n2);
    }
    for (const [x, z] of [[HON.x + 4, HON.z0 + 3], [KOM.x + 4, KOM.z1 - 2], [KYO.x - 2, KYO.cz + 3], [NAKAMARU.x + 2, NAKAMARU.z1 - 2], [SANNO.x + 4, SANNO.z1 - 4], [OOHIROMA.x - 4, OOHIROMA.z0 + 4]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 城に詰める浅井勢（軽い作り）：本丸の塀の内に外を向いて構える者、大広間・山王丸・中丸の兵 ----
    {
      const crew = [];
      for (let i = 0; i < 18; i++) {
        const t = i / 17, x = HON.x - HON.hw + 1.5 + t * (HON.hw * 2 - 3);
        crew.push({ x, z: HON.z1 - 1.5, k: ['gun', 'spear', 'bow', 'spear'][i % 4], facing: 0 });
        if (i % 3 === 0) crew.push({ x, z: HON.z0 + 1.5, k: ['gun', 'spear'][i % 2], facing: Math.PI });
      }
      const cr = W.addDistantArmy({ people: crew, armor: AZ_ARMOR, team: 1, flagTex: flagTexture('azai'), seed: 15737 });
      if (cr && cr.army) cr.army.noWake = true;   // 塀の内の者は本物に替えない（本丸から湧いて出てこない）
    }
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed, ...(team != null ? { team } : {}) });
    F.azHon = DA(OOHIROMA.x, OOHIROMA.cz, 22, 18, 150, 0, AZ_ARMOR, 'azai', 15736, 1);
    F.azSanno = DA(SANNO.x, SANNO.cz, 16, 14, 60, 0, AZ_ARMOR, 'azai', 15738, 1);
    for (const a of [F.azHon, F.azSanno]) if (a && a.army) a.army.noWake = true;
    // ---- 清水谷（主尾根の西の谷）：浅井の居館・家臣の屋敷・寺・倉・厩。谷底に道、両側に山、上に主尾根の城 ----
    {
      const db = makeSimpleBatch();
      // 居館：土塁で四方を囲み、谷の道へ向いて門（冠木門）。中に主屋と台所・蔵
      const kx = KYOKAN.x, kz = KYOKAN.z, hw = 13, hd = 10;
      const sides = [[kx - hw, kz - hd, kx + hw, kz - hd, 0, -1], [kx + hw, kz - hd, kx + hw, kz + hd, 1, 0], [kx + hw, kz + hd, kx - hw, kz + hd, 0, 1]];
      for (const [ax, az, bx, bz, nx, nz] of sides) { const d = dorui(W, [ax, az, bx, bz], nx, nz, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      for (const [az, bz] of [[kz - hd, kz - 3.4], [kz + 3.4, kz + hd]]) { const d = dorui(W, [kx - hw, az, kx - hw, bz], -1, 0, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      finalizeSimpleBatch(rt, db);
      rt.scene.add(kabukimon(W, kx - hw, kz, 6, Math.PI / 2));
      rt.scene.add(hut(W, kx - 2, kz - 3, 14, 7, 0, { h: 3.4, wall: 0x6a5238 }), hut(W, kx + 8, kz + 3, 5, 4, 0.1, { wall: 0x5e4a34 }), hut(W, kx - 9, kz + 4, 5, 4, -0.1, { wall: 0x5a4a34 }));
      // 寺（谷の口の寺。名は出さない＝GAME_C）
      rt.scene.add(dou(W, TERA.x, TERA.z, 9, 7, Math.PI / 2 + 0.2, { h: 3.4 }), hut(W, TERA.x + 2, TERA.z - 12, 6, 4, 0.2, { wall: 0x7a5a3c }));
      // 家臣の屋敷：道の両側に、塀（柵）の囲いと屋敷
      YASHIKI.forEach(([x, z, r], i) => {
        rt.scene.add(hut(W, x, z, 7 + (i % 3), 5, r, { wall: i % 2 ? 0x5e4a34 : 0x6a5238 }));
        if (i % 2 === 0) rt.scene.add(palisade(W, [x - 6, z + 5, x + 6, z + 5]));
      });
      rt.scene.add(umatsunagi(W, KYOKAN.x - 18, KYOKAN.z - 12, 1.4, 6), tawara(W, KYOKAN.x - 17, KYOKAN.z + 12, 0.4, 6));
      // 前の小競り合いで焼けた屋敷（GAME_C）
      for (const [x, z] of [[YASHIKI[3][0], YASHIKI[3][1]], [YASHIKI[5][0] + 2, YASHIKI[5][1]]]) { W.addFire(x, z, { h: 2 }); W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: 1.6 }); }
    }
    // ---- 防御帯：堀切・竪堀（縄張りの高さと当たり）／食い違い虎口（西の口の外）／隠し銃座／大野木屋敷・赤尾屋敷 ----
    {
      const kb = makeSimpleBatch();
      for (const sg of KUICHIGAI) { const g = takaDorui(W, sg, { batch: kb, w: 1.3, h: 3.2 }); rt.scene.add(g); }
      finalizeSimpleBatch(rt, kb);
      F.nests = [];
      for (const nd of NESTS) {
        const nest = hiddenGunNest(W, nd.x, nd.z, nd.rot, { n: nd.n });
        rt.scene.add(nest.group);
        const g = enemyGroup(rt, { faction: 'saito', name: '隠し銃座', anchor: nest.center, fixed: true, facing: Math.atan2(nest.fwd.x, nest.fwd.z), width: 2, aggro: 22, morale: 90, noRout: true, dmgMult: 0.5 },
          dress([{ type: 'gun', n: nd.n }], AZAI));
        g.units.forEach((u, i) => { const s = nest.spots[i % nest.spots.length]; u.pos.x = s.x; u.pos.z = s.z; u._nest = true; u._crouch = true; });
        F.nests.push({ id: nd.id, g, c: nest.center, mouth: nest.mouth });
      }
      F.yokoya = [];
      for (const yk of YOKOYA) {
        const z = yokoyaZa(W, yk.x, yk.z, yk.rot, { n: yk.n });
        rt.scene.add(z.group);
        const g = enemyGroup(rt, { faction: 'saito', name: '横矢の座', anchor: z.center, fixed: true, facing: Math.atan2(z.fwd.x, z.fwd.z), width: 2, aggro: 20, morale: 90, noRout: true, dmgMult: 0.45 },
          dress([{ type: yk.k, n: yk.n }], AZAI));
        g.units.forEach((u, i) => { const s = z.spots[i % z.spots.length]; u.pos.x = s.x; u.pos.z = s.z; });
        F.yokoya.push({ id: yk.id, g, c: z.center });
      }
      const O = ONOGI, ox0 = O.x - O.hw, ox1 = O.x + O.hw, oz0 = O.z - O.hd, oz1 = O.z + O.hd;
      for (const sg of [[ox0, oz1, O.x - 2.6, oz1], [O.x + 2.6, oz1, ox1, oz1], [ox1, oz1, ox1, oz0], [ox1, oz0, ox0, oz0], [ox0, oz0, ox0, oz1]]) rt.scene.add(palisade(W, sg));
      F.onoHouse = goten(rt, O.x, O.z - 2, { team: 1, w: 10, d: 6, tile: false, name: O.name, naka: true }).naka;
      rt.scene.add(kabukimon(W, O.x, oz1, 5, 0), hut(W, ox0 + 3.5, oz0 + 3, 4.5, 3.4, 0.1, { wall: 0x5e4a34 }), hut(W, ox1 - 3.5, O.z + 1, 4, 3.2, -0.1, { wall: 0x5a4a34 }), kagaribi(W, O.x + 3.5, oz1 - 2));
      W.addFire(O.x + 3.5, oz1 - 2, { h: 1.4 });
      const A = AKAO, ax0 = A.x - A.hw, ax1 = A.x + A.hw, az0 = A.z - A.hd, az1 = A.z + A.hd;
      for (const sg of [[ax0, az0, ax0, A.z - 2.5], [ax0, A.z + 2.5, ax0, az1], [ax0, az1, ax1, az1], [ax1, az1, ax1, az0], [ax1, az0, ax0, az0]]) rt.scene.add(palisade(W, sg));
      // 西の木戸へ戸口を向ける。屋敷の横や裏へ回らずに入れる。
      F.akaoHouse = goten(rt, A.x + 1, A.z, { team: 1, w: 9, d: 6, rot: -Math.PI / 2, tile: false, name: A.name, naka: true }).naka;
      rt.scene.add(kabukimon(W, ax0, A.z, 5, Math.PI / 2), hut(W, A.x + 1, az1 - 3, 5, 3.4, 0, { wall: 0x5e4a34 }), nobori(W, A.x - 5, A.z - 5, 'azai', 6), kagaribi(W, ax0 + 3, A.z + 4));
      W.addFire(ax0 + 3, A.z + 4, { h: 1.4 });
    }
    // ---- 周りの砦（遠景）：大嶽・南側の金吾丸・福寿丸・山崎丸は織田方が押さえた。月所丸は浅井 ----
    for (const f of FORTS) {
      const n = 10, r = 8.5, pts = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]); }
      for (let i = 0; i < n; i++) if (i !== 0) rt.scene.add(palisade(W, [pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]));
      rt.scene.add(hut(W, f.x, f.z - 2, 6, 4, 0.2, { wall: 0x5a4a34 }), nobori(W, f.x + 3, f.z + 3, f.flag, 7), nobori(W, f.x - 4, f.z, f.flag, 6));
      W.addFire(f.x + 2, f.z + 5, { torch: true, h: 1.4 });
    }
    // ---- 小谷を囲む織田勢（軽い作り）：谷の口・東の谷・南の山麓。南には虎御前山の信長の本陣 ----
    DA(MOUTH.x - 10, MOUTH.z + 24, 34, 12, 220, Math.PI - 0.2, ODA_ARMOR, 'oda', 15731);
    DA(110, -30, 30, 14, 220, -Math.PI / 2, ODA_ARMOR, 'oda', 15732);
    DA(118, -110, 26, 12, 160, -Math.PI / 2, ODA_ARMOR, 'eiraku', 15733);
    DA(-40, 168, 40, 10, 240, Math.PI, ODA_ARMOR, 'eiraku', 15734);
    KIT.honjin(rt, 70, 160, { mon: 'oda', people: false, fire: true, yoroi: false });
    DA(70, 176, 30, 8, 160, Math.PI, ODA_ARMOR, 'oda', 15735);
    for (const [x, z, k] of [[MOUTH.x + 4, MOUTH.z - 2, 'oda'], [MOUTH.x - 6, MOUTH.z + 4, 'oda'], [62, 152, 'oda'], [78, 152, 'eiraku'], [100, -20, 'oda'], [100, -100, 'oda']]) rt.scene.add(nobori(W, x, z, k, 7));
    for (const [x, z] of [[MOUTH.x - 6, MOUTH.z + 10], [100, -40], [110, -96], [-20, 160]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { torch: true, h: 1.4 }); }
    // ---- 南の大手：織田の本隊が番所に取りついている（遠景の合戦。一段ずつ攻め上がる） ----
    F.front = 0;
    F.clash = clash(rt, { x: 0, z: BANSHO.z1 + 8, facing: Math.PI, w: 26, gap0: 0, seed: 15751, noRout: true, noWake: true,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 260, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 160, team: 1, faction: 'saito', bows: true } });
    // ---- 羽柴秀吉の手（自分の持ち場）と、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: MOUTH.x, z: MOUTH.z }, facing: Math.PI, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, ...HIDE } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '蜂須賀正勝の手', anchor: { x: MOUTH.x + 8, z: MOUTH.z + 4 }, facing: Math.PI, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.hide, F.hachi];
    for (const g of F.oda) { g.defMult = 1.35; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MOUTH.x + 4, z: MOUTH.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 清水谷の浅井勢：居館の番兵と、谷の奥の見張り ----
    F.yakata = enemyGroup(rt, { faction: 'saito', name: '居館の番兵', anchor: { x: KYOKAN.x - 21, z: KYOKAN.z + 2 }, facing: Math.PI / 2 + 0.6, width: 8, aggro: 16, morale: 75, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.62 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    F.watch = enemyGroup(rt, { faction: 'saito', name: '谷の奥の見張り', anchor: { x: HEAD.x - 4, z: HEAD.z + 12 }, facing: 0.4, width: 6, aggro: 14, morale: 70, fleeDir: { x: 0.6, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
    // ---- 京極丸の守り（西の口の門兵と、曲輪の中の守り） ----
    F.kyoGate = enemyGroup(rt, { faction: 'saito', name: '西の口の門兵', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: -Math.PI / 2, width: 6, aggro: 10, morale: 80, fleeDir: { x: 1, z: 0 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }], AZAI));
    F.kyo = enemyGroup(rt, { faction: 'saito', name: '京極丸の守り', anchor: { x: KC.x + 3, z: KC.z }, facing: -Math.PI / 2, width: 10, aggro: 9, morale: 95, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], AZAI));
    F.ono = enemyGroup(rt, { faction: 'saito', name: '大野木屋敷の守り', anchor: { x: ONOGI.x, z: ONOGI.z + 3 }, facing: Math.PI, width: 9, aggro: 12, morale: 90, fleeDir: { x: 0.5, z: 1 }, dmgMult: 0.58, noRout: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    // ---- 区域の網：京極丸を取れば、尾根の鎖の上で本丸（長政）と小丸（久政）が切れる ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: C.kuruwa.hon.centroid, need: 10, hold: 20 },
        { id: 'nakamaru', name: '中丸', test: C.kuruwa.nakamaru.test, pos: C.kuruwa.nakamaru.centroid, need: 8, hold: 20 },
        { id: 'kyogoku', name: '京極丸', test: C.kuruwa.kyogoku.test, pos: C.kuruwa.kyogoku.centroid, need: 6, hold: 10 },
        { id: 'koma', name: '小丸', test: C.kuruwa.koma.test, pos: C.kuruwa.koma.centroid, need: 6, hold: 12 },
      ],
      links: [['hon', 'nakamaru'], ['nakamaru', 'kyogoku'], ['kyogoku', 'koma']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => { if (id === 'kyogoku' && F.step === 2) this.cut(rt); },
    });

    applyLook(rt, PREDAWN);
    rt.setPhase('brief');
    rt.obj('main', '秀吉のもとで、夜討ちの下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、ここは清水谷。浅井の館と屋敷の並ぶ谷じゃ。上の尾根に、小谷の曲輪が連なっておる`, 5);
    rt.say('羽柴秀吉', '殿は大手じゃ。我らは谷から京極丸を取り、長政殿と久政殿を分断する', 5.5);
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉（話を聞く）', {});
    rt.marker('kyoGoal', { x: KC.x, z: KC.z }, '京極丸', { h: 6 });
    rt.addInteract('talk', { x: MOUTH.x, z: MOUTH.z }, '秀吉の話を聞く', () => { rt.uninteract('talk'); rt.say('羽柴秀吉', '（小声で）よし、参るぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 6 });
    rt.after(13, () => this.climb(rt));
  },

  // ① 清水谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk'); rt.unmark('hide');
    F.trailPoint = { x: CLIMB[2][0], z: CLIMB[2][1] }; F.trailIdx = 2;
    rt.marker('trail', () => F.trailPoint, '清水谷の登り道', { h: 3 });
    rt.obj('main', hi(rt) ? '一隊を率いて清水谷を登れ' : '秀吉について清水谷を登れ', 'main');
    rt.say('羽柴秀吉', '（小声で）松明を消せ。……谷の館の番兵を払えば、あとは登るだけじゃ', 3.5);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(2, SHIMIZU.length + 2); H.pathIdx = 0; H.speed = 3; H.formation = 'column'; H.aggro = 12;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x, z: BELOW.z }; g.formation = 'column'; g.aggro = 12; F.hideAt = rt.t; };
    const Hc = F.hachi;
    Hc.order = 'path'; Hc.path = CLIMB.slice(2, SHIMIZU.length + 2); Hc.pathIdx = 0; Hc.speed = 2.9; Hc.formation = 'column';
    Hc.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x + (CLIMB_UP[1][0] - BELOW.x) * 0.15, z: BELOW.z + (CLIMB_UP[1][1] - BELOW.z) * 0.15 }; g.formation = 'column'; };
    rt.after(30, () => { if (F.step <= 2) { rt.bark('南の大手で鬨の声：織田の本隊が番所に取りついた'); sfx('far', 0.6); } });
  },

  // ② 京極丸を取る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('kyogoku');
    rt.unmark('watch'); rt.unmark('yakata'); rt.unmark('kyoGoal'); rt.unmark('trail');
    F.kyoTrailIdx = 0;
    const p = rt.player.u.pos; let best = Infinity;
    for (let i = 0; i < CLIMB_UP.length; i++) { const w = CLIMB_UP[i], d = Math.hypot(p.x - w[0], p.z - w[1]); if (d < best) { best = d; F.kyoTrailIdx = i; } }
    F.trailPoint.x = CLIMB_UP[F.kyoTrailIdx][0]; F.trailPoint.z = CLIMB_UP[F.kyoTrailIdx][1];
    rt.marker('trail', () => F.trailPoint, '食い違い虎口・次の曲がり角', { h: 3 });
    if (!gone(F.watch)) F.watch.morale = Math.min(F.watch.morale, 15);
    sfx('horagai', 0.9);
    rt.banner('京極丸へ', '尾根の真ん中の曲輪に攻め入る');
    nextObj(rt, '京極丸の下、大野木屋敷を奪え');
    rt.say('羽柴秀吉', '大野木屋敷の南の木戸へ！　庭の守りを崩せ。戸口で「中へ入る」の札を押せるぞ', 4);
    rt.marker('ono', F.onoHouse.doorOut, '大野木屋敷の戸口', { red: true, h: 6 });
    rt.after(6, () => { if (F.step === 2 && !F.onoDone) rt.say('羽柴秀吉', '西の口の外は食い違いの虎口じゃ。壁に沿って折れて登る。壁の陰の銃座に気をつけよ！', 4); });
    // 遠い屋敷へ「攻めよ」だけでは索敵の外に残る。谷道と南の木戸を通してから攻める。
    for (const g of F.oda) {
      const c = g.center();
      roadPoint(ROUTE_O, c, ROUTE_FROM, rt.army, g.units.find((u) => u.alive));
      g.anchor = { x: c.x, z: c.z }; g.order = 'path'; g.path = ROUTE_O;
      g.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      g.formation = 'column'; g.aggro = 6; g.speed = 3;
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; gg.formation = 'line'; };
    }
    F.kyoGate.order = 'attack'; F.kyoGate.seekRange = 24;
    F.kyo.seekRange = 22;
    rt.marker('kyo', centerOf(F.kyoGate), () => `西の口の門兵・${moraleWord(F.kyoGate.morale)}`, { red: true, group: F.kyoGate });
    // 閉じた西の口は、蜂須賀の手が塀を越えて内から開ける
    rt.after(22, () => {
      const g = F.westGate;
      if (g && g.struct && !g.struct.opened) { g.struct.opened = true; if (g.open) g.open(); }
      rt.bark('蜂須賀の手が塀を越え、西の口を内から開けた');
    });
    // 中丸から京極丸へ加勢が駆けつける
    rt.after(26, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '中丸からの加勢', anchor: { x: GATE_NAKA_KYO.x, z: GATE_NAKA_KYO.z + 4 }, facing: Math.PI, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 1 }], AZAI));
      F.kyoAid = g;
      KIT.backOf(rt, g, { flag: 'azai', armor: AZ_ARMOR, kind: 'spear', w: 10, depth: 6, count: 50, seed: 15742 });
      rt.army.play('eshout', { x: 0, z: GATE_NAKA_KYO.z }, 1.5);
      rt.say('羽柴秀吉', '南の中丸から加勢が来た！　門の口で止めよ！', 3.5);
      rt.marker('kyoAid', centerOf(g), () => `中丸からの加勢・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // ②の途中：大野木屋敷を奪う。京極丸の直下を取られ、本丸と小丸の間が切れる（浅井方の絶望）
  onoFall(rt) {
    const F = rt.flags;
    if (F.onoDone) return;
    F.onoDone = true;
    rt.unmark('ono');
    if (gone(F.ono)) rt.award((t) => t.side.push('大野木屋敷を奪った'), '大野木屋敷を奪った');
    sfx('kane', 0.5);
    rt.say('浅井の兵', '京極丸の下を取られた……！　大野木殿の屋敷が落ちた。本丸と小丸が切れるぞ！', 3.5);
    rt.after(3.5, () => { if (F.step === 2) rt.say('羽柴秀吉', '大野木屋敷、落ちたり！　勢いのまま、虎口を抜けて京極丸じゃ！', 3.5); });
    for (const q of [F.kyoGate, F.kyo]) if (q && !gone(q)) q.morale = Math.max(5, q.morale - 25);
    nextObj(rt, '虎口を抜け、京極丸に攻め入れ');
    for (const g of F.oda) { g.dmgMult = 1.15; g.order = 'path'; g.path = CLIMB_UP; g.pathIdx = 0;
      const c = g.center(); let best = Infinity;
      for (let i = 0; i < CLIMB_UP.length; i++) { const w = CLIMB_UP[i], d = Math.hypot(c.x - w[0], c.z - w[1]); if (d < best) { best = d; g.pathIdx = i; } } g.aggro = 4; g.speed = 3; g.formation = 'column'; g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 40; gg.formation = 'line'; gg.anchor = { x: KC.x, z: KC.z }; }; }
    rt.marker('kyo', centerOf(F.kyoGate), () => `西の口の門兵・${moraleWord(F.kyoGate.morale)}`, { red: true, group: F.kyoGate });
  },

  // ③ 分断：京極丸を取り、本丸と小丸が切れる
  cut(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cut');
    rt.unmark('kyo'); rt.unmark('kyoAid'); rt.unmark('trail');
    for (const q of [F.kyo, F.kyoGate, F.kyoAid]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (!late) rt.award((t) => t.side.push('京極丸を取った'), '京極丸を取った');
    rt.objRemove('main'); // ここから小丸が落ちるまでは、段の任務だけを出す。
    sfx('kane', 0.6);
    rt.banner('浅井軍、二つに切れる', '南の本丸に長政、北の小丸に久政。もう互いに助けに行けない');
    // 京極丸の浅井の旗を倒し、夜が明けてくる
    (F.flagsKyo || []).forEach((n2, i) => rt.after(0.6 + i * 0.5, () => { n2.rotation.z = 1.3; }));
    applyLook(rt, DAWN);
    // 二つに切れた城を見せる（南の本丸・北の小丸に印を少しの間）
    rt.marker('cutHon', { x: HONC.x, z: HONC.z }, '本丸（浅井長政）', { red: true, h: 6 });
    rt.marker('cutKom', { x: KOMC.x, z: KOMC.z }, '小丸（浅井久政）', { red: true, h: 6 });
    rt.after(12, () => { rt.unmark('cutHon'); rt.unmark('cutKom'); });
    if (!rt.player.lock) rt.player.cine = { x: HONC.x, z: HONC.z, t: 2.4 };
    rt.say('羽柴秀吉', '本丸と小丸を断った！　両方から来るぞ、京極丸を守れ！', 4.5);
    rt.after(5, () => { if (!F.ending) rt.say('竹中重治', '本丸との間は大堀切。中丸の門へ続く細道で受けましょうぞ', 4); });
    // 南の大手：織田の本隊が番所・御茶屋を抜き、御馬屋・桜馬場へ攻め上がる
    this.advanceFront(rt, 1);
    // 京極丸の南の門に鉄砲を並べる
    { const c = F.hide.center();
      F.gunH = allyGroup(rt, { name: '羽柴の鉄砲衆', anchor: { x: c.x, z: c.z }, facing: 0, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 5 }], ODA));
      F.gunH.order = 'move'; F.gunH.dest = { x: 3, z: KYO.z1 - 3 }; F.gunH.speed = 2.6; F.gunH.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 3, z: KYO.z1 - 3 }; gg.facing = 0; gg.aggro = 4; }; }
    const ctx = { routeFight: true, faction: 'saito', flag: 'azai', armor: AZ_ARMOR, dmg: 0.55, mass: 90, scale: 1.4, look: (l) => depthLook(rt, l, AZAI),
      friends: () => [F.hide, F.hachi, F.gunH, F.aid].filter((g) => g && g.count && !g.routed) };
    depthStart(rt, ctx, odSteps(), () => this.komaFall(rt));
  },

  // 南の大手の合戦を一段進める（番所→御茶屋・御馬屋→桜馬場・黒金御門）。遠景の戦だけで、本物の兵は出さない
  advanceFront(rt, k) {
    const F = rt.flags;
    if (k <= F.front) return;
    F.front = k;
    const at = [BANSHO.z1 + 8, ONMAYA.z1 + 6, GATE_KURO.z + 6][k];
    const say = ['', '大手の織田勢、番所と御茶屋を抜き、御馬屋へ攻め上がっておりまする', '大手の織田勢、桜馬場を越えて黒金御門に取りつきました'][k];
    if (F.clash) F.clash.rout('B', { from: 0, hideAfter: 10 });
    F.clash = clash(rt, { x: 0, z: at, facing: Math.PI, w: 24, gap0: 12, seed: 15751 + k, noRout: true, noWake: true,
      A: { flag: k === 2 ? 'eiraku' : 'oda', armor: ODA_ARMOR, count: 240, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 150, team: 1, faction: 'saito', guns: k === 2 } });
    rt.after(2, () => { if (F.clash) F.clash.go(); });
    rt.after(4, () => { if (!F.ending) { rt.say('使番', say, 3.5); sfx('far', 0.7); } });
  },

  // ④ 小丸、落ちる（久政の最期）→ お市の方の供へ
  komaFall(rt) {
    const F = rt.flags;
    if (F.komaDown) return;
    F.komaDown = true;
    rt.objRemove('dp');
    rt.obj('main', '京極丸で組をまとめ、お市の方の一行を待て', 'main');
    sfx('kane', 0.5);
    rt.banner('小丸、落ちる', '浅井久政は小丸の館で腹を切った');
    rt.world.addSmokeColumn(KOM.x, rt.world.heightAt(KOM.x, KOM.cz) + 4, KOM.cz, { size: 2.8 });
    rt.world.addFire(KOM.x - 4, KOM.z0 + 6, { h: 1.6 });
    F.flagsKom.forEach((n2, i) => rt.after(1 + i * 0.8, () => { n2.rotation.z = 1.3; n2.position.y += 0.1; }));
    if (F.azSanno && F.azSanno.rout) rt.after(3, () => F.azSanno.rout());
    // 一息つく（手負いを手当てする）
    { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * 0.8); }
    // 倒れた組員を戻さず、羽柴の別の組を供に加える。供の七人の枠も先に空ける。
    let n = 0;
    for (const u of rt.squad) if (u.alive && !u.fleeing && !u.gone) n++;
    F.escStrength = n;
    if (n < 8) {
      KIT.freeRoom(rt, 12 - n + 7);
      const g = allyGroup(rt, { name: '羽柴の新手（供の組）', fixed: true, fullStrength: true, isPlayerSquad: true,
        anchor: { x: KC.x + 4, z: KC.z + 4 }, order: 'follow', formation: 'column', colW: 2, spacing: 1.2, aggro: 8, morale: 90 },
        depthLook(rt, [{ type: 'ashigaru', n: 12 - n }], ODA));
      g.kind = 'spear';
      g.orderRing = rt.ring(0, 0, 2.4, 0xc2a25a, 0.5); g.orderRing.visible = false;
      g.selRing = rt.ring(0, 0, 3.4, 0xd8b04a, 0.3); g.selRing.visible = false;
      for (const u of g.units) { u.isSub = true; u.kills = 0; }
      rt.squad.push(...g.units); rt.squadGroups.push(g);
      rt.tracker.subsInit = rt.squad.length;
      rt.bark(`羽柴の別の組から、新手の足軽${g.count}人が供に加わった`);
    } else KIT.freeRoom(rt, 7);
    for (const g of rt.squadGroups) if (g.count && !g.routed) { g.order = 'follow'; g.focus = null; g.pending = null; }
    rt.say('羽柴秀吉', '……久政殿、ご自害。山王丸の兵も退いていく。残るは、大堀切の向こうの本丸だけじゃ', 5);
    this.advanceFront(rt, 2);
    rt.after(7, () => this.escort(rt));
  },

  // ⑤ お市の方の一行を供する
  escort(rt) {
    const F = rt.flags;
    if (F.step >= 4 || !F.komaDown || (F.dp && F.dp.on)) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('escort');
    rt.world.setTime('morning');
    rt.say('羽柴秀吉', '……本丸から、大堀切の土橋を渡って一行が来た。長政殿が、お市様と三人の姫君を、織田へお返しなさると', 5);
    rt.say('羽柴秀吉', `${nm(rt)}、一行の供をせよ。輿の印から十歩以内で、道を塞ぐ敵を退けよ。敵を追わず、谷の陣へ付け`, 4);
    rt.objRemove('dp');
    rt.obj('main', 'お市の方の一行を、谷の陣まで供せよ', 'main');
    // 一行（戦わない。狙われない）。お市の方と姫は塗輿に乗り、担ぎ手と侍女が囲む
    const g = allyGroup(rt, { name: 'お市の方の一行', fixed: true, anchor: { x: 0, z: NAKAMARU.cz }, facing: Math.PI, colW: 2, spacing: 0.9, aggro: 0, noRout: true, formation: 'column', speed: ESCORT_SPEED },
      [{ type: 'samurai', n: 1, o: { name: '藤掛永勝', flag: null, hat: 'none' } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x6a3a4a, lace: 0xb8a070, cloth: 0x8a3a4a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x3a4a6a, lace: 0xb8a070, cloth: 0x4a5a8a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x4a4034, cloth: 0x5a4a3c } }]);
    F.escKoshi = koshi(rt.world, 0, NAKAMARU.cz, Math.PI, { moving: true });
    rt.scene.add(F.escKoshi);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    g.order = 'path'; g.path = ESCORT.slice(); g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = ODA_POST; F.escWaitT = null; F.escArrived = true; };
    F.esc = g;
    F.escPoint = { x: 0, z: NAKAMARU.cz }; F.escAway = 0;
    rt.marker('esc', () => F.escPoint, '一行のそば十歩で守れ', {});
    rt.zone('escGuard', 0, NAKAMARU.cz, 10);
    F.escRing = rt.rings.find((r) => r.userData.id === 'escGuard');
    rt.zone('camp', ODA_POST.x, ODA_POST.z, 7);
    rt.marker('camp', ODA_POST, '谷の羽柴の陣', { h: 3 });
    // 羽柴の手は京極丸を守ったまま。谷に羽柴の陣（行き先）
    rt.scene.add(nobori(rt.world, ODA_POST.x - 4, ODA_POST.z + 3, 'oda', 6), nobori(rt.world, ODA_POST.x + 4, ODA_POST.z + 3, 'oda', 6));
    rt.after(3, () => rt.say('藤掛永勝', '一行を織田方へ引き渡す。京極丸の西の口から、登ってきた道を谷へ下る', 4));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('esc'); rt.unzone('escGuard'); rt.unzone('camp'); rt.unmark('camp'); rt.unmark('ochi');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を取り、お市の方の一行を供した', pts: 20 }; }, '任務達成・お市の方を織田の陣へ');
    sfx('horagai', 0.5);
    rt.banner('小谷城、落ちる', '数日のち九月一日――織田勢は大広間から本丸へ攻め入り、浅井長政は自害した');
    rt.marker('akao', { x: AKAO.x, z: AKAO.z }, '赤尾屋敷（長政の最期）', { h: 7 });
    rt.say('羽柴秀吉', '……本丸の東の下、赤尾の屋敷で、長政殿は腹を召された。お市の方と三人の娘は、織田方へ引き渡された', 5);
    rt.after(6, () => rt.say('', '――浅井の旧領、北近江の多くは秀吉に与えられた。秀吉はのちに今浜を長浜と改め、城を築く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    rt.unzone('escGuard');
    const why = F.escArrived ? '陣への合流が足りなかった' : F.escAway > 20 ? '一行のそばを離れすぎた' : F.ochiOn === true ? '道を塞ぐ敵を退けられなかった' : '制限時間までに谷へ下れなかった';
    rt.banner('一行の供を果たせず', why);
    rt.say('羽柴秀吉', F.escArrived ? '一行は陣に着いたが、そなたが戻れなかった。敵を追わず、谷の陣の印へ戻るのじゃ' : F.escAway > 20 ? '一行から十八歩以上離れ、付き添う時間が足りなかった。輿の輪の中へ戻り、そばで戦うのじゃ' : F.ochiOn === true ? '道を塞ぐ敵が残り、一行が進めなかった。輿のそばで組と受け、敵を退けるのじゃ' : '谷へ下る時間が足りなかった。西の口の曲がり道を通り、輿の輪から離れず陣まで付くのじゃ', 5);
    rt.player.u.invuln = true; rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    KIT.backTick(rt);
    guardRecover(rt, F.hideU, dt, { line: ['羽柴秀吉', '……退くぞ。手傷じゃ、しばし堪えよ'], backLine: ['羽柴秀吉', 'もう良い、前へ出る'] });
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    const p = rt.player.u.pos;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.hurtHintT > rt.t)) {
      F.hurtHintT = rt.t + 20;
      const hit = rt.player.lastHit;
      rt.bark(hit && hit.ranged && rt.t - hit.t < 8 ? '矢玉で深手じゃ。塀や屋敷の陰へ退け。安全な所で味方のそばへ寄り、傷を縛れ' : '手傷が深い。構えて味方の後ろへ下がれ。安全な所で傷を縛れ');
    }
    if (F.step === 1) {
      while (F.trailIdx < SHIMIZU.length + 1 && Math.hypot(p.x - CLIMB[F.trailIdx][0], p.z - CLIMB[F.trailIdx][1]) < 7) F.trailIdx++;
      F.trailPoint.x = CLIMB[F.trailIdx][0]; F.trailPoint.z = CLIMB[F.trailIdx][1];
      const d = Math.hypot(p.x - BELOW.x, p.z - BELOW.z);
      rt.objProgress('main', `京極丸の下まで ${Math.max(0, Math.round(d))}歩`);
      const hc = F.hide.center();
      const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r || Math.hypot(hc.x - q.x, hc.z - q.z) < r - 4;
      const yk = { x: KYOKAN.x - 21, z: KYOKAN.z + 2 };
      if (!F.yakataOn && near(yk, 34)) { F.yakataOn = true; F.yakata.order = 'attack'; F.yakata.seekRange = 34; rt.army.play('eshout', yk, 1.2); rt.say('浅井の番兵', '谷に人がおるぞ！　織田じゃ、館を守れ！', 2.5); rt.marker('yakata', centerOf(F.yakata), () => `居館の番兵・${moraleWord(F.yakata.morale)}`, { red: true, group: F.yakata }); }
      if (F.yakataOn && !gone(F.yakata) && F.hide.order === 'path' && Math.hypot(hc.x - yk.x, hc.z - yk.z) < 26) { F.hidePause = true; F.hide.order = 'attack'; F.hide.seekRange = 30; }
      if (F.hidePause && gone(F.yakata)) { F.hidePause = false; F.hide.order = 'path'; F.hide.formation = 'column'; rt.unmark('yakata'); rt.say('羽柴秀吉', '館の番兵は退いた。急げ、夜が明ける前に登りきるぞ', 3); }
      const wt = { x: HEAD.x - 4, z: HEAD.z + 12 };
      if (!F.watchOn && near(wt, 30)) { F.watchOn = true; F.watch.order = 'attack'; F.watch.seekRange = 30; rt.say('浅井の見張り', '谷の奥まで来ておる！　京極丸へ知らせよ！', 2.5); rt.marker('watch', centerOf(F.watch), () => `谷の奥の見張り・${moraleWord(F.watch.morale)}`, { red: true, group: F.watch }); }
      if ((d < 16 && gone(F.watch)) || (F.hideAt && rt.t - F.hideAt > 35) || rt.t - F.stepT > 160) this.assault(rt);
    }
    if (F.nests && F.step >= 1 && F.step <= 3) for (const nst of F.nests) {
      if (nst.seen || gone(nst.g)) continue;
      const dn = Math.hypot(p.x - nst.c.x, p.z - nst.c.z), dm = Math.hypot(p.x - nst.mouth.x, p.z - nst.mouth.z);
      // 鉄砲は遠くまで届く。近づく前でも、筒先を向けられた時点で避け方を知らせる。
      let aimed = false;
      for (const u of nst.g.units) if (u.alive && u.atk?.ranged && u.atk.target === rt.player.u) { aimed = true; break; }
      if (aimed || dn < 17 || dm < 11) { nst.seen = true; rt.army.play('eshout', nst.c, 1); sfx('far', 0.5); rt.bark('隠し銃座じゃ！　構えでは弾を防げぬ。横へ避け、塀の陰から後ろへ回れ'); rt.marker(nst.id, nst.c, () => '隠し銃座', { red: true, h: 3, group: nst.g }); }
    }
    if (F.step === 2) {
      while (F.kyoTrailIdx < CLIMB_UP.length - 1 && Math.hypot(p.x - CLIMB_UP[F.kyoTrailIdx][0], p.z - CLIMB_UP[F.kyoTrailIdx][1]) < 3) F.kyoTrailIdx++;
      F.trailPoint.x = CLIMB_UP[F.kyoTrailIdx][0]; F.trailPoint.z = CLIMB_UP[F.kyoTrailIdx][1];
      if (!F.onoDone && (gone(F.ono) || rt.t - F.stepT > 50)) this.onoFall(rt);
      const qs = [F.kyoGate, F.kyo, F.kyoAid].filter(Boolean);
      const left = qs.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0);
      rt.objProgress('main', `守り ${left}人`);
      for (const q of qs) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 15);
      // 門兵が崩れたら、曲輪の中の守りへ印を移す
      if (gone(F.kyoGate) && !F.kyoMark && !gone(F.kyo)) { F.kyoMark = true; rt.marker('kyo', centerOf(F.kyo), () => `京極丸の守り・${moraleWord(F.kyo.morale)}`, { red: true, group: F.kyo }); F.kyo.order = 'attack'; F.kyo.seekRange = 30; }
      if (rt.t - F.stepT > 22 && qs.every(gone)) this.cut(rt);
      else if (rt.t - F.stepT > 140) this.cut(rt, true);
    }
    if (F.step === 3) depthTick(rt, dt);
    if (F.step === 4) this.escortTick(rt, dt, p);
  },

  escortTick(rt, dt, p) {
    const F = rt.flags;
    // 位置と輪を使い回す。進行方向の先にいるだけでは、供と見なさない。
    const c = F.escPoint;
    let n = 0; c.x = 0; c.z = 0;
    for (const u of F.esc.units) if (u.alive) { c.x += u.pos.x; c.z += u.pos.z; n++; }
    if (n) { c.x /= n; c.z /= n; } else { c.x = F.esc.anchor.x; c.z = F.esc.anchor.z; }
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (F.escRing) rt.drapeRing(F.escRing, c.x, c.z);
    if (!F.escArrived && d > 18) F.escAway += dt;
    if (d > 18 && F.esc.order === 'path' && !F.escGo) {
      F.esc.order = 'hold'; F.escWaitT = rt.t; F.escCall = false;
      if (!(F.escBarkT > rt.t)) {
        F.escBarkT = rt.t + 8;
        rt.bark('一行が待っている。輿の輪の中、十歩以内へ戻れ');
      }
    } else if (!F.escArrived && d < 10 && F.esc.order === 'hold' && (!F.ochiOn || F.ochiOn === 'done')) {
      F.esc.order = 'path'; F.escWaitT = null;
    }
    // 要の位置は動かさない。曲がり道で中心へ置き直すと、壁を横切る道になる。
    if (!F.escArrived && F.esc.order === 'hold' && F.escWaitT != null && (!F.ochiOn || F.ochiOn === 'done')) {
      const w = rt.t - F.escWaitT;
      if (w > 18 && !F.escCall) { F.escCall = true; rt.say('藤掛永勝', `${nm(rt)}殿、輿の輪の中へ戻れ。十八歩以上離れると一行は待つ`, 3.5); }
      if (w > 36) { F.escGo = true; F.esc.order = 'path'; rt.say('藤掛永勝', '一行を先に陣へ進める。谷の陣の印へ続け', 3); }
    }
    if (F.escKoshi) { F.escKoshi.position.set(c.x, rt.world.heightAt(c.x, c.z) + 0.3, c.z); const q = F.esc.units.find((u) => u.alive); if (q) F.escKoshi.rotation.y = q.heading || 0; }
    // 谷へ下りた所で、落ち武者の小勢が一度寄ってくる
    if (!F.ochiOn && !F.escArrived && (F.esc.pathIdx || 0) >= ESCORT.length - 2) {
      F.ochiOn = true; F.ochiT = rt.t;
      F.esc.order = 'hold';
      let n = 0;
      for (const u of rt.squad) if (u.alive && !u.fleeing && !u.gone) n++;
      n = Math.min(n, F.escStrength ?? n);
      const foot = n < 4 ? 2 : n < 8 ? 4 : 6;
      F.ochi = enemyGroup(rt, { faction: 'saito', name: '落ち武者', anchor: { x: c.x - 22, z: c.z + 10 }, facing: Math.PI / 2, order: 'attack', seekRange: 24, aggro: 10, width: 8, morale: 60, fleeDir: { x: -1, z: 0 }, dmgMult: 0.5 }, depthLook(rt, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: foot }], AZAI));
      // 一行は狙わせず、道を押さえる織田の兵と戦わせる。強さは変えず、消耗した組には人数だけ減らす。
      rt.say('足軽', '谷道に落ち武者じゃ！　輿の輪の中で組と受けよ。追いかけるな', 4);
      rt.choose('屋敷の陰から落ち武者が出た。一行をどうする？', [
        { label: '一行を止め、落ち武者を追い払ってから進む', note: '輿のそば十歩で戦う。道が開けば進む' },
        { label: '一行を先へ急がせ、組の者と後ろを守る', note: '早く陣に着ける。組と後ろを受け、陣で合流する' },
      ], (i) => {
        if (i !== 1) return;
        F.ochiOn = 'done'; F.ochiRear = true; F.esc.order = 'path';
        rt.say('藤掛永勝', '一行を谷の陣へ進める。敵を追わず、陣で合流せよ', 3);
      }, 12);
      rt.marker('ochi', centerOf(F.ochi), () => `落ち武者・${moraleWord(F.ochi.morale)}`, { red: true, group: F.ochi });
    }
    if (F.ochiRear && F.ochi && gone(F.ochi)) { F.ochiRear = false; rt.unmark('ochi'); rt.award((t) => t.side.push('一行を止めずに落ち武者を退けた'), '一行を止めずに落ち武者を退けた'); }
    if (F.ochiOn === true && rt.t - F.ochiT > 35) { F.ochi.noRout = false; F.ochi.morale = 0; F.ochiOn = 'done'; F.esc.order = 'path'; rt.say('藤掛永勝', '道は開いた。一行を陣へ急がせましょう', 3); }
    if (F.ochi && gone(F.ochi) && F.ochiOn !== 'done') { F.ochiOn = 'done'; rt.unmark('ochi'); F.esc.order = 'path'; rt.say('藤掛永勝', '道は開いた。輿の輪に付いて、谷の陣へ進め', 2.5); }
    if (F.ochi && F.ochi.count && F.ochi.count < 4) F.ochi.morale = Math.min(F.ochi.morale, 15);
    const left = Math.max(0, Math.ceil(Math.max(180, ESCORT_SECONDS + 90) - (rt.t - F.stepT)));
    rt.objProgress('main', `${d < 10 ? 'そばで守れている' : F.esc.order === 'hold' ? '輿の輪へ戻れ' : '輿に続け'}・陣まで ${Math.round(Math.hypot(c.x - ODA_POST.x, c.z - ODA_POST.z))}歩・残り${left}秒`);
    if (F.escArrived && Math.hypot(p.x - ODA_POST.x, p.z - ODA_POST.z) < 18) this.win(rt);
    else if (F.escArrived) rt.objProgress('main', '一行は陣に着いた。谷の陣の印へ戻れ');
    if (rt.t - F.stepT > Math.max(180, ESCORT_SECONDS + 90) && !F.ending) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、浅井 五千ほど。数には諸説ある）
odani.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 5000 - (F.ek || 0) * 40 - (F.komaDown ? 900 : 0)), b0: 5000 };
};
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
odani.noWake = true;
odani.rts = true;
// 総大将（taisho.js）：長政は本丸の御殿の奥。討ち取りの流れはこの定義が持つ（最期は史実の文で）。
// 味方の殿（信長）は虎御前山の遠くの本陣なので、ここには置かない（殿を狙う一隊も来ない）
odani.taisho = { a: null, b: { name: '浅井長政', def: true } };
odani.noTaishoRaid = true;
// 味方の軽い兵は本物に替えにくく（本物の兵が増えすぎない。京極丸は狭い）
odani.wakeAllyNear = 0.25;
odani.wakeFoeNear = 0.5;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous）。長政・久政は前線に出さない
odani.famous = [
  { name: '竹中重治', team: 0, g: /鉄砲衆/, line: '竹中半兵衛じゃ。京極丸を取れば、本丸と小丸は切れる' },
  { name: '赤尾清綱', g: /赤尾/, near: true, line: '浅井の赤尾清綱なり！　京極丸、返してもらうぞ！' },
];
odani.date = (rt) => `天正元年八月　秋・${rt.flags.step >= 3 ? '夜明け' : '未明'}`;
odani.canSkip = (rt) => {
  const F = rt.flags;
  if (rt.phase === 'brief' && rt.t > 3) return '登りの下知まで待つ';
  if (rt.phase === 'climb' && F.watchOn && gone(F.watch)) return '京極丸の下まで登る';
  if (rt.phase === 'escort' && F.ochiOn === 'done') return '谷の陣まで供をする';
  return '';
};
odani.skip = (rt) => {
  const F = rt.flags;
  const put = (units, x, z) => { for (const u of units) if (u.alive) { u.pos.x = x + (Math.random() - 0.5) * 4; u.pos.z = z + (Math.random() - 0.5) * 4; } };
  if (rt.phase === 'climb') { put([rt.player.u, ...rt.squad, ...F.hide.units], BELOW.x, BELOW.z); return; }
  if (rt.phase === 'escort') { put([rt.player.u, ...rt.squad, ...F.esc.units], ODA_POST.x + 3, ODA_POST.z - 6); F.esc.pathIdx = ESCORT.length - 1; return; }
  for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2);
};
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉義景を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた大きな山城だった。番所・御茶屋・御馬屋・桜馬場・大広間・本丸・中丸・京極丸・小丸・山王丸が並び、本丸の北は大堀切で断たれていた。西の清水谷には浅井氏の居館や家臣の屋敷が並んでいた。南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返した。九月一日、本丸の下の赤尾屋敷で自害したと伝わる（日付・場所には異説がある）。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。秀吉が攻め上った道（清水谷からとも）や、一行を送った者の名には諸説がある。兵の数にも諸説ある。';
// 信長で遊ぶ時：居場所の目安と立つ所（清水谷の口の羽柴の手のそば）
odani.lordAt = { x: MOUTH.x, z: MOUTH.z, r: 16, why: '清水谷の口（羽柴の手が京極丸へ攻め上る支度をしている）' };
odani.lordSpawn = { x: MOUTH.x + 6, z: MOUTH.z + 10, heading: Math.PI - 0.2 };

// 素直な遊び手：秀吉について清水谷を登り、京極丸で戦い、段を戦い、お市の方の一行のそばを歩く
odani.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.step === 3 && F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  // 傷は自然回復しない。短く退いて手当てを試し、全快を待たず任務へ戻る。
  if (F.step < 4 && u.hp < u.maxHp * 0.5 && !b.botRest && !(b.botRestNext > b.t)) {
    b.botRest = true; b.botRestUntil = b.t + 12;
  }
  if (b.botRest && (F.step >= 4 || b.t >= b.botRestUntil || p.bandaged)) {
    b.botRest = false; b.botRestNext = b.t + 20;
  }
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    const c = F.hide.center();
    goTo(p, inp, c.x + 3, c.z + 3, 2);
    return;
  }
  const entering = F.step === 2 && b.botKyoWp !== CLIMB_UP.length;
  const e = b.army.nearestEnemy(u, entering ? 3 : 12, (o) => !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  if (e && F.step < 4) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) goTo(p, inp, e.pos.x, e.pos.z, 2.6);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.8;
    return;
  }
  inp.guardHold = false;
  if (F.step <= 1) {
    if (F.step === 0) { const a = F.hideU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3); return; }
    b.botWp = b.botWp || 2;
    const w = CLIMB[Math.min(b.botWp, CLIMB.length - 3)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 4 && b.botWp < CLIMB.length - 3) b.botWp++;
    goTo(p, inp, w[0], w[1], 2);
    return;
  }
  if (F.step === 2) {
    // 食い違いの口は、壁に沿う折れ点を順に通る。門へ直進すると壁の前で止まる。
    if (b.botKyoWp == null) {
      let best = 0, d = Infinity;
      for (let i = 0; i < CLIMB_UP.length; i++) { const w = CLIMB_UP[i], n = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z); if (n < d) { best = i; d = n; } }
      b.botKyoWp = best;
    }
    while (b.botKyoWp < CLIMB_UP.length && Math.hypot(CLIMB_UP[b.botKyoWp][0] - u.pos.x, CLIMB_UP[b.botKyoWp][1] - u.pos.z) < 2) b.botKyoWp++;
    if (b.botKyoWp < CLIMB_UP.length) { const w = CLIMB_UP[b.botKyoWp]; goTo(p, inp, w[0], w[1], 1.2); return; }
    const q = [F.kyoGate, F.kyo, F.kyoAid].find((x) => x && !gone(x));
    const t = q ? q.center() : KC;
    goTo(p, inp, t.x, t.z, 2);
    return;
  }
  if (F.step === 3) { goTo(p, inp, KC.x, KC.z, 3); return; }
  if (F.step === 4 && F.esc) {
    const c = F.esc.center();
    if (F.escArrived) { goTo(p, inp, ODA_POST.x, ODA_POST.z, 3); return; }
    // 輿の輪の近くに来た敵だけを受け、外へ追わない。
    if (e && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 10 && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 10) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.6) goTo(p, inp, e.pos.x, e.pos.z, 2.6);
      if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
      inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.8;
      return;
    }
    // 下りも折れ点を順に通す。輿への直進で食い違いの壁や急斜面を切らない。
    const idx = Math.min(F.esc.pathIdx || 0, ESCORT.length - 1);
    if (b.botEscWp == null) {
      let best = 0, d = Infinity;
      for (let i = 0; i <= idx; i++) { const w = ESCORT[i], n = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z); if (n < d) { best = i; d = n; } }
      b.botEscWp = best;
    }
    const w = ESCORT[b.botEscWp];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 1.5 && b.botEscWp < idx) b.botEscWp++;
    if (b.botEscWp < idx || b.army.wallBetween(u.pos, u.team, c, false)) {
      const q = ESCORT[b.botEscWp]; goTo(p, inp, q[0], q[1], 1); return;
    }
    goTo(p, inp, c.x, c.z, 3);

  }
};

// ---- 京極丸を取った後の段（分断の後の寄せ→判断→小丸へ攻め上がる） ----
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
function odSteps() {
  const N = { x: 0, z: GATE_NAKA_KYO.z + 2 }, Kn = { x: 0, z: GATE_KYO_KOMA.z - 3 };
  return [
    hold({ at: { x: KC.x, z: KC.z }, dur: 55, r: 15, title: '南北からの寄せ', sub: '本丸の長政と、小丸の久政が、京極丸を取り返しに来る', label: '京極丸', obj: '京極丸を守れ（南と北から寄せてくる）',
      waves: [
        { t: 5, say: ['足軽', '南の中丸の門から来た！　長政殿の兵じゃ！'], foes: () => [{ name: '長政の手（中丸から）', from: { x: 0, z: NAKAMARU.cz }, list: [uS(2), uA(8), uB(1)], mass: 120, noRout: 15 }] },
        { t: 22, say: ['足軽', '北の小丸からもじゃ！　背を合わせよ！'], foes: () => [{ name: '久政の手（小丸から）', from: { x: 0, z: KOM.cz }, list: [uS(1), uA(7), uG(1)], mass: 100 }] },
        { t: 38, say: ['羽柴秀吉', '本丸の老臣が自ら来たぞ！　門の口で受けよ！'], foes: () => [{ name: '赤尾の手', from: { x: 0, z: NAKAMARU.cz }, list: [uS(2), uA(7)], mass: 110 }] },
      ],
      reward: '京極丸で南北の寄せを受け止めた', lost: ['羽柴秀吉', '押された……じゃが、京極丸はまだ我らのものじゃ！'] }),
    rest({ dur: 6, heal: 0.3, say: [['羽柴秀吉', '退いたな。……小丸の久政殿は、もう本丸から助けが来ぬ'], ['羽柴秀吉', '今のうちに小丸へ攻め上がる。久政殿を追い詰めれば、浅井は崩れる']] }),
    pick({ title: '小丸へ、どこから攻め上がる？',
      options: [{ label: '門から真っすぐ押し上がる', note: '組と一緒に進める。正面の守りは厚い' }, { label: '西の崖の腰曲輪から回り込む', note: '守りの横を突ける。崖の上で数は少ない' }],
      on: (rt, m, i) => {
        m.side = i === 1; rt.say('羽柴秀吉', i === 1 ? 'よし、崖から回れ！　門の守りの横を突け！' : '門を押せ！　小丸へ攻め上がれ！', 3);
        // 清水谷から羽柴の後詰が登ってきて、京極丸の手に加わる（後ろの絵の兵は付けない）
        const F = rt.flags;
        if (!F.aid) {
          F.aid = allyGroup(rt, { name: '羽柴の後詰', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: Math.PI, width: 10, aggro: 12, noRout: true, dmgMult: 0.9 },
            dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
          F.aid.defMult = 1.3;
          rt.bark('清水谷から羽柴の後詰が登ってきた');
        }
      } }),
    fight({ at: (rt, m) => (m.side ? { x: KOMA_WEST[KOMA_WEST.length - 1][0], z: KOMA_WEST[KOMA_WEST.length - 1][1] } : Kn), title: '小丸へ', sub: '狭く高い、久政の曲輪へ攻め上がる', obj: '小丸へ攻め上がり、守りを崩せ',
      foes: (rt, m) => [{ name: '小丸の守り', from: { x: 0, z: KOM.cz }, list: [uS(m.side ? 1 : 2), uA(m.side ? 6 : 8), uB(2)], mass: 110, noRout: m.side ? 6 : 12, morale: m.side ? 70 : 85 }],
      later: [{ t: 34, title: '山王丸から', sub: '北の詰の城から、小丸を救いに下りてくる', say: ['足軽', '山王丸から兵が下りてくる！'], foes: () => [{ name: '山王丸の兵', from: { x: 0, z: SANNO.z1 - 4 }, list: [uS(1), uA(6), uG(1)], mass: 100 }] }],
      max: 110, reward: (t, m) => { t.special = { label: m.side ? '崖から回り込み、小丸の守りを崩した' : '小丸へ攻め上がり、守りを崩した', pts: 20 }; }, rewardLabel: '小丸の守りを崩した' }),
  ];
}


// 信長公記巻六：虎御前山の囲み、清水谷から京極丸、本丸の長政と小丸の久政。
// 小谷の攻略の段は変えず、既存の曲輪・屋敷と遠景へ結ぶ。
installBattleJinkei(odani, [
  battleJin('付城と谷の仕寄り', 0, { x: 70, z: 160 }, Math.PI, [
    ['odani_nobunaga', '本陣・虎御前山方面', '織田信長', 6000, { x: 70, z: 176 }, 'eiraku', 'oda', null, { named: false }],
    ['odani_hide', '清水谷・京極丸への仕寄り', '羽柴秀吉', 4000, MOUTH, 'oda', 'oda', (r) => r.flags.hide, { form: 'column' }],
    ['odani_hachi', '谷の先手', '蜂須賀正勝', 1000, { x: MOUTH.x + 8, z: MOUTH.z + 4 }, 'hachisuka', 'hachisuka', (r) => r.flags.hachi, { form: 'column' }],
    ['odani_valley', '清水谷の控え', '羽柴秀吉の手', 3000, { x: MOUTH.x - 10, z: MOUTH.z + 24 }, 'oda', 'oda', null, { named: false }],
    ['odani_east', '東の囲みの陣', '織田の衆（将の名は不明）', 6000, { x: 110, z: -30 }, 'oda', 'oda', null, { named: false }],
    ['odani_northeast', '東の尾根を塞ぐ陣', '織田の衆（将の名は不明）', 4000, { x: 118, z: -110 }, 'oda', 'oda', null, { named: false }],
    ['odani_south', '南の付城・大手の仕寄り', '織田の衆（将の名は不明）', 6000, { x: -40, z: 168 }, 'oda', 'oda', null, { named: false }],
  ], '織田三万の目安。付城・攻め口の担当が不明な所へ将の名を作らない。羽柴の京極丸攻めを主とする。'),
  battleJin('尾根の曲輪と家臣の屋敷の守り', 1, HONC, 0, [
    ['odani_nagamasa', '本陣・本丸', '浅井長政', 1500, HONC, 'azai', 'azai', (r) => r.taisho?.b?.g],
    ['odani_hisamasa', '小丸', '浅井久政', 900, KOMC, 'azai', 'azai', null, { draw: true, named: false, w: 8, d: 5, count: 32 }],
    ['odani_kyogoku', '京極丸・西の木戸', '将の名は不明', 700, { x: KC.x + 3, z: KC.z }, 'azai', 'azai', (r) => r.flags.kyo, { named: false }],
    ['odani_nakamaru', '中丸', '将の名は不明', 500, { x: NAKAMARU.x, z: NAKAMARU.cz }, 'azai', 'azai', (r) => r.flags.kyoAid, { named: false }],
    ['odani_ohiroma', '大広間・大手の守り', '将の名は不明', 600, { x: OOHIROMA.x, z: OOHIROMA.cz }, 'azai', 'azai', (r) => r.flags.azHon, { named: false }],
    ['odani_sanno', '山王丸', '将の名は不明', 300, { x: SANNO.x, z: SANNO.cz }, 'azai', 'azai', (r) => r.flags.azSanno, { named: false }],
    ['odani_ono', '大野木屋敷', '大野木秀俊の手', 250, { x: ONOGI.x, z: ONOGI.z + 3 }, 'azai', 'azai', (r) => r.flags.ono],
    ['odani_akao', '赤尾屋敷・本丸の下', '赤尾清綱の手', 250, { x: AKAO.x, z: AKAO.z }, 'azai', 'azai', null],
  ], '浅井五千の目安を割り振った復元。長政と久政の居所を採用し、他の曲輪の将は不明とする。'),
]);

export { odani };
