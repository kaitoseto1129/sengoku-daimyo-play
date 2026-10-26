// 人の処理：遠い兵。外部向けの入口は humans.js。
import * as THREE from 'three';
import { UNIT_MAT } from './units.js';
import { GRIME } from './humans_materials.js';
import { PEOPLE_DET, PEOPLE_GLSL, peopleDetail } from './people_tex.js';

// 近くの兵の具足と着物：兵の材質（UNIT_MAT）に、一人ずつの使い込みを足す（四通り。材質は四つまで）
//   着物：日焼けの褪せ（肩ほど白っぽく）・汗じみ・裾の泥はね。漆：角の擦れと掻き傷、剥げ。陣笠：縁の欠けと雨じみ。どれも近くの兵だけ（遠くは元の材質のまま）
const CROWD_V = [[0.15, 0.45, 0.3, 1.7], [0.7, 0.95, 0.6, 4.3], [0.35, 1.35, 0.9, 7.1], [1.0, 0.7, 0.45, 2.9]];
const crowdMats = [];
// 汚れの斑の格子を一度だけ焼く。隣の奥行きを緑へ詰め、四種の材質・全員で約74KBを共用する。
// 奥行き32枚を横に並べ、各面の周囲一画素も巻き戻して線形補間の継ぎ目を防ぐ。
let crowdNoiseTex = null;
function crowdNoiseTexture() {
  if (crowdNoiseTex) return crowdNoiseTex;
  const width = 34 * 32, data = new Uint8Array(width * 34 * 2);
  const fract = (x) => x - Math.floor(x);
  for (let z = 0; z < 32; z++) for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) {
    const a = fract(((x + 31) % 32) * 0.3183099 + 0.1) * 17;
    const b = fract(((y + 31) % 32) * 0.3183099 + 0.1) * 17;
    for (let layer = 0; layer < 2; layer++) {
      const c = fract(((z + layer) % 32) * 0.3183099 + 0.1) * 17;
      data[(y * width + z * 34 + x) * 2 + layer] = Math.round(fract(a * b * c * (a + b + c)) * 255);
    }
  }
  crowdNoiseTex = new THREE.DataTexture(data, width, 34, THREE.RGFormat);
  crowdNoiseTex.minFilter = crowdNoiseTex.magFilter = THREE.LinearFilter;
  crowdNoiseTex.generateMipmaps = false; crowdNoiseTex.needsUpdate = true;
  return crowdNoiseTex;
}
const CROWD_NOISE_GLSL = `
uniform sampler2D uCrowdNoise;
float crowdNoise(vec3 p) {
  vec3 q = mod(p, 32.0), i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + f.xy + 1.5) / vec2(1088.0, 34.0);
  vec2 layers = texture2D(uCrowdNoise, uv + vec2(i.z * 34.0 / 1088.0, 0.0)).rg;
  return mix(layers.r, layers.g, f.z);
}
`;
// 追加の表面処理は近い120人まで。十五メートル以内は端末によらず保つ。
const CROWD_DETAIL_MAX = 120;
const CROWD_DETAIL_NEAR = 17;
function nearCrowdMat(v) {
  // 細部の上乗せは兵の材質が MeshStandard（光を細かく計算する作り）の時だけ組める（mkA・vObjP・roughnessFactor を使う）。
  //   既定の「光を軽く」（simpleMaterials＝Phong）では上乗せの絵の作りが組めず、近くの兵の具足が描かれなかった（10/26）。その時は兵の材質のまま
  if (!UNIT_MAT.isMeshStandardMaterial) return UNIT_MAT;
  if (crowdMats[v]) return crowdMats[v];
  const m = UNIT_MAT.clone();
  if (true) m.defines = { ...m.defines, NEAR_85: 1 };
  const ob = UNIT_MAT.onBeforeCompile, CV = { value: new THREE.Vector4(...CROWD_V[v]) };
  const noise = { value: crowdNoiseTexture() };
  m.onBeforeCompile = (sh, r) => {
    ob.call(UNIT_MAT, sh, r);
    sh.uniforms.uCV = CV; sh.uniforms.uGrimeC = GRIME; sh.uniforms.uCrowdNoise = noise;
    // 兵の漆は使い込んだ鈍い照り（新しい樹脂のように光らせない）。雨でも艶は少しだけ増す
    sh.fragmentShader = sh.fragmentShader.replace('float roughnessFactor = mix(mkRough(mkA), mkRough(mkB), txA.r);', `float roughnessFactor = mix(mkA == 1 ? ${'0.22'} : mkRough(mkA), mkB == 1 ? ${'0.22'} : mkRough(mkB), txA.r);`)
      .replace('roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : 0.4);', 'roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : mkA == 1 ? 0.22 : 0.4);')
      .replace('roughnessFactor = mix(0.3 * (1.0 - uWet * 0.4), 0.78, clamp(worn, 0.0, 1.0));', `roughnessFactor = mix(${'0.18'} * (1.0 - uWet * 0.22), 0.82, clamp(worn, 0.0, 1.0));`);
    peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
    sh.vertexShader = 'varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vObjN = objectNormal;');
    sh.fragmentShader = 'uniform vec4 uCV;\nuniform float uGrimeC;\nuniform sampler2D uPD;\nvarying vec3 vObjN;\nfloat pdH, pdR, pdMud, pdWear, pdCavity, pdCord;\n' + PEOPLE_GLSL + sh.fragmentShader.replace('diffuseColor.rgb *= baseC;', `diffuseColor.rgb *= baseC;
      {
        // 写真の模様の細かな凹凸と色むら：布は麻の織り目、威糸は組紐の目、漆は細かな擦れで照りを斑に（近くの兵だけ）
        int mkD = txA.r > 0.5 ? mkB : mkA;
        vec3 pdT = pdTri(uPD, vObjP * 14.0, vObjN);
        pdH = 0.0; pdR = 0.0; pdMud = 0.0; pdWear = 0.0; pdCavity = 0.0;
        // 布と縅を区別する。佩楯のように二色の並びが逆の部品も含める。
        pdCord = mkD == 0 && (mkA == 1 || mkB == 1 || mkA == 3 || mkB == 3) ? 1.0 : 0.0;
        // 札の重なり・鋲の根元は空の光が届きにくい。既存の絵の谷を使い、直射光の照りは残す。
        if (mkD == 1 || mkD == 3) pdCavity = 1.0 - smoothstep(0.28, 0.7, txA.g);
        if (mkD == 0 || mkD == 6) {
          float d = mix(pdT.g, pdT.b, pdCord);
          pdH = d - 0.5;
          pdR = pdH * mix(0.12, 0.28, pdCord);
          diffuseColor.rgb *= 1.0 + pdH * mix(0.35, 0.5, pdCord);
        } else if (mkD == 1) {
          // 同じ読み取りを漆の粒子・照り・擦れに共用し、三方向の追加読み取りを省く。
          float d = pdT.g;
          pdR = (d - 0.5) * 0.42;
          pdH = (pdT.r - 0.5) * 0.25;
          diffuseColor.rgb *= 1.0 + (d - 0.5) * 0.24;
        } else if (mkD == 2) {
          // 一体の軽い顔にも肌理を残す。実写の顔を増やさず、既存の読み取りを使う。
          pdH = (pdT.r - 0.5) * 0.22;
          pdR = (pdT.r - 0.5) * 0.12;
        } else if (mkD == 3 || mkD == 4) {
          // 鉄の磨き跡とざらつき。既に読んだ絵を照りと凹凸にも使う。
          pdR = (pdT.r - 0.5) * 0.35;
          pdH = (pdT.g - 0.5) * 0.45;
        }
      }
      {
        vec3 q = vObjP + vec3(uCV.w, uCV.w * 0.6, 0.0);
        float n1 = uVn(q * 7.0), n2 = uVn(q * 31.0 + 3.0), n3 = uVn(q * 120.0 + 9.0);
        int wornKind = txA.r > 0.5 ? mkB : mkA;
        // 脛の鉄と袴にも同じ泥を乗せ、色だけ汚れて照りが新品のまま残るのを防ぐ。
        if (wornKind == 0 || wornKind == 6 || wornKind == 1 || wornKind == 3) {
          pdMud = (1.0 - smoothstep(0.15, 1.1, vObjP.y)) * smoothstep(0.4, 0.76, n1)
            * clamp(0.2 + uGrimeC * 0.8 + uWet * 0.3, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.052, 0.032), pdMud * 0.65);
        }
        if (wornKind == 1 || wornKind == 3) {
          // 打ち出した鉄板の浅い歪み。汚れに使う二つの斑を再利用し、均一な照りを崩す。
          // 漆の下の形なので色は変えず、法線だけを一ミリほど揺らす。泥の厚い所には出さない。
          pdH += ((n1 - 0.5) * 0.9 + (n2 - 0.5) * 0.3) * (1.0 - dd);
          pdR += (n2 - 0.5) * 0.12;
        }
        if (wornKind == 0 || wornKind == 6) {
          // 着物：肩と背の日焼けの褪せ・脇と背の汗じみ・裾から上への泥はね
          float sun = smoothstep(1.1, 1.55, vObjP.y) * uCV.x;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.2 + 0.025, sun * 0.45);
          float sweat = smoothstep(0.55, 0.85, n1) * smoothstep(0.95, 1.2, vObjP.y) * smoothstep(1.5, 1.3, vObjP.y);
          diffuseColor.rgb *= 1.0 - sweat * (0.15 + 0.2 * uGrimeC);
          float spl = smoothstep(0.76, 0.9, n3) * smoothstep(0.95, 0.1, vObjP.y) + smoothstep(0.62, 0.05, vObjP.y) * (0.35 + 0.55 * n1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.062, 0.043), clamp(spl * uCV.y * (0.6 + 0.6 * uGrimeC), 0.0, 1.0) * 0.82);
        } else if (wornKind == 1) {
          // 漆：擦れて下地の茶が覗く斑と、細い掻き傷
          float chip = smoothstep(0.78, 0.92, n2 * 0.6 + n3 * 0.4) * uCV.z;
          // 同じ斑を照りにも使い、残った漆・擦れた下地・泥の違いを残す。
          pdWear = clamp(chip + smoothstep(0.42, 0.78, n2) * uCV.z * 0.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.1, 0.06), chip * 0.7);
          float scr = (1.0 - smoothstep(0.0, 0.05, abs(fract(dot(q.xy, vec2(0.6, 0.8)) * 14.0 + n1) - 0.5))) * smoothstep(0.65, 0.8, n1) * uCV.z;
          scr *= 1.0 - smoothstep(0.4, 1.2, fwidth(q.y) * 70.0);
          // 傷を色だけの線にせず、同じ跡で漆の艶と表面の凹凸も崩す。
          pdWear = max(pdWear, scr);
          pdH -= scr * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.3, 0.22), scr * 0.6);
          // 陣笠・兜の上の雨じみ（白く乾いた水の跡）
          diffuseColor.rgb += vec3(0.03, 0.028, 0.025) * smoothstep(0.03, 0.0, abs(n1 - 0.55)) * smoothstep(1.6, 1.8, vObjP.y);
        }
        // 人ごとの色の寄り（同じ家の同じ具足でも、染めと漆の色が少しずつ違う）
        diffuseColor.rgb *= vec3(1.0 + (fract(uCV.w * 3.7) - 0.5) * 0.18, 1.0, 1.0 - (fract(uCV.w * 3.7) - 0.5) * 0.14);
      }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float fwD = max(length(dFdx(vObjP)), length(dFdy(vObjP))) * 112.0;
        // 高画質で織り目が数画素ある距離まで残し、遠くでは滑らかに消す。
        float kD = 1.0 - smoothstep(0.8, 3.0, fwD);
        float surfaceHeight = pdH * 0.0025 * kD;
        vec2 surfaceSlope = vec2(dFdx(surfaceHeight), dFdy(surfaceHeight));
        // 糸・擦れ・小札の段を同じ高さへ束ね、法線の微分と正規化は一度で済ませる。
        if (mkA == 1 || mkB == 1 || mkA == 3 || mkB == 3) {
          float plateHeight = txA.g * 0.009;
          // 重なった小札の谷に薄い陰を残す。曇天でも板と縅を一枚の面にしない。
          diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.2, 0.65, txA.g));
          surfaceSlope += vec2(dFdx(plateHeight), dFdy(plateHeight))
            * (1.0 - smoothstep(0.6, 1.4, fwidth(vObjP.y) * 120.0));
        }
        vec3 surfaceX = dFdx(-vViewPosition), surfaceY = dFdy(-vViewPosition);
        vec3 surfaceR1 = cross(surfaceY, normal), surfaceR2 = cross(normal, surfaceX);
        float surfaceDet = dot(surfaceX, surfaceR1) * faceDirection;
        normal = normalize(abs(surfaceDet) * normal - sign(surfaceDet)
          * (surfaceSlope.x * surfaceR1 + surfaceSlope.y * surfaceR2));
        roughnessFactor = clamp(roughnessFactor + pdR * kD + pdH * 0.15, 0.08, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.82, pdWear * 0.65);
        roughnessFactor = mix(roughnessFactor, mix(0.94, 0.64, uWet), pdMud);
        metalnessFactor *= 1.0 - pdMud;
        int finishKind = txA.r > 0.5 ? mkB : mkA;
        // 布は光を散らし、漆は擦れた所ほど鈍く、鉄には磨きの照りを残す。
        if (finishKind == 0 || finishKind == 6) {
          // 麻は艶消し、組紐は丸い糸の面だけ柔らかく照る。濡れても金属にはしない。
          roughnessFactor = mix(mix(0.94, 0.78, uWet), mix(0.72, 0.56, uWet), pdCord) + pdR * kD;
          metalnessFactor = 0.0;
        } else if (finishKind == 2) {
          // 肌には布のざらつきも鉄の照りも持ち込まない。既存の顔の陰影を保つ。
          roughnessFactor = clamp(0.62 + (txA.g - 0.5) * 0.12 - uWet * 0.08, 0.48, 0.7);
          metalnessFactor = 0.0;
        } else if (finishKind == 1) {
          // 漆の照りは残し、使い込んだ板の曇りを雨の鏡面から分ける。
          roughnessFactor = mix(clamp(0.32 + pdR * kD + (uCV.x - 0.5) * 0.1 - uWet * .14, .18, .52), .78, pdWear);
          metalnessFactor = 0.0;
        } else if (finishKind == 3 || finishKind == 4) {
          // 鉄の磨きと曇りを布・漆から分ける。既存の汚れと四種の材質を共用する。
          roughnessFactor = mix(clamp(${'0.24'} + pdR * kD + uCV.z * 0.14, ${'0.24'}, 0.72), 0.94, pdMud);
          float polished = smoothstep(0.46, 0.82, txA.g) * (1.0 - pdMud);
          roughnessFactor = mix(roughnessFactor, finishKind == 4 ? 0.24 : 0.32, polished);
          metalnessFactor *= 1.0 - pdWear * 0.35;
        }
        roughnessFactor = mix(roughnessFactor, mix(0.94, 0.64, uWet), pdMud);
      }`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      // 谷の間接光だけを抑える。照りと陰が同じ位置に揃い、板・縅・鋲を読み取りやすくする。
      // 画素より細かい溝は弱め、遠くで黒い線がちらつくのを避ける。
      float plateDetail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
      float plateAO = 1.0 - pdCavity * plateDetail * 0.72;
      // 本流の谷と下面の陰を保ち、具足の接触部は材質に合わせて締める。
      int cavityKind = txA.r > 0.5 ? mkB : mkA;
      // 世界の上向き成分だけを求める。回転行列なのでベクトル全体の変換・正規化は不要。
      float skyUp = dot(normal, viewMatrix[1].xyz);
      float underAO = mix(cavityKind == 1 || cavityKind == 3 ? 0.58 : 0.68, 1.0,
        smoothstep(-0.65, 0.3, skyUp));
      // 谷と下面の陰を束ね、間接光には一度だけ掛ける。
      plateAO *= underAO;
      // 一体の顔：顎・鼻・眉の下面に届く空の光を抑え、頬と鼻筋の向きを読む。
      // 直射光は通常の照明に任せ、肌の色へ黒い影を描き込まない。
      if (cavityKind == 2) {
        plateAO *= mix(0.55, 1.0, smoothstep(-0.5, 0.65, skyUp));
      }
      reflectedLight.indirectDiffuse *= plateAO;
      // 雨空の照りは泥の無い漆の面だけへ戻す。威糸と鉄の陰は従来どおり。
      float rainLacquer = cavityKind == 1 ? uWet * (1.0 - pdMud) * (1.0 - pdWear) : 0.0;
      reflectedLight.indirectSpecular *= plateAO * (1.0 + rainLacquer * 0.7);
      `);
    // 八隅の乱数を毎画素で作らず、一回の読み取りで二層を得る。元の関数定義は残す。
    sh.fragmentShader = CROWD_NOISE_GLSL + sh.fragmentShader.replace(/uVn\(/g, 'crowdNoise(')
      .replace('float crowdNoise(vec3 x)', 'float uVn(vec3 x)');
  };
  m.customProgramCacheKey = () => 'nearcrowd-finish7';
  crowdMats[v] = m;
  return m;
}

export { crowdMats, CROWD_DETAIL_MAX, CROWD_DETAIL_NEAR, nearCrowdMat };
