// ======================================================================
// 豊臣編　山中城の戦い（天正十八年三月二十九日の朝）。docs/chapter2_toyotomi.md の 9 を正とする
// 豊臣秀次を大将におよそ七万が、松田康長らおよそ四千の守る北条の山中城（箱根の西の坂）を攻める。
// 一柳直末が鉄砲に当たって討たれるほどの激戦だったが、城は半日で落ちた。岱崎出丸の間宮康俊も討ち死に。
// 主人公は城主として自分の手勢を率い、秀次の下で岱崎出丸の側から寄る。
// ①岱崎出丸の鉄砲の中を寄る ②障子堀の畝の上を渡る ③三の丸の虎口（枡形）を破る ④二の丸を抜け、本丸の松田康長の隊を崩す
// 地形：国土地理院の標高（asset_dem_yamanaka.js・tools/dem.mjs の yamanaka）。高さは 0.6 倍に詰め、曲輪は平らに削る。
// 座標：x が東、z が南（+z が三島の側の下り坂）。寄せ手は南から北（−z）へ坂を上る。縄張りは史跡の形を手本にした推定。
// ======================================================================
import * as THREE from 'three';
import { siegeStages } from './siege_stages.js';
import DEM from './asset_dem_yamanaka.js';
import { demSample } from './dem.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, kagaribi, tawara, yagura, palisade, solidRect, shogi, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { bankTex } from './nature.js';
import { siegePlan, siegeHeight, buildSiege, makeSamaFire } from './siege_kit.js';
import { withGuard } from './toyo_bot.js';
import { KILLS } from './stages.js';
import { addSite } from './map_sites.js';
import { addTaba } from './taketaba.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 12）：段の中身は t09_yamanaka/ に一段一ファイル
import * as shutsujin from './t09_yamanaka/shutsujin.js';   // 出陣：全国の諸将の旗と山中城の遠景・別の戦線の知らせ
import * as tahoumen from './t09_yamanaka/tahoumen.js';     // 別の口：東の尾根と西の丸の寄せ手・「別曲輪、突破！」
import * as rakujo from './t09_yamanaka/rakujo.js';
import * as shoshou from './t09_yamanaka/shoshou.js';       // 二巡：北条氏勝の落ち延び・徳川の旗・諸将の知らせ         // 落城の後：曲輪ごとに豊臣の旗・小田原はまだ先

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 東海道（城の中を通る土の道）。三島の側（南）から本丸の脇へ
const ROAD = [[34, 340], [24, 270], [14, 200], [10, 140], [10, 64], [10, 30], [14, -40], [24, -100], [30, -170]];
const SEAT = { x: 44, z: 232 };             // 豊臣秀次の本陣の床几（街道の後ろの陣幕の中）
const START = { x: 22, z: 220 };           // 地面の格子（groundHalf 240）と動ける所（moveLim 236）の内。前は 292 で、兵がみな z=176 の端に寄せられていた
const SIGN = { x: 0, z: 0, label: '', hideDistance: 3 };   // 関所の3：行き先の一歩手前（三〜六m）で▼を消さない（土橋・柵の前で印が消えたまま斬り合っていた）
// 曲輪（中心・半径・削った面の高さの足し）。切岸の縁は 10m で地形へ戻す。手本は docs/battle_refs/t09_yamanaka.md
//   seg：細長い曲輪（尾根に沿う）。rim：縁の内に盛る土塁の高さ（北条の城は石垣を使わない土の城）。gaps：土塁を切る虎口の点
const KURUWA = {
  // 岱崎出丸（間宮康俊）：街道の脇から三島の側へ尾根に沿って細長く延びる出丸。脇を畝堀（一の堀）が並ぶ
  dai: { x: -46, z: 176, r: 18, up: 1.6, seg: [-44, 146, -50, 212], rim: 1.5, gaps: [[-29, 176], [-44, 128]] },
  san: { x: 10, z: 14, r: 34, up: 1.2 },     // 三の丸（南の口は城攻めの部品の塀と枡形）
  ni: { x: 16, z: -46, r: 24, up: 1.6, rim: 1.5, gaps: [[16, -22], [21, -69]] },     // 二の丸
  hon: { x: 25, z: -106, r: 22, up: 2.2, rim: 1.7, gaps: [[24, -84]] },   // 本丸（松田康長）。北西の隅に天守櫓の高まり
  nishi: { x: -54, z: -50, r: 16, up: 1.4, rim: 1.3, gaps: [[-70, -50]] }, // 西の丸（まわりを障子堀が囲む）
  kita: { x: 46, z: -152, r: 15, up: 2.8, rim: 1.3, gaps: [[40, -138]] },  // 北の丸（本丸の奥の高み）
};
// 曲輪の芯（細長い曲輪は芯の線）への近さと、その点
function kNear(k, x, z) {
  if (!k.seg) return [Math.hypot(x - k.x, z - k.z), k.x, k.z];
  const [ax, az, bx, bz] = k.seg, dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1), px = ax + dx * t, pz = az + dz * t;
  return [Math.hypot(x - px, z - pz), px, pz];
}
// 障子堀：出丸と三の丸の間を東西に切る深い堀。底を格子の畝で仕切る（縦の畝の上だけを一列で渡れる）
const SHOJI = { x0: -40, x1: 60, z0: 90, z1: 110, depth: 4.6, cell: 6, rib: 0.7 };
const CROSS_X = 10;                          // 渡る筋（縦の畝の一つ。道の筋）
SHOJI.cx = CROSS_X;
// 岱崎出丸の東の柵の前の障子堀（史実：出丸の前も障子堀・畝堀で囲まれていた。始めの25秒に出丸へ寄る所の目の前に見える）。
//   南北に長い堀を二つ。間（z 170〜182）は掘らずに土橋として残し、寄せ手はそこを通って柵へ寄る
//   出丸の脇の堀は、史跡の一の堀と同じ畝堀（une：堀を横切る畝だけが梯子のように並ぶ。縦の畝は無い）
const SHOJI_DAI = [
  { x0: -27, x1: -12, z0: 140, z1: 169, depth: 3.4, cell: 5, rib: 0.6, cx: 140, alongZ: true, une: true },
  { x0: -27, x1: -12, z0: 183, z1: 210, depth: 3.4, cell: 5, rib: 0.6, cx: 183, alongZ: true, une: true },
];
// 城の奥の堀（見せるだけ・遊びの筋の外）：西の丸を囲む障子堀（史跡でいちばん名高い格子の堀）と、二の丸と本丸の間の畝堀。
//   本丸の堀は、二の丸から攻め上る筋（x 17〜27）を土橋として掘り残す（gap）
const SHOJI_OKU = [
  { x0: -78, x1: -30, z0: -31, z1: -20, depth: 4.2, cell: 5.5, rib: 0.6, cx: -78 },
  { x0: -36, x1: -25, z0: -72, z1: -31, depth: 4.2, cell: 5.5, rib: 0.6, cx: -72, alongZ: true },
  { x0: -78, x1: -36, z0: -80, z1: -70, depth: 4.2, cell: 5.5, rib: 0.6, cx: -78 },
  { x0: -8, x1: 52, z0: -83, z1: -74, depth: 3.8, cell: 5, rib: 0.6, cx: -8, une: true, gap: [16, 28] },
];
const ALL_HORI = [SHOJI, ...SHOJI_DAI, ...SHOJI_OKU];
// 三の丸の大手：枡形虎口・横矢・畝堀・切岸・逆茂木（城攻めの共通部品）
const SP = siegePlan({ x: 10, z: 48, rot: 0, W: 26, koguchi: 'masu', turn: 1,
  yokoya: { at: 14, w: 6, d: 4 }, moat: { w: 8, depth: 3.4, une: 4 }, kirigishi: 1.4,
  umadashi: { kind: 'kaku', r: 5, moatW: 3, depth: 2.2, bank: 0.9 }, sakamogi: { at: 5 }, shiyori: false });
// 対岸の柵は z=87。集合点をその手前へ置くと、開口から出た兵まで柵へ戻される。
// 馬出しの左右へは、柵の内側を横に進んでから口へ回る。
for (const mouth of SP.at.mouths) mouth.far.z = Math.min(mouth.far.z, SHOJI.z0 - 5);
const SP_H = siegeHeight(SP);
// 大手門から本丸への攻め上りの筋：門・枡形の中・東へ折れた櫓門の外・三の丸・二の丸の虎口・本丸の土橋（枡形は東へ折れる。turn 1）
const UP_ROUTE = [[SP.x, SP.z], [SP.x, SP.z - 4.5], [SP.x + 9, SP.z - 3], [SP.x + 9, SP.z - 20], [16, -20], [16, -46], [21, -68], [22, -80], [25, -94]];
// 大手の往復は同じ折れを通す。休息のたびに道の配列を作り直さない。
const OTE_ROUTE = [SP.at.mouths[1].lane, SP.at.mouths[1].outer, SP.at.mouths[1].inner,
  SP.at.uma, SP.at.bridgeOut, SP.at.bridgeIn, SP.at.gateOut, SP.at.plaza];
// 主人公だけ先へ進んでも、後続がまだ通っていない門・虎口を飛ばさない。
// 下知を替える時だけ道に継ぎ足し、後列に必要な通過済みの折れも残す。毎コマは作らない。
function continuePath(g, route) {
  // 後列の持ち場も通って来た折れに沿わせる。先頭の通過済みの点を消すと、
  // まだ堀や門の手前にいる兵が、切岸を横切る一直線の持ち場へ向かってしまう。
  const following = g.order === 'path' && g.path?.length;
  const history = following ? g.path : [[g.anchor.x, g.anchor.z]];
  const index = following ? g.pathIdx || 0 : 1;
  g.path = [...history, ...route].map((p) => p.slice());
  g.pathIdx = index;
  g.roadColumn = true; g.followColumnRoad = true;
  g.order = 'path';
}
const HOJO = { flag: 'hojo', armor: 0x2e2a26, hatColor: 0x1e1b18, lace: 0x5a4632, cloth: 0x6a5a40 };
const TOYO = { flag: 'toyotomi' };   // 秀次の本陣・中村一氏の手（中村の紋は確かな物が無く、主家の桐）
// 先手の諸将は自家の旗で寄せる（一柳の釘抜・山内の丸に三つ柏・堀の旗。textures。豊臣の旗だけで揃えない）
const ICHI = { flag: 'kuginuki' }, YAMA = { flag: 'kashiwa' }, HORI = { flag: 'hori' };

const NAT = (x, z) => (demSample(DEM, x, z) - 100) * 0.6;
function kuruwaH(x, z, h) {
  for (const k of Object.values(KURUWA)) {
    const [d, px, pz] = kNear(k, x, z);
    if (d > k.r + 10) continue;
    const top = NAT(px, pz) + k.up;
    h += (top - h) * (1 - sstep(k.r, k.r + 10, d));
    // 縁の内に盛った土塁（幅 7m ほど・上は丸い）。虎口の所は切る
    if (k.rim && d > k.r - 7.5 && d < k.r + 0.5) {
      let g = 1;
      for (const [gx, gz] of k.gaps || []) g = Math.min(g, sstep(4, 8, Math.hypot(x - gx, z - gz)));
      const u = (d - (k.r - 3.5)) / 3.8;
      if (u > -1 && u < 1) h += k.rim * (1 - u * u) * g;
    }
  }
  return h;
}
function shojiH(x, z, S = SHOJI) {
  if (x < S.x0 - 3 || x > S.x1 + 3 || z < S.z0 - 3 || z > S.z1 + 3) return 0;
  const ex = Math.min(x - S.x0, S.x1 - x), ez = Math.min(z - S.z0, S.z1 - z);
  let edge = sstep(-3, 1.2, Math.min(ex, ez));           // 法（のり）は急
  // 土橋（gap）：掘り残した土の道
  if (S.gap) { const u = S.alongZ ? z : x; edge *= 1 - Math.min(sstep(S.gap[0] - 2.5, S.gap[0] + 0.5, u), 1 - sstep(S.gap[1] - 0.5, S.gap[1] + 2.5, u)); }
  let dig = S.depth * edge;
  // 縦の畝（南北の筋）と横の畝（東西の中ほど）：上は堀の縁から 0.8m 下
  //   alongZ の堀（南北に長い）は、畝の向きを入れ替える。畝堀（une）は堀を横切る畝だけ
  const q = (((S.alongZ ? z : x) - S.cx) % S.cell + S.cell) % S.cell, dv = Math.min(q, S.cell - q);
  const v = S.alongZ ? x : z, mid = S.alongZ ? (S.x0 + S.x1) / 2 : (S.z0 + S.z1) / 2;
  const qh = ((v - mid) % S.cell + S.cell) % S.cell;
  const dh = S.une ? 99 : Math.min(qh, S.cell - qh);
  const rib = Math.max(1 - sstep(S.rib, S.rib + 0.6, dv), 1 - sstep(S.rib, S.rib + 0.6, dh));
  dig -= rib * (S.depth - 0.8) * edge;
  return -Math.max(0, dig);
}
const inShoji = (x, z, pad = 0, S = SHOJI) => x > S.x0 - pad && x < S.x1 + pad && z > S.z0 - pad && z < S.z1 + pad;
// 土橋へ向かう途中で対岸の敵を見つけても、畝堀を斜めに横切って追わない。
// 攻撃の間合いに入った敵は迎え撃てるよう、移動が要る時だけ使う。
function crossesDaiMoat(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const S of SHOJI_DAI) {
    let lo = 0, hi = 1;
    if (dx === 0) { if (a.x <= S.x0 || a.x >= S.x1) continue; }
    else { const t0 = (S.x0 - a.x) / dx, t1 = (S.x1 - a.x) / dx; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    if (dz === 0) { if (a.z <= S.z0 || a.z >= S.z1) continue; }
    else { const t0 = (S.z0 - a.z) / dz, t1 = (S.z1 - a.z) / dz; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    if (lo < hi) return true;
  }
  return false;
}
// 堀へ押し出された兵は先に岸へ戻す。岸と土橋を斜めに結ぶと法に当たり続ける。
function daiApproach(u) {
  const p = u.pos;
  if (p.x <= -30 || Math.abs(p.z - 176) <= 3) return null;
  const q = u._daiApproach || (u._daiApproach = { x: 0, z: 0 });
  q.x = p.x > -19.5 ? -6 : -32;
  q.z = p.x > -29 && p.x < -10 ? p.z : 176;
  return q;
}
// 軽い移動では攻城の行き先が省かれ、後列が東岸の持ち場で止まっていた。
// 出丸を攻める味方だけ、近い兵と同じ土橋・破れ口を使う。壁の当たりは残す。
function daiMoveWay(army, u, want) {
  const g = u.group;
  // 11/12 クラウドさ：本人が対岸の柵（z=87）の堀の側にいて行き先が柵の内なら、柵の口（畝の正面）を通す。
  //   まっすぐ柵へ歩くと、act bot は（21,88）で柵に押し付いたまま十分止まった。
  if (u.isPlayer && want.z < SHOJI.z0 - 3 && u.pos.z > SHOJI.z0 - 3.5 && u.pos.z < SHOJI.z0 + 2 &&
      Math.abs(u.pos.x - CROSS_X) > 1.2 && army.wallBetween(u.pos, -1, want)) {
    const q = u._rimMouth || (u._rimMouth = { x: 0, z: 0 });
    q.x = CROSS_X; q.z = Math.abs(u.pos.x - CROSS_X) > 1.5 ? SHOJI.z0 - 1 : SHOJI.z0 - 6;
    return q;
  }
  if (!(u.farSim || u.qualityAbstract) || u.isPlayer || u.fleeing || u.stdHeld ||
      g?.team !== 0 || g.order !== 'assault' || !g.assault?.gateOnly) return want;
  const to = g.assault(u);
  if (!to) return want;
  if (!to.isStruct) return to;
  if (to.alive === false || to.opened || to.noTarget) return want;
  const q = u._daiWallApproach || (u._daiWallApproach = { x: 0, z: 0 });
  army.targetPoint(to, u, q);
  // 軽い兵は柵を攻撃しない。柵の手前で待ち、近い処理へ戻った兵が破る。
  const dx = u.pos.x - q.x, dz = u.pos.z - q.z, d = Math.hypot(dx, dz);
  if (d < 1.8) { q.x = u.pos.x; q.z = u.pos.z; }
  else { q.x += dx / d * 1.8; q.z += dz / d * 1.8; }
  return q;
}
function height0(x, z) {
  let h = kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  for (const S of ALL_HORI) h += shojiH(x, z, S);
  return h;
}
// 二の丸の虎口から本丸の虎口へ上る坂（畝堀の土橋の上）。切岸の段（8m で 6m 上がる）を、登れる坂にならす
const RAMP = { x: 22, w: 3.5, z0: -66, z1: -92 };
function height(x, z) {
  const h = height0(x, z), dx = Math.abs(x - RAMP.x);
  if (dx > RAMP.w + 3 || z > RAMP.z0 || z < RAMP.z1) return h;
  const t = (RAMP.z0 - z) / (RAMP.z0 - RAMP.z1), a = height0(RAMP.x, RAMP.z0), b = height0(RAMP.x, RAMP.z1);
  const k = 1 - sstep(RAMP.w, RAMP.w + 3, dx);
  return h + (a + (b - a) * t - h) * k;
}
// 障子堀の畝の形（地面の格子は 3.3m で細い畝を描けないので、畝の土の背を形で足す。見た目だけ・一つの形にまとめて一回で描く）
//   畝ごとに、上が細く裾の広い土の背（台形の断面）を、堀の縁の高さに沿って続ける。色は関東ローム（赤みの土）
function shojiRibs(rt) {
  const pos = [], col = [], uvs = [], idx = [];
  const rim = (x, z) => kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  // 三島市の発掘記録（docs/battle_refs/t09_yamanaka.md）に沿う、まっすぐな畝と丸い背。
  //   断面を左右対称に揃え、頂点ごとの揺れで尖った塊を作らない。土の絵（bankTex）を張り、色は赤い関東ローム、
  //   底ほど湿って暗く、背は乾いて明るい（平らな茶色の板に見せない）
  const PROF = [[-1, 0], [-0.62, 0.34], [-0.34, 0.74], [-0.12, 0.97], [0.12, 0.97], [0.34, 0.74], [0.62, 0.34], [1, 0]];
  const hz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const rib = (ax, az, bx, bz, wTop, wBot, tone, S) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
    const nx = -(bz - az) / L, nz = (bx - ax) / L, NP = PROF.length;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      let v = 0, px = 0, py = 0;
      for (let k = 0; k < NP; k++) {
        const [f, hgt] = PROF[k];
        const half = Math.abs(f) <= 0.12 ? wTop * 0.6 : wTop + (wBot - wTop) * (1 - hgt);
        const off = Math.sign(f) * half, px0 = x + nx * off, pz0 = z + nz * off;
        // 岸では掘る深さを地形と同じ割合で閉じる。一定の断面を途中で切ると土の壁になる。
        const bank = sstep(-3, 1.2, Math.min(px0 - S.x0, S.x1 - px0, pz0 - S.z0, S.z1 - pz0));
        const y = rim(px0, pz0) - ((S.depth + 0.1) * (1 - hgt) + 0.8 * hgt) * bank;
        if (k) v += Math.hypot(off - px, y - py) / 3; px = off; py = y;
        pos.push(x + nx * off, y, z + nz * off); uvs.push(L * t / 3 + tone * 0.37, v);
        // 色：底は湿った濃い赤土、背は乾いて白っぽく、ところどころ枯れ草の黄
        // 11/8 critic60 山中 23：切岸の上が白っぽいのっぺりした板に見えた。乾いた背の明るみを抑え、関東ロームの赤土の色に寄せる
        const wet = 1 - hgt, r1 = hz(i * 3 + k, tone + 1), dry = hgt > 0.9 ? 0.05 : 0;
        let c = [1.16 - wet * 0.26 + dry, 0.8 - wet * 0.22 + dry * 0.9, 0.58 - wet * 0.18 + dry * 0.7];
        if (hgt > 0.3 && r1 > 0.78) c = [c[0] * 0.92, c[1] * 1.0, c[2] * 0.72];
        const k2 = 0.9 + r1 * 0.18; col.push(c[0] * k2, c[1] * k2, c[2] * k2);
      }
      if (i < n) {
        const a = base + i * NP, b = a + NP;
        for (let p = 0; p < NP - 1; p++) idx.push(a + p, a + p + 1, b + p, a + p + 1, b + p + 1, b + p);
      }
    }
  };
  let tone = 0;
  for (const S of ALL_HORI) {
    const [u0, u1, v0, v1] = S.alongZ ? [S.z0, S.z1, S.x0, S.x1] : [S.x0, S.x1, S.z0, S.z1];
    const P = (u, v) => (S.alongZ ? [v, u] : [u, v]);
    const wT = S.rib * 0.9, wB = S.rib + 1.5, G = S.gap;
    for (let u = S.cx + Math.ceil((u0 + 0.8 - S.cx) / S.cell) * S.cell; u < u1 - 0.8; u += S.cell) {
      if (G && u > G[0] - 2.5 && u < G[1] + 2.5) continue;
      // 外縁に近い畝は裾も堀の内へ収める。背だけ収めると裾が曲輪へ突き出す。
      rib(...P(u, v0 - 3), ...P(u, v1 + 3), wT, Math.min(wB, u - u0, u1 - u), tone++, S);
    }
    if (S.une) continue;
    const vm = (v0 + v1) / 2;
    for (let v = vm + Math.ceil((v0 + 0.8 - vm) / S.cell) * S.cell; v < v1 - 0.8; v += S.cell)
      rib(...P(u0 - 3, v), ...P(u1 + 3, v), wT, Math.min(wB, v - v0, v1 - v), tone++, S);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: bankTex(), side: THREE.DoubleSide }));
  m.receiveShadow = true;
  rt.scene.add(m);
  return m;
}
// 北条の板の櫓（天守櫓・西櫓）：土の高まりに建つ板壁・板葺の櫓。漆喰も瓦も石垣も無い（戦国の関東の土の城）。
//   各面に狭間（黒い小窓）。floors は一重か二重。形を一つにまとめて一回で描く
function itaYagura(rt, x, z, o = {}) {
  const { w = 6, d = 5, floors = 2, rot = 0 } = o, parts = [], y0 = rt.world.heightAt(x, z);
  const box = (bw, bh, bd, px, py, pz, col) => {
    const g = new THREE.BoxGeometry(bw, bh, bd); g.translate(px, py, pz);
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = 0.92 + ((i * 7) % 5) * 0.03; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g);
  };
  const roof = (rw, rd, py, rh) => {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(rw, rh, rd); g.translate(0, py + rh / 2, 0);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const c = new THREE.Color(0x5b5448), a = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(ng);
  };
  box(w + 0.8, 0.8, d + 0.8, 0, -0.5, 0, 0x5a4a38);            // 足もとの土の基壇（踏み固めた土）。大きな茶色の箱に見えた（山中 23）ので低く小さく
  let y = 0.2, cw = w, cd = d;
  for (let f = 0; f < floors; f++) {
    const h = f ? 2.6 : 3.4;
    box(cw, h, cd, 0, y + h / 2, 0, 0x4b4034);                  // 板壁（褪せた黒茶）
    for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t++) {   // 狭間：各面に三つ
      box(0.32, 0.36, 0.06, t * cw * 0.3, y + h * 0.55, s * (cd / 2 + 0.03), 0x0c0a08);
      box(0.06, 0.36, 0.32, s * (cw / 2 + 0.03), y + h * 0.55, t * cd * 0.3, 0x0c0a08);
    }
    y += h;
    if (f < floors - 1) { roof(cw + 1.6, cd + 1.6, y - 0.1, 0.9); cw *= 0.66; cd *= 0.66; y += 0.35; }
  }
  roof(cw + 1.8, cd + 1.8, y - 0.1, Math.max(1.6, cw * 0.38));  // 板葺の寄棟（浅い四方の屋根）
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.position.set(x, y0, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true;
  solidRect(x, z, w + 0.6, d + 0.6, rot);
  rt.scene.add(m);
  return m;
}
const nearKuruwa =(x, z, pad) => Object.values(KURUWA).some((k) => kNear(k, x, z)[0] < k.r + pad);

const t09_yamanaka = {
  resumeSteps: [[1, 'dai'], [2, 'shoji'], [3, 'ote'], [4, 'honmaru']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  minutes: 15, expectMin: 15,
  playerTaken: 0.18, playerRegen: 0.07,   // 15分の長い攻め（出丸の矢と鉄砲の前で倒れ続けた。11/8 bot）
  // 始まりの札の二三行（critic60 山中 34「七万対四千がこの戦の芯なのに札では分からない」）
  introText: '豊臣のおよそ七万が、北条のおよそ四千の守る山中城へ攻め上る。岱崎出丸は間宮康俊の手勢二百が守る。出丸の鉄砲と障子堀を越え、三の丸から本丸の松田康長の旗本へ。',
  // 見出しは大きな出来事だけ（指示の見出しは出さない。標準 五の1）
  bannerAllowed: (rt, t) => ['一柳直末、撃たれる', '間宮康俊、討ち死に', '山中城、落つ', '先手が崩れた'].includes(t),
  lethal: { soft: true },   // 命懸けの戦場（11/9 係A：bot が倒れるので soft）
  noFrontFill: true,          // 城の外の思わぬ所に作りの乱戦を置かない（敵は城の中・味方は街道の坂。kaito AP 10）
  frontlineDensity: false,    // 数人の物見の組を湧かせない（kaito AW 6）
  goalSignOnly: true,         // 行き先は頭上の金の▼一つ（旗の印・輪・枠を重ねない。kaito AL・AV 15）
  goalsAllRows: true,         // ①〜⑤を始めから並べる（共通画面の既定では今の一件だけになる）。
  keepBattleSigns: true,     // 行き先の印を出している間も、武将名と両軍の人数を省かない。
  goalSignTriangle: true,
  enemySignMaxPixels: 20,   // 通し確認：密集した近い敵の赤い印が視界を覆わないよう、命中時も同じ上限にする。
  foeSignMaxPixels: 20,     // 実兵の頭上印も同じ上限にする（enemySignMaxPixels は軽い兵用）。
  goalSignNoEdge: false,     // 関所の3（kaito 11/9「ピンが始めから終わりまで切れずに出る」）：画面外の行き先も縁の▼で示す（隠すと流しの七割で印が消えていた。11/11 関所係）
  actionGuideTarget: () => null,
  missionSignTarget: () => null, // 敵の頭上の赤い▼以外の選択印を付けない。
  noLeaderFollow: true,   // 行き先は目標の印一つだけ（ついていく相手の青い印を重ねない。kaito AV 15）
  goalSignNoLabel: false,    // 行き先には曲輪と門の名を残す。
  goalSignTarget(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending) return null;
    if (!F.step) { SIGN.x = shutsujin.LINE.x; SIGN.z = shutsujin.LINE.z; SIGN.label = '先手の列'; return SIGN; }
    let x, z, label;
    if (F.step === 1) {
      // 出丸の中心へ斜めに誘わず、先手が攻める土橋と柵を順に指す。
      if (p.x > -30 && Math.abs(p.z - 176) > 3) {
        const a = daiApproach(rt.player.u);
        x = a.x; z = a.z; label = '出丸の土橋';
      } else if (p.x > -30) {
        const s = F.daiBridge;
        if (s && s.alive !== false && s.hp > 0) {
          x = (s.seg[0] + s.seg[2]) / 2; z = (s.seg[1] + s.seg[3]) / 2; label = '出丸の柵';
        } else { x = -32; z = 176; label = '出丸の土橋'; }
      } else { x = KURUWA.dai.x; z = KURUWA.dai.z; label = '岱崎出丸'; }
    }
    else if (F.step === 2) {
      // 出丸から対岸を直接指すと、脇の畝堀へ斜めに誘う。寄せ手と同じ土橋から畝へ揃える。
      if (p.z > SHOJI.z1 + 2 && p.x < -11) {
        x = Math.abs(p.z - 176) > 2 ? Math.min(p.x, -32) : -6;
        z = 176; label = '出丸の土橋';
      } else if (p.z > SHOJI.z1 + 2 && Math.abs(p.x - CROSS_X) > 0.5) {
        x = CROSS_X; z = SHOJI.z1 + 10; label = '障子堀の畝';
      } else { x = CROSS_X; z = SHOJI.z0 - 5; label = '障子堀'; }
    }
    else if (F.step === 3) {
      const A = SP.at, M = A.mouths[1];
      let a = M.far;
      // 11/12 クラウドさ：本人が対岸の柵（z=87）の堀の側へ押し戻されると、印は柵越しの馬出しの口を指し続け、
      //   act bot は（21,88）で柵に向かって十分止まった。柵の外にいる間は、開いた口（畝の正面か破れた区画）へ先に導く。
      if (p.z > SHOJI.z0 - 3.5 && p.z < SHOJI.z0 + 2 && F.rimWall) {
        let ox = CROSS_X, od = Math.abs(p.x - CROSS_X);
        for (const s of F.rimWall) if (s.alive === false || s.hp <= 0) {
          const mx = (s.seg[0] + s.seg[2]) / 2;
          if (Math.abs(p.x - mx) < od) { ox = mx; od = Math.abs(p.x - mx); }
        }
        if (od > 1.5) { SIGN.x = ox; SIGN.z = SHOJI.z0 - 1; SIGN.label = '柵の口'; return SIGN; }
        SIGN.x = ox; SIGN.z = SHOJI.z0 - 6; SIGN.label = '柵の口'; return SIGN;
      }
      if (F.sub === 'back' || F.gateOpen) {
        // 門を指すだけでは馬出しの正面の柵へ突き当たる。口・土橋・門の順に案内する。
        const route = F.oteRoute;
        let i = F.oteSign || 0;
        if (F.oteEntered) i = route.length - 1;
        while (i < route.length - 1 && Math.hypot(p.x - route[i][0], p.z - route[i][1]) < 3) i++;
        // 開いていない門より奥を指さない。
        if (!F.gateOpen) i = Math.min(i, route.length - 2);
        F.oteSign = i; [x, z] = route[i];
        label = i < 4 ? '馬出しの口' : i < route.length - 1 ? '大手門' : '三の丸';
      } else { x = a.x; z = a.z; label = '馬出し'; }
    }
    else {
      // 途中再開の初表示だけ近い点を選ぶ。表示のたびに選び直すと、
      // 枡形の塀越しに近い点へ飛び、未通過の曲がり角を省いてしまう。
      let i = F.signRoute ?? 2;
      if (F.signRoute == null) {
        let distance = Math.hypot(p.x - UP_ROUTE[i][0], p.z - UP_ROUTE[i][1]);
        for (let j = i + 1; j < UP_ROUTE.length; j++) {
          const d = Math.hypot(p.x - UP_ROUTE[j][0], p.z - UP_ROUTE[j][1]);
          if (d < distance) { i = j; distance = d; }
        }
      }
      // 七m手前では枡形の隅をまだ回っていない。狭い門と同じ間合いまで寄って次へ。
      while (i < UP_ROUTE.length - 1 && Math.hypot(p.x - UP_ROUTE[i][0], p.z - UP_ROUTE[i][1]) < 2.5) i++;
      F.signRoute = i; [x, z] = UP_ROUTE[i];
      label = i < 4 ? '三の丸' : i < 6 ? '二の丸' : i < 8 ? '本丸の土橋' : '本丸';
    }
    SIGN.x = x; SIGN.z = z; SIGN.label = label; return SIGN;
  },
  meleeGuide: () => false,   // 「敵をたおせ」の札と敵を指す矢印は出さない。敵は頭上の▼で分かる（BH6）
  // 布陣図の地名（docs/fujin/t09_yamanaka.md）
  introMapPlaces: [{ x: -46, z: 196, name: '岱崎出丸' }, { x: 10, z: 120, name: '障子堀' }, { x: 25, z: -128, name: '本丸' }],
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    // 障子堀・切岸で足場とカメラの高さを、実際に描く三角面に合わせる。
    // 四隅の補間のままでは、畝の脇で地面へ沈む・宙に立つ差が残る。
    terrainTriangles: true,
    // 人の背の何倍もある切岸（54°より急な所）には兵も主人公も立たない（critic60 山中 21「崖に兵が張り付いて宙に立つ」）。道と坂は通れる
    climbTan: 1.4,
    strictFireOrders: true,   // 鉄砲の撃ち止みを近距離でも守り、突入する隙を残す。
    // 11/8 critic60 山中 29：斬り合いで片足を高く上げた跳ねた形のまま止まって見えた。急な坂で腿を上げすぎないよう歩幅の上限を抑える
    strideLimit: 0.85,
    seed: 15900,
    restrainedFaces: true,
    // 格子は 480m を 144 に割る（3.33m。障子堀の渡る畝 x=10 が格子の線に乗る）。出丸の前から始められるように広げた
    groundHalf: 240,
    moveLim: 236,
    time: 'day',
    mist: true,
    // 11/8 critic60 山中 38：霧の中の光の筋（shafts）が遠くの山に雨のような縦の帯に見えた。この戦は光の筋を立てない
    noShafts: true,
    mood: 'plain',   // 霧は朝の初めだけ（昼も朝霧の厚い層が白い平らな丘・雪に見えた。同 38）
    muddy: 0.25,
    paths: [ROAD],
    moveWay: daiMoveWay,
    height,
    tint(x, z, h, c) {
      // 堀の底と法は関東ローム（赤みの土）、曲輪は踏まれた草地、道は土
      if (ALL_HORI.some((S) => inShoji(x, z, 1, S)) || (Math.abs(x - SP.x) < SP.W + 6 && z > SP.z + SP.mIn - 1 && z < SP.z + SP.mOut + 1)) c.lerp({ r: 0.46, g: 0.3, b: 0.2 }, 0.75);
      else if (distToPolyline(x, z, ROAD) < 4) c.lerp({ r: 0.48, g: 0.4, b: 0.3 }, 0.45);
      else if (nearKuruwa(x, z, 2)) c.setRGB(c.r * 0.92, c.g * 0.97, c.b * 0.86);
      else c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.78);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || nearKuruwa(x, z, 8) || ALL_HORI.some((S) => inShoji(x, z, 8, S)) || (Math.abs(x - SP.x) < SP.W + 10 && z > SP.z - 8 && z < SP.z + SP.mOut + 12) || Math.hypot(x - START.x, z - START.z) < 30,
    trees: 900,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 18 ? 0.15 : 1),
    groves: [{ x: -110, z: 60, r: 16, n: 18 }, { x: 110, z: -20, r: 16, n: 18 }, { x: -90, z: -120, r: 14, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -175,
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    // 五件の並びは保ち、中央の知らせを任務の札と重ねない。この戦だけに効かせる。
    if (typeof document !== 'undefined') {
      const st = document.createElement('style');
      st.textContent = `
html:root body #hud:has(#h-prog[data-battle="t09_yamanaka"]) #center-call { left:34vw; right:auto; top:calc(48px + env(safe-area-inset-top,0px)); width:28vw; }
html:root body #hud:has(#h-prog[data-battle="t09_yamanaka"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="t09_yamanaka"]) #center-call .cc { max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:16px; line-height:1.35; letter-spacing:0; }
@media(max-height:500px) {
 html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="t09_yamanaka"].goal-mode { padding:4px 6px !important; }
 html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="t09_yamanaka"].goal-mode .pg-goals li.now { font-size:max(16px,calc(16px * var(--text-scale,1))) !important; }
}`;
      document.head.appendChild(st);
      rt.cleanupTasks?.add(() => st.remove());
    }
    F.step = 0; F.ek = 0; F.ak = 0; F.daiEk = 0;
    // 11/10 クラウド：矢と鉄砲の傷は playerTaken が効かず（鉄砲は一発に命の一割半の床）、act の bot が出丸の土橋で二百秒あまりで撃ち倒され続けた。
    //   この戦の矢弾だけ半分にする（刃の傷は今のまま。堀の縁・三の丸の口の鉄砲でも倒れた）
    { const P = rt.player; if (P && !P._t09Missile) { P._t09Missile = true; const td = P.takeDamage;
      P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const r = td.call(this, a, s); return m && r > 0 ? r * (0.5) : r; };
      // 11/11 クラウドか：大手の段（馬出しの前）は後ろが障子堀で下がれず、act bot が堀の縁（10,86）で十m より遠い矢弾に十二秒で命を五割削られ倒れた（305秒）。
      //   門が開くまでの大手の段だけ、十m より遠い矢弾をさらに半分（近くの射手と刃はそのまま）
      const td2 = P.takeDamage; P.takeDamage = function (a, s) { const F = rt.flags, m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
        const far = s?.pos && Math.hypot(s.pos.x - this.u.pos.x, s.pos.z - this.u.pos.z) > 10; const r = td2.call(this, a, s);
        return m && far && F.step === 3 && !F.gateOpen && r > 0 ? r * 0.5 : r; }; } }
    const D = KURUWA.dai, HN = KURUWA.hon, NS = KURUWA.nishi;
    // ---- 岱崎出丸の柵（南と東へ向く。柵の内から間宮の鉄砲が撃つ。煙と弾は下の城攻めの部品が出す） ----
    F.daiWall = wallLine(rt, [[D.x - 16, D.z + 14], [D.x + 4, D.z + 18], [D.x + 18, D.z + 6], [D.x + 18, D.z - 10]], { team: 1, hp: 300, name: '出丸の柵', segLen: 8 });
    // 柵はその場に固定し、兵の受け流し・押し返しへ入れない（柵には兵の pos が無い）。
    // 損傷と破壊は通常の構造物の処理で行う。
    for (const s of F.daiWall) { s.noClimb = true; s.bodyPadding = 0.3; s.pinT = Infinity; }
    // ---- 三の丸の大手（角馬出し・枡形・横矢・畝堀・狭間からの鉄砲）。出丸の柵からも撃つ（近づくほど弾が降る。kaito BA 5） ----
    F.K = buildSiege(rt, SP, { team: 1, earth: true, wall: 'saku', umadashiWall: 'saku', wallHp: 520, gateHp: 460, masuHp: 600,
      fire: { hurt: () => (rt.flags.step === 1 ? 0.004 : 0.03), near: 90, close: 18, base: 0.8, peak: 4, rain: 0.3 },   // 寄せ手も撃たれて倒れるが、柵に着く前に一隊が消えない強さ
      extraWalls: [{ structs: F.daiWall, inside: { x: D.x - 2, z: D.z } }] });
    shojiRibs(rt);
    // ---- 城の建物（北条の土の城：板の櫓と柵だけ。天守閣は無く、本丸の北西の高まりに天守櫓） ----
    itaYagura(rt, HN.x - 9, HN.z - 9, { w: 6.4, d: 5.4, floors: 2, rot: 0.2 });   // 天守櫓
    // 本丸の土塁の内に柵を巡らせ、南の虎口だけ開ける。進む土橋を塞がない。
    F.honWall = wallLine(rt, [[20, -87], [9, -94], [7, -113], [20, -123], [39, -118], [43, -103], [35, -89], [28, -87]], { team: 1, hp: 400, name: '本丸の柵', segLen: 6 });
    // 二の丸の虎口は開け、左右の柵の内から登り道へ横矢を掛ける。
    F.niWall = wallLine(rt, [[-1, -30], [8, -25]], { team: 1, hp: 300, name: '二の丸の柵', segLen: 5 });
    F.niWall.push(...wallLine(rt, [[24, -25], [33, -30]], { team: 1, hp: 300, name: '二の丸の柵', segLen: 5 }));
    for (const s of [...F.niWall, ...F.honWall]) { s.noClimb = true; s.bodyPadding = 0.3; }
    rt.scene.add(kabukimon(W, 24, -87, 8));
    itaYagura(rt, 32, -90, { w: 4, d: 3.5, floors: 1 });
    itaYagura(rt, NS.x - 6, NS.z + 4, { w: 5, d: 4.2, floors: 1, rot: -0.3 });        // 西櫓
    itaYagura(rt, KURUWA.ni.x - 12, KURUWA.ni.z - 6, { w: 5, d: 4.2, floors: 1 });     // 元西櫓
    rt.scene.add(yagura(W, -48, 204, { kind: 'ro', rot: Math.PI }));                 // 出丸の先の物見
    // 西の柵も通り抜けず、横木は途中の杭へ継いで斜面に沿わせる。
    for (const [ax, az, bx, bz] of [[-61, 206, -62, 184], [-62, 184, -61, 162], [-61, 162, -57, 142]]) rt.scene.add(palisade(W, [ax, az, bx, bz], { lightFence: true, terrainRails: true, solid: true }));
    // 右上の地図に出す城の印（出丸・三の丸の大手・本丸。kaito AQ 7）
    addSite(rt, 'fort', D.x, D.z, '岱崎出丸'); addSite(rt, 'castle', SP.x, SP.z, '三の丸'); addSite(rt, 'castle', HN.x, HN.z, '本丸');
    // ---- 旗と陣（北条と豊臣の旗だけ） ----
    for (const [x, z] of [[D.x - 6, D.z - 8], [D.x + 10, D.z - 4]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
    for (const [x, z] of [[SP.x - 20, SP.z - 8], [SP.x + 20, SP.z - 8], [KURUWA.ni.x - 10, KURUWA.ni.z], [HN.x - 8, HN.z + 6], [HN.x + 10, HN.z - 6]]) rt.scene.add(nobori(W, x, z, 'hojo', 6));
    rt.scene.add(jinmaku(W, HN.x, HN.z - 10, 14, 9, 5.5, { mon: 'hojo' }));
    rt.scene.add(tawara(W, HN.x - 9, HN.z - 4, 0.3, 3));
    for (const [x, z] of [[SP.x - 4, SP.z - 6], [SP.x + 5, SP.z - 10]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: 0.6 }); }
    // ---- 豊臣方の先手：街道の坂の下に、隊ごとの塊で並ぶ（一柳・中村は街道の西、堀秀政は東の尾根）。本物の兵 ----
    F.ichi = allyGroup(rt, { name: '一柳直末の隊', fullStrength: true, anchor: { x: 2, z: 204 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '一柳直末', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24, horo: 0xb8962a, mon: 'kuginuki' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 8 }], ICHI));   // 一柳は秀吉の黄母衣衆
    F.naka = allyGroup(rt, { name: '中村一氏の隊', fullStrength: true, anchor: { x: 30, z: 202 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '中村一氏', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '渡辺勘兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], TOYO));
    F.hori = allyGroup(rt, { name: '堀秀政の隊', fullStrength: true, anchor: { x: 66, z: 188 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], HORI));   // 姿は units_data の堀秀政
    F.toyo = [F.ichi, F.naka, F.hori];
    for (const g of F.toyo) { g.defMult = 1.2; g.dmgMult = 0.85; }
    // 山内一豊の隊（秀次の先手の一つ。史実：中村・一柳と並んで攻め上った）。一柳の隊の後ろに続く二陣
    F.yama = allyGroup(rt, { name: '山内一豊の隊', fullStrength: true, anchor: { x: -4, z: 220 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, hat: 'kabuto_w', haori: 0x33302a, mon: 'kashiwa' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }], YAMA));
    F.toyo.push(F.yama);
    F.yama.defMult = 1.2; F.yama.dmgMult = 0.85;
    for (const g of F.toyo) g.historicalOrders = true;   // 案内の使番に控えの隊や渡堀中の列を転用させない。
    // 大将の豊臣秀次は街道の後ろの本陣の陣幕の中で床几に座り、旗本に囲まれて動かない（前に出ない。kaito AR 3・標準 一の2）
    // 後列まで動ける範囲に収め、南端から押し戻される跳びを防ぐ。
    F.hide = allyGroup(rt, { name: '秀次の旗本', fullStrength: true, anchor: { x: SEAT.x, z: SEAT.z - 18 }, facing: Math.PI, width: 9, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', formation: 'line' },
      dress([{ type: 'samurai', n: 12 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], TOYO));
    F.hideS = allyGroup(rt, { name: '秀次の本陣', fullStrength: true, anchor: SEAT, facing: Math.PI, width: 2, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([{ type: 'busho', n: 1, o: { name: '豊臣秀次', invuln: true, hat: 'kabuto_w', horse: false } }], TOYO));
    for (const u of F.hideS.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z - 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };
    }
    rt.scene.add(jinmaku(W, SEAT.x, SEAT.z, 16, 10, 3, { mon: 'toyotomi' }));
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, Math.PI, { gunbai: true }));
    // 白地の幟が六尺の竿の上で木と同じ高さの白い板に見えた（critic60 山中 41）。人の背の倍ほどの丈へ
    // 通し確認：開始地点の左脇の一本は白い板に見えた。本陣の二本を残し、近すぎる重複を置かない。
    for (const [x, z] of [[34, 226], [54, 226]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 4));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z - 8 }, Math.PI, [{ kind: 'spear', n }]);
    // 秀次の後ろに続く七万の本隊は、街道の坂のずっと下（動ける所の外・近づけない遠さ）にだけ置く
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, farFill: true, armor: 0x2b2723, team: 0, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', seed });
    // 外の尾根にも後続を残す。近くでは本物の兵だけを描く共通の距離制限を保つ。
    F.host = [DA(16, 340, 100, 50, 700, Math.PI, 15901), DA(-60, 320, 65, 40, 500, Math.PI * 0.9, 15902),
      DA(310, 150, 45, 90, 600, Math.PI, 15903), DA(-310, 80, 45, 100, 600, Math.PI, 15904),
      DA(310, -80, 45, 100, 600, Math.PI, 15905)];
    for (const g of F.host) if (g && g.army) g.army.noWake = true;
    // 段が進むごとに、遠くの本隊も街道の坂を城へ詰める（標準 十二の2。動ける所の外のまま）
    // 南の二陣は前端が動ける範囲へ入る前に止める。横の尾根は東西とも範囲外。
    const hostRoom = [340 - 50 - 246, 320 - 40 - 246, Infinity, Infinity, Infinity];
    F.hostUp = (d, secs) => {
      for (let i = 0; i < F.host.length; i++) {
        const g = F.host[i], step = Math.min(d, hostRoom[i]);
        if (g && g.advance && step > 0) { g.advance(step, secs); hostRoom[i] -= step; }
      }
    };
    // ---- 岱崎出丸の間宮康俊の隊（数百。柵の内に鉄砲、後ろに槍と騎馬） ----
    F.dai = enemyGroup(rt, { faction: 'hojo', name: '間宮康俊の隊', anchor: { x: D.x + 6, z: D.z }, facing: 0.8, order: 'hold', aggro: 20, width: 12, morale: 95, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.3 },
      dress([{ type: 'busho', n: 1, o: { name: '間宮康俊', hat: 'kabuto_m', haori: 0x4a3a28 } }, { type: 'gun', n: 16 }, { type: 'ashigaru', n: 28 + more(rt, 0.3) }, { type: 'samurai', n: 5 }, { type: 'cavalry', n: 3 }], HOJO));   // 騎馬は三騎（八騎の当たりで出丸の前で倒れ続けた。11/8 bot）
    for (const u of F.dai.units) if (u.type === 'gun') u.dmg *= 0.12;   // 15分の構成：出丸の鉄砲で倒れ続けた（11/8 bot）
    // 寄せ手の竹束（critic60 山中 7「竹束は一つも無い」）：出丸の鉄砲に向けて、街道の坂の上り口に横へ並べる。玉と矢を本当に止める
    {
      const vx = START.x - D.x, vz = START.z - D.z, L = Math.hypot(vx, vz) || 1, ux = vx / L, uz = vz / L;
      const rot = Math.atan2(-ux, -uz);
      for (let k = -3; k <= 3; k++) {
        const x = D.x + ux * 30 - uz * k * 3.2, z = D.z + uz * 30 + ux * k * 3.2;
        if (rt.world.walkable && !rt.world.walkable(x, z, rt.world.heightAt(x, z))) continue;
        addTaba(rt, x, z, 0, { rot, fixed: true });
      }
    }
    F.daiN = F.dai.units.length;
    F.dai.noRout = true;   // 間宮が生きている間は踏みとどまり、討死の後は手勢が動揺する。
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：岱崎出丸 → 障子堀 → 三の丸の虎口 → 二の丸 → 本丸。
    //   段の守りは段に入ってから出て来るので、組は getter で渡す。今の段の守りだけが打って出て、奥は持ち場で構えて待つ
    const alive = (...gs) => gs.filter((g) => g && g.count > 0 && !g.routed);
    F.stages = siegeStages(rt, [
      { get groups() { return alive(F.dai); }, done: () => F.step >= 2, report: '岱崎出丸の守り、まだ崩れませぬ！', reportAfter: 200 },
      { get groups() { return alive(F.pit, F.rim); }, done: () => F.step >= 3, report: '障子堀の畝で、味方が足を取られております！', reportAfter: 70 },
      { get groups() { return alive(F.uma, F.san); }, done: () => F.step >= 4, report: '三の丸の虎口、まだ破れず！', reportAfter: 70 },
      { get groups() { return alive(F.ni); }, done: () => !alive(F.ni).length || F.ni.count < (F.ni._stN || 1) * 0.4, report: '二の丸の守り、しぶとく粘っております！', reportAfter: 70 },
      { get groups() { return alive(F.hon, F.kogo); }, done: () => false },
    ], { runner: '使番' });

    W.setTime('day');
    rt.setPhase('brief');
    // 戦の前の会話（待つ目標は出さない。始めから出丸へ寄る。kaito AZ・BA 3）
    rt.say('豊臣秀次', '今日のうちに山中を揉み落とす。先手は岱崎出丸へ掛かれ', 4.5);
    rt.after(4.8, () => rt.say('一柳直末', '北条の鉄砲は多いぞ。出丸の前で足を止めるな', 4));
    rt.after(9.2, () => rt.say('堀秀政', '我らは東の尾根から三の丸の横へ回る。挟んで落とすぞ', 3.5));
    // 出陣（段0）：諸将の旗と山中城を見上げ、先手の列へ。少しして出丸攻め（t09_yamanaka/shutsujin.js）
    tahoumen.install(rt);
    shoshou.install(rt);
    shutsujin.install(rt, {});
  },

  // ① 岱崎出丸の東の柵を破り、間宮康俊の隊を討つ
  dai(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('dai');
    sfx('horagai', 0.8);
    rt.obj('main', '出丸を破り、間宮康俊を討つ', 'main');
    const D = KURUWA.dai;
    rt.marker('dai', centerOf(F.dai), '間宮康俊', { red: true, group: F.dai });
    // 先手は柵の前へ寄り、柵を打ち破って出丸へ斬り込む（柵の向こうの敵を追って立ち往生しない）
    const inside = { x: D.x, z: D.z };
    // 破れ口の少し内側まで進んでから城内へ向かう。残った柵を全部壊すまで足止めしない。
    const mouths = F.daiWall.map((s) => {
      const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      const dx = D.x - x, dz = D.z - z, d = Math.hypot(dx, dz) || 1;
      return { s, x: x + dx / d * 3, z: z + dz / d * 3, dx, dz };
    });
    // 土橋に面した一枚を攻める。南の角の破れ口へ斜めに寄ると畝堀へ落ちる。
    const bridgeMouth = mouths.reduce((a, b) =>
      Math.hypot(b.x + 28, b.z - 176) < Math.hypot(a.x + 28, a.z - 176) ? b : a);
    F.daiBridge = bridgeMouth.s;
    const bridgeWest = { x: -32, z: 176 }, bridgeEast = { x: -6, z: 176 };
    // 打って出る守兵も堀を斜めに横切らず、開いた土橋を通って寄せ手へ向かう。
    F.dai.assault = (u) => {
      const enemy = rt.army.nearestEnemy(u, 60, (v) => !v.isStruct && !v.fleeing &&
        !crossesDaiMoat(u.pos, v.pos) && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
      if (enemy) return enemy.pos;
      if (bridgeMouth.s.alive !== false && bridgeMouth.s.hp > 0) return inside;
      if (u.pos.x < -30 && Math.abs(u.pos.z - 176) > 3) return bridgeWest;
      return daiApproach(u) || bridgeEast;
    };
    F.dai.historicalOrders = true;
    const fence = (u) => {
      // 柵を目指して斜めに進むと、東の畝堀へ落ちる。先手も本人と同じ土橋へ揃える。
      // 東岸では先に街道を北上し、堀の中では近い岸へ戻ってから渡る。
      const approach = daiApproach(u);
      if (approach) return approach;
      if (u.pos.x > -30) return bridgeMouth.s.alive !== false && bridgeMouth.s.hp > 0 ? bridgeMouth.s : bridgeMouth;
      // 渡り終えた兵は出丸の中心で止まらず、見通せる残兵へ寄って本人を支える。
      const enemy = rt.army.nearestEnemy(u, 30, (v) => !v.isStruct && !v.fleeing &&
        !crossesDaiMoat(u.pos, v.pos) && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
      if (enemy) return enemy.pos;
      return inside;
    };
    // 先手は土橋と柵を優先し、目の前の敵だけ払う。離れた守兵への応戦で柵攻めを止めない。
    fence.gateOnly = true;
    // 全員の整列を待つと、柵に阻まれた後列が着けず攻撃へ移れない。先頭から柵を攻める。
    const go = (g) => { g.formation = 'column'; g.colW = 3; g.order = 'assault'; g.assault = fence; g.anchor = { x: -6, z: 176 }; g.speed = 3; g.onArrive = null; };
    go(F.ichi); go(F.naka);  // 持ち場も堀の中へ置かず、東岸の土橋の口へ。
    // 柵が破れても二陣を温存する。山内・堀の手は出丸制圧後に障子堀へ続く。
    const reserve = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 3; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x, z }; }; };
    reserve(F.yama, 12, 194);
    // 堀の手を、到着後に出丸の柵へ引き返させない。
    reserve(F.hori, SHOJI.x1 + 22, SHOJI.z1 + 18);
  },

  // ② 障子堀の畝の上を渡る
  shoji(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('shoji'); rt.unmark('dai');
    tahoumen.step(rt, 2);
    // 生きた組頭がいても、制圧した出丸に踏みとどまらせない。
    if (!gone(F.dai)) { F.dai.noRout = false; F.dai.order = 'retreat'; F.dai.morale = 0; }
    // 11/13 クラウドE：戦の途中から続ける時（battle_checkpoint）は出丸の段を流すだけで土橋の柵が破れず、
    //   出丸の内にいる本人が土橋へ出られず（-30,176）で往復し続けた。この段は柵が破れた後なので、ここで必ず開ける。
    { const s = F.daiBridge; if (s && s.alive !== false && s.hp > 0) rt.army.damage(s, s.hp + 1, null); }
    rt.award((t) => t.side.push('岱崎出丸を抜いた'), '岱崎出丸を抜いた');
    rt.obj('main', '障子堀を畝の上で渡る', 'main');
    F.hostUp(18, 30);
    rt.say('中村一氏', '堀へ落ちれば這い上がれぬ。畝から足を外すな', 4);
    // 堀の底に潜む槍（落ちた者を下から突く）と、向こうの縁の鉄砲
    const mz = (SHOJI.z0 + SHOJI.z1) / 2;
    F.pit = enemyGroup(rt, { faction: 'hojo', name: '堀の底の槍', anchor: { x: CROSS_X + 9, z: mz + 4 }, facing: 0, order: 'hold', aggro: 7, width: 10, morale: 80, ambush: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.35 },
      dress([{ type: 'ashigaru', n: 8 + more(rt, 0.3) }], HOJO));
    // 対岸を守る下知を共通の打って出る処理で変えず、鉄砲と柵の射撃を残す。
    F.rim = enemyGroup(rt, { faction: 'hojo', name: '堀の縁の鉄砲', fixed: true, historicalOrders: true, anchor: { x: CROSS_X + 4, z: SHOJI.z0 - 6 }, facing: 0, order: 'hold', aggro: 10, width: 16, morale: 85, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 8 }], HOJO));
    for (const u of F.rim.units) if (u.type === 'gun') u.dmg *= 0.45;
    F.cross = { x: CROSS_X, z: SHOJI.z0 - 5 };
    rt.marker('cross', F.cross, '障子堀', { h: 2 });
    // 対岸の柵の内から、畝へ詰めた寄せ手を鉄砲と矢で狙う。兵は増やさない。
    F.rimWall = wallLine(rt, [[-4, SHOJI.z0 - 3], [7, SHOJI.z0 - 3], [13, SHOJI.z0 - 3], [28, SHOJI.z0 - 3]], { team: 1, hp: 180, name: '障子堀の柵', gaps: [2], segLen: 6 });
    for (const s of F.rimWall) { s.noClimb = true; s.bodyPadding = 0.3; }
    F.rimFire = makeSamaFire(rt, [{ structs: F.rimWall, inside: { x: 10, z: SHOJI.z0 - 12 } }], { heads: false, near: 70, close: 15, base: 1.2, peak: 5, arrows: 0.45, hurt: 0.25, rain: 0.6 });
    // 一箇所開けば破れ口から渡る。残る柵を順に全部壊させると後続が対岸へ来ない。
    // 柵には初めから畝の正面（7〜13m）に口がある。壊れた区画だけを探すと、
    // 開いている口を使わず、後続まで生きた柵へ押し付いてしまう。
    const mouthAt = (s, x) => ({ s, x, z: SHOJI.z0 - 5, approach: { x, z: SHOJI.z0 - 1 } });
    const mouths = [mouthAt(null, CROSS_X),
      ...F.rimWall.map((s) => mouthAt(s, (s.seg[0] + s.seg[2]) / 2))];
    const exits = [-SHOJI.cell, 0, SHOJI.cell, SHOJI.cell * 4].map((dx) => ({ x: CROSS_X + dx, z: SHOJI.z0 - 1 }));
    const assault = (u) => {
      // 隊の先頭が着いても後列は畝の途中にいる。一人ずつ岸へ出るまでは横へ曲げない。
      if (u.pos.z >= SHOJI.z0) {
        let exit = exits[0];
        for (const e of exits) if (Math.abs(e.x - u.pos.x) < Math.abs(exit.x - u.pos.x)) exit = e;
        return exit;
      }
      let wall = null, wd = Infinity, mouth = null, md = Infinity;
      for (const m of mouths) {
        const d = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
        if (!m.s || m.s.alive === false || m.s.hp <= 0) { if (d < md) { mouth = m; md = d; } }
        else if (d < wd) { wall = m.s; wd = d; }
      }
      if (!mouth) return wall || F.cross;
      // 脇の畝から口の奥へ斜めに進むと隣の杭に当たる。手前で口の正面へ揃える。
      if (u.pos.z > SHOJI.z0 - 3 && Math.abs(u.pos.x - mouth.x) > 1.5) return mouth.approach;
      return u.pos.z > mouth.z ? mouth : F.cross;
    };
    const path = (g, dx) => {
      if (gone(g)) return;
      g.formation = 'column'; g.colW = 1; g.march = false; g.order = 'path';
      // 出丸で空いた持ち場を詰めてから一列にする。元の番号のままでは後列が
      // 戦場の南端を越え、道へ戻す処理で始点の一点に集まってしまう。
      let slot = 0;
      for (const u of g.units) if (u.alive && !u.gone) { u.slot = slot++; u.aiT = 0; }
      g._slotFit = null; g._mix = null; g._tailCheckAt = 0;
      // 出丸から北東へ直進すると、脇の畝堀へ斜めに落ちる。西の先手だけ土橋へ戻して渡す。
      // 東の二陣は戻さず、それぞれの畝へ続く。
      const c = g.center();
      // 攻め口の基準点は土橋の東岸に残る。制圧した隊の現在地へ合わせないと、
      // 東岸→出丸→東岸と土橋を往復し、後続が障子堀へ続けなくなる。
      g.anchor = { x: c.x, z: c.z };
      g.path = c.x < -11 ? [[Math.min(c.x, -32), 176], [-6, 176]] : [];
      // 対岸の柵（z0−3）の手前まで畝を渡り切る。堀の中で横へ揃え直すと畝から落ちる。
      g.path.push([CROSS_X + dx, SHOJI.z1 + 10], [CROSS_X + dx, SHOJI.z0 - 1]);
      // 本人が先に渡ると、次の下知は未通過の道へ継ぎ足される。
      // 岸で口の正面へ揃えて抜ける所まで残し、脇の畝から柵を斜めに横切らせない。
      if (dx) g.path.push([CROSS_X, SHOJI.z0 - 1]);
      g.path.push([CROSS_X, SHOJI.z0 - 5]);
      // 初めの折れから後列を道に沿わせる。隊の向きだけを回して畝の脇へ押し出さない。
      g.path.unshift([g.anchor.x, g.anchor.z]);
      g.pathIdx = 1; g.roadColumn = true; g.followColumnRoad = true; g.speed = 3;
      g.onArrive = (q) => { q.order = 'assault'; q.assault = assault; q.seekRange = 30; };
    };
    path(F.ichi, -SHOJI.cell); path(F.naka, SHOJI.cell); if (!gone(F.yama)) path(F.yama, 0);
    if (!gone(F.hori)) path(F.hori, SHOJI.cell * 4);
  },

  // ③ 三の丸の大手：馬出しへ寄せる → 打って出た北条の隊を迎え撃つ → 退く兵に続いて大手門から入る（付け入り。docs/kaito_refs_1103 の ref04〜07）
  ote(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.sub = 'yose';
    // 堀を渡り切った所で一息（11/9 bot：堀の縁の鉄砲で削られたまま馬出しの突き出しに当たり、三度倒れた）
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    rt.setPhase('koguchi'); rt.unmark('cross');
    tahoumen.step(rt, 3);
    // 士気だけでは頭の生きた槍組が戦い続けるので、退く下知も出す。鉄砲組は下で城内への退路に替える。
    for (const g of [F.pit, F.rim]) if (!gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
    // 11/10 クラウド：堀の縁の鉄砲は持ち場に固く据えた（fixed）ため士気が尽きても退かず、渡り終えた本人を五m 先から狙い続けた。
    //   bot は狙いを避け続けて堀の手前（20,88）で九分止まった。渡り切ったら馬出しの裏から三の丸へ退かせ、城の内で消す
    if (!gone(F.rim)) {
      const g = F.rim, A = SP.at, M = A.mouths[1], c = g.center();
      // 頭が討たれた隊も、共通の敗走で退去経路を北向きに上書きさせない。
      g.noRout = true; g.morale = 100;
      g.fixed = false; g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true; g.order = 'path'; g.speed = 2.8;
      // 馬出しの正面は柵と堀で閉じている。中心へ直進させず、寄せ手と同じ横の口・土橋を通す。
      // 横陣のままでは後列が口の脇へ広がるので、退く兵も通過した道に沿う二列にする。
      g.formation = 'column'; g.colW = 2; g.march = false; g.roadColumn = true; g.followColumnRoad = true;
      g.anchor = { x: c.x, z: c.z };
      g.path = [[c.x, c.z], ...[M.far, M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.gate, A.plaza].map((p) => [p.x, p.z])]; g.pathIdx = 1;
      for (const u of g.units) if (u.type === 'gun') u.dmg = 0;
      g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
    }
    rt.award((t) => t.side.push('障子堀を渡った'), '障子堀を渡った');
    rt.obj('main', '馬出しから出た北条の隊を迎え撃つ', 'main');
    F.hostUp(18, 30);
    // 北条氏勝の手（玉縄の援兵）は、間宮の勧めで出丸の戦の前に城を落ちている（間宮が「氏勝殿も直元も落とした」と言う）。
    //   障子堀の後に退く隊として出すと、退いた人の名札が本丸の前に残り、話の順も逆になった（critic60 山中 10）。ここでは出さない
    const A = SP.at, M = A.mouths;
    // 馬出しに詰める北条の隊（騎馬と槍）。寄せ手が来ると脇の口から打って出て、一柳の隊の横を突く
    F.uma = enemyGroup(rt, { faction: 'hojo', name: '馬出しの北条の隊', fixed: true, formation: 'yari', anchor: { ...A.uma }, facing: 0, width: 6, aggro: 4, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.4 },
      dress([{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 5 }, { type: 'ashigaru', n: 16 }], HOJO));
    F.uma.historicalOrders = true;
    // 11/10 クラウドか：act bot は迎え撃ちで命を三割台まで削られ、退く兵に続く段（馬出し〜大手の口）で二回とも倒れた（352・430秒）。
    //   馬出しの隊と三の丸の守りの当たりを七割に、退く段に入る時に一息（命を六割まで）
    for (const u of F.uma.units) u.dmg *= 0.7;
    // 枡形の内庭は幅九m。十二列の守兵を置くと塀に持ち場が重なり、門内で詰まる。
    // 折れた櫓門を抜けた先の三の丸に横陣を置き、城内で迎え撃つ。
    F.san = enemyGroup(rt, { faction: 'hojo', name: '三の丸の守り', fixed: true, historicalOrders: true, anchor: { x: SP.x + 9, z: SP.z - 22 }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.42 },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], HOJO));
    F.san.dmgMult = 0.3;   // 11/10 クラウドか：塀の内から口の筋の本人を二十余m で削り、act bot が馬出しの口で倒れた（410秒）
    // 11/10 クラウドか：全戦共通の全力（all_out.js）が持ち場の三の丸の守りを「見える敵へ」寄せ、門の外の馬出しの先（13,81）まで出て
    //   act bot を囲んで倒した（三回）。城の内の守りとして共通の寄せから外す（門が開けば広場で迎え撃つ）
    F.san.garrison = true;
    for (const u of F.san.units) u.dmg *= u.type === 'gun' ? 0.25 : 0.7; // 11/10 クラウドち：bot が大手の口で背の鉄砲に削られ倒れた（471〜481秒）
    F.sortie = F.K.sortie(F.uma, { fight: 18, mouth: 1, R: 12,
      strike: () => { const g = gone(F.ichi) ? F.naka : F.ichi, c = g.center(); return { x: c.x, z: c.z }; },
      when: (r) => { const u = r.player.u; return r.flags.step === 3 && r.t - r.flags.stepT > 10 && u.alive && Math.hypot(u.pos.x - A.uma.x, u.pos.z - A.uma.z) < 46; },
      onOut: (r) => this.sally(r), onBack: (r) => this.sallyBack(r), onTsukeiri: (r) => this.openGate(r, true) });
    rt.marker('ote', { x: M[1].far.x, z: M[1].far.z }, '馬出し', { h: 3 });
    // 寄せ手は馬出しの左右の口の前へ（大手を攻める）
    const go = (g, P) => {
      if (gone(g)) return;
      // 本人が先に渡っても、後続の畝と対岸の口を飛ばさない。渡る間は一列を保つ。
      const crossing = g.order === 'path' && g.path?.slice(g.pathIdx || 0).some((p) => p[1] >= SHOJI.z0 - 1);
      g.formation = 'column'; g.colW = crossing ? 1 : 2;
      if (crossing) continuePath(g, [[P.x, P.z]]);
      else { g.order = 'move'; g.dest = { x: P.x, z: P.z }; }
      g.speed = 3;
      g.onArrive = (q) => { q.colW = 2; q.order = 'attack'; q.seekRange = 24; q.anchor = { x: P.x, z: P.z }; };
    };
    go(F.ichi, M[1].far); go(F.naka, M[0].far);
    // 渡った山内の隊を堀側へ戻さない。南へ八mずらすと、開口から集合点への道が
    // 対岸の柵を斜めに横切り、後続まで（16,87）付近で重なって止まる。
    go(F.yama, { x: M[1].far.x + 4, z: M[1].far.z });
    go(F.hori, { x: SP.x + 34, z: SP.z + 26 });
    rt.after(8, () => { if (F.step === 3) rt.say('渡辺勘兵衛', '一番乗りは、この勘兵衛がもらう！', 3.5); });
  },
  sally(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.sub !== 'yose') return;
    F.sub = 'sally';
    rt.unmark('ote');
    rt.marker('uma', centerOf(F.uma), '馬出しの北条の隊', { red: true, group: F.uma });
    rt.say(F.ichiShot || F.ichiLost ? '一柳直盛' : '一柳直末', '横から来たぞ！　槍を揃えて受け止めよ！', 3.5);
    // 馬出しへ寄る下知を打ち切る。到着処理が残ると、迎撃中も行軍用の持ち場補正が働く。
    for (const g of F.toyo) if (!gone(g)) {
      // まだ畝を渡る隊には、堀の中から敵へ斜めに走る下知を出さない。
      if (g.order === 'path' && g.path?.slice(g.pathIdx || 0).some((p) => p[1] >= SHOJI.z0 - 1)) continue;
      g.onArrive = null; g.order = 'attack'; g.seekRange = 34;
    }
  },
  sallyBack(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.gateOpen || F.sub === 'back') return;
    F.sub = 'back'; F.backT = rt.t; F.gatePress = 0;
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    rt.unmark('uma');
    rt.obj('main', '退く兵に続いて大手門から入る', 'main');
    rt.marker('gate', { ...SP.at.gate }, '大手門', { red: true, h: 3 });
    rt.say('中村一氏', gone(F.uma) ? '馬出しの敵は崩れた！　大手門へ掛かれ！' : '退くぞ！　門を閉めさせるな。続いて入れ！', 3.5);
    // 寄せ手は退く兵の後ろについて、馬出しの口から土橋・門へ
    const A = SP.at, M = A.mouths[1];
    const pts = [M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut].map((p) => [p.x, p.z]);
    F.oteRoute = [...pts, [A.gate.x, A.gate.z], [A.plaza.x, A.plaza.z]]; F.oteSign = 0;
    for (const g of F.toyo) if (!gone(g)) { continuePath(g, pts); g.speed = 2.8; g.onArrive = (q) => { q.colW = 2; q.order = 'assault'; q.assault = () => { const s = F.K.gate && F.K.gate.struct; return s && s.alive && !s.opened ? s : A.plaza; }; }; }
    // 11/10 クラウド：馬出しへ戻った槍組が持ち場に固く据わったまま柵越しに突き続け、bot は構えたまま馬出しの北（16,85）で九分動けなかった。
    //   二十秒で馬出しの残りも土橋から門の内へ退き、三の丸で消える（「退く兵に続いて」入る形）
    rt.after(20, () => {
      const g = F.uma;
      // 付け入りで本人が先に三の丸へ入っても、後続の前に残兵を留めない。
      if (F.ending || F.step < 3 || !g || gone(g)) return;
      g.noRout = true; g.morale = 100;
      // 応戦で退路を止めず、寄せ手が退く兵に続いて門へ進めるようにする。
      g.fixed = false; g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true; g.order = 'path'; g.speed = 2.6;
      // 後列も馬出し・土橋・門の折れを通す。横陣のままでは柵へ直進して残る。
      const c = g.center();
      const returning = F.sortie?.route;
      const returnIndex = F.sortie?.ri || 0;
      const anchor = { x: g.anchor.x, z: g.anchor.z };
      g.anchor = returning ? anchor : { x: c.x, z: c.z };
      g.formation = 'column'; g.colW = 2; g.march = false; g.roadColumn = true; g.followColumnRoad = true;
      // 共通の退路を途中で捨てると、口の外の残兵が馬出しの柵へ直進する。
      // 通過済みの折れも残して後列を同じ口へ通し、進んだ先頭は引き返させない。
      if (returning?.length) {
        g.path = [returning[0].slice(), ...returning.map((p) => p.slice())];
        g.pathIdx = returnIndex + 1;
      } else {
        // 付け入りで共通の退路が消えた時も、門の外では横の口を省かない。
        const onBridge = Math.abs(c.x - A.uma.x) < SP.bridgeW / 2;
        const route = onBridge && c.z <= A.gateOut.z ? [A.gate, A.plaza] :
          onBridge && c.z <= A.uma.z ? [A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.gate, A.plaza] :
          [M.far, M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.gate, A.plaza];
        g.path = [[c.x, c.z], ...route.map((p) => [p.x, p.z])]; g.pathIdx = 1;
      }
      g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
    });
  },
  openGate(rt, tsuke) {
    const F = rt.flags;
    // 共通の付け入りは守兵を攻撃へ戻す。既に開門済みでも退去の下知を続ける。
    if (F.uma?.retreatOnly && F.uma.path?.length) F.uma.order = 'path';
    if (F.gateOpen) return;
    // 門を直接破った時も、迎撃の下知を終えて土橋から入る。
    if (F.sub !== 'back') this.sallyBack(rt);
    F.gateOpen = true; F.gateOpenT = rt.t;
    // 門が開いた所で一息（11/13 クラウドE：門の前で削られたまま枡形へ入り、倒れた）
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    // 付け入り以外の開門を、戻った馬出しの隊に閉じ直させない。
    F.K.stayOpen = true;
    for (const G of [F.K.gate, F.K.masu && F.K.masu.inner]) if (G && G.struct && G.struct.alive !== false) { G.struct.opened = true; G.open && G.open(); }
    for (const id of ['gate', 'ote', 'uma']) rt.unmark(id);
    sfx('kane', 0.4);
    if (tsuke) rt.award((t) => t.side.push('退く敵に続いて大手門へ付け入った'), '大手門へ付け入った');
    rt.after(4, () => rt.say('堀秀政', '東の柵を越えた！　三の丸を挟め！', 3.5));
    F.hostUp(18, 30);
    // 開門だけでは「門から入る」を果たさない。寄せ手も枡形の中へ続く。
    for (const g of F.toyo) if (!gone(g)) {
      if (g.order !== 'path') {
        const A = SP.at, M = A.mouths[1];
        continuePath(g, [M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut].map((p) => [p.x, p.z]));
      }
      continuePath(g, [[SP.at.plaza.x, SP.at.plaza.z]]);
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
    }
  },

  // ④ 二の丸を抜け、本丸の松田康長の旗本を崩す
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    // 三の丸へ入った所で一息（ほかの段の替わり目と同じ。11/13 act bot：大手門で削られたまま本丸の段で倒れた）
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    tahoumen.step(rt, 4);
    rt.award((t) => t.side.push('三の丸の大手を破った'), '三の丸の大手を破った');
    rt.obj('main', '本丸の松田康長の旗本を討つ', 'main');
    const H = KURUWA.hon, N = KURUWA.ni;
    // 二の丸の守り（攻め上る途中で戦う）と、本丸の松田康長の旗本（城将は奥で守られ、前に出ない）
    F.ni = enemyGroup(rt, { faction: 'hojo', name: '二の丸の守り', anchor: { x: N.x, z: N.z + 8 }, facing: 0, order: 'hold', aggro: 14, width: 12, morale: 90, noRout: true, historicalOrders: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HOJO));
    // 11/11 クラウドか：全戦共通の全力が二の丸の守りを持ち場（16,-38）から八十m 南の三の丸の広場（19,44）まで寄せ、act bot を囲んで倒した（435秒）。
    //   三の丸の守りと同じく城の内の守りとして共通の寄せから外す（登り道と二の丸の虎口で迎え撃つ）
    F.ni.garrison = true;
    F.hon = enemyGroup(rt, { faction: 'hojo', name: '松田康長の旗本', anchor: { x: H.x, z: H.z + 4 }, facing: 0, order: 'hold', fixed: true, aggro: 6, width: 12, morale: 100, noRout: true, formation: 'yari', fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, defMult: 1.15 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康長', hat: 'kabuto_m', haori: 0x5a2a1c, horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }, { type: 'gun', n: 6 }], HOJO));
    // 松田康郷（康長の弟・「松田の赤鬼」）は本丸の奥にいて、兄の旗本が崩れかけると落ち延びる（史実：脱出して生き延びた）
    // 脱出の下知より先に共通の寄せ直し・敗走で持ち場と退路を変えない。
    // 史実で生還する康郷は討死させず、攻撃の的からも外す。倒せない相手を追わせない。
    F.kogo = enemyGroup(rt, { faction: 'hojo', name: '松田康郷の手', anchor: { x: H.x + 6, z: H.z - 10 }, facing: 0, order: 'hold', fixed: true, historicalOrders: true, noRout: true, aggro: 6, width: 6, morale: 100, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康郷', invuln: true, noTarget: true, hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 4 }], HOJO));
    F.hon.historicalOrders = true;   // 城将の旗本は本丸を離れない（共通の寄せの下知で前へ出さない。kaito AR 3）
    for (const g of [F.ni, F.hon]) for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5;
    // 11/12 クラウドさ：act bot は本丸の土橋の上で旗本の侍に囲まれて倒れた（710秒・侍の傷108）。旗本の刃も七割五分に
    for (const u of F.hon.units) if (u.type !== 'gun' && u.type !== 'busho') u.dmg *= 0.75;   // 城の中の鉄砲も出丸・堀の縁と同じ強さ（枡形で一発で倒れない）
    F.honU = F.hon.units[0];
    F.honN = F.hon.units.length;
    // 建物を置くだけでは登り道へ撃たない。近くに守り手がいる柵だけ射撃する。
    F.okuFire = makeSamaFire(rt, [
      { structs: F.niWall, inside: { x: N.x, z: N.z } },
      { structs: F.honWall, inside: { x: H.x, z: H.z } },
    ], { heads: false, near: 65, close: 18, base: 0.8, peak: 4, arrows: 0.45, hurt: 0.2, rain: 0.3 });
    rt.marker('hon', centerOf(F.hon), '松田康長', { red: true, group: F.hon });
    // 予約した下知を、倒れた城将や再開後の別の本丸へ持ち越さない。
    const hon = F.hon, honU = F.honU, honT = F.stepT;
    rt.after(3, () => {
      if (rt.flags !== F || F.ending || F.step !== 4 || F.stepT !== honT ||
          F.hon !== hon || F.honU !== honU || gone(hon) || !cnt(honU) || honU.gone ||
          !cnt(rt.player.u)) return;
      rt.say('松田康長', 'ここは小田原の西の門ぞ。一足も通すな！', 4);
    });
    // 寄せ手は三の丸の広場から、二の丸の虎口・本丸の土橋を通って攻め上る（戦いながら進む）
    //   本丸の土橋の下（二の丸の北の虎口）で揃い、本人が来たら一緒に本丸へ攻め上る（最後の見せ場を本人の目の前で）
    // 11/12 クラウドさ：開門の後も三の丸の守りが広場（11,44）に据わったまま、本丸へ向かう本人を囲み act bot が倒れた（712秒）。
    //   大手が破れたら、三の丸の守りは二十秒で登り道を二の丸へ退き、虎口の奥で消える（広場に残って背から削らない）
    rt.after(20, () => {
      const g = F.san;
      if (rt.flags !== F || F.ending || F.step !== 4 || !g || gone(g)) return;
      g.noRout = true; g.morale = 100; g.fixed = false; g.garrison = false;
      g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true;
      g.formation = 'column'; g.colW = 2; g.march = false; g.speed = 2.8;
      const c = g.center();
      g.order = 'path'; g.path = [[c.x, c.z], ...UP_ROUTE.slice(3, 6).map((p) => p.slice())]; g.pathIdx = 1;
      g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
    });
    const route = UP_ROUTE.slice(2, 7);
    for (const g of F.toyo) if (!gone(g)) { g.formation = 'column'; g.colW = 2; continuePath(g, route); g.speed = 3; g.march = false; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 14; q.anchor = { x: 21, z: -66 }; }; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['hon', 'gate', 'cross', 'dai', 'ote', 'uma']) rt.unmark(id);
    // 落城までは踏みとどまり、決着後は残兵を退かせる。敗走禁止のままでは締めの間も戦い続ける。
    for (const g of [F.dai, F.pit, F.rim, F.uma, F.san, F.ni, F.hon, ...(F.kogoOut ? [] : [F.kogo])]) if (g && !gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山中城を半日で落とした', pts: 24 }; }, '任務達成・山中城の本丸を崩した');
    sfx('kane', 0.5);
    rt.banner('山中城、落つ', '北条の西の守りは、半日で崩れた');
    // 戦の後の会話
    rt.say('豊臣秀次', F.ichiShot || F.ichiLost ? '一柳伊豆を失うたは痛い。されど山中は落ちた' : '山中は落ちた。先手の者ども、よく攻めた', 4.5);
    rt.after(5, () => rt.say('使番', '松田康長、討ち死に。一番乗りは渡辺勘兵衛！', 3.4));
    rt.after(13.4, () => rt.say(nm(rt), '北条の西の門は、開きました', 4));
    rt.after(9, () => rt.say('豊臣秀次', '箱根を越えるぞ。小田原はもう目の前じゃ', 4));
    rt.player.u.invuln = true;
    // 余韻：曲輪ごとに豊臣の旗・箱根の向こうの小田原（t09_yamanaka/rakujo.js）
    rakujo.play(rt);
    rt.finish({ scriptedEnd: true }, 30);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('先手が崩れた');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 「plain」でも共通の地表の靄は昼まで残る。山中は初めの朝霧だけにし、九十秒で消す。
    if (rt.world?.def) rt.world.def.groundMistScale = Math.max(0, 1 - rt.t / 90);
    if (rt.t >= 90 && rt.world?.mistVeil) rt.world.mistVeil.list.length = 0;
    // 落城後も飛んだ矢と煙は消えるまで進める。狭間の再射撃と門の出来事は止める。
    if (F.ending) {
      quietFire(F.K?.fire, dt);
      quietFire(F.rimFire, dt);
      quietFire(F.okuFire, dt);
      return;
    }
    // 討死・やり直しの札の裏で、味方の討ち取りや経過時間だけで目標を果たさない。
    if (!rt.player.u.alive || rt.retryOpen) return;
    // 固定の鉄砲の場面より先に通常の戦闘で討たれた時も、死者に話させず弟が隊を継ぐ。
    // 生きた直末を待ち続けて間宮の突き入りが止まることも防ぐ。
    if (!F.ichiShot && !F.ichiLost && F.ichi?.units.some((u) => u.type === 'busho' && slain(u))) {
      F.ichiLost = true; F.ichi.name = '一柳直盛の隊';
    }
    if (F.K && F.step) {
      // 実兵が弾込めしていても、柵の狭間は別の時計で撃ち続けていた。
      // 出丸の狭間だけ同じ六秒射撃・十二秒弾込めに揃え、制圧後は止める。
      // tick 自体は続け、既に飛んだ弾・矢と煙は止めない。
      if (F.K.fire && (F.step !== 1 || (rt.t - F.stepT) % 18 >= 6)) {
        for (const c of F.K.fire.src) if (F.daiWall.includes(c.s)) c.cool = F.K.fire.t + dt + 0.1;
      }
      F.K.tick(dt);
    }   // 出陣の段は出丸の鉄砲を撃たせない
    // 渡堀後は守り手が三の丸へ退く。近くの別隊を守兵と数えて背後から撃ち続けない。
    if (F.rimFire) {
      // 射撃を止めても、渡り終える直前に飛んだ矢と煙の時計は進める。
      // tick を呼ばないと、三の丸へ進んだ後も空中に残り続ける。
      if (F.step !== 2) for (const c of F.rimFire.src) c.cool = F.rimFire.t + dt + 0.1;
      F.rimFire.tick(dt);
    }
    if (F.okuFire) {
      // 二の丸の守兵が退いた後は、本丸の兵を近くの守り手と数えて撃ち続けない。
      // 本丸の狭間と、既に飛んだ矢・弾・煙の時計は進める。
      if (F.niGive) for (const c of F.okuFire.src) if (F.niWall.includes(c.s)) c.cool = F.okuFire.t + dt + 0.1;
      // 11/11 クラウドか：松田康長が討たれた後も本丸・二の丸の狭間と鉄砲が登り道を撃ち続け、act bot は（17,-47）で撃たれては退き、
      //   康長を討って二分近く本丸へ入れず刻限（1080秒）に掛かった。城将が討たれたら狭間は黙り、残る鉄砲も撃つのをやめる（刃の兵はそのまま）
      const lordDown = F.honU && !F.honU.alive;
      if (lordDown) for (const c of F.okuFire.src) c.cool = F.okuFire.t + dt + 0.1;
      if (lordDown && !F.gunsQuiet) { F.gunsQuiet = true; for (const g of [F.ni, F.hon, F.kogo]) if (g) for (const u of g.units) if (u.type === 'gun') u.dmg = 0; }
      F.okuFire.tick(dt);
    }
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (!F.ending && !F.step) { if (shutsujin.update(rt, {})) this.dai(rt); return; }
    if (F.ending || !F.step) return;
    const p = rt.player.u.pos, T = rt.t - F.stepT;
    // 負け方：一柳の旗の隊が全部崩れる（本人が倒れるのは共通の仕組み）
    if (F.toyo.every((g) => g.count === 0) && (!rt.canFailMission || rt.canFailMission())) { this.lose(rt, '先手の隊がみな崩れた'); return; }
    if (F.step === 1) {
      rt.objProgress('main', '');
      // 十六挺が交互に本人を撃ち続けない。射撃六秒・弾込め十二秒の隙に先手が寄る。
      const firing = T % 18 < 6;
      if (F.dai.fire !== firing) {
        F.dai.fire = firing;
        if (!firing && T < 19 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60)
          rt.say('中村一氏', '鉄砲が止んだ！　土橋から出丸へ掛かれ！', 3);
      }
      if (!F.daiOn && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) { F.daiOn = true; F.dai.order = 'attack'; F.dai.seekRange = 30; }
      // 一柳直末は出丸の鉄砲に当たって討ち死に（史実。『一柳家記』）。本当に倒れ、隊は旗を守って攻め続ける
      // 主人公が一柳の旗の近く（45m）にいる時に撃たれる。時間だけでは遠くで討たない。
      const iu0 = F.ichi.units.find((u) => u.type === 'busho' && u.alive);
      const ichiShooter = F.dai.units.find((u) => u.type === 'gun' && cnt(u) && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
      const ichiNear = iu0 && Math.hypot(iu0.pos.x - p.x, iu0.pos.z - p.z) < 45;
      // 生きた鉄砲がいても、土塁・柵の向こうや射程外の直末を場面だけで撃ち倒さない。
      // 撃てる者を別に探し、遮られた先頭の一人だけで発砲を止めない。
      const ichiCanShoot = !F.ichiShot && !F.ichiLost && T > 30 && firing && ichiNear && F.dai.units.find((u) => u.type === 'gun' && cnt(u) && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
        !u.sidearm && !u.reload && !(u.cd > 0) && !u.swing && !u.downed && !(u.stagger > 0) &&
        Math.hypot(u.pos.x - iu0.pos.x, u.pos.z - iu0.pos.z) <= (u.range || 100) &&
        !rt.army.shotBlocked(u, iu0.pos) && !rt.army.hiddenBehind(u, iu0) && !rt.army.terrainBlocks(u.pos, iu0.pos));
      // 本人が間宮を先に討った場合、残る鉄砲で一柳の討死を後から起こして順を逆にしない。
      const mamiyaAlive = F.dai.units.some((u) => u.type === 'busho' && cnt(u));
      // 弾込め中や深手で退いた鉄砲から、討死の場面だけを発砲させない。
      if (!F.ichiShot && !F.ichiLost && !F.mamiyaDead && mamiyaAlive && T > 30 && firing && ichiCanShoot) {
        F.ichiShot = true; F.ichi.name = '一柳直盛の隊'; rt.banner('一柳直末、撃たれる'); rt.say('中村一氏', '伊豆守殿が鉄砲に当たられた！　一柳の者ども、旗を守れ！', 4);
        rt.after(5, () => rt.say('一柳直盛', '兄の首は渡さぬ。一柳の旗は、この直盛が預かる！', 4));
        const iu = F.ichi.units.find((u) => u.type === 'busho' && u.alive);
        if (iu) {
          const shooter = ichiCanShoot;
          // 撃った出丸の鉄砲の煙と、一柳の倒れる所を同じ時に見せる
          if (shooter) rt.world.gunSmoke?.(shooter.pos.x, shooter.pos.z);
          // 場面の一発も通常の射撃と同じ装填へ移す。別の的への構えを残して二発続けて撃たない。
          shooter.atk = null;
          rt.army.startReload(shooter);
          sfx('gun', 0.9); iu.invuln = false; iu.hp = 0; rt.army.kill(iu, shooter);
        }
      }
      // 間宮康俊の最期（史実：氏勝と孫の直元を落とし、白髪を墨で染めて敵の中へ突き入り討ち死に。七十三歳）
      const mu = F.dai.units.find((u) => u.type === 'busho');
      // 間宮の突き入りは主人公の見える所（60m）で始める。柵の内で突っ立ったまま字だけで死なない（critic60 山中 8）
      const muNear = mu && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 60;
      // 鉄砲が残る間は一柳の討死を先に見せる。鉄砲を全て討った時だけ、二分半で突き入りへ進む。
      // 時間だけで突き入らせると、後から近づいた一柳が間宮の最期の後に撃たれてしまう。
      if ((F.ichiShot || F.ichiLost || T > 150 && !ichiShooter) && !F.mamiya && mu && mu.alive && F.dai.count > 0 && muNear && (F.dai.count < F.daiN * 0.6 || T > 25)) {
        F.mamiya = true; F.mamiyaT = rt.t;
        F.dai.noRout = true; F.dai.morale = 100; F.dai.order = 'assault'; F.dai.seekRange = 60; F.dai.aggro = 40; F.dai.fixed = false;
        // 横陣の後列は敵が三〜六mへ来るまで持ち場を守る。突き入りの下知では後列も前へ出す。
        F.dai.formation = 'column'; F.dai.colW = 3;
        const escaped = F.ujikatsu && !F.ujikatsu.units.some((u) => u.alive && !u.gone);
        rt.say('間宮康俊', `${escaped ? '氏勝殿も直元も落とした。' : '氏勝殿と直元は北の道へ。'}白髪首を渡すは恥ぞ、墨で染めたわ。者ども、続け！`, 5);
      }
      // 最期は実際の攻撃で決める。柵の向こうで待つだけで四十秒後に命を尽かせない。
      // 突き入り前に本人が討った場合も記録し、討死と隊の崩壊を分けて数える。
      if (!F.mamiyaDead && slain(mu)) {
        F.mamiyaDead = true; F.mamiyaDeadT = rt.t;
        // 将を失った手勢は実際に動揺して退く。討死の人数は増やさない。
        F.dai.noRout = false; F.dai.morale = Math.min(F.dai.morale, 35);
        rt.banner('間宮康俊、討ち死に');
      }
      // 味方だけが出丸を抜いても、主人公が寄るまでは次の目標を達成扱いにしない。
      // 残兵を探し回らせず、間宮を失った手勢が近くの寄せ手へ突き入る。
      // 時間だけで敗走・柵の破壊・討ち取りの達成を起こさない。
      if (!F.daiLast && !F.dai.routed && (F.mamiyaDead || T > 240) && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) {
        F.daiLast = true; F.dai.order = 'assault'; F.dai.fixed = false; F.dai.seekRange = 60; F.dai.aggro = 40;
        F.dai.formation = 'column'; F.dai.colW = 3;
      }
      // 柵に誰も傷をつけられないまま本人が柵の前で戦い続ける時は、先手が柵を引き倒す（11/9 bot：出丸の前で13分止まり倒れた）
      if (!F.daiPulled && T > 45 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 45 && F.toyo.some((g) => !gone(g) && Math.hypot(g.center().x - KURUWA.dai.x, g.center().z - KURUWA.dai.z) < 45) && F.daiBridge.alive !== false && F.daiBridge.hp > 0) {
        F.daiPulled = true;
        const best = F.daiBridge;
        if (best && best.alive) { rt.army.damage(best, best.hp + 1, null); sfx('gateBreakWood', 0.8); rt.say('中村一氏', '縄を掛けよ！　柵を引き倒せ！', 3); }
      }
      const breached = F.daiBridge.alive === false || F.daiBridge.hp <= 0;
      // 間宮の討死・四分の三の戦力喪失・出丸への到達で制圧。退く兵を追い回させない。
      // 討った人数は水増しせず、残りは崩れて退く。
      const remaining = daiStanding(F.dai);
      // 11/12 クラウドさ：間宮の討死の後も散った残兵（出丸の北の(-46,203)・(-29,206) で突き入りの下知のまま立つ侍など）が四分の一を越えて残り、
      //   出丸の段が八〜十一分続いた。討死から一分経てば、半ばまで減っていれば制圧とする（残りは崩れて退く）
      const enough = remaining <= F.daiN * (rt.t - (F.mamiyaDeadT ?? rt.t) > 60 ? 0.5 : 0.25);
      if (F.mamiyaDead && enough && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 30 && breached) this.shoji(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.cross.x, p.z - F.cross.z);
      rt.objProgress('main', `堀の向こうまで あと${Math.round(d)}m`);
      // 堀の縁の兵は縁を離れず、上がって来る寄せ手を縁で迎える（一人を追って堀へ降りない）
      if (!F.rimOn && p.z < SHOJI.z1 + 30) { F.rimOn = true; F.rim.seekRange = 12; }
      // 畝だけでなく対岸の柵（z0−3）の開口も抜けてから、馬出しへ向かう。
      // 柵の手前で段を替えると、右の集合点へ横切って生きた柵に突き当たる。
      if (p.z < SHOJI.z0 - 4 && d < 18) this.ote(rt);
    }
    if (F.step === 3) {
      const gate = F.K.gate && F.K.gate.struct;
      const dg = Math.hypot(p.x - SP.at.gate.x, p.z - SP.at.gate.z);
      rt.objProgress('main', F.sub === 'back' ? `大手門まで あと${Math.round(dg)}m` : '');
      // 打って出た隊が皆討たれた時は、門へ攻め寄せる段へ
      // 11/12 クラウドさ：馬出しの隊が討ち尽くされず退きもせず、act bot は（21,88）で十二分撃ち続け刻限に掛かった。
      //   迎え撃ちが三分を超えたら、残る兵ごと門へ退かせて「退く兵に続く」段へ移す
      if ((F.sub === 'yose' || F.sub === 'sally') && (gone(F.uma) || rt.t - F.stepT > 180)) this.sallyBack(rt);
      if (!F.gateOpen && gate && (gate.alive === false || (gate.opened && F.K.tsukeiri))) this.openGate(rt, !!F.K.tsukeiri);
      // 本人と寄せ手が門へ詰めている間だけ数える。遠くで待つだけでは門を破らない。
      if (!F.gateOpen && F.sub === 'back' && dg < 40 && F.toyo.some((g) => g.units.some((u) => cnt(u) && Math.hypot(u.pos.x - SP.at.gate.x, u.pos.z - SP.at.gate.z) < 20))) {
        F.gatePress = (F.gatePress || 0) + dt;
        if (F.gatePress > 70) this.openGate(rt, false);
      }
      // 本人が門の前の三の丸の守りと斬り合い続け、寄せ手が門へ着けない時も、長くは止めない（11/9 bot：九分止まった）
      // 11/13 クラウドE：act bot は門の前で矢と新手に削られ、退く段だけで五分近く立ったまま倒れた（460秒）。待ちは九十秒まで
      if (!F.gateOpen && F.sub === 'back' && dg < 60 && rt.t - F.backT > 90) this.openGate(rt, false);
      // 三の丸の広場に入って果たす。時間で半径を広げると門の外でも達成してしまう。
      const dpz = Math.hypot(p.x - SP.at.plaza.x, p.z - SP.at.plaza.z);
      // 門の内側を実際に通ったことを記録する。曲輪の外の斜面へ回っただけでは果たさない。
      if (F.gateOpen && Math.abs(p.x - SP.at.gate.x) < 5 && p.z < SP.at.gate.z - 1 && p.z > SP.at.gate.z - 12) F.oteEntered = true;
      // 広場が守りで詰まっていても、門を抜けて三の丸へ入れば果たす。
      if (F.gateOpen && F.oteEntered && (dpz < 10 || (Math.hypot(p.x - KURUWA.san.x, p.z - KURUWA.san.z) < 30 && p.z < SP.at.gate.z - 3))) {
        // 開門だけでは名乗らず、本人が門を抜けて三の丸へ入った所で一番乗りを見せる。
        rt.say('渡辺勘兵衛', '中村が内、渡辺勘兵衛、一番乗り！', 3.5);
        this.honmaru(rt);
      }
    }
    if (F.step === 4) {
      const g = F.hon;
      rt.objProgress('main', '');
      if (!F.honOn && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 50) {
        F.honOn = true; g.fixed = false; g.aggro = 14; g.order = 'attack'; g.seekRange = 26;
        // 11/13 クラウドE：本丸へ上った本人が旗本の鉄砲に背から撃たれ続けて倒れた（act 702秒・旗本の傷159）。上った時から旗本の鉄砲を半分に
        for (const q of g.units) if (q.type === 'gun') q.dmg *= 0.5;
        rt.say('中村一氏', '本丸へ掛かれ！　松田の旗を倒せ！', 3.5);
        for (const q of F.toyo) if (!gone(q)) { continuePath(q, UP_ROUTE.slice(7)); q.speed = 2.4; q.onArrive = (r) => { r.order = 'attack'; r.seekRange = 40; }; }
      }
      // 11/10 クラウド：二の丸の守りと斬り合い・手当てを繰り返し、本丸の段だけで七分を越えて刻限に掛かった（act 1080秒）。
      //   六人未満か三分を過ぎたら二の丸の守りは本丸へ退き、道を空ける
      if (F.ni && !gone(F.ni) && !F.niGive && (F.ni.count < 6 || rt.t - F.stepT > 180)) {
        F.niGive = true;
        // 北へ真っすぐ敗走させると二の丸の土塁と本丸の柵に詰まる。
        // 知らせどおり、北の虎口・土橋・本丸の南口を通って退く。
        const q = F.ni;
        q.noRout = true; q.morale = 100; q.fixed = false;
        q.historicalOrders = true; q.noPursue = true; q.retreatOnly = true;
        q.formation = 'column'; q.colW = 2; q.march = false;
        // 後列も北の虎口と土橋の折れに沿わせ、切岸へ斜めに向かわせない。
        const c = q.center(); q.anchor = { x: c.x, z: c.z };
        q.roadColumn = true; q.followColumnRoad = true;
        q.order = 'path'; q.speed = 2.8;
        q.path = [[c.x, c.z], ...UP_ROUTE.slice(5).map((p) => p.slice())]; q.pathIdx = 1;
        q.onArrive = (r) => { for (const u of r.units) if (u.alive && !u.gone) rt.army.despawn(u); };
        rt.say('中村一氏', '二の丸の兵が本丸へ退くぞ！　追って上れ！', 3.5);
      }
      // 旗本が崩れ始めると康郷が脱出する。康長は初めから本人の攻撃で討てる。
      if (F.honOn && !F.kogoOut && F.kogo?.units.some((u) => u.type === 'busho' && cnt(u) && !u.gone) && (g.count < F.honN * 0.65 || slain(F.honU))) {
        F.kogoOut = true; F.kogo.fixed = false; F.kogo.noRout = true; F.kogo.morale = 100;
        // 本丸の北と東は柵で閉じている。南の虎口から出て、東の尾根を回って落ちる。
        // 士気を零にすると敗走の下知がこの退路を上書きし、北の柵へ突き当たる。
        // 護衛まで南の虎口を通る縦隊にし、後列が本丸の柵を斜めに横切らない。
        const c = F.kogo.center(); F.kogo.anchor = { x: c.x, z: c.z };
        F.kogo.formation = 'column'; F.kogo.colW = 2; F.kogo.march = false; F.kogo.roadColumn = true; F.kogo.followColumnRoad = true;
        F.kogo.order = 'path'; F.kogo.path = [[c.x, c.z], [24, -94], [24, -82], [52, -70], [70, -130], [52, -200]]; F.kogo.pathIdx = 1; F.kogo.speed = 2.8;
        // 退去の下知後は近くの寄せ手に応戦して足を止めず、護衛も康郷と城外へ抜ける。
        F.kogo.noPursue = true; F.kogo.retreatOnly = true; F.kogo.historicalOrders = true; F.kogo.arriveNoncombat = true;
        F.kogo.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
        rt.say('松田康郷', '兄上、御免！　この康郷は落ち延び、松田の家を残す', 4);
      }
      // 旗本は退かせず、松田康長が討たれるまで本丸で戦う（critic60 山中 37「退いただけで落城・康長の討たれる所が見えない」）
      // 旗本が崩れなくても、三分余りで康長が自ら打って出る（討つのは本人と寄せ手。時間で討ち死にはさせない。11/9 見回り：本丸で十分止まった）
      if (F.honOn && !F.honOut && T > 200 && F.honU?.alive) { F.honOut = true; g.fixed = false; g.order = 'attack'; g.aggro = 40; g.seekRange = 60; rt.say('松田康長', '者ども、討って出るぞ！', 3);
        // 11/10 クラウド：打って出た旗本の鉄砲と槍に背から撃たれ、本丸の段で倒れた（act 982秒）。打って出た後は旗本の打ち込みを半分・鉄砲を三割に
        g.dmgMult = (g.dmgMult || 1) * 0.5; for (const q of g.units) if (q.type === 'gun') q.dmg *= 0.3; }
      if (F.honOn && g.count < F.honN * 0.4 && F.honU?.alive && !F.honLast) { F.honLast = true; g.aggro = Math.max(g.aggro || 0, 20); rt.say('松田康長', '本丸を枕に討ち死にいたす。かかれ！', 3.5); }
      // 康長の討死は実際の攻撃で決める。近くで待った時間だけで命を尽かせない。
      // 隊の戦力の数だけで討死を決めず、終幕の知らせと康長本人の生死を合わせる。
      // 二の丸の虎口も五十m内に入る。本丸の南口を越えて城内へ上るまでは落城にしない。
      // 11/13 クラウドE：寄せ手が康長を討った後、本人が二の丸の坂（19,-69）で止まったまま七分経ち、刻限で負けになった（act 1080秒）。
      //   康長が討たれたら、本人が本丸の南口から六十m 内にいれば二十秒で落城とする（本丸の内に入れば今までどおりすぐ）
      if (F.honOn && slain(F.honU) && F.honSlainT === undefined) F.honSlainT = rt.t;
      if (F.honOn && slain(F.honU) && ((p.z < -87 && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 20) ||
          (rt.t - F.honSlainT > 20 && Math.hypot(p.x - 24, p.z + 84) < 60))) this.win(rt);
    }
  },

  onKill(rt, v) {
    // 柵や門を壊しても兵の討死には数えない。
    if (v.isStruct || v.civ) return;
    const F = rt.flags;
    if (v.team === 1) {
      F.ek = (F.ek || 0) + 1;
      if (F.dai?.units.includes(v)) F.daiEk = (F.daiEk || 0) + 1;
    } else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.routSaid) return;   // 同じ隊の退きは一度だけ言う
    g.routSaid = true;
    rt.say('足軽', `${g.name}が退き始めた`, 2.5);
  },
};

// 両軍の総勢（豊臣秀次の寄せ手およそ七万、山中城の北条勢およそ四千。数には諸説ある）
t09_yamanaka.force = (rt) => {
  const F = rt.flags;
  // 出丸の手勢は任務と同じ二百人換算。全員を一律二十五人で減らすと、
  // 出丸を抜いただけで千人以上を失った人数になってしまう。
  const losses = daiLoss(rt) + Math.max(0, (F.ek || 0) - (F.daiEk || 0)) * 25;
  // 氏勝・康郷の脱出や残兵の退去を、共通表示側で討死として引き直さない。
  // 換算上の損失が四千に達しても、まだ戦場に立つ城兵の数は残す。
  let standing = 0;
  for (const u of rt.army?.units || []) {
    if (u.team !== 1 || !u.alive || u.gone || u.dying || u.civ || u.isStruct ||
        (u.noTarget && !u.name) || u.type === 'dummy' || u.type === 'porter') continue;
    standing++;
  }
  return { a: Math.max(0, Math.round(70000 - (F.ak || 0) * 40)), a0: 70000,
    b: Math.max(standing, 4000 - losses), b0: 4000, casualtiesCounted: true };
};
t09_yamanaka.sides = { a: { name: '豊臣軍（豊臣秀次）', mon: 'toyotomi' }, b: { name: '北条軍（松田康長）', mon: 'hojo' } };
t09_yamanaka.date = () => '天正十八年三月二十九日　春・朝';
t09_yamanaka.history = '天正十八年（1590）、豊臣秀吉は小田原の北条氏を攻めた。三月二十九日の朝、豊臣秀次を大将におよそ七万が、箱根の西の坂にある山中城を攻めた。城は松田康長らおよそ四千が守り、堀の底を畝で仕切った障子堀・畝堀と、折れた虎口で固めていた。寄せ手の一柳直末は鉄砲に当たって討たれたが、中村一氏（家臣の渡辺勘兵衛が一番乗り）・堀秀政・山内一豊らの手がいくつもの方から攻め上り、城は半日で落ちた。岱崎出丸を守った間宮康俊も、城主の松田康長も討ち死にした。北条の西の守りは一日で崩れ、秀吉の軍は箱根を越えて小田原を囲んだ。兵の数には諸説ある。';

// 素直な遊び手：出丸の隊と戦い、障子堀を縦の畝の上で渡り、虎口が開いたら三の丸から本丸へ
t09_yamanaka.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (!F.step) { goTo(p, inp, shutsujin.LINE.x, shutsujin.LINE.z, 2); return; }
  // 段や馬出しの下知が替わったら、前の持ち場の休息先へ引き返さない。
  if (b.botRestStep !== F.step || b.botRestSub !== F.sub || b.botRestGate !== !!F.gateOpen) {
    b.botRest = false; b.botRestAt = null; b.botRestT = null; b.botRestNo = 0; b.botRestWp = null;
    b.botRestStep = F.step; b.botRestSub = F.sub; b.botRestGate = !!F.gateOpen;
  }
  // 一太刀で命の半分を失うため、半分のまま二太刀目を待たず味方の後ろへ退く。
  // 下がる先は十四m 後ろ。大手門の段では障子堀へ落ちないよう、堀の手前（南の縁）までに留める
  // 畝の途中では休まない。渡堀中に記録した座標を次の段へ持ち越すと、
  // 渡り終えた本人が堀へ戻り、対岸の矢玉を浴び続けてしまう。
  // 門が開いたら休まず枡形を抜ける（門の前の南の縁へ下がると、馬出しの矢と新手の中で休むことになり倒れた。11/13）
  // 迎え撃ちの間（yose・sally）も休まない：休む先が堀の縁（南へ十四m・縁で止める）＝今いる所と同じになり、矢の下で立ったまま倒れた（11/13）
  if (F.step !== 2 && !(F.step === 3 && (F.sub !== 'back' || F.gateOpen) && u.hp > u.maxHp * 0.2) && u.hp < u.maxHp * (b.t < (b.botRestNo || 0) ? 0.35 : 0.65)) {
    if (!b.botRest) {
      b.botRestUp = null; b.botRestWp = null;
      b.botRestAt = { x: u.pos.x, z: F.step === 3 ? Math.min(u.pos.z + 14, SHOJI.z0 - 3) : u.pos.z + 14 }; b.botRestT = b.t;
      // 二つ前へ直進すると馬出しの柵や土橋の縁を横切る。折れを逆順に通って退く。
      if (F.step === 3 && F.sub === 'back' && b.botWp > 1) {
        b.botRestWp = b.botWp - 1;
        b.botRestEnd = b.botWp - 2;
      }
      // 本丸への退きも虎口と土橋を逆順に通る。回復後は退いた点から登り直す。
      if (F.step === 4 && b.botUp !== undefined) {
        b.botRestUp = Math.max(0, b.botUp - 1);
        b.botRestEnd = Math.max(0, b.botUp - 2);
      }
    }
    b.botRest = true;
  }
  // 休んでも矢玉の届く所で四十秒治らない時は、休みを打ち切って先へ進む（門の内へ入れば守りは退く）。
  if (b.botRest && (u.hp > u.maxHp * 0.85 || (F.step >= 3 && b.t - (b.botRestT ?? b.t) > 40 && u.hp > u.maxHp * 0.35))) { if (u.hp <= u.maxHp * 0.85) b.botRestNo = b.t + 30; b.botRest = false; b.botRestT = null; }
  const c = (F.toyo.find((g) => !gone(g)) || F.ichi).center();
  if (b.botRest && F.step !== 2) {
    inp.guardHold = false;
    // 先手の中心は出丸の内へ進む。そこを休息先にすると、深手の本人が敵陣へ戻ってしまう。
    // 西側からは畝堀の土橋へ戻り、東の街道の二陣で手当てを待つ。
    if (F.step === 1) {
      if (u.pos.x < -10) {
        if (Math.abs(u.pos.z - 176) > 4) goTo(p, inp, Math.min(u.pos.x, -32), 176, 1.5);
        else goTo(p, inp, -6, 176, 1.5);
      } else goTo(p, inp, 12, 194, 2);
    } else if (F.step === 3 && b.botRestWp != null) {
      let q = OTE_ROUTE[b.botRestWp];
      if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 1.5 && b.botRestWp > b.botRestEnd) q = OTE_ROUTE[--b.botRestWp];
      // 回復が途中で済んでも、退いた折れから進み直す。
      b.botWp = b.botRestWp;
      goTo(p, inp, q.x, q.z, 1.2);
    } else if (F.step === 4 && b.botRestUp != null) {
      let q = UP_ROUTE[b.botRestUp];
      if (Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 2 && b.botRestUp > b.botRestEnd) q = UP_ROUTE[--b.botRestUp];
      b.botUp = b.botRestUp;
      goTo(p, inp, q[0], q[1], 1.2);
    } else if (F.step >= 3 && b.botRestAt) goTo(p, inp, b.botRestAt.x, b.botRestAt.z, 2);   // 大手門・本丸の段は十四m 下がって息を継ぐ（先手の中心まで四十〜百m 下っては戻るのを繰り返し、七〜九分を使った。11/10）
    else goTo(p, inp, c.x, c.z + 18, 2);
    return;
  }
  // 堀の中では寄り道をせず、畝の筋をまっすぐ渡る
  //   （目の前に来た敵だけは斬り払う）
  // 切岸の上や柵の向こうへ斬り掛からず、味方と同じ虎口・土橋を通る。
  const inUne = (q) => q.x > -28 && q.x < -11 && q.z > 138 && q.z < 212 && (q.z < 170 || q.z > 182);   // 出丸の脇の畝堀の中
  // 11/10 クラウド：大手門の段で、渡り終えた障子堀の中（底の槍・縁の鉄砲の残り）に十二歩内で掛かり続け、堀の手前（20,88）で九分止まった。
  //   堀を渡った後は堀の中の敵を相手にせず、十秒寄れない敵は三十秒見限る
  const ign = b.botIgn ||= new Map();
  const e = b.army.nearestEnemy(u, F.step === 2 ? 3.5 : 12, (o) => !o.fleeing && !o.isStruct && !(F.step === 1 && inUne(o.pos)) &&
    !(F.step >= 3 && o.pos.z > SHOJI.z0 - 1 && o.pos.z < SHOJI.z1 + 1) && !(ign.get(o) > b.t) &&
    !(F.step === 1 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 2.4 && crossesDaiMoat(u.pos, o.pos)) &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, p.weapon === 'spear'));
  if (F.step === 2) {
    // 堀底の敵を追うと畝を外れ、縁の鉄砲の下で止まる。届く敵だけ払い、足は渡り筋へ。
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d < (p.weapon === 'sword' ? 1.9 : 2.8)) {
        p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
        patientStrike(p, inp, e, d);
      }
    }
    inp.guardHold = false;
    // 出丸から対岸へ直進すると、出丸脇の畝堀と障子堀の畝を斜めに横切って落ちる。
    // 味方と同じ土橋で街道へ戻り、堀の手前で縦の畝の正面に揃えてから渡る。
    if (u.pos.z > SHOJI.z1 + 2 && u.pos.x < -11) {
      if (Math.abs(u.pos.z - 176) > 2) goTo(p, inp, Math.min(u.pos.x, -32), 176, 1);
      else goTo(p, inp, -6, 176, 1);
    } else if (u.pos.z > SHOJI.z1 + 2 && Math.abs(u.pos.x - CROSS_X) > 0.5) {
      goTo(p, inp, CROSS_X, SHOJI.z1 + 10, 0.5);
    } else goTo(p, inp, CROSS_X, F.cross.z, 1);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const k = b.botChase ||= { e: null, t: 0, t0: 0, hp: 0, x: 0, z: 0, dmin: 0 };
    // 寄れたかは相手との間合いで見る（自分が動いたかで見ると、堀の手前（20,88）で左右に揺れ続けて七分見限れなかった。11/11 関所係）
    if (k.e !== e) { k.e = e; k.t = k.t0 = b.t; k.hp = e.hp; k.dmin = d; }
    else if (d < k.dmin - 1) { k.t = b.t; k.dmin = d; }
    // 寄れない敵（十秒）と、柵越しに突いても傷の付かない敵（十二秒）は三十秒見限る（馬出しの柵越しに七分突き続けた。11/10）
    if (k.e === e && ((d > 2.4 && b.t - k.t > 10) || (b.t - k.t0 > 12 && e.hp >= k.hp - 0.5))) { ign.set(e, b.t + 30); k.e = null; }
    else if (e.hp < k.hp - 0.5) { k.hp = e.hp; k.t0 = b.t; }
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 振りを受けてから返す（共通の patientStrike）。くじの突きと構えでは、騎馬と侍に削られて二度とも倒れた（11/8）
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2.2);
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 画面の案内と同じ土橋・柵を通る。別の柵が破れても、畝堀へ回り込まない。
  if (F.step === 1) {
    const target = t09_yamanaka.goalSignTarget(b), wall = F.daiBridge;
    const d = Math.hypot(target.x - u.pos.x, target.z - u.pos.z);
    if (target.label === '出丸の柵' && wall && wall.alive !== false && wall.hp > 0 && d < 4) {
      p.yaw = Math.atan2(target.x - u.pos.x, target.z - u.pos.z);
      const reach = p.weapon === 'sword' ? 1.9 : 2.8;
      if (d > reach * 0.8) goTo(p, inp, target.x, target.z, reach * 0.75);
      patientStrike(p, inp, wall, d);
    } else if (target.label === '岱崎出丸' && d < 5) {
      // 11/13 クラウドE：出丸の真ん中に着くと足を止め、十二m より先（土塁の縁・柵際）に残る間宮の手勢を待ったまま十八分立った。
      //   真ん中に着いたら、間宮（無ければ一番近い手勢）へ歩み寄る
      let best = null, bd = Infinity;
      for (const q of F.dai.units) if (q.alive && !q.gone && !q.fleeing) { const dq = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z) - (q.type === 'busho' ? 30 : 0); if (dq < bd) { bd = dq; best = q; } }
      if (best) goTo(p, inp, best.pos.x, best.pos.z, 2);
    } else goTo(p, inp, target.x, target.z, target.label === '岱崎出丸' ? 3 : 1);
    return;
  }
  if (F.step === 3) {
    // 馬出しの右の口の前で待ち、打って出た隊と戦い、退く兵に続いて口・馬出し・土橋・門へ
    const A = SP.at, M = A.mouths[1];
    // 11/13 クラウドE：打って出た隊を口の前（堀の縁）で待つだけだと、馬出しの矢を浴びて一分足らずで倒れた（act bot・三回）。
    //   打って出たら、一番近い北条の兵へこちらから寄せる（十二m 内に入れば上の斬り合いが拾う）
    // 寄せの間（yose）も同じ：縁の口で待つと、本人を狙う矢弾だけを浴びる（act 311秒：縁で三十六秒に命の七割）
    if ((F.sub === 'sally' || F.sub === 'yose') && !gone(F.uma)) {
      let best = null, bd = 45;
      for (const q of F.uma.units) if (q.alive && !q.gone && !q.fleeing && Math.abs(q.pos.y - u.pos.y) < 3) { const dq = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z); if (dq < bd) { bd = dq; best = q; } }
      if (best) { goTo(p, inp, best.pos.x, best.pos.z, 2); return; }
    }
    if (F.sub !== 'back') { goTo(p, inp, M.far.x, M.far.z, 3); return; }
    const W = OTE_ROUTE;
    b.botWp = Math.min(b.botWp || 0, W.length - 1);
    // 口へ回る途中の迎撃や手当てで時間が過ぎても、通っていない折れは飛ばさない。
    // 時間だけで先へ送ると馬出しの正面の柵や堀へ向かい、最後の点まで進んだまま止まる。
    const dw = Math.hypot(u.pos.x - W[b.botWp].x, u.pos.z - W[b.botWp].z);
    if (dw < 2.5 && b.botWp < W.length - 1) b.botWp++;
    goTo(p, inp, W[b.botWp].x, W[b.botWp].z, 1.2); return;
  }
  // 味方が先に旗本を討ち取っても、本人が本丸へ着くまでは登り切る。
  if (F.step === 4 && F.hon) {
    // 枡形を折れて三の丸・二の丸の虎口を通り、本丸へ（近い点から先へ）
    if (b.botUp === undefined) { let bi = 0, bd = Infinity; UP_ROUTE.forEach(([x, z], i) => { const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; bi = i; } }); b.botUp = bi; }
    const [x, z] = UP_ROUTE[b.botUp];
    if (Math.hypot(u.pos.x - x, u.pos.z - z) < 2.5 && b.botUp < UP_ROUTE.length - 1) b.botUp++;
    if (b.botUp >= UP_ROUTE.length - 1) { const t = gone(F.hon) ? KURUWA.hon : F.hon.center(); goTo(p, inp, t.x, t.z, 2); return; }
    goTo(p, inp, x, z, 1.2); return;
  }
  goTo(p, inp, c.x, c.z - 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
const cnt = (u) => u.alive && !u.dying && !u.evacuatedWound;   // 敗走しただけの兵は討ち取りに含めない。
// 退去も alive=false になる。討死の知らせと落城は、実際に倒れた記録で決める。
const slain = (u) => !!u && !u.alive && Number.isFinite(u.killedAt);
function quietFire(fire, dt) {
  if (!fire) return;
  for (const c of fire.src) c.cool = fire.t + dt + 0.1;
  fire.tick(dt);
}
const daiStanding = (g) => g.routed ? 0 : g.units.reduce((n, u) => n + (cnt(u) && !u.gone && !u.fleeing ? 1 : 0), 0);
const daiLoss = (rt) => {
  const F = rt.flags, n = F.daiN || F.dai?.units.length || 0;
  if (!n) return 0;
  // 退去も alive=false になる。生死の状態から逆算せず、実際の討死だけを二百人換算する。
  // 初めの人数を保ち、退去後の配列整理でも一人当たりの換算を変えない。
  const down = Math.max(0, F.daiEk || 0);
  return Math.min(200, Math.floor(down * 200 / n));
};
KILLS.t09_yamanaka = (rt) => {
  const F = rt.flags;
  if (F.ending || F.step !== 1) return null;
  const n = F.daiN || F.dai?.units.length || 0;
  if (!n) return null;
  // 制圧は四分の三の戦力喪失。討死と退いた兵を数え、手勢二百の全滅を要求しない。
  // 端数も段の判定（残りが n の四分の一以下）と同じ人数で揃える。
  const need = Math.floor((n - Math.floor(n * 0.25)) * 200 / n);
  return [Math.min(Math.floor((n - daiStanding(F.dai)) * 200 / n), need), need];
};
// 11/13 クラウドE：待つ備の新手（城攻めの層）が本丸の段で本人を囲み、act bot は三回とも新手の打ち込みで倒れた（与えた傷の六〜七割）。層は残し、打ち込みを半分に
t09_yamanaka.reserveDmgMult = 0.5;
// 本丸の段（三の丸から上）は城の守り（二の丸・本丸の旗本）が層になる。新手はもう作らない（act bot は本丸の段で新手に四回倒れた）
t09_yamanaka.reserveYield = (rt) => rt.flags.step >= 4;
// 新手は一戦で十二組まで（既定の二十四組では、城の内へ置ける新手が途切れず本丸の前で本人を囲み続けた。11/13）
t09_yamanaka.reserveLimit = 12;
// 出丸の攻めの間から二線を見せる（城攻めの既定の九十秒では、九十秒の時に本人の三十〜六十m の敵が二十人だった）
t09_yamanaka.reserveFrom = 40;
// 出丸の前は横が畝堀で、待つ備は横へずれて六十m より遠くに並んだ（九十秒：三十〜六十m に十三人・六十〜百m に八十一人）。少し手前に置く
t09_yamanaka.reserveDist = 38;
withGuard(t09_yamanaka);

export { t09_yamanaka };
export default t09_yamanaka;
