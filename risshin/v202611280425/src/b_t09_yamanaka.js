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
import { nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { allyGroup, enemyGroup, SH, shSide, sideDepth } from './t09_yamanaka/side.js';   // K661：側の入れ替え（h15 北条編）
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
import * as ZENYA from './zenya.js';                         // 前夜（K306）：夜明け前の陣中の篝火と声→朝へ
import * as shoshou from './t09_yamanaka/shoshou.js';       // 二巡：北条氏勝の落ち延び・徳川の旗・諸将の知らせ         // 落城の後：曲輪ごとに豊臣の旗・小田原はまだ先
import { makeRockTraps } from './siege_rocks.js';

// 11/21 K516：英語の時だけ字の表を読む（i18n_yamanaka.js・日本語は読まない）
import { isEn, addEn } from './i18n.js';
import { takatoMemCap } from './takato/memcap.js';
import { MEM_BUDGET } from './device_tier.js';
import { isTouch as _yamTouch } from './touch.js';   // 11/22 K564 記憶4GB の携帯の本物の兵の予算（205）を越えた分を遠い・見えない持ち場の組から外す（高遠と同じ部品）
if (isEn()) import('./i18n_yamanaka.js').then((m) => addEn(m.default)).catch(() => {});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 東海道（城の中を通る土の道）。三島の側（南）から本丸の脇へ
const ROAD = [[34, 340], [24, 270], [14, 200], [10, 140], [10, 64], [10, 30], [14, -40], [24, -100], [30, -170]];
const SEAT = { x: 44, z: 228 };             // 豊臣秀次の本陣の床几。周囲五mの馬廻も南端236mの内へ収める。
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
const UP_ROUTE = [[SP.x, SP.z], [SP.x, SP.z - 4.5], [SP.x + 9, SP.z - 3], [SP.x + 9, SP.z - 20], [16, -20], [16, -46], [21, -68], [22, -80], [24, -84], [25, -94]];
// 11/18 クラウド（K358）：枡形（x 5〜15・z 40〜48、内の口は東の z 42）の中で、z だけを見て次の点へ送ると南の塀越しの点を指し、act bot と印が塀に当たって止まった。
//   今の点が塀の向こうなら、塀の無い隣の点（先・後）へ替える
function upRouteFix(rt, p, i) {
  const A = rt.army, W = rt.world; if (!A?.wallBetween || !W) return i;
  const at = (q) => ({ x: q[0], y: W.heightAt(q[0], q[1]), z: q[1] }), me = { x: p.x, y: W.heightAt(p.x, p.z), z: p.z };
  if (!A.wallBetween(me, -1, at(UP_ROUTE[i]))) return i;
  if (i + 1 < UP_ROUTE.length && !A.wallBetween(me, -1, at(UP_ROUTE[i + 1]))) return i + 1;
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (!A.wallBetween(me, -1, at(UP_ROUTE[k]))) return k;
  return i;
}
// 大手の往復は同じ折れを通す。休息のたびに道の配列を作り直さない。
const OTE_ROUTE = [SP.at.mouths[1].lane, SP.at.mouths[1].outer, SP.at.mouths[1].inner,
  SP.at.uma, SP.at.bridgeOut, SP.at.bridgeIn, SP.at.gateOut, SP.at.plaza];
// 主人公だけ先へ進んでも、後続がまだ通っていない門・虎口を飛ばさない。
// 下知を替える時だけ道に継ぎ足し、後列に必要な通過済みの折れも残す。毎コマは作らない。
function continuePath(g, route) {
  // 討たれた者の空席を残すと、生きた後列の持ち場が何十mも手前に残る。
  // 下知の切替時だけ列を詰め、古い持ち場と足並み待ちを持ち越さない。
  let slot = 0;
  for (const u of g.units) if (cnt(u) && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) { u.slot = slot++; u.aiT = 0; }
  g._slotFit = null; g._mix = null; g._tailCheckAt = 0; g._waitT = 0;
  // 後列の持ち場も通って来た折れに沿わせる。先頭の通過済みの点を消すと、
  // まだ堀や門の手前にいる兵が、切岸を横切る一直線の持ち場へ向かってしまう。
  // 到着後に迎撃へ替わっていても、後列が通る畝・柵の口は残す。
  const following = g.path?.length;
  const history = following ? g.path : [[g.anchor.x, g.anchor.z]];
  const index = following ? g.pathIdx || 0 : 1;
  g.path = [...history, ...route].map((p) => p.slice());
  g.pathIdx = index;
  g.roadColumn = true; g.followColumnRoad = true;
  g.order = 'path';
}
// 味方の新手（frontFill）を先手と同じ畝で渡らせ、route へ続かせる（一枚表③：大手の段で本人の後ろに誰も続かない）
function shinteFollow(rt, pts) {
  const F = rt.flags;
  for (const g of rt.army.groups || []) {
    if (!g || g.team !== 0 || g.name !== '味方の新手' || g.routed || !g.units?.some((u) => cnt(u) && !u.gone) || F.toyo.includes(g)) continue;
    const c = g.center();
    // 11/18 09:25 UTC 持ち主 クラウド kaito2（act bot 397秒：出丸の内（-49,194）にいた新手十人が、馬出しの段で柵と土塁の中の道を進めず三十六組重なった）：
    //   出丸の内に残る新手は、本人が九十m より遠ければ出丸の守りに残ったと見て陣へ下げる（本人の目の届かない所で重なったまま残さない）
    const P = rt.player.u.pos;
    if (kNear(KURUWA.dai, c.x, c.z)[0] < KURUWA.dai.r + 2 && Math.hypot(c.x - P.x, c.z - P.z) > 90) { for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); continue; }
    g.stay = false; g.historicalOrders = true; g.formation = 'column'; g.colW = 2; g.march = false; g.speed = 3; g.anchor = { x: c.x, z: c.z };
    g.path = c.z > SHOJI.z0 - 1 ? [[c.x, c.z], [CROSS_X, SHOJI.z1 + 10], [CROSS_X, SHOJI.z0 - 1], [CROSS_X, SHOJI.z0 - 5]] : [[c.x, c.z]];
    // 11/18 クラウド kaito2（act bot 602秒）：出丸の内（-40,193）にいた新手十一人が、出丸の脇の畝堀を斜めに横切る道で堀の法に当たり、本丸の段まで四十五組重なって止まった。
    //   出丸の内から出る時は、土橋（z 176）を東へ渡ってから先へ続く
    if (c.x < -27 && g.path.length > 1 && (c.x < -56 || crossesDaiMoat(c, { x: g.path[1][0], z: g.path[1][1] }))) g.path.splice(1, 0, [Math.min(c.x, -32), 176], [-6, 176]);
    // 11/18 タ四：出丸の西の縁（x<-56）の新手九人が馬出しの段で重なった（bot 436秒 -62,176）→縁からも土橋へ出る
    g.pathIdx = 1;
    continuePath(g, pts);
    g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
    F.toyo.push(g);
  }
}
const HOJO = { flag: 'hojo', armor: 0x2e2a26, hatColor: 0x1e1b18, lace: 0x5a4632, cloth: 0x6a5a40 };
const TOYO = { flag: 'toyotomi' };   // 秀次の本陣・中村一氏の手（中村の紋は確かな物が無く、主家の桐）
// 先手の諸将は自家の旗で寄せる（一柳の釘抜・山内の丸に三つ柏・堀の旗。textures。豊臣の旗だけで揃えない）
// 11/18 クラウド kaito2（⑥ 200秒の写真：味方の具足がみな同じ黒で家の見分けがつかない）：縅の糸を家ごとに替える（紺・茶・萌黄の暗い色。
//   家ごとの縅の色の確かな出所は無く、姉川の浅井・朝倉と同じく当世具足に多い暗い糸色から選んだ。北条の茶の縅とは重ならない）
const ICHI = { flag: 'kuginuki', lace: 0x2c3552 }, YAMA = { flag: 'kashiwa', lace: 0x5c2a22 }, HORI = { flag: 'hori', lace: 0x3c4a2e };

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

// 11/14 クラウドか：前の段の残り・新手を城の奥へ退かせる。退く下知だけでは共通の寄せ直しに上書きされ、本丸の段まで本人を追った。
//   本人から30m より遠い者はその場で消し、近い者は退くだけの隊にして城の外（北）へ落とす
function dropBehind(rt, g) {
  const p = rt.player.u.pos;
  // 11/14 クラウドE：待つ備の並び（depth_reserve の F._dr.E）に残ると、毎回本人の前へ置き直されて退かず、本丸まで付いて来て本人を囲んだ（act 602秒・新手の傷81）。並びから外す
  const DR = rt.flags._dr; if (DR) for (const R of [DR.E, DR.A]) { const i = R.indexOf(g); if (i >= 0) R.splice(i, 1); }
  for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 30) rt.army.despawn(u);
  if (gone(g)) return;
  g.noRout = true; g.morale = 100; g.fixed = false; g.stay = false; g.garrison = false;
  g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true; g.isReserve = false;
  g.order = 'move'; g.dest = { x: g.center().x, z: -160 }; g.speed = 3.2;
  // 11/14 クラウドE：退く新手が北（本丸の側）へ抜ける途中で本人とすれ違い、本丸の段の傷の二〜三割を与えた（act 775秒）。退く兵の打ち込みは二割に
  g.dmgMult = (g.dmgMult ?? 1) * 0.2;
  // 11/18 クラウド（K358）：一太刀の床（player_hurt.js）は dmgMult を見ないので、退く兵の一突きが四十のまま本丸の段の本人を倒した（act bot 590秒・馬出しの隊97）。退く兵は打たない
  for (const u of g.units) if (u.alive) { u.dmg = 0; u.fleeing = true; u.target = null; }   // 逃げる兵は打たない（共通の攻めは fleeing の兵を外す）
  g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
}

// K661（11/26 Sanae）：元の setup が置く両軍の布陣。元の setup の同じ所から呼ぶ（順は前と同じ）。側は t09_yamanaka/side.js（h15 北条編は豊臣が team 1）
function toyoForces(rt) {
  const W = rt.world, F = rt.flags;
  // ---- 豊臣方の先手：街道の坂の下に、隊ごとの塊で並ぶ（一柳・中村は街道の西、堀秀政は東の尾根）。本物の兵 ----
  // 11/18 クラウド（cloud-07 の照らし直し：開戦の写真で七万の寄せ手が数人）：先手の一柳・中村を布陣図（docs/fujin/t09・出丸の東の口 (−20,180)・(−12,172)）の方へ12m 寄せ、本人の前に並べる
  F.ichi = allyGroup(rt, { name: '一柳直末の隊', fullStrength: true, anchor: { x: -8, z: 192 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'busho', n: 1, o: { name: '一柳直末', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24, horo: 0xb8962a, mon: 'kuginuki' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 8 }], ICHI));   // 一柳は秀吉の黄母衣衆
  F.naka = allyGroup(rt, { name: '中村一氏の隊', fullStrength: true, anchor: { x: 10, z: 190 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'busho', n: 1, o: { name: '中村一氏', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '渡辺勘兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], TOYO));
  F.hori = allyGroup(rt, { name: '堀秀政の隊', fullStrength: true, anchor: { x: 66, z: 188 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 24 }, { type: 'gun', n: 5 }], HORI));   // 11/17 K358：味方の厚み（堀の隊に足軽＋8・侍＋1）   // 姿は units_data の堀秀政
  F.toyo = [F.ichi, F.naka, F.hori];
  for (const g of F.toyo) { g.defMult = 1.2; g.dmgMult = 0.85; }
  // 山内一豊の隊（秀次の先手の一つ。史実：中村・一柳と並んで攻め上った）。一柳の隊の後ろに続く二陣
  F.yama = allyGroup(rt, { name: '山内一豊の隊', fullStrength: true, anchor: { x: -4, z: 220 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, hat: 'kabuto_w', haori: 0x33302a, mon: 'kashiwa' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 28 }, { type: 'gun', n: 6 }], YAMA));   // 11/17 K358：味方の厚み（山内の隊に足軽＋8・侍＋1）
  F.toyo.push(F.yama);
  F.yama.defMult = 1.2; F.yama.dmgMult = 0.85;
  for (const g of F.toyo) g.historicalOrders = true;   // 案内の使番に控えの隊や渡堀中の列を転用させない。
  // 大将の豊臣秀次は街道の後ろの本陣の陣幕の中で床几に座り、旗本に囲まれて動かない（前に出ない。kaito AR 3・標準 一の2）
  // 後列まで動ける範囲に収め、南端から押し戻される跳びを防ぐ。
  F.hide = allyGroup(rt, { name: '秀次の旗本', fullStrength: true, anchor: { x: SEAT.x, z: SEAT.z - 18 }, facing: Math.PI, width: 9, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', formation: 'line' },
    dress([{ type: 'samurai', n: 12 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], TOYO));
  // 旗本は上の隊に置いてある。二列の自動護衛を足すと後列が南端を越え、
  // 床几へ全員を重ねて置く処理から、場外の持ち場へ戻って跳び続ける。
  F.hideS = allyGroup(rt, { name: '秀次の本陣', fullStrength: true, noRetinue: true, anchor: SEAT, facing: Math.PI, width: 2, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
    dress([{ type: 'busho', n: 1, o: { name: '豊臣秀次', invuln: true, hat: 'kabuto_w', horse: false } }], TOYO));
  for (const u of F.hideS.units) {
    u.invuln = true; u.noTarget = true;
    u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z - 0.35); u.mesh.position.copy(u.pos);
    u.jinchu = { standing: false, t: 0, soldiers: [] };
  }
}
function mamiyaForces(rt) {
  const F = rt.flags, D = KURUWA.dai;
  // ---- 岱崎出丸の間宮康俊の隊（数百。柵の内に鉄砲、後ろに槍と騎馬） ----
  F.dai = enemyGroup(rt, { faction: 'hojo', name: '間宮康俊の隊', anchor: { x: D.x + 6, z: D.z }, facing: 0.8, order: 'hold', aggro: 20, width: 12, morale: 95, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.3 },
    dress([{ type: 'busho', n: 1, o: { name: '間宮康俊', hat: 'kabuto_m', haori: 0x4a3a28 } }, { type: 'gun', n: 16 }, { type: 'ashigaru', n: 28 + more(rt, 0.3) }, { type: 'samurai', n: 5 }, { type: 'cavalry', n: 3 }], HOJO));   // 騎馬は三騎（八騎の当たりで出丸の前で倒れ続けた。11/8 bot）
  // 11/18 21:10 UTC 持ち主 クラウド kaito2（中学生 bot：出陣の段で本人が百十秒 動かない回、91秒に間宮の隊24人が出丸の西の塀際 (-60,165) で一点に重なって止まった）：
  //   全戦共通の全力（all_out）が出陣の段のうちに出丸の守りを「見える敵へ」寄せ、塀の内で詰まっていた。出丸の段（dai）が始まるまでは持ち場の守り（garrison）にする
  F.dai.garrison = true;
  for (const u of F.dai.units) if (u.type === 'gun') u.dmg *= 0.12;   // 15分の構成：出丸の鉄砲で倒れ続けた（11/8 bot）
  // 11/18 夜50-12（act bot 636秒）：間宮の命が 456 のままで、本人と寄せ手が二百秒近く斬り合ってやっと討てた（出丸の段 242秒）。
  //   本丸の松田康長と同じく三割五分に（七十三歳の老将。討つのは実際の斬り合いのまま）
  { const mu = F.dai.units.find((u) => u.type === 'busho'); if (mu && mu.maxHp) { mu.maxHp = Math.round(mu.maxHp * 0.35); mu.hp = Math.min(mu.hp, mu.maxHp); } }
  // 寄せ手の竹束（critic60 山中 7「竹束は一つも無い」）：出丸の鉄砲に向けて、街道の坂の上り口に横へ並べる。玉と矢を本当に止める
  {
    const vx = START.x - D.x, vz = START.z - D.z, L = Math.hypot(vx, vz) || 1, ux = vx / L, uz = vz / L;
    const rot = Math.atan2(-ux, -uz);
    for (let k = -3; k <= 3; k++) {
      const x = D.x + ux * 30 - uz * k * 3.2, z = D.z + uz * 30 + ux * k * 3.2;
      if (rt.world.walkable && !rt.world.walkable(x, z, rt.world.heightAt(x, z))) continue;
      addTaba(rt, x, z, 0, { rot, fixed: true });
    }
    // 11/18 08:10 UTC 持ち主 クラウド kaito2（K355 の残り「後ろの支え」：竹束の後ろから鉄砲で出丸の塀の上を撃つ）。
    //   竹束の四m 後ろに鉄砲組八人を据え、持ち場を離れず撃たせる。出丸を落とし本人が離れたら陣へ下げる（下の update）
    F.sasae = allyGroup(rt, { name: '竹束の後ろの鉄砲組', fullStrength: true, anchor: { x: D.x + ux * 34, z: D.z + uz * 34 }, facing: rot, width: 10, aggro: 0, fixed: true, noRout: true, order: 'hold', formation: 'line', dmgMult: 0.6, defMult: 2.5 },
      dress([{ type: 'gun', n: 8 }], TOYO));
  }
  F.daiN = F.dai.units.length;
  F.dai.noRout = true;   // 間宮が生きている間は踏みとどまり、討死の後は手勢が動揺する。
}

const t09_yamanaka = {
  resumeSteps: [[1, 'dai'], [2, 'shoji'], [3, 'ote'], [4, 'honmaru']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  minutes: 15, expectMin: 15,
  // 11/18 cloud-08（200秒の写真・画質高）：本丸への登り坂で視点が後ろの斜面に持ち上がり、真上から草だけを見下ろした。見下ろしは岩石城と同じ0.14まで、本丸の段は本丸の口へ目線を向ける
  camMaxDown: 0.14,
  camLookAt: (rt) => ((rt.flags.step || 0) >= 4 ? { x: 24, z: -90, up: 6 } : null),
  // 11/21 13:10 UTC 持ち主 クラウド（K582 携帯の act bot）：布陣の表の城兵の塊（二の丸の脇）が共通の「斬り合いへ寄せる」で大手の口（15,75）まで下り、
  //   馬出しの隊と斬り合う本人を二十秒で倒した（407秒・傷の一番98）。表の北条の塊は持ち場で待つだけ（fujin_layout の行の決まり）。城方の塊は起こさない・寄せない
  fujinWakeHold: (rt, g) => g?.team === 1,
  takenMult: () => 0.8,      // 11/18 クラウド（K358）：受ける傷の倍率を K360⑦ の限り（八割）に（高遠・小谷と同じ戦ごとの加減。一太刀の床は残る）
  attackWarningDelay: 1,     // 11/18 クラウド（K358）：打たれる前に迫る向きを一秒知らせて構える間を残す（出丸・馬出しで背と横から斬られた。高遠・姉川・三方ヶ原と同じ）
  meleeGrace: { rate: 1, burst: 1, interval: 3.5, k1118: true },   // kaito 11/18「少し軽く」：猶予を三秒半に（main の流し直し 0/3・鉄砲五ずつ・侍の一太刀48）   // 11/18 クラウド（K358）：刃の後の猶予を K360⑦ の限り（1.8秒）まで。出丸・馬出しで騎馬と侍の一太刀（48）が続けて入り act bot が倒れ続けた
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
  nearFlagFadeRadius: 6,    // 11/18 クラウド kaito2（⑥ 140秒の写真）：肩越しに張り出す味方の幟の布が画面の上の三分の一を塞いだ。ほかの戦と同じく六m 内の旗を描く間だけ避ける
  enemySignMaxPixels: 20,   // 通し確認：密集した近い敵の赤い印が視界を覆わないよう、命中時も同じ上限にする。
  foeSignMaxPixels: 20,     // 実兵の頭上印も同じ上限にする（enemySignMaxPixels は軽い兵用）。
  goalSignNoEdge: false,     // 関所の3（kaito 11/9「ピンが始めから終わりまで切れずに出る」）：画面外の行き先も縁の▼で示す（隠すと流しの七割で印が消えていた。11/11 関所係）
  actionGuideTarget: () => null,
  missionSignTarget: () => null, // 敵の頭上の赤い▼以外の選択印を付けない。
  noLeaderFollow: true,   // 行き先は目標の印一つだけ（ついていく相手の青い印を重ねない。kaito AV 15）
  goalSignNoLabel: false,    // 行き先には曲輪と門の名を残す。
  quietArmyCalls: true,      // 11/18 クラウド（K358・写真）：本丸を攻める最中に「味方が追撃に移った」が真ん中に浮いた（備ひとつの崩れで出さない。姉川・稲生と同じ）
  goalSignTarget(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending) return null;
    if (!F.step) { SIGN.x = shutsujin.LINE.x; SIGN.z = shutsujin.LINE.z; SIGN.label = '先手の列'; return SIGN; }
    let x, z, label;
    if (F.step === 1) {
      // 11/18 夜50-12（act bot 683秒）：突き入った間宮が出丸の外の畝堀（-19,141）へ出ても、ピンは出丸の真ん中を指したままで、本人は二百秒出丸の内に立った。
      //   間宮が出丸の外（東の土塁より東）にいる間は、東の口を通って間宮その人を指す
      const mu = F.mamiya && F.dai?.units.find((u) => u.type === 'busho');
      if (mu && cnt(mu) && !mu.gone && mu.pos.x > -30) {
        if (p.x <= -29.5) { x = -27; z = 176; label = '出丸の土橋'; } else { x = mu.pos.x; z = mu.pos.z; label = '間宮康俊'; }
      }
      // 出丸の中心へ斜めに誘わず、先手が攻める土橋と柵を順に指す。
      else if (p.x > -30 && Math.abs(p.z - 176) > 3) {
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
      if (p.z > SHOJI.z1 + 2 && p.x > -31 && p.x < -11 && (p.z > 210.5 || p.x <= -27 && p.z > 183)) { x = p.z < 211 && p.x <= -27 ? -29 : -6; z = 213; label = '出丸の土橋'; }   // 11/18 土塁の外の帯からは堀の北の端を回る
      else if (p.z > SHOJI.z1 + 2 && p.x < -11) {
        x = Math.abs(p.z - 176) > 2 ? (p.x > -31 ? -26 : Math.min(p.x, -32)) : -6;   // 11/18 土塁の外からは土橋の口へ（土塁越しの西の口を指さない）
        z = 176; label = '出丸の土橋';
      } else if (p.z > SHOJI.z1 + 2 && Math.abs(p.x - CROSS_X) > 0.5) {
        x = CROSS_X; z = SHOJI.z1 + 10; label = '障子堀の畝';
      } else { x = CROSS_X; z = SHOJI.z0 - 5; label = '障子堀'; }
    }
    // 11/21 持ち主 クラウド（act bot 1080秒の刻限負け：門が開いて四十秒で本丸の段へ移った時、本人はまだ門の外（z 81）。印が枡形の中の点を指し、
    //   本人は馬出しの堀の前を（2〜10,81）で七百秒往復した）→ 本丸の段でも門をくぐるまでは大手の口・土橋・門の順に導く
    else if (F.step === 3 || (F.step === 4 && p.z > SP.at.gate.z - 1 && p.z < SHOJI.z0 + 2)) {
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
        const route = F.oteRoute || (F.oteRoute = (() => { const A = SP.at, M = A.mouths[1]; return [M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.gate, A.plaza].map((q) => [q.x, q.z]); })());   // K363：途中から続けた時は経路が戻らない
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
      // 11/18 クラウド（K358）：印が塀の向こうの点を指し続け、act bot が七百秒止まった。塀越しなら塀の無い隣の点へ（upRouteFix）
      i = upRouteFix(rt, p, i);
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
    playerAtkMax: 2,   // 11/15 クラウド：出丸・三の丸で四方から同時に打たれ、playerTaken .18 でも act・中学生が倒れ続けた。本人へ同時に打ち込むのは二人まで（八王子・高遠と同じ）
    unitNightScale: 0,   // 11/18 クラウド（iMac n-kwatch の検品）：前夜（夜明け前）の20秒、味方の兵だけが白く光って透けたように見えた（兵の夜の補光）。有岡・越前と同じく、兵も地面と同じ月光と篝火で照らす
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    // 障子堀・切岸で足場とカメラの高さを、実際に描く三角面に合わせる。
    // 四隅の補間のままでは、畝の脇で地面へ沈む・宙に立つ差が残る。
    terrainTriangles: true,
    // 人の背の何倍もある切岸（54°より急な所）には兵も主人公も立たない（critic60 山中 21「崖に兵が張り付いて宙に立つ」）。道と坂は通れる
    climbTan: 1.4,
    // 11/18 23:30 UTC 持ち主 クラウド（K150「守り手は近づく主人公を必ず狙う」）：act bot で城の鉄砲の傷が0〜4・出丸の十六挺が三十五m 内にいても本人を狙うのは0〜2挺。
    //   志賀と同じ共通の印で、射程の内の鉄砲・弓の三人に一人が動く本人も狙う（撃つ間・同時に構える数・塀の陰は共通の判定が絞る）
    playerRangedFocus: true,
    strictFireYieldM: 6,   // 目の前の本人には撃つ（立ち尽くし防止）
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

  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    shSide(!!rt.def?.sideFlip);   // K661：元の戦は豊臣が team 0（前と同じ）
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
        return m && far && ((F.step === 3 && !F.gateOpen) || F.step === 4) && r > 0 ? r * 0.5 : r; };   // 11/21 持ち主 クラウド（K582）：本丸の段も同じ（act bot が本丸の前で二十m 先の侍の矢に背から削られ575秒で倒れた）
      // 11/18 クラウド（K358）：松田との一騎討ち（soloFor）の間も、旗本の侍が脇から刃を入れて倒れた（act bot・侍145）。一騎討ちの間は松田のほかの刃を本人に通さない（矢弾と松田の一太刀はそのまま）
      const td3 = P.takeDamage; P.takeDamage = function (a, s) { const u = this.u, solo = u.soloFor, m = u.hitKind === 'gun' || u.hitKind === 'arrow';
        if (solo && solo.alive && s && !s.isStruct && s !== solo && s.team !== u.team && (!m || !s.pos || Math.hypot(s.pos.x - u.pos.x, s.pos.z - u.pos.z) > 8)) { u.hitKind = null; return 0; }   // 11/19 cloud-08：一騎討ちの間は北条の弓・鉄砲も手を止める（本丸の段で20〜30m 先の矢弾に削られ、main で act bot 0/4。間近の流れ弾は通す）
        return td3.call(this, a, s); }; } }
    const D = KURUWA.dai, HN = KURUWA.hon, NS = KURUWA.nishi;
    yield* YAMA_FIELD.castle(rt);   // K651：出丸の柵・三の丸の大手・障子堀の畝・櫓・本丸と二の丸の柵・旗（戦場を建てる所。北条編 h15 も同じ物を呼ぶ）
    toyoForces(rt);   // K661：豊臣方の先手と秀次の本陣（h15 は側を入れ替えて同じ関数を呼ぶ）
    yield* YAMA_FIELD.camp(rt);   // K651：秀次の本陣の幕・床几・幟（戦場を建てる所。北条編 h15 も同じ物を呼ぶ）
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
    mamiyaForces(rt);   // K661：岱崎出丸の間宮康俊の隊と竹束の後ろの鉄砲組（h15 は側を入れ替えて同じ関数を呼ぶ）
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：岱崎出丸 → 障子堀 → 三の丸の虎口 → 二の丸 → 本丸。
    //   段の守りは段に入ってから出て来るので、組は getter で渡す。今の段の守りだけが打って出て、奥は持ち場で構えて待つ
    const alive = (...gs) => gs.filter((g) => g && g.count > 0 && !g.routed);
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
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
    // 11/19 k41：前夜の三言（0.5〜13.7秒）と重なって字幕が13〜17秒遅れていた→戦の前の会話は朝になってから（十六秒）
    rt.after(16, () => { if (!rt.flags.ending) rt.say('豊臣秀次', '今日のうちに山中を揉み落とす。先手は岱崎出丸へ掛かれ', 4.5); });
    rt.after(21, () => rt.say('一柳直末', '北条の鉄砲は多いぞ。出丸の前で足を止めるな', 4));
    rt.after(25.4, () => rt.say('堀秀政', '我らは東の尾根から三の丸の横へ回る。挟んで落とすぞ', 3.5));
    // K355（漫画 sengoku_gonbee_16 から・自分の言葉）：関東の赤土は雨で粘り滑るが、掘った土塁は崩れにくい／土塁一面に梯子を掛ける総攻め
    rt.after(30, () => { if (!rt.flags.ending) rt.say('組頭', 'この赤土は濡れると滑る。足を取られるな、畝の筋を外すな', 3.5); });
    rt.after(44, () => { if (!rt.flags.ending && rt.flags.step <= 1) rt.say('足軽頭', '土塁は梯子で登れ。法螺が鳴れば、一面に掛けるぞ', 3.5); });
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
    F.dai.garrison = false;   // 出陣の段の持ち場の守りを解く（上の 11/18 21:10）
    rt.setPhase('dai');
    sfx('horagai', 0.8);
    rt.obj('main', '出丸の間宮康俊を討つ', 'main');   // 11/18 写真：「間宮｜康俊」と名の中で折れた。読点を外し一つの句に
    const D = KURUWA.dai;
    // 11/18 18:20 UTC 持ち主 クラウド（act bot POSLOG 三戦）：印「間宮康俊」が手勢の真ん中に立ち、間宮本人は六m 余り外。本人は印に着いても間宮に刃が届かず、出丸の段が百七十〜二百五十秒続いた。印は間宮本人に付ける（討たれたら手勢の真ん中）
    { const daiC = centerOf(F.dai); rt.marker('dai', () => { const m = F.dai.units.find((u) => u.type === 'busho' && u.alive && !u.gone); return m ? { x: m.pos.x, z: m.pos.z } : daiC(); }, '間宮康俊', { red: true, group: F.dai }); }
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
      // 11/18 クラウド（K358）：突き入りの手勢五十が先頭の本人一人へ揃って向かい、act bot が出丸の土橋で十秒で倒れた（8m 内に敵45〜57・狙う者30）。
      //   本人へ向かうのは間宮と五人に一人まで。ほかは本人の近く（12m 内）の寄せ手（一柳・中村の兵）へ当たる。斬られれば重いままで、群がる数だけ分ける
      if (enemy && enemy.isPlayer && u.type !== 'busho' && (u.slot || 0) % 5 !== 0) {
        const foe = rt.army.nearestEnemy(u, 60, (v) => !v.isPlayer && !v.isStruct && !v.fleeing && Math.hypot(v.pos.x - enemy.pos.x, v.pos.z - enemy.pos.z) < 12 &&
          !crossesDaiMoat(u.pos, v.pos) && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
        if (foe) return foe.pos;
      }
      if (enemy) return enemy.pos;
      if (bridgeMouth.s.alive !== false && bridgeMouth.s.hp > 0) return inside;
      if (u.pos.x < -30 && Math.abs(u.pos.z - 176) > 3) return bridgeWest;
      return daiApproach(u) || bridgeEast;
    };
    F.dai.historicalOrders = true;
    F.dai.leaderAssault = true;   // 最期の突き入りを、将だけ後列へ戻る判断で止めない。
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
    const reserve = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 3; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x, z }; q.formation = 'yari'; q.width = 16; }; };  // 11/17 タ四：待機で一点に重なる（69組）のを、横を広げて散らす
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
    // 11/21 cloud-08（章の通し・携帯）：通しの身分（組なし）で出丸の斬り合いに命を削られたまま堀の縁の鉄砲の下へ入り、畝の上で倒れた（285秒）。出丸を取ったら一息（大手の段と同じ六割まで）
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    if (rt.player?.u?.soloFor) rt.player.u.soloFor = null;   // 出丸の間宮との一騎討ちの印を次の段へ持ち越さない（11/19）
    tahoumen.step(rt, 2);
    // 生きた組頭がいても、制圧した出丸に踏みとどまらせない。
    if (!gone(F.dai)) { F.dai.noRout = false; F.dai.order = 'retreat'; F.dai.morale = 0; }
    // 11/18 15:30 UTC 持ち主 クラウド kaito2（act bot 描かず・POSLOG）：退く間宮の残兵四〜十九人が出丸の東の口（-34,175）に五十五秒居残り、
    //   本人がそれを追って障子堀の段が百三十秒に延びた。段に入って十五秒で、本人から十四m より遠い残兵は城の奥へ落ちた事にして消し、近い者は北へ退かせる
    rt.after(15, () => {
      const g = F.dai;
      // 崩れた隊は gone() が真になるので、残る者の有無で見る
      if (rt.flags !== F || F.ending || F.step !== 2 || !g) return;
      const p = rt.player.u.pos;
      for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 14) rt.army.despawn(u);
      if (g.units.some((u) => u.alive && !u.gone)) dropBehind(rt, g);
      // 出丸の東の口（幅の狭い土橋）で退く者が詰まって本人の通り道を塞ぐ（act bot：十四m 内の三〜四人が八十秒口に残った）。十五秒後には残りも落ちた事にする
      rt.after(15, () => { if (rt.flags !== F || F.ending || !g) return; for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); });
    });
    // 11/19 04:15 UTC 持ち主 クラウド kaito2（中学生 bot POSLOG 99〜124秒）：出丸が落ちても、出丸の北の物見櫓の守り（共通の perch）二人が櫓に残り、
    //   本人がそれを追って出丸の北の外（-13,212）へ迷い、印から百二十m 余りで三十秒何も無かった。出丸の六十m 内の櫓の守りは、出丸と共に退いた事にする
    for (const g of rt.army.groups) {
      if (g.team !== 1 || !/櫓の守り/.test(g.name || '') || gone(g)) continue;
      const c = g.center();
      if (Math.hypot(c.x - KURUWA.dai.x, c.z - KURUWA.dai.z) < 60) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    }
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
    F.rimFire = makeSamaFire(rt, [{ structs: F.rimWall, inside: { x: 10, z: SHOJI.z0 - 12 } }], { heads: false, near: 70, close: 15, base: 1.2, peak: 5, arrows: 0.45, hurt: 0.25, rain: 0.6, volley: 4 });
    // 11/18 22:10 UTC 持ち主 クラウド kaito2（中学生 bot POSLOG 186→280秒）：出丸から障子堀まで百十m を歩く間、敵も出来事も無く三十秒だった。
    //   出丸と堀の間で本人の二十五m 内に敵の無いまま五秒たてば、行く手の藪から間宮の手の残り（退き口の殿・鉄砲三・槍五）が打って出る（update の F.road）。
    //   初めは街道の東に据えたが、味方の寄せ手が先に崩し本人は会わなかった（中学生 bot POSLOG 98〜113秒）ので、本人の行く手に出す
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
      // 11/17 クラウド kaito2：act bot で山内一豊の隊40人が86秒に (11,200) の一点へ重なった（86組・2回）。
      //   一列の後ろの兵の持ち場は道の始まりより後ろへ伸びるが、道へ沿わせる処理（columnWay）が始まりの一点へ縮めていた。
      //   待っていた所の後ろ（南の坂、動ける端 236 の内）へ道を足し、後列が並ぶ筋を残す
      if (g === F.yama) {
        const bz = Math.min(c.z + 26, 228);
        g.path.unshift([c.x - 30, bz], [c.x, bz]);
        g.pathIdx = 3;
      }
      const arrive = g.onArrive = (q) => { q.order = 'assault'; q.assault = assault; q.seekRange = 30; };
      // 11/14 クラウドか：act bot で中村一氏の隊の頭（渡辺勘兵衛）が道の終わり (0,82) に着いたまま、出丸に残った一人を待って20秒止まった（14回）。
      //   道を歩き終えて十二秒待っても揃わない時は、着いた者から攻め掛かる（遅れた者は assault の寄せで後から続く）
      let doneAt = -1;
      const watch = () => {
        if (rt.flags !== F || F.ending || gone(g) || g.onArrive !== arrive) return;
        if (g.order === 'path' && g.path && g.pathIdx >= g.path.length) {
          if (doneAt < 0) doneAt = rt.t;
          else if (rt.t - doneAt > 12) { g.onArrive = null; arrive(g); return; }
        }
        rt.after(2, watch);
      };
      rt.after(2, watch);
    };
    // 11/17 タ四：act bot で馬上の堀秀政・中村一氏が障子堀の畝の先（35,103）(15,105) で330秒立ち尽くした（二回に一回）。畝は馬が渡れない。堀へ掛かる前に馬を下り、徒歩で畝を渡る（障子堀攻めは武将も下馬した）
    for (const g of [F.ichi, F.naka, F.yama, F.hori]) if (!gone(g)) for (const u of g.units) if (u.mounted && cnt(u) && !u.gone) rt.army.setMounted(u, false);
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
    // 11/14 クラウドか：障子堀の段で置かれた新手が大手の段まで本人の背を追い、act bot を倒した（532秒・傷の六割が新手）。
    //   堀を渡り切ったら、前の段の新手と出丸の残りは城の奥へ崩れて退く（大手の層は馬出し・堀の縁・三の丸の守り）
    rt.after(12, () => {
      if (rt.flags !== F || F.ending || F.step !== 3) return;
      for (const g of rt.army.groups) {
        if (g.team !== 1 || gone(g) || g.routed || !(g.isReserve || g.name === '新手' || g === F.dai)) continue;
        dropBehind(rt, g);
      }
    });
    tahoumen.step(rt, 3);
    // 11/18 クラウド kaito2（一枚表③）：本人が畝を先に渡ると、一列で渡る先手は九十m 後ろ（z 160〜175）に残り、大手の前で本人一人に見えた。
    //   五十m より遅れた先手は足を速め、堀の南に残る味方の新手も畝を渡って馬出しの前の口へ続く
    { const P = rt.player.u.pos; for (const g of F.toyo) if (!gone(g)) { const c = g.center(); if (Math.hypot(c.x - P.x, c.z - P.z) > 50) g.speed = 4; } }
    shinteFollow(rt, [[SP.at.mouths[1].lane.x, SP.at.mouths[1].lane.z]]);
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
      // 11/18 17:20 UTC 持ち主 クラウド kaito2（act bot 144秒・大手の段）：退く堀の縁の鉄砲が本人のそばで六秒なにもせず立った（打たない退き手のまま敵として数えられ、本人も迷う）。
      //   二の丸の守りの退きと同じく、退く間は逃げる者にする（本人も追わない）
      for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; }
      g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
    }
    rt.award((t) => t.side.push('障子堀を渡った'), '障子堀を渡った');
    rt.obj('main', '馬出しから出た北条の隊を迎え撃つ', 'main');
    F.hostUp(18, 30);
    // 北条氏勝の手（玉縄の援兵）は、間宮の勧めで出丸の戦の前に城を落ちている（間宮が「氏勝殿も直元も落とした」と言う）。
    //   障子堀の後に退く隊として出すと、退いた人の名札が本丸の前に残り、話の順も逆になった（critic60 山中 10）。ここでは出さない
    const A = SP.at, M = A.mouths;
    // 馬出しに詰める北条の隊（騎馬と槍）。寄せ手が来ると脇の口から打って出て、一柳の隊の横を突く
    F.uma = enemyGroup(rt, { faction: 'hojo', name: '馬出しの北条の隊', fixed: true, formation: 'yari', anchor: { ...A.uma }, facing: 0, width: 6, aggro: 4, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.25 },   // 11/15 クラウド：0.4 で act の倒れの傷の一番（131・110）が三回続いた
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
      when: (r) => { const u = r.player.u; if (!(r.flags.step === 3 && r.t - r.flags.stepT > 10 && u.alive && Math.hypot(u.pos.x - A.uma.x, u.pos.z - A.uma.z) < 46)) return false;
        // 11/18 クラウド（K358）：本人だけが堀を先に渡ると、馬出しの隊が一人の本人へ打って出て囲み、act bot が倒れた（描かずの通しで 15m 内の味方0〜5）。味方が寄るまで（25秒まで）待つ（長く待たせると堀の縁で背を撃たれ続けた）
        // 11/21 cloud-08（章の通し・携帯）：通しの身分（組なし）で本人が畝を先に渡り、25秒で打って出た馬出しの隊に一人で囲まれて倒れた（216秒）。味方を待つ間を45秒に
        if (r.t - r.flags.stepT > 45) return true; let n = 0; for (const q of r.army.units) if (q.alive && q.team === u.team && q !== u && Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z) < 25) n++; return n >= 8; },
      onOut: (r) => this.sally(r), onBack: (r) => this.sallyBack(r), onTsukeiri: (r) => this.openGate(r, true) });
    rt.marker('ote', { x: M[1].far.x, z: M[1].far.z }, '馬出し', { h: 3 });
    // 寄せ手は馬出しの左右の口の前へ（大手を攻める）
    const go = (g, P) => {
      if (gone(g)) return;
      // 本人が先に渡っても、後続の畝と対岸の口を飛ばさない。渡る間は一列を保つ。
      const crossing = g.units.some((u) => cnt(u) && !u.gone && u.pos.z >= SHOJI.z0 - 1);
      g.formation = 'column'; g.colW = crossing ? 1 : 2;
      // 先頭が岸に着いても後列は堀の中にいる。移動号令に替えると道が無効になり、
      // 堀秀政の後列が（35,103）から柵の口へ斜めに向かって止まる。
      continuePath(g, [[P.x, P.z]]);
      g.speed = 3;
      if (g === F.hori) g.retreatOnly = true;   // 11/17 ム三：堀秀政の隊が柵の前の敵に足を取られ20秒止まる。手の届く敵だけ払って進む
      g.onArrive = (q) => { q.retreatOnly = false; q.colW = 2; q.order = 'attack'; q.seekRange = 24; q.anchor = { x: P.x, z: P.z }; };
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
      if (g.order === 'path' && g.units.some((u) => cnt(u) && !u.gone && u.pos.z >= SHOJI.z0 - 1)) continue;
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
    // 11/18 クラウド kaito2（一枚表③ ✕：200秒の写真で味方65,640人なのに本人一人）：障子堀までに出た味方の新手（三組・五十人ほど）が
    //   堀の南（z≈120）で攻めの下知のまま残り、大手の段では本人の後ろ四十m に誰も続かなかった。先手と同じ畝を渡らせ、土橋から門へ続かせる
    shinteFollow(rt, pts);
    // 11/10 クラウド：馬出しへ戻った槍組が持ち場に固く据わったまま柵越しに突き続け、bot は構えたまま馬出しの北（16,85）で九分動けなかった。
    //   二十秒で馬出しの残りも土橋から門の内へ退き、三の丸で消える（「退く兵に続いて」入る形）
    rt.after(20, () => {
      const g = F.uma;
      // 付け入りで本人が先に三の丸へ入っても、後続の前に残兵を留めない。
      if (F.ending || F.step < 3 || !g || gone(g)) return;
      g.noRout = true; g.morale = 100;
      // 応戦で退路を止めず、寄せ手が退く兵に続いて門へ進めるようにする。
      g.fixed = false; g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true; g.order = 'path'; g.speed = 2.6;
      // 11/18 クラウド kaito2（act bot 299秒）：退く馬出しの侍が本人の脇を通る間、狙いも構えもせず六秒立った。三の丸の守りと同じく退く者として走らせる（背を討てる）
      for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; }
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
    // 11/18 15:30 UTC 持ち主 クラウド kaito2（act bot 1080秒・任務失敗）：門が開くとピンが消え、任務は「大手門から入る」のまま、
    //   本人は馬出しの南の外（5〜14,74）で九百秒迷った。開いた門の内（枡形の中）を指すピンを残す（本人が三の丸へ入れば段が替わって消える）
    rt.marker('gate', { ...SP.at.gate }, '大手門', { h: 3 });
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
      // 枡形の中心で迎撃へ替えると、兵が内門の脇へ散り、次の下知まで塀に残る。
      // 外門・枡形の中心・東の内門を順に通り、三の丸の道まで縦隊を保つ。
      continuePath(g, UP_ROUTE.slice(0, 4));
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
    }
  },

  // ④ 二の丸を抜け、本丸の松田康長の旗本を崩す
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    // 11/18 16:45 UTC 持ち主 クラウド（POSLOG）：開いた大手門のピン（10,48）が本丸の段の間ずっと残り、本丸へ登る本人の後ろを指していた（「三の丸へ入れば消える」はずが消す所が無かった）
    rt.unmark('gate');
    // 11/14 クラウドE：途中から続ける時（battle_checkpoint）は大手の門が閉じたままで、本人が門の前（10,49）で止まった。この段は門の内なので開けておく
    if (!F.gateOpen) { F.gateOpen = true; F.K.stayOpen = true; for (const G of [F.K.gate, F.K.masu && F.K.masu.inner]) if (G && G.struct && G.struct.alive !== false) { G.struct.opened = true; G.open && G.open(); } }
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
    // 11/16 クラウドさ：act bot の本丸の段が五〜八分半（895秒の戦の518秒）。松田康長の命 456 を削るのに四分かかり、本人は退いては登り直した。将の命を三割五分に（半ばでも本丸の段が八分。討つのは本人の刃のまま）
    if (F.honU && F.honU.maxHp) { F.honU.maxHp = Math.round(F.honU.maxHp * 0.35); F.honU.hp = Math.min(F.honU.hp, F.honU.maxHp); }
    F.honN = F.hon.units.length;
    // 11/19 クラウド29（司令塔の決め：城攻めの迫力・石落とし。山中は山城なのに登り道に上からの石が無かった）：
    //   二の丸と本丸の守りが生きている間、二の丸の虎口から三の丸への登り道と、本丸の虎口から二の丸への道へ石が転がる（共通の siege_rocks・一か所三つまで）
    if (!F.rocks) F.rocks = makeRockTraps(rt, { posts: [
      { id: 'ni', team: 1, stock: 3, interval: [16, 24], burst: 2, spread: 3, lane: [[16, -20], [17, -6], [19, 10], [19, 26]],
        active: () => F.step === 4 && !F.ending && !gone(F.ni) && rt.player.u.alive && rt.player.u.pos.z > -18 && rt.player.u.pos.z < 34 },
      { id: 'hon', team: 1, stock: 3, interval: [16, 24], burst: 2, spread: 3, lane: [[22, -80], [21, -68], [18, -58], [16, -46]],
        active: () => F.step === 4 && !F.ending && !gone(F.hon) && rt.player.u.alive && rt.player.u.pos.z < -44 && rt.player.u.pos.z > -82 },
    ] });
    // 建物を置くだけでは登り道へ撃たない。近くに守り手がいる柵だけ射撃する。
    F.okuFire = makeSamaFire(rt, [
      { structs: F.niWall, inside: { x: N.x, z: N.z } },
      { structs: F.honWall, inside: { x: H.x, z: H.z } },
    ], { heads: false, near: 65, close: 18, base: 0.8, peak: 4, arrows: 0.45, hurt: 0.2, rain: 0.3, volley: 4 });
    // 11/16 クラウドさ：印が旗本の真ん中（本丸の土橋の前・z -60〜-70）を指し、奥へ戻った康長（16,-95）に本人が四百秒届かなかった（act 1009秒）。印は康長その人に付ける
    { const hu = F.honU, hc = centerOf(F.hon); rt.marker('hon', () => (hu && cnt(hu) && !hu.gone ? { x: hu.pos.x, z: hu.pos.z } : slain(hu) ? { x: 24, z: -88 } : hc()), '松田康長', { red: true, group: F.hon }); }
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
    // 11/18 クラウド（K358）：二十秒の間に、門を抜けたばかりの本人が三の丸の守りの槍（一太刀40）を三つ受けて倒れた（act bot 450秒）。四秒で退かせ、退く間の打ち込みは二割に
    rt.after(4, () => {
      const g = F.san;
      if (rt.flags !== F || F.ending || F.step !== 4 || !g || gone(g)) return;
      g.dmgMult = (g.dmgMult ?? 1) * 0.2; for (const u of g.units) if (u.alive) { u.dmg = 0; u.fleeing = true; u.target = null; }   // 退く間は打たない（一太刀の床は dmgMult を見ない。fleeing の兵は攻めない）
      g.noRout = true; g.morale = 100; g.fixed = false; g.garrison = false;
      g.historicalOrders = true; g.noPursue = true; g.retreatOnly = true;
      // 11/18 05:20 クラウド kaito2（⑥ 260秒の写真：退く三の丸の守りが急な草の斜面を縦二列で登り、細い行列に見えた）：三列の塊で、登り道（UP_ROUTE）に沿って退く
      g.formation = 'column'; g.colW = 3; g.march = false; g.speed = 2.8; g.roadColumn = true; g.followColumnRoad = true;
      const c = g.center();
      g.order = 'path'; g.path = [[c.x, c.z], ...UP_ROUTE.slice(3, 6).map((p) => p.slice())]; g.pathIdx = 1;
      g.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
      // 三列にした分、二の丸の口で詰まって残らないよう、四十秒で本人から二十m より遠い者は奥へ消える
      rt.after(40, () => { if (rt.flags !== F || gone(g)) return; const pp = rt.player.u.pos; for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) > 20) rt.army.despawn(u); });
    });
    // 11/14 クラウドか：act bot は本丸の段で二回とも倒れた（676秒・960秒）。傷の三〜五割が前の段の残り（間宮の隊・馬出しの隊・新手）で、
    //   三の丸から本丸まで本人の背を追って旗本と挟んだ。大手が破れたら、前の段の残りと新手は城の奥へ崩れて退く（本丸の層は二の丸と旗本だけ）
    rt.after(12, () => {
      if (rt.flags !== F || F.ending || F.step !== 4) return;
      const keep = new Set([F.ni, F.hon, F.kogo]);
      for (const g of rt.army.groups) {
        if (g.team !== 1 || keep.has(g) || gone(g) || g.routed) continue;
        if (!(g.isReserve || g.name === '新手' || [F.dai, F.uma, F.pit, F.rim].includes(g))) continue;
        dropBehind(rt, g);
      }
    });
    // 開門時に既に内門を通る道を伝えている。通過済みの内門へ引き返させない。
    // 11/18 クラウド（K358）：寄せ手は二の丸の北（21,-66）で止まり、本丸の口（24,-84）で本人が一人になって旗本に倒れ続けた。口の手前（23,-77）まで上って並ぶ
    const route = UP_ROUTE.slice(F.gateOpenT === undefined ? 0 : 4, 8);
    for (const g of F.toyo) if (!gone(g)) { g.formation = 'column'; g.colW = 2; continuePath(g, route); g.speed = 3; g.march = false; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 14; q.anchor = { x: 23, z: -77 }; }; }
    // 11/18 クラウド（K358）：本丸の段に着く頃には先手四隊が五十人ほどに減り、本人が本丸の口で一人になって倒れ続けた（act bot・20m 内の味方2）。
    //   秀次の手から田中吉政の隊（史実：秀次の宿老として山中攻めに加わる）が大手門から続いて本丸へ上る。旗本の打って出は、この隊が口へ寄ってから（honGo）
    if (!F.tanaka) {
      const A0 = SP.at.gateOut;
      F.tanaka = allyGroup(rt, { name: '田中吉政の隊', fullStrength: true, anchor: { x: A0.x, z: A0.z }, facing: Math.PI, width: 8, aggro: 10, noRout: true, formation: 'yari' },
        dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, hat: 'kabuto_m', haori: 0x2f2c26 } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }], TOYO));
      const g = F.tanaka; g.formation = 'column'; g.colW = 2; g.march = false; g.speed = 3.2;
      continuePath(g, [[A0.x, A0.z], ...UP_ROUTE.slice(0, 8)]);
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 20; q.anchor = { x: 23, z: -77 }; };
      F.toyo.push(g);
      rt.after(3, () => { if (F.step === 4 && !F.ending) rt.say('田中吉政', '秀次様の手じゃ！　本丸へ続け、先手を一人で行かすな！', 3.5); });
    }
  },

  honSortie(rt) {
    const F = rt.flags, g = F.hon;
    if (F.honOut || !cnt(F.honU)) return;
    F.honOut = true;
    g.fixed = false; g.order = 'assault'; g.leaderAssault = true; g.aggro = 14; g.seekRange = 14;
    // 斜めに旗本を引くと本丸の柵と土橋脇の堀に詰まる。一人ずつ南口を通す。
    const exit = [{ x: 24, z: -94 }, { x: 24, z: -84 }, { x: 22, z: -80 }, { x: 21, z: -68 }];
    // 土橋を出た全員を同じ一点に留めない。二の丸の内側で三列に開き、
    // 後続と城将が口を抜けられる持ち場を、下知の時に一度だけ作る。
    let slot = 0;
    for (const u of g.units) if (cnt(u) && !u.gone) {
      u._honStand = { x: 21 + (slot % 3 - 1) * 2.5, z: -64 + Math.floor(slot / 3) * 2 };
      slot++;
    }
    g.assault = (u) => {
      const p = rt.player.u.pos;
      // 11/18 クラウド（K358）：一騎討ち（soloFor）の間は松田だけが本人に掛かれるのに、松田は二の丸の持ち場（_honStand）で立ち、本人は本丸の口で千八十秒の時間切れになった。松田は本人へ向かう
      if (u === F.honU && rt.player.u.soloFor === u) return p;
      if (p.z < -87 && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 20) {
        if (u.pos.z < -87) return p;
        return u.pos.z > -83 || Math.abs(u.pos.x - 24) > 1.5 ? exit[1] : exit[0];
      }
      if (u._honExit == null) u._honExit = u.pos.z < -87 ? 0 : u.pos.z < -80 ? 2 : 3;
      while (u._honExit < exit.length - 1 && Math.hypot(u.pos.x - exit[u._honExit].x, u.pos.z - exit[u._honExit].z) < 1.5) u._honExit++;
      if (u._honExit === exit.length - 1 && Math.hypot(u.pos.x - exit[3].x, u.pos.z - exit[3].z) < 1.5) u._honExit++;
      if (u._honExit >= exit.length) return u._honStand;
      return exit[u._honExit];
    };
    // 打って出た後の打ち込みは従来の強さを保つ。
    g.dmgMult = (g.dmgMult || 1) * 0.5;
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.3;
    rt.say('松田康長', '者ども、討って出るぞ！', 3);
  },

  win(rt) {
    if (rt.player?.u?.soloFor) rt.player.u.soloFor = null;   // 一騎討ちの印を残さない（11/18）
    const F = rt.flags;
    if (F.ending) return;
    // K652②（11/25 Sanae・kaito「全部の戦を10分ぐらいに」）：本丸が落ちても、松田康郷（康長の弟・「松田の赤鬼」）は城を落ち延びた（史実）。
    //   その落ち延びを守って本丸の奥に踏みとどまった松田の殿を討つ段を、落城の前に一つ挟む（F.hon をその殿に替え、本丸の段の道と bot の筋をそのまま使う）
    if (!F.k652Done) { if (F.k652T == null) this.rearGuard(rt); return; }
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['hon', 'gate', 'cross', 'dai', 'ote', 'uma']) rt.unmark(id);
    // 11/18 cloud-08（描いた act bot：任務で名を挙げた松田康長が討たれないまま戦が終わった）：本丸が落ちた時（旗本の崩れ・本丸の口の六十秒）に
    //   松田が生きていれば、本丸の中で寄せ手に討たれる（史実：松田康長は落城の時に討死）。斬り合いの途中で時間だけで殺すのではない
    { const mu = F.honU; if (mu && mu.alive && !mu.gone) {
      let k = null, kd = 40;
      for (const q of rt.army.units) if (q.alive && q.team === rt.player.u.team && !q.isStruct) { const d = Math.hypot(q.pos.x - mu.pos.x, q.pos.z - mu.pos.z); if (d < kd) { kd = d; k = q; } }
      mu.invuln = false; mu.officerSaved = true; mu.hp = 0; rt.army.kill(mu, k || rt.player.u); rt.banner?.('松田康長　討死');
    } }
    // 落城までは踏みとどまり、決着後は残兵を退かせる。敗走禁止のままでは締めの間も戦い続ける。
    for (const g of [F.dai, F.pit, F.rim, F.uma, F.san, F.ni, F.hon, ...(F.kogoOut ? [] : [F.kogo])]) if (g && !gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
    // 11/21 04:10 UTC 持ち主 クラウド kaito2（act bot 581秒・end）：本丸から打って出た松田の旗本の足軽が、本人から九十m 後ろの三の丸の上（16,6）⇔（14,0）を
    //   退く間に六m ずつ二十六度行き来して飛んだ（遠い兵の塀の押し戻し）。落城の後、本人から五十五m より遠い城方は山へ落ち延びた事にして消す（見える所の退く兵は残す）
    const farGone = () => { if (rt.flags !== F || rt.over) return; const P = rt.player.u.pos;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team !== rt.player.u.team && !u.isStruct && !u.civ && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 55) rt.army.despawn(u); };
    rt.after(1.5, farGone); rt.after(8, farGone); rt.after(16, farGone);
    // 11/18 クラウド kaito2（act bot 386秒）：本丸が早く落ちると、まだ登り道を縦一列で上る田中吉政の隊が二の丸の道（18,-26）で一点に重なって止まった。
    //   落城したら道の途中の寄せ手はその場で槍を揃えて止まる（行軍の道を打ち切る）
    //   止まる所はその場でなく、登り道の開けた点（三の丸の広場・二の丸の道）のうち近い所（その場だと三の丸の隅（4,28）で十組重なった・act bot 506秒）
    for (const g of F.toyo || []) if (!gone(g) && g.order === 'path') {
      const c = g.center(); let best = UP_ROUTE[3], bd = Infinity;
      // 11/18 クラウド kaito2（act bot 346秒）：(16,-20)・(21,-68) は二の丸の口（幅の狭い虎口）そのもので、山内一豊の隊十八人が口に詰まり十二組重なった。止まるのは開けた三の丸の広場か二の丸の内だけ
      for (const q of [UP_ROUTE[3], UP_ROUTE[5]]) { const d = Math.hypot(q[0] - c.x, q[1] - c.z); if (d < bd) { bd = d; best = q; } }
      g.onArrive = null; g.path = null; g.order = 'hold'; g.anchor = { x: best[0], z: best[1] }; g.formation = 'yari'; g.colW = undefined; g.width = 8;
    }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山中城を半日で落とした', pts: 24 }; }, '任務達成・山中城の本丸を崩した');
    sfx('kane', 0.5);
    // 11/19 クラウド29（司令塔の決め：城攻めの終わりの絵）：落城の後、味方の組が旗の下に集まり三度の勝鬨（army.celebrate＝本物の兵・字は出さない）
    rt.after(3, () => { if (!rt.over) rt.army.celebrate(rt.player.u.team); });
    rt.banner('山中城、落つ', '北条の西の守りは、半日で崩れた');
    // 戦の後の会話
    rt.say('豊臣秀次', F.ichiShot || F.ichiLost ? '一柳伊豆を失うたは痛い。されど山中は落ちた' : '山中は落ちた。先手の者ども、よく攻めた', 4.5);
    rt.after(6.5, () => rt.say('使番', '松田康長、討ち死に。一番乗りは渡辺勘兵衛！', 3.4));
    rt.after(16.5, () => rt.say(nm(rt), '北条の西の門は、開きました', 4));   // 11/19 k41：締めの台詞を字数どおりに離す（描かずの通しで569〜585秒に13〜16秒遅れた）
    rt.after(12, () => rt.say('豊臣秀次', '箱根を越えるぞ。小田原はもう目の前じゃ', 4));
    rt.player.u.invuln = true;
    // 余韻：曲輪ごとに豊臣の旗・箱根の向こうの小田原（t09_yamanaka/rakujo.js）
    // 11/18 20:30 UTC 持ち主 クラウド kaito2（中学生 bot：落城の後 三十秒 印も敵も無く「何をすればいいか分からない」）：
    //   余韻の最後の台詞（使番 21.5秒・三秒半）が終わってすぐに締める（rakujo.play の返す秒＋一秒）
    rt.finish({ scriptedEnd: true }, rakujo.play(rt) + 1);
  },
  rearGuard(rt) {
    const F = rt.flags, H = KURUWA.hon;
    F.k652T = rt.t;
    { const u = rt.player.u; if (u?.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.75); }   // 段の変わり目の一息（act bot：本丸の斬り合いの深手のまま殿に入り二十秒で倒れた）
    { const mu = F.honU; if (mu && mu.alive && !mu.gone) {
      let k = null, kd = 40;
      for (const q of rt.army.units) if (q.alive && q.team === rt.player.u.team && !q.isStruct) { const d = Math.hypot(q.pos.x - mu.pos.x, q.pos.z - mu.pos.z); if (d < kd) { kd = d; k = q; } }
      mu.invuln = false; mu.officerSaved = true; mu.hp = 0; rt.army.kill(mu, k || rt.player.u); rt.banner?.('松田康長　討死');
    } }
    // 本丸の旗本・旗本の輪・康郷の手・ほかの曲輪の残りは、落城の時と同じく退かせる（残すと殿と重なり本人が囲まれた・act bot 468秒）。康郷は落ち延びる
    for (const g of [F.dai, F.pit, F.rim, F.uma, F.san, F.ni, F.hon, F.kogo, ...rt.army.groups.filter((q) => q.team === 1 && q.taishoGuard)]) if (g && !gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
    F.hon = enemyGroup(rt, { faction: 'hojo', name: '松田の殿', anchor: { x: H.x + 6, z: H.z - 6 }, facing: 0, order: 'attack', aggro: 18, seekRange: 30, width: 8, morale: 100, noRout: true, formation: 'yari', fleeDir: { x: 0, z: -1 }, dmgMult: 0.2 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], HOJO));   // act bot：十五人が本人の上に出て十六秒で倒れた（449秒）→十人・打ち込み二割
    F.honN = F.hon.units.length;
    // 11/28 クラウド 山中の持ち主（act bot 携帯 974秒：殿の段に入って七十七秒で倒れた。寄せ手は本丸の口の手前（23,-77）に止まり、
    //   殿の十人が本丸の奥の本人一人を横から囲んだ（傷は殿の足軽 27〜28 が四つ）。康長を討った後は寄せ手も本丸へ踏み込む（史実：本丸は寄せ手の総掛かりで落ちた）。
    //   口（24,-84）は一つなので、本人に近い二隊だけを二列で通す（全隊を通すと口で重なって止まる）。殿の打ち込みも七割に
    for (const u of F.hon.units) if (u.type !== 'busho') u.dmg *= 0.7;
    { const P = rt.player.u.pos, d = (g) => { const c = g.center(); return Math.hypot(c.x - P.x, c.z - P.z); };
      const near = (F.toyo || []).filter((g) => !gone(g)).sort((a, b) => d(a) - d(b)).slice(0, 2);
      for (const g of near) {
        g.formation = 'column'; g.colW = 2; g.march = false; g.speed = 3.2;
        continuePath(g, [[24, -84], [25, -94]]);
        g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 22; q.colW = undefined; q.formation = 'yari'; q.anchor = { x: H.x + 2, z: H.z }; };
      } }
    rt.obj('main', '本丸の奥で、康郷の落ち延びを守る松田の殿を討つ', 'main');
    rt.say('中村一氏', '康長は討ったぞ！　……奥に、まだ槍を揃えて退かぬ者がおる', 3.5);
    rt.after(4, () => { if (!F.ending) rt.say('物見', '赤い具足の一騎が、北の崖から落ちていきます！　松田の赤鬼、康郷かと', 3.6); });
    rt.after(26, () => {
      if (F.ending || F.k652Done) return;
      F.hon2 = enemyGroup(rt, { faction: 'hojo', name: '殿の二の手', anchor: { x: H.x - 5, z: H.z - 2 }, facing: 0, order: 'attack', aggro: 18, seekRange: 30, width: 6, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.2 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], HOJO));
      rt.say('田中吉政', '櫓の陰から二の手じゃ！　康郷を逃がす気ぞ！', 3);
    });
  },
  // ⑥ の進み：殿と二の手が崩れれば落城（刻限は保険・敵の体力では延ばさない）
  rearTick(rt) {
    const F = rt.flags;
    if (F.k652T == null || F.k652Done || F.ending) return;
    const el = rt.t - F.k652T, live = (g) => (g && !gone(g) ? g.units.filter((u) => cnt(u) && !u.fleeing).length : 0);
    // 11/28 クラウド 山中の持ち主（act bot 携帯：K674 の続きの五段の後に殿の段が938秒から始まり、百五十秒の刻限の前に bot の1080秒で時切れ）：刻限を九十秒に
    if ((el > 45 && F.hon2 && live(F.hon) + live(F.hon2) <= 4) || el > 90) {   // 本丸の奥の縁に残った数人で段を止めない（act bot：二百秒の刻限まで残った）
      F.k652Done = true;
      for (const g of [F.hon2]) if (g && !gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
      this.win(rt);
    }
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
    if (F.rocks) F.rocks.tick(dt);
    this.rearTick(rt);   // K652② ⑥
    // 11/22 クラウド 山中城の持ち主（K564）：mem=4 の描かずの数えで 30秒 272・90秒 219・270秒 281（上限205）。記憶の少ない携帯だけ遠い・見えない持ち場の味方の兵を外す
    takatoMemCap(rt, dt, { skip: (g) => g.team === 1 && !g.routed });   // 城方（これから斬り合う間宮・三の丸・二の丸）は崩れる前は減らさない
    //   まだ越える時（180〜270秒 241〜256：三の丸・二の丸の守りと松田の旗本が出る段）は、本人について道を行く味方の組（山内一豊の隊四十三人など）のうち
    //   カメラの後ろで本人から二十m 外の名の無い徒の者を外す（一組二十人は残す・見えている前の兵と斬り合う者は減らさない）
    // 11/28 クラウド 山中城の持ち主（K564・台帳 4241）：iPhone の Safari は記憶の量を返さず MEM_BUDGET.real が空のため、上の予算が一度も効かず
    //   描かずの速回しで三の丸の段の入り（140秒 307）・本丸の段の入り（210秒 323）に目安の300を越えた。携帯は記憶の予算が無ければ300を上限にする
    const _yamCap = MEM_BUDGET.real || 300;
    if (_yamTouch && rt.army && rt.camera && rt.player?.u && (F._yamCapT = (F._yamCapT || 0) - dt) <= 0) {
      F._yamCapT = 3;
      let over = -_yamCap; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
      if (over > 0) {
        const me = rt.player.u.pos, cam = rt.camera.position, fw = rt.camera.getWorldDirection(new THREE.Vector3());
        //   退くだけの城方（三の丸の守り・馬出しの隊の retreatOnly）は、本人から四十m 外で斬り合っていない者から先に奥へ消える（前で斬り合う兵は減らさない）
        for (const g of rt.army.groups) {
          if (over <= 0) break;
          if (g.team !== 1 || !g.retreatOnly || !g.units) continue;
          for (const u of g.units) {
            if (over <= 0) break;
            if (!u.alive || u.gone || u.atk || u.name || u.type === 'busho' || Math.hypot(u.pos.x - me.x, u.pos.z - me.z) < 40) continue;
            try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ }
          }
        }
        for (const g of rt.army.groups) {
          if (over <= 0) break;
          if (g.team !== 0 || g.isPlayerSquad || !g.units || !(g.order === 'path' || g.order === 'move')) continue;
          const us = g.units.filter((u) => u.alive && !u.gone);
          for (let k = us.length - 1, n = us.length; k >= 0 && over > 0 && n > 20; k--) {
            const u = us[k], dx = u.pos.x - cam.x, dz = u.pos.z - cam.z;
            if (u.name || u.isSub || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho' || u.atk || (u.target && u.target.alive)) continue;
            if ((dx * fw.x + dz * fw.z) < -0.3 * Math.hypot(dx, dz) && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 20) { try { rt.army.despawn(u); over--; n--; } catch (e) { /* そのまま */ } }
          }
        }
        //   11/22 16:20 UTC 持ち主（K564 の残り：180秒 240・260秒 232）：三の丸の段に入る時、百m 外の斜面・堀の東・二の丸の脇で持ち場に立つだけの
        //   北条の城兵（五人ずつ六組）は崩れる前の城方として残っていた。本人とカメラから百m 外で、誰も斬り合わず狙いも無い組だけ三人まで減らす
        const far = (p) => Math.hypot(p.x - me.x, p.z - me.z) > 100 && Math.hypot(p.x - cam.x, p.z - cam.z) > 100;
        for (const g of rt.army.groups) {
          if (over <= 0) break;
          if (g.team !== 1 || g.routed || g.order !== 'hold' || !g.units || !/^北条の城兵/.test(g.name || '')) continue;
          const us = g.units.filter((u) => u.alive && !u.gone);
          if (us.length <= 3 || us.some((u) => u.atk || (u.target && u.target.alive) || !far(u.pos))) continue;
          for (let k = us.length - 1, n = us.length; k >= 0 && over > 0 && n > 3; k--) {
            const u = us[k];
            if (u.name || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho') continue;
            try { rt.army.despawn(u); over--; n--; } catch (e) { /* そのまま */ }
          }
        }
      }
    }
    // 11/22 クラウド 山中城の持ち主：act bot 454秒（落城の後）に味方の足軽と鉄砲が南の端 (45,237) へ押し出された（moveLim 236）→枠の三m 内へ戻す
    { const L = 233; for (const u of rt.army?.units || []) { if (!u.alive || u.gone || !u.pos || u.isPlayer) continue; const x = Math.max(-L, Math.min(L, u.pos.x)), z = Math.max(-L, Math.min(L, u.pos.z)); if (x !== u.pos.x || z !== u.pos.z) { u.pos.x = x; u.pos.z = z; u.warpedOnce = true; } } }
    // 11/18 16:30 UTC 持ち主 クラウド（act bot 606秒の回・217秒）：障子堀の段で敵の新手九人が堀の北の岸（13,85）に攻めの下知のまま
    //   一点に重なって止まった（堀の中の本人へ岸から下りられない）。北の岸の十m 内で十二秒ほとんど動かない新手は、その場を持ち場に槍を揃えて待つ
    if (F.step === 2 && !F.ending) {
      for (const g of rt.army?.groups || []) {
        if (g.team !== 1 || g.name !== '新手' || g._shojiBank || gone(g) || g.order !== 'attack') continue;
        const c = g.center();
        if (!(c.x > SHOJI.x0 - 6 && c.x < SHOJI.x1 + 6 && c.z > SHOJI.z0 - 10 && c.z < SHOJI.z0 + 1)) { g._bankT = 0; continue; }
        const L = g._bankAt; g._bankAt = { x: c.x, z: c.z };
        g._bankT = L && Math.hypot(L.x - c.x, L.z - c.z) < 0.5 * dt ? (g._bankT || 0) + dt : 0;
        if (g._bankT > 12) { g._shojiBank = true; g.order = 'hold'; g.fixed = true; g.anchor = { x: c.x, z: Math.min(c.z, SHOJI.z0 - 6) }; g.formation = 'yari'; g.width = 14; }
      }
    }
    // 退き口の殿（shoji の注）：出丸の土橋より東（x −8 より東）で、堀との間に本人の二十五m 内に敵の無いまま五秒たてば、行く手（堀の渡り口の方）十八m の藪から一度だけ打って出る。
    //   打ち込みは浅く（堀の縁の鉄砲と同じ）、本人が二十五m 北へ通り過ぎたか段が替われば退く
    //   11/19 01:10 UTC 持ち主 クラウド（中学生 bot 145秒：西寄りを歩くと x −8 の西で会わず印まで98m 何も無い三十秒）→出丸の南の外（z 158 より南）なら西寄りでも出る
    if (F.step === 2 && !F.ending && !F.roadDone && rt.army) {
      const pu = rt.player.u, p = pu.pos;
      if (p.z > SHOJI.z1 + 12 && p.z < 190 && (p.x > -8 || p.z < 158) && !rt.army.nearestEnemy(pu, 25, (o) => !o.fleeing && !o.isStruct)) F._roadT = (F._roadT || 0) + dt; else F._roadT = 0;
      if (F._roadT > 5) {
        const tx = CROSS_X - p.x, tz = SHOJI.z1 + 6 - p.z, L = Math.hypot(tx, tz) || 1, k = Math.min(18, L);
        const q = { x: p.x + tx / L * k + (tz / L) * 5, z: p.z + tz / L * k - (tx / L) * 5 };
        if (!inShoji(q.x, q.z, 4) && !SHOJI_DAI.some((d) => inShoji(q.x, q.z, 4, d)) && rt.world?.walkable?.(q.x, q.z) !== false) {
          F.roadDone = true;
          F.road = enemyGroup(rt, { faction: 'hojo', name: '退き口の殿', anchor: q, facing: Math.atan2(-tx, -tz), order: 'attack', aggro: 14, width: 10, morale: 45, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.35 },
            dress([{ type: 'gun', n: 3 }, { type: 'ashigaru', n: 5 }], HOJO));
          for (const u of F.road.units) if (u.type === 'gun') u.dmg *= 0.45;
          rt.say('中村一氏', '藪に伏せがおる！ 構えよ', 3);
        } else F._roadT = 0;
      }
    }
    if (F.road && !F.ending && !gone(F.road)) {
      const g = F.road, c = g.center(), p = rt.player.u.pos;
      if (F.step !== 2 || p.z < c.z - 25) { dropBehind(rt, g); F.road = null; }
    }
    // 11/18 21:20 UTC 持ち主 クラウド kaito2（中学生 bot 461秒・障子堀の段：味方の新手十一人が出丸の西の外（-69,153）で攻めの下知のまま行き先43m へ進めず二十一組重なった。
    //   本人が百十m 内にいるので下げる見張りに掛からない）：三十m 内に敵の無いまま十二秒ほとんど動かない味方の新手は、その場で槍を揃えて横に開く（重なりを解く）
    if (F.step >= 1 && F.step <= 3 && !F.ending) {
      for (const g of rt.army?.groups || []) {
        if (g.team !== 0 || g.name !== '味方の新手' || g._idleSpread || gone(g) || g.order !== 'attack') continue;
        const c = g.center(), u0 = g.units.find((u) => cnt(u) && !u.gone);
        if (!u0 || rt.army.nearestEnemy(u0, 30)) { g._spreadT = 0; continue; }
        const L = g._spreadAt; g._spreadAt = { x: c.x, z: c.z };
        g._spreadT = L && Math.hypot(L.x - c.x, L.z - c.z) < 0.5 * dt ? (g._spreadT || 0) + dt : 0;
        if (g._spreadT > 12) { g._idleSpread = true; g.order = 'hold'; g.fixed = true; g.anchor = { x: c.x, z: c.z }; g.formation = 'yari'; g.width = 12; for (const u of g.units) u.aiT = 0; }
      }
    }
    // 11/19 05:40 UTC 持ち主 クラウド kaito2（act bot 五戦の「止まり」：味方の新手十一〜十二人が道（path）の下知のまま堀の東（49,180）（32,173）（-10,121）で二十秒動かない・本人から六十m 余り外）：
    //   道を歩く味方の新手が本人の六十m 外で十五秒ほとんど動かなければ、陣へ下げる（目の届かない所で止まったまま残さない。出丸の内の新手と同じ）
    if (F.step >= 1 && F.step <= 4 && !F.ending) {
      const P = rt.player.u.pos;
      for (const g of rt.army?.groups || []) {
        if (g.team !== 0 || g.name !== '味方の新手' || gone(g) || g.order !== 'path') { if (g) g._pathIdleT = 0; continue; }
        const c = g.center(), L = g._pathIdleAt; g._pathIdleAt = { x: c.x, z: c.z };
        g._pathIdleT = L && Math.hypot(L.x - c.x, L.z - c.z) < 0.4 * dt ? (g._pathIdleT || 0) + dt : 0;
        if (g._pathIdleT > 15 && Math.hypot(c.x - P.x, c.z - P.z) > 60) { for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); }
      }
    }
    // 11/18 クラウド kaito2（act bot 361秒）：味方の新手十一人が大手の外（20,84）で道の次の点（22m 先）へ進めず、一点に三十六組重なって本丸の段の間ずっと止まった。
    //   道を歩く寄せ手が十六秒ほとんど動かず、近くに敵もいない時は、次の点が塀越しなら、塀越しでない先の点へ送る（塀は抜けない。前へ進めない時は何もしない）
    if ((F.step === 3 || F.step === 4) && !F.ending && rt.army?.wallBetween && rt.world) {
      F._jamT = (F._jamT || 0) + dt;
      if (F._jamT >= 4) {
        F._jamT = 0;
        const W = rt.world, at = (q) => ({ x: q[0], y: W.heightAt(q[0], q[1]), z: q[1] });
        // 11/22 07:30 UTC クラウド山中城の持ち主（act bot 167秒・大手の段）：攻めの下知の味方の侍が障子堀の升（13,103）で、
        //   行き先（19,86）との間の塀に押し付いて二十秒動かなかった（道の下知の隊だけを堀から上げていた）。
        //   道でない下知の味方も、堀の箱の中で十六秒半m も動かず本人から十五m より遠ければ、北の岸の同じ x へ上げる
        { const P = rt.player.u.pos;
          for (const g of rt.army.groups || []) {
            if (!g || g.team !== 0 || g.order === 'path' || gone(g)) continue;
            for (const u of g.units) {
              if (!cnt(u) || u.gone || u === rt.player.u) continue;
              const inBox = u.pos.x > SHOJI.x0 && u.pos.x < SHOJI.x1 && u.pos.z > SHOJI.z0 - 1 && u.pos.z < SHOJI.z1;
              const lp = u._pitP2; u._pitP2 = { x: u.pos.x, z: u.pos.z };
              const still = lp && Math.hypot(u.pos.x - lp.x, u.pos.z - lp.z) < 0.5;
              u._pitN2 = inBox && still && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 15 ? (u._pitN2 || 0) + 1 : 0;
              if (u._pitN2 >= 4) {
                u._pitN2 = 0;
                const x = u.pos.x + (Math.random() - 0.5) * 2, z = SHOJI.z0 - 2 - Math.random() * 1.5;
                if (W.walkable(x, z)) { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u._cpx = undefined; u.warpedOnce = true; u.moveTo = null; u.aiT = 0; u.mesh?.position.copy(u.pos); }
              }
            }
          } }
        for (const g of F.toyo || []) {
          // 下の「口で斬り合いに替えた」隊は、まわり二十m に敵が居なくなったら残りの道へ戻す
          if (g && g._jamRest && g.order !== 'attack') { g._jamRest = null; g._jamArrive = null; }   // ほかの下知（本丸へ掛かれ等）が来たら戻し先は捨てる
          if (g && !gone(g) && g._jamRest && g.order === 'attack') {
            const u1 = g.units.find((u) => cnt(u) && !u.gone);
            if (u1 && !rt.army.nearestEnemy(u1, 20)) { const rest = g._jamRest, arr = g._jamArrive; g._jamRest = null; g._jamArrive = null; continuePath(g, rest); g.onArrive = arr; }
            continue;
          }
          // 11/18 タ四：号令は道なのに行き先が無い隊（田中吉政の隊が出口（-4,53）で二十三人重なり・act bot 366秒）は、十二秒見て、近い登り道の点から本丸の口までの道を引き直す
          if (g && !gone(g) && g.order === 'path' && F.step === 4 && !(g.path && g.pathIdx < g.path.length)) {
            g._noDestN = (g._noDestN || 0) + 1;
            if (g._noDestN >= 3) {
              g._noDestN = 0;
              const c = g.center(); let bi = 0, bd = Infinity;
              UP_ROUTE.slice(0, 8).forEach((q, i) => { const d = Math.hypot(q[0] - c.x, q[1] - c.z); if (d < bd) { bd = d; bi = i; } });
              g.path = [[c.x, c.z]]; g.pathIdx = 1; g.formation = 'column'; g.colW = 2; g.march = false;
              continuePath(g, UP_ROUTE.slice(bi, 8));
            }
            continue;
          }
          if (g) g._noDestN = 0;
          if (gone(g) || g.order !== 'path' || !g.path || !(g.pathIdx < g.path.length)) { if (g) g._jamN = 0; continue; }
          // 11/18 17:30 UTC 持ち主 クラウド kaito2（act bot 478秒・大手の段）：堀秀政の隊の足軽一人が隊から離れ、障子堀の北の岸（行き先 15,89）で塀越しに二十秒動かなかった。
          //   隊の真ん中から十四m より離れ、十六秒で半m も動かず、本人から四十五m より遠い者は、堀の中で遅れたと見て消す（隊は先へ進む）
          { const gc = g.center(), P = rt.player.u.pos;
            for (const u of g.units) {
              if (!cnt(u) || u.gone || u.type === 'busho') continue;
              const lp = u._strayP; u._strayP = { x: u.pos.x, z: u.pos.z };
              const still = lp && Math.hypot(u.pos.x - lp.x, u.pos.z - lp.z) < 0.5;
              // 11/18 17:40 UTC：障子堀の畝の升（36,103）で行き先の二m 手前に二十秒止まった堀の隊の足軽（283秒）も、本人が堀を渡り終えて三十m より遠ければ同じに扱う
              const inPit = u.pos.x > SHOJI.x0 && u.pos.x < SHOJI.x1 && u.pos.z > SHOJI.z0 && u.pos.z < SHOJI.z1 && P.z < SHOJI.z0 - 2;
              // 11/19 06:55 UTC 持ち主 クラウド kaito2（act bot 280秒・大手の段）：堀秀政の隊の足軽一人が障子堀の北の岸（13,93）で行き先（13,89）との間の柵に押し付いて二十秒。
              //   隊の真ん中との間に柵があり、本人から二十五m より遠ければ、柵の外に取り残されたと見て同じに扱う
              const fenced = Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 25 && rt.army.wallBetween?.(u.pos, -1, gc);
              u._strayN = still && (Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 14 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 45 || inPit && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 30 || fenced) ? (u._strayN || 0) + 1 : 0;
              if (u._strayN >= 4) { rt.army.despawn(u); continue; }
              // 11/21 21:10 UTC クラウド山中城の持ち主（章の通しの act bot 229秒・大手の段）：山内一豊の隊の足軽二人が障子堀の縦の畝の上（10,96〜98）で
              //   行き先（10,89）の七m 手前から二十秒動かず（十九回）。本人が堀の三十m 内にいる時は上の消しが効かない。堀の箱の中で十六秒止まり、
              //   本人から十五m より遠い者は、北の岸の今の行き先へ上げる（塀越しや歩けない所なら何もしない）
              const inBox = u.pos.x > SHOJI.x0 && u.pos.x < SHOJI.x1 && u.pos.z > SHOJI.z0 - 1 && u.pos.z < SHOJI.z1;
              u._pitN = still && inBox && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 15 ? (u._pitN || 0) + 1 : 0;
              if (u._pitN >= 4) {
                u._pitN = 0;
                const tp = g.path[g.pathIdx], W9 = rt.world;
                if (tp && tp[1] < SHOJI.z0 && W9.walkable(tp[0], tp[1])) {
                  const x = tp[0] + (Math.random() - 0.5) * 2, z = tp[1] - Math.random() * 1.5;
                  if (W9.walkable(x, z)) { u.pos.x = x; u.pos.z = z; u.pos.y = W9.heightAt(x, z); u._cpx = undefined; u.warpedOnce = true; u.moveTo = null; u.aiT = 0; u.mesh?.position.copy(u.pos); }
                }
              }
            } }
          const c = g.center(), o = g._jamC; g._jamC = { x: c.x, z: c.z };
          if (!o || Math.hypot(c.x - o.x, c.z - o.z) > 0.8) { g._jamN = 0; g._jamK = 0; continue; }
          const u0 = g.units.find((u) => cnt(u) && !u.gone);
          // 11/18 クラウド kaito2（act bot 391秒）：山内一豊の隊が二の丸の口（17,-24）で守りと向き合ったまま道の下知で十六組重なり止まった。
          //   敵が十二m 内で十六秒動けない隊は、道を置いて斬り合う（片付いたら上で残りの道へ戻る）
          if (u0 && rt.army.nearestEnemy(u0, 12)) {
            if (++g._jamN >= 4) { g._jamN = 0; g._jamRest = g.path.slice(g.pathIdx).map((q) => q.slice()); g._jamArrive = g.onArrive; g.onArrive = null; g.order = 'attack'; g.seekRange = 16; g.anchor = { x: c.x, z: c.z }; for (const u of g.units) u.aiT = 0; }
            continue;
          }
          if (!u0) { g._jamN = 0; continue; }
          if (++g._jamN < 4) continue;
          g._jamN = 0;
          // 11/18 クラウド kaito2（act bot 476秒）：出丸の柵の北の外（-37,191）に回った新手五人が、柵と畝堀に挟まれて道を進めず重なり続けた。
          //   本人から百m 余り後ろで三度（四十八秒）止まった新手は、陣へ下げる（本人の目の届かない所で重なったまま残さない）
          if (g.name === '味方の新手' && (g._jamTot = (g._jamTot || 0) + 1) >= 3 && Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) > 110) { for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); continue; }
          const me = { x: c.x, y: W.heightAt(c.x, c.z), z: c.z };
          // 11/18 クラウドヘ五（act bot 541秒）：道の終わりの二m手前で新手七人が止まり、番号が進まないまま重なった。終わりの点が近い時は着いたと見て、着いた時の下知（寄せて攻める）へ切り替える
          if (g.pathIdx >= g.path.length - 1 && Math.hypot(c.x - g.path[g.path.length - 1][0], c.z - g.path[g.path.length - 1][1]) < 6 && g.onArrive) { g.pathIdx = g.path.length; g.onArrive(g); for (const u of g.units) u.aiT = 0; continue; }
          // 11/19 04:35 UTC 持ち主 クラウド kaito2（中学生 bot 511秒・本丸の段）：一柳直盛の隊九人が道の途中の点の一m 内（20,-21）で番号が進まず五組重なった。
          //   今の点の二m半内で十六秒止まった隊は、次の点へ送る（終わりの点で着いた時の下知が無ければ、その場で槍を揃えて止まる）
          { const cur = g.path[g.pathIdx];
            if (cur && Math.hypot(c.x - cur[0], c.z - cur[1]) < 2.5) {
              g.pathIdx++;
              if (g.pathIdx >= g.path.length) { if (g.onArrive) g.onArrive(g); else { g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.formation = 'yari'; g.width = 8; } }
              for (const u of g.units) u.aiT = 0;
              continue;
            } }
          // 11/18 タ四：塀越しでも無いのに止まる隊（田中吉政の隊が出口（-4,53）で十組重なり二分動かず・act bot）は、残りの道で列を組み直す（持ち場と足並み待ちを捨てる）。三度目の止まりから、二度に一度
          if (!rt.army.wallBetween(me, -1, at(g.path[g.pathIdx]))) { g._jamK = (g._jamK || 0) + 1; if (g._jamK % 2 === 0) { const rest = g.path.slice(g.pathIdx).map((q) => q.slice()); g.path = [[c.x, c.z]]; g.pathIdx = 1; continuePath(g, rest); } continue; }
          for (let j = g.pathIdx + 1; j < Math.min(g.path.length, g.pathIdx + 4); j++) if (!rt.army.wallBetween(me, -1, at(g.path[j]))) { g.pathIdx = j; for (const u of g.units) u.aiT = 0; break; }
        }
        // 11/18 夜50-12（act bot 511秒）：出丸の西の外（-63,175）に残った味方の新手十一人が、攻めの下知のまま行き先も敵も無く十六組重なり、本丸の段まで止まった。
        //   道を歩かない味方の新手が、本人から百十m 余り後ろで、三十m 内に敵の無いまま十六秒いれば陣へ下げる（上の道の詰まりと同じ扱い）
        for (const g of rt.army.groups || []) {
          // 11/19 02:20 UTC 持ち主 クラウド kaito2（act bot 281秒・本丸の段）：出丸の西（-62,175）の味方の新手十一人が道の下知のまま遠い作り（qualityAbstract）で八組重なった。
          //   本丸の段では、本人から百五十m 余り後ろの新手は道の途中でも陣へ下げる（城の内を登る本人の目には入らない）
          //   大手の段でも、出丸の内に残った（z 150 より南）百十m 余り後ろの新手は下げる（act bot 261秒 (-62,176) 十人・十一組）
          if (F.step >= 3 && g && g.team === 0 && g.name === '味方の新手' && !gone(g)) {
            const P = rt.player.u.pos;
            for (const u of g.units) if (cnt(u) && !u.gone && (F.step >= 4 ? Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 150 : u.pos.z > 150 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 110)) rt.army.despawn(u);
            if (gone(g)) { const i = F.toyo.indexOf(g); if (i >= 0) F.toyo.splice(i, 1); continue; }
          }
          if (!g || g.team !== 0 || g.name !== '味方の新手' || (g.order === 'path' && g.path && g.pathIdx < g.path.length) || gone(g)) continue;   // 道の終わった新手も（11/18 夜50-12：出丸の西 (-62,176) で道の下知のまま行き先無く二十五組重なった・521秒）
          const c = g.center(), u0 = g.units.find((u) => cnt(u) && !u.gone);
          // 11/18 18:10 UTC 持ち主 クラウド（act bot 401秒・大手の段）：組の半ばが先へ進み真ん中が本人の百十m 内に入ると、出丸の西（-62,176）に残った十二人が二十一組重なったまま下がらなかった。
          //   真ん中が近くても、本人から百十m 余り後ろで八秒ほとんど動かず三十m 内に敵の無い者は一人ずつ陣へ下げる
          if (u0 && Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) <= 110) {
            const P = rt.player.u.pos;
            for (const u of g.units) {
              if (!cnt(u) || u.gone || Math.hypot(u.pos.x - P.x, u.pos.z - P.z) <= 110) { if (u) u._farIdleN = 0; continue; }
              const lp = u._farIdleP; u._farIdleP = { x: u.pos.x, z: u.pos.z };
              u._farIdleN = lp && Math.hypot(u.pos.x - lp.x, u.pos.z - lp.z) < 0.8 && !rt.army.nearestEnemy(u, 30) ? (u._farIdleN || 0) + 1 : 0;
              if (u._farIdleN >= 2) rt.army.despawn(u);
            }
          }
          if (!u0 || Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) <= 110 || rt.army.nearestEnemy(u0, 30)) { g._idleFarN = 0; continue; }
          //   11/18 16:35 UTC 持ち主 クラウド（act bot 334秒の回・162秒）：馬出しの段の初めに出丸の西（-62,176）で九人が八組重なった＝十六秒待つ間に見張りに掛かる。八秒で下げる
          if ((g._idleFarN = (g._idleFarN || 0) + 1) >= 2) { for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); const i = F.toyo.indexOf(g); if (i >= 0) F.toyo.splice(i, 1); }
        }
      }
    }
    // 竹束の後ろの鉄砲組（K355）：出丸を落とした後、本人から七十m 離れたら陣へ下げる（目の届かない所で消す）
    if (F.sasae && F.step >= 2 && !gone(F.sasae)) {
      const c = F.sasae.center(), P = rt.player.u.pos;
      if (Math.hypot(c.x - P.x, c.z - P.z) > 70) { for (const u of F.sasae.units) if (u.alive && !u.gone) rt.army.despawn(u); F.sasae = null; }
    }
    // 11/18 08:40 UTC 持ち主 クラウド kaito2（act bot 695秒・終わりの後）：落ちる康郷の手の足軽が、寄せ手の詰まった本丸の口（24,-86）で
    //   押し出しに挟まれ（24,-83）⇔（23,-89）を六m 跳び続けた（十一回）。口の十m 内に八秒留まったら、寄せ手の中を抜けて落ちたと見て消す
    //   11/18 16:10 UTC 持ち主 クラウド（act bot 606秒の回・終わりの後 628秒）：組の真ん中は先へ抜けた康郷に引かれて口の十m 外になり、
    //   残った足軽一人が（22,-86）⇔（24,-92）を跳び続けた（二十一回）。真ん中でなく一人ずつ、口の十m 内に八秒留まった者を消す
    // 11/19 02:55 UTC 持ち主 クラウド kaito2（act bot 0239）：落城の後、脱出の下知の前に退き（retreat）に替わった康郷の手の足軽が（23,-89）⇔（24,-83）を跳んだ。終わりの後も同じく数える
    if ((F.kogoOut || F.ending) && F.kogo && !gone(F.kogo)) {
      for (const u of F.kogo.units) {
        if (!u.alive || u.gone) continue;
        //   11/18 17:10 UTC 持ち主 クラウド kaito2（act bot 583秒・終わりの後 597秒）：（22,-89）⇔（22,-96）を跳び続けた（二十八回）。-96 は口の十m の外で数えが毎回零に戻った
        //   → 口から十四m 内で数え、外へ出ても零に戻さず減らすだけにする
        u._kogoMouthT = Math.hypot(u.pos.x - 24, u.pos.z + 86) < 14 ? (u._kogoMouthT || 0) + dt : Math.max(0, (u._kogoMouthT || 0) - dt * 0.5);
        if (u._kogoMouthT > 8) rt.army.despawn(u);
      }
    }
    // 11/18 クラウド：広い戦場（wide_field）が布陣の表の「二の丸 北条氏勝」から、二人目の北条氏勝（討てない将）を二の丸に立て、act bot が斬っても傷がつかなかった。
    //   氏勝は出丸の戦の前に城を落ちている（shoshou.js）。二の丸の備は名の無い守りにする
    if (!F.wideUji && F.wide?.rows) { F.wideUji = true; for (const r of F.wide.rows) if (r.leaders?.includes('北条氏勝')) { r.leaders = r.leaders.filter((n) => n !== '北条氏勝'); r.name = '二の丸の備'; } }
    // 11/18 09:20 UTC 持ち主 クラウド kaito2（act bot 526秒：本丸の段で広い戦場の「二の丸の備」八人が attack のまま二の丸の口（16,-25）へ打って出て、
    //   本人の命を二十六秒で百→六十四へ削り、本人は三の丸（17,3）まで退いて手当てし本丸の段が二百秒に延びた）：
    //   城の内の北条の備は二の丸の守りと同じく、持ち場で迎え撃つ城兵（共通の寄せから外し、打ち込みも二の丸の守りと同じ五割五分）
    if (F.wide?.rows) for (const r of F.wide.rows) {
      const g = r.g;
      if (!g || g.team !== 1 || g._yamaHold || gone(g)) continue;
      g._yamaHold = true;
      const c = g.center();
      //   置き場の備（_far・stay）のままだと共通の engageNear が十八m 内の敵で攻めへ戻す（09:30 の流しでも attack のまま）。stay を外し、持ち場に据える（fixed）
      g.stay = false; g.fixed = true; g.garrison = true; g.historicalOrders = true; g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.aggro = 10; g.seekRange = 14;
      g.dmgMult = (g.dmgMult ?? 1) * 0.55;
    }
    // 11/14 K306（漫画くらい濃く）：前夜の場面。三月二十九日の夜明けに秀次の七万が箱根の坂へ並び、城の曲輪には北条の松明（史実の朝駆け）。
    //   夜明け前の陣中の篝火と声から始め、十六秒で朝へ移ろう。兵も札も足さない
    if (!F.zenyaSet && !F.ending) {
      F.zenyaSet = true;
      ZENYA.install(rt, {
        around: [[-5, 3], [5, 5], [0, 9]],
        fires: [[-46, 176], [-30, 182], [10, 52], [25, -96]],
        lines: [[0.5, '組頭', '夜明けに出丸へ掛かるぞ。間宮の鉄砲は手強いと聞く', 3.5],
          [5.5, '中村一氏', '曲輪じゅうに松明が見える。北条も寝ておらぬ', 3.5],
          [10.5, '足軽', '障子堀とやら、落ちたら上がれんらしいだがや', 3.2]],
        dawnAt: 16 });
    }
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
    // 11/18 ヘ五：討たれて一人二人になった先手の隊が、柵の前で350秒立ち尽くす（act bot 136〜486秒・一柳直盛の隊 n=1）。三十秒動かなければ、一番近い無傷の先手の隊の列へ入れて歩かせる。
    F._lone = F._lone || new Map();
    for (const g of F.toyo || []) {
      const live = gone(g) ? [] : g.units.filter((u) => cnt(u) && !u.gone);
      if (!live.length || live.length > 2 || rt.tracker.main) { F._lone.delete(g); continue; }
      const c = g.center(), m = F._lone.get(g);
      if (!m || Math.hypot(c.x - m.x, c.z - m.z) > 1.5) { F._lone.set(g, { x: c.x, z: c.z, t: rt.t }); continue; }
      if (rt.t - m.t < 30) continue;
      let best = null, bd = Infinity;
      for (const q of F.toyo) if (q !== g && !gone(q) && q.units.filter((u) => cnt(u) && !u.gone).length > 4) { const qc = q.center(), d = Math.hypot(qc.x - c.x, qc.z - c.z); if (d < bd) { bd = d; best = qc; } }
      if (best && bd > 8) { g.onArrive = null; g.order = 'move'; g.dest = { x: best.x, z: best.z }; g.speed = 3.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 14; }; }
      F._lone.set(g, { x: c.x, z: c.z, t: rt.t });
    }
    // 11/18 ヘ五：中村一氏の隊が assault のまま塀ごし（19m）で隊速0・11回（act bot 270秒）。四十秒ほとんど動かず assault なら、攻め先を捨てて近くの敵を探す攻めへ替える（その後の下知は上書きする）。
    F._asM = F._asM || new Map();
    for (const g of F.toyo || []) {
      if (gone(g) || g.order !== 'assault' || rt.tracker.main) { F._asM.delete(g); continue; }
      const c = g.center(), m = F._asM.get(g);
      if (!m || Math.hypot(c.x - m.x, c.z - m.z) > 2) { F._asM.set(g, { x: c.x, z: c.z, t: rt.t }); continue; }
      if (rt.t - m.t < 40) continue;
      g.order = 'attack'; g.seekRange = 30; g.assault = null; F._asM.delete(g);
    }
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
      // 11/18 クラウド kaito2（act bot 64秒）：出丸の鉄砲が弾込めの休み（fire 止め）の間、本人の二m 先で狙いも無く六秒立った。
      //   本人の三歩半内に寄った名無しの出丸の鉄砲は、休みの間も本人へ向かう（銃床・脇差で打ち合う）。槍・足軽まで向けると出丸の段が五分を超えた（act bot 二回）ので鉄砲だけ
      { const P = rt.player.u; if (P.alive && !P.noTarget && !gone(F.dai)) for (const u of F.dai.units)
        if (u.type === 'gun' && u.alive && !u.gone && !u.name && !u.fleeing && !u.target && !u.atk && !u.noTarget && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 3.5) { u.target = P; u.aiT = 0; } }
      // 十六挺が交互に本人を撃ち続けない。射撃六秒・弾込め十二秒の隙に先手が寄る。
      const firing = T % 18 < 6;
      if (F.dai.fire !== firing) {
        F.dai.fire = firing;
        if (!firing && T < 19 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60)
          rt.say('中村一氏', '鉄砲が止んだ！　土橋から出丸へ掛かれ！', 3);
      }
      if (!F.daiOn && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) {
        F.daiOn = true; F.dai.order = 'assault'; F.dai.seekRange = 30;   // 11/18 クラウド：attack では手勢の全員が先頭の本人を狙った。assault（F.dai.assault）で本人へ向かう数を分ける
        // 狭い出丸で横陣の後列を守らせると、近い寄せ手にも応戦せず止まる。
        // 接敵してから縦隊へ移り、後列も前へ続く。初めの布陣は保つ。
        F.dai.formation = 'column'; F.dai.colW = 3;
      }
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
      // 11/18 クラウド kaito2（act bot 232秒）：本人が印「間宮康俊」（手勢の真ん中）に着いても、一柳が撃たれる前は突き入りが始まらず、六秒なにも起きなかった。
      //   印の六m 内に四秒立てば、間宮が手勢を率いて突き入る（K175 着いたら必ず一つ起こす）
      { const c = F.dai.count > 0 && F.dai.center(); const at = c && T > 60 && Math.hypot(c.x - p.x, c.z - p.z) < 6;
        if (!at) F.daiAtT = null; else if (F.daiAtT == null) F.daiAtT = rt.t; }
      const atMark = F.daiAtT != null && rt.t - F.daiAtT > 4;
      // 11/18 クラウド kaito2（act bot 十戦：出丸の段 52〜361秒）：一柳が撃たれないままだと間宮の突き入りが二分半まで来ない。一分半で間宮が突き入る（一柳の討死はその後でも起きる）
      // 11/18 クラウド kaito2（act bot 二戦目）：本人が出丸の脇の土橋の東の端（間宮から18〜19m・出丸の真ん中から40m）で止まり、
      //   間宮は西の口で持ち場を守ったまま、出丸の段が四百二十秒続いた（間宮は味方が討った）。間宮の26m 内に合わせて二十秒いれば、間宮が本人へ突き入る
      if (mu && cnt(mu) && !mu.gone && T > 40 && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 26) F.muCloseT = (F.muCloseT || 0) + dt;
      const muClose = (F.muCloseT || 0) > 20;
      if ((F.ichiShot || F.ichiLost || T > 150 && !ichiShooter || T > 90 || atMark || muClose) && !F.mamiya && mu && mu.alive && F.dai.count > 0 && (muNear || T > 150 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 90) && (F.dai.count < F.daiN * 0.6 || T > 25)) {
        F.mamiya = true; F.mamiyaT = rt.t;
        F.dai.noRout = true; F.dai.morale = 100; F.dai.order = 'assault'; F.dai.seekRange = 60; F.dai.aggro = 40; F.dai.fixed = false;
        // 横陣の後列は敵が三〜六mへ来るまで持ち場を守る。突き入りの下知では後列も前へ出す。
        F.dai.formation = 'column'; F.dai.colW = 3;
        const escaped = F.ujikatsu && !F.ujikatsu.units.some((u) => u.alive && !u.gone);
        rt.say('間宮康俊', `${escaped ? '氏勝殿も直元も落とした。' : '氏勝殿と直元は北の道へ。'}白髪首を渡すは恥ぞ、墨で染めたわ。者ども、続け！`, 5);
      }
      // 最期は実際の攻撃で決める。柵の向こうで待つだけで四十秒後に命を尽かせない。
      // 突き入り前に本人が討った場合も記録し、討死と隊の崩壊を分けて数える。
      // 11/19 cloud-08（中学生 bot 770・1080秒：本人が出丸の印から七十〜百m 外で迷い、出丸の段が 448・788秒続いた）：
      //   段が四分を越えても間宮が生き、本人が出丸の九十m 外なら、寄せ手の一柳勢が間宮を討ち取る（敵の数・強さは変えない。K203 筋は進む）
      // 11/19 02:10 UTC 持ち主 クラウド kaito2（中学生 bot 1080秒の失敗：本人が間宮の45〜56m で届かず、九十m 内のため上の受け皿も出ず出丸の段が七百秒を越えた）：
      //   段が四分を越え、本人が間宮の十五m 内に四十五秒入らなければ、九十m 内でも寄せ手が間宮を討つ（K203 筋は進む。数・強さは変えない）
      if (mu && mu.alive && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 15) F.muNearAt = rt.t;
      const muFar = T > 150 && rt.t - (F.muNearAt ?? -1e9) > 45;   // 02:50 中学生 bot：命37で出丸の東 (12,194) に二百秒退いたまま（間宮まで四十m）。六分→四分・四十五秒
      // 11/22 09:20 UTC 持ち主 クラウド（act bot 携帯 648秒：本人が間宮の十五m を出入りし続け上の四十五秒が満ちず、出丸の段が329秒・戦が十一分）：段が四分半を越えたら、近くても寄せ手が間宮を討つ（数・強さは変えない）
      const muLate = T > 270;
      // 11/19 cloud-08（司令塔「刻限を詰める」）：九十m 外なら二分半で寄せ手が間宮を討つ
      if (!F.mamiyaDead && !F.muAllyKill && mu && mu.alive && (T > 150 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) > 90 || muFar || muLate)) {
        F.muAllyKill = true;
        const k = rt.army.nearestEnemy(mu, 80, (o) => !o.isStruct && !o.isPlayer) || rt.player.u;
        mu.invuln = false; mu.officerSaved = true; mu.hp = 0; rt.army.kill(mu, k);   // officerSaved：味方の手で倒した将を近習が救って立たせない（army.kill の officerStand）
      }
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
      // 11/14 クラウドか：act bot が出丸の真ん中 (-46,171) に立ったまま、間宮（最も近くて19〜24m）に届かず1080秒で刻限（三回に一回）。
      //   突き入り（または残兵の寄せ）から二十秒経っても間宮が生きていて、本人が出丸の内にいれば、間宮本人が突き入る（史実の最期：敵の中へ）
      if (F.daiLast && F.daiLastT == null) F.daiLastT = rt.t;
      const seekT = F.mamiyaT ?? F.daiLastT;
      // 11/18 05:25 クラウド kaito2（act bot 三戦：出丸の段が 367・483秒・ほかの回は 50〜200秒）：本人が出丸の真ん中から三十五m より外（東岸の二陣・土橋の東）にいると、
      //   間宮は持ち場の内で待ち続けた。段の二分半を過ぎ、本人が出丸の九十m 内にいれば、間宮が手勢を率いて突き入り、二分五十秒からは本人へ寄る（討つのは本人の刃のまま）
      // 11/18 08:25 UTC 持ち主 クラウド kaito2（act bot 八戦：出丸の段 52〜464秒・戦は 365〜795秒で七分を越す回が半ば）：本人へ寄るのを二分五十秒→二分五秒に
      // 11/18 17:10 UTC 持ち主 クラウド kaito2（act bot 287・416秒）：間宮が出丸の内（-35〜-40,168〜175）に居続け、本人は十m 内で味方と敵に挟まれ（寄8・速0）届かなかった。
      //   八m 内では寄らない決まりのため、間宮は持ち場に立ったまま。本人の十二m 内に十秒いれば、近くても間宮が本人へ寄る
      if (mu && mu.alive && !F.mamiyaDead && T > 40 && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 12) F.muStuckT = (F.muStuckT || 0) + dt;
      const muStuck = (F.muStuckT || 0) > 10;
      if (!F.daiSeek && !F.mamiyaDead && mu && mu.alive && (seekT != null || muStuck) && (rt.t - (seekT ?? rt.t) > 20 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 35 || muClose && F.mamiya || F.mamiya && T > 125 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 90 || muStuck) &&
          (Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) > 8 || muStuck)) {
        F.daiSeek = true;
        const pu = rt.player.u;
        const assault = F.dai.assault;
        F.dai.order = 'assault'; F.dai.fixed = false; F.dai.seekRange = 60; F.dai.aggro = 40;
        F.dai.assault = (u) => {
          // 手勢まで全員で本人を追わせず、周囲の寄せ手と戦わせる。
          if (u !== mu) return assault(u);
          if (!pu.alive) return null;
          // 対岸へ押し戻された本人へ、堀を斜めに横切って詰まらない。
          if (crossesDaiMoat(u.pos, pu.pos)) {
            const q = u._daiSeekWay || (u._daiSeekWay = { x: 0, z: 176 });
            if (u.pos.x < -30) { q.x = Math.abs(u.pos.z - 176) > 3 ? -32 : -6; return q; }
            // 11/19 06:45 UTC 持ち主 クラウド kaito2（act bot POSLOG：本人が土橋の東（-5,180）で手当て中、間宮が破れ口（-29,177）で七十秒行き来した）：
            //   破れ口の筋（z 176±3）に出たら西へ戻らず、そのまま土橋を東へ渡る
            q.x = Math.abs(u.pos.z - 176) <= 3 ? -6 : -32; return daiApproach(u) || q;
          }
          // 11/19 06:35 UTC 持ち主 クラウド kaito2（act bot POSLOG：間宮（-29,168）と本人（-26,173）が出丸の東の柵（x -28）を挟んで百秒睨み合い、
          //   どちらの刃も届かず出丸の段が 256秒）：柵が間にあれば、間宮は土橋に面した破れ口（-28,176）を通って本人へ出る
          if (rt.army.wallBetween?.(u.pos, -1, pu.pos)) {
            const w = u._daiGapWay || (u._daiGapWay = { x: -31, z: 176 });
            if (u.pos.x < -29.5) { w.x = -31; w.z = 176; if (Math.hypot(u.pos.x + 31, u.pos.z - 176) < 1.8) w.x = -25; }
            else { w.x = -25; w.z = 176; }
            return w;
          }
          return pu.pos;
        };
      }
      // 11/18 18:20 UTC 持ち主 クラウド（act bot POSLOG）：突き入りの後も間宮が本人の十〜二十m で狙いを持たずに三十秒余り立った（寄せの行き先が本人でも刃を向けない）。
      //   本人へ寄る下知の後は、二十五m 内なら間宮が本人を的にする（堀を挟む時は除く。討つのは本人の刃のまま）
      if (F.daiSeek && mu && mu.alive && !mu.gone && !mu.target && !mu.fleeing && rt.player.u.alive && !rt.player.u.noTarget &&
          Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 25 && !crossesDaiMoat(mu.pos, p)) { mu.target = rt.player.u; mu.aiT = 0; }
      // 11/18 20:10 UTC 持ち主 クラウド kaito2（18:40 の残り①：間宮が本人の二〜四m に六十秒いて、命159が減らない睨み合い）：
      //   本人へ同時に打つのは二人まで（playerAtkMax）で、まわりの足軽が枠を取り、間宮は順を待って回り込み続けた。本人の刃も手前の足軽へ。
      //   間宮が四m 内に八秒いれば、間宮が枠を先に取って打ちかかり、本人の三m 内で本人を狙う名無しの足軽は近くの寄せ手へ向き直る（間宮と一対一に）
      if (F.daiSeek && mu && mu.alive && !mu.gone && !mu.fleeing && rt.player.u.alive && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 4) F.muFaceT = (F.muFaceT || 0) + dt;
      else F.muFaceT = Math.max(0, (F.muFaceT || 0) - dt * 0.5);
      if (F.muFaceT > 8 && mu && mu.alive && !mu.fleeing && rt.player.u.alive) {
        const A = rt.army, pu = rt.player.u;
        mu.target = pu; mu.playerMeleeUntil = A.time + 1.2;
        if (!(F.muClearT > rt.t)) {
          F.muClearT = rt.t + 2;
          A.forNear(p.x, p.z, 3, (o) => {
            if (o === mu || !o.alive || o.team === pu.team || o.name || o.target !== pu) return;
            const foe = A.nearestEnemy(o, 8, (e) => !e.isPlayer && !e.isStruct);
            if (foe) { o.target = foe; o.playerMeleeUntil = 0; o.aiT = 0; }
          });
        }
      }
      // 11/19 06:20 UTC 持ち主 クラウド kaito2（act bot POSLOG 三戦：間宮が本人を的にして二〜五m に六十〜百三十秒いても命157〜159のまま。
      //   本人の刃はまわりの足軽へ行き、出丸の段が 250秒を越えて戦が七分を越えた）：本人へ寄る下知の後、間宮が二十m 内にいれば一騎討ち（共通の soloFor）。
      //   ほかの北条の兵は本人を狙わず寄せ手と斬り合う（本丸の松田康長と同じ。間宮の強さ・数は変えない）
      { const pu = rt.player.u;
        if (F.daiSeek && mu && cnt(mu) && !mu.gone && !mu.fleeing && pu.alive && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 20 && !crossesDaiMoat(mu.pos, p) && !rt.army.wallBetween?.(mu.pos, -1, p)) {
          if (pu.soloFor !== mu) { pu.soloFor = mu; if (!F.muDuelSaid) { F.muDuelSaid = true; rt.say('間宮康俊', '若造、この白髪首が欲しくば取ってみよ！', 3.5); } }
        } else if (mu && pu.soloFor === mu) pu.soloFor = null;
        // 一騎討ちにしても間宮（武将の受けは五〜七割）は命を一秒に一つほどしか減らさず、九十秒続いた（直した後の act bot 三戦）。
        //   七十三歳の老将は打ち合いが二十秒を越えると息が上がり、六秒ごとによろめく（よろめく間は受けられない。命・刃はそのまま）
        if (pu.soloFor === mu && cnt(mu) && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 6) F.muDuelT = (F.muDuelT || 0) + dt;
        if ((F.muDuelT || 0) > 20 && pu.soloFor === mu && cnt(mu) && !(F.muTireT > rt.t)) {
          F.muTireT = rt.t + 6; mu.stagger = Math.max(mu.stagger || 0, 1.2); mu.atk = null; mu.guarding = 0;
          if (!F.muTireSaid) { F.muTireSaid = true; rt.say('間宮康俊', 'ぬう……老いたか、息が続かぬ', 3); }
        }
        // 11/21 04:50 UTC 持ち主 クラウド kaito2（K481・act bot POSLOG 二戦：間宮の命が四割を切ってから本人が二〜五m にいても、
        //   命37→0 に九十六秒・命67→10 に六十秒かかり、出丸の段が百五十〜百七十秒になって戦が七分を越えた）：
        //   命が四分の一を切った間宮の十m 内に本人が合わせて二十秒いれば、深手の老将は力尽きて討たれる（本人の四m 内なら本人の手柄、遠ければ近くの寄せ手）
        if (cnt(mu) && !mu.gone && mu.maxHp && mu.hp < mu.maxHp * 0.25 && pu.alive && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 10) F.muLowT = (F.muLowT || 0) + dt;
        if ((F.muLowT || 0) > 20 && cnt(mu) && !mu.gone && !F.mamiyaDead) {
          const near = Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 4;
          const k = near ? pu : rt.army.nearestEnemy(mu, 40, (o) => !o.isStruct && !o.isPlayer) || pu;
          mu.invuln = false; mu.officerSaved = true; mu.hp = 0; rt.army.kill(mu, k);
        } }
      // 柵に誰も傷をつけられないまま本人が柵の前で戦い続ける時は、先手が柵を引き倒す（11/9 bot：出丸の前で13分止まり倒れた）
      // 11/18 夜50-12（act bot 525秒）：先手の隊の真ん中が出丸から四十五m より遠く柵が倒れず、柵の内の間宮（命1〜17）に本人が九十秒届かなかった。突き入りから二十秒たてば先手の位置によらず引き倒す
      if (!F.daiPulled && T > 45 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 45 && (F.toyo.some((g) => !gone(g) && Math.hypot(g.center().x - KURUWA.dai.x, g.center().z - KURUWA.dai.z) < 45) || (F.mamiya && rt.t - F.mamiyaT > 20)) && F.daiBridge.alive !== false && F.daiBridge.hp > 0) {
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
      // 11/14 クラウドE：間宮が討たれ出丸の札が〔済〕になっても、本人が東岸の二陣（12,194）で手当てしている間は段が進まず、
      //   障子堀の段まで三百三十秒立った（act 1028秒）。間宮の討死から二十秒たてば、出丸から七十m 内（東岸の二陣を含む）で制圧とする
      const daiD = Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z);
      // 制圧は実際の討死・戦力の崩れ・到達で決める。五分の経過だけで間宮を殺さない。
      // 段を替えた更新では戻り、前の段の経過時間を次の段へ持ち込まない。
      // 11/18 08:20 UTC 持ち主 クラウド kaito2（act bot 795秒：出丸の段 464秒。間宮は味方が討ち、本人は五十m 余り外で手当てと寄り直し）：
      //   討死から七十秒たっても段が替わらなければ、本人が百十m 内なら障子堀の段へ（柵は段の替わりで破れ、残りは崩れて退く）
      // 11/18 20:45 UTC 持ち主 クラウド kaito2（中学生 bot POSLOG：本人が出丸から三百m 外の山の隅（-236,-236）へ迷い出て、間宮の討死（474秒）の後も
      //   百十m 内に戻らず、印も無いまま出丸の段が六百九十一秒まで続いた）→討死から九十秒たてば、どこにいても障子堀の段へ（印が本人を連れ戻す。K203）
      const late = F.mamiyaDead && (rt.t - F.mamiyaDeadT > 35 && daiD < 110 || rt.t - F.mamiyaDeadT > 60);   // 11/21 K481：七十・九十秒→三十五・六十秒（出丸の段が百二十〜百八十秒）
      if (F.mamiyaDead && (enough && breached && (daiD < 30 || (daiD < 70 && rt.t - F.mamiyaDeadT > 20)) || late)) return this.shoji(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.cross.x, p.z - F.cross.z);
      rt.objProgress('main', `堀の向こうまで あと${Math.round(d)}m`);
      // 堀の縁の兵は縁を離れず、上がって来る寄せ手を縁で迎える（一人を追って堀へ降りない）
      if (!F.rimOn && p.z < SHOJI.z1 + 30) { F.rimOn = true; F.rim.seekRange = 12; }
      // 畝だけでなく対岸の柵（z0−3）の開口も抜けてから、馬出しへ向かう。
      // 柵の手前で段を替えると、右の集合点へ横切って生きた柵に突き当たる。
      // 11/18 22:20 UTC 持ち主 クラウド kaito2（中学生 bot POSLOG 423〜494秒）：柵の口を抜けた（10,86）で、印（10,85）の一m 手前を着いたと見て七十秒立ち、
      //   段は z 86 より北を待って替わらなかった。柵の線（z 87）を抜けて印の二m半の内なら渡り終えた事にする
      if ((p.z < SHOJI.z0 - 4 || (p.z < SHOJI.z0 - 3.4 && d < 2.5)) && d < 18) return this.ote(rt);
      // 11/19 cloud-08（司令塔「迷いの7分越えを縮めよ」・中学生 bot 635秒の回：障子堀の段が 236秒・討0）：
      //   六十秒で渡り始めていなければ中村一氏が一度呼び、百五十秒たてば寄せ手が畝を渡り切って馬出しの段へ（印が本人を連れて行く。K203）
      if (rt.t - F.stepT > 60 && !F.shojiCalled && p.z > SHOJI.z1) { F.shojiCalled = true; rt.say('中村一氏', '畝の上を渡れ！　堀の底へ落ちるな！', 3); }
      if (rt.t - F.stepT > 100) return this.ote(rt);   // 11/21 持ち主 クラウド kaito2（K481 山中城が491〜594秒で七分越え）：百五十秒→百秒
    }
    if (F.step === 3) {
      const gate = F.K.gate && F.K.gate.struct;
      const dg = Math.hypot(p.x - SP.at.gate.x, p.z - SP.at.gate.z);
      rt.objProgress('main', F.sub === 'back' ? `大手門まで あと${Math.round(dg)}m` : '');
      // 11/18 クラウド kaito2（act bot 166秒）：打って出る途中（号令 move・寄りの気3）の馬出しの侍が、本人の脇で六秒立った。
      //   退く者でない名無しの侍・騎馬は、四m 内の本人へ向き直る（出丸の鉄砲と同じ）
      // 11/19 08:45 UTC 持ち主 クラウド kaito2（act bot 263秒・号令 move の馬出しの侍が本人の三m半内で六秒立った）：迎え撃ちの寄り（yose）の間も同じく向き直る
      if ((F.sub === 'sally' || F.sub === 'yose') && F.uma && !gone(F.uma) && F.uma.order === 'move' && !F.uma.retreatOnly) {
        const P = rt.player.u;
        if (P.alive && !P.noTarget) for (const u of F.uma.units)
          // 11/18 08:25 UTC 持ち主 クラウド kaito2（act bot 329秒）：同じ打って出る途中の足軽も本人の脇で六秒立った。足軽も向き直る
          if ((u.type === 'samurai' || u.type === 'cavalry' || u.type === 'ashigaru') && u.alive && !u.gone && !u.name && !u.fleeing && !u.target && !u.atk && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 4) { u.target = P; u.aiT = 0; }
      }
      // 11/18 20:15 UTC 持ち主 クラウド kaito2（18:40 の残り②：大手の段の初め 248〜283秒に馬出しの隊の足軽が本人の背へ回り、受けた傷の背が半ば）：
      //   打って出た馬出しの隊の狙いは一柳の隊の横（史実）。本人の背（向きから百十度より後ろ）に回って本人を狙う名無しの足軽は、
      //   一人だけを残し、ほかは六m 内の寄せ手へ向き直る（背から囲まれて倒れる形を減らす。前と横からの斬り合いは減らさない）
      if ((F.sub === 'sally' || F.sub === 'yose') && F.uma && !gone(F.uma) && !(F.umaBackT > rt.t)) {
        F.umaBackT = rt.t + 1;
        const P = rt.player.u, fx = Math.sin(P.heading || 0), fz = Math.cos(P.heading || 0);
        let kept = 0;
        if (P.alive) for (const u of F.uma.units) {
          if (!u.alive || u.gone || u.name || u.fleeing || u.target !== P || u.type !== 'ashigaru') continue;
          const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz);
          if (d > 5 || (dx * fx + dz * fz) / (d || 1) > -0.34) continue;
          if (kept++ < 1) continue;
          const foe = rt.army.nearestEnemy(u, 6, (e) => !e.isPlayer && !e.isStruct && !e.fleeing);
          if (foe) { u.target = foe; u.playerMeleeUntil = 0; u.aiT = 0; }
        }
      }
      // 11/21 07:20 UTC 持ち主 クラウド（K582 の関所・act bot 5回に3回倒れた）：馬出し〜大手の段で本人の六m 内に本人を狙う城方が
      //   五人を超えて囲み（侍 90・足軽 154）倒れた。近い四人だけ本人を狙い、ほかは八m 内の寄せ手へ向き直る（前の斬り合いは減らさない）
      if (!(F.capT > rt.t)) {
        F.capT = rt.t + 0.5;
        const P = rt.player.u, near = [];
        if (P.alive) for (const u of rt.army.units) {
          if (!u.alive || u.gone || u.name || u.fleeing || u.isStruct || u.target !== P || u.team === P.team) continue;
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (d < 6) near.push([d, u]);
        }
        if (near.length > 4) {
          near.sort((a, b) => a[0] - b[0]);
          for (let i = 4; i < near.length; i++) {
            const u = near[i][1], foe = rt.army.nearestEnemy(u, 8, (e) => !e.isPlayer && !e.isStruct && !e.fleeing);
            if (foe) { u.target = foe; u.playerMeleeUntil = 0; u.aiT = 0; }
          }
        }
      }
      // 打って出た隊が皆討たれた時は、門へ攻め寄せる段へ
      // 11/12 クラウドさ：馬出しの隊が討ち尽くされず退きもせず、act bot は（21,88）で十二分撃ち続け刻限に掛かった。
      //   迎え撃ちが三分を超えたら、残る兵ごと門へ退かせて「退く兵に続く」段へ移す
      if ((F.sub === 'yose' || F.sub === 'sally') && (gone(F.uma) || rt.t - F.stepT > 75)) this.sallyBack(rt);   // 11/21 K481：百秒→七十五秒   // 11/19 cloud-08 司令塔「刻限を詰める」：三分→百秒（中学生 bot 馬出しの段 119〜145秒）
      if (!F.gateOpen && gate && (gate.alive === false || (gate.opened && F.K.tsukeiri))) this.openGate(rt, !!F.K.tsukeiri);
      // 本人と寄せ手が門へ詰めている間だけ数える。遠くで待つだけでは門を破らない。
      if (!F.gateOpen && F.sub === 'back' && dg < 40 && F.toyo.some((g) => g.units.some((u) => cnt(u) && Math.hypot(u.pos.x - SP.at.gate.x, u.pos.z - SP.at.gate.z) < 20))) {
        F.gatePress = (F.gatePress || 0) + dt;
        if (F.gatePress > 40) this.openGate(rt, false);   // 11/18 クラウド kaito2（act bot：大手の段が百秒・札が四十六秒変わらない）：七十秒→四十秒
      }
      // 11/19 01:20 UTC 持ち主 クラウド（中学生 bot 301秒：印「大手門」に着いても閉じた門の前で六秒何も起きない・K175）：
      //   門の十二m 内か「大手門」の印の十m 内に二秒半いれば寄せ手が掛矢で門を打ち始める声を一度、その後十五秒いれば門が破れる
      const opin = F.oteRoute && F.oteRoute[F.oteSign || 0], dop = opin ? Math.hypot(p.x - opin[0], p.z - opin[1]) : 99;
      if (!F.gateOpen && F.sub === 'back' && (dg < 12 || ((F.oteSign || 0) >= 4 && dop < 10))) {
        F._atGateT = (F._atGateT || 0) + dt;
        if (F._atGateT > 2.5 && !F._atGateSaid) { F._atGateSaid = true; rt.say('中村一氏', '掛矢を持て！ 門を打ち破れ！', 3); sfx('kane', 0.3); }
        // 11/19 04:45 UTC 持ち主 クラウド kaito2（中学生 bot 369秒：掛矢の声の後、門が破れるまで十二秒半なにも変わらない）：打つ音を三秒ごとに、八秒で門の軋みの声、十三秒で破れる
        if (F._atGateSaid && F._atGateT - (F._ramT || 0) > 3) { F._ramT = F._atGateT; sfx('gateMallet', 0.6); }
        if (F._atGateT > 8 && !F._atGateSaid2) { F._atGateSaid2 = true; rt.say('渡辺勘兵衛', '門が軋むぞ！ もう一打ちじゃ！', 2.8); }
        if (F._atGateT > 13) this.openGate(rt, false);
      }
      // 本人が門の前の三の丸の守りと斬り合い続け、寄せ手が門へ着けない時も、長くは止めない（11/9 bot：九分止まった）
      // 11/13 クラウドE：act bot は門の前で矢と新手に削られ、退く段だけで五分近く立ったまま倒れた（460秒）。待ちは九十秒まで
      if (!F.gateOpen && F.sub === 'back' && dg < 60 && rt.t - F.backT > 40) this.openGate(rt, false);   // 11/21 K481：六十秒→四十秒   // 11/18 クラウド kaito2：九十秒→六十秒（門の前で待つだけの間を縮める）
      // 三の丸の広場に入って果たす。時間で半径を広げると門の外でも達成してしまう。
      const dpz = Math.hypot(p.x - SP.at.plaza.x, p.z - SP.at.plaza.z);
      // 門の内側を実際に通ったことを記録する。曲輪の外の斜面へ回っただけでは果たさない。
      if (F.gateOpen && Math.abs(p.x - SP.at.gate.x) < 5 && p.z < SP.at.gate.z - 1 && p.z > SP.at.gate.z - 12) F.oteEntered = true;
      // 門外で長引いても、開門までを補い、入城そのものは本人の通過で確かめる。
      const backLate = F.sub === 'back' && F.backT != null && rt.t - F.backT > 240;
      if (backLate && !F.gateOpen) this.openGate(rt, false);
      // 11/19 cloud-08（司令塔「迷いの7分越えを縮めよ」・中学生 bot POSLOG：門が開いた後も本人が門の外二十〜三十m に八十秒立ち、段が百八十秒）：
      //   門が開いて六十秒たてば、寄せ手が三の丸へ流れ込み本丸の段へ（印が本人を連れて行く。K203）
      if (F.gateOpen && F.gateOpenT == null) F.gateOpenT = rt.t;
      if (F.gateOpen && rt.t - F.gateOpenT > 40 && !F.oteEntered) { rt.say('中村一氏', '三の丸は取ったぞ！　本丸へ続け！', 3); return this.honmaru(rt); }
      if (F.gateOpen && F.oteEntered && (dpz < 10 || (Math.hypot(p.x - KURUWA.san.x, p.z - KURUWA.san.z) < 30 && p.z < SP.at.gate.z - 3))) {
        // 開門だけでは名乗らず、本人が門を抜けて三の丸へ入った所で一番乗りを見せる。
        rt.say('渡辺勘兵衛', '中村が内、渡辺勘兵衛、一番乗り！', 3.5);
        return this.honmaru(rt);
      }
    }
    if (F.step === 4) {
      const g = F.hon;
      rt.objProgress('main', '');
      // 11/18 05:10 クラウド kaito2（⑥ 260秒の写真：本人のまわり二十m に味方が少なく、大軍の塊は右奥だけ）：
      //   大手門の外から続く田中吉政の隊は本人を追い越して本丸の口へ先に行っていた。本丸へ掛かる前は、本人の前後十m を一緒に上る（先なら足を緩め、後ろなら急ぐ）
      { const tg = F.tanaka;
        if (tg && !gone(tg) && !F.honOn && tg.order === 'path') {
          const c = tg.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
          tg.speed = c.z < p.z - 2 && d > 8 ? (d > 14 ? 0.5 : 1.2) : c.z < p.z - 2 ? 3.2 : 3.8;   // 1.6 未満は駆け足の床（battlePace）に上げられない
        } }
      // 11/19 07:20 UTC 持ち主 クラウド kaito2（⑥ 420秒の写真：本丸へ登る坂で本人のまわりに味方が一人も無い。描かずの数えで 400秒、
      //   本人が本丸の口に着いた時に一番近い味方の隊が二十九m 後ろ・新手と中村・堀・山内の隊は六十四〜百二十m 後ろ）：
      //   道（path）を登る味方の隊は、本人より二十m 余り後ろなら駆けて追い付き（毎秒4.4m）、本人より先なら駆け足のまま（3.4m）。
      //   描かずの数えで速さを上げても兵の歩みは毎秒0.4〜1.4m＝列の後ろ（二の丸の口・虎口の折れ）を待って先頭が止まっていた→登る間は列の伸びを十四m 多めに許す（共通の tailTol・木ノ芽峠と同じ）
      for (const q of rt.army.groups) {
        if ((q === F.tanaka && !F.honOn) || q.team !== rt.player.u.team || q.isPlayerSquad || q.isTomo || gone(q) || q.order !== 'path' || q.retreatOnly) continue;
        const c = q.center(), behind = c.z - p.z;
        if (behind > 150) continue;
        if (q._honBaseSp == null) q._honBaseSp = q.speed;
        q.speed = behind > 20 ? 4.4 : behind > 8 ? 3.8 : q._honBaseSp;
        q.tailTol = behind > 8 ? 14 : 0;
        // 11/19 08:20 UTC 持ち主 クラウド kaito2（act bot POSLOG 544秒：中村一氏の隊十二人が二の丸の口（16,-21）にいるのに、道の番号が本丸の口（22,-80）まで飛び、
        //   切岸越しの一直線へ向かって六組重なり止まった・381秒にも同じ所で重なり止まり）：登り道（UP_ROUTE）の今いる区間より先の点を向いた隊は、その区間の終わりの点へ戻す
        if (q.path && q.pathIdx > 0 && q.pathIdx < q.path.length) {
          let k = -1, kd = 6;
          for (let i = 3; i < 8; i++) { const [ax, az] = UP_ROUTE[i], [bx, bz] = UP_ROUTE[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / l2)), d = Math.hypot(c.x - ax - dx * t, c.z - az - dz * t); if (d < kd) { kd = d; k = i; } }
          const tp = q.path[q.pathIdx], m = k < 0 ? -1 : UP_ROUTE.findIndex((r, i) => i > k + 1 && r[0] === tp[0] && r[1] === tp[1]);
          if (m > 0) { const w = UP_ROUTE[k + 1]; for (let j = q.pathIdx - 1; j >= 0; j--) if (q.path[j][0] === w[0] && q.path[j][1] === w[1]) { q.pathIdx = j; for (const u of q.units) u.aiT = 0; break; } }
        }
        // 11/19 08:25 UTC 持ち主 クラウド kaito2（act bot POSLOG 430〜480秒：本人が本丸の口（27,-82）で旗本と斬り合う間、中村・山内・田中の隊三十余人が
        //   二の丸の口（16,-20）の手前二十m（z −6〜5）で五十秒余り進まず、本丸の味方が増えなかった）：本人から七十m 余り後ろ（坂と二の丸の塀の陰で見えない）で、
        //   二の丸の口の三十四m 内で口を目指したまま十二秒に二m も進まない隊（山内の隊は口の二十七m 手前（16,7）で五十秒）は、口の内の登り道（16,-26〜-44）へ縦に並べ直して次の点（16,-46）へ向かわせる
        if (q.path && behind > 55 && Math.hypot(c.x - p.x, c.z - p.z) > 70 && Math.hypot(c.x - UP_ROUTE[4][0], c.z - UP_ROUTE[4][1]) < 34 && c.z > UP_ROUTE[4][1] - 3) {
          const tp = q.path[q.pathIdx];
          if (tp && tp[0] === UP_ROUTE[4][0] && tp[1] === UP_ROUTE[4][1]) {
            if (!q._gjAt || Math.hypot(c.x - q._gjX, c.z - q._gjZ) > 2) { q._gjAt = rt.t; q._gjX = c.x; q._gjZ = c.z; }
            else if (rt.t - q._gjAt > 12) {
              const W = rt.world, F9 = rt.flags, lane = (F9._gjK = (F9._gjK || 0) + 1) % 2 ? 1.2 : 3.4; let n = 0;
              for (const u of q.units) if (u.alive && !u.gone) {
                const x = UP_ROUTE[4][0] + (n % 2 ? lane : -lane), z = UP_ROUTE[4][1] - 6 - (lane > 2 ? 0.8 : 0) - Math.floor(n / 2) * 1.6; n++;
                if (!W.walkable(x, z) || rt.army.wallBetween({ x: UP_ROUTE[4][0], y: W.heightAt(UP_ROUTE[4][0], z), z }, -1, { x, y: W.heightAt(x, z), z })) continue;
                u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u._cpx = undefined; u.warpedOnce = true; u.moveTo = null; u.aiT = 0; u.mesh?.position.copy(u.pos);
              }
              q.pathIdx++; q._gjAt = 0;
            }
          }
        }
      }
      if (!F.honOn && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < (T > 120 ? 80 : 50)) {
        F.honOn = true;
        // 11/13 クラウドE：本丸へ上った本人が旗本の鉄砲に背から撃たれ続けて倒れた（act 702秒・旗本の傷159）。上った時から旗本の鉄砲を半分に
        for (const q of g.units) if (q.type === 'gun') q.dmg *= 0.5;
        rt.say('中村一氏', '本丸へ掛かれ！　松田の旗を倒せ！', 3.5);
        for (const q of F.toyo) if (!gone(q)) { continuePath(q, UP_ROUTE.slice(7)); q.speed = 2.4; q.onArrive = (r) => { r.order = 'attack'; r.seekRange = 40; }; }
      }
      // 11/18 クラウド（K358）：本人だけが本丸の口（24,-84）へ先に着き、旗本二十余が一人の本人へ打って出て倒れ続けた（act bot・20m 内の味方2）。
      //   旗本が持ち場を離れて打って出るのは、寄せ手が本丸の口へ寄ってから（または一分十五秒を過ぎてから）。口の前の斬り合いはそのまま
      let honAllies = 0;
      if (F.honOn && !F.honGo) { const P = rt.player.u; for (const q of rt.army.units) if (q.alive && q.team === P.team && q !== P && Math.hypot(q.pos.x - 23, q.pos.z + 80) < 24) honAllies++; }
      // 11/19 02:45 UTC 持ち主 クラウド kaito2（中学生 bot 511秒で倒れた：段の四十五秒で旗本と康長が本丸から七十m 下の二の丸の口（14,-30）まで打って出て、登る途中の本人を囲んだ・武将の傷60）：
      //   四十五秒の打って出は、本人が本丸の口の四十五m 内に来てから（二分半で必ず）
      const pHonD = Math.hypot(p.x - 23, p.z + 80);
      if (F.honOn && !F.honGo && (honAllies >= 8 || T > 150 || T > 45 && pHonD < 45)) { F.honGo = true; g.fixed = false; g.aggro = 14; g.order = 'attack'; g.seekRange = 26; }   // 11/19 cloud-08：七十五秒→四十五秒
      // 11/10 クラウド：二の丸の守りと斬り合い・手当てを繰り返し、本丸の段だけで七分を越えて刻限に掛かった（act 1080秒）。
      //   六人未満か三分を過ぎたら二の丸の守りは本丸へ退き、道を空ける（11/16 クラウドさ：三分では本人が二の丸の前で退いては登り直し166秒かかった。百秒に）
      // 11/19 02:15 UTC 持ち主 クラウド kaito2（中学生 bot 二戦：三の丸から本丸の口まで百三十m を登る九十五秒、敵0・印は八十m 先のまま三十秒）：
      //   四十五秒で、本人が二の丸に着く前に守りが退いていた。退くのは本人が二の丸の四十m 内に十五秒いてから（act は四十五秒の頃に着くので同じ）・二分半で必ず
      if (F.ni && !gone(F.ni) && !F.niGive && Math.hypot(rt.player.u.pos.x - KURUWA.ni.x, rt.player.u.pos.z - KURUWA.ni.z) < 40) F.niNearT = (F.niNearT || 0) + dt;
      if (F.ni && !gone(F.ni) && !F.niGive && (F.ni.count < 6 || rt.t - F.stepT > 150 || rt.t - F.stepT > 45 && (F.niNearT || 0) > 15)) {   // 11/19 cloud-08：百秒→四十五秒（本丸の段が七分を越え、act bot の勝ちも850〜950秒）
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
        // 11/18 夜50-12（act bot 本丸の段 160〜195秒）：退く下知の後も二の丸の守りが打ち合いを続け、本人が二の丸の口（18,-22）で五十秒斬り合って命を半分削られた。
        //   三の丸の守りと同じく、退く間は打たない（逃げる者として本人も追わない）
        q.dmgMult = (q.dmgMult ?? 1) * 0.2; for (const u of q.units) if (u.alive) { u.dmg = 0; u.fleeing = true; u.target = null; }
        rt.say('中村一氏', '二の丸の兵が本丸へ退くぞ！　追って上れ！', 3.5);
      }
      // 11/18 17:20 UTC 持ち主 クラウド kaito2（act bot 三回とも：本丸の段で二の丸の口（17,-27）の広い戦場の「二の丸の備」八人に六秒で命を三割余り削られ、
      //   本人は三の丸（18,16〜27）まで下がって手当てし、登り直す往復が百五十〜百九十秒）：二の丸の守りが退く時、二の丸の口の三十m 内の北条の備も一緒に本丸へ退く（打たない）
      if (F.niGive && !F.wideNiGive && F.wide?.rows) {
        F.wideNiGive = true;
        for (const r of F.wide.rows) {
          const q = r.g;
          if (!q || q.team !== 1 || gone(q)) continue;
          const c = q.center();
          if (Math.hypot(c.x - 17, c.z + 27) > 30) continue;
          q.noRout = true; q.morale = 100; q.fixed = false; q.garrison = false;
          q.historicalOrders = true; q.noPursue = true; q.retreatOnly = true;
          q.formation = 'column'; q.colW = 2; q.march = false; q.anchor = { x: c.x, z: c.z };
          q.roadColumn = true; q.followColumnRoad = true;
          q.order = 'path'; q.speed = 2.8;
          q.path = [[c.x, c.z], ...UP_ROUTE.slice(5).map((p) => p.slice())]; q.pathIdx = 1;
          q.onArrive = (rr) => { for (const u of rr.units) if (u.alive && !u.gone) rt.army.despawn(u); };
          q.dmgMult = (q.dmgMult ?? 1) * 0.2; for (const u of q.units) if (u.alive) { u.dmg = 0; u.fleeing = true; u.target = null; }
        }
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
      // 守将が後列へ戻り続ける時は、命を削らず、南の虎口から実際に打って出させる。
      if (F.honOn && F.honU?.alive && !F.honOut) {
        if (Math.hypot(p.x - F.honU.pos.x, p.z - F.honU.pos.z) < 25) F.honNearT = (F.honNearT || 0) + dt;
        if (F.honGo && (T > 75 || F.honNearT > 15)) this.honSortie(rt);   // 11/18 クラウド：本丸の口で長く待つほど矢弾と槍で削られて倒れた（act bot・段は五分半）。一分十五秒で打って出させる
      }
      // 11/18 クラウド（K358）：松田が打って出た後、旗本二十余が本人一人へ揃って斬り掛かり、一太刀48が続けて入って倒れ続けた（act bot 本丸の段で8回中6回）。
      //   旗本が持ち場を離れてから、松田が本人の36m 内にいる間は、本人を狙えるのは松田だけ（一騎討ち・共通の soloFor）。旗本は寄せ手と斬り合う。松田の一太刀の重さはそのまま
      { const pu = rt.player.u, mu = F.honU;
        if ((F.honOut || F.honGo) && cnt(mu) && !mu.gone && Math.hypot(mu.pos.x - pu.pos.x, mu.pos.z - pu.pos.z) < 36) { if (pu.soloFor !== mu) { pu.soloFor = mu; if (!F.honDuelSaid) { F.honDuelSaid = true; rt.say('松田康長', 'その方、名を名乗れ。この康長が相手じゃ！', 3.5); } } }
        else if (pu.soloFor === mu) pu.soloFor = null;
        // 11/18 20:35 UTC 持ち主 クラウド kaito2（act bot 501秒：松田康長が号令 attack のまま本人のすぐそばで六秒なにもしない）：
        //   一騎討ちの間（soloFor）は、六m 内に三秒いれば松田が本人を的にして打つ枠を先に取る（間宮と同じ）
        if (pu.soloFor === mu && pu.alive && cnt(mu) && !mu.gone && !mu.fleeing && Math.hypot(mu.pos.x - pu.pos.x, mu.pos.z - pu.pos.z) < 6) F.honFaceT = (F.honFaceT || 0) + dt;
        else F.honFaceT = 0;
        if (F.honFaceT > 3) { if (mu.target !== pu) { mu.target = pu; mu.aiT = 0; } mu.playerMeleeUntil = rt.army.time + 1.2; } }
      // 11/19 k365-cloud-41（描かずの通し：松田康長が打って出てから討たれるまで五十秒無言）：康長の命の減りで二言
      { const mu = F.honU;
        if ((F.honOut || F.honGo) && mu?.alive && mu.maxHp) {
          const r = mu.hp / mu.maxHp;
          if (!F.honSay1 && r < 0.6) { F.honSay1 = true; rt.say('松田康長', '四千で七万を受けたのじゃ……北条の名、汚しはせぬ！', 3.5); }
          else if (F.honSay1 && !F.honSay2 && r < 0.3) { F.honSay2 = true; rt.say('中村一氏', '松田の足が鈍った！　今ぞ、討ち取れ！', 3); }
        } }
      // 討死は通常の攻撃で確かめる。刻限だけで康長を殺さない。
      // 11/18 21:30 UTC 持ち主 クラウド kaito2（中学生 bot 542〜614秒：本人が本丸の五十m 外にいる間に味方が康長を討ち、任務の札が〔済〕・印も消えたまま七十秒何も起きない）：
      //   討死の時刻は本丸へ上る前（honOn の前）でも取り、三十秒でどこにいても落城
      if (slain(F.honU) && F.honSlainT === undefined) F.honSlainT = rt.t;
      if (slain(F.honU) && !F.honOn && rt.t - F.honSlainT > 30) this.win(rt);
      if (F.honOn && slain(F.honU) && ((p.z < -87 && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 20) ||
          (rt.t - F.honSlainT > 20 && Math.hypot(p.x - 24, p.z + 84) < 60) || rt.t - F.honSlainT > 30)) this.win(rt);
      // 11/18 21:15 UTC 持ち主 クラウド kaito2（中学生 bot 1084秒の失敗：康長を味方が討った後、印が旗本の残りの真ん中（三の丸の広場）を指し、
      //   本人は本丸から離れて南へ下り、本丸に着かないまま刻限）：康長が討たれたら印は本丸の口へ・三十秒でどこにいても落城
      // 11/18 クラウド（K358・一つの戦は4〜7分）：本丸の段が五〜十分かかり、その長さで act bot が倒れ続けた。任務の札は「旗本を討つ」なので、
      //   旗本が三割五分まで討ち減らされ、本人が本丸の口（24,-84）の20m 内にいれば本丸は落ちる（松田を時間で殺さない・討ち減らすのは実際の斬り合い）
      // 11/19 cloud-08：本丸の段が六〜十一分（main の act bot 730〜1079秒）。旗本が打って出た後、本人が本丸の口（24,-84）の20m 内で
      //   合わせて六十秒持ちこたえたら、寄せ手が本丸へなだれ込む（史実の山中城は半日で落ちた・松田を時間で殺さない）
      if (F.honOn && F.honGo && cnt(rt.player.u) && Math.hypot(p.x - 24, p.z + 84) < 20) F.honMouthT = (F.honMouthT || 0) + dt;
      // 11/18 クラウド kaito2（act bot 十戦：本丸の段 140〜265秒・戦は 348〜760秒で七分を越す方が多い）：口で持ちこたえる六十秒を四十五秒に
      // 11/19 cloud-08（中学生 bot 1080秒の時切れ：本丸の段が 496→1080秒。本人は印から百十m 外で迷い、口に来なかった）：
      //   本丸の段が二分半を越えたら（司令塔「刻限を詰める」で五分→三分二十秒→二分半）、寄せ手が本丸へなだれ込む（K203 筋は進む・敵の数・強さは変えない）
      if (F.honStartT == null) F.honStartT = rt.t;   // 本丸の段（step 4）に入った時から数える。本人が八十m 内へ来ず honOn が立たない時も
      // 11/19 05:05 UTC 持ち主 クラウド kaito2（act bot 500秒：二分半の刻限が松田と本人の一騎討ちの最中（十八m）に来て、松田を味方が討ち
      //   「もっと強い奴と斬り合いたい」）：一騎討ち（soloFor）の間は刻限を三十秒延ばし、松田から本人へ打ちかかる（任務の「討つ」を本人の手に）
      //   本丸の口の四十五秒・旗本の崩れで落ちる時も同じ（act bot 505・522秒：松田を味方が十四〜十九m で討った）
      const honFallDue = rt.t - F.honStartT > 90 ||   // 11/21 K481：百五十秒→九十秒（act bot 本丸の段が百四十秒・戦が431〜509秒）
        (F.honOn && F.honGo && ((F.honMouthT || 0) >= 45 ||
        (F.hon && F.hon.count <= Math.ceil(F.honN * 0.35) && Math.hypot(p.x - 24, p.z + 84) < 20)));
      let honDuel = false;
      if (honFallDue && !F.ending && rt.player.u.soloFor === F.honU && cnt(F.honU) && !F.honU.gone) {
        if (F.honHoldT == null) F.honHoldT = rt.t;
        honDuel = rt.t - F.honHoldT < 20;   // 11/21 K481：三十秒→二十秒
        if (honDuel) { const mu = F.honU, pu = rt.player.u; if (mu.target !== pu) { mu.target = pu; mu.aiT = 0; } mu.playerMeleeUntil = rt.army.time + 1.2; }
      }
      if (!F.ending && cnt(rt.player.u) && rt.t - F.honStartT > 90 && !F.honFallSaid && !honDuel && Math.hypot(p.x - 24, p.z + 84) < 100) {   // 11/19 cloud-08：本人が本丸の口の百m 内にいる時だけ（何もせず出丸に立つだけで383秒に勝った・look 400秒）
        F.honFallSaid = true; rt.say('中村一氏', '寄せ手が本丸へなだれ込んだぞ！　本丸を乗っ取れ！', 3);
        this.win(rt);
      }
      if (F.honOn && F.honGo && !F.ending && !honDuel && cnt(rt.player.u) && (F.honMouthT || 0) >= 45 && !F.honFallSaid) {
        F.honFallSaid = true; rt.say('中村一氏', '寄せ手が本丸へなだれ込んだぞ！　本丸を乗っ取れ！', 3);
        this.win(rt);
      }
      else if (F.honOn && F.honGo && !F.ending && !honDuel && cnt(rt.player.u) && F.hon && F.hon.count <= Math.ceil(F.honN * 0.35) && Math.hypot(p.x - 24, p.z + 84) < 20) {
        if (!F.honFallSaid) { F.honFallSaid = true; rt.say('中村一氏', '旗本は崩れた！　本丸を乗っ取れ！', 3); }
        this.win(rt);
      }
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
// 11/21 cloud-08（章の通し）：本人は徒歩で（足軽大将の身分で馬上のまま出丸・障子堀・馬出しへ入り、通しの携帯で五回とも倒れた。位2の徒歩なら二回とも達成）
t09_yamanaka.playerOnFoot = true;
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
      // 11/19 03:20 UTC 持ち主 クラウド kaito2（act bot 1080秒・任務失敗：大手の段で本人が馬出しの前（5〜14,74）に九百秒いた）：
      //   土橋の手前（z≈60）から十四m 南へ下がる先が、馬出しの前の堀（z 74〜77・幅±9.5）の底になっていた。堀の外（z 80）で息を継ぐ
      if (F.step === 3 && Math.abs(b.botRestAt.x - SP.at.uma.x) < 11 && b.botRestAt.z > 70 && b.botRestAt.z < 79) b.botRestAt.z = 80;
      // 二つ前へ直進すると馬出しの柵や土橋の縁を横切る。折れを逆順に通って退く。
      if (F.step === 3 && F.sub === 'back' && b.botWp > 1) {
        b.botRestWp = b.botWp - 1;
        b.botRestEnd = b.botWp - 2;
      }
      // 本丸への退きも虎口と土橋を逆順に通る。回復後は退いた点から登り直す。
      // 11/15 クラウドか：段の替わり目（大手の土橋の上・10,51）で道の番号がまだ無いまま深手になり、十四m 南へ下がって土橋から堀の底（11,60）へ落ち、
      //   新手と矢に倒れた（act 590秒）。番号が無い時もここで近い折れを決め、門の内へ退く
      if (F.step === 4 && b.botUp === undefined) { let bi = 0, bd = Infinity; UP_ROUTE.forEach(([x, z], i) => { const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; bi = i; } }); b.botUp = bi; }
      if (F.step === 4 && b.botUp !== undefined) {
        b.botRestUp = Math.max(0, b.botUp - 1);
        b.botRestEnd = Math.max(0, b.botUp - 2);
      }
    }
    b.botRest = true;
  }
  // 休んでも矢玉の届く所で四十秒治らない時は、休みを打ち切って先へ進む（門の内へ入れば守りは退く）。
  if (b.botRest && (u.hp > u.maxHp * 0.85 || (F.step >= 3 && b.t - (b.botRestT ?? b.t) > 40 && u.hp > u.maxHp * 0.35) || (F.step === 3 && b.t - (b.botRestT ?? b.t) > 70))) { if (u.hp <= u.maxHp * 0.85) b.botRestNo = b.t + 30; b.botRest = false; b.botRestT = null; }
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
  // 11/14 クラウドさ：大手の段で、土橋の脇の堀（畝堀）の底の敵へ斬り掛かって土橋から落ち、堀の底（15,58）で四十秒矢弾を浴びて倒れた（act 562秒）。
  //   土橋の上・堀の外にいる間は、堀の底の敵を相手にしない（落ちた時は下で東の浅い岸へ上がる）
  const inOteMoat = (q) => q.z > 53.5 && q.z < 64 && q.x > -4 && q.x < 26 && Math.abs(q.x - SP.at.bridgeIn.x) > 1.8;
  // 11/18 夜50-12（act bot 272〜1080秒・失敗）：堀の東の端（26,64）は底でなく高さ1の乾いた斜面なのに「堀の中」とみなし、
  //   岸の点（24,66）へ柵ごしに歩き続けて八百秒止まった。本当に低い所（高さ0未満）だけを堀の中とする
  const meInMoat = F.step === 3 && inOteMoat(u.pos) && !(b.world?.heightAt && b.world.heightAt(u.pos.x, u.pos.z) > 0);
  const e = b.army.nearestEnemy(u, F.step === 2 ? 3.5 : 12, (o) => !o.fleeing && !o.isStruct && // 11/18 夜50-12（act bot 731秒）：突き入った間宮が出丸の脇の畝堀（-23,169）へ下り、堀の中の敵を相手にしない bot が二百秒近寄らず出丸の段が三百六十秒。
    //   突き入りから三十秒たてば、間宮その人だけは堀の中・堀越しでも追って討つ（遊ぶ人も印を追って堀へ下りられる）
    !(F.step === 1 && inUne(o.pos) && !(o.type === 'busho' && b.t - (F.mamiyaT ?? b.t) > 30)) &&
    !(F.step === 3 && !meInMoat && inOteMoat(o.pos)) &&
    !(F.step >= 3 && o.pos.z > SHOJI.z0 - 1 && o.pos.z < SHOJI.z1 + 1) && !(ign.get(o) > b.t) &&
    !(F.step === 1 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 2.4 && crossesDaiMoat(u.pos, o.pos) && !(o.type === 'busho' && b.t - (F.mamiyaT ?? b.t) > 30)) &&
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
      // 11/14 クラウドE：出丸の東の畝堀（x -28〜-11・土橋の外）にいる時に西の口（-32,176）へ斜めに向かい、堀の中で鉄砲と新手に倒れた（act 343秒）。
      //   堀の中では堀の筋に沿って近い岸（東は -6・西は -32）へ出てから土橋へ
      // 11/18 クラウド（K358）：出丸の土塁の外の細い帯（x -31〜-27・z 183 より北）は、南の土橋へ柵が二重に塞ぎ、東は畝堀の縁で、act bot が六百秒止まった。堀の北の端（z 213）を回って街道へ出る
      // 11/18 09:30 UTC 持ち主 クラウド kaito2（act bot 1080秒の時切れ）：出丸の内の南（-59,145）から同じ x のまま z 176 へ北上し、西の土塁の上（-62,176）で
      //   東へ抜けられず八百秒止まった。出丸の内で東の口より西にいる時は、まず口の内側（-38,176）へ寄せる
      // 11/18 夜50-12（act bot 1080秒）：突き入りの後、出丸の東の縁（-29,157）から口（-26,176）へ斜めに向かい、土塁に当たって九百秒止まった。縁の内（口より南）にいる時も、まず口の内側（-38,176）へ寄せる
      if ((u.pos.x < -40 || (u.pos.x < -28.2 && u.pos.z < 172)) && kNear(KURUWA.dai, u.pos.x, u.pos.z)[0] < KURUWA.dai.r + 3) goTo(p, inp, -38, 176, 1.5);
      else if (u.pos.x > -31 && u.pos.x <= -27 && u.pos.z > 183) goTo(p, inp, u.pos.z < 211 ? -29 : -6, 213, 1);
      else if (u.pos.z > 210.5 && u.pos.x > -31 && u.pos.x < -11) goTo(p, inp, -6, 213, 1);   // 堀の北の端の外は東の街道へ
      // 11/18 15:37 UTC 持ち主 クラウド kaito2（act bot 1080秒の時切れ）：間宮を南の畝堀の脇で討った後、土塁の外の南の帯（-29,155〜162）から
      //   土橋の口（-26,176）へ北上できず九百五十秒止まった。北の帯と同じく、南の帯は畝堀の南の端（z 137）を回って街道へ
      else if (u.pos.x > -31 && u.pos.x <= -27 && u.pos.z < 169 && u.pos.z > 139.5) goTo(p, inp, -29, 137, 1);
      else if (u.pos.z <= 139.5 && u.pos.z > 120 && u.pos.x > -31 && u.pos.x < -11) goTo(p, inp, -6, 137, 1);
      else if (u.pos.x > -29 && u.pos.x < -10 && Math.abs(u.pos.z - 176) > 5) goTo(p, inp, u.pos.x > -19.5 ? -6 : -32, u.pos.z, 1);
      // 11/18 クラウド（K358）：出丸の土塁の外（x -31〜-29・z 184）で西の口（-32）を目指すと土塁に当たり、act bot が八百秒止まった。土塁の外にいる時は土橋の口（-26,176）へ下りる
      else if (Math.abs(u.pos.z - 176) > 2) goTo(p, inp, u.pos.x > -31 ? -26 : Math.min(u.pos.x, -32), 176, 1);
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
      // 11/18 夜50-12（act bot 731秒）：間宮が東の土塁の外（畝堀 -23,169）へ下りると、出丸の内から土塁へまっすぐ歩いて二百秒止まった。東の口（-29,176）を通って寄る
      if (best && best.pos.x > -30 && u.pos.x < -28) { if (u.pos.x < -31 && Math.abs(u.pos.z - 176) > 2) goTo(p, inp, -33, 176, 1); else goTo(p, inp, -25, 176, 1); }
      else if (best) goTo(p, inp, best.pos.x, best.pos.z, 2);
    } else goTo(p, inp, target.x, target.z, target.label === '岱崎出丸' ? 3 : 1);
    return;
  }
  if (F.step === 3) {
    // 馬出しの右の口の前で待ち、打って出た隊と戦い、退く兵に続いて口・馬出し・土橋・門へ
    const A = SP.at, M = A.mouths[1];
    if (meInMoat) { goTo(p, inp, 24, u.pos.z > 61 ? 66 : 62, 1); return; }
    // 11/13 クラウドE：打って出た隊を口の前（堀の縁）で待つだけだと、馬出しの矢を浴びて一分足らずで倒れた（act bot・三回）。
    //   打って出たら、一番近い北条の兵へこちらから寄せる（十二m 内に入れば上の斬り合いが拾う）
    // 寄せの間（yose）も同じ：縁の口で待つと、本人を狙う矢弾だけを浴びる（act 311秒：縁で三十六秒に命の七割）
    if ((F.sub === 'sally' || F.sub === 'yose') && !gone(F.uma)) {
      // 11/18 15:25 UTC 持ち主 クラウド kaito2（act bot POSLOG）：馬出しの南西（4,82）から十五m 先の北条の兵（13,70）へ土塁と堀ごしに寄ろうとして、
      //   五十秒その場で止まった。十二秒ほとんど動けなければ、八秒だけ馬出しの右の口の前（M.far）へ回ってから寄り直す
      { const s = b.botUmaStuck ||= { x: u.pos.x, z: u.pos.z, t: b.t, until: 0 };
        if (Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 3) { s.x = u.pos.x; s.z = u.pos.z; s.t = b.t; }
        else if (b.t - s.t > 12) { s.until = b.t + 8; s.t = b.t; }
        if (b.t < s.until) { goTo(p, inp, M.far.x, M.far.z, 2); return; } }
      let best = null, bd = 45;
      for (const q of F.uma.units) if (q.alive && !q.gone && !q.fleeing && Math.abs(q.pos.y - u.pos.y) < 3 && !inOteMoat(q.pos)) { const dq = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z); if (dq < bd) { bd = dq; best = q; } }
      if (best) { goTo(p, inp, best.pos.x, best.pos.z, 2); return; }
    }
    if (F.sub !== 'back') { goTo(p, inp, M.far.x, M.far.z, 3); return; }
    // 11/19 03:30 UTC 持ち主 クラウド kaito2（act bot 1080秒・任務失敗）：退く兵に続く段で、命が満ちたまま大手の堀の東の縁（23,63）に四十秒以上
    //   押し当たって（slam）動けず、刻限まで止まった。馬出しの南でない所の止まりは見張りが無かった。十二秒ほとんど動けなければ、
    //   六秒だけ東の開いた地（27,70）へ離れてから、道の初めの口から回り直す
    { const s = b.botOteJam ||= { x: u.pos.x, z: u.pos.z, t: b.t, until: 0 };
      if (Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { s.x = u.pos.x; s.z = u.pos.z; s.t = b.t; }
      else if (b.t - s.t > 12 && !F.oteEntered && Math.hypot(u.pos.x - A.gate.x, u.pos.z - A.gate.z) > 8) { s.until = b.t + 6; s.t = b.t; b.botWp = 0; }
      if (b.t < s.until) { goTo(p, inp, 27, 70, 1.5); return; } }
    const W = OTE_ROUTE;
    b.botWp = Math.min(b.botWp || 0, W.length - 1);
    // 11/18 夜50-12（act bot 164〜1080秒・失敗）：馬出しの南の外（6〜14,74）で、馬出しの中の点へ土塁ごしに向かい左右に揺れたまま九百秒止まった。
    //   馬出しより南で二十秒ほとんど動けなければ、道の初めの口（東の脇の道）から回り直す
    // 11/18 15:30 UTC 持ち主 クラウド kaito2（act bot 1080秒）：左右に四m より大きく揺れて（5〜14,74）見張りが毎回戻り、九百秒止まった。道の点が進んだ時だけ戻す
    { const s = b.botOteStuck ||= { x: u.pos.x, z: u.pos.z, t: b.t, wp: b.botWp };
      if (s.wp !== b.botWp || u.pos.z < A.uma.z + 3) { s.x = u.pos.x; s.z = u.pos.z; s.t = b.t; s.wp = b.botWp; }
      else if (b.t - s.t > 20 && b.botWp > 0 && u.pos.z > A.uma.z + 3) { b.botWp = 0; s.t = b.t; } }
    // 口へ回る途中の迎撃や手当てで時間が過ぎても、通っていない折れは飛ばさない。
    // 時間だけで先へ送ると馬出しの正面の柵や堀へ向かい、最後の点まで進んだまま止まる。
    const wq = W[b.botWp], onBr = wq === A.bridgeOut || wq === A.bridgeIn;
    const dw = Math.hypot(u.pos.x - wq.x, u.pos.z - wq.z);
    if (dw < (onBr ? 1.0 : 2.5) && b.botWp < W.length - 1) b.botWp++;
    // 11/14 クラウドさ：土橋（幅4m）の口を二m 半の手前で「着いた」とし、そこから斜めに渡って橋の脇から堀へ落ち、
    //   堀の底（12,59）で三の丸の鉄砲に倒れた（描かずの跡 t526〜532）。橋の上は橋の筋（x=10）に揃えてから進む
    const nq = W[b.botWp];
    if ((nq === A.bridgeIn || nq === A.gateOut) && Math.abs(u.pos.x - A.bridgeIn.x) > 0.7 && u.pos.z > A.bridgeOut.z - 1.5) {
      goTo(p, inp, A.bridgeIn.x, Math.max(u.pos.z, A.bridgeOut.z + 0.3), 0.4); return;
    }
    goTo(p, inp, nq.x, nq.z, onBr || nq === A.bridgeIn ? 0.6 : 1.2); return;
  }
  // 味方が先に旗本を討ち取っても、本人が本丸へ着くまでは登り切る。
  if (F.step === 4 && F.hon) {
    // 枡形を折れて三の丸・二の丸の虎口を通り、本丸へ（近い点から先へ）
    if (b.botUp === undefined) { let bi = 0, bd = Infinity; UP_ROUTE.forEach(([x, z], i) => { const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; bi = i; } }); b.botUp = bi; }
    // 11/14 クラウドE：枡形を抜けて三の丸（12,39）へ出た後に、後ろの枡形の折れ（19,45）へ戻ろうとして門の内で十分往復した（act 1080秒・二回）。
    //   北へ上る道なので、本人より三m 以上南（後ろ）の折れは飛ばす
    while (b.botUp < UP_ROUTE.length - 1 && UP_ROUTE[b.botUp][1] > u.pos.z + 3) b.botUp++;
    b.botUp = upRouteFix(b, u.pos, b.botUp);   // 枡形の中で z だけで送ると南の塀越しの点へ向かって止まった（11/18）
    const [x, z] = UP_ROUTE[b.botUp];
    if (Math.hypot(u.pos.x - x, u.pos.z - z) < 2.5 && b.botUp < UP_ROUTE.length - 1) b.botUp++;
    if (b.botUp >= UP_ROUTE.length - 1) {
      // 康長が本丸の奥にいる時は、斜めに向かうと土塁の柵（11,-92）に突き当たって四分止まった（11/16 act 1080秒）。本丸の南口（24,-84）を通ってから寄る
      const hu = F.honU, t = hu && cnt(hu) && !hu.gone ? hu.pos : gone(F.hon) ? KURUWA.hon : F.hon.center();
      const inHon = (q) => q.z < -86 && Math.hypot(q.x - KURUWA.hon.x, q.z - KURUWA.hon.z) < 19;
      if (inHon(t) && !inHon(u.pos)) { if (u.pos.z > -83 || Math.abs(u.pos.x - 24) > 2) goTo(p, inp, 24, -83, 1); else goTo(p, inp, 24, -90, 1); return; }
      goTo(p, inp, t.x, t.z, 2); return;
    }
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
  // 11/18 cloud-08（60秒の写真）：手勢を四分の三討っても間宮が生きる間は段が進まないのに「150/150」と満ちて見えた。間宮が討たれるまでは一つ手前で止める
  return [Math.min(Math.floor((n - daiStanding(F.dai)) * 200 / n), F.mamiyaDead ? need : need - 1), need];
};
// 11/13 クラウドE：待つ備の新手（城攻めの層）が本丸の段で本人を囲み、act bot は三回とも新手の打ち込みで倒れた（与えた傷の六〜七割）。層は残し、打ち込みを半分に
t09_yamanaka.reserveDmgMult = 0.3;   // 11/15 クラウド：0.5 でも出丸の段で新手が act の倒れの傷の一番（82）だった
// 本丸の段（三の丸から上）は城の守り（二の丸・本丸の旗本）が層になる。新手はもう作らない（act bot は本丸の段で新手に四回倒れた）
// 11/14 クラウドか：大手（③）の段でも新手が背から本人を倒した（408秒・傷の六割）。新手は障子堀まで（③からは馬出し・三の丸の守りが層）
t09_yamanaka.reserveYield = (rt) => rt.flags.step >= 3;
// 新手は一戦で十二組まで（既定の二十四組では、城の内へ置ける新手が途切れず本丸の前で本人を囲み続けた。11/13）
t09_yamanaka.reserveLimit = 12;
// 出丸の攻めの間から二線を見せる（城攻めの既定の九十秒では、九十秒の時に本人の三十〜六十m の敵が二十人だった）
t09_yamanaka.reserveFrom = 40;
// 出丸の前は横が畝堀で、待つ備は横へずれて六十m より遠くに並んだ（九十秒：三十〜六十m に十三人・六十〜百m に八十一人）。少し手前に置く
t09_yamanaka.reserveDist = 38;
// 前を埋める新手（frontFill）も障子堀まで。大手・本丸の段では作らない（act bot：本丸の段の倒れで新手の傷が94）
t09_yamanaka.frontFillWhen = (rt) => (rt.flags.step || 0) <= 2;
// 11/14 夕：二分半で駆けさせると、出丸が長引いた回に十二組が次々に本人へ駆け、障子堀で倒れた（act 1042秒・新手の傷166）。駆けさせない
t09_yamanaka.reserveRelease = () => false;
// 前を埋める新手（depth_reserve.js frontFill）は行き先の印の 70m 内にだけ置く（11/14 クラウドゆ act bot：本人の向く先へ新手が置かれ続けて追い、
//   出丸の段 462秒・討ち取り123・本丸の段で松田康長に66m までしか近づけず1080秒で時切れ）
t09_yamanaka.reserveOk = (rt, p, foe) => {
  // 出丸は手勢二百を初めの間宮の隊で表す。補充は障子堀からに限る。
  // 出撃を止めるだけでは frontFill と近接時の出撃で新手が加わり続け、
  // 出丸の段が続いた回は新手の傷が九十二で倒れた（11/15）。味方の補充は残す。
  if (foe && (rt.flags.step || 0) < 2) return false;
  // 中心だけ歩けても、幅十八mの備の端が堀や柵へ入ると全員が一点へ寄せられる。
  // 敵味方とも隊の幅まで岸と障害物から離す。置き場の検査時だけ調べる。
  if (inShoji(p.x, p.z, 10) || SHOJI_DAI.some((s) => inShoji(p.x, p.z, 10, s))) return false;
  const y = rt.world.heightAt(p.x, p.z), probe = { pos: { y }, mounted: false };
  for (let dx = -9; dx <= 9; dx += 9) for (let dz = -9; dz <= 9; dz += 9) {
    const x = p.x + dx, z = p.z + dz;
    if (rt.world.walkable?.(x, z) === false || Math.abs(rt.world.heightAt(x, z) - y) > 3 || rt.army.solidBlocked?.(probe, x, z)) return false;
  }
  if (!foe) return true;
  let any = false;
  for (const m of rt.markers || []) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (!q || !Number.isFinite(q.x)) continue; any = true; if (Math.hypot(q.x - p.x, q.z - p.z) < 70) return true; }
  return !any;
};
withGuard(t09_yamanaka);

t09_yamanaka.holdUnstack = true;   // 11/19 夜50-15（act bot：521秒 end 山内一豊の隊17人が hold のまま (16,-17) に12組重なる★★）：共通の渦の散らし（depth_reserve.js holdUnstack）を使う。箕作・信貴山・今福と同じ形


// ---- K651（kaito 11/25「立場を入れ替えるだけでできる戦は全部の家でそうする」）：山中城の戦場を建てる所だけを出す ----
//   北条家編 h15 は yamanakaField(rt, { team: 0, fire: false }) を呼び、城の柵・門・塀を北条（守る側＝本人の側）の物として建てる。
//   元の豊臣の戦は setup の同じ所で castle(rt)・camp(rt) を呼ぶ（順も中身も前と同じ）。地形は YAMA_WORLD（world を descriptor ごと写す）
export const YAMA_FIELD = {
  *castle(rt, o = {}) {
    const W = rt.world, F = rt.flags, team = o.team ?? 1;
    const D = KURUWA.dai, HN = KURUWA.hon, NS = KURUWA.nishi;
    // ---- 岱崎出丸の柵（南と東へ向く。柵の内から間宮の鉄砲が撃つ。煙と弾は下の城攻めの部品が出す） ----
    F.daiWall = wallLine(rt, [[D.x - 16, D.z + 14], [D.x + 4, D.z + 18], [D.x + 18, D.z + 6], [D.x + 18, D.z - 10]], { team, hp: 300, name: '出丸の柵', segLen: 8 });
    // 柵はその場に固定し、兵の受け流し・押し返しへ入れない（柵には兵の pos が無い）。
    // 損傷と破壊は通常の構造物の処理で行う。
    for (const s of F.daiWall) { s.noClimb = true; s.bodyPadding = 0.3; s.pinT = Infinity; }
    // ---- 三の丸の大手（角馬出し・枡形・横矢・畝堀・狭間からの鉄砲）。出丸の柵からも撃つ（近づくほど弾が降る。kaito BA 5） ----
    F.K = buildSiege(rt, SP, { team, earth: true, wall: 'saku', umadashiWall: 'saku', wallHp: 520, gateHp: 460, masuHp: 600,
      fire: o.fire !== undefined ? o.fire : { hurt: () => (rt.flags.step === 1 ? 0.004 : 0.03), near: 90, close: 18, base: 0.8, peak: 4, rain: 0.3, volley: 4 },   // 寄せ手も撃たれて倒れるが、柵に着く前に一隊が消えない強さ
      extraWalls: [{ structs: F.daiWall, inside: { x: D.x - 2, z: D.z } }] });
    shojiRibs(rt);
    // ---- 城の建物（北条の土の城：板の櫓と柵だけ。天守閣は無く、本丸の北西の高まりに天守櫓） ----
    itaYagura(rt, HN.x - 9, HN.z - 9, { w: 6.4, d: 5.4, floors: 2, rot: 0.2 });   // 天守櫓
    // 本丸の土塁の内に柵を巡らせ、南の虎口だけ開ける。進む土橋を塞がない。
    F.honWall = wallLine(rt, [[20, -87], [9, -94], [7, -113], [20, -123], [39, -118], [43, -103], [35, -89], [28, -87]], { team, hp: 400, name: '本丸の柵', segLen: 6 });
    // 二の丸の虎口は開け、左右の柵の内から登り道へ横矢を掛ける。
    F.niWall = wallLine(rt, [[-1, -30], [8, -25]], { team, hp: 300, name: '二の丸の柵', segLen: 5 });
    F.niWall.push(...wallLine(rt, [[24, -25], [33, -30]], { team, hp: 300, name: '二の丸の柵', segLen: 5 }));
    for (const s of [...F.niWall, ...F.honWall]) { s.noClimb = true; s.bodyPadding = 0.3; }
    rt.scene.add(kabukimon(W, 24, -87, 8));
    itaYagura(rt, 32, -90, { w: 4, d: 3.5, floors: 1 });
    itaYagura(rt, NS.x - 6, NS.z + 4, { w: 5, d: 4.2, floors: 1, rot: -0.3 });        // 西櫓
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
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
    // 11/21 cloud-08（司令塔：天王寺の120秒と並べて薄い所＝中景。携帯の120秒の写真で馬出しから三の丸への坂がまばら）：K285 の内（兵は足さない）で旗の林を厚く。
    //   三の丸の塀の前に北条の幟の列（大手の口 x 0〜20 は空ける）・障子堀の南の縁に寄せ手の豊臣の幟の列
    for (let x = -34; x <= 54; x += 11) if (x < -4 || x > 24) rt.scene.add(nobori(W, x, SP.z + 7, 'hojo', 5.5));
    for (let x = -38; x <= 58; x += 12) rt.scene.add(nobori(W, x, 117 + (x % 24 ? 3 : 0), 'toyotomi', 5));
    // 一段厚く（司令塔：差が控えめ）：三の丸の塀の前の列の後ろにもう一列（高く）・坂の中ほど（z 70〜80）の両脇に北条の幟の群れ・堀の南の縁の後ろにもう一列
    for (let x = -30; x <= 50; x += 11) if (x < -4 || x > 24) rt.scene.add(nobori(W, x + 5, SP.z + 1, 'hojo', 7));
    for (const [x, z] of [[-36, 72], [-30, 78], [-24, 70], [44, 72], [50, 78], [56, 70]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
    for (let x = -32; x <= 52; x += 12) rt.scene.add(nobori(W, x + 6, 128, 'toyotomi', 6.5));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    rt.scene.add(tawara(W, HN.x - 9, HN.z - 4, 0.3, 3));
    for (const [x, z] of [[SP.x - 4, SP.z - 6], [SP.x + 5, SP.z - 10]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: 0.6 }); }
  },
  *camp(rt) {
    const W = rt.world;
    rt.scene.add(jinmaku(W, SEAT.x, SEAT.z, 16, 10, 3, { mon: 'toyotomi' }));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, Math.PI, { gunbai: true }));
    // 白地の幟が六尺の竿の上で木と同じ高さの白い板に見えた（critic60 山中 41）。人の背の倍ほどの丈へ
    // 通し確認：開始地点の左脇の一本は白い板に見えた。本陣の二本を残し、近すぎる重複を置かない。
    for (const [x, z] of [[34, 226], [54, 226]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 4));
  },
};
export function* yamanakaField(rt, o = {}) { yield* YAMA_FIELD.castle(rt, o); yield* YAMA_FIELD.camp(rt); }
// ---- K661（kaito 11/25「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：山中城の両軍の布陣を出す ----
//   toyo＝一柳・中村・堀・山内の隊と秀次の旗本・本陣（街道の坂の下）、mamiya＝岱崎出丸の間宮康俊の隊と竹束の後ろの鉄砲組。陣立ての表は YAMA_DEPTH(flip)。
//   側は t09_yamanaka/side.js の shSide（h15 は北条が team 0）
export const YAMA_ARMY = {
  toyo: toyoForces,
  mamiya: mamiyaForces,
  // 他家の戦（h15）用：元の戦では段（siegeStages）が豊臣の隊を出丸・堀・三の丸へ寄せる。筋書きの無い他家の戦では坂の下の持ち場で待つ
  hold(rt) {
    const F = rt.flags;
    for (const g of [...(F.toyo || []), F.hide, F.hideS, F.sasae]) {
      if (!g) continue;
      g.fixed = true; g.stay = true; g.order = 'hold'; g.noFrontline = true; g.noHunt = true; g.guard = true; g.noAllyGoal = true; g.aggro = Math.min(g.aggro ?? 6, 6); g.seekRange = 0;
    }
  },
};
export const YAMA_DEPTH = (flip) => sideDepth(t09_yamanaka.depth, flip);
export { SH as YAMA_SH, shSide as yamaSide };
export const YAMA_WORLD = t09_yamanaka.world;
// 行き先を置く物差し：曲輪（出丸・三の丸・二の丸・本丸・西の丸・北の丸）・三の丸の大手（SP）・障子堀・東海道・寄せ口
export const YAMA_AT = { kuruwa: KURUWA, sp: SP, shoji: SHOJI, shojiDai: SHOJI_DAI, road: ROAD, start: START, seat: SEAT, upRoute: UP_ROUTE };
export { t09_yamanaka };
export default t09_yamanaka;

import { toyotomiMore } from './toyotomi_more.js';
toyotomiMore(t09_yamanaka, 't09_yamanaka');   // K674：勝った後の続きの段（一戦10任務）
