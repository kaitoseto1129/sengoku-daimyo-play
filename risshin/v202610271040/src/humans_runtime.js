// 人の処理：組み立てと表示の切り替え。外部向けの入口は humans.js。
import { MHHAND, handGeo } from './humans_hands.js';
import * as THREE from 'three';
import { GRIME, bodyMaterial, fpArmMat, CLOTH_W } from './humans_materials.js';
import { WIND_STATE, WET, ARMY_P, ARMY_REAL_P, ARMY_REAL_R } from './world.js';
import { HUM, SRC, HEAD, isNamed, isSohei, humanLook, preparationFrame, qualityKeeper, skinOpponent, humanPool, humanBuilding, SKIN_MAX, HSTAT, fits, attachBody, humanPoolKey, pinHumanGeometries, ALLB, restMatrix, XB, humanInv, memTight, borrowHuman, shapesReady, realNear, kusaPlates, SKIN_OUT, HUM_Q, HUM_T, SKIN_IN, v0, MIDDLE_MAX } from './humans_shared.js';
import { _sph, _fr, COARSE, skipHiddenMW, tipMW, noopChange, carryFlag, dropHuman, humanSelection, humanCaches, farSpHid, farSp, farSpNow, evictHidden, humanTurn, _pv } from './humans_lifecycle.js';
import { preStep, preparationUnits, DM_KEEP, shareHumanSkeleton, cacheHumanSkeleton, crowdGeometry, humanGeoMaps } from './humans_crowd_geometry.js';
import { UNIT_MAT, lookParts, GENERALS, DEATH_END } from './units.js';
import { headMats, headMaterial, faceStyle, finishFaceCopies, COMPILE, faceStyles, faceRenderer } from './humans_face_materials.js';
import { S, MEM_TIGHT, CPU_LEAN } from './settings.js';
import { TIER } from './device_tier.js';
import { nearArmorParts, naginata, layParts, splitKusazuri, CREST_OFF, crestOnly, NAMED_KEEP } from './humans_dress.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { DOMARU, wantsDomaru, KABUTO, dressDomaru, dressKabuto, crowdDomaru, monDecal, KB, dressMenpo, loading, loadHumans, dmLoading, loadDomaru, kbLoading, loadKabuto } from './humans_armor.js';
import { namedKacchu } from './named_kacchu.js';
import { coveredBodyGeo, bodyLod, BSPH, lodGeo } from './humans_lod.js';
import { humanMotionBones, bindHumanBounds, releaseHumanBounds } from './humans_bounds.js';
import { detachBones } from './humans_bones.js';
const BONE_TREE = (() => { try { return /[?&]bonetree=1/.test(location.search); } catch (e) { return false; } })();
import { restInverse, gripPose, humans, humanWanted, humanCandidates, humanNear, humanUnitRefs, humanUnitStates, humanCandidatePool, humanNearPool, resetCrowdSweep, sweepCrowdGeos, humanQualityValues, humanQuality } from './humans_combat.js';
import { nanbanMaterial } from './units_model.js';
import { scanMenpo, scanFace0 } from './humans_face.js';
import { nearCrowdMat, crowdMats, CROWD_DETAIL_NEAR, CROWD_DETAIL_MAX } from './humans_crowd.js';
import { driveHuman } from './humans_animate.js';
import { syncArmorWear } from './armor_wear.js';
import { ARMY, setHumanArmy, setHumanWorld } from './humans_context.js';
import { EFUDA, efudaWants, efudaKeyState, efudaBake, efudaSet, efudaUpdate, efudaDispose, efudaFrameStart, efudaKeyOf, efudaBakeLight } from './efuda.js';
import { horsesOn, detachReal, horseWanted, horseCandidates, updateHorses } from './humans_horses.js';
import { HR } from './humans_horse_model.js';
import { placeHorseExtras } from './humans_horse_animate.js';
import { combatThinking, thinkingPhase } from './army_budget.js';
import { VAT, vatSelect, vatOverflow } from './crowd_vat.js';
import { nearSurfaceMaterial, nearSurfaceBlood } from './humans_near_surface.js';
// 端末の熱の段（main.js の熱の見張りが書く。2＝かなり熱い）
const HOT = () => (window.__heatBackgroundLevel || 0) >= 2;

let faceWarmUnits = null;
// 手の材質：MakeHuman の肌の写真（明るい肌）を、顔と同じ日焼けの色へ。肌の中へ回る赤い光、戦が進むほどの汚れ、濡れ
// 籠手を着けた手は、手の甲に手甲（漆か鉄の板）を塗り、板の厚みだけ盛り上げる（kote：右 1・左 2）
function handMat(L, kote = 0) {
  const T = L.tier || 0, tkc = T >= 2 || T === 0 ? (L.armor || 0x1c1a1a) : 0x2e3236;
  const key = (L.skin || 0xb58c68) + '|' + kote + '|' + tkc;
  if (MHHAND.mats.has(key)) return MHHAND.mats.get(key);
  const tkOn = new THREE.Vector2(kote & 1 ? 1 : 0, kote & 2 ? 1 : 0), tkCol = new THREE.Color(tkc).multiplyScalar(0.85);
  const sk = new THREE.Color(L.skin || 0xb58c68).getHSL({});
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  const tint = new THREE.Color().setRGB((122 + tn.r * 108) / 255 * 0.8, (122 + tn.g * 112) / 255 * 0.74, (112 + tn.b * 104) / 255 * 0.68, THREE.SRGBColorSpace);
  // 両面：籠手を隠した時に手首の切り口から中が抜けて見えないよう
  const m = new THREE.MeshStandardMaterial({ map: MHHAND.tex, color: tint, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET; sh.uniforms.uTkOn = { value: tkOn }; sh.uniforms.uTkCol = { value: tkCol }; sh.uniforms.uTkH = { value: 0.0035 * (MHHAND.unit || 100) };
    sh.vertexShader = 'attribute vec2 tk;\nuniform vec2 uTkOn;\nuniform float uTkH;\nvarying float vTk;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTk = tk.x * (tk.y < 0.5 ? uTkOn.x : uTkOn.y);\n transformed += objectNormal * uTkH * smoothstep(0.3, 0.6, vTk);');
    sh.fragmentShader = 'uniform float uGrime, uWet;\nuniform vec3 uTkCol;\nvarying float vTk;\nfloat tkK;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.1)) * 1.08 * (1.0 - uGrime * 0.16 - uWet * 0.08);\n tkK = smoothstep(0.3, 0.6, vTk);\n diffuseColor.rgb = mix(diffuseColor.rgb, uTkCol * (0.85 + 0.3 * diffuseColor.g), tkK);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix((0.7 + (1.0 - diffuseColor.g) * 0.12) * (1.0 - 0.18 * uWet), 0.38 * (1.0 - 0.32 * uWet), tkK);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.10, 0.04, 0.025) * (1.0 - nv) * (1.0 - tkK);
          reflectedLight.directDiffuse *= mix(vec3(1.0, 0.94, 0.9) + vec3(0.12, 0.03, 0.0) * (1.0 - nv), vec3(1.0), tkK); }`);
  };
  m.customProgramCacheKey = () => 'mhhand';
  MHHAND.mats.set(key, m);
  return m;
}
// 本人の体に写実の手を付ける（体の手は描かない材質にする）
function attachHands(h, L) {
  if (!MHHAND || !h.body || !h.body.parent) { HUM.handErr = MHHAND ? "体が無い" : "手を読めていない"; return false; }
  const geo = handGeo(); if (!geo) return false;
  const bones = MHHAND.names.map((n) => h.bones[n]);
  if (bones.some((b) => !b)) return false;
  // 籠手の有る側（前腕の籠手の部品が有る側）の手の甲に手甲
  const m = new THREE.SkinnedMesh(geo, handMat(L, (h.parts.foreP ? 1 : 0) | (h.parts.foreN ? 2 : 0)));
  m.bind(new THREE.Skeleton(bones, MHHAND.inv), h.body.bindMatrix);
  m.position.copy(h.body.position); m.quaternion.copy(h.body.quaternion); m.scale.copy(h.body.scale);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  h.body.parent.add(m);
  h.hands = m;
  return true;
}
// 前もって作る：これから人にする兵の部品の形と束ねた形を、一段ずつ作っておく（形は姿ごとに共有の置き場へ入る。支度の札の間に prefetchHumanShapes から）。
//   一人を作るコマに、部品の形づくり（一人 5ms 前後・携帯ではその数倍）が重ならない。材質・骨・顔は作らない
function prefetchLook(units, cx, cz, reach) {
  if (!SRC) return;
  // 人の枠の少し外（reach）までで、まだ人でない一番近い者を選ぶ（近づけば次に人になる者）
  // 部品の形（一段目）を先に皆へ。束ねた形（二・三段目）はその後
  let u = null, best = Infinity;
  const r2 = reach * reach;
  for (const o of units) {
    if (o.human || o.isPlayer || !o.look || o.gone || !o.mesh || o.type === 'dummy') continue;
    const st = o._hpreLook === o.look ? o._hpre : 0;
    if (st >= 3) continue;
    const d2 = (o.pos.x - cx) ** 2 + (o.pos.z - cz) ** 2;
    if (d2 >= r2 || (!o.alive && d2 > HUM.dead * HUM.dead)) continue;
    // 人にする順（humansStep の pr）に合わせ、画面の中の者を先に
    _sph.center.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
    const sc = st * 1e6 + Math.sqrt(d2) + (_fr.intersectsSphere(_sph) ? 0 : 30);
    if (sc < best) { best = sc; u = o; }
  }
  if (u) { const t = performance.now(); preStep(u, Math.min(3, creationLeft)); creationLeft -= performance.now() - t; }
}
// 支度の札を見せている間に、兵の顔の絵（顔の型ごとに一枚。十二通りと僧）を前もって描く（指の端末用）。
//   戦の途中で近くへ来た兵の顔を初めて描くコマが重くならないよう（一枚 512 四方を CPU で描く。混んだ携帯で数十 ms）。近い兵の型から
async function prefetchFaces(rt, camera, ms = 1500, current = () => true) {
  if (!HUM.on || !HUM.ready || !SRC || !HEAD || !rt?.army) return 0;
  const t0 = performance.now(), cx = camera.position.x, cz = camera.position.z;
  let list = preparationUnits(rt, camera);
  if (COARSE) list = list.slice(0, 24);
  list = list.filter(u => !u.isPlayer);
  const d2 = (u) => (u.pos.x - cx) ** 2 + (u.pos.z - cz) ** 2;
  // 兵の型を先に（皆が使う）、次に名のある武将を近い順に全員（一枚 1024 四方で重い）
  list.sort((a, b) => (isNamed(a.look) - isNamed(b.look)) || (d2(a) - d2(b)));
  const seen = new Set();
  let n = 0;
  for (const u of list) {
    if (performance.now() - t0 >= ms || !current()) break;
    const L0 = u.look, nm = isNamed(L0);
    const sk = nm ? L0.face : 'c' + ((L0.face | 0) % 12) + '|' + (L0.skin || 0) + (isSohei(L0) ? '|m' : '');
    if (seen.has(sk)) continue;
    seen.add(sk);
    try {
      const P = lookParts(humanLook(L0)), L = P.look;
      if (nm) {
        if (headMats.has(L.face)) continue;
        headMaterial(L.face, L, faceStyle(L.face, P.F));
      } else {
        headMaterial('c' + ((L.face | 0) % 12) + '|' + (L.skin || 0) + (L.monk ? '|m' : ''), L, faceStyle('c' + ((L.face | 0) % 12), P.F));
      }
      n++;
    } catch (e) { /* 描けなくても、近くへ来た時に描く */ }
    await finishFaceCopies(() => current() && performance.now() - t0 < ms);
    await preparationFrame();
  }
  faceWarmUnits = null;
  return n;
}
function makeHuman(u, look0) {
  const task = buildHuman(u, look0);
  let step;
  do { step = task.next(); } while (!step.done);
  return step.value;
}
function* buildHuman(u, look0) {
  const pooled = MEM_TIGHT && !qualityKeeper(u);
  if (pooled) {
    if (humanPool.size + humanBuilding.size >= SKIN_MAX) return null;
    humanBuilding.add(u);
  }
  try {
  const look = humanLook(look0);
  const sohei = isSohei(look0);
  const _t0 = performance.now();
  let waited = 0, pause;
  const P = nearArmorParts(lookParts(look));
  const L = P.look;
  L.sohei = sohei;
  const _t1 = performance.now();
  pause = performance.now(); yield; waited += performance.now() - pause;
  const root = new THREE.Group();
  // 隠れている人（使い回しを待つ人）は、骨の行列を毎コマ計算しない（描く時に scene が全部を辿って重くなるので）
  root.updateMatrixWorld = skipHiddenMW;
  const model = skClone(SRC.scene);
  const _t2 = performance.now(), waitClone = waited;
  pause = performance.now(); yield; waited += performance.now() - pause;
  model.scale.set(SRC.kH, SRC.kH, -SRC.kH);
  root.add(model);
  const bones = {};
  let body = null;
  model.traverse((o) => {
    if (o.isBone || /^mixamorig/.test(o.name)) {
      bones[o.name.replace(/^mixamorig:?/, '')] = o;
      o.updateMatrix(); o.matrixAutoUpdate = false;
      // 指の骨（一人 30 本）は下に描く物が付かないので、描く側の走査（projectObject）から外す。行列は hidden_skip.js が骨だけは直す
      if (/Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(o.name)) o.visible = false;
    }
    if (o.isSkinnedMesh && /Mesh/.test(o.name)) body = o;
    if (o.isSkinnedMesh && /visor/i.test(o.name)) o.visible = false;
  });
  body.material = bodyMaterial(L);
  body.castShadow = true; body.receiveShadow = true;
  body.frustumCulled = true;
  const h = { u, root, model, bones, body, look: L, parts: {}, seed: (u.id || 1) * 0.6180339 % 1, mode: 'crowd' };
  root.userData.hum = h;
  // 体格は親の u.mesh の個体差を使う。近い形へ替わっても背丈・肩幅を二重に変えない。
  // 遠い人（lodFar）は指・つま先・頭の先の骨の行列を毎コマ辿らない（描くのは体ごとまとめた軽い形で、その骨を使わない。要る時は getWorldPosition が親から求め直す）
  for (const nm of ['LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase', 'Head']) if (bones[nm]) { bones[nm].updateMatrixWorld = tipMW; bones[nm].userData.h = h; }
  h.lookSrc = look0;   // 作った時の元の姿（本人の姿が差し替えられたら作り直すため）
  // 型（立ち姿の骨の行列を測るため）を一度だけ作る
  if (!SRC.template) {
    const tr = new THREE.Group(); const tm = skClone(SRC.scene); tm.scale.set(SRC.kH, SRC.kH, -SRC.kH); tr.add(tm);
    const tb = {}; tm.traverse((o) => { if (o.isBone) tb[o.name.replace(/^mixamorig:?/, '')] = o; });
    tr.updateMatrixWorld(true);
    SRC.template = { root: tr, bones: tb };
  }
  const TX = HSTAT.tx || (HSTAT.tx = {});
  const tm = (k, f) => { const a = performance.now(); f(); TX[k] = +((TX[k] || 0) + performance.now() - a).toFixed(1); };
  tm('fits', () => fits());
  initHumanPalette();
  pause = performance.now(); yield; waited += performance.now() - pause;
  h.domaru = DOMARU.ready && wantsDomaru(L);
  // 名のある武将：胴丸の人形の兜と顔は描かず、その人の兜・顔・陣羽織・母衣・腰の刀を付ける
  if (h.domaru) {
    // 本人も、胴丸を着る時は武将と同じく陣羽織・前立・腰の刀・自分の顔を付ける（胴丸の人形の兜に、本人の兜の前立を載せる）
    h.mode = 'full'; const nd = isNamed(L) || !!u.isPlayer || !!L.officer; h.helmScan = nd;
    // 本物の兜が読めていれば、胴丸の人形の兜は描かずに、兜のスキャンをかぶせる
    const kb = nd && KABUTO.on && KABUTO.ready;
    const ashigaru = (L.tier ?? 0) < 1 && !isNamed(L);
    tm('domaru', () => dressDomaru(h, ashigaru ? true : nd ? (kb ? true : 'helm') : false));
    if (ashigaru) tm('crowd', () => dressCrowd(h, P, L, DM_KEEP, look0));
    if (!ashigaru && kb) tm('kabuto', () => dressKabuto(h));
    if (nd && !ashigaru) tm('named', () => dressNamed(h, P, L));
  }
  else if (DOMARU.ready && crowdDomaru(L)) { h.domaru = true; tm('domaru', () => dressDomaru(h, true)); tm('crowd', () => dressCrowd(h, P, L, DM_KEEP, look0)); }
  else if (L.nanban || qualityKeeper(u)) {
    h.mode = 'full'; tm('parts', () => dressParts(h, P, L));
    // 本人の手は写実の手（MakeHuman）に替える（一人称で目の前に来る）
    if (!sohei && attachHands(h, L)) body.material = bodyMaterial(L, false, 4 | (h.parts.foreP ? 1 : 0) | (h.parts.foreN ? 2 : 0));
  }
  // 名将も兵と同じ一つの骨入り具足へ束ねる。鉢と立物を替えても描く回数を増やさない。
  else if (namedKacchu(L)) {
    tm('named', () => dressCrowd(h, P, L, null, look));
    // 手取川の長近らは陣羽織専用の紋を優先し、遠景の具足と同じ指定を使う。
    const mon = L.haoriMon || L.mon;
    // 大滝寺の一益は羽織に結合した紋を使い、胸の骨へ重ねない。
    const sewnMon = S.quality === 'high' && L.haoriMon === 'takigawa_haori';
    if (L.haori && mon && mon !== 'none' && !sewnMon) {
      const dm = monDecal(mon, L.haoriMonCol || 0xe6dfcf);
      if (dm) h.parts.mon = attachBody(h, 'Spine2', dm.geometry, SRC.fitT, dm.material);
    }
  }
  else tm('crowd', () => dressCrowd(h, P, L, null, look));
  // 組み立て時に一度だけ共有材質へ。距離の判定は描く時のカメラで行い、境で作り直さない。
  for (const part of Object.values(h.parts)) if (part?.isObject3D) part.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    if (o.geometry?.getAttribute('mtl')) o.material = nearSurfaceMaterial(o.material);
    else if (o === h.parts.domaru) o.material = nearSurfaceMaterial(o.material, 'domaru');
    else if (o === h.parts.kabuto) o.material = nearSurfaceMaterial(o.material, 'kabuto');
  });
  pause = performance.now(); yield; waited += performance.now() - pause;
  if (!h.domaru && !u.isPlayer) body.geometry = coveredBodyGeo(body.geometry, P, L);
  bodyLod(body, h);
  if (sohei && !L.kosode) naginata(u);
  // 作る時間の内訳（重さを調べるため）：部品の形・骨の写し・着せる
  const _t3 = performance.now();
  shareHumanSkeleton(h);
  HSTAT.tParts = (HSTAT.tParts || 0) + (_t1 - _t0); HSTAT.tClone = (HSTAT.tClone || 0) + (_t2 - _t1 - waitClone); HSTAT.tDress = (HSTAT.tDress || 0) + (_t3 - _t2 - (waited - waitClone));
  // 動き
  const mixer = new THREE.AnimationMixer(model);
  const act = {};
  for (const k of ['idle', 'walk', 'run']) { act[k] = mixer.clipAction(SRC.anims[k]); act[k].play(); act[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  // 歩きと走りは同じ足の拍子から始め、人ごとの開始位置を一周に散らす。
  h.gaitPhase = h.seed;
  act.idle.time = h.seed * act.idle.getClip().duration;
  act.walk.time = h.gaitPhase * act.walk.getClip().duration;
  act.run.time = h.gaitPhase * act.run.getClip().duration;
  h.animB = Object.values(bones).filter((b) => b.isBone && !(h.xb && Object.values(h.xb).includes(b)));
  // 録った動きが書く骨だけを覚える。指と、直に行列を書く追加の骨は含めない。
  h.motionB = humanMotionBones(model, act);
  h.pose = h.animB.map(() => new THREE.Quaternion());
  // 骨の回りは四元数だけで扱う。three は四元数が変わるたびに Euler（rotation）も求め直すが、骨の rotation は誰も読まない（毎コマ骨の数だけ setFromRotationMatrix が走っていた。10/20）
  for (const b of h.animB) b.quaternion._onChangeCallback = noopChange;
  h.poseReady = false;
  h.gset = new Float64Array(4); h.gset[0] = NaN;
  h.fpOffCache = {};
  // 待つ間の息づかいの速さは人ごとに少し違う
  act.idle.timeScale = 0.8 + h.seed * 0.4;
  h.mixer = mixer; h.act = act; h.w = { idle: 1, walk: 0, run: 0 };
  h.last = new THREE.Vector3().copy(u.pos || new THREE.Vector3()); h.spd = 0;
  h.acc = 0;
  h.wearFit = restInverse('Spine1').clone().multiply(SRC.fitT);
  root.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), (u.mounted ? 2.2 : 1.3) + 0.3);
  // 骨を場面の木から外す（描く側と行列の更新が骨を辿らない。humans_bones.js）。?bonetree=1 で元の木のまま（比べ用）
  if (!BONE_TREE && !window.__apx?.bonetree) detachBones(h, bindHumanBounds);
  bindHumanBounds(h);
  cacheHumanSkeleton(h);
  h.skelDirty = true;
  if (pooled) {
    h.poolKey = humanPoolKey(u); h.leased = true;
    h.poolDefaults = {};
    for (const k in h) if (typeof h[k] === 'number' || typeof h[k] === 'boolean') h.poolDefaults[k] = h[k];
    pinHumanGeometries(h);
    humanPool.add(h);
  }
  return h;
  } finally { if (pooled) humanBuilding.delete(u); }
}

// 本人：units.js と同じ甲冑の部品を骨ごとに付ける
function dressParts(h, P, L) {
  const named = L.hero || isNamed(L);
  layParts(P, L, (k, nm, geo, fit) => {
    // 顔：本人と名のある武将は実写の顔
    if (k === 'face' && (named || L.officer) && HEAD) { h.parts.face = scanFace(h, L.hero ? 'player' : L.face, L, P.F, named); return; }
    // 本人の腕の籠手：一人称で目の前に来ると鎖の目が大きな丸に見えるので、一人称の時だけ細かく編む
    // 前腕と手甲は本人用の細かい形（units_model.js heroKote）で鎖の目を細かく貼ってあるので、二の腕だけ
    h.parts[k] = attachBody(h, nm, geo, fit, L.nanban ? nanbanMaterial() : L.hero && /^upper[PN]$/.test(k) ? fpArmMat() : UNIT_MAT);
  });
  // 草摺を板ごとの形に分け、腰の部品の子にする（板ごとに揺らす）
  if (h.parts.hips && !L.sohei) { const a = performance.now(); splitKusazuri(h, L); const TX = HSTAT.tx || (HSTAT.tx = {}); TX.kz = +((TX.kz || 0) + performance.now() - a).toFixed(1); }
}
function dressNamed(h, P, L) {
  layParts(P, L, (k, nm, geo, fit) => {
    if (k === 'face') { if (HEAD) { h.parts.face = scanFace(h, L.hero ? 'player' : L.face, L, P.F, true); if (h.parts.face && L.menpoScan) { const a = performance.now(); if (KB?.menpo) dressMenpo(h); else scanMenpo(h.parts.face, L.face, L.menpoScan); const TX = HSTAT.tx || (HSTAT.tx = {}); TX.menpo = +((TX.menpo || 0) + performance.now() - a).toFixed(1); } } return; }
    // 兜は少し深くかぶる（眉庇が眉の上に来るように）
    // 兜はスキャンの胴丸の兜（本人と同じ作り）を使い、この人の形の兜からは前立・脇立・後立・毛だけを取って載せる
    // 本物の兜の人は、前立も兜の側で付ける（dressKabuto）ので、この形からは何も取らない
    if (k === 'hat' && h.parts.kabuto) return;
    if (k === 'hat') { const o = CREST_OFF; geo = crestOnly(geo); fit = fit.clone().multiply(new THREE.Matrix4().makeTranslation(0, o.y, o.z)); }
    if (NAMED_KEEP.has(k)) h.parts[k] = attachBody(h, nm, geo, fit);
  });
  h.F = P.F;
  // 陣羽織の背の家紋（絵の一枚にない家の紋も描けるよう、武将ごとに小さな絵を作る）
  const hp = h.parts.haori;
  const gd = GENERALS[String(L.face || '').slice(2)] || {};
  const mon = L.haoriMon || gd.mon || L.mon;
  if (hp && mon && mon !== 'none') {
    const a0 = performance.now();
    const dm = monDecal(mon, L.haoriMonCol || 0xe6dfcf);
    const TX = HSTAT.tx || (HSTAT.tx = {}); TX.mon = +((TX.mon || 0) + performance.now() - a0).toFixed(1);
    if (dm) { dm.castShadow = false; hp.add(dm); h.parts.mon = dm; }
  }
}
let crowdInv = null;
function initHumanPalette() {
  if (crowdInv) return;
  crowdInv = ALLB.map((nm) => restMatrix(XB[nm] || nm).clone().invert());
  humanInv.push(...crowdInv);
}
function dressCrowd(h, P, L, only = null, look = L) {
  const geo = crowdGeometry(P, L, only);
  // 遠く（と影）は units.js の軽い形をまとめた物
  const Plo = lookParts(look, false);
  const geoLo = crowdGeometry(Plo, L, only);
  // 遠く（HUM.lod より先）は、体（骨の入った人形・胴丸）を隠し、units.js の軽い体と顔まで一つの形にまとめる（骨組み一つ・描く回数一回・三角は一割ほど）
  h.geoFar = crowdGeometry(Plo, Plo.look, null, true, true);
  // この人が使う束の形（掃除 sweepCrowdGeos が、誰かが使っている間は表から外さないように。外すと同じ姿の次の人が形を作り直し、
  //   古い形はこの人が持ったまま残って二重になっていた：森部 70 秒で束の形 199（表）に対し生きている物 530・+90MB。10/20）
  h.cg = [geo, geoLo, h.geoFar];
  // 揺れる部品・顔の骨を足す（立ち姿では親の骨と同じ所）
  h.xb = {};
  const plateCount = kusaPlates(L).np;
  for (const [nm, par] of Object.entries(XB)) {
    if (nm.startsWith('swK') && Number(nm.slice(3)) >= plateCount) continue;
    const b = new THREE.Bone(); b.name = nm; b.matrixAutoUpdate = false;
    h.bones[par].add(b); h.xb[nm] = b; h.bones[nm] = b;
  }
  // 陣笠・鉢巻の傾き：人ごとに少し（深くかぶる・浅くかぶる、左右にも僅かに）。同じ顔が並んで見えないよう（兜は傾けない：固く締めるので）
  if (h.xb.swHat && /^(jingasa|jingasa_n|hachimaki)$/.test(L.hat || '')) {
    const sd = h.seed || 0;
    h.xb.swHat.matrix.makeRotationFromEuler(new THREE.Euler(((sd * 7.9) % 1 - 0.5) * 0.14, 0, ((sd * 17.3) % 1 - 0.5) * 0.26));
    // 同じ共有形でも笠の仕立てを変える。頭や顔の大きさ、材質の数は増やさない。
    if (L.hat !== 'hachimaki') {
      const brim = 0.94 + ((sd * 11.7) % 1) * 0.12;
      h.xb.swHat.matrix.scale(new THREE.Vector3(brim, 0.88 + ((sd * 5.3) % 1) * 0.24, brim));
    }
  }
  if (!crowdInv) crowdInv = ALLB.map((nm) => restMatrix(XB[nm] || nm).clone().invert());
  const sk = new THREE.Skeleton(ALLB.slice(0, crowdInv.length).map((nm) => h.bones[nm] || h.bones[XB[nm]]), crowdInv);
  const m = new THREE.SkinnedMesh(geo, true || namedKacchu(L) ? UNIT_MAT : nearCrowdMat(Math.floor(((h.seed || 0) * 11.3) % 1 * 4)));
  m.bind(sk, new THREE.Matrix4());
  // 影を受ける：笠が顔に、腕が胴に、胴が脚に落とす影で、体の厚みが出る（受けないと、日なたで平らに光る人形になる）
  m.castShadow = true; m.receiveShadow = true;
  m.boundingSphere = BSPH;
  h.root.add(m);
  h.parts.armor = m;
  h.F = P.F;
  if (L.menpoScan && KB?.menpo) dressMenpo(h);
  // 今の顔（遠くの顔）：僧兵以外は具足と同じ描き物に束ねる（描く回数を一人一回減らす）。近い形・遠い形・実写の顔の有る無しで四通りの形を持ち、描く直前に選ぶ
  //   僧兵は顔の形と材質を比叡山の場面が差し替えるので、これまで通り別の描き物
  //   iPhone も別の描き物に：顔は人ごとに違うので、束ねると一人ずつ体ごとの形（0.5〜1MB）を新しく作り、乱戦の作り直しで記憶を押していた（10/21）
  if (L.sohei || !P.face || memTight()) {
    lodGeo(m, geo, geoLo, h);
    h.parts.pface = attachBody(h, 'Head', P.face, SRC.fitH);
    if (h.parts.pface) { h.parts.pface.frustumCulled = true; h.parts.pface.castShadow = false; lodGeo(h.parts.pface, P.face, Plo.face); }
    return;
  }
  // 顔を束ねた形（geoF・geoLoF）は要る時に作る：実写の顔（scanOn）に替わった人には要らず、姿の種類ごとに二つ分の形と GPU の記憶を節約する
  let geoF = null, geoLoF = null;
  const faceGeo = () => geoF || (h.cg.push(geoF = crowdGeometry(P, L, only, true)), geoF);
  const faceLoGeo = () => geoLoF || (h.cg.push(geoLoF = crowdGeometry(Plo, L, only, true)), geoLoF);
  m.onBeforeRender = (r, s, cam) => {
    let want;
    if (h.lodFar) want = h.geoFar;
    else if (cam.isOrthographicCamera) want = geoLo;   // 影には顔を描かない（これまでと同じ）
    else {
      const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
      const near = false && !h.u.isPlayer ? 9 : HUM.lod;
      want = d2 < near * near ? (h.scanOn ? geo : faceGeo()) : (h.scanOn ? geoLo : faceLoGeo());
    }
    if (want.userData) want.userData.use = frameT0;
    if (m.geometry !== want) m.geometry = want;
  };
}
// 近くの兵の顔を実写の顔に替える・戻す
function crowdFace(h, on) {
  if (!h.xb || !!h.scanOn === on) return;
  if (on && !h.parts.face) {
    if (!HEAD || madeFaces >= 1) return;   // 顔の絵は一コマに一つまで作る
    // 僧兵は剃った頭（裹頭の窓からは目元だけが見える）
    const named = isNamed(h.look);
    const key = named ? h.look.face : 'c' + ((h.look.face | 0) % 12) + '|' + (h.look.skin || 0) + (h.look.monk ? '|m' : '');
    // 新しい顔の絵を描くのは、人を作らなかったコマだけ（作る重さと描く重さを一コマに重ねない。次のコマで描く）
    if (!headMats.has(key) && madeThisFrame > 0) return;
    h.parts.face = scanFace(h, named ? h.look.face : key, h.look, h.F, named);
    if (!h.parts.face) return;
    if (h.look.menpoScan && KB?.menpo) dressMenpo(h);
  }
  h.scanOn = on;
  h.skelDirty = true;
  if (h.parts.face) h.parts.face.visible = on;
  if (h.parts.menpo) h.parts.menpo.visible = !h.lodFar;
  if (h.parts.pface) h.parts.pface.visible = !on && !h.lodFar;
}
// 遠い人の軽い形へ替える・戻す（体・胴丸・顔を隠し、甲冑の形を体ごとまとめた物に）
function setFar(h, far) {
  if (!h.geoFar || !h.parts.armor || !!h.lodFar === far) return;
  if (far) crowdFace(h, false);
  // 全身の形への交換と中の体の表示は同時に行う。
  // 描く直前まで交換を待つと、視野判定や影には胴を除いた古い形が渡る。
  const armor = h.parts.armor;
  if (far) {
    h.nearArmorGeometry = armor.geometry;
    // 中の体を隠す前に、共通の骨番号へ直した全身を渡す。
    armor.geometry = armor.userData?.humanBoneMap?.(h.geoFar) || h.geoFar;
  } else if (h.nearArmorGeometry) armor.geometry = h.nearArmorGeometry;
  h.lodFar = far;
  h.skelDirty = true;
  carryFlag(h, true);
  // 近くへ戻る時は、遠い間に辿らなかった指と手の骨の行列を次の一コマで必ず辿り直す（止まった人は skipHiddenMW が全部を飛ばし、手の皮だけ古い所へ帯のように伸びた）
  if (!far) h.mw0 = null;
  // 小袖・僧衣の束には中の体の手足が含まれない。遠目でもつながる下着を残す。
  if (!h.domaru) h.body.visible = !far || !!h.look.sohei || !!h.look.kosode;
  if (h.parts.domaru) h.parts.domaru.visible = !far;
  if (h.parts.menpo) h.parts.menpo.visible = !far;
  if (h.parts.pface) h.parts.pface.visible = !far && !h.scanOn;
}
// 絵札（efuda.js）に焼く時の姿：0 立ち・1 歩き（phase 0〜1）・2 駆け。細かい形に戻し、速さを強いて一度だけ骨を動かす
function efudaPose(h, mode, phase) {
  const u = h.u, sp = mode === 0 ? 0 : mode === 1 ? 1.3 : 4.5;
  setFar(h, false);
  h.spd = sp; h.gaitPhase = phase; h.last.copy(u.pos); h.closeGait = 0; h.gaitSide = 0; h.far = false; h.near = true;
  u.forceSpd = sp;
  // 構えは解いて焼く（立ち・歩きは槍を立て、駆けは構えて水平に）。敵との間合いの状態は一時に外して戻す
  const sv = { target: u.target, atk: u.atk, poseTarget: u.poseTarget, contactBrace: u.contactBrace, guard: u.guard, guarding: u.guarding, swing: u.swing, charging: u.charging };
  u.target = null; u.atk = null; u.poseTarget = null; u.contactBrace = 0; u.guard = 0; u.guarding = 0; u.swing = null; u.charging = mode === 2 ? sv.charging : null;
  h.upK = mode === 2 ? 0 : 1;
  try { gripPose(h, 1 / 240); driveHuman(h, 1 / 240, true, true); }
  finally { Object.assign(u, sv); }
}
let madeFaces = 0;
let liveFrame = false;
let preTick = 0;
// 実写の顔を頭の骨に付ける（full：本人と武将。兵は軽い目）
function scanFace(h, key, L, F, full) {
  // 携帯の支度では近い二十四人だけ。戦中も新しい顔の絵は一コマ一枚。
  if ((faceWarmUnits && !faceWarmUnits.has(h.u)) || (!headMats.has(key) && madeFaces >= 1)) {
    if (full && !h.facePending) h.facePending = { key, L, F, full };
    return null;
  }
  const fresh = !headMats.has(key);
  if (fresh) madeFaces++;
  h.facePending = null;
  const a0 = performance.now();
  const r = scanFace0(h, key, L, F, full);
  // 戦の中で新しく描いた顔（支度で作り漏れた物）を数える（iphone-perf の「人作り」live）
  if (fresh && liveFrame) { HSTAT.liveFace = (HSTAT.liveFace || 0) + 1; HSTAT.liveFaceMs = (HSTAT.liveFaceMs || 0) + performance.now() - a0; }
  if (r) h.skelDirty = true;
  const TX = HSTAT.tx || (HSTAT.tx = {}); TX.scan = +((TX.scan || 0) + performance.now() - a0).toFixed(1);
  return r;
}
let humanQualityBase = null;
let humanQualityOverride = null;
let madeThisFrame = 0;
let frameT0 = 0;
let frameNo = 0;
// 一コマに作る数は時間で決める（一人は必ず。重い時は次のコマへ回す）
// makeCool：重い人を作った後は、その重さの分だけ次を作るのを休む（戦の始めに重いコマが続いて固まらないよう、重さを散らす）
let makeCool = 0;
let creationLeft = 3;
// 近くへ大勢が来た時（must の者が軽い形のまま待っている時）は、一コマに作る数と時間を増やして早く追いつく
let rush = 0;
// ただし一人を作るのに混んだ機械では 200ms を越える事がある。一コマに作るのは多くても二人・時間の枠の内だけ（一コマが何百 ms にならないよう）。
// 急ぐ時は、作った後の休み（makeCool）を短くして、コマの数で追いつく
// rushNear：画面の中・30m の内に、まだ軽い形の兵がいる時は休みを待たずに毎コマ一人ずつ作る（目の前に軽い形を残さない）
let rushNear = 0;
const canMake = () => (makeCool <= 0 || rushNear > 0 || (rush > 0 && makeCool <= 2)) && madeThisFrame < 1;
function useHuman(u, force = false) {
  // 本物の胴丸を着るはずの人を、胴丸を読む前に作っていたら作り直す
  // 本人は、姿（look）が差し替えられた時（信長で遊ぶ時など）も作り直す。本人と名のある者は、作る数の枠に関わらず作り直す
  const keyMan = qualityKeeper(u);
  if (MEM_TIGHT && !keyMan && !u.human) borrowHuman(u);
  if ((!MEM_TIGHT || keyMan) && u.human && u.isPlayer && u.look && u.human.look !== u.look && u.human.lookSrc !== u.look && (force || keyMan)) { dropHuman(u); u.human.root.parent?.remove(u.human.root); releaseHumanBounds(u.human); u.human = null; }
  if ((!MEM_TIGHT || keyMan) && u.human && !u.human.domaru && DOMARU.ready && (wantsDomaru(u.human.look) || crowdDomaru(u.human.look)) && (force || keyMan || canMake())) {
    dropHuman(u);
    u.human.root.parent?.remove(u.human.root);
    releaseHumanBounds(u.human);
    u.human = null;
  }
  if (!u.human) {
    if (MEM_TIGHT && !keyMan && !u._humanBuild && humanPool.size + humanBuilding.size >= SKIN_MAX) return false;
    if (!force && (!canMake() || creationLeft <= 0)) return false;
    // 形がまだの兵は、このコマでは形を一段だけ作り、人にするのは次のコマ以後（一人の重さを数コマに分ける）。
    //   形が既にある姿なら段はすぐ済むので、同じコマで人にする。本人は待たせない
    if (!force && !u.isPlayer && !shapesReady(u)) {
      const p0 = performance.now();
      preStep(u, Math.max(0, creationLeft));
      creationLeft -= performance.now() - p0;
      if (!shapesReady(u) || creationLeft <= 0) { madeThisFrame++; HSTAT.splitN = (HSTAT.splitN || 0) + 1; return false; }
    }
    madeThisFrame++;
    const t0 = performance.now();
    if (force) { u._humanBuild?.return(); u._humanBuild = null; u._humanBuildLook = null; u.human = makeHuman(u, u.look || {}); }
    else {
      if (!u._humanBuild || u._humanBuildLook !== u.look) {
        u._humanBuild?.return();
        u._humanBuild = buildHuman(u, u.look || {}); u._humanBuildLook = u.look; u._humanBuildMs = 0;
      }
      let step;
      do { step = u._humanBuild.next(); } while (!step.done && performance.now() - t0 < creationLeft);
      const spent = performance.now() - t0;
      creationLeft -= spent; u._humanBuildMs += spent;
      if (!step.done) { HSTAT.splitN = (HSTAT.splitN || 0) + 1; return false; }
      u.human = step.value; u._humanBuild = null; u._humanBuildLook = null;
    }
    const took = force ? performance.now() - t0 : u._humanBuildMs;
    u._humanBuildMs = 0;
    HSTAT.makeMs += took; HSTAT.makeN++; HSTAT.makeMax = Math.max(HSTAT.makeMax, took); if (liveFrame) { HSTAT.liveMake = (HSTAT.liveMake || 0) + 1; HSTAT.liveMakeMs = (HSTAT.liveMakeMs || 0) + took; HSTAT.liveMakeMax = Math.max(HSTAT.liveMakeMax || 0, took); }
    if (!force) makeCool = Math.min(20, Math.floor(took / (rush > 0 ? 30 : 12)));
    if (!u.human) return false;
    u.mesh.add(u.human.root);
    if (!force && !u.isPlayer && COMPILE) { try { if (COMPILE(u.human.root)) u.human.showAt = frameNo + 3; } catch (e) { /* 作り始められなくても、描く時に作る */ } }
  }
  const h = u.human;
  // 絵の仕組みの出来上がりを待つ間は、軽い形のまま
  if (h.showAt > frameNo && !force) { if (!humans.has(h)) h.root.visible = false; return false; }
  // 馬上の人は鞍の入れ物（u.seat）に入れる
  const par = u.mounted && u.seat ? u.seat : u.mesh;
  if (h.root.parent !== par) par.add(h.root);
  if (!h.root.visible || !humans.has(h)) {
    h.root.visible = true; h.poseHidden = false; h.skelDirty = true;
    // 戻した亡骸も最後の倒れ姿を一度作ってから止める。
    h.still = false; h.drove = false;
    humans.add(h); h.last.copy(u.pos); h.acc = 1;
    // 焼いた動きから替わる時は、同じ歩みの割合と速さから始める（足が跳ねない）
    if (u.vatOn && u.vat) { h.gaitPhase = u.vat.phase; h.spd = u.vat.sp; }
    h.root.updateWorldMatrix(true, false);
    h.root.updateMatrixWorld(true);
  }
  if (u.body) u.body.visible = false;
  if (u.legL) { u.legL.visible = false; u.legR.visible = false; }
  carryFlag(h, true);
  syncArmorWear(u, ARMY?.hideBlood);
  return true;
}
function disposeBattleHumans(rt, resources) {
  efudaDispose(rt.army.units);
  for (const h of humanPool) resources.add(h.root);
  for (const u of rt.army.units) {
    const h = u.human;
    if (h) {
      resources.add(h.root);
      dropHuman(u);
      h.mixer?.stopAllAction();
      h.mixer?.uncacheRoot(h.model);
      h.root.parent?.remove(h.root);
      releaseHumanBounds(h);
      u.human = null;
    }
    u._humanBuild?.return(); u._humanBuild = null; u._humanBuildLook = null; u._hq = null;
  }
  for (const h of humanPool) {
    h.mixer?.stopAllAction(); h.mixer?.uncacheRoot(h.model);
    h.root.parent?.remove(h.root);
  }
  humanPool.clear(); humanBuilding.clear();
  if (lastArmy === rt.army || ARMY === rt.army || !lastArmy) {
    for (const h of horsesOn) detachReal(h);
    horsesOn.clear(); humanWanted.clear(); horseWanted.clear();
    humanCandidates.length = humanNear.length = horseCandidates.length = 0;
    // 次の戦の組み立て前に、選び直し用の控えからも前の軍勢を外す。
    humanSelection.army = null; humanSelection.quality = null; humanSelection.count = -1;
    humanUnitRefs.length = humanUnitStates.length = 0;
    for (const c of humanCandidatePool) c.u = null;
    for (const c of humanNearPool) c.h = null;
    lastArmy = null; setHumanArmy(null); setHumanWorld(null); faceWarmUnits = null;
  }
  // 名前のある顔も含めて持ち越さない（保持する顔は零枚、上限十二枚以内）。
  // 形のキャッシュも参照を切り、前の戦の頂点配列を回収できるようにする。
  for (const cache of humanCaches()) {
    resources.add(cache); cache.clear();
  }
  resetCrowdSweep();
  resources.add(crowdMats); crowdMats.length = 0;
  humanGeoMaps.clear(); faceStyles.clear();
  if (HR) {
    resources.add([HR.mats, HR.tack]); HR.mats.clear(); HR.tack.clear();
    for (const horse of HR.pool) {
      resources.add([horse.holder, horse.extra]);
      horse.mixer?.stopAllAction(); horse.mixer?.uncacheRoot(horse.sc);
    }
    HR.pool.length = 0;
  }
  if (farSpScene === rt.scene) {
    for (const w of farSpHid) w.layers.enable(0);
    for (const e of farSp.values()) { e.im.parent?.remove(e.im); e.im.dispose(); }
    farSp.clear(); farSpHid.clear(); farSpNow.clear(); farSpScene = null;
  }
}
// 毎コマ：本人・カメラの近くの兵・名のある武将を骨の入った人で描く（battle.js から）
let lastArmy = null;
let farSpScene = null;function farSpears(rt) {
  const scene = rt.scene || (rt.world && rt.world.scene);
  if (!scene) return;
  if (farSpScene !== scene) { for (const e of farSp.values()) { if (e.im.parent) e.im.parent.remove(e.im); e.im.dispose(); } farSp.clear(); farSpHid.clear(); farSpScene = scene; }
  for (const e of farSp.values()) e.n = 0;
  farSpNow.clear();
  const nearRadius = rt.def.nearSpearBatchRadius || 0, camera = rt.camera?.position;
  // どちらの指定でも、場面の行列が揃った後に兵の束で体と一緒に描く。
  // 近い味方を隠す処理にも従い、描く時の骨と逆行列を揃える。
  // 更新中の別の束へも写すと、手元を離れた槍が二重に残る。
  const drawWithArmy = !!(rt.world?.def.attachedFarSpears || rt.world?.def.drawTimeUnitParts);
  for (const h of humans) {
    if (drawWithArmy) break;
    const u = h.u, w = u && u.wpn;
    if (!h.lodFar || !w || !w.isMesh || w.userData.kind !== 'spear' || u.isPlayer || !w.visible || !w.parent || !h.root.visible || w.userData.flex?.on || w.userData.bow || w.userData.ram || !w.material || w.material.transparent) continue;
    // 指定した戦だけ、近い槍は元の網で描く。描く直前に持ち主や槍を避けた時も、
    // 別の束に写した柄だけが残らない。遠い列のまとめ描きと共有する形・材質は保つ。
    if (nearRadius && camera && (u.pos.x - camera.x) ** 2 + (u.pos.z - camera.z) ** 2 < nearRadius * nearRadius) continue;
    const key = w.geometry.uuid + '|' + w.material.uuid;
    let e = farSp.get(key);
    if (!e) {
      const im = new THREE.InstancedMesh(w.geometry, w.material, 96);
      im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0;
      scene.add(im);
      e = { im, n: 0 }; farSp.set(key, e);
    }
    if (e.n >= e.im.instanceMatrix.count) continue;
    w.updateWorldMatrix(true, false);
    e.im.setMatrixAt(e.n++, w.matrixWorld);
    farSpNow.add(w);
    if (!farSpHid.has(w)) { farSpHid.add(w); w.layers.disable(0); }
  }
  for (const w of farSpHid) if (!farSpNow.has(w)) { w.layers.enable(0); farSpHid.delete(w); }
  for (const e of farSp.values()) { e.im.count = e.n; e.im.instanceMatrix.needsUpdate = true; e.im.visible = e.n > 0; }
}
function updateHumans(rt, dt) {
  liveFrame = dt > 0;
  madeThisFrame = 0; madeFaces = 0; frameT0 = performance.now(); frameNo++; if (makeCool > 0) makeCool--;
  sweepCrowdGeos(frameT0);
  // 支度の後も必要な人は、一コマ一人ずつ作る。開戦直後も作成量を増やさない。
  HUM.budget = 4;
  setHumanWorld(rt.world); setHumanArmy(rt.army);
  // 中景（8m〜）の兵は焼いた動きで描く。骨の人を作る候補から外す（crowd_vat.js）
  vatSelect(rt, dt);
  const player = rt.player && rt.player.u;
  if (player) { ARMY_REAL_P.value.set(player.pos.x, player.pos.z); ARMY_REAL_R.value = realNear(); }
  // 前の描画で作成待ちになった兵は、出来るまで既存の軽い姿へ戻す。
  for (const u of rt.army.units) if (u.humanPending && u.mesh) { u.mesh.visible = !u.gone && !u.camHidden && !u.imp; u.humanPending = false; }
  // 軽い兵を押し出す輪の中心（カメラの場所）
  if (rt.camera) ARMY_P.value.set(rt.camera.position.x, rt.camera.position.z);
  // 布をはためかせる風（突風の強さで、止んだ時も少しは揺れる）
  GRIME.value = Math.min(1, Math.max(0, (rt.t || 0) / 360));
  nearSurfaceBlood(rt.army.hideBlood);
  CLOTH_W.value.set(WIND_STATE.dirX, WIND_STATE.dirZ, Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1)), WIND_STATE.t || 0);
  const army = rt.army, cam = rt.camera;
  // 戦が替わったら、前の戦の人と馬を忘れる
  if (army !== lastArmy) {
    faceWarmUnits = COARSE && cam ? new Set(preparationUnits(rt, cam).slice(0, 24)) : null;
    for (const h of humans) dropHuman(h.u);
    for (const h of horsesOn) detachReal(h);
    horsesOn.clear(); humanWanted.clear(); humanCandidates.length = humanNear.length = 0;
    horseWanted.clear(); horseCandidates.length = 0; lastArmy = army; makeCool = 0;
    humanSelection.army = null; humanUnitRefs.length = humanUnitStates.length = 0;
    for (const c of humanCandidatePool) c.u = null;
    for (const c of humanNearPool) c.h = null;
  }
  if (dt > 0) {
    faceWarmUnits = null;
    rt.humanPreparationCap = Infinity;
  }
  creationLeft = 3;
  if (Number.isFinite(rt.humanPreparationCap)) {
    let prepared = 0;
    for (const u of army.units) if (u.human) prepared++;
    if (prepared >= rt.humanPreparationCap) creationLeft = 0;
  }
  const horses = updateHorses(rt);
  try {
    efudaFrameStart(); humansStep(rt, dt, army, cam); farSpears(rt);
    efudaUpdate(rt.scene, rt.world, army.units, army.time);
    // 戦の途中も、人を作らず新しい顔も描かないコマに、もうすぐ人になる兵（援軍・寄せ手）の形を一段ずつ前もって作る
    //   一人を作るコマに部品の形づくりと束ね（4倍遅くで 10〜20ms）が重ならない。一コマに一段だけ。近い者が済めば何もしない
    if (creationLeft > 0 && madeThisFrame === 0 && madeFaces === 0 && cam && HUM.primed && (preTick = (preTick + 1) & 1) === 0)
      prefetchLook(army.units, cam.position.x, cam.position.z, memTight() ? SKIN_OUT + 10 : HUM_Q.high.near + 14);   // iPhone は絵札の境の少し外まで（その先の兵は人にしない）
  } finally {
    if (player) for (const u of army.units) {
      if (u.gone || !u.mesh || u.type === 'dummy' || (u.human && u.human.root.visible)) continue;
      if (Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z) <= realNear() ||
          (cam && Math.hypot(u.pos.x - cam.position.x, u.pos.z - cam.position.z) <= realNear())) {
        // 骨のある姿がまだ用意できない時は、既存の軽い姿を残す。
        // 近いという理由だけで消すと、姿のない兵が槍を打ち込む。
        u.mesh.visible = !u.camHidden && !u.imp; u.humanPending = false;
      }
    }
    // 鐙・手綱は乗り手の骨が動いた後で置く
    //   画面の外（乗り手の囲み 6m の球が視野に掛からない）の馬の手綱・鐙は置き直さない。画面に入ったコマで置く（10/27）
    for (const [h, u] of horses) if (h.userData.horse.real && h.userData.horse.real.on && !(u && u.offscreen && !u.isPlayer && !window.__apx?.notack0)) placeHorseExtras(h, u);
  }
  if (player && ++evictTick % 60 === 0) evictHidden(army, player);
  HSTAT.ms = performance.now() - frameT0;
}
// 隠れた本物の人（骨入り）は兵ごとに持ち続けるので、戦が進むほど増える（桶狭間で2分に92→108、見えるのは18）。
// 携帯は中身が重さで落ちるので、見えない人を遠い順に捨てる（骨の絵も返す）。近づけば作り直す（10/19）
let evictTick = 0;
function humansStep(rt, dt, army, cam) {
  const on = HUM.on && HUM.ready && HUM.primed;
  if (!on) { humanSelection.army = null; humanUnitRefs.length = humanUnitStates.length = 0; for (const h of humans) dropHuman(h.u); if (HUM.on && !loading) loadHumans(); return; }
  // 画質と戦ごとの人数制限は遠景用。近景の骨・甲冑・顔は保ち、影と動きの更新を間引く。
  const QBase = HUM_Q.high;
  // 画質ごとの細かさ（lod：軽い一体の形へ替わる遠さ・hiN：細かい胴丸と兜の数・faceN：実写の顔の数）。低は元のまま
  { const t = HUM_T.high; HUM.lod = t.lod; HUM.hiN = t.hiN; HUM.faceN = t.faceN; HUM.shadow = t.shadow; DOMARU.hiCap = t.hiCap; }
  //   humQ は下げるだけ（画質「低」の max 4 を姉川の 56 で上書きして、携帯で 60 人近くが骨の入った人になっていた。10/2 測って直す）
  let Q = QBase;
  if (rt.def && rt.def.humQ) {
    const override = rt.def.humQ;
    let changed = humanQualityBase !== QBase || humanQualityOverride !== override;
    for (const k in QBase) if (humanQualityValues[k] !== override[k]) changed = true;
    if (changed) {
      for (const k in humanQuality) delete humanQuality[k];
      Object.assign(humanQuality, QBase);
      for (const k in QBase) { humanQualityValues[k] = override[k]; if (k in override) humanQuality[k] = Math.min(QBase[k], override[k]); }
      humanQualityBase = QBase; humanQualityOverride = override;
    }
    Q = humanQuality;
  }
  const cx = cam.position.x, cz = cam.position.z;
  const detailNear = TIER.weak ? 8 : MEM_TIGHT ? SKIN_OUT : false ? 14 : true ? rt.world.def.highHumanDetail ?? 15 : rt.world.def.lowHumanDetail ?? Infinity;
  // 高の戦別指定は、甲冑を一体にまとめる距離にもそろえる。人数・骨・攻撃は元のまま。
  const player = rt.player && rt.player.u;
  const want = humanWanted, pick = humanSelection, cp = cam.position, cq = cam.quaternion;
  let changed = pick.army !== army || pick.quality !== S.quality || pick.count !== army.units.length ||
    pick.target !== player?.target || pick.swingTarget !== player?.swing?.target ||
    pick.atkTarget !== player?.atk?.target || pick.bindTarget !== player?.bind?.o;
  // 生死・退場だけを照合する。距離と画面の判定は下の選び直しにまとめる。
  for (let i = 0; i < army.units.length; i++) {
    const u = army.units[i], state = (u.alive ? 1 : 0) | (u.gone ? 2 : 0) | (u.dying ? 4 : 0);
    if (humanUnitRefs[i] !== u || humanUnitStates[i] !== state) changed = true;
    humanUnitRefs[i] = u; humanUnitStates[i] = state;
  }
  humanUnitRefs.length = humanUnitStates.length = army.units.length;
  const moved = (cp.x - pick.x) ** 2 + (cp.y - pick.y) ** 2 + (cp.z - pick.z) ** 2 >= 1 ||
    Math.abs(cq.x * pick.qx + cq.y * pick.qy + cq.z * pick.qz + cq.w * pick.qw) <= humanTurn ||
    pick.fov !== cam.fov || pick.aspect !== cam.aspect || pick.zoom !== cam.zoom || pick.lowMem !== S.lowMem;
  HSTAT.selectionFrames++;
  // 候補の選び直しだけ二コマに一度。視点・生死・主人公の交戦相手の変更は即座に反映する。
  if ((frameNo & 1) === 0 || changed || moved || dt === 0) {
    HSTAT.selectionScans++;
    pick.army = army; pick.quality = S.quality; pick.count = army.units.length; pick.lowMem = S.lowMem;
    pick.target = player?.target; pick.swingTarget = player?.swing?.target;
    pick.atkTarget = player?.atk?.target; pick.bindTarget = player?.bind?.o;
    pick.x = cp.x; pick.y = cp.y; pick.z = cp.z;
    pick.qx = cq.x; pick.qy = cq.y; pick.qz = cq.z; pick.qw = cq.w;
    pick.fov = cam.fov; pick.aspect = cam.aspect; pick.zoom = cam.zoom;
    cam.updateMatrixWorld();
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pv);
    const cand = humanCandidates; cand.length = 0;
    for (const u of army.units) {
      if (u.gone || !u.mesh || u.type === 'dummy' || u.vatWant) continue;
      const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
      const pd = player ? Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z) : d;
      const opponent = skinOpponent(player, u);
      const required = opponent || u.isPlayer || qualityKeeper(u) && d < Math.max(60, Q.far ?? HUM.far) || (MEM_TIGHT
        ? d <= (u.human && humans.has(u.human) ? SKIN_OUT : SKIN_IN)
        : Math.min(d, pd) <= realNear());
      const named = u.name || u.isSub || u.look && (isNamed(u.look) || u.type === 'busho');   // 武将（名の無い侍大将も）
      // 遠景の一般兵は既存の一括描画へ返す。騎馬と武将の姿は残す。
      if (!opponent && u.alive && u.qualityTier === 2 && !named && !u.mounted && !u.isStandard && !u.perch && !u.naka && !u.climb) continue;
      // 六十メートルの外だけ、画質に応じた範囲で武将を残す。
      const lim = u.isPlayer ? 1e9 : named ? (Math.max(60, Q.far ?? HUM.far)) : Q.near;
      if (!required && d >= lim) continue;
      if (!dmLoading && (wantsDomaru(u.look) || crowdDomaru(u.look))) loadDomaru(); if (!kbLoading && wantsDomaru(u.look)) loadKabuto();
      // 倒れた者：カメラの近く（HUM.dead より手前）は人にする（寝た体が棒や丸太に見えないよう）。その先は、もう人になっている者だけ（倒れてしばらく）
      if (!required && !u.alive && d >= HUM.dead && !(u.human && humans.has(u.human) && (u.human.deadAge || 0) < 40)) continue;
      _sph.center.set(u.pos.x, u.pos.y + 1.2, u.pos.z);
      const vis = u.isPlayer || _fr.intersectsSphere(_sph);
      // 見えない一般兵へ骨の貸出枠を渡さず、目の前の兵に使う。
      if (TIER.weak && !vis && !opponent && !qualityKeeper(u)) continue;
      // 画面の中を先に。今もう人の者は少し優先（境目で入れ替わりが続かないように）
      // 画面の真ん中に近い者ほど先に（大軍に近づいた時、目の前の最前列から本物に替わる）。横の端の者は後回し
      let cen = 0;
      if (vis && !u.isPlayer) { v0.set(u.pos.x, u.pos.y + 1.2, u.pos.z).applyMatrix4(_pv); cen = Math.min(1.5, Math.abs(v0.x) + Math.abs(v0.y) * 0.5); }
      let pr = u.isPlayer ? -1e9 : d * (1 + 0.7 * cen) + (u.alive ? 0 : 12) + (vis ? 0 : 30);
      if (u.human && humans.has(u.human)) pr *= u.alive ? 0.9 : 0.6;   // 倒れた人は、人と軽い形を行き来させない
      if (!u.alive && u.human && humans.has(u.human) && vis && d < Math.min(HUM.dead, Q.near)) {
        if (u.human.deathSeenAt === undefined) u.human.deathSeenAt = army.time;
        if (army.time - u.human.deathSeenAt < 4) pr = -0.25 + d * 0.001;
      }
      // 作る順は本人と目の前の兵を先に取る。
      if (false && named && !u.isPlayer && u.alive) pr = d * (1 + 0.7 * cen) + (vis ? 0 : 30);
      if (required && !u.isPlayer) pr -= u.alive ? 1e6 : 5e5;
      // 携帯は距離だけで枠を割り当てる。交戦相手は一番先に確保する。
      if (CPU_LEAN) pr = u.isPlayer ? -1e9 : opponent ? -1e8 : d;
      let entry;
      if (cand.length < humanCandidatePool.length) { entry = humanCandidatePool[cand.length]; cand.push(entry); }
      else {
        let worst = 0; for (let i = 1; i < cand.length; i++) if (cand[i].d > cand[worst].d) worst = i;
        if (pr >= cand[worst].d) continue;
        entry = cand[worst];
      }
      entry.u = u; entry.d = pr; entry.dist = d; entry.vis = vis; entry.required = required;
    }
    cand.sort((a, b) => a.d - b.d);
    want.clear();
    // 携帯の一般兵は近い順に四十人まで（弱い端末は十二人）。本人と武将は従来どおり別枠。
    // 枠を超えた兵は焼いた全身の動きへ渡し、兵の数と乱戦の密度を保つ。
    const capAll = CPU_LEAN ? SKIN_MAX : 250;
    let crowdN = 0;
    for (const c of cand) {
      if (want.size >= 250) break;
      if (qualityKeeper(c.u)) { want.set(c.u, c); continue; }
      if (crowdN >= capAll) {
        if (CPU_LEAN) vatOverflow(c.u);
        continue;
      }
      if (MEM_TIGHT ? c.required : c.required || crowdN < Q.max) { want.set(c.u, c); crowdN++; }
    }
    // 作る順（本人と目の前を優先）は保ち、材質だけは距離順の上限を付ける。
    // 候補の入れ物を再利用するので毎コマ配列や材質を作らない。
    cand.sort((a, b) => a.dist - b.dist);
    let surfaceN = 0;
    for (const c of cand) {
      c.surfaceDetail = !qualityKeeper(c.u) && c.vis && c.dist < CROWD_DETAIL_NEAR && want.has(c.u) && (c.dist <= 15 || surfaceN < CROWD_DETAIL_MAX);
      if (c.surfaceDetail) surfaceN++;
    }
    HSTAT.surfaceDetail = surfaceN;
  }
  rush = 0; rushNear = 0; for (const [u, c] of want) if (!u.human && c.required) { rush++; if (c.vis && c.dist < 30) rushNear++; }
  if (MEM_TIGHT) {
    for (const u of army.units) if (u.human && (!want.has(u) || u.gone)) dropHuman(u);
  } else for (const h of humans) if (!want.has(h.u) || h.u.gone) dropHuman(h.u);
  if (EFUDA.keys.size) for (const u of army.units) if (u.efuda && (u.gone || (!MEM_TIGHT && !want.has(u)))) efudaSet(u, null);   // 選びから外れた絵札の兵は元の部品へ
  if (MEM_TIGHT) for (const u of army.units) {
    const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
    if (!want.has(u) && u.poolFar && efudaWants(u, d)) {
      const K = efudaKeyState(u);
      if (K && !K.baked && !u.human && u.alive && !u.dying && faceRenderer) efudaBakeLight(faceRenderer, rt.scene, rt.world, cam.position, u, K);
      if (K?.ready) efudaSet(u, K);
    } else if (u.efuda) efudaSet(u, null);
  }
  if (MEM_TIGHT) for (const u of army.units) if (u._humanBuild && !want.has(u)) {
    useHuman(u);
    if (u.human) dropHuman(u);
    break;
  }
  // 胴丸・兜の細かい形（hi）を同時に出す数に上限を付ける：カメラに近い順に DOMARU.hiCap 人まで。名のある武将と本人は数えず必ず hi
  {
    const near = humanNear; near.length = 0;
    // 元からある距離順の並べ替えで、足を合わせる近い十八人も決める。
    for (const [u, c] of want) { const h = u.human; if (h) { h.groundFeet = false; const item = humanNearPool[near.length]; if (item) { item.h = h; item.dist = c.dist; near.push(item); } } }
    near.sort((a, b) => a.dist - b.dist);
    let feet = 0, armor = 0;
    for (let i = 0; i < near.length; i++) {
      const h = near[i].h, u = h.u;
      if (u.alive && !u.dying && !u.mounted && !u.isPlayer && near[i].dist < HUM.ik) h.groundFeet = feet++ < 18;
      if (u.isPlayer || u.look && (isNamed(u.look) || u.type === 'busho') || !(h.parts.domaru || h.parts.kabuto)) continue;
      // 一般兵は人数によらず共有の中精細。本人・武将の細かい形の枠を使わない。
      if (h.loanedDomaru) continue;
      // 十五メートル以内は人数で粗くしない。骨入りの総枠と影の軽い形は保つ。
      const allow = (!MEM_TIGHT && near[i].dist <= 15) || armor++ < DOMARU.hiCap;
      if (h.parts.domaru) h.parts.domaru.userData.hiOK = allow;
      if (h.parts.kabuto) h.parts.kabuto.userData.hiOK = allow;
    }
  }
  // 遠景の細かな形と実写の顔は近い順に数を抑える。六十メートル以内の骨の入った体は外さない。
  {
    const near = humanNear; near.length = 0;
    // 顔と小札の枠を背後の兵で使い切らず、画面にいる近い兵へ回す。人数の上限は同じ。
    for (const [u, c] of want) { const h = u.human; if (h && !u.isPlayer && !(u.look && (isNamed(u.look) || u.type === 'busho'))) { const item = humanNearPool[near.length]; if (item) { item.h = h; item.dist = c.dist * (h.lodFar ? 1.15 : 1) * (c.vis ? 1 : 3); near.push(item); } } }
    near.sort((a, b) => a.dist - b.dist);   // 今もう軽い形の人は少し遠く見る（境目で形が行き来しないよう）
    for (let i = 0; i < near.length; i++) { const h = near[i].h; const close = want.get(h.u).dist <= 15; h.hiOK = (!MEM_TIGHT && close) || i < HUM.hiN; h.faceOK = (!MEM_TIGHT && close) || i < HUM.faceN; }
  }
  HSTAT.want = want.size; HSTAT.driven = 0;
  for (const h of humans) h.mwHold = !h.u.isPlayer;   // 骨を動かした人だけ、下で外す（skipHiddenMW）。h.hold は構えの癖（armsPose）なので別の名前にする（同じ名前だと、構えの癖が入った人は骨の行列が止まり、手と指だけ古い所に残って皮が帯のように伸びた）
  // iPhone の記憶の予算：骨入りの人は BONE_CAP 人まで（近い・大事な順）。越えた兵は絵札（絵がまだ無ければ軽い姿）で描き、兵の数と密度は変えない（10/21）
  const boneCap = memTight() ? ((window.__apx && window.__apx.bones) || 40) : Infinity;
  let liveN = 0, liveSeen = 0, newN = 0, bakeSpare = 2;
  if (boneCap < Infinity) for (const [u] of want) if (u.human && humans.has(u.human) && !u.isPlayer && !u.name && !u.isSub && !(u.look && (isNamed(u.look) || u.type === 'busho'))) liveN++;
  for (const [u, c] of want) {
    const named = u.name || u.isSub || u.look && (isNamed(u.look) || u.type === 'busho');
    // 今もう人の兵は、大事な順で枠を 6 人越えるまで残す。新しく人にするのは、今の人の数が枠より少ない時だけ
    //   （境で人と絵札を行き来させない。作り直しのごみが記憶を押していた。10/21）
    const isLive = !!(u.human && humans.has(u.human));
    const over = !u.isPlayer && !named && (isLive ? liveSeen++ >= boneCap + 6 : liveN + newN >= boneCap);
    // 絵札（efuda.js）：カメラから EFUDA.far より遠い兵は、骨入りの人でなく前もって焼いた板で描く。絵がまだ無い姿は、その人から一度だけ焼く（一コマに一人）
    let needBake = false;
    if (!u.isPlayer && !named && efudaWants(u, c.dist, over)) {
      const K = efudaKeyState(u);
      if (K) {
        needBake = !K.baked;
        const live = u.human && humans.has(u.human);
        if (K.ready) { if (live) dropHuman(u); efudaSet(u, K); continue; }
        if (live && !K.baked && u.alive && !u.dying && u.human.showAt <= frameNo && faceRenderer) efudaBake(faceRenderer, rt.scene, rt.world, cam.position, u.human, K, efudaPose);
      }
    } else if (u.efuda) efudaSet(u, null);
    // 枠の外：骨入りの人は作らない（隠した人は evictHidden が返す）。まだ絵の無い姿だけ、焼くために一コマ二人まで人にする
    if (over && !(needBake && bakeSpare-- > 0)) { if (u.human && humans.has(u.human)) dropHuman(u); continue; }
    if (!useHuman(u, u.isPlayer)) continue;
    if (!u.isPlayer && !named && !isLive) newN++;   // 名のある武将は先に作る（並びの先頭）が、一コマの枠は守る（何人も一度に作って止まらないよう）
    const h = u.human;
    if (MEM_TIGHT && !qualityKeeper(u) && efudaKeyOf(u) && u.alive && !u.dying && !(h.showAt > frameNo) && faceRenderer) {
      const K = efudaKeyState(u);
      if (K && !K.baked) efudaBake(faceRenderer, rt.scene, rt.world, cam.position, h, K, efudaPose);
    }
    if (h.facePending && !h.xb && HEAD) {
      const p = h.facePending;
      h.parts.face = scanFace(h, p.key, p.L, p.F, p.full);
      if (h.parts.face && p.L.menpoScan) {
        if (KB?.menpo) dressMenpo(h);
        else scanMenpo(h.parts.face, p.key, p.L.menpoScan);
      }
    }
    // 遠い人は軽い形（本人・名のある武将は替えない）。小谷・設楽原の八メートル指定も反映する。
    // 指定のない戦は従来どおり十五メートルまで細部を保つ。人数・骨・攻撃は変えない。
    if (h.geoFar && !qualityKeeper(u) && !named) setFar(h, c.dist > Math.min(15, detailNear) && (TIER.weak || (u.qualityTier != null ? u.qualityTier > 0 : c.dist > detailNear - (h.lodFar ? 1 : 0) && c.dist > Math.min(HUM.lod, detailNear))));
    if (!qualityKeeper(u)) {
      const detailed = c.surfaceDetail && !h.lodFar;
      // 組み立て時と同じ表面処理を共用し、開戦直後に遠方用の別の描き方へ切り替えない。
      // 泥・血・濡れは表面処理の距離判定で近くだけに残す（遠方は元の色、兵の数と密度は同じ）。
      if (h.parts.armor) h.parts.armor.material = nearSurfaceMaterial(detailed ? nearCrowdMat(Math.floor(((h.seed || 0) * 11.3) % 1 * 4)) : UNIT_MAT);
      const helmet = h.parts.kabuto;
      if (helmet && helmet.userData.surfaceBase) helmet.material = nearSurfaceMaterial(detailed ? helmet.userData.surfaceFine : helmet.userData.surfaceBase, 'kabuto');
      const armor = h.parts.domaru;
      if (armor && armor.userData.surfaceBase) armor.material = nearSurfaceMaterial(detailed ? armor.userData.surfaceFine : armor.userData.surfaceBase, 'domaru');
    }
    if (!u.alive) h.deadAge = (h.deadAge || 0) + dt; else h.still = false;
    if (u.death?.aid || u.death?.throe > u.death?.th) h.still = false;
    // 影は主枝の共通枠を保ち、遠景へ移った兵は骨の更新待ちでも直ちに外す。
    const noSh = u.qualityTier === 2 || !u.shOn;
    if (h.noSh !== noSh) {
      h.noSh = noSh;
      h.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.cs0 === undefined) o.userData.cs0 = (o.userData.unitCastShadow ?? o.castShadow) && !o.userData.teeth; o.castShadow = !noSh && o.userData.cs0; });
      if (!noSh) h.root.updateMatrixWorld(true);
    }
    h.acc += dt;
    // 画面の外の人は動きを省く（ただし作ってまだ一度も動かしていない人は一度だけ動かす：見回した時・写真モードで T の字の立ち姿が見えないよう）
    const poseWasHidden = h.poseHidden;
    h.poseHidden = !c.vis && h.drove;
    if (poseWasHidden && !h.poseHidden) h.root.updateMatrixWorld(true);
    if (h.poseHidden) { h.animEvery = -1; continue; }
    // 固まった亡骸には握りや指の計算も行わない。
    if ((!u.alive || u.dying) && h.still) { h.acc = 0; continue; }
    // 近い人の握りは毎コマ。外は骨を動かす時だけ、経過分を渡す。
    const d = c.dist, nearPose = named || u.isPlayer || (TIER.weak ? d <= detailNear : d <= 15 || (u.qualityTier != null ? u.qualityTier === 0 : d < HUM.fine));
    if (nearPose) gripPose(h, dt);
    // 倒れ切った人は動かさない（最後の姿勢のまま固める。人に作り直した時は、倒れ切った姿勢で一度だけ動かす）
    // 本流の距離別の時計を保ち、携帯の中景・遠景だけ番号でコマを分散する。パソコンは毎コマ。
    // 近景・武将・斬り合い・倒れる途中は待たせない。経過分は h.acc に残す。
    const protectedPose = nearPose || combatThinking(u, Infinity);
    if (CPU_LEAN && !protectedPose && u.alive && !u.dying && h.drove &&
        !thinkingPhase(u, d, army.frameNo) && !window.__apx?.nogate) continue;
    const every = !CPU_LEAN || nearPose || !u.alive || u.dying || u.mounted && u.charging && u.qualityTier !== 2 ||
      protectedPose ? 0 : u.qualityTier === 2 ? (HOT() ? 0.9 : 0.6) : HOT() ? 1 / 8 : 1 / 12;   // 端末がかなり熱い時は中景・遠景の骨の刻みだけ粗く（近く・武将・斬り合いは毎コマのまま）
    if (every > 0) {
      // 同時に動き始めた兵の骨を同じコマでまとめて進めない（どの画質でも。揃うと一コマに何十人分の骨が重なる）。
      // 決めた回数を保ち、兵の番号で更新の時刻だけをずらす。
      // 経過時間は h.acc に残すので、歩みや斬り合いの時計は失わない。
      const phase = (Math.imul(u.id, 2654435761) >>> 0) / 4294967296;
      const slot = Math.floor(army.time / every + phase);
      if (h.drove && h.animEvery === every && h.animSlot === slot) continue;
      h.animEvery = every; h.animSlot = slot;
    } else {
      h.animEvery = 0;
      if (h.acc < every) continue;
    }
    // 骨は一度だけ進める。ばねの刻みは sway 側で抑え、歩みと動作の時計は経過分を全て使う。
    const step = h.acc; h.acc = 0;
    if (!nearPose) gripPose(h, step);
    // 馬上の人：兵の根元と鞍の入れ物の行列を今のコマに合わせてから動かす
    if (u.mounted && u.seat) { u.mesh.updateMatrix(); u.mesh.updateWorldMatrix(false, false); u.seat.updateWorldMatrix(false, false); }
    // 倒れた者も近くは実写の顔のまま（亡骸の顔が人形の顔に戻らないよう）
    //   携帯も十四メートルまで実写の顔（六メートルでは騎馬武者の顔が描いた目の人形の顔に見えた。10/7 kaito）。
    if (h.xb) crowdFace(h, d <= Math.max(15, Q.face ?? HUM.face) && !h.lodFar && h.faceOK !== false);
    h.far = !u.isPlayer && !named && d > HUM.lite;
    h.near = nearPose;
    h.mwHold = false;
    driveHuman(h, step, nearPose, nearPose);
    h.drove = true;
    HSTAT.driven++;
    // 倒れる動き（units.js の animDeath）が終わっていれば、ここで固める
    if (!u.alive && (u.death ? u.death.t >= DEATH_END && !u.death.aid && !(u.death.throe > u.death.th) : (u.deadT || 0) >= 1)) h.still = true;
  }
  if (MEM_TIGHT) {
    let middleN = 0;
    for (const u of army.units) u.poolFar = !qualityKeeper(u);
    // 貸出を待つ近い兵も中景の枠へ入れる。骨の枠が空くまで全身を残す。
    for (const c of humanCandidates) {
      const u = c.u;
      if (u.human && humans.has(u.human)) u.poolFar = false;
      else if (middleN < MIDDLE_MAX) { u.poolFar = false; middleN++; }
      if (!u.poolFar && u.efuda) efudaSet(u, null);
    }
  }
  HSTAT.made += madeThisFrame;
}
// 見本の画面（tools/inspect.js）から：一人を人にして、一コマ動かす
function showHuman(u) { madeThisFrame = -99; madeFaces = 0; const ok = useHuman(u, true); if (ok) { u.human.skelDirty = true; if (u.human.xb) crowdFace(u.human, true); } return ok; }

// 中景の焼いた動き（crowd_vat.js）が、場面の外の作り物の人を作る・手放す
VAT.hooks.build = buildHuman;
VAT.hooks.release = (h) => { humanPool.delete(h); releaseHumanBounds(h); h.mixer?.stopAllAction(); h.mixer?.uncacheRoot(h.model); };

export { prefetchLook, prefetchFaces, makeHuman, buildHuman, efudaPose, disposeBattleHumans, updateHumans, showHuman };
