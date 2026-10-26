import * as THREE from 'three';

// 動く影は無効。景物の追加・結合・解凍の時だけ影の印を止める。
const SH_OFF = new WeakSet(), _shC = new THREE.Vector3();
// 同じ網で植えた木は、影の時だけ指定範囲の行列へ差し替える。画面の並びと色は触らない。
function sceneryInstanceShadow(mesh, x, z, walk, range) {
  let state = mesh._nearShadow;
  if (!state || state.attribute.count < mesh.instanceMatrix.count) {
    state = { attribute: new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.array.length), 16).setUsage(THREE.DynamicDrawUsage),
      bounds: new Float64Array(mesh.instanceMatrix.count * 3), selected: new Uint32Array(mesh.instanceMatrix.count), geometry: null,
      source: null, version: -1, count: -1, used: 0, x: Infinity, z: Infinity, world: new THREE.Matrix4(), key: 'nearShadowMatrix' + mesh.id };
    mesh._nearShadow = state;
    if (!mesh._nearShadowHook) {
      mesh._nearShadowHook = true;
      const before = mesh.onBeforeShadow, after = mesh.onAfterShadow;
      mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, material, group) {
        before.call(this, renderer, object, camera, shadowCamera, geometry, material, group);
        const state = this._nearShadow;
        state.saved = this.instanceMatrix; state.savedCount = this.count;
        this.instanceMatrix = state.attribute; this.count = state.used;
      };
      mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry, material, group) {
        const state = this._nearShadow;
        // 差し替え前の呼出しがない時は元の配列を保つ。復帰済みの控えも再利用しない。
        if (state.saved) {
          this.instanceMatrix = state.saved; this.count = state.savedCount;
          state.saved = null;
        }
        after.call(this, renderer, object, camera, shadowCamera, geometry, material, group);
      };
    }
  }
  // 描画の準備は影の直前の呼出しより先に属性を送る。補助の属性として登録し、
  // 影の行列もその段階で転送しておく（形を共有する木は網ごとに別の名前）。
  if (mesh.geometry.attributes[state.key] !== state.attribute) mesh.geometry.setAttribute(state.key, state.attribute);
  const source = mesh.instanceMatrix;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const sphere = mesh.geometry.boundingSphere;
  // 本人が歩くだけなら、草木の世界の中心と半径は変わらない。
  // 影の範囲を選ぶ前に一度だけ求め、行列・形・個体数が変わった時だけ作り直す。
  const changed = state.source !== source || state.version !== source.version || state.count !== mesh.count ||
    state.geometry !== mesh.geometry || state.sphere !== sphere || state.radius !== sphere.radius ||
    state.cx !== sphere.center.x || state.cy !== sphere.center.y || state.cz !== sphere.center.z || !state.world.equals(mesh.matrixWorld);
  const bounds = state.bounds;
  if (changed) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, walk.matrix);
      walk.world.multiplyMatrices(mesh.matrixWorld, walk.matrix);
      _shC.copy(sphere.center).applyMatrix4(walk.world);
      const j = i * 3;
      bounds[j] = _shC.x; bounds[j + 1] = _shC.z;
      bounds[j + 2] = sphere.radius * walk.world.getMaxScaleOnAxis();
    }
    state.source = source; state.version = source.version; state.count = mesh.count; state.world.copy(mesh.matrixWorld);
    state.geometry = mesh.geometry; state.sphere = sphere; state.radius = sphere.radius;
    state.cx = sphere.center.x; state.cy = sphere.center.y; state.cz = sphere.center.z;
  } else if (state.x === x && state.z === z && state.range === range) return state.used > 0;
  state.range = range; state.x = x; state.z = z;
  let count = 0, selectionChanged = changed;
  for (let i = 0; i < mesh.count; i++) {
    const j = i * 3, dx = bounds[j] - x, dz = bounds[j + 1] - z, reach = range + bounds[j + 2];
    if (dx * dx + dz * dz > reach * reach) continue;
    if (state.selected[count] !== i) selectionChanged = true;
    state.selected[count++] = i;
  }
  // 歩いても影を落とす木が同じなら、行列の詰め直しと転送はしない。
  if (selectionChanged || count !== state.used) {
    for (let i = 0; i < count; i++) {
      const at = state.selected[i] * 16;
      for (let k = 0; k < 16; k++) state.attribute.array[i * 16 + k] = source.array[at + k];
    }
    state.attribute.needsUpdate = true;
  }
  state.used = count;
  return count > 0;
}
function shadowRange(scene, x, z, walk, range = 24) {
  // 兵や粒の追加では景物の候補を写し直さない。凍結物の結合・解凍は版でも検知する。
  const versions = walk.versions || (walk.versions = walk.roots.map(root => root._sfVersion));
  let changed = walk.roots.length !== scene.children.length;
  for (let i = 0; !changed && i < scene.children.length; i++) {
    const root = scene.children[i];
    if (walk.roots[i] !== root || walk.frozen[i] !== !!root._sf || versions[i] !== root._sfVersion) changed = true;
  }
  if (changed) {
    if (!walk.collect) walk.collect = o => {
      if (o.isMesh && !o.isSkinnedMesh && (o.castShadow || SH_OFF.has(o))) {
        // 結合時に使う元の印は残す。全景物の候補表を作り直さず、この場で止める。
        o._sceneryCastShadow = true; o.castShadow = false; SH_OFF.add(o);
      }
    };
    walk.roots.length = walk.frozen.length = versions.length = scene.children.length;
    for (let i = 0; i < scene.children.length; i++) {
      const root = scene.children[i];
      walk.roots[i] = root; walk.frozen[i] = !!root._sf; versions[i] = root._sfVersion;
      const scenery = root._sf || root.userData?.staticMerged || root.isMesh &&
        !root.isSkinnedMesh && !root.material?.userData?.armyU && !root.userData?.armyBatch && root.name !== 'unitBatch';
      // 解凍中は候補から外れる。再凍結時に同じ版でも必ず印を確かめ直す。
      if (!scenery) { walk.cache.delete(root); continue; }
      let cached = walk.cache.get(root);
      if (!cached || cached.frozen !== !!root._sf || cached.version !== root._sfVersion || cached.children !== root.children.length) {
        if (!cached) { cached = {}; walk.cache.set(root, cached); }
        cached.frozen = !!root._sf; cached.version = root._sfVersion; cached.children = root.children.length;
        root.traverse(walk.collect);
      }
    }
  }
}


export { _shC, shadowRange };
