import * as THREE from 'three';
import { WIND, GUST, WIND_DIR, WEAR, WEAR_HALF } from './world_weather.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
        vec2 wpos = (modelMatrix * instanceMatrix[3]).xz;
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
      vec3 swayOff = vec3(uWindDir.x, 0.0, uWindDir.y) * (0.35 + 0.65 * min(gw, 1.6)) * min(gw, 1.6) * ${(amp * 1.1).toFixed(3)} * k;
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
// 遠くの樹冠に丸い葉の塊の陰影を付ける：日の側は明るく、裏と下は暗い。葉の房ごとの濃淡と株ごとの色の揺らぎ。
// 枝房でも一枚の絵でも、株の中心からの向きで陰を決める（霞の中で切り絵・平らな影絵に見えないように）。
// 近くの木は本当の光と影のまま。25〜45m で溶かし込む。形・描く回数・毎コマの処理は増やさない。
function crownShade(sh) {
  sh.vertexShader = 'varying vec4 vCrown; varying float vCrownK;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
    vCrown = vec4(0.0); vCrownK = 0.0;
    #ifdef USE_INSTANCING
      mat4 crW = modelMatrix * instanceMatrix;
      float crS = max(length(crW[1].xyz), 0.01);
      vCrown.xyz = ((crW * vec4(transformed, 1.0)).xyz - crW[3].xyz - vec3(0.0, 6.0 * crS, 0.0)) / crS;
      vCrown.w = fract(sin(dot(crW[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
      vCrownK = uv.x >= 0.0 ? smoothstep(25.0, 45.0, distance(cameraPosition, crW[3].xyz)) : 0.0;
    #endif`);
  sh.fragmentShader = 'varying vec4 vCrown; varying float vCrownK;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    if (vCrownK > 0.0) {
      vec3 crN = normalize((viewMatrix * vec4(normalize(vCrown.xyz * vec3(1.0, 1.4, 1.0) + vec3(0.0, 0.6, 0.0)), 0.0)).xyz);
      float crSun = 0.55;
      #if NUM_DIR_LIGHTS > 0
        crSun = dot(crN, directionalLights[0].direction) * 0.5 + 0.5;
      #endif
      vec2 crp = vec2(vCrown.x + vCrown.z, vCrown.y * 1.3) * 0.75 + vCrown.w * 17.0, cri = floor(crp), crf = fract(crp);
      crf = crf * crf * (3.0 - 2.0 * crf);
      float crA = fract(sin(dot(cri, vec2(127.1, 311.7))) * 43758.5453), crB = fract(sin(dot(cri + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
      float crC = fract(sin(dot(cri + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), crD = fract(sin(dot(cri + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      float crClump = mix(mix(crA, crB, crf.x), mix(crC, crD, crf.x), crf.y);
      float crK = mix(0.42, 1.25, crSun) * mix(0.6, 1.1, crClump) * mix(0.62, 1.0, smoothstep(-4.0, 1.0, vCrown.y));
      vec3 crTint = mix(vec3(0.94, 1.0, 0.86), vec3(1.04, 1.0, 1.08), vCrown.w);
      diffuseColor.rgb *= mix(vec3(1.0), crK * crTint, vCrownK);
    }`);
}
function leafLit(sh) {
  treeLeafMap(sh);
  keepAlpha(sh);
  crownShade(sh);
  // カメラのすぐ前の葉は抜く（木の脇を通ると、葉の板が画面いっぱいの黒い影になっていた。10/2 森部の開戦）
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(1.5, 4.5, length(vViewPosition));\n#include <alphatest_fragment>');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    #if NUM_DIR_LIGHTS > 0
      float lback = pow(max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0), 4.0);
      // 影を受けた光だけを葉の裏へ回す。日陰にも直射色を足すと白い板になる。
      reflectedLight.directDiffuse *= 1.0 + lback * 0.16;
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
        // 株ごとに絵を左右に返す（同じ一枚の木が並んで見えないように）
        float tFlip = fract(sin(dot(treeWorld[3].xz, vec2(41.3, 17.9))) * 9131.7) > 0.5 ? -1.0 : 1.0;
        transformed.xz = vec2(facing.y, -facing.x) * position.x * tFlip;
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
  sh.vertexShader = '#ifdef TUFT_LAYERS\nattribute float bladeLayer;\n#endif\n' + sh.vertexShader;
  sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>', `
    #ifdef TUFT_LAYERS
      // 葉の途中で切り替えると三角形が画面を横切る。株の根元で全頂点をそろえる。
      vec3 tuftRoot = (modelViewMatrix * instanceMatrix[3]).xyz;
      if(bladeLayer > 1.5 && dot(tuftRoot, tuftRoot) > 576.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #endif
    #include <logdepthbuf_vertex>`);
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
      diffuseColor.rgb *= mix(${dryTips ? '0.42' : '0.72'}, 1.0, smoothstep(0.0, 0.5, gy));
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
      reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * back * tipK * 0.1;
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


export { liteMat, scaleTreePart, treeCards, treeLeafMap, keepAlpha, sway, leafLit, farTreeLit, nearTreeLit, treeTriangles, treeTextureKind, treeCardDepth, grassLit, grassAlpha, riceLit };
