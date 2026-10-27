// 中景の兵（目安 8〜40m）を、前もって焼いた骨の動きの絵（VAT）で InstancedMesh として描く（10/24）。
//   骨の入った人（humans.js）と同じ骨の並び（ALLB）と同じ束の形（crowdGeometry の全身の形）を使い、
//   待ち・歩き・走り・構え・突き／振り・よろけ・倒れの骨の行列を、得物の組ごとに一度だけ絵（浮動小数の DataTexture）へ焼く。
//   兵ごとには根の行列と、絵の行（動きの番号と時刻）・色の場所だけを渡し、頂点はシェーダーで動かす。骨の木も部品の木も辿らない。
//   焼くのは場面の外の作り物の兵（Unit＋buildModel＋骨の入った人）。本物の兵の状態には触らない。
//   近く（8m の内）・本人・武将・騎馬・一騎打ちの者は今の骨入りのまま。指物と足もとの影は軽い兵の束がそのまま描く。
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';
import { HUM, SRC, ALLB, humanLook, isSohei, qualityKeeper, skinOpponent, realNear } from './humans_shared.js';
import { crowdGeometry } from './humans_crowd_geometry.js';
import { nearArmorParts } from './humans_dress.js';
import { lookParts, Unit, buildModel, DEATH_END } from './units.js';
import { MAT } from './units_model.js';
import { gripPose, humans } from './humans_combat.js';
import { driveHuman } from './humans_animate.js';
import { dropHuman } from './humans_lifecycle.js';
import { EFUDA } from './efuda.js';
import { isNoRender } from './world.js';
import { COMPILE_ASYNC } from './humans_face_materials.js';
import { simplifyAsync, geoArrays } from './qem_index.js';

const qs = typeof location !== 'undefined' ? location.search : '';
export const VAT = {
  on: !/[?&]vat=0/.test(qs) && !(typeof window !== 'undefined' && /x_novat/.test(String(window.__autoplay || ''))),
  near: 8, hyst: 0.8, fps: 20, nearShape: !MEM_TIGHT && !/[?&]vatnear=0/.test(qs),   // 携帯は遠い部品の全身だけ（形づくりの山を減らす）
  nearD: 15, triFar: 0, triNear: 0,   // 中景の一人の三角の上限（0＝減らさない）。10/24 に 700・900 を試したが、QEM で陣笠が消え体が欠けたので止めた（部品ごとに減らす作りが要る）
  hooks: { build: null },   // humans_runtime.js が buildHuman を渡す（循環の import を避ける）
  stat: { units: 0, drawn: 0, rigs: 0, rows: 0, looks: 0, shapes: 0, bakeMs: 0, selMs: 0, drawMs: 0, fails: 0 },
};
const NB = ALLB.length + 1, WPN = ALLB.length, TW = NB * 3, ROWS = 3072, CW = 2048;
const CLIP = { idle: 0, walk: 1, run: 2, guard: 3, atk: 4, hit: 5, dieF: 6, dieB: 7, dieS: 8, idleUp: 9, walkUp: 10, idleHedge: 11 };
// 長柄の構えの違い：前の味方の背につく者は槍を立て（Up）、槍衾の前の段は穂先を前へ寝かせる（Hedge）。長柄でない組は元の動きを使う
const CLIPS = ['idle', 'walk', 'run', 'guard', 'atk', 'hit', 'dieF', 'dieB', 'dieS', 'idleUp', 'walkUp', 'idleHedge'];
const VARIANT = { idleUp: 'idle', walkUp: 'walk', idleHedge: 'idle' };

// ---- 絵（骨の行列）と色の置き場 ----
let vatTex = null, vatData = null, rowsUsed = 0;
let colTex = null, colData = null, colRows = 0, colUsed = 0;
const U_VAT = { value: null }, U_COL = { value: null };
function ensureTex() {
  if (vatTex) return;
  vatData = new Float32Array(TW * ROWS * 4);
  vatTex = new THREE.DataTexture(vatData, TW, ROWS, THREE.RGBAFormat, THREE.FloatType);
  vatTex.minFilter = vatTex.magFilter = THREE.NearestFilter; vatTex.generateMipmaps = false;
  U_VAT.value = vatTex;
  growCol(64);
}
function growCol(rows) {
  const nd = new Float32Array(CW * rows * 4);
  if (colData) nd.set(colData);
  const old = colTex;
  colTex = new THREE.DataTexture(nd, CW, rows, THREE.RGBAFormat, THREE.FloatType);
  colTex.minFilter = colTex.magFilter = THREE.NearestFilter; colTex.generateMipmaps = false; colTex.needsUpdate = true;
  colData = nd; colRows = rows; U_COL.value = colTex;
  if (old) old.dispose();
}
function writeRow(row, b, m) {
  const e = m.elements, o = (row * TW + b * 3) * 4;
  vatData[o] = e[0]; vatData[o + 1] = e[4]; vatData[o + 2] = e[8]; vatData[o + 3] = e[12];
  vatData[o + 4] = e[1]; vatData[o + 5] = e[5]; vatData[o + 6] = e[9]; vatData[o + 7] = e[13];
  vatData[o + 8] = e[2]; vatData[o + 9] = e[6]; vatData[o + 10] = e[10]; vatData[o + 11] = e[14];
}

// ---- 材質（兵の材質に、骨の絵で頂点を動かす所と、色の絵から色を引く所を足す） ----
const VAT_GLSL = `
uniform highp sampler2D uVat;
uniform highp sampler2D uVatCol;
attribute vec4 aVat;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
mat4 vatBone(int b, int row) {
  int x = b * 3;
  vec4 r0 = texelFetch(uVat, ivec2(x, row), 0), r1 = texelFetch(uVat, ivec2(x + 1, row), 0), r2 = texelFetch(uVat, ivec2(x + 2, row), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
vec3 vatUnpack(float p) { return vec3(floor(p / 65536.0), mod(floor(p / 256.0), 256.0), mod(p, 256.0)) / 255.0; }
`;
function vatMaterial(body) {
  const m = MAT.clone();
  m.defines = Object.assign({}, MAT.defines, body ? { VAT_BODY: 1 } : { VAT_WPN: 1 });
  m.onBeforeCompile = (sh, r) => {
    MAT.onBeforeCompile(sh, r);
    sh.uniforms.uVat = U_VAT; sh.uniforms.uVatCol = U_COL;
    let v = VAT_GLSL + sh.vertexShader;
    v = v.replace('#include <skinbase_vertex>', `
      int vRowA = int(aVat.x + 0.5), vRowB = int(aVat.y + 0.5);
      #ifdef VAT_BODY
        int vb0 = int(skinIndex.x + 0.5), vb1 = int(skinIndex.y + 0.5);
        mat4 vatM = (vatBone(vb0, vRowA) * skinWeight.x + vatBone(vb1, vRowA) * skinWeight.y) * (1.0 - aVat.z)
          + (vatBone(vb0, vRowB) * skinWeight.x + vatBone(vb1, vRowB) * skinWeight.y) * aVat.z;
      #else
        mat4 vatM = vatBone(${WPN}, vRowA) * (1.0 - aVat.z) + vatBone(${WPN}, vRowB) * aVat.z;
      #endif`)
      .replace('#include <skinnormal_vertex>', 'objectNormal = mat3(vatM) * objectNormal;')
      .replace('#include <skinning_vertex>', 'transformed = (vatM * vec4(transformed, 1.0)).xyz;');
    if (body) v = v.replace(/vMtl = mtl; vCol2 = col2;/, `{
        int vci = int(aVat.w + 0.5) + gl_VertexID;
        vec4 vcc = texelFetch(uVatCol, ivec2(vci % ${CW}, vci / ${CW}), 0);
        vColor = vatUnpack(vcc.x); vCol2 = vatUnpack(vcc.y); vMtl = vcc.z;
      }`);
    sh.vertexShader = v;
  };
  m.customProgramCacheKey = () => (body ? 'vatBody1' : 'vatWpn1');
  return m;
}
let MAT_BODY = null, MAT_WPN = null;

// ---- 形（姿ごとの全身の形と、得物の形） ----
const shapes = new Map();   // 形の鍵 → { geo, mesh, n, cap, arr, vat }
const looks = new Map();    // u.look → { shape, colBase } か null（描けない姿）
const wpns = new Map();     // 得物の鍵 → { geo, mesh, ... } か null
let scene = null;
function newBatch(geo, mat) {
  return { geo, mat, mesh: null, cap: 0, n: 0, vat: null };
}
function growBatch(b, need) {
  let cap = Math.max(16, b.cap);
  while (cap < need) cap *= 2;
  const old = b.mesh;
  const g = new THREE.BufferGeometry();
  for (const k in b.geo.attributes) g.setAttribute(k, b.geo.attributes[k]);
  g.setIndex(b.geo.index);
  const vat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aVat', vat);
  const mesh = new THREE.InstancedMesh(g, b.mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  mesh.name = 'vatCrowd'; mesh.userData.noFreeze = true; mesh.userData.armyBatch = true; mesh.count = 0;
  if (old) { scene?.remove(old); old.geometry.dispose(); old.dispose(); }
  b.mesh = mesh; b.vat = vat; b.cap = cap;
  scene?.add(mesh);
}
// 中景の形を軽くする（10/24）：一人の三角を VAT.triFar（15m より先）・VAT.triNear（8〜15m）までに減らす。
//   頂点はそのまま、面の並びだけを替える（色・骨の重み・絵の座標はそのまま）。主の糸を止めないよう、別の糸（qem_index.js の simplifyAsync）で作る。
//   出来るまでは元の形で描く。別の糸が使えない時は元の形のまま
function lighten(S, target, key) {
  const ix = S.geo.index, pos = S.geo.attributes.position;
  if (!target || !ix || ix.count / 3 <= target * 1.15) return;
  const { P, U, I } = geoArrays(S.geo);
  simplifyAsync(P, U, I, target).then((J) => {
    if (!J || shapes.get(key) !== S) return;
    const attr = new THREE.BufferAttribute(pos.count > 65535 ? J : Uint16Array.from(J), 1);
    S.fullIndex = S.geo.index; S.geo.setIndex(attr);   // fullIndex：前と比べる写真の時だけ使う
    if (S.mesh) S.mesh.geometry.setIndex(attr);
    VAT.stat.lightened = (VAT.stat.lightened || 0) + 1;
  });
}
// 0〜1 の正規化した色を 8 bit の整数三つから一つの浮動小数へ
const pack3 = (a, i) => {
  const r = Math.round(Math.min(1, Math.max(0, a.getX(i))) * 255), g = Math.round(Math.min(1, Math.max(0, a.getY(i))) * 255), b = Math.round(Math.min(1, Math.max(0, a.getZ(i))) * 255);
  return r * 65536 + g * 256 + b;
};
// 束の形 g を、形の束（形ごとに一つ）と色の置き場（姿ごと）へ入れる
function addShape(g, near = false) {
  if (!g || !g.index || !g.attributes.position.count || !g.attributes.skinIndex || !g.attributes.color) return null;
  const sk = g.userData.shapeKey || g.uuid;
  let S = shapes.get(sk);
  if (!S) {
    // 形の配列は自分の物に写す（束の形の表が掃除で手放しても、こちらは残る）
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      const a = g.attributes[k];
      if (a) geo.setAttribute(k, new THREE.BufferAttribute(a.array.slice(), a.itemSize, a.normalized));
    }
    geo.setIndex(new THREE.BufferAttribute(g.index.array.slice(), 1));
    S = newBatch(geo, MAT_BODY);
    shapes.set(sk, S); VAT.stat.shapes++;
    lighten(S, near ? VAT.triNear : VAT.triFar, sk);
  }
  const n = g.attributes.position.count;
  if (colUsed + n > colRows * CW) {
    let r = colRows; while (colUsed + n > r * CW) r *= 2;
    if (r > 1024) throw new Error('色の置き場があふれる');
    growCol(r);
  }
  const base = colUsed; colUsed += n;
  const C = g.attributes.color, C2 = g.attributes.col2 || C, M = g.attributes.mtl;
  for (let i = 0; i < n; i++) {
    const o = (base + i) * 4;
    colData[o] = pack3(C, i); colData[o + 1] = pack3(C2, i); colData[o + 2] = M ? M.getX(i) : 0; colData[o + 3] = 0;
  }
  COLUP.dirty = true;
  return { S, base, gen: COLUP.gen + 1 };
}
const BUILD = { left: 0 };
// 色の絵の送り直しは一度に全部を送るので、十五コマに一度にまとめる（新しい姿は送った後から描く）
const COLUP = { dirty: false, gen: 0, at: -99 };
const nearQ = [];
// 近い形は後のコマで一つずつ作る（出来るまでは遠い形）
function nearStep() {
  const rec = nearQ.shift();
  if (!rec) return;
  try {
    const P = nearArmorParts(lookParts(rec.look)); P.look.sohei = false;
    const near = addShape(crowdGeometry(P, P.look, null, true, true), true);
    if (near) { rec.nS = near.S; rec.nB = near.base; rec.ngen = near.gen; }
  } catch (e) { VAT.stat.fails++; VAT.stat.err = String(e.message || e).slice(0, 80); }
}
// 姿ごとの形：15m の内は近い部品の全身（骨の人の近い形と同じ部品）、その先は遠い部品の全身（骨の人の遠い形と同じ）
function lookOf(u) {
  const L0 = u.look;
  if (looks.has(L0)) return looks.get(L0);
  // 新しい姿の形づくりは一コマに一つまで（束ねる形を作る重さを散らす）
  if (BUILD.left <= 0) return undefined;
  BUILD.left--;
  let rec = null;
  try {
    const look = humanLook(L0);
    if (!isSohei(L0) && !look.nanban && !look.hero && !look.kosode) {
      const Plo = lookParts(look, false);
      const far = addShape(crowdGeometry(Plo, Plo.look, null, true, true));
      if (far) {
        rec = { shape: far.S, colBase: far.base, nshape: far.S, ncolBase: far.base, look, nq: false, gen: far.gen };
        VAT.stat.looks++;
      }
    }
  } catch (e) { rec = null; VAT.stat.fails++; VAT.stat.err = String(e.message || e).slice(0, 80); }
  looks.set(L0, rec);
  return rec;
}
// 得物の形：得物の根（u.wpn）の座標に、見えている兵の材質の部品をまとめる
const _wm = new THREE.Matrix4(), _wi = new THREE.Matrix4();
function wpnKeyOf(u) { return u.wpn && u.wpn.geometry ? u.wpn.geometry.uuid + '|' + (u.wpn.userData.lod ? u.wpn.userData.lod[1].uuid : '') : null; }
function wpnOf(u) {
  const k = wpnKeyOf(u);
  if (!k) return null;
  if (wpns.has(k)) return wpns.get(k);
  let rec = null;
  try {
    const w = u.wpn, list = [];
    w.updateMatrixWorld(true);
    _wi.copy(w.matrixWorld).invert();
    const add = (o, geo) => {
      const A = geo.attributes;
      if (!A.position || !A.color || !A.mtl) return;
      const g = new THREE.BufferGeometry();
      _wm.multiplyMatrices(_wi, o.matrixWorld);
      const n = A.position.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3), C2 = new Float32Array(n * 3), MT = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        P[i * 3] = A.position.getX(i); P[i * 3 + 1] = A.position.getY(i); P[i * 3 + 2] = A.position.getZ(i);
        if (A.normal) { N[i * 3] = A.normal.getX(i); N[i * 3 + 1] = A.normal.getY(i); N[i * 3 + 2] = A.normal.getZ(i); }
        if (A.uv) { UV[i * 2] = A.uv.getX(i); UV[i * 2 + 1] = A.uv.getY(i); }
        C[i * 3] = A.color.getX(i); C[i * 3 + 1] = A.color.getY(i); C[i * 3 + 2] = A.color.getZ(i);
        const c2 = A.col2 || A.color;
        C2[i * 3] = c2.getX(i); C2[i * 3 + 1] = c2.getY(i); C2[i * 3 + 2] = c2.getZ(i);
        MT[i] = A.mtl.getX(i);
      }
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.setAttribute('col2', new THREE.BufferAttribute(C2, 3)); g.setAttribute('mtl', new THREE.BufferAttribute(MT, 1));
      const ix = geo.index ? Array.from(geo.index.array) : Array.from({ length: n }, (_, i) => i);
      g.setIndex(ix);
      g.applyMatrix4(_wm);
      list.push(g);
    };
    const walk = (o, top) => {
      if (!o.visible && !top) return;
      if (o.isMesh && o.material === MAT || o.isMesh && o.material?.userData?.batchAs === MAT) {
        const L = o.userData.lod;
        add(o, L ? L[1] : o.geometry);
      }
      for (const c of o.children) walk(c, false);
    };
    walk(w, true);
    if (list.length) {
      const merged = list.length === 1 ? list[0] : mergeAll(list);
      if (merged) { rec = newBatch(merged, MAT_WPN); }
    }
  } catch (e) { rec = null; VAT.stat.fails++; VAT.stat.err = String(e.message || e).slice(0, 80); }
  wpns.set(k, rec);
  return rec;
}
function mergeAll(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const out = new THREE.BufferGeometry();
  for (const [k, s] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3], ['col2', 3], ['mtl', 1]]) {
    const A = new Float32Array(nv * s); let o = 0;
    for (const g of list) { A.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(A, s));
  }
  const I = new Uint32Array(ni); let o = 0, base = 0;
  for (const g of list) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[o++] = ix[i] + base; base += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

// ---- 焼く（場面の外の作り物の兵と人で、動きの組ごとに一度だけ） ----
const rigs = new Map();   // 得物の組の鍵 → { key, src, u, clips, done, failed }
const RIG = { h: null, build: null, look: null, owner: null };
// 動きの組は得物の種類だけで分ける（槍の長さ・兵の種類の違いは骨の動きにほとんど出ない。焼く数を減らす）
const rigKey = (u) => (u.wpnKind || u.lookWeapon || 'none') + '|' + (u.look.swordHand || '');
const _Ri = new THREE.Matrix4(), _M = new THREE.Matrix4();
function capture(u, h, row) {
  u.mesh.updateMatrixWorld(true);
  _Ri.copy(u.mesh.matrixWorld).invert();
  const arm = h.parts.armor, sk = arm.skeleton;
  for (let i = 0; i < ALLB.length; i++) {
    _M.multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]).multiply(arm.bindMatrix).premultiply(_Ri);
    writeRow(row, i, _M);
  }
  if (u.wpn) { _M.multiplyMatrices(_Ri, u.wpn.matrixWorld); writeRow(row, WPN, _M); }
}
function freshState(u) {
  u.target = null; u.atk = null; u.swing = null; u.hit = null; u.poseTarget = null; u.watch = null; u.moving = 0;
  u.charging = false; u.contactBrace = 0; u.guard = 0; u.guarding = 0; u.stagger = 0; u.recoil = 0; u.strikeT = 0; u.sweepT = 0;
  u.alive = true; u.dying = false; u.death = null; u.deadT = 0; u.fall = 1; u.forceSpd = 0; u.cheer = 0; u.confused = 0;
  u.mesh.rotation.set(0, 0, 0); u.mesh.position.set(0, 0, 0); u.pos.set(0, 0, 0); u.heading = 0;
}
function makeFoe(u) {
  const f = new Unit({ type: 'ashigaru', team: 1 - (u.team || 0) });
  f.pos.set(0, 0, 2.6); f.heading = Math.PI; f.target = u; f.lookWeapon = u.lookWeapon; f.wpnKind = u.wpnKind;
  f.group = { morale: 100, units: [f] }; f.bakeFoe = true;
  return f;
}
// 一つの動きを焼く。行の並びと長さを返す
const DL = { t: 0 };   // 焼きの一コマの締め切り
function* bakeClip(army, R, name) {
  const u = R.u, h = RIG.h, F = VAT.fps;
  freshState(u);
  const foe = R.foe, g = u.group;
  g.formation = null; g.order = null; g.marching = true; u._lineFront = null; u.pressBack = null;
  if (VARIANT[name]) {
    // 長柄でない組は元の動きの行を使う（焼かない）
    if ((u.wpnKind || u.lookWeapon) !== 'spear') return { ...R.clips[CLIP[VARIANT[name]]] };
    if (name === 'idleHedge') { g.formation = 'yari'; g.order = 'yari'; g.marching = false; g._stepCols = 1; u.slot = 0; }
    else u._lineFront = R.friend;
    name = VARIANT[name];
  }
  const step = (dt) => { army.animate(u, dt, true); gripPose(h, dt); driveHuman(h, dt, true, true); };
  const idleA = h.act.idle, idleDur = idleA.getClip().duration / Math.max(0.01, idleA.timeScale);
  const start = rowsUsed;
  let n = 0, loop = false, len = 0;
  const rec = () => { capture(u, h, rowsUsed++); n++; };
  if (name === 'idle' || name === 'guard') {
    loop = true;
    if (name === 'guard') { u.target = foe; u.poseTarget = foe; u.watch = foe; }
    n = 0; const N = Math.max(8, Math.round(idleDur * 10)), dt = idleDur / N;   // 待ちと構えはゆっくりなので一秒に十枚（間は混ぜる）
    for (let k = 0; k < Math.round(0.6 * F); k++) step(1 / F); if (performance.now() > DL.t) yield;
    idleA.time = ((-dt) % idleDur + idleDur) % idleDur;
    for (let k = 0; k < N; k++) { if (name === 'guard') { u.target = foe; } step(dt); if (performance.now() > DL.t) yield; rec(); }
    len = idleDur;
  } else if (name === 'walk' || name === 'run') {
    loop = true;
    const sp = name === 'walk' ? 1.3 : 4.5;
    h.strideK = 1;
    const wd = h.act.walk.getClip().duration, rd = h.act.run.getClip().duration;
    const rate = name === 'walk' ? (sp / SRC.vWalk) / wd : Math.max(0.7, Math.min(1.35, sp / SRC.vRun)) / rd;
    const N = Math.max(8, Math.round(F / rate)), dt = 1 / (N * rate);
    u.moving = sp; u.forceSpd = sp; h.spd = sp;
    h.gaitPhase = 1 - 1 / N;
    for (let k = 0; k < N; k++) { h.spd = sp; h.last.copy(u.pos); step(dt); if (performance.now() > DL.t) yield; }
    h.gaitPhase = 1 - 1 / N;
    for (let k = 0; k < N; k++) { h.spd = sp; h.last.copy(u.pos); step(dt); if (performance.now() > DL.t) yield; rec(); }
    len = 1;   // 一周（時刻は歩みの割合 0〜1）
    u.forceSpd = undefined;
  } else if (name === 'atk') {
    u.target = foe; u.poseTarget = foe;
    const w = u.wpnKind || u.lookWeapon;
    for (let k = 0; k < Math.round(0.4 * F); k++) step(1 / F); if (performance.now() > DL.t) yield;
    if (w === 'gun') {
      const dur = 1.4; u.atk = { t: dur, dur, target: foe, ranged: true };
      const N = Math.ceil(dur * F) + 1;
      for (let k = 0; k < N; k++) { u.atk.t = Math.max(0, dur - k / F); step(1 / F); if (performance.now() > DL.t) yield; rec(); }
      len = dur;
    } else if (w === 'bow') {
      const dur = 1.9; u.atk = { t: dur, dur, target: foe, bow: true };
      const N = Math.ceil(dur * F) + 1;
      for (let k = 0; k < N; k++) { u.atk.t = Math.max(0, dur - k / F); step(1 / F); if (performance.now() > DL.t) yield; rec(); }
      len = dur;
    } else {
      const kind = w === 'spear' ? 'thrust' : 'kesa', S_ = kind === 'thrust' ? [0.22, 0.5] : [0.26, 0.55];
      const dur = S_[0] + 0.3;
      u.swing = { kind, t: 0, dur: S_[0], at: S_[1], target: foe, done: true, res: 'hit', d: 2.6, side: 1 };
      u.strikeT = 0.2;
      const N = Math.ceil(dur * F) + 1;
      for (let k = 0; k < N; k++) { u.swing.t = k / F; if (u.strikeT > 0) u.strikeT = Math.max(0, 0.2 - k / F); step(1 / F); if (performance.now() > DL.t) yield; rec(); }
      len = dur;
    }
  } else if (name === 'hit') {
    for (let k = 0; k < Math.round(0.4 * F); k++) step(1 / F); if (performance.now() > DL.t) yield;
    const dur = 0.55;
    u.hit = { kind: 'recoil', t: 0, dur, side: 1, amp: 1, from: 'front', part: 'torso', res: 'hit', heavy: false, wkind: 'thrust' };
    u.recoil = 0.22;
    const N = Math.ceil(dur * F) + 1;
    for (let k = 0; k < N; k++) { u.hit.t = k / F; step(1 / F); if (performance.now() > DL.t) yield; rec(); }
    u.hit = null; len = dur;
  } else if (name === 'dieF' || name === 'dieB' || name === 'dieS') {
    for (let k = 0; k < Math.round(0.4 * F); k++) step(1 / F); if (performance.now() > DL.t) yield;
    u.alive = false; u.dying = false; u.hp = 0;
    u.death = { kind: name === 'dieF' ? 'forward' : name === 'dieB' ? 'back' : 'side', floor: true, side: 1, t: 0, fwd: name === 'dieF', pace: 1 };
    h.still = false;
    const N = Math.ceil(DEATH_END * F) + 1;
    for (let k = 0; k < N; k++) { step(1 / F); if (performance.now() > DL.t) yield; rec(); }
    len = DEATH_END;
    u.alive = true; u.death = null;
  }
  return { start, n: rowsUsed - start, loop, len };
}
function rigUnit(src) {
  const u = new Unit({ type: src.type, team: src.team || 0 });
  u.group = { morale: 100, units: [u], faction: src.group?.faction };
  buildModel(u, { ...src.look, flag: null, standard: null, uma: null });
  u.mesh.scale.set(1, 1, 1);
  u.bakeRig = true; u.camD = 999; u.qualityTier = 0; u.shOn = false;
  u.wpnKind = src.wpnKind;
  return u;
}
// 作り物の人を一つだけ作る（小分け）。出来たら true
function rigHuman(src, budget) {
  if (RIG.h) return true;
  if (!VAT.hooks.build) return false;
  if (!RIG.build) {
    RIG.owner = rigUnit(src);
    RIG.build = VAT.hooks.build(RIG.owner, RIG.owner.look);
  }
  const t0 = performance.now();
  let s;
  do { s = RIG.build.next(); } while (!s.done && performance.now() - t0 < budget);
  if (!s.done) return false;
  RIG.build = null;
  const h = s.value;
  if (!h) return false;   // 人の枠が空くまで待つ（iPhone の貸し出しの枠）
  if (!h.parts.armor || !h.parts.armor.skeleton || h.parts.armor.skeleton.bones.length !== ALLB.length) { RIG.failed = true; return false; }
  RIG.h = h;
  return true;
}
function attachRig(R) {
  const h = RIG.h, u = R.u;
  if (h.u === u && u.human === h) return;
  if (h.u && h.u !== u) h.u.human = null;
  h.u = u; u.human = h;
  u.mesh.add(h.root);
  h.root.visible = true;
  h.poseReady = false; h.drove = false; h.still = false; h.acc = 0; h.spd = 0; h.last.set(0, 0, 0);
  if (u.body) u.body.visible = false;
  if (u.legL) { u.legL.visible = false; u.legR.visible = false; }
  h.root.updateMatrixWorld(true);
}
// 一コマの焼きの仕事（ms の内）
function bakeTick(army, budget) {
  const t0 = performance.now();
  for (const R of rigs.values()) {
    if (R.done || R.failed) continue;
    if (!rigHuman(R.src, budget)) { if (RIG.failed) R.failed = true; return; }
    if (performance.now() - t0 > budget) return;
    if (!R.u) { R.u = rigUnit(R.src); R.foe = makeFoe(R.u); R.friend = makeFoe(R.u); R.friend.team = R.u.team; R.friend.target = null; R.friend.pos.set(0, 0, 1.3); R.friend.heading = 0; R.clips = []; }
    attachRig(R);
    DL.t = t0 + budget;
    while (R.clips.length < CLIPS.length) {
      if (!R.gen) { if (rowsUsed + 64 > ROWS) { R.failed = true; return; } R.gen = bakeClip(army, R, CLIPS[R.clips.length]); }
      let r;
      try { r = R.gen.next(); }
      catch (e) { R.gen = null; R.failed = true; VAT.stat.fails++; VAT.stat.err = 'bake ' + String(e.message || e).slice(0, 80); return; }
      if (!r.done) break;   // 締め切り：続きは次のコマ
      R.gen = null; R.clips.push(r.value);
      if (performance.now() > DL.t) break;
    }
    if (R.clips.length === CLIPS.length) { R.done = true; vatTex.needsUpdate = true; VAT.stat.rigs++; VAT.stat.rows = rowsUsed; }
    VAT.stat.bakeMs += performance.now() - t0;
    return;
  }
  // 全部焼けたら作り物の人を手放す
  if (RIG.h && ![...rigs.values()].some((R) => !R.done && !R.failed)) releaseRig();
}
function releaseRig() {
  const h = RIG.h;
  if (!h) return;
  if (h.u) { h.u.human = null; h.root.parent?.remove(h.root); }
  try { VAT.hooks.release?.(h); } catch (e) { /* 手放せなくても描きには使わない */ }
  RIG.h = null;
}

// ---- 兵ごとの動きの番号と時刻 ----
const fadeT = 0.18;
function clipRow(C, t) {
  // 戻り値：[行A, 行B, 割合]
  if (C.loop) {
    const f = (((t / C.len) % 1) + 1) % 1 * C.n, a = Math.floor(f) % C.n;
    return [C.start + a, C.start + (a + 1) % C.n, f - Math.floor(f)];
  }
  const f = Math.min(C.n - 1, Math.max(0, t * VAT.fps)), a = Math.floor(f);
  return [C.start + a, C.start + Math.min(C.n - 1, a + 1), f - a];
}
function stateOf(army, u, R, dt) {
  const V = u.vat;
  // 速さ（位置の動きから。骨の人と同じならし方）
  const dx = u.pos.x - V.lx, dz = u.pos.z - V.lz; V.lx = u.pos.x; V.lz = u.pos.z;
  const inst = dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0;
  V.sp += (inst - V.sp) * Math.min(1, dt * 6);
  const sp = V.sp, w = u.wpnKind || u.lookWeapon;
  const strideK = V.strideK;
  // 歩みの割合は骨の人と同じ式で進める（近くで人へ替わる時に足がそろう）
  const wd = R.wd, rd = R.rd;
  const wRun = Math.max(0, Math.min(1, (sp - 2.6) / 1.6));
  if (sp > 0.05) {
    const tsW = Math.max(0.5, sp / (SRC.vWalk * strideK)), tsR = Math.max(0.7, Math.min(1.35, sp / (SRC.vRun * strideK)));
    const rate = (1 - wRun) * tsW / wd + wRun * tsR / rd;
    V.phase = ((V.phase + dt * rate) % 1 + 1) % 1;
  }
  let clip, t;
  const g = u.group;
  const up = w === 'spear' && !!(u._lineFront?.alive || u.pressBack?.alive);
  const hedge = w === 'spear' && g && g.formation === 'yari' && !g.marching && !g.routed && !u.fleeing && (g.order === 'yari' || g.order === 'hold')
    && Math.floor(u.slot / Math.max(1, g._stepCols || 1)) <= 1;
  const melee = (w === 'spear' || w === 'sword') && u.swing;
  if (!u.alive || u.dying) { clip = u.death ? (u.death.kind === 'forward' || u.death.kind === 'crumple' && u.death.fwd ? CLIP.dieF : u.death.kind === 'back' ? CLIP.dieB : CLIP.dieS) : CLIP.dieF; t = u.death ? u.death.t : u.deadT; }
  else if (u.hit && u.hit.t < u.hit.dur) { clip = CLIP.hit; t = u.hit.t / u.hit.dur * R.clips[CLIP.hit].len; }
  else if (melee) { clip = CLIP.atk; t = u.swing.t; }
  else if (u.atk && (u.atk.ranged || u.atk.bow)) { clip = CLIP.atk; t = (u.atk.dur - u.atk.t) / u.atk.dur * R.clips[CLIP.atk].len; }
  else if (sp > 3.4) { clip = CLIP.run; t = V.phase; }
  else if (sp > 0.3) { clip = up ? CLIP.walkUp : CLIP.walk; t = V.phase; }
  else if ((u.target && u.target.alive && u.target.pos && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 6) || u.atk || (u.contactBrace || 0) > 0.3) { clip = CLIP.guard; t = army.time + V.seed * 9; }
  else { clip = hedge ? CLIP.idleHedge : up ? CLIP.idleUp : CLIP.idle; t = army.time + V.seed * 9; }
  const [a, b, f] = clipRow(R.clips[clip], t);
  if (clip !== V.clip) {
    if (V.clip >= 0) { V.fromRow = f < 0.5 ? V.rowA : V.rowB; V.fade = 0; }
    V.clip = clip;
  }
  if (V.fade < 1) {
    V.fade = Math.min(1, V.fade + dt / fadeT);
    V.rowA = a; V.rowB = b;
    // 入れ替えの間は、前の姿勢から新しい姿勢へ
    V.out0 = V.fromRow; V.out1 = f < 0.5 ? a : b; V.outW = V.fade * V.fade * (3 - 2 * V.fade);
  } else { V.rowA = a; V.rowB = b; V.out0 = a; V.out1 = b; V.outW = f; }
}

// ---- 選ぶ（updateHumans の初めに。カメラからの遠さで、骨の人・VAT・遠い描き方を決める） ----
let lastArmy = null, frame = 0;
const list = [];
export function vatFar() { return EFUDA.on ? EFUDA.far - 2 : realNear(); }
function eligible(u) {
  return !u.gone && u.mesh && u.look && !u.isPlayer && !u.isSub && !u.name && !u.mounted && !u.horse && !u.isStandard && !u.isStruct
    && u.type !== 'busho' && u.type !== 'cavalry' && u.type !== 'dummy' && u.type !== 'porter' && !qualityKeeper(u)
    && !u.climb && !u.perch && !u.naka && !u.downed && !u.dragging && !u.tatake && !u.duelW && !u.efuda && !u.imp
    && !(u.death && u.death.aid) && !u.standardFlag && !u.riderModel && !u.fall2;
}
function setOn(u, on, keepHand = false) {
  if (!!u.vatOn === on) return;
  u.vatOn = on;
  if (on) {
    const h = u.human;
    if (h && humans.has(h) && h.drove) { u.vat.phase = h.gaitPhase || 0; u.vat.sp = h.spd || 0; }
    if (h) dropHuman(u);
    if (u.body) u.body.visible = false;
    if (u.legL) { u.legL.visible = false; u.legR.visible = false; }
    if (u.hand) u.hand.visible = false;
  } else {
    if (u.hand) { u.hand.visible = true; if (u.hand.parent) u.hand.updateMatrixWorld(true); }
    const h = u.human, live = h && humans.has(h) && h.root.visible;
    if (!live && !keepHand) { if (u.body) u.body.visible = true; if (u.legL) { u.legL.visible = true; u.legR.visible = true; } }
    // 軽い兵の構えを今の状態で一度置き直す（手・得物が古い所に残らない）
    try { lastArmy?.animate(u, 0, true); } catch (e) { /* 置き直せなくても次のコマで直る */ }
  }
}
// 枠を超えた近景も、中景と同じ全身の形と焼いた動きで描く。
function prepareVat(u) {
  const key = rigKey(u);
  let R = rigs.get(key);
  if (!R) { R = { key, src: u, u: null, clips: [], done: false, failed: false }; rigs.set(key, R); }
  if (!R.done) return false;
  if (!R.wd) { R.wd = SRC.anims.walk.duration; R.rd = SRC.anims.run.duration; }
  const L = lookOf(u), W = L ? wpnOf(u) : null;
  if (!L || L.gen > COLUP.gen || (u.wpn && !W)) return false;
  u.vatL = L; u.vatW = W; u.vatR = R;
  return true;
}
function showVat(u) {
  if (!u.vat) u.vat = { lx: u.pos.x, lz: u.pos.z, sp: 0, phase: 0, clip: -1, fade: 1, rowA: 0, rowB: 0, fromRow: 0, out0: 0, out1: 0, outW: 0, seed: ((u.id || 1) * 0.6180339) % 1, strideK: 0 };
  if (!u.vat.strideK) { const s = ((u.id || 1) * 0.6180339) % 1; u.vat.strideK = 0.9 + ((s * 17.3) % 1) * 0.2; }
  if (!u.vatOn) { u.vat.lx = u.pos.x; u.vat.lz = u.pos.z; u.vat.clip = -1; u.vat.fade = 1; }
  setOn(u, true);
}
export function vatOverflow(u) {
  if (!VAT.on || !HUM.ready || !SRC || isNoRender() || !eligible(u) || !prepareVat(u)) return false;
  // 近景へ戻る待ちの兵は、既にこのコマの描画表に入っている。
  if (!u.vatOn) list.push(u);
  u.vatWant = true;
  showVat(u);
  VAT.stat.units = list.length;
  return true;
}
export function vatSelect(rt, dt) {
  if (!VAT.on || !HUM.ready || !SRC || isNoRender()) return;
  const t0 = performance.now();
  const army = rt.army, cam = rt.camera;
  if (!army || !cam) return;
  if (army !== lastArmy) vatReset(army, rt.scene);
  frame++;
  if (!MAT_BODY) { MAT_BODY = vatMaterial(true); MAT_WPN = vatMaterial(false); }
  ensureTex();
  const near = VAT.near, far = vatFar(), h = VAT.hyst, cx = cam.position.x, cz = cam.position.z;
  list.length = 0;
  BUILD.left = dt === 0 ? 24 : 1;
  for (const u of army.units) {
    if (u.bakeRig) continue;
    const ok = !skinOpponent(rt.player?.u, u) && eligible(u) && (u.alive && !u.dying || u.vatOn);
    let want = false, hold = false;
    if (ok) {
      const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
      const lo = u.vatOn ? near - h : near + h, hi = u.vatOn ? far + h : far - h;
      want = d >= lo && d <= hi;
      // 近づいて骨の人へ替わる間は、人が出来て描かれるまで VAT のまま（画面で消えない）
      if (!want && u.vatOn && d < lo && u.alive && !u.dying) hold = true;
    }
    if ((want || hold) && !prepareVat(u)) want = hold = false;
    u.vatWant = want;
    if (want || hold) { showVat(u); list.push(u); }
    else if (u.vatOn) setOn(u, false);
  }
  // 焼く（支度の間 dt=0 は大きく、戦の間は一コマ数ミリ秒まで）。焼く・姿の形・近い形の仕事は一コマに一つだけ
  let pending = false;
  for (const R of rigs.values()) if (!R.done && !R.failed) { pending = true; break; }
  if (pending) bakeTick(army, dt === 0 ? 40 : MEM_TIGHT ? 3 : 5);
  else if (RIG.h) releaseRig();
  if ((BUILD.left > 0 && !pending) || dt === 0) nearStep();
  VAT.stat.units = list.length;
  VAT.stat.selMs = performance.now() - t0;
}
// 人が出来て描かれたか（hold を解く）
function humanShown(u) { const h = u.human; return !!(h && humans.has(h) && h.root.visible && h.drove); }

// ---- 描く（Army.batchDraw の後。行列が新しくなった後） ----
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 3.5);
export function vatDraw(army, cam) {
  if (!VAT.on || !lastArmy || army !== lastArmy) return;
  const t0 = performance.now();
  if (COLUP.dirty && frame - COLUP.at >= 15) {
    COLUP.dirty = false; COLUP.at = frame; COLUP.gen++; colTex.needsUpdate = true;
    for (const L of looks.values()) if (L && L.nS && L.ngen <= COLUP.gen) { L.nshape = L.nS; L.ncolBase = L.nB; L.nS = null; }
  }
  for (const S of shapes.values()) S.n = 0;
  for (const W of wpns.values()) if (W) W.n = 0;
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  const dt = Math.min(0.1, Math.max(0, army.time - (VAT.lastT ?? army.time))); VAT.lastT = army.time;
  let drawn = 0;
  for (const u of list) {
    if (!u.vatOn) continue;
    if (!u.vatWant && humanShown(u)) { setOn(u, false, true); continue; }
    stateOf(army, u, u.vatR, dt);
    if (u.gone || !u.mesh || u.camHidden || !u.mesh.parent) continue;
    const e = u.mesh.matrixWorld.elements;
    _sph.center.set(e[12], e[13] + 1, e[14]);
    if (!_fr.intersectsSphere(_sph)) continue;
    const V = u.vat;
    const cx = cam.position.x - e[12], cz = cam.position.z - e[14], nr = cx * cx + cz * cz < VAT.nearD * VAT.nearD;
    // 近い形は、その姿の兵が近くに来た時に作る（遠くにしか居ない姿の分は作らない）
    if (nr && VAT.nearShape && !u.vatL.nq) { u.vatL.nq = true; nearQ.push(u.vatL); }
    put(nr ? u.vatL.nshape : u.vatL.shape, e, V, nr ? u.vatL.ncolBase : u.vatL.colBase);
    if (u.vatW) put(u.vatW, e, V, 0);
    drawn++;
  }
  for (const S of shapes.values()) fin(S);
  for (const W of wpns.values()) if (W) fin(W);
  VAT.stat.drawn = drawn;
  VAT.stat.drawMs = performance.now() - t0;
}
function put(B, e, V, w) {
  if (B.n >= B.cap) growBatch(B, B.n + 1);
  const i = B.n++;
  B.mesh.instanceMatrix.array.set(e, i * 16);
  const a = B.vat.array;
  a[i * 4] = V.out0; a[i * 4 + 1] = V.out1; a[i * 4 + 2] = V.outW; a[i * 4 + 3] = w;
}
function fin(B) {
  if (!B.mesh) return;
  B.mesh.count = B.n; B.mesh.visible = B.n > 0;
  if (B.n) { B.mesh.instanceMatrix.needsUpdate = true; B.vat.needsUpdate = true; }
  if (B.mesh.parent !== scene && scene) scene.add(B.mesh);
}
export function vatReset(army, sc) {
  for (const u of list) if (u.vatOn) setOn(u, false);
  list.length = 0;
  for (const S of shapes.values()) if (S.mesh) { S.mesh.parent?.remove(S.mesh); S.mesh.dispose(); S.mesh = null; S.cap = 0; }
  for (const W of wpns.values()) if (W?.mesh) { W.mesh.parent?.remove(W.mesh); W.mesh.dispose(); W.mesh = null; W.cap = 0; }
  looks.clear(); colUsed = 0; nearQ.length = 0; COLUP.dirty = false; COLUP.gen = 0; COLUP.at = -99;
  lastArmy = army; scene = sc || null;
  // 絵の仕組み（シェーダ）を戦の初めに並べて作り始める（初めて描くコマで固まらない）
  if (sc && VAT.on && !isNoRender()) {
    if (!MAT_BODY) { MAT_BODY = vatMaterial(true); MAT_WPN = vatMaterial(false); }
    ensureTex();
    try {
      const warm = new THREE.Group(), box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      for (const m of [MAT_BODY, MAT_WPN]) { const im = new THREE.InstancedMesh(box, m, 1); im.frustumCulled = false; warm.add(im); }
      COMPILE_ASYNC?.(warm, sc)?.catch?.(() => {});
    } catch (e) { /* 作り始められなくても、描く時に作る */ }
  }
  if (army) army.vatDraw = (cam) => vatDraw(army, cam);
}
// 試し用：中の数
if (typeof window !== 'undefined') { window.__vat = VAT; VAT._shapes = shapes; }
