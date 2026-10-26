// 身の回りだけの表面。形・描く回数は増やさず、遠くでは元の材質の結果をそのまま使う。
import * as THREE from 'three';
import { GRIME } from './humans_materials.js';
import { WET } from './world.js';
import { S } from './settings.js';

// 場面から外れた写しも、戦の片付けで集めて返す。
export const nearSurfaceCopies = new Map();
const copies = nearSurfaceCopies;
let soil = null;
export function sharedNearSurfaceResources() { return soil; }
const blood = { value: 1 };
export function nearSurfaceBlood(hide) {
  blood.value = hide || S.blood === 'off' ? 0 : S.blood === 'low' ? 0.45 : 1;
}
function soilTexture() {
  if (soil) return soil;
  // 一枚16KBを全員で共用。赤は泥の斑、緑は血の飛沫、青は水の筋。
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = x * Math.PI * 2 / n, b = y * Math.PI * 2 / n;
    const i = (y * n + x) * 4;
    data[i] = Math.max(0, Math.min(255, 128 + 45 * Math.sin(a * 3 + Math.sin(b * 2)) + 42 * Math.cos(b * 5 + a * 2)));
    data[i + 1] = Math.max(0, Math.min(255, 128 + 64 * Math.sin(a * 13 + b * 7) * Math.cos(b * 11 - a * 5) + 40 * Math.sin(a * 3 + b * 2)));
    data[i + 2] = Math.max(0, Math.min(255, 128 + 90 * Math.sin(a * 9 + Math.sin(b) * 0.7)));
    data[i + 3] = 255;
  }
  soil = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  soil.wrapS = soil.wrapT = THREE.RepeatWrapping;
  soil.magFilter = THREE.LinearFilter; soil.minFilter = THREE.LinearMipmapLinearFilter;
  soil.generateMipmaps = true; soil.needsUpdate = true;
  return soil;
}

export function nearSurfaceMaterial(base, kind = 'unit') {
  if (!base || base.nearSurfaceBase) return base;
  let variants = copies.get(base);
  if (!variants) { variants = new Map(); copies.set(base, variants); }
  if (variants.has(kind)) return variants.get(kind);
  const m = base.clone();
  // 表情・笠の陰・一人称の腕などの共有値を写し直さない。
  m.userData = { ...base.userData };
  m.nearSurfaceBase = base;
  // 色の仕上げが原本を包む順番で、同じ表面の鍵と処理が変わらないよう固定する。
  const before = base.onBeforeCompile, key = base.customProgramCacheKey();
  const armor = kind !== 'face' && kind !== 'eye';
  if (armor) m.userData.nearSoil = { value: soilTexture() };
  m.onBeforeCompile = (sh, renderer) => {
    before.call(base, sh, renderer);
    sh.fragmentShader = 'float nearAmount;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      nearAmount = 1.0 - smoothstep(100.0, 144.0, dot(vViewPosition, vViewPosition));`);
    if (armor) {
      sh.uniforms.uNearSoil = m.userData.nearSoil;
      sh.uniforms.uNearGrime = GRIME; sh.uniforms.uNearWet = WET; sh.uniforms.uNearBlood = blood;
      sh.vertexShader = 'varying vec3 vNearP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vNearP = position;');
      sh.fragmentShader = 'varying vec3 vNearP;\nuniform sampler2D uNearSoil;\nuniform float uNearGrime, uNearWet, uNearBlood;\nfloat nearMud, nearBlood, nearWater, nearMetal;\n' + sh.fragmentShader;
      const masks = kind === 'unit' ? `
        int code = int(floor(vMtl + 0.001));
        int second = code / 8, first = code - second * 8;
        int surface = txA.r > 0.5 ? second : first;
        nearMetal = surface == 3 || surface == 4 ? 1.0 : 0.0;
        float cord = surface == 0 && (first == 1 || second == 1 || first == 3 || second == 3) ? 1.0 : 0.0;
        float plate = surface == 1 || surface == 3 ? 1.0 : 0.0;
        // 本の小札の横段と白・紺の縅。元の色と模様を生かし、糸だけに明暗を足す。
        diffuseColor.rgb *= 1.0 + nearAmount * (cord * (stain.b - 0.5) * 0.2
          - plate * (1.0 - smoothstep(0.2, 0.65, txA.g)) * 0.12);
        float skin = surface == 2 ? 1.0 : 0.0;`
        : `nearMetal = ${kind === 'domaru' ? 'dmGold' : 'smoothstep(0.18, 0.5, diffuseColor.r) * smoothstep(0.08, 0.25, diffuseColor.g)'};
           float skin = 0.0;`;
      sh.fragmentShader = sh.fragmentShader.replace('nearAmount = 1.0 - smoothstep(100.0, 144.0, dot(vViewPosition, vViewPosition));', `nearAmount = 1.0 - smoothstep(100.0, 144.0, dot(vViewPosition, vViewPosition));
        nearMud = 0.0; nearBlood = 0.0; nearWater = 0.0; nearMetal = 0.0;
        if (nearAmount > 0.0) {
          vec3 stain = texture2D(uNearSoil, vNearP.xy * vec2(1.7, 1.3) + vNearP.z * 0.37).rgb;
          ${masks}
          float age = clamp(uNearGrime, 0.0, 1.0) * nearAmount * (1.0 - skin);
          nearMud = smoothstep(0.45, 0.72, stain.r) * (1.0 - smoothstep(0.2, 1.35, vNearP.y)) * age;
          nearBlood = smoothstep(0.77, 0.88, stain.g) * smoothstep(0.45, 0.85, vNearP.y) * age * 0.65 * uNearBlood;
          nearWater = smoothstep(0.55, 0.85, stain.b) * max(uNearWet, uNearGrime * 0.22) * nearAmount;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.052, 0.032), nearMud * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.012, 0.008), nearBlood);
          diffuseColor.rgb *= 1.0 - nearWater * 0.07;
        }`);
      // 光を軽くした携帯でも同じ絵を使う。金具だけ小さく照らし、布を金属にしない。
      if (m.isMeshStandardMaterial) {
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `
          roughnessFactor = mix(roughnessFactor, 0.28, nearMetal * nearAmount * 0.35);
          roughnessFactor = mix(roughnessFactor, 0.9, nearMud);
          roughnessFactor = mix(roughnessFactor, 0.38, nearWater * (1.0 - nearMud) * 0.5);
          #include <normal_fragment_begin>`);
      } else if (m.isMeshPhongMaterial) {
        sh.fragmentShader = sh.fragmentShader.replace('#include <lights_phong_fragment>', `#include <lights_phong_fragment>
          material.specularColor *= 1.0 + nearMetal * nearAmount * 0.4 + nearWater * 0.15;
          material.specularColor *= 1.0 - nearMud * 0.7 - nearBlood * 0.25;`);
      }
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        if (nearAmount > 0.0) {
          ${kind === 'eye' ? `
            // 瞳の小さな光は実際の日の向きと視線で動く。点や形は追加しない。
            #if NUM_DIR_LIGHTS > 0
            vec3 eyeHalf = normalize(directionalLights[0].direction + normalize(vViewPosition));
            reflectedLight.directSpecular += directionalLights[0].color * 0.12 * nearAmount
              * pow(max(dot(normal, eyeHalf), 0.0), 96.0);
            #endif` : `
            float under = 1.0 - smoothstep(-0.45, 0.5, dot(normal, viewMatrix[1].xyz));
            reflectedLight.indirectDiffuse *= 1.0 - under * nearAmount * 0.12;`}
        }`);
    }
  };
  m.customProgramCacheKey = () => key + '|near-surface-1|' + kind;
  variants.set(kind, m);
  return m;
}
