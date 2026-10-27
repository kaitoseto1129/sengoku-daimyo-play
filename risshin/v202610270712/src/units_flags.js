// 旗と指物の素材・遠くの兵の軽い形（LOD・IMP）・顔の選び方
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { makeWeapon, flagMatCache, geoCache, paint, at, merge, PLAYER_FACE, FACES } from './units_model.js';
import * as THREE from 'three';
import { S } from './settings.js';
import { flagTexture } from './textures.js';
import { GENERALS } from './units_data.js';
import { GUST, flagMoonlight } from './world.js';
import { cloneWaterMaterial } from './water_body.js';

export function weaponMesh(kind, extra = 0, sk) { return makeWeapon(kind, extra, sk); }

// カメラから三メートル以内の布・長柄と、本人の胸までの視線を塞ぐ物を隠す。
// 持ち主の足もとではなく、傾き・縮尺を含む実際の形で判定する。入れ物は共有。
const flagInverse = new THREE.Matrix4();
const flagEye = new THREE.Vector3(), flagAim = new THREE.Vector3(), flagHit = new THREE.Vector3();
const flagBox = new THREE.Box3(), flagRay = new THREE.Ray();
export function flagBlocksView(f, cam, person, nearRadius = 3) {
  // 前の判定で隠した布や親も調べ直す。表示状態を条件にすると、止まった視点でも一コマおきに布が戻る。
  if (!f || !person) return false;
  f.updateWorldMatrix(true, false);
  return flagPartBlocksView(f, cam, person, nearRadius);
}
function flagPartBlocksView(f, cam, person, nearRadius) {
  // 親の行列は入口で一度だけ更新する。飾り・竿のたびに兵まで遡らない。
  if (f.geometry && !f.isInstancedMesh && flagShapeBlocksView(f, cam, person, nearRadius)) return true;
  // 長柄は柄・穂先を束ねた組にもなる。親に形が無くても実際の子を調べる。
  for (const child of f.children) if (child.visible) {
    child.updateWorldMatrix(false, false);
    if (flagPartBlocksView(child, cam, person, nearRadius)) return true;
  }
  return false;
}
function flagShapeBlocksView(f, cam, person, nearRadius) {
  if (!f.geometry.boundingBox) f.geometry.computeBoundingBox();
  flagBox.copy(f.geometry.boundingBox).expandByScalar(0.1);
  // 傾き・縮尺を含めた外箱で先に除外する。近接範囲にも視線にも
  // 届かない旗では、逆行列・局所座標への変換・線との交差を省く。
  const e = f.matrixWorld.elements, lo = flagBox.min, hi = flagBox.max;
  const x = (lo.x + hi.x) * 0.5, y = (lo.y + hi.y) * 0.5, z = (lo.z + hi.z) * 0.5;
  const hx = (hi.x - lo.x) * 0.5, hy = (hi.y - lo.y) * 0.5, hz = (hi.z - lo.z) * 0.5;
  const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
  const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
  const rx = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
  const ry = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
  const rz = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
  const dx = Math.max(0, Math.abs(cam.x - wx) - rx);
  const dy = Math.max(0, Math.abs(cam.y - wy) - ry);
  const dz = Math.max(0, Math.abs(cam.z - wz) - rz);
  if (dx * dx + dy * dy + dz * dz > nearRadius * nearRadius && (
    Math.max(cam.x, person.x) < wx - rx || Math.min(cam.x, person.x) > wx + rx ||
    Math.max(cam.y, person.y + 1.4) < wy - ry || Math.min(cam.y, person.y + 1.4) > wy + ry ||
    Math.max(cam.z, person.z) < wz - rz || Math.min(cam.z, person.z) > wz + rz)) return false;
  flagInverse.copy(f.matrixWorld).invert();
  flagEye.copy(cam).applyMatrix4(flagInverse);
  flagBox.clampPoint(flagEye, flagHit);
  flagHit.applyMatrix4(f.matrixWorld);
  if (flagHit.distanceToSquared(cam) <= nearRadius * nearRadius) return true;
  flagAim.set(person.x, person.y + 1.4, person.z).applyMatrix4(flagInverse).sub(flagEye);
  const length = flagAim.length();
  if (!length) return false;
  flagRay.set(flagEye, flagAim.multiplyScalar(1 / length));
  return !!flagRay.intersectBox(flagBox, flagHit) && flagHit.distanceToSquared(flagEye) < length * length;
}
// 乱戦で画面の真ん中を塞ぐ、近い味方の槍：透けた材質（元の材質ごとに一つ）
const fadedWpnCache = new Map();
export function fadedWeapon(m) {
  if (m.userData.faded) return m;
  if (!fadedWpnCache.has(m)) { const f = cloneWaterMaterial(m); f.transparent = true; f.opacity = 0.3; f.depthWrite = false; f.forceSinglePass = true; f.userData.faded = true; f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey; fadedWpnCache.set(m, f); }
  return fadedWpnCache.get(m);
}
// 視線を横切る旗だけ薄くする。材質は槍と同じ写しを共有し、離れたら戻す。
export function fadeViewFlag(f, fade) {
  if (f.material && !Array.isArray(f.material)) {
    if (fade && !f.material.userData.faded) {
      f.userData.viewFlagMaterial = f.material;
      f.material = fadedWeapon(f.material);
    } else if (!fade && f.userData.viewFlagMaterial) {
      if (f.material.userData.faded) f.material = f.userData.viewFlagMaterial;
      f.userData.viewFlagMaterial = null;
    }
  }
  for (const child of f.children) fadeViewFlag(child, fade);
}
// 倒れた者の指物：土に落ちて汚れた色（元の材質ごとに一つ）
const muddyCache = new Map();
function muddyFlag(m) {
  if (!m || m.userData.muddy) return m;
  // 倒れた旗は元の材質から汚し、近い旗への戻し替えも終える。
  if (m.nearFlagBase) m = m.nearFlagBase;
  if (!muddyCache.has(m)) {
    const f = cloneWaterMaterial(m);
    delete f.userData.nearFlag;
    f.color = new THREE.Color(0x8a7c68); f.userData.muddy = true;
    f.onBeforeCompile = (sh, r) => {
      m.onBeforeCompile(sh, r);
      if (sh.uniforms.uFlagStill) sh.uniforms.uFlagStill.value = 1;
    };
    f.customProgramCacheKey = () => '地に伏せた布' + m.customProgramCacheKey();
    muddyCache.set(m, f);
  }
  return muddyCache.get(m);
}
// 旗の時計（はためきの位相）
export const FLAG_T = { value: 0 };
// 風の向き（world.js の WIND_STATE から毎コマ写す）。突風の帯が風下へ隊を横切り、旗が順に翻る
const FLAG_W = { value: new THREE.Vector2(0.565, 0.825) };
function flagMaterial(kind, boost = 0, enemy = false) {
  const key = (boost ? kind + '|' + boost : kind) + (enemy ? '|e' : '');
  if (flagMatCache.has(key)) return flagMatCache.get(key);
  if (kind === 'player_gold') {
    // 無地・つや消し。近景の布への交換も避け、しわ・破れ・点滅を付けない。
    const m = new THREE.MeshLambertMaterial({ color: 0xf2b824, emissive: 0x5a3a06, side: THREE.DoubleSide });
    m.userData.nearFlag = true;
    flagMatCache.set(key, m);
    return m;
  }
  const m = S.simpleMaterials ? new THREE.MeshPhongMaterial({ map: flagTexture(kind, false, enemy), side: THREE.DoubleSide, shininess: 4, specular: 0x171717, alphaTest: 0.5 }) : new THREE.MeshStandardMaterial({ map: flagTexture(kind, false, enemy), side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  // 薄暮の味方だけ紋の地色を残す。強めた材質も旗ごとに共有する。
  if (boost) { m.emissive.set(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = boost; }
  // 布のはためき：竿から離れるほど大きく波打つ。旗ごとに位相をずらす
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T;
    sh.uniforms.uFlagW = FLAG_W;
    sh.uniforms.uGust = GUST;
    sh.uniforms.uFlagStill = { value: 0 };
    if (S.flagMotion) sh.vertexShader = 'uniform float uFlagT, uGust, uFlagStill;\nuniform vec2 uFlagW;\n#ifdef USE_INSTANCING\n#define FLAG_M (modelMatrix * instanceMatrix)\n#else\n#define FLAG_M modelMatrix\n#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fo = FLAG_M * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = fo.x * 0.73 + fo.z * 0.41;
      // 旗ごとに拍子を少し変える（同じ拍子で揃って揺れないように）。人ごとの背丈（縦の縮尺）を種にする（歩いても変わらない）
      float hs = fract(length(FLAG_M[1].xyz) * 97.0);
      float fr = 5.2 * (0.8 + hs * 0.4);
      ph += hs * 6.28;
      // 突風の帯：風下へ野を渡り、通った所の旗が大きく翻る
      float gw = dot(fo.xz, uFlagW) * 0.05 - uFlagT * 1.2;
      float gu = uGust * (0.45 + 0.55 * smoothstep(-0.3, 0.9, sin(gw)));
      gu *= 1.0 - uFlagStill;
      float k = clamp(position.x / 0.36, 0.0, 1.0) * clamp((0.36 - position.y) / 0.72, 0.0, 1.0);
      transformed.z += (sin(position.x * 24.0 + position.y * 3.0) * 0.04 * (1.0 - uFlagStill) + (sin(uFlagT * fr + position.x * 16.0 + position.y * 4.0 + ph) * 0.065 + sin(uFlagT * 2.3 + ph) * 0.03) * gu) * k;`)
      // 波打つ布の向き（法線）も同じ波から求める：光が波の山と谷で変わり、板でなく布に見える
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      {
        vec4 fo = FLAG_M * vec4(0.0, 0.0, 0.0, 1.0);
        float hs = fract(length(FLAG_M[1].xyz) * 97.0);
        float fr = 5.2 * (0.8 + hs * 0.4);
        float ph = fo.x * 0.73 + fo.z * 0.41 + hs * 6.28;
        float gw = dot(fo.xz, uFlagW) * 0.05 - uFlagT * 1.2;
        float gu = uGust * (0.45 + 0.55 * smoothstep(-0.3, 0.9, sin(gw)));
        gu *= 1.0 - uFlagStill;
        float kx = clamp(position.x / 0.36, 0.0, 1.0);
        float ky = clamp((0.36 - position.y) / 0.72, 0.0, 1.0);
        float fold = position.x * 24.0 + position.y * 3.0;
        float ar = uFlagT * fr + position.x * 16.0 + position.y * 4.0 + ph;
        float zz = sin(fold) * 0.04 * (1.0 - uFlagStill) + (sin(ar) * 0.065 + sin(uFlagT * 2.3 + ph) * 0.03) * gu;
        float dzdx = ((cos(fold) * 0.96 * (1.0 - uFlagStill) + cos(ar) * 1.04 * gu) * kx + zz / 0.36) * ky;
        float dzdy = (cos(fold) * 0.12 * (1.0 - uFlagStill) + cos(ar) * 0.26 * gu) * kx * ky - zz * kx / 0.72;
        if (uFlagStill < 0.5) objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
      }`);
    flagMoonlight(sh);
    if (S.simpleMaterials) return;
    // 麻の経糸・緯糸。遠い旗では画素幅に合わせて消し、ちらつく縞を残さない。
    // 全ての指物が同じ材質を使い、画像や描く回数は増やさない。
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec2 flagThread = vMapUv * vec2(210.0, 320.0);
      vec2 threadFade = vec2(1.0) - smoothstep(vec2(0.15), vec2(0.5), fwidth(flagThread));
      float threadH = dot(sin(flagThread * 6.283185) * threadFade, vec2(0.00012));
      vec3 threadDx = dFdx(-vViewPosition), threadDy = dFdy(-vViewPosition);
      vec3 threadR1 = cross(threadDy, normal), threadR2 = cross(normal, threadDx);
      float threadDet = dot(threadDx, threadR1) * faceDirection;
      normal = normalize(abs(threadDet) * normal - sign(threadDet)
        * (dFdx(threadH) * threadR1 + dFdy(threadH) * threadR2));`);
    // 日を背にした旗は、布を透かして明るむ（紙の板に見せない）
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        { float bt = max(0.0, dot(-normal, directionalLights[0].direction)); reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * bt * 0.3 * RECIPROCAL_PI; }
      #endif`);
  };
  flagMatCache.set(key, m);
  return m;
}

// 組番号を布へ後付けせず、家紋・念仏など元の旗印をそのまま使う。
// 組の見分けは号令の札に任せ、旗の材質を全員で使い回す。
function numberedFlag(kind) {
  return flagMaterial(kind);
}

// 馬印：金扇・瓢箪・日輪・三つ団子・白吹貫・金幣・竹に金短冊。結合した形を種類ごとに使い回す。
function umaGeometry(kind) {
  const k = 'uma' + kind;
  if (geoCache.has(k)) return geoCache.get(k);
  const gold = 0xd4ab4e, parts = [];
  parts.push(paint(at(new THREE.CylinderGeometry(0.02, 0.022, 2.4, 5), 0, 2.1, 0), 0x2a1c10));
  if (kind === 'fan') {
    // 開いた扇：要（かなめ）を下にした半円。裏からも見えるよう両面に
    for (const ry of [0, Math.PI]) parts.push(paint(at(new THREE.CircleGeometry(0.7, 18, Math.PI * 0.12, Math.PI * 0.76), 0, 3.05, 0, 0, ry), gold));
    for (const ry of [0, Math.PI]) parts.push(paint(at(new THREE.CircleGeometry(0.17, 14), 0, 3.5, ry ? -0.01 : 0.01, 0, ry), 0xb8231a));
    for (let k = 0; k < 7; k++) { const a = Math.PI * 0.12 + (k / 6) * Math.PI * 0.76; parts.push(paint(at(new THREE.BoxGeometry(0.015, 0.7, 0.03), Math.cos(a) * 0.35, 3.05 + Math.sin(a) * 0.35, 0, 0, 0, a - Math.PI / 2), 0x6a4a1a)); }
  } else if (kind === 'whiteFukinuki') {
    // 白布の筒と下端の裂。上下を塞がず、内側は使う側の両面材質で描く。
    // 寸法と裂の本数は復元。形は一度だけ結合し、毎コマの布や形の作り直しはしない。
    const white = 0xe4dfd1;
    parts.push(paint(at(new THREE.CylinderGeometry(.02, .02, .9, 5), 0, 3.7, 0), 0x2a1c10));
    parts.push(paint(at(new THREE.TorusGeometry(.28, .018, 4, 16), 0, 4.12, 0, Math.PI / 2), white));
    parts.push(paint(at(new THREE.CylinderGeometry(.28, .3, .9, 16, 1, true), 0, 3.65, 0), white));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      parts.push(paint(at(new THREE.BoxGeometry(.15, .5, .015),
        Math.sin(a) * .3, 2.95, Math.cos(a) * .3, 0, a), white));
    }
  } else if (kind === 'gohei') {
    // 金幣の復元。二筋の折った幣を竿頭から下げ、表裏とも厚みのある板で見せる。
    parts.push(paint(at(new THREE.BoxGeometry(.66, .06, .05), 0, 3.75, 0), gold));
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      parts.push(paint(at(new THREE.BoxGeometry(.28, .22, .025),
        side * (.22 + (i % 2) * .14), 3.64 - i * .2, 0), gold));
    }
  } else if (kind === 'bamboo_tanzaku') {
    // 丹羽長秀の伝承の馬印。枝ぶりと六枚の短冊は復元案。
    // 竿・枝・短冊を一つへ結合し、毎コマの揺れや個別の材質を増やさない。
    const bamboo = 0x777344;
    parts.push(paint(at(new THREE.CylinderGeometry(.018, .022, .75, 5), 0, 3.55, 0), bamboo));
    for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
      const y = 3.2 + i * .25, span = .55 - i * .1;
      parts.push(paint(at(new THREE.CylinderGeometry(.009, .012, span, 4),
        sd * span * .43, y, 0, 0, 0, -sd * 1.05), bamboo));
      parts.push(paint(at(new THREE.BoxGeometry(.075, .32, .006),
        sd * span * .86, y + span * .25 - .16, 0, 0, sd * .18, sd * .08), gold));
      // 竹の細い葉を枝の途中に添える。寸法・向きは実測ではない。
      const leaf = new THREE.ConeGeometry(.025, .19, 3);
      leaf.scale(1, 1, .25);
      parts.push(paint(at(leaf, sd * span * .5, y + .08, .015, 0, 0, -sd * .8), bamboo));
    }
  } else if (kind === 'dango') {
    // 金の三つ団子。竿の上に三球を縦に並べる。
    for (let i = 0; i < 3; i++) parts.push(paint(at(new THREE.SphereGeometry(0.23, 10, 6), 0, 3.25 + i * .46, 0), gold));
  } else if (kind === 'gourd') {
    // 持ち手の頭幅ほどの実にする。倒れた時も人の胴より大きい金の球に見せない。
    const agedGold = 0xa8853d;
    parts.push(paint(at(new THREE.SphereGeometry(0.19, 12, 8), 0, 3.3, 0), agedGold));
    parts.push(paint(at(new THREE.SphereGeometry(0.12, 12, 8), 0, 3.57, 0), agedGold));
    parts.push(paint(at(new THREE.CylinderGeometry(0.025, 0.045, 0.1, 8), 0, 3.72, 0), 0x752b21));
    for (let i = 0; i < 8; i++) parts.push(paint(at(new THREE.BoxGeometry(0.018, 0.22, 0.018), Math.sin(i * 0.8) * 0.08, 3.04, Math.cos(i * 0.8) * 0.08), 0x752b21));
  } else {
    parts.push(paint(at(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), 0, 3.5, 0, Math.PI / 2), gold));
    parts.push(paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 18), 0, 3.5, 0.01, Math.PI / 2), 0xb8231a));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push(paint(at(new THREE.BoxGeometry(0.03, 0.22, 0.02), Math.sin(a) * 0.5, 3.5 + Math.cos(a) * 0.5, 0, 0, 0, -a), gold)); }
  }
  const g = merge(parts);
  geoCache.set(k, g);
  return g;
}

// 近い兵だけ細かい形で描く（描く直前にカメラとの距離で形を入れ替える）
export const LOD = { near: 16, on: true, low: false };
// 遠い兵（カメラから far m より先）は、一人ずつの形をやめて軽い兵の形でまとめて描く（world.makeImpostor。描く回数を減らす）
// 騎馬・武将・名のある者・倒れかけの者は、そのまま一人ずつ描く
export const IMP = { on: true, far: 48 };
// 軽い兵をまとめて描く（Army.batchDraw）。?nobatch で切る（比べる時）
export const BATCH = { on: typeof location === 'undefined' || !/[?&]nobatch\b/.test(location.search) };
// 待つ兵の小さな動き（idleFx・遠くの兵の揺れ）。見比べる時は on を false に
export const IDLE = { on: true };
function lodSwap(mesh, hi, lo, near) {
  mesh.geometry = hi;
  if (hi === lo) return;
  mesh.userData.lod = [hi, lo, near];   // まとめて描く時（Army.batchDraw）に、遠さに合う形を選ぶ
  mesh.onBeforeRender = (r, s, cam) => {
    const e = mesh.matrixWorld.elements, c = cam.matrixWorld.elements;
    const dx = e[12] - c[12], dy = e[13] - c[13], dz = e[14] - c[14];
    const nr = near != null && near <= 16 ? Math.min(near, LOD.near) : (near ?? LOD.near);
    // 画質「低」：カメラの近くで透かした味方（描く間だけ半透明の材質）は、細かい形にしない（薄く見えるだけなので。一人一万面ほど浮く）
    const want = !LOD.on || (dx * dx + dy * dy + dz * dz < nr * nr && !(LOD.low && mesh.material?.transparent)) ? hi : lo;
    if (mesh.geometry !== want) mesh.geometry = want;
  };
}
// 顔の形の値を引く（名のある武将・本人・兵の顔の番号）
function faceOf(look) {
  const f = look.face;
  if (f && typeof f === 'object') return f;
  if (f === 'player') return PLAYER_FACE;
  if (typeof f === 'string' && f.startsWith('g:')) return (GENERALS[f.slice(2)] || {}).face || FACES[0];
  return FACES[(f | 0) % FACES.length];
}

export { lodSwap, faceOf, flagMaterial, umaGeometry, muddyFlag, numberedFlag, FLAG_W };

// 戦ごとの旗の写しは、元の共有材質への参照も手放す。
export function disposeBattleFlags(resources) {
  resources.add([fadedWpnCache, muddyCache]);
  fadedWpnCache.clear(); muddyCache.clear();
}
