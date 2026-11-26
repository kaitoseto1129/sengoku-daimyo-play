// K697（11/26 kaito「クソ人形をやめる・抜本的に改革」）：人の土台の一体目。
// 骨入りの本物の人（MakeHuman CC0 の頭から足先まで一つの体＝立体の顔・本物の比）に、Blender で足軽の衣と御貸具足
// （陣笠・桶側胴・草摺・籠手・脛当・小袖・股引・草鞋）を着せた一つの形（tools/k697_body.mjs → tools/k697_ashigaru.py）。
// 骨は見本の Mixamo の骨（節の位置だけ体の比へ）なので、録った動き（CMU・ACCAD の mocap.bin）と見本の Walk・Idle・Run がそのまま効く。
// 一つの形・一つの材質・一枚の絵（2048 角）＝一体一描き。大勢へは同じ形と絵を使い回す（docs/status/k697/plan.md）。
import * as THREE from 'three';
import { GLTFLoader } from './glb_loader.js';
import { assetBytes } from './bin_assets.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { MOCAP } from './humans_mocap.js';
import { monMark } from './textures.js';
import { MEM_TIGHT } from './settings.js';
import { SRC, ALLB, restMatrix } from './humans_shared.js';

// lod：段ごとの形（近 12,000・中 3,000・遠 800 三角。頂点は一つを全員で使い回す。tools/k697_lod.mjs）
// names・inv・T：骨の名の並び・立ち姿の逆行列（f で縮めた物）・骨ごとの立ち姿の位置（f で縮めた物）
// f：今の骨の人（見本の骨・頭の上 1.825）と同じ背へ縮める割合（K697 の頭の上は 1.95）
export const K697 = { ready: false, src: null, clips: {}, height: 1.62, f: 0.935, lod: null, names: null, inv: null, T: null };
let loading = null;
export function loadK697() {
  if (loading) return loading;
  loading = (async () => {
    const buf = await assetBytes('k697_ashigaru');
    const g = await new GLTFLoader().parseAsync(buf.buffer, '');
    g.scene.traverse((o) => { if (o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.name = 'k697_ashigaru'; } });
    // 背の高さを足軽の背（約 1.62m）へ（体の比はそのまま、全体を縮める＝動きの腰の上下も同じ割合）
    // 骨の立ち姿で測る（SkinnedMesh の箱は骨の行列が要る）
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.scene.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    K697.raw = box.max.y - box.min.y;
    const k = K697.height / Math.max(0.1, K697.raw);
    g.scene.scale.multiplyScalar(k);
    K697.src = g.scene;
    for (const c of g.animations) K697.clips[c.name.toLowerCase()] = c;
    await prepRig(g.scene);
    K697.ready = true;
  })().catch((e) => { K697.err = String(e && e.stack || e).slice(0, 300); console.warn('K697 の人を読めませんでした', e); });
  return loading;
}
// 一人を出す。mode：'walk'・'idle'・'run'・録った動きの名（'thrust'・'gun'・'wait' など。mocap.bin が読めていれば）
export async function spawnK697(parent, pos, yaw = 0, mode = 'idle', t0 = 0) {
  await loadK697();
  if (!K697.ready) return null;
  const root = new THREE.Group();
  const body = skClone(K697.src);
  root.add(body);
  root.position.copy(pos); root.rotation.y = yaw;
  root.userData.k697 = true;
  parent.add(root);
  const mixer = new THREE.AnimationMixer(body);
  let clip = K697.clips[mode] || (MOCAP && MOCAP.clips && MOCAP.clips[mode]) || K697.clips.idle;
  const a = mixer.clipAction(clip);
  if (MOCAP && MOCAP.clips && clip === MOCAP.clips[mode] && !MOCAP.loop?.[mode]) {
    // 一回きりの動き（構える・突く）は、溜めの頂（mk の初め）で止めて「構え」に見せる
    a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
    const top = (MOCAP.mk?.[mode] || [0.5])[0];
    mixer.setTime(top * clip.duration); a.paused = true;
  } else { a.play(); mixer.setTime(t0); }
  root.userData.mixer = mixer;
  root.userData.kamae = !!(MOCAP && MOCAP.clips && clip === MOCAP.clips[mode] && !MOCAP.loop?.[mode]);
  // 槍（足軽の長柄。織田の三間半＝約 6.3m を携帯の画に収まる 5m に）：両手の間を通す。手が近い時（歩く）は右手で立てて担ぐ
  const yari = new THREE.Group();
  const shaft = new THREE.Mesh(SPEAR.shaft, SPEAR.wood); shaft.position.y = 0; yari.add(shaft);
  const tip = new THREE.Mesh(SPEAR.tip, SPEAR.steel); tip.position.y = 2.5 + 0.14; yari.add(tip);
  yari.traverse((o) => { o.castShadow = true; });
  root.add(yari);
  const bones = {}; body.traverse((o) => { if (o.isBone && /(Left|Right)Hand$/.test(o.name)) bones[/Left/.test(o.name) ? 'L' : 'R'] = o; });
  root.userData.yari = { g: yari, ...bones };
  return root;
}
const SPEAR = {
  shaft: new THREE.CylinderGeometry(0.016, 0.02, 5.0, 8),
  tip: new THREE.ConeGeometry(0.022, 0.28, 6),
  wood: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 }),
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
// 毎コマ：出した人の動きを進め、槍を手へ合わせる（出した側が呼ぶ）
export function stepK697(list, dt) {
  for (const r of list) {
    r.userData.mixer?.update(dt);
    const y = r.userData.yari; if (!y || !y.L || !y.R) continue;
    r.updateMatrixWorld(true);
    y.R.getWorldPosition(_a); y.L.getWorldPosition(_b);
    _m.copy(r.matrixWorld).invert(); _a.applyMatrix4(_m); _b.applyMatrix4(_m);
    const s = r.children[0].scale.x || 1;
    _d.subVectors(_b, _a);
    if (r.userData.kamae) {
      // 構え：両手の間を通し、穂先は前（形の前は -z）へ少し上向き。右手の後ろへ 1.2m 残す
      _d.set(0, 0.1, -1).normalize(); _q.setFromUnitVectors(_up, _d);
      y.g.quaternion.copy(_q); y.g.position.copy(_a).add(_b).multiplyScalar(0.5).addScaledVector(_d, 1.3);
    } else {
      // 担ぐ：右手で握り、穂先は肩の上を後ろ斜め上へ
      _d.set(0.08, 1, 0.55).normalize(); _q.setFromUnitVectors(_up, _d);
      y.g.quaternion.copy(_q); y.g.position.copy(_a).addScaledVector(_d, 1.7);
    }
    void s;
  }
}

// ---- K697 手順1：今の骨の人（humans_runtime.js の足軽）へ着せる ----
// 今の骨の人の骨（見本の骨。名と立ち姿の向きは K697 と同じ）をそのまま使い、骨の位置（節の長さ）だけ K697 の比に置き直す（humans_animate.js の k697Pose）。
//   → 録った動き・突く・撃つ・倒れる・握り（humans_arms.js）は今のまま全部効き、得物は K697 の手に付く。骨を二つ持たない（骨の行列は一人一組のまま）
const nm0 = (n) => n.replace(/^mixamorig:?/, '');
async function prepRig(scene) {
  let sm = null; scene.traverse((o) => { if (o.isSkinnedMesh) sm = o; });
  const f = K697.f;
  // 骨の立ち姿の位置（親から）を f 倍に。腰の高さは動き（Hips の位置）を f 倍にして合わせる
  K697.T = {}; scene.traverse((o) => { if (o.isBone || /^mixamorig/.test(o.name)) K697.T[nm0(o.name)] = o.position.clone().multiplyScalar(f); });
  K697.names = sm.skeleton.bones.map((b) => nm0(b.name));
  // 縮めた骨の立ち姿の逆行列 × 縮め（頂点も f 倍に縮む）：inv(S·R·S⁻¹)·S = S·R⁻¹
  const S = new THREE.Matrix4().makeScale(f, f, f);
  K697.inv = sm.skeleton.boneInverses.map((m) => S.clone().multiply(m));
  K697.bind = sm.bindMatrix.clone();
  // 段ごとの形（頂点は元のまま・面の並びだけ違う）
  const buf = await assetBytes('k697_lod');
  const u8 = buf.byteOffset % 4 ? buf.slice() : buf;
  const H = new Uint32Array(u8.buffer, u8.byteOffset, 1 + new Uint32Array(u8.buffer, u8.byteOffset, 1)[0]);
  let off = u8.byteOffset + H.byteLength;
  const base = sm.geometry;
  K697.lod = [];
  for (let i = 1; i < H.length; i++) {
    const g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(u8.buffer.slice(off, off + H[i] * 2)), 1));
    off += H[i] * 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.1, 1));
    g.userData.k697 = i - 1;
    K697.lod.push(g);
  }
  K697.tris = K697.lod.map((g) => g.index.count / 3);
  K697.baseMat = sm.material;
  // 携帯（MEM_TIGHT）は色の絵を 1024 角に（GPU で 2048 角は mip 込み約 21MB・1024 角は約 5MB。顔の升は 512px のまま＝携帯の画で顔は 60px ほど）。粗さの絵は 512 角のまま
  const map = sm.material.map, img = map && map.image;
  if (MEM_TIGHT && img && (img.width || 0) > 1024 && typeof createImageBitmap === 'function') {
    try {
      const small = await createImageBitmap(img, { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' });
      const t = map.clone(); t.image = small; t.needsUpdate = true;
      sm.material.map = t; map.dispose(); img.close?.();
      K697.mapSize = 1024;
    } catch (e) { K697.mapErr = String(e).slice(0, 80); }
  }
  K697.mapSize = K697.mapSize || (img && img.width) || 0;
  K697.sphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
}
// 段の境（m）：近 12,000 → 15m から中 3,000 → 40m から遠 800（影は中から）
export const K697_LOD = [15, 40];
// ---- 家の色（小袖・陣笠の漆と紋・胴と草摺の漆・縅）：絵は一枚のまま、升ごとに色を差し替える（材質は家ごと・描き方は一つ）----
const MONC = { cv: null, tex: null, cells: new Map() };
const MON_N = 8;   // 8×8 升・一升 64px
function monCell(kind) {
  if (!kind || typeof document === 'undefined') return -1;
  if (MONC.cells.has(kind)) return MONC.cells.get(kind);
  if (!MONC.cv) {
    MONC.cv = document.createElement('canvas'); MONC.cv.width = MONC.cv.height = 64 * MON_N;
    const c = MONC.cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 64 * MON_N, 64 * MON_N);
    MONC.tex = new THREE.CanvasTexture(MONC.cv); MONC.tex.flipY = false; MONC.tex.colorSpace = THREE.NoColorSpace; MONC.tex.generateMipmaps = true;
  }
  const i = MONC.cells.size;
  if (i >= MON_N * MON_N) return -1;
  const c = MONC.cv.getContext('2d'), x = (i % MON_N) * 64 + 32, y = Math.floor(i / MON_N) * 64 + 32;
  const ok = monMark(c, kind, x, y, 26, '#ffffff');
  if (!ok) { MONC.cells.set(kind, -1); return -1; }
  MONC.cells.set(kind, i); MONC.tex.needsUpdate = true;
  return i;
}
const lin = (hex) => new THREE.Color(hex);   // three の色は線形（ColorManagement）
const MATS = new Map();
// tint：humans_dress.js の soldierTint（遠い兵の束と同じ家の色）{ lac, lace, hat, cloth }。mon：陣笠の紋の鍵（L.mon）。gold：紋を金か朱か
export function k697Material(tint, mon, shu = false) {
  const t = tint || {};
  const key = [t.lac, t.lace, t.hat, t.cloth, mon, shu].join('|');
  let m = MATS.get(key);
  if (m) return m;
  const cell = monCell(mon);
  m = K697.baseMat.clone();
  m.side = THREE.DoubleSide;
  const U = {
    uLac: { value: lin(t.lac ?? 0x24221f) }, uLace: { value: lin(t.lace ?? 0x5a4630) }, uHat: { value: lin(t.hat ?? t.lac ?? 0x24221f) },
    uCloth: { value: lin(t.cloth ?? 0x7c6042) }, uMon: { value: MONC.tex }, uMonCell: { value: new THREE.Vector3(cell % MON_N, Math.floor(cell / MON_N), cell >= 0 ? 1 : 0) },
    uMonCol: { value: lin(shu ? 0x8a2a1c : 0xc4a048) },
  };
  m.userData.k697U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // 升（4×4・一升 512px）ごとに、家の色へ差し替える（明るさの比は保つ）
        vec2 tq = vMapUv * 4.0; vec2 ti = floor(tq); vec2 tf = fract(tq);
        vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        if (ti.x == 2.0 && ti.y == 1.0) {
          // 小袖：茶の木綿（0.20 前後）を家の布の色へ
          diffuseColor.rgb = uCloth * (l / 0.13);
        } else if (ti.x == 3.0 && ti.y == 1.0 || ti.x == 3.0 && ti.y == 2.0 && c.b > c.r * 1.3) {
          // 股引・籠手の家地：紺（青は使わない kaito 10/29）を家の布の色の濃いめへ
          diffuseColor.rgb = uCloth * 0.45 * (l / 0.042);
        } else if ((ti.x == 0.0 || ti.x == 1.0) && ti.y == 2.0) {
          // 胴・草摺：黒漆を家の漆へ、草摺の紺の縅を家の縅へ（鋲の真鍮は残す）
          if (ti.x == 1.0 && c.b > c.r * 1.6) diffuseColor.rgb = uLace * (l / 0.12);
          else if (l < 0.06) diffuseColor.rgb = uLac * (l / 0.022);
        } else if (ti.x == 0.0 && ti.y == 3.0) {
          // 陣笠：黒漆を家の笠の色へ、真ん中に家の紋（金か朱）。縁の朱は残す
          vec2 p = tf - 0.5; float r = length(p);
          if (l < 0.03) diffuseColor.rgb = uHat * (l / 0.008);
          if (r < 0.2) {
            float mk = 0.0;
            if (uMonCell.z > 0.5) { vec2 mu = (uMonCell.xy + 0.5 + p / 0.2 * 0.5 * 0.86) / ${MON_N}.0; mk = 1.0 - texture2D(uMon, mu).g; }
            diffuseColor.rgb = mix(uHat * 0.9, uMonCol, smoothstep(0.35, 0.65, mk));
          }
        }
      }`);
    sh.fragmentShader = 'uniform vec3 uLac, uLace, uHat, uCloth, uMonCol; uniform vec3 uMonCell; uniform sampler2D uMon;\n' + sh.fragmentShader;
  };
  m.customProgramCacheKey = () => 'k697';
  MATS.set(key, m);
  return m;
}
// 足軽をこの形にするか（u.type・姿だけで決める＝人の使い回しの鍵 humanPoolKey と同じ物から）
export const K697_ON = { on: typeof location === 'undefined' || !/[?&]k697=0/.test(location.search), n: 0 };
export function k697Want(u, L) {
  if (!K697_ON.on || !K697.ready || !u || u.isPlayer || u.mounted || u.bakeRig || u.type !== 'ashigaru') return false;   // 焼きの作り物（crowd_vat.js）は今の形のまま（中景の束は手順1の次の段）
  if (!L || L.hero || L.hero9 || L.sohei || L.kosode || L.nanban || L.officer || L.kacchu || L.takedaRed && false) return false;
  if ((L.tier ?? 0) >= 1 || typeof L.face === 'string') return false;
  return true;
}
// 今の骨の人 h に着せる。体（見本の体）は隠し、K697 の形を同じ骨へ付ける。手の皮（MakeHuman の手）・顔・具足の部品は作らない
export function dressK697(h, tint, mon, shu) {
  const B = h.bones;
  const bones = K697.names.map((n) => B[n]);
  if (bones.some((b) => !b)) return null;
  const m = new THREE.SkinnedMesh(K697.lod[0], k697Material(tint, mon, shu));
  m.name = 'k697';
  m.bind(new THREE.Skeleton(bones, K697.inv), K697.bind);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = true;
  m.boundingSphere = K697.sphere;
  m.userData.k697 = true;
  h.model.add(m);
  // 骨の位置を K697 の比へ（動きが位置を書いた後にも毎コマ戻す：k697Pose）
  const T = [];
  for (const n in K697.T) { const b = B[n]; if (b && n !== 'Hips') { b.position.copy(K697.T[n]); b.updateMatrix(); T.push(b, K697.T[n]); } }
  h.k697T = T; h.k697F = K697.f;
  if (B.Hips) { B.Hips.position.multiplyScalar(K697.f); B.Hips.updateMatrix(); }
  h.body.visible = false;
  h.parts.k697 = m;
  h.root.userData.k697 = true;
  // 段：描く直前にカメラとの距離で形を替える（影は中の形から）
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    let lv;
    if (cam.isOrthographicCamera) lv = h.k697D2 > K697_LOD[1] * K697_LOD[1] ? 2 : 1;
    else {
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2; h.k697D2 = d2;
      lv = d2 < K697_LOD[0] * K697_LOD[0] ? 0 : d2 < K697_LOD[1] * K697_LOD[1] ? 1 : 2;
    }
    const g = K697.lod[lv]; if (m.geometry !== g) m.geometry = g;
  };
  K697_ON.n++;
  return m;
}
// 毎コマ、録った動き（骨の位置も書く）の後で骨の位置を K697 の比へ戻す（humans_animate.js）
export function k697Pose(h) {
  const T = h.k697T;
  for (let i = 0; i < T.length; i += 2) T[i].position.copy(T[i + 1]);
  const hp = h.bones.Hips; if (hp) hp.position.multiplyScalar(h.k697F);
}

// ---- 中景（VAT の焼いた動きの束・crowd_vat.js）へ同じ形を：中の段（3,000 三角）を、今の焼いた骨（見本の骨の比・骨 16 本）の座標へ写す ----
// 頂点ごとに K697 の骨の座標（K697.inv）で表し、同じ名の見本の骨の立ち姿（restMatrix）で人の根元の座標へ戻す（骨の長さの差は中景では見えない）。
// 色は絵の一枚を頂点ごとに引いて家の色を掛けた物（束の材質は頂点の色で描く）。形は家が違っても一つ（色だけ家ごと）
const CBMAP = (n) => {
  if (/^(Left|Right)Hand/.test(n)) return n.match(/^(Left|Right)/)[1] + 'Hand';
  if (/^(Left|Right)(Foot|ToeBase|Toe_End)/.test(n)) return n.match(/^(Left|Right)/)[1] + 'Foot';
  if (/^(Left|Right)ForeArm/.test(n)) return n.match(/^(Left|Right)/)[1] + 'ForeArm';
  if (/^(Left|Right)Arm/.test(n)) return n.match(/^(Left|Right)/)[1] + 'Arm';
  if (/^(Left|Right)Shoulder/.test(n)) return 'Spine2';
  if (/^(Left|Right)(UpLeg|Leg)$/.test(n)) return n;
  if (n === 'Spine') return 'Spine1';
  if (n === 'Neck' || /^Head/.test(n)) return 'Head';
  if (n === 'Hips' || n === 'Spine1' || n === 'Spine2') return n;
  return 'Spine1';
};
let ATLAS_PX = null;   // 色の絵を 256 角に縮めた画素（頂点の色を引く）
function atlasPx() {
  if (ATLAS_PX) return ATLAS_PX;
  const img = K697.baseMat?.map?.image; if (!img || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, 256, 256);
  ATLAS_PX = cx.getImageData(0, 0, 256, 256).data;
  return ATLAS_PX;
}
const s2l = (x) => Math.pow(x / 255, 2.2);
const _c = new THREE.Color();
// 升ごとの家の色（材質の差し替えと同じ決め）。戻り：線形の色と素材の印（units_model.js の MK：布 0・漆 1・肌 2・鉄 3・藁 6）
function vatColor(u, v, T, out) {
  const P = atlasPx(); const x = Math.min(255, Math.max(0, Math.floor(u * 256))), y = Math.min(255, Math.max(0, Math.floor(v * 256)));
  const o = (y * 256 + x) * 4; let r = s2l(P[o]), g = s2l(P[o + 1]), b = s2l(P[o + 2]);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, tx = Math.floor(u * 4), ty = Math.floor(v * 4);
  let mk = 0;
  const set = (hex, k) => { _c.set(hex); r = _c.r * k; g = _c.g * k; b = _c.b * k; };
  if (tx < 2 && ty < 2 || tx === 2 && ty === 0 || tx === 3 && ty === 0) mk = 2;            // 顔・肌・目
  else if (tx === 2 && ty === 1) set(T.cloth ?? 0x7c6042, l / 0.13);
  else if (tx === 3 && ty === 1) set(T.cloth ?? 0x7c6042, 0.45 * l / 0.042);
  else if (tx === 3 && ty === 2) { mk = 1; if (b > r * 1.3) { set(T.cloth ?? 0x7c6042, 0.45 * l / 0.042); mk = 0; } }
  else if ((tx === 0 || tx === 1) && ty === 2) { mk = 1; if (tx === 1 && b > r * 1.6) { set(T.lace ?? 0x5a4630, l / 0.12); mk = 0; } else if (l < 0.06) set(T.lac ?? 0x24221f, l / 0.022); else mk = 3; }
  else if (tx === 2 && ty === 2) mk = 3;
  else if (tx === 0 && ty === 3) { mk = 1; if (l < 0.03) set(T.hat ?? T.lac ?? 0x24221f, l / 0.008); }
  else if (tx === 1 && ty === 3) mk = 6;
  out[0] = Math.min(1, r); out[1] = Math.min(1, g); out[2] = Math.min(1, b);
  return mk;
}
const VBASES = [];
function vatBase(lv = 1) {
  if (VBASES[lv]) return VBASES[lv];
  if (!K697.ready || !SRC || !SRC.template || !atlasPx()) return null;
  const base = K697.lod[lv], idx = base.index.array, A = base.attributes;
  const used = new Map(), list = [];
  for (let i = 0; i < idx.length; i++) if (!used.has(idx[i])) { used.set(idx[i], list.length); list.push(idx[i]); }
  const n = list.length, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uvO = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const M = {}; const v = new THREE.Vector3(), w = new THREE.Vector3(), nv = new THREE.Vector3(), nm3 = new THREE.Matrix3();
  const mat = (cb) => { if (M[cb]) return M[cb]; const k = K697.names.indexOf(cb); const m = restMatrix(cb).clone().multiply(K697.inv[k]); return (M[cb] = { m, n: new THREE.Matrix3().getNormalMatrix(m), ai: ALLB.indexOf(cb) }); };
  for (let o = 0; o < n; o++) {
    const i = list[o];
    const acc = new Map();
    for (let k = 0; k < 4; k++) { const wt = A.skinWeight.getComponent(i, k); if (!(wt > 0)) continue; const cb = CBMAP(K697.names[A.skinIndex.getComponent(i, k)]); acc.set(cb, (acc.get(cb) || 0) + wt); }
    const ws = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4); const tot = ws.reduce((s, x) => s + x[1], 0) || 1;
    w.set(0, 0, 0); nv.set(0, 0, 0);
    ws.forEach(([cb, wt], k) => { const E = mat(cb); v.fromBufferAttribute(A.position, i).applyMatrix4(E.m); w.addScaledVector(v, wt / tot);
      v.fromBufferAttribute(A.normal, i).applyMatrix3(E.n); nv.addScaledVector(v, wt / tot); si[o * 4 + k] = E.ai; sw[o * 4 + k] = wt / tot; });
    nv.normalize();
    pos.set([w.x, w.y, w.z], o * 3); nrm.set([nv.x, nv.y, nv.z], o * 3);
    uvO[o * 2] = A.uv.getX(i); uvO[o * 2 + 1] = A.uv.getY(i);
  }
  // 面の向き：束の材質は携帯で片面（K697 の材質は両面）。写した先は前後が返る（restMatrix の z が負）うえ、陣笠・草鞋・草摺の薄い殻は面の巻きが揃っていない。
  //   面ごとに、巻きの向き（外積）を頂点の法線の和へそろえる（陣笠のつばの上・草鞋の上が消えて裸足・笠なしに見えた）
  const ix = new Uint16Array(idx.length), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3(), pa = new THREE.Vector3();
  const P3 = (o, out) => out.set(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = used.get(idx[t]), b = used.get(idx[t + 1]), c2 = used.get(idx[t + 2]);
    P3(a, pa); P3(b, e1).sub(pa); P3(c2, e2).sub(pa); cr.crossVectors(e1, e2);
    const d = cr.x * (nrm[a * 3] + nrm[b * 3] + nrm[c2 * 3]) + cr.y * (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c2 * 3 + 1]) + cr.z * (nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c2 * 3 + 2]);
    ix[t] = a; if (d >= 0) { ix[t + 1] = b; ix[t + 2] = c2; } else { ix[t + 1] = c2; ix[t + 2] = b; }
  }
  VBASES[lv] = { n, pos, nrm, uvO, si, sw, ix }; K697.vb = VBASES;
  return VBASES[lv];
}
const VGEO = new Map();
// 家ごとの中景の形（crowd_vat.js の addShape へ渡す。形の鍵は一つ＝形は全員で一つ、色だけ家ごと）。plainUv：兵の絵の無地の所
//   lv：1 中の段（3,000）・0 近い段（12,000。パソコンの束の 15m 内）
export function k697VatGeo(tint, plainUv, lv = 1) {
  const B = vatBase(lv); if (!B) return null;
  const T = tint || {}, key = [T.lac, T.lace, T.hat, T.cloth, lv].join('|');
  if (VGEO.has(key)) return VGEO.get(key);
  const g = new THREE.BufferGeometry(), n = B.n;
  g.setAttribute('position', new THREE.BufferAttribute(B.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3));
  const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = plainUv[0]; uv[i * 2 + 1] = plainUv[1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(B.si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(B.sw, 4));
  const col = new Float32Array(n * 3), mtl = new Float32Array(n), c = [0, 0, 0];
  for (let i = 0; i < n; i++) { const mk = vatColor(B.uvO[i * 2], B.uvO[i * 2 + 1], T, c); col.set(c, i * 3); mtl[i] = mk + mk * 8 + 0.35 * 0.9; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('col2', new THREE.BufferAttribute(col, 3)); g.setAttribute('mtl', new THREE.BufferAttribute(mtl, 1));
  g.setIndex(new THREE.BufferAttribute(B.ix, 1));
  g.userData.shapeKey = 'k697_' + lv; g.userData.k697 = true;
  VGEO.set(key, g);
  return g;
}
