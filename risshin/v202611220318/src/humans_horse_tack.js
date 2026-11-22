// 人の処理：馬具。外部向けの入口は humans.js。
import * as THREE from 'three';
import { GRIME } from './humans_materials.js';
import { WET } from './world.js';
import { HORSE_GLSL, sheenGlsl, _lin, horseMaterials, ropeMat } from './humans_horse_materials.js';
import { HR, HS, HX, HEAD_B, HORSE, SEAT_B, CHEST_B, HIP_B } from './humans_horse_model.js';
import { saddleBow, stirrupParts } from './horse_tack.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { MEM_TIGHT } from './settings.js';
const HORSE_LOD_TIGHT = 10;
const KURA_NEAR = MEM_TIGHT ? 12 : 24;
// 手綱・力革（太さ1cm ほどの紐が一頭に十二本・一本ずつ描く）は 18m より先では一画素に満たない。遠い馬は紐を描かない（11/15 クラウドし K314：天王寺で紐だけ一コマ約三百回）
// 馬の目（約3cm）と蹄鉄（約2cm）は骨入りの別の形で、一頭ごとに二回ずつ描いていた。携帯 874×402 では 12m 先で一画素に届かない（パソコンは 24m）。
//   それより遠い馬は描かない（11/17 K365：天王寺の iPhone の真似で骨入りの描く回数の約2割が馬の目と蹄鉄）
const EYE_NEAR = MEM_TIGHT ? 12 : 24;
// 鐙（約15cm）と房の絹（約20cm）は一頭ごとに四つ前後の描画で、画面の外でも描いていた（frustumCulled=false）。携帯は 24m 先で二画素ほどなので描かない（パソコンは 48m）
const TACK_SMALL_NEAR = MEM_TIGHT ? 24 : 48;
const ROPE_NEAR = 10;   // 太さ1cm の紐は10m より先では見分けが付かない（11/15 クラウドり K314：18→10）

const TACK_GLOSS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 });
const TACK_MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
// 房の絹糸：縦に垂れる細い糸の筋と、糸に沿った照り
const TACK_SILK = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
// 11/17 n-map（重さの表・手取川の一コマ 550 回の描きの内、馬具が骨ごとに一つずつ約 34 回＋影 16 回）：同じ拵えの馬の馬具は、人の部品と同じ束で
//   一回に描く（army_human_batch.js の batchHumanParts。形・色・影はそのまま）
for (const m of [TACK_GLOSS, TACK_MATTE, TACK_SILK]) m.userData.unitBatch = true;
// 11/21 K564：拵えの違う馬の馬具も材質ごとに一つの BatchedMesh で描く（army_human_batch.js の tackBatch）
for (const m of [TACK_GLOSS, TACK_MATTE, TACK_SILK]) m.userData.tackBatch = true;
// 馬具の使い込み：革と布の色むら・細かな皺と毛羽、漆の擦れ、上を向いた面の土埃（一色の板に見せない）
// gloss：漆（鞍・鐙）。角は擦れて下地が出て、平らな所は日の光が細く鋭く映る。金の縁・覆輪は金属の照り
function tackWear(m, gloss) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec3 vTP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTP = position;');
    let fs = 'uniform float uGrime, uWet;\nvarying vec3 vTP;\nfloat tGold, tEdge, tDust;\n' + HORSE_GLSL.replace(/hHb/g, 'tHb').replace(/hVn/g, 'tVn').replace(/hCurv/g, 'tCurv').replace(/hStrand/g, 'tStrand') + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float tn1 = tVn(vTP * 9.0), tn2 = tVn(vTP * 60.0), tn3 = tVn(vTP * 260.0);
      tGold = ${gloss ? 'smoothstep(0.12, 0.25, (vColor.r + vColor.g) * 0.5 - vColor.b) * smoothstep(0.25, 0.4, vColor.g)' : '0.0'};
      diffuseColor.rgb *= 0.8 + tn1 * 0.3 + (tn3 - 0.5) * ${gloss ? '0.04' : '0.14'};
      roughnessFactor = clamp(roughnessFactor + (tn2 - 0.5) * ${gloss ? '0.35' : '0.12'} + ${gloss ? 'smoothstep(0.6, 0.9, tn1) * 0.3' : '0.0'}, 0.05, 1.0);
      tEdge = 0.0;
      ${gloss ? `{
        // 角の擦れ：黒い漆は下地の茶、朱は黒い中塗りが覗く。金は明るく
        float cv = tCurv(normalize(vNormal), -vViewPosition);
        tEdge = smoothstep(25.0, 90.0, cv) * smoothstep(0.35, 0.65, tn2 * 0.7 + tn3 * 0.3);
        float red = smoothstep(0.1, 0.25, vColor.r - vColor.g);
        vec3 under = mix(vec3(0.16, 0.095, 0.05), vec3(0.05, 0.03, 0.025), red);
        diffuseColor.rgb = mix(diffuseColor.rgb, under, tEdge * 0.75 * (1.0 - tGold));
        diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * vec3(1.15, 1.02, 0.75) + tEdge * 0.1, vec3(1.0)), tGold);
        roughnessFactor = mix(roughnessFactor, 0.22 + tn3 * 0.2, tGold);
        roughnessFactor = mix(roughnessFactor, 0.6, tEdge * (1.0 - tGold));
      }` : `{
        // 布と革：細かな織り目の筋（縦横）と毛羽
        float wv = sin(vTP.x * 2400.0 + tn2 * 3.0) * sin((vTP.y + vTP.z) * 2400.0);
        float fw = length(fwidth(vTP)) * 2400.0;
        diffuseColor.rgb *= 1.0 + wv * 0.07 * (1.0 - smoothstep(0.5, 1.5, fw));
      }`}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.85, tGold);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        tDust = smoothstep(0.4, 0.9, up) * smoothstep(0.35, 0.8, tn1) * (0.25 + 0.2 * uGrime) * (1.0 - uWet * 0.7);
        // 下へ垂れる物（障泥・鐙・房の裾）は、蹄が跳ね上げた泥
        float spl = smoothstep(0.8, 0.9, tVn(vTP * 120.0)) * smoothstep(0.95, 0.6, vTP.y) * (0.3 + 0.7 * uGrime);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.155, 0.13), tDust);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.07, 0.05), spl * 0.35);   // 濃いと障泥に穴が開いたように見えた（11/2）
        tDust = max(tDust, spl);
        roughnessFactor = mix(roughnessFactor, 0.9, tDust);
        roughnessFactor *= 1.0 - uWet * 0.4;
      }`);
    if (gloss) fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 漆の艶：日の光が細く鋭く映る。金の縁は少し広く金色に
        vec3 Hd = normalize(directLight.direction + normalize(vViewPosition));
        float nh = clamp(dot(normal, Hd), 0.0, 1.0), nl = clamp(dot(normal, directLight.direction), 0.0, 1.0);
        float cc = (1.0 - tDust) * (1.0 - tEdge * 0.8);
        reflectedLight.directSpecular += directLight.color * nl * cc * (pow(nh, 260.0) * 1.3 * (1.0 - tGold) + pow(nh, 70.0) * 0.5 * tGold * vec3(1.0, 0.84, 0.52));
      }
      #endif`);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'tack2' + (gloss ? 'g' : 'm');
}
tackWear(TACK_GLOSS, true); tackWear(TACK_MATTE, false);
TACK_SILK.onBeforeCompile = (sh) => {
  sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
  sh.vertexShader = 'varying vec3 vTP, vTT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTP = position; vTT = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));');
  sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec3 vTP, vTT;\nfloat sFib;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      // 糸の束：縦に長い揺らぎ（1mm ほどの糸と、数mm の束）。遠くでは消す
      vec3 q = vec3(vTP.x * 900.0, vTP.y * 18.0, vTP.z * 900.0);
      float fw = length(fwidth(vTP)) * 900.0, fade = 1.0 - smoothstep(0.5, 1.4, fw);
      sFib = mix(0.5, hVn(q) * 0.6 + hVn(q * vec3(0.3, 1.0, 0.3) + 4.0) * 0.4, fade);
      diffuseColor.rgb *= 0.72 + sFib * 0.55;
      // 房の裾は埃と泥で汚れ、濡れると暗い
      float dirt = smoothstep(0.95, 0.7, vTP.y) * (0.3 + 0.7 * hVn(vTP * 80.0)) * (0.3 + 0.6 * uGrime);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.09, 0.07), dirt * 0.5);
      diffuseColor.rgb *= 1.0 - uWet * 0.25;
    }`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + sheenGlsl('vTT', '0.9 + sFib * 1.4'));
};
TACK_SILK.customProgramCacheKey = () => 'tacksilk';
// 馬具は一人だけの束（units.js soloDraw）で描かれる。支度でその描き方も作る印（battle_programs.js）
for (const m of [TACK_GLOSS, TACK_MATTE, TACK_SILK]) m.userData.soloPrep = true;

// ---- 和鞍・胸繋・尻繋（馬の根元の座標、m。立ち姿で作って骨に付ける） ----
function colGeo(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = _lin(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const mergeG = (list) => {
  // 位置・法線・色だけの三角形を一つにまとめる
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3));
  m.computeBoundingSphere();
  return m;
};
const tf = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };
// 前輪・後輪の形（下の真ん中を原点に、上へ h、左右へ w。背の上に鞍橋の刳り）
function archShape(w, h, wi, hi) {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.bezierCurveTo(-w * 1.02, h * 0.62, -w * 0.62, h, 0, h);
  s.bezierCurveTo(w * 0.62, h, w * 1.02, h * 0.62, w, 0);
  s.lineTo(wi, 0);
  s.bezierCurveTo(wi * 0.95, hi * 1.3, -wi * 0.95, hi * 1.3, -wi, 0);
  s.closePath();
  return s;
}
// 11/20 imac/look-cavalry 二回目：胸懸・尻懸が丸い管で、ゴムの輪に見えた。三懸は組紐なので（平たさは長の指示。手本の頁では確かめていない）、
//   体の面に沿って寝た平たい帯にし、組み目を一目ごとの濃淡で入れる（c＝体の芯。帯の厚みはそこから外へ）。面の数は管より少ない
function braid(pts, w, th, c, hex) {
  const cv = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), N = pts.length * 7;
  const P = [], C = [], col = _lin(hex), ring = [];
  const tg = new THREE.Vector3(), n = new THREE.Vector3(), wd = new THREE.Vector3(), cc = new THREE.Vector3(...c);
  for (let i = 0; i <= N; i++) {
    const p = cv.getPointAt(i / N); cv.getTangentAt(i / N, tg);
    n.copy(p).sub(cc); n.y *= 0.5; n.addScaledVector(tg, -n.dot(tg)).normalize();
    wd.crossVectors(tg, n).normalize();
    ring.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => p.clone().addScaledVector(wd, a * w * 0.5).addScaledVector(n, b * th * 0.5 + th * 0.5)));
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
    const a = ring[i][k], b = ring[i][(k + 1) % 4], d = ring[i + 1][k], e = ring[i + 1][(k + 1) % 4];
    const s = (i + (k === 2 ? 0 : 1)) % 2 ? 1 : 0.72;
    for (const q of [a, b, d, b, e, d]) { P.push(q.x, q.y, q.z); C.push(col.r * s, col.g * s, col.b * s); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
// 障泥：馬の腹の丸みに沿って曲がる革。縁は紐の色で取り、面は毛皮のむら（点ごとの濃淡）
function aoriGeo(sd, hex, rimHex) {
  const W = 0.17, H = 0.3, r = 0.11, NU = 10, NV = 8, main = _lin(hex), rim = _lin(rimHex);
  const rnd = (i) => { const s = Math.sin(i * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
  const pt = (iu, iv) => {
    const z = -W + 2 * W * iu / NU, e = Math.max(0, Math.abs(z) - (W - r)) / r;
    const y = 1.13 - (H - r * (1 - Math.sqrt(Math.max(0, 1 - e * e)))) * iv / NV;
    const x = 0.262 * Math.sqrt(Math.max(0.2, 1 - ((y - 1.0) / 0.33) ** 2)) + 0.014 + 0.012 * iv / NV;
    return [sd * x, y, z - 0.06];
  };
  const P = [], C = [];
  for (let iu = 0; iu < NU; iu++) for (let iv = 0; iv < NV; iv++) {
    const edge = iu === 0 || iu === NU - 1 || iv === NV - 1, c = edge ? rim : main;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]]) {
      const q = pt(iu + a, iv + b), s = edge ? 1 : 0.8 + 0.4 * rnd((iu + a) * 31 + (iv + b) * 7);
      P.push(...q); C.push(c.r * s, c.g * s, c.b * s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
function strap(pts, r) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length * 6, r, 5, false); }
// 房：紐の点から垂れる。上に結び玉
const TASSEL = new Map();
function tassel(G, S, x, y, z, st, len, big) {
  const r = big ? 0.04 : 0.03;
  const k = r + '|' + len;
  if (!TASSEL.has(k)) {
    // 結びの下から縦へ開く八つの糸束。丸い裾で閉じず、長さを少しずつ変える。
    const parts = [];
    parts.push(colGeo(tf(new THREE.SphereGeometry(r * 0.3, 6, 4), 0, -0.018, 0), 0xffffff));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8, l = len * (0.94 + (i % 3) * 0.035);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * r * 0.16, -0.028, Math.sin(a) * r * 0.16), new THREE.Vector3(Math.cos(a) * r * 0.5, -l * 0.55, Math.sin(a) * r * 0.5), new THREE.Vector3(Math.cos(a) * r * 0.8, -l, Math.sin(a) * r * 0.8));
      parts.push(colGeo(new THREE.TubeGeometry(curve, 4, r * 0.19, 3, false), 0xffffff));
    }
    const g = mergeG(parts);
    TASSEL.set(k, g);
  }
  S.push(colGeo(tf(TASSEL.get(k).clone(), x, y - 0.006, z), st.tassels));
  if (big) G.push(colGeo(tf(new THREE.SphereGeometry(0.016, 8, 6), x, y - 0.008, z), 0xc9a24a));
}
function tackGeometry(st) {
  const key = [st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (HR.tack.has(key)) return HR.tack.get(key);
  const big = !!st.big;
  const out = {};
  // 鞍褥・下鞍の布は日と汗で褪せる：羽織の鮮やかな色のままにせず、くすんだ土色へ寄せて暗める（青く浮かない）
  const cushion = new THREE.Color(st.cushion ?? 0x3a2a20).lerp(new THREE.Color(0x4a4034), 0.5).multiplyScalar(0.82).getHex();
  // 鞍（背の骨）
  {
    const G = [], M = [];
    const ex = { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 };
    const front = saddleBow(0.2, 0.33, 0.1, 0.12);
    const back = saddleBow(0.215, 0.29, 0.1, 0.11);
    G.push(colGeo(tf(front.clone(), 0, 1.2, 0.19, -0.1), st.saddle));
    G.push(colGeo(tf(back.clone(), 0, 1.18, -0.2, 0.5), st.saddle));
    // 縁（名のある武将は金、ほかは朱の漆）
    const rim = st.rim || 0x5a1a12;
    const fr = new THREE.ExtrudeGeometry(archShape(0.212, 0.343, 0.09, 0.11), { ...ex, depth: 0.01 }); fr.translate(0, 0, -0.005);
    const br = new THREE.ExtrudeGeometry(archShape(0.227, 0.302, 0.09, 0.1), { ...ex, depth: 0.01 }); br.translate(0, 0, -0.005);
    G.push(colGeo(tf(fr, 0, 1.194, 0.186, -0.1), rim));
    G.push(colGeo(tf(br, 0, 1.175, -0.196, 0.5), rim));
    // 居木（前輪と後輪をつなぐ板）
    for (const sd of [1, -1]) G.push(colGeo(tf(new THREE.BoxGeometry(0.1, 0.026, 0.42), sd * 0.085, 1.3, -0.005, 0, 0, -sd * 0.32), st.saddle));
    // 鞍褥（座る所の敷物）
    const cu = new THREE.SphereGeometry(1, 14, 8); cu.scale(0.15, 0.036, 0.17);
    M.push(colGeo(tf(cu, 0, 1.335, -0.01), cushion));
    // 下鞍（背を覆う布）：胴の丸みに沿う
    const sh = new THREE.CylinderGeometry(0.262, 0.262, 0.56, 22, 1, true, Math.PI - 1.48, 2.96);
    sh.rotateX(Math.PI / 2); sh.scale(1, 1.06, 1);
    M.push(colGeo(tf(sh, 0, 1.0, -0.01), cushion));
    // 障泥（泥よけ）：鞍の下に左右へ垂れる。縁は紐の色（9/29 の形。kaito 11/3「馬も9月に乗ってた馬を使おう」）
    //   11/20 imac/look-cavalry 二回目：平らな板二枚（地と縁）が、馬の脇に立て掛けた下敷きに見えた。大きさと位置は 9 月のまま、腹の丸みに沿って曲げ、縁取りは同じ一枚の縁に
    for (const sd of [1, -1]) M.push(aoriGeo(sd, st.aori, st.tack));
    out.seat = [mergeG(G), mergeG(M)];
  }
  // 胸繋（胸の骨）：鞍の前から胸の前を回る。房を下げる
  {
    const G = [], M = [], S = [];
    const pts = [[0.2, 1.17, 0.16], [0.235, 1.07, 0.36], [0.19, 0.98, 0.54], [0.1, 0.945, 0.63], [0, 0.94, 0.655]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    // 11/19 imac/look-cavalry：胸懸も尻懸と同じ幅のある組紐に（1.3→1.6cm。東博・馬の博物館の三懸は胸・尻とも同じ太さの組紐に総を並べる。細い線一本だと印の輪に見えた）
    M.push(braid(all, 0.034, 0.007, [0, 1.0, 0.2], st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const n = big ? 7 : 5;
    for (let i = 0; i < n; i++) { const p = cv.getPointAt(0.3 + 0.4 * i / (n - 1)); tassel(G, S, p.x, p.y - 0.01, p.z, st, big ? 0.2 : 0.14, big); }
    out.chest = [G.length ? mergeG(G) : null, mergeG(M), mergeG(S)];
  }
  // 尻繋（腰の骨）：鞍の後ろから尻を回り、尾の下を通る。脇に房（厚総）を下げる
  {
    const G = [], M = [], S = [];
    const pts = [[0.2, 1.16, -0.22], [0.25, 1.12, -0.42], [0.262, 1.06, -0.6], [0.17, 1.03, -0.75], [0, 1.03, -0.815]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    // 11/18 K365（クラウド・iPhone 横で後ろから見ると、尻に細い朱の線が一本の輪で回り、画面の印の輪に見えた）：
    //   手本＝馬の博物館・東博の「鞦（しりがい）」の現存品と、合戦図屏風の騎馬武者：鞦は組紐を幾筋か重ねた幅のある帯で、尻の真後ろにも総（厚総）が並んで垂れ、紐は総の間に覗くだけ。
    //   帯を太く（1.4→2.2cm）し、尻の後ろ（0.32〜0.68 の空き）にも房を下げる（色は 9 月の拵えのまま）
    M.push(braid(all, 0.044, 0.008, [0, 0.95, -0.4], st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const ts = big ? [0.08, 0.14, 0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74, 0.8, 0.86, 0.92] : [0.12, 0.22, 0.32, 0.41, 0.5, 0.59, 0.68, 0.78, 0.88];
    for (const t of ts) { const p = cv.getPointAt(t); tassel(G, S, p.x * 1.03, p.y - 0.01, p.z, st, big ? 0.26 : 0.17, big); }
    out.hip = [G.length ? mergeG(G) : null, mergeG(M), mergeG(S)];
  }
  HR.tack.set(key, out);
  return out;
}
// 鐙（舌長鐙）：足裏の面を原点に、長い舌と鳩胸を共有する
let STIRRUP = null;
function stirrupGeo() {
  if (STIRRUP) return STIRRUP;
  const G = stirrupParts().map(([g, color]) => colGeo(g.clone(), color));
  STIRRUP = mergeG(G);
  return STIRRUP;
}
// 細い紐（手綱・力革）：長さ 1 の円柱を、二点の間に伸ばして置く
const ROPE = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); g.translate(0, 0.5, 0); return g; })();
const _ry = new THREE.Vector3(0, 1, 0);
const _rd = new THREE.Vector3();
// 紐の置き場（Mesh）の位置・向き・長さを、描く InstancedMesh へ写す（隠した紐は入れない）
// 11/22 K564：紐は一頭に二つの InstancedMesh で描いていた（道明寺の誉田の野の近い馬7頭で14回）。
//   描くのは材質ごとに全頭で一つの InstancedMesh（場面の根に置き、世界の座標で並べる）。一頭の紐の置き場（Mesh）は今まで通り馬の組の中。
//   毎コマ ropeFrameStart で数を0に戻し、placeHorseExtras の度に見えている馬の紐を足す。見え方（10m の内・組の表示）は前と同じ
const ROPE_POOL = new Map();
const _ropeW = new THREE.Matrix4();
const _ropeC = new THREE.Color();
// 組紐の色違い（馬具の色ごと）は、白の一つの材質に紐ごとの色（instanceColor）を掛けて一つの束へ（色は ropeMat(色) と同じに出る）
let ROPE_CORD = null;
function ropeCord() { return ROPE_CORD || (ROPE_CORD = ropeMat(0xffffff)); }
// 11/22 K564 手取川の渡り口の乱戦：12m の内に馬が18頭いると、目と蹄鉄だけで一コマ三十回余り描いていた。
//   細かい将と同じく、目と蹄鉄は近い順に EYE_MAX 頭まで（携帯6・パソコン12）。それより先の馬は 12m の内でも描かない（約3cm・2cm で、乱戦の人の陰に隠れる）
const EYE_MAX = MEM_TIGHT ? 6 : 12;
const _eyeList = [];
function rankHorseEyes(horses, cam) {
  const cx = cam.position.x, cz = cam.position.z, lim = EYE_NEAR * EYE_NEAR;
  _eyeList.length = 0;
  for (const h of horses.keys()) {
    const R = h.userData.horse && h.userData.horse.real;
    if (!R || !R.on) continue;
    const e = R.holder.matrixWorld.elements, d2 = (e[12] - cx) ** 2 + (e[14] - cz) ** 2;
    R.eyeOk = false;
    if (d2 < lim) { R.eyeD2 = d2; _eyeList.push(R); }
  }
  if (_eyeList.length > EYE_MAX) _eyeList.sort((a, b) => a.eyeD2 - b.eyeD2);
  for (let i = 0; i < _eyeList.length && i < EYE_MAX; i++) _eyeList[i].eyeOk = true;
  // 体が画面の外で onBeforeRender が呼ばれない馬も、ここで見せ隠しを決め直す（前の値が残って 16m で目が見えていた・11/22 05:05 の照らし）
  for (const h of horses.keys()) {
    const R = h.userData.horse && h.userData.horse.real;
    if (!R || !R.on) continue;
    if (R.meshes.eye) R.meshes.eye.visible = R.eyeOk;
    if (R.meshes.shoe) R.meshes.shoe.visible = R.eyeOk;
  }
}
function ropeFrameStart() { for (const P of ROPE_POOL.values()) { P.n = 0; P.im.count = 0; } }
function ropePool(mat, root, more) {
  let P = ROPE_POOL.get(mat);
  if (P && P.n + more > 2048) { P.n = 0; P.im.count = 0; }   // 毎コマの ropeFrameStart を呼ばない見本の画面で増え続けないように
  if (!P || P.im.instanceMatrix.count < P.n + more) {
    const cap = Math.max(64, P ? P.im.instanceMatrix.count * 2 : 0, P ? P.n + more : 0);
    const im = new THREE.InstancedMesh(ROPE, mat, cap);
    im.castShadow = true; im.receiveShadow = false; im.frustumCulled = false; im.name = 'horseRopeIM'; im.matrixAutoUpdate = false; im.count = 0;
    if (mat === ropeCord()) im.setColorAt(0, _ropeC.set(0xffffff));
    if (P) { for (let i = 0; i < P.n; i++) { P.im.getMatrixAt(i, _ropeW); im.setMatrixAt(i, _ropeW); if (P.im.instanceColor) { P.im.getColorAt(i, _ropeC); im.setColorAt(i, _ropeC); } } im.count = P.n; P.im.removeFromParent(); }
    P = { im, n: P ? P.n : 0 }; ROPE_POOL.set(mat, P);
  }
  if (P.im.parent !== root) root.add(P.im);
  return P;
}
function syncRopes(R) {
  if (!R.ropeSlots) return;
  // 紐の組と、その上の組が全部見えている時だけ描く（遠い馬は体の onBeforeRender が R.ropes を隠す）
  let o = R.ropes, root = null;
  for (; o; o = o.parent) { if (!o.visible) return; if (!o.parent) root = o; }
  if (!root || !root.isScene) return;
  R.ropes.updateWorldMatrix(true, false);
  for (let k = 0; k < 2; k++) {
    const sl = R.ropeSlots[k], mat = R.ropeMat ? R.ropeMat[k] : TACK_MATTE;
    const P = ropePool(mat, root, sl.length);
    for (let j = 0; j < sl.length; j++) {
      const m = sl[j];
      if (!m.visible) continue;
      m.updateMatrix(); _ropeW.multiplyMatrices(R.ropes.matrixWorld, m.matrix);
      if (P.im.instanceColor) P.im.setColorAt(P.n, R.ropeCol[k]);
      P.im.setMatrixAt(P.n++, _ropeW);
    }
    P.im.count = P.n; P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true;
  }
}
function ropeBetween(m, a, b, r) {
  _rd.copy(b).sub(a);
  const L = _rd.length() || 1e-4;
  // 乗り手の拳の骨が古い所（場面の原点など）を指したコマに、手綱が戦場の端まで伸びて馬上の武将のまわりに星形の線が出た（稲生 10/22）。
  // 紐は三メートルより長くならない。長すぎる時はそのコマだけ長さを無くして描かない。
  if (!(L < 3)) { m.scale.set(r, 1e-4, r); return; }
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_ry, _rd.multiplyScalar(1 / L));
  m.scale.set(r, L, r);
}

// ---- 一頭を作る・拵える ----
const RAIL = ['idle1', 'idle2', 'idle3', 'walk', 'walkL', 'walkR', 'trot', 'gallop', 'gallopL', 'gallopR', 'run', 'stop', 'buck1', 'death'];
function makeRealHorse() {
  const holder = new THREE.Group();
  holder.scale.setScalar(HS); holder.position.x = HX;
  const sc = skClone(HR.scene);
  holder.add(sc);
  const R = { holder, sc, bones: {}, meshes: {}, act: {}, extra: new THREE.Group(), on: false, style: null, tack: [], w: {}, t: {} };
  sc.traverse((o) => {
    if (o.isBone) R.bones[o.name] = o;
    if (o.isSkinnedMesh) {
      R.meshes[o.name.replace(/^horse_|_hi$/g, '')] = o; o.castShadow = true; o.receiveShadow = true;
      // 画面の外の馬は描かない：立ち姿の形の球を 1.6 倍＋0.5m に広げた球で判定（駆け・頭を下げる動きでも収まる。三角 1 万の馬が画面の外で 2〜4 頭描かれていた）
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (bs && isFinite(bs.radius)) { o.boundingSphere = new THREE.Sphere(bs.center.clone(), bs.radius * 1.6 + 0.5); o.frustumCulled = true; }
      else o.frustumCulled = false;
    }
  });
  if (HR.bridle && R.meshes.bridle) {
    // 根元のメートルで作った面繋を、鞍と同じく骨の子にする。
    // 輸入した面繋の結び行列を通すと、縮尺と支点が重なり、輪だけ空へ飛んでいた。
    const old = R.meshes.bridle;
    old.visible = false;
    const bridle = new THREE.Mesh(HR.bridle, old.material);
    bridle.matrixAutoUpdate = false;
    bridle.matrix.copy(HR.restInv[HEAD_B]);
    bridle.castShadow = true; bridle.receiveShadow = true; bridle.frustumCulled = false;
    bridle.userData.hbShared = true;   // 11/21 K564：全頭で同じ形。army_human_batch.js の束へ
    R.bones[HEAD_B].add(bridle);
    R.meshes.bridle = bridle;
  }
  // 遠めは面を減らした形（影を描く時も）
  for (const k of ['body', 'hair']) {
    const m = R.meshes[k], hi = m.geometry, lo = HR.lo[k];
    m.onBeforeRender = (r, s, cam) => {
      const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
      const L = MEM_TIGHT ? HORSE_LOD_TIGHT : HORSE.lod;   // 携帯は細かい形を 10m の内だけに（小さい画面では見分けが付かない。11/15 K073 天王寺：14m の内の馬で 9万三角）
      const want = !cam.isOrthographicCamera && d2 < L * L ? hi : lo;
      if (m.geometry !== want) m.geometry = want;
      // 写真から作った本物の鞍（三角 約4千・画面の外でも描く）は近い馬だけ。遠い馬は組んだ軽い鞍に（11/13 クラウドし K073：遠い武将の馬で鞍が一頭 約8千三角）
      if (k === 'body' && R.ropes && !cam.isOrthographicCamera) R.ropes.visible = d2 < ROPE_NEAR * ROPE_NEAR;
      if (k === 'body' && !cam.isOrthographicCamera) { const near = d2 < EYE_NEAR * EYE_NEAR && R.eyeOk !== false; if (R.meshes.eye) R.meshes.eye.visible = near; if (R.meshes.shoe) R.meshes.shoe.visible = near; }
      if (k === 'body' && !cam.isOrthographicCamera) { const small = d2 < TACK_SMALL_NEAR * TACK_SMALL_NEAR; for (const m of R.stir) m.visible = small; for (const m of R.tack || []) if (m.material === TACK_SILK) m.visible = small; }
      if (k === 'body' && R.kuraPair && !cam.isOrthographicCamera) { const near = d2 < KURA_NEAR * KURA_NEAR; R.kuraPair[0].visible = near; R.kuraPair[1].visible = !near; }
    };
  }
  R.mixer = new THREE.AnimationMixer(sc);
  // 根の骨（足もとの真ん中）は録った動きが触らない。体の傾きと弾みはここを回して付け、毎コマ立ち姿へ戻す
  const rb = R.bones.BN_Root_01_01; R.root0 = { q: rb.quaternion.clone(), p: rb.position.clone() };
  for (const k of RAIL) { const a = R.mixer.clipAction(HR.clips[k]); a.play(); a.enabled = false; a.timeScale = 0; R.act[k] = a; R.w[k] = 0; R.t[k] = Math.random() * HR.clips[k].duration; }
  // 鐙・力革・手綱（馬の根元の座標で毎コマ置く）
  const sg = stirrupGeo();
  R.stir = [new THREE.Mesh(sg, TACK_GLOSS), new THREE.Mesh(sg, TACK_GLOSS)];
  R.leather = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  R.rein = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  // 手綱は二つに折って、真ん中をたるませる（張った棒に見せない）
  R.rein2 = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  // 拳の中を通る所と、拳から垂れる余り
  R.reinIn = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  R.reinTail = [0, 1, 2, 3].map(() => new THREE.Mesh(ROPE, TACK_MATTE));
  // 紐は一つの組にまとめ、遠い馬では組ごと描かない（体の onBeforeRender で決める）。画面の外の紐も描かない（形の球は伸ばした長さで正しく出る）
  R.ropes = new THREE.Group(); R.ropes.name = 'horseRopes'; R.extra.add(R.ropes);
  for (const m of R.stir) { m.castShadow = true; m.frustumCulled = false; m.userData.hbShared = true; R.extra.add(m); }
  // 紐（力革2・手綱10）は一頭で12回描いていた（関ヶ原の近い馬二頭で一コマ24回・影12回。11/17 K365）。
  //   紐の Mesh は置き場（位置・向き・長さ）としてだけ使い、描くのは力革と手綱の二つの InstancedMesh に（形・材質・見た目は同じ）
  R.ropeSlots = [R.leather, [...R.rein, ...R.rein2, ...R.reinIn, ...R.reinTail]];
  R.ropeMat = [TACK_MATTE, TACK_MATTE];   // 描くのは材質ごとの全頭で一つの束（ropePool）
  return R;
}
let redWhiteCord = null;
function redWhiteRopeMat() {
  if (!redWhiteCord) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'); cx.fillStyle = '#f3e7d4'; cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#b52c20'; cx.lineWidth = 16;
    for (let i = -64; i <= 128; i += 32) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 64, 64); cx.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 16);
    redWhiteCord = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }
  return redWhiteCord;
}
function dressHorse(R, st) {
  if (R.style === st) return;
  R.style = st;
  R.kuraPair = null;
  const M = horseMaterials(st);
  R.meshes.body.material = M.body; R.meshes.hair.material = M.hair; R.meshes.shoe.material = M.shoe; R.meshes.eye.material = M.eye; R.meshes.bridle.material = M.bridle;
  for (const m of R.tack) m.parent && m.parent.remove(m);
  R.tack = [];
  const T = tackGeometry(st);
  for (const [bn, key] of [[SEAT_B, 'seat'], [CHEST_B, 'chest'], [HIP_B, 'hip']]) {
    const [g, mt, sk] = T[key];
    // 骨の入った馬の前輪・後輪・居木は、写真から作った本物の鞍（humans_horses.js の HR.kura。絵つき）に替える。遠くの馬は組んだ鞍のまま
    const real = key === 'seat' && HR.kura;
    if (real && g) R.kuraPair = [];
    for (const [geo, mat] of [real ? [HR.kura.geo, HR.kura.mat] : [g, TACK_GLOSS], ...(real && g ? [[g, TACK_GLOSS]] : []), [mt, TACK_MATTE], [sk, TACK_SILK]]) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      // 骨の子に：骨の立ち姿の逆（骨は根元の座標で HS 倍されているので、その分も戻す）
      m.matrixAutoUpdate = false;
      m.matrix.copy(HR.tackInv ? HR.tackInv[bn] : HR.restInv[bn]);
      m.castShadow = true; m.frustumCulled = false;
      R.bones[bn].add(m); R.tack.push(m);
      if (R.kuraPair && R.kuraPair.length < 2 && (geo === HR.kura?.geo || geo === g)) { R.kuraPair.push(m); m.visible = R.kuraPair.length === 2; }
    }
  }
  for (const m of R.leather) m.material = ropeMat(st.tack);
  for (const m of [...R.rein, ...R.rein2, ...(R.reinIn || []), ...(R.reinTail || [])]) m.material = st.reins ? redWhiteRopeMat() : ropeMat(st.tack);
  R.ropeCol = [new THREE.Color(st.tack), new THREE.Color(st.tack)];
  R.ropeMat = [ropeCord(), st.reins ? redWhiteRopeMat() : ropeCord()];
}

export { TACK_GLOSS, TACK_MATTE, TACK_SILK, colGeo, mergeG, tf, strap, TASSEL, tackGeometry, STIRRUP, ROPE, _rd, ropeBetween, syncRopes, ropeFrameStart, rankHorseEyes, ropeCord, RAIL, makeRealHorse, redWhiteCord, dressHorse };
