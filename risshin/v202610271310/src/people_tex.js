import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';

// 近くの人の細かな凹凸と色むら（肌の毛穴・麻の織り目・組紐の目）。画像生成で作った写真の模様（assets/tex、tools/tex_pack.mjs）。
// 明るさの細かな揺れだけを取り出し、一枚の絵の三つの色に詰める：赤＝肌、緑＝麻、青＝組紐。0.5 が平ら。
// 絵は一枚を全員で使い回す（材質ごとに作らない）。読み終わるまでは平ら（0.5）で、形も色も変わらない。
export const PEOPLE_DET = { value: null };
// 本物の毛引威の写真（kebiki_cc0：赤＝明るさ、緑＝糸の所。三段で一枚、横はつながる）。胴丸のスキャンの黒漆の胴を、その人の威の色の毛引に描き替える（humans_armor.js）
export const KEBIKI_PH = { tex: { value: null }, on: { value: 0 } };
let started = false;
let ready = Promise.resolve();
export function loadPeopleDetail() { peopleDetail(); return ready; }
export function peopleDetail() {
  if (started) return PEOPLE_DET.value;
  started = true;
  const N = 512;
  const data = new Uint8Array(N * N * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  PEOPLE_DET.value = tex;
  ready = import('./asset_reader.js').then(({ readAsset }) => readAsset('tex_people', 'images')).then(async ({ default: imgs }) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    const L = new Float32Array(N * N), B = new Float32Array(N * N), T = new Float32Array(N * N);
    // 箱ぼかし（端はつながる）。大きな明暗（写した時の光のむら）を除き、細かな凹凸だけを残すため
    const blur = (src, dst, r) => {
      for (let y = 0; y < N; y++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * N + ((k + N) % N)]; for (let x = 0; x < N; x++) { T[y * N + x] = s / (2 * r + 1); s += src[y * N + ((x + r + 1) % N)] - src[y * N + ((x - r + N) % N)]; } }
      for (let x = 0; x < N; x++) { let s = 0; for (let k = -r; k <= r; k++) s += T[((k + N) % N) * N + x]; for (let y = 0; y < N; y++) { dst[y * N + x] = s / (2 * r + 1); s += T[((y + r + 1) % N) * N + x] - T[((y - r + N) % N) * N + x]; } }
    };
    const ch = { skin: 0, asa: 1, odoshi: 2 };
    for (const [name, k] of Object.entries(ch)) {
      const im = new Image();
      const address = URL.createObjectURL(imgs[name]);
      im.src = address;
      try { await im.decode(); } finally { URL.revokeObjectURL(address); }
      g.drawImage(im, 0, 0, N, N);
      im.src = "";
      const d = g.getImageData(0, 0, N, N).data;
      for (let i = 0; i < N * N; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      blur(L, B, Math.max(4, N >> 5));
      let v2 = 0; for (let i = 0; i < N * N; i++) { L[i] -= B[i]; v2 += L[i] * L[i]; }
      const sd = Math.sqrt(v2 / (N * N)) || 1;
      for (let i = 0; i < N * N; i++) data[i * 4 + k] = Math.max(0, Math.min(255, 128 + (L[i] / sd) * 36));
    }
    tex.needsUpdate = true;
    // 小札の写真を兵の模様の絵（毛引・素懸の段）へ重ねる
    const kz = new Image(), address = URL.createObjectURL(imgs.kozane); kz.src = address;
    try { await kz.decode(); } finally { URL.revokeObjectURL(address); }
    // 毛引・素懸の段は美術館の本物の具足の写真（CC0）から（docs/CREDITS.md）
    const photo = async (blob) => {
      if (!blob || window.__kbOff) return null;
      const im = new Image(), ad = URL.createObjectURL(blob); im.src = ad;
      try { await im.decode(); } finally { URL.revokeObjectURL(ad); }
      return im;
    };
    const kb = await photo(imgs.kebiki_cc0), sb = await photo(imgs.sugake_cc0);
    (await import('./units_model.js')).patchKozane(kz, kb, sb);
    if (kb) {
      const c3 = document.createElement('canvas'); c3.width = 512; c3.height = 384;
      const g3 = c3.getContext('2d', { willReadFrequently: true }); g3.drawImage(kb, 0, 0, 512, 384);
      const src3 = g3.getImageData(0, 0, 512, 384).data, px = new Uint8Array(512 * 192 * 4);
      for (let i = 0; i < 512 * 192; i++) { px[i * 4] = src3[i * 4]; px[i * 4 + 1] = src3[(i + 512 * 192) * 4]; px[i * 4 + 3] = 255; }
      const t3 = new THREE.DataTexture(px, 512, 192, THREE.RGBAFormat);
      t3.wrapS = t3.wrapT = THREE.RepeatWrapping; t3.colorSpace = THREE.NoColorSpace;
      t3.magFilter = THREE.LinearFilter; t3.minFilter = THREE.LinearMipmapLinearFilter; t3.generateMipmaps = true; t3.anisotropy = 4;
      // 絵の上の行が段の頭。下から上へ読む向き（flipY なし）なので、上下を返して置く
      const row = 512 * 4, tmp = new Uint8Array(row);
      for (let y = 0; y < 96; y++) { const a = y * row, b = (191 - y) * row; tmp.set(px.subarray(a, a + row)); px.copyWithin(a, b, b + row); px.set(tmp, b); }
      t3.needsUpdate = true;
      KEBIKI_PH.tex.value = t3; KEBIKI_PH.on.value = 1;
    }
    for (const im of [kz, kb, sb]) if (im) im.src = "";
  }).catch(() => {});
  return tex;
}
// 三方向から投影して貼る（形に絵の座標が無くても、体の座標で貼れる）。p は体の座標（m）、n は体の向き
export const PEOPLE_GLSL = `
vec3 pdTri(sampler2D t, vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
}
// 高さ h の画面上の変わりから法線を傾ける（three.js の bump と同じ式）
vec3 pdBump(vec3 surf, vec3 nrm, float h, float fd) {
  vec3 sX = dFdx(surf), sY = dFdy(surf);
  vec3 r1 = cross(sY, nrm), r2 = cross(nrm, sX);
  float det = dot(sX, r1) * fd;
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - g);
}
`;
