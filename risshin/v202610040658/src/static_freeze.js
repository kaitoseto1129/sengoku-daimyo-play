// 動かない物の行列を毎コマ計算しない仕組み（携帯の重さ：シーンの走査の updateMatrixWorld が主だった）。
// 戦が始まって少しして、舞台の直下の塊（Group・Mesh）のうち、一定の間まったく動かなかった物の
// updateMatrixWorld を「毎コマは何もしない」物に差し替える（行列は凍らせた時点の値が残る）。
// 塊の中のどの節でも位置・回転・拡大・行列・子の数が変わったら、その塊は自動で元に戻る
// （門が開く・櫓が崩れる・柵が壊れる等は 4 コマ以内に気づいて普通の更新に戻る）。
// 見た目と動きは変えない。ほかの物から updateMatrixWorld(true) と呼ばれた時は普通に計算する。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S } from './settings.js';

const SLICES = 4;          // 変化の見張りを何分割して回すか（一度に全部は見ない）
const WATCH_T = 1.2;       // 動かないと見なすまでの観察の長さ（戦の秒）
const START_T = 1.5;       // 戦が始まって何秒後から観察するか

function snapNode(o, out) {
  // 位置3・回転4・拡大3・子の数1・見える1、行列を直に触る物は行列16
  out.push(o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w,
    o.scale.x, o.scale.y, o.scale.z, o.children.length, o.visible ? 1 : 0);
  if (!o.matrixAutoUpdate) { const e = o.matrix.elements; for (let i = 0; i < 16; i++) out.push(e[i]); }
}

function snapTree(root) {
  const nodes = [], vals = [], offs = [];
  root.traverse((o) => { nodes.push(o); offs.push(vals.length); snapNode(o, vals); });
  return { nodes, vals, offs };
}

const nodeScratch = [];
function same(root, s) {
  const tmp = nodeScratch;
  let i = 0;
  let ok = true;
  root.traverse((o) => {
    if (!ok) return;
    if (o !== s.nodes[i]) { ok = false; return; }
    tmp.length = 0; snapNode(o, tmp);
    const off = s.offs[i];
    for (let k = 0; k < tmp.length; k++) if (tmp[k] !== s.vals[off + k]) { ok = false; return; }
    i++;
  });
  return ok && i === s.nodes.length;
}

// 兵（動く物・まとめて描く時に行列を読まれる物）は凍らせない
function unitLike(root) {
  let hit = false;
  root.traverse((o) => {
    if (hit) return;
    if (o.isSkinnedMesh || o.isBone || (o.userData && o.userData.lod) || (o.isMesh && o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender)) hit = true;
  });
  return hit;
}

export class StaticFreezer {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    this.phase = 0;          // 0: 開始待ち, 1: 観察中, 2: 凍らせた後
    this.cand = null;        // 観察中の {root, snap}
    this.frozen = [];        // {root, snap}
    this.n = 0;
    this.skip = new Set();   // 一度戻った塊は二度と凍らせない
  }
  tick(dt) {
    this.t += dt;
    if (this.phase === 0) {
      if (this.t >= START_T) {
        this.cand = [];
        for (const c of this.scene.children) {
          if (c.isLight || c.isCamera || c.isSprite || c.isPoints || c.isLine) continue;
          if (c.userData && c.userData.noFreeze) continue;
          if (unitLike(c)) continue;
          this.cand.push({ root: c, snap: snapTree(c) });
        }
        this.t0 = this.t; this.phase = 1;
      }
    } else if (this.phase === 1) {
      if (this.t - this.t0 >= WATCH_T) {
        for (const k of this.cand) {
          const c = k.root;
          if (c.parent !== this.scene || this.skip.has(c)) continue;
          if (!same(c, k.snap)) continue;
          this.freeze(c, k.snap);
        }
        this.cand = null; this.phase = 2; this.i = 0;
        if (S.quality === 'low') this.merge();
      }
    } else {
      this.watch();
    }
  }
  freeze(c, snap) {
    c.updateMatrixWorld(true);
    if (Object.prototype.hasOwnProperty.call(c, 'updateMatrixWorld')) return;   // 自前の更新を持つ物には触らない
    const orig = THREE.Object3D.prototype.updateMatrixWorld;
    c.updateMatrixWorld = function (force) { if (force === true) orig.call(this, true); };
    c._sf = true;
    this.frozen.push({ root: c, snap });
    this.n++;
  }
  // 凍らせた塊の中の、動かない普通の形を、材質と場所（32m四方）ごとに一つへまとめて描く回数を減らす（画質「低」だけ）。
  // 元の形は消さずに見えなくして残し、塊が元に戻る時は、まとめた物を外して元の形をまた見せる
  merge() {
    const CELL = 32;
    const groups = new Map();
    for (const rec of this.frozen) {
      if (rec.merged) continue;
      rec.merged = true;
      let vis = true;
      for (let p = rec.root; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) continue;
      rec.root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || !o.visible) return;
        const mat = o.material, geo = o.geometry;
        if (!mat || Array.isArray(mat) || mat.transparent || mat.depthWrite === false || mat.userData.noMerge) return;
        if (!geo || !geo.attributes.position || geo.morphAttributes.position || geo.drawRange.start !== 0 || Number.isFinite(geo.drawRange.count)) return;
        if (o.renderOrder !== 0 || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
        for (const k in o.userData) if (k !== 'camBlock') return;
        for (let p = o.parent; p && p !== this.scene; p = p.parent) if (!p.visible || p.userData.noMerge) return;
        if (o.matrixWorld.determinant() <= 0) return;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const c = geo.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
        const sig = Object.keys(geo.attributes).sort().map((k) => { const a = geo.attributes[k]; return k + a.itemSize + (a.normalized ? 'n' : '') + a.array.constructor.name; }).join(',') + (geo.index ? 'i' : 'x');
        const key = mat.uuid + '|' + sig + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL);
        let g = groups.get(key);
        if (!g) { g = { mat, cast: o.castShadow, recv: o.receiveShadow, items: [], roots: new Set() }; groups.set(key, g); }
        g.items.push(o); g.roots.add(rec);
      });
    }
    this.chunks = this.chunks || [];
    for (const g of groups.values()) {
      if (g.items.length < 3) continue;
      const geos = g.items.map((o) => { const x = o.geometry.clone(); x.clearGroups(); x.applyMatrix4(o.matrixWorld); return x; });
      const mg = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!mg) continue;
      mg.computeBoundingSphere();
      const m = new THREE.Mesh(mg, g.mat);
      m.castShadow = g.cast; m.receiveShadow = g.recv; m.matrixAutoUpdate = false; m.matrixWorldNeedsUpdate = false;
      m.userData.staticMerged = true;
      m.updateMatrixWorld = function () {};
      this.scene.add(m);
      const ch = { mesh: m, items: g.items, roots: g.roots };
      for (const o of g.items) o.visible = false;
      this.chunks.push(ch);
      for (const r of g.roots) (r.chunks = r.chunks || []).push(ch);
      this.mergedMeshes = (this.mergedMeshes || 0) + g.items.length;
    }
    // 見えなくした分を見張りの控えに入れ直す（見える・見えないの変化を「動いた」と数えないため）
    for (const rec of this.frozen) rec.snap = snapTree(rec.root);
  }
  dissolve(ch) {
    if (ch.gone) return;
    ch.gone = true;
    if (ch.mesh.parent) ch.mesh.parent.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    for (const o of ch.items) o.visible = true;
    for (const r of ch.roots) r.snap = snapTree(r.root);
  }
  thaw(rec) {
    if (rec.chunks) for (const ch of rec.chunks) this.dissolve(ch);
    delete rec.root.updateMatrixWorld; rec.root._sf = false;
    this.skip.add(rec.root);
    this.n--;
  }
  // 凍らせた塊を 1/SLICES ずつ見張る。変わった塊は元に戻す
  watch() {
    const F = this.frozen;
    const s = this.i++ % SLICES;
    for (let k = F.length - 1; k >= 0; k--) {
      if ((k % SLICES) !== s) continue;
      const rec = F[k];
      if (rec.root.parent !== this.scene || !same(rec.root, rec.snap)) {
        this.thaw(rec);
        F.splice(k, 1);
      }
    }
  }
  // 外から「いま動かした」と知らせる時（使わなくてもよい）
  thawAll() {
    for (const rec of this.frozen) this.thaw(rec);
    this.frozen.length = 0;
  }
}
