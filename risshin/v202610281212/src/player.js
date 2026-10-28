import { simpleControls } from './simple_controls.js';
import { restoreWounds, bindWound } from './wounds.js';
import { VIEW } from './viewport.js';
import { spearReach, rangedSupply, renewGunPowder } from './weapon_reality.js';
import { projectileCover } from './projectile_cover.js';
import { horseThreatTick, horseExhausted, horseLooseMove, horseLooseDanger } from './horse_reality.js';
import { weatherSees } from './weather_gameplay.js';
import { terrainFx, uphillAt } from './terrain_tags.js';
import * as THREE from 'three';
import { ITEMS, equipDef, ladderStep, canRide, myHorse, scenario } from './state.js';
import { angleDiff, weaponMesh, buildHorse, animateHorse, RIDE, coatOf, bloodLv } from './units.js';
import { distToPolyline, WIND_STATE } from './world.js';
import { POST, edgeDark, speedStreaks } from './post.js';
import { sfx, deafen, setScene } from './audio.js';
import { S, DIFFICULTY, K, saveSettings, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { setFpCut, setFpArm } from './humans.js';
import { kamae, volley, kamaeOff, volleyRoll, ceaseFire } from './kumi.js';
import { groundAt, rampAt, ladderNear, FL } from './floors.js';
import { NAKA, nakaCamClamp } from './naka.js';
import { interiorFloorAt } from './interior_layouts.js';
import { ladderAlive, startClimb } from './siege_ladder.js';
import { decisiveCameraReset, decisiveCameraApply } from './decisive_camera.js';
import { cloneWaterMaterial } from './water_body.js';
import { cameraWallBlocked } from './battle_sight.js';
import { drawGroundAt, avoidCameraBodies } from './render_camera.js';
import { flagBlocksView as flagMeshBlocksView } from './units_flags.js';
import { PlayerMove } from './player_move.js';
import { PlayerHurt } from './player_hurt.js';
import { PlayerRanged } from './player_ranged.js';
import { PlayerMelee } from './player_melee.js';
import { PlayerCommand } from './player_command.js';
import { PlayerView } from './player_view.js';
import { PlayerCamera } from './player_camera.js';
// 刃の軌跡（Player.trailTick）の材質と使い回しのベクトル
export const TRAIL_N = 12;
export const _meleeResult = { res: null };   // 二人目以降の当たり方を調べる入れ物を使い回す
export const TRAIL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
export const _tA = new THREE.Vector3(), _tB = new THREE.Vector3();
export const _horseBox = new THREE.Box3();
const TOFF = typeof location !== 'undefined' && /[?&]toff\b/.test(location.search);   // 試し：緊迫の仕組みを切る
export const _fpS = new THREE.Vector3();
// 近傍検索の関数は使い回し、検索ごとの閉包を作らない。
export function collectMeleeDust(o, p) {
  if (o.alive && !o.isStruct && (o.atk || o.swing || o.stagger > 0)) p.dustBusy.push(o);
}
export function hideCameraEnemy(o, p) {
  const cp = p.nearAllyCam.position, D = p.rt.def;
  if (o === p.u || !o.mesh || o.isStruct || !o.mesh.visible || o.team === p.u.team) return;
  const dx = o.pos.x - cp.x, dz = o.pos.z - cp.z, R = D.nearEnemyFadeRadius || (o.mounted ? 1.5 : 0.95);
  if (dx * dx + dz * dz > R * R) return;
  if (cp.y < o.pos.y - 0.2 || cp.y > o.pos.y + (o.mounted ? 3.4 : 2.4)) return;
  p.hideNearFlag(o.mesh);
}
export function hideFirstPersonWeapon(o, p) {
  if (o === p.u || o.isStruct || o.team !== p.u.team || !o.wpn || !o.wpn.visible) return;
  p.hideNearFlag(o.wpn);
}
export function countCameraAlly(o, p) { if (o !== p.u && o.alive && o.team === p.u.team) p.crowd++; }
export function collectCameraFoe(o, p) {
  const u = p.u, f = p.cameraFoeWork;
  if (!o.alive || o.team === u.team || o.isStruct || o.fleeing || o.woundOut || o.type === 'dummy' ||
      o.noTarget || o.civ || o.gone || o.playerOpeningBlocked || Math.abs(o.pos.y - u.pos.y) > 2 ||
      p.rt.army.wallBetween(o.pos, -1, u.pos) || p.rt.army.terrainBlocks(o.pos, u.pos)) return;
  const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z), w = 1 / (0.6 + d);
  f.sx += (o.pos.x - u.pos.x) * w; f.sz += (o.pos.z - u.pos.z) * w; f.n += w; f.near = Math.min(f.near, d);
  if (d < f.focusDist) { f.focusDist = d; f.focusYaw = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z); }
  // 長島の背後の打ち込み。遠い軍勢や柵の向こうへ視点を取られないよう、迫る一人だけ拾う。
  if (p.rt.def.rearThreatFrame && !o.noTarget && !o.civ && !o.gone && !o.playerOpeningBlocked && d < f.rearDist
    && (d < 5 || o.target === u || o.atk?.target === u || o.swing?.target === u)) {
    const yaw = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (Math.abs(angleDiff(p.yaw, yaw)) > 1.2 && !p.rt.army.wallBetween(o.pos, -1, u.pos) && !p.rt.army.terrainBlocks(o.pos, u.pos)) { f.rearYaw = yaw; f.rearDist = d; }
  }
}

export function yieldToPlayerHorse(o, p) {
  const u = p.u, fx = p.rideYieldX, fz = p.rideYieldZ, sp = p.rideYieldSpeed;
  if (!o.alive || o.isStruct || o.isPlayer || o.mounted || !o.push || o === u) return;
  if (o.team !== u.team && o.group && o.group.formation === 'yari') return;
  const rx = o.pos.x - u.pos.x, rz = o.pos.z - u.pos.z, ahead = rx * fx + rz * fz, lat = fz * rx - fx * rz;
  if (ahead < 0.3 || ahead > 4.5 || Math.abs(lat) > 1.6) return;
  const s = lat >= 0 ? 1 : -1, k = (1.6 - Math.abs(lat)) * (sp / 11) * 2.2;
  o.push.x += fz * s * k; o.push.z += -fx * s * k;
  if (o.team !== u.team && Math.random() < 0.25) o.stagger = Math.max(o.stagger || 0, 0.5);
}
export function findPlayerTell(o, p) {
  const u = p.u;
  const a = o.atk;
  if (!a || a.cued || a.target !== u || !o.alive || o.team === u.team || a.t > p.tellLead) return;
  a.cued = true;
  if (!p.tellBest || a.t < p.tellBest.atk.t) p.tellBest = o;
}
export function findInterveningAlly(a, p) {
  const u = p.u, fx = p.allyBetweenX, fz = p.allyBetweenZ, d = p.allyBetweenDistance;
  if (p.allyBetweenHit || a === u || a.team !== u.team || !a.alive || a.gone || a.fleeing || a.civ) return;
  const ax = a.pos.x - u.pos.x, az = a.pos.z - u.pos.z, along = ax * fx + az * fz;
  if (along < 0.4 || along > d - 0.4) return;
  if (Math.abs(ax * fz - az * fx) < (a.mounted ? 0.7 : 0.38)) p.allyBetweenHit = true;
}

// カメラの計算に毎コマ使う入れ物（毎コマ new しない。どれもそのコマの中だけで使い、外へ持ち出さない）
export const _cT = new THREE.Vector3(), _cD = new THREE.Vector3(), _cR = new THREE.Vector3(), _cW = new THREE.Vector3(), _cQ = new THREE.Vector3(), _cLk = new THREE.Vector3(), _cTmp = new THREE.Vector3();
export const _cE = new THREE.Vector3(), _cFr = new THREE.Vector3(), _cAh = new THREE.Vector3(), _cFar = new THREE.Vector3();
export const _WORLD_UP = new THREE.Vector3(0, 1, 0);
export const _downRotation = new THREE.Quaternion(), _downGoalRotation = new THREE.Quaternion();
export const _PF_OFFSETS = [[0, 0], [0.6, 0.3], [-0.6, 0.3], [0.6, -0.5], [-0.6, -0.5]];
export const _cLow = new THREE.Vector3();
export const _cUP = new THREE.Vector3(0, 1, 0), CORNERS = [[0.35, 0.2], [-0.35, 0.2], [0.35, -0.1], [-0.35, -0.1]];   // 下の隅は浅く（柵の横木を拾って寄りすぎない）

// 束ねた形の範囲は geometry ではなく本体にある（部品ごとの移動も含む）。
export function camBlockSphere(o) {
  if (o.isBatchedMesh || o.isInstancedMesh) {
    o.computeBoundingSphere();
    return o.boundingSphere;
  }
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  return o.geometry.boundingSphere;
}
// 親の移動も見張り、動いた節だけ世界の行列を更新する。止まった壁は判定の線ごとに計算し直さない。
const camBlockTransforms = new WeakMap();
export function camBlockWorld(o) {
  const parent = o.parent, pv = parent ? camBlockWorld(parent) : 0;
  let e = camBlockTransforms.get(o);
  if (!e) {
    e = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: o.matrix.clone(), parent, pv, auto: o.matrixAutoUpdate, v: 0 };
    camBlockTransforms.set(o, e);
  }
  const changed = o.matrixAutoUpdate
    ? !e.p.equals(o.position) || !e.q.equals(o.quaternion) || !e.s.equals(o.scale) || !e.m.equals(o.matrix)
    : !e.m.equals(o.matrix);
  if (!e.v || changed || e.parent !== parent || e.pv !== pv || e.auto !== o.matrixAutoUpdate) {
    o.updateWorldMatrix(false, false);
    e.p.copy(o.position); e.q.copy(o.quaternion); e.s.copy(o.scale); e.m.copy(o.matrix);
    e.parent = parent; e.pv = pv; e.auto = o.matrixAutoUpdate; e.v++;
  }
  return e.v;
}
export function camBlockVisible(o, scene) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}
// 壁の裏から出る線も拾う。共有の描画材質には触らず、判定の間だけ専用の両面材質を使う。
const CAM_BLOCK_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
// 手前の屋根・柱は点描にせず抜く。遠い建物と床は残し、描画回数を増やさない。
export const CAM_NEAR_PROJECTION = { value: new THREE.Vector2(1, 1) };
export const CAM_NEAR_FOOT = { value: 0 };
export const CAM_NEAR_SCREEN_CUT = { value: 1 };
export const CAM_NEAR_CLEAR_DEPTH = { value: 9.5 };
export const CAM_NEAR_FADE = { value: 0 }, camNearMaterials = new WeakSet();
const camNearSources = new WeakMap();
// 前の戦で見通しを付けた共有材質からも、処理を重ねず堂専用の材質を作る。
export function cloneRoomNearMaterial(source, inside) {
  const original = camNearSources.get(source);
  const mat = source.clone();
  const sourceKey = original ? original.sourceKey : source.customProgramCacheKey();
  mat.onBeforeCompile = original ? original.compile : source.onBeforeCompile;
  mat.customProgramCacheKey = () => sourceKey;
  mat.userData.sgRoomInside = inside;
  // 支度中の描画準備へ含め、開戦後の最初の視点判定で一斉に組み直さない。
  camNearMaterial(mat);
  return mat;
}
function camNearMaterial(m) {
  // 墨俣の小屋は専用の半透明処理を使う。ここで点描を足すと近い壁に点々が残る。
  if (!m || camNearMaterials.has(m) || m.isShaderMaterial || m.userData.sunoSmoothNear || m.userData.camNearSolid) return;
  camNearMaterials.add(m);
  const compile = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m), sourceKey = key();
  camNearSources.set(m, { compile, sourceKey });
  const roomInside = m.userData.sgRoomInside, roof = !!m.userData.camNearRoof;
  m.onBeforeCompile = function (sh, renderer) {
    compile.call(this, sh, renderer);
    sh.uniforms.camNearFade = CAM_NEAR_FADE;
    sh.uniforms.camNearProjection = CAM_NEAR_PROJECTION;
    sh.uniforms.camNearFoot = CAM_NEAR_FOOT;
    sh.uniforms.camNearScreenCut = CAM_NEAR_SCREEN_CUT;
    sh.uniforms.camNearClearDepth = CAM_NEAR_CLEAR_DEPTH;
    // 棟を指定した材質だけ、外から見た壁を残す。通常の材質は従来どおり。
    if (roomInside) sh.uniforms.camRoomInside = roomInside;
    // 揺れる木（world.js の sway）は project_vertex を展開済みで、印が残らない。その時は gl_Position の後ろへ足す。
    // 足し忘れると vCamNear が 0 のままで、木の葉の塊がすべて抜けて幹だけの棒に見えていた。
    const vs = sh.vertexShader;
    const nearVertex = `
      vCamNear = mvPosition.xyz;
      vec4 camWorld = vec4(transformed, 1.0);
      vec3 camNormal = normal;
      #ifdef USE_INSTANCING
        camWorld = instanceMatrix * camWorld;
        camNormal = mat3(instanceMatrix) * camNormal;
      #endif
      vCamSurface = vec2((modelMatrix * camWorld).y, normalize(mat3(modelMatrix) * camNormal).y);`;
    sh.vertexShader = 'varying vec3 vCamNear;\nvarying vec2 vCamSurface;\n' + (vs.includes('#include <project_vertex>')
      ? vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + nearVertex)
      : vs.replace('gl_Position = projectionMatrix * mvPosition;', 'gl_Position = projectionMatrix * mvPosition;\n' + nearVertex));
    // 滑らかに薄くする材質は diffuseColor の後（color_fragment）で掛ける。clipping の所ではまだ diffuseColor が無く、三方ヶ原などで shader が組めなかった。
    const smooth = !!(m.userData.igaSmoothNear || m.userData.sgSmoothNear || m.userData.camNearSmooth);
    const fs = sh.fragmentShader, canSmooth = smooth && fs.includes('#include <clipping_planes_fragment>') && fs.includes('#include <color_fragment>');
    sh.fragmentShader = (roomInside ? 'uniform float camRoomInside;\n' : '') + 'uniform float camNearFade;\nuniform float camNearFoot;\nuniform float camNearScreenCut;\nuniform float camNearClearDepth;\nuniform vec2 camNearProjection;\nvarying vec3 vCamNear;\nvarying vec2 vCamSurface;\n' + fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float camKeep = 1.0;
      if (camNearFade > 0.5${roomInside ? ' && camRoomInside > 0.5' : ''}) {
        // 目のすぐ前の面は抜き、二・四歩の外で元へ戻す。
        // 横木が何枚重なっても、近い所に不透明な塊を残さない。
        camKeep = smoothstep(0.45, ${smooth ? '4.2' : '2.4'}, length(vCamNear));
        // 手前の柱で戦う場所が隠れないよう、画面中央の近い面だけ薄くする。
        // 床と遠い建物は残す。束ねた建物も画素ごとに判じ、描画回数を増やさない。
        vec2 screenNear = abs(vCamNear.xy * camNearProjection / max(0.01, -vCamNear.z));
        // 中央の幅・高さの各八割強を空け、横長の携帯でも戦場の三分の二を見通す。
        float corridor = smoothstep(0.82, 0.9, max(screenNear.x, screenNear.y));
        // 横長の画面でも左右の壁だけ濃く戻らないよう、奥行きで判じる。
        // 屋根は軒の先まで抜き、手前の大きな瓦面で戦場を覆わない。
        float farKeep = smoothstep(${roof ? '16.0, 24.0' : 'camNearClearDepth - 2.5, camNearClearDepth + 2.5'}, max(0.0, -vCamNear.z));
        // 狭い城内では画面の長方形で梁を切らず、目の前の面だけ距離で避ける。
        if (camNearScreenCut > 0.5) camKeep = min(camKeep, max(corridor, farKeep));
        // 床は残し、手前の柱・梁だけを避ける。
        // 床は世界の高さと上向きの面で見分ける。視点の高さで壁を輪切りにすると白壁や黒い腰板が足元へ残る。
        bool groundSurface = gl_FrontFacing && vCamSurface.x <= camNearFoot + 0.35 && vCamSurface.y > 0.45;
        // 不透明な材質にも見通しの処理を適用する。材質の追加や深度の変更は要らない。
        if (groundSurface) camKeep = 1.0;
        ${smooth ? '' : 'if (!groundSurface && camKeep < 0.5) discard;'}
      }`);
    if (canSmooth) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n      diffuseColor.a *= camKeep;');
  };
  m.customProgramCacheKey = () => sourceKey + '|camNear-battle-view' + ((m.userData.igaSmoothNear || m.userData.sgSmoothNear || m.userData.camNearSmooth) ? '|iga-smooth' : '') + (roomInside ? '|room-inside' : '') + (roof ? '|roof' : '');
  m.needsUpdate = true;
}
export function camNearMesh(o) {
  if (Array.isArray(o.material)) { for (const m of o.material) camNearMaterial(m); }
  else camNearMaterial(o.material);
}
// 束ねた大きな建物（数万の面）は、線の通る升の面だけを調べる。
// 升の表は形ごとに一度だけ作る。毎回すべての面を調べると、木ノ芽峠では一コマが0.7秒になった。
const CAM_GRID = new WeakMap(), CAM_CELL = 4;
const _cgInv = new THREE.Matrix4(), _cgRay = new THREE.Ray(), _cgA = new THREE.Vector3(), _cgB = new THREE.Vector3(), _cgC = new THREE.Vector3(), _cgP = new THREE.Vector3();
export function camGrid(o) {
  const gm = o.geometry;
  let G = CAM_GRID.get(gm);
  if (G !== undefined) return G;
  const pos = gm.attributes?.position, idx = gm.index;
  const triN = pos ? Math.floor((idx ? idx.count : pos.count) / 3) : 0;
  if (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || triN < 3000 || gm.morphAttributes?.position ||
      gm.drawRange.start !== 0 || gm.drawRange.count < (idx ? idx.count : pos.count)) { CAM_GRID.set(gm, null); return null; }
  if (!gm.boundingBox) gm.computeBoundingBox();
  const bb = gm.boundingBox, x0 = bb.min.x, z0 = bb.min.z;
  const nx = Math.max(1, Math.ceil((bb.max.x - x0) / CAM_CELL)), nz = Math.max(1, Math.ceil((bb.max.z - z0) / CAM_CELL));
  const vi = (t, k) => idx ? idx.getX(t * 3 + k) : t * 3 + k;
  // 一度目に升ごとの数を数え、二度目に詰める（入れ物を一つにまとめる）
  const count = new Int32Array(nx * nz + 1), span = new Int32Array(triN * 4);
  for (let t = 0; t < triN; t++) {
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (let k = 0; k < 3; k++) { const v = vi(t, k), x = pos.getX(v), z = pos.getZ(v); if (x < ax) ax = x; if (x > bx) bx = x; if (z < az) az = z; if (z > bz) bz = z; }
    const i0 = Math.max(0, Math.min(nx - 1, Math.floor((ax - x0) / CAM_CELL))), i1 = Math.max(0, Math.min(nx - 1, Math.floor((bx - x0) / CAM_CELL)));
    const j0 = Math.max(0, Math.min(nz - 1, Math.floor((az - z0) / CAM_CELL))), j1 = Math.max(0, Math.min(nz - 1, Math.floor((bz - z0) / CAM_CELL)));
    span[t * 4] = i0; span[t * 4 + 1] = i1; span[t * 4 + 2] = j0; span[t * 4 + 3] = j1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * nx + i + 1]++;
  }
  for (let c = 1; c <= nx * nz; c++) count[c] += count[c - 1];
  const fill = count.slice(0, nx * nz), list = new Int32Array(count[nx * nz]);
  for (let t = 0; t < triN; t++) for (let j = span[t * 4 + 2]; j <= span[t * 4 + 3]; j++) for (let i = span[t * 4]; i <= span[t * 4 + 1]; i++) list[fill[j * nx + i]++] = t;
  G = { x0, z0, nx, nz, start: count, list, seen: new Uint32Array(triN), stamp: 0, vi, pos };
  CAM_GRID.set(gm, G);
  return G;
}
// 当たりの点は同時に複数残るため、一覧の位置ごとに別の入れ物を使う。
const camGridHitPools = new WeakMap(), _cgWorld = new THREE.Vector3();
function camGridRaycast(o, G, ray, hits) {
  o.updateMatrixWorld?.();
  _cgInv.copy(o.matrixWorld).invert();
  _cgRay.copy(ray.ray).applyMatrix4(_cgInv);
  const far = Number.isFinite(ray.far) ? ray.far : 200;
  // 線の両端（形の内の向き）。縮尺のある物も、終わりの点を写して長さを合わせる。
  _cgA.copy(ray.ray.origin).applyMatrix4(_cgInv);
  _cgB.copy(ray.ray.direction).multiplyScalar(far).add(ray.ray.origin).applyMatrix4(_cgInv);
  const i0 = Math.max(0, Math.floor((Math.min(_cgA.x, _cgB.x) - G.x0) / CAM_CELL)), i1 = Math.min(G.nx - 1, Math.floor((Math.max(_cgA.x, _cgB.x) - G.x0) / CAM_CELL));
  const j0 = Math.max(0, Math.floor((Math.min(_cgA.z, _cgB.z) - G.z0) / CAM_CELL)), j1 = Math.min(G.nz - 1, Math.floor((Math.max(_cgA.z, _cgB.z) - G.z0) / CAM_CELL));
  if (i0 > i1 || j0 > j1) return;
  if (++G.stamp >= 0xffffffff) { G.seen.fill(0); G.stamp = 1; }
  const { pos, vi, seen, start, list, stamp } = G;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * G.nx + i;
    for (let k = start[c], e = start[c + 1]; k < e; k++) {
      const t = list[k];
      if (seen[t] === stamp) continue;
      seen[t] = stamp;
      const a = vi(t, 0), b = vi(t, 1), d = vi(t, 2);
      _cgA.fromBufferAttribute(pos, a); _cgB.fromBufferAttribute(pos, b); _cgC.fromBufferAttribute(pos, d);
      if (!_cgRay.intersectTriangle(_cgA, _cgB, _cgC, false, _cgP)) continue;
      const point = _cgWorld.copy(_cgP).applyMatrix4(o.matrixWorld);
      const distance = ray.ray.origin.distanceTo(point);
      if (distance < ray.near || distance > ray.far) continue;
      let pool = camGridHitPools.get(hits);
      if (!pool) { pool = []; camGridHitPools.set(hits, pool); }
      let hit = pool[hits.length];
      if (!hit) hit = pool[hits.length] = { distance: 0, point: new THREE.Vector3(), object: null, faceIndex: 0 };
      hit.distance = distance; hit.point.copy(point); hit.object = o; hit.faceIndex = t;
      hits.push(hit);
    }
  }
}
export function camBlockRaycast(o, ray, hits) {
  if (o.isSprite || o.isPoints || o.isLine) return;   // 板の絵や点は当たりにしない（Sprite は camera が要り例外になる）
  const G = o.isMesh ? camGrid(o) : null;
  if (G) { try { camGridRaycast(o, G, ray, hits); } catch { /* 一つの部品の誤りで戦を止めない */ } return; }
  const mat = o.material;
  const count = hits.length;
  o.material = CAM_BLOCK_MAT;
  try { o.raycast(ray, hits); }
  catch { hits.length = count; } // 一つの部品の判定失敗で戦を止めず、ほかの壁の当たりは残す。
  finally { o.material = mat; }
}

// 地形は建物の当たり判定に入らない。自分から順に高さを調べ、最初の斜面より手前へ寄せる。
// 数と間隔に上限を設け、数値だけで計算する（毎コマ入れ物を作らない）。
export function cameraGroundAt(W, x, z) {
  // 歩く高さの補間より、実際に描く斜面が高い場所も拾う。
  return Math.max(W.heightAt(x, z), drawGroundAt(W, x, z));
}
// カメラのまわり六方（0.9m）の地面が、目の高さより下にあるか
export function terrainSideClear(W, x, y, z) {
  for (let a = 0; a < 6; a++) {
    const ang = a * 1.0472;
    if (cameraGroundAt(W, x + Math.sin(ang) * 0.9, z + Math.cos(ang) * 0.9) > y - 0.2) return false;
  }
  return true;
}
export function terrainCameraClamp(W, from, to, lift = false) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dz), n = Math.max(2, Math.min(32, Math.ceil(len / 0.5)));
  let safe = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (from.y + dy * t >= cameraGroundAt(W, from.x + dx * t, from.z + dz * t) + 0.65) { safe = t; continue; }
    let lo = safe, hi = t;
    for (let j = 0; j < 4; j++) {
      const m = (lo + hi) * 0.5;
      if (from.y + dy * m >= cameraGroundAt(W, from.x + dx * m, from.z + dz * m) + 0.65) lo = m;
      else hi = m;
    }
    const k = Math.max(0, lo - 0.25 / Math.max(len, 0.25));
    // すぐ後ろが切岸なら、肩越しの距離を残して上から見る。建物の判定より先だけ行う。
    if (lift && len > 1.4 && len * k < 1.4) {
      const q = 1.4 / len;
      to.set(from.x + dx * q, from.y + dy * q, from.z + dz * q);
      for (let j = 1; j <= 6; j++) {
        const m = j / 6;
        const h = cameraGroundAt(W, from.x + dx * q * m, from.z + dz * q * m) + 0.8;
        to.y = Math.max(to.y, from.y + (h - from.y) / m);
      }
    } else to.set(from.x + dx * k, from.y + dy * k, from.z + dz * k);
    to.y = Math.max(to.y, cameraGroundAt(W, to.x, to.z) + 0.65);
    return true;
  }
  return false;
}

// 味方を透かす材質：なめらかな半透明を共有する。
const DITHER_A = [0.3, 0.5, 0.72];
const ditherCache = new WeakMap();
function ditherMat(m, lv, cut = null) {
  if (m.userData.dither != null) return m;
  let a = ditherCache.get(m);
  if (!a) { a = new Map(); ditherCache.set(m, a); }
  const key = lv + '|' + cut;
  if (!a.has(key)) {
    const f = cloneWaterMaterial(m);
    // 点描（alphaHash）は低い解像度でテレビの砂嵐のように見えるので、なめらかな半透明で透かす
    f.alphaHash = false; f.transparent = true; f.depthWrite = false; f.opacity = m.opacity * DITHER_A[lv];
    // 布の抜き判定も薄さに合わせ、透かした旗が丸ごと消えないようにする。
    f.alphaTest = m.alphaTest * DITHER_A[lv];
    if (cut === 'horo') {
      // 母衣を胴とまとめた形でも、絵の布の区画だけ描かない。具足・顔・脚は濃く残す。
      f.transparent = m.transparent; f.depthWrite = m.depthWrite; f.opacity = m.opacity;
      f.onBeforeCompile = (sh, renderer) => {
        m.onBeforeCompile(sh, renderer);
        sh.vertexShader = 'varying vec2 vAllyHoroUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAllyHoroUv = uv;');
        sh.fragmentShader = 'varying vec2 vAllyHoroUv;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
          #include <alphatest_fragment>
          if (vAllyHoroUv.x >= 0.75 && vAllyHoroUv.x <= 0.875 && vAllyHoroUv.y >= 0.0 && vAllyHoroUv.y <= 0.25) discard;`);
      };
      f.customProgramCacheKey = () => m.customProgramCacheKey() + '|allyHoro';
    } else if (cut == null) {
      f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey;
    } else {
      f.opacity = m.opacity;
      // 骨で曲げる前の高さを使うので、姿勢や体格が変わっても脚は透けない。
      // 薄さと切る高さは uniform で渡す（値を絵の仕組みに書き込むと、人ごと・高さごとに戦の途中で新しく作り、そのたび数十 ms 固まる）
      const uA = { value: new THREE.Vector3(DITHER_A[lv], cut, cut + Math.abs(cut) * 0.08 + 0.001) };
      f.onBeforeCompile = (sh, renderer) => {
        m.onBeforeCompile(sh, renderer);
        sh.uniforms.uAllyCut = uA;
        sh.vertexShader = 'varying float vAllyHeight;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAllyHeight = position.y;');
        sh.fragmentShader = 'varying float vAllyHeight;\nuniform vec3 uAllyCut;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
          #include <alphatest_fragment>
          diffuseColor.a *= mix(1.0, uAllyCut.x, smoothstep(uAllyCut.y, uAllyCut.z, vAllyHeight));`);
      };
      f.customProgramCacheKey = () => m.customProgramCacheKey() + '|allyUpper';
    }
    Object.assign(f.userData, m.userData, { dither: lv });
    a.set(key, f);
  }
  return a.get(key);
}

const BODY_LOOK = [
  { armor: 0xa27b50, lace: 0x6b5a3a, sode: false },
  { armor: 0x1d1d1f, lace: 0x5a4630, sode: true },
  { armor: 0x1d1d1f, lace: 0xa8321f, sode: true },
];

// 装備から見た目を決める（戦場・武具屋のプレビューで共通）
// 兜の格（段が上がるほど立派に。装備の兜より下にはしない）
const HAT_ORDER = ['jingasa', 'jingasa_n', 'kabuto', 'kabuto_m', 'kabuto_f', 'kabuto_b', 'kabuto_w', 'kabuto_s', 'kabuto_g', 'kabuto_t'];
const STEP_HAT = ['jingasa', 'kabuto', 'kabuto_m', 'kabuto_f', 'kabuto_b', 'kabuto_w', 'kabuto_s', 'kabuto_s', 'kabuto_g', 'kabuto_t'];
// 段ごとの甲冑（null は装備のまま）
const STEP_ARMOR = [
  null, null, null,
  { armor: 0x1a1515, lace: 0xb8342a },            // 侍大将：朱威
  { armor: 0x1a1515, lace: 0xb8342a },            // 部将
  { armor: 0x1a1515, lace: 0xa8321f, trim: 0xc9a24a },  // 家老：金縁
  { armor: 0x2a1c14, lace: 0xe2d6b8, trim: 0xc9a24a },  // 城主：専用の甲冑（白糸威）
  { armor: 0x2a1c14, lace: 0xe2d6b8, trim: 0xc9a24a },  // 国持大名
  { armor: 0x141414, lace: 0xc9a24a, trim: 0xe0bc5a },  // 戦国大名：金糸
  { armor: 0x0e0e10, lace: 0xc9a24a, trim: 0xf0cc62 },  // 天下人：黒と金
];
const STEP_HAORI = [0, 0, 0x5a1e18, 0xa0281c, 0xa0281c, 0x4a2a6a, 0x7a5a1a, 0x7a5a1a, 0x1e3a6a, 0xb8231a];
const STEP_UMA = [null, null, null, null, null, null, 'fan', 'fan', 'gourd', 'sun'];

// 装備と段から見た目を決める（戦場・武具屋・出世の道のプレビューで共通）
export function playerLook(G, stepOverride) {
  const step = stepOverride ?? ladderStep(G);
  const bl = BODY_LOOK[ITEMS[G.equip.body].look];
  const wItem = ITEMS[G.equip.weapon];
  const eqHat = ITEMS[G.equip.hat].look;
  const hat = HAT_ORDER.indexOf(STEP_HAT[step]) > HAT_ORDER.indexOf(eqHat) ? STEP_HAT[step] : eqHat;
  const ar = STEP_ARMOR[step] || {};
  const uma = STEP_UMA[step];
  return {
    armor: ar.armor ?? bl.armor, lace: ar.lace ?? bl.lace, trim: ar.trim || 0, sode: bl.sode || step >= 2, hat,
    // 本人だけは身分によらず、少し高い無地の金旗を背負う。
    flag: 'player_gold', pole: true, flagScale: 1.25, flagShape: 0,
    // 本の足軽の陣笠：弁柄の漆（黄色い菅笠に見せない。本人の見分けは背の金の旗）
    hatColor: 0x6a2c1e,
    cloth: 0x293e58,
    uma,
    weapon: 'spear', weaponExtra: wItem.reach || 0,
    haori: STEP_HAORI[step] || (G.equip.coat ? 0x8e2f1f : 0),
    saya: G.owned.includes('katana') || step >= 1, menpo: step >= 8 ? 0x7a1c14 : step >= 3 || G.equip.hat === 'hat3' ? 0x1c1a18 : 0,
    horo: step === 4 ? 0xb8412c : step === 5 ? 0xe6dfcf : 0,
    left: step >= 3 ? 'gunbai' : step === 2 ? 'saihai' : null,
    // 身分の格（足軽・組頭・侍大将・武将）。本人の顔、胴と陣笠の家紋、汚れ（出世するほど身綺麗に）
    tier: step >= 4 ? 3 : step >= 2 ? 2 : step, face: 'player', mon: scenario().mon, dirt: [0.7, 0.55, 0.4, 0.3, 0.25][Math.min(4, step)],
    menpoStyle: step >= 3 ? 'hanbo' : 'full',
    // 兜と具足（胴丸・桶側胴）を着る者は、本物の胴丸（humans.js の3Dスキャン）を着る。色は着た具足の威糸・漆
    // （前は侍大将の段だけで、本編で城下の具足を着た足軽大将は、箱の胴の形のままだった）
    real: step >= 3 || (hat.startsWith('kabuto') && (step >= 2 || ITEMS[G.equip.body].look >= 1)) ? 1 : 0,
  };
}

// 段ごとの馬の拵え。kind は毛色の名（栗毛・鹿毛・黒鹿毛。鹿毛の類は脚先と鬣が黒い）
export function horseStyle(step, coat, kind) {
  const C = kind ? coatOf(kind) : null;
  const bay = C ? C.points > 0 : coat === 0x6e4220 || coat === 0x2a1d14;
  return {
    coat: step >= 7 ? 0xd9d4c6 : coat ?? (step >= 5 ? 0x2a1d14 : 0x5a3a24),
    mane: step >= 7 ? 0xbdb6a6 : bay ? 0x100c0a : 0x3a2214,
    points: step >= 7 ? 0 : bay ? 1 : 0,
    tack: 0x3a2418,
    saddle: 0x111010,
    rim: step >= 6 ? 0xc9a24a : 0,
    cushion: step >= 4 ? 0x7a1a14 : 0x3a2a1c,
    aori: step >= 3 ? 0x3a2a1c : 0x4a3a26,
    // 房：足軽大将は紺、侍大将から朱、上は金
    tassels: step >= 6 ? 0xc9a24a : step >= 4 ? 0xb8342a : 0x6a2a1c,
    big: step >= 5 ? 1 : 0,
    armor: step >= 9 ? 0xc9a24a : step >= 8 ? 0x8a6a1e : 0,
  };
}

export const ORDER_NAME = {
  follow: 'ついて来い', hold: '待て', attack: '突撃', retreat: '退け', focus: '敵を狙え', move: '前進', yari: '槍衾', flee: '潰走',
  face: '向き直れ', gather: '集まれ', gate: '門を破れ', path: '前進', assault: '門を破れ',
};
export const FORM_NAME = { line: '横隊', column: '縦陣', loose: '散開', yari: '槍衾', ring: '方円', gyorin: '突撃' };
// 組の隊の種類（号令先の切り替えの順）と名前
export const GROUP_KINDS = ['spear', 'gun', 'bow', 'cavalry'];
export const GROUP_NAME = { all: '全隊', spear: '槍隊', gun: '鉄砲隊', bow: '弓隊', cavalry: '騎馬隊' };
// 号令の輪（上から時計回り）
export const RADIAL = [
  { id: 'attack', label: '突撃' }, { id: 'focus', label: '敵を狙え' }, { id: 'hold', label: '待て' }, { id: 'yari', label: '槍衾', min: 2 },
  { id: 'retreat', label: '退け' }, { id: 'move', label: '前進', min: 2 }, { id: 'follow', label: 'ついて来い' }, { id: 'rally', label: '', min: 99 },   // 鼓舞は無くした（kaito 10/23 稲生 55）。輪の八つの場所だけ残す
];

// 号令の輪の四つ目（右下）は、選んだ隊に弓・鉄砲がいれば射撃の号令にする（syncRadial）
export const YARI_ITEM = RADIAL[3];
export const FIRE_ITEM = { id: 'fire', label: '放て／やめ', min: 1 };
// 指の端末（携帯）は、号令の輪の字を丸の中の二字までに（字で景色を隠さない）
if (isTouch) {
  const SHORT = { attack: '突撃', focus: '狙え', hold: '待て', yari: '槍衾', retreat: '退け', move: '前進', follow: '続け' };
  for (const it of RADIAL) if (SHORT[it.id]) it.label = SHORT[it.id];
  FIRE_ITEM.label = '放て';
}

export const SQUAD_FORMS = [
    { id: 'form_line', label: '横隊に組め', desc: '槍衾で前を守り、鉄砲を横に並べる' },
    { id: 'form_ring', label: '方円に組め', desc: '四方を守る。囲まれても打たれにくい' },
    { id: 'form_gyorin', label: '突撃に組め', desc: '前を狭くして押し切る。斬り込む力が増す' },
];

export function commandList(rank) {
  const base = [
    { k: '1', q: K('follow'), id: 'follow', label: 'ついて来い', desc: '自分の後ろに付いて動く' },
    { k: '2', q: K('hold'), id: 'hold', label: '待て', desc: 'その場で踏みとどまる' },
    { k: '3', q: K('attack'), id: 'attack', label: '突撃', desc: '近くの敵へ斬り込む' },
    { k: '4', q: K('retreat'), id: 'retreat', label: '退け', desc: '後ろへ下がって立て直す' },
    { k: '5', id: 'focus', label: '敵を狙え', desc: '照準の先の敵を集中して討つ' },
    { k: '0', id: 'gather', label: '集まれ', desc: '散った兵を自分のもとへ集め直す' },
    { id: 'gate', label: '門を破れ', desc: '近くの門・柵・逆茂木へ数人がかりで打ちかかる' },
  ];
  if (rank >= 1) base.push(...SQUAD_FORMS);
  // 鉄砲は一度目で前に並べて構え、二度目で一斉に放つ（弓は射撃の切り替え）
  if (rank >= 1) base.push({ k: '8', id: 'fire', label: '構え／放て', desc: '鉄砲は前に並んで構え、もう一度で一斉に放つ' });
  if (rank >= 1) base.push({ id: 'roll', label: '三段で撃て', desc: '鉄砲・弓が込め終えた者から代わる代わる撃ち、途切れさせない' });
  if (rank >= 1) base.push({ id: 'ceasefire', label: '撃ち方やめ', desc: '鉄砲・弓の組を構えから解き、撃つのをやめる' });
  if (rank >= 2) {
    base.push({ k: '6', id: 'move', label: '前進', desc: '照準の先の地点へ進む' });
    base.push({ k: '7', id: 'yari', label: '槍衾', desc: '横一列で槍を揃え正面を固める' });
    base.push({ k: '9', id: 'form', label: '陣形', desc: '横隊→方円→突撃' });
    base.push({ k: '-', id: 'face', label: '向き直れ', desc: '照準の方へ隊の正面を向ける（横を突かれた時）' });
  }
  return base;
}

const QUICK = { KeyZ: 'follow', KeyX: 'hold', KeyC: 'attack', KeyN: 'retreat' };
const QUICK_ENTRIES = Object.entries(QUICK);
// 火縄銃の込め直しにかかる秒（止まっている時）
export const GUN_RELOAD = 12;
// 手当ての布は二枚。形と材質は戦ごとに作り直さない。
const BANDAGE_GEO = new THREE.CylinderGeometry(0.095, 0.095, 0.16, 8);
const BANDAGE_MAT = new THREE.MeshLambertMaterial({ color: 0xc8b99c });

export class Player {
  constructor(rt, spawn) {
    this.rt = rt;
    const G = rt.G;
    this.G = G;
    const army = rt.army;
    this.group = army.addGroup({ team: 0, faction: scenario().faction, noRout: true, order: 'hold', name: 'player' });
    const look = playerLook(G);
    // 桶狭間・森部では本人の袖と威糸を生成りにする。足元の輪や札を足さず、具足の形は使い回す。
    if (rt.def.missionStyle === 'raid' || rt.def.missionStyle === 'ford') { look.cloth = 0xc8b99c; look.lace = 0xc8b99c; }
    this.sightHat = look.hat;
    this.u = army.addUnit(this.group, { type: 'player', x: spawn.x, z: spawn.z, heading: spawn.heading || 0, ...look });
    this.u.isPlayer = true;
    this.u.name = G.name;
    this.u.noHead = true;
    this.u.wpnKind = 'spear';
    this.hasKatana = G.owned.includes('katana');
    // 槍の拵えは持ち槍で変わる：数打・上質は素槍（一間半）、大身槍は長い穂、長柄は二間半
    {
      const sk = { spear2: 'omi', spear3: 'naga', spear4: 'jumonji' }[G.equip.weapon] || 'su';
      const sm = weaponMesh('spear', 0, sk);
      if (this.u.wpn && this.u.wpn.parent) this.u.wpn.parent.remove(this.u.wpn);
      this.u.hand.add(sm); this.u.wpn = sm;
    }
    this.spearMesh = this.u.wpn;
    this.slashN = 0;
    if (this.hasKatana) this.swordMesh = weaponMesh('sword');
    // 飛び道具（問屋で買った物）：火縄銃（3）と弓（4）。持ち替えて撃つ・射る
    this.hasGun = G.owned.includes('teppo');
    this.hasBow = G.owned.includes('yumi') || !!rt.def?.lendBow; // 戦で貸す弓（稲葉山＝弓を覚える戦。kaito 10/23）
    if (this.hasGun) this.gunMesh = weaponMesh('gun');
    this.u.gunRainCover = !!this.gunMesh?.userData.rainCover;
    if (this.hasBow) this.bowMesh = weaponMesh('bow');
    this.gunLoaded = true;     // 戦の始めは込めてある
    this.u.onGunResult = (result) => this.gunResult(result);
    this.gunAmmo = 19;         // 込めた一発と、携えた十九発。戦の間は有限。
    this.bowAmmo = 24;
    this.gunReload = 0;        // 込め直しの進み（0〜1）
    this.aiming = false;
    this.aimK = 0;             // 構えて狙う寄り具合（視野を狭める）
    this.aimHoldT = 0;
    this.gunTrigger = false; this.gunRelease = false;
    this.reloadPose = { t: 0, dur: GUN_RELOAD };
    this.meleePose = { kind: 'thrust', t: 0, dur: 0 };
    this.rangedPose = { ranged: true, bow: false, t: 0, dur: 0, target: null };
    this.rangedGround = { pos: { x: 0, y: 0, z: 0 }, mounted: false };
    this.rangedDir = new THREE.Vector3();
    this.shot = null;          // 火蓋を切ってから放つまで
    this.draw = 0;             // 弓を引き絞った長さ（秒）
    const vit = G.stats.vit - 1;
    this.u.maxHp = this.u.hp = 100 + vit * 10;
    restoreWounds(G, this.u, this.rt.def);
    this.maxSta = 100 + vit * 12;
    this.sta = this.maxSta;
    this.treatmentLeft = 2;
    this.treatmentNext = 0;
    this.treating = false;
    this.treatmentCloth = new THREE.Mesh(BANDAGE_GEO, BANDAGE_MAT);
    this.treatmentCloth.position.y = -0.34;
    this.treatmentCloth.visible = false;
    this.u.armL.add(this.treatmentCloth);
    this.treatmentCheckT = 0;
    this.bleedHelpAt = 0;
    this.treatmentReady = false;
    this.treatmentPoint = { x: 0, z: 0 };
    this.recentHits = [];
    this.def = equipDef(G);
    this.yaw = spawn.heading || 0;
    this.pitch = -0.12;
    this.weapon = 'spear';
    this.startGun = !!G.lord;   // 信長で遊ぶ時は鉄砲を持って始める
    this.startSword = G.mainArm === 'sword' && !G.lord;   // 武具屋で「刀で戦う」を選んだ時は刀で始める
    this.guard = false;
    this.guardT = 0;           // 構えてからの時間（受け流しの判定）
    this.guardBroken = 0;
    this.counterT = 0;         // 受け流し後の反撃猶予
    this.dodgeT = 0;
    this.iframe = 0;
    this.combo = 0;
    this.comboT = 0;
    this.cd = 0;
    this.buffer = 0;           // 先行入力
    this.pending = null;
    this.rallyCd = 0;
    this.staDelay = 0;
    this.running = false;
    this.vel = { x: 0, z: 0 };
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    // 一人称：fpK は 0（三人称）〜1（一人称）の寄り具合。eyeOff は足もとから目までのずれ（ならした物）
    this.fpK = 0;
    // 肩越しの近くの味方：入れ物と探索の関数は一度だけ作り、描いた後に戻す。
    this.nearAllyHid = [];
    this.nearAllyMats = [];
    this.nearSpearScales = [];
    this.nearSpearCache = new WeakMap();
    this.nearAllyMatCache = new WeakMap();
    this.nearAllyCam = null;
    this.nearSelfFadePart = (part) => this.nearAllyFadePart(part, false, 0);
    this.nearAllyVisit = (o) => {
      const u = this.u, cam = this.nearAllyCam;
      if (o === u || !o.alive || o.dying || o.isStruct || !o.mesh || !o.mesh.visible) return;
      const dx = o.pos.x - cam.position.x, dz = o.pos.z - cam.position.z;
      const radius = this.rt.def.nearAllyFadeRadius || 2.2;
      // 自分の胴へ向かう視線だけを透かす。隊列・当たり・攻撃は動かさない。
      const sx = u.pos.x - cam.position.x, sz = u.pos.z - cam.position.z;
      const len2 = sx * sx + sz * sz;
      const along = len2 > .01 ? (dx * sx + dz * sz) / len2 : -1;
      const lineY = cam.position.y + (u.pos.y + 1.3 + (u.mounted ? RIDE.y : 0) - cam.position.y) * along;
      const sightWidth = this.rt.def.nearAllySightWidth ?? .85;
      const blocksSelf = this.fpK < .5 && along > 0 && along < 1 &&
        (dx - sx * along) ** 2 + (dz - sz * along) ** 2 < sightWidth * sightWidth &&
        lineY > o.pos.y + .5 && lineY < o.pos.y + (o.mounted ? RIDE.y : 0) + 2.5;
      // 敵もカメラと自分の間だけ透かす。正面の戦う相手は濃く保つ。
      if (o.team !== u.team && !blocksSelf) return;
      // 自分の脇から行き先を覆う味方も、手前の一人だけ描く間避ける。
      // 人数・当たり・攻撃はそのまま。骨の姿と長柄も一緒に戻す。
      const goal = this.nearAllyGoal || this.rt.hud?.outlinedEnemy?.pos || this.rt.guideEnemy?.pos || this.rt.missionGuide?.pos;
      let blocksGoal = false;
      if (o.team === u.team && goal && dx * dx + dz * dz < (this.nearAllyGoal ? this.nearAllyGoalRadius2 : 16)) {
        const gx = goal.x - cam.position.x, gz = goal.z - cam.position.z;
        const gl2 = gx * gx + gz * gz;
        const t = gl2 > .01 ? (dx * gx + dz * gz) / gl2 : -1;
        const gy = cam.position.y + ((goal.y ?? u.pos.y) + 1 - cam.position.y) * t;
        // 桶狭間は胸だけでなく頭上の▼まで空け、笠で本人を隠さない。
        const headY = this.rt.def.missionStyle === 'raid' && this.nearFlagEnemy?.alive
          ? cam.position.y + (this.nearFlagEnemy.pos.y + (this.nearFlagEnemy.mounted ? 3.17 : 2.1) - cam.position.y) * t : gy;
        const goalWidth = (this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid') && o.mounted ? 1.8 : 1.2;
        blocksGoal = t > 0 && t < (this.nearAllyGoal ? .98 : .85) && (dx - gx * t) ** 2 + (dz - gz * t) ** 2 < goalWidth * goalWidth &&
          Math.max(gy, headY) > o.pos.y + .3 && Math.min(gy, headY) < o.pos.y + (o.mounted ? RIDE.y : 0) + 2.5;
      }
      if (blocksGoal) {
        // 全身を避ける戦では、行き先を塞ぐ味方にも半透明の残像を作らない。
        if (this.rt.def.nearAllyWholeOcclusion !== false) {
          this.hideNearFlag(o.mesh); this.hideNearFlag(o.human?.root); this.hideNearFlag(o.wpn);
          if (this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid') this.hideNearFlag(o.horse);
          this.hideNearFlag(o.flag); this.hideNearFlag(o.standardFlag);
          return;
        }
        const body = o.human?.root.visible ? o.human.root : o.mesh;
        body.traverseVisible(this.nearSelfFadePart);
        this.fadeNearFlag(o.wpn); this.fadeNearFlag(o.flag); this.fadeNearFlag(o.standardFlag);
        return;
      }
      // 指定のある戦では、騎手の高さから外れた視点も馬の胴の高さで拾う。
      const closeHorse = this.rt.def.nearAllyHorseFade && o.mounted && o.horse?.visible
        && Math.abs(o.pos.y + 1.3 - cam.position.y) < 2;
      if (!blocksSelf && (dx * dx + dz * dz > radius * radius
        || (!closeHorse && Math.abs(o.pos.y + 1.5 + (o.mounted ? RIDE.y : 0) - cam.position.y) > 2.4))) return;
      if (blocksSelf) {
        // 指定のある戦では、味方を部位ごとに透かさず、視線を塞ぐ間だけ全身を避ける。
        if (this.rt.def.nearAllyWholeOcclusion !== false) {
          this.hideNearFlag(o.mesh); this.hideNearFlag(o.human?.root); this.hideNearFlag(o.wpn);
          if (this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid') this.hideNearFlag(o.horse);
          this.hideNearFlag(o.flag); this.hideNearFlag(o.standardFlag);
          return;
        }
        // 頭・胴・手足は同じ濃さで残し、浮いた首や脚に見せない。
        const body = o.human?.root.visible ? o.human.root : o.mesh;
        body.traverseVisible(this.nearSelfFadePart);
        this.fadeNearFlag(o.flag); this.fadeNearFlag(o.standardFlag);
        return;
      }
      // 指定した徒歩の戦では全身を濃く残す。目が体に入る時だけ描く間避ける。
      // 顔・兜・胴を別々に透かして、首や具足の内側が浮いて見えるのを防ぐ。
      if (this.rt.def.nearAllySolidBody) {
        const rideHeight = this.rt.def.nearAllyWholeOcclusion && o.mounted ? RIDE.y : 0;
        if (cam.position.y >= o.pos.y - 0.2 && cam.position.y <= o.pos.y + rideHeight + 2.4) {
          this.hideNearFlag(o.mesh); this.hideNearFlag(o.human?.root); this.hideNearFlag(o.wpn);
          if (this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid') this.hideNearFlag(o.horse);
          this.hideNearFlag(o.flag); this.hideNearFlag(o.standardFlag);
        }
        return;
      }
      if (closeHorse) o.horse.traverse(this.nearAllyFadePart);
      if (this.rt.def.nearAllyBodyOnly) {
        this.hideNearFlag(o.flag); this.hideNearFlag(o.uma);
        this.hideNearFlag(o.human?.parts?.pole);
      }
      const h = o.human;
      // 本能寺の小袖は頭・手・裾を同じ濃さで透かす。胴の下半分だけ白い塊に残さない。
      if (this.rt.def.nearAllyClothFade && o.look?.honnoCloth) {
        if (h?.root.visible) h.root.traverseVisible(this.nearAllyFadePart);
        else o.mesh.traverseVisible(this.nearAllyFadePart);
        return;
      }
      const body = h?.root.visible ? h.root : o.mesh;
      body.traverseVisible(this.nearAllyFadePart);
    };
    this.nearAllyFadePart = (part, upperOnly = false, fadeLevel = null) => {
      if (!part?.isMesh || !part.material || !part.visible) return;
      let entry = this.nearAllyMatCache.get(part);
      // 先に全身を透かしていても、母衣の布を隠す指定を優先する。
      // 元へ戻す記録は一つのまま、布を隠す材質も部品ごとに使い回す。
      if (entry && part.material === entry.horo) return;
      if (entry && part.material === entry.faded) {
        if (upperOnly === 'horo' && entry.cutKind !== 'horo') {
          const level = Math.max(1, this.rt.def.nearAllyFadeLevel ?? 2);
          if (!entry.horo) entry.horo = Array.isArray(entry.source)
            ? entry.source.map((m) => ditherMat(m, level, 'horo')) : ditherMat(entry.source, level, 'horo');
          part.material = entry.horo;
        }
        return;
      }
      // 姿・装備が替わった時だけ支度する。同じ材質の半透明版は皆で使い回す。
      const level = fadeLevel ?? Math.max(1, this.rt.def.nearAllyFadeLevel ?? 2);
      if (!entry || entry.source !== part.material || entry.cutKind !== upperOnly) {
        const source = part.material;
        let cut = null;
        if (upperOnly === 'horo') cut = 'horo';
        else if (upperOnly) {
          if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
          const box = part.geometry.boundingBox;
          cut = box.min.y + (box.max.y - box.min.y) * 0.55;
        }
        entry = { part, source, cutKind: upperOnly, cut, level, variants: [], faded: Array.isArray(source) ? source.map((m) => ditherMat(m, level, cut)) : ditherMat(source, level, cut) };
        entry.variants[level] = entry.faded;
        this.nearAllyMatCache.set(part, entry);
      }
      // 視線から出入りしても、透かす濃さごとの材質と記録を使い回す。
      if (entry.level !== level) {
        entry.faded = entry.variants[level] || (entry.variants[level] = Array.isArray(entry.source)
          ? entry.source.map((m) => ditherMat(m, level, entry.cut)) : ditherMat(entry.source, level, entry.cut));
        entry.level = level;
      }
      part.material = entry.faded;
      this.nearAllyMats.push(entry);
    };
    this.nearFlagFadePart = (part) => {
      if (!part.isMesh || !part.visible) return;
      // 桶狭間・森部は透けた旗の四角も斬る相手を隠す。遮る間だけ避け、描画後に戻す。
      if (this.rt.def.missionStyle === 'raid' || this.rt.def.missionStyle === 'ford') { this.hideNearFlag(part); return; }
      // 大写しの布は透かしても四角い面が残る。描く間だけ避ける。
      if (this.flagCoversScreen(part, this.rt.camera)) this.hideNearFlag(part);
      else this.nearAllyFadePart(part, false, 0);
    };
    this.eyeOff = null;
    this.bobT = 0;
    // 一人称の時は、描く直前に自分の頭・兜・指物を隠し、描いた後に戻す（影や写真モードには残す）
    //   前に付いた仕掛け（world.js の描く直前の遠景選び）を消さずにつなぐ
    { const ob = rt.scene.onBeforeRender, oa = rt.scene.onAfterRender;
      rt.scene.onBeforeRender = (r, sc, cam, t) => { ob.call(sc, r, sc, cam, t); this.fpHide(true, cam); };
      rt.scene.onAfterRender = (r, sc, cam, t) => { oa.call(sc, r, sc, cam, t); this.fpHide(false); }; }
    this.inCombatT = 0;
    this.cmdOpen = false;
    this.cmdOpenT = 0;
    this.selGroup = 'all';
    this.lock = null;
    this.zoom = 0;
    this.shoulder = 1;
    this.shake = 0;
    this.stepT = 0;
    this.aimed = null;
    this.inRange = false;
    this.chargeT = 0;          // 溜め突きの溜め
    this.guardOn = false;      // 構えの切替式
    this.sdx = 0; this.sdy = 0;
    this.lookIdle = 0;
    this.D = DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
    // 重い胴は走ると気力の減りが早く、軽い胴は遅い
    this.heavy = G.equip.body === 'body2' ? 1.3 : G.equip.body === 'body0' ? 0.85 : 1;
    this.spearCd = ITEMS[G.equip.weapon].cd || 1;
    this.jumonji = !!ITEMS[G.equip.weapon].jumonji;   // 十文字槍：鎌で引き倒す・二人を薙ぐ
    this.movedAcc = 0;
    // 馬（足軽大将から）。始めは乗っている
    this.step = ladderStep(G);
    // 谷道や屋内など、馬を使わない戦では本人も徒歩で出陣する。
    this.canRide = canRide(G) && !rt.def.noHorse;
    this.mounted = false;
    this.hspd = 0;
    if (this.canRide) {
      const H = myHorse(G);
      this.horseName = H.name;
      this.horseSpeed = H.speed;
      this.horseMax = Math.round((150 + 20 * (this.step - 2)) * H.hpMul);
      const condition = G.horse?.condition;
      this.horseHp = this.horseMax * Math.max(0, Math.min(1, condition?.health ?? 1));
      this.hfat = Math.max(0, Math.min(1, condition?.fatigue || 0));
      this.maxBreath = Math.round(100 * H.breathMul); this.breath = this.maxBreath;
      this.yariResist = H.id === 'iwane' ? 0.6 : 1;
      if (this.horseHp > 0) {
        const style = horseStyle(this.step, H.coat, H.kind);
        this.horse = buildHorse(army.world.def.horseCoat ? army.world.def.horseCoat(style, this.u.id) : style);
        this.ownedHorse = this.horse;
        army.setMounted(this.u, true, this.horse);
        this.mounted = true;
      }
      this.loose = null;       // 降りたときの馬（その場で待つ・口笛で来る・逃げる）
    }
  }

  update(dt, input, controlDt = dt) {
    if (this.startGun) { this.startGun = false; if (this.hasGun) this.switchWeapon('gun'); }
    if (this.startSword) { this.startSword = false; if (this.hasKatana && this.weapon === 'spear') this.switchWeapon('sword'); }
    const u = this.u;
    this.lock = null; this.guardOn = this.guard = u.guard = u.dodging = false;
    this.dodgeT = -1; this.iframe = 0;
    if (!u.alive) {
      this.cancelAttack(); this.guardOn = this.guard = this.aiming = u.guard = false; this.lock = this.aimed = null;
      if (this.mounted) this.fall();
      this.updateLoose(dt);
      return;
    }
    // よろめき・ねじれの戻り
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.knockT > 0) this.knockT -= dt;
    if (this.gunHurtT > 0) this.gunHurtT -= dt;
    if (this.twist) { const k = Math.min(1, dt * 9); // 打たれても視点は回さない（kaito 10/24）
      this.twist *= (1 - k); if (Math.abs(this.twist) < 0.002) this.twist = 0; }
    const rt = this.rt;
    const army = rt.army;
    const treating = this.treating;
    this.cliffRescue(rt);
    // 火皿へ移った火は、よろめきや担ぎで取り消せない。
    if (this.shot?.pan && (u.climb || this.knockT > 0 || this.staggerT > 0.5 || u.stagger > 0.5 || rt.flags?.carry || treating)) {
      this.shot.t -= dt;
      if (this.shot.t <= 0) { const sh = this.shot; this.shot = null; this.fireShot(sh.aimed, true, sh.held); }
    }
    this.treatmentCloth.visible = treating || !!this.bandaged;
    this.treatmentCloth.scale.y = this.bandaged ? 1 : 0.25 + 0.75 * (rt.holdPct || 0);
    this.time = (this.time || 0) + dt;
    this.comboHitT = (this.comboHitT || 0) - dt;
    if (this.comboHitT <= 0) this.hitChain = 0;
    this.updateLook(controlDt, input);
    // 回し車で視点の距離を変える。
    if (input.wheel && !this.radial) {
      const before = this.zoom;
      this.zoom = Math.max(-1.6, Math.min(3.5, this.zoom + input.wheel * 0.0025));
      if (before !== this.zoom && (this.zoom === -1.6 || this.zoom === 3.5) && !(this.zoomTipT > rt.t)) {
        this.zoomTipT = rt.t + 8; rt.hud.flash(this.zoom < 0 ? 'いちばん近い視点' : 'いちばん遠い視点', 'dim');
      }
    }
    if (!this.lock) this.wheelAcc = 0;
    // [ ] で視点の感度をその場で変える
    if (!simpleControls(rt) && input.pressed('BracketLeft')) { S.sens = Math.max(0.3, +(S.sens - 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    if (!simpleControls(rt) && input.pressed('BracketRight')) { S.sens = Math.min(2.5, +(S.sens + 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    this.lock = null;
    if (!simpleControls(rt) && input.pressed('KeyT')) { this.shoulder *= -1; sfx('ui'); rt.hud.flash(this.shoulder > 0 ? '右肩から見る' : '左肩から見る', 'dim'); }
    // V：短く押すと視点を回す（三人称の近い・普通・遠い、一人称）。長く押している間は「大将の目」で高くから見渡す（身分が上がるほど高く）
    // 足軽の簡単操作でも視点は切り替えられる。教えの間も押した瞬間に一度だけ切り替える。
    if (input.pressed('KeyV')) {
      if (simpleControls(rt) || rt.def.missionStyle === 'lesson' && rt.flags.lesson === 'view') {
        this.vHeld = null; this.overHold = false; this.toggleView();
      } else { this.vHeld = 0; this.vStartedAt = performance.now(); }
    }
    if (this.vHeld != null) {
      if (input.key('KeyV')) { this.vHeld = Math.max(0, (performance.now() - this.vStartedAt) / 1000); this.overHold = this.vHeld > 0.35 && !simpleControls(rt); }
      else { if (this.vHeld <= 0.35) this.toggleView(); this.vHeld = null; this.overHold = false; }
    }
    this.showSquad = input.key('AltLeft') || input.key('AltRight');
    // ---- 号令・操作 ----
    if (simpleControls(rt)) { this.cmdOpen = false; this.radial = false; this.radialKeyboard = false; this.tabT = null; }
    const hasSquad = rt.squad.length > 0;
    // Tab：短く押すと指揮パネル、長押しで号令の輪（マウスで方向を選び、放して決める）
    if (this.radialKeyboard && S.radialTime !== 'run') rt.game.slowmo = Math.max(rt.game.slowmo || 0, 0.08);
    if (!simpleControls(rt) && hasSquad && !this.radialKeyboard) {
      if (input.pressed('Tab')) { this.tabT = 0; this.radialVec = { x: 0, y: 0 }; this.radialSel = -1; this.radialPreview = -1; }
      if (input.key('Tab')) {
        // 戦の始まりから押しっぱなしだった場合にも備える
        if (this.tabT == null || !this.radialVec) { this.tabT = this.tabT || 0; this.radialVec = { x: 0, y: 0 }; this.radialSel = -1; }
        this.tabT = (this.tabT || 0) + dt;
        if (this.tabT > 0.22 && !this.radial) { this.radial = true; this.cmdOpen = false; sfx('ui'); }
        // 号令の輪を開いている間は、時がゆっくり流れる（設定の radialTime が 'run' なら流れたまま）
        if (this.radial && S.radialTime !== 'run') rt.game.slowmo = Math.max(rt.game.slowmo || 0, 0.08);
        if (this.radial) {
          // 輪を開いたまま G で号令先（全隊・槍・鉄砲・弓・騎馬）を切り替えられる
          if (input.pressed('KeyG')) this.cycleGroup();
          this.syncRadial();
          this.radialVec.x += input.dx; this.radialVec.y += input.dy;
          const L = Math.hypot(this.radialVec.x, this.radialVec.y);
          if (L > 140) { this.radialVec.x *= 140 / L; this.radialVec.y *= 140 / L; }
          if (L > 25) {
            const a = (Math.atan2(this.radialVec.x, -this.radialVec.y) + Math.PI * 2) % (Math.PI * 2);
            const i = Math.round(a / (Math.PI / 4)) % 8;
            const it = RADIAL[i];
            this.radialPreview = i;
            this.radialSel = it.min && this.G.rank < it.min ? -1 : i;
          } else { this.radialSel = -1; this.radialPreview = -1; }
        }
      } else if (this.tabT !== undefined && this.tabT !== null) {
        if (this.radial) {
          this.radial = false;
          if (this.radialSel >= 0) { const id = RADIAL[this.radialSel].id; if (id === 'rally') this.rally(); else this.command(id); rt.tutMark('radial'); }
        } else if (this.tabT <= 0.22) { this.cmdOpen = !this.cmdOpen; this.cmdOpenT = 0; sfx('ui'); }
        this.tabT = null;
      }
    }
    if (this.cmdOpen) {
      this.cmdOpenT += dt;
      if (this.cmdOpenT > 6 && !document.getElementById('cmdpanel')?.contains(document.activeElement)) this.cmdOpen = false;
      for (const c of commandList(this.G.rank)) if (c.k && input.pressed(c.k === '-' ? 'Minus' : 'Digit' + c.k)) { this.command(c.id); this.cmdOpen = false; }
      if (input.pressed('KeyG')) { this.cycleGroup(); this.cmdOpenT = 0; }
    } else if (!treating) {
      if ((input.pressed('Digit1') || input.pressed('WeaponSpear')) && this.weapon !== 'spear') this.switchWeapon('spear');
      if (input.pressed('Digit2') && this.weapon !== 'sword') { if (this.hasKatana) this.switchWeapon('sword'); else rt.hud.flash('刀を持っていない（城下の問屋で買える）', 'dim'); }
      if (input.pressed('Digit3') && this.weapon !== 'gun') { if (this.hasGun) this.switchWeapon('gun'); else rt.hud.flash('火縄銃を持っていない（城下の問屋で買える）', 'dim'); }
      if (input.pressed('Digit4') && this.weapon !== 'bow') { if (this.hasBow) this.switchWeapon('bow'); else rt.hud.flash('弓を持っていない（城下の問屋で買える）', 'dim'); }
      // 次の武器へ（触る端末の持ち替え釦から送る）
      if (input.pressed('WeaponNext')) { const L = this.weaponList(); this.switchWeapon(L[(L.indexOf(this.weapon) + 1) % L.length]); }
    }
    if (!simpleControls(rt) && hasSquad) for (const [k, id] of QUICK_ENTRIES) if (input.pressed(k)) this.command(id);
    if (!simpleControls(rt) && input.quickCmd && hasSquad) this.command(input.quickCmd);
    // 鼓舞のキーは無くした（kaito 10/23 稲生 55）。
    if (!treating && input.pressed('KeyE')) rt.interact();
    if (!treating && input.pressed('KeyR')) this.toggleMount();
    this.mountT = (this.mountT || 0) - dt;
    this.updateLoose(dt);
    this.updateTake(dt);
    if (!treating) this.updateLadderUse(dt);

    // ---- 移動 ----
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let ix = 0, iz = 0;
    if (input.key('KeyW')) iz += 1;
    if (input.key('KeyS')) iz -= 1;
    if (input.key('KeyD')) ix += 1;
    if (input.key('KeyA')) ix -= 1;
    if (!input.key('KeyW') && !input.key('KeyA') && !input.key('KeyS') && !input.key('KeyD') && input.axis && Math.hypot(input.axis.x, input.axis.y) > (input.touchMoving ? 0 : 0.18)) { ix = input.axis.x; iz = -input.axis.y; }
    if (this.u && this.u.climb) { ix = 0; iz = 0; }   // 梯子を登る間は歩かない（siege_ladder.js）
    if (treating) { ix = 0; iz = 0; }   // 布を巻く間は足を止める。放せば中断して退ける。
    this.inX = ix; this.inZ = iz;   // 押している向き（技の出し分けに使う）
    let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const mlen = Math.hypot(mx, mz);
    const ml = Math.min(1, mlen);
    if (mlen > 0) { mx /= mlen; mz /= mlen; }
    this.guardBroken -= dt;
    // 弓・鉄砲は攻撃一つで放つ。受けと狙いの固定は使わない。
    this.guardOn = this.guard = u.guard = false;
    this.guardOffT = -9;
    const ranged = this.weapon === 'gun' || this.weapon === 'bow';
    const gunHold = this.weapon === 'gun' && this.gunLoaded && (input.left || input.leftPressed || this.gunTrigger || this.gunRelease);
    this.aiming = !treating && !u.climb && !(this.knockT > 0) && ranged && (gunHold || this.weapon === 'bow' && (input.left || this.bowTrigger));
    // 前へ素早く二度押しでも走る（Shift でも走れる。kaito 10/23 稲生 16 で戻した）
    const fwdKey = S.binds?.forward || 'KeyW';
    if (input.pressed(fwdKey)) { if (this.lastW != null && this.time - this.lastW < 0.3) this.dblRun = true; this.lastW = this.time; }
    if (!input.key(fwdKey)) this.dblRun = false;
    const shift = input.key('ShiftLeft') || input.key('ShiftRight') || input.runHeld || this.dblRun;
    if (S.runToggle) {
      if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) this.running = !this.running;
      if (input.axis) this.running = !!input.runHeld;
      if (ml === 0) this.running = false;
    } else this.running = shift;
    if (this.mounted) this.rideMove(this.running ? controlDt : dt, input, iz, mx, mz, ml);
    else {
      // 技の出始めだけ駆け足を控える。打ち終わってから三秒も歩かせない。
      // 息切れ後は三割まで歩いて戻す。走る・歩くを毎コマ繰り返さない。
      // 10/22 kaito「体力がなくなったら動きが遅くなるの、イライラする」：息切れ・傷・気力で足を遅くしない（走りもいつでも）
      this.runRest = false;
      const canRun = this.running && ml > 0 && !this.guard && !this.aiming && !(this.draw > 0) && !this.pending && !this.assistImpact && !(u.swing && u.swing.t < Math.min(0.18, u.swing.dur));
      // よろめいている間は足が思うように出ない（騎馬に倒された時はほとんど動けない）
      // 撃たれた後しばらくは足が重い（走れても遅い。gunHurtT が減るにつれ戻る）
      const moveDt = controlDt;
      const shot = 1;
      // 深手（体力が三割を切る）は足が重い：歩みも走りも鈍る（傷の深さに応じて）
      const wound = !TOFF ? Math.max(0, 1 - u.hp / (u.maxHp * 0.5)) : 0;
      const lowHp = 1;
      const tf = terrainFx(rt.world, u, u.pos.x, u.pos.z, uphillAt(rt.world, u.pos.x, u.pos.z, mx, mz));
      u.terrain = tf.tag; u._tdef = tf.def; u._tdefHigh = tf.defHigh;
      const mud = tf.spd;
      const speed = mud * (this.guard || this.aiming || this.draw > 0 || this.charging ? 2.0 : canRun ? 5.8 : 3.7) * ml * shot * lowHp * (this.knockT > 0 ? 0.1 : this.staggerT > 0 ? 0.45 : 1);
      this.staDelay -= dt;

      this.dodgeT = -1; this.iframe = 0;
      let tvx = mx * speed, tvz = mz * speed;
      // 溜め・技の間は足が鈍る。ただし一コマで落とさず、なめらかに緩めて戻す（走りながら突く時に足が止まってはまた走る、のカクつきを無くす）
      const slowTo = this.pending ? 0.55 : u.swing && u.swing.t < Math.min(0.18, u.swing.dur) ? 0.7 : 1;
      this.atkSlow = (this.atkSlow ?? 1) + (slowTo - (this.atkSlow ?? 1)) * Math.min(1, dt * 14);
      tvx *= this.atkSlow; tvz *= this.atkSlow;
      // 最も重い具足でも、平地の出足は〇・三秒で七割。止まりは短く、重みは少し残す。
      const heavy = Math.max(0, Math.min(0.5, this.def || 0));
      const tsp = Math.hypot(tvx, tvz), csp = Math.hypot(this.vel.x, this.vel.z);
      const acc = 1 - Math.exp(-moveDt * (ml > 0 ? (tsp > csp + 1 && tsp > 5 ? 6 : 12) - heavy * 3 : 16 - heavy * 4));
      this.vel.x += (tvx - this.vel.x) * acc;
      this.vel.z += (tvz - this.vel.z) * acc;
      let vx = this.vel.x, vz = this.vel.z;
      if (treating) { vx = 0; vz = 0; }
      // 重いコマでも走行時間を捨てない。当たりの小刻みな確認は movePlayer が行う。
      this.movePlayer(moveDt, vx, vz);
      vx = u.vel.x; vz = u.vel.z;
      this.vel.x = vx; this.vel.z = vz;
      const sp = Math.hypot(vx, vz);
      // 徒歩の走りの負担を六割に。坂・悪路・重い具足・傷の負担は残す。
      if (canRun && sp > 0.1) { this.sta -= (100 / 60) * 0.6 * this.heavy * (1 + wound * 0.65) * (1 + tf.tire * 0.6) * dt; this.staDelay = 0.4; rt.tutMark('run'); }
      else if (this.staDelay <= 0) this.sta += (this.guard ? 5 : sp > 0.2 ? 10 / (1 + tf.tire) : 22) * (1 - wound * 0.5) * dt;
      this.sta = Math.max(0, Math.min(this.maxSta, this.sta));
      this.movedAcc += sp * dt;
      if (this.movedAcc > 6) rt.tutMark('move');
      if (this.guard && this.guardT > 0.4) rt.tutMark('guard');
      u.moving = Math.min(1.4, sp / 3.5);
      u.dodging = false;
      u.u_dodging = this.iframe > 0;
      // 足音と具足の音
      if (sp > 0.8) {
        // 長い山道では四秒鳴らして二秒休み、同じ足音と具足音を連打し続けない。
        if (rt.world.def.quietMarch) this.marchSoundT = ((this.marchSoundT || 0) + dt) % 6;
        this.stepT -= dt * sp;
        if (this.stepT <= 0) {
          this.stepT = 1.6;
          // 足音は地面で変わる（雨・砂・道・草）
          const W = rt.world;
          const onPath = (W.def.paths || []).some((pth) => distToPolyline(u.pos.x, u.pos.z, pth) < 3);
          const sandy = W.def.water ? u.pos.x > W.def.water.x - 16 || (Math.abs(u.pos.x) < 18 && Math.abs(u.pos.z) < 18) : false;
          // 川・浅瀬を渡る時は、水を蹴る音
          const wade = this.inWater();
          if (wade) W.spray(u.pos.x, u.pos.z, 3);
          const room = NAKA.cur;
          let stepSound;
          if (room) {
            const dx = u.pos.x - room.I.x, dz = u.pos.z - room.I.z;
            const floor = interiorFloorAt(room.lv.layout, dx * room.I.c - dz * room.I.s, dx * room.I.s + dz * room.I.c);
            stepSound = floor === 'tatami' ? 'stepTatami' : floor === 'earth' ? 'step' : 'stepWood';
          } else stepSound = wade ? 'wade' : W.rainLevel > 0.3 ? 'stepWet' : sandy ? 'stepSand' : onPath ? 'stepPath' : 'step';
          // 同じ足音と鎧の音を長く続けず、四秒ごとに二秒の間を置く。
          if (this.stepSoundName !== stepSound || rt.t - (this.stepSoundLast ?? -99) > 1.1) {
            this.stepSoundName = stepSound; this.stepSoundSince = rt.t; this.stepSoundRest = 0;
          }
          this.stepSoundLast = rt.t;
          if (rt.t >= (this.stepSoundRest || 0)) {
            if (rt.t - this.stepSoundSince >= 4) { this.stepSoundRest = rt.t + 2; this.stepSoundSince = this.stepSoundRest; }
            else if (!W.def.quietMarch || this.marchSoundT < 4) {
              sfx(stepSound, wade ? 0.8 : 0.6); if (this.def > 0.1) sfx('clank', 0.8);
            }
          }
          if (sp > 5 && !room) rt.world.puff(u.pos.x, u.pos.z, 3);
        }
        rt.stats.dist += sp * dt;
      }
      // 移動中にしばらく視点を動かさなければ、カメラが背後へ回り込む
      if (S.autoCam && !reduceMotion() && !this.lock && !(this.inCombatT > 0) && ml > 0 && this.lookIdle > 2.5 && iz >= 0) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 0.8);
      // 向き：構え・攻撃・狙い定め中はカメラ方向、それ以外は進行方向
      let want = null;
      // 一人称では、体はいつも見ている方を向く（振り向くと自分の背が見える、を防ぐ）
      if (this.guard || this.aiming || this.shot || this.pending || input.left || this.inCombatT > 0 || this.lock || this.fpK > 0.5) want = this.yaw;
      else if (ml > 0) want = Math.atan2(mx, mz);
      // 照準補助で相手へ向き直る時は、一コマで体を回さず、速く滑らかに向き直る（カメラも少し付いて来る）
      if (this.assist && this.assist.t > 0) {
        this.assist.t -= dt;
        want = this.assist.h;
        // 体だけ相手へ向け、視点は動かさない（勝手に視点を変えない。kaito 10/24）
        u.heading += angleDiff(u.heading, want) * Math.min(1, dt * 22);
      } else if (want !== null) u.heading += angleDiff(u.heading, want) * Math.min(1, dt * 16 * tf.turn);
      // 踏み込み（照準補助で半歩先の敵へ）：一コマで跳ばず、0.12 秒かけて滑るように寄る
      if (this.lunge && this.lunge.t > 0) {
        const k = Math.min(dt, this.lunge.t) / 0.12;
        const lx = u.pos.x, lz = u.pos.z, ly = u.pos.y;
        const nx = lx + this.lunge.x * k, nz = lz + this.lunge.z * k;
        if (this.canStep(lx, lz, nx, nz, ly)) {
          u.pos.x = nx; u.pos.z = nz;
          army.collide(u, dt);
          if (!this.canStep(lx, lz, u.pos.x, u.pos.z, ly)) { u.pos.x = lx; u.pos.z = lz; }
          u.pos.y = groundAt(rt.world, u.pos.x, u.pos.z, ly);
        }
        this.lunge.t -= dt;
      }

    }
    if (this.mounted && this.horseStopUntil > rt.t) {
      this.pending = null; this.buffer = 0; this.chargeT = 0; u.pAtk = null;
      this.cd = Math.max(this.cd, 0.2);
    }
    // ---- 攻撃 ----
    if (u.climb || this.knockT > 0 || this.staggerT > 0.5 || u.stagger > 0.5) this.cancelAttack();
    if (this.assistImpact) {
      const a = this.assistImpact; a.t -= dt;
      if (a.t <= 0 && (!this.lunge || this.lunge.t <= 0) && Math.abs(angleDiff(u.heading, a.h)) < 0.15) { this.assistImpact = null; this.strike(a.kind, a.third, false, true); }
      else if (a.t < -0.5) this.assistImpact = null;
    }
    const impact = this.swingImpact;
    if (impact && u.swing !== impact.swing) this.swingImpact = null;
    else if (impact && impact.swing.t + dt >= impact.swing.dur * impact.swing.at) { this.swingImpact = null; this.strike(impact.kind, impact.third, true); }
    if (!treating && !u.climb && !(this.knockT > 0) && !(this.staggerT > 0.5) && !(u.stagger > 0.5) && !(this.mounted && this.horseStopUntil > rt.t)) {
    this.cd -= dt;
    this.comboT -= dt;
    this.inCombatT -= dt;
    this.counterT -= dt;
    this.buffer -= dt;
    if (u.alive) this.updateTells(dt);
    // 押した時に、構えから（構えている・解いた直後 0.4 秒）かを覚える
    const attackAction = input.leftPressed && !rt.flags?.carry && rt.def.attackAction?.(rt);
    if (attackAction) this.cancelAttack();
    else if (input.leftPressed) { this.buffer = Math.max(isTouch ? 0.32 : 0.22, Math.min(0.55, (this.cd > 0 ? this.cd : 0) + (this.pending ? this.pending.t : 0) + 0.12)); this.chargeT = 0; this.pressGrd = this.guard || this.time - (this.guardOffT ?? -9) < 0.4; }
    // 竹束などを担いでいる間（戦の定義の flags.carry）は、両手がふさがって突けない
    if (this.rt.flags && this.rt.flags.carry) {
      if (input.leftPressed && !(this.carryWarnT > this.rt.t)) { this.carryWarnT = this.rt.t + 8; this.rt.hud.flash('担いでいる間は突けない（据えてから）', 'dim'); }
      this.cancelAttack();
    }
    // 火縄銃・弓：左で撃つ・射る（槍・刀の攻めは出さない）
    if (!attackAction && (this.weapon === 'gun' || this.weapon === 'bow') && !rt.flags?.carry) { this.rangedUpdate(dt, input); this.buffer = 0; }
    else this.rangedIdle();
    // 近接は押した時の一撃だけ。長押しや離した時の追加攻撃は作らない。
    const blade = this.weapon === 'spear' || this.weapon === 'sword';
    this.chargeT = 0; this.charging = false; this.chargeCue = false;
    if (blade && !rt.flags?.carry && this.buffer > 0 && this.cd <= 0 && !this.pending && this.dodgeT <= 0) {
      this.buffer = 0;
      // 槍は押すたびに突き・突き・横払いを繰り返す。
      const kind = this.autoMeleeKind();
      if (this.weapon === 'spear') {
        if (this.sta >= 6) {
          this.combo = this.comboT > 0 ? this.combo + 1 : 1;
          const third = this.combo >= 3;
          this.sta -= kind === 'spin' ? Math.min(this.sta, 12) : kind === 'sweep' || kind === 'slam' ? Math.min(this.sta, 9) : 6;
          this.staDelay = 0.5;
          // 回しは振りかぶりが長く、戻りも長い（周り全員へ当たる分の間）
          this.pending = { t: kind === 'spin' ? 0.2 : kind === 'sweep' ? 0.08 : 0.12, kind, third: third || kind === 'slam', dir: 1 };
          this.cd = (kind === 'spin' ? 0.82 : kind === 'slam' ? 0.6 : kind === 'sweep' ? 0.48 : 0.42) * this.spearCd;
          if (third || kind === 'spin') this.combo = 0;
          this.comboT = this.cd + 0.65;
        } else rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      } else if (this.sta >= 5) {
        this.sta -= 5; this.staDelay = 0.4;
        // 刀も押すだけ。続けた一撃は自然に切り返す。
        {
          this.kCombo = this.comboT > 0 ? (this.kCombo || 0) + 1 : 1;
          const third = this.kCombo >= 3 && this.sta >= 4;
          this.slashK = third ? 'kesa' : this.kCombo === 2 ? 'gyaku' : 'kesa';
          if (third) { this.kCombo = 0; this.sta -= 4; this.techNote('kesa'); } else if (this.kCombo === 2) this.techNote('kaeshi');
          this.pending = { t: third ? 0.16 : 0.1, kind: 'slash', third };
          this.cd = third ? 0.62 : this.kCombo === 2 ? 0.26 : 0.4;
          this.comboT = 0.7;
        }
      } else rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      // 息が上がると腕が重い：気力が三割を切ると、振りの出も戻りも遅くなる（いちばん切れた時で 1.35 倍）
      const tiredK = 1 + Math.max(0, 0.3 - this.sta / this.maxSta) / 0.3 * 0.35;
      if (tiredK > 1.01) { this.cd *= tiredK; if (this.pending) this.pending.t *= tiredK; }
      // 空振りでも次の技を待たせる戻りは半秒まで。気力の消費・回復は変えない。
      if (this.pending) this.cd = Math.min(this.cd, this.pending.t + 0.5);
      this.inCombatT = 3;
    }
    if (this.pending) {
      this.pending.t -= dt;
      // 構えから溜める動き（刀は振りかぶり、槍は引いて溜める）を見せる
      const p0 = this.pending;
      if (!p0.dur) p0.dur = Math.max(0.05, p0.t + dt);
      const pk = p0.kind === 'slash' ? this.nextSlash() : p0.kind === 'kthrust' ? 'tsuki' : p0.kind === 'nagi' ? 'yoko' : p0.kind === 'kara' ? 'kara' : p0.kind === 'spin' ? 'spinW' : p0.kind === 'sweep' ? 'sweep' : p0.kind === 'slam' ? 'slam' : p0.kind === 'butt' ? 'butt' : p0.kind === 'hook' ? 'hook' : 'thrust';
      const pose = this.meleePose; pose.kind = pk; pose.t = p0.t; pose.dur = p0.dur; u.pAtk = pose;
      if (this.pending.t <= 0) {
        const p = this.pending;
        this.pending = null;
        u.pAtk = null;
        this.pendDir = p.dir || 1;
        this.strike(p.kind, p.third);
      }
    }
    }
    this.trailTick(dt);
    // 穂先を相手に合わせる（近すぎれば柄を繰り込む）ための相手
    u.fitT = this.lock && this.lock.alive ? this.lock : this.aimed;

    // ---- 照準の状態（HUD用） ----
    // 間合いの予告は十分の一秒ごと。命中の保証ではなく、刃・射線・向き直りを分ける。
    const kind = this.previewMeleeKind();
    if (!(this.rangeAt > rt.t) || Math.abs(angleDiff(this.rangeHeading ?? u.heading, u.heading)) > 0.15 || this.rangeWeapon !== this.weapon || this.rangeKind !== kind) {
      this.rangeAt = rt.t + 0.1; this.rangeHeading = u.heading; this.rangeWeapon = this.weapon; this.rangeKind = kind;
      this.updateRangeCue(kind);
    }
    this.aimT = (this.aimT || 0) - dt;
    if (this.aimT <= 0 || (this.aimed && (!this.aimed.alive || this.aimed.woundOut || this.aimed.fleeing))) { this.aimT = 0.15; this.aimed = this.lock || this.aimEnemy(14); }

    // ---- 倒れた敵の鉄砲を拾う（近づくと「鉄砲を拾う」。E／指の端末は丸の釦） ----
    // 囲まれた知らせ（12 秒に一度）
    if (u.mobbed && !(this.mobWarnT > rt.t)) { this.mobWarnT = rt.t + 12; rt.bark(rt.def.battleVoices?.lines?.ally?.encircle2?.[0] || '囲まれた！　味方のいる所まで下がれ', true); }
    // 深手への知らせは一度。三割以上へ持ち直しても、再掲は一度まで。
    if (u.hp >= u.maxHp * 0.3) this.lowHpWarned = false;
    if (u.hp < u.maxHp * 0.3 && !this.lowHpWarned && (this.lowHpWarnN || 0) < 2 && !(this.lowHpWarnT > rt.t)) {
      this.lowHpWarned = true; this.lowHpWarnN = (this.lowHpWarnN || 0) + 1; this.lowHpWarnT = rt.t + 30;
      rt.bark(this.lastHit?.ranged && rt.t - this.lastHit.t < 8 ? '深手だ！　矢玉を避け、塀や屋敷の陰へ退け' : '深手だ！　組の者のいる所まで退け', true);
    }
    this.pickT = (this.pickT || 0) - dt;
    if (this.pickT <= 0 && !this.mounted) { this.pickT = 0.3; this.findGunPickup(); }

    // 旗の近くまで退くと、操作せず少しずつ命を戻す。
    this.updateTreatment(dt);
    this.rallyCd -= dt;
    // 揺れは直線でなく、ばねのように速く減って尾を引く
    this.shake = Math.max(0, this.shake * Math.exp(-dt * 3.2) - dt * 0.12);
    this.updateSquad(dt);
    // 討たれない武将に手傷を負わせた（units.js の generalWounded が woundQ に積む）
    if (army.woundQ && army.woundQ.length) for (const w of army.woundQ.splice(0)) this.generalWounded(w.u, w.src);
    if (this.lock && this.lock.woundOut) { this.lock = null; this.wheelAcc = 0; }
  }
}
// 役目ごとのファイルに分けた手を Player へ戻す（class の手と同じく数えない手として。10/27 分け直し）
for (const part of [PlayerMove, PlayerHurt, PlayerRanged, PlayerMelee, PlayerCommand, PlayerView, PlayerCamera]) for (const k of Object.getOwnPropertyNames(part.prototype)) if (k !== 'constructor') Object.defineProperty(Player.prototype, k, Object.getOwnPropertyDescriptor(part.prototype, k));
