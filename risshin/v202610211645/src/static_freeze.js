// 動かない物の行列を毎コマ計算しない仕組み（携帯の重さ：シーンの走査の updateMatrixWorld が主だった）。
// 戦が始まって少しして、舞台の直下の塊（Group・Mesh）のうち、一定の間まったく動かなかった物の
// updateMatrixWorld を「毎コマは何もしない」物に差し替える（行列は凍らせた時点の値が残る）。
// 塊の中のどの節でも位置・回転・拡大・行列・子の数が変わったら、その塊は自動で元に戻る
// （門が開く・櫓が崩れる・柵が壊れる等は 4 コマ以内に気づいて普通の更新に戻る）。
// 見た目と動きは変えない。ほかの物から updateMatrixWorld(true) と呼ばれた時は普通に計算する。
import * as THREE from 'three';
import { staticPropBatch, staticPropInstances } from './props_batch.js';
import { MEM_TIGHT } from './settings.js';

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
  const nodes = [], vals = [], offs = [], children = [], parents = [];
  root.traverse((o) => { nodes.push(o); parents.push(o.parent); children.push(o.children.slice()); offs.push(vals.length); snapNode(o, vals); });
  return { nodes, vals, offs, children, parents };
}

const nodeScratch = [];
function same(root, s) {
  const tmp = nodeScratch;
  // 場面から外した部品も同じ控えで見張る。材質・形の差し替えは結合後の控えでも検知する。
  for (let i = 0; i < s.nodes.length; i++) {
    const o = s.nodes[i], children = s.children[i];
    if (o.parent !== s.parents[i] || o.children.length !== children.length) return false;
    for (let j = 0; j < children.length; j++) if (o.children[j] !== children[j]) return false;
    if (s.appearance && (o.geometry !== s.appearance[i].geometry || o.material !== s.appearance[i].material)) return false;
    tmp.length = 0; snapNode(o, tmp);
    const off = s.offs[i];
    for (let k = 0; k < tmp.length; k++) if (tmp[k] !== s.vals[off + k]) return false;
  }
  return true;
}

// 幟（userData.flag）は風の向きが変わると向き直る。塊の中にあると、そのたびに塊の全部が「動いた」と見なされて戻る。
//   凍らせる前に、塊の中の幟を舞台の直下へ移す（見た目の場所は変えない）
function liftFlags(scene, root) {
  if (root._flagLift) return;
  root._flagLift = true;
  const list = [];
  root.traverse((o) => { if (o !== root && o.userData && o.userData.flag && o.userData.flag.isObject3D) list.push(o); });
  for (const o of list) if (o.parent) scene.attach(o);
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

// 材質の見た目の印：同じ作りの材質（物ごとに作り直した同じ色・同じ絵の材質）は一つにまとめてよい。
//   描く時の仕掛け（onBeforeCompile・描く前の処理）を持つ材質は、その材質だけで一つ（uuid）
const _baseCompile = THREE.Material.prototype.onBeforeCompile;
const _sigCache = new WeakMap();
function matSig(m) {
  let s = _sigCache.get(m);
  if (s) return s;
  if (m.onBeforeCompile !== _baseCompile || m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey || m.userData && Object.keys(m.userData).length) s = m.uuid;
  else {
    const t = (x) => (x ? x.uuid : '');
    s = [m.type, m.color && m.color.getHexString(), m.emissive && m.emissive.getHexString(), m.emissiveIntensity, m.roughness, m.metalness, m.vertexColors, m.side, m.flatShading, m.fog, m.alphaTest, m.opacity, m.wireframe,
      t(m.map), t(m.normalMap), t(m.roughnessMap), t(m.bumpMap), m.bumpScale, t(m.aoMap), t(m.emissiveMap), t(m.alphaMap), t(m.envMap), m.envMapIntensity, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.toneMapped, m.dithering].join('|');
  }
  _sigCache.set(m, s);
  return s;
}

export class StaticFreezer {
  constructor(scene, compactScenery = false) {
    this.scene = scene;
    this.orders = new WeakMap();
    this.compactScenery = compactScenery;
    this.t = 0;
    this.phase = 0;          // 0: 開始待ち, 1: 観察中, 2: 凍らせた後
    this.observeJob = null;
    this.observeAt = 0;
    this.i = 0;
    this.t2 = 0;
    this.frozen = [];        // {root, snap}
    this.n = 0;
    // 戻った塊は、しばらく（12 秒）凍らせない。八度戻った塊は二度と凍らせない（一度だけ動いた陣などは、また止まれば凍らせる）
    //   弱い表にする：場面から外れて捨てた塊（兵の束の InstancedMesh など）を表が持ち続け、森部 4 分で 2700 個に増えていた（10/20）
    this.skip = { m: new WeakMap(), has: (c) => { const r = this.skip.m.get(c); return !!r && (r.n >= 8 || this.t - r.t < 12); } };
  }
  tick(dt) {
    this.t += dt;
    // 固定済みの景物は、新しい景物を調べている間も四コマ以内に変化を拾う。
    if (this.frozen.length) this.watch();
    if (this.phase === 0 && this.t >= START_T) {
      this.phase = 1;
      this.observeJob = this.observeSteps();
    } else if (this.phase === 2 && !this.observeJob && (this.t2 += dt) > 6) {
      this.t2 = 0;
      this.observeJob = this.observeSteps();
    }
    // 景物の調査と結合で二ミリ秒を目安に同じ枠を使う。一塊の途中では切らない。
    const end = performance.now() + 2;
    if (this.observeJob && this.t >= this.observeAt) {
      // 時計が粗い端末でも一コマ八塊まで。兵の数・動き・影は変えない。
      for (let i = 0; i < 8; i++) {
        const step = this.observeJob.next();
        if (step.done) {
          this.observeJob = null; this.observeAt = 0;
          this.phase = 2; this.t2 = 0;
          break;
        }
        if (step.value !== undefined) { this.observeAt = step.value; break; }
        if (performance.now() >= end) break;
      }
    }
    if (performance.now() < end) this.mergeTick(end);
  }
  *observeSteps() {
    const candidates = [];
    // 幟の持ち上げで直下の並びが変わるので、巡回開始時の参照を使う。
    for (const c of this.scene.children.slice()) {
      if (c.parent === this.scene && !c._sf && !this.skip.has(c) &&
        !c.isLight && !c.isCamera && !c.isSprite && !c.isPoints && !c.isLine &&
        c.name !== 'unitBatch' && !(c.userData && (c.userData.noFreeze || c.userData.staticMerged)) && !unitLike(c)) {
        liftFlags(this.scene, c);
        candidates.push({ root: c, snap: snapTree(c) });
      }
      yield;
    }
    if (!candidates.length) return;
    // 最後に控えた景物にも十分な観察時間を取る。待つ間は結合の枠を空ける。
    yield this.t + WATCH_T;
    let n = 0;
    for (const k of candidates) {
      const c = k.root;
      if (c.parent === this.scene && !c._sf && !this.skip.has(c) && same(c, k.snap)) {
        const before = this.n;
        this.freeze(c, k.snap);
        n += this.n - before;
      }
      yield;
    }
    if (n) this.merge();
  }
  freeze(c, snap) {
    c.updateMatrixWorld(true);
    if (Object.prototype.hasOwnProperty.call(c, 'updateMatrixWorld')) return;   // 自前の更新を持つ物には触らない
    const orig = THREE.Object3D.prototype.updateMatrixWorld;
    c.updateMatrixWorld = function (force) { if (force === true) orig.call(this, true); };
    c._sf = true;
    for (const o of snap.nodes) this.orders.set(o, new Map(o.children.map((child, i) => [child, i])));
    this.frozen.push({ root: c, snap });
    this.n++;
  }
  // 凍らせた景物を材質ごとにまとめ、末端の網を場面から外す。
  // 参照と変化の見張りは残し、壊れた時は束を外して元の形へ戻す。
  merge() {
    // iPhone は同じ形を共有する束だけ。形を複製する結合は GPU の容量を越えるため使わない。
    if (this.mergeJob) { this.mergeAgain = true; return; }
    this.mergeJob = this.mergeSteps();
  }
  mergeTick(end = performance.now() + 2) {
    if (!this.mergeJob) return;
    // 一節の調査・一部品の複製ごとに区切る。時計が粗い端末でも一コマ32手まで。
    for (let i = 0; i < 32; i++) {
      if (this.mergeJob.next().done) {
        this.mergeJob = null;
        if (this.mergeAgain) { this.mergeAgain = false; this.merge(); }
        break;
      }
      if (performance.now() >= end) break;
    }
  }
  *mergeSteps() {
    const groups = new Map();
    for (const rec of this.frozen.slice()) {
      if (rec.merged || !rec.root._sf) continue;
      rec.merged = true;
      let vis = true;
      for (let p = rec.root; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) continue;
      item: for (const o of rec.snap.nodes) {
        yield;
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || !o.visible) continue item;
        // 親の網を隠して布や戸まで消さない。独自の影・当たり処理も元の網に任せる。
        if (MEM_TIGHT && (o.children.length || o.customDepthMaterial || o.customDistanceMaterial ||
          o.raycast !== THREE.Mesh.prototype.raycast || o.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow ||
          o.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow)) continue item;
        const mat = o.material, geo = o.geometry;
        if (!mat || Array.isArray(mat) || !mat.visible || mat.colorWrite === false || mat.transparent || mat.depthWrite === false || mat.userData.noMerge) continue item;
        if (!geo || !geo.attributes.position || geo.morphAttributes.position || geo.drawRange.start !== 0 || Number.isFinite(geo.drawRange.count)) continue item;
        // 束の容量は頂点数で取る。兵ごとの値や長さの違う属性を写すと配列をはみ出す。
        // 対応しない形は元の網で描き続け、場面から外さない。
        if (geo.isInstancedBufferGeometry) continue item;
        for (const k in geo.attributes) {
          const a = geo.attributes[k];
          if (a.isInstancedBufferAttribute || a.isInterleavedBufferAttribute || a.count !== geo.attributes.position.count) continue item;
        }
        if (o.renderOrder !== 0 || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) continue item;
        for (const k in o.userData) if (k !== 'camBlock') continue item;
        for (let p = o.parent; p && p !== this.scene; p = p.parent) if (!p.visible || p.userData.noMerge) continue item;
        if (o.matrixWorld.determinant() <= 0) continue item;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const sig = Object.keys(geo.attributes).sort().map((k) => { const a = geo.attributes[k]; return k + a.itemSize + (a.normalized ? 'n' : '') + a.array.constructor.name; }).join(',') + (geo.index ? 'i' : 'x');
        const e = o.matrixWorld.elements;
        const shared = MEM_TIGHT ? '|' + geo.uuid + '|' + Math.floor(e[12] / 32) + ',' + Math.floor(e[14] / 32) : '';
        const key = (MEM_TIGHT ? mat.uuid : matSig(mat)) + '|' + sig + '|' + ((o._sceneryCastShadow ?? o.castShadow) ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + (o.userData.camBlock ? 1 : 0) + '|' + o.layers.mask + shared;
        let g = groups.get(key);
        if (!g) { g = { mat, cast: o._sceneryCastShadow ?? o.castShadow, recv: o.receiveShadow, items: [], roots: new Set() }; groups.set(key, g); }
        g.items.push(o); g.roots.add(rec);
      }
    }
    this.chunks = this.chunks || [];
    for (const g of groups.values()) {
      if (g.items.length < 2) continue;
      // 準備の前後で動いた物は古い位置で置かない。
      let valid = true;
      for (const r of g.roots) if (!this.frozen.includes(r) || r.root.parent !== this.scene || !same(r.root, r.snap)) { valid = false; break; }
      if (!valid) continue;
      const m = yield* (MEM_TIGHT ? staticPropInstances(g.items, g.mat) : staticPropBatch(g.items, g.mat));
      for (const r of g.roots) if (!this.frozen.includes(r) || r.root.parent !== this.scene || !same(r.root, r.snap)) { valid = false; break; }
      if (!valid) { m.dispose(); continue; }
      m.castShadow = g.cast; m.receiveShadow = g.recv; m.matrixAutoUpdate = false; m.matrixWorldNeedsUpdate = false;
      m.layers.mask = g.items[0].layers.mask;
      m.userData.staticMerged = true;
      // まとめても外殻の判定を残す。家の壁が消えた候補のままになり、カメラが中へ入るのを防ぐ。
      m.userData.camBlock = g.items.some((o) => o.userData.camBlock);
      m.updateMatrixWorld = function () {};
      this.scene.add(m);
      const ch = { mesh: m, items: g.items, roots: g.roots, detached: [] };
      for (const o of g.items) {
        // 子を持つ網や根元は参照する仕組みがあるため残す。末端の網は場面から外す。
        if (!MEM_TIGHT && o.parent && o.parent !== this.scene && !o.children.length) {
          ch.detached.push({ item: o, parent: o.parent });
          o.parent.remove(o);
        } else o.visible = false;
      }
      this.chunks.push(ch);
      for (const r of g.roots) {
        r.root._sfVersion = (r.root._sfVersion || 0) + 1;
        (r.chunks = r.chunks || []).push(ch);
        // 自分で隠した部品だけを控えへ反映し、次の見張りで解凍されるのを防ぐ。
        for (let i = 0; i < r.snap.nodes.length; i++) {
          const o = r.snap.nodes[i];
          r.snap.vals[r.snap.offs[i] + 10] = o.children.length;
          r.snap.vals[r.snap.offs[i] + 11] = o.visible ? 1 : 0;
          r.snap.children[i] = o.children.slice();
          r.snap.parents[i] = o.parent;
        }
        r.snap.appearance = r.snap.nodes.map(o => ({ geometry: o.geometry, material: o.material }));
      }
      this.mergedMeshes = (this.mergedMeshes || 0) + g.items.length;
      yield;
    }
  }
  // 起動できる環境でだけ手動で呼ぶ。同じ場面・視点を二度描き、兵の進行を挟まず前後を測る。
  // 通常の遊びでは追加の描画を行わない。値は renderer.info.render.calls の実測。
  compareDrawCalls(renderer, camera) {
    if (!MEM_TIGHT) return null;
    const chunks = (this.chunks || []).filter(ch => !ch.gone && ch.mesh.visible);
    const autoReset = renderer.info.autoReset, saved = [];
    for (const ch of chunks) {
      saved.push([ch.mesh, ch.mesh.visible]);
      for (const o of ch.items) saved.push([o, o.visible]);
    }
    try {
      renderer.info.autoReset = false;
      for (const ch of chunks) {
        ch.mesh.visible = false;
        for (const o of ch.items) o.visible = true;
      }
      renderer.info.reset(); renderer.render(this.scene, camera);
      const before = renderer.info.render.calls;
      for (const [o, visible] of saved) o.visible = visible;
      renderer.info.reset(); renderer.render(this.scene, camera);
      const after = renderer.info.render.calls;
      return { 結合前: before, 結合後: after, 減少: before - after };
    } finally {
      for (const [o, visible] of saved) o.visible = visible;
      renderer.info.autoReset = autoReset;
    }
  }
  dissolve(ch) {
    if (ch.gone) return;
    ch.gone = true;
    if (ch.mesh.parent) ch.mesh.parent.remove(ch.mesh);
    ch.mesh.dispose();
    const parents = new Set();
    for (const d of ch.detached) if (!d.item.parent) { d.parent.add(d.item); parents.add(d.parent); }
    for (const parent of parents) {
      const order = this.orders.get(parent);
      parent.children.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
    }
    // 他の束に残っている末端の部品も、引き続き見張りの控えに含める。
    for (const o of ch.items) if (!ch.detached.some(d => d.item === o)) o.visible = true;
    for (const r of ch.roots) {
      for (let i = 0; i < r.snap.nodes.length; i++) {
        const o = r.snap.nodes[i];
        r.snap.vals[r.snap.offs[i] + 10] = o.children.length;
        r.snap.vals[r.snap.offs[i] + 11] = o.visible ? 1 : 0;
        r.snap.children[i] = o.children.slice();
        r.snap.parents[i] = o.parent;
      }
    }
  }
  thaw(rec) {
    if (rec.chunks) for (const ch of rec.chunks) this.dissolve(ch);
    delete rec.root.updateMatrixWorld; rec.root._sf = false;
    { const r = this.skip.m.get(rec.root) || { n: 0, t: 0 }; r.n++; r.t = this.t; this.skip.m.set(rec.root, r); }
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
    if (this.observeJob) this.observeJob.return();
    this.observeJob = null; this.observeAt = 0;
    // 途中まで複製した形も解放する。片付け後に古い結合を置かない。
    if (this.mergeJob) this.mergeJob.return();
    this.mergeJob = null; this.mergeAgain = false;
    for (const rec of this.frozen) this.thaw(rec);
    this.frozen.length = 0;
  }
}
