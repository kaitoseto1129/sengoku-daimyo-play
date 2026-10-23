// 人の処理：馬の毛と材質。外部向けの入口は humans.js。
import * as THREE from 'three';
import { HR, braidedCordMap } from './humans_horse_model.js';
import { GRIME } from './humans_materials.js';
import { WET } from './world.js';


// ---- 材質 ----
const _lin = (hex) => new THREE.Color(hex);
// 馬の材質の道具：値の揺らぎ・丸み（凸は +、凹は -）・毛の向きの照り（Kajiya-Kay）
const HORSE_GLSL = `
float hHb(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hVn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHb(i), hHb(i + vec3(1,0,0)), f.x), mix(hHb(i + vec3(0,1,0)), hHb(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hHb(i + vec3(0,0,1)), hHb(i + vec3(1,0,1)), f.x), mix(hHb(i + vec3(0,1,1)), hHb(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float hCurv(vec3 n, vec3 vp) {
  vec3 dx = dFdx(vp), dy = dFdy(vp);
  return dot(dFdx(n), dx) / max(dot(dx, dx), 1e-10) + dot(dFdy(n), dy) / max(dot(dy, dy), 1e-10);
}
float hStrand(vec3 T, vec3 L, vec3 V, float p) { vec3 H = normalize(L + V); float t = dot(T, H); return pow(sqrt(max(0.0, 1.0 - t * t)), p); }
`;
// 形の座標 → 馬の根元の座標（形ごと）と、その逆
function rootU(k) {
  const M = HR.toRoot[k] || new THREE.Matrix4();
  return { uToRoot: { value: M }, uFromRoot: { value: M.clone().invert() } };
}
// 日の光の毛の照り（lights_fragment_end の後に足す。T は画面の座標の毛の向き）
const sheenGlsl = (T, amt) => `
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 hT = normalize(${T} - normal * dot(normal, ${T}));
        vec3 hV = normalize(vViewPosition);
        float hnl = smoothstep(0.0, 0.3, dot(normal, directLight.direction));
        // 一つ目は毛の表の白い照り、二つ目は毛の中を通った色の付いた照り（少しずらす）
        float s1 = hStrand(hT, directLight.direction, hV, 110.0), s2 = hStrand(normalize(hT + normal * 0.25), directLight.direction, hV, 22.0);
        reflectedLight.directSpecular += directLight.color * hnl * (s1 * 0.045 * vec3(1.0) + s2 * 0.05 * min(diffuseColor.rgb * 2.2 + 0.05, vec3(1.0))) * (${amt});
      }
      #endif`;
function horseMaterials(st) {
  const pts = st.points ?? 0;
  const k = [st.coat, st.mane, pts, st.tack].join('|');
  if (HR.mats.has(k)) return HR.mats.get(k);
  const T = HR.tex;
  // 体：色の絵は明るさだけ（毛の基準が 0.5）。毛色を掛ける。鹿毛は脚先を黒く、どの毛色も鼻づらは暗い肌
  const coat = _lin(st.coat), mane = _lin(st.mane);
  const body = new THREE.MeshStandardMaterial({ map: T.horse_col, normalMap: T.horse_nrm, normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.65, metalness: 0 });
  body.color.copy(coat).multiplyScalar(0.85);
  // 毛色から腹の淡さを決める。葦毛にも粒状の斑は足さない。
  const hsl = new THREE.Color(st.coat).getHSL({}), grey = hsl.s < 0.14 && hsl.l > 0.3;
  const fx = new THREE.Vector4(pts >= 1 ? 0.8 : grey ? 0 : 0.35, grey ? 1 : 0, grey ? 0 : hsl.l > 0.12 ? 0.8 : 0.3, hsl.l < 0.1 ? 1 : 0.4);
  const U = { uPR: { value: new THREE.Vector3(mane.r / Math.max(0.002, coat.r), mane.g / Math.max(0.002, coat.g), mane.b / Math.max(0.002, coat.b)).clampScalar(0, 1.5) }, uPts: { value: pts }, uFx: { value: fx }, uGrime: GRIME, uWet: WET, ...rootU('body') };
  body.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    // vRP：馬の根元の座標（m）。vHT：毛の流れる向き（画面の座標。体は後ろへ、首は下へ、脚は下へ）
    sh.vertexShader = 'uniform mat4 uToRoot, uFromRoot;\nvarying vec3 vHP, vRP, vHT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vHP = position; vRP = (uToRoot * vec4(position, 1.0)).xyz;
      {
        vec3 d = mix(vec3(0.0, -0.3, -1.0), vec3(0.0, -1.0, -0.35), smoothstep(0.45, 0.75, vRP.z));
        d = mix(d, vec3(0.0, -1.0, 0.0), smoothstep(0.82, 0.62, vRP.y));
        vec3 hT = mat3(uFromRoot) * d;
        #ifdef USE_SKINNING
          hT = (skinMatrix * vec4(hT, 0.0)).xyz;
        #endif
        vHT = normalize(normalMatrix * hT);
      }`);
    sh.fragmentShader = 'uniform vec3 uPR;\nuniform vec4 uFx;\nuniform float uPts, uGrime, uWet;\nvarying vec3 vHP, vRP, vHT;\nfloat hWet, hMud, hDust;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
      {
        // 元の絵の強い白黒を抑え、広い濃淡だけで毛色と筋肉の丸みを見せる。
        vec3 r = vRP;
        vec4 texel = texture2D(map, vMapUv);
        float shade = clamp(dot(texel.rgb, vec3(0.3, 0.59, 0.11)) / 0.214, 0.8, 1.15);
        diffuseColor.rgb = diffuse * shade;
        float legs = (1.0 - smoothstep(0.24, 0.55, r.y)) * clamp(uPts, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), uPR, legs);
        diffuseColor.rgb *= 1.0 - smoothstep(1.15, 1.3, r.y) * 0.1;
        diffuseColor.rgb *= 1.0 - smoothstep(1.65, 1.82, r.z) * 0.3;
        float flank = (1.0 - smoothstep(0.95, 1.18, r.y)) * smoothstep(0.65, 0.9, r.y);
        diffuseColor.rgb *= 1.0 + flank * uFx.z * 0.12;
        // 汚れは脚先に薄く広げる。胸の白い泡・塩・細かな泥の点は描かない。
        hMud = (1.0 - smoothstep(0.08, 0.42, r.y)) * (0.25 + uGrime * 0.25);
        hDust = (1.0 - smoothstep(0.35, 0.8, r.y)) * uGrime * 0.12 * (1.0 - uWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.058, 0.04), hMud);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.13), hDust);
        hWet = max(uWet * 0.65, (1.0 - smoothstep(0.24, 0.4, abs(r.z))) * smoothstep(0.9, 1.05, r.y) * uGrime * 0.3);
        diffuseColor.rgb *= 1.0 - hWet * 0.12;
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.46, hWet);
        roughnessFactor = mix(roughnessFactor, 0.88, max(hMud, hDust));`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + sheenGlsl('vHT', '0.6 * (1.0 - hMud)'));
  };
  body.customProgramCacheKey = () => 'horsebody5';
  // 連続した束の面に、縦の柔らかな筋を付ける。透明な粒で穴を開けない。
  const hair = new THREE.MeshStandardMaterial({ color: mane, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  hair.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec2 vHairUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHairUv = uv;');
    sh.fragmentShader = 'uniform float uWet;\nvarying vec2 vHairUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      // 毛の筋：房の幅の中に太さの違う筋を重ね、根元は暗く、毛先は日に焼けて少し明るい。遠くでは筋を均す（ちらつかせない）
      float fade = 1.0 - smoothstep(0.15, 0.5, fwidth(vHairUv.x) * 9.0);
      float hx = vHairUv.x;
      float strand = 0.55 * cos(hx * 37.7 + sin(vHairUv.y * 5.0) * 1.3) + 0.3 * cos(hx * 88.0 + 1.7) + 0.15 * cos(hx * 151.0 + vHairUv.y * 3.0);
      diffuseColor.rgb *= 1.0 + 0.2 * strand * fade;
      diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.3, vHairUv.y)) * (1.0 + 0.14 * smoothstep(0.6, 1.0, vHairUv.y));
      // 房の縁は薄く暗い（板の縁を見せない）
      diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.0, 0.25, min(hx, 1.0 - hx));
      diffuseColor.rgb *= 1.0 - uWet * 0.15;`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 毛の照り（Kajiya-Kay）：毛の向きは絵の縦（uv の v）の向き
        vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
        vec2 dux = dFdx(vHairUv), duy = dFdy(vHairUv);
        vec3 hT = normalize(dpx * duy.x - dpy * dux.x + 1e-6);
        hT = normalize(hT - normal * dot(normal, hT));
        vec3 hV = normalize(vViewPosition);
        float s1 = hStrandH(hT, directLight.direction, hV, 80.0), s2 = hStrandH(normalize(hT + normal * 0.3), directLight.direction, hV, 14.0);
        reflectedLight.directSpecular += directLight.color * (s1 * 0.06 + s2 * 0.05 * min(diffuseColor.rgb * 3.0 + 0.04, vec3(1.0))) * smoothstep(-0.2, 0.3, dot(normal, directLight.direction)) * fade;
      }
      #endif`);
    sh.fragmentShader = 'float hStrandH(vec3 T, vec3 L, vec3 V, float p) { vec3 H = normalize(L + V); float t = dot(T, H); return pow(sqrt(max(0.0, 1.0 - t * t)), p); }\n' + sh.fragmentShader;
  };
  hair.customProgramCacheKey = () => 'horsehair6';
  // 蹄：角質の暗い灰茶に、上から下へ伸びる成長の筋。蹄冠は毛の際で暗く、下は泥が固まる（日本の馬は蹄鉄を打たない）
  const shoe = new THREE.MeshStandardMaterial({ map: T.shoe_col, roughness: 0.62, color: 0x6a625a });
  const SU = { uGrime: GRIME, uWet: WET, ...rootU('shoe') };
  shoe.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = 'uniform mat4 uToRoot;\nvarying vec3 vRP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRP = (uToRoot * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec3 vRP;\nfloat hMud;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 r = vRP;
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float grow = hVn(vec3(r.x * 500.0, r.y * 18.0, r.z * 500.0)) * 0.6 + hVn(vec3(r.x * 1400.0, r.y * 40.0, r.z * 1400.0)) * 0.4;
        vec3 horn = vec3(0.085, 0.074, 0.062) * (0.75 + lum * 0.9) * (0.78 + grow * 0.44);
        // 蹄冠：上の縁は毛の際で暗く
        horn *= 1.0 - smoothstep(0.1, 0.13, r.y) * 0.4;
        diffuseColor.rgb = horn;
        // 下の縁の欠けと、固まった泥
        hMud = smoothstep(0.05, 0.0, r.y) * (0.5 + 0.5 * hVn(r * 120.0)) + smoothstep(0.82, 0.92, hVn(r * 200.0)) * 0.6;
        hMud = clamp(hMud * (0.5 + 0.5 * uGrime) + smoothstep(0.035, 0.0, r.y) * 0.4, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.07, 0.05), hMud * 0.85);
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.5, 0.95, hMud) * (1.0 - uWet * 0.4);`);
  };
  shoe.customProgramCacheKey = () => 'horsehoof';
  const eye = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08, metalness: 0 });
  // 面繋と手綱は同じ組紐の色と織り目。
  const bridle = ropeMat(st.tack);
  const m = { body, hair, shoe, eye, bridle };
  HR.mats.set(k, m);
  return m;
}
const ropeMats = new Map();
function ropeMat(hex) { if (!ropeMats.has(hex)) ropeMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, map: braidedCordMap(), roughness: 0.8 })); return ropeMats.get(hex); }

export { _lin, HORSE_GLSL, sheenGlsl, horseMaterials, ropeMats, ropeMat };
