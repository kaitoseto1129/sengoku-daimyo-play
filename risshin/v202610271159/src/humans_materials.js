// 人の処理：体の材質。外部向けの入口は humans.js。
import * as THREE from 'three';
import { S } from './settings.js';
import { UNIT_GRIME, unitContour, UNIT_CLOTH_W } from './units_model.js';
import { UNIT_MAT } from './units.js';
import { SRC } from './humans_shared.js';
import { PEOPLE_DET, PEOPLE_GLSL, peopleDetail } from './people_tex.js';
import { WET } from './world.js';
import { foreAxes } from './humans_hands.js';


// 体の材質：部位ごとに色（着物・袴・肌・足袋）。元の絵は明るさ（しわ）だけ使う。頭は描かない
const bodyMats = new Map();
// 風（x, z：向き、z の所は強さ、w：時）。毎コマ updateHumans で WIND_STATE から写す
const CLOTH_W = UNIT_CLOTH_W;   // 兵の材質（鉢巻の垂れ）と同じ風
// 戦が進むほどの汚れ（0..1。戦の時間から）
const GRIME = UNIT_GRIME;
// 本人の腕の材質：兵の材質と同じ描き方で、一人称（FP_ARM が 1）の時は籠手の絵（鎖）の所だけ 1.5 倍細かく繰り返す
const FP_ARM = { value: 0 };
let fpArmM = null;
function fpArmMat() {
  if (fpArmM) return fpArmM;
  const m = UNIT_MAT.clone();
  const img = UNIT_MAT.map && UNIT_MAT.map.image, AW = (img && img.width) || 2048, AH = (img && img.height) || 1024;
  // 籠手の絵の場所（units.js の REG.kote＝[256, 512, 256, 256] の画素）を UV へ（絵は上下を返して貼られる）
  const u0 = 256 / AW, du = 256 / AW, v0 = 1 - 768 / AH, dv = 256 / AH;
  m.onBeforeCompile = (sh, r) => {
    UNIT_MAT.onBeforeCompile(sh, r);
    sh.uniforms.uFpArm = FP_ARM;
    const fn = `uniform float uFpArm;
      vec2 kUv(vec2 uv) {
        vec2 q = (uv - vec2(${u0.toFixed(5)}, ${v0.toFixed(5)})) / vec2(${du.toFixed(5)}, ${dv.toFixed(5)});
        if (uFpArm < 0.5 || q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return uv;
        return vec2(${u0.toFixed(5)}, ${v0.toFixed(5)}) + fract(q * 1.5) * vec2(${du.toFixed(5)}, ${dv.toFixed(5)}) * 0.98 + vec2(${(du * 0.01).toFixed(5)}, ${(dv * 0.01).toFixed(5)});
      }
      vec4 kTex(sampler2D t, vec2 uv) { return textureGrad(t, kUv(uv), dFdx(uv) * (uFpArm > 0.5 ? 1.5 : 1.0), dFdy(uv) * (uFpArm > 0.5 ? 1.5 : 1.0)); }
      `;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', fn + 'void main() {')
      .replace('texture2D(map, vMapUv)', 'kTex(map, vMapUv)')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'kTex(normalMap, vNormalMapUv)'));
  };
  m.customProgramCacheKey = () => 'fparm' + (UNIT_MAT.customProgramCacheKey ? UNIT_MAT.customProgramCacheKey() : '');
  fpArmM = m;
  return m;
}
function setFpArm(on) { FP_ARM.value = on ? 1 : 0; }
// 一人称の目の前で描かない球（xyz：目、w：半径。0 なら切らない）。player.js が描く直前に置き、描いた後に 0 へ戻す
const FP_CUT = { value: new THREE.Vector4(0, 0, 0, 0) };
function setFpCut(p, r) { if (p) FP_CUT.value.set(p.x, p.y, p.z, r); else FP_CUT.value.w = 0; }
// dm：本物の胴丸の下に着る体（手も描かない。甲冑の脇の、スキャンに写っていない所から下の着物が見える）
// nh：本人の体（手は写実の手 attachHands が描くので、体の手は描かない）。1・2 の位は、籠手を着けた右・左の前腕も描かない
//   （見本の体の前腕は今の服の太い袖で、それを覆うと籠手が太い筒になる。本人の籠手は実の太さで作り、中の体の前腕は消す）
function bodyMaterial(look, dm = false, nh = 0) {
  const cloth = look.cloth || 0x2b2622, skin = look.skin || 0xb58c68;
  const hakama = look.tier === 0 ? cloth : new THREE.Color(cloth).multiplyScalar(0.8).getHex();
  // 僧兵は体の胴と腕を描かない（体の肩の形が衣から突き出るので。胴は衣、腕は広い袖が覆う）。部位の境の三角（首と胴のつなぎ目など）も描かない
  const nt = !!look.sohei;
  // 汚れの量（units.js と同じ：身分が低いほど汚い）。材質は 0.1 刻みで分ける
  const dirt = Math.round(Math.min(1, look.dirt ?? [0.85, 0.6, 0.45, 0.3][look.tier ?? 0] ?? 0.5) * 10) / 10;
  // 褪せ方：同じ家の同じ色の着物でも、洗いざらし・日焼けの度合いが人ごとに違う（三通り。材質は三つまで）
  const fade = ((look.face | 0) + (look.vi | 0)) % 3;
  const k = cloth + '|' + skin + '|' + look.tier + '|' + dirt + '|f' + fade + (dm ? '|dm' : '') + (nt ? '|nt' : '') + (nh ? '|nh' + nh : '');
  if (bodyMats.has(k)) return bodyMats.get(k);
  const m = S.simpleMaterials
    ? new THREE.MeshPhongMaterial({ map: SRC.tex, shininess: 5, specular: 0x181818 })
    : new THREE.MeshStandardMaterial({ map: SRC.tex, normalMap: SRC.ntex, roughness: 0.92, metalness: 0 });
  // 褪せた布の色：彩度を落とし、灰茶へ寄せ、少し明るく（染めたての濃い一色にしない）
  const fc = new THREE.Color(cloth), fhsl = fc.getHSL({});
  fc.setHSL(fhsl.h, fhsl.s * [0.8, 0.62, 0.48][fade], Math.min(0.5, fhsl.l * [1.0, 1.1, 1.22][fade] + 0.01 * fade)).lerp(new THREE.Color(0x5a5044), [0.04, 0.1, 0.16][fade]);
  const clothF = fc.getHex(), hakamaF = look.tier === 0 ? clothF : fc.clone().multiplyScalar(0.8).getHex();
  const U = {
    cTorso: { value: new THREE.Color(clothF) }, cArm: { value: new THREE.Color(clothF) }, cHand: { value: new THREE.Color(skin).multiplyScalar(0.55).multiply(new THREE.Color(0.94, 0.84, 0.78)) },
    cLeg: { value: new THREE.Color(hakamaF) }, cFoot: { value: new THREE.Color(look.tier === 0 ? 0x5a5246 : 0x3a3630) }, cNeck: { value: new THREE.Color(skin) },
  };
  // 元の絵は現代の鎧（明るい板と黒い布、塗りの剥げ）なので、明るさをそのまま使うと着物に板の縁や剥げの斑が出て、人形の服に見える
  // → 絵はぼかした明るさを少しだけ使い、布の色むら・縦のしわ・擦り切れ・汗じみ・裾の泥は、体の立ち姿の座標（vBind）で描く（動いても布に貼り付いたまま）
  m.normalScale = new THREE.Vector2(0.35, 0.35);
  m.onBeforeCompile = (sh) => {
    unitContour(sh);
    peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
    Object.assign(sh.uniforms, U, { uClothW: CLOTH_W, uLoose: { value: look.tier === 0 ? 0.55 : 1.0 }, uWet: WET, uDirt: { value: dirt }, uGrime: GRIME });
    if (nh) { const F = foreAxes(); Object.assign(sh.uniforms, { uFaE: { value: F.e }, uFaD: { value: F.d }, uFaOn: { value: new THREE.Vector2(nh & 1 ? 1 : 0, nh & 2 ? 1 : 0) } }); }
    // 脚の布（袴の腿・小袖の裾）：風に押されてはためく。腰から膝へ行くほど大きく、裾の端ほど細かく波打つ。風の向きは世界の座標から体の座標へ直す
    sh.vertexShader = 'attribute float part;\nvarying float vPart;\nvarying vec3 vBind, vBN;\nuniform vec4 uClothW;\nuniform float uLoose;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPart = part; vBind = position * 0.01; vBN = objectNormal;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        {
          float hz = vBind.z;
          float loose = part > 2.5 && part < 3.5 ? smoothstep(0.95, 0.75, hz) * smoothstep(0.3, 0.55, hz) * uLoose
                      : part < 0.5 ? smoothstep(1.0, 0.8, hz) : 0.0;
          if (loose > 0.001 && uClothW.z > 0.0) {
            vec4 wo = modelMatrix * vec4(transformed, 1.0);
            float ph = uClothW.w * 7.0 + wo.x * 3.1 + wo.z * 2.3 + hz * 9.0;
            float fl = 0.55 + 0.3 * sin(ph) + 0.15 * sin(ph * 2.3 + 1.7);
            vec3 wd = vec3(uClothW.x, 0.0, uClothW.y);
            float s2 = dot(modelMatrix[0].xyz, modelMatrix[0].xyz);
            vec3 wl = (vec4(wd, 0.0) * modelMatrix).xyz / s2;
            transformed += wl * (0.018 * uClothW.z * loose * fl);
          }
        }`);
    if (S.simpleMaterials) {
      // 骨・衣の動きと、一人称で隠す部位は従来どおり。染め色と淡い明暗を残す。
      sh.fragmentShader = (nh ? 'uniform vec3 uFaE[2], uFaD[2];\nuniform vec2 uFaOn;\n' : '') + 'uniform vec3 cTorso, cArm, cHand, cLeg, cFoot, cNeck;\nuniform float uWet;\nvarying float vPart;\nvarying vec3 vBind;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          ${nh ? 'if (vPart > 0.5 && vPart < 1.5 && ((uFaOn.x > 0.5 && dot(vBind - uFaE[0], uFaD[0]) > 0.02) || (uFaOn.y > 0.5 && dot(vBind - uFaE[1], uFaD[1]) > 0.02))) discard;' : ''}
          if (vPart > 3.5${dm || nh ? ' || (vPart > 1.5 && vPart < 2.5)' : ''}${nt ? ' || vPart < 1.5 || abs(vPart - floor(vPart + 0.5)) > 0.04' : ''}) discard;
          vec3 tx = texture2D(map, vMapUv, 3.5).rgb;
          int pA = int(vPart + 0.5);
          vec3 col = pA == 0 ? cTorso : pA == 1 ? cArm : pA == 2 ? cHand : pA == 3 ? cLeg : pA == 4 ? cFoot : cNeck;
          diffuseColor.rgb = col * clamp(0.82 + (dot(tx, vec3(0.3, 0.59, 0.11)) - 0.3) * 0.35, 0.7, 1.08) * (1.0 - uWet * 0.18);`);
      return;
    }
    sh.fragmentShader = (nh ? 'uniform vec3 uFaE[2], uFaD[2];\nuniform vec2 uFaOn;\n' : '') + 'uniform vec3 cTorso, cArm, cHand, cLeg, cFoot, cNeck;\nuniform float uWet, uDirt, uGrime;\nuniform sampler2D uPD;\nvarying float vPart;\nvarying vec3 vBind, vBN;\nfloat pdC;\n' + PEOPLE_GLSL + `
float hb3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hb3(i), hb3(i + vec3(1,0,0)), f.x), mix(hb3(i + vec3(0,1,0)), hb3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hb3(i + vec3(0,0,1)), hb3(i + vec3(1,0,1)), f.x), mix(hb3(i + vec3(0,1,1)), hb3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float clothFold, clothSoil;
// 布のしわの凹凸（高さ h の画面上の変わりから法線を傾ける。three.js の bump と同じ式）
vec3 clothBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)), vSigmaY = normalize(dFdy(surf_pos.xyz));
  vSigmaX = dFdx(surf_pos.xyz); vSigmaY = dFdy(surf_pos.xyz);
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * fd;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        ${nh ? 'if (vPart > 0.5 && vPart < 1.5 && ((uFaOn.x > 0.5 && dot(vBind - uFaE[0], uFaD[0]) > 0.02) || (uFaOn.y > 0.5 && dot(vBind - uFaE[1], uFaD[1]) > 0.02))) discard;' : ''}
        if (vPart > 3.5${dm || nh ? ' || (vPart > 1.5 && vPart < 2.5)' : ''}${nt ? ' || vPart < 1.5 || abs(vPart - floor(vPart + 0.5)) > 0.04' : ''}) discard;
        // ぼかした明るさ（板の縁・剥げを消す）
        vec4 tA = texture2D(map, vMapUv, 3.5);
        float lumA = dot(tA.rgb, vec3(0.3, 0.59, 0.11));
        int pA = int(vPart + 0.5);
        vec3 cA = pA == 0 ? cTorso : pA == 1 ? cArm : pA == 2 ? cHand : pA == 3 ? cLeg : pA == 4 ? cFoot : cNeck;
        bool skinA = pA == 2 || pA > 5;
        vec3 bp = vBind;
        // 布：大きな色むら（色あせ・日焼け）、縦に流れるしわ（重さで垂れる）、細かな織りの粒
        float fade = vn3(bp * vec3(3.0, 3.0, 1.6)) * 0.6 + vn3(bp * 9.0) * 0.4;
        float fold = vn3(vec3(bp.x * 26.0, bp.y * 26.0, bp.z * 3.2));
        fold = smoothstep(0.15, 0.85, fold);
        // 膝裏と足首のたるみ：横に寄る皺（布が曲がる所に溜まる）
        float bunch = smoothstep(0.1, 0.0, abs(bp.z - 0.47)) + 0.8 * smoothstep(0.09, 0.0, abs(bp.z - 0.12));
        fold = mix(fold, 0.5 + 0.5 * sin(bp.z * 260.0 + vn3(bp * 30.0) * 5.0), clamp(bunch, 0.0, 1.0) * 0.7);
        clothFold = skinA ? 0.0 : fold;
        clothSoil = 0.0;
        float grain = vn3(bp * 180.0);
        vec3 col = cA * clamp(0.82 + (lumA - 0.3) * 0.35, 0.7, 1.08);
        // 麻の織り目と糸のむら（写真の模様）。肌は肌の模様
        pdC = skinA ? (pdTri(uPD, bp * 9.0, vBN).r - 0.5) * 0.5 : pdTri(uPD, bp * 14.0, vBN).g - 0.5;
        col *= 1.0 + pdC * 0.5;
        if (!skinA) {
          col *= 0.86 + fade * 0.26;
          col *= 0.8 + fold * 0.28;
          col *= 0.94 + grain * 0.1;
          // 色あせ：肩と背の上（日の当たる所）は白っぽく
          col = mix(col, vec3(dot(col, vec3(0.33))) * 1.25 + vec3(0.02, 0.018, 0.012), smoothstep(1.25, 1.5, bp.z) * 0.18 * fade);
          // 汗じみ：脇・背の中ほど
          float sweat = smoothstep(0.55, 0.9, vn3(bp * 5.0 + 3.0)) * smoothstep(0.95, 1.2, bp.z) * smoothstep(1.5, 1.3, bp.z);
          col *= 1.0 - sweat * (0.2 + 0.18 * uDirt + 0.15 * uGrime);
          // 汗じみの縁：乾いた塩が白く輪になる
          col += vec3(0.05, 0.048, 0.042) * smoothstep(0.03, 0.0, abs(sweat - 0.35)) * (0.5 + uGrime);
          // 裾と脛の泥（下ほど濃く、斑に）。膝の土
          float mud = smoothstep(0.55, 0.05, bp.z) * (0.45 + 0.55 * vn3(bp * vec3(14.0, 14.0, 6.0)));
          // 裾の泥はねの点々（歩くたびに跳ねた泥が乾いた跡）と、上へ滲みた筋
          float spl = smoothstep(0.78, 0.9, vn3(bp * 70.0)) * smoothstep(0.75, 0.2, bp.z);
          float drip = smoothstep(0.6, 0.85, vn3(vec3(bp.x * 40.0, bp.y * 40.0, bp.z * 2.5))) * smoothstep(0.7, 0.3, bp.z);
          // 膝の土：膝をついた跡の大きな斑（膝の高さの前後に、縁の乱れた塊）
          float knee = smoothstep(0.1, 0.02, abs(bp.z - 0.5)) * smoothstep(0.35, 0.6, vn3(bp * 11.0 + 5.0));
          mud += spl * 0.9 + drip * 0.35 + knee * 0.8;
          // 汚れの量と、戦が進むほど（uGrime）泥が上へ濃く
          mud *= 0.5 + 0.4 * uDirt + 0.35 * uGrime;
          clothSoil = clamp(mud, 0.0, 1.0);
          col = mix(col, vec3(0.085, 0.066, 0.045), clamp(mud, 0.0, 1.0) * 0.75);
          // 雨に濡れた布は暗く沈む（肩と背から先に濡れる）
          col *= 1.0 - uWet * (0.22 + 0.12 * smoothstep(0.9, 1.4, bp.z));
        } else {
          // 手と首：日焼けと汚れ、指の節の赤み
          col *= 0.9 + fade * 0.18;
          col = mix(col, col * vec3(1.12, 0.9, 0.82), vn3(bp * 40.0) * 0.35);
          col = mix(col, vec3(0.09, 0.07, 0.05), smoothstep(0.55, 0.85, vn3(bp * 30.0 + 7.0)) * 0.35);
        }
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = ((vPart > 1.5 && vPart < 2.5) || vPart > 5.5 ? 0.55 : ${'1.0'}) * (1.0 - 0.3 * uWet);
        roughnessFactor = mix(roughnessFactor, mix(0.98, 0.64, uWet), clothSoil);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 画面上の布の大きさで織り目を均す。絵の幅を掛けて近景まで消してしまわない。
        float kC = 1.0 - smoothstep(0.8, 2.2, max(fwidth(vBind.x * 14.0), max(fwidth(vBind.y * 14.0), fwidth(vBind.z * 14.0))) * 8.0);
        if (clothFold > 0.0 || pdC != 0.0) { float hB = clothFold * 0.006 + pdC * 0.0025 * kC; normal = clothBump(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)), faceDirection); }`)
      // 布は光が当たらない縁にも柔らかい光が回り（綿の毛羽立ち）、しわの谷は暗い。肌は赤い光が少し回り込む（表面下散乱の近似）
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          if ((vPart > 1.5 && vPart < 2.5) || vPart > 5.5) reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.09, 0.04, 0.03) * (1.0 - nv);
          else {
            reflectedLight.indirectDiffuse += diffuseColor.rgb * pow(1.0 - nv, 3.0) * 0.12;
            reflectedLight.directDiffuse *= 0.8 + clothFold * 0.3;
          }
        }`);
  };
  m.customProgramCacheKey = () => 'humbody' + (nh ? '-nh' : dm ? '-dm' : '') + (nt ? '-nt' : '');
  bodyMats.set(k, m);
  return m;
}

export { bodyMats, CLOTH_W, GRIME, fpArmM, fpArmMat, setFpArm, FP_CUT, setFpCut, bodyMaterial };
