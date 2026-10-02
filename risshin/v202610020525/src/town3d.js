// ======================================================================
// 城下を歩く（kaito 2026-09-29「城下町を3Dで歩いて探索できるように」）
// 町家の並ぶ通り・市・武家屋敷・上官屋敷・問屋・馬屋・訓練場・宿・組の長屋、奥に城。
// 戦の作り（world・props・人）を使い回し、戸口に寄ると「入る」で今の城下の札の画面（screens.js の baseScreen）が開く。
// 出陣は町の門か上官屋敷で。町の人は二十人ほどまで。町家は形を使い回す（InstancedMesh）。
// 向き：北（+z）へ通りを上ると城。町の門は南の端
// ======================================================================
import { realmLeft } from './realm.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { yaguramon, dobei, tenshu, sumiyagura, ishigaki, kabukimon, tawara, umatsunagi, hut, koshisaku, kagaribi, solidRect, solidSeg, castleMat, nobori, palisade, dorui, yagura, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch, ITA_MAT } from './props.js';
import { allyGroup } from './bhelp.js';
import { goten, nagaya, mizubori } from './castle_parts.js';
import { doja } from './temple_parts.js';
import { buildHorse, horseStyleFor, buildModel } from './units.js';
import { RANKS, BATTLES, scenarioKey } from './state.js';
import { odaTown, seasonOf } from './oda_town.js';
import { isTouch } from './touch.js';
import { domOf } from './domain.js';
import { keraiOf } from './retainers.js';
import { S as SETTINGS } from './settings.js';
import { buildLife, lifePeople, lifeTick, lifeH, riseAt, townGrow } from './town_life.js';
import { airSetup, airTick, airResume } from './town_air.js';
import { crowdSetup, crowdTick } from './town_crowd.js';
import { buildShops, shopsPeople, shopsTick } from './town_shops.js';
import { eventsSetup, eventsTick } from './town_events.js';

const ST_W = 4.5;          // 通りの半分の幅
const GATE_Z = -80;        // 町の門（南）
const CROSS_Z = 30;        // 武家町へ折れる横の通り
const CASTLE_Z = 76;       // 城の石垣

// ---- 地面：町は門から城へゆるく上る（lifeH：寺の台・城の前の水堀も）。城は北の台地の上。町の外はゆるい起伏 ----
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function height(x, z) {
  const ax = Math.abs(x);
  const outer = Math.max(0, ax - 62) * 0.06 + Math.max(0, GATE_Z - 10 - z) * 0.04;
  const roll = 0.6 * Math.sin(x * 0.03 + 0.7) * Math.cos(z * 0.025) * sm(55, 80, ax + Math.max(0, -z - 70));
  // 城の台地：石垣の線から奥は 4m 上。門の前だけ坂にする
  let mound = 4 * sm(CASTLE_Z - 0.6, CASTLE_Z + 0.4, z);
  if (ax < 4) mound = Math.max(mound, 4 * sm(CASTLE_Z - 12, CASTLE_Z + 0.4, z));
  return outer + roll + mound + myH(x, z) + lifeH(x, z);
}
const inTown = (x, z) => Math.abs(x) < 64 && z > GATE_Z - 6 && z < 130;

// ---- 形の部品：箱に色（頂点の色）を付けて、材質ごとにまとめる ----
function colorize(g, col) {
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// 箱。uvk（m）を渡すと、絵の大きさを面の広さに合わせる
function box(w, h, d, x, y, z, col, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (o.uvk) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / o.uvk, uv.getY(i) * dims[f][1] / o.uvk); }
  }
  if (o.rx) g.rotateX(o.rx);
  if (o.rz) g.rotateZ(o.rz);
  if (o.ry) g.rotateY(o.ry);
  g.translate(x, y, z);
  return colorize(g.toNonIndexed(), col);
}
// 三角の板（妻壁）。両の面
function tri(a, b, c, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0], 2));
  g.computeVertexNormals();
  return colorize(g, col);
}
const cyl = (r0, r1, h, x, y, z, col, seg = 6, o = {}) => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (o.rx) g.rotateX(o.rx);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(x, y, z);
  return colorize(g.toNonIndexed(), col);
};
const mergeAll = (list) => (list.length ? mergeGeometries(list) : null);

// 格子の絵：縦の桟を一本（横に繰り返す）。透けた所は描かない
function koshiTex() {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = '#7a6044'; g.fillRect(0, 0, 11, 32);
  g.fillStyle = '#5a4430'; g.fillRect(9, 0, 2, 32);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// ---- 材質（一度だけ作って使い回す） ----
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    wood: castleMat('wood'), plaster: castleMat('plaster'), shitami: castleMat('shitami'), tile: castleMat('tile'), ita: ITA_MAT,
    cloth: new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    straw: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    // 格子・虫籠窓：夜は障子の内の灯りとして emissive を灯す（town_air.js が強さを動かす）
    koshi: new THREE.MeshStandardMaterial({ vertexColors: true, map: koshiTex(), alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: 0xffa858, emissiveIntensity: 0 }),
  };
  return MATS;
}

// ---- 町家（厨子二階・平入り）：幅 w・奥行き D。前（local +z）が通り。材質ごとの形を返す ----
const D = 8;
function machiyaParts(w, v = 0) {
  const P = { wood: [], plaster: [], tile: [], ita: [], cloth: [], koshi: [] };
  const f = D / 2;
  // 一階：板壁の箱と柱。前は格子と戸口
  P.wood.push(box(w, 2.7, D, 0, 1.35, 0, 0x5a4634, { uvk: 1.5 }));
  for (const sx of [-1, 1]) P.wood.push(box(0.2, 2.9, 0.2, sx * (w / 2 - 0.1), 1.45, f + 0.02, 0x3a2c20));
  P.wood.push(box(w + 0.1, 0.2, 0.22, 0, 2.7, f + 0.03, 0x3a2c20));             // 差鴨居
  // 格子（戸口の左右）
  // 格子は一枚の板に格子の絵（透かし）を貼る（細い棒を並べると重いので）
  for (const sd of [-1, 1]) {
    const x0 = 0.85, x1 = w / 2 - 0.25, lw = x1 - x0;
    P.koshi.push(box(lw, 1.9, 0.03, sd * (x0 + lw / 2), 1.25, f + 0.08, 0xffffff, { uvk: 0.13 }));
  }
  P.wood.push(box(1.5, 2.2, 0.04, 0, 1.1, f + 0.01, 0x0d0a07));                   // 戸口の暗がり
  P.wood.push(box(w, 0.25, 0.3, 0, 0.12, f + 0.1, 0x6f6a60));                      // 土台の石
  // 暖簾（三つに割った布）
  for (const x of [-0.5, 0, 0.5]) P.cloth.push(box(0.46, 0.8, 0.02, x, 2.18, f + 0.32, 0xffffff));
  P.wood.push(box(1.7, 0.05, 0.05, 0, 2.6, f + 0.32, 0x2a2018));                   // 暖簾の竿
  // 庇（一階の軒）
  P.ita.push(box(w + 0.3, 0.1, 1.5, 0, 2.95, f + 0.55, 0xffffff, { rx: 0.32, uvk: 2 }));
  // 二階（低い厨子二階）：漆喰の壁と虫籠窓
  const f2 = f - 0.9;
  P.plaster.push(box(w, 1.6, D - 1.8, 0, 3.5, -0.9 + 0.0, 0xd8d0bc, { uvk: 2 }));
  const nW = w > 6 ? 3 : 2;
  for (let i = 0; i < nW; i++) {
    const x = (i - (nW - 1) / 2) * (w / nW);
    P.wood.push(box(1.1, 0.5, 0.05, x, 3.55, f2 + 0.01, 0x1a1510));
    P.koshi.push(box(1.1, 0.5, 0.02, x, 3.55, f2 + 0.03, 0xe0d8c4, { uvk: 0.16 }));
  }
  // 大屋根（切妻・平入り）：板葺きに押さえの竹と石を並べる（戦国の町家の石置き屋根）。棟は奥寄り。前の軒は通りへ張り出す
  const ridgeZ = -0.9, ridgeY = 5.25, eaveY = 4.15, frontZ = f + 0.25, backZ = -f - 0.5;
  for (const [z1, sd] of [[frontZ, 1], [backZ, -1]]) {
    const dz = Math.abs(z1 - ridgeZ), len = Math.hypot(dz, ridgeY - eaveY), a = Math.atan2(ridgeY - eaveY, dz);
    P.ita.push(box(w + 0.7, 0.16, len, 0, (ridgeY + eaveY) / 2, (ridgeZ + z1) / 2, 0xffffff, { rx: sd * a, uvk: 2 }));
    // 押さえの竹（横に二本）と石（竹に沿って並べる）。石は漆喰の材質に灰の色で（描く回数を増やさない）
    for (const t of [0.35, 0.75]) {
      const zz = ridgeZ + (z1 - ridgeZ) * t, yy = ridgeY + (eaveY - ridgeY) * t + 0.12;
      P.wood.push(cyl(0.05, 0.05, w + 0.5, 0, yy, zz, 0x5a5444, 5, { rz: Math.PI / 2 }));
      const nS = Math.max(3, Math.round(w / 1.3));
      for (let k = 0; k < nS; k++) {
        const g = new THREE.DodecahedronGeometry(0.15 + ((k + v) % 3) * 0.035, 0);
        g.scale(1.25, 0.7, 1); g.translate(-w / 2 + (k + 0.5) * w / nS + ((k * 7 + v) % 3 - 1) * 0.1, yy + 0.1, zz + 0.02);
        g.deleteAttribute('uv'); const gn = g.toNonIndexed(); gn.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gn.attributes.position.count * 2), 2));
        P.plaster.push(colorize(gn, [0x8a867c, 0x7a766c, 0x948e80][(k + v) % 3]));
      }
    }
    // 妻壁（棟の下の三角）
    for (const sx of [-1, 1]) P.plaster.push(tri([sx * w / 2, 4.3, ridgeZ], [sx * w / 2, 4.3, z1 - sd * 0.6], [sx * w / 2, ridgeY - 0.1, ridgeZ], 0xd2cab6));
  }
  P.wood.push(box(w + 0.8, 0.22, 0.36, 0, ridgeY + 0.08, ridgeZ, 0x4a4234, { uvk: 1 }));
  // 卯建（両脇の袖壁）：隣と屋根を分ける。一軒おきに
  if (v % 2 === 0) for (const sx of [-1, 1]) {
    P.plaster.push(box(0.3, 1.1, 2.2, sx * (w / 2 + 0.05), 4.55, 1.2, 0xe0d8c6));
    P.tile.push(box(0.5, 0.12, 2.5, sx * (w / 2 + 0.05), 5.15, 1.2, 0xffffff, { uvk: 1 }));
  }
  return P;
}
// 町家を InstancedMesh で並べる：list は { x, z, rot, w, noren(色), wall(明るさ) }
function placeMachiya(rt, list) {
  const M = mats();
  const byW = new Map();
  for (const it of list) { const k = it.w; if (!byW.has(k)) byW.set(k, []); byW.get(k).push(it); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
  let vi = 0;
  for (const [w, items] of byW) {
    for (const v of [0, 1]) {
      const its = items.filter((_, i) => i % 2 === v);
      if (!its.length) continue;
      const parts = machiyaParts(w, v + vi);
      for (const [k, geos] of Object.entries(parts)) {
        const g = mergeAll(geos);
        if (!g) continue;
        const im = new THREE.InstancedMesh(g, M[k], its.length);
        its.forEach((it, i) => {
          p.set(it.x, rt.world.heightAt(it.x, it.z), it.z);
          q.setFromAxisAngle(up, it.rot);
          im.setMatrixAt(i, m4.compose(p, q, one));
          if (k === 'cloth') im.setColorAt(i, c.set(it.noren));
          else if (k === 'koshi') im.setColorAt(i, c.setScalar(1));
          else im.setColorAt(i, c.setScalar(it.shade ?? 1));
        });
        im.castShadow = k !== 'cloth' && k !== 'koshi'; im.receiveShadow = true;
        rt.scene.add(im);
      }
    }
    vi++;
  }
  // カメラが家の中へ入らないための見えない箱（player.js の camBlockHit が拾う）。形の球は町全体を覆う大きさにして、いつも候補に入れる
  for (const [w, items] of byW) {
    const g = new THREE.BoxGeometry(w + 0.6, 5.4, D + 1.2); g.translate(0, 2.7, 0.3);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    const im = new THREE.InstancedMesh(g, BLOCK_MAT, items.length);
    items.forEach((it, i) => { p.set(it.x, rt.world.heightAt(it.x, it.z), it.z); q.setFromAxisAngle(up, it.rot); im.setMatrixAt(i, m4.compose(p, q, one)); });
    im.userData.camBlock = true; im.castShadow = false; im.frustumCulled = false;
    rt.scene.add(im);
  }
  for (const it of list) solidRect(it.x, it.z, it.w + 0.2, D + 0.4, it.rot);
}
const BLOCK_MAT = new THREE.MeshBasicMaterial({ visible: false });

// ---- 看板（字はキャンバスで書く） ----
// 字の絵は看板ごとに作らず、町じゅうの看板を一枚の絵（アトラス）に詰めて、字の面を一度で描く（看板一つで描く回数が二つ増えていた）
function signCanvas(text, vertical = false) {
  const cv = document.createElement('canvas');
  const n = [...text].length;
  cv.width = vertical ? 64 : Math.max(128, n * 60 + 20); cv.height = vertical ? Math.max(128, n * 58 + 20) : 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#c9b48a'; g.fillRect(4, 4, cv.width - 8, cv.height - 8);
  // 木目
  g.globalAlpha = 0.18; g.strokeStyle = '#6a4e30';
  for (let i = 0; i < 12; i++) { g.beginPath(); const y = 5 + i * (cv.height - 10) / 12; g.moveTo(4, y); g.bezierCurveTo(cv.width * 0.3, y + 2, cv.width * 0.6, y - 2, cv.width - 4, y + 1); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = '#16110c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 48px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  if (vertical) [...text].forEach((ch, i) => g.fillText(ch, cv.width / 2, 10 + 29 + i * 58));
  else g.fillText(text, cv.width / 2, cv.height / 2 + 2);
  return cv;
}
const SIGN_BOARD_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
const SIGN_BOARD_GEO = new THREE.BoxGeometry(1, 1, 0.06);
function sign(rt, text, x, y, z, rot, h = 0.7, vertical = false) {
  const cv = signCanvas(text, vertical), a = cv.width / cv.height;
  const w = vertical ? h : h * a, hh = vertical ? h / a : h;
  // 板（単色。あとで町の形とまとめて描く）。字の面は finishSigns で一枚の絵へ
  const board = new THREE.Mesh(SIGN_BOARD_GEO, SIGN_BOARD_MAT);
  board.scale.set(w, hh, 1);
  board.position.set(x, rt.world.heightAt(x, z) + y, z); board.rotation.y = rot;
  board.castShadow = true;
  rt.scene.add(board);
  (rt.flags.signs = rt.flags.signs || []).push({ cv, w, hh, x, y: board.position.y, z, rot });
  return board;
}
function finishSigns(rt) {
  const L = rt.flags.signs || [];
  rt.flags.signs = null;
  if (!L.length) return;
  // 棚に詰める（高い順に並べ、左から右へ。はみ出たら次の段）
  const S = 1024, ord = L.slice().sort((p, q) => q.cv.height - p.cv.height);
  let x = 0, y = 0, rowH = 0;
  for (const s of ord) {
    if (x + s.cv.width > S) { x = 0; y += rowH + 2; rowH = 0; }
    s.ax = x; s.ay = y; x += s.cv.width + 2; rowH = Math.max(rowH, s.cv.height);
  }
  const H = Math.min(S, 2 ** Math.ceil(Math.log2(Math.max(64, y + rowH))));
  const cv = document.createElement('canvas'); cv.width = S; cv.height = H;
  const g = cv.getContext('2d');
  for (const s of L) g.drawImage(s.cv, s.ax, s.ay);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const geos = L.map((s) => {
    const pg = new THREE.PlaneGeometry(s.w, s.hh);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (s.ax + uv.getX(i) * s.cv.width) / S, 1 - (s.ay + (1 - uv.getY(i)) * s.cv.height) / H);
    pg.translate(0, 0, 0.031); pg.rotateY(s.rot); pg.translate(s.x, s.y, s.z);
    return pg;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  m.receiveShadow = true;
  rt.scene.add(m);
}
// 提灯：赤みの和紙の丸。夕刻は灯る（材質は灯る・灯らないの二つを使い回す）
const CHOCHIN = {};
//   町じゅうの提灯は一つの材質。灯りの強さは刻で変える（town_air.js が emissiveIntensity を動かす）。lit は始めの灯り
function chochin(rt, x, y, z, lit) {
  if (!CHOCHIN.geo) { CHOCHIN.geo = new THREE.SphereGeometry(0.22, 10, 8); CHOCHIN.geo.scale(1, 1.35, 1); }
  if (!CHOCHIN.mat) CHOCHIN.mat = new THREE.MeshStandardMaterial({ color: 0xb8683a, emissive: 0xff5a14, emissiveIntensity: 0, roughness: 0.8 });
  if (lit) CHOCHIN.mat.emissiveIntensity = 1.2;
  const m = new THREE.Mesh(CHOCHIN.geo, CHOCHIN.mat);
  m.position.set(x, rt.world.heightAt(x, z) + y, z);
  rt.scene.add(m);
  (rt.flags.lanterns = rt.flags.lanterns || []).push({ x, z });
}

// ---- 動かない形をまとめる：材質・影・場所（64m の升）ごとに、一つの形へ焼き込む ----
// 小屋・門・柵・看板の板・井戸・桶などは一つずつ描くと描く回数が増える（町だけで百五十ほど）。
// 建て終わった後に、from 番目より後に足した物のうち、動かない形（骨・旗の布・特別な陰の材質を除く）を一つにする。
// カメラ寄せの当たり（camBlock）だった形は、見えない材質の当たりとして残す。
function mergeStatic(rt, from) {
  const roots = rt.scene.children.slice(from);
  const groups = new Map(), drop = [];
  const proto = THREE.Material.prototype.onBeforeCompile;
  for (const root of roots) {
    let skip = false;
    root.traverse((o) => { if (o.isBone || o.isSkinnedMesh || o.isPoints || o.isSprite || o.isLight) skip = true; });
    if (skip || root.userData.noMerge) continue;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || !o.visible) return;
      const m = o.material;
      if (!m || Array.isArray(m) || m.visible === false || m.isShaderMaterial || m.transparent || m.onBeforeCompile !== proto || o.userData.flag) return;
      let geo = o.geometry;
      if (!geo || !geo.attributes.position || geo.morphAttributes.position) return;
      const e = o.matrixWorld.elements;
      const cell = Math.floor(e[12] / 64) + ':' + Math.floor(e[14] / 64);
      const names = Object.keys(geo.attributes).filter((n) => n === 'position' || n === 'normal' || n === 'uv' || n === 'color').sort();
      if (!names.includes('normal')) return;
      const key = m.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + cell + '|' + names.join(',');
      if (!groups.has(key)) groups.set(key, { m, cs: o.castShadow, rs: o.receiveShadow, names, geos: [], cam: [] });
      const G = groups.get(key);
      const g2 = new THREE.BufferGeometry();
      for (const n of names) g2.setAttribute(n, geo.attributes[n]);
      if (geo.index) g2.setIndex(geo.index);
      let gw = g2.index ? g2.toNonIndexed() : g2.clone();
      gw.applyMatrix4(o.matrixWorld);
      // 鏡に映した形（負の拡大）は、三角の向きを戻す
      if (o.matrixWorld.determinant() < 0) for (const n of names) { const a = gw.attributes[n], s = a.itemSize, arr = a.array; for (let t = 0; t < a.count; t += 3) for (let c = 0; c < s; c++) { const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c, v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; } }
      G.geos.push(gw);
      if (o.userData.camBlock) G.cam.push(gw);
      drop.push(o);
    });
  }
  let made = 0;
  for (const G of groups.values()) {
    const merged = mergeGeometries(G.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, G.m);
    mesh.castShadow = G.cs; mesh.receiveShadow = G.rs;
    mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
    made++;
    // 当たりは一つずつ残す（大きな一つにすると、近くの候補選びが効かない）
    for (const g of G.cam) { const c = new THREE.Mesh(g, BLOCK_MAT); c.userData.camBlock = true; c.matrixAutoUpdate = false; rt.scene.add(c); }
  }
  for (const o of drop) if (o.parent) o.parent.remove(o);
  return { meshes: drop.length, made };
}

// ---- 市の露店：四本の柱と布の日除け、台に品 ----
function stalls(rt, list) {
  const M = mats();
  const wood = [], cloth = [], goods = [];
  for (const x of [-1.1, 1.1]) for (const z of [-0.8, 0.8]) wood.push(box(0.08, z < 0 ? 2.2 : 1.9, 0.08, x, z < 0 ? 1.1 : 0.95, z, 0x4a3828));
  wood.push(box(2.2, 0.08, 1.2, 0, 0.75, 0.1, 0x6a5236, { uvk: 1 }));
  for (const x of [-0.95, 0.95]) wood.push(box(0.08, 0.75, 1.1, x, 0.37, 0.1, 0x4a3828));
  cloth.push(box(2.5, 0.03, 2.0, 0, 2.08, 0, 0xffffff, { rx: 0.14 }));
  // 品：籠・俵・壺
  goods.push(cyl(0.22, 0.16, 0.18, -0.6, 0.88, 0.2, 0x8a7040, 8), cyl(0.22, 0.16, 0.18, 0, 0.88, 0.25, 0x7a6436, 8), cyl(0.16, 0.2, 0.3, 0.6, 0.94, 0.15, 0x5a3c28, 8));
  goods.push(box(0.3, 0.12, 0.25, -0.2, 0.86, -0.25, 0x9a3a28), box(0.3, 0.12, 0.25, 0.35, 0.86, -0.25, 0x3a5a3a), box(0.25, 0.14, 0.2, -0.65, 0.87, -0.3, 0xc8b070));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
  for (const [geos, mat, col] of [[wood, M.wood, false], [cloth, M.cloth, true], [goods, M.straw, false]]) {
    const im = new THREE.InstancedMesh(mergeAll(geos), mat, list.length);
    list.forEach((s, i) => {
      p.set(s.x, rt.world.heightAt(s.x, s.z), s.z); q.setFromAxisAngle(up, s.rot);
      im.setMatrixAt(i, m4.compose(p, q, one));
      im.setColorAt(i, col ? c.set(s.cloth) : c.setScalar(1));
    });
    im.castShadow = true; im.receiveShadow = true;
    rt.scene.add(im);
  }
  for (const s of list) solidRect(s.x, s.z, 2.3, 1.4, s.rot);
}

// ---- 稽古の巻藁（杭と藁の束）----
function makiwara(rt, pts) {
  const geos = [];
  geos.push(cyl(0.07, 0.08, 1.9, 0, 0.95, 0, 0x4a3a2a, 6), cyl(0.2, 0.2, 0.9, 0, 1.25, 0, 0xb8a060, 8), box(1.1, 0.07, 0.07, 0, 1.5, 0, 0x4a3a2a));
  for (const y of [0.95, 1.25, 1.55]) geos.push(cyl(0.205, 0.205, 0.04, 0, y, 0, 0x6a5230, 8));
  const im = new THREE.InstancedMesh(mergeAll(geos), mats().straw, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => { im.setMatrixAt(i, m4.makeTranslation(x, rt.world.heightAt(x, z), z)); solidRect(x, z, 0.5, 0.5); });
  im.castShadow = true;
  rt.scene.add(im);
}

// ---- 井戸・荷車・水桶（町の暮らし）----
function well(rt, x, z) {
  const y = rt.world.heightAt(x, z);
  const g = mergeAll([
    cyl(0.75, 0.8, 0.8, 0, 0.4, 0, 0x6e675c, 12),
    box(0.1, 2.1, 0.1, -0.8, 1.05, 0, 0x4a3828), box(0.1, 2.1, 0.1, 0.8, 1.05, 0, 0x4a3828), box(1.8, 0.1, 0.1, 0, 2.1, 0, 0x4a3828),
    box(1.9, 0.08, 1.2, 0, 2.3, 0, 0x5a5048, { rz: 0 }),
    cyl(0.14, 0.12, 0.22, 0.2, 0.9, 0.3, 0x5a4028, 8),
  ]);
  const m = new THREE.Mesh(g, mats().straw); m.position.set(x, y, z); m.castShadow = true; rt.scene.add(m);
  solidCircle(x, z, 0.9);
}
function cart(rt, x, z, rot) {
  const y = rt.world.heightAt(x, z);
  const g = mergeAll([
    box(1.3, 0.1, 2.6, 0, 0.75, 0, 0x6a5236), box(0.08, 0.08, 3.6, -0.45, 0.72, 2.2, 0x4a3828), box(0.08, 0.08, 3.6, 0.45, 0.72, 2.2, 0x4a3828),
    cyl(0.55, 0.55, 0.08, -0.75, 0.55, 0, 0x3a2c20, 12, { rz: Math.PI / 2 }), cyl(0.55, 0.55, 0.08, 0.75, 0.55, 0, 0x3a2c20, 12, { rz: Math.PI / 2 }),
    cyl(0.28, 0.28, 0.75, -0.25, 1.1, -0.5, 0xb8a060, 8, { rz: Math.PI / 2 }), cyl(0.28, 0.28, 0.75, 0.3, 1.1, 0.2, 0xb0985a, 8, { rz: Math.PI / 2 }),
  ]);
  const m = new THREE.Mesh(g, mats().straw); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = true; rt.scene.add(m);
  solidRect(x, z, 1.5, 2.8, rot);
}
function solidCircle(x, z, r) { solidRect(x, z, r * 1.6, r * 1.6); }

// ---- 施設 ----
// tab：screens.js の baseScreen の札の鍵。door：戸口（「入る」の輪の中心）
const FAC = {
  boss: { n: '上官屋敷' }, squad: { n: '組の長屋' }, shop: { n: '武具屋' }, toiya: { n: '問屋' },
  train: { n: '訓練場' }, inn: { n: '宿' }, stable: { n: '馬屋' },
};

// ---- 町の人：言葉と、短い出来事 ----
const TALK = {
  merchant: ['安うしとくよ。戦の前は草鞋がよう売れる', '尾張の塩は良いぞ。汗をかく戦には欠かせん', '楽市のおかげで、座に銭を払わんでよくなった'],
  townsman: ['殿様のおかげで、この辺りも賑やかになった', '夜は辻に気をつけなされ。酔うた足軽が多い', '城の堀を広げるそうで、わしも駆り出される'],
  kid: ['お侍さま、その槍、触ってもええか', 'わしも大きゅうなったら足軽になる！', 'この前の戦で、首をいくつ取ったんじゃ？'],
  samurai: ['おぬしも出陣か。命を粗末にするなよ', '上役の屋敷は、城へ向かう辻を左じゃ。訓練場は右', '訓練場で汗を流しておけ。戦場で泣かずに済む'],
  elder: ['わしの若い頃は、今川が攻めてくると聞くだけで震えたもんじゃ', '戦に出る前は、井戸の水で顔を洗うと験がよい'],
};
// 話しかけると起きる、短い出来事（残る数は変えない。その場の気分と台詞だけ）
const HAPPEN = {
  kid: { q: '子どもが槍に触りたがっている', a: [{ label: '柄だけ触らせてやる', say: 'わあ、重い！　お侍さまは力持ちじゃ' }, { label: '危ないと叱る', say: 'ご、ごめんなさい……' }] },
  merchant: { q: '団子売りが一串すすめてくる', a: [{ label: '一串もらう（息が戻る）', say: 'まいど。戦の前は甘い物が一番よ', heal: true }, { label: '先を急ぐ', say: 'またどうぞ。ご武運を' }] },
  elder: { q: '年寄りが験担ぎの話をしたがっている', a: [{ label: '聞いてやる', say: '勝ち栗と昆布じゃ。打って、勝って、よろこぶ。忘れるでないぞ' }, { label: '礼を言って離れる', say: 'おう、ご無事でな' }] },
};

// 町の人の姿：具足を着ない。僧兵の直綴（脛までの衣）の形を借りて、町の小袖に見せる（袈裟は衣と同じ色で目立たせない）
const CLOTH = [0x3b4a5c, 0x5a4a36, 0x4a4238, 0x6a5a44, 0x2e3a4a, 0x5c3e2e, 0x4c5040, 0x7a6a50, 0x8a7a5a, 0x3a3430];
function dress(rt, u, kind, i) {
  const col = kind === 'samurai' ? [0x2a2a36, 0x3a2a22, 0x243028][i % 3] : kind === 'elder' ? 0x4a463e : CLOTH[(i * 7 + 3) % CLOTH.length];
  const look = {
    ...u.look, sohei: 1, soheiV: 3, monk: 1, tier: 0,
    hat: kind === 'samurai' || kind === 'elder' || kind === 'kid' ? 'none' : i % 3 === 0 ? 'hachimaki' : kind === 'merchant' && i % 2 ? 'jingasa' : 'none',
    kato: 0xd8d0bc, kesa: col, cloth: col, armor: col, lace: col, kote: 0, sode: false, haori: 0, horo: 0, menpo: 0, tenugui: false,
    saya: kind === 'samurai', trim: 0, left: null, haramaki: false, pole: false, flag: null, weapon: 'none',
  };
  const wasIn = !!u.mesh.parent;
  if (wasIn) rt.scene.remove(u.mesh);
  buildModel(u, look);
  u.mesh.position.copy(u.pos);
  u.mesh.rotation.y = u.heading || 0;
  if (kind === 'kid') u.mesh.scale.setScalar(0.62);
  else u.mesh.scale.setScalar(kind === 'elder' ? 0.9 : 0.93 + (i % 3) * 0.02);
  rt.scene.add(u.mesh);
}
const ROLE = { merchant: '商人', townsman: '町人', kid: '子ども', samurai: '侍', elder: '年寄り' };

// 歩く道の点（通りと辻と市）
const WALK = [
  [0, -72], [0, -55], [0, -40], [0, -25], [0, -10], [0, 5], [0, 18], [0, 30], [0, 45], [0, 60],
  [-20, 30], [-40, 30], [20, 30], [40, 30], [14, -40], [22, -34], [16, -28], [26, -44],
  [-14, -22], [-33, -22], [-44, -22], [-33, -40], [-33, -56], [-33, -6], [-33, 12],
];

// 町では戦の札を隠す（戦功・体力と気力・技の列・照準・方角・組の札）。任務の札・小さな地図・台詞・「入る」は残す
function townCss() {
  if (document.getElementById('town3d-css')) return;
  const st = document.createElement('style');
  st.id = 'town3d-css';
  st.textContent = '#hud.town .tl .plaque, #hud.town .tl .next, #hud.town .bl, #hud.town #h-bottom, #hud.town #crosshair, #hud.town #compass, #hud.town #h-squad, #hud.town #armybar, #hud.town #h-units, #hud.town #situation { display: none !important; }';
  document.head.appendChild(st);
}
// ======================================================================
export function townDef(game) {
  const G = game.G;
  const oda = scenarioKey() === 'oda';
  const TW = oda ? odaTown() : null;
  const info = (TW && TW.TOWNS[G.battle]) || { place: `${(BATTLES[G.battle] && BATTLES[G.battle].town) || '清洲'} 城下`, when: '', season: '春' };
  const season = info.season || seasonOf(info.when);
  const tod = Math.max(0, Math.min(2, G.actions ?? 2));   // 2 朝・1 昼・0 夕刻
  const timeKey = tod === 0 ? 'dusk' : 'day';
  const rumors = (TW && TW.RUMORS[G.battle]) || [];
  MYLV = myLevel(G);   // 地面（堀・城の台）を作る前に、我が館の格を決める
  const def = {
    town: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    title: info.place, info,
    place: info.place, when: `${info.when || ''}　${['夕刻', '昼', '朝'][tod]}`, season,
    spawn: { x: 0, z: GATE_Z + 6, heading: 0 },
    world: {
      seed: 1560, time: timeKey, mood: tod === 2 ? 'morning' : 'plain',
      height, clear: inTown, trees: 180, tufts: 2600, rocks: 60,
      paths: [[[0, GATE_Z - 60], [0, CASTLE_Z - 2]], [[-60, CROSS_Z], [60, CROSS_Z]], [[4, -38], [30, -38]],
        [[-4, LANE_Z], [MY_LANE_X, LANE_Z], [-57, LANE_Z]], [[MY_LANE_X, GATE_Z + 4], [MY_LANE_X, CROSS_Z - 4]], [[MY_LANE_X, MC.z], [MC.x + MC.hx - 1, MC.z]]],
      autumn: season === '秋', young: season === '春' || season === '夏', muddy: 0.15,
      groves: [[-90, 40, 30], [90, -20, 30], [-80, -60, 24], [70, 90, 30], [-60, 110, 28]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
      tint: (x, z, h, c) => {
        // 町の中の地面は踏み固めた土。軒下は少し暗い
        if (inTown(x, z) && z < CASTLE_Z - 1) c.lerp(new THREE.Color(0.40, 0.35, 0.27), Math.abs(x) < 50 ? 0.75 : 0.35);
      },
    },
    setup(rt) { townCss(); buildTown(rt, def); people(rt, def, rumors); guide(rt, def); const dl = document.getElementById('dateline'); if (dl) dl.textContent = def.when || ''; },
    update(rt, dt) { tick(rt, dt); },
    // 城下の札から「町を歩いて〇〇へ行く」：道しるべ（方角の印と任務の札）を出す。着けば消す
    guideTo(rt, tab) { guideTo(rt, tab); },
    // 札の画面から町へ戻った時：刻が進んでいれば、空の色を移ろわせる
    onResume(rt) {
      realmObj(rt);
      airResume(rt);   // 刻と空の移ろい（town_air.js）
    },
  };
  return def;
}

// ---- 町を建てる ----
function buildTown(rt, def) {
  const W = rt.world, F = rt.flags;
  const from = rt.scene.children.length;
  F.tod = Math.max(0, Math.min(2, rt.G.actions ?? 2));
  const dusk = F.tod === 0;
  if (CHOCHIN.mat) CHOCHIN.mat.emissiveIntensity = dusk ? 1.2 : 0;
  F.lanterns = []; F.torches = [];
  const NOREN = [0x2b3f5c, 0x7a3b22, 0x4f4030, 0x2b3f5c, 0x5a2a24, 0x3a4a3a];
  const list = [];
  let k = 0;
  // 土塀・石垣・櫓門・隅櫓・天守は材質ごとに一つの BatchedMesh へまとめ、draw call を減らす（buildMy と同じ考え）
  const kb = makeKitBatch();
  const addKB = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  const row = (side, z0, z1, skip) => {
    // side -1：通りの西（前は +x）、1：東（前は -x）
    let z = z0;
    while (z < z1) {
      const w = (k * 7) % 3 === 0 ? 6.5 : 5;
      if (!(skip && skip.some(([a, b]) => z + w > a && z < b))) {
        list.push({ x: side * (ST_W + D / 2 + 0.3), z: z + w / 2, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, w, noren: NOREN[k % NOREN.length], shade: 0.86 + ((k * 37) % 23) / 100 });
      }
      z += w + 0.25; k++;
    }
  };
  // 西の並び：宿・武具屋・問屋・使者の間・我が屋敷の所は空けて、そこに大きめの店を建てる
  row(-1, GATE_Z + 8, CROSS_Z - ST_W - 1, [[-62, -52], [-38, -30], [-14, -2], [-49, -41], [-28, -16]]);
  // 東の並び：市（広場）・馬屋・組の長屋・家臣の詰所の所は空ける
  //   門寄りの茶屋（-64〜-57）も空ける（中へ入れる店。town_shops.js）
  row(1, GATE_Z + 8, CROSS_Z - ST_W - 1, [[-50, -24], [-14, 1], [6, 22], [-23, -15], [-65, -56]]);
  // 裏の並び：通りの裏の路地（x = ±22）を挟んで、背中合わせにもう二列。町の奥行きを出す
  const back = (x, rot, z0, z1, skip) => {
    let z = z0;
    while (z < z1) {
      const w = (k * 5) % 3 === 0 ? 6.5 : 5;
      if (!(skip && skip.some(([a, b]) => z + w > a && z < b))) list.push({ x, z: z + w / 2, rot, w, noren: NOREN[k % NOREN.length], shade: 0.8 + ((k * 29) % 23) / 100 });
      z += w + 0.4; k++;
    }
  };
  // 知行への路地（LANE_Z）の所は空ける
  //   西：表の並びの裏に、人の歩ける裏路地（x -13〜-20）を空け、その向こうに路地を向いた一列
  back(-24.5, Math.PI / 2, GATE_Z + 6, CROSS_Z - ST_W - 1, [[LANE_Z - 4, LANE_Z + 4]]);
  //   東：市の南は裏路地（鍛冶場がある）。その向こうに路地を向いた一列
  back(26.4, -Math.PI / 2, GATE_Z + 6, CROSS_Z - ST_W - 1, [[-56, -18]]);
  // 市の奥を閉じる並び（広場の方を向く）。真ん中は寺へ抜ける路地
  back(33.5, -Math.PI / 2, -56, -18, [[-41.5, -34.5]]);
  // 城の前の横の通り沿い（北の側）は武家屋敷。南の側の裏にも町家を少し
  for (const [x, z, r] of [[-54, CROSS_Z - ST_W - 4.3, 0], [-46, CROSS_Z - ST_W - 4.3, 0], [30, CROSS_Z - ST_W - 4.3, 0], [38, CROSS_Z - ST_W - 4.3, 0], [46, CROSS_Z - ST_W - 4.3, 0]]) list.push({ x, z, rot: r, w: 6.5, noren: NOREN[(k++) % 6], shade: 0.9 });
  // 施設の店（大きめの町家）
  const shop = (id, x, z, w, text) => {
    const it = { x, z, rot: Math.PI / 2, w, noren: id === 'inn' ? 0x6a2a20 : id === 'shop' ? 0x2a3040 : 0x2b3f5c, shade: 1 };
    list.push(it);
    const fx = x + D / 2;
    sign(rt, text, fx - 0.55, 3.5, z, Math.PI / 2, 0.62);
    sign(rt, text, fx + 1.0, 1.0, z + w / 2 - 0.5, Math.PI / 2, 0.36, true);
    return { x: fx + 1.4, z };
  };
  const doors = {};
  doors.inn = shop('inn', -(ST_W + D / 2 + 0.3), -57, 8, '宿');
  // 具足屋は中へ入れる店（town_shops.js）
  doors.toiya = shop('toiya', -(ST_W + D / 2 + 0.3), -8, 10, '問屋');
  doors.shisha = shop('shisha', -(ST_W + D / 2 + 0.3), -45, 6, '使者');
  // 宿の提灯・問屋の俵と荷車
  for (const dz of [-2.2, 2.2]) chochin(rt, -(ST_W - 0.4), 2.6, -57 + dz, dusk);
  rt.scene.add(tawara(W, -4.2, -12.5, Math.PI / 2, 6), tawara(W, -4.3, -3.5, Math.PI / 2, 3));
  cart(rt, 3.2, -16, 0.15);
  // 武具屋の前：槍の立て掛け（棒を並べる）
  {
    const g = mergeAll([box(0.1, 0.1, 2.4, 0, 1.4, 0, 0x3a2c20), ...[0, 1, 2, 3, 4].map((i) => cyl(0.02, 0.025, 3.2, 0, 1.55, -1 + i * 0.5, 0x4a3a28, 5, { rx: 0 }))]);
    const m = new THREE.Mesh(g, mats().straw); m.position.set(-3.6, 0, -37.8); m.rotation.z = -0.12; m.castShadow = true; rt.scene.add(m);
  }
  // 我が館（知行・内政）：西の路地の奥。身分が上がるほど館→砦→城と育ち、内政の結果が村の見た目に出る
  buildMy(rt, def, list, doors, dusk);
  // 家臣の事は館の門（知行の札）から開く。別棟の詰所は作らず、重なりをまとめた
  // 出世で町が育つ：空き地・表の提灯・提灯の綱・幟・土蔵（town_life.js）
  townGrow(rt, { list, lv: MYLV, chochin, ST_W, D, nobori });
  placeMachiya(rt, list);
  // 町家の戸口（人が家へ帰る・雨宿りする所）：表を向いた家の前。h は通りの方を向く向き
  // 裏の並びの家（火事が起きる所）：fx・fz は路地の側の前
  F.backPts = list.filter((it) => Math.abs(it.x) > 20 && Math.abs(Math.abs(it.rot) - Math.PI / 2) < 0.01).map((it) => { const s = it.rot > 0 ? 1 : -1; return { x: it.x, z: it.z, fx: it.x + s * (D / 2 + 1.6), fz: it.z }; });
  F.doorPts = list.filter((it) => Math.abs(Math.abs(it.rot) - Math.PI / 2) < 0.01).map((it) => { const s = it.rot > 0 ? 1 : -1; return { x: it.x + s * (D / 2 + 0.55), z: it.z + it.w * 0.2, h: it.rot }; });
  // 町はずれの百姓家（茅葺き）：遠くまで家が続いて見えるように（携帯「低」は遠い分を減らし軽くする）
  const farHuts = [[47, -70, -0.4], [52, -8, 0.2], [48, 16, -0.3], [56, 40, 0.6], [-58, 50, 0.2]];
  (SETTINGS.quality === 'low' ? farHuts.slice(0, 3) : farHuts).forEach(([x, z, r]) => rt.scene.add(hut(W, x, z, 7, 5, r)));

  // 市：通りの東の広場に露店と人だかり（携帯「低」は台を減らす）
  const stallList = [
    { x: 12, z: -46, rot: -Math.PI / 2 + 0.1, cloth: 0xd8cfb8 }, { x: 12, z: -40, rot: -Math.PI / 2, cloth: 0x4a5a70 }, { x: 12, z: -34, rot: -Math.PI / 2 - 0.08, cloth: 0xc8b890 },
    { x: 24, z: -46, rot: Math.PI / 2, cloth: 0x8a4a30 }, { x: 24, z: -40, rot: Math.PI / 2 + 0.1, cloth: 0xd0c8b0 }, { x: 24, z: -32, rot: Math.PI / 2, cloth: 0x5a6a50 },
    { x: 18, z: -27, rot: Math.PI, cloth: 0xb89a70 },
  ];
  stalls(rt, SETTINGS.quality === 'low' ? stallList.slice(0, 5) : stallList);
  sign(rt, '楽市', 6.2, 2.2, -50, -Math.PI / 2, 0.5, true);
  { const m = nobori(W, 7, -51.5, 'oda', 4.2); rt.scene.add(m); }
  well(rt, 18, -20);

  // 馬屋：板屋根の小屋と、馬を繋ぐ杭。馬が二頭
  rt.scene.add(hut(W, 16, -6.5, 10, 5, -Math.PI / 2, { ita: true, h: 2.4 }));
  rt.scene.add(umatsunagi(W, 9.5, -6.5, Math.PI / 2, 9));
  for (const [i, z] of [[0, -9.5], [1, -3.8]]) {
    const h = buildHorse(horseStyleFor(i + 3, 0, 'oda'));
    h.position.set(10.6, W.heightAt(10.6, z), z); h.rotation.y = -Math.PI / 2 + (i ? 0.2 : -0.15);
    rt.scene.add(h);
    (F.stableHorses = F.stableHorses || []).push(h);   // 借りて乗れる（town_life.js）
  }
  sign(rt, '馬屋', 8.0, 1.0, -1.2, -Math.PI / 2, 0.36, true);
  doors.stable = { x: 7.5, z: -1.5 };

  // 組の長屋：長い板屋根の長屋。前に組の者
  rt.scene.add(hut(W, 11.5, 14, 15, 5.5, -Math.PI / 2, { ita: true, h: 2.5 }));
  sign(rt, '組', 7.4, 1.0, 20.5, -Math.PI / 2, 0.36, true);
  doors.squad = { x: 7, z: 14 };
  { const f = kagaribi(W, 6.2, 9); rt.scene.add(f); if (dusk) W.addFire(6.2, 9, { torch: true }); else F.torches.push({ x: 6.2, z: 9 }); }

  // 上官屋敷：土塀で囲い、冠木門。中に板屋根の屋敷
  {
    const x0 = -48, x1 = -12, z0 = CROSS_Z + ST_W + 1.5, z1 = 68, gx = -30;
    const segs = [[x0, z0, gx - 2.4, z0], [gx + 2.4, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    for (const s of segs) { addKB(dobei(W, s, { h: 2.1, samaStep: 99, batch: kb })); solidSeg(...s, 0.3); }
    rt.scene.add(kabukimon(W, gx, z0, 4.8, 0));
    rt.scene.add(hut(W, gx, 54, 16, 9, Math.PI, { ita: true, h: 3.2, wall: 0x6e5a42 }));
    sign(rt, '上官屋敷', gx + 3.6, 1.2, z0 - 0.5, Math.PI, 0.34, true);
    rt.scene.add(nobori(W, gx - 3.6, z0 - 1, 'oda', 4.2));
    doors.boss = { x: gx, z: z0 - 1.5 };
  }
  // 訓練場：低い柵で囲った広場に巻藁
  {
    const x0 = 12, x1 = 48, z0 = CROSS_Z + ST_W + 1.5, z1 = 64, gx = 28;
    for (const s of [[x0, z0, gx - 3, z0], [gx + 3, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) { rt.scene.add(koshisaku(W, s)); solidSeg(...s, 0.2); }
    makiwara(rt, [[20, 46], [24, 46], [28, 46], [32, 46], [36, 46], [22, 54], [30, 54], [38, 54]]);
    rt.scene.add(nobori(W, 14, 62, 'oda', 4.5), nobori(W, 46, 62, 'oda', 4.5));
    sign(rt, '訓練場', gx + 4.2, 1.2, z0 - 0.4, Math.PI, 0.34, true);
    doors.train = { x: gx, z: z0 - 1.5 };
  }
  // 武家屋敷（城へ向かう通りの両側の土塀）
  for (const [a, b] of [[[-10, 36], [-10, 68]], [[10, 36], [10, 68]]]) { addKB(dobei(W, [...a, ...b], { h: 2.0, samaStep: 99, batch: kb })); solidSeg(...a, ...b, 0.3); }
  // 城：石垣・櫓門・隅櫓・天守（古い型）
  {
    addKB(ishigaki(W, [[-60, CASTLE_Z + 0.4], [-4.5, CASTLE_Z + 0.4]], { top: 0.3, batch: kb }));
    addKB(ishigaki(W, [[4.5, CASTLE_Z + 0.4], [60, CASTLE_Z + 0.4]], { top: 0.3, batch: kb }));
    solidSeg(-60, CASTLE_Z, -4.5, CASTLE_Z, 0.6); solidSeg(4.5, CASTLE_Z, 60, CASTLE_Z, 0.6);
    addKB(yaguramon(W, 0, CASTLE_Z + 1.5, 5, 0, { batch: kb }));
    for (const s of [[-55, CASTLE_Z + 3, -6, CASTLE_Z + 3], [6, CASTLE_Z + 3, 55, CASTLE_Z + 3]]) addKB(dobei(W, s, { h: 2.2, batch: kb }));
    // 隅櫓は携帯「低」では片方だけ（遠景の飾りなので、重さを優先）
    addKB(sumiyagura(W, -40, CASTLE_Z + 9, { w: 7, d: 6, batch: kb }));
    if (SETTINGS.quality !== 'low') addKB(sumiyagura(W, 40, CASTLE_Z + 9, { w: 7, d: 6, batch: kb }));
    addKB(tenshu(W, 0, CASTLE_Z + 30, { floors: 3, b: 12, old: true, batch: kb }));
    // 門の内には入れない（城の中は作らない）
    solidSeg(-3, CASTLE_Z + 4, 3, CASTLE_Z + 4, 0.5);
    rt.scene.add(nobori(W, -4, CASTLE_Z - 3, 'oda', 5), nobori(W, 4, CASTLE_Z - 3, 'oda', 5));
  }
  finalizeKitBatch(rt, kb);
  // 町の門（南）：木戸。出陣はここから
  rt.scene.add(kabukimon(W, 0, GATE_Z, 6.4, 0));
  for (const s of [[-40, GATE_Z, -3.6, GATE_Z], [3.6, GATE_Z, 40, GATE_Z]]) { rt.scene.add(koshisaku(W, s)); solidSeg(...s, 0.2); }
  { const f = kagaribi(W, -4.5, GATE_Z + 2); rt.scene.add(f); const f2 = kagaribi(W, 4.5, GATE_Z + 2); rt.scene.add(f2); if (dusk) { W.addFire(-4.5, GATE_Z + 2, { torch: true }); W.addFire(4.5, GATE_Z + 2, { torch: true }); } else F.torches.push({ x: -4.5, z: GATE_Z + 2 }, { x: 4.5, z: GATE_Z + 2 }); }
  sign(rt, String(def.place || '清洲').split(/\s/)[0], 3.2, 3.6, GATE_Z - 0.1, 0, 0.4, true);
  doors.gate = { x: 0, z: GATE_Z + 1.5 };
  // 辻の水桶・天水桶（火の用心）
  for (const [x, z] of [[-4, -22], [4, 4], [-4, 26], [4, -60]]) { const m = new THREE.Mesh(mergeAll([cyl(0.35, 0.32, 0.7, 0, 0.35, 0, 0x5a4028, 10), cyl(0.36, 0.36, 0.05, 0, 0.55, 0, 0x2a2018, 10), cyl(0.36, 0.36, 0.05, 0, 0.15, 0, 0x2a2018, 10)]), mats().straw); m.position.set(x, W.heightAt(x, z), z); m.castShadow = true; rt.scene.add(m); solidRect(x, z, 0.7, 0.7); }
  rt.flags.doors = doors;
  // 寺・鍛冶場・高札場・水堀・干し物や樽・遠い町並み（town_life.js）
  buildLife(rt, { sign, chochin, dusk, doors });
  // 中へ入れる店：具足屋・茶屋・鍛冶屋（town_shops.js）
  buildShops(rt, { sign, chochin, doors });
  finishSigns(rt);
  F.merged = mergeStatic(rt, from);
}

// ======================================================================
// 我が館と知行の村（kaito 10/1「自分の城と城下町を本格的に作り込む」）
// 町の西の路地（LANE_Z）を入ると、自分の館と村がある。身分で館が育つ：
//   足軽＝足軽長屋（組の者と住む長い板屋根と畑）→ 組頭候補＝屋敷（垣根）→ 組頭＝館（土塁と柵・冠木門・蔵）
//   → 大将候補＝砦（空堀・物見櫓・兵の長屋）→ 大将＝城（水堀・石垣・土塀・櫓門・隅櫓・御殿）
// 内政の結果も見た目に出す：田（開いた枚数）・町（家と市の数）・兵（庭で稽古する足軽）・
// 鉄砲鍛冶（煙の立つ鍛冶場）・兵糧（蔵の前の俵）・家臣（庭に詰める）。
// 城の形は高遠城と同じ共通の部品（props.js・castle_parts.js）を使い回す。新しい形は田だけ。
// ======================================================================
const LANE_Z = -22;          // 通りから西へ入る路地
const MY_LANE_X = -33;       // 村の南北の道
const MC = { x: -51.5, z: 2, hx: 10, hz: 12 };   // 館の内（曲輪）の中心と半分の幅
const MOAT_D = 3.6;          // 曲輪の縁から堀の中ほどまで
let MYLV = 0;
const MY_NAME = ['足軽長屋', '屋敷', '館', '砦', '城'];
function myLevel(G) { return Math.max(0, Math.min(4, (G && G.rank) || 0)); }
// 曲輪の縁からの距離（外が正）。東の門の口は堀を掘り残す（土橋）
function myD(x, z) { return Math.max(Math.abs(x - MC.x) - MC.hx, Math.abs(z - MC.z) - MC.hz); }
const myGate = (x, z) => x > MC.x && Math.abs(z - MC.z) < 2.8;
function myH(x, z) {
  if (MYLV < 3 || x > -30 || x < -72 || z < -22 || z > 24) return 0;
  const d = myD(x, z), gate = myGate(x, z);
  let h = 0;
  if (MYLV >= 4) {
    h = 2.2 * sm(0.45, 0.3, d);                        // 城の台（石垣の内）
    if (gate && d > 0) h = Math.max(h, 2.2 * sm(7, 0.4, d));   // 土橋から門へ上る坂
  }
  if (!gate) {
    const hw = MYLV >= 4 ? 2.8 : 2.1, dep = MYLV >= 4 ? 2.4 : 1.5;
    const u = Math.abs(d - MOAT_D) / hw;
    if (u < 1) h -= dep * (1 - u * u);
  }
  return h;
}
// 田の絵（苗の筋）：一度だけ作る
let PADDY = null;
function paddyAssets() {
  if (PADDY) return PADDY;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc(4 + i * 8, 4 + j * 8, 2.2, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 8); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(6.4, 7.4); geo.rotateX(-Math.PI / 2);
  const ridge = mergeAll([box(7, 0.25, 0.45, 0, 0.1, -3.85, 0x6a5a3c), box(7, 0.25, 0.45, 0, 0.1, 3.85, 0x6a5a3c), box(0.45, 0.25, 7.3, -3.35, 0.1, 0, 0x6a5a3c), box(0.45, 0.25, 7.3, 3.35, 0.1, 0, 0x6a5a3c)]);
  PADDY = { geo, ridge, mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0 }) };
  return PADDY;
}
// 田の置き場（村の道の西）。始めの二枚は村の元からの田、残りは開けば田になる荒れ野
const PADDY_AT = [];
for (const z of [-31, -40, -49, -58, -67]) for (const x of [-49, -57]) PADDY_AT.push([x, z]);

function buildMy(rt, def, list, doors, dusk) {
  const W = rt.world, G = rt.G, F = rt.flags, lv = MYLV;
  const dom = domOf(G);
  const my = F.my = { lv, name: MY_NAME[lv], kura: [], yard: null };
  const x0 = MC.x - MC.hx, x1 = MC.x + MC.hx, z0 = MC.z - MC.hz, z1 = MC.z + MC.hz;
  const gz = MC.z;
  // ---- 路地の入口（通りの西）：道しるべ ----
  sign(rt, `${my.name}へ`, -(ST_W + 0.6), 1.2, LANE_Z - 3.2, Math.PI / 2, 0.36, true);
  if (lv >= 2) rt.scene.add(kabukimon(W, MY_LANE_X + 2.2, LANE_Z, 4.6, Math.PI / 2));
  // ---- 館の囲い ----
  const batch = makeSimpleBatch(), kb = makeKitBatch();   // 柵・土塁と、石垣・土塀・隅櫓を、材質ごとにまとめて描く
  const add = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  // 東の門の口を空けた、曲輪の周り（門の北から時計回りに、門の南まで）
  const ring = (dd) => [[x1 + dd, gz + 2.8], [x1 + dd, z1 + dd], [x0 - dd, z1 + dd], [x0 - dd, z0 - dd], [x1 + dd, z0 - dd], [x1 + dd, gz - 2.8]];
  const segsOf = (P) => P.slice(0, -1).map((p, i) => [p[0], p[1], P[i + 1][0], P[i + 1][1]]);
  if (lv <= 1) {
    // 我が家・屋敷：低い垣根で庭を囲う
    const yx0 = MC.x - 7, yx1 = MC.x + 6, yz0 = gz - 6, yz1 = gz + 7;
    for (const s of [[yx1, gz + 1.8, yx1, yz1], [yx1, yz1, yx0, yz1], [yx0, yz1, yx0, yz0], [yx0, yz0, yx1, yz0], [yx1, yz0, yx1, gz - 1.8]]) { rt.scene.add(koshisaku(W, s)); solidSeg(...s, 0.2); }
    const bw = lv ? 9 : 6, bd = lv ? 6 : 4.5;
    if (lv === 0) {
      // 足軽長屋：長い一棟を幾つにも仕切り、戸口が並ぶ。前に物干しと薪
      nagaya(rt, MC.x - 2.5, gz + 1, 10, 4.2, Math.PI / 2);
      solidRect(MC.x - 2.5, gz + 1, 4.6, 10.4);
    } else rt.scene.add(hut(W, MC.x - 2.5, gz + 1, bw, bd, Math.PI / 2, { ita: true, h: 2.7, wall: 0x6e5a42 }));
    if (dom.hatake || lv === 0) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshStandardMaterial({ color: dom.hatake ? 0x55683a : 0x6a5a40, roughness: 1 }));
      g.rotation.x = -Math.PI / 2; g.position.set(MC.x + 3, W.heightAt(MC.x + 3, gz + 4.5) + 0.03, gz + 4.5); g.receiveShadow = true; rt.scene.add(g);
    }
    my.gate = { x: MC.x + 7.6, z: gz };
    my.yard = { x: MC.x + 3, z: gz - 2.5 };
  } else {
    if (lv === 2 || lv === 3) {
      // 館・砦：土塁に柵（高遠の三の丸と同じ土の囲い）
      for (const s of segsOf(ring(0))) {
        const len = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1;
        add(dorui(W, s, (s[3] - s[1]) / len, -(s[2] - s[0]) / len, { w: 2.6, h: lv >= 3 ? 1.0 : 0.7, batch }));
        add(palisade(W, s, { batch, h: lv >= 3 ? 2.6 : 2.2 }));
        solidSeg(...s, 0.4);
      }
      if (lv === 2) rt.scene.add(kabukimon(W, x1, gz, 5.2, Math.PI / 2));
      else rt.scene.add(yaguramon(W, x1, gz, 5, Math.PI / 2, { earth: true }));
      // 物見櫓（砦から二つ）
      if (lv >= 3) rt.scene.add(yagura(W, x1 - 2.5, z1 - 2.5), yagura(W, x0 + 2.5, z0 + 2.5));
    } else {
      // 城：水堀・石垣・土塀・櫓門・隅櫓（高遠と同じ部品）
      mizubori(rt, ring(MOAT_D), { width: 6.4, depth: 2.4, y: -0.95 + riseAt(MC.z) });
      for (const s of segsOf(ring(MOAT_D + 2.3))) solidSeg(...s, 0.3);   // 堀の外の縁で止める
      add(ishigaki(W, ring(0.55), { out: -1, top: 2.45, kind: 'nozura', batch: kb }));
      for (const s of segsOf(ring(-0.4))) { add(dobei(W, s, { h: 2.1, batch: kb })); solidSeg(...s, 0.35); }
      rt.scene.add(yaguramon(W, x1 + 0.2, gz, 5, Math.PI / 2));
      add(sumiyagura(W, x1 - 2.2, z1 - 2.2, { w: 6, d: 5, rot: Math.PI / 2, batch: kb }));
      // 隅櫓は二つ目、天守は携帯「低」では省く（見映えより重さを優先。形はどちらも使い回しの部品）
      if (SETTINGS.quality !== 'low') add(sumiyagura(W, x0 + 2.2, z0 + 2.2, { w: 6, d: 5, rot: Math.PI / 2, batch: kb }));
      // 三百石を超えれば、隅に小さな天守
      if ((dom.koku || 0) >= 300 && SETTINGS.quality !== 'low') add(tenshu(W, x0 + 4.6, z1 - 4.4, { floors: 2, b: 6.5, base: 1.2, old: true }));
    }
    finalizeSimpleBatch(rt, batch); finalizeKitBatch(rt, kb);
    // 主殿：館・砦は板屋根の屋敷、城は御殿
    if (lv >= 4) goten(rt, MC.x - 5, gz + 1, { w: 10, d: 7, rot: Math.PI / 2, tile: false });
    else rt.scene.add(hut(W, MC.x - 5, gz + 1, lv >= 3 ? 11 : 10, 7, Math.PI / 2, { ita: true, h: 3.0, wall: 0x6e5a42 }));
    // 蔵：砦からは二つ。兵糧を蓄えれば、前に俵が積まれる
    const kuraN = 1 + (lv >= 3 ? 1 : 0);
    for (let i = 0; i < kuraN; i++) {
      const kx = MC.x - 6.5 + i * 5.2, kz = z0 + 3.2;
      rt.scene.add(hut(W, kx, kz, 4.4, 3.6, 0, { ita: true, h: 2.7, wall: 0xd8d0bc }));
      my.kura.push({ x: kx, z: kz + 2.8 });
    }
    if (dom.hyourou || (dom.koku || 0) >= 60) rt.scene.add(tawara(W, MC.x - 6.5, z0 + 5.8, 0, dom.hyourou ? 6 : 3));
    // 兵の長屋（砦から）
    if (lv >= 3) nagaya(rt, x1 - 5.5, z0 + 3.4, 7, 4, 0, { tile: lv >= 4 });
    // 幟：格が上がるほど多い
    const nb = lv === 2 ? [[x1 + 1.5, gz - 4], [x1 + 1.5, gz + 4]] : [[x1 + 1.5, gz - 4.5], [x1 + 1.5, gz + 4.5], [x1 - 1, z1 - 1], [x1 - 1, z0 + 1], ...(lv >= 4 ? [[x0 + 1, z1 - 1], [x0 + 1, z0 + 1]] : [])];
    for (const [nx, nz] of nb) rt.scene.add(nobori(W, lv >= 4 && nx > x1 ? nx + 5.5 : nx, nz, 'oda', 4.6));
    { const fx = (lv >= 4 ? x1 + 7.5 : x1 + 2.2); for (const s2 of [-1, 1]) { rt.scene.add(kagaribi(W, fx, gz + s2 * 3.4)); if (dusk) W.addFire(fx, gz + s2 * 3.4, { torch: true }); } }
    my.gate = { x: x1 + (lv >= 4 ? 8 : lv >= 3 ? 7 : 2.6), z: gz };
    my.yard = { x: x1 - 5, z: gz + 1 };
  }
  sign(rt, `${G.name || ''}　${my.name}`.trim(), my.gate.x + 0.8, 1.2, gz - 3.6, Math.PI / 2, 0.36, true);
  doors.yashiki = my.gate;

  // ---- 市（町を開いた数だけ露店が並ぶ）と鎮守の社 ----
  const machi = Math.min(5, dom.machi || 0);
  const st = [];
  const SX = [-38.5, -43.5, -48.5];
  for (let i = 0; i < Math.min(6, machi === 0 ? 0 : 1 + machi); i++) {
    const n = i >> 1, sd = i % 2 ? 1 : -1;
    st.push({ x: SX[n], z: LANE_Z + sd * 3.6, rot: sd < 0 ? 0 : Math.PI, cloth: [0xd8cfb8, 0x4a5a70, 0x8a4a30, 0xc8b890, 0x5a6a50, 0xb89a70][i] });
  }
  if (st.length) { stalls(rt, st); sign(rt, '市', MY_LANE_X - 2.3, 2.1, LANE_Z + 5.4, Math.PI / 2, 0.42, true); }
  my.stalls = st;
  // 鎮守の社（寺社の堂を小さく使い回す）と鳥居
  rt.scene.add(doja(W, -58.5, LANE_Z, Math.PI / 2));
  {
    const tx = -53.2, y = W.heightAt(tx, LANE_Z);
    const g = mergeAll([cyl(0.16, 0.18, 3.2, 0, 1.6, -1.4, 0x9a3a24, 8), cyl(0.16, 0.18, 3.2, 0, 1.6, 1.4, 0x9a3a24, 8), box(0.3, 0.22, 4.0, 0, 3.25, 0, 0x2a2420), box(0.22, 0.18, 3.4, 0, 2.7, 0, 0x9a3a24)]);
    const m = new THREE.Mesh(g, mats().straw); m.position.set(tx, y, LANE_Z); m.castShadow = true; rt.scene.add(m);
    solidRect(tx, LANE_Z - 1.4, 0.4, 0.4); solidRect(tx, LANE_Z + 1.4, 0.4, 0.4);
  }
  my.yashiro = { x: -54.5, z: LANE_Z };
  // ---- 村の家並み（町を開くほど増える）。始めの一軒は、鉄砲鍛冶を呼べば鍛冶場 ----
  const nH = Math.min(8, 2 + Math.floor(machi * 1.4));
  let z = LANE_Z - 6.5;
  const NOR = [0x2b3f5c, 0x7a3b22, 0x4f4030, 0x5a2a24, 0x3a4a3a];
  for (let i = 0; i < nH && z > GATE_Z + 6; i++) {
    const w = i % 3 === 1 ? 6.5 : 5;
    list.push({ x: MY_LANE_X - 2.3 - D / 2, z: z - w / 2, rot: Math.PI / 2, w, noren: NOR[i % NOR.length], shade: 0.82 + (i % 4) * 0.05 });
    if (i === 0) my.kaji = { x: MY_LANE_X - 1.5, z: z - w / 2 };
    z -= w + 0.3;
  }
  if (dom.gunsmith && my.kaji) {
    sign(rt, '鍛冶', MY_LANE_X - 2.0, 3.4, my.kaji.z, Math.PI / 2, 0.5);
    W.addSmokeColumn(MY_LANE_X - 6, W.heightAt(MY_LANE_X - 6, my.kaji.z) + 5.4, my.kaji.z, { size: 0.7 });
  } else my.kaji = null;
  if (machi >= 2) W.addSmokeColumn(MY_LANE_X - 6, W.heightAt(MY_LANE_X - 6, LANE_Z - 24) + 5.2, LANE_Z - 24, { size: 0.5 });
  // ---- 田：元からの二枚＋開いた枚数。残りは荒れ野。季節で色が変わる ----
  {
    const P = paddyAssets();
    const nTa = Math.min(PADDY_AT.length, 2 + Math.min(5, dom.ta || 0) + (lv >= 3 ? 1 : 0));
    const sea = def.season;
    const col = sea === '秋' ? 0xd8b860 : sea === '冬' ? 0x8a7c62 : sea === '春' ? 0x9ab0b0 : 0x7aa050;
    const im = new THREE.InstancedMesh(P.geo, P.mat, PADDY_AT.length);
    const rim = new THREE.InstancedMesh(P.ridge, mats().straw, PADDY_AT.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    PADDY_AT.forEach(([px, pz], i) => {
      const y = W.heightAt(px, pz);
      m4.makeTranslation(px, y + 0.04, pz); im.setMatrixAt(i, m4); rim.setMatrixAt(i, m4);
      im.setColorAt(i, i < nTa ? c.set(col) : c.set(0x6e6446));
    });
    im.receiveShadow = true; rim.castShadow = true; rim.receiveShadow = true;
    rt.scene.add(im, rim);
    my.ta = nTa;
  }
}

// ---- 我が村の人：田の百姓・市の売り手・鍛冶・社の神主・庭の兵と家臣 ----
function myPeople(rt) {
  const F = rt.flags, my = F.my, dom = domOf(rt.G);
  if (!my) return;
  const one = (name, x, z, h, type = 'porter', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing: h, order: 'hold', noRout: true, width: 1, speed: 0.9, march: false, aggro: 0, seekRange: 0 },
      [{ type, n: 1, o: { flag: null, invuln: true, ...o } }]);
    return g.units[0] ? { g, u: g.units[0] } : null;
  };
  // 百姓：田のあいだを歩き、立ち止まって働く（田が多いほど人も多い）
  const route = PADDY_AT.slice(0, my.ta).map(([x, z]) => [x + 3.7, z]);
  const nF = Math.min(3, 1 + Math.floor(my.ta / 3));
  for (let i = 0; i < nF; i++) {
    const [x, z] = route[(i * 2) % route.length];
    const r = one('百姓', x, z, 0);
    if (!r) continue;
    dress(rt, r.u, 'townsman', 30 + i);
    r.u.name = '百姓';
    const P = { g: r.g, u: r.u, kind: 'townsman', i: 30 + i, pts: route, wp: (i * 2) % route.length, waitT: 3 + i * 2, talkT: 0, said: 0, farmer: true };
    F.folk.push(P);
    rt.addInteract('farmer' + i, () => (r.u.alive ? { x: r.u.pos.x, z: r.u.pos.z } : null), '話す　百姓', () => {
      P.talkT = 5; r.u.heading = Math.atan2(rt.player.u.pos.x - r.u.pos.x, rt.player.u.pos.z - r.u.pos.z);
      const L = dom.ta ? [`殿が田を開いてくださったで、今年は${my.ta}枚も植えられた`, '年貢はちゃんと納めますで、戦の時はお守りくだされ'] : ['田がもう少しあれば、年貢も増やせるんじゃが……', '北の荒れ野を拓けば、良い田になりますぞ'];
      rt.say('百姓', L[(P.said++) % L.length], 4);
    }, { r: 2.4 });
  }
  // 市の売り手（露店の半分に）
  my.stalls.filter((_, i) => i % 2 === 0).slice(0, 2).forEach((s, i) => {
    const h = s.rot + Math.PI;
    const r = one('売り手', s.x, s.z - Math.cos(s.rot) * 1.1, h);
    if (!r) return;
    dress(rt, r.u, 'merchant', 40 + i);
    r.u.name = '売り手';
    const P = { g: r.g, u: r.u, kind: 'merchant', i: 40 + i, fixed: true, talkT: 0, said: 0 };
    F.folk.push(P);
    rt.addInteract('myshop' + i, () => ({ x: r.u.pos.x, z: r.u.pos.z }), '話す　村の売り手', () => rt.say('売り手', dom.machi >= 3 ? '殿の町になってから、遠くの商人も来るようになりました' : '市が開けて、村の者も銭を持つようになりました', 4), { r: 2.6 });
  });
  // 鍛冶（鉄砲鍛冶を呼んでいれば、戸口で鉄を打つ）
  if (my.kaji) {
    const r = one('鍛冶', my.kaji.x - 0.6, my.kaji.z, Math.PI / 2);
    if (r) { dress(rt, r.u, 'townsman', 50); r.u.name = '鍛冶'; F.folk.push({ g: r.g, u: r.u, kind: 'townsman', i: 50, fixed: true, talkT: 0, said: 0 }); }
  }
  // 庭の兵：兵を集めた分だけ（多くて四人）。城と砦では二人が門を守る
  const nH = my.lv >= 2 ? Math.min(4, Math.ceil((dom.hei || 0) / 3)) : 0;
  for (let i = 0; i < nH; i++) {
    const guard = my.lv >= 3 && i < 2;
    const x = guard ? my.gate.x - 1.2 : my.yard.x + 1.5 - (i % 2) * 2.2, z = guard ? MC.z + (i ? 3.2 : -3.2) : my.yard.z - 3 + Math.floor(i / 2) * 2.4;
    const r = one('我が兵', x, z, guard ? Math.PI / 2 : -Math.PI / 2, 'ashigaru', guard ? { hat: 'jingasa' } : { hat: 'jingasa', weapon: 'none' });
    if (!r) continue;
    rt.addInteract('myhei' + i, () => ({ x: r.u.pos.x, z: r.u.pos.z }), '話す　我が兵', () => rt.say('兵', guard ? `${my.name}の門、しかとお守りいたす` : dom.ren ? '鍛えた槍、次の戦でお見せしまする' : '殿、いつでも出られまする', 3.5), { r: 2.2 });
  }
  // 家臣：召し抱えが出来る屋敷からは、館の庭に詰める（詰所を廃したのでここに一本化）
  if (my.lv >= 1) {
    keraiOf(rt.G).filter((k) => k.alive).slice(0, 3).forEach((k, i) => {
      const r = one('家臣', my.yard.x - 2.5, my.yard.z + 1.5 + i * 1.8, Math.PI / 2, 'samurai', { name: k.name, weapon: 'none' });
      if (!r) return;
      rt.addInteract('mykerai' + i, () => ({ x: r.u.pos.x, z: r.u.pos.z }), `話す　${k.name}`, () => {
        r.u.heading = Math.atan2(rt.player.u.pos.x - r.u.pos.x, rt.player.u.pos.z - r.u.pos.z);
        rt.say(k.name, k.loy >= 70 ? `この${my.name}、留守はお任せくだされ` : k.loy < 40 ? '……近頃、俸禄が心もとのう存じまする' : 'お呼びとあらば、すぐに参上いたす', 4);
      }, { r: 2.2 });
    });
  }
}

// ---- 我が村で見る・調べる所 ----
function myGuide(rt) {
  const my = rt.flags.my, G = rt.G, dom = domOf(G), game = rt.game;
  if (!my) return;
  const yen = (n) => `${Math.floor(n || 0)}貫`;
  rt.addInteract('door-yashiki', { x: my.gate.x, z: my.gate.z }, `入る　${my.name}（内政・家臣・外交）`, () => game.townOpen('realm'), { r: 3.2 });
  // 主殿の戸口：家臣の事（召し抱え・褒美）。蔵は内政、使者の間は外交（知行の札のその欄を開く）
  if (my.lv >= 1) rt.addInteract('my-shuden', { x: MC.x + (my.lv >= 2 ? -0.6 : 1.3), z: MC.z + 1 }, '入る　主殿（家臣）', () => game.townOpen('realm', { focus: 1 }), { r: 2.2 });
  for (const [i, k] of my.kura.entries()) {
    rt.addInteract('mykura' + i, k, '入る　蔵（内政）', () => { rt.say('蔵', `銭 ${yen(G.kan)}。知行 ${dom.koku || 0}石${dom.mura ? `（${dom.mura}）` : ''}。${dom.hyourou ? '兵糧を蓄えてある' : '兵糧の蓄えは無い'}`, 3); game.townOpen('realm', { focus: 0 }); }, { r: 2.4 });
  }
  rt.addInteract('myta', { x: MY_LANE_X - 2, z: -36 }, '見る　我が田', () => rt.say('', dom.koku ? `田は${my.ta}枚。屋敷で「田を開く」と荒れ野が田になり、年貢が増える` : `田は村の元の${my.ta}枚。組頭になれば知行を賜り、田を開ける`, 4.5), { r: 3 });
  rt.addInteract('myyashiro', my.yashiro, '参る　鎮守の社', () => {
    if (!rt.flags.prayed) { rt.flags.prayed = true; if (rt.player.breath != null) rt.player.breath = rt.player.maxBreath || 100; rt.say('', '手を合わせた。心が静まり、息が整った', 3.5); }
    else rt.say('', '村の鎮守。戦の無事を祈る', 3);
  }, { r: 2.8 });
}

// ---- 札から「町を歩いて行く」：道しるべを出す ----
const GO_NAME = { realm: '我が館', boss: '上官屋敷', squad: '組の長屋', shop: '武具屋', toiya: '問屋', train: '訓練場', inn: '宿', stable: '馬屋' };
function guideTo(rt, tab) {
  const D0 = rt.flags.doors || {};
  const d = tab === 'realm' ? D0.yashiki : D0[tab];
  if (!d) return;
  const n = tab === 'realm' && rt.flags.my ? rt.flags.my.name : GO_NAME[tab] || '';
  rt.flags.goTo = { x: d.x, z: d.z };
  if (tab === 'realm') rt.unmark('mk-my');
  rt.marker('mk-go', { x: d.x, z: d.z }, n);
  rt.obj('go', `${n}へ歩いて行く（画面の端の印の方へ）`, 'side');
  rt.bark(`${n}へ。印の方へ歩く`);
}
function goTick(rt) {
  const g = rt.flags.goTo;
  if (!g) return;
  const p = rt.player.u.pos;
  if (Math.hypot(p.x - g.x, p.z - g.z) < 4.5) { rt.flags.goTo = null; rt.unmark('mk-go'); rt.objRemove('go'); }
}

// ---- 戸口に「入る」、門に「出陣」 ----
function guide(rt, def) {
  const D0 = rt.flags.doors, game = rt.game;
  for (const [tab, f] of Object.entries(FAC)) {
    const d = D0[tab];
    if (!d || d.inner) continue;   // 中へ入れる店は、中の帳場で（town_shops.js）
    rt.addInteract('door-' + tab, { x: d.x, z: d.z }, `入る　${f.n}`, () => game.townOpen(tab), { r: 3 });
  }
  rt.addInteract('door-gate', { x: D0.gate.x, z: D0.gate.z }, '任務を受けて出陣する', () => game.townOpen('boss', { go: true }), { r: 3.5 });
  // どちらへ行けばよいか迷わないよう、上官屋敷・出陣の門を方角の帯（画面の端の向きの印）に出す
  if (D0.boss) rt.marker('mk-boss', { x: D0.boss.x, z: D0.boss.z }, '上官屋敷');
  rt.marker('mk-gate', { x: D0.gate.x, z: D0.gate.z }, '出陣の門');
  // 知行・内政・家臣・外交（段2）：屋敷・使者の間から、同じ「知行」の札を開く（家臣はここに一本化）
  myGuide(rt);
  if (D0.shisha) rt.addInteract('door-shisha', { x: D0.shisha.x, z: D0.shisha.z }, '入る　使者の間（外交）', () => game.townOpen('realm', { focus: 2 }), { r: 3 });
  // 携帯の一行に収まる短さに（長いと右上の札が三行になり、小地図に潜る）
  rt.obj('town', '支度をして、出陣する', 'main');
  realmObj(rt, true);
  // 始めの一言（門番）。馬を持っていれば、馬はそばで待つ
  rt.after(1.2, () => rt.say('門番', `${rt.G.name}殿、お戻りか。上役の屋敷は、城の方へ上って辻を左へ折れた所でござる`, 4.5));
  { const my = rt.flags.my, G = rt.G; if (my && (G.myLvSeen ?? -1) < my.lv) { const first = G.myLvSeen == null; G.myLvSeen = my.lv; if (!first && my.lv >= 1) rt.after(16, () => rt.say('', `出世して、我が住まいは${my.name}になった。西の路地の奥`, 4.5)); } }
  { const G = rt.G; if ((G.townLvSeen ?? -1) < MYLV) { const first = G.townLvSeen == null; G.townLvSeen = MYLV; if (!first) rt.after(9, () => rt.say('', ['', '城下に家が建ち始めた。空き地が減っている', '城下が賑わってきた。家ごとに提灯が下がる', '城下に土蔵が建ち、辻に提灯の綱が渡された', '城下は大きな町になった。通りに幟が並ぶ'][MYLV], 4.5)); } }
  rt.after(6.5, () => rt.say('', isTouch ? '戸口に寄ると「入る」が出る。押すと店や屋敷に入れる' : '戸口に寄ると「入る」が出る。E で店や屋敷に入れる', 4));
  if (rt.player.mounted) rt.player.toggleMount();
  // 町では背の旗指物を外す（戦の支度は出陣の時）
  { const pu = rt.player.u; if (pu.flag) { if (pu.flag.parent) pu.flag.parent.remove(pu.flag); pu.flag = null; } }
}

// 知行の支度（段2）：まだ選んでいない柱を任務の札に出す。屋敷から戻るたびに書き替える
function realmObj(rt, first) {
  const left = realmLeft(rt.G);
  const had = rt.objectives.some((o) => o.id === 'realm');
  const nm = (rt.flags.my && rt.flags.my.name) || '屋敷';
  if (left.length) {
    rt.obj('realm', `${nm}で知行の支度：${left.map((t) => t.n).join('・')}を選ぶ`, 'side');
    if (first && rt.flags.doors.yashiki) rt.after(11, () => rt.say('', `通りを西の路地へ入ると${nm}。内政・家臣・外交を選べる。選んだ事は次の戦に出る`, 4.5));
    if (rt.flags.doors.yashiki) rt.marker('mk-my', { x: rt.flags.doors.yashiki.x, z: rt.flags.doors.yashiki.z }, nm);
  } else { rt.unmark('mk-my'); if (had) { rt.obj('realm', '知行の支度は済んだ', 'side'); rt.objDone('realm'); } }
}

// ---- 町の人と組の者 ----
function people(rt, def, rumors) {
  const F = rt.flags;
  F.folk = [];
  const castAll = ['merchant', 'townsman', 'kid', 'samurai', 'townsman', 'elder', 'merchant', 'kid', 'townsman', 'samurai', 'townsman', 'merchant', 'kid', 'townsman'];
  // 携帯「低」は人を減らして軽くする（一人ひとり作り物の体なので、数がそのまま重さになる）
  const cast = SETTINGS.quality === 'low' ? castAll.filter((_, i) => i % 2 === 0) : castAll;
  cast.forEach((kind, i) => {
    const wp = WALK[(i * 5) % WALK.length];
    const x = wp[0] + ((i * 7) % 5) - 2, z = wp[1] + ((i * 3) % 5) - 2;
    const g = allyGroup(rt, { name: '町の人', anchor: { x, z }, facing: (i * 1.3) % 6.28, order: 'hold', noRout: true, width: 1, speed: kind === 'kid' ? 1.6 : 1.15, march: false, aggro: 0, seekRange: 0 },
      [{ type: 'porter', n: 1, o: { flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) return;
    dress(rt, u, kind, i);
    if (kind === 'kid') u.kid = true;
    u.name = ROLE[kind];
    // 子ども以外は、刀で斬りかかれる「町の人」にする（civScan・civStrike が見る）
    if (kind !== 'kid') { u.civ = true; u.civKind = kind; }
    // 夜も出歩くのは侍だけ（ほかは夕刻から家へ）。半分ほどは雨に傘をさす（town_air.js）
    const P = { g, u, kind, i, wp: (i * 5) % WALK.length, waitT: 2 + (i % 5) * 1.5, talkT: 0, said: 0, night: kind === 'samurai', umbOk: i % 2 === 0 && kind !== 'kid' };
    F.folk.push(P);
    rt.addInteract('folk' + i, () => (u.alive && !P.away ? { x: u.pos.x, z: u.pos.z } : null), `話す　${ROLE[kind]}`, () => talk(rt, P, rumors), { r: 2.4 });
  });
  // 市の売り手（台の後ろに立つ）
  for (const [i, x, z, h] of [[20, 12.9, -40, Math.PI / 2], [21, 23.1, -46, -Math.PI / 2], [22, 18, -26.2, 0]]) {
    const g = allyGroup(rt, { name: '売り手', anchor: { x, z }, facing: h, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 }, [{ type: 'porter', n: 1, o: { flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) continue;
    dress(rt, u, 'merchant', i);
    u.name = '売り手';
    const P = { g, u, kind: 'merchant', i, fixed: true, talkT: 0, said: 0 };
    F.folk.push(P);
    rt.addInteract('folk' + i, () => (P.away ? null : { x: u.pos.x - Math.sin(h) * -1.2, z: u.pos.z - Math.cos(h) * -1.2 }), '話す　売り手', () => talk(rt, P, rumors), { r: 2.6 });
  }
  // 組の者：長屋の前に（多くても六人。残りは長屋の中にいることにする）
  const R = (rt.G.roster || []).filter((r) => r.alive).slice(0, Math.min(6, RANKS[rt.G.rank].squad || 0));
  R.forEach((r, i) => {
    const x = 6.2 + (i % 2) * 1.3, z = 8.5 + i * 2.1;
    const g = allyGroup(rt, { name: '組の者', anchor: { x, z }, facing: -Math.PI / 2 + (i % 3 - 1) * 0.5, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 },
      [{ type: r.kind === 'bow' ? 'bow' : 'ashigaru', n: 1, o: { name: r.name, flag: null, invuln: true, hat: i % 2 ? 'hachimaki' : 'none', weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) return;
    rt.addInteract('kumi' + i, () => ({ x: u.pos.x, z: u.pos.z }), `話す　${r.name}`, () => {
      const hurt = r.wound;
      const L = hurt ? ['傷はまだ痛みまするが、次も出られまする', 'この傷、宿で手当てしてもらえれば……'] : r.battles > 0 ? ['次の戦も、お頭の後ろに付いてまいります', '前の戦で覚えました。槍は揃えて突くもの'] : ['まだ戦を知りませぬ。どうかご指南を', '国の母に、手柄の知らせを送りとうござる'];
      u.heading = Math.atan2(rt.player.u.pos.x - u.pos.x, rt.player.u.pos.z - u.pos.z);
      rt.say(r.name, L[(rt.flags.kumiN = (rt.flags.kumiN || 0) + 1) % L.length], 4);
    }, { r: 2.2 });
  });
  // 家臣は館の庭に立つ（myPeople）。別棟の詰所は廃したので、ここでは出さない
  myPeople(rt);
  // 用を持って暮らす人・犬・借り馬・店先の買い物（town_life.js）
  lifePeople(rt, { dress, dusk: F.tod === 0 });
  // 通りの人込み（遠い人は軽い形・近い人は本物）と、刻と天気（town_crowd.js・town_air.js）
  shopsPeople(rt, { dress, rumors });
  eventsSetup(rt, { dress, backPts: F.backPts });
  crowdSetup(rt, { dress, cloth: CLOTH, lv: MYLV });
  airSetup(rt, { info: def.info, lanterns: F.lanterns, torches: F.torches, lampMat: CHOCHIN.mat, madoMat: mats().koshi });
  F.rumorI = 0;
  setupHeat(rt, def);
}

// ---- 騒ぎ（GTA のような手配）：町の人を斬ると上がり、役人に追われる。捕まると罰 ----
const HEAT_DECAY = [0, 7, 13, 20];      // 何も無ければこの秒で一段下がる（隠れていればもっと早い）
const HEAT_WORD = ['', '騒ぎ　一', '騒ぎ　二', '騒ぎ　三'];
function setupHeat(rt, def) {
  const F = rt.flags;
  F.heat = 0; F.heatT = 0;
  F.guards = [];
  const gx = 0, gz = GATE_Z + 10;
  for (let i = 0; i < 3; i++) {
    const g = allyGroup(rt, { name: '捕り方', anchor: { x: gx + (i - 1) * 1.6, z: gz }, facing: Math.PI, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 },
      [{ type: i === 0 ? 'samurai' : 'ashigaru', n: 1, o: { name: i === 0 ? '役人' : '捕り方', flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) continue;
    u.name = i === 0 ? '役人' : '捕り方';
    F.guards.push({ g, u, anchor: { x: gx + (i - 1) * 1.6, z: gz }, catchT: 0 });
  }
  // 斬られた町の人の悲鳴と、まわりの人が逃げ出す
  rt.civScan = (pos, heading, reach, half) => {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const P of F.folk || []) {
      const o = P.u;
      if (!o || !o.alive || !o.civ || o.downed) continue;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > reach + 0.65) continue;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (cos < Math.cos(Math.min(1.4, half + Math.atan2(0.3, Math.max(0.5, d))))) continue;
      out.push({ u: o, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  };
  rt.civStrike = (t) => {
    if (t.downed || !t.alive) return;
    t.downed = true;
    const samuraiLike = t.civKind === 'samurai';
    rt.army.kill(t, rt.player.u);
    scream(rt, t);
    addHeat(rt, def, samuraiLike ? 2 : 1, samuraiLike);
  };
}
function scream(rt, t) {
  const F = rt.flags;
  for (const P of F.folk || []) {
    const o = P.u;
    if (!o || !o.alive || o === t) continue;
    const d = Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z);
    if (d < 14) { P.g.order = 'move'; P.g.dest = { x: o.pos.x + (o.pos.x - t.pos.x) / (d || 1) * 18, z: o.pos.z + (o.pos.z - t.pos.z) / (d || 1) * 18 }; P.waitT = 6; }
  }
  rt.army.play('cry', t.pos, 1);
}
function addHeat(rt, def, n, samurai) {
  const F = rt.flags;
  const before = F.heat;
  F.heat = Math.min(3, F.heat + n);
  F.heatT = rt.t + HEAT_DECAY[F.heat];
  if (F.heat !== before) {
    rt.obj('heat', `手配（${HEAT_WORD[F.heat]}）：見つからぬよう逃げるか、時をやり過ごせ`, 'order');
    rt.hud.flash(samurai ? '侍を斬った……大ごとになるぞ' : '見られた。人が騒ぎ出す', 'bad');
  }
  if (F.heat >= 1 && (rt.t - (F.heatCryT || -99) > 6)) { F.heatCryT = rt.t; rt.bark(F.heat >= 3 ? '御用だ、御用だ！' : '人殺しだぞ！', true); }
}
// 毎コマ：役人・足軽を近寄せる（heat が有る間）。追い付かれたら捕まる
function heatTick(rt, dt) {
  const F = rt.flags;
  if (!F.guards) return;
  if (F.heat > 0 && rt.t > F.heatT) { F.heat--; if (F.heat > 0) { F.heatT = rt.t + HEAT_DECAY[F.heat]; rt.obj('heat', `手配（${HEAT_WORD[F.heat]}）：見つからぬよう逃げるか、時をやり過ごせ`, 'order'); } else { rt.objRemove('heat'); rt.bark('騒ぎは収まったようだ'); } }
  const P = rt.player.u;
  const active = F.heat > 0;
  F.guards.forEach((G, i) => {
    const u = G.u;
    if (!u || !u.alive) return;
    if (active) {
      const ang = (i - 1) * 0.6;
      G.g.order = 'move'; G.g.dest = { x: P.pos.x + Math.sin(ang) * 1.0, z: P.pos.z + Math.cos(ang) * 1.0 };
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (d < 1.9 && rt.t > G.catchT) {
        G.catchT = rt.t + 2;
        caught(rt);
      }
    } else if (Math.hypot(u.pos.x - G.anchor.x, u.pos.z - G.anchor.z) > 1) {
      G.g.order = 'move'; G.g.dest = G.anchor;
    } else if (G.g.order !== 'hold') {
      G.g.order = 'hold'; G.g.dest = null; G.g.anchor = G.anchor;
    }
  });
}
function caught(rt) {
  const F = rt.flags;
  if (rt.choice) return;
  const fine = 120 + F.heat * 90;
  rt.G.kan = Math.max(0, (rt.G.kan || 0) - fine);
  rt.G.merit = Math.max(0, (rt.G.merit || 0) - 8);
  const boss = (BATTLES[rt.G.battle] && BATTLES[rt.G.battle].boss) || '上役';
  rt.banner('役人に捕らえられた', `過料 ${fine}文・戦功 −8`);
  rt.say(boss.replace(/^.* /, ''), '町の者に手を上げるとは……次はこうはいかぬぞ', 4.5);
  F.heat = 0; F.heatT = 0;
  rt.objRemove('heat');
  const p = rt.player.u;
  p.stagger = Math.max(p.stagger || 0, 1.2);
}

function talk(rt, P, rumors) {
  const F = rt.flags, u = P.u, pu = rt.player.u;
  if (rt.choice) return;
  // 立ち止まって、こちらを向く
  P.talkT = 6; P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: u.pos.x, z: u.pos.z };
  u.heading = Math.atan2(pu.pos.x - u.pos.x, pu.pos.z - u.pos.z);
  P.g.facing = u.heading;
  P.said++;
  const H = HAPPEN[P.kind];
  // 二度目に話しかけると、短い出来事（子ども・商人・年寄り）
  if (H && P.said === 2 && !F['hap_' + P.kind]) {
    F['hap_' + P.kind] = true;
    rt.choose(H.q, H.a.map((a) => ({ label: a.label })), (k) => {
      const a = H.a[k] || H.a[0];
      rt.say(ROLE[P.kind], a.say, 4);
      if (a.heal && rt.player.breath != null) rt.player.breath = rt.player.maxBreath || 100;
    }, 20);
    return;
  }
  // 噂（次の戦の手がかり）を、町の人の口から。無ければその人の口ぐせ
  const own = TALK[P.kind] || TALK.townsman;
  const useRumor = rumors.length && (P.kind === 'samurai' || P.kind === 'elder' || P.kind === 'townsman') && P.said % 2 === 1;
  const line = useRumor ? rumors[(F.rumorI++) % rumors.length] : own[(P.i + P.said) % own.length];
  rt.say(ROLE[P.kind], line, 4.5);
}

// ---- 毎コマ：町の人を歩かせる ----
function tick(rt, dt) {
  const F = rt.flags;
  for (const P of F.folk || []) {
    const u = P.u;
    if (!u || !u.alive || P.away || P.busy) continue;
    if (P.talkT > 0) { P.talkT -= dt; continue; }
    if (P.fixed) continue;
    const g = P.g;
    if (g.order === 'move' && g.dest) {
      if (Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 1.6) { g.order = 'hold'; g.anchor = { x: u.pos.x, z: u.pos.z }; g.dest = null; P.waitT = 2 + Math.random() * 6; }
      continue;
    }
    P.waitT -= dt;
    if (P.waitT > 0) continue;
    // 近い道の点のうちから、次の行き先を選ぶ（子どもは市のあたりを走り回る）
    const PT = P.pts || WALK;
    const here = PT[P.wp] || PT[0];
    const near = PT.map((w, k) => [k, Math.hypot(w[0] - here[0], w[1] - here[1])]).filter(([k, d]) => k !== P.wp && d < 26).map(([k]) => k);
    P.wp = near.length ? near[Math.floor(Math.random() * near.length)] : 0;
    const w = PT[P.wp];
    const dest = { x: w[0] + (Math.random() - 0.5) * 5, z: w[1] + (Math.random() - 0.5) * 3 };
    g.order = 'move'; g.dest = dest;
    g.facing = Math.atan2(dest.x - u.pos.x, dest.z - u.pos.z);
  }
  heatTick(rt, dt);
  goTick(rt);
  lifeTick(rt, dt);
  crowdTick(rt, dt);
  shopsTick(rt, dt);
  eventsTick(rt, dt);
  airTick(rt, dt);
}
