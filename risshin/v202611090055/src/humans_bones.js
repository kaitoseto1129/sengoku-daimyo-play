// 人の処理：骨を場面の木から外す。外部向けの入口は humans.js。
// 骨（六十本ほど）は親の指し先だけ残し、親の子の並びから外す。描く側（projectObject・影）と行列の更新（updateMatrixWorld）は骨を辿らない。
// 骨の行列は、骨の根元の親（Character）が親から子の順の平らな並びで一度に求める。骨に付いた部品（兜・顔・得物・指物の持ち手・草摺）は、
// 骨ごとの「受け」（同じ親の子）へ移し、受けの行列は骨の行列を写す。getWorldPosition・IK は親の指し先で今まで通り求まる。
import * as THREE from 'three';
import { WORLD } from './humans_context.js';

const O3 = THREE.Object3D.prototype;
const TIPS = new Set(['LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase', 'Head']);
const isSk = (o) => !!o && (o.isBone || /^mixamorig/.test(o.name));
const bname = (o) => o.name.replace(/^mixamorig:?/, '');

// 隠れた子は飛ばす（hidden_skip.js と同じ決まり）
function walkChildren(o, force) {
  const ch = o.children;
  for (let i = 0, l = ch.length; i < l; i++) {
    const c = ch[i];
    if (c.visible === false && !c.isLight && !c.isCamera) { c.matrixWorldNeedsUpdate = true; continue; }
    if (c.matrixWorldAutoUpdate === true || force === true) c.updateMatrixWorld(force);
  }
}
// 骨の根元の親：自分の行列 → 骨の並び → 子（皮・受け）
function anchorMW(force) {
  if (this.matrixAutoUpdate) this.updateMatrix();
  if (this.matrixWorldNeedsUpdate || force) {
    if (this.parent === null) this.matrixWorld.copy(this.matrix);
    else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    this.matrixWorldNeedsUpdate = false;
    force = true;
  }
  syncRig(this._rig, force);
  walkChildren(this, force);
}
function syncRig(R, force) {
  if (R.stale) buildList(R);
  const L = R.list, P = R.par, D = R.dirty, T = R.tip, h = R.h;
  // 遠い人（lodFar）で、このコマに骨を動かしていなければ、指・つま先・頭の先の骨は辿らない（tipMW と同じ）
  const skip = !!(h && h.lodFar && !h.skelDirty && !WORLD?.def.fullTipMatrices);
  for (let i = 0, n = L.length; i < n; i++) {
    const b = L[i], p = P[i];
    if (skip && T[i]) { D[i] = 0; continue; }
    let d = p < 0 ? force : D[p] === 1;
    if (b.matrixAutoUpdate) b.updateMatrix();
    if (b.matrixWorldNeedsUpdate || d) {
      b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix);
      b.matrixWorldNeedsUpdate = false;
      d = true;
    }
    D[i] = d ? 1 : 0;
  }
}
// 受け：骨の行列を写し、変わった時だけ子を直す
function sockMW(force) {
  const b = this._bone, a = this.matrixWorld.elements, e = b.matrixWorld.elements;
  let changed = force === true || this.matrixWorldNeedsUpdate;
  if (!changed) for (let i = 0; i < 16; i++) if (a[i] !== e[i]) { changed = true; break; }
  if (changed) this.matrixWorld.copy(b.matrixWorld);
  this.matrixWorldNeedsUpdate = false;
  walkChildren(this, changed);
}
function sockWM(updateParents, updateChildren) {
  const b = this._bone;
  if (updateParents) b.updateWorldMatrix(true, false);
  this.matrixWorld.copy(b.matrixWorld);
  if (updateChildren) for (const c of this.children) c.updateWorldMatrix(false, true);
}
function sockOf(b) {
  if (b._sock) return b._sock;
  const R = b._rig, s = new THREE.Group();
  s.name = 'sock:' + bname(b);
  s.matrixAutoUpdate = false;
  s._bone = b; s.userData.boneSock = true;
  s.updateMatrixWorld = sockMW; s.updateWorldMatrix = sockWM;
  b._sock = s; R.socks.push(s);
  O3.add.call(R.anchor, s);
  if (R.h && R.bind) R.bind(R.h, s);
  s.matrixWorld.copy(b.matrixWorld);
  return s;
}
// 骨の add：骨は骨の下へ（並びを作り直す）、部品は受けへ
function boneAdd(...objs) {
  for (const o of objs) {
    if (!o || o === this) continue;
    if (isSk(o)) { O3.add.call(this, o); adopt(this._rig, o); this._rig.stale = true; }
    else sockOf(this).add(o);
  }
  return this;
}
function boneRemove(...objs) {
  for (const o of objs) {
    if (!o) continue;
    if (o.parent === this) O3.remove.call(this, o);
    else if (this._sock && o.parent === this._sock) this._sock.remove(o);
  }
  return this;
}
function adopt(R, b) {
  b.traverse((o) => {
    if (!isSk(o) || o._rig === R) return;
    o._rig = R;
    o.add = boneAdd; o.remove = boneRemove;
  });
}
function buildList(R) {
  const list = [], par = [], tip = [];
  const rec = (b, p, t) => {
    const i = list.length;
    list.push(b); par.push(p); tip.push(t ? 1 : 0);
    // 先の骨（手・つま先・頭）の子のうち、揺れる骨（sw）と骨でない節（_End）は辿り、ほかの骨（指）は飛ばす。tipMW と同じ
    const isTip = b.isBone && TIPS.has(bname(b));
    for (const c of b.children) if (isSk(c)) rec(c, i, t || (isTip && c.isBone && !c.name.startsWith('sw')));
  };
  for (const top of R.tops) rec(top, -1, false);
  R.list = list; R.par = Int16Array.from(par); R.tip = Uint8Array.from(tip); R.dirty = new Uint8Array(list.length);
  R.stale = false;
}
// 人を作り終えた所で一度だけ呼ぶ（bindHumanBounds の前）
export function detachBones(h, bind) {
  const anchors = new Map();
  h.model.traverse((o) => {
    if (!isSk(o) || isSk(o.parent)) return;
    const a = o.parent;
    if (!anchors.has(a)) anchors.set(a, []);
    anchors.get(a).push(o);
  });
  h.rigs = [];
  for (const [a, tops] of anchors) {
    const R = { h, anchor: a, tops, list: null, par: null, tip: null, dirty: null, stale: true, bind, socks: [] };
    for (const t of tops) adopt(R, t);
    // 骨に付いた部品を受けへ移す（行列は骨から見たまま）
    const moves = [];
    for (const t of tops) t.traverse((o) => { if (isSk(o)) for (const c of o.children) if (!isSk(c)) moves.push([o, c]); });
    for (const t of tops) {
      const i = a.children.indexOf(t);
      if (i >= 0) a.children.splice(i, 1);   // 親の指し先（t.parent）は残す
    }
    a._rig = R; a.updateMatrixWorld = anchorMW;
    buildList(R);
    for (const [b, c] of moves) {
      const s = sockOf(b);
      O3.remove.call(b, c);
      O3.add.call(s, c);
    }
    h.rigs.push(R);
  }
}
// 動かす途中に骨の世界の行列だけを今にする（根元から骨の親までの数段と骨の並び。部品は描く前の更新で直る）
function chainMW(o) {
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.parent === null) o.matrixWorld.copy(o.matrix);
  else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  o.matrixWorldNeedsUpdate = true;   // 子（皮・受け）は描く前の更新で直す
}
export function syncBones(h) {
  if (!h.rigs) { h.root.updateMatrixWorld(true); return; }
  chainMW(h.root);
  for (const R of h.rigs) {
    if (!R.chain) { R.chain = []; for (let o = R.anchor; o && o !== h.root; o = o.parent) R.chain.unshift(o); }
    for (const o of R.chain) chainMW(o);
    syncRig(R, true);
  }
}
// 骨だけを直した後（根元の更新を省いた時）、受けを骨に合わせる
export function refreshSocks(h) { for (const R of h.rigs || []) for (const s of R.socks) if (s.parent) s.updateMatrixWorld(false); }
// 人の骨の数（確かめ用）
export function rigBoneCount(h) { let n = 0; for (const R of h.rigs || []) { if (R.stale) buildList(R); n += R.list.length; } return n; }
// 骨に付けた物の入れ物（受け）。部品の親を骨と比べる所で使う
export function boneHolder(b) { return b && b._sock || b; }
