// 外の素材の小道具（桶・樽・荷車・箱・俵袋・行灯・農具・木器）の読み込み口。
// 素材：assets/props_ext/props.glb（Sketchfab の CC BY 4.0 の小物を軽くしてまとめた物。出所は docs/CREDITS.md）を
// base64 にした asset_props_ext.js（tools/glb2js.mjs で作る）。必要になった時だけ遅れて読む（最初の題の画面までには読まない）。
// 使い方：
//   extScatter(parent, 'barrel', [{ x, z, rot, s }], world)   // 同じ形を InstancedMesh で並べる（読めるまでは何も出ない）
//   extReplace(旧い手作りの Mesh, 'cart', { rot0, s })        // 読めたら旧い物を隠して、同じ場所に素材の形を出す
// 形は名前で呼ぶ：bucket barrel tub sack cart box_a box_b crate andon tool0〜tool4 woodtub basin woodpot（高さは m。足元が y=0）
import * as THREE from 'three';
import { assetBytes } from './bin_assets.js';
import { S as SETTINGS } from './settings.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let LIB = null;          // 名前 -> [{ geo, mat }]
let loading = null;
const waiting = [];

// 画質「低」では外の素材を使わない（携帯の重さを増やさない。手作りの軽い形のまま）
const low = () => false;
const off = () => typeof window !== 'undefined' && (window.__norender === true || (typeof location !== 'undefined' && /[?&]norender/.test(location.search)));

// 量子化された（整数の）属性を普通の浮動小数にする
function toFloat(a) {
  if (a.array instanceof Float32Array) return a;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = [a.getX, a.getY, a.getZ, a.getW][k].call(a, i);
  return new THREE.BufferAttribute(out, a.itemSize);
}

// base64 の glb を読んで、名前 -> 部品 の表にする
async function readLib(buf) {
  const gl = await new GLTFLoader().parseAsync(buf.buffer, '');
  gl.scene.updateMatrixWorld(true);
  const lib = {}, mats = new Map();
  for (const grp of gl.scene.children) {
    const parts = [];
    grp.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) g.setAttribute(k, toFloat(g.attributes[k]));
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingSphere();
      let m = mats.get(o.material);
      if (!m) {
        const src = o.material;
        m = new THREE.MeshLambertMaterial({ map: src.map || null, color: src.map || src.vertexColors ? 0xffffff : src.color, vertexColors: !!src.vertexColors, side: THREE.DoubleSide, alphaTest: src.alphaMode === 'MASK' ? 0.5 : 0 });
        if (m.map) { m.map.anisotropy = 1; m.map.colorSpace = THREE.SRGBColorSpace; }
        mats.set(o.material, m);
      }
      parts.push({ geo: g, mat: m });
    });
    lib[grp.name] = parts;
  }
  return lib;
}

export function loadPropsExt() {
  if (loading) return loading;
  if (off()) return (loading = Promise.resolve(null));
  loading = (async () => {
    LIB = await readLib(await assetBytes('props_ext'));
    for (const f of waiting.splice(0)) { try { f(); } catch (e) { /* 一つの失敗で他を止めない */ } }
    return LIB;
  })().catch(() => { loading = null; return null; });
  return loading;
}

// 清洲城の天守（遠景用・約3万面。画質「低」では使わない）。読めていれば今すぐ並べて true、まだなら読み込みを始めて false
let KIYOSU = null, kLoading = null;
export function extKiyosu(parent, x, z, rot, s, world) {
  if (low()) return false;
  if (KIYOSU) {
    for (const { geo, mat } of KIYOSU.kiyosu) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, world.heightAt(x, z) - 0.2, z); m.rotation.y = rot; m.scale.setScalar(s);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.userData.ext = true;
      parent.add(m);
    }
    return true;
  }
  if (!kLoading && !off()) kLoading = assetBytes('kiyosu').then(readLib).then((l) => { KIYOSU = l; }).catch(() => {});
  return false;
}

// 読めたら f を呼ぶ（もう読めていればすぐ）。読めない時は何もしない（旧い手作りの形のまま）
function whenReady(f) {
  if (LIB) { f(); return; }
  waiting.push(f);
  loadPropsExt();
}

export const extHas = (name) => !!(LIB && LIB[name]);

// list：[{ x, z, rot = 0, s = 1, y? }]（y が無ければ world.heightAt）。parent に InstancedMesh を足す
export function extScatter(parent, name, list, world, o = {}) {
  if (!list.length || low()) return;
  whenReady(() => {
    const parts = LIB[name];
    if (!parts) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const { geo, mat } of parts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((e, i) => {
        const s = e.s ?? 1;
        p.set(e.x, e.y ?? ((world ? world.heightAt(e.x, e.z) : 0) + (e.dy || 0)), e.z);
        q.setFromAxisAngle(up, e.rot || 0);
        im.setMatrixAt(i, m4.compose(p, q, sc.set(s, s, s)));
      });
      im.castShadow = o.shadow !== false; im.receiveShadow = true;
      im.frustumCulled = false; im.userData.ext = true;
      parent.add(im);
    }
  });
}

// 旧い手作りの Mesh（position・rotation.y を持つ）を、読めたら隠して素材の形に替える
export function extReplace(old, name, o = {}) {
  whenReady(() => {
    if (!LIB[name] || !old.parent) return;
    old.visible = false; old.userData.extOld = true;
    const c = Math.cos(old.rotation.y + (o.rot0 || 0)), s0 = Math.sin(old.rotation.y + (o.rot0 || 0));
    const dx = o.dx || 0, dz = o.dz || 0;
    extScatter(old.parent, name, [{ x: old.position.x + dx * c + dz * s0, y: old.position.y, z: old.position.z - dx * s0 + dz * c, rot: old.rotation.y + (o.rot0 || 0), s: o.s ?? 1 }], null, o);
  });
}

// 旧い物（Mesh でも Group でも）を、読めたら隠して、list の位置に素材の形を並べる。name が配列なら、list の e.n で形を選ぶ
export function extSwap(old, list, world, o = {}) {
  whenReady(() => {
    const names = [...new Set(list.map((e) => e.n))];
    if (!names.every((n) => LIB[n])) return;
    old.visible = false; old.userData.extOld = true;
    for (const n of names) extScatter(old.parent || old, n, list.filter((e) => e.n === n), world, o);
  });
}

// 読めていれば今すぐ並べて true（呼んだ側は手作りの形を作らない）。まだなら読み込みを始めて false（今回は手作りの形。次の入りから素材）。
// 町のように、置き物を後でまとめる（mergeStatic）所では、あとから隠せないので、こちらを使う
export function extFirst(parent, name, list, world, o = {}) {
  if (low()) return false;
  if (!LIB || !LIB[name]) { loadPropsExt(); return false; }
  extScatter(parent, name, list, world, o);
  return true;
}
// ---- 建物の素材（asset_bldg.js：城の門の屋根・民家・寺の屋根。Sketchfab の CC BY 4.0。出所は docs/CREDITS.md。tools/bldg.mjs で作る） ----
// 手作りの形を先に作っておき、素材が読めたら手作りの屋根・家を隠して素材に替える（読めない・携帯「低」・?norender は手作りのまま）。
let BLDG = null, bLoading = null;
const bWaiting = [];
export function loadBldg() {
  if (bLoading) return bLoading;
  if (off()) return (bLoading = Promise.resolve(null));
  bLoading = assetBytes('bldg').then(readLib).then((l) => {
    BLDG = l;
    for (const f of bWaiting.splice(0)) { try { f(); } catch (e) { /* 一つの失敗で他を止めない */ } }
    return l;
  }).catch(() => { bLoading = null; return null; });
  return bLoading;
}
function whenBldg(f) { if (BLDG) f(); else { bWaiting.push(f); loadBldg(); } }
const hash01 = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

// 材質の色合いの違い（同じ形の家が同じ色に見えないよう三通り。材質は形ごとに使い回す）
const TINT = [[1, 1, 1], [0.86, 0.88, 0.91], [1.07, 1.02, 0.94]];
const tinted = new Map();
function tintMat(src, v) {
  if (!v) return src;
  let a = tinted.get(src); if (!a) tinted.set(src, (a = []));
  if (!a[v]) { a[v] = src.clone(); a[v].color.setRGB(TINT[v][0], TINT[v][1], TINT[v][2]); }
  return a[v];
}
// 大屋根は四メートル角の区画へ。三角を丸ごと振り分け、継ぎ目も細部も変えない。
// 区画で使う頂点だけ一度写し、形を使い回す。三角の重複は作らない。
const roofSections = new WeakMap();
function roofBatch(geo, mat, margin = 0.3) {
  let sections = roofSections.get(geo);
  if (!sections) {
    const cells = new Map(), P = geo.attributes.position, I = geo.index;
    const count = I ? I.count : P.count;
    for (let i = 0; i < count; i += 3) {
      const a = I ? I.getX(i) : i, b = I ? I.getX(i + 1) : i + 1, c = I ? I.getX(i + 2) : i + 2;
      const key = Math.floor((P.getX(a) + P.getX(b) + P.getX(c)) / 12) + ',' + Math.floor((P.getZ(a) + P.getZ(b) + P.getZ(c)) / 12);
      let cell = cells.get(key); if (!cell) cells.set(key, cell = []);
      cell.push(a, b, c);
    }
    sections = [];
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (const indices of cells.values()) {
      const g = new THREE.BufferGeometry();
      const ids = [], remap = new Map(), local = [];
      for (const i of indices) {
        if (!remap.has(i)) { remap.set(i, ids.length); ids.push(i); }
        local.push(remap.get(i));
      }
      for (const name of Object.keys(geo.attributes)) {
        const a = geo.attributes[name], src = a.isInterleavedBufferAttribute ? a.data.array : a.array;
        const stride = a.isInterleavedBufferAttribute ? a.data.stride : a.itemSize, offset = a.isInterleavedBufferAttribute ? a.offset : 0;
        const values = new src.constructor(ids.length * a.itemSize);
        for (let j = 0; j < ids.length; j++) for (let k = 0; k < a.itemSize; k++) values[j * a.itemSize + k] = src[ids[j] * stride + offset + k];
        g.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize, a.normalized));
      }
      g.setIndex(local);
      box.makeEmpty();
      for (const i of indices) box.expandByPoint(v.fromBufferAttribute(P, i));
      g.boundingBox = box.clone(); g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      sections.push(g);
    }
    roofSections.set(geo, sections);
  }
  let vertices = 0, indices = 0;
  for (const g of sections) { vertices += g.attributes.position.count; indices += g.index.count; }
  const mesh = new THREE.BatchedMesh(sections.length, vertices, indices, mat);
  // 転送時だけ球を広げ、共有した形は元へ戻す。
  for (const g of sections) {
    const radius = g.boundingSphere.radius;
    g.boundingSphere.radius += margin;
    try { mesh.addGeometry(g); } finally { g.boundingSphere.radius = radius; }
  }
  mesh.perObjectFrustumCulled = true; mesh.sortObjects = false; mesh.frustumCulled = false;
  return mesh;
}
function addParts(parent, name, f, o = {}) {
  const sc = new THREE.Group(); sc.userData.ext = true; sc.name = name;
  for (const { geo, mat } of BLDG[name]) {
    const geometry = f ? f(geo) : geo, material = tintMat(mat, o.tint || 0);
    const m = name === 'temple_roof' ? roofBatch(geometry, material, o.margin) : new THREE.Mesh(geometry, material);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    sc.add(m);
  }
  parent.add(sc);
  return sc;
}

// 冠木門の屋根：素材の瓦屋根を、棟に沿って横へ伸ばす（両端の形は伸ばさない）。old（手作りの屋根）は隠す。
// m：門の Group（原点が門の真ん中・向きは門に合わせてある）、w：柱の間、H：柱の高さ
const roofCache = new Map();
export function extGateRoof(m, old, w, H) {
  if (off()) return;
  whenBldg(() => {
    if (!BLDG.gate_roof) return;
    const L = w + 2.6, key = L.toFixed(1);
    let geos = roofCache.get(key);
    if (!geos) {
      const half = L / 2, xm = 0.5, sE = 1.15, A = (half - (1.42 - xm) * sE) / xm, sz = 1.3;
      geos = BLDG.gate_roof.map(({ geo, mat }) => {
        const g = geo.clone(), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), ax = Math.abs(x);
          P.setXYZ(i, Math.sign(x) * (ax <= xm ? ax * A : xm * A + (ax - xm) * sE), P.getY(i) * 1.1, P.getZ(i) * sz);
        }
        g.computeBoundingSphere();
        return { geo: g, mat };
      });
      roofCache.set(key, geos);
    }
    for (const { geo, mat } of geos) {
      const r = roofBatch(geo, mat);
      if (!r.isBatchedMesh) r.frustumCulled = false;
      r.position.y = H + 0.2; r.castShadow = true; r.receiveShadow = true; r.userData.ext = true; r.userData.camBlock = true; r.name = 'gate_roof';
      m.add(r);
    }
    old.visible = false; old.userData.extOld = true;
  });
}

// 村の家（茅葺き）：素材の民家（壁・戸・縁・茅の寄棟）。hut() の w×d（身舎）と高さ h に合わせて伸ばし、向き（正面 +z）は hut と同じ。
// 手作りの壁と屋根（olds）は隠す。画質「低」は使わない（家が何軒も並ぶので軽く）
export function extMinka(grp, olds, w, d, h, seed) {
  if (low() || off()) return;
  whenBldg(() => {
    if (!BLDG.minka) return;
    const r1 = hash01(seed, 1), r2 = hash01(seed, 2), r3 = hash01(seed, 3);
    const sx = (w / 9.03) * (0.94 + r1 * 0.12), sz = (d / 4.1) * (0.94 + r2 * 0.12), sy = (h / 2.76) * (0.96 + r3 * 0.08);
    const g = addParts(grp, 'minka', null, { tint: Math.floor(r1 * 3) % 3 });
    g.scale.set(sx, sy, sz); g.position.y = -0.2;
    for (const o of olds) { o.visible = false; o.userData.extOld = true; }
  });
}

// 寺の堂の大屋根：素材の切妻の瓦屋根（両の妻は壁つき）。棟は堂の幅（x）に沿う。olds（手作りの瓦屋根と棟）は隠す。
// w×d は堂の身舎、ey は軒の高さ。画質「低」は使わない
export function extTempleRoof(grp, olds, w, d, ey) {
  if (low() || off()) return;
  whenBldg(() => {
    if (!BLDG.temple_roof) return;
    // 素材は棟 16.7m（x）・奥行き 18.7m（z）・高さ 6.4m。堂の大屋根（軒の出 2.4m）に合わせる
    const sx = (w + 4.8) / 16.7, sz = (d + 4.8) / 18.7;
    const sy = Math.min(0.95, 0.5 + sz * 0.5);
    const g = addParts(grp, 'temple_roof', null, { margin: 0.3 / Math.min(sx, sy, sz) });
    g.scale.set(sx, sy, sz); g.position.y = ey - 0.1;
    for (const o of olds) { o.visible = false; o.userData.extOld = true; }
  });
}

// 小道具は配置する場面からだけ読む。題で待っている間には展開しない。
