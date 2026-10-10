import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { flagTexture, jinmakuTexture, yoseFlagTexture, yoseFlagKinds } from './textures.js';
import { grassTex, dirtTex, mudTex, stoneTex, macroTex, barkTex, leafTex, thatchTex, alphaTex } from './nature.js';
import { POST } from './post.js';
import { setScene } from './audio.js';
import { fieldState } from './world_fields.js';
import { jinkeiSlot } from './jinkei.js';
import { BattleTime } from './battle_time.js';
import { smokeDepth } from './wind_smoke.js';
import { groundAt } from './floors.js';

// 地形・植生・天候・時間帯
export const HALF = 180;
const SEG = 144;
const NO_STREAMS = [];
// 旗の模様を保った薄い月の照り返し。霧と色の仕上げは通常どおり通す。
export const FLAG_MOON = { value: 0 };
export function flagMoonlight(sh, night = FLAG_MOON) {
  sh.uniforms.uFlagMoon = night;
  sh.fragmentShader = 'uniform float uFlagMoon;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    'outgoingLight += diffuseColor.rgb * vec3(0.55, 0.7, 0.95) * uFlagMoon * 0.08;\n#include <opaque_fragment>');
}
const TUFT_AUTUMN = new THREE.Color(0.5, 0.44, 0.27);   // 秋の草むらの枯れ色

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function distToPolyline(x, z, pts) {
  pts = pts && (pts.pts || pts);
  if (!pts || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

// 浅瀬は遊び用の復元。川床を上げ、水面はほかの流れと同じ高さに保つ。
function fordLift(st, x) {
  if (!st.fords) return 0;
  let k = 0;
  for (const f of st.fords) k = Math.max(k, Math.max(0, Math.min(1, (f.w - Math.abs(x - f.x)) / 4)));
  return Math.max(0, st.depth - 0.35) * k;
}

// 時間と天気の見え方。vis は見通し（霞がおよそ八割五分になる距離）、cloud は雲の影の濃さ、top は天頂の色
// morning は「朝」の戦（def.mood が 'morning' か、朝靄の戦）で day の代わりに使う
const TIME = {
  day: { sky: 0xb9c9ce, fog: 0xb6c4c6, sun: 0xfff0d8, sunI: 2.1, hemiSky: 0xbfccd6, hemiGround: 0x4a4432, hemiI: 1.0, sunPos: [70, 72, -50], vis: 680, cloud: 0.5, top: 0x527fa9, cover: 0.4, glowK: 0 },
  morning: { sky: 0xc9bdad, fog: 0xbdb9af, sun: 0xffdcaa, sunI: 2.2, hemiSky: 0xb5c5d5, hemiGround: 0x4a4232, hemiI: 1.1, sunPos: [70, 27, 85], vis: 540, cloud: 0.4, top: 0x718aa7, cover: 0.34, glowK: 0.3, glow: 0xffc39a },
  // 雨は昼の雨（鉛色の雲でも空は明るい灰）。暗い灰の霧と弱い散乱光で、近くの兵まで黒い影になっていた（10/9）
  storm: { sky: 0x8c9496, fog: 0x9ca4a6, sun: 0xd8dcd8, sunI: 1.1, hemiSky: 0xc4cac8, hemiGround: 0x76705f, hemiI: 2.0, sunPos: [30, 120, 20], vis: 200, cloud: 0, top: 0x6a7477, cover: 0.85, glowK: 0 },
  after: { sky: 0x9aa7a8, fog: 0x98a2a0, sun: 0xffe8c8, sunI: 1.7, hemiSky: 0xb3bfc2, hemiGround: 0x423d2e, hemiI: 1.05, sunPos: [-70, 58, 30], vis: 440, cloud: 0.45, top: 0x6b7f92, cover: 0.55, glowK: 0.1, glow: 0xffc890 },
  // 夜：月明かり（青白く弱い光・影は淡く）。見通しは短く、闇の向こうは黒い霞に沈む（その中に敵がいるかもしれない）
  night: { sky: 0x253048, fog: 0x2a3446, sun: 0x9bacce, sunI: 0.32, hemiSky: 0x6a7ca0, hemiGround: 0x34363c, hemiI: 0.22, sunPos: [-60, 70, 40], vis: 145, cloud: 0.3, top: 0x0a1120, cover: 0.3, glowK: 0 },
  dusk: { sky: 0xb29588, fog: 0x9e8c85, sun: 0xffa060, sunI: 1.5, hemiSky: 0x76849e, hemiGround: 0x33302c, hemiI: 0.8, sunPos: [-120, 17, -24], vis: 470, cloud: 0.25, top: 0x596783, cover: 0.45, glowK: 0.62, glow: 0xff996d },
};
// 夕暮れ：日の当たる面だけ朱に、陰は空の青を受けて冷たく（半球光を青に寄せる）
// 日なたと日陰の差：空の映り込み（scene.environment）が日陰を明るくするので、半球光はその分だけ控え、日差しを少し強める
// （半球光と空の映り込みを両方まともに足すと、日陰が日なたの半分ほどの明るさになり、影の薄い平らな絵になる）
const LIGHT_K = { sun: 1.18, hemi: 0.42 };
// 戦の定義に mood が無いときの仮の割り当て（設楽原は夜明けから始まった戦なので朝の光）
const MOOD_BY_SEED = { 57: 'morning' };

// ---------------- 空気の遠近と雲の影（全ての材質に効く） ----------------
// 霧：距離で指数的に霞み、低い所ほど濃く（谷の靄）、太陽の方は日の色に明るむ
// 雲の影：流れる雲の下では日差しだけが弱まる（兵・木・地面すべて）
// scene.fog の near と far に値を詰めて渡す（全ての材質に新しい値を配る口が他に無いため）
//   fog.near ＝ 雲の流れた距離、fog.far ＝ 見通し（整数部）＋ 雲の影の濃さ（小数部）
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogOff;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogOff = transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor;
 varying float vFogDepth;
 varying vec3 vFogOff;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear;
  uniform float fogFar;
  float cloudH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cloudN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cloudH(i), cloudH(i + vec2(1.0, 0.0)), f.x), mix(cloudH(i + vec2(0.0, 1.0)), cloudH(i + vec2(1.0, 1.0)), f.x), f.y); }
  // 雲の影（1 ＝ 日なた）。雲は風下へ流れる（硝煙と同じ向き）
  float cloudShade(vec3 wp) {
   float s = fract(fogFar);
   if (s < 0.01) return 1.0;
   vec2 q = (wp.xz - vec2(0.565, 0.825) * fogNear) * 0.0065;
   float n = cloudN(q) * 0.62 + cloudN(q * 2.7 + 7.3) * 0.38;
   return 1.0 - s * smoothstep(0.52, 0.66, n);
  }
 #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
 #else
  float fogD = length(vFogOff);
  float fogVis = max(20.0, floor(fogFar));
  // 低い所ほど濃い（自分より下の谷は霞み、梢や峰は抜ける）
  float fogHf = exp(-clamp(vFogOff.y, -30.0, 120.0) * 0.024);
  float fogFactor = 1.0 - exp(-fogD / fogVis * 1.9 * fogHf);
  // 手前（十数 m まで）はくっきり。霞は奥から効く
  fogFactor *= mix(0.3, 1.0, smoothstep(3.0, 28.0, fogD));
  vec3 fogC = fogColor;
  #if defined(LIT_PARS) && NUM_DIR_LIGHTS > 0
   // 日の方角の霞は、日の色に明るむ
   vec3 fogSun = normalize(transpose(mat3(viewMatrix)) * directionalLights[0].direction);
   float fogSd = max(dot(vFogOff / max(fogD, 0.001), fogSun), 0.0);
   // 日の方は明るむ（強い輪と、広く淡い明るみの二つ。逆光の霞が光る）
   fogC += directionalLights[0].color * (pow(fogSd, 6.0) * 0.09 + pow(fogSd, 2.0) * 0.03);
  #endif
  // 遠いほど空の青を帯びる（遠くの森や村が青く霞む）
  fogC = mix(fogC, fogC * vec3(0.9, 0.97, 1.08), smoothstep(60.0, 380.0, fogD));
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
 #endif
#endif`;
THREE.ShaderChunk.lights_pars_begin = '#define LIT_PARS 1\n' + THREE.ShaderChunk.lights_pars_begin;
// 画質「低」（画面の仕上げが無い時）でも、色の作りだけは残す：家の赤は残して他は少し褪せ、影は青緑・明るい所は暖かく、黒を少し浮かす
// 画面へ直に描く時だけ効く（「中」「高」は描く先が絵なので three がトーンマップを付けず、ここは通らない。仕上げは post.js）
THREE.ShaderChunk.tonemapping_fragment = `#if defined( TONE_MAPPING )
 gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
 {
  vec3 gc = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
  float gred = smoothstep(0.01, 0.08, gc.r - max(gc.g, gc.b)) * smoothstep(0.02, 0.1, gc.r);
  gc = mix(vec3(gl), gc, mix(0.8, 1.05, gred));
  // 草木の緑は黄みへ寄せてくすませる（「中」以上の仕上げと同じ向き。薄荷色の草にしない）
  float ggr = clamp((gc.g - max(gc.r, gc.b)) * 6.0, 0.0, 1.0);
  gc.r += (gc.g - gc.r) * 0.2 * ggr; gc.b -= gc.b * 0.12 * ggr;
  gc *= mix(vec3(0.93, 0.99, 1.03), vec3(1.04, 1.0, 0.94), smoothstep(0.02, 0.4, gl));
  // ゆるい S 字の階調（締まった影と、丸めた明るみ）
  gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), 0.25);
  gl_FragColor.rgb = gc * 0.96 + vec3(0.008, 0.0085, 0.01);
 }
#endif`;
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  `getDirectionalLightInfo( directionalLight, directLight );
  #if defined(USE_FOG) && !defined(FOG_EXP2)
   directLight.color *= cloudShade(cameraPosition + vFogOff);
  #endif`);

// 霞の量（霧の式と同じ。遠景の山など、霧を使わない物の色合わせに使う）
export function hazeAt(dist, vis, dy = 0) {
  const hf = Math.exp(-Math.max(-30, Math.min(120, dy)) * 0.024);
  return 1 - Math.exp(-dist / Math.max(20, vis) * 1.9 * hf);
}

// 風：向きはそろえ、強さはときどき変わる（突風が野を渡る）。旗や草が同じ風を使う
export const WIND_STATE = { t: 0, gust: 1, dirX: 0.565, dirZ: 0.825 };
export const GUST = { value: 1 };
export const WIND_DIR = { value: new THREE.Vector2(0.565, 0.825) };
// 濡れ具合（0〜1）：雨の中の旗は色が濃く、重く垂れる
export const WET = { value: 0 };
const BOLT_COL = new THREE.Color(0xc8d6ff);
let SHADE_GEO = null;
const PALL_COL = new THREE.Color(0x9a7c5e);
const SUN_AXIS = new THREE.Vector3(0, 1, 0);

// 風で揺れる草木（頂点をずらす）
// 突風は風下へ波のように野を渡る。草は風下へ傾き、踏み荒らされた所では倒れている
const WIND = { value: 0 };
const WEAR = { value: null };
const WEAR_HALF = { value: HALF };
// 炎：一枚の板に、上へ流れる揺らぎ（値の雑音）で舌のような炎を描く。板はいつもカメラへ向く（縦は立てたまま）
//   材質と形は全ての火で一つ（毎コマ new しない）。火ごとの違いは置き場所から作る種で出す
const FLAME_U = { uNight: { value: 0 }, uT: { value: 0 }, uWind: { value: new THREE.Vector2() }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 600 } };
let FLAME_MAT = null, FLAME_GEO = null;
function flameMat() {
  if (FLAME_MAT) return FLAME_MAT;
  FLAME_GEO = new THREE.PlaneGeometry(1, 1);
  FLAME_MAT = new THREE.ShaderMaterial({
    uniforms: FLAME_U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    vertexShader: `uniform vec2 uWind; varying vec2 vUv; varying float vSeed; varying float vDist;
      void main() {
        vUv = uv;
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
        vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
        vSeed = fract(sin(dot(c.xz, vec2(12.9898, 78.233)) + sx * 3.7) * 43758.5453);
        float h = position.y + 0.5;
        vec3 wp = c + r * position.x * sx + vec3(0.0, position.y * sy, 0.0) + vec3(uWind.x, 0.0, uWind.y) * h * h * sy * 0.22;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uT; uniform float uNight; uniform float fogFar; varying vec2 vUv; varying float vSeed; varying float vDist;
      float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 uv = vUv;
        float t = uT * (0.9 + vSeed * 0.35) + vSeed * 31.0;
        vec2 q = vec2(uv.x * 3.2 + vSeed * 7.0, uv.y * 2.3 - t * 1.9);
        float n = vn(q) * 0.55 + vn(q * 2.1 + vec2(0.0, -t * 1.4)) * 0.3 + vn(q * 4.4 - vec2(t * 0.4, t * 2.6)) * 0.15;
        // 上ほど大きく横へ揺れ、細く尖る
        float x = uv.x - 0.5 + (n - 0.5) * 0.34 * uv.y + sin(t * 2.3 + uv.y * 4.0) * 0.03 * uv.y;
        float w = mix(0.44, 0.05, pow(uv.y, 0.8));
        float body = 1.0 - smoothstep(w * 0.45, w, abs(x));
        float top = 1.0 - smoothstep(0.3, 0.95, uv.y + (n - 0.5) * 0.6);
        float f = clamp(body * top * smoothstep(0.0, 0.1, uv.y) * 1.7 - 0.2 + (n - 0.5) * 0.45, 0.0, 1.0);
        // 外は暗い赤、中は橙、根元の芯は黄白
        float core = smoothstep(0.6, 1.0, f) * (1.0 - smoothstep(0.15, 0.55, uv.y));
        vec3 col = mix(vec3(0.5, 0.08, 0.01), vec3(1.0, 0.42, 0.07), smoothstep(0.05, 0.55, f));
        col = mix(col, vec3(1.0, 0.85, 0.5), core);
        // 遠い火は霞に沈む（加算なので、薄めるだけ）
        float reach = mix(max(20.0, floor(fogFar)), max(260.0, floor(fogFar)), uNight);
        float a = f * exp(-vDist / reach * 1.1);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col * 1.35, a);
      }`,
  });
  return FLAME_MAT;
}
// 遠景の大軍の、待つ間の小さな動き（体の揺れ・見回し・隊の中の入れ替わり）の強さ。見比べる時は 0 に
export const ARMY_IDLE = { value: 1 };
// 数の多い草木・岩の材質：画質「低」「中」は影の計算が軽い Lambert にする（GPU の陰影計算を節約）。
// 「高」は今まで通り Standard（艶・環境の映り込みを保つ）。Lambert が持たない値は渡さない
function liteMat(opts) {
  if (SETTINGS.quality === 'high') return new THREE.MeshStandardMaterial(opts);
  const { roughness, metalness, envMapIntensity, clearcoat, clearcoatRoughness, ...rest } = opts;
  return new THREE.MeshLambertMaterial(rest);
}
function sway(mat, amp, minY = 0, o = {}) {
  // 揺れの強さ・後の直し（草・葉・苗）ごとに別の絵の作りにする。無いと three は同じ関数の字面で作りを使い回し、
  // 先に作られた物（低木の葉の作り）を草の株に当てて、画質「低」で草むらが黒い塊に見えた
  const key = `sway|${amp}|${minY}|${o.wear ? 1 : 0}|${o.after ? o.after.toString() : ''}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.uniforms.uGust = GUST;
    sh.uniforms.uWindDir = WIND_DIR;
    if (o.wear) { sh.uniforms.tWear = WEAR; sh.uniforms.uWearHalf = WEAR_HALF; }
    sh.vertexShader = `uniform float uWind, uGust; uniform vec2 uWindDir;\n${o.wear ? 'uniform sampler2D tWear; uniform float uWearHalf;\n' : ''}` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wpos = instanceMatrix[3].xz;
      #else
        vec2 wpos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      #endif
      float ph = wpos.x * 0.35 + wpos.y * 0.21;
      float k = max(0.0, position.y - ${minY.toFixed(2)});
      // 突風の波：風の向きに進む帯
      float gw = uGust * (0.45 + 0.55 * smoothstep(-0.3, 0.9, sin(dot(wpos, uWindDir) * 0.05 - uWind * 1.2)));
      ${o.wear ? `float wr = texture2D(tWear, (wpos + uWearHalf) / (uWearHalf * 2.0)).r;
      transformed.y *= 1.0 - wr * 0.72;
      k *= 1.0 - wr * 0.8;
      transformed.xz += uWindDir * max(0.0, position.y) * wr * 0.3;` : ''}
      ${minY === 0 ? 'k *= k / (k + 0.35); // 根元は動かさず、葉先ほどしなる' : ''}
      vec3 swayOff = vec3(uWindDir.x, 0.0, uWindDir.y) * (0.35 + 0.65 * gw) * gw * ${(amp * 1.1).toFixed(3)} * k;
      swayOff.xz += uWindDir * sin(uWind * 1.6 + ph) * ${(amp * 0.25).toFixed(3)} * k * gw;
      swayOff.xz += vec2(-uWindDir.y, uWindDir.x) * cos(uWind * 1.3 + ph * 1.3) * ${(amp * 0.15).toFixed(3)} * k * gw;`)
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', 'mvPosition.xyz += swayOff;\n mvPosition = modelViewMatrix * mvPosition;'));
    if (o.after) o.after(sh);
  };
  return mat;
}

// 透ける葉の板：絵が縮んで（遠くで）ぼやけるほど不透明の度合いを上げ、葉の塊が痩せないようにする
function keepAlpha(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
    #ifdef USE_MAP
      vec2 atx = dFdx(vMapUv * 256.0), aty = dFdy(vMapUv * 256.0);
      float mipL = max(0.0, 0.5 * log2(max(dot(atx, atx), dot(aty, aty))));
      diffuseColor.a *= 1.0 + mipL * 0.28;
    #endif
    #include <alphatest_fragment>`);
}

// 草の株：両面の板でも、裏から見た面を暗くしない（法線は上向きのまま使う）
// 日を背にして見ると、薄い葉が光を通して明るく光る（葉先ほど強く。根元は株の中の陰で暗い）
// （草には keepAlpha を使わない：遠くで縮んだ絵の不透明を上げると、株が四角い塊になって黒いしみに見える）
// 木の葉：日を背にして見上げると、葉の塊の縁が光を通して明るむ（影の中の葉は光らない）
function leafLit(sh) {
  keepAlpha(sh);
  // カメラのすぐ前の葉は抜く（木の脇を通ると、葉の板が画面いっぱいの黒い影になっていた。10/2 森部の開戦）
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(1.5, 4.5, length(vViewPosition));\n#include <alphatest_fragment>');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    #if NUM_DIR_LIGHTS > 0
      float lback = pow(max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0), 4.0);
      reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * lback * 0.35;
    #endif`);
}
// 草の抜き：遠くの株は細って消える（遠目の野は地面の絵に任せる。遠くの株が黒い点々に見えないように）
// 抜きは、ぼけた縮小の絵ではなく細かい方の絵で決める（縮小の絵では根元の葉が平均されて、株が四角い塊になるため）
function grassAlpha(sh, fade = true) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `#ifdef USE_MAP
      diffuseColor.a = texture2D(map, vMapUv, -2.5).a * opacity;
    #endif
    ${fade ? 'diffuseColor.a *= 1.0 - smoothstep(24.0, 48.0, length(vViewPosition));' : ''}
    #include <alphatest_fragment>`);
}
function grassLit(sh) {
  grassAlpha(sh);
  // 葉先：置く所の緑を掛けると先まで青みの薄荷色になるので、先ほど黄みの枯れ色へ寄せ、根元は濃く沈める
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    #ifdef USE_MAP
    {
      float gy = vMapUv.y, gl = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
      diffuseColor.rgb = mix(diffuseColor.rgb, gl * vec3(1.22, 1.02, 0.5), smoothstep(0.45, 0.95, gy) * 0.6);
      diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.4, gy));
    }
    #endif`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
    #ifdef DOUBLE_SIDED
      normal *= faceDirection;
    #endif`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    #if defined(USE_MAP) && NUM_DIR_LIGHTS > 0
    {
      float tipK = smoothstep(0.1, 0.9, vMapUv.y);
      float back = pow(max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0), 3.0);
      // directLight は日差しの最後の値（影と雲の影が掛かった色）。影の中の葉は光らない
      reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * back * tipK * 0.3;
      // 根元は株の中の陰：空の光も日差しも届きにくい
      float rootK = smoothstep(0.0, 0.45, vMapUv.y);
      // 薄い葉は空の光を裏からも受ける（日陰の草が真っ黒に沈まないように）
      reflectedLight.indirectDiffuse *= mix(0.85, 1.0, rootK) * 1.35;
      reflectedLight.directDiffuse *= mix(0.75, 1.0, rootK);
    }
    #endif`);
}

// 水面のさざ波：流れに沿って動く二枚の濃淡から面の向きを揺らし、空の映り込みを細かく砕く（のっぺりした一枚の板に見えないように）
export function rippleWater(mat, fx, fz, amt = 3.5, sky = null, localFlow = false) {
  // 流れの向きごとに別の作り（同じ字面の関数だと、先の川の向きが使い回される）
  mat.customProgramCacheKey = () => `ripple|${fx.toFixed(3)}|${fz.toFixed(3)}|${amt}|${localFlow}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tMacro = { value: macroTex() };
    sh.uniforms.uTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } };
    sh.uniforms.uWaterSky = { value: sky || new THREE.Color(0x71838b) };
    sh.vertexShader = 'varying vec3 vWPw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (localFlow) sh.vertexShader = 'attribute vec2 waterFlow; varying vec2 vWaterFlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterFlow = waterFlow;');
    sh.fragmentShader = 'uniform sampler2D tMacro; uniform float uTime; uniform vec3 uWaterSky; varying vec3 vWPw;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 fl = ${localFlow ? 'normalize(vWaterFlow + vec2(0.00001))' : `vec2(${fx.toFixed(3)}, ${fz.toFixed(3)})`};
        vec2 q1 = vWPw.xz * vec2(0.3, 0.3) - fl * uTime * 0.09;
        vec2 q2 = vWPw.xz * vec2(0.8, 0.8) - fl.yx * uTime * 0.03 - fl * uTime * 0.15;
        float e = 0.02;
        float h0 = texture2D(tMacro, q1).r + texture2D(tMacro, q2).r * 0.5;
        float hx = texture2D(tMacro, q1 + vec2(e, 0.0)).r + texture2D(tMacro, q2 + vec2(e, 0.0)).r * 0.5;
        float hz = texture2D(tMacro, q1 + vec2(0.0, e)).r + texture2D(tMacro, q2 + vec2(0.0, e)).r * 0.5;
        vec3 bw = vec3(-(hx - h0), 0.0, -(hz - h0)) * ${amt.toFixed(2)};
        normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
      }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      ${mat.isMeshLambertMaterial ? `// 携帯でも空の色と雲の濃淡を水面へ映す。描き直しは足さない。
      vec3 waterView = normalize(cameraPosition - vWPw);
      float waterEdge = pow(1.0 - abs(waterView.y), 3.0);
      vec2 skyUV = vWPw.xz * 0.018 + waterView.xz * 0.6;
      float skyCloud = texture2D(tMacro, skyUV).r;
      reflectedLight.indirectDiffuse += uWaterSky * (0.08 + waterEdge * 0.3) * (0.7 + skyCloud * 0.3);` : ''}`);
    if (localFlow) sh.fragmentShader = 'varying vec2 vWaterFlow;\n' + sh.fragmentShader;
  };
  return mat;
}

// ---------------- 遠景の軍勢（軽い作りの兵） ----------------
// 一人ずつ、頭・笠か兜・肩・胴・脚と得物の形が影で分かる。動きは形の側（頂点）で付ける：
// 足踏み・見回し・向き直り・槍の傾きと持ち替え・隣へ寄る。進む・退く・崩れて逃げるも同じ仕組み
// 足もとの高さは地面の高さの絵から読む（隊ごと動かしても、坂で浮いたり埋まったりしない）
// 兵の種類（aInfo.y）：0 槍　1 鉄砲　2 弓　3 侍（兜）　4 旗持ち　5 騎馬（馬に乗る）　6 床几に座る大将
const ARMY_GLSL = `
uniform vec2 uWindDir;
uniform float uAMotion, uAFlagWidth; varying float vASteel;
uniform float uAT, uGust, uIdle, uMarch, uCharge, uTurn, uRout, uRoutT, uShim, uYose;
uniform sampler2D uHgt; uniform vec3 uHP;
attribute vec4 aInfo; attribute vec2 aInfo2; attribute float aPart;
// aHost：後詰め（隊の後ろに続く軽い兵）の奥行き（0 は隊の本体。後ろほど 1 に近く、霞む）
attribute float aHost; varying float vAHz;
// 列の場所から風の遅れを決める。兵ごとの乱数だけで揺らさず、隣へ波を伝える。
float aWindPhase() {
  #ifdef USE_INSTANCING
    return dot((modelMatrix * instanceMatrix[3]).xz, uWindDir) * 0.05;
  #else
    return 0.0;
  #endif
}
mat3 aRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 aRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 aRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float aTerrain(vec2 p) {
  vec2 f = clamp((p + uHP.x) / uHP.y, vec2(0.0), vec2(uHP.z - 0.001));
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float a = texelFetch(uHgt, i, 0).r, b = texelFetch(uHgt, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHgt, i + ivec2(0, 1), 0).r, d = texelFetch(uHgt, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
struct APose { float show, yaw, tilt, fall, leg, spear, spLen, lift, kneel, nod, run; vec3 off; };
APose aPose() {
  APose P;
  float sd = aInfo.x, kd = aInfo.y, hm = aInfo.z, ex = aInfo.w, s2 = aInfo2.y, pt = aPart;
  float T = uAT + sd * 97.0;
  // 見せる部品（種類に合わない得物はたたむ）
  P.show = 1.0;
  if (pt == 1.0) P.show = 1.0 - hm;
  else if (pt == 2.0) P.show = hm;
  else if (pt == 3.0) P.show = (kd == 0.0 || kd == 5.0) ? 1.0 : 0.0;
  else if (pt == 4.0) P.show = kd == 1.0 ? 1.0 : 0.0;
  else if (pt == 5.0) P.show = kd == 2.0 ? 1.0 : 0.0;
  else if (pt == 6.0) P.show = kd == 4.0 ? 1.0 : 0.0;
  else if (pt == 8.0 || pt == 9.0) P.show = kd == 5.0 ? 0.0 : 1.0;
  else if (pt == 10.0 || pt == 11.0) P.show = aInfo2.x;
  // 崩れて逃げる：一人ずつ少し遅れて踵を返し、ばらばらの向きへ走る。一割ほどは倒れて動かない
  float rt = uRout * max(0.0, uRoutT - sd * 1.6);
  float run = step(0.001, rt);
  float fallAt = 1.2 + s2 * 50.0;
  float falls = step(s2, 0.1) * run;
  float down = falls * smoothstep(fallAt, fallAt + 0.5, rt);
  float rtm = mix(rt, min(rt, fallAt), falls);
  float spd = 3.0 + sd * 2.2;
  P.run = run;
  // 足踏み：ときどき足を踏みかえる。進む時は歩き、逃げる時は走る
  float stepG = smoothstep(0.55, 0.95, sin(T * mix(0.11, 0.23, uIdle) + sd * 31.0));
  float gait = max(uMarch, run);
  // 隊の中の入れ替わり：ときどき一人が横へ数歩ずれて、しばらくして戻る（その間は歩く）
  float swp = (1.0 - uYose) * uIdle * smoothstep(0.86, 1.0, sin(T * 0.027 + sd * 53.0)) * (1.0 - min(1.0, gait)) * step(kd, 4.5);
  float swk = swp * (1.0 - swp) * 4.0;
  float fq = run > 0.5 ? 10.5 : (kd == 5.0 && uMarch > 0.01 ? mix(3.1, 7.0, uCharge) : (uMarch > 0.01 || swk > 0.3 ? 5.6 : 6.5));
  float amp = max(max(stepG * 0.2, uMarch * 0.42), swk * 0.4);
  amp = mix(amp, 0.7, run) * (1.0 - down);
  float ph = sin(T * fq);
  P.leg = ph * amp;
  P.lift = abs(ph) * (0.012 + amp * 0.07);
  // 見回し・ときどきの向き直り（進む・逃げる時はしない）
  float look = 0.2 * sin(T * 0.07) * sin(T * 0.031 + sd * 9.0) + 0.6 * smoothstep(0.88, 1.0, sin(T * 0.045 + sd * 20.0)) * (sd > 0.5 ? 1.0 : -1.0);
  // 小さな見回し（人ごとに速さが違う）と、ずれる時は歩く向きへ少し顔を向ける
  look += uIdle * (0.16 * sin(T * (0.3 + s2 * 0.25) + sd * 23.0) + swk * 0.5 * (s2 > 0.5 ? 1.0 : -1.0));
  look *= 1.0 - min(1.0, gait) * 0.85;
  P.yaw = look + uTurn * 3.14159 + run * (3.14159 + (s2 - 0.5) * 1.7);
  // 体の左右の揺れ（重心の移し替え）と息づかいの上下
  P.tilt = 0.035 * sin(T * 0.23 + sd * 5.0) + (1.0 - run) * ((s2 - 0.5) * 0.05 + uIdle * 0.03 * sin(T * (0.8 + sd * 0.5) + s2 * 40.0));
  P.fall = down * 1.45;
  // 槍：人ごとに傾きが違い、ゆっくり揺れ、ときどき持ち替える。進む時は少し前へ、かかる時は穂先を下ろし、逃げる時は肩に担ぐか放り出す
  float regrip = smoothstep(0.9, 1.0, sin(T * 0.083 + sd * 41.0));
  P.spear = (sd - 0.5) * 0.24 + 0.05 * sin(T * 0.37) + regrip * 0.35 + uMarch * 0.1 + uCharge * 1.15 * (1.0 - run) - run * 0.55;
  P.spLen = kd == 0.0 ? max(1.0, ex) : 1.0;
  if ((pt == 3.0 || pt == 4.0) && run > 0.5 && s2 > 0.55) P.show = 0.0;
  P.kneel = (kd == 1.0 && ex > 0.5) ? mix(0.7, 1.0, min(1.0, gait)) : 1.0;
  // 馬の首：ときどき振る・下げる
  P.nod = gait * 0.08 * sin(T * fq) + 0.1 * sin(T * 0.5) + 0.35 * smoothstep(0.9, 1.0, sin(T * 0.06 + sd * 13.0)) * (1.0 - gait) - gait * 0.15;
  // 隣へ寄る・少し離れる（その場でゆっくり）
  vec3 wand = vec3(0.24 * sin(T * 0.013 + sd * 7.0), 0.0, 0.18 * sin(T * 0.017 + sd * 3.0)) * (1.0 - min(1.0, gait));
  wand += vec3((s2 > 0.5 ? 1.0 : -1.0) * 0.9, 0.0, -0.45) * swp;
  P.lift += uIdle * 0.012 * (1.0 - run) * sin(T * 1.7 + sd * 30.0);
  #ifdef USE_INSTANCING
  float idleFar = smoothstep(36.0, 60.0, length((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz - uArmyP));
  wand *= idleFar; P.yaw = mix(uTurn * 3.14159 + run * (3.14159 + (s2 - 0.5) * 1.7), P.yaw, idleFar);
  #endif
  P.off = wand * (1.0 - uYose) + aRotY(P.yaw) * vec3(0.0, 0.0, rtm * spd * (kd == 5.0 ? 2.0 : 1.0));
  P.lift += down * 0.12;
  if (kd == 5.0 && pt < 20.0) P.lift += 0.98;
  // 進む時の波打ち：隊の横へ流れる波で、列が前後にうねり、背が上下し、槍の林が揺れる（大軍が一つの生き物のように動く）
  #ifdef USE_INSTANCING
  {
    vec2 ip = instanceMatrix[3].xz;
    float wv = sin(dot(ip, vec2(0.11, 0.083)) - uAT * 1.6), mk = uMarch * (1.0 - run);
    float row = floor(ip.y / 1.8);
    float rankWave = sin(uAT * 0.85 - row * 0.55 + ip.x * 0.09);
    P.off.z += (1.0 - uYose) * uAMotion * mk * (0.55 * wv + 0.28 * rankWave);
    P.off.x += (1.0 - uYose) * uAMotion * mk * 0.18 * sin(uAT * 0.65 - row * 0.4 + ip.x * 0.07);
    P.lift += mk * 0.05 * max(0.0, wv);
    P.spear += mk * 0.1 * wv;
  }
  #endif
  if (kd == 6.0) { P.lift -= 0.34; P.yaw = look * 0.5; P.off = vec3(0.0); }
  return P;
}
vec3 aApply(APose P, vec3 v, float isN) {
  float pt = aPart, kd = aInfo.y, sd = aInfo.x, pos = 1.0 - isN;
  vec3 q = v;
  // 旗の布：竿から離れるほどはためく（突風で大きく）
  if (pt == 11.0 && isN < 0.5) { float k = clamp(q.x / 0.34, 0.0, 1.0); q.z += sin(uAT * 3.2 - aWindPhase() + q.x * 9.0 + q.y * 3.0 + sd * 1.5) * 0.09 * uGust * uAMotion * k; }
  if (pt == 12.0 && isN < 0.5) { if (aInfo.y == 4.0 && aInfo.w == 4.0) q.x = 0.3 + (q.x - 0.3) * 1.65; float k = clamp((q.x - 0.3) / 0.72, 0.0, 1.0); float kk = k * (0.4 + clamp((5.2 - q.y) / 3.7, 0.0, 1.0) * 0.6);
    q.z += (sin(uAT * 2.7 - aWindPhase() + q.x * 6.0 + q.y * 1.5 + sd * 1.5 * (1.0 - uYose)) * 0.18 * uGust + sin(uAT * 0.7 - aWindPhase()) * 0.09 * uGust) * kk * uAMotion; }
  // 蜂須賀の指物・幟は、近くの本物の兵と同じ細幅。家紋の絵と形を使い回したまま竿の側へ寄せる。
  if ((pt == 11.0 || pt == 12.0) && isN < 0.5) { float px = pt == 12.0 ? 0.3 : 0.0; q.x = px + (q.x - px) * uAFlagWidth; }
  if (pt == 11.0 || pt == 12.0) {
    #ifdef USE_INSTANCING
      mat4 wm = modelMatrix * instanceMatrix;
      vec2 localWind = vec2(dot(normalize(wm[0].xz), uWindDir), dot(normalize(wm[2].xz), uWindDir));
      float angle = atan(-localWind.y, localWind.x) - P.yaw;
      vec3 pivot = vec3(pt == 12.0 ? 0.3 : 0.0, 0.0, pt == 12.0 ? 0.14 : -0.17) * pos;
      q = aRotY(angle) * (q - pivot) + pivot;
    #endif
  }
  if (pt == 8.0 || pt == 9.0) {
    float a = kd == 6.0 ? -1.25 : (pt == 8.0 ? P.leg : -P.leg);
    vec3 hp = vec3(0.0, 0.82, 0.0) * pos; q = aRotX(a) * (q - hp) + hp;
  }
  if (pt == 3.0 || pt == 6.0 || pt == 12.0) {
    vec3 hp = vec3(0.3, 1.15, 0.14) * pos; vec3 r = q - hp;
    if (pt == 3.0 && isN < 0.5) r.y *= P.spLen;
    q = aRotX(P.spear * (pt == 3.0 ? 1.0 : 0.25)) * r + hp;
  }
  if (pt == 4.0) { vec3 hp = vec3(0.22, 1.1, 0.15) * pos; q = aRotX(P.spear * 0.3) * (q - hp) + hp; }
  if (pt == 21.0 || pt == 22.0) {
    vec3 hp = vec3(0.0, 1.0, q.z > 0.0 ? 0.62 : -0.62) * pos;
    q = aRotX((pt == 21.0 ? P.leg : -P.leg) * 0.8) * (q - hp) + hp;
  }
  if (pt == 23.0) { vec3 hp = vec3(0.0, 1.5, 0.72) * pos; q = aRotX(P.nod) * (q - hp) + hp; }
  q *= P.show;
  if (isN < 0.5) q.y *= P.kneel;
  q = aRotY(P.yaw) * (aRotX(P.fall) * (aRotZ(P.tilt) * q));
  if (isN < 0.5) q += vec3(0.0, P.lift, 0.0) + P.off;
  return q;
}
`;
// 通常は近い兵を隠さない。本物への置換で take した兵だけを隠す。
// 枠が尽きた軽い合戦だけ、一時的に見せない範囲を頼める。
export const ARMY_NEAR = { value: 0 };
export const ARMY_P = { value: new THREE.Vector2(1e5, 1e5) };
export const ARMY_REAL_P = { value: new THREE.Vector2(1e5, 1e5) };
export const ARMY_REAL_R = { value: 0 };
export const ARMY_REAL_NEAR = 60;
const _lodV = new THREE.Vector3();
// 本物への置換ができない軽い合戦だけ、見せない輪を一時的に頼む。
const NEAR_REQ = {};
export function nearHideRequest(key, r) {
  NEAR_REQ[key] = r || 0;
  let m = 0;
  for (const v of Object.values(NEAR_REQ)) m = Math.max(m, v);
  ARMY_NEAR.value = m;
}
const ARMY_PUSH = `
 vArmyCover = 1.0;
 #ifdef USE_INSTANCING
 {
   mat4 IMw = modelMatrix * instanceMatrix; vec4 nw = IMw * vec4(AP.off.x, 0.0, AP.off.z, 1.0);
   vec2 dv = nw.xz - uArmyP; float dd = length(dv);
   // 押し出さない（押し出すと、近づくほど大軍が遠ざかって輪になる）。カメラのすぐ近くの軽い兵だけを見えなくする。
   //   近くは wake（b_nagashinojo.js）が同じ場所の軽い兵を本物の兵に替えて埋める
   if (dd < uArmyNear || length(nw.xz - uArmyRealP) < uArmyRealR) AP.show = 0.0;
   // 遠景専用の後詰めは近景に出さない。網目の人影が実兵と重なるのを防ぐ。
   if (aHost > 0.0 && dd < 48.0) AP.show = 0.0;
   // 近景の外でも一人ずつ徐々に間引く。体に穴を開けず、旗と槍も同じ兵ごとに残す。
   if (aHost > 0.0) vArmyCover = step(aInfo.x, smoothstep(48.0, 72.0, dd));
 }
 #endif`;
// 半透明の並べ替えを増やさず、後詰めの近い端だけを兵ごとに間引く。
function armyCover(sh) {
  sh.vertexShader = 'varying float vArmyCover;\n' + sh.vertexShader;
  sh.fragmentShader = 'varying float vArmyCover;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    if (vArmyCover < 0.5) discard;`);
}
// 画面へ：足もとを地面に合わせ、遠くは陽炎で揺らぎ（地面に近いほど強く）、後詰めは奥ほど霧の色へ沈む
const ARMY_PROJ = `vec4 aIP = vec4(transformed, 1.0), aFP = vec4(AP.off.x, 0.0, AP.off.z, 1.0);
        #ifdef USE_INSTANCING
          aIP = instanceMatrix * aIP; aFP = instanceMatrix * aFP;
        #endif
        vec4 aW = modelMatrix * aIP, aWF = modelMatrix * aFP;
        float aG = aTerrain(aWF.xz);
        aW.y += aG - aWF.y;
        vec4 mvPosition = viewMatrix * aW;
        {
          float aDist = length(mvPosition.xyz);
          float aSh = uShim * smoothstep(60.0, 220.0, aDist) * aDist * 0.0011 * (0.5 + 0.5 * smoothstep(2.5, 0.0, aW.y - aG));
          mvPosition.x += aSh * sin(uAT * 7.3 + aW.y * 5.0 + aW.x * 0.37);
          mvPosition.y += aSh * 0.5 * sin(uAT * 5.1 + aW.y * 4.0 + aW.z * 0.41);
          // 軽い兵も奥へ行くほど霞の色へなじませ、黒い点の列にしない。
          vAHz = max(aHost * 0.42, 0.24) * smoothstep(35.0, 140.0, aDist);
        }
        gl_Position = projectionMatrix * mvPosition;`;
// 陽炎の強さ（晴れて乾いた昼ほど強い。World.update が決める）
const SHIMMER = { value: 0.6 };
// 描く直前に、軽い兵を隠す輪の中心を「いま描いているカメラ」に合わせる（humans.js は戦の進みの中でしか写さないので、
// 写真の自由なカメラ・止めている間・開戦の前でも、目の前に棒人間を出さないように）。上から見る平らなカメラ（地図など）は除く
function armyCam(mat) {
  mat.onBeforeRender = (r, s, cam) => { if (cam && cam.isPerspectiveCamera) ARMY_P.value.set(cam.position.x, cam.position.z); };
}
const ARMY_MOTION = { value: 1 };
// 穂先だけ日差しを返す。別の光源や粒を足さず、暗い戦では光らせない。
function armySteel(sh) {
  sh.fragmentShader = 'varying float vASteel;\n' + sh.fragmentShader
    .replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 + vASteel * 1.1;\n#include <opaque_fragment>');
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vASteel = 0.0;
    if (aPart == 3.0 && position.y > 4.25) {
      vec3 steelN = objectNormal;
      #ifdef USE_INSTANCING
        steelN = mat3(instanceMatrix) * steelN;
      #endif
      vASteel = pow(max(0.0, dot(normalize(normalMatrix * steelN), normalize(vec3(0.35, 0.7, 0.6)))), 12.0);
    }`);
}
function armyShader(mat, U) {
  armyCam(mat);
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uYose: U.uYose || { value: 0 }, uUnavailable: U.uUnavailable || { value: 0 }, uMoveLim: U.uMoveLim || { value: 176 }, uArmyNear: U.uNear || ARMY_NEAR, uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
    sh.fragmentShader = 'varying float vAHz;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, vAHz);
      #endif`);
    sh.vertexShader = 'uniform float uArmyNear, uUnavailable, uMoveLim, uArmyRealR; uniform vec2 uArmyP, uArmyRealP;\n' + ARMY_GLSL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 APose AP = aPose();${ARMY_PUSH}
 if (uUnavailable > 0.5 && max(abs((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).x), abs((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z)) < uMoveLim + 40.0) AP.show = 0.0;
 objectNormal = normalize(aApply(AP, objectNormal, 1.0) + vec3(0.0, 1e-4, 0.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = aApply(AP, transformed, 0.0);')
      .replace('#include <project_vertex>', ARMY_PROJ);
    armyCover(sh);
    armySteel(sh);
  };
  return mat;
}

// ---------------- 軽い大軍の合戦（前線どうしのぶつかり合い） ----------------
// 兵を一人ずつ計算せず、幅 6m ほどの「塊」ごとに、前線の位置・討たれた数・崩れを持つ。動きは形の側（頂点）で：
// 前の列は槍を振り上げては叩き下ろし、押し合って前後する。討たれた者は倒れ姿を残し、列が減れば後ろの列が詰める
// uBlk[塊]：x 前線のずれ（m、A の向きへ）・z 討たれた数・w 崩れてからの秒（0 は崩れていない）
// uBlk2[塊]：x 打ち合いの強さ・y 歩き・z 一列の人数・w 隠す（本物の兵に置き換えた塊）
// aClash：x 塊の番号・y 塊の中の順番（前の列から討たれる）・z 列（0 が一番前）・w 倒れた者なら 1
const CLASH_NB = 40, CLASH_ROW = 1.15;
// 合戦の矢を並べる計算の入れ物（毎コマ new しない）
const _caM4 = new THREE.Matrix4(), _caQ = new THREE.Quaternion(), _caP = new THREE.Vector3(), _caD = new THREE.Vector3(), _caS = new THREE.Vector3(1, 1, 1), _caZ = new THREE.Vector3(0, 0, 1);
// （元の形の uMarch・uCharge は、塊ごとに変わるので、ここでは cInit で決める値にする）
const CLASH_GLSL = ARMY_GLSL.replace(/uMarch, uCharge, /, '').replace('attribute float aPart;', `attribute float aPart;
uniform vec4 uBlk[${CLASH_NB}], uBlk2[${CLASH_NB}]; uniform float uSide, uApp, uAppM, uAppC, uNearHide;
attribute vec4 aClash;
float uMarch, uCharge, cRt, cFight, cHide, cPress; vec3 cOff;
void cInit(float sd) {
  int j = int(aClash.x + 0.5);
  vec4 B = uBlk[j], B2 = uBlk2[j];
  cOff = vec3(0.0); cFight = 0.0; cPress = 0.0; cHide = 0.0; cRt = 0.0; uMarch = 0.0; uCharge = 0.0;
  if (aClash.w > 0.5) return;
  float kc = B.z / max(1.0, B2.z), fr = floor(kc), row = aClash.z;
  cHide = max(B2.w, step(aClash.y + 0.5, B.z));
  // 前の列が減るほど、後ろの列が前へ詰める
  float sh = row <= fr + 0.5 ? fr : kc;
  cOff = vec3(0.0, 0.0, uSide * B.x + sh * ${CLASH_ROW.toFixed(2)} + uApp);
  // 乱戦：前の二列は相手の列の中へ踏み込み、横へもばらける（両軍の境が崩れて入り混じる）。B.y がその強さ
  float mixF = B.y * (1.0 - smoothstep(fr + 1.5, fr + 2.6, row));
  cOff.z += mixF * (0.8 + 2.2 * fract(sd * 7.31));
  cOff.x += mixF * 1.1 * (fract(sd * 3.77) - 0.5) * 2.0;
  cRt = B.w > 0.0 ? max(0.0, B.w - sd * 1.6) : 0.0;
  cFight = B2.x * (1.0 - smoothstep(fr + 1.5, fr + 3.0, row));
  cPress = B2.x - cFight;
  uMarch = max(B2.y, uAppM);
  uCharge = max(cFight * 0.85, uAppC);
}`).replace('float rt = uRout * max(0.0, uRoutT - sd * 1.6);', 'cInit(sd); float rt = cRt;') + `
void cPose(inout APose P) {
  float sd = aInfo.x, T = uAT + sd * 97.0;
  P.off += cOff;
  // 前線の圧が後列へ遅れて届く。両軍を同じ方向へ動かし、間に穴を作らない。
  if (aClash.w < 0.5 && P.run < 0.5) {
    float pressWave = sin(uAT * 0.95 - aClash.x * 0.62 - aClash.z * 0.38);
    float pressure = (cFight + cPress) * uAMotion;
    P.off.z += uSide * pressure * 0.48 * pressWave;
    P.tilt += pressure * 0.025 * pressWave;
    P.spear += pressure * 0.08 * pressWave;
  }
  if (cHide > 0.5) P.show = 0.0;
  // カメラの近くの者は、輪の外へ押し出す（近くでは箱に見えるので。内は本物の兵が受け持つ。消して空にはしない）
  if (aClash.w > 0.5) {
    // 倒れた者：うつ伏せか仰向け。向きはばらばら
    P.fall = aInfo2.y > 0.5 ? 1.5 : -1.45; P.yaw = sd * 6.2832; P.off = vec3(0.0); P.leg = 0.0; P.lift = 0.16;
    P.tilt = (aInfo2.y - 0.5) * 0.5; P.spear = 1.3; P.kneel = 1.0; P.nod = 0.0;
    return;
  }
  if (cFight > 0.01 && P.run < 0.5) {
    // 槍の叩き合い：振り上げては打ち下ろす（人ごとに拍子が違う）。突いては引き、押されてよろける
    float f = cFight, beat = sin(T * (2.0 + sd * 1.5));
    P.spear += f * (0.42 * beat - 0.12);
    P.off.z += f * (0.28 * sin(T * 1.6 + sd * 11.0) + 0.1 * beat);
    P.off.x += f * 0.12 * sin(T * 0.9 + sd * 17.0);
    P.tilt += f * 0.08 * sin(T * 1.3 + sd * 5.0);
    P.yaw = mix(P.yaw, (sd - 0.5) * 0.35, f);
    P.leg += f * 0.2 * sin(T * 2.6 + sd * 7.0);
  }
  if (cPress > 0.01 && P.run < 0.5) {
    // 後ろの列の押し合い：前へ詰めては押し返され、槍の穂先が揺れ、足を踏み替える（棒立ちにしない）
    float q = cPress;
    P.off.z += q * (0.16 * sin(T * 0.8 + sd * 9.0) + 0.06);
    P.off.x += q * 0.07 * sin(T * 0.55 + sd * 21.0);
    P.spear += q * 0.14 * sin(T * 1.2 + sd * 13.0);
    P.tilt += q * 0.05 * sin(T * 0.9 + sd * 3.0);
    P.leg += q * 0.12 * sin(T * 1.7 + sd * 5.0);
  }
}
`;
function clashShader(mat, U) {
  armyCam(mat);
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
    sh.vertexShader = 'uniform vec2 uArmyRealP; uniform float uArmyRealR; uniform vec2 uArmyP;\n' + CLASH_GLSL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 APose AP = aPose(); cPose(AP);${ARMY_PUSH.replace(/uArmyNear/g, 'uNearHide')}
 objectNormal = normalize(aApply(AP, objectNormal, 1.0) + vec3(0.0, 1e-4, 0.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = aApply(AP, transformed, 0.0);')
      .replace('#include <project_vertex>', ARMY_PROJ);
    armyCover(sh);
    armySteel(sh);
  };
  return mat;
}

// 形の部品に色と部品の番号を付ける
// 形は頂点を分け合う形（index 付き）のまま束ねる：三角ごとに頂点を分けると、描くたびの頂点の計算（高さの絵の読み取り・揺れ）が三倍ほどになる
function armyPart(list, geo, hex, part) {
  const g = geo;
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  const n = g.attributes.position.count, c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), pa = new Float32Array(n).fill(part);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  list.push(g);
}
// 兵一人の形（near は近くで見る少人数向けに角を増やす）
const SOLDIER_GEO = new Map();
// near：true＝近く（十角）・false＝中ほど（七角）・'lo'＝遠く（五角。38m より遠い塊だけに使う＝lodTwin）
// 画質「低」（携帯）では、軽い大軍（遠くの軍勢・後詰め・合戦の後ろの列）の描く人数を半分ほどに（大事な者と前の列は残る）
//   遠いほど多く間引く（60m 内は半分ほど・150m 内は四分の一・その先は六分の一ほど）。back：後詰め（奥の列）はさらに七割
const lowKeep = (dd = 100, back = false) => (SETTINGS.quality === 'low' ? (0.45 - 0.17 * Math.max(0, Math.min(1, (dd - 40) / 40)) - 0.12 * Math.max(0, Math.min(1, (dd - 120) / 60))) * (back ? 0.7 : 1) : 1);
function soldierGeo(armor, near) {
  if (near === 'xlo' || near === 'xxlo' || near === 'x3lo') return soldierGeoX(armor, near === 'x3lo' ? 3 : near === 'xxlo');
  const lo = near === 'lo';
  if (lo) near = false;
  const key = armor + (near ? 'n' : lo ? 'l' : 'f');
  if (SOLDIER_GEO.has(key)) return SOLDIER_GEO.get(key);
  // 角の少ない筒は遠目でも四角い箱に見えるので、遠い形でも六角より上にする（近くは十角）。肩は箱でなく曲げた板、頭は丸
  // 中くらいの遠さ（14〜80m）でも人の形に見えるよう、遠い形も七角で蓋を閉じる（棒の束に見えないように）
  const P = [], s = near ? 10 : lo ? 5 : 7, s2 = lo ? 6 : s + 2, sp = lo ? 4 : s;
  const arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex(), lite = arm.clone().lerp(new THREE.Color(0x8a8070), 0.18).getHex();
  const cyl = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false); g.translate(x, y, z); return g; };
  // 脚：袴の腿（ふくらむ）・脚絆の脛（細い）・足
  for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) {
    armyPart(P, cyl(0.085, 0.07, 0.4, s, sx, 0.62, 0), 0x4c4438, pt);
    armyPart(P, cyl(0.062, 0.05, 0.42, s, sx, 0.23, 0), 0x403a30, pt);
    const ft = new THREE.SphereGeometry(0.055, sp, lo ? 2 : 3); ft.scale(1, 0.5, 1.8); ft.translate(sx, 0.03, 0.05); armyPart(P, ft, 0x3a3228, pt);
  }
  // 草摺（腰の裾）と胴。胴は少し平たく、胸から腰へ絞る
  const skirt = cyl(0.19, 0.27, 0.34, s2, 0, 0.9, 0); skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.21, 0.175, 0.5, s2, 0, 1.33, 0); dou.scale(1, 1, 0.9); armyPart(P, dou, armor, 0);
  // 肩の丸み（胴の上を閉じる）と首
  const sh = new THREE.SphereGeometry(0.21, s2, lo ? 2 : 4, 0, Math.PI * 2, 0, Math.PI / 2); sh.scale(1, 0.4, 0.74); sh.translate(0, 1.57, 0); armyPart(P, sh, armor, 0);
  armyPart(P, cyl(0.05, 0.055, 0.1, s, 0, 1.63, 0.01), 0x8a6a4e, 0);
  // 袖（肩の板）：肩の丸みに沿って垂れる曲げた板（箱にしない）
  for (const sx of [-1, 1]) {
    const b = new THREE.CylinderGeometry(0.13, 0.15, 0.26, near ? 8 : lo ? 4 : 5, 1, true, sx > 0 ? -Math.PI * 0.1 : Math.PI * 0.9, Math.PI * 1.2);
    b.scale(0.75, 1, 1); b.rotateZ(sx * 0.2); b.translate(sx * 0.22, 1.43, 0); armyPart(P, b, lite, 0);
  }
  // 腕（小袖の袖）と手：左は垂らし、右は得物を持って少し前へ
  const la = cyl(0.05, 0.042, 0.5, s, -0.29, 1.2, 0.02); armyPart(P, la, 0x47526c, 0);
  const lh = new THREE.SphereGeometry(0.042, sp, lo ? 2 : 3); lh.translate(-0.29, 0.93, 0.03); armyPart(P, lh, 0x8a6a4e, 0);
  const ra = cyl(0.05, 0.042, 0.5, s, 0, 0, 0); ra.rotateX(-0.45); ra.translate(0.29, 1.2, 0.08); armyPart(P, ra, 0x47526c, 0);
  const rh = new THREE.SphereGeometry(0.042, sp, lo ? 2 : 3); rh.translate(0.29, 0.97, 0.19); armyPart(P, rh, 0x8a6a4e, 0);
  // 頭（顔の色）：いつも丸く
  const head = new THREE.SphereGeometry(0.105, near ? 10 : lo ? 6 : 7, near ? 7 : lo ? 4 : 5); head.scale(0.95, 1.12, 1); head.translate(0, 1.72, 0.01); armyPart(P, head, 0x7a5c46, 0);
  if (near) {
    const nose = new THREE.ConeGeometry(0.023, 0.055, 3); nose.rotateX(Math.PI / 2); nose.translate(0, 1.72, 0.11); armyPart(P, nose, 0xb18a68, 0);
    for (const x of [-0.04, 0.04]) { const eye = new THREE.BoxGeometry(0.025, 0.009, 0.005); eye.translate(x, 1.75, 0.102); armyPart(P, eye, 0x30231b, 0); }
  }
  // 威糸は胴の頂点の色で描く。部品と描く回数を増やさない。
  {
    const colors = dou.attributes.color, positions = dou.attributes.position, lace = new THREE.Color(lite);
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 1.55) colors.setXYZ(i, lace.r, lace.g, lace.b);
  }
  // 陣笠（なだらかに反った笠）
  const kp = [[0.0, 0.13], [0.08, 0.115], [0.2, 0.07], [0.3, 0.02], [0.33, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const kasa = new THREE.LatheGeometry(lo ? [kp[0], kp[2], kp[4]] : kp, near ? 14 : lo ? 6 : 8); kasa.translate(0, 1.76, 0); armyPart(P, kasa, 0x2c261e, 1);
  const kb = new THREE.CylinderGeometry(0.33, 0.33, 0.012, near ? 14 : lo ? 6 : 8, 1, true); kb.translate(0, 1.757, 0); armyPart(P, kb, 0x1e1a14, 1);
  // 兜：鉢と、下へ広がる錣。近くでは金の前立
  const hachi = new THREE.SphereGeometry(0.14, near ? 10 : lo ? 5 : 7, near ? 5 : lo ? 2 : 3, 0, Math.PI * 2, 0, Math.PI / 2); hachi.translate(0, 1.75, 0); armyPart(P, hachi, 0x1c1a18, 2);
  const shikoro = new THREE.CylinderGeometry(0.15, 0.24, 0.12, near ? 12 : lo ? 5 : 7, 1, true, Math.PI * 0.3, Math.PI * 1.4); shikoro.translate(0, 1.72, -0.02); armyPart(P, shikoro, 0x24201c, 2);
  if (near) { for (const sd of [-1, 1]) { const md = new THREE.BoxGeometry(0.03, 0.16, 0.008); md.rotateZ(-sd * 0.35); md.translate(sd * 0.05, 1.93, 0.13); armyPart(P, md, 0xb08a3a, 2); } }
  // 背の指物の竿
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  // 槍（長さは人ごとに伸ばす）と穂先
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.028, 0.3, 3); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  // 鉄砲：右の肩に担ぐ
  const gun = cyl(0.025, 0.03, 1.3, 3, 0, 0, 0); gun.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.85, -0.5).normalize())); gun.translate(0.22, 1.1 + 0.55, 0.15 - 0.33); armyPart(P, gun, 0x3a2a1a, 4);
  // 弓と、背の箙
  const bow = cyl(0.012, 0.012, 2.1, 3, 0, 0, 0); bow.rotateZ(0.12); bow.translate(-0.32, 1.25, 0.08); armyPart(P, bow, 0x4a3020, 5);
  const ebira = new THREE.BoxGeometry(0.1, 0.5, 0.1); ebira.rotateZ(-0.3); ebira.translate(0.14, 1.35, -0.2); armyPart(P, ebira, 0x3a2a1a, 5);
  // 幟の竿と横木（旗持ち）
  armyPart(P, cyl(0.028, 0.034, 5.4, 4, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); armyPart(P, bar, 0x2f2419, 6);
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  SOLDIER_GEO.set(key, g);
  return g;
}
// とても遠い兵（塊のいちばん近い端が 50m より先。背丈が画面の 3% ほど）の形：部品の分け方（aPart）と置き場は同じで、角を三つ〜六つに。
//   脚は腿と脛を一本の筒に、胴は草摺から肩まで一本の筒に。一人 160 面ほど（遠い形の三分の一）
//   xx：さらに遠い兵（100m より先。背丈が十数画素）の形。腕・袖・穂先・横木を省き、胴は四角の筒に（一人 80 面ほど）
function soldierGeoX(armor, xx = false) {
  const key = armor + (xx === 3 ? 'x3' : xx ? 'xx' : 'x');
  if (SOLDIER_GEO.has(key)) return SOLDIER_GEO.get(key);
  if (xx === 3) {
    // 画質「低」の、いちばん遠い塊（66m より先。人の背丈が画面の 1/50）：94 面 → 60 面ほど。脚・胴・頭・笠と、槍の穂先の竿だけ（鉄砲・弓・背の旗の竿は、影絵では見分けが付かない）
    const P3 = [], a3 = new THREE.Color(armor), dk = a3.clone().multiplyScalar(0.72).getHex();
    const cy = (rt, rb, h, seg, x, y, z, open = true) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(x, y, z); return g; };
    for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P3, cy(0.08, 0.055, 0.82, 3, sx, 0.41, 0), 0x4c4438, pt);
    const sk = cy(0.19, 0.27, 0.34, 4, 0, 0.9, 0); sk.scale(1, 1, 0.8); armyPart(P3, sk, dk, 0);
    const dou = cy(0.21, 0.175, 0.5, 4, 0, 1.33, 0); dou.scale(1, 1, 0.74); armyPart(P3, dou, armor, 0);
    const hd = new THREE.SphereGeometry(0.105, 4, 2); hd.scale(0.95, 1.12, 1); hd.translate(0, 1.72, 0.01); armyPart(P3, hd, 0x6e5440, 0);
    const ks = new THREE.ConeGeometry(0.33, 0.13, 4, 1, true); ks.translate(0, 1.825, 0); armyPart(P3, ks, 0x2c261e, 1);
    const helmet = new THREE.SphereGeometry(0.15, 4, 2, 0, Math.PI * 2, 0, Math.PI / 2); helmet.translate(0, 1.75, 0); armyPart(P3, helmet, 0x1c1a18, 2);
    armyPart(P3, cy(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
    const ho3 = new THREE.ConeGeometry(0.035, 0.3, 3, 1, true); ho3.translate(0.3, 4.4, 0.14); armyPart(P3, ho3, 0x9a9a98, 3);
    armyPart(P3, cy(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
    const g3 = mergeGeometries(P3); g3.computeBoundingSphere(); SOLDIER_GEO.set(key, g3); return g3;
  }
  const P = [], arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex(), lite = arm.clone().lerp(new THREE.Color(0x8a8070), 0.18).getHex();
  const cyl = (rt, rb, h, seg, x, y, z, open = true) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(x, y, z); return g; };
  for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P, cyl(0.08, 0.055, 0.82, xx ? 3 : 4, sx, 0.41, 0), 0x4c4438, pt);
  // 胴は六角（四角・五角の筒は遠目に黒い板に見えた）
  const skirt = cyl(0.19, 0.27, 0.34, xx ? 5 : 6, 0, 0.9, 0, false); skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.21, 0.175, 0.5, xx ? 5 : 6, 0, 1.33, 0, false); dou.scale(1, 1, 0.9); armyPart(P, dou, armor, 0);
  { const positions = dou.attributes.position, colors = dou.attributes.color, lace = new THREE.Color(lite);
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 1.55) colors.setXYZ(i, lace.r, lace.g, lace.b); }
  if (!xx) for (const sx of [-1, 1]) { const b = cyl(0.14, 0.15, 0.26, 3, sx * 0.22, 1.43, 0); b.scale(0.75, 1, 1); armyPart(P, b, lite, 0); }
  if (!xx) armyPart(P, cyl(0.05, 0.042, 0.5, 3, -0.29, 1.2, 0.02), 0x47526c, 0);
  const ra = cyl(0.05, 0.042, 0.5, 3, 0, 0, 0); ra.rotateX(-0.45); ra.translate(0.29, 1.2, 0.08); if (!xx) armyPart(P, ra, 0x47526c, 0);
  // 頭は日に焼けたくすんだ肌（明るい橙の玉に見えないよう）。笠は頂のある円錐で裏も閉じる（平たい円盤に見えないよう）
  const head = new THREE.SphereGeometry(0.105, xx ? 5 : 6, xx ? 3 : 4); head.scale(0.95, 1.12, 1); head.translate(0, 1.72, 0.01); armyPart(P, head, 0x6e5440, 0);
  const kasa = new THREE.ConeGeometry(0.31, 0.17, xx ? 6 : 8, 1, false); kasa.translate(0, 1.84, 0); armyPart(P, kasa, 0x2c261e, 1);
  const hachi = new THREE.SphereGeometry(0.15, xx ? 4 : 5, xx ? 1 : 2, 0, Math.PI * 2, 0, Math.PI / 2); hachi.translate(0, 1.73, 0); armyPart(P, hachi, 0x1c1a18, 2);
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.028, 0.3, 3, 1, true); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  const gun = cyl(0.025, 0.03, 1.3, 3, 0, 0, 0); gun.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.85, -0.5).normalize())); gun.translate(0.22, 1.1 + 0.55, 0.15 - 0.33); armyPart(P, gun, 0x3a2a1a, 4);
  const bow = cyl(0.012, 0.012, 2.1, 3, 0, 0, 0); bow.rotateZ(0.12); bow.translate(-0.32, 1.25, 0.08); armyPart(P, bow, 0x4a3020, 5);
  armyPart(P, cyl(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); if (!xx) armyPart(P, bar, 0x2f2419, 6);
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  SOLDIER_GEO.set(key, g);
  return g;
}
// 後詰めの兵一人の形：遠くからしか見ないので、角をさらに減らし、得物は槍と幟の竿だけ（影絵で人と槍と笠が分かれば足りる）
const HOST_GEO = new Map();
function hostGeo(armor) {
  if (HOST_GEO.has(armor)) return HOST_GEO.get(armor);
  const P = [], arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex();
  const cyl = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, Math.max(6, seg), 1, false); g.translate(x, y, z); return g; };
  for (const [sx, pt] of [[-0.1, 8], [0.1, 9]]) armyPart(P, cyl(0.075, 0.055, 0.82, 6, sx, 0.42, 0), 0x4c4438, pt);
  const skirt = cyl(0.19, 0.26, 0.34, 5, 0, 0.9, 0); skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.22, 0.18, 0.55, 5, 0, 1.33, 0); dou.scale(1, 1, 0.75); armyPart(P, dou, armor, 0);
  for (const sx of [-1, 1]) { const a = cyl(0.05, 0.045, 0.5, 3, sx * 0.28, 1.2, 0.03); armyPart(P, a, 0x47526c, 0); }
  const head = new THREE.SphereGeometry(0.1, 7, 4); head.scale(0.95, 1.1, 1); head.translate(0, 1.7, 0.01); armyPart(P, head, 0x8a6a4e, 0);
  const kasa = new THREE.ConeGeometry(0.32, 0.13, 6, 1, true); kasa.translate(0, 1.82, 0); armyPart(P, kasa, 0x2c261e, 1);
  const hachi = new THREE.ConeGeometry(0.2, 0.2, 5, 1, true); hachi.translate(0, 1.8, 0); armyPart(P, hachi, 0x1c1a18, 2);
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.03, 0.3, 3); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  armyPart(P, cyl(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); armyPart(P, bar, 0x2f2419, 6);
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  HOST_GEO.set(armor, g);
  return g;
}
// 兵ごとの色：使い込んだ具足の明るさのむらに、日焼け・褪せ（暖かい）と、濡れ・煤（冷たい）の寄りを少し
function soldierTint(col, R) {
  const v = 0.76 + R() * 0.36, w = (R() - 0.5) * 0.12;
  return col.setRGB(v * (1 + w), v * (1 + w * 0.3), v * (1 - w * 0.8));
}
// 馬（騎馬の兵の下に置く）。胴・首・頭・脚・尾。馬具の色を o.tack で
let HORSE_GEO = null;
// lo：遠い馬（38m より先）の形。角を半分ほどに（一頭 250 面ほど）
let HORSE_LO = null;
function horseGeo(lo = false) {
  if (!lo && HORSE_GEO) return HORSE_GEO;
  if (lo && HORSE_LO) return HORSE_LO;
  // 丸みのある胴・首・頭（箱の馬にしない）。胴は腹が張って背がくぼむ
  const P = [], q = (n, m) => (lo ? m : n);
  const body = new THREE.CapsuleGeometry(0.3, 0.95, q(4, 2), q(10, 6)); body.rotateX(Math.PI / 2); body.scale(0.9, 1.1, 1); body.translate(0, 1.28, 0); armyPart(P, body, 0xffffff, 20);
  const chest = new THREE.SphereGeometry(0.3, q(10, 6), q(6, 4)); chest.scale(0.85, 1.05, 0.8); chest.translate(0, 1.3, 0.55); armyPart(P, chest, 0xffffff, 20);
  const neck = new THREE.CylinderGeometry(0.11, 0.2, 0.7, q(8, 5), 1, lo); neck.rotateX(0.62); neck.translate(0, 1.66, 0.8); armyPart(P, neck, 0xffffff, 23);
  const hd = new THREE.CylinderGeometry(0.065, 0.1, 0.5, q(8, 4)); hd.rotateX(Math.PI / 2 + 0.5); hd.translate(0, 1.84, 1.12); armyPart(P, hd, 0xffffff, 23);
  for (const sd of [-1, 1]) { const ear = new THREE.ConeGeometry(0.025, 0.09, q(4, 3), 1, lo); ear.translate(sd * 0.05, 2.0, 0.95); armyPart(P, ear, 0xffffff, 23); }
  const mane = new THREE.BoxGeometry(0.04, 0.55, 0.1); mane.rotateX(0.62); mane.translate(0, 1.8, 0.68); armyPart(P, mane, 0x1a1512, 23);
  // 鞍と泥障（あおり）：馬具の色。鞍は丸く、泥障は脇に垂れる板
  const kura = new THREE.CylinderGeometry(0.34, 0.34, 0.5, q(10, 5), 1, false, -Math.PI / 2, Math.PI); kura.rotateX(Math.PI / 2); kura.scale(1, 0.55, 1); kura.translate(0, 1.47, -0.05); armyPart(P, kura, 0x3a1a14, 20);
  for (const sd of [-1, 1]) { const ao = new THREE.CylinderGeometry(0.34, 0.34, 0.48, q(8, 3), 1, true, sd > 0 ? Math.PI * 0.35 : Math.PI * 1.35, Math.PI * 0.3); ao.rotateX(Math.PI / 2); ao.translate(0, 1.25, -0.05); armyPart(P, ao, 0x3a1a14, 20); }
  for (const [x, z, pt] of [[-0.16, 0.6, 21], [0.16, 0.6, 22], [-0.16, -0.6, 22], [0.16, -0.6, 21]]) {
    const l = new THREE.CylinderGeometry(0.08, 0.045, 1.02, q(6, 4), 1, true); l.translate(x, 0.5, z); armyPart(P, l, 0xd8d0c8, pt);
    const hf = new THREE.CylinderGeometry(0.05, 0.06, 0.08, q(6, 4), 1, lo); hf.translate(x, 0.02, z); armyPart(P, hf, 0x2a2420, pt);
  }
  const tail = new THREE.CylinderGeometry(0.04, 0.1, 0.75, q(5, 3), 1, true); tail.rotateX(-0.35); tail.translate(0, 1.05, -0.87); armyPart(P, tail, 0x1a1512, 20);
  if (lo) { HORSE_LO = mergeGeometries(P); return HORSE_LO; }
  HORSE_GEO = mergeGeometries(P);
  return HORSE_GEO;
}
// 背の指物の布（竿から横へ）と、幟の布（竿の横木から垂れる）
let SASHI_GEO = null, BANNER_GEO = null, YOSE_BANNER_GEO = null, YOSE_PLUME_GEO = null;
function clothGeo(w, h, sx, sy, x0, y0, z0, part) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy); g.translate(x0 + w / 2, y0 - h / 2, z0);
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}

// 隊の並び：兵一人ずつの置き場所と種類を作る
// kind：'mixed'（前に鉄砲、中に槍、後ろに旗と騎馬の備え）・'spear'（槍の林）・'gun'（鉄砲の横列）・'bow'・'cavalry'（騎馬の塊）・'honjin'（陣幕の本陣）
function armyLayout(o, R) {
  const N = o.count || 300, w = o.w || 20, d = o.d || 10, kind = o.kind || 'mixed';
  // 大軍は一つの描画の中で備えに分ける。小さな備・本陣・鉄砲列は元の並びを保つ。
  const parts = o.sonae || (!o.yose && !o._sonae && kind === 'mixed' && N >= 240 && w >= 24 && d >= 10
    ? Array.from({ length: 3 }, (_, i) => ({ ...jinkeiSlot(o.jinkei || '横陣', i, 3, w * 0.7, d * 0.5), count: Math.floor(N / 3) + (i < N % 3 ? 1 : 0), w: w * 0.26, d: d * 0.65 })) : null);
  if (parts) {
    const list = [];
    for (const p of parts) {
      const L = armyLayout({ ...o, ...p, sonae: null, kind: p.kind || 'mixed', _sonae: true }, R);
      for (const q of L.list) { q.lx += p.right || 0; q.lz += p.front || 0; list.push(q); }
    }
    const important = list.filter((q) => q.imp || q.k === 4);
    return { list: important.concat(list.filter((q) => !(q.imp || q.k === 4))), nImp: important.length };
  }
  const flagP = o.flagRate ?? (kind === 'cavalry' ? 0.95 : 0.85);
  const S = [];
  const put = (lx, lz, k, x = {}) => S.push({
    lx, lz, k, helm: x.helm ?? (k === 3 || k === 5 || k === 6 ? 1 : (R() < 0.08 ? 1 : 0)),
    ex: x.ex ?? 0, flag: x.flag ?? (k === 4 || k === 6 ? 0 : (R() < flagP ? 1 : 0)), yaw: x.yaw || 0, imp: k >= 3 ? 1 : 0, general: x.general,
  });
  // 四角の中に n 人を横の間 sx・縦の間 sz で前から詰める（入りきらなければ縦を詰める）
  const block = (n, x0, x1, z0, z1, k, sx, sz, f) => {
    if (n <= 0) return;
    const cols = Math.max(1, Math.min(n, Math.round((x1 - x0) / sx)));
    const rows = Math.ceil(n / cols);
    const gz = Math.min(sz, Math.max(0.5, (z1 - z0)) / rows);
    const ph = R() * 6;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const cx = c + (cols - inRow) / 2;
      const lx = x0 + (cx + 0.5) * (x1 - x0) / cols + (R() - 0.5) * sx * 0.35;
      const lz = z1 - (r + 0.5) * gz + Math.sin(lx * 0.23 + ph + r) * 0.25 + (R() - 0.5) * gz * 0.3;
      put(lx, lz, k, f ? f(r, c, rows) : {});
    }
  };
  const hw = w / 2, hd = d / 2;
  const nb = o.banners ?? Math.max(1, Math.min(12, Math.round(w / 4), Math.round(N * 0.08)));
  const banners = (z) => { for (let i = 0; i < nb; i++) put(-hw + (i + 0.5) * w / nb + (R() - 0.5) * 0.8, z + (R() - 0.5) * 0.5, 4); };
  const spearF = () => ({ ex: 1.25 + R() * 0.3 });
  if (o.yose && (kind === 'mixed' || kind === 'cavalry') && N >= 12) {
    // 前列は一続きの騎馬横隊。中央の侍大将と両脇の旗本を、徒歩の林が追う。
    const cols = Math.max(3, Math.min(N - 5, 21, Math.floor(w / 1.35))) | 1;
    const nBanner = Math.min(36, Math.max(3, Math.floor(N * 0.16)), N - cols - 2);
    const centre = Math.floor(cols / 2);
    for (let i = 0; i < cols; i++) put((i - centre) * Math.min(1.45, w / cols), hd - 0.7, 5,
      { helm: 1, ex: i === centre ? 2 : 0, general: i === centre ? o.general : undefined });
    for (let i = 0; i < nBanner; i++) {
      const per = Math.max(3, Math.ceil(nBanner / 3)), row = Math.floor(i / per), c = i % per;
      put(-hw + (c + 0.5) * w / per, hd - 3.2 - row * Math.max(1.1, (d - 4) / 3), 4, { ex: i % 6 });
    }
    const rest = N - S.length;
    const guns = kind === 'mixed' ? Math.floor(rest * 0.14) : 0;
    const bows = kind === 'mixed' ? Math.floor(rest * 0.06) : 0;
    block(guns, -hw, hw, -hd, -hd + 1.2, 1, 1, 1);
    block(bows, -hw, hw, -hd + 1.3, -hd + 2.3, 2, 1, 1);
    block(rest - guns - bows, -hw, hw, -hd + 2.4, hd - 3.4, 0, 0.95, 1, spearF);
  } else if (kind === 'spear') {
    banners(-hd + 0.5);
    put(0, hd - 0.2, 3); put(-hw * 0.5, hd - 0.2, 3);
    block(N - nb - 2, -hw, hw, -hd + 1.3, hd - 1.0, 0, 0.95, 1.0, spearF);
  } else if (kind === 'gun' || kind === 'bow') {
    const k = kind === 'gun' ? 1 : 2;
    const nr = Math.max(1, Math.min(3, Math.floor(d / 2)));
    banners(-hd + 0.4);
    put(0, -hd + 1.4, 3); put(hw * 0.6, -hd + 1.4, 3);
    const n = N - nb - 2, per = Math.ceil(n / nr);
    for (let r = 0; r < nr; r++) {
      const z = hd - 0.4 - r * Math.min(2.2, (d - 1.5) / nr);
      block(Math.min(per, n - r * per), -hw, hw, z - 0.5, z + 0.5, k, Math.max(0.9, w / per), 1, () => ({ ex: k === 1 && r === 0 ? 1 : 0 }));
    }
  } else if (kind === 'cavalry') {
    // 騎馬は塊ごとに間を空け、塊の中は前後左右に詰める。後ろに徒の旗持ち
    const foot = Math.min(nb, 6);
    for (let i = 0; i < foot; i++) put(-hw + (i + 0.5) * w / foot, -hd + 0.4, 4);
    put(0, hd - 0.6, 5, { helm: 1 });
    const n = N - foot - 1;
    const clumps = Math.max(1, Math.round(w / 9));
    const cw = w / clumps;
    for (let c = 0; c < clumps; c++) {
      const m = Math.round(n / clumps) + (c === clumps - 1 ? n - Math.round(n / clumps) * clumps : 0);
      block(m, -hw + c * cw + 0.8, -hw + (c + 1) * cw - 0.8, -hd + 1.6, hd - 2.2, 5, 1.25, 2.7, () => ({ helm: R() < 0.6 ? 1 : 0 }));
    }
  } else if (kind === 'honjin') {
    // 真ん中に陣幕。中の奥に床几の大将、左右に並ぶ旗本。幕の後ろに旗の林、周りを槍の備えが囲む
    const jw = Math.min(16, w * 0.55), jd = Math.min(12, d * 0.55), jz = -hd * 0.1;
    o._maku = { w: jw, d: jd, z: jz };
    put(0, jz - jd / 2 + 1.8, 6, { flag: 0 });
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) put(sx * (jw / 2 - 1.6), jz - jd / 2 + 3.2 + i * 1.5, 3, { yaw: -sx * Math.PI / 2, flag: 1 });
    const nbj = Math.min(26, Math.max(6, Math.round(N * 0.14)));
    for (let i = 0; i < nbj; i++) put(-jw / 2 + (i % 13 + 0.5) * jw / 13 + (R() - 0.5) * 0.4, jz - jd / 2 - 1.2 - Math.floor(i / 13) * 1.4, 4);
    const rest = N - S.length;
    const front = Math.round(rest * 0.45), side = Math.round(rest * 0.2);
    block(front, -hw, hw, jz + jd / 2 + 1.5, hd, 0, 1.0, 1.0, spearF);
    block(side, -hw, -jw / 2 - 1.2, -hd, jz + jd / 2, 0, 1.0, 1.0, spearF);
    block(side, jw / 2 + 1.2, hw, -hd, jz + jd / 2, 0, 1.0, 1.0, spearF);
    block(rest - front - side * 2, -hw, hw, -hd, jz - jd / 2 - 3.2, 3, 1.1, 1.1);
  } else if (Math.min(w, d) < 7) {
    // 細長い列：長い辺の後ろに旗、前に鉄砲が一列（入る時だけ）、あとは槍
    const long = w >= d;
    const nb2 = Math.max(1, Math.round(Math.max(w, d) / 5));
    for (let i = 0; i < nb2; i++) { const t = (i + 0.5) / nb2 - 0.5; if (long) put(t * w, -hd + 0.3, 4); else put(-hw + 0.3, t * d, 4); }
    if (long && d >= 3) { const g = Math.round(w / 1.1); block(g, -hw, hw, hd - 0.8, hd, 1, 1.1, 1, () => ({ ex: 1 })); }
    block(N - S.length, long ? -hw : -hw + 0.8, hw, -hd + (long ? 0.8 : 0), long && d >= 3 ? hd - 1.2 : hd, 0, 0.95, 1.0, spearF);
  } else {
    // 混ぜた備え：前に鉄砲の二列（前列は片膝）、次に弓、中は槍、後ろに旗持ちと騎馬の武者
    const gunN = Math.round(N * 0.16), bowN = Math.round(N * 0.07), cav = N >= 120 && d >= 8 ? Math.min(10, Math.round(N * 0.04)) : 0;
    banners(-hd + 0.4);
    put(0, o.generalRear ? -hd + 3 : 0, 5, { helm: 1, general: o.general }); put(0.9, o.generalRear ? -hd + 2.2 : -0.8, 4); // 指定した備えの大将と馬印は槍の後ろ
    put(-hw * 0.3, -hd + 1.6, 3); put(hw * 0.3, -hd + 1.6, o.secondGeneral ? 5 : 3, { general: o.secondGeneral });
    const g1 = Math.ceil(gunN / 2);
    block(g1, -hw, hw, hd - 0.9, hd - 0.1, 1, Math.max(0.9, w / g1), 1, () => ({ ex: 1 }));
    block(gunN - g1, -hw, hw, hd - 2.2, hd - 1.2, 1, Math.max(0.9, w / (gunN - g1 || 1)), 1);
    block(bowN, -hw, hw, hd - 3.4, hd - 2.5, 2, Math.max(0.9, w / (bowN || 1)), 1);
    block(cav, -Math.min(hw, 6), Math.min(hw, 6), -hd + 1.0, -hd + 3.8, 5, 1.3, 2.6);
    const spN = N - S.length;
    block(spN, -hw, hw, -hd + (cav ? 4.2 : 1.2), hd - 3.6, 0, 0.95, 1.0, spearF);
  }
  // 塊の縁を崩す：縁の兵は前後左右に散り、ところどころ列から遅れた者・後ろへ下がった者がいる（長方形の塊に見えないように）
  if (kind !== 'honjin' && !o.yose) {
    for (const q of S) {
      if (q.imp || q.k === 4) continue;
      const ex = Math.abs(q.lx) > hw - 1.6, ez = Math.abs(q.lz) > hd - 1.3;
      if (ex || ez) { q.lx += (R() - 0.5) * 2.2; q.lz += (R() - 0.5) * 1.6; }
      const r = R();
      if (r < 0.03) q.lz -= hd * 0.6 + R() * 5;                                   // 後ろへ遅れた者
      else if (r < 0.045) q.lx += (q.lx >= 0 ? 1 : -1) * (1.5 + R() * 3);        // 横へはみ出した者
    }
  }
  // 大事な者（旗持ち・侍・騎馬・大将）を先に、残りは混ぜる。遠くで数を間引く時に、旗と騎馬が残るように
  const imp = S.filter((s) => s.imp || s.k === 4), rest = S.filter((s) => !(s.imp || s.k === 4));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return { list: imp.concat(rest), nImp: imp.length };
}

// 空の映り込み（漆や鉄に空が映る）を作るために、描画器を借りる
let RENDERER = null;
export function setRenderer(r) { RENDERER = r; }
export function hasMultiDraw() { return !!RENDERER?.extensions?.has('WEBGL_multi_draw'); }

// ======================================================================
// 城と砦の縄張り（乱数の種で城ごとに変わる。同じ種なら毎回同じ）
// castlePlan({ seed, x, z, kind: 'fort'|'castle', n, r, base })：頂の主郭から、尾根と斜面へ段違いの曲輪を枝分かれに重ね、
//   曲輪の間を折れる坂道・二重の門（枡形）・土橋・堀切・空堀でつなぐ。返す物：{ kuruwa[], paths[], gates[], moats[], cuts[] }
//   kuruwa：{ x, z, w, d, rot, lv（主郭からの下がり m）, h（その面の高さ）, kind: 'hon'|'ni'|'koshi'|'umadashi', parent }
//   paths：坂道の折れ点の並び [[x, z], …]（下の曲輪の門から上の曲輪の門へ。途中で直角に折れ、上の曲輪の縁の下を通る＝横矢）
//   gates：{ x, z, rot, k（その曲輪）, masu（枡形の内の門なら true） }
// World は def.castle があれば、この縄張りで地形を段にする（曲輪は平ら、縁は急な土塁の斜面、堀は窪み、道は坂）
// ======================================================================
export function castlePlan(o) {
  let sd = (o.seed || 1) * 2654435761 >>> 0;
  const R = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  const fort = o.kind === 'fort', cx = o.x || 0, cz = o.z || 0, rad = o.r || (fort ? 40 : 70);
  const N = o.n || (fort ? 4 + Math.floor(R() * 2) : 7 + Math.floor(R() * 4));
  const top = (o.base || 0) + (o.rise ?? (fort ? 5 : 14));
  const rot0 = R() * Math.PI * 2;
  const K = [];
  const hon = { x: cx, z: cz, w: fort ? 20 : 26 + R() * 6, d: fort ? 15 : 18 + R() * 5, rot: rot0, lv: 0, kind: 'hon', parent: -1 };
  K.push(hon);
  const corners = (k, pad = 0) => { const c = Math.cos(k.rot), s2 = Math.sin(k.rot), hw = k.w / 2 + pad, hd = k.d / 2 + pad; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [k.x + a * c + b * s2, k.z - a * s2 + b * c]); };
  const overlap = (a, b, pad) => Math.hypot(a.x - b.x, a.z - b.z) < (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2 * 0.72 + pad;
  // 尾根の向き：主郭から二、三本の尾根が下る（曲輪はその上に段々に並ぶ）
  const ridges = [rot0, rot0 + Math.PI + (R() - 0.5) * 0.8, rot0 + Math.PI / 2 + (R() - 0.5) * 0.6].slice(0, fort ? 2 : 3);
  let tries = 0;
  while (K.length < N && tries++ < 400) {
    // 親：尾根の先の曲輪を好む（段が尾根に沿って続く）。ときどき脇へ腰曲輪
    const pi = R() < 0.65 ? K.length - 1 - Math.floor(R() * Math.min(3, K.length)) : Math.floor(R() * K.length);
    const P = K[Math.max(0, pi)];
    const side = R() < 0.3 || P.kind === 'koshi';
    const ridge = P.ridge ?? ridges[K.length % ridges.length];
    const ang = side ? ridge + (R() < 0.5 ? 1 : -1) * Math.PI / 2 : ridge + (R() - 0.5) * 0.7;
    const small = side || R() < 0.25;
    const w = small ? (fort ? 9 : 12) + R() * 6 : (fort ? 13 : 16) + R() * 10, d = small ? 6 + R() * 4 : (fort ? 9 : 11) + R() * 7;
    const gap = (fort ? 5 : 7) + R() * 5;
    const dist = Math.max(P.w, P.d) / 2 + Math.max(w, d) / 2 + gap;
    const k = { x: P.x + Math.sin(ang) * dist, z: P.z + Math.cos(ang) * dist, w, d, rot: ang + (R() - 0.5) * 0.5 + (R() < 0.5 ? Math.PI / 2 : 0),
      lv: P.lv + (fort ? 1.6 + R() * 1.4 : 2.5 + R() * 2.5), kind: side ? 'koshi' : K.length === 1 ? 'ni' : 'ni', parent: K.indexOf(P), ridge: side ? P.ridge ?? ridge : ridge };
    if (Math.hypot(k.x - cx, k.z - cz) > rad) continue;
    if (K.some((q) => overlap(q, k, 2))) continue;
    K.push(k);
  }
  // 馬出：一番下の曲輪の外に、小さな半円の出丸（門の前を守る）
  const low = K.reduce((a, b) => (b.lv > a.lv ? b : a));
  { const ang = Math.atan2(low.x - cx, low.z - cz), dist = Math.max(low.w, low.d) / 2 + 7;
    const m = { x: low.x + Math.sin(ang) * dist, z: low.z + Math.cos(ang) * dist, w: 9, d: 6, rot: ang, lv: low.lv + 1, kind: 'umadashi', parent: K.indexOf(low) };
    if (!K.some((q) => q !== low && overlap(q, m, 1))) K.push(m); }
  for (const k of K) k.h = top - k.lv;
  // 門と坂道：子の曲輪の、親に向いた縁の真ん中から出て、一度直角に折れ、親の縁の門へ（親の縁の下を通る＝上から横矢）
  const gates = [], paths = [];
  const edgeGate = (k, tx, tz) => {
    // k の四辺のうち (tx, tz) に向いた辺の、少し片寄った所
    const c = Math.cos(k.rot), s2 = Math.sin(k.rot), lx = (tx - k.x) * c - (tz - k.z) * s2, lz = (tx - k.x) * s2 + (tz - k.z) * c;
    const ax = Math.abs(lx) / (k.w / 2), az = Math.abs(lz) / (k.d / 2), off = (R() - 0.5) * 0.5;
    let gx, gz, rot;
    if (ax > az) { gx = Math.sign(lx) * k.w / 2; gz = off * k.d / 2; rot = k.rot + Math.PI / 2; } else { gx = off * k.w / 2; gz = Math.sign(lz) * k.d / 2; rot = k.rot; }
    return { x: k.x + gx * c + gz * s2, z: k.z - gx * s2 + gz * c, rot };
  };
  K.forEach((k, i) => {
    if (k.parent < 0) return;
    const P = K[k.parent];
    const a = edgeGate(k, P.x, P.z), b = edgeGate(P, k.x, k.z);
    gates.push({ ...a, k: i }, { ...b, k: k.parent, masu: P.kind === 'hon' });
    // 折れ点：a から親の縁に沿って横へ出てから b へ（L 字。遠ければ二度折れる）
    const mid = R() < 0.5 ? [a.x, b.z] : [b.x, a.z];
    const pts = [[a.x, a.z], mid, [b.x, b.z]];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 22) { const m2 = [(a.x + mid[0]) / 2 + (R() - 0.5) * 6, (a.z + mid[1]) / 2 + (R() - 0.5) * 6]; pts.splice(1, 0, m2); }
    paths.push({ pts, from: i, to: k.parent, lv0: k.h, lv1: P.h });
  });
  // 大手：一番下の曲輪から、外（主郭と反対）へ下る道
  { const k = K.reduce((a, b) => (b.lv > a.lv ? b : a)), ang = Math.atan2(k.x - cx, k.z - cz);
    const g = edgeGate(k, k.x + Math.sin(ang) * 99, k.z + Math.cos(ang) * 99);
    gates.push({ ...g, k: K.indexOf(k), ote: true });
    const out = [g.x + Math.sin(ang) * 18, g.z + Math.cos(ang) * 18];
    paths.push({ pts: [[g.x, g.z], [g.x + Math.sin(ang + 0.9) * 8, g.z + Math.cos(ang + 0.9) * 8], out], from: -1, to: K.indexOf(k), lv0: o.base || 0, lv1: k.h, ote: true }); }
  // 堀切：尾根の上で、曲輪と曲輪の間を断つ溝（道の所は土橋で渡る）。空堀：主郭のまわり
  const cuts = [];
  K.forEach((k, i) => { if (k.parent >= 0 && k.kind !== 'koshi' && R() < 0.6) { const P = K[k.parent]; const mx = (k.x + P.x) / 2, mz = (k.z + P.z) / 2, ang = Math.atan2(k.x - P.x, k.z - P.z); cuts.push({ x: mx, z: mz, rot: ang + Math.PI / 2, len: Math.max(k.w, k.d) * 0.9 + 6, w: 3.2 }); } });
  const moats = [{ pts: corners(hon, 4.5), closed: true, w: 3 }];
  return { year: o.year, stone: o.stone, tenshu: o.tenshu, kind: o.kind || 'castle', seed: o.seed || 1, x: cx, z: cz, top, base: o.base || 0, kuruwa: K, gates, paths, cuts, moats, corners };
}
// 曲輪の縁までの近さ（内は負）
function rectDist(k, x, z) {
  const c = Math.cos(k.rot), s = Math.sin(k.rot), lx = (x - k.x) * c - (z - k.z) * s, lz = (x - k.x) * s + (z - k.z) * c;
  const dx = Math.abs(lx) - k.w / 2, dz = Math.abs(lz) - k.d / 2;
  return Math.max(dx, dz) > 0 ? Math.hypot(Math.max(0, dx), Math.max(0, dz)) : Math.max(dx, dz);
}
export function castleInside(plan, x, z, pad = 0) { return plan.kuruwa.some((k) => rectDist(k, x, z) < pad); }
// 縄張りで地形を段にする：曲輪の面は平ら、縁は急な斜面（1m 下がるのに 0.8m）、堀切と空堀は窪み、坂道は両端の高さを結ぶ坂
export function castleHeight(plan, x, z, h0) {
  let h = h0, inK = false;
  for (const k of plan.kuruwa) {
    const d = rectDist(k, x, z);
    if (d < 0) { h = Math.max(h, k.h); inK = true; }
    else h = Math.max(h, k.h - d * 1.25);
  }
  // 坂道（幅 2.6m）：道の上では、道の両端の高さの間をなめらかに結ぶ（段を登れるように）
  for (const p of plan.paths) {
    let best = 9, bt = 0, acc = 0, tot = 0;
    for (let i = 0; i < p.pts.length - 1; i++) tot += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
      const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
      if (d < best) { best = d; bt = (acc + t * L) / tot; }
      acc += L;
    }
    if (best < 2.6) { const ph = p.lv0 + (p.lv1 - p.lv0) * bt; const k = best < 1.4 ? 1 : 1 - (best - 1.4) / 1.2; if (!inK || best < 1.4) h = h * (1 - k) + ph * k; }
  }
  // 堀切・空堀（道の所は土橋として残す）
  const onPath = (px, pz) => plan.paths.some((p) => distToPolyline(px, pz, p.pts) < 2);
  for (const c of plan.cuts) {
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot), lx = (x - c.x) * cs - (z - c.z) * sn, lz = (x - c.x) * sn + (z - c.z) * cs;
    if (Math.abs(lx) < c.len / 2 && Math.abs(lz) < c.w && !onPath(x, z)) h -= 2.4 * (1 - Math.abs(lz) / c.w);
  }
  for (const m of plan.moats) {
    const pts = m.closed ? [...m.pts, m.pts[0]] : m.pts, d = distToPolyline(x, z, pts);
    if (d < m.w && !onPath(x, z)) h -= 2.0 * (1 - d / m.w);
  }
  return h;
}

export class World {
  constructor(scene, def) {
    for (const k of Object.keys(NEAR_REQ)) delete NEAR_REQ[k];   // 前の戦の頼みを持ち越さない
    ARMY_NEAR.value = 0;
    ARMY_REAL_R.value = 0;
    ARMY_REAL_P.value.set(1e5, 1e5);
    this.scene = scene;
    this.def = def;
    this.field = fieldState(def);
    this.villageFields = [];
    // 川と田は全戦で足を取る。明示した例外だけ止める。
    if (def.waterSlow == null) def.waterSlow = true;
    // 広い山城も地面の頂点数は増やさない。
    this.half = def.groundHalf || HALF;
    // 戦ごとの風の向き（def.wind：[x, z]。無ければ雨の向き、それも無ければ南西の風）。旗・煙・草・雨がみな同じ向きに流れる
    { const wd = def.wind || def.rainDir || [0.565, 0.825], l = Math.hypot(wd[0], wd[1]) || 1; WIND_STATE.dirX = wd[0] / l; WIND_STATE.dirZ = wd[1] / l;
      WIND_DIR.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
      WIND_STATE.t = 0; WIND.value = 0;
      WIND_STATE.gust = GUST.value = Math.max(0, def.windStrength ?? 1); }
    this.grid = new Float32Array((SEG + 1) * (SEG + 1));
    this.step = (this.half * 2) / SEG;
    // 城・砦の縄張り（def.castle：{ seed, x, z, kind, n, r, rise }）。地形を段にして、props.js の buildCastle が塀・門・櫓を置く
    this.castle = def.castle ? castlePlan({ ...def.castle, base: def.height(def.castle.x || 0, def.castle.z || 0) }) : null;
    for (let j = 0; j <= SEG; j++) {
      for (let i = 0; i <= SEG; i++) {
        const x = -this.half + i * this.step, z = -this.half + j * this.step;
        let h = def.height(x, z);
        // 細かな起伏：数メートルごとのうねり（平らすぎる地面をなくす）
        const pd = def.paddy ? def.paddy(x, z) : 0;
        const flat = (def.clear && def.clear(x, z)) || pd > 0 || (this.castle && castleInside(this.castle, x, z, 3));
        if (this.castle) h = castleHeight(this.castle, x, z, h);
        if (!flat) h += (Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2) * Math.cos(z * 0.27 - x * 0.05) * 0.28 + Math.sin(x * 0.83 + z * 0.61) * 0.07);
        // 田は畦より一段低い（水を張った面が畦に囲まれて見える）。畦が土手に見えるよう、段を深めに
        h -= pd * 0.32;
        // 小川：流れに沿って地面を掘り下げる
        for (const st of def.streams || []) {
          const d = distToPolyline(x, z, st.pts);
          if (d < st.w * 2) h -= (st.depth - fordLift(st, x)) * Math.pow(1 - d / (st.w * 2), 1.5);
        }
        this.grid[j * (SEG + 1) + i] = h;
      }
    }
    // 朝の戦か（def.mood が無ければ、朝靄の戦を朝とみなす）
    this.mood = def.mood || MOOD_BY_SEED[def.seed] || (def.mist ? 'morning' : 'plain');
    this.buildLights();
    // 火の光は、はじめから数の決まった光（3 つ）を置いておき、近い火に付け替える。
    // 戦の途中で光の数が変わると、すべての材質の作り直し（数百 ms の引っかかり）が起きるため
    //   画質「低」（携帯）は 2 つ（光が一つ減るだけ、すべての材質の一画素ごとの手間が減る）
    this.firePool = (SETTINGS.quality === 'low' ? [0, 1] : [0, 1, 2]).map(() => { const L = new THREE.PointLight(0xff9a4a, 0, 16, 1.6); L.position.set(0, -50, 0); scene.add(L); return { L, f: null }; });
    this.buildWear();
    this.buildTerrain();
    this.buildVegetation();
    if (def.water) { this.buildWater(def.water); this.buildReeds(); }
    for (const st of def.streams || []) this.buildStream(st);
    this.buildRain();
    this.buildSky();
    this.buildFarLand();
    this.buildDust();
    this.buildBirds();
    this.fires = [];
    this.cloudPhase = (def.seed || 0) * 37 % 900;
    this.setTime(def.time || 'day');
    if (BattleTime.supports(def.battleKey)) this.dayClock = new BattleTime(this, def.battleKey);
    this.rainLevel = 0;
    this.targetRain = 0;
    POST.drops = 0; POST.smoke = 0;
    this.updateExposure(99);
  }

  // その地点の草の割合（地面を混ぜた割合から読む。0〜1）
  grassAt(x, z) {
    if (!this.splat) return 1;
    const i = Math.max(0, Math.min(SEG, Math.round((x + this.half) / this.step))), j = Math.max(0, Math.min(SEG, Math.round((z + this.half) / this.step)));
    const k = j * (SEG + 1) + i;
    return this.waterW[k] > 0.3 ? 0 : this.splat[k * 3];
  }

  heightAt(x, z) {
    // 北へ長い野戦は、砦の細かな格子を保ったまま外の地面へつなぐ。
    if (this.def.fieldNorth != null && z < -this.half) return this.def.height(x, z);
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const i = Math.max(0, Math.min(SEG - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(SEG - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
    const g = this.grid, W = SEG + 1;
    const a = g[j * W + i], b = g[j * W + i + 1], c = g[(j + 1) * W + i], d = g[(j + 1) * W + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // 勾配の急さ（tan）。山城の切岸・急な斜面は登れない（道・梯子・階段＝def.paths は例外）
  slopeTan(x, z) {
    const e = 0.8;
    const h0 = this.heightAt(x, z);
    const hx = this.heightAt(x + e, z) - h0;
    const hz = this.heightAt(x, z + e) - h0;
    return Math.hypot(hx, hz) / e;
  }

  onRoad(x, z) {
    const paths = this.def.paths;
    if (!paths || !paths.length) return false;
    for (const p of paths) {
      const pts = p && p.pts ? p.pts : p;
      if (pts && pts.length && distToPolyline(x, z, pts) < (p.w ?? this.def.pathWidth ?? 2)) return true;
    }
    return false;
  }

  // 35度ほどより急な坂は、道・梯子・階段の上でなければ登れない（山城の切岸・急な斜面のため）
  // 土塁に climbAt（登れる所）を書いた時は、そのほかの土塁の上は通さない（castle_parts.js の doruiLine が noClimb に置く。束21）
  // この勾配の判定は、noClimb を使う山城の戦か def.climbTan を書いた山の戦でだけ効かせる：野戦は国土地理院の実測地形を混ぜている所があり（例：桶狭間）、
  //   実測の細かい尾根が35度を超える所があって、道から離れると進めなくなってしまったため（kaito 10/1）
  walkable(x, z, y) {
    if (this.def.fieldNorth != null && (z < this.def.fieldNorth + 10 || z > this.half - 10 || Math.abs(x) > this.half - 10)) return false;
    if ((this.def.riverCross || this.def.streams?.some(st => st.fords?.length)) && this.waterFootDepthAt(x, z, groundAt(this, x, z, y ?? this.heightAt(x, z))) > 0.85) return false;
    if (this.noClimb) for (const f of this.noClimb) if (f(x, z)) return false;
    if (!this.noClimb && this.def.climbTan == null) return true;
    return this.slopeTan(x, z) <= (this.def.climbTan ?? 0.70) || this.onRoad(x, z);   // 山の戦は def.climbTan で登れる急さを変える（比叡山）
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    // 昼用の半球光は空の映り込みを見込んで弱めてある。夜の暗い空では
    // 濡れた土・黒い具足が沈むので、影にも届く青い散乱光を一つだけ共有する。
    // 標準材質の人・旗と、低・中の地面の材質に同じ光を当てる。影の描き直しは足さない。
    this.nightFill = new THREE.HemisphereLight(0xc0d0ed, 0x8b9bb9, 0);
    this.scene.add(this.nightFill);
    this.nightU = { value: 0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 300;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0xaaaaaa, 40, 230);
  }

  // ---------------- 踏み荒らし ----------------
  // 兵が歩いた所ほど草が倒れ、土と泥が出る（戦が進むほど足もとが荒れる）。1枚の小さな絵に踏まれた量を貯める
  buildWear() {
    const S = 256;
    this.wearS = S;
    // r：踏み荒らし（草が倒れて土・泥が出る）、g：血の跡（打たれた所の地面に黒ずんだ赤が染みる）
    this.wearData = new Uint8Array(S * S * 2);
    this.wearTex = new THREE.DataTexture(this.wearData, S, S, THREE.RGFormat, THREE.UnsignedByteType);
    this.wearTex.magFilter = THREE.LinearFilter; this.wearTex.minFilter = THREE.LinearFilter;
    this.wearTex.needsUpdate = true;
    WEAR.value = this.wearTex;
    WEAR_HALF.value = this.half;
    this.wearDirty = 0;
  }
  // (x, z) の周り半径 r m を踏む（amt は一度に増える量 0〜255）
  stampWear(x, z, r = 1.2, amt = 10, ch = 0) {
    const S = this.wearS, k = S / (this.half * 2);
    const cx = (x + this.half) * k, cz = (z + this.half) * k, rr = Math.max(0.6, r * k);
    const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(S - 1, Math.ceil(cx + rr));
    const z0 = Math.max(0, Math.floor(cz - rr)), z1 = Math.min(S - 1, Math.ceil(cz + rr));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const dx = i - cx, dz = j - cz, d2 = (dx * dx + dz * dz) / (rr * rr);
      if (d2 >= 1) continue;
      const o = (j * S + i) * 2 + ch;
      this.wearData[o] = Math.min(255, this.wearData[o] + amt * (1 - d2));
    }
    this.wearDirty++;
  }
  // 血の跡：打たれた所の足もとに染みる（重なるほど濃く、大きく）
  stampBlood(x, z, r = 0.7, amt = 40) { this.stampWear(x, z, r, amt, 1); }
  // その地点の踏み荒らし（0〜1）
  wearAt(x, z) {
    const S = this.wearS, i = Math.max(0, Math.min(S - 1, Math.round((x + this.half) / (this.half * 2) * S))), j = Math.max(0, Math.min(S - 1, Math.round((z + this.half) / (this.half * 2) * S)));
    return this.wearData[(j * S + i) * 2] / 255;
  }

  // ---------------- 地図の外の遠景 ----------------
  // 戦場の外にも野と丘が続き、杉林・田・村の家並みが霞の中に見える（兵は入らない。軽い作り）
  buildFarLand() {
    const def = this.def, R = rng((def.seed || 1) * 7 + 3);
    const EXT = this.half + 150, N = 66, STEP = EXT * 2 / N;
    const extraNorth = def.fieldNorth == null ? 0 : Math.max(0, Math.ceil((-EXT - def.fieldNorth) / STEP));
    const NZ = N + extraNorth, north = -EXT - extraNorth * STEP;
    const W = def.water;
    const inWater = (x) => W && x > W.x - 3 && x < (W.x2 ?? 1e9) + 3;
    // 小川は地図の端から先へまっすぐ延ばす
    const streams = (def.streams || []).map((st) => {
      const p = st.pts, a = p[0], b = p[1], y = p[p.length - 1], z = p[p.length - 2];
      const ext = (u, v) => { const dx = u[0] - v[0], dz = u[1] - v[1], l = Math.hypot(dx, dz) || 1; return [u[0] + dx / l * 250, u[1] + dz / l * 250]; };
      return { pts: [ext(a, b), ...p, ext(y, z)], w: st.w };
    });
    const clamp = (v) => Math.max(-this.half, Math.min(this.half, v));
    const out = (x, z) => Math.max(Math.abs(x) - this.half, Math.abs(z) - this.half);
    const hills = (x, z) => 6 + Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.4) * 9 + Math.sin(x * 0.031 - z * 0.027) * 3.5 + Math.sin(z * 0.05 + x * 0.004) * 1.5;
    const riverAt = (x, z) => { let d = Infinity; for (const st of streams) d = Math.min(d, distToPolyline(x, z, st.pts) - st.w * 1.5); return d; };
    this.farH = (x, z) => {
      if (def.fieldNorth != null && z < -this.half && Math.abs(x) <= this.half) return this.heightAt(x, z);
      const o = out(x, z);
      const edge = this.heightAt(clamp(x), clamp(z));
      if (o <= 0.01) return edge - 0.35;
      const t = Math.min(1, o / 110), s = t * t * (3 - 2 * t);
      let h = edge + (hills(x, z) - 2) * s - 0.35 * (1 - s);
      if (inWater(x)) h = Math.min(h, W.level - 1.2);
      const rd = riverAt(x, z);
      if (rd < 8) h = Math.min(h, edge - 1.2 + Math.max(0, rd) * 0.4);
      return h;
    };
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= N; i++) {
      const x = -EXT + i * STEP, z = north + j * STEP;
      const h = this.farH(x, z);
      pos.push(x, h, z);
      // 低い所は田と畑（明るい緑と土色の区画）、丘は雑木と杉の森（暗い緑）
      const forest = Math.sin(x * 0.021 + 2.1) * Math.cos(z * 0.017 - 1.2) * 0.5 + 0.5 + (R() - 0.5) * 0.3 + (h - 6) * 0.03;
      if (forest > 0.55) c.setRGB(0.1 + R() * 0.03, 0.15 + R() * 0.04, 0.09);
      else {
        const f = ((Math.floor(x / 23) + Math.floor(z / 17)) & 3);
        c.setRGB(...[[0.3, 0.38, 0.18], [0.36, 0.4, 0.2], [0.34, 0.3, 0.2], [0.26, 0.34, 0.16]][f]);
      }
      if (riverAt(x, z) < 6 || inWater(x)) c.setRGB(0.24, 0.25, 0.2);
      col.push(c.r, c.g, c.b);
      if (i < N && j < NZ) {
        const x1 = x + STEP, z1 = z + STEP;
        // 地図の中に隠れる区画は作らない
        if (!(x >= -this.half && x1 <= this.half && z >= -this.half && z1 <= this.half)) {
          const k = j * (N + 1) + i;
          idx.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 遠くの野にも大小の斑（畑の区切り・草の濃淡）を入れる。頂点の色だけだと、のっぺりした一色の面に見える
    const landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    landMat.onBeforeCompile = (sh) => {
      sh.uniforms.tMacro = { value: macroTex() };
      sh.vertexShader = 'varying vec2 vLW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D tMacro; varying vec2 vLW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float lm = texture2D(tMacro, vLW * 0.0045).r * 0.6 + texture2D(tMacro, vLW * 0.021 + 0.3).r * 0.4;
        diffuseColor.rgb *= mix(0.78, 1.18, lm);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.05, 0.82), smoothstep(0.6, 0.8, texture2D(tMacro, vLW * 0.011 + 0.7).r) * 0.6);`);
    };
    const land = new THREE.Mesh(g, landMat);
    this.scene.add(land);
    this.farLand = land;
    const okFar = (x, z) => out(x, z) > 6 && !inWater(x) && riverAt(x, z) > 10;
    // 遠くの森：杉の円錐と、丸い雑木の樹冠（一つの形にまとめて並べる）
    {
      const parts = [];
      const put = (geo, hex) => { const cc = new THREE.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3); for (let q = 0; q < n; q++) { a[q * 3] = cc.r; a[q * 3 + 1] = cc.g; a[q * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(geo.index ? geo.toNonIndexed() : geo); };
      // 形の縁をでこぼこに（霞の中で影絵になっても、きれいな円錐や多面体に見えないように）
      const JR = rng(313);
      const rough = (geo, amt) => { const p = geo.attributes.position; for (let q = 0; q < p.count; q++) { const k = 1 + (JR() - 0.5) * 2 * amt; p.setXYZ(q, p.getX(q) * k, p.getY(q) + (JR() - 0.5) * amt, p.getZ(q) * k); } geo.computeVertexNormals(); return geo; };
      // 杉：枝の段が三つ重なった、先の尖った樹冠
      [[2.4, 4.6, 5.6], [1.8, 4.2, 8.4], [1.1, 4.0, 11.2]].forEach(([r, h, y]) => { const cg = rough(new THREE.ConeGeometry(r, h, 7, 1), 0.22); cg.translate(0, y, 0); put(cg, 0x1f3122); });
      const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, 4); trunk.translate(0, 1.5, 0); put(trunk, 0x2e2418);
      const sugiG = mergeGeometries(parts);
      parts.length = 0;
      // 雑木：大小の塊を寄せた、もこもこの樹冠
      [[3, 0, 5.5, 0], [2.1, 1.6, 6.3, 0.6], [2.2, -1.4, 5.9, -0.8]].forEach(([r, x, y, z]) => { const cg = rough(new THREE.IcosahedronGeometry(r, 0), 0.28); cg.scale(1, 0.8, 1); cg.translate(x, y, z); put(cg, 0x2c3f24); });
      const trunk2 = new THREE.CylinderGeometry(0.25, 0.35, 4, 4); trunk2.translate(0, 2, 0); put(trunk2, 0x30261a);
      const broadG = mergeGeometries(parts);
      const NT = 1000;
      const mats = new THREE.MeshLambertMaterial({ vertexColors: true });
      const sm = new THREE.InstancedMesh(sugiG, mats, NT), bm = new THREE.InstancedMesh(broadG, mats, NT);
      const d = new THREE.Object3D(); let ns = 0, nb = 0;
      const tc = new THREE.Color();
      for (let tries = 0; tries < NT * 6 && (ns < NT || nb < NT); tries++) {
        // 三つに一つは地図の端のすぐ外の帯から選ぶ
        let x = (R() * 2 - 1) * (EXT - 10), z = (R() * 2 - 1) * (EXT - 10);
        if (tries % 3 === 0) { const sd = Math.floor(R() * 4), t = (R() * 2 - 1) * (this.half + 50), o = this.half + 8 + R() * 50; x = sd === 0 ? o : sd === 1 ? -o : t; z = sd === 2 ? o : sd === 3 ? -o : t; }
        if (!okFar(x, z)) continue;
        const h = this.farH(x, z);
        const forest = Math.sin(x * 0.021 + 2.1) * Math.cos(z * 0.017 - 1.2) * 0.5 + 0.5 + (h - 6) * 0.03;
        // 地図の端のすぐ外（中くらいの遠さ）は木を濃く：近くの森と遠くの森が途切れて見えないように
        const near = out(x, z) < 60;
        if (forest < (near ? 0.28 : 0.5) + R() * 0.15) continue;
        const sc = 0.8 + R() * 0.6;
        d.position.set(x, h - 0.5, z); d.rotation.set(0, R() * 6, 0); d.scale.set(sc, sc * (0.85 + R() * 0.4), sc); d.updateMatrix();
        tc.setScalar(0.8 + R() * 0.4);
        if (R() < 0.6) { if (ns < NT) { sm.setMatrixAt(ns, d.matrix); sm.setColorAt(ns, tc); ns++; } }
        else if (nb < NT) { bm.setMatrixAt(nb, d.matrix); bm.setColorAt(nb, tc); nb++; }
      }
      sm.count = ns; bm.count = nb;
      // 画質「低」（携帯）：遠くの森は三本に一本だけ描く（霞の中の影絵なので数を減らしても森に見える。置き方の乱数は変えない）
      if (SETTINGS.quality === 'low') for (const m of [sm, bm]) {
        const A = m.instanceMatrix.array, C = m.instanceColor.array, n = Math.ceil(m.count / 3);
        for (let j = 1; j < n; j++) { A.copyWithin(j * 16, j * 48, j * 48 + 16); C.copyWithin(j * 3, j * 9, j * 9 + 3); }
        m.count = n;
      }
      if (SETTINGS.quality === 'low') { this.viewCull([sm], 0); this.viewCull([bm], 0); }
      this.scene.add(sm, bm);
    }
    // 村：茅葺きの家並み（寄棟の屋根）と納屋。炊事の煙が昇る
    this.buildSmokeColumns();
    const houses = [];
    for (let v = 0, tries = 0; v < 3 && tries < 200; tries++) {
      const a = R() * Math.PI * 2, dist = this.half + 40 + R() * 70;
      const vx = Math.sin(a) * dist, vz = Math.cos(a) * dist;
      if (Math.max(Math.abs(vx), Math.abs(vz)) > EXT - 30 || !okFar(vx, vz) || out(vx, vz) < 30) continue;
      // 村同士は離す
      if (houses.some((hh) => Math.hypot(hh[0] - vx, hh[1] - vz) < 90)) continue;
      const n = 6 + Math.floor(R() * 6);
      for (let k = 0; k < n; k++) {
        const hx = vx + (R() - 0.5) * 50, hz = vz + (R() - 0.5) * 34;
        if (!okFar(hx, hz)) continue;
        houses.push([hx, hz, R() * Math.PI, 0.8 + R() * 0.5, v]);
        if (R() < 0.45) this.addSmokeColumn(hx + (R() - 0.5) * 2, this.farH(hx, hz) + 6, hz + (R() - 0.5) * 2, { size: 1.6 });
      }
      v++;
    }
    if (houses.length) {
      const wall = new THREE.BoxGeometry(7, 2.6, 5); wall.translate(0, 1.3, 0);
      // 寄棟の茅葺き：急な四つの面と、低く張り出した軒
      const roof = new THREE.ConeGeometry(5.6, 4.2, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.18, 1, 0.86); roof.translate(0, 2.6 + 2.0, 0);
      const wm = new THREE.InstancedMesh(wall, new THREE.MeshLambertMaterial({ color: 0x6e5a44 }), houses.length);
      const rm = new THREE.InstancedMesh(roof, new THREE.MeshLambertMaterial({ map: thatchTex(), color: 0xa89878 }), houses.length);
      const d = new THREE.Object3D();
      houses.forEach(([x, z, r, s], i) => {
        d.position.set(x, this.farH(x, z) - 0.2, z); d.rotation.set(0, r, 0); d.scale.setScalar(s); d.updateMatrix();
        wm.setMatrixAt(i, d.matrix); rm.setMatrixAt(i, d.matrix);
      });
      this.scene.add(wm, rm);
    }
    // 遠くの城（def.farCastle：{ x, z } か { a: 向き, d: 遠さ }、tiers 天守の重ね）：丘の上の石垣・白い天守・隅櫓・塀を、
    // 霞の中の影絵として一つの形にまとめて置く（近寄れない遠景なので粗い形で軽く）
    if (def.farCastle) this.buildFarCastle(def.farCastle);
  }
  buildFarCastle(o) {
    const cx = o.x ?? Math.sin(o.a || 0) * (o.d || this.half + 120), cz = o.z ?? Math.cos(o.a || 0) * (o.d || this.half + 120);
    const y0 = this.farH(cx, cz), sc = o.s || 1, rot = o.rot || 0;
    const parts = [];
    const add = (g, hex, x, y, z) => {
      g.rotateY(rot); g.translate(cx + (x * Math.cos(rot) + z * Math.sin(rot)) * sc, y0 + y * sc, cz + (-x * Math.sin(rot) + z * Math.cos(rot)) * sc);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(hex);
      // 下ほど暗く（石垣の裾・軒下の陰）
      for (let i = 0; i < n; i++) { const k = 0.78 + 0.22 * Math.min(1, Math.max(0, (g.attributes.position.getY(i) - y0) / (40 * sc))); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
    const roof = (w, d, h) => { const g = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h, 4); g.rotateY(Math.PI / 4); g.scale(w / Math.max(w, d), 1, d / Math.max(w, d)); g.translate(0, h / 2, 0); return g; };
    // 石垣：裾の広い台形（上に行くほど細い）
    const base = new THREE.CylinderGeometry(22 / Math.SQRT2, 30 / Math.SQRT2, 9, 4); base.rotateY(Math.PI / 4); base.translate(0, 4.5, 0);
    add(base, 0x8a867a, 0, 0, 0);
    // 塀と隅櫓
    for (const [x, z, w, d] of [[0, -13, 26, 0.8], [0, 13, 26, 0.8], [-13, 0, 0.8, 26], [13, 0, 0.8, 26]]) add(box(w, 2.2, d), 0xd6d0c2, x, 9, z);
    for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { add(box(4.5, 4, 4.5), 0xdcd6c8, x, 9, z); add(roof(6, 6, 2.2), 0x2e3134, x, 13, z); }
    // 天守：重ねるごとに細く、各重に黒い屋根
    let y = 9, w = 14, d = 12;
    const tiers = o.tiers || 4;
    for (let k = 0; k < tiers; k++) {
      const h = k === tiers - 1 ? 4.2 : 4.6;
      add(box(w, h, d), k % 2 ? 0xe2ddd0 : 0xd8d2c4, 0, y, 0);
      add(roof(w + 3, d + 3, k === tiers - 1 ? 4 : 1.8), 0x2a2d31, 0, y + h - 0.2, 0);
      y += h + 0.6; w *= 0.78; d *= 0.78;
    }
    const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = false; m.receiveShadow = false;
    this.scene.add(m);
    return m;
  }

  // ---------------- 立ち昇る煙（村の炊事・陣の鍋） ----------------
  // 位置だけを覚え、昇る・流れる・薄れるは描くときに計算する（毎コマの手間がない）
  buildSmokeColumns() {
    if (this.smokeCol) return;
    // 画質「低」（携帯）は一本の粒を減らす（近くの大きな粒の重なりが重い）
    const CAP = 48, PER = SETTINGS.quality === 'low' ? 10 : 16;
    const pos = new Float32Array(CAP * PER * 3), seed = new Float32Array(CAP * PER * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
    geo.setDrawRange(0, 0);
    if (!this.puffTex) this.makePuffTex();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.puffTex }, uTime: { value: 0 }, color: { value: new THREE.Color(0x9a958c) }, scale: { value: 420 }, wind: { value: new THREE.Vector2(WIND_STATE.dirX, WIND_STATE.dirZ) } },
      vertexShader: `attribute vec2 seed; uniform float uTime, scale; uniform vec2 wind; varying float vA;
        void main(){
          // seed.x ＝ 位相、seed.y ＝ 大きさ
          float t = fract(uTime * 0.045 + seed.x);
          vec3 p = position;
          p.y += t * 16.0 * seed.y;
          p.xz += wind * t * t * 12.0 * seed.y + vec2(sin(t * 9.0 + seed.x * 30.0), cos(t * 7.0 + seed.x * 20.0)) * 0.4 * t;
          vA = smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // カメラのすぐ前の粒は消す（目の前に光った綿の塊が貼り付いて人や家を隠さない）
          vA *= smoothstep(3.0, 12.0, -mv.z);
          gl_PointSize = (0.8 + t * 5.0) * seed.y * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA * 0.42); if (gl_FragColor.a < 0.004) discard; }',
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.smokeCol = { pts, pos, seed, n: 0, CAP, PER };
  }
  // 煙の柱を足す（x, y, z は煙の出る所）。o.size で太さ
  addSmokeColumn(x, y, z, o = {}) {
    if (!this.smokeCol) this.buildSmokeColumns();
    const S = this.smokeCol;
    if (S.n >= S.CAP) return null;
    const i0 = S.n * S.PER, ph = Math.random();
    for (let k = 0; k < S.PER; k++) {
      const i = i0 + k;
      S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z;
      S.seed[i * 2] = ph + k / S.PER; S.seed[i * 2 + 1] = o.size || 1;
    }
    S.n++;
    const g = S.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.seed.needsUpdate = true;
    g.setDrawRange(0, S.n * S.PER);
    return S.n - 1;
  }
  // 煙の柱を消す（addSmokeColumn の返り値を渡す）
  removeSmokeColumn(id) {
    const S = this.smokeCol;
    if (!S || id == null) return;
    for (let k = 0; k < S.PER; k++) S.pos[(id * S.PER + k) * 3 + 1] = -9999;
    S.pts.geometry.attributes.position.needsUpdate = true;
  }

  // 時間帯の見え方を一式で作る（戦の途中で変わるときは、しばらくかけて移ろう）
  lookOf(key) {
    let t = key === 'noon' || key === 'afternoon' ? TIME.day : (key === 'day' && this.mood === 'morning') ? TIME.morning : TIME[key];
    if (key === 'storm' && this.def.stormLift) {
      const lift = Math.max(1, Math.min(2, this.def.stormLift));
      t = { ...t, sunI: Math.min(1.65, t.sunI * lift), hemiI: Math.min(2.4, t.hemiI * lift) };
    }
    // 夏の昼（桶狭間・姉川など）：日差しが強く影が濃い、空の青が深い、遠くは陽炎で白っぽく霞む
    // 夜は陰を持ち上げて足もとを見せる。明るさを上げても見通しは伸ばさない。
    // 夜はどの戦も月明かりで兵と道の形が読める所まで上げる（大河内の夜の雨が真っ黒だった）
    if (key === 'night') {
      const L = Math.max(3.4, Math.min(3.8, (this.def && this.def.nightLift) || 0));
      t = { ...t, sunI: t.sunI * Math.min(1.3, L), hemiI: t.hemiI * L };
    }
    if ((key === 'noon' || key === 'afternoon' || (key === 'day' && this.mood !== 'morning')) && this.summer) t = { ...t, sunI: t.sunI * 1.14, hemiI: t.hemiI * 0.86, top: 0x4a74a6, sky: 0xa9b8c2, vis: t.vis * 0.85, cloud: t.cloud * 0.8, cover: t.cover * 0.8, sunPos: [60, 96, -40] };
    return {
      sky: new THREE.Color(t.sky), fog: new THREE.Color(t.fog), sun: new THREE.Color(t.sun), sunI: t.sunI,
      hemiSky: new THREE.Color(t.hemiSky), hemiGround: new THREE.Color(t.hemiGround), hemiI: t.hemiI,
      sunDir: new THREE.Vector3(...t.sunPos).normalize(), top: new THREE.Color(t.top), glow: new THREE.Color(t.glow || 0xff9a50),
      glowK: t.glowK, cover: t.cover, cloudDark: key === 'storm' ? 0.4 : 0.1, vis: t.vis, cloud: t.cloud,
      // 山の地の色（霞は別に掛ける）：近い山は濃い杉の緑、遠いほど青い
      mount: key === 'night' ? [0x293442, 0x324152, 0x405168] : key === 'dusk' ? [0x2c2a2c, 0x3a3a44, 0x4a4c5a] : key === 'storm' ? [0x2a302e, 0x384040, 0x464e50] : [0x24332c, 0x33443e, 0x4a5a5e],
    };
  }
  // 今の見え方を読み取る（ほかの戦が直に書き換えた値も拾う）
  currentLook() {
    const U = this.skyMat.uniforms;
    return {
      sky: this.scene.background.clone(), fog: this.scene.fog.color.clone(), sun: this.sun.color.clone(), sunI: this.sun.intensity / LIGHT_K.sun / (this.rainDim || 1),
      hemiSky: this.hemi.color.clone(), hemiGround: this.hemi.groundColor.clone(), hemiI: (this.baseHemi ?? this.hemi.intensity) / LIGHT_K.hemi,
      sunDir: this.sunOffset.clone().normalize(), top: U.top.value.clone(), glow: U.glow.value.clone(), glowK: U.glowK.value, cover: U.cover.value, cloudDark: U.cloudDark.value,
      vis: this.look ? this.look.vis : 500, cloud: this.look ? this.look.cloud : 0.4,
      mount: this.mountMats.map((m) => m.color.getHex()),
    };
  }
  applyLook(L) {
    this.look = L;
    this.scene.background.copy(L.sky);
    this.scene.fog.color.copy(L.fog);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI * LIGHT_K.sun * (this.rainDim || 1);
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI * LIGHT_K.hemi;
    this.baseHemi = this.hemi.intensity;
    this.sunOffset.copy(L.sunDir).multiplyScalar(120);
    const U = this.skyMat.uniforms;
    U.top.value.copy(L.top); U.bottom.value.copy(L.fog);
    U.sunDir.value.copy(L.sunDir); U.sunCol.value.copy(L.sun);
    U.cover.value = L.cover; U.cloudDark.value = L.cloudDark;
    U.glow.value.copy(L.glow); U.glowK.value = L.glowK;
    this.mountMats.forEach((m, k) => m.color.set(L.mount[k]));
    // 星と月は夜だけ（空の色が暗い時）
    if (this.stars) { const dark = L.sky.r + L.sky.g + L.sky.b < 0.45; this.stars.visible = dark; this.moon.visible = dark; if (dark) this.moon.position.copy(L.sunDir).multiplyScalar(420); }
  }

  // 独自の夜色と時刻の夜を共通で扱い、夜へ・夜からの移ろいにも合わせる。
  nightAmount() {
    const target = this.timeKey === 'night' || this.lookDark ? 1 : 0;
    if (!this.fade) return target;
    const k = Math.min(1, this.fade.t / this.fade.dur), s = k * k * (3 - 2 * k);
    return (this.fade.fromNight || 0) * (1 - s) + target * s;
  }
  duskAmount() {
    // 時計で動く夕暮れは、段の名前より実際の日の傾きに合わせる。
    const target = this.dayClock && this.dayClock.hours[this.timeKey]
      ? Math.max(0, Math.min(1, (this.dayClock.hour - 14) / 4))
      : this.timeKey === 'dusk' ? 1 : 0;
    if (!this.fade) return target;
    const t = Math.min(1, this.fade.t / this.fade.dur), s = t * t * (3 - 2 * t);
    return (this.fade.fromDusk || 0) * (1 - s) + target * s;
  }
  prepareNight() {
    const k = this.nightAmount();
    this.nightU.value = k;
    // 夕暮れにも既存の散乱光を使い、日陰の具足と旗を浮かせる。
    // 光も影も追加せず、低画質でも共通。遠景は距離の霞を保つ。
    const dusk = this.duskAmount();
    // 雨の散乱光は曇った空の灰青。月明かりは雨で削られても下限を保ち、
    // 半球光だけで平らにせず、兜・斜面の月に向いた面を読めるようにする。
    const rain = Math.max(0, Math.min(1, this.rainLevel || 0));
    this.sun.intensity = Math.max(this.sun.intensity, 0.5 * k);
    this.nightFill.intensity = 1.3 * k + (0.85 * dusk + 0.4 * rain * (1 - dusk)) * (1 - k);
    // 夜の散乱光は月の青（昼のような白い光で草が鮮やかに見えないように）。夕暮れは元の色
    this.nightFill.color.setRGB(0.75 - 0.2 * k, 0.82 - 0.12 * k, 0.93);
    this.nightFill.groundColor.setRGB(0.55 - 0.25 * k, 0.6 - 0.22 * k, 0.72 - 0.12 * k);
    // 月の側は明るく、下向きの面にも光を回す。空・遠景の色は変えない。
    this.nightFill.position.copy(this.sunOffset).normalize();
    this.nightFill.position.y = Math.max(0.65, this.nightFill.position.y);
    return k;
  }

  setTime(key) {
    const fromNight = this.nightAmount(), fromDusk = this.duskAmount();
    const prev = this.timeKey;
    this.timeKey = key;
    if (!this.scene.background || !this.scene.background.isColor) this.scene.background = new THREE.Color();
    if (!this.sunOffset) this.sunOffset = new THREE.Vector3();
    // 晴れた戦の朝・昼・夕は、時計が続けて移ろわせる。天気の移ろいは下の既存の作りを使う。
    if (this.dayClock && (key === 'day' || key === 'afternoon' || key === 'dusk')) {
      this.fade = null;
      this.dayClock.tick(0);
      this.fireLightT = 0;
      return;
    }
    const to = this.lookOf(key);
    // 雷雨の頭は石まじり（雹）：最初の十数秒だけ白い粒が混じり、地面で跳ねる（桶狭間の「石まじりの雨」）
    if (key === 'storm' && prev !== 'storm' && this.def.hail) this.hailT = 14;
    // 戦の途中で夕暮れ・雨・雨上がりへ変わるときは、二十秒ほどかけて移ろう（朝や昼へ戻すときは、戦の側が直に値を触ることがあるのですぐ変える）
    if (prev && prev !== key && key !== 'day' && (this.time || 0) > 10) {
      this.fade = { from: this.currentLook(), to, fromNight, fromDusk, t: 0, dur: key === 'storm' ? 12 : key === 'dusk' ? 60 : 24, env: 0 };
    } else {
      this.fade = null;
      this.applyLook(to);
      this.updateEnv();
    }
    this.fireLightT = 0;   // 光の付け替えをすぐやり直す
  }

  // 見え方の移ろい
  updateFade(dt) {
    const F = this.fade;
    if (!F) return;
    F.t += dt;
    const k = Math.min(1, F.t / F.dur), s = k * k * (3 - 2 * k);
    const a = F.from, b = F.to;
    // 作業用の入れ物は一度だけ作って使い回す（移ろっている間、毎コマ色を clone・new しない）
    const L = this._fadeL || (this._fadeL = {
      sky: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
      top: new THREE.Color(), glow: new THREE.Color(), sunDir: new THREE.Vector3(), mount: [], c1: new THREE.Color(), c2: new THREE.Color(),
    });
    const c = (p) => L[p].copy(a[p]).lerp(b[p], s), n = (p) => a[p] + (b[p] - a[p]) * s;
    for (let i = 0; i < a.mount.length; i++) L.mount[i] = L.c1.set(a.mount[i]).lerp(L.c2.set(b.mount[i]), s).getHex();
    L.sky = c('sky'); L.fog = c('fog'); L.sun = c('sun'); L.hemiSky = c('hemiSky'); L.hemiGround = c('hemiGround'); L.top = c('top'); L.glow = c('glow');
    L.sunDir.copy(a.sunDir).lerp(b.sunDir, s).normalize();
    L.sunI = n('sunI'); L.hemiI = n('hemiI'); L.glowK = n('glowK'); L.cover = n('cover'); L.cloudDark = n('cloudDark'); L.vis = n('vis'); L.cloud = n('cloud');
    this.applyLook(L);
    // 映り込みは移ろい終わった時に一度だけ作り直す（途中で何度も焼き直すと、一回ごとにコマが大きく止まる）
    if (k >= 1) this.updateEnv();
    if (k >= 1) this.fade = null;
  }

  // 稲妻の線：遠い山の向こうの空に、ぎざぎざの光の帯（太い芯と淡い光の二重）を一瞬描く。近い雷ほど手前に大きく
  showBolt(focus) {
    if (!this.bolt) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const glow = new THREE.MeshBasicMaterial({ color: 0x8ea4ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      this.bolt = new THREE.Group();
      this.boltCore = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      this.boltGlow = new THREE.Mesh(new THREE.BufferGeometry(), glow);
      this.bolt.add(this.boltGlow, this.boltCore);
      this.bolt.renderOrder = -1;
      this.bolt.frustumCulled = false; this.boltCore.frustumCulled = false; this.boltGlow.frustumCulled = false;
      this.scene.add(this.bolt);
    }
    const D = Math.max(300, Math.min(455, 250 + (this.boltD || 900) * 0.1)), a = Math.random() * Math.PI * 2;
    const cx = Math.sin(a), cz = Math.cos(a), rx = cz, rz = -cx;   // 横の向き（見る向きに直角）
    // 幹：上から下へ、横にぎざぎざ。途中から枝が一本
    const pts = [[0, 230]];
    let x = 0, y = 230;
    while (y > 0) { y -= 14 + Math.random() * 16; x += (Math.random() - 0.5) * 26; pts.push([x, Math.max(-5, y)]); }
    const bi = 2 + Math.floor(Math.random() * 3), br = [[pts[bi][0], pts[bi][1]]];
    let bx = pts[bi][0], by = pts[bi][1];
    const bs = Math.random() < 0.5 ? -1 : 1;
    for (let k = 0; k < 4; k++) { by -= 12 + Math.random() * 10; bx += bs * (8 + Math.random() * 12); br.push([bx, by]); }
    const strip = (lines, w) => {
      const pos = [];
      for (const L of lines) for (let i = 0; i < L.length - 1; i++) {
        const [x0, y0] = L[i], [x1, y1] = L[i + 1], ww = w * (i === 0 ? 0.7 : 1) * (L === br ? 0.6 : 1);
        const P = (px, py, o) => [cx * D + rx * (px + o), py, cz * D + rz * (px + o)];
        pos.push(...P(x0, y0, -ww), ...P(x0, y0, ww), ...P(x1, y1, ww), ...P(x0, y0, -ww), ...P(x1, y1, ww), ...P(x1, y1, -ww));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
    };
    this.boltCore.geometry.dispose(); this.boltGlow.geometry.dispose();
    this.boltCore.geometry = strip([pts, br], 2.2);
    this.boltGlow.geometry = strip([pts, br], 12);
    this.bolt.position.set(focus.x, 0, focus.z);
    this.bolt.visible = true;
  }

  // 煙の帳：燃える堂・町（大きな火）が多いほど、空が茶色く濁り、霞が煤けて、日差しが弱まる
  // 霧の色と日の強さは、前のコマで足した分を戻してから掛け直す（戦の側が色を変えたら、それを新しい元にする）
  updatePall(dt, focus) {
    let want = 0;
    for (const f of this.fires) if ((f.size || 0) >= 2) want += f.size / 18 * (1 - Math.min(1, Math.hypot(f.x - focus.x, f.z - focus.z) / 260));
    // 比叡山のように戦の側で煙の空へ変える戦もあるので、ここでは薄く重ねるだけ
    want = Math.min(0.45, want);
    this.pall = (this.pall || 0) + (want - (this.pall || 0)) * Math.min(1, dt * 0.08);
    // 覚え書きの入れ物は一度だけ作って使い回す（大火の間、毎コマ色を new しない）。pallOn が立っている間だけ中身が生きている
    const P = this.pallOn ? this.pallSet : null;
    const fog = this.scene.fog.color, sun = this.sun;
    if (P) {
      if (fog.equals(P.fogOut)) fog.copy(P.fog);
      if (Math.abs(sun.intensity - P.sunOut) < 1e-4) sun.intensity = P.sun;
    }
    const k = this.pall;
    this.skyMat.uniforms.pall.value = k;
    if (k < 0.005) { this.pallOn = false; return; }
    const Q = this.pallSet || (this.pallSet = { fog: new THREE.Color(), fogOut: new THREE.Color(), sun: 0, sunOut: 0, hsl: {}, c: new THREE.Color() });
    Q.fog.copy(fog); Q.sun = sun.intensity;
    fog.lerp(Q.c.copy(PALL_COL).multiplyScalar(0.45 + fog.getHSL(Q.hsl).l * 0.8), k * 0.4);
    sun.intensity *= 1 - k * 0.35;
    Q.fogOut.copy(fog); Q.sunOut = sun.intensity; this.pallOn = true;
  }

  // 露出の目当て：空の明るさから決める（昼 1、夕暮れ 0.94、嵐 0.88、夜 0.8 ほど）。雨は少し暗く、夕暮れは朱に寄せる
  // 画面の明暗順応（post.js）は暗い場面を明るく戻そうとするので、夜や嵐が昼のように見えないよう、ここで少し絞る
  // 目が慣れるように 2 秒ほどかけて寄せる
  // 夏と分かった時（戦の始めだけ）に、夏の昼の見え方へ切り替える
  setSummer(on) {
    if (this.summer === !!on) return;
    this.summer = !!on;
    if (this.dayClock) this.dayClock.noon = this.lookOf('noon');
    if (this.timeKey === 'day' && (this.time || 0) < 5 && !this.fade) this.setTime('day');
  }
  updateExposure(dt) {
    const c = this.scene.background;
    if (!c || !c.isColor) return;
    const L = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    let want = 0.72 + 0.43 * Math.sqrt(Math.max(0, L));
    want *= 1 - (this.rainLevel || 0) * 0.08;
    want = Math.max(0.74, Math.min(1.04, want));
    // 夜の近景を持ち上げた後で、空の暗さ・雨を理由に再び絞らない。
    want += (1 - want) * this.nightAmount();
    POST.exp += (want - POST.exp) * Math.min(1, dt / 2);
    // 陽炎：夏の晴れた昼だけ、遠くの景色がゆらぐ（post.js）
    const heat = this.summer && this.timeKey === 'day' && this.mood !== 'morning' ? 1 - (this.rainLevel || 0) : 0;
    POST.heat += (heat - POST.heat) * Math.min(1, dt / 3);
  }

  buildSky() {
    // 空：地平から天頂への色、太陽と光の輪、ゆっくり流れる雲（雑音を重ねて作る）
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x6a88a8) }, bottom: { value: new THREE.Color(0xa9b7bd) }, glow: { value: new THREE.Color(0xff9a50) }, glowK: { value: 0 }, flash: { value: 0 },
        sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) }, sunCol: { value: new THREE.Color(0xfff0d8) }, time: { value: 0 }, cover: { value: 0.4 }, cloudDark: { value: 0.1 }, pall: { value: 0 },
        rain: { value: 0 }, age: { value: 0 },
        cloudTime: { value: 0 }, cloudShift: { value: new THREE.Vector2() }, lowDetail: { value: SETTINGS.quality === 'low' ? 1 : 0 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, bottom, glow, sunCol, sunDir; uniform vec2 cloudShift; uniform float glowK, flash, time, cover, cloudDark, pall, rain, age, cloudTime, lowDetail; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        // 低でも雲の大きな形と縁は残す。細かい二段だけ省き、濃さをそろえる
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { if (lowDetail > 0.5 && k >= 3) break; v += a * n(p); p *= 2.03; a *= 0.5; } return v * mix(1.0, 0.96875 / 0.875, lowDetail); }
        float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 3; k++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v / 0.875; }
        void main(){
          vec3 d = normalize(vP);
          // 雨の日は雲が空を覆い、暗く重い
          float cov = clamp(max(cover, rain * 0.9), 0.0, 0.97), cdk = max(cloudDark, rain * 0.5);
          float hgt = clamp(d.y * 1.5 + 0.04, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(hgt, 0.8));
          float sd = max(0.0, dot(d, normalize(sunDir)));
          // 夜は月の淡い輪だけ。雲も空の明るさを受け、昼の白い雲にならない
          float skyLight = dot(top, vec3(0.2126, 0.7152, 0.0722));
          float daylight = smoothstep(0.015, 0.1, skyLight);
          float cloudLight = clamp(skyLight * 5.0, 0.035, 1.0);
          c += sunCol * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35) * (1.0 - cov * 0.6) * mix(0.12, 1.0, daylight);
          c += sunCol * smoothstep(0.9993, 0.9997, sd) * 1.2 * (1.0 - cov) * daylight;
          // 朝焼け・夕焼け：日の沈む（昇る）方の地平は橙、その少し上は薔薇色、天頂は紫がかった藍。
          // 日と反対の地平すれすれは地球の影の青で、その上に薄紅の帯。夕暮れは時が経つほど（age）橙から紅へ
          float toSun = max(0.0, dot(normalize(d.xz + 0.0001), normalize(sunDir.xz + 0.0001)));
          float low = 1.0 - smoothstep(0.0, 0.35, normalize(sunDir).y), anti = 1.0 - toSun;
          vec3 gl2 = mix(glow, glow * vec3(1.05, 0.6, 0.55), age);
          c += gl2 * glowK * exp(-abs(d.y) * 7.0) * (0.25 + 0.75 * toSun * toSun);
          c += vec3(0.95, 0.55, 0.62) * glowK * low * exp(-pow((d.y - 0.15) * 6.0, 2.0)) * (0.08 + 0.22 * toSun) * (1.0 - cov * 0.5);
          c = mix(c, c * vec3(0.78, 0.84, 1.0), glowK * low * anti * exp(-abs(d.y) * 12.0) * 0.55);
          c += vec3(0.5, 0.3, 0.38) * glowK * low * anti * exp(-pow((d.y - 0.1) * 9.0, 2.0)) * 0.2 * (1.0 - cov * 0.5);
          c = mix(c, c * vec3(1.02, 0.93, 1.1), glowK * smoothstep(0.15, 0.9, d.y) * 0.5);
          // 雲：空の丸天井に投影した雑音
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.3 - cloudShift;
            // 形を少し歪めて、もくもくした塊に。歪みはゆっくり別に動くので、雲は流れながら形を変える
            vec2 warp;
            if (lowDetail > 0.5) warp = vec2(n(uv * 0.7 + 3.1 + cloudTime * 0.002));
            else warp = vec2(fbm3(uv * 0.7 + 3.1 + cloudTime * 0.002), fbm3(uv * 0.7 - 1.7));
            vec2 uvw = uv + (warp - 0.5) * 0.9;
            float cl = fbm(uvw * 1.4);
            float dens = smoothstep(1.0 - cov - 0.1, 1.0 - cov + 0.25, cl);
            // 厚み：日の方へ少しずらした所の濃さとの差で、日の当たる縁と陰になった腹を分ける
            float cl2;
            if (lowDetail > 0.5) cl2 = cl - (n(uvw * 2.8 + normalize(sunDir.xz + 0.0001) * 0.16) - 0.5) * 0.08;
            else cl2 = fbm(uvw * 1.4 + normalize(sunDir.xz + 0.0001) * 0.12);
            float lit = clamp(0.8 + (cl - cl2) * 2.4, 0.0, 1.2) - cdk;
            vec3 ccol = mix(vec3(0.6, 0.62, 0.65), vec3(1.0, 0.98, 0.95), clamp(lit, 0.0, 1.0)) * mix(vec3(1.0), sunCol, 0.25);
            // 日が低い時は、雲の底が焼けて橙・紅に染まる（日の方ほど濃い）
            ccol = mix(ccol, ccol * 0.5 + gl2 * 0.95, glowK * low * (0.3 + 0.7 * toSun) * smoothstep(0.2, 0.9, dens) * (1.0 - cdk));
            float fade = smoothstep(0.0, 0.18, d.y);
            // 日の近くの雲は、薄い縁ほど光を通して白く輝く（雲の銀の縁）
            ccol += sunCol * pow(sd, 5.0) * (1.0 - smoothstep(0.2, 0.9, dens)) * 0.55 * (1.0 - cdk);
            // 雲の厚み：濃い所ほど底が暗く（雲の腹の影）、縁は明るい
            float belly = smoothstep(0.35, 0.95, dens) * (0.22 + cdk * 0.3);
            ccol *= 1.0 - belly * (1.0 - pow(sd, 3.0) * 0.6);
            // 曇天（雨）と夜：雲は空の地の色から大きく離れない。暗い雲の板が地平の上に垂れて「洞窟の天井」や逆さの山に見えないよう、
            // 地平へ向かってなだらかに霞へ溶かし、濃淡だけを残す
            float rk = clamp(max(rain, cov - 0.6) * 1.6, 0.0, 1.0), nk = 1.0 - daylight;
            vec3 cc = ccol * mix(0.55 + hgt * 0.55, 0.95, rk) * cloudLight;
            cc = mix(cc, c * (0.84 + 0.26 * clamp(lit, 0.0, 1.0)), max(rk * 0.72, nk * 0.8));
            c = mix(c, cc, dens * mix(fade, smoothstep(-0.05, 0.55, d.y), max(rk, nk)) * 0.92);
            // 高い所の薄い筋雲（ゆっくり、別の向きに流れる）。低い雲の隙間に見える
            vec2 uv2 = d.xz / (d.y + 0.05) * 0.55 - cloudShift * 0.35 + vec2(cloudTime * 0.0004, -cloudTime * 0.0003);
            float ci = smoothstep(0.55, 0.85, fbm(uv2 * vec2(2.4, 0.7))) * (1.0 - dens) * fade * (1.0 - cov * 0.8);
            c = mix(c, mix(vec3(1.0), sunCol, 0.3) * (0.9 + pow(sd, 4.0) * 0.3) * cloudLight, ci * 0.35);
          }
          // 大きな火の煙の帳：空が茶色く濁り、日が陰る（上の方ほど濃い）
          c = mix(c, dot(c, vec3(0.3, 0.55, 0.15)) * vec3(0.92, 0.74, 0.56), pall * (0.45 + 0.4 * hgt));
          // 雨の日：空は暗く沈み、遠くの地平には斜めに垂れる灰色の雨脚
          if (rain > 0.01) {
            float sx = atan(d.x, d.z) * 38.0 + d.y * 22.0;
            float cur = n(vec2(sx, time * 0.04)) * n(vec2(sx * 0.27 + 5.0, time * 0.01));
            c = mix(c, bottom * 0.78, rain * smoothstep(0.3, 0.75, cur) * exp(-max(d.y, 0.0) * 8.0) * 0.55);
            c *= 1.0 - rain * 0.2;
          }
          c += vec3(0.8, 0.85, 1.0) * flash;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), this.skyMat);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    // 星：空の球の内側に小さな光の点を散らす（霧に沈まない。空と一緒に動く）。月：淡い光の丸
    {
      const N = 900, pos = new Float32Array(N * 3), R = rng(909);
      for (let i = 0; i < N; i++) {
        const u = 0.08 + R() * 0.92, a = R() * Math.PI * 2, r = 440, h = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(a) * h * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * h * r;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6f4, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
      this.stars.renderOrder = -1; this.stars.visible = false; this.stars.frustumCulled = false;
      this.sky.add(this.stars);
      const mc = document.createElement('canvas'); mc.width = mc.height = 64;
      const mg = mc.getContext('2d'), gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(240,244,255,1)'); gr.addColorStop(0.28, 'rgba(230,236,250,0.95)'); gr.addColorStop(0.36, 'rgba(180,196,230,0.25)'); gr.addColorStop(1, 'rgba(120,140,190,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64);
      this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, transparent: true, depthWrite: false }));
      this.moon.scale.setScalar(46); this.moon.visible = false; this.moon.renderOrder = -1;
      this.sky.add(this.moon);
    }
    // 遠くの山並み：三重に重ね、遠いほど霞ませる。山肌には杉林の筋と雑木の斑、近い山の裾には棚田
    const M = rng(this.def.seed || 5);
    this.mountMats = [];
    this.mountains = new THREE.Group();
    this.mountU = { hazeCol: { value: new THREE.Color() }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol, glow: this.skyMat.uniforms.glow, glowK: this.skyMat.uniforms.glowK, mist: { value: 0 }, vis: { value: 500 }, rain: { value: 0 }, night: this.nightU };
    // 一番奥の峰は高く（峰で 150m ほど）、稜線を細かく刻んで、平たい丘の輪に見えないように
    [[330, 28, 1.0], [385, 62, 0.75], [440, 118, 0.6]].forEach(([rad, H, sharp], layer) => {
      const N = layer === 2 ? 480 : 240, ROWS = 5, pos = [], uv = [], idx = [];
      const ph = M() * 10, ph2 = M() * 10, ph3 = M() * 10;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let ridge = Math.abs(Math.sin(a * 5 + ph)) * 0.5 + Math.abs(Math.sin(a * 11 + ph2)) * 0.3 * sharp + Math.sin(a * 23 + ph) * 0.12 * sharp + Math.sin(a * 47 + ph2) * 0.04 + M() * 0.05;
        // 奥の峰：高い峰がところどころに立ち、稜線に小さな凸凹（岩と木の刻み）
        if (layer === 2) ridge = ridge * 0.7 + Math.pow(Math.abs(Math.sin(a * 3 + ph3)), 3) * 0.45 + Math.abs(Math.sin(a * 97 + ph)) * 0.025 + Math.sin(a * 151 + ph2) * 0.015;
        const hh = H * (0.25 + ridge) - layer * 4;
        for (let r = 0; r <= ROWS; r++) {
          const f = r / ROWS, y = -12 + (hh + 12) * f;
          pos.push(Math.sin(a) * rad, y, Math.cos(a) * rad);
          uv.push(a * rad, y);
          if (i < N && r < ROWS) { const k = i * (ROWS + 1) + r, k2 = k + ROWS + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
        }
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      mg.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        fog: false, side: THREE.DoubleSide,
        uniforms: { ...this.mountU, color: { value: new THREE.Color(0x33443e) }, haze: { value: 0.5 }, layer: { value: layer } },
        vertexShader: 'varying vec2 vUv; varying vec3 vP; varying vec3 vW; void main(){ vUv = uv; vP = position; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 color, hazeCol, sunDir, sunCol, glow; uniform float haze, layer, mist, vis, rain, glowK, night; varying vec2 vUv; varying vec3 vP; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec2 q = vUv;
            // 杉林の筋：斜面を縦に走る濃い帯。雑木の斑は明るい
            float streak = n(vec2(q.x * 0.09, q.y * 0.012 + q.x * 0.004));
            float patchy = n(q * vec2(0.02, 0.05) + 3.1) * 0.6 + n(q * vec2(0.06, 0.12)) * 0.4;
            vec3 c = color * mix(0.72, 1.18, patchy);
            c *= mix(1.0, 0.7, smoothstep(0.55, 0.75, streak) * (1.0 - layer * 0.35));
            // 日の当たる側の山は明るく、日を背にした山は影になる
            vec3 d = normalize(vP);
            float lit = clamp(dot(-d.xz, normalize(sunDir.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
            c *= mix(mix(0.75, 0.65, night), mix(1.25, 1.4, night), lit) * mix(vec3(1.0), sunCol, 0.15);
            // 近い山の裾の棚田：段ごとの細い明るい筋
            if (layer < 0.5) {
              float band = smoothstep(0.82, 0.95, fract(q.y * 0.28 + n(vec2(q.x * 0.01, 0.0)) * 2.0));
              float mask = smoothstep(0.6, 0.72, n(vec2(q.x * 0.012, 7.0))) * (1.0 - smoothstep(-2.0, 8.0, q.y));
              c = mix(c, c * 1.35 + vec3(0.02, 0.025, 0.0), band * mask);
              c = mix(c, c * 1.2, mask * 0.35);
            }
            // 霞：遠いほど、低いほど（谷の靄）。日の方角は明るむ
            // 霧の式と同じ量（カメラからの距離と高さの差）で霞ませる。手前の森や野より山が濃く見えることがないように
            vec3 dv = vW - cameraPosition;
            float hf = exp(-clamp(dv.y, -30.0, 120.0) * 0.024);
            float fogK = 1.0 - exp(-length(dv) / max(20.0, vis) * 1.9 * hf);
            // 層ごとの霞：奥の峰ほど裾まで淡く、層と層の間の谷に靄の帯が溜まる（重なった山が影絵のように抜ける）
            float valley = (1.0 - smoothstep(-12.0, 18.0 + layer * 14.0, vP.y)) * (0.1 + mist * 0.3 + layer * 0.07);
            // 山の頂がカメラより高い谷の中でも、見通しの短い夜・雨には距離だけで霞ませる（手前の霞んだ尾根の上に、黒い山が逆さに浮いて見えないように）
            float fogFlat = 1.0 - exp(-length(dv) / max(20.0, vis) * 1.2);
            // 夜は霞だけの一色にせず、峰の月明かりと杉林の筋をわずかに残す。
            // 谷と奥の層ほど霞む関係は保つ。低画質でも同じ山の材質を使う。
            float hz = clamp(max(max(fogK * 0.97, haze), fogFlat * 0.92) + valley + rain * 0.2, 0.0, mix(0.97, 0.86 + layer * 0.025, night));
            float sI = pow(max(dot(d, normalize(sunDir)), 0.0), 6.0);
            vec3 hc = (hazeCol + sunCol * sI * 0.12) * vec3(0.9, 0.97, 1.08);   // 霧の式と同じく、遠くは青を帯びる
            // 朝夕は、日の方の霞が焼けの色に染まる
            float toS = clamp(dot(d.xz, normalize(sunDir.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
            hc = mix(hc, hc * 0.75 + glow * 0.35, glowK * toS * toS * (0.2 + layer * 0.1) * (1.0 - rain));
            // 山の裾は野の霞につなぎ、峰へ向かうほど空の青と焼けの色を残す
            hc = mix(hazeCol, hc, smoothstep(-8.0, 45.0 + layer * 15.0, vP.y));
            gl_FragColor = vec4(mix(c, hc, hz), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      // 戦の側から m.color で色を変えられるように
      mat.color = mat.uniforms.color.value;
      this.mountMats.push(mat);
      const m = new THREE.Mesh(mg, mat);
      m.renderOrder = -1 - layer * 0.1;
      m.userData.rad = rad;
      this.mountains.add(m);
    });
    this.scene.add(this.mountains);
  }

  // 空を小さく焼いて、映り込みの光にする（時間帯が変わるたびに作り直す）
  updateEnv() {
    if (!RENDERER) return;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(RENDERER);
    // 焼くための小さな場面（空と地面）は一度だけ作って使い回す（毎回 new して捨てない）
    if (!this.envScene) {
      const es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(9.9, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.5; es.add(gnd);
      this.envScene = { es, gnd };
    }
    // 地面の照り返し
    this.envScene.gnd.material.color.copy(this.hemi.groundColor).multiplyScalar(0.8);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene.es, 0.02);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  // 柔らかい丸い粒の絵
  makePuffTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.puffTex = new THREE.CanvasTexture(c);
  }
  // 土ぼこり・泥はね：柔らかい粒が広がりながら薄れる（一粒ごとに大きさと濃さを変える）
  makePuffs(N, color, grow, alpha) {
    const P = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N).fill(1), i: 0 };
    for (let i = 0; i < N; i++) P.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(P.life, 1));
    geo.setAttribute('lmax', new THREE.BufferAttribute(P.max, 1));
    if (!this.puffTex) this.makePuffTex();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.puffTex }, color: { value: new THREE.Color(color) }, scale: { value: 420 }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol },
      // 日の方を向いて見る粒は光を通して明るく縁が光り、日を背にすると陰の色に沈む
      vertexShader: `attribute float life; attribute float lmax; varying float vA; varying float vLit; uniform float scale; uniform vec3 sunDir; void main(){ float t = 1.0 - clamp(life / lmax, 0.0, 1.0); vA = life > 0.0 ? (1.0 - t) * smoothstep(0.0, 0.15, t) : 0.0; vec4 wp = modelMatrix * vec4(position, 1.0); vLit = pow(max(dot(normalize(wp.xyz - cameraPosition), normalize(sunDir)), 0.0), 3.0); vec4 mv = viewMatrix * wp; gl_PointSize = (0.25 + t * ${grow.toFixed(2)}) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color, sunCol; varying float vA; varying float vLit; void main(){ vec4 t = texture2D(map, gl_PointCoord); vec3 c = color * (0.85 + vLit * 0.5) + sunCol * vLit * 0.08; gl_FragColor = vec4(c, t.a * vA * ${alpha.toFixed(2)}); if (gl_FragColor.a < 0.004) discard; }`,
    });
    P.points = new THREE.Points(geo, mat);
    P.points.frustumCulled = false;
    this.scene.add(P.points);
    return P;
  }
  buildDust() {
    // 粒は小さな点に見えないよう大きく広げて薄く（色も日なたで黄ばみすぎない土色）
    this.dustP = this.makePuffs(420, 0x857a66, 4.2, 0.2);
    this.mudP = this.makePuffs(160, 0x3a2e22, 0.5, 0.75);
    // 水しぶき：川・浅瀬・水田を渡る足もとから、白く跳ねてすぐ落ちる
    this.sprayP = this.makePuffs(160, 0xd6dee0, 0.9, 0.48);
    this.dustMat = this.dustP.points.material;
    this.buildHaze();
  }

  // ---------------- 硝煙の名残 ----------------
  // 鉄砲の煙（兵の側で出す一瞬の煙）の跡に、低くたなびく大きな薄い煙を残す。何挺も撃つと、しばらく前が霞む
  buildHaze() {
    // 硝煙は重く、地面近くに低く溜まって横へ流れる（平たく、低い所に置く）
    this.haze = this.makeVeil(0xc2c2be, SETTINGS.quality === 'low' ? 80 : 160, 404, 0.5);
    this.haze.low = true;
    // 土煙：騎馬や隊が駆けた後に、低く大きく残る土色の雲（乾いた日だけ）
    this.dustVeil = this.makeVeil(0x908572, 200, 505, 0.55);
    // 地を這う靄：朝靄の戦・朝・雨上がりに、野の低い所を白い靄の層がゆっくり流れる
    this.mistVeil = this.makeVeil(0xe2e4e2, 70, 606, 0.3);
    // 血の霧：打たれた所に一瞬ふっと立ち、すぐ薄れる細かな赤い霧（カメラのすぐ前でも見える）
    this.bloodVeil = this.makeVeil(0x7a1812, 40, 707, 0.85, [0.6, 1.8]);
  }
  // 血の霧を一つ置く（y：打たれた高さ。amt：0〜1、設定の blood で強さを変えて渡す）
  bloodMist(x, y, z, amt = 1) {
    const B = this.bloodVeil;
    if (!B || amt <= 0) return;
    if (B.list.length >= B.CAP) B.list.shift();
    const gy = this.heightAt(x, z);
    this.stampBlood(x + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8, 0.5 + amt * 0.4, 30 + amt * 30);
    B.list.push({ x, z, t: 0, life: 0.9 + Math.random() * 0.5, s0: 0.35, s1: 1.1 + amt * 0.6, a: 0.6 * amt, fin: 14, rise: (y - gy - 0.55) / 0.02, yOff: true });
  }
  // 霧の中の光の筋：日の方から地面へ斜めに差す、淡い光の帯。板を数枚だけ、筋の向きを軸にカメラへ向けて立てる
  // 置き場は世界に留め（カメラが動くと筋が流れないように）、遠く離れた筋は反対の側へ回して使い回す
  buildShafts() {
    const N = 9, RANGE = 75, R = rng((this.def.seed || 3) * 7 + 11);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    const ofs = new Float32Array(N * 3), dat = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { ofs[i * 3] = (R() * 2 - 1) * RANGE; ofs[i * 3 + 2] = (R() * 2 - 1) * RANGE; dat[i * 3] = 3 + R() * 8; dat[i * 3 + 1] = 45 + R() * 40; dat[i * 3 + 2] = R() * 6.28; }
    geo.setAttribute('ofs', new THREE.InstancedBufferAttribute(ofs, 3));
    geo.setAttribute('dat', new THREE.InstancedBufferAttribute(dat, 3));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol, fogC: { value: new THREE.Color() }, focus: { value: new THREE.Vector3() }, amt: { value: 0 }, time: this.skyMat.uniforms.time, range: { value: RANGE } },
      vertexShader: `attribute vec3 ofs; attribute vec3 dat; uniform vec3 sunDir, focus; uniform float range; varying vec2 vUv; varying vec3 vW; varying float vPh; varying float vEdge;
        void main(){
          vec2 rel = mod(ofs.xz - focus.xz + range, range * 2.0) - range;
          vec3 base = vec3(focus.x + rel.x, focus.y - 2.0, focus.z + rel.y);
          vec3 ax = normalize(sunDir);
          vec3 side = normalize(cross(ax, normalize(base - cameraPosition)));
          vW = base + ax * dat.y * (position.y + 0.5) + side * dat.x * position.x;
          vUv = position.xy + 0.5; vPh = dat.z;
          vEdge = 1.0 - smoothstep(range * 0.65, range, length(rel));
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
        }`,
      fragmentShader: `uniform vec3 sunDir, sunCol, fogC; uniform float amt, time; varying vec2 vUv; varying vec3 vW; varying float vPh; varying float vEdge;
        void main(){
          float ac = 1.0 - abs(vUv.x * 2.0 - 1.0); ac = ac * ac * (3.0 - 2.0 * ac);
          float al = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
          // 筋の中のむら（雲の切れ間が動いて、光がゆっくり強まり弱まる）
          float st = (0.65 + 0.35 * sin(vUv.x * 9.0 + vPh + time * 0.25)) * (0.55 + 0.45 * sin(time * 0.11 + vPh * 3.0));
          vec3 v = vW - cameraPosition; float dist = length(v);
          float fwd = pow(max(dot(v / dist, normalize(sunDir)), 0.0), 3.0);
          float a = amt * ac * al * st * vEdge * (0.12 + 1.3 * fwd) * smoothstep(5.0, 22.0, dist) * 0.09;
          gl_FragColor = vec4(mix(sunCol, fogC, 0.35) * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.shafts = new THREE.Mesh(geo, mat);
    this.shafts.frustumCulled = false;
    this.shafts.renderOrder = 3;
    this.shafts.visible = false;
    this.scene.add(this.shafts);
  }
  updateShafts(want, focus) {
    if (SETTINGS.quality === 'low') want = 0;
    if (!this.shafts) { if (want <= 0.01) return; this.buildShafts(); }
    const U = this.shafts.material.uniforms;
    U.amt.value += (want - U.amt.value) * 0.02;
    this.shafts.visible = U.amt.value > 0.01;
    if (!this.shafts.visible) return;
    U.focus.value.set(focus.x, this.heightAt(focus.x, focus.z), focus.z);
    U.fogC.value.copy(this.scene.fog.color);
  }
  updateGroundMist(dt, focus) {
    const M = this.mistVeil;
    if (!M) return;
    const morningMist = this.dayClock ? this.dayClock.mist : Math.max(0, 1 - this.time / 150);
    const early = this.def.mist ? (this.dayClock ? morningMist : Math.max(0, 1 - this.time / 90)) : 0;
    if (this.timeKey === 'after') this.afterT = (this.afterT || 0) + dt; else this.afterT = 0;
    // 雨上がり：地面から白い靄が立ち、一分半ほどで薄れる
    const after = this.timeKey === 'after' ? Math.max(0, 1 - this.afterT / 90) * 0.9 : 0;
    // 雨：野の奥にも靄の帯を重ね、遠い木立が一枚の灰色の板でなく、奥へ幾重にも重なって霞の中から立つように見せる
    const rainMist = Math.min(1, Math.max(0, (this.rainLevel || 0) - 0.15) * 1.2) * 0.8;
    const amt = Math.max(early, after, this.mood === 'morning' && this.timeKey === 'day' ? (this.dayClock ? 0.3 * morningMist : 0.12 + 0.18 * morningMist) : 0, this.def.mist && !this.dayClock ? 0.2 : 0, rainMist) * (SETTINGS.quality === 'low' ? 0.5 : 1);
    const want = Math.round(amt * 60);
    // 遠く離れた靄は捨て、足りなければ周りに足す
    for (let i = M.list.length - 1; i >= 0; i--) { const p = M.list[i]; if (Math.hypot(p.x - focus.x, p.z - focus.z) > (rainMist > 0 ? 170 : 110)) M.list.splice(i, 1); }
    let add = Math.min(3, want - M.list.length);
    while (add-- > 0) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * (rainMist > 0 ? 150 : 85), bg = rainMist > 0 && r > 70 ? 1.8 : 1;
      M.list.push({ x: focus.x + Math.cos(a) * r, z: focus.z + Math.sin(a) * r, t: 0, life: 40 + Math.random() * 30, s0: (12 + Math.random() * 6) * bg, s1: (20 + Math.random() * 12) * bg, a: 0.038 + amt * 0.055, rise: -0.004 });
    }
    this.flowVeil(M, dt);
  }
  // 低くたなびく大きな薄い雲（硝煙・土煙）。日の方を向くと透けて明るく、日を背にすると灰に沈む
  // 生まれたては濃く色が強く、流れるうちに周りの霞の色へ褪せる
  makeVeil(color, CAP, seed, flat, near = [7, 24]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    const ctr = new Float32Array(CAP * 3), dat = new Float32Array(CAP * 3);
    geo.setAttribute('ctr', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3));
    geo.setAttribute('dat', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3));
    geo.instanceCount = 0;
    if (!this.puffTex) this.makePuffTex();
    // もこもこした煙の絵
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const R = rng(seed);
    for (let i = 0; i < 30; i++) {
      const a = R() * 6.28, r = R() * 34, px = 64 + Math.cos(a) * r, py = 70 + Math.sin(a) * r * 0.6, rr = 16 + R() * 26;
      const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, color: { value: new THREE.Color(color) }, fogC: { value: new THREE.Color(0xaaaaaa) }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol },
      // dat.x ＝ 大きさ、dat.y ＝ 濃さ、dat.z ＝ 年（0 生まれたて〜1 消える）
      vertexShader: `attribute vec3 ctr; attribute vec3 dat; uniform vec3 sunDir, sunCol, color, fogC; varying vec2 vUv; varying float vA; varying vec3 vC;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(ctr, 1.0);
          mv.xy += position.xy * vec2(dat.x * 1.6, dat.x * ${flat.toFixed(2)});
          // カメラのすぐ前では薄く（板が顔を横切らないように）
          vA = dat.y * smoothstep(${near[0].toFixed(1)}, ${near[1].toFixed(1)}, -mv.z);
          // 日の光：日の方を見ると光を通して明るく、日を背にすると陰の灰
          vec3 vd = normalize(ctr - cameraPosition);
          float fw = pow(max(dot(vd, normalize(sunDir)), 0.0), 3.0);
          vec3 c = mix(color, fogC * 1.02, smoothstep(0.1, 0.9, dat.z) * 0.6);
          // 煙は自ら光らない：霞の明るさ（＝その時の空の明るさ）に合わせて沈める。夕暮れ・夜に白く光る綿にならない
          float amb = clamp(dot(fogC, vec3(0.3, 0.59, 0.11)) * 1.45, 0.2, 1.0);
          vC = (c * (0.8 + fw * 0.32) + sunCol * fw * 0.06) * amb;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vC; void main(){ vec2 dd = (vUv - 0.5) * 2.0; float a = texture2D(map, vUv).a * (0.45 + 0.55 * texture2D(map, vUv.yx * 0.7 + 0.15).a) * vA * (1.0 - smoothstep(0.15, 1.0, length(dd))); a = min(a, 0.42); if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return { mesh, ctr, dat, CAP, list: [], spare: Array.from({ length: CAP }, () => ({})), seen: new WeakSet(), scanT: 0, load: 0, k: 0 };
  }
  // 煙の入れ物は、消えたものか上限で退けたものを使い回す。
  veilParticle(H) {
    const p = H.list.length >= H.CAP ? H.list.shift() : H.spare.pop();
    p.fin = 0; p.yOff = false; p.rise = 0; p.environment = false;
    H.list.push(p);
    return p;
  }
  // 硝煙の名残を一つ置く（兵の側からも呼べる：world.gunSmoke(x, z)）
  gunSmoke(x, z, tint, environment = false) {
    const H = this.haze;
    if (!H) return;
    if (environment && (SETTINGS.reduceMotion || H.list.length >= (SETTINGS.quality === 'low' ? 16 : 32))) return;
    if (tint) H.mesh.material.uniforms.color.value.set(tint);
    // 同じ列の一斉射は若い雲へ溜める。枚数を増やして前の射撃の煙を追い出さない。
    for (let i = H.list.length - 1; i >= 0; i--) {
      const p = H.list[i], dx = p.x - x, dz = p.z - z;
      if (p.t > 6 || dx * dx + dz * dz > 9) continue;
      p.a = Math.min(0.34, p.a + 0.06);
      if (!SETTINGS.reduceMotion) p.s1 = Math.min(24, p.s1 + 1);
      return;
    }
    const p = this.veilParticle(H);
    p.environment = environment;
    p.x = x + (Math.random() - 0.5) * 2; p.z = z + (Math.random() - 0.5) * 2;
    const calm = Math.max(0, Math.min(1, 1.15 - WIND_STATE.gust));
    p.t = 0; p.life = (32 + Math.random() * 22) * (1 + calm * 0.5); p.s0 = 4 + Math.random() * 2;
    p.s1 = 13 + Math.random() * 8; p.a = 0.16 + Math.random() * 0.08;
    H.fresh = (H.fresh || 0) + 1;
  }
  // 土煙を一つ置く（騎馬ほど大きい）
  dustCloud(x, z, big, environment = false) {
    const D = this.dustVeil;
    if (!D) return;
    if (environment && (SETTINGS.reduceMotion || D.list.length >= (SETTINGS.quality === 'low' ? 12 : 24))) return;
    // 騎馬の土煙は大きく高く舞い上がり、後ろの景色をかすませる
    const p = this.veilParticle(D);
    p.environment = environment;
    p.x = x + (Math.random() - 0.5) * 1.5; p.z = z + (Math.random() - 0.5) * 1.5;
    p.t = 0; p.life = (big ? 11 : 6) + Math.random() * 6; p.s0 = big ? 3 : 1.6;
    p.s1 = (big ? 12 : 5) + Math.random() * (big ? 6 : 4); p.a = (big ? 0.12 : 0.07) + Math.random() * 0.04;
    p.rise = (big ? 0.3 : 0.15) + Math.random() * 0.2;
    D.fresh = (D.fresh || 0) + (big ? 0.4 : 0.15);
    return p;
  }
  // 雲の群れを流して、描く数と位置を詰め直す
  flowVeil(H, dt) {
    const still = H.low && SETTINGS.reduceMotion;
    const wx = WIND_STATE.dirX * 0.6 * WIND_STATE.gust, wz = WIND_STATE.dirZ * 0.6 * WIND_STATE.gust;
    // 消えた煙を除きながら前へ詰める。並び順を保ち、一時配列を作らない。
    let n = 0, drawn = 0;
    const g = H.mesh.geometry, ctr = g.attributes.ctr.array, dat = g.attributes.dat.array, V = this.vegView;
    for (let i = 0; i < H.list.length; i++) {
      const p = H.list[i];
      const step = p.environment && SETTINGS.reduceMotion ? 0 : dt;
      p.t += step;
      if (p.t >= p.life) { if (H.spare.length < H.CAP) H.spare.push(p); continue; }
      if (!still) { p.x += wx * step; p.z += wz * step; }
      H.list[n] = p;
      const k = p.t / p.life, s = still ? p.s1 * 0.65 : p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      p.size = s;
      H.ctr[n * 3] = p.x; H.ctr[n * 3 + 1] = this.heightAt(p.x, p.z) + (p.yOff ? p.rise * 0.02 + 0.4 - s * 0.1 : H.low ? s * 0.13 + 0.35 + (still ? 0 : Math.min(1.2, p.t * 0.02)) : s * 0.22 + 0.4 + (p.rise || 0) * p.t); H.ctr[n * 3 + 2] = p.z;
      H.dat[n * 3] = s; H.dat[n * 3 + 1] = p.a * Math.min(1, p.t * (p.fin || 0.6)) * (1 - k) * (1 - k * 0.5); H.dat[n * 3 + 2] = k;
      // 霧の大きさを含めて画面外だけ省く。見通しや戦塵の計算では全粒を残す。
      if (V) { V.sphere.center.set(p.x, H.ctr[n * 3 + 1], p.z); V.sphere.radius = s * 1.3 + 2; }
      if (!V || V.fr.intersectsSphere(V.sphere)) {
        for (let j = 0; j < 3; j++) { ctr[drawn * 3 + j] = H.ctr[n * 3 + j]; dat[drawn * 3 + j] = H.dat[n * 3 + j]; }
        drawn++;
      }
      n++;
    }
    H.list.length = n;
    g.instanceCount = drawn;
    H.mesh.visible = drawn > 0;
    if (drawn) { g.attributes.ctr.needsUpdate = true; g.attributes.dat.needsUpdate = true; }
    H.mesh.material.uniforms.fogC.value.copy(this.scene.fog.color);
  }
  updateHaze(dt, focus) {
    const H = this.haze;
    if (!H) return;
    this.flowVeil(H, dt);
    // 流れた先の白煙だけで視界を薄くする。遠い一斉射で足もとまで白くしない
    const load = smokeDepth(this, focus);
    H.load = load;
    const target = Math.min(0.85, load * 2.8);
    H.k += (target - H.k) * Math.min(1, dt * (target > H.k ? 1.2 : 0.5));
    POST.smoke = Math.min(1, H.k * 1.3);
    this.updateGroundMist(dt, focus);
    if (this.bloodVeil && (this.bloodVeil.list.length || this.bloodVeil.mesh.visible)) this.flowVeil(this.bloodVeil, dt);
    // 戦塵：土煙が多く立つほど、戦場の空気が黄ばんで霞む
    const D = this.dustVeil;
    if (D) {
      this.flowVeil(D, dt);
      let dustLoad = 0;
      for (let i = 0; i < D.list.length; i++) {
        const p = D.list[i], r = p.size * 0.8 + 3;
        const d = Math.hypot(p.x - focus.x, p.z - focus.z);
        if (d < r) dustLoad += D.dat[i * 3 + 1] * (1 - d / r);
      }
      const dT = Math.min(1, dustLoad * 3);
      D.k += (dT - D.k) * Math.min(1, dt * (dT > D.k ? 1.2 : 0.5));
    }
  }

  // 乾いた地面なら土ぼこり、濡れていれば泥はね（歩いた所は踏み荒らされていく）
  // 泥の所に足跡・蹄の跡を残す（小さな暗い楕円を地面に貼る。数は 400 まで、古い物から入れ替える）
  footprint(x, z, hoof, rot = Math.random() * 6.28) {
    if (!this.splat) return;
    const k = this.splatIdx ? this.splatIdx(x, z) : -1;
    const mud = k >= 0 ? this.splat[k * 3 + 2] : 0;
    const wet = this.rainLevel > 0.4 || (this.wetness || 0) > 0.5 || (this.def.muddy || 0) > 0.5;
    if (mud < 0.35 && !(wet && mud < 0.35 && Math.random() < 0.3)) return;
    if (!this.feet) {
      const g = new THREE.CircleGeometry(0.5, 10); g.rotateX(-Math.PI / 2);
      this.feet = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x241c14, transparent: true, opacity: 0.45, depthWrite: false, fog: true }), 400);
      this.feet.count = 0; this.feet.renderOrder = 1; this.feetI = 0; this.feetD = new THREE.Object3D();
      this.scene.add(this.feet);
    }
    const d = this.feetD, i = this.feetI = (this.feetI + 1) % 400;
    d.position.set(x + (Math.random() - 0.5) * 0.4, this.heightAt(x, z) + 0.03, z + (Math.random() - 0.5) * 0.4);
    d.rotation.set(0, rot, 0);
    if (hoof) d.scale.set(0.32, 1, 0.3); else d.scale.set(0.2, 1, 0.5);
    d.updateMatrix();
    this.feet.setMatrixAt(i, d.matrix);
    this.feet.count = Math.max(this.feet.count, i + 1);
    this.feet.instanceMatrix.needsUpdate = true;
  }
  splatIdx(x, z) {
    const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
    if (i < 0 || j < 0 || i > SEG || j > SEG) return -1;
    return j * (SEG + 1) + i;
  }

  // (x, z) が水の中か（小川・川・水田）
  inWaterAt(x, z, y) {
    if (y != null) return this.waterFootDepthAt(x, z, y) > 0.02;
    const d = this.def;
    for (const st of d.streams || NO_STREAMS) if (st.pts && distToPolyline(x, z, st.pts) < st.w && this.waterDepthAt(x, z) > 0.02) return true;
    const W = d.water;
    if (W && x > W.x && x < (W.x2 ?? 1e9) && this.heightAt(x, z) < (W.level ?? -99) + 0.3) return true;
    return (this.field.wet && !!(d.paddy && d.paddy(x, z) > 0.55)) || this.villageWaterDepthAt(x, z) > 0.02;
  }
  villageWaterDepthAt(x, z) {
    let depth = 0;
    for (const f of this.villageFields) {
      if (!f.wet) continue;
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx * f.c - dz * f.s) < f.w / 2 && Math.abs(dx * f.s + dz * f.c) < f.d / 2) depth = Math.max(depth, f.y - this.heightAt(x, z));
    }
    return Math.max(0, depth);
  }
  // 描いている水面から川床までの深さ。水田は浅い水として扱う。
  waterDepthAt(x, z) {
    let depth = 0;
    const ground = this.heightAt(x, z);
    for (const st of this.def.streams || NO_STREAMS) {
      if (!st.pts) continue;
      let best = Infinity, cx = 0, cz = 0, bestSegment = 0, bestT = 0;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; cx = px; cz = pz; bestSegment = i; bestT = t; }
      }
      if (best >= st.w * st.w) continue;
      let level = this.heightAt(cx, cz) - fordLift(st, cx) + st.depth;
      const surface = st.surface;
      if (surface && surface.length >= 6 && st.surfaceSteps[bestSegment]) {
        const f = bestT * st.surfaceSteps[bestSegment], step = Math.min(Math.floor(f), st.surfaceSteps[bestSegment] - 1);
        const i = (st.surfaceStarts[bestSegment] + step) * 3, t = f - step;
        level = surface[i + 2] + (surface[i + 5] - surface[i + 2]) * t;
      }
      depth = Math.max(depth, level + (st.mesh ? st.mesh.position.y : 0) - ground);
    }
    const w = this.def.water;
    if (w && x > w.x && x < (w.x2 ?? Infinity)) depth = Math.max(depth, (w.level ?? -99) - ground);
    if (this.field.wet && this.def.paddy && this.def.paddy(x, z) > 0.55) depth = Math.max(depth, 0.12);
    depth = Math.max(depth, this.villageWaterDepthAt(x, z));
    return Math.max(0, depth);
  }
  // 水面を描く深さと、足が浸かる深さを分ける。橋の下の川では濡らさない。
  waterFootDepthAt(x, z, y) {
    const depth = this.waterDepthAt(x, z);
    if (depth <= 0) return 0;
    const bed = this.heightAt(x, z);
    return Math.max(0, bed + depth - (y ?? bed));
  }
  // 遊び手も兵も同じ浅瀬の減速を使う。数だけ返し、入れ物を増やさない。
  waterSpeedAt(x, z, mounted, y) {
    const depth = this.waterFootDepthAt(x, z, y);
    if (depth <= 0.02) return 1;
    const d = Math.min(0.85, depth);
    return mounted ? Math.max(0.3, 0.6 - d * 0.35) : Math.max(0.5, 0.85 - d * 0.4);
  }
  // 足もとの水しぶき（n：粒の数。馬は多い）
  spray(x, z, n = 4) {
    const P = this.sprayP;
    if (!P) return;
    const y = this.heightAt(x, z) + this.waterDepthAt(x, z) + 0.05;
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.life.length;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      P.vel[i * 3] = (Math.random() - 0.5) * 2.2; P.vel[i * 3 + 1] = 1.8 + Math.random() * 1.8; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
      P.life[i] = P.max[i] = 0.3 + Math.random() * 0.25;
    }
  }
  // 駆ける蹄が後ろへ蹴り上げる土くれと草（使い回しの泥の粒。重さで弧を描いて落ちる）。dx,dz は馬の向き
  kick(x, z, dx, dz, n = 3, sp = 10) {
    if (this.inWaterAt(x, z)) { this.spray(x, z, n); return; }
    const P = this.mudP, y = this.heightAt(x, z), k = Math.min(1.4, sp / 9);
    for (let j = 0; j < n; j++) {
      const i = P.i = (P.i + 1) % P.life.length, b = 1.2 + Math.random() * 2.2;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; P.pos[i * 3 + 1] = y + 0.15; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      P.vel[i * 3] = (-dx * b + (Math.random() - 0.5) * 1.2) * k; P.vel[i * 3 + 1] = (1.8 + Math.random() * 2.2) * k; P.vel[i * 3 + 2] = (-dz * b + (Math.random() - 0.5) * 1.2) * k;
      P.life[i] = P.max[i] = 0.45 + Math.random() * 0.3;
    }
  }
  puff(x, z, n = 2) {
    // 水の中を行く兵は、土煙の代わりに水しぶき（踏み荒らしも付けない）
    if (this.inWaterAt(x, z)) { if (Math.random() < 0.6) this.spray(x, z, n >= 2 ? 5 : 2); return; }
    const wet = this.rainLevel > 0.4 || (this.wetness || 0) > 0.5;
    // 馬は蹄で深く掘り返す（通るたびに轍のような筋が濃くなる）
    this.stampWear(x, z, n >= 2 ? 1.5 : 1.1, (wet ? 16 : 10) * (n >= 2 ? 1.6 : 1));
    if (Math.random() < 0.5) this.footprint(x, z, n >= 2);
    const P = wet ? this.mudP : this.dustP;
    const y = this.heightAt(x, z);
    // 乾いた地面では、駆けた後に大きな土煙がしばらく残る（騎馬ほど多く）
    if (!wet && Math.random() < (n >= 2 ? 0.35 : 0.07)) this.dustCloud(x, z, n >= 2);
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.life.length;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.5; P.pos[i * 3 + 1] = y + 0.1; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
      if (wet) { P.vel[i * 3] = (Math.random() - 0.5) * 1.6; P.vel[i * 3 + 1] = 1.2 + Math.random() * 1.2; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.6; P.life[i] = P.max[i] = 0.35 + Math.random() * 0.2; }
      else { P.vel[i * 3] = (Math.random() - 0.5) * 0.5 + 0.25; P.vel[i * 3 + 1] = 0.25 + Math.random() * 0.3; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5; P.life[i] = P.max[i] = 1.4 + Math.random() * 1.2; }
    }
  }
  updatePuffs(P, dt, grav) {
    let changed = false, count = 0;
    const drag = 1 - dt * 0.8;
    for (let i = 0; i < P.life.length; i++) {
      if (P.life[i] <= 0) continue;
      changed = true;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -999; continue; }
      count = i + 1;
      P.vel[i * 3 + 1] -= grav * dt;
      for (let a = 0; a < 3; a++) { P.pos[i * 3 + a] += P.vel[i * 3 + a] * dt; if (!grav) P.vel[i * 3 + a] *= drag; }
    }
    // 粒の上限は保ち、末尾の消えた粒と空の群れを描かない。
    P.points.geometry.setDrawRange(0, count);
    P.points.visible = count > 0;
    if (changed) {
      const g = P.points.geometry.attributes;
      g.position.needsUpdate = true; g.life.needsUpdate = true; g.lmax.needsUpdate = true;
    }
  }

  // 雨上がりの水たまり（道の上）
  addPuddles(n = 26) {
    const mat = new THREE.MeshPhongMaterial({ color: 0x28313a, shininess: 120, specular: 0xb8c4cc, transparent: true, opacity: 0.75, depthWrite: false });
    const paths = this.def.paths || [];
    const R = rng(77);
    // 縁のいびつな水たまりを何通りか作る（丸い円板が並ばないように）
    const shapes = [0, 1, 2, 3].map(() => {
      const g = new THREE.CircleGeometry(1, 18); const P = g.attributes.position;
      const f1 = 1 + Math.floor(R() * 3), f2 = 3 + Math.floor(R() * 3), p1 = R() * 6, p2 = R() * 6;
      for (let k = 1; k < P.count; k++) { const x = P.getX(k), y = P.getY(k), a = Math.atan2(y, x); const m = 1 + Math.sin(a * f1 + p1) * 0.22 + Math.sin(a * f2 + p2) * 0.1; P.setXY(k, x * m, y * m); }
      g.rotateX(-Math.PI / 2); return g;
    });
    // 水たまりは一つずつ描く（一つ一回）ので、画質「低」（携帯）は 8 つまで
    if (SETTINGS.quality === 'low') n = Math.min(n, 8);
    for (let i = 0; i < n && paths.length; i++) {
      const p = paths[Math.floor(R() * paths.length)];
      const k = Math.floor(R() * (p.length - 1)), t = R();
      const x = p[k][0] + (p[k + 1][0] - p[k][0]) * t + (R() - 0.5) * 3, z = p[k][1] + (p[k + 1][1] - p[k][1]) * t + (R() - 0.5) * 3;
      const m = new THREE.Mesh(shapes[i % 4], mat);
      m.position.set(x, this.heightAt(x, z) + 0.04, z);
      m.scale.set(0.6 + R() * 1.4, 1, 0.4 + R() * 0.9);
      m.rotation.y = R() * 3;
      this.scene.add(m);
    }
  }

  // 川辺の葦
  buildReeds() {
    const w = this.def.water;
    const geo = new THREE.ConeGeometry(0.05, 1.6, 3); geo.translate(0, 0.8, 0);
    const N = 700;
    const mesh = new THREE.InstancedMesh(geo, sway(liteMat({ color: 0x8a8a52, roughness: 0.9 }), 0.08, 0.3), N);
    const d = new THREE.Object3D();
    const R = rng(55);
    for (let i = 0; i < N; i++) {
      // こちら岸と向こう岸の両方
      const far = w.x2 && i % 3 === 0;
      const x = far ? w.x2 + 1 + R() * 6 : w.x - 1 - R() * 7, z = (R() * 2 - 1) * 175;
      d.position.set(x, this.heightAt(x, z) - 0.1, z);
      d.rotation.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3);
      d.scale.setScalar(0.7 + R() * 0.8);
      d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
    }
    this.scene.add(mesh);
  }

  // 遠景の軍勢（軽い作りの兵を一度に描く。兵力の数には入れない）
  // o：{ x, z, w, d, count, facing, armor, flagTex か flag（家紋の鍵）, seed, kind, mon, tack, people }
  //   kind は並び（'mixed'・'spear'・'gun'・'bow'・'cavalry'・'honjin'）。people を渡すと、その場所に一人ずつ置く
  //   people：[{ x, z, facing, k: 'spear'|'gun'|'bow'|'samurai'|'banner'|'rider'|'seated', flag, helm }]（世界の座標）
  // 返す物（THREE.Group）で、戦の側から隊を動かせる：
  //   army.advance(dist, secs, { charge })  前へ dist m を secs 秒で（charge で槍を下ろす）
  //   army.retreat(dist, secs)              背を向けて退き、着いたら向き直る
  //   army.rout({ hideAfter })              崩れて散る（ばらばらに逃げ、何人かは倒れる。hideAfter 秒で消す。既定 40）
  //   army.halt()・army.reform()            止まる・元の並びに戻す
  //   army.follow(fn, { gap })              fn() が返す { x, z, facing } の後ろへ付いて歩く（null で止まる）
  addDistantArmy(o) {
    const mon = o.mon || o.flag || o.flagTex?.userData.mon;
    const familyMon = o.yoseFamily || (['takeda', 'akazonae', 'furin', 'azai', 'asakura', 'imagawa'].includes(o.flag) ? o.flag : mon);
    const family = ['takeda', 'akazonae', 'furin'].includes(familyMon) ? 'takeda' : familyMon;
    // 本陣・鉄砲列・指定済みの持ち場は保つ。広い平場の備と騎馬だけ寄せの横隊にする。
    const yose = o.yose ?? (!o.people && ['takeda', 'azai', 'asakura', 'imagawa'].includes(family)
      && ['mixed', 'cavalry'].includes(o.kind || 'mixed') && (o.w || 20) >= 8 && (o.d || 10) >= 8);
    o = { ...o, yose };
    const R = rng(o.seed || 9);
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    const facing = o.facing || 0;
    let L;
    if (o.people) {
      const KD = { spear: 0, gun: 1, bow: 2, samurai: 3, banner: 4, rider: 5, seated: 6 };
      L = { list: o.people.map((p) => ({ wx: p.x, wz: p.z, yawW: p.facing ?? facing, k: KD[p.k] ?? (p.k | 0), helm: p.helm ?? (KD[p.k] >= 3 ? 1 : 0), ex: p.ex ?? (p.k === 'spear' ? 1.2 : 0), general: p.general, flag: p.flag ?? (p.k === 'banner' || p.k === 'seated' ? 0 : 1), yaw: 0 })) };
    } else L = armyLayout(o, R);
    if (yose && o.people) {
      L.list.sort((a, b) => (b.k >= 3 ? 1 : 0) - (a.k >= 3 ? 1 : 0) || (b.k === 5 && (b.ex === 0 || b.ex === 2) ? 1 : 0) - (a.k === 5 && (a.ex === 0 || a.ex === 2) ? 1 : 0));
      L.nImp = L.list.filter((p) => p.k >= 3).length;
    }
    const S = L.list, N = S.length;
    const near = o.near ?? N <= 160;
    const armor = o.armor || 0x2b3140;
    const flagTex = o.flagTex || flagTexture(o.flag || o.mon || 'tokugawa');
    const U = {
      uYose: { value: yose ? 1 : 0 },
      uAT: WIND, uGust: GUST, uIdle: ARMY_IDLE, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
      uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
      // 本人から60m（ARMY_REAL_R）の内の軽い兵は描かない（棒人間を出さない。10/10 kaito「なんで棒人間まだいるの」）。そこは本物の兵で埋める
      uNear: { value: 0 }, uUnavailable: { value: 0 }, uRealNear: ARMY_REAL_R,
      uMoveLim: { value: this.def?.moveLim || 176 },
    };
    // 低の近景は顔・袖・兜を残す軽い立体。遠さに応じて三段階で形を替える。
    const body = new THREE.InstancedMesh(soldierGeo(armor, SETTINGS.quality === 'low' ? 'xlo' : near), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), N);
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const flagMat = armyShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U);
    const flags = new THREE.InstancedMesh(SASHI_GEO, flagMat, N);
    const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2);
    const d = new THREE.Object3D(), col = new THREE.Color(), cf = Math.cos(facing), sf = Math.sin(facing);
    const riders = [], bearers = [], chiefs = [];
    let sx = 0, sz = 0;
    S.forEach((s, i) => {
      let x, z, yaw;
      if (s.wx !== undefined) { x = s.wx; z = s.wz; yaw = s.yawW; } else {
        x = o.x + s.lx * cf + s.lz * sf; z = o.z - s.lx * sf + s.lz * cf;
        yaw = facing + s.yaw + (R() - 0.5) * (yose ? 0.04 : 0.24);
      }
      sx += x; sz += z;
      // 高さは形の側で地面から読み直す（ここの高さは画面の外かどうかの判断用）
      d.position.set(x, this.heightAt(x, z), z);
      d.rotation.set(0, yaw, 0);
      // 背丈と肩幅のばらつき（ときどき大柄な者・小柄な者）
      const tall = yose && s.k === 5 && s.ex === 2 ? 1.02 : 0.891 + R() * 0.063;
      const width = 0.93 + R() * 0.15;
      d.scale.set(tall * width, tall, tall * (0.96 + (width - 1) * 0.6));
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix); flags.setMatrixAt(i, d.matrix);
      // 一人ずつ少し色が違う（使い込んだ具足）
      body.setColorAt(i, yose && s.k === 5 && s.ex === 2 ? col.set(0xe7c07a) : soldierTint(col, R));
      info.set([R(), s.k, s.helm, s.ex], i * 4); info2.set([s.flag, R()], i * 2);
      if (s.k === 5) { riders.push(i); if (yose && family === 'takeda' && s.ex === 2) chiefs.push(i); }
      if (s.k === 4) bearers.push(i);
    });
    const setInfo = (mesh, idx) => {
      const a = new Float32Array(idx.length * 4), b = new Float32Array(idx.length * 2);
      idx.forEach((j, n) => { a.set(info.subarray(j * 4, j * 4 + 4), n * 4); b.set(info2.subarray(j * 2, j * 2 + 2), n * 2); });
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(a, 4));
      mesh.geometry.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(b, 2));
      mesh.geometry.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(idx.length), 1));
    };
    const all = S.map((_, i) => i);
    setInfo(body, all); setInfo(flags, all);
    this.lodTwin(body, armor);
    this.lodFlag(flags);
    const grp = new THREE.Group();
    grp.add(body, flags);
    const m4 = new THREE.Matrix4();
    const copyTo = (mesh, idx) => { idx.forEach((j, n) => { body.getMatrixAt(j, m4); mesh.setMatrixAt(n, m4); }); setInfo(mesh, idx); };
    // 幟（旗持ちの竿から垂れる）
    let banners = null;
    if (bearers.length) {
      let geo = BANNER_GEO, mat = armyShader(new THREE.MeshLambertMaterial({ map: yose ? yoseFlagTexture(family) : flagTex, side: THREE.DoubleSide }), U);
      if (yose) {
        if (!YOSE_BANNER_GEO) YOSE_BANNER_GEO = clothGeo(0.66, 3.7, 3, 6, 0.3, 5.2, 0.14, 12);
        geo = YOSE_BANNER_GEO;
        const compile = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh) => { compile(sh); if (family === 'takeda') sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (clamp(vMapUv.x, 0.008, 0.992) + mod(aInfo.w, 6.0)) / 6.0;'); };
        mat.customProgramCacheKey = () => family === 'takeda' ? '寄せの幟六色' : '寄せの幟';
      }
      banners = new THREE.InstancedMesh(geo, mat, bearers.length);
      copyTo(banners, bearers); this.lodFlag(banners, true, yose); grp.add(banners);
    }
    // 足もとの影：影の絵（±45m）の外にいる遠くの兵も、足もとだけ暗くして地面に立たせる（兵と同じ動きで付いて回る）
    if (!SHADE_GEO) { SHADE_GEO = new THREE.CircleGeometry(0.62, 10); SHADE_GEO.rotateX(-Math.PI / 2); SHADE_GEO.scale(1.25, 1, 1); SHADE_GEO.translate(0, 0.05, 0); }
    const shade = new THREE.InstancedMesh(SHADE_GEO, armyShader(new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), U), N);
    copyTo(shade, all); shade.renderOrder = 1; grp.add(shade);
    // 画質「低」（携帯）：足もとの影の板は描かない（一隊に一回・遠目には見えない）
    if (SETTINGS.quality === 'low') shade.visible = false;
    // 馬
    let horses = null;
    if (riders.length) {
      horses = new THREE.InstancedMesh(horseGeo(), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), riders.length);
      copyTo(horses, riders); this.lodTwin(horses, null, true, horseGeo(true));
      const HC = [0x3a2a1e, 0x4e3624, 0x2a221c, 0x5e4430, 0x6a5040, 0x1e1a18];
      riders.forEach((i, n) => { col.set(yose && S[i].ex === 2 ? 0xe9e4d6 : HC[Math.floor(R() * HC.length)]).multiplyScalar(0.9 + R() * 0.2); horses.setColorAt(n, col); });
      grp.add(horses);
    }
    // 白熊の飾りは中央の一騎だけ。全員の形へ足さず、一枚の形を使い回す。
    let plumes = null;
    if (chiefs.length) {
      if (!YOSE_PLUME_GEO) {
        const P = [];
        const crown = new THREE.SphereGeometry(0.23, 8, 4); crown.scale(1.05, 0.75, 1); crown.translate(0, 1.89, -0.03); armyPart(P, crown, 0xeee8d9, 0);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.45 + i * 1.1 / 6), hair = new THREE.ConeGeometry(0.075, 0.55, 4);
          hair.rotateZ(Math.PI); hair.translate(Math.cos(a) * 0.21, 1.65, -0.12 - Math.sin(a) * 0.17); armyPart(P, hair, 0xe6dfd0, 0);
        }
        YOSE_PLUME_GEO = mergeGeometries(P);
      }
      plumes = new THREE.InstancedMesh(YOSE_PLUME_GEO, armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), chiefs.length);
      copyTo(plumes, chiefs); grp.add(plumes);
    }
    // 本陣：陣幕と馬印
    if (o.kind === 'honjin' && o._maku) this.honjinDressing(grp, o, facing);
    this.scene.add(grp);
    const cx = o.people ? sx / N : o.x, cz = o.people ? sz / N : o.z;
    const A = { mesh: grp, x0: 0, U, body, flags, n: N, nImp: L.nImp ?? N, cx, cz, facing, face0: facing, off: new THREE.Vector3(), tw: null, rout: 0, followFn: null , hw0: (o.w || 20) / 2, hd0: (o.d || 10) / 2, people: !!o.people };
    // 遠くほど兵を間引き、旗は体の二倍まで残す。既存の束と軽い形で旗の林を保つ。
    const cw = new THREE.Vector3();
    // 同じ描画の体・旗・馬は、遠さを一度だけ数える。
    const lodState = { n: 0, flags: false, gone: false };
    let lodFrame = -1, lodCam = null;
    const lod = (r, cam) => {
      if (lodFrame === r.info.render.frame && lodCam === cam) return lodState;
      lodFrame = r.info.render.frame; lodCam = cam;
      cw.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(grp.matrixWorld);
      const dd = Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z);
      // 霧の奥（見通しの一倍半より先）はほとんど見えないので描かない
      const vis = this.vis || 230, gone = dd > vis * 1.5 + 30;
      const near0 = Math.min(110, vis * 0.6);
      const keep = (dd < near0 ? 1 : Math.max(0.4, 1 - (dd - near0) / 260)) * lowKeep(dd);
      lodState.n = gone ? 0 : Math.max(A.nImp, Math.ceil(N * keep));
      lodState.flags = !gone && dd < Math.min(SETTINGS.quality === 'low' ? 160 : 230, vis);
      lodState.gone = gone;
      return lodState;
    };
    body.onBeforeRender = (r, sc, cam) => { body.count = lod(r, cam).n; };
    // 小さな足元の影は遠くでは読めない。近景は全員分を残す。
    shade.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); shade.count = l.gone || Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z) > 70 ? 0 : l.n; };
    flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); flags.count = l.flags ? Math.min(N, l.n * 2) : 0; };
    //   馬も、低（携帯）では数を減らす（lowKeep）
    const lodAll = (mesh) => { const n0 = mesh.count; mesh.onBeforeRender = (r, sc, cam) => { mesh.count = lod(r, cam).gone ? 0 : Math.max(mesh === horses && yose ? Math.min(n0, 21) : 0, Math.ceil(n0 * (mesh === horses ? lowKeep(150) : 1))); }; };
    if (banners) lodAll(banners);
    if (horses) lodAll(horses);
    if (plumes) lodAll(plumes);
    // 後詰め：隊の後ろに、同じ旗の軽い兵を厚く続ける（地平を埋める奥行き。本体と同じ動き・崩れ方。戦の数や置き換えには入れない）
    const kd0 = o.kind || 'mixed';
    if (!o.people && o.host !== false && kd0 !== 'honjin' && kd0 !== 'cavalry' && N >= 60) {
      const h = this.armyHost({ x: o.x, z: o.z, facing, w: o.w || 20, d: o.d || 10, count: typeof o.host === 'number' ? o.host : Math.round(Math.max(40, Math.min(420, N * 0.8))), armor, flagTex, seed: (o.seed || 9) + 71, U });
      grp.add(...h.meshes);
      A.hostD = h.depth; A.host = h;
    }
    // 逃げる兵は隊の外へ出るので、画面の外かどうかの判断をやめる
    for (const c of grp.children) if (c.isInstancedMesh) c.computeBoundingSphere();
    const ctl = (v) => { for (const c of grp.children) c.position.copy(A.off); return v; };
    grp.advance = (dist, secs, opt = {}) => {
      const fx = Math.sin(A.face0), fz = Math.cos(A.face0);
      A.tw = { from: A.off.clone(), to: A.off.clone().add(new THREE.Vector3(fx * dist, 0, fz * dist)), t: 0, secs: secs || Math.abs(dist) / (opt.charge ? 3 : 1.3), charge: !!opt.charge, back: dist < 0 && opt.turn !== false };
      return grp;
    };
    grp.retreat = (dist, secs) => grp.advance(-Math.abs(dist), secs || Math.abs(dist) / 1.3);
    // 部隊の下知は、初めの向きへ距離だけ進むのでなく、指定された地点へ進む。
    grp.moveTo = (x, z, secs, opt = {}) => {
      const lim = (this.def.moveLim || 176) - Math.max(A.hw0, A.hd0) - 2;
      grp.updateWorldMatrix(true, false);
      const to = new THREE.Vector3(Math.max(-lim, Math.min(lim, x)), 0, Math.max(-lim, Math.min(lim, z)));
      grp.worldToLocal(to); to.y = 0; to.x -= A.cx; to.z -= A.cz;
      const d = to.distanceTo(A.off);
      A.tw = { from: A.off.clone(), to, t: 0, secs: secs || Math.max(0.1, d / (opt.charge ? 3 : 1.3)), charge: !!opt.charge, back: !!opt.back };
      return grp;
    };
    grp.halt = () => { A.tw = null; return grp; };
    grp.rout = (opt = {}) => {
      if (A.rout) return grp;
      A.rout = 1; A.routHide = opt.hideAfter ?? 40; A.tw = null;
      U.uRout.value = 1; U.uRoutT.value = 0;
      for (const c of grp.children) c.frustumCulled = false;
      return grp;
    };
    grp.reform = () => {
      A.rout = 0; A.tw = null; A.off.set(0, 0, 0); ctl();
      U.uRout.value = 0; U.uRoutT.value = 0; U.uMarch.value = 0; U.uCharge.value = 0; U.uTurn.value = 0;
      for (const c of grp.children) { c.visible = true; c.frustumCulled = true; }
      return grp;
    };
    grp.follow = (fn, opt = {}) => { A.followFn = fn; A.gap = opt.gap ?? A.gap ?? 0; return grp; };
    grp.army = A;
    // 本物の兵に道を譲る（yieldArmies）ために、形ごとの入れ物と、旗持ち・騎馬の番を覚えておく
    A.parts = { body, flags, shade, banners, horses, plumes, chiefs, bearers, riders, grp }; A.hid = new Float32Array(N);
    // 本物の兵に置き換える時に使う：家紋・並び・人ごとの種類（0 槍 1 鉄砲 2 弓 3 侍 4 旗持ち 5 騎馬 6 床几）
    A.mon = o.mon || o.flag || (o.flagTex && o.flagTex.userData.mon) || null; if (o.team !== undefined) A.team = o.team;   // 家紋の無い軽い大軍でも、敵か味方かを渡せる（無いと味方として起きる）
    A.yose = yose; A.yoseFamily = family;
    A.armor = armor; A.kind = o.kind || (o.people ? 'people' : 'mixed'); A.people = !!o.people;
    A.kinds = S.map((s) => s.k); A.taken = new Uint8Array(N); A.took = 0;
    // (x, z) に近い、まだ置き換えていない兵を n 人まで選んで隠し、その場所・向き・種類を返す（r m より遠い者は選ばない）
    // 隠した兵は、大きさを 0 にするだけ（場所は残すので、隊の広がりの計算は変わらない）
    const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), z3 = new THREE.Vector3(0, 0, 0);
    grp.take = (x, z, n, r = 1e9, pick = null, canStand = null) => {
      grp.updateWorldMatrix(true, true);
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (A.taken[i]) continue;
        // 道を譲って隠した兵（大きさ 0）は、元の置き場の行列から向きを取る
        if (A.base && A.hid[i] > 0) m4.fromArray(A.base, i * 16); else body.getMatrixAt(i, m4);
        tp.setFromMatrixPosition(m4).add(A.off); tp.applyMatrix4(grp.matrixWorld);
        // 場外の遠景は戦う兵に替えない。出した後に境界へ飛ばすことを防ぐ。
        const lim = this.def.moveLim || 176;
        if (Math.abs(tp.x) > lim - 1 || Math.abs(tp.z) > lim - 1) continue;
        if (canStand && !canStand(tp.x, tp.z)) continue;
        const d = Math.hypot(tp.x - x, tp.z - z);
        if (d < r && (!pick || pick(A.kinds[i]))) cand.push({ i, d, x: tp.x, z: tp.z, yaw: Math.atan2(m4.elements[8], m4.elements[10]) + grp.rotation.y + (A.tw && A.tw.back ? Math.PI : 0) });
      }
      cand.sort((a, b) => a.d - b.d);
      const out = cand.slice(0, n);
      // 大きさ 0 に（道を譲って既に 0 の兵を分解すると向きが NaN になるので、場所だけ残す）
      const hide = (mesh, j) => { mesh.getMatrixAt(j, m4); tp.setFromMatrixPosition(m4); m4.makeScale(0, 0, 0).setPosition(tp); mesh.setMatrixAt(j, m4); mesh.instanceMatrix.needsUpdate = true; };
      // 隠す前の形を覚えておく（give で軽い兵に戻す時に使う）
      const keep = (mesh, j, i) => { const mm = new THREE.Matrix4(); if (A.base && A.hid[i] > 0) mm.fromArray(A.base, i * 16); else mesh.getMatrixAt(j, mm); return [mesh, j, mm]; };
      for (const c of out) {
        A.taken[c.i] = 1; A.took++;
        const sv = [keep(body, c.i, c.i), keep(flags, c.i, c.i), keep(shade, c.i, c.i)];
        hide(body, c.i); hide(flags, c.i); hide(shade, c.i);
        if (banners) { const j = bearers.indexOf(c.i); if (j >= 0) { sv.push(keep(banners, j, c.i)); hide(banners, j); } }
        if (horses) { const j = riders.indexOf(c.i); if (j >= 0) { sv.push(keep(horses, j, c.i)); hide(horses, j); } }
        if (plumes) { const j = chiefs.indexOf(c.i); if (j >= 0) { sv.push(keep(plumes, j, c.i)); hide(plumes, j); } }
        (A.saved || (A.saved = new Map())).set(c.i, sv);
        c.k = A.kinds[c.i]; c.general = S[c.i].general;
        if (yose) c.flagKind = c.k === 4 ? yoseFlagKinds(family)[Math.round(S[c.i].ex) % 6] : o.flag || family;
        const mm = sv[0][2]; mm.decompose(tp, tq, ts);
        c.sx = ts.x; c.sy = ts.y; c.sz = ts.z;
        c.helm = info[c.i * 4 + 2]; c.ex = info[c.i * 4 + 3]; c.flag = info2[c.i * 2];
      }
      return out;
    };
    // (x, z) から r m の内に残っている（まだ替えていない）軽い兵の数
    grp.left = (x, z, r) => {
      grp.updateWorldMatrix(true, true);
      let k = 0;
      for (let i = 0; i < N; i++) { if (A.taken[i]) continue; body.getMatrixAt(i, m4); tp.setFromMatrixPosition(m4).add(A.off); tp.applyMatrix4(grp.matrixWorld); if (Math.hypot(tp.x - x, tp.z - z) < r) k++; }
      return k;
    };
    // take で隠した兵 i を、軽い兵に戻す（本物の兵を大軍の中へ帰す時。帰した兵は、また take で選べる）
    const giveInv = new THREE.Matrix4(), givePos = new THREE.Vector3();
    grp.give = (i, pos = null, yaw = null) => {
      const sv = A.saved && A.saved.get(i);
      if (!sv || !A.taken[i]) return false;
      if (pos) {
        grp.updateWorldMatrix(true, false);
        giveInv.copy(grp.matrixWorld).invert();
        givePos.copy(pos).applyMatrix4(giveInv).sub(A.off);
        const old = sv[0][2].elements, ox = old[12], oz = old[14];
        const turn = yaw === null ? 0 : yaw - grp.rotation.y - Math.atan2(old[8], old[10]);
        m4.makeRotationY(turn);
        for (const [, , mm] of sv) {
          mm.elements[12] -= ox; mm.elements[14] -= oz;
          mm.premultiply(m4);
          mm.elements[12] += givePos.x; mm.elements[14] += givePos.z;
        }
      }
      for (const [mesh, j, mm] of sv) { mesh.setMatrixAt(j, mm); mesh.instanceMatrix.needsUpdate = true; }
      if (A.base) A.base.set(sv[0][2].elements, i * 16);
      if (A.hid[i] > 0) A.hidN = Math.max(0, (A.hidN || 0) - 1);
      A.hid[i] = 0;
      A.saved.delete(i); A.taken[i] = 0; A.took = Math.max(0, A.took - 1);
      return true;
    };
    A.tick = (dt) => {
      if (A._autoDistant && (!grp.visible || SETTINGS.reduceMotion)) return;
      let moving = 0, charge = 0, turn = 0;
      if (A.rout) {
        U.uRoutT.value += dt;
        if (A.routHide && U.uRoutT.value > A.routHide) for (const c of grp.children) c.visible = false;
      } else if (A.tw) {
        const T = A.tw; T.t += dt;
        const k = Math.min(1, T.t / T.secs), e = yose && T.charge ? k * (0.45 + 0.55 * k) : k * k * (3 - 2 * k);
        A.off.lerpVectors(T.from, T.to, e); ctl();
        moving = 1; charge = T.charge ? (yose ? Math.max(0, (k - 0.55) / 0.45) : 1) : 0; turn = T.back ? 1 : 0;
        if (k >= 1) A.tw = null;
      } else if (A.followFn) {
        const t = A.followFn();
        if (t) {
          // 後ろへ付く：隊の真ん中を、相手の後ろ gap m に置く。向きもゆっくり合わせる
          const dh = Math.atan2(Math.sin(t.facing - A.facing), Math.cos(t.facing - A.facing));
          const tx = t.x - Math.sin(t.facing) * A.gap, tz = t.z - Math.cos(t.facing) * A.gap;
          const px = grp.position.x + A.cx, pz = grp.position.z + A.cz;
          const dx = tx - px, dz = tz - pz, dl = Math.hypot(dx, dz);
          const step = Math.min(dl, dt * 2.6);
          if (dl > 0.6) { grp.position.x += dx / dl * step; grp.position.z += dz / dl * step; A.x0 = grp.position.x; moving = 1; }
          if (Math.abs(dh) > 0.05) {
            const r = Math.sign(dh) * Math.min(Math.abs(dh), dt * 0.5);
            A.facing += r; grp.rotation.y += r;
            // 回った分だけ、隊の真ん中がずれないように置き直す
            const c = Math.cos(r), s = Math.sin(r), qx = A.cx, qz = A.cz;
            A.cx = qx * c + qz * s; A.cz = -qx * s + qz * c;
            grp.position.x = px - A.cx; grp.position.z = pz - A.cz; A.x0 = grp.position.x;
            moving = 1;
          }
        }
      }
      // 近づかれて退く（shyTick）：背を向けて行けない側へ下がる。進む・付いて歩くの最中でも、その道ごと横へずらす
      if (A.shyV && !A.rout) {
        const sx = A.shyV.x * dt, sz = A.shyV.z * dt;
        A.off.x += sx; A.off.z += sz;
        if (A.tw) { A.tw.from.x += sx; A.tw.from.z += sz; A.tw.to.x += sx; A.tw.to.z += sz; }
        ctl(); A.shyD = (A.shyD || 0) + Math.hypot(sx, sz);
        moving = 1; charge = 0; turn = A.shyV.turn;
      }
      if (A.fadeK !== undefined && A.fadeK > 0) { A.fadeK = Math.max(0, A.fadeK - dt / 3.5); if (!A.fadeK) { grp.visible = false; A.shyV = null; } }
      // 大軍の上の土埃：歩く・駆ける・崩れる時は足もとから土煙が立ち、止まっていても大勢の足踏みで薄いかすみが漂う（乾いた日だけ）
      A.dustT = (A.dustT ?? Math.random() * 3) - dt;
      if (A.dustT <= 0 && N >= 40 && !(A._autoDistant && SETTINGS.reduceMotion)) {
        const run = charge || A.rout, go = moving || run;
        // 大きな軍勢ほど、止まっていても足踏みの土煙が絶えない
        const big = Math.max(0.4, Math.min(1, 250 / (N + (A.hostD ? N * 0.8 : 0))));
        A.dustT = (run ? 0.35 : go ? 0.8 : 4 + Math.random() * 3) * big;
        const W = this;
        if (!(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5)) {
          const hw = (o.w || 20) * 0.5, hd = (o.d || 10) * 0.5, lx = (Math.random() - 0.5) * 2 * hw, lz = go ? -hd - Math.random() * (A.hostD || hd) : hd - Math.random() * (2 * hd + (A.hostD || 0));
          const c = Math.cos(A.facing), sn = Math.sin(A.facing);
          const rc = Math.cos(grp.rotation.y), rs = Math.sin(grp.rotation.y);
          const x = grp.position.x + A.cx + rc * A.off.x + rs * A.off.z + lx * c + lz * sn;
          const z = grp.position.z + A.cz - rs * A.off.x + rc * A.off.z - lx * sn + lz * c;
          if (!W.inWaterAt(x, z) && grp.visible && W.dustVeil) {
            const dust = W.dustCloud(x, z, !!run || (go && o.kind === 'cavalry'), !!A._autoDistant);
            if (go && !run && dust) {
              const q = dust;
              if (q) { q.s1 *= 1.5; q.a *= 0.7; q.rise *= 0.45; }
            }
            if (!go && dust) { dust.a *= 0.6; dust.s1 *= 1.5; dust.life *= 1.6; }
          }
        }
      }
      // 歩き出し・止まりはなめらかに
      U.uMarch.value += (moving - U.uMarch.value) * Math.min(1, dt * 2.5);
      U.uCharge.value += (charge - U.uCharge.value) * Math.min(1, dt * 1.5);
      U.uTurn.value += (turn - U.uTurn.value) * Math.min(1, dt * 1.8);
    };
    this.armies = this.armies || [];
    this.armies.push(A);
    return grp;
  }

  // 近い隊は本物へ替える。替えられない時も残った列・旗・槍を保つ。
  shyTick(dt, p) {
    this._shyT = (this._shyT || 0) - dt;
    if (this._shyT > 0 || !p) return;
    this._shyT = 0.25;
    const D = this.def || {}, T = this.time || 0;
    if (D.town || D.dojo) return;
    const wakeOn = !D.noWake && T - (this.wakeLive ?? -99) < 1.5;
    for (const A of this.armies || []) {
      A.shyV = null;
      A.unavailable = !wakeOn || !!A.noWake;
      A.nearR = 0;
    }
  }

  // 遠景の大軍が本物の兵の戦う所に重ならないように：本物の兵（pts：{x,z} の並び）の 1.4m 内にいる軽い兵を隠す（大きさ 0）。
  //   本物の兵が離れて 1.5 秒たてば元に戻す。置き換え（take）で隠した兵には触らない。units.js が 0.7 秒ごとに呼ぶ
  yieldArmies(pts, dt) {
    const AR = this.armies;
    if (!AR || !AR.length) return;
    const W = this.yieldWork || (this.yieldWork = { cell: new Map(), spare: [], m4: new THREE.Matrix4(), tp: new THREE.Vector3() });
    const C = 3.4, cell = W.cell, spare = W.spare, m4 = W.m4, tp = W.tp;
    // 地区ごとの兵の入れ物も使い回す。歩くたびに空の地区を貯めない。
    for (const list of cell.values()) { list.length = 0; spare.push(list); }
    cell.clear();
    for (const p of pts) {
      const k = Math.floor(p.x / C) * 100003 + Math.floor(p.z / C);
      let list = cell.get(k);
      if (!list) { list = spare.pop() || []; cell.set(k, list); }
      list.push(p);
    }
    for (const A of AR) {
      const P = A.parts;
      // 崩れた大軍も、本物の兵のそばは隠す（崩れ始めはまだ元の所に立っている）
      if (!P || !P.grp.visible) continue;
      // 追従で回った中心は既に回転済み。ずれだけを回し、中心を二度回さない。
      P.grp.updateWorldMatrix(true, true);
      tp.copy(A.off).applyMatrix4(P.grp.matrixWorld); tp.x += A.cx; tp.z += A.cz;
      const extent = Math.max(80, Math.hypot(A.hw0, A.hd0) + 5);
      let any = false;
      for (const p of pts) if (Math.abs(p.x - tp.x) < extent && Math.abs(p.z - tp.z) < extent) { any = true; break; }
      if (!any && !A.hidN) continue;
      if (!A.base) A.base = P.body.instanceMatrix.array.slice();
      let changed = 0;
      for (let i = 0; i < A.n; i++) {
        if (A.taken[i]) continue;
        m4.fromArray(A.base, i * 16); tp.setFromMatrixPosition(m4).add(A.off); tp.applyMatrix4(P.grp.matrixWorld);
        const hit = this.yieldNear(tp.x, tp.z);
        const h = A.hid[i];
        if (hit) {
          if (h <= 0) {
            A.hid[i] = 1; A.hidN = (A.hidN || 0) + 1; changed++;
            this.yieldMesh(A, P.body, i, i, false); this.yieldMesh(A, P.flags, i, i, false); this.yieldMesh(A, P.shade, i, i, false);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, false); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, false); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, false); }
          } else A.hid[i] = 1;
        } else if (h > 0) {
          // 離れてから 1.5 秒で元へ
          A.hid[i] = h + dt;
          if (A.hid[i] > 2.5) {
            A.hid[i] = 0; A.hidN--; changed++;
            this.yieldMesh(A, P.body, i, i, true); this.yieldMesh(A, P.flags, i, i, true); this.yieldMesh(A, P.shade, i, i, true);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, true); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, true); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, true); }
          }
        }
      }
    }
  }

  yieldNear(x, z) {
    const cell = this.yieldWork.cell, cx = Math.floor(x / 3.4), cz = Math.floor(z / 3.4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = cell.get((cx + i) * 100003 + cz + j);
      if (list) for (const p of list) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < 1.4 * 1.4) return true;
      }
    }
    return false;
  }
  yieldMesh(A, mesh, j, i, show) {
    if (!mesh) return;
    const { m4, tp } = this.yieldWork;
    if (show) m4.fromArray(A.base, i * 16);   // 旗・影・幟・馬も、体と同じ置き場の行列
    else { mesh.getMatrixAt(j, m4); tp.setFromMatrixPosition(m4); m4.makeScale(0, 0, 0).setPosition(tp); }
    mesh.setMatrixAt(j, m4); mesh.instanceMatrix.needsUpdate = true;
  }

  // 本陣の飾り：陣幕（家紋入り）と、大将の後ろに立つ馬印（金の扇）
  honjinDressing(grp, o, facing) {
    const M = o._maku, cf = Math.cos(facing), sf = Math.sin(facing);
    const W = (lx, lz) => [o.x + lx * cf + lz * sf, o.z - lx * sf + lz * cf];
    const cloths = [], wood = [];
    const hw = M.w / 2, hd = M.d / 2, gap = 3;
    const sides = [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, -gap, hd], [gap, hd, hw, hd]];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const [x0, z0] = W(ax + (bx - ax) * t0, az + M.z + (bz - az) * t0), [x1, z1] = W(ax + (bx - ax) * t1, az + M.z + (bz - az) * t1);
        const y0 = this.heightAt(x0, z0), y1 = this.heightAt(x1, z1);
        // 柱の間の布（少したるむ）
        const g = new THREE.PlaneGeometry(1, 1.5, 4, 1);
        const P = g.attributes.position, UV = g.attributes.uv;
        for (let k = 0; k < P.count; k++) {
          const u = P.getX(k) + 0.5, v = P.getY(k);
          const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, y = y0 + (y1 - y0) * u + 1.2 + v - Math.sin(u * Math.PI) * 0.08 * (v + 0.75);
          P.setXYZ(k, x, y, z); UV.setX(k, (i + u) * len / n / 4);
        }
        g.computeVertexNormals(); cloths.push(g);
        const p = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4); p.translate(x0, y0 + 1.1, z0); armyPart(wood, p, 0x3a2c1c, 0);
      }
    }
    const tex = jinmakuTexture(o.mon).clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
    const maku = new THREE.Mesh(mergeGeometries(cloths), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    // 馬印：大将の後ろに高く立てる金の扇
    const [ux, uz] = W(0, M.z - hd - 0.8), uy = this.heightAt(ux, uz);
    const pole = new THREE.CylinderGeometry(0.05, 0.06, 7, 5); pole.translate(ux, uy + 3.5, uz); armyPart(wood, pole, 0x2a2018, 0);
    const fan = new THREE.CircleGeometry(0.9, 10, 0, Math.PI); fan.rotateY(facing); fan.translate(ux, uy + 6.6, uz); armyPart(wood, fan, 0xc9a040, 0);
    armyPart(wood, new THREE.CircleGeometry(0.9, 10, 0, Math.PI).rotateY(facing + Math.PI).translate(ux, uy + 6.6, uz), 0xb89030, 0);
    const wm = new THREE.Mesh(mergeGeometries(wood), new THREE.MeshLambertMaterial({ vertexColors: true }));
    grp.add(maku, wm);
  }

  // 戦の終わりに呼ぶ：遠景の大軍（addDistantArmy・addBacking・armyHost の後詰め）と軽い大軍の合戦（addClash）が
  //   自前で作った形（InstancedMesh）は戦ごとに clone した物で、兵のジオメトリ（units.js・humans.js）のように使い回さない。
  //   disposeしないと戦をまたいで GPU の持ち物が溜まり続け、重い戦の始まり（brief）で固まって見える一因になる
  //   （材質の map（家紋・旗の絵）は flagTexture のキャッシュを使い回すので、ここでは形と材質だけ dispose する）
  dispose() {
    const disposeGrp = (grp) => {
      if (!grp) return;
      grp.traverse((o) => {
        if (o.isInstancedMesh || o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
    };
    for (const A of this.armies || []) disposeGrp(A.mesh);
    for (const C of this.clashes || []) disposeGrp(C.mesh);
    const freed = new Set();
    for (const m of this.lodList || []) {
      const L = m.userData.lod;
      for (const g of [L.lo, L.xlo, L.xxlo]) if (g !== L.hi && !freed.has(g)) { g.dispose(); freed.add(g); }
    }
    this.lodList = [];
    this.armies = []; this.clashes = [];
    if (this.scorches) { this.scene.remove(this.scorches.mesh); disposeGrp(this.scorches.mesh); this.scorches = null; }
  }

  // 後詰め（隊の後ろに続く軽い兵の厚い層）を作る。返す物：{ meshes, depth }（入れ物に足すのは呼ぶ側）
  // o：{ x, z, facing, w, d, count, armor, flagTex, seed, U }
  //   (x, z, facing) は隊の真ん中と向き、w・d は隊の幅と奥行き。U は動き（進む・崩れる）を共にする隊の uniform
  //   奥ほど列の間が開き、横へ少し広がり、霧の色へ沈む。ところどころ備えの切れ目、後ろの列には幟の林
  //   形は後詰め用の軽い形を使い回し、遠いほど数を間引く。カメラの近く（ARMY_NEAR の外 25m まで）は描かない
  armyHost(o) {
    const R = rng(o.seed || 31);
    const F = o.facing || 0, cf = Math.cos(F), sf = Math.sin(F);
    const w = o.w || 20, hd = (o.d || 10) / 2, n = Math.max(1, o.count | 0);
    const depth = Math.max(10, Math.min(42, n / Math.max(6, w * 0.8) * 1.4 + 4));
    const S = [];
    // 前の列から後ろへ：列の間は奥ほど開き（1.1m → 1.8m）、横は奥ほど少し広がる
    let z = -hd - 1.2, row = 0;
    const cuts = [];
    for (let x = -w / 2 + 8 + R() * 8; x < w / 2 - 4; x += 10 + R() * 8) cuts.push(x);   // 備えの切れ目
    while (S.length < n && row < 60) {
      const t = Math.min(1, (-z - hd) / depth);
      const ww = w * (1 + t * 0.25), sx = 1.0 + t * 0.45;
      const cols = Math.max(2, Math.round(ww / sx));
      for (let c = 0; c < cols && S.length < n; c++) {
        const lx = -ww / 2 + (c + 0.5) * ww / cols + (R() - 0.5) * sx * 0.5;
        if (cuts.some((q) => Math.abs(lx / (1 + t * 0.25) - q) < 0.8 + t * 1.2)) continue;
        if (R() < 0.06 + t * 0.12) continue;   // 奥ほどまばらに
        const r = R();
        // 幟は奥ほど多く（後ろの備えの旗の林）。列にそろえず散らす
        const k = r < 0.035 + t * 0.07 ? 4 : r < 0.16 ? 3 : 0;
        S.push({ lx, lz: z + (R() - 0.5) * 0.6, t, k, ex: k === 0 ? 1.2 + R() * 0.45 : 0, helm: k === 3 || R() < 0.1 ? 1 : 0, flag: k === 4 ? 0 : R() < 0.82 ? 1 : 0 });
      }
      z -= 1.1 + t * 0.7; row++;
    }
    const realDepth = -z - hd;
    // 遠くで間引く時にまだらに残るよう混ぜる
    for (let i = S.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [S[i], S[j]] = [S[j], S[i]]; }
    const N = S.length, U = { ...o.U, uRealNear: ARMY_REAL_R, uNear: { value: 0 }, uUnavailable: { value: 0 } };
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const body = new THREE.InstancedMesh(hostGeo(o.armor || 0x2b3140).clone(), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), N);
    const flags = new THREE.InstancedMesh(SASHI_GEO.clone(), armyShader(new THREE.MeshLambertMaterial({ map: o.flagTex, side: THREE.DoubleSide }), U), N);
    const bear = [];
    const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2), host = new Float32Array(N);
    const d = new THREE.Object3D(), col = new THREE.Color();
    S.forEach((q, i) => {
      const x = o.x + q.lx * cf + q.lz * sf, zz = o.z - q.lx * sf + q.lz * cf;
      d.position.set(x, this.heightAt(x, zz), zz);
      d.rotation.set(0, F + (R() - 0.5) * 0.3, 0);
      d.scale.set(0.9 + R() * 0.2, 0.85 + R() * 0.27, 0.9 + R() * 0.2);
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix); flags.setMatrixAt(i, d.matrix);
      // 奥ほど少し色が浅く（遠い者は細部が潰れて灰色がかる）
      soldierTint(col, R).lerp(new THREE.Color(0.92, 0.92, 0.9), q.t * 0.25); body.setColorAt(i, col);
      info.set([R(), q.k, q.helm, q.ex], i * 4); info2.set([q.flag, R()], i * 2); host[i] = 0.12 + 0.88 * q.t;
      if (q.k === 4) bear.push(i);
    });
    const attr = (mesh, idx) => {
      const a = new Float32Array(idx.length * 4), b = new Float32Array(idx.length * 2), h = new Float32Array(idx.length);
      idx.forEach((j, m) => { a.set(info.subarray(j * 4, j * 4 + 4), m * 4); b.set(info2.subarray(j * 2, j * 2 + 2), m * 2); h[m] = host[j]; });
      mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(a, 4));
      mesh.geometry.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(b, 2));
      mesh.geometry.setAttribute('aHost', new THREE.InstancedBufferAttribute(h, 1));
    };
    const all = S.map((_, i) => i);
    attr(body, all); attr(flags, all); this.lodFlag(flags);
    const meshes = [body, flags];
    let banners = null;
    if (bear.length) {
      banners = new THREE.InstancedMesh(BANNER_GEO.clone(), armyShader(new THREE.MeshLambertMaterial({ map: o.flagTex, side: THREE.DoubleSide }), U), bear.length);
      const m4 = new THREE.Matrix4();
      bear.forEach((j, m) => { body.getMatrixAt(j, m4); banners.setMatrixAt(m, m4); });
      attr(banners, bear); this.lodFlag(banners, true); meshes.push(banners);
    }
    // 遠いほど軽く：兵を間引き、背の指物は見通しの内だけ。霧の奥は描かない
    const cx = o.x - sf * (hd + realDepth / 2), cz = o.z - cf * (hd + realDepth / 2), cw = new THREE.Vector3();
    const lodState = { gone: false, keep: 1, flags: false };
    const lod = (mesh, cam) => {
      cw.set(cx, 0, cz).add(mesh.position); if (mesh.parent) cw.applyMatrix4(mesh.parent.matrixWorld);
      const dd = Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z), vis = this.vis || 230;
      const gone = dd > vis * 1.5 + 30 + realDepth / 2;
      lodState.gone = gone;
      lodState.keep = (dd < 90 ? 1 : Math.max(0.35, 1 - (dd - 90) / 280)) * lowKeep(dd, true);
      lodState.flags = !gone && dd < Math.min(SETTINGS.quality === 'low' ? 160 : 230, vis);
      return lodState;
    };
    body.onBeforeRender = (r, sc, cam) => { const l = lod(body, cam); body.count = l.gone ? 0 : Math.ceil(N * l.keep); };
    // 遠い塊は、とても遠い兵の形（一人 160 面ほど）で描く（lodTick。中ほどの形は持たない）
    this.lodTwin(body, o.armor || 0x2b3140, false);
    flags.onBeforeRender = (r, sc, cam) => { const l = lod(flags, cam); flags.count = l.flags ? Math.min(N, Math.ceil(N * l.keep * 2)) : 0; };
    // 低（携帯）でも軽い旗の束を残す。見通しの外は描かない。
    if (banners) { const nb = bear.length; banners.onBeforeRender = (r, sc, cam) => { const l = lod(banners, cam); banners.count = l.gone ? 0 : nb; }; }
    for (const m of meshes) m.computeBoundingSphere();
    return { meshes, depth: realDepth, n: N };
  }

  // 戦う隊の後ろに、同じ旗・同じ並びの軽い兵を続けて置く（戦う兵と遠景の境目を消す）
  // o：{ x, z, facing, flag（家紋の鍵）か flagTex, armor, kind, w, depth, count, gap, seed }
  //   (x, z) は戦う隊の真ん中、facing はその向き。軽い兵はその後ろ gap m（既定 5）から depth m の奥行きで並ぶ
  // 返す物は addDistantArmy と同じ（advance・rout・follow が使える）。
  //   隊に付いて歩かせるには：b.follow(() => g.count ? { ...centerOf(g), facing: g.facing } : null)
  addBacking(o) {
    const w = o.w || 16, depth = o.depth || 10, gap = o.gap ?? 5, f = o.facing || 0;
    const back = gap + depth / 2;
    const grp = this.addDistantArmy({
      x: 0, z: 0, w, d: depth, count: o.count || Math.round(w * depth * 0.8), facing: f, armor: o.armor, flagTex: o.flagTex, flag: o.flag, seed: o.seed || 77, kind: o.kind || 'spear',
    });
    grp.position.set(o.x - Math.sin(f) * back, 0, o.z - Math.cos(f) * back);
    grp.army.x0 = grp.position.x;
    grp.army.gap = back;
    return grp;
  }

  // 軽い大軍の合戦：二つの軽い大軍が一本の前線で向き合い、前の列どうしで槍を叩き合い、押し合う（兵力の数には入れない）
  // o：{ x, z, facing, w, gap, gap0, closeSpeed, seed, A, B, play, smoke, link, killRate, maxDrift, noRout, noWake, nearHide }
  //   (x, z) は前線の真ん中、facing は A の向き（B はその逆を向く）、w は前線の幅、gap は前の列どうしの間（既定 3.4m）
  //   A・B：{ flag か flagTex, armor, count, guns（二列目が鉄砲）, bows（後ろから矢）, flagRate }
  //          team（0 味方・1 敵）・faction（兵の家）を渡すと本物の兵に替えられる。hidden で描かない（柵の内の本物の兵が受ける側など）
  //   gap0：はじめの間（0 ならはじめから組み合っている。go() で寄せ合う）
  //   play(音, 位置, 大きさ)・smoke(x, y, z, fx, fz)：戦の側の音と硝煙（rt.army.play・rt.army.smoke）
  //   link()：本物の兵の前線の場所 { x, z } を返す（その近くの前線は、本物の押し引きに合わせて動く）
  // 返す物（C）：
  //   C.go()                      寄せ合って組み合う
  //   C.push(side, k)             side（'A'|'B'）の側へ押す力を足す（k は 0〜1。0 で戻す）
  //   C.shake(side, v)            side の士気を v 下げる（寝返り・横槍など）
  //   C.rout(side, { from, hideAfter, minFight })   side が崩れて逃げる（from：-1 左の端から・1 右の端から・0 ばらばら。minFight 秒は組み合ってから待つ）
  //   C.cavalry(side, { from, count, flag, armor, delay })   side の騎馬の塊が、相手の横（from の端）へ突っ込む
  //   C.volley(side)・C.arrows(side)   鉄砲の一斉射撃（煙）・矢の雨
  //   C.take(side, x, z, n, r)    (x, z) に近い兵を n 人隠し、その場所・向き・種類を返す（本物の兵に置き換える時に。addDistantArmy の take と同じ形）
  //   C.stat()                    { phase, A: 生きている数, B, mA: 士気, mB, lostA, lostB }
  addClash(o) {
    const R = rng(o.seed || 5);
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    const F = o.facing || 0, cf = Math.cos(F), sf = Math.sin(F);
    const W = o.w || 60, gap = o.gap ?? 3.4;
    const nb = Math.max(1, Math.min(CLASH_NB, Math.round(W / (o.bw || 6))));
    const bwr = W / nb, cols = Math.max(2, Math.round(bwr / 0.95));
    const toW = (lx, lz) => [o.x + lx * cf + lz * sf, o.z - lx * sf + lz * cf];
    const C = { o, nb, cols, t: 0, phase: o.gap0 ? 'wait' : 'fight', app: o.gap0 ? -o.gap0 / 2 : 0, drift: 0, bias: 0, fx: { dust: 0, snd: 1, shout: 4, gun: 5, bow: 7 }, cav: [], later: [], x: o.x, z: o.z, facing: F };
    C.blocks = Array.from({ length: nb }, (_, j) => ({ j, lx: -W / 2 + (j + 0.5) * bwr, f: 0, ph: R() * 6.3, fight: o.gap0 ? 0 : 1, hide: 0 }));
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const grp = new THREE.Group();
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), z3 = new THREE.Vector3(0, 0, 0), yAx = new THREE.Vector3(0, 1, 0);
    const mkAttr = (geo, n) => {
      const g = geo.clone();
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('aClash', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      g.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      return g;
    };
    const setOne = (mesh, i, s, dead) => {
      const g = mesh.geometry;
      g.attributes.aInfo.array.set([s.sd, s.k, s.helm, s.ex], i * 4);
      g.attributes.aInfo2.array.set([dead ? 0 : s.flag, dead ? R() : s.r2], i * 2);
      g.attributes.aClash.array.set([s.j, s.slot, s.row, dead ? 1 : 0], i * 4);
    };
    const place = (mesh, i, x, z, yaw, sc) => {
      p3.set(x, this.heightAt(x, z), z); q4.setFromAxisAngle(yAx, yaw);
      m4.compose(p3, q4, sc || s3); mesh.setMatrixAt(i, m4);
    };
    // 片方の側を作る
    const side = (key, sgn) => {
      const P = o[key] || {};
      const armor = P.armor || 0x2b3140;
      const flagTex = P.flagTex || flagTexture(P.flag || 'tokugawa');
      const rows = Math.max(3, Math.round((P.count || nb * cols * 8) / nb / cols)), per = rows * cols;
      const U = {
        uAT: WIND, uGust: GUST, uIdle: typeof ARMY_IDLE !== 'undefined' ? ARMY_IDLE : { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
        uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
        uBlk: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4()) }, uBlk2: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4(0, 0, cols, 0)) },
        uRealNear: ARMY_REAL_R, uSide: { value: sgn }, uApp: { value: C.app }, uAppM: { value: 0 }, uAppC: { value: 0 }, uNearHide: o.nearHide != null ? { value: o.nearHide } : { value: 0 },
      };
      const S = { key, sgn, P, U, rows, per, n0: per * nb, alive: per * nb, lost: 0, mod: 0, m: 100, routed: false, blk: [], slots: [], near: [], far: [], all: [] };
      for (let j = 0; j < nb; j++) {
        const b = C.blocks[j];
        const perm = Array.from({ length: cols }, (_, c) => c);
        for (let i = cols - 1; i > 0; i--) { const q = Math.floor(R() * (i + 1)); [perm[i], perm[q]] = [perm[q], perm[i]]; }
        const sl = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols && sl.length < per; c++) {
          const last = r === rows - 1;
          let k = 0;
          if (last && c % 4 === 1) k = 4;
          else if (P.guns && r === 1) k = 1;
          else if (P.bows && r === rows - 2) k = 2;
          else if (R() < 0.12) k = 3;
          const lx = b.lx + (c + 0.5 - cols / 2) * (bwr / cols) + (R() - 0.5) * 0.3;
          const lz = -sgn * (gap / 2 + r * CLASH_ROW + (R() - 0.5) * 0.35);
          const s = { j, row: r, slot: r * cols + perm[c], lx, lz, yaw: F + (sgn > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.3, k, sd: R(), r2: R(),
            helm: k === 3 ? 1 : R() < 0.08 ? 1 : 0, ex: k === 0 ? 1.25 + R() * 0.3 : k === 1 && r === 1 ? 1 : 0, flag: k === 4 ? 0 : R() < (P.flagRate ?? 0.8) ? 1 : 0, sc: [0.9 + R() * 0.2, 0.86 + R() * 0.24 + (R() < 0.06 ? 0.06 : 0), 0.9 + R() * 0.2] };
          sl.push(s);
          // 近い形（高精細）は前の2列まで。3列目からは遠い形へ（姉川のように合戦が複数同時に組む戦で三角面が重くなり過ぎないよう）
          (r < 2 ? S.near : S.far).push(s);
        }
        sl.sort((a, c) => a.slot - c.slot);
        S.slots.push(sl);
        S.blk.push({ k: 0, kd: 0, rt: 0, rDelay: -1, n0: sl.length });
      }
      // 遠くで間引く時に後ろの列がまだらに残るよう、後ろの者は混ぜる
      for (let i = S.far.length - 1; i > 0; i--) { const q = Math.floor(R() * (i + 1)); [S.far[i], S.far[q]] = [S.far[q], S.far[i]]; }
      // 画質「低」（携帯）：前の列も混ぜておく（遠くで前の列を間引く時に、塊ごと欠けないように。乱数の並びは変えない）
      if (SETTINGS.quality === 'low') for (let i = S.near.length - 1; i > 0; i--) { const q = (i * 7919 + 13) % (i + 1); [S.near[i], S.near[q]] = [S.near[q], S.near[i]]; }
      S.all = S.near.concat(S.far);
      const matB = clashShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U);
      const lowG = SETTINGS.quality === 'low';   // 低（携帯）は前の列も五角の軽い形
      const bodyN = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'lo' : true), S.near.length), matB, S.near.length);
      const bodyF = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'lo' : false), Math.max(1, S.far.length)), matB, Math.max(1, S.far.length));
      bodyF.count = S.far.length;
      const flags = new THREE.InstancedMesh(mkAttr(SASHI_GEO, S.all.length), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), S.all.length);
      const bear = S.all.filter((s) => s.k === 4);
      const banners = new THREE.InstancedMesh(mkAttr(BANNER_GEO, Math.max(1, bear.length)), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), Math.max(1, bear.length));
      banners.count = bear.length;
      const CAP = o.corpses ?? 360;
      const dead = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, false), CAP), matB, CAP);
      dead.count = 0;
      const col = new THREE.Color();
      const put = (mesh, list, tag) => list.forEach((s, i) => {
        const [x, z] = toW(s.lx, s.lz);
        place(mesh, i, x, z, s.yaw, p3.clone().set(...s.sc));
        setOne(mesh, i, s, false);
        if (tag) { s[tag] = i; s.mesh = mesh; }
      });
      put(bodyN, S.near, 'mi'); put(bodyF, S.far, 'mi');
      for (const [mesh, list] of [[bodyN, S.near], [bodyF, S.far]]) list.forEach((s, i) => { mesh.setColorAt(i, soldierTint(col, R)); });
      S.all.forEach((s, i) => { s.fi = i; });
      put(flags, S.all, null);
      bear.forEach((s) => { s.bi = bear.indexOf(s); });
      put(banners, bear, null);
      for (let i = 0; i < CAP; i++) { dead.setColorAt(i, col.setRGB(0.85, 0.85, 0.85)); }
      S.meshes = { bodyN, bodyF, flags, banners, dead, CAP, nd: 0 };
      grp.add(bodyN, bodyF, flags, banners, dead);
      if (!P.hidden) {
        for (const m of [bodyN, bodyF, dead]) this.lodTwin(m, armor);
        this.lodFlag(flags); this.lodFlag(banners, true);
      }
      for (const m of [bodyN, bodyF, flags, banners, dead]) { m.frustumCulled = false; if (P.hidden) m.visible = false; }
      // 後詰め：組み合う列の後ろに、同じ旗の軽い兵を厚く続ける（前線が押し引きすると一緒に動く。崩れる時は一緒に逃げる）
      if (!P.hidden && o.host !== false) {
        const HU = { uAT: WIND, uGust: GUST, uIdle: U.uIdle, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 }, uHgt: U.uHgt, uHP: U.uHP };
        const back = gap / 2 + rows * CLASH_ROW, fs = F + (sgn > 0 ? 0 : Math.PI);
        const [hx, hz] = toW(0, -sgn * back);
        const h = this.armyHost({ x: hx, z: hz, facing: fs, w: W * 1.05, d: 0, count: typeof P.host === 'number' ? P.host : Math.round(Math.max(60, Math.min(480, (P.count || nb * cols * 8) * 0.7))), armor, flagTex, seed: (o.seed || 5) * 13 + (sgn > 0 ? 1 : 2), U: HU });
        const hg = new THREE.Group();
        hg.add(...h.meshes);
        for (const m of h.meshes) m.frustumCulled = false;
        grp.add(hg);
        S.host = { g: hg, U: HU, fx: Math.sin(fs), fz: Math.cos(fs) };
      }
      return S;
    };
    C.A = side('A', 1); C.B = side('B', -1);
    const sides = [C.A, C.B];
    this.scene.add(grp);
    C.mesh = grp;
    // 遠くほど軽く：後ろの列を間引き、背の指物をやめる。霧の奥は描かない
    const lodState = { gone: false, dd: 0, keep: 1, flags: false };
    let lodFrame = -1, lodCam = null;
    const lod = (r, cam) => {
      if (lodFrame === r.info.render.frame && lodCam === cam) return lodState;
      lodFrame = r.info.render.frame; lodCam = cam;
      const dx = cam.position.x - o.x, dz = cam.position.z - o.z;
      const lx = Math.max(0, Math.abs(dx * cf - dz * sf) - W / 2), lz = Math.max(0, Math.abs(dx * sf + dz * cf) - 12);
      const dd = Math.hypot(lx, lz), vis = this.vis || 230;
      const gone = dd > vis * 1.5 + 30, near0 = Math.min(90, vis * 0.5);
      lodState.gone = gone; lodState.dd = dd;
      lodState.keep = (dd < near0 ? 1 : Math.max(0.3, 1 - (dd - near0) / 220)) * lowKeep(dd);
      lodState.flags = !gone && dd < Math.min(SETTINGS.quality === 'low' ? 160 : 230, vis);
      return lodState;
    };
    for (const S of sides) {
      const M = S.meshes, nF = S.far.length, nA = S.all.length, nN = S.near.length;
      //   低（携帯）：背の指物を描かない遠さでは、前の列も間引く（指物は兵と同じ番号で並ぶので、指物のある内は間引かない）
      M.bodyN.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.bodyN.count = l.gone ? 0 : l.flags || SETTINGS.quality !== 'low' ? nN : Math.ceil(nN * Math.min(1, lowKeep(l.dd) * 1.5)); };
      M.bodyF.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.bodyF.count = l.gone ? 0 : Math.ceil(nF * l.keep); };
      M.flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.flags.count = l.flags ? nN + Math.min(nF, Math.ceil(nF * l.keep * 2)) : 0; };
      const nb0 = M.banners.count;
      M.banners.onBeforeRender = (r, sc, cam) => { M.banners.count = lod(r, cam).gone ? 0 : nb0; };
    }
    const other = (S) => (S === C.A ? C.B : C.A);
    const sideOf = (k) => (k === 'B' ? C.B : C.A);
    // 塊 j の前線の世界の場所
    C.frontAt = (j, dz = 0) => { const b = C.blocks[j]; const [x, z] = toW(b.lx, b.f + dz); return { x, z }; };
    C.blockNear = (x, z) => {
      const dx = x - o.x, dz = z - o.z, lx = dx * cf - dz * sf;
      const j = Math.max(0, Math.min(nb - 1, Math.floor((lx + W / 2) / bwr)));
      const p = C.frontAt(j);
      return { j, d: Math.hypot(p.x - x, p.z - z) };
    };
    // 兵 s の今の世界の場所
    const posOf = (S, s) => {
      const B = S.blk[s.j], kc = B.kd / cols, fr = Math.floor(kc);
      const sh = s.row <= fr ? fr : kc;
      const off = S.sgn * C.blocks[s.j].f + sh * CLASH_ROW + C.app;
      return toW(s.lx, s.lz + S.sgn * off);
    };
    // 一人討たれる：塊の前の列から。倒れ姿を残す
    const kill = (S, j) => {
      const B = S.blk[j];
      if (B.k >= B.n0 - 1 || B.rt > 0) return false;
      const s = S.slots[j][B.k];
      B.k++; S.alive--; S.lost++;
      if (s && !s.taken) {
        const M = S.meshes, i = M.nd % M.CAP;
        const [x, z] = posOf(S, s);
        const fwd = S.sgn * 0.8;
        const [x2, z2] = [x + sf * fwd * (R() - 0.3), z + cf * fwd * (R() - 0.3)];
        place(M.dead, i, x2, z2, R() * 6.28);
        setOne(M.dead, i, s, true);
        M.nd++; M.dead.count = Math.min(M.nd, M.CAP);
        M.dead.instanceMatrix.needsUpdate = true;
        for (const a of ['aInfo', 'aInfo2', 'aClash']) M.dead.geometry.attributes[a].needsUpdate = true;
        if (R() < 0.3) this.puff(x2, z2, 1);
      }
      return true;
    };
    const wetGround = () => this.rainLevel > 0.4 || (this.wetness || 0) > 0.5;
    const play = (k, p, v) => { if (o.play) o.play(k, p, v); };
    C.go = () => { if (C.phase === 'wait') C.phase = 'close'; return C; };
    C.push = (k, v) => { C.bias = (k === 'B' ? -1 : 1) * v; return C; };
    C.shake = (k, v) => { sideOf(k).mod -= v; return C; };
    C.rout = (k, opt = {}) => {
      const S = sideOf(k);
      if (S.routed) return C;
      // minFight：組み合ってからその秒が経つまでは崩れない（寄せてすぐ崩れて、ぶつかり合いが見えないことのないように）
      const left = (opt.minFight || 0) - (C.fightT || 0) + (C.phase === 'fight' ? 0 : -C.app / 2.5);
      if (left > 0) { if (!S.routWait) { S.routWait = true; C.later.push({ t: left, fn: () => { S.routWait = false; C.rout(k, { ...opt, minFight: 0 }); } }); } return C; }
      S.routed = true; S.hideAfter = opt.hideAfter ?? 45; S.routT = 0;
      const from = opt.from ?? 0;
      C.blocks.forEach((b, j) => {
        const B = S.blk[j];
        if (B.rDelay >= 0) return;
        const ord = from > 0 ? nb - 1 - j : from < 0 ? j : R() * nb * 0.5;
        B.rDelay = ord * 0.45 + R() * 1.2;
      });
      C.winner = other(S); C.pursueT = 0;
      play('eshout', { x: o.x, z: o.z }, 2);
      return C;
    };
    // 塊をいくつか崩す（横を突かれた端から）
    const routBlocks = (S, js) => { for (const j of js) { const B = S.blk[j]; if (B.rDelay < 0) B.rDelay = R() * 1.5; } };
    C.volley = (k) => {
      const S = sideOf(k), E = other(S);
      if (S.routed) return C;
      let n = 0;
      for (let j = 0; j < nb; j++) {
        if (R() < 0.35 || S.blk[j].rDelay >= 0) continue;
        const p = C.frontAt(j, -S.sgn * (gap / 2 + CLASH_ROW * 1.2));
        // 煙は三つの塊に一つ（煙の板が重なりすぎて重くならないように）。硝煙の名残はさらに間引く
        if (n++ % 3 === 0) { if (o.smoke) o.smoke(p.x, this.heightAt(p.x, p.z) + 1.4, p.z, sf * S.sgn, cf * S.sgn); else this.gunSmoke(p.x, p.z); }
        if (R() < 0.6) kill(E, j);
      }
      play('volley', { x: o.x, z: o.z }, 1.2);
      return C;
    };
    // 矢の雨：後ろの列から相手の真ん中へ、弧を描いて落ちる
    C.arrows = (k) => {
      const S = sideOf(k), E = other(S);
      if (S.routed) return C;
      const A = this.clashArrows || this.buildClashArrows();
      for (let i = 0; i < 70; i++) {
        const j = Math.floor(R() * nb);
        const a = C.frontAt(j, -S.sgn * (gap / 2 + S.rows * CLASH_ROW * 0.8)), b = C.frontAt(j, S.sgn * (gap / 2 + 3 + R() * E.rows * CLASH_ROW * 0.8));
        const lat = (R() - 0.5) * bwr;
        A.list.push({ x0: a.x + cf * lat, z0: a.z - sf * lat, x1: b.x + cf * lat + (R() - 0.5) * 2, z1: b.z - sf * lat + (R() - 0.5) * 2, t: -R() * 0.8, dur: 2.2 + R() * 0.6, h: 16 + R() * 8 });
      }
      if (A.list.length > A.CAP) A.list.splice(0, A.list.length - A.CAP);
      play('volleyBow', { x: o.x, z: o.z }, 1);
      C.later.push({ t: 2.6, fn: () => { for (let j = 0; j < nb; j++) if (R() < 0.3) kill(E, j); } });
      return C;
    };
    C.cavalry = (k, opt = {}) => {
      const S = sideOf(k), E = other(S);
      const from = opt.from || (R() < 0.5 ? -1 : 1);
      // 相手の横の端から 40m ほど外、相手の列の中ほどの深さから駆ける
      const lz = E.sgn * -1 * (gap / 2 + E.rows * CLASH_ROW * 0.5) + C.drift;
      const lx0 = from * (W / 2 + 42);
      const [x, z] = toW(lx0, lz);
      const [tx, tz] = toW(from * (W / 2 - bwr), lz);
      const face = Math.atan2(tx - x, tz - z);
      const grp2 = this.addDistantArmy({ x, z, w: 12, d: 16, count: opt.count || 70, facing: face, armor: opt.armor || S.P.armor, flagTex: opt.flagTex, flag: opt.flag || S.P.flag, seed: 300 + C.cav.length, kind: 'cavalry' });
      grp2.visible = false;
      const cv = { grp: grp2, from, E, t: -(opt.delay || 0), secs: 9, hit: false, x, z, tx, tz };
      C.cav.push(cv);
      return grp2;
    };
    // 本物の兵に置き換える：(x, z) に近いまだ生きている兵を n 人隠し、その場所・向き・種類を返す
    C.left = (k, x, z, r) => {
      const S = sideOf(k);
      let n = 0;
      for (const s of S.all) {
        if (s.taken || s.slot < S.blk[s.j].k || S.blk[s.j].rt > 0) continue;
        const [px, pz] = posOf(S, s);
        if (Math.hypot(px - x, pz - z) < r) n++;
      }
      return n;
    };
    C.take = (k, x, z, n, r = 1e9) => {
      const S = sideOf(k);
      const cand = [];
      for (const s of S.all) {
        if (s.taken || s.slot < S.blk[s.j].k || S.blk[s.j].rt > 0) continue;
        const [px, pz] = posOf(S, s);
        const d = Math.hypot(px - x, pz - z);
        if (d < r) cand.push({ s, d, x: px, z: pz, yaw: s.yaw, k: s.k });
      }
      cand.sort((a, b) => a.d - b.d);
      const out = cand.slice(0, n);
      const M = S.meshes;
      const hide = (mesh, i) => { mesh.getMatrixAt(i, m4); m4.decompose(p3, q4, s3); m4.compose(p3, q4, z3); mesh.setMatrixAt(i, m4); mesh.instanceMatrix.needsUpdate = true; s3.set(1, 1, 1); };
      for (const c of out) {
        c.s.taken = true; S.alive--;
        hide(c.s.mesh, c.s.mi); hide(M.flags, c.s.fi);
        if (c.s.bi !== undefined) hide(M.banners, c.s.bi);
      }
      C.lastTaken = out.map((c) => c.s);
      return out.map(({ x, z, yaw, k, s }) => ({ x, z, yaw, k, helm: s.helm, flag: s.flag, sx: s.sc[0], sy: s.sc[1], sz: s.sc[2] }));
    };
    // 本物に替えた兵を、軽い兵へ戻す（隠した形を元の置き場に戻す）。list は take で隠した兵、n は戻す数
    C.giveBack = (k, list, n, pos = null, yaw = null) => {
      const S = sideOf(k), M = S.meshes;
      for (const sv of list.slice(0, n)) {
        if (!sv.taken) continue;
        sv.taken = false; S.alive++;
        if (pos) {
          const dx = pos.x - o.x, dz = pos.z - o.z;
          sv.lx = dx * cf - dz * sf;
          const B = S.blk[sv.j], kc = B.kd / cols, fr = Math.floor(kc), sh = sv.row <= fr ? fr : kc;
          sv.lz = dx * sf + dz * cf - S.sgn * (S.sgn * C.blocks[sv.j].f + sh * CLASH_ROW + C.app);
          if (yaw !== null) sv.yaw = yaw;
        }
        const [x, z] = toW(sv.lx, sv.lz), sc = s3.set(...sv.sc);
        place(sv.mesh, sv.mi, x, z, sv.yaw, sc); sv.mesh.instanceMatrix.needsUpdate = true;
        place(M.flags, sv.fi, x, z, sv.yaw, sc); M.flags.instanceMatrix.needsUpdate = true;
        if (sv.bi !== undefined) { place(M.banners, sv.bi, x, z, sv.yaw, sc); M.banners.instanceMatrix.needsUpdate = true; }
      }
    };
    // 新手（あらて）：k の側の後ろから、新しい軍勢が駆けつけて前線に加わる（着けば、その側は士気を取り戻し、しばらく押す）
    //   o.surge = { k: 'B', every: 50, count: 120, flank: 0.3 }：組み合っている間、every 秒ごと。flank の割合で、相手の横の端へ回り込む騎馬
    C.surges = 0;
    // 新手・回り込みの知らせ：本人から 90m 内の時だけ、25 秒に一度まで（同じ知らせを繰り返さない）
    const surgeSay = (k, p, flank) => {
      const rt = o.rt, P = rt && rt.player && rt.player.u;
      if (!P || !rt.bark || Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 90 || (rt.t - (this.surgeSaid || -99)) < 25) return;
      this.surgeSaid = rt.t;
      const foe = sideOf(k).P.team !== 0;
      rt.bark(foe ? (flank ? '敵の騎馬が横へ回り込むぞ！' : '敵の新手じゃ！　まだあれほど来るのか……！') : (flank ? '味方の騎馬が敵の横へ回った！' : '味方の後詰が来たぞ！'), foe);
    };
    C.reinforce = (k, opt = {}) => {
      const S = sideOf(k), E = other(S);
      if (S.routed || C.winner) return C;
      const j = Math.floor(R() * nb);
      const back = -S.sgn * (gap / 2 + S.rows * CLASH_ROW + 34);
      const p0 = C.frontAt(j, back), face = F + (S.sgn > 0 ? 0 : Math.PI);
      const big = (opt.count || 120) > 180;
      const g2 = this.addDistantArmy({ x: p0.x, z: p0.z, w: Math.min(bwr * (big ? 6 : 4), big ? 46 : 30), d: big ? 16 : 10, count: opt.count || 120, facing: face, armor: S.P.armor, flagTex: S.P.flagTex, flag: S.P.flag, seed: 500 + C.surges * 7 + (k === 'B' ? 1 : 0), kind: 'spear' });
      C.surges++;
      g2.advance(28, 11);
      play('toki', p0, 1.6);
      if (big) { play('jindaiko', p0, 1.4); play('tramp', p0, 1.5); }
      C.later.push({ t: 11, fn: () => {
        g2.visible = false;
        S.mod += 18; S.alive = Math.min(S.n0, S.alive + Math.round((opt.gain || opt.count || 120) * 0.4));   // 見た目の数（count）と、戦に足す数（gain）は別
        const old = C.bias; C.push(k, 0.35);
        C.later.push({ t: 16, fn: () => { C.bias = old; } });
        play('eshout', C.frontAt(j), 2);
      } });
      if (o.onSurge) o.onSurge(k, p0); else surgeSay(k, p0, false);
      return C;
    };
    C.stat = () => ({ phase: C.phase, A: C.A.alive, B: C.B.alive, mA: Math.round(C.A.m), mB: Math.round(C.B.m), lostA: C.A.lost, lostB: C.B.lost, drift: +C.drift.toFixed(1), routed: C.A.routed ? 'A' : C.B.routed ? 'B' : '' });
    // 毎こま：寄せ・押し合い・討たれる者・崩れ・音と土煙
    C.tick = (dt, focus) => {
      if (C._autoDistant && (!grp.visible || SETTINGS.reduceMotion)) return;
      C.t += dt;
      const t = C.t;
      for (let i = C.later.length - 1; i >= 0; i--) { const L = C.later[i]; L.t -= dt; if (L.t <= 0) { C.later.splice(i, 1); L.fn(); } }
      if (C.phase === 'close') {
        const sp = Math.max(C.app > -8 ? 3.2 : 1.5, o.closeSpeed || 0);
        C.app = Math.min(0, C.app + sp * dt);
        for (const S of sides) { S.U.uAppM.value = 1; S.U.uAppC.value = C.app > -12 ? 1 : 0; }
        if (C.fx.dust <= 0 && !wetGround()) { C.fx.dust = C._autoDistant ? 3 : 0.25; const j = Math.floor(R() * nb); for (const S of sides) { const p = C.frontAt(j, -S.sgn * (gap / 2 - C.app)); this.dustCloud(p.x, p.z, false, !!C._autoDistant); } }
        if (C.app >= 0) {
          C.phase = 'fight';
          play('eshout', { x: o.x, z: o.z }, 2.2);
          for (let i = 0; i < 3; i++) play('clash', C.frontAt(Math.floor(R() * nb)), 1);
          for (const S of sides) { S.U.uAppM.value = 0; S.U.uAppC.value = 0; }
        }
      }
      C.fx.dust -= dt;
      const fight = C.phase === 'fight';
      if (fight) C.fightT = (C.fightT || 0) + dt;
      // 乱戦の土煙：押し合う前線から、踏み荒らされた土が絶えず舞い上がる（乾いた日。近い前線ほど多く、崩れて追う時は騎馬の土煙も）
      if (fight && !wetGround() && C.fx.dust <= 0) {
        const fd = Math.hypot(o.x - focus.x, o.z - focus.z);
        C.fx.dust = C._autoDistant ? (SETTINGS.quality === 'low' ? 5 : 2.5) : fd < 120 ? 0.22 : fd < 250 ? 0.55 : 1.4;
        const p = C.frontAt(Math.floor(R() * nb), (R() - 0.5) * gap);
        // 川や田の中で組み合う所は、土煙でなく水しぶき（姉川の瀬など）
        if (this.inWaterAt(p.x, p.z)) {
          if (fd < 160) this.spray(p.x + (R() - 0.5) * 3, p.z + (R() - 0.5) * 3, 5);
          // 川の上の水煙の帳：蹴立てた細かな飛沫が低く白く漂い、奥の列を薄く霞ませる（地の靄と同じ板を使い回す）
          const M = this.mistVeil;
          if (M && fd < 100 && R() < 0.3 && M.list.length < M.CAP - 6) M.list.push({ x: p.x + (R() - 0.5) * 6, z: p.z + (R() - 0.5) * 6, t: 0, life: 9 + R() * 7, s0: 4 + R() * 2, s1: 9 + R() * 5, a: 0.05 + R() * 0.025, rise: 0.012, fin: 0.9 });
        } else {
        // 四つに一つは大きな土煙：前線の上に褐色の帳がかかり、奥の列を霞ませる（薄く広く、長く残る）
        const wide = !C.winner && R() < 0.25;
        const dust = this.dustCloud(p.x + (R() - 0.5) * 3, p.z + (R() - 0.5) * 3, wide || (!!C.winner && R() < 0.5), !!C._autoDistant);
        if (wide && dust) { dust.a *= 0.45; dust.s1 *= 1.3; dust.rise *= 0.5; }
        }
      }
      // 士気：生きている割合と、戦の側から与えた揺さぶり
      for (const S of sides) {
        S.m = Math.max(0, Math.min(100, 100 * (S.alive / S.n0 - 0.3) / 0.7 + S.mod));
        if (fight && !S.routed && !o.noRout && S.m <= 0) C.rout(S.key);
      }
      // 押し合いの流れ：強い側が少しずつ押す。戦の側の push でも押す
      const adv = Math.max(-1, Math.min(1, (C.A.m - C.B.m) / 100 + C.bias));
      const maxD = o.maxDrift ?? 10;
      if (fight && !C.winner) C.drift = Math.max(-maxD, Math.min(maxD, C.drift + adv * dt * 0.35));
      // 崩れた後：勝った側が 12 秒ほど追って前へ出る
      if (C.winner) {
        C.pursueT += dt;
        if (C.pursueT < 12) C.drift += C.winner.sgn * dt * 1.3;
      }
      // 本物の兵の前線（その近くの塊はそれに合わせる）
      let linked = false, linkX = 0, linkZ = 0;
      if (o.link) { const p = o.link(); if (p) { const dx = p.x - o.x, dz = p.z - o.z; linked = true; linkX = dx * cf - dz * sf; linkZ = Math.max(-maxD - 4, Math.min(maxD + 4, dx * sf + dz * cf)); } }
      const kr = (o.killRate ?? 0.09) * dt;
      let af = 0;
      for (const b of C.blocks) {
        const j = b.j;
        let tg = C.drift + (fight ? 1.3 * Math.sin(t * 0.42 + b.ph) + 0.6 * Math.sin(t * 1.05 + j * 2.1) : 0);
        // 押し引きの波：ときどき塊ごとに片方がどっと押し込み（3〜5m）、やがて押し返される。隣の塊にも少し伝わる
        if (fight && !C.winner && !o.calm) {
          b.sgT = (b.sgT ?? R() * 8) - dt;
          if (b.sgT <= 0) { b.sgT = 6 + R() * 10; b.sg = (R() < 0.5 + adv * 0.3 ? 1 : -1) * (3 + R() * 2); b.sgL = 3 + R() * 4; }
          if (b.sgL > 0) b.sgL -= dt; else b.sg = (b.sg || 0) * Math.max(0, 1 - dt * 0.4);
          const nb2 = (C.blocks[j - 1] ? C.blocks[j - 1].sg || 0 : 0) + (C.blocks[j + 1] ? C.blocks[j + 1].sg || 0 : 0);
          tg += (b.sg || 0) + nb2 * 0.25;
        }
        if (linked) { const w = Math.exp(-Math.abs(b.lx - linkX) / 26); tg += (linkZ - tg) * w * 0.85; }
        const f0 = b.f;
        b.f += (tg - b.f) * Math.min(1, dt * 0.9);
        af += b.f;
        const v = (b.f - f0) / Math.max(dt, 1e-3);
        const want = fight && !C.winner ? 1 : 0;
        b.fight += (want - b.fight) * Math.min(1, dt * 1.5);
        for (const S of sides) {
          const B = S.blk[j];
          // 崩れ：遅れの秒が過ぎたら、その塊は踵を返して逃げる
          if (B.rDelay >= 0) { B.rDelay -= dt; if (B.rDelay < 0) { B.rDelay = 1e9; B.rt = 0.001; } }
          if (B.rt > 0) B.rt += dt;
          // 討たれる：押されている側ほど多く
          if (fight && !C.winner && b.fight > 0.5) {
            const lose = 1 - adv * S.sgn * 0.7 - (v * S.sgn < -0.3 ? -0.3 : 0);
            if (R() < kr * Math.max(0.2, lose) && (S.alive / S.n0 > 0.35 || S.routed)) kill(S, j);
          }
          B.kd += (B.k - B.kd) * Math.min(1, dt * 1.2);
          const U = S.U;
          // 入り混じる強さ：組み合っている間はいつも少し、押し込んだ塊ほど深く（o.mix で戦ごとに変えられる。0 で今までどおり）
          const mixW = (o.mix ?? 1) * b.fight * (0.45 + Math.min(0.55, Math.abs(b.sg || 0) * 0.12));
          U.uBlk.value[j].set(b.f, S.routed || B.rt > 0 ? 0 : mixW, B.kd, B.rt);
          const mv = C.winner === S && C.pursueT < 12 ? 1 : Math.min(1, Math.abs(v) * 0.8);
          U.uBlk2.value[j].set(S.routed || B.rt > 0 ? 0 : b.fight, mv, cols, b.hide);
        }
      }
      for (const S of sides) {
        S.U.uApp.value = C.app;
        if (S.routed) {
          S.routT += dt;
          if (S.routT > S.hideAfter) for (const k of ['bodyN', 'bodyF', 'flags', 'banners']) S.meshes[k].visible = false;
        }
        // 後詰め：前線の押し引き（塊のずれの平均）と寄せ合いに付いて動く。崩れたら一緒に逃げる
        const H = S.host;
        if (H) {
          const k = C.app + S.sgn * af / nb;
          H.g.position.set(H.fx * k, 0, H.fz * k);
          H.U.uMarch.value = Math.max(S.U.uAppM.value, C.winner === S && C.pursueT < 12 ? 1 : 0);
          if (S.routed) {
            H.U.uRout.value = 1; H.U.uRoutT.value += dt;
            if (S.routT > S.hideAfter) H.g.visible = false;
          }
        }
      }
      // 騎馬の横槍：駆けて、着いたら相手の端の塊を崩す
      for (const cv of C.cav) {
        if (cv.t < 0) { cv.t += dt; if (cv.t >= 0) { cv.grp.visible = true; cv.grp.advance(Math.hypot(cv.tx - cv.x, cv.tz - cv.z), cv.secs, { charge: true }); play('gallop', { x: cv.x, z: cv.z }, 1.5); } continue; }
        cv.t += dt;
        if (!cv.hit && !wetGround() && R() < dt * 4) { const k = Math.min(1, cv.t / cv.secs); this.dustCloud(cv.x + (cv.tx - cv.x) * k, cv.z + (cv.tz - cv.z) * k, true); }
        if (!cv.hit && cv.t > cv.secs * 0.9) {
          cv.hit = true;
          const tgt = cv.E;
          const js = cv.from > 0 ? [nb - 1, nb - 2, nb - 3] : [0, 1, 2];
          for (const jj of js) if (jj >= 0 && jj < nb) { for (let q = 0; q < 6; q++) kill(tgt, jj); }
          tgt.mod -= 25;
          routBlocks(tgt, js.filter((jj) => jj >= 0 && jj < nb).slice(0, 2));
          play('eshout', { x: cv.tx, z: cv.tz }, 2);
        }
      }
      if (!fight) return;
      // 新手と、横へ回り込む騎馬（o.surge）
      if (o.surge && !C.winner) {
        const Su = o.surge;
        // 小出しにせず、間を空けて大きな塊でどっと来る（every は 1.5 倍の間、数は 1.8 倍。数は軽い兵で、近くは本物に替わる）
        C.fx.surge = (C.fx.surge ?? (Su.first ?? Su.every * 0.9)) - dt;
        if (C.fx.surge <= 0) {
          C.fx.surge = Su.every * 1.5 * (0.85 + R() * 0.3);
          if (R() < Math.min(0.6, (Su.flank ?? 0.3) * 1.5) && C.cav.length < 3) { C.cavalry(Su.k, { count: 100, delay: 0 }); if (o.onSurge) o.onSurge(Su.k, null, 'flank'); else surgeSay(Su.k, { x: o.x, z: o.z }, true); }
          else C.reinforce(Su.k, { count: Math.round((Su.count || 120) * 1.8), gain: (Su.count || 120) * 1.2 });   // 間が 1.5 倍なので、足す数は 1.2 倍（押しの強さはほぼ元のまま）
        }
      }
      // 音：槍の打ち合う音と遠い喚き、ときどき鬨の声。鉄砲・弓の側は時々撃つ
      C.fx.snd -= dt; C.fx.shout -= dt; C.fx.gun -= dt; C.fx.bow -= dt;
      if (C.fx.snd <= 0) { C.fx.snd = 0.9 + R() * 1.6; const p = C.frontAt(Math.floor(R() * nb)); play(R() < 0.5 ? 'clash' : 'far', p, 0.9); if (R() < 0.3) play('umeki', p, 0.6); }
      if (C.fx.shout <= 0) { C.fx.shout = 9 + R() * 8; play(R() < 0.5 ? 'eshout' : 'toki', C.frontAt(Math.floor(R() * nb)), 1.4); }
      if (C.fx.dust <= 0 && !wetGround()) { C.fx.dust = C._autoDistant ? 3 : 0.5; const p = C.frontAt(Math.floor(R() * nb)); this.dustCloud(p.x, p.z, false, !!C._autoDistant); }
      if (C.fx.gun <= 0) { C.fx.gun = 7 + R() * 6; for (const S of sides) if (S.P.guns && !S.routed && !C.winner) C.volley(S.key); }
      if (C.fx.bow <= 0) { C.fx.bow = 10 + R() * 6; for (const S of sides) if (S.P.bows && !S.routed && !C.winner) C.arrows(S.key); }
      C.fx.wake = (C.fx.wake || 0) - dt;
      if (C.fx.wake <= 0) { C.fx.wake = 0.3; wakeTick(); }
    };
    // 本物の兵に替える（b_nagashinojo の wake と同じ決まり：take で軽い兵を隠してその場に本物を立てる・g.guard・戦う兵は250人まで）
    // 合戦では、プレイヤーが前線の60m以内に寄った所の両方の側を替え、本物どうしで斬り合わせる。軽い側が崩れたら、替えた兵も崩れる
    // o.rt（戦）と、A・B の team（0 味方・1 敵）・faction（兵の家）を渡した時だけ
    const WAKE_TYPE = ['ashigaru', 'gun', 'bow', 'samurai', 'ashigaru', 'cavalry', 'samurai'];
    C.woke = [];
    C.wakeEnabled = !!o.rt && !o.noWake && sides.every((S) => S.P.team !== undefined);
    C.nearKey = 'clash' + Math.random().toString(36).slice(2, 7);
    const wakeTick = () => {
      const rt = o.rt;
      for (const q of C.woke) for (const g of q.groups) if (g.count && !g.routed && g.clashSide.routed) { g.noRout = false; g.morale = 0; }
      if (!rt || rt.over || o.noWake || (rt.def && rt.def.noWake)) return;
      const P = rt.player && rt.player.u;
      if (!P || !P.alive) return;
      // 戻す判断は控えと共通。近くで勝った兵も、60m以内では本物のまま残す。
      for (let i = C.woke.length - 1; i >= 0; i--) {
        if (!C.woke[i].groups.some((g) => g.count)) C.woke.splice(i, 1);
      }
      // 勝ち負けが決まった合戦では、新しくは替えない（残った兵は上の決まりで軽い兵の列へ戻る）
      if (C.winner) return;
      // 既に替えた所も、60m以内に軽い兵が残れば続けて替える。
      const R0 = Math.max(60, o.wakeR || 0);
      if (!sides.some((S) => C.left(S.key, P.pos.x, P.pos.z, R0))) return;
      const at = C.frontAt(C.blockNear(P.pos.x, P.pos.z).j);
      let alive = 0;
      for (const u of rt.army.units) if (u.alive) alive++;
      const room = Math.min(250, rt.def.wakeRoom ?? 250, o.room ?? 250);
      if (room - alive < 20 && this.recycleNear) alive -= this.recycleNear(20 - (room - alive));
      const n = Math.max(0, Math.min(10, Math.floor((room - alive) / 2)));
      // 近くの軽い兵は本人を中心とする除外輪で隠す。
      nearHideRequest(C.nearKey, 0);
      if (n < 3) return;
      const q = { x: at.x, z: at.z, groups: [], taken: {} };
      for (const S of sides) {
        if (S.P.team === undefined) continue;
        // 自分の持ち場では、味方は控えめに・敵は多めに本物へ替える（o.allyWake・o.foeWake。既定 1＝これまでどおり）
        const bias = S.P.team === P.team ? (o.allyWake ?? 1) : (o.foeWake ?? 1);
        const nSide = Math.max(0, Math.min(Math.round(n * bias), room - alive));
        if (nSide < 2) continue;
        const pts = C.take(S.key, P.pos.x, P.pos.z, nSide, R0);
        q.taken[S.key] = C.lastTaken;
        if (!pts.length) continue;
        let x = 0, z = 0;
        for (const p of pts) { x += p.x; z += p.z; }
        x /= pts.length; z /= pts.length;
        const face = F + (S.sgn > 0 ? 0 : Math.PI);
        const g = rt.army.addGroup({ team: S.P.team, faction: S.P.faction || (S.P.team === 0 ? 'tokugawa' : 'saito'), name: '備の兵', order: 'attack', formation: 'line', anchor: { x, z }, facing: face, noGuard: true,
          width: Math.max(4, Math.min(12, pts.length * 1.1)), aggro: 12, seekRange: 22, morale: 80, speed: 2.6, fleeDir: { x: -Math.sin(face), z: -Math.cos(face) } });
        const mon = S.P.flag || S.P.flagTex?.userData.mon;
        rt.army.spawn(g, pts.map((p) => ({ type: WAKE_TYPE[p.k] || 'ashigaru', n: 1, o: {
          x: p.x, z: p.z, heading: p.yaw, armor: S.P.armor, hat: p.helm ? 'kabuto' : 'jingasa', flag: p.flag ? mon : null,
          ...(p.k === 4 && mon ? { standard: mon, flag: null, weapon: 'none', dmg: 0 } : {}),
        } })));
        g.leader = g.units.find((u) => u.type === 'samurai') || null;
        g.guard = true; g.clashSide = S; g.recyclable = true; alive += g.count;
        g.units.forEach((u, i) => { u.wkClash = { C, key: S.key, s: q.taken[S.key][i] }; if (!rt.def.wakeFullSize) u.mesh.scale.set(pts[i].sx, pts[i].sy, pts[i].sz); });
        q.groups.push(g);
      }
      if (q.groups.length) { C.woke.push(q); play('eshout', at, 1.2); }
    };
    this.clashes = this.clashes || [];
    this.clashes.push(C);
    return C;
  }
  // 本物の兵の遠い者を、軽い兵の形でまとめて描く（units.js の Army.updateImpostors が使う）
  // 甲冑の色と旗ごとに一つ。一人ずつの形の代わりに、胴・旗の二度の描画で何十人も描ける
  // 返す物：{ put(i, x, z, yaw, k, helm, ex, flag, sd), commit(n), dispose() }（k は軽い兵の種類：0 槍 1 鉄砲 2 弓 3 侍）
  makeImpostor(armor, flag, cap = 160, far = false) {
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const U = {
      uNear: { value: 0 }, uRealNear: { value: 0 },
      uAT: WIND, uGust: GUST, uIdle: ARMY_IDLE, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
      uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
    };
    const mk = (geo) => {
      const g = geo.clone();
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      return g;
    };
    // 画質「低」（携帯）：まとめて描く遠い兵は、角の少ない遠い形（一人 1100 面 → 300 面ほど。低では 12m より先の兵だけ。far：18m より先の兵の束は、さらに軽い形）
    const body = new THREE.InstancedMesh(mk(soldierGeo(armor, far ? 'xlo' : SETTINGS.quality === 'low' ? 'lo' : true)), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), cap);
    const flags = new THREE.InstancedMesh(mk(SASHI_GEO), armyShader(new THREE.MeshLambertMaterial({ map: flagTexture(flag || 'tokugawa'), side: THREE.DoubleSide }), U), cap);
    const meshes = [body, flags];
    for (const m of meshes) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    const col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < cap; i++) body.setColorAt(i, col);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), yAx = new THREE.Vector3(0, 1, 0);
    const A = body.geometry.attributes, B = flags.geometry.attributes;
    // 描く直前のカメラを知らせる（写真モードなどで、兵の更新なしにカメラが動いた時に、まとめ直してもらう）
    const R = { onCam: null };
    body.onBeforeRender = (r, sc, cam) => { if (R.onCam) R.onCam(cam.position); };
    return Object.assign(R, {
      cap,
      put: (i, x, z, yaw, k, helm, ex, fl, sd) => {
        if (i >= cap) return;
        p.set(x, this.heightAt(x, z), z); q.setFromAxisAngle(yAx, yaw); m4.compose(p, q, sc);
        body.setMatrixAt(i, m4); flags.setMatrixAt(i, m4);
        const at = i * 4;
        A.aInfo.array[at] = B.aInfo.array[at] = sd;
        A.aInfo.array[at + 1] = B.aInfo.array[at + 1] = k;
        A.aInfo.array[at + 2] = B.aInfo.array[at + 2] = helm;
        A.aInfo.array[at + 3] = B.aInfo.array[at + 3] = ex;
        A.aInfo2.array[i * 2] = B.aInfo2.array[i * 2] = fl; A.aInfo2.array[i * 2 + 1] = B.aInfo2.array[i * 2 + 1] = sd;
      },
      commit: (n) => {
        n = Math.min(n, cap);
        body.count = flags.count = n;
        if (!n) return;
        for (const m of meshes) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aInfo.needsUpdate = true; m.geometry.attributes.aInfo2.needsUpdate = true; }
      },
      dispose: () => { this.scene.remove(body, flags); },
    });
  }
  // 合戦の矢（細い棒を弧に沿って飛ばす。落ちたら少しの間地面に刺さったまま）
  buildClashArrows() {
    const CAP = 280;
    const g = new THREE.BoxGeometry(0.025, 0.025, 0.9);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x2e241a }), CAP);
    mesh.count = 0; mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.clashArrows = { mesh, list: [], CAP };
    return this.clashArrows;
  }
  updateClashArrows(dt) {
    const A = this.clashArrows;
    if (!A) return;
    const m4 = _caM4, q = _caQ, p = _caP, d = _caD, s = _caS, zf = _caZ;
    let n = 0;
    for (let i = A.list.length - 1; i >= 0; i--) {
      const a = A.list[i];
      a.t += dt;
      if (a.t > a.dur + 6) { A.list.splice(i, 1); continue; }
    }
    for (const a of A.list) {
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      const x = a.x0 + (a.x1 - a.x0) * k, z = a.z0 + (a.z1 - a.z0) * k;
      const y0 = this.heightAt(a.x0, a.z0) + 2, y1 = this.heightAt(a.x1, a.z1) + 0.25;
      const y = y0 + (y1 - y0) * k + a.h * 4 * k * (1 - k);
      d.set(a.x1 - a.x0, (y1 - y0) + a.h * 4 * (1 - 2 * Math.min(k, 0.98)), a.z1 - a.z0).normalize();
      if (k >= 1) d.set((a.x1 - a.x0) * 0.3, -1, (a.z1 - a.z0) * 0.3).normalize();
      q.setFromUnitVectors(zf, d);
      p.set(x, y, z);
      m4.compose(p, q, s);
      A.mesh.setMatrixAt(n++, m4);
      if (n >= A.CAP) break;
    }
    A.mesh.count = n;
    if (n) A.mesh.instanceMatrix.needsUpdate = true;
  }

  // 焼け跡は戦が終わるまで残す。形・材質は一組、最大512か所を一度に描く。
  addScorch(x, z, w = 4, d = w, rot = 0) {
    if (!this.scorches) {
      if (!this.puffTex) this.makePuffTex();
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: this.puffTex, color: 0x100d0b, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.InstancedMesh(geo, mat, 512);
      mesh.count = 0; mesh.frustumCulled = false; this.scene.add(mesh);
      this.scorches = { mesh, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0) };
    }
    const C = this.scorches;
    if (C.mesh.count >= 512) return;
    C.p.set(x, this.heightAt(x, z) + 0.045, z);
    C.q.setFromAxisAngle(C.axis, rot); C.s.set(Math.max(1, w) * 1.35, 1, Math.max(1, d) * 1.35);
    C.mesh.setMatrixAt(C.mesh.count++, C.m.compose(C.p, C.q, C.s));
    C.mesh.instanceMatrix.needsUpdate = true;
  }

  // 火を消す（addFire の返り値を渡す）
  // 燃える建物（焼き討ち・炎上の共通の作り）：屋根の棟に沿って大きな炎を二〜三つ、上に太い煙の柱。
  // x, z は建物の真ん中、o.w・o.d は幅と奥行き、o.h は屋根の高さ、o.rot は向き。返す物の stop() で火を消す（焼け跡は戦の側で）
  // 炎の数と光の数は addFire の決まり（光は近い数個だけ）に従うので、何棟燃やしても重さは増えにくい
  addBlaze(x, z, o = {}) {
    const w = o.w || 8, d = o.d || 6, h = o.h ?? 4, rot = o.rot || 0;
    const n = Math.max(1, Math.min(3, o.n || Math.round(w / 5)));
    const ca = Math.cos(rot), sa = Math.sin(rot), long = w >= d ? w : d, ax = w >= d ? [ca, -sa] : [sa, ca];
    const size = o.size || Math.min(4, 2.2 + Math.sqrt(w * d) * 0.12);
    const fires = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * long * 0.6;
      const fx = x + ax[0] * t, fz = z + ax[1] * t;
      fires.push(this.addFire(fx, fz, { size: size * (i === 1 ? 1 : 0.85), h: Math.max(0.2, h * 0.75 - size * 0.35) }));
    }
    const smoke = this.addSmokeColumn(x, this.heightAt(x, z) + h + size, z, { size: Math.min(4, size * 1.1) });
    return { fires, smoke, stop: () => { for (const f of fires) this.removeFire(f); this.removeSmokeColumn(smoke); fires.length = 0; } };
  }

  removeFire(f) {
    if (!f) return;
    this.scene.remove(f.flame, f.inner);
    if (f.glow) this.scene.remove(f.glow);
    if (f.light) { const pl = (this.firePool || []).find((q) => q.L === f.light); if (pl) { pl.f = null; pl.L.intensity = 0; } else this.scene.remove(f.light); f.light = null; }
    this.removeSmokeColumn(f.smoke);
    this.fires = this.fires.filter((q) => q !== f);
  }

  // 火の粉：近くの火から、ときどき小さな光の粒が舞い上がって消える
  buildEmbers() {
    const N = 260;
    const pos = new Float32Array(N * 3).fill(-999), life = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float life; varying float vA; void main(){ vA = clamp(life, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 26.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * a, a); }',
    });
    this.embers = { pts: new THREE.Points(geo, mat), pos, life, vel: new Float32Array(N * 3), i: 0, N };
    this.embers.pts.frustumCulled = false;
    this.scene.add(this.embers.pts);
  }
  updateEmbers(dt, focus) {
    if (!this.fires.length) return;
    if (!this.embers) {
      let lit = false;
      for (const f of this.fires) if (f.lit) { lit = true; break; }
      if (!lit) return;
      this.buildEmbers();
    }
    const E = this.embers;
    for (const f of this.fires) {
      if (!f.lit || Math.hypot(f.x - focus.x, f.z - focus.z) > 60) continue;
      // 大きな火ほど多く、広い所から、高く舞い上がる（燃える堂は時々ぱっと吹き上がる）
      let n = dt * (f.torch ? 1.2 : 3.5 * Math.max(1, f.size * f.size * 0.45));
      if (f.big && Math.random() < dt * 0.25) n += 8;
      for (; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const i = E.i = (E.i + 1) % E.N, sp = f.size * 0.25;
        E.pos[i * 3] = f.x + (Math.random() - 0.5) * sp; E.pos[i * 3 + 1] = f.base + f.size * 0.3; E.pos[i * 3 + 2] = f.z + (Math.random() - 0.5) * sp;
        E.vel[i * 3] = (Math.random() - 0.5) * 0.8; E.vel[i * 3 + 1] = (1.2 + Math.random() * 1.5) * Math.min(2.2, 0.8 + f.size * 0.3); E.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
        E.life[i] = 1 + Math.random() * (f.big ? 2.4 : 1.2);
      }
    }
    const wx = WIND_STATE.dirX * WIND_STATE.gust * 0.8, wz = WIND_STATE.dirZ * WIND_STATE.gust * 0.8;
    for (let i = 0; i < E.N; i++) {
      if (E.life[i] <= 0) continue;
      E.life[i] -= dt;
      if (E.life[i] <= 0) { E.pos[i * 3 + 1] = -999; continue; }
      E.pos[i * 3] += (E.vel[i * 3] + wx + Math.sin(this.time * 7 + i) * 0.3) * dt;
      E.pos[i * 3 + 1] += E.vel[i * 3 + 1] * dt;
      E.pos[i * 3 + 2] += (E.vel[i * 3 + 2] + wz) * dt;
    }
    E.pts.geometry.attributes.position.needsUpdate = true; E.pts.geometry.attributes.life.needsUpdate = true;
  }

  // 焚き火・篝火（炎が揺れる。篝火は夕暮れに灯りをともす）
  addFire(x, z, o = {}) {
    const y = this.heightAt(x, z) + (o.h || 0.15);
    // 炎：揺らぎで舌のように動く板（flameMat）。外の大きな炎と、少しずらした小さな炎の二枚。大きな火（燃える建物）は脇にもう二枚
    const fm = flameMat();
    const mk = (parent) => { const m = new THREE.Mesh(FLAME_GEO, fm); m.frustumCulled = false; m.renderOrder = 2; (parent || this.scene).add(m); return m; };
    // o.size：燃える建物などの大きな火（炎を大きく、煙の柱を太く高く）
    const size = o.size || (o.torch ? 0.7 : 1.3);
    const outer = mk(), inner = mk();
    const base = y + size * (o.torch ? 0.3 : 0.35);
    outer.position.set(x, base, z); inner.position.set(x, base - size * 0.08, z);
    outer.scale.set(size * 0.95, size * 1.3, 1); inner.scale.set(size * 0.6, size * 0.85, 1);
    if ((o.size || 0) >= 2) for (const s2 of [-1, 1]) { const e = mk(outer); e.position.set(s2 * 0.36, -0.12, s2 * 0.15); e.scale.set(0.62, 0.7, 1); }
    // 足もとの照り返し：火の周りの地面がほのかに赤い（夕暮れと雨の中で強く）
    if (!this.puffTex) this.makePuffTex();
    if (!this.glowGeo) { this.glowGeo = new THREE.PlaneGeometry(1, 1); this.glowGeo.rotateX(-Math.PI / 2); }
    const glow = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ map: this.puffTex, color: 0xff7a30, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    glow.scale.setScalar(o.torch ? 5 : 7 * Math.max(1, size / 1.3));
    glow.position.set(x, this.heightAt(x, z) + 0.06, z);
    glow.renderOrder = 1;
    this.scene.add(glow);
    const f = { flame: outer, inner, glow, base, size, x, z, seed: Math.random() * 10, torch: !!o.torch, nightOnly: !!o.nightOnly };
    // 炎の上に細い煙が昇り、風下へ流れる
    // 篝火・炊ぎの煙は高く（16m ほど）上げ、遠くからでも陣の場所が分かるように
    if (!o.nightOnly) f.smoke = this.addSmokeColumn(x, base + size * 0.5, z, { size: o.torch ? 0.35 : o.size ? Math.min(4, o.size * 0.9) : 1.0 });
    // 大きな火（燃える建物）も、揺らめく点の光で周りの地面と人を照らす（光の数は全部で 4 つまで。数を絞って重くしない）
    const big = (o.size || 0) >= 2;
    // 光は近い数個だけ（update の assignFireLights が決まった数の光を近い火へ付け替える）
    f.big = big; f.lit = !o.nightOnly || this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    if (o.nightOnly) outer.visible = inner.visible = glow.visible = f.lit;
    f.ly = base - this.heightAt(x, z) + (big ? size * 0.3 : 0.25);
    this.fires.push(f);
    return f;
  }


  // 地面：草・踏み固めた土・泥・岩肌を場所ごとに混ぜる（頂点に混ぜる割合を持たせ、絵は世界の座標で貼る）
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(this.half * 2, this.half * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const splat = new Float32Array(pos.count * 3);
    const water = new Float32Array(pos.count);
    const c = new THREE.Color();
    const R = rng(7);
    const paths = this.def.paths || [];
    const muddy = this.def.muddy ?? 0.35;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
      const h = this.grid[j * (SEG + 1) + i];
      pos.setY(k, h);
      const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + (R() - 0.5) * 0.35;
      c.setRGB(0.26 + n * 0.05, 0.33 + n * 0.06, 0.17 + n * 0.03);
      let pd = Infinity;
      for (const p of paths) pd = Math.min(pd, distToPolyline(x, z, p) * 2 / (p.w ?? this.def.pathWidth ?? 2));
      if (pd < 2) c.setRGB(0.36 + n * 0.04, 0.30 + n * 0.03, 0.21);
      else if (pd < 3) c.lerp(new THREE.Color(0.34, 0.31, 0.21), 0.5);
      if (this.def.tint) this.def.tint(x, z, h, c);
      // 色から、草・土・泥の割合を読む（緑が勝つほど草）
      let grass = Math.max(0, Math.min(1, (c.g - (c.r + c.b) / 2 - 0.02) / 0.08));
      // 道の縁は草がまばらに残る
      if (pd >= 1.4 && pd < 3) grass = Math.max(grass, Math.min(1, (pd - 1.4) / 1.6) * (0.6 + R() * 0.4));
      let dirt = 1 - grass;
      // 泥：道の真ん中と、低い所の水はけの悪い所
      const wetSpot = Math.max(0, Math.sin(x * 0.09 + 1.3) * Math.cos(z * 0.11) - 0.55) * 2.2;
      let mud = Math.min(1, (pd < 1.8 ? 0.8 : 0) * muddy + wetSpot * muddy * (dirt > 0.5 ? 1 : 0.5));
      dirt *= 1 - mud * 0.8; grass *= 1 - mud * 0.6;
      // 小川の岸は泥と土
      for (const st of this.def.streams || []) { const d = distToPolyline(x, z, st.pts); if (d < st.w * 1.8) { const b = 1 - d / (st.w * 1.8); mud = Math.max(mud, b * 0.8); grass *= 1 - b; } }
      const t = grass + dirt + mud || 1;
      splat[k * 3] = grass / t; splat[k * 3 + 1] = dirt / t; splat[k * 3 + 2] = mud / t;
      // 水を張った田
      water[k] = this.field.wet && this.def.paddy ? this.def.paddy(x, z) : 0;
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
    this.splat = splat; this.waterW = water;
    geo.setAttribute('water', new THREE.BufferAttribute(water, 1));
    geo.computeVertexNormals();
    const mat = liteMat({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.55 });
    mat.customProgramCacheKey = () => `ground|${this.half}`;
    this.groundU = { tGrass: { value: grassTex() }, tDirt: { value: dirtTex() }, tMud: { value: mudTex() }, tStone: { value: stoneTex() }, tMacro: { value: macroTex() }, uWet: { value: 0 }, uForest: { value: this.def.slopeForest ?? 0 }, uNight: this.nightU, uSoilRain: { value: 0 }, tWear: WEAR, uTime: { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } }, uSoilSky: { value: this.hemi.color } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.groundU);
      sh.vertexShader = 'attribute vec3 splat;\nattribute float water;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWater = water;\n vSplat = splat;\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D tGrass, tDirt, tMud, tStone, tMacro, tWear;\nuniform float uWet, uTime, uSoilRain, uNight, uForest;\nuniform vec3 uSoilSky;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 wuv = vWP.xz;
          float macro = texture2D(tMacro, wuv * 0.006).r;
          float macro2 = texture2D(tMacro, wuv * 0.023 + 0.37).r;
          // 同じ絵の繰り返しが見えないよう、向きと縮尺を変えたもう一枚を、大きな斑に合わせて混ぜる
          vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * wuv;
          float mixK = smoothstep(0.35, 0.65, macro2);
          vec3 grass = mix(texture2D(tGrass, wuv * 0.21).rgb, texture2D(tGrass, ruv * 0.13 + 0.31).rgb, mixK * 0.7) * mix(0.8, 1.2, texture2D(tGrass, wuv * 0.037).g * 1.6);
          grass = mix(grass, grass * vec3(1.12, 1.02, 0.8), smoothstep(0.55, 0.8, macro2));   // 枯れ色の斑
          vec3 dirt = mix(texture2D(tDirt, wuv * 0.23).rgb, texture2D(tDirt, ruv * 0.11 + 0.57).rgb, mixK * 0.6) * mix(0.85, 1.12, macro2);
          // 足もとは細かく：近くだけ、もっと細かな縮尺の絵を重ねて、ぼやけた地面にしない
          float nearK = 1.0 - smoothstep(4.0, 14.0, length(vWP - cameraPosition));
          if (nearK > 0.0) {
            // 細かな絵の明るさを、その絵のならした明るさで割って（平均が 1 になる濃淡だけを掛ける）
            float gf = dot(texture2D(tGrass, ruv * 0.9).rgb, vec3(1.0)) / max(dot(texture2D(tGrass, ruv * 0.9, 9.0).rgb, vec3(1.0)), 1e-3);
            float df = dot(texture2D(tDirt, ruv * 0.85).rgb, vec3(1.0)) / max(dot(texture2D(tDirt, ruv * 0.85, 9.0).rgb, vec3(1.0)), 1e-3);
            grass *= mix(1.0, clamp(gf, 0.4, 1.8), nearK * 0.5);
            dirt *= mix(1.0, clamp(df, 0.4, 1.8), nearK * 0.55);
          }
          vec3 mud = texture2D(tMud, wuv * 0.26).rgb;
          vec3 stone = texture2D(tStone, wuv * 0.12).rgb;
          // 崖・切岸の岩肌：真上から貼った絵は立った面で縦に伸びて「灰色の板」に見えるので、立った面は横から貼る。
          // 地層の横筋と、割れ目の暗がり・苔の斑を足す（全画質で効く。絵の読みは三回だけ）
          {
            vec3 an = abs(vWN);
            float side = smoothstep(0.35, 0.75, 1.0 - an.y);
            if (side > 0.0) {
              vec2 suv = (an.x > an.z ? vWP.zy : vWP.xy) * vec2(0.11, 0.16);
              vec3 sst = texture2D(tStone, suv).rgb;
              float strata = texture2D(tMacro, vec2((vWP.x + vWP.z) * 0.013, vWP.y * 0.11)).r;
              float crack = texture2D(tMacro, suv * 2.7 + 0.21).r;
              sst *= mix(0.72, 1.18, strata) * mix(0.62, 1.05, smoothstep(0.25, 0.55, crack));
              sst = mix(sst, sst * vec3(0.78, 0.92, 0.62), smoothstep(0.55, 0.8, macro2) * 0.6);
              stone = mix(stone, sst * vec3(1.04, 0.98, 0.9), side);
            }
          }
          vec3 w = vSplat;
          // 境目を絵の濃淡でぎざぎざにする
          float edge = texture2D(tMacro, wuv * 0.09).r;
          w.x = clamp(w.x + (edge - 0.5) * 0.6 * w.x * (1.0 - w.x) * 4.0, 0.0, 1.0);
          // 踏み荒らされた所：草が倒れて土が出て、濡れていれば泥になる（縁は絵の濃淡でばらつかせる）
          vec2 wearMarks = texture2D(tWear, (vWP.xz + ${this.half.toFixed(1)}) / ${(this.half * 2).toFixed(1)}).rg;
          float wear = wearMarks.r;
          wear = smoothstep(0.05, 0.75, wear * (0.75 + edge * 0.5));
          float trod = wear * (1.0 - smoothstep(0.3, 0.8, vWater));
          w.y += w.x * trod * (0.75 - uWet * 0.35);
          w.z += (w.x + w.y * 0.4) * trod * (0.25 + uWet * 0.45);
          w.x *= 1.0 - trod * 0.85;
          w /= max(0.001, w.x + w.y + w.z);
          // 倒れた草は色が褪せて黄ばむ
          grass = mix(grass, grass * vec3(1.05, 0.95, 0.72), trod);
          vec3 col = grass * w.x + dirt * w.y + mud * w.z;
          float steep = smoothstep(0.28, 0.55, 1.0 - vWN.y);
          if (steep > 0.001) {
            // 急な面（山城の切岸・崖）：上から貼った絵は縦に伸びて筋になる。横から（xy・zy）貼り直し、
            // 削った土の層（上は黒い表土と根、下ほど赤茶の地山と黄色い粘土）と、ところどころの岩肌を描く
            vec3 an = abs(vWN); an = an * an; an /= max(1e-3, an.x + an.y + an.z);
            vec2 uX = vWP.zy, uZ = vWP.xy;
            vec3 stT = texture2D(tStone, uX * 0.12).rgb * an.x + texture2D(tStone, uZ * 0.12).rgb * an.z + stone * an.y;
            vec3 dtT = texture2D(tDirt, uX * 0.21).rgb * an.x + texture2D(tDirt, uZ * 0.21).rgb * an.z + dirt * an.y;
            float sx = (vWP.x + vWP.z) * 0.7071;
            float lay = texture2D(tMacro, vec2(sx * 0.004, vWP.y * 0.055)).r;
            float band = fract(vWP.y * 0.42 + lay * 2.6 + texture2D(tMacro, vec2(sx * 0.03, vWP.y * 0.02)).r * 0.9);
            vec3 loam = mix(vec3(0.38, 0.26, 0.18), vec3(0.52, 0.39, 0.26), smoothstep(0.25, 0.75, lay));
            loam = mix(loam, vec3(0.62, 0.51, 0.32), smoothstep(0.8, 0.93, band) * 0.75);   // 黄色い粘土の筋
            loam *= 0.72 + 0.4 * smoothstep(0.1, 0.45, band) * (1.0 - smoothstep(0.62, 0.9, band));
            float lum = dot(dtT, vec3(0.333)) / max(1e-3, dot(texture2D(tDirt, uZ * 0.21, 9.0).rgb, vec3(0.333)));
            vec3 earth = loam * clamp(lum, 0.55, 1.5);
            // 雨が流れた縦の筋（暗い溝と、流れ落ちた明るい砂）
            float rill = texture2D(tMacro, vec2(sx * 0.11, vWP.y * 0.006)).r;
            earth *= 0.88 + 0.22 * smoothstep(0.3, 0.7, rill);
            // 岩：尾根の高い所と、大きな斑のある所だけ（山城の土の切岸を岩だらけにしない）
            float rockK = smoothstep(0.52, 0.74, macro2 + (1.0 - vWN.y) * 0.24);
            vec3 cliff = mix(earth, stT, rockK);
            // 天端の縁は草が垂れ下がる（崖の上の端だけ緑が残る）
            float lip = smoothstep(0.28, 0.4, 1.0 - vWN.y) * (1.0 - smoothstep(0.4, 0.62, 1.0 - vWN.y));
            cliff = mix(cliff, grass * 0.85, lip * 0.45 * w.x);
            // 斜面にしがみつく笹と苔の斑（崖の中ほどまで。真っ直ぐな面ほど少ない）
            float veg = smoothstep(0.5, 0.68, texture2D(tMacro, (uX * an.x + uZ * an.z) * 0.045 + 0.21).r) * (1.0 - smoothstep(0.5, 0.75, 1.0 - vWN.y));
            cliff = mix(cliff, grass * vec3(0.62, 0.7, 0.55), veg * 0.7);
            col = mix(col, cliff, steep);
          }
          // 山の杉林（def.slopeForest）：斜面に杉の樹冠の濃い緑と、木の間の黒い土・ところどころの岩肌・笹の明るい斑を置く。
          // 遠い一枚岩の壁にしない。細かい斑は世界の座標から（霞の中でも粒が見える）
          if (uForest > 0.0) {
            float hill = smoothstep(0.02, 0.12, 1.0 - vWN.y) * smoothstep(0.3, 1.5, vWP.y);
            // 三方向から貼って混ぜる（上から貼ると立った面で縦の筋に伸びる。面ごとの向きの違いでも継ぎ目が出ない）
            vec3 fw = pow(abs(vWN), vec3(4.0)); fw /= (fw.x + fw.y + fw.z);
            #define FTRI(sc, off) (texture2D(tMacro, vWP.zy * (sc) + (off)).r * fw.x + texture2D(tMacro, vWP.xy * (sc) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (sc) + (off)).r * fw.y)
            #define FTRA(a, b, off) (texture2D(tMacro, vec2(vWP.z * (a), vWP.y * (b)) + (off)).r * fw.x + texture2D(tMacro, vec2(vWP.x * (a), vWP.y * (b)) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (a) + (off)).r * fw.y)
            float k1 = FTRI(0.17, 0.13), k2 = FTRI(0.43, 0.51), k3 = FTRI(1.3, 0.0);
            float crown = smoothstep(0.0, 1.0, (k1 * 0.45 + k2 * 0.35 + k3 * 0.25 - 0.5) * 4.2 + 0.5);
            vec3 sugi = mix(vec3(0.045, 0.075, 0.045), vec3(0.11, 0.17, 0.085), smoothstep(0.3, 0.9, k3));
            vec3 floor0 = vec3(0.085, 0.062, 0.045) * (0.7 + 0.6 * k2);
            vec3 forest = mix(floor0, sugi, crown);
            // 遠目の山肌：杉の大きな塊・縦に走る沢と尾根・岩場の帯。細かな粒が霞で消えても、一枚の壁にならない
            float bigK = FTRI(0.031, 0.7);
            float gully = FTRA(0.06, 0.006, 0.3);
            forest *= mix(0.5, 1.5, smoothstep(0.3, 0.7, bigK)) * mix(0.55, 1.25, smoothstep(0.35, 0.65, gully));
            forest = mix(forest, forest * vec3(1.5, 1.25, 0.9) + vec3(0.02, 0.015, 0.0), smoothstep(0.62, 0.8, bigK) * (1.0 - crown) * 0.6);   // 明るい落葉・地肌の斑
            // 岩肌：大きな斑のある所だけ、割れた岩の灰褐色
            float rband = FTRA(0.02, 0.017, 0.45);
            float rk = smoothstep(0.56, 0.7, rband * 0.7 + k1 * 0.3 + macro2 * 0.2) * smoothstep(0.1, 0.3, 1.0 - vWN.y);
            vec3 rockc = stone * vec3(0.95, 0.86, 0.74) * mix(0.55, 1.1, k3);
            forest = mix(forest, rockc, rk * 0.85);
            // 笹と明るい広葉の斑
            forest = mix(forest, vec3(0.2, 0.26, 0.1), smoothstep(0.64, 0.78, k2) * (1.0 - rk) * 0.5);
            col = mix(col, forest, hill * uForest * (1.0 - smoothstep(0.0, 1.0, wear) * 0.9));
            #undef FTRI
            #undef FTRA
          }
          col *= mix(0.82, 1.14, macro);
          // 雨で濡れると暗く
          // 夜は濡れによる黒つぶれを抑え、泥と草の濃淡を残す。
          col *= 1.0 - uWet * (0.28 + w.z * 0.15) * (1.0 - uNight * 0.55);
          // 夜は月明かりで草の緑が抜ける（人の目は暗い所で色を失い、青く見る）。全画質で効く
          col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.8, 0.9, 1.1), uNight * 0.62) * (1.0 - uNight * 0.28);
          // 田の水面：濁った水の色。空は映すが、ぎらつかせない（照り返しは下で弱める）
          float wat = smoothstep(0.3, 0.8, vWater);
          col = mix(col, vec3(0.075, 0.08, 0.06) + mud * 0.22 + grass * 0.05, wat * 0.92);
          // 踏み荒らされた窪みに、雨の強さ（濡れ具合）で水が溜まる。雨が上がっても乾くまで残る
          // 泥の暗いくぼみや踏み固めた道にも水が残る。斜面には溜めない
          float hollow = 1.0 - smoothstep(0.035, 0.075, dot(mud, vec3(0.333)));
          float pool = max(smoothstep(0.55, 0.95, wear), w.z * hollow + w.y * hollow * 0.3)
            * (1.0 - smoothstep(0.3, 0.55, edge)) * smoothstep(0.35, 0.8, uWet) * (1.0 - wat) * (1.0 - steep);
          col = mix(col, vec3(0.06, 0.065, 0.06) + mud * 0.18, pool * 0.85);
          // 血の跡：黒ずんだ赤茶の染み（縁は絵の濃淡でまだらに。雨の水溜りでは薄まる）
          float bld = wearMarks.g;
          bld = smoothstep(0.08, 0.7, bld * (0.6 + edge * 0.8)) * (1.0 - wat) * (1.0 - pool * 0.6);
          col = mix(col, col * vec3(0.55, 0.3, 0.26) + vec3(0.05, 0.008, 0.004), bld * 0.75);
          // 同じ面の中で風のさざ波を作る（絵の読み出しや描画を足さない）
          vec2 waveSlope = vec2(0.0);
          if (max(wat, pool) > 0.001) {
            vec2 waterDir = vec2(${WIND_STATE.dirX}, ${WIND_STATE.dirZ});
            vec2 waveAxis = vec2(-waterDir.y, waterDir.x);
            float waveA = dot(wuv, waterDir) * 2.4 - uTime * 1.1;
            float waveB = dot(wuv, waveAxis) * 3.7 - uTime * 0.7;
            waveSlope = waterDir * cos(waveA) * 0.035 + waveAxis * cos(waveB) * 0.018;
            col *= 1.0 + (sin(waveA) * 0.025 + sin(waveB) * 0.015) * max(wat, pool);
            // 雨粒の輪は田と水たまりだけ。粒や面を増やさず、雨が止めば消える。
            if (uSoilRain > 0.03) {
              vec2 rainCell = floor(wuv * 1.4);
              float rainSeed = fract(sin(dot(rainCell, vec2(127.1, 311.7))) * 43758.5453);
              vec2 drop = fract(wuv * 1.4) - vec2(0.25 + rainSeed * 0.5, 0.65 - rainSeed * 0.3);
              float age = fract(uTime * 1.3 + rainSeed);
              float radius = length(drop);
              float ring = sin((radius - age * 0.5) * 48.0) * exp(-abs(radius - age * 0.5) * 28.0) * (1.0 - age);
              waveSlope += drop / max(0.02, radius) * ring * 0.045 * uSoilRain;
              col *= 1.0 + ring * 0.035 * uSoilRain * max(wat, pool);
            }
          }
          diffuseColor.rgb *= col;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // 細かな凹凸：絵の明るさを高さとみなし、その傾きで法線を傾ける（小石・轍・草の株）
          {
            vec2 q = vWP.xz; float e = 0.06;
            float wd = vSplat.y + vSplat.z * 0.6, wg = vSplat.x;
            #define HGT(p) (dot(texture2D(tDirt, (p) * 0.23).rgb, vec3(0.33)) * wd + dot(texture2D(tGrass, (p) * 0.21).rgb, vec3(0.33)) * wg * 0.6)
            float h0 = HGT(q), hx = HGT(q + vec2(e, 0.0)), hz = HGT(q + vec2(0.0, e));
            float wt = smoothstep(0.3, 0.8, vWater);
            vec3 bw = vec3(-(hx - h0), 0.0, -(hz - h0)) * 5.0 * (1.0 - wt) * (1.0 - pool);
            // 水面の小さなさざ波（風で揺れる）
            bw += vec3(waveSlope.x, 0.0, waveSlope.y) * max(wt, pool);
            normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
          }`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          roughnessFactor = mix(roughnessFactor, 0.55, w.z * 0.7);
          roughnessFactor = mix(roughnessFactor, 0.34 + w.x * 0.14, uWet * (0.55 + w.z * 0.45));   // 濡れた土と泥は照り、草はそれほどでもない
          roughnessFactor = mix(roughnessFactor, 0.42, smoothstep(0.3, 0.8, vWater));
          roughnessFactor = mix(roughnessFactor, 0.12, pool);`)
        // 田の照り返しは空の半分ほどに（白く光りすぎないように）
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // 遠くの田は浅い角度で空を映しきって白い紙のようになるので、遠いほど照り返しを抑える
          float watFar = smoothstep(40.0, 160.0, length(vWP - cameraPosition));
          ${mat.isMeshLambertMaterial ? `// 低・中でも、空の色と見る角度で田・泥の艶を残す
          vec3 soilView = normalize(cameraPosition - vWP);
          vec3 waterNormal = normalize(vec3(waveSlope.x, 1.0, waveSlope.y));
          float grazing = 1.0 - clamp(dot(soilView, waterNormal), 0.0, 1.0);
          float sheen = (wat * 0.24 + pool * 0.2 + w.z * uWet * 0.035 * (1.0 - steep))
            * (0.25 + grazing * grazing * 0.75) * (1.0 - watFar * 0.5) * (1.0 - bld * 0.6);
          reflectedLight.indirectDiffuse += uSoilSky * sheen;` : ''}
          reflectedLight.indirectSpecular *= 1.0 - wat * (0.5 + watFar * 0.3) - pool * watFar * 0.4;
          reflectedLight.directSpecular *= 1.0 - wat * 0.6;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  buildVegetation() {
    const R = rng(this.def.seed || 11);
    // 画質「低」（携帯の既定）：作る時間を縮める。木の形の種類・株のためし置き・足もとの草・田の苗・低木を減らす（遠目の見た目は変えない程度に）
    // window.__vegFull を true にすると「低」でも減らさない（前後の見比べ用）
    const lowV = SETTINGS.quality === 'low' && !window.__vegFull;
    // 段ごとの作る時間（ミリ秒）を window.__vegTimes に残す（読み込みの重さを調べる係が読む）
    const VT = window.__vegTimes = {}; let vt0 = performance.now();
    const lap = (k) => { const t = performance.now(); VT[k] = Math.round(t - vt0); vt0 = t; };
    const clear = this.def.clear || (() => false);
    const paths = this.def.paths || [];
    const ok = (x, z, pad) => {
      if (this.castle && castleInside(this.castle, x, z, 8)) return false;   // 曲輪と土塁の上には木を立てない
      if (clear(x, z)) return false;
      for (const p of paths) if (distToPolyline(x, z, p) < pad * (this.def.treePadMul ?? 1)) return false;   // 細い山道は木を道の際まで（def.treePadMul）
      if (this.def.water && x > this.def.water.x - 4 && x < (this.def.water.x2 ?? 1e9) + 3) return false;
      for (const st of this.def.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.6 + pad * 0.3) return false;
      if (this.def.paddy && this.def.paddy(x, z) > 0.3) return false;
      return true;
    };
    // 木：杉・松・広葉樹・竹。幹は樹皮の絵、葉は透ける板を束ねる（同じ形が並ばないよう、形を何通りか作って回す）
    const trees = { sugi: [], matsu: [], broad: [], take: [] };
    const treeCount = this.def.trees ?? 520;
    const extra = this.def.groves || [];
    const place = (x, z, inGrove) => {
      const y = this.heightAt(x, z);
      const s = 0.75 + R() * 0.6;
      const r = R();
      const sg = this.def.sugiAt ? this.def.sugiAt(x, z) : 0;   // 杉林（def.sugiAt：0〜1 で杉の割合を上げる）
      const kind = inGrove && r < 0.12 && !sg ? 'take' : r < 0.46 + sg * 0.5 ? 'sugi' : r < 0.66 + sg * 0.3 ? 'matsu' : 'broad';
      trees[kind].push([x, y, z, s, R()]);
    };
    let tries = 0;
    let placed = 0;
    while (placed < treeCount && tries < treeCount * 12) {
      tries++;
      const x = (R() * 2 - 1) * (this.half - 4), z = (R() * 2 - 1) * (this.half - 4);
      if (!ok(x, z, 7)) continue;
      const dens = this.def.treeDensity ? this.def.treeDensity(x, z) : 1;
      if (R() > dens) continue;
      place(x, z, false); placed++;
      // 森らしく、近くにもう一、二本
      if (R() < 0.45) { const a = R() * 6.28, d = 3 + R() * 4; const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d; if (ok(x2, z2, 6)) { place(x2, z2, false); placed++; } }
    }
    // 竹林：林の縁のところどころに、竹の藪を固めて置く（竹は一本ずつ散らばらず、藪になって生える）
    if (!this.def.noBamboo) {
      const seeds = Math.round(Math.min(8, treeCount / 70));
      for (let b = 0, tries2 = 0; b < seeds && tries2 < 200; tries2++) {
        const x = (R() * 2 - 1) * (this.half - 10), z = (R() * 2 - 1) * (this.half - 10);
        if (!ok(x, z, 9)) continue;
        b++;
        const n = 5 + Math.floor(R() * 6), sx = 0.7 + R() * 0.8;
        for (let k = 0; k < n; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 6; const x2 = x + Math.cos(a) * d * sx, z2 = z + Math.sin(a) * d / sx; if (ok(x2, z2, 3)) trees.take.push([x2, this.heightAt(x2, z2), z2, 0.8 + R() * 0.4, R()]); }
      }
    }
    for (const g of extra) {
      for (let k = 0; k < g.n; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * g.r;
        place(g.x + Math.cos(a) * r * (g.sx || 1), g.z + Math.sin(a) * r * (g.sz || 1), true);
      }
    }
    const winter = !!(this.def.winter || this.def.snow);
    const autumn = !!this.def.autumn && !winter;
    // 葉：遠くでも葉の塊が痩せて板の形が見えないよう、絵が縮むほど不透明の度合いを上げる。空の映り込みは控えめ（白く浮かないように）
    const leafMat = (kind, tint, amp) => sway(liteMat({ map: leafTex(kind), color: tint, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 }), amp, 2.5, { after: leafLit });
    // 幹：カメラのすぐ前（2m 足らず）の幹は網目に抜く（木の脇で、黒い柱が画面を縦に塞がないように。葉の抜きと同じ考え）
    const barkMat = (kind) => {
      const m = liteMat({ map: barkTex(kind), bumpMap: barkTex(kind), bumpScale: 1.5, roughness: 0.95, metalness: 0 });
      m.customProgramCacheKey = () => 'barkNear';
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          { float nd = length(vViewPosition); if (nd < 2.0) { vec2 q = floor(gl_FragCoord.xy); float th = fract((q.x * 2.0 + q.y * 3.0) * 0.2 + fract(q.y * 0.5) * 0.5); if (smoothstep(0.7, 2.0, nd) < th) discard; } }`);
      };
      return m;
    };
    // 葉の板：外向きの法線にして、塊が丸く照らされるようにする
    const card = (parts, cx, cy, cz, w, h, ry, rx, ox, oy, oz) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateX(rx); g.rotateY(ry); g.translate(cx, cy, cz);
      const n = g.attributes.normal, p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const v = new THREE.Vector3(p.getX(k) - ox, (p.getY(k) - oy) * 0.6, p.getZ(k) - oz).normalize();
        n.setXYZ(k, v.x, Math.max(0.25, v.y + 0.35), v.z);
      }
      parts.push(g);
    };
    const T = rng(4242);
    const makeVariant = (kind) => {
      const bark = [], leaves = [];
      if (kind === 'sugi') {
        const H = 10 + T() * 7;
        const tr = new THREE.CylinderGeometry(0.12, 0.34, H, 7); tr.translate(0, H / 2, 0); bark.push(tr);
        // 下枝を落とした細長い樹冠。枝の段はそろえず、ところどころ欠け、頂は細く尖らせすぎない
        const c0 = H * (0.25 + T() * 0.18), R0 = 1.8 + T() * 0.9;
        for (let y = c0; y < H + 0.4; y += 0.45 + T() * 0.35) {
          const t = (y - c0) / (H + 0.4 - c0);
          const rad = (Math.pow(1 - t, 0.85) * R0 + 0.4) * (0.8 + T() * 0.35);
          const n = Math.max(3, Math.round(rad * 3.2));
          for (let k = 0; k < n; k++) {
            if (t < 0.7 && T() < 0.18) continue;
            const a = (k / n) * Math.PI * 2 + T() * 0.9;
            const yy = y + (T() - 0.5) * 0.4, rr = rad * (0.45 + T() * 0.25);
            card(leaves, Math.cos(a) * rr, yy, Math.sin(a) * rr, rad * (1.1 + T() * 0.35), rad * (0.8 + T() * 0.4), -a + Math.PI / 2, -0.15 - T() * 0.45, 0, yy, 0);
          }
        }
        // 樹冠を縦に貫く葉の板：上から見ても段の梯子に見えず、塊に見える
        for (let k = 0; k < 3; k++) {
          const ch = (H + 0.4 - c0) * 0.85;
          card(leaves, 0, c0 + ch * 0.45, 0, R0 * 1.3, ch, (k / 3) * Math.PI + T() * 0.3, 0, 0, c0 + ch * 0.45, 0);
        }
      } else if (kind === 'matsu') {
        // 曲がった幹と、枝先の平たい葉の雲
        let x = 0, z = 0, y = 0;
        const lean = T() * 6.28, H = 7 + T() * 4;
        for (let k = 0; k < 4; k++) {
          const nx = x + Math.cos(lean + k * 0.7) * 0.6, nz = z + Math.sin(lean + k * 0.7) * 0.6, ny = y + H / 4;
          const seg = new THREE.CylinderGeometry(0.2 - k * 0.03, 0.28 - k * 0.03, H / 4 + 0.1, 6);
          const dir = new THREE.Vector3(nx - x, ny - y, nz - z);
          seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
          seg.translate((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
          bark.push(seg);
          x = nx; y = ny; z = nz;
        }
        for (let c = 0; c < 5; c++) {
          const a = T() * 6.28, d = 1 + T() * 2.2, cy = H * (0.55 + T() * 0.45);
          const cx = x * (cy / H) + Math.cos(a) * d, cz = z * (cy / H) + Math.sin(a) * d;
          const br = new THREE.CylinderGeometry(0.05, 0.09, d, 4);
          br.rotateZ(Math.PI / 2); br.rotateY(-a); br.translate(x * (cy / H) + Math.cos(a) * d / 2, cy - 0.2, z * (cy / H) + Math.sin(a) * d / 2); bark.push(br);
          for (let k = 0; k < 7; k++) card(leaves, cx + (T() - 0.5) * 1.4, cy + (T() - 0.3) * 0.5, cz + (T() - 0.5) * 1.4, 1.6 + T(), 1.1 + T() * 0.6, T() * 6.28, -1.2 + T() * 0.5, cx, cy - 0.4, cz);
        }
      } else if (kind === 'broad') {
        const H = 5 + T() * 3;
        const tr = new THREE.CylinderGeometry(0.16, 0.32, H, 7); tr.translate(0, H / 2, 0); bark.push(tr);
        for (let k = 0; k < 3; k++) { const a = T() * 6.28; const br = new THREE.CylinderGeometry(0.06, 0.12, 2.2, 5); br.rotateZ(0.8); br.rotateY(a); br.translate(Math.cos(a) * 0.6, H * 0.85, -Math.sin(a) * 0.6); bark.push(br); }
        const cy = H + 1.2, R0 = 2.4 + T() * 0.8;
        // 秋に紅葉する広葉樹は冬に落葉する。杉・松・竹の葉は残す。
        // 細枝は読み込み時に一度作り、裸枝の同じ形を林全体で使い回す。
        if (winter) {
          const twig = (ax, ay, az, bx, by, bz, r) => {
            const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
            const br = new THREE.CylinderGeometry(r * 0.3, r, dir.length(), 4);
            br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
            br.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
            bark.push(br);
          };
          for (let k = 0; k < 3; k++) {
            const a = k * Math.PI * 2 / 3, r = 1.8 + T() * 0.6;
            const bx = Math.cos(a) * r, bz = Math.sin(a) * r, by = H + 0.9;
            twig(0, H * 0.7, 0, bx, by, bz, 0.09);
            for (let j = 0; j < 3; j++) {
              const t = 0.45 + j * 0.2, px = bx * t, pz = bz * t, py = H * 0.7 + (by - H * 0.7) * t;
              const angle = a + (j % 2 ? -0.65 : 0.65);
              twig(px, py, pz, px + Math.cos(angle) * 1.2, py + 0.7, pz + Math.sin(angle) * 1.2, 0.035);
            }
          }
        }
        for (let k = 0; k < (winter ? 0 : 46); k++) {
          const u = T() * 2 - 1, a = T() * 6.28, r = R0 * (0.55 + T() * 0.45);
          const px = Math.sqrt(1 - u * u) * Math.cos(a) * r, py = u * r * 0.75, pz = Math.sqrt(1 - u * u) * Math.sin(a) * r;
          card(leaves, px, cy + py, pz, 1.9, 1.9, T() * 6.28, (T() - 0.5) * 1.6, 0, cy, 0);
        }
      } else {
        // 竹：細い稈を何本も束ね、上に葉
        for (let k = 0; k < 7; k++) {
          const a = T() * 6.28, d = T() * 1.2, H = 9 + T() * 4;
          const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
          const cul = new THREE.CylinderGeometry(0.05, 0.06, H, 5); cul.translate(cx, H / 2, cz); cul.rotateZ((T() - 0.5) * 0.06); bark.push(cul);
          for (let q = 0; q < 6; q++) card(leaves, cx + (T() - 0.5) * 1.6, H * (0.6 + T() * 0.4), cz + (T() - 0.5) * 1.6, 1.8, 1.4, T() * 6.28, (T() - 0.5) * 0.8, cx, H * 0.7, cz);
        }
      }
      const fix = (arr) => { const m = mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g))); return m; };
      // 幹と枝だけの当たり。葉は弾も矢も止めない。形を作る時に一度だけ用意する。
      const woodBounds = bark.map((g) => { g.computeBoundingBox(); return g.boundingBox.clone(); });
      return { bark: fix(bark), leaves: leaves.length ? fix(leaves) : null, woodBounds };
    };
    const dummy = new THREE.Object3D();
    const tintOf = {
      sugi: () => new THREE.Color().setRGB(0.55 + R() * 0.1, 0.62 + R() * 0.12, 0.5),
      matsu: () => new THREE.Color().setRGB(0.6 + R() * 0.1, 0.7 + R() * 0.1, 0.55),
      broad: () => autumn ? new THREE.Color([0xc9a060, 0xd08040, 0xa8a050, 0xe0b050][Math.floor(R() * 4)]) : new THREE.Color().setRGB(0.72 + R() * 0.15, 0.8 + R() * 0.12, 0.6),
      take: () => new THREE.Color().setRGB(0.85, 0.95, 0.7),
    };
    const barkKind = { sugi: 'cedar', matsu: 'pine', broad: 'cedar', take: 'bamboo' };
    this.treeMeshes = [];
    this.missileWood = [];
    for (const kind of Object.keys(trees)) {
      const list = trees[kind];
      if (!list.length) continue;
      const VAR = lowV ? (kind === 'sugi' ? 2 : 1) : kind === 'take' ? 2 : kind === 'matsu' ? 4 : 3;
      for (let v = 0; v < VAR; v++) {
        const mine = list.filter((t, i) => i % VAR === v);
        if (!mine.length) continue;
        const g = makeVariant(kind);
        const bm = new THREE.InstancedMesh(g.bark, barkMat(barkKind[kind]), mine.length);
        const lm = g.leaves ? new THREE.InstancedMesh(g.leaves, leafMat(kind === 'broad' ? 'broad' : kind === 'take' ? 'bamboo' : 'needle', 0xffffff, kind === 'take' ? 0.05 : 0.02), mine.length) : null;
        mine.forEach(([x, y, z, sc, r], i) => {
          dummy.position.set(x, y - 0.25, z);
          dummy.rotation.set((r - 0.5) * 0.06, r * 6.28, (r - 0.5) * 0.06);
          // 松は一本ずつ枝ぶりの広がりを変える（横に張る老松・細く伸びた若松）
          const wide = kind === 'matsu' ? 0.8 + ((r * 7.31) % 1) * 0.55 : 1;
          dummy.scale.set(sc * wide, sc * (0.9 + r * 0.25) / Math.sqrt(wide), sc * wide * (0.85 + ((r * 3.7) % 1) * 0.3));
          dummy.updateMatrix();
          bm.setMatrixAt(i, dummy.matrix); if (lm) lm.setMatrixAt(i, dummy.matrix);
          for (const bounds of g.woodBounds) {
            const b = bounds.clone().applyMatrix4(dummy.matrix);
            this.missileWood.push({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
          }
          if (lm) lm.setColorAt(i, tintOf[kind]());
        });
        const meshes = lm ? [bm, lm] : [bm];
        for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; this.scene.add(m); this.treeMeshes.push(m); }
        this.viewCull(meshes, lowV ? 16 : 40);
      }
    }
    this.treePoints = Object.values(trees).flat().map(([x, , z]) => [x, z]);
    lap('trees');

    // 草むら
    // 草むら：葉の絵を十字に組んだ板（遠目に草原らしく見える）
    const tufts = Math.round((this.def.tufts ?? 5000) * 1.5);
    // 絵：細く先の尖った葉を百本ほど。根元は暗く（株の中の陰）、先ほど明るく、ところどころ枯れた葉・折れて垂れた葉・穂
    const GS = 256, gc = document.createElement('canvas'); gc.width = GS; gc.height = GS;
    const gg = gc.getContext('2d', { willReadFrequently: true });   // 読み出す（alphaTex）ので読み出しの速いキャンバスに
    const GR = rng(77);
    for (let i = 0; i < 64; i++) {
      // 株は根元が細く、葉先ほど外へ開く扇の形（板の四角い輪郭が見えないように）。真ん中の葉ほど高い
      const x = GS * (0.5 + (GR() + GR() + GR() - 1.5) * 0.24), off = (x - GS / 2) / GS;
      const h = GS * (0.28 + Math.pow(GR(), 0.7) * 0.64) * (1 - Math.abs(off) * 1.1);
      let lean = off * GS * 1.3 + (GR() - 0.5) * GS * 0.22;
      lean = Math.max(GS * 0.04 - x, Math.min(GS * 0.96 - x, lean));
      const wdt = GS * (0.006 + GR() * 0.01);
      const v = 150 + GR() * 70, dry = GR() < 0.16;
      // 葉ごとに少し色をずらす（黄みの葉・青みの葉・枯れ葉）。全体の色は置く所で掛ける
      const cr = dry ? 1.18 : 0.92 + GR() * 0.14, cb = dry ? 0.7 : 0.85 + GR() * 0.2;
      const col = (k) => `rgb(${Math.min(255, v * k * cr) | 0},${Math.min(255, v * k) | 0},${Math.min(255, v * k * cb) | 0})`;
      // 根元は濃い緑、中ほどは草の緑、先は黄みの枯れ色（白っぽい薄荷色にしない）
      const rgb = (r, g, bl) => `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, bl) | 0})`;
      const lg = gg.createLinearGradient(0, GS, 0, GS - h);
      lg.addColorStop(0, rgb(v * 0.36 * cr, v * 0.5, v * 0.26 * cb)); lg.addColorStop(0.45, rgb(v * 0.6 * cr, v * 0.76, v * 0.4 * cb)); lg.addColorStop(1, rgb(v * 0.82 * cr, v * 0.74, v * 0.4 * cb));
      void col;
      gg.fillStyle = lg;
      // 折れて垂れた葉：途中で曲がって先が下がる
      const bend = GR() < 0.18;
      const tx = x + lean, ty = GS - h;
      const mx = x + lean * 0.2, my = GS - h * 0.5;
      gg.beginPath();
      gg.moveTo(x - wdt, GS);
      if (bend) {
        const ex = tx + lean * 0.6 + (lean > 0 ? 18 : -18), ey = ty + h * 0.35;
        gg.quadraticCurveTo(mx - wdt * 0.6, my, tx, ty);
        gg.quadraticCurveTo((tx + ex) / 2, ty - 6, ex, ey);
        gg.quadraticCurveTo((tx + ex) / 2, ty - 2, tx + wdt * 0.8, ty + 3);
        gg.quadraticCurveTo(mx + wdt * 0.6, my, x + wdt, GS);
      } else {
        gg.quadraticCurveTo(mx - wdt * 0.7, my, tx, ty);
        gg.quadraticCurveTo(mx + wdt * 0.7, my, x + wdt, GS);
      }
      gg.closePath(); gg.fill();
      // 葉の中筋の照り
      if (GR() < 0.5) { gg.strokeStyle = `rgba(240,230,170,${0.04 + GR() * 0.05})`; gg.lineWidth = 0.8; gg.beginPath(); gg.moveTo(x, GS); gg.quadraticCurveTo(mx, my, tx, ty); gg.stroke(); }
    }
    // 穂：細い茎の先に、明るい小さな粒の房
    for (let i = 0; i < 5; i++) {
      const x = GS * (0.2 + GR() * 0.6), h = GS * (0.75 + GR() * 0.22), lean = (GR() - 0.5) * GS * 0.2;
      gg.strokeStyle = 'rgb(190,180,140)'; gg.lineWidth = 1.2; gg.beginPath(); gg.moveTo(x, GS); gg.quadraticCurveTo(x + lean * 0.3, GS - h * 0.6, x + lean, GS - h); gg.stroke();
      for (let k = 0; k < 9; k++) { gg.fillStyle = `rgb(${215 + GR() * 30},${200 + GR() * 30},${150 + GR() * 30})`; gg.beginPath(); gg.ellipse(x + lean + (GR() - 0.5) * 5, GS - h + k * 2.2, 1.6, 2.6, lean * 0.01, 0, 7); gg.fill(); }
    }
    const gtex = alphaTex(gc);
    // 株：四枚の板を少しずつ外へ傾けて組む。光は上から受ける向き（法線を上へ寄せる）にして、板ごとの明暗の差を消す
    const blades = [];
    for (let k = 0; k < 4; k++) {
      const pg = new THREE.PlaneGeometry(0.9, 0.75);
      pg.translate(0, 0.33, 0);
      pg.rotateX((k % 2 ? 1 : -1) * 0.12);
      pg.rotateY((k / 4) * Math.PI + (k % 2) * 0.2);
      const nn = pg.attributes.normal, pp = pg.attributes.position;
      for (let q = 0; q < nn.count; q++) {
        const ox = pp.getX(q), oz = pp.getZ(q), l = Math.hypot(ox, oz) || 1;
        const up = 0.35 + pp.getY(q) * 0.6;
        const v = new THREE.Vector3(ox / l * 0.45, 1.0 + up, oz / l * 0.45).normalize();
        nn.setXYZ(q, v.x, v.y, v.z);
      }
      blades.push(pg);
    }
    const tuftGeo = mergeGeometries(blades);
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, sway(liteMat({ color: 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.12, 0, { wear: true, after: grassLit }), tufts);
    const tc = new THREE.Color();
    let n = 0;
    // 草は群れて生える：半分ほどは直前の株のそばに置き、濃い草むらと地肌の見える所ができるようにする
    let lastX = 0, lastZ = 0;
    for (let tries = 0; n < tufts && tries < tufts * (lowV ? 6 : 8); tries++) {
      const near = n > 0 && R() < 0.55, ca = R() * 6.28, cd = 0.35 + R() * 1.1;
      const x = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastX + Math.cos(ca) * cd)) : (R() * 2 - 1) * (this.half - 2);
      const z = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastZ + Math.sin(ca) * cd)) : (R() * 2 - 1) * (this.half - 2);
      // 踏み固めた土・陣の中には草むらを生やさない（草の割合に合わせて間引く）
      if (R() > this.grassAt(x, z) * 1.15 - 0.05) continue;
      // 草むらは大きな群れにまとまる：ゆるい波の濃い所に多く、薄い所はまばら（上から見て水玉に並ばないように）
      const clump = 0.5 + 0.5 * Math.sin(x * 0.061 + Math.sin(z * 0.047) * 1.7) * Math.cos(z * 0.058 - x * 0.021);
      if (!near && R() > 0.25 + clump * 0.9) continue;
      if (this.def.water && x > this.def.water.x - 2 && x < (this.def.water.x2 ?? 1e9) + 2) continue;
      let onPath = false;
      for (const p of paths) if (distToPolyline(x, z, p) < 2.5) { onPath = true; break; }
      if (onPath) continue;
      if (this.def.paddy && this.def.paddy(x, z) > 0.3) continue;
      let inStream = false;
      for (const st of this.def.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.2) inStream = true;
      if (inStream) continue;
      dummy.position.set(x, this.heightAt(x, z) - 0.1, z);
      const s = 0.45 + Math.pow(R(), 1.5) * 1.0;
      dummy.scale.set(s * (0.8 + R() * 0.4), s * (0.7 + R() * 0.9), s * (0.8 + R() * 0.4));
      dummy.rotation.set((R() - 0.5) * 0.45, R() * 6.28, (R() - 0.5) * 0.45);
      dummy.updateMatrix();
      tuftMesh.setMatrixAt(n, dummy.matrix);
      // 地面の草の色に合わせ、ところどころ枯れ色
      // 野の広い斑：濃い緑の所と、黄ばんだ所がゆるやかに移り変わる（同じ色の草が一面に並ばないように）
      const fk = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(x * 0.043 + Math.cos(z * 0.031) * 2.1) * Math.cos(z * 0.052 - x * 0.012) + (R() - 0.5) * 0.25));
      tc.setRGB(0.25 + fk * 0.13 + R() * 0.08, 0.35 + fk * 0.05 + R() * 0.09, 0.14 + fk * 0.03 + R() * 0.05);
      // 夏の田舎の草：鮮やかな緑を少し灰と土の色に寄せ、ところどころ土色のまだら
      { const gl = (tc.r + tc.g + tc.b) / 3; tc.setRGB(tc.r * 0.82 + gl * 0.18, tc.g * 0.82 + gl * 0.18, tc.b * 0.82 + gl * 0.18); if (R() < 0.08) tc.lerp(TUFT_AUTUMN, 0.45); }
      if (R() < 0.1 + fk * 0.12 + (this.def.autumn ? 0.2 : 0)) tc.setRGB(0.52 + R() * 0.1, 0.47 + R() * 0.08, 0.28);
      // 季節の色：秋は枯れ色に寄せ、初夏（def.young）は若葉の明るい緑に
      if (this.def.autumn) tc.lerp(TUFT_AUTUMN, 0.3);
      else if (this.def.young) tc.setRGB(tc.r * 0.92, tc.g * 1.12, tc.b * 0.95);
      tuftMesh.setColorAt(n, tc);
      lastX = x; lastZ = z;
      n++;
    }
    tuftMesh.count = n;
    lap('tufts');
    tuftMesh.receiveShadow = true;
    this.viewCull([tuftMesh], 0);   // 全画質で、画面の外の草むらは描かない
    this.scene.add(tuftMesh);
    // 薄（ススキ）の株と野の花：まとまって生える
    const patch = (kind, count, size, clumps) => {
      const pg = []; for (let k = 0; k < 2; k++) { const g = new THREE.PlaneGeometry(size, size); g.translate(0, size / 2, 0); g.rotateY((k / 2) * Math.PI); pg.push(g); }
      const mesh = new THREE.InstancedMesh(mergeGeometries(pg), sway(liteMat({ map: leafTex(kind), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4 }), kind === 'susuki' ? 0.09 : 0.05, 0, { wear: true, after: grassAlpha }), count);
      let m = 0;
      for (let cI = 0; cI < clumps && m < count; cI++) {
        const cx = (R() * 2 - 1) * (this.half - 6), cz = (R() * 2 - 1) * (this.half - 6);
        if (!ok(cx, cz, 4)) continue;
        const per = Math.ceil(count / clumps);
        for (let q = 0; q < per && m < count; q++) {
          const x = cx + (R() - 0.5) * 7, z = cz + (R() - 0.5) * 7;
          if (this.grassAt(x, z) < 0.4) continue;
          dummy.position.set(x, this.heightAt(x, z) - 0.05, z);
          const sc = 0.7 + R() * 0.6; dummy.scale.set(sc, sc * (0.8 + R() * 0.5), sc); dummy.rotation.set(0, R() * 6, 0);
          dummy.updateMatrix(); mesh.setMatrixAt(m++, dummy.matrix);
        }
      }
      mesh.count = m;
      if (m > 0) this.viewCull([mesh], 0);
      this.scene.add(mesh);
    };
    // 石：斜面ほど多く、半分ほど土に埋まる
    {
      // 角ばった多面体に見えないよう、細かく割って、大小のうねりで形を崩し、なめらかに陰を付ける（岩肌の凹凸は絵の側で）
      const rg0 = new THREE.IcosahedronGeometry(1, lowV ? 1 : 2); rg0.deleteAttribute('normal');
      const rg = mergeVertices(rg0);
      const rp = rg.attributes.position;
      for (let k = 0; k < rp.count; k++) {
        const x = rp.getX(k), y = rp.getY(k), z = rp.getZ(k);
        const f = 0.82 + Math.sin(x * 2.7 + z * 1.3) * 0.12 + Math.sin(y * 4.1 + x * 3.3) * 0.06 + Math.cos(z * 5.2 - y * 2.1) * 0.04;
        // 下は平たく（地に据わる）、上は少し角を残す
        rp.setXYZ(k, x * f, y * f * (y < 0 ? 0.55 : 0.75), z * f);
      }
      rg.computeVertexNormals();
      // 苔と土：上を向いた面ほど苔の緑、根元は土で汚れる
      { const rn = rg.attributes.normal, cc = new Float32Array(rp.count * 3), moss = new THREE.Color(0x6f7a4a), soil = new THREE.Color(0x7a6a54), base = new THREE.Color(0xb8b2a6), c = new THREE.Color();
        for (let k = 0; k < rp.count; k++) {
          const up = rn.getY(k), y = rp.getY(k);
          c.copy(base).lerp(moss, Math.max(0, up - 0.45) * 1.3 * (0.6 + Math.sin(rp.getX(k) * 5 + rp.getZ(k) * 3) * 0.4)).lerp(soil, Math.max(0, -y - 0.1) * 1.6);
          cc[k * 3] = c.r; cc[k * 3 + 1] = c.g; cc[k * 3 + 2] = c.b;
        }
        rg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
      const N = this.def.rocks ?? 260;
      const rocks = new THREE.InstancedMesh(rg, liteMat({ map: stoneTex(), bumpMap: stoneTex(), bumpScale: 1, vertexColors: true, roughness: 0.92 }), N);
      let m = 0;
      for (let tries = 0; tries < N * 8 && m < N; tries++) {
        const x = (R() * 2 - 1) * (this.half - 3), z = (R() * 2 - 1) * (this.half - 3);
        if (!ok(x, z, 3)) continue;
        const sl = Math.abs(this.heightAt(x + 2, z) - this.heightAt(x - 2, z)) + Math.abs(this.heightAt(x, z + 2) - this.heightAt(x, z - 2));
        if (R() > 0.25 + sl * 0.5) continue;
        const sc = 0.18 + Math.pow(R(), 2.5) * 1.3;
        dummy.position.set(x, this.heightAt(x, z) - sc * 0.25, z);
        dummy.rotation.set(R() * 0.5, R() * 6, R() * 0.5);
        // 形の種類：丸い石・平たい岩・縦に割れた岩
        const kind = R();
        if (kind < 0.3) dummy.scale.set(sc * (1.3 + R() * 0.6), sc * 0.45, sc * (1.1 + R() * 0.5));
        else if (kind < 0.45) dummy.scale.set(sc * 0.7, sc * (1.3 + R() * 0.5), sc * (0.8 + R() * 0.3));
        else dummy.scale.set(sc * (0.8 + R() * 0.6), sc, sc * (0.8 + R() * 0.6));
        dummy.updateMatrix(); rocks.setMatrixAt(m++, dummy.matrix);
      }
      rocks.count = m; rocks.castShadow = true; rocks.receiveShadow = true;
      lap('rocks');
      this.viewCull([rocks], lowV ? 0 : 40);   // 近くの岩は画面外から落ちる影も保つ
      this.scene.add(rocks);
    }
    // 低木：林の縁に葉の塊
    {
      const bushG = [];
      const TB = rng(123);
      for (let k = 0; k < 9; k++) { const g = new THREE.PlaneGeometry(1.3, 1.1); g.rotateX((TB() - 0.5) * 1.2); g.rotateY(TB() * 6.28); g.translate((TB() - 0.5) * 1.0, 0.5 + TB() * 0.5, (TB() - 0.5) * 1.0); bushG.push(g); }
      const pts = this.treePoints || [];
      const N = Math.min(lowV ? 200 : 420, pts.length);
      const bush = new THREE.InstancedMesh(mergeGeometries(bushG), sway(liteMat({ map: leafTex('broad'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.35 }), 0.04, 0.3, { after: keepAlpha }), N);
      const col = new THREE.Color();
      let m = 0;
      for (let k = 0; k < N; k++) {
        const [tx, tz] = pts[Math.floor(R() * pts.length)];
        const a = R() * 6.28, d = 2 + R() * 4, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
        if (!ok(x, z, 3) || this.grassAt(x, z) < 0.3) continue;
        dummy.position.set(x, this.heightAt(x, z) - 0.1, z); dummy.rotation.set(0, R() * 6, 0);
        const sc = 0.7 + R() * 0.8; dummy.scale.set(sc, sc * (0.7 + R() * 0.5), sc);
        dummy.updateMatrix(); bush.setMatrixAt(m, dummy.matrix);
        bush.setColorAt(m, this.def.autumn ? col.setRGB(0.75 + R() * 0.2, 0.6 + R() * 0.2, 0.35) : col.setRGB(0.55 + R() * 0.15, 0.65 + R() * 0.15, 0.45));
        m++;
      }
      bush.count = m; bush.castShadow = true;
      lap('bush');
      this.viewCull([bush], lowV ? 0 : 40);
      this.scene.add(bush);
    }
    patch('susuki', Math.round(tufts * 0.08), 1.5, 60);
    // 足もとの草：自分の周り 24m に細かな草を敷きつめ、歩けばついて来る（遠くは今の草むらに任せる）
    {
      const N = lowV ? 1800 : 4200, G = lowV ? 18 : 24;
      const bg = [];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(0.45, 0.38); g.translate(0, 0.17, 0); g.rotateY(k * Math.PI / 3 + 0.3);
        // 光は上から受ける向きに（板ごとの明暗を消す）
        const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) { const v = new THREE.Vector3(nn.getX(q) * 0.35, 1, nn.getZ(q) * 0.35).normalize(); nn.setXYZ(q, v.x, v.y, v.z); }
        bg.push(g);
      }
      this.nearGrass = new THREE.InstancedMesh(mergeGeometries(bg), sway(liteMat({ color: 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.1, 0, { wear: true, after: grassLit }), N);
      this.nearGrass.frustumCulled = false;
      this.nearGrass.receiveShadow = true;
      this.nearN = N; this.nearG = G;
      this.nearOff = [];
      const RN = rng(2024);
      const col = new THREE.Color();
      for (let i = 0; i < N; i++) {
        this.nearOff.push([RN() * G * 2, RN() * G * 2, 0.7 + RN() * 0.7, RN() * 6.28]);
        col.setRGB(0.24 + RN() * 0.1, 0.33 + RN() * 0.1, 0.12 + RN() * 0.05);
        if (RN() < 0.12) col.setRGB(0.5 + RN() * 0.1, 0.46 + RN() * 0.08, 0.28);
        this.nearGrass.setColorAt(i, col);
      }
      this.nearCell = null;
      this.scene.add(this.nearGrass);
      lap('susuki+near');
    }
    // 田植えを終えたばかりの苗：田の中に列をなして並ぶ
    if (this.def.paddy && this.field.height > 0) {
      const rows = [];
      const pz = lowV ? 1.35 : 0.9, px = lowV ? 1.2 : 0.8, psc = lowV ? 1.25 : 1;
      for (let z = -this.half + 2; z < this.half - 2; z += pz) for (let x = -this.half + 2; x < this.half - 2; x += px) if (this.def.paddy(x, z) > 0.6) rows.push([x, z]);
      const sg = []; for (let k = 0; k < 2; k++) { const g = new THREE.PlaneGeometry(0.28, this.field.height); g.translate(0, this.field.height / 2, 0); g.rotateY(k * Math.PI / 2); sg.push(g); }
      // 両面の板の裏から見ると、曇りや雨の暗い光で苗が黒い点の群れに見えた（10/5 桶狭間）。草の株と同じく法線を上へ向ける
      for (const g of sg) { const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) nn.setXYZ(q, 0, 1, 0); }
      const rice = new THREE.InstancedMesh(mergeGeometries(sg), sway(liteMat({ color: this.field.color, map: gtex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), 0.06, 0, { after: (sh) => grassAlpha(sh, false) }), rows.length);
      rows.forEach(([x, z], i) => { dummy.position.set(x + (R() - 0.5) * 0.1, this.heightAt(x, z) - 0.02, z + (R() - 0.5) * 0.1); dummy.rotation.set(0, R() * 3, 0); const sc = (0.8 + R() * 0.4) * psc; dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); rice.setMatrixAt(i, dummy.matrix); });
      this.scene.add(rice);
      this.viewCull([rice], 0);   // 苗も、見えている株だけを同じ束へ残す。
    }
    lap('paddy');
    if (!this.def.snow && !this.def.winter) patch('flower', Math.round(tufts * 0.05), 0.7, 50);
    lap('flower');
  }

  buildWater(w) {
    // 川は地図の外（遠景）まで続ける
    const wide = w.x2 ? w.x2 - w.x + 6 : 700;
    const geo = new THREE.PlaneGeometry(wide, 700);
    geo.rotateX(-Math.PI / 2);
    // 川面：流れる筋の模様
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#40545a'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(200,215,220,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 10 + Math.random() * 30); }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w.x2 ? (w.x2 - w.x) / 16 : 40, 12);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex = tex;
    // 川面：空を映す（粗さを低く）。流れの筋が動く
    const mat = liteMat({ map: tex, color: 0x7e8c88, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.93, envMapIntensity: 0.8 });
    // 川面のさざ波（流れは z の向き）
    rippleWater(mat, 0.0, 1.0, 3.5, this.hemi.color);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(w.x2 ? (w.x + w.x2) / 2 : w.x + wide / 2, w.level, 0);
    this.scene.add(m);
    // 岸の濁り：岸から数メートルは浅く、泥で黄土色に濁る（深い所ほど暗い緑に）
    const edges = w.x2 ? [[w.x, 1], [w.x2, -1]] : [[w.x, 1]];
    for (const [ex, sgn] of edges) {
      const bg = new THREE.PlaneGeometry(9, 700, 3, 1); bg.rotateX(-Math.PI / 2);
      const cols = new Float32Array(bg.attributes.position.count * 4);
      const P = bg.attributes.position;
      for (let k = 0; k < P.count; k++) { const t = (P.getX(k) * sgn + 4.5) / 9; cols[k * 4] = 0.42; cols[k * 4 + 1] = 0.38; cols[k * 4 + 2] = 0.27; cols[k * 4 + 3] = 0.55 * (1 - t); }
      bg.setAttribute('color', new THREE.BufferAttribute(cols, 4));
      const sh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true }));
      sh.position.set(ex + sgn * 4.5, w.level + 0.03, 0);
      sh.renderOrder = 1;
      this.scene.add(sh);
    }
  }

  // 足もとの草を、自分を中心に敷き直す（格子ごとに一つの位置を持ち、端を越えたら反対側へ回す）
  updateNearGrass(focus) {
    if (!this.nearGrass) return;
    const cx = Math.round(focus.x / 1.5), cz = Math.round(focus.z / 1.5);
    if (this.nearCell && this.nearCell[0] === cx && this.nearCell[1] === cz) return;
    if (!this.nearCell) this.nearCell = [cx, cz];
    else { this.nearCell[0] = cx; this.nearCell[1] = cz; }
    const G = this.nearG, d = this.nearDummy || (this.nearDummy = new THREE.Object3D());
    const paths = this.def.paths;
    const NP = this.nearPos || (this.nearPos = new Float32Array(this.nearN * 2).fill(1e9));
    const span = G * 2, x0 = focus.x - G, z0 = focus.z - G;
    let changed = false;
    for (let i = 0; i < this.nearN; i++) {
      const [ox, oz, sc, rot] = this.nearOff[i];
      // 自分の周りの正方形に、ずれないよう巻き戻して置く
      const x = x0 + (((ox - x0) % span + span) % span), z = z0 + (((oz - z0) % span + span) % span);
      // 置き場の変わらない株は置き直さない（端を越えて反対側へ回った株だけ）
      if (Math.abs(NP[i * 2] - x) < 0.01 && Math.abs(NP[i * 2 + 1] - z) < 0.01) continue;
      NP[i * 2] = x; NP[i * 2 + 1] = z;
      const gw = this.grassAt(x, z);
      let show = gw > 0.35 && ((i * 7919) % 100) / 100 < gw;
      if (show && paths) for (const p of paths) if (distToPolyline(x, z, p) < 2.2) { show = false; break; }
      if (show && this.def.water && x > this.def.water.x - 2 && x < (this.def.water.x2 ?? 1e9) + 2) show = false;
      d.position.set(x, show ? this.heightAt(x, z) - 0.04 : -999, z);
      d.rotation.set(0, rot, 0);
      d.scale.set(sc, sc * (0.8 + (i % 5) * 0.1), sc);
      d.updateMatrix();
      this.nearGrass.setMatrixAt(i, d.matrix); changed = true;
    }
    if (changed) this.nearGrass.instanceMatrix.needsUpdate = true;
  }

  // 空の鳥：烏の群れ・高く輪を描く鳶・朝夕に遠くを渡る雁の列（どれも同じ形を大きさと色を変えて一度に描く）
  // 形：くちばしの頭・胴・扇の尾と、二節に折れる翼。羽ばたきは翼の先ほど大きく上下する
  // 烏は羽ばたきと滑空を繰り返し、群れの形は遅れてついて行くので流れて伸び縮みする。ときどき野に降りて歩き、ついばむ
  // （人が近づくと飛び立つ）。world.addCarrion(x, z) で倒れた者の場所を教えると、戦の後にその近くへ降りる
  buildBirds() {
    const V = [];
    const tri = (a, b, c) => V.push(...a, ...b, ...c);
    const head = [0, 0.02, 0.42], neck = [0, 0.03, 0.22], tailL = [-0.16, 0, -0.5], tailR = [0.16, 0, -0.5], rump = [0, 0.02, -0.22];
    for (const sd of [-1, 1]) {
      const inF = [0.07 * sd, 0.02, 0.16], inB = [0.07 * sd, 0.02, -0.12];
      const midF = [0.5 * sd, 0.04, 0.1], midB = [0.45 * sd, 0.03, -0.16];
      const tip = [1.0 * sd, 0.0, -0.14], tip2 = [0.85 * sd, 0.0, -0.24];
      tri(inF, midF, inB); tri(inB, midF, midB);
      tri(midF, tip, midB); tri(midB, tip, tip2);
      // 胴の脇と、胴の下のふくらみ（降りた時に塊に見える）
      tri(head, neck, inF); tri(neck, inB, inF); tri(inB, rump, [0, 0.02, -0.12]);
      tri([0.07 * sd, 0.02, 0.16], [0, -0.1, 0.02], [0.07 * sd, 0.02, -0.12]);
    }
    tri(rump, tailL, tailR);
    tri(head, [0.05, -0.02, 0.2], [-0.05, -0.02, 0.2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
    g.computeVertexNormals();
    const NC = 20, NK = 2, NG = 11, N = NC + NK + NG;
    const fl = new Float32Array(N * 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = WIND;
      // aBird：x 羽ばたきの強さ（0 は滑空）・y 位相・z 翼をたたむ（降りた時 1）・w 羽ばたきの速さ
      sh.vertexShader = 'uniform float uT;\nattribute vec4 aBird;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ax = abs(position.x), fold = aBird.z;
        float fl = sin(uT * aBird.w + aBird.y);
        vec3 fly = transformed;
        fly.y += fl * aBird.x * (ax * 0.55 + max(0.0, ax - 0.45) * 0.5) + (1.0 - aBird.x) * ax * 0.1;
        fly.z -= abs(fl) * aBird.x * ax * 0.08;
        // たたんだ翼：胴に沿わせて後ろへ
        vec3 rest = vec3(sign(position.x) * min(ax, 0.1) + position.x * 0.06, position.y + min(ax, 0.6) * 0.1, position.z - max(0.0, ax - 0.1) * 0.35);
        transformed = mix(fly, rest, fold);`);
    };
    this.birds = new THREE.InstancedMesh(g, mat, N);
    this.birds.geometry.setAttribute('aBird', new THREE.InstancedBufferAttribute(fl, 4));
    this.birdFl = fl;
    const R = rng(8);
    const col = new THREE.Color();
    // 群れの中心はゆっくり流れる
    this.birdFlocks = [0, 1].map(() => ({ cx: (R() - 0.5) * 80, cz: (R() - 0.5) * 80, ph: R() * 6.28, landT: 20 + R() * 30 }));
    this.birdData = [];
    for (let i = 0; i < N; i++) {
      const type = i < NC ? 'crow' : i < NC + NK ? 'kite' : 'goose';
      const b = { type, f: i % 2, r: 16 + R() * 26, a: R() * 6.28, h: 30 + R() * 25, sp: (0.07 + R() * 0.05) * (i % 3 ? 1 : -1) * (i % 2 ? 1 : -1), ph: R() * 6.28,
        ox: (R() - 0.5) * 18, oz: (R() - 0.5) * 18, p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), state: 'air', flap: 1, flapK: 1, flapT: R() * 3, fold: 0, yaw: 0, bank: 0, pitch: 0, sc: 0.8, hop: 0, hopT: 1, peck: 0, fs: 7 + R() * 2 };
      if (type === 'crow') col.setRGB(0.15, 0.145, 0.14);
      else if (type === 'kite') { col.setRGB(0.36, 0.28, 0.2); b.h = 85 + R() * 20; b.r = 40 + R() * 15; b.sp = 0.07 * (i % 2 ? 1 : -1); b.fs = 5; }
      else { col.setRGB(0.42, 0.4, 0.36); b.fs = 6.5 + R() * 0.6; b.k = i - NC - NK; }
      this.birds.setColorAt(i, col);
      this.birdData.push(b);
    }
    this.geese = { t: 20 + R() * 40, on: false };
    this.carrion = [];
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
    this.birdDummy = new THREE.Object3D();
  }

  // 倒れた者の場所（烏が戦の後に降りてくる）
  addCarrion(x, z) {
    this.carrion.push({ x, z });
    if (this.carrion.length > 40) this.carrion.shift();
  }

  // 烏の降りる場所：倒れた者の近く、なければ人から離れた草の野
  birdSpot(F, focus) {
    if (this.carrion.length && Math.random() < 0.85) {
      const c = this.carrion[Math.floor(Math.random() * this.carrion.length)];
      if (Math.hypot(c.x - focus.x, c.z - focus.z) > 14) return { x: c.x, z: c.z, carrion: true };
    }
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * 6.28, r = 30 + Math.random() * 60;
      const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
      if (Math.abs(x) > this.half * 0.9 || Math.abs(z) > this.half * 0.9) continue;
      if (this.grassAt(x, z) < 0.35) continue;
      return { x, z };
    }
    return null;
  }

  updateBirds(dt, focus) {
    if (!this.birds) return;
    const d = this.birdDummy, T = this.time, fl = this.birdFl;
    const dusk = this.timeKey === 'dusk' || (this.mood === 'morning' && T < 240);
    // 雁：朝と夕に、遠くを V の字の列で渡る
    const G = this.geese;
    G.t -= dt;
    if (!G.on && G.t <= 0 && dusk && this.timeKey !== 'storm') {
      const a = Math.random() * 6.28;
      G.on = true; G.s = 0; G.dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
      const side = new THREE.Vector2(-G.dir.y, G.dir.x).multiplyScalar(150 + Math.random() * 70);
      G.o = new THREE.Vector2(focus.x + side.x - G.dir.x * 280, focus.z + side.y - G.dir.y * 280); G.h = 60 + Math.random() * 25;
    }
    if (G.on) { G.s += dt * 11; if (G.s > 560) { G.on = false; G.t = 70 + Math.random() * 80; } }
    for (let i = 0; i < this.birdData.length; i++) {
      const b = this.birdData[i];
      if (b.type === 'goose') {
        if (!G.on) { d.position.set(0, -999, 0); d.scale.setScalar(0.001); } else {
          const rank = Math.ceil(b.k / 2), sd = b.k % 2 ? 1 : -1;
          const bx = G.o.x + G.dir.x * (G.s - rank * 2.4) + (-G.dir.y) * sd * rank * 2.0, bz = G.o.y + G.dir.y * (G.s - rank * 2.4) + G.dir.x * sd * rank * 2.0;
          d.position.set(bx, G.h + Math.sin(T * 0.7 + b.ph) * 0.4, bz);
          d.rotation.set(0, Math.atan2(G.dir.x, G.dir.y), 0, 'YXZ');
          d.scale.setScalar(0.85);
        }
        fl.set([1, b.ph, 0, b.fs], i * 4);
      } else if (b.type === 'kite') {
        // 鳶：高く大きな輪を、翼を張ったまま描く。ときどき二三度羽ばたく
        const F = this.birdFlocks[b.f];
        b.a += b.sp * dt;
        const cx = F.cx + Math.sin(T * 0.01 + F.ph) * 30, cz = F.cz + Math.cos(T * 0.008 + F.ph) * 30;
        d.position.set(cx + Math.cos(b.a) * b.r, b.h + Math.sin(T * 0.1 + b.ph) * 4, cz + Math.sin(b.a) * b.r);
        const dir = b.sp > 0 ? 1 : -1;
        d.rotation.set(0, Math.atan2(-Math.sin(b.a) * dir, Math.cos(b.a) * dir), -0.3 * dir, 'YXZ');
        d.scale.setScalar(1.05);
        const flap = Math.sin(T * 0.21 + b.ph) > 0.93 ? 1 : 0;
        b.flapK += (flap - b.flapK) * Math.min(1, dt * 4);
        fl.set([b.flapK * 0.8, b.ph, 0, b.fs], i * 4);
      } else this.updateCrow(b, i, dt, focus, d, fl);
      d.updateMatrix();
      this.birds.setMatrixAt(i, d.matrix);
    }
    for (const F of this.birdFlocks) {
      F.landT -= dt;
      if (F.landT > 0) continue;
      F.landT = (this.carrion.length ? 14 : 30) + Math.random() * 30;
      const s = this.birdSpot(F, focus);
      if (!s) continue;
      // 群れの半分ほどが降りる
      for (const b of this.birdData) {
        if (b.type !== 'crow' || b.f !== this.birdFlocks.indexOf(F) || b.state !== 'air' || Math.random() > 0.6) continue;
        const a = Math.random() * 6.28, r = Math.random() * 4 + (s.carrion ? 1.5 : 0);
        b.state = 'down'; b.tx = s.x + Math.cos(a) * r; b.tz = s.z + Math.sin(a) * r; b.stay = (s.carrion ? 25 : 9) + Math.random() * 16;
      }
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.geometry.attributes.aBird.needsUpdate = true;
  }

  updateCrow(b, i, dt, focus, d, fl) {
    const F = this.birdFlocks[b.f], T = this.time;
    if (b.p.y < -100) {
      // 始め：群れの輪の上に置く
      b.p.set(F.cx + b.ox + Math.cos(b.a) * b.r, b.h, F.cz + b.oz + Math.sin(b.a) * b.r);
    }
    let tx, ty, tz, maxV = 9;
    if (b.state === 'air' || b.state === 'up') {
      b.a += b.sp * dt;
      const fx = F.cx + Math.sin(T * 0.013 + F.ph) * 45, fz = F.cz + Math.cos(T * 0.011 + F.ph * 1.3) * 45;
      tx = fx + b.ox + Math.cos(b.a) * b.r; tz = fz + b.oz + Math.sin(b.a) * b.r;
      ty = b.h + Math.sin(T * 0.3 + b.ph) * 3;
      if (b.state === 'up' && b.p.y - this.heightAt(b.p.x, b.p.z) > 14) b.state = 'air';
    } else if (b.state === 'down') {
      tx = b.tx; tz = b.tz; ty = this.heightAt(tx, tz) + 0.12; maxV = 7;
      const dl = Math.hypot(tx - b.p.x, tz - b.p.z);
      // 降りる時は、遠くでは高さを保ち、近づくほど下りる
      ty = Math.max(ty, ty + Math.min(40, dl * 0.5));
      if (dl < 1.2 && b.p.y - ty < 1.2) { b.state = 'ground'; b.p.set(tx, ty, tz); b.v.set(0, 0, 0); b.t = 0; }
      if (Math.hypot(focus.x - tx, focus.z - tz) < 12) b.state = 'up';
    }
    if (b.state === 'ground') {
      // 地面：跳ねて歩き、ついばむ。人が近づくか、しばらくすると飛び立つ
      b.t += dt; b.hopT -= dt;
      if (b.hopT <= 0) {
        b.hopT = 0.5 + Math.random() * 1.4;
        if (Math.random() < 0.55) { b.yaw += (Math.random() - 0.5) * 2; b.hop = 0.28; }
        else b.peck = 0.6;
      }
      if (b.hop > 0) {
        b.hop -= dt;
        b.p.x += Math.sin(b.yaw) * dt * 1.4; b.p.z += Math.cos(b.yaw) * dt * 1.4;
      }
      b.peck = Math.max(0, b.peck - dt);
      const gy = this.heightAt(b.p.x, b.p.z) + 0.12;
      b.p.y = gy + (b.hop > 0 ? Math.sin((b.hop / 0.28) * Math.PI) * 0.12 : 0);
      b.fold += (1 - b.fold) * Math.min(1, dt * 5);
      b.sc += (0.42 - b.sc) * Math.min(1, dt * 3);
      b.pitch = -0.35 + (b.peck > 0 ? Math.sin((b.peck / 0.6) * Math.PI * 2) * 0.5 + 0.5 : 0);
      if (b.t > b.stay || Math.hypot(focus.x - b.p.x, focus.z - b.p.z) < 11) { b.state = 'up'; b.v.set(Math.sin(b.yaw) * 2, 4, Math.cos(b.yaw) * 2); b.flap = 1; b.flapT = 3; }
      d.position.copy(b.p);
      d.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
      d.scale.setScalar(b.sc);
      fl.set([0, b.ph, b.fold, b.fs], i * 4);
      return;
    }
    // 飛ぶ：目当てへ向かう速さに、遅れて追いつく（群れの形が流れて伸び縮みする）
    const dx = tx - b.p.x, dy = ty - b.p.y, dz = tz - b.p.z;
    const dl = Math.hypot(dx, dy, dz) || 1, want = Math.min(maxV, dl * 0.7);
    const k = Math.min(1, dt * (b.state === 'up' ? 2.2 : 1.1));
    const ovx = b.v.x, ovz = b.v.z;
    b.v.x += (dx / dl * want - b.v.x) * k; b.v.y += (dy / dl * want - b.v.y) * k; b.v.z += (dz / dl * want - b.v.z) * k;
    if (b.state === 'up') b.v.y = Math.max(b.v.y, 3);
    b.p.addScaledVector(b.v, dt);
    const hs = Math.hypot(b.v.x, b.v.z);
    if (hs > 0.3) {
      const ny = Math.atan2(b.v.x, b.v.z);
      // 曲がる側へ傾く
      const turn = (ovx * b.v.z - ovz * b.v.x) / Math.max(1, hs * hs) / Math.max(dt, 1e-3);
      b.bank += (Math.max(-0.7, Math.min(0.7, -turn * 0.6)) - b.bank) * Math.min(1, dt * 3);
      b.yaw = ny;
    }
    // 羽ばたきと滑空の繰り返し（昇る時と飛び立つ時は羽ばたく）
    b.flapT -= dt;
    if (b.flapT <= 0) { b.flap = b.flap ? 0 : 1; b.flapT = b.flap ? 1.2 + Math.random() * 2.5 : 1 + Math.random() * 2.5; }
    const flap = b.state === 'up' || b.v.y > 0.8 ? 1 : b.flap;
    b.flapK += (flap - b.flapK) * Math.min(1, dt * 4);
    b.fold += (0 - b.fold) * Math.min(1, dt * 6);
    b.sc += (0.8 - b.sc) * Math.min(1, dt * 1.5);
    d.position.copy(b.p);
    d.rotation.set(-Math.max(-0.5, Math.min(0.5, b.v.y / 9)) * 0.6, b.yaw, b.bank, 'YXZ');
    d.scale.setScalar(b.sc);
    fl.set([b.flapK, b.ph, b.fold, b.state === 'up' ? 13 : b.fs], i * 4);
  }

  // 小川：掘った溝に水の帯を流す
  buildStream(st) {
    const pts = st.pts;
    const posA = [], flowA = [], idx = [], surface = [], surfaceStarts = [], surfaceSteps = [];
    const seg = 4;
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), steps = Math.ceil(L / seg);
      if (L < 0.001) continue;
      surfaceStarts[i] = n > 0 ? n - 1 : 0; surfaceSteps[i] = steps;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let k = 0; k <= steps; k++) {
        if (n > 0 && k === 0) continue;
        const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = this.heightAt(x, z) - fordLift(st, x) + st.depth;
        surface.push(x, z, y);
        posA.push(x + nx * st.w, y, z + nz * st.w, x - nx * st.w, y, z - nz * st.w);
        // 曲がった小川でも、その場所の川筋に沿って波を送る。
        flowA.push((bx - ax) / L, (bz - az) / L, (bx - ax) / L, (bz - az) / L);
        if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        n++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute('waterFlow', new THREE.Float32BufferAttribute(flowA, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 小川：濁った流れ。空は映すが、白い帯に見えないよう照り返しを抑える
    // 各頂点の川筋に沿って波が動く（端どうしを結ぶ向きは予備）。
    const f0 = pts[0], f1 = pts[pts.length - 1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) || 1;
    const m = new THREE.Mesh(g, rippleWater(liteMat({ color: 0x38402f, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.6 }), (f1[0] - f0[0]) / fl, (f1[1] - f0[1]) / fl, 2.2, this.hemi.color, true));
    m.receiveShadow = true;
    this.scene.add(m);
    st.surfaceStarts = surfaceStarts; st.surfaceSteps = surfaceSteps;
    st.surface = new Float32Array(surface);   // 描いた水面を深さの判定にも使う
    st.mesh = m;   // 増水など、戦が水面の高さを動かす時に使う（b_tedorigawa.js）
    // 岸の泥：流れの両の縁は、草が薄く土と泥が出ている（踏み荒らしの印を岸に沿って付ける）
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let t = 0; t < L; t += 2.2) {
        const x = ax + (bx - ax) * (t / L), z = az + (bz - az) * (t / L), j = Math.sin(t * 0.7 + i) * 0.4;
        for (const sd of [1, -1]) this.stampWear(x + nx * sd * (st.w * 1.05 + j), z + nz * sd * (st.w * 1.05 + j), 1.3 + Math.abs(j), 70);
      }
    }
    // 流れの中の石と、そのまわりの白い泡（流れの下手へ伸びる）
    const R = rng((this.def.seed || 1) * 17 + pts.length), stones = [], foam = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L, dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let k = 0; k < L / 7; k++) {
        const t = R(), off = (R() - 0.5) * st.w * 1.3;
        const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
        if (Math.abs(x) > this.half - 2 || Math.abs(z) > this.half - 2) continue;
        const r = 0.25 + R() * 0.5, bed = this.heightAt(x, z);
        const depth = this.waterDepthAt(x, z);
        if (depth > r * 0.6) continue;
        const y = bed + r * 0.45;
        const sg = new THREE.DodecahedronGeometry(r, 0); sg.scale(1.3, 0.6, 1); sg.rotateY(R() * 6); sg.translate(x, y - r * 0.15, z);
        stones.push(sg.toNonIndexed());
        const fg = new THREE.RingGeometry(r * 0.9, r * 1.5, 10, 1); fg.rotateX(-Math.PI / 2); fg.scale(1, 1, 1);
        fg.rotateY(Math.atan2(dx, dz)); fg.translate(x + dx * r * 0.4, bed + depth + 0.02, z + dz * r * 0.4);
        foam.push(fg);
      }
    }
    if (stones.length) {
      const sm = new THREE.Mesh(mergeGeometries(stones), liteMat({ color: 0x6e6a62, roughness: 0.6 }));
      sm.castShadow = true; this.scene.add(sm);
      const fm = new THREE.Mesh(mergeGeometries(foam), new THREE.MeshBasicMaterial({ color: 0xe8ecea, transparent: true, opacity: 0.35, depthWrite: false, fog: true }));
      fm.renderOrder = 1; this.scene.add(fm);
      this.streamFoam = (this.streamFoam || []).concat(fm);
    }
  }

  buildRain() {
    // 雪も雨の線と配列を使う。携帯では雪を三百二十粒までに抑える
    const N = this.def.snow ? (SETTINGS.quality === 'low' ? 320 : 640) : (SETTINGS.quality === 'low' ? 900 : 1600);
    const pos = new Float32Array(N * 6);
    this.rainData = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainData[i * 3] = (Math.random() - 0.5) * 70;
      this.rainData[i * 3 + 1] = Math.random() * 30;
      this.rainData[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc9d2d6, transparent: true, opacity: 0.45 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    // 手前の太い雨筋：目の前 1〜9m の粒は、幅のある板にして太く速く見せる（遠くの細い線と重ねて奥行きを出す）
    const NN = 96;
    this.nearRain = new Float32Array(NN * 4);   // x, y, z（自分からのずれ）, 速さ
    for (let i = 0; i < NN; i++) this.respawnNearDrop(i, true);
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NN * 18), 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(NN * 12).map((v, k) => [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1][k % 12]), 2));
    const nmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { color: { value: new THREE.Color(0xd4dce0) }, op: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // 筋の真ん中ほど濃く、上の端（尾）ほど薄い
      fragmentShader: 'uniform vec3 color; uniform float op; varying vec2 vUv; void main(){ float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * (1.0 - vUv.y * 0.8) * op; gl_FragColor = vec4(color, a); }',
    });
    this.rainNear = new THREE.Mesh(ng, nmat);
    this.rainNear.frustumCulled = false;
    this.rainNear.visible = false;
    this.rainNear.renderOrder = 3;
    this.scene.add(this.rainNear);
    // 地面で跳ねる雨粒
    // 跳ね：小さな冠（三本の短い飛沫が外へ開く）
    const SN = 400;
    this.splash = new Float32Array(SN * 3);
    this.splashT = new Float32Array(SN);
    this.splashLine = new Float32Array(SN * 18);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.splashLine, 3));
    this.splashPts = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd8e0e4, transparent: true, opacity: 0.5, depthWrite: false }));
    this.splashPts.frustumCulled = false;
    this.splashPts.visible = false;
    this.scene.add(this.splashPts);
  }

  setRainTarget(v) { this.targetRain = v; }
  // 雪：雨と同じ線を短い白い粒にして、ゆっくり風に流す。水しぶきと雨音は出さない
  updateSnow(dt, focus) {
    const level = Math.max(0, Math.min(1, this.def.snow || 0));
    const d = this.rainData, arr = this.rain.geometry.attributes.position.array;
    const count = Math.floor(d.length / 3 * level);
    this.rain.visible = count > 0;
    this.rainNear.visible = this.splashPts.visible = false;
    this.rain.material.color.setHex(0xe4e9ed);
    this.rain.material.opacity = 0.7;
    this.rain.geometry.setDrawRange(0, count * 2);
    for (let i = 0; i < count; i++) {
      const k = i * 3, o = i * 6;
      d[k + 1] -= dt * (1.1 + (i % 7) * 0.12);
      d[k] += dt * (WIND_STATE.dirX * 1.4 + Math.sin(this.time * 0.6 + i) * 0.3);
      d[k + 2] += dt * WIND_STATE.dirZ * 1.4;
      if (d[k + 1] < 0) {
        d[k + 1] += 30;
        d[k] = (Math.random() - 0.5) * 70;
        d[k + 2] = (Math.random() - 0.5) * 70;
      }
      const x = focus.x + d[k], y = focus.y - 6 + d[k + 1], z = focus.z + d[k + 2];
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x + 0.025; arr[o + 4] = y + 0.045; arr[o + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
  // 雹：白い小さな粒が速く落ち、地面で一、二度跳ねて止まる
  updateHail(dt, focus, r) {
    this.hailT = Math.max(0, (this.hailT || 0) - dt);
    const k = Math.min(1, this.hailT / 3) * Math.min(1, r * 1.4);
    setScene({ hail: k });
    if (!this.hail) {
      if (k <= 0) return;
      const N = 500;
      this.hailD = new Float32Array(N * 4);   // x, y, z, 縦の速さ
      for (let i = 0; i < N; i++) { this.hailD[i * 4] = (Math.random() - 0.5) * 50; this.hailD[i * 4 + 1] = Math.random() * 25; this.hailD[i * 4 + 2] = (Math.random() - 0.5) * 50; this.hailD[i * 4 + 3] = -18; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      this.hail = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8ecef, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
      this.hail.frustumCulled = false;
      this.scene.add(this.hail);
    }
    this.hail.visible = k > 0.01;
    if (!this.hail.visible) return;
    const d = this.hailD, N = d.length / 4, arr = this.hail.geometry.attributes.position.array, count = Math.floor(N * k);
    for (let i = 0; i < N; i++) {
      if (i >= count) { arr[i * 3 + 1] = -999; continue; }
      const x = focus.x + d[i * 4], z = focus.z + d[i * 4 + 2], gy = this.heightAt(x, z) + 0.03;
      d[i * 4 + 3] = Math.max(-24, d[i * 4 + 3] - dt * 30);
      let y = focus.y - 4 + d[i * 4 + 1] + d[i * 4 + 3] * dt;
      if (y < gy) {
        // 跳ねる。二度目からは弱く、止まったら上へ戻す
        if (d[i * 4 + 3] < -4) { d[i * 4 + 3] = -d[i * 4 + 3] * 0.22; y = gy; }
        else { d[i * 4] = (Math.random() - 0.5) * 50; d[i * 4 + 2] = (Math.random() - 0.5) * 50; d[i * 4 + 3] = -18; y = focus.y + 16 + Math.random() * 8; }
      }
      d[i * 4 + 1] = y - (focus.y - 4);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    this.hail.geometry.attributes.position.needsUpdate = true;
  }
  // 手前の太い雨粒を一つ、上の方へ置き直す
  respawnNearDrop(i, any) {
    const d = this.nearRain, a = Math.random() * Math.PI * 2, r = 1 + Math.sqrt(Math.random()) * 8;
    d[i * 4] = Math.cos(a) * r; d[i * 4 + 2] = Math.sin(a) * r;
    d[i * 4 + 1] = any ? Math.random() * 9 - 3 : 6 + Math.random() * 3;
    d[i * 4 + 3] = 26 + Math.random() * 8;
  }
  // 手前の太い雨筋を動かす（cam：いまの視点。無ければ描かない）
  updateNearRain(dt, r, wdx, wdz) {
    const M = this.rainNear, cam = this.camRef;
    M.visible = r > 0.15 && !!cam && SETTINGS.quality !== 'low';
    if (!M.visible) return;
    M.material.uniforms.op.value = Math.min(0.22, (r - 0.15) * 0.32);
    const d = this.nearRain, N = d.length / 4, arr = M.geometry.attributes.position.array;
    const count = Math.floor(N * Math.min(1, r * 1.1));
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const vl = Math.hypot(wdx, 30, wdz), sx = wdx / vl, sy = -30 / vl, sz = wdz / vl;   // 落ちる向き
    M.geometry.setDrawRange(0, count * 6);
    for (let i = 0; i < count; i++) {
      const o = i * 18;
      const sp = d[i * 4 + 3];
      d[i * 4 + 1] -= dt * sp; d[i * 4] += dt * wdx; d[i * 4 + 2] += dt * wdz;
      if (d[i * 4 + 1] < -3.5 || Math.hypot(d[i * 4], d[i * 4 + 2]) > 10) this.respawnNearDrop(i, false);
      const x = cx + d[i * 4], y = cy + d[i * 4 + 1], z = cz + d[i * 4 + 2];
      // 筋の長さは速さに比例（手前ほど長く見える）。幅は視線と落ちる向きの両方に直角
      const len = sp * 0.028, tx = cx - x, ty = cy - y, tz = cz - z;
      let wx = sy * tz - sz * ty, wy = sz * tx - sx * tz, wz = sx * ty - sy * tx;
      const wl = Math.hypot(wx, wy, wz) || 1, w = 0.002;
      wx *= w / wl; wy *= w / wl; wz *= w / wl;
      const hx = x - sx * len, hy = y - sy * len, hz = z - sz * len;   // 尾（上）
      arr[o] = arr[o + 9] = x - wx; arr[o + 1] = arr[o + 10] = y - wy; arr[o + 2] = arr[o + 11] = z - wz;
      arr[o + 3] = x + wx; arr[o + 4] = y + wy; arr[o + 5] = z + wz;
      arr[o + 6] = arr[o + 12] = hx + wx; arr[o + 7] = arr[o + 13] = hy + wy; arr[o + 8] = arr[o + 14] = hz + wz;
      arr[o + 15] = hx - wx; arr[o + 16] = hy - wy; arr[o + 17] = hz - wz;
    }
    M.geometry.attributes.position.needsUpdate = true;
  }

  // 近い松明・篝火に、決まった数の光を付け替える（0.5 秒ごと）。低は二つのまま。
  assignFireLights(dt, focus) {
    const P = this.firePool;
    if (!P || (this.fireLightT = (this.fireLightT || 0) - dt) > 0) return;
    this.fireLightT = 0.5;
    // 二〜三個の光の枠へ近い順に入れる。全ての火の並べ替えは要らない。
    for (const q of P) { q.nearF = null; q.nearD = 4900; }
    for (const f of this.fires) {
      if (!f.lit) continue;
      if (!f.big && !f.nightOnly && this.timeKey !== 'night' && this.timeKey !== 'dusk' && this.timeKey !== 'storm') continue;
      const dx = f.x - focus.x, dz = f.z - focus.z, d2 = dx * dx + dz * dz;
      for (let i = 0; i < P.length; i++) {
        if (d2 >= P[i].nearD) continue;
        for (let j = P.length - 1; j > i; j--) { P[j].nearF = P[j - 1].nearF; P[j].nearD = P[j - 1].nearD; }
        P[i].nearF = f; P[i].nearD = d2;
        break;
      }
    }
    for (const q of P) {
      if (!q.f) continue;
      let keep = false;
      for (const candidate of P) if (candidate.nearF === q.f) { keep = true; break; }
      if (!keep) { q.f.light = null; q.f = null; q.L.intensity = 0; }
    }
    for (const candidate of P) {
      const f = candidate.nearF;
      if (!f || f.light) continue;
      for (const q of P) if (!q.f) {
        q.f = f; f.light = q.L;
        q.L.distance = f.big ? 34 : f.torch ? 16 : 20;
        q.L.position.set(f.x, this.heightAt(f.x, f.z) + f.ly, f.z);
        break;
      }
    }
  }

  // 遠い軽い兵の塊（いちばん近い端が 38m より先。人の背丈が画面の一割に満たない）は角の少ない形で描く。並び・色・動きの入れ物（兵ごとの属性）は同じ物を使い回し、形だけ替える
  //   mid：中ほどの形を持つか（持たなければ 50m までは元の形）。xg：とても遠い形（無ければ兵の形。馬は馬の軽い形を渡す）
  lodFlag(mesh, banner = false, yose = false) {
    const g = banner ? clothGeo(yose ? 0.66 : 0.72, yose ? 3.7 : 2.6, 1, 2, 0.3, 5.2, 0.14, 12) : clothGeo(0.34, 0.62, 1, 1, 0, 2.62, -0.17, 11);
    this.lodTwin(mesh, null, true, g);
    g.dispose();
  }
  lodTwin(mesh, armor, mid = true, xg = null) {
    const gx = (xg || soldierGeo(armor, 'xlo')).clone(), g = !mid ? mesh.geometry : xg ? gx : soldierGeo(armor, 'lo').clone();
    const gxx = xg ? gx : soldierGeo(armor, SETTINGS.quality === 'low' ? 'x3lo' : 'xxlo').clone();
    for (const k in mesh.geometry.attributes) { const at = mesh.geometry.attributes[k]; if (at.isInstancedBufferAttribute) { if (g !== mesh.geometry) g.setAttribute(k, at); gx.setAttribute(k, at); gxx.setAttribute(k, at); } }
    mesh.userData.lod = { hi: mesh.geometry, lo: g, xlo: gx, xxlo: gxx, n: -1, far: false, lv: -1 };   // lv -1：最初の lodTick で必ず形を選び直す（0 のままだと、低で大きな塊が軽い形になるはずが、遠い塊になるまで 94 面のままだった）
    (this.lodList || (this.lodList = [])).push(mesh);
  }
  // 地図じゅうに並べた木や草は、全画質で画面に入る物だけ同じ束へ残す。近くの影も保つ。
  //   画面に入る木（高さ・幅・風の余裕つき）と、近く（near m の内）の木だけを前へ詰めて描く。カメラの移動・上下左右の向き・画角が変わった時だけ詰め直す
  viewCull(meshes, near) {
    const m0 = meshes[0], N = m0.count;
    if (!N) return;
    const pts = new Float32Array(N * 3), radii = new Float32Array(N), A = m0.instanceMatrix.array;
    let radius = 0;
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const b = m.geometry.boundingSphere;
      radius = Math.max(radius, b.radius + b.center.length());
    }
    for (let i = 0; i < N; i++) {
      const k = i * 16;
      pts[i * 3] = A[k + 12]; pts[i * 3 + 1] = A[k + 13]; pts[i * 3 + 2] = A[k + 14];
      radii[i] = radius * Math.max(Math.hypot(A[k], A[k + 1], A[k + 2]), Math.hypot(A[k + 4], A[k + 5], A[k + 6]), Math.hypot(A[k + 8], A[k + 9], A[k + 10])) + 2;
    }
    const orig = meshes.map((m) => ({ m, mat: m.instanceMatrix.array.slice(0, N * 16), col: m.instanceColor ? m.instanceColor.array.slice(0, N * 3) : null }));
    const L = this.cullList || (this.cullList = []);
    const packed = new Uint32Array(N);
    for (let i = 0; i < N; i++) packed[i] = i;
    // 設営時に32mの升へ分ける。背中側の升は株ごとの六面判定を省く。
    const cells = [], cellOf = new Uint32Array(N), lookup = new Map();
    for (let i = 0; i < N; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2], r = radii[i];
      const key = Math.floor(x / 32) + ',' + Math.floor(z / 32);
      let cell = lookup.get(key);
      if (!cell) {
        cell = { id: cells.length, box: new THREE.Box3(), x0: x, x1: x, z0: z, z1: z, on: true };
        lookup.set(key, cell); cells.push(cell);
      }
      cellOf[i] = cell.id;
      cell.x0 = Math.min(cell.x0, x); cell.x1 = Math.max(cell.x1, x);
      cell.z0 = Math.min(cell.z0, z); cell.z1 = Math.max(cell.z1, z);
      cell.box.min.x = Math.min(cell.box.min.x, x - r); cell.box.max.x = Math.max(cell.box.max.x, x + r);
      cell.box.min.y = Math.min(cell.box.min.y, y - r); cell.box.max.y = Math.max(cell.box.max.y, y + r);
      cell.box.min.z = Math.min(cell.box.min.z, z - r); cell.box.max.z = Math.max(cell.box.max.z, z + r);
    }
    L.push({ orig, pts, radii, packed, cells, cellOf, N, near, thin: SETTINGS.quality === 'low', x: 1e9, y: 0, z: 0, fx: 0, fy: 0, fz: 0, projection: 0 });
    // カメラは描く時に拾う（毎コマの詰め直しは world.update で）
    const world = this;
    for (const m of meshes) {
      m.frustumCulled = false;
      const f = m.onBeforeRender;
      m.onBeforeRender = function (r, sc, cam, geo, mat, group) {
        if (cam && cam.isPerspectiveCamera) world.cullCam = cam;
        return f.call(this, r, sc, cam, geo, mat, group);
      };
    }
  }
  cullTick() {
    const cam = this.cullCam;
    if (!this.cullList || !cam) return;
    const e = cam.matrixWorld.elements, px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10], projection = cam.projectionMatrix.elements[0];
    const V = this.vegView || (this.vegView = { fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sphere: new THREE.Sphere(), box: new THREE.Box3() });
    V.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); V.fr.setFromProjectionMatrix(V.pm);
    for (const C of this.cullList) {
      if (Math.hypot(px - C.x, py - C.y, pz - C.z) < 1 && fx * C.fx + fy * C.fy + fz * C.fz > 0.9998 && projection === C.projection) continue;
      C.x = px; C.y = py; C.z = pz; C.fx = fx; C.fy = fy; C.fz = fz; C.projection = projection;
      const P = C.pts, nr2 = C.near * C.near;
      for (const cell of C.cells) {
        const dx = Math.max(cell.x0 - px, 0, px - cell.x1), dz = Math.max(cell.z0 - pz, 0, pz - cell.z1);
        const margin = (Math.max(Math.abs(cell.x0 - px), Math.abs(cell.x1 - px)) + Math.max(Math.abs(cell.z0 - pz), Math.abs(cell.z1 - pz))) * .02;
        V.box.copy(cell.box).expandByScalar(margin);
        cell.on = dx * dx + dz * dz <= nr2 || V.fr.intersectsBox(V.box);
      }
      let n = 0, changed = false;
      for (let i = 0; i < C.N; i++) {
        if (!C.cells[C.cellOf[i]].on) continue;
        const dx = P[i * 3] - px, dz = P[i * 3 + 2] - pz, d2 = dx * dx + dz * dz;
        V.sphere.center.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        // 次の詰め直しまでの小さな首振りは、遠い草ほど大きな余裕にする。
        V.sphere.radius = C.radii[i] + (Math.abs(dx) + Math.abs(dz)) * .02;
        // 木の高さと幅・風で揺れる余裕まで含めて、画面の外だけを省く。近くの木は残す。
        if (d2 > nr2 && !V.fr.intersectsSphere(V.sphere)) continue;
        // 近くの木（near のある物）は、90m より先を二本に一本・160m より先を四本に一本（霞の中で森の塊に見えれば足りる）
        if (C.thin && nr2 && ((d2 > 8100 && (i & 1)) || (d2 > 25600 && (i & 2)) || (d2 > 57600 && (i & 4)))) continue;
        // 首を振っても束の並びが同じなら、行列と色の写し直し・転送を省く。
        if (C.packed[n] === i) { n++; continue; }
        C.packed[n] = i; changed = true;
        for (const o of C.orig) {
          // subarray の一時の入れ物を、木や草の数だけ作らない。
          const dst = o.m.instanceMatrix.array, src = i * 16, at = n * 16;
          for (let k = 0; k < 16; k++) dst[at + k] = o.mat[src + k];
          if (o.col) { const col = o.m.instanceColor.array; for (let k = 0; k < 3; k++) col[n * 3 + k] = o.col[i * 3 + k]; }
        }
        n++;
      }
      for (const o of C.orig) {
        o.m.count = n;
        if (changed) { o.m.instanceMatrix.needsUpdate = true; if (o.col) o.m.instanceColor.needsUpdate = true; }
      }
    }
  }
  lodTick(dt) {
    if (!this.lodList || (this.lodT = (this.lodT || 0) - dt) > 0) return;
    this.lodT = 0.25;
    const cx = ARMY_P.value.x, cz = ARMY_P.value.y;
    if (cx > 9e4) return;
    for (const m of this.lodList) {
      const L = m.userData.lod;
      if (!m.parent || !m.count) continue;
      if (L.n !== m.count || !m.boundingSphere) { m.computeBoundingSphere(); L.n = m.count; }
      m.updateWorldMatrix(true, false);
      _lodV.copy(m.boundingSphere.center).applyMatrix4(m.matrixWorld);
      // 隊のいちばん近い端で測る。低でも近い兵は立体の形を保つ。
      const q = SETTINGS.quality === 'low' ? 2 : 1;
      const dc = Math.hypot(_lodV.x - cx, _lodV.z - cz), d = Math.max(0, dc - m.boundingSphere.radius), h2 = L.lv >= 2 ? 5 : 0;
      //   3：塊のいちばん近い端が 100m より先は、さらに遠い形
      // 携帯では十八メートルより先の隊を、顔・袖・兜・得物を残した軽い立体へ。
      // 姉川の三つの前線を、三十八メートルまで一斉に細かな形で描いていた。
      const near = q > 1 ? (L.lv >= 1 ? 16 : 18) : (L.lv >= 1 ? 32 : 38);
      //   六十メートルの内は、携帯でも腕・袖・笠の形のある形（棒の形に落とさない。10/7 kaito「棒人間」）
      const lv = d > (L.lv === 3 ? 92 : 100) ? 3 : d > (q > 1 ? 60 : 50) - h2 ? 2 : d > near ? 1 : 0;
      if (lv !== L.lv) { L.lv = lv; L.far = lv > 0; m.geometry = lv === 3 ? L.xxlo : lv === 2 ? L.xlo : lv ? L.lo : L.hi; }
    }
  }
  update(dt, focus) {
    // 昼には消し、夕・夜に灯す。既存の二〜三個の光を使い回す。
    const beaconLit = this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    for (const f of this.fires) if (f.nightOnly) {
      if (f.lit !== beaconLit) this.fireLightT = 0;
      f.lit = f.flame.visible = f.inner.visible = f.glow.visible = beaconLit;
    }
    this.assignFireLights(dt, focus);
    this.lodTick(dt);
    this.cullTick();
    // 小川の石のまわりの泡がゆらぐ
    if (this.streamFoam) for (const f of this.streamFoam) f.material.opacity = 0.28 + Math.sin((this.time || 0) * 3.1) * 0.07;
    this.time = (this.time || 0) + dt;
    WIND.value = this.time;
    ARMY_MOTION.value = SETTINGS.reduceMotion ? 0 : 1;
    // 風の強弱：ゆっくりした息と、ときどきの突風（嵐は強く）
    const T = this.time;
    const storm = this.timeKey === 'storm' ? 1 : 0;
    const breath = 0.5 + 0.5 * Math.sin(T * 0.13) * Math.sin(T * 0.071 + 1.3);
    const gustPulse = Math.pow(Math.max(0, Math.sin(T * 0.29 + Math.sin(T * 0.05) * 3)), 6);
    WIND_STATE.gust = Math.max(0, this.def.windStrength ?? 1) * (0.55 + breath * 0.45 + gustPulse * 0.7 + storm * 0.6 + this.rainLevel * 0.3);
    WIND_STATE.t = T;
    GUST.value = WIND_STATE.gust;
    this.updateFade(dt);
    if (this.dayClock) this.dayClock.tick(dt);
    this.updateExposure(dt);
    // 日は戦の間も少しずつ動く（六分で十度ほど西へ回り、影の向きが変わっていく）。朝の日は少しずつ昇る
    if (!this.dayClock && !this.fade && this.sunOffset && this.timeKey !== 'night') {
      const a = dt * 0.0005;
      this.sunOffset.applyAxisAngle(SUN_AXIS, a);
      if (this.mood === 'morning' && this.timeKey === 'day' && this.sunOffset.y < 90) this.sunOffset.y += dt * 0.02;
      this.skyMat.uniforms.sunDir.value.copy(this.sunOffset).normalize();
    }
    // 雲は旗や煙と同じ風下へ。動きを減らす時は、形も流れもその場で止める
    if (!SETTINGS.reduceMotion) {
      this.cloudPhase = (this.cloudPhase + dt * (3 + WIND_STATE.gust * 2.5)) % 20000;
      const U = this.skyMat.uniforms, drift = dt * (0.004 + WIND_STATE.gust * 0.002);
      U.cloudShift.value.x += WIND_STATE.dirX * drift;
      U.cloudShift.value.y += WIND_STATE.dirZ * drift;
      U.cloudTime.value += dt;
    }
    if (this.smokeCol) {
      // 煙の色は空の明るさに合わせる（夕暮れ・雨の中で白く光らないように）
      const sc = this.smokeCol.pts.material.uniforms.color.value;
      sc.set(0xc8c6c0).multiply(this.hemi.color).multiplyScalar(1.05).lerp(this.scene.fog.color, 0.35);
      this.smokeCol.pts.material.uniforms.uTime.value = T;
      this.smokeCol.pts.material.uniforms.wind.value.set(WIND_STATE.dirX, WIND_STATE.dirZ).multiplyScalar(WIND_STATE.gust);
    }
    // 歩いた所を踏む（自分の足もと）。踏み荒らしの絵は時々送り直す
    if (focus && this.lastFoot) {
      const mv = Math.hypot(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z);
      if (mv > 0.6 && this.inWaterAt(focus.x, focus.z)) { this.spray(focus.x, focus.z, mv > 1.2 ? 7 : 4); this.lastFoot.copy(focus); }
      else if (mv > 0.6) { this.stampWear(focus.x, focus.z, 0.8, 5); this.footprint(focus.x, focus.z, false, Math.atan2(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z)); this.lastFoot.copy(focus); }
    } else if (focus) (this.lastFoot || (this.lastFoot = new THREE.Vector3())).copy(focus);
    this.wearT = (this.wearT || 0) + dt;
    if (this.wearDirty && this.wearT > 0.5) { this.wearT = 0; this.wearDirty = 0; this.wearTex.needsUpdate = true; }
    this.updateHaze(dt, focus);
    if (this.haze) this.haze.mesh.material.uniforms.color.value.set(this.timeKey === 'night' ? 0x3a4250 : this.timeKey === 'dusk' ? 0xcbb4a0 : this.timeKey === 'storm' ? 0x9a9e9e : 0xd4d2cc);
    if (this.dustVeil) this.dustVeil.mesh.material.uniforms.color.value.set(this.timeKey === 'dusk' ? 0xb08a68 : 0xa89878);
    // 稲光（豪雨のとき）
    if (this.def.lightning && this.rainLevel > 0.7) {
      this.boltT = (this.boltT ?? 6) - dt;
      // 落ちた所の遠さ（m）を決める。近い稲光ほど明るく、雷鳴は音の速さの分だけ遅れて届く（1km で 3 秒）
      if (this.boltT <= 0) { this.boltT = 8 + Math.random() * 9; this.flashT = 0.35; this.boltD = 350 + Math.random() * Math.random() * 2800; this.showBolt(focus); if (this.onBolt) this.onBolt(this.boltD); }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.35) * (Math.random() < 0.7 ? 1 : 0.3) * Math.min(1.25, 0.45 + 450 / (this.boltD || 900));
      this.skyMat.uniforms.flash.value = f * 0.6;
      this.hemi.intensity = (this.baseHemi || this.hemi.intensity) + f * 2.2;
      // 地面と人が一瞬、青白く照らされる
      if (!this.hemiCol0) this.hemiCol0 = this.hemi.color.clone();
      this.hemi.color.copy(this.hemiCol0).lerp(BOLT_COL, Math.min(1, f * 0.8));
      // 稲妻の線は最初の 0.1 秒ほどだけ（二度ちらつく）
      if (this.bolt) { const t = 0.35 - this.flashT; this.bolt.visible = t < 0.06 || (t > 0.09 && t < 0.14); }
    } else if (this.skyMat.uniforms.flash.value) {
      this.skyMat.uniforms.flash.value = 0; this.hemi.intensity = this.baseHemi;
      if (this.hemiCol0) { this.hemi.color.copy(this.hemiCol0); this.hemiCol0 = null; }
      if (this.bolt) this.bolt.visible = false;
    }
    // 遠景の軍勢がゆっくり揺れる
    // 遠景の軍勢：兵の動きは形の側。ここでは進む・退く・崩れる・付いて歩くを進める
    for (const a of this.armies || []) { a.mesh.position.x = a.x0; if (a.tick) a.tick(dt); }
    // 軽い大軍の合戦（前線の押し合い・討たれる者・崩れ）と、その矢
    for (const c of this.clashes || []) c.tick(dt, focus);
    this.updateClashArrows(dt);
    this.shyTick(dt, focus);
    this.sky.position.set(focus.x, 0, focus.z);
    this.mountains.position.set(focus.x, 0, focus.z);
    this.skyMat.uniforms.time.value = this.time;
    this.skyMat.uniforms.lowDetail.value = SETTINGS.quality === 'low' ? 1 : 0;
    this.updateNearGrass(focus);
    this.updateBirds(dt, focus);
    if (this.waterTex && !SETTINGS.reduceMotion) { this.waterTex.offset.y += dt * 0.03; }
    // 雨で地面が濡れて暗くなる
    // 雨で地面が濡れて暗く、少し光る。雨が止んでもしばらく濡れたまま
    this.wetness = Math.max(this.rainLevel, (this.wetness || (this.def.wetStart || 0)) - dt * 0.004);
    this.groundU.uWet.value = this.wetness;
    this.groundU.uSoilRain.value = this.rainLevel;
    WET.value = this.wetness;
    if (this.onWet) this.onWet(this.wetness);
    // 炎の揺らめき
    if (FLAME_MAT) { FLAME_U.uNight.value = this.timeKey === 'night' ? 1 : this.timeKey === 'dusk' ? 0.5 : 0; FLAME_U.uT.value = this.time; FLAME_U.uWind.value.set(WIND_STATE.dirX * WIND_STATE.gust, WIND_STATE.dirZ * WIND_STATE.gust); }
    for (const f of this.fires) {
      if (!f.lit) { if (f.light) f.light.intensity = 0; continue; }
      const k = 0.85 + Math.sin(this.time * 13 + f.seed) * 0.1 + Math.sin(this.time * 7.3 + f.seed * 2) * 0.08;
      // 揺らめき：形の揺れは板の中（flameMat）。ここは大きさの息づき（ゆっくり伸び縮み）だけ
      f.flame.scale.set(f.size * 0.95 * (0.94 + Math.sin(this.time * 2.1 + f.seed) * 0.05), f.size * 1.3 * (0.9 + (k - 0.85) * 0.8), 1);
      f.inner.scale.set(f.size * 0.6, f.size * 0.85 * (0.85 + k * 0.2), 1);
      f.flame.position.y = f.base + (k - 0.85) * f.size * 0.15;
      if (f.light) f.light.intensity = (f.big || f.nightOnly || this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 1 : 0;
      // 距離で弱まる点光源は炎だけ見えていた。近い人の具足にも暖色を返す。
      // 光の枠は低で二つのまま、範囲や影の描画は増やさない。
      if (f.light && f.light.intensity > 0) f.light.intensity = (f.big && !(this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 0.9 : f.big ? 7 : f.torch ? 4 : 5) + k * 0.5 * (f.big ? 1.6 : 1);
      if (f.light) f.light.intensity *= this.def.fireLightLift || 1;
      if (f.glow) f.glow.material.opacity = (this.timeKey === 'night' ? 0.5 : this.timeKey === 'dusk' || this.timeKey === 'storm' ? 0.34 : 0.1) * (0.8 + k * 0.25);
    }
    this.updateEmbers(dt, focus);
    // 火の音：近くの火のはぜる音と、遠くの大きな火の低い唸り（audio の ambience が鳴らす）
    {
      let near = 0, far = 0;
      for (const f of this.fires) {
        if (!f.lit) continue;
        const d = Math.hypot(f.x - focus.x, f.z - focus.z), sz = f.size || 1;
        near = Math.max(near, Math.min(1, sz / 1.3) * (1 - Math.min(1, d / (8 + sz * 4))));
        if (sz >= 2) far = Math.max(far, Math.min(1, sz / 4) * (1 - Math.min(1, d / 120)));
      }
      setScene({ fire: near, fireFar: far, wet: this.wetness || 0 });
      this.updatePall(dt, focus);
    }
    // 土ぼこりと泥はね
    this.updatePuffs(this.dustP, dt, 0);
    this.updatePuffs(this.mudP, dt, 9);
    this.updatePuffs(this.sprayP, dt, 9);
    // 影の範囲をプレイヤー周辺に追従
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    // 雨量を緩やかに変化
    this.rainLevel += (this.targetRain - this.rainLevel) * Math.min(1, dt * 0.4);
    const r = this.rainLevel;
    // 見通し：時間帯の見通しに、戦ごとの霧の遠さ・描画距離の設定・雨・朝靄・硝煙を掛ける
    const L = this.look || TIME.day;
    let vis = L.vis * ((this.def.fogFar || 230) / 230) * (this.distMul || 1);
    // 朝靄：戦の始めは霧が深く、一分ほどでしだいに晴れる（晴れても薄い靄は残る）
    const morningMist = this.dayClock ? this.dayClock.mist : 1;
    const mist = this.def.mist ? (this.dayClock ? morningMist : Math.max(0, 1 - this.time / 60)) : 0;
    vis = vis + (95 - vis) * mist * mist * (3 - 2 * mist) * 0.9;
    // 雨は遠くを白く隠す。昼の雨は霞を遠くに置き、近い兵の顔・具足・旗の色を残す（夜の雨は闇と合わせて狭いまま）
    vis = vis + ((this.timeKey === 'night' ? 112 : 220) - vis) * r;
    if (this.def.snow) vis *= 1 - this.def.snow * 0.25;
    const smoke = Math.min(1, (this.haze?.k || 0) + (this.dustVeil?.k || 0));
    vis += (Math.min(vis, 18) - vis) * smoke;
    // 戦ごとの霧の遠さや描画距離を上げても、夜の遠景は闇に沈める。移ろい中は徐々に狭める。
    if (this.timeKey === 'night') {
      const k = this.fade ? Math.min(1, this.fade.t / this.fade.dur) : 1;
      const s = k * k * (3 - 2 * k);
      vis += (Math.min(vis, TIME.night.vis) - vis) * s;
    }
    this.vis = vis;
    // 遠くの軍勢の陽炎：晴れて乾いた昼・午後ほど強く、雨・朝靄・夕暮れでは弱い
    const hot = L === TIME.day || L === TIME.after ? 1 : L === TIME.morning ? 0.4 : 0.2;
    SHIMMER.value = hot * (1 - r) * (1 - mist) * (1 - Math.min(1, (this.wetness || 0) * 1.5));
    // 雲の影は、雨・画質「低」では無し
    const cloud = Math.min(0.95, (L.cloud || 0) * (1 - r) * (SETTINGS.quality === 'low' ? 0 : 1));
    this.scene.fog.near = this.cloudPhase;
    this.scene.fog.far = Math.floor(Math.max(20, vis)) + Math.max(0, Math.min(0.95, cloud));
    // 遠景の山の霞を、霧の式に合わせる
    this.mountU.hazeCol.value.copy(this.scene.fog.color);
    this.mountU.mist.value = Math.max(mist, r, this.mood === 'morning' ? 0.35 * morningMist : 0);
    this.mountU.vis.value = vis; this.mountU.rain.value = r;
    // 遠い層ほど少なくともこれだけは霞む（晴れた日でも遠い峰は青く抜ける）
    // 雨の日は日の光が弱い（雨の強さで絞る。戦の側が直に入れた値にも掛け算で重ねる）
    { const dim = 1 - r * 0.4; if (Math.abs(dim - (this.rainDim || 1)) > 1e-4) { this.sun.intensity *= dim / (this.rainDim || 1); this.rainDim = dim; } }
    this.skyMat.uniforms.rain.value = r;
    // 朝焼け・夕焼けの移ろい：夕暮れは時が経つほど橙から紅へ深まる。朝は紅から金へ褪せる
    if (this.timeKey === 'dusk') this.duskT = (this.duskT || 0) + dt; else this.duskT = 0;
    const age = this.timeKey === 'dusk' ? (this.dayClock ? Math.max(0, Math.min(1, (this.dayClock.hour - 16) / 2)) : Math.min(1, this.duskT / 300)) : this.mood === 'morning' && this.timeKey === 'day' ? (this.dayClock ? 0.7 * morningMist : Math.max(0, 0.7 - (this.time || 0) / 300)) : 0;
    this.skyMat.uniforms.age.value += (age - this.skyMat.uniforms.age.value) * Math.min(1, dt * 0.5);
    // 霧の中の光の筋：朝靄・朝・雨上がりに、日の差す向きへ斜めの光の帯（雨と嵐では無し）
    {
      const after = this.timeKey === 'after' ? Math.max(0, 1 - (this.afterT || 0) / 150) * 0.8 : 0;
      const sm = Math.max(mist, this.def.mist ? 0.35 * morningMist : 0, this.mood === 'morning' && this.timeKey === 'day' ? 0.45 * morningMist : 0, after, this.timeKey === 'dusk' ? 0.25 : 0);
      this.updateShafts(sm * (1 - r) * (this.timeKey === 'storm' ? 0 : 1), focus);
    }
    for (const m of this.mountains.children) m.material.uniforms.haze.value = Math.min(0.9, 0.2 + m.material.uniforms.layer.value * 0.17);
    this.updateHail(dt, focus, r);
    if (this.def.snow && r <= 0.03) { this.updateSnow(dt, focus); return; }
    this.rain.visible = r > 0.03;
    if (!this.rain.visible) { this.splashPts.visible = false; this.rainNear.visible = false; return; }
    if (this.def.snow) {
      this.rain.material.color.setHex(0xc9d2d6);
      this.rain.geometry.setDrawRange(0, this.rainData.length / 3 * 2);
    }
    this.rain.material.opacity = 0.24 * r;
    const arr = this.rain.geometry.attributes.position.array;
    const d = this.rainData;
    const N = d.length / 3;
    const count = Math.floor(N * r);
    this.rain.geometry.setDrawRange(0, count * 2);
    // 雨筋は風下へ斜めに流れ、突風で強く傾く。粒ごとに速さと長さが違う（近い粒ほど長い筋に見える）
    // 戦ごとに雨の吹く向きを決められる（def.rainDir：[x, z]。桶狭間は織田の背から今川の顔へ）
    const RD = this.def.rainDir, rdx = RD ? RD[0] : WIND_STATE.dirX, rdz = RD ? RD[1] : WIND_STATE.dirZ;
    const wk = (RD ? 4.5 : 2.5) + WIND_STATE.gust * 4.5, wdx = rdx * wk, wdz = rdz * wk;
    for (let i = 0; i < N; i++) {
      const sp = 24 + (i % 7) * 1.6;
      d[i * 3 + 1] -= dt * sp;
      d[i * 3] += dt * wdx; d[i * 3 + 2] += dt * wdz;
      if (d[i * 3 + 1] < 0) { d[i * 3 + 1] += 30; d[i * 3] = (Math.random() - 0.5) * 70; d[i * 3 + 2] = (Math.random() - 0.5) * 70; }
      if (i >= count) continue;
      const x = focus.x + d[i * 3], y = focus.y - 6 + d[i * 3 + 1], z = focus.z + d[i * 3 + 2];
      const o = i * 6;
      const len = 0.025 * (0.7 + (i % 5) * 0.15);
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x - wdx * len; arr[o + 4] = y + sp * len; arr[o + 5] = z - wdz * len;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.updateNearRain(dt, r, wdx, wdz);
    // 跳ね：足もと20mほどの地面に、雨の強さに応じて
    this.splashPts.visible = true;
    const sp = this.splash, SN = this.splashT.length, SL = this.splashLine;
    for (let i = 0; i < SN; i++) {
      this.splashT[i] -= dt;
      if (this.splashT[i] <= 0) {
        if (Math.random() > r) { sp[i * 3 + 1] = -999; this.splashT[i] = 0.1; }
        else {
          const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 20;
          const x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
          sp[i * 3] = x; sp[i * 3 + 1] = this.heightAt(x, z) + this.waterDepthAt(x, z) + 0.02; sp[i * 3 + 2] = z;
          this.splashT[i] = 0.08 + Math.random() * 0.12;
        }
      }
      // 冠は跳ねた直後に開き、すぐ消える
      const k = 1 - Math.max(0, this.splashT[i]) / 0.2, x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2];
      for (let q = 0; q < 3; q++) {
        const a = q * 2.09 + i, o = i * 18 + q * 6, rr = 0.03 + k * 0.05;
        SL[o] = x + Math.cos(a) * 0.015; SL[o + 1] = y; SL[o + 2] = z + Math.sin(a) * 0.015;
        SL[o + 3] = x + Math.cos(a) * rr; SL[o + 4] = y + 0.04 + k * 0.05; SL[o + 5] = z + Math.sin(a) * rr;
      }
    }
    this.splashPts.geometry.attributes.position.needsUpdate = true;
  }
}
