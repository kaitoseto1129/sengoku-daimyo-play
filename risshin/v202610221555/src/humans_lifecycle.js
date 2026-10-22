// 人の処理：人の貸し出しと片付け。外部向けの入口は humans.js。
import { humans, gripReset, restInverse } from './humans_combat.js';
import { cmdOff, SAIHAI } from './humans_motion.js';
import { syncArmorWear } from './armor_wear.js';
import { ARMY, WORLD } from './humans_context.js';
import { unbindHumanBounds, releaseHumanBounds } from './humans_bounds.js';
import { MEM_TIGHT } from './settings.js';
import { humanPool, pinHumanGeometries, crowdGeos, SRC, HEAD, crowdShapes, HUM, memTight, isNamed } from './humans_shared.js';
import { headMats, headTexs, MH_PORES } from './humans_face_materials.js';
import { headGeos, scalpGeos, hairGeos, hatMats, EYE_MH, MOUTH_MH, HAIR_MATS } from './humans_face_geometry.js';
import { bodyMats, fpArmM, GRIME } from './humans_materials.js';
import { dmMats, monMats, DM, KB, YR, CREST_GEO, CREST_MAT, MON_GEO } from './humans_armor.js';
import { nearArmorGeos, kzSplit, crestGeos, yokeGeos, sleeveGeos, soheiCache, SOHEI_HEAD, NAGINATA } from './humans_dress.js';
import { coveredBodyGeos, bodyLoGeos } from './humans_lod.js';
import { menpoGeos, menpoMats, eyeFast, EYE_FAST_MATS, MENPO_TEX } from './humans_face.js';
import { HR, cordMap } from './humans_horse_model.js';
import { MHHAND } from './humans_hands.js';
import { ROD_GEO, ROD_MAT } from './humans_arms.js';
import { STIRRUP, TASSEL, ROPE, redWhiteCord } from './humans_horse_tack.js';
import { ropeMats } from './humans_horse_materials.js';
import { cloneWaterMaterial } from './water_body.js';
import { WET } from './world.js';
import { RIDE } from './units.js';
import * as THREE from 'three';
import { battleResources } from './battle_resources.js';
import { crowdMats } from './humans_crowd.js';

const humanSelection = { army: null, quality: null, count: -1, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
const humanTurn = Math.cos(Math.PI / 180);
const noopChange = () => {};
function dropHuman(u) {
  const h = u.human;
  if (!h) return;
  if (h.root.visible || !h.hidAt) h.hidAt = performance.now();   // 隠れた時刻（evictHidden が長く隠れた順に捨てる）
  h.root.visible = false;
  humans.delete(h);
  carryFlag(h, false);
  if (h.bow0 && u.hand) { u.hand.position.set(h.bow0.x, h.bow0.y, h.bow0.z); u.hand.rotation.z = 0; h.bowUp = h.bowK = 0; h.bowMoved = false; }
  if (h.rod) h.rod.visible = false;
  cmdOff(h);
  gripReset(h);
  if (u.body) u.body.visible = true;
  if (u.legL) { u.legL.visible = true; u.legR.visible = true; }
  syncArmorWear(u, ARMY?.hideBlood);
  if (u.armorWear && u.armorWear.root.parent !== h.bones?.Spine1) unbindHumanBounds(u.armorWear.root);
  if (MEM_TIGHT && humanPool.has(h)) {
    pinHumanGeometries(h);
    releaseHumanBounds(h);
    h.root.parent?.remove(h.root);
    h.leased = false; h.u = null; u.human = null;
  }
}
function humanResourceCaches() {
  return [headMats, headTexs, headGeos, scalpGeos, hairGeos,
    bodyMats, dmMats, hatMats, nearArmorGeos, kzSplit, crestGeos, monMats,
    crowdGeos, coveredBodyGeos, bodyLoGeos, menpoGeos, menpoMats, eyeFast, EYE_FAST_MATS,
    yokeGeos, sleeveGeos, soheiCache, nearFlagMats, EYE_MH.geos, MOUTH_MH.geos];
}
// 読み込み済みの原本と、小さな共用品は残す。馬の作り置きは戦ごとに返す。
function sharedHumanResources() {
  return [SRC, HEAD, DM, KB, YR, HR && { ...HR, pool: [], mats: null, tack: null }, MHHAND,
    CREST_GEO, CREST_MAT, MON_GEO, HAIR_MATS, EYE_MH.mat, MOUTH_MH.teethM,
    MENPO_TEX, SOHEI_HEAD, NAGINATA, SAIHAI, ROD_GEO, ROD_MAT,
    STIRRUP, TASSEL, ROPE, cordMap, redWhiteCord, ropeMats, MH_PORES, fpArmM];
}
// 戦の終わり・支度の取り消しでは、取り外す前に固有の素材も拾う。
// 人の形・材質の表（戦の片付けで空にする。gpu_gc.js はここにある形を手放さない）
function humanCaches() {
  return [humanPool, headMats, headTexs, headGeos, scalpGeos, hairGeos,
    bodyMats, dmMats, hatMats, nearArmorGeos, kzSplit, crestGeos, monMats,
    crowdGeos, crowdShapes, coveredBodyGeos, bodyLoGeos, menpoGeos, menpoMats, eyeFast, EYE_FAST_MATS,
    yokeGeos, sleeveGeos, soheiCache, nearFlagMats, EYE_MH.geos, MOUTH_MH.geos, CREST_GEO];
}
// 背の指物を背骨に付ける（走る・屈む・馬の上で揺れる体について行く）。外す時は元の所へ
// 近くで背負う指物の布：元の旗の材質（はためき・家紋）に、布の目・細かなしわの波・裾と縁の擦り切れと破れ・泥と日焼けを足す
//   元の材質ごとに一つ写して使い回す（遠くの旗は元のまま）。破れ方と汚れ方は旗ごとに違う（竿の背丈の種から）
const nearFlagMats = new Map();
function nearFlagMat(m0) {
  if (!m0 || m0.userData.nearFlag || m0.userData.faded || m0.userData.muddy) return m0;
  if (nearFlagMats.has(m0)) return nearFlagMats.get(m0);
  const m = cloneWaterMaterial(m0);
  // userData は材質の複製時に JSON 化される。元の材質への参照は外に持つ。
  Object.assign(m.userData, m0.userData, { nearFlag: true });
  m.nearFlagBase = m0;
  const ob = m0.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (ob) ob.call(m0, sh, r);
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec2 vFq;\nvarying float vFs;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFq = position.xy; vFs = fract(length(modelMatrix[1].xyz) * 97.0);
      // 布の細かなしわ：大きな波の上を、小さな波が裾へ走る
      transformed.z += sin(position.y * 38.0 + position.x * 21.0 + vFs * 40.0) * 0.004 * clamp(position.x / 0.36, 0.2, 1.0);`);
    sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec2 vFq;\nvarying float vFs;\n' + `
float nfH(vec2 p) { return fract(sin(dot(p, vec2(27.17, 61.31))) * 43758.5453); }
float nfN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(nfH(i), nfH(i + vec2(1, 0)), f.x), mix(nfH(i + vec2(0, 1)), nfH(i + vec2(1, 1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // 旗の座標：x 0（竿）〜0.36（外の端）、y -0.36（裾）〜0.36（上）
        vec2 q = vFq; float u = q.x / 0.36, v = q.y / 0.72 + 0.5;
        // 破れと擦り切れ：外の端と裾がぎざぎざに欠け、旗によっては裂け目が入る
        float fray = nfN(vec2(v * 60.0, vFs * 9.0)) * 0.05 + nfN(vec2(v * 9.0, vFs * 3.0)) * 0.05;
        float frayB = nfN(vec2(u * 55.0, vFs * 7.0)) * 0.04 + nfN(vec2(u * 7.0, vFs * 5.0)) * 0.05;
        float torn = step(0.55, vFs) * smoothstep(0.06, 0.0, abs(v - (0.3 + vFs * 0.4) - (u - 1.0) * 0.4)) * smoothstep(0.55, 0.95, u);
        if (u > 1.0 - fray * (0.4 + vFs) || v < frayB * (0.3 + vFs * 0.8) || torn > 0.5) discard;
        // 布の目（縦横の糸）と、糸のほつれた縁
        float fw = fwidth(q.x) * 900.0;
        float weave = (sin(q.x * 2800.0) * sin(q.y * 2800.0)) * (1.0 - smoothstep(0.5, 1.5, fw));
        diffuseColor.rgb *= 1.0 + weave * 0.06;
        diffuseColor.rgb *= 1.0 - smoothstep(1.0 - fray * (0.4 + vFs) - 0.03, 1.0 - fray * (0.4 + vFs), u) * 0.35;
        // 汚れ：裾から上へ泥と雨の染み、竿の側は手垢、全体に日焼けの褪せ
        float dirt = smoothstep(0.35, 0.0, v) * (0.4 + 0.6 * nfN(q * 30.0 + vFs * 10.0)) + smoothstep(0.08, 0.0, u) * 0.3;
        dirt *= 0.45 + 0.4 * vFs + 0.4 * uGrime;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.18, 0.13), clamp(dirt, 0.0, 1.0) * 0.55);
        float stain = smoothstep(0.62, 0.8, nfN(q * 14.0 + vFs * 20.0)) * (0.3 + uGrime * 0.5);
        diffuseColor.rgb *= 1.0 - stain * 0.18;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 0.95 + 0.02, 0.15 + vFs * 0.1);
        diffuseColor.rgb *= 1.0 - uWet * 0.25;
      }`);
  };
  const k0 = 'nearflag' + (m0.customProgramCacheKey ? m0.customProgramCacheKey() : String(ob || ''));
  m.customProgramCacheKey = () => k0;
  nearFlagMats.set(m0, m);
  return m;
}
function carryFlag(h, on) {
  const u = h.u, f = u.flag;
  if (!f) return;
  // 近い形への切り替えでも、落ちた指物を背へ戻さない。
  if (f.userData.groundDetached || u.iwaFlagRig || u.tennojiFlagRig) return;
  // 近くの者の指物は細かな布に、離れたら元の材質へ
  if (f.isMesh && f.material && f.material.userData && !f.material.userData.faded) {
    // 軽い体の旗は共通の材質へ戻す。同じ布と材質を Army の束で描く。
    if (on && u.alive && !h.lodFar) f.material = nearFlagMat(f.material);
    else if ((!on || h.lodFar) && f.material.nearFlagBase) f.material = f.material.nearFlagBase;
  }
  if (f.userData.baseY == null) f.userData.baseY = f.position.y - (u.mounted ? RIDE.y : 0);
  const base = f.userData.baseY;
  // 刀根坂の遠い兵は体と竿を軽い形で描く。更新を間引く骨へ布だけ残さない。
  if (on && h.lodFar && f.userData.followPole) {
    const parent = u.mounted && u.seat ? u.seat : u.mesh;
    if (f.parent !== parent) {
      parent.add(f);
      f.position.y = base + (u.mounted ? RIDE.y : 0);
      unbindHumanBounds(f);
    }
    return;
  }
  if (on) {
    if (!h.flagHolder) {
      // 旗は竿と一緒にしなる：兵は竿の骨（swPole）に、本人・武将は竿の形に付ける
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      if (h.xb && h.xb.swPole) { g.matrix.copy(restInverse('Spine2')); h.xb.swPole.add(g); }
      else if (h.parts.pole) { g.matrix.copy(SRC.fitTi); h.parts.pole.add(g); }
      else { g.matrix.copy(restInverse('Spine2')); h.bones.Spine2.add(g); }
      h.flagHolder = g;
    }
    const followPole = !!f.userData.followPole;
    if (f.parent === h.flagHolder && h.flagMounted === !!u.mounted && h.flagFollowPole === followPole) return;
    h.flagHolder.add(f);
    h.flagMounted = !!u.mounted;
    h.flagFollowPole = followPole;
    // 刀根坂では布と竿を同じ体の座標に置く。鞍の高さは親の骨から既に受ける。
    f.position.y = base + (u.mounted && !followPole ? SRC.rest.Hips.y - 0.79 : 0);
  } else if (h.flagHolder && f.parent === h.flagHolder) {
    (u.mounted && u.seat ? u.seat : u.mesh).add(f);
    f.position.y = base + (u.mounted ? RIDE.y : 0);
    unbindHumanBounds(f);
  }
}
// 隠れた人の根元：見えない間は子（骨）の行列を辿らない。見せた時は次の描画で直る
const _umw = THREE.Object3D.prototype.updateMatrixWorld;
//   このコマに骨を動かさなかった人（遠くで間引いた・画面の外・倒れ切った）で、根元の場所も前のコマと同じなら、骨と部品の行列を辿り直さない
//   （六十二本の骨と部品を一人ずつ毎コマ組み直していた。10/8 測ると、姉川で描く時間の一割五分）。動いた・骨を動かした時はいつも通り辿る
const _mwT = new THREE.Matrix4();
function skipHiddenMW(force) {
  const h = this.userData.hum;
  if (!this.visible || h?.poseHidden && h.noSh) {
    // 親から強制更新されても、描かず影も使わない子へは降りない。
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    // 体の中心が画面外でも、坂を下る兵の部品は画面に残る。
    // 根元だけを移すと、今の逆行列に古い骨が組み合わさり、皮膚が山から伸びる。
    // 指定した戦の、表示を許した移動中の人だけ直す。静止中の骨と姿勢の間引きは保つ。
    if (this.visible && WORLD?.def.movingHiddenBones &&
        (!h.mw0 || !this.matrixWorld.equals(h.mw0))) {
      _umw.call(this, true);
      (h.mw0 || (h.mw0 = new THREE.Matrix4())).copy(this.matrixWorld);
      this._humanMWPaused = false;
      return;
    }
    this.matrixWorldNeedsUpdate = true;
    this._humanMWPaused = true;
    return;
  }
  if (this._humanMWPaused) { this._humanMWPaused = false; _umw.call(this, true); return; }
  // 近い兵と倒れる途中の兵は、指と装備の骨まで同じコマに揃える。
  // 画面外で止めた人は、親からの強制更新でも同じ場所の骨を組み直さない。
  // 移動した時は下の根元の行列比較で検出し、影も今の位置へ動かす。
  if ((!h || !h.poseHidden) && (force === true || h && (!h.far || !h.u.alive && !h.still))) { _umw.call(this, true); return; }
  if (h && h.mwHold && h.mw0 && this.parent && !HUM.lodOff) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    _mwT.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    if (_mwT.equals(h.mw0)) {
      this.matrixWorldNeedsUpdate = false;
      // 止めている間も、握り（gripPose の updateWorldMatrix）で手の骨だけが新しくなる事がある。指を手に合わせ直す（手の皮が帯のように伸びないよう）
      if (!h.poseHidden && (!h.lodFar || WORLD?.def.fullTipMatrices) && h.bones) { h.bones.LeftHand?.updateMatrixWorld(true); h.bones.RightHand?.updateMatrixWorld(true); }
      return;
    }
  }
  _umw.call(this, force);
  if (h) (h.mw0 || (h.mw0 = new THREE.Matrix4())).copy(this.matrixWorld);
}
function tipMW(force) {
  const h = this.userData.h;
  // 近い人は手・頭の先（指・顔）を必ず辿り直す。IK などが getWorldPosition で手の行列だけを先に直すと「直す要あり」の印が消え、指だけ古い所に残って手の皮が帯のように伸びた
  // 切岸で手足を接地させる戦では、遠い形にも指まで皮膚の重みが残る。
  // 手首だけを直すと指が以前の場所へ残るため、既存の更新時に先までそろえる。
  // 止まった人は根元の skipHiddenMW で省き、他の戦の間引きは保つ。
  if (!h || !h.lodFar || h.skelDirty || WORLD?.def.fullTipMatrices) { _umw.call(this, true); return; }
  if (this.matrixAutoUpdate) this.updateMatrix();
  if (this.matrixWorldNeedsUpdate || force) { this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); this.matrixWorldNeedsUpdate = false; force = true; }
  // 骨でない子（顔・部品）と、頭に付けた揺れる骨（笠）は辿る
  for (const c of this.children) if (!c.isBone || c.name.startsWith('sw')) c.updateMatrixWorld(force);
}
const _pv = new THREE.Matrix4();
const _fr = new THREE.Frustum();
const _sph = new THREE.Sphere(new THREE.Vector3(), 2.2);
// 遠い兵（lodFar）の槍は、一本ずつでなく同じ形ごとに一つの InstancedMesh でまとめて描く（描く回数を槍の数から形の数へ）。
//   元の槍の描き物は layers で画面から外すだけ（visible・材質は他の所が使うので触らない）。近くの兵・指物・馬は今まで通り
const farSp = new Map();
const farSpHid = new Set();
const farSpNow = new Set();
const COARSE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
function evictHidden(army, player) {
  if (MEM_TIGHT) return;   // 携帯は捨てずに貸出待ちへ返す。
  const cap = memTight() ? ((window.__apx && window.__apx.evict) || 8) : COARSE ? 36 : 90;   // x_evictN：実機で隠れた人の枠を試す
  const hid = [];
  for (const u of army.units) if (u.human && !u.human.root.visible && !u.isPlayer && !(u.look && isNamed(u.look))) hid.push(u);
  // iPhone：隠れてすぐの人は捨てない（森部で捨てた人の 6 割が 10 秒の内に作り直され、作り直しのごみが WebContent を押していた。10/21）。
  //   長く隠れた順に捨て、隠れた人は合わせて 16 人まで。ほかは遠い順
  const tight = memTight(), now = performance.now(), keepMs = 12000, hardCap = (window.__apx && window.__apx.hid) || 16;   // x_hidN：実機で隠れた人の枠を試す
  let dropN = 0;
  if (tight) {
    hid.sort((a, b) => (a.human.hidAt || 0) - (b.human.hidAt || 0));   // 長く隠れた順
    while (dropN < hid.length && (hid.length - dropN > hardCap || now - (hid[dropN].human.hidAt || 0) > keepMs)) dropN++;
  } else if (hid.length > cap) {
    const d2 = (u) => (u.pos.x - player.pos.x) ** 2 + (u.pos.z - player.pos.z) ** 2;
    hid.sort((a, b) => d2(b) - d2(a));
    dropN = hid.length - cap;
  }
  if (!dropN) return;
  // 捨てる人だけが持つ形・材質・絵（表情の材質・目と口の形・顔の絵など）は GPU から返す。ほかの人や場面がまだ使う物（共有の頭・胴丸・旗の絵）は残す。
  //   評価：geometries が 2 分で 630→830 と増え続けた（10/19 測る）。捨てた人の固有の形を返さないと、戦の間ずっと GPU に残る
  const drop = new Set();
  for (let i = 0; i < dropN; i++) drop.add(hid[i]);
  // 場面に残したまま走査すると、捨てる本人の素材まで「使用中」になる。
  // 指物を戻し、全員の根を外してから、残す素材を集める。
  for (const u of drop) {
    const h = u.human;
    dropHuman(u);
    h.mixer?.stopAllAction(); h.mixer?.uncacheRoot(h.model);
    h.root.parent?.remove(h.root);
  }
  // 今は誰も着ていない共有の原本・作り置きも、次に使えるよう残す。
  const resources = battleResources([sharedHumanResources(), humanResourceCaches(), crowdMats, WORLD?.scene,
    army.units.filter(u => u.human && !drop.has(u)).map(u => u.human.root)]);
  for (const u of drop) {
    resources.add(u.human.root);
    releaseHumanBounds(u.human);
    u.human = null;
  }
  resources.dispose();
}

export { humanSelection, humanTurn, noopChange, dropHuman, sharedHumanResources, humanCaches, carryFlag, skipHiddenMW, tipMW, _pv, _fr, _sph, farSp, farSpHid, farSpNow, COARSE, evictHidden };
