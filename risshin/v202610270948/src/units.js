import { prepareQuality, qualityThink } from './army_quality.js';
import { woundTick } from './wounds.js';
import { gunWeather, rangedSupply } from './weapon_reality.js';
import { nanbanLook } from './nanban.js';
import { NAMED_GEAR } from './named_gear.js';
import { recoverGround, mountainWay } from './army_local_way.js';
import { officerSetup, officerEscort } from './officer.js';
import { cavalryRole } from './cavalry_tactics.js';
import { takedaRider, takedaRiderLook, takedaHorseStyle, takedaRiderFinish } from './takeda_kiba.js';
import { weatherSight, weatherSees } from './weather_gameplay.js';
import { INTERIOR_WALLS, interiorBlocked } from './shironaka.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, drawMon } from './textures.js';
import { sfx, withPan } from './audio.js';
import { S, MEM_TIGHT, CPU_LEAN } from './settings.js';
import { TIER } from './device_tier.js';
import { WIND_STATE, isNoRender, hasMultiDraw } from './world.js';
import { updateWaterBody, waterMaterial, waterBatchKey, refreshWaterMaterials } from './water_body.js';
// 役目ごとに分けたファイル
import { Group, Unit } from './units_group.js';
import { FACTION, TYPES, GENERALS, SKIN_TONES } from './units_data.js';
import { buildModel, modelBuilt, finalLook } from './units_look.js';
import { batchHumanParts, humanBatchBegin } from './army_human_batch.js';
import { groundAt } from './floors.js';
import { palOf } from './unit_pal.js';
import { horseStyleFor, buildHorse, paint, at, MAT, MAT_I, MAT_P, P, merge, RIDE, seatLegs, rng, EMBER_GEO, dropLazyGeo } from './units_model.js';
import { numberedFlag, FLAG_T, FLAG_W, flagBlocksView, fadedWeapon, fadeViewFlag, IMP, BATCH, LOD } from './units_flags.js';
import { ArmyCombat } from './army_combat.js';
import { ArmyFx } from './army_fx.js';
import { ArmyRanged } from './army_ranged.js';
import { ArmyGroups } from './army_groups.js';
import { ArmyThink } from './army_think.js';
import { ThinkBudget } from './army_budget.js';
import { ArmyDuel } from './army_duel.js';
import { ArmyMove } from './army_move.js';
import { bodiesWorkerTick } from './army_bodies_worker.js';
import { ArmyAnim } from './army_anim.js';
import { ArmyGround, fallenMaterial } from './army_ground.js';
import { signalWait } from './army_signals.js';
export { MK, UNIT_MAT, UNIT_WET, haoriFold, HORSE_HOOK, poseArms, SPEARS, spearSpec, arrowGeometry, makeWeapon, setBowDraw, kickSpear, ENEMY_HORSE, COATS, coatOf, animateHorse, soheiLook, headEnvelope, katoGeometry } from './units_model.js';
export { weaponMesh, LOD, IDLE } from './units_flags.js';
export { lookParts } from './units_look.js';
export { FORM_JA } from './units_group.js';
export { TYPES, GENERALS, SKIN_TONES, FACTION, RIDE, seatLegs, horseStyleFor, buildHorse, FLAG_T, IMP, buildModel, Group, Unit };
export { HOUSE_NAME, SWING, STAIN_PLANE, STAIN_TEX, roundDot, PCOL, erf, segHit, TOFF, clamp01, SW_POSE, SW_HASSO, SW_JODAN, lerpPose, RELOAD, GUN_POSE, BOW_POSE, _nk, _dUp, _dN, _dQ, _dI };

const TOFF = typeof location !== 'undefined' && /[?&]toff\b/.test(location.search);   // 試し：緊迫の仕組みを切る
let TATAKE_GEO = null;
const NO_OBR = THREE.Object3D.prototype.onBeforeRender;   // 部品ごとの描く前の仕掛けが無い印   // 竹束の形（giveTatake で一度だけ作る）
// 重なる音をまとめる：[そのまま鳴らす数, まとめた音の名]
const SOUND_BUNCH = { gun: [2, 'volley'], string: [3, 'volleyBow'], arrow: [3, null], hooves: [2, 'gallop'], neigh: [2, null], kin: [3, null], yoroi: [3, null], thunk: [3, null], hizara: [2, null], hit: [4, null] };
// 史実で生き延びる武将（invuln）の体力の下限（最大の何割）。ここまで削ると手傷を負って退く
export const WOUND_FLOOR = 0.35;
// 倒れる動き（animDeath）の長さ。これより後の倒れた体は、最後の姿勢のまま止める
export const DEATH_END = 2.2;
// 本物の兵（CPU で動かす者）の上限。姉川のように大軍がぶつかる戦でも、重さが兵の数に引きずられないように
const REALCAP = { low: 120, mid: 180, high: 250 };
const byCrowdTarget = (a, b) => a.target.id - b.target.id || a._crowdD - b._crowdD;
const byCameraDistance = (a, b) => (a.camD || 0) - (b.camD || 0);
// 遠い行軍・待機だけを間引く。接敵の確認は既存の升目と同じ関数を使い回す。
function countPlayerCrowd(o, army) {
  const P = army.playerUnit, c = army.crowdWork;
  // 指定した戦では、退いた負傷者を包囲する敵や支えの人数へ戻さない。
  if (army.world.def.crowdFighter && !army.world.def.crowdFighter(o)) return;
  if (!o.alive || o === P || o.noTarget || o.type === 'dummy' || o.type === 'porter' || o.fleeing ||
      Math.abs(o.pos.y - P.pos.y) > 1.8 || army.wallBetween(P.pos, -1, o.pos)) return;
  const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
  if (o.team !== P.team) {
    if (o.sidearm || o.type !== 'gun' && o.type !== 'bow') c.foe10++;
    if (d < 6 && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) {
      c.foe++;
      const a = Math.atan2(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
      c.sectors |= 1 << (Math.floor((a + Math.PI) / (Math.PI / 2)) & 3);
    }
  } else if (d < 6 && !o.rearWound && !o.woundOut && !o.dropped && !o.downed && (c.ally6++, d >= 4.5)) {
    // 6m 内の味方は囲まれる前の知らせに使う。支え（4.5m）には数えない。
  } else if (d < 4.5 && !o.rearWound && !o.woundOut && !o.dropped && !o.downed && !(o.pinT > army.time) && !(o.stagger > 0.7)) c.ally++;
}
function senseDetailEnemy(o, u) {
  if (!o.alive || o.team === u.team || o.noTarget || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
  if (dx * dx + dz * dz < 196) u.detailEnemy = true;
}
function distantIdle(u, dist) {
  return u.offscreen && dist > 80 && !u.target && !u.group.routed && !u.group.isPlayerSquad &&
    !u.atk && !u.swing && !(u.contactStopT > 0) && !u.fleeing;
}
// 判断だけの時計。近くの斬り合いは毎秒20回、遠い非交戦兵は8回。移動と攻撃の時計は保つ。
function unitThinkInterval(army, u, dist) {
  // 走る本人の近くと攻撃中の兵を優先し、周囲の索敵を一斉に行わない。
  if (army.playerRunning && dist > 8 && !u.atk && !u.swing && !u.bind && !u.charging && !u.hit && !(u.stagger > 0)) return dist < 30 ? 1 / 10 : 1 / 4;
  if (dist <= 30 || u.detailEnemy || u.atk || u.swing || u.bind || u.charging ||
      u.hit || u.stagger > 0 || u.fleeing || u.group.routed ||
      u.target && army.distTo(u, u.target) < Math.max(14, u.reach + 8)) return 1 / 20;
  // 熱の兆しから遠い兵の判断だけを間引く。近くの斬り合いの時計は保つ。
  return (window.__heatBackgroundLevel || window.__heatLevel || 0) >= 1 ? 1 / 4 : 1 / 8;
}
function unitThinkDelay(time, id, interval) {
  // 番号から決まる位相を使う。処理落ちしても、同時に期限を迎えた兵の時計が固まらない。
  const phase = (id * 0.61803398875 % 1) * interval;
  return (Math.floor((time + phase + 1e-6) / interval) + 1) * interval - phase - time;
}
function detailInterval(army, u, dist) {
  // 近い兵と斬り合いは毎コマ。遠い相手への追跡は、的がいるだけで毎コマへ戻さない。
  if (dist <= (u.offscreen ? 25 : 30) || u.name || u.isSub || u.atk || u.swing || u.bind || u.charging ||
      u.climb || u.perch || u.naka || u.hit || u.stagger > 0 || u.downed || u.pinT > army.time ||
      u.woundOut || u.rearWound || u.fleeing || u.group.routed || u.contactStopT > 0 ||
      Math.abs(u.push.x) + Math.abs(u.push.z) > 0.1) return 0;
  const target = u.target;
  if (target && (target.isPlayer || !target.alive || target.opened || target.noTarget || target.team === u.team ||
      army.distTo(u, target) < Math.max(14, u.reach + 8))) return 0;
  const farIdle = distantIdle(u, dist);
  if (!(u.detailSenseAt > army.time)) {
    u.detailEnemy = false;
    army.forNearIn(u.pos.x, u.pos.z, 14, 14, senseDetailEnemy, u);
    u.detailSenseAt = army.time + (farIdle ? 0.4 : 0.2 + (u.id % 5) * 0.02);
  }
  return u.detailEnemy ? 0 : farIdle ? 0.25 : dist > 100 || u.offscreen ? 0.1 : 0.05;
}
// 判断とは別の時計。追跡・接敵・押し合い・敗走はそのコマから戻す。
function motionUrgent(u, dist, interval) {
  return dist <= 30 || !interval || !!u.target || u.atk || u.swing || u.bind || u.charging ||
    u.hit || u.stagger > 0 || u.fleeing || u.group.routed || u.contactStopT > 0 ||
    Math.abs(u.push.x) + Math.abs(u.push.z) > 0.1;
}
function senseMotionContact(o, u) {
  if (o === u || !o.alive || o.isStruct || o.type === 'dummy' || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
  const radius = u.mounted || o.mounted ? 2.4 : Math.max(0.85, u.motionBodySpace || 0);
  if (dx * dx + dz * dz < radius * radius) u.motionContact = true;
}
function motionStep(army, u, dt, dist, interval) {
  u.motionDt = (u.motionDt || 0) + dt;
  const every = u.offscreen || dist > 70 ? 4 : 2;
  u.motionFrame = (u.motionFrame ?? u.id % every) + 1;
  if (!motionUrgent(u, dist, interval) && u.motionFrame < every) {
    // 味方との押し合いも待たせない。当たりの計算より先に、接触だけ安く調べる。
    u.motionContact = false; u.motionBodySpace = army.world.def.meleeBodySpace || 0;
    army.forNearIn(u.pos.x, u.pos.z, Math.max(2.4, u.motionBodySpace), Math.max(2.4, u.motionBodySpace), senseMotionContact, u);
    if (!u.motionContact) return 0;
  }
  const elapsed = u.motionDt;
  u.motionDt = 0; u.motionFrame = 0;
  return elapsed;
}
const unitMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
// 見えず影も落とさない兵の部品は辿らない。再表示時に全て求め直す。
// 当たりや得物が直接求める updateWorldMatrix は従来のまま使える。
function visibleUnitMatrixWorld(force) {
  const u = this._armyUnit;
  if (u?.alive && u.offscreen && !u.shOn && !u.dying && !u.dragging && !u.climb && !u.downed) {
    // 根の位置は更新し、見えない手足と旗へは降りない。再表示時は全て更新する。
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    this.matrixWorldNeedsUpdate = true;
    return;
  }
  // 画面外から差す影も、今の位置と姿勢へ揃える。
  unitMatrixWorld.call(this, force);
}
const _dUp = new THREE.Vector3(), _dN = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dI = new THREE.Quaternion();
const _camTip = new THREE.Vector3(), _camButt = new THREE.Vector3();

// 着物の色のずれ：k=0 そのまま、1 少し暗く柿渋（赤茶）寄り、2 少し明るく褪せる（灰に寄る）
const _cv = new THREE.Color(), _cw = new THREE.Color();
function clothVar(hex, k) {
  if (!k) return hex;
  _cv.setHex(hex);
  // 1：柿渋・土に染まって赤茶へ　2：日に褪せて灰がかる　3：洗いざらしで白ちゃける　4：泥で暗く濁る
  if (k === 1) { _cv.multiplyScalar(0.95); _cv.lerp(_cw.setHex(0x5a3522), 0.16); }
  else if (k === 2) { _cv.multiplyScalar(1.1); _cv.lerp(_cw.setHex(0x5c5a52), 0.2); }
  else if (k === 3) { _cv.lerp(_cw.setHex(0x6a6454), 0.3); }
  else { _cv.multiplyScalar(0.82); _cv.lerp(_cw.setHex(0x3a2e20), 0.2); }
  return _cv.getHex();
}

// ---------------- 軍勢の管理 ----------------
// まとめて描く兵の種類の番号（軽い兵の形：0 槍 1 鉄砲 2 弓 3 侍）
const IMP_KIND = { ashigaru: 0, gun: 1, bow: 2, samurai: 3, porter: 3 };   // 人足・逃げる人（porter）は得物を持たない侍の形（兜は無し）
// 画質「低」の遠い兵（10m より先。背丈が五十画素ほど）の部品は、頂点を 4cm の升でまとめた粗い形で描く（色・素材の印は元の頂点のまま）。
//   遠い形（lo）でも一人二千面ほどあり、百人の乱戦で二十万面を越えていた。人数・動き・並びは変えない
const COARSE_BY = new Map();
// iPhone：升でまとめた粗い形（部品ごと・升の大きさごとに別の形）は作らない。GPU process（約 600MB で切られる）に形が溜まる（10/19）
// 初めて見る形の頂点整理を描画中にまとめて行わない。完成までは元の形で全員を描く。
// 待ち行列は軍ごとに持ち、戦が終われば未完の仕事も一緒に手放す。完成した形だけ共有する。
function coarseGeo(g, work, cell = 0.04, minTri = cell > 0.06 ? 120 : 300) {
  const ck = cell + '|' + minTri;
  let C = COARSE_BY.get(ck);
  if (!C) COARSE_BY.set(ck, C = new WeakMap());
  const cached = C.get(g);
  if (cached !== undefined) return cached;
  const triN = (g.index ? g.index.count : g.attributes.position.count) / 3;
  if (triN <= minTri || g.morphAttributes.position || g.groups?.length > 1) { C.set(g, g); return g; }
  let pending = work.pending.get(C);
  if (!pending) work.pending.set(C, pending = new WeakSet());
  if (!pending.has(g)) { pending.add(g); work.jobs.push(makeCoarseGeo(g, cell, minTri, C)); }
  return g;
}
function* makeCoarseGeo(g, cell, minTri, C) {
  let r = g;
  const pos = g.attributes.position, n = pos.count, idx = g.index ? g.index.array : null;
  const triN = idx ? idx.length / 3 : n / 3;
  if (triN > minTri && !g.morphAttributes.position && !(g.groups && g.groups.length > 1)) {
    // 升の鍵は数（文字の鍵は一頂点ごとに捨てる物を作り、四倍遅くで一コマ一ミリ秒を使い切っていた）。升の並び・合わせ方は元のまま
    const map = new Map(), rep = [], remap = new Int32Array(n), sum = [];
    const flat = !pos.isInterleavedBufferAttribute && !pos.normalized && pos.itemSize === 3 ? pos.array : null;
    for (let i = 0; i < n; i++) {
      if (i % 512 === 0) yield;
      const x = flat ? flat[i * 3] : pos.getX(i), y = flat ? flat[i * 3 + 1] : pos.getY(i), z = flat ? flat[i * 3 + 2] : pos.getZ(i);
      const ix = Math.round(x / cell), iy = Math.round(y / cell), iz = Math.round(z / cell);
      const k = ix > -32768 && ix < 32767 && iy > -32768 && iy < 32767 && iz > -32768 && iz < 32767
        ? (ix + 32768) * 4294967296 + (iy + 32768) * 65536 + (iz + 32768) : ix + ',' + iy + ',' + iz;
      let j = map.get(k);
      if (j === undefined) { j = rep.length; map.set(k, j); rep.push(i); sum.push(0, 0, 0, 0); }
      remap[i] = j; const q = j * 4; sum[q] += x; sum[q + 1] += y; sum[q + 2] += z; sum[q + 3]++;
    }
    const tri = [];
    for (let t = 0; t < triN; t++) {
      if (t % 512 === 0) yield;
      const a = remap[idx ? idx[t * 3] : t * 3], b = remap[idx ? idx[t * 3 + 1] : t * 3 + 1], c = remap[idx ? idx[t * 3 + 2] : t * 3 + 2];
      if (a !== b && b !== c && a !== c) tri.push(a, b, c);
    }
    if (tri.length / 3 < triN * 0.8) {
      const out = new THREE.BufferGeometry();
      for (const name in g.attributes) {
        const at = g.attributes[name], sz = at.itemSize, arr = new at.array.constructor(rep.length * sz);   // 8 bit の色などは型を保つ
        for (let j = 0; j < rep.length; j++) {
          if (j % 512 === 0) yield;
          for (let k = 0; k < sz; k++) arr[j * sz + k] = at.array[rep[j] * sz + k];
        }
        if (name === 'position') for (let j = 0; j < rep.length; j++) { if (j % 512 === 0) yield; const q = j * 4; arr[j * 3] = sum[q] / sum[q + 3]; arr[j * 3 + 1] = sum[q + 1] / sum[q + 3]; arr[j * 3 + 2] = sum[q + 2] / sum[q + 3]; }
        out.setAttribute(name, new THREE.BufferAttribute(arr, sz, at.normalized));
      }
      out.setIndex(tri);
      out.userData = { ...g.userData };
      out.computeBoundingSphere();
      r = out;
    }
  }
  C.set(g, r);
}
// 一コマ約1ms、最大32手順。大きな形も128頂点・128面ずつ進める。
function advanceCoarse(work) {
  if (work.head >= work.jobs.length) return;
  const until = performance.now() + 1;
  let steps = 0;
  do {
    if (work.jobs[work.head].next().done) { work.jobs[work.head++] = null; }
  } while (work.head < work.jobs.length && ++steps < 32 && performance.now() < until);
  if (work.head === work.jobs.length) { work.jobs.length = 0; work.head = 0; }
}
// 兵の部品の影：部品の囲み（中心と半径）に合わせて置く楕円の玉。形ごとの囲みは一度だけ数える
const SHADOW_BLOB = new THREE.IcosahedronGeometry(1, 1);
// 12m より先の部品の影は二十面の玉（影の描き込みの升目では八十面と見分けが付かない）
const SHADOW_BLOB_LO = new THREE.IcosahedronGeometry(1, 0);
// 影専用の形は、描画順や人数の切り替えにかかわらず色と深さを書かない。
// 通常の兵の材質を使うと、影用の大きな囲みが黒い面として地面を隠しうる。
const SHADOW_ONLY_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const SHADOW_BOX = new WeakMap(), _shM = new THREE.Matrix4();
function shadowBox(g) {
  let m = SHADOW_BOX.get(g);
  if (m) return m;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, c = new THREE.Vector3(), h = new THREE.Vector3();
  b.getCenter(c); b.getSize(h).multiplyScalar(0.5).max(new THREE.Vector3(0.02, 0.02, 0.02));
  m = new THREE.Matrix4().compose(c, new THREE.Quaternion(), h);
  SHADOW_BOX.set(g, m);
  return m;
}
// 倒れた兵の補光の材質（army_ground.js fallenMaterial）で、元が兵の材質の物
// 一人だけの形をまとめる入れ物（soloDraw）：材質と頂点の作りごとに一つ。形の数・頂点・番号の上限
const SOLO = { on: true, multi: 2, pools: 10, shards: 3, g: 420, v: 150000, i: 480000 }, _soloM = new THREE.Matrix4();
// 満ちた入れ物で、二秒ほど使っていない形の場所のうち、大きさの足りるいちばん小さい所へ上書きする（無ければ -1）
// 束（BatchedMesh）専用の材質の写し。元の材質を束と普通の形で使い回すと、three が物の入れ替わりごとに
// 描き方を選び直し（getParameters・文字列の鍵）、毎秒数十MBの捨てる物を作っていた。写しは onBeforeCompile・鍵・defines を引き継ぐ。
const batchVariants = new WeakMap();
function batchVariant(mat) {
  if (!mat || !mat.isMaterial) return mat;
  let v = batchVariants.get(mat);
  if (!v) {
    v = mat.clone();
    v.onBeforeCompile = mat.onBeforeCompile;
    if (mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) v.customProgramCacheKey = mat.customProgramCacheKey;
    if (mat.defines) v.defines = Object.assign({}, mat.defines);
    v.userData = mat.userData;
    v.name = (mat.name || '') + '|batch';
    batchVariants.set(mat, v);
  }
  return v;
}
// 配列の長さだけを知る。GPU にだけ置いた形（main.js の gpuOnly）・束へ預けた形（_poolRef）は、長さを見るだけで読み戻さない
//   （読み戻しは GPU を待たせる。満ちた入れ物の空き探しで毎秒数回起きていた。10/23）
function soloNeedsReadback(g) {
  for (const k in g.attributes) if (g.attributes[k]._gpuRef) return true;
  return !!(g.index && g.index._gpuRef);
}
function arrayLength(a) { return a._gpuRef ? a._gpuRef.len : a._poolRef ? a._poolRef.len : a.array.length; }
function soloReuse(pool, g, nv, ni, frame) {
  if (pool.reuseOff) return -1;
  // 形の属性は後から変わることもある。初回の判定だけに頼らず、
  // 古い場所へ写す前に全属性の長さを確認し、合わなければ元の描き方に任せる。
  for (const name in pool.bm.geometry.attributes) {
    if (name === 'batchId') continue;
    const src = g.attributes[name], dst = pool.bm.geometry.attributes[name];
    if (!src || src.isInterleavedBufferAttribute || src.itemSize !== dst.itemSize ||
        src.normalized !== dst.normalized || src.count !== nv || arrayLength(src) !== nv * src.itemSize) return -1;
  }
  const R = pool.bm._reservedRanges;
  let best = -1, bestV = Infinity;
  for (let id = 0; id < R.length; id++) {
    if (frame - (pool.last[id] || 0) < 120) continue;
    const r = R[id];
    if (r.vertexCount < nv || (ni && r.indexCount < ni) || r.vertexCount >= bestV) continue;
    best = id; bestV = r.vertexCount;
  }
  if (best < 0) return -1;
  // 第百六十版は球を新しい形から写し、未計算なら無効化するため、
  // 次の視野判定で getBoundingSphereAt が古い球を使うことはない。
  if (pool.geos[best] && pool.geos[best] !== g) soloMaterialize(pool.geos[best]);
  try { pool.bm.setGeometryAt(best, g); }
  catch (err) {
    if (!(err instanceof RangeError)) throw err;
    // 転送途中の場所を再利用しない。元の描き方へ戻す。
    pool.reuseOff = true;
    pool.bm.setVisibleAt(best, false);
  }
  const old = pool.geos[best];
  if (old) { const a = pool.ids.get(old); if (a) { const j = a.indexOf(best); if (j >= 0) a.splice(j, 1); if (!a.length) pool.ids.delete(old); } }
  if (pool.reuseOff) { pool.geos[best] = null; return -1; }
  SOLO_STAT.reused++;
  return best;
}
// 束へ写した元の形の CPU の配列を手放す（束の配列に同じ中身がある。要る時は束の場所から写し戻す）。
//   一人（二人）だけの形は束で描くので three が送らず、gpuOnly（送った後に手放す）が効かず、
//   兵 237 人の形 97MB（＋遠さの段 14MB）が開戦の間ずっと二重に残っていた（森部・Chrome。10/20）
const SOLO_DROP_MIN = 4096;
const LAZY_IDLE_MS = 60000;   // 描かれなくなってから配列を手放すまでの時間
let LAZY_NOW = 0;
// 六秒ごとの省メモリ巡回を分割する。兵や部品の数が増えても一コマへ集めない。
function sweepLazyGeometries(army, now) {
  const w = army._lazySweep || (army._lazySweep = { active: false, unit: 0, end: 0, phase: 0, nodes: [], children: [], geo: 0 });
  if (!w.active) {
    if (now - army._lazySweepAt <= 6000) return;
    army._lazySweepAt = now;
    w.active = true; w.unit = 0; w.end = army.units.length; w.phase = 0;
  }
  const start = performance.now();
  let drops = 0;
  for (let steps = 0; steps < 64 && drops < 4; steps++) {
    if (performance.now() - start >= 0.5) break;
    if (w.unit >= Math.min(w.end, army.units.length)) { w.active = false; break; }
    const u = army.units[w.unit];
    let g = null;
    if (w.phase < 2) {
      const m = w.phase++ === 0 ? u.body : u.head;
      g = m && m.userData.lod && m.userData.lod[0];
    } else if (w.phase === 2) {
      w.phase = 3;
      // 倒れた兵だけでなく、生きた兵の全部品も見る（骨入りの人に替わって隠れている兵・束で描く兵の部品は 10 秒描かれないと手放す。10/21）
      if (u.mesh) { w.nodes.push(u.mesh); w.children.push(-1); w.geo = 0; }
    } else if (w.nodes.length) {
      const top = w.nodes.length - 1, o = w.nodes[top];
      if (w.children[top] === -1) {
        const lod = o.isMesh && o.userData.lod;
        const count = o.isMesh ? (lod ? lod.length : 1) : 0;
        if (w.geo < count) { g = lod ? lod[w.geo] : o.geometry; w.geo++; }
        else { w.children[top] = 0; w.geo = 0; }
      } else if (w.children[top] < o.children.length) {
        w.nodes.push(o.children[w.children[top]++]); w.children.push(-1); w.geo = 0;
      } else { w.nodes.pop(); w.children.pop(); }
    } else { w.unit++; w.phase = 0; }
    // 巡回の途中で描かれた形は残す。共有形を守る判定は元の解放処理へ任せる。
    //   手放すのは 60 秒描かれない形だけ（10 秒だと、乱戦で隠れては出る兵の形を毎分 180 回ほど作り直し、iPhone の WebContent を 2GB まで押して落ちていた。10/21）
    if (g && g.isBufferGeometry && g._make && !g._lazy && !g._lazyRestored && now - (g.userData.cpuUse || 0) > LAZY_IDLE_MS) {
      dropLazyGeo(g); drops++;
    }
  }
}
function soloDropArrays(pool, id, g) {
  const r = pool.bm._reservedRanges[id], bg = pool.bm.geometry;
  if (!r || (window.__apx && window.__apx.nosolo)) return;   // x_nosolo：実機で切って比べる
  const drop = (a, src, isIndex) => {
    const why = (w) => { SOLO_STAT.skip[w] = (SOLO_STAT.skip[w] || 0) + 1; };
    if (!a || !src) return why('nosrc'); if (a.isInstancedBufferAttribute || a.isInterleavedBufferAttribute) return why('inst'); if (a._gpuRef) return why('gpuRef'); if (a._poolRef) return why('poolRef');
    const d = Object.getOwnPropertyDescriptor(a, 'array');
    if (!d || d.get) return why('getter'); if (!a.array || a.array.byteLength < SOLO_DROP_MIN) return why('small'); if (!src.array) return why('srcarr'); if (a.array.constructor !== src.array.constructor) return why('ctor'); if (!!a.normalized !== !!src.normalized) return why('norm');
    SOLO_STAT.drop++;
    a._poolRef = { pool, id, src, ctor: a.array.constructor, len: a.array.length, start: isIndex ? r.indexStart : r.vertexStart * a.itemSize, sub: isIndex ? r.vertexStart : 0 };
    Object.defineProperty(a, 'array', {
      configurable: true, enumerable: true,
      get() { return soloRestore(this); },
      set(v) { this._poolRef = null; Object.defineProperty(this, 'array', { value: v, writable: true, configurable: true, enumerable: true }); },
    });
  };
  for (const k in g.attributes) drop(g.attributes[k], bg.attributes[k], false);
  if (g.index && bg.index && r.indexStart >= 0) drop(g.index, bg.index, true);
}
const SOLO_STAT = { drop: 0, restore: 0, poolsMade: 0, poolsDisposed: 0, reused: 0, full: 0, batchesMade: 0, batchesDisposed: 0, skip: {} };   // 確かめ用の数（window.__solo）
if (typeof window !== 'undefined') window.__solo = SOLO_STAT;
function soloRestore(a) {
  const ref = a._poolRef; a._poolRef = null;
  SOLO_STAT.restore++;
  const out = new ref.ctor(ref.len);
  const src = ref.src.array;
  if (src && ref.start + ref.len <= src.length) {
    out.set(src.subarray(ref.start, ref.start + ref.len));
    if (ref.sub) for (let i = 0; i < ref.len; i++) out[i] -= ref.sub;
  }
  Object.defineProperty(a, 'array', { value: out, writable: true, configurable: true, enumerable: true });
  return out;
}
// 束の場所を書き換える・束を返す前に、その場所から写し戻す形の配列を戻しておく
function soloMaterialize(g) {
  if (!g) return;
  for (const k in g.attributes) if (g.attributes[k]._poolRef) void g.attributes[k].array;
  if (g.index && g.index._poolRef) void g.index.array;
}
// 写した形の場所だけを送る（既定では入れ物の全部を送り直す）
function soloUpload(bm, id) {
  const r = bm._reservedRanges[id], geo = bm.geometry;
  for (const k in geo.attributes) { const a = geo.attributes[k]; a.addUpdateRange(r.vertexStart * a.itemSize, r.vertexCount * a.itemSize); }
  if (geo.index && r.indexStart >= 0) geo.index.addUpdateRange(r.indexStart, r.indexCount);
}
function fallenOf(m) { const f = m?.userData?.fallenSrc; return !!f && (f === MAT || f.userData?.waterSource === MAT); }
const FALLEN_KEYS = new WeakMap();
function fallenKey(geo, mat) {
  let m = FALLEN_KEYS.get(mat);
  if (!m) FALLEN_KEYS.set(mat, m = new WeakMap());
  let k = m.get(geo);
  if (!k) m.set(geo, k = {});
  return k;
}
export class Army {
  constructor(scene, world, hooks = {}) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.units = [];
    this.spawnJobs = [];
    this.pendingSpawn = 0;
    this.sndQ = [];
    this.sndPool = Array.from({ length: 64 }, () => ({ at: 0, name: '', pos: { x: 0, y: 0, z: 0 }, vol: 0 }));
    this.yieldPoints = [];
    this.lodCandidates = [];
    this.moraleSense = { u: null, horse: null, horseD: 100, runner: null, runners: 0 };
    this.groups = [];
    this.structs = [];
    this.arrows = [];
    this.prepareArrows();
    this.dead = [];
    this._lazySweepAt = 0;
    this.thinkWork = new ThinkBudget();
    this.bulletCandidates = [];
    this.prepareBullets();
    this.gridX0 = this.gridZ0 = Infinity;
    this.gridX1 = this.gridZ1 = -Infinity;
    this.gW = this.gH = this.gridN = 0;
    this.mountedList = [];
    this.playerShotAimers = [];
    this.cell = 6;
    this.lodT = 0;
    this.time = 0;
    this.buildParticles();
    this.tmpSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
  }

  addGroup(o) {
    const g = new Group(o);
    this.groups.push(g);
    return g;
  }

  addUnit(g, o) {
    // 古い戦の定義で別の家を借りている隊も、指定した旗に具足と衣を合わせる
    const fac = FACTION[o.flag] || (o.flag === 'namu' ? FACTION.ikko : o.flag === 'sagarifuji' ? FACTION.honganji : null)
      || FACTION[g.faction] || FACTION.oda;
    const u = new Unit({ team: g.team, ...o });
    u.group = g;
    u.slot = g.initial;
    g.units.push(u);
    g.initial++;
    const t = TYPES[u.type];
    // 名のある実在の武将は、その人の兜・甲冑・陣羽織で
    const gen = (o.name && GENERALS[o.name.replace(/^.* /, '')]) || {};
    // 名のある武将の得物と振るい方（named_gear.js）。戦が得物を指した時はそちら
    const gear = o.name && ['busho', 'samurai', 'cavalry'].includes(u.type) ? NAMED_GEAR[o.name.replace(/^.* /, '')] : null;
    const gearWeapon = o.weapon || gear?.weapon || t.weapon;
    // 大名・名将（gen.lord）：自分から斬り合いに出ず、指図は後ろから（army_think.js の持ち場判定で使う）
    u.isLord = !!gen.lord;
    u.namedShadow = !!gen.face || u.type === 'busho';
    officerSetup(u);
    // 使番は大将のいる隊の騎馬の二騎だけ。役目は保ち、姿は家の指物で示す。
    const horoCav = u.type === 'cavalry' && o.flag === undefined && (g._horoN || 0) < 2 && g.units.some((x) => x.type === 'busho');
    if (horoCav) g._horoN = (g._horoN || 0) + 1;
    cavalryRole(u, g, o, horoCav);
    // 見た目の組み合わせ（一人ずつ変えるが、形の数が増えすぎないよう六通りに束ねる）
    const detail85 = true && !u.isPlayer && !gen.face && u.type !== 'dummy';
    const vi = detail85 ? (Math.imul(u.id ^ 193, 1597334677) >>> 0) % 6 : u.id % 6;
    // 装備とは別の個体差。作る時だけ求め、形・材質・描く束は増やさない。
    const physique = (salt) => (Math.imul(u.id ^ salt, 1597334677) >>> 0) / 4294967296;
    // 画質「低」（携帯）：顔と着物のずれを減らし、同じ形の兵を増やす（形ごとに一つずつ描く回数が、兵の数に比べて多すぎるので）
    const lowQ = false;
    const tier = u.type === 'player' ? (o.tier ?? 0) : gen.armor ? 3 : u.type === 'busho' ? 3 : (u.type === 'samurai' || u.type === 'cavalry') ? 1 : 0;
    const privateArmor = tier === 1 && !gen.armor;
    const loanArmor = tier === 0 && ['ashigaru', 'bow', 'gun'].includes(u.type);
    const armor = o.armor ?? gen.armor ?? (loanArmor && fac.flag !== 'akazonae' ? 0xa27b50 : u.type === 'busho' ? (fac.busho ?? 0x1c1a1a) : privateArmor && fac.flag !== 'akazonae' ? [fac.armor, fac.busho ?? fac.armor, fac.armor][vi % 3] : fac.armor);
    const look = {
      detail85, armor, helm: o.helm ?? gen.helm ?? armor,
      hatColor: o.hatColor ?? (loanArmor ? (detail85 ? [fac.hatColor ?? fac.armor, 0x121110, 0x1c1916][vi % 3] : fac.hatColor ?? fac.armor) : undefined),
      doStyle: o.doStyle ?? (loanArmor ? fac.doStyle ?? 'okegawa' : privateArmor && vi % 3 === 1 ? 'okegawa' : undefined),
      // 貸し具足の胴は明るい革色、鎧下は紺。威は家の指定を使う
      lace: o.lace ?? gen.lace ?? (loanArmor ? fac.lace : [fac.lace, fac.lace2 || fac.lace, fac.lace3 || fac.lace][vi % 3]),
      // 足軽は揃いの陣笠。侍の兜は六通りの組み合わせ（指定した姿は優先）
      hat: (gen.hatFix && gen.hat) || (o.hat ?? gen.hat ?? (u.type === 'busho' ? 'kabuto_b' : privateArmor ? ['kabuto', 'kabuto_m', 'kabuto', 'kabuto_f', 'kabuto_w', 'kabuto_m'][vi] : loanArmor ? fac.hat ?? t.hat : t.hat)),
      tenugui: tier === 0 && (detail85 ? vi % 2 === 0 : vi === 2),
      kasaDrape: this.world.def.kasaDrape !== false && (o.kasaDrape ?? fac.kasaDrape ?? true),
      hachi: o.hachi,   // 鉢巻の色（手ごとに変えて、味方の手を見分ける）
      sode: loanArmor ? false : o.sode ?? (u.type === 'samurai' || u.type === 'cavalry' || u.type === 'busho'),
      kote: o.kote ?? (tier >= 1 ? 3 : undefined),
      // 陣羽織はマントに見えるので誰にも着せない（kaito 10/24「マントやめて」）。
      haori: 0,
      // 旗は数を減らし、大きさを揃える（kaito 10/23 稲生 48）。足軽の指物は三人に一人。隊旗の旗持ちだけ少し大きい。
      pole: o.flag !== null && u.type !== 'porter' && !(u.type === 'ashigaru' && !o.name && !o.flagScale && !o.standard && vi % 3 !== 0),
      flag: o.flag === null || u.type === 'porter' || (u.type === 'ashigaru' && !o.name && !o.flagScale && !o.standard && vi % 3 !== 0) ? null : (o.flag || gen.flag || fac.flag),
      flagScale: o.flagScale ?? 1,
      flagShape: o.flagShape ?? (loanArmor ? fac.flagShape ?? 0 : privateArmor ? vi % 3 : 0),
      standard: o.standard || null,
      // 戦の年代に合わせた具足。共有の表を参照し、近景と遠景で同じ装備を使う。
      kacchu: o.name ? this.world.def.namedKacchu?.[o.name.replace(/^.* /, '')] : null,
      weapon: gearWeapon, style: gear?.style || '',
      swordHand: gear?.swordHand,
      // 足軽の槍は長柄（5m ほど）
      weaponExtra: o.weaponExtra ?? (gearWeapon === 'sword' ? gear?.weaponExtra : 0) ?? 0,
      // 槍の拵え：足軽は長柄（三間。織田は三間半）、騎馬と侍は素槍、武将は大身槍
      spear: o.spear ?? (o.weaponExtra != null ? null : gear?.spear && gearWeapon === 'spear' ? gear.spear : u.type === 'ashigaru' && !o.weapon ? (g.faction === 'oda' ? 'nagae35' : 'nagae') : u.type === 'busho' ? 'omi' : 'su'),
      skin: o.skin ?? gen.skin ?? SKIN_TONES[vi],
      // 顔：名のある武将はその人の顔、本人は本人の顔、兵は十二の顔から
      face: o.face ?? (gen.face ? 'g:' + o.name.replace(/^.* /, '') : ((lowQ ? vi : detail85 ? vi + 6 * (Math.floor(u.id / 6) % 2) : u.id) * 7) % 12),
      // 鎧下・袴の色：藍・茶・鼠・黒
      //   同じ色でも人ごとに明るさと色あいを ±6% ずらす（褪せた藍・柿渋寄り・生成り寄り。形の数が増えすぎないよう三通り）
      cloth: (this.world.def.allyCloth && u.team === 0 && u.type === 'ashigaru' && !u.name ? this.world.def.allyCloth[u.id % this.world.def.allyCloth.length] : o.cloth) ?? clothVar((loanArmor ? [0x293e58, 0x304763, 0x25384f, 0x344b64, 0x293e58, 0x304763] : fac.cloth || [0x2b2622, 0x262c3a, 0x3a2e24, 0x34342e, 0x262c3a, 0x2b2622])[vi], lowQ ? 0 : Math.floor(u.id / 6) % 5),
      saya: u.type === 'samurai' || u.type === 'busho' || u.type === 'cavalry' || o.saya,
      menpo: o.menpo ?? (gen.armor ? gen.menpo || 0 : (u.type === 'busho' && vi % 2 === 0 ? 0x6a1c14 : u.type === 'samurai' && u.id % 2 === 0 ? 0x1c1a18 : 0)),
      menpoStyle: o.menpoStyle ?? gen.menpoStyle ?? (u.type === 'busho' ? 'hanbo' : 'full'),
      // 丸い母衣は自動で足さない。史実の武将や戦が明示した母衣だけ残す。
      // 武将の既定の母衣は背のマントに見えて安っぽい（kaito 10/23 稲生 8・18・24）。戦が明示した母衣衆だけ残す。
      horo: o.horo ?? 0,
      tier, vi, mon: o.mon ?? gen.mon ?? fac.flag, haoriMonCol: gen.haoriMonCol,
      trim: o.trim || 0, left: o.left || null, uma: o.uma || null, dirt: o.dirt, hero: u.type === 'player',
      // 本物の胴丸（humans.js の3Dスキャン）を着る（侍大将より上の本人など）
      real: o.real || (o.name && (u.type === 'busho' || o.horse) ? 1 : 0),
      officer: !!o.officer || !!(o.name && (u.type === 'busho' || o.horse)),
      // 僧兵（humans.js で白い裹頭・袈裟・薙刀を着せる）
      sohei: o.sohei || (o.kosode ? 1 : 0),
      bankCloth: !!(o.kosode && this.world.def.bankCloth),
      // 小袖姿（甲冑を着ない。寝所から出た信長・小姓・寺の僧。soheiLook の kosode の枝で衣だけにする）。bozu は剃った頭
      kosode: o.kosode || 0, honnoCloth: !!o.honnoCloth, kosodeCol: o.kosodeCol || 0, bozu: o.bozu || 0, obi: o.obi || 0,
    };
    const redRider = takedaRider(u, g, o) && !this.world.def.noHorse;
    if (redRider) u.horseBattle = 'mounted';
    if (redRider) takedaRiderLook(look, o.flag || (g.name.includes('真田') ? 'sanada' : g.faction));
    if ((o.name === '織田信長' || (u.type === 'player' && this.hooks.nobunaga)) && this.hooks.nanban && !o.kosode) Object.assign(look, nanbanLook(look));
    // 戦が指定した旗色だけ替える。具足・所属・兵の強さは元の家のまま。
    const fieldLook = this.world.def;
    // 貸し具足の家の色は保ち、六組の使い込みと仕立ての差を近景・遠景で共用する。
    // 見た目だけを替え、防御力・背丈・当たりの大きさは変えない。
    if (fieldLook.variedInfantry && loanArmor && !u.name && !lowQ) {
      if (o.armor == null || fieldLook.variedLoanArmor) look.armor = new THREE.Color(look.armor).lerp(new THREE.Color(0x726554), [0.04, 0.12, 0.08, 0.18, 0.06, 0.14][vi]).getHex();
      if (fieldLook.variedLoanArmor && o.dirt == null) look.dirt = [0.46, 0.64, 0.53, 0.72, 0.59, 0.68][vi];
      // 同じ貸し胴でも補修した威糸は褪せ方が違う。既存の六組だけで色を共用する。
      if (fieldLook.variedLoanArmor) look.lace = new THREE.Color(look.lace).lerp(new THREE.Color([0x555043, 0x84795f, 0x615e50, 0xa28c68, 0x70604c, 0x555b56][vi]), 0.38).getHex();
      if (o.hatColor == null) look.hatColor = new THREE.Color(look.hatColor ?? armor).lerp(new THREE.Color(0x84745b), [0.12, 0.04, 0.2, 0.08, 0.16, 0.06][vi]).getHex();
      // 六組のうち二組だけ細身の陣笠へ。既存の形を共用し、指定された兜や笠は守る。
      if (o.hat == null && !gen.hatFix && look.hat === 'jingasa' && (vi === 1 || vi === 4)) look.hat = 'jingasa_n';
      if (o.doStyle == null && vi === 2) look.doStyle = 'sugake';
      if (o.kote == null) look.kote = [3, 1, 3, 0, 3, 1][vi];
      // 六組の既存の姿の中で笠・頭巾・鉢巻を混ぜる。名将と指定装備は保つ。
      if (fieldLook.variedHeadgear && o.hat == null && !gen.hatFix && !gen.hat && !look.sohei) {
        look.hat = ['jingasa', 'jingasa', 'hachimaki', 'jingasa_n', 'jingasa', 'hachimaki'][vi];
      }
    }
    // 戦の年代に合わせた具足は、近い骨の人と遠い形で同じ指定を使う。
    const kacchu = o.name && fieldLook.namedKacchu?.[o.name.replace(/^.* /, '')];
    if (kacchu && !look.kosode && !look.sohei && !look.nanban) Object.assign(look, kacchu, { kacchu });
    look.longHoro = fieldLook.longHoro === 'round' ? 'round' : !!fieldLook.longHoro;
    look.shoulderMark = u.team === 0 ? fieldLook.allyShoulderMark || 0 : 0;
    look.flagBoost = u.team === 0 ? fieldLook.allyFlagBoost || 0 : 0;
    // 稲生の敵味方は具足の色でも示す。形・武器・強さはそのまま。
    if (fieldLook.battleKey === 'inou' && !look.kosode && !look.sohei && u.type !== 'porter' && u.type !== 'dummy') {
      // 味方は織田の藍と黒、敵（信勝方）は朱。桃色に見えず、離れても色相で分かるように（テスターの声 10/26）。
      look.sideArmor = u.team === 0 ? u.type === 'player' || u.type === 'busho' ? 0x1766d4 : 0x3f5f88 : u.type === 'busho' && u.name ? 0xc8261c : 0xa8381f;
      look.armor = look.helm = look.hatColor = look.sideArmor;
      // 本人だけ笠と兜を金にし、背の金の小旗とそろえて乱戦でも一目で分かるようにする。
      if (u.type === 'player') look.helm = look.hatColor = 0xd9a63a;
    }
    look.flag = fieldLook.armyFlagKinds?.[look.flag] || look.flag;
    look.standard = fieldLook.armyFlagKinds?.[look.standard] || look.standard;
    // 全戦の武将は、背に垂れる母衣を外して袖なしの陣羽織を着る。
    if ((u.type === 'busho' || gen.armor) && !look.kosode && !look.sohei && !fieldLook.noHaori) {
      look.haori = look.haori || look.horo || gen.haori || fac.haori || 0x34342e;
      look.horo = 0; look.longHoro = false;
    }
    if (fieldLook.noHaori) { look.haori = 0; look.horo = 0; look.longHoro = false; }
    // 全戦共通：背の受筒から一本だけ立てる。母衣衆と幟持ちは背の旗を重ねない。
    look.straightFlag = true;
    if (look.standard || look.horo) { look.flag = null; look.pole = false; }
    // 指定した戦だけ、無名の長柄足軽の指物を間引く。組・旗持ち・名のある者は残す。
    const flagStride = fieldLook.ordinaryFlagStride || 1;
    if (flagStride > 1 && u.type === 'ashigaru' && !u.name && !g.isPlayerSquad &&
        !look.standard && !look.uma && look.flagScale < 1.8 && u.id % flagStride !== 0) {
      look.flag = null; look.pole = false;
    }
    // 戦の途中に湧く兵（援軍・新手）：一コマで軽い形づくりが重なったら（一人 10〜20ms）、残りの兵の遠くの軽い形は
    //   もう作ってある顔と衣の濃さの姿で作る（具足・兜・旗・得物・家の色は同じ。近くで骨の入った人になる時は本当の姿＝u.look のまま）
    if (this._bmT !== this.time) { this._bmT = this.time; this._bmMs = 0; }
    let built = look;
    const allyCl = this.world.def.allyCloth && u.team === 0 && u.type === 'ashigaru' && !u.name;
    if (this.time > 0 && this._bmMs > 6 && !u.isPlayer && !look.hero && !gen.face && o.face == null && u.type !== 'busho' && !modelBuilt(look)) {
      const base = (loanArmor ? [0x293e58, 0x304763, 0x25384f, 0x344b64, 0x293e58, 0x304763] : fac.cloth || [0x2b2622, 0x262c3a, 0x3a2e24, 0x34342e, 0x262c3a, 0x2b2622])[vi];
      const shades = o.cloth != null || allyCl ? [look.cloth] : [0, 1, 2, 3, 4].map((k) => clothVar(base, k));
      find: for (const cloth of shades) for (let f = 0; f < 12; f++) { const alt = { ...look, cloth, face: (look.face + f) % 12 }; if (modelBuilt(alt)) { built = alt; break find; } }
    }
    const _bm0 = performance.now();
    buildModel(u, built);
    if (built !== look) u.look = finalLook(look);
    this._bmMs += performance.now() - _bm0;
    if (u.flag && fieldLook.unitFlagMaterial) u.flag.material = fieldLook.unitFlagMaterial(u.flag.material);
    if (look.straightFlag && u.flag && !look.hero) {
      u.flag.scale.set(0.85, 0.95, 1);
      u.flag.position.set(0, 2.36, -0.22);
    }
    u.mesh._armyUnit = u;
    if (!u.isPlayer) {
      u.mesh.updateMatrixWorld = visibleUnitMatrixWorld;
    }
    if (!look.hero && !gen.face && u.type !== 'dummy') {
      // 首の付け根は保ち、同じ顔の部品の幅・奥行き・長さだけを変える。
      const fy = 0.97 + physique(173) * 0.06;
      u.head.scale.set(0.94 + physique(719) * 0.12, fy, 0.96 + physique(1093) * 0.08);
      u.head.position.y = 1.43 * (1 - fy);
    }
    // 船上など乗馬禁止の戦では、増援も武将も馬を作る前に徒立ちにする。
    if (fieldLook.noHorse) o = { ...o, horse: false };
    if (u.type === 'cavalry' && o.horse === undefined) o = { ...o, horse: true };
    if (u.type === 'cavalry' && (g.interiorHold || (this._rideChk && this.walledIn(u.pos)))) o = { ...o, horse: false };
    // 名のある武将（武将・GENERALS の人）は馬に乗る（kaito 2026-09-29）。o.horse: false で徒。塀に囲まれた曲輪の中（籠城）は徒（rideCheck）
    if (o.horse === undefined && (u.type === 'busho' || gen.face) && !g.isPlayerSquad && !(this._rideChk && this.walledIn(u.pos))) { o = { ...o, horse: true }; u.autoHorse = true; }
    // 名のある武将の馬は、家の色の馬具（鞍の縁は金、厚総は大きく）
    const hst = () => { const s = horseStyleFor(u.id, gen.face ? 2 : u.type === 'busho' ? 1 : 0, g.faction); if (gen.tack) { s.tack = gen.tack; s.tassels = gen.tack === 0x2a2420 || gen.tack === 0x1a1816 ? (gen.lace ?? s.tassels) : new THREE.Color(gen.tack).multiplyScalar(1.3).getHex(); s.cushion = gen.haori ?? s.cushion; } return s; };
    if (o.horse) {
      const baseStyle = o.horseStyle || hst();
      const style = redRider ? takedaHorseStyle(baseStyle) : baseStyle;
      this.setMounted(u, true, buildHorse(fieldLook.horseCoat ? fieldLook.horseCoat(style, u.id) : style));
    }
    if (redRider && u.mounted) takedaRiderFinish(u);
    if (u.type === 'porter') {
      // 戦の定義で渡された荷の形は共用する。
      const load = new THREE.Mesh(o.porterLoad || paint(at(new THREE.BoxGeometry(0.6, 0.45, 0.4), 0, 1.45, -0.3), 0x6b5236), MAT);
      u.mesh.add(load);
    }
    // 体格のばらつき：高画質は平均の背丈から±6％。ほかの画質は従来の背丈、肩幅も人ごとに
    if (u.type !== 'player' && u.type !== 'dummy' && !o.horse) {
      const hi = u.type === 'samurai' || u.type === 'busho';
      const h = detail85 ? (hi ? 0.9425 : 0.9225) * (0.94 + physique(31) * 0.12) : (hi ? 0.908 : 0.891) + physique(31) * (hi ? 0.069 : 0.063), w = 0.90 + physique(487) * 0.20;
      u.mesh.scale.set(h * w, h, h * (0.92 + physique(997) * 0.14));
    }
    // 本人も当時の背丈に（1.63m ほどで一定。兵の 1.55〜1.70m の中ほど）
    if (u.type === 'player') u.mesh.scale.setScalar(0.935);
    u.bodyRadius = 0.3 * Math.max(Math.abs(u.mesh.scale.x), Math.abs(u.mesh.scale.z));
    u.bodyHeight = 1.72 * u.mesh.scale.y;
    u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
    u.mesh.position.copy(u.pos);
    u.heading = o.heading ?? g.facing;
    u.mesh.rotation.y = u.heading;
    if (o.tatake) this.giveTatake(u);
    this.scene.add(u.mesh);
    this.units.push(u);
    return u;
  }
  // 竹束（弾よけ）を持たせる：体の前に竹の束を立てて寄せる。持つ者のすぐ後ろの味方には弾が通りにくい（coverBetween）
  //   戦の定義から o: { tatake: true } で。討たれれば束は倒れる（体と一緒に）
  giveTatake(u) {
    if (!TATAKE_GEO) {
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const c = new THREE.CylinderGeometry(0.045, 0.05, 1.75 + (i % 3) * 0.05, 6);
        parts.push(P(at(c, -0.36 + i * 0.09, 0.9, (i % 2) * 0.03), i % 4 ? 0x8a7a4a : 0x6f6238, { reg: 'wood' }));
      }
      // 束ねる縄（二か所）
      for (const y of [0.55, 1.35]) parts.push(P(at(new THREE.BoxGeometry(0.84, 0.05, 0.14), 0, y, 0.015), 0x4a3a24, { reg: 'wood' }));
      TATAKE_GEO = merge(parts);
    }
    const m = new THREE.Mesh(TATAKE_GEO, MAT);
    m.position.set(0.05, 0, 0.62); m.rotation.x = -0.08;
    m.castShadow = true;
    u.mesh.add(m);
    u.tatake = m;
  }

  // 動く影は近くの兵・馬だけ。固定物の影は支度中に地面へ焼いてある。
  selectShadows(focus) {
    if (this.shadowNext > this.time) return;
    this.shadowNext = this.time + 1;
    for (const u of this.units) {
      const distance2 = focus ? (u.mesh.position.x - focus.x) ** 2 + (u.mesh.position.z - focus.z) ** 2 : Infinity;
      u.shadowSelected = !!u.isPlayer || distance2 < this.shadowDist * this.shadowDist;
      const on = u.shadowSelected && u.qualityTier !== 2 && this.shadows !== false && u.alive && !u.dying && !u.gone;
      if (u.shSet && u.shOn === on && !on) continue;
      u.shOn = on; u.shSet = true;
      u.mesh.traverse(o => {
        if (!o.isMesh) return;
        if (o.userData.unitCastShadow === undefined) o.userData.unitCastShadow = o.userData.cs0 ?? o.castShadow;
        o.castShadow = on && o.userData.unitCastShadow;
      });
    }
  }
  // 部隊を陣形どおりに一括配置
  spawn(g, list) {
    const work = this.spawnSteps(g, list);
    let step = work.next();
    while (!step.done) step = work.next();
    return step.value;
  }
  // 援軍は人数と陣形を保ち、一コマ二人・四ミリ秒までに分ける。
  queueSpawn(g, list, complete = null) {
    const n = list.reduce((sum, spec) => sum + spec.n, 0);
    this.pendingSpawn += n;
    this.spawnJobs.push({ work: this.spawnSteps(g, list), left: n, complete });
  }
  updateSpawnJobs() {
    if (!this.spawnJobs.length) return;
    const began = performance.now();
    let made = 0;
    while (this.spawnJobs.length) {
      const job = this.spawnJobs[0], step = job.work.next();
      if (step.done) {
        this.pendingSpawn -= job.left;
        this.spawnJobs.shift();
        if (job.complete) job.complete(step.value);
      } else {
        job.left--; this.pendingSpawn--; made++;
      }
      if (made >= 2 || performance.now() - began >= 4) break;
    }
  }
  *spawnSteps(g, list) {
    // 戦が始まった後の敵は、見える所に湧かせない（battle.js の guardSpawn が出る所をずらす）
    if (this.spawnGuard) list = this.spawnGuard(g, list) || list;
    const n = list.reduce((a, s) => a + s.n, 0);
    const total = g.initial + n;
    // 隊の種類：六割より多くが鉄砲なら鉄砲の隊（段を組んで入れ替わる）、騎馬なら騎馬の隊（間を広くとる）
    const cnt = (ty) => g.units.filter((x) => x.slot >= 0 && x.type === ty).length + list.reduce((a, s) => a + (s.type === ty ? s.n : 0), 0);
    // 持ち場を決めるための、並びの番ごとの兵の種類（騎馬の混じる隊で騎馬を塊にする。馬に乗る武将も騎馬に数える）
    g._slotTypes = new Array(g.initial);
    for (const x of g.units) if (x.slot >= 0) g._slotTypes[x.slot] = x.type === 'cavalry' || x.mounted ? 'cavalry' : x.type;
    for (const s of list) for (let k = 0; k < s.n; k++) g._slotTypes.push(s.type === 'cavalry' || (s.o && s.o.horse) ? 'cavalry' : s.type);
    g._mix = null;
    g.isGun = total >= 4 && cnt('gun') >= total * 0.6;
    g._spawnN = total;   // 並べる途中でも、全員そろった時の段の数で並べる（gunRanks）
    g.cav = total >= 3 && cnt('cavalry') >= total * 0.6;
    g.cavShare = cnt('cavalry') / Math.max(1, total);
    if (g.isGun && !g.front) g.front = [];
    let i = g.units.length;
    const out = [];
    let banner = total >= 8 && !g.isPlayerSquad && !g.units.some((x) => x.banner);
    // 組の番号：同じ側・同じ家の徒歩の隊に、出た順に一番〜三番（騎馬の隊・小さな隊には付けない）
    if (!g.kumiNo && !g.cav && total >= 6) {
      const K = this.kumiCount || (this.kumiCount = {}), k = g.team + '|' + g.faction;
      K[k] = (K[k] || 0) + 1;
      if (K[k] <= 3) g.kumiNo = K[k];   // 一・二・三は裏から見ても同じ形（布の裏から透けて見えても字が崩れない）
    }
    const chiefSpec = list.find((e) => e.n > 0 && e.o && e.o.name && (e.type === 'busho' || e.type === 'samurai') && !e.o.kosode && !e.o.sohei && e.o.flag !== null && (e.o.hat ?? GENERALS[e.o.name.replace(/^.* /, '')]?.hat) !== 'none');
    let standard = !g.isPlayerSquad && !g.units.some((u) => u.isStandard) && chiefSpec;
    let standardBearer = null;
    // 名のある武将の旗印と馬印（named_gear.js）。馬印は別の徒一人が背負う
    const chiefGear = chiefSpec ? NAMED_GEAR[chiefSpec.o.name.replace(/^.* /, '')] : null;
    let umaBearer = null, umaKind = !g.isPlayerSquad && chiefGear?.uma && !g.units.some((u) => u.isUma) ? chiefGear.uma : null;
    // 基本は足軽。大きな隊の名の無い侍は三人に一人だけ侍の具足にし、残りは足軽の具足で戦う（kaito 10/23 稲生 44。軽くもなる）。
    let samN = 0;
    for (const spec of list) {
      for (let k = 0; k < spec.n; k++) {
        const p = g.slotPos(i, total);
        const liteSam = spec.type === 'samurai' && total >= 10 && !g.isPlayerSquad && !spec.o?.name && !spec.o?.keep && !spec.o?.horse && !spec.o?.armor && samN++ % 3 !== 0;
        // 大きめの部隊には隊旗を持つ旗持ちを一人（鉄砲の隊は、小旗の中に大きな隊旗が一本）
        const bo = banner && (spec.type === 'ashigaru' || (g.isGun && spec.type === 'gun')) && !(spec.o && spec.o.flag === null) ? { flagScale: 1.2 } : {};
        const so = standard && spec.type === 'ashigaru' && !spec.o?.name && !spec.o?.sohei && !spec.o?.kosode && !spec.o?.keep && !spec.o?.horse && spec.o?.flag !== null
          ? { standard: chiefGear?.flag || chiefSpec.o.flag || GENERALS[chiefSpec.o.name.replace(/^.* /, '')]?.flag || FACTION[g.faction]?.flag || 'oda', flag: null, weapon: 'none', dmg: 0 } : {};
        const uo = umaKind && !so.standard && !bo.flagScale && spec.type === 'ashigaru' && !spec.o?.name && !spec.o?.sohei && !spec.o?.kosode && !spec.o?.keep && !spec.o?.horse && spec.o?.flag !== null
          ? { uma: umaKind, flag: null, weapon: 'none', dmg: 0 } : {};
        const u = this.addUnit(g, { type: liteSam ? 'ashigaru' : spec.type, x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, ...(spec.o || {}), ...bo, ...so, ...uo });
        if (uo.uma) { u.isUma = u.isStandard = true; umaBearer = u; umaKind = null; }   // 旗持ちと同じく斬り合わず主将の後ろに付く
        if (so.standard) { u.isStandard = true; standardBearer = u; standard = false; }
        if (bo.flagScale && !so.standard) { u.banner = true; banner = false; }
        else if (g.kumiNo && u.flag && !u.name && u.look && u.look.flag && u.type !== 'cavalry') u.flag.material = numberedFlag(u.look.flag, g.kumiNo);
        if (u.flag && this.world.def.unitFlagMaterial) u.flag.material = this.world.def.unitFlagMaterial(u.flag.material);
        out.push(u);
        i++;
        yield u;
      }
    }
    officerEscort(g);
    if (standardBearer) {
      const chief = g.units.find((u) => u.name === chiefSpec.o.name);
      if (chief) { standardBearer.officerGuard = chief; standardBearer.officerGuardSlot = 1; }
    }
    if (umaBearer) {
      const chief = g.units.find((u) => u.name === chiefSpec.o.name);
      if (chief) { umaBearer.officerGuard = chief; umaBearer.officerGuardSlot = 2; }
    }
    for (const u of out) if (u.isOfficer && g.initial >= 4 && !g.fixed && !g.isPlayerSquad && !u.keep) {
      const f = g.forward(), c = g.center();
      u.pos.x = c.x - f.x * 7; u.pos.z = c.z - f.z * 7;
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    for (const u of out) if (u.officerGuard && !g.isPlayerSquad) {
      const chief = u.officerGuard, f = g.forward(), side = u.officerGuardSlot - 1;
      const ahead = u.isStandard ? -2.5 : 2.5;
      u.pos.x = chief.pos.x + f.x * ahead + f.z * side * 1.8;
      u.pos.z = chief.pos.z + f.z * ahead - f.x * side * 1.8;
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    // 峠の増援は、後ろの列や武将の供も含めて場の内へ収めてから出す。
    // 出す時だけ調べ、並びを崩さず隊全体の持ち場をずらす。
    if (this.world.def.keepSpawnInside && out.length) {
      const lim = (this.world.def.moveLim || 176) - 0.3;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const u of out) {
        minX = Math.min(minX, u.pos.x); maxX = Math.max(maxX, u.pos.x);
        minZ = Math.min(minZ, u.pos.z); maxZ = Math.max(maxZ, u.pos.z);
      }
      const dx = Math.max(-lim - minX, Math.min(0, lim - maxX));
      const dz = Math.max(-lim - minZ, Math.min(0, lim - maxZ));
      if (dx || dz) {
        g.anchor.x += dx; g.anchor.z += dz;
        for (const u of out) {
          u.pos.x += dx; u.pos.z += dz;
          u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
          u.mesh.position.copy(u.pos);
        }
      }
    }
    for (const u of out) if (recoverGround(this, u)) {
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    return out;
  }

  addStruct(s) {
    const st = Object.assign({ isStruct: true, alive: true, hp: 100, maxHp: 100, team: 0 }, s);
    this.structs.push(st);
    return st;
  }

  // ---------------- 空間検索 ----------------
  // 近くの兵を探す升目：鍵は数（文字列を毎コマ作らない）、升の入れ物は使い回す
  rebuildGrid() {
    // 近くの兵を探す升目（10/24 型付き配列）：生きている兵を升の順に一列へ並べ（数え分け）、升ごとの始まりの番だけを持つ。
    //   升の中の順は兵の並び順のまま（従来の Map の升と同じ順で調べる）。位置と側は Float32Array に写し、
    //   forNearIn・nearestEnemy は物を開く前に写しの距離で候補を落とす。
    const c = this.cell, units = this.units, n = units.length;
    if (!this.gX || this.gX.length < n) {
      const cap = Math.max(256, n * 2);
      this.gX = new Float32Array(cap); this.gZ = new Float32Array(cap); this.gTeam = new Int32Array(cap);
      this.gCX = new Int32Array(cap); this.gCZ = new Int32Array(cap); this.gTmp = new Array(cap);
      this.gList = new Array(cap);
    }
    const CX = this.gCX, CZ = this.gCZ, tmp = this.gTmp;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    this.maxBodyRadius = 0.6;
    const ml = this.mountedList;
    ml.length = 0;
    let m = 0;
    for (let k = 0; k < n; k++) {
      const u = units[k];
      if (!u.alive) continue;
      u.gridOrder = m;
      if (u.mounted) ml.push(u);
      const br = u.bodyRadius || 0.3;
      if (br > this.maxBodyRadius) this.maxBodyRadius = br;
      const x = Math.floor(u.pos.x / c), z = Math.floor(u.pos.z / c);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      CX[m] = x; CZ[m] = z; tmp[m] = u; m++;
    }
    this.gridN = m;
    this.gridSerial = (this.gridSerial | 0) + 1;
    this.gridX0 = x0; this.gridX1 = x1;
    this.gridZ0 = z0; this.gridZ1 = z1;
    const W = m ? x1 - x0 + 1 : 0, H = m ? z1 - z0 + 1 : 0, cells = W * H;
    this.gW = W; this.gH = H;
    if (!this.gStart || this.gStart.length < cells + 1) {
      const cap = Math.max(1024, cells * 2 + 1);
      this.gStart = new Int32Array(cap); this.gCur = new Int32Array(cap);
      this.gT0 = new Int32Array(cap); this.gT1 = new Int32Array(cap);
    }
    if (!this.gRowMin || this.gRowMin.length < W) { this.gRowMin = new Int32Array(Math.max(64, W * 2)); this.gRowMax = new Int32Array(Math.max(64, W * 2)); }
    const start = this.gStart, cur = this.gCur, rmin = this.gRowMin, rmax = this.gRowMax, t0 = this.gT0, t1 = this.gT1;
    start.fill(0, 0, cells + 1); t0.fill(0, 0, cells); t1.fill(0, 0, cells);
    for (let i = 0; i < W; i++) { rmin[i] = 0x3fffffff; rmax[i] = -0x3fffffff; }
    for (let k = 0; k < m; k++) {
      const i = CX[k] - x0, j = CZ[k];
      start[i * H + (j - z0) + 1]++;
      if (j < rmin[i]) rmin[i] = j;
      if (j > rmax[i]) rmax[i] = j;
    }
    for (let q = 0; q < cells; q++) { start[q + 1] += start[q]; cur[q] = start[q]; }
    const L = this.gList, X = this.gX, Z = this.gZ, T = this.gTeam;
    for (let k = 0; k < m; k++) {
      const q = cur[(CX[k] - x0) * H + (CZ[k] - z0)]++, u = tmp[k];
      L[q] = u; X[q] = u.pos.x; Z[q] = u.pos.z; T[q] = u.team;
      // 升ごとの側の数：敵のいない升は nearestEnemy が中を開かない。
      if (u.team === 0) t0[(CX[k] - x0) * H + (CZ[k] - z0)]++;
      else if (u.team === 1) t1[(CX[k] - x0) * H + (CZ[k] - z0)]++;
      tmp[k] = null;
    }
  }

  // 升 (i, j) の番（兵のいない升・升目の外は -1）。中身は gList[gStart[番] .. gStart[番 + 1])。
  gridCell(i, j) {
    const a = i - this.gridX0, b = j - this.gridZ0;
    if (a < 0 || b < 0 || a >= this.gW || b >= this.gH) return -1;
    const q = a * this.gH + b;
    return this.gStart[q] === this.gStart[q + 1] ? -1 : q;
  }

  forNear(x, z, r, fn, context) {
    const c = this.cell;
    // 兵が一人もいない外側の升は調べない。候補の順・数・当たりの範囲は保つ。
    const x0 = Math.max(this.gridX0, Math.floor((x - r) / c)), x1 = Math.min(this.gridX1, Math.floor((x + r) / c));
    const z0 = Math.max(this.gridZ0, Math.floor((z - r) / c)), z1 = Math.min(this.gridZ1, Math.floor((z + r) / c));
    if (x0 > x1 || z0 > z1) return;
    const H = this.gH, gx = this.gridX0, gz = this.gridZ0, start = this.gStart, L = this.gList, rmin = this.gRowMin, rmax = this.gRowMax;
    for (let i = x0; i <= x1; i++) {
      const col = i - gx, j0 = Math.max(z0, rmin[col]), j1 = Math.min(z1, rmax[col]);
      if (j0 > j1) continue;
      const base = col * H - gz;
      for (let q = start[base + j0], end = start[base + j1 + 1]; q < end; q++) fn(L[q], context);
    }
  }

  // forNear と同じ升・同じ順で、升目に写した位置が (x, z) から keep より遠い兵を開かずに落とす。
  //   keep は呼び出し側の距離の判定より 1m 広く取る（同じコマの中で先に動いた兵を取りこぼさない）。
  forNearIn(x, z, r, keep, fn, context) {
    const c = this.cell;
    const x0 = Math.max(this.gridX0, Math.floor((x - r) / c)), x1 = Math.min(this.gridX1, Math.floor((x + r) / c));
    const z0 = Math.max(this.gridZ0, Math.floor((z - r) / c)), z1 = Math.min(this.gridZ1, Math.floor((z + r) / c));
    if (x0 > x1 || z0 > z1) return;
    const k2 = (keep + 1) * (keep + 1);
    const H = this.gH, gx = this.gridX0, gz = this.gridZ0, start = this.gStart, L = this.gList, X = this.gX, Z = this.gZ, rmin = this.gRowMin, rmax = this.gRowMax;
    for (let i = x0; i <= x1; i++) {
      const col = i - gx, j0 = Math.max(z0, rmin[col]), j1 = Math.min(z1, rmax[col]);
      if (j0 > j1) continue;
      const base = col * H - gz;
      const ex = Math.max(0, i * c - x, x - (i + 1) * c);
      if (ex * ex > k2) continue;
      for (let q = start[base + j0], end = start[base + j1 + 1]; q < end; q++) {
        const dx = X[q] - x, dz = Z[q] - z;
        if (dx * dx + dz * dz <= k2) fn(L[q], context);
      }
    }
  }

  // 隊ごとに一度（升目を作るたび）：隊の兵を囲む四角から一番近い敵（升目の写し）までの距離。
  //   広い索敵（8m より遠く）は、この距離より 2m 以上遠くまで敵がいなければ升を開かずに「いない」と決める（組の判断を兵で使い回す）。
  groupClear(g) {
    if (g._clearSerial === this.gridSerial) return g._clear;
    g._clearSerial = this.gridSerial;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity, team = null, mixed = false;
    for (const o of g.units) {
      if (!o.alive) continue;
      if (team === null) team = o.team; else if (o.team !== team) mixed = true;
      const x = o.pos.x, z = o.pos.z;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (z < bz0) bz0 = z;
      if (z > bz1) bz1 = z;
    }
    const box = g._clearBox || (g._clearBox = { x0: 0, x1: 0, z0: 0, z1: 0, team: 0 });
    box.x0 = bx0 - 0.5; box.x1 = bx1 + 0.5; box.z0 = bz0 - 0.5; box.z1 = bz1 + 0.5; box.team = team;
    let best = Infinity;
    if (team !== null && !mixed) {
      const X = this.gX, Z = this.gZ, T = this.gTeam;
      for (let q = 0, n = this.gridN; q < n; q++) {
        if (T[q] === team) continue;
        const ex = Math.max(0, box.x0 - X[q], X[q] - box.x1), ez = Math.max(0, box.z0 - Z[q], Z[q] - box.z1), d2 = ex * ex + ez * ez;
        if (d2 < best) { best = d2; if (d2 === 0) break; }
      }
    } else best = 0;
    g._clear = Math.sqrt(best);
    return g._clear;
  }

  nearestEnemy(u, r, filter, area = null) {
    r = Math.min(r, weatherSight(this.world));
    // 組の判断：隊のまわりに敵がいなければ、兵ごとの広い索敵をしない（結果は同じ「いない」）。
    const g = u.group;
    if (g && g.units && r > 8 && this.gridN) {
      const clear = this.groupClear(g), box = g._clearBox;
      if (clear > r + 2 && box.team === u.team && u.pos.x >= box.x0 && u.pos.x <= box.x1 && u.pos.z >= box.z0 && u.pos.z <= box.z1) return null;
    }
    let best = null, bd = Infinity;
    const r2 = r * r;
    // 攻めかかる隊は、10m より遠くの逃げる敵を後回しにする（深追いしない）
    const late = u.group && u.group.order === 'attack';
    const c = this.cell, x = u.pos.x, z = u.pos.z;
    // 遠方の索敵でも、全兵を囲む升の外へ検索を広げない。
    let x0 = Math.max(this.gridX0, Math.floor((x - r) / c)), x1 = Math.min(this.gridX1, Math.floor((x + r) / c));
    let z0 = Math.max(this.gridZ0, Math.floor((z - r) / c)), z1 = Math.min(this.gridZ1, Math.floor((z + r) / c));
    // 相手の居場所が決まっている寄せでは、その升だけを調べる。升の順と見通しの判定は共通。
    if (area) {
      x0 = Math.max(x0, area.x0); x1 = Math.min(x1, area.x1);
      z0 = Math.max(z0, area.z0); z1 = Math.min(z1, area.z1);
    }
    const spear = (u.wpnKind || u.lookWeapon || u.weapon) === 'spear';
    // 升目の候補を直接たどり、検索ごとの関数を作らない。同距離の順も保つ。
    //   写した側と位置（1m の余裕）で、物を開く前に味方と遠い兵を落とす。
    if (x0 > x1 || z0 > z1) return null;
    const keep2 = (r + 1) * (r + 1), team = u.team, own = team === 0 ? this.gT0 : team === 1 ? this.gT1 : null;
    const H = this.gH, gx = this.gridX0, gz = this.gridZ0, start = this.gStart, L = this.gList, X = this.gX, Z = this.gZ, T = this.gTeam, rmin = this.gRowMin, rmax = this.gRowMax;
    for (let i = x0; i <= x1; i++) {
      const col = i - gx, j0 = Math.max(z0, rmin[col]), j1 = Math.min(z1, rmax[col]);
      if (j0 > j1) continue;
      const base = col * H - gz;
      // 円から外れる隅の升は開かない（升の一番近い点が keep より遠い）。
      const ex = Math.max(0, i * c - x, x - (i + 1) * c), ex2 = ex * ex;
      if (ex2 > keep2) continue;
      for (let j = j0; j <= j1; j++) {
        const cq = base + j, s0 = start[cq], s1 = start[cq + 1];
        if (s0 === s1 || s1 - s0 === (own ? own[cq] : -1)) continue;
        const ez = Math.max(0, j * c - z, z - (j + 1) * c);
        if (ex2 + ez * ez > keep2) continue;
        for (let q = s0; q < s1; q++) {
          if (T[q] === team) continue;
          const sx = X[q] - x, sz = Z[q] - z;
          if (sx * sx + sz * sz > keep2) continue;
          const o = L[q];
          if (o.team === u.team || !o.alive || (o.invuln && !o.allyOk) || o.noTarget) continue;
          if (o.soloFor && o.soloFor !== u && o.soloFor.alive) continue;
          const dx = o.pos.x - x, dz = o.pos.z - z, d = dx * dx + dz * dz;
          if (d >= r2) continue;
          const k = late && o.fleeing && d > 100 ? d + 1e6 : d;
          // 距離で落ちる候補には、呼び出し側の壁判定も霧・森の見通しも調べない。
          if (k >= bd || (u.naka || o.naka) && Math.abs(o.pos.y - u.pos.y) > 1.8) continue;
          if (filter && !filter(o)) continue;
          if (interiorBlocked(INTERIOR_WALLS, u.pos, o.pos, spear)) continue;
          if (weatherSees(this.world, u.pos, o.pos)) { bd = k; best = o; }
        }
      }
    }
    return best;
  }

  // pos から的 tp までの間に塀・柵（seg）があるか。塀のすぐ内側（2.5m 以内）の城方が外を突くのはよいが、外から内へは届かない
  // pos から tp までの間にある、よその側の塀・柵（無ければ null）
  wallAt(pos, team, tp) {
    let nearest = null, distance = Infinity;
    for (const s of this.structs) {
      if (!s.alive || s.opened || !s.seg || s.team === team) continue;
      const q = segHit(pos.x, pos.z, tp.x, tp.z, s.seg);
      if (q >= 0 && q < distance) { nearest = s; distance = q; }
    }
    return nearest;
  }
  // over：槍で柵越しに突く（すぐ前の柵は、敵味方どちらの柵でも越えて届く。塀は越えない）
  // clear：柵越しに届く間合い（既定 2.2m）。馬上は馬の図体の分だけ柵に近寄れないので、呼ぶ側が広げて渡す
  // 柵や塀を16m の区画へ置く。支度済みの表へ追加分だけ登録し、戦の途中で全件を作り直さない（seg は動かない）。
  segGrid() {
    const list = this.structs;
    const grid = this._segGrid || (this._segGrid = new Map());
    // 開戦前の prepareCollisionGrids で余りの升も用意し、増設時の配列づくりを先に済ませる。
    const free = this._segGridFree || (this._segGridFree = []);
    let start = this._segGridN || 0;
    if (this._segGridList !== list || start > list.length || start && list[start - 1] !== this._segGridLast) {
      for (const cell of grid.values()) { cell.length = 0; free.push(cell); }
      grid.clear(); start = 0;
    }
    if (start === list.length && this._segGridList === list) return grid;
    for (let i = start; i < list.length; i++) {
      const s = list[i];
      const g = s.seg; if (!g) continue;
      for (let cx = Math.floor(Math.min(g[0], g[2]) / 16); cx <= Math.floor(Math.max(g[0], g[2]) / 16); cx++)
        for (let cz = Math.floor(Math.min(g[1], g[3]) / 16); cz <= Math.floor(Math.max(g[1], g[3]) / 16); cz++) {
          const k = cx * 4096 + cz; let a = grid.get(k); if (!a) grid.set(k, a = free.pop() || []); a.push(s);
        }
    }
    this._segGridList = list; this._segGridN = list.length; this._segGridLast = list[list.length - 1];
    if (!this._segGridPrepared) {
      for (let i = 0; i < 64; i++) free.push([]);
      this._segGridPrepared = true;
    }
    return grid;
  }

  wallBetween(pos, team, tp, over = false, clear = 2.2) {
    if (interiorBlocked(INTERIOR_WALLS, pos, tp, over)) return true;
    // 柵や塀を16m の区画に分けて、線の通る区画の物だけを調べる（岩村は一コマに六千回呼ばれ、毎回百の柵を全部見て一コマ三百ミリ秒かかっていた。10/7）
    const x0 = Math.min(pos.x, tp.x), x1 = Math.max(pos.x, tp.x), z0 = Math.min(pos.z, tp.z), z1 = Math.max(pos.z, tp.z);
    const grid = this.segGrid();
    const cx0 = Math.floor(x0 / 16), cx1 = Math.floor(x1 / 16), cz0 = Math.floor(z0 / 16), cz1 = Math.floor(z1 / 16);
    const list = cx0 === cx1 && cz0 === cz1 ? grid.get(cx0 * 4096 + cz0) || NO_SEGS
      : (cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 16 ? this.structs : segsIn(grid, cx0, cx1, cz0, cz1);
    for (const s of list) {
      const g = s.seg;
      if (!g || !s.alive || s.opened) continue;
      if ((g[0] < x0 && g[2] < x0) || (g[0] > x1 && g[2] > x1) || (g[1] < z0 && g[3] < z0) || (g[1] > z1 && g[3] > z1)) continue;
      if (segHit(pos.x, pos.z, tp.x, tp.z, g) < 0) continue;
      if (s.team === team && distToSeg(pos.x, pos.z, s.seg) < 2.5) continue;
      if (over && /柵/.test(s.name || '') && distToSeg(pos.x, pos.z, s.seg) < clear) continue;
      return true;
    }
    return false;
  }

  // allyMounted：的を絞った（lockRef と同じ）味方の騎馬（乗り手でなく馬だけ）だけ的に含める（自分の馬・味方の馬も討てるように。kaito 10/1。狙ってもいない味方へ毎振りで当たっていたのを直す）
  // fenceClear：柵越しに届く間合い（馬上の突きは馬の図体の分だけ呼ぶ側が広げる。既定 2.2m）
  enemiesInArc(pos, heading, reach, halfAngle, team, over = false, allyMounted = false, fenceClear = 2.2, lockRef = null) {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.forNearIn(pos.x, pos.z, reach + 1, reach + 0.95, (o) => {
      // 討たれない武将も、手傷を負って退くまでは突ける（damage で下限に止める）
      const sameSide = o.team === team;
      // 討たれない武将（殿など invuln）は、味方の馬の的からは外す（うっかり主君を落馬させない）。狙ってもいない味方へは当たらない（lockRef と同じ時だけ）
      if ((sameSide && !(allyMounted && o === lockRef && !o.isPlayer && ((o.mounted && o.horse && !o.invuln) || (o.name && o.invuln && !o.woundOut)))) || !o.alive || o.gone || o.noTarget || (o.invuln && o.woundOut)) return;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      if (o.naka && Math.abs(o.pos.y - pos.y) > 1.8) return;
      const d = Math.hypot(dx, dz);
      // 的には体の太さ（半径 0.3m ほど、馬上は 0.6m）がある：穂先が体の端にかかれば当たる
      const rad = o.mounted ? 0.6 : 0.3;
      if (d > reach + 0.35 + rad) return;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (halfAngle < Math.PI && cos < Math.cos(Math.min(1.4, halfAngle + Math.atan2(rad, Math.max(0.5, d))))) return;   // halfAngle が π なら、まわり全部
      // 槍や刀の向きから外れた兵には壁を調べない。乱戦の人数と当たる相手は保つ。
      if (this.wallBetween(pos, team, o.pos, over, fenceClear)) return;
      out.push({ u: o, d, cos });
    });
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // 位置に応じた音量と左右の定位で鳴らす
  // 遠くの音は、見えてから遅れて届く（音の速さ 340m/秒。25m より遠い時だけ）。待つ音は毎コマの smokes の所で鳴らす
  playFar(name, pos, vol = 1) {
    const P = this.playerUnit, d = P && pos ? Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) : 0;
    if (d < 25) { this.play(name, pos, vol); return; }
    const q = this.sndPool.pop() || { at: 0, name: '', pos: { x: 0, y: 0, z: 0 }, vol: 0 };
    q.at = this.time + d / 340; q.name = name; q.vol = vol;
    q.pos.x = pos.x; q.pos.y = pos.y; q.pos.z = pos.z;
    this.sndQ.push(q);
  }
  play(name, pos, vol = 1) {
    // 騎馬が何頭も駆け直しても、蹄の要求を三秒以上あける。
    // 渡り口で水音と泥の音が切り替わっても、同じ群れの蹄を重ねない。
    // 軍の時刻で間引くので、音を鳴らさない計測でも連続要求を増やさない。
    if (name === 'hooves' || name === 'hoovesWet' || name === 'hoovesWalkWet' ||
        name === 'hoovesWade' || name === 'hoovesWadeQuick' || name === 'gallop') {
      if (this.hoofSoundAt > this.time) return;
      this.hoofSoundAt = this.time + (name === 'gallop' ? 4 : 3.2);
    }
    // 同じ音が一度にたくさん重なるときは、まとめて一つの大きな音にする（一斉射撃・弓の斉射・騎馬の群れ）
    const lim = SOUND_BUNCH[name];
    if (lim) {
      const s = this.sndBunch || (this.sndBunch = {});
      const clusters = s[name] || (s[name] = []);
      let r = null, oldest = null;
      for (const b of clusters) {
        if (!oldest || b.t < oldest.t) oldest = b;
        if (this.time - b.t <= 0.4 && b.hasPos === !!pos && (!pos || Math.hypot(pos.x - b.x, pos.z - b.z) <= 12 && Math.abs((pos.y || 0) - b.y) <= 3)) { r = b; break; }
      }
      if (!r) {
        // 十六か所まで使い回す。遠い組の一発目をほかの組の斉射へ混ぜない。
        r = oldest && (this.time - oldest.t > 0.4 || clusters.length >= 16) ? oldest : { t: -9, n: 0 };
        if (!clusters.includes(r)) clusters.push(r);
        r.t = this.time; r.n = 0; r.hasPos = !!pos;
        r.x = pos?.x || 0; r.y = pos?.y || 0; r.z = pos?.z || 0;
      }
      if (this.time - r.t > 0.4) { r.t = this.time; r.n = 0; }
      r.n++;
      if (r.n > lim[0]) {
        // 短く揃った鉄砲は一斉射、間の空いた鉄砲はばらばらの音にまとめる
        const bunch = name === 'gun' && this.world.def.smallGunVolley && this.time - r.t <= 0.16 ? 'volleySmall'
          : name === 'gun' && this.time - r.t > 0.16 ? 'gunScatter' : lim[1];
        // 撃った数が多いほど厚く：九発目・十七発目で一斉の音をもう一つ重ねる
        if (lim[1] && (r.n === 9 || r.n === 17)) { name = bunch; vol *= 0.75; }
        else if (r.n !== lim[0] + 1 || !lim[1]) return;
        else { name = bunch; vol *= 1.1; }
      }
    }
    const v = this.hooks.volumeAt ? this.hooks.volumeAt(pos) : 1;
    const pan = this.hooks.panAt ? this.hooks.panAt(pos) : 0;
    withPan(pan, () => sfx(name, v * vol));
  }

  // 馬に乗せる・降ろす（乗り手の手・旗・馬印を鞍の高さへ）
  setMounted(u, on, horse) {
    if (on && this.world.def.noHorse) return;
    if (!!u.mounted === on || on && !(horse || u.horse)) return;
    const dy = on ? RIDE.y : -RIDE.y;
    for (const part of [u.hand, u.flag, u.uma]) if (part) part.position.y += dy;
    // 乗り手（体・脚・手・旗・馬印）は「鞍」の入れ物に入れ、馬の背の上下・前後の揺れをそのまま受ける
    const riderParts = [u.body, u.legL, u.legR, u.hand, u.flag, u.uma];
    if (on) {
      u.horse = horse || u.horse;
      if (u.horse !== u._horseHpFor) { u.horseHp = undefined; u.horseMax = undefined; u._horseHpFor = u.horse; }   // 乗り換えたら馬の体力を新しく
      if (u.horse.parent !== u.mesh) u.mesh.add(u.horse);
      u.horse.position.set(0, 0, 0); u.horse.rotation.set(0, 0, 0);
      if (!u.seat) { u.seat = new THREE.Group(); u.seat.matrixAutoUpdate = false; }
      u.seat.matrix.identity(); if (!u.isPlayer) u.seat.matrix.multiply(RIDE.fit); u.mesh.add(u.seat);
      for (const part of riderParts) if (part) u.seat.add(part);
      u.rideFix = true;
      seatLegs(u);
    } else {
      if (u.horse && u.horse.parent === u.mesh) u.mesh.remove(u.horse);
      for (const part of riderParts) if (part) u.mesh.add(part);
      if (u.human && u.human.root.parent === u.seat) u.mesh.add(u.human.root);
      if (u.seat) u.mesh.remove(u.seat);
      u.rideFix = false;
      u.legL.position.set(0.11, 0.74, 0); u.legR.position.set(-0.11, 0.74, 0);
      u.legL.rotation.set(0, 0, 0); u.legR.rotation.set(0, 0, 0);
      if (u.shinL) { u.shinL.rotation.set(0, 0, 0); u.shinR.rotation.set(0, 0, 0); }
    }
    u.mounted = on;
    if (!on) { u.charging = false; u.cv = null; u.cvT = 0; u._chargeWait = null; }
  }

  // 塀・柵（seg の構え）に四方を囲まれた所か：八方へ 70m の線を引き、六方より多くが構えに当たれば曲輪の中
  walledIn(p) {
    const segs = this.structs.filter((s) => s.seg && !s.noCharge && !s.horse && s.alive !== false && !s.opened);
    if (segs.length < 4) return false;
    let hit = 0;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.sin(a) * 70, dz = Math.cos(a) * 70;
      for (const s of segs) {
        const [ax, az, bx, bz] = s.seg, ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((ax - p.x) * ez - (az - p.z) * ex) / den, v = ((ax - p.x) * dz - (az - p.z) * dx) / den;
        if (t > 0 && t < 1 && v >= 0 && v <= 1) { hit++; break; }
      }
    }
    return hit >= 6;
  }
  // 戦の始めの一度：曲輪の中では武将も騎馬の侍も降ろす（兵を置いてから塀を立てる戦があるため）
  rideCheck() {
    this._rideChk = true;
    for (const u of this.units) if ((u.autoHorse || u.type === 'cavalry' || u.horseBattle === 'foot') && u.mounted && this.walledIn(u.pos)) { const h = u.horse; this.setMounted(u, false); if (h && h.parent) h.parent.remove(h); u.horse = null; }
  }

  // 最初の戦闘更新で描き方が変わらないよう、支度の時にも呼ぶ。
  prepareDrawMaterials() {
    const hq = true;
    if (!!MAT.defines.UNIT_HQ !== hq) { if (hq) MAT.defines.UNIT_HQ = 1; else delete MAT.defines.UNIT_HQ; MAT.needsUpdate = true; MAT_I.needsUpdate = true; MAT_P.needsUpdate = true; refreshWaterMaterials(MAT); refreshWaterMaterials(MAT_I); refreshWaterMaterials(MAT_P); }
  }

  update(dt, focus, cam, frustum) {
    // 自動計測だけ。生成済みの兵の数と姿を保ち、判断・移動・押し合い・攻撃の当たりを進めない。
    if (window.__apx?.noai) {
      this.time += dt;
      for (const u of this.units) {
        if (!u.isPlayer) { u.vel.x = u.vel.z = u.mv.x = u.mv.z = 0; }
        this.animate(u, dt, Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z) < 45);
      }
      this.updateSmoke(dt); this.updateParticles(dt); this.updateStains(dt);
      return;
    }
    const draw = !isNoRender();
    this.prepareDrawMaterials();
    this.updateSpawnJobs();
    if (S.flagMotion) FLAG_T.value += dt;
    FLAG_W.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
    this.wind = Math.atan2(WIND_STATE.dirX, WIND_STATE.dirZ);
    this.time += dt;
    this.frameNo = (this.frameNo | 0) + 1;
    const noGate = !!(window.__apx && window.__apx.nogate);   // 実機の試し x_nogate：コマ数の間引きを切って比べる
    this._viewFrustum = frustum;
    for (const u of this.units) {
      if (draw) updateWaterBody(u, this.world, dt);
      if (!this.aftermath && u.alive) {
        gunWeather(this, u, dt);
        if (!u.isPlayer && !u.sidearm) rangedSupply(this, u, this.time);
      }
    }
    if (this.aftermath) {
      // 判断・攻撃・増援は進めず、既にある兵と煙だけを動かす。
      for (const u of this.units) {
        const near = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z) < 45;
        this.animate(u, dt, near);
      }
      this.updateSmoke(dt);
      this.updateParticles(dt);
      this.updateStains(dt);
      this.updateFalling(dt);
      this.updateLooseHorses(dt);
      return;
    }
    this.rebuildGrid();
    prepareQuality(this, focus, cam, frustum, dt);
    this.selectShadows(this.playerUnit?.pos || focus);
    this.budgetThinking = true;
    bodiesWorkerTick(this);   // 押し合いの近傍の合計を別の芯へ（前のコマの答えを受け取り、今の位置を送る）
    // プレイヤーを狙って構えている敵（予備動作の表示と同時攻撃数の制限に使う）
    if (!this.threats) this.threats = [];
    this.threats.length = 0;
    this.playerShotAimers.length = 0;
    this.playerAttackers = 0;
    // 支度から振り切るまでを数える。射撃は近接の二人枠を塞がない。全員をたどるのは一度だけ。
    // 一人の敵へ向かう徒歩の数（_tgtN）も数える：群がらないよう crowdOk が見る（kaito 10/24）。
    for (const u of this.units) u._tgtN = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      const tg = u.target;
      if (tg && !tg.isStruct && !u.mounted && (u.sidearm || u.type !== 'gun' && u.type !== 'bow')) tg._tgtN++;
      if ((u.atk?.ranged || u.atk?.bow) && u.atk.target.isPlayer) this.playerShotAimers.push(u);
      if ((u.atk && u.atk.target.isPlayer && !u.atk.bow) || (u.swing && !u.swing.done && u.swing.target && u.swing.target.isPlayer) || (u.charging && u.cv === 'in' && u.target && u.target.isPlayer && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 10)) this.threats.push(u);
      if (!u.fleeing && !u.group?.routed && (u.playerMeleeUntil > this.time || u.atk && u.atk.target.isPlayer && !u.atk.ranged && !u.atk.bow || u.swing && u.swing.target?.isPlayer)) this.playerAttackers++;
    }
    // 一人の敵に向かう徒歩は三人まで（kaito 10/24「ひしめき合うのはダメ」）。近い三人と打ち合い中の者は残し、
    //   寄せて行く途中の残りは狙いを外して判断し直させる（crowdOk がその敵を一秒半は選ばせない）。
    {
      const crowded = this._crowdList || (this._crowdList = []);
      crowded.length = 0;
      for (const u of this.units) {
        const tg = u.target;
        if (!u.alive || !tg || !(tg._tgtN > 3) || tg.isPlayer || tg.isStruct || u.mounted || u.isPlayer || !(u.sidearm || u.type !== 'gun' && u.type !== 'bow')) continue;
        u._crowdD = (u.pos.x - tg.pos.x) ** 2 + (u.pos.z - tg.pos.z) ** 2;
        crowded.push(u);
      }
      if (crowded.length) {
        crowded.sort(byCrowdTarget);
        let last = null, k = 0;
        for (const u of crowded) {
          const tg = u.target;
          if (tg !== last) { last = tg; k = 0; }
          if (++k <= 3 || u.atk || u.swing || u.bind || u._crowdD < 4.84) continue;
          u.target = null; u.aiT = 0; u.crowdSkip = tg; u.crowdSkipT = this.time + 1.5; tg._tgtN--;
        }
        crowded.length = 0;
      }
    }
    if (!this._rideChk) this.rideCheck();
    // 囲まれ具合を四分の一秒ごとに調べる。敵は槍の届く辺り、支えはすぐそばだけ。
    if ((this.crowdT = (this.crowdT || 0) - dt) <= 0) {
      this.crowdT = 0.25;
      const P = this.playerUnit;
      const c = this.crowdWork || (this.crowdWork = { foe: 0, ally: 0, sectors: 0, foe10: 0, ally6: 0 });
      c.foe = c.ally = c.sectors = c.foe10 = c.ally6 = 0;
      if (P && P.alive) this.forNear(P.pos.x, P.pos.z, 10, countPlayerCrowd, this);
      const { foe, ally, sectors, foe10, ally6 } = c;
      this.playerCrowd = foe;
      // 二方向以上から三人に寄られれば危険。遠い味方は目前の槍を止められない。
      const spread = sectors && (sectors & (sectors - 1));
      this.playerMobbed = !!(foe >= 3 && spread && ally < foe);
      this.playerSupport = ally;
      // 囲まれる前の知らせ：10m 内の敵が五秒で四人以上増え、6m 内に味方がいない時（battle.js が台詞と印を出す）。
      const hist = this._crowdHist || (this._crowdHist = new Int16Array(20));
      const hi = (this._crowdHi = ((this._crowdHi || 0) + 1) % 20);
      const before = hist[hi];
      hist[hi] = foe10;
      if (P && P.alive && foe10 - before >= 4 && ally6 === 0 && !this.playerMobbed) this.playerMobSoon = this.time;
      // 囲まれ具合や戦ごとの人数指定によらず、同時の斬り合いは二人まで。
      this.attackCap = 2;
      if (P) P.mobbed = this.playerMobbed;
    }
    this.updateGroups(dt);
    this.duelTick(dt);
    // 遠景の大軍（world.js）が、本物の兵のいる所に重ならないよう道を譲らせる（0.7 秒ごと）
    if (this.world.yieldArmies && (this.yieldT = (this.yieldT || 0) - dt) <= 0 && !this.world.yieldWork?.pending) {
      const pts = this.yieldPoints;
      pts.length = 0;
      for (const u of this.units) if (u.alive && !u.gone && u.type !== 'dummy') pts.push(u.pos);
      this.world.yieldArmies(pts, 0.7 - this.yieldT);
      this.yieldT = 0.7;
    }
    this.world.yieldArmyStep?.();
    this.lodT -= dt;
    const doLod = this.lodT <= 0;
    if (doLod) this.lodT = 0.4;
    this.groundTick(dt, focus, cam);
    // 本物の兵（AI・当たり・動きを毎コマ計算する者）の上限：画質「低」は約120・「中」は約180（戦の数に関わらず）。
    // 本人から60m以内は必ず動かし、その外で近い者（camD が小さい）から選ぶ。あふれた分は u.farSim を立てて、遠い軽い軍勢と同じ GPU 任せの扱いへ回す
    // （名のある者・プレイヤーを狙っている者・打ち合っている最中の者は、絞りの対象から外して戦いを止めない）
    if (doLod) {
      const cap = REALCAP.high;
      let protectedCount = 0;
      if (cap) {
        const cand = this.lodCandidates;
        cand.length = 0;
        for (const u of this.units) {
          if (!u.alive || u.type === 'dummy') { u.farSim = false; continue; }
          if (u.isPlayer || u.isSub || u.name) { u.farSim = false; protectedCount++; continue; }
          // 近くの兵は画質によらず戦わせる。遠い兵だけを従来の枠で間引く。
          if (u.focusD <= 60) { u.farSim = false; protectedCount++; continue; }
          // 殿へ向かう一隊は、遠景扱いで判断ごと止めると出た場所で立ち尽くす。
          if (u.atk || u.swing || (u.target && u.target.isPlayer) || (u.group && u.group.focus && u.group.focus.alive && !u.group.isPlayerSquad)) { u.farSim = false; protectedCount++; continue; }
          cand.push(u);
        }
        cand.sort(byCameraDistance);
        for (let i = 0; i < cand.length; i++) cand[i].farSim = i >= Math.max(0, cap - protectedCount);
      } else {
        for (const u of this.units) u.farSim = false;
      }
    }
    // 影を落とすのは「影が画面に落ちる兵」だけ（光から見た向きで、画面に映る地面の範囲に重なる兵）。見た目は同じで影の描き込みが減る（10/21 熱）
    for (const u of this.units) {
      // 使番の歩みは命を運ぶ処理だけで進める。骨と描画は通常の兵と共有する。
      if (u.isCourier) continue;
      // 救助・足止め・遠景の更新を省く前に、倒れた相手への狙いを外す。
      if (u.alive && u.target && !u.target.isStruct && (!u.target.alive || u.target.dying || u.target.gone || u.target.noTarget)) {
        const target = u.target;
        u.target = null; u.aiT = 0;
        if (u.atk?.target === target) u.atk = null;
        if (u.swing?.target === target && !u.swing.done) u.swing = null;
        if (u.bind?.o === target) u.bind = null;
      }
      // 倒れ切って固まった体・逃げ去った者は、もう何も計算しない（数が増えても重くならない）
      if (!u.alive && (u.gone || (u.death && !u.mounted && u.death.t >= DEATH_END && !u.death.aid && !(u.death.throe > u.death.th)) || (u.mounted && u.deadT >= 4))) continue;
      // 深手で倒れた者と搬送済みの者は、出血・攻撃・隊への復帰を進めない。
      if (u.gone && u.evacuatedWound) continue;
      if (u.dying) { u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0; this.animate(u, dt, true); continue; }
      woundTick(u, dt);
      if (u.alive && !u.isPlayer && u.hp <= 0) {
        if (u.invuln || u.mustLive || u.onWound) {
          u.hp = u.maxHp * WOUND_FLOOR; u.wounds.bleed = 0;
          if (!u.woundOut && !u.onWound) this.generalWounded(u, u.woundSource);
        } else this.kill(u, u.woundSource);
      }
      if (u.dying) { u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0; this.animate(u, dt, true); continue; }
      // 止め・遅回し中も、打たれた体のよろけは実時間で進める。
      const reactionExtra = dt * Math.max(0, (this.hitReactionScale || 1) - 1);
      if (u.hit && reactionExtra > 0) u.hit.t += reactionExtra;
      if (u.hitFlash > 0) u.hitFlash -= dt + reactionExtra;
      u.lastHitT += dt;
      const focusD = u.focusD;
      if (focusD <= 60) u.farSim = false;
      // 手足の省き・旗・判断の間引きは、本人とカメラの近い方で決める（開戦の引きや写真モードで、カメラの前の兵が棒立ちにならないように）
      const dist = Math.min(focusD, u.camD);
      const near = dist < 70;
      // 背後八歩の敵は、近づく足音と長い影で気付ける。音は全体で間引く。
      const P = this.playerUnit;
      const raidSense = this.world.def.raidSenseDistance || 0;
      let rear = u.alive && !u.isPlayer && P?.alive && u.team !== P.team && focusD < (raidSense || 8) &&
        !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.hidden && Math.abs(u.pos.y - P.pos.y) < 1.8 &&
        (raidSense ? ((u.pos.x - P.pos.x) * Math.sin(P.heading) + (u.pos.z - P.pos.z) * Math.cos(P.heading)) / (focusD || 1) < 0.5 : this.behindOf(P, u));
      if (rear) {
        if (!(u.rearSenseAt > this.time)) { u.rearSenseAt = this.time + 0.25; u.rearClear = !this.wallBetween(u.pos, u.team, P.pos); }
        rear = u.rearClear;
      }
      if (rear && u.moving > 0.2 && !(this.rearStepAt > this.time)) {
        this.rearStepAt = this.time + 0.4;
        this.play(this.world.rainLevel > 0.3 ? 'stepWet' : 'step', u.pos, 1.2);
        if (this.hooks.onRearApproach) this.hooks.onRearApproach(u, P);
      }
      // 当たった人だけ、判断・足・得物の時計を同じ短い間止める。
      u.contactFrozen = !u.qualityAbstract && u.alive && !u.isPlayer && !u.dragging && u.contactStopT > 0;
      if (u.contactFrozen) {
        u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0;
        u.contactStopT = Math.max(0, u.contactStopT - dt);
        // 足と得物は止めたまま、下知と敗走の判断だけ受け取る。
        u.aiT -= dt;
        if (u.aiT <= 0 || u.receivedSignal !== u.group.signalSerial || u.group.routed || u.fleeing) {
          this.think(u); u.aiT = unitThinkDelay(this.time, u.id, unitThinkInterval(this, u, dist));
          if (!signalWait(this, u.group, u)) u.receivedSignal = u.group.signalSerial;
        }
        continue;
      }
      if (u.slipT > 0) u.slipT = Math.max(0, u.slipT - dt);
      if (doLod && u.alive) {
        // 徒歩兵は距離だけで脚を消さない。遠景は既存の軽い全身へ替える。
        u.legL.visible = u.legR.visible = (near || !u.mounted) && !u.efuda;   // 絵札（efuda.js）の兵は部品を出さない
        if (u.flag) u.flag.visible = dist < 110 && !(u.group && u.group.hideFlags);
      }
      // 画面の外にいる兵は手足の動きを省く
      const detailWake = u.qualityWasOffscreen && !u.offscreen;
      if (detailWake) { u.detailNextAt = 0; u.detailSenseAt = 0; }
      // カメラのすぐ前にいる兵は消して視界を確保する
      if (draw && cam && u.alive && !u.isPlayer) {
        u.spearNearCamera = false;
        const cd = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        // 消すのは味方だけ（自分のすぐ横で斬り合っている者は除く）。敵は、カメラが体の中に入るほど近い時（0.6m）だけ消す
        //   （斬り合う相手・打ちかかってくる敵が、カメラの近くで透けて見えなくならないように）
        const P = this.playerUnit;
        // 敵は近くても消さない（乱戦で敵が急に消えた。テストプレイの声 10/24）
        const lim = u.team !== (P ? P.team : 0) ? 0 : (u.target && u.target.alive && !u.target.isStruct && P && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 1.6 ? 0.6 : 2.2);
        let hide = cd < lim && Math.abs(u.pos.y + 1.2 - cam.y) < 2;
        // 味方がカメラと自分の間の細い道（幅 1.1m）に立って前の敵を隠す時も消す（B012。6m まで）
        if (!hide && cd < 6 && P && u.team === P.team && Math.abs(u.pos.y + 1.2 - cam.y) < 2.4) {
          const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1, vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
          const along = (vx * ax + vz * az) / L, side = Math.abs(vx * az - vz * ax) / L;
          hide = along > 0 && along < L - 0.4 && side < 1.1;
        }
        // 横や斜め後ろの味方の槍も、カメラの三メートル以内なら得物だけ隠す。
        // 端点は使い回し、近い槍だけ実際の構えを世界の位置へ直す。
        if (!hide && P && u.team === P.team && u.wpn && (u.wpnKind || u.lookWeapon) === 'spear' && cd < (u.wpn.userData.spec?.L || 6.3) + 4) {
          const w = u.wpn;
          w.updateWorldMatrix(true, false);
          _camTip.set(0, 0, w.userData.tip ?? 2).applyMatrix4(w.matrixWorld);
          const flex = w.userData.flex;
          if (flex?.on) {
            flex.b.updateWorldMatrix(true, false);
            _camTip.set(0, 0, flex.G.tip - flex.G.j2).applyMatrix4(flex.b.matrixWorld);
          }
          _camButt.set(0, 0, w.userData.butt ?? -1.6).applyMatrix4(w.matrixWorld);
          const dx = _camTip.x - _camButt.x, dy = _camTip.y - _camButt.y, dz = _camTip.z - _camButt.z;
          const len2 = dx * dx + dy * dy + dz * dz;
          const t = Math.max(0, Math.min(1, ((cam.x - _camButt.x) * dx + (cam.y - _camButt.y) * dy + (cam.z - _camButt.z) * dz) / (len2 || 1)));
          u.spearNearCamera = Math.hypot(_camButt.x + dx * t - cam.x, _camButt.y + dy * t - cam.y, _camButt.z + dz * t - cam.z) <= 3;
        }
        // 霧の外の敵は体・旗・軽い遠景への置き換えも隠す。近づけば戻す。
        //   霧・林・煙の見通しは一人ずつ時をずらして 0.12 秒ごとに調べ直す（毎コマ全ての敵で煙の粒を全てたどると重い）
        if (P && u.team !== P.team) {
          if (!(u._fogSeeAt > this.time)) { u._fogSeeAt = this.time + 0.12 + (u.id % 7) * 0.01; const vis = Math.min(this.world.vis ?? Infinity, this.world.scene?.fog?.far ?? Infinity); u._fogSee = !(vis < 180) || (u.pos.x - P.pos.x) ** 2 + (u.pos.z - P.pos.z) ** 2 <= vis * vis; }   // 描く・描かないは霧で見えなくなる遠さで決める（判断の見通しより手前で消さない。稲生 54）
          if (!u._fogSee) hide = true;
        }
        // 有岡では近い味方を描画直前に透かす。ここで消すと透かす対象からも外れてしまう。
        if (this.world.def && this.world.def.nearAllyFadeRadius && P && u.team === P.team) hide = false;
        u.camHidden = hide;
        u.mesh.visible = !hide;
        // 得物はカメラのすぐ前（体ごと消す 2.2m）まで見せる。隠すと手だけが宙を握って見える（鉄砲・弓・刀は近くても隠さない）
        if (u.wpn && !(u.human && u.human.cmdHid)) u.wpn.visible = dist < 95 && ((cd > lim && !u.spearNearCamera) || (u.wpnKind || u.lookWeapon) !== 'spear');
        // 乱戦の槍も指物と同じく、カメラと自分の間にある近い味方の分だけ薄くする（画面の真ん中を塞がないように）
        if (u.wpn && u.wpn.visible && !u.isSub && (u.wpnKind || u.lookWeapon) === 'spear') {
          let wfade = false;
          if (cd < 9 && !this.world.def.solidSpearView) {
            const P = this.playerUnit;
            if (cd < 3.2 && u.team === P?.team) wfade = true;
            else if (P && u.team === P.team) {
              const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1;
              const vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
              const along = (vx * ax + vz * az) / L;
              const side = Math.abs(vx * az - vz * ax) / L;
              wfade = along > 0 && along < L + 5 && side < 1.0 + along * 0.4;
            }
          }
          if (!u.wpnMat) u.wpnMat = u.wpn.material;
          if (wfade !== !!u.wpnFaded) { u.wpnFaded = wfade; u.wpn.material = wfade ? fadedWeapon(u.wpnMat) : u.wpnMat; }
        }
      }
      // 自分と狙う一人への視線を塞ぐ手前の旗だけ薄くする。
      if (draw && cam && u.alive && (u.flag || u.standardFlag)) {
        for (let i = 0; i < 2; i++) {
          const f = i === 0 ? u.flag : u.standardFlag;
          if (!f) continue;
          f.visible = dist < 110 && !u.group?.hideFlags;
          const target = this.missionMarkedEnemy;
          // 桶狭間・稲生では本人を見分ける無地の金旗を消さず、周りの旗だけ薄くする。
          const keepSelfFlag = (this.world.def.battleKey === 'okehazama' || this.world.def.battleKey === 'inou') && u.isPlayer && f === u.flag;
          const fade = !keepSelfFlag && f.visible && (u.camD < 9 && flagBlocksView(f, cam, this.playerUnit?.pos) ||
            target?.alive && u !== target && u.camD < 28 && flagBlocksView(f, cam, target.pos, 0));
          // 稲生の視線よけは描く間だけ全体を避ける。半透明の四角を戦場へ残さない。
          fadeViewFlag(f, this.world.def.battleKey !== 'inou' && !!fade);
        }
      }
      // 救助中は既にいる仲間を使い、判断・攻撃を止める。移動は負傷兵の側で一度だけ進める。
      if (u.alive && u.dragging) {
        const d = u.dragging;
        if (d.gone || !d.death?.aid || d.death.helper !== u || u.fleeing || u.stagger > 0 || u.lastHitT < 0.6) {
          if (d.death?.helper === u) {
            this.endAid(d); d.death.aid = true;
          }
          if (u.wpn) u.wpn.visible = true;
          u.dragging = null; u.vel.x = u.vel.z = 0; u.moving = 0; u.aiT = 0;
        } else { u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0; this.animate(u, dt, near); continue; }
      }
      if (!u.alive || u.isPlayer || u.type === 'dummy') { u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0; this.animate(u, dt, near); continue; }
      if (u.guarding > 0) u.guarding = Math.max(0, u.guarding - dt);
      const detailRate = !CPU_LEAN || u.farSim || u.qualityAbstract || detailWake ? 0 : detailInterval(this, u, dist);
      if (u.farSim || u.qualityAbstract) {
        // 遠景は行き先だけ部隊の時計で選び、足は毎コマ進める。
        u.target = null; u.atk = null; u.swing = null; u.bind = null;
        u.qualityMoveDt = (u.qualityMoveDt || 0) + dt;
        u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0;
        if (u.confused > 0) u.confused = Math.max(0, u.confused - dt);
        u.cd -= dt; u.aiT -= dt;
        if (u.reload) { if (u.moving > 0.05 || u.fleeing) u.cd += dt; else u.reload.t += dt; if (u.cd <= 0) u.reload = null; }
        if (u.stagger > 0) u.stagger = Math.max(0, u.stagger - dt);
        const farOrderChanged = u._farOrder !== u.group.order || u._farSignal !== u.group.signalSerial || u._farFleeing !== u.fleeing;
        if (!u._farWant || farOrderChanged || u.qualityMoveDt >= 0.6) {
          const g = u.group; u.qualityMoveDt = 0;
          u._farOrder = g.order; u._farSignal = g.signalSerial; u._farFleeing = u.fleeing;
          const slot = g.slotPos(u.slot, g.initial, u.qualityPoint || (u.qualityPoint = { x: 0, z: 0 }));
          // 攻める隊は、遠景でも指定された相手へ持ち場ごと進む。
          const aim = g.focus;
          if (aim?.alive && !aim.noTarget && !aim.opened && g.order === 'attack' && !g.hidden && !g.routed && !u.fleeing) {
            const point = aim.pos || this.targetPoint(aim, u);
            slot.x += point.x - g.anchor.x; slot.z += point.z - g.anchor.z;
          }
          let q = g.order === 'flee' || u.fleeing ? u.moralePoint : slot;
          if (q === u.moralePoint) { q.x = u.pos.x + g.fleeDir.x * 10; q.z = u.pos.z + g.fleeDir.z * 10; }
          // 遠い兵も同じ曲がり角と退き道を使う。直線だけでは曲輪の柵で止まる。
          q = mountainWay(this, u, q);
          if (u.fleeing && this.world.def.fleeWay) q = this.world.def.fleeWay(this, u, q);
          else if (q !== u._mountainWant && this.world.def.moveWay) q = this.world.def.moveWay(this, u, q);
          // 軽い移動も、行き先を先に場の内へ収める。
          const lim = this.world.def.moveLim || 176;
          const point = u._farWant || (u._farWant = { x: 0, z: 0 });
          point.x = Math.max(-lim, Math.min(lim, q.x)); point.z = Math.max(-lim, Math.min(lim, q.z));
        }
        this.advanceFar(u, dt, signalWait(this, u.group, u));
        if (this.leaveField(u)) continue;
        // 遠い兵も近い兵と同じ端を守る。間引きの待ち時間にも押された位置を残さない。
        const fieldLim = this.world.def.moveLim || 176;
        if (Math.abs(u.pos.x) > fieldLim || Math.abs(u.pos.z) > fieldLim) {
          u.pos.x = Math.max(-fieldLim, Math.min(fieldLim, u.pos.x));
          u.pos.z = Math.max(-fieldLim, Math.min(fieldLim, u.pos.z));
          u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
        }
        if (!u.offscreen) this.animate(u, dt, near);
        else { u.mesh.position.copy(u.pos); u.mesh.rotation.y = u.heading; }
        continue;
      }
      // 再び遠景へ移った時には、古い道を使わず選び直す。
      u._farWant = null;
      // 陣中の待機は既に並んだ位置を保つ。下知の変更・接敵・手傷は待機より先。
      if (u.jinchu) {
        const p = u.jinchu, g = u.group;
        // 周囲の確認は一人ずつ時をずらし、四分の一秒に一度まで。
        if ((u.jinchuCheckT || 0) <= this.time) {
          u.jinchuCheckT = this.time + 0.25 + (u.id % 5) * 0.03;
          if (this.nearestEnemy(u, 12)) p.danger = true;
        }
        if (u.hit || u.target) p.danger = true;
        if (!p.danger && !g.routed && g.order === 'hold' && g.aggro === 0 && !u.fleeing) {
          u.detailDt = 0; u.detailNextAt = 0; u.motionDt = 0; u.motionFrame = 0;
          u.vel.x = u.vel.z = 0; u.mv.x = u.mv.z = 0; u.moving = 0;
          this.animate(u, dt, near); continue;
        }
        u.jinchu = null; u.aiT = 0;
      }
      // 遠い非交戦兵は毎秒20回・さらに遠ければ10回、画面外の遠い待機兵は4回。時計をためる。
      // 号令の変更は待たずに受け取る。体と絵には別の時計を使う。
      // 携帯では行動・攻撃・弾込めの時計をまとめない。索敵を含む判断だけに別の間隔を使う。
      const interval = CPU_LEAN ? 0 : detailRate;
      // 接敵や接近で遠距離の条件を外れたら、長く取った判断の待ち時間も持ち越さない。
      if (u.detailSlow && interval !== 0.25) { u.detailNextAt = 0; u.aiT = 0; }
      u.detailSlow = interval === 0.25;
      const simDt = dt + (u.detailDt || 0);
      const orderChanged = u.detailOrder !== u.group.order || u.detailSignal !== u.group.signalSerial;
      // 判断・移動・攻撃の時計は毎コマ進める。iPhone の判断間隔は別に保つ。
      // 携帯：画面の外で敵に向かっていない兵（旗持ち・武将・討たれない者など遠景に回せない者や、後ろの味方）は、判断と足取りを
      //   30m の外は四コマに一度・12m の外は二コマに一度（経過はためて渡す）。位置は下で毎コマ進め、押し合いも毎コマなので歩みは跳ばない。
      //   画面に入れば次のコマから毎コマ。号令が変われば待たない
      //   画面の中でも 15m より遠い兵は二コマに一度。向きは休むコマも前の判断の向きへ毎コマ回す（turnTo）
      const offIdle = CPU_LEAN && !noGate && (u.offscreen ? dist > 12 : dist > 15) && !orderChanged && !u.target && !u.atk && !u.swing && !u.bind &&
        !u.hit && !u.charging && !(u.stagger > 0) && !u.fleeing && !u.group.routed && !u.dragging && !u.climb && simDt < 0.25 &&
        ((this.frameNo + u.id) & (u.offscreen && dist > 30 ? 3 : 1)) !== 0;
      if (offIdle && u._turnH !== undefined && !u.offscreen) this.turn(u, u._turnH, dt, u._turnR);
      if (offIdle || interval && !orderChanged && u.detailNextAt > this.time + 1e-6) {
        u.detailDt = simDt;
      } else {
        u.detailDt = 0; u.detailOrder = u.group.order; u.detailSignal = u.group.signalSerial;
        // 兵ごとに時をずらし、全員の重い更新が同じコマへ固まらないようにする。
        const phase = (u.id % 17) * interval / 17;
        u.detailNextAt = interval ? (Math.floor((this.time + phase + 1e-6) / interval) + 1) * interval - phase : 0;
        if (u.confused > 0) u.confused -= simDt;
        u.cd -= simDt;
        // 込め直しは足を止めてでないとできない（歩いている間は進まない）
        if (u.reload) { if (Math.hypot(u.mv.x, u.mv.z) > 0.05 || Math.hypot(u.vel.x, u.vel.z) > 0.05 || u.fleeing) u.cd += simDt; else u.reload.t += simDt; if (u.cd <= 0) u.reload = null; }
        // AI の間引き（遠い兵ほど判断間隔を長くする）
        const thinkInterval = unitThinkInterval(this, u, dist);
        if (u.thinkInterval !== thinkInterval) {
          // 接近・画面への復帰・接敵で、遠くにいた時の長い待ち時間を持ち越さない。
          // 筋書きが無期限の待機を指定した兵の時計は保つ。
          if (Number.isFinite(u.aiT)) u.aiT = Math.min(u.aiT, unitThinkDelay(this.time, u.id, thinkInterval));
          u.thinkInterval = thinkInterval;
        }
        u.aiT -= simDt;
        if (u.aiT <= 0) {
          qualityThink(this, u);
          u.aiT = unitThinkDelay(this.time, u.id, thinkInterval);
        }
        if (u.target && (!u.target.alive || (u.target.team === u.team && !u.target.isStruct))) { u.target = null; u.aiT = 0; }
        this.act(u, simDt, near);
        if (!u.mounted && Math.hypot(u.push.x, u.push.z) > 0.35 && Math.hypot(u.mv.x, u.mv.z) < 0.3) u.slipT = Math.max(u.slipT || 0, 0.12);
        // 乾いた日に隊が動けば土ぼこりが立つ（近くの兵だけ）
        if (dist < 55 && (u.mounted ? 1 : 0.18) * Math.hypot(u.vel.x, u.vel.z) * simDt > Math.random() * 1.2) this.world.puff(u.pos.x, u.pos.z, u.mounted ? 2 : 1);
      }
      // 位置は判断を休むコマも毎コマ進める（判断を間引いた兵が二〜四コマ分を一度に跳ばないよう。10/20）
      if (u.vel.x !== 0 || u.vel.z !== 0) {
        const px0 = u.pos.x, pz0 = u.pos.z;
        u.pos.x += u.vel.x * dt;
        u.pos.z += u.vel.z * dt;
        // 急な坂（切岸など）は登れない：道でなければ足が止まる（stk の詰まり判定で道へ回り直す）
        if (!this.world.walkable(u.pos.x, u.pos.z) && this.world.walkable(px0, pz0)) {
          u.pos.x = px0; u.pos.z = pz0; u.vel.x = 0; u.vel.z = 0; if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
        }
      }
      // 移動と体の当たりは毎コマ進める。
      const motionDt = dt;
      if (motionDt) {
        this.bodies(u, motionDt);
        this.collide(u, motionDt);
      }
      const lim = this.world.def.moveLim || 176;
      if (this.leaveField(u)) continue;
      // 櫓の上の守り（perch.js）：床の上の持ち場から動かない（逃げ出したら解く）
      if (u.perch) { if (u.fleeing) u.perch = null; else { u.pos.x = u.perch.x; u.pos.z = u.perch.z; u.vel.x = 0; u.vel.z = 0; if (u.mv) { u.mv.x = 0; u.mv.z = 0; } } }
      u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x));
      u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
      // 舟に固定した兵は甲板の高さを保つ。普通の兵・櫓の持ち場は従来の地面判定を使う。
      if (u.perch && u.perch.y != null) u.pos.y = u.perch.y;
      else {
        const water = this.world.def.water;
        if (water && u.pos.x > water.x - 1 && u.pos.x < (water.x2 ?? Infinity) + 1) {
          u.pos.x = water.x2 != null && u.pos.x > (water.x + water.x2) / 2 ? water.x2 + 1 : water.x - 1;
        }
        // 動いていない兵の同じ足場は短く使い回す。押し合い・移動・階の変更は即座に調べる。
        if (u._footX !== u.pos.x || u._footZ !== u.pos.z || u._footY !== u.pos.y ||
            !(u._footAt > this.time) || u.naka || u.climb || u.target || u.atk || u.swing || u.bind || u.hit || u.stagger > 0) {
          u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
          u._footX = u.pos.x; u._footZ = u.pos.z; u._footY = u.pos.y;
          u._footAt = this.time + 0.1;
        }
      }
      // 姿勢へ渡す経過時間を保つ。
      u.motionAnimDt = (u.motionAnimDt || 0) + dt;
      // パソコンの手足は毎コマ。iPhone の距離別更新は animate 側に任せる。
      this.animate(u, u.motionAnimDt, near); u.motionAnimDt = 0;
    }
    // 移動後の升を判断と弾矢で共用し、升の境を越えた兵も取りこぼさない。
    this.rebuildGrid();
    this.thinkWork.run(this);
    this.budgetThinking = false;
    if (draw) this.updateImpostors(cam);
    this.updateBullets(dt);
    this.updateArrows(dt);
    this.updateSmoke(dt);
    this.updateParticles(dt);
    this.updateStains(dt);
    this.updateFalling(dt);
    this.updateLooseHorses(dt);
  }

  // 遠近どちらの移動でも、逃げ切った兵だけを戦場から外す。
  leaveField(u) {
    if (u.fleeing && !u.isPlayer && u.offscreen && u.camD > 45) {
      if (!(u.escapeCheckAt > this.time)) {
        u.escapeCheckAt = this.time + 1;
        u.escapeThreat = !!this.nearestEnemy(u, 25);
      }
      const lim = this.world.def.moveLim || 176;
      const outside = Math.abs(u.pos.x) >= lim - 0.5 || Math.abs(u.pos.z) >= lim - 0.5 ||
        (this.world.def.fleeOut && this.world.def.fleeOut(u.pos.x, u.pos.z, u.team));
      const far = this.world.def.fleeFar !== false && !u.invuln && !u.name && u.camD > 90 && this.time - (u.fleeT ?? this.time) > 10;
      // 見える兵や追手の届く兵は残し、確認は一秒に一度まで。
      if (!u.escapeThreat && (outside || far)) { this.despawn(u); return true; }
    }
    return false;
  }

  // 遠い兵をまとめて描く（IMP）。兵の種類の番号は IMP_KIND（毎コマ作らない）。甲冑の色と旗ごとに、軽い兵の形の束を一つ持つ
  updateImpostors(cam) {
    if (!this.world.makeImpostor) return;
    const I = this.imp || (this.imp = new Map());
    if (cam) { const c = this.impCam || (this.impCam = { x: 0, z: 0 }); c.x = cam.x; c.z = cam.z; }
    for (const st of I.values()) st.n = 0;
    for (const u of this.units) {
      const k = IMP_KIND[u.type];
      const far = IMP.on && u.qualityTier === 2 && u.alive && !u.camHidden && !u.efuda && !u.vatOn &&
        !u.isPlayer && !u.isSub && !u.isStandard && !u.mounted && k !== undefined && !u.name &&
        !(u.fall > 0) && u.look && !(u.human?.root?.visible) && !u.perch && !u.naka && !u.climb;
      if (!far) { if (u.imp) { u.imp = false; if (u.mesh && !u.gone) u.mesh.visible = !u.camHidden; } continue; }
      u.imp = true;
      u.mesh.visible = false;
      // 見えない遠景も元の形を隠すが、束には送らない。
      if (TIER.weak && this._viewFrustum) {
        this.tmpSphere.center.set(u.pos.x, u.pos.y + 1, u.pos.z);
        this.tmpSphere.radius = Math.max(3.4, (u.wpn?.userData.spec?.L || 0) + 1);
        if (!this._viewFrustum.intersectsSphere(this.tmpSphere)) continue;
      }
      // 一つの束（160 人）があふれたら、同じ甲冑と旗の二つ目・三つ目の束へ（あふれた兵を一人ずつ描かない）
      // 束の名（甲冑と旗）は兵ごとに一度だけ作る（毎コマ字をつながない）
      if (u.impLook !== u.look) { u.impLook = u.look; u.impKey = u.look.armor + '|' + (u.look.flag || ''); }
      // 三方ヶ原の低画質は56m、小谷は66m、そのほかの低画質は110mから、さらに軽い形の別の束へ。
      // 高も 110m より先は、さらに軽い形の別の束へ（背丈五画素ほど）
      const xf = u.camD > (u.impXf ? 104 : 110);
      u.impXf = xf;
      const key0 = xf ? u.impKey + '|x' : u.impKey;
      let key = key0, st = I.get(key), kk = 1;
      while (st && st.n >= st.im.cap && kk < 4) { key = key0 + '#' + kk++; st = I.get(key); }
      if (!st) {
        st = { im: this.world.makeImpostor(u.look.armor, u.look.flag || 'tokugawa', 160, xf), n: 0 }; I.set(key, st);
        // 兵の更新なしにカメラだけ大きく動いた（写真モード）：そのカメラからの遠さでまとめ直す
        st.im.onCam = (p) => {
          const c = this.impCam;
          if (c && Math.hypot(p.x - c.x, p.z - c.z) < 8) return;
          for (const q of this.units) q.camD = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
          this.updateImpostors(p);
        };
      }
      if (st.n >= st.im.cap) { u.imp = false; u.mesh.visible = true; continue; }
      const helm = u.look.hat && u.look.hat.startsWith('kabuto') ? 1 : 0;
      st.im.put(st.n++, u.pos.x, u.pos.z, u.heading, k, helm, k === 0 ? 1.25 : 0, u.look.flag ? 1 : 0, (u.id * 0.618) % 1);
    }
    for (const st of I.values()) st.im.commit(st.n);
  }

  // 全兵の接触影。既存の描画の巡回と束を使い、兵の骨や体格から独立した地面の板にする。
  contactShadow(u, B) {
    // 足元の板を省く戦では、束ねた接触影も作らない。
    if (this.world.def.noFootShadows) return;
    if ((u.qualityTier === 2 && !this.world.def.contactShadowRange) || !u.alive || u.dying || u.gone || u.isStruct || u.type === 'dummy' || !u.mesh?.parent || (!u.mesh.visible && !u.imp)) return;
    const p = u.pos, focus = this.playerUnit?.pos || this.world.lastFocus;
    // 影地図の淡い影にも足元の芯を残す。遠い兵には追加しない。
    const range = this.world.def.contactShadowRange ?? 24;
    if ((u.shOn && !this.world.def.contactShadows) || !focus || (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 >= range * range) return;
    B.sph.center.set(p.x, p.y, p.z); B.sph.radius = 0.6;
    if (!B.fr.intersectsSphere(B.sph)) return;
    if (!this.contactGeo) {
      // 全員で一枚の板と材質を共用し、透明度で柔らかい丸を描く。
      this.contactGeo = new THREE.PlaneGeometry(0.9, 0.9);
      this.contactGeo.rotateX(-Math.PI / 2);
      this.contactMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.58, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      this.contactMat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying vec2 vContactUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvContactUv = uv;');
        sh.fragmentShader = 'varying vec2 vContactUv;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          // 両足の接点へ芯を寄せ、胴の下は薄く広がる陰にする。一枚の共用面のまま描く。
          vec2 sole = vContactUv * 2.0 - 1.0;
          float bodyShade = (1.0 - smoothstep(0.08, 1.0, length(sole))) * 0.48;
          sole.x = abs(sole.x) - 0.32;
          float footShade = 1.0 - smoothstep(0.05, 0.56, length(sole * vec2(1.4, 0.9)));
          diffuseColor.a *= max(bodyShade, footShade);`);
      };
      this.contactMat.customProgramCacheKey = () => 'ground-contact-shade';
    }
    const c = u.groundShade || (u.groundShade = { x: Infinity, y: Infinity, z: Infinity, sx: 0, sz: 0, next: 0, water: false });
    // 地面の読み直しは移動した時だけ、最大でも 0.4 秒に一度。時刻をずらし、全兵を同じコマで調べない。
    if (this.time >= c.next && (Math.abs(p.x - c.x) + Math.abs(p.z - c.z) > 0.35 || Math.abs(p.y - c.y) > 0.1)) {
      const W = this.world;
      c.sx = (groundAt(W, p.x + 0.35, p.z, p.y) - groundAt(W, p.x - 0.35, p.z, p.y)) / 0.7;
      c.sz = (groundAt(W, p.x, p.z + 0.35, p.y) - groundAt(W, p.x, p.z - 0.35, p.y)) / 0.7;
      c.x = p.x; c.y = p.y; c.z = p.z;
      c.h = groundAt(W, p.x, p.z, p.y);
      c.water = W.inWaterAt(p.x, p.z, p.y);
      c.next = this.time + 0.4 + (u.id % 8) * 0.025;
    }
    if (c.water || c.sx * c.sx + c.sz * c.sz > 4) return;
    let e = B.mapF.get(this.contactMat);
    if (!e || e.n >= e.cap) e = this.batchGrow(this.contactGeo, e, B.mapF, false, this.contactMat);
    // 水平の二軸に坂の高さを足す。兵ごとの行列や三角の形は作り直さない。
    const a = e.arr, i = e.n++ * 16;
    // 馬は胴の下まで伸ばし、人は両足を包む。向きも坂も同じ行列へ写す。
    // 影地図がある人馬は接点へ縮め、二重の大きな黒丸にしない。
    // 曇天では影地図の影が淡い。接触影を両足へ届かせ、足元の芯を残す。
    const span = u.shOn ? 0.85 : 1;
    const sx = (u.mounted ? 1.25 : 0.95) * span, sz = (u.mounted ? 2.6 : 1.1) * span;
    const sn = Math.sin(u.heading), cs = Math.cos(u.heading);
    const xx = cs * sx, xz = -sn * sx, zx = sn * sz, zz = cs * sz;
    a[i] = xx; a[i + 1] = c.sx * xx + c.sz * xz; a[i + 2] = xz; a[i + 3] = 0;
    a[i + 4] = 0; a[i + 5] = 1; a[i + 6] = 0; a[i + 7] = 0;
    a[i + 8] = zx; a[i + 9] = c.sx * zx + c.sz * zz; a[i + 10] = zz; a[i + 11] = 0;
    a[i + 12] = p.x; a[i + 13] = (c.h ?? p.y) + 0.025; a[i + 14] = p.z; a[i + 15] = 1;
  }

  // 軽い兵（本物の人になっていない兵）をまとめて描く：兵の材質の部品を、形ごとに一つの InstancedMesh へ入れる
  //   （一人 8〜10 回描いていたのを、全員で形の数だけに）。描く直前（行列が新しくなった後）に Battle が呼ぶ
  //   形（近い形・遠い形）と影を落とすかどうかで束を分ける。
  //   まとめた部品は layers を空にして、本来の描画と影から外す（行列の更新と動きは今までどおり）
  batchDraw(cam) {
    const coarse = this._coarse || (this._coarse = { pending: new Map(), jobs: [], head: 0 });
    advanceCoarse(coarse);
    LAZY_NOW = performance.now();
    // iPhone：10 秒描かれていない体・頭の細かい形の配列を手放す（要る時に作り直す。units_model の lazyGeo）
    if (MEM_TIGHT && !(window.__apx && window.__apx.nolazy)) sweepLazyGeometries(this, LAZY_NOW);   // x_nolazy：実機で切って比べる
    this.restoreBatchRoots();
    // 中景の焼いた動きの兵（crowd_vat.js）：手を見せ直す兵の行列も、下の束ねの前に今のコマへそろえる
    if (this.vatDraw && cam) this.vatDraw(cam);
    this.selectShadows(this.playerUnit?.pos || this.world.lastFocus);
    // 描かない早送りの後の一枚（写真・測り）も、遊びの時と同じく遠い兵を束の軽い形へ写してから描く
    if (cam && isNoRender()) { const p = cam.position; for (const q of this.units) q.camD = Math.hypot(q.pos.x - p.x, q.pos.z - p.z); this.updateImpostors(p); }
    const B = this.batch || (this.batch = { map: new Map(), mapC: new Map(), mapF: new Map(), maps: null, d2: 0, on: true, prev: [], cur: [], tag: 0, fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sph: new THREE.Sphere(new THREE.Vector3(), 3.4) });
    if (!B.mapF) B.mapF = new Map();
    if (!B.mapM) B.mapM = new Map();
    if (!B.materialKeys) B.materialKeys = new WeakMap();
    if (!B.mapS) B.mapS = new Map();
    if (!B.maps || B.maps.length < 5) B.maps = [B.map, B.mapC, B.mapF, B.mapM, B.mapS];
    // 戦の指定距離まで細かい形を保つ（units_flags.js も同じ値を見る）。指定のない高画質は16m。
    //   骨の入った人を作り終えるまでの間に目の前へ出る形なので、低でも 9m で粗い形に落とさない（10/7 本能寺の御殿）
    const low = TIER.weak;
    LOD.near = low ? this.world.def.lowUnitNear ?? (this.world.def.denseFront || this.world.def.lowArmyDetail ? 10 : 16) : this.world.def.highUnitNear ?? 16;
    B.sh = false; B.low = low;   // 低は影を描かないので、画面の外の兵の影の部品を束ねない
    B.cameraMask = cam ? cam.layers.mask : 1;
    if (!B.partSphere) B.partSphere = new THREE.Sphere();
    if (!B.hiddenRoots) B.hiddenRoots = [];
    const tag = ++B.tag;
    humanBatchBegin(B);
    for (const bm of B.maps) for (const e of bm.values()) e.n = 0;
    if (BATCH.on && cam) {
      B.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); B.fr.setFromProjectionMatrix(B.pm);
      const ce = cam.matrixWorld.elements, cx = ce[12], cy = ce[13], cz = ce[14];
      const W1 = B.w1 || (B.w1 = { children: [null] });
      // 画質「低」：細かい形（9m の内）は近い三人まで（実際の遊びでは 40m の内は骨の入った人が描くので、ここは人を作り終える前の短い間だけの形）。
      //   鉄砲の列や城の乱戦で目の前に四十人ほどが重なると、細かい形だけで五十万面になっていた（人数と並びは変えない）
      const NL = B.nearList || (B.nearList = []);
      NL.length = 0;
      if (low) {
        for (const u of this.units) {
          u._hiOK = false;
          const m = u.mesh;
          if (!m || !m.visible || u.imp) continue;
          const e = m.matrixWorld.elements, d2 = (e[12] - cx) ** 2 + (e[13] - cy) ** 2 + (e[14] - cz) ** 2;
          if (d2 < 81) { u._hiD2 = d2; NL.push(u); }
        }
        if (NL.length > 3) NL.sort((a, b) => a._hiD2 - b._hiD2);
        for (let i = 0; i < NL.length && i < 3; i++) NL[i]._hiOK = true;
      }
      B.hiOK = true;
      for (const u of this.units) {
        const m = u.mesh;
        this.contactShadow(u, B);
        // 落ちた陣笠（地面に一つずつ置いた形）も同じ束へ（一つずつ描かない）
        const hat = u.hatOff;
        if (hat && hat.parent && hat.visible && !hat.userData.groundKept) {
          const he = hat.matrixWorld.elements, hx = he[12] - cx, hy = he[13] - cy, hz = he[14] - cz;
          B.d2 = hx * hx + hy * hy + hz * hz;
          B.sph.center.set(he[12], he[13] + 1.6, he[14]);
          B.sph.radius = 3.4;
          B.on = B.fr.intersectsSphere(B.sph);
          B.hide = low && B.d2 > 2025;
          W1.children[0] = hat; this.batchWalk(W1, null, tag, B);
        }
        // 本人と武将は固有の材質・細かな形を保ち、一般兵だけまとめて描く。
        const keepQuality = u.isPlayer || u.type === 'busho' || u.look && (u.look.hero || typeof u.look.face === 'string' && u.look.face.startsWith('g:'));
        if (!m || !m.visible || !m.parent || u.imp || keepQuality) continue;
        B.sh = u.qualityTier !== 2 && !!u.shOn && u.alive && !u.dying && !u.gone;
        B.pl = !!u.isPlayer || !!u.namedShadow;
        const e = m.matrixWorld.elements, dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
        B.d2 = dx * dx + dy * dy + dz * dz;
        B.sph.center.set(e[12], e[13] + 1, e[14]);
        // 長い槍の先と馬印が画面に残る間は、体の中心が外でも省かない。
        B.sph.radius = Math.max(u.mounted ? 6 : 3.4, (u.wpn?.userData.spec?.L || 0) + 1);
        // 画面の外の兵は、影を落とす部品だけ束ねる（影の描き込みで一つずつ描かない。見えない部品は元どおり外される）
        B.on = B.fr.intersectsSphere(B.sph);
        // 画質「低」（携帯）：150m より先の兵（背丈が二、三画素）と、45m より先の倒れた兵は、部品を描かない（一人ずつ描く旗・得物も）
        B.hide = low && (!B.on || B.d2 > 22500 || (!u.alive && B.d2 > 2025));
        // パソコンの近景と武将は細かな形を保ち、遠い一般兵は共有済みの距離別の形で束ねる。
        B.fullDetail = MEM_TIGHT ? u.qualityTier === 0 :
          !!(u.isPlayer || u.name || u.isSub || u.type === 'busho') ||
          Math.min(u.focusD ?? Infinity, u.camD ?? Math.sqrt(B.d2)) <= Math.max(16, LOD.near);
        B.poolFar = !B.fullDetail && (u.qualityTier > 0 || MEM_TIGHT && !!u.poolFar);
        B.hiOK = !low || !!u._hiOK;
        const retained = this.batchWalk(m, u.human && u.human.root, tag, B);
        B.hiOK = true; B.pl = false; B.poolFar = false; B.fullDetail = false;
        // 軽い形にした人の指物（竿の骨に付け替えてあるので上の辿りでは届かない）も束へ。近くの細かな布の旗は元のまま
        const fl = u.flag, h = u.human;
        if (fl && h && h.lodFar && fl.parent && fl.parent === h.flagHolder && fl.visible && !fl.material?.userData?.nearFlag) { W1.children[0] = fl; this.batchWalk(W1, null, tag, B); }
        // 骨の入った人の髪・目・傷・近くの指物も、形と材質の組ごとの束へ（一人ずつ描かない）
        if (h) batchHumanParts(this, u, B, tag);
        B.sh = false;
        // 全部品が束へ移った兵は、描く間だけ親から走査を止める。骨・独自の材質は残す。
        // 高でも同じ（描いた後 onAfterRender の restoreBatchRoots で戻す。部品 2,300 個の木を projectObject と影の走査が辿らない。10/21 引き算）
        if (!retained && !m.isMesh) { m.visible = false; B.hiddenRoots.push(m); }
      }
      // 地に落ちた得物と、地面に刺さった矢（どちらも場に一つずつ置いた形）も同じ束へ。画質「低」は 35m より先を描かない
      //   城攻めのように討たれる者が多い戦では、落ちた槍と矢だけで描く回数が二百を越えていた
      const loose = (o) => {
        const oe = o.matrixWorld.elements, ox = oe[12] - cx, oy = oe[13] - cy, oz = oe[14] - cz;
        B.d2 = ox * ox + oy * oy + oz * oz;
        B.sph.center.set(oe[12], oe[13], oe[14]);
        B.sph.radius = Math.max(3.4, (o.userData.spec?.L || 0) + 1);
        B.on = B.fr.intersectsSphere(B.sph);
        B.hide = low && B.d2 > 1225;
        W1.children[0] = o; this.batchWalk(W1, null, tag, B);
      };
      for (const u of this.units) { const w = u.dropped; if (w && w.parent === this.scene && w.visible && !w.userData.groundKept) loose(w); }
      // 主を失った馬・倒れた馬（場に一頭ずつ置いた馬）も同じ束へ。三方ヶ原の騎馬の突撃の後、馬だけで百回ほど描いていた
      const horse = (h) => {
        if (!h || h.parent !== this.scene || !h.visible) return;
        const he = h.matrixWorld.elements, hx = he[12] - cx, hy = he[13] - cy, hz = he[14] - cz;
        B.d2 = hx * hx + hy * hy + hz * hz;
        B.sph.center.set(he[12], he[13] + 1, he[14]); B.sph.radius = 3.4;
        B.on = B.fr.intersectsSphere(B.sph);
        B.hide = low && (!B.on || B.d2 > 22500);
        W1.children[0] = h; this.batchWalk(W1, null, tag, B);
      };
      if (this.looseHorses) for (const o of this.looseHorses) horse(o.h);
      if (this.fallenHorses) for (const o of this.fallenHorses) horse(o.h);
      // 陣の中で絵図を囲む人（camp_life.js。軍勢の外の形）も同じ束へ
      if (this.extraBodies) for (const m of this.extraBodies) horse(m);
      if (this.litter) for (const o of this.litter) if (o.parent === this.scene && o.visible) loose(o);
      if (this.arrows) for (const a of this.arrows) if (a.stuck && a.mesh.parent === this.scene && a.mesh.visible) loose(a.mesh);
    }
    this.soloDraw(B);
    // 前のコマでまとめていて今は外れた部品を、元の描き方へ戻す
    for (const c of B.prev) if (c.userData.bT !== tag) c.layers.mask = 1;
    const t = B.prev; B.prev = B.cur; B.cur = t; t.length = 0;
    for (const bm of B.maps) for (const [key, e] of bm) {
      e.im.count = e.n; e.im.visible = e.n > 0; e.im.userData.sn = e.n;
      if (e.n) { e.im.instanceMatrix.needsUpdate = true; if (e.col) e.im.instanceColor.needsUpdate = true; e.idle = 0; }
      // 20 秒ほど誰も入らない束は手放す（兵の着せ替えで形が入れ替わるたびに束が増え、古い形を GPU に残していた。要ればまた作る。10/19）
      else if ((e.idle = (e.idle || 0) + 1) > (MEM_TIGHT ? 240 : 900) && B.retired < 2 && B.retireMs < 0.5) {
        const started = performance.now();
        this.scene.remove(e.im); e.im.dispose(); bm.delete(key); SOLO_STAT.batchesDisposed++;
        B.retired++; B.retireMs += performance.now() - started;
      }
    }
  }
  // 一人だけが使う形（その兵だけの甲冑・倒れ姿・小袖など）の束は、一つの束で一人を描いていた（兵の数だけ描く回数が増える）。
  //   材質と頂点の作りが同じ物を、一つの BatchedMesh へまとめて一回で描く（形は初めて使う時に一度だけ写す。行列は毎コマ）。
  //   形・材質・色・動きは変えない。一括描画の拡張の無い機種と、入れ物が満ちた時は今までどおり
  soloDraw(B) {
    const P = this.solo || (this.solo = { pools: new Map(), sig: new WeakMap(), frame: 0 });
    P.frame++;
    // 同時に休眠した束を一斉に返さない。通常の束と合わせて二つまで、返却が半ミリ秒を越えたら次のコマへ。
    // 待つ束も非表示にし、再び使う束は休眠を取り消す。返却待ちの配列や写しは作らない。
    B.retired = 0; B.retireMs = 0;
    let restored = 0;
    // 束が多い時は一コマに返す数（二つ・半ミリ秒）を前借りで増やす（十二・一ミリ秒）。姿の入れ替えで一人だけの束が次々に出来、
    //   二つずつでは追いつかず、森部 4 分で 1100 個に増え、捨てた形（束ねた人の色の配列）を鍵に抱えていた（10/20）
    if (B.maps) { let nb = 0; for (const bm of B.maps) nb += bm.size; if (nb > 240) { B.retired = -10; B.retireMs = -0.5; } }
    // 装いの切替で使わなくなった束も返す。元の形への参照と大きな頂点配列を戦の終わりまで抱えない。
    // 短い休眠は再利用し、今も描く兵の束は保つ。材質はほかの束と共有なので返さない。
    for (const [key, pool] of P.pools) {
      pool.idle = pool.used.length ? 0 : (pool.idle || 0) + 1;
      if (pool.used.length) pool.retireGeo = 0;
      for (const id of pool.used) pool.bm.setVisibleAt(id, false);
      pool.used.length = 0; pool.bm.visible = false;
      if (pool.idle > (MEM_TIGHT ? 240 : 900) && B.retired < 2 && B.retireMs < 0.5) {
        const started = performance.now();
        // 配列は束の中だけに残っている。全形を一度に読み戻すと、返却一つでも
        // 大量の確保と写しが集中する。束を残したまま一コマ一配列ずつ戻す。
        let scanned = 0, waiting = false;
        pool.retireGeo = pool.retireGeo || 0;
        while (pool.retireGeo < pool.geos.length && scanned < 32) {
          const g = pool.geos[pool.retireGeo];
          for (const name in g?.attributes) {
            const a = g.attributes[name];
            if (!a._poolRef) continue;
            if (restored >= 1) { waiting = true; break; }
            void a.array; restored++;
          }
          if (waiting) break;
          if (g?.index?._poolRef) {
            if (restored >= 1) { waiting = true; break; }
            void g.index.array; restored++;
          }
          pool.retireGeo++; scanned++;
          if (performance.now() - started >= 0.5) break;
        }
        B.retireMs += performance.now() - started;
        if (waiting || pool.retireGeo < pool.geos.length || B.retireMs >= 0.5) continue;
        const disposeAt = performance.now();
        this.scene.remove(pool.bm); pool.bm.dispose(); P.pools.delete(key); SOLO_STAT.poolsDisposed++;
        B.retired++; B.retireMs += performance.now() - disposeAt;
      }
    }
    if (!SOLO.on || !hasMultiDraw()) return;
    // 新しい装い・援軍が重なっても、大きな入れ物は一コマ一つ、形の転送は四つまで。
    // 作成・転送の実作業が1msを越えたら次のコマへ。未完成の兵は元の束で全員描く。
    let made = 0, copied = 0, workMs = 0;
    for (const bm of [B.map, B.mapM]) for (const e of bm.values()) {
      // 一人（二人まで）だけが使う形。二人の時は形を二つ写す
      if (e.n < 1 || e.n > SOLO.multi || e.mixed || !e.src || !e.bmat || !e.bmat.isMaterial || e.im.material?.transparent) continue;
      const g = e.src;
      let sig = P.sig.get(g);
      if (sig === undefined) {
        sig = g.morphAttributes.position || (g.groups && g.groups.length > 1) || !g.attributes.position ? '' : (g.index ? 'i' : 'n');
        if (g.isInstancedBufferGeometry) sig = '';
        if (sig) for (const k of Object.keys(g.attributes).sort()) {
          const a = g.attributes[k];
          // 頂点数と違う長さの値は束へ写せない。元の描き方を保つ。
          if (a.isInstancedBufferAttribute || a.isInterleavedBufferAttribute || a.count !== g.attributes.position.count) { sig = ''; break; }
          sig += ',' + k + a.itemSize + (a.normalized ? 'n' : '');
        }
        P.sig.set(g, sig);
      }
      if (!sig) continue;
      // 満ちた入れ物は、同じ材質の二つ目・三つ目へ回す（10/23 実機：満杯待ちが30秒に二千回。束ねられない一人だけの束が百五十ほど残り、描く回数を押し上げていた）
      const base = e.bmat.uuid + '|' + sig;
      let key = base, pool = P.pools.get(key);
      for (let s = 1; s < SOLO.shards && pool && pool.fullAt > P.frame - 60 && !pool.ids.has(g); s++) { key = base + '|' + s; pool = P.pools.get(key); }
      if (!pool) {
        if (P.pools.size >= SOLO.pools || made >= 1 || workMs >= 1) continue;
        const started = performance.now();
        // 最大十五万頂点を材質ごとに先取りせず、今束ねる部品の分だけ確保する。
        // 後から入り切らない形は、従来どおり元の束で全員を描く。
        let maxV = 0, maxI = 0, maxG = 0;
        const names = Object.keys(g.attributes).sort();
        for (const map of [B.map, B.mapM]) for (const entry of map.values()) {
          const shape = entry.src;
          if (entry.n < 1 || entry.n > SOLO.multi || entry.mixed || entry.bmat?.uuid !== e.bmat.uuid || !shape || entry.im.material?.transparent) continue;
          if (!!shape.index !== !!g.index || Object.keys(shape.attributes).length !== names.length) continue;
          if (!names.every(name => {
            const a = shape.attributes[name], ref = g.attributes[name];
            return a && a.itemSize === ref.itemSize && !!a.normalized === !!ref.normalized;
          })) continue;
          maxV += Math.ceil(shape.attributes.position.count * 1.15) * entry.n;
          maxI += (shape.index ? Math.ceil(shape.index.count * 1.15) : 0) * entry.n;
          maxG += entry.n;
        }
        maxV = Math.min(SOLO.v, maxV); maxI = Math.min(SOLO.i, maxI); maxG = Math.min(SOLO.g, maxG);
        const bmesh = new THREE.BatchedMesh(maxG, maxV, maxI, batchVariant(e.bmat));
        bmesh.name = 'unitBatch'; bmesh.matrixAutoUpdate = false; bmesh.frustumCulled = false; bmesh.perObjectFrustumCulled = true; bmesh.sortObjects = false;
        bmesh.castShadow = false; bmesh.receiveShadow = e.im.receiveShadow;
        this.scene.add(bmesh);
        pool = { bm: bmesh, ids: new Map(), retry: new WeakMap(), geos: [], last: [], used: [], nv: 0, ni: 0, ng: 0, maxV, maxI, maxG }; P.pools.set(key, pool);
        SOLO_STAT.poolsMade++;
        made++; workMs += performance.now() - started;
      }
      // 満ちた束への転送を毎コマ試さない。待つ間も元の束で全員描く。
      if ((pool.retry.get(g) || 0) > P.frame) continue;
      let ids = pool.ids.get(g);
      // CPU の配列を手放した形は、写す時に GPU から読み戻す（GPU を待つ）。読み戻しを許すコマ（main.js の may：既に読み戻したコマか十五コマに一度）だけ試し、
      //   読み戻しが起きたコマには十まで・4ms までまとめて写す（固まるコマを減らす。10/27 tarapon「乱戦でカクつく」）
      const GO = globalThis.__gpuOnly;
      if (GO && (!ids || ids.length < e.n) && !GO.may() && soloNeedsReadback(g)) continue;
      if (!ids) pool.ids.set(g, ids = []);
      while (ids.length < e.n) {
        const synced = !!GO && GO.readback !== GO.rb0;
        if (copied >= (synced ? 10 : 4) || workMs >= (synced ? 4 : 1)) break;
        const started = performance.now();
        const nv = g.attributes.position.count, ni = g.index ? g.index.count : 0, rv = Math.ceil(nv * 1.15), ri = ni ? Math.ceil(ni * 1.15) : 0;
        // 入れ物が満ちたら、しばらく使っていない形の場所（大きさの足りる物）へ上書きする（多めに取った場所の大きさで数える）
        let id;
        if (pool.nv + rv > pool.maxV || pool.ni + ri > pool.maxI || pool.ng >= pool.maxG) id = soloReuse(pool, g, nv, ni, P.frame);
        else { try { id = pool.bm.addGeometry(g, rv, ni ? ri : -1); } catch (err) { pool.ng = pool.maxG; id = -1; } if (id >= 0) { pool.nv += rv; pool.ni += ri; pool.ng++; } }
        if (id < 0) { pool.retry.set(g, P.frame + 30); pool.fullAt = P.frame; SOLO_STAT.full++; break; }
        pool.retry.delete(g);
        soloUpload(pool.bm, id);
        // 二人分の片方だけ出来た場合、完成まで元の束に任せる。
        pool.bm.setVisibleAt(id, false);
        ids.push(id); pool.geos[id] = g; pool.last[id] = P.frame;
        soloDropArrays(pool, id, g);
        copied++; workMs += performance.now() - started;
      }
      if (ids.length < e.n) {
        if (!ids.length) pool.ids.delete(g);
        continue;
      }
      for (let k = 0; k < e.n; k++) {
        const id = ids[k];
        pool.last[id] = P.frame;
        _soloM.fromArray(e.arr, k * 16); pool.bm.setMatrixAt(id, _soloM); pool.bm.setVisibleAt(id, true); pool.used.push(id);
      }
      e.n = 0;
    }
    for (const pool of P.pools.values()) pool.bm.visible = pool.used.length > 0;
  }
  restoreBatchRoots() {
    const roots = this.batch && this.batch.hiddenRoots;
    if (!roots) return;
    for (const root of roots) root.visible = true;
    roots.length = 0;
  }
  batchWalk(o, skip, tag, B) {
    const ch = o.children;
    let retained = false;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!c.visible) continue;
      if (c === skip) { retained = true; continue; }
      if (B.hide) { if (c.isMesh && !c.isSkinnedMesh) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); } }
      else if (c.isMesh && (c.material === MAT || c.material?.userData?.waterSource === MAT || fallenOf(c.material) || (c.material?.userData?.batchAs === MAT && B.d2 > (c.material.userData.batchNear || 0))) && (B.on || (c.castShadow && B.sh)) && !c.isSkinnedMesh && !c.isInstancedMesh) {
        const L = c.userData.lod;
        if (L || c.onBeforeRender === NO_OBR) {
          let geo = c.geometry;
          if (L) {
            const limit = B.low ? this.world.def.lowUnitNear || this.world.def.denseFront || this.world.def.lowArmyDetail
              : this.world.def.highUnitNear && (L[2] == null || L[2] <= 16);
            const nr = limit ? Math.min(L[2] ?? LOD.near, LOD.near) : L[2] ?? LOD.near;
            geo = B.fullDetail ? L[0] : B.poolFar ? L[1] : !LOD.on || B.d2 < nr * nr ? L[0] : L[1];
          }
          // 色の表（unit_pal）の束で描く形は、元の形の配列を使わない（組の形を描く）。配列を使う時だけ印を押し、iPhone の掃除で手放せるようにする
          //   （倒れた兵の体と頭が印を押され続け、死体 120 で 50MB が残っていた。10/20）
          if (!palOf(geo)) geo.userData.cpuUse = LAZY_NOW;
          // 16m より先の部品は頂点を升でまとめる。三方ヶ原と小谷は8cm、そのほかは5cm。
          //   遠さの段ごとに別の形にすると、同じ部品の束が段の数だけ増える（描く回数が増える）ので、16m より先は一つの粗さにそろえる
          if (!B.fullDetail && LOD.on && !B.low && !MEM_TIGHT && B.d2 >= 256) geo = coarseGeo(geo, this._coarse, this.world.def.highUnitGrid ?? 0.05);
          // 影を落とすのは 30m の内の部品だけ。影は画面の描き込みと別の束で、粗い形で描く（影の輪郭に細かい面は要らない）。
          //   画面の外の兵は影の束にだけ入れる。低は影を描かない
          const cs = c.castShadow && B.sh && !B.low && B.d2 < 900;
          // 槍を含む兵全体の球で残った後、見えない体の部品だけを束から外す。影は別に残す。
          let on = B.on;
          if (on && this.world.def.unitPartCull) {
            if (!geo.boundingSphere) geo.computeBoundingSphere();
            on = B.fr.intersectsSphere(B.partSphere.copy(geo.boundingSphere).applyMatrix4(c.matrixWorld));
          }
          if (!on && !cs) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); if (c.children.length) this.batchWalk(c, skip, tag, B); continue; }
          const wet = c.material.userData?.waterLevel || 0;
          const put = (bm, g0, shadowOnly) => {
            let geo = g0;
            const pi = palOf(geo);   // 全画質で、色だけ違う形は一つの束へ（色と濡れ具合は保つ）
            if (pi) geo = pi.geo;
            let mat = !shadowOnly && wet ? waterMaterial(pi ? MAT_P : MAT_I, wet) : null;
            // 倒れた兵：補光の材質の束へ（一人 6 回ずつ描いていた。三方ヶ原の雪で百回ほど）
            //   画質「低」の遠い形（9m より先）は補光を省き、生きた兵と同じ束へ（倒れた兵の分だけ束が倍になっていた）
            const fallen = !shadowOnly && fallenOf(c.material) && !(B.low && !(L && geo === L[0]));
            if (fallen) mat = fallenMaterial(mat || (pi ? MAT_P : MAT_I));
            const key = fallen ? fallenKey(geo, mat) : mat ? waterBatchKey(geo, mat) : geo;
            let e = bm.get(key);
            if (!e || e.n >= e.cap) e = this.batchGrow(geo, e, bm, shadowOnly, mat, key);
            c.matrixWorld.toArray(e.arr, e.n * 16);
            if (pi) e.col[e.n * 3] = pi.row;
            e.n++;
            // 一人だけの形になった時（soloDraw）のために、色の表を通す前の形と、それに合う材質を覚える
            if (!shadowOnly) {
              const bm2 = !pi ? e.im.material : fallen ? fallenMaterial(wet ? waterMaterial(MAT_I, wet) : MAT_I) : wet ? waterMaterial(MAT_I, wet) : MAT_I;
              // 色の表で一つにまとめた束では、兵ごとに元の形が違う事がある（違えば二人分を写さない）
              if (e.n === 1) e.mixed = false; else if (e.src !== g0 || e.bmat !== bm2) e.mixed = true;
              e.src = g0; e.bmat = bm2;
            }
          };
          if (on) put(B.map, geo, false);
          // 影は部品ごとの形を使わず、部品の囲みに合わせた低い多面体（楕円の玉）一つの束で描く（影の輪郭だけ。描く回数を一回に）
          if (cs && B.pl) this.shadowReal(B, geo, c);
          else if (cs) {
            const bx = shadowBox(geo);
            const SB = B.d2 > 144 ? SHADOW_BLOB_LO : SHADOW_BLOB;
            let e = B.mapS.get(SB);
            if (!e || e.n >= e.cap) e = this.batchGrow(SB, e, B.mapS, true, null, SB);
            _shM.multiplyMatrices(c.matrixWorld, bx);
            _shM.toArray(e.arr, e.n * 16);
            e.n++;
          }
          c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
        }
      }
      // 低画質の遠い部品は、体以外の共有材質も形と材質の組で束ねる。
      // 独自の描画処理・骨・半透明の得物は元の描き方を保つ。
      //   高は近くも束ねる（形と材質はそのまま。影は楕円の玉の束で落とす）
      else if (B.on && (!B.low || B.d2 > 100 || (this.world.def.lowArmyDetail && c.material?.userData.unitBatch)) && c.isMesh && !c.isSkinnedMesh && !c.isInstancedMesh
        && !c.geometry.userData.unitFlag && c.geometry !== EMBER_GEO
        && c.material?.isMaterial && (!c.material.transparent || c.material.userData.unitBatch)
        && (!c.geometry.groups.length || this.world.def.lowMaterialBatch) && !c.geometry.morphAttributes.position
        && (c.userData.lod || c.onBeforeRender === NO_OBR)) {
        const L = c.userData.lod, g0 = L && !B.fullDetail && (B.poolFar || LOD.on && (B.low || B.d2 >= LOD.near * LOD.near)) ? L[1] : L ? L[0] : c.geometry;
        g0.userData.cpuUse = LAZY_NOW;
        // 体の部品と同じく（高だけ）：16m より先は 8cm の升の粗い形、8〜16m は中くらいの形（無ければ 3cm の升）。8m の内は細かい形のまま
        const geo = B.fullDetail || !LOD.on || B.low || B.d2 < 64 || MEM_TIGHT ? g0 : B.d2 >= 256 ? coarseGeo(g0, this._coarse, 0.08) : g0 !== (L ? L[0] : c.geometry) ? g0 : L && (L[2] ?? LOD.near) <= LOD.near ? L[1] : coarseGeo(g0, this._coarse, 0.03);
        let keys = B.materialKeys.get(c.material);
        if (!keys) { keys = new WeakMap(); B.materialKeys.set(c.material, keys); }
        let key = keys.get(geo);
        if (!key) { key = {}; keys.set(geo, key); }
        let e = B.mapM.get(key);
        if (!e || e.n >= e.cap) e = this.batchGrow(geo, e, B.mapM, false, c.material, key);
        c.matrixWorld.toArray(e.arr, e.n * 16); e.n++;
        if (e.n === 1) e.mixed = false; else if (e.src !== geo) e.mixed = true;
        e.src = geo; e.bmat = c.material;
        // 高：影を落とす部品は、影だけの楕円の玉の束にも入れる
        if (!B.low && B.sh && c.castShadow && B.d2 < 900 && B.pl) this.shadowReal(B, geo, c);
        else if (!B.low && B.sh && c.castShadow && B.d2 < 900) {
          const SB = B.d2 > 144 ? SHADOW_BLOB_LO : SHADOW_BLOB;
          let s = B.mapS.get(SB);
          if (!s || s.n >= s.cap) s = this.batchGrow(SB, s, B.mapS, true, null, SB);
          _shM.multiplyMatrices(c.matrixWorld, shadowBox(geo)); _shM.toArray(s.arr, s.n * 16); s.n++;
        }
        c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
      }
      // 指物も旗の材質ごとに束ね、投影影は共通の形の束へ入れる（薄れた旗は元のまま）。
      // 足もとの丸い影も、同じ材質なので一つの束へ
      else if (c.isMesh && c.material?.isMaterial && B.on && !c.isInstancedMesh && (c.geometry.userData.unitFlag && !c.material.transparent)) {
        // 同じ家の旗でも両軍に分かれる戦があるため、形と材質で束ねる。
        let keys = B.materialKeys.get(c.material);
        if (!keys) { keys = new WeakMap(); B.materialKeys.set(c.material, keys); }
        let key = keys.get(c.geometry);
        if (!key) { key = {}; keys.set(c.geometry, key); }
        let e = B.mapF.get(key);
        if (!e || e.n >= e.cap) e = this.batchGrow(c.geometry, e, B.mapF, false, c.material, key);
        c.matrixWorld.toArray(e.arr, e.n * 16); e.n++;
        if (c.castShadow && B.sh && B.d2 < 900) this.shadowReal(B, c.geometry, c);
        c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
      }
      // 鉄砲の火縄の火（一つずつ描く小さな玉）は 20m より先では一画素にも満たないので描かない
      else if (c.geometry === EMBER_GEO && B.d2 > 400) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); }
      // 騎馬の手綱（一画素の線を一本ずつ描く）も 20m より先では描かない（本当の太さは十分の一画素ほど。線だけ太く浮いていた）
      else if (c.isLineSegments && B.d2 > 400) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); }
      // 前の束から外れた部品は、この後 layers が戻るので親を隠さない。
      if ((c.isMesh || c.isSprite || c.isPoints || c.isLine || c.isLight) && ((c.layers.mask & B.cameraMask) || (c.userData.bT !== undefined && c.userData.bT !== tag && (B.cameraMask & 1)))) retained = true;
      if (c.children.length && this.batchWalk(c, skip, tag, B)) retained = true;
    }
    return retained;
  }
  // 本人の部品の影：形ごとの影だけの束（画面の描き込みでは 0 人）へ、元の形のまま入れる
  shadowReal(B, geo, c) {
    let e = B.mapS.get(geo);
    if (!e || e.n >= e.cap) e = this.batchGrow(geo, e, B.mapS, true, null, geo);
    c.matrixWorld.toArray(e.arr, e.n * 16);
    e.n++;
  }
  batchGrow(geo, e, bm, cast, mat = null, key = null) {
    SOLO_STAT.batchesMade++;
    const cap = e ? e.cap * 2 : 16;
    const isP = !!geo.userData.pal;
    const im = new THREE.InstancedMesh(geo, bm === this.batch?.mapS ? SHADOW_ONLY_MAT : mat || (isP ? MAT_P : MAT_I), cap);
    if (isP) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    im.matrixAutoUpdate = false; im.frustumCulled = false; im.name = 'unitBatch'; im.castShadow = !!cast; im.userData.unitShadowBatch = !!cast;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (bm === this.batch?.mapS) {
      // 影だけの束：影の描き込みの前に数を戻し、画面の描き込みでは 0 人にする（0 人は描く回数にも入らない）
      im.onBeforeShadow = () => { im.count = im.userData.sn || 0; };
      im.onBeforeRender = () => { im.count = 0; };
    }
    const ne = { im, cap, n: e ? e.n : 0, arr: im.instanceMatrix.array, col: isP ? im.instanceColor.array : null };
    if (e) { ne.arr.set(e.arr.subarray(0, e.n * 16)); if (isP) ne.col.set(e.col.subarray(0, e.n * 3)); this.scene.remove(e.im); e.im.dispose(); SOLO_STAT.batchesDisposed++; }
    this.scene.add(im); bm.set(key || (isP ? geo : (mat || geo)), ne);
    return ne;
  }

  despawn(u) {
    if (u.gone) return;
    if (u.loopP) this.freeSama(u);
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    // 退いて地図の外・遠景の手前へ消えた者は「討たれた」のではない（討ち取りは army_combat.js の kill だけが決める）
    //   名のある武将（busho・名あり）が退いて消える時は、討たれた扱いにせず「落ち延びた」の知らせだけ出す
    const fled = u.alive && u.fleeing && u.name && u.type === 'busho';
    // 無傷の遠景への置き換えは死傷に含めず、陣形の人数と持ち場も一緒に詰める。
    if (u.alive && u.hp > 0 && !u.fleeing && !u.woundOut && !u.rearWound && u.group) {
      const g = u.group; for (const o of g.units) if (o !== u && o.slot > u.slot) o.slot--;
      if (g._slotTypes) g._slotTypes.splice(u.slot, 1);
      u.slot = -1; g._mix = null;
      g.initial = Math.max(0, g.initial - 1);
    }
    u.alive = false;
    u.gone = true;
    for (const a of this.arrows) if (a.host === u) a.life = 0;
    this.scene.remove(u.mesh);
    if (fled && this.hooks.onFlee) this.hooks.onFlee(u);
    // 逃げた者が捨てた槍・陣笠は、潰走の跡として地面に残す（残すのは 160 個まで。あふれたら本人から一番遠い物から片付ける）
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
  }
}

// Army の手法は役目ごとのファイルに分けてある。class の手法と同じ形（書き換えられる・数え上げない）で足す
for (const part of [ArmyCombat, ArmyFx, ArmyRanged, ArmyGroups, ArmyThink, ArmyDuel, ArmyMove, ArmyAnim, ArmyGround]) for (const k of Object.keys(part)) Object.defineProperty(Army.prototype, k, { value: part[k], writable: true, configurable: true, enumerable: false });


// 技の長さ（秒）と、穂先・刃が届く時（割合）
// 長柄の叩きは、振り上げ（構えの溜め）の後、柄が撓んで 0.2 秒で落ちる（三間柄の重さ）
const SWING = { thrust: [0.22, 0.5], charge: [0.2, 0], slam: [0.3, 0.67], sweep: [0.34, 0.55], kesa: [0.26, 0.55], gyaku: [0.26, 0.55], yoko: [0.26, 0.5], tsuki: [0.22, 0.5], butt: [0.24, 0.55] };
// 刀の構え [x, y, z, 上下, 左右, 刃の向き]（手の置き所。体の外の座標）
const SW_POSE = {
  sage: [0.28, 1.0, 0.25, 0.5, 0, 0], chudan: [0.12, 1.12, 0.32, -0.45, -0.08, 0],
  kesa0: [0.3, 1.62, 0.02, -2.2, 0.35, -0.3], kesa1: [-0.12, 0.95, 0.42, 0.75, -0.55, -0.5],
  gyaku0: [-0.12, 0.92, 0.2, 0.7, -0.7, 2.6], gyaku1: [0.3, 1.58, 0.38, -1.4, 0.55, 2.6],
  yoko0: [0.38, 1.3, 0.0, -0.15, 1.5, -1.57], yoko1: [-0.25, 1.25, 0.35, -0.1, -1.2, -1.57],
  tsuki0: [0.18, 1.15, -0.02, -0.08, 0, 1.57], tsuki1: [0.08, 1.25, 0.72, -0.05, -0.05, 1.57],
  // 馬上の斬り：右の肩の上へ振りかぶり、馬の右の脇の低い所（徒歩の相手の肩・首）へ斬り下ろす
  uma0: [0.32, 1.68, -0.02, -2.3, 0.45, -0.25], uma1: [0.5, 0.92, 0.42, 0.85, 0.35, -0.55],
  // 受け：柄を右のこめかみの前へ上げ、切先を左下へ垂らして刀身を斜めに（鎬で相手の刃を左下へ受け流す）
  uke: [0.2, 1.55, 0.3, 0.75, -0.9, 0], cheer: [0.3, 1.9, 0.1, -1.6, 0, 0],
};
// 八相・上段（中段と袈裟の振りかぶりの間の形から作る）
const SW_HASSO = [0.26, 1.42, 0.12, -1.55, 0.2, -0.15], SW_JODAN = [0.14, 1.66, 0.16, -1.9, 0.05, 0];
// 鉄砲の構え [x, y, z, 上下]
const GUN_POSE = {
  carry: [0.3, 1.08, 0.18, -0.8], ready: [0.22, 1.1, 0.25, -0.35], kiri: [0.2, 1.14, 0.26, -0.12], aim: [0.1, 1.45, 0.25, -0.02], fire: [0.1, 1.45, 0.25, -0.02],
  lower: [0.24, 0.74, 0.34, -1.45], powder: [0.24, 0.74, 0.34, -1.45], ball: [0.24, 0.74, 0.34, -1.45], ram: [0.24, 0.74, 0.34, -1.45], prime: [0.18, 1.02, 0.3, -0.12], match: [0.18, 1.02, 0.3, -0.12],
};
// 込め直しの手順と、それぞれにかかる割合（合わせて 1）
const RELOAD = [['lower', 0.06], ['powder', 0.16], ['ball', 0.1], ['ram', 0.34], ['prime', 0.22], ['match', 0.12]];
// 弓の構え [x, y, z, 上下, 左右]（弓を持つ左手）
const BOW_POSE = { rest: [-0.28, 1.0, 0.18, 0.12, 0], nock: [-0.05, 1.08, 0.36, 0.05, -0.2], raise: [0.02, 1.76, 0.3, 0, -0.25], kai: [-0.02, 1.5, 0.62, 0, -0.3] };
const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// 槍の突きの出（0..1）：溜めから加速して一気に突き出し（出の半ば、当たる時に伸び切る。一コマで跳ばない）、穂先を一瞬とどめ、
// 中くらいの速さ（0.26 秒ほど）で手元へ繰り込んで構え直す。humans.js の体の踏み込みも同じ拍子で
export function thrustOut(p, dur = 0.22, retract = 0.26) {
  if (p < 0.5) { const x = p / 0.5; return x * x * (3 - 2 * x); }
  if (p < 0.66) return 1;
  const r = clamp01((p - 0.66) * dur / retract);
  return 1 - r * r * (3 - 2 * r);
}
const _nk = new THREE.Vector3();
// 血の見せ方（設定）：2 あり・1 控えめ・0 なし
export function bloodLv() { const b = S.blood; return b === 'off' ? 0 : b === 'low' ? 1 : 2; }
// 粒の色
const PCOL = { blood: [0.3, 0.06, 0.045], dust: [0.42, 0.37, 0.29], cloth: [0.36, 0.34, 0.3], wood: [0.45, 0.36, 0.24] };
// 染みの形：縁の不揃いな円を三通り
// 地面の染み：寝かせた板に、にじんだ染みの絵（白地の濃淡とアルファ。色は材質の色で付ける）
const STAIN_PLANE = new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2);
const STAIN_TEX = [0, 1, 2].map((s) => {
  const r = rng(71 + s * 13), S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  // 大きな溜まり一つと、まわりに寄り添う小さな溜まり（縁が不規則に）
  const blob = (x, y, rad, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  blob(S / 2, S / 2, S * 0.28, 0.95);
  for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = S * (0.1 + r() * 0.2); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.06 + r() * 0.12), 0.6 + r() * 0.35); }
  // 飛び散った小さな点
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = S * (0.3 + r() * 0.16); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.5 + r() * 3, 0.7); }
  // 土に吸われたむら（明暗の雑音）
  const img = g.getImageData(0, 0, S, S), D = img.data;
  for (let i = 0; i < D.length; i += 4) { const n = 0.75 + r() * 0.25; D[i] = D[i + 1] = D[i + 2] = 255 * n; D[i + 3] *= 0.8 + r() * 0.2; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
// 粒の丸い絵（血しぶき・土・火花。縁をぼかす）
let _dot = null;
function roundDot() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
// 誤差関数（弾の当たる見込み）
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
// 線分 a→b が柵の線 s と交わる所（a→b の割合 0..1）。交わらなければ -1
const NO_SEGS = [];
const SEG_SET = new Set(), SEG_OUT = [];
function segsIn(grid, cx0, cx1, cz0, cz1) {
  SEG_SET.clear(); SEG_OUT.length = 0;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = grid.get(cx * 4096 + cz); if (!a) continue;
    for (const s of a) if (!SEG_SET.has(s)) { SEG_SET.add(s); SEG_OUT.push(s); }
  }
  return SEG_OUT;
}
function segHit(ax, az, bx, bz, s) {
  const [cx, cz, dx, dz] = s;
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return -1;
  const qx = cx - ax, qz = cz - az;
  const u = (qx * sZ - qz * sX) / den, v = (qx * rZ - qz * rX) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? u : -1;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distToSeg(x, z, s) {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

// 空馬の元の持ち主の家の名（「武田の馬を分捕った」の札に使う）
const HOUSE_NAME = { nobukatsu: '信勝方', tokugawa: '徳川', takeda: '武田', akazonae: '山県の赤備え', okudaira: '奥平', oda: '織田', imagawa: '今川', saito: '斎藤', rokkaku: '六角' };
