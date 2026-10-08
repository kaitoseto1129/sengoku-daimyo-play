import { pressureTick } from './battle_pressure.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　小谷城の戦い（天正元年八月〜九月）　docs/late6-1573-1575-spec.md 14〜37章
// 刀根坂で朝倉を破った信長は、その足で北近江の小谷城を囲んだ。羽柴秀吉は夜、清水谷から尾根の真ん中の
// 京極丸へ攻め上り、南の本丸（浅井長政）と北の小丸（父の久政）とを切り離した。
// 足軽は羽柴秀吉の手。①清水谷（浅井の居館と屋敷の谷）を登る ②京極丸を取る ③分断：両方からの寄せを受ける
// ④小丸へ攻め上がる。久政・長政の最期とお市の退去は戦後の知らせ。
// そのあいだ南の大手では、織田の本隊が番所→御茶屋→御馬屋→桜馬場→黒金御門と
// 一段ずつ攻め上がっていく（遠景の合戦）。「本丸を取れば終わり」でなく、城の真ん中を割って崩す戦。
// 縄張りは castles/odani.js（梯郭の曲輪・大堀切・門・櫓・清水谷の道）。大将格（長政・久政）は前線に出さない。
// 向き：主尾根は南北（北 -z が高い）。清水谷は尾根の西（-x）。信長の本陣（虎御前山）は南の遠く。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cgtOn, cgtBox, cgtSpend, cgtScene, whenCgt, KitBatch, kitStoneSeg } from './cgt.js';
import { yokoyaZa, hiddenGunNest, takaDorui, nobori, hut, campfire, ishigaki, kagaribi, umatsunagi, dou, kabukimon, dorui, palisade, tawara, castleMat, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildOdaniUpper } from './odani_upper.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { applyLook, dress, gone } from './b_inabayama.js';
import { clash } from './b_sekigahara.js';
import { buildCastlePlan, heightOf, inPoly } from './castle_plan.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { KIT } from './b_nagashinojo.js';
import { odaniExtraHeight, odaniExtraClear, buildOdaniFukugen } from './odani_fukugen.js';
import {
  ODANI_PLAN, RIDGE, STONE_KURUWA, crestAt, BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, SANNO2, KYOGOKU2, OKURIDGE, UPPER,
  UMAARAI, OHORIKIRI, GATE_KURO, GATE_NAKA_KYO, GATE_KYO_KOMA, GATE_WEST, SHIMIZU, SHIMIZU_FLOOR, CLIMB_UP, KOMA_WEST, demH, KUICHIGAI, NESTS, YOKOYA, ONOGI, AKAO, KYOKAN, TERA, YASHIKI, ROAD_RIDGE, OTE_CLIMB,
} from './castles/odani.js';

// 縄張りの床は回転した標高の尾根に沿わせ、清水谷と門の道だけ歩ける幅にならす。
const KC = { x: KYO.x, z: KYO.cz };                       // 京極丸の真ん中
const KOMC = { x: KOM.x, z: KOM.cz };
const HONC = { x: HON.x, z: HON.cz };
const MOUTH = { x: -93, z: 86 };   // 清水谷の中ほど（羽柴の手が集まる所。谷の口から忍んで入った）
const HEAD = { x: SHIMIZU[SHIMIZU.length - 1][0], z: SHIMIZU[SHIMIZU.length - 1][1] };   // 谷の奥
const BELOW = { x: CLIMB_UP[2][0], z: CLIMB_UP[2][1] };   // 京極丸の西の口の下
const CLIMB = [...SHIMIZU, ...CLIMB_UP.slice(1)];
const VALLEY_ROUTE = [[MOUTH.x, MOUTH.z], ...CLIMB.slice(2, SHIMIZU.length + 2)];
const AMBUSH_IDS = ['yakata', 'watch'];
const LOOKOUT_WAY = [[KYO.x + 9, KYO.z0 + 15], [KYO.x + 9, KYO.z0 + 7.9]];
const LOOKOUT_RAMP = { ha: null, hb: null };
// 待ち伏せの後続は、初めに決めた持ち場で待つ。三人ずつ交代する。
function ambushSpace(army, u) {
  if (u.odaniWait && !u.odaniReleased) return u.odaniWait;
  return null;
}

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
const ODA = { flag: 'oda' };
const AZAI = { flag: 'azai' };
const AZ_ARMOR = 0x2e2a26, ODA_ARMOR = 0x2b3140;
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { if (!rt.flags.ending) rt.obj('main', text, 'main'); };
// 羽柴秀吉の見た目（units.js の GENERALS は「木下藤吉郎」の名で持つので、同じ兜・羽織を渡す）
const HIDE = { hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a };
// 八月二十七日の夜の攻め。月齢・晴雨を確定せず、朝並みの照明を避ける。
const PREDAWN = { sky: 0x18212f, fog: 0x26303d, sun: 0x9caac4, sunI: 0.65, hs: 0x8996ae, hg: 0x35332e, hI: 1.1, top: 0x101722, glow: 0.03, dir: [0.6, 0.55, -0.3], mount: 0x141820 };

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
// 周りの砦（推定復元）：西尾根の山崎丸・福寿丸、主郭背後の月所丸。大嶽以外は当夜の軍旗を断定しない。
const FORTS = [
  { id: 'otake', name: '大嶽', x: -128, z: -190, h: 0, flag: 'oda' },
  { id: 'kingo', name: '金吾丸', x: -32, z: 168, h: 0, flag: null },
  { id: 'fukuju', name: '福寿丸', x: -150, z: 142, h: 0, flag: null },
  { id: 'yamazaki', name: '山崎丸', x: -154, z: 64, h: 0, flag: null },
  { id: 'gessho', name: '月所丸', x: 18, z: -218, h: 0, flag: null },
];
// 屋敷の平場：斜面を削って平らにする（大野木屋敷・赤尾屋敷）。高さは中心の元の高さ
const VILLAGE = [[-104, 167, .1], [-130, 174, -.2], [-75, 170, .1], [-143, 158, -.1]];
const TERR = [...VILLAGE.map(([x, z]) => ({ x, z, r: 6 })), { x: ONOGI.x, z: ONOGI.z, r: 12 }, { x: AKAO.x, z: AKAO.z, r: 12 }, ...FORTS.map((f) => ({ x: f.x, z: f.z, r: 9, f }))];
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
  // 麓の田の平場。畦の外では草の斜面へなだらかにつなぐ。
  if (z > 176 && z < 229 && x > -154 && x < -61) {
    const edge = Math.min(z - 176, 229 - z, x + 154, -61 - x);
    const k = Math.min(1, edge / 3);
    h += (Math.max(0, SHIMIZU_FLOOR[0] - 4) - h) * k;
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
// 国土地理院の標高を下地にした推定復元。谷・曲輪・道は加工しており、実測地形そのものではない。
// 尾根の背の広さ（曲輪の半幅＋2m。曲輪の間は外へ薄れる）：背をこの幅で平らにし、両側へ 0.75 の勾配で落とす。
// 実測の背は曲輪より細く、そのままだと曲輪の縁が数十 m の垂直の壁になる
const RIDGE_ALL = [...RIDGE, KYOGOKU2, SANNO2, ...OKURIDGE];
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
  const lo = RIDGE[i] === KYO ? KYOGOKU2 : RIDGE[i], up = RIDGE[i + 1];
  RAMPS.push({ a: [0, lo.z0 + 3], b: [0, up.z1 - 3], w: up === HON ? 3.4 : 2.6 });
}
const OTE_LEN = [0];
for (let i = 1; i < OTE_CLIMB.length; i++) OTE_LEN.push(OTE_LEN[i - 1] + Math.hypot(OTE_CLIMB[i][0] - OTE_CLIMB[i - 1][0], OTE_CLIMB[i][1] - OTE_CLIMB[i - 1][1]));
const oteFoot = baseTerrain(...OTE_CLIMB[0]);
for (let i = 1; i < OTE_CLIMB.length; i++) RAMPS.push({ a: OTE_CLIMB[i - 1], b: OTE_CLIMB[i], w: 1.2, ha: oteFoot + (BANSHO.level - oteFoot) * OTE_LEN[i - 1] / OTE_LEN.at(-1), hb: oteFoot + (BANSHO.level - oteFoot) * OTE_LEN[i] / OTE_LEN.at(-1) });
RAMPS.push({ a: [0, KYOGOKU2.z1 + 5], b: [0, KYOGOKU2.z1 - 2], w: 2.6 });
for (let i = 0; i < OKURIDGE.length; i++) {
  const lo = i ? OKURIDGE[i - 1] : SANNO2, up = OKURIDGE[i];
  RAMPS.push({ a: [0, lo.z0 + 2], b: [0, up.z1 - 2], w: 2.2 });
}
RAMPS.push({ a: [0, BANSHO.z1 + 10], b: [0, BANSHO.z1 - 3], w: 2.6 });
RAMPS.push({ a: [0, SANNO2.z1 + 5], b: [0, SANNO2.z1 - 2], w: 2.2 });
// 西の脇道は、曲輪の平場から小丸の脇口まで坂をつなぐ。堀全体や切岸はならさない。
const WEST_LEN = [0];
for (let i = 1; i < KOMA_WEST.length; i++) WEST_LEN.push(WEST_LEN[i - 1] + Math.hypot(KOMA_WEST[i][0] - KOMA_WEST[i - 1][0], KOMA_WEST[i][1] - KOMA_WEST[i - 1][1]));
const westH = (i) => KYO.level + (KOM.level - KYO.level) * Math.max(0, (WEST_LEN[i] - WEST_LEN[2]) / (WEST_LEN[WEST_LEN.length - 1] - WEST_LEN[2]));
for (let i = 1; i < KOMA_WEST.length; i++) RAMPS.push({ a: KOMA_WEST[i - 1], b: KOMA_WEST[i], w: 1.4, ha: westH(i - 1), hb: westH(i) });
for (let i = ROUTE_O.length - 2; i < ROUTE_O.length; i++) RAMPS.push({ a: ROUTE_O[i - 1], b: ROUTE_O[i], w: 1.6 });
// 堀切の窪みを世界の高さへ混ぜる。大堀切の端と土橋だけ、小谷の実寸に合わせる。
const HORI = ODANI_PLAN.hori.map((h) => {
  const dip = horiboriHeight(h.pts, { depth: h.deep, width: h.w });
  if (h.kind !== 'horikiri' || h.pts[0][1] !== OHORIKIRI.z) return dip;
  const side = Math.sign(h.pts[0][0]);
  // 線の丸い端は幅15mの半径で土橋と反対側まで削る。大堀切だけ東西40mの範囲へ切り、土橋を残す。
  return (x, z) => {
    const ax = x * side;
    if (ax <= 2.6 || ax >= OHORIKIRI.len / 2) return 0;
    return dip(x, z) * Math.min(1, (ax - 2.6) / 1.5, (OHORIKIRI.len / 2 - ax) / 1.5);
  };
});
const baseWithHori = (x, z) => HORI.reduce((a, f) => a + f(x, z), baseTerrain(x, z));
let H0 = null;
function height(x, z) {
  if (!H0) {
    H0 = heightOf(ODANI_PLAN, baseWithHori, 6);
    for (const r of RAMPS) { r.ha ??= H0(r.a[0], r.a[1]); r.hb ??= H0(r.b[0], r.b[1]); r.len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) || 1; }
  }
  let h = H0(x, z);
  // 曲輪の切岸を重ねても深さ10mを埋め戻さない。南北の縁を結ぶ高さから堀底を取る。
  if (Math.abs(z - OHORIKIRI.z) < OHORIKIRI.w / 2) {
    const dip = HORI[0](x, z) + HORI[1](x, z);
    if (dip < 0) {
      const t = (HON.z0 - z) / (HON.z0 - NAKAMARU.z1);
      h = Math.min(h, HON.level + (NAKAMARU.level - HON.level) * t + dip);
    }
  }
  // 中央の土橋と小丸の脇道は、今までの歩ける坂を最後に重ねる。
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
  // 屋敷の台と腰曲輪は、描く平場と歩く高さをそろえる。
  h = odaniExtraHeight(x, z, h);
  // 京極丸の櫓へは南の広場から緩く登る。切岸のほかの部分は残す。
  const a = LOOKOUT_WAY[0], b = LOOKOUT_WAY[1];
  if (LOOKOUT_RAMP.ha == null) {
    LOOKOUT_RAMP.ha = odaniExtraHeight(a[0], a[1], H0(a[0], a[1]));
    LOOKOUT_RAMP.hb = odaniExtraHeight(b[0], b[1], H0(b[0], b[1]));
  }
  const t = (z - a[1]) / (b[1] - a[1]), side = Math.abs(x - a[0]);
  if (t >= 0 && t <= 1 && side < 2.8) {
    const k = side <= 1.4 ? 1 : (2.8 - side) / 1.4;
    h += (LOOKOUT_RAMP.ha + (LOOKOUT_RAMP.hb - LOOKOUT_RAMP.ha) * t - h) * k;
  }
  // 池の石組みの内側だけ浅く下げる。御馬屋の土塁を水面へ重ねない。
  const pd = Math.max(Math.abs(x - UMAARAI.x) - UMAARAI.w / 2, Math.abs(z - UMAARAI.z) - UMAARAI.d / 2);
  if (pd < 0.4) {
    const k = pd <= 0 ? 1 : 1 - pd / 0.4;
    h += (ONMAYA.level - 0.35 - h) * k;
  }
  return h;
}


// 見た目だけの復元説。床・門の幅・壁の区間・西の攻め道の当たりは組み立て済みの物を使う。
function dressOdaniCastle(rt, C, start) {
  const W = rt.world, earth = castleMat('plaster').clone(), board = castleMat('wood').clone();
  earth.color.setHex(0xb29668); board.color.setHex(0x73634d);
  const wallBodies = [];
  for (const root of rt.scene.children.slice(start)) root.traverse((m) => {
    if (!m.isMesh) return;
    if (m.material === castleMat('plaster')) {
      m.material = earth;
      if (m.isBatchedMesh) wallBodies.push(m);
    } else if (m.material === castleMat('tile')) m.material = board;
  });
  // 櫓門の瓦の形も、反りのない二枚の板屋根へ替える。柱・扉・渡櫓の床はそのまま。
  for (const g of ODANI_PLAN.koguchi) {
    if (g.gate !== 'yagura') continue;
    const obj = C.gateObjs[g.id], parts = [], y = obj?.naka ? obj.naka.levels[0].y + 2.05 : W.heightAt(...g.at) + 6;
    obj?.mesh?.traverse((m) => {
      if (!m.isMesh || m.material !== board) return;
      for (const sd of [-1, 1]) {
        const geo = new THREE.BoxGeometry(g.w + 7.2, 0.1, 3.3);
        geo.rotateX(sd * 0.52); geo.translate(0, 0.8, sd * 1.43);
        geo.rotateY(g.rot || 0); geo.translate(g.at[0], y, g.at[1]); parts.push(geo);
      }
      const geo = mergeGeometries(parts);
      // 板の材質は頂点色を読むので、元の瓦と同じ白を下地に付ける。
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
      m.geometry.dispose(); m.geometry = geo;
      for (const part of parts) part.dispose();
    });
  }
  const batch = makeKitBatch(), stoneRuns = [];
  for (const k of STONE_KURUWA.filter((k) => !UPPER.includes(k))) {
    const walls = C.walls.filter((w) => w.seg && w.name === k.name), runs = [];
    let run = null;
    for (const w of walls) {
      const [ax, az, bx, bz] = w.seg, end = run?.[run.length - 1];
      if (!end || Math.hypot(end[0] - ax, end[1] - az) > 0.1) { run = [[ax, az]]; runs.push(run); }
      run.push([bx, bz]);
    }
    // 多角形の始めと終わりもつなぐ。切れ目は既存の虎口と脇口だけ。
    if (runs.length > 1) {
      const last = runs[runs.length - 1], end = last[last.length - 1], first = runs[0];
      if (Math.hypot(end[0] - first[0][0], end[1] - first[0][1]) < 0.1) { runs[0] = [...last, ...first.slice(1)]; runs.pop(); }
    }
    for (const pts of runs) {
      // 門の前には石の張り出しを置かない。元の開口より少し広く空ける。
      for (const [i, j] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
        const a = pts[i], b = pts[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.min(0.7, len / 3) / len;
        a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t;
      }
      const top = k.level + (ODANI_PLAN.kuruwa.find((q) => q.id === k.id).dorui ?? 1.3);
      const mesh = ishigaki(W, pts, { topY: top, minH: k === SANNO ? 5 : 3.4, maxH: k === SANNO ? 5.8 : 4.8, lean: 0.14, out: 1, big: 1.8, capIn: 0.35, batch, noKit: true });
      stoneRuns.push({ pts, top, mesh, k });
    }
  }
  finalizeKitBatch(rt, batch);
  if (!cgtOn()) return;
  // 買った塀・石垣を城全体でまとめる。白壁の部品は土色にし、笠は上の板屋根を使う。
  whenCgt(() => {
    if (cgtScene() !== rt.scene) return;
    const box = cgtBox('Wall_White_Plain_H1'), kb = new KitBatch();
    const walls = C.walls.filter((w) => w.seg && STONE_KURUWA.some((k) => k.name === w.name));
    const estimate = walls.reduce((n, w) => n + Math.max(1, Math.round(Math.hypot(w.seg[2] - w.seg[0], w.seg[3] - w.seg[1]) / 1.8)) * 120, 0);
    if (box && cgtSpend(estimate)) {
      for (const w of walls) {
        const [ax, az, bx, bz] = w.seg, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.8)), rot = Math.atan2(-(bz - az), bx - ax);
        const sx = len / n / (box.h[0] * 2), sy = 1.45 / (box.h[1] * 2), sz = 0.36 / (box.h[2] * 2);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const ox = box.c[0] * sx, oz = box.c[2] * sz;
          kb.add('Wall_White_Plain_H1', x - ox * Math.cos(rot) - oz * Math.sin(rot), W.heightAt(x, z) + 1.575 - box.c[1] * sy, z + ox * Math.sin(rot) - oz * Math.cos(rot), rot, sx, sy, sz);
        }
      }
      if (kb.n) {
        const group = kb.build(), kitEarth = earth.clone();
        kitEarth.vertexColors = false;
        group.traverse((m) => { if (m.isMesh) m.material = kitEarth; });
        rt.scene.add(group);
        for (const m of wallBodies) m.visible = false;
      }
    }
    // 予算の届く石垣だけ部品へ替える。届かない曲輪も粗い野面積みを残す。
    const stones = new KitBatch();
    for (const r of stoneRuns) {
      const cost = r.pts.slice(1).reduce((n, b, i) => n + Math.hypot(b[0] - r.pts[i][0], b[1] - r.pts[i][1]) / 2 * 1500, 0);
      if (!cgtSpend(cost)) continue;
      const before = stones.n;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const botAt = (t) => {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const ground = Math.min(W.heightAt(x + nx * 2.5, z + nz * 2.5), W.heightAt(x + nx * 5, z + nz * 5));
          return Math.max(r.top - (r.k === SANNO ? 5.8 : 4.8), Math.min(ground, r.top - (r.k === SANNO ? 5 : 3.4)) - 0.4);
        };
        kitStoneSeg(stones, { ax, az, bx, bz, side: 1, seed: i * 17, extA: 0, extB: 0, topAt: () => r.top, botAt, zs: 0.7 });
      }
      if (stones.n > before) r.mesh.visible = false;
    }
    if (stones.n) rt.scene.add(stones.build());
  });
}

// 歩く坂の包絡面に沿う薄い石の踏み面。門の開口幅・坂・道の当たりは変えない。
function addOdaniSteps(rt) {
  const steps = [], dummy = new THREE.Object3D(), color = new THREE.Color();
  for (const g of ODANI_PLAN.koguchi) {
    if (g.gate !== 'yagura' || g.id !== 'g_west') continue;
    const west = g.id === 'g_west', lo = RIDGE.find((k) => k.id === g.from);
    const a = west ? [g.at[0] - 5, g.at[1]] : [0, lo ? lo.z0 + 2 : g.at[1] + 6];
    const dx = g.at[0] - a[0], dz = g.at[1] - a[1], len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 0; i < n; i++) steps.push({ x: a[0] + dx * (i + 0.5) / n, z: a[1] + dz * (i + 0.5) / n, d: len / n, rot: g.rot || 0, w: Math.min(4, g.w - 0.6) });
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8a8880 }), steps.length);
  steps.forEach((q, i) => {
    dummy.position.set(q.x, rt.world.heightAt(q.x, q.z) - 0.04, q.z); dummy.rotation.set(0, q.rot, 0); dummy.scale.set(q.w, 0.12, q.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setScalar(0.84 + (i % 5) * 0.035));
  });
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 南西の琵琶湖・竹生島・平野の村。位置と縮尺は遠景用の補い、城の中へ当たりを増やさない。
function addOdaniView(rt) {
  const groups = { land: [], water: [], wall: [], roof: [] };
  const box = (key, x, y, z, w, h, d, rot = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, y, z); groups[key].push(g); };
  box('land', -265, -2, 300, 410, 2, 270, -0.22);
  // 山麓の外の平野へ続く畑と村。家も田も材質ごとに一つへまとめる。
  for (let i = 0; i < 24; i++) {
    const x = -130 - (i % 6) * 28, z = 205 + Math.floor(i / 6) * 36;
    box('land', x, 0, z, 22, 0.3, 25, -0.22);
    if (i % 3 === 0) {
      box('wall', x, 1.5, z, 8, 3, 5);
      for (const sd of [-1, 1]) {
        const roof = new THREE.BoxGeometry(9, 0.12, 3.6); roof.rotateX(sd * 0.48); roof.translate(x, 3.6, z + sd * 1.5); groups.roof.push(roof);
      }
    }
  }
  const lake = new THREE.CircleGeometry(1, 40); lake.rotateX(-Math.PI / 2); lake.scale(360, 1, 270); lake.rotateY(-0.25); lake.translate(-650, -0.5, 365); groups.water.push(lake);
  // 竹生島は低い島影と二つの峰だけ。小谷からの方角を、南北へ回した縄張りに合わせる。
  const island = new THREE.SphereGeometry(1, 12, 6); island.scale(26, 17, 15); island.translate(-360, 0, 250); groups.land.push(island);
  const peak = new THREE.SphereGeometry(1, 10, 6); peak.scale(14, 13, 12); peak.translate(-377, 0, 253); groups.land.push(peak);
  const colors = { land: 0x394433, water: 0x455f70, wall: 0x65553e, roof: 0x3d382e };
  for (const key of Object.keys(groups)) {
    const geo = mergeGeometries(groups[key]), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[key] }));
    mesh.receiveShadow = false; mesh.castShadow = false; rt.scene.add(mesh);
    for (const g of groups[key]) g.dispose();
  }
}

const odani = {
  guideMarker: (rt) => rt.flags.step === 0 ? 'hide' : rt.flags.step === 3 && !rt.flags.komaAttack ? 'cutHon' : 'trail',
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  spawn: { x: MOUTH.x - 4, z: MOUTH.z + 6, heading: Math.PI - 0.2 },   // 谷道の内で秀吉の二列の脇に立つ。列の後ろと屋敷の軒を避ける
  world: {
    seed: 1573,
    interiorFit: true, // 斜面の建物は、床の端まで地面より上にそろえる。
    climbTan: 0.7,   // 山城：尾根の両側は急な切岸（登れない）、道と段の間の坂は登れる
    wind: [-0.7, 0.7],
    time: 'dusk',
    fireLightLift: 5, // 光の数は増やさず、近い篝火と松明が兵と足もとを照らす。
    blockedHint: (rt) => `${rt.blockedMove?.cause || '道の障り'}で足が止まった。${rt.blockedMove?.cause === '兵の列' ? '列が進むまで待ち、谷道の内で脇を通れ' : '切岸へ登らず、屋敷の西側の谷道から味方に続け'}`,
    blockedEscape: true,
    blockedEscapeAfter: 2.5,
    maxWalkDrop: 1.2,
    muddy: 0,   // 踏み固めた山道。薄い泥でも全員が転びやすくなる指定は外す
    paths: [CLIMB, OTE_CLIMB, ROAD_RIDGE, KOMA_WEST, ROUTE_O, LOOKOUT_WAY],
    height,
    moveWay: roadWay,
    combatSpace: ambushSpace,
    playerVelocity(rt, vx, vz) {
      const F = rt.flags, q = F.waitVelocity, p = rt.player.u.pos;
      q.x = vx; q.z = vz;
      if (F.step !== 1) return q;
      // 登りの先手は谷道を進む。道から外へ押し続けた時は、歩く速さで道へ寄せる。
      // 横・後ろへの入力は残し、切岸を直登する向きだけを道の次の角へ曲げる。
      const speed = Math.hypot(vx, vz);
      if (speed < .01) return q;
      roadPoint(VALLEY_ROUTE, p, F.playerRoad);
      const r = F.playerRoad, dx = p.x - r.x, dz = p.z - r.z;
      const next = VALLEY_ROUTE[Math.min(VALLEY_ROUTE.length - 1, Math.floor(r.s) + 1)];
      const tx = next[0] - p.x, tz = next[1] - p.z;
      const forward = vx * tx + vz * tz;
      // 奥の折り返しでは、北への登り入力を次の道へ沿わせ、山肌へ押し続けない。
      const turn = r.s >= 4 && vz < 0 && forward < 0;
      if (turn || r.d > 6 && (vx * dx + vz * dz > 0 || forward > 0)) {
        const ax = turn ? tx : r.x - p.x + (next[0] - r.x) * .2;
        const az = turn ? tz : r.z - p.z + (next[1] - r.z) * .2;
        const len = Math.hypot(ax, az);
        if (len > .01) { q.x = ax / len * speed; q.z = az / len * speed; }
      }
      return q;
    },
    tint(x, z, h, c) {
      // 尾根の曲輪の土と、清水谷の道沿いの踏み固めた土
      if (ODANI_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z))) c.setRGB(0.46, 0.39, 0.28);
      else if (x < -30 && x > -125 && z > -60 && z < 165 && alongLine(SHIMIZU, x, z).d < 9) c.lerp({ r: 0.42, g: 0.38, b: 0.3 }, 0.3);
      else if (Math.abs(x) < ridgeHW(z) + 22 && z < 174 && z > -157) c.lerp({ r: 0.32, g: 0.36, b: 0.22 }, 0.5);
      else if (h > 12) c.setRGB(0.29, 0.43, 0.18);
    },
    clear: (x, z) => odaniExtraClear(x, z) || (Math.abs(x) < ridgeHW(z) + 22 && z < 174 && z > -192)
      || (x < -14 && x > -125 && z > CLIMB_UP[1][1] - 16 && z < 170 && alongLine(CLIMB, x, z).d < 14)
      || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 22 || Math.hypot(x - AKAO.x, z - AKAO.z) < 17 || Math.hypot(x - ONOGI.x, z - ONOGI.z) < 17 || FORTS.some((f) => Math.hypot(x - f.x, z - f.z) < 13),
    trees: 0,
    tufts: 3000,
    treeDensity: () => 0,
    // 山の斜面は伐採した草地。庭の松だけを組み立て時に置く。
    groves: [],
    paddy: (x, z) => x > -151 && x < -64 && z > 179 && z < 226 ? 1 : 0,
    fleeOut: (x, z, team) => team === 1 && (x > 60 || z < -150 || z > 168),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // この戦の身分による耐久差をなくす。遠景から引き継ぐ兵にも同じ物差しを使う。
    // 生成の時だけ行い、毎コマの全兵走査は加えない。
    const mortalBody = (u) => {
      if (!u.isStruct && !u.campProtected && (u.type === 'samurai' || u.type === 'busho')) u.hp = u.maxHp = 30;
    };
    const spawn = rt.army.spawn.bind(rt.army);
    rt.army.spawn = (...args) => {
      const us = spawn(...args);
      for (const u of us || []) mortalBody(u);
      return us;
    };
    // この城の小屋は板葺き。共通の小屋の形と材質を使う。
    const boardHut = (world, x, z, w, d, rot = 0, o = {}) => hut(world, x, z, w, d, rot, { ...o, ita: true, minka: false });
    F.step = 0; F.ek = 0; F.ak = 0; F.waitVelocity = { x: 0, z: 0 }; F.playerRoad = { x: 0, z: 0, s: 0, d: 0 };
    F.buildTimes = {};
    if (typeof window !== 'undefined' && window.__loadTimes) window.__loadTimes['小谷の組み立て'] = F.buildTimes;
    let buildT = performance.now();
    const stampBuild = (name) => { const now = performance.now(); F.buildTimes[name] = Math.round(now - buildT); buildT = now; };
    rt.banner('小谷城の囲み', '織田は三万、浅井は五千ほどとも。羽柴の手で尾根へ登る');
    // ---- 主尾根の梯郭：塀・門・櫓は castle_plan.js に建てさせる（castles/odani.js の縄張り） ----
    flReset();
    const castleStart = rt.scene.children.length;
    const C = F.C = buildCastlePlan(rt, ODANI_PLAN, { life: false, perch: false, ladders: true, baseHeight: baseTerrain, edgeW: 6, skipWalls: UPPER.map((k) => k.id), buildGates: true, buildTowers: true, team: 1, measure: F.buildTimes });
    const lookout = C.towers.find(t => t.id === 'monomi_kyo')?.naka;
    if (lookout) lookout.entryApproach = { x: LOOKOUT_WAY[0][0], z: LOOKOUT_WAY[0][1] + .8 };
    stampBuild('縄張り全体');
    // 外の大手と本丸は閉じる。城内の連絡用の木戸だけ開く。
    for (const wall of C.walls) if (wall?.seg) {
      wall.noTarget = true; wall.wall = true;
      // 外階段が塀の上へ出ても、地上の線の当たりが無限の高さで残っていた。
      const [ax, az, bx, bz] = wall.seg;
      wall.yTop = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz), W.heightAt((ax + bx) / 2, (az + bz) / 2)) + 3.2;
    }
    for (const [id, g] of Object.entries(C.gateObjs || {})) {
      if (!g?.struct) continue;
      if (g.naka) g.struct.yTop = W.heightAt(g.struct.x, g.struct.z) + 3;
      if (['g_naka_s', 'g_naka_kyo', 'g_kyo_koma', 'g_koma_sanno'].includes(id)) {
        g.struct.opened = true; g.open?.();
      }
    }
    F.westGate = C.gateObjs.g_west;
    // 小さな段の低い石積みと黒金御門の石組み。上段は専用の復元で建てる。
    {
      const side = (k, which, o = {}) => {
        const x0 = k.x - k.hw - 0.6, x1 = k.x + k.hw + 0.6;
        const pts = which === 's' ? [[x0 + 3, k.z1 + 0.6], [-3.4, k.z1 + 0.6]] : which === 's2' ? [[3.4, k.z1 + 0.6], [x1 - 3, k.z1 + 0.6]]
          : which === 'w' ? [[x0, k.z1 - 3], [x0, k.z0 + 3]] : [[x1, k.z0 + 3], [x1, k.z1 - 3]];
        rt.scene.add(ishigaki(W, pts, { topY: k.level + (o.top ?? 1.3), minH: o.h || 3.2, maxH: (o.h || 3.2) + (o.extra ?? 3), lean: 0.18, out: which === 'w' || which === 'e' ? -1 : 1, big: 1.5 }));
      };
      // 小さな段の境だけ低い石を積む。中央の道と門の幅は残す。
      for (const k of [BANSHO, OCHAYA]) for (const face of ['s', 's2']) side(k, face, { h: 0.7, top: 0.25, extra: 0.4 });
      rt.scene.add(ishigaki(W, [[-4.2, GATE_KURO.z + 3], [-9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
      rt.scene.add(ishigaki(W, [[4.2, GATE_KURO.z + 3], [9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
    }
    dressOdaniCastle(rt, C, castleStart);
    // 上段の石垣・土塀・社殿を残し、同じ坂に石段を重ねない。
    buildOdaniUpper(rt, RAMPS);
    buildOdaniFukugen(rt, RAMPS.filter((r) => r.a[0] !== 0 || r.b[0] !== 0 || r.a[1] > NAKAMARU.z0 + 3), STONE_KURUWA);
    addOdaniSteps(rt);
    addOdaniView(rt);
    // ---- 曲輪の中の建物 ----
    // 本丸：長政の御殿（天守は無い）。大広間：大きな建物。中丸・京極丸・小丸：陣屋と篝火
    // 御殿の中へ入れる作りを残し、建物を西へ寄せて尾根の道を空ける。
    const ridgeHuts = makeSimpleBatch();
    const ridgeHut = (x, z, w, d, rot = 0, o = {}) => hut(W, x, z, w, d, rot, { ...o, ita: true, minka: false, batch: ridgeHuts });
    F.honHouse = goten(rt, HON.x - 7.2, HON.cz - 4, { team: 1, w: 8, d: 7, tile: false, name: '本丸の御殿', naka: true, profile: 'odani_hon', oku: 0.48 }).naka;
    F.komaHouse = goten(rt, KOM.x - 5.4, KOM.z0 + 4.5, { team: 1, w: 5, d: 4.5, tile: false, name: '小丸の館', naka: true }).naka;
    // 間取り・調度は推定復元。主尾根の道を空け、南の縁側から広間へ入る。
    F.hiromaHouse = goten(rt, OOHIROMA.x - 9, OOHIROMA.cz - 6, { team: 1, w: 12, d: 8, tile: false, name: '大広間', naka: true, profile: 'odani_hall', oku: .3 }).naka;
    ridgeHut(OOHIROMA.x + 9, OOHIROMA.cz + 8, 6, 5, 0.1);
    // 京極丸の真ん中を空け、北東の物見櫓から離して館を南東へ。小丸の館と櫓も別の側へ置く。
    F.kyoHouse = goten(rt, KYO.x + 10, KYO.z1 - 10, { team: 1, w: 6, d: 5, tile: false, name: '京極丸の館', naka: true, profile: 'odani_kyogoku', oku: .32 }).naka;
    ridgeHut(NAKAMARU.x - 6, NAKAMARU.cz, 5, 4, 0, { wall: 0x5e4a34 });
    // 山王丸の番所と社殿は上段の復元で建て、道と坂を空ける。
    ridgeHut(SAKURABABA.x + 5.5, SAKURABABA.cz, 5, 5, -0.1);
    ridgeHut(ONMAYA.x + 6, ONMAYA.cz - 2, 5, 14, 0, { wall: 0x5a4a34 });
    rt.scene.add(umatsunagi(W, ONMAYA.x - 6, ONMAYA.cz - 7, 0, 6));
    ridgeHut(OCHAYA.x + 5.8, OCHAYA.cz, 4.5, 5, 0, { wall: 0x6a5238 });
    ridgeHut(BANSHO.x + 4.8, BANSHO.cz, 3.4, 3.6, 0, { wall: 0x4a3a2a });
    finalizeSimpleBatch(rt, ridgeHuts);
    // 小丸の南東は門から開く隊列と退き道。俵は北東の隅へ寄せる。
    rt.scene.add(tawara(W, KYO.x + 14, KYO.z1 - 3, 0.3, 5), tawara(W, KOM.x + 6, KOM.z0 + 4, -0.2, 5));
    // 馬洗池は南北9m・東西6.6m。石組みの縁も水面も道の西へ収める。
    {
      const { x, z, w, d } = UMAARAI, y = ONMAYA.level;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 }));
      water.rotation.x = -Math.PI / 2; water.position.set(x, y + 0.04, z); rt.scene.add(water);
      rt.scene.add(ishigaki(W, [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], { topY: y + 0.35, minH: 0.4, maxH: 0.5, lean: 0, out: -1, noKit: true, big: 1.5 }));
    }
    // 御殿の庭：東側に小池・庭石・枝を横へ広げた松。道と南の縁側を空ける。
    // 一度だけ組み立て、二つの庭で形と材質を使い回す。
    {
      const gardens = [[6.5, HON.cz + 3, HON.level], [7.5, OOHIROMA.cz - 7, OOHIROMA.level]];
      const waterGeo = new THREE.CircleGeometry(1, 12);
      waterGeo.rotateX(-Math.PI / 2);
      const water = new THREE.InstancedMesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x416450, roughness: 0.25 }), 2);
      const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x77766a }), 12);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.1, .17, 1, 6), new THREE.MeshLambertMaterial({ color: 0x66513a }), 6);
      const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x34552c }), 8);
      const pose = new THREE.Object3D();
      const put = (mesh, i, x, y, z, sx, sy, sz, tilt = 0) => { pose.position.set(x, y, z); pose.scale.set(sx, sy, sz); pose.rotation.set(0, i * .6, tilt); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); };
      gardens.forEach(([x, z, y], g) => {
        put(water, g, x, y + .06, z, 2.1, 1, 1.5);
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; put(stone, g * 6 + i, x + Math.cos(a) * 2.25, y + .18, z + Math.sin(a) * 1.7, .42, .3 + i % 2 * .15, .35); }
        const px = x + 2.8, pz = z - 2.5;
        put(trunks, g * 3, px, y + 1.7, pz, 1, 3.4, 1, -.15);
        for (let i = 0; i < 2; i++) put(trunks, g * 3 + i + 1, px + (i ? -.7 : .8), y + 2.5 + i * .6, pz, .65, 1.8, .65, i ? .9 : -.9);
        for (let i = 0; i < 4; i++) put(crowns, g * 4 + i, px + (i % 2 ? -1 : 1) * .7, y + 2.4 + i * .4, pz + (i % 2) * .4, 1.25, .38, 1);
      });
      rt.scene.add(water, stone, trunks, crowns);
    }
    // 浅井の旗：本丸と小丸に馬印（大将の居場所。長政・久政は建物の奥にいて、前には出ない）
    F.flagsKom = [];
    for (const [x, z, h] of [[HON.x - 9, HON.z1 - 4, 6], [HON.x + 6, HON.cz - 9, 7], [KOM.x - 6, KOM.cz, 6], [KOM.x + 6, KOM.z0 + 3, 7], [SANNO.x - 4, SANNO.cz, 6], [OOHIROMA.x - 10, OOHIROMA.cz, 6], [NAKAMARU.x + 6, NAKAMARU.cz, 5], [KYO.x - 12, KYO.z0 + 2, 6], [KYO.x - 12, KYO.z1 - 2, 6]]) {
      const n2 = nobori(W, x, z, 'azai', h); rt.scene.add(n2);
      if (z < KOM.z1 + 1 && z > KOM.z0 - 1) F.flagsKom.push(n2);
      if (z < KYO.z1 && z > KYO.z0) (F.flagsKyo = F.flagsKyo || []).push(n2);
    }
    for (const [x, z] of [[HON.x + 4, HON.z0 + 3], [KOM.x + 4, KOM.z1 - 2], [KYO.x - 2, KYO.cz + 3], [NAKAMARU.x + 2, NAKAMARU.z1 - 2], [SANNO.x + 4, SANNO.z1 - 4], [OOHIROMA.x - 4, OOHIROMA.z0 + 4]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    stampBuild('曲輪の館');
    // ---- 城に詰める浅井勢（軽い作り）：本丸の塀の内に外を向いて構える者、大広間・山王丸・中丸の兵 ----
    {
      const crew = [];
      for (let i = 0; i < 18; i++) {
        const t = i / 17, x = HON.x - HON.hw + 1.5 + t * (HON.hw * 2 - 3);
        crew.push({ x, z: HON.z1 - 1.5, k: ['gun', 'spear', 'bow', 'spear'][i % 4], facing: 0 });
        if (i % 3 === 0) crew.push({ x, z: HON.z0 + 1.5, k: ['gun', 'spear'][i % 2], facing: Math.PI });
      }
      const cr = W.addDistantArmy({ people: crew, armor: AZ_ARMOR, team: 1, flagTex: flagTexture('azai'), seed: 15737 });
      // 近づいた時は同じ場所で実兵へ引き継ぎ、塀の内の持ち場を守る。
    }
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, kind: 'spear', yose: false, host: false, seed, ...(team != null ? { team } : {}) });
    F.azHon = DA(OOHIROMA.x, OOHIROMA.cz, 22, 18, 72, 0, AZ_ARMOR, 'azai', 15736, 1);
    // 山王丸は初めからいる実兵の控えで描く。任務の守りへ別の遠景兵を重ねない。
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
      rt.scene.add(boardHut(W, kx - 2, kz - 3, 14, 7, 0, { h: 3.4, wall: 0x6a5238 }), boardHut(W, kx + 8, kz + 3, 5, 4, 0.1, { wall: 0x5e4a34 }), boardHut(W, kx - 9, kz + 4, 5, 4, -0.1, { wall: 0x5a4a34 }));
      // 寺（谷の口の寺。名は出さない＝GAME_C）
      rt.scene.add(dou(W, TERA.x, TERA.z, 9, 7, Math.PI / 2 + 0.2, { h: 3.4 }), boardHut(W, TERA.x + 2, TERA.z - 12, 6, 4, 0.2, { wall: 0x7a5a3c }));
      // 谷口の村。田はその南に並び、番所への登り道は東側を通る。
      for (const [x, z, r] of VILLAGE) rt.scene.add(hut(W, x, z, 6, 4.5, r));
      // 家臣の屋敷：道の両側に、塀（柵）の囲いと屋敷
      YASHIKI.forEach(([x, z, r], i) => {
        rt.scene.add(boardHut(W, x, z, 7 + (i % 3), 5, r, { wall: i % 2 ? 0x5e4a34 : 0x6a5238 }));
        if (i % 2 === 0) rt.scene.add(palisade(W, [x - 6, z + 5, x + 6, z + 5]));
      });
      rt.scene.add(umatsunagi(W, KYOKAN.x - 18, KYOKAN.z - 12, 1.4, 6), tawara(W, KYOKAN.x - 17, KYOKAN.z + 12, 0.4, 6));
      // 前の小競り合いで焼けた屋敷（GAME_C）
      for (const [x, z] of [[YASHIKI[3][0], YASHIKI[3][1]], [YASHIKI[5][0] + 2, YASHIKI[5][1]]]) { W.addFire(x, z, { h: 2 }); W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: 1.6 }); }
    }
    stampBuild('清水谷の建物と遠景');
    // ---- 防御帯：堀切・竪堀（縄張りの高さと当たり）／食い違い虎口（西の口の外）／隠し銃座／大野木屋敷・赤尾屋敷 ----
    {
      const kb = makeSimpleBatch();
      for (const sg of KUICHIGAI) { const g = takaDorui(W, sg, { batch: kb, w: 1.3, h: 3.2 }); rt.scene.add(g); }
      finalizeSimpleBatch(rt, kb);
      F.nests = [];
      for (const nd of NESTS) {
        const nest = hiddenGunNest(W, nd.x, nd.z, nd.rot, { n: nd.n });
        rt.scene.add(nest.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '隠し銃座', anchor: nest.center, fixed: true, facing: Math.atan2(nest.fwd.x, nest.fwd.z), width: 2, aggro: 22, morale: 90 },
          dress([{ type: 'gun', n: nd.n }], AZAI));
        g.units.forEach((u, i) => { const s = nest.spots[i % nest.spots.length]; u.pos.x = s.x; u.pos.z = s.z; u._nest = true; u._crouch = true; });
        F.nests.push({ id: nd.id, g, c: nest.center, mouth: nest.mouth });
      }
      F.yokoya = [];
      for (const yk of YOKOYA) {
        const z = yokoyaZa(W, yk.x, yk.z, yk.rot, { n: yk.n });
        rt.scene.add(z.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '横矢の座', anchor: z.center, fixed: true, facing: Math.atan2(z.fwd.x, z.fwd.z), width: 2, aggro: 20, morale: 90 },
          dress([{ type: yk.k, n: yk.n }], AZAI));
        g.units.forEach((u, i) => { const s = z.spots[i % z.spots.length]; u.pos.x = s.x; u.pos.z = s.z; });
        F.yokoya.push({ id: yk.id, g, c: z.center });
      }
      const O = ONOGI, ox0 = O.x - O.hw, ox1 = O.x + O.hw, oz0 = O.z - O.hd, oz1 = O.z + O.hd;
      for (const sg of [[ox0, oz1, O.x - 2.6, oz1], [O.x + 2.6, oz1, ox1, oz1], [ox1, oz1, ox1, oz0], [ox1, oz0, ox0, oz0], [ox0, oz0, ox0, oz1]]) rt.scene.add(palisade(W, sg));
      F.onoHouse = goten(rt, O.x, O.z - 2, { team: 1, w: 10, d: 6, tile: false, name: O.name, naka: true, profile: 'odani_onogi', oku: 0.4 }).naka;
      rt.scene.add(kabukimon(W, O.x, oz1, 5, 0), boardHut(W, ox0 + 3.5, oz0 + 3, 4.5, 3.4, 0.1, { wall: 0x5e4a34 }), boardHut(W, ox1 - 3.5, O.z + 1, 4, 3.2, -0.1, { wall: 0x5a4a34 }), kagaribi(W, O.x + 3.5, oz1 - 2));
      W.addFire(O.x + 3.5, oz1 - 2, { h: 1.4 });
      const A = AKAO, ax0 = A.x - A.hw, ax1 = A.x + A.hw, az0 = A.z - A.hd, az1 = A.z + A.hd;
      for (const sg of [[ax0, az0, ax0, A.z - 2.5], [ax0, A.z + 2.5, ax0, az1], [ax0, az1, ax1, az1], [ax1, az1, ax1, az0], [ax1, az0, ax0, az0]]) rt.scene.add(palisade(W, sg));
      // 西の木戸へ戸口を向ける。屋敷の横や裏へ回らずに入れる。
      F.akaoHouse = goten(rt, A.x + 1, A.z, { team: 1, w: 9, d: 6, rot: -Math.PI / 2, tile: false, name: A.name, naka: true, profile: 'odani_akao', oku: 0.5 }).naka;
      // 主屋は回転して南北に九メートルある。脇の小屋は東へ寄せ、壁を重ねない。
      rt.scene.add(kabukimon(W, ax0, A.z, 5, Math.PI / 2), boardHut(W, ax1 - 2.5, az1 - 2.2, 3.4, 3.4, 0, { wall: 0x5e4a34 }), nobori(W, A.x - 5, A.z - 5, 'azai', 6), kagaribi(W, ax0 + 3, A.z + 4));
      W.addFire(ax0 + 3, A.z + 4, { h: 1.4 });
    }
    stampBuild('堀と虎口と銃座');
    // ---- 周りの砦：長浜市の保存管理計画に沿う尾根の並び。座標・建物は推定、当夜の所属不明の砦には軍旗を立てない ----
    for (const f of FORTS) {
      const n = 10, r = 8.5, pts = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]); }
      for (let i = 0; i < n; i++) if (i !== 0) rt.scene.add(palisade(W, [pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]));
      rt.scene.add(boardHut(W, f.x, f.z - 2, 6, 4, 0.2, { wall: 0x5a4a34 }));
      if (f.flag) rt.scene.add(nobori(W, f.x + 3, f.z + 3, f.flag, 7), nobori(W, f.x - 4, f.z, f.flag, 6));
      W.addFire(f.x + 2, f.z + 5, { torch: true, h: 1.4 });
    }
    // 城の石・塀・石段の同じ形の束も、草木と同じ仕組みで画面の外を描かない。
    // 動く遠景の兵や実兵を作る前に登録する。行列と判定の箱はここで一度だけ用意する。
    const culled = new Set();
    for (const c of W.cullList || []) for (const o of c.orig) culled.add(o.m);
    for (let i = castleStart; i < rt.scene.children.length; i++) {
      const m = rt.scene.children[i];
      if (m.isInstancedMesh && m.count > 16 && !m.userData.lod && !culled.has(m)) W.viewCull([m], 12);
    }
    // ---- 小谷を囲む織田勢（軽い作り）：谷の口・東の谷・南の山麓。南には虎御前山の信長の本陣 ----
    DA(MOUTH.x - 10, MOUTH.z + 24, 34, 12, 110, Math.PI - 0.2, ODA_ARMOR, 'oda', 15731);
    DA(110, -30, 30, 14, 110, -Math.PI / 2, ODA_ARMOR, 'oda', 15732);
    DA(118, -110, 26, 12, 90, -Math.PI / 2, ODA_ARMOR, 'eiraku', 15733);
    DA(-40, 168, 40, 10, 120, Math.PI, ODA_ARMOR, 'eiraku', 15734);
    KIT.honjin(rt, 70, 160, { mon: 'oda', people: false, fire: true, yoroi: false });
    DA(70, 176, 30, 8, 72, Math.PI, ODA_ARMOR, 'oda', 15735);
    for (const [x, z, k] of [[MOUTH.x + 4, MOUTH.z - 2, 'oda'], [MOUTH.x - 6, MOUTH.z + 4, 'oda'], [62, 152, 'oda'], [78, 152, 'eiraku'], [100, -20, 'oda'], [100, -100, 'oda']]) rt.scene.add(nobori(W, x, z, k, 7));
    for (const [x, z] of [[MOUTH.x - 6, MOUTH.z + 10], [100, -40], [110, -96], [-20, 160]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { torch: true, h: 1.4 }); }
    // ---- 南の大手：織田の本隊が番所に取りついている（遠景の合戦。一段ずつ攻め上がる） ----
    F.front = 0; F.frontAt = rt.t + 24;
    // 大手の道は別の組が登る。秀吉の組を本丸経由へ回して分断の筋を変えない。
    F.oteRoute = [BANSHO, OCHAYA, ONMAYA, SAKURABABA, { x: GATE_KURO.x, cz: GATE_KURO.z, name: '黒金御門' }, OOHIROMA, { x: HON.x, cz: HON.z1 + 5, name: '本丸の前' }];
    F.oteColumn = DA(0, BANSHO.z1 + 14, 4, 12, 24, Math.PI, ODA_ARMOR, 'oda', 15752, 0);
    F.oteColumn.army.noWake = true;
    F.clash = clash(rt, { x: 0, z: BANSHO.z1 + 8, facing: Math.PI, w: 13, gap0: 0, seed: 15751,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 24, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 36, team: 1, faction: 'azai', bows: true } });
    // ---- 羽柴秀吉の手（自分の持ち場）と、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', fixed: true, formation: 'column', colW: 2, spacing: 1.2, anchor: { x: MOUTH.x, z: MOUTH.z }, facing: Math.PI, width: 10, aggro: 10 },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, ...HIDE } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '蜂須賀正勝の手', fixed: true, formation: 'column', colW: 2, spacing: 1.2, anchor: { x: MOUTH.x + 8, z: MOUTH.z + 4 }, facing: Math.PI, width: 10, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.hide, F.hachi];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MOUTH.x + 4, z: MOUTH.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 清水谷の浅井勢：居館の番兵と、谷の奥の見張り ----
    F.yakata = enemyGroup(rt, { faction: 'azai', name: '居館の番兵', fixed: true, formation: 'yari', anchor: { x: KYOKAN.x - 21, z: KYOKAN.z + 2 }, facing: Math.PI / 2 + 0.6, width: 8, aggro: 16, morale: 75, fleeDir: { x: 0.3, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    F.watch = enemyGroup(rt, { faction: 'azai', name: '谷の奥の見張り', fixed: true, formation: 'column', colW: 2, anchor: { x: HEAD.x - 4, z: HEAD.z + 12 }, facing: 0.4, width: 6, aggro: 14, morale: 70, fleeDir: { x: 0.6, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
    // 同じ十八人を道沿いの小さな見張りに分ける。兵を増やさず、最初は十五メートル先。
    // 最大約四十メートル間隔なので、徒歩でも次の守りまで長い空白を作らない。
    let patrolLength = 0;
    for (let i = 1; i < VALLEY_ROUTE.length; i++) patrolLength += Math.hypot(VALLEY_ROUTE[i][0] - VALLEY_ROUTE[i - 1][0], VALLEY_ROUTE[i][1] - VALLEY_ROUTE[i - 1][1]);
    let patrolIndex = 0;
    for (const id of AMBUSH_IDS) {
      const g = F[id]; g.noRout = true; g.historicalOrders = true; g.formation = 'column';
      for (const u of g.units) {
        let distance = 15 + Math.floor(patrolIndex / 2) * (patrolLength - 21) / 8;
        let i = 1;
        for (; i < VALLEY_ROUTE.length - 1; i++) {
          const a = VALLEY_ROUTE[i - 1], b = VALLEY_ROUTE[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (distance <= len) break;
          distance -= len;
        }
        const a = VALLEY_ROUTE[i - 1], b = VALLEY_ROUTE[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t = Math.min(1, distance / len), side = patrolIndex++ % 2 ? 1.2 : -1.2;
        const x = a[0] + (b[0] - a[0]) * t + (b[1] - a[1]) / len * side;
        const z = a[1] + (b[1] - a[1]) * t - (b[0] - a[0]) / len * side;
        u.pos.set(x, W.heightAt(x, z), z);
        u.odaniWait = { x, z }; u.odaniReleased = false; u.noTarget = true;
      }
    }
    // ---- 京極丸の守り（西の口の門兵と、曲輪の中の守り） ----
    F.kyoGate = enemyGroup(rt, { faction: 'azai', name: '西の口の門兵', fixed: true, formation: 'yari', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: -Math.PI / 2, width: 6, aggro: 10, morale: 80, fleeDir: { x: 1, z: 0 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }], AZAI));
    F.kyo = enemyGroup(rt, { faction: 'azai', name: '京極丸の守り', fixed: true, anchor: { x: KC.x + 3, z: KC.z }, facing: -Math.PI / 2, width: 10, aggro: 9, morale: 95, fleeDir: { x: 0, z: 1 }, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], AZAI));
    F.ono = enemyGroup(rt, { faction: 'azai', name: '大野木屋敷の守り', fixed: true, formation: 'yari', anchor: { x: ONOGI.x, z: ONOGI.z + 3 }, facing: Math.PI, width: 9, aggro: 12, morale: 90, fleeDir: { x: 0.5, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    // 加勢・反撃・小丸の守りは初めから曲輪に詰める。後の段は同じ兵を歩かせる。
    const reserve = (name, at, facing, foot, ranged = 'bow') => {
      const g = enemyGroup(rt, { name, faction: 'azai', fixed: true, anchor: at,
        facing, width: 5, formation: 'column', colW: 2, spacing: 1.2, aggro: 8, morale: 85,
        fleeDir: { x: 0, z: facing === 0 ? -1 : 1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: foot }, { type: ranged, n: 2 }], AZAI));
      g.historicalOrders = true;
      return g;
    };
    // 北向きの後列も南の塀の内へ収め、尾根の道から加勢を出す。
    F.kyoAid = reserve('中丸の控え', { x: 0, z: NAKAMARU.cz }, Math.PI, 7);
    F.south = reserve('中丸の押し返す組', { x: -3, z: NAKAMARU.cz - 3 }, Math.PI, 8);
    F.north = reserve('小丸の押し返す組', { x: 3, z: KOM.cz + 3 }, 0, 7);
    F.koma = reserve('小丸の守り', { x: 0, z: KOM.cz - 2 }, 0, 8);
    F.sanno = reserve('山王丸の控え', { x: 0, z: SANNO.z1 - 5 }, 0, 6, 'gun');
    // 総大将を前線の組に混ぜない。史実の最期は戦後の文で伝える。
    const lord = (name, house, at) => {
      const spot = house.lordSpot || at;
      const g = enemyGroup(rt, { name: name + 'の居所', faction: 'azai', fixed: true,
        anchor: spot, facing: 0, aggro: 0, width: 1, noGuard: true, noRout: true },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true } }], AZAI));
      g.historicalOrders = true;
      const u = g.units[0]; u.noTarget = true; u.dmg = 0; u.campProtected = true;
      return g;
    };
    F.nagamasa = lord('浅井長政', F.honHouse, HONC);
    F.hisamasa = lord('浅井久政', F.komaHouse, KOMC);
    F.akaoLord = lord('赤尾清綱', F.akaoHouse, AKAO);
    F.honGuard = reserve('本丸の旗本', { x: 0, z: HON.cz + 7 }, 0, 8);
    F.honGuard.guard = true; F.honGuard.guardLeash = 8;
    F.koma.guard = true; F.koma.guardLeash = 7;
    F.akao = reserve('赤尾屋敷の守り', { x: AKAO.x - 5, z: AKAO.z }, -Math.PI / 2, 5);
    F.counter = [F.south, F.north];
    F.komaGuards = [F.koma, F.sanno];
    F.captureT = 0; F.holdT = 0; F.awayT = 0;
    F.kyoGuards = [F.kyoGate, F.kyo, F.kyoAid];
    // 身分だけで深手への耐久を増やさない。甲冑・武器と史実の致死保護は別に保つ。
    for (const u of rt.army.units) mortalBody(u);
    stampBuild('周りの砦と実兵');
    applyLook(rt, PREDAWN);
    W.lookDark = true; // 小谷専用の夜の色でも、描画の夜間露出を使う。
    rt.setPhase('brief');
    rt.obj('main', '秀吉のそばで、登りの下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、ここは清水谷。浅井の館と屋敷の並ぶ谷じゃ。上の尾根に、小谷の曲輪が連なっておる`, 5);
    rt.say('羽柴秀吉', '殿は虎御前山の陣じゃ。我らは谷から京極丸を取り、長政殿と久政殿を分断する', 5.5);
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉（話を聞く）', { guideAlways: true, alwaysDistance: true });
    rt.objProgress('main', '秀吉の印へ。話を聞くか、その場で下知を待て');
    rt.addInteract('talk', { x: MOUTH.x, z: MOUTH.z }, '秀吉の話を聞く', () => { rt.uninteract('talk'); rt.say('羽柴秀吉', '（小声で）よし、参るぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 6 });
    rt.addInteract('oteRoad', { x: MOUTH.x + 4, z: MOUTH.z + 4 }, '大手の道を聞く', () => {
      rt.say('組頭', '大手の組は番所から御茶屋、御馬屋、桜馬場へ。黒金御門の先に大広間と本丸がある', 5);
      rt.after(5, () => { if (!F.ending) rt.say('組頭', '本丸の奥も、大堀切、中丸、京極丸、小丸と続く。我らは谷から京極丸へ入り、その間を断つ', 5); });
    }, { r: 6 });
    rt.after(5, () => this.climb(rt));
  },

  // ① 清水谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk'); rt.uninteract('oteRoad'); rt.unmark('hide'); rt.unmark('kyoGoal');
    F.trailPoint = { x: CLIMB[2][0], z: CLIMB[2][1] };
    rt.marker('trail', () => F.trailPoint, '清水谷の登り道', { h: 3, guideAlways: true, alwaysDistance: true });
    rt.obj('main', hi(rt) ? '一隊を率いて清水谷を登れ' : '秀吉について清水谷を登れ', 'main');
    rt.say('羽柴秀吉', '（小声で）松明を消せ。……館の番兵を払っても、先に見張りがおる。道の脇の銃口にも気をつけよ', 3.5);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(2, SHIMIZU.length + 2); H.pathIdx = 0; H.speed = 3; H.formation = 'column'; H.aggro = 12; H.roadColumn = true;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x, z: BELOW.z }; g.formation = 'column'; g.aggro = 12; F.hideAt = rt.t; };
    const Hc = F.hachi;
    Hc.order = 'path'; Hc.path = CLIMB.slice(2, SHIMIZU.length + 2); Hc.pathIdx = 0; Hc.speed = 2.9; Hc.formation = 'column'; Hc.roadColumn = true;
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
    roadPoint(ROUTE_O, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.onoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    F.trailPoint.x = ROUTE_O[F.onoTrailIdx][0]; F.trailPoint.z = ROUTE_O[F.onoTrailIdx][1];
    rt.marker('trail', () => F.trailPoint, '屋敷の南の木戸へ・道の印をたどれ', { h: 3, guideAlways: true, alwaysDistance: true });
    sfx('horagai', 0.9);
    rt.banner('京極丸へ', '尾根の真ん中の曲輪に攻め入る');
    nextObj(rt, '京極丸の下、大野木屋敷を奪え');
    rt.say('羽柴秀吉', '大野木屋敷の南の木戸へ！　庭の守りを崩せ。屋敷の横の柵を越えず、南の木戸を通れ', 4);
    rt.marker('ono', F.onoHouse.doorOut, '大野木屋敷の戸口', { red: true, h: 6 });
    rt.after(6, () => { if (F.step === 2 && !F.onoDone) rt.say('羽柴秀吉', '西の口の外は食い違いの虎口じゃ。壁に沿って折れて登る。壁の陰の銃座に気をつけよ！', 4); });
    // 遠い屋敷へ「攻めよ」だけでは索敵の外に残る。谷道と南の木戸を通してから攻める。
    for (const g of F.oda) {
      const c = g.center();
      roadPoint(ROUTE_O, c, ROUTE_FROM, rt.army, g.units.find((u) => u.alive));
      g.anchor = { x: c.x, z: c.z }; g.order = 'path'; g.path = ROUTE_O;
      g.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      g.formation = 'column'; g.aggro = 6; g.speed = 3;
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; gg.formation = 'yari'; };
    }
    F.kyoGate.order = 'hold'; F.kyoGate.seekRange = 12;
    F.kyo.seekRange = 22;
    rt.marker('kyo', centerOf(F.kyoGate), () => '西の口の門兵', { red: true, group: F.kyoGate });
    rt.say('蜂須賀正勝', '木戸は閉じておる。屋敷を押さえたら、組で木戸へ取りつけ！', 3);
    rt.after(26, () => {
      if (F.step !== 2 || gone(F.kyoAid)) return;
      this.march(F.kyoAid, [[0, NAKAMARU.cz], [0, GATE_NAKA_KYO.z], [0, KC.z]], Math.PI);
      rt.say('組頭', '中丸の口から兵が来る！　西の木戸へ急げ！', 3);
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
    rt.say('浅井の兵', '京極丸の下を取られた……！　大野木殿の屋敷が落ちた。西の木戸を守れ！', 3.5);
    rt.after(3.5, () => { if (F.step === 2) rt.say('羽柴秀吉', '大野木屋敷、落ちたり！　勢いのまま、虎口を抜けて京極丸じゃ！', 3.5); });
    nextObj(rt, '西の木戸を破れ。守りを崩し、京極丸の内を味方六人で十秒保て');
    roadPoint(CLIMB_UP, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.kyoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    rt.marker('trail', () => F.trailPoint, '西の木戸へ・壁に沿って登れ', { h: 3, guideAlways: true, alwaysDistance: true });
    for (const g of F.oda) { g.order = 'path'; g.path = CLIMB_UP; g.pathIdx = 0;
      const c = g.center(); let best = Infinity;
      for (let i = 0; i < CLIMB_UP.length; i++) { const w = CLIMB_UP[i], d = Math.hypot(c.x - w[0], c.z - w[1]); if (d < best) { best = d; g.pathIdx = i; } } g.aggro = 4; g.speed = 3; g.formation = 'column'; g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 40; gg.formation = 'yari'; gg.anchor = { x: KC.x, z: KC.z }; }; }
    rt.marker('kyo', centerOf(F.kyoGate), () => '西の口の門兵', { red: true, group: F.kyoGate });
  },

  // ③ 分断：京極丸を取り、本丸と小丸が切れる
  cut(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.captureT = 0;
    rt.setPhase('cut');
    rt.unmark('kyo'); rt.unmark('kyoAid'); rt.unmark('trail');
    rt.award((t) => t.side.push('京極丸を取った'), '京極丸を取った');
    rt.objRemove('main'); // ここから小丸が落ちるまでは、段の任務だけを出す。
    sfx('kane', 0.6);
    rt.banner('浅井軍、二つに切れる', '南の本丸に長政、北の小丸に久政。もう互いに助けに行けない');
    // 京極丸の浅井の旗を倒す。夜の空は数分で朝に変えない
    (F.flagsKyo || []).forEach((n2, i) => rt.after(0.6 + i * 0.5, () => { n2.rotation.z = 1.3; }));

    // 二つに切れた城を見せる（南の本丸・北の小丸に印を少しの間）
    // 攻めない奥に目標の印を置かず、今守る京極丸へ案内する。
    rt.marker('cutHon', { x: KC.x, z: KC.z }, '守る京極丸・南の本丸へは攻めない', { h: 2 });
    rt.after(12, () => { rt.unmark('cutHon'); rt.unmark('cutKom'); });
    rt.say('羽柴秀吉', '本丸と小丸を断った！　両方から来るぞ、京極丸を守れ！', 4.5);
    rt.after(5, () => { if (!F.ending) rt.say('組頭', '本丸との間は大堀切。中丸の門へ続く細道で受けましょうぞ', 4); });
    // 南の大手：織田の本隊が番所・御茶屋を抜き、御馬屋・桜馬場へ攻め上がる
    rt.say('組頭', '南の大手でも攻め合っておる。我らは尾根の口を守れ！', 3);
    // 連絡を断たれた守りは動揺するが、反撃の槍列は残す。
    for (const g of F.counter) g.morale = Math.max(65, g.morale - 10);
    for (const g of F.komaGuards) g.morale = Math.max(65, g.morale - 10);
    this.march(F.south, [[-3, NAKAMARU.cz - 3], [0, GATE_NAKA_KYO.z], [0, KC.z + 7]], Math.PI);
    this.march(F.north, [[3, KOM.cz + 3], [0, GATE_KYO_KOMA.z], [0, KC.z - 7]], 0);
    for (const g of F.oda) if (!gone(g)) {
      g.order = 'hold'; g.anchor = { x: KC.x, z: KC.z + (g === F.hide ? 4 : -4) };
      g.formation = 'yari'; g.facing = g === F.hide ? 0 : Math.PI; g.aggro = 12;
    }
    // 既存の足軽を二つの口へ分ける。欠員も同じ攻め手から補う。
    F.kyoHolders = [];
    for (const z of [KYO.z1 - 4, KYO.z0 + 4]) {
      const g = rt.army.addGroup({ team: 0, faction: 'oda', name: '京極丸に残る押さえ', order: 'hold', formation: 'yari', width: 3, anchor: { x: 0, z }, facing: z > KC.z ? 0 : Math.PI, aggro: 4 });
      g.historicalOrders = true;
      F.kyoHolders.push(g);
    }
    this.staffHolders(rt);
    nextObj(rt, '京極丸の内で南北の反撃を退けよ');
  },

  staffHolders(rt) {
    const F = rt.flags;
    for (const g of F.kyoHolders) {
      let ready = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget) ready++;
      if (ready >= 2) continue;
      // 蜂須賀の手を先に使い、足りない時だけ秀吉の足軽を回す。本人の組は動かさない。
      for (let s = F.oda.length - 1; s >= 0 && ready < 3; s--) {
        const source = F.oda[s];
        if (gone(source)) continue;
        let moved = false;
        for (let i = source.units.length - 1; i >= 0 && ready < 3; i--) {
          const u = source.units[i];
          if (!u.alive || u.fleeing || u.gone || u.woundOut || u.noTarget || u.stdHeld || u.type !== 'ashigaru') continue;
          source.units.splice(i, 1); u.group = g; u.slot = g.units.length;
          u.target = null; u.moveTo = null; u.aiT = 0; g.units.push(u); ready++; moved = true;
        }
        if (moved) {
          source.initial = source.units.length;
          for (let i = 0; i < source.units.length; i++) source.units[i].slot = i;
          // 倒れた者の空席を前に残さず、補った槍を木戸のそばへ並べる。
          let slot = 0;
          for (let i = 0; i < g.units.length; i++) {
            const u = g.units[i];
            if (!u.alive || u.fleeing || u.gone || u.woundOut || u.noTarget) continue;
            g.units[i] = g.units[slot]; g.units[slot++] = u;
          }
          for (let i = 0; i < g.units.length; i++) g.units[i].slot = i;
          g.initial = slot; g.routed = false; g.order = 'hold'; g.focus = null;
          g.morale = Math.max(70, g.morale); g._fitAt = 0;
        }
      }
    }
  },

  march(g, path, facing) {
    if (gone(g)) return;
    g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = 2.6;
    g.formation = 'column'; g.colW = 2; g.facing = facing;
    // 後列も門へ続く道に沿わせる。旋回中の直線の持ち場を切岸へ出さない。
    g.roadColumn = true;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: path[path.length - 1][0], z: path[path.length - 1][1] }; q.formation = 'yari'; q.aggro = 14; };
  },

  // 京極丸を本人と守ってから、押さえを残し、小丸への攻めを始める。
  attackKoma(rt) {
    const F = rt.flags;
    if (F.komaAttack || F.ending) return;
    F.komaAttack = true; F.captureT = 0;
    nextObj(rt, '秀吉の手と北の木戸を上り、小丸の守りを崩せ');
    rt.say('組頭', '押さえは京極丸に残れ。先の組は秀吉様と小丸へ！', 3);
    rt.after(4, () => { if (!F.ending) rt.say('羽柴秀吉', '小丸の守りを崩せ。味方四人で内を十二秒保て！', 3); });
    const path = [[KC.x, KC.z], [GATE_KYO_KOMA.x, KYO.z0 + 2], [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], [KOM.x, KOM.z1 - 2], [KOM.x, KOM.cz + 4]];
    F.komaPath = path; F.komaIdx = 0;
    F.trailPoint.x = path[0][0]; F.trailPoint.z = path[0][1];
    rt.marker('trail', () => F.trailPoint, '北の木戸へ・道を順に上る', { h: 3, guideAlways: true, alwaysDistance: true });
    this.march(F.hide, path, Math.PI);
    const northRoad = ROAD_RIDGE.filter((q) => q[1] <= KOM.cz && q[1] >= SANNO.z1 - 5).reverse();
    this.march(F.sanno, [[0, SANNO.z1 - 5], ...northRoad, [0, KOM.cz - 3]], 0);
  },

  // 届かない残兵も退く。総大将や居所の人物は退かせず、討死にも数えない。
  // 待ち時間は敵の出撃と道案内に使う。木戸と占領の判定は飛ばさない。
  reliefTick(rt) {
    const F = rt.flags;
    if (F.step < 1 || rt.t < (F.pressureAt || 0)) return;
    const stage = F.step === 2 && F.onoDone ? 2.5 : F.step === 3 && F.komaAttack ? 4 : F.step;
    const enemies = stage === 1 ? [F.yakata, F.watch] : stage === 2 ? [F.ono] : stage === 2.5 ? F.kyoGuards : stage === 3 ? F.counter : F.komaGuards;
    pressureTick(rt, stage, enemies, F.oda, stage === 1 ? '道の印をたどり、秀吉様の旗へ続け' : stage === 2 ? '屋敷の南の木戸へ。味方と守りを崩せ' : stage === 2.5 ? '西の木戸を破り、京極丸の内を押さえよ' : stage === 3 ? '京極丸の内へ戻れ。南北の口を守れ' : '北の木戸から小丸へ。内の守りを崩し、組で押さえよ');
  },

  // 小丸を押さえた一組の任務はここまで。退去と長政の最期は後日の話。
  komaFall(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.komaDown = true;
    this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end');
    for (const id of ['hide', 'trail', 'ono', 'kyo', 'cutHon', 'cutKom', 'yakata', 'watch']) rt.unmark(id);
    for (const nest of F.nests || []) rt.unmark(nest.id);
    rt.uninteract('talk');
    rt.uninteract('oteRoad'); F.oteColumn.halt();
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を守り、小丸の守りを崩した', pts: 20 }; }, '小丸の持ち場を押さえた');
    rt.banner('小丸の持ち場を押さえた', 'この組の攻めはここまで。城の行く末は、後の知らせで伝わる');
    rt.say('', '――小谷城は落ち、浅井家は滅んだ。お市の方と娘たちは城を出た。詳しい経緯は戦後の史実で読める', 6);
    rt.after(6, () => rt.say('', '――北近江の多くは秀吉の領地となる。翌年、織田勢は長島を囲む', 5));
    rt.finish({ scriptedEnd: true }, 12);
  },

  lose(rt, why = '京極丸の持ち場を守れなかった') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    for (const id of ['hide', 'trail', 'ono', 'kyo', 'cutHon', 'cutKom', 'yakata', 'watch']) rt.unmark(id);
    for (const nest of F.nests || []) rt.unmark(nest.id);
    rt.uninteract('talk');
    rt.uninteract('oteRoad'); F.oteColumn.halt();
    rt.banner('この組は攻めを果たせず', why);
    rt.say('組頭', 'これ以上は持たぬ。生きている者は谷へ下がれ！', 4);
    rt.finish({ scriptedEnd: true }, 9);
  },

  ambushTick(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.t < (F.ambushNext || 0)) return;
    F.ambushNext = rt.t + .5;
    // 先手だけが遠くで戦わないよう、自分から離れた列は道で待つ。
    for (const g of F.oda) {
      const c = g.center();
      if (g.order === 'path' && Math.hypot(c.x - p.x, c.z - p.z) > 16) {
        g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = c.z; g.odaniPlayerPause = true;
      } else if (g.odaniPlayerPause && Math.hypot(c.x - p.x, c.z - p.z) < 12) {
        g.order = 'path'; g.odaniPlayerPause = false;
      }
    }
    for (const id of AMBUSH_IDS) {
      const g = F[id];
      if (gone(g)) continue;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.odaniReleased || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 22) continue;
        u.odaniReleased = true; u.noTarget = false; u.aiT = 0;
        g.order = 'attack'; g.seekRange = 30; g.focus = rt.player.u;
        if (!F[id + 'On']) {
          F[id + 'On'] = true;
          rt.say(id === 'yakata' ? '浅井の番兵' : '浅井の見張り', '谷道に織田じゃ！　登り口を守れ！', 3);
        }
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending || !rt.player.u.alive) return;
    this.reliefTick(rt);
    // 本人の任務に待ちを足さず、大手の別働隊が下の曲輪から順に近づく。
    // 本丸はまだ長政の持ち場。門前までで止め、制圧したとは告げない。
    if (F.step >= 1 && F.front < F.oteRoute.length - 1 && rt.t >= F.frontAt && (F.front < 3 || F.step >= 2)) {
      const k = F.oteRoute[++F.front];
      F.oteColumn.moveTo(k.x, k.cz, 18);
      F.frontAt = rt.t + 24;
      rt.bark(`南の大手の組は${k.name}へ。我らは秀吉の攻め口を守れ`);
    }
    const p = rt.player.u.pos;
    const updateHud = rt.t >= (F.objectiveAt || 0);
    if (updateHud) F.objectiveAt = rt.t + 0.5;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.hurtHintT > rt.t)) {
      F.hurtHintT = rt.t + 20;
      const hit = rt.player.lastHit;
      rt.bark(hit && hit.ranged && rt.t - hit.t < 8 ? '矢玉で深手じゃ。塀や屋敷の陰へ退け。安全な所で味方のそばへ寄り、傷を縛れ' : '手傷が深い。構えて味方の後ろへ下がれ。安全な所で傷を縛れ');
    }
    if (F.step === 1) {
      roadPoint(VALLEY_ROUTE, p, F.playerRoad);
      const r = F.playerRoad;
      // 角を少し外れて通っても、通り過ぎた印に戻さない。斜面へ外れた時は合流点を示す。
      const idx = Math.min(VALLEY_ROUTE.length - 1, Math.floor(r.s) + 1);
      F.trailPoint.x = r.d > 6 ? r.x : VALLEY_ROUTE[idx][0];
      F.trailPoint.z = r.d > 6 ? r.z : VALLEY_ROUTE[idx][1];
      const d = Math.hypot(p.x - BELOW.x, p.z - BELOW.z);
      if (updateHud) {
        const dx = F.trailPoint.x - p.x, dz = F.trailPoint.z - p.z;
        const direction = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? '東' : '西' : dz > 0 ? '南' : '北';
        rt.objProgress('main', `${direction}へ ${Math.round(Math.hypot(dx, dz))}メートル。谷道の矢印に続け`);
      }
      this.ambushTick(rt);
      let joined = 0;
      for (const u of F.hide.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) < 18) joined++;
      if (d < 16 && gone(F.yakata) && gone(F.watch) && joined >= 3) this.assault(rt);
      else if (d < 16 && gone(F.yakata) && gone(F.watch) && updateHud) rt.objProgress('main', '登り口で秀吉の先手を待て。戦える味方三人と攻め上れ');
    }
    for (const id of ['yakata', 'watch']) {
      const g = F[id];
      if (F[id + 'On'] && !gone(g) && !rt.markers.some((m) => m.id === id)) {
        let seen = false;
        for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 30 && sightPoint(rt, u.pos)) { seen = true; break; }
        if (seen) rt.marker(id, centerOf(g), id === 'watch' ? '谷の奥の見張り' : '居館の番兵', { red: true, group: g });
      }
    }
    if (F.nests && F.step >= 1 && F.step <= 3) for (const nst of F.nests) {
      if (gone(nst.g)) continue;
      if (nst.seen) {
        let aimed = false;
        for (const gun of nst.g.units) if (gun.alive && gun.type === 'gun' && gun.target === rt.player.u && !gun.reload) { aimed = true; break; }
        if (aimed && sightPoint(rt, nst.c) && rt.t >= (F.nestWarnT || 0)) {
          F.nestWarnT = rt.t + 8; rt.bark('銃座がこちらを狙う。構えで弾は防げぬ。横へ避け、塀の陰へ退け');
        }
        continue;
      }
      const dn = Math.hypot(p.x - nst.c.x, p.z - nst.c.z), dm = Math.hypot(p.x - nst.mouth.x, p.z - nst.mouth.z);
      // 目に入った銃座だけ知らせる。物陰の照準先から位置を教えない。
      if ((dn < 17 || dm < 11) && sightPoint(rt, nst.c)) { nst.seen = true; F.nestWarnT = rt.t + 8; rt.army.play('eshout', nst.c, 1); sfx('far', 0.5); rt.bark('隠し銃座じゃ！　構えでは弾を防げぬ。横へ避け、塀の陰から後ろへ回れ'); rt.marker(nst.id, nst.c, () => '隠し銃座', { red: true, h: 3, group: nst.g }); }
    }
    if (F.step === 2) {
      if (!F.onoDone && gone(F.ono)) this.onoFall(rt);
      const path = F.onoDone ? CLIMB_UP : ROUTE_O;
      let idx = F.onoDone ? F.kyoTrailIdx : F.onoTrailIdx;
      while (idx < path.length - 1 && Math.hypot(p.x - path[idx][0], p.z - path[idx][1]) < 1.8) idx++;
      if (F.onoDone) F.kyoTrailIdx = idx; else F.onoTrailIdx = idx;
      F.trailPoint.x = path[idx][0]; F.trailPoint.z = path[idx][1];
      let left = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 1 && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) left++;
      // 門兵が崩れたら、曲輪の中の守りへ印を移す
      if (gone(F.kyoGate) && !F.kyoMark && !gone(F.kyo)) { F.kyoMark = true; rt.marker('kyo', centerOf(F.kyo), () => '京極丸の守り', { red: true, group: F.kyo }); F.kyo.order = 'attack'; F.kyo.seekRange = 30; }
      let friends = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 0 && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) friends++;
      const gate = F.westGate?.struct;
      const breached = !gate || gate.opened || gate.hp <= 0;
      if (updateHud) rt.objProgress('main', !F.onoDone ? '道の印をたどり、屋敷の南の木戸へ' : !breached ? '西の木戸へ。木戸を打って開けよ' : left ? '木戸の内の守りを崩せ' : '京極丸の内を味方六人で十秒保て');
      F.captureT = F.onoDone && breached && left === 0 && friends >= 6 && F.C.kuruwa.kyogoku.test(p.x, p.z) ? F.captureT + dt : 0;
      if (updateHud && F.onoDone && breached && left === 0) rt.objProgress('main', !F.C.kuruwa.kyogoku.test(p.x, p.z) ? '京極丸の木戸の内へ戻れ。押さえる時は数え直し' : friends < 6 ? `本人・供を含む戦える味方 ${friends}／6人。列を待て` : `京極丸を押さえる ${Math.min(10, Math.floor(F.captureT))}／10秒`);
      if (F.captureT >= 10) this.cut(rt);
    }
    if (F.step === 3) {
      const inside = F.C.kuruwa.kyogoku.test(p.x, p.z);
      if (!F.komaAttack) {
        if (!(F.holdersAt > rt.t)) { F.holdersAt = rt.t + 1; this.staffHolders(rt); }
        let south = 0, north = 0;
        for (const g of F.kyoHolders) if (!gone(g)) for (const q of g.units) if (q.alive && !q.fleeing && !q.woundOut && !q.noTarget && F.C.kuruwa.kyogoku.test(q.pos.x, q.pos.z)) {
          if (Math.hypot(q.pos.x, q.pos.z - (KYO.z1 - 4)) < 6) south++;
          if (Math.hypot(q.pos.x, q.pos.z - (KYO.z0 + 4)) < 6) north++;
        }
        const heldMouths = south >= 2 && north >= 2;
        let friends = 0, enemies = 0;
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++; else if (u.team === 1) enemies++;
        }
        F.awayT = enemies > 0 && friends === 0 ? F.awayT + dt : 0;
        if (updateHud) rt.objProgress('main', F.awayT > 0 ? `京極丸を取り返せ。あと${Math.max(0, Math.ceil(35 - F.awayT))}秒で持ち場を失う` : !inside ? '京極丸へ戻れ。本人も内で守る二十秒は数え直し' : enemies > 0 || !F.counter.every(gone) ? '南北の口から来る敵を退けよ' : !heldMouths ? `残す押さえ・南 ${south}／2人、北 ${north}／2人。味方の列を待て` : `京極丸を守る ${Math.min(20, Math.floor(F.holdT))}／20秒`);
        if (F.awayT > 35) { this.lose(rt); return; }
        if (enemies === 0 && F.counter.every(gone) && inside && heldMouths) F.holdT += dt;
        else F.holdT = 0;
        if (F.holdT >= 20) this.attackKoma(rt);
      } else {
        while (F.komaIdx < F.komaPath.length - 1 && Math.hypot(p.x - F.komaPath[F.komaIdx][0], p.z - F.komaPath[F.komaIdx][1]) < 1.8) F.komaIdx++;
        F.trailPoint.x = F.komaPath[F.komaIdx][0]; F.trailPoint.z = F.komaPath[F.komaIdx][1];
        if (F.C.kuruwa.koma.test(p.x, p.z)) rt.unmark('trail');
        let friends = 0, enemies = 0;
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.koma.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++; else if (u.team === 1) enemies++;
        }
        F.captureT = enemies === 0 && friends >= 4 && F.C.kuruwa.koma.test(p.x, p.z) ? F.captureT + dt : 0;
        if (updateHud) rt.objProgress('main', !F.C.kuruwa.koma.test(p.x, p.z) ? '北の木戸を抜け、小丸の内へ。外では押さえる時を数え直す' : enemies > 0 ? '小丸の内に残る敵を退けよ' : friends < 4 ? `小丸の味方 ${friends}／4人。列を待て` : `小丸を押さえる ${Math.min(12, Math.floor(F.captureT))}／12秒`);
        if (F.captureT >= 12) this.komaFall(rt);
      }
    }
    if (F.step >= 1 && F.oda.every(gone)) this.lose(rt, '羽柴の攻め手が崩れ、この組も進めなくなった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout() {},
};

// 両軍の総勢（織田 三万ほど、浅井 五千ほど。数には諸説ある）
odani.force = () => ({ a: 30000, a0: 30000, b: 5000, b0: 5000 });
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
odani.noWake = false;
odani.noReserve = true; // 共通の新手は足さず、近づいた既存の遠景兵だけ引き継ぐ。
odani.wakeRoom = 250;
odani.noRevive = true; // 致命傷の後に体力を戻して戦闘へ復帰させない。
odani.strictHits = true; // 一撃の損と連続被弾を主人公だけ軽くする上限を外す。
odani.rts = true;
// 総大将（taisho.js）：長政は本丸の御殿の奥。討ち取りの流れはこの定義が持つ（最期は史実の文で）。
// 味方の殿（信長）は虎御前山の遠くの本陣なので、ここには置かない（殿を狙う一隊も来ない）
odani.taisho = { a: null, b: { name: '浅井長政', def: true } };
odani.noTaishoRaid = true;
// 両軍とも共通の近距離引き継ぎを使う。任務の固定組は回収せず、遠景兵の枠だけ巡らせる。
// 史実でこの戦にいた名のある武将（battle.js の placeFamous）。長政・久政は前線に出さない
odani.famous = [];
odani.noHorse = true;
odani.date = () => '天正元年八月二十七日　秋・夜の攻め';
odani.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '';
odani.skip = (rt) => { if (rt.phase === 'brief') odani.climb(rt); };
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉義景を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた大きな山城だった。番所・御茶屋・御馬屋・桜馬場・大広間・本丸・中丸・京極丸・小丸・山王丸が並び、本丸の北は大堀切で断たれていた。西の清水谷には浅井氏の居館や家臣の屋敷が並んでいた。南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返した。信長公記巻六は八月二十七日の夜に京極丸へ攻め上り、久政の居城を取ったと記す。翌日に信長が京極丸へ上り、長政と赤尾清綱も最期を迎えたとする。長政が九月一日に赤尾屋敷で自害したとも伝わり、日付・場所には異説がある。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。秀吉が攻め上った道（清水谷からとも）や、一行を送った者の名には諸説がある。兵の数にも諸説ある。曲輪ごとの兵数、清水谷の道、南北の反撃、天気と建物は復元。地形は国土地理院の標高を下地に、谷・曲輪・道を加工した推定である。清水谷の当時の水流は確定していない。主人公の任務は羽柴の一組として京極丸を守り、小丸の守りを崩す所まで。お市の方の退去を指揮したり、赤尾清綱を京極丸で討つ役は持たない。';
// 夜の羽柴の攻めは信長用の一覧から外す（lord.js）。足軽の攻め口を信長の居所として登録しない。

// 自動操作も組と登り、木戸を破り、京極丸と小丸の持ち場を押さえる。
odani.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然回復しない。短く退いて手当てを試し、全快を待たず任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (F.step < 4 && canTreat && u.hp < u.maxHp * 0.5 && !b.botRest && !(b.botRestNext > b.t)) {
    b.botRest = true; b.botRestUntil = b.t + 12;
  }
  if (b.botRest && (F.step >= 4 || b.t >= b.botRestUntil || !canTreat)) {
    b.botRest = false; b.botRestNext = b.t + 20;
  }
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    const c = F.hide.center();
    goTo(p, inp, c.x + 3, c.z + 3, 2);
    return;
  }
  // 屋敷の庭では守りへ詰める。狭い虎口を通る間だけ、遠い敵を追わない。
  // 反撃を待つ相手と実際の打ち手の選び方は、共通の頭とそろえる。
  const entering = F.step === 2 && F.onoDone && b.botKyoWp !== CLIMB_UP.length;
  const e = strikeTarget(b, entering ? 3 : 12);
  const d = e ? Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) : Infinity;
  // 近くても切岸の向こうへは直進しない。届く突きは残し、遠い敵へは道順で寄る。
  if (e && F.step < 4 && (d < (p.weapon === 'sword' ? 1.9 : 2.8) || roadClear(b.army, u, u.pos, e.pos))) {
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 得物の間合いへ詰め、打ち込みを受けてから構えを解いて突き返す。
    // 構えと突きを同じコマのくじで選ぶと、届かない払いを繰り返してしまう。
    const reach = p.weapon === 'sword' ? 1.7 : 2.6;
    if (d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step <= 1) {
    if (F.step === 0) { const a = F.hideU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3); return; }
    // 人と同じ谷道の印をたどり、曲がり角を斜めに切らない。
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, 1);
    return;
  }
  if (F.step === 2) {
    if (!F.onoDone) {
      if (b.botOnoWp == null) {
        roadPoint(ROUTE_O, u.pos, ROUTE_FROM);
        b.botOnoWp = Math.ceil(ROUTE_FROM.s);
      }
      while (b.botOnoWp < ROUTE_O.length - 1 && Math.hypot(u.pos.x - ROUTE_O[b.botOnoWp][0], u.pos.z - ROUTE_O[b.botOnoWp][1]) < 2) b.botOnoWp++;
      const q = ROUTE_O[Math.min(b.botOnoWp, ROUTE_O.length - 1)];
      goTo(p, inp, q[0], q[1], 1); return;
    }
    const gate = F.westGate?.struct;
    if (gate && !gate.opened && gate.hp > 0 && Math.hypot(u.pos.x - GATE_WEST.x, u.pos.z - GATE_WEST.z) < 6) {
      // 道へ向く操作を東向きで上書きすると、門の脇から壁へ歩き続ける。
      // 刀でも木戸へ届く所まで寄ってから、足を止めて打つ。
      const x = GATE_WEST.x - 1.4, z = GATE_WEST.z;
      goTo(p, inp, x, z, 0.2);
      if (Math.hypot(u.pos.x - x, u.pos.z - z) > 0.2) return;
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.PI / 2;
      inp.leftPressed = p.cd <= 0 && !p.pending && p.sta > p.maxSta * 0.35 &&
        (p.weapon === 'sword' || p.time - (p.guardOffT ?? -9) > 0.45);
      return;
    }
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
  if (F.step === 3) {
    // 小丸へ直進すると北の木戸の塀に当たる。任務と同じ折れ点を順に通る。
    const inside = F.komaAttack && F.C.kuruwa.koma.test(u.pos.x, u.pos.z);
    const target = F.komaAttack ? inside ? KOMC : F.trailPoint : KC;
    const q = roadWay(b.army, u, target);
    goTo(p, inp, q.x, q.z, F.komaAttack && !inside ? 1 : 3);
  }
};

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
    ['odani_nagamasa', '本陣・本丸', '浅井長政', 1500, HONC, 'azai', 'azai', (r) => r.flags.nagamasa],
    ['odani_hisamasa', '小丸', '浅井久政', 900, KOMC, 'azai', 'azai', (r) => r.flags.hisamasa],
    ['odani_kyogoku', '京極丸・西の木戸', '将の名は不明', 700, { x: KC.x + 3, z: KC.z }, 'azai', 'azai', (r) => r.flags.kyo, { named: false }],
    ['odani_nakamaru', '中丸', '将の名は不明', 500, { x: NAKAMARU.x, z: NAKAMARU.cz }, 'azai', 'azai', (r) => r.flags.kyoAid, { named: false }],
    ['odani_ohiroma', '大広間・大手の守り', '将の名は不明', 600, { x: OOHIROMA.x, z: OOHIROMA.cz }, 'azai', 'azai', (r) => r.flags.azHon, { named: false }],
    ['odani_sanno', '山王丸', '将の名は不明', 300, { x: SANNO.x, z: SANNO.cz }, 'azai', 'azai', (r) => r.flags.sanno, { named: false }],
    ['odani_ono', '大野木屋敷', '大野木屋敷の守り（将は不明）', 250, { x: ONOGI.x, z: ONOGI.z + 3 }, 'azai', 'azai', (r) => r.flags.ono, { named: false }],
    ['odani_akao', '赤尾屋敷・本丸の下', '赤尾清綱の手', 250, { x: AKAO.x, z: AKAO.z }, 'azai', 'azai', (r) => r.flags.akao],
  ], '浅井五千の目安を割り振った復元。長政と久政の居所を採用し、他の曲輪の将は不明とする。'),
]);

export { odani };
