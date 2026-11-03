// ======================================================================
// 豊臣編 11　八王子城の戦い（天正十八年 1590・六月二十三日の夜明け前）　激しい山城攻め
// 筋書きの正：docs/chapter2_toyotomi.md の「11. 八王子城の戦い」
// 城主の北条氏照は小田原に籠もり、城は城代の横地監物らと数千（女や子も多い）で守る。
// 前田利家・上杉景勝らおよそ一万五千が、霧の夜明け前に大手と搦手から攻め、一日で落とした。
// 主人公は城主として前田勢と大手から攻める。
// 段：①霧の中、大手の坂を登る ②御主殿の虎口の石段と曳橋を抜ける ③尾根の曲輪を一つずつ落とす ④頂の本丸を落とす
// 負け方：日が昇り切る（六分）。
// 向き：北が -z、東が +x。東の城山川の谷（大手）から西へ攻め入り、川の北の御主殿、そこから北西の尾根を深沢山の本丸へ登る。
// 縄張りは castle_plan.js（曲輪・虎口・塀）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs の hachioji（asset_dem_hachioji.js）。山の外側の起伏に混ぜる。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, kagaribi } from './props.js';
import { goten } from './castle_parts.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { addRamp } from './floors.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';
import { toyoClash } from './toyo_mob.js';

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
const KOGUCHI = { x: 63, z: 4 };          // 御主殿の虎口（石段の上）
const GOSHU = { x: 40, z: -3 };           // 御主殿
const KANEKO = { x: 72, z: -46 };         // 金子丸
const TAKA = { x: 25, z: -80 };           // 高丸
const MATSUKI = { x: -25, z: -105 };      // 松木曲輪
const HON = { x: -81, z: -136 };          // 本丸（深沢山の頂）
const KARAMETE = { x: -70, z: -60 };      // 搦手から上杉勢が出てくる所
const LIMIT = 420;                        // 日が昇り切るまで（秒）。曲輪を一つずつ落として本丸まで届く刻

// 大手の道：谷を西へ、曳橋で川を北へ渡り、石段を御主殿の虎口へ。そこから尾根の曲輪を一つずつ本丸へ
const ROUTE = [
  [230, 56], [START.x, START.z], [150, 52], [133, 52], [108, 50], [95, 42], [BRIDGE_S.x, BRIDGE_S.z], [BRIDGE_N.x, BRIDGE_N.z],
  [72, 12], [KOGUCHI.x, KOGUCHI.z], [70, -8], [72, -34], [KANEKO.x, KANEKO.z], [66, -58], [50, -68], [38, -76], [TAKA.x, TAKA.z],
  [18, -92], [4, -98], [-12, -104], [MATSUKI.x, MATSUKI.z], [-38, -110], [-52, -122], [-66, -134], [HON.x, HON.z],
];
// 尾根の背（x, z, 高さ）：曲輪の段の高さと、間の坂
const SPINE = [
  [KOGUCHI.x, KOGUCHI.z, 15], [70, -8, 20], [72, -34, 30], [72, -46, 30], [66, -58, 30], [38, -76, 42], [25, -80, 42], [18, -92, 42],
  [-12, -104, 54], [-25, -105, 54], [-38, -110, 54], [-66, -134, 66], [-81, -136, 66], [-122, -160, 62],
];
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
  if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < 1.5) i += fwd ? 1 : -1;
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
  // 石段：北の袂から虎口へ。段ごとに地面の上へ薄い石を据える
  const steps = [], sx = BRIDGE_N.x, sz = BRIDGE_N.z, tx = KOGUCHI.x + 2, tz = KOGUCHI.z + 1, n = 16, sr = Math.atan2(tx - sx, tz - sz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = sx + (tx - sx) * t, z = sz + (tz - sz) * t, gy = W.heightAt(x, z);
    box(steps, 4.2, 0.36, 1.1, x, gy + 0.08, z, sr);
  }
  merge(steps, stone);
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

const t11_hachioji = {
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
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
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
    // 大手の曲輪の南の柵の外で、霧の中を先に上がった前田の先手と城の兵が斬り合う（始めの25秒のカメラの右前 33m）
    F.near = toyoClash(rt, { x: 110, z: 38, facing: -Math.PI / 2 + 0.6, w: 26, seed: 11090,
      A: { flag: 'maeda', armor: 0x2a2622, count: 120 }, B: { flag: 'hojo', armor: HOJO.armor, count: 110, guns: true } });
    // 御主殿の館（氏照の居館。発掘で礎石の主殿と会所が出た）。板葺きの入母屋。見た目だけ（当たりは無し）
    goten(rt, GOSHU.x - 4, GOSHU.z - 6, { w: 16, d: 9, tile: false, team: 1, noTarget: true, name: '御主殿' });
    goten(rt, GOSHU.x + 12, GOSHU.z - 12, { w: 8, d: 6, tile: false, team: 1, noTarget: true, name: '会所' });
    // 寄せ口から御主殿まで九十歩。朝霧で石垣・石段・館が消えていた（11/2）。目玉の形だけ霧を薄くする（兵・旗・柵の霧はそのまま）
    farSight(rt.scene.children.slice(castle0), { W, cap: 0.4, from: 40, to: 85, ground: { x: 60, z: 6, r: 45 } });
    // ---- 前田勢：自分の手勢と前田の先手。利家は寄せ口の本陣に残る ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '前田利家の本陣', anchor: { x: START.x + 8, z: START.z }, facing: -Math.PI / 2, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], MAEDA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], MAEDA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '前田の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利長', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], MAEDA));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.2; g.dmgMult = 0.8; }
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
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends: () => [F.mine, F.saki], look: (list) => dress(list, HOJO), scale: 1.3, backing: false, fixedSpawn: true, dmg: 0.58, botSeek: 40 }, [
      // ① 霧の中、大手の坂を登る
      DP.fight({ at: OTE, title: '大手', sub: '霧の中、城山川の谷を登る', obj: '霧の中、大手の坂を登れ', max: 60,
        say: [['前田の侍', '木戸の内に北条の兵！　霧の中から撃ってくるぞ']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])],
        reward: '大手の木戸を破った' }),
      DP.move({ to: BRIDGE_S, obj: '曳橋の袂まで登れ', label: '曳橋', r: 8, max: 50,
        ambush: { d: 34, say: ['前田の侍', '霧の中に伏兵じゃ！'], foes: () => [keep('谷の伏兵', { x: 92, z: 66 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      // ② 御主殿の虎口の石段と曳橋を抜ける
      DP.fight({ at: BRIDGE_N, title: '御主殿の虎口', sub: '霧の中から石垣と石段が現れる', obj: '曳橋を渡り、虎口の石段を上れ', max: 60,
        say: [['前田の侍', '石垣の上から撃ちかけてくる！　石段を一気に上れ']],
        foes: () => [keep('曳橋の守り', BRIDGE_N, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], { dz: -3 }), keep('虎口の鉄砲', KOGUCHI, [{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3 }], { dx: 3, width: 6 })],
        reward: '御主殿の虎口を破った' }),
      DP.fight({ at: GOSHU, title: '御主殿', sub: '氏照の館', obj: '御主殿の北条勢を崩せ', max: 50,
        say: [['狩野一庵', '殿の館に、一歩も入れるな！']],
        foes: () => [keep('御主殿の守り', GOSHU, [{ type: 'samurai', n: 1, o: { name: '狩野一庵', hat: 'kabuto_m' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }])],
        reward: '御主殿を取った' }),
      // ③ 尾根の曲輪を一つずつ落とす（上からの鉄砲）
      DP.fight({ at: KANEKO, title: '金子丸', sub: '尾根の曲輪を一つずつ落とす', obj: '金子丸を落とせ', max: 50,
        say: [['前田の侍', '上の曲輪から鉄砲じゃ！　身を低くして登れ']],
        foes: () => [keep('金子丸の守り', KANEKO, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 4 }])],
        reward: '金子丸を落とした' }),
      DP.fight({ at: TAKA, title: '高丸', sub: '尾根の曲輪', obj: '高丸を落とせ', max: 50,
        foes: () => [keep('高丸の守り', TAKA, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 4 }])],
        reward: '高丸を落とした' }),
      DP.fight({ at: MATSUKI, title: '松木曲輪', sub: '搦手から上杉勢が攻め上る', obj: '松木曲輪を落とせ', max: 55,
        say: [['前田の侍', '搦手に竹に雀の旗！　上杉勢が来たぞ']],
        foes: () => [keep('松木曲輪の守り', MATSUKI, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])],
        reward: '松木曲輪を落とした' }),
      // ④ 頂の本丸を落とす
      DP.fight({ at: HON, title: '本丸', sub: '深沢山の頂', obj: '本丸の中山勘解由を討て', max: 75,
        say: [['中山勘解由', '北条の城、ただでは渡さぬ！'], ['横地監物', '要害を固めよ。小田原の殿に顔向けできぬぞ！']],
        foes: () => [keep('本丸の守り', HON, [{ type: 'busho', n: 1, o: { name: '中山勘解由', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 1, o: { name: '横地監物', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], { morale: 100, seek: 30 })],
        reward: '本丸に攻め入った' }),
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
    rt.after(2, () => rt.say(nm(rt), '城の中に、女や子が多うございました', 4));
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
    if (D && D.on && D.i >= 6) this.uesugi(rt);
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
STAGES.t11_hachioji = [['霧の中、大手の坂を登る'], ['御主殿の虎口の石段と曳橋を抜ける', dpAt(2)], ['尾根の曲輪を一つずつ落とす', dpAt(4)], ['頂の本丸を落とす', dpAt(7)]];

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t11_hachioji);

export { t11_hachioji };
export default t11_hachioji;
