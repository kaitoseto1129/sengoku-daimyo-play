// ======================================================================
// 豊臣編 11　八王子城の戦い（天正十八年 1590・六月二十三日の夜明け前）　激しい山城攻め
// 筋書きの正：docs/chapter2_toyotomi.md の「11. 八王子城の戦い」
// 城主の北条氏照は小田原に籠もり、城は城代の横地監物らと数千（女や子も多い）で守る。
// 前田利家・上杉景勝らおよそ一万五千が、霧の夜明け前に大手と搦手から攻め、一日で落とした。
// 主人公は城主として前田勢と大手から攻める。
// 段：①山下曲輪で近藤出羽守の組を討つ ②曳橋で、御主殿から打って出た北条勢を迎え撃つ ③退く敵に続き冠木門へ駆け込む（付け入り。docs/kaito_refs_1103 の山中城の型）
//     ④金子丸・高丸・小宮曲輪を落とす ⑤本丸で中山勘解由を討つ。手本と布陣・兵数は docs/battle_refs/t11_hachioji.md
// 経過時間だけでは敗北にせず、本人が中山を討ち、落城の終幕まで進める。
// 向き：北が -z、東が +x。東の城山川の谷（大手）から西へ攻め入り、川の北の御主殿、そこから北西の尾根を深沢山の本丸へ登る。
// 縄張りは castle_plan.js（曲輪・虎口・塀）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs の hachioji（asset_dem_hachioji.js）。山の外側の起伏に混ぜる。
// ======================================================================
import { fujinRealN } from './fujin_layout.js';
import { isTouch as IMAC_TOUCH } from './touch.js';
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { TOYO_MAEDA_KACCHU } from './kacchu_data.js';
import { nobori, jinmaku, kagaribi, ishigaki, kabukimon, solidSeg, farFireDots, castleStoneMat, palisade } from './props.js';
import { goten } from './castle_parts.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { revealName } from './battle_intel.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';
import { rainVolley } from './arrow_rain.js';
import { nm } from './bhelp.js';
import { allyGroup, enemyGroup, SH, shSide, sideDepth } from './t11_hachioji/side.js';   // K661：側の入れ替え（h08 北条編）
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, buildCastlePlanSteps, rectPoly } from './castle_plan.js';
import { addRamp, addWall } from './floors.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot, depthCheckpointStep, depthResumeSteps } from './b_depth.js';
import { withGuard } from './toyo_bot.js';
import { isEn, addEn } from './i18n.js';
import { askThen } from './b_opening.js';
// K516 英語の時だけ八王子の字の表を読む（日本語の時は読まない・重さ0）
if (isEn()) import('./i18n_hachioji.js').then((m) => addEn(m.default)).catch(() => {});
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 14）で足した段。中身は t11_hachioji/ に一段一ファイル
import * as sanroku from './t11_hachioji/sanroku.js';     // 始め：霧の谷を大手の木戸へ（伏兵・搦手の鬨・別の戦場の知らせ）
import * as sakamichi from './t11_hachioji/sakamichi.js'; // 御主殿の裏から尾根の急な坂を金子丸の下へ
import * as rakujo from './t11_hachioji/rakujo.js';       // 終幕：本丸の最後の城兵・落城の重い余韻
import { retreat, live } from './t11_hachioji/retreat.js';

const HAS_DEM = false;   // asset_dem_hachioji.js は素材の枝で入れる（本体では置かない）
let dem = null;
if (HAS_DEM) {
  BATTLE_ASSETS.t11_hachioji = Object.freeze([...assetsForBattle('t11_hachioji'), 'dem_hachioji']);
  useTerrain('dem_hachioji', (data) => { dem = data; });
}

// ---- 場所（ゲームの座標） ----
const START = { x: 182, z: 55 };          // 前田勢の寄せ口（城山川の谷の下）。大手と寄せ口を谷の上へ詰め、始めの25秒に曳橋・石段・御主殿が霧の中に見えるように
const OTE = { x: 120, z: 52 };            // 山下曲輪
const BRIDGE_S = { x: 82, z: 36 };        // 曳橋の南の袂
const BRIDGE_N = { x: 80, z: 19 };        // 曳橋の北の袂（石段の下）
const LANDING = { x: 80, z: 9 };          // 石段の踊り場（ここで直角に西へ折れる。発掘で戻された御主殿の虎口の形）
const KOGUCHI = { x: 63, z: 4 };          // 御主殿の虎口（石段の上）
const GOSHU = { x: 40, z: -3 };           // 御主殿
const KANEKO = { x: 72, z: -46 };         // 金子丸
const TAKA = { x: 25, z: -80 };           // 高丸
const MATSUKI = { x: -25, z: -105 };      // 小宮曲輪
const HON = { x: -81, z: -136 };          // 本丸（深沢山の頂）
const KARAMETE = { x: -70, z: -60 };      // 搦手から上杉勢が出てくる所
// 搦手の間道：北の水の手から尾根の北の脇を登り、小宮曲輪の裏（北西）へ出る。大手の道（ROUTE）とは交わらない
const KARAMETE_PATH = [[-70, -60], [-66, -78], [-56, -96], [-46, -112], [-38, -110], [-31, -108]];
// 柵の外から曲輪の中央を直接狙うと開口を外れる。搦手の隊も小宮曲輪の西口を出て、本丸の口から入る。
const KARAMETE_HON_PATH = [[-38, -110], [-44, -116], [-50, -128], [-60, -130], [-66, -134], [-76, -140]];
// 横地監物は西の脱出口から詰城へ落ちる。柵の開口と退く道の始点をそろえる。
const YOKOCHI_PATH = [[-96, -144], [-100, -148], [-114, -156], [-124, -166], [-128, -182]];

// 大手の道：谷を西へ、曳橋で川を北へ渡り、石段を御主殿の虎口へ。そこから尾根の曲輪を一つずつ本丸へ
// 11/18 18時 クラウド持ち主：虎口 (63,4) から坂 (70,-8) へ真っすぐだと上の段の南西の角の石垣に当たり、坂の段で本人が (66,3) に三十秒止まった（描かずの通し）。石垣と御主殿の石垣の間の通り (62,-5) を挟む
const ROUTE = [
  [230, 56], [START.x, START.z], [150, 52], [133, 52], [108, 52], [101, 50], [95, 42], [BRIDGE_S.x, BRIDGE_S.z], [BRIDGE_N.x, BRIDGE_N.z],
  [LANDING.x, LANDING.z], [KOGUCHI.x, KOGUCHI.z], [62, -5], [70, -8], [72, -34], [KANEKO.x, KANEKO.z], [66, -58], [50, -68], [44, -75], [38, -76], [TAKA.x, TAKA.z],
  [18, -92], [17, -98], [4, -99], [-12, -104], [MATSUKI.x, MATSUKI.z], [-38, -110], [-52, -122], [-66, -134], [HON.x, HON.z],
];
// 尾根の背（x, z, 高さ）：曲輪の段の高さと、間の坂
const SPINE = [
  [KOGUCHI.x, KOGUCHI.z, 15], [70, -8, 20], [72, -34, 30], [72, -46, 30], [66, -58, 30], [38, -76, 42], [25, -80, 42], [18, -92, 42],
  [-12, -104, 54], [-25, -105, 54], [-38, -110, 54], [-66, -134, 66], [-81, -136, 66], [-122, -160, 62],
];
// 虎口の二つの段の縁（西への石段の南と北）
const TORA_A = (x) => 6.8 + (x - 64) * 0.25;
const TORA_B = (x) => 1.5 + (x - 64) * 0.25;
const GOSHU_ARM = [[KOGUCHI.x, KOGUCHI.z, 15], [GOSHU.x, GOSHU.z, 15], [18, -12, 16]];
// 城山川（東へ流れる）
const RIVER = [];
for (let x = -10; x <= 260; x += 15) RIVER.push([x, 27 + 3 * Math.sin(x * 0.035)]);

const HOJO = { armor: 0x2e2a24, lace: 0x8a7a3a, flag: 'hojo' };
// 段の並び（b_depth の段の番）。番の数を直に書かず、名で引く（段を足しても番がずれない）
const ORDER = ['sanroku', 'ote', 'bridge', 'sally', 'goshu', 'sakamichi', 'kaneko', 'taka', 'matsuki', 'hon', 'naka', 'rakujo'];
const IX = Object.fromEntries(ORDER.map((k, i) => [k, i]));
const MAEDA = { flag: 'maeda' };
const UESUGI = { flag: 'uesugi' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 折れ線（高さ付き）への最も近い所：{ d, h }
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

// ---- 地形：谷の底・南の山・尾根（深沢山へ）。手で描いた形に、国土地理院の起伏を外側だけ足す ----
function base(x, z) {
  // 谷の底は西（上流）ほど高い。南と西は山
  let h = 2 + 0.035 * Math.max(0, 230 - x);
  h += 0.45 * Math.max(0, z - 72) + 0.5 * Math.max(0, 10 - x) * clamp01((z + 10) / 20);
  // 尾根：背の高さから、横へ 8m を越えると急に落ちる
  let s = spineAt(SPINE, x, z);
  h = Math.max(h, s.h - 0.55 * Math.max(0, s.d - 8));
  s = spineAt(GOSHU_ARM, x, z);
  h = Math.max(h, s.h - 0.5 * Math.max(0, s.d - 10));
  // 御主殿の虎口：折れる石段を挟む二つの平らな段（縁は石垣で留める。bridgeAndSteps）
  if (x > 64 && x < 77 && z < 20 && z > TORA_A(x)) h = 15;
  if (x > 64 && x < 82 && z > -4 && z < TORA_B(x)) h = 17.5;
  // 本丸の西の大堀切（詰城との間で尾根を断つ。V の字の底）
  const hk = Math.abs((x + 106) * 0.86 + (z + 151) * 0.51);
  if (hk < 7 && Math.abs((x + 106) * 0.51 - (z + 151) * 0.86) < 22) h -= 7 * (1 - hk / 7);
  // 障子堀（北条の堀の作り）：堀切の底に、堀を横切る畝を六mごとに残す（幅は約 1.4m・底の浅い所だけ）
  if (hk < 3.2) {
    const u = (x + 106) * 0.51 - (z + 151) * 0.86;
    if (Math.abs(u) < 18) { const sj = Math.abs(u / 6 - Math.round(u / 6)) * 6; h += 2.2 * clamp01((1.1 - sj) / 0.5) * clamp01((3.2 - hk) / 1.2); }
  }
  // 北の奥の山
  h += 0.3 * Math.max(0, -z - 165);
  h += 0.35 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  if (dem) h += demRelief(dem, x, z, { xy: 1, cx: 40, cz: -40, inner: 200, fade: 60, scale: 0.06 });
  return h;
}

// ---- 縄張り：山下曲輪・御主殿（石垣）・金子丸・高丸・小宮曲輪・本丸 ----
// 御主殿は主殿と会所の館（長屋・馬屋の並ぶ二の丸の作りにしない）。山の曲輪は土の城：砂利の平場・長屋・櫓の並びを置かず、本丸も土塁に柵（11/8 critic60）
const PLAN = {
  mon: 'hojo', name: '八王子城', type: 'yama', year: 1590, gateSlope: 7, lifeNoFlags: true,
  stoneSolid: true,   // 御主殿の石垣と天端の塀も、冠木門の開口以外からは通り抜けさせない。
  // 通し確認の終盤で、切岸をまたいだ逆茂木が宙に斜めに伸びていた。枝先までの足場が緩い所だけに置く。
  sakamogiMaxRise: 0.8,
  continuousEdges: true,   // 11/8 critic60（八1）：曲輪の縁の外で地面が段に落ち、盛り土の斜面が平たい大きな三角の面に見えた。縁から切岸へ続けて下ろす
  kuruwa: [
    { id: 'ote', name: '山下曲輪', level: 5.9, wall: 'saku', kind: 'san', poly: rectPoly(108, 133, 40, 64), gapAt: [[133, 52], [108, 52]], gapW: 10, floor: false },   // 11/9 見回り：木戸が六歩で味方の組が詰まり、bot が東の木戸の前で十八分止まった。十歩に
    { id: 'goshu', name: '御主殿', level: 15, wall: 'ishigaki', kind: 'yakata', dense: false, poly: rectPoly(20, 60, -20, 14), gapAt: [[60, 4]] },
    { id: 'kaneko', name: '金子丸', level: 30, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(60, 84, -58, -34), gapAt: [[72, -34], [66, -58]], gapW: 7.5 },
    { id: 'taka', name: '高丸', level: 42, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(12, 38, -92, -68), gapAt: [[38, -76], [18, -92]], gapW: 7.5 },
    { id: 'matsuki', name: '小宮曲輪', level: 54, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(-38, -12, -117, -93), gapAt: [[-12, -104], [-38, -110]], gapW: 7.5 },
    { id: 'hon', name: '本丸', level: 66, wall: 'saku', dorui: 1.8, kind: 'hon', floor: false, dense: false, poly: rectPoly(-96, -66, -150, -122), gapAt: [[-66, -134], YOKOCHI_PATH[0]], gapW: 7.5 },
  ],
  // 11/10 クラウド：尾根の曲輪の口（5〜5.6m）で味方と城兵が詰まり、bot が高丸の口・本丸の口の前で十二分止まった。山下曲輪の木戸と同じく口を広げる（7.5m）
  koguchi: [
    // 道探しの木戸も柵の開口と同じ位置・幅にする。古い位置だと曲輪の外を入口として扱っていた。
    { id: 'ote_e', name: '大手の木戸', from: 'out', to: 'ote', kind: 'hira', at: [133, 52], rot: Math.PI / 2, w: 10 },
    { id: 'ote_w', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [108, 52], rot: -Math.PI / 2, w: 10 },
    { id: 'goshu', name: '御主殿の虎口', from: 'out', to: 'goshu', kind: 'hira', at: [60, 4], rot: Math.PI / 2, w: 5 },
    { id: 'kaneko_s', name: '金子丸の口', from: 'out', to: 'kaneko', kind: 'hira', at: [72, -34], rot: 0, w: 7.5 },
    { id: 'kaneko_n', name: '金子丸の奥の口', from: 'kaneko', to: 'out', kind: 'hira', at: [66, -58], rot: Math.PI, w: 7.5 },
    { id: 'taka_e', name: '高丸の口', from: 'out', to: 'taka', kind: 'hira', at: [38, -76], rot: Math.PI / 2, w: 7.5 },
    { id: 'taka_n', name: '高丸の奥の口', from: 'taka', to: 'out', kind: 'hira', at: [18, -92], rot: Math.PI, w: 7.5 },
    { id: 'matsuki_e', name: '小宮曲輪の口', from: 'out', to: 'matsuki', kind: 'hira', at: [-12, -104], rot: Math.PI / 2, w: 7.5 },
    { id: 'matsuki_w', name: '小宮曲輪の奥の口', from: 'matsuki', to: 'out', kind: 'hira', at: [-38, -110], rot: -Math.PI / 2, w: 7.5 },
    { id: 'hon', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [-66, -134], rot: Math.PI / 2, w: 7.5 },
    { id: 'hon_w', name: '本丸の西の脱出口', from: 'hon', to: 'out', kind: 'hira', at: YOKOCHI_PATH[0], rot: -Math.PI / 2, w: 5 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }],
};
// 利家の陣幕も南の口から出入りする。後列が幕の内へ押されると、西の幕（187,53付近）で止まっていた。
// flags の陣幕（中心 START.x + 10・幅12・奥行9・南口4）と同じ囲みを道案内にも渡す。
const WAY_FORTS = [{
  id: 'honjin', poly: rectPoly(START.x + 4, START.x + 16, START.z - 4.5, START.z + 4.5),
  gapAt: [[START.x + 10, START.z + 4.5]],
}, ...PLAN.kuruwa];
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

// ---- 道を外れない動き：谷の道と尾根の道に沿って、一つ先の曲がり角へ（bot と兵の両方） ----
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
// 木戸へ横から近づく兵も、柵の外の角を回る。道への寄せ直しで木戸の指定を上書きしない。
// 四隅と出発・到着の六点だけで調べ、作業用の入れ物は使い回す。
const GATE_X = new Float64Array(6), GATE_Z = new Float64Array(6);
const GATE_DIST = new Float64Array(6), GATE_FIRST = new Int8Array(6), GATE_USED = new Uint8Array(6);
function gateSegmentClear(a, b, x0, x1, z0, z1) {
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      const v = axis ? GATE_Z : GATE_X, min = (axis ? z0 : x0) - 0.5, max = (axis ? z1 : x1) + 0.5;
      const d = v[b] - v[a];
      if (Math.abs(d) < 0.0001) { if (v[a] < min || v[a] > max) return true; }
      else { const t0 = (min - v[a]) / d, t1 = (max - v[a]) / d; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      if (lo > hi) return true;
    }
    return false;
}
function gateApproach(pos, q, x0, x1, z0, z1) {
  // 柵ぎわでは、迂回を調べる半歩の余白の内側に出発点が入り、全ての道が塞がった扱いになる。
  // 柵の外にいる兵は先に外向きへ離し、次の道探しで角から木戸へ回す。
  if (pos.x >= x0 - 0.5 && pos.x <= x1 + 0.5 && pos.z >= z0 - 0.5 && pos.z <= z1 + 0.5) {
    if (pos.x < x0) { q.x = x0 - 3; q.z = pos.z; return q; }
    if (pos.x > x1) { q.x = x1 + 3; q.z = pos.z; return q; }
    if (pos.z < z0) { q.x = pos.x; q.z = z0 - 3; return q; }
    if (pos.z > z1) { q.x = pos.x; q.z = z1 + 3; return q; }
  }
  GATE_X[0] = pos.x; GATE_Z[0] = pos.z; GATE_X[1] = q.x; GATE_Z[1] = q.z;
  for (let i = 0; i < 4; i++) { GATE_X[i + 2] = i < 2 ? x0 - 3 : x1 + 3; GATE_Z[i + 2] = i % 2 ? z1 + 3 : z0 - 3; }
  GATE_DIST.fill(Infinity); GATE_USED.fill(0); GATE_FIRST.fill(-1); GATE_DIST[0] = 0;
  for (let step = 0; step < 6; step++) {
    let a = -1;
    for (let i = 0; i < 6; i++) if (!GATE_USED[i] && (a < 0 || GATE_DIST[i] < GATE_DIST[a])) a = i;
    if (a < 0 || !Number.isFinite(GATE_DIST[a])) break;
    if (a === 1) { const i = GATE_FIRST[a]; if (i >= 0) { q.x = GATE_X[i]; q.z = GATE_Z[i]; } return q; }
    GATE_USED[a] = 1;
    for (let b = 1; b < 6; b++) if (!GATE_USED[b] && gateSegmentClear(a, b, x0, x1, z0, z1)) {
      const d = GATE_DIST[a] + Math.hypot(GATE_X[b] - GATE_X[a], GATE_Z[b] - GATE_Z[a]);
      if (d < GATE_DIST[b]) { GATE_DIST[b] = d; GATE_FIRST[b] = a === 0 ? b : GATE_FIRST[a]; }
    }
  }
  return q;
}
function hachiojiWay(army, u, want) {
  // 追う距離だけでは、組ごと木戸の外へ出てしまう。守備中の行き先は曲輪の内へ留める。
  const g = u.group, k = g?.t11Kuruwa;
  if (k && !g.routed && !u.fleeing && g.morale >= 22) {
    const q = u._t11GuardWay || (u._t11GuardWay = { x: 0, z: 0 });
    q.x = Math.max(k.poly[0][0] + 1.5, Math.min(k.poly[1][0] - 1.5, want.x));
    q.z = Math.max(k.poly[0][1] + 1.5, Math.min(k.poly[2][1] - 1.5, want.z));
    if (u.pos.x >= k.poly[0][0] && u.pos.x <= k.poly[1][0] && u.pos.z >= k.poly[0][1] && u.pos.z <= k.poly[2][1]) return q;
    want = q;
  }
  // 西へ落ちる横地の供は専用の道を使う。
  if (g?.t11Escape) return want;
  const bridgeWay = hachiojiBridgeWay(u, want);
  if (bridgeWay) return bridgeWay;
  const gateWay = hachiojiGateWay(u, want);
  if (gateWay) return gateWay;
  return hachiojiRouteWay(army, u, want);
}
// 11/19 クラウド持ち主（台帳の残り「曳橋の脇の川の中を歩く」）：城山川は深さ1.2m で当たりが無く、
//   川向こうの敵・行き先へ真っすぐ歩くと橋の脇の水の中を渡っていた。橋の近くでは川を挟む行き先なら、
//   手前の袂→向こうの袂と橋の上を通す（橋の上の者は向こうの袂まで）。行き先の入れ物は兵ごとに使い回す。
const riverSide = (x, z) => z - (27 + 3 * Math.sin(x * 0.035));
function hachiojiBridgeWay(u, want) {
  const x = u.pos.x, z = u.pos.z;
  if (x < 30 || x > 140 || want.x < 20 || want.x > 150) return null;
  const su = riverSide(x, z), sw = riverSide(want.x, want.z);
  const t = (z - BRIDGE_N.z) / (BRIDGE_S.z - BRIDGE_N.z);
  const onBridge = t > -0.05 && t < 1.05 && Math.abs(x - (BRIDGE_N.x + (BRIDGE_S.x - BRIDGE_N.x) * t)) < 2.2;
  const q = u._t11BridgeWay || (u._t11BridgeWay = { x: 0, z: 0, botRadius: 1.5 });
  if (onBridge) {
    // 橋の上：行き先の岸の袂の一歩先まで（手すりを横に抜けない）
    if (Math.abs(sw) < 6) return null;
    const e = sw > 0 ? BRIDGE_S : BRIDGE_N; q.x = e.x; q.z = e.z + (sw > 0 ? 1.5 : -1.5);
    // 11/19 3時 クラウド持ち主（act bot が北の袂 (80,19) で石段の下の縁に突き当たり千二百秒止まった）：袂の二歩半内まで来たら離す
    return Math.hypot(x - e.x, z - e.z) > 2.5 ? q : null;
  }
  if (Math.abs(su) < 2.5) {
    // 川の中に入ってしまった者：入った岸へ上がる
    q.x = x; q.z = z + (su >= 0 ? 4 : -4);
    return q;
  }
  if (Math.sign(su) === Math.sign(sw)) return null;
  const near = su > 0 ? BRIDGE_S : BRIDGE_N, far = su > 0 ? BRIDGE_N : BRIDGE_S, dn = su > 0 ? 1.5 : -1.5;
  // 手前の袂に着いたら向こうの袂の一歩先まで
  if (Math.hypot(x - near.x, z - (near.z + dn)) < 2.5) { q.x = far.x; q.z = far.z - dn; }
  else { q.x = near.x; q.z = near.z + dn; }
  return q;
}
function hachiojiGateWay(u, want) {
  // 近い敵でも柵の向こうへ直進しない。曲輪を出入りする時は開口の反対側まで通す。
  // 木戸そのものを目当てにすると、その手前で到着扱いになって柵越しに斬り続ける。
  for (const fort of WAY_FORTS) {
    const x0 = fort.poly[0][0], x1 = fort.poly[1][0], z0 = fort.poly[0][1], z1 = fort.poly[2][1];
    const fromIn = u.pos.x >= x0 && u.pos.x <= x1 && u.pos.z >= z0 && u.pos.z <= z1;
    let toIn = want.x >= x0 && want.x <= x1 && want.z >= z0 && want.z <= z1;
    // 山下曲輪を挟んだ行き先は、外周へ回さず手前の木戸から入り、奥の木戸へ抜ける。
    // 外周へ回すと、角に着くたび大手の道へ戻され、曳橋へ進めず往復していた。
    const through = fort.id === 'ote' && !fromIn && !toIn &&
      ((u.pos.x > x1 && want.x < x0) || (u.pos.x < x0 && want.x > x1));
    if (through) toIn = true;
    // 同じ曲輪の内なら持ち場へ進む。道へ寄せ直すと、金子丸の柵際（63,-34）から入口と同じ縁へ横歩きし続ける。
    if (fromIn && toIn) return want;
    if (fromIn === toIn) {
      // 両端が外でも、直進すると柵を横切ることがある。外周の角を回して柵際で止めない。
      if (!fromIn) {
        GATE_X[0] = u.pos.x; GATE_Z[0] = u.pos.z; GATE_X[1] = want.x; GATE_Z[1] = want.z;
        if (gateSegmentClear(0, 1, x0, x1, z0, z1)) continue;
        const wx = want.x, wz = want.z;
        const q = u._t11GateWay || (u._t11GateWay = { x: 0, z: 0, botRadius: 1 });
        q.x = wx; q.z = wz;
        gateApproach(u.pos, q, x0, x1, z0, z1);
        if (q.x !== wx || q.z !== wz) return q;
      }
      continue;
    }
    let best = Infinity, gate = null;
    for (const at of fort.gapAt) {
      if (through && at[0] !== (u.pos.x > x1 ? x1 : x0)) continue;
      // 入った直後も、距離の合計で入口へ引き返さず行き先側の木戸へ進む。
      if (fort.id === 'ote' && fromIn && !toIn &&
        ((want.x < x0 && at[0] !== x0) || (want.x > x1 && at[0] !== x1))) continue;
      const d = Math.hypot(u.pos.x - at[0], u.pos.z - at[1]) + Math.hypot(want.x - at[0], want.z - at[1]);
      if (d < best) { best = d; gate = at; }
    }
    if (!gate) continue;
    const q = u._t11GateWay || (u._t11GateWay = { x: 0, z: 0, botRadius: 1 });
    // 門から離れている間は手前側へ。斜めに反対側を狙って柵の角を横切らない。
    // 幕口だけでなく曲輪の木戸も、横ずれを直してから渡る。距離だけでは壁の端へ斜めに突っ込んで止まる。
    const lateral = gate[0] === x0 || gate[0] === x1 ? Math.abs(u.pos.z - gate[1]) : Math.abs(u.pos.x - gate[0]);
    const near = Math.hypot(u.pos.x - gate[0], u.pos.z - gate[1]) < 4.5 && lateral < 0.8;
    const side = (near ? toIn : fromIn) ? 3 : -3;
    q.x = gate[0] + (gate[0] === x0 ? side : gate[0] === x1 ? -side : 0);
    q.z = gate[1] + (gate[1] === z0 ? side : gate[1] === z1 ? -side : 0);
    // 内から出る時と木戸の正面では開口を通す。外からの接近だけ柵の角を回す。
    return !fromIn && !near ? gateApproach(u.pos, q, x0, x1, z0, z1) : q;
  }
  return null;
}
function hachiojiRouteWay(army, u, want) {
  const g = u.group;
  // 搦手の兵も柵の開口へ回す。開口を通した後は専用の道を保ち、大手へ引き戻さない。
  if (g?.t11Karamete) return want;
  // 行軍の列は共通処理が橋・石段と隊の道順を調べて選んだ歩みを保つ。
  // 再び大手の中心線へ寄せると、後列の持ち場への迂回を上書きして角で止まる。
  // 曲輪の出入りは上で木戸へ回し、交戦・追従は従来どおり道を案内する。
  if (want === u._columnWay && g?.order === 'path' && g.roadColumn && g.followColumnRoad && !u.target) return want;
  const q = u._t11Way || (u._t11Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) return hachiojiGateWay(u, q) || q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
  routeAt(u.pos.x, u.pos.z, RF); routeAt(want.x, want.z, RT);
  // 道から遠い者（谷の兵・御主殿の奥）と、同じ区間の行き先はそのまま
  if (RF.d > 30 || RT.d > 30 || Math.abs(RT.s - RF.s) < 0.6) return want;
  q.active = true;
  if (RF.d > 4) { q.x = RF.x; q.z = RF.z; return hachiojiGateWay(u, q) || q; }
  const fwd = RT.s > RF.s;
  let i = fwd ? Math.floor(RF.s) + 1 : Math.ceil(RF.s) - 1;
  i = Math.max(0, Math.min(ROUTE.length - 1, i));
  // 曲がり角の手前の止まる輪（botRadius 2）の内なら次の角へ（1.5 だと角の 2m 手前で bot が着いたとみなして止まった。11/4 p100）
  if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < q.botRadius + 0.6) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RT.s : i < RT.s)) { q.x = RT.x; q.z = RT.z; }
  else { q.x = ROUTE[i][0]; q.z = ROUTE[i][1]; }
  // 道の中心への寄せ直しでも、山下曲輪の角から柵を斜めに横切らない。
  return hachiojiGateWay(u, q) || q;
}

// 敗走中は通常の道案内を通らない。西への直進で柵・石垣に残った城兵も、
// 木戸と尾根道から本丸の西口へ退かせる。近景・遠景とも同じ退路を使う。
function hachiojiFleeWay(army, u, want) {
  if (u.team !== 1) return want;
  const q = u._t11FleeWay || (u._t11FleeWay = { x: 0, z: 0, i: 0 });
  // すでに西口の外へ出ていた兵を、本丸の内へ呼び戻さない。
  if (q.i === 0 && u.pos.x < YOKOCHI_PATH[0][0] && u.pos.z < HON.z) q.i = 1;
  while (q.i < YOKOCHI_PATH.length && Math.hypot(u.pos.x - YOKOCHI_PATH[q.i][0], u.pos.z - YOKOCHI_PATH[q.i][1]) < 2) q.i++;
  if (q.i >= YOKOCHI_PATH.length) {
    // 詰城へ抜けた後も場の端まで退く。退路の最後の点に溜めない。
    q.x = u.pos.x - 6; q.z = u.pos.z - 6;
    return q;
  }
  q.x = YOKOCHI_PATH[q.i][0]; q.z = YOKOCHI_PATH[q.i][1];
  // 西口を出た後は尾根の中心へ寄せ直さず、横地と同じ脱出路へ。
  return q.i === 0 ? hachiojiWay(army, u, q) : hachiojiGateWay(u, q) || q;
}

// 味方の組を、谷の道と尾根の道の曲がり角を順にたどって段の場所へ（11/4：攻める号令のままでは山下曲輪の柵に掛かって寄せ口に残った）。
//   細い道は二列の縦隊で歩き、着いたら槍の備に組み直して段の敵へかかる
const RG = { d: 0, s: 0, x: 0, z: 0 };
// 退場済み・敗走中・重傷の兵は、そばで戦える味方にも呼び戻す兵にも数えない。
const canRejoin = (u) => u.alive && !u.isPlayer && !u.gone && !u.dying && !u.fleeing && !u.evacuatedWound && !u.woundOut && !u.rearWound && !u.downed;
const REJOIN_SPHERE = new THREE.Sphere(new THREE.Vector3(), 5);
function unseenRejoin(rt, x, z) {
  if (!rt.frustum || Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) < 28) return false;
  REJOIN_SPHERE.center.set(x, rt.world.heightAt(x, z) + 1, z);
  return !rt.frustum.intersectsSphere(REJOIN_SPHERE);
}
// 11/18 クラウド持ち主（一戦を4〜7分に）：金子丸が落ちてから本丸の下まで尾根を百九十m 歩くだけの間（act bot で本丸の段の大半）を、
//   0.6秒の暗転で詰める（kaito AT7・AT10「歩くだけの間を作らない」。忍城・小牧の場面替えと同じ）。本人と組・前田の先の組を小宮曲輪の西の尾根道へ移す
const HOP_AT = { x: -48, z: -119 };
const SQ_C = { x: 0, y: 0, z: 0 };
function hopToHon(rt) {
  const P = rt.player, u = P.u, W = rt.world;
  if (!u || !u.alive) return;
  rt.cutT = rt.t; rt.scene.visible = false; rt.after(0.6, () => { rt.scene.visible = true; }, true);
  const heading = Math.atan2(HON.x - HOP_AT.x, HON.z - HOP_AT.z);
  const put = (o, x, z) => {
    o.target = null; o.watch = null; o.atk = null; o.swing = null; o.bind = null; o.charging = false; o.moveTo = null; o.aiT = 0;
    o.pos.set(x, W.heightAt(x, z), z); o.warpedOnce = true; o._cpx = undefined; o._cpz = undefined;   // 前の位置を残すと「柵を跨いだら戻す」で元へ引き戻される
    if (o.vel) o.vel.x = o.vel.y = o.vel.z = 0;
    if (o.push) { o.push.x = 0; o.push.z = 0; }
    if (o.mesh) o.mesh.position.copy(o.pos);
  };
  put(u, HOP_AT.x, HOP_AT.z);
  u.heading = heading; P.yaw = heading; P.camYawOff = 0; P.lock = null;
  if (P.vel) P.vel.x = P.vel.y = P.vel.z = 0;
  let i = 0;
  // 11/18 クラウド持ち主（見回り06：457秒の突撃で組4人のうち3人が士気0で逃げていた）：尾根を歩く間に組は息を整え、逃げた者も本人の後ろへ戻る
  for (const g of rt.squadGroups || []) if (g && g.units) {
    g.routed = false; g._routAt = undefined; g.wavered = false; g.focus = null; g.order = 'follow'; g.morale = Math.max(g.morale || 0, 70);
    for (const o of g.units) if (o.alive && !o.gone && !o.isPlayer) { o.fleeing = false; o.routIn = undefined; o.moraleFleeDir = null; o.fright = 0; o.confused = 0; put(o, HOP_AT.x + 2 + (i % 4) * 1.4, HOP_AT.z + 2 + Math.floor(i / 4) * 1.4); i++; }
    g.anchor = { x: HOP_AT.x + 2, z: HOP_AT.z + 3 };
  }
  // 前田の先の組は本人の左右と少し前（本丸の口の側）の尾根道に並べ、本人と並んで本丸へ歩かせる（後ろに置くと小宮曲輪の柵の内に入る）
  const fx = Math.sin(heading), fz = Math.cos(heading), sx = fz, sz = -fx;
  [rt.flags.mine, rt.flags.saki, rt.flags.ni].forEach((g, k) => {
    if (!g || !g.count || g.routed) return;
    let j = 0;
    const along = 2 + k * 2.5, side = (k - 1) * 6;
    for (const o of g.units) if (o.alive && !o.gone) {
      const a = along - Math.floor(j / 4) * 1.5, b2 = side + ((j % 4) - 1.5) * 1.4;
      put(o, HOP_AT.x + fx * a + sx * b2, HOP_AT.z + fz * a + sz * b2); j++;
    }
    g.anchor = { x: HOP_AT.x + fx * along + sx * side, z: HOP_AT.z + fz * along + sz * side };
    marchTo(rt, g, { x: HON.x + 22, z: HON.z + 18 }, k);
  });
}

// 行く段（DP.move）で、上限の秒を過ぎ行き先の r m 内まで来ていれば着いた事にする
// 11/18 16時 クラウド持ち主：act bot 764秒の回で曳橋への移りが二百二十秒（行き先から五十六m より近づけず。move の max は本人が戦う間は効かない）。
//   cap 秒を過ぎれば着いた事にして次の段（打って出る城兵が本人へ向かう）へ進める
function nearEnough(st, at, after, r, cap = Infinity) {
  const t0 = st.tick;
  st.tick = (rt, C, m, ctx, el) => {
    const p = rt.player.u.pos;
    if (t0(rt, C, m, ctx, el) || (el >= after && Math.hypot(p.x - at.x, p.z - at.z) < r)) return true;
    if (el >= cap) { C.arr = true; return true; }
    return false;
  };
  return st;
}

function marchTo(rt, g, to, k = 0) {
  if (!g || !g.count || g.routed) return;
  const c = g.center(), at = { x: to.x + (k % 2 ? 3 : -3) * Math.ceil(k / 2), z: to.z + 3 * k };
  // 後列のずれで金子丸の南柵の外を終点にしない。全隊が木戸から曲輪の内へ入る。
  const fort = WAY_FORTS.find((f) => to.x > f.poly[0][0] && to.x < f.poly[1][0] && to.z > f.poly[0][1] && to.z < f.poly[2][1]);
  if (fort) {
    at.x = Math.max(fort.poly[0][0] + 3, Math.min(fort.poly[1][0] - 3, at.x));
    at.z = Math.max(fort.poly[0][1] + 3, Math.min(fort.poly[2][1] - 3, at.z));
  }
  routeAt(c.x, c.z, RG); const s0 = RG.s, d0 = RG.d, rx = RG.x, rz = RG.z;
  routeAt(at.x, at.z, RG); const s1 = RG.s;
  const path = [];
  if (d0 > 3) path.push([rx, rz]);
  if (s1 > s0) for (let i = Math.floor(s0) + 1; i <= Math.floor(s1); i++) path.push(ROUTE[i]);
  else for (let i = Math.ceil(s0) - 1; i >= Math.ceil(s1); i--) path.push(ROUTE[i]);
  path.push([at.x, at.z]);
  // 遅れた兵も現在地から木戸と道を歩く。画面外でも位置を飛ばさない。
  g.focus = null; g.dest = null; g.fixed = false;
  g.anchor = { x: c.x, z: c.z }; g.path = path; g.pathIdx = 0;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true; g.speed = 3.4;
  g.onArrive = (q) => { q.order = 'attack'; q.path = null; q.roadColumn = false; q.formation = 'yari'; q.anchor = at; q.seekRange = 30; q._fitAt = 0; };
}

// ---- 曳橋と石段（形は一つずつにまとめる。毎コマ new しない） ----
function bridgeAndSteps(rt) {
  const W = rt.world;
  // 床の経路判定だけでなく、人と馬を押し戻す実際の当たりにも同じ線を渡す。
  const barrier = (o) => {
    addWall(o);
    Object.assign(solidSeg(o.ax, o.az, o.bx, o.bz, o.r), { yBot: o.y0, yTop: o.y1, bodyOverlap: true });
  };
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const box = (parts, w, h, d, x, y, z, ry = 0, pitch = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (pitch) g.rotateX(pitch); g.rotateY(ry); g.translate(x, y, z); parts.push(g); };
  const merge = (parts, mat) => {
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const hasUv = parts.every((g) => g.attributes.uv);   // 石段の石は石肌の絵を貼るので uv も運ぶ
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = hasUv ? new Float32Array(n * 2) : null, idx = []; let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (uv) uv.set(g.attributes.uv.array, o * 2); for (const i of g.index.array) idx.push(i + o); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; m.userData.camBlock = true; m.matrixAutoUpdate = false; m.updateMatrix(); rt.scene.add(m);
  };
  // 曳橋：南の袂から北の袂へ。両岸の高さの差は、床をゆるく傾けてつなぐ
  const ax = BRIDGE_S.x, az = BRIDGE_S.z + 1, bx = BRIDGE_N.x, bz = BRIDGE_N.z - 1;
  const ya = W.heightAt(ax, az) + 0.3, yb = W.heightAt(bx, bz) + 0.3, len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = Math.sin(ry), uz = Math.cos(ry), px = uz, pz = -ux;
  // len は地図上の長さ。傾ける桁と手すりには斜面の実長を使い、
  // 見える両端を歩行床・横の当たりと同じ袂まで届かせる。
  const y = (ya + yb) / 2, rise = yb - ya, slopeLen = Math.hypot(len, rise), pitch = -Math.atan2(rise, len);
  const planks = [], boards = [[], [], []];
  // 床：二本の桁の上に、渡り板を一枚ずつ横に並べる（一枚板の箱に見えた。11/8 critic60）。板の幅・色・反りを少しずつ違える
  for (const s of [-0.9, 0.9]) box(planks, 0.3, 0.34, slopeLen, mx + px * s, y - 0.25, mz + pz * s, ry, pitch);
  const nb = Math.floor(len / 0.34);
  for (let k = 0; k < nb; k++) {
    const t = (k + 0.5) / nb - 0.5, r = Math.sin(k * 12.9898) * 43758.5453 % 1;
    const cx = mx + ux * t * len, cz = mz + uz * t * len, cy = y + (yb - ya) * t;
    box(boards[k % 3], 3.4 + Math.abs(r) * 0.3, 0.09, 0.31, cx + px * r * 0.12, cy - 0.02 + Math.abs(r) * 0.03, cz + pz * r * 0.12, ry);
  }
  for (const s of [-1, 1]) {
    box(planks, 0.16, 0.16, slopeLen, mx + px * s * 1.6, y + 1.0, mz + pz * s * 1.6, ry, pitch);
    // 見える手すりと同じ場所で横への通り抜けを止める。両端は開け、橋の床へ進める。
    barrier({ ax: ax + px * s * 1.6, az: az + pz * s * 1.6, bx: bx + px * s * 1.6, bz: bz + pz * s * 1.6,
      r: 0.12, y0: Math.min(ya, yb) - 0.2, y1: Math.max(ya, yb) + 1.2 });
    for (let k = -2; k <= 2; k++) {
      const cx = mx + ux * k * len / 5 + px * s * 1.6, cz = mz + uz * k * len / 5 + pz * s * 1.6, cy = y + (yb - ya) * k / 5;
      box(planks, 0.18, 1.0, 0.18, cx, cy + 0.5, cz);
      const gy = W.heightAt(cx, cz);
      if (gy < cy - 0.4) box(planks, 0.3, cy - gy + 0.2, 0.3, cx, (cy + gy) / 2 - 0.1, cz);
    }
  }
  merge(planks, wood);
  [0x5e4a35, 0x4b3a2a, 0x6a5741].forEach((c, i) => merge(boards[i], new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 })));
  addRamp({ ax, az, bx, bz, w: 3.4, ya: ya + 0.11, yb: yb + 0.11 });
  // 石段：北の袂から踊り場へ北に上り、直角に折れて西の冠木門へ（発掘で戻された御主殿の虎口）。段ごとに地面の上へ薄い石を据える
  // 一段を大小の野面の石三〜四つで組む（灰色の箱の重なりに見えた。11/8 critic60）。石ごとに幅・高さ・出・色を違える
  const stones = [[], [], []];
  let sd = 7;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  // 大小を替えた箱だけでは切石の段に見える。角を落とした野面の輪郭と
  // 石肌の起伏を付け、中心だけでなく端の根元も実際の斜面へ埋める。
  const stepStone = (parts, w, h, d, x, z, rot) => {
    const rim = [[-.5, -.32], [-.32, -.5], [.32, -.5], [.5, -.32], [.5, .32], [.32, .5], [-.32, .5], [-.5, .32]];
    const pos = new Float32Array(48), uvs = new Float32Array(32), index = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < 8; i++) {
      const lx = rim[i][0] * w * (.94 + rnd() * .12), lz = rim[i][1] * d * (.94 + rnd() * .12);
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c, ground = W.heightAt(px, pz);
      pos.set([px, ground - .12, pz], i * 3);
      pos.set([px, ground + h - .12 - rnd() * .045, pz], (i + 8) * 3);
      // 石肌の絵は上から見た位置で貼る（側は低いので伸びが目立たない）。下の輪は少しずらして側の面に縞を出す
      uvs.set([px * 0.55 + 0.17, pz * 0.55 + 0.11], i * 2); uvs.set([px * 0.55, pz * 0.55], (i + 8) * 2);
      const j = (i + 1) % 8;
      index.push(i, i + 8, j + 8, i, j + 8, j);
    }
    for (let i = 1; i < 7; i++) index.push(8, 9 + i, 8 + i, 0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(index); g.computeVertexNormals();
    parts.push(g);
  };
  const flight = (sx, sz, tx, tz, n) => {
    const sr = Math.atan2(tx - sx, tz - sz), cx = Math.cos(sr), cz = -Math.sin(sr);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = sx + (tx - sx) * t, z = sz + (tz - sz) * t;
      let u = -2.1;
      while (u < 2.05) {
        const w = Math.min(2.1 - u, 0.7 + rnd() * 0.8), h = 0.3 + rnd() * 0.1, d = 0.95 + rnd() * 0.25, o = (rnd() - 0.5) * 0.12;
        if (w < 0.15) break;   // 端の薄片を負の幅の石にしない。隙間は地面が受ける。
        const c = u + w / 2;
        // 中央の高さで横一列に置くと、坂の低い側の石が宙に浮く。石ごとの足元へ据える。
        const px = x + cx * c + Math.sin(sr) * o, pz = z + cz * c + Math.cos(sr) * o;
        stepStone(stones[Math.floor(rnd() * 3)], w - 0.06, h, d, px, pz, sr + (rnd() - 0.5) * 0.06);
        u += w;
      }
    }
  };
  flight(BRIDGE_N.x, BRIDGE_N.z, LANDING.x, LANDING.z + 2, 9);
  // 横一枚の下地は坂の低い側へ浮いて見える。踊り場も石ごとに据え、隙間には地面を見せる。
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    stepStone(stones[(i + j) % 3], 1.24, .34, 1.24, LANDING.x + (i - 1.5) * 1.25, LANDING.z + (j - 1.5) * 1.25, (rnd() - .5) * .06);
  }
  flight(LANDING.x - 2.5, LANDING.z - 0.5, KOGUCHI.x + 2, KOGUCHI.z + 0.5, 13);
  // 11/18 22時 クラウド持ち主（⑥写真）：踏石が絵の無い灰色の平たい板に見えた→石垣と同じ野面の石肌（castleStoneMat）に色の違いを掛ける
  //   石垣の素材は頂点の色を読む。踏石は色を持たないので vertexColors を外す
  const stoneBase = castleStoneMat('warishiGrain');
  [0xc9c3b6, 0xa9a397, 0xd6cfc0].forEach((c, i) => { const m = stoneBase.clone(); m.vertexColors = false; m.color = new THREE.Color(c); m.roughness = 0.97; merge(stones[i], m); });
  // 石段を挟む野面の石垣（低い段々）。上の段から折れの所へ横矢がかかる
  // 二つの段（base の TORA_A・TORA_B）の縁を留める石垣。天端は段の高さ
  // 辺ごとに積み、出隅で法の傾きの隙間が開かないよう、両端を少し伸ばして重ねる
  const wall = (pts, topY) => {
    for (let i = 0; i < pts.length - 1; i++) {
      // 出隅は重ねるが、開いた石段の口へ伸ばし過ぎて騎馬の幅を塞がない。
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / l * 0.6, ez = (bz - az) / l * 0.6;
      const a = [ax - ex, az - ez], b = [bx + ex, bz + ez];
      // 11/19 クラウド持ち主（⑥写真：三人称で本人が虎口の石垣の陰に入り、石垣の上から馬の背だけが見えた）：石垣にカメラの当たりを付け、壁の手前へ寄せる
      const ig = ishigaki(W, [a, b], { out: 1, topY, minH: 1.2, maxH: 4.2, lean: 0.12, noKit: true });
      ig.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; });
      rt.scene.add(ig);
      // 手置きの石垣は見た目だけ。野面積みを保ち、見える延長部分まで高さ付きの当たりを付ける。
      barrier({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r: 0.35, y0: topY - 4.2, y1: topY + 0.22 });
    }
  };
  wall([[64, 20], [77, 20], [77, TORA_A(77)], [64, TORA_A(64)]], 15.4);   // 下の段：川・北への上り・西への上りの三方を見下ろす（横矢）
  wall([[64, -4], [64, TORA_B(64)], [82, TORA_B(82)], [82, -4]], 17.9);   // 上の段：西への上りの北
  // 上の冠木門（復元の門と同じ、柱二本に冠木）
  rt.scene.add(kabukimon(W, KOGUCHI.x + 1, KOGUCHI.z + 0.4, 4.6, Math.PI / 2, { doors: false }));
  // 尾根の柵門（金子丸と高丸の間）
  rt.scene.add(kabukimon(W, 50, -68, 4.4, Math.atan2(-16, -10), { doors: false }));
  // K666（kaito 11/25「城とか砦系はこういう隙間がないか全部チェック」）：尾根の柵門が柵の無い尾根に独りで立っていた。
  //   門の柱から尾根の両の肩（各 7m）へ柵を張る。当たりは本人だけ（兵の通り道と段の運びは変えない）
  { const r = Math.atan2(-16, -10), tx = Math.cos(r), tz = -Math.sin(r), h = 4.4 / 2 + 0.25;
    for (const sd of [-1, 1]) {
      const seg = [50 + sd * tx * h, -68 + sd * tz * h, 50 + sd * tx * (h + 7), -68 + sd * tz * (h + 7)];
      rt.scene.add(palisade(W, seg));
      Object.assign(solidSeg(seg[0], seg[1], seg[2], seg[3], 0.35), { yTop: W.heightAt(50, -68) + 2.4, playerOnly: true });
    } }
}

// ---- 旗と篝火：前田の寄せ口・北条の曲輪 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 10, START.z, 12, 9, 4, { mon: 'maeda', people: false }));   // 幕の内の床几には本物の利家が座る（作り物の大将と二人にしない）
  // 霧の夜討ちで城方に気づかれずに寄せた（明るい寄せ口に幟がずらりと立っていた。11/8 critic60）：寄せ口に篝火を焚かず、幟は幕の後ろの一本だけ
  rt.scene.add(nobori(W, START.x + 16, START.z - 6, 'maeda', 6));
  // 11/19 クラウド持ち主（③幟の林・絵で分かる進み）：曲輪が落ちたら北条の幟を倒し、同じ所に前田の梅鉢の幟を立てる（plantMaeda）。北条の幟は場所と一緒に覚える
  // 11/21 cloud-21（司令塔：天王寺と携帯の120秒で並べて薄い所＝中景）：曳橋の段で橋の南の袂から寄せ口までの谷が、旗の無い暗い野だった。
  //   K285 の内（兵は足さない）で、谷の両の縁に寄せ手の前田の幟の列を立てる
  if (!(typeof location !== 'undefined' && /k21off=1/.test(location.search))) for (let i = 1; i < 8; i++) {
    const t = i / 8, x = BRIDGE_S.x + (START.x - BRIDGE_S.x) * t, z = BRIDGE_S.z + (START.z - BRIDGE_S.z) * t;
    for (const side of [-1, 1]) { const f = nobori(W, x, z + side * 12, 'maeda', 5 + (i % 2) * 0.8); if (f) { f.userData.k21nobori = true; rt.scene.add(f); } }
  }
  rt.t11Hojo = [];
  for (const [x, z] of [[128, 44], [128, 60], [56, -16], [24, 10], [80, -38], [34, -70], [-16, -96], [-70, -126], [-90, -144]]) { const o = nobori(W, x, z, 'hojo', 5); rt.scene.add(o); rt.t11Hojo.push({ o, x, z }); }
  for (const [x, z] of [[OTE.x, OTE.z - 6], [KOGUCHI.x + 3, KOGUCHI.z - 4], [KANEKO.x - 6, KANEKO.z], [HON.x + 6, HON.z]]) rt.scene.add(kagaribi(W, x, z));
  // 11/18 クラウド35（K365 城の見た目）：大手の谷から尾根の上の曲輪の篝火が一つも見えず、夜の山城が黒い山だけだった。
  //   城方の曲輪の口と篝火の所に、霧の奥でも小さな橙に見える火の点を置く（props.js の farFireDots・光源は増やさない）
  const far = [[KANEKO.x - 6, KANEKO.z], [72, -34], [66, -58], [38, -76], [18, -92], [-12, -104], [-38, -110], [-66, -134], [HON.x + 6, HON.z], [HON.x - 8, HON.z - 10]];
  // 11/19 06時 クラウド持ち主（⑥写真 260秒 坂の段：橙の点が何も無い所の宙に浮く）：点の下に篝火の籠と薪を立てる。
  //   篝火は籠と薪の二つの束で描き、照りは近い三つだけ（props.js の kagaPool）なので、描く回数と光源は増えない。点は籠の火の高さへ
  for (const [x, z] of far.slice(1, 8).concat(far.slice(9))) rt.scene.add(kagaribi(W, x, z));
  // 11/21 クラウド持ち主（⑥写真 250秒 坂の段）：夜が明けて青空の下でも橙の点が尾根の上の宙に浮いていた→ world を渡し、夜明けと共に消す（小田原と同じ）
  rt.scene.add(farFireDots(far.map(([x, z]) => [x, W.heightAt(x, z) + 1.42, z]), W));
}

// 落ちた曲輪（at の r m 内）の北条の幟を前田の幟に替える。一つの曲輪に一度だけ。幟の形は始めに作った物と同じ（材質は使い回し）
function plantMaeda(rt, at, r = 26) {
  for (const h of rt.t11Hojo || []) {
    if (h.done || Math.hypot(h.x - at.x, h.z - at.z) > r) continue;
    h.done = true; h.o.visible = false;
    rt.scene.add(nobori(rt.world, h.x + 1.2, h.z + 0.8, 'maeda', 5));
  }
}

// 曲輪の守り（段の敵の組の形）：鉄砲は上から撃つ
//   守り手は柵・虎口の内に留まる（柵の外の平地へぞろぞろ出て来た。11/8 critic60）：寄せ手が内へ入るまで追わない（追う輪を十六歩に）
// 出す位置だけでなく持ち場も同じ所へ。b_depth は off が無いと曲輪の中央を持ち場にし直す。
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, off: { x: o.dx || 0, z: o.dz || 0 }, width: o.width || 8, list, seek: o.seek || 16, morale: o.morale || 92, ...(o.noGuard ? { noGuard: true } : {}) });

// 初手と後から来る新手の両方に持ち場を渡す。打って出る組・退く組は別の段のまま。
function kuruwaFight(o) {
  const s = DP.fight(o), start = s.start, tick = s.tick, end = s.end;
  const k = PLAN.kuruwa.find((q) => q.name === o.title);
  const bind = (C) => {
    for (const g of C.groups) if (!g.t11Kuruwa) {
      g.t11Kuruwa = k; g.stay = true; g.noAI = true;
    }
  };
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx); bind(C);
    // 坂から退いた射手も金子丸の守り。段で新しく出した組だけに絞ると、
    // この組だけ柵の外まで寄せ手を追い、曲輪の内に留まらなかった。
    const bow = rt.flags.slopeBow;
    if (o.title === '金子丸' && bow && !bow.routed) {
      // 持ち場だけでなく制圧対象にも加える。外すと射手を残して曲輪が落ち、
      // 段の終わりの退く下知も届かず、落城後まで射ち続けてしまう。
      if (!C.groups.includes(bow)) {
        C.groups.push(bow);
        C.nTot = (C.nTot || 0) + live(bow);
      }
      bow.t11Kuruwa = k; bow.stay = true; bow.noAI = true;
    }
  };
  s.end = (rt, C, m, ctx) => {
    end(rt, C, m, ctx);
    for (const g of C.groups) retreat(g);
  };
  s.tick = (rt, C, m, ctx, el) => {
    // 味方だけが守りを崩しても、離れた本人の目標まで済ませない。
    // 曲輪へ入った事を残し、最後の敵を追って外へ出た時は引き返させない。
    const p = rt.player.u.pos;
    if (k && p.x >= k.poly[0][0] && p.x <= k.poly[1][0] && p.z >= k.poly[0][1] && p.z <= k.poly[2][1]) C.entered = true;
    // 11/18 クラウド持ち主：山下曲輪で曲輪の外を追い回し段が二百六十秒続いた回（act bot 734秒）。三分→一分・五分→二分へ
    // 11/18 クラウド k365-26（見回り）：act bot が高丸の段で900秒、曲輪の外で止まり時間切れ。段の長さ＋三分を過ぎ、本人が曲輪の口か縁の16m内まで来ていれば入った事にする
    if (!C.entered && k && el >= s.max + 60 && (k.gapAt.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 16) ||
        (p.x >= k.poly[0][0] - 16 && p.x <= k.poly[1][0] + 16 && p.z >= k.poly[0][1] - 16 && p.z <= k.poly[2][1] + 16) ||
        (el >= s.max + 120 && Math.hypot(p.x - (k.poly[0][0] + k.poly[1][0]) / 2, p.z - (k.poly[0][1] + k.poly[2][1]) / 2) < 45))) C.entered = true;
    const done = tick(rt, C, m, ctx, el);
    bind(C);
    // 制圧の行き先は曲輪の中央。敵の平均位置を追うと、石垣の角や柵際で止まり続ける。
    C.goal = C.at;
    // 守兵が崩れると共通の行き先は組の中心へ戻る。柵外へはぐれた兵や
    // 重傷者の位置で待たず、まず目標の曲輪へ入れるようにする。
    // 木戸を残兵が塞ぐ時は「入った後」だけの打ち切りでは道が開かない。
    // 新手まで受けた長い攻防の後、本人が木戸へ押し上げたら守りへ退く下知。
    // 退却と達成を分け、外で待っただけでは曲輪を取った事にしない。
    // 11/18 一戦を4〜7分に：本人が曲輪の口か内へ着いていれば、段の上限（max）で残りの守りは本丸の方へ退く（前は max＋200秒）
    // 11/18 20時 クラウド持ち主（act bot「本人が近藤を討つのは三回に一回」＝本人の四〜六m で段の終わりの討死）：
    //   名のある守将（o.holdName）が生きて本人の二十m 内にいる間は、段の上限から三十秒まで曲輪を落とさず、守将は本人へ斬りかかる
    const hb = o.holdName && el >= s.max - 10 && el < s.max + 30 && (C._hb || (C._hb = rt.army.units.find((u) => u.name === o.holdName)));
    if (hb && hb.alive && !hb.dying && !hb.fleeing && hb.group && !hb.group.routed && hb.group.order !== 'flee' && Math.hypot(hb.pos.x - p.x, hb.pos.z - p.z) < 20) {
      hb.group.focus = rt.player.u;   // 崩れて退く組は引き留めない（act bot「崩れた部隊が、また戦っている」）
      hb.poiseVsP = true; hb.officerBackUntil = 0; hb.target = rt.player.u; hb.aiT = 0;
      tick(rt, C, m, ctx, el); bind(C); C.goal = C.at;
      return false;
    }
    if (!C.withdrawn && !C.later?.length && el >= s.max && k &&
        (C.entered || k.gapAt.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 12))) {
      C.withdrawn = true;
      for (const g of C.groups) retreat(g);
    }
    // 11/18 クラウド持ち主：act bot が金子丸の北の口 (72,-34) の三m 外で、守りが退いた後も百五十秒立ち尽くした（ピンも無く、遊ぶ人にも次が分からない）。
    //   守りが退いた後は、曲輪の口の十m 内まで来ていれば入った事にする
    if (!C.entered && C.withdrawn && k && k.gapAt.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 10)) C.entered = true;
    // 11/21 12時 クラウド持ち主（K582 せっかちの見なし：御主殿の段で守りが尽きた後も本人が館の外にいて、六十秒 札も敵も無く百二十六秒続いた）：
    //   段の上限を過ぎて曲輪の守りが一人も残らなければ、本人の居場所に関わらず先へ
    if (!C.entered && el >= s.max && !C.later?.length && C.groups.every((g) => !live(g))) return true;
    // 11/21 17時 クラウド持ち主（K582 携帯の見なし act bot 1440秒の時切れ：本人が曳橋の袂 (80,37) に残ったまま金子丸の段が878秒終わらなかった）：
    //   段の上限＋二分を過ぎ、本人が曲輪の四十五m より外なら、守りを本丸の方へ退かせて先へ（次の休みの段で本人は本丸の下へ移る）
    if (!C.entered && k && el >= s.max + 120 && Math.hypot(p.x - C.at.x, p.z - C.at.z) > 45) {
      for (const g of C.groups) retreat(g);
      return true;
    }
    if (!C.entered) { C.goal = C.at; return false; }
    if (C.withdrawn) return true;
    if (done) return true;
    // 通しで残兵の組を追い続けて止まった。新手を含む守備の八割を崩せば制圧し、
    // 長引いても六割を崩して本人が曲輪にいる時は残兵を退かせる。待つだけでは済ませない。
    if (C.later?.length) return false;
    let left = 0;
    // 11/14 クラウド：御主殿の守り19人が石垣の外の角 (17,15) に重なって止まり、本人が届かず段が950秒続いた。
    //   一分を過ぎたら、曲輪の外（縁から三歩より外）へはぐれた守りは残りの数に入れない（段の終わりに退かせる）
    for (const g of C.groups) {
      if (!k || el < 60) { left += live(g); continue; }
      if (!live(g)) continue;
      for (const u of g.units) {
        if (!u.alive || u.gone || u.dying || u.fleeing || u.evacuatedWound || u.rearWound || u.downed || u.noTarget || u.woundOut) continue;
        if (u.pos.x >= k.poly[0][0] - 3 && u.pos.x <= k.poly[1][0] + 3 && u.pos.z >= k.poly[0][1] - 3 && u.pos.z <= k.poly[2][1] + 3) left++;
      }
    }
    const total = C.nTot || C.n0 || 0;
    const inside = k && p.x >= k.poly[0][0] && p.x <= k.poly[1][0] && p.z >= k.poly[0][1] && p.z <= k.poly[2][1];
    // 11/14 クラウド：act bot で高丸の段が370秒続き、戦が上限で切れた。曲輪へ入った後、段の長さ＋二分を過ぎて守りの四割を崩していれば残兵を退かせる
    return total > 0 && (left <= total * 0.2 || (inside && el >= s.max && left <= total * 0.4) || (el >= s.max + 120 && left <= total * 0.6));
  };
  return s;
}

// 付け入り（docs/kaito_refs_1103 の山中城の型・kaito 11/3）：御主殿の城兵が冠木門を開いて石段を下り、曳橋を渡って打って出る。
//   ① 曳橋の南の袂で迎え撃つ → 半ばを討つと石段を退く ② 退く敵に紛れて冠木門へ駆け込めば、門を閉める間を与えず御主殿へなだれ込む（F.tsukeiri）。
//   遅れれば門は固められ、虎口の上の段から鉄砲を撃ちかける新手を石段の上で討たねばならない。段は b_depth.js の形（start・tick・end）
// 打って出る組は石段の踊り場から（冠木門から歩くと、袂に着いても霧の中に誰もいなかった。11/8 critic60）
const SALLY_PATH = [[LANDING.x, LANDING.z], [BRIDGE_N.x, BRIDGE_N.z], [BRIDGE_S.x, BRIDGE_S.z + 3]];
const BACK_PATH = [[BRIDGE_N.x, BRIDGE_N.z], [LANDING.x, LANDING.z], [KOGUCHI.x + 2, KOGUCHI.z + 0.5], [GOSHU.x + 8, GOSHU.z]];
const TSUKE_SEC = 35;
const liveNear = (g, at, r) => {
  if (!live(g)) return 0;
  let n = 0;
  for (const u of g.units) if (canRejoin(u) && !u.noTarget && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < r) n++;
  return n;
};
// 11/19 クラウド持ち主（K281 の数え：曳橋への移り 130〜154秒は本人の六十m 内の敵0〜3人で空の歩き）：
//   山下曲輪が落ちたら、御主殿の虎口の上の段の鉄砲衆が先に射座に着き、谷の道を来る寄せ手へ霧の中から撃ちかける（打って出る段でもそのまま援ける）。
//   射座に留まり降りて来ない（前に谷へ置いた橋の番は山下曲輪の戦に引き込まれた）
function spawnKoguchiGun(rt) {
  const F = rt.flags;
  if (live(F.sallyGun)) return F.sallyGun;
  const gun = F.sallyGun = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '虎口の鉄砲', anchor: { x: 70, z: 15 }, facing: Math.PI, width: 9, aggro: 3, morale: 90, order: 'hold', noRout: true,
    stay: true, noAI: true },
    dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 3 }], HOJO));
  gun.dmgMult = 0.5;
  return gun;
}
function koguchiGunEarly(st) {
  const s0 = st.start;
  st.start = (rt, ...a) => { const r = s0 ? s0(rt, ...a) : undefined; spawnKoguchiGun(rt); rt.after(1.5, () => rt.say('前田の侍', '虎口の上から鉄砲じゃ！　竹束の陰を伝って橋へ', 3.2)); return r; };
  return st;
}
function sallyStep() {
  return {
    kind: 'fight', max: 240,
    start(rt, C, m, ctx) {
      const F = rt.flags;
      C.at = BRIDGE_S; C.goal = BRIDGE_S; C.groups = [];
      rt.banner('御主殿の虎口', '冠木門が開き、北条勢が石段を下りて来る');
      sfx('taiko', 0.8);
      rt.say('前田の侍', '門が開いたぞ！　城兵が打って出て来る。橋の袂で受け止めよ', 3.6);
      // 打って出る組：冠木門の内から石段を下り、曳橋を渡って寄せ手へかかる
      const g = F.sallyG = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '打って出た北条勢', anchor: { x: SALLY_PATH[0][0], z: SALLY_PATH[0][1] }, facing: Math.PI, width: 4, formation: 'yari',
        aggro: 4, morale: 95, noRout: true, order: 'path', path: SALLY_PATH, pathIdx: 0, speed: 3.6 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], HOJO));
      // 橋幅は三・四m。往復とも横隊の端を川へ出さず、折れる石段も二列でたどる。
      g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
      g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.roadColumn = false; q.aggro = 14; q.seekRange = 30; q._fitAt = 0; };
      g.dmgMult = ctx.dmg ?? 0.58;
      // 上の段（横矢の石垣の上）から鉄砲で援ける組：段に留まって撃つ
      const gun = F.sallyGun = live(F.sallyGun) ? F.sallyGun : enemyGroup(rt, { fixed: true, faction: 'hojo', name: '虎口の鉄砲', anchor: { x: 70, z: 15 }, facing: Math.PI, width: 9, aggro: 3, morale: 90, order: 'hold', noRout: true,
        stay: true, noAI: true },   // 11/18 21時 クラウド持ち主：act bot 171秒、段を下りて石段の上 (65,-4) へ寄り七人が一点に重なって止まった（★★）。上の段の射座に留める
        dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 3 }], HOJO));
      gun.dmgMult = 0.5;
      C.groups.push(g, gun);
      // 11/18 23時 クラウド持ち主（K281 の数え：付け入りの184〜219秒に本人の六十m 内の敵が6〜8人と一番薄い）：
      //   打って出た勢が下りた後の冠木門の内に、門を閉めに控える衆（侍1・足軽7）。石段の上で門を守り、付け入られたら館へ退く
      const yard0 = PLAN.kuruwa.find((k) => k.id === 'goshu').poly;
      const gin = F.gateIn = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '冠木門の内の衆', anchor: { x: yard0[1][0] - 6, z: KOGUCHI.z + 1.5 }, facing: Math.PI / 2, width: 4, formation: 'yari', aggro: 6, morale: 90, order: 'hold', seekRange: 8,
        stay: true, noAI: true, t11Kuruwa: PLAN.kuruwa.find((k) => k.id === 'goshu') },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], HOJO));
      gin.dmgMult = 0.45;
      C.groups.push(gin);
      F.sallyN = g.units.length;
      rt.obj('dp', '曳橋の袂で、打って出た北条勢を迎え撃て', 'main');
      rt.marker('dp', BRIDGE_S, '曳橋', { h: 3 });
      ctx.friends(rt).forEach((f, k) => marchTo(rt, f, { x: BRIDGE_S.x + 4, z: BRIDGE_S.z + 6 }, k));
      rt.army.play('eshout', { x: LANDING.x, z: LANDING.z }, 1.6);
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, g = F.sallyG, p = rt.player.u.pos;
      // 本人が門か御主殿へ着くまで、味方だけで付け入り・虎口突破を済ませない。
      const yard = PLAN.kuruwa.find((k) => k.id === 'goshu').poly;
      // 門の近さだけでは石垣の外でも達成した。御主殿の囲いの内へ踏み込んでから付け入りとする。
      const entered = p.x > yard[0][0] && p.x < yard[1][0] && p.z > yard[0][1] && p.z < yard[2][1];
      // 味方だけで城兵を減らしても、離れた本人の「曳橋で迎え撃つ」は済ませない。
      // 先に橋を渡って門へ押し込んだ時も、橋の袂へ引き返させない。
      // 11/18 17時 クラウド持ち主（act bot 790秒の回で迎え撃ちが267秒）：袂の十四m 内に入れないまま九十秒を過ぎたら、着いた事にして城兵を門へ退かせる
      if (Math.hypot(p.x - BRIDGE_S.x, p.z - BRIDGE_S.z) < 14 || entered || el >= 60) C.bridgeEntered = true;   // 11/18 18時半 クラウド持ち主：act bot で迎え撃ちが九十秒の回（140→230秒）。九十→六十秒
      // 11/18 クラウド持ち主：act bot「印『曳橋』に着いても6秒何も起きない」（城兵が石段を下り切る前）。袂に着いた時に石段の上から鬨と声を掛ける
      if (C.bridgeEntered && !C.bridgeSaid && (entered || Math.hypot(p.x - BRIDGE_S.x, p.z - BRIDGE_S.z) < 9)) { // 印に着いてから（14m では着く前に言い切って6秒空く）
        C.bridgeSaid = true;
        rt.army.play('eshout', KOGUCHI, 1.2);
        rt.say('前田の侍', '石段を北条の槍が下りて来る！　袂で槍を揃えよ！', 3);
      }
      // 行きも帰りも、石段や橋で列が詰まったまま待たせない。
      // 後列を待つ十五秒を過ぎても進めない時は、その場から敵へ向かわせる。
      if (g && g.order === 'path' && !g.routed) {
        const a = g.anchor, k = C.pathStall || (C.pathStall = { x: a.x, z: a.z, t: el, path: g.path });
        if (k.path !== g.path || Math.hypot(a.x - k.x, a.z - k.z) > 2) {
          k.x = a.x; k.z = a.z; k.t = el; k.path = g.path;
        } else if (el - k.t > 18) {
          // 退く列の詰まりを攻め直しに変えると、橋と石段を再び塞ぐ。
          // 門へ引く下知を保ち、残兵は通常の退路へ流す。
          if (F.sallyBack) {
            retreat(g);
          } else {
            g.order = 'attack'; g.path = null; g.onArrive = null; g.roadColumn = false; g.formation = 'yari';
            g.aggro = 14; g.seekRange = 30; g.focus = null; g._fitAt = 0;
            const c = g.center(); g.anchor = { x: c.x, z: c.z };
            for (const u of g.units) if (canRejoin(u)) { u.target = null; u.aiT = 0; }
          }
        }
      }
      // 11/19 7時 クラウド持ち主（act bot 483秒の回で曳橋の段四十八秒・本人の討ち取り0＝袂の前に立つ味方が先に受け止めた）：
      //   本人が袂の二十m 内にいて命が四割以上なら、打って出た勢は本人を目がけて来る（命が落ちれば外す）
      const PU = rt.player.u;
      if (g && g.count && !F.sallyBack && !g.routed) {
        const want = PU?.alive && PU.hp >= PU.maxHp * 0.4 && Math.hypot(p.x - BRIDGE_S.x, p.z - BRIDGE_S.z) < 20 && g.order !== 'path';
        if (want && g.focus !== PU) { g.focus = PU; for (const u of g.units) if (u.type === 'busho' || u.type === 'samurai') u.poiseVsP = true; }
        else if (!want && g.focus === PU) { g.focus = null; for (const u of g.units) if (u.target === PU) { u.target = null; u.aiT = 0; } }
      }
      // ① 迎え撃つ：半ばを討てば石段を退く
      if (!F.sallyBack) {
        rt.objProgress('dp', `敵 ${live(g)}人`);
        // 橋で四分迎え撃ち、四分の一以上を崩した時も城兵に退く下知。
        // 石段で動けなくなった残兵を待ち続けず、付け入りの攻防へ移る。
        const held = Math.hypot(p.x - BRIDGE_S.x, p.z - BRIDGE_S.z) < 14 || entered;
        // 11/18 クラウド持ち主（一戦を4〜7分に・描かずの通しで橋の迎え撃ちが86秒）：退く下知を百→六十五秒・袂で受けて七十→四十五秒へ。山下曲輪・金子丸・本丸の上限も十秒ずつ詰めた
        // 11/11 クラウドわ：橋の袂で五分受けても、霧の石段に残った城兵が七割五分を超えると退かず、段が刻限まで続いた（act bot・本人は袂 85,34）。五分で城兵は門へ引く
        if (C.bridgeEntered && (live(g) <= F.sallyN * 0.5 || (held && el >= 45 && live(g) <= F.sallyN * 0.75) || el >= 65)) {
          F.sallyBack = true; C.backT = el;
          // 詰まり回避が参照する段の場所も冠木門へ移し、石段から橋へ引き返させない。
          // 自動操作の停止半径四mを含めても、石垣の内へ着く位置に置く。
          C.at = C.goal = { x: yard[1][0] - 5, z: KOGUCHI.z + 0.4 };
          g.order = 'path'; g.path = BACK_PATH; g.pathIdx = 0; g.speed = 3.2; g.aggro = 0; g.noRout = true; g.focus = null;
          g.formation = 'column'; g.roadColumn = true;
          g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.roadColumn = false; q.aggro = 8; q._fitAt = 0; };
          for (const u of g.units) if (u.alive) { u.target = null; u.aiT = 0; }
          rt.say('北条の侍', '引け！　門の内へ引け！', 2.6);
          rt.after(1.2, () => rt.say('前田利長', '退く敵に続け！　門を閉めさせるな！', 3.4));
          rt.obj('dp', '退く敵に続き、石段の上の冠木門へ駆け込め', 'main');
          rt.unmark('dp'); rt.marker('dp', C.goal, '冠木門', { h: 3 });
          ctx.friends(rt).forEach((f, k) => marchTo(rt, f, C.goal, k));
        }
        return false;
      }
      // ② 付け入り：本人が退く敵に追いすがって冠木門へ
      if (!F.tsukeiri && !F.gateShut) {
        rt.objProgress('dp', '');   // 残りの秒の字は出さない（画面の字は名前・数・目標だけ。11/8 critic60）
        // 11/18 23時40分 クラウド持ち主（act bot 639秒：付け入りが 80秒＝冠木門の内の衆が門を塞ぎ、門を固められた）：本人が虎口の十二m に来たら、門を閉め切れず館へ崩れる
        if (F.gateIn?.count && !F.gateIn.routed && Math.hypot(p.x - KOGUCHI.x, p.z - KOGUCHI.z) < 12) { retreat(F.gateIn); rt.say('北条の侍', '門が閉まらぬ！　館へ引け！', 2.4); }
        // 門の内へ入った後は、行き先を後ろに残さず御主殿の戦へ進む。
        if (entered) {
          F.tsukeiri = true;
          rt.banner('付け入り', '門を閉める間を与えず、御主殿へなだれ込む');
          sfx('horagai', 0.8);
          rt.award((t) => t.side.push('退く敵に続き、冠木門へ付け入った'), '冠木門へ付け入った');
          for (const q of [g, F.sallyGun, F.gateIn]) retreat(q);
          return true;
        }
        if (el - C.backT > TSUKE_SEC) {
          F.gateShut = true;
          rt.say('前田の侍', '門を固められた！　石段を押し上れ！', 3.2);
          // 本から足した（shiro_semekata_tsukurikata：八王子城は御主殿に石垣と虎口を持つ・関東の土の城には珍しい）
          rt.after(22, () => { if (!rt.flags.ending) rt.say('古参の足軽', '関東の城に石垣とは……。氏照め、ここで本気で籠る気じゃったな', 3.6); });
          // 石垣の境（東端六十）に隊列を置かず、門の内側から守る。
          const ng = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '冠木門の守り', anchor: { x: yard[1][0] - 7, z: KOGUCHI.z }, facing: Math.PI / 2, width: 5, aggro: 10, morale: 90, order: 'hold', seekRange: 14,
            stay: true, noAI: true, t11Kuruwa: PLAN.kuruwa.find((k) => k.id === 'goshu') },
            dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], HOJO));
          ng.dmgMult = ctx.dmg ?? 0.58;
          C.groups.push(ng); F.gateG = ng;
        }
        return false;
      }
      // 門を固められた時：冠木門の守りを討てば虎口を抜ける（虎口の鉄砲は上の段にいて、門の内からしか届かない。抜ければ崩れる）
      // 11/11 クラウドわ：門の守りは虎口から離れた所（石垣の下・館の奥）へ散っても数えられ、本人が御主殿の内 (59,3) に居て四十m 内に敵が無いまま刻限まで止まった。
      //   虎口の二十五m 内に残る者だけを数え、門の守りが絶えた後は、石段の上まで来ていれば内へ入りきらなくても先へ（石段の端で揺れて入れない回があった）
      let rest = liveNear(F.gateG, KOGUCHI, 25);
      // 門内への到着を退却の前提にすると、門前を塞ぐ残兵のため永遠に到着できない。
      // 石段の上まで押し上げた攻防に限り、長引いた守備を退かせて通り道を開く。
      const gateTime = el - C.backT;
      if (!C.gateWithdrawn && Math.hypot(p.x - KOGUCHI.x, p.z - KOGUCHI.z) < 18 &&
          ((gateTime >= 180 && rest <= F.gateG.units.length * 0.3) ||
           (gateTime >= 240 && rest <= F.gateG.units.length * 0.5) || gateTime >= 300)) {
        C.gateWithdrawn = true;
        for (const q of C.groups) retreat(q);
        rest = 0;
      }
      // 11/19 8時 クラウド持ち主（act bot 1440秒の時切れ：門を固められた後、本人が虎口の十八m 外で止まり、段④が184秒から終わらず討ち取り0）：
      //   門を固めて二百秒を過ぎたら、本人の居場所に関わらず守りを館へ退かせ、行き先を虎口の内へ移して先へ進める
      if (!C.gateWithdrawn && gateTime >= 100) {   // 11/21 12時 クラウド持ち主（K582 せっかちの見なしで冠木門の段が百三十九秒→直した後も百五秒・一戦600秒で切れた）：二百→百秒
        C.gateWithdrawn = true;
        for (const q of C.groups) retreat(q);
        rt.say('前田の侍', '門の守りが館へ崩れた！　虎口を抜けよ！', 3);
        return true;
      }
      rt.objProgress('dp', `冠木門の敵 ${rest}人`);
      if (rest === 0 && Math.hypot(p.x - KOGUCHI.x, p.z - KOGUCHI.z) < 25) return true;
      // 門内へ攻め入った事を残す。残兵を追って庭の縁へ出ても突破を取り消さない。
      // 五分粘った守りは退く下知を受ける。守兵の過半が石段に残ると、
      // 門内へ入っても段の上限が無いまま終わらないため。
      if (entered) C.gateEntered = true;
      return !!C.gateEntered && (rest <= 2 || (el - C.backT >= 180 && rest <= F.gateG.units.length * 0.3) ||
        (el - C.backT >= 240 && rest <= F.gateG.units.length * 0.5) || el - C.backT >= 300);
    },
    end(rt, C) {
      for (const q of C.groups) retreat(q);
      rt.unmark('dp');
      rt.objDone('dp');
      rt.flags.sallyDone = true;
      if (!rt.flags.tsukeiri) rt.award((t) => t.side.push('御主殿の虎口を破った'), '御主殿の虎口を破った');
    },
  };
}

// ⑤ の締め：中山勘解由を自分で討つ（10m 手前で勝ちが出て、討ち取ったりも最期も見えなかった。11/8 critic60）。
//   中山は供の侍三人と本丸の奥に残る。主人公の攻撃だけが通る。放置や段の時間切れでは勝ちにしない。
function nakayamaStep() {
  return {
    kind: 'fight', max: 240, limit: Infinity, idleAdvance: false,
    start(rt, C) {
      const F = rt.flags;
      C.at = { x: HON.x - 4, z: HON.z - 3 }; C.goal = C.at; C.groups = [];
      const g = F.nakaG = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '中山勘解由', anchor: C.at, facing: Math.PI * 0.25, width: 3, aggro: 10, morale: 100, noRout: true, order: 'hold', seekRange: 10 },
        dress([{ type: 'busho', n: 1, o: { name: '中山勘解由', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 1 }], HOJO));   // 11/18 一戦を4〜7分に：供を一人に（三人が打ち込み口を塞ぎ、本丸の段が二〜十二分続いた）
      g.dmgMult = 0.6;
      C.groups.push(g);
      F.naka = g.units.find((u) => u.name === '中山勘解由');
      // 供も自分の持ち場へ戻す。一点へ集めると中山への打ち込み口を塞ぐ。
      for (const u of g.units) u._t11Home = { x: u.pos.x, z: u.pos.z };
      // 二巡 11/9：bot が三分あまり斬り合っても討ち切れず、戦が終わらなかった（kaito「名のある武将の体力が高すぎて討てない」）
      // 11/10 クラウド：六割でも命が百数十あり、受けで傷も浅く、act の bot が九分斬り続けても討てなかった。五、六太刀で討てる命（60）に
      if (F.naka) { F.naka.maxHp = Math.min(F.naka.maxHp, 45); F.naka.hp = Math.min(F.naka.hp, F.naka.maxHp); }
      // 主人公が近くにいるだけで味方が討つのを防ぐ。この段の間だけ攻撃元を確かめる。
      C.damage = rt.army.damage;
      C.lastWords = false;
      g.dmgMult = 0;
      rt.army.damage = function (target, amount, source, opts = {}) {
        if (target === F.naka && (!C.lastWords || source !== rt.player.u)) { if (opts.out) opts.out.res = 'armor'; return; }
        return C.damage.call(this, target, amount, source, opts);
      };
      rt.obj('dp', '本丸で、中山勘解由を自ら討て', 'main');
      // 印は頭上の名札と金の▼だけ（赤い札を重ねない）
      rt.say('前田の侍', '中山殿、降られよ！　前田様が、命は助けると仰せじゃ！', 3.4);
      rt.after(3.6, () => {
        rt.say('中山勘解由', '二心は持たぬ。北条の城、ただでは渡さぬ！', 3.4);
        // 助命を断る返答を見せてから斬り合う。返答前の討死や、話の間の一方的な攻撃を防ぐ。
        // 11/18 17時 クラウド持ち主（act bot「受けた傷0・もっと強い奴と斬り合いたい」）：中山と供は本人の軽い突きでは振りを止めない（根白坂と同じ u.poiseVsP）
        rt.after(3.4, () => { C.lastWords = true; g.dmgMult = 0.6; for (const u of g.units) if (u.type === 'busho' || u.type === 'samurai') u.poiseVsP = true; });
      });
    },
    tick(rt, C, m, ctx, el = 0) {
      const n = rt.flags.naka;
      if (!n) return false;
      if (n.alive) C.goal = n.pos;
      // 11/21 12時 クラウド持ち主（K582 携帯の見なし・せっかち：本人が本丸の口の外三十m で足軽と斬り合い続け、中山へ届かず十分で切れた）：
      //   斬り合いが始まって四十秒たっても本人が中山の二十m 外にいたら、中山と供は本丸の口を出て本人の前へ打って出る（持ち場を本人の居場所へ移す。四十秒ごとに一度まで。本人の命が四割より下の時は打って出ない＝中学生の見なしで深手の本人を囲んで倒した）
      const PU0 = rt.player.u;
      if (C.lastWords && n.alive && PU0?.alive && PU0.hp >= PU0.maxHp * 0.4 && el - (C.sortT ?? 0) >= 40 && Math.hypot(n.pos.x - PU0.pos.x, n.pos.z - PU0.pos.z) > 20) {
        C.sortT = el;
        C.home = { x: PU0.pos.x, z: PU0.pos.z };
        for (const q of rt.flags.nakaG?.units || []) if (canRejoin(q)) { q._t11Home = { x: PU0.pos.x + (q === n ? 0 : 2), z: PU0.pos.z + (q === n ? 0 : 2) }; q._t11Returning = false; q.moveTo = null; q.target = PU0; q.aiT = 0; }
        if (!C.sortSaid) { C.sortSaid = true; rt.say('中山勘解由', '待つのは性に合わぬ！　我が首、取れるものなら取ってみよ！', 3.2); }
      }
      // 中山と供は本丸に残って果てる。深手で退く本人を小宮曲輪まで七十m 追い、手当ての間も与えず十二分止まった（11/10 act の bot）。
      //   本丸の持ち場から十四m より離れたら狙いを解いて持ち場へ戻す
      const home = C.home ||= { x: C.at.x, z: C.at.z };
      for (const q of rt.flags.nakaG?.units || []) {
        if (!canRejoin(q)) continue;
        const at = q._t11Home ||= { x: home.x, z: home.z };   // 後から組に入った兵は持ち場が無く、ここで落ちて戦が止まった（11/18 クラウド）
        if (Math.hypot(q.pos.x - home.x, q.pos.z - home.z) > 14) q._t11Returning = true;
        if (!q._t11Returning) continue;
        // 11/18 16時 クラウド持ち主（act bot 458秒「中山の侍が6秒なにもしない」）：戻る途中でも本人が四歩の内なら戻りを解いて打ち合う
        const PU = rt.player.u;
        if (PU?.alive && Math.hypot(q.pos.x - PU.pos.x, q.pos.z - PU.pos.z) < 4) { q._t11Returning = false; if (q.moveTo === at) q.moveTo = null; q.target = PU; continue; }
        // 十四mの境で追撃を再開して往復せず、持ち場まで戻ってから守る。
        if (Math.hypot(q.pos.x - at.x, q.pos.z - at.z) < 2) {
          q._t11Returning = false;
          if (q.moveTo === at) q.moveTo = null;
          continue;
        }
        q.target = null; q.atk = null; q.moveTo = at;
      }
      // 出た後に名のある将の命が一・五倍へ戻る（共通の手直し）ので、斬り合いが始まる時にもう一度六十へ
      if (C.lastWords && !C.capped) { C.capped = true; n.maxHp = Math.min(n.maxHp, 45); n.hp = Math.min(n.hp, n.maxHp); }
      // 自ら討つ目標は時間では済ませない。味方の攻撃も start の傷の判定で防ぐ。
      return !n.alive;
    },
    end(rt, C) {
      rt.army.damage = C.damage;
      rt.unmark('dp'); rt.objDone('dp');
      rt.banner('中山勘解由、討ち取ったり', '助命を断り、本丸に果てる');
      sfx('horagai', 0.8);
    },
  };
}

// K661（11/26 Sanae）：前田勢の布陣（利家の本陣・手勢・前田の先手・利長の旗本・前田の二の手）。元の setup の同じ所から呼ぶ（順は前と同じ）。
//   側は t11_hachioji/side.js（h08 北条編は前田が team 1）
function maedaForces(rt) {
  const F = rt.flags;
  // ---- 前田勢：自分の手勢と前田の先手。利家は寄せ口の本陣に残る ----
  // 総大将の利家は寄せ口の陣幕の内に座り、前へ出ない（kaito AR3・AV7）。旗本の侍と槍が幕の前を固める
  // 11/19 iMac army-10：城の守りの兵は曲輪に立つまで少なく、布陣の表（fujin_layout.js）が使う敵の装束の手本が出来ない。北条の手本をここで置く
  if (!SH.flip) { const T = rt._tpl || (rt._tpl = {}); if (!T.E) T.E = { o: { faction: 'hojo', formation: 'yari', morale: 80 }, list: dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 5 }], HOJO) }; }
  F.honjin = allyGroup(rt, { faction: 'maeda', name: '前田利家の本陣', anchor: { x: START.x + 9, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 0, order: 'hold', fixed: true, noRout: true, noAI: true },
    dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: false } }, { type: 'samurai', n: 10, o: { invuln: true } }, { type: 'ashigaru', n: 12, o: { invuln: true } }], MAEDA));
  F.mine = allyGroup(rt, { faction: 'maeda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], MAEDA));
  F.saki = allyGroup(rt, { faction: 'maeda', name: '前田の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], MAEDA));
  // 先手の大将の利長は馬上で旗本の侍に囲まれ、先手の後ろから下知する（足軽にまじって最前で歩いて戦っていた。11/8 critic60）
  F.naga = allyGroup(rt, { faction: 'maeda', name: '前田利長の旗本', anchor: { x: START.x - 2, z: START.z - 8 }, facing: -Math.PI / 2, width: 4, aggro: 2, noRout: true, order: 'hold', seekRange: 6 },
    dress([{ type: 'busho', n: 1, o: { name: '前田利長', invuln: true, horse: true } }, { type: 'samurai', n: 6, o: { invuln: true } }], MAEDA));
  // 前田の二の手：先手の後ろから続く（寄せ手は城兵の五倍。史実の比は docs/battle_refs/t11_hachioji.md）
  F.ni = allyGroup(rt, { faction: 'maeda', name: '前田の二の手', anchor: { x: START.x - 4, z: START.z + 12 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
    dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], MAEDA));
  for (const g of [F.mine, F.saki, F.ni]) { g.defMult = 1.2; g.dmgMult = 0.8; }
  // 利家は幕の奥の床几に座ったまま（陣中の待ち：u.jinchu。敵は寄せ口まで来ない）
  const toshiie = F.honjin.units.find((u) => u.name === '前田利家');
  if (toshiie) { toshiie.pos.x = START.x + 10; toshiie.pos.z = START.z - 2.5; toshiie.heading = Math.PI / 2; toshiie.jinchu = { standing: false, danger: false, soldiers: [] }; }
}

const t11_hachioji = {
  realCap: IMAC_TOUCH ? 250 : 250 + fujinRealN('t11_hachioji'),   // 11/19 iMac army-10（kaito「天王寺レベルの軍勢」）：パソコンは布陣の表（fujin_layout.js）の分を上限に足す。携帯は今まで
  noPursuit: true,   // 11/18 iMac の検品：囲む・攻め上る戦（開城・落城）なのに「〜、追撃」の知らせが出た。城攻めの戦（太田・千石堀・小谷）と同じく追撃の知らせを出さない
  // 11/4 p100：行き先の印は今の目標の金の▼一つだけ（kaito AL・AN・AP12）。奥の軽い乱戦（front_fill）も置かない（AA）
  lethal: { soft: true },   // 命懸けの戦場（11/9 係A：bot が倒れる・止まるので soft）
  // 曳橋・尾根を進む徒歩の隊へ、共通の割合で騎馬を足さない。利長の馬上指定は保つ。
  noCavalryMix: true,
  noFrontFill: true, kumiLead: false, noGoalCount: true, goalSignNameOnly: true, noLeaderFollow: true,
  goalSignTriangle: true,   // 行き先は金の▼。共通の既定の矢印へ戻さない。
  keepBattleSigns: true,   // 行き先の印が出ている間も、両軍の人数の棒と武将の名札を隠さない。
  enemySignMinPixels: 28,   // 普通の敵も大きな赤い▼。共通の最後の縮小で小さな所属印へ戻さない。
  ownEnding: true,   // 終幕の段で落城を見せるため、共通の落城場面を重ねない。
  namedKillCompletesObjectives: false,   // 将の討取りだけで札を済ませず、曲輪への到着・守備の撃退・最後の返答を各段で確かめる。
  goalVisibleRows: 5, goalRowsAhead: true,   // 始めから今の五件を並べ、後半も現在の目標と続きの場所・行いを残す
  waitForPortrait: true,   // 顔を撮れるまで影の顔を出さず、本人の顔だけを一度表示する（critic60 五6）。
  clampCamera(rt, camera) {
    const p = rt.player, u = p.u;
    if (!u.alive || p.fpK >= 0.01 || p.aiming || p.camShot || p.cine) return;
    // 曳橋の手すりでカメラが寄ると、共通の近接処理が本人まで隠していた（11/10 通し確認）。
    // 橋上だけは肩の上へ逃がし、騎馬も体を隠す高さにカメラを残さない。
    const dx = BRIDGE_N.x - BRIDGE_S.x, dz = BRIDGE_N.z - BRIDGE_S.z;
    const t = ((u.pos.x - BRIDGE_S.x) * dx + (u.pos.z - BRIDGE_S.z) * dz) / (dx * dx + dz * dz);
    if (t < 0 || t > 1 || Math.hypot(u.pos.x - BRIDGE_S.x - dx * t, u.pos.z - BRIDGE_S.z - dz * t) > 1.7) return;
    // 共通カメラの最短距離は1.6m。境界と補間中の僅かなずれも拾う。
    if (Math.hypot(camera.x - u.pos.x, camera.z - u.pos.z) <= 1.65) camera.y = Math.max(camera.y, u.pos.y + (p.mounted || u.mounted ? 3.6 : 2.5));
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  marchIn: { road: [[229, 4], [203.5, 29.5], [182.2, 50.8]], facing: -1.5708 },   // 11/20 K474：谷の東の下から歩いて入る（敵の城は西）
  noWake: true,
  introText: '城主の北条氏照は小田原に籠もり、八王子城は城代と数千で守る。霧の夜明け前、前田勢と大手から攻め上れ。',   // 11/17 クラウド k365-26：始めの説明（誰が・どこで・なぜ・自分の役目）
  minutes: 15,
  // 11/9 軍勢の厚み（docs/army_depth_howto.md）：大手の前田勢の陣立て（先手・手勢・二の手・利長の旗本・利家の本陣）と、
  //   谷の下に控える前田の後備、搦手の上杉勢。本物の隊は bind で結ぶ（描かず、本物から読む）。城方は曲輪ごとに段の中で出るので表に入れない
  depth: {
    A: { name: '前田・上杉', facing: -Math.PI / 2, honjin: { x: START.x + 9, z: START.z }, mpu: 8, formation: '長蛇', terrain: 'valley', flag: 'maeda', armor: 0x24221f, openAt: 20, attrition: 0,
      sonae: [
        // 布陣図（docs/fujin/t11_hachioji.md）の各備の兵数。戦う本物の兵は増やさない。
        { id: 'saki', layer: 'sakite', wing: 'center', men: 5000, taisho: '', bind: (rt) => rt.flags.saki },
        { id: 'mine', layer: 'ichi', wing: 'center', men: 1500, taisho: '', bind: (rt) => rt.flags.mine },
        { id: 'ni', layer: 'ni', wing: 'center', men: 5000, taisho: '', bind: (rt) => rt.flags.ni },
        { id: 'naga', layer: 'yobi', wing: 'center', men: 1000, taisho: '前田利長', bind: (rt) => rt.flags.naga },
        { id: 'uesugi', layer: 'ichi', wing: 'right', men: 10000, taisho: '藤田信吉', flag: 'uesugi', bind: (rt) => rt.flags.uesugi },
        { id: 'ato', layer: 'gozume', wing: 'center', men: 3000, taisho: '', at: { x: START.x + 34, z: START.z + 2 }, hold: true },
        { id: 'honjin', layer: 'honjin', wing: 'center', men: 8000, taisho: '前田利家', bind: (rt) => rt.flags.honjin, hold: true },
      ] },
    honjinView: { A: false },   // 利家の陣幕は戦のファイルが作る
  },
  // 11/14 クラウド：坂〜本丸の尾根の細い曲輪では、待つ備の新手が段の守りに重なって本人を撃ち（act 三回とも金子丸で倒れ、傷の一番が新手）、
  //   bot の的にも段の守りにも入らない。尾根の段の間は待つ備を畳む（岩村の追い討ちと同じ手）
  // 曳橋へ向かう段から畳む。御主殿の石垣の角（17,15）でも新手十二人が重なって止まった。
  // 橋・虎口の守備は各段の城兵が担い、中山との打ち合い・落城の余韻まで新手を再開しない。
  reserveFold: (rt) => { const D = rt.flags.dp; return !!(D?.on && D.i >= IX.bridge && D.i <= IX.rakujo); },
  // 11/18 15時 クラウド持ち主（act bot 3回とも受けた傷 足軽0・侍0「ちょっと簡単すぎる・もっと強い奴と斬り合いたい」）：有岡と同じく、
  //   順を待つ城兵の三人に一人は本人の脇へ回り、本人を狙う振りは振りかぶりの間も向き直って四歩内で当てる（army_think.js・army_combat.js）
  flankWaiters: true,
  flankAng: 1.4,   // 11/18 cloud-21：1.75（±0.22）では脇でなく背（構えの向きから百十度余り）へ回り、背からの侍の一太刀48 で倒れた（cloud-27 の見回り 366秒）。脇（七十〜九十五度）に留める
  floorMult: (rt) => (rt.player?.lastHit?.back && rt.player.lastHit.t === rt.t ? 0.8 : 1),   // 背からの一太刀だけ床を八割に（下限0.8倍の線まで）
  closeCombatAssist: true,
  // 11/19 5時 クラウド持ち主（⑥写真 130秒：本人が馬のまま御主殿の虎口の石段を登り、三人称は石段を真上から・一人称は馬の頭と石の面だけ）：
  //   霧の夜の山城の寄せは徒で登る（利家・金子・中山も徒）。本人と組の騎馬も徒に揃え、狭い石段と尾根を馬で塞がない（比叡山・越前と同じ）
  noHorse: true,
  reserveDmgMult: 0.3,   // 11/14 クラウド：共通の待つ備の新手（既定 0.7）が尾根の曲輪で倒れの傷の一番だった。城方の守り（0.36）にそろえて軽く
  // 11/8 15分の構成：段が八つ続く長い山城攻め。傷が積もって途中で倒れ続けないよう、受ける傷を少し軽く・戦わない間の戻りを早く
  playerTaken: 0.5,   // 二巡 11/9：bot が山下曲輪で二回続けて倒れた（敵の打ち込みも 0.58→0.45）
  playerRegen: 0.012,
  pacingCap: 1380,   // 共通の打ち切り（十八分）を二十三分へ。段が十二の十五分の戦（battle_pacing.js）
  // 戦固有の lose が交戦の有無を確かめる。共通の打ち切りで放置中に敗北させない。
  pacingWait: () => true,
  world: {
    // 打ち手の数は戦の定義でなく地形の定義から読む。狭い曲輪での同時の打ち込みは二人まで。
    playerAtkMax: 2,
    noFake: true,   // 11/14 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    namedKacchu: TOYO_MAEDA_KACCHU,
    seed: 1590623,
    time: 'night',
    // 丑の刻の濃い霧：星も月も見えず、灰の霧の奥は四十間ほどで消える（前夜から霧に包まれた。『北条記』）
    //   月も霧に隠れて地面に影は落ちない（日の影のようにくっきり落ちていた。11/8 critic60）：直の光を絞り、霧の散る光で形を見せる
    // 空の色だけでは星と月は隠れない。雲で覆い、直接光を止めて霧の夜に日の影を落とさない。
    nightLight: { sky: 0x464c56, fog: 0x434952, top: 0x262b33, cover: 1, vis: 85, sunI: 0, hemiI: 0.62, hemiSky: 0x80858f, hemiGround: 0x3a3833 },
    mist: true,
    // 行き先以外の大きな輪を重ねず、降る矢と着弾で危険を伝える。
    arrowRainGroundCue: false,
    arrowRainAreaShadow: false,   // 急坂をまたいで浮く大きな平面の影を出さず、矢ごとの影を残す。
    naturalArrowRain: true,
    groundHalf: 280,
    // 石段と尾根では四隅の補間と描く面が最大四十糎ずれ、石・本人が浮くか埋まっていた。
    // 人・馬・手置きの石も、描く地面と同じ三角形の高さにそろえる。
    terrainTriangles: true,
    paths: [ROUTE.slice(0, 9), ROUTE.slice(8)],
    height,
    // 11/19 夜50-24（act bot 166秒：虎口の鉄砲7人が (55,-3) で一点に重なって止まる）：遠い兵が slot から外れた時の持ち場の番号ずらしを attack・move にも
    farSpread: 'all',
    moveWay: hachiojiWay,
    fleeWay: hachiojiFleeWay,
    streams: [{ pts: RIVER, w: 3, depth: 1.2 }],
    // 11/18 22時 クラウド持ち主（⑥写真）：夜明け前の御主殿の庭の白い砂利が雪の一枚に見えた。梅雨の六月、湿って黒ずんだ土を半ば混ぜる
    muddyCastleFloor: 0.8,   // 11/18 23時 クラウド持ち主：付け入りの写真（192秒）でも庭が白っぽい→梅雨の六月の湿った土を半ば→八割（小谷・佐和山・一宮と揃える）
    tint(x, z, h, c) {
      // 尾根の道と曲輪の土
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 谷の河原
      if (distToPolyline(x, z, RIVER) < 6) { c.setRGB(c.r * 0.5 + 0.23, c.g * 0.5 + 0.23, c.b * 0.5 + 0.2); return; }
      // 山の上の曲輪は踏み固めた黒い土（砂利の平場にしない。八王子城は土の城。11/8 critic60）
      if (h > 26 && PLAN.kuruwa.some((k) => k.floor === false && k.id !== 'ote' && x > k.poly[0][0] - 1 && x < k.poly[1][0] + 1 && z > k.poly[0][1] - 1 && z < k.poly[2][1] + 1)) { c.setRGB(c.r * 0.35 + 0.13, c.g * 0.35 + 0.11, c.b * 0.35 + 0.08); return; }
      // 山の杉と檜の下の暗い土と苔
      if (h > 12) c.setRGB(c.r * 0.72, c.g * 0.82, c.b * 0.7);
    },
    moveLim: 250,   // 後備え（x 216）と谷の道（x 230）を内に収め、東へ退く兵も退場地点（x 245 の外）まで歩ける。地面は半径280
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 9 && x < k.poly[1][0] + 9 && z > k.poly[0][1] - 9 && z < k.poly[2][1] + 9),   // 曲輪の中で戦う時、後ろのカメラの前に木を置かない（11/4 p100：小宮曲輪で杉が画面をふさいだ）
    trees: 520,
    tufts: 2600,
    // 11/19 クラウド持ち主（⑥写真 192秒：虎口の脇の山肌が草も藪も無い緑の一枚に見えた）：草の本数は変えず、道肩と虎口・坂の脇の斜面へ群れて寄せる（重さは同じ）
    roadsideGrass: true,
    undergrowthBands: [{ x: 56, z: 12, w: 10, d: 8 }, { x: 60, z: -18, w: 6, d: 14 }, { x: 86, z: -16, w: 7, d: 12 }, { x: 104, z: 30, w: 12, d: 6 },
      // 11/19 クラウド持ち主（⑥写真 420秒：本丸の土が草の無い明るい一枚）：本丸の柵の内の縁（北と西の隅）に、踏まれ残った夏草の株を寄せる（本数は同じ）
      { x: -92, z: -146, w: 3, d: 3 }, { x: -80, z: -148, w: 9, d: 1.5 }, { x: -94, z: -128, w: 1.5, d: 5 },
      // 11/19 5時半 クラウド持ち主（⑥写真 260秒：金子丸の下の坂の道の東の肩が草の株の無い緑の一枚）：坂の道の東の肩にも株の群れを寄せる
      { x: 77, z: -24, w: 2.5, d: 9 }],
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
      if (distToPolyline(x, z, RIVER) < 7) return 0.15;
      return z < 20 || z > 75 ? 1.2 : 0.35;
    },
    groves: [{ x: 120, z: 84, r: 16, n: 22, kind: 'sugi' }, { x: 110, z: -10, r: 18, n: 26, kind: 'sugi' }, { x: -40, z: -60, r: 18, n: 26, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -170 || x < -130 : x > 245),
  },

  checkpointStep: depthCheckpointStep, resumeSteps: depthResumeSteps,   // 戦の途中の保存（K363・b_depth.js）
  // K711③（kaito 11/26「布陣図ちゃんとできてるか全戦確認」）：開戦の霧の間（始めの十四秒）と各段の前は、城の守りの組がまだ戦場に立っておらず、
  //   大きな地図に敵の駒が一つも無かった。まだ落としていない曲輪の守り（docs/battle_refs/t11_hachioji.md の布陣）を、布陣の予定として薄い駒で出す（hud_map.js が描く・物は作らない）。
  //   北条の側で遊ぶ h08（sideFlip）は守りが味方なので出さない
  mapPlan(rt) {
    if (rt.def?.sideFlip) return [];
    const D = rt.flags.dp, i = D?.on ? D.i : -1, seen = new Set((rt.army?.groups || []).filter((g) => g.team !== 0 && g.count).map((g) => g.name));
    const at = START, face = (p) => Math.atan2(at.x - p.x, at.z - p.z);
    return [['ote', '近藤出羽守', OTE], ['bridge', '打って出た北条勢', BRIDGE_N], ['goshu', '冠木門の守り', KOGUCHI], ['goshu', '御主殿の衆', GOSHU], ['kaneko', '金子丸の守り', KANEKO],
      ['taka', '高丸の守り', TAKA], ['matsuki', '小宮曲輪の守り', MATSUKI], ['naka', '中山勘解由', HON]]
      .filter(([k, n]) => IX[k] > i && !seen.has(n)).map(([, name, p]) => ({ name, x: p.x, z: p.z, facing: face(p) }));
  },
  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    const W = rt.world, F = rt.flags;
    shSide(!!rt.def?.sideFlip);   // K661：元の戦は前田が team 0（前と同じ）
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    yield* HACHI_FIELD.castle(rt);   // K651：曲輪・曳橋と石段・旗と篝火・御主殿と会所・霧の薄め（戦場を建てる所。北条編 h08 も同じ物を呼ぶ）
    // 隊旗と名札の紋も組の家から読むので、兵の指物だけでなく組も前田家にそろえる。
    maedaForces(rt);   // K661：前田勢の布陣（h08 は側を入れ替えて同じ関数を呼ぶ）
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    // 攻めの始めは丑の刻（午前二〜三時）の闇と濃い霧。山下曲輪が落ちる頃に夜が白み、本丸の段で朝日（docs/battle_learn/t11_hachioji.md）
    W.setTime('night', true);
    // 竹束：寄せ口から山下曲輪の木戸の前と、曳橋の南の袂に並べる（木戸の内と石段の上の鉄砲を受ける。陰の者は前からの矢玉を防ぐ）
    patchGunCover(rt);
    for (const [x, z] of [[158, 45], [158, 48], [158, 56], [158, 59], [154, 42], [154, 62], [150, 44], [150, 47], [146, 44], [146, 60], [90, 41], [93, 44], [96, 47], [87, 45]]) addTaba(rt, x, z, 0, { fixed: true, rot: -Math.PI / 2 });
    // 石弓（石落とし）：山下曲輪の南の上の段から大手の道へ、金子丸と本丸の口から尾根の道の脇の斜面へ。曲輪が落ちるまで
    //   落ちる筋は道の五、六歩脇（道の真上だと一つの石で登る列が皆倒れた。佐和山と同じ）
    const at = (k) => (F.dp?.on ? F.dp.i : -1) === k;
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.rocks = makeRockTraps(rt, { posts: [
      { id: 'ote', team: 1, stock: 4, interval: [9, 14], lane: [[138, 78], [142, 66], [146, 58]], active: () => at(IX.ote) },
      { id: 'kaneko', team: 1, stock: 3, interval: [10, 15], lane: [[78, -36], [78, -24], [77, -12]], active: () => at(IX.kaneko) },   // 坂の段（sakamichi）では落とさない（坂の斬り合いの脇を転がり、bot が石だけで倒れた）
      { id: 'hon', team: 1, stock: 3, interval: [10, 15], lane: [[-62, -141], [-50, -129], [-37, -118]], active: () => at(IX.hon) }] });
    // 小宮曲輪は櫓を置かない土の曲輪。内応の火は段の開始時に南の柵へ掛ける。
    rt.setPhase('brief');
    rt.obj('main', '日が昇り切る前に、山の上の本丸を落とせ', 'main');
    // 戦の前（筋書きの一枚の言葉）。利家は降るよう使いを出したが、城は使いを斬った（『北条記』）。先手は先に降った北条の将たち
    rt.say('前田利家', '降れと遣わした使いを、城は斬って返した。今日のうちに落とし、小田原に見せる', 4.5);
    rt.after(5, () => rt.say(nm(rt), '霧と闇で、前の兵の背も見えませぬ', 3.5));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    rt.after(9, () => rt.say('前田利家', '上杉殿と真田殿は搦手から寄せる。我らは大手じゃ。先手は降った大道寺らが行く', 4));
    rt.after(13.5, () => {
      rt.say('前田利長', '城を守るは城代の横地監物、中山勘解由、近藤出羽守ら。氏照はおらぬ。かかれ！', 3.6);
      for (const s of ['近藤出羽守', '金子家重', '狩野一庵', '中山勘解由', '横地監物', '大石信濃守']) revealName(rt, s);
    });
    rt.after(14.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // 11/19 7時 クラウド持ち主（act bot 7戦続けて 受けた傷の刃0・受け流し31〜50回「無傷で大勢」）：腕の立つ城兵は同じ手を続けて食わない。
    //   同じ侍・武将の刃を受け流した後の六秒は、その者の次の刃は受け流せず構えで受ける（関ヶ原と同じ型。敵の数・強さ・一太刀の重さは変えない）
    { const P = rt.player, td = P.takeDamage;
      if (td && !P._t11Cut) {
        P._t11Cut = true;
        P.takeDamage = function (a, s) {
          if (!s || s.isStruct || (s.type !== 'samurai' && s.type !== 'busho') || this.u?.hitKind === 'gun' || this.u?.hitKind === 'arrow') return td.call(this, a, s);
          const p0 = rt.stats.parries || 0, g0 = this.guardT, noParry = (s._t11ParT || 0) > rt.t && this.guard;
          if (noParry) this.guardT = Math.max(g0 || 0, 9);
          const d = td.call(this, a, s);
          if (noParry && this.guardT === 9) this.guardT = g0;
          if ((rt.stats.parries || 0) > p0) s._t11ParT = rt.t + 6;
          return d;
        };
      }
    }
    // 段のファイル（t11_hachioji/*.js）へ渡す場所と道具
    const H = { GATE_FRONT: { x: 150, z: 52 }, AMBUSH: { x: 164, z: 70 }, KARAMETE, SLOPE_MID: { x: 71, z: -20 }, SLOPE_TOP: { x: 72, z: -36 },
      LAST: { x: HON.x - 2, z: HON.z - 6 }, HON, MATSUKI, TAKA, GOSHU, HOJO, dress, marchTo,
      KANEKO_GUARD: PLAN.kuruwa.find((k) => k.id === 'kaneko') };
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends: () => [F.mine, F.saki, F.ni], look: (list) => dress(list, HOJO), scale: 1.3, backing: false, fixedSpawn: true, dmg: 0.36, botSeek: 40, routeFight: true,
      // 小宮曲輪へ向かう途中、高丸の残兵へ戻って刻限まで止まった。
      // 曲輪を攻める間は今の守備隊を狙い、前の曲輪の残兵を追い直さない。
      botFoeAllowed: (o) => {
        const D = F.dp, C = D?.cur;
        // 11/18 16時 クラウド持ち主：曳橋への移りで bot が袂の五十六m より近づけず八十秒待った（崩れて東の谷へ逃げる山下曲輪の残兵を追った）。逃げる兵は追わない
        if (o.fleeing || (o.group?.routed && D?.on && D.i <= IX.sally)) return false;
        if (D?.on && D.i === IX.bridge && o.group === F.sallyGun) return false;   // 11/19 移りの間、上の段の鉄砲は的にせず橋へ急ぐ
        // 11/14 クラウド：共通の待つ備の「新手」が金子丸の段で本人を斬り続け（act 二回とも傷の一番・110／99）、的から外れて打ち返さず倒れた。近い新手は討つ
        if (o.group?.name === '新手' && rt.player?.u && Math.hypot(o.pos.x - rt.player.u.pos.x, o.pos.z - rt.player.u.pos.z) < 8) return true;
        return !D?.on || D.i < IX.kaneko || D.i > IX.hon || !C?.groups || C.groups.includes(o.group);
      } }, [
      sanroku.step(H),
      // ① 山下曲輪：大手の虎口を守った近藤出羽守（綱秀）の組。木戸の内から鉄砲を撃ちかけ、上の段から石弓（石落とし）で先手の降将の勢を押し返した（『北条記』）
      kuruwaFight({ at: OTE, title: '山下曲輪', sub: '近藤出羽守が守る', obj: '山下曲輪で、近藤出羽守の組を討て', max: 45, noRefill: true, holdName: '近藤出羽守',
        say: [['前田の侍', '木戸の内に北条の兵！　霧の中から撃ってくるぞ'], ['前田の侍', '先手の大道寺勢が、上からの石に押し返された！　竹束の陰から寄れ', 4]],
        foes: () => [keep('近藤出羽守の組', OTE, [{ type: 'busho', n: 1, o: { name: '近藤出羽守', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }, { type: 'bow', n: 2 }]),
          keep('大手の木戸の鉄砲', OTE, [{ type: 'gun', n: 2 }, { type: 'ashigaru', n: 2 }], { dx: -10, width: 6 })],   // 11/18 一戦を4〜7分に：守りの数を半ばへ
        // 西の柵は x=108。新手も柵の内に出し、木戸の外から寄せ手へ回り込ませない。
        later: [{ t: 25, say: ['前田の侍', '奥の木戸から新手じゃ！'], foes: () => [keep('大手の奥の新手', OTE, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { dx: -7, width: 6 })] }],
        reward: '山下曲輪を破った',
        // 曲輪が落ちた時に近藤出羽守も討死する（落ちた後も曲輪で生き、御主殿の戦の最中に「討ち取ったり」が出た。11/8 critic60）
        onEnd: (rt2) => { const k = rt2.army.units.find((u) => u.name === '近藤出羽守' && u.alive); if (k) { k.officerSaved = true;
          // 11/18 23時 クラウド持ち主（act bot 578秒：本人が一m で斬り合っていた近藤が段の終わりの討死で「他」に数えられた）：本人が六m 内か一太刀でも入れていれば本人の討ち取り
          const PU = rt2.player?.u, mine = PU?.alive && (Math.hypot(PU.pos.x - k.pos.x, PU.pos.z - k.pos.z) < 6 || (k.heroDmg || 0) > 0);
          rt2.army.kill(k, mine ? PU : null); rt2.say('前田の侍', '近藤出羽守、討死！　山下曲輪は落ちたぞ', 3.2); } } }),
      // 11/18 クラウド持ち主：act bot が山下曲輪の残りの城兵を追って袂の二十m 手前を百五十秒うろついた（最も近くて21m）。五十秒を過ぎ二十五m 内なら着いた事にする
      koguchiGunEarly(nearEnough(DP.move({ to: BRIDGE_S, obj: '谷の道を、曳橋の南の袂まで進め', label: '曳橋', r: 11, max: 50 }), BRIDGE_S, 28, 34, 42)),   // 11/21 12時 クラウド持ち主（K582 携帯の見なし・せっかち 2戦 515・600秒、移り58秒に任務札も敵も無い）：二十八秒・三十四m・上限四十二秒へ。城兵は袂に着かなくても六十秒で打って出て来る   // 11/18 18時 クラウド持ち主：act bot 6回のうち2回この移りが75〜80秒（谷を二十秒で歩ける）。四十秒・三十m・上限六十二秒へ
      // ② ③ 御主殿の虎口：城兵が石段を下り曳橋を渡って打って出る → 迎え撃つ → 退く敵に続いて冠木門へ（付け入り）
      sallyStep(),
      kuruwaFight({ at: GOSHU, title: '御主殿', sub: '氏照の館', obj: '御主殿の館の前の北条勢を討て', max: 35, noRefill: true,
        say: [['北条の侍', '殿の館に、一歩も入れるな！'], ['前田の侍', '館の奥の滝の方から、女たちの声が……', 3.4]],
        foes: (rt2) => [keep('御主殿の守り', GOSHU, [{ type: 'samurai', n: rt2.flags.tsukeiri ? 1 : 2 }, { type: 'ashigaru', n: rt2.flags.tsukeiri ? 4 : 6 }, { type: 'bow', n: 2 }], { dx: -10, dz: 3, seek: 10, noGuard: true }),
          // 11/18 22時 クラウド持ち主（K281 の数え：185秒 付け入り〜御主殿で本人の六十m 内の敵 11人と薄い）：館の奥（庭の北西の内）に氏照の馬廻の槍。石垣の上で下の虎口から見えない
          // 11/19 4時 クラウド持ち主（K281 の数え 200秒で本人の六十m 内の敵 21人）：馬廻の槍を侍2・足軽10へ
          keep('御主殿の奥の槍', GOSHU, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], { dx: -16, dz: -10, width: 6, seek: 14, noGuard: true })],   // 11/18 クラウド持ち主：見える所に湧かせない決まり（guardSpawn）で石垣の西の外 (9,-20) に出され、九人が (17,-21) の石垣の下に重なって止まった（act bot 252秒・描かずの通し）。石垣の上の庭は下の虎口から見えないので、庭の西の内 (30,0) にそのまま出す
        reward: '御主殿を取った' }),
      sakamichi.step(H),
      // ④ 尾根の曲輪を一つずつ落とす（上からの鉄砲）
      kuruwaFight({ at: KANEKO, title: '金子丸', sub: '金子家重が守る尾根の曲輪', obj: '尾根を登り、金子丸の金子家重の組を討て', max: 35, noRefill: true,
        // 11/19 2時 クラウド持ち主（act bot 2回の金子丸の段で本人の討ち取り0・2＝先に着いた味方が守りを崩す）：近藤と同じく、金子家重が本人の二十m 内に生きている間は段の上限から三十秒まで落とさず本人へ斬りかかる
        holdName: '金子家重',
        say: [['前田の侍', '上の曲輪から鉄砲じゃ！　身を低くして登れ']],
        foes: () => [keep('金子家重の組', KANEKO, [{ type: 'busho', n: 1, o: { name: '金子家重', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 3 }, { type: 'bow', n: 2 }]),
          // 11/18 21時 クラウド持ち主（K281 の数え：200〜280秒の本人の六十m 内の敵が 11〜25人と薄い）：曲輪の奥の柵の内に槍の控え。段の上限三十五秒は変えない
          keep('金子丸の奥の槍', KANEKO, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { dz: -8, width: 6 })],
        reward: '金子丸を落とした',
        onEnd: (rt2) => {
          const g = rt2.flags.slopeBow;
          retreat(g);
        } }),
      // 11/18 クラウド（司令塔：全64戦の流しで八王子が1440秒の時間切れ・尾根の柵門で止まった）：一戦を4〜7分に。
      //   高丸と小宮曲輪は本人が一つずつ斬り落とさず、金子丸が落ちた勢いで崩れる（小宮曲輪は上杉勢が搦手の間道から衝いた）様子を台詞と遠くの火で見せ、本丸へ向かう。
      //   段の番（ORDER の taka・matsuki）は残し、上杉の出や櫓の火の作りはそのまま動く
      // 11/18 iMac の検品（段6で本人一人）：休みの段は味方を止めるので、前田の組も尾根の道で本丸の下へ先に上らせる（本人と並んで本丸へ）
      // 11/28 14時 UTC クラウド 八王子の持ち主（K658 一戦15分・出来事ごとの達成）：11/18 に休みへ縮めた高丸を、本人が尾根の柵門を抜けて落とす段に戻す
      //   （史実：寄せ手は尾根の曲輪を一つずつ落として頂へ登った＝docs/battle_refs/t11_hachioji.md「流れ」）。上限三十秒・新手無し・守りは金子丸より薄い。段の数（ORDER）は同じ
      //   14:20 同：act bot --mobile 3本の1本で本人が尾根の柵門の手前（高丸の二十六m 外）から門を抜けられず段が三百十九秒続いた（11/18 の柵門の詰まりと同じ）。
      //   高丸の守りは柵門の外（金子丸の側の尾根）へ打って出て門を守る形にし、本人は門を抜けずに討てる所で戦う
      DP.fight({ at: { x: 58, z: -62 }, title: '尾根の柵門', sub: '高丸の守り', obj: '尾根の柵門の前で、高丸の守りを討て', max: 30, noRefill: true,
        say: [['前田の侍', '金子丸が落ちた！　高丸の守りが柵門の前へ打って出たぞ', 3.4]],
        foes: () => [keep('高丸の守り', { x: 54, z: -65 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }], { width: 5, seek: 22 })],
        reward: '高丸を落とした' }),
      // 11/18 k41：七秒の休みに長い二言＋上杉の藤田＋本丸の大石・朝日が重なり、字幕の待ち列が22秒遅れた（描かずの通し363秒）→休みを十秒に
      DP.rest({ dur: 14, heal: 0.25, say: [['前田の侍', '搦手に竹に雀の旗！　上杉勢が裏の間道から小宮曲輪を衝いた', 3.4], ['前田の侍', '小宮曲輪の柵に火が上がった！　内から寝返った者がおる。残るは本丸じゃ', 3.6]],
        fn: (rt2) => { [rt2.flags.mine, rt2.flags.saki, rt2.flags.ni].forEach((g, k) => marchTo(rt2, g, { x: HON.x + 22, z: HON.z + 18 }, k)); rt2.marker('dp', { x: 18, z: -92 }, '高丸', { h: 3 }); rt2.after(10.4, () => { rt2.unmark('dp'); askThen(rt2, HOP_AT.x, HOP_AT.z, '尾根を本丸の下へ進む', () => hopToHon(rt2)); }); } }),   // 11/28 K667（act bot --mobile 397秒 本人が一コマで147m 飛んだ）：勝手に移さず、書いたボタンを押した時だけ移す   // 11/19 k41：休み10→14秒（藤田・前田の二言・大石・朝日がまだ12〜22秒遅れた）
      // ⑤ 頂の本丸：利家は中山勘解由（家範）に命を助けると伝えたが、家範は断って討死。大石信濃守（照基）は城代の横地監物を城から落とし、
      //   自分は打って出て討死。横地は西の詰の城の方へ落ちる（update の yokochi）
      kuruwaFight({ at: HON, title: '本丸', sub: '深沢山の頂', obj: '本丸で、中山勘解由を討て', max: 35,   // 11/18 クラウド持ち主：act bot 678秒のうち本丸の段が156秒。上限を七十→四十五秒
      noRefill: true,
        say: [['大石信濃守', '監物殿は西へ落ちられよ。ここは我らが防ぐ！', 3.6]],
        foes: () => [keep('中山勘解由の旗本', HON, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 3 }, { type: 'bow', n: 2 }], { morale: 100, seek: 30 }),
          // 西の柵際では隊列の後尾が柵外に出る。出現時から全員が本丸の内に収まる位置へ。
          keep('大石信濃守の手', HON, [{ type: 'busho', n: 1, o: { name: '大石信濃守', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }], { dx: -8, dz: -4, morale: 95, seek: 24 })],
        reward: '本丸の守りを崩した' }),
      nakayamaStep(),
      rakujo.step(H),
    // 城兵を崩す・袂へ着く条件を満たすまで待つ。共通の四〜七分の打ち切りも外し、中山の討死や到着を時間だけで済ませない。
    ].map((s) => Object.assign(s, { idleAdvance: false, limit: Infinity, noHardCap: true })), (rt2) => this.win(rt2));
  },

  // 上杉勢：小宮曲輪の段で、搦手（北西）から攻め上る
  uesugi(rt) {
    const F = rt.flags;
    if (F.uesugi) return;
    // 搦手の上杉勢は、寝返った平井無辺の案内で北の水の手の間道から小宮曲輪を裏から衝く（大手の道と混ぜない。11/8 critic60）。
    //   手を率いたのは藤田信吉。景勝は後ろの陣に残り、山の上に名だけ浮かせない（誰もいない芝の上に名が浮いた。11/8 critic60）
    // 後列も道の折れをたどる。縦隊の指定だけでは持ち場への直進で切岸・柵を横切る。
    F.uesugi = allyGroup(rt, { faction: 'uesugi', name: '上杉勢', anchor: { x: KARAMETE.x, z: KARAMETE.z }, facing: Math.PI, width: 6, aggro: 12, noRout: true, order: 'path', path: KARAMETE_PATH, pathIdx: 0, formation: 'column', colW: 2, roadColumn: true, followColumnRoad: true, speed: 3.4, seekRange: 30 },
      dress([{ type: 'busho', n: 1, o: { name: '藤田信吉', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], UESUGI));
    F.uesugi.t11Karamete = true;
    F.uesugi.onArrive = (q) => { q.order = 'attack'; q.path = null; q.roadColumn = false; q.formation = 'yari'; q.anchor = { x: MATSUKI.x - 6, z: MATSUKI.z + 4 }; };
    // 真田昌幸の手：上杉勢の脇から尾根を登る
    //   真田の兵は赤備えにしない（朱の揃いは大坂の陣の信繁の物。1590 の昌幸の手は黒い具足に六文銭の旗。11/8 critic60）
    const SAN = { flag: 'sanada', noRed: true, armor: 0x2a2724, hatColor: 0x1c1916 };
    F.sanada = allyGroup(rt, { faction: 'sanada', name: '真田昌幸の手', anchor: { x: KARAMETE.x - 4, z: KARAMETE.z - 6 }, facing: Math.PI, width: 4, aggro: 12, noRout: true, order: 'path', path: KARAMETE_PATH, pathIdx: 0, formation: 'column', colW: 2, roadColumn: true, followColumnRoad: true, speed: 3.2, seekRange: 30 },
      [{ type: 'busho', n: 1, o: { ...SAN, name: '真田昌幸', invuln: true, horse: false } }, { type: 'samurai', n: 1, o: SAN }, { type: 'ashigaru', n: 6, o: SAN }]);
    F.sanada.t11Karamete = true;
    F.sanada.onArrive = (q) => { q.order = 'attack'; q.path = null; q.roadColumn = false; q.formation = 'yari'; q.anchor = { x: MATSUKI.x + 4, z: MATSUKI.z - 8 }; };
    F.sanada.dmgMult = 0.7;
    rt.after(1.5, () => rt.say('藤田信吉', '水の手の間道から曲輪の裏へ出た！　搦手は上杉が破る', 3.4));
    F.uesugi.dmgMult = 0.7;
    rt.scene.add(nobori(rt.world, KARAMETE.x + 4, KARAMETE.z - 4, 'uesugi', 6));
    rt.army.play('toki', KARAMETE, 1.4);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '八王子城を一日で落とした', pts: 40 }; }, '八王子城が落ちた');
    sfx('horagai', 0.9);
    rt.player.u.invuln = true;
    // 落城の様（火・崩れ・余韻）は終幕の段（t11_hachioji/rakujo.js）で見せた。ここは小田原へ知らせを送って締める
    rt.say('前田利家', '八王子の落城を、早馬で小田原へ知らせよ', 3.4);
    rt.finish({}, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    // 11/28 08時 クラウド 八王子の持ち主（K564・_t11_memcount.mjs mem=3・携帯・描かず）：記憶3GB（予算180）で生きた兵が 30〜270秒 163〜186、
    //   うち行軍の列十八人が始めの陣に残り、180秒から本人の百〜三百七十m 後ろに戦の終わりまで立ち続けた（写らない）。
    //   始めの百二十秒を過ぎ、列の誰もが本人の七十m の外なら外す（小田原・佐和山・関ヶ原と同じ手。数の札は despawn で足し戻る）
    { const mg = F.marchG, MP = rt.player?.u;
      if (mg && !F._mgOff && rt.t > 120 && MP?.alive && (F._mgT = (F._mgT || 0) - dt) <= 0) {
        F._mgT = 1;
        const us = (mg.units || []).filter((u) => u.alive && !u.gone);
        if (!us.length) F._mgOff = true;
        else if (!us.some((u) => Math.hypot(u.pos.x - MP.pos.x, u.pos.z - MP.pos.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
      } }
    // 11/28 クラウド 八王子の持ち主（act bot --mobile 146秒「大手の奥の新手」5人が retreat・行き先無のまま (61,15) に重なり止まる★★）：
    //   城方へ退く下知の組（t11_hachioji/retreat.js）は、谷の木戸や柵に掛かって一点に詰まる。下知から六秒たったら、
    //   画面の外で四十m より遠い兵から城の内へ退き切った事にして外す（見える兵は残す・討ち取りには数えない＝despawn）
    if (!(F._t11RetT > rt.t)) {
      F._t11RetT = rt.t + 1;
      for (const g of rt.army.groups) {
        if (g.order !== 'retreat' || g.team === rt.player?.u?.team || !g.count) { if (g._t11RetAt !== undefined && g.order !== 'retreat') g._t11RetAt = undefined; continue; }
        g._t11RetAt ??= rt.t;
        if (rt.t - g._t11RetAt < 6) continue;
        for (const u of g.units) if (u.alive && !u.gone && !u.isPlayer && !u.name && !u.atk && u.offscreen && u.camD > 40) rt.army.despawn(u);
      }
    }
    const D = F.dp;
    if (D && D.on && D.i >= IX.matsuki) this.uesugi(rt);
    // 11/18 17時 クラウド持ち主（act bot「受けた傷 侍0・武将0」）：金子丸の金子家重と組の侍も、本人の軽い突きでは振りを止めない（中山と同じ u.poiseVsP）
    if (D && D.on && D.i === IX.kaneko && !F._t11KanePoise && D.cur?.groups?.length) {
      F._t11KanePoise = true;
      for (const g of D.cur.groups) for (const u of g.units || []) if (u.type === 'busho' || u.type === 'samurai') u.poiseVsP = true;
    }
    // 11/18 21時 クラウド持ち主（act bot 2戦とも「受けた傷 侍0・武将0・簡単すぎる」）：段ごとの城兵の刃は、本人に当たる時だけ八割五分（組どうしは軽いまま・鉄砲弓は変えない＝dmgMultPlayerMelee）。侍は本人の軽い突きで振りを止めない
    if (D && D.on && D.cur?.groups?.length && F._t11HardI !== D.i + ':' + D.cur.groups.length) {
      F._t11HardI = D.i + ':' + D.cur.groups.length;
      for (const g of D.cur.groups) {
        if (g.team === rt.player.u?.team || g.dmgMultPlayer != null || g.peaceful) continue;
        // 11/19 06時 クラウド持ち主（act bot 6戦の受けた傷が弓3〜4・刃0＝受け流しで全部消え「無傷で百人」）：上の段から射る弓・鉄砲も本人には八割五分（刃と同じ）。
        //   山城の坂で上から射られる怖さ。組どうしの矢は軽いまま
        // 11/19 8時半 クラウド持ち主（act bot 三回とも「簡単すぎる・もっと強い奴と」・倒れ0・受けた侍の傷4〜8）：本人に当たる刃と矢を八割五分→一倍へ
        g.dmgMultPlayer = Math.max(g.dmgMult ?? 1, 1);
        for (const u of g.units || []) if (u.type === 'busho' || u.type === 'samurai') u.poiseVsP = true;
      }
    }
    // 11/18 19時 クラウド持ち主（act bot 4回に2回「名のある将 本人0・他1＝近藤出羽守が本人の四〜六m で段の打ち切りの討死」）：
    //   味方の刃で三割五分に落ちた近藤は下がったまま本人と斬り合わなかった。曲輪の三十m 内に本人が来て十二秒、組が六人以下なら近藤の組は本人へ斬りかかる
    if (D && D.on && D.i === IX.ote) {
      const P = rt.player.u, k = F._t11Kondo || (F._t11Kondo = rt.army.units.find((u) => u.name === '近藤出羽守'));
      if (k && k.alive && k.group && P?.alive && Math.hypot(k.pos.x - P.pos.x, k.pos.z - P.pos.z) < 30) {
        if (F._t11KondoT == null) F._t11KondoT = rt.t;
        if (rt.t - F._t11KondoT > 12 && live(k.group) <= 6 && k.group.focus !== P) { k.group.focus = P; k.poiseVsP = true; k.officerBackUntil = 0; k.target = P; k.aiT = 0; }
      }
    }
    // 11/19 1時半 クラウド持ち主（act bot 538秒の回で金子丸の段五十秒・本人の討ち取り0＝先に着いた味方が守りを崩し、本人は柵の外を登るだけ）：
    //   本人が金子丸の三十m 内に来て六秒、命が四割以上なら奥の槍の控えは本人へ打ってかかる（一度だけ・命が落ちれば外す）
    if (D && D.on && D.i === IX.kaneko && D.cur?.groups?.length) {
      const PU = rt.player.u, g = D.cur.groups.find((q) => q.name === '金子丸の奥の槍');
      if (g && g.count && !g.routed && PU?.alive) {
        const near = Math.hypot(PU.pos.x - KANEKO.x, PU.pos.z - KANEKO.z) < 30 && PU.hp >= PU.maxHp * 0.4;
        if (near) { if (F._t11KaneNearT == null) F._t11KaneNearT = rt.t; }
        if (near && rt.t - F._t11KaneNearT > 6 && g.focus !== PU) { g.focus = PU; g.order = 'attack'; g.seekRange = 34; }
        else if (!near && g.focus === PU) { g.focus = null; for (const u of g.units) if (u.target === PU) { u.target = null; u.aiT = 0; } }
      }
    }
    // 11/19 2時半 クラウド持ち主（act bot「受けた傷 武将0・もっと強い奴と斬り合いたい」・金子丸の本人の討ち取り 0〜4 と揺れる）：
    //   将は共通の officerThink で組の七m 後ろへ下がり本人と斬り合わなかった。金子家重は本人が十八m 内に来れば共通の一騎打ち（army_duel.js）で名乗って向き合う（一度だけ）
    if (D && D.on && D.i === IX.kaneko && !F._t11KaneDuel) {
      const PU = rt.player.u, ka = F._t11Kane || (F._t11Kane = rt.army.units.find((u) => u.name === '金子家重'));
      if (ka && ka.alive && ka.group && !ka.group.routed && !ka.fleeing && PU?.alive && PU.hp >= PU.maxHp * 0.4 &&
          Math.hypot(ka.pos.x - PU.pos.x, ka.pos.z - PU.pos.z) < 12 && Math.abs(ka.pos.y - PU.pos.y) < 1.5 && !rt.army.duel) {   // 3時50分：十八m・高さ3m では坂の上下で始まり六十秒打ち込めなかった→十二m・一・五m
        F._t11KaneDuel = rt.t; F._t11KaneNoRout = !!ka.group.noRout;
        ka.duelOpponent = true; ka.poiseVsP = true; ka.officerBackUntil = 0;
        // 3時半：act bot の受けた傷が武将0 のまま。名乗った将の太刀は重く（志賀・賤ヶ岳と同じ一・五倍・印を解いたら戻す）
        F._t11KaneDmg = ka.dmg; ka.dmg *= 1.5;
        ka.group.noRout = true; ka.group.focus = PU;
        rt.say('金子家重', '金子三郎左衛門家重なり！　前田の者、参れ！', 3);
      }
    }
    // 11/19 3時 クラウド持ち主（act bot 金子丸の段 358→1325秒・討0）：一騎打ちの印を解かずにいると、本人が離れても
    //   army_duel の見届けの輪（そばの二十人）が狙われも斬りもしないまま残り、組も崩れずに段が千秒止まった。
    //   六十秒か、本人が二十四m 離れるか、本人の命が三割を切ったら印を解く（志賀・道明寺と同じ形）
    if (F._t11KaneDuel && !F._t11KaneDrop) {
      const PU = rt.player.u, ka = F._t11Kane;
      if (!ka || !ka.alive || !PU?.alive || rt.t - F._t11KaneDuel > 60 || PU.hp < PU.maxHp * 0.3 || D?.i !== IX.kaneko ||
          Math.hypot(ka.pos.x - PU.pos.x, ka.pos.z - PU.pos.z) > 24) {
        F._t11KaneDrop = true;
        if (ka) { ka.duelOpponent = false; if (F._t11KaneDmg != null) ka.dmg = F._t11KaneDmg; if (ka.group) { if (ka.group.focus === PU) ka.group.focus = null; ka.group.noRout = F._t11KaneNoRout; } }
      }
    }
    // 11/19 クラウド持ち主（act bot 296秒 ★「自分のすぐそばの敵が6秒以上なにもしない」＝坂の段で駆け下りる新手の足軽が号令 attack のまま狙い無しで本人の横に立つ）：
    //   本人の三m 内（同じ床・壁越しでない）で狙いも振りも無いまま三秒立つ攻めの城兵は、本人を相手にする（本能寺と同じ形・半秒ごと）
    if (D?.on && !(F._t11IdleT > rt.t) && rt.player.u?.alive && !rt.player.u.invuln) {
      F._t11IdleT = rt.t + 0.5;
      const PU = rt.player.u, p = PU.pos;
      for (const u of rt.army.units) {
        // 11/19 4時 クラウド持ち主（act bot 87秒 山下曲輪で近藤の組の弓が本人の三m で六秒待つ＝共通の脇差は二歩半の内だけ・持ち場の組は号令 hold）：
        //   射手（脇差を抜いていない弓・鉄砲）は号令を問わず、三m 内で三秒なにもしなければ脇差を抜いて本人に掛かる
        const shooter = !u.sidearm && !u.mounted && (u.type === 'gun' || u.type === 'bow');
        if (!u.alive || u.team === PU.team || u.fleeing || u.downed || u.woundOut || u.isStruct || u.noTarget || u.group?.routed || (!shooter && u.group?.order !== 'attack') ||
            Math.abs(u.pos.x - p.x) > 3 || Math.abs(u.pos.z - p.z) > 3) { if (u._t11Idle) u._t11Idle = 0; continue; }
        if ((u.target && u.target.alive) || u.atk || u.swing || Math.abs(u.pos.y - p.y) >= 1.5 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 3) { u._t11Idle = 0; continue; }
        if ((u._t11Idle = (u._t11Idle || 0) + 0.5) >= 3 && !rt.army.wallBetween(u.pos, -1, p)) { if (shooter) { try { rt.army.drawSidearm(u); } catch (e) { continue; } } u.target = PU; u.watch = null; u.aiT = 0; u._t11Idle = 0; }
      }
    }
    // 遅れた兵を持ち場へ瞬間移動させず、道案内を付け直して徒歩で合流させる。
    if (D?.on && !(F.unstuckT > rt.t)) {
      F.unstuckT = rt.t + 2;
      // 11/18 クラウドツ四（act bot 421・683秒「前田の二の手・旗本が一点に重なって止まる」）：道の縦列のまま十四秒も進めない組は、道を諦めてその場で槍の横列に開き、寄せ手として敵へ当たる
      for (const g of [F.saki, F.mine, F.ni, F.naga]) if (g?.count && !g.routed && g.order === 'path') {
        const c = g.center(), w = g._t11Jam || (g._t11Jam = { x: c.x, z: c.z, t: rt.t });
        // 11/17 クラウドツ四（act bot 366秒「前田の二の手 12人が行き先3mで重なって止まる」）：道の終点まで 5m を切った縦列は、終点に全員が詰めずに、その場で槍の横列に開く
        const lp = g.path && g.path[g.path.length - 1];
        if (lp && g.onArrive && Math.hypot(c.x - lp[0], c.z - lp[1]) < 5) { g.onArrive(g); g.followColumnRoad = false; continue; }
        // 11/19 クラウド持ち主（act bot 226〜421秒：利長の旗本が谷 (97,44)・虎口 (66,4) で号令 path のまま二十秒）：縦列の中心が揺れて一m 半動くたびに数え直し、止まりと見なせていなかった。
        //   旗本だけは中心の動きでなく道の終点へ近づいたかで数え、進めなければその場で控える（先手・二の手まで同じにすると、小宮曲輪の口で槍の横列が道を塞ぎ時切れ）
        if (g === F.naga) {
          const dEnd = lp ? Math.hypot(c.x - lp[0], c.z - lp[1]) : 0;
          if (w.d == null || w.p !== g.path || w.d - dEnd > 1.5) { w.x = c.x; w.z = c.z; w.d = dEnd; w.p = g.path; w.t = rt.t; continue; }
          if (rt.t - w.t < 14) continue;
          w.d = null; g.order = 'hold'; g.path = null; g.roadColumn = false; g.followColumnRoad = false; g.formation = 'yari'; g.anchor = { x: c.x, z: c.z };
          continue;
        }
        if (Math.hypot(c.x - w.x, c.z - w.z) > 1.5) { w.x = c.x; w.z = c.z; w.t = rt.t; continue; }
        if (rt.t - w.t < 14) continue;
        w.t = rt.t; g.order = 'attack'; g.path = null; g.roadColumn = false; g.followColumnRoad = false; g.formation = 'yari'; g.anchor = { x: c.x, z: c.z }; g.seekRange = 30;
      }
      for (const g of [F.saki, F.mine, F.ni, F.naga]) if (g?.count && !g.routed) for (const u of g.units) {
        if (!canRejoin(u)) continue;
        const k = u._t11Stay || (u._t11Stay = { x: u.pos.x, z: u.pos.z, t: rt.t });
        if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 1.5) { k.x = u.pos.x; k.z = u.pos.z; k.t = rt.t; continue; }
        if (rt.t - k.t < 12 || u.target) continue;
        u.aiT = 0; u.jamT = 0; u.jammed = false;
        if (u._t11Way) u._t11Way.t = 0;
        k.t = rt.t;
      }
    }
    // 段が変わったら、前田の組を道どおりに段の場所へ（曳橋の段は sallyStep が送る）
    if (D && D.on && D.i !== F.marchI) {
      F.marchI = D.i;
      const to = D.i !== IX.sally && D.i !== IX.sanroku && D.i !== IX.sakamichi && D.cur && (D.cur.goal || D.cur.at);   // 段のファイルの段は自分で組を送る
      if (to) [F.saki, F.mine, F.ni].forEach((g, k) => marchTo(rt, g, to, k));
      if (to && F.naga?.count) { routeAt(to.x, to.z, RG); const b = ROUTE[Math.max(0, Math.floor(RG.s) - 1)]; marchTo(rt, F.naga, { x: b[0], z: b[1] }, 0); F.naga.onArrive = (q) => { q.order = 'hold'; q.path = null; q.formation = 'yari'; q.anchor = { x: b[0], z: b[1] }; }; }
      // 本丸の段：搦手の上杉勢・真田の手も、小宮曲輪から本丸へ攻め上る
      //   搦手の勢は専用の道から進み、柵を横切らず既存の口を通る
      if (D.i === IX.hon) [F.uesugi, F.sanada].forEach((g) => { if (g && g.count) { g.order = 'path'; g.path = KARAMETE_HON_PATH; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true; g.onArrive = (q) => { q.order = 'attack'; q.path = null; q.roadColumn = false; q.formation = 'yari'; q.seekRange = 30; }; } });
    }
    // 11/18 クラウド持ち主：act bot 1441秒の時切れ＝本丸の段で搦手の上杉勢・真田の手の縦隊（order path）が小宮曲輪の西の口の外 (-42,-114) で千秒止まり、
    //   口を出ようとする本人もそこで詰まった。縦隊が十五秒で一m も進まなければ、道を解いて本丸へ斬りかかる組に替える（口を塞がない）
    if (D && D.i === IX.hon) for (const g of [F.uesugi, F.sanada]) {
      if (!g || !g.count || g.order !== 'path') continue;
      const c = g.center(), w = g._t11Stuck ||= { x: c.x, z: c.z, t: rt.t };
      if (Math.hypot(c.x - w.x, c.z - w.z) > 1) { w.x = c.x; w.z = c.z; w.t = rt.t; continue; }
      if (rt.t - w.t < 15) continue;
      g.order = 'attack'; g.path = null; g.roadColumn = false; g.followColumnRoad = false; g.formation = 'yari'; g.seekRange = 30;
      g.anchor = { x: HON.x + 6, z: HON.z + 10 }; g.onArrive = null; g._t11Stuck = null;
    }
    if (F.rocks) F.rocks.tick(dt);
    // 城攻めの矢玉（登る間ずっと何も降って来なかった。11/8 critic60）：曲輪の弓は五〜八秒ごとに、寄せ手の固まり（本人の周り）へ射上げる。
    //   当たりは共通の矢の雨のまま（一人一本・盾と甲冑で防ぐ）
    if (D && D.on && D.cur?.groups && (F._volT = (F._volT ?? 6) - dt) <= 0) {
      F._volT = 5 + Math.random() * 3;
      const P = rt.player.u;
      // 本人の傷で城方の射撃まで止めない。近くの寄せ手も同じ矢にさらされる。
      if (P.alive) for (const g of D.cur.groups) {
        // 退く下知を受けた組と、重傷で戦列を離れた射手には射させない。
        const bow = live(g) > 0 && g.units.find((u) => u.alive && !u.gone && !u.dying && !u.fleeing && !u.evacuatedWound && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && u.type === 'bow' && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 55);
        if (!bow) continue;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        rainVolley(rt.army, g, bow, { x, y: rt.world.heightAt(x, z), z }, Math.hypot(x - bow.pos.x, z - bow.pos.z));
        break;
      }
    }
    tickTabas(rt, dt);
    // 山下曲輪が落ちる頃に夜が白む（二十秒余りかけて移ろう）。霧は登るほど薄れ、本丸の段で朝日が差す
    //   夜明けは二分半かけて少しずつ白む（四十五秒で昼の霧へ急に替わった。11/8 critic60）。本丸の段は昼にせず、低い朝日のまま
    // 11/19 クラウド持ち主：落ちた曲輪に前田の幟（山下曲輪→曳橋へ移る時・御主殿→坂の時・金子丸→高丸の時・本丸→落城の時）
    if (D && D.on && (F._t11Plant ?? -1) < D.i) {
      F._t11Plant = D.i;
      if (D.i >= IX.bridge) plantMaeda(rt, OTE);
      if (D.i >= IX.sakamichi) plantMaeda(rt, GOSHU, 34);
      if (D.i >= IX.taka) plantMaeda(rt, KANEKO, 14);
      if (D.i >= IX.matsuki) { plantMaeda(rt, TAKA, 14); plantMaeda(rt, MATSUKI, 14); }
      if (D.i >= IX.rakujo) plantMaeda(rt, HON, 16);
    }
    // 11/21 cloud-21（司令塔：天王寺と並べた120秒で曳橋の谷が空の野。幟だけでは薄い）：曳橋の段に入った時、本人から百二十m より遠くで
    //   持ち場に立つだけの味方の組を三つまで、橋の南の袂から寄せ口への谷の両の縁へ立て直す（総数は増やさない・K285 の内）
    if (D && D.on && D.i === IX.bridge && !F.k21Mid && !(typeof location !== 'undefined' && /k21off=1/.test(location.search))) {   // k21off=1：前後の比べの時だけ（直す前の形）
      F.k21Mid = true;
      const P = rt.player.u.pos;
      const far = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && g.count >= 6 && (g.order === 'hold' || g.stay) && !g.fixed && !g.noAI
        && Math.hypot(g.center().x - P.x, g.center().z - P.z) > 120).slice(0, 3);
      far.forEach((g, i) => {
        const t = (i + 1) / 4, x = BRIDGE_S.x + (START.x - BRIDGE_S.x) * t, z = BRIDGE_S.z + (START.z - BRIDGE_S.z) * t + (i % 2 ? 10 : -10);
        g.anchor = { x, z }; g.order = 'move'; g.dest = { x, z }; g.path = null; g.focus = null; g.stay = true;
        g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x, z }; };
      });
    }
    if (D && D.on && D.i >= IX.bridge && !F.dawn) { F.dawn = true; rt.world.setTime('morning'); if (rt.world.fade) rt.world.fade.dur = 150; rt.after(2, () => rt.say('前田の侍', '夜が白んできた。霧の上に、山の上の曲輪が見えるぞ', 3.4)); }
    // 本丸へ早く着いても夜明けの途中を飛ばさず、二分半の移ろいを待って朝日を知らせる。
    if (D && D.on && D.i >= IX.hon && !F.sun && (!rt.world.fade || rt.world.fade.t >= rt.world.fade.dur * 0.8)) { F.sun = true; rt.say('前田の侍', '朝日じゃ！　霧が切れて、本丸が見えるぞ', 3); }
    // 小宮曲輪の段：櫓を除いた土の曲輪でも、内応の火を実在する南の柵に沿わせる。
    if (D && D.on && D.i === IX.matsuki && !F.yaguraFire) {
      F.yaguraFire = true;
      rt.world.addFire(MATSUKI.x - 4, PLAN.kuruwa.find((k) => k.id === 'matsuki').poly[0][1], { size: 2.4, h: 0.3, smoke: true, blackSmoke: false });   // 11/19 クラウド持ち主：h 3.2 で柵の上の宙に浮いた。柵の根元から燃え上がる   // 黒い雲を切り抜いたような平たい塊に見えた（11/8 critic60）。灰の柔らかい煙に
    }
    // 11/18 クラウド持ち主（act bot 443秒：本丸の段で本人の組9人のうち7人が士気0で逃げ、突撃が効かない）：本丸の段では、本人の二十m 内にいる組は崩れる手前で踏み止まる
    // 11/18 15時 クラウド持ち主（act bot 551秒：組の15人が本人の六十三m 後ろで士気0で崩れ、突撃が効かない）：尾根の段（坂より上）では二十m・本丸では八十m 内で踏み止まる
    // 11/18 16時 クラウド持ち主（act bot 203秒：冠木門の段で組7人のうち6人が士気0で逃げ、突撃が効かない）：打って出る段から同じにする
    if (D && D.on && D.i >= IX.sally && rt.player.u?.alive) {
      const pp = rt.player.u.pos;
      for (const g of rt.squadGroups || []) if (g.count && !g.routed && (g.noRout = true) && (g.morale || 0) < 30) {   // 士気の床だけでは同じコマの打撃で崩れた（act bot 371秒・十四m）。尾根では組は崩れない
        const c = g.center(SQ_C);
        if (Math.hypot(c.x - pp.x, c.z - pp.z) < (D.i >= IX.hon ? 80 : 20)) g.morale = 30;
      }
    }
    // 11/18 15時 クラウド持ち主（act bot 384秒「すぐそばの敵が6秒以上なにもしない」・金子丸の柵越しの6秒待ち）：曲輪の守り（持ち場を保つ組）でも、
    //   本人が三歩半の内へ踏み込んだら、その一人は本人へ打ちかかる。柵を挟んでも槍の足軽・侍は柵越しに突く（持ち場・数は変えない。射手と名のある将は除く）
    if (D && D.on && rt.t >= (F.guardWakeAt || 0) && rt.player.u?.alive) {
      F.guardWakeAt = rt.t + 0.5;
      const P = rt.player.u;
      for (const g of rt.army.groups) {
        if (g.team === P.team || !(g.t11Kuruwa || g === F.nakaG || D.cur?.groups?.includes(g)) || g.routed || !g.count || g.order === 'retreat' || g.order === 'flee') continue;
        // 中山が助命を断る返答の間（七秒）は、供も持ち場で控える（act bot 394秒・411秒「中山勘解由の侍が6秒なにもしない」＝号令 attack のまま立っていた）
        if (g === F.nakaG && !D.cur?.lastWords) { g.order = 'hold'; continue; }
        if (g === F.nakaG && g.order === 'hold' && !g._t11Spoke) { g._t11Spoke = true; g.order = 'attack'; }
        for (const u of g.units) {
          if (!u.alive || u.gone || u.dying || u.fleeing || u.noTarget || u.target || u.name || (u.type !== 'ashigaru' && u.type !== 'samurai')) continue;
          if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 3.6 && Math.abs(u.pos.y - P.pos.y) < 3) { u.target = P; u.aiT = 0; }
        }
      }
    }
    // 本丸の段：城代の横地監物は供の侍と西の詰の城の方へ落ちる（大石信濃守が城から出した）。討てない・追わない
    if (D && D.on && D.i === IX.hon && !F.yokochi) {
      F.yokochi = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '横地監物の供', anchor: { x: HON.x - 6, z: HON.z - 8 }, facing: -Math.PI * 0.7, width: 3, aggro: 0, morale: 100, noRout: true,
        order: 'path', path: YOKOCHI_PATH, pathIdx: 0, speed: 3.2 },
      dress([{ type: 'busho', n: 1, o: { name: '横地監物', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'samurai', n: 3, o: { invuln: true } }], HOJO));
      F.yokochi.t11Escape = true;
      // 11/18 クラウド持ち主（act bot 582秒で倒れた：討てない横地と供の太刀が本人へ288）：落ちる供は振り払うだけ。自分からは斬り掛からず、本人への太刀は二割
      F.yokochi.peaceful = true; F.yokochi.dmgMultPlayer = 0.2;
      F.yokochi.onArrive = (q) => {
        q.order = 'hold'; q.path = null; F.yokochiArrived = true;
      };
    }
    // 11/18 20時 クラウド持ち主（act bot 548秒「すぐそばの敵が6秒以上なにもしない＝横地監物の供・号令 attack」）：
    //   落ちる供の号令が共通の手で attack に替わり、逃げ道を外れて本人のそばに立ち尽くした。討てない・追わない組なので狙いの外に置き、逃げ道へ戻す
    if (F.yokochi?.count && !F.yokochiArrived) {
      for (const u of F.yokochi.units) if (u.alive) u.noTarget = true;
      if (F.yokochi.order !== 'path') {
        const c = F.yokochi.center();
        let bi = 0, bd = Infinity;
        YOKOCHI_PATH.forEach(([x, z], i) => { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; bi = i; } });
        F.yokochi.order = 'path'; F.yokochi.path = YOKOCHI_PATH; F.yokochi.pathIdx = Math.min(bi + 1, YOKOCHI_PATH.length - 1);
      }
    }
    // 逃げ道の終わりを見ていても目の前で消さない。姿が画面外に出てから共通の退場処理へ渡す。
    if (F.yokochiArrived) for (const u of F.yokochi.units) {
      if (u.alive && !u.gone && unseenRejoin(rt, u.pos.x, u.pos.z)) rt.army.despawn(u);
    }
    // 夜明けは光と台詞で伝える。待機や斬り合いの長さだけで任務を失敗にしない。
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '中山勘解由') rt.award((t) => { t.special = { label: '中山勘解由を討ち取った', pts: 30 }; }, '中山勘解由を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && g !== rt.flags.yokochi) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 布陣図の各備の合計（三万三千五百）を人数の棒にも使い、別の説の人数と混ぜない。
const ATTACKERS = t11_hachioji.depth.A.sonae.reduce((n, g) => n + g.men, 0);
t11_hachioji.force = (rt) => ({ a: Math.max(0, Math.round(ATTACKERS - (rt.flags.ak || 0) * 20)), a0: ATTACKERS, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 8), b0: 3000 });   // 城方は兵五百ほどと女・子・職人。討死は千三百余と伝わる（目の前の一人で八人ほど）
// 竹束は細竹を縄で締めた束に（丸い杭の束に見えた。11/8 critic60。高遠と同じ作り）
t11_hachioji.world.denseTabaBundles = true;
// 11/8 critic60（八1・九4・四6）：河原の岩を丸く（角ばった六角の塊だった）・斜面の亡骸を地に着ける（宙に横になっていた）・倒れ方をばらす・
//   火を丸い炎と地面に沿う焚き口に（櫓の格子の真ん中に平たい橙の板が浮いた）・近くの木を立体の枝葉に
Object.assign(t11_hachioji.world, { unitNightScale: 0, roundRocks: true, groundedSlopeRocks: true, rockLowerRimContact: true, groundedFalls: true, terrainContactFalls: true, slopeContactFalls: true, contactFalls: true, variedFalls: true, roundedFire: true, smoothGroundFire: true, thickTrees: true });
t11_hachioji.sides = { a: { name: '前田・上杉勢', mon: 'maeda' }, b: { name: '北条勢', mon: 'hojo' } };
t11_hachioji.date = (rt) => (rt.flags.sun ? '天正十八年（1590）六月二十三日　夏・朝日' : rt.flags.dawn ? '天正十八年（1590）六月二十三日　夏・夜明けの霧' : '天正十八年（1590）六月二十三日　丑の刻・霧');
// 金の▼に添える一言：今の段の場所と行い（「印へ進め」では何をするか分からない）
t11_hachioji.goalSignAction = (rt) => {
  const F = rt.flags, i = F.dp?.on ? F.dp.i : -1;
  if (i === IX.sally) return F.sallyBack ? '冠木門へ駆け込め' : '曳橋の袂で迎え撃て';
  return { sanroku: '木戸の前へ進め', ote: '山下曲輪を破れ', bridge: '曳橋へ進め', goshu: '御主殿の敵を討て', sakamichi: '坂を登れ', kaneko: '金子丸を落とせ', taka: '高丸を落とせ', matsuki: '小宮曲輪を落とせ', hon: '本丸を落とせ', naka: '中山勘解由を討て', rakujo: '最後の城兵を討て' }[ORDER[i]] || '';
};
// 行き先の▼に必ず場所の名を添える（「40m」だけで名が無かった。11/8 critic60）
const GOAL_T = { x: 0, z: 0, label: '' };
t11_hachioji.goalSignTarget = (rt) => {
  const D = rt.flags.dp, C = D?.on && D.cur;
  // 下知の間も、最初の目標の印を切らさない。終戦後は印を残さない。
  if (!rt.flags.begun) { GOAL_T.x = 150; GOAL_T.z = 52; GOAL_T.label = '大手の木戸'; return GOAL_T; }
  // 曲輪の名を付けた印は曲輪に固定する。敵の組の中心は斬り合いで動くため使わない。
  // 付け入り・坂の途中の行き先と、中山本人を追う段だけは段が更新する場所を使う。
  const moving = D && (D.i === IX.sally || D.i === IX.sakamichi || D.i === IX.naka);
  const g = C && (moving ? C.goal || C.at : C.at || C.goal);
  if (!g || !Number.isFinite(g.x)) return null;
  GOAL_T.x = g.x; GOAL_T.z = g.z;
  GOAL_T.label = { sanroku: '大手の木戸', ote: '山下曲輪', bridge: '曳橋', sally: rt.flags.sallyBack ? '冠木門' : '曳橋', goshu: '御主殿', sakamichi: '尾根の坂', kaneko: '金子丸', taka: '高丸', matsuki: '小宮曲輪', hon: '本丸', naka: '中山勘解由', rakujo: '本丸の奥' }[ORDER[D.i]] || '';
  return GOAL_T;
};
// 小さな地図は出さない（出たり消えたりして何の物か分からなかった。11/8 critic60）
t11_hachioji.noMiniMap = true;
// 段の敵の組の赤い札は出さない（名は頭上の名札一つ。11/8 critic60）
t11_hachioji.dpNoMark = true;
t11_hachioji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t11_hachioji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t11_hachioji.history = '天正十八年（1590）の小田原攻めで、豊臣方は関東の北条の城を次々に攻めた。八王子城は北条氏照が築いた山城で、深沢山の頂の本丸から、城山川の谷の御主殿（館）まで曲輪が連なる。氏照は小田原に籠もっていたため、城は城代の横地監物や中山勘解由（家範）・狩野一庵らが守り、兵のほかに近くの村の女や子も多く籠もっていた。六月二十三日の夜明け前、前田利家・利長、上杉景勝、真田昌幸らおよそ一万五千が、先に降った大道寺政繁らを先手にして、霧の中を大手と搦手から攻めた。搦手の上杉勢は寝返った者の案内で裏の道から山頂の曲輪を衝き、城は一日で落ちた。中山勘解由は利家の助命を断って討死し、城代の横地監物は落ちのびた。御主殿の滝では女たちが身を投げたと伝えられる。八王子城の落城は小田原に知らされ、北条の心を折る一つとなった。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、谷の杉の中から襲う伏兵・御主殿から打って出る城兵と上杉勢の来る道筋は、遊びのための推定である。両軍の人数には別の伝えもある。';
t11_hachioji.bushou = [{ name: '前田利家', g: /利家/ }, { name: '中山勘解由', g: /勘解由/ }];

// 素直な遊び手：段の頭（depthBot）に任せる。段の前は寄せ口のそばで待つ
// 段の途中も専用の判断を通し、届かない残兵からの離脱と中山への打ち返しを働かせる。
t11_hachioji.botBrainDepth = true;
t11_hachioji.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  // 深手で馬上のままだと手当て（布）ができず、鉄砲の届く所で退き続けて十二分止まった（11/10 act の bot・体力 4）。敵が八m 内に居ない時は降りる
  if (p.mounted && u.hp < u.maxHp * 0.5 && p.treatmentLeft > 0 && !(p.treatmentNext > b.t) && !b.army.nearestEnemy(u, 8, (o) => !o.noTarget && !o.fleeing) && !(b.t11Dis > b.t) && (b.t11DisN || 0) < 3) {
    // 11/17 クラウド：尾根の坂で降りられず、六秒ごとに降りを押すだけで千秒止まった（41,-77・段 i7）。三度で諦めて先へ
    b.t11DisN = (b.t11DisN || 0) + 1; b.t11Dis = b.t + 6; inp.e.add('KeyR'); return;
  }
  // 11/10 クラウド：前の曲輪の残り（崖の下・柵の向こうの届かない敵）に斬り掛かり続け、段の場から六十〜百m 離れたまま十三分止まった
  //   （金子丸の脇 74,-32 で高丸の段・高丸と小宮曲輪の間 9,-95 で本丸の段・本丸の口 -64,-127 で中山の段）。段の場から十二m より遠くで二十五秒動かなければ、二十秒は段の場へ登る
  //   11/10 関所：段の場へまっすぐ向かうと金子丸の柵に当たって十五分止まった。大手の道（ROUTE）の点を一つずつたどる
  const C = F.dp && F.dp.on && F.dp.cur, at = C && C.at;
  if (at && Number.isFinite(at.x)) {
    const st = b.t11Stk ||= { x: u.pos.x, z: u.pos.z, t: b.t, until: 0 };
    if (Math.hypot(u.pos.x - st.x, u.pos.z - st.z) > 3) { st.x = u.pos.x; st.z = u.pos.z; st.t = b.t; }
    if (b.t - st.t > 25 && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 12) { st.until = b.t + 20; st.t = b.t; if (p.mounted && p.canRide !== false) p.toggleMount(); }   // 11/17：馬のまま尾根の坂で千秒止まった。止まったら降りて歩く
    if (b.t < st.until) {
      const near = (x, z) => { let k = 0, best = Infinity; ROUTE.forEach(([rx, rz], i) => { const d = Math.hypot(rx - x, rz - z); if (d < best) { best = d; k = i; } }); return k; };
      const ia = near(at.x, at.z), ip = near(u.pos.x, u.pos.z);
      let q = ia === ip ? [at.x, at.z] : ROUTE[ip];
      if (ia !== ip && Math.hypot(q[0] - u.pos.x, q[1] - u.pos.z) < 3.5) q = ROUTE[ip + Math.sign(ia - ip)];
      inp.leftPressed = false; goTo(p, inp, q[0], q[1], 2); return;
    }
  }
  // 中山の段：共通の頭は迫る相手へ構え続け、中山も構えて打ち合わず、二人とも九分あまり動かなかった（当たり 0。11/10）。
  //   中山へ寄り、振りを受けてから突き返す（山中城の bot と同じ受け方）
  const n = F.naka;
  if (F.dp && F.dp.on && F.dp.i === IX.naka && n && n.alive && patientStrike) {
    const d = Math.hypot(n.pos.x - u.pos.x, n.pos.z - u.pos.z);
    p.yaw = Math.atan2(n.pos.x - u.pos.x, n.pos.z - u.pos.z);
    // 槍まで刀の間合いへ詰めると、供に阻まれて迂回し続け、指の攻撃も向きが合わず出ない。
    // 得物が届く所では歩みを止め、中山へ向いたまま打ち返す。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (d > reach * 0.85) goTo(p, inp, n.pos.x, n.pos.z, reach * 0.75);
    else inp.k.delete('KeyW');
    patientStrike(p, inp, n, d);
    // 指の操作は体の向きが合うまで突きを押さない。間合いで足を止めると体は視点を追わず、
    // 突きの要求だけが何千回も続いた。近くで向きがずれた時は一度構えて体を向ける。
    const turn = Math.atan2(Math.sin(p.yaw - u.heading), Math.cos(p.yaw - u.heading));
    if (d <= reach && Math.abs(turn) > 0.25) {
      inp.guardHold = true; inp.leftPressed = false; return;
    }
    inp.guardHold = false;
    // 11/10 クラウドわ：中山は本人を狙ったまま、供の侍が打ち手の枠を埋めて打ち込まず、隙（cd）も出ないので、
    //   bot は受けの待ちのまま一太刀も振らず刻限まで止まった（足跡 |Ns- が十分あまり続き、中山の命 60 のまま）。
    //   振りかぶりも振りも無いまま一・二秒たったら、こちらから斬り込む
    b.t11NakaT = b.t;
    const kd = b.t11Kd ||= { lp: 0, sw: 0, last: null, res: '' };
    if (u.swing && u.swing !== kd.last) { kd.last = u.swing; kd.sw++; }
    if (u.swing?.res) kd.res = u.swing.res;
    const busy = (n.atk && n.atk.target === u && !n.atk.bow) || (n.swing && !n.swing.done);
    const w = b.t11Wait ||= { t: b.t };
    if (busy || d >= reach) w.t = b.t;
    else if (b.t - w.t > 1.2 && !inp.leftPressed && (p.cd || 0) <= 0 && !p.pending && p.sta > p.maxSta * 0.3) { inp.leftPressed = true; w.t = b.t; }
    if (inp.leftPressed) kd.lp++;
    return;
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

// 足跡の控え（倒れず止まった時の読み直し）：段・段の場・退避・手当ての残り・近い敵（距離・種・残りの命）
t11_hachioji.botDbg = (b) => { const F = b.flags, u = b.player.u, C = F.dp?.on && F.dp.cur, e = b.army.nearestEnemy(u, 40, (o) => !o.noTarget);
  return `${b.player.mounted ? 'M' : ''}i${F.dp?.i ?? ''}${C?.at ? `@${Math.round(C.at.x)},${Math.round(C.at.z)}` : ''}${b.botSurviving ? 'S' : ''}${b.botSurviveUntil > b.t ? 'R' : ''}tr${b.player.treatmentLeft ?? ''}${e ? `e${Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z).toFixed(0)}${e.type[0]}${Math.round(e.hp)}${b.army.wallBetween(u.pos, -1, e.pos) ? 'W' : ''}` : ''}${F.dp?.i === IX.naka && F.naka ? `|N${Math.hypot(F.naka.pos.x - u.pos.x, F.naka.pos.z - u.pos.z).toFixed(1)}${b.player.weapon?.[0] || ''}${u.swing?.res || '-'}g${F.naka.guard ? 1 : 0}${F.naka.guarding > 0 ? 'G' : ''}c${(F.naka.cd || 0).toFixed(1)}${F.naka.target === u ? 'T' : ''}${F.naka.atk ? 'A' : ''}${b.player.guard ? 'pg' : ''}${(b.player.cd || 0) > 0 ? 'pc' : ''}${b.player.lock === F.naka ? 'L' : ''}st${Math.round(b.player.sta)}${b.t - (b.t11NakaT ?? -99) < 1 ? 'B' : ''}${b.player.dodgeT > 0 ? 'D' : ''}${b.player.pending ? 'P' : ''}k${b.t11Kd ? `${b.t11Kd.lp}/${b.t11Kd.sw}${b.t11Kd.res}` : ''}lw${b.flags.dp?.cur?.lastWords ? 1 : 0}h${Math.abs(Math.atan2(Math.sin(b.player.yaw - u.heading), Math.cos(b.player.yaw - u.heading))).toFixed(1)}${u.climb ? 'C' : ''}${b.player.knockT > 0 ? `kn${b.player.knockT.toFixed(1)}` : ''}${b.player.staggerT > 0.5 ? `sT${b.player.staggerT.toFixed(1)}` : ''}${u.stagger > 0.5 ? `uS${u.stagger.toFixed(1)}` : ''}${b.player.treating ? 'Tr' : ''}${b.player.mounted ? 'M' : ''}${b.player.lunge?.t > 0 ? 'Lu' : ''}${b.player.assist?.t > 0 ? 'As' : ''}y${(F.naka.pos.y - u.pos.y).toFixed(1)}` : ''}`; };

// 段（右上の一行。stages.js の表に、この戦の分を足す）
const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
// 右上の数は増えたり戻ったりしない（①が 0／37 から 7／51 へ、④が曲輪ごとに 8／26→0／21 と替わった。11/8 critic60）：
//   ①は木戸の新手まで入れた始めからの数、④は三つの曲輪を一つずつ ✓ にして数は出さない
const OTE_ALL = 52, OTE_LATER = 14;   // 近藤の組 26（弓を入れて）・木戸の鉄砲 12・奥の新手 14（scale 1.3 で増やした後の数）
const oteCount = (rt) => {
  const C = rt.flags.dp?.on && rt.flags.dp.i === IX.ote && rt.flags.dp.cur;
  if (!C || !C.groups) return null;
  let left = C.later?.length ? OTE_LATER : 0;
  // 制圧の判定と同じく、重傷者と退く下知を受けた兵は残兵に含めない。
  for (const g of C.groups) left += live(g);
  C.oteBeaten = Math.max(C.oteBeaten || 0, Math.min(OTE_ALL, OTE_ALL - left));
  return [C.oteBeaten, OTE_ALL];
};
STAGES.t11_hachioji = [['霧の谷を進み、大手の木戸へ', null, null, false], ['山下曲輪で近藤出羽守の組を討つ', dpAt(IX.ote), null, oteCount], ['曳橋で打って出た北条勢を迎え撃つ', dpAt(IX.sally), null, false], ['退く敵に続き、冠木門へ攻め入る', (rt) => !!rt.flags.sallyBack, null, false],
  ['尾根の急な坂を、金子丸の下まで登る', dpAt(IX.sakamichi), null, false],
  ['金子丸を落とす', dpAt(IX.kaneko), null, false], ['本丸で中山勘解由を討つ', dpAt(IX.hon)],
  ['本丸の奥で、最後まで残る城兵を討つ', dpAt(IX.rakujo), null, false]];
t11_hachioji.dpIx = IX;   // goals5.js が段の番を名で引く

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t11_hachioji);
t11_hachioji.holdUnstack = true; t11_hachioji.stackAllAttack = true;   // 11/19 夜50-18：act bot 121秒 大手の奥の新手5人が attack のまま (61,15) に重なる★★＝共通の渦の散らしを使う（今福・比叡山と同じ）

// ---- K651（kaito 11/25「立場を入れ替えるだけでできる戦は全部の家でそうする」）：八王子城の戦場を建てる所だけを出す ----
//   北条家編 h08 は hachiojiField(rt, { team: 0 }) を呼び、曲輪の柵・木戸・館を北条（守る側＝本人の側）の物として建てる。
//   元の豊臣の戦は setup の同じ所で castle(rt) を呼ぶ（順も中身も前と同じ）。地形は HACHI_WORLD（world を descriptor ごと写す）
export const HACHI_FIELD = {
  *castle(rt, o = {}) {
    const W = rt.world, team = o.team ?? 1;
    const castle0 = rt.scene.children.length;
    // 曲輪の dense:false だけでは共通の暮らしの蔵・番所が足される。館と櫓はこの戦の手置きだけにする。
    rt.flags.C = yield* buildCastlePlanSteps(rt, PLAN, { baseHeight: base, edgeW: 3, team, perch: false, interiorGuards: false, life: false, dense: false });
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    bridgeAndSteps(rt);
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    flags(rt);
    // 11/4 p100（kaito AA・AF「近づくと消える作り物の乱戦は嫌」）：大手の柵の外の軽い作りの斬り合い（toyoClash）は置かない。見える兵は全部本物
    // 御主殿の館（氏照の居館。発掘で礎石の主殿と会所が出た）。板葺きの入母屋。
    // 床だけでは壁を通り抜ける。共通の室内で壁と戸口を登録し、夜討ち前の篝火は足さない。
    goten(rt, GOSHU.x - 4, GOSHU.z - 6, { w: 16, d: 9, tile: false, team, noTarget: true, naka: true, doorFire: false, name: '御主殿' });
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    goten(rt, GOSHU.x + 12, GOSHU.z - 12, { w: 8, d: 6, tile: false, team, noTarget: true, naka: true, doorFire: false, name: '会所' });
    // 寄せ口から御主殿まで九十歩。朝霧で石垣・石段・館が消えていた（11/2）。目玉の形だけ霧を薄くする（兵・旗・柵の霧はそのまま）
    farSight(rt.scene.children.slice(castle0), { W, cap: 0.4, from: 40, to: 85, ground: { x: 60, z: 6, r: 45 } });
  },
};
export function* hachiojiField(rt, o = {}) { yield* HACHI_FIELD.castle(rt, o); }
// ---- K661（kaito 11/25「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：八王子城の寄せ手の布陣を出す ----
//   maeda＝元の setup が置く前田勢（利家の本陣・手勢・先手・利長の旗本・二の手）。陣立ての表は HACHI_DEPTH(flip)。側は t11_hachioji/side.js の shSide（h08 は北条が team 0）
export const HACHI_ARMY = {
  maeda: maedaForces,
  // 他家の戦（h08）用：元の戦では本人と段が前田の手を動かす。筋書きの無い他家の戦では、寄せ口の持ち場で待つ（利家の本陣と利長の旗本は元から動かない）
  hold(rt) {
    const F = rt.flags;
    for (const g of [F.honjin, F.naga, F.mine, F.saki, F.ni]) {
      if (!g) continue;
      g.fixed = true; g.stay = true; g.order = 'hold'; g.noFrontline = true; g.noHunt = true; g.guard = true; g.noAllyGoal = true; g.aggro = Math.min(g.aggro ?? 6, 6); g.seekRange = 0;
    }
  },
};
export const HACHI_DEPTH = (flip) => sideDepth(t11_hachioji.depth, flip);
export { SH as HACHI_SH, shSide as hachiSide };
export const HACHI_WORLD = t11_hachioji.world;
// 行き先を置く物差し：寄せ口・山下曲輪・曳橋・石段・御主殿の虎口・御主殿・金子丸・高丸・小宮曲輪・本丸・搦手・大手の道
export const HACHI_AT = { start: START, ote: OTE, bridgeS: BRIDGE_S, bridgeN: BRIDGE_N, landing: LANDING, koguchi: KOGUCHI, goshu: GOSHU, kaneko: KANEKO, taka: TAKA, matsuki: MATSUKI, hon: HON, karamete: KARAMETE, route: ROUTE, plan: PLAN };
export { t11_hachioji };
export default t11_hachioji;

import { toyotomiMore } from './toyotomi_more.js';
toyotomiMore(t11_hachioji, 't11_hachioji');   // K674：勝った後の続きの段（一戦10任務）
