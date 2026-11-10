// ======================================================================
// 徳川編 11　真田丸の戦い（慶長十九年 1614・十二月四日）　大坂冬の陣でいちばん大きな戦
// 筋書きの正：docs/chapter3_tokugawa.md の「11. 真田丸」
// 真田信繁が大坂城の南（惣構の外）に出丸を築いた。外に柵、その内に空堀、土塁の上に塀と櫓。
// 徳川方は南へ回り、前田利常・井伊直孝・松平忠直が前面に並ぶ。前の篠山から撃たれていた前田勢が篠山を取りに出て、
// 真田の挑発に乗って丸へ攻めかかる。堀・土塁・柵で詰まった所へ、塀と櫓から一斉射撃と横矢。
// 城の中で火薬が爆ぜたのを内応の合図と思った井伊・松平も堀へ殺到し、撃ち崩される。真田が打って出る。
// 家康は力攻めをやめ、大筒で城を撃つことにする。
// 主人公は前田利常の先手（山崎長徳の組）。史実どおり攻めは失敗する。勝ち方＝味方を退かせ、生きて退き口まで戻る（殿）。
// 段：①篠山を取る ②挑発に乗り丸の柵へ ③堀の前で一斉射撃に耐え、柵を破る（井伊・松平の殺到）④真田の打って出を受け、退き口へ
// 負け方：討たれる。刻限は段ごと（全体の刻限は無い。AP8）。見せかけの軍勢は出さない（AA・AF・AQ6）：出る兵は全部本物。
// 総大将の家康は住吉の陣で戦場にいない（下知は使番）。信繁は丸の中の本陣。打って出るのは大助と伊木遠雄（docs/battle_refs/k11_sanadamaru.md）。
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ。真田丸は円の中心 C の南へ開いた弧。
// 地形：国土地理院の標高（dem_sanadamaru.js・tools/dem.mjs の sanadamaru）。ゲームの 1 が実の 4m。丸の周りは平らに均す。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_sanadamaru.js';
import { demSample } from './dem.js';
import { nobori, tawara, hut, stumps, ishigaki, dobei, sumiyagura, kabukimon, tobira, solidSeg, jinmaku, palisade } from './props.js';
import { osakaFar } from './osaka_far.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx, setWarStage } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { farSight } from './far_sight.js';
import { timeslipField } from './timeslip_field.js';
import { goalsTick } from './hud_goals.js';
import { revealName } from './battle_intel.js';
import { GENERALS } from './units_data.js';
import { KACCHU } from './kacchu_data.js';
import { addMissileCover } from './projectile_cover.js';
import { install as wagi } from './k11/wagi.js';   // 冬の陣の中間の場面（大筒・和議・堀が埋まる・丸の破却）
import { lethalNearMiss } from './lethal.js';   // 命懸けの戦場：一斉射の制圧

// 慶長十九年の名乗りは前田筑前守利光（利常に改めたのは寛永六年。高岡市立博物館の「筑前守利光」の書状）。顔と具足は利常の物を使う（専門家の目 11/6）
if (GENERALS['前田利常'] && !GENERALS['前田利光']) GENERALS['前田利光'] = GENERALS['前田利常'];
if (KACCHU['前田利常'] && !KACCHU['前田利光']) KACCHU['前田利光'] = KACCHU['前田利常'];

// ---- 縄張り：真田丸の中心 C。手本は二つの復元模型（docs/sanadamaru_1102/ の ref_kaito_model2.jpg を主に、段々は ref_kaito_model.jpg）：半円に近い出丸。
//   塀は WALL_R の段の縁。外へ二段の段々（空堀の段。STEP1・STEP2）と各段の柵、いちばん外に柵 FENCE_R。
//   「半径」は角の丸い四角（超楕円 PW）の物差し：polar(a, r) は四角の縁の点、rOf はその逆。角は +z から測り、北（城の側）は開く ----
const C = { x: 0, z: -40 };
const PW = 2.5;                             // 角の丸み（2 で円、大きいほど四角）。二枚目の模型の半円に寄せ、一枚目の角を少し残す
const WALL_R = 30, STEP1 = { r0: 33.5, r1: 37 }, STEP2 = { r0: 40, r1: 43.5 }, FENCE_R = 46;
const MOAT = { r0: STEP1.r0, r1: STEP2.r1 };
const LV = { maru: 5, s1: 2.8, s2: -2.6 };  // 丸の内・上の段・空堀の底の高さ（空堀は野より深く掘り下げる。AV9「堀がある・簡単に入れない」）
const PERCH_A = 1.05;                       // 塀の内の西・東の鉄砲衆の持ち口の端
const SPAN = 2.45;
const GATE = 0.97, GATE_W = 0.08;           // 左右の口（角の脇。東の口は石垣の虎口）
const SASA = { x: 22, z: 50, r: 9 };        // 篠山（丸の前の小さな丘。塀の南 約 240m＝60。手本メモの布陣）
const RETREAT = { x: 6, z: 96 };            // 退き口（篠山の南の竹束の列）
const HACHI = { x: -62, z: -106 };          // 八丁目口（丸の西の惣構の口。城内の爆発はここ）
const TOWERS = [-1.55, -Math.PI / 4, 0, Math.PI / 4, 1.55];   // 角の櫓・正面と横の櫓

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = (a) => 1 / Math.pow(Math.abs(Math.sin(a)) ** PW + Math.abs(Math.cos(a)) ** PW, 1 / PW);
const polar = (a, r) => ({ x: C.x + Math.sin(a) * r * sq(a), z: C.z + Math.cos(a) * r * sq(a) });
const angOf = (x, z) => Math.atan2(x - C.x, z - C.z);
const rOf = (x, z) => Math.pow(Math.abs(x - C.x) ** PW + Math.abs(z - C.z) ** PW, 1 / PW);
const gone = (g) => !g || g.count === 0 || g.routed;
// 櫓の狙撃も一斉射も、退走・戦闘不能・戦場を離れた者には撃たせない。
const canShoot = (u) => u.alive && u.type === 'gun' && !u.gone && !u.fleeing && !u.woundOut && !u.group?.routed;
// 退きの下知では古い狙いも解く。移動だけ替えると、狙った敵へ寄り直して陣へ戻れない。
function withdraw(g, dest) {
  g.fixed = false; g.focus = null; g.keepMoveOrder = true; g.aggro = 3;
  g.order = 'move'; g.dest = dest; g.anchor = dest;
  for (const u of g.units) { u.target = null; u.aiT = 0; }
}
const PORT = (s) => polar(s * GATE, FENCE_R + 1);
const L_FENCE = [-0.84, -0.72];                     // 第二の攻めで打ち倒しかける西の柵の一間（角）
const RALLY = { x: 12, z: 32 };                     // 攻めの合間に退いて組を立て直す所（篠山の北の麓。櫓の狙いの外）
const LIVE_MAX = 250;                               // 本物の兵は両軍で二百五十ほどまで
const liveN = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.isStruct && !u.isPlayer ? 1 : 0), 0);   // 丸の左右の口（真田はここから打って出る）

// 家ごとの見た目（足軽は御貸具足の色。名のある武将は kacchu_data の甲冑）
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MAEDA = { flag: 'maeda' };
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };
const ECHI = { flag: 'tokugawa' };
const TK = 0x24221f;
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// ---- 地形：上町台地の起伏（国土地理院）に、真田丸の土塁・空堀・惣構の堀を削り込む ----
const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function natural(x, z) {
  const h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.32;
  // 丸と寄せ手の地（篠山まで）は均して、起伏は外側だけ
  const near = clamp01((rOf(x, z) - 70) / 60) * clamp01((Math.hypot(x - SASA.x, z - SASA.z) - 40) / 50);
  return h * Math.max(near, 0.15);
}
function height(x, z) {
  let h = natural(x, z) + 0.25 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.15 * Math.sin(z * 0.06 + x * 0.02);
  h += 6 * gauss(x, z, SASA.x, SASA.z, 260);
  const r = rOf(x, z), a = Math.abs(angOf(x, z));
  const inArc = clamp01((SPAN + 0.15 - a) / 0.2);
  // 段々：丸の内（LV.maru）→ 切岸 → 上の段 → 切岸 → 下の段 → 外の野。塀の足もとは土塁で少し高い。段の面は内へわずかに凹む（空堀の底）
  const st = LV.s2 * (1 - ss(STEP2.r1, FENCE_R - 0.6, r)) + (LV.s1 - LV.s2) * (1 - ss(STEP1.r1, STEP2.r0, r)) + (LV.maru - LV.s1) * (1 - ss(WALL_R + 0.6, STEP1.r0, r))
    + 0.6 * clamp01(1 - Math.abs(r - WALL_R) / 1.6) - 0.35 * trap(Math.abs(r - (STEP1.r0 + STEP1.r1) / 2), 1.2, 1) - 0.35 * trap(Math.abs(r - (STEP2.r0 + STEP2.r1) / 2), 1.2, 1);
  // 丸の後ろ（北）：丸の台は四方とも同じ高さで、後ろにも空堀を巡らす（『諸国古城之図』「摂津真田丸」は丸を堀で囲んだ独立の城に描く。
  //   千田嘉博の復元も独立した丘の上の城。11/6 BV「後ろから真田丸に入れてしまう」）
  const back = (LV.maru + 0.6 * clamp01(1 - Math.abs(r - WALL_R) / 1.6)) * (1 - ss(WALL_R + 0.6, WALL_R + 4, r)) - 3.2 * trap(Math.abs(r - (WALL_R + 8)), 3, 2);
  h += st * inArc + back * (1 - inArc);
  h -= 4 * trap(Math.abs(z + 92), 6, 3) * (Math.abs(x) > 18 ? 1 : 0);   // 惣構の堀（丸の後ろ）
  return h;
}

// ---- 城の小道具（形は束ねて一つに） ----
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts, block = true) {
  const m = new THREE.Mesh(mergeGeometries(parts), MAT);
  m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = block;
  return m;
}
// 惣構の土塀と隅櫓（丸の後ろ）。大坂城の本丸・二の丸と五重の天守は osaka_far.js（中井家の本丸図・『大坂冬の陣図屏風』）で北の奥に大きく
function osakaCastle(world) {
  const g = new THREE.Group();
  // 惣構の土塀は抜けられない（前は形だけで、塀を抜けて隅櫓の裏へ回れた。一8・十一2）
  for (const [a, b] of [[-170, -22], [22, 170]]) { g.add(dobei(world, [a, -100, b, -100], { hikae: -1, shikkui: true })); solidSeg(a, -100, b, -100, 0.35); }
  // 戸口と石段は城の内（北）へ向ける。前は南（徳川の側）に付き、惣構の外から敵の櫓へ入れた（十一2）
  for (const wx of [-150, -90, -30, 30, 90, 150]) g.add(sumiyagura(world, wx, -102.5, { w: 6, d: 5, base: 1.4, rot: Math.PI }));
  for (const m of [g, ...g.children]) m.userData.camBlock = false;
  return g;
}
// 空堀の縁の柵：見た目どおりの当たり（BV 続き kaito 11/6「中の柵がすり抜けられる」。十四8）。矢玉も止める
function innerFence(world, spans, R) {
  const parts = [], post = new THREE.CylinderGeometry(0.1, 0.13, 2.6, 5), C0 = [0x5c4a34, 0x4e3e2c];
  for (const [a0, a1] of spans) {
    const n = Math.round((a1 - a0) * R / 1.1);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const q = polar(a0 + (a1 - a0) * i / n, R), y = world.heightAt(q.x, q.z);
      parts.push(paint(post.clone().translate(q.x, y + 1.1, q.z), C0[i % 2]));
      if (prev) Object.assign(solidSeg(prev.x, prev.z, q.x, q.z, 0.15), { missileH: 2.1, missileType: 'wood' });
      if (prev) for (const hh of [0.8, 1.9]) {
        const dx = q.x - prev.x, dz = q.z - prev.z, L = Math.hypot(dx, dz);
        const g = new THREE.BoxGeometry(0.07, 0.1, L + 0.2);
        g.rotateY(Math.atan2(dx, dz)); g.translate((q.x + prev.x) / 2, (y + prev.y) / 2 + hh, (q.z + prev.z) / 2);
        parts.push(paint(g, 0x6a5640));
      }
      prev = { x: q.x, z: q.z, y };
    }
  }
  return mesh(parts, false);
}
// 破る柵（外の柵の正面の一間）：鉤縄を二本掛けた柵。打つたびに揺れ、傷むほど外へ傾く（11/6 BV「柵がどこか、どう倒すか分からない」・十四5）。
//   柵の真ん中を軸にした入れ物に入れて、傾ける
function hookFence(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, mx = (ax + bx) / 2, mz = (az + bz) / 2, y = world.heightAt(mx, mz);
  const g = new THREE.Group(), m = palisade(world, seg, o);
  m.position.set(-mx, -y, -mz); g.position.set(mx, y, mz); g.add(m);
  const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;   // 外（寄せ手の側）は左手
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 1 });
  for (const t of [-0.28, 0.28]) {
    const p = new THREE.Vector3(tx * L * t, 1.9, tz * L * t), q = new THREE.Vector3(tx * L * t + nx * 4.2, world.heightAt(mx + tx * L * t + nx * 4.2, mz + tz * L * t + nz * 4.2) - y + 0.05, tz * L * t + nz * 4.2);
    const d = q.clone().sub(p), rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, d.length(), 5), ropeMat);
    rope.position.copy(p).addScaledVector(d, 0.5); rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 4, 8, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6, metalness: 0.5 }));
    hook.position.copy(p); hook.rotation.y = Math.atan2(nx, nz);
    g.add(rope, hook);
  }
  g.userData.axis = new THREE.Vector3(tx, 0, tz); g.userData.camBlock = false;
  return g;
}

// 遠景の大坂城を、描く距離（奥 150）の外でも見せる：遠い山（world_sky）と同じく奥の深さへ置き、手前の物には必ず隠れる。
//   深さは距離の順のまま細い帯に詰め（城の中の前後は崩さない）、霞は四割弱まで。束（static_batch）には入れない
//   （osaka_far の遠景の作りのままでは、この戦の写真で城が一度も写らなかった。11/6 BV）
//   陰影と霞は頂点の色へ一度だけ焼く（照らす材質は戦の共通の描き方の差し替えで奥の深さが外れ、写真に一度も写らなかった。11/6 BV）
let FAR_CASTLE = null;
function farCastle(grp) {
  if (!FAR_CASTLE) {
    FAR_CASTLE = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    // 深さは画面の仕上げ（post.js）が「空」と見なす奥に置く（手前の物には必ず隠れる。山並みと同じ）。距離の順は保つ
    FAR_CASTLE.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z = gl_Position.w * (0.99998 + 0.0000018 * clamp((-mvPosition.z - 150.0) / 450.0, 0.0, 1.0));');
    };
    FAR_CASTLE.customProgramCacheKey = () => 'k11の遠景の城';
  }
  const L = new THREE.Vector3(-0.35, 0.8, 0.5).normalize(), haze = new THREE.Color(0xb4b8ba);
  grp.traverse((m) => {
    m.userData.noBatch = true; m.userData.camBlock = false;
    if (!m.isMesh || m.material === FAR_CASTLE || !m.geometry.attributes.color) return;
    const g = m.geometry, C0 = g.attributes.color, N = g.attributes.normal;
    for (let i = 0; i < C0.count; i++) {
      const k = N ? 0.5 + 0.55 * Math.max(0, N.getX(i) * L.x + N.getY(i) * L.y + N.getZ(i) * L.z) : 0.8;
      C0.setXYZ(i, C0.getX(i) * k * 0.8 + haze.r * 0.2, C0.getY(i) * k * 0.8 + haze.g * 0.2, C0.getZ(i) * k * 0.8 + haze.b * 0.2);
    }
    C0.needsUpdate = true;
    m.material = FAR_CASTLE; m.renderOrder = -0.5; m.frustumCulled = false; m.castShadow = m.receiveShadow = false;
  });
}

// 段の縁の塀：赤茶の板塀（模型）。縦板の濃淡・朱の笠木と腰の貫・柱・外の面の狭間（四角の鉄砲狭間と縦長の矢狭間）・内の控え柱。
//   seg は丸の角の小さい順に並べる（外の向き＝左手）。wallLine の mesh として一間ずつ作る
function itabei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), parts = [];
  if (len < 0.05) return new THREE.Group();
  const H = o.h || 2.3, rot = Math.atan2(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
  const at = (t) => ({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, y: world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.25 });
  const put = (g, hex, t, y, off = 0) => { const p = at(t); g.rotateY(rot); g.translate(p.x + nx * off, p.y + y, p.z + nz * off); parts.push(paint(g, hex)); };
  const nb = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i < nb; i++) put(new THREE.BoxGeometry(0.09, H, len / nb + 0.01), [0x5a3f2c, 0x644632, 0x4e3626, 0x5e422e][(i + Math.round(ax * 7)) % 4], (i + 0.5) / nb, H / 2);
  for (const [y, h, d] of [[H + 0.06, 0.2, 0.26], [0.55, 0.12, 0.16]]) put(new THREE.BoxGeometry(d, h, len + 0.04), y > 1 ? 0x7e3a2c : 0x4a3022, 0.5, y);   // 朱の笠木・腰の貫
  const np = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= np; i++) {
    put(new THREE.BoxGeometry(0.16, H + 0.2, 0.16), 0x4a2c22, i / np, (H + 0.2) / 2);
    if (i % 2 === 0) { const k = new THREE.BoxGeometry(0.1, 2.1, 0.1); k.rotateX(0.5); k.rotateY(Math.PI / 2); put(k, 0x4a3426, i / np, 0.9, -0.55); }   // 内の控え柱
  }
  const nh = Math.max(1, Math.round(len / (o.samaStep || 1.6)));
  for (let i = 0; i < nh; i++) {
    const ya = i % 3 === 1;
    put(new THREE.BoxGeometry(0.03, ya ? 0.5 : 0.2, ya ? 0.12 : 0.2), 0x120c0a, (i + 0.5) / nh, ya ? 1.45 : 1.15, 0.06);
  }
  return mesh(parts, true);
}
// 塀の角と口の櫓：塀の上に張り出した一重の小さな櫓（模型）。四本の柱に床、赤茶の板壁に狭間、板葺きの寄棟。rot は塀に沿う向き
function maruYagura(world, x, z, rot, w = 3.4) {
  const parts = [], y = world.heightAt(x, z) - 0.2, c = Math.cos(rot), s = Math.sin(rot);
  const put = (g, hex, lx, yy, lz) => { g.rotateY(rot); g.translate(x + lx * c + lz * s, y + yy, z - lx * s + lz * c); parts.push(paint(g, hex)); };
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.BoxGeometry(0.22, 2.6, 0.22), 0x5a2a1e, dx * (w / 2 - 0.2), 1.3, dz * (w / 2 - 0.2));
  put(new THREE.BoxGeometry(w + 0.3, 0.2, w + 0.3), 0x3e2a1e, 0, 2.6, 0);
  put(new THREE.BoxGeometry(w, 1.7, w), 0x58402e, 0, 3.55, 0);
  put(new THREE.BoxGeometry(w + 0.06, 0.16, w + 0.06), 0x7e3a2c, 0, 4.36, 0);
  for (const [lx, lz, ry] of [[0, w / 2 + 0.02, 0], [0, -w / 2 - 0.02, 0], [w / 2 + 0.02, 0, Math.PI / 2], [-w / 2 - 0.02, 0, Math.PI / 2]])
    for (const o of [-0.7, 0.7]) { const g = new THREE.BoxGeometry(0.5, 0.36, 0.03); g.rotateY(ry); put(g, 0x140e0a, lx + (ry ? 0 : o), 3.6, lz + (ry ? o : 0)); }
  const roof = new THREE.ConeGeometry(w * 0.86, 1.5, 4, 1); roof.rotateY(Math.PI / 4); put(roof, 0x3a332c, 0, 5.15, 0);
  return mesh(parts, true);
}
// 竹束の胴：面ごとに青竹一本ずつの濃淡を付け、束ねた竹の筋に見せる（平らな筒に見せない）
function stalks(geo, hex) {
  const g = geo.toNonIndexed(), P = g.attributes.position, n = P.count, a = new Float32Array(n * 3);
  const base = new THREE.Color(hex), c = new THREE.Color();
  for (let t = 0; t < n; t += 3) {
    const k = Math.floor(((Math.atan2(P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2), P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) + Math.PI) / (Math.PI * 2)) * 12);
    c.copy(base).multiplyScalar([1.2, 0.62, 1.0, 0.74][k % 4]);
    for (let j = 0; j < 3; j++) { a[(t + j) * 3] = c.r; a[(t + j) * 3 + 1] = c.g; a[(t + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// 寄せ手の竹束と置き盾の列。kind：'take' 竹束／'tate' 置き盾
function siegeRow(world, pts, kind) {
  const parts = [];
  for (const [x, z, rot] of pts) {
    const y = world.heightAt(x, z);
    const put = (g, hex) => { g.rotateY(rot); g.translate(x, y, z); parts.push(paint(g, hex)); };
    if (kind === 'take') {
      // 竹束：青竹を丸く束ねて縄で二か所締め、敵の方へ傾けて立てる（一列の平らな竹の簾に見せない）。二束を並べて一組
      for (const ox of [-0.36, 0.36]) {
        for (let i = 0; i < 7; i++) {
          const a = i * 1.047, r = i === 6 ? 0 : 0.17;
          const g = new THREE.CylinderGeometry(0.085, 0.095, 2.2 - (i % 3) * 0.12, 5);
          g.translate(ox + Math.cos(a) * r, 1.05, Math.sin(a) * r); g.rotateX(-0.2);
          put(g, [0x7c7a48, 0x6e6c3e, 0x86804e, 0x74703f][(i + (ox > 0 ? 1 : 0)) % 4]);
        }
        for (const yy of [0.5, 1.45]) { const b = new THREE.CylinderGeometry(0.27, 0.27, 0.07, 7); b.translate(ox, yy, 0); b.rotateX(-0.2); put(b, 0x3a2c1c); }
      }
      const k = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4); k.rotateX(0.6); k.translate(0, 0.7, 0.6); put(k, 0x5a4a30);
    } else {
      // 置き盾：縦の板五枚を横の桟二本で留め、裏の支え棒で傾けて立てる（一枚の平らな箱に見せない）
      const lean = -0.12, hs = [1.62, 1.7, 1.66, 1.72, 1.6];
      for (let i = 0; i < 5; i++) {
        const b = new THREE.BoxGeometry(0.27, hs[i], 0.06); b.translate((i - 2) * 0.29, hs[i] / 2, 0); b.rotateX(lean);
        put(b, [0x6e5a3e, 0x5e4c34, 0x766046, 0x584832, 0x6a563c][(i + Math.round(x)) % 5]);
      }
      for (const yy of [0.35, 1.3]) { const c = new THREE.BoxGeometry(1.5, 0.1, 0.05); c.translate(0, yy, 0.06); c.rotateX(lean); put(c, 0x3e3022); }
      const k = new THREE.BoxGeometry(0.08, 1.5, 0.08); k.rotateX(0.6); k.translate(0, 0.65, 0.45); put(k, 0x4a3a28);
    }
  }
  const out = mesh(parts, false);
  // 玉と矢を止める所（据えた所の位置と向き。BV「竹束の後ろに隠れれば本当に防げる・矢が刺さる」）
  out.userData.covers = pts.map(([x, z, rot]) => ({ team: 0, x, z, rot, hw: kind === 'take' ? 0.66 : 0.76, hd: 0.26, h: kind === 'take' ? 2.1 : 1.62 }));
  return out;
}
const row = (W, z0, x0, x1, dx, k) => { const pts = []; for (let x = x0; x <= x1; x += dx) pts.push([x + Math.sin(x * 1.7) * 0.6, z0 + Math.cos(x * 0.9) * 1.2, Math.PI + Math.sin(x * 0.7) * 0.12]); return siegeRow(W, pts, k); };

// ---- 段の敵（b_depth.js）：真田の兵は塀の内から、左右の口から出ては引く ----
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });

import DEPTH_K11 from './k11/depth.js';   // 軍勢の厚み・陣立ての表（army_depth）
const k11_sanadamaru = {
  depth: DEPTH_K11,
  lethal: true,   // 命懸けの戦場（lethal.js）：流れ弾・突然の負傷と討死・制圧・恐怖・孤立
  resumeSteps: [[1, 'begin'], [2, 'attack1'], [3, 'attack2'], [4, 'rush'], [5, 'assault'], [6, 'collapse'], [7, 'withdraw']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。真田丸：十二月初めの冬の朝。霜枯れの草、撃ち込まれた矢・倒れた槍と旗
  timeslip: {
    wet: 0.25, dust: 0.3, trample: 0.35, debris: 1.4, arrows: 1.3, maxSlope: 0.25,
    grass: 0xa8a070, grassTints: [0xffffff, 0xeee4c4, 0xd4c8a4], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  // 11/6 描いて遊んだ：篠山の段が二十秒で済み、もぬけの「あれ？」を感じる間が無かった（二2）。前田の竹束の陣（仕寄り）から出て、撃たれながら篠山へ登る
  spawn: { x: SASA.x - 6, z: SASA.z + 62, heading: Math.PI },
  noWake: true,
  stageGoalsOnly: true,        // 右上の目標は四つの段だけ（「敵を八人討つ」で埋めない。三1）
  goalsAllRows: true,          // 九1・十1：五つの場所と行いを最初から並べ、済んだ物に印を付ける。
  goalsVisibleRows: 5,
  nearbyAllySignLimit: 0,      // 味方の頭上に白い丸を出さない（意味の分からない印。五2）
  noFlankCry: true,            // 撃ち崩された寄せ手に、共通の側面攻撃の声を重ねない。
  // 見出しの札は終わりと討ち取りだけ（「敵の隊が崩れた」や段の見出しは案内の字。kaito 五1）。流れは台詞と動きで分かる
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  minutes: 15,
  foeHit: 1.05,
  world: {
    // 11/8 critic60 九6：倒れる味方が宙で二つ折れの人形に見えた。本能寺と同じく、倒れを地面で受け、遠目の亡骸の腰と胸も地へ着ける
    groundedFalls: true, contactFalls: true, settleSideFalls: true, settleFallenLimbs: true, settleFallenBody: true, fallPaceSpread: 0.35,
    seed: 1614124,
    time: 'morning',
    // 冬の朝。靄は薄く、丸の上から寄せ手の陣と篠山まで見通せる（11/6 BV「真田丸から外を見ると霧で何も見えない」）
    mist: false, battleViewDistance: 140,
    // 上町台地の南は住吉・堺まで平らな野。東の生駒は七里の先で低く霞む（11/6 遊んだ：高い山が間近に迫り、大坂が山の盆地に見えた）
    mountainScale: 0.16, mountainHaze: 0.85,
    farReliefScale: 0.12,   // 地図の外の野は低く平らに（北の大坂城の石垣と天守を隠さない）
    groundHalf: 260,
    paths: [[[0, 190], [4, 140], [10, 106], [SASA.x - 4, SASA.z + 10]]],
    height,
    tint(x, z, h, c) {
      const r = rOf(x, z), a = Math.abs(angOf(x, z));
      if (r < FENCE_R + 1.5 && a < SPAN + 0.2) {
        // 段の面は踏み固めた明るい土、切岸は削った濃い土（模型の段々の明暗）
        const slope = (r > WALL_R + 0.6 && r < STEP1.r0) || (r > STEP1.r1 && r < STEP2.r0) || (r > STEP2.r1 && r < FENCE_R - 0.6);
        // 11/6 遊んだ：切岸が白い土の崖に見え、空堀が見えなかった（八3）。切岸は削った上町台地の褐色の土、空堀の底は日の届かない濃い土
        const floor = r > STEP2.r0 - 0.4 && r < STEP2.r1 + 0.4;
        if (slope) c.setRGB(c.r * 0.08 + 0.14, c.g * 0.06 + 0.105, c.b * 0.05 + 0.075);   // 緑を勝たせない（草を生やさない）
        else if (floor) c.setRGB(c.r * 0.12 + 0.19, c.g * 0.1 + 0.16, c.b * 0.08 + 0.12);
        else c.setRGB(c.r * 0.2 + 0.4, c.g * 0.16 + 0.33, c.b * 0.14 + 0.26);
        return;
      }
      // 丸の後ろの台と空堀（褐色の土）
      if (r < WALL_R + 12 && a >= SPAN + 0.2) { c.setRGB(c.r * 0.12 + (r < WALL_R + 1 ? 0.4 : 0.24), c.g * 0.1 + (r < WALL_R + 1 ? 0.33 : 0.19), c.b * 0.08 + (r < WALL_R + 1 ? 0.26 : 0.14)); return; }
      // 冬枯れの野と刈田（十二月四日は今の暦の一月三日。緑を残さず、明るさだけ借りて枯れ草の色に）
      const l = (c.r + c.g + c.b) / 3;
      c.setRGB(l * 0.45 + 0.25, l * 0.42 + 0.2, l * 0.36 + 0.12);
      if (Math.abs(z + 92) < 8 && Math.abs(x) > 18) c.setRGB(c.r * 0.6, c.g * 0.6, c.b * 0.6);
    },
    clear: (x, z) => Math.abs(x) < 95 && z > -95 && z < 160,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) > 105 || z > 160 ? 1 : 0.15),
    groves: [{ x: -84, z: 62, r: 12, n: 16 }, { x: 92, z: 44, r: 12, n: 16 }, { x: SASA.x + 8, z: SASA.z + 6, r: 6, n: 8 }],
    // 逃げる真田の兵は、柵の内へ入ったら丸の中へ消える（遊び手を塀の下まで釣り出さない）
    fleeOut: (x, z, team) => (team === 1 ? (rOf(x, z) < FENCE_R - 1 && Math.abs(angOf(x, z)) < SPAN + 0.1) || (rOf(x, z) < FENCE_R + 3 && Math.abs(Math.abs(angOf(x, z)) - GATE) < 0.12) : z > 200),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.returned = false; F.begun = false; F.shot = 0;
    // 共通の「横槍が入ったぞ！敵が崩れる！」は言わせない：この日、崩れたのは寄せ手の方（11/6 遊んだら五秒おきに三度出た）
    const say0 = rt.say;
    rt.say = function (who, text, ...rest) { return typeof text === 'string' && /横槍/.test(text) ? false : say0.call(this, who, text, ...rest); };
    // ---- 真田丸：土塁の上の塀（壊せない）・外の柵（正面の一間だけ破れる）・櫓・空堀の縁の柵 ----
    const maru0 = rt.scene.children.length;
    const arc = (r, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const q = polar(a0 + (a1 - a0) * i / n, r); pts.push([q.x, q.z]); } return pts; };
    const along = (a) => { const p = polar(a - 0.01, WALL_R), q = polar(a + 0.01, WALL_R); return Math.atan2(-(q.z - p.z), q.x - p.x); };
    // 段の縁の赤茶の板塀（左右の口で切る）
    const G0 = GATE - GATE_W, G1 = GATE + GATE_W;
    // 後ろ（北）も塀で閉じる：丸は堀と塀で四方を囲んだ独立の城（『諸国古城之図』。11/6 BV「後ろから入れてしまう」）
    for (const [a0, a1, n] of [[-SPAN, -G1, 22], [-G0, G0, 30], [G1, SPAN, 22], [SPAN, Math.PI * 2 - SPAN, 24]]) wallLine(rt, arc(WALL_R, a0, a1, n), { team: 1, hp: 1e9, name: '塀', mesh: itabei, segLen: 5, sama: 1.6, h: 2.3 });
    // 左右の口：冠木門に閉じた扉を描く（前は開いた扉の絵で、通ろうとすると見えない塊で止められた。11/6 BV・十四8）。東の口は石垣を積んだ虎口（模型）
    for (const sd of [-1, 1]) {
      const p = polar(sd * G0, WALL_R), q = polar(sd * G1, WALL_R), m = polar(sd * GATE, WALL_R);
      // 当たりで塞ぐ口は扉を閉じて描く（開いた扉の絵に見えない塊で塞がない。BV 続き kaito 11/6・十四8）
      const gw = Math.hypot(q.x - p.x, q.z - p.z) - 0.5;
      rt.scene.add(kabukimon(W, m.x, m.z, gw, along(sd * GATE), { doors: false }), tobira(W, m.x, m.z, gw, along(sd * GATE)));
      Object.assign(solidSeg(p.x, p.z, q.x, q.z, 0.3), { missileH: 3, missileType: 'wood' });
    }
    const stone = (r, a0, a1, top = 0.3) => rt.scene.add(ishigaki(W, arc(r, a0, a1, Math.max(2, Math.round((a1 - a0) * r * 1.2 / 4))), { kind: 'nozura', top, minH: 1.2, maxH: 2.6 }));
    stone(WALL_R + 0.9, G1 + 0.01, GATE + 0.5); stone(WALL_R + 0.9, GATE - 0.32, G0 - 0.01);
    stone(STEP1.r1 + 0.4, GATE - 0.12, GATE + 0.55); stone(STEP2.r1 + 0.4, GATE - 0.05, GATE + 0.4, 0.2);
    F.fence = [
      // 外の柵は切れ目なく巡らす（前は左右の口の前が開いていて、柵の内へ入ると出られなくなった）。真田の兵は口の前の木戸から出入りする
      // 西の一間（L_FENCE）は第二の攻めで打ち倒しかける柵（真田の予備が押し返し、傾いたまま残る。docs/sanadamaru_spec_1109.md）
      ...wallLine(rt, arc(FENCE_R, -SPAN + 0.1, L_FENCE[0], 30), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, L_FENCE[1], -0.05, 14), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, 0.05, SPAN - 0.1, 46), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
    ];
    // 破る柵：正面の一間。鉤縄を掛け、打つと揺れて傾く（どこを・どう倒すかが一目で分かる。十四5）
    F.target = wallLine(rt, arc(FENCE_R, -0.05, 0.05, 1), { team: 1, hp: 520, name: '真田丸の柵', segLen: 6, mesh: hookFence })[0];
    F.target.armor = 0.2; F.target.lastHp = F.target.hp;
    F.fence.push(F.target);
    F.target2 = wallLine(rt, arc(FENCE_R, L_FENCE[0], L_FENCE[1], 1), { team: 1, hp: 380, name: '真田丸の西の柵', segLen: 6, mesh: hookFence })[0];
    F.target2.armor = 0.2; F.target2.lastHp = F.target2.hp;
    F.fence.push(F.target2);
    // 塀の角と横・正面の櫓（塀に跨る一重の櫓）
    for (const a of TOWERS) { const q = polar(a, WALL_R - 0.6); rt.scene.add(maruYagura(W, q.x, q.z, along(a), Math.abs(Math.abs(a) - Math.PI / 4) < 0.01 ? 4 : 3.4)); }
    // 塀に沿って並ぶ小屋掛けの小さな櫓（二枚目の模型：塀の上に櫓がたくさん）
    for (let a = -2.1; a <= 2.11; a += 0.35) {
      if (TOWERS.some((t) => Math.abs(t - a) < 0.18) || Math.abs(Math.abs(a) - GATE) < 0.18) continue;
      const q = polar(a, WALL_R - 0.6); rt.scene.add(maruYagura(W, q.x, q.z, along(a), 2.6));
      if (Math.abs(a) < 1.9) (F.smallT ||= []).push(a);
    }
    // 各段の柵の列（切岸の足もと）
    rt.scene.add(innerFence(W, [[-SPAN + 0.12, -GATE - 0.1], [-GATE + 0.1, GATE - 0.1], [GATE + 0.1, SPAN - 0.12]], STEP1.r0 + 0.8));
    // 空堀の底の柵（壊せない）：堀へ降りた寄せ手は、ここで止まって上の段から撃たれる（簡単に入れない）
    for (const [a0, a1, n] of [[-SPAN + 0.12, -GATE - 0.1, 8], [-GATE + 0.1, GATE - 0.1, 16], [GATE + 0.1, SPAN - 0.12, 8]]) wallLine(rt, arc(STEP2.r0 + 0.8, a0, a1, n), { team: 1, hp: 1e9, name: '柵', segLen: 5 });
    rt.scene.add(osakaCastle(W));
    // 大坂城：真田丸の北の上町台地の北の端（実の一・五 km を一・二 km ほどに寄せ、天守は実の割りより大きく）。丸の上から振り返ると、惣構の向こうに本丸の石垣と天守が大きく見える
    //   （11/6 BV「後ろに大坂城が大きく見えないと、ただの丸い砦」）。遠景で当たりは無い。地図の外の野を城の下に敷く
    try {
      F.osaka = osakaFar(rt, { x: -40, z: -290, s: 2, big: 3.6, land: [[-520, -760, 440, -259]] });
      farCastle(F.osaka.group);
    } catch (e) { console.warn(e); }
    // 丸の中：真田の陣屋と小屋・俵、塀の内にぐるりと並ぶ旗
    // 真ん中の本陣：白い幕の囲いの中に陣屋（二枚目の模型）
    rt.scene.add(jinmaku(W, 0, -59, 13, 8, 4), hut(W, 0, -60, 7, 4, 0), hut(W, -20, -56, 7, 4, Math.PI / 2), hut(W, 20, -56, 7, 4, Math.PI / 2), hut(W, -24, -36, 4, 10, 0),
      hut(W, -15, -26, 5, 3.5, 0.1), hut(W, 15, -25, 5, 3.5, -0.1), tawara(W, 10, -46, 0.3, 5), tawara(W, -8, -64, 0.2, 4));
    // 幟は一丈二尺〜一丈五尺（4m 余り）。人の何倍もの幟を立てない（11/6 遊んだ。四5）
    // 赤い旗（真田の赤備え）：塀の内にずらり、本陣の周り、外の柵の一隊。幟は横木で張るので、寄せ手（南）へ布の面を向ける
    const flag = (x, z, h) => { const f = nobori(W, x, z, 'sanada', h); f.rotation.y = Math.sin(x * 3.1 + z) * 0.25; rt.scene.add(f); };
    for (let a = -2.25; a <= 2.26; a += 0.3) { if (Math.abs(Math.abs(a) - GATE) < 0.1) continue; const q = polar(a, WALL_R - 1.6); flag(q.x, q.z, 4.5); }
    for (const [x, z] of [[-8, -53], [8, -53], [-8, -65], [8, -65], [-14, -40], [14, -40]]) flag(x, z, 4.2);
    rt.scene.add(nobori(W, 0, -68, 'toyotomi', 4.8));
    // 丸の塀・櫓・柵は、篠山の下からでも霧に沈めない（丸の土塁と櫓の並びが見える）
    farSight(rt.scene.children.slice(maru0), { W, ground: { x: C.x, z: C.z, r: 60 } });
    // 和議の後に壊す丸の物（塀・櫓・柵・旗）。遠景の城は外す（k11/wagi.js）
    { const bx = new THREE.Box3(), v = new THREE.Vector3();
      F.maruObjs = rt.scene.children.slice(maru0).filter((o) => o !== F.osaka?.group && Math.hypot((bx.setFromObject(o).getCenter(v)).x - C.x, v.z - C.z) < 52); }

    // ---- 寄せ手の陣：前田の竹束と置き盾の列、本陣 ----
    const rows = [row(W, 104, -40, 2, 2.6, 'take'), row(W, 108, -62, -44, 2.4, 'tate'), row(W, 98, -36, 8, 3.2, 'take'), row(W, 98, 34, 52, 3.2, 'take')];
    rt.scene.add(...rows);
    for (const r of rows) for (const c of r.userData.covers) addMissileCover(rt.army, c);
    const mc = camp(rt, { x: -14, z: 140, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'maeda', armor: TK,
      general: { name: '前田利光', hat: 'kabuto_m', haori: 0x3a2e24 }, guard: 14, reserve: 0, runTo: { x: 0, z: 120 } });
    if (mc.general) mc.general._crouch = true;   // 前田利光は本陣の床几に座る（前に出ない）
    // 11/8 critic60 十5：白地の前田の幟が霧の中で「真っ白な柱」に見えた。布を一度だけ写して、霧の中でも白く飛ばない生成りに沈める
    const maedaCloth = new Map();
    for (const [x, z, k, h] of [[-26, 150, 'maeda', 4.8], [-2, 118, 'maeda', 4.2], [14, 116, 'maeda', 4.2]]) {
      const f = nobori(W, x, z, k, h);
      f.traverse((o) => { if (o.isMesh && o.material?.map && !Array.isArray(o.material)) { if (!maedaCloth.has(o.material)) { const m = o.material.clone(); m.color.setHex(0x8f8670); maedaCloth.set(o.material, m); } o.material = maedaCloth.get(o.material); } });
      rt.scene.add(f);
    }
    KIT.farVillage(rt, 130, 170, { rot: Math.PI, n: 6, fields: 8, seed: 52 });

    // 見せかけの軍勢（軽い作り）は置かない（AA・AF・AQ6）。家康は住吉の陣にいて、この戦場にはいない（AR3・AT3）。
    // 真田丸の中：信繁の本陣と旗本（侍）。塀の内に構え、外へは出ない（総大将は討てる所に出さない）
    F.nobu = enemyGroup(rt, { faction: 'toyotomi', name: '真田信繁の旗本', anchor: { x: 0, z: -54 }, facing: 0, width: 8, aggro: 0, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '真田信繁', hat: 'kabuto_sanada', haori: 0x7a1a12 } }, uS(6), uG(2)], SANADA));
    for (const u of F.nobu.units) u.speed = u.run = 0;
    if (F.nobu.units[0]) F.nobu.units[0]._crouch = true;   // 信繁は丸の本陣で床几に座る

    // ---- 味方：前田の先手（山崎長徳の組）・二の手（本多政重）・柵を破る組。槍衾の陣形で並ぶ ----
    F.yam = allyGroup(rt, { faction: 'tokugawa', name: '山崎長徳の組', anchor: { x: SASA.x - 4, z: SASA.z + 54 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山崎長徳', invuln: true, horse: true } }, uS(4), uA(20), uG(7)], MAEDA));
    F.second = allyGroup(rt, { faction: 'tokugawa', name: '本多政重の二の手', anchor: { x: -10, z: SASA.z + 58 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '本多政重', invuln: true, horse: true } }, uS(3), uA(16), uB(5)], MAEDA));
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: SASA.x + 12, z: SASA.z + 60 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      // 仕寄り：前の六人は竹束を抱えて柵へ寄る（共通の tatake。束は本当に玉と矢を止め、矢が刺さる。十四3）
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6, o: { hat: 'jingasa_n', tatake: true } }, { type: 'ashigaru', n: 8, o: { hat: 'jingasa_n' } }], MAEDA));
    F.rams = [F.ram];
    // 井伊（八丁目口の前）と越前松平（谷町口の前）：前田の西に初めから陣を構え、城内の爆発まで動かない（湧かせない。布陣図どおり）
    F.surge = [];
    for (const [ax, az, lk, nmx, gen, hat] of [[-70, 40, II, '井伊直孝の赤備え', '井伊直孝', 'kabuto_tentsuki'], [-150, 22, ECHI, '松平忠直の越前勢', '松平忠直', 'kabuto_shika']]) {
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: { x: ax, z: az }, fixed: true, facing: Math.PI, width: 16, aggro: 0, speed: 4.2, morale: 90, fleeDir: { x: -0.2, z: 1 }, formation: 'yari' },
        dress([{ type: 'busho', n: 1, o: { name: gen, invuln: true, horse: true, hat } }, uS(4), uA(16), uG(3)], lk));
      rt.scene.add(nobori(W, ax, az + 8, lk.flag, 4.5));
      F.surge.push(g);
    }
    for (const g of [F.yam, F.second]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SASA.x + 4, z: SASA.z + 58 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // ---- 真田方：塀の内の鉄砲と弓、櫓の上の射手（横矢）、篠山の鉄砲 ----
    F.wallG = enemyGroup(rt, { faction: 'toyotomi', name: '塀の内の鉄砲', anchor: { x: C.x, z: C.z + WALL_R - 4 }, facing: 0, width: 16, spacing: 2.4, aggro: 0, noRout: true },
      dress([uS(2), uG(10), uB(6)], SANADA));
    F.towerU = [];
    TOWERS.forEach((a, i) => {
      // 櫓（maruYagura）の床の上：塀に跨る櫓の真ん中に立ち、板壁の狭間から撃つ（屋根の上に浮かせない。11/6 遊んだ）
      const q = polar(a, WALL_R - 0.6);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '櫓', anchor: q, facing: a, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        dress([uG(2), i % 2 ? uG(1) : uB(1)], SANADA));
      g.units.forEach((u, k) => { const r = along(a), o = (k - 1) * 0.7; u.tower = { x: q.x + Math.cos(r) * o, z: q.z - Math.sin(r) * o }; u.pos.x = u.tower.x; u.pos.z = u.tower.z; u.speed = u.run = 0; F.towerU.push(u); });
    });
    // 塀に沿う小さな櫓にも鉄砲を一人ずつ（塀の上に櫓がたくさん。どの櫓からも撃ってくる）
    {
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '小櫓の鉄砲', anchor: polar(0, WALL_R - 0.6), facing: 0, width: 4, aggro: 0, noRout: true }, dress([uG(F.smallT.length)], SANADA));
      g.units.forEach((u, k) => { const q = polar(F.smallT[k], WALL_R - 0.6); u.pos.x = q.x; u.pos.z = q.z; u.speed = u.run = 0; u.tower = q; F.towerU.push(u); });
    }
    // 塀の内の西・東の鉄砲と弓：塀の狭間に付いて撃つ（前は塀の外の上の段に立ち、斬って倒せた。11/6 BV「建物・塀の内から撃つ」・十四3）
    F.perch = [];
    for (const [a0, a1, nmx] of [[-PERCH_A - 0.5, -0.12, '塀の内の西の鉄砲衆'], [0.12, PERCH_A + 0.5, '塀の内の東の鉄砲衆']]) {
      const q0 = polar((a0 + a1) / 2, WALL_R - 3);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: nmx, anchor: q0, facing: (a0 + a1) / 2, width: 8, spacing: 1.4, aggro: 0, noRout: true },
        dress([uS(1), uG(9), uB(4)], SANADA));
      g.units.forEach((u, k) => { const q = polar(a0 + (a1 - a0) * (k + 0.5) / g.units.length, WALL_R - 1.6); u.pos.x = q.x; u.pos.z = q.z; u.pos.y = W.heightAt(q.x, q.z); u.heading = Math.atan2(q.x - C.x, q.z - C.z); });
      g.fire = false;
      F.perch.push(g);
    }
    // 丸の内の槍衆：左右の口の内に構えて、打って出る時を待つ（丸の中にこそ大勢。11/6 BV）
    for (const sd of [-1, 1]) {
      const q = polar(sd * (GATE - 0.25), WALL_R - 9);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: sd < 0 ? '西の口の内の槍衆' : '東の口の内の槍衆', anchor: q, facing: sd * GATE, width: 7, spacing: 1.3, aggro: 0, noRout: true, formation: 'yari' },
        dress([uS(1), uA(9)], SANADA));
      for (const u of g.units) u.speed = u.run = 0;
    }
    // 篠山の鉄砲：丘の上で南へ構え、寄せが登り始めると丸の東の口へ引き揚げる（史実：篠山はもぬけの殻）
    const pq = PORT(1);
    F.sasa = enemyGroup(rt, { faction: 'toyotomi', name: '篠山の真田の鉄砲', anchor: { x: SASA.x, z: SASA.z - 2 }, fixed: true, facing: Math.PI, width: 7, spacing: 1.6, aggro: 0, noRout: true, keepMoveOrder: true,
      fleeDir: { x: (pq.x - SASA.x) / 80, z: (pq.z - SASA.z) / 80 } }, dress([uS(1), uG(7)], SANADA));
    F.sasa.fire = false;
    rt.scene.add(nobori(W, SASA.x + 3, SASA.z - 5, 'sanada', 4.5));
    for (const u of [...F.wallG.units, ...F.towerU, ...F.perch.flatMap((g) => g.units), ...F.sasa.units]) { u.group.dmgMult = 0.4; if (u.type === 'gun') u.dmg *= 0.4; }
    // 持ち口は増減しないので、射撃・狙い・補給に同じ一覧を使う。
    F.fireGroups = [F.wallG, ...F.perch, ...new Set(F.towerU.map((u) => u.group))];
    F.wallG.fire = false;
    for (const u of F.towerU) u.group.fire = false;

    rt.world.setTime('morning');
    // 靄の朝は日が薄い：くっきりした木漏れ日の影を落とさない（11/6 遊んだ。八1）
    if (rt.world.sun) rt.world.sun.intensity *= 0.55;
    if (rt.world.hemi) rt.world.hemi.intensity *= 1.15;
    this.goalsHud(rt);
    rt.setPhase('brief');
    rt.obj('main', '篠山の頂まで登れ', 'main');
    rt.marker('dp', { x: SASA.x, z: SASA.z }, '篠山', { h: 3 });   // 行き先のピンは戦の始めから切らさない（関所3）
    // 戦の前：信繁が南に出丸を築いた。徳川は南へ回った
    rt.banner('真田丸', '慶長十九年十二月　大坂城の南');
    rt.say('山崎長徳', '見よ、城の南に突き出た出丸を。真田左衛門佐が築いたものじゃ', 4.4);
    rt.after(4, () => rt.say(nm(rt), '外に柵、その内に空堀。土塁の上に塀と櫓……', 3.6));
    rt.after(7, () => rt.say('前田利光', '大御所様は、仕寄りを掘り進めよ、攻めかかるなと仰せじゃ。井伊と越前の松平殿は西に並ぶ', 4.4));
    rt.after(11, () => rt.say('山崎長徳', 'じゃが篠山から真田の鉄砲に撃たれて、仕寄りが進まぬ。篠山だけは取る', 4.2));
    rt.after(14.5, () => this.begin(rt));
  },

  // 右上の目標：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。段の刻限の時計は出さない（段は柵を破るまで続く）
  goals5() {
    return STAGES.k11_sanadamaru.map(([text], k) => ({ kind: 'stage', k, text,
      check: (rt) => (k < STAGES.k11_sanadamaru.length - 1 ? (rt.flags.step || 0) >= k + 2 : !!rt.flags.returned) }));
  },
  // 共通の任務札は今の一行だけなので、この戦では目標の札（hud_goals）を重ねて置き換え、両軍の兵の数の棒（armybar）も上に出す（九1・九3・十二1）。
  //   森部（b_moribe.js）と同じ作り。戦が終われば元へ戻す
  goalsHud(rt) {
    const hud = rt.hud;
    if (!hud || !hud.root || typeof document === 'undefined') return;
    hud.root.classList.add('sanada-goals');
    const st = document.createElement('style');
    st.textContent = `
html:root body #hud#hud#hud.sanada-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.sanada-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.sanada-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em) { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
      return out;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.progress = hudProgress;
      if (hud.prog) hud.prog.classList.remove('goal-mode');
      hud.root.classList.remove('sanada-goals'); st.remove();
      return dispose.call(this);
    };
  },

  // ---- 流れ（kaito 11/9 夜 docs/sanadamaru_spec_1109.md「攻めても進めない戦をつまらなくしない」）----
  //   ① 篠山（見る・支度）→ ② 正面の攻め（引きつけての一斉射）→ ③ 西から回り込む（横矢・横の鉄砲衆・柵を倒しかけて予備の槍に押し返される）
  //   → ④ 味方の先走りの渋滞を整理する（信繁を遠くに見せる）→ ⑤ 最大の攻め（柵を破ると中の二の構えと打って出の罠）
  //   → ⑥ 攻撃中止・味方を退かせる → ⑦ 撤収戦（取り残された味方を救い、竹束の陣へ）。毎回ちがう理由で止められ、毎回少し奥まで進む。
  //   段ごとに depthStart をし直す（途中の保存は段の関数を順に流して作り直す：resumeSteps）

  // 段の共通の作り（一度だけ作って使い回す）
  ctx(rt) {
    const F = rt.flags;
    if (F.ctx) return F.ctx;
    // backing: false … 段の敵の後ろに見せかけの控えを付けない（AA）。数は本物の兵で出す
    // fixedSpawn：打って出る兵は丸の左右の口から出る（見えない所から湧かせない。九2）
    F.ctx = { faction: 'toyotomi', flag: 'sanada', armor: SANADA.armor, dmg: 0.4, mass: 0, backing: false, scale: 1.2, fixedSpawn: true, look: (l) => dress(l, SANADA),
      // 撤収の段は withdraw の移動命令を守る。共通の move が先手を「持ち場を守れ」に戻さない。
      friends: () => F.step >= 6 ? [] : [F.yam, F.second].filter((g) => g && g.count && !g.routed), botSeek: 40,
      // 素直な遊び手：柵を打つ段は、目の前に敵がいなければ竹束の陰から柵を打つ（持ち場で南を向いて立ち尽くさない。九7）
      botSteer: (b, inp) => {
        const T = F.breakT, u = b.player.u;
        // 鉄砲のまま槍の間合いへ入らない。近くの敵への受けと反撃は共通の判断を守る。
        const foe = b.army.nearestEnemy(u, 4, (o) => !o.isStruct && !o.noTarget && !o.woundOut && !o.fleeing && !o.invuln && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
        if (foe) {
          if (b.player.weapon === 'gun' || b.player.weapon === 'bow') inp.e.add('Digit1');
          return;
        }
        if (!F.breaking || !T || !T.alive || T.invuln) return;
        if (b.player.lock) inp.e.add('KeyQ');
        if (b.player.weapon !== 'spear') inp.e.add('Digit1');
        inp.guardHold = false;
        inp.k.delete('KeyA'); inp.k.delete('KeyS'); inp.k.delete('KeyD');
        const fx = (T.seg[0] + T.seg[2]) / 2, fz = (T.seg[1] + T.seg[3]) / 2;
        // 柵の外（丸から遠い側）の竹束の陰へ寄る。近い束を一つ選ぶだけで、配列を毎コマ作らない
        const rf = rOf(fx, fz);
        let cover = null, best = Infinity;
        for (const g of F.rams) for (const a of g.units) {
          if (!a.alive || !a.tatake || a.fleeing || a.woundOut || rOf(a.pos.x, a.pos.z) < rf || Math.hypot(a.pos.x - fx, a.pos.z - fz) > 12) continue;
          const d = Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z);
          if (d < best) { best = d; cover = a; }
        }
        if (inp.leftPressed && !cover) return;
        let tx = fx, tz = fz;
        if (cover) { const ca = angOf(cover.pos.x, cover.pos.z), q = polar(ca, rOf(cover.pos.x, cover.pos.z) + 1.6); tx = q.x; tz = q.z; }
        else { const q = polar(angOf(fx, fz), rf + 1.2); tx = q.x; tz = q.z; }
        const d = Math.hypot(tx - u.pos.x, tz - u.pos.z);
        if (cover && d > 0.25) { inp.leftPressed = false; b.player.yaw = Math.atan2(tx - u.pos.x, tz - u.pos.z); inp.k.add('KeyW'); return; }
        const vx = T.seg[2] - T.seg[0], vz = T.seg[3] - T.seg[1];
        const along = clamp01(((u.pos.x - T.seg[0]) * vx + (u.pos.z - T.seg[1]) * vz) / (vx * vx + vz * vz || 1));
        const ax = T.seg[0] + vx * along, az = T.seg[1] + vz * along;
        if (cover && Math.hypot(ax - u.pos.x, az - u.pos.z) > 3) { inp.k.delete('KeyW'); inp.leftPressed = false; return; }
        b.player.yaw = Math.atan2(ax - u.pos.x, az - u.pos.z);
        if (d > 2.2) inp.k.add('KeyW'); else { inp.k.delete('KeyW'); inp.leftPressed = b.player.cd <= 0 && !b.player.pending && b.player.sta >= 18; }
      } };
    return F.ctx;
  },

  // 共通の放置・刻限による段飛ばしで、着いた・守ったことにしない。
  steps(rt, list, done) {
    depthStart(rt, this.ctx(rt), list, done);
    for (const s of rt.flags.dp.steps) { s.idleAdvance = false; s.noHardCap = true; if (s.kind === 'move') s.limit = Infinity; }
  },

  // 味方の先手と二の手を、行き先の脇へ連れて行く（共通の sendFriends と同じ並び）
  lead(rt, at) {
    const fr = this.ctx(rt).friends(rt);
    fr.forEach((g, i) => { const k = i - (fr.length - 1) / 2; g.calm = false; g.anchor = { x: at.x + k * 7, z: at.z + 3 + (i % 2) * 4 }; g.order = 'hold'; g.aggro = 16; });
  },

  // 進む段：行き先のピンを一つずつ奥へ。stop が真なら（損害が増えた・刻が過ぎた）そこで退きの下知
  push(o) {
    const self = this;
    return { kind: 'push', max: o.max || 200, limit: Infinity,
      start(rt, C) {
        C.k = 0; rt.obj('dp', o.obj, 'main');
        C.pin = (k) => { C.at = o.pins[k]; C.goal = C.at; rt.marker('dp', C.at, o.label, { h: 3 }); rt.zone('dp', C.at.x, C.at.z, o.r || 5); self.lead(rt, C.at); };
        C.pin(0);
        for (const [w, t, d] of o.say || []) rt.say(w, t, d || 3.4);
      },
      tick(rt, C, m, ctx, el) {
        const p = rt.player.u.pos, d = Math.hypot(p.x - C.at.x, p.z - C.at.z);
        rt.objProgress('dp', `あと ${Math.round(d)}m`);
        // 一人で駆け抜けない：味方の先手が寄るか、そのピンで十五秒待つまで次へ進まない（攻め一回を二分余りに。11/10 関所の流しで十四秒で済んだ）
        const yc = gone(rt.flags.yam) ? null : rt.flags.yam.center();
        const mates = !yc || Math.hypot(yc.x - C.at.x, yc.z - C.at.z) < 18 || el - (C.pinT || 0) > 15;
        if (C.k < o.pins.length && d < (o.r || 5) && mates && el - (C.pinT || 0) > 10) {
          C.k++; C.pinT = el;
          const w = o.at && o.at[C.k - 1];
          if (w) w(rt, C);
          if (C.k >= o.pins.length) { if (!o.stop) return true; rt.objProgress('dp', 'あと少し……'); }
          else C.pin(C.k);
        }
        return !!(o.stop && el >= (o.minT || 0) && o.stop(rt, C, el));
      },
      end(rt, C) { rt.unmark('dp'); rt.unzone('dp'); rt.objDone('dp'); if (o.onEnd) o.onEnd(rt, C); },
    };
  },

  // 段の短さの下限：着いても el 秒までは済ませない（撤収は一分半ほど続く。11/10 関所の流しで五秒で済んだ）
  minEl(st, sec, label, radius = 9) {
    const tick = st.tick;
    st.tick = (rt, C, m, ctx, el, dt) => {
      const done = tick(rt, C, m, ctx, el, dt);
      // 着いた後も行き先のピンは切らさない（関所3）
      if (C.arr && !rt.markers.some((q) => q.id === 'dp')) rt.marker('dp', C.at, label, { h: 3 });
      // 一度着いても、救援へ戻っている間は段を終えない。留守中に終えると、帰陣の判定が一度だけ走って以後進まなくなる。
      const p = rt.player.u;
      const present = p.alive && Math.hypot(p.pos.x - C.at.x, p.pos.z - C.at.z) < radius;
      return done && present && el >= sec;
    };
    return st;
  },

  // 退きの下知：撃たれながら篠山の北の麓まで退いて、組を立て直す
  back(rt, who, text, o = {}) {
    return DP.move({ to: RALLY, label: '篠山の北の麓', r: 9, max: 160, obj: o.obj || '篠山の北の麓まで退け', say: [[who, text]],
      onEnd: (rt2) => { const F = rt2.flags; for (const g of F.rams) if (!gone(g)) withdraw(g, { x: RALLY.x + 6, z: RALLY.z + 10 }); if (o.onEnd) o.onEnd(rt2); } });
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    // 始まりの「篠山の頂まで登れ」は段の札（dp）に任せる（右上が二行にならない。11/9 豊臣A）
    rt.objRemove('main');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // 攻めの間、本人の受ける傷は半分（一斉射は味方の寄せ手を薙ぐ場面。本人は「あと少し」を何度も味わって生き残る。11/9 見回り：③で必ず倒れた）
    if (!F.k11Shield) {
      F.k11Shield = true;
      const pl = rt.player, td = pl.takeDamage.bind(pl);
      // 11/10 bot act：③の横の鉄砲衆の前で、櫓と土塁の玉に317秒で倒れた。玉は三分の一ほどに（斬り合いは半分）
      pl.takeDamage = (a, src) => td(F.step >= 2 && F.step <= 6 && src && src.team !== pl.u.team ? a * (src.type === 'gun' ? 0.35 : 0.5) : a, src);
    }
    this.steps(rt, [
      DP.move({ to: { x: SASA.x, z: SASA.z }, label: '篠山', r: 7, max: 240, obj: STAGES.k11_sanadamaru[0][0],
        say: [['山崎長徳', '小さな出丸じゃ！　篠山の鉄砲を追い落とし、一気に落とすぞ！']],
        onEnd: (rt2) => this.taunt(rt2) }),
      DP.rest({ dur: 10, heal: 0.9, fn: (rt2) => rt2.marker('dp', polar(0.06, FENCE_R + 20), '真田丸の正面', { h: 3 }) }),
    ], (rt2) => this.attack1(rt2));
  },

  // 篠山の鉄砲：寄せの太鼓で撃ち始め、遊び手が丘へ近づくと丸の東の口へ引き揚げ、口に着いたら丸の中へ逃げ込む
  sasaTick(rt) {
    const F = rt.flags, g = F.sasa;
    if (!F.begun || gone(g)) return;
    const p = rt.player.u.pos, c = g.center();
    if (!F.sasaFire) { F.sasaFire = true; g.fire = true; }
    if (!F.sasaOff && (Math.hypot(p.x - SASA.x, p.z - SASA.z) < 34 || rt.t - F.t0 > 40)) {
      F.sasaOff = true; g.fire = false; g.fixed = false; g.order = 'move'; g.dest = PORT(1); g.anchor = PORT(1);
      rt.say('足軽', '篠山の鉄砲が丸へ引いていく……？', 3);
    }
    if (F.sasaOff && !F.sasaIn && Math.hypot(c.x - g.dest.x, c.z - g.dest.z) < 6) { F.sasaIn = true; g.noRout = false; g.morale = 0; }
  },

  // 守る段：指定した持ち場の内にいた刻だけを数える。寄せが丸へ引いて残っても、刻が過ぎれば済む（砦を守る AI の兵は追って来ない）
  holdStep(h, dur) {
    const tick = h.tick;
    h.limit = Infinity;
    h.tick = (rt, C, m, ctx, el, dt) => {
      const p = rt.player.u.pos;
      const present = rt.player.u.alive && Math.hypot(p.x - C.at.x, p.z - C.at.z) < C.botRadius;
      if (present) C.sanadaHoldT = (C.sanadaHoldT || 0) + dt;
      const done = tick(rt, C, m, ctx, el, dt) || el >= dur + 10;
      return done && present && (C.sanadaHoldT || 0) >= dur * 0.45;
    };
    return h;
  },

  // 柵を打つ段：T を打ち倒す（clamp なら三割で真田の予備が押し返し、倒れずに傾いたまま残る）まで済まない。札に柵の残り
  breakStep(h, T, clamp) {
    const start = h.start, t0 = h.tick, end = h.end;
    h.max = 360; h.limit = Infinity;
    h.start = (rt, C, m, ctx) => {
      const F = rt.flags;
      start(rt, C, m, ctx);
      F.breaking = true; F.breakT = T; F.clamp = clamp;
      // 遠くに残った組は退かせ、柵の近くの組（無ければ新しい組）で打つ
      const tx = (T.seg[0] + T.seg[2]) / 2, tz = (T.seg[1] + T.seg[3]) / 2;
      for (const g of F.rams) if (!gone(g)) { const c = g.center(); if (Math.hypot(c.x - tx, c.z - tz) > 50) { withdraw(g, { x: RALLY.x + 6, z: RALLY.z + 10 }); g.far = true; } else g.far = false; }
      if (!F.rams.some((g) => !gone(g) && !g.far)) this.newRam(rt, T);
      for (const g of F.rams) if (!gone(g) && !g.far) { g.keepMoveOrder = false; g.order = 'assault'; g.formation = 'line'; g.aggro = 2; g.dmgMult = 2.2; g.assault = () => (T.alive && !T.invuln ? T : null); for (const u of g.units) u.aiT = 0; }
      // 持ち場の印と破る柵の印を重ねない
      rt.unmark('dp');
      rt.marker('fence', { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 }, T.name, { h: 3 });
    };
    h.tick = (rt, C, m, ctx, el, dt) => {
      t0(rt, C, m, ctx, el, dt);
      if (!T.alive || T.invuln) return true;
      // 本人が柵の組を援護し、生きた破城隊が取り付いた刻だけ補う。陣で待つだけでは柵を破ったことにしない。
      const tx = (T.seg[0] + T.seg[2]) / 2, tz = (T.seg[1] + T.seg[3]) / 2, p = rt.player.u;
      const working = p.alive && Math.hypot(p.pos.x - tx, p.pos.z - tz) < 14 && rt.flags.rams.some((g) =>
        !gone(g) && !g.far && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - tx, u.pos.z - tz) < 8));
      if (working) C.ramWorkT = (C.ramWorkT || 0) + dt;
      if (clamp && C.ramWorkT > 70) { T.hp = T.maxHp * 0.3; T.invuln = true; return true; }
      if (!clamp && C.ramWorkT > 150 && T.alive) { rt.army.damage(T, T.hp + 1, null, { kind: 'melee' }); return !T.alive; }
      rt.objProgress('dp', `柵 残り${Math.max(1, Math.ceil(T.hp / T.maxHp * 100))}%`);
      return false;
    };
    h.end = (rt, C, m) => { rt.flags.breaking = false; rt.unmark('fence'); C.inT = 1e9; end(rt, C, m); };
    return h;
  },

  // 柵を破る組（竹束を抱えた前の四人と槍）。倒れれば次の組が竹束の陣から来る
  newRam(rt, T) {
    const F = rt.flags;
    if (liveN(rt) + 12 > LIVE_MAX) return null;
    const q = polar(angOf((T.seg[0] + T.seg[2]) / 2, (T.seg[1] + T.seg[3]) / 2), FENCE_R + 28);
    const g = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: q, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
      dress([{ type: 'ashigaru', n: 4, o: { hat: 'jingasa_n', tatake: true } }, { type: 'ashigaru', n: 8, o: { hat: 'jingasa_n' } }], MAEDA));
    g.assault = () => (T.alive && !T.invuln ? T : null); g.dmgMult = 2.2;
    F.rams.push(g);
    return g;
  },

  // 篠山はもぬけの殻。真田の兵の挑発（必ず）
  taunt(rt) {
    rt.say('足軽', '頂は空じゃ……真田の兵は丸へ引いておった', 3);
    rt.after(3.2, () => rt.say('真田の兵', '篠山で雉狩りか！　暇ならこの丸へ来てみよ！', 4));
    rt.after(7.6, () => rt.say('足軽', 'あいつら、笑うておる……', 2.6));
  },

  // ② 第一の攻め：正面から。真田は近づくまで撃たない → 引きつけて一斉射。50m・30m・15m と寄せて、損害が増えて退きの下知
  attack1(rt) {
    const F = rt.flags;
    F.step = 2; F.holdFire = true;
    setWarStage(1);   // 戦の曲：寄せる所でテンポが上がる（music_war.js の段）
    for (const g of [F.yam, F.second]) if (!gone(g)) { g.formation = 'line'; g.facing = Math.PI; g.width = 22; }
    // 利光は軍令違反と見て引き戻そうとしたが、先手は止まらなかった（専門家の目 11/6）
    rt.say('前田の使番', '殿より！　丸へは寄せるな、仕寄りへ戻れとの仰せ！', 3.4);
    rt.after(4.5, () => { if (F.step === 2) rt.say('山崎長徳', 'ここまで笑われて戻れるか！　正面から真田丸へ寄せよ！', 3.6); });
    rt.after(9, () => { if (F.step === 2) rt.say('足軽', '小さな出丸じゃ。これなら一気に落とせる！', 3); });
    rt.after(24, () => { if (F.step === 2) rt.say('使番', '前田勢、真田丸へ寄せたり！　住吉の大御所様の陣へ注進！', 3.4); });
    // 退きの下知までの損害：一斉射の後、味方が十二人倒れるか、撃たれて五十秒
    const hurt = () => F.fireOn && ((F.ak || 0) - (F.ak0 || 0) >= 14 || rt.t - F.fireT > 70);
    this.steps(rt, [
      this.push({ obj: STAGES.k11_sanadamaru[1][0], label: '真田丸の正面', max: 200, r: 5,
        pins: [polar(0.06, FENCE_R + 20), polar(0.04, FENCE_R + 12), polar(0.03, FENCE_R + 5)],
        at: [
          (rt2) => { if (!F.fireOn) { rt2.say('足軽', '……敵が撃ってこないぞ？', 3); rt2.after(3, () => { if (!F.fireOn) rt2.say('塀の上の声', '引きつけよ。まだ撃つな……', 3); }); } },
          (rt2) => rt2.say('足軽', '柵まであと少しじゃ！', 2.6),
          (rt2) => rt2.say('足軽', '柵が目の前に……！　じゃが堀が深い、前が詰まる！', 3),
        ],
        // 11/10 bot act：深手で下がって一つ目のピンに着かず、三分余り撃たれ続けて倒れた。刻でも退きの下知を出す
        minT: 100, stop: (rt2, C, el) => (C.k >= 1 && hurt()) || (F.fireOn && rt2.t - F.fireT > 80) || el > 170 }),
      this.back(rt, '山崎長徳', '鉄砲が多すぎる！　一度退け、篠山の麓で組を立て直せ！'),
      DP.rest({ dur: 8, heal: 0.9, say: [['足軽', '正面は無理じゃ……塀の上から撃ち下ろされる'], ['山崎長徳', '同じ道は二度と通らぬ。横じゃ、西へ回り込む']], fn: (rt2) => rt2.marker('dp', polar(-1.2, FENCE_R + 30), '西の脇', { h: 3 }) }),
    ], (rt2) => this.attack2(rt2));
  },

  // ③ 第二の攻め：左（西）から回り込む。正面より楽に見える → 別の土塁と櫓から横矢 → 横の鉄砲衆を抑える → 柵を倒しかけると予備の槍が押し返す
  attack2(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.say('山崎長徳', '少ない人数で、西の脇から寄せる。横は手薄じゃ', 3.4);
    const flankAt = polar(-1.72, FENCE_R + 7);
    const fenceAt = polar((L_FENCE[0] + L_FENCE[1]) / 2, FENCE_R + 5);
    this.steps(rt, [
      this.push({ obj: STAGES.k11_sanadamaru[2][0], label: '西の脇', max: 200, r: 6,
        pins: [polar(-1.2, FENCE_R + 30), polar(-1.4, FENCE_R + 15)],
        at: [(rt2) => rt2.say('足軽', '撃ってこぬ……正面より楽かもしれん', 3)],
        onEnd: (rt2) => this.flankFire(rt2, flankAt) }),
      // 横の鉄砲衆：西の土塁の上から撃つ。倒せる（無敵ではない）。半ばを倒せば崩れて塀の内へ引く
      this.subdue({ obj: '横の鉄砲衆を抑えよ', label: '横の鉄砲衆', max: 220 }),
      DP.move({ to: fenceAt, label: '真田丸の西の柵', r: 6, max: 160, obj: '西の柵の前まで寄せよ',
        say: [['足軽', 'ここなら崩せる！　柵を倒せ！']] }),
      this.breakStep(DP.hold({ at: fenceAt, dur: 30, r: 12, noRefill: true, obj: '西の柵を打ち倒せ',
        waves: [{ t: 10, say: ['山崎長徳', '柵が傾いだ！　もう一押し！'], foes: () => [] }] }), F.target2, true),
      // 倒れかけた所へ、丸の中から予備の槍と侍（「まだ予備がいる」）
      this.holdStep(DP.hold({ at: fenceAt, dur: 26, r: 12, noRefill: true, obj: '押し返してくる真田の槍を受けよ',
        waves: [{ t: 0.5, say: ['足軽', '後ろから槍が！　真田にはまだ予備がおる！'], foes: () => [{ name: '西の口の真田の予備', from: PORT(-1), list: [uS(3), uA(12)], seek: 40, dmg: 0.4 }] }] }), 26),
      this.back(rt, '山崎長徳', '柵まで行ったのに……！　退け、退けっ！'),
      DP.rest({ dur: 8, heal: 0.9, say: [['足軽', '横から撃たれた……どこから攻めても、別の所から撃たれる'], ['足軽', '今度こそ……今度こそじゃ']], fn: (rt2) => rt2.marker('dp', polar(0, FENCE_R + 8), '真田丸の正面', { h: 3 }) }),
    ], (rt2) => this.rush(rt2));
  },

  // 西の土塁の鉄砲衆が横矢を放つ。西の櫓も本人を狙う
  flankFire(rt, at) {
    const F = rt.flags;
    if (F.flankG) return;
    const n = Math.max(4, Math.min(10, LIVE_MAX - liveN(rt) - 2));
    const g = enemyGroup(rt, { faction: 'toyotomi', name: '西の土塁の鉄砲衆', anchor: at, fixed: true, facing: angOf(at.x, at.z), width: 8, spacing: 1.5, aggro: 0, noRout: true },
      dress([uG(n)], SANADA));   // 鉄砲だけ（11/10 bot act：抑えに寄ると付きの侍の一太刀 60 で倒れた）
    g.fire = true; g.dmgMult = 0.4;
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4;
    F.flankG = g; F.fireGroups.push(g);
    sfx('volley', 0.9);
    rt.army.play('gun', at, 1.4);
    for (let i = 0; i < 6; i++) rt.army.smoke(at.x + (i - 3) * 1.4, rt.world.heightAt(at.x, at.z) + 1.6, at.z, 0.5, 0.5);
    rt.say('足軽', '横から撃たれた！　西の土塁にも鉄砲が！', 3);
  },

  // 横の鉄砲衆を抑える段：半ばを倒せば（崩れれば）済む
  subdue(o) {
    return { kind: 'fight', max: o.max, limit: Infinity,
      start(rt, C, m, ctx) {
        const g = rt.flags.flankG; C.n0 = g ? g.units.length : 0; rt.obj('dp', o.obj, 'main'); C.at = g ? g.center() : RALLY; C.goal = C.at; rt.marker('dp', C.at, o.label, { h: 3 });
        // 先手と二の手も横の鉄砲衆へかかる（本人ひとりに任せない。11/10 bot act：討てずに十二分止まった）
        if (g) for (const f of ctx.friends(rt)) { f.order = 'attack'; f.seekRange = 40; f.anchor = { x: C.at.x, z: C.at.z + 6 }; f.focus = null; }
      },
      tick(rt, C, m, ctx, el, dt) {
        const g = rt.flags.flankG;
        if (gone(g)) return true;
        const n = g.units.filter((u) => u.alive && !u.fleeing).length;
        C.at = C.goal = g.center();
        rt.objProgress('dp', `残り ${n}人`);
        // 陣で待つだけでは抑えたことにしない。本人か先手が実際に寄せた時間だけ数える。
        const pressing = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 20;
        if (pressing(rt.player.u) || ctx.friends(rt).some((f) => !gone(f) && !f.far && f.units.some(pressing))) C.pressT = (C.pressT || 0) + dt;
        // 半ばを倒すか、実際に百秒寄せれば、横の鉄砲衆は塀の内へ引く。
        if (n <= Math.floor(C.n0 / 2) || C.pressT >= 100) { g.noRout = false; g.morale = 0; return true; }
        return false;
      },
      end(rt) { rt.unmark('dp'); rt.objDone('dp'); rt.say('足軽', '横の鉄砲が黙った！', 2.6); },
    };
  },

  // ④ 味方の先走り：「今度こそ」の焦りで後の手が下知の前に突っ込み、狭い攻め道が詰まる。本人は前線を整理する（退く兵の道を空け、左右へ分ける）
  rush(rt) {
    const F = rt.flags;
    F.step = 4;
    F.jam = (F.jam || []).filter((g) => !gone(g));
    for (let i = F.jam.length; i < 3; i++) {
      const n = Math.min(14, LIVE_MAX - liveN(rt) - 2);
      if (n < 5) break;
      const x0 = [-14, 10, -2][i];
      const g = allyGroup(rt, { faction: 'tokugawa', name: ['前田の後の手', '本多の後の手', '富田の組'][i], anchor: { x: x0, z: RETREAT.z - 4 - i * 4 }, facing: Math.PI, width: 6, aggro: 4, noRout: true, formation: 'column', speed: 4 },
        dress([uS(1), uA(n - 1)], MAEDA));
      g.order = 'move'; g.dest = polar((i - 1) * 0.1, FENCE_R + 6); g.anchor = g.dest; g.keepMoveOrder = true;
      F.jam.push(g);
    }
    rt.say('足軽', '今度こそじゃ！　かかれっ！', 2.6);
    rt.after(2.8, () => rt.say('山崎長徳', '待て！　下知はまだじゃ！　……ええい、後の手が勝手に出おった！', 3.6));
    rt.after(16, () => { if (F.step === 4) rt.say('足軽', '前が詰まってる！　下がれない！', 3); });
    rt.after(30, () => { if (F.step === 4) this.showNobu(rt); });
    rt.after(48, () => { if (F.step === 4) rt.say('使番', '住吉の本陣へ注進！　前田勢の手負い・討死、数知れず！', 3.4); });
    this.steps(rt, [
      this.tidy({ obj: STAGES.k11_sanadamaru[3][0], label: '詰まった味方', max: 200 }),
      DP.rest({ dur: 10, heal: 0.9, say: [['山崎長徳', 'これが最後じゃ。鉄砲で援け、槍と柵を破る組と予備を、皆で同時に入れる'], ['使番', '西の井伊・越前勢も、寄せる構えにござる！']], fn: (rt2) => rt2.marker('dp', polar(0, FENCE_R + 10), '真田丸の柵', { h: 3 }) }),
    ], (rt2) => this.assault(rt2));
  },

  // 前線を整理する段：詰まった組の所へ行けば、その組は左右へ分かれて退き、道が空く。三組を整理すれば済む
  tidy(o) {
    return { kind: 'tidy', max: o.max, limit: Infinity,
      start(rt, C) { C.n = 0; rt.obj('dp', o.obj, 'main'); C.at = C.goal = polar(0, FENCE_R + 8); rt.marker('dp', C.at, o.label, { h: 3 }); },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, p = rt.player.u.pos;
        const left = F.jam.filter((g) => !gone(g) && !g.tidied);
        let near = null, nd = Infinity;
        // まず柵前の組を整理する。長く着けない組も、その場まで迎えに行って退かせる（到着待ちで止めない）。
        for (const g of left) { const c = g.center(), d = Math.hypot(c.x - p.x, c.z - p.z); if ((rOf(c.x, c.z) < FENCE_R + 16 || el > o.max) && d < nd) { nd = d; near = g; } }
        if (near) {
          const c = near.center(); C.at = C.goal = c; rt.marker('dp', c, o.label, { h: 3 });
          if (nd < 7) {
            near.tidied = true; C.n++;
            const sd = C.n % 2 ? -1 : 1;
            withdraw(near, { x: sd * 34, z: RETREAT.z - 10 });
            rt.say(nm(rt), ['道を空けよ！　手負いを後ろへ！', '左右へ分かれよ！　柵際は鉄砲で援けよ！', '下がれ、下がって組を立て直せ！'][(C.n - 1) % 3], 2.8);
          }
        }
        rt.objProgress('dp', `整理した組 ${C.n}/${F.jam.length}`);
        return el > 70 && left.every((g) => g.tidied);
      },
      end(rt) { rt.unmark('dp'); rt.objDone('dp'); },
    };
  },

  // 信繁を遠くに見せる：塀の上、六文銭の大旗の下で指揮する（降りて来ない。顔は見えなくてよい）
  showNobu(rt) {
    const F = rt.flags;
    if (F.nobuShown) return;
    F.nobuShown = true;
    const u = F.nobu.units.find((q) => q.name === '真田信繁');
    const q = polar(0.14, WALL_R - 1.4), y = rt.world.heightAt(q.x, q.z);
    rt.scene.add(nobori(rt.world, q.x + 0.8, q.z - 0.6, 'sanada', 6));
    if (u && u.alive) { u._crouch = false; u.pos.x = q.x; u.pos.z = q.z; u.pos.y = y; u.mesh.position.set(q.x, y, q.z); u.heading = Math.PI; u.anchorPos = { x: q.x, z: q.z }; }
    revealName(rt, '真田信繁');
    rt.say('足軽', '塀の上……六文銭の旗の下に一人立っておる。あれが真田左衛門佐か', 3.6);
  },

  // ⑤ 最大の攻め：鉄砲の援け・槍・柵を破る組・予備を同時に入れる。柵を破ると、中の二の構えと打って出の罠
  assault(rt) {
    const F = rt.flags;
    F.step = 5;
    this.fenceStart(rt);
    const at = { x: 6, z: C.z + FENCE_R + 10 };
    this.steps(rt, [
      this.breakStep(DP.hold({ at, dur: 40, r: 16, noRefill: true, obj: STAGES.k11_sanadamaru[4][0],
        waves: [
          { t: 8, say: ['足軽', '東の口から真田の兵が出てきた！　柵を破る組を狙っておる！'], foes: () => [{ name: '東の口の真田の兵', from: PORT(1), list: [uS(2), uA(9)], seek: 40 }] },
          { t: 26, say: ['山崎長徳', '横の櫓からも撃ってくる！　竹束の陰に入れ！　込め直す間に寄せよ！'], foes: () => { F.volT = rt.t + 1; return []; } },
        ] }), F.target, false),
      // 罠：柵が開いて殺到した所へ、中の二の構えの鉄砲と、六文銭の旗の下から打って出た槍。持ちこたえる
      this.holdStep(DP.hold({ at: { x: 8, z: C.z + FENCE_R + 14 }, dur: 50, r: 14, noRefill: true, obj: '持ちこたえろ',
        waves: [
          { t: 4, say: ['足軽', '六文銭の旗！　真田が丸から打って出た！'], foes: () => [{ name: '真田大助の隊', from: PORT(1), list: [{ type: 'busho', n: 1, o: { name: '真田大助', horse: true, hat: 'kabuto_sanada', haori: 0x7a1a12 } }, uS(5), uA(9), uG(2)], noRout: 50, seek: 130, dmg: 0.4 }] },
          { t: 10, say: ['足軽', '西の口からも！　伊木遠雄の隊じゃ！'], foes: () => [{ name: '伊木遠雄の隊', from: PORT(-1), off: { x: -10, z: 0 }, list: [{ type: 'busho', n: 1, o: { name: '伊木遠雄', horse: true, hat: 'kabuto_m' } }, uS(4), uA(8)], noRout: 40, seek: 130, dmg: 0.4 }] },
          { t: 34, say: ['山崎長徳', '押し戻される……！　ここまで来たのに！'], foes: () => { F.volT = rt.t + 0.5; return []; } },
        ] }), 50),
    ], (rt2) => this.collapse(rt2));
  },

  // 最大の攻めの始まり：柵を破る組・先手・二の手が同時に。井伊・松平も寄せ、城内の爆発で殺到する
  fenceStart(rt) {
    const F = rt.flags;
    F.fenceT = rt.t;
    setWarStage(1);
    this.openFire(rt);
    if (!F.rams.some((g) => !gone(g))) this.newRam(rt, F.target);
    // 先手と二の手は柵の前に横一列に並び、前の者が詰まって後ろから押される形に（九4）。鉄砲は塀を撃って援ける
    for (const g of [F.yam, F.second]) if (!gone(g)) { g.formation = 'line'; g.facing = Math.PI; g.width = 22; g.fire = true; }
    rt.say('山崎長徳', '今度こそじゃ！　鉄砲、放て！　柵を破る組、かかれっ！', 3.4);
    // 井伊・越前松平は前田の抜け駆けと見て、遅れまいと爆発より前に寄せ始めた（専門家の目 11/6）
    rt.after(6, () => {
      if (F.ending || F.blasted || F.step !== 5) return;
      F.surge.forEach((g, i) => { if (gone(g)) return; g.fixed = false; g.order = 'move'; g.dest = polar(-1.2 - i * 0.35, FENCE_R + 26); g.anchor = g.dest; });
      rt.say('足軽', '西の井伊と越前の勢も寄せてくる！', 3);
    });
    rt.after(18, () => { if (F.step === 5) this.blast(rt); });
  },

  // 塀・櫓・堀の内の鉄砲が撃ち始める（一度だけ）
  openFire(rt) {
    const F = rt.flags;
    if (F.fireOn) return;
    F.fireOn = true; F.fireT = rt.t; F.ak0 = F.ak || 0;
    // 引きつけてから：寄せが近づいて撃ち始めた時は、すぐに一斉射
    F.volT = rt.t + (F.holdFire ? 0.6 : 5);
    for (const g of F.fireGroups) g.fire = true;
    if (!F.holdFire) rt.say('塀の上の声', '引きつけよ。まだ撃つな……', 3);
  },

  // 城の中で火薬が爆ぜる → 内応の合図と思い込んだ井伊・松平が堀へ殺到（必ず）
  blast(rt) {
    const F = rt.flags;
    if (F.blasted || F.ending) return;
    F.blasted = true;
    sfx('thunder', 1); sfx('volley', 0.7);
    // 爆ぜたのは丸の西、惣構の八丁目口（石川康勝の持ち口の火薬。『山口休庵咄』）
    for (let i = 0; i < 8; i++) rt.army.smoke(HACHI.x + (Math.random() - 0.5) * 24, rt.world.heightAt(HACHI.x, HACHI.z) + 6 + Math.random() * 8, HACHI.z + (Math.random() - 0.5) * 10, 0, 1);
    if (rt.world.addFire) rt.world.addFire(HACHI.x, HACHI.z - 4, { h: 10 });
    rt.say('足軽', '西の惣構で火が上がった！　内応じゃ、裏切りの合図じゃ！', 3.5);
    rt.after(3.5, () => rt.say('井伊直孝', '遅れるな！　赤備え、堀へかかれ！', 3));
    rt.after(7, () => rt.say('松平忠直', '越前勢、井伊に先を越させるな！', 3));
    F.surge.forEach((g, i) => { if (gone(g)) return; g.fixed = false; g.aggro = 6; g.order = 'move'; g.dest = polar(-1.1 - i * 0.35, MOAT.r1 + 2); });
  },

  // 一斉射撃（塀と櫓の鉄砲が揃えて放つ）。big：柵を破った直後の二の構えの近い一斉射（前列が一気に倒れる）
  volley(rt, big = false) {
    const F = rt.flags;
    // 生きた鉄砲衆だけが放つ（撃ち手がいなければ傷を出さない）
    let shooter = null;
    for (const g of [F.wallG, ...F.perch, F.inner]) {
      if (!g) continue;
      shooter = g.units.find(canShoot);
      if (shooter) break;
    }
    if (!shooter) shooter = F.towerU.find(canShoot);
    if (!shooter) return;
    F.shot++;
    sfx('volley', big ? 1.2 : 0.9);
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + i * 0.27, q = polar(a, WALL_R + 0.5);
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + (i % 2 ? 3.5 : 1.6), q.z, Math.sin(a), Math.cos(a));   // 二階造りの塀：上下二段の狭間から
    }
    if (big) for (let i = 0; i < 12; i++) { const a = -0.45 + i * 0.08, q = polar(a, STEP1.r0 + 1.4); rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 1.5, q.z, Math.sin(a), Math.cos(a)); }
    if (F.blasted) for (const x of [-34, -60, -88, -116]) rt.army.smoke(x, rt.world.heightAt(x, -98) + 2.4, -98, 0.2, 1);
    for (let i = 0; i < 6; i++) {
      const a = (i < 3 ? -1.6 : 1.6) + (i % 3 - 1) * 0.22, q = polar(a, WALL_R + 0.5);   // 横の塀の横矢
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 1.6, q.z, Math.sin(a), Math.cos(a));
    }
    rt.army.play('gun', polar(0, WALL_R), big ? 2 : 1.5);
    for (const a2 of [-0.5, 0, 0.5]) { const q = polar(a2, FENCE_R - 2); try { lethalNearMiss(rt.army, q.x, q.z, 1, 'volley', 9); } catch (e) { /* 無くても一斉射は撃つ */ } }
    let fell = 0;
    const cap = big ? 18 : 10;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u.invuln || fell >= cap) continue;
      const ru = rOf(u.pos.x, u.pos.z);
      if (ru < FENCE_R + (big ? 14 : 10) && Math.abs(angOf(u.pos.x, u.pos.z)) < SPAN && Math.random() < (big ? 0.8 : ru < FENCE_R ? 0.7 : 0.35)) { rt.army.damage(u, u.maxHp * 0.9, shooter, { kind: 'gun', pierce: true }); fell++; }
    }
    const p = rt.player.u;
    const rp = rOf(p.pos.x, p.pos.z);
    // 柵の組の竹束の陰（三歩の内）に入れば弾はほとんど当たらない（十二3）
    const cover = F.rams.some((g) => g.units.some((u) => u.alive && u.tatake && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 3 && rOf(u.pos.x, u.pos.z) < rp + 0.5));
    // 一斉射だけで討たれはしない（命を二割は残す）
    const vd = Math.min(p.maxHp * (rp < FENCE_R ? 0.24 : 0.16), p.hp - p.maxHp * 0.2);
    if (p.alive && !p.invuln && vd > 0 && p.hp > p.maxHp * 0.3 && rp < FENCE_R + 6 && Math.abs(angOf(p.pos.x, p.pos.z)) < (big ? SPAN : 0.7) && Math.random() < (cover ? 0.12 : rp < FENCE_R ? 0.7 : 0.4)) rt.army.damage(p, vd, shooter, { kind: 'gun' });
    if (F.blasted) for (const g of F.surge) if (!gone(g)) g.morale -= 12;
    if (F.shot === 1) rt.say('塀の上の声', '今じゃ、放て！', 2.4);
    else if (F.shot === 2) rt.say('足軽', '前の者が……馬も倒れた！　身を低くせよ！', 3);
    else if (F.shot === 4) rt.say('足軽', '空堀で足が止まる……固まった所を撃たれる！', 3.2);
  },

  // 柵が破れた → 罠（必ず）：中の二の構えが立ち上がり近い一斉射、続いて真田が打って出る
  trap(rt) {
    const F = rt.flags;
    if (F.trapped || F.ending) return;
    F.trapped = true; F.trapT = rt.t;
    rt.say('足軽', '柵が開いた！　中が見える……入れるぞ！', 2.6);
    // 後の手も破れ口へ殺到する
    for (const g of [...(F.waves || []), F.yam, F.second]) if (!gone(g)) { g.anchor = polar((Math.random() - 0.5) * 0.2, FENCE_R + 2); g.order = 'hold'; }
    rt.after(2.4, () => {
      if (F.ending) return;
      // 二の構え：空堀の上の段で伏せていた鉄砲衆（外からは見えなかった。「まだこんなにいたのか」）
      const n = Math.max(6, Math.min(16, LIVE_MAX - liveN(rt) - 2));
      const q = polar(0, STEP1.r0 + 1.2);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '二の構えの鉄砲衆', anchor: q, fixed: true, facing: 0, width: 14, spacing: 1.2, aggro: 0, noRout: true }, dress([uS(1), uG(n - 1)], SANADA));
      g.fire = true; g.dmgMult = 0.4;
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4;
      F.inner = g; F.fireGroups.push(g);
      rt.say('塀の上の声', '二の構え、立て！　放てっ！', 2.4);
      this.volley(rt, true);
      F.volT = rt.t + 6;
      rt.after(3, () => rt.say('足軽', '罠じゃ……！　中にまだこんなに鉄砲が！', 3));
      rt.after(5, () => this.sortie(rt));
    });
  },

  // 真田の打って出（必ず）。外へ出るのはこの時が初めて
  sortie(rt) {
    const F = rt.flags;
    F.sortieT = rt.t;
    setWarStage(2);   // 真田が打って出る：低音と太鼓が前へ
    rt.unmark('fence');
    revealName(rt, '真田大助'); revealName(rt, '伊木遠雄');
    sfx('taiko', 1); sfx('horagai', 0.7);
    for (const g of F.rams) if (!gone(g)) withdraw(g, { x: 18, z: RETREAT.z + 14 });
    for (let i = 0; i < 10; i++) rt.world.addCarrion(C.x + (Math.random() - 0.5) * 70, C.z + MOAT.r1 + Math.random() * 10);
  },

  // ⑥ 徳川の崩れ：使番「攻撃中止！」で任務が攻略から撤収へ。一斉に下がるので退き道が詰まる
  collapse(rt) {
    const F = rt.flags;
    F.step = 6; F.retreatOrder = true;
    rt.say('使番', '攻撃中止！　大御所様の下知、力攻めはやめよ、寄せ手は引き揚げよ！', 4);
    rt.after(4.4, () => rt.say('山崎長徳', '攻撃中止だ！　負傷者を運べ！', 3));
    for (const g of F.surge || []) if (!gone(g)) withdraw(g, { x: g.anchor.x, z: RETREAT.z + 20 });
    [...(F.waves || []), ...(F.jam || [])].forEach((g, i) => { if (!gone(g)) withdraw(g, { x: RETREAT.x - 24 + (i % 4) * 16, z: RETREAT.z + 14 }); });
    for (const g of [F.yam, F.second]) if (!gone(g)) { g.fire = false; withdraw(g, { x: RALLY.x + (g === F.yam ? -8 : 8), z: RALLY.z + 6 }); }
    this.steps(rt, [
      this.minEl(DP.move({ to: RALLY, label: '篠山の北の麓', r: 9, max: 160, obj: STAGES.k11_sanadamaru[5][0],
        say: [['足軽', '下がれ、下がれっ！　後ろが詰まって退けぬ！', 3]] }), 45, '篠山の北の麓'),
    ], (rt2) => this.withdraw(rt2));
  },

  // ⑦ 撤収戦：取り残された味方を救い（全員を救おうとすると危ない）、竹束の陣まで退く。真田は鉄砲と小さな追い討ちで押すだけ
  withdraw(rt) {
    const F = rt.flags;
    F.step = 7; F.backT = rt.t;
    setWarStage(0);
    // 麓で殿を務めた先手と二の手も、最後は竹束の陣へ戻す。
    for (const g of [F.yam, F.second]) if (!gone(g)) withdraw(g, { x: RETREAT.x + (g === F.yam ? -8 : 8), z: RETREAT.z + 6 });
    rt.say('山崎長徳', '柵の前にまだ味方が残っておる！　救える者は救え。じゃが深入りはするな', 4);
    F.stranded = (F.stranded || []).filter((g) => !gone(g));
    for (const [a, r, nmx] of [[-0.42, FENCE_R + 10, '取り残された前田の組'], [0.48, FENCE_R + 12, '取り残された本多の組']]) {
      if (F.stranded.length >= 2 || liveN(rt) + 6 > LIVE_MAX) break;
      const q = polar(a, r);
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: q, facing: Math.PI, width: 4, aggro: 6, noRout: true }, dress([uS(1), uA(5)], MAEDA));
      for (const u of g.units) u.hp = u.maxHp * 0.5;
      F.stranded.push(g);
    }
    rt.after(6, () => { if (F.step === 7 && !F.ending) rt.say('足軽', '真田の鉄砲がまだ撃ってくる……追うては来ぬが', 3); });
    const pr = Math.min(8, LIVE_MAX - liveN(rt) - 2);
    if (pr >= 4) {
      const q = PORT(1);
      const g = enemyGroup(rt, { faction: 'toyotomi', name: '追い討ちの真田の鉄砲', anchor: q, facing: 0, width: 6, aggro: 8, noRout: true, order: 'attack', seekRange: 40 }, dress([uS(1), uG(pr - 1)], SANADA));
      g.fire = true; g.dmgMult = 0.4; g.sortie = true;
    }
    this.steps(rt, [
      this.minEl(DP.move({ to: { x: RETREAT.x, z: RETREAT.z - 4 }, label: '竹束の陣', r: 9, max: 220, obj: STAGES.k11_sanadamaru[6][0],
        say: [['山崎長徳', '退け！　退けっ！　手負いを担いで竹束の陣まで下がれ！']] }), 75, '竹束の陣'),
    ], (rt2) => this.win(rt2));
  },

  // 救援の下知と撤収完了を分け、陣まで戻った生存者だけを戦功に数える。
  rescueTick(rt) {
    const F = rt.flags;
    if (F.step !== 7) return;
    let saved = 0;
    for (const g of F.stranded || []) {
      if (gone(g)) continue;
      if (!g.rescuing) {
        const c = g.center(), p = rt.player.u;
        if (!p.alive || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) >= 7) continue;
        g.rescuing = true;
        withdraw(g, { x: RETREAT.x + 8, z: RETREAT.z + 6 });
        rt.say('足軽', 'か、かたじけない……！', 2.4);
      }
      for (const u of g.units) {
        if (u.alive && !u.gone && Math.hypot(u.pos.x - (RETREAT.x + 8), u.pos.z - (RETREAT.z + 6)) < 12) saved++;
      }
    }
    F.saved = saved;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step !== 7 || Math.hypot(rt.player.u.pos.x - RETREAT.x, rt.player.u.pos.z - (RETREAT.z - 4)) > 9) return;
    this.rescueTick(rt);
    F.ending = true;
    F.returned = true;
    rt.setPhase('end');
    const saved = F.saved || 0;
    rt.award((t) => { t.special = { label: saved ? `撤収の殿で味方 ${saved}人を救った` : '真田丸の前で殿を務めた', pts: 40 + saved * 4 }; }, '味方を退かせ、生きて戻った');
    rt.player.u.invuln = true;
    F.victoryShown = true;   // 勝鬨と勝ちの音は上げない（札は「務めを果たした」）
    rt.banner('真田丸 攻略 失敗', '徳川軍 撤収　任務 味方部隊撤収 達成');   // 合戦の結果と任務の結果を分ける
    rt.say('山崎長徳', '……攻め方を変えても、全部読まれておった。一歩も取れなんだ', 4.4);
    rt.after(4.6, () => rt.say(nm(rt), '振り返ると……六文銭の旗が、まだ立っている', 3.4));
    rt.after(8.4, () => rt.say('使番', '大御所様より：力攻めは無理だ。あの出丸は捨て置け', 3.4));
    // 続けて冬の陣の中間の場面（大筒・和議・堀が埋まる・丸の破却。k11/wagi.js）
    rt.after(12, () => {
      setWarStage(3);
      const w = wagi(rt, { C, polar, MOAT, SPAN, FENCE_R, maru: F.maruObjs, osaka: F.osaka });
      rt.after((w && w.end) || 1, () => {
        rt.award((t) => { t.main = true; });
        rt.obj('main', STAGES.k11_sanadamaru[6][0], 'main');
        rt.objDone('main'); rt.finish({ scriptedEnd: true }, 0);
      });
    });
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    const k = Math.max(0, Math.min(6, (F.step || 1) - 1));
    if (!rt.objectives.some((o) => o.id === 'main')) rt.obj('main', STAGES.k11_sanadamaru[k][0], 'main');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('退き口を失った', '寄せ手は堀の前で崩れた');
    rt.say('山崎長徳', '退き口が……！　皆、散り散りに逃げよ！', 4);
    rt.finish({ failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 櫓の射手は櫓の床に立たせ、床から動かさない（11/6 BV の写真で塀の上に浮いた）
    for (const u of F.towerU) {
      if (!u.alive) continue;
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + 2.5;
      u.pos.x = u.tower.x; u.pos.z = u.tower.z; u.pos.y = y;
      u.mesh.position.y = y;
    }
    // 塀の上に立った信繁は動かない
    if (F.nobuShown) { const u = F.nobu.units.find((q) => q.name === '真田信繁'); if (u && u.alive && u.anchorPos) { u.pos.x = u.anchorPos.x; u.pos.z = u.anchorPos.z; } }
    if (F.ending) return;
    depthTick(rt, dt);
    this.sasaTick(rt);
    F.slowT = (F.slowT || 0) - dt;
    const slow = F.slowT <= 0;
    if (slow) {
      F.slowT = 0.4;
      // 真田は近づくまで撃たない：寄せ手（本人・先手・二の手）が柵の十五歩まで来たら撃ち始める
      if (!F.fireOn && F.begun && F.step >= 2) {
        let rmin = rOf(rt.player.u.pos.x, rt.player.u.pos.z);
        for (const g of [F.yam, F.second]) if (!gone(g)) { const c = g.center(); rmin = Math.min(rmin, rOf(c.x, c.z)); }
        if (rmin < FENCE_R + 15) this.openFire(rt);
      }
      // 篠山の段の前でも、丸に近づいた主人公は撃たれる（段より先に一人で寄っても無双させない）
      if (!F.fireOn && F.begun && F.step < 2 && rOf(rt.player.u.pos.x, rt.player.u.pos.z) < FENCE_R + 22) this.openFire(rt);
      // 砦を守る AI：打って出た兵は、柵から四十歩より先へは追わず、口へ戻って口を守る
      for (const g of rt.army.groups) {
        if (g.team !== 1 || !g.count || g.routed || g.home) continue;
        if (g.order !== 'attack' || (g.seekRange || 0) < 40) continue;
        const c = g.center();
        if (rOf(c.x, c.z) > FENCE_R + 40 || (F.step >= 6 && rt.t - (F.backT || F.sortieT || rt.t) > 20)) {
          g.home = true; g.focus = null; g.keepMoveOrder = true; g.aggro = 0;
          g.order = 'move'; g.dest = PORT(c.x < C.x ? -1 : 1); g.anchor = g.dest;
          for (const u of g.units) { u.target = null; u.aiT = 0; }
        }
      }
      this.rescueTick(rt);
    }
    // 塀と櫓の鉄砲は、柵の前の寄せ手の群れを狙う（横矢）
    F.aimT = (F.aimT || 0) - dt;
    if (F.aimT <= 0 && F.fireOn) {
      F.aimT = 1.5;
      const pool = [...(F.surge || []), ...F.rams, ...(F.waves || []), ...(F.jam || []), ...(F.stranded || []), F.second, F.yam].filter((g) => g && g.count);
      const P = rt.player.u;
      for (const sg of F.fireGroups) {
        if (!sg || !sg.count) continue;
        const c = sg.center();
        let best = null, bd = 58;
        for (const g of pool) for (const u of g.units) if (u.alive) { const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z); if (d < bd) { bd = d; best = u; } }
        // 近づいた主人公は必ず狙う（十四8）。出世するほど狙われる（一4）
        const dp = P.alive ? Math.hypot(P.pos.x - c.x, P.pos.z - c.z) : 1e9;
        if (dp < 62 && (dp < 30 || Math.random() < 0.55 + 0.05 * Math.min(6, rt.G?.rank || 0))) best = P;
        sg.focus = best;
      }
    }
    // 櫓の鉄砲は、丸の前に出た主人公を狙い撃つ（十四8）。弾は本物の玉で、竹束・柵・塀に当たれば止まる
    F.snipeT = (F.snipeT || 0) - dt;
    const PU = rt.player.u;
    if (F.fireOn && F.snipeT <= 0 && PU.alive && !PU.invuln) {
      const rp = rOf(PU.pos.x, PU.pos.z), ap = Math.abs(angOf(PU.pos.x, PU.pos.z));
      if (rp < 64 && ap < SPAN + 0.1 && PU.hp > PU.maxHp * 0.22) {   // 深手（二割余り）の者は狙い撃たず、退いて手当てする間を残す
        F.snipeT = ((rp < 55 ? 0.85 : 1.4) + Math.random() * 0.5) * (PU.hp < PU.maxHp * 0.35 ? 2.2 : 1) * (F.step === 3 && !gone(F.flankG) || F.step === 5 && !F.trapped ? 2 : 1);   // 柵を打つ間も（11/10 bot act：⑤で塀と櫓の玉に倒れた）   // 横の鉄砲衆と斬り合う間は、櫓の狙いを間遠に   // 深手の時は間を空け、退く間を残す（十一1）
        const ready = F.towerU.filter((u) => canShoot(u) && rt.t - (u.snipeAt ?? -9) > 2.6 && Math.hypot(u.pos.x - PU.pos.x, u.pos.z - PU.pos.z) < 75);
        ready.sort((a, b) => Math.hypot(a.pos.x - PU.pos.x, a.pos.z - PU.pos.z) - Math.hypot(b.pos.x - PU.pos.x, b.pos.z - PU.pos.z));
        const u = ready[Math.floor(Math.random() * Math.min(8, ready.length))];
        if (u) { u.snipeAt = rt.t; u.heading = Math.atan2(PU.pos.x - u.pos.x, PU.pos.z - u.pos.z); rt.army.fireGun(u, PU); }
      } else F.snipeT = 0.8;
    }
    // 塀の内の鉄砲・弓は玉薬と矢を運び込まれて、撃ち止まない（BV「鉄砲・弓が止まず」）
    F.ammoT = (F.ammoT || 0) - dt;
    if (F.ammoT <= 0) {
      F.ammoT = 4;
      for (const g of F.fireGroups) if (g) for (const u of g.units) if (u.alive) { if (u.gunAmmo !== undefined) u.gunAmmo = 20; if (u.arrowAmmo !== undefined) u.arrowAmmo = 24; }
    }
    // 塀の上の筒音と矢の音：狭間から撃つ音が絶えない
    if (F.fireOn && F.step >= 2) {
      F.popT = (F.popT || 0) - dt;
      if (F.popT <= 0) {
        F.popT = 0.5 + Math.random() * 1.1;
        let firing = F.wallG.units.some(canShoot) || F.towerU.some(canShoot);
        if (!firing) for (const g of F.perch) if (g.units.some(canShoot)) { firing = true; break; }
        if (firing) {
          const a = (Math.random() - 0.5) * 3.4, q = polar(a, WALL_R + 0.4);
          rt.army.play('gun', q, 0.7 + Math.random() * 0.5);
          rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 1.7, q.z, Math.sin(a), Math.cos(a));
          if (Math.random() < 0.35) sfx('arrowRain', 0.45);
        }
      }
    }
    // 破る柵：打たれるたびに揺れ、木屑が飛び、傷むほど外へ傾く（十四5）。西の柵は三割で真田の予備が押し返し、傾いたまま残る（成果は残る）
    for (const T of [F.target, F.target2]) {
      if (!T || !T.mesh || !T.alive) continue;
      if (T === F.target2 && F.clamp && F.breakT === T && !T.invuln && T.hp < T.maxHp * 0.3) { T.hp = T.maxHp * 0.3; T.invuln = true; }
      const hit = T.hp < T.lastHp - 0.5;
      if (hit) { T.shakeT = 0.35; T.lastHp = T.hp; const q = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 }; rt.army.spark?.(q.x, rt.world.heightAt(q.x, q.z) + 1.1, q.z, 4); }
      T.shakeT = Math.max(0, (T.shakeT || 0) - dt);
      const lean = (1 - T.hp / T.maxHp) * 0.42 + Math.sin(rt.t * 40) * T.shakeT * 0.12;
      T.mesh.quaternion.setFromAxisAngle(T.mesh.userData.axis, lean);
    }
    // 最大の攻め：前田・本多の後の手が竹束の陣から次々に柵へ寄せ、撃たれて倒れる（攻め手は一万を超える。十四6）
    if (F.step === 5 && !F.trapped) {
      F.waveT = (F.waveT ?? 4) - dt;
      if (F.waveT <= 0 && liveN(rt) + 27 <= LIVE_MAX) {
        F.waveT = 16;
        F.waves = (F.waves || []).filter((g) => g.count);
        const k = F.waveN = (F.waveN || 0) + 1, x0 = [-34, 26, -8, 40, -22][k % 5];
        const g = allyGroup(rt, { faction: 'tokugawa', name: k % 2 ? '前田の後の手' : '本多の後の手', anchor: { x: x0, z: RETREAT.z + 8 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'line', speed: 3.6 },
          dress([uS(2), uA(18), uG(4), uB(3)], MAEDA));
        const a = Math.max(-0.85, Math.min(0.85, angOf(x0, 0) * 0.6 + (Math.random() - 0.5) * 0.3));
        g.order = 'move'; g.dest = polar(a, FENCE_R + 3); g.anchor = g.dest;
        F.waves.push(g);
        if (k === 1) rt.say('足軽', '後の手が竹束の陣から次々に寄せてくる……！', 3);
      }
      // 柵の前に着いた後の手は、近くの柵に取り付いて打ち続ける（柵の前で突っ立たない。BV）
      for (const g of F.waves || []) {
        if (!g.count || g.order !== 'move' || !g.dest) continue;
        const c = g.center();
        if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 7) continue;
        let seg = null, nearest = Infinity;
        for (const f of F.fence) {
          if (!f.alive || f.invuln) continue;
          const d = Math.hypot((f.seg[0] + f.seg[2]) / 2 - c.x, (f.seg[1] + f.seg[3]) / 2 - c.z);
          if (d < nearest) { nearest = d; seg = f; }
        }
        if (seg) { g.order = 'assault'; g.assault = () => (seg.alive ? seg : F.target.alive ? F.target : null); for (const u of g.units) u.aiT = 0; }
      }
    }
    // 真田大助と伊木遠雄は、近くの主人公に馬を寄せて斬りかかる（十四8）
    if (F.trapped && F.step <= 6) for (const u of rt.army.units) {
      if (!u.alive || u.team !== 1 || (u.name !== '真田大助' && u.name !== '伊木遠雄') || !u.group || u.group.home) continue;
      const P = rt.player.u, d = Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z);
      if (P.alive && d < 26) u.group.focus = P; else if (u.group.focus === P) u.group.focus = null;
    }
    if (F.fireOn && F.step >= 2 && rt.t > F.volT) { F.volT = rt.t + (F.step <= 5 ? 9 : 13) + Math.random() * 3; this.volley(rt); }
    // 柵を打つ段：竹束を持つ者が倒れた時も、次の組を補う
    const T = F.breakT;
    if (F.breaking && T && T.alive && !T.invuln) {
      let left = 0, covered = false;
      // 前の攻めから退いた組や戦闘不能の者は、今の柵を打つ人数に数えない。
      for (const g of F.rams) {
        if (gone(g) || g.far) continue;
        for (const u of g.units) {
          if (!u.alive || u.gone || u.fleeing || u.woundOut) continue;
          left++; if (u.tatake) covered = true;
        }
      }
      if ((left < 4 || !covered) && rt.t - (F.ramT ?? -99) > 8 && this.newRam(rt, T)) { F.ramT = rt.t; rt.say('山崎長徳', '柵の者が討たれた！　次の者、行けっ！', 3); }
    }
  },

  onKill(rt, v) {
    // 柵の破壊は兵の討死ではない。兵数の棒と亡骸には加えない。
    if (v.isStruct) return;
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    // 将を討っても、柵破り・殿・帰陣の務めは飛ばさない。
    if (v.name === '真田信繁' && !F.ending) { rt.say(nm(rt), '真田左衛門佐、討ち取ったり！', 3); return; }
    if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　真田の者が担いで丸へ引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (F.surge && F.surge.includes(g)) rt.say('足軽', `${g.name}が堀から逃げ戻ってくる……ひどい討たれようじゃ`, 3.5);
    // 新手の組に大助・伊木はいない（名のある将は二人に増やさない）。「新手の真田大助の隊」と、もう一人の大助がいるように言わない
    else if (g.team === 1 && g.name && g !== F.sasa) rt.say('足軽', g.name.startsWith('新手の') ? '真田の新手も丸へ引いていく！' : `${g.name}が丸へ引いていく！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.target) return;
    rt.scene.add(stumps(rt.world, s.seg));
    sfx('wood', 1.2);
    rt.unmark('fence');
    rt.award((t) => t.side.push('真田丸の柵を破った'), '真田丸の柵を破った');
    this.trap(rt);
  },
};

// 両軍の総勢：大坂を囲む徳川方およそ二十万のうち、真田丸の前に並んだ前田・井伊・松平らを三万。真田丸の兵は五千ほど
k11_sanadamaru.force = (rt) => {
  const F = rt.flags;
  const shot = (F.shot || 0) * 180 + (F.trapped ? Math.min(1, (rt.t - (F.trapT || rt.t)) / 40) * 1500 : 0);
  return { a: Math.max(0, Math.round(30000 - (F.ak || 0) * 30 - shot)), a0: 30000, b: Math.max(0, 5000 - (F.ek || 0) * 12), b0: 5000 };
};
k11_sanadamaru.sides = { a: { name: '徳川方', mon: 'tokugawa' }, b: { name: '豊臣方 真田丸', mon: 'sanada' } };
k11_sanadamaru.date = (rt) => `慶長十九年（1614）十二月四日　冬・${rt.t < 60 ? '夜明けの靄' : '朝'}`;
k11_sanadamaru.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
k11_sanadamaru.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k11_sanadamaru.history = '慶長十九年（1614）の大坂冬の陣で、真田信繁は大坂城の南、惣構の外に出丸を築いた。のちに真田丸と呼ばれる。外に柵、その内に空堀、土塁の上に塀と櫓を備え、塀の内から鉄砲が並んだ。十二月四日、前の篠山から真田の鉄砲に妨げられていた前田利光（のちの利常）の兵が篠山へ寄せたが、真田の兵はすでに引いていた。挑発に乗った前田勢は丸の空堀まで押し寄せ、塀と櫓から撃たれて大きく損じた。城内で火薬が爆ぜたのを内応の合図と思い込んだ井伊直孝・松平忠直の兵も堀へ殺到し、同じく撃ち崩された。徳川方の損害は数千とも伝わるが、数には諸説がある。この後、家康は力攻めをやめ、大筒で城を撃って和議へ持ち込んだ。\n丸の寸法は遊びのために縮めて復元したもので、形（半円か方形か）には諸説がある。篠山の位置と挑発の言葉は伝えによる。';
k11_sanadamaru.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '真田大助', g: /大助/ }, { name: '伊木遠雄', g: /伊木/ }];

// 素直な遊び手：段の的へ。柵の内や堀の底へは入らない
k11_sanadamaru.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, SASA.x - 6, SASA.z + 58, 3);
};

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
// 段の字は戦の中の目標の字と同じ（場所と行い。右上・終わりの札で言い替えない。十1）
STAGES.k11_sanadamaru = [['篠山の頂まで登れ'], ['正面から真田丸へ進め', st(2)], ['真田丸の西へ回り込め', st(3)], ['真田丸の柵前で前線を整理せよ', st(4)], ['真田丸を突破せよ', st(5)], ['篠山の北の麓へ味方を退かせろ', st(6)], ['攻撃を中止し、味方を竹束の陣へ撤収させろ', st(7)]];

export { k11_sanadamaru };
export default k11_sanadamaru;
