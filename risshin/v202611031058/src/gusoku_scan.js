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
    sh.fragmentShader = 'uniform vec3 uLac; uniform vec3 uOdo; uniform float uGain;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
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
      }`);
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

// h：胴丸のスキャンを着せた直後の人（dressDomaru の後に呼ぶ）
function dressGusoku(h) {
  const dm = h.parts.domaru;
  if (!dm || !GS) return false;
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
