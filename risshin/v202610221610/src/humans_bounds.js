// 人の処理：人の描画範囲。外部向けの入口は humans.js。
import * as THREE from 'three';

// 人の根元の球を全部品で共有する。視野判定は部品の座標を要求するので、
// 骨・体格の変換を逆に掛けて渡す。形の共有球や立ち姿の球は書き換えない。
const humanCullOwners = new WeakMap();
const humanCullParts = new WeakMap();
const humanCullMatrix = new THREE.Matrix4();
function humanPartSphere() {
  const p = humanCullParts.get(this), h = p.h;
  const radius = (h.u.mounted ? 2.2 : 1.3) + 0.3;
  h.root.boundingSphere.radius = radius;
  if (p.radius !== radius || p.geo !== this.geometry || !p.world.equals(this.matrixWorld) || !p.root.equals(h.root.matrixWorld)) {
    p.radius = radius; p.geo = this.geometry;
    p.world.copy(this.matrixWorld); p.root.copy(h.root.matrixWorld);
    humanCullMatrix.copy(this.matrixWorld).invert().multiply(h.root.matrixWorld);
    p.sphere.copy(h.root.boundingSphere).applyMatrix4(humanCullMatrix);
    // 指物・采配など人の球を越える硬い部品も、先端まで残す。
    if (!this.isSkinnedMesh) {
      if (!this.geometry.boundingSphere) this.geometry.computeBoundingSphere();
      p.sphere.union(this.geometry.boundingSphere);
    }
  }
  return p.sphere;
}
// 動きの原本ごとに名前だけを覚える。兵の骨や場面への参照は持ち越さない。
const motionNodeNames = new WeakMap();
function humanMotionBones(model, actions) {
  const nodes = new Map(), names = new Set(), result = new Set();
  model.traverse(o => {
    // 同名なら従来の探索と同じく、先に見つかる節を使う。
    if (!nodes.has(o.name)) nodes.set(o.name, o);
    nodes.set(o.uuid, o);
  });
  for (const action of Object.values(actions)) {
    const clip = action.getClip();
    let saved = motionNodeNames.get(clip);
    if (!saved) {
      saved = [...new Set(clip.tracks.map(t => THREE.PropertyBinding.parseTrackName(t.name).nodeName))];
      motionNodeNames.set(clip, saved);
    }
    for (const name of saved) names.add(name);
  }
  for (const name of names) {
    const bone = nodes.get(name) || THREE.PropertyBinding.findNode(model, name);
    if (bone && (bone.isBone || /^mixamorig/.test(bone.name))) result.add(bone);
  }
  return [...result];
}
function humanBoundAdd(...objects) {
  THREE.Object3D.prototype.add.apply(this, objects);
  const h = humanCullOwners.get(this);
  for (const o of objects) bindHumanBounds(h, o);
  return this;
}
function bindHumanBounds(h, root = h.root) {
  root.traverse((o) => {
    if (humanCullOwners.get(o) === h) return;
    humanCullOwners.set(o, h);
    // 後から付く顔・目・歯・采配・指物にも、追加した時だけ設定する。
    o.add = humanBoundAdd;
    if (!o.isMesh) return;
    o.frustumCulled = !h.u.isPlayer;
    if (h.u.isPlayer) return;
    humanCullParts.set(o, { h, sphere: new THREE.Sphere(), world: new THREE.Matrix4(), root: new THREE.Matrix4(), radius: -1, geo: null });
    Object.defineProperty(o, 'boundingSphere', { configurable: true, get: humanPartSphere });
  });
}
// 兵の持ち物（指物・傷の入れ物）は人を捨てても兵に残る。人へ付けた時の印（持ち主の表・球の取り出し口・add）を外さないと、
//   弱い表の鍵が兵の持ち物になり、捨てた人（骨・mixer・形）が戦の間ずっと残っていた（iPhone の WebContent が 260 秒で 2GB。10/20）
function unbindHumanBounds(root) {
  if (!root) return;
  root.traverse((o) => {
    if (!humanCullOwners.has(o)) return;
    unbindHumanPart(o);
  });
}
function unbindHumanPart(o) {
  humanCullOwners.delete(o); humanCullParts.delete(o);
  if (Object.prototype.hasOwnProperty.call(o, 'boundingSphere')) delete o.boundingSphere;
  if (Object.prototype.hasOwnProperty.call(o, 'add') && o.add === humanBoundAdd) delete o.add;
}
// 捨てる人に付けた印を全部外す。地に落ちた指物（groundDetached）や兵へ戻した部品が弱い表の鍵のまま残ると、
//   その人（骨・mixer・形・色の配列）が戦の間ずっと残る（森部 240 秒で兵に付かない人 32 人。10/20）
function releaseHumanBounds(h) {
  if (!h) return;
  const u = h.u;
  // 人の根（h.root）の中は触らない（根の球は根の持ち物。捨てた後も描かれる間は使う）。兵へ移った持ち物のうち、人の外にある物だけ外す
  for (const r of [u && u.flag, u && u.armorWear && u.armorWear.root, u && u.wpn, u && u.hatOff, u && u.dropped]) {
    if (!r || !r.traverse) continue;
    let p = r; while (p && p !== h.root) p = p.parent;
    if (p === h.root) continue;
    r.traverse((o) => { if (humanCullOwners.get(o) === h) unbindHumanPart(o); });
  }
}

export { humanMotionBones, bindHumanBounds, unbindHumanBounds, releaseHumanBounds };
