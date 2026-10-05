// 旗と指物の素材・遠くの兵の軽い形（LOD・IMP）・顔の選び方
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { makeWeapon, flagMatCache, geoCache, paint, at, merge, PLAYER_FACE, FACES } from './units_model.js';
import * as THREE from 'three';
import { flagTexture } from './textures.js';
import { GENERALS } from './units_data.js';
import { GUST } from './world.js';
import { cloneWaterMaterial } from './water_body.js';

export function weaponMesh(kind, extra = 0, sk) { return makeWeapon(kind, extra, sk); }

// 透けた旗の材質（元の材質ごとに一つ）
const fadedCache = new Map();
function fadedFlag(m) {
  if (m.userData.faded) return m;
  if (!fadedCache.has(m)) { const f = cloneWaterMaterial(m); f.transparent = true; f.opacity = 0.22; f.alphaTest = 0; f.depthWrite = false; f.userData.faded = true; f.onBeforeCompile = m.onBeforeCompile; fadedCache.set(m, f); }
  return fadedCache.get(m);
}
// 乱戦で画面の真ん中を塞ぐ、近い味方の槍：透けた材質（元の材質ごとに一つ）
const fadedWpnCache = new Map();
export function fadedWeapon(m) {
  if (m.userData.faded) return m;
  if (!fadedWpnCache.has(m)) { const f = cloneWaterMaterial(m); f.transparent = true; f.opacity = 0.3; f.depthWrite = false; f.userData.faded = true; f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey; fadedWpnCache.set(m, f); }
  return fadedWpnCache.get(m);
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
    f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey;
    muddyCache.set(m, f);
  }
  return muddyCache.get(m);
}
// 旗の時計（はためきの位相）
export const FLAG_T = { value: 0 };
// 風の向き（world.js の WIND_STATE から毎コマ写す）。突風の帯が風下へ隊を横切り、旗が順に翻る
const FLAG_W = { value: new THREE.Vector2(0.565, 0.825) };
function flagMaterial(kind) {
  if (flagMatCache.has(kind)) return flagMatCache.get(kind);
  const m = new THREE.MeshStandardMaterial({ map: flagTexture(kind), side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  // 布のはためき：竿から離れるほど大きく波打つ。旗ごとに位相をずらす
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T;
    sh.uniforms.uFlagW = FLAG_W;
    sh.uniforms.uGust = GUST;
    sh.vertexShader = 'uniform float uFlagT, uGust;\nuniform vec2 uFlagW;\n#ifdef USE_INSTANCING\n#define FLAG_M (modelMatrix * instanceMatrix)\n#else\n#define FLAG_M modelMatrix\n#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fo = FLAG_M * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = fo.x * 0.73 + fo.z * 0.41;
      // 旗ごとに拍子を少し変える（同じ拍子で揃って揺れないように）。人ごとの背丈（縦の縮尺）を種にする（歩いても変わらない）
      float hs = fract(length(FLAG_M[1].xyz) * 97.0);
      float fr = 5.2 * (0.8 + hs * 0.4);
      ph += hs * 6.28;
      // 突風の帯：風下へ野を渡り、通った所の旗が大きく翻る
      float gw = dot(fo.xz, uFlagW) * 0.05 - uFlagT * 1.2;
      float gu = uGust * (0.45 + 0.55 * smoothstep(-0.3, 0.9, sin(gw)));
      float k = clamp(position.x / 0.36, 0.0, 1.0) * gu;
      transformed.z += (sin(uFlagT * fr + position.x * 16.0 + position.y * 4.0 + ph) * 0.045 + sin(uFlagT * 2.3 + ph) * 0.03) * k;
      transformed.x -= abs(sin(uFlagT * fr + position.x * 16.0 + ph)) * 0.012 * k;`)
      // 波打つ布の向き（法線）も同じ波から求める：光が波の山と谷で変わり、板でなく布に見える
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      {
        vec4 fo = FLAG_M * vec4(0.0, 0.0, 0.0, 1.0);
        float hs = fract(length(FLAG_M[1].xyz) * 97.0);
        float fr = 5.2 * (0.8 + hs * 0.4);
        float ph = fo.x * 0.73 + fo.z * 0.41 + hs * 6.28;
        float gw = dot(fo.xz, uFlagW) * 0.05 - uFlagT * 1.2;
        float gu = uGust * (0.45 + 0.55 * smoothstep(-0.3, 0.9, sin(gw)));
        float kx = clamp(position.x / 0.36, 0.0, 1.0);
        float ar = uFlagT * fr + position.x * 16.0 + position.y * 4.0 + ph;
        float zz = sin(ar) * 0.045 + sin(uFlagT * 2.3 + ph) * 0.03;
        float dzdx = (cos(ar) * 16.0 * 0.045 * kx + zz * (position.x > 0.0 && position.x < 0.36 ? 1.0 / 0.36 : 0.0)) * gu;
        float dzdy = cos(ar) * 4.0 * 0.045 * kx * gu;
        objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
      }`);
    // 日を背にした旗は、布を透かして明るむ（紙の板に見せない）
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        { float bt = max(0.0, dot(-normal, directionalLights[0].direction)); reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * bt * 0.3 * RECIPROCAL_PI; }
      #endif`);
  };
  flagMatCache.set(kind, m);
  return m;
}

// 組の番号入りの指物（一番〜三番）：家の旗の裾に、組の番号を墨で書き入れる（自分の組の旗を見分けられるように）
const NUM_FLAG = new Map();
function numberedFlag(kind, n) {
  const key = kind + '|' + n;
  if (NUM_FLAG.has(key)) return NUM_FLAG.get(key);
  const base = flagMaterial(kind), img = base.map && base.map.image;
  if (!img || !img.width) return base;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });   // 下で絵の明るさを読むので CPU の絵に
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height, fs = Math.round(W * 0.5);
  g.font = `700 ${fs}px "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // 地の明るさを見て、明るい地には墨、暗い地には胡粉（白）で書く
  const x = W * 0.5, y0 = H * 0.8;
  let lum = 0.5;
  try { const d = g.getImageData(Math.round(x) - 8, Math.round(y0) - 8, 16, 16).data; let a = 0; for (let i = 0; i < d.length; i += 4) a += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; lum = a / (d.length / 4) / 255; } catch (e) { /* 読めなければ墨 */ }
  const txt = ['一', '二', '三', '四', '五'][n - 1] || '';
  const ink = lum > 0.45 ? 'rgba(20,16,12,0.92)' : 'rgba(236,230,214,0.92)';
  // 太筆で：同じ色で縁をなぞって画を太らせる（遠目にも読めるように）
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = fs * 0.09; g.lineJoin = 'round';
  g.strokeText(txt, x, y0); g.fillText(txt, x, y0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = base.map.colorSpace; t.anisotropy = base.map.anisotropy;
  const m = base.clone(); m.map = t; m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
  NUM_FLAG.set(key, m);
  return m;
}

// 馬印：金扇・瓢箪・日輪
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
  } else if (kind === 'gourd') {
    parts.push(paint(at(new THREE.SphereGeometry(0.3, 12, 8), 0, 3.4, 0), gold));
    parts.push(paint(at(new THREE.SphereGeometry(0.2, 12, 8), 0, 3.82, 0), gold));
    parts.push(paint(at(new THREE.CylinderGeometry(0.05, 0.08, 0.14, 8), 0, 4.06, 0), 0xb8231a));
    for (let i = 0; i < 8; i++) parts.push(paint(at(new THREE.BoxGeometry(0.03, 0.34, 0.03), Math.sin(i * 0.8) * 0.12, 3.05, Math.cos(i * 0.8) * 0.12), 0xb8231a));
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
export const LOD = { near: 16, on: true };
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
    const nr = (near ?? LOD.near);
    const want = !LOD.on || dx * dx + dy * dy + dz * dz < nr * nr ? hi : lo;
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

export { lodSwap, faceOf, flagMaterial, umaGeometry, muddyFlag, numberedFlag, FLAG_W, fadedFlag };
