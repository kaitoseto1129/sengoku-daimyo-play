import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { macroTex } from './nature.js';
import { WIND_STATE } from './world_weather.js';

// 水面の補修は兵の更新の入口で一度だけ。川床・渡り口・戦の進行には触れない。
// 10/28 全戦共通の水：流れに沿って動く波（周期の縞を作らない雑音の波）・空と岸の映り込み・日の照り・浅い所の透け・雨の波紋・岸の濡れ。
const preparedWorlds = new WeakSet();

// 波の面の向きを作る共通の式。sfN（面の向き）と sfNear（近さ）と sfRing（雨の輪の明るさ）を置く。
function surfaceNormalGLSL(flowExpr, speed, waves) {
  return `
    vec2 sfFlow = ${flowExpr};
    vec2 sfSide = vec2(-sfFlow.y, sfFlow.x);
    float sfDist = length(vSurfaceWorld - cameraPosition);
    float sfNear = 1.0 - smoothstep(25.0, 120.0, sfDist);
    vec2 sfP = vec2(dot(vSurfaceWorld.xz, sfSide), dot(vSurfaceWorld.xz, sfFlow));
    float sfT = uSurfaceTime * ${speed.toFixed(2)};
    // 流れと直に交わる峰が長い。三つの大きさの雑音を別の速さで流し、決まった向きの縞を作らない。
    vec2 sfG = sfGrad(sfP * vec2(0.022, 0.045) + vec2(0.0, -sfT * 0.035)) * vec2(0.022, 0.045) * 0.5
      + sfGrad(sfP * vec2(0.075, 0.13) + vec2(0.37, -sfT * 0.11)) * vec2(0.075, 0.13) * 0.17
      + sfGrad(sfP * vec2(0.28, 0.42) + vec2(0.71, -sfT * 0.26)) * vec2(0.28, 0.42) * 0.045 * sfNear
      // 流れの向きに伸びる細かな筋（横に細かく、縦に長い）。近くだけ。
      + sfGrad(sfP * vec2(0.62, 0.09) + vec2(0.13, -sfT * 0.3)) * vec2(0.62, 0.09) * 0.04 * sfNear;
    vec2 sfW = (sfSide * sfG.x + sfFlow * sfG.y) * ${waves.toFixed(2)};
    // 浅い瀬ほど波立つ（川底の石で水面が乱れる）。
    float sfND = mix(vSurfaceDepth.y, vSurfaceDepth.x, smoothstep(0.35, 1.0, abs(vSurfaceAcross)));
    sfW *= 1.0 + (1.0 - smoothstep(0.1, 0.6, sfND)) * 0.6;
    float sfRing = 0.0;
    if (uSurfaceRain > 0.02) {
      // 雨の波紋：近くだけ。升ごとに落ちる時をずらし、広がりながら薄れる輪。
      float sfRainNear = 1.0 - smoothstep(6.0, 34.0, sfDist);
      vec2 sfRp = vSurfaceWorld.xz * 1.7;
      for (int k = 0; k < 2; k++) {
        vec2 sfOff = vec2(float(k) * 0.5, float(k) * 0.37);
        vec2 sfCell = floor(sfRp + sfOff);
        vec2 sfH = fract(sin(vec2(dot(sfCell, vec2(127.1, 311.7)), dot(sfCell, vec2(269.5, 183.3)))) * 43758.5453);
        vec2 sfD = sfRp + sfOff - (sfCell + 0.3 + sfH * 0.4);
        float sfR = length(sfD);
        float sfPh = fract(uSurfaceTime * 0.85 + sfH.x * 7.0);
        float sfRad = sfPh * 0.32;
        float sfOn = step(sfH.y, uSurfaceRain * 1.15) * (1.0 - sfPh) * sfRainNear;
        float sfWave = sin((sfR - sfRad) * 60.0) * (1.0 - smoothstep(0.0, 0.06, abs(sfR - sfRad)));
        sfW += sfD / (sfR + 0.001) * sfWave * sfOn * 0.45;
        sfRing += max(sfWave, 0.0) * sfOn;
      }
    }
    vec3 sfN = normalize(vec3(-sfW.x, 1.0, -sfW.y));`;
}

// 映り込み（10/30：暗い地面に溶けて水と分からないので、空の映りの上限を上げる）：見下ろすと水の色、寝かせて見ると空。低い映りは岸と木の暗い色。日の照りは波の峰で砕ける。
function surfaceLightGLSL(o) {
  return `
    {
      vec3 sfV = normalize(cameraPosition - vSurfaceWorld);
      vec3 sfR = reflect(-sfV, sfN);
      float sfFres = 0.02 + 0.98 * pow(1.0 - max(dot(sfN, sfV), 0.0), 5.0);
      float sfUp = clamp(sfR.y, 0.0, 1.0);
      // 霧・曇りで空と地平が同じ灰でも、地平は暗めに、雲の濃淡を波で砕いて映す（10/29：灰一色の板にしない）。
      float sfCloud = texture2D(uSurfaceNoise, sfR.xz / (sfUp + 0.12) * 0.03 + vec2(uSurfaceTime * 0.002, 0.0)).r;
      vec3 sfSky = mix(uSurfaceHorizon * 0.7, uSurfaceSky, smoothstep(0.0, 0.45, sfUp)) * (0.55 + sfCloud * 0.9);
      ${o.shore ? `// 岸の土手と木立の映り：遠い水ほど低い向きを映し、岸に寄るほど土手の暗い影が落ちる。
      float sfShore = max((1.0 - smoothstep(0.015, 0.2, sfUp)) * 0.6, smoothstep(0.55, 0.97, abs(vSurfaceAcross)) * 0.75);
      sfSky = mix(sfSky, uSurfaceHorizon * vec3(0.26, 0.28, 0.2), sfShore);` : ''}
      ${o.muddy ? '// 濁った川は映りも泥の色を帯びる。\n      sfSky *= vec3(1.0, 0.92, 0.76);' : ''}
      // 明るい空でも頭打ちの一色にせず、雲と波の明暗を残したまま柔らかく抑える。
      sfSky *= ${o.gain.toFixed(2)}; sfSky = vec3(0.56, 0.6, 0.6) * sfSky / (sfSky + vec3(0.3));
      ${o.cap ? 'outgoingLight = min(outgoingLight, vec3(0.30, 0.38, 0.36));' : ''}
      // 寝た目線でも波の向きで映りを変える：目へ向く斜面は水の色、向こうへ傾く斜面は空（細かな明暗）。
      float sfFacet = clamp(1.0 - dot(sfN.xz, normalize(sfV.xz + vec2(0.0001))) * 6.0, 0.3, 1.6);
      outgoingLight = mix(outgoingLight, sfSky, clamp(sfFres * ${o.refl.toFixed(2)} * sfFacet${o.cap ? ' * (1.0 - sfBank * 0.55)' : ''} * (1.0 - sfFoamW), 0.0, 0.78));
      float sfSpec = pow(max(dot(sfR, uSurfaceSun), 0.0), 140.0) * (1.0 - uSurfaceRain * 0.85);
      outgoingLight += uSurfaceSunCol * sfSpec * ${o.glint.toFixed(2)};
      outgoingLight += uSurfaceSky * sfRing * 0.07;
    }`;
}

// 水の中身：浅い所は川底の砂と石が透け、深い所は黄土を含んだ濁りで暗く沈む。瀬は白く泡立ち、水際は濡れて暗い。
// 深さは支度の時に頂点へ一度だけ書いた値（vSurfaceDepth：x＝岸の頂点、y＝その列の中ほど）。
function surfaceBodyGLSL(flowExpr, o) {
  return `
    float sfFoamW = 0.0;
    {
      float sfBD = mix(vSurfaceDepth.y, vSurfaceDepth.x, smoothstep(0.35, 1.0, abs(vSurfaceAcross)));
      vec2 sfBF = ${flowExpr}; vec2 sfBS = vec2(-sfBF.y, sfBF.x);
      float sfBNear = 1.0 - smoothstep(20.0, 110.0, length(vSurfaceWorld - cameraPosition));
      vec2 sfBP = vec2(dot(vSurfaceWorld.xz, sfBS), dot(vSurfaceWorld.xz, sfBF));
      float sfBT = uSurfaceTime;
      // 川底：砂の上に大小の丸石。石の縁の隙間は暗い。
      float sfS1 = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 0.9).r;
      float sfS2 = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 2.3 + 0.37).r;
      float sfStone = clamp(smoothstep(0.55, 0.6, sfS1) * 0.8 + smoothstep(0.58, 0.63, sfS2) * 0.6, 0.0, 1.0);
      float sfRim = smoothstep(0.49, 0.55, sfS1) - smoothstep(0.55, 0.6, sfS1);
      vec3 sfBedC = mix(vec3(0.1, 0.08, 0.05) * (0.8 + sfS2 * 0.35), vec3(0.075, 0.07, 0.06) * (0.7 + sfS2 * 0.6), sfStone);
      sfBedC *= 1.0 - sfRim * 0.5;
      // 浅い底でゆらぐ日の網目（二枚の雑音の重なる所が明るい）。
      float sfCa = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 0.55 + sfBF * sfBT * 0.05).r;
      float sfCb = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 0.71 - sfBF * sfBT * 0.03 + 0.5).r;
      sfBedC *= 1.0 + smoothstep(0.82, 1.0, 1.0 - abs(sfCa - sfCb) * 3.0) * 0.45 * sfBNear;
      // 深さで底が消える。濁りは黄土で、深みほど暗い。
      vec3 sfAbs = exp(-sfBD * ${o.absorb});
      vec3 sfDeep = mix(${o.silt}, ${o.deep}, smoothstep(0.35, 2.2, sfBD));
      // 流れの向きの濁りの筋：横に細かく、縦に長い。
      float sfStreak = texture2D(uSurfaceNoise, vec2(sfBP.x * 0.33, sfBP.y * 0.022 - sfBT * 0.05)).r;
      sfDeep *= 0.84 + sfStreak * 0.32;
      vec3 sfBody = sfBedC * sfAbs + sfDeep * (1.0 - sfAbs);
      // 水際の数センチは濡れた底がそのまま見える。
      sfBody = mix(sfBody, sfBedC * 0.6, 1.0 - smoothstep(0.0, 0.05, sfBD));
      diffuseColor.rgb = mix(diffuseColor.rgb, sfBody, ${o.mix.toFixed(2)});
      // 瀬の白い波と泡：浅い所で流れに沿って千切れる。水際には細い泡の線。
      float sfF1 = texture2D(uSurfaceNoise, vec2(sfBP.x * 0.55, sfBP.y * 0.11 - sfBT * 0.32)).r;
      float sfF2 = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 1.4 - sfBF * sfBT * 0.45).r;
      float sfRif = 1.0 - smoothstep(0.04, 0.28, sfBD);
      float sfFoam = sfRif * smoothstep(0.66, 0.8, sfF1 * 0.55 + sfF2 * 0.5 + sfStone * 0.15)
        + smoothstep(0.0, 0.03, sfBD) * (1.0 - smoothstep(0.03, 0.08, sfBD)) * smoothstep(0.45, 0.65, sfF2) * 0.7;
      sfFoamW = clamp(sfFoam * mix(0.4, 1.0, sfBNear), 0.0, 0.6) * ${o.foam.toFixed(2)};
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.4) * (0.9 + sfF2 * 0.2), sfFoamW);
    }`;
}

const RIVER_BODY = { absorb: 'vec3(3.2, 3.8, 5.0)', silt: 'vec3(0.06, 0.047, 0.024)', deep: 'vec3(0.022, 0.024, 0.016)', mix: 0.8, foam: 1 };
const MOAT_BODY = { absorb: 'vec3(3.0, 3.0, 3.4)', silt: 'vec3(0.035, 0.04, 0.026)', deep: 'vec3(0.015, 0.02, 0.016)', mix: 0.6, foam: 0.3 };

// 頂点ごとの深さ（岸の頂点と、その列の中ほど）。支度の時に一度だけ。
function depthAttr(world, mesh, geo, cols) {
  const p = geo.attributes.position, n = p.count, d = new Float32Array(n * 2);
  const ox = mesh.position.x, oy = mesh.position.y, oz = mesh.position.z;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz;
    d[i * 2] = Math.max(0, y - world.heightAt(x, z));
    if (cols > 1) {
      const a = i - i % cols, b = a + cols - 1;
      const cx = (p.getX(a) + p.getX(b)) / 2 + ox, cz = (p.getZ(a) + p.getZ(b)) / 2 + oz;
      d[i * 2 + 1] = Math.max(0, y - world.heightAt(cx, cz));
    } else d[i * 2 + 1] = d[i * 2];
  }
  return new THREE.BufferAttribute(d, 2);
}
function flatDepth(n, edge, mid) {
  const d = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { d[i * 2] = edge; d[i * 2 + 1] = mid; }
  return new THREE.BufferAttribute(d, 2);
}

function prepareWaterSurface(world) {
  if (!world?.scene || preparedWorlds.has(world)) return;
  preparedWorlds.add(world);
  const sky = new THREE.Color(), sunDir = new THREE.Vector3(0, 1, 0), sunCol = new THREE.Color();
  const shared = {
    uSurfaceTime: { get value() { return SETTINGS.reduceMotion ? 0 : world.time || 0; } },
    uSurfaceRain: { get value() { return Math.min(1, world.rainLevel || 0); } },
    uSurfaceNoise: { value: macroTex() },
    uSurfaceSky: { get value() { return sky.copy(world.hemi.color).multiplyScalar(Math.max(0.2, Math.min(1.15, world.hemi.intensity / 0.42))); } },
    uSurfaceHorizon: { value: world.scene.fog?.color || new THREE.Color(0x9aa8ab) },
    uSurfaceSun: { get value() { const s = world.sun; return s ? sunDir.subVectors(s.position, s.target.position).normalize() : sunDir; } },
    uSurfaceSunCol: { get value() { const s = world.sun; return s ? sunCol.copy(s.color).multiplyScalar(Math.min(3, s.intensity)) : sunCol.setRGB(0, 0, 0); } },
  };
  const head = `uniform sampler2D uSurfaceNoise; uniform float uSurfaceTime, uSurfaceRain;
    uniform vec3 uSurfaceSky, uSurfaceHorizon, uSurfaceSun, uSurfaceSunCol;
    varying float vSurfaceAcross; varying vec3 vSurfaceWorld; varying vec2 vSurfaceFlow; varying vec2 vSurfaceDepth;
    vec2 sfGrad(vec2 q) {
      float h0 = texture2D(uSurfaceNoise, q).r;
      return vec2(texture2D(uSurfaceNoise, q + vec2(0.006, 0.0)).r - h0, texture2D(uSurfaceNoise, q + vec2(0.0, 0.006)).r - h0) / 0.006;
    }\n`;
  const windFlow = `normalize(vec2(${WIND_STATE.dirX.toFixed(3)}, ${WIND_STATE.dirZ.toFixed(3)}))`;
  const vertex = (sh, flow) => {
    const decl = flow && !/attribute\s+vec2\s+waterFlow/.test(sh.vertexShader) ? 'attribute vec2 waterFlow;\n' : '';
    sh.vertexShader = decl + 'attribute float waterAcross; attribute vec2 waterDepth2; varying float vSurfaceAcross; varying vec3 vSurfaceWorld; varying vec2 vSurfaceFlow; varying vec2 vSurfaceDepth;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSurfaceAcross = waterAcross; vSurfaceDepth = waterDepth2; vSurfaceFlow = ${flow ? 'waterFlow' : 'vec2(0.0, 1.0)'};
        vSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
  };
  world.scene.traverse((mesh) => {
    const base = mesh.material, geo = mesh.geometry;
    if (!mesh.isMesh || mesh.isInstancedMesh || !base?.isMaterial || !geo?.attributes.position) return;
    const key = base.customProgramCacheKey();
    const ripple = key.startsWith('ripple|');
    const bigPlane = geo.type === 'PlaneGeometry' && geo.parameters.width === 2000 && geo.parameters.height === 2000;
    // 戦の側で岸と浅瀬まで仕上げた水面（と海の一枚）は、色と分割はそのまま、上に波・映り込み・照り・雨の波紋だけを重ねる。
    const ready = !!mesh.userData?.waterSurfaceReady;
    // 遠景の地面の大きい板（城攻めの戦）を拾わない。海の材質の鍵で見分ける。
    const overlaySea = bigPlane && !base.isMeshBasicMaterial && !ripple && /water|sea/i.test(key);
    if (ready || overlaySea) {
      if (base.userData.surfaceOverlay) return;
      const stream = !!geo.attributes.waterFlow;
      if (!geo.attributes.waterAcross) geo.setAttribute('waterAcross', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      // 戦が仕上げた川は頂点の実の深さ、海の一枚は深い水。
      geo.setAttribute('waterDepth2', overlaySea ? flatDepth(geo.attributes.position.count, 4, 4) : depthAttr(world, mesh, geo, 1));
      const compile = base.onBeforeCompile, oldKey = base.customProgramCacheKey;
      base.userData.surfaceOverlay = true;
      base.extensions ??= {};
      base.customProgramCacheKey = () => oldKey.call(base) + '|surfaceOverlay4';
      base.onBeforeCompile = (sh, renderer) => {
        if (compile) compile.call(base, sh, renderer);
        Object.assign(sh.uniforms, shared);
        vertex(sh, stream);
        const ovFlow = stream ? 'normalize(vSurfaceFlow + vec2(0.00001))' : windFlow;
        sh.fragmentShader = head + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          (overlaySea ? 'float sfFoamW = 0.0;' : surfaceBodyGLSL(ovFlow, { ...RIVER_BODY, mix: 0.7 })) + '\n#include <emissivemap_fragment>').replace('#include <opaque_fragment>',
          surfaceNormalGLSL(stream ? 'normalize(vSurfaceFlow + vec2(0.00001))' : windFlow, stream ? 1 : 0.3, stream ? 0.8 : 0.6) +
          surfaceLightGLSL({ shore: stream, gain: 0.55, refl: overlaySea ? 0.35 : 0.6, cap: false, glint: overlaySea ? 0.12 : 0.2 }) + '\n#include <opaque_fragment>');
      };
      base.needsUpdate = true;
      return;
    }
    // 海と水堀は既存の専用材質・形で識別し、旗や濡れた衣を拾わない。
    const sea = base.isMeshBasicMaterial && base.map && bigPlane;
    const moat = base.color?.getHex() === 0x2c3a36 && base.transparent && geo.attributes.uv;
    if (!ripple && !sea && !moat) return;
    const parts = key.split('|');
    const riverBanks = ripple && parts[5] === 'true', lake = ripple && parts[9] === 'true', muddy = ripple && parts[8] !== 'false';
    const stream = !!geo.attributes.waterFlow;
    // 浅い田（共通の田の水）は川の岸を持たない。
    const paddy = ripple && !stream && !riverBanks;
    const across = new Float32Array(geo.attributes.position.count);
    if (stream) {
      // 列の数は川ごとに違う（濁った川は五列）。二列と決めつけると斜めの縞になる（10/28 姉川）。
      const cross = geo.userData.waterCross, bed = geo.attributes.waterBed;
      if (cross) for (let i = 0; i < across.length; i++) across[i] = cross[i % cross.length];
      else if (bed) {
        let wmax = 0.001; for (let i = 0; i < across.length; i++) wmax = Math.max(wmax, Math.abs(bed.getY(i)));
        for (let i = 0; i < across.length; i++) across[i] = bed.getY(i) / wmax;
      } else for (let i = 0; i < across.length; i++) across[i] = i % 2 ? -1 : 1;
    } else if (moat) for (let i = 0; i < across.length; i++) across[i] = geo.attributes.uv.getY(i) * 2 - 1;
    else if (riverBanks && world.def.water) {
      const w = world.def.water, width = (w.x2 ?? w.x + 700) - w.x;
      for (let i = 0; i < across.length; i++) across[i] =
        ((geo.attributes.position.getX(i) + mesh.position.x - w.x) / width) * 2 - 1;
    }
    geo.setAttribute('waterAcross', new THREE.BufferAttribute(across, 1));
    const cols = geo.userData.waterCross?.length || 2;
    geo.setAttribute('waterDepth2', stream ? depthAttr(world, mesh, geo, cols)
      : riverBanks ? flatDepth(across.length, 0.15, 3) : flatDepth(across.length, paddy ? 0.12 : 3, paddy ? 0.12 : 3));
    // 海の等間隔の縞絵は外し、共通の波と空の反射で水面を作る。船の影は受け続ける。
    const mat = sea ? new THREE.MeshLambertMaterial({ color: 0x527d76 }) : base.clone();
    const compile = sea ? null : base.onBeforeCompile;
    // 標準材質の拡張設定は既存のものを保ち、ない時だけ用意して開戦時の例外を防ぐ。
    mat.extensions ??= {};
    mat.extensions.derivatives = true;
    mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.fog = true;
    if (mat.isMeshStandardMaterial) { mat.roughness = Math.max(0.48, mat.roughness); mat.envMapIntensity = Math.min(0.35, mat.envMapIntensity); }
    mat.customProgramCacheKey = () => key + `|surfaceWaves4|${sea}|${stream}|${paddy}`;
    const flowExpr = stream ? 'normalize(vSurfaceFlow + vec2(0.00001))' : windFlow;
    const speed = stream ? 1 : riverBanks && !lake ? 0.8 : 0.3;
    const waves = paddy ? 0.35 : moat ? 0.5 : 1.0;
    mat.onBeforeCompile = (sh, renderer) => {
      if (compile) compile.call(base, sh, renderer);
      Object.assign(sh.uniforms, shared);
      vertex(sh, stream);
      sh.fragmentShader = head + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        ${surfaceNormalGLSL(riverBanks && !lake ? 'vec2(0.0, 1.0)' : flowExpr, speed, waves)}
        // 深みは暗い緑、岸の浅い所は川床の砂と泥が透ける。
        float sfBank = smoothstep(0.5, 0.98, abs(vSurfaceAcross));
        float sfBedN = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 0.19).r;
        vec3 sfBed = vec3(0.25, 0.22, 0.15) * (0.75 + sfBedN * 0.5);
        vec3 sfLayer = mix(${muddy ? 'vec3(0.085, 0.078, 0.052)' : 'vec3(0.04, 0.085, 0.078)'}, sfBed, sfBank * ${paddy ? '0.0' : '0.8'});
        diffuseColor.rgb = mix(clamp(diffuseColor.rgb, vec3(0.025), vec3(0.23, 0.29, 0.26)), sfLayer, 0.55);
        // 浅瀬の底でゆらぐ光（水を通った日の網目の代わり）。
        float sfCaus = texture2D(uSurfaceNoise, vSurfaceWorld.xz * 0.43 + sfFlow * uSurfaceTime * 0.04).r;
        diffuseColor.rgb *= 1.0 + sfBank * (sfCaus - 0.5) * 0.4 * sfNear;
        // 岸に寄る泡は流れに沿って切れ切れに。
        float sfFoam = smoothstep(0.88, 0.995, abs(vSurfaceAcross)) *
          smoothstep(0.55, 0.78, texture2D(uSurfaceNoise, sfP * vec2(0.35, 0.09) + vec2(0.0, -sfT * 0.3)).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.40, 0.36), sfFoam * sfNear * 0.5);
      `).replace('#include <emissivemap_fragment>', (sea || paddy ? 'float sfFoamW = 0.0;' : surfaceBodyGLSL(stream ? 'normalize(vSurfaceFlow + vec2(0.00001))' : windFlow, moat ? MOAT_BODY : RIVER_BODY))
        + '\n#include <emissivemap_fragment>').replace('#include <opaque_fragment>', surfaceLightGLSL({
        shore: stream || riverBanks || moat, gain: 0.6, refl: sea ? 0.8 : 1.0, cap: true, glint: paddy ? 0.15 : 0.25, muddy,
      }) + '\n#include <opaque_fragment>');
    };
    mesh.material = mat; mesh.receiveShadow = true;
  });
  addWaterBanks(world);
}

// 細い川の両岸へ少数だけ足す。石は一回の描画、形と材質は共有。岸の濡れた土の帯も一回の描画。
function addWaterBanks(world) {
  const banks = [];
  const wetPos = [], wetCol = [], wetIdx = [];
  for (const st of world.def.streams || []) {
    if (!st.mesh?.geometry.attributes.waterFlow || st.mesh.userData?.waterSurfaceReady) continue;
    if (st.pts && st.w) addWetBank(world, st, wetPos, wetCol, wetIdx);
    if (st.w > 12) continue;
    const p = st.mesh.geometry.attributes.position;
    const cols = st.mesh.geometry.userData.waterCross?.length || 2;
    const rows = Math.floor(p.count / cols);
    const step = Math.max(1, Math.ceil(rows / 48));
    for (let row = 0; row < rows && banks.length < 64; row += step) {
      const a = row * cols, b = a + cols - 1;
      const dx = p.getX(a) - p.getX(b), dz = p.getZ(a) - p.getZ(b), len = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) {
        const i = side > 0 ? a : b;
        const x = p.getX(i) + st.mesh.position.x + dx / len * side * 0.65;
        const z = p.getZ(i) + st.mesh.position.z + dz / len * side * 0.65;
        if (Math.abs(x) > world.half - 2 || Math.abs(z) > world.half - 2 || world.waterDepthAt(x, z) > 0.15) continue;
        banks.push([x, world.heightAt(x, z), z]);
      }
    }
  }
  if (wetIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wetPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wetCol, 4));
    g.setIndex(wetIdx); g.computeVertexNormals();
    const wet = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    wet.receiveShadow = true; wet.renderOrder = 1; wet.name = 'wetBank';
    world.scene.add(wet);
  }
  if (!banks.length) return;
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x68695b }), banks.length);
  const pose = new THREE.Object3D();
  for (let i = 0; i < banks.length; i++) {
    const [x, y, z] = banks[i], size = 0.25 + (Math.sin(i * 7.1) + 1) * 0.14;
    pose.position.set(x, y + size * 0.2, z); pose.rotation.set(0, i * 2.4, 0); pose.scale.set(size * 1.3, size * 0.55, size);
    pose.updateMatrix(); stones.setMatrixAt(i, pose.matrix);
  }
  stones.castShadow = stones.receiveShadow = true;
  world.scene.add(stones);   // 10/24：草は作らない
}

// 水際から外へ二歩ほど、濡れて暗い土の帯。水の中の部分は水面に隠れる。縁は揺らして直線にしない。
function addWetBank(world, st, pos, col, idx) {
  const pts = st.pts, offs = [0.7, 1.0, 1.0, 1.0], alpha = [0.62, 0.55, 0.3, 0];
  const add = [0, 0.25, 1.1, 2.4];
  for (const side of [1, -1]) {
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.001) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, steps = Math.ceil(L / 2.5);
      for (let k = n ? 1 : 0; k <= steps; k++) {
        const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const wob = Math.sin(x * 0.37 + z * 0.21) * 0.45 + Math.sin(x * 0.11 - z * 0.53) * 0.35;
        const base = pos.length / 3;
        for (let c = 0; c < 4; c++) {
          const d = st.w * offs[c] + add[c] * (1 + wob * (c > 1 ? 0.6 : 0.2));
          const px = x + nx * d * side, pz = z + nz * d * side;
          pos.push(px, world.heightAt(px, pz) + 0.04, pz);
          col.push(0.2, 0.17, 0.12, alpha[c] * (c ? 0.85 + wob * 0.15 : 1));
        }
        if (n > 0) for (let c = 0; c < 3; c++) {
          const a = base - 4 + c, b = base + c;
          if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        n++;
      }
    }
  }
}

// 川を出た後も濡れた衣がゆっくり乾く。材質は三段階を兵どうしで共有する。
const materials = new WeakMap();
const batchKeys = new WeakMap();

// 元の材質への参照は JSON 化しない。複製後にも本物の材質を引き継ぐ。
export function cloneWaterMaterial(base) {
  if (!base?.isMaterial || typeof base.clone !== 'function') return base;
  const mat = base.clone();
  const source = base.userData?.waterSource;
  if (source) Object.defineProperty(mat.userData, 'waterSource', { value: source, configurable: true });
  return mat;
}

export function refreshWaterMaterials(base) {
  const levels = materials.get(base);
  if (levels) for (const mat of levels) if (mat) mat.needsUpdate = true;
}

export function waterMaterial(base, level) {
  if (!level || !base?.isMaterial || typeof base.clone !== 'function') return base;
  let levels = materials.get(base);
  if (!levels) { levels = []; materials.set(base, levels); }
  if (levels[level]) return levels[level];
  const mat = base.clone();
  mat.defines = base.defines;
  Object.defineProperty(mat.userData, 'waterSource', { value: base, configurable: true });
  mat.userData.waterLevel = level;
  // 濡れの段は uWet の値だけで、絵の仕組み（シェーダ）の中身は元と同じ。元と同じ鍵にして、川へ入るたびに新しく作らない（戦の途中で一つ作ると数十 ms 固まる）
  mat.customProgramCacheKey = () => base.customProgramCacheKey();
  mat.onBeforeCompile = (sh, renderer) => {
    base.onBeforeCompile(sh, renderer);
    if (sh.uniforms.uWet) {
      const rain = sh.uniforms.uWet;
      sh.uniforms.uWet = { get value() { return Math.max(rain.value, level * 0.3); } };
    }
  };
  levels[level] = mat;
  return mat;
}

export function waterBatchKey(geo, mat) {
  if (!mat?.isMaterial || !mat.userData?.waterLevel || !geo || typeof geo !== 'object') return geo;
  let keys = batchKeys.get(mat);
  if (!keys) { keys = new WeakMap(); batchKeys.set(mat, keys); }
  let key = keys.get(geo);
  if (!key) { key = {}; keys.set(geo, key); }
  return key;
}

export function updateWaterBody(u, world, dt) {
  prepareWaterSurface(world);
  // 援軍も含め十組へ散らす。全兵の水深・地面・濡れた材質を半秒ごとに一斉に調べない。
  // 初回と遅いコマも実際の経過だけ乾かし、次回までの端数を保つ。
  if (u.waterBodyT == null) u.waterBodyT = ((u.id % 10 + 10) % 10 + 1) * 0.05;
  u.waterBodyT -= dt;
  u.waterBodyElapsed = (u.waterBodyElapsed || 0) + dt;
  if (u.waterBodyT > 1e-9 || !u.mesh) return;
  const elapsed = u.waterBodyElapsed;
  u.waterBodyElapsed = 0;
  u.waterBodyT = 0.5 - Math.max(0, -u.waterBodyT) % 0.5;
  // 屋内・橋・櫓の床の上は、下を流れる川で濡らさない。
  const water = u.naka ? 0 : world.waterDepthAt(u.pos.x, u.pos.z);
  const depth = water > 0.02 ? Math.max(0, world.heightAt(u.pos.x, u.pos.z) + water - u.pos.y) : 0;
  const soaking = u.mounted ? Math.max(0, depth - 0.5) : depth;
  u.waterBody = Math.max(Math.min(0.9, soaking * 1.6), (u.waterBody || 0) - elapsed * 0.008);
  const level = Math.min(3, Math.ceil(u.waterBody / 0.3));
  if (level === (u.waterBodyLevel || 0)) return;
  u.waterBodyLevel = level;
  u.mesh.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material) return;
    // 複数の材質を持つ具足も濡らす。配列は濡れの段が変わる時だけ作る。
    const wet = (mat) => {
      if (!mat) return mat;
      const base = mat.userData?.waterSource || mat;
      // 影・火縄の火・旗の透け具合は変えない。
      return base.isMeshBasicMaterial || base.isShaderMaterial ? base : waterMaterial(base, level);
    };
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(wet);
    else mesh.material = wet(mesh.material);
  });
}
