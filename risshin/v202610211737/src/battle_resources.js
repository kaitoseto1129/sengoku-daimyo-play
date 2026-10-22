import { assetOwner } from './asset_registry.js';
// 戦の片付け時だけ使う。共有素材を先に集め、同じ物を二度返さない。
function collect(root, resources, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root) || ArrayBuffer.isView(root) || root instanceof ArrayBuffer) return;
  seen.add(root);
  if (root.isTexture || root.isBufferGeometry || root.isWebGLRenderTarget || root.isSkeleton || (root.boneMatrices && Array.isArray(root.bones) && typeof root.dispose === 'function')) {
    resources.add(root); return;
  }
  if (root.isMaterial) {
    resources.add(root);
    for (const v of Object.values(root)) if (v?.isTexture) collect(v, resources, seen);
    collect(root.uniforms, resources, seen);
    collect(root.userData, resources, seen);
    return;
  }
  if (root.isObject3D) {
    if (root.isInstancedMesh || root.isBatchedMesh) resources.add(root);
    // 一括描画の形と内部の行列用画像は、本体の dispose がまとめて返す。
    for (const k of ['geometry', 'material', 'customDepthMaterial', 'customDistanceMaterial', 'skeleton', 'background', 'environment', 'children', 'userData']) {
      if (k === 'geometry' && root.isBatchedMesh) continue;
      collect(root[k], resources, seen);
    }
    collect(root.shadow?.map, resources, seen);
    collect(root.shadow?.mapPass, resources, seen);
    return;
  }
  if (root instanceof Map) {
    for (const [k, v] of root) { collect(k, resources, seen); collect(v, resources, seen); }
  } else if (root instanceof Set || Array.isArray(root)) {
    for (const v of root) collect(v, resources, seen);
  } else if (Object.hasOwn(root, 'value')) {
    collect(root.value, resources, seen);
  } else if (Object.getPrototypeOf(root) === Object.prototype || Object.getPrototypeOf(root) === null) {
    for (const [k, v] of Object.entries(root)) if (!['rt', 'game', 'hud', 'G'].includes(k)) collect(v, resources, seen);
  }
}
export function battleResources(shared, cacheOwner = null) {
  const keep = new Set(), owned = new Set();
  collect(shared, keep);
  cacheOwner?.sync(keep);
  const owner = assetOwner();
  return {
    add(root) {
      const found = new Set(); collect(root, found);
      for (const resource of found) if (!owned.has(resource)) {
        owned.add(resource);
        if (cacheOwner || !keep.has(resource)) owner.add(resource);
      }
    },
    protect(shared) {
      keep.clear();
      collect(shared, keep);
      cacheOwner?.sync(keep);
      if (cacheOwner) for (const resource of keep) owner.add(resource);
    },
    dispose() {
      try { owner.dispose(); } finally { owned.clear(); keep.clear(); }
    },
  };
}
