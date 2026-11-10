// 骨の入った人に付く小さな部品（髪の房・髷・元結・目玉・戦の傷と泥・近くの指物の布）を束ねて描く（一人ずつ描かない）。
//   同じ形と材質の組は一つの InstancedMesh へ。顔の形ごとに形の違う小さな部品（目玉・髷・元結）は、
//   材質ごとに一つの BatchedMesh（一括描画の拡張がある機種）へ入れて、顔の形が違っても一回で描く。
//   形・材質・色・影はそのまま。元の部品は layers を空にして描きから外す（行列と動きは今までどおり）。
//   束ねてよい材質だけ（userData.humanBatch・unitBatch・nearFlag）。人ごとに値の違う材質（顔の表情）・形の変わる物（歯）・骨の入った物は元のまま。
import * as THREE from 'three';
import { hasMultiDraw } from './world.js';
import { boneHolder } from './humans_bones.js';

// HB.on = false で元の一つずつの描き方に戻す（測り・見比べ用）。multi = false で BatchedMesh を使わない
export const HB = { on: true, multi: true };
const NO_OBR = THREE.Object3D.prototype.onBeforeRender;
const okMat = (m) => !!m && m.isMaterial && !!(m.userData.humanBatch || m.userData.unitBatch || m.userData.nearFlag) && !m.userData.faded;
// BatchedMesh へ入れる小さな形（頂点がこれ以下）と、一つの入れ物の場所の数（近くで顔の見える人の数より多め）
const MULTI_V = 1500, SLOTS = 64;

// 束専用の材質の写し。同じ材質を一つずつの形と束で使い回すと、three が描くたびに描き方を選び直す（文字列の鍵・ゴミ）。
//   元の材質が変われば（version）写し直す。onBeforeCompile・鍵・userData は元と共有
const variants = new WeakMap();
function variantOf(mat, kind) {
  let vs = variants.get(mat);
  if (!vs) variants.set(mat, vs = {});
  let v = vs[kind];
  if (v && v._srcVersion === mat.version) return v;
  if (!v) { v = mat.clone(); vs[kind] = v; } else { v.copy(mat); v.needsUpdate = true; }
  v.onBeforeCompile = mat.onBeforeCompile;
  if (mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) v.customProgramCacheKey = mat.customProgramCacheKey;
  if (mat.defines) v.defines = Object.assign({}, mat.defines);
  v.userData = mat.userData;
  v._srcVersion = mat.version;
  return v;
}

// 二人以上が同じ束に入る時だけ束ねる（一人だけの束は、描く回数が減らずに行列の転送だけ増える）。前のコマの数で決める
function counted(B, k) {
  if (k.cur === undefined) { k.cur = 0; k.prev = 0; }
  if (k.cur++ === 0) B.hSeen.push(k);
  return k.prev >= 2;
}
// 材質と頂点の作りごとの BatchedMesh の入れ物（の数え札）。小さくない形・作りの違う形は null
function poolKey(B, c, cast) {
  const g = c.geometry;
  let sig = B.hSig.get(g);
  if (sig === undefined) {
    sig = (g.index ? 'i' : 'n') + Object.keys(g.attributes).sort().map((k) => { const a = g.attributes[k]; return a.isInterleavedBufferAttribute ? '!' : k + a.itemSize + (a.normalized ? 'n' : ''); }).join(',');
    if (sig.includes('!') || g.attributes.position.count > MULTI_V) sig = '';
    B.hSig.set(g, sig);
  }
  if (!sig) return null;
  let bySig = B.hPK.get(c.material);
  if (!bySig) B.hPK.set(c.material, bySig = new Map());
  const s2 = cast ? sig + '|c' : sig;
  let k = bySig.get(s2);
  if (!k) bySig.set(s2, k = { pool: null });
  return k;
}
function poolOf(army, B, c, cast, k) {
  if (k.pool) return k.pool;
  if (B.hMade >= 1 || B.hWorkMs >= 1) return null;
  const started = performance.now();
  const g = c.geometry, nv = g.attributes.position.count, ni = g.index ? g.index.count : 0;
  const bm = new THREE.BatchedMesh(SLOTS, Math.ceil(nv * 1.1) * SLOTS, ni ? Math.ceil(ni * 1.1) * SLOTS : 3, variantOf(c.material, 'b'));
  bm.name = 'humanBatch'; bm.matrixAutoUpdate = false; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false;
  bm.castShadow = cast; bm.receiveShadow = true; bm.userData.unitShadowBatch = cast; bm.visible = false;
  army.scene.add(bm);
  k.pool = { bm, owner: [], geo: [], last: [], used: [], vMax: Math.ceil(nv * 1.1) * SLOTS, iMax: ni ? Math.ceil(ni * 1.1) * SLOTS : 0, v: 0, i: 0 };
  B.hPools.push(k.pool);
  B.hMade++; B.hWorkMs += performance.now() - started;
  return k.pool;
}
// 部品 c の場所（id）。前と同じなら使い回し、無ければ 2 秒見えない人の場所へ上書きするか、新しく足す。入らなければ -1
function slotOf(pool, c, frame, B) {
  const s = c.userData.hbSlot;
  if (s && s.pool === pool && pool.owner[s.id] === c && pool.geo[s.id] === c.geometry) return s.id;
  if (B.hCopied >= 4 || B.hWorkMs >= 1) return -1;
  const started = performance.now();
  B.hCopied++;
  try {
    const g = c.geometry, nv = g.attributes.position.count, ni = g.index ? g.index.count : 0, R = pool.bm._reservedRanges;
    let id = -1;
    for (let k = 0; k < R.length; k++) {
      if (pool.owner[k] && frame - pool.last[k] < 120) continue;
      if (R[k].vertexCount < nv || ni && R[k].indexCount < ni) continue;
      try { if (pool.geo[k] !== g) pool.bm.setGeometryAt(k, g); } catch (e) { continue; }
      id = k; break;
    }
    if (id < 0) {
      if (R.length >= SLOTS || pool.v + nv > pool.vMax || ni && pool.i + ni > pool.iMax) return -1;
      try { id = pool.bm.addGeometry(g); } catch (e) { return -1; }
      pool.v += nv; pool.i += ni;
    }
    const prev = pool.owner[id];
    if (prev && prev !== c && prev.userData.hbSlot && prev.userData.hbSlot.pool === pool) prev.userData.hbSlot = null;
    pool.owner[id] = c; pool.geo[id] = g;
    c.userData.hbSlot = { pool, id };
    return id;
  } finally { B.hWorkMs += performance.now() - started; }
}

// 束へ入れたら true（元の部品を描きから外す）。一人だけの束になる物は false（元のまま描く）
function put(army, B, c, cast) {
  if (B.multi && c.material.userData.humanBatch) {
    const k = poolKey(B, c, cast);
    if (k) {
      if (!counted(B, k)) return false;
      const pool = poolOf(army, B, c, cast, k);
      if (!pool) return false;
      const id = slotOf(pool, c, B.hFrame, B);
      if (id >= 0) {
        pool.bm.setMatrixAt(id, c.matrixWorld);
        pool.bm.setVisibleAt(id, true);
        pool.last[id] = B.hFrame; pool.used.push(id); pool.bm.visible = true;
        return true;
      }
    }
  }
  let gm = B.hKeys.get(c.material);
  if (!gm) B.hKeys.set(c.material, gm = new WeakMap());
  let ks = gm.get(c.geometry);
  if (!ks) gm.set(c.geometry, ks = [{}, {}]);
  const key = ks[cast ? 1 : 0];
  if (!counted(B, key)) return false;
  let e = B.mapH.get(key);
  if (!e || e.n >= e.cap) {
    if (B.hMade >= 1 || B.hWorkMs >= 1) return false;
    const started = performance.now();
    e = army.batchGrow(c.geometry, e, B.mapH, cast, variantOf(c.material, 'i'), key);
    B.hMade++; B.hWorkMs += performance.now() - started;
    e.im.receiveShadow = true;
    e.im.name = 'humanBatch';
  }
  c.matrixWorld.toArray(e.arr, e.n * 16); e.n++;
  return true;
}

function walk(army, o, B, tag) {
  const ch = o.children;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (!c || !c.visible) continue;
    const shown = (c.layers.mask & B.cameraMask) || c.userData.bT !== undefined;   // 前のコマに束ねた部品は layers が空のまま
    if (c.isMesh && shown && !c.isSkinnedMesh && !c.isInstancedMesh && c.onBeforeRender === NO_OBR && okMat(c.material)
      && !c.geometry.morphAttributes.position && !c.geometry.groups.length) {
      const cast = c.castShadow;
      // 画面の外の人は、影を落とす部品だけ（影の描き込みのため）
      if (!(B.on || cast) || put(army, B, c, cast)) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); }
    }
    if (c.children.length) walk(army, c, B, tag);
  }
}

// コマの初め（Army.batchDraw が兵を回る前に呼ぶ）：前のコマに描いた場所を隠す（今のコマで見えた人だけ、もう一度出す）
export function humanBatchBegin(B) {
  if (!B.mapH) { B.mapH = new Map(); B.hKeys = new WeakMap(); B.maps.push(B.mapH); B.hPools = []; B.hPK = new WeakMap(); B.hSig = new WeakMap(); B.hSeen = []; B.hFrame = 0; }
  B.hFrame++;
  // 装いの切替で顔・髪・傷の束を一斉に作らない。未完成の部品は元の形で描く。
  // 既存の場所の行列は全員更新し、新しい入れ物は一つ・形の転送は四つ・実作業一ミリ秒まで。
  B.hMade = 0; B.hCopied = 0; B.hWorkMs = 0;
  for (const k of B.hSeen) { k.prev = k.cur; k.cur = 0; }
  B.hSeen.length = 0;
  B.multi = HB.multi && hasMultiDraw();
  for (const pool of B.hPools) {
    for (const id of pool.used) pool.bm.setVisibleAt(id, false);
    pool.used.length = 0; pool.bm.visible = false;
  }
}
// 一人分の骨の入った人の部品を束へ。Army.batchDraw が、軽い兵の部品を束ねた後に呼ぶ
export function batchHumanParts(army, u, B, tag) {
  if (!HB.on) return;
  const h = u.human;
  if (!h || !h.root || !h.root.visible || !h.root.parent || !h.root.parent.visible) return;
  if (!B.mapH) return;
  // 束ねる部品の付く所だけを辿る（骨六十本の全部は辿らない）：顔（髪・目）・胴の傷の入れ物・指物の持ち手
  const W = B.hW || (B.hW = { children: [null, null, null] }), w = u.armorWear;
  W.children[0] = h.parts.face || null;
  W.children[1] = w && w.root.parent === boneHolder(h.bones.Spine1) ? w.root : null;
  W.children[2] = h.flagHolder || null;
  walk(army, W, B, tag);
}
