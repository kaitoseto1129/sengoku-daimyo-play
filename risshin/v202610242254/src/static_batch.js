// 静かな物の束（手 2・10/21）：戦の場面に置かれた動かない Mesh（木・建物・岩・柵など。兵の部品は除く）を、材質ごとに一つの BatchedMesh にまとめて描く。
//   一つずつ描いていた 200 前後の描く回数（影の分も）を材質の数へ減らす。元の Mesh は場面に残し（当たり・カメラの遮り・raycast は元のまま）、
//   層（layers）を 0 にして描かないだけ。LOD の子は毎コマ visible を写し、行列が変わった物（扉・崩れ）は 10 コマごとに見つけて元に戻す。
//   元の形の GPU の写しは返す（同じ形をほかで使っていなければ）。three r160 の BatchedMesh（影の深さの材質も batching に対応）。
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

const qs = typeof location !== 'undefined' ? location.search : '';
export const SBATCH = { on: !/[?&]sbatch=0/.test(qs), minN: 6, maxVerts: MEM_TIGHT ? 300000 : 600000, stat: { groups: 0, meshes: 0, verts: 0, moved: 0, ms: 0 } };

const _m = new THREE.Matrix4();
function chainVisible(o, scene) {
  for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; }
  return false;
}
function attrKey(g) {
  const names = Object.keys(g.attributes).sort();
  return names.map((n) => { const a = g.attributes[n]; return n + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) + ':' + a.array.constructor.name; }).join(',') + (g.index ? '+i' : '');
}
function candidate(o, mat) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || !o.visible) return false;
  if (!mat || Array.isArray(mat) || mat.transparent || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial)) return false;
  if (Object.hasOwn(o, 'onBeforeRender') || Object.hasOwn(o, 'onAfterRender') || o.morphTargetInfluences || o.userData.lod || o.userData.noBatch) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || g.groups.length > 1 || g.attributes.position.count > 200000) return false;
  if (o.layers.mask !== 1 || o.renderOrder !== 0) return false;
  return true;
}

// 戦の場面を一度だけ走査して束を作る（開戦の 1.5 秒後。units の根の下は見ない）
export function staticBatchBuild(rt) {
  const scene = rt.scene; if (!scene || !SBATCH.on) return;
  const t0 = performance.now();
  const unitRoots = new Set(); for (const u of rt.army.units) if (u.mesh) unitRoots.add(u.mesh);
  const moving = new Set((rt.army.structs || []).map(s => s.mesh));
  const groups = new Map(), geoUse = new Map();
  const walk = (o) => {
    if (unitRoots.has(o) || moving.has(o) || o === rt.sbRoot || o.userData?.flag || o.userData?.noFreeze ||
      typeof o.userData?.open === 'function' || typeof o.userData?.fall === 'function') return;
    if (o.isMesh && o.geometry) geoUse.set(o.geometry, (geoUse.get(o.geometry) || 0) + 1);
    const mat = o.material;
    if (candidate(o, mat)) {
      o.updateWorldMatrix(true, false);
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const center = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const cell = Math.floor(center.x / 32) + ',' + Math.floor(center.z / 32);
      const k = cell + '|' + mat.uuid + '|' + attrKey(o.geometry) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      let G = groups.get(k); if (!G) { G = { mat, list: [] }; groups.set(k, G); }
      G.list.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
  const root = new THREE.Group(); root.name = 'static-batch'; root.updateMatrix(); root.matrixAutoUpdate = false;
  const B = { root, batches: [], entries: [], frame: 0 };
  for (const G of groups.values()) {
    if (G.list.length < SBATCH.minN) continue;
    // 頂点の上限で分ける
    let cur = null;
    const flush = () => { if (cur && cur.items.length >= 2) B.batches.push(cur); else if (cur) { for (const it of cur.items) it.o.layers.mask = 1; } cur = null; };
    for (const o of G.list) {
      const vc = o.geometry.attributes.position.count, ic = o.geometry.index ? o.geometry.index.count : 0;
      if (!cur || cur.v + vc > SBATCH.maxVerts) { flush(); cur = { mat: G.mat, items: [], v: 0, i: 0, cast: o.castShadow, recv: o.receiveShadow }; }
      cur.items.push({ o, vc, ic }); cur.v += vc; cur.i += ic;
    }
    flush();
  }
  for (const bt of B.batches) {
    let bm;
    try {
      bm = new THREE.BatchedMesh(bt.items.length, bt.v, bt.i || undefined, bt.mat);
      bm.castShadow = bt.cast; bm.receiveShadow = bt.recv; bm.frustumCulled = true; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
      bm.updateMatrix(); bm.matrixAutoUpdate = false; bm.name = 'static-batch';
      for (const it of bt.items) {
        const o = it.o;
        o.updateWorldMatrix(true, false);
        const id = bm.addGeometry(o.geometry);
        bm.setMatrixAt(id, o.matrixWorld);
        const e = { o, bm, id, m: o.matrixWorld.clone(), vis: true, back: false };
        B.entries.push(e); it.e = e;
      }
    } catch (err) {
      SBATCH.stat.err = String(err && err.message || err);
      for (const it of bt.items) if (it.e) { it.e.back = true; }
      if (bm) { bm.dispose?.(); }
      continue;
    }
    bm.computeBoundingBox(); bm.computeBoundingSphere();
    root.add(bm);
    for (const it of bt.items) { it.o.layers.mask = 0; SBATCH.stat.meshes++; SBATCH.stat.verts += it.vc; }
    SBATCH.stat.groups++;
    bt.bm = bm;
  }
  B.entries = B.entries.filter((e) => !e.back);
  // 束に写した形で、ほかの物が使っていない物は GPU の写しを返す（元の配列は raycast のために残る。戻す時は three が送り直す）
  const onlyHere = new Map();
  for (const e of B.entries) onlyHere.set(e.o.geometry, (onlyHere.get(e.o.geometry) || 0) + 1);
  for (const [g, n] of onlyHere) if (geoUse.get(g) === n) g.dispose();
  scene.add(root);
  rt.sbRoot = root; rt.sb = B;
  SBATCH.stat.ms = Math.round(performance.now() - t0);
}

// 毎コマ：LOD などで visible が変わった物を写す。10 コマごとに行列の変わった物を元の描き方へ戻す
export function staticBatchTick(rt) {
  if (!SBATCH.on || !rt.scene) return;
  if (!rt.sb) { if (rt.t > 1.5 && rt.army && rt.army.units.length) staticBatchBuild(rt); return; }
  const B = rt.sb, scene = rt.scene;
  // 実機の A/B（x_nosb）：束を切って元の一つずつの描き方に戻す・また束にする
  const off = !!(window.__apx && window.__apx.nosb);
  if (off !== !!B.off) { B.off = off; B.root.visible = !off; for (const e of B.entries) if (!e.back) e.o.layers.mask = off ? 1 : 0; }
  if (off) return;
  const chk = (++B.frame % 10) === 0;
  for (const e of B.entries) {
    if (e.back) continue;
    const o = e.o;
    const vis = chainVisible(o, scene);
    if (vis !== e.vis) { e.vis = vis; e.bm.setVisibleAt(e.id, vis); }
    if (chk && vis) {
      const a = o.matrixWorld.elements, b = e.m.elements;
      let diff = false;
      for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-4) { diff = true; break; }
      if (diff || !o.parent) { e.back = true; e.bm.setVisibleAt(e.id, false); o.layers.mask = 1; SBATCH.stat.moved++; }
    }
  }
}

export function staticBatchDispose(rt) {
  const B = rt.sb; if (!B) return;
  for (const e of B.entries) { e.o.layers.mask = 1; }
  for (const bt of B.batches) if (bt.bm) { bt.bm.geometry.dispose(); }
  if (B.root.parent) B.root.parent.remove(B.root);
  rt.sb = null; rt.sbRoot = null;
  SBATCH.stat.groups = SBATCH.stat.meshes = SBATCH.stat.verts = 0;
}
