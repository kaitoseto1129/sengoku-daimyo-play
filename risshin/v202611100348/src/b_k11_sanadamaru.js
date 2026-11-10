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
const PORT = (s) => polar(s * GATE, FENCE_R + 1);   // 丸の左右の口（真田はここから打って出る）

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
  resumeSteps: [[1, 'begin'], [2, 'taunt'], [3, 'fenceStart'], [4, 'sortie'], [5, 'fallBack']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
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
  goalVisibleRows: 5,
  nearbyAllySignLimit: 0,      // 味方の頭上に白い丸を出さない（意味の分からない印。五2）
  noFlankCry: true,            // 撃ち崩された寄せ手に、共通の側面攻撃の声を重ねない。
  // 見出しの札は終わりと討ち取りだけ（「敵の隊が崩れた」や段の見出しは案内の字。kaito 五1）。流れは台詞と動きで分かる
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  minutes: 14,
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
      ...wallLine(rt, arc(FENCE_R, -SPAN + 0.1, -0.05, 46), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, 0.05, SPAN - 0.1, 46), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
    ];
    // 破る柵：正面の一間。鉤縄を掛け、打つと揺れて傾く（どこを・どう倒すかが一目で分かる。十四5）
    F.target = wallLine(rt, arc(FENCE_R, -0.05, 0.05, 1), { team: 1, hp: 520, name: '真田丸の柵', segLen: 6, mesh: hookFence })[0];
    F.target.armor = 0.2; F.target.lastHp = F.target.hp;
    F.fence.push(F.target);
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
    F.wallG.fire = false;
    for (const u of F.towerU) u.group.fire = false;

    rt.world.setTime('morning');
    // 靄の朝は日が薄い：くっきりした木漏れ日の影を落とさない（11/6 遊んだ。八1）
    if (rt.world.sun) rt.world.sun.intensity *= 0.55;
    if (rt.world.hemi) rt.world.hemi.intensity *= 1.15;
    this.goalsHud(rt);
    rt.setPhase('brief');
    rt.obj('main', '篠山の頂まで登れ', 'main');
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
      check: (rt) => (k < 4 ? (rt.flags.step || 0) >= k + 2 : !!rt.flags.returned) }));
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

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    // 11/9 二巡（豊臣A）：始まりの「篠山の頂まで登れ」が段の札（dp）と並んで戦の終わりまで残り、右上が「篠山の頂まで登れ／柵を破る組と…」の二行になった。段の札に任せる（締めで作り直す）
    rt.objRemove('main');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // backing: false … 段の敵の後ろに見せかけの控えを付けない（AA）。数は本物の兵で出す
    // fixedSpawn：打って出る兵は丸の左右の口から出る（見えない所から湧かせない。11/6 遊んだ：大助の隊が遠くで湧いて竹束の陣まで来なかった。九2）
    const ctx = { faction: 'toyotomi', flag: 'sanada', armor: SANADA.armor, dmg: 0.4, mass: 0, backing: false, scale: 1.2, fixedSpawn: true, look: (l) => dress(l, SANADA),
      // 帰陣の段は fallBack の移動命令を守る。共通の move が先手を「持ち場を守れ」に戻さない。
      friends: () => F.step >= 5 ? [] : [F.yam, F.second].filter((g) => g && g.count && !g.routed), botSeek: 40,
      // 素直な遊び手：③は目の前に敵がいなければ柵へ寄り、柵の方を向いて打つ（持ち場で南を向いて立ち尽くさない。九7）
      botSteer: (b, inp) => {
        const T = F.target, u = b.player.u;
        // 通し確認：鉄砲のまま槍の間合いへ入らない。近くの敵への受けと反撃は共通の判断を守る。
        const foe = b.army.nearestEnemy(u, 4, (o) => !o.isStruct && !o.noTarget && !o.woundOut && !o.fleeing && !o.invuln && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
        if (foe) {
          if (b.player.weapon === 'gun' || b.player.weapon === 'bow') inp.e.add('Digit1');
          return;
        }
        if (F.step !== 3 || !T || !T.alive) return;
        // 柵へ向き直っても古い敵への注視や構えが残ると、南を向いたり短い払いになって届かない。
        if (b.player.lock) inp.e.add('KeyQ');
        if (b.player.weapon !== 'spear') inp.e.add('Digit1');
        inp.guardHold = false;
        const fx = (T.seg[0] + T.seg[2]) / 2, fz = (T.seg[1] + T.seg[3]) / 2;
        // 柵へ一人で突っ込まず、柵に取り付く竹束の南側へ寄る。近い束を一つ選ぶだけで、配列を毎コマ作らない。
        let cover = null, best = Infinity;
        for (const g of F.rams) for (const a of g.units) {
          if (!a.alive || !a.tatake || a.fleeing || a.woundOut || a.pos.z < fz || Math.hypot(a.pos.x - fx, a.pos.z - fz) > 12) continue;
          const d = Math.hypot(a.pos.x - u.pos.x, a.pos.z + 1.6 - u.pos.z);
          if (d < best) { best = d; cover = a; }
        }
        if (inp.leftPressed && !cover) return;
        const tx = cover ? cover.pos.x : fx, tz = cover ? cover.pos.z + 1.6 : fz + 1.2, d = Math.hypot(tx - u.pos.x, tz - u.pos.z);
        if (cover && d > 0.8) {
          inp.leftPressed = false;
          b.player.yaw = Math.atan2(tx - u.pos.x, tz - u.pos.z);
          inp.k.add('KeyW');
          return;
        }
        // 柵の端に付いた竹束の陰でも打てる。中央までの距離では、届く端を前にして止まり続ける。
        const vx = T.seg[2] - T.seg[0], vz = T.seg[3] - T.seg[1];
        const along = clamp01(((u.pos.x - T.seg[0]) * vx + (u.pos.z - T.seg[1]) * vz) / (vx * vx + vz * vz || 1));
        const ax = T.seg[0] + vx * along, az = T.seg[1] + vz * along;
        const fenceD = Math.hypot(ax - u.pos.x, az - u.pos.z);
        if (cover && fenceD > 3) { inp.k.delete('KeyW'); inp.leftPressed = false; return; }
        b.player.yaw = Math.atan2(ax - u.pos.x, az - u.pos.z);
        if (d > 2.2) inp.k.add('KeyW'); else { inp.k.delete('KeyW'); inp.leftPressed = b.player.cd <= 0 && !b.player.pending && b.player.sta >= 18; }
      } };
    depthStart(rt, ctx, [
      // ① 篠山を取る：夜明け、丘へ登る。真田の鉄砲は撃ちながら丸へ引き、頂はもぬけの殻（史実）
      DP.move({ to: { x: SASA.x, z: SASA.z }, label: '篠山', r: 7, max: 240, obj: '篠山の頂まで登れ',
        say: [['山崎長徳', '進め！　篠山の鉄砲を追い落とせ！']],
        onEnd: (rt2) => this.taunt(rt2) }),
      // ② 挑発に乗って丸の柵の前へ
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.move({ to: { x: 4, z: C.z + FENCE_R + 12 }, label: '真田丸の柵', r: 8, max: 150, obj: '真田丸の外の柵の前まで寄せよ',
        say: [['山崎長徳', 'おのれ、言わせておけば……！　柵まで寄せよ！']],
        ambush: { d: 30, say: ['足軽', '堀の内に鉄砲がずらりと……！　西の口から槍も出てきた！'], foes: () => { this.openFire(rt); return [{ name: '西の口の真田の槍', from: PORT(-1), list: [uS(2), uA(10)] }]; } },
        onEnd: (rt2) => this.fenceStart(rt2) }),
      // ③ 堀の前：柵を破る組を守り、一斉射撃と横矢に耐える。城内の爆発で井伊・松平が殺到
      DP.rest({ dur: 5, heal: 0.9 }),
      this.fenceStep(DP.hold({ at: { x: 6, z: C.z + FENCE_R + 10 }, dur: 80, r: 16, label: '柵の前', title: '堀と柵', sub: '塀と櫓から鉄砲が並ぶ',
        // 柵破りのほかに、札にない討ち取り数を満たすまで新手を足さない。
        noRefill: true,
        obj: '柵を破る組と一緒に、真田丸の柵を打ち倒せ',
        waves: [
          { t: 8, say: ['足軽', '東の口から真田の兵が出てきた！　柵を破る組を狙っておる！'], foes: () => [{ name: '東の口の真田の兵', from: PORT(1), list: [uS(2), uA(10)], mass: 160 }] },
          { t: 30, say: ['山崎長徳', '横の櫓からも撃ってくる！　竹束は柵の組だけ、楯も持たずに寄せたのが仇じゃ……堀へは降りるな！'], foes: () => { rt.flags.volT = rt.t + 1; return []; } },
          { t: 52, say: ['足軽', '西の口からもじゃ！　横を突かれる！'], foes: () => [{ name: '西の口の真田の兵', from: PORT(-1), list: [uS(2), uA(11)], mass: 180 }] },
        ],
        reward: '堀の前で踏みとどまった', onEnd: (rt2) => this.sortie(rt2) })),
      // ④ 大御所の退きの下知（使番が伝える）：大助と伊木遠雄の打って出を受けて、竹束の陣まで
      DP.rest({ dur: 5, heal: 0.9 }),
      // 11/6 遊んだ：竹束の陣（丸から 80 余り）で待つと、大助の隊は途中で味方の退き勢と当たって止まり、一度も来なかった（九2）。
      //   殿は堀から退く味方の後ろ、篠山の北の麓で受ける（打って出た真田と当たる所）
      this.holdStep(DP.hold({ at: { x: 12, z: 32 }, dur: 60, r: 14, label: '篠山の北の麓', title: '退け', sub: '大御所の下知：寄せ手は引き揚げよ',
        // 大助・伊木と追い討ちの寄せを押し返せば退く。本人の討ち取りは帰陣の条件にしない。
        noRefill: true,
        obj: '篠山の北の麓で、打って出た真田大助の隊を食い止めよ',
        waves: [
          { t: 1, say: ['足軽', '六文銭の旗！　真田が丸から打って出た！'], foes: () => [{ name: '真田大助の隊', from: PORT(1), list: [{ type: 'busho', n: 1, o: { name: '真田大助', horse: true, hat: 'kabuto_sanada', haori: 0x7a1a12 } }, uS(6), uA(10), uG(3)], noRout: 60, seek: 130, dmg: 0.4 }] },
          // 五秒の立て直しを挟んでも、伊木の出撃は十六秒後の退き命令より先にする。
          { t: 8, say: ['足軽', '西の口からも！　伊木遠雄の隊じゃ！'], foes: () => [{ name: '伊木遠雄の隊', from: PORT(-1), off: { x: -10, z: 0 }, list: [{ type: 'busho', n: 1, o: { name: '伊木遠雄', horse: true, hat: 'kabuto_m' } }, uS(4), uA(9)], noRout: 45, seek: 130, dmg: 0.4 }] },
          { t: 48, say: ['山崎長徳', '塀の上で火縄が光った！　退く者を撃っておる、急げ！'], foes: () => { rt.flags.volT = rt.t + 0.5; return [{ name: '追い討ちの真田の槍', from: PORT(1), off: { x: 12, z: 0 }, list: [uS(2), uA(8)], seek: 130, dmg: 0.4 }]; } },
        ],
        reward: '真田の打って出を食い止めた', onEnd: (rt2) => this.fallBack(rt2) }), 60),
      // ⑤ 落とせずに退く：味方と一緒に、撃たれながら竹束の陣まで（11/6 BV「最後は味方と退く所まで遊んで終わる」・十四4）
      DP.move({ to: { x: RETREAT.x, z: RETREAT.z - 4 }, label: '竹束の陣', r: 9, max: 200, obj: '味方と一緒に、竹束の陣まで退け',
        say: [['山崎長徳', '退け！　退けっ！　手負いを担いで竹束の陣まで下がれ！']] }),
    ], (rt2) => this.win(rt2));
    // 共通の放置・刻限による段飛ばしでは、登頂・柵破り・帰陣を果たしたことにしない。
    for (const s of F.dp.steps) {
      s.idleAdvance = false;
      if (s.kind === 'move') s.limit = Infinity;
    }
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

  // 持ち場を離れて敵が退くのを待つだけでは果たさない。共通の終了判定と同じ滞在時間を満たすまで待つ。
  holdStep(h, dur) {
    const tick = h.tick;
    h.limit = Infinity;
    h.tick = (rt, C, m, ctx, el, dt) => {
      // 共通の三十歩の余裕では、柵の前に残ったままでも殿を果たせてしまう。
      // 八歩の余裕でも柵の前まで届くので、指定した持ち場の内だけを数える（柵の段にも同じ判定）。
      const p = rt.player.u.pos;
      if (rt.player.u.alive && Math.hypot(p.x - C.at.x, p.z - C.at.z) < C.botRadius) C.sanadaHoldT = (C.sanadaHoldT || 0) + dt;
      const done = tick(rt, C, m, ctx, el, dt);
      return done && (C.sanadaHoldT || 0) >= dur * 0.45;
    };
    return h;
  },

  // 柵の段：守る刻が過ぎても、柵を打ち倒すまでは済まない（時間で勝手に進めない。AB）。札に柵の残りを出す
  fenceStep(h) {
    this.holdStep(h, 80);
    const start = h.start;
    h.start = (rt, C, m, ctx) => {
      start(rt, C, m, ctx);
      // 持ち場の印と破る柵の印を重ねない。柵が既に倒れていれば持ち場の印を使う。
      if (rt.flags.target.alive) rt.unmark('dp');
    };
    const t0 = h.tick;
    h.max = 360;
    h.limit = Infinity;
    h.tick = (rt, C, m, ctx, el, dt) => {
      const done = t0(rt, C, m, ctx, el, dt), T = rt.flags.target;
      if (!T.alive) return done;
      rt.objProgress('dp', `柵 残り${Math.max(1, Math.ceil(T.hp / T.maxHp * 100))}%`);
      return false;
    };
    return h;
  },

  // 篠山はもぬけの殻。真田の兵の挑発（必ず）
  taunt(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.say('足軽', '頂は空じゃ……真田の兵は丸へ引いておった', 3);
    rt.after(3.2, () => rt.say('真田の兵', '篠山で雉狩りか！　暇ならこの丸へ来てみよ！', 4));
    rt.after(7.6, () => rt.say('足軽', 'あいつら、笑うておる……', 2.6));
    // 利光は軍令違反と見て引き戻そうとしたが、先手は止まらなかった（専門家の目 11/6。docs/battle_learn）
    rt.after(10.5, () => { if (!F.ending && F.step <= 3) rt.say('前田の使番', '殿より！　丸へは寄せるな、仕寄りへ戻れとの仰せ！', 3.4); });
    rt.after(14.2, () => { if (!F.ending && F.step <= 3) rt.say('山崎長徳', 'ここまで笑われて戻れるか！　前の者はもう柵に取り付いておる！', 3.6); });
  },

  // 柵の前：柵を破る組が柵にとりつく。塀と櫓が撃ち始める（一斉射撃）
  fenceStart(rt) {
    const F = rt.flags;
    F.step = 3; F.fenceT = rt.t;
    // 11/9 徳川C（見回り）：③で本人が塀の下に一分半とどまると、塀の内と櫓の弾で必ず倒れた（bot 中学生：櫓48・塀の内46）。
    //   一斉射撃は味方の寄せ手を薙ぐ場面なので組の強さは変えず、③の間だけ本人の受ける傷を半分にする
    if (!F.k11Shield) {
      F.k11Shield = true;
      const pl = rt.player, td = pl.takeDamage.bind(pl);
      pl.takeDamage = (a, src) => td(F.step === 3 && src && src.team !== pl.u.team ? a * 0.5 : a, src);   // 東の口の新手の槍も（bot：新手 50）
    }
    setWarStage(1);   // 戦の曲：柵へ寄せる所でテンポが上がる（music_war.js の段）
    this.openFire(rt);
    const T = F.target, R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.dmgMult = 2.2; R.assault = () => (T.alive ? T : null);
    for (const u of R.units) u.aiT = 0;
    // 先手と二の手は柵の前に横一列に並び、前の者が詰まって後ろから押される形に（団子で四方を向かない。九4）
    for (const g of [F.yam, F.second]) if (!gone(g)) { g.formation = 'line'; g.facing = Math.PI; g.width = 22; }
    const tq ={ x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 };
    rt.marker('fence', tq, '真田丸の柵', { h: 3 });
    // 井伊・越前松平は前田の抜け駆けと見て、遅れまいと爆発より前に寄せ始めた（爆発はそれを煽った。専門家の目 11/6）
    rt.after(6, () => {
      if (F.ending || F.blasted) return;
      F.surge.forEach((g, i) => { if (gone(g)) return; g.fixed = false; g.order = 'move'; g.dest = polar(-1.2 - i * 0.35, FENCE_R + 26); g.anchor = g.dest; });
      rt.say('足軽', '西の井伊と越前の勢も寄せてくる！　前田の抜け駆けに遅れまいと……', 3.4);
    });
    rt.after(18, () => this.blast(rt));
  },

  // 塀・櫓・堀の内の鉄砲が撃ち始める（一度だけ）。最初の一斉射撃は引きつけてから
  openFire(rt) {
    const F = rt.flags;
    if (F.fireOn) return;
    F.fireOn = true; F.volT = rt.t + 5;
    for (const g of [F.wallG, ...F.perch, ...new Set(F.towerU.map((u) => u.group))]) g.fire = true;
    // 信繁は丸の真ん中の本陣（柵から百間余り）。寄せ手に聞こえるのは塀の上の組頭の声だけ（専門家の目 11/6）
    rt.say('塀の上の声', '引きつけよ。まだ撃つな……', 3);
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
    // 西に構えていた井伊・越前松平が、丸の西の堀と惣構へ押し寄せる（丸の横矢を受ける）
    F.surge.forEach((g, i) => { if (gone(g)) return; g.fixed = false; g.aggro = 6; g.order = 'move'; g.dest = polar(-1.1 - i * 0.35, MOAT.r1 + 2); });
  },

  // 一斉射撃（塀と櫓の鉄砲が揃えて放つ）：堀と柵の前の寄せ手が倒れる。遊び手も堀の縁にいれば撃たれる
  volley(rt) {
    const F = rt.flags;
    // 生きた鉄砲衆だけが放つ。塀の組が全滅しても櫓・左右の持ち口は撃てるが、
    // 撃ち手がいなければ傷を出さない（撃ち手なしでは竹束の当たりも調べられない）。
    let shooter = null;
    for (const g of [F.wallG, ...F.perch]) {
      shooter = g.units.find(canShoot);
      if (shooter) break;
    }
    if (!shooter) shooter = F.towerU.find(canShoot);
    if (!shooter) return;
    F.shot++;
    sfx('volley', 0.9);
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + i * 0.27, q = polar(a, WALL_R + 0.5);
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + (i % 2 ? 3.5 : 1.6), q.z, Math.sin(a), Math.cos(a));   // 二階造りの塀：上下二段の狭間から（『山口休庵咄』・冬の陣図屏風）
    }
    // 丸の西の惣構（八丁目口・谷町口）からも撃つ（木村・長宗我部の持ち口。殺到した井伊・松平が受ける）
    if (F.blasted) for (const x of [-34, -60, -88, -116]) rt.army.smoke(x, rt.world.heightAt(x, -98) + 2.4, -98, 0.2, 1);
    for (let i = 0; i < 6; i++) {
      const a = (i < 3 ? -1.6 : 1.6) + (i % 3 - 1) * 0.22, q = polar(a, WALL_R + 0.5);   // 横の塀の横矢
      rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 1.6, q.z, Math.sin(a), Math.cos(a));
    }
    rt.army.play('gun', polar(0, WALL_R), 1.5);
    // 命懸けの戦場（lethal.js）：塀の前の堀と柵の前に、弾の筋の制圧を乗せる（身をすくめる・下がる）
    for (const a2 of [-0.5, 0, 0.5]) { const q = polar(a2, FENCE_R - 2); try { lethalNearMiss(rt.army, q.x, q.z, 1, 'volley', 9); } catch (e) { /* 無くても一斉射は撃つ */ } }
    let fell = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u.invuln || fell >= 11) continue;
      const ru = rOf(u.pos.x, u.pos.z);
      if (ru < FENCE_R + 10 && Math.abs(angOf(u.pos.x, u.pos.z)) < SPAN && Math.random() < (ru < FENCE_R ? 0.7 : 0.35)) { rt.army.damage(u, u.maxHp * 0.9, shooter, { kind: 'gun', pierce: true }); fell++; }
    }
    const p = rt.player.u;
    const rp = rOf(p.pos.x, p.pos.z);
    // 柵の組の竹束の陰（三歩の内）に入れば弾はほとんど当たらない（「竹束の陰に入れ」の言葉どおり。柵を打つ務めで、ただ撃ち殺されない。十二3）
    const cover = F.rams.some((g) => g.units.some((u) => u.alive && u.tatake && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 3 && rOf(u.pos.x, u.pos.z) < rp + 0.5));
    // 堀の中は逃げ場が無い。ただし一斉射だけで討たれはしない（命を二割は残す。柵の前で何度遊んでも倒れた 11/6）
    const vd = Math.min(p.maxHp * (rp < FENCE_R ? 0.24 : 0.16), p.hp - p.maxHp * 0.2);
    if (p.alive && !p.invuln && vd > 0 && rp < FENCE_R + 6 && Math.abs(angOf(p.pos.x, p.pos.z)) < SPAN && Math.random() < (cover ? 0.12 : rp < FENCE_R ? 0.7 : 0.4)) rt.army.damage(p, vd, shooter, { kind: 'gun' });
    if (F.blasted) for (const g of F.surge) if (!gone(g)) g.morale -= 12;
    if (F.shot === 1) rt.say('塀の上の声', '今じゃ、放て！', 2.4);
    else if (F.shot === 3) rt.say('足軽', '堀の底で、味方が折り重なって倒れていく……！', 3.2);
    else if (F.shot === 5) rt.say('山崎長徳', '柵の組の竹束の陰に入れ！　放った後の、込め直す間に寄せよ！', 3.4);
  },

  // 真田の打って出・家康の退き命令（必ず）
  sortie(rt) {
    const F = rt.flags;
    F.step = 4; F.sortieT = rt.t;
    setWarStage(2);   // 真田が打って出る：低音と太鼓が前へ
    rt.unmark('fence');
    // 目標に名を挙げた大助・伊木は、出てきた時に「見えぬ敵の陣」と伏せない（使番が名を伝えた。十1）
    revealName(rt, '真田大助'); revealName(rt, '伊木遠雄');
    sfx('taiko', 1); sfx('horagai', 0.7);
    // 史実の順：堀際で詰まった所へ大助・伊木が打って出る → そのあと大御所の退きの下知（Wikipedia・文春。専門家の目 11/6）
    rt.after(3.5, () => rt.say('山崎長徳', '堀際で詰まった所を突かれる！　篠山の麓まで下がって、組を立て直せ！', 4));
    for (const g of F.rams) if (!gone(g)) withdraw(g, { x: 18, z: RETREAT.z + 14 });
    rt.after(16, () => {
      if (F.ending) return;
      rt.say('使番', '大御所様の下知！　力攻めはやめよ、寄せ手は引き揚げよ！', 4);
      rt.after(4.5, () => rt.say('山崎長徳', `${nm(rt)}、しんがりじゃ！　味方が退くまで、真田を止めよ！`, 4));
      // 堀へ殺到した寄せ手は撃ち崩されて退く
      F.retreatOrder = true;
      for (const g of F.surge || []) if (!gone(g)) withdraw(g, { x: g.anchor.x, z: RETREAT.z + 20 });
      (F.waves || []).forEach((g, i) => { if (!gone(g)) withdraw(g, { x: RETREAT.x - 24 + (i % 4) * 16, z: RETREAT.z + 14 }); });
    });
    for (let i = 0; i < 10; i++) rt.world.addCarrion(C.x + (Math.random() - 0.5) * 70, C.z + MOAT.r1 + Math.random() * 10);
  },

  // ④の後：寄せ手は全部、竹束の陣へ退く。真田の打って出は篠山の麓まで追ってから丸へ引く
  fallBack(rt) {
    const F = rt.flags;
    F.step = 5; F.backT = rt.t;
    setWarStage(0);
    const dest = (g, i) => ({ x: RETREAT.x - 30 + (i % 5) * 15, z: RETREAT.z + 6 + Math.floor(i / 5) * 6 });
    rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && g.count && !gone(g) && g.center().z < RETREAT.z).forEach((g, i) => withdraw(g, dest(g, i)));
    rt.after(14, () => {
      // 先に竹束の陣へ着いて終幕に入っても、真田勢の帰城は取り消さない。
      if (F.ending && !F.returned) return;
      F.sortieBack = true;
      // 下知の後は主人公への狙いを解き、共通の追撃判断でも帰城の行き先を変えない。
      // 打って出の隊も fixedSpawn で口へ置いている。長い追撃範囲を持つ隊は固定を解いて帰す。
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'attack' && (!g.fixed || g.seekRange >= 130)) {
        g.fixed = false; g.focus = null; g.keepMoveOrder = true; g.aggro = 0;
        g.order = 'move'; g.dest = PORT(g.center().x < C.x ? -1 : 1); g.anchor = g.dest;
        for (const u of g.units) { u.target = null; u.aiT = 0; }
      }
      rt.say('足軽', '真田の兵が丸へ引いていく……追うては来ぬ', 3);
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step !== 5 || F.target.alive || Math.hypot(rt.player.u.pos.x - RETREAT.x, rt.player.u.pos.z - (RETREAT.z - 4)) > 9) return;
    F.ending = true;
    F.returned = F.step === 5;
    rt.setPhase('end');
    // 帰陣の印と勝ちの確定を分ける。段の任務は既に済んでいるため、ここで勝ちを立てると共通判定が和議の前に締めてしまう。
    rt.award((t) => { t.special = { label: '真田丸の前で殿を務めた', pts: 40 }; }, '真田の打って出を食い止め、生きて戻った');
    rt.player.u.invuln = true;
    F.victoryShown = true;   // 撃ち崩されて退いた日。勝鬨と「合戦に勝利」は上げない（札は「務めを果たした」。victory_card の DUTY）
    rt.banner('真田丸攻略　失敗', '部隊撤収　成功');   // 合戦の結果と任務の結果を分ける（docs/rank_interlude_retry_spec_1108.md）
    rt.say('山崎長徳', '……ようしのいだ。じゃが、堀の底に、どれだけの者を残してきたか', 4.4);
    // 家康が力攻めをやめ、大筒へ（必ず）
    // 三つの台詞と退いた余韻から和議・破却まで、この戦の終幕を流す。
    rt.after(4.6, () => rt.say('使番', '大御所様より：力攻めは無理だ。あの出丸は捨て置け', 3.4));
    // 締めの場面：竹束の陣から振り返ると、塀の上に六文銭の旗が並んだまま（落とせなかった丸。十四4）
    rt.after(8.4, () => rt.say(nm(rt), '……あの丸は、ついに落ちなんだ', 3));
    // 続けて冬の陣の中間の場面（大筒・和議・堀が埋まる・丸の破却。k11/wagi.js）
    rt.after(12, () => {
      setWarStage(3);   // 中間の場面：曲はほぼ黙り、大筒の音を聞かせる
      const w = wagi(rt, { C, polar, MOAT, SPAN, FENCE_R, maru: F.maruObjs, osaka: F.osaka });
      rt.after((w && w.end) || 1, () => {
        // 結果には最初の登頂ではなく、最後に果たした帰陣の務めを残す。
        rt.award((t) => { t.main = true; });
        rt.obj('main', STAGES.k11_sanadamaru[4][0], 'main');
        rt.objDone('main'); rt.finish({ scriptedEnd: true }, 0);
      });
    });
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    // 始まりの札は begin で外している。途中で失敗した時は、その段の場所と行いを結果へ残す。
    const k = Math.max(0, Math.min(4, (F.step || 1) - 1));
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
    // 櫓の射手は櫓の床に立たせ、床から動かさない（押されて櫓の外の宙へ出ない。11/6 BV の写真で塀の上に浮いた）
    for (const u of F.towerU) {
      // 討たれた後は共通の倒れに任せる。床へ戻すと亡骸が宙へ引き上げられる。
      if (!u.alive) continue;
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + 2.5;   // 櫓の床（地面 -0.2 から 2.7 の板）
      u.pos.x = u.tower.x; u.pos.z = u.tower.z; u.pos.y = y;
      u.mesh.position.y = y;
    }
    if (F.ending) return;
    depthTick(rt, dt);
    this.sasaTick(rt);
    // 塀と櫓の鉄砲は、柵の前の寄せ手の群れを狙う（横矢）
    F.aimT = (F.aimT || 0) - dt;
    if (F.aimT <= 0 && F.step >= 3) {
      F.aimT = 1.5;
      const pool = [...(F.surge || []), ...F.rams, ...(F.waves || []), F.second, F.yam].filter((g) => g && g.count);
      const P = rt.player.u;
      for (const sg of [F.wallG, ...F.perch, ...new Set(F.towerU.map((u) => u.group))]) {
        if (!sg || !sg.count) continue;
        const c = sg.center();
        let best = null, bd = 58;
        for (const g of pool) for (const u of g.units) if (u.alive) { const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z); if (d < bd) { bd = d; best = u; } }
        // 近づいた主人公は必ず狙う（十四8・BV「前や中に一人で立っても撃ってこない」）。出世するほど狙われる（一4）
        const dp = P.alive ? Math.hypot(P.pos.x - c.x, P.pos.z - c.z) : 1e9;
        if (dp < 62 && (dp < 30 || Math.random() < 0.55 + 0.05 * Math.min(6, rt.G?.rank || 0))) best = P;
        sg.focus = best;
      }
    }
    // 櫓の鉄砲は、丸の前に出た主人公を狙い撃つ（十四8・BV「近づいたら死ぬと思うほど撃ってくる」）。弾は本物の玉で、竹束・柵・塀に当たれば止まる
    F.snipeT = (F.snipeT || 0) - dt;
    const PU = rt.player.u;
    if (F.fireOn && F.snipeT <= 0 && PU.alive && !PU.invuln && F.step <= 5) {
      const rp = rOf(PU.pos.x, PU.pos.z), ap = Math.abs(angOf(PU.pos.x, PU.pos.z));
      if (rp < 64 && ap < SPAN + 0.1) {   // 狙い撃つのは柵と堀の前まで（篠山の麓の殿は打って出た兵と戦う場）
        F.snipeT = ((rp < 55 ? 0.85 : 1.4) + Math.random() * 0.5) * (PU.hp < PU.maxHp * 0.35 ? 2.2 : 1);   // 深手の時は間を空け、退く間を残す（十一1）
        const ready = F.towerU.filter((u) => canShoot(u) && rt.t - (u.snipeAt ?? -9) > 2.6 && Math.hypot(u.pos.x - PU.pos.x, u.pos.z - PU.pos.z) < 75);
        ready.sort((a, b) => Math.hypot(a.pos.x - PU.pos.x, a.pos.z - PU.pos.z) - Math.hypot(b.pos.x - PU.pos.x, b.pos.z - PU.pos.z));
        const u = ready[Math.floor(Math.random() * Math.min(8, ready.length))];
        if (u) { u.snipeAt = rt.t; u.heading = Math.atan2(PU.pos.x - u.pos.x, PU.pos.z - u.pos.z); rt.army.fireGun(u, PU); }
      } else F.snipeT = 0.8;
    }
    // 篠山の段の前から、丸に近づいた主人公は塀と櫓から撃たれる（段より先に一人で寄っても無双させない）
    if (!F.fireOn && F.begun && rOf(rt.player.u.pos.x, rt.player.u.pos.z) < FENCE_R + 22) this.openFire(rt);
    // 塀の内の鉄砲・弓は玉薬と矢を運び込まれて、撃ち止まない（共通の持ち弾 20・24 を補う。BV「鉄砲・弓が止まず」）
    F.ammoT = (F.ammoT || 0) - dt;
    if (F.ammoT <= 0) {
      F.ammoT = 4;
      for (const g of [F.wallG, ...F.perch, ...new Set(F.towerU.map((u) => u.group))]) if (g) for (const u of g.units) if (u.alive) { if (u.gunAmmo !== undefined) u.gunAmmo = 20; if (u.arrowAmmo !== undefined) u.arrowAmmo = 24; }
    }
    // 塀の上の筒音と矢の音：一斉射撃の間も、狭間から撃つ音が絶えない（BV「鉄砲の音・弓のヒュンという音をもっと」）
    if (F.fireOn && F.step >= 2 && F.step <= 5) {
      F.popT = (F.popT || 0) - dt;
      if (F.popT <= 0) {
        F.popT = 0.5 + Math.random() * 1.1;
        // 一斉射と同じく、生きて撃てる者がいない持ち口から筒音・硝煙を出さない。
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
    // 破る柵：打たれるたびに揺れ、木屑が飛び、傷むほど外へ傾く（十四5）
    const T = F.target;
    if (T && T.mesh && T.alive) {
      const hit = T.hp < T.lastHp - 0.5;
      if (hit) { F.shakeT = 0.35; T.lastHp = T.hp; const q = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 }; rt.army.spark?.(q.x, rt.world.heightAt(q.x, q.z) + 1.1, q.z, 4); }
      F.shakeT = Math.max(0, (F.shakeT || 0) - dt);
      const lean = (1 - T.hp / T.maxHp) * 0.42 + Math.sin(rt.t * 40) * F.shakeT * 0.12;
      T.mesh.quaternion.setFromAxisAngle(T.mesh.userData.axis, lean);
    }
    // 寄せ続ける前田・本多の後の手：竹束の陣から次々に丸の柵へ寄せ、撃たれて倒れる（攻め手は一万を超える。BV・十四6）
    if (F.step >= 3 && F.step <= 4 && !F.retreatOrder) {
      F.waveT = (F.waveT ?? 4) - dt;
      // 本物の兵は両軍で二百五十ほどまで。追加する二十七人も数えてから寄せる。
      const live = rt.army.units.reduce((n, u) => n + (u.alive && !u.isStruct && !u.isPlayer ? 1 : 0), 0);
      if (F.waveT <= 0 && live + 27 <= 250) {
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
        const seg = F.fence.filter((f) => f.alive).sort((p, q) => Math.hypot((p.seg[0] + p.seg[2]) / 2 - c.x, (p.seg[1] + p.seg[3]) / 2 - c.z) - Math.hypot((q.seg[0] + q.seg[2]) / 2 - c.x, (q.seg[1] + q.seg[3]) / 2 - c.z))[0];
        if (seg) { g.order = 'assault'; g.assault = () => (seg.alive ? seg : F.target.alive ? F.target : null); for (const u of g.units) u.aiT = 0; }
      }
    }
    // 真田大助と伊木遠雄は、近くの主人公に馬を寄せて斬りかかる（十四8）
    if (F.step >= 4 && !F.sortieBack) for (const u of rt.army.units) {
      if (!u.alive || u.team !== 1 || (u.name !== '真田大助' && u.name !== '伊木遠雄') || !u.group) continue;
      const P = rt.player.u, d = Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z);
      if (P.alive && d < 26) u.group.focus = P; else if (u.group.focus === P) u.group.focus = null;
    }
    if (F.fireOn && F.step >= 2 && rt.t > F.volT) { F.volT = rt.t + (F.step === 3 ? 9 : 13) + Math.random() * 3; this.volley(rt); }
    if (F.step === 3 && F.target.alive) {
      // 竹束を持つ者だけが倒れた時も補う。槍の者が残っているだけでは、竹束の陰へ寄れなくなる。
      const left = F.rams.reduce((a, g) => a + g.count, 0);
      const covered = F.rams.some((g) => g.units.some((u) => u.alive && u.tatake && !u.fleeing && !u.woundOut));
      const live = rt.army.units.reduce((n, u) => n + (u.alive && !u.isStruct && !u.isPlayer ? 1 : 0), 0);
      if ((left < 4 || !covered) && F.rams.length < 7 && live + 12 <= 250) {
        rt.say('山崎長徳', '柵の者が討たれた！　次の者、行けっ！', 3);
        const g = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: 10, z: C.z + FENCE_R + 30 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 4, o: { hat: 'jingasa_n', tatake: true } }, { type: 'ashigaru', n: 8, o: { hat: 'jingasa_n' } }], MAEDA));
        g.assault = F.ram.assault; g.dmgMult = 2.2;
        F.rams.push(g);
      }
    }
  },

  onKill(rt, v) {
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
    rt.say('足軽', '柵を倒したぞ！　……む、堀が深い。これは登れぬ', 3.5);
  },
};

// 両軍の総勢：大坂を囲む徳川方およそ二十万のうち、真田丸の前に並んだ前田・井伊・松平らを三万。真田丸の兵は五千ほど
k11_sanadamaru.force = (rt) => {
  const F = rt.flags;
  const shot = (F.shot || 0) * 180 + (F.step >= 4 ? Math.min(1, (rt.t - (F.sortieT || rt.t)) / 40) * 1500 : 0);
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
STAGES.k11_sanadamaru = [['篠山の頂まで登れ'], ['真田丸の外の柵の前まで寄せよ', st(2)], ['柵を破る組と一緒に、真田丸の柵を打ち倒せ', st(3)], ['篠山の北の麓で、打って出た真田大助の隊を食い止めよ', st(4)], ['味方と一緒に、竹束の陣まで退け', st(5)]];

export { k11_sanadamaru };
export default k11_sanadamaru;
