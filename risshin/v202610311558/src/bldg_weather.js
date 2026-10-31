import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

// 建物の材質の古び（雨だれ・苔・煤・瓦の色むら）と、写真の肌理（漆喰・土壁・石の面）。
// 写真は Poly Haven の CC0（docs/CREDITS.md）。置き場の assets/tex/bldg_*.jpg を一度だけ読み、材質は作り直さない。
// 古びは世界の位置から決めるので、建物ごとに汚れ方が違い、絵も描く回数も増えない（写真一枚の読みと少しの計算だけ）。
const PHOTO = { thatch: 'bldg_thatch.jpg', plaster: 'bldg_plaster.jpg', clay: 'bldg_clay.jpg', stone: 'bldg_stone.jpg' };
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
let GRAY = null;
const photos = new Map();
function loadImage(name, done) {
  const img = new Image();
  img.onload = () => done(img);
  img.src = new URL('../assets/tex/' + PHOTO[name], import.meta.url).href;
}
// 写真の色の平均（明るさを変えずに肌理だけを掛けるための割る数）
function meanOf(img) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data, m = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += lin(d[i + k]);
  return new THREE.Vector3(m[0], m[1], m[2]).multiplyScalar(1 / 1024);
}
function photo(name) {
  let u = photos.get(name);
  if (u) return u;
  GRAY ||= Object.assign(new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1), { needsUpdate: true });
  u = { tex: { value: GRAY }, mean: { value: new THREE.Vector3(lin(128), lin(128), lin(128)) } };
  photos.set(name, u);
  loadImage(name, (img) => {
    // iPhone（MEM_TIGHT）は 256 角に縮めて送る（512 角の四分の一の記憶）
    let src = img;
    if (MEM_TIGHT && img.width > 256) { src = document.createElement('canvas'); src.width = src.height = 256; src.getContext('2d').drawImage(img, 0, 0, 256, 256); }
    const t = new THREE.Texture(src);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.needsUpdate = true;
    u.mean.value.copy(meanOf(img)); u.tex.value = t;
  });
  return u;
}

// 城の部品の写真の肌（10/30 c_castle_q）：古い板（Weathered Planks）・瓦（Grey Roof Tiles）の
// 写真の濃淡（白黒）を、一枚の絵の色の段へ詰める（絵の口は一つ・全部の部品で使い回す。青の段は空き）。512 角、iPhone は 256 角の _s。
// 各段は平均 0.5・ばらつきをそろえて詰めるので、元の色と明るさは変えずに肌理だけが乗る。読み終わるまでは 0.5（肌理なし）。
let PACK = null;
function photoPack() {
  if (PACK) return PACK;
  const N = MEM_TIGHT ? 256 : 512, data = new Uint8Array(N * N * 4).fill(128);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  PACK = { value: t };
  if (typeof document === 'undefined') return PACK;
  const kinds = ['ita', 'kawara'];
  Promise.all(kinds.map((k) => new Promise((ok, ng) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = ng;
    im.src = new URL('../assets/tex/bldg_q_' + k + (MEM_TIGHT ? '_s' : '') + '.jpg', import.meta.url).href;
  }))).then((ims) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const cx = cv.getContext('2d', { willReadFrequently: true }), L = new Float32Array(N * N);
    ims.forEach((im, c) => {
      cx.drawImage(im, 0, 0, N, N);
      const px = cx.getImageData(0, 0, N, N).data;
      let m = 0, v = 0;
      for (let i = 0; i < N * N; i++) { L[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11; m += L[i]; }
      m /= N * N; for (let i = 0; i < N * N; i++) v += (L[i] - m) * (L[i] - m);
      const k = 42 / Math.max(4, Math.sqrt(v / (N * N)));
      for (let i = 0; i < N * N; i++) data[i * 4 + c] = Math.max(0, Math.min(255, 128 + (L[i] - m) * k));
    });
    cv.width = cv.height = 1;
    t.needsUpdate = true;
  }).catch(() => { /* 読めない時は肌理なしのまま */ });
  return PACK;
}

// 茅葺きの絵（nature.js の thatchTex。屋根・遠景の家で共用）を写真に差し替える。
// 元の絵の平均の色に合わせ、各戦が付けた屋根の色合いを変えない。
const upgraded = new WeakSet();
export function upgradeThatch(tex) {
  if (!tex || upgraded.has(tex)) return tex;
  upgraded.add(tex);
  loadImage('thatch', (img) => {
    const old = tex.image;
    let want = [128, 108, 72];
    if (old && old.getContext) {
      const d = old.getContext('2d').getImageData(0, 0, old.width, old.height).data;
      want = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) want[k] += d[i + k];
      want = want.map((v) => v / (d.length / 4));
    }
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
    const id = g.getImageData(0, 0, S, S), p = id.data, have = [0, 0, 0];
    for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) have[k] += p[i + k];
    const f = have.map((v, k) => want[k] / Math.max(1, v / (p.length / 4)));
    // 古い茅の灰色を少し残しつつ、平均を元の絵へ寄せる（暗い所は深い陰のまま）
    for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, p[i + k] * f[k]);
    g.putImageData(id, 0, 0);
    tex.image = c; tex.needsUpdate = true;
  });
  return tex;
}

// 材ごとの古びの強さ：[雨だれ, 苔, 煤, 瓦の色むら]、写真の肌理：[名, 一回りの m, 強さ]
// more：[壁の色の斑, 板一枚ずつの色, 足元の泥はね・軒下の陰, 茅の筋]（どれも計算だけ。絵・形・描く回数は増えない）
const KIND = {
  plaster: { amt: [1.0, 0.3, 0.55, 0], more: [0.45, 0, 0.8, 0], det: ['plaster', 1.4, 0.85] },
  tsuchi: { amt: [0.8, 0.35, 0.3, 0], more: [0.7, 0, 0.9, 0], det: ['clay', 2.4, 0.55] },
  home: { amt: [0.85, 0.35, 0.4, 0], more: [0.8, 0.35, 0.9, 0], det: ['clay', 2.4, 0.45] },
  stone: { amt: [0.55, 1.0, 0.1, 0], more: [0.4, 0, 0.5, 0], det: ['stone', 1.6, 0.7] },
  wood: { amt: [0.7, 0.45, 0.45, 0], more: [0.6, 0.75, 0.8, 0], pk: [0, 1.8, 0.28, 0] },
  ita: { amt: [0.6, 0.7, 0.4, 0], more: [0.6, 1.0, 0.8, 0], pk: [0, 1.8, 0.34, 0] },
  thatch: { amt: [0.3, 0.9, 0.55, 0], more: [0.5, 0, 0, 1.0] },
  tile: { amt: [0.35, 0.55, 0.0, 1.0], more: [0.3, 0, 0, 0], det: ['stone', 3.0, 0.15], pk: [1, 1.0, 0.3, 1] },
};
const uni = new Map();
function kindUniforms(kind) {
  let u = uni.get(kind);
  if (u) return u;
  const K = KIND[kind];
  u = { bwAmt: { value: new THREE.Vector4(...K.amt) }, bwMore: { value: new THREE.Vector4(...K.more) } };
  if (K.det) {
    const P = photo(K.det[0]);
    u.bwPhoto = P.tex; u.bwMean = P.mean; u.bwDet = { value: new THREE.Vector2(K.det[1], K.det[2]) };
  }
  if (K.pk) {
    u.bwPack = photoPack();
    u.bwPk = { value: new THREE.Vector4(K.pk[1], K.pk[2], K.pk[3], 0) };
    u.bwPkCh = { value: new THREE.Vector3(K.pk[0] === 0 ? 1 : 0, K.pk[0] === 1 ? 1 : 0, K.pk[0] === 2 ? 1 : 0) };
  }
  uni.set(kind, u);
  return u;
}

const VERT_HEAD = 'varying vec3 vBwPos;\nvarying vec3 vBwNrm;\nvarying float vBwLy;\n';
const VERT_BODY = `#include <project_vertex>
  {
    vec4 bwW = vec4(transformed, 1.0);
    vec3 bwNo = objectNormal;
    #ifdef USE_BATCHING
    bwW = batchingMatrix * bwW; bwNo = mat3(batchingMatrix) * bwNo;
    #endif
    #ifdef USE_INSTANCING
    bwW = instanceMatrix * bwW; bwNo = mat3(instanceMatrix) * bwNo;
    #endif
    bwW = modelMatrix * bwW;
    vBwPos = bwW.xyz; vBwNrm = mat3(modelMatrix) * bwNo;
    // 置いた家の中の高さ（土台からの m）。世界の座標で焼いた束・並べた物は使わない（99＝足元も軒下も無し）
    vBwLy = dot(modelMatrix[3].xyz, modelMatrix[3].xyz) > 0.01 ? transformed.y : 99.0;
    #if defined(USE_BATCHING) || defined(USE_INSTANCING)
    vBwLy = 99.0;
    #endif
  }`;
const FRAG_HEAD = `varying vec3 vBwPos;
varying vec3 vBwNrm;
varying float vBwLy;
uniform vec4 bwAmt;
uniform vec4 bwMore;
#ifdef BW_PHOTO
uniform sampler2D bwPhoto; uniform vec3 bwMean; uniform vec2 bwDet;
#endif
#ifdef BW_PACK
uniform sampler2D bwPack; uniform vec4 bwPk; uniform vec3 bwPkCh;
#endif
float bwHash(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float bwNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bwHash(i), bwHash(i + vec2(1.0, 0.0)), f.x), mix(bwHash(i + vec2(0.0, 1.0)), bwHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const FRAG_BODY = `#include <color_fragment>
  {
    vec3 bwN = normalize(vBwNrm);
    vec3 bwP = vBwPos;
    float bwUp = smoothstep(0.35, 0.85, bwN.y);
    float bwVert = 1.0 - smoothstep(0.55, 0.9, abs(bwN.y));
    vec2 bwT = vec2(-bwN.z, bwN.x); bwT /= max(length(bwT), 1e-3);
    float bwH = dot(bwP.xz, bwT);
    vec2 bwCell = floor(bwP.xz / 7.0);
    // 建物ごとの古び具合（7m の升ごとに違う）
    float bwAge = 0.45 + 0.55 * bwHash(bwCell + 0.5);
    #ifdef BW_PHOTO
    vec2 bwUV = abs(bwN.y) > 0.7 ? bwP.xz : (abs(bwN.x) > abs(bwN.z) ? bwP.zy : bwP.xy);
    vec3 bwD = texture2D(bwPhoto, bwUV / bwDet.x + bwCell * 0.37).rgb / max(bwMean, vec3(0.02));
    diffuseColor.rgb *= mix(vec3(1.0), clamp(bwD, 0.0, 2.2), bwDet.y);
    #endif
    #ifdef BW_PACK
    {
      // 写真の濃淡（平均 0.5）：板は縦の板目が壁で縦に立つよう、壁は横・高さ、上向きの面は xz で写す。瓦は屋根の uv（瓦の段）に沿わせる
      vec2 bwQ = abs(bwN.y) > 0.7 ? bwP.xz : vec2(dot(bwP.xz, bwT), bwP.y);
      #ifdef BW_PACK_UV
      bwQ = vMapUv * bwPk.x;
      #else
      bwQ = bwQ / bwPk.x + bwCell * 0.29;
      #endif
      float bwPv = dot(texture2D(bwPack, bwQ).rgb, bwPkCh) - 0.5;
      diffuseColor.rgb *= clamp(1.0 + bwPv * 2.4 * bwPk.y, 0.45, 1.6);
    }
    #endif
    #ifdef BW_TILE
    // 瓦一枚ずつの焼きむら：灰の濃淡と、時々の茶がかった瓦
    float bwTv = bwHash(floor(vMapUv * 8.0) + bwCell * 13.0);
    diffuseColor.rgb *= 1.0 + (bwTv - 0.5) * 0.36 * bwAmt.w;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.0, 0.86), step(0.82, bwTv) * bwAmt.w);
    #endif
    // 雨だれ：壁を縦に流れる筋。筋ごとに長さと濃さが違う
    float bwCol = floor(bwH * 7.0);
    float bwS = bwNoise(vec2(bwH * 7.0, bwP.y * 0.22 + bwHash(vec2(bwCol, 3.0)) * 9.0));
    float bwRain = smoothstep(0.5, 0.88, bwS) * (0.4 + 0.6 * bwNoise(vec2(bwH * 1.3 + 7.0, bwP.y * 0.5))) * bwVert;
    diffuseColor.rgb *= 1.0 - bwRain * 0.55 * bwAmt.x * bwAge;
    // 煤：広い斑で暗く、少し茶に
    float bwSoot = smoothstep(0.55, 0.88, bwNoise(vec2(bwH, bwP.y) * 0.42 + bwCell * 3.1)) * bwAmt.z * bwAge;
    diffuseColor.rgb *= 1.0 - bwSoot * vec3(0.38, 0.4, 0.42);
    // 苔：上を向く面（屋根・笠木・石の天端）ほど、湿った斑に緑
    float bwM = bwNoise(bwP.xz * 0.9 + bwP.y * 0.4) * 0.65 + bwNoise(bwP.xz * 4.3 - bwP.y * 2.1) * 0.35;
    float bwLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float bwMoss = smoothstep(0.5, 0.78, bwM) * (0.2 + 0.8 * bwUp) * bwAmt.y * bwAge;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.18, 0.07) * (0.55 + bwLum * 2.2), bwMoss * 0.6);
    // 壁の色の斑：乾いて白んだ所と湿って暗い所（一色の平らな壁にしない）
    float bwMo = bwNoise(vec2(bwH, bwP.y) * 0.8 + bwCell * 1.7) * 0.7 + bwNoise(vec2(bwH, bwP.y) * 3.1) * 0.3;
    diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.7, 0.69, 0.72), vec3(1.14, 1.09, 0.99), bwMo), bwMore.x * bwVert);
    // 板一枚ずつ（約24cm）の色：焼け・灰がかり・新しい差し板
    float bwPk = bwHash(vec2(floor(bwH * 4.2), bwCell.x * 7.0 + bwCell.y));
    diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.8, 0.79, 0.78), vec3(1.12, 1.07, 1.0), bwPk), bwMore.y * bwVert);
    // 茅の筋：流れに沿って細い濃淡（切り絵のような一様な面にしない）。束の境は深く
    float bwSt = bwNoise(vec2(bwH * 9.0, bwP.y * 0.9)) * 0.6 + bwNoise(vec2(bwH * 23.0, bwP.y * 2.0)) * 0.4;
    diffuseColor.rgb *= 1.0 - bwMore.w * (0.34 * (1.0 - bwSt) - 0.08);
    // 下を向く面（軒裏・梁の下・床下）は空の光が届かず暗い
    float bwDn = gl_FrontFacing ? bwN.y : -bwN.y;
    diffuseColor.rgb *= 1.0 - 0.42 * smoothstep(0.2, 0.75, -bwDn);
    // 足元の泥はね（地面との接ぎ目）と、軒の下の陰。置いた家の中の高さで決める
    float bwFoot = (1.0 - smoothstep(0.0, 0.3 + 0.45 * bwMo, vBwLy)) * step(-2.0, vBwLy) * bwVert;
    diffuseColor.rgb *= 1.0 - bwFoot * bwMore.z * vec3(0.5, 0.54, 0.6);
    float bwEave = smoothstep(1.4, 2.3, vBwLy) * (1.0 - smoothstep(2.6, 2.9, vBwLy)) * bwVert;
    diffuseColor.rgb *= 1.0 - bwEave * bwMore.z * 0.4;
  }`;

// 材質に古びを足す（今ある onBeforeCompile の後に重ねる）。同じ材質に二度は掛けない。
export function weatherMat(mat, kind) {
  if (!mat || !KIND[kind] || mat.userData.bwKind) return mat;
  mat.userData.bwKind = kind;
  if (kind === 'thatch' && mat.map) upgradeThatch(mat.map);
  const U = kindUniforms(kind), photoOn = !!U.bwPhoto, tile = kind === 'tile' && !!mat.map;
  // 写真の肌の束：uv で写す物（瓦）は絵（map）のある材質だけ。無ければ世界の三方向で写す
  const pack = !!U.bwPack, packUv = pack && KIND[kind].pk[3] === 1 && !!mat.map;
  const before = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  // 元の鍵が既定（onBeforeCompile の文）なら、差し替える前の文で鍵を作る（別の下ごしらえの材質と描き方を混ぜない）
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  mat.onBeforeCompile = function (sh, r) {
    before.call(this, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    sh.fragmentShader = (photoOn ? '#define BW_PHOTO\n' : '') + (tile ? '#define BW_TILE\n' : '') + (pack ? '#define BW_PACK\n' : '') + (packUv ? '#define BW_PACK_UV\n' : '') + FRAG_HEAD
      + sh.fragmentShader.replace('#include <color_fragment>', FRAG_BODY);
  };
  mat.customProgramCacheKey = function () { return base.call(this) + '|bw-' + kind; };
  mat.needsUpdate = true;
  return mat;
}
