// ======================================================================
// 豊臣編 11　八王子城の戦い（天正十八年 1590・六月二十三日の夜明け前）　激しい山城攻め
// 筋書きの正：docs/chapter2_toyotomi.md の「11. 八王子城の戦い」
// 城主の北条氏照は小田原に籠もり、城は城代の横地監物らと数千（女や子も多い）で守る。
// 前田利家・上杉景勝らおよそ一万五千が、霧の夜明け前に大手と搦手から攻め、一日で落とした。
// 主人公は城主として前田勢と大手から攻める。
// 段：①大手の曲輪で近藤出羽守の組を討つ ②曳橋で、御主殿から打って出た北条勢を迎え撃つ ③退く敵に続き冠木門へ駆け込む（付け入り。docs/kaito_refs_1103 の山中城の型）
//     ④金子丸・高丸・松木曲輪を落とす ⑤本丸で中山勘解由を討つ。手本と布陣・兵数は docs/battle_refs/t11_hachioji.md
// 負け方：日が昇り切る（十五分）。
// 向き：北が -z、東が +x。東の城山川の谷（大手）から西へ攻め入り、川の北の御主殿、そこから北西の尾根を深沢山の本丸へ登る。
// 縄張りは castle_plan.js（曲輪・虎口・塀）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs の hachioji（asset_dem_hachioji.js）。山の外側の起伏に混ぜる。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, kagaribi, ishigaki, kabukimon } from './props.js';
import { goten } from './castle_parts.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { addRamp } from './floors.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';

const HAS_DEM = false;   // asset_dem_hachioji.js は素材の枝で入れる（本体では置かない）
let dem = null;
if (HAS_DEM) {
  BATTLE_ASSETS.t11_hachioji = Object.freeze([...assetsForBattle('t11_hachioji'), 'dem_hachioji']);
  useTerrain('dem_hachioji', (data) => { dem = data; });
}

// ---- 場所（ゲームの座標） ----
const START = { x: 182, z: 55 };          // 前田勢の寄せ口（城山川の谷の下）。大手と寄せ口を谷の上へ詰め、始めの25秒に曳橋・石段・御主殿が霧の中に見えるように
const OTE = { x: 120, z: 52 };            // 大手の曲輪
const BRIDGE_S = { x: 82, z: 36 };        // 曳橋の南の袂
const BRIDGE_N = { x: 80, z: 19 };        // 曳橋の北の袂（石段の下）
const LANDING = { x: 80, z: 9 };          // 石段の踊り場（ここで直角に西へ折れる。発掘で戻された御主殿の虎口の形）
const KOGUCHI = { x: 63, z: 4 };          // 御主殿の虎口（石段の上）
const GOSHU = { x: 40, z: -3 };           // 御主殿
const KANEKO = { x: 72, z: -46 };         // 金子丸
const TAKA = { x: 25, z: -80 };           // 高丸
const MATSUKI = { x: -25, z: -105 };      // 松木曲輪
const HON = { x: -81, z: -136 };          // 本丸（深沢山の頂）
const KARAMETE = { x: -70, z: -60 };      // 搦手から上杉勢が出てくる所
const LIMIT = 900;                        // 日が昇り切るまで（秒）。どの段も敵の数を討ち切って進む（AB）ので、六つの段を落として本丸まで届く刻

// 大手の道：谷を西へ、曳橋で川を北へ渡り、石段を御主殿の虎口へ。そこから尾根の曲輪を一つずつ本丸へ
const ROUTE = [
  [230, 56], [START.x, START.z], [150, 52], [133, 52], [108, 52], [101, 50], [95, 42], [BRIDGE_S.x, BRIDGE_S.z], [BRIDGE_N.x, BRIDGE_N.z],
  [LANDING.x, LANDING.z], [KOGUCHI.x, KOGUCHI.z], [70, -8], [72, -34], [KANEKO.x, KANEKO.z], [66, -58], [50, -68], [44, -75], [38, -76], [TAKA.x, TAKA.z],
  [18, -92], [4, -98], [-12, -104], [MATSUKI.x, MATSUKI.z], [-38, -110], [-52, -122], [-66, -134], [HON.x, HON.z],
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
  // 北の奥の山
  h += 0.3 * Math.max(0, -z - 165);
  h += 0.35 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  if (dem) h += demRelief(dem, x, z, { xy: 1, cx: 40, cz: -40, inner: 200, fade: 60, scale: 0.06 });
  return h;
}

// ---- 縄張り：大手の曲輪・御主殿（石垣）・金子丸・高丸・松木曲輪・本丸 ----
const PLAN = {
  mon: 'hojo', name: '八王子城', type: 'yama', year: 1590, gateSlope: 7, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '大手の曲輪', level: 5.9, wall: 'saku', kind: 'san', poly: rectPoly(108, 133, 40, 64), gapAt: [[133, 52], [108, 52]], gapW: 6, floor: false },
    { id: 'goshu', name: '御主殿', level: 15, wall: 'ishigaki', kind: 'ni', poly: rectPoly(20, 60, -20, 14), gapAt: [[60, 4]] },
    { id: 'kaneko', name: '金子丸', level: 30, wall: 'saku', kind: 'koshi', poly: rectPoly(60, 84, -58, -34), gapAt: [[72, -34], [66, -58]], gapW: 5 },
    { id: 'taka', name: '高丸', level: 42, wall: 'saku', kind: 'koshi', poly: rectPoly(12, 38, -92, -68), gapAt: [[38, -76], [18, -92]], gapW: 5 },
    { id: 'matsuki', name: '松木曲輪', level: 54, wall: 'saku', kind: 'koshi', poly: rectPoly(-38, -12, -117, -93), gapAt: [[-12, -104], [-38, -110]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 66, wall: 'dobei', kind: 'hon', poly: rectPoly(-96, -66, -150, -122), gapAt: [[-66, -134]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_e', name: '大手の木戸', from: 'out', to: 'ote', kind: 'hira', at: [165, 52], rot: Math.PI / 2, w: 5 },
    { id: 'ote_w', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [140, 52], rot: -Math.PI / 2, w: 5 },
    { id: 'goshu', name: '御主殿の虎口', from: 'out', to: 'goshu', kind: 'hira', at: [60, 4], rot: Math.PI / 2, w: 5 },
    { id: 'kaneko_s', name: '金子丸の口', from: 'out', to: 'kaneko', kind: 'hira', at: [72, -34], rot: 0, w: 4.4 },
    { id: 'kaneko_n', name: '金子丸の奥の口', from: 'kaneko', to: 'out', kind: 'hira', at: [66, -58], rot: Math.PI, w: 4.4 },
    { id: 'taka_e', name: '高丸の口', from: 'out', to: 'taka', kind: 'hira', at: [38, -76], rot: Math.PI / 2, w: 4.4 },
    { id: 'taka_n', name: '高丸の奥の口', from: 'taka', to: 'out', kind: 'hira', at: [18, -92], rot: Math.PI, w: 4.4 },
    { id: 'matsuki_e', name: '松木曲輪の口', from: 'out', to: 'matsuki', kind: 'hira', at: [-12, -104], rot: Math.PI / 2, w: 4.4 },
    { id: 'matsuki_w', name: '松木曲輪の奥の口', from: 'matsuki', to: 'out', kind: 'hira', at: [-38, -110], rot: -Math.PI / 2, w: 4.4 },
    { id: 'hon', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [-66, -134], rot: Math.PI / 2, w: 4.4 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }],
};
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
function hachiojiWay(army, u, want) {
  const q = u._t11Way || (u._t11Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) return q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
  routeAt(u.pos.x, u.pos.z, RF); routeAt(want.x, want.z, RT);
  // 道から遠い者（谷の兵・御主殿の奥）と、同じ区間の行き先はそのまま
  if (RF.d > 30 || RT.d > 30 || Math.abs(RT.s - RF.s) < 0.6) return want;
  q.active = true;
  if (RF.d > 4) { q.x = RF.x; q.z = RF.z; return q; }
  const fwd = RT.s > RF.s;
  let i = fwd ? Math.floor(RF.s) + 1 : Math.ceil(RF.s) - 1;
  i = Math.max(0, Math.min(ROUTE.length - 1, i));
  // 曲がり角の手前の止まる輪（botRadius 2）の内なら次の角へ（1.5 だと角の 2m 手前で bot が着いたとみなして止まった。11/4 p100）
  if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < q.botRadius + 0.6) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RT.s : i < RT.s)) { q.x = RT.x; q.z = RT.z; }
  else { q.x = ROUTE[i][0]; q.z = ROUTE[i][1]; }
  return q;
}

// ---- 曳橋と石段（形は一つずつにまとめる。毎コマ new しない） ----
function bridgeAndSteps(rt) {
  const W = rt.world;
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95 });
  const box = (parts, w, h, d, x, y, z, ry = 0, pitch = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (pitch) g.rotateX(pitch); g.rotateY(ry); g.translate(x, y, z); parts.push(g); };
  const merge = (parts, mat) => {
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = []; let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (const i of g.index.array) idx.push(i + o); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); rt.scene.add(m);
  };
  // 曳橋：南の袂から北の袂へ。両岸の高さの差は、床をゆるく傾けてつなぐ
  const ax = BRIDGE_S.x, az = BRIDGE_S.z + 1, bx = BRIDGE_N.x, bz = BRIDGE_N.z - 1;
  const ya = W.heightAt(ax, az) + 0.3, yb = W.heightAt(bx, bz) + 0.3, len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = Math.sin(ry), uz = Math.cos(ry), px = uz, pz = -ux;
  const y = (ya + yb) / 2, pitch = -Math.asin(Math.max(-0.5, Math.min(0.5, (yb - ya) / len)));
  const planks = [];
  box(planks, 3.4, 0.22, len, mx, y, mz, ry, pitch);
  for (const s of [-1, 1]) {
    box(planks, 0.16, 0.16, len, mx + px * s * 1.6, y + 1.0, mz + pz * s * 1.6, ry, pitch);
    for (let k = -2; k <= 2; k++) {
      const cx = mx + ux * k * len / 5 + px * s * 1.6, cz = mz + uz * k * len / 5 + pz * s * 1.6, cy = y + (yb - ya) * k / 5;
      box(planks, 0.18, 1.0, 0.18, cx, cy + 0.5, cz);
      const gy = W.heightAt(cx, cz);
      if (gy < cy - 0.4) box(planks, 0.3, cy - gy + 0.2, 0.3, cx, (cy + gy) / 2 - 0.1, cz);
    }
  }
  merge(planks, wood);
  addRamp({ ax, az, bx, bz, w: 3.4, ya: ya + 0.11, yb: yb + 0.11 });
  // 石段：北の袂から踊り場へ北に上り、直角に折れて西の冠木門へ（発掘で戻された御主殿の虎口）。段ごとに地面の上へ薄い石を据える
  const steps = [];
  const flight = (sx, sz, tx, tz, n) => {
    const sr = Math.atan2(tx - sx, tz - sz);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = sx + (tx - sx) * t, z = sz + (tz - sz) * t;
      box(steps, 4.2, 0.36, 1.1, x, W.heightAt(x, z) + 0.08, z, sr);
    }
  };
  flight(BRIDGE_N.x, BRIDGE_N.z, LANDING.x, LANDING.z + 2, 9);
  box(steps, 5, 0.3, 5, LANDING.x, W.heightAt(LANDING.x, LANDING.z) + 0.06, LANDING.z);
  flight(LANDING.x - 2.5, LANDING.z - 0.5, KOGUCHI.x + 2, KOGUCHI.z + 0.5, 13);
  merge(steps, stone);
  // 石段を挟む野面の石垣（低い段々）。上の段から折れの所へ横矢がかかる
  // 二つの段（base の TORA_A・TORA_B）の縁を留める石垣。天端は段の高さ
  // 辺ごとに積み、出隅で法の傾きの隙間が開かないよう、両端を少し伸ばして重ねる
  const wall = (pts, topY) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / l * 0.9, ez = (bz - az) / l * 0.9;
      rt.scene.add(ishigaki(W, [[ax - ex, az - ez], [bx + ex, bz + ez]], { out: 1, topY, minH: 1.2, maxH: 4.2, lean: 0.12 }));
    }
  };
  wall([[64, 20], [77, 20], [77, TORA_A(77)], [64, TORA_A(64)]], 15.4);   // 下の段：川・北への上り・西への上りの三方を見下ろす（横矢）
  wall([[64, -4], [64, TORA_B(64)], [82, TORA_B(82)], [82, -4]], 17.9);   // 上の段：西への上りの北
  // 上の冠木門（復元の門と同じ、柱二本に冠木）
  rt.scene.add(kabukimon(W, KOGUCHI.x + 1, KOGUCHI.z + 0.4, 4.6, Math.PI / 2, { doors: false }));
  // 尾根の柵門（金子丸と高丸の間）
  rt.scene.add(kabukimon(W, 50, -68, 4.4, Math.atan2(-16, -10), { doors: false }));
}

// ---- 旗と篝火：前田の寄せ口・北条の曲輪 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 10, START.z, 12, 9, 4, { mon: 'maeda' }));
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, 'maeda', 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[128, 44], [128, 60], [56, -16], [24, 10], [80, -38], [34, -70], [-16, -96], [-70, -126], [-90, -144]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
  for (const [x, z] of [[OTE.x, OTE.z - 6], [KOGUCHI.x + 3, KOGUCHI.z - 4], [KANEKO.x - 6, KANEKO.z], [HON.x + 6, HON.z]]) rt.scene.add(kagaribi(W, x, z));
}

// 曲輪の守り（段の敵の組の形）：鉄砲は上から撃つ
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92 });

// 付け入り（docs/kaito_refs_1103 の山中城の型・kaito 11/3）：御主殿の城兵が冠木門を開いて石段を下り、曳橋を渡って打って出る。
//   ① 曳橋の南の袂で迎え撃つ → 半ばを討つと石段を退く ② 退く敵に紛れて冠木門へ駆け込めば、門を閉める間を与えず御主殿へなだれ込む（F.tsukeiri）。
//   遅れれば門は固められ、虎口の上の段から鉄砲を撃ちかける新手を石段の上で討たねばならない。段は b_depth.js の形（start・tick・end）
const SALLY_PATH = [[KOGUCHI.x + 2, KOGUCHI.z + 0.5], [LANDING.x, LANDING.z], [BRIDGE_N.x, BRIDGE_N.z], [BRIDGE_S.x, BRIDGE_S.z + 3]];
const BACK_PATH = [[BRIDGE_N.x, BRIDGE_N.z], [LANDING.x, LANDING.z], [KOGUCHI.x + 2, KOGUCHI.z + 0.5], [GOSHU.x + 8, GOSHU.z]];
const TSUKE_R = 7, TSUKE_SEC = 35;
function sallyStep() {
  const live = (g) => (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0);
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
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 16 }], HOJO));
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 14; q.seekRange = 30; };
      g.dmgMult = ctx.dmg ?? 0.58;
      // 上の段（横矢の石垣の上）から鉄砲で援ける組：段に留まって撃つ
      const gun = F.sallyGun = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '虎口の鉄砲', anchor: { x: 70, z: 15 }, facing: Math.PI, width: 5, aggro: 3, morale: 90, order: 'hold', noRout: true },
        dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 3 }], HOJO));
      gun.dmgMult = 0.5;
      C.groups.push(g, gun);
      F.sallyN = g.units.length;
      rt.obj('dp', '曳橋の袂で、打って出た北条勢を迎え撃て', 'main');
      rt.marker('dp', BRIDGE_S, '曳橋', { h: 3 });
      for (const f of ctx.friends(rt)) if (f && f.count) { f.order = 'attack'; f.anchor = { x: BRIDGE_S.x + 4, z: BRIDGE_S.z + 6 }; f.seekRange = 30; }
      rt.army.play('eshout', { x: LANDING.x, z: LANDING.z }, 1.6);
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, g = F.sallyG, p = rt.player.u.pos;
      // ① 迎え撃つ：半ばを討てば石段を退く
      if (!F.sallyBack) {
        rt.objProgress('dp', `敵 ${live(g)}人`);
        if (live(g) <= F.sallyN * 0.5 || el > 120) {
          F.sallyBack = true; C.backT = el;
          g.order = 'path'; g.path = BACK_PATH; g.pathIdx = 0; g.speed = 3.2; g.aggro = 0; g.noRout = true; g.focus = null;
          g.onArrive = (q) => { q.order = 'hold'; q.aggro = 8; };
          for (const u of g.units) if (u.alive) { u.target = null; u.aiT = 0; }
          rt.say('北条の侍', '引け！　門の内へ引け！', 2.6);
          rt.after(1.2, () => rt.say('前田利長', '退く敵に続け！　門を閉めさせるな！', 3.4));
          rt.obj('dp', '退く敵に続き、石段の上の冠木門へ駆け込め', 'main');
          rt.unmark('dp'); rt.marker('dp', { x: KOGUCHI.x + 1, z: KOGUCHI.z + 0.4 }, '冠木門', { h: 3 });
          for (const f of ctx.friends(rt)) if (f && f.count) { f.order = 'attack'; f.anchor = { x: KOGUCHI.x, z: KOGUCHI.z }; f.seekRange = 24; }
        }
        return false;
      }
      // ② 付け入り：退く敵に追いすがって冠木門へ（自分か、味方の先の者）
      if (!F.tsukeiri && !F.gateShut) {
        const left = Math.max(0, Math.ceil(TSUKE_SEC - (el - C.backT)));
        rt.objProgress('dp', `門が閉まるまで あと${left}秒`);
        let inn = Math.hypot(p.x - KOGUCHI.x, p.z - KOGUCHI.z) < TSUKE_R;
        if (!inn) for (const f of ctx.friends(rt)) for (const u of f?.units || []) if (u.alive && Math.hypot(u.pos.x - KOGUCHI.x, u.pos.z - KOGUCHI.z) < 3) { inn = true; break; }
        if (inn) {
          F.tsukeiri = true;
          rt.banner('付け入り', '門を閉める間を与えず、御主殿へなだれ込む');
          sfx('horagai', 0.8);
          rt.award((t) => t.side.push('退く敵に続き、冠木門へ付け入った'), '冠木門へ付け入った');
          for (const q of [g, F.sallyGun]) if (q) { q.noRout = false; q.morale = Math.min(q.morale, 10); }
          return true;
        }
        if (el - C.backT > TSUKE_SEC) {
          F.gateShut = true;
          rt.say('前田の侍', '門を固められた！　石段を押し上れ！', 3.2);
          const ng = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '冠木門の守り', anchor: { x: KOGUCHI.x - 3, z: KOGUCHI.z }, facing: Math.PI / 2, width: 5, aggro: 10, morale: 90, order: 'hold', seekRange: 14 },
            dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], HOJO));
          ng.dmgMult = ctx.dmg ?? 0.58;
          C.groups.push(ng);
        }
        return false;
      }
      // 門を固められた時：冠木門の守りと虎口の鉄砲を討てば、虎口を抜ける
      const rest = C.groups.reduce((n, q) => n + live(q), 0) - live(g);
      rt.objProgress('dp', `冠木門の敵 ${rest}人`);
      return rest <= 2;
    },
    end(rt, C) {
      for (const q of C.groups) if (q) { q.noRout = false; q.morale = Math.min(q.morale, 10); }
      rt.unmark('dp');
      rt.objDone('dp');
      rt.flags.sallyDone = true;
      if (!rt.flags.tsukeiri) rt.award((t) => t.side.push('御主殿の虎口を破った'), '御主殿の虎口を破った');
    },
  };
}

const t11_hachioji = {
  // 11/4 p100：行き先の印は今の目標の金の▼一つだけ（kaito AL・AN・AP12）。奥の軽い乱戦（front_fill）も置かない（AA）
  noFrontFill: true, kumiLead: false, noGoalCount: true, goalSignNameOnly: true, noLeaderFollow: true,
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  noWake: true,
  minutes: 7,
  // 曲輪の狭い所で四方から打たれやすい。本人へ同時に打ち込むのは二人まで（高遠の城攻めと同じ）
  playerAtkMax: 2,
  world: {
    seed: 1590623,
    time: 'morning',
    mist: true,
    groundHalf: 280,
    paths: [ROUTE.slice(0, 9), ROUTE.slice(8)],
    height,
    moveWay: hachiojiWay,
    streams: [{ pts: RIVER, w: 3, depth: 1.2 }],
    tint(x, z, h, c) {
      // 尾根の道と曲輪の土
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 谷の河原
      if (distToPolyline(x, z, RIVER) < 6) { c.setRGB(c.r * 0.5 + 0.23, c.g * 0.5 + 0.23, c.b * 0.5 + 0.2); return; }
      // 山の杉と檜の下の暗い土と苔
      if (h > 12) c.setRGB(c.r * 0.72, c.g * 0.82, c.b * 0.7);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 9 && x < k.poly[1][0] + 9 && z > k.poly[0][1] - 9 && z < k.poly[2][1] + 9),   // 曲輪の中で戦う時、後ろのカメラの前に木を置かない（11/4 p100：松木曲輪で杉が画面をふさいだ）
    trees: 520,
    tufts: 2600,
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
      if (distToPolyline(x, z, RIVER) < 7) return 0.15;
      return z < 20 || z > 75 ? 1.2 : 0.35;
    },
    groves: [{ x: 120, z: 84, r: 16, n: 22, kind: 'sugi' }, { x: 110, z: -10, r: 18, n: 26, kind: 'sugi' }, { x: -40, z: -60, r: 18, n: 26, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -170 || x < -130 : x > 245),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, perch: false, interiorGuards: false });
    bridgeAndSteps(rt);
    flags(rt);
    // 11/4 p100（kaito AA・AF「近づくと消える作り物の乱戦は嫌」）：大手の柵の外の軽い作りの斬り合い（toyoClash）は置かない。見える兵は全部本物
    // 御主殿の館（氏照の居館。発掘で礎石の主殿と会所が出た）。板葺きの入母屋。見た目だけ（当たりは無し）
    goten(rt, GOSHU.x - 4, GOSHU.z - 6, { w: 16, d: 9, tile: false, team: 1, noTarget: true, name: '御主殿' });
    goten(rt, GOSHU.x + 12, GOSHU.z - 12, { w: 8, d: 6, tile: false, team: 1, noTarget: true, name: '会所' });
    // 寄せ口から御主殿まで九十歩。朝霧で石垣・石段・館が消えていた（11/2）。目玉の形だけ霧を薄くする（兵・旗・柵の霧はそのまま）
    farSight(rt.scene.children.slice(castle0), { W, cap: 0.4, from: 40, to: 85, ground: { x: 60, z: 6, r: 45 } });
    // ---- 前田勢：自分の手勢と前田の先手。利家は寄せ口の本陣に残る ----
    // 総大将の利家は寄せ口の陣幕の内に座り、前へ出ない（kaito AR3・AV7）。旗本の侍と槍が幕の前を固める
    F.honjin = allyGroup(rt, { faction: 'oda', name: '前田利家の本陣', anchor: { x: START.x + 9, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, noAI: true },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: false } }, { type: 'samurai', n: 10, o: { invuln: true } }, { type: 'ashigaru', n: 12, o: { invuln: true } }], MAEDA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], MAEDA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '前田の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利長', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], MAEDA));
    // 前田の二の手：先手の後ろから続く（寄せ手は城兵の五倍。史実の比は docs/battle_refs/t11_hachioji.md）
    F.ni = allyGroup(rt, { faction: 'oda', name: '前田の二の手', anchor: { x: START.x - 4, z: START.z + 12 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], MAEDA));
    for (const g of [F.mine, F.saki, F.ni]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('main', '日が昇り切る前に、山の上の八王子城の本丸まで攻め上り、落とす', 'main');
    // 戦の前（筋書きの一枚の言葉）
    rt.say('前田利家', '氏照の留守の城じゃ。今日のうちに落とし、小田原に見せる', 4.5);
    rt.after(5, () => rt.say(nm(rt), '霧で、前の兵の背も見えませぬ', 3.5));
    rt.after(9, () => rt.say('前田利家', '上杉殿と真田殿は搦手から寄せる。我らは大手じゃ', 4));
    rt.after(13.5, () => rt.say('前田利長', '城を守るは城代の横地監物ら。氏照はおらぬ。かかれ！', 3.6));
    rt.after(17.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends: () => [F.mine, F.saki, F.ni], look: (list) => dress(list, HOJO), scale: 1.3, backing: false, fixedSpawn: true, dmg: 0.58, botSeek: 40 }, [
      // ① 大手の曲輪：山下曲輪を守った近藤出羽守（綱秀）の組。木戸の内から鉄砲を撃ちかける
      DP.fight({ at: OTE, title: '大手の曲輪', sub: '近藤出羽守が守る', obj: '大手の曲輪で、近藤出羽守の組を討て', max: 90, noRefill: true,
        say: [['前田の侍', '木戸の内に北条の兵！　霧の中から撃ってくるぞ']],
        foes: () => [keep('近藤出羽守の組', OTE, [{ type: 'busho', n: 1, o: { name: '近藤出羽守', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }]),
          keep('大手の木戸の鉄砲', OTE, [{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }], { dx: -10, width: 6 })],
        later: [{ t: 25, say: ['前田の侍', '奥の木戸から新手じゃ！'], foes: () => [keep('大手の奥の新手', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dx: -18 })] }],
        reward: '大手の曲輪を破った' }),
      DP.move({ to: BRIDGE_S, obj: '谷の道を、曳橋の南の袂まで進め', label: '曳橋', r: 8, max: 50 }),
      // ② ③ 御主殿の虎口：城兵が石段を下り曳橋を渡って打って出る → 迎え撃つ → 退く敵に続いて冠木門へ（付け入り）
      sallyStep(),
      DP.fight({ at: GOSHU, title: '御主殿', sub: '氏照の館', obj: '御主殿の館の前の北条勢を討て', max: 60, noRefill: true,
        say: [['北条の侍', '殿の館に、一歩も入れるな！']],
        foes: (rt2) => [keep('御主殿の守り', GOSHU, [{ type: 'samurai', n: rt2.flags.tsukeiri ? 2 : 4 }, { type: 'ashigaru', n: rt2.flags.tsukeiri ? 8 : 12 }, { type: 'bow', n: 3 }], { dx: -6 })],
        reward: '御主殿を取った' }),
      // ④ 尾根の曲輪を一つずつ落とす（上からの鉄砲）
      DP.fight({ at: KANEKO, title: '金子丸', sub: '金子家重が守る尾根の曲輪', obj: '尾根を登り、金子丸の金子家重の組を討て', max: 60, noRefill: true,
        say: [['前田の侍', '上の曲輪から鉄砲じゃ！　身を低くして登れ']],
        foes: () => [keep('金子家重の組', KANEKO, [{ type: 'samurai', n: 1, o: { name: '金子家重', hat: 'kabuto_m' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 5 }])],
        reward: '金子丸を落とした' }),
      DP.fight({ at: TAKA, title: '高丸', sub: '尾根の曲輪', obj: '尾根の柵門を抜け、高丸の北条勢を討て', max: 60, noRefill: true,
        foes: () => [keep('高丸の守り', TAKA, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 5 }])],
        reward: '高丸を落とした' }),
      DP.fight({ at: MATSUKI, title: '松木曲輪', sub: '搦手から上杉勢が攻め上る', obj: '上杉勢と、松木曲輪の狩野一庵の組を討て', max: 70, noRefill: true,
        say: [['前田の侍', '搦手に竹に雀の旗！　上杉勢が来たぞ']],
        foes: () => [keep('狩野一庵の組', MATSUKI, [{ type: 'samurai', n: 1, o: { name: '狩野一庵', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }])],
        reward: '松木曲輪を落とした' }),
      // ⑤ 頂の本丸：中山勘解由（家範）は降るのを拒んで討死。城代の横地監物は西の詰城の方へ落ちる
      DP.fight({ at: HON, title: '本丸', sub: '深沢山の頂', obj: '本丸で、中山勘解由を討て', max: 90, noRefill: true,
        say: [['中山勘解由', '北条の城、ただでは渡さぬ！'], ['横地監物', '要害を固めよ。小田原の殿に顔向けできぬぞ！']],
        foes: () => [keep('中山勘解由の旗本', HON, [{ type: 'busho', n: 1, o: { name: '中山勘解由', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], { morale: 100, seek: 30 }),
          keep('横地監物の手', HON, [{ type: 'samurai', n: 1, o: { name: '横地監物', hat: 'kabuto_m', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dx: -12, dz: -8, morale: 60, seek: 20 })],
        reward: '本丸を落とした' }),
    ], (rt2) => this.win(rt2));
  },

  // 上杉勢：松木曲輪の段で、搦手（北西）から攻め上る
  uesugi(rt) {
    const F = rt.flags;
    if (F.uesugi) return;
    F.uesugi = allyGroup(rt, { faction: 'uesugi', name: '上杉勢', anchor: { x: KARAMETE.x, z: KARAMETE.z }, facing: Math.PI, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 60 },
      dress([{ type: 'busho', n: 1, o: { name: '上杉景勝', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], UESUGI));
    // 真田昌幸の手：上杉勢の脇から尾根を登る
    F.sanada = allyGroup(rt, { faction: 'uesugi', name: '真田昌幸の手', anchor: { x: KARAMETE.x + 8, z: KARAMETE.z + 6 }, facing: Math.PI, width: 6, aggro: 12, noRout: true, order: 'attack', seekRange: 50 },
      [{ type: 'busho', n: 1, o: { name: '真田昌幸', invuln: true, horse: false, flag: 'sanada' } }, { type: 'samurai', n: 1, o: { flag: 'sanada' } }, { type: 'ashigaru', n: 6, o: { flag: 'sanada' } }]);
    F.sanada.anchor = { x: MATSUKI.x + 4, z: MATSUKI.z + 8 };
    F.sanada.dmgMult = 0.7;
    rt.after(1.5, () => rt.say('上杉景勝', '搦手は上杉が破る。前田殿に遅れるな', 3.4));
    F.uesugi.anchor = { x: MATSUKI.x - 6, z: MATSUKI.z + 4 };
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
    rt.banner('八王子城、落城', '天正十八年六月二十三日　一日で落ちる');
    rt.player.u.invuln = true;
    // 戦の後（筋書きの一枚の言葉）
    rt.after(2, () => rt.say(nm(rt), '城代の横地監物は、西の詰の城から落ちた様子。城の中には、女や子が多うございました', 4.6));
    rt.after(6.5, () => rt.say('前田利家', '……これが戦よ。忘れるな', 4));
    rt.after(11, () => rt.say('前田利家', '八王子の落城を、早馬で小田原へ知らせよ。籠もる者どもの心が折れよう', 4.4));
    rt.finish({}, 16);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が昇り切った', '霧が晴れ、城はまだ落ちぬ');
    rt.say('前田利家', '日が高うなった。今日のうちに落とせなんだか', 4);
    rt.finish({ failureReason: '日が昇り切るまでに本丸を落とせなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    const D = F.dp;
    if (D && D.on && D.i >= 5) this.uesugi(rt);
    // 霧は登るほど薄れ、本丸の段で朝日が差す
    if (D && D.on && D.i >= 7 && !F.sun) { F.sun = true; rt.world.setTime('day'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('前田の侍', '東の空が白んできた！　急げ', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '中山勘解由') rt.award((t) => { t.special = { label: '中山勘解由を討ち取った', pts: 30 }; }, '中山勘解由を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

t11_hachioji.force = (rt) => ({ a: Math.round(15000 - (rt.flags.ak || 0) * 20), a0: 15000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 25), b0: 3000 });
t11_hachioji.sides = { a: { name: '前田・上杉勢', mon: 'maeda' }, b: { name: '北条勢', mon: 'hojo' } };
t11_hachioji.date = (rt) => (rt.flags.sun ? '天正十八年（1590）六月二十三日　夏・朝日' : '天正十八年（1590）六月二十三日　夏・夜明けの霧');
t11_hachioji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t11_hachioji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t11_hachioji.history = '天正十八年（1590）の小田原攻めで、豊臣方は関東の北条の城を次々に攻めた。八王子城は北条氏照が築いた山城で、深沢山の頂の本丸から、城山川の谷の御主殿（館）まで曲輪が連なる。氏照は小田原に籠もっていたため、城は城代の横地監物や中山勘解由（家範）・狩野一庵らが守り、兵のほかに近くの村の女や子も多く籠もっていた。六月二十三日の夜明け前、前田利家・利長、上杉景勝、真田昌幸らおよそ一万五千が霧の中を大手と搦手から攻め、城は一日で落ちた。中山勘解由らは討死し、御主殿の滝では女たちが身を投げたと伝えられる。八王子城の落城は小田原に知らされ、北条の心を折る一つとなった。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、伏兵や上杉勢の来る道筋は推定である。両軍の人数には別の伝えもある。';
t11_hachioji.bushou = [{ name: '前田利家', g: /利家/ }, { name: '中山勘解由', g: /勘解由/ }];

// 素直な遊び手：段の頭（depthBot）に任せる。段の前は寄せ口のそばで待つ
t11_hachioji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

// 段（右上の一行。stages.js の表に、この戦の分を足す）
const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.t11_hachioji = [['大手の曲輪で近藤出羽守の組を討つ'], ['曳橋で打って出た北条勢を迎え撃つ', dpAt(2)], ['退く敵に続き、冠木門から御主殿へ攻め入る', (rt) => !!rt.flags.sallyBack], ['金子丸・高丸・松木曲輪を落とす', dpAt(4)], ['本丸で中山勘解由を討つ', dpAt(7)]];

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t11_hachioji);

export { t11_hachioji };
export default t11_hachioji;
