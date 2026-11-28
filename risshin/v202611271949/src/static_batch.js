// 静かな物の束（手 2・10/21）：戦の場面に置かれた動かない Mesh（木・建物・岩・柵など。兵の部品は除く）を、材質ごとに一つの BatchedMesh にまとめて描く。
//   一つずつ描いていた 200 前後の描く回数（影の分も）を材質の数へ減らす。元の Mesh は場面に残し（当たり・カメラの遮り・raycast は元のまま）、
//   層（layers）を 0 にして描かないだけ。LOD の子は毎コマ visible を写し、行列が変わった物（扉・崩れ）は 10 コマごとに見つけて元に戻す。
//   元の形の GPU の写しは返す（同じ形をほかで使っていなければ）。three r160 の BatchedMesh（影の深さの材質も batching に対応）。
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

const qs = typeof location !== 'undefined' ? location.search : '';
export const SBATCH = { on: !/[?&]sbatch=0/.test(qs), lean: !/[?&]sblean=0/.test(qs), pack: !/[?&]sbpack=0/.test(qs), minN: 6, maxVerts: MEM_TIGHT ? 300000 : 600000, stat: { groups: 0, meshes: 0, verts: 0, moved: 0, ms: 0, leanMB: 0, leanBack: 0, packMB: 0, posShareMB: 0 } };

// K675（JS の外・11/26 Sanae）：束に写した元の形（ほかで使っていない物）は、当たり（raycast）と大きさの見積もりに要る位置と番号だけを残し、
//   法線・uv・色などの配列は手放す（稲葉山で約31MB。iPhone・iPad は元の形を dispose する時に GPU から読み戻し、戦の間ずっと CPU に持っていた）。
//   配列に触った時（元の描き方へ戻す・ほかの物がこの形を描く・当たりで法線を読む）に、束のその形の取り分から写し戻す。束を捨てる前に残りも戻す。?sblean=0 で前の通り
function leanSource(g, e) {
  const r = e.bm._reservedRanges && e.bm._reservedRanges[e.id]; if (!r) return;
  for (const name in g.attributes) {
    if (name === 'position') continue;
    const a = g.attributes[name], dst = e.bm.geometry.attributes[name];
    if (!a || !dst || a.isInterleavedBufferAttribute || a._poolRef || a._sbLean || a.keepCpu || a.itemSize !== dst.itemSize) continue;
    const d = Object.getOwnPropertyDescriptor(a, 'array');
    let ctor, len;
    if (a._gpuRef) { ctor = a._gpuRef.ctor; len = a._gpuRef.len; }
    else if (d && 'value' in d && d.value) { ctor = d.value.constructor; len = d.value.length; }
    else continue;
    if (len !== a.count * a.itemSize || len * ctor.BYTES_PER_ELEMENT < 4096) continue;
    const src = { dst, start: r.vertexStart * a.itemSize, len, ctor, check: window.__sbCheck && d && d.value ? d.value.slice() : null };
    a._gpuRef = null; a._sbLean = src;
    Object.defineProperty(a, 'array', { configurable: true, enumerable: true,
      get() { return leanBack(this, null); },
      set(v) { this._sbLean = null; Object.defineProperty(this, 'array', { value: v, writable: true, configurable: true, enumerable: true }); } });
    (e.bm._sbLeanList ||= []).push(a);
    SBATCH.stat.leanMB += len * ctor.BYTES_PER_ELEMENT / 1048576;
  }
}
// K675（稲葉山の15分・11/27 Sanae）：元の形の位置は当たり（raycast）とカメラの遮り（keepCpu）に要るので残すが、束にも同じ値の写しがある（addGeometry はそのまま写す）。
//   元の形の位置を束の配列のその形の取り分（subarray）に替え、同じ値を二つ持たない（稲葉山で約10MB）。値は同じ・束の作りも同じ。
//   iPhone は束の配列を GPU へ送った後に手放す（取り分を指す元の形が束の配列を掴み続ける）ので、束の位置のほとんど（85%以上）が元の形と同じ束だけ替える。
function shareable(a, dst, r) {
  if (!a || !dst || a.isInterleavedBufferAttribute || a.normalized || dst.normalized || a.itemSize !== dst.itemSize || a._gpuRef || a._poolRef || a._sbLean) return null;
  const d = Object.getOwnPropertyDescriptor(a, 'array'), dd = Object.getOwnPropertyDescriptor(dst, 'array');
  if (!d || !('value' in d) || !d.writable || !dd || !('value' in dd)) return null;
  const src = d.value, all = dd.value, start = r.vertexStart * a.itemSize, len = a.count * a.itemSize;
  if (!(src instanceof Float32Array) || !(all instanceof Float32Array) || src.length !== len || start + len > all.length || src.byteLength < 4096) return null;
  for (let i = 0; i < len; i += 97) if (src[i] !== all[start + i]) return null;   // 念のため（写した値と違えば替えない）
  return { a, view: all.subarray(start, start + len), by: src.byteLength };
}
function sharePositions(B, leanOf) {
  const per = new Map();
  for (const [g, e] of leanOf) { const r = e.bm._reservedRanges && e.bm._reservedRanges[e.id]; if (!r) continue;
    const s = shareable(g.attributes.position, e.bm.geometry.attributes.position, r); if (!s) continue;
    let L = per.get(e.bm); if (!L) per.set(e.bm, L = []); L.push(s); }
  for (const [bm, L] of per) {
    const tot = bm.geometry.attributes.position.array.byteLength, sum = L.reduce((n, s) => n + s.by, 0);
    if (sum < tot * 0.85) continue;
    for (const s of L) s.a.array = s.view;
    SBATCH.stat.posShareMB += sum / 1048576;
  }
}
// K675（稲葉山の15分・11/27 Sanae）：束の法線（小数3つ）と色（0〜1 の小数）を整数に詰める（GPU が 0〜1・−1〜1 の小数へ戻して読む）。
//   iPhone・iPad（MEM_TIGHT）は城の kit の束（props.js kitBatchMesh・K564）と同じ 8 ビット、ほかは 16 ビット。
//   頂点あたり 18（16 ビットは 12）バイト減る（稲葉山の束 約100万頂点で約17MB）。位置・uv・印は詰めない。
function packBatch(bm) {
  const g = bm.geometry;
  for (const name of ['normal', 'color']) {
    const a = g.attributes[name]; if (!a || a.isInterleavedBufferAttribute || a.normalized || a._gpuRef) continue;
    const d = Object.getOwnPropertyDescriptor(a, 'array'); if (!d || !('value' in d)) continue;
    const src = d.value; if (!(src instanceof Float32Array) || src.byteLength < 65536) continue;
    let out;
    if (name === 'normal') { const q = MEM_TIGHT ? 127 : 32767; out = MEM_TIGHT ? new Int8Array(src.length) : new Int16Array(src.length); for (let i = 0; i < src.length; i++) { const x = src[i]; out[i] = Math.round((x > 1 ? 1 : x < -1 ? -1 : x) * q); } }
    else { let ok = true; for (let i = 0; i < src.length; i++) { const x = src[i]; if (!(x >= 0 && x <= 1)) { ok = false; break; } } if (!ok) continue;
      const q = MEM_TIGHT ? 255 : 65535; out = MEM_TIGHT ? new Uint8Array(src.length) : new Uint16Array(src.length); for (let i = 0; i < src.length; i++) out[i] = Math.round(src[i] * q); }
    const na = new THREE.BufferAttribute(out, a.itemSize, true); na.setUsage(a.usage); na.name = a.name;
    g.setAttribute(name, na);
    SBATCH.stat.packMB += (src.byteLength - out.byteLength) / 1048576;
  }
}
// 束の配列（iPhone は GPU にだけある）から、その形の取り分を写し戻す。cache：束を捨てる時に同じ束の配列を一度だけ読む
function leanBack(a, cache) {
  const s = a._sbLean; if (!s) return a.array;
  a._sbLean = null;
  let all = cache && cache.get(s.dst);
  if (!all) {
    const go = globalThis.__gpuOnly;
    all = s.dst._gpuRef && go && go.readCopy ? go.readCopy(s.dst) : s.dst.array;
    if (cache) cache.set(s.dst, all);
  }
  const v = new s.ctor(s.len);
  if (all) { const part = all.subarray(s.start, s.start + s.len);
    // 詰めた束（packBatch：法線・色を整数に）からは、元の小数へ戻して写す
    if (s.dst.normalized && part.constructor !== s.ctor) { const k = part instanceof Int16Array ? 1 / 32767 : part instanceof Int8Array ? 1 / 127 : part instanceof Uint8Array ? 1 / 255 : 1 / 65535; for (let i = 0; i < part.length; i++) v[i] = Math.max(part[i] * k, -1); }
    else v.set(part); }
  Object.defineProperty(a, 'array', { value: v, writable: true, configurable: true, enumerable: true });
  SBATCH.stat.leanBack++;
  return v;
}

const _m = new THREE.Matrix4();
function chainVisible(o, scene) {
  for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; }
  return false;
}
function attrKey(g) {
  const names = Object.keys(g.attributes).sort();
  return names.map((n) => { const a = g.attributes[n]; return n + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) + ':' + (a._gpuRef ? a._gpuRef.ctor.name : a.array.constructor.name); }).join(',') + (g.index ? '+i' : '');
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
  // 10/30：戦の定義で束の升の広さと最少の数を変えられる（稲葉山の iPhone の作り：家並みの小物が升ごとに六つ未満で束にならず、一つずつ描いていた）
  const cellSize = rt.def?.staticBatchCell || 32, minN = rt.def?.staticBatchMinN || SBATCH.minN;
  const walk = (o) => {
    if (unitRoots.has(o) || moving.has(o) || o === rt.sbRoot || o.userData?.flag || o.userData?.noFreeze ||
      typeof o.userData?.open === 'function' || typeof o.userData?.fall === 'function') return;
    if (o.isMesh && o.geometry) geoUse.set(o.geometry, (geoUse.get(o.geometry) || 0) + 1);
    const mat = o.material;
    if (candidate(o, mat)) {
      o.updateWorldMatrix(true, false);
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const center = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const cell = Math.floor(center.x / cellSize) + ',' + Math.floor(center.z / cellSize);
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
    if (G.list.length < minN) continue;
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
    if (SBATCH.pack) packBatch(bm);
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
  const leanOf = new Map(); if (SBATCH.lean) for (const e of B.entries) if (!leanOf.has(e.o.geometry)) leanOf.set(e.o.geometry, e);
  const shareOf = new Map();
  for (const [g, n] of onlyHere) if (geoUse.get(g) === n) { if (SBATCH.lean) { leanSource(g, leanOf.get(g)); shareOf.set(g, leanOf.get(g)); } g.dispose(); }
  if (SBATCH.pack) sharePositions(B, shareOf);
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

// 確かめ用（window.__sbCheck を立てて戦を始めた時）：手放した配列を全部戻し、手放す前の写しと比べる（違った値の数を返す）
export function staticBatchLeanCheck(rt) {
  const B = rt && rt.sb; if (!B) return null; let n = 0, bad = 0, nocheck = 0;
  for (const bt of B.batches) for (const a of (bt.bm && bt.bm._sbLeanList) || []) { const s = a._sbLean; if (!s) continue; const c = s.check; const v = leanBack(a, null); n++;
    if (!c) { nocheck++; continue; } if (c.length !== v.length) { bad++; continue; } const tol = s.dst.normalized ? (MEM_TIGHT ? 0.005 : 1e-4) : 0; for (let i = 0; i < c.length; i++) if (Math.abs(c[i] - v[i]) > tol) { bad++; break; } }
  return { n, bad, nocheck };
}

export function staticBatchDispose(rt) {
  const B = rt.sb; if (!B) return;
  for (const e of B.entries) { e.o.layers.mask = 1; }
  // 手放したままの元の形の配列は、束を捨てる前に戻す（同じ形を後の戦で使い回す時のため。束の配列は一つにつき一度だけ読む）
  for (const bt of B.batches) if (bt.bm && bt.bm._sbLeanList) { const cache = new Map(); for (const a of bt.bm._sbLeanList) if (a._sbLean) leanBack(a, cache); bt.bm._sbLeanList = null; }
  for (const bt of B.batches) if (bt.bm) { bt.bm.geometry.userData.noRestore = true; bt.bm.geometry.dispose(); }   // 束の入れ物は二度と使わない（K626：読み戻さない）
  if (B.root.parent) B.root.parent.remove(B.root);
  rt.sb = null; rt.sbRoot = null;
  SBATCH.stat.groups = SBATCH.stat.meshes = SBATCH.stat.verts = 0;
}
