// 所有者ごとに一票。共有素材は最後の所有者が離れた時だけ返す。
const entries = new WeakMap();
export function refCount(resource) { return entries.get(resource)?.refCount || 0; }
export function retain(resource) {
  let entry = entries.get(resource);
  if (!entry) { entry = { refCount: 0 }; entries.set(resource, entry); }
  entry.refCount++;
}
export function release(resource) {
  const entry = entries.get(resource);
  if (!entry || !entry.refCount) return;
  if (--entry.refCount === 0) { entries.delete(resource); resource.dispose(); }
}
export function assetOwner() {
  const held = new Set();
  return {
    add(resource) { if (!held.has(resource)) { held.add(resource); retain(resource); } },
    sync(resources) {
      for (const resource of resources) this.add(resource);
      for (const resource of held) if (!resources.has(resource)) { held.delete(resource); release(resource); }
    },
    dispose() {
      const errors = [];
      for (const resource of held) { try { release(resource); } catch (error) { errors.push(error); } }
      held.clear();
      if (errors.length) throw new AggregateError(errors, '素材の片付けで失敗しました');
    },
  };
}
