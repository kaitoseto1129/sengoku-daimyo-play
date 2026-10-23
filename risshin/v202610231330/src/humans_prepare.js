// 人の処理：支度。外部向けの入口は humans.js。
import { HUM, SRC, HSTAT, HUM_Q, preparationFrame, SKIN_MAX, shapesReady, qualityKeeper, borrowHuman, humanPool, humanBuilding, HEAD } from './humans_shared.js';
import { _pv, _fr } from './humans_lifecycle.js';
import { preparationUnits, preStep } from './humans_crowd_geometry.js';
import { prefetchLook, showHuman, buildHuman } from './humans_runtime.js';
import { S, MEM_TIGHT } from './settings.js';
import { finishFaceCopies, headMats } from './humans_face_materials.js';
import * as THREE from 'three';
import { nearCrowdMat } from './humans_crowd.js';
import { DM, DOMARU, domaruMaterial } from './humans_armor.js';
import { MHHAND, handGeo } from './humans_hands.js';
import { EYE_MH, MOUTH_MH } from './humans_face_geometry.js';
import { HR } from './humans_horse_model.js';
import { TACK_GLOSS, TACK_MATTE, TACK_SILK, ROPE } from './humans_horse_tack.js';
import { gripPose, humans } from './humans_combat.js';
import { driveHuman } from './humans_animate.js';

// 支度の札を見せている間に、カメラの近くの兵の形（部品・束ねた形）を前もって作る（指の端末用。材質と絵の下ごしらえはしない＝固まらない）。
//   開戦直後に近くの兵が次々と人になる時、一人ごとの形づくりが重いコマを作らないよう。ms を使い切るか、近い者が済んだら終わる
async function prefetchHumanShapes(rt, camera, ms = 600, current = () => true) {
  if (!HUM.on || !HUM.ready || !SRC || !rt?.army) return 0;
  const t0 = performance.now();
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pv);
  // 骨の支度と同じ総数まで。用意済みの人も枠に数え、残り全員の
  // 甲冑・束ねた形を先読みして携帯の支度の上限をすり抜けない。
  const units = Number.isFinite(rt.humanPreparationCap)
    ? preparationUnits(rt, camera).slice(0, Math.max(0, rt.humanPreparationCap))
    : rt.army.units;
  let n = 0, slice = performance.now();
  while (performance.now() - t0 < ms && current()) {
    const before = HSTAT.preSteps = (HSTAT.preSteps || 0);
    prefetchLook(units, camera.position.x, camera.position.z, (HUM_Q[S.quality] || HUM_Q.high).near);
    if (HSTAT.preSteps === before) break;   // 近い者は皆済んだ
    n++;
    // 札の動きと取り消しを止めないよう、時々画面へ戻す
    if (performance.now() - slice >= 3) { await preparationFrame(); slice = performance.now(); }
  }
  return n;
}
// 読み込みの札を見せている間に、この戦で出る「見た目」を一人ずつ先に作って、絵の下ごしらえ（compileAsync）に含める
//   → 戦が始まって近くで本物の人に替わる時（updateHumans/useHuman）、同じ見た目の材質はもう作ってあるので、シェーダ作りの重いコマが立たない
//   姿（look）の組み合わせごとに一人だけ作る（具足の色・兜・母衣・面頬・本物の胴丸・僧兵・家紋）。次のコマで見えなければ自分で軽い形へ戻る（humansStep）
// この戦に出る見た目（姿の組み合わせ）を、重ならないよう一人ずつ選ぶ（最大 cap 人）
function pickLooks(units, cap) {
  const seen = new Set(), picked = [];
  for (const u of units) {
    if (picked.length >= cap) break;
    if (u.gone || !u.mesh || u.type === 'dummy' || !u.look || u.human) continue;
    const L = u.look;
    const sig = u.type + '|' + JSON.stringify(L);
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(u);
  }
  return picked;
}
function warmOne(u) {
  try {
    if (showHuman(u)) {
      // 見た目（材質）だけ先に作る：今の軽い形の見え方は変えない（作ってすぐ隠す。近ければ humansStep が改めて本物の人にする）
      u.human.root.visible = false;
      if (u.body) u.body.visible = true;
      if (u.legL) { u.legL.visible = true; u.legR.visible = true; }
      return true;
    }
  } catch (e) { /* 一人だけ失敗しても続ける */ }
  return false;
}
// 読み込みの札を見せている間に、この戦で出る見た目を一人ずつ先に作って compileAsync に含める（隊が実体化する時のシェーダ作りが重くならないよう）
//   一度に全部は作らない（重ならない姿だけを選んでも、混んだ機械では一つの compileAsync が長く掛かる事がある。少しずつに分けて、間に描ける所は描かせる）
function warmLooks(units, cap = 46) {
  if (!HUM.on || !HUM.ready) return 0;
  let made = 0;
  for (const u of pickLooks(units, cap)) if (warmOne(u)) made++;
  return made;
}
// 支度では指定した総数まで用意し、残りは開戦後に一人ずつ作る。
async function primeHumans(rt, renderer, camera, cap = Infinity, chunk = 1, current = () => true) {
  if (rt.humansPrimed || !HUM.on || !HUM.ready || !current()) return 0;
  if (MEM_TIGHT) cap = Math.min(cap, SKIN_MAX);
  let prepared = 0;
  for (const u of rt.army.units) if (u.human) prepared++;
  const picked = pickLooks(preparationUnits(rt, camera), Math.max(0, cap - prepared));
  let made = 0;
  for (const u of picked) {
    if (!current()) return made;
    while (!shapesReady(u) && current()) {
      preStep(u, 3);
      await preparationFrame();
    }
    if (!current()) return made;
    // 骨の複製・着せ付け・動きの用意も、一コマ3msの区切りで進める。
    if (!u.human) {
      if (MEM_TIGHT && !qualityKeeper(u) && borrowHuman(u)) continue;
      if (MEM_TIGHT && !qualityKeeper(u) && humanPool.size + humanBuilding.size >= SKIN_MAX) continue;
      const task = u._humanBuild || buildHuman(u, u.look || {});
      u._humanBuild = task; u._humanBuildLook = u.look;
      let step;
      do {
        const began = performance.now();
        do { step = task.next(); } while (!step.done && performance.now() - began < 3);
        if (!step.done) await preparationFrame();
        if (!current()) { task.return(); u._humanBuild = null; u._humanBuildLook = null; return made; }
      } while (!step.done);
      u.human = step.value; u._humanBuild = null; u._humanBuildLook = null;
      if (!u.human) continue;
      u.mesh.add(u.human.root);
    }
    if (warmOne(u)) made++;
    await finishFaceCopies(current);
    await preparationFrame();
  }
  if (current()) { rt.humansPrimed = true; HUM.primed = true; }
  return made;
}
// 隠れた材質と、支度で作った馬も本番と同じ属性の形で渡す。
function humanProgramSamples(rt) {
  const samples = [];
  const body = rt.army.units.find(u => u.human)?.human?.body;
  if (body) {
    const add = (geo, material, skinned = true) => {
      if (!geo || !material) return;
      const m = skinned ? body.clone(false) : new THREE.Mesh();
      m.geometry = geo; m.updateMorphTargets(); m.material = material; m.receiveShadow = true;
      samples.push(m);
    };
    for (let v = 0; v < 4; v++) {
      add(body.geometry, nearCrowdMat(v));
      if (DM && DOMARU.ready) for (const nh of [false, true, 'helm']) add(DM.hi, domaruMaterial({}, nh, v));
    }
    // 一般兵用も支度中に作り、開戦後の最初の描画で処理を組み立てない。
    if (DM && DOMARU.ready) add(DM.loanMid, domaruMaterial({}, true, 0, false));
    for (const m of headMats.values()) add(HEAD.geo, m, false);
    if (MHHAND) for (const m of MHHAND.mats.values()) add(handGeo(), m);
    // 目・歯（mheye・mhteeth）は戦中に初めて描かれる事が多い。見本に入れて支度で作る（10/20）
    if (EYE_MH.mat && EYE_MH.geos.size) add(EYE_MH.geos.values().next().value, EYE_MH.mat, false);
    if (MOUTH_MH.teethM && MOUTH_MH.geos.size) add(MOUTH_MH.geos.values().next().value, MOUTH_MH.teethM, false);
  }
  if (HR && !rt.def?.noHorse) for (const horse of HR.pool) samples.push(horse.holder, horse.extra);
  // 馬具（漆・革・絹：tack2g・tack2m・tacksilk）は乗り手が付いた馬にだけ出るので、見本にも入れる
  if (HR && !rt.def?.noHorse) for (const m of [TACK_GLOSS, TACK_MATTE, TACK_SILK]) { const o = new THREE.Mesh(ROPE, m); o.receiveShadow = true; samples.push(o); }
  return samples;
}
function stepHuman(u, dt) { if (u.human) { gripPose(u.human, dt); driveHuman(u.human, dt); } }
// 人の数（重さを見るため）
function humanCount() { return humans.size; }
function restOf(nm) { return SRC && SRC.rest[nm]; }

export { prefetchHumanShapes, warmLooks, primeHumans, humanProgramSamples, stepHuman, humanCount, restOf };
