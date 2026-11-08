// ======================================================================
// 豊臣編 11　八王子城の戦い（天正十八年 1590・六月二十三日の夜明け前）　激しい山城攻め
// 筋書きの正：docs/chapter2_toyotomi.md の「11. 八王子城の戦い」
// 城主の北条氏照は小田原に籠もり、城は城代の横地監物らと数千（女や子も多い）で守る。
// 前田利家・上杉景勝らおよそ一万五千が、霧の夜明け前に大手と搦手から攻め、一日で落とした。
// 主人公は城主として前田勢と大手から攻める。
// 段：①山下曲輪で近藤出羽守の組を討つ ②曳橋で、御主殿から打って出た北条勢を迎え撃つ ③退く敵に続き冠木門へ駆け込む（付け入り。docs/kaito_refs_1103 の山中城の型）
//     ④金子丸・高丸・小宮曲輪を落とす ⑤本丸で中山勘解由を討つ。手本と布陣・兵数は docs/battle_refs/t11_hachioji.md
// 負け方：日が昇り切る（十五分）。
// 向き：北が -z、東が +x。東の城山川の谷（大手）から西へ攻め入り、川の北の御主殿、そこから北西の尾根を深沢山の本丸へ登る。
// 縄張りは castle_plan.js（曲輪・虎口・塀）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs の hachioji（asset_dem_hachioji.js）。山の外側の起伏に混ぜる。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, kagaribi, ishigaki, kabukimon, yagura } from './props.js';
import { goten } from './castle_parts.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { revealName } from './battle_intel.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';
import { rainVolley } from './arrow_rain.js';
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
const KARAMETE_PATH = [[-70, -60], [-66, -78], [-56, -96], [-46, -112], [-44, -110]];
const LIMIT = 900;                        // 日が昇り切るまで（秒）。どの段も敵の数を討ち切って進む（AB）ので、六つの段を落として本丸まで届く刻

// 大手の道：谷を西へ、曳橋で川を北へ渡り、石段を御主殿の虎口へ。そこから尾根の曲輪を一つずつ本丸へ
const ROUTE = [
  [230, 56], [START.x, START.z], [150, 52], [133, 52], [108, 52], [101, 50], [95, 42], [BRIDGE_S.x, BRIDGE_S.z], [BRIDGE_N.x, BRIDGE_N.z],
  [LANDING.x, LANDING.z], [KOGUCHI.x, KOGUCHI.z], [70, -8], [72, -34], [KANEKO.x, KANEKO.z], [66, -58], [50, -68], [44, -75], [38, -76], [TAKA.x, TAKA.z],
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

// ---- 縄張り：山下曲輪・御主殿（石垣）・金子丸・高丸・小宮曲輪・本丸 ----
// 御主殿は主殿と会所の館（長屋・馬屋の並ぶ二の丸の作りにしない）。山の曲輪は土の城：砂利の平場・長屋・櫓の並びを置かず、本丸も土塁に柵（11/8 critic60）
const PLAN = {
  mon: 'hojo', name: '八王子城', type: 'yama', year: 1590, gateSlope: 7, lifeNoFlags: true,
  continuousEdges: true,   // 11/8 critic60（八1）：曲輪の縁の外で地面が段に落ち、盛り土の斜面が平たい大きな三角の面に見えた。縁から切岸へ続けて下ろす
  kuruwa: [
    { id: 'ote', name: '山下曲輪', level: 5.9, wall: 'saku', kind: 'san', poly: rectPoly(108, 133, 40, 64), gapAt: [[133, 52], [108, 52]], gapW: 6, floor: false },
    { id: 'goshu', name: '御主殿', level: 15, wall: 'ishigaki', kind: 'yakata', dense: false, poly: rectPoly(20, 60, -20, 14), gapAt: [[60, 4]] },
    { id: 'kaneko', name: '金子丸', level: 30, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(60, 84, -58, -34), gapAt: [[72, -34], [66, -58]], gapW: 5 },
    { id: 'taka', name: '高丸', level: 42, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(12, 38, -92, -68), gapAt: [[38, -76], [18, -92]], gapW: 5 },
    { id: 'matsuki', name: '小宮曲輪', level: 54, wall: 'saku', kind: 'koshi', floor: false, dense: false, poly: rectPoly(-38, -12, -117, -93), gapAt: [[-12, -104], [-38, -110]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 66, wall: 'saku', dorui: 1.8, kind: 'hon', floor: false, dense: false, poly: rectPoly(-96, -66, -150, -122), gapAt: [[-66, -134]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_e', name: '大手の木戸', from: 'out', to: 'ote', kind: 'hira', at: [165, 52], rot: Math.PI / 2, w: 5 },
    { id: 'ote_w', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [140, 52], rot: -Math.PI / 2, w: 5 },
    { id: 'goshu', name: '御主殿の虎口', from: 'out', to: 'goshu', kind: 'hira', at: [60, 4], rot: Math.PI / 2, w: 5 },
    { id: 'kaneko_s', name: '金子丸の口', from: 'out', to: 'kaneko', kind: 'hira', at: [72, -34], rot: 0, w: 5.6 },
    { id: 'kaneko_n', name: '金子丸の奥の口', from: 'kaneko', to: 'out', kind: 'hira', at: [66, -58], rot: Math.PI, w: 5.6 },
    { id: 'taka_e', name: '高丸の口', from: 'out', to: 'taka', kind: 'hira', at: [38, -76], rot: Math.PI / 2, w: 5.6 },
    { id: 'taka_n', name: '高丸の奥の口', from: 'taka', to: 'out', kind: 'hira', at: [18, -92], rot: Math.PI, w: 5.6 },
    { id: 'matsuki_e', name: '小宮曲輪の口', from: 'out', to: 'matsuki', kind: 'hira', at: [-12, -104], rot: Math.PI / 2, w: 5.6 },
    { id: 'matsuki_w', name: '小宮曲輪の奥の口', from: 'matsuki', to: 'out', kind: 'hira', at: [-38, -110], rot: -Math.PI / 2, w: 5.6 },
    { id: 'hon', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [-66, -134], rot: Math.PI / 2, w: 5.6 },
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

// 味方の組を、谷の道と尾根の道の曲がり角を順にたどって段の場所へ（11/4：攻める号令のままでは山下曲輪の柵に掛かって寄せ口に残った）。
//   細い道は二列の縦隊で歩き、着いたら槍の備に組み直して段の敵へかかる
const RG = { d: 0, s: 0, x: 0, z: 0 };
function marchTo(rt, g, to, k = 0) {
  if (!g || !g.count || g.routed) return;
  const c = g.center(), at = { x: to.x + (k % 2 ? 3 : -3) * Math.ceil(k / 2), z: to.z + 3 * k };
  routeAt(c.x, c.z, RG); const s0 = RG.s, d0 = RG.d, rx = RG.x, rz = RG.z;
  routeAt(at.x, at.z, RG); const s1 = RG.s;
  const path = [];
  if (d0 > 3) path.push([rx, rz]);
  if (s1 > s0) for (let i = Math.floor(s0) + 1; i <= Math.floor(s1); i++) path.push(ROUTE[i]);
  else for (let i = Math.ceil(s0) - 1; i >= Math.ceil(s1); i--) path.push(ROUTE[i]);
  path.push([at.x, at.z]);
  // 柵の外へはぐれて止まった者（列の後ろが遅れると先頭が待ち続ける）は、遊び手から見えない時だけ組の中へ戻す
  //   戻す先は、組の中で遊び手から一番遠い者のそば（目の前に湧かせない）
  const P = rt.player.u.pos, far = (u) => Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
  let rear = null;
  for (const u of g.units) if (u.alive && !u.fleeing && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 12 && (!rear || far(u) > far(rear))) rear = u;
  if (rear && far(rear) > 30) for (const u of g.units) if (u.alive && !u.fleeing && !u.isPlayer && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 18 && far(u) > 45) {
    u.pos.x = rear.pos.x + (Math.random() - 0.5) * 3; u.pos.z = rear.pos.z + (Math.random() - 0.5) * 3; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.target = null; u.aiT = 0;
  }
  g.focus = null; g.dest = null; g.fixed = false;
  g.anchor = { x: c.x, z: c.z }; g.path = path; g.pathIdx = 0;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true; g.speed = 3.4;
  g.onArrive = (q) => { q.order = 'attack'; q.path = null; q.roadColumn = false; q.formation = 'yari'; q.anchor = at; q.seekRange = 30; q._fitAt = 0; };
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
  const planks = [], boards = [[], [], []];
  // 床：二本の桁の上に、渡り板を一枚ずつ横に並べる（一枚板の箱に見えた。11/8 critic60）。板の幅・色・反りを少しずつ違える
  for (const s of [-0.9, 0.9]) box(planks, 0.3, 0.34, len, mx + px * s, y - 0.25, mz + pz * s, ry, pitch);
  const nb = Math.floor(len / 0.34);
  for (let k = 0; k < nb; k++) {
    const t = (k + 0.5) / nb - 0.5, r = Math.sin(k * 12.9898) * 43758.5453 % 1;
    const cx = mx + ux * t * len, cz = mz + uz * t * len, cy = y + (yb - ya) * t;
    box(boards[k % 3], 3.4 + Math.abs(r) * 0.3, 0.09, 0.31, cx + px * r * 0.12, cy - 0.02 + Math.abs(r) * 0.03, cz + pz * r * 0.12, ry);
  }
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
  [0x5e4a35, 0x4b3a2a, 0x6a5741].forEach((c, i) => merge(boards[i], new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 })));
  addRamp({ ax, az, bx, bz, w: 3.4, ya: ya + 0.11, yb: yb + 0.11 });
  // 石段：北の袂から踊り場へ北に上り、直角に折れて西の冠木門へ（発掘で戻された御主殿の虎口）。段ごとに地面の上へ薄い石を据える
  // 一段を大小の野面の石三〜四つで組む（灰色の箱の重なりに見えた。11/8 critic60）。石ごとに幅・高さ・出・色を違える
  const steps = [], stones = [[], [], []];
  let sd = 7;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const flight = (sx, sz, tx, tz, n) => {
    const sr = Math.atan2(tx - sx, tz - sz), cx = Math.cos(sr), cz = -Math.sin(sr);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = sx + (tx - sx) * t, z = sz + (tz - sz) * t, gy = W.heightAt(x, z);
      box(steps, 4.0, 0.2, 0.9, x, gy - 0.02, z, sr);   // 隠れる下地（石の間から地面が抜けない）
      let u = -2.1;
      while (u < 2.05) {
        const w = Math.min(2.1 - u, 0.7 + rnd() * 0.8), h = 0.3 + rnd() * 0.1, d = 0.95 + rnd() * 0.25, o = (rnd() - 0.5) * 0.12;
        const c = u + w / 2;
        box(stones[Math.floor(rnd() * 3)], w - 0.06, h, d, x + cx * c + Math.sin(sr) * o, gy + 0.06 + (h - 0.36) / 2, z + cz * c + Math.cos(sr) * o, sr + (rnd() - 0.5) * 0.06);
        u += w;
      }
    }
  };
  flight(BRIDGE_N.x, BRIDGE_N.z, LANDING.x, LANDING.z + 2, 9);
  box(steps, 5, 0.3, 5, LANDING.x, W.heightAt(LANDING.x, LANDING.z) + 0.06, LANDING.z);
  flight(LANDING.x - 2.5, LANDING.z - 0.5, KOGUCHI.x + 2, KOGUCHI.z + 0.5, 13);
  merge(steps, stone);
  [0x837e73, 0x6c675d, 0x8e8778].forEach((c, i) => merge(stones[i], new THREE.MeshStandardMaterial({ color: c, roughness: 0.97 })));
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
  rt.scene.add(jinmaku(W, START.x + 10, START.z, 12, 9, 4, { mon: 'maeda', people: false }));   // 幕の内の床几には本物の利家が座る（作り物の大将と二人にしない）
  // 霧の夜討ちで城方に気づかれずに寄せた（明るい寄せ口に幟がずらりと立っていた。11/8 critic60）：寄せ口に篝火を焚かず、幟は幕の後ろの一本だけ
  rt.scene.add(nobori(W, START.x + 16, START.z - 6, 'maeda', 6));
  for (const [x, z] of [[128, 44], [128, 60], [56, -16], [24, 10], [80, -38], [34, -70], [-16, -96], [-70, -126], [-90, -144]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
  for (const [x, z] of [[OTE.x, OTE.z - 6], [KOGUCHI.x + 3, KOGUCHI.z - 4], [KANEKO.x - 6, KANEKO.z], [HON.x + 6, HON.z]]) rt.scene.add(kagaribi(W, x, z));
}

// 曲輪の守り（段の敵の組の形）：鉄砲は上から撃つ
//   守り手は柵・虎口の内に留まる（柵の外の平地へぞろぞろ出て来た。11/8 critic60）：寄せ手が内へ入るまで追わない（追う輪を十六歩に）
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 16, morale: o.morale || 92 });

// 付け入り（docs/kaito_refs_1103 の山中城の型・kaito 11/3）：御主殿の城兵が冠木門を開いて石段を下り、曳橋を渡って打って出る。
//   ① 曳橋の南の袂で迎え撃つ → 半ばを討つと石段を退く ② 退く敵に紛れて冠木門へ駆け込めば、門を閉める間を与えず御主殿へなだれ込む（F.tsukeiri）。
//   遅れれば門は固められ、虎口の上の段から鉄砲を撃ちかける新手を石段の上で討たねばならない。段は b_depth.js の形（start・tick・end）
// 打って出る組は石段の踊り場から（冠木門から歩くと、袂に着いても霧の中に誰もいなかった。11/8 critic60）
const SALLY_PATH = [[LANDING.x, LANDING.z], [BRIDGE_N.x, BRIDGE_N.z], [BRIDGE_S.x, BRIDGE_S.z + 3]];
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
      ctx.friends(rt).forEach((f, k) => marchTo(rt, f, { x: BRIDGE_S.x + 4, z: BRIDGE_S.z + 6 }, k));
      rt.army.play('eshout', { x: LANDING.x, z: LANDING.z }, 1.6);
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, g = F.sallyG, p = rt.player.u.pos;
      // ① 迎え撃つ：半ばを討てば石段を退く
      if (!F.sallyBack) {
        rt.objProgress('dp', `敵 ${live(g)}人`);
        if (live(g) <= F.sallyN * 0.5 || el > 120) {
          F.sallyBack = true; C.backT = el;
          C.goal = { x: KOGUCHI.x + 1, z: KOGUCHI.z + 0.4 };   // 行き先は冠木門（遊び手の印と同じ所）
          g.order = 'path'; g.path = BACK_PATH; g.pathIdx = 0; g.speed = 3.2; g.aggro = 0; g.noRout = true; g.focus = null;
          g.onArrive = (q) => { q.order = 'hold'; q.aggro = 8; };
          for (const u of g.units) if (u.alive) { u.target = null; u.aiT = 0; }
          rt.say('北条の侍', '引け！　門の内へ引け！', 2.6);
          rt.after(1.2, () => rt.say('前田利長', '退く敵に続け！　門を閉めさせるな！', 3.4));
          rt.obj('dp', '退く敵に続き、石段の上の冠木門へ駆け込め', 'main');
          rt.unmark('dp'); rt.marker('dp', { x: KOGUCHI.x + 1, z: KOGUCHI.z + 0.4 }, '冠木門', { h: 3 });
          ctx.friends(rt).forEach((f, k) => marchTo(rt, f, KOGUCHI, k));
        }
        return false;
      }
      // ② 付け入り：退く敵に追いすがって冠木門へ（自分か、味方の先の者）
      if (!F.tsukeiri && !F.gateShut) {
        rt.objProgress('dp', '');   // 残りの秒の字は出さない（画面の字は名前・数・目標だけ。11/8 critic60）
        // 冠木門をくぐらずに石垣の脇から御主殿の内へ入った時も付け入りとする（行き先の門が後ろへ遠ざかった。11/8 critic60）
        let inn = Math.hypot(p.x - KOGUCHI.x, p.z - KOGUCHI.z) < TSUKE_R || (p.x > 20 && p.x < KOGUCHI.x && p.z > -20 && p.z < 14);
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
          C.groups.push(ng); F.gateG = ng;
        }
        return false;
      }
      // 門を固められた時：冠木門の守りを討てば虎口を抜ける（虎口の鉄砲は上の段にいて、門の内からしか届かない。抜ければ崩れる）
      const rest = live(F.gateG);
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

// ⑤ の締め：中山勘解由を自分で討つ（10m 手前で勝ちが出て、討ち取ったりも最期も見えなかった。11/8 critic60）。
//   中山は供の侍三人と本丸の奥に残る。味方の手では倒れない（本人が八歩の内にいる時だけ傷を受ける）。討てば勝ち
function nakayamaStep() {
  return {
    kind: 'fight', max: 240,
    start(rt, C) {
      const F = rt.flags;
      C.at = { x: HON.x - 4, z: HON.z - 3 }; C.goal = C.at; C.groups = [];
      const g = F.nakaG = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '中山勘解由', anchor: C.at, facing: Math.PI * 0.25, width: 3, aggro: 10, morale: 100, noRout: true, order: 'hold', seekRange: 10 },
        dress([{ type: 'busho', n: 1, o: { name: '中山勘解由', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }], HOJO));
      g.dmgMult = 0.6;
      C.groups.push(g);
      F.naka = g.units.find((u) => u.name === '中山勘解由');
      rt.obj('dp', '中山勘解由を、自ら討て', 'main');
      // 印は頭上の名札と金の▼だけ（赤い札を重ねない）
      rt.say('前田の侍', '中山殿、降られよ！　前田様が、命は助けると仰せじゃ！', 3.4);
      rt.after(3.6, () => rt.say('中山勘解由', '二心は持たぬ。北条の城、ただでは渡さぬ！', 3.4));
    },
    tick(rt, C) {
      const n = rt.flags.naka, P = rt.player.u.pos;
      if (!n) return true;
      if (n.alive) { n.invuln = Math.hypot(n.pos.x - P.x, n.pos.z - P.z) > 8; C.goal = n.pos; }
      return !n.alive;
    },
    end(rt) {
      rt.unmark('dp'); rt.objDone('dp');
      rt.banner('中山勘解由、討ち取ったり', '助命を断り、本丸に果てる');
      sfx('horagai', 0.8);
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
    time: 'night',
    // 丑の刻の濃い霧：星も月も見えず、灰の霧の奥は四十間ほどで消える（前夜から霧に包まれた。『北条記』）
    //   月も霧に隠れて地面に影は落ちない（日の影のようにくっきり落ちていた。11/8 critic60）：直の光を絞り、霧の散る光で形を見せる
    nightLight: { sky: 0x464c56, fog: 0x434952, top: 0x262b33, vis: 85, sunI: 0.08, hemiI: 0.62, hemiSky: 0x80858f, hemiGround: 0x3a3833 },
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
      // 山の上の曲輪は踏み固めた黒い土（砂利の平場にしない。八王子城は土の城。11/8 critic60）
      if (h > 26 && PLAN.kuruwa.some((k) => k.floor === false && k.id !== 'ote' && x > k.poly[0][0] - 1 && x < k.poly[1][0] + 1 && z > k.poly[0][1] - 1 && z < k.poly[2][1] + 1)) { c.setRGB(c.r * 0.35 + 0.13, c.g * 0.35 + 0.11, c.b * 0.35 + 0.08); return; }
      // 山の杉と檜の下の暗い土と苔
      if (h > 12) c.setRGB(c.r * 0.72, c.g * 0.82, c.b * 0.7);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 9 && x < k.poly[1][0] + 9 && z > k.poly[0][1] - 9 && z < k.poly[2][1] + 9),   // 曲輪の中で戦う時、後ろのカメラの前に木を置かない（11/4 p100：小宮曲輪で杉が画面をふさいだ）
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
    F.honjin = allyGroup(rt, { faction: 'oda', name: '前田利家の本陣', anchor: { x: START.x + 9, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 0, order: 'hold', fixed: true, noRout: true, noAI: true },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: false } }, { type: 'samurai', n: 10, o: { invuln: true } }, { type: 'ashigaru', n: 12, o: { invuln: true } }], MAEDA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], MAEDA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '前田の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], MAEDA));
    // 先手の大将の利長は馬上で旗本の侍に囲まれ、先手の後ろから下知する（足軽にまじって最前で歩いて戦っていた。11/8 critic60）
    F.naga = allyGroup(rt, { faction: 'oda', name: '前田利長の旗本', anchor: { x: START.x - 2, z: START.z - 8 }, facing: -Math.PI / 2, width: 4, aggro: 2, noRout: true, order: 'hold', seekRange: 6 },
      dress([{ type: 'busho', n: 1, o: { name: '前田利長', invuln: true, horse: true } }, { type: 'samurai', n: 6, o: { invuln: true } }], MAEDA));
    // 前田の二の手：先手の後ろから続く（寄せ手は城兵の五倍。史実の比は docs/battle_refs/t11_hachioji.md）
    F.ni = allyGroup(rt, { faction: 'oda', name: '前田の二の手', anchor: { x: START.x - 4, z: START.z + 12 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], MAEDA));
    for (const g of [F.mine, F.saki, F.ni]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    // 利家は幕の奥の床几に座ったまま（陣中の待ち：u.jinchu。敵は寄せ口まで来ない）
    const toshiie = F.honjin.units.find((u) => u.name === '前田利家');
    if (toshiie) { toshiie.pos.x = START.x + 10; toshiie.pos.z = START.z - 2.5; toshiie.heading = Math.PI / 2; toshiie.jinchu = { standing: false, danger: false, soldiers: [] }; }
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
    F.rocks = makeRockTraps(rt, { posts: [
      { id: 'ote', team: 1, stock: 4, interval: [9, 14], lane: [[138, 78], [142, 66], [146, 58]], active: () => at(0) },
      { id: 'kaneko', team: 1, stock: 3, interval: [10, 15], lane: [[78, -36], [78, -24], [77, -12]], active: () => at(4) },
      { id: 'hon', team: 1, stock: 3, interval: [10, 15], lane: [[-62, -141], [-50, -129], [-37, -118]], active: () => at(7) }] });
    // 小宮曲輪の櫓（内応の者が火を掛ける）
    rt.scene.add(yagura(W, MATSUKI.x - 4, MATSUKI.z - 9, { kind: 'ro' }));
    rt.setPhase('brief');
    rt.obj('main', '日が昇り切る前に、山の上の八王子城の本丸まで攻め上り、落とす', 'main');
    // 戦の前（筋書きの一枚の言葉）。利家は降るよう使いを出したが、城は使いを斬った（『北条記』）。先手は先に降った北条の将たち
    rt.say('前田利家', '降れと遣わした使いを、城は斬って返した。今日のうちに落とし、小田原に見せる', 4.5);
    rt.after(5, () => rt.say(nm(rt), '霧と闇で、前の兵の背も見えませぬ', 3.5));
    rt.after(9, () => rt.say('前田利家', '上杉殿と真田殿は搦手から寄せる。我らは大手じゃ。先手は降った大道寺らが行く', 4));
    rt.after(13.5, () => {
      rt.say('前田利長', '城を守るは城代の横地監物、中山勘解由、近藤出羽守ら。氏照はおらぬ。かかれ！', 3.6);
      for (const s of ['近藤出羽守', '金子家重', '狩野一庵', '中山勘解由', '横地監物', '大石信濃守']) revealName(rt, s);
    });
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
      // ① 山下曲輪：大手の虎口を守った近藤出羽守（綱秀）の組。木戸の内から鉄砲を撃ちかけ、上の段から石弓（石落とし）で先手の降将の勢を押し返した（『北条記』）
      DP.fight({ at: OTE, title: '山下曲輪', sub: '近藤出羽守が守る', obj: '山下曲輪で、近藤出羽守の組を討て', max: 90, noRefill: true,
        say: [['前田の侍', '木戸の内に北条の兵！　霧の中から撃ってくるぞ'], ['前田の侍', '先手の大道寺勢が、上からの石に押し返された！　竹束の陰から寄れ', 4]],
        foes: () => [keep('近藤出羽守の組', OTE, [{ type: 'busho', n: 1, o: { name: '近藤出羽守', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }]),
          keep('大手の木戸の鉄砲', OTE, [{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }], { dx: -10, width: 6 })],
        later: [{ t: 25, say: ['前田の侍', '奥の木戸から新手じゃ！'], foes: () => [keep('大手の奥の新手', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dx: -18 })] }],
        reward: '山下曲輪を破った',
        // 曲輪が落ちた時に近藤出羽守も討死する（落ちた後も曲輪で生き、御主殿の戦の最中に「討ち取ったり」が出た。11/8 critic60）
        onEnd: (rt2) => { const k = rt2.army.units.find((u) => u.name === '近藤出羽守' && u.alive); if (k) { k.officerSaved = true; rt2.army.kill(k, null); rt2.say('前田の侍', '近藤出羽守、討死！　山下曲輪は落ちたぞ', 3.2); } } }),
      DP.move({ to: BRIDGE_S, obj: '谷の道を、曳橋の南の袂まで進め', label: '曳橋', r: 8, max: 50 }),
      // ② ③ 御主殿の虎口：城兵が石段を下り曳橋を渡って打って出る → 迎え撃つ → 退く敵に続いて冠木門へ（付け入り）
      sallyStep(),
      DP.fight({ at: GOSHU, title: '御主殿', sub: '氏照の館', obj: '御主殿の館の前の北条勢を討て', max: 60, noRefill: true,
        say: [['北条の侍', '殿の館に、一歩も入れるな！'], ['前田の侍', '館の奥の滝の方から、女たちの声が……', 3.4]],
        foes: (rt2) => [keep('御主殿の守り', GOSHU, [{ type: 'samurai', n: rt2.flags.tsukeiri ? 2 : 4 }, { type: 'ashigaru', n: rt2.flags.tsukeiri ? 8 : 12 }, { type: 'bow', n: 3 }], { dx: -6 })],
        reward: '御主殿を取った' }),
      // ④ 尾根の曲輪を一つずつ落とす（上からの鉄砲）
      DP.fight({ at: KANEKO, title: '金子丸', sub: '金子家重が守る尾根の曲輪', obj: '尾根を登り、金子丸の金子家重の組を討て', max: 60, noRefill: true,
        say: [['前田の侍', '上の曲輪から鉄砲じゃ！　身を低くして登れ']],
        foes: () => [keep('金子家重の組', KANEKO, [{ type: 'busho', n: 1, o: { name: '金子家重', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }])],
        reward: '金子丸を落とした' }),
      DP.fight({ at: TAKA, title: '高丸', sub: '尾根の曲輪', obj: '尾根の柵門を抜け、高丸の北条勢を討て', max: 60, noRefill: true,
        foes: () => [keep('高丸の守り', TAKA, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }])],
        reward: '高丸を落とした' }),
      DP.fight({ at: MATSUKI, title: '小宮曲輪', sub: '搦手から上杉勢が攻め上る', obj: '上杉勢と、小宮曲輪の狩野一庵の組を討て', max: 70, noRefill: true,
        // 上杉の藤田信吉は、城の普請奉行だった平井無辺を寝返らせ、その案内で水の手の間道から小宮曲輪を衝いた。内応の者が櫓に火を掛けた
        say: [['前田の侍', '搦手に竹に雀の旗！　上杉勢が裏の間道から来たぞ'], ['前田の侍', '曲輪の櫓に火が上がった！　内から寝返った者がおる', 3.6]],
        foes: () => [keep('狩野一庵の組', MATSUKI, [{ type: 'busho', n: 1, o: { name: '狩野一庵', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }])],
        reward: '小宮曲輪を落とした' }),
      // ⑤ 頂の本丸：利家は中山勘解由（家範）に命を助けると伝えたが、家範は断って討死。大石信濃守（照基）は城代の横地監物を城から落とし、
      //   自分は打って出て討死。横地は西の詰の城の方へ落ちる（update の yokochi）
      DP.fight({ at: HON, title: '本丸', sub: '深沢山の頂', obj: '本丸で、中山勘解由を討て', max: 90, noRefill: true,
        say: [['大石信濃守', '監物殿は西へ落ちられよ。ここは我らが防ぐ！', 3.6]],
        foes: () => [keep('中山勘解由の旗本', HON, [{ type: 'samurai', n: 8 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }, { type: 'bow', n: 3 }], { morale: 100, seek: 30 }),
          keep('大石信濃守の手', HON, [{ type: 'busho', n: 1, o: { name: '大石信濃守', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], { dx: -12, dz: -8, morale: 95, seek: 24 })],
        reward: '本丸の守りを崩した' }),
      nakayamaStep(),
    ], (rt2) => this.win(rt2));
  },

  // 上杉勢：小宮曲輪の段で、搦手（北西）から攻め上る
  uesugi(rt) {
    const F = rt.flags;
    if (F.uesugi) return;
    // 搦手の上杉勢は、寝返った平井無辺の案内で北の水の手の間道から小宮曲輪を裏から衝く（大手の道と混ぜない。11/8 critic60）。
    //   手を率いたのは藤田信吉。景勝は後ろの陣に残り、山の上に名だけ浮かせない（誰もいない芝の上に名が浮いた。11/8 critic60）
    F.uesugi = allyGroup(rt, { faction: 'uesugi', name: '上杉勢', anchor: { x: KARAMETE.x, z: KARAMETE.z }, facing: Math.PI, width: 6, aggro: 12, noRout: true, order: 'path', path: KARAMETE_PATH, pathIdx: 0, formation: 'column', colW: 2, speed: 3.4, seekRange: 30 },
      dress([{ type: 'busho', n: 1, o: { name: '藤田信吉', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], UESUGI));
    F.uesugi.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor = { x: MATSUKI.x - 6, z: MATSUKI.z + 4 }; };
    // 真田昌幸の手：上杉勢の脇から尾根を登る
    //   真田の兵は赤備えにしない（朱の揃いは大坂の陣の信繁の物。1590 の昌幸の手は黒い具足に六文銭の旗。11/8 critic60）
    const SAN = { flag: 'sanada', noRed: true, armor: 0x2a2724, hatColor: 0x1c1916 };
    F.sanada = allyGroup(rt, { faction: 'uesugi', name: '真田昌幸の手', anchor: { x: KARAMETE.x - 4, z: KARAMETE.z - 6 }, facing: Math.PI, width: 4, aggro: 12, noRout: true, order: 'path', path: KARAMETE_PATH, pathIdx: 0, formation: 'column', colW: 2, speed: 3.2, seekRange: 30 },
      [{ type: 'busho', n: 1, o: { ...SAN, name: '真田昌幸', invuln: true, horse: false } }, { type: 'samurai', n: 1, o: SAN }, { type: 'ashigaru', n: 6, o: SAN }]);
    F.sanada.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor = { x: MATSUKI.x + 4, z: MATSUKI.z - 8 }; };
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
    // 落城の様（城方が崩れる・火が回る）を見せてから勝ちの札（味方が駆けている最中に勝ちの字が重なった。11/8 critic60）
    for (const g of rt.army.groups || []) if (g.team === 1 && g !== F.yokochi && g.count) { g.noRout = false; g.morale = 0; }
    for (const [x, z, sz] of [[HON.x - 8, HON.z - 8, 2.6], [HON.x + 6, HON.z - 10, 2.2], [MATSUKI.x + 6, MATSUKI.z - 4, 2]]) rt.world.addFire(x, z, { size: sz, h: 3, smoke: true, blackSmoke: false });   // 黒い雲を切り抜いたような平たい塊に見えた（11/8 critic60）。灰の柔らかい煙に
    rt.say('前田の侍', '城方が崩れた！　本丸に火がかかったぞ！', 3);
    rt.after(3.5, () => rt.banner('八王子城、落城', '天正十八年六月二十三日　一日で落ちる'));
    // 戦の後（筋書きの一枚の言葉）
    rt.after(5, () => rt.say(nm(rt), '城代の横地監物は、西の詰の城から落ちた様子。城の中には、女や子が多うございました', 4.6));
    rt.after(9.5, () => rt.say('前田利家', '……これが戦よ。忘れるな', 4));
    rt.after(14, () => rt.say('前田利家', '八王子の落城を、早馬で小田原へ知らせよ。籠もる者どもの心が折れよう', 4.4));
    rt.finish({}, 19);
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
    // 道の途中で動かなくなった兵（崖の上・柵の角・橋の袂で止まり、組の列が待ち続ける）は、遊び手から見えない所でだけ組の持ち場へ寄せる
    if (D && D.on && !(F.unstuckT > rt.t)) {
      F.unstuckT = rt.t + 2;
      const P = rt.player.u.pos;
      for (const g of [F.saki, F.mine, F.ni]) if (g && g.count && !g.routed) for (const u of g.units) {
        if (!u.alive || u.fleeing || u.isPlayer) continue;
        const k = u._t11Stay || (u._t11Stay = { x: u.pos.x, z: u.pos.z, t: rt.t });
        if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 1.5) { k.x = u.pos.x; k.z = u.pos.z; k.t = rt.t; continue; }
        if (rt.t - k.t < 12 || u.target) continue;
        const home = g.slotPos(u.slot, g.initial);
        if (Math.hypot(home.x - u.pos.x, home.z - u.pos.z) < 8 || Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 45 || Math.hypot(home.x - P.x, home.z - P.z) < 40) continue;
        u.pos.x = home.x; u.pos.z = home.z; u.pos.y = rt.world.heightAt(home.x, home.z); u.aiT = 0; u.jamT = 0; u.jammed = false;
        k.x = u.pos.x; k.z = u.pos.z; k.t = rt.t;
      }
    }
    // 本丸の坂で本人一人にしない（周りの 25m に味方が 0 人だった。11/8 critic60）：味方が四人より少なければ、
    //   五十歩より後ろに遅れた前田の兵を、本人の二十五歩後ろの道の上へ寄せる（霧の奥・後ろなので湧くのは見えない）
    if (D && D.on && D.i >= 6 && !(F.catchT > rt.t)) {
      F.catchT = rt.t + 3;
      const P = rt.player.u.pos;
      let near = 0;
      for (const g of [F.saki, F.mine, F.ni]) if (g) for (const u of g.units) if (u.alive && !u.isPlayer && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 25) near++;
      if (near < 4) {
        routeAt(P.x, P.z, RG);
        const bk = ROUTE[Math.max(0, Math.floor(RG.s) - 1)], dx = bk[0] - P.x, dz = bk[1] - P.z, L = Math.hypot(dx, dz) || 1;
        const bx = P.x + dx / L * Math.min(25, L + 6), bz = P.z + dz / L * Math.min(25, L + 6);
        let moved = 0;
        for (const g of [F.saki, F.mine, F.ni]) if (g && g.count) for (const u of g.units) {
          if (moved >= 8 || !u.alive || u.fleeing || u.isPlayer || u.target || Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 50) continue;
          u.pos.x = bx + (Math.random() - 0.5) * 4; u.pos.z = bz + (Math.random() - 0.5) * 4; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.aiT = 0; moved++;
        }
      }
    }
    // 段が変わったら、前田の組を道どおりに段の場所へ（曳橋の段は sallyStep が送る）
    if (D && D.on && D.i !== F.marchI) {
      F.marchI = D.i;
      const to = D.i !== 2 && D.cur && (D.cur.goal || D.cur.at);
      if (to) [F.saki, F.mine, F.ni].forEach((g, k) => marchTo(rt, g, to, k));
      if (to && F.naga?.count) { routeAt(to.x, to.z, RG); const b = ROUTE[Math.max(0, Math.floor(RG.s) - 1)]; marchTo(rt, F.naga, { x: b[0], z: b[1] }, 0); F.naga.onArrive = (q) => { q.order = 'hold'; q.path = null; q.formation = 'yari'; q.anchor = { x: b[0], z: b[1] }; }; }
      // 本丸の段：搦手の上杉勢・真田の手も、小宮曲輪から本丸へ攻め上る
      //   搦手の勢は大手の道を通らず、小宮曲輪の北から本丸の北の切岸を登る
      if (D.i >= 7) [F.uesugi, F.sanada].forEach((g, k) => { if (g && g.count) { g.order = 'path'; g.path = [[-50, -128 - k * 4], [HON.x + 2 - k * 5, HON.z - 6]]; g.pathIdx = 0; g.formation = 'column'; g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.seekRange = 30; }; } });
    }
    if (F.rocks) F.rocks.tick(dt);
    // 城攻めの矢玉（登る間ずっと何も降って来なかった。11/8 critic60）：曲輪の弓は五〜八秒ごとに、寄せ手の固まり（本人の周り）へ射上げる。
    //   当たりは共通の矢の雨のまま（一人一本・盾と甲冑で防ぐ）
    if (D && D.on && D.cur?.groups && (F._volT = (F._volT ?? 6) - dt) <= 0) {
      F._volT = 5 + Math.random() * 3;
      const P = rt.player.u;
      if (P.alive && P.hp > P.maxHp * 0.35) for (const g of D.cur.groups) {
        const bow = g && !g.routed && g.units.find((u) => u.alive && !u.fleeing && u.type === 'bow' && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 55);
        if (!bow) continue;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        rainVolley(rt.army, g, bow, { x, y: rt.world.heightAt(x, z), z }, Math.hypot(x - bow.pos.x, z - bow.pos.z));
        break;
      }
    }
    tickTabas(rt, dt);
    // 山下曲輪が落ちる頃に夜が白む（二十秒余りかけて移ろう）。霧は登るほど薄れ、本丸の段で朝日が差す
    //   夜明けは二分半かけて少しずつ白む（四十五秒で昼の霧へ急に替わった。11/8 critic60）。本丸の段は昼にせず、低い朝日のまま
    if (D && D.on && D.i >= 1 && !F.dawn) { F.dawn = true; rt.world.setTime('morning'); if (rt.world.fade) rt.world.fade.dur = 150; rt.after(2, () => rt.say('前田の侍', '夜が白んできた。霧の上に、山の上の曲輪が見えるぞ', 3.4)); }
    if (D && D.on && D.i >= 7 && !F.sun) { F.sun = true; if (rt.world.fade) rt.world.fade.t = Math.max(rt.world.fade.t, rt.world.fade.dur * 0.8); rt.say('前田の侍', '朝日じゃ！　霧が切れて、本丸が見えるぞ', 3); }
    // 小宮曲輪の段：内応の者が櫓に火を掛ける
    if (D && D.on && D.i === 6 && !F.yaguraFire) {
      F.yaguraFire = true;
      rt.world.addFire(MATSUKI.x - 4, MATSUKI.z - 9, { size: 2.4, h: 3.2, smoke: true, blackSmoke: false });   // 黒い雲を切り抜いたような平たい塊に見えた（11/8 critic60）。灰の柔らかい煙に
    }
    // 本丸の段：城代の横地監物は供の侍と西の詰の城の方へ落ちる（大石信濃守が城から出した）。討てない・追わない
    if (D && D.on && D.i === 7 && !F.yokochi) {
      F.yokochi = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '横地監物の供', anchor: { x: HON.x - 6, z: HON.z - 8 }, facing: -Math.PI * 0.7, width: 3, aggro: 0, morale: 100, noRout: true,
        order: 'path', path: [[-100, -148], [-114, -156], [-124, -166], [-128, -182]], pathIdx: 0, speed: 3.2 },
      dress([{ type: 'busho', n: 1, o: { name: '横地監物', hat: 'kabuto_m', invuln: true, horse: false } }, { type: 'samurai', n: 3, o: { invuln: true } }], HOJO));
      F.yokochi.onArrive = (q) => {
        const A = rt.army;
        for (const u of q.units.slice()) if (u.alive) { A.scene.remove(u.mesh); const i = A.units.indexOf(u); if (i >= 0) A.units.splice(i, 1); u.alive = false; u.gone = true; }
        q.units.length = 0;
      };
    }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('前田の侍', '東の空が白んできた！　急げ', 3.5); }
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

t11_hachioji.force = (rt) => ({ a: Math.round(15000 - (rt.flags.ak || 0) * 20), a0: 15000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 8), b0: 3000 });   // 城方は兵五百ほどと女・子・職人。討死は千三百余と伝わる（目の前の一人で八人ほど）
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
  if (i === 2) return F.sallyBack ? '冠木門へ駆け込め' : '曳橋の袂で迎え撃て';
  return ['山下曲輪を破れ', '曳橋へ進め', '', '御主殿の敵を討て', '金子丸を落とせ', '高丸を落とせ', '小宮曲輪を落とせ', '本丸を落とせ', '中山勘解由を討て'][i] || '';
};
// 行き先の▼に必ず場所の名を添える（「40m」だけで名が無かった。11/8 critic60）
const GOAL_T = { x: 0, z: 0, label: '' };
t11_hachioji.goalSignTarget = (rt) => {
  const D = rt.flags.dp, C = D?.on && D.cur, g = C && (C.goal || C.at);
  if (!g || !Number.isFinite(g.x)) return null;
  GOAL_T.x = g.x; GOAL_T.z = g.z;
  GOAL_T.label = ['山下曲輪', '曳橋', rt.flags.sallyBack ? '冠木門' : '曳橋', '御主殿', '金子丸', '高丸', '小宮曲輪', '本丸', '中山勘解由'][D.i] || '';
  return GOAL_T;
};
// 小さな地図は出さない（出たり消えたりして何の物か分からなかった。11/8 critic60）
t11_hachioji.noMiniMap = true;
// 段の敵の組の赤い札は出さない（名は頭上の名札一つ。11/8 critic60）
t11_hachioji.dpNoMark = true;
t11_hachioji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t11_hachioji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t11_hachioji.history = '天正十八年（1590）の小田原攻めで、豊臣方は関東の北条の城を次々に攻めた。八王子城は北条氏照が築いた山城で、深沢山の頂の本丸から、城山川の谷の御主殿（館）まで曲輪が連なる。氏照は小田原に籠もっていたため、城は城代の横地監物や中山勘解由（家範）・狩野一庵らが守り、兵のほかに近くの村の女や子も多く籠もっていた。六月二十三日の夜明け前、前田利家・利長、上杉景勝、真田昌幸らおよそ一万五千が、先に降った大道寺政繁らを先手にして、霧の中を大手と搦手から攻めた。搦手の上杉勢は寝返った者の案内で裏の道から山頂の曲輪を衝き、城は一日で落ちた。中山勘解由は利家の助命を断って討死し、城代の横地監物は落ちのびた。御主殿の滝では女たちが身を投げたと伝えられる。八王子城の落城は小田原に知らされ、北条の心を折る一つとなった。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、御主殿から打って出る城兵と上杉勢の来る道筋は推定である。両軍の人数には別の伝えもある。';
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
// 右上の数は増えたり戻ったりしない（①が 0／37 から 7／51 へ、④が曲輪ごとに 8／26→0／21 と替わった。11/8 critic60）：
//   ①は木戸の新手まで入れた始めからの数、④は三つの曲輪を一つずつ ✓ にして数は出さない
const OTE_ALL = 52, OTE_LATER = 14;   // 近藤の組 26（弓を入れて）・木戸の鉄砲 12・奥の新手 14（scale 1.3 で増やした後の数）
const oteCount = (rt) => {
  const C = rt.flags.dp?.on && rt.flags.dp.i === 0 && rt.flags.dp.cur;
  if (!C || !C.groups) return null;
  let left = C.later?.length ? OTE_LATER : 0;
  for (const g of C.groups) if (!(g.count <= 2 || g.routed)) for (const u of g.units) if (u.alive && !u.dying && !u.fleeing && !u.evacuatedWound) left++;
  return [Math.max(0, OTE_ALL - left), OTE_ALL];
};
STAGES.t11_hachioji = [['山下曲輪で近藤出羽守の組を討つ', null, null, oteCount], ['曳橋で打って出た北条勢を迎え撃つ', dpAt(2), null, false], ['退く敵に続き、冠木門から御主殿へ攻め入る', (rt) => !!rt.flags.sallyBack, null, false],
  ['金子丸・高丸・小宮曲輪を落とす', dpAt(4), [['金子丸を落とす', dpAt(5)], ['高丸を落とす', dpAt(6)], ['小宮曲輪を落とす', dpAt(7)]], false], ['本丸で中山勘解由を討つ', dpAt(7)]];

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t11_hachioji);

export { t11_hachioji };
export default t11_hachioji;
