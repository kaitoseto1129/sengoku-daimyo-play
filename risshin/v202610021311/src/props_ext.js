// 外の素材の小道具（桶・樽・荷車・箱・俵袋・行灯・農具・木器）の読み込み口。
// 素材：assets/props_ext/props.glb（Sketchfab の CC BY 4.0 の小物を軽くしてまとめた物。出所は docs/CREDITS.md）を
// base64 にした asset_props_ext.js（tools/glb2js.mjs で作る）。必要になった時だけ遅れて読む（最初の題の画面までには読まない）。
// 使い方：
//   extScatter(parent, 'barrel', [{ x, z, rot, s }], world)   // 同じ形を InstancedMesh で並べる（読めるまでは何も出ない）
//   extReplace(旧い手作りの Mesh, 'cart', { rot0, s })        // 読めたら旧い物を隠して、同じ場所に素材の形を出す
// 形は名前で呼ぶ：bucket barrel tub sack cart box_a box_b crate andon tool0〜tool4 woodtub basin woodpot（高さは m。足元が y=0）
import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let LIB = null;          // 名前 -> [{ geo, mat }]
let loading = null;
const waiting = [];

// 画質「低」では外の素材を使わない（携帯の重さを増やさない。手作りの軽い形のまま）
const low = () => SETTINGS.quality === 'low';
const off = () => typeof window !== 'undefined' && (window.__norender === true || (typeof location !== 'undefined' && /[?&]norender/.test(location.search)));

// 量子化された（整数の）属性を普通の浮動小数にする
function toFloat(a) {
  if (a.array instanceof Float32Array) return a;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = [a.getX, a.getY, a.getZ, a.getW][k].call(a, i);
  return new THREE.BufferAttribute(out, a.itemSize);
}

// base64 の glb を読んで、名前 -> 部品 の表にする
async function readLib(b64) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
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
        m = new THREE.MeshLambertMaterial({ map: src.map || null, color: src.map ? 0xffffff : src.color, side: THREE.DoubleSide, alphaTest: src.alphaMode === 'MASK' ? 0.5 : 0 });
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
    LIB = await readLib((await import('./asset_props_ext.js')).default);
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
  if (!kLoading && !off()) kLoading = import('./asset_kiyosu.js').then((m) => readLib(m.default)).then((l) => { KIYOSU = l; }).catch(() => {});
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
// 町に入る前に、手の空いた時に読んでおく（最初の題の画面までには読まない）
if (typeof window !== 'undefined') setTimeout(() => { try { loadPropsExt(); } catch (e) { /* なし */ } }, 20000);
