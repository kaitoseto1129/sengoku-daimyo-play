import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { trimGeneratedTex } from './generated_tex.js';
import { flagTexture, jinmakuTexture, yoseFlagTexture, yoseFlagKinds } from './textures.js';
import { grassTex, dirtTex, bankTex, mudTex, stoneTex, gravelTex, macroTex, barkTex, leafTex, thatchTex, alphaTex } from './nature.js';
import { POST } from './post.js';
import { setScene } from './audio.js';
import { fieldState } from './world_fields.js';
import { jinkeiSlot } from './jinkei.js';
import { BattleTime } from './battle_time.js';
import { smokeDepth } from './wind_smoke.js';
import { groundAt } from './floors.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { terrainView } from './terrain_view.js';
import { guardDrawCamera } from './render_camera.js';
import { ArmyBatch } from './army_batch.js';

// 結合先は独立した配列を持つ。使い終えた元の部品は絵の仕組みに保持させない。
function mergeVegetationParts(parts) {
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  parts.length = 0;
  return merged;
}

// 地形・植生・天候・時間帯
export const HALF = 180;
const SEG = 144;
const NO_STREAMS = [];
// 残り火の照明は視点の周囲128mを64角の升へ焼く。頂点ごとに一度だけ読み、兵の束も同じ材質で照らす。
const FIRE_FILL = { map: { value: null }, area: { value: new THREE.Vector3() } };
const FIRE_FILL_MATS = new WeakSet();
function fireFillMaterial(mat) {
  if (!mat || FIRE_FILL_MATS.has(mat) || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
  FIRE_FILL_MATS.add(mat);
  const before = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = function (sh, renderer) {
    before.call(this, sh, renderer);
    // 濡れ・倒れなどの派生材質は元の処理も呼ぶ。材質が別でも、同じ絵へ火を二度足さない。
    if (sh.uniforms.uFireFill === FIRE_FILL.map) return;
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <opaque_fragment>')) return;
    sh.uniforms.uFireFill = FIRE_FILL.map; sh.uniforms.uFireArea = FIRE_FILL.area;
    sh.vertexShader = 'uniform sampler2D uFireFill; uniform vec3 uFireArea; varying float vFireFill;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec3 fireWorld = vec3(dot(viewMatrix[0].xyz, mvPosition.xyz), dot(viewMatrix[1].xyz, mvPosition.xyz), dot(viewMatrix[2].xyz, mvPosition.xyz)) + cameraPosition;
      vec2 fireUV = (fireWorld.xz - uFireArea.xy) / 128.0;
      vFireFill = 0.0;
      if (uFireArea.z > 0.0 && all(greaterThanEqual(fireUV, vec2(0.0))) && all(lessThan(fireUV, vec2(1.0)))) {
        vec4 fireSource = texture2D(uFireFill, fireUV);
        if (fireSource.w > 0.0) {
          vec3 fireDelta = (viewMatrix * vec4(fireSource.xyz, 1.0)).xyz - mvPosition.xyz;
          float fireDistance = length(fireDelta);
          float fireReach = max(0.0, 1.0 - fireDistance / fireSource.w);
          vFireFill = fireReach * fireReach * (0.12 + 0.88 * max(0.0, dot(normalize(transformedNormal), fireDelta / max(0.01, fireDistance)))) * uFireArea.z;
        }
      }`);
    sh.fragmentShader = 'varying float vFireFill;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vec3(1.0, 0.32, 0.08) * vFireFill;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key + '|fire-fill';
  mat.needsUpdate = true;
}
function fireFillObject(o) {
  if (Array.isArray(o.material)) { for (const mat of o.material) fireFillMaterial(mat); }
  else fireFillMaterial(o.material);
}
export function isNoRender() {
  return typeof window !== 'undefined' && (window.__norender === true ||
    typeof location !== 'undefined' && /[?&]norender\b/.test(location.search));
}

// 山道の全区間を兵ごとにたどらず、足もとの十二メートルの升だけを見る。
// 幅を含む囲みを登録するので、曲がり角・道の端・石段の境目も元の距離判定で拾える。
const roadGrids = new WeakMap(), NO_ROADS = [];
const roadKey = (x, z) => (x + 20000) * 40000 + z + 20000;
export function roadTag(world, x, z) {
  const paths = world.def.paths;
  if (!paths?.length) return '';
  let G = roadGrids.get(world);
  if (!G || G.paths !== paths || G.n !== paths.length || G.width !== world.def.pathWidth) {
    G = { paths, n: paths.length, width: world.def.pathWidth, cells: new Map(), wide: [] };
    for (let order = 0; order < paths.length; order++) {
      const p = paths[order], pts = p?.pts || p, w = p.w ?? world.def.pathWidth ?? 2;
      if (!pts || !(w > 0)) continue;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const dx = bx - ax, dz = bz - az;
        const s = { ax, az, dx, dz, l2: dx * dx + dz * dz || 1, w2: w * w, order,
          tag: p.stairs || p.kind === 'stairs' ? 'stairs' : 'path' };
        if (!Number.isFinite(w)) { G.wide.push(s); continue; }
        for (let ix = Math.floor((Math.min(ax, bx) - w) / 12); ix <= Math.floor((Math.max(ax, bx) + w) / 12); ix++) {
          for (let iz = Math.floor((Math.min(az, bz) - w) / 12); iz <= Math.floor((Math.max(az, bz) + w) / 12); iz++) {
            const k = roadKey(ix, iz);
            let cell = G.cells.get(k);
            if (!cell) G.cells.set(k, cell = []);
            cell.push(s);
          }
        }
      }
    }
    roadGrids.set(world, G);
  }
  let best = 1, order = Infinity, tag = '';
  const near = G.cells.get(roadKey(Math.floor(x / 12), Math.floor(z / 12))) || NO_ROADS;
  for (let j = 0; j < 2; j++) {
    const list = j ? G.wide : near;
    for (const s of list) {
      const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2));
      const dx = s.ax + s.dx * t - x, dz = s.az + s.dz * t - z;
      const d = (dx * dx + dz * dz) / s.w2;
      if (d < best || d === best && d < 1 && s.order < order) { best = d; order = s.order; tag = s.tag; }
    }
  }
  return tag;
}
// 旗の模様を保った薄い月の照り返し。霧と色の仕上げは通常どおり通す。
export const FLAG_MOON = { value: 0 };
export function flagMoonlight(sh, night = FLAG_MOON) {
  sh.uniforms.uFlagMoon = night;
  sh.fragmentShader = 'uniform float uFlagMoon;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    'outgoingLight += diffuseColor.rgb * vec3(0.55, 0.7, 0.95) * uFlagMoon * 0.08;\n#include <opaque_fragment>');
}
const TUFT_AUTUMN = new THREE.Color(0.5, 0.44, 0.27);   // 秋の草むらの枯れ色
// 近い草と遠い草で同じ群落を使う。場所だけで決まり、歩いても斑が動かない。
function tuftClumpAt(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.061 + Math.sin(z * 0.047) * 1.7) * Math.cos(z * 0.058 - x * 0.021);
}

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
  day: { sky: 0xb9c9ce, fog: 0xa4b5bc, sun: 0xfff0d8, sunI: 2.3, hemiSky: 0xbfccd6, hemiGround: 0x4a4432, hemiI: 1.0, sunPos: [70, 72, -50], vis: 900, cloud: 0.5, top: 0x527fa9, cover: 0.15, glowK: 0 },
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

// 柔らかい影の参照回数はそのまま、天気に応じて参照の間隔だけ広げる。
// 元の画素の端数を保ち、太陽が動いても粗い格子へ影を吸着させない。
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
  /(#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)\s+vec2 texelSize = )vec2\( 1\.0 \)/,
  '$1vec2( max(1.0, shadowRadius) )');

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
  // 終点の高さだけでなく、目から物まで通る空気の平均密度。
  // 坂下を一枚の白膜で覆わず、登りの途中にも薄い霞を残す。
  float fogY = clamp(vFogOff.y, -30.0, 120.0) * 0.024;
  float fogHf = abs(fogY) < 0.01 ? 1.0 - fogY * 0.5 : (1.0 - exp(-fogY)) / fogY;
  // 近い兵と具足の暗部は保ち、中景から霞を積む。遠くの見通しは伸ばさない。
  float fogPath = fogD * mix(0.12, 1.0, smoothstep(6.0, 42.0, fogD));
  float fogFactor = 1.0 - exp(-fogPath / fogVis * 1.9 * fogHf);
  vec3 fogC = fogColor;
  float fogTowardSun = 0.0;
  #if defined(LIT_PARS) && NUM_DIR_LIGHTS > 0
   // 日の方角の霞は、日の色に明るむ
   vec3 fogSun = normalize(transpose(mat3(viewMatrix)) * directionalLights[0].direction);
   float fogSd = max(dot(vFogOff / max(fogD, 0.001), fogSun), 0.0);
   fogTowardSun = fogSd * fogSd;
   // 日の方は明るむ（強い輪と、広く淡い明るみの二つ。逆光の霞が光る）
   fogC += directionalLights[0].color * (pow(fogSd, 6.0) * 0.04 + pow(fogSd, 2.0) * 0.016);
  #endif
  // 遠いほど空の青を帯びる（遠くの森や村が青く霞む）
  fogC = mix(fogC, fogC * vec3(0.9, 0.97, 1.08), smoothstep(60.0, 380.0, fogD) * (1.0 - fogTowardSun * 0.65));
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
  const y = Math.max(-30, Math.min(120, dy)) * 0.024;
  const hf = Math.abs(y) < 0.01 ? 1 - y * 0.5 : (1 - Math.exp(-y)) / y;
  const k = Math.max(0, Math.min(1, (dist - 6) / 36));
  const path = dist * (0.12 + 0.88 * k * k * (3 - 2 * k));
  return 1 - Math.exp(-path / Math.max(20, vis) * 1.9 * hf);
}

// 風：向きはそろえ、強さはときどき変わる（突風が野を渡る）。旗や草が同じ風を使う
export const WIND_STATE = { t: 0, gust: 1, dirX: 0.565, dirZ: 0.825 };
export const GUST = { value: 1 };
export const WIND_DIR = { value: new THREE.Vector2(0.565, 0.825) };
// 濡れ具合（0〜1）：雨の中の旗は色が濃く、重く垂れる
export const WET = { value: 0 };
const BOLT_COL = new THREE.Color(0xc8d6ff);
const PALL_COL = new THREE.Color(0x9a7c5e);
const SUN_AXIS = new THREE.Vector3(0, 1, 0);

// 風で揺れる草木（頂点をずらす）
// 突風は風下へ波のように野を渡る。草は風下へ傾き、踏み荒らされた所では倒れている
const WIND = { value: 0 };
const WEAR = { value: null };
const WEAR_HALF = { value: HALF };
// 炎：二枚以上の舌を重ね、上へ流れる揺らぎで輪郭を崩す。縦は立てたままカメラへ向く
//   材質と形は全ての火で一つ（毎コマ new しない）。火ごとの違いは置き場所から作る種で出す
const FLAME_U = { uNight: { value: 0 }, uT: { value: 0 }, uWind: { value: new THREE.Vector2() }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 600 } };
let FLAME_MAT = null, FLAME_CORE_MAT = null, FLAME_GEO = null;
const FLAME_LIKE = new WeakMap();
let ROUND_FLAME_MAT = null, ROUND_FLAME_CORE = null;
function flameMat() {
  if (FLAME_MAT) return FLAME_MAT;
  FLAME_GEO = new THREE.PlaneGeometry(1, 1, 2, 10);
  FLAME_MAT = new THREE.ShaderMaterial({
    uniforms: FLAME_U, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true,
    vertexShader: `uniform vec2 uWind; uniform float uT; varying vec2 vUv; varying float vSeed; varying float vDist;
      void main() {
        vUv = uv;
        mat4 flameWorld = modelMatrix;
        #ifdef USE_INSTANCING
          flameWorld = modelMatrix * instanceMatrix;
        #endif
        vec3 c = flameWorld[3].xyz;
        float sx = length(flameWorld[0].xyz), sy = length(flameWorld[1].xyz);
        vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
        vSeed = fract(sin(dot(c.xz, vec2(12.9898, 78.233)) + sx * 3.7) * 43758.5453);
        float h = position.y + 0.5;
        float sway = (sin(uT * 2.3 + vSeed * 31.0 + h * 5.0) * 0.13 + sin(uT * 3.7 + h * 9.0 + vSeed * 17.0) * 0.05) * h * h;
        float width = mix(1.0, 0.025, h * h);
        vec3 wp = c + r * (position.x * width + sway) * sx + vec3(0.0, position.y * sy, 0.0) + vec3(uWind.x, 0.0, uWind.y) * h * h * sy * 0.22;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uT; uniform float uNight; uniform float uCore; uniform float fogFar; varying vec2 vUv; varying float vSeed; varying float vDist;
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
        float w = mix(0.43, 0.28, uv.y) * (0.8 + n * 0.4);
        float body = 1.0 - smoothstep(w * 0.45, w, abs(x));
        float top = 1.0 - smoothstep(0.3, 0.95, uv.y + (n - 0.5) * 0.6);
        float f = body * top * smoothstep(0.0, 0.1, uv.y) * (0.65 + n * 0.35);
        // 外は暗い赤、中は橙、根元の芯は黄白
        float core = smoothstep(0.55, 0.85, f) * (1.0 - smoothstep(0.15, 0.55, uv.y));
        vec3 col = mix(vec3(0.5, 0.08, 0.01), vec3(1.0, 0.42, 0.07), smoothstep(0.2, 0.78, f));
        col = mix(col, vec3(1.0, 0.85, 0.24), max(core, uCore * (1.0 - uv.y * 0.65)));
        // 加算で芯を白く飛ばさず、遠い火は霞に沈める
        float reach = mix(max(20.0, floor(fogFar)), max(260.0, floor(fogFar)), uNight);
        // 目の前の松明で視界を白く埋めない。火の当たりと明かりは保つ。
        float a = f * exp(-vDist / reach * 1.1) * smoothstep(0.5, 3.5, vDist);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  FLAME_MAT.uniforms.uCore = { value: 0 };
  FLAME_CORE_MAT = FLAME_MAT.clone();
  FLAME_CORE_MAT.uniforms = { ...FLAME_U, uCore: { value: 1 } };
  return FLAME_MAT;
}
// 遠景の大軍の、待つ間の小さな動き（体の揺れ・見回し・隊の中の入れ替わり）の強さ。見比べる時は 0 に
export const ARMY_IDLE = { value: 1 };
// 数の多い草木・岩の材質：画質「低」「中」は影の計算が軽い Lambert にする（GPU の陰影計算を節約）。
// 「高」は今まで通り Standard（艶・環境の映り込みを保つ）。Lambert が持たない値は渡さない
function liteMat(opts) {
  return new THREE.MeshStandardMaterial(opts);
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
      // 隣り合う株は同じ波で倒れ、小さな揺れだけ株ごとにずらす。
      float ph = dot(wpos, uWindDir) * 0.12 + dot(wpos, vec2(-uWindDir.y, uWindDir.x)) * 0.025;
      float k = max(0.0, position.y - ${minY.toFixed(2)});
      // 突風の波：風の向きに進む帯
      float gw = uGust * (0.3 + 0.7 * smoothstep(-0.3, 0.9, sin(dot(wpos, uWindDir) * 0.075 - uWind * 1.2 + sin(dot(wpos, vec2(-uWindDir.y, uWindDir.x)) * 0.035) * 0.6)));
      ${o.wear ? `float wr = texture2D(tWear, (wpos + uWearHalf) / (uWearHalf * 2.0)).r;
      transformed.y *= 1.0 - wr * 0.72;
      k *= 1.0 - wr * 0.8;
      transformed.xz += uWindDir * max(0.0, position.y) * wr * 0.3;` : ''}
      ${minY === 0 ? 'k *= k / (k + 0.35); // 根元は動かさず、葉先ほどしなる' : ''}
      vec3 swayOff = vec3(uWindDir.x, 0.0, uWindDir.y) * (0.35 + 0.65 * gw) * gw * ${(amp * 1.1).toFixed(3)} * k;
      swayOff.xz += uWindDir * sin(uWind * 1.6 + ph) * ${(amp * 0.25).toFixed(3)} * k * gw;
      // 株の中でも葉先の位相をずらす。共通の突風は保ち、板全体の往復を避ける。
      swayOff.xz += vec2(-uWindDir.y, uWindDir.x) * cos(uWind * 1.3 + ph * 1.3 + position.x * 1.7 + position.z * 2.1) * ${(amp * 0.15).toFixed(3)} * k * gw;`)
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
// 葉の芯は負の絵の座標で区別する。同じ束で描き、影にも穴を開けない。
function treeLeafMap(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
    #ifdef USE_MAP
      if (vMapUv.x < 0.0 && vMapUv.y < 0.0) {
        diffuseColor.rgb *= vec3(0.04, 0.07, 0.025);
      } else {
        #include <map_fragment>
      }
    #endif`);
}
function leafLit(sh) {
  treeLeafMap(sh);
  keepAlpha(sh);
  // カメラのすぐ前の葉は抜く（木の脇を通ると、葉の板が画面いっぱいの黒い影になっていた。10/2 森部の開戦）
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(1.5, 4.5, length(vViewPosition));\n#include <alphatest_fragment>');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    #if NUM_DIR_LIGHTS > 0
      float lback = pow(max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0), 4.0);
      reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * lback * 0.35;
    #endif`);
}
// 葉の板は読み込み時だけ作る。遠景は頂点処理でカメラへ向け、毎コマの向き直しを省く。
function treeTriangles(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
// 戦ごとの寸法は共有形へ読み込み時に一度だけ反映する。高さと枝張りを別々に保つ。
function scaleTreePart(g, scale, foliage = false) {
  if (!scale) return g;
  const width = (foliage ? scale.crown : scale.trunk) ?? 1;
  g.scale(width, scale.height ?? 1, width);
  return g;
}
function treeCards(width, height, y, count = 3) {
  const parts = [];
  for (let j = 0; j < count; j++) {
    const g = new THREE.PlaneGeometry(width, height);
    g.rotateY(j * Math.PI / 3); g.translate(0, y, 0);
    const p = g.attributes.position, n = g.attributes.normal, colors = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      n.setXYZ(k, p.getX(k) / width, 0.8, p.getZ(k) / width);
      const light = 0.78 + (p.getY(k) - y + height / 2) / height * 0.22;
      colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = light;
    }
    g.normalizeNormals(); g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('treePlane', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(j), 1));
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const result = merged.toNonIndexed(); merged.dispose();
  return result;
}
function treeCardVertex(sh, far = false) {
  sh.vertexShader = 'attribute float treePlane;\n' + sh.vertexShader;
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
      mat4 treeWorld = modelMatrix * instanceMatrix;
      vec3 toEye = cameraPosition - treeWorld[3].xyz;
      if (uv.x >= 0.0 && ${far ? 'true' : 'dot(toEye, toEye) > 3025.0'}) {
        vec2 facing = vec2(dot(toEye, normalize(treeWorld[0].xyz)), dot(toEye, normalize(treeWorld[2].xyz)));
        facing /= max(length(facing), 0.001);
        transformed.xz = vec2(facing.y, -facing.x) * position.x;
        // 同じ描画束のまま遠くは一枚。余る二枚は面積ゼロに畳み、更新も描画回数も増やさない。
        if (treePlane > 0.5) transformed = vec3(0.0);
      }
    #endif`);
}
function nearTreeLit(sh) { leafLit(sh); treeCardVertex(sh); }
function farTreeLit(sh) { leafLit(sh); treeCardVertex(sh, true); }
function treeCardDepth(sh) { treeLeafMap(sh); treeCardVertex(sh); }
const treeTextureKind = { sugi: 'treeCedar', matsu: 'treePine', broad: 'treeBroad', take: 'treeBamboo' };
// 草の抜き：遠くの株は細って消える（遠目の野は地面の絵に任せる。遠くの株が黒い点々に見えないように）
// 近くは細かな葉を残し、遠くは縮小した絵へ戻す。細い葉が白い点としてちらつくのを防ぐ。
function grassAlpha(sh, fade = true) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `#ifdef USE_MAP
      float grassMip = mix(-0.75, 0.0, smoothstep(8.0, 32.0, length(vViewPosition)));
      diffuseColor.a = texture2D(map, vMapUv, grassMip).a * opacity;
    #endif
    ${fade ? 'diffuseColor.a *= 1.0 - smoothstep(24.0, 48.0, length(vViewPosition));' : ''}
    #include <alphatest_fragment>`);
}
function grassLit(sh, fade = true, dryTips = true) {
  grassAlpha(sh, fade);
  // 葉先：置く所の緑を掛けると先まで青みの薄荷色になるので、先ほど黄みの枯れ色へ寄せ、根元は濃く沈める
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
    ${dryTips ? `// 株ごとの緑・枯れ色は後の頂点色で付く。材質にも暗い色を掛けると
    // 月夜の草が黒い針になるため、材質色の明るさだけ下限を設ける。
    // 色の比率と実際の照明は保ち、葉や影を自ら光らせない。
    float grassTintPeak = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
    diffuseColor.rgb *= max(1.0, 0.55 / max(grassTintPeak, 0.001));` : ''}
    #include <map_fragment>
    #ifdef USE_MAP
    {
      float gy = vMapUv.y, gl = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
      diffuseColor.rgb = mix(diffuseColor.rgb, gl * vec3(1.12, 1.02, 0.75), smoothstep(0.65, 0.98, gy) * ${dryTips ? '0.18' : '0.0'});
      diffuseColor.rgb *= mix(${dryTips ? '0.6' : '0.72'}, 1.0, smoothstep(0.0, 0.4, gy));
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
      reflectedLight.indirectDiffuse *= mix(${dryTips ? '0.55, 1.08' : '1.1475, 1.35'}, rootK);
      reflectedLight.directDiffuse *= mix(${dryTips ? '0.6' : '0.75'}, 1.0, rootK);
    }
    #endif`);
}
// 苗も裏面の法線と空の光を草にそろえる。若い苗の先は枯れ色にしない。
function riceLit(sh) { grassLit(sh, false, false); }

// 水面のさざ波：流れに沿って動く二枚の濃淡から面の向きを揺らし、空の映り込みを細かく砕く（のっぺりした一枚の板に見えないように）
export function rippleWater(mat, fx, fz, amt = 3.5, sky = null, localFlow = false, banks = null, fireReflections = null, sediment = false) {
  // 濁った川は水面で深さを書き、浸かった脚を水の線で隠す。
  mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
  const lowWater = false;
  // 流れの向きごとに別の作り（同じ字面の関数だと、先の川の向きが使い回される）
  mat.customProgramCacheKey = () => `ripple|${fx.toFixed(3)}|${fz.toFixed(3)}|${amt}|${localFlow}|${!!banks}|${lowWater}|${!!fireReflections}|${sediment}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tMacro = { value: macroTex() };
    sh.uniforms.uTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } };
    sh.uniforms.uWaterSky = { value: sky || new THREE.Color(0x71838b) };
    if (banks) sh.uniforms.uWaterBanks = { value: banks };
    if (fireReflections) sh.uniforms.uWaterFires = { value: fireReflections };
    sh.vertexShader = 'varying vec3 vWPw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (localFlow) sh.vertexShader = 'attribute vec2 waterFlow; varying vec2 vWaterFlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterFlow = waterFlow;');
    sh.fragmentShader = 'uniform sampler2D tMacro; uniform float uTime; uniform vec3 uWaterSky; varying vec3 vWPw;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 fl = ${localFlow ? 'normalize(vWaterFlow + vec2(0.00001))' : `vec2(${fx.toFixed(3)}, ${fz.toFixed(3)})`};
        vec2 q1 = vWPw.xz * vec2(0.3, 0.3) - fl * uTime * 0.09;
        vec2 q2 = vWPw.xz * vec2(0.8, 0.8) - (${sediment ? 'fl * uTime * 0.18' : 'fl.yx * uTime * 0.03 + fl * uTime * 0.15'});
        float e = 0.02;
        float h0 = texture2D(tMacro, q1).r ${lowWater ? '' : '+ texture2D(tMacro, q2).r * 0.5'};
        float hx = texture2D(tMacro, q1 + vec2(e, 0.0)).r ${lowWater ? '' : '+ texture2D(tMacro, q2 + vec2(e, 0.0)).r * 0.5'};
        float hz = texture2D(tMacro, q1 + vec2(0.0, e)).r ${lowWater ? '' : '+ texture2D(tMacro, q2 + vec2(0.0, e)).r * 0.5'};
        vec3 bw = vec3(-(hx - h0), 0.0, -(hz - h0)) * ${amt.toFixed(2)};
        normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
      }`).replace('#include <map_fragment>', `#include <map_fragment>
      // 川筋に沿う長い明暗。曲がる川は頂点に持たせた流れを使う。
      vec2 streamDir = ${localFlow ? 'normalize(vWaterFlow + vec2(0.00001))' : `vec2(${fx.toFixed(3)}, ${fz.toFixed(3)})`};
      float streamAlong = dot(vWPw.xz, streamDir);
      float streamAcross = dot(vWPw.xz, vec2(-streamDir.y, streamDir.x));
      float streamLines = sin(streamAcross * 4.8 + sin(streamAlong * 0.22 - uTime * 0.8) * 0.7);
      float streamNear = 1.0 - smoothstep(25.0, 85.0, length(vWPw - cameraPosition));
      diffuseColor.rgb *= 1.0 + streamLines * streamNear * 0.065;
      `).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      ${mat.isMeshLambertMaterial ? `// 携帯でも空の色と雲の濃淡を水面へ映す。描き直しは足さない。
      vec3 waterView = normalize(cameraPosition - vWPw);
      float waterEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      // 波で変えた面の向きで空を砕く。軽い材質は頂点で照らすため、法線を揺らすだけでは波が見えない。
      vec3 waveNormal = transpose(mat3(viewMatrix)) * normal;
      vec2 skyUV = vWPw.xz * 0.018 + waterView.xz * 0.6 + waveNormal.xz * 0.45;
      float skyCloud = texture2D(tMacro, skyUV).r;
      reflectedLight.indirectDiffuse += uWaterSky * (0.08 + waterEdge * 0.3) * (0.7 + skyCloud * 0.3);` : ''}`);
    if (fireReflections) {
      // 水面自身へ火を映す。三つの入れ物を使い回し、板や描画を増やさない。
      sh.fragmentShader = 'uniform vec4 uWaterFires[3];\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        for (int i = 0; i < 3; i++) {
          vec4 fire = uWaterFires[i];
          vec2 delta = vWPw.xz - fire.xy;
          vec2 axis = normalize(cameraPosition.xz - fire.xy + vec2(0.0001));
          float along = dot(delta, axis);
          float across = dot(delta, vec2(-axis.y, axis.x));
          float wave = sin(vWPw.z * 10.0 + vWPw.x * 3.0 - uTime * 2.0);
          float stripe = exp(-across * across / 5.0 - along * along / 85.0);
          stripe *= 1.0 - smoothstep(12.0, 18.0, length(delta));
          reflectedLight.indirectDiffuse += vec3(1.0, 0.254, 0.042) * stripe * fire.z * (0.55 + 0.45 * wave * wave);
        }`);
    }
    if (sediment) {
      sh.vertexShader = 'attribute vec2 waterBed; varying vec2 vWaterBed;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterBed = waterBed;');
      sh.fragmentShader = 'varying vec2 vWaterBed;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        // 実際の川床から測った深さで砂の透けと雪解けの濁りを分ける。
        float bedNoise = texture2D(tMacro, vWPw.xz * 0.7).r;
        float bedDepth = max(0.0, vWaterBed.x);
        vec3 sand = vec3(0.55, 0.50, 0.40) * (0.82 + bedNoise * 0.24);
        diffuseColor.rgb = mix(sand, vec3(0.25, 0.33, 0.28), smoothstep(0.2, 0.6, bedDepth));
        // 両岸一メートルの泡。川幅方向は符号を残し、中央へ泡を広げない。
        float bankDistance = ${sediment.toFixed(2)} - abs(vWaterBed.y);
        float foamNoise = texture2D(tMacro, vWPw.xz * 0.6 - normalize(vWaterFlow + vec2(0.00001)) * uTime * 0.22).r;
        float foam = (1.0 - smoothstep(0.05, 1.0, bankDistance)) * smoothstep(0.32, 0.72, foamNoise);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.84, 0.75), foam * 0.65);
      `);
    }
    if (localFlow) sh.fragmentShader = 'varying vec2 vWaterFlow;\n' + sh.fragmentShader;
    if (banks) {
      // 別の直線の泥板を重ねず、水面自身に岸の濁りと入り江のむらを付ける。
      sh.fragmentShader = 'uniform vec2 uWaterBanks;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float bankNoise = texture2D(tMacro, vWPw.xz * 0.065).r;
        float bankDist = min(vWPw.x - uWaterBanks.x, uWaterBanks.y - vWPw.x);
        float bankEdge = bankDist + (bankNoise - 0.5) * 2.6;
        float shallow = 1.0 - smoothstep(0.0, 7.0, bankEdge);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.16, 0.095), shallow * 0.55);
        if (bankEdge < 0.0) discard;`);
    }
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
uniform float uAT, uGust, uIdle, uMarch, uCharge, uTurn, uRout, uRoutT, uShim, uYose, uFieldRanks;
uniform sampler2D uHgt; uniform vec3 uHP; uniform float uTerrainTriangles;
attribute vec4 aInfo; attribute vec2 aInfo2; attribute float aPart;
// aHost：後詰め（隊の後ろに続く軽い兵）の奥行き（0 は隊の本体。後ろほど 1 に近く、霞む）
attribute float aHost; varying float vAHz;
// aSplit：兵ごとに遠さで形を選ぶ隊（lodSplit）。1 は遠い兵の束（44m の内を描かない。2 は 16m の内を描かない）・-1 は近い兵の細かい形・-2 は中ほどの形。0 は分けない
attribute float aSplit; uniform vec2 uArmySplitR;
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
  // 指定した山城だけ、描く地面と同じ三角形へ兵・旗・馬の根元を据える。
  if (uTerrainTriangles > 0.5) return t.x + t.y <= 1.0
    ? a + (b - a) * t.x + (c - a) * t.y
    : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y);
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
  // 指定した槍隊の待機中だけ、城側へ約三十度傾けて穂先をそろえる。
  // 進軍・突撃・敗走では従来の持ち替えへ戻す。旗持ちと騎馬の得物は変えない。
  float ranks = uFieldRanks * (1.0 - min(1.0, max(gait, uCharge)));
  if (kd == 0.0) P.spear = mix(P.spear, -0.50 + (sd - 0.5) * 0.04 + 0.015 * sin(uAT * 0.37 + sd), ranks);
  P.spLen = kd == 0.0 && ex > 0.0 ? max(0.65, ex) : 1.0;
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
  // 槍ぶすまの列はその場を保つ。呼吸と足踏みは残す。
  wand *= 1.0 - ranks;
  P.yaw = mix(P.yaw, uTurn * 3.14159, ranks);
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
  // 布と横木は同じ竿を軸に回す。近くでは幅を絞り、結んだ上端と竿の側は動かさない。
  if (pt == 11.0 || pt == 12.0 || pt == 6.0) {
    float px = pt == 11.0 ? 0.0 : 0.3;
    float width = uAFlagWidth;
    #ifdef USE_INSTANCING
      mat4 wm = modelMatrix * instanceMatrix;
      width *= mix(0.78, 1.0, smoothstep(8.0, 30.0, distance(wm[3].xz, uArmyP)));
    #endif
    if (pt != 11.0 && kd == 4.0 && aInfo.w == 4.0) width *= 1.65;
    if (pt != 6.0) {
      float w = pt == 12.0 ? 0.72 : 0.34;
      float h = pt == 12.0 ? mix(2.6, 3.7, uYose) : 0.62;
      float top = pt == 12.0 ? 5.2 : 2.62;
      float k = clamp((position.x - px) / w, 0.0, 1.0);
      float t = clamp((top - position.y) / h, 0.0, 1.0);
      float amp = k * t;
      // 静かな時もひだを残す。倒れた布は風を弱め、竿ごと寝かせる。
      float wind = uGust * uAMotion * (1.0 - smoothstep(0.25, 1.2, abs(P.fall)));
      float ar = uAT * 2.7 - aWindPhase() + position.x * 6.0 + position.y * 1.5 + sd * 1.5;
      float fold = position.x * 9.0 + position.y * 2.0;
      float wave = sin(fold) * 0.035 + sin(ar) * 0.14 * wind;
      if (isN < 0.5) {
        q.z += wave * amp;
        q.x = px + (q.x - px) * width;
      } else {
        float dx = (cos(fold) * 0.315 + cos(ar) * 0.84 * wind) * amp + wave * t / w;
        float dy = (cos(fold) * 0.07 + cos(ar) * 0.21 * wind) * amp - wave * k / h;
        q = normalize(vec3(-dx / width, -dy, 1.0));
      }
    } else if (isN < 0.5 && q.y > 5.1) {
      q.x = px + (q.x - px) * width;
    }
    #ifdef USE_INSTANCING
      vec2 localWind = vec2(dot(normalize(wm[0].xz), uWindDir), dot(normalize(wm[2].xz), uWindDir));
      float angle = (atan(-localWind.y, localWind.x) - P.yaw) * (1.0 - smoothstep(0.25, 1.2, abs(P.fall)));
      vec3 pivot = vec3(px, 0.0, pt == 11.0 ? -0.17 : 0.14) * pos;
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
// 兵ごとに形を選ぶ隊の境（m）：x より近くは細かい形、x〜y は中ほどの形、y より先は遠い束の形
export const ARMY_SPLIT_R = { value: new THREE.Vector2(16, 44) };
const _spM = new THREE.Matrix4(), _spV = new THREE.Vector3();
// 軽い兵の束の写し（入れ物は元と同じ大きさ。形の頂点は元の物を使い回す）。sign：兵ごとに形を選ぶ印（aSplit。null は付けない）
function instTwin(m, geo, sign) {
  const n = m.instanceMatrix.count, g = new THREE.BufferGeometry(), keys = [];
  g.setIndex(geo.index);
  for (const k in geo.attributes) {
    const at = geo.attributes[k];
    if (k === 'aSplit') continue;
    if (at.isInstancedBufferAttribute) { keys.push(k); g.setAttribute(k, new THREE.InstancedBufferAttribute(new at.array.constructor(at.array.length), at.itemSize, at.normalized, at.meshPerAttribute)); } else g.setAttribute(k, at);
  }
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (sign != null) g.setAttribute('aSplit', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(sign), 1));
  g.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
  const t = new THREE.InstancedMesh(g, m.material, n);
  if (m.instanceColor) t.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceColor.array.length), 3);
  t.count = 0; t.visible = false; t.matrixAutoUpdate = false; t.frustumCulled = m.frustumCulled;
  t.castShadow = m.castShadow; t.receiveShadow = m.receiveShadow; t.renderOrder = m.renderOrder;
  t.customDepthMaterial = m.customDepthMaterial; t.customDistanceMaterial = m.customDistanceMaterial;
  t.userData.noFreeze = true; t.userData.splitTwin = true; t.userData.keys = keys;
  m.add(t);
  return t;
}
const _lodV = new THREE.Vector3();
// 軽い兵の隊で、どの兵にも使わない部品（陣笠と兜の片方・持たない得物・指物）を形から外す（シェーダーで畳んで見えない面を数えない）。
//   部品の番号（aPart）ごとの見せ方は aPose と同じ。隊の兵の種類が変わったら次の見回りで作り直す
const ARMY_TRIM_PARTS = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11);
function armyPartMask(m) {
  const a = m.geometry.attributes.aInfo, a2 = m.geometry.attributes.aInfo2;
  if (!a || !a2 || a.itemSize !== 4 || a2.itemSize !== 2) return -1;
  const A = a.array, B = a2.array;
  let k = 0;
  for (let i = 0, n = Math.min(m.count, a.count); i < n; i++) {
    const kd = A[i * 4 + 1], hm = A[i * 4 + 2];
    if (hm < 1) k |= 1 << 1;
    if (hm > 0) k |= 1 << 2;
    if (kd === 0 || kd === 5) k |= 1 << 3; else if (kd === 1) k |= 1 << 4; else if (kd === 2) k |= 1 << 5; else if (kd === 4) k |= 1 << 6;
    if (kd !== 5) k |= (1 << 8) | (1 << 9);
    if (B[i * 2] > 0) k |= (1 << 10) | (1 << 11);
    if (k === ARMY_TRIM_PARTS) break;
  }
  return k;
}
const ARMY_TRIM = new WeakMap();
function armyTrimGeo(base, mask) {
  const pa = base.attributes.aPart, idx = base.index;
  if (!pa || !idx || (mask & ARMY_TRIM_PARTS) === ARMY_TRIM_PARTS) return base;
  let byMask = ARMY_TRIM.get(base);
  if (!byMask) ARMY_TRIM.set(base, byMask = new Map());
  let g = byMask.get(mask);
  if (g) return g;
  const I = idx.array, P = pa.array, keep = [];
  for (let t = 0; t < I.length; t += 3) {
    const p = P[I[t]];
    if (p >= 0 && p < 31 && (ARMY_TRIM_PARTS >> p) & 1 && !((mask >> p) & 1)) continue;
    keep.push(I[t], I[t + 1], I[t + 2]);
  }
  if (keep.length === I.length) g = base;
  else {
    g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.setIndex(keep);
    g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;
    g.userData = base.userData;
  }
  byMask.set(mask, g);
  return g;
}
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
   //   カメラの 60m 以内も、画質に関わらず隠す（人は min(カメラ, 本人) が 60m 以内なら必ず本物。10/10 三方ヶ原の低で箱の体）
   if (dd < uArmyNear || dd < uArmyRealR || length(nw.xz - uArmyRealP) < uArmyRealR) AP.show = 0.0;
   // 遠景専用の後詰めは近景に出さない。網目の人影が実兵と重なるのを防ぐ。
   if (aHost > 0.0 && dd < 48.0) AP.show = 0.0;
   // 兵ごとに遠さで形を選ぶ隊：一人ずつの距離で、近い細かい形・中ほどの形・遠い束のどれか一つだけに描く
   if (aSplit > 1.5 ? dd < uArmySplitR.x : aSplit > 0.5 ? dd < uArmySplitR.y : aSplit < -1.5 ? (dd < uArmySplitR.x || dd >= uArmySplitR.y) : aSplit < -0.5 && dd >= uArmySplitR.x) AP.show = 0.0;
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
  U.uFieldRanks ||= { value: 0 };
  U.uTerrainTriangles ||= { value: 0 };
  mat.userData.armyU = U;   // 本物の兵に替わる輪の広さ（lodTick が、隊が丸ごと輪の内に入ったかを見る）
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uYose: U.uYose || { value: 0 }, uUnavailable: U.uUnavailable || { value: 0 }, uMoveLim: U.uMoveLim || { value: 176 }, uArmyNear: U.uNear || ARMY_NEAR, uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uArmySplitR: U.uSplitR || ARMY_SPLIT_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
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
// aClash：x 塊の番号・y 塊の中の順番（前の列から討たれる）・z 列（0 が一番前）・w 亡骸は 1、倒れる途中は 2＋討死の時刻
const CLASH_NB = 40, CLASH_ROW = 1.15;
// 合戦の矢を並べる計算の入れ物（毎コマ new しない）
const _caM4 = new THREE.Matrix4(), _caQ = new THREE.Quaternion(), _caP = new THREE.Vector3(), _caD = new THREE.Vector3(), _caS = new THREE.Vector3(1, 1, 1), _caZ = new THREE.Vector3(0, 0, 1);
// （元の形の uMarch・uCharge は、塊ごとに変わるので、ここでは cInit で決める値にする）
const CLASH_GLSL = ARMY_GLSL.replace(/uMarch, uCharge, /, '').replace('attribute float aPart;', `attribute float aPart;
uniform vec4 uBlk[${CLASH_NB}], uBlk2[${CLASH_NB}]; uniform float uSide, uApp, uAppM, uAppC, uNearHide, uMeasuredMelee;
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
  // 列ごとの直線を崩す。兵数と討死の抽選は変えず、同じ種から位置だけをずらす。
  float disorder = B2.x * (1.0 - smoothstep(fr + 2.0, fr + 5.0, row));
  // 接敵中だけ後列を半歩詰める。横幅・人数・討死と実兵の判定は保つ。
  cOff.z += disorder * min(0.55, max(0.0, row - fr) * 0.22);
  cOff.x += disorder * (fract(sd * 19.73) - 0.5) * 0.62;
  cOff.z += disorder * (fract(sd * 31.17) - 0.5) * 0.74;
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
    if (uMeasuredMelee > 0.5) {
      // 膝が折れてから重さで倒れる。両方の倒れ方で、記録した死亡時刻から続ける。
      float deathAt = aClash.w >= 2.0 ? aClash.w - 2.0 : aClash.y;
      float age = max(0.0, uAT - deathAt);
      float knee = smoothstep(0.0, 0.24, age);
      float drop = clamp((age - 0.18) / (0.58 + sd * 0.2), 0.0, 1.0);
      drop *= drop;
      P.fall *= drop; P.yaw = (sd - 0.5) * 0.3 * drop;
      P.tilt *= drop; P.spear = mix(1.1, 1.3, drop);
      P.kneel = 1.0 - 0.55 * knee * (1.0 - drop);
      P.lift = 0.16 * drop - 0.22 * knee * (1.0 - drop);
    } else if (aClash.w >= 2.0) {
      // 膝が抜けてから重さで倒れ、地面に着いた姿へ続ける。兵ごとに速さを変える。
      float age = max(0.0, uAT - (aClash.w - 2.0));
      float knee = smoothstep(0.0, 0.25 + sd * 0.15, age);
      float drop = clamp((age - 0.18) / (0.48 + sd * 0.24), 0.0, 1.0);
      drop *= drop;
      P.fall *= drop; P.kneel = knee; P.lift *= drop; P.yaw *= drop;
      P.spear = mix(0.5, P.spear, drop); P.tilt *= drop;
    }
    return;
  }
  if (cFight > 0.01 && P.run < 0.5) {
    float f = cFight * uAMotion;
    float detail = 1.0;
    #ifdef USE_INSTANCING
      detail = 1.0 - smoothstep(38.0, 60.0, distance((modelMatrix * instanceMatrix[3]).xz, uArmyP));
    #endif
    if (detail > 0.001) {
      // 個々の横揺れと、隣の列から伝わる押し返しを攻守の動きに重ねる。
      P.off.x += f * detail * 0.12 * sin(T * 0.9 + sd * 17.0);
      P.tilt += f * detail * 0.08 * sin(T * 1.3 + sd * 5.0);
      if (uMeasuredMelee > 0.5) {
        float heave = sin(T * 1.6 - aClash.x * 0.7 - aClash.z * 0.5);
        float heaveWeight = f * detail * (0.82 + sd * 0.18);
        P.off.z += heaveWeight * heave * 0.16;
        P.tilt += heaveWeight * heave * 0.07;
        P.spear += heaveWeight * heave * 0.09;
      }
      // 塊ごとに攻守を交代。両軍の拍子を半周ずらし、受けてから突き返す。
      // 塊ごとの速さは敵味方で共通にし、個々の拍子と打ち筋をずらす。
      // 小さな個人差と列の遅れは保ち、一斉の体操にしない。
      // 兵同士の探索は増やさず、種から突き・叩き・柄の押し返しを選ぶ。
      float cycle = fract(uAT / (2.35 + fract(aClash.x * 0.731) * 0.55)
        + aClash.x * 0.173 + aClash.z * 0.09
        + (sd - 0.5) * 0.48 + (uSide < 0.0 ? 0.5 : 0.0));
      float style = fract(sd * 43.71);
      float beat = step(0.55, style) * (1.0 - step(0.82, style));
      float bind = step(0.82, style);
      float side = sd > 0.5 ? 1.0 : -1.0;
      float windup = smoothstep(0.02, 0.13, cycle) * (1.0 - smoothstep(0.16, 0.25, cycle));
      float strike = smoothstep(0.16, 0.25, cycle) * (1.0 - smoothstep(0.29, 0.46, cycle));
      float settle = smoothstep(0.29, 0.40, cycle) * (1.0 - smoothstep(0.46, 0.56, cycle));
      float receive = smoothstep(0.59, 0.68, cycle) * (1.0 - smoothstep(0.74, 0.94, cycle));
      float melee = aInfo.y == 0.0 || aInfo.y == 3.0 ? 1.0 : 0.0;
      float weight = f * detail * melee;
      // 叩く兵は穂先を上げて振り下ろし、柄で押す兵は短く半身で踏ん張る。
      // 溜め→踏み込み→沈んで止める順にし、毎回直立へ跳ね戻らない。
      P.spear = mix(P.spear, 1.16 - (0.16 + beat * 0.6) * windup
        + (0.3 + beat * 0.18 - bind * 0.17) * strike - 0.34 * receive
        + (sd - 0.5) * 0.12, weight);
      P.off.z += weight * (-0.10 * windup + (0.38 - beat * 0.14 - bind * 0.12) * strike
        + 0.10 * settle - 0.24 * receive);
      P.off.x += weight * side * (0.18 * receive + bind * 0.12 * strike);
      P.fall += weight * (-0.045 * windup + (0.13 + beat * 0.07) * strike + 0.045 * settle - 0.08 * receive);
      P.yaw = mix(P.yaw, (sd - 0.5) * (0.22 + 0.25 * receive)
        + side * ((0.08 + bind * 0.16) * windup - (0.10 + bind * 0.18) * strike), weight);
      P.leg = mix(P.leg, 0.18 - 0.10 * windup + 0.24 * strike + 0.08 * settle - 0.15 * receive, weight);
      P.lift -= weight * (0.025 + 0.035 * windup + 0.04 * settle + 0.055 * receive);
      P.kneel = mix(P.kneel, 1.0 - 0.035 * windup - 0.04 * settle - 0.06 * receive, weight);
      // 鉄砲・弓・旗持ちには槍の突きを付けない。
      P.kneel = mix(P.kneel, 0.75, f * detail * (1.0 - melee) * step(aInfo.y, 1.0));
    }
    // 遠くは一つの波だけで押し引きを見せる。人数・形・描く回数は増やさない。
    float farBeat = sin(T * 2.2) * f * (1.0 - detail);
    P.spear += 0.22 * farBeat;
    P.off.z += 0.16 * farBeat;
    P.leg += 0.12 * farBeat;
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
  mat.userData.armyU = U;
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uArmySplitR: U.uSplitR || ARMY_SPLIT_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
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
const lowKeep = (dd = 100, back = false) => (1);
// 三方ヶ原の前線は列の密度を保つ。百十メートルの外だけ、霞に合わせて奥の列を減らす。
const frontKeep = (def, dd, back = false) => def.denseFront ? 1 + (lowKeep(dd, back) - 1) * Math.max(0, Math.min(1, (dd - 110) / 80)) : lowKeep(dd, back);
// 束全体の範囲で画面外を判定する。旗・槍・押し出しと、逃げる動きの余裕を残す。
// 範囲は人数を絞る前に記録し、毎コマの形・行列の作り直しを避ける。
function armyViewTest(mesh, extra = null) {
  mesh.computeBoundingSphere();
  const bounds = mesh.boundingSphere.clone(), sphere = new THREE.Sphere();
  if (extra) for (const part of extra) {
    part.computeBoundingSphere();
    bounds.union(part.boundingSphere);
  }
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  return (cam, padding = 48) => {
    // 全画質で、画面の外（余裕つき）の隊を描かない（高でも見えない大軍の三角を数えない）
    projection.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    sphere.copy(bounds); sphere.radius += padding;
    sphere.applyMatrix4(mesh.matrixWorld);
    return !frustum.intersectsSphere(sphere);
  };
}
function soldierGeo(armor, near) {
  if (near === 'xlo' || near === 'xxlo' || near === 'x3lo' || near === 'x4lo') return soldierGeoX(armor, near === 'x4lo' ? 4 : near === 'x3lo' ? 3 : near === 'xxlo');
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
  // 近い軽い兵も草摺の重なりを持つ。共用する形だけに段を刻み、描く回数は増やさない。
  const skirt = near ? new THREE.LatheGeometry([
    new THREE.Vector2(0.27, 0.73), new THREE.Vector2(0.246, 0.83),
    new THREE.Vector2(0.257, 0.83), new THREE.Vector2(0.222, 0.94),
    new THREE.Vector2(0.233, 0.94), new THREE.Vector2(0.19, 1.07),
  ], s2) : cyl(0.19, 0.27, 0.34, s2, 0, 0.9, 0);
  skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
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
  if (near) {
    for (const x of [0.32, 0.62, 0.96]) armyPart(P, cyl(0.024, 0.024, 0.08, 4, x, 5.18, 0.14), 0x78684c, 6);
  }
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  SOLDIER_GEO.set(key, g);
  return g;
}
// とても遠い兵（塊のいちばん近い端が 50m より先。背丈が画面の 3% ほど）の形：部品の分け方（aPart）と置き場は同じで、角を三つ〜六つに。
//   脚は腿と脛を一本の筒に、胴は草摺から肩まで一本の筒に。一人 160 面ほど（遠い形の三分の一）
//   xx：さらに遠い兵（100m より先。背丈が十数画素）の形。腕・袖・穂先・横木を省き、胴は四角の筒に（一人 80 面ほど）
function soldierGeoX(armor, xx = false) {
  const key = armor + (xx === 4 ? 'x4' : xx === 3 ? 'x3' : xx ? 'xx' : 'x');
  if (SOLDIER_GEO.has(key)) return SOLDIER_GEO.get(key);
  if (xx === 4) {
    // 高の、とても遠い塊（120m ほど先。人の背丈が八画素ほど）：74 面 → 45 面ほど。脚・胴（草摺と一つの筒）・頭・笠と兜・槍と背の旗の竿
    const P4 = [], a4 = new THREE.Color(armor);
    const cy = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, true); g.translate(x, y, z); return g; };
    for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P4, cy(0.08, 0.055, 0.82, 3, sx, 0.41, 0), 0x4c4438, pt);
    const dou = cy(0.2, 0.25, 0.86, 3, 0, 1.15, 0); dou.scale(1, 1, 0.8); armyPart(P4, dou, a4.getHex(), 0);
    const hd = new THREE.SphereGeometry(0.11, 3, 2); hd.translate(0, 1.72, 0.01); armyPart(P4, hd, 0x6e5440, 0);
    const ks = new THREE.ConeGeometry(0.33, 0.13, 3, 1, true); ks.translate(0, 1.825, 0); armyPart(P4, ks, 0x2c261e, 1);
    const helmet = new THREE.SphereGeometry(0.15, 3, 1, 0, Math.PI * 2, 0, Math.PI / 2); helmet.translate(0, 1.75, 0); armyPart(P4, helmet, 0x1c1a18, 2);
    armyPart(P4, cy(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
    const ho4 = new THREE.ConeGeometry(0.035, 0.3, 3, 1, true); ho4.translate(0.3, 4.4, 0.14); armyPart(P4, ho4, 0x9a9a98, 3);
    armyPart(P4, cy(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
    const g4 = mergeGeometries(P4); g4.computeBoundingSphere(); SOLDIER_GEO.set(key, g4); return g4;
  }
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
let HORSE_LO = null, HORSE_X3 = null;
// 高の 44m より先（本物の兵に替わる輪の外。馬の長さが二十画素ほど）の馬：250 面 → 110 面ほど。蹄と耳は省き、鞍と泥障の色は残す
function horseGeoX3() {
  if (HORSE_X3) return HORSE_X3;
  const P = [];
  const body = new THREE.CapsuleGeometry(0.3, 0.95, 1, 5); body.rotateX(Math.PI / 2); body.scale(0.9, 1.1, 1); body.translate(0, 1.28, 0); armyPart(P, body, 0xffffff, 20);
  const chest = new THREE.SphereGeometry(0.3, 5, 3); chest.scale(0.85, 1.05, 0.8); chest.translate(0, 1.3, 0.55); armyPart(P, chest, 0xffffff, 20);
  const neck = new THREE.CylinderGeometry(0.11, 0.2, 0.7, 4, 1, true); neck.rotateX(0.62); neck.translate(0, 1.66, 0.8); armyPart(P, neck, 0xffffff, 23);
  const hd = new THREE.CylinderGeometry(0.065, 0.1, 0.5, 3, 1, true); hd.rotateX(Math.PI / 2 + 0.5); hd.translate(0, 1.84, 1.12); armyPart(P, hd, 0xffffff, 23);
  const mane = new THREE.BoxGeometry(0.04, 0.55, 0.1); mane.rotateX(0.62); mane.translate(0, 1.8, 0.68); armyPart(P, mane, 0x1a1512, 23);
  const kura = new THREE.CylinderGeometry(0.34, 0.34, 0.5, 3, 1, true, -Math.PI / 2, Math.PI); kura.rotateX(Math.PI / 2); kura.scale(1, 0.55, 1); kura.translate(0, 1.47, -0.05); armyPart(P, kura, 0x3a1a14, 20);
  for (const sd of [-1, 1]) { const ao = new THREE.CylinderGeometry(0.34, 0.34, 0.48, 2, 1, true, sd > 0 ? Math.PI * 0.35 : Math.PI * 1.35, Math.PI * 0.3); ao.rotateX(Math.PI / 2); ao.translate(0, 1.25, -0.05); armyPart(P, ao, 0x3a1a14, 20); }
  for (const [x, z, pt] of [[-0.16, 0.6, 21], [0.16, 0.6, 22], [-0.16, -0.6, 22], [0.16, -0.6, 21]]) {
    const l = new THREE.CylinderGeometry(0.08, 0.05, 1.06, 3, 1, true); l.translate(x, 0.53, z); armyPart(P, l, 0xd8d0c8, pt);
  }
  const tail = new THREE.CylinderGeometry(0.04, 0.1, 0.75, 3, 1, true); tail.rotateX(-0.35); tail.translate(0, 1.05, -0.87); armyPart(P, tail, 0x1a1512, 20);
  HORSE_X3 = mergeGeometries(P); return HORSE_X3;
}
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
let SASHI_GEO = null, KIBA_FLAG_GEO = null, BANNER_GEO = null, YOSE_BANNER_GEO = null, YOSE_PLUME_GEO = null;
function clothGeo(w, h, sx, sy, x0, y0, z0, part) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy); g.translate(x0 + w / 2, y0 - h / 2, z0);
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}

// 隊の並び：兵一人ずつの置き場所と種類を作る
// kind：'mixed'（前に鉄砲、中に槍、後ろに旗と騎馬の備え）・'spear'（槍の林）・'gun'（鉄砲の横列）・'bow'・'cavalry'（騎馬の塊）・'honjin'（陣幕の本陣）
function armyLayout(o, R) {
  const N = o.count || 300, w = o.w || 20, d = o.d || 10, kind = o.kind || 'mixed';
  const fieldRanks = o.fieldRanks === true && kind === 'spear';
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
      const lx = x0 + (cx + 0.5) * (x1 - x0) / cols + (R() - 0.5) * sx * (fieldRanks ? 0.08 : 0.35);
      const lz = z1 - (r + 0.5) * gz + Math.sin(lx * 0.23 + ph + r) * (fieldRanks ? 0.04 : 0.25) + (R() - 0.5) * gz * (fieldRanks ? 0.06 : 0.3);
      put(lx, lz, k, f ? f(r, c, rows) : {});
    }
  };
  const hw = w / 2, hd = d / 2;
  const nb = o.banners ?? Math.max(1, Math.min(12, Math.round(w / 4), Math.round(N * 0.08)));
  const banners = (z) => { for (let i = 0; i < nb; i++) put(-hw + (i + 0.5) * w / nb + (R() - 0.5) * (fieldRanks ? 0.08 : 0.8), z + (R() - 0.5) * (fieldRanks ? 0.06 : 0.5), 4); };
  // 近い控えの短い槍だけ指定で縮める。指定のない戦の長さは保つ。
  const spearF = (r, c) => fieldRanks
    ? { ex: 1.36 + R() * 0.04, flag: (r + c) % 2 === 0 ? 1 : 0 }
    : { ex: (1.25 + R() * 0.3) * (o.spearScale ?? 1) };
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
  if (kind !== 'honjin' && !o.yose && !fieldRanks) {
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

// 候補の木は場面の構成が変わった時だけ辿る。普段は候補の距離と影の印だけを更新する。
const SH_OFF = new WeakSet(), _shC = new THREE.Vector3();
// 同じ網で植えた木は、影の時だけ指定範囲の行列へ差し替える。画面の並びと色は触らない。
function sceneryInstanceShadow(mesh, x, z, walk, range) {
  let state = mesh._nearShadow;
  if (!state || state.attribute.count < mesh.instanceMatrix.count) {
    state = { attribute: new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.array.length), 16).setUsage(THREE.DynamicDrawUsage),
      bounds: new Float64Array(mesh.instanceMatrix.count * 3), selected: new Uint32Array(mesh.instanceMatrix.count), geometry: null,
      source: null, version: -1, count: -1, used: 0, x: Infinity, z: Infinity, world: new THREE.Matrix4(), key: 'nearShadowMatrix' + mesh.id };
    mesh._nearShadow = state;
    if (!mesh._nearShadowHook) {
      mesh._nearShadowHook = true;
      const before = mesh.onBeforeShadow, after = mesh.onAfterShadow;
      mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, material, group) {
        before.call(this, renderer, object, camera, shadowCamera, geometry, material, group);
        const state = this._nearShadow;
        state.saved = this.instanceMatrix; state.savedCount = this.count;
        this.instanceMatrix = state.attribute; this.count = state.used;
      };
      mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry, material, group) {
        const state = this._nearShadow;
        // 差し替え前の呼出しがない時は元の配列を保つ。復帰済みの控えも再利用しない。
        if (state.saved) {
          this.instanceMatrix = state.saved; this.count = state.savedCount;
          state.saved = null;
        }
        after.call(this, renderer, object, camera, shadowCamera, geometry, material, group);
      };
    }
  }
  // 描画の準備は影の直前の呼出しより先に属性を送る。補助の属性として登録し、
  // 影の行列もその段階で転送しておく（形を共有する木は網ごとに別の名前）。
  if (mesh.geometry.attributes[state.key] !== state.attribute) mesh.geometry.setAttribute(state.key, state.attribute);
  const source = mesh.instanceMatrix;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const sphere = mesh.geometry.boundingSphere;
  // 本人が歩くだけなら、草木の世界の中心と半径は変わらない。
  // 影の範囲を選ぶ前に一度だけ求め、行列・形・個体数が変わった時だけ作り直す。
  const changed = state.source !== source || state.version !== source.version || state.count !== mesh.count ||
    state.geometry !== mesh.geometry || state.sphere !== sphere || state.radius !== sphere.radius ||
    state.cx !== sphere.center.x || state.cy !== sphere.center.y || state.cz !== sphere.center.z || !state.world.equals(mesh.matrixWorld);
  const bounds = state.bounds;
  if (changed) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, walk.matrix);
      walk.world.multiplyMatrices(mesh.matrixWorld, walk.matrix);
      _shC.copy(sphere.center).applyMatrix4(walk.world);
      const j = i * 3;
      bounds[j] = _shC.x; bounds[j + 1] = _shC.z;
      bounds[j + 2] = sphere.radius * walk.world.getMaxScaleOnAxis();
    }
    state.source = source; state.version = source.version; state.count = mesh.count; state.world.copy(mesh.matrixWorld);
    state.geometry = mesh.geometry; state.sphere = sphere; state.radius = sphere.radius;
    state.cx = sphere.center.x; state.cy = sphere.center.y; state.cz = sphere.center.z;
  } else if (state.x === x && state.z === z && state.range === range) return state.used > 0;
  state.range = range; state.x = x; state.z = z;
  let count = 0, selectionChanged = changed;
  for (let i = 0; i < mesh.count; i++) {
    const j = i * 3, dx = bounds[j] - x, dz = bounds[j + 1] - z, reach = range + bounds[j + 2];
    if (dx * dx + dz * dz > reach * reach) continue;
    if (state.selected[count] !== i) selectionChanged = true;
    state.selected[count++] = i;
  }
  // 歩いても影を落とす木が同じなら、行列の詰め直しと転送はしない。
  if (selectionChanged || count !== state.used) {
    for (let i = 0; i < count; i++) {
      const at = state.selected[i] * 16;
      for (let k = 0; k < 16; k++) state.attribute.array[i * 16 + k] = source.array[at + k];
    }
    state.attribute.needsUpdate = true;
  }
  state.used = count;
  return count > 0;
}
function shadowRange(scene, x, z, walk, range = 24) {
  // 兵や粒の追加では景物の候補を写し直さない。凍結物の結合・解凍は版でも検知する。
  const versions = walk.versions || (walk.versions = walk.roots.map(root => root._sfVersion));
  let changed = walk.roots.length !== scene.children.length;
  for (let i = 0; !changed && i < scene.children.length; i++) {
    const root = scene.children[i];
    if (walk.roots[i] !== root || walk.frozen[i] !== !!root._sf || versions[i] !== root._sfVersion) changed = true;
  }
  if (changed) {
    const groups = walk.groups || (walk.groups = []);
    if (!walk.collect) walk.collect = o => {
      if (o.isMesh && !o.isSkinnedMesh && (o.castShadow || SH_OFF.has(o))) {
        o._sceneryCastShadow = true; walk.collectTargets.push(o);
      }
    };
    let count = 0, rebuild = false;
    walk.roots.length = walk.frozen.length = versions.length = scene.children.length;
    for (let i = 0; i < scene.children.length; i++) {
      const root = scene.children[i];
      walk.roots[i] = root; walk.frozen[i] = !!root._sf; versions[i] = root._sfVersion;
      const scenery = root._sf || root.userData?.staticMerged || root.isMesh &&
        !root.isSkinnedMesh && !root.material?.userData?.armyU && !root.userData?.armyBatch && root.name !== 'unitBatch';
      if (!scenery) continue;
      let cached = walk.cache.get(root);
      if (!cached || cached.frozen !== !!root._sf || cached.version !== root._sfVersion || cached.children !== root.children.length) {
        if (!cached) { cached = { targets: [] }; walk.cache.set(root, cached); }
        cached.frozen = !!root._sf; cached.version = root._sfVersion; cached.children = root.children.length;
        cached.targets.length = 0; walk.collectTargets = cached.targets;
        root.traverse(walk.collect);
        rebuild = true;
      }
      if (groups[count] !== cached) { groups[count] = cached; rebuild = true; }
      count++;
    }
    walk.collectTargets = null;
    if (groups.length !== count) { groups.length = count; rebuild = true; }
    // 距離制限は追加したコマから適用する。旧候補の完成待ちで遠方の影を増やさない。
    if (rebuild) {
      walk.targets.length = 0;
      for (const group of groups) for (const o of group.targets) walk.targets.push(o);
    }
  }
  for (const o of walk.targets) {
    o.castShadow = false;
    SH_OFF.add(o);
  }
}

export class World {
  constructor(scene, def) {
    for (const k of Object.keys(NEAR_REQ)) delete NEAR_REQ[k];   // 前の戦の頼みを持ち越さない
    ARMY_NEAR.value = 0;
    ARMY_REAL_R.value = 0;
    ARMY_REAL_P.value.set(1e5, 1e5);
    this.scene = scene;
    scene.userData.limitedUnitShadows = true;
    this.def = def;
    this.armyBatch = new ArmyBatch(scene, {
      uArmyNear: ARMY_NEAR, uArmyRealR: ARMY_REAL_R, uArmySplitR: ARMY_SPLIT_R,
      uMoveLim: { value: 176 },
    });
    this.shadowWalk = { targets: [], roots: [], frozen: [], cache: new WeakMap(), matrix: new THREE.Matrix4(), world: new THREE.Matrix4() };
    // 全部の戦で、描く直前に今の視点で遠景と軽い兵の形を選び直す（描かない早送りの後の最初の一枚も、遊びの時と同じ軽さで描く）
    {
      const before = scene.onBeforeRender;
      scene.onBeforeRender = (r, sc, cam, target) => {
        this.armyBatch.restore();
        before.call(sc, r, sc, cam, target);
        // 写真用の直接描画でも斜面の内側へ入らない。地面の面を選ぶ前に視点を補正する。
        if (this.def.terrainContactView && cam?.isPerspectiveCamera && this.terrain) {
          this.drawContact || (this.drawContact = {});
          guardDrawCamera(this, cam, this.drawContact);
        }
        // 索引の転送より先に地面の面を選ぶ。地面自身の描画直前では一コマ遅れる。
        if (cam && this.terrain?.visible) {
          const terrain = this.terrain;
          terrain.updateWorldMatrix(true, false);
          terrain.onBeforeRender(r, sc, cam, terrain.geometry, terrain.material, null);
        }
        if (!cam?.isPerspectiveCamera) {
          // 上から見る地図へ替えた時は、直前の画面外判定を持ち越さない。
          if ((this.def.armyViewCull ?? true) && this.armyView?.active) { this.detailCam = cam; this.lodTick(0, true); }
          return;
        }
        // 早送り・一時停止の後も、最初の一枚から今の視点で遠景を選ぶ。
        // 草木の詰め直しは視点が変わった時だけ。兵の形の一斉更新は視点の交換・大きな移動の時だけ。
        const e = cam.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
        if (this.firePool) {
          this.assignFireLights(0, this.fireCamera.set(x, y, z));
          this.updateFireFill(x, z);
        }
        const detailMove = Math.abs(x - this.detailX) + Math.abs(y - this.detailY) + Math.abs(z - this.detailZ);
        const detailFresh = this.detailCam !== cam || this.detailQuality !== SETTINGS.quality ||
          detailMove > 8 || (this.detailWorldTime === this.time && detailMove > 1) || isNoRender() ||
          (this.def.armyViewCull ?? true) && (!this.armyView || this.armyView.direction.dot(_shC.set(-e[8], -e[9], -e[10])) < 0.9994 ||
            Math.abs(x - this.armyView.position.x) + Math.abs(y - this.armyView.position.y) + Math.abs(z - this.armyView.position.z) > 8 || this.armyView.projection !== cam.projectionMatrix.elements[0]);
        this.detailCam = cam; this.detailQuality = SETTINGS.quality;
        this.detailWorldTime = this.time;
        this.detailX = x; this.detailY = y; this.detailZ = z;
        ARMY_P.value.set(x, z);
        this.lodTick(0, detailFresh);
        // 描かない早送りの後も、足もとの草を今の場所へ敷いてから詰める
        if (this.lastFocus) this.updateNearGrass(this.lastFocus, detailFresh);
        this.packNearGrass(cam);
        for (const detail of this.soldierDetails || []) detail(r, sc, cam);
        this.cullCam = cam; this.cullTick();
        // 建物・地形・草木の陰影は既存の頂点色で保ち、動く影を落とさない。
        const shadowFocus = this.lastFocus || this.sun.target.position;
        shadowRange(sc, shadowFocus.x, shadowFocus.z, this.shadowWalk, 0);
        this.armyBatch.draw(r, cam, this.armies, this.clashes);
      };
      const after = scene.onAfterRender;
      scene.onAfterRender = (r, sc, cam, target) => {
        // 次の進行で作る遠近の写しへ、描画中だけの非表示を持ち越さない。
        this.armyBatch.restoreLayers();
        after.call(sc, r, sc, cam, target);
      };
    }
    this.field = fieldState(def);
    this.villageFields = [];
    // 川と田は全戦で足を取る。明示した例外だけ止める。
    if (def.waterSlow == null) def.waterSlow = true;
    // 浅瀬で詰まった時だけ、既存の当たりを確かめる横への押し出しを使う。
    // 戦の定義を再利用する時も、前の世界への参照を残さない。
    if (def.streams?.length && (def.blockedEscape == null ||
      Object.getOwnPropertyDescriptor(def, 'blockedEscape')?.get?.name === 'waterBlockedEscape')) {
      const world = this;
      this.waterBlockedEscapeGetter = function waterBlockedEscape() { return !!world.waterEscapeNear; };
      Object.defineProperty(def, 'blockedEscape', { configurable: true, enumerable: true,
        get: this.waterBlockedEscapeGetter });
      if (def.blockedEscapeAfter == null) def.blockedEscapeAfter = 2.5;
    }
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
        // 実測地形に独自の起伏を足す戦では、周期的な細波を二重に載せない。
        if (!flat && !def.noGroundRipples) h += (Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2) * Math.cos(z * 0.27 - x * 0.05) * 0.28 + Math.sin(x * 0.83 + z * 0.61) * 0.07);
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
    // 炎は既存の発光板・地面の照り・共有の暖色の升で見せる。
    this.firePool = [];
    if (def.waterFireReflections) this.waterFireReflections = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    this.fireCamera = new THREE.Vector3();
    if (true) {
      const data = new Float32Array(64 * 64 * 4);
      this.fireFill = { data, strength: new Float32Array(64 * 64), tex: new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat, THREE.FloatType), time: -1, matTime: -1 };
      FIRE_FILL.map.value = this.fireFill.tex;
      this.fireFill.tex.needsUpdate = true;
    }
    FIRE_FILL.area.value.z = 0;
    this.buildWear();
    this.buildTerrain();
    def.prepareTerrain?.(this);
    this.buildVegetation();
    if (def.water) { this.buildWater(def.water); this.buildReeds(); }
    for (const st of def.streams || []) this.buildStream(st);
    this.buildRain();
    this.buildSky();
    if (def.lightning) this.prepareBolt();
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
    if (this.def.grassSlopeMax != null && this.slopeTan(x, z) > this.def.grassSlopeMax) return 0;
    if (!this.splat) return 1;
    const i = Math.max(0, Math.min(SEG, Math.round((x + this.half) / this.step))), j = Math.max(0, Math.min(SEG, Math.round((z + this.half) / this.step)));
    const k = j * (SEG + 1) + i;
    // 粗い地面の升目だけでは小さな裸地が埋まる。足元の株も同じ群落に収める。
    return this.waterW[k] > 0.3 ? 0 : Math.min(this.splat[k * 3], this.groundCoverAt(x, z));
  }

  // 草の群落と裸地は遠い株・足元の株・土の絵で同じ分布にする。
  // 歩くたびに乱数で草が生え替わらず、追加の絵も要らない。
  groundCoverAt(x, z) {
    if (!this.def.patchyGround) return 1;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.18 + Math.sin(z * 0.11) * 2.4)
      * Math.cos(z * 0.16 - Math.sin(x * 0.09) * 1.8);
    const cover = Math.max(0.08, Math.min(1, (patch - 0.28) * 2.2));
    return cover * (this.def.groundCover ? this.def.groundCover(x, z) : 1);
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
    // 小谷の切岸は、描く三角形と同じ平面から高さを読む。四隅の補間では面の下へ目線が入る。
    if (this.def.terrainTriangles) return tx + tz <= 1
      ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
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
    return !!roadTag(this, x, z);
  }

  // 35度ほどより急な坂は、道・梯子・階段の上でなければ登れない（山城の切岸・急な斜面のため）
  // 土塁に climbAt（登れる所）を書いた時は、そのほかの土塁の上は通さない（castle_parts.js の doruiLine が noClimb に置く。束21）
  // この勾配の判定は、noClimb を使う山城の戦か def.climbTan を書いた山の戦でだけ効かせる：野戦は国土地理院の実測地形を混ぜている所があり（例：桶狭間）、
  //   実測の細かい尾根が35度を超える所があって、道から離れると進めなくなってしまったため（kaito 10/1）
  walkable(x, z, y) {
    if (this.def.fieldNorth != null && (z < this.def.fieldNorth + 10 || z > this.half - 10 || Math.abs(x) > this.half - 10)) return false;
    if ((this.def.riverCross || this.def.streams?.some(st => st.fords?.length)) && this.waterFootDepthAt(x, z, groundAt(this, x, z, y ?? this.heightAt(x, z))) > (this.def.wadeDepth ?? 0.85)) return false;
    if (this.noClimb) for (const f of this.noClimb) if (f(x, z)) return false;
    if (!this.noClimb && this.def.climbTan == null) return true;
    return this.slopeTan(x, z) <= (this.def.climbTan ?? 0.70) || this.onRoad(x, z);   // 山の戦は def.climbTan で登れる急さを変える（比叡山）
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    // 昼用の半球光は空の映り込みを見込んで弱めてある。夜の暗い空では
    // 濡れた土・黒い具足が沈むので、影にも届く散乱光を一つだけ共有する。
    // 標準材質の人・旗と、低・中の地面の材質に同じ光を当てる。影の描き直しは足さない。
    this.nightFill = new THREE.HemisphereLight(0xc0d0ed, 0x8b9bb9, 0);
    this.scene.add(this.nightFill);
    this.nightU = { value: 0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const shadowMap = 2048;
    this.sun.shadow.mapSize.set(shadowMap, shadowMap);
    const s = this.sun.shadow.camera;
    s.left = -20; s.right = 20; s.top = 20; s.bottom = -20; s.near = 1; s.far = 300;   // 影は本人の回り 20m（兵の影16m・人の影11mを覆い、近くの影を細かく保つ）
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.025;
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
  // 道や荷車の通った筋を、草の倒れ方と地面で共有する。面や材質は増やさない。
  stampTrail(points, radius = 2, amount = 100) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(0.8, radius * 0.6)));
      for (let j = i === 1 ? 0 : 1; j <= steps; j++) this.stampWear(a[0] + dx * j / steps, a[1] + dz * j / steps, radius, amount);
    }
  }
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
    // 遠くの森：枝先の張りと垂れを持つ樹冠。形・材質は森全体で共用する。
    {
      const parts = [];
      const put = (geo, hex, foliage = false) => { scaleTreePart(geo, this.def.treeScale, foliage); const cc = new THREE.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3); for (let q = 0; q < n; q++) { const shade = foliage ? 0.62 + Math.max(0, geo.attributes.normal.getY(q)) * 0.3 + 0.08 * Math.sin(geo.attributes.position.getX(q) * 3 + geo.attributes.position.getZ(q) * 2) : 1; a[q * 3] = cc.r * shade; a[q * 3 + 1] = cc.g * shade; a[q * 3 + 2] = cc.b * shade; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(geo.index ? geo.toNonIndexed() : geo); };
      // 遠山の杉も近くと同じ一枝の絵で抜く。尖った多面体の影絵を残さない。
      // 四段・三方向の折れた房を全株で共用（葉は四十八面、従来は八十四〜百四十四面）。
      [[2.4, 4.8, 4.9], [2.05, 4.5, 7.0], [1.55, 4.2, 9.2], [0.9, 3.8, 11.1]].forEach(([r, h, y], tier) => {
        for (let j = 0; j < 3; j++) {
          const a = j * Math.PI * 2 / 3 + tier * 2.4;
          const cg = new THREE.PlaneGeometry(r * 2.2, h, 2, 1);
          const p = cg.attributes.position;
          for (let q = 0; q < p.count; q++) p.setZ(q, (1 - Math.abs(p.getX(q)) / (r * 1.1)) * r * 0.5);
          cg.rotateX(0.35); cg.rotateY(a);
          cg.translate(Math.cos(a) * r * 0.28, y + Math.sin(a * 2 + tier) * 0.35, Math.sin(a) * r * 0.28);
          const n = cg.attributes.normal;
          for (let q = 0; q < p.count; q++) n.setXYZ(q, p.getX(q) / r, (p.getY(q) - y) / h + 0.6, p.getZ(q) / r);
          cg.normalizeNormals();
          put(cg, [0x85977c, 0x91a185, 0xa0ae90, 0xacb99c][tier], true);
        }
      });
      const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, this.def.roundNeedles ? 8 : 4);
      // 負の座標は共通の葉材質で絵を読まない芯。幹も同じ一回の描画に含める。
      for (let q = 0; q < trunk.attributes.uv.count; q++) trunk.attributes.uv.setXY(q, -1, -1);
      trunk.translate(0, 1.5, 0); put(trunk, 0x9b7654);
      let sugiG = mergeGeometries(parts);
      if (true) {
        sugiG.dispose();
        const wood = parts[parts.length - 1];
        wood.setAttribute('treePlane', new THREE.Float32BufferAttribute(new Float32Array(wood.attributes.position.count), 1));
        sugiG = mergeGeometries([scaleTreePart(treeCards(5.8, 11.3, 7.0, 1), this.def.treeScale, true), wood]);
      }
      parts.length = 0;
      // 遠景の雑木も近景と同じ葉の絵で抜く。閉じた球を四つの枝房へ替える。
      // 三方向に浅く折り、横からも厚みを残す。葉は六十面から四十八面へ。
      // 専用の乱数は使わず、木の位置・本数・後続の景物の配置を保つ。
      const bareFar = this.def.treeScale && (this.def.winter || this.def.snow);
      (bareFar ? [] : [[-1.7, 5.2, 0.4, 3.8, 3.5], [1.6, 5.8, -0.5, 4.0, 3.7],
        [0.0, 6.2, 1.4, 3.7, 3.6], [-0.4, 7.6, -0.5, 3.5, 3.1]]).forEach(([x, y, z, w, h], tier) => {
        for (let j = 0; j < 3; j++) {
          const a = j * Math.PI * 2 / 3 + tier * 2.4;
          const cg = new THREE.PlaneGeometry(w, h, 2, 1);
          const p = cg.attributes.position;
          for (let q = 0; q < p.count; q++) p.setZ(q, (1 - Math.abs(p.getX(q)) / (w * 0.5)) * w * 0.22);
          cg.rotateX(0.25 + tier * 0.1); cg.rotateY(a);
          cg.translate(x, y + Math.sin(a + tier) * 0.25, z);
          const n = cg.attributes.normal;
          for (let q = 0; q < p.count; q++) n.setXYZ(q, p.getX(q) / 4.1, (p.getY(q) - 6) / 2.9 + 0.6, p.getZ(q) / 3.5);
          cg.normalizeNormals();
          put(cg, [0x819373, 0x8b9d7c, 0x95a585, 0xa6b494][tier], true);
        }
      });
      // 冬の雑木は葉を置かず、遠くでは三本の粗い裸枝を幹と同じ一回で描く。
      if (bareFar) for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        const br = new THREE.CylinderGeometry(0.025, 0.09, 3.4, 4, 1, true);
        for (let q = 0; q < br.attributes.uv.count; q++) br.attributes.uv.setXY(q, -1, -1);
        br.rotateZ(0.65); br.rotateY(a);
        br.translate(-Math.cos(a), 6.3, Math.sin(a)); put(br, 0x9b7654);
      }
      const trunk2 = new THREE.CylinderGeometry(0.25, 0.35, bareFar ? 7 : 4, 4);
      for (let q = 0; q < trunk2.attributes.uv.count; q++) trunk2.attributes.uv.setXY(q, -1, -1);
      trunk2.translate(0, bareFar ? 3.5 : 2, 0); put(trunk2, 0x9b7654);
      const broadG = mergeGeometries(parts);
      const NT = 1000;
      // 遠くは軽い陰影のまま。葉の絵と形を全株で共用し、描画回数を増やさない。
      const mats = new THREE.MeshLambertMaterial({ map: leafTex('broad'), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
      mats.onBeforeCompile = (sh) => { treeLeafMap(sh); keepAlpha(sh); };
      const needles = sway(liteMat({ map: leafTex('cedar'), color: 0xffffff, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.25 }), 0.02, 2.5, { after: leafLit });
      const sm = new THREE.InstancedMesh(sugiG, needles, NT), bm = new THREE.InstancedMesh(broadG, mats, NT);
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
      // 画質「低」（携帯）：遠くの森は五本に一本だけ描く（霞の中の影絵なので数を減らしても森に見える。置き方の乱数は変えない）
      // 遠くの森が一本も無い戦（高遠）は色の入れ物が無いので飛ばす（前は低で開戦できなかった）
      //   高は二本に一本（霞の奥の影絵の森。画面の外も描かない）
      const farKeep = 2;
      for (const m of [sm, bm]) {
        if (!m.count || !m.instanceColor) continue;
        const A = m.instanceMatrix.array, C = m.instanceColor.array, n = Math.ceil(m.count / farKeep), K = farKeep;
        for (let j = 1; j < n; j++) { A.copyWithin(j * 16, j * 16 * K, j * 16 * K + 16); C.copyWithin(j * 3, j * 3 * K, j * 3 * K + 3); }
        m.count = n;
      }
      this.treeCardSavings += sm.count * 46 + bm.count * 58;
      this.viewCull([sm], 0); this.viewCull([bm], 0);
      this.scene.add(sm, bm);
      this.farTreeMeshes = [sm, bm];
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
    this.buildMountainDetails();
  }
  // 山の面から設営時に位置を拾い、森の帯と露岩を二つの束で描く。
  buildMountainDetails() {
    // 減らした葉の三角の範囲に収める。木の少ない戦でも地形全体の三角を増やさない。
    const budget = Math.min(1024, Math.max(0, (this.treeCardSavings || 0) - 1));
    const treeCap = Math.min(192, Math.floor(budget * 0.375 / 2));
    const rockCap = Math.min(32, Math.floor((budget - treeCap * 2) / 20));
    if (!treeCap && !rockCap) return;
    const R = rng((this.def.seed || 5) * 41 + 85), d = new THREE.Object3D();
    const foliage = new THREE.MeshLambertMaterial({ map: leafTex('treeCedar'), color: 0x758766,
      vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false });
    const stone = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false });
    const haze = (sh) => {
      sh.uniforms.uMountainHaze = this.mountU.hazeCol;
      sh.uniforms.uMountainSky = this.skyMat.uniforms.top;
      sh.uniforms.uMountainVis = this.mountU.vis;
      sh.fragmentShader = 'uniform vec3 uMountainHaze, uMountainSky; uniform float uMountainVis;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float mountainAir = clamp(1.0 - exp(-length(vViewPosition) / max(20.0, uMountainVis) * 1.9), 0.0, 0.97);
        vec3 mountainAirColor = mix(uMountainHaze, uMountainSky, 0.18);
        outgoingLight = mix(outgoingLight, mountainAirColor, mountainAir);
        #include <opaque_fragment>`);
    };
    foliage.forceSinglePass = true;
    foliage.onBeforeCompile = sh => { farTreeLit(sh); haze(sh); };
    stone.onBeforeCompile = haze;
    const trees = new THREE.InstancedMesh(treeCards(4.5, 9, 4.5, 1), foliage, treeCap);
    const rocks = new THREE.InstancedMesh(rockShape(1, false, 0), stone, rockCap);
    let nt = 0, nr = 0;
    for (let i = 0; i < 384 && (nt < treeCap || nr < rockCap); i++) {
      const layer = i % 2, surface = this.mountains.children[layer];
      const p = surface.geometry.attributes.position, rows = 5, columns = p.count / (rows + 1) - 1;
      const angle = R() * columns, row = 1 + R() * 3.5;
      const a = Math.floor(angle), b = Math.floor(row), u = angle - a, v = row - b;
      const k = a * (rows + 1) + b, k2 = k + rows + 1;
      // 山の三角形と同じ対角線で補間し、木や岩を空中に浮かせない。
      const ids = u + v <= 1 ? [k, k2, k + 1] : [k2 + 1, k + 1, k2];
      const weights = u + v <= 1 ? [1 - u - v, u, v] : [u + v - 1, 1 - u, 1 - v];
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < 3; j++) { x += p.getX(ids[j]) * weights[j]; y += p.getY(ids[j]) * weights[j]; z += p.getZ(ids[j]) * weights[j]; }
      const band = Math.sin(angle * 0.13 + layer * 2) + Math.cos(angle * 0.047 - row * 0.7);
      if (y < 0 || band < -0.25) continue;
      d.position.set(x, y - 0.6, z); d.rotation.set(0, R() * Math.PI * 2, 0);
      if (band > 0.35 && nt < treeCap) {
        const sc = 0.65 + R() * 0.65; d.scale.set(sc, sc * (0.8 + R() * 0.4), sc); d.updateMatrix(); trees.setMatrixAt(nt++, d.matrix);
      } else if (nr < rockCap) {
        const sc = 1.2 + R() * 2; d.scale.set(sc * 1.5, sc, sc); d.updateMatrix(); rocks.setMatrixAt(nr++, d.matrix);
      }
    }
    trees.count = nt; rocks.count = nr;
    // 山と同じ親へ置き、既存の追従だけで動かす。影・風・毎コマの更新は足さない。
    trees.renderOrder = rocks.renderOrder = -0.8;
    this.mountains.children[0].add(trees, rocks);
  }
  // 出だしのカメラの周りの木を消す（近い枝葉の板が画面の上と右を塞ぐのを、全ての戦で防ぐ）。r メートル以内の株を畳む。
  clearTreesAround(x, z, r) {
    const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of [...(this.treeMeshes || []), ...(this.farTreeMeshes || [])]) {
      if (!m.isInstancedMesh) continue;
      let hit = false;
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, m4);
        const e = m4.elements;
        if (Math.hypot(e[12] - x, e[14] - z) < r) { m.setMatrixAt(i, zero); hit = true; }
      }
      if (hit) m.instanceMatrix.needsUpdate = true;
    }
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
    const CAP = 48, PER = 16;
    const pos = new Float32Array(CAP * PER * 3), seed = new Float32Array(CAP * PER * 2), soot = new Float32Array(CAP * PER);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
    geo.setAttribute('soot', new THREE.BufferAttribute(soot, 1));
    geo.setDrawRange(0, 0);
    if (!this.puffTex) this.makePuffTex();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.puffTex }, uTime: { value: 0 }, color: { value: new THREE.Color(0x9a958c) }, scale: { value: 420 }, wind: { value: new THREE.Vector2(WIND_STATE.dirX, WIND_STATE.dirZ) } },
      vertexShader: `attribute vec2 seed; attribute float soot; uniform float uTime, scale; uniform vec2 wind; varying float vA; varying float vSoot;
        void main(){
          vSoot = soot;
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
      fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; varying float vSoot; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(mix(color, vec3(0.065, 0.058, 0.052), vSoot), t.a * vA * mix(0.42, 0.62, vSoot)); if (gl_FragColor.a < 0.004) discard; }',
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.smokeCol = { pts, pos, seed, soot, n: 0, CAP, PER };
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
      S.soot[i] = o.black ? 1 : 0;
    }
    S.n++;
    const g = S.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.seed.needsUpdate = true;
    g.attributes.soot.needsUpdate = true;
    g.setDrawRange(0, S.n * S.PER);
    return S.n - 1;
  }
  // 手持ちの小さな煙だけ発生元を追わせる。粒と属性の入れ物は作り直さない。
  moveSmokeColumn(id, x, y, z) {
    const S = this.smokeCol;
    if (!S || id == null || id < 0 || id >= S.n) return;
    for (let k = 0; k < S.PER; k++) {
      const i = (id * S.PER + k) * 3;
      S.pos[i] = x; S.pos[i + 1] = y; S.pos[i + 2] = z;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
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
      const L = Math.max(0.5, Math.min(3.8, this.def.nightLift ?? 3.4));
      t = { ...t, sunI: t.sunI * Math.min(1.3, L), hemiI: t.hemiI * L };
    }
    if ((key === 'noon' || key === 'afternoon' || (key === 'day' && this.mood !== 'morning')) && this.summer) t = { ...t, sunI: t.sunI * 1.14, hemiI: t.hemiI * 0.86, top: 0x4a74a6, sky: 0xa9b8c2, vis: t.vis * 0.85, cloud: t.cloud * 0.8, cover: t.cover * 0.8, sunPos: [60, 96, -40] };
    // 日中の空と地面の照り返し。時間の移ろいにも同じ指定を渡す。
    if (this.def.dayBounce && ['day', 'morning', 'noon', 'afternoon'].includes(key)) {
      t = { ...t, hemiI: t.hemiI * this.def.dayBounce, hemiGround: this.def.bounceGround ?? t.hemiGround };
    }
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
    // 谷の霞へ山肌の色を残す。色の入れ物は初回だけ用意する。
    if (this.def.fogTint != null) this.scene.fog.color.lerp(this.fogTint || (this.fogTint = new THREE.Color(this.def.fogTint)), this.def.fogTintStrength ?? 0.45);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI * LIGHT_K.sun * (this.rainDim || 1);
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI * LIGHT_K.hemi;
    this.baseHemi = this.hemi.intensity;
    this.sunOffset.copy(L.sunDir).multiplyScalar(120);
    const U = this.skyMat.uniforms;
    U.top.value.copy(L.top); U.bottom.value.copy(this.scene.fog.color);
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
    // 雨の散乱光は曇った空の灰青。夜は既存の月の光と影で、
    // 兜・斜面の月に向いた面を読み、背面や軒下には暗がりを残す。
    const rain = Math.max(0, Math.min(1, this.rainLevel || 0));
    // 補助光だけを足すと兵も山肌も同じ灰青になる。既存の月の直射を強め、
    // 兜の縁・肩・具足の受光面と、その裏の陰を分ける。月の向きと影は共通。
    this.sun.intensity = Math.max(this.sun.intensity, (this.def.nightMoonMin ?? 0.95) * k);
    // 晴天の補助光が空の映り込み・半球光と重なると、門の陰も土も白く浮く。
    // 晴れは弱い空の返りだけにし、雲・雨が増えた時だけ従来の散乱光まで戻す。
    // 日差しと遠景の霞は保ち、近い具足の受光面・木戸の陰との明暗差を出す。
    const cover = this.skyMat.uniforms.cover.value;
    const scatter = THREE.MathUtils.smoothstep(Math.max(cover, rain), 0.35, 0.85);
    const dayFill = 0.28 + 0.54 * scatter;
    // 夜の指定と雨・夕暮れの見やすさは保ち、移ろいの間も連続して変える。
    this.nightFill.intensity = dayFill * (1 - k) + (this.def.nightFill ?? 0.62) * k + (0.4 * dusk + 0.35 * rain * (1 - dusk)) * (1 - k);
    // 夜の下向きの面は土からの弱い返りだけ。月の冷色と火の暖色を分ける。
    this.nightFill.color.setRGB(0.75 - 0.30 * k, 0.82 - 0.29 * k, 0.93 - 0.25 * k).lerp(this.hemi.color, 0.3 * (1 - k));
    this.nightFill.groundColor.setRGB(0.28 - 0.16 * k, 0.25 - 0.12 * k, 0.21 - 0.05 * k);
    // 晴天は締まった影、低い日・曇天・雨は柔らかい縁。影の枚数は増やさない。
    const height = Math.max(0, this.skyMat.uniforms.sunDir.value.y);
    this.sun.shadow.radius = 1 + cover * 0.8 + rain * 0.55 + (1 - height) * 0.3;
    // 昼の散乱光は頭上の空から。太陽に追従させて木戸の側面まで持ち上げない。
    // 夜は従来の月の向きへ寄せる。既存の光を使い、光源も影の描画も増やさない。
    this.nightFill.position.copy(this.sunOffset).normalize();
    this.nightFill.position.y = Math.max(0.65, this.nightFill.position.y);
    this.nightFill.position.multiplyScalar(k);
    this.nightFill.position.y += 1 - k;
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
  prepareBolt() {
    if (!this.bolt) {
      // 二層の帯を一つの形に束ねる。平らな帯なので裏表を分けて描く必要はない。
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
      const g = new THREE.BufferGeometry();
      // 幹は最大十七節、枝は四節。各節に芯六頂点・淡い光六頂点を並べる。
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 36), 3).setUsage(THREE.DynamicDrawUsage));
      const colors = new Float32Array(21 * 12 * 4), core = new THREE.Color(0xeef2ff), glow = new THREE.Color(0x8ea4ff);
      for (let i = 0; i < 21 * 12; i++) {
        const isCore = i % 12 < 6, c = isCore ? core : glow, at = i * 4;
        colors[at] = c.r; colors[at + 1] = c.g; colors[at + 2] = c.b; colors[at + 3] = isCore ? 0.95 : 0.22;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      g.setDrawRange(0, 0);
      this.bolt = new THREE.Mesh(g, mat);
      this.boltPoints = new Float64Array(18 * 2);
      this.boltBranch = new Float64Array(5 * 2);
      this.bolt.renderOrder = -1;
      this.bolt.frustumCulled = false;
      // 閃光前の色も支度中に用意し、雷が鳴るたびに複製しない。
      this.hemiCol0 = this.hemi.color.clone();
      this.scene.add(this.bolt);
      this.bolt.visible = false;
    }
  }

  showBolt(focus) {
    this.prepareBolt();
    const D = Math.max(300, Math.min(455, 250 + (this.boltD || 900) * 0.1)), a = Math.random() * Math.PI * 2;
    const cx = Math.sin(a), cz = Math.cos(a), rx = cz, rz = -cx;   // 横の向き（見る向きに直角）
    // 幹：上から下へ、横にぎざぎざ。途中から枝が一本
    const pts = this.boltPoints, br = this.boltBranch;
    pts[0] = 0; pts[1] = 230;
    let x = 0, y = 230, count = 1;
    while (y > 0) { y -= 14 + Math.random() * 16; x += (Math.random() - 0.5) * 26; pts[count * 2] = x; pts[count * 2 + 1] = Math.max(-5, y); count++; }
    const bi = 2 + Math.floor(Math.random() * 3);
    let bx = pts[bi * 2], by = pts[bi * 2 + 1];
    br[0] = bx; br[1] = by;
    const bs = Math.random() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 4; k++) { by -= 12 + Math.random() * 10; bx += bs * (8 + Math.random() * 12); br[k * 2] = bx; br[k * 2 + 1] = by; }
    const g = this.bolt.geometry, attr = g.attributes.position, pos = attr.array;
    for (let layer = 0; layer < 2; layer++) {
      const w = layer ? 12 : 2.2;
      let segment = 0;
      for (let branch = 0; branch < 2; branch++) {
        const L = branch ? br : pts, n = branch ? 5 : count;
        for (let i = 0; i < n - 1; i++) {
          const x0 = L[i * 2], y0 = L[i * 2 + 1], x1 = L[i * 2 + 2], y1 = L[i * 2 + 3];
          const ww = w * (i === 0 ? 0.7 : 1) * (branch ? 0.6 : 1);
          let at = segment++ * 36 + layer * 18;
          for (let v = 0; v < 6; v++) {
            const end = v === 2 || v >= 4, px = end ? x1 : x0, py = end ? y1 : y0;
            const offset = v === 0 || v === 3 || v === 5 ? -ww : ww;
            pos[at++] = cx * D + rx * (px + offset); pos[at++] = py; pos[at++] = cz * D + rz * (px + offset);
          }
        }
      }
    }
    g.setDrawRange(0, (count - 1 + 4) * 12); attr.needsUpdate = true;
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
        cloudTime: { value: 0 }, cloudShift: { value: new THREE.Vector2() }, lowDetail: { value: 0 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, bottom, glow, sunCol, sunDir; uniform vec2 cloudShift; uniform float glowK, flash, time, cover, cloudDark, pall, rain, age, cloudTime, lowDetail; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        // 低でも雲の大きな形と縁は残す。細かい三段だけ省き、濃さをそろえる
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { if (lowDetail > 0.5 && k >= 2) break; v += a * n(p); p *= 2.03; a *= 0.5; } return v * mix(1.0, 0.96875 / 0.75, lowDetail); }
        float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 3; k++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v / 0.875; }
        void main(){
          vec3 d = normalize(vP);
          // 雨の日は雲が空を覆い、暗く重い
          float cov = clamp(max(cover, rain * 0.9), 0.0, 0.97), cdk = max(cloudDark, rain * 0.5);
          float hgt = clamp(d.y * 1.5 + 0.04, 0.0, 1.0);
          // 地平の霞から中空の灰青、天頂の深い青へ。新しい雑音は足さない。
          vec3 middle = mix(bottom, top, 0.55) * vec3(0.97, 0.99, 1.02);
          vec3 c = mix(bottom, middle, smoothstep(0.0, 0.42, hgt));
          c = mix(c, top, smoothstep(0.18, 1.0, hgt));
          float sd = max(0.0, dot(d, normalize(sunDir)));
          // 夜は月の淡い輪だけ。雲も空の明るさを受け、昼の白い雲にならない
          float skyLight = dot(top, vec3(0.2126, 0.7152, 0.0722));
          float daylight = smoothstep(0.015, 0.1, skyLight);
          float cloudLight = clamp(skyLight * 5.0, 0.035, 1.0);
          c += sunCol * (pow(sd, 8.0) * 0.1 + pow(sd, 64.0) * 0.22) * (1.0 - cov * 0.6) * mix(0.12, 1.0, daylight);
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
            // 低い日は横に伸びた雲、雨は大きく重なる雲。雑音の回数は増やさない。
            vec2 uvw = uv * mix(vec2(1.0), vec2(0.7, 1.65), glowK * (1.0 - rain))
              + (warp - 0.5) * mix(0.9, 0.45, max(rain, cov - 0.4));
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
            ccol += sunCol * pow(sd, 5.0) * (1.0 - smoothstep(0.2, 0.9, dens)) * 0.3 * (1.0 - cdk);
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
            // 高い薄雲は三段で十分。空一面の雑音計算を減らして光と煙の調整分を抑える。
            float thin = lowDetail > 0.5 ? n(uv2 * vec2(2.4, 0.7)) : fbm3(uv2 * vec2(2.4, 0.7));
            float ci = smoothstep(0.55, 0.85, thin) * (1.0 - dens) * fade * (1.0 - cov * 0.8);
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
    this.mountU = { skyCol: this.skyMat.uniforms.top, highDetail: { value: 1}, hazeCol: { value: new THREE.Color() }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol, glow: this.skyMat.uniforms.glow, glowK: this.skyMat.uniforms.glowK, mist: { value: 0 }, vis: { value: 500 }, rain: { value: 0 }, night: this.nightU };
    // 一番奥の峰は高く（峰で 150m ほど）、稜線を細かく刻んで、平たい丘の輪に見えないように
    [[330, 28, 1.0], [385, 62, 0.75], [440, 118, 0.6]].forEach(([rad, H, sharp], layer) => {
      const low = false;
      const N = layer === 2 ? (low ? 240 : 480) : (low ? 120 : 240), ROWS = low ? 3 : 5, pos = [], uv = [], crest = [], idx = [];
      const ph = M() * 10, ph2 = M() * 10, ph3 = M() * 10;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // 広い谷と片寄った峰を作り、同じ幅の山が並ぶ周期を崩す。端は閉じる。
        const bend = a + Math.sin(a * 2 + ph3) * 0.23 + Math.sin(a * 3 + ph3) * 0.11 + Math.sin(a * 7 + ph2) * 0.035;
        const massif = 0.78 + Math.sin(a * 2 + ph2) * 0.17 + Math.cos(a * 3 + ph) * 0.12;
        // 谷底を丸め、遠い層ほど細かな刻みを抑える。頂点数を増やさず鋸歯状の書き割りを避ける。
        const roll = (v) => Math.sqrt(Math.sin(v) ** 2 + 0.025) - 0.04;
        let ridge = roll(bend * 5 + ph) * 0.5 + roll(bend * 11 + ph2) * 0.3 * sharp + Math.sin(a * 23 + ph) * 0.07 * sharp + Math.sin(a * 47 + ph2) * 0.018 * sharp + Math.sin(a * 83 + ph3) * 0.009 * sharp * sharp;
        // 奥の峰：高い峰がところどころに立ち、稜線に小さな凸凹（岩と木の刻み）
        if (layer === 2) ridge = ridge * 0.7 + Math.pow(Math.abs(Math.sin(a * 3 + ph3)), 3) * 0.45;
        const hh = (H * (0.25 + ridge * massif) - layer * 4) * (this.def.mountainScale ?? 1);
        const spur = Math.sin(bend * 19 + ph2) * 0.65 + Math.sin(bend * 31 + ph3) * 0.35;
        for (let r = 0; r <= ROWS; r++) {
          // 頂点数を増やさず、裾から峰へ奥行きを付ける。角度の周期を閉じ、継ぎ目も割らない。
          const base = this.def.mountainBase ?? -12;
          const f = r / ROWS, belly = Math.sin(Math.PI * f);
          // 同じ頂点を尾根では手前へ、沢では奥へ振る。裾と頂は固定し、中腹に厚みを持たせる。
          const y = base + (hh - base) * (Math.pow(f, 0.85) + spur * belly * 0.1);
          const rr = rad - (48 + H * 0.22) * (1 - f) + Math.sin(a * 9 + ph2) * 12 * f
            + (Math.sin(a * 17 + ph3) * 14 + Math.sin(a * 7 + ph) * 18) * f * (1 - f) - spur * belly * (18 + H * 0.12);
          pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
          uv.push(a * rad, y); crest.push(f);
          if (i < N && r < ROWS) { const k = i * (ROWS + 1) + r, k2 = k + ROWS + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
        }
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      mg.setAttribute('crest', new THREE.Float32BufferAttribute(crest, 1));
      mg.setIndex(idx);
      mg.computeVertexNormals();
      // 円周の両端は同じ場所。法線も合わせ、山肌に一本の継ぎ目を残さない。
      const normals = mg.attributes.normal;
      for (let r = 0; r <= ROWS; r++) {
        const end = N * (ROWS + 1) + r;
        const nx = normals.getX(r) + normals.getX(end), ny = normals.getY(r) + normals.getY(end), nz = normals.getZ(r) + normals.getZ(end);
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.setXYZ(r, nx / len, ny / len, nz / len); normals.setXYZ(end, nx / len, ny / len, nz / len);
      }
      const mat = new THREE.ShaderMaterial({
        fog: false, side: THREE.DoubleSide, transparent: true, depthWrite: false,
        uniforms: { ...this.mountU, color: { value: new THREE.Color(0x33443e) }, haze: { value: this.def.mountainHaze ?? 0.5 }, layer: { value: layer } },
        vertexShader: 'attribute float crest; varying float vCrest; varying vec2 vUv; varying vec3 vP; varying vec3 vW; varying vec3 vN; void main(){ vCrest = crest; vUv = uv; vP = position; vN = normal; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 color, hazeCol, skyCol, sunDir, sunCol, glow; uniform float haze, layer, mist, vis, rain, glowK, night, highDetail; varying float vCrest; varying vec2 vUv; varying vec3 vP; varying vec3 vW; varying vec3 vN;
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
            c *= mix(mix(0.75, 0.48, night), mix(1.25, 0.78, night), lit) * mix(vec3(1.0), sunCol, 0.15);
            // 山を内側から見る面の法線。月夜も尾根の受光面と沢の陰を分ける。
            vec3 slopeN = -normalize(vN);
            float slopeLight = max(0.0, dot(slopeN, normalize(sunDir)));
            c *= mix(0.65, 1.3, slopeLight) * mix(0.85, 1.08, max(0.0, slopeN.y));
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
            float mistY = clamp(dv.y, -30.0, 120.0) * 0.024;
            float hf = abs(mistY) < 0.01 ? 1.0 - mistY * 0.5 : (1.0 - exp(-mistY)) / mistY;
            // 張り出す尾根は薄い靄、奥まる沢は濃い靄。距離と高さの霧に重ねる。
            float hollow = smoothstep(0.25, 0.8, streak) * sin(vCrest * 3.141593);
            float fogK = 1.0 - exp(-length(dv) / max(20.0, vis) * (1.65 + hollow * 0.6) * hf);
            // 層ごとの霞：奥の峰ほど裾まで淡く、層と層の間の谷に靄の帯が溜まる（重なった山が影絵のように抜ける）
            float valley = (1.0 - smoothstep(-12.0, 18.0 + layer * 14.0, vP.y)) * (0.1 + mist * 0.3 + layer * 0.07);
            // 山の頂がカメラより高い谷の中でも、見通しの短い夜・雨には距離だけで霞ませる（手前の霞んだ尾根の上に、黒い山が逆さに浮いて見えないように）
            float fogFlat = 1.0 - exp(-length(dv) / max(20.0, vis) * 1.2);
            // 夜だけ霞の上限を下げると、霧の向こうに黒い板が残る。昼夜とも距離の霞を保ち、山肌はわずかに残す。
            float hz = clamp(max(max(fogK * 0.97, haze), fogFlat * 0.92) + valley + hollow * 0.035 + rain * 0.2, 0.0, 0.97);
            float sI = pow(max(dot(d, normalize(sunDir)), 0.0), 6.0);
            vec3 hc = (hazeCol + sunCol * sI * 0.12 * (1.0 - night)) * mix(vec3(0.9, 0.97, 1.08), vec3(0.96, 0.98, 1.0), night);   // 霧の式と同じく、遠くは青を帯びる
            // 朝夕は、日の方の霞が焼けの色に染まる
            float toS = clamp(dot(d.xz, normalize(sunDir.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
            hc = mix(hc, hc * 0.75 + glow * 0.35, glowK * toS * toS * (0.2 + layer * 0.1) * (1.0 - rain));
            // 山の裾は野の霞につなぎ、峰へ向かうほど空の青と焼けの色を残す
            hc = mix(hazeCol, hc, smoothstep(-8.0, 45.0 + layer * 15.0, vP.y));
            // 裾の不透明な切り口を霞へ溶かす。夜の稜線も細くほどき、明るい縁取りを作らない。
            float edge = smoothstep(0.0, 0.18, vCrest) * (1.0 - night * smoothstep(0.985, 1.0, vCrest));
            // 同じ距離の峰でも、張り出す尾根と谷の靄を分ける。夜の霧を一枚の灰色にしない。
            float shoulder = dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.3)));
            // 晴れた遠い峰ほど空の青へ。夜・雨・夕焼けは既存の空の色を受け継ぐ。
            float aerial = smoothstep(240.0, 650.0, length(dv)) * highDetail;
            hc = mix(hc, mix(hazeCol, skyCol, 0.32 + layer * 0.09), aerial * 0.55 * (1.0 - glowK * toS * 0.7));
            hz = min(0.97, hz + aerial * (0.04 + layer * 0.025));
            vec3 mountain = mix(c, hc, hz);
            mountain *= 1.0 + (shoulder - 0.4) * (0.16 - layer * 0.035) * (1.0 - rain * 0.65)
              * smoothstep(0.05, 0.65, vCrest);
            gl_FragColor = vec4(mountain, edge);
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
    // 焼くための作業用の的（768×1024 の半精度 ×2）は毎回手放す（iPhone の WebContent の 2GB を少しでも空ける。次に焼く時に作り直す）
    this.pmrem.dispose(); this.pmrem = null;
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
  makePuffs(N, color, grow, alpha, drops = false) {
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
      vertexShader: `attribute float life; attribute float lmax; varying float vA; varying float vLit; uniform float scale; uniform vec3 sunDir; void main(){ float t = 1.0 - clamp(life / lmax, 0.0, 1.0); vA = life > 0.0 ? (1.0 - t) * smoothstep(0.0, 0.15, t) : 0.0; vec4 wp = modelMatrix * vec4(position, 1.0); vLit = pow(max(dot(normalize(wp.xyz - cameraPosition), normalize(sunDir)), 0.0), 3.0); vec4 mv = viewMatrix * wp; gl_PointSize = (${drops ? '0.055' : '0.25'} + t * ${grow.toFixed(2)}) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color, sunCol; varying float vA; varying float vLit; void main(){ vec4 t = ${drops ? 'vec4(1.0, 1.0, 1.0, 1.0 - smoothstep(0.25, 0.5, length(gl_PointCoord - 0.5)))' : 'texture2D(map, gl_PointCoord)'}; vec3 c = color * (0.85 + vLit * 0.5) + sunCol * vLit * 0.08; gl_FragColor = vec4(c, t.a * vA * ${alpha.toFixed(2)}); if (gl_FragColor.a < 0.004) discard; }`,
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
    this.sprayP = this.makePuffs(160, 0xd6dee0, 0.03, 0.8, true);
    this.buildFootWaves();
    this.dustMat = this.dustP.points.material;
    this.buildHaze();
  }

  // 波紋は一つの形・材質・固定の配列を使い回す。低画質でも一回の描画。
  buildFootWaves() {
    const N = this.def.streams?.some(st => st.sedimentWater) ? 20 : (64);
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const age = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('waveAge', age);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb4c4bf, transparent: true, opacity: 0.32, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float waveAge; varying float vWaveAge; varying vec2 vWaveUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaveAge = waveAge; vWaveUv = uv;');
      sh.fragmentShader = 'varying float vWaveAge; varying vec2 vWaveUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 q = vWaveUv * 2.0 - 1.0;
        float r = length(q), a = atan(q.y, q.x);
        float edge = 0.78 + sin(a * 5.0 + vWaveAge * 2.0) * 0.025;
        float ring = 1.0 - smoothstep(0.018, 0.065, abs(r - edge));
        diffuseColor.a *= ring * (1.0 - vWaveAge) * smoothstep(0.0, 0.08, vWaveAge);
        if (diffuseColor.a < 0.004) discard;`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    this.footWaves = { mesh, age, data: new Float32Array(N * 4), dummy: new THREE.Object3D(), i: 0 };
  }
  updateFootWaves(dt) {
    const W = this.footWaves;
    if (!W) return;
    let count = 0;
    for (let i = 0; i < W.age.count; i++) {
      const j = i * 4;
      W.data[j + 3] = SETTINGS.reduceMotion ? 0 : Math.max(0, W.data[j + 3] - dt);
      const life = W.data[j + 3], t = 1 - life / 0.85;
      W.age.array[i] = t;
      W.dummy.position.set(W.data[j], W.data[j + 1], W.data[j + 2]);
      W.dummy.scale.setScalar(life > 0 ? 0.18 + t * 0.85 : 0);
      W.dummy.updateMatrix(); W.mesh.setMatrixAt(i, W.dummy.matrix);
      if (life > 0) count = i + 1;
    }
    W.mesh.count = count; W.mesh.visible = count > 0;
    if (count) {
      W.mesh.material.color.set(0xb4c4bf).multiply(this.hemi.color);
      W.mesh.instanceMatrix.needsUpdate = true; W.age.needsUpdate = true;
    }
  }

  // ---------------- 硝煙の名残 ----------------
  // 鉄砲の煙（兵の側で出す一瞬の煙）の跡に、低くたなびく大きな薄い煙を残す。何挺も撃つと、しばらく前が霞む
  buildHaze() {
    // 硝煙は重く、地面近くに低く溜まって横へ流れる（平たく、低い所に置く）
    this.haze = this.makeVeil(0xc2c2be, 160, 404, 0.5);
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
    if (this.def.noShafts) want = 0;
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
    const amt = Math.max(early, after, this.mood === 'morning' && this.timeKey === 'day' ? (this.dayClock ? 0.3 * morningMist : 0.12 + 0.18 * morningMist) : 0, this.def.mist && !this.dayClock ? 0.2 : 0, rainMist) * (1) * (this.def.groundMistScale ?? 1);
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
          // 粒の年齢と発生位置で渦をずらす。同じ煙の絵が一斉に膨らむ印象を消す。
          float turn = dat.z * 0.65 + ctr.x * 0.017 + ctr.z * 0.013;
          float cs = cos(turn), sn = sin(turn);
          vUv = mat2(cs, -sn, sn, cs) * (uv - 0.5) * 0.78 + 0.5;
          vec4 mv = modelViewMatrix * vec4(ctr, 1.0);
          mv.xy += position.xy * vec2(dat.x * 1.6, dat.x * ${flat.toFixed(2)});
          // カメラのすぐ前では薄く（板が顔を横切らないように）
          vA = dat.y * smoothstep(${near[0].toFixed(1)}, ${near[1].toFixed(1)}, -mv.z);
          // 日の光：日の方を見ると光を通して明るく、日を背にすると陰の灰
          vec3 vd = normalize(ctr - cameraPosition);
          float fw = pow(max(dot(vd, normalize(sunDir)), 0.0), 3.0);
          vec3 c = mix(color, fogC * 1.02, smoothstep(0.1, 0.9, dat.z) * 0.6);
          // 煙は自ら光らない：霞の明るさ（＝その時の空の明るさ）に合わせて沈める。夕暮れ・夜に白く光る綿にならない
          float amb = clamp(dot(fogC, vec3(0.3, 0.59, 0.11)) * 1.3, 0.2, 0.9);
          vC = (c * (0.78 + fw * 0.25) + sunCol * fw * 0.035) * amb;
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
    // 狭い攻城路の指定だけ、煙の名残を小さく短くする。ほかの戦は従来どおり。
    const scale = Math.max(.25, Math.min(1, this.def.gunHazeScale ?? 1));
    if (environment && (SETTINGS.reduceMotion || H.list.length >= (32))) return;
    if (tint) H.mesh.material.uniforms.color.value.set(tint);
    // 同じ列の一斉射は若い雲へ溜める。枚数を増やして前の射撃の煙を追い出さない。
    for (let i = H.list.length - 1; i >= 0; i--) {
      const p = H.list[i], dx = p.x - x, dz = p.z - z;
      if (p.t > 6 || dx * dx + dz * dz > 9) continue;
      p.a = Math.min(0.34 * scale, p.a + 0.06 * scale);
      if (!SETTINGS.reduceMotion) p.s1 = Math.min(24 * scale, p.s1 + scale);
      return;
    }
    const p = this.veilParticle(H);
    p.environment = environment;
    p.x = x + (Math.random() - 0.5) * 2; p.z = z + (Math.random() - 0.5) * 2;
    const calm = Math.max(0, Math.min(1, 1.15 - WIND_STATE.gust));
    p.t = 0; p.life = (32 + Math.random() * 22) * (1 + calm * 0.5) * scale; p.s0 = (4 + Math.random() * 2) * scale;
    p.s1 = (13 + Math.random() * 8) * scale; p.a = (0.16 + Math.random() * 0.08) * scale;
    H.fresh = (H.fresh || 0) + 1;
  }
  // 土煙を一つ置く（騎馬ほど大きい）
  dustCloud(x, z, big, environment = false, contact = false) {
    const D = this.dustVeil;
    if (!D) return;
    if (environment && (SETTINGS.reduceMotion || D.list.length >= (24))) return;
    // 騎馬の土煙は大きく高く舞い上がり、後ろの景色をかすませる
    const p = this.veilParticle(D);
    p.environment = environment; p.cosmetic = contact; p.yOff = contact;
    p.x = x + (Math.random() - 0.5) * 1.5; p.z = z + (Math.random() - 0.5) * 1.5;
    p.t = 0; p.life = (big ? 11 : 6) + Math.random() * 6; p.s0 = big ? 3 : 1.6;
    p.s1 = (big ? 12 : 5) + Math.random() * (big ? 6 : 4); p.a = (big ? 0.12 : 0.07) + Math.random() * 0.04;
    p.rise = (big ? 0.3 : 0.15) + Math.random() * 0.2;
    if (contact) {
      // 足首から膝の高さに留め、顔と退き道を覆わない。視界判定には加えない。
      p.life = 3 + Math.random(); p.s0 = 0.7; p.s1 = 2.4;
      p.a = 0.13; p.rise = 0.02;
    }
    D.fresh = (D.fresh || 0) + (contact ? 0 : big ? 0.4 : 0.15);
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
        const p = D.list[i];
        if (p.cosmetic) continue;
        const r = p.size * 0.8 + 3;
        const d = Math.hypot(p.x - focus.x, p.z - focus.z);
        if (d < r) dustLoad += D.dat[i * 3 + 1] * (1 - d / r);
      }
      const dT = Math.min(1, dustLoad * 3);
      D.k += (dT - D.k) * Math.min(1, dt * (dT > D.k ? 1.2 : 0.5));
    }
  }

  // 乾いた地面なら土ぼこり、濡れていれば泥はね（歩いた所は踏み荒らされていく）
  // 土・草・泥に足跡・蹄の跡を残す（四十八枠を使い回す。乾いた所は薄く）
  footprint(x, z, hoof, rot = Math.random() * 6.28) {
    if (!this.splat) return;
    const k = this.splatIdx ? this.splatIdx(x, z) : -1;
    const mud = k >= 0 ? this.splat[k * 3 + 2] : 0;
    const wet = this.rainLevel > 0.4 || (this.wetness || 0) > 0.5 || (this.def.muddy || 0) > 0.5;
    if (k < 0 || this.inWaterAt(x, z) || this.slopeTan(x, z) > 0.45) return;
    if (!this.feet) {
      const g = new THREE.CircleGeometry(0.5, 10); g.rotateX(-Math.PI / 2);
      // 全戦で光を受ける泥色にする。夜に道案内の橙の板として浮かせない。
      const mat = new THREE.MeshLambertMaterial({ color: 0x393329, transparent: true, opacity: 0.25, depthWrite: false, fog: true });
      this.feet = new THREE.InstancedMesh(g, mat, 48);
      this.feet.count = 0; this.feet.renderOrder = 1; this.feetI = 0; this.feetD = new THREE.Object3D();
      this.feetColor = new THREE.Color();
      this.feetPositions = new Float32Array(96);
      this.scene.add(this.feet);
    }
    // 残っている跡から一歩あける。足踏みや兵の密集で泥の板を重ねない。
    for (let j = 0; j < this.feet.count; j++) {
      const dx = x - this.feetPositions[j * 2], dz = z - this.feetPositions[j * 2 + 1];
      if (dx * dx + dz * dz < 1) return;
    }
    const d = this.feetD, i = this.feetI;
    this.feetI = (i + 1) % 48;
    this.feetPositions[i * 2] = x; this.feetPositions[i * 2 + 1] = z;
    d.position.set(x, this.heightAt(x, z) + 0.012, z);
    // 足跡も土の斜面へ沿わせる。一度置く時だけ測り、共用の面を使う。
    const sn = Math.sin(rot), cs = Math.cos(rot), step = 0.2;
    const sx = (this.heightAt(x + cs * step, z - sn * step)
      - this.heightAt(x - cs * step, z + sn * step)) / (step * 2);
    const sz = (this.heightAt(x + sn * step, z + cs * step)
      - this.heightAt(x - sn * step, z - cs * step)) / (step * 2);
    d.rotation.order = 'YXZ';
    d.rotation.set(-Math.atan(sz), rot, Math.atan(sx / Math.sqrt(1 + sz * sz)));
    if (hoof) d.scale.set(0.32, 1, 0.3); else d.scale.set(0.2, 1, 0.5);
    if (this.def.darkFootprints) d.scale.multiplyScalar(.8);
    d.updateMatrix();
    this.feet.setMatrixAt(i, d.matrix);
    // 白を掛ける乾いた跡は淡く、泥の跡は暗くする。同じ材質で描く。
    this.feet.setColorAt(i, this.feetColor.setScalar(this.def.darkFootprints || wet || mud >= 0.35 ? 0.35 : 1));
    this.feet.instanceColor.needsUpdate = true;
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
  streamLevelAt(st, x, z, nx, nz) {
    // 広い川で水面の勾配を定めた時は、浅瀬の川床に水面を引き下げない。
    if (st.levelAt) return st.levelAt(x, z);
    const bed = this.heightAt(x, z);
    let level = Math.min(bed - fordLift(st, x) + st.depth - (st.surfaceDrop ?? 0.15),
      this.heightAt(x + nx * st.w, z + nz * st.w) - 0.15,
      this.heightAt(x - nx * st.w, z - nz * st.w) - 0.15);
    // 細い川と浅瀬は、中央だけでなく渡る帯の低い川床でも膝以下にする。
    const shallow = st.depth <= 0.5 || (st.fords && st.fords.some(f => Math.abs(x - f.x) <= f.w - 4));
    if (shallow) for (let k = -5; k <= 5; k++) {
      const off = st.w * k / 6;
      level = Math.min(level, this.heightAt(x + nx * off, z + nz * off) + 0.35);
    }
    return level;
  }

  waterDepthAt(x, z) {
    let depth = 0;
    const ground = this.heightAt(x, z);
    for (const st of this.def.streams || NO_STREAMS) {
      if (!st.pts) continue;
      // 川の囲い（点の最小・最大に幅を足した箱）の外なら、線分ごとの距離を測らない（答えは同じ。兵ごとに毎コマ呼ばれるので。10/21）
      let bb = st._bb;
      if (!bb || bb.n !== st.pts.length || bb.w !== st.w) {
        bb = st._bb = { n: st.pts.length, w: st.w, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
        for (const p of st.pts) { if (p[0] < bb.x0) bb.x0 = p[0]; if (p[0] > bb.x1) bb.x1 = p[0]; if (p[1] < bb.z0) bb.z0 = p[1]; if (p[1] > bb.z1) bb.z1 = p[1]; }
        bb.x0 -= st.w; bb.x1 += st.w; bb.z0 -= st.w; bb.z1 += st.w;
      }
      if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
      let best = Infinity, cx = 0, cz = 0, bestSegment = 0, bestT = 0;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; cx = px; cz = pz; bestSegment = i; bestT = t; }
      }
      if (best >= st.w * st.w) continue;
      let level;
      const surface = st.surface;
      if (surface && surface.length >= 6 && st.surfaceSteps[bestSegment]) {
        const f = bestT * st.surfaceSteps[bestSegment], step = Math.min(Math.floor(f), st.surfaceSteps[bestSegment] - 1);
        const i = (st.surfaceStarts[bestSegment] + step) * 3, t = f - step;
        level = surface[i + 2] + (surface[i + 5] - surface[i + 2]) * t;
      } else {
        const a = st.pts[bestSegment], b = st.pts[bestSegment + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        level = this.streamLevelAt(st, cx, cz, -(b[1] - a[1]) / len, (b[0] - a[0]) / len);
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
    if (!P || SETTINGS.reduceMotion || n <= 0) return;
    const depth = this.waterDepthAt(x, z);
    if (depth <= 0.02) return;
    const y = this.heightAt(x, z) + depth + 0.025;
    const W = this.footWaves;
    if (W) {
      const j = W.i * 4;
      W.data[j] = x; W.data[j + 1] = y; W.data[j + 2] = z; W.data[j + 3] = 0.85;
      W.i = (W.i + 1) % W.age.count;
    }
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
    if (this.inWaterAt(x, z)) { this.spray(x, z, n >= 2 ? 5 : 2); return; }
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
    const mat = new THREE.MeshPhongMaterial({ color: 0x39413b, shininess: 45, specular: 0x5d665d, transparent: true, opacity: 0.75, depthWrite: false });
    // 同じ面の中で泥色へ移り、外縁を透かす。縁の板や描画は足さない。
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPuddleMud = { value: new THREE.Color(0x60513c) };
      sh.vertexShader = 'attribute float puddleEdge; varying float vPuddleEdge;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPuddleEdge = puddleEdge;');
      sh.fragmentShader = 'uniform vec3 uPuddleMud; varying float vPuddleEdge;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float mudEdge = smoothstep(0.5, 0.9, vPuddleEdge);
          diffuseColor.rgb = mix(diffuseColor.rgb, uPuddleMud, mudEdge);
          diffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, vPuddleEdge);`)
        .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\n specularStrength *= 1.0 - mudEdge;');
    };
    const paths = this.def.paths || [];
    const R = rng(77);
    // 縁のいびつな水たまりを何通りか作る（丸い円板が並ばないように）
    const shapes = [0, 1, 2, 3].map(() => {
      const g = new THREE.CircleGeometry(1, 18); const P = g.attributes.position;
      const edge = new Float32Array(P.count); edge.fill(1, 1);
      g.setAttribute('puddleEdge', new THREE.BufferAttribute(edge, 1));
      const f1 = 1 + Math.floor(R() * 3), f2 = 3 + Math.floor(R() * 3), p1 = R() * 6, p2 = R() * 6;
      for (let k = 1; k < P.count; k++) { const x = P.getX(k), y = P.getY(k), a = Math.atan2(y, x); const m = 1 + Math.sin(a * f1 + p1) * 0.22 + Math.sin(a * f2 + p2) * 0.1; P.setXY(k, x * m, y * m); }
      g.rotateX(-Math.PI / 2); return g;
    });
    // 水たまりは一つずつ描く（一つ一回）ので、画質「低」（携帯）は 8 つまで
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
  //   army.follow(fn, { gap, speed })       fn() が返す { x, z, facing } の後ろへ付く（速さの既定は2.6、nullで止まる）
  addDistantArmy(o) {
    const mon = o.mon || o.flag || o.flagTex?.userData.mon;
    const familyMon = o.yoseFamily || (['takeda', 'akazonae', 'furin', 'azai', 'asakura', 'imagawa'].includes(o.flag) ? o.flag : mon);
    const family = ['takeda', 'akazonae', 'furin'].includes(familyMon) ? 'takeda' : familyMon;
    // 本陣・鉄砲列・指定済みの持ち場は保つ。広い平場の備と騎馬だけ寄せの横隊にする。
    const yose = o.yose ?? (!o.people && ['takeda', 'azai', 'asakura', 'imagawa'].includes(family)
      && ['mixed', 'cavalry'].includes(o.kind || 'mixed') && (o.w || 20) >= 8 && (o.d || 10) >= 8);
    const redCavalry = family === 'takeda' && o.kind === 'cavalry';
    o = { ...o, yose, flagRate: redCavalry ? 1 : o.flagRate };
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
    // 指定した山城だけ、遠景の騎馬武者も徒立ちへ。馬の形と材質を作る前に替える。
    if (this.def.distantFootOnly) for (const s of S) if (s.k === 5) { s.k = 3; s.ex = 0; }
    const near = o.near ?? N <= 160;
    const armor = redCavalry ? 0xb52c20 : o.armor || 0x2b3140;
    const flagKind = o.flag || o.mon || o.flagTex?.userData.mon || 'tokugawa';
    const fieldFlag = this.def.armyFlagKinds?.[flagKind];
    const flagTex = redCavalry ? flagTexture(flagKind === 'furin' ? 'furin_kiba' : 'takeda_kiba') : fieldFlag ? flagTexture(fieldFlag) : o.flagTex || flagTexture(flagKind);
    const U = {
      uYose: { value: yose ? 1 : 0 },
      uFieldRanks: { value: o.fieldRanks === true && o.kind === 'spear' ? 1 : 0 },
      uAT: WIND, uGust: GUST, uIdle: ARMY_IDLE, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
      uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
      uTerrainTriangles: { value: this.def.distantTerrainTriangles && this.def.terrainTriangles ? 1 : 0 },
      // 本人から60m（ARMY_REAL_R）の内の軽い兵は描かない（棒人間を出さない。10/10 kaito「なんで棒人間まだいるの」）。そこは本物の兵で埋める
      uNear: { value: 0 }, uUnavailable: { value: 0 }, uRealNear: ARMY_REAL_R,
      uMoveLim: { value: this.def?.moveLim || 176 },
    };
    // 長い守兵の列だけ、中ほどの立体を保つ距離を隊ごとに指定できる。
    if (o.detailMiddle != null) U.uSplitR = { value: new THREE.Vector2(16, o.detailMiddle) };
    // 低の近景は顔・袖・兜を残す軽い立体。遠さに応じて三段階で形を替える。
    const body = new THREE.InstancedMesh(soldierGeo(armor, near), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), N);
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const flagMat = armyShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U);
    if (redCavalry && !KIBA_FLAG_GEO) KIBA_FLAG_GEO = clothGeo(0.3, 1.05, 3, 3, 0, 2.62, -0.17, 11);
    const flags = new THREE.InstancedMesh(redCavalry ? KIBA_FLAG_GEO : SASHI_GEO, flagMat, N);
    const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2);
    const d = new THREE.Object3D(), col = new THREE.Color(), cf = Math.cos(facing), sf = Math.sin(facing);
    const riders = [], bearers = [], chiefs = [];
    let sx = 0, sz = 0;
    S.forEach((s, i) => {
      let x, z, yaw;
      if (s.wx !== undefined) { x = s.wx; z = s.wz; yaw = s.yawW; } else {
        x = o.x + s.lx * cf + s.lz * sf; z = o.z - s.lx * sf + s.lz * cf;
        yaw = facing + s.yaw + (R() - 0.5) * (yose || U.uFieldRanks.value ? 0.04 : 0.24);
      }
      // 山際の控えは列を緩く蛇行させる。人数と進軍の軸は保ち、高さは移した地点で読む。
      if (o.terrainRanks && s.wx === undefined) {
        x += Math.sin(s.lz * 0.19 + o.seed) * 1.6;
        z += Math.sin(s.lx * 0.13 + o.seed * 0.7) * 3.2;
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
      body.setColorAt(i, !redCavalry && yose && s.k === 5 && s.ex === 2 ? col.set(0xe7c07a) : soldierTint(col, R));
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
    body.userData.lod.deep = true;   // 遠い軍勢の体（乱戦の見せ物 addClash とは分ける）
    this.lodFlag(flags);
    const grp = new THREE.Group();
    grp.add(body, flags);
    const m4 = new THREE.Matrix4();
    const copyTo = (mesh, idx) => { idx.forEach((j, n) => { body.getMatrixAt(j, m4); mesh.setMatrixAt(n, m4); }); setInfo(mesh, idx); };
    // 幟（旗持ちの竿から垂れる）
    let banners = null;
    if (bearers.length) {
      let geo = BANNER_GEO, mat = armyShader(new THREE.MeshLambertMaterial({ map: yose && !redCavalry && !this.def.armyFlagKinds ? yoseFlagTexture(family) : flagTex, side: THREE.DoubleSide }), U);
      if (yose) {
        if (!YOSE_BANNER_GEO) YOSE_BANNER_GEO = clothGeo(0.66, 3.7, 3, 6, 0.3, 5.2, 0.14, 12);
        geo = YOSE_BANNER_GEO;
        const compile = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh) => { compile(sh); if (family === 'takeda' && !redCavalry && !this.def.armyFlagKinds) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (clamp(vMapUv.x, 0.008, 0.992) + mod(aInfo.w, 6.0)) / 6.0;'); };
        mat.customProgramCacheKey = () => family === 'takeda' && !redCavalry && !this.def.armyFlagKinds ? '寄せの幟六色' : '寄せの幟';
      }
      banners = new THREE.InstancedMesh(geo, mat, bearers.length);
      copyTo(banners, bearers); this.lodFlag(banners, true, yose); grp.add(banners);
    }
    // 足もとは地形の高さへ合わせる。斜面で浮き、黒い楕円にも見える影の板は置かない。
    // 馬
    let horses = null;
    if (riders.length) {
      horses = new THREE.InstancedMesh(horseGeo(), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), riders.length);
      copyTo(horses, riders); this.lodTwin(horses, null, true, horseGeo(true), 0, horseGeoX3());
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
    const cw = new THREE.Vector3(), outside = armyViewTest(body);
    // 同じ描画の体・旗・馬は、遠さを一度だけ数える。
    const lodState = { n: 0, flags: false, gone: false, dd: 0 };
    let lodFrame = -1, lodCam = null;
    const lod = (r, cam) => {
      if (lodFrame === r.info.render.frame && lodCam === cam) return lodState;
      lodFrame = r.info.render.frame; lodCam = cam;
      cw.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(grp.matrixWorld);
      const dd = Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z);
      // 霧の奥（見通しの一倍半より先）はほとんど見えないので描かない
      const vis = this.vis || 230, gone = dd > vis * 1.5 + 30 || outside(cam, 48 + U.uRoutT.value * 12);
      // 高：45m（本物の兵に替わる輪の外）より先の遠い軍勢は奥ほど間引く（霞の中の人数の厚みは残す）
      const hiQ = true, near0 = Math.min(hiQ ? 45 : 110, vis * 0.6);
      const keep = this.def.denseFront && false ? frontKeep(this.def, dd) : (dd < near0 ? 1 : Math.max(hiQ ? 0.3 : 0.4, 1 - (dd - near0) / (hiQ ? 180 : 260))) * lowKeep(dd);
      lodState.n = gone ? 0 : Math.max(A.nImp, Math.ceil(N * keep));
      lodState.flags = !gone && dd < Math.min(230, vis);
      lodState.gone = gone;
      lodState.dd = dd;
      return lodState;
    };
    // 数が 0 になる形（遠い背旗・霧の奥の馬や幟）は、次のコマから描く順に入れない（0 人でも一回ずつ描いていた）。本体の形が見張る
    flags.userData.maskByBody = true;
    body.onBeforeRender = (r, sc, cam) => {
      const l = lod(r, cam); body.count = l.n;
      flags.layers.mask = l.flags && !flags.userData.lod?.sashiCut ? 1 : 0;
      for (const m of [banners, horses, plumes]) if (m) m.layers.mask = l.gone ? 0 : 1;
    };
    // 高は lodTick の兵ごとの選び（lodSplit）が同じ仕事をする。両方だと元の束を消した上に三つの写しを毎コマ描く
    if (o.detailPerSoldier && false) this.soldierDetail(body, grp, armor, o.detailMiddle);
    flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); flags.count = l.flags ? Math.min(N, l.n * 2) : 0; };
    //   馬も、低（携帯）では数を減らす（lowKeep）
    const lodAll = (mesh) => { const n0 = mesh.count; mesh.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); mesh.count = l.gone ? 0 : Math.max(mesh === horses && yose ? Math.min(n0, 21) : 0, Math.ceil(n0 * (mesh === horses ? this.def.denseFront ? frontKeep(this.def, l.dd) : lowKeep(150) : 1))); }; };
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
    grp.follow = (fn, opt = {}) => { A.followFn = fn; A.gap = opt.gap ?? A.gap ?? 0; A.followSpeed = opt.speed ?? 2.6; return grp; };
    grp.army = A;
    // 本物の兵に道を譲る（yieldArmies）ために、形ごとの入れ物と、旗持ち・騎馬の番を覚えておく
    A.parts = { body, flags, banners, horses, plumes, chiefs, bearers, riders, grp }; A.hid = new Float32Array(N);
    // 最初に道を譲るコマで、軍勢全体の行列を複製しない。
    A.base = body.instanceMatrix.array.slice();
    // 本物の兵に置き換える時に使う：家紋・並び・人ごとの種類（0 槍 1 鉄砲 2 弓 3 侍 4 旗持ち 5 騎馬 6 床几）
    A.mon = o.mon || o.flag || (o.flagTex && o.flagTex.userData.mon) || null; if (o.team !== undefined) A.team = o.team;   // 家紋の無い軽い大軍でも、敵か味方かを渡せる（無いと味方として起きる）
    A.yose = yose; A.yoseFamily = family;
    A.armor = armor; A.kind = o.kind || (o.people ? 'people' : 'mixed'); A.people = !!o.people;
    A.kinds = S.map((s) => s.k); A.taken = new Uint8Array(N); A.took = 0;
    // (x, z) に近い、まだ置き換えていない兵を n 人まで選んで隠し、その場所・向き・種類を返す（r m より遠い者は選ばない）
    // 隠した兵は、大きさを 0 にするだけ（場所は残すので、隊の広がりの計算は変わらない）
    const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), z3 = new THREE.Vector3(0, 0, 0);
    grp.take = (x, z, n, r = 1e9, pick = null, canStand = null) => {
      grp.updateWorldMatrix(true, false);
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
        const sv = [keep(body, c.i, c.i), keep(flags, c.i, c.i)];
        hide(body, c.i); hide(flags, c.i);
        if (banners) { const j = bearers.indexOf(c.i); if (j >= 0) { sv.push(keep(banners, j, c.i)); hide(banners, j); } }
        if (horses) { const j = riders.indexOf(c.i); if (j >= 0) { sv.push(keep(horses, j, c.i)); hide(horses, j); } }
        if (plumes) { const j = chiefs.indexOf(c.i); if (j >= 0) { sv.push(keep(plumes, j, c.i)); hide(plumes, j); } }
        (A.saved || (A.saved = new Map())).set(c.i, sv);
        c.k = A.kinds[c.i]; c.general = S[c.i].general;
        if (yose) c.flagKind = fieldFlag || (c.k === 4 ? yoseFlagKinds(family)[Math.round(S[c.i].ex) % 6] : o.flag || family);
        const mm = sv[0][2]; mm.decompose(tp, tq, ts);
        c.sx = ts.x; c.sy = ts.y; c.sz = ts.z;
        c.helm = info[c.i * 4 + 2]; c.ex = info[c.i * 4 + 3]; c.flag = info2[c.i * 2];
      }
      return out;
    };
    // (x, z) から r m の内に残っている（まだ替えていない）軽い兵の数
    grp.left = (x, z, r) => {
      grp.updateWorldMatrix(true, false);
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
          const step = Math.min(dl, dt * (A.followSpeed ?? 2.6));
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
          const hw = (o.w || 20) * 0.5, hd = (o.d || 10) * 0.5, lx = (Math.random() - 0.5) * 2 * hw, lz = go && redCavalry ? hd - 2.5 - Math.random() * 2 : go ? -hd - Math.random() * (A.hostD || hd) : hd - Math.random() * (2 * hd + (A.hostD || 0));
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

  // 遠景の大軍が本物の兵の戦う所に重ならないように：本物の兵（pts：{x,z} の並び）の 3.4m 内にいる軽い兵を隠す（大きさ 0）。
  // 次の更新までの歩みと槍を振る余白を取り、足もとだけ抜いて周りの影の兵に埋もれるのを防ぐ。
  //   本物の兵が離れて 1.5 秒たてば元に戻す。置き換え（take）で隠した兵には触らない。units.js が 0.7 秒ごとに始め、数コマで調べる
  yieldArmies(pts, dt) {
    // 重なりを隠す行列は見た目専用。兵の置き換え・戦闘の人数は変えない。
    if (isNoRender()) return true;
    const AR = this.armies;
    if (!AR || !AR.length) return true;
    const W = this.yieldWork || (this.yieldWork = { cell: new Map(), spare: [], points: [], count: 0, m4: new THREE.Matrix4(), tp: new THREE.Vector3(), pending: false });
    if (W.pending) return false;
    const C = 3.4, cell = W.cell, spare = W.spare;
    // 数コマに分けている間も、升目と位置は同じ時点のものを使う。
    for (const list of cell.values()) { list.length = 0; spare.push(list); }
    cell.clear();
    W.count = pts.length;
    for (let i = 0; i < pts.length; i++) {
      const p = W.points[i] || (W.points[i] = { x: 0, z: 0 });
      p.x = pts[i].x; p.z = pts[i].z;
      const k = Math.floor(p.x / C) * 100003 + Math.floor(p.z / C);
      let list = cell.get(k);
      if (!list) { list = spare.pop() || []; cell.set(k, list); }
      list.push(p);
    }
    W.army = 0; W.index = -1; W.end = AR.length; W.dt = dt; W.pending = true;
    return true;
  }

  // 0.7秒ごとの全軍の調べを、一コマ256人・約1msずつ進める。
  yieldArmyStep() {
    const W = this.yieldWork;
    if (!W?.pending || isNoRender()) return;
    const start = performance.now(), tp = W.tp;
    let steps = 0;
    while (W.army < W.end) {
      if (++steps > 256 || steps % 16 === 0 && performance.now() - start >= 1) return;
      const A = this.armies[W.army], P = A?.parts;
      // 崩れた大軍も、本物の兵のそばは隠す。
      if (!P || !P.grp.visible) { W.army++; W.index = -1; continue; }
      P.grp.updateWorldMatrix(true, true);
      if (W.index < 0) {
        // 開戦時に測った列全体で、遠い軍勢の個別の調べを省く。
        const bounds = P.body.boundingSphere;
        tp.copy(bounds.center).applyMatrix4(P.body.matrixWorld);
        const extent = bounds.radius * P.body.matrixWorld.getMaxScaleOnAxis() + 3.4;
        let any = false;
        for (let j = 0; j < W.count; j++) {
          const p = W.points[j];
          if (Math.abs(p.x - tp.x) < extent && Math.abs(p.z - tp.z) < extent) { any = true; break; }
        }
        if (!any && !A.hidN) { W.army++; continue; }
        if (!A.base) A.base = P.body.instanceMatrix.array.slice();
        W.index = 0;
      }
      for (; W.index < A.n; ) {
        // 隠した兵や置き換え済みの兵も、調べる手間に数える。
        if (++steps > 256 || steps % 16 === 0 && performance.now() - start >= 1) return;
        const i = W.index++;
        if (A.taken[i]) continue;
        const k = i * 16;
        tp.set(A.base[k + 12] + A.off.x, A.base[k + 13] + A.off.y, A.base[k + 14] + A.off.z).applyMatrix4(P.grp.matrixWorld);
        const hit = this.yieldNear(tp.x, tp.z);
        const h = A.hid[i];
        if (hit) {
          if (h <= 0) {
            A.hid[i] = 1; A.hidN = (A.hidN || 0) + 1;
            this.yieldMesh(A, P.body, i, i, false); this.yieldMesh(A, P.flags, i, i, false);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, false); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, false); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, false); }
          } else A.hid[i] = 1;
        } else if (h > 0) {
          // 離れてから 1.5 秒で元へ
          A.hid[i] = h + W.dt;
          if (A.hid[i] > 2.5) {
            A.hid[i] = 0; A.hidN--;
            this.yieldMesh(A, P.body, i, i, true); this.yieldMesh(A, P.flags, i, i, true);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, true); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, true); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, true); }
          }
        }
      }
      W.army++; W.index = -1;
    }
    W.pending = false;
  }

  yieldNear(x, z) {
    const cell = this.yieldWork.cell, cx = Math.floor(x / 3.4), cz = Math.floor(z / 3.4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = cell.get((cx + i) * 100003 + cz + j);
      if (list) for (const p of list) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < 3.4 * 3.4) return true;
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
    const cloths = [], coarseCloths = [], wood = [];
    // 幕と縄は初めに焼き込む。遠くの幕は粗い形へ替え、毎コマ布を計算しない。
    const rope = (a, b) => {
      const delta = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(0.018, 0.018, delta.length(), 3);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      armyPart(wood, g, 0x8c7958, 0);
    };
    const hw = M.w / 2, hd = M.d / 2, gap = 3;
    const sides = [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, -gap, hd], [gap, hd, hw, hd]];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const [x0, z0] = W(ax + (bx - ax) * t0, az + M.z + (bz - az) * t0), [x1, z1] = W(ax + (bx - ax) * t1, az + M.z + (bz - az) * t1);
        const y0 = this.heightAt(x0, z0), y1 = this.heightAt(x1, z1);
        const span = len / n, nx = -(z1 - z0) / span, nz = (x1 - x0) / span;
        // 上端は柱へ張り、中央と裾に重い布のふくらみを残す。折り目の法線が日の光を拾う。
        for (const fine of [true, false]) {
          const g = new THREE.PlaneGeometry(1, 1.5, fine ? 8 : 4, fine ? 3 : 1);
          const P = g.attributes.position, UV = g.attributes.uv, colors = new Float32Array(P.count * 3);
          for (let k = 0; k < P.count; k++) {
            const u = P.getX(k) + 0.5, v = UV.getY(k), sag = Math.sin(u * Math.PI);
            // 近くでは吊り元から流れる斜めのひだ。遠くは従来の大きなたるみだけを使う。
            const fold = Math.cos(u * Math.PI * 4 + (1 - v) * 1.8) * sag;
            const belly = sag * (0.07 + (1 - v) * 0.17)
              + (fine ? fold * 0.14 * Math.sin(v * Math.PI) : 0);
            P.setXYZ(k, x0 + (x1 - x0) * u + nx * belly,
              y0 + (y1 - y0) * u + 0.3 + v * 1.72 - sag * (0.08 + v * 0.1),
              z0 + (z1 - z0) * u + nz * belly);
            UV.setX(k, (i + u) * span / 4);
            // 裾の泥と縫い際の陰は頂点色で残し、専用の絵や材質を増やさない。
            const shade = (0.72 + Math.min(1, v * 3) * 0.28) * (0.88 + sag * 0.12)
              * (fine ? 0.94 + fold * 0.08 : 1);
            colors[k * 3] = shade; colors[k * 3 + 1] = shade * 0.98; colors[k * 3 + 2] = shade * 0.94;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          g.computeVertexNormals(); (fine ? cloths : coarseCloths).push(g);
        }
        // 柱間の吊り縄も幕と同じたるみにする。既存の木部の一描画へまとめる。
        for (let j = 0; j < 4; j++) {
          const point = (u) => new THREE.Vector3(x0 + (x1 - x0) * u,
            y0 + (y1 - y0) * u + 2.05 - Math.sin(u * Math.PI) * 0.18, z0 + (z1 - z0) * u);
          rope(point(j / 4), point((j + 1) / 4));
        }
        const p = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4); p.translate(x0, y0 + 1.1, z0); armyPart(wood, p, 0x3a2c1c, 0);
        if (i === n - 1) {
          const end = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4);
          end.translate(x1, y1 + 1.1, z1); armyPart(wood, end, 0x3a2c1c, 0);
        }
      }
    }
    const tex = jinmakuTexture(o.mon).clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
    const clothMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide });
    const maku = new THREE.LOD();
    // 形は世界座標で焼いてあるため、切替の基準だけ本陣の中心へ置く。
    const [mx, mz] = W(0, M.z), my = this.heightAt(mx, mz);
    maku.position.set(mx, my, mz);
    for (const [parts, distance] of [[cloths, 0], [coarseCloths, 65]]) {
      const geo = mergeGeometries(parts); geo.translate(-mx, -my, -mz);
      for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(geo, clothMat); mesh.receiveShadow = true;
      maku.addLevel(mesh, distance);
    }
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
    // 定義は次の戦でも残る。川の判定から終了した戦場全体を抱え込まない。
    // 古い支度の片付けでは、同じ定義に付いた次の戦の判定を消さない。
    if (this.waterBlockedEscapeGetter && Object.getOwnPropertyDescriptor(this.def, 'blockedEscape')?.get === this.waterBlockedEscapeGetter) {
      delete this.def.blockedEscape;
    }
    this.waterBlockedEscapeGetter = null;
    if (this.fireFill) {
      this.fireFill.tex.dispose();
      // 取り消した古い支度から、次の戦の照明画像は外さない。
      if (FIRE_FILL.map.value === this.fireFill.tex) {
        FIRE_FILL.map.value = null;
        FIRE_FILL.area.value.z = 0;
      }
    }
    if (this.fireGlowBatch) { this.scene.remove(this.fireGlowBatch); this.fireGlowBatch.geometry.dispose(); this.fireGlowBatch.material.dispose(); }
    // 影の的（2048²：絵 16MB＋深さ 16MB）と映り込みの的（768×1024：9MB）は three が自分では返さない。題の世界の分が戦の間ずっと GPU に残っていた（10/20 iPhone の GPU process の調べ）
    try { if (this.sun && this.sun.shadow && this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } catch (e) { /* 返せなくてもよい */ }
    try { if (this.envRT) { this.envRT.dispose(); this.envRT = null; } if (this.pmrem) { this.pmrem.dispose(); this.pmrem = null; } } catch (e) { /* 返せなくてもよい */ }
    this.armyBatch.dispose();
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
    // 木の芯と葉を一緒に描く影の材質も、戦を終えたら手放す。
    const freed = new Set();
    for (const m of this.treeMeshes || []) if (m.customDepthMaterial && !freed.has(m.customDepthMaterial)) {
      m.customDepthMaterial.dispose(); freed.add(m.customDepthMaterial);
    }
    for (const m of this.lodList || []) {
      const L = m.userData.lod;
      for (const g of [L.lo, L.xlo, L.xxlo, L.x4]) if (g && g !== L.hi && !freed.has(g)) { g.dispose(); freed.add(g); }
    }
    this.lodList = [];
    this.soldierDetails = [];
    for (const detail of this.buildingDetails || []) { detail.hi.dispose(); detail.lo.dispose(); }
    this.buildingDetails = [];
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
      lodState.keep = this.def.denseFront && false ? frontKeep(this.def, dd, true) : (dd < 50 ? 1 : Math.max(0.3, 1 - (dd - 50) / 180)) * lowKeep(dd, true);   // 後詰めは 50m より先を奥ほど間引く
      lodState.flags = !gone && dd < Math.min(230, vis);
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
    // 演出のばらつきで討たれる抽選を変えない。
    const effectR = rng((o.seed || 5) + 701);
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
      g.attributes.aClash.array.set([s.j, dead && o.measuredMelee ? WIND.value : s.slot, s.row, dead ? 1 : 0], i * 4);
    };
    const place = (mesh, i, x, z, yaw, sc) => {
      p3.set(x, this.heightAt(x, z), z); q4.setFromAxisAngle(yAx, yaw);
      m4.compose(p3, q4, sc || s3); mesh.setMatrixAt(i, m4);
    };
    // 片方の側を作る
    const side = (key, sgn) => {
      const P = o[key] || {};
      const armor = P.armor || 0x2b3140;
      const flagKind = P.flag || P.flagTex?.userData.mon || 'tokugawa';
      const fieldFlag = this.def.armyFlagKinds?.[flagKind];
      const flagTex = fieldFlag ? flagTexture(fieldFlag) : P.flagTex || flagTexture(flagKind);
      const rows = Math.max(3, Math.round((P.count || nb * cols * 8) / nb / cols)), per = rows * cols;
      const U = {
        uAT: WIND, uGust: GUST, uIdle: typeof ARMY_IDLE !== 'undefined' ? ARMY_IDLE : { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
        uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
        uBlk: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4()) }, uBlk2: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4(0, 0, cols, 0)) },
        uRealNear: o.realNear != null ? { value: Math.max(12, o.realNear) } : ARMY_REAL_R, uSide: { value: sgn }, uApp: { value: C.app }, uAppM: { value: 0 }, uAppC: { value: 0 }, uNearHide: o.nearHide != null ? { value: o.nearHide } : { value: 0 }, uMeasuredMelee: { value: o.measuredMelee ? 1 : 0 },
      };
      U.uSplitR = { value: new THREE.Vector2(16, this.def.clashMiddleDetail ?? 16) };
      const S = { key, sgn, P, U, rows, per, n0: per * nb, alive: per * nb, lost: 0, mod: 0, m: 100, routed: false, blk: [], slots: [], near: [], far: [], all: [] };
      for (let j = 0; j < nb; j++) {
        const b = C.blocks[j];
        const perm = Array.from({ length: cols }, (_, c) => c);
        for (let i = cols - 1; i > 0; i--) { const q = Math.floor(R() * (i + 1)); [perm[i], perm[q]] = [perm[q], perm[i]]; }
        const sl = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols && sl.length < per; c++) {
          const last = r === rows - 1;
          let k = 0;
          // 指定した戦だけ大幟の間を広げる。空いた所は同じ人数の槍兵にする。
          if (last && c % (P.bannerStride ?? 4) === 1) k = 4;
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
      if (false) for (let i = S.near.length - 1; i > 0; i--) { const q = (i * 7919 + 13) % (i + 1); [S.near[i], S.near[q]] = [S.near[q], S.near[i]]; }
      S.all = S.near.concat(S.far);
      const matB = clashShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U);
      const lowG = false;   // 低（携帯）は前の列も五角の軽い形
      const bodyN = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? this.def.denseFront ? 'xlo' : 'lo' : true), S.near.length), matB, S.near.length);
      const bodyF = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'xlo' : false), Math.max(1, S.far.length)), matB, Math.max(1, S.far.length));
      bodyF.count = S.far.length;
      const flags = new THREE.InstancedMesh(mkAttr(SASHI_GEO, S.all.length), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), S.all.length);
      const bear = S.all.filter((s) => s.k === 4);
      const banners = new THREE.InstancedMesh(mkAttr(BANNER_GEO, Math.max(1, bear.length)), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), Math.max(1, bear.length));
      banners.count = bear.length;
      const CAP = o.corpses ?? 360;
      const dead = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'xlo' : false), CAP), matB, CAP);
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
        for (const m of [bodyN, bodyF, dead]) this.lodTwin(m, armor, true, null,
          lowG && this.def.lowArmyDetail && m !== bodyN ? 2 : 0);
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
      const gone = dd > vis * 1.5 + 30, near0 = Math.min(60, vis * 0.5);   // 高は 60m より先の後ろの列を間引く（前の二列は全員）
      lodState.gone = gone; lodState.dd = dd;
      lodState.keep = this.def.denseFront && false ? frontKeep(this.def, dd) : (dd < near0 ? 1 : Math.max(0.3, 1 - (dd - near0) / 220)) * lowKeep(dd);
      lodState.flags = !gone && dd < Math.min(230, vis);
      return lodState;
    };
    for (const S of sides) {
      const M = S.meshes, nF = S.far.length, nA = S.all.length, nN = S.near.length;
      const outside = armyViewTest(M.bodyN, this.def.lowArmyDetail ? [M.bodyF, M.flags, M.banners] : null);
      let sideFrame = -1, sideCam = null, sideGone = false;
      const sideLod = (r, cam) => {
        if (sideFrame === r.info.render.frame && sideCam === cam) return sideGone;
        sideFrame = r.info.render.frame; sideCam = cam;
        const l = lod(r, cam);
        if (l.gone) return sideGone = true;
        // 全列の範囲を取った低画質は、揺れ・前詰め・逃走の余裕だけ足す。
        const margin = this.def.lowArmyDetail ? 12 : 48;
        let padding = margin + S.rows * CLASH_ROW + Math.abs(S.U.uApp.value);
        for (const b of S.U.uBlk.value) padding = Math.max(padding, margin + S.rows * CLASH_ROW + Math.abs(S.U.uApp.value) + Math.abs(b.x) + b.w * 12);
        return sideGone = outside(cam, padding);
      };
      //   低（携帯）：背の指物を描かない遠さでは、前の列も間引く（指物は兵と同じ番号で並ぶので、指物のある内は間引かない）
      // 0 人になる背旗・幟・後ろの列は、次のコマから描く順に入れない（前の列の形が見張る）
      M.flags.userData.maskByBody = true;
      const nbAll = M.banners.count;
      M.bodyN.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); const g = l.gone || sideLod(r, cam); M.flags.layers.mask = l.flags && !g && !M.flags.userData.lod?.sashiCut ? 1 : 0; M.banners.layers.mask = g || !M.banners.count && !nbAll ? 0 : 1; M.bodyF.layers.mask = g || !nF ? 0 : 1; M.dead.layers.mask = M.dead.count ? 1 : 0; M.bodyN.count = sideLod(r, cam) ? 0 : l.flags || true ? nN : Math.ceil(nN * Math.min(1, frontKeep(this.def, l.dd) * 1.5)); };
      M.bodyF.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.bodyF.count = sideLod(r, cam) ? 0 : Math.ceil(nF * l.keep); };
      M.flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.flags.count = l.flags && !sideLod(r, cam) ? nN + Math.min(nF, Math.ceil(nF * l.keep * 2)) : 0; };
      const nb0 = M.banners.count;
      M.banners.onBeforeRender = (r, sc, cam) => { M.banners.count = sideLod(r, cam) ? 0 : nb0; };
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
        const deathYaw = R() * 6.28;
        if (o.measuredMelee) {
          // 元の体と倒れる体を同時に出さず、同じ向き・大きさで受け渡す。形と材質はそのまま使う。
          const mix = S.U.uBlk.value[j].y * (1 - THREE.MathUtils.smoothstep(s.row, Math.floor(B.kd / cols) + 1.5, Math.floor(B.kd / cols) + 2.6));
          const forward = mix * (0.8 + 2.2 * (s.sd * 7.31 % 1));
          const lateral = mix * 2.2 * (s.sd * 3.77 % 1 - 0.5);
          const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
          place(M.dead, i, x + forward * sin + lateral * cos, z + forward * cos - lateral * sin, s.yaw, s3.set(...s.sc));
          s3.set(1, 1, 1);
          const hide = (mesh, at) => { mesh.getMatrixAt(at, m4); m4.scale(z3); mesh.setMatrixAt(at, m4); mesh.instanceMatrix.needsUpdate = true; };
          hide(s.mesh, s.mi); hide(M.flags, s.fi);
          if (s.bi !== undefined) hide(M.banners, s.bi);
        } else place(M.dead, i, x2, z2, o.groundedMelee ? s.yaw : deathYaw);
        setOne(M.dead, i, s, true);
        if (o.groundedMelee) {
          M.dead.geometry.attributes.aClash.array[i * 4 + 3] = 2 + S.U.uAT.value;
          // 倒れる形へ替えた瞬間に立ち姿を隠す。後列が詰める速さは保つ。
          const bodyAttr = s.mesh.geometry.attributes.aClash;
          bodyAttr.setY(s.mi, -1); bodyAttr.needsUpdate = true;
          const flagAttr = M.flags.geometry.attributes.aClash;
          flagAttr.setY(s.fi, -1); flagAttr.needsUpdate = true;
          if (s.bi != null) {
            const bannerAttr = M.banners.geometry.attributes.aClash;
            bannerAttr.setY(s.bi, -1); bannerAttr.needsUpdate = true;
          }
        }
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
      // 押し合う前線は足元も荒れる。乱数と戦闘判定には触らず、一秒ごとに既存の跡へ加える。
      C.wearT = (C.wearT || 0) + dt;
      if (fight && C.wearT >= 1 && this.wearData) {
        C.wearT = 0;
        for (const b of C.blocks) {
          this.stampWear(o.x + b.lx * cf + b.f * sf, o.z - b.lx * sf + b.f * cf, Math.min(4, bwr * 0.7), 14);
        }
      }
      // 雨上がりは乾いた土煙を立てず、既存の粒の入れ物で低い泥跳ねを出す。
      if (o.groundedMelee && (fight || C.phase === 'close') && wetGround() && C.fx.dust <= 0) {
        C.fx.dust = 0.35 + R() * 0.35;
        const j = Math.floor(R() * nb), b = C.blocks[j];
        const side = R() < 0.5 ? C.A : C.B;
        const rt = side.blk[j].rt;
        const lz = b.f - side.sgn * (gap / 2 - C.app + Math.min(12, rt * 4));
        const x = o.x + b.lx * cf + lz * sf, z = o.z - b.lx * sf + lz * cf;
        if (Math.hypot(x - focus.x, z - focus.z) < 150 && (!C.winner || C.pursueT < 12)) {
          this.puff(x, z, 2);
          // 濡れた前線にも低い飛沫の霞を残す。乾いた大きな砂煙にはしない。
          // 既存の雲の上限と再利用を守り、視界・命中判定に使わない描画だけの霞。
          if (effectR() < 0.4 && !this.inWaterAt(x, z)) {
            const mist = this.dustCloud(x, z, false, true, true);
            if (mist) {
              mist.yOff = false; mist.s0 = 1.8; mist.s1 = 5.5;
              mist.life = 6; mist.a = 0.1; mist.rise = 0.025;
            }
          }
        }
      }
      // 乱戦の土煙：押し合う前線から、踏み荒らされた土が絶えず舞い上がる（乾いた日。近い前線ほど多く、崩れて追う時は騎馬の土煙も）
      if (fight && !wetGround() && C.fx.dust <= 0) {
        const fd = Math.hypot(o.x - focus.x, o.z - focus.z);
        C.fx.dust = C._autoDistant ? (2.5) : fd < 120 ? 0.22 : fd < 250 ? 0.55 : 1.4;
        const p = C.frontAt(Math.floor(R() * nb), (R() - 0.5) * gap);
        if (o.measuredMelee) {
          // 押し込んでいる肩へ煙を寄せ、同じ間隔の煙幕にしない。粒の数は増やさない。
          C.fx.dust *= 0.7 + effectR() * 0.6;
          if (C.pressSpeed > 0.3) {
            const b = C.blocks[C.pressBlock];
            p.x = o.x + b.lx * cf + b.f * sf;
            p.z = o.z - b.lx * sf + b.f * cf;
          }
        }
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
        if (o.measuredMelee && dust) {
          // 足で蹴った土は地表に薄く広がる。前列の姿を高い煙で覆わない。
          dust.rise *= 0.3; dust.s0 *= 0.75; dust.life *= 0.8;
        }
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
      C.pressSpeed = 0; C.pressBlock = 0;
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
        if (Math.abs(v) > C.pressSpeed) { C.pressSpeed = Math.abs(v); C.pressBlock = j; }
        // 敗走の知らせが届くまでは組み合い、届いた塊から斬り合いをほどく。
        const stillFighting = o.groundedMelee && C.winner && other(C.winner).blk[j].rt === 0;
        const want = fight && (!C.winner || stillFighting) ? 1 : 0;
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
          const breakK = o.groundedMelee ? Math.min(1, B.rt / 0.7) : S.routed || B.rt > 0 ? 1 : 0;
          U.uBlk.value[j].set(b.f, mixW * (1 - breakK), B.kd, B.rt);
          const mv = C.winner === S && C.pursueT < 12 ? 1 : Math.min(1, Math.abs(v) * 0.8);
          U.uBlk2.value[j].set(b.fight * (1 - breakK), mv, cols, b.hide);
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
      if (C.fx.snd <= 0) {
        C.fx.snd = 0.9 + R() * 1.6;
        const j = Math.floor(R() * nb), p = C.frontAt(j);
        const escaping = o.groundedMelee && C.winner && other(C.winner).blk[j].rt > 0;
        if (!escaping) { play(R() < 0.5 ? 'clash' : 'far', p, 0.9); if (R() < 0.3) play('umeki', p, 0.6); }
        else if (C.pursueT < 12) play(R() < 0.5 ? 'far' : 'umeki', p, 0.6);
      }
      if (C.fx.shout <= 0) {
        C.fx.shout = 9 + R() * 8;
        if (!o.groundedMelee || !C.winner) {
          const kind = R() < 0.5 ? 'eshout' : 'toki', p = C.frontAt(Math.floor(R() * nb));
          if (o.measuredMelee) {
            // 隣の塊まで同じ鬨を上げず、押す所の掛け声と押し返される所の呻きを交ぜる。
            const b = C.blocks[C.pressBlock];
            p.x = o.x + b.lx * cf + b.f * sf; p.z = o.z - b.lx * sf + b.f * cf;
            play(C.pressSpeed > 0.3 ? 'eshout' : effectR() < 0.6 ? 'umeki' : kind, p, C.pressSpeed > 0.3 ? 1.2 : 0.7);
          } else play(kind, p, 1.4);
        }
      }
      if (C.fx.dust <= 0 && !wetGround()) { C.fx.dust = C._autoDistant ? 3 : 0.5; const p = C.frontAt(Math.floor(R() * nb)); this.dustCloud(p.x, p.z, false, !!C._autoDistant); }
      if (C.fx.gun <= 0) { C.fx.gun = 7 + R() * 6; for (const S of sides) if (S.P.guns && !S.routed && !C.winner) C.volley(S.key); }
      if (C.fx.bow <= 0) { C.fx.bow = 10 + R() * 6; for (const S of sides) if (S.P.bows && !S.routed && !C.winner) C.arrows(S.key); }
      C.fx.wake = (C.fx.wake || 0) - dt;
      // 本物へ替えるのは小分けに（一度に五人ずつ・倍の速さで。替わる数の速さは同じで、一コマに兵の形を何十も作らない）
      if (C.fx.wake <= 0) { C.fx.wake = 0.15; wakeTick(); }
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
      const n = Math.max(0, Math.min(5, Math.floor((room - alive) / 2)));
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
    // 高：まとめて描く兵は 48m より先だけなので、腕・袖のある軽い形（205 面）。110m より先（far）は輪郭の形
    // 画質「低」（携帯）：まとめて描く遠い兵は、角の少ない遠い形（一人 1100 面 → 300 面ほど。低では 12m より先の兵だけ。far：18m より先の兵の束は、さらに軽い形）
    const body = new THREE.InstancedMesh(mk(soldierGeo(armor, false && (this.def.denseFront || this.def.lowArmyDetail) ? (far ? 'x3lo' : 'xlo') : far ? ('x3lo') : 'xlo')), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), cap);
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
        flags.visible = n > 0;   // 空の束は描かない（体の束は写真の視点の見張りに残す）
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
      fires.push(this.addFire(fx, fz, { size: size * (i === 1 ? 1 : 0.85), h: h + size * 0.15, blackSmoke: true }));
    }
    // 戸口・窓側にも小さな火の舌。屋根の火と同じ形・材質を使う。
    fires.push(this.addFire(x + sa * (d / 2 + 0.18), z + ca * (d / 2 + 0.18), { size: size * 0.55, h: Math.min(1.8, h * 0.35), smoke: false }));
    const smoke = this.addSmokeColumn(x, this.heightAt(x, z) + h + size, z, { size: Math.min(4, size * 1.1), black: true });
    return { fires, smoke, stop: () => { for (const f of fires) this.removeFire(f); this.removeSmokeColumn(smoke); fires.length = 0; } };
  }

  removeFire(f) {
    if (!f) return;
    this.scene.remove(f.flame, f.inner);
    if (f.glow) { this.scene.remove(f.glow); if (!f.torch) f.glow.geometry.dispose(); f.glow.material.dispose(); }
    if (f.light) { const pl = (this.firePool || []).find((q) => q.L === f.light); if (pl) { pl.f = null; pl.L.intensity = 0; } else this.scene.remove(f.light); f.light = null; }
    this.removeSmokeColumn(f.smoke);
    this.fires = this.fires.filter((q) => q !== f);
    this.fireLightT = 0;
    if (this.fireFill) this.fireFill.time = -1;
    if (this.fireBatches) for (const batch of this.fireBatches.values()) {
      batch.list = batch.list.filter((entry) => entry.root !== f.flame && entry.root !== f.inner);
    }
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
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * a, a); }',
    });
    this.embers = { pts: new THREE.Points(geo, mat), pos, life, vel: new Float32Array(N * 3), i: 0, N };
    this.embers.pts.frustumCulled = false;
    this.scene.add(this.embers.pts);
  }
  updateEmbers(dt, focus) {
    // 最後の火を消しても、残った火の粉の寿命は進める。
    if (!this.embers) {
      let lit = false;
      for (const f of this.fires) if (f.lit) { lit = true; break; }
      if (!lit) return;
      this.buildEmbers();
    }
    const E = this.embers;
    for (const f of this.fires) {
      if (!f.lit || !f.flame.visible || Math.hypot(f.x - focus.x, f.z - focus.z) > 60) continue;
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

  // 火と舞台の幟を離す。組み立てが終わった最初の更新で一度だけ。
  separateFireFlags() {
    this.fireFlagsDirty = false;
    this.scene.traverse((m) => {
      if (!m.userData.flag || m.parent !== this.scene) return;
      for (const f of this.fires) {
        if (f.torch || Math.abs(f.x) >= this.half || Math.abs(f.z) >= this.half) continue;
        const dx = m.position.x - f.x, dz = m.position.z - f.z, dist = Math.hypot(dx, dz), gap = f.size * .8 + 1.4;
        if (dist >= gap) continue;
        m.position.x = f.x + (dist > .01 ? dx / dist : 1) * gap;
        m.position.z = f.z + (dist > .01 ? dz / dist : 0) * gap;
        m.position.y = this.heightAt(m.position.x, m.position.z);
      }
    });
  }

  // 出来事で初めて燃える戦も、炎・芯・煙・火の粉を幕の内でそろえる。
  battleProgramSamples() {
    flameMat();
    if (!this.smokeCol) this.buildSmokeColumns();
    if (!this.embers) this.buildEmbers();
    const samples = [new THREE.Mesh(FLAME_GEO, FLAME_MAT), new THREE.Mesh(FLAME_GEO, FLAME_CORE_MAT), this.smokeCol.pts, this.embers.pts];
    if (this.def.roundedFire) {
      if (!ROUND_FLAME_MAT) {
        ROUND_FLAME_MAT = FLAME_MAT.clone(); ROUND_FLAME_MAT.uniforms = FLAME_MAT.uniforms;
        ROUND_FLAME_MAT.vertexShader = FLAME_MAT.vertexShader.replace('mix(1.0, 0.025, h * h)', 'sqrt(max(0.001, 1.0 - h * h)) * (0.85 + 0.15 * sin(h * 3.14159))');
        ROUND_FLAME_CORE = ROUND_FLAME_MAT.clone(); ROUND_FLAME_CORE.uniforms = FLAME_CORE_MAT.uniforms;
      }
      samples.push(new THREE.Mesh(FLAME_GEO, ROUND_FLAME_MAT), new THREE.Mesh(FLAME_GEO, ROUND_FLAME_CORE));
    }
    return samples;
  }

  // 焚き火・篝火（炎が揺れる。篝火は夕暮れに灯りをともす）
  addFire(x, z, o = {}) {
    const y = this.heightAt(x, z) + (o.h || 0.15);
    // 炎：揺らぎで舌のように動く板（flameMat）。外の大きな炎と、少しずらした小さな炎の二枚。大きな火（燃える建物）は脇にもう二枚
    let fm = flameMat(), coreMat = FLAME_CORE_MAT;
    if (this.def.roundedFire) {
      if (!ROUND_FLAME_MAT) {
        ROUND_FLAME_MAT = fm.clone(); ROUND_FLAME_MAT.uniforms = fm.uniforms;
        // 根元をふくらませ、先へ丸く細る舌にする。元と同じ時刻・風で揺れる。
        ROUND_FLAME_MAT.vertexShader = fm.vertexShader.replace('mix(1.0, 0.025, h * h)', 'sqrt(max(0.001, 1.0 - h * h)) * (0.85 + 0.15 * sin(h * 3.14159))');
        ROUND_FLAME_CORE = ROUND_FLAME_MAT.clone(); ROUND_FLAME_CORE.uniforms = FLAME_CORE_MAT.uniforms;
      }
      fm = ROUND_FLAME_MAT; coreMat = ROUND_FLAME_CORE;
    }
    // 炎の板は向きを変えて揺れるので、形の球を広めに取って画面の外の火だけ省く（城が燃える戦で百回ほど描いていた）
    if (!FLAME_GEO.userData.wideSphere) { FLAME_GEO.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.1, 0), 1.3); FLAME_GEO.userData.wideSphere = true; }
    const mk = (parent) => { const m = new THREE.Mesh(FLAME_GEO, fm); m.renderOrder = 2; (parent || this.scene).add(m); return m; };
    // o.size：燃える建物などの大きな火（炎を大きく、煙の柱を太く高く）
    const size = o.size || (o.torch ? 0.7 : 1.3);
    const outer = mk(), inner = mk();
    inner.material = coreMat; inner.renderOrder = 3;
    const base = y + size * (o.torch ? 0.3 : 0.35);
    outer.position.set(x, base, z); inner.position.set(x + (o.torch ? size * .12 : 0), base - size * 0.08, z - (o.torch ? size * .1 : 0));
    // 後から置く幟も含め、竿ごと火から離す。兵の旗や任務の札は動かさない。
    if (!o.torch && Math.abs(x) < this.half && Math.abs(z) < this.half) this.fireFlagsDirty = true;
    outer.scale.set(size * 0.95, size * 1.3, 1); inner.scale.set(size * 0.6, size * 0.85, 1);
    if (o.torch || (o.size || 0) >= 2 || this.def.roundedFire && !o.torch) for (const s2 of [-1, 1]) { const e = mk(outer); e.position.set(s2 * (o.torch ? .2 : .36), o.torch ? -.06 : -.12, s2 * (o.torch ? .24 : .15)); e.scale.set(o.torch ? .48 : .62, o.torch ? .78 : .7, 1); }
    // 照り返しは地形に沿う広く淡い裾。柱・草・動く松明は数を絞った点光源で照らす。
    if (!this.fireGlowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.28)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.fireGlowTex = new THREE.CanvasTexture(c);
    }
    if (!this.glowGeo) { this.glowGeo = new THREE.PlaneGeometry(1, 1, 8, 8); this.glowGeo.rotateX(-Math.PI / 2); }
    const lightRadius = o.lightRadius ?? (o.torch ? 10 : Math.max(12, Math.min(28, size * 7)));
    const span = lightRadius * 2, groundY = this.heightAt(x, z);
    const gg = o.torch ? this.glowGeo : this.glowGeo.clone();
    if (!o.torch) {
      const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, (this.heightAt(x + p.getX(i) * span, z + p.getZ(i) * span) - groundY) / span);
      p.needsUpdate = true; gg.computeBoundingSphere();
    }
    const glow = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: this.fireGlowTex, color: 0xff8d45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    // 高の夜だけ、点光源から外れた火の淡い照り返しを戻す。
    glow.material.visible = false;
    glow.scale.setScalar(span);
    glow.position.set(x, groundY + 0.025, z);
    glow.renderOrder = 1;
    this.scene.add(glow);
    const f = { flame: outer, inner, glow, base, size, lightRadius, x, z, glowFalloff: 1 / (1 + Math.max(0, y - groundY) ** 2 / (lightRadius * lightRadius)), seed: Math.random() * 10, torch: !!o.torch, nightOnly: !!o.nightOnly };
    // 炎の上に細い煙が昇り、風下へ流れる
    // 篝火・炊ぎの煙は高く（16m ほど）上げ、遠くからでも陣の場所が分かるように
    if (!o.nightOnly && o.smoke !== false) f.smoke = this.addSmokeColumn(x, base + size * 0.5, z, { size: o.torch ? 0.18 : o.size ? Math.min(4, o.size * 0.9) : 1.0, black: !!o.blackSmoke });
    // 大きな火（燃える建物）も、揺らめく点の光で周りの地面と人を照らす（光の数は全部で 4 つまで。数を絞って重くしない）
    const big = (o.size || 0) >= 2;
    // 光は近い数個だけ（update の assignFireLights が決まった数の光を近い火へ付け替える）
    f.lightRadius = lightRadius; f.lightColor = o.lightColor ?? 0xff9a4a;
    // 広い火は減衰を指定できる。零なら半径の端で滑らかに消え、十五メートル先にも暖色を残す。
    f.lightStrength = o.lightStrength; f.lightDecay = o.lightDecay ?? 2;
    f.waterReflection = !!o.waterReflection;
    f.big = big; f.lit = !o.nightOnly || this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    if (o.nightOnly) outer.visible = inner.visible = glow.visible = f.lit;
    f.ly = base - this.heightAt(x, z) + (big ? size * 0.3 : 0.25);
    this.fires.push(f);
    this.fireLightT = 0;
    if (this.fireFill) this.fireFill.time = -1;
    if (false && this.def.lowMaterialBatch) this.batchFireFlames(outer, inner);
    return f;
  }


  // 小谷の低画質だけ、炎の舌を材質ごとの束へ。元の物は松明の移動・消灯・消火の窓口として保つ。
  batchFireFlames(outer, inner) {
    if (!this.fireBatches) {
      this.fireBatches = new Map();
      const before = this.scene.onBeforeRender;
      this.scene.onBeforeRender = (renderer, scene, camera, target) => {
        before.call(scene, renderer, scene, camera, target);
        this.updateFireBatches();
      };
    }
    const batches = this.fireBatches;
    const add = (source, root) => {
      source.layers.disable(0); source.userData.noFreeze = true;
      let batch = batches.get(source.material);
      if (!batch) {
        batch = { list: [], mesh: null, capacity: 0 };
        batches.set(source.material, batch);
      }
      batch.list.push({ source, root });
      if (batch.list.length > batch.capacity) {
        if (batch.mesh) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
        batch.capacity = Math.max(64, batch.capacity * 2);
        const mesh = new THREE.InstancedMesh(FLAME_GEO, source.material, batch.capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.renderOrder = source.renderOrder; mesh.userData.noFreeze = true;
        batch.mesh = mesh; this.scene.add(mesh);
      }
      for (const child of source.children) if (child.isMesh) add(child, root);
    };
    add(outer, outer); add(inner, inner);
  }

  // 行列を送る前に詰める。松明を動かしたそのコマから、同じ位置に炎を描く。
  updateFireBatches() {
    for (const batch of this.fireBatches.values()) {
      let n = 0;
      for (const entry of batch.list) {
        if (!entry.root.visible || entry.root.parent !== this.scene || !entry.source.visible) continue;
        entry.source.updateWorldMatrix(true, false);
        batch.mesh.setMatrixAt(n++, entry.source.matrixWorld);
      }
      batch.mesh.count = n; batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // 地面：草・踏み固めた土・泥・岩肌を場所ごとに混ぜる（頂点に混ぜる割合を持たせ、絵は世界の座標で貼る）
  buildTerrain() {
    // 通常は描く格子だけ減らす。急な切岸の戦は指定により足場とそろえる。
    const segments = false && !this.def.keepTerrainGrid ? 96 : SEG;
    const geo = new THREE.PlaneGeometry(this.half * 2, this.half * 2, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const splat = new Float32Array(pos.count * 3);
    const water = new Float32Array(pos.count);
    const cover = new Float32Array(pos.count * 2);
    const slopeTint = this.def.slopeForestTint ? new Float32Array(pos.count * 3) : null;
    const c = new THREE.Color();
    const R = rng(7);
    const paths = this.def.paths || [];
    const muddy = this.def.muddy ?? 0.35;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
      const h = segments === SEG ? this.grid[j * (SEG + 1) + i] : this.heightAt(x, z);
      pos.setY(k, h);
      const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + (R() - 0.5) * 0.35;
      c.setRGB(0.26 + n * 0.05, 0.33 + n * 0.06, 0.17 + n * 0.03);
      let pd = Infinity;
      for (const p of paths) pd = Math.min(pd, distToPolyline(x, z, p) * 2 / (p.w ?? this.def.pathWidth ?? 2));
      if (this.def.softPathSoil) {
        // 雨の川原は土と草を連続して混ぜ、格子ごとの色の段を作らない。
        const t = THREE.MathUtils.smoothstep(pd, 1, 3);
        c.setRGB(THREE.MathUtils.lerp(0.36 + n * 0.04, c.r, t),
          THREE.MathUtils.lerp(0.30 + n * 0.03, c.g, t), THREE.MathUtils.lerp(0.21, c.b, t));
      }
      else if (pd < 2) c.setRGB(0.36 + n * 0.04, 0.30 + n * 0.03, 0.21);
      else if (pd < 3) c.lerp(new THREE.Color(0.34, 0.31, 0.21), 0.5);
      if (this.def.tint) this.def.tint(x, z, h, c);
      if (slopeTint) { slopeTint[k * 3] = c.r; slopeTint[k * 3 + 1] = c.g; slopeTint[k * 3 + 2] = c.b; }
      // 色から、草・土・泥の割合を読む（緑が勝つほど草）
      let grass = Math.max(0, Math.min(1, (c.g - (c.r + c.b) / 2 - 0.02) / 0.08));
      // 夜の土色へ寄せても草まで消さない。配分だけを指定し、地形と歩行は保つ。
      if (this.def.grassMix) grass = Math.max(0, Math.min(1, this.def.grassMix(x, z, pd)));
      // 道の縁は草がまばらに残る
      if (pd >= 1.4 && pd < 3) grass = Math.max(grass, Math.min(1, (pd - 1.4) / 1.6) * (0.6 + R() * 0.4));
      grass *= this.groundCoverAt(x, z);
      let dirt = 1 - grass;
      // 泥：道の真ん中と、低い所の水はけの悪い所
      const wetSpot = Math.max(0, Math.sin(x * 0.09 + 1.3) * Math.cos(z * 0.11) - 0.55) * 2.2;
      const pathMud = this.def.softPathSoil ? 0.8 * (1 - THREE.MathUtils.smoothstep(pd, 1, 2.6)) : pd < 1.8 ? 0.8 : 0;
      const wetSoil = this.def.softPathSoil ? 0.5 + 0.5 * THREE.MathUtils.smoothstep(dirt, 0.3, 0.7) : dirt > 0.5 ? 1 : 0.5;
      let mud = Math.min(1, pathMud * muddy + wetSpot * muddy * wetSoil);
      dirt *= 1 - mud * 0.8; grass *= 1 - mud * 0.6;
      // 小川の岸は泥と土
      for (const st of this.def.streams || []) { const d = distToPolyline(x, z, st.pts); if (d < st.w * 1.8) { const b = 1 - d / (st.w * 1.8); mud = Math.max(mud, b * 0.8); grass *= 1 - b; } }
      const t = grass + dirt + mud || 1;
      splat[k * 3] = grass / t; splat[k * 3 + 1] = dirt / t; splat[k * 3 + 2] = mud / t;
      // 水を張った田
      water[k] = this.field.wet && this.def.paddy ? this.def.paddy(x, z) : 0;
      // 岸の濡れは雨が止んでも残る。植生のない道・田には林床を置かない。
      let bank = 0;
      for (const st of this.def.streams || NO_STREAMS) {
        const d = distToPolyline(x, z, st.pts);
        bank = Math.max(bank, Math.max(0, 1 - Math.abs(d - st.w) / 3));
      }
      const W = this.def.water;
      if (W) bank = Math.max(bank, Math.max(0, 1 - Math.abs(x - W.x) / 3), W.x2 == null ? 0 : Math.max(0, 1 - Math.abs(x - W.x2) / 3));
      cover[k * 2] = bank;
      const forest = this.def.treeDensity ? Math.max(0, Math.min(1, this.def.treeDensity(x, z))) : 0.5;
      cover[k * 2 + 1] = (this.def.trees === 0 || this.def.clear?.(x, z) || water[k] > 0.3 || pd < 3) ? 0 : forest;
    }
    if (slopeTint) geo.setAttribute('slopeTint', new THREE.BufferAttribute(slopeTint, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
    this.splat = splat; this.waterW = water;
    geo.setAttribute('water', new THREE.BufferAttribute(water, 1));
    geo.setAttribute('groundCover', new THREE.BufferAttribute(cover, 2));
    geo.computeVertexNormals();
    const mat = liteMat({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.55 });
    // 坂は本人の足より高くても地面。屋根・柱を抜く処理へ渡すと、
    // 手前の山肌が画面中央の四角い範囲で消え、空の色が露出する。
    mat.userData.camNearSolid = true;
    mat.customProgramCacheKey = () => `ground|${!!this.def.slopeForestTint}|${this.half}|${!!this.def.autumn}|${!!this.def.winter}|${!!this.def.snow}|${SETTINGS.quality}|${!!this.def.springSnowPatch}|${JSON.stringify(this.def.gravelCourt || null)}|${!!this.def.softEarthCrust}|${!!this.def.stableSlopeGrain}|${!!this.def.subtleMudRelief}|${!!this.def.sparseEarthCrust}|${!!this.def.stableCliffGrain}|${!!this.def.stableRockProjection}`;
    this.groundU = { tGrass: { value: grassTex(!!this.def.plainGrassGround) }, tDirt: { value: dirtTex() }, tBank: { value: bankTex() }, tMud: { value: mudTex() }, tStone: { value: stoneTex() }, tMacro: { value: macroTex() }, uWet: { value: 0 }, uForest: { value: this.def.slopeForest ?? 0 }, uRock: { value: this.def.cliffRock ?? 0 }, uNight: this.nightU, uSoilRain: { value: 0 }, tWear: WEAR, uTime: { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } }, uSoilSky: { value: this.hemi.color } };
    if (this.def.gravelCourt) this.groundU.tCourt = { value: gravelTex() };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.groundU);
      sh.vertexShader = 'attribute vec3 splat;\nattribute float water;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWater = water;\n vSplat = splat;\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.vertexShader = 'attribute vec2 groundCover; varying vec2 vGroundCover;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGroundCover = groundCover;');
      if (slopeTint) {
        sh.vertexShader = 'attribute vec3 slopeTint; varying vec3 vSlopeTint;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSlopeTint = slopeTint;');
        sh.fragmentShader = 'varying vec3 vSlopeTint;\n' + sh.fragmentShader;
      }
      sh.fragmentShader = 'varying vec2 vGroundCover;\n' + 'uniform sampler2D tGrass, tDirt, tBank, tMud, tStone, tMacro, tWear, tCourt;\nuniform float uWet, uTime, uSoilRain, uNight, uForest, uRock;\nuniform vec3 uSoilSky;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 wuv = vWP.xz;
          // 貼る向きは三角の本当の向き（頂点の法線は格子でならされ、高い切岸でも上向きが残って絵が縦に伸びる）
          vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));
          // 近くでは縦に引き伸ばした遠目の筋（沢・雨筋・樹冠の塗り）を弱め、岩と土の細かな絵を見せる
          float farK = smoothstep(22.0, 85.0, length(vWP - cameraPosition));
          float macro = texture2D(tMacro, wuv * 0.006).r;
          float macro2 = texture2D(tMacro, wuv * 0.023 + 0.37).r;
          // 同じ絵の繰り返しが見えないよう、向きと縮尺を変えたもう一枚を、大きな斑に合わせて混ぜる
          vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * wuv;
          float mixK = smoothstep(0.35, 0.65, macro2);
          // 写真の主の繰り返しは約2.2〜2.4m。平地・坂・切岸で縮尺をそろえる。
          vec3 grass = mix(texture2D(tGrass, wuv * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb, texture2D(tGrass, ruv * ${SETTINGS.quality === 'high' ? '0.26' : '0.13'} + 0.31).rgb, mixK * 0.7) * mix(0.8, 1.2, texture2D(tGrass, wuv * 0.037).g * 1.6);
          grass = mix(grass, grass * vec3(1.12, 1.02, 0.8), smoothstep(0.55, 0.8, macro2));   // 枯れ色の斑
          ${this.def.autumn && !this.def.winter && !this.def.snow ? `
          // 秋は草の株ごとに灰緑と枯草を混ぜる。土と苔の斑や、雪のある戦はそのまま。
          grass *= mix(vec3(1.02, 0.94, 0.78), vec3(1.18, 0.9, 0.65), smoothstep(0.35, 0.75, macro2));
          ` : ''}
          vec3 dirt = mix(texture2D(tDirt, wuv * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb, texture2D(tDirt, ruv * ${SETTINGS.quality === 'high' ? '0.22' : '0.11'} + 0.57).rgb, mixK * 0.6) * mix(0.85, 1.12, macro2);
          ${this.def.patchyGround ? `
          // 広い裸地にも湿乾差をつなぐ。既存の大小の斑だけを使い、絵の読み出しは増やさない。
          float dampSoil = smoothstep(0.38, 0.68, macro) * (1.0 - smoothstep(0.35, 0.72, macro2));
          dirt *= mix(vec3(1.06, 1.03, 0.96), vec3(0.72, 0.76, 0.70), dampSoil);
          ` : ''}
          // 足もとは細かく：近くだけ、もっと細かな縮尺の絵を重ねて、ぼやけた地面にしない
          float nearK = 1.0 - smoothstep(4.0, 14.0, length(vWP - cameraPosition));
          ${`if (nearK > 0.0) {
            // 細かな絵の明るさを、その絵のならした明るさで割って（平均が 1 になる濃淡だけを掛ける）
            float gf = dot(texture2D(tGrass, ruv * 0.9).rgb, vec3(1.0)) / max(dot(texture2D(tGrass, ruv * 0.9, 9.0).rgb, vec3(1.0)), 1e-3);
            float df = dot(texture2D(tDirt, ruv * 0.85).rgb, vec3(1.0)) / max(dot(texture2D(tDirt, ruv * 0.85, 9.0).rgb, vec3(1.0)), 1e-3);
            grass *= mix(1.0, clamp(gf, 0.4, 1.8), nearK * 0.5);
            dirt *= mix(1.0, clamp(df, 0.4, 1.8), nearK * 0.55);
          }`}
          // 中くらいの坂（山道の脇・土手）も、真上から貼った草と土は坂の向きに伸びる。坂の所だけ横からも貼って混ぜる
          float slopeK = smoothstep(0.14, 0.4, 1.0 - abs(gN.y));
          if (slopeK > 0.0) {
            vec3 tw = abs(gN); tw = tw * tw; tw /= max(1e-3, tw.x + tw.y + tw.z);
            vec3 gS = (texture2D(tGrass, vWP.zy * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * tw.x + texture2D(tGrass, vWP.xy * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * tw.z) * mix(0.85, 1.12, macro2);
            vec3 dS = (texture2D(tDirt, vWP.zy * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb * tw.x + texture2D(tDirt, vWP.xy * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb * tw.z) * mix(0.85, 1.12, macro2);
            grass = mix(grass, gS + grass * tw.y, slopeK);
            dirt = mix(dirt, dS + dirt * tw.y, slopeK);
          }
          vec3 mud = texture2D(tMud, wuv * 0.26).rgb;
          // 粘土の細かな塊を近景だけ重ねる。泥の広い色むらと別の縮尺にする。
          ${`
          if (nearK > 0.0) {
            float mudGrain = dot(texture2D(tMud, ruv * 1.7).rgb, vec3(0.333));
            mud *= mix(1.0, clamp(mudGrain / max(0.015, dot(mud, vec3(0.333))), 0.65, 1.35), nearK * 0.45);
          }
          `}
          vec3 stone = texture2D(tStone, wuv * 0.12).rgb;
          // 崖・切岸の岩肌：真上から貼った絵は立った面で縦に伸びて「灰色の板」に見えるので、立った面は横から貼る。
          // 風化した岩塊と、割れ目の暗がり・苔の斑を足す（全画質で効く。絵の読みは三回だけ）
          {
            vec3 an = abs(normalize(vWN)); an = mix(an, abs(gN), 0.85);
            float side = smoothstep(0.35, 0.75, 1.0 - an.y);
            if (side > 0.0) {
              ${this.def.stableRockProjection ? `
              // 法線で座標を混ぜると、原点から離れた曲面ほど模様が圧縮される。
              // 同じ三回の読み出しで色を混ぜ、斑は既に読んだ値を使い回す。
              vec3 sst = (texture2D(tStone, vWP.zy * vec2(0.11, 0.16)).rgb * an.x
                + texture2D(tStone, vWP.xy * vec2(0.11, 0.16)).rgb * an.z) / max(0.001, an.x + an.z);
              float strata = mix(macro2, macro, 0.35);
              float crack = texture2D(tMacro, vec2(vWP.x * 0.033 + vWP.z * 0.041, vWP.y * 0.052) + 0.21).r;
              ` : `
              vec2 suv = (vWP.zy * an.x + vWP.xy * an.z) / max(0.001, an.x + an.z) * vec2(0.11, 0.16);
              vec3 sst = texture2D(tStone, suv).rgb;
              float strata = texture2D(tMacro, suv * 0.63 + vec2(macro2, macro) * 0.35).r;
              float crack = texture2D(tMacro, suv * 2.7 + 0.21).r;
              `}
              sst *= mix(0.72, 1.18, strata) * mix(0.62, 1.05, smoothstep(0.25, 0.55, crack));
              sst = mix(sst, sst * vec3(0.78, 0.92, 0.62), smoothstep(0.55, 0.8, macro2) * 0.6);
              stone = mix(stone, sst * vec3(1.04, 0.98, 0.9), side);
            }
          }
          vec3 w = vSplat;
          // 境目を絵の濃淡でぎざぎざにする
          float edge = texture2D(tMacro, wuv * 0.09).r;
          w.x = clamp(w.x + (edge - 0.5) * 0.6 * w.x * (1.0 - w.x) * 4.0, 0.0, 1.0);
          // 草一色の平場にも株間の地肌を残す。既存の斑を使い、絵の読み出しは増やさない。
          float bareSoil = smoothstep(0.44, 0.72, macro2) * 0.38 * w.x;
          w.x -= bareSoil; w.y += bareSoil;
          // 踏み荒らされた所：草が倒れて土が出て、濡れていれば泥になる（縁は絵の濃淡でばらつかせる）
          vec2 wearMarks = texture2D(tWear, (vWP.xz + ${this.half.toFixed(1)}) / ${(this.half * 2).toFixed(1)}).rg;
          float wear = wearMarks.r;
          wear = smoothstep(0.05, 0.75, wear * (0.75 + edge * 0.5));
          float trod = wear * (1.0 - smoothstep(0.3, 0.8, vWater));
          w.y += w.x * trod * (0.75 - uWet * 0.35);
          w.z += (w.x + w.y * 0.4) * trod * (0.25 + uWet * 0.45);
          w.x *= 1.0 - trod * 0.85;
          // 草の盛り上がりと土塊の高さで境を選ぶ。単なる半透明の混色を避ける。
          // 既に読んだ絵だけを使い、草一色・土一色の場所はそのまま保つ。
          vec3 relief = vec3(dot(grass, vec3(0.333)), dot(dirt, vec3(0.333)), dot(mud, vec3(0.333)));
          vec3 blendHeight = w + relief * 0.32;
          float blendTop = max(blendHeight.x, max(blendHeight.y, blendHeight.z));
          w *= max(vec3(0.0), blendHeight - vec3(blendTop - 0.28));
          w /= max(0.001, w.x + w.y + w.z);
          // 裸地の数十センチ〜数メートルの浅い窪み。細粒と広い色むらの間に、土の厚みをつなぐ。
          // 既存の斑を使い、色・照明・粗さで同じ窪みを共有する。面も絵の読み出しも増やさない。
          float earthLevel = edge + (macro2 - 0.5) * 0.38;
          float earthBasin = 1.0 - smoothstep(0.32, 0.56, earthLevel);
          float earthShoulder = smoothstep(0.42, 0.58, earthLevel)
            * (1.0 - smoothstep(0.58, 0.76, earthLevel));
          float earthK = (w.y + w.z * 0.7) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.2, 0.65, vWater))
            * (1.0 - smoothstep(18.0, 65.0, length(vWP - cameraPosition)));
          // 窪みの底は湿った灰褐色、崩れた縁は乾いた土色。黒い輪や一様な砂模様にしない。
          dirt *= mix(vec3(1.0), vec3(0.79, 0.82, 0.80), earthBasin * earthK)
            * (1.0 + earthShoulder * earthK * 0.10);
          mud *= 1.0 - earthBasin * earthK * 0.14;
          float earthRelief = (earthShoulder * 0.045 - earthBasin * 0.075) * earthK;
          // 土の窪みを全ての升に並べない。既存の斑で位置を曲げ、踏み荒れた所へまとめる。
          // 色・法線・粗さで同じ形を使う。絵の読み出しや面、毎コマの処理は足さない。
          vec2 clodUv = ruv * vec2(1.6, 2.4) + vec2(edge, macro2) * 1.7;
          vec2 clodCell = floor(clodUv);
          float clodSeed = fract(sin(dot(clodCell, vec2(127.1, 311.7))) * 43758.5453);
          vec2 clodP = fract(clodUv) - 0.5 - vec2(clodSeed - 0.5, fract(clodSeed * 7.3) - 0.5) * 0.36;
          vec2 clodAxis = normalize(vec2(clodSeed - 0.5, fract(clodSeed * 13.7) - 0.5) + vec2(0.001));
          vec2 clodLocal = vec2(dot(clodP, clodAxis), dot(clodP, vec2(-clodAxis.y, clodAxis.x)));
          // 左右で崩れ方を変えた土塊。閉じた楕円の輪を敷き詰める見え方を避ける。
          float clodRadius = length(clodLocal * vec2(1.0, mix(1.15, 2.2, clodSeed)))
            * (1.0 + clamp(clodLocal.x * clodLocal.y * 18.0, -0.2, 0.3));
          ${`
          // 乾いた土塊は丸い窪みと分け、割れた角と不ぞろいな側面を持たせる。
          vec2 clodFacet = abs(clodLocal * vec2(1.0, mix(1.15, 2.2, clodSeed)));
          float angularClod = max(max(clodFacet.x, clodFacet.y), (clodFacet.x + clodFacet.y) * 0.76)
            * (1.0 + clamp(clodLocal.x * clodLocal.y * 18.0, -0.2, 0.3));
          clodRadius = mix(clodRadius, angularClod, 0.75);
          `}
          float clodSize = mix(0.10, 0.25, fract(clodSeed * 5.3));
          float clod = 1.0 - smoothstep(clodSize * 0.18, clodSize, clodRadius);
          float clodFilter = 1.0 - smoothstep(0.12, 0.45, length(fwidth(clodUv)));
          float churn = smoothstep(0.32, 0.68, edge + (macro2 - 0.5) * 0.6);
          float clodK = (w.y * 0.55 + w.z) * mix(0.18, 1.0, max(churn, trod))
            * step(mix(0.72, 0.30, max(churn, trod)), fract(clodSeed * 19.3)) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.3, 0.8, vWater)) * clodFilter
            * (1.0 - smoothstep(8.0, 32.0, length(vWP - cameraPosition)));
          ${this.def.subtleMudRelief ? `// 指定した戦の泥は踏まれた所だけ。窪みの色・照り・凹凸を一緒に薄める。
          clodK *= smoothstep(0.55, 0.86, clodSeed) * smoothstep(0.15, 0.65, trod) * 0.28;` : ''}
          float clodHollow = smoothstep(0.3, 0.9, clod);
          float clodRim = smoothstep(0.05, 0.24, clod) * (1.0 - smoothstep(0.3, 0.6, clod))
            * smoothstep(-0.12, 0.12, clodLocal.x + clodLocal.y * 0.5 + (clodSeed - 0.5) * 0.2);
          ${`
          // 裸地には盛り上がった土塊、踏まれた泥には窪み。同じ形を色・法線で共有する。
          // 草地・水面・切岸を避け、近景と画素より大きい粒だけに効かせる。
          float crustK = w.y * (1.0 - trod * 0.85) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.3, 0.8, vWater)) * clodFilter * (1.0 - farK);
          ${this.def.sparseEarthCrust ? `
          // 既存の斑と升の乱数で乾いた土塊を間引く。色・高さ・粗さを一緒に抑える。
          crustK *= smoothstep(0.60, 0.90, clodSeed) * mix(0.12, 0.40, churn);
          ` : ''}
          float crustTop = smoothstep(0.08, 0.78, clod);
          float crustCrease = (1.0 - smoothstep(0.0, 0.18, clod)) * smoothstep(0.18, 0.5, clodSeed);
          ${this.def.softEarthCrust ? `
          // 升ごとの乱数が境で飛ぶ陰を、土塊の周りだけに限る。
          // 色・高さ・粗さをまとめて弱め、法線にも升の継ぎ目を残さない。
          vec2 crustEdge = min(fract(clodUv), 1.0 - fract(clodUv));
          crustK *= smoothstep(0.0, 0.16, min(crustEdge.x, crustEdge.y));
          crustCrease *= smoothstep(0.0, 0.16, clod);
          ` : ''}
          float crustHeight = (crustTop * mix(0.035, 0.085, clodSeed) - crustCrease * 0.018) * crustK;
          dirt *= 1.0 + (crustTop * 0.14 - crustCrease * 0.32) * crustK;
          `}
          dirt *= 1.0 + (clodRim * 0.22 - clodHollow * 0.18) * clodK;
          mud *= 1.0 + (clodRim * 0.28 - clodHollow * 0.3) * clodK;
          // 倒れた草は色が褪せて黄ばむ
          grass = mix(grass, grass * vec3(1.05, 0.95, 0.72), trod);
          vec3 col = grass * w.x + dirt * w.y + mud * w.z;
          // 林床の苔と落ち葉。既存の斑と土の絵を使い、面も絵の読みも増やさない。
          float floorK = vGroundCover.y * smoothstep(0.42, 0.7, macro) * (1.0 - trod) * w.x;
          float mossK = floorK * smoothstep(0.45, 0.7, macro2) * (0.3 + uWet * 0.4 + vGroundCover.x * 0.3);
          col = mix(col, dirt * vec3(0.58, 0.78, 0.38), mossK * 0.6);
          // 落ち葉を一面の等間隔の金粒にしない。林床と草際の数メートルの吹き溜まりへ寄せる。
          // 土塊で求めた乱数・向き・升を共用し、面・画像・絵の読み出しは増やさない。
          float litterPatch = smoothstep(0.37, 0.62, macro) * (1.0 - smoothstep(0.4, 0.64, macro2));
          float litterK = clamp((vGroundCover.y * 0.85 + w.x * 0.16) * litterPatch
            * (1.0 - slopeK) * (1.0 - trod) * (1.0 - smoothstep(0.1, 0.5, vWater))
            * ${this.def.templeNeedles ? '1.6' : this.def.autumn && !this.def.winter && !this.def.snow ? '0.85' : '0.4'}, 0.0, 0.85);
          float leafSeed = fract(clodSeed * 37.1);
          vec2 leafP = clodP - vec2(fract(clodSeed * 17.3), fract(clodSeed * 23.7)) * 0.4 + 0.2;
          vec2 leafLocal = vec2(dot(leafP, clodAxis), dot(leafP, vec2(-clodAxis.y, clodAxis.x)));
          vec2 leafSize = vec2(mix(0.13, 0.25, leafSeed), mix(0.05, 0.10, fract(clodSeed * 11.7)));
          ${this.def.templeNeedles ? 'leafSize *= vec2(1.35, 0.28);' : ''}
          vec2 leafShape = leafLocal / leafSize;
          // 先端を尖らせた葉。中央の折れと反った縁を照明へ渡し、貼った丸い点にしない。
          float leafEdge = abs(leafShape.y) + pow(abs(leafShape.x), 1.4);
          float leafAA = max(0.04, fwidth(leafEdge));
          float leafMask = (1.0 - smoothstep(1.0 - leafAA, 1.0 + leafAA, leafEdge))
            * smoothstep(leafSeed - 0.06, leafSeed + 0.06, litterK);
          float leafNear = clodFilter * (1.0 - smoothstep(12.0, 38.0, length(vWP - cameraPosition)));
          // 遠くは葉を一枚ずつ残さず、占める面積に応じた暗い腐葉土の斑へ戻す。
          float litterCover = mix(litterK * 0.035, leafMask, leafNear);
          float leafWet = max(uWet, vGroundCover.x * 0.7);
          vec3 leafColor = dirt * mix(vec3(0.7, 0.53, 0.34), vec3(1.08, 0.83, 0.46), fract(clodSeed * 7.3));
          leafColor *= 1.0 - leafWet * 0.35;
          col = mix(col, leafColor, litterCover * 0.85);
          float leafRelief = leafMask * leafNear * (0.004 * (1.0 - clamp(abs(leafShape.y), 0.0, 1.0))
            + 0.002 * smoothstep(0.55, 1.0, leafEdge)) * (1.0 - leafWet * 0.7);
          // 砂利は乾いた道の縁の斑に。轍・足跡は土の絵と既存の歩いた跡を保つ。
          col = mix(col, stone * vec3(1.04, 0.98, 0.85), w.y * smoothstep(0.62, 0.8, macro2) * (1.0 - uWet) * 0.35);
          // 土の間の小石。世界座標の粒と既存の岩色を使い、面と絵の読みを増やさない。
          // 小石も全ての窪みへ置かず、乾いた斑にまばらに残す。遠い粒は平均色へ消す。
          vec2 pebbleCell = clodP;
          float pebbleRadius = mix(0.025, 0.085, fract(clodSeed * 11.7));
          float pebble = (1.0 - smoothstep(pebbleRadius * 0.55, pebbleRadius, clodRadius)) * clodFilter
            * step(0.76, fract(clodSeed * 23.1)) * smoothstep(0.38, 0.65, macro2);
          col = mix(col, stone * (1.15 + pebbleCell.y), pebble * (w.y + bareSoil) * (1.0 - slopeK) * 0.65);
          ${this.def.gravelCourt ? `
          // 掃いた境内の細かな砂利。既存の土・石の絵を使い、草や藁の柄を持ち込まない。
          vec2 courtLo = vWP.xz - vec2(${Number(this.def.gravelCourt.x0).toFixed(2)}, ${Number(this.def.gravelCourt.z0).toFixed(2)});
          vec2 courtHi = vec2(${Number(this.def.gravelCourt.x1).toFixed(2)}, ${Number(this.def.gravelCourt.z1).toFixed(2)}) - vWP.xz;
          float courtEdge = min(min(courtLo.x, courtLo.y), min(courtHi.x, courtHi.y));
          float courtK = smoothstep(0.0, 0.45, courtEdge) * (1.0 - slopeK);
          // 等間隔の丸い粒は遠くで縞になる。既存の石の絵の縮小表示を使い、
          // 画素より細かな砂利は平均の色へなじませる。
          vec2 gravelUv = ruv * 0.8 + vec2(edge, macro2) * 0.15;
          float gravelFootprint = length(dFdx(gravelUv)) + length(dFdy(gravelUv));
          float gravelNear = (1.0 - smoothstep(22.0, 30.0, length(vWP - cameraPosition)))
            * (1.0 - smoothstep(0.08, 0.35, gravelFootprint));
          float grain = 0.35;
          if (gravelNear > 0.001) grain = mix(grain, dot(texture2D(tCourt, gravelUv).rgb, vec3(0.3333)), gravelNear);
          vec3 court = vec3(${(this.def.gravelCourt.color || [0.72, 0.70, 0.64]).map(c => Number(c).toFixed(2)).join(', ')}) * mix(0.85, 1.05, macro2);
          court *= clamp(0.58 + grain * 1.2, 0.65, 1.3) * mix(0.86, 1.1, edge);
          // 掃き筋を並べず、歩く道の幅と縁を既存の斑で崩す。戦うほど跡が増す。
          float worn = exp(-pow((vWP.z - ${Number(this.def.gravelCourt.pathZ).toFixed(2)} + (edge - 0.5) * 1.4)
            / (${Number(this.def.gravelCourt.pathWidth).toFixed(2)} * mix(0.75, 1.3, macro2)), 2.0))
            * smoothstep(${Number(this.def.gravelCourt.pathX).toFixed(2)}, ${(Number(this.def.gravelCourt.pathX) + 2).toFixed(2)}, vWP.x);
          float scuffed = max(trod, worn * 0.8) * mix(0.6, 1.0, edge);
          court = mix(court, dirt * vec3(1.05, 0.97, 0.83), scuffed * 0.8);
          // 掃いた砂利にも土の染みと掻き寄せた粒が残る。既存の斑と粒を共用する。
          float courtDamp = smoothstep(0.36, 0.68, macro2) * (1.0 - smoothstep(0.35, 0.72, edge));
          court *= mix(vec3(1.03, 1.0, 0.94), vec3(0.69, 0.72, 0.66), courtDamp * 0.7);
          court = mix(court, dirt * vec3(0.91, 0.86, 0.74), trod * (0.28 + courtDamp * 0.28));
          court = mix(court, stone * vec3(1.08, 1.02, 0.9), pebble * (1.0 - scuffed * 0.7) * 0.38);
          float rimMoss = (1.0 - smoothstep(0.25, 1.6, courtEdge)) * smoothstep(0.35, 0.7, macro2);
          court = mix(court, court * vec3(0.6, 0.73, 0.43), rimMoss * 0.65);
          // 矩形の石畳と目地。既存の一枚の地面で描き、面を増やさない。
          float paveBand = max(
            (1.0 - smoothstep(${(Number(this.def.gravelCourt.pathWidth) - 0.08).toFixed(2)}, ${Number(this.def.gravelCourt.pathWidth).toFixed(2)}, abs(vWP.z - ${Number(this.def.gravelCourt.pathZ).toFixed(2)}))) * step(${Number(this.def.gravelCourt.pathX).toFixed(2)}, vWP.x),
            (1.0 - smoothstep(${(Number(this.def.gravelCourt.pathWidth) - 0.08).toFixed(2)}, ${Number(this.def.gravelCourt.pathWidth).toFixed(2)}, abs(vWP.x - ${Number(this.def.gravelCourt.pathX).toFixed(2)}))) * step(38.0, vWP.z) * step(vWP.z, 80.0));
          vec2 paveUv = vec2(vWP.x / 1.25 + mod(floor(vWP.z / 0.8), 2.0) * 0.5, vWP.z / 0.8);
          vec2 jointD = min(fract(paveUv), 1.0 - fract(paveUv));
          vec2 jointAA = max(fwidth(paveUv), vec2(0.003));
          float paveFace = smoothstep(0.025, 0.025 + jointAA.x, jointD.x) * smoothstep(0.035, 0.035 + jointAA.y, jointD.y);
          float paveSeed = fract(sin(dot(floor(paveUv), vec2(127.1, 311.7))) * 43758.5453);
          vec3 paveColor = mix(vec3(0.16, 0.145, 0.12), vec3(0.43, 0.42, 0.38) * mix(0.83, 1.12, paveSeed), paveFace);
          paveColor *= mix(0.88, 1.08, edge);
          float buildingD = 1000.0;
          ${(this.def.gravelCourt.buildings || []).map((b) => `buildingD = min(buildingD, max(max(${Number(b[0]).toFixed(2)} - vWP.x, vWP.x - ${Number(b[1]).toFixed(2)}), max(${Number(b[2]).toFixed(2)} - vWP.z, vWP.z - ${Number(b[3]).toFixed(2)})));`).join('\n          ')}
          float buildingSoil = 1.0 - smoothstep(1.25, 1.5, buildingD);
          court = mix(court, dirt * vec3(1.05, 0.85, 0.61), buildingSoil);
          float courtLeaf = (1.0 - smoothstep(1.0 - leafAA, 1.0 + leafAA, leafEdge)) * step(0.72, leafSeed) * buildingSoil;
          court = mix(court, leafColor, courtLeaf * leafNear * 0.85);
          ${this.def.gravelCourt.garden ? `
          float gardenD = length(vWP.xz - vec2(${Number(this.def.gravelCourt.garden.x).toFixed(2)}, ${Number(this.def.gravelCourt.garden.z).toFixed(2)}));
          float gardenMoss = (1.0 - smoothstep(${Number(this.def.gravelCourt.garden.r).toFixed(2)}, ${(Number(this.def.gravelCourt.garden.r) + 2).toFixed(2)}, gardenD + (edge - 0.5) * 1.5));
          court = mix(court, vec3(0.25, 0.32, 0.15) * mix(0.7, 1.1, macro2) * mix(0.9, 1.1, grain), gardenMoss * 0.85);
          ` : ''}
          court = mix(court, paveColor * (1.0 - trod * 0.18), paveBand);
          col = mix(col, court, courtK);
          // 色と同じ砂利・踏み窪みを照明にも渡す。新しい絵や面は作らない。
          float courtRelief = courtK * ((grain - 0.35) * 0.07 * (1.0 - scuffed * 0.65) * (1.0 - paveBand)
            + (clodRim * 0.018 - clodHollow * 0.032) * scuffed * clodFilter * (1.0 - paveBand)
            + paveFace * 0.015 * paveBand);
          ` : ''}
          // 緩い山腹から切岸までつなぐ。道や平場には侵食を載せない。
          float slopeGrade = 1.0 - mix(abs(normalize(vWN).y), abs(gN.y), 0.65);
          float steep = smoothstep(0.10, 0.46, slopeGrade);
          float slopeRelief = 0.0;
          // 緩い土手は崖の処理がほぼ効かず、草色の一枚板になっていた。
          // 等高線に沿う座標で雨溝を作り、溝底の土と根の張った草の縁を分ける。
          // 共通の絵を一回だけ追加で読み、面・材質・歩く高さは増やさない。
          float turfRange = 1.0 - smoothstep(45.0, 110.0, length(vWP - cameraPosition));
          float turfSlope = smoothstep(0.018, 0.085, slopeGrade) * (1.0 - steep)
            * (1.0 - smoothstep(0.3, 0.8, vWater)) * (1.0 - trod * 0.85) * turfRange;
          if (turfSlope > 0.001) {
            ${this.def.stableSlopeGrain ? `
            // 山道の細かな起伏で法線が回っても、模様の座標は連続させる。
            // 大きな世界座標と変化する法線の内積は、細い縞へ圧縮される。
            vec2 bankUv = vec2(vWP.x * 0.096 + vWP.z * 0.072,
              vWP.y * 0.035 + vWP.z * 0.024) + vec2(macro2, macro) * 0.12;
            ` : `
            // 法線の符号に依存しない向き。土手の左右で模様が反転しない。
            vec2 uphill = normalize(normalize(vWN).xz + vec2(0.0001));
            vec2 contour = vec2(-uphill.y, uphill.x);
            vec2 bankUv = vec2(dot(vWP.xz, contour) * 0.12 + (macro2 - 0.5) * 0.22,
              vWP.y * 0.035 + macro * 0.12);
            `}
            float drainage = texture2D(tMacro, bankUv).r;
            float channel = 1.0 - smoothstep(0.36, 0.53, drainage);
            // 草の縁は大小の斑で欠けさせ、等間隔の縞や全面の茶色にしない。
            float sod = smoothstep(0.43, 0.59, drainage + (edge - 0.5) * 0.3);
            float torn = (1.0 - sod) * (0.35 + channel * 0.65);
            vec3 exposed = mix(dirt * vec3(0.92, 0.86, 0.73), mud * 0.85,
              channel * (0.25 + uWet * 0.35));
            vec3 turf = mix(grass * mix(0.76, 1.03, sod), exposed, torn);
            col = mix(col, turf, turfSlope * w.x * 0.85);
            // 草の根元の段差と浅い雨溝を実際の光へ渡す。遠くでは色だけに戻す。
            slopeRelief = (sod * 0.065 - channel * 0.16) * turfSlope * w.x
              * (1.0 - smoothstep(24.0, 65.0, length(vWP - cameraPosition)));
          }
          if (steep > 0.001) {
            // 急な面（山城の切岸・崖）：上から貼った絵は縦に伸びて筋になる。横から（xy・zy）貼り直し、
            // 風化した土と粘土の斑、雨溝に削り残された岩肌を描く
            vec3 an = mix(abs(normalize(vWN)), abs(gN), 0.85); an = an * an; an /= max(1e-3, an.x + an.y + an.z);
            vec2 uX = vWP.zy, uZ = vWP.xy;
            vec3 stT = texture2D(tStone, uX * 0.12).rgb * an.x + texture2D(tStone, uZ * 0.12).rgb * an.z + stone * an.y;
            vec3 dtT = texture2D(tBank, uX * 0.21).rgb * an.x + texture2D(tBank, uZ * 0.21).rgb * an.z + dirt * an.y;
            // 高さを一定間隔で折り返すと谷全体に横縞が走る。
            // 岩の向きごとに斑を読み、既存の大小の斑で歪めて連続した露頭にする。
            vec2 weatherWarp = vec2(macro2 - 0.5, macro - 0.5) * 0.65;
            float lay = (texture2D(tMacro, uX * vec2(0.047, 0.031) + weatherWarp).r * an.x
              + texture2D(tMacro, uZ * vec2(0.039, 0.041) - weatherWarp + 0.37).r * an.z)
              / max(0.001, an.x + an.z);
            float clay = smoothstep(0.48, 0.68, lay * 0.65 + macro2 * 0.35);
            vec3 loam = mix(vec3(0.38, 0.26, 0.18), vec3(0.52, 0.39, 0.26), smoothstep(0.25, 0.75, lay));
            loam = mix(loam, vec3(0.57, 0.47, 0.32), clay * 0.55);
            loam *= mix(0.86, 1.10, lay);
            float lum = dot(dtT, vec3(0.333)) / max(1e-3, dot(texture2D(tBank, uZ * 0.21, 9.0).rgb, vec3(0.333)));
            loam = mix(loam, vec3(dot(loam, vec3(0.333))) * vec3(1.02, 0.95, 0.86), uRock * 0.55);   // 岩山の土は赤すぎない灰褐色
            vec3 earth = loam * clamp(lum, 0.55, 1.5);
            // 縦へ数十ｍ伸びていた雨筋を、数ｍごとに崩れる土の肩と窪みにする。
            // 横からの二方向の投影を保ち、高さでも斑を変えて引き伸ばした壁を避ける。
            float runoffWarp = (lay - 0.5) * 0.32 + (macro2 - 0.5) * 0.18;
            vec2 runoff = vec2(
              texture2D(tMacro, vec2(vWP.z * 0.06 + runoffWarp, vWP.y * 0.035 + 0.17)).r,
              texture2D(tMacro, vec2(vWP.x * 0.06 + runoffWarp, vWP.y * 0.035 + 0.43)).r);
            float rill = dot(runoff, an.xz) / max(0.001, an.x + an.z);
            float hollow = 1.0 - smoothstep(0.34, 0.50, rill);
            float shoulder = smoothstep(0.50, 0.66, rill);
            float tributary = (1.0 - smoothstep(0.035, 0.12, abs(edge - 0.48)))
              * (1.0 - shoulder) * (0.4 + hollow * 0.6);
            earth *= 1.0 - hollow * 0.26 - tributary * 0.12 + shoulder * 0.10;
            earth = mix(earth, dtT * vec3(0.82, 0.79, 0.70), hollow * 0.32);
            float clastRelief = 0.0;
            ${`
            // 近い切岸だけ、掌〜足幅の土塊を同じ斑の絵から読む。形・材質・描画の束は増やさない。
            float clastRange = 1.0 - smoothstep(12.0, 38.0, length(vWP - cameraPosition));
            if (clastRange > 0.0) {
              vec2 clastUvX = uX * vec2(0.65, 0.48) + vec2(runoff.x * 0.3, lay * 0.2);
              vec2 clastUvZ = uZ * vec2(0.65, 0.48) + vec2(runoff.y * 0.3, lay * 0.2);
              float clastNoise = (texture2D(tMacro, clastUvX).r * an.x
                + texture2D(tMacro, clastUvZ + 0.37).r * an.z) / max(0.001, an.x + an.z);
              // 画素より細かくなる割れはならし、移動時のちらつきを抑える。
              float clastWidth = max(0.025, fwidth(clastNoise));
              float clast = smoothstep(0.47 - clastWidth, 0.57 + clastWidth, clastNoise);
              float seam = 1.0 - smoothstep(0.39 - clastWidth, 0.48 + clastWidth, clastNoise);
              float clastK = clastRange * (0.65 + hollow * 0.35);
              earth *= 1.0 + (clast * 0.10 - seam * 0.18) * clastK;
              // 色と同じ土塊を法線へ渡す。固定の明暗だけでなく日差しや松明で凹凸が読める。
              clastRelief = (clast * 0.055 - seam * 0.045) * clastK;
            }
            `}
            // 岩棚は削り残された塊ごとに張り出す。標高で反復する段は作らない。
            float bed = smoothstep(0.30, 0.72, lay * 0.6 + rill * 0.4);
            stT *= mix(0.74, 1.12, bed) * (1.0 - tributary * 0.18);
            stT = mix(stT, stT * vec3(0.92, 0.86, 0.8), uRock * 0.5);
            // 近くの岩肌は細かな粒と割れを重ねる（八歩ごとの大きな絵だけではぼやける）
            if (farK < 1.0) {
              float sd = dot(texture2D(tStone, uX * 0.53 + 0.31).rgb * an.x + texture2D(tStone, uZ * 0.53 + 0.31).rgb * an.z, vec3(0.333)) / max(0.05, an.x + an.z);
              stT *= mix(1.0, clamp(sd / 0.45, 0.55, 1.45), (1.0 - farK) * 0.7 * (an.x + an.z));
            }
            // 岩：尾根の高い所と、大きな斑のある所だけ（山城の土の切岸を岩だらけにしない）
            float rockK = smoothstep(0.52, 0.74, mix(macro2, rill, 0.5) + slopeGrade * 0.24
              + uRock * 0.22 + shoulder * 0.13 - hollow * 0.12);
            vec3 cliff = mix(earth, stT, rockK);
            // 天端の縁は草が垂れ下がる（崖の上の端だけ緑が残る）
            float lip = smoothstep(0.28, 0.4, 1.0 - normalize(vWN).y) * (1.0 - smoothstep(0.4, 0.62, 1.0 - normalize(vWN).y));
            // 草も横から貼る（真上から貼った草は急な面で斜めの筋に伸びる）
            vec3 grassT = texture2D(tGrass, uX * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * an.x + texture2D(tGrass, uZ * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * an.z + grass * an.y;
            cliff = mix(cliff, grassT * 0.85, lip * 0.45 * w.x);
            // 斜面にしがみつく笹と苔の斑（崖の中ほどまで。真っ直ぐな面ほど少ない）
            // 座標を法線で混ぜると、曲がる切岸では遠い原点からの距離まで
            // 拡大され、草と苔が細い縞になる。指定した戦だけ連続した座標を使う。
            float veg = smoothstep(0.44, 0.64, texture2D(tMacro, ${this.def.stableCliffGrain
              ? 'vec2(vWP.x * 0.031 + vWP.z * 0.033, vWP.y * 0.045) + 0.21'
              : '(uX * an.x + uZ * an.z) * 0.045 + 0.21' }).r)
              * (1.0 - smoothstep(0.48, 0.75, slopeGrade)) * (1.0 - rockK * 0.8);
            // 草は削れた溝底を避け、苔は湿った溝の脇へ寄せる。
            cliff = mix(cliff, grassT * vec3(0.62, 0.7, 0.55), veg * (1.0 - hollow) * 0.7);
            float mossEdge = smoothstep(0.3, 0.4, rill) * (1.0 - smoothstep(0.46, 0.55, rill));
            cliff = mix(cliff, grassT * vec3(0.48, 0.58, 0.36), mossEdge * veg * 0.35);
            // 中距離も沢の両側へ光が回る。細い支流と岩棚だけ先に粗くし、遠くは色へ戻す。
            // 色と同じ岩塊を照明へ渡す。細部は距離で薄め、遠景のちらつきを抑える。
            float ledge = bed * (0.65 + shoulder * 0.35);
            float reliefFar = 1.0 - smoothstep(55.0, 170.0, length(vWP - cameraPosition));
            float reliefFine = 1.0 - smoothstep(16.0, 60.0, length(vWP - cameraPosition));
            slopeRelief += ((shoulder * 0.30 - hollow * 0.42) * reliefFar
              + ((ledge - 0.5) * rockK * 0.12 - tributary * 0.09) * reliefFine
              + clastRelief * (1.0 - rockK)) * steep;
            col = mix(col, cliff, steep);
          }
          // 山の杉林（def.slopeForest）：斜面に杉の樹冠の濃い緑と、木の間の黒い土・ところどころの岩肌・笹の明るい斑を置く。
          // 遠い一枚岩の壁にしない。細かい斑は世界の座標から（霞の中でも粒が見える）
          if (uForest > 0.0) {
            float hill = smoothstep(0.02, 0.12, 1.0 - normalize(vWN).y) * smoothstep(0.3, 1.5, vWP.y);
            // 三方向から貼って混ぜる（上から貼ると立った面で縦の筋に伸びる。面ごとの向きの違いでも継ぎ目が出ない）
            vec3 fw = pow(mix(abs(normalize(vWN)), abs(gN), 0.85), vec3(4.0)); fw /= (fw.x + fw.y + fw.z);
            #define FTRI(sc, off) (texture2D(tMacro, vWP.zy * (sc) + (off)).r * fw.x + texture2D(tMacro, vWP.xy * (sc) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (sc) + (off)).r * fw.y)
            #define FTRA(a, b, off) (texture2D(tMacro, vec2(vWP.z * (a), vWP.y * (b)) + (off)).r * fw.x + texture2D(tMacro, vec2(vWP.x * (a), vWP.y * (b)) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (a) + (off)).r * fw.y)
            float k1 = FTRI(0.17, 0.13), k2 = FTRI(0.43, 0.51), k3 = FTRI(1.3, 0.0);
            float crown = smoothstep(0.0, 1.0, (k1 * 0.45 + k2 * 0.35 + k3 * 0.25 - 0.5) * 4.2 + 0.5);
            vec3 sugi = mix(vec3(0.045, 0.075, 0.045), vec3(0.11, 0.17, 0.085), smoothstep(0.3, 0.9, k3));
            ${this.def.autumn && !this.def.winter && !this.def.snow ? `
            // 遠い雑木と同じ赤茶・黄を杉の濃緑に混ぜる。既存の絵の大小の斑を使い、読み出しを増やさない。
            float broadPatch = smoothstep(0.38, 0.62, k1 * 0.7 + macro2 * 0.3);
            vec3 autumnCrown = mix(vec3(0.28, 0.085, 0.025), vec3(0.43, 0.29, 0.055), smoothstep(0.36, 0.65, k2));
            sugi = mix(sugi, autumnCrown * mix(0.7, 1.1, k3), broadPatch);
            ` : ''}
            vec3 floor0 = vec3(0.085, 0.062, 0.045) * (0.7 + 0.6 * k2);
            vec3 forest = mix(floor0, sugi, crown);
            // 遠目の山肌：杉の大きな塊・縦に走る沢と尾根・岩場の帯。細かな粒が霞で消えても、一枚の壁にならない
            float bigK = FTRI(0.031, 0.7);
            float gully = FTRA(0.06, 0.006, 0.3);
            forest *= mix(0.5, 1.5, smoothstep(0.3, 0.7, bigK)) * mix(1.0, mix(0.55, 1.25, smoothstep(0.35, 0.65, gully)), farK);
            forest = mix(forest, forest * vec3(1.5, 1.25, 0.9) + vec3(0.02, 0.015, 0.0), smoothstep(0.62, 0.8, bigK) * (1.0 - crown) * 0.6);   // 明るい落葉・地肌の斑
            // 岩肌：大きな斑のある所だけ、割れた岩の灰褐色
            float rband = FTRA(0.02, 0.017, 0.45);
            float rk = smoothstep(0.56, 0.7, rband * 0.7 + k1 * 0.3 + macro2 * 0.2) * smoothstep(0.1, 0.3, 1.0 - normalize(vWN).y);
            vec3 rockc = stone * vec3(0.95, 0.86, 0.74) * mix(0.55, 1.1, k3);
            forest = mix(forest, rockc, rk * ${this.def.slopeForestTint ? 'min(0.85, uRock * 3.5)' : '0.85'});
            // 笹と明るい広葉の斑
            forest = mix(forest, vec3(0.2, 0.26, 0.1), smoothstep(0.64, 0.78, k2) * (1.0 - rk) * 0.5);
            ${this.def.slopeForestTint ? `
            // 基本の緑褐色と、地形と一致する沢の陰。青い空気遠近は遠山専用のまま。
            col = mix(col, vSlopeTint, hill * 0.65);
            forest *= clamp(dot(vSlopeTint, vec3(0.333333)) / 0.213333, 0.4, 1.2);
            ` : ''}
            col = mix(col, forest, hill * uForest * (1.0 - smoothstep(0.0, 1.0, wear) * 0.9) * mix(1.0 - 0.85 * steep, 1.0, farK));
            #undef FTRI
            #undef FTRA
          }
          ${this.def.erodedSlopes ? `
          // 谷筋は縦に流れ、尾根には砂礫を残す。足場を削らず既存の土と岩の絵を使う。
          float erosionSlope = smoothstep(0.035, 0.24, 1.0 - abs(gN.y));
          float erosionPhase = (vWP.x + vWP.z * 0.37) * 0.38
            + sin(vWP.y * 0.18 + macro2 * 2.0) * 1.4 + macro * 2.0;
          // 溝の間隔と幅を既存の土の斑で崩し、等間隔の縞を避ける。
          float erosionGully = pow(0.5 + 0.5 * sin(erosionPhase + (edge - 0.5) * 2.2), 6.0)
            * smoothstep(0.25, 0.65, macro2);
          float erosionRock = smoothstep(0.48, 0.72, macro2) * erosionSlope;
          vec3 erosionSoil = mix(dirt * vec3(0.87, 0.80, 0.68), stone * vec3(0.92, 0.90, 0.82), erosionRock);
          col = mix(col, erosionSoil, erosionSlope * (0.16 + erosionGully * 0.48)
            * (1.0 - smoothstep(0.2, 0.6, vWater)));
          col *= 1.0 - erosionGully * erosionSlope * 0.15;
          ` : ''}
          ${this.def.springSnowPatch ? `
          // 早春の残雪は高い日陰の草土に小さく残す。道・川・屋敷と立った岩面は覆わない。
          float snowShade = smoothstep(18.0, 30.0, vWP.y - (vWP.x + 200.0) * 0.05)
            * (1.0 - smoothstep(-12.0, 0.0, vWP.z)) * smoothstep(0.68, 0.84, macro2)
            * smoothstep(0.45, 0.8, normalize(vWN).y);
          col = mix(col, vec3(0.55, 0.56, 0.51), snowShade * 0.65);
          ` : ''}
          col *= mix(0.94, 1.3, macro);
          // 雨で濡れると暗く
          // 夜は濡れによる黒つぶれを抑え、泥と草の濃淡を残す。
          col *= 1.0 - max(uWet, vGroundCover.x * 0.7) * (0.28 + w.z * 0.15) * (1.0 - uNight * 0.55);
          // 夜も土の茶・草と苔の灰緑を残す。青い灰色への置き換えを弱め、明るさだけを沈める。
          col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(1.02, 0.98, 0.88), uNight * 0.16) * (1.0 - uNight * 0.2);
          // 田の水面：濁った水の色。空は映すが、ぎらつかせない（照り返しは下で弱める）
          float wat = smoothstep(0.3, 0.8, vWater);
          col = mix(col, vec3(0.075, 0.08, 0.06) + mud * 0.22 + grass * 0.05, wat * 0.92);
          // 踏み荒らされた窪みに、雨の強さ（濡れ具合）で水が溜まる。雨が上がっても乾くまで残る
          // 泥の暗いくぼみや踏み固めた道にも水が残る。斜面には溜めない
          float hollow = 1.0 - smoothstep(0.035, 0.075, dot(mud, vec3(0.333)));
          float pool = max(smoothstep(0.55, 0.95, wear), w.z * hollow + w.y * hollow * 0.3)
            * (1.0 - smoothstep(0.3, 0.55, edge)) * smoothstep(0.35, 0.8, uWet) * (1.0 - wat) * (1.0 - steep);
          // 近い泥では窪みの底だけに水を張り、盛り上がった縁のざらつきと照りを分ける。
          // 遠くは従来の広い濡れ斑へ戻す。画素より細かい窪みも同じ係数で消す。
          float clodPool = smoothstep(0.65, 0.96, clod) * smoothstep(0.35, 0.8, uWet);
          pool = mix(pool, clodPool, clamp(clodK * (0.4 + trod * 0.6), 0.0, 1.0));
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
            float wt = smoothstep(0.3, 0.8, vWater);
            ${mat.isMeshLambertMaterial ? `// 軽い材質の土は頂点で照らす。効かない凹凸用の六回の絵の読みを省く。
            vec3 bw = vec3(0.0);` : `
            vec3 bw = vec3(0.0);
            // 色を混ぜた後の草・土・泥から細部を読む。隣の画素を六回読み直す処理を省く。
            float soilRelief = dot(grass, vec3(0.333)) * w.x * 0.035
              + dot(dirt, vec3(0.333)) * w.y * 0.06 + dot(mud, vec3(0.333)) * w.z * 0.045;
            ${this.def.gravelCourt ? 'soilRelief = soilRelief * (1.0 - courtK) + courtRelief;' : ''}
            // 泥の窪みと縁を保ち、斜面の雨溝・露岩の段差も照明に重ねる。
            float trodHeight = (soilRelief + leafRelief + (clodRim * 0.016 - clodHollow * 0.035) * clodK
              ${`+ crustHeight + pebble * mix(0.018, 0.045, clodSeed) * crustK`}
              + earthRelief ${this.def.gravelCourt ? '* (1.0 - courtK)' : ''})
              * (1.0 - smoothstep(14.0, 48.0, length(vWP - cameraPosition))) + slopeRelief;
            vec3 soilDx = dFdx(-vViewPosition), soilDy = dFdy(-vViewPosition);
            vec3 soilR1 = cross(soilDy, normal), soilR2 = cross(normal, soilDx);
            float soilDet = dot(soilDx, soilR1) * faceDirection;
            normal = normalize(abs(soilDet) * normal - sign(soilDet)
              * (dFdx(trodHeight) * soilR1 + dFdy(trodHeight) * soilR2) * (1.0 - max(wt, pool)));
            `}
            // 水面の小さなさざ波（風で揺れる）
            bw += vec3(waveSlope.x, 0.0, waveSlope.y) * max(wt, pool);
            normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
          }`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          roughnessFactor = mix(roughnessFactor, 0.55, max(w.z * 0.7, vGroundCover.x * 0.65));
          roughnessFactor = mix(roughnessFactor, 0.34 + w.x * 0.14, uWet * (0.55 + w.z * 0.45));   // 濡れた土と泥は照り、草はそれほどでもない
          // 乾いた縁はざらつかせ、雨の時だけ窪みの底の照りを強める。
          roughnessFactor += (earthShoulder * 0.08 - earthBasin * uWet * 0.12) * earthK;
          // 押し出された土の縁はざらつき、湿った窪みだけが滑らかに光る。
          roughnessFactor = clamp(roughnessFactor + clodK * (clodRim * 0.2 - clodHollow * uWet * 0.18), 0.18, 1.0);
          ${`
          // 土塊の頂部は乾いてざらつき、割れ目の底は湿りを残す。
          roughnessFactor = mix(roughnessFactor, 0.98, crustTop * crustK * 0.7);
          roughnessFactor = mix(roughnessFactor, 0.48, crustCrease * crustK * uWet * 0.55);
          `}
          roughnessFactor = mix(roughnessFactor, mix(0.92, 0.52, leafWet), litterCover);
          roughnessFactor = mix(roughnessFactor, 0.42, smoothstep(0.3, 0.8, vWater));
          roughnessFactor = mix(roughnessFactor, 0.12, pool);`)
        // 田の照り返しは空の半分ほどに（白く光りすぎないように）
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // 夜や影でも土・葉・砂利の色を残す。水面は既存の空の照り返しを使う。
          reflectedLight.indirectDiffuse += diffuseColor.rgb * (0.06 + uNight * 0.12) * (1.0 - max(wat, pool) * 0.7);
          // 遠くの田は浅い角度で空を映しきって白い紙のようになるので、遠いほど照り返しを抑える
          float watFar = smoothstep(40.0, 160.0, length(vWP - cameraPosition));
          ${mat.isMeshLambertMaterial ? `// 低・中でも、空の色と見る角度で田・泥の艶を残す
          vec3 soilView = normalize(cameraPosition - vWP);
          vec3 waterNormal = normalize(vec3(waveSlope.x, 1.0, waveSlope.y));
          float grazing = 1.0 - clamp(dot(soilView, waterNormal), 0.0, 1.0);
          float sheen = (wat * 0.24 + pool * 0.2 + w.z * uWet * 0.035 * (1.0 - steep))
            * (0.25 + grazing * grazing * 0.75) * (1.0 - watFar * 0.5) * (1.0 - bld * 0.6);
          // 空の大きな雲を映す。鏡用の描き直しをせず、既存の斑を揺らす。
          float reflectedCloud = 0.7 + 0.3 * sin(wuv.x * 0.065 + sin(wuv.y * 0.05 + uTime * 0.025) * 1.8);
          reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud;` : ''}
          reflectedLight.indirectSpecular *= 1.0 - wat * (0.5 + watFar * 0.3) - pool * watFar * 0.4;
          reflectedLight.directSpecular *= 1.0 - wat * 0.6;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
    terrainView(mesh, this.def.terrainCullCell, this.scene, this.def.terrainClipCells);
  }

  buildVegetation() {
    this.treeCardSavings = 0;
    const R = rng(this.def.seed || 11);
    // 画質「低」（携帯の既定）：作る時間を縮める。木の形の種類・株のためし置き・足もとの草・田の苗・低木を減らす（遠目の見た目は変えない程度に）
    // window.__vegFull を true にすると「低」でも減らさない（前後の見比べ用）
    const lowV = false && !window.__vegFull;
    // 段ごとの作る時間（ミリ秒）を window.__vegTimes に残す（読み込みの重さを調べる係が読む）
    const VT = window.__vegTimes = {}; let vt0 = performance.now();
    const lap = (k) => { const t = performance.now(); VT[k] = Math.round(t - vt0); vt0 = t; };
    const clear = this.def.clear || (() => false);
    const paths = this.def.paths || [];
    const ok = (x, z, pad, rockBand = false) => {
      if (this.castle && castleInside(this.castle, x, z, 8)) return false;   // 曲輪と土塁の上には木を立てない
      if (!rockBand && clear(x, z)) return false;
      for (const p of paths) if (distToPolyline(x, z, p) < pad * (this.def.treePadMul ?? 1)) return false;   // 細い山道は木を道の際まで（def.treePadMul）
      if (this.def.water && x > this.def.water.x - 4 && x < (this.def.water.x2 ?? 1e9) + 3) return false;
      for (const st of this.def.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.6 + pad * 0.3) return false;
      if (this.def.paddy && this.def.paddy(x, z) > 0.3) return false;
      return true;
    };
    // 木：杉は垂れる枝房、松は枝先の房、広葉樹は重なる葉の塊。形は林全体で使い回す。
    let trees = { sugi: [], matsu: [], broad: [], take: [] };
    const treeCount = this.def.trees ?? 520;
    const extra = this.def.groves || [];
    const place = (x, z, inGrove, fixedKind) => {
      const y = this.heightAt(x, z);
      const s = 0.75 + R() * 0.6;
      const r = R();
      const sg = this.def.sugiAt ? this.def.sugiAt(x, z) : 0;   // 杉林（def.sugiAt：0〜1 で杉の割合を上げる）
      // 土地ごとの樹種の割合。同じ形を共有し、本数と乱数の消費は変えない。
      const cedar = this.def.treeMix?.sugi ?? 0.46 + sg * 0.5;
      const pine = this.def.treeMix?.matsu ?? 0.66 + sg * 0.3;
      const kind = fixedKind ?? (this.def.pineOnly ? 'matsu' : inGrove && r < 0.12 && !sg ? 'take' : r < cedar ? 'sugi' : r < pine ? 'matsu' : 'broad');
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
      const cedarGrove = this.def.sugiAt ? this.def.sugiAt(x, z) : 0;
      if (placed < treeCount && R() < 0.45 + cedarGrove * 0.4) { const a = R() * 6.28, d = 3 + R() * 4 - cedarGrove * 2; const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d; if (ok(x2, z2, 6)) { place(x2, z2, false); placed++; } }
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
        // 指定の並木・竹藪も、既存の樹種別の束と遠景の形を共有する。
        const t = (k + .5) / g.n - .5;
        const x = g.line ? g.x + t * g.line[0] + Math.cos(a) * r : g.x + Math.cos(a) * r * (g.sx || 1);
        const z = g.line ? g.z + t * g.line[1] + Math.sin(a) * r : g.z + Math.sin(a) * r * (g.sz || 1);
        // 指定した戦だけ、追加の林にも道・川岸・空地の条件を適用する。
        if (this.def.clearGroves && !ok(x, z, 6)) continue;
        place(x, z, true, g.kind);
      }
    }
    const winter = !!(this.def.winter || this.def.snow);
    const autumn = !!this.def.autumn && !winter;
    // 葉：遠くでも葉の塊が痩せて板の形が見えないよう、絵が縮むほど不透明の度合いを上げる。空の映り込みは控えめ（白く浮かないように）
    // 高画質は同じ絵・揺れ・距離の材質を林全体で共有し、型ごとの切り替えを省く。
    const leafMaterials = new Map();
    const lightCedar = true && this.def.lightCedarFoliage;
    // 杉の絵の透明な左右だけを設営時に調べる。縮小時の縁用に八画素残す。
    let cedarLeft = 0, cedarRight = 1;
    if (lightCedar) {
      const { data, width, height } = leafTex('cedar').image;
      let left = width, right = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x); right = Math.max(right, x);
      }
      if (right >= left) {
        cedarLeft = Math.max(0, left - 8) / width;
        cedarRight = Math.min(width, right + 9) / width;
      }
    }
    const leafMat = (kind, tint, amp, far = false, cards = false) => {
      const key = `${kind}|${tint}|${amp}|${far}|${cards}`;
      if (leafMaterials?.has(key)) return leafMaterials.get(key);
      const opts = { map: leafTex(kind), color: tint, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide };
      // 五十五メートル先の杉も枝房・色・透かし・風・受ける影を保ち、艶と環境反射だけ省く。
      const material = lightCedar && far && kind === 'cedar'
        ? new THREE.MeshLambertMaterial(opts)
        : liteMat({ ...opts, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
      const mat = sway(material, amp, 2.5, { after: cards ? far ? farTreeLit : nearTreeLit : leafLit });
      if (leafMaterials) leafMaterials.set(key, mat);
      return mat;
    };
    // 幹：カメラの近くでは網目に抜く。狭い谷では戦の指定で早めに透かす。
    const nearTreeFadeRadius = Math.max(2, this.def.nearTreeFadeRadius ?? 2).toFixed(2);
    const trunkScale = this.def.treeTrunkScale ?? 1;
    const barkMat = (kind) => {
      const m = liteMat({ map: barkTex(kind), vertexColors: true, color: kind === 'bamboo' ? 0xffffff : 0x9b7654, bumpMap: barkTex(kind), bumpScale: 1.5, roughness: 0.95, metalness: 0 });
      m.customProgramCacheKey = () => 'barkNear' + nearTreeFadeRadius;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          { float nd = length(vViewPosition); if (nd < ${nearTreeFadeRadius}) { vec2 q = floor(gl_FragCoord.xy); float th = fract((q.x * 2.0 + q.y * 3.0) * 0.2 + fract(q.y * 0.5) * 0.5); if (smoothstep(0.7, ${nearTreeFadeRadius}, nd) < th) discard; } }`);
      };
      return m;
    };
    // 葉の板：外向きの法線にして、塊が丸く照らされるようにする
    const card = (parts, cx, cy, cz, w, h, ry, rx, ox, oy, oz, fold = false, needle = false, roll = 0) => {
      // 杉は同じ四面を長さ方向へ割り当て、枝先の垂れを作る。
      // 遠景・低画質は従来の二面で、枝先の細まりだけを残す。
      const g = new THREE.PlaneGeometry(w, h, fold && !needle ? 2 : 1, fold && needle ? 2 : 1);
      // 葉房を浅い山形へ折る。横から見ても一枚の線へ消さない。
      // 読込時の共有形だけを変え、材質・描画回数・毎コマの処理は増やさない。
      if (needle) {
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const t = p.getY(k) / h + 0.5;
          const spread = 0.75 - t * 0.2 + Math.sin(t * Math.PI) * 0.35;
          // 根元は枝へ絞り、葉の重なる中央を膨らませ、先を下へ反らす。
          p.setXYZ(k, p.getX(k) * spread + w * 0.06 * t * t,
            p.getY(k), w * 0.32 * t * t);
        }
      } else if (fold) {
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) p.setZ(k, (1 - Math.abs(p.getX(k)) / (w * 0.5)) * w * 0.24);
      }
      if (needle && lightCedar) {
        // 折り目の各段を同じ面の上で切り詰め、絵の座標も合わせる。
        // 葉の幅・反り・面数・影の束は増やさず、透明な余白の画素処理を減らす。
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let k = 0; k < p.count; k += 2) {
          const left = p.getX(k), span = p.getX(k + 1) - left;
          p.setX(k, left + span * cedarLeft); p.setX(k + 1, left + span * cedarRight);
          uv.setX(k, cedarLeft); uv.setX(k + 1, cedarRight);
        }
      }
      if (roll) g.rotateZ(roll);
      g.rotateX(rx); g.rotateY(ry); g.translate(cx, cy, cz);
      const n = g.attributes.normal, p = g.attributes.position, shade = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const v = new THREE.Vector3(p.getX(k) - ox, (p.getY(k) - oy) * 0.6, p.getZ(k) - oz).normalize();
        n.setXYZ(k, v.x, Math.max(0.25, v.y + 0.35), v.z);
        // 葉の塊の下側は枝葉の重なりで暗く。遠くでも面の厚みを残す。
        // 杉は枝元の重なりを暗く、外へ伸びる葉先を明るくする。
        // 絵や光源を増やさず、板全体が同じ明るさに見えるのを避ける。
        const light = needle
          ? 0.62 + g.attributes.uv.getY(k) * 0.26 + Math.max(0, v.y) * 0.08
          : 0.58 + Math.max(0, v.y) * 0.32
            + 0.1 * Math.sin(p.getX(k) * 2.3 + p.getZ(k) * 1.7 + cy);
        shade[k * 3] = light * 0.98; shade[k * 3 + 1] = light; shade[k * 3 + 2] = light * 1.02;
      }
      g.normalizeNormals();
      g.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      parts.push(g);
    };
    const T = rng(4242);
    // 幹と枝の筒の、埋まって見えない蓋（地面の下の根元・幹の中の枝の付け根・葉の房の中の端）を形から外す。
    //   置く前の筒（上が +y）で、法線が真上（top）・真下（bottom）の面だけを落とす
    const capless = (g, top, bottom) => {
      const N = g.attributes.normal, I = g.index;
      if (!N || !I) return g;
      const keep = [];
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2), y = N.getY(a);
        if (Math.abs(y) > 0.999 && N.getY(b) === y && N.getY(c) === y && (y > 0 ? top : bottom)) continue;
        keep.push(a, b, c);
      }
      g.setIndex(keep);
      return g;
    };
    const makeVariant = (kind) => {
      const bark = [], leaves = [], farLeaves = [];
      // 共通の杉は透ける枝葉の房で組み、大きな多角形の面を輪郭に出さない。
      // 高遠を含む各戦で共有し、専用の樹冠を指定した戦はその作りを使う。
      const naturalNeedles = kind === 'sugi' && (this.def.cedarBoughs || !this.def.branchFoliage && !this.def.solidFoliage);
      // 松・雑木の共通形も葉房にする。専用の閉じた樹冠を指定した戦は保つ。
      const naturalCrowns = (kind === 'matsu' || kind === 'broad') && !this.def.branchFoliage && !this.def.solidFoliage;
      if (kind === 'sugi') {
        const H = 10 + T() * 7;
        // 細い幹の頂は梢へ尖らせ、平らな切り口を残さない。
        const tr = capless(new THREE.CylinderGeometry(this.def.layeredNeedles ? 0.07 * trunkScale : trunkScale < 1 ? 0 : 0.13, 0.38 * trunkScale, H, this.def.templeNeedles ? 10 : 7), false, true); tr.translate(0, H / 2, 0); bark.push(tr);
        // 下枝から頂まで葉を重ね、低画質でも幹だけの柱にしない。
        const c0 = H * (0.22 + T() * 0.06), R0 = 2.2 + T() * 0.7;
        const tiers = lowV ? 4 : 6, step = (H - c0) / tiers;
        for (let k = 0; k < tiers; k++) {
          const broken = !!this.def.brokenNeedleTiers;
          const t = k / (tiers - 1), r = R0 * (1 - t * 0.76) * (broken ? 0.88 + 0.16 * Math.sin(k * 2.7 + H) : 1);
          if (naturalNeedles) {
            const cy = c0 + step * (0.5 + k), phase = k * 2.4 + H;
            // 新しく葉房へ替える杉は葉だけの乱数を使う。幹・枝の形と矢の当たりを保つ。
            const F = this.def.raggedNeedles ? T : rng(Math.floor(H * 10000) + k * 97);
            // 葉の根元から先へ向かう軸を、幹から外へ伸びる枝とそろえる。
            // 縦長の板が並ぶ樹冠を避け、斜めに張る枝房の間から幹と空を見せる。
            // 高画質でも一段二十面。形と絵は全ての株で使い回す。
            const count = lowV ? 4 : 5;
            // 指定した戦だけ葉房を起こす。横から薄い切れ端になるのを避ける。
            const pitch = this.def.cedarBoughPitch ?? 1.05;
            const width = this.def.cedarBoughWidth ?? 1;
            for (let j = 0; j < count; j++) {
              const a = phase + j * Math.PI * 2 / count, d = r * (0.45 + F() * 0.2);
              card(leaves, Math.sin(a) * d, cy + (F() - 0.5) * step * 0.7, Math.cos(a) * d,
                r * (0.85 + F() * 0.25) * width, Math.max(r * 1.45, step * (1.45 + F() * 0.3)),
                a, pitch + F() * 0.4, 0, cy, 0, !lowV, true);
            }
            // 遠景も同じ方向と傾斜。三方向の板だけで枝張りを残す。
            for (let j = 0; j < 3; j++) {
              const a = phase + j * Math.PI * 2 / 3, d = r * 0.55;
              card(farLeaves, Math.sin(a) * d, cy, Math.cos(a) * d,
                r * 1.25 * width, Math.max(r * 1.45, step * 1.6), a, this.def.cedarBoughPitch == null ? 1.25 : pitch + 0.2, 0, cy, 0, false, true);
            }
            continue;
          }
          if (this.def.branchFoliage) {
            // 杉の枝先を輪生させ、円錐の面を葉の絵で抜いた房へ替える。
            // 房は上下にずらし、段の水平な縁と同心円の輪郭を残さない。
            const cy = c0 + step * 0.5 + k * step;
            // 枝房を幹の同心円から外す。面数は保ち、片側の長枝と欠けた枝先を作る。
            const lean = k * 1.9 + H, offX = Math.cos(lean) * r * 0.22, offZ = Math.sin(lean) * r * 0.22;
            for (let j = 0; j < (lowV ? 6 : 9); j++) {
              const a = j * 2.4 + k * 1.7, d = r * (0.35 + T() * 0.42);
              const branch = 0.76 + 0.24 * Math.cos(a - lean);
              // 本流の不ぞろいな枝張りに、葉房の細まり・反り・枝元の陰影を重ねる。
              card(leaves, offX + Math.cos(a) * d * branch,
                cy + (T() - 0.5) * step * 0.8 - d * 0.18, offZ + Math.sin(a) * d * branch,
                r * (0.85 + T() * 0.5) * branch, step * (1.2 + T() * 0.5),
                // 指定した戦だけ枝房を外へ寝かせる。乱数の回数と面数は従来のまま。
                this.def.slopingNeedleBoughs ? Math.PI / 2 - a : a + 0.4,
                this.def.slopingNeedleBoughs ? 1.25 + (T() - 0.5) * 0.4 : (T() - 0.5) * 1.2,
                offX, cy, offZ, this.def.foldedNeedleCards, true);
            }
            continue;
          }
          // 共通の杉：円錐の水平な裾を閉じた葉房へ替える。面数は従来以下。
          // 近景と遠景を同じ式で作り、距離が変わっても枝の張り・垂れを保つ。
          const needleLayer = (segments, rings) => {
            const layer = new THREE.SphereGeometry(1, segments, rings);
            const lp = layer.attributes.position;
            for (let q = 0; q < lp.count; q++) {
              const x = lp.getX(q), y = lp.getY(q), z = lp.getZ(q);
              const edge = Math.hypot(x, z), a = Math.atan2(z, x);
              // 上を細く、下枝を広く。方位と段ごとに房をずらし、同心円を崩す。
              // 極では変形をゼロにし、重複頂点の継ぎ目を閉じたままにする。
              const branch = Math.sin(a * 3 + k * 1.7 + H);
              // 枝側の段ごとの欠けと垂れを、閉じた葉房にも残す。近景・遠景で式を共有する。
              const ragged = this.def.raggedNeedles ? 0.12 * Math.cos(a * 5 + k * 1.7) + 0.08 * Math.cos(a * 3 - y * 2) : 0;
              const spread = (1 - y * 0.38) * (1 + edge * (branch * 0.22 + 0.1 * Math.cos(a * 2 - k) + ragged));
              const droop = edge * edge * (0.16 + (broken ? 0.16 : 0)) * (0.5 + 0.5 * branch) + Math.abs(ragged) * edge * 0.3;
              const layered = this.def.layeredNeedles ? 1 + edge * 0.12 : 1;
              lp.setXYZ(q, x * r * spread * layered + y * r * 0.1,
                (y - droop) * step * 1.075, z * r * spread * layered);
            }
            layer.computeVertexNormals();
            layer.rotateY(k * 2.4);
            layer.translate(Math.sin(k * 2.4) * r * 0.18,
              c0 + step * 0.55 + k * step + step * 0.14 * Math.sin(k * 2.1 + H),
              Math.cos(k * 2.4) * r * 0.18);
            return layer;
          };
          leaves.push(needleLayer(lowV ? 6 : 9, this.def.raggedNeedles ? 5 : lowV && !this.def.layeredNeedles ? 2 : 3));
          // 五十五メートル先は輪郭を残し、房の内側の細分だけを省く。
          // 枝房を残す戦は中距離も三段にし、上下二つの三角面の折れ目を和らげる。
          farLeaves.push(needleLayer(this.def.nearCedarBranches ? 7 : 5, this.def.nearCedarBranches ? 3 : 2));
        }
        if (this.def.thickTrees || this.def.branchTrees || this.def.templeNeedles) for (let k = 0; k < 6; k++) {
          const a = k * 2.4, y = c0 + (H - c0) * (0.12 + k * 0.1), r = R0 * (0.8 - k * 0.08);
          const br = capless(new THREE.CylinderGeometry(0.05, 0.13, r, 5), true, false);
          br.rotateZ(Math.PI / 2); br.rotateY(-a); br.translate(Math.cos(a) * r / 2, y, Math.sin(a) * r / 2); bark.push(br);
        }
      } else if (kind === 'matsu') {
        // 曲がった幹と、枝先の平たい葉の雲
        let x = 0, z = 0, y = 0;
        const lean = T() * 6.28, H = 7 + T() * 4;
        for (let k = 0; k < 4; k++) {
          const nx = x + Math.cos(lean + k * 0.7) * 0.6, nz = z + Math.sin(lean + k * 0.7) * 0.6, ny = y + H / 4;
          const seg = capless(new THREE.CylinderGeometry((k === 3 && trunkScale < 1 ? 0 : 0.2 - k * 0.03) * trunkScale, (0.28 - k * 0.03) * trunkScale, H / 4 + 0.1, 6), false, k === 0);
          const dir = new THREE.Vector3(nx - x, ny - y, nz - z);
          seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
          seg.translate((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
          bark.push(seg);
          x = nx; y = ny; z = nz;
        }
        // 三〜四段に枝を分け、枝先ごとに厚みのある葉の房を置く。
        const tiers = lowV ? 3 : 4;
        for (let c = 0; c < tiers; c++) {
          const cy = H * (0.48 + c / (tiers - 1) * 0.49);
          for (let j = 0; j < 2; j++) {
            const a = c * 2.4 + j * 2.7, d = (1.5 + T() * 0.9) * (1 - c * 0.13);
            // 三方ヶ原の松は左右の枝を同じ高さにそろえず、棚状の段を崩す。
            const branchY = cy + (this.def.raggedPineCrowns ? Math.sin(a * 1.7 + H) * H * 0.055 : 0);
            const cx = x * (cy / H) + Math.cos(a) * d, cz = z * (cy / H) + Math.sin(a) * d;
            const rise = this.def.raggedPineCrowns ? branchY - cy + 0.2 : 0;
            const br = capless(new THREE.CylinderGeometry(0.05, 0.1, Math.hypot(d, rise), 5), true, true);
            // 高さを散らした葉房へ、幹から枝をつなぐ。水平な黒い切れ端を残さない。
            br.rotateZ(Math.PI / 2 + Math.atan2(rise, d)); br.rotateY(-a);
            br.translate(x * (cy / H) + Math.cos(a) * d / 2, branchY - 0.2 - rise / 2, z * (cy / H) + Math.sin(a) * d / 2); bark.push(br);
            const crown = new THREE.IcosahedronGeometry(1, lowV ? 0 : 1);
            crown.scale(1.5 + T() * 0.5, 0.65 + T() * 0.2, 1.25 + T() * 0.4);
            crown.rotateY(a); crown.translate(cx, branchY, cz); leaves.push(crown);
          }
        }
      } else if (kind === 'broad') {
        const H = 5 + T() * 3;
        const tr = capless(new THREE.CylinderGeometry(0.16 * trunkScale, 0.32 * trunkScale, H, 7), !winter, true); tr.translate(0, H / 2, 0); bark.push(tr);
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
        for (let k = 0; k < (winter ? 0 : 5); k++) {
          const a = k * 2.4, r = k === 4 ? 0 : R0 * 0.52;
          const crown = new THREE.IcosahedronGeometry(1, lowV ? 0 : 1);
          crown.scale(R0 * 0.7, R0 * (0.62 + T() * 0.15), R0 * 0.68);
          crown.translate(Math.cos(a) * r, cy + (k === 4 ? R0 * 0.5 : (T() - 0.5) * 0.8), Math.sin(a) * r);
          leaves.push(crown);
        }
      } else {
        // 竹：細い稈を何本も束ね、上に葉
        for (let k = 0; k < 7; k++) {
          const a = T() * 6.28, d = T() * 1.2, H = 9 + T() * 4;
          const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
          const cul = new THREE.CylinderGeometry(0.05, 0.06, H, 5); cul.translate(cx, H / 2, cz); cul.rotateZ((T() - 0.5) * 0.06); bark.push(cul);
          for (let q = 0; q < (lowV ? 4 : 6); q++) card(leaves, cx + (T() - 0.5) * 1.6, H * (0.6 + T() * 0.4), cz + (T() - 0.5) * 1.6, 1.8, 1.4, T() * 6.28, (T() - 0.5) * 0.8, cx, H * 0.7, cz);
        }
      }
      const leafBoughs = this.def.branchFoliage && (kind === 'matsu' || kind === 'broad');
      if (leafBoughs || naturalCrowns) {
        // 松・雑木は折った枝葉を上下に組む。房の腹にも頂点を置き、平板の縁と一色の塊を崩す。
        const crowns = leaves.splice(0);
        const boughCount = this.def.foldedNeedleCards ? (lowV ? 4 : 6) : (lowV ? 3 : 4);
        for (const g of crowns) {
          g.computeBoundingBox();
          const center = g.boundingBox.getCenter(new THREE.Vector3()), size = g.boundingBox.getSize(new THREE.Vector3());
          if (naturalCrowns) {
            // 房ごとの乱数に閉じ、幹・枝と矢の当たりの形は変えない。
            const raggedPine = kind === 'matsu' && this.def.raggedPineCrowns;
            const F = rng(Math.floor((center.y + size.x) * 10000));
            const count = lowV ? 3 : 5, phase = F() * Math.PI * 2;
            for (let j = 0; j < count; j++) {
              const a = phase + j * 2.4, d = j === 0 ? 0 : 0.2 + F() * 0.13;
              // 少し折った葉房を互い違いに重ねる。球の面を見せず、枝間に空を残す。
              card(leaves, center.x + Math.cos(a) * size.x * d,
                center.y + (F() - 0.5) * size.y * (raggedPine ? 0.9 : 0.5), center.z + Math.sin(a) * size.z * d,
                size.x * ((raggedPine ? 0.5 : 0.8) + F() * 0.15), size.y * ((raggedPine ? 1.8 : 1.1) + F() * 0.2),
                a, (F() - 0.5) * 1.1, center.x, center.y, center.z, !lowV || raggedPine, false,
                raggedPine ? Math.sin(a * 1.7 + phase) * 0.6 : 0);
            }
            // 遠くも三房のまま。房を同じ中心へ重ねず、横長の板の輪郭を分ける。
            for (let j = 0; j < 3; j++) {
              const a = phase + j * Math.PI * 2 / 3;
              card(farLeaves, center.x + (raggedPine ? Math.cos(a) * size.x * 0.2 : 0),
                center.y + (raggedPine ? Math.sin(phase + j * 2.4) * size.y * 0.5 : 0),
                center.z + (raggedPine ? Math.sin(a) * size.z * 0.2 : 0),
                size.x * (raggedPine ? 0.58 : 1.1), size.y * (raggedPine ? 1.9 : 1.3),
                a, raggedPine ? (j % 2 ? -0.7 : 0.65) : 0.15,
                center.x, center.y, center.z, !!raggedPine, false,
                raggedPine ? Math.sin(a * 1.7 + phase) * 0.6 : 0);
            }
            g.dispose();
            continue;
          }
          // 乱数の消費順は保ち、後の幹・枝と矢玉の当たりを変えない。
          for (let j = 0; j < (lowV ? 6 : 9); j++) {
            const d = j === 0 ? 0 : 0.2 + T() * 0.2;
            const lift = T(), width = T(), height = T(), tilt = T();
            if (j >= boughCount) continue;
            const a = j * Math.PI * 2 / 3 + (j >= 3 ? 0.8 : 0);
            const cx = center.x + Math.cos(a) * size.x * d * 0.7;
            const cy = center.y + (j >= 3 ? 0.18 : -0.12) * size.y + (lift - 0.5) * size.y * 0.2;
            const cz = center.z + Math.sin(a) * size.z * d * 0.7;
            const w = size.x * (0.64 + width * 0.16), h = size.y * (0.9 + height * 0.2);
            const pitch = (j >= 3 ? -0.55 : 0.5) + (tilt - 0.5) * 0.4;
            card(leaves, cx, cy, cz, w, h, a, pitch, center.x, center.y, center.z, true);
            // 遠くは同じ三方向の葉房だけ。絵・陰影・枝張りを共有し、細分を増やさない。
            if (j < 3) card(farLeaves, cx, cy, cz, w * 1.08, h * 1.08, a, pitch, center.x, center.y, center.z, true);
          }
          g.dispose();
        }
      }
      const fix = (arr) => {
        const parts = arr.map(g => g.index ? g.toNonIndexed() : g);
        const merged = mergeGeometries(parts);
        for (let i = 0; i < parts.length; i++) if (parts[i] !== arr[i]) parts[i].dispose();
        parts.length = 0;
        return merged;
      };
      let leafGeo = null, core = null;
      // 葉房へ替えた共通の木も、従来の太い幹と枝の寸法を保つ。
      if ((naturalNeedles && !this.def.raggedNeedles || naturalCrowns) && this.def.thickTrees) for (const g of bark) g.scale(1.3, 1, 1.3);
      if (kind !== 'take' && !this.def.branchFoliage && !naturalNeedles && !naturalCrowns) {
        // 房の上下と段ごとに濃淡を付ける。形と色は読み込み時に一度だけ作る。
        for (let k = 0; k < leaves.length + farLeaves.length; k++) {
          const g = k < leaves.length ? leaves[k] : farLeaves[k - leaves.length], pos = g.attributes.position;
          // 共通の松・雑木も、刈り込んだ球の輪郭を枝房の凹凸へ替える。
          // 同じ座標には同じ変形を使い、継ぎ目を裂かない。形は林で共用する。
          if (kind === 'matsu' || kind === 'broad') {
            g.computeBoundingBox();
            const center = g.boundingBox.getCenter(new THREE.Vector3());
            for (let q = 0; q < pos.count; q++) {
              const x = pos.getX(q) - center.x, y = pos.getY(q) - center.y, z = pos.getZ(q) - center.z;
              const swell = 1 + 0.17 * Math.sin(x * 2.7 + z * 1.8 + k) + 0.1 * Math.cos(z * 3.1 - y * 2.3);
              pos.setXYZ(q, center.x + x * swell, center.y + y * swell + 0.22 * Math.sin(x * 2 - z * 2.6 + k), center.z + z * swell);
            }
            g.computeVertexNormals();
          }
          g.computeBoundingBox();
          const box = g.boundingBox, height = Math.max(0.01, box.max.y - box.min.y);
          const colors = new Float32Array(pos.count * 3);
          for (let q = 0; q < pos.count; q++) {
            const light = kind === 'sugi'
              ? 0.58 + (pos.getY(q) - box.min.y) / height * 0.3 + (k % 3) * 0.05 + Math.max(0, g.attributes.normal.getY(q)) * 0.08
              : 0.74 + (pos.getY(q) - box.min.y) / height * 0.22 + (k % 3) * 0.025;
            colors[q * 3] = light; colors[q * 3 + 1] = light; colors[q * 3 + 2] = light;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        core = leaves.length ? fix(leaves) : null;
        // 太い木を指定した戦の幹の太さは保つ。
        if (this.def.thickTrees) for (const g of bark) g.scale(this.def.solidFoliage ? 1.65 : 1.3, 1, this.def.solidFoliage ? 1.65 : 1.3);
      } else {
        leafGeo = leaves.length ? fix(leaves) : null;
        if (leafGeo && !this.def.thickTrees && !this.def.branchFoliage && !naturalNeedles && !naturalCrowns) {
          leafGeo.computeBoundingBox();
          const box = leafGeo.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
          const inner = leaves.map((g, i) => {
            g.computeBoundingBox();
            const p = g.boundingBox.getCenter(new THREE.Vector3());
            return { i, d: Math.pow((p.x - center.x) / size.x, 2) + Math.pow((p.y - center.y) / size.y, 2) + Math.pow((p.z - center.z) / size.z, 2) };
          }).sort((a, b) => a.d - b.d);
          // 岩村の杉は四〜六段しかない。全部を抜くと、残るのは八面体だけになる。
          const keepNeedles = this.def.keepNeedleLayers && kind === 'sugi';
          const removed = new Set((keepNeedles ? [] : inner.slice(0, 12)).map((p) => p.i));
          const parts = leaves.filter((g, i) => !removed.has(i));
          for (let k = 0; k < (keepNeedles ? 0 : 3); k++) {
            const g = new THREE.OctahedronGeometry(1, 0);
            const tall = kind === 'sugi' || kind === 'take', width = tall ? 0.32 - k * 0.07 : 0.28;
            g.scale(size.x * width, size.y * (tall ? 0.28 : 0.32), size.z * width);
            g.translate(center.x + (tall ? 0 : (k - 1) * size.x * 0.18), center.y + (tall ? (k - 1) * size.y * 0.22 : (k - 1) * size.y * 0.08), center.z);
            const colors = new Float32Array(g.attributes.position.count * 3); colors.fill(1);
            g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, -1, -1);
            parts.push(g);
          }
          leafGeo.dispose();
          leafGeo = fix(parts);
          // 元の葉と共用しない、補った中心の部品もここで返す。
          for (const g of parts) if (!leaves.includes(g)) g.dispose();
          parts.length = 0;
        }
      }
      // 幹の根元と枝の付け根に陰と苔色。共有頂点色だけで葉との重なりを読ませる。
      for (const g of bark) {
        const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
        g.computeBoundingBox();
        const box = g.boundingBox, height = Math.max(0.01, box.max.y - box.min.y);
        for (let q = 0; q < pos.count; q++) {
          const h = (pos.getY(q) - box.min.y) / height;
          const light = 0.72 + Math.min(1, h * 3) * 0.28;
          const moss = kind === 'take' ? 0 : Math.max(0, 1 - pos.getY(q) / 1.4) * 0.18;
          colors[q * 3] = light * (1 - moss);
          colors[q * 3 + 1] = light;
          colors[q * 3 + 2] = light * (1 - moss * 0.65);
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      // 指定した戦の杉は高画質でも枝房を残す。木全体を一枚の切り紙へ戻さない。
      // 低・中画質と、指定のない戦は従来の形を保つ。
      const cards = true && !leafBoughs && !(this.def.nearCedarBranches && kind === 'sugi'), hadFar = farLeaves.length > 0;
      let savedTriangles = 0;
      if (cards && (leafGeo || core)) {
        const source = leafGeo || core;
        savedTriangles = Math.max(0, Math.min(treeTriangles(source) - 6,
          hadFar ? farLeaves.reduce((sum, g) => sum + treeTriangles(g), 0) - 2 : Infinity));
        source.computeBoundingBox();
        const box = source.boundingBox, size = box.getSize(new THREE.Vector3());
        const width = Math.max(size.x, size.z), height = Math.max(0.1, size.y), cy = (box.min.y + box.max.y) / 2;
        if (leafGeo) leafGeo.dispose();
        if (core) core.dispose();
        for (const g of farLeaves) g.dispose();
        leafGeo = treeCards(width, height, cy); core = null;
        farLeaves.length = 0;
        if (hadFar) farLeaves.push(treeCards(width, height, cy, 1));
      }
      // 幹と枝だけの当たり。葉は弾も矢も止めない。形を作る時に一度だけ用意する。
      if (kind !== 'take' && this.def.treeScale) {
        for (const g of bark) scaleTreePart(g, this.def.treeScale);
        for (const g of [leafGeo, core, ...farLeaves]) if (g) scaleTreePart(g, this.def.treeScale, true);
      }
      const woodBounds = bark.map((g) => { g.computeBoundingBox(); return g.boundingBox.clone(); });
      const result = { bark: fix(bark), leaves: leafGeo, core, farCore: (cards || core || naturalNeedles || naturalCrowns || leafBoughs) && farLeaves.length ? fix(farLeaves) : null, naturalNeedles, naturalCrowns, leafBoughs, cards, savedTriangles, woodBounds };
      for (const parts of [bark, leaves, farLeaves]) {
        for (const g of parts) g.dispose();
        parts.length = 0;
      }
      return result;
    };
    const dummy = new THREE.Object3D();
    const tintOf = {
      sugi: () => new THREE.Color().setRGB(0.55 + R() * 0.1, 0.62 + R() * 0.12, 0.5),
      matsu: () => new THREE.Color().setRGB(0.6 + R() * 0.1, 0.7 + R() * 0.1, 0.55)
        .multiplyScalar(this.def.raggedPineCrowns ? 0.65 : 1),
      broad: () => autumn ? new THREE.Color([0xc9a060, 0xd08040, 0xa8a050, 0xe0b050][Math.floor(R() * 4)]) : new THREE.Color().setRGB(0.72 + R() * 0.15, 0.8 + R() * 0.12, 0.6),
      take: () => new THREE.Color().setRGB(0.85, 0.95, 0.7),
    };
    const barkKind = { sugi: 'cedar', matsu: 'pine', broad: 'cedar', take: 'bamboo' };
    this.treeMeshes = [];
    this.missileWood = [];
    for (const kind of Object.keys(trees)) {
      const list = trees[kind];
      if (!list.length) continue;
      const trunkMat = barkMat(barkKind[kind]);
      const crownMat = kind === 'take' ? null : sway(liteMat({ color: 0x8fa572, vertexColors: true, roughness: 1, envMapIntensity: 0.25 }), 0.02, 2.5);
      let sharedDepth = null;
      const VAR = lowV ? (kind === 'sugi' ? 2 : 1) : kind === 'take' ? 2 : kind === 'matsu' ? 4 : 3;
      for (let v = 0; v < VAR; v++) {
        const mine = list.filter((t, i) => i % VAR === v);
        if (!mine.length) continue;
        const g = makeVariant(kind);
        this.treeCardSavings += g.savedTriangles * mine.length;
        const bm = new THREE.InstancedMesh(g.bark, trunkMat, mine.length);
        const lm = g.leaves ? new THREE.InstancedMesh(g.leaves, leafMat(g.cards ? treeTextureKind[kind] : g.naturalNeedles ? 'cedar' : kind === 'broad' ? 'broad' : kind === 'take' ? 'bamboo' : 'needle', 0xffffff, kind === 'take' ? 0.05 : 0.02, false, g.cards), mine.length) : null;
        if (lm && (g.cards || !this.def.thickTrees || g.naturalNeedles || g.naturalCrowns || g.leafBoughs)) {
          lm.customDepthMaterial = sharedDepth || sway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lm.material.map, alphaTest: 0.42, side: THREE.DoubleSide }), kind === 'take' ? 0.05 : 0.02, 2.5, { after: g.cards ? treeCardDepth : treeLeafMap });
          sharedDepth = lm.customDepthMaterial;
        }
        const cm = g.core ? new THREE.InstancedMesh(g.core, crownMat, mine.length) : null;
        if (cm) cm.userData.treeFoliage = true;
        mine.forEach(([x, y, z, sc, r], i) => {
          dummy.position.set(x, y - 0.25, z);
          dummy.rotation.set((r - 0.5) * 0.06, r * 6.28, (r - 0.5) * 0.06);
          // 松は一本ずつ枝ぶりの広がりを変える（横に張る老松・細く伸びた若松）
          const wide = kind === 'matsu' ? 0.8 + ((r * 7.31) % 1) * 0.55 : 1;
          dummy.scale.set(sc * wide, sc * (0.9 + r * 0.25) / Math.sqrt(wide), sc * wide * (0.85 + ((r * 3.7) % 1) * 0.3));
          dummy.updateMatrix();
          bm.setMatrixAt(i, dummy.matrix);
          for (const bounds of g.woodBounds) {
            const b = bounds.clone().applyMatrix4(dummy.matrix);
            this.missileWood.push({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
          }
          // 葉の枝張りだけを広狭に散らす。幹と矢玉の当たりは元の寸法を保つ。
          if (kind !== 'take') {
            const spread = this.def.unevenCrowns ? 0.72 + ((r * 7.31) % 1) * 0.7 : 0.82 + ((r * 7.31) % 1) * 0.36;
            dummy.scale.x *= spread; dummy.scale.z *= 1.42 - spread * .42;
            dummy.updateMatrix();
          }
          if (lm) lm.setMatrixAt(i, dummy.matrix);
          if (cm) cm.setMatrixAt(i, dummy.matrix);
          if (lm) lm.setColorAt(i, tintOf[kind]());
          else if (cm) cm.setColorAt(i, tintOf[kind]());
        });
        const meshes = lm ? [bm, lm] : [bm];
        if (cm) { if (lm) cm.instanceColor = lm.instanceColor; meshes.push(cm); }
        for (const m of meshes) {
          m.castShadow = true; m.receiveShadow = true; this.scene.add(m); this.treeMeshes.push(m);
          // 木の影の配列と囲みは設営中に用意し、最初の描画へまとめて持ち込まない。
          if (SETTINGS.quality === 'high') {
            m.updateWorldMatrix(true, false);
            m.castShadow = false;
          }
        }
        const foliage = cm || lm;
        if (foliage && g.farCore) {
          const farMaterial = g.cards ? leafMat(treeTextureKind[kind], 0xffffff, kind === 'take' ? 0.05 : 0.02, true, true)
            : lightCedar && g.naturalNeedles ? leafMat('cedar', 0xffffff, 0.02, true) : foliage.material;
          const far = new THREE.InstancedMesh(g.farCore, farMaterial, mine.length);
          // 遠景へ替わるコマで色の入れ物を作らず、設営時に用意する。
          if (foliage.instanceColor) far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 3), 3);
          far.count = 0; far.frustumCulled = false; far.receiveShadow = true;
          far.userData.treeFoliage = true; far.userData.noFreeze = true;
          foliage.userData.farFoliage = far;
          this.scene.add(far); this.treeMeshes.push(far);
        }
        this.viewCull(meshes, lowV ? 16 : 40);
      }
    }
    this.treePoints = [];
    for (const list of Object.values(trees)) {
      for (const [x, , z] of list) this.treePoints.push([x, z]);
      list.length = 0;
    }
    trees = null;
    lap('trees');

    // 草むら
    // 草むら：葉の絵を十字に組んだ板（遠目に草原らしく見える）
    const tufts = Math.round((this.def.tufts ?? 5000) * (lowV ? 1 : 1.5));
    // 絵：細く先の尖った葉。葉の間に地肌が見え、根元が黒い房にならないようにする。
    const GS = 256, gc = document.createElement('canvas'); gc.width = GS; gc.height = GS;
    const gg = gc.getContext('2d', { willReadFrequently: true });   // 読み出す（alphaTex）ので読み出しの速いキャンバスに
    const GR = rng(77);
    for (let i = 0; i < 16; i++) {
      // 株は根元が細く、葉先ほど外へ開く扇の形（板の四角い輪郭が見えないように）。真ん中の葉ほど高い
      const x = GS * (0.5 + (GR() + GR() + GR() - 1.5) * 0.13), off = (i / 15 - 0.5);
      // 外側は幅のある短い下葉、中央は背の高い葉。同じ板で株の裾と芯を作る。
      const basal = Math.abs(off) > 0.3;
      const h = GS * (0.38 + Math.pow(GR(), 0.7) * 0.54) * (basal ? 0.58 : 1 - Math.abs(off) * 0.7);
      let lean = off * GS * 1.3 + (GR() - 0.5) * GS * 0.22;
      lean = Math.max(GS * 0.04 - x, Math.min(GS * 0.96 - x, lean));
      // 縮小しても面が残る葉幅。針金状の輪郭ではなく、折り目のある葉として見せる。
      const wdt = GS * (0.014 + GR() * 0.01) * (basal ? 1.25 : 1);
      const v = 205 + GR() * 35, dry = GR() < 0.16;
      // 葉ごとに少し色をずらす（黄みの葉・青みの葉・枯れ葉）。全体の色は置く所で掛ける
      const cr = dry ? 1.08 : 0.96 + GR() * 0.08, cb = dry ? 0.78 : 0.9 + GR() * 0.08;
      // 緑と枯れ色は株の色で付ける。絵まで暗い緑にすると、掛け合わせで炭のように黒くなる。
      // 絵には明るい葉の濃淡だけを残し、根元の陰は弱くする。
      const rgb = (r, g, bl) => `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, bl) | 0})`;
      const lg = gg.createLinearGradient(0, GS, 0, GS - h);
      lg.addColorStop(0, rgb(v * 0.74 * cr, v * 0.76, v * 0.74 * cb)); lg.addColorStop(0.45, rgb(v * 0.92 * cr, v * 0.94, v * 0.92 * cb)); lg.addColorStop(1, rgb(v * cr, v, v * 0.94 * cb));
      gg.fillStyle = lg;
      // 根元から葉先まで連続した弧。折り返す細い輪郭を描かず、葉の面を保つ。
      const bend = GR() < (basal ? 1 : 0.6);
      const tx = x + lean, ty = GS - h;
      const ex = bend ? Math.max(GS * 0.03, Math.min(GS * 0.97, tx + lean * 0.22)) : tx;
      const ey = ty + (bend ? h * (basal ? 0.48 : 0.22) : 0);
      const mx = x + lean * 0.12, my = GS - h * 0.55;
      // 両側と中筋で同じ曲線を使う。中筋も必ず葉の内側に収める。
      const edge = (offset) => gg.bezierCurveTo(mx + offset * 0.85, my, tx + offset * 0.4, ty, ex, ey);
      gg.beginPath(); gg.moveTo(x - wdt, GS); edge(-wdt);
      gg.bezierCurveTo(tx + wdt * 0.4, ty, mx + wdt * 0.85, my, x + wdt, GS);
      gg.closePath(); gg.fill();
      // 葉の片面を暗く塗り、縦の折り目を作る。追加の形・絵・描画は使わない。
      gg.fillStyle = 'rgba(38,48,27,0.22)';
      gg.beginPath(); gg.moveTo(x, GS); edge(0);
      gg.bezierCurveTo(tx + wdt * 0.4, ty, mx + wdt * 0.85, my, x + wdt, GS);
      gg.closePath(); gg.fill();

    }
    // 普通の草に粒状の穂を繰り返さない。背の高い穂は既存の薄の群落に任せる。
    const gtex = alphaTex(gc);
    // 株：四枚の板を少しずつ外へ傾けて組む。光は上から受ける向き（法線を上へ寄せる）にして、板ごとの明暗の差を消す
    const blades = [];
    const bladeCount = lowV ? 2 : 4;
    for (let k = 0; k < bladeCount; k++) {
      const pg = new THREE.PlaneGeometry(0.9, 0.75);
      // 同じ頂点数のまま根元を寄せ、上ほど外へ倒す。板の交差する塊を崩す。
      const gp = pg.attributes.position;
      for (let q = 0; q < gp.count; q++) {
        const top = gp.getY(q) > 0;
        const lean = k % 2 ? 1 : -1;
        // 頂点数を保ったまま葉先の幅・左右の高さ・倒れ方をずらし、四角い上辺を崩す。
        const side = gp.getX(q) > 0 ? 1 : -1;
        gp.setXYZ(q, gp.getX(q) * (top ? 0.62 + k * 0.09 : 0.42) + (top ? lean * (0.08 + k * 0.025) : 0),
          gp.getY(q) * (0.76 + k * 0.08) + (top ? side * lean * (0.045 + k * 0.012) : 0), top ? 0.16 + k * 0.025 : 0);
      }
      if (this.def.templeNeedles) {
        // 同じ房の中でも葉先の高さと開き方を変える。設営時だけ作る。
        const p = pg.attributes.position;
        for (let q = 0; q < p.count; q++) {
          const top = p.getY(q) > 0;
          p.setXYZ(q, p.getX(q) * (.65 + k * .16) + (top ? (k - 1.5) * .08 : 0),
            p.getY(q) * (.6 + k * .17), top ? (k % 2 ? .12 : -.08) : 0);
        }
      }
      pg.translate(0, 0.375 * (0.76 + k * 0.08), 0);
      pg.rotateX((k % 2 ? 1 : -1) * 0.12);
      pg.rotateY((k / bladeCount) * Math.PI + (k % 2) * 0.2);
      const nn = pg.attributes.normal, pp = pg.attributes.position;
      for (let q = 0; q < nn.count; q++) {
        const ox = pp.getX(q), oz = pp.getZ(q), l = Math.hypot(ox, oz) || 1;
        const up = 0.35 + pp.getY(q) * 0.6;
        const v = new THREE.Vector3(ox / l * 0.45, 1.0 + up, oz / l * 0.45).normalize();
        nn.setXYZ(q, v.x, v.y, v.z);
      }
      blades.push(pg);
    }
    const tuftGeo = mergeVegetationParts(blades);
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, sway(liteMat({ color: this.def.tuftTint ?? 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.12, 0, { wear: true, after: grassLit }), tufts);
    const tc = new THREE.Color();
    let n = 0;
    // 草は群れて生える：半分ほどは直前の株のそばに置き、濃い草むらと地肌の見える所ができるようにする
    let lastX = 0, lastZ = 0;
    for (let tries = 0; n < tufts && tries < tufts * (lowV ? 6 : 8); tries++) {
      const near = n > 0 && R() < 0.55, ca = R() * 6.28, cd = 0.35 + R() * 1.1;
      // 群落の起点を道肩・沢の帯へ寄せる。本数と束は保ち、戦う道は下の判定で空ける。
      const bands = this.def.undergrowthBands;
      const band = !near && bands?.length && tries % 3 !== 2 ? bands[tries % bands.length] : null;
      const x = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastX + Math.cos(ca) * cd)) : band ? band.x + (R() * 2 - 1) * band.w : (R() * 2 - 1) * (this.half - 2);
      const z = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastZ + Math.sin(ca) * cd)) : band ? band.z + (R() * 2 - 1) * band.d : (R() * 2 - 1) * (this.half - 2);
      // 踏み固めた土・陣の中には草むらを生やさない（草の割合に合わせて間引く）
      if (R() > this.grassAt(x, z) * 1.15 - 0.05) continue;
      // 草むらは大きな群れにまとまる：ゆるい波の濃い所に多く、薄い所はまばら（上から見て水玉に並ばないように）
      const clump = tuftClumpAt(x, z);
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
      const s = (0.45 + Math.pow(R(), 1.5) * 1.0) * (0.7 + clump * 0.6);
      dummy.scale.set(s * (0.8 + R() * 0.4), s * (0.7 + R() * 0.9), s * (0.8 + R() * 0.4));
      dummy.rotation.set((R() - 0.5) * 0.45, R() * 6.28, (R() - 0.5) * 0.45);
      if (this.def.roundNeedles) {
        const patch = .5 + .5 * Math.sin(x * 1.7 + z * .93);
        dummy.scale.y *= .65 + patch * .65; dummy.scale.x *= .75 + (1 - patch) * .6;
      }
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
      if (this.def.roundNeedles) tc.lerp(TUFT_AUTUMN, .15 + .3 * (.5 + .5 * Math.sin(x * .71 - z * 1.3)));
      if (this.def.autumn) tc.lerp(TUFT_AUTUMN, 0.3);
      else if (this.def.young) tc.setRGB(tc.r * 0.92, tc.g * 1.12, tc.b * 0.95);
      if (this.def.tuftColor) this.def.tuftColor(x, z, tc);
      tuftMesh.setColorAt(n, tc);
      lastX = x; lastZ = z;
      n++;
    }
    tuftMesh.count = n;
    lap('tufts');
    tuftMesh.receiveShadow = true;
    this.viewCull([tuftMesh], 0, 52);   // 48mで透け切った草は送らず、遠くの野は地面に任せる
    this.scene.add(tuftMesh);
    // 薄（ススキ）の株と野の花：まとまって生える
    const patch = (kind, count, size, clumps) => {
      const susuki = kind === 'susuki', pg = [];
      for (let k = 0; k < 2; k++) {
        const g = new THREE.PlaneGeometry(size, size);
        if (susuki) {
          // 四三角形のまま根元を寄せ、葉先を開く。株の裏も上からの光を受ける。
          const p = g.attributes.position, normal = g.attributes.normal;
          for (let q = 0; q < p.count; q++) {
            const top = p.getY(q) > 0;
            p.setXYZ(q, p.getX(q) * (top ? 1 : 0.48), p.getY(q), top ? size * (k ? -0.1 : 0.12) : 0);
            normal.setXYZ(q, 0, 0.94, 0.34);
          }
        }
        g.translate(0, size / 2, 0); g.rotateY(k * Math.PI / 2); pg.push(g);
      }
      const mesh = new THREE.InstancedMesh(mergeVegetationParts(pg), sway(liteMat({ color: susuki ? (this.def.susukiTint ?? 0xffffff) : 0xffffff, map: leafTex(kind), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4 }), susuki ? 0.09 : 0.05, 0, { wear: true, after: susuki ? grassLit : grassAlpha }), count);
      let m = 0;
      for (let cI = 0; cI < clumps && m < count; cI++) {
        const cx = (R() * 2 - 1) * (this.half - 6), cz = (R() * 2 - 1) * (this.half - 6);
        if (!ok(cx, cz, kind === 'higanbana' ? 2.5 : 4)) continue;
        const per = Math.ceil(count / clumps);
        for (let q = 0; q < per && m < count; q++) {
          const x = cx + (R() - 0.5) * 7, z = cz + (R() - 0.5) * 7;
          if (!ok(x, z, kind === 'higanbana' ? 1.2 : 2) || this.grassAt(x, z) < 0.4) continue;
          dummy.position.set(x, this.heightAt(x, z) - 0.05, z);
          const sc = 0.7 + R() * 0.6; dummy.scale.set(sc, sc * (0.8 + R() * 0.5), sc); dummy.rotation.set(0, R() * 6, 0);
          dummy.updateMatrix(); mesh.setMatrixAt(m++, dummy.matrix);
        }
      }
      mesh.count = m;
      if (m > 0) this.viewCull([mesh], 0, 52);
      this.scene.add(mesh);
    };
    // 石：斜面ほど多く、半分ほど土に埋まる
    {
      // 割れのある形を共用し、暗い絵と頂点色を重ねず灰色の立体として見せる。
      const rg = rockShape(1, !!this.def.groundedSlopeRocks, lowV && this.def.lowMaterialBatch ? 1 : 2);
      const N = Math.round((this.def.rocks ?? 260) * (1));   // 低は地面の石を六割に（草木と同じ扱い）
      const rocks = new THREE.InstancedMesh(rg, liteMat({ color: 0xffffff, vertexColors: true, side: this.def.groundedSlopeRocks ? THREE.DoubleSide : THREE.FrontSide, bumpMap: stoneTex(), bumpScale: this.def.groundedSlopeRocks ? 0.06 : 0.18, roughness: 1, envMapIntensity: 0.15 }), N);
      let m = 0;
      for (let tries = 0; tries < N * 8 && m < N; tries++) {
        // 岩の総数と束は保ち、指定した斜面へ四つに一つを露岩の帯として寄せる。
        // 描く岩だけを移す。歩ける地形・当たり・兵の進路は変えない。
        const bands = this.def.rockBands;
        const band = bands?.length && tries % 4 === 0 ? bands[Math.floor(tries / 4) % bands.length] : null;
        const x = band ? band.x + (R() * 2 - 1) * band.w : (R() * 2 - 1) * (this.half - 3);
        const z = band ? band.z + (R() * 2 - 1) * band.d : (R() * 2 - 1) * (this.half - 3);
        if (!ok(x, z, 3, !!band)) continue;
        const sl = Math.abs(this.heightAt(x + 2, z) - this.heightAt(x - 2, z)) + Math.abs(this.heightAt(x, z + 2) - this.heightAt(x, z - 2));
        if (band && sl < 1.6) continue; // 平らな持ち場へ大岩を置かず、山腹の露出だけに使う。
        if (R() > 0.25 + sl * 0.5) continue;
        const sc = band ? 1.2 + R() * 1.8 : 0.18 + Math.pow(R(), 2.5) * 1.3;
        dummy.position.set(x, this.heightAt(x, z), z);
        dummy.rotation.set(R() * 0.5, R() * 6, R() * 0.5);
        // 形の種類：丸い石・平たい岩・縦に割れた岩
        const kind = R();
        if (kind < 0.3) dummy.scale.set(sc * (1.3 + R() * 0.6), sc * 0.75, sc * (1.1 + R() * 0.5));
        else if (kind < 0.45) dummy.scale.set(sc * 0.7, sc * (1.3 + R() * 0.5), sc * (0.8 + R() * 0.3));
        else dummy.scale.set(sc * (0.8 + R() * 0.6), sc, sc * (0.8 + R() * 0.6));
        dummy.position.y -= dummy.scale.y * 0.08;
        dummy.updateMatrix();
        // 同じ岩の形でも、割れの傾きと片側への張り出しを変える。束は増やさず卵形の反復を崩す。
        const e = dummy.matrix.elements, lean = (kind - 0.5) * 0.35;
        e[4] += e[0] * lean; e[5] += e[1] * lean; e[6] += e[2] * lean;
        rocks.setMatrixAt(m++, dummy.matrix);
      }
      rocks.count = m; rocks.castShadow = true; rocks.receiveShadow = true;
      // 設営で地面を細分する戦だけ、その後に岩と根草を接地する。
      if (this.def.deferRockGround) this.deferredGroundRocks = rocks;
      else groundRocks(this, rocks);
      lap('rocks');
      // 接地後に登録する戦では、古い位置を省略用の控えへ写さない。
      if (!this.def.deferRockCull) this.viewCull([rocks], lowV ? 0 : 40);   // 近くの岩は画面外から落ちる影も保つ
      this.scene.add(rocks);
    }
    // 低木：林の縁に葉の塊
    {
      const bushG = [];
      const TB = rng(123);
      // 大きな板を小さな葉群へ分け、中央を曲げて平たい三角の塊を崩す。
      for (let k = 0; k < 14; k++) {
        const g = new THREE.PlaneGeometry(0.65 + TB() * 0.3, 0.55 + TB() * 0.3, 2, 2);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5 + p.getY(i) * 4 + k) * 0.09);
        g.computeVertexNormals();
        g.rotateX((TB() - 0.5) * 1.4); g.rotateY(TB() * 6.28);
        g.translate((TB() - 0.5) * 1.2, 0.35 + TB() * 0.65, (TB() - 0.5) * 1.2);
        bushG.push(g);
      }
      const pts = this.treePoints || [];
      const N = Math.min(lowV ? 200 : 420, pts.length);
      const bush = new THREE.InstancedMesh(mergeVegetationParts(bushG), sway(liteMat({ map: leafTex(this.def.lowBamboo ? 'bamboo' : 'broad'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.1 }), 0.04, 0.3, { after: keepAlpha }), N);
      // 根元の草も既存の形・材質を使い回し、一つの束にまとめる。
      const rootGrass = new THREE.InstancedMesh(tuftGeo, tuftMesh.material, N);
      const col = new THREE.Color();
      let m = 0;
      for (let k = 0; k < N; k++) {
        const [tx, tz] = pts[Math.floor(R() * pts.length)];
        const a = R() * 6.28, d = 2 + R() * 4;
        const bands = this.def.undergrowthBands;
        const band = bands?.length && k % 3 !== 2 ? bands[k % bands.length] : null;
        const x = band ? band.x + (R() * 2 - 1) * band.w : tx + Math.cos(a) * d;
        const z = band ? band.z + (R() * 2 - 1) * band.d : tz + Math.sin(a) * d;
        if (!ok(x, z, 3) || this.grassAt(x, z) < 0.3) continue;
        dummy.position.set(x, this.heightAt(x, z) - 0.18, z); dummy.rotation.set(0, R() * 6, 0);
        const sc = 0.7 + R() * 0.8; dummy.scale.set(sc, sc * (this.def.lowBamboo ? 0.45 : 0.7 + R() * 0.5), sc);
        dummy.updateMatrix(); bush.setMatrixAt(m, dummy.matrix);
        bush.setColorAt(m, this.def.autumn ? col.setRGB(0.43 + R() * 0.1, 0.38 + R() * 0.1, 0.22) : col.setRGB(0.3 + R() * 0.08, 0.4 + R() * 0.08, 0.24));
        dummy.position.set(x, this.heightAt(x, z) - 0.04, z);
        dummy.scale.set(sc * 1.4, sc * 0.6, sc * 1.4); dummy.updateMatrix();
        rootGrass.setMatrixAt(m, dummy.matrix);
        rootGrass.setColorAt(m, this.def.autumn ? col.setRGB(0.4, 0.35, 0.22) : col.setRGB(0.28, 0.36, 0.2));
        m++;
      }
      rootGrass.count = m; rootGrass.receiveShadow = true;
      this.viewCull([rootGrass], 0, 52);
      this.scene.add(rootGrass);
      bush.count = m; bush.castShadow = true;
      lap('bush');
      this.viewCull([bush], lowV ? 0 : 40);
      this.scene.add(bush);
    }
    if (autumn || this.def.winterGrass) patch('susuki', Math.round(tufts * (lowV ? 0.055 : 0.08)), this.def.susukiSize ?? 1.65, lowV ? 35 : 60);
    // 足もとの草：自分の周り 24m に細かな草を敷きつめ、歩けばついて来る（遠くは今の草むらに任せる）
    {
      const N = lowV ? 1800 : 4200, G = lowV ? 18 : 24;
      const bg = [];
      // 同じ三枚・六三角形で、立つ葉と横へ伏せる下葉を組む。
      // 背のそろった点の列を避け、根元に低い葉の広がりを残す。
      const widths = [0.28, 0.58, 0.70], heights = [0.52, 0.32, 0.22];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(widths[k], heights[k]);
        const p = g.attributes.position;
        for (let q = 0; q < p.count; q++) {
          const top = p.getY(q) > 0;
          p.setXYZ(q, p.getX(q) * (top ? 1 : 0.42) + (top ? (k - 1) * 0.06 : 0),
            p.getY(q) + heights[k] * 0.5, top ? 0.05 + k * 0.07 : 0);
        }
        g.rotateY(k * Math.PI / 3 + 0.3);
        // 光は上から受ける向きに（板ごとの明暗を消す）
        const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) { const v = new THREE.Vector3(nn.getX(q) * 0.35, 1, nn.getZ(q) * 0.35).normalize(); nn.setXYZ(q, v.x, v.y, v.z); }
        bg.push(g);
      }
      this.nearGrass = new THREE.InstancedMesh(mergeVegetationParts(bg), sway(liteMat({ color: this.def.nearGrassTint ?? 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.1, 0, { wear: true, after: grassLit }), N);
      this.nearGrass.frustumCulled = false;
      this.nearGrass.receiveShadow = true;
      this.nearN = N; this.nearG = G;
      this.nearOff = [];
      const RN = rng(2024);
      const col = new THREE.Color();
      let patchX = 0, patchZ = 0, patchSize = 1, patchDry = false;
      for (let i = 0; i < N; i++) {
        // 開けた川原は株を固めず、元の分布で足元までつなぐ。
        // 株数と新しい下葉の形、道端の低い草、踏み跡への反応は保つ。
        if (this.def.scatterNearGrass) {
          this.nearOff.push([RN() * G * 2, RN() * G * 2, 0.5 + Math.pow(RN(), 1.4) * 1.05, RN() * 6.28]);
          col.setRGB(0.24 + RN() * 0.1, 0.33 + RN() * 0.1, 0.12 + RN() * 0.05);
          if (RN() < 0.12) col.setRGB(0.5 + RN() * 0.1, 0.46 + RN() * 0.08, 0.28);
          if (this.def.autumn) col.lerp(TUFT_AUTUMN, 0.3);
          else if (this.def.young) col.setRGB(col.r * 0.92, col.g * 1.12, col.b * 0.95);
          this.nearGrass.setColorAt(i, col);
          continue;
        }
        // 五株で一つの群落。中心は高く、周りは低く広がる。同じ株数のまま裸地を挟む。
        if (i % 5 === 0) {
          patchX = RN() * G * 2; patchZ = RN() * G * 2;
          patchSize = 0.75 + RN() * 0.55; patchDry = RN() < 0.12;
        }
        const angle = RN() * Math.PI * 2, radius = i % 5 === 0 ? 0 : 0.3 + RN() * 0.65;
        const sc = patchSize * (i % 5 === 0 ? 1.35 : 0.55 + RN() * 0.45);
        this.nearOff.push([patchX + Math.cos(angle) * radius, patchZ + Math.sin(angle) * radius, sc, RN() * 6.28]);
        col.setRGB(0.24 + RN() * 0.1, 0.33 + RN() * 0.1, 0.12 + RN() * 0.05);
        if (patchDry) col.setRGB(0.5 + RN() * 0.1, 0.46 + RN() * 0.08, 0.28);
        if (this.def.autumn) col.lerp(TUFT_AUTUMN, 0.3);
        else if (this.def.young) col.setRGB(col.r * 0.92, col.g * 1.12, col.b * 0.95);
        this.nearGrass.setColorAt(i, col);
      }
      this.nearCell = null;
      this.nearM = new Float32Array(N * 16); this.nearShow = new Uint8Array(N);
      this.nearC = this.nearGrass.instanceColor ? this.nearGrass.instanceColor.array.slice() : null;
      this.nearGrass.count = 0;
      this.scene.add(this.nearGrass);
      lap('susuki+near');
    }
    // 田植えを終えたばかりの苗：田の中に列をなして並ぶ
    if (this.def.paddy && this.field.height > 0) {
      // 苗は草むらの密な絵を使わず、根元から分かれる細い葉だけを描く。田の季節の色は材質で掛ける。
      const rc = document.createElement('canvas'); rc.width = rc.height = GS;
      const rg = rc.getContext('2d', { willReadFrequently: true }), RR = rng(177);
      for (let i = 0; i < 10; i++) {
        const root = GS * (0.46 + RR() * 0.08), tip = GS * (0.08 + i * 0.084);
        const h = GS * (0.48 + RR() * 0.48), w = GS * (0.004 + RR() * 0.003);
        const mx = root + (tip - root) * 0.2;
        const lg = rg.createLinearGradient(0, GS, 0, GS - h);
        lg.addColorStop(0, '#b8b8b8'); lg.addColorStop(0.45, '#dedede'); lg.addColorStop(1, '#eeeeee');
        rg.fillStyle = lg; rg.beginPath(); rg.moveTo(root - w, GS);
        rg.quadraticCurveTo(mx - w, GS - h * 0.55, tip, GS - h);
        rg.quadraticCurveTo(mx + w, GS - h * 0.55, root + w, GS);
        rg.closePath(); rg.fill();
      }
      const riceTex = alphaTex(rc);
      const rows = [];
      const pz = lowV ? 1.35 : 0.9, px = lowV ? 1.2 : 0.8, psc = lowV ? 1.25 : 1;
      for (let z = -this.half + 2; z < this.half - 2; z += pz) for (let x = -this.half + 2; x < this.half - 2; x += px) if (this.def.paddy(x, z) > 0.6) rows.push([x, z]);
      const sg = []; for (let k = 0; k < 2; k++) { const g = new THREE.PlaneGeometry(0.28, this.field.height); g.translate(0, this.field.height / 2, 0); g.rotateY(k * Math.PI / 2); sg.push(g); }
      // 両面の板の裏から見ると、曇りや雨の暗い光で苗が黒い点の群れに見えた（10/5 桶狭間）。草の株と同じく法線を上へ向ける
      for (const g of sg) { const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) nn.setXYZ(q, 0, 1, 0); }
      const rice = new THREE.InstancedMesh(mergeVegetationParts(sg), sway(liteMat({ color: this.field.color, map: riceTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), 0.06, 0, { after: riceLit }), rows.length);
      rows.forEach(([x, z], i) => { dummy.position.set(x + (R() - 0.5) * 0.1, this.heightAt(x, z) - 0.02, z + (R() - 0.5) * 0.1); dummy.rotation.set(0, R() * 3, 0); const sc = (0.8 + R() * 0.4) * psc; dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); rice.setMatrixAt(i, dummy.matrix); });
      rows.length = 0;
      this.scene.add(rice);
      this.viewCull([rice], 0);   // 苗も、見えている株だけを同じ束へ残す。
    }
    lap('paddy');
    if (!this.def.snow && !this.def.winter) patch(autumn ? 'higanbana' : 'flower', Math.round(tufts * (lowV ? 0.025 : 0.05)), autumn ? 0.85 : 0.7, lowV ? 28 : 50);
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
    for (let i = 0; i < 65; i++) {
      const x = Math.random() * 64, y = Math.random() * 256;
      g.strokeStyle = `rgba(160,182,185,${0.025 + Math.random() * 0.035})`; g.lineWidth = 0.5 + Math.random();
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y + 4, x - 1, y + 7 + Math.random() * 8); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w.x2 ? (w.x2 - w.x) / 16 : 40, 12);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex = tex;
    // 川面：空を映す（粗さを低く）。流れの筋が動く
    const mat = liteMat({ map: tex, color: 0x7e8c88, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false, envMapIntensity: 0.8 });
    // 川面のさざ波（流れは z の向き）
    rippleWater(mat, 0.0, 1.0, 3.5, this.hemi.color, false, new THREE.Vector2(w.x, w.x2 ?? w.x + wide));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(w.x2 ? (w.x + w.x2) / 2 : w.x + wide / 2, w.level, 0);
    this.scene.add(m);
    m.receiveShadow = true;
    // 岸の泥は水の材質へまとめた。透明な板の追加描画と白い直線の縁をなくす。
  }

  // 足もとの草を、自分を中心に敷き直す（格子ごとに一つの位置を持ち、端を越えたら反対側へ回す）
  updateNearGrass(focus, fresh = false) {
    if (!this.nearGrass) return;
    const cx = Math.round(focus.x / 1.5), cz = Math.round(focus.z / 1.5);
    // 最初と視点交換は全株を用意する。歩行中の4200株の走査は四コマへ配り、
    // 足もとの株を残したまま外周だけ巻き戻す。動き続けても続きから進める。
    if (!this.nearCell) { this.nearCell = [cx, cz]; fresh = true; }
    if (fresh || this.nearCell[0] !== cx || this.nearCell[1] !== cz) {
      this.nearCell[0] = cx; this.nearCell[1] = cz; this.nearLeft = this.nearN;
    }
    if (!this.nearLeft) return;
    const work = fresh ? this.nearN : Math.min(this.nearLeft, Math.ceil(this.nearN / 4));
    const start = this.nearCursor || 0;
    this.nearCursor = (start + work) % this.nearN;
    this.nearLeft -= work;
    const G = this.nearG, d = this.nearDummy || (this.nearDummy = new THREE.Object3D());
    const paths = this.def.paths;
    const NP = this.nearPos || (this.nearPos = new Float32Array(this.nearN * 2).fill(1e9));
    const span = G * 2, x0 = focus.x - G, z0 = focus.z - G;
    let changed = false;
    for (let q = 0; q < work; q++) {
      const i = (start + q) % this.nearN;
      const [ox, oz, sc, rot] = this.nearOff[i];
      // 自分の周りの正方形に、ずれないよう巻き戻して置く
      const x = x0 + (((ox - x0) % span + span) % span), z = z0 + (((oz - z0) % span + span) % span);
      // 置き場の変わらない株は置き直さない（端を越えて反対側へ回った株だけ）
      if (Math.abs(NP[i * 2] - x) < 0.01 && Math.abs(NP[i * 2 + 1] - z) < 0.01) continue;
      NP[i * 2] = x; NP[i * 2 + 1] = z;
      const gw = this.grassAt(x, z);
      const clump = tuftClumpAt(x, z);
      // 足もとの小片を均等に散らさず、遠い株と同じ群落の芯を濃く、縁を低くする。
      let show = gw > 0.35 && ((i * 7919) % 100) / 100 < gw * (0.12 + clump * 0.95);
      let verge = 1;
      if (show && paths) for (const p of paths) {
        const clearance = distToPolyline(x, z, p) - (p.w ?? this.def.pathWidth ?? 2) * 0.5;
        verge = Math.min(verge, Math.max(0, Math.min(1, (clearance - 0.15) / 1.25)));
        if (verge === 0) { show = false; break; }
      }
      // 道幅に沿って下葉から低くなり、裸地へ溶け込む。道の中央には生やさない。
      if (show && ((i * 3571) % 100) / 100 > 0.25 + verge * 0.75) show = false;
      if (show && this.def.water && x > this.def.water.x - 2 && x < (this.def.water.x2 ?? 1e9) + 2) show = false;
      d.position.set(x, show ? this.heightAt(x, z) - 0.04 : -999, z);
      d.rotation.set(((i * 7) % 11 - 5) * 0.025, rot, ((i * 3) % 7 - 3) * 0.03);
      const size = sc * (0.65 + clump * 0.7);
      d.scale.set(size * (0.75 + (i % 7) * 0.07), size * (0.65 + (i % 5) * 0.16) * (0.35 + verge * 0.65), size * (0.85 + (i % 3) * 0.1));
      d.updateMatrix();
      d.matrix.toArray(this.nearM, i * 16); this.nearShow[i] = show ? 1 : 0; changed = true;
    }
    if (changed) this.nearDirty = true;
  }
  // 足もとの草は、出ている株と画面の向きに入る株だけを前へ詰めて描く（隠した株・背中側の株も数えていた）。
  //   置き直した時と、カメラの向きが変わった時だけ詰め直す（株の場所・色・数は変えない）
  packNearGrass(cam) {
    const g = this.nearGrass;
    if (!g || !this.nearM || !cam) return;
    const e = cam.matrixWorld.elements, px = e[12], pz = e[14];
    let fx = -e[8], fz = -e[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const P = this.nearPack || (this.nearPack = { x: 1e9, z: 0, fx: 0, fz: 0 });
    if (!this.nearDirty && Math.hypot(px - P.x, pz - P.z) < 1 && fx * P.fx + fz * P.fz > 0.985) return;
    this.nearDirty = false; P.x = px; P.z = pz; P.fx = fx; P.fz = fz;
    // 横の画角の半分＋余裕（20 度ほど）より外の株は詰めない。カメラのすぐ回り（3m）は向きによらず残す
    const half = Math.atan(Math.tan((cam.fov || 60) * Math.PI / 360) * (cam.aspect || 2)) + 0.35, cosH = Math.cos(Math.min(Math.PI, half));
    const M = this.nearM, S = this.nearShow, C = this.nearC, dm = g.instanceMatrix.array, dc = g.instanceColor ? g.instanceColor.array : null;
    let k = 0;
    for (let i = 0; i < this.nearN; i++) {
      if (!S[i]) continue;
      const dx = M[i * 16 + 12] - px, dz = M[i * 16 + 14] - pz, d = Math.hypot(dx, dz);
      if (d > 3 && (dx * fx + dz * fz) / d < cosH) continue;
      // 株ごとに一時の配列を作らず、行列の16個の値を写す。
      for (let j = 0; j < 16; j++) dm[k * 16 + j] = M[i * 16 + j];
      if (dc) { dc[k * 3] = C[i * 3]; dc[k * 3 + 1] = C[i * 3 + 1]; dc[k * 3 + 2] = C[i * 3 + 2]; }
      k++;
    }
    g.count = k; g.instanceMatrix.needsUpdate = true; if (dc) g.instanceColor.needsUpdate = true;
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
    this.geese = { t: 20 + R() * 40, on: false, dir: new THREE.Vector2(), o: new THREE.Vector2() };
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
      G.on = true; G.s = 0; G.dir.set(Math.cos(a), Math.sin(a));
      const side = 150 + Math.random() * 70;
      G.o.set(focus.x - G.dir.y * side - G.dir.x * 280, focus.z + G.dir.x * side - G.dir.y * 280); G.h = 60 + Math.random() * 25;
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
    const posA = [], flowA = [], colorA = [], bedA = [], idx = [], surface = [], surfaceStarts = [], surfaceSteps = [];
    const cross = st.sedimentWater ? [-1, -0.92, 0, 0.92, 1] : [1, -1];
    const columns = cross.length;
    const shallowColor = new THREE.Color(0x68796b), deepColor = new THREE.Color(0x283d3b);
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
        let y = this.streamLevelAt(st, x, z, nx, nz);
        // 頂点の間の低い岸でも水が土の上へ載らないよう、隣の半歩も調べる。
        for (const sd of [-1, 1]) {
          const tt = Math.max(0, Math.min(1, t + sd / (steps * 2)));
          y = Math.min(y, this.streamLevelAt(st, ax + (bx - ax) * tt, az + (bz - az) * tt, nx, nz));
        }
        surface.push(x, z, y);
        for (const off of cross) {
          const px = x + nx * st.w * off, pz = z + nz * st.w * off;
          posA.push(px, y, pz);
          const depth = Math.max(0, y - this.heightAt(px, pz));
          const c = (st.sedimentWater ? depth : y - this.heightAt(x, z)) <= 0.5 ? shallowColor : deepColor;
          colorA.push(c.r, c.g, c.b);
          bedA.push(depth, off * st.w);
          // 川の点の順に流す。風向きとは結び付けない。
          flowA.push((bx - ax) / L, (bz - az) / L);
        }
        if (n > 0) for (let j = 0; j < columns - 1; j++) {
          const a = (n - 1) * columns + j, b = a + columns;
          if (st.sedimentWater) idx.push(a, a + 1, b, a + 1, b + 1, b);
          else idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
        n++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute('waterFlow', new THREE.Float32BufferAttribute(flowA, 2));
    if (st.sedimentWater) g.setAttribute('waterBed', new THREE.Float32BufferAttribute(bedA, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colorA, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 小川：濁った流れ。空は映すが、白い帯に見えないよう照り返しを抑える
    // 各頂点の川筋に沿って波が動く（端どうしを結ぶ向きは予備）。
    const f0 = pts[0], f1 = pts[pts.length - 1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) || 1;
    const m = new THREE.Mesh(g, rippleWater(liteMat({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.6 }), (f1[0] - f0[0]) / fl, (f1[1] - f0[1]) / fl, 2.2, this.hemi.color, true, null, st.fireReflection ? this.waterFireReflections : null, st.sedimentWater ? st.w : false));
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
    // 川石は厚みのある丸石。白い平面の輪を石ごとに並べない。
    const R = rng((this.def.seed || 1) * 17 + pts.length), stones = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let k = 0; k < L / 7; k++) {
        const t = R(), side = R(), off = st.sedimentWater ? (side < 0.5 ? -1 : 1) * st.w * (0.88 + Math.abs(side - 0.5) * 0.4) : (side - 0.5) * st.w * 1.3;
        const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
        if (Math.abs(x) > this.half - 2 || Math.abs(z) > this.half - 2) continue;
        if (st.sedimentWater && stones.length >= 24) continue;
        const r = 0.25 + R() * 0.5, bed = this.heightAt(x, z);
        const depth = this.waterDepthAt(x, z);
        if (depth > r * 0.6) continue;
        const y = bed + r * 0.45;
        const sg = new THREE.SphereGeometry(r, 8, 5), sp = sg.attributes.position;
        const phase = R() * 6;
        for (let q = 0; q < sp.count; q++) {
          const px = sp.getX(q), py = sp.getY(q), pz = sp.getZ(q);
          const bulge = 1 + Math.sin(px * 4 + pz * 3 + phase) * 0.12;
          sp.setXYZ(q, px * bulge, py * bulge, pz * bulge);
        }
        sg.computeVertexNormals(); sg.scale(1.2, 0.82, 1); sg.rotateY(R() * 6); sg.translate(x, y - r * 0.15, z);
        stones.push(sg.toNonIndexed()); sg.dispose();
      }
    }
    if (stones.length) {
      const sm = new THREE.Mesh(mergeGeometries(stones), liteMat({ color: 0x6e6a62, roughness: 0.6 }));
      sm.castShadow = sm.receiveShadow = true; this.scene.add(sm);
      st.rockMesh = sm; // 戦ごとの岸の補修で、川石だけを扱えるようにする。
      for (const stone of stones) stone.dispose();
    }
  }

  buildRain() {
    // 雪も雨の線と配列を使う。携帯では雪を三百二十粒までに抑える
    const N = this.def.snow ? (640) : (1600);
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
    M.visible = r > 0.15 && !!cam && true;
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

  // 地面に沿う光だまりは一枚の束で描く。百の火でも描く回数は一回だけ。
  updateFireGlowBatch(x, z) {
    const cap = Math.max(32, 2 ** Math.ceil(Math.log2(Math.max(1, this.fires.length))));
    let mesh = this.fireGlowBatch;
    if (!mesh || mesh.userData.capacity < cap) {
      if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 81 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 81 * 2), 2).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 81 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const index = new Uint32Array(cap * 384);
      const src = this.glowGeo.index.array;
      for (let i = 0; i < cap; i++) for (let j = 0; j < 384; j++) index[i * 384 + j] = i * 81 + src[j];
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.fireGlowTex, color: 0xff8d45, vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      mesh.userData.capacity = cap; mesh.frustumCulled = false; mesh.renderOrder = 1;
      this.scene.add(mesh); this.fireGlowBatch = mesh;
    }
    const dst = mesh.geometry.attributes;
    let n = 0;
    for (const f of this.fires) {
      if (!f.lit || f.light || !f.glow?.visible || Math.hypot(f.x - x, f.z - z) > 70 + f.lightRadius) continue;
      const g = f.glow, p = g.geometry.attributes.position, uv = g.geometry.attributes.uv;
      for (let j = 0; j < 81; j++) {
        const i = n * 81 + j;
        dst.position.setXYZ(i, p.getX(j) * g.scale.x + g.position.x, p.getY(j) * g.scale.y + g.position.y, p.getZ(j) * g.scale.z + g.position.z);
        dst.uv.setXY(i, uv.getX(j), uv.getY(j));
        dst.color.setXYZ(i, f.glowFalloff, f.glowFalloff, f.glowFalloff);
      }
      n++;
    }
    mesh.geometry.setDrawRange(0, n * 384);
    dst.position.needsUpdate = dst.uv.needsUpdate = dst.color.needsUpdate = true;
    mesh.visible = n > 0;
  }

  // 支度の見本にも本番と同じ火の照明を足す。最初の描画で全材質を作り直さない。
  prepareFireMaterial(o) {
    if (this.fireFill && this.timeKey === 'night' && this.fires.length) fireFillObject(o);
  }

  // 支度の時間切れで残った材質も、初回から一コマ128節・一ミリ秒まで。
  updateFireMaterials(G) {
    if (!G.matScan) {
      G.matScan = { nodes: [this.scene], indices: [-1] };
    }
    const { nodes, indices } = G.matScan;
    if (!nodes.length) {
      if (this.time - G.matTime < 0.5) return;
      nodes.push(this.scene); indices.push(-1);
    }
    const start = performance.now();
    let visited = 0, steps = 0;
    while (nodes.length && visited < 128) {
      const top = nodes.length - 1, o = nodes[top];
      if (indices[top] === -1) { fireFillObject(o); indices[top] = 0; visited++; }
      if (indices[top] < o.children.length) {
        nodes.push(o.children[indices[top]++]); indices.push(-1);
      } else { nodes.pop(); indices.pop(); }
      if (++steps % 32 === 0 && performance.now() - start >= 1) break;
    }
    if (!nodes.length) G.matTime = this.time;
  }

  // 点光源以外の火は、共有する升に最も強く届く火の位置と半径だけを残す。
  // 一画素で全ての火を調べず、骨の兵・まとめた兵・壁へ同じ方向の暖色を足す。
  updateFireFill(x, z) {
    const G = this.fireFill, night = this.timeKey === 'night';
    FIRE_FILL.area.value.z = true && night && this.fires.length ?
      (SETTINGS.reduceMotion ? 0.65 : 0.65 + Math.sin(this.time * 2.3) * 0.04 + Math.sin(this.time * 3.7) * 0.025) : 0;
    if (!G || !FIRE_FILL.area.value.z) {
      for (const f of this.fires) if (f.glow) f.glow.material.visible = false;
      if (this.fireGlowBatch) this.fireGlowBatch.visible = false;
      return;
    }
    // 光の升の更新を待つコマにも材質の巡回を進める。
    this.updateFireMaterials(G);
    if (this.fireGlowBatch) this.fireGlowBatch.material.opacity = 0.22 * FIRE_FILL.area.value.z / 0.65;
    if (G.time >= 0 && this.time - G.time < 0.2 && Math.abs(x - G.x) + Math.abs(z - G.z) < 2) return;
    G.time = this.time; G.x = x; G.z = z;
    const ox = Math.floor(x / 2) * 2 - 64, oz = Math.floor(z / 2) * 2 - 64;
    FIRE_FILL.area.value.set(ox, oz, FIRE_FILL.area.value.z);
    G.data.fill(0); G.strength.fill(0);
    for (const f of this.fires) {
      if (!f.lit || f.light) continue;
      const radius = f.lightRadius, fy = f.base + (f.big ? f.size * 0.3 : 0.25);
      const left = Math.max(0, Math.floor((f.x - radius - ox) / 2)), right = Math.min(63, Math.ceil((f.x + radius - ox) / 2));
      const top = Math.max(0, Math.floor((f.z - radius - oz) / 2)), bottom = Math.min(63, Math.ceil((f.z + radius - oz) / 2));
      for (let iz = top; iz <= bottom; iz++) for (let ix = left; ix <= right; ix++) {
        const wx = ox + ix * 2 + 1, wz = oz + iz * 2 + 1;
        const reach = 1 - Math.hypot(wx - f.x, this.heightAt(wx, wz) + 1 - fy, wz - f.z) / radius;
        const i = iz * 64 + ix;
        if (reach <= G.strength[i]) continue;
        G.strength[i] = reach;
        const j = i * 4; G.data[j] = f.x; G.data[j + 1] = fy; G.data[j + 2] = f.z; G.data[j + 3] = radius;
      }
    }
    this.updateFireGlowBatch(x, z);
    G.tex.needsUpdate = true;
  }

  // 近い松明・篝火に、決まった数の光を付け替える（0.5 秒ごと）。低は二つのまま。
  assignFireLights(dt, focus) {
    const P = this.firePool;
    if (!P || !focus || (this.fireLightT = (this.fireLightT || 0) - dt) > 0) return;
    this.fireLightT = 0.5;
    // 決まった光の枠へ近い順に入れる。全ての火の並べ替えは要らない。
    for (const q of P) { q.nearF = null; q.nearD = 4900; }
    for (const f of this.fires) {
      if (!f.lit) continue;
      if (!f.big && !f.torch && !f.nightOnly && this.timeKey !== 'night' && this.timeKey !== 'dusk' && this.timeKey !== 'storm') continue;
      const dx = f.x - focus.x, dz = f.z - focus.z;
      const dy = f.base - focus.y, d2 = dx * dx + dy * dy + dz * dz;
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
        // 小さな火の暖色を遠い壁まで広げず、近い具足と足もとへ集中させる。
        q.L.distance = f.lightRadius ?? (f.big ? 28 : f.torch ? 10 : 12);
        q.L.color.setHex(f.lightColor); q.L.decay = f.lightDecay;
        q.L.position.set(f.x, f.base + (f.big ? f.size * 0.3 : 0.25), f.z);
        q.L.intensity = f.lightPower ?? 8;
        break;
      }
    }
    if (this.fireFill) this.fireFill.time = -1;
  }

  // 遠い軽い兵の塊（いちばん近い端が 38m より先。人の背丈が画面の一割に満たない）は角の少ない形で描く。並び・色・動きの入れ物（兵ごとの属性）は同じ物を使い回し、形だけ替える
  //   mid：中ほどの形を持つか（持たなければ 50m までは元の形）。xg：とても遠い形（無ければ兵の形。馬は馬の軽い形を渡す）
  lodFlag(mesh, banner = false, yose = false) {
    const g = banner ? clothGeo(yose ? 0.66 : 0.72, yose ? 3.7 : 2.6, 1, 2, 0.3, 5.2, 0.14, 12) : clothGeo(0.34, 0.62, 1, 1, 0, 2.62, -0.17, 11);
    this.lodTwin(mesh, null, true, g);
    if (!banner) mesh.userData.lod.sashi = true;
    g.dispose();
  }
  lodTwin(mesh, armor, mid = true, xg = null, minLv = 0, xg3 = null) {
    // 指定した戦の中遠景は、近景と同じ形を重ねず、腕と袖の細部を省いた形へ。
    // 兵数・塊ごとの打ち合い・骨の動きは変えない。馬と旗には専用の形を使う。
    const gx = (xg || soldierGeo(armor, this.def.middleInfantryArms ? 'xlo' : true || this.def.lowArmyMiddleDetail ? 'xxlo' : 'xlo')).clone(), g = !mid ? mesh.geometry : xg ? gx : soldierGeo(armor, false && (this.def.denseFront || this.def.lowArmyDetail) ? 'xlo' : 'lo').clone();
    const gxx = xg ? (xg3 ? xg3.clone() : gx) : soldierGeo(armor, !mesh.geometry.attributes.aClash ? 'x4lo' : 'x3lo').clone(), g4 = xg ? null : soldierGeo(armor, 'x4lo').clone();
    for (const k in mesh.geometry.attributes) { const at = mesh.geometry.attributes[k]; if (at.isInstancedBufferAttribute) { if (g !== mesh.geometry) g.setAttribute(k, at); gx.setAttribute(k, at); gxx.setAttribute(k, at); if (g4) g4.setAttribute(k, at); } }
    mesh.userData.lod = { hi: mesh.geometry, lo: g, xlo: gx, xxlo: gxx, x4: g4, minLv, n: -1, far: false, lv: -1 };   // 遠い側は近距離判定でも重い形に戻さない。
    (this.lodList || (this.lodList = [])).push(mesh);
  }
  // 長い鉄砲の列は兵ごとの遠さで形を選ぶ。人数・射撃・移動の元の束は保つ。
  soldierDetail(source, group, armor, middle = 32) {
    const capacity = source.instanceMatrix.count, matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const meshes = [source.userData.lod.hi, soldierGeo(armor, 'xlo'), soldierGeo(armor, 'x3lo')].map((base) => {
      const geo = base.clone();
      for (const [name, attribute] of Object.entries(source.geometry.attributes)) if (attribute.isInstancedBufferAttribute) {
        geo.setAttribute(name, new THREE.InstancedBufferAttribute(new attribute.array.constructor(attribute.array.length), attribute.itemSize, attribute.normalized).setUsage(THREE.DynamicDrawUsage));
      }
      const mesh = new THREE.InstancedMesh(geo, source.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (source.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false; mesh.userData.noFreeze = true;
      group.add(mesh); return mesh;
    });
    const attributes = Object.entries(source.geometry.attributes).filter(([, a]) => a.isInstancedBufferAttribute);
    source.layers.mask = 0;
    (this.soldierDetails || (this.soldierDetails = [])).push((renderer, scene, camera) => {
      if (!group.visible) { for (const mesh of meshes) mesh.count = 0; return; }
      source.onBeforeRender(renderer, scene, camera);
      for (const mesh of meshes) {
        mesh.count = 0; mesh.visible = source.visible; mesh.material = source.material;
        mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
      }
      for (let i = 0; i < source.count; i++) {
        source.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(source.matrixWorld);
        const d2 = point.distanceToSquared(camera.position);
        const mesh = meshes[d2 <= 16 * 16 ? 0 : d2 <= middle * middle ? 1 : 2], n = mesh.count++;
        mesh.setMatrixAt(n, matrix);
        if (source.instanceColor) for (let k = 0; k < 3; k++) mesh.instanceColor.array[n * 3 + k] = source.instanceColor.array[i * 3 + k];
        for (const [name, attribute] of attributes) {
          const target = mesh.geometry.attributes[name], size = attribute.itemSize;
          for (let k = 0; k < size; k++) target.array[n * size + k] = attribute.array[i * size + k];
        }
      }
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        for (const [name] of attributes) mesh.geometry.attributes[name].needsUpdate = true;
      }
    });
  }
  // 地図じゅうに並べた木や草は、全画質で画面に入る物だけ同じ束へ残す。近くの影も保つ。
  //   画面に入る木（高さ・幅・風の余裕つき）と、近く（near m の内）の木だけを前へ詰めて描く。カメラの移動・上下左右の向き・画角が変わった時だけ詰め直す
  viewCull(meshes, near, far = Infinity, thin = true) {
    const m0 = meshes[0], N = m0.count;
    if (!N) return;
    const pts = new Float32Array(N * 3), radii = new Float32Array(N), A = m0.instanceMatrix.array;
    const centers = this.def?.tightSceneryCull && SETTINGS.quality === 'high' ? new Float32Array(N * 3) : null;
    let radius = 0;
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (centers && !m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingSphere;
      radius = Math.max(radius, b.radius + b.center.length());
    }
    for (let i = 0; i < N; i++) {
      const k = i * 16;
      pts[i * 3] = A[k + 12]; pts[i * 3 + 1] = A[k + 13]; pts[i * 3 + 2] = A[k + 14];
      radii[i] = radius * Math.max(Math.hypot(A[k], A[k + 1], A[k + 2]), Math.hypot(A[k + 4], A[k + 5], A[k + 6]), Math.hypot(A[k + 8], A[k + 9], A[k + 10])) + 2;
      if (centers) {
        // 足元中心の球を最大の拡大率で伸ばすと、細長い草や板塀まで巨大な囲みになる。
        // 設営時だけ各部品の箱を回転・拡大し、実際の中心と広がりを保存する。
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (const m of meshes) {
          const b = m.geometry.boundingBox, a = m.instanceMatrix.array;
          const x = (b.min.x + b.max.x) * .5, y = (b.min.y + b.max.y) * .5, z = (b.min.z + b.max.z) * .5;
          const hx = (b.max.x - b.min.x) * .5, hy = (b.max.y - b.min.y) * .5, hz = (b.max.z - b.min.z) * .5;
          const cx = a[k] * x + a[k + 4] * y + a[k + 8] * z + a[k + 12];
          const cy = a[k + 1] * x + a[k + 5] * y + a[k + 9] * z + a[k + 13];
          const cz = a[k + 2] * x + a[k + 6] * y + a[k + 10] * z + a[k + 14];
          const rx = Math.abs(a[k]) * hx + Math.abs(a[k + 4]) * hy + Math.abs(a[k + 8]) * hz;
          const ry = Math.abs(a[k + 1]) * hx + Math.abs(a[k + 5]) * hy + Math.abs(a[k + 9]) * hz;
          const rz = Math.abs(a[k + 2]) * hx + Math.abs(a[k + 6]) * hy + Math.abs(a[k + 10]) * hz;
          x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx);
          y0 = Math.min(y0, cy - ry); y1 = Math.max(y1, cy + ry);
          z0 = Math.min(z0, cz - rz); z1 = Math.max(z1, cz + rz);
        }
        // 風の余裕は従来どおり残す。距離段階と影の距離は元の足元で選ぶ。
        const tightRadius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * .5 + 2;
        const tight = tightRadius < radii[i];
        centers[i * 3] = tight ? (x0 + x1) * .5 : pts[i * 3];
        centers[i * 3 + 1] = tight ? (y0 + y1) * .5 : pts[i * 3 + 1];
        centers[i * 3 + 2] = tight ? (z0 + z1) * .5 : pts[i * 3 + 2];
        if (tight) radii[i] = tightRadius;
      }
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
      const cx = centers ? centers[i * 3] : x, cy = centers ? centers[i * 3 + 1] : y, cz = centers ? centers[i * 3 + 2] : z;
      cell.box.min.x = Math.min(cell.box.min.x, cx - r); cell.box.max.x = Math.max(cell.box.max.x, cx + r);
      cell.box.min.y = Math.min(cell.box.min.y, cy - r); cell.box.max.y = Math.max(cell.box.max.y, cy + r);
      cell.box.min.z = Math.min(cell.box.min.z, cz - r); cell.box.max.z = Math.max(cell.box.max.z, cz + r);
    }
    L.push({ orig, pts, centers, radii, packed, bands: new Uint8Array(N), cells, cellOf, N, near, far2: far * far, thin: false, keepDensity: !thin, x: 1e9, y: 0, z: 0, fx: 0, fy: 0, fz: 0, projection: 0 });
    // カメラは描く時に拾う（毎コマの詰め直しは world.update で）
    const world = this;
    for (const m of meshes) {
      m.frustumCulled = false;
      const f = m.onBeforeRender, beforeShadow = m.onBeforeShadow, afterShadow = m.onAfterShadow;
      // 設営中に用意した影の行列も、保存と復帰を対にして重ねる。影が終わるたび元の数へ戻す。
      m.onBeforeShadow = function (r, sc, cam, shadowCam, geo, mat, group) {
        beforeShadow.call(this, r, sc, cam, shadowCam, geo, mat, group);
        if (this.userData.cullS != null && this.userData.preS == null) { this.userData.preS = this.count; this.count = Math.min(this.count, this.userData.cullS); }
      };
      m.onAfterShadow = function (r, sc, cam, shadowCam, geo, mat, group) {
        if (this.userData.preS != null) { this.count = this.userData.preS; this.userData.preS = null; }
        afterShadow.call(this, r, sc, cam, shadowCam, geo, mat, group);
      };
      m.onBeforeRender = function (r, sc, cam, geo, mat, group) {
        if (this.userData.preS != null) { this.count = this.userData.preS; this.userData.preS = null; }
        // 初めて見るカメラ（開戦の最初のコマ・写真の視点）は、その場で詰め直す（一コマ目に地図じゅうの木と石を描かない）
        if (cam && cam.isPerspectiveCamera && world.cullCam !== cam) { world.cullCam = cam; world.cullTick(true); }
        return f.call(this, r, sc, cam, geo, mat, group);
      };
    }
  }
  // 球の上端と幅を覆う九点が同じ山腹より下の時だけ隠す。近景と見下ろす地図は対象外。
  terrainHidden(px, py, pz, sphere, box = null) {
    if ((!this.def.distantMaterialBatch && true) || !this.def.lowMountainCull) return false;
    const p = sphere.center, radius = sphere.radius + 2;
    const dx = p.x - px, dz = p.z - pz;
    if (dx * dx + dz * dz < (radius + 35) ** 2) return false;
    // 城壁の区画には実際の囲みを使う。横に長い塀の球の上端は、
    // 屋根より何十メートルも高くなり、山腹に隠れた面まで残していた。
    // 横幅と奥行き・上端に二メートルの余裕を残す。影の判定は変えない。
    const topY = box ? box.max.y + 2 : p.y + radius;
    const widthX = box ? (box.max.x - box.min.x) / 2 + 2 : radius;
    const widthZ = box ? (box.max.z - box.min.z) / 2 + 2 : radius;
    for (let step = 1; step <= 3; step++) {
      const t = step / 4, x = px + dx * t, z = pz + dz * t;
      const top = py + (topY - py) * t + 3;
      let blocked = true;
      for (let ix = -1; ix <= 1 && blocked; ix++) for (let iz = -1; iz <= 1; iz++) {
        if (this.heightAt(x + ix * widthX * t, z + iz * widthZ * t) <= top) { blocked = false; break; }
      }
      if (blocked) return true;
    }
    return false;
  }
  cullTick(fresh = false) {
    const cam = this.cullCam;
    if (!this.cullList || !cam) return;
    const e = cam.matrixWorld.elements, px = e[12], py = e[13], pz = e[14];
    const shadowFocus = this.lastFocus || this.sun.target.position, sx = shadowFocus.x, sz = shadowFocus.z;
    const shadowRange2 = 1600;
    const fx = -e[8], fy = -e[9], fz = -e[10], projection = cam.projectionMatrix.elements[0];
    const V = this.vegView || (this.vegView = { fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sphere: new THREE.Sphere(), box: new THREE.Box3() });
    V.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); V.fr.setFromProjectionMatrix(V.pm);
    // 首振りで木・石・草の全束を同時に詰め直さず、一コマ一束ずつ巡る。
    // 初めての視点だけは全束をそろえ、開戦時に地図じゅうの株を描かない。
    // 待つ束は直前の描画を保ち、兵の数・斬り合い・影の範囲は変えない。
    const total = this.cullList.length;
    for (let checked = 0; checked < total; checked++) {
      const at = (this.cullCursor || 0) % total, C = this.cullList[at];
      this.cullCursor = (at + 1) % total;
      if (C.shadowRange2 === shadowRange2 && Math.hypot(px - C.x, py - C.y, pz - C.z) < 1 && Math.hypot(sx - C.sx, sz - C.sz) < 1 && fx * C.fx + fy * C.fy + fz * C.fz > 0.9998 && projection === C.projection) continue;
      C.shadowRange2 = shadowRange2;
      C.x = px; C.y = py; C.z = pz; C.fx = fx; C.fy = fy; C.fz = fz; C.projection = projection;
      C.sx = sx; C.sz = sz;
      const P = C.pts, nr2 = C.near * C.near;
      for (const cell of C.cells) {
        const dx = Math.max(cell.x0 - px, 0, px - cell.x1), dz = Math.max(cell.z0 - pz, 0, pz - cell.z1);
        const margin = (Math.max(Math.abs(cell.x0 - px), Math.abs(cell.x1 - px)) + Math.max(Math.abs(cell.z0 - pz), Math.abs(cell.z1 - pz))) * .02;
        V.box.copy(cell.box).expandByScalar(margin);
        const dd = dx * dx + dz * dz;
        cell.on = dd <= C.far2 && (dd <= nr2 || V.fr.intersectsBox(V.box));
      }
      let n = 0, changed = false, nS = 0, nNear = 0;
      // 高画質の距離・見切れ判定は一度だけ。結果の入れ物は設営時から使い回す。
      const bands = C.bands;
      // 高の影は本人から40m内。葉の形を替える距離55mは保ち、影・近景・遠景の順に詰める。
      for (let pass = 0; pass < 3; pass++) {
      if (pass === 1) nS = n;
      if (pass === 2) nNear = n;
      for (let i = 0; i < C.N; i++) {
        if (bands && pass > 0) {
          if (bands[i] !== pass) continue;
        } else {
          if (bands) bands[i] = 3;
          if (!C.cells[C.cellOf[i]].on) continue;
          const dx = P[i * 3] - px, dz = P[i * 3 + 2] - pz, d2 = dx * dx + dz * dz;
          const sdx = P[i * 3] - sx, sdz = P[i * 3 + 2] - sz;
          const band = d2 > 3025 ? 2 : sdx * sdx + sdz * sdz <= shadowRange2 ? 0 : 1;
          if (d2 > C.far2 || (!bands && pass !== band)) continue;
          const centers = C.centers || P;
          V.sphere.center.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]);
          // 次の詰め直しまでの小さな首振りは、遠い草ほど大きな余裕にする。
          V.sphere.radius = C.radii[i] + (Math.abs(dx) + Math.abs(dz)) * .02;
          // 木の高さと幅・風で揺れる余裕まで含めて、画面の外だけを省く。近くの木は残す。
          if (d2 > nr2 && !V.fr.intersectsSphere(V.sphere)) continue;
          if (cam.isPerspectiveCamera && this.terrainHidden(px, py, pz, V.sphere)) continue;
          // 近くの木（near のある物）は、90m より先を二本に一本・160m より先を四本に一本（霞の中で森の塊に見えれば足りる）
          //   高は 120m・200m・280m から（霞の奥の木と草を間引く）
          if (!C.keepDensity && (C.thin ? nr2 && ((d2 > 8100 && (i & 1)) || (d2 > 25600 && (i & 2)) || (d2 > 57600 && (i & 4))) : (d2 > 14400 && (i & 1)) || (d2 > 40000 && (i & 2)) || (d2 > 78400 && (i & 4)))) continue;
          if (bands) {
            bands[i] = band;
            if (band !== pass) continue;
          }
        }
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
      }
      for (const o of C.orig) {
        const far = o.m.userData.farFoliage;
        if (far) {
          // 近景を先頭へ詰める既存の並びを使う。幹と木の本数は距離で減らさない。
          const refresh = changed || far.count !== n - nNear || o.m.count !== nNear;
          o.m.count = nNear; far.count = n - nNear;
          if (refresh) {
            const src = o.m.instanceMatrix.array, dst = far.instanceMatrix.array;
            for (let k = 0; k < far.count * 16; k++) dst[k] = src[nNear * 16 + k];
            if (o.col) {
              if (!far.instanceColor) far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(C.N * 3), 3);
              for (let k = 0; k < far.count * 3; k++) far.instanceColor.array[k] = o.m.instanceColor.array[nNear * 3 + k];
              far.instanceColor.needsUpdate = true;
            }
            far.instanceMatrix.needsUpdate = true;
          }
        } else o.m.count = n;
        o.m.userData.cullS = nS; o.m.userData.preS = null;
        if (changed) { o.m.instanceMatrix.needsUpdate = true; if (o.col) o.m.instanceColor.needsUpdate = true; }
      }
      if (!fresh) break;
    }
  }
  // 画質「低」：炎の板（焚き火・篝火・燃える建物）は、材質ごとに一つの束で描く（描く直前に Battle が呼ぶ）。
  //   火ごとの位置・大きさ・揺れは元の板の行列のまま写す。束へ写した板は層 2 にしてカメラから外す
  flameBatch() {
    // 全画質で束ねる（高でも燃える城や寺で炎の板を一枚ずつ描いて百回ほどになっていた）
    const M = this.flameInst || (this.flameInst = new Map());
    for (const e of M.values()) e.n = 0;
    if (this.fires.length) {
      const ok = new Set([FLAME_MAT, FLAME_CORE_MAT, ROUND_FLAME_MAT, ROUND_FLAME_CORE]);
      // 戦ごとに作り直した炎の材質（本能寺の火・重ねた舌など）も、共通の炎の値（FLAME_U）と同じ形の頂点の作りなら束ねる
      const flameLike = (mt) => {
        if (ok.has(mt)) return true;
        if (!mt || !mt.isShaderMaterial) return false;
        let r = FLAME_LIKE.get(mt);
        if (r === undefined) FLAME_LIKE.set(mt, r = !!mt.uniforms && mt.uniforms.uWind === FLAME_U.uWind && /flameWorld = modelMatrix \* instanceMatrix/.test(mt.vertexShader));
        return r;
      };
      const visit = (m) => {
        if (!m || !m.isMesh || !m.layers.mask || !flameLike(m.material)) return;
        for (let o = m; o; o = o.parent) if (!o.visible) { m.layers.mask = 1; return; }
        const k = m.material.uuid + m.geometry.uuid;
        let e = M.get(k);
        if (!e) {
          const im = new THREE.InstancedMesh(m.geometry, m.material, 192);
          im.frustumCulled = false; im.renderOrder = 2; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.scene.add(im); e = { im, n: 0 }; M.set(k, e);
        }
        if (e.n >= 192) { m.layers.mask = 1; return; }
        e.im.setMatrixAt(e.n++, m.matrixWorld); m.layers.mask = 2;
      };
      for (const f of this.fires) { visit(f.flame); visit(f.inner); if (f.flame) for (const c of f.flame.children) visit(c); }
    } else if (this.flameInst.size) for (const f of this.fires) for (const m of [f.flame, f.inner, ...(f.flame ? f.flame.children : [])]) if (m && m.layers.mask === 2) m.layers.mask = 1;
    for (const e of M.values()) { e.im.count = e.n; e.im.visible = e.n > 0; if (e.n) e.im.instanceMatrix.needsUpdate = true; }
  }
  lodTick(dt, fresh = false) {
    const list = this.lodList, total = list ? list.length : 0;
    if (!total) return;
    const cx = ARMY_P.value.x, cz = ARMY_P.value.y;
    if (cx > 9e4) return;
    // 四分の一秒ごとの全隊の更新を、同じ周期のまま各コマへ配る。
    // 端数を持ち越して少ない隊も更新する。視点交換と最初の一枚は全隊をそろえる。
    this.lodBudget = fresh ? total : Math.min(total, (this.lodBudget || 0) + Math.max(0, dt) * total / 0.25);
    const work = Math.floor(this.lodBudget + 1e-9);
    this.lodBudget = Math.max(0, this.lodBudget - work);
    if (!work) return;
    if (this.armyView) this.armyView.active = !!this.detailCam?.isPerspectiveCamera;
    if ((this.def.armyViewCull ?? true) && this.detailCam?.isPerspectiveCamera) {
      const cam = this.detailCam;
      const V = this.armyView || (this.armyView = { frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), sphere: new THREE.Sphere(), direction: new THREE.Vector3(), position: new THREE.Vector3(), projection: 0 });
      V.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      V.frustum.setFromProjectionMatrix(V.matrix);
      V.active = true;
      // 向きを大きく変えた時は全隊を詰め直す。少しずつ回した時も累積した角度で判定する。
      if (fresh) { cam.getWorldDirection(V.direction); cam.getWorldPosition(V.position); V.projection = cam.projectionMatrix.elements[0]; }
    }
    // 高い山城で指定した時だけ、高低差も遠い兵の細部の判定に含める。
    // 足元の道の高さは一度だけ読み、前線の人数と隊の動きは変えない。
    const cy = this.def.armyHeightLOD ? this.heightAt(cx, cz) + 1.6 : 0;
    for (let i = 0; i < work; i++) {
      const at = (this.lodCursor || 0) % total, m = list[at];
      this.lodCursor = (at + 1) % total;
      const L = m.userData.lod;
      if (!m.parent || (!m.count && !L.allHidden)) continue;
      if (m.count && (L.n !== m.count || !m.boundingSphere)) { m.computeBoundingSphere(); L.n = m.count; }
      if (!m.boundingSphere) continue;
      m.updateWorldMatrix(true, false);
      _lodV.copy(m.boundingSphere.center).applyMatrix4(m.matrixWorld);
      // 隊が丸ごと本物の兵に替わる輪（本人から 44m）の内にある時は、シェーダーで全員が消えるので描かない（描く回数と三角を数えない）
      const AU = m.material && m.material.userData && m.material.userData.armyU;
      const RR = AU ? (AU.uRealNear || ARMY_REAL_R).value : 0;
      L.allHidden = RR > 0 && Math.hypot(_lodV.x - ARMY_REAL_P.value.x, _lodV.z - ARMY_REAL_P.value.y) + m.boundingSphere.radius + 10 < RR;
      //   毎コマ数を決め直す描き方（onBeforeRender のある物）だけ。数を置き場の番号に使う物（倒れた兵の束）には触らない
      //   輪の内の兵を写しから外した時（lodCompact）も、元の束は描かない。数は描いた後に戻す（数を置き場の番号に使う物もあるので）
      if (m.onBeforeRender !== L.obr) {
        const f = m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender ? null : m.onBeforeRender;
        L.keepN = -1;
        L.obr = function (...a) { if (f) f.apply(this, a); if (L.allHidden || L.cmpOn || L.splitPacked) { L.keepN = this.count; this.count = 0; } };
        m.onBeforeRender = L.obr;
        m.onAfterRender = function () { if (L.keepN >= 0) { this.count = L.keepN; L.keepN = -1; } };
      }
      // 隊のいちばん近い端で測る。低でも近い兵は立体の形を保つ。
      const q = 1;
      const mid = false;   // 中は高より近くから軽い形へ（画質の差を本当に付ける）
      // 隊の長さの全部を「いちばん近い端」で測ると、長い隊が丸ごと細かい形になる（姉川）。中心から半径の半分手前で測る
      const dc = Math.hypot(_lodV.x - cx, _lodV.z - cz, this.def.armyHeightLOD ? _lodV.y - cy : 0), d = Math.max(0, dc - m.boundingSphere.radius * (q > 1 || mid ? 0.35 : 0.5)), h2 = L.lv >= 2 ? 5 : 0;
      //   3：塊のいちばん近い端が 100m より先は、さらに遠い形
      // 携帯では十八メートルより先の隊を、顔・袖・兜・得物を残した軽い立体へ。
      // 姉川の三つの前線を、三十八メートルまで一斉に細かな形で描いていた。
      // 本物の兵に替わる 36〜44m の内は、軽い兵を描かない（シェーダーで外す）ので、細かい形はほぼ要らない
      const near = q > 1 ? (L.lv >= 1 ? 16 : 18) : mid ? (L.lv >= 1 ? 9 : 11) : (L.lv >= 1 ? 12 : 15);
      // 三方ヶ原の低画質は十八メートルから腕・袖のある形、五十六メートルから輪郭用の形。人数は保つ。
      const lowFront = q > 1 && (this.def.denseFront || this.def.lowArmyDetail);
      // 画質「高」：本人とカメラから 44m の内の軽い兵は本物の兵に替わって描かれない（ARMY_REAL_R）。見える軽い兵は 44m より先だけ（背丈十五画素より小さい）なので、
      //   いつも輪郭の形にする。本物に替わる輪を狭めた隊（設楽原の鉄砲の列など。近くに見える軽い兵）は今までどおり遠さで形を選ぶ
      let lv = !mid && q === 1 && RR >= 30 ? 3 : Math.max(q > 1 ? L.minLv : 0, d >(L.lv === 3 ? (lowFront ? 50 : mid ? 58 : 72) : (lowFront ? 56 : mid ? 64 : 78)) ? 3 : d > (lowFront ? 30 : q > 1 ? 60 : mid ? 40 : 46) - h2 ? 2 : d > near ? 1 : 0);
      // 高：本物に替わる輪が 8m より広い隊（斬り合いの塊など）は、見える軽い兵がどれも 8m より先なので、細かい形（十角）でなく五角の形（本物の兵の 8〜16m と同じ考え）
      if (!mid && q === 1 && RR >= 8 && lv === 0) lv = 1;
      // 設楽原の乱戦：隊の最も近い端が十六メートル先なら細部を省く。
      // 揺れ・押し合いの余裕も残し、近い前線の形と人数は変えない。
      if (!mid && q === 1 && this.def.highClashDetail && L.hi.attributes.aClash) {
        const edge = Math.max(0, dc - m.boundingSphere.radius - 6);
        // 隊全体が十六メートルより先なら、袖・顔の細部を省いた輪郭の形へ。
        // 塊の端から揺れの六メートルも引いて測るため、目の前の斬り合いは元の形を保つ。
        if (edge > (L.lv >= 3 ? 14 : 16)) lv = Math.max(lv, 3);
      }
      // 画質「低」：18m より先の隊の背の小旗は描かない。高は隊の近い端が 50m より先の時（背の小旗は二画素ほど）。家の色は幟と旗持ちの大旗で残る
      if (L.sashi) { L.sashiCut = q > 1 ? !lowFront && lv >= 1 : !mid && lv >= 3; if (L.sashiCut) m.layers.mask = 0; else if (!m.userData.maskByBody) m.layers.mask = 1; }
      // 本物に替わる輪を狭めた隊（近くに軽い兵が見える）は、隊ごとでなく兵ごとに遠さで形を選ぶ（lodSplit）。16m の内は細かい形のまま
      const clashSplit = L.hi.attributes.aClash && AU?.uBlk;
      const splitOn = !mid && q === 1 && RR > 0 && RR < 30 && m.isInstancedMesh && L.hi !== L.xlo &&
        (!L.hi.attributes.aClash || clashSplit) && !(AU.uRout && AU.uRout.value > 0);
      if (splitOn || L.split) this.lodSplit(m, L, splitOn, dc - m.boundingSphere.radius, cx, cz);
      if (L.splitOn) lv = 3;
      // 高：隊の真ん中から半径の半分手前が 100m ほどより先の時は、さらに軽い形（L.x4。背丈八画素ほど）
      if (lv === 3 && !L.splitOn && L.x4 && !mid && q === 1 && d > (L.lv === 4 ? 94 : 100)) lv = 4;
      const big = q > 1 && !lowFront && L.deep && m.count > 250 && L.xxlo !== L.xlo;
      const lowLite = q > 1 && !lowFront;
      if (lv !== L.lv || big !== !!L.big) { L.lv = lv; L.big = big; L.far = lv > 0; m.geometry = L.base = lv === 4 ? L.x4 : lv === 3 || big || (lowLite && lv >= 1) ? L.xxlo : lv === 2 || lowLite ? L.xlo : lv ? L.lo : L.hi; L.trimMask = -2; }
      // 高：兵の形（L.x4 のある隊）は、隊の誰も使わない部品を外した形で描く（兵ごとに遠さで選ぶ隊は外さない）
      if (L.x4 && L.base) {
        const mask = !mid && q === 1 && !L.split ? armyPartMask(m) : -1;
        if (mask !== L.trimMask) { L.trimMask = mask; m.geometry = mask < 0 ? L.base : armyTrimGeo(L.base, mask); }
      }
      // 形を選んだ後に写す（写しは今の形を使う）
      if (!mid && q === 1 && RR >= 30 && !(AU.uRout && AU.uRout.value > 0)) this.lodCompact(m, L, RR); else if (L.cmpOn || L.cmp) this.lodCompact(m, L, 0);
    }
  }
  // 画面外の遠景兵だけ送らない。足踏み・槍・旗・次の更新までの移動と首振りに余裕を持つ。
  // 影を落とす束は五十五メートルまで残す。影の無い束は、十六メートル先から画面外だけを省く。
  armyInstanceVisible(m, k, wx, wz, distance) {
    const V = this.armyView;
    if (!(this.def.armyViewCull ?? true) || !V?.active || distance < (m.castShadow ? 55 : 16)) return true;
    const A = m.instanceMatrix.array;
    const scale = m.matrixWorld.getMaxScaleOnAxis() * Math.max(
      Math.hypot(A[k], A[k + 1], A[k + 2]), Math.hypot(A[k + 4], A[k + 5], A[k + 6]), Math.hypot(A[k + 8], A[k + 9], A[k + 10]));
    V.sphere.center.set(wx, this.heightAt(wx, wz) + 2 * scale, wz);
    V.sphere.radius = 15 * Math.max(1, scale) + distance * 0.04;
    if (!V.frustum.intersectsSphere(V.sphere)) return false;
    // 小谷の山腹の向こうだけ省く。影を落とす兵と近景は残し、槍・動きの余裕も球に含める。
    const cameraMatrix = this.detailCam.matrixWorld.elements;
    return !this.def.armyTerrainCull || m.castShadow || !this.terrainHidden(cameraMatrix[12], cameraMatrix[13], cameraMatrix[14], V.sphere);
  }
  // 輪（本物の兵に替わる 44m）の内に多くの兵が入った隊：見える兵（輪の外の兵）だけを写した束で描き、元の束は描かない。
  //   輪の内の兵はシェーダーが消すのに、三角と頂点の計算は全員の分かかっていた。消える・見えるの判定はシェーダーのまま（写しは余裕を持って多めに）
  lodCompact(m, L, RR) {
    const on = RR >= 30 && m.isInstancedMesh && !L.allHidden && m.count >= 48 && !L.splitOn && !L.sashi && !m.userData.maskByBody;
    if (!on) {
      if (L.cmp) { L.cmp.count = 0; L.cmp.visible = false; }
      if (L.cmpFar) { L.cmpFar.count = 0; L.cmpFar.visible = false; }
      L.cmpOn = false; return;
    }
    const A = m.instanceMatrix.array, e = m.matrixWorld.elements, cx = ARMY_P.value.x, cz = ARMY_P.value.y, rx = ARMY_REAL_P.value.x, rz = ARMY_REAL_P.value.y;
    const clash = !!m.geometry.attributes.aClash, r = RR - (clash ? 16 : 6);
    // 長い隊も兵ごとに遠さを測る。乱戦の押し引きは専用の距離切替に任せる。
    const farNear = !clash && L.x4 && L.lv !== 4 ? this.def.armyFarDetail ?? Infinity : Infinity;
    const heightLOD = !!this.def.armyHeightLOD;
    const cy = heightLOD ? (this.detailCam?.matrixWorld.elements[13] ?? this.heightAt(cx, cz) + 1.6) : 0;
    let keep = 0, distant = 0;
    const W = L.cmpIdx || (L.cmpIdx = new Int32Array(m.instanceMatrix.count));
    for (let i = 0, k = 0; i < m.count; i++, k += 16) {
      const x = A[k + 12], y = A[k + 13], z = A[k + 14];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const d = Math.hypot(wx - cx, wz - cz), realD = Math.hypot(wx - rx, wz - rz);
      if (d < r || realD < r) continue;
      if (!clash && !this.armyInstanceVisible(m, k, wx, wz, d)) continue;
      // 足踏みと更新間隔に七メートルの余裕。近景と遠景へ重ねて送らない。
      // 本物への置換は水平距離のまま。上の曲輪の細部だけ、視点との高低差も含める。
      const detailD = heightLOD ? Math.hypot(d, e[1] * x + e[5] * y + e[9] * z + e[13] - cy) : d;
      if (detailD > farNear + 7 && realD > farNear + 7) W[W.length - 1 - distant++] = i;
      else W[keep++] = i;
    }
    // 消える兵も遠い形へ移す兵も少ない時は、元の束をそのまま描く。
    if (!distant && keep > m.count * 0.88) {
      if (L.cmp) { L.cmp.count = 0; L.cmp.visible = false; }
      if (L.cmpFar) { L.cmpFar.count = 0; L.cmpFar.visible = false; }
      L.cmpOn = false; return;
    }
    if (!L.cmp || L.cmpGeo !== m.geometry) {
      if (L.cmp) { m.remove(L.cmp); L.cmp.dispose(); L.cmp.geometry.dispose(); }
      L.cmp = instTwin(m, m.geometry, null); L.cmpGeo = m.geometry;
    }
    if (distant && !L.cmpFar) L.cmpFar = instTwin(m, L.x4, null);
    const src = m.geometry.attributes, C = m.instanceColor ? m.instanceColor.array : null;
    L.cmpOn = true;
    for (let pass = 0; pass < 2; pass++) {
      const t = pass ? L.cmpFar : L.cmp, count = pass ? distant : keep;
      if (!t) continue;
      t.material = m.material; t.layers.mask = m.layers.mask;
      t.count = count; t.visible = count > 0;
      for (let j = 0; j < count; j++) {
        const i = W[pass ? W.length - 1 - j : j], target = t.instanceMatrix.array;
        for (let k = 0; k < 16; k++) target[j * 16 + k] = A[i * 16 + k];
        if (C) for (let k = 0; k < 3; k++) t.instanceColor.array[j * 3 + k] = C[i * 3 + k];
        for (const k of t.userData.keys) {
          const s = src[k], d = t.geometry.attributes[k]; if (!s) continue;
          const size = s.itemSize;
          for (let a = 0; a < size; a++) d.array[j * size + a] = s.array[i * size + a];
        }
      }
      if (count) {
        // 写した兵の誰も使わない兜・得物だけ外し、人数と姿を保つ。
        t.geometry.setIndex(armyTrimGeo(pass ? L.x4 : m.geometry, armyPartMask(t)).index);
        t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true;
        for (const k of t.userData.keys) t.geometry.attributes[k].needsUpdate = true;
        t.computeBoundingSphere();
      }
    }
  }
  // 兵ごとに形を選ぶ：近い兵（16m の内）は細かい形の写し、16〜44m は中ほどの形の写し、その先は元の束を遠い形で描く。
  //   どの兵をどれで描くかはシェーダーが一人ずつの距離で決める（aSplit）。写しには近くに居そうな兵の入れ物だけを写す
  lodSplit(m, L, on, edge, cx, cz) {
    const single = !!this.def.singleSoldierLOD;
    if (!L.split) {
      const n = m.instanceMatrix.count;
      L.splitA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      for (const g of new Set([L.hi, L.lo, L.xlo, L.xxlo])) g.setAttribute('aSplit', L.splitA);
      // 一人を一つの距離段階へ送る戦は、頂点側で遠近の写しを消し分けない。
      const twin = (geo, sign) => instTwin(m, geo, single ? 0 : sign);
      // 中ほどと遠いが同じ形（馬・旗）は、16m より先を元の束で描く
      L.clashSplit = !!L.hi.attributes.aClash;
      // 乱戦の近い形は従来と同じ五角。指定した戦だけ、中ほどに腕のある形を挟む。
      L.split = L.clashSplit && !(this.def.clashMiddleDetail > 16) ? [twin(L.lo, -1)] : L.xlo === L.xxlo ? [twin(L.hi, -1)] : [twin(L.hi, -1), twin(L.xlo, -2)];
      // 設楽原は遠い束も写す。近い形へ写した兵・討たれて消えた兵を遠い束で重ねて処理しない。
      L.splitFar = twin(L.xxlo, L.split.length > 1 ? 1 : 2);
      // 長い前線は、一人が近いだけで後列全員を細かな形へ戻さない。
      // 指定した距離より先は別の写しへ送り、同じ形の他隊とは軍勢の束で合わせる。
      if (this.def.highClashDetail && L.x4) L.splitDistant = twin(L.x4, L.split.length > 1 ? 1 : 2);
    }
    if (on !== !!L.splitOn) { L.splitOn = on; L.splitA.array.fill(on ? (L.split.length > 1 ? 1 : 2) : 0); L.splitA.needsUpdate = true; }
    const R = (m.material.userData.armyU?.uSplitR || ARMY_SPLIT_R).value;
    // 一人一束の戦だけ、長い鉄砲列の遠い細部を早めに軽い形へ。
    // 押し引きの位置を反映する戦だけ、足踏み用の余裕を指定できる。
    // 少人数の付き添いだけ近景を長く保てる。指定のない軍勢は戦ごとの上限を守る。
    const near = single ? Math.min(R.x, m.userData.soldierDetailNear ?? this.def.soldierDetailNear ?? R.x) : R.x;
    const middle = single ? Math.max(near, Math.min(R.y, this.def.soldierDetailMiddle ?? R.y)) : R.y;
    const margin = single ? Math.max(3, this.def.soldierDetailMargin ?? 7) : 7;
    const M0 = near + margin, M1 = middle + margin + 2;
    const [t0, t1] = L.split, two = !!t1;
    // 本物の兵へ替わって描かれない内側は、近い形の写しにも送らない。
    // 押し合いの位置は下で反映し、残る足踏みと更新間隔には七メートルの余裕を取る。
    const hiddenR = Math.max(0, (m.material.userData.armyU?.uRealNear || ARMY_REAL_R).value - 7);
    for (const t of L.split) { t.material = m.material; t.layers.mask = m.layers.mask; }
    const far = L.splitFar;
    const distant = L.splitDistant;
    L.splitPacked = !!(far && on);
    if (far) { far.material = m.material; far.layers.mask = m.layers.mask; far.count = 0; far.visible = false; }
    if (distant) { distant.material = m.material; distant.layers.mask = m.layers.mask; distant.count = 0; distant.visible = false; }
    if (!on || (!far && !L.clashSplit && edge > (two ? M1 : M0)) || !m.count || L.allHidden) { for (const t of L.split) { t.count = 0; t.visible = false; } return; }
    const distantNear = Math.max(M0, this.def.highClashFarDetail ?? 51);
    // 一人一束の戦だけ立体距離で形を選ぶ。置換と画面外の判定は元の水平距離を保つ。
    const heightLOD = single && !!this.def.armyHeightLOD;
    const cy = heightLOD ? (this.detailCam?.matrixWorld.elements[13] ?? this.heightAt(cx, cz) + 1.6) : 0;
    const A = m.instanceMatrix.array, e = m.matrixWorld.elements, src = m.geometry.attributes, C = m.instanceColor ? m.instanceColor.array : null;
    let n0 = 0, n1 = 0, nf = 0, nd = 0, farDistance = Infinity, routing = false;
    const put = (t, j, i) => {
      const target = t.instanceMatrix.array;
      for (let k = 0; k < 16; k++) target[j * 16 + k] = A[i * 16 + k];
      if (C) for (let k = 0; k < 3; k++) t.instanceColor.array[j * 3 + k] = C[i * 3 + k];
      for (const k of t.userData.keys) {
        const s = src[k], d = t.geometry.attributes[k]; if (!s) continue;
        const size = s.itemSize;
        for (let a = 0; a < size; a++) d.array[j * size + a] = s.array[i * size + a];
      }
    };
    for (let i = 0, k = 0; i < m.count; i++, k += 16) {
      let x = A[k + 12], y = A[k + 13], z = A[k + 14];
      if (L.clashSplit) {
        // 斬り合いの押し引きと、倒れた列の前詰めは描く式と同じ位置で判定する。
        // 槍の振りと足踏みの七メートルの余裕は従来どおり残す。
        const C = L.hi.attributes.aClash.array, info = L.hi.attributes.aInfo.array, U = m.material.userData.armyU;
        if (C[i * 4 + 3] < 0.5) {
          const block = U.uBlk.value[Math.round(C[i * 4])], more = U.uBlk2.value[Math.round(C[i * 4])];
          // cInit と同じ消滅条件。倒れた姿は専用の束が描く。
          if (more.w > 0.5 || C[i * 4 + 1] + 0.5 <= block.z) continue;
          // 敗走する兵は描く式で遠くまで走るため、元の位置では省かない。
          // 近景と遠景の両方へ渡し、実際の位置で描く式が片方だけを選ぶ。
          // 一部の塊の敗走で、戦い続ける全隊の細部選びまで止めない。
          if (block.w > 0) {
            routing = true;
            put(t0, n0++, i);
            if (!single && two) put(t1, n1++, i);
            if (!single && far) { put(far, nf++, i); farDistance = 0; }
            continue;
          }
          const row = C[i * 4 + 2], kc = block.z / Math.max(1, more.z), fr = Math.floor(kc), sd = info[i * 4];
          const mix = block.y * (1 - THREE.MathUtils.smoothstep(row, fr + 1.5, fr + 2.6));
          const disorder = more.x * (1 - THREE.MathUtils.smoothstep(row, fr + 2, fr + 5));
          const ox = mix * 1.1 * ((sd * 3.77 % 1) - 0.5) * 2 + disorder * ((sd * 19.73 % 1) - 0.5) * 0.62;
          const oz = U.uSide.value * block.x + (row <= fr + 0.5 ? fr : kc) * CLASH_ROW + U.uApp.value + mix * (0.8 + 2.2 * (sd * 7.31 % 1))
            + disorder * (Math.min(0.55, Math.max(0, row - fr) * 0.22) + ((sd * 31.17 % 1) - 0.5) * 0.74);
          x += A[k] * ox + A[k + 8] * oz;
          y += A[k + 1] * ox + A[k + 9] * oz;
          z += A[k + 2] * ox + A[k + 10] * oz;
        }
      }
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const horizontal = Math.hypot(wx - cx, wz - cz);
      if (horizontal < hiddenR || Math.hypot(wx - ARMY_REAL_P.value.x, wz - ARMY_REAL_P.value.y) < hiddenR) continue;
      if (!this.armyInstanceVisible(m, k, wx, wz, horizontal)) continue;
      const d = heightLOD ? Math.hypot(horizontal, e[1] * x + e[5] * y + e[9] * z + e[13] - cy) : horizontal;
      // 重なる帯でも一人一束。境は従来の細かい側の外端に置き、
      // 足踏み・押し合い・更新間隔の余裕を保ったまま、消える写しだけを省く。
      if (d < M0) put(t0, n0++, i);
      if (two && (single ? d >= M0 : d > R.x - 7) && d < M1) put(t1, n1++, i);
      if (far && d >= (single ? (two ? M1 : M0) : (two ? R.y - 9 : R.x - 7))) {
        if (distant && d > distantNear) put(distant, nd++, i);
        else { put(far, nf++, i); farDistance = Math.min(farDistance, d); }
      }
    }
    // 遠い写しの全員が四十四メートルの外なら、輪郭を残す軽い立体へ。
    // 足踏みと更新間隔の七メートルを残す。形だけを共有し、人数と描く回数を保つ。
    L.splitFarLight = !!(nf && L.x4 && farDistance > (L.splitFarLight ? 45 : 51));
    for (let j = 0; j < L.split.length + (far ? 1 : 0) + (distant ? 1 : 0); j++) {
      const t = j < L.split.length ? L.split[j] : j === L.split.length ? far : distant;
      const c = t === t0 ? n0 : t === t1 ? n1 : t === distant ? nd : nf;
      t.count = c; t.visible = c > 0;
      // 敗走の移動は頂点側で加わるため、元の位置の囲みで写しを消さない。
      t.frustumCulled = routing ? false : m.frustumCulled;
      if (!c) continue;
      if (far) {
        const base = t === distant ? L.x4 : t === far ? (L.splitFarLight ? L.x4 : L.xxlo) : t === t0 ? (L.clashSplit ? L.lo : L.hi) : L.xlo;
        if (t === far) {
          for (const key in base.attributes) if (!base.attributes[key].isInstancedBufferAttribute) t.geometry.setAttribute(key, base.attributes[key]);
          t.geometry.boundingSphere = base.boundingSphere;
        }
        // 近景・遠景それぞれに実際に写した兵だけで、不要な笠・兜・得物を選ぶ。
        t.geometry.setIndex(armyTrimGeo(base, armyPartMask(t)).index);
      }
      t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true;
      for (const k of t.userData.keys) t.geometry.attributes[k].needsUpdate = true;
      t.matrix.identity(); t.matrixWorldNeedsUpdate = true;
      t.computeBoundingSphere();
    }
  }
  update(dt, focus) {
    const draw = !isNoRender();
    // 半秒ごとに川の近くだけ有効にする。止まっているだけでは押し出さない。
    this.waterEscapeT = (this.waterEscapeT || 0) - dt;
    if (this.waterEscapeT <= 0) {
      this.waterEscapeT = 0.5;
      this.waterEscapeNear = false;
      if (focus) for (const st of this.def.streams || NO_STREAMS) {
        if (distToPolyline(focus.x, focus.z, st.pts) >= st.w + 1.5) continue;
        this.waterEscapeNear = this.waterFootDepthAt(focus.x, focus.z, focus.y) <= 0.5;
        if (this.waterEscapeNear) break;
      }
    }
    // 昼には消し、夕・夜に灯す。既存の二〜三個の光を使い回す。
    const beaconLit = this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    for (const f of this.fires) if (f.nightOnly) {
      if (f.lit !== beaconLit) this.fireLightT = 0;
      f.lit = f.flame.visible = f.inner.visible = f.glow.visible = beaconLit;
    }
    if (draw) {
      if (true) this.fireLightT = Math.max(0, (this.fireLightT || 0) - dt);
      else this.assignFireLights(dt, focus);
      // 画質「低」：30m より先の火は内の芯の炎を描かない
      if (false && focus && (this.fireCoreT = (this.fireCoreT || 0) - dt) <= 0) {
        this.fireCoreT = 0.5;
        for (const f of this.fires) {
          const d = Math.hypot(f.x - focus.x, f.z - focus.z);
          if (f.inner) f.inner.layers.mask = d > (f.torch ? 12 : 30) ? 0 : 1;
          if (f.flame) for (const c of f.flame.children) c.layers.mask = d > 30 ? 0 : 1;
          if (f.glow) f.glow.layers.mask = d > 70 ? 0 : 1;
        }
      }
      this.lodTick(dt);
      this.cullTick();
    }
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
    if (draw && focus && this.lastFoot) {
      const mv = Math.hypot(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z);
      if (mv > 0.6 && this.inWaterAt(focus.x, focus.z, focus.y)) { this.spray(focus.x, focus.z, mv > 1.2 ? 7 : 4); this.lastFoot.copy(focus); }
      else if (mv > 0.6) { this.stampWear(focus.x, focus.z, 0.8, 5); this.footprint(focus.x, focus.z, false, Math.atan2(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z)); this.lastFoot.copy(focus); }
    } else if (focus) (this.lastFoot || (this.lastFoot = new THREE.Vector3())).copy(focus);
    this.wearT = (this.wearT || 0) + dt;
    if (this.wearDirty && this.wearT > 0.5) { this.wearT = 0; this.wearDirty = 0; this.wearTex.needsUpdate = true; }
    this.updateHaze(dt, focus);
    if (this.haze) this.haze.mesh.material.uniforms.color.value.set(this.def.hazeColor ?? (this.timeKey === 'night' ? 0x3a4250 : this.timeKey === 'dusk' ? 0xcbb4a0 : this.timeKey === 'storm' ? 0x9a9e9e : 0xd4d2cc));
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
      if (!this.boltFlashOn) { this.hemiCol0.copy(this.hemi.color); this.boltFlashOn = true; }
      this.hemi.color.copy(this.hemiCol0).lerp(BOLT_COL, Math.min(1, f * 0.8));
      // 稲妻の線は最初の 0.1 秒ほどだけ（二度ちらつく）
      if (this.bolt) { const t = 0.35 - this.flashT; this.bolt.visible = t < 0.06 || (t > 0.09 && t < 0.14); }
    } else if (this.skyMat.uniforms.flash.value) {
      this.skyMat.uniforms.flash.value = 0; this.hemi.intensity = this.baseHemi;
      if (this.boltFlashOn) { this.hemi.color.copy(this.hemiCol0); this.boltFlashOn = false; }
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
    this.skyMat.uniforms.lowDetail.value = 0;
    trimGeneratedTex();
    if (focus) this.lastFocus = focus;
    // 足もとの草は描く直前に進める。同じコマの更新と描画で二度走査しない。
    if (draw) this.updateBirds(dt, focus);
    if (this.waterTex && !SETTINGS.reduceMotion) { this.waterTex.offset.y += dt * 0.03; }
    // 雨で地面が濡れて暗くなる
    // 雨で地面が濡れて暗く、少し光る。雨が止んでもしばらく濡れたまま
    this.wetness = Math.max(this.rainLevel, (this.wetness || (this.def.wetStart || 0)) - dt * 0.004);
    this.groundU.uWet.value = this.wetness;
    this.groundU.uSoilRain.value = this.rainLevel;
    WET.value = this.wetness;
    if (this.onWet) this.onWet(this.wetness);
    // 炎の揺らめき
    if (this.fireFlagsDirty) this.separateFireFlags();
    if (FLAME_MAT) { FLAME_U.uNight.value = this.timeKey === 'night' ? 1 : this.timeKey === 'dusk' ? 0.5 : 0; FLAME_U.uT.value = SETTINGS.reduceMotion ? 0 : this.time; FLAME_U.uWind.value.set(WIND_STATE.dirX * WIND_STATE.gust, WIND_STATE.dirZ * WIND_STATE.gust); }
    for (const f of this.fires) {
      // 消灯した松明の炎だけが空中に残らないよう、表示も灯りに合わせる。
      f.flame.visible = f.inner.visible = !!f.lit;
      if (f.glow) f.glow.visible = !!f.lit;
      if (!f.lit) { if (f.light) f.light.intensity = 0; continue; }
      const ft = SETTINGS.reduceMotion ? 0 : this.time;
      const k = 0.85 + Math.sin(ft * 2.3 + f.seed) * 0.1 + Math.sin(ft * 3.7 + f.seed * 2) * 0.08;
      // 揺らめき：形の揺れは板の中（flameMat）。ここは大きさの息づき（ゆっくり伸び縮み）だけ
      f.flame.scale.set(f.size * 0.95 * (0.94 + Math.sin(ft * 2.1 + f.seed) * 0.05), f.size * 1.3 * (0.9 + (k - 0.85) * 0.8), 1);
      f.inner.scale.set(f.size * 0.6, f.size * 0.85 * (0.85 + k * 0.2), 1);
      f.flame.position.y = f.base + (k - 0.85) * f.size * 0.15;
      // 水面への映り込みにも同じ明るさを渡す。点光源の有無に依存させない。
      f.lightPower = (f.big || f.torch || f.nightOnly || this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 1 : 0;
      if (f.lightPower > 0) f.lightPower = (f.big && !(this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 0.9 : f.big ? 10 : f.torch ? 6 : 8) + k * 0.5 * (f.big ? 1.6 : 1);
      if (f.lightStrength != null) f.lightPower = f.lightStrength * (k / 0.85);
      f.lightPower *= this.def.fireLightLift || 1;
      if (f.light) {
        f.light.intensity = f.lightPower;
        f.light.position.set(f.x, f.base + (f.big ? f.size * 0.3 : 0.25), f.z);
      }
      if (f.glow) {
        f.glow.material.opacity = (this.timeKey === 'night' ? 0.22 : f.torch ? 0 : this.timeKey === 'night' ? 0.16 : this.timeKey === 'dusk' || this.timeKey === 'storm' ? 0.12 : 0.04) * f.glowFalloff * (0.8 + k * 0.25);
        if (f.torch) f.glow.position.set(f.x, this.heightAt(f.x, f.z) + 0.04, f.z);
      }
    }
    if (this.waterFireReflections) {
      // 点光源を省いても川の炎は残す。既存の三枠へ近い火を入れ、四成分目は選別の距離に使う。
      const reflections = this.waterFireReflections;
      for (const reflection of reflections) reflection.set(0, 0, 0, 4900);
      for (const f of this.fires) {
        if (!f.lit || !f.waterReflection || !(f.lightPower > 0)) continue;
        const d2 = (f.x - focus.x) ** 2 + (f.base - focus.y) ** 2 + (f.z - focus.z) ** 2;
        for (let i = 0; i < reflections.length; i++) {
          if (d2 >= reflections[i].w) continue;
          for (let j = reflections.length - 1; j > i; j--) reflections[j].copy(reflections[j - 1]);
          reflections[i].set(f.x, f.z, f.lightPower, d2);
          break;
        }
      }
    }
    if (draw && !SETTINGS.reduceMotion) this.updateEmbers(dt, focus);
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
    if (draw) {
      this.updatePuffs(this.dustP, dt, 0);
      this.updatePuffs(this.mudP, dt, 9);
      this.updatePuffs(this.sprayP, dt, 9);
      this.updateFootWaves(dt);
    }
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
    vis = vis + ((this.def.mistFar ?? 95) - vis) * mist * mist * (3 - 2 * mist) * 0.9;
    // 雨は遠くを白く隠す。昼の雨は霞を遠くに置き、近い兵の顔・具足・旗の色を残す（夜の雨は闇と合わせて狭いまま）
    vis = vis + ((this.timeKey === 'night' ? 112 : 220) - vis) * r;
    if (this.def.snow) vis *= 1 - this.def.snow * 0.25;
    const smoke = Math.min(1, (this.haze?.k || 0) + (this.dustVeil?.k || 0));
    // 谷の戦では硝煙の粒を残し、左右の山まで白い壁で隠さない。
    vis += (Math.min(vis, this.def.smokeFogFloor ?? 18) - vis) * smoke;
    // 戦ごとの霧の遠さや描画距離を上げても、夜の遠景は闇に沈める。移ろい中は徐々に狭める。
    if (this.timeKey === 'night') {
      const k = this.fade ? Math.min(1, this.fade.t / this.fade.dur) : 1;
      const s = k * k * (3 - 2 * k);
      vis += (Math.min(vis, this.def.nightFogFar ?? TIME.night.vis) - vis) * s;
    }
    this.vis = vis;
    // 遠くの軍勢の陽炎：晴れて乾いた昼・午後ほど強く、雨・朝靄・夕暮れでは弱い
    const hot = L === TIME.day || L === TIME.after ? 1 : L === TIME.morning ? 0.4 : 0.2;
    SHIMMER.value = hot * (1 - r) * (1 - mist) * (1 - Math.min(1, (this.wetness || 0) * 1.5));
    // 雲の影は、雨・画質「低」では無し
    const cloud = Math.min(0.95, (L.cloud || 0) * (1 - r) * (1));
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
    for (const m of this.mountains.children) m.material.uniforms.haze.value = Math.min(0.9, Math.max(this.def.mountainHaze ?? 0, 0.2 + m.material.uniforms.layer.value * 0.17));
    if (!draw) return; // 雨量・濡れ・霧・硝煙・遠景の戦況は上で進め、雨粒の絵だけ省く。
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
    const splashScale = this.def.rainSplashScale ?? 1;
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
        const a = q * 2.09 + i, o = i * 18 + q * 6, rr = (0.03 + k * 0.05) * splashScale;
        SL[o] = x + Math.cos(a) * 0.015 * splashScale; SL[o + 1] = y; SL[o + 2] = z + Math.sin(a) * 0.015 * splashScale;
        SL[o + 3] = x + Math.cos(a) * rr; SL[o + 4] = y + (0.04 + k * 0.05) * splashScale; SL[o + 5] = z + Math.sin(a) * rr;
      }
    }
    this.splashPts.geometry.attributes.position.needsUpdate = true;
  }
}
