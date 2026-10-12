import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';

// 近くの人の細かな凹凸と色むら（肌の毛穴・麻の織り目・組紐の目）。画像生成で作った写真の模様（assets/tex、tools/tex_pack.mjs）。
// 明るさの細かな揺れだけを取り出し、一枚の絵の三つの色に詰める：赤＝肌、緑＝麻、青＝組紐。0.5 が平ら。
// 絵は一枚を全員で使い回す（材質ごとに作らない）。読み終わるまでは平ら（0.5）で、形も色も変わらない。
export const PEOPLE_DET = { value: null };
let started = false;
export function peopleDetail() {
  if (started) return PEOPLE_DET.value;
  started = true;
  const N = SETTINGS.quality === 'low' ? 256 : 512;
  const data = new Uint8Array(N * N * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = SETTINGS.quality === 'low' ? 1 : 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  PEOPLE_DET.value = tex;
  import('./asset_tex_people.js').then(async ({ default: imgs }) => {
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
      im.src = imgs[name];
      await im.decode();
      g.drawImage(im, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      for (let i = 0; i < N * N; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      blur(L, B, Math.max(4, N >> 5));
      let v2 = 0; for (let i = 0; i < N * N; i++) { L[i] -= B[i]; v2 += L[i] * L[i]; }
      const sd = Math.sqrt(v2 / (N * N)) || 1;
      for (let i = 0; i < N * N; i++) data[i * 4 + k] = Math.max(0, Math.min(255, 128 + (L[i] / sd) * 36));
    }
    tex.needsUpdate = true;
    // 小札の写真を兵の模様の絵（毛引・素懸の段）へ重ねる
    const kz = new Image(); kz.src = imgs.kozane; await kz.decode();
    (await import('./units_model.js')).patchKozane(kz);
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
