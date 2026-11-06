// 本物の当世具足の3Dスキャン（侍・侍大将・名のある武将とその旗本・馬廻・近習。kaito_play V 11/2「侍以上の鎧は全部本物の3Dのモデルに」）
// ・形：assets/gusoku_lite/gusoku.glb（tools/gusoku_scan.mjs が、國學院大學栃木学園参考館「yoroi」CC BY 4.0 の胴・草摺・袖・籠手の上を切り出し、
//   胴丸の人形の肩と腰へ合わせて骨の重みを付けた物。近く hi 約8千面・遠く lo 3千面）。絵は飾りの具足と同じ yoroi_col（1024）を使い回す
// ・着せ方：胴丸のスキャンを着せ（同じ骨組み）、胴丸は手と脚（籠手の手甲・佩楯・臑当）だけ描き、胴から上はこの具足に替える。兜は兵ごとの兜のスキャン
// ・遠い人（setFar）は今までどおり体ごとまとめた軽い形
import * as THREE from 'three';
import { GLTFLoader } from './glb_loader.js';
import { assetBytes, texOr } from './bin_assets.js';
import { DM, DOMARU } from './humans_armor.js';
import { isNamed, isSohei } from './humans_shared.js';

const GUSOKU = { on: true, ready: false, failed: false, hiNear: 9 };
let GS = null;
let gsLoading = null;
function loadGusoku() {
  if (gsLoading) return gsLoading;
  gsLoading = (async () => {
    const buf = await assetBytes('gusoku');
    const [gl, col] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      texOr('yoroi_col', new URL('../assets/yoroi_lite/yoroi_col.jpg', import.meta.url).href, { srgb: true, anisotropy: 8 }),
    ]);
    const geo = {};
    gl.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, p = g.attributes.position;
      // 量子化の倍率を形へ戻す（骨の逆行列は胴丸と同じメートルの立ち姿）
      const a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { a[i * 3] = p.getX(i) * o.scale.x; a[i * 3 + 1] = p.getY(i) * o.scale.y; a[i * 3 + 2] = p.getZ(i) * o.scale.z; }
      // 体に沿わせる（kaito 11/5 九の6「胴が丸く膨らむ・外に付けただけ」）：飾り台の具足は詰め物で胸の前後が 33cm もあり、樽のように丸い。
      //   胴（腰から胸）を前後 0.74・左右 0.9 に締め、人の胴の厚さ（約 25cm）へ。草摺は裾ほど少し。首の周りは元のまま（首と兜の合わせを崩さない）
      for (let i = 0; i < p.count; i++) {
        const y = a[i * 3 + 1];
        const w = Math.min(1, Math.max(0, (y - 0.82) / 0.2)) * Math.min(1, Math.max(0, (1.5 - y) / 0.1));
        const sz = 1 - 0.26 * w, sx = 1 - (Math.abs(a[i * 3]) < 0.21 ? 0.1 : 0.06) * w;
        a[i * 3] *= sx; a[i * 3 + 2] = -0.02 + (a[i * 3 + 2] + 0.02) * sz;
      }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      g.setAttribute('skinIndex', g.getAttribute('_joints')); g.setAttribute('skinWeight', g.getAttribute('_weights'));
      g.deleteAttribute('_joints'); g.deleteAttribute('_weights');
      g.deleteAttribute('normal'); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      geo[o.name] = g;
    });
    GS = { hi: geo.hi, lo: geo.lo || geo.hi, col, mats: new Map() };
    GUSOKU.ready = true;
  })().catch((e) => { GUSOKU.failed = true; console.warn('具足のスキャンを読めませんでした（今の形で描きます）', e); });
  return gsLoading;
}

// 着る人：侍（tier 1）から上と名のある武将。本人（主人公の甲冑は別の係）・小袖・僧兵・南蛮胴（信長の後半）は今のまま
function wantsGusoku(L, u) {
  if (!GUSOKU.on || !L || u?.isPlayer || L.hero || L.kosode || L.nanban || isSohei(L)) return false;
  return (L.tier ?? 0) >= 1 || isNamed(L);
}

// 材質：スキャンの絵の濃淡と小札・威の目はそのまま、色をその人の具足の漆（L.armor）と威（L.lace）へ寄せる（赤備え・黒漆・家ごとの威）。
//   飾り台の白い布（脇の下に写った物）は暗い鎧下の色に。青い威は寄せない（具足を青く塗らない）。描く仕組みは一つで、色は材質ごとの値
const toLin = (hex, fb) => { const c = new THREE.Color(hex ?? fb); const h = c.getHSL({}); return h.h > 0.45 && h.h < 0.78 && h.s > 0.15 ? new THREE.Color(fb) : c; };
function gusokuMaterial(L, seed) {
  const v = Math.floor(((seed || 0) * 7.13) % 1 * 3);
  const lac = toLin(L.armor, 0x2a2420), odo = toLin(L.takedaRed ? 0xa8301f : L.lace, 0x5a3420);
  const key = lac.getHexString() + odo.getHexString() + v;
  let m = GS.mats.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: GS.col, roughness: 0.66, metalness: 0.1, envMapIntensity: 0.7 });
  const U = { uLac: { value: lac }, uOdo: { value: odo }, uGain: { value: [0.86, 0.94, 1.02][v] } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aUnder;\nvarying float vUnder;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUnder = aUnder;');
    sh.fragmentShader = 'uniform vec3 uLac; uniform vec3 uOdo; uniform float uGain;\nvarying float vUnder;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float gsOdo = 0.0;
      {
        vec3 c = diffuseColor.rgb;
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = (mx - mn) / max(mx, 1e-3);
        float cloth = smoothstep(0.35, 0.6, mn) * (1.0 - smoothstep(0.08, 0.2, sat));
        float lum = dot(c, vec3(0.3, 0.55, 0.15));
        // 色の濃い所（威の糸）は威の色、暗く色の薄い所（漆の板・紐の陰）は漆の色。濃淡はスキャンの明るさ
        float isOdo = smoothstep(0.3, 0.55, sat) * smoothstep(0.02, 0.06, lum);
        vec3 tgt = mix(uLac * lum * 10.0 + lum * 0.25, uOdo * lum * 6.0, isOdo);
        c = mix(c * 0.7, tgt, 0.7);
        c = mix(c, vec3(0.03, 0.025, 0.022), cloth);
        diffuseColor.rgb = c * uGain;
        gsOdo = max(isOdo, cloth);
        // 具足の内の鎧下（addUnder）：暗い麻の直垂の色、艶なし
        if (vUnder > 0.5) { diffuseColor.rgb = vec3(0.032, 0.028, 0.025); gsOdo = 1.0; }
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // 漆の板は照る（現存の当世具足の黒漆・朱漆の艶。前は一面 0.66 で、板も糸も同じ鈍い樹脂に見えた）。威の絹糸と布は艶なし
      roughnessFactor = mix(0.34, 0.86, gsOdo);`);
  };
  m.customProgramCacheKey = () => 'gusoku';
  GS.mats.set(key, m);
  return m;
}

// 胴丸の形から、腕（大袖を除いた籠手と手）と脚（佩楯の下から臑当・足）だけを残した形。形ごとに一度だけ作る
const LIMB = new WeakMap();
function segD(x, y, z, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t);
}
function limbsOf(g) {
  let o = LIMB.get(g);
  if (o) return o;
  const J = g.attributes.skinIndex, W = g.attributes.skinWeight, P = g.attributes.position, I = g.index, JT = DM.joints;
  // h 手・f 前腕・a 二の腕（大袖は腕の線から 7cm より外。肩の上は具足の袖が覆う）・u 腿・l 脛と足
  const kind = DM.bones.map((n) => /Hand|Finger/.test(n) ? 'h' : /ForeArm/.test(n) ? 'f' : /^(Right|Left)Arm$/.test(n) ? 'a' : /UpLeg/.test(n) ? 'u' : /Leg|Foot|Toe/.test(n) ? 'l' : '');
  const top = (v) => { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = W.getComponent(v, c); if (w > bw) { bw = w; bi = J.getComponent(v, c); } } return [kind[bi], DM.bones[bi]]; };
  const hipY = JT.Hips[1];
  const keepV = (v) => {
    const [k, nm] = top(v);
    if (k === 'h' || k === 'f' || k === 'l') return true;
    if (k === 'u') return P.getY(v) < hipY - 0.08;
    if (k === 'a') { const s = nm.startsWith('Right') ? 'Right' : 'Left'; return P.getY(v) < JT[s + 'Arm'][1] - 0.06 && segD(P.getX(v), P.getY(v), P.getZ(v), JT[s + 'Arm'], JT[s + 'ForeArm']) < 0.07; }
    return false;
  };
  const keep = [];
  for (let t = 0; t < I.count; t += 3) {
    const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
    if (keepV(a) && keepV(b) && keepV(c)) keep.push(a, b, c);
  }
  o = new THREE.BufferGeometry(); o.attributes = { ...g.attributes }; o.setIndex(keep);
  o.boundingBox = g.boundingBox; o.boundingSphere = g.boundingSphere;
  LIMB.set(g, o);
  return o;
}

// 体が透けて欠けない（kaito 11/5 九の6「人の体の一部が透明で欠ける」）：具足のスキャンを着る人は、下の体（胴・肩）を描かず、
//   胴丸も手と脚だけ。具足の板の合わせ目（肩上と袖の間・胴の脇・首の回り）から向こうの景色が抜けて見えた（会話の秀吉の肩）。
//   具足の内に、暗い鎧下（直垂）の胴と肩の筒を一つ足す。同じ形に足すので描く回数は増えない（約 250 面）。色は材質で暗い布にする（aUnder）
function addUnder(g) {
  if (!g || g.attributes.aUnder) return;
  const BN = DM.bones, bi = (n) => Math.max(0, BN.indexOf(n));
  // [高さ, 左右の半径, 前後の半径]（胴丸の人形の立ち姿の座標。具足を締めた後の内に収まる）
  const RINGS = [[0.99, 0.12, 0.085], [1.08, 0.125, 0.09], [1.18, 0.135, 0.095], [1.28, 0.145, 0.1], [1.36, 0.165, 0.098], [1.42, 0.15, 0.085], [1.455, 0.088, 0.068], [1.48, 0.062, 0.055]];
  const SEG = 16, ZC = -0.02, nv = RINGS.length * SEG + 1;
  const SP = [['Hips', 1.01], ['Spine', 1.102], ['Spine1', 1.207], ['Spine2', 1.328], ['Neck', 1.468]];
  const P0 = g.attributes.position, n0 = P0.count, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, UV = g.attributes.uv;
  const pos = new Float32Array((n0 + nv) * 3); pos.set(P0.array.subarray(0, n0 * 3));
  const si = new SI.array.constructor((n0 + nv) * 4); si.set(SI.array.subarray(0, n0 * 4));
  const sw = new SW.array.constructor((n0 + nv) * 4); sw.set(SW.array.subarray(0, n0 * 4));
  const wMax = SW.normalized ? (sw instanceof Uint8Array ? 255 : sw instanceof Uint16Array ? 65535 : 1) : 1;
  const uv = UV ? new UV.array.constructor((n0 + nv) * 2) : null; if (uv) uv.set(UV.array.subarray(0, n0 * 2));
  const und = new Float32Array(n0 + nv);
  const put = (v, x, y, z) => {
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; und[v] = 1;
    let k = 0; while (k < SP.length - 2 && y > SP[k + 1][1]) k++;
    const t = Math.min(1, Math.max(0, (y - SP[k][1]) / (SP[k + 1][1] - SP[k][1])));
    const sh = Math.min(1, Math.max(0, (Math.abs(x) - 0.08) / 0.08)) * Math.min(1, Math.max(0, (y - 1.33) / 0.06)) * 0.6;
    const w = [[bi(SP[k][0]), (1 - t) * (1 - sh)], [bi(SP[k + 1][0]), t * (1 - sh)], [bi(x < 0 ? 'LeftShoulder' : 'RightShoulder'), sh], [0, 0]];
    for (let c = 0; c < 4; c++) { si[v * 4 + c] = w[c][0]; sw[v * 4 + c] = wMax > 1 ? Math.round(w[c][1] * wMax) : w[c][1]; }
  };
  RINGS.forEach(([y, rx, rz], r) => { for (let j = 0; j < SEG; j++) { const a = j / SEG * Math.PI * 2; put(n0 + r * SEG + j, Math.sin(a) * rx, y, ZC + Math.cos(a) * rz); } });
  put(n0 + nv - 1, 0, 1.495, ZC);
  const I0 = g.index.array, idx = [];
  for (let r = 0; r < RINGS.length - 1; r++) for (let j = 0; j < SEG; j++) {
    const a = n0 + r * SEG + j, b = n0 + r * SEG + (j + 1) % SEG, c = a + SEG, d = b + SEG;
    idx.push(a, b, c, b, d, c);
  }
  for (let j = 0; j < SEG; j++) idx.push(n0 + (RINGS.length - 1) * SEG + j, n0 + (RINGS.length - 1) * SEG + (j + 1) % SEG, n0 + nv - 1);
  const ix = new ((n0 + nv) > 65535 ? Uint32Array : I0.constructor)(I0.length + idx.length); ix.set(I0); ix.set(idx, I0.length);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4, SI.normalized));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, SW.normalized));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2, UV.normalized));
  g.setAttribute('aUnder', new THREE.BufferAttribute(und, 1));
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  g.deleteAttribute('normal'); g.computeVertexNormals(); g.computeBoundingSphere();
}

// h：胴丸のスキャンを着せた直後の人（dressDomaru の後に呼ぶ）
function dressGusoku(h) {
  const dm = h.parts.domaru;
  if (!dm || !GS) return false;
  if (!GS.under) { GS.under = true; addUnder(GS.hi); if (GS.lo !== GS.hi) addUnder(GS.lo); }
  // 胴丸の胴の小札の段（名のある武将の近い時に重ねる物）は描かない
  if (h.parts.domaruBands) { h.parts.domaruBands.removeFromParent(); h.parts.domaruBands = null; }
  const before = dm.onBeforeRender;
  dm.onBeforeRender = function (...a) { before.apply(dm, a); dm.geometry = limbsOf(dm.geometry); };
  dm.geometry = limbsOf(dm.geometry);
  const m = new THREE.SkinnedMesh(GS.hi, gusokuMaterial(h.look || {}, h.seed));
  m.bind(dm.skeleton, new THREE.Matrix4());
  m.castShadow = true; m.receiveShadow = true;
  m.frustumCulled = true; m.boundingSphere = dm.boundingSphere;
  let hi = true;
  m.onBeforeRender = (r, s, cam) => {
    if (cam.isOrthographicCamera) { if (m.geometry !== GS.lo) m.geometry = GS.lo; return; }
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const near = GUSOKU.hiNear + (hi ? 0.5 : 0);
    hi = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2 < near * near;
    const want = hi ? GS.hi : GS.lo;
    if (m.geometry !== want) m.geometry = want;
  };
  h.root.add(m);
  h.parts.gusoku = m;
  return true;
}

export { GUSOKU, GS, loadGusoku, gsLoading, wantsGusoku, dressGusoku };
