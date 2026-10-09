// ======================================================================
// 城下を歩く（kaito 2026-09-29「城下町を3Dで歩いて探索できるように」）
// 町家の並ぶ通り・市・武家屋敷・上官屋敷・問屋・馬屋・訓練場・宿・組の長屋、奥に城。
// 戦の作り（world・props・人）を使い回し、戸口に寄ると「入る」で今の城下の札の画面（screens.js の baseScreen）が開く。
// 出陣は町の門か上官屋敷で。町の人は二十人ほどまで。町家は形を使い回す（InstancedMesh）。
// 向き：北（+z）へ通りを上ると城。町の門は南の端
// ======================================================================
import { myShiro, shiroParts } from './shiro_growth.js';
import { MAP_SCENARIOS } from './japan_data.js';
import { trimInteriorCache } from './interior_parts.js';
import { realmLeft } from './realm.js';
import { nagayaOn } from './nagaya.js';
import { cgtScene, cgtOn, whenCgt, KitBatch, kitAttach } from './cgt.js';   // 買った素材（武家屋敷の長屋門・城の塀）。低では使わない
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { extFirst } from './props_ext.js';
import { yaguramon, dobei, tenshu, sumiyagura, ishigaki, kabukimon, tawara, umatsunagi, hut, koshisaku, kagaribi, solidRect, solidSeg, solidCircle, SOLIDS, castleMat, nobori, palisade, dorui, yagura, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch, ITA_MAT } from './props.js';
import { allyGroup } from './bhelp.js';
import { nagaya, mizubori } from './castle_parts.js';
import { doja } from './temple_parts.js';
import { roomTick } from './interior_parts.js';
import { buildTownRoom as buildRoom, townTowerTick } from './town_interiors.js';
import { nakaFind, nakaRoomAt } from './naka.js';
import { INTERIOR_WALLS, interiorBlocked } from './shironaka.js';
import { buildHorse, horseStyleFor, buildModel } from './units.js';
import { RANKS, BATTLES, scenarioKey, scenario } from './state.js';
import { odaTown, seasonOf } from './oda_town.js';
import { isTouch } from './touch.js';
import { domainCards, domainWork, domOf } from './domain.js';
import { keraiOf } from './retainers.js';
import { S as SETTINGS, K } from './settings.js';
import { buildLife, lifePeople, lifeTick, lifeH, riseAt, townGrow, townTrade } from './town_life.js';
import { airSetup, airTick, airResume } from './town_air.js';
import { crowdSetup, crowdTick } from './town_crowd.js';
import { buildShops, shopsPeople, shopsTick } from './town_shops.js';
import { eventsSetup, eventsTick } from './town_events.js';

let WATER_BUCKET = null;
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
  let ground = outer + roll + mound + myH(x, z) + lifeH(x, z);
  if (MYLV >= 3 && x < -30 && x > -72 && z > -22 && z < 24) ground -= (outer + roll) * (1 - sm(6.8, 8.5, myD(x, z)));
  if (x > -61 && x < -45 && z > -72 && z < -26) {
    const px = x < -53 ? -57 : -49, pz = -31 - Math.round((-z - 31) / 9) * 9;
    if (pz >= -67 && pz <= -31) { const edge = Math.max(Math.abs(x - px) / 3.65, Math.abs(z - pz) / 4.15); ground += (riseAt(pz) - ground) * (1 - sm(1, 1.08, edge)); }
  }
  return ground;
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

// 穴のある輪。井筒と車輪で使い、設営時にほかの形とまとめる。
function ring(outer, inner, h, x, y, z, col, seg = 12, rz = 0) {
  const g = new THREE.LatheGeometry([
    new THREE.Vector2(outer, -h / 2), new THREE.Vector2(outer, h / 2),
    new THREE.Vector2(inner, h / 2), new THREE.Vector2(inner, -h / 2), new THREE.Vector2(outer, -h / 2),
  ], seg);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return colorize(g.toNonIndexed(), col);
}

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
    wood: castleMat('wood'), plaster: castleMat('plaster'), shitami: castleMat('shitami'), tile: castleMat('tile'), ita: ITA_MAT(),
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
  // 一階：外壁を分け、格子の奥は暗い見込みを残す。
  for (const sx of [-1, 1]) P.wood.push(box(0.12, 2.7, D, sx * (w / 2 - 0.06), 1.35, 0, 0x5a4634, { uvk: 1.5 }));
  P.wood.push(box(w, 2.7, 0.12, 0, 1.35, -f + 0.06, 0x5a4634, { uvk: 1.5 }));
  P.wood.push(box(w - 0.24, 2.7, 0.08, 0, 1.35, f - 0.65, 0x17120e));
  P.wood.push(box(w, 0.3, 0.65, 0, 0.15, f - 0.325, 0x5a4634, { uvk: 1.5 }));
  P.wood.push(box(w, 0.5, 0.65, 0, 2.45, f - 0.325, 0x5a4634, { uvk: 1.5 }));
  for (const sx of [-1, 1]) P.wood.push(box(0.2, 2.9, 0.2, sx * (w / 2 - 0.1), 1.45, f + 0.02, 0x3a2c20));
  P.wood.push(box(w + 0.1, 0.2, 0.22, 0, 2.7, f + 0.03, 0x3a2c20));             // 差鴨居
  // 格子（戸口の左右）
  // 格子は一枚の板に格子の絵（透かし）を貼る（細い棒を並べると重いので）
  for (const sd of [-1, 1]) {
    const x0 = 0.85, x1 = w / 2 - 0.25, lw = x1 - x0;
    P.koshi.push(box(lw, 1.9, 0.03, sd * (x0 + lw / 2), 1.25, f + 0.08, 0xffffff, { uvk: 0.13 }));
  }
  P.wood.push(box(1.5, 2.2, 0.06, 0, 1.1, f + 0.01, 0x5a402c));                   // 入れない町家は板戸を閉じる
  for (const x of [-.5, 0, .5]) P.wood.push(box(.025, 2.2, .025, x, 1.1, f + .05, 0x322419));
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
  const W = vertical ? 64 : Math.max(128, n * 60 + 20), H = vertical ? Math.max(128, n * 58 + 20) : 64;
  const scale = Math.min(1, 1020 / Math.max(W, H));
  cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
  const g = cv.getContext('2d'); g.scale(scale, scale);
  g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c9b48a'; g.fillRect(4, 4, W - 8, H - 8);
  // 木目
  g.globalAlpha = 0.18; g.strokeStyle = '#6a4e30';
  for (let i = 0; i < 12; i++) { g.beginPath(); const y = 5 + i * (H - 10) / 12; g.moveTo(4, y); g.bezierCurveTo(W * 0.3, y + 2, W * 0.6, y - 2, W - 4, y + 1); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = '#16110c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 48px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  if (vertical) [...text].forEach((ch, i) => g.fillText(ch, W / 2, 10 + 29 + i * 58));
  else g.fillText(text, W / 2, H / 2 + 2);
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
  // 一枚は千二十四角まで。満杯なら次へ送り、文字を切らない。
  const S = 1024, ord = L.slice().sort((p, q) => q.cv.height - p.cv.height);
  const pages = [];
  let page = [], x = 2, y = 2, rowH = 0;
  for (const s of ord) {
    if (x + s.cv.width + 2 > S) { x = 2; y += rowH + 2; rowH = 0; }
    if (y + s.cv.height + 2 > S) { pages.push(page); page = []; x = 2; y = 2; rowH = 0; }
    s.ax = x; s.ay = y; page.push(s); x += s.cv.width + 2; rowH = Math.max(rowH, s.cv.height);
  }
  if (page.length) pages.push(page);
  for (const entries of pages) {
    const H = 2 ** Math.ceil(Math.log2(Math.max(64, ...entries.map(s => s.ay + s.cv.height + 2))));
    const cv = document.createElement('canvas'); cv.width = S; cv.height = H;
    const g = cv.getContext('2d');
    for (const s of entries) {
      g.drawImage(s.cv, s.ax, s.ay);
      // 絵の縁を一画素延ばし、斜めから見ても隣の看板を拾わない。
      g.drawImage(s.cv, 0, 0, s.cv.width, 1, s.ax, s.ay - 1, s.cv.width, 1);
      g.drawImage(s.cv, 0, s.cv.height - 1, s.cv.width, 1, s.ax, s.ay + s.cv.height, s.cv.width, 1);
      g.drawImage(s.cv, 0, 0, 1, s.cv.height, s.ax - 1, s.ay, 1, s.cv.height);
      g.drawImage(s.cv, s.cv.width - 1, 0, 1, s.cv.height, s.ax + s.cv.width, s.ay, 1, s.cv.height);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    const geos = entries.map((s) => {
      const pg = new THREE.PlaneGeometry(s.w, s.hh), uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (s.ax + uv.getX(i) * s.cv.width) / S, 1 - (s.ay + (1 - uv.getY(i)) * s.cv.height) / H);
      pg.translate(0, 0, 0.032); pg.rotateY(s.rot); pg.translate(s.x, s.y, s.z);
      return pg;
    });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
    for (const geo of geos) geo.dispose();
    m.receiveShadow = true; rt.scene.add(m);
  }
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
  for (const s of list) {
    const y = rt.world.heightAt(s.x, s.z), c = Math.cos(s.rot), sn = Math.sin(s.rot);
    solidRect(s.x + 0.1 * sn, s.z + 0.1 * c, 2.2, 1.2, s.rot, y + 0.79);
    for (const x of [-1.1, 1.1]) for (const z of [-0.8, 0.8]) {
      solidRect(s.x + x * c + z * sn, s.z - x * sn + z * c, 0.08, 0.08, s.rot, y + (z < 0 ? 2.2 : 1.9));
    }
  }
}

// ---- 稽古の巻藁（杭と藁の束）----
function makiwara(rt, pts) {
  const geos = [];
  geos.push(cyl(0.07, 0.08, 1.9, 0, 0.95, 0, 0x4a3a2a, 6), cyl(0.2, 0.2, 0.9, 0, 1.25, 0, 0xb8a060, 8), box(1.1, 0.07, 0.07, 0, 1.5, 0, 0x4a3a2a));
  for (const y of [0.95, 1.25, 1.55]) geos.push(cyl(0.205, 0.205, 0.04, 0, y, 0, 0x6a5230, 8));
  const im = new THREE.InstancedMesh(mergeAll(geos), mats().straw, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    const y = rt.world.heightAt(x, z);
    im.setMatrixAt(i, m4.makeTranslation(x, y, z)); solidRect(x, z, 0.5, 0.5);
    const crossbar = solidRect(x, z, 1.1, 0.07, 0, y + 1.535);
    crossbar.yBot = y + 1.465;
    crossbar.bodyOverlap = true;   // 足元だけでなく、腰から上に触れる横木も止める。
  });
  im.castShadow = true;
  rt.scene.add(im);
}

// ---- 井戸・荷車・水桶（町の暮らし）----
function well(rt, x, z) {
  const y = rt.world.heightAt(x, z);
  const g = mergeAll([
    ring(0.8, 0.57, 0.8, 0, 0.4, 0, 0x6e675c),
    cyl(0.57, 0.57, 0.02, 0, 0.12, 0, 0x17282a, 12),
    box(0.1, 2.1, 0.1, -0.8, 1.05, 0, 0x4a3828), box(0.1, 2.1, 0.1, 0.8, 1.05, 0, 0x4a3828), box(1.8, 0.1, 0.1, 0, 2.1, 0, 0x4a3828),
    box(1.9, 0.08, 1.2, 0, 2.3, 0, 0x5a5048, { rz: 0 }),
    cyl(0.14, 0.12, 0.22, 0.2, 0.9, 0.3, 0x5a4028, 8),
  ]);
  const m = new THREE.Mesh(g, mats().straw); m.position.set(x, y, z); m.castShadow = true; rt.scene.add(m);
  solidCircle(x, z, 0.9);
}
function cart(rt, x, z, rot) {
  // 素材は箱の中心を原点にそろえてある。当たりも同じ中心に置く。
  if (extFirst(rt.scene, 'cart', [{ x, z, rot: rot + Math.PI / 2 }], rt.world)) { solidRect(x, z, 1.5, 2.8, rot); return; }
  const y = rt.world.heightAt(x, z);
  const wheel = [ring(0.55, 0.46, 0.08, 0, 0, 0, 0x3a2c20, 12, Math.PI / 2), cyl(0.12, 0.12, 0.14, 0, 0, 0, 0x4a3828, 8, { rz: Math.PI / 2 })];
  for (let i = 0; i < 4; i++) wheel.push(box(0.06, 0.96, 0.06, 0, 0, 0, 0x6a5236, { rx: i * Math.PI / 4 }));
  const wheelGeo = mergeAll(wheel);
  const g = mergeAll([
    box(1.3, 0.1, 2.6, 0, 0.75, 0, 0x6a5236), box(0.08, 0.08, 3.6, -0.45, 0.72, 2.2, 0x4a3828), box(0.08, 0.08, 3.6, 0.45, 0.72, 2.2, 0x4a3828),
    wheelGeo.clone().translate(-0.75, 0.55, 0), wheelGeo.clone().translate(0.75, 0.55, 0),
    cyl(0.07, 0.07, 1.65, 0, 0.55, 0, 0x4a3828, 6, { rz: Math.PI / 2 }),
    box(0.16, 0.2, 0.3, -0.48, 0.65, 0, 0x4a3828), box(0.16, 0.2, 0.3, 0.48, 0.65, 0, 0x4a3828),
    cyl(0.28, 0.28, 0.75, -0.25, 1.1, -0.5, 0xb8a060, 8, { rz: Math.PI / 2 }), cyl(0.28, 0.28, 0.75, 0.3, 1.1, 0.2, 0xb0985a, 8, { rz: Math.PI / 2 }),
  ]);
  wheelGeo.dispose();
  const m = new THREE.Mesh(g, mats().straw); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = true; rt.scene.add(m);
  solidRect(x, z, 1.5, 2.8, rot);
  // 引き手は荷台から前へ伸びる。荷台だけの当たりでは柄をすり抜ける。
  for (const side of [-1, 1]) {
    const ax = x + side * .45 * Math.cos(rot) + .4 * Math.sin(rot), az = z - side * .45 * Math.sin(rot) + .4 * Math.cos(rot);
    const wall = solidSeg(ax, az, ax + 3.6 * Math.sin(rot), az + 3.6 * Math.cos(rot), .06);
    wall.yBot = y + .64; wall.yTop = y + .8;
  }
}

// ---- 施設 ----
// tab：screens.js の baseScreen の札の鍵。door：戸口（「入る」の輪の中心）
const FAC = {
  boss: { n: '上官屋敷' }, squad: { n: '組の長屋' }, shop: { n: '武具屋' }, toiya: { n: '問屋' },
  train: { n: '訓練場' }, inn: { n: '宿' }, stable: { n: '馬屋' },
};

// ---- 町の人：言葉と、短い出来事 ----
const TALK = {
  merchant: ['安うしとくよ。戦の前は草鞋がよう売れる', '尾張の塩は良いぞ。汗をかく戦には欠かせん', '市の日には、遠くの村からも売り手が来る'],
  townsman: ['殿様のおかげで、この辺りも賑やかになった', '夜は辻に気をつけなされ。酔うた足軽が多い', '城の堀を広げるそうで、わしも駆り出される'],
  kid: ['お侍さま、その槍、触ってもええか', 'わしも大きゅうなったら足軽になる！', 'この前の戦で、首をいくつ取ったんじゃ？'],
  samurai: ['おぬしも出陣か。命を粗末にするなよ', '上役の屋敷は、城へ向かう辻を左じゃ。訓練場は右', '訓練場で汗を流しておけ。戦場で泣かずに済む'],
  elder: ['戦の知らせが来ると、村の者も落ち着かぬものじゃ', '戦に出る前は、井戸の水で顔を洗うと験がよい'],
};
// 話しかけると起きる、短い出来事（残る数は変えない。その場の気分と台詞だけ）
const HAPPEN = {
  kid: { q: '子どもが槍に触りたがっている', a: [{ label: '柄だけ触らせてやる', say: 'わあ、重い！　お侍さまは力持ちじゃ' }, { label: '危ないと叱る', say: 'ご、ごめんなさい……' }] },
  merchant: { q: '団子売りが一串すすめてくる', a: [{ label: '団子を分けてもらう（銭は要らず、息が戻る）', say: 'まいど。戦の前は甘い物が一番よ', heal: true }, { label: '先を急ぐ', say: 'またどうぞ。ご武運を' }] },
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
  [-14, -22], [-33, -22], [-44.7, -22], [-33, -40], [-33, -56], [-33, -6], [-33, 12],
];

// 町では戦の札を隠す（戦功・体力と気力・技の列・照準・方角・組の札）。任務の札・小さな地図・台詞・「入る」は残す
function townCss() {
  if (document.getElementById('town3d-css')) return;
  const st = document.createElement('style');
  st.id = 'town3d-css';
  st.textContent = '#hud.town .tl .plaque, #hud.town .tl .next, #hud.town .bl, #hud.town #h-bottom, #hud.town #crosshair, #hud.town #compass, #hud.town #h-squad, #hud.town #armybar, #hud.town #h-units, #hud.town #situation { display: none !important; } #hud.town #prompt { top: auto; bottom: 24px; max-width: calc(100vw - 32px); } @media (max-height: 500px) { #hud.town #prompt { bottom: 96px; } } @media (max-width: 600px) { #hud.town #prompt { bottom: 160px; } } @media (max-height: 500px) { html:not(.touch) #town-sortie { right: calc(150px + env(safe-area-inset-right, 0px)); bottom: 12px; } }';
  st.textContent += '#hud.town #choice { width: min(320px, calc(100vw - 32px)); overflow-wrap: anywhere; box-sizing: border-box; max-height: 50vh; overflow-y: auto; font-size: 15px; } #hud.town #choice .opt { width: 100%; min-height: 44px; margin: 8px 0 0; padding: 8px; box-sizing: border-box; align-content: center; text-align: left; font: inherit; color: var(--washi); background: var(--sumi-3, #2c2821); border: 1px solid var(--gold-line); cursor: pointer; } #hud.town #choice .opt small { font-size: 12px; } #hud.town #choice .opt:focus-visible { outline: 3px solid var(--kin); box-shadow: 0 0 0 5px #14120f; }';
  st.textContent += '@media (max-height: 500px) { #hud.town #choice { left: auto; right: 16px; top: 16px; transform: none; width: min(280px, 32vw); max-height: calc(100vh - 32px); } }';
  document.head.appendChild(st);
}
// ======================================================================
export function townDef(game) {
  const G = game.G;
  const oda = scenarioKey() === 'oda';
  const TW = oda ? odaTown() : null;
  const battle = BATTLES[G.battle];
  const info = (TW && TW.TOWNS[G.battle]) || {
    place: `${battle?.town || '清洲'} 城下`, when: battle?.year || '',
    year: Number((battle?.year || '').match(/\d{4}/)?.[0] || 0),
  };
  const season = info.season || seasonOf(info.when);
  const faction = scenario().faction || 'oda';
  const tod = Math.max(0, Math.min(2, G.actions ?? 2));   // 2 朝・1 昼・0 夕刻
  const timeKey = tod === 0 ? 'dusk' : 'day';
  const rumors = (TW && TW.RUMORS[G.battle]) || [];
  const ownCastle = myShiro(G.japan);
  const assignedCastle = MAP_SCENARIOS[G.japan?.scn]?.castles.find(c => c.id === ownCastle);
  const castleType = assignedCastle?.type;
  const posting = assignedCastle ? `任地は${assignedCastle.name}。今は${info.place}で出陣の支度。西の囲いは任地の普請を示す仮の姿` : '';
  MYPARTS = ownCastle == null ? {} : { ...shiroParts(G.japan, ownCastle), dry: castleType === 'yama' };
  MYLV = myLevel(G);   // 地面（堀・城の台）を作る前に、我が館の格を決める
  const townSoil = new THREE.Color(.40, .35, .27);
  const def = {
    town: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    title: info.place, info, year: info.year, posting, faction,
    history: '宣教師の見聞は、フロイスの『日本史』と『耶蘇会士日本通信』の内容を自分の言葉で短くした。宣教師の宗教上の評価や伝聞を、確定した事実とはしない。安土の天守は記録の壁の色を使ったが、寸法、形、配置は推定である。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の根拠には使っていない。',
    place: info.place, when: `${info.when || ''}　${['夕刻', '昼', '朝'][tod]}`, season,
    spawn: { x: 0, z: GATE_Z + 6, heading: 0 },
    world: {
      seed: 1560, time: timeKey, mood: tod === 2 ? 'morning' : 'plain',
      height, clear: inTown, trees: 180, tufts: 2600, rocks: 60,
      paths: [[[0, GATE_Z - 60], [0, CASTLE_Z - 2]], [[-60, CROSS_Z], [60, CROSS_Z]], [[4, -38], [30, -38]],
        [[-4, LANE_Z], [MY_LANE_X, LANE_Z], [-57, LANE_Z]], [[-44.7, -26.5], [-44.7, -71.5]], [[-62, -26.5], [-62, -71.5]], [[-44.7, -26.5], [-62, -26.5]], [[-44.7, -35.5], [-62, -35.5]], [[-44.7, -44.5], [-62, -44.5]], [[-44.7, -53.5], [-62, -53.5]], [[-44.7, -62.5], [-62, -62.5]], [[-44.7, -71.5], [-62, -71.5]], [[MY_LANE_X, GATE_Z + 4], [MY_LANE_X, CROSS_Z - 4]], [[MY_LANE_X, MC.z], [MC.x + MC.hx - 1, MC.z]]],
      autumn: season === '秋', winter: season === '冬', young: season === '春' || season === '夏', muddy: 0.15,
      groves: [[-90, 40, 30], [90, -20, 30], [-80, -60, 24], [70, 90, 30], [-60, 110, 28]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
      tint: (x, z, h, c) => {
        // 町の中の地面は踏み固めた土。軒下は少し暗い
        if (inTown(x, z) && z < CASTLE_Z - 1) c.lerp(townSoil, Math.abs(x) < 50 ? 0.75 : 0.35);
      },
    },
    setup(rt) { townCss(); buildTown(rt, def); people(rt, def, rumors); prepareWays(rt, def); guide(rt, def); restoreDoor(rt); const dl = document.getElementById('dateline'); if (dl) dl.textContent = def.when || ''; },
    update(rt, dt) { tick(rt, dt); },
    // 城下の札から「町を歩いて〇〇へ行く」：道しるべ（小さな地図の印と任務の札）を出す。着けば消す
    guideTo(rt, tab) { guideTo(rt, tab); },
    // 札の画面から町へ戻った時：刻が進んでいれば、空の色を移ろわせる
    onResume(rt) {
      refreshVillage(rt, def);
      realmObj(rt);
      airResume(rt);   // 刻と空の移ろい（town_air.js）
    },
  };
  return def;
}

// 宣教師の見聞を短く言い直す。後の事件を、出陣前の町の噂に混ぜない。
// 信長の姿：フロイス『日本史』第一部の人物評（訳文の掲載）
// https://www.mext.go.jp/a_menu/shotou/kyoukasho/kentei/03062201/14-67/14-67-01.pdf
// 安土の色：『日本史』第二部31章（訳文の掲載）
// https://www1.asitaka.com/ihs/fr-jphis.htm
// 町の屋敷：『耶蘇会士日本通信』ジョアン・フランシスコの1580年書簡
// https://www1.asitaka.com/ihs/1580.htm
// 大坂への兵糧：同書のオルガンティノ書簡（1578年、堺に着いた大船の見聞）
// https://proto.harisen.jp/koramu/koramu-tekkousen2.htm
function froisTales(def, year) {
  const lines = [];
  if (year >= 1569) lines.push('フロイスは、信長を細身でひげが少なく、声がよく通る人だと記した。出典はフロイス『日本史』の信長の人物評。初めて会ったのは永禄十二年');
  if (year > 1571) lines.push('フロイスの手紙では、比叡山の谷々の僧坊は、長い戦乱で減っていたという。出典はフロイスの比叡山についての書簡。元亀二年の記述');
  if (year > 1578) lines.push('宣教師オルガンティノは堺で大船と大砲を見た。大坂の一向宗へ兵糧を運ぶ船を止めるためだと書いた。出典は『耶蘇会士日本通信』、オルガンティノの天正六年の書簡');
  if (/^安土/.test(def.place) && year >= 1581) {
    lines.push('フロイスの見た安土の天守は、白壁に黒い窓。赤や青の壁もあり、いちばん上は金色だった。出典はフロイス『日本史』第二部三十一章、天正九年の安土の見聞');
    lines.push('宣教師ジョアン・フランシスコの手紙では、安土の大身の屋敷は、丈夫な塀で囲まれていたという。出典は『耶蘇会士日本通信』、ジョアン・フランシスコの天正八年の書簡');
    lines.push('フロイスは安土の城の馬屋を、たいへん清潔だと記した。世話をする若者は絹の服を着ていたという。出典はフロイス『日本史』第二部三十一章、天正九年の安土の見聞');
  }
  if (lines.length) lines.push('宣教師は布教のために記した。仏教への厳しい評価もあり、聞いた話と自分で見た事を分けて読む');
  return lines;
}
// 安土の遠景。記録にある壁の色を使い、寸法・屋根の重なり・配置は推定とする。
// 基本形を設営時に一つへまとめる。町の奥なので中は作らず、画質によらず同じ色にする。
function azuchiTower(rt) {
  const z = CASTLE_Z + 30, y0 = rt.world.heightAt(0, z), parts = [];
  parts.push(box(18, 3.5, 16, 0, y0 + 1.75, z, 0x716e66));
  let y = y0 + 3.5, w = 16, d = 13;
  // 下の二段は二階分の高さ。五つの屋根で七階を表すが、正確な復元図ではない。
  for (const [i, col] of [0xd8d0bc, 0xd8d0bc, 0x8f3028, 0x405d73, 0xc6a34e].entries()) {
    const h = i < 2 ? 5.4 : 2.8;
    parts.push(box(w, h, d, 0, y + h / 2, z, col));
    for (const dy of (i < 2 ? [1.5, 4] : [1.5])) for (const sx of [-1, 0, 1]) {
      for (const sd of [-1, 1]) {
        parts.push(box(0.8, 0.7, 0.06, sx * w * 0.28, y + dy, z + sd * (d / 2 + 0.04), 0x171815));
        parts.push(box(0.06, 0.7, 0.8, sd * (w / 2 + 0.04), y + dy, z + sx * d * 0.28, 0x171815));
      }
    }
    const len = Math.hypot(d / 2 + 0.8, 1.1), slope = Math.atan2(1.1, d / 2 + 0.8);
    for (const sd of [-1, 1]) parts.push(box(w + 1.6, 0.18, len, 0, y + h + 0.55, z + sd * (d / 4 + 0.4), 0x454e54, { rx: sd * slope }));
    y += h + 1.1; w *= 0.82; d *= 0.82;
  }
  const geo = mergeAll(parts); for (const g of parts) g.dispose();
  const m = new THREE.Mesh(geo, mats().straw); m.castShadow = true; rt.scene.add(m);
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
  const year = def.year;
  const azuchi = /^安土/.test(def.place) && year >= 1579;
  const stoneCastle = (/^小牧山/.test(def.place) && year >= 1563) || (/^岐阜/.test(def.place) && year >= 1567) || (/^安土/.test(def.place) && year >= 1576);
  const tales = froisTales(def, year);
  if (tales.length) {
    sign(rt, '宣教師の見聞', 3.8, 1.2, 60, -Math.PI / 2, 0.5, true);
    const pages = tales.flatMap(line => {
      const out = [];
      for (const sentence of line.match(/[^。]+。?|。/gu) || [line]) {
        let rest = sentence;
        while (rest.length > 64) { const cut = rest.lastIndexOf('、', 64); const n = cut > 16 ? cut + 1 : 64; out.push(rest.slice(0, n)); rest = rest.slice(n); }
        if (rest) out.push(rest);
      }
      return out;
    });
    const read = (page = 0) => {
      if (rt.choice) return;
      rt.choose(`見聞の帳面（${page + 1}／${pages.length}）　${pages[page]}`, [
        { label: '帳面を閉じる' }, { label: page + 1 < pages.length ? '次の頁を読む' : '読み終えて閉じる' }, { label: page > 0 ? '前の頁を読む' : '初めの頁を読み直す' },
      ], (k) => { if (k === 1 && page + 1 < pages.length) read(page + 1); else if (k === 2) read(Math.max(0, page - 1)); }, 60);
    };
    rt.addInteract('froisTales', { x: 2.7, z: 60 }, '読む　見聞の帳面', () => read(), { r: 2.5 });
  }
  // 土塀・石垣・櫓門・隅櫓・天守は材質ごとに一つの BatchedMesh へまとめ、draw call を減らす（buildMy と同じ考え）
  const kb = makeKitBatch();
  const addKB = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  const row = (side, z0, z1, skip) => {
    // side -1：通りの西（前は +x）、1：東（前は -x）
    let z = z0;
    while (z < z1) {
      const w = (k * 7) % 3 === 0 ? 6.5 : 5;
      if (z + w <= z1 && !(skip && skip.some(([a, b]) => z + w > a && z < b))) {
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
      if (z + w <= z1 && !(skip && skip.some(([a, b]) => z + w > a && z < b))) list.push({ x, z: z + w / 2, rot, w, noren: NOREN[k % NOREN.length], shade: 0.8 + ((k * 29) % 23) / 100 });
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
    // 共通の町家の形を使い、用途別の間取りを見た目と当たりへ渡す。
    buildRoom(rt, x, z, { w, d: D, rot: it.rot, night: dusk, kind: id });
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
  sign(rt, '使者の控え', -10.5, 1.1, -45, Math.PI / 2, .36, true);
  rt.addInteract('shisha-help', doors.shisha, '聞く　使者の用', () => rt.say('使者', 'ここで返事を待ちます。使者を送る時は、外交の札を開いてくだされ', 3.5), { r: 2.4 });
  // 宿の提灯・問屋の俵と荷車
  for (const dz of [-2.2, 2.2]) chochin(rt, -(ST_W - 0.4), 2.6, -57 + dz, dusk);
  rt.scene.add(tawara(W, -4.2, -12.5, Math.PI / 2, 6), tawara(W, -4.3, -3.5, Math.PI / 2, 3));
  cart(rt, -17, -10, Math.PI);
  sign(rt, '荷の待ち場', -15, 1.1, -10, Math.PI / 2, .36, true);
  // 武具屋の前：槍の立て掛け（棒を並べる）
  {
    const g = mergeAll([box(0.1, 0.1, 2.4, 0, 1.4, 0, 0x3a2c20), ...[0, 1, 2, 3, 4].map((i) => cyl(0.02, 0.025, 3.2, 0, 1.55, -1 + i * 0.5, 0x4a3a28, 5, { rx: 0 }))]);
    const m = new THREE.Mesh(g, mats().straw); m.position.set(-3.6, W.heightAt(-3.6, -37.8), -37.8); m.rotation.z = -0.12; m.castShadow = true; rt.scene.add(m);
  }
  // 我が館（知行・内政）：西の路地の奥。身分が上がるほど館→砦→城と育ち、内政の結果が村の見た目に出る
  buildMy(rt, def, list, doors, dusk);
  // 家臣の事は館の門（知行の札）から開く。別棟の詰所は作らず、重なりをまとめた
  // 出世で町が育つ：空き地・表の提灯・提灯の綱・幟・土蔵（town_life.js）
  townGrow(rt, { list, lv: MYLV, chochin, ST_W, D, nobori });
  placeMachiya(rt, list);
  // 町家の戸口（人が家へ帰る・雨宿りする所）：表を向いた家の前。h は通りの方を向く向き
  // 裏の並びの家（火事が起きる所）：fx・fz は路地の側の前
  const townHomes = list.concat(F.my.villageHomes || []);
  F.backPts = townHomes.filter((it) => Math.abs(it.x) > 20 && Math.abs(Math.abs(it.rot) - Math.PI / 2) < 0.01).map((it) => { const s = it.rot > 0 ? 1 : -1; return { x: it.x, z: it.z, fx: it.x + s * (D / 2 + 1.6), fz: it.z }; });
  F.doorPts = townHomes.filter((it) => Math.abs(Math.abs(it.rot) - Math.PI / 2) < 0.01).map((it) => { const s = it.rot > 0 ? 1 : -1; return { x: it.x + s * (D / 2 + 0.55), z: it.z + it.w * 0.2, h: it.rot }; });
  // 町はずれの百姓家（茅葺き）：遠くまで家が続いて見えるように（携帯「低」は遠い分を減らし軽くする）
  const farHuts = [[47, -70, -0.4], [52, -8, 0.2], [48, 16, -0.3], [56, 40, 0.6], [-58, 50, 0.2]];
  (SETTINGS.quality === 'low' ? farHuts.slice(0, 3) : farHuts).forEach(([x, z, r]) => rt.scene.add(hut(W, x, z, 7, 5, r)));

  // 市：通りの東の広場に露店と人だかり（携帯「低」は台を減らす）
  const stallList = [
    { x: 12, z: -46, rot: -Math.PI / 2 + 0.1, cloth: 0xd8cfb8 }, { x: 12, z: -40, rot: -Math.PI / 2, cloth: 0x4a5a70 }, { x: 12, z: -34, rot: -Math.PI / 2 - 0.08, cloth: 0xc8b890 },
    { x: 24, z: -46, rot: Math.PI / 2, cloth: 0x8a4a30 }, { x: 24, z: -40, rot: Math.PI / 2 + 0.1, cloth: 0xd0c8b0 }, { x: 24, z: -32, rot: Math.PI / 2, cloth: 0x5a6a50 },
    { x: 18, z: -27, rot: Math.PI, cloth: 0xb89a70 },
  ];
  F.marketStalls = SETTINGS.quality === 'low' ? stallList.slice(0, 5) : stallList;
  stalls(rt, F.marketStalls);
  sign(rt, '市', 6.2, 2.2, -50, -Math.PI / 2, 0.5, true);
  { const m = nobori(W, 7, -51.5, def.faction, 4.2); rt.scene.add(m); }
  well(rt, 18, -20);
  rt.addInteract('town-water', { x: 16.5, z: -20 }, '水を汲む　井戸', () => { if (!rt.choice && !rt.flags.heat) rt.say('', '桶に水を汲んだ。飲み水と炊事に使う共同の井戸', 3); }, { r: 2 });

  // 馬屋：板屋根の小屋と、馬を繋ぐ杭。馬が二頭
  rt.scene.add(hut(W, 16, -6.5, 10, 5, -Math.PI / 2, { ita: true, h: 2.4 }));
  rt.scene.add(umatsunagi(W, 9.5, -6.5, Math.PI / 2, 9));
  for (const [i, z] of [[0, -9.5], [1, -3.8]]) {
    const h = buildHorse(horseStyleFor(i + 3, 0, def.faction));
    h.position.set(10.6, W.heightAt(10.6, z), z); h.rotation.y = -Math.PI / 2 + (i ? 0.2 : -0.15);
    rt.scene.add(h);
    (F.stableHorses = F.stableHorses || []).push(h);   // 借りて乗れる（town_life.js）
  }
  sign(rt, '馬屋', 8.0, 1.0, -1.2, -Math.PI / 2, 0.36, true);
  doors.stable = { x: 7.5, z: -1.5 };

  // 組の長屋：長い板屋根の長屋。前に組の者
  F.squadRoom = buildRoom(rt, 11.5, 14, { w: 15, d: 5.5, rot: -Math.PI / 2, night: dusk, kind: 'nagaya' });
  sign(rt, '組', 7.4, 1.0, 20.5, -Math.PI / 2, 0.36, true);
  doors.squad = { x: 7, z: 14 };
  { const f = kagaribi(W, 6.2, 9); rt.scene.add(f); if (dusk) W.addFire(6.2, 9, { torch: true }); else F.torches.push({ x: 6.2, z: 9 }); }

  // 上官屋敷：土塀で囲い、冠木門。中に板屋根の屋敷
  {
    const x0 = -48, x1 = -12, z0 = CROSS_Z + ST_W + 1.5, z1 = 68, gx = -30;
    const segs = [[x0, z0, gx - 2.4, z0], [gx + 2.4, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    for (const s of segs) { addKB(dobei(W, s, { h: 2.1, samaStep: 99, batch: kb })); solidSeg(...s, 0.3); }
    rt.scene.add(kabukimon(W, gx, z0, 4.8, 0));
    buildRoom(rt, gx, 54, { w: 16, d: 9, rot: Math.PI, night: dusk, kind: 'goten' });
    sign(rt, '上官屋敷', gx + 3.6, 1.2, z0 - 0.5, Math.PI, 0.34, true);
    rt.scene.add(nobori(W, gx - 3.6, z0 - 1, def.faction, 4.2));
    doors.boss = { x: gx, z: z0 - 1.5 };
  }
  // 訓練場：低い柵で囲った広場に巻藁
  {
    const x0 = 12, x1 = 48, z0 = CROSS_Z + ST_W + 1.5, z1 = 64, gx = 28;
    for (const s of [[x0, z0, gx - 3, z0], [gx + 3, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) { rt.scene.add(koshisaku(W, s)); solidSeg(...s, 0.2); }
    makiwara(rt, [[20, 46], [24, 46], [28, 46], [32, 46], [36, 46], [22, 54], [30, 54], [38, 54]]);
    rt.scene.add(nobori(W, 14, 62, def.faction, 4.5), nobori(W, 46, 62, def.faction, 4.5));
    sign(rt, '訓練場', gx + 4.2, 1.2, z0 - 0.4, Math.PI, 0.34, true);
    doors.train = { x: gx, z: z0 - 1.5 };
  }
  // 武家屋敷（城へ向かう通りの両側の土塀）
  for (const sx of [-1, 1]) { const gate = new THREE.Mesh(box(.18, 2.7, 4.4, sx * 10, W.heightAt(sx * 10, 52) + 1.35, 52, 0x503b29), mats().straw); rt.scene.add(gate); }
  for (const [a, b] of [[[-10, 36], [-10, 68]], [[10, 36], [10, 68]]]) { addKB(dobei(W, [...a, ...b], { h: 2.0, samaStep: 99, batch: kb })); solidSeg(...a, ...b, 0.3); }
  // 武家屋敷の長屋門（買った素材 SM_Yakuimon）：土塀の真ん中に、門を通りへ向けて建てる（当たりは土塀のまま。門は飾り）。低では使わない
  if (cgtOn()) whenCgt(() => {
    if (cgtScene() !== rt.scene || rt.over || !rt.def.town) return;
    const kb = new KitBatch();
    for (const sx of [-1, 1]) { const x = sx * 10 + sx * 0.4, z = 52; kb.add('SM_Yakuimon', x, W.heightAt(x, z) - 0.05, z, sx < 0 ? 0 : Math.PI); }   // 門を抜ける向きは部品の x 軸（通りへ向ける）
    rt.scene.add(kb.build());
  });
  // 城：年代と場所に合わせ、土塁・館か石垣・天主を選ぶ。
  {
    for (const s of [[-60, CASTLE_Z + 0.4, -4.5, CASTLE_Z + 0.4], [4.5, CASTLE_Z + 0.4, 60, CASTLE_Z + 0.4]]) {
      if (stoneCastle) addKB(ishigaki(W, [[s[0], s[1]], [s[2], s[3]]], { top: 0.3, batch: kb, scene: rt.scene }));
      else addKB(dorui(W, s, 0, -1, { w: 3, h: 1.8, batch: kb }));
    }
    solidSeg(-60, CASTLE_Z, -4.5, CASTLE_Z, 0.6); solidSeg(4.5, CASTLE_Z, 60, CASTLE_Z, 0.6);
    if (stoneCastle) addKB(yaguramon(W, 0, CASTLE_Z + 1.5, 5, 0, { batch: kb }));
    else rt.scene.add(kabukimon(W, 0, CASTLE_Z + 1.5, 5, 0));
    // 城の前の塀：年代不詳の石塀へ画質だけで置き換えず、土塀でそろえる。
    const wallSegs = [[-55, CASTLE_Z + 3, -6, CASTLE_Z + 3], [6, CASTLE_Z + 3, 55, CASTLE_Z + 3]];
    for (const s of wallSegs) {
      addKB(dobei(W, s, { h: 2.2, batch: kb }));
    }
    // 左右の櫓と当たりは全ての画質で保ち、共通の束で軽く描く
    if (stoneCastle) {
      addKB(sumiyagura(W, -40, CASTLE_Z + 9, { w: 7, d: 6, batch: kb }));
      addKB(sumiyagura(W, 40, CASTLE_Z + 9, { w: 7, d: 6, batch: kb }));
    } else rt.scene.add(yagura(W, -40, CASTLE_Z + 9));
    // 安土の完成後だけ天主を建てる。清洲や建設中の城は館と物見櫓。
    if (azuchi) azuchiTower(rt);
    else {
      rt.scene.add(hut(W, 0, CASTLE_Z + 30, 12, 8, 0, { ita: true }));
      rt.scene.add(yagura(W, 16, CASTLE_Z + 30));
    }
    rt.addInteract('castle-range', { x: 0, z: CASTLE_Z }, '見る　領主の城門', () => rt.say('門番', '領主の城は御用の者だけ。見学はこの門の前まで', 3.5), { r: 3 });
    // 門の内には入れない（城の中は作らない）
    solidSeg(-3, CASTLE_Z + 4, 3, CASTLE_Z + 4, 0.5);
    // 領主の城は見学の範囲外。見えない当たりだけで止めず、門の板戸を閉じる。
    const closed = new THREE.Mesh(box(6, 2.8, .18, 0, W.heightAt(0, CASTLE_Z + 4) + 1.4, CASTLE_Z + 4, 0x503b29), mats().straw);
    rt.scene.add(closed);
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
  if (!WATER_BUCKET) {
    const ring = new THREE.CylinderGeometry(.35, .32, .7, 10, 1, true);
    const water = new THREE.CircleGeometry(.30, 10); water.rotateX(-Math.PI / 2); water.translate(0, .59, 0);
    ring.translate(0, .35, 0);
    WATER_BUCKET = mergeAll([colorize(ring.toNonIndexed(), 0x5a4028), colorize(water.toNonIndexed(), 0x33464b)]);
  }
  for (const [x, z] of [[-4, -22], [4, 4], [-4, 26], [4, -60]]) { const m = new THREE.Mesh(WATER_BUCKET, mats().straw); m.position.set(x, W.heightAt(x, z), z); rt.scene.add(m); solidCircle(x, z, .35); }

  rt.flags.doors = doors;
  // 寺・鍛冶場・高札場・水堀・干し物や樽・遠い町並み（town_life.js）
  buildLife(rt, { sign, chochin, dusk, doors, buildRoom });
  // 中へ入れる店：具足屋・茶屋・鍛冶屋（town_shops.js）
  buildShops(rt, { sign, chochin, doors });
  finishSigns(rt);
  F.merged = mergeStatic(rt, from);
  rt.after(.1, () => { if (!rt.over) trimInteriorCache(rt.scene); });
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
const BUILT_CASTLE = {};
let MYPARTS = BUILT_CASTLE;
// 地図にある家の印を使い、紋の分からない家を織田の紋に置き換えない。
const HOUSE_FLAGS = new Map();
const MY_NAME = ['足軽長屋', '屋敷', '館', '砦', '城'];
function myLevel(G) { return myShiro(G?.japan) != null ? 4 : Math.max(0, Math.min(4, (G && G.rank) || 0)); }
// 曲輪の縁からの距離（外が正）。東の門の口は堀を掘り残す（土橋）
function myD(x, z) { const dx = Math.abs(x - MC.x), dz = Math.abs(z - MC.z); return Math.max(dx - MC.hx, dz - MC.hz, (dx + dz - MC.hx - MC.hz + 2) / Math.SQRT2); }
const myGate = (x, z) => x > MC.x && Math.abs(z - MC.z) < 2.8;
function myH(x, z) {
  if (MYLV < 3 || x > -30 || x < -72 || z < -22 || z > 24) return 0;
  const d = myD(x, z), gate = myGate(x, z);
  let h = 0;
  if (MYLV >= 4) {
    h = 2.2 * sm(0.45, 0.3, d);                        // 城の台（石垣の内）
    if (gate && d > 0) h = Math.max(h, 2.2 * sm(7, 0.4, d));   // 土橋から門へ上る坂
  }
  if (!gate && (MYLV < 4 || MYPARTS.moat)) {
    const hw = MYLV >= 4 ? 2.8 : 2.1, dep = MYLV >= 4 ? 2.4 : 1.5;
    const u = Math.abs(d - MOAT_D) / hw;
    if (u < 1) h -= dep * (1 - u * u);
  }
  // 水堀の縁と土橋を同じ台地へつなぐ。外の土地にはゆるく戻す。
  h += (riseAt(MC.z) - riseAt(z)) * (1 - sm(6.8, 8.5, d));
  return h;
}
// 田の絵（苗の筋）：一度だけ作る
let PADDY = null;
function paddyAssets(season) {
  if (!PADDY) PADDY = new Map();
  if (PADDY.has(season)) return PADDY.get(season);
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  if (season !== '冬') for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const x = 4 + i * 8, y = 4 + j * 8; if (season === '秋') { g.fillRect(x - 1, y - 3, 2, 6); g.fillRect(x, y - 3, 3, 1); } else { g.beginPath(); g.ellipse(x, y, season === '春' ? .8 : 2, season === '春' ? 1.5 : 3, 0, 0, 7); g.fill(); } }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 8); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(6.4, 7.4); geo.rotateX(-Math.PI / 2);
  const ridge = mergeAll([box(7, 0.25, 0.45, 0, 0.1, -3.85, 0x6a5a3c), box(7, 0.25, 0.45, 0, 0.1, 3.85, 0x6a5a3c), box(0.45, 0.25, 7.3, -3.35, 0.1, 0, 0x6a5a3c), box(0.45, 0.25, 7.3, 3.35, 0.1, 0, 0x6a5a3c)]);
  const assets = { geo, ridge, bareMat: new THREE.MeshStandardMaterial({ roughness: .85 }), mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0 }) };
  PADDY.set(season, assets);
  return assets;
}
// 田の置き場（村の道の西）。始めの二枚は村の元からの田、残りは開けば田になる荒れ野
const PADDY_AT = [];
for (const z of [-31, -40, -49, -58]) for (const x of [-49, -57]) if (PADDY_AT.length < 7) PADDY_AT.push([x, z]);

function buildMy(rt, def, list, doors, dusk) {
  const W = rt.world, G = rt.G, F = rt.flags, lv = MYLV;
  const dom = domOf(G);
  const map = MAP_SCENARIOS[G.japan?.scn], owned = myShiro(G.japan);
  const castle = map?.castles.find(c => c.id === owned);
  const clan = map?.clans[G.japan?.own?.[owned]]?.name || G.lordClan || (scenario().faction === 'tokugawa' ? '徳川家' : '織田家');
  const marks = { 織田家: 'oda', 徳川家: 'tokugawa', 武田家: 'takeda', 今川家: 'imagawa', 斎藤家: 'saito', 北条家: 'hojo', 上杉家: 'uesugi', 毛利家: 'mori', 島津家: 'shimazu', 浅井家: 'azai', 朝倉家: 'asakura', 豊臣家: 'toyotomi', 長宗我部家: 'chosokabe', 三好家: 'miyoshi', 大友家: 'otomo', 佐竹家: 'satake', 伊達家: 'date', 真田家: 'sanada', 前田家: 'maeda' };
  const my = F.my = { lv, name: castle ? `${castle.name}の住まい` : MY_NAME[lv], castleName: castle?.name || '', clan, crest: map?.clans[G.japan?.own?.[owned]]?.crest || clan.slice(0, 1), mon: marks[clan] || null, kura: [], yard: null };
  if (castle) sign(rt, `${castle.name}の住まい`, MC.x + MC.hx + 7, 1.2, MC.z + 6, Math.PI / 2, .36, true);
  const x0 = MC.x - MC.hx, x1 = MC.x + MC.hx, z0 = MC.z - MC.hz, z1 = MC.z + MC.hz;
  const gz = MC.z;
  // ---- 路地の入口（通りの西）：道しるべ ----
  sign(rt, `${my.name}へ`, -(ST_W + 0.6), 1.2, LANE_Z - 3.2, Math.PI / 2, 0.36, true);
  if (lv >= 2) rt.scene.add(kabukimon(W, MY_LANE_X + 2.2, LANE_Z, 4.6, Math.PI / 2));
  // ---- 館の囲い ----
  const batch = makeSimpleBatch(), kb = makeKitBatch();   // 柵・土塁と、石垣・土塀・隅櫓を、材質ごとにまとめて描く
  const add = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  // 東の門の口を空けた、曲輪の周り（門の北から時計回りに、門の南まで）
  // 台地の隅を切った架空の曲輪。史実の持ち城の復元とは区別する。
  const ring = (dd) => { const cut = 2 + dd * (2 - Math.SQRT2); return [[x1 + dd, gz + 2.8], [x1 + dd, z1 + dd - cut], [x1 + dd - cut, z1 + dd], [x0 - dd + cut, z1 + dd], [x0 - dd, z1 + dd - cut], [x0 - dd, z0 - dd + cut], [x0 - dd + cut, z0 - dd], [x1 + dd - cut, z0 - dd], [x1 + dd, z0 - dd + cut], [x1 + dd, gz - 2.8]]; };
  const segsOf = (P) => P.slice(0, -1).map((p, i) => [p[0], p[1], P[i + 1][0], P[i + 1][1]]);
  if (lv <= 1) {
    // 我が家・屋敷：低い垣根で庭を囲う
    const yx0 = MC.x - 7, yx1 = MC.x + 6, yz0 = gz - 6, yz1 = gz + 7;
    for (const s of [[yx1, gz + 1.8, yx1, yz1], [yx1, yz1, yx0, yz1], [yx0, yz1, yx0, yz0], [yx0, yz0, yx1, yz0], [yx1, yz0, yx1, gz - 1.8]]) { rt.scene.add(koshisaku(W, s)); solidSeg(...s, 0.2); }
    if (lv === 0) {
      // 足軽長屋：長い一棟を幾つにも仕切り、戸口が並ぶ。前に物干しと薪
      my.room = buildRoom(rt, MC.x - 2.5, gz + 1, { w: 5, d: 4.2, rot: Math.PI / 2, night: dusk, kind: 'nagaya' });
    } else my.room = buildRoom(rt, MC.x - 2.5, gz + 1, { w: 5.4, d: 9, rot: Math.PI / 2, night: dusk });
    if (dom.hatake || lv === 0) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshStandardMaterial({ color: dom.hatake ? 0x55683a : 0x6a5a40, roughness: 1 }));
      g.rotation.x = -Math.PI / 2; g.position.set(MC.x + 3, W.heightAt(MC.x + 3, gz + 4.5) + 0.03, gz + 4.5); g.receiveShadow = true; rt.scene.add(g);
      const crops = [];
      if (dom.hatake) for (const zz of [-1, 0, 1]) { crops.push(box(3.8, .12, .18, 0, .06, zz, 0x6a5a40)); if (def.season !== '冬') for (const xx of [-1.4, -.7, 0, .7, 1.4]) crops.push(cyl(.13, .05, def.season === '秋' ? .35 : .2, xx, .18, zz, def.season === '秋' ? 0xaca052 : 0x526a35, 5)); }
      if (crops.length) { const crop = new THREE.Mesh(mergeAll(crops), mats().straw); crop.position.copy(g.position); rt.scene.add(crop); for (const part of crops) part.dispose(); }
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
      // 自分の城の普請を共通の部品で描く。組み立ては城下に入る時だけ。
      if (MYPARTS.moat) {
        if (!MYPARTS.dry) mizubori(rt, ring(MOAT_D), { width: 6.4, depth: 2.4, y: -0.95 + riseAt(MC.z) });
        for (const s of segsOf(ring(MOAT_D + 2.3))) solidSeg(...s, 0.3);
      }
      if (MYPARTS.stone) add(ishigaki(W, ring(0.55), { out: -1, top: 2.45, kind: 'nozura', batch: kb, scene: rt.scene }));
      // 石垣がまだ無い城は土の台と柵。普請で白壁の石垣に替わる。
      for (const s of segsOf(ring(-0.4))) {
        add(MYPARTS.stone ? dobei(W, s, { h: 2.1, batch: kb }) : palisade(W, s, { h: 2.1, batch }));
        solidSeg(...s, 0.35);
      }
      rt.scene.add(MYPARTS.gate ? yaguramon(W, x1 + 0.2, gz, 5, Math.PI / 2) : kabukimon(W, x1 + 0.2, gz, 5, Math.PI / 2));
      if (MYPARTS.tower) {
        add(sumiyagura(W, x1 - 2.2, z1 - 2.2, { w: 6, d: 5, rot: Math.PI / 2, batch: kb }));
        add(sumiyagura(W, x0 + 2.2, z0 + 2.2, { w: 6, d: 5, rot: Math.PI / 2, batch: kb }));
      }
      // 高い天守は年代・石垣と櫓の普請・領地に合わせる。早い年代は物見櫓。
      //   石垣と同じ束（kb）で描くので、携帯「低」でも描く回数は増えない
      const year = Number((BATTLES[G.battle]?.year || '').match(/\d{4}/)?.[0] || 0);
      const towerReady = year >= 1576 && MYPARTS.tower && MYPARTS.stone;
      const big = towerReady && year >= 1579 && MYPARTS.store && (castle ? castle.type !== 'yama' && (castle.koku || 0) >= 30000 : (dom.koku || 0) >= 300);
      // 戸口を東の庭へ向ける。北向きでは入口の石段が曲輪の塀を横切ってしまう。
      if (towerReady) add(tenshu(W, x0 + 3.2, z1 - 3.0, { rot: Math.PI / 2, floors: big ? 3 : 2, b: 6, base: 1.6, old: true, batch: kb }));
      if (towerReady) { my.tenshu = { x: x0 + 3.2, z: z1 - 3.0 }; my.towerInside = nakaFind(my.tenshu.x, my.tenshu.z); }
      else rt.scene.add(yagura(W, x0 + 3.2, z1 - 3));
    }
    finalizeSimpleBatch(rt, batch); finalizeKitBatch(rt, kb);
    // 主殿は家臣と話せる中を作る。北の隅は天守に空ける。
    my.room = buildRoom(rt, MC.x - 5, gz + (lv >= 4 ? 0 : 1), { w: lv >= 4 && MYPARTS.store ? 7.2 : 6, d: lv >= 4 && MYPARTS.store ? 9 : 7, rot: Math.PI / 2, night: dusk, kind: lv >= 4 && MYPARTS.store ? 'goten' : 'yashiki' });
    // 蔵：砦からは二つ。兵糧を蓄えれば、前に俵が積まれる
    const kuraN = 1 + (lv >= 3 && (lv < 4 || MYPARTS.store) ? 1 : 0);
    for (let i = 0; i < kuraN; i++) {
      const kx = MC.x - 6.5 + i * 5.2, kz = z0 + 3.2;
      rt.scene.add(hut(W, kx, kz, 4.4, 3.6, 0, { ita: true, h: i ? 2.7 : 2.2, wall: i ? 0xd8d0bc : 0x786044 }));
      my.kura.push({ x: kx, z: kz + 2.8 });
      sign(rt, i ? '兵糧蔵' : '納屋', kx, 1.3, kz + 1.85, 0, .32, true);
    }
    my.riceMeshes = [];
    my.riceStock = dom.hyourou || 0;
    const bundles = Math.min(kuraN * 6, Math.ceil(Math.max(0, dom.hyourou || 0) / 10));
    for (let i = 0; i < kuraN; i++) { const n = Math.max(0, Math.min(6, bundles - i * 6)); if (n) { const mesh = tawara(W, MC.x - 6.5 + i * 5.2, z0 + 5.8, 0, n); mesh.userData.noMerge = true; rt.scene.add(mesh); my.riceMeshes.push(mesh); } }
    // 台所の炊ぎの煙：人が住み、飯を炊いている館に見せる
    const smokeY = W.heightAt(MC.x - 8, gz - 1) + (lv >= 4 ? 5.6 : 4.4);
    F.kitchen = { id: W.addSmokeColumn(MC.x - 8, smokeY, gz - 1, { size: .45 }), y: smokeY, visible: F.tod !== 1 };
    if (!F.kitchen.visible) W.removeSmokeColumn(F.kitchen.id);
    // 兵の長屋（砦から）
    if (lv >= 3) my.barracks = buildRoom(rt, x1 - 5.5, z0 + 3.4, { w: 7, d: 4, night: dusk, kind: 'nagaya' });
    // 幟：格が上がるほど多い
    const nb = lv === 2 ? [[x1 + 1.5, gz - 4], [x1 + 1.5, gz + 4]] : [[x1 + 1.5, gz - 4.5], [x1 + 1.5, gz + 4.5], [x1 - 1, z1 - 1], [x1 - 1, z0 + 1], ...(lv >= 4 ? [[x0 + 1, z1 - 1], [x0 + 1, z0 + 1]] : [])];
    for (const [nx, nz] of nb) { const flag = nobori(W, lv >= 4 && nx > x1 ? nx + 5.5 : nx, nz, my.mon || 'maru', 4.6); if (!my.mon) { let material = HOUSE_FLAGS.get(my.clan); if (!material) { const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256; const ink = canvas.getContext('2d'); ink.fillStyle = '#ece6d6'; ink.fillRect(0, 0, 128, 256); ink.fillStyle = '#24201b'; ink.font = '64px serif'; ink.textAlign = 'center'; ink.fillText(my.crest, 64, 140, 110); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; material = flag.userData.flag.material.clone(); material.map = texture; HOUSE_FLAGS.set(my.clan, material); } flag.userData.flag.material = material; } rt.scene.add(flag); }
    { const fx = (lv >= 4 ? x1 + 7.5 : x1 + 2.2); for (const s2 of [-1, 1]) { rt.scene.add(kagaribi(W, fx, gz + s2 * 3.4)); if (dusk) W.addFire(fx, gz + s2 * 3.4, { torch: true }); } }
    my.gate = { x: x1 + (lv >= 4 ? 8 : lv >= 3 ? 7 : 2.6), z: gz };
    my.yard = { x: x1 - 5, z: gz + 1 };
  }
  sign(rt, String(G.name || '我が家').replace(/　|\s/g, '').slice(0, 4) + 'の家', my.gate.x + .8, 1.2, gz + 3.6, Math.PI / 2, .36, true);
  sign(rt, my.name, my.gate.x + 0.8, 1.2, gz - 3.6, Math.PI / 2, 0.36, true);
  doors.yashiki = my.gate;
  if (my.castleName) rt.addInteract('mycastle-name', { x: my.gate.x, z: my.gate.z + 6 }, '見る　持ち城の名', () => rt.say('', `持ち城は${my.castleName}。ここは仮の囲い。主殿と物見は元からの建物。堀・石垣・櫓・門・増築の蔵は自分の普請。天守は石垣と櫓を築いた後の姿で、史実の復元ではない`, 3.5), { r: 2.2 });

  // 鎮守の社は板壁と控えめな屋根。寺の仏壇と区別する。
  buildRoom(rt, -58.5, LANE_Z, { w: 3.2, d: 3.6, rot: Math.PI / 2, kind: 'shrine' });
  sign(rt, '鎮守', -55.8, 1.1, LANE_Z - 1.3, Math.PI / 2, .36, true);
  {
    const tx = -53.2, y = W.heightAt(tx, LANE_Z);
    const g = mergeAll([cyl(0.16, 0.18, 3.2, 0, 1.6, -1.4, 0x9a3a24, 8), cyl(0.16, 0.18, 3.2, 0, 1.6, 1.4, 0x9a3a24, 8), box(0.3, 0.22, 4.0, 0, 3.25, 0, 0x2a2420), box(0.22, 0.18, 3.4, 0, 2.7, 0, 0x9a3a24)]);
    const m = new THREE.Mesh(g, mats().straw); m.position.set(tx, y, LANE_Z); m.castShadow = true; rt.scene.add(m);
    solidRect(tx, LANE_Z - 1.4, 0.4, 0.4); solidRect(tx, LANE_Z + 1.4, 0.4, 0.4);
  }
  my.yashiro = { x: -54.5, z: LANE_Z };
  buildVillage(rt, def);
}


// 村だけを設営し直す。城・通り・近い兵の仕組みは作り直さない。
function buildVillage(rt, def) {
  const W = rt.world, F = rt.flags, my = F.my, dom = domOf(rt.G), list = [], homes = [];
  finishSigns(rt);
  const before = rt.scene.children.length, solidStart = SOLIDS.length;
  my.villageSmoke = [];
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
  // ---- 村の家並み（町を開くほど増える）。始めの一軒は、鉄砲鍛冶を呼べば鍛冶場 ----
  const nH = Math.min(8, 2 + Math.floor(machi * 1.4));
  let z = LANE_Z - 6.5;
  const NOR = [0x2b3f5c, 0x7a3b22, 0x4f4030, 0x5a2a24, 0x3a4a3a];
  for (let i = 0; i < nH && z > GATE_Z + 6; i++) {
    const w = i % 3 === 1 ? 6.5 : 5;
    const home = { x: MY_LANE_X - 2.3 - D / 2, z: z - w / 2, rot: Math.PI / 2, w, noren: NOR[i % NOR.length], shade: 0.82 + (i % 4) * 0.05 };
    homes.push(home);
    if (i === 0 && dom.gunsmith) forge(rt, home);
    else list.push(home);
    if (i === 0) my.kaji = { x: MY_LANE_X - 1.5, z: z - w / 2 };
    z -= w + 0.3;
  }
  if (dom.gunsmith && my.kaji) {
    sign(rt, '鍛冶', MY_LANE_X - 2.0, 3.4, my.kaji.z, Math.PI / 2, 0.5);
    const home = homes[0];
    my.villageSmoke.push(W.addSmokeColumn(home.x, W.heightAt(home.x, home.z) + 3.1, home.z, { size: .7 }));
  } else my.kaji = null;
  if (machi >= 2 && homes[2]) { const home = homes[2]; const x = home.x - 1.2, z = home.z - home.w * .25; my.villageSmoke.push(W.addSmokeColumn(x, W.heightAt(x, z) + 5.2, z, { size: .5 })); }
  // ---- 田：元からの二枚＋開いた枚数。残りは荒れ野。季節で色が変わる ----
  {
    const P = paddyAssets(def.season);
    const nTa = Math.min(PADDY_AT.length, 2 + Math.min(5, dom.ta || 0));
    const sea = def.season;
    const col = sea === '秋' ? 0xd8b860 : sea === '冬' ? 0x8a7c62 : sea === '春' ? 0x9ab0b0 : 0x7aa050;
    const im = new THREE.InstancedMesh(P.geo, P.mat, nTa && sea !== '冬' ? nTa : 1);
    const bare = new THREE.InstancedMesh(P.geo, P.bareMat, PADDY_AT.length);
    const rim = new THREE.InstancedMesh(P.ridge, mats().straw, nTa);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    PADDY_AT.forEach(([px, pz], i) => {
      const y = W.heightAt(px, pz);
      m4.makeTranslation(px, y + .04, pz); bare.setMatrixAt(i, m4); if (i < nTa) rim.setMatrixAt(i, m4);
      bare.setColorAt(i, c.set(i < nTa ? col : 0x6e6446));
      if (i < nTa && sea !== '冬') { m4.makeTranslation(px, y + .045, pz); im.setMatrixAt(i, m4); im.setColorAt(i, c.set(col)); }
    });
    im.receiveShadow = true; rim.castShadow = true; rim.receiveShadow = true;
    im.visible = sea !== '冬'; im.count = sea === '冬' ? 0 : nTa;
    rt.scene.add(bare, im, rim);
    my.ta = nTa;
  }
  my.villageHomes = homes.filter((_, i) => i || !dom.gunsmith);
  placeMachiya(rt, list);
  finishSigns(rt);
  mergeStatic(rt, before);
  my.villageMeshes = rt.scene.children.slice(before);
  for (const mesh of my.villageMeshes) mesh.userData.noMerge = true;
  my.villageSolids = SOLIDS.slice(solidStart);
  my.villageState = `${dom.machi}:${dom.ta}:${dom.gunsmith}`;
}
function forge(rt, home) {
  const y = rt.world.heightAt(home.x, home.z), g = [];
  g.push(box(D, .12, home.w, 0, 3, 0, 0x594532));
  g.push(box(.12, 2.8, home.w, -D / 2, 1.4, 0, 0x5a4634));
  for (const z of [-home.w / 2, home.w / 2]) g.push(box(D, 2.8, .12, 0, 1.4, z, 0x5a4634));
  for (const z of [-home.w / 2, home.w / 2]) g.push(box(.16, 3, .16, D / 2, 1.5, z, 0x3a2c20));
  g.push(box(.9, .65, .9, 0, .325, 0, 0x78644e), box(.45, .2, .3, 1.2, .7, 0, 0x34312c));
  const m = new THREE.Mesh(mergeAll(g), mats().straw); m.position.set(home.x, y, home.z); m.castShadow = true; rt.scene.add(m);
  solidRect(home.x - D / 2, home.z, .16, home.w);
  for (const z of [-home.w / 2, home.w / 2]) solidRect(home.x, home.z + z, D, .16);
  solidRect(home.x, home.z, .9, .9); solidRect(home.x + 1.2, home.z, .45, .3);
}
function refreshVillage(rt, def) {
  const my = rt.flags.my, dom = domOf(rt.G);
  if (my.riceMeshes && my.riceStock !== (dom.hyourou || 0)) {
    for (const mesh of my.riceMeshes) rt.scene.remove(mesh);
    my.riceMeshes.length = 0; my.riceStock = dom.hyourou || 0;
    const bundles = Math.min(my.kura.length * 6, Math.ceil(Math.max(0, my.riceStock) / 10));
    for (let i = 0; i < my.kura.length; i++) { const n = Math.max(0, Math.min(6, bundles - i * 6)); if (n) { const mesh = tawara(rt.world, my.kura[i].x, my.kura[i].z + .6, 0, n); mesh.userData.noMerge = true; rt.scene.add(mesh); my.riceMeshes.push(mesh); } }
  }
  const changed = my.villageState !== `${dom.machi}:${dom.ta}:${dom.gunsmith}`;
  if (changed) {
    for (const mesh of my.villageMeshes) rt.scene.remove(mesh);
    for (const id of my.villageSmoke) rt.world.removeSmokeColumn(id);
    for (const solid of my.villageSolids) { const i = SOLIDS.indexOf(solid); if (i >= 0) SOLIDS.splice(i, 1); }
    const oldHomes = my.villageHomes;
    buildVillage(rt, def);
    rt.flags.backPts = rt.flags.backPts.filter(p => !oldHomes.some(h => h.x === p.x && h.z === p.z));
    rt.flags.doorPts = rt.flags.doorPts.filter(p => !oldHomes.some(h => Math.abs(p.x - (h.x + D / 2 + .55)) < .01 && Math.abs(p.z - (h.z + h.w * .2)) < .01));
    for (const h of my.villageHomes) { rt.flags.backPts.push({ x: h.x, z: h.z, fx: h.x + D / 2 + 1.6, fz: h.z }); rt.flags.doorPts.push({ x: h.x + D / 2 + .55, z: h.z + h.w * .2, h: h.rot }); }
  }
  const state = `${dom.hei}:${dom.ren}:${dom.hyourou}:${keraiOf(rt.G).filter(k => k.alive).map(k => k.name + ':' + k.role).join(',')}`;
  if (changed || my.peopleState !== state) {
    for (const g of my.peopleGroups || []) { for (const u of g.units) { u.alive = false; if (u.mesh) rt.scene.remove(u.mesh); if (u.blob) rt.scene.remove(u.blob); const i = rt.army.units.indexOf(u); if (i >= 0) rt.army.units.splice(i, 1); } const i = rt.army.groups.indexOf(g); if (i >= 0) rt.army.groups.splice(i, 1); }
    rt.flags.folk = rt.flags.folk.filter(p => !my.peopleGroups?.includes(p.g));
    const ids = my.peopleInteracts || [];
    for (let i = rt.interacts.length - 1; i >= 0; i--) if (ids.includes(rt.interacts[i])) rt.interacts.splice(i, 1);
    myPeople(rt); prepareWays(rt, def);
  }
}

// ---- 我が村の人：田の百姓・市の売り手・鍛冶・社の神主・庭の兵と家臣 ----
function talkPoint(rt, u, P = u, ox = 0, oz = 0) {
  const player = rt.player.u;
  if (rt.flags.heat || !u.alive || u.downed || P.away || !player.alive || Math.abs(player.pos.y - u.pos.y) > 1.2 || interiorBlocked(INTERIOR_WALLS, player.pos, u.pos)) return null;
  const q = P.townTalkPoint || (P.townTalkPoint = { x: 0, y: 0, z: 0 });
  if (!townLineClear(rt, player.pos, u.pos, 0)) return null;
  q.x = u.pos.x + ox; q.y = u.pos.y; q.z = u.pos.z + oz;
  return q;
}
function fixedTalk(rt, u, seconds = 4) {
  if (rt.choice || rt.t < (u.townTalkAt || 0) || !talkPoint(rt, u)) return false;
  u.townTalkAt = rt.t + Math.max(8, seconds);
  u.heading = Math.atan2(rt.player.u.pos.x - u.pos.x, rt.player.u.pos.z - u.pos.z);
  return true;
}
function stopTalk(rt, P, seconds) {
  if (rt.choice || rt.t < (P.nextTalkAt || 0) || !talkPoint(rt, P.u, P)) return false;
  P.nextTalkAt = rt.t + Math.max(8, seconds);
  const g = P.g, u = P.u;
  P.talkT = seconds; g.order = 'hold'; g.dest = null;
  g.anchor.x = u.pos.x; g.anchor.z = u.pos.z;
  u.heading = Math.atan2(rt.player.u.pos.x - u.pos.x, rt.player.u.pos.z - u.pos.z);
  g.facing = u.heading;
  return true;
}

function defFarmerLine(rt, dom) {
  const season = rt.def.season;
  const work = season === '冬' ? '今は田を休ませ、畦を直しております' : season === '秋' ? '実りを刈り取る季節です' : season === '夏' ? '稲が育っております' : '苗を植える季節です';
  return `殿が開いた田は${dom.ta}枚。${work}`;
}
function myPeople(rt) {
  const F = rt.flags, my = F.my, dom = domOf(rt.G);
  if (!my) return;
  const one = (name, x, z, h, type = 'porter', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing: h, order: 'hold', noRout: true, width: 1, speed: 0.9, march: false, aggro: 0, seekRange: 0 },
      [{ type, n: 1, o: { flag: null, invuln: true, ...o } }]);
    return g.units[0] ? { g, u: g.units[0] } : null;
  };
  const groupStart = rt.army.groups.length, interactStart = rt.interacts.length;
  // 百姓：田のあいだを歩き、立ち止まって働く（田が多いほど人も多い）
  const route = [];
  for (let i = 0; i <= Math.ceil(my.ta / 2); i++) { const z = -26.5 - i * 9; route.push([-44.7, z], [-62, z]); }
  const nF = route.length ? Math.min(3, 1 + Math.floor(my.ta / 3)) : 0;
  for (let i = 0; i < nF; i++) {
    const [x, z] = route[(i * 2) % route.length];
    const r = one('百姓', x, z, 0);
    if (!r) continue;
    dress(rt, r.u, 'townsman', 30 + i);
    r.u.name = '百姓';
    const P = { g: r.g, u: r.u, kind: 'townsman', i: 30 + i, pts: route, wp: (i * 2) % route.length, waitT: 3 + i * 2, talkT: 0, said: 0, farmer: true };
    F.folk.push(P);
    rt.addInteract('farmer' + i, () => talkPoint(rt, r.u, P), '話す　百姓', () => {
      if (!stopTalk(rt, P, 5)) return;
      const L = dom.ta ? [defFarmerLine(rt, dom), '年貢はちゃんと納めますで、戦の時はお守りくだされ'] : ['田がもう少しあれば、年貢も増やせるんじゃが……', '南の荒れ野を拓けば、良い田になりますぞ'];
      rt.say('百姓', L[(P.said++) % L.length], 4);
    }, { r: 2.4 });
  }
  // 市の売り手（露店の半分に）
  my.stalls.filter((_, i) => i % 2 === 0).slice(0, 2).forEach((s, i) => {
    const h = s.rot + Math.PI;
    const r = one('売り手', s.x - Math.sin(s.rot) * 1.1, s.z - Math.cos(s.rot) * 1.1, h);
    if (!r) return;
    dress(rt, r.u, 'merchant', 40 + i);
    r.u.name = '売り手';
    const P = { g: r.g, u: r.u, kind: 'merchant', i: 40 + i, fixed: true, when: [0], home: { x: r.u.pos.x, z: r.u.pos.z }, talkT: 0, said: 0 };
    F.folk.push(P);
    rt.addInteract('myshop' + i, () => talkPoint(rt, r.u, P), '買い物する　村の売り手', () => { if (!fixedTalk(rt, r.u)) return; rt.choose(`売り手：${rt.def.season === '冬' ? '干した菜' : rt.def.season === '秋' ? '採れた米' : '季節の菜'}があります。収穫の売り買いもできます`, [{ label: '買わずに離れる' }, { label: '市の売り買いをする' }], k => { if (k === 1 && !rt.flags.heat) townTrade(rt); }, 20); }, { r: 2.6 });
  });
  // 鍛冶（鉄砲鍛冶を呼んでいれば、戸口で鉄を打つ）
  if (my.kaji) {
    const r = one('鍛冶', my.kaji.x - 0.6, my.kaji.z, Math.PI / 2);
    if (r) {
      rt.addInteract('mykaji-talk', () => talkPoint(rt, r.u), '話す　我が村の鍛冶', () => { if (!fixedTalk(rt, r.u)) return; rt.say('鍛冶', `鍛冶場は${dom.gunsmith}か所。鉄砲は手勢の半分まで持たせます。館の内政で増やせます`, 4); }, { r: 2.2 });
      dress(rt, r.u, 'townsman', 50); r.u.name = '鍛冶'; F.folk.push({ g: r.g, u: r.u, kind: 'townsman', i: 50, fixed: true, when: [1, 2], home: { x: r.u.pos.x, z: r.u.pos.z }, talkT: 0, said: 0 }); }
  }
  // 庭の兵：兵を集めた分だけ（多くて四人）。城と砦では二人が門を守る
  const nH = my.lv >= 2 ? Math.min(4, Math.ceil((dom.hei || 0) / 3)) : 0;
  for (let i = 0; i < nH; i++) {
    const guard = my.lv >= 3 && i < 2;
    const x = guard ? my.gate.x - 1.2 : my.yard.x + 1.5 - (i % 2) * 2.2, z = guard ? MC.z + (i ? 3.2 : -3.2) : my.yard.z - 3 + Math.floor(i / 2) * 2.4;
    const r = one('我が兵', x, z, guard ? Math.PI / 2 : -Math.PI / 2, 'ashigaru', guard ? { hat: 'jingasa' } : { hat: 'jingasa', weapon: 'none' });
    if (!r) continue;
    let watch = null;
    if (guard && i === 1) { const barracks = [MC.x + MC.hx - 5.5, MC.z - MC.hz + 6]; F.folk.push(watch = { g: r.g, u: r.u, kind: 'samurai', i: 80, pts: [[x, z], [x, MC.z], [MC.x + MC.hx - 1.8, MC.z], [MC.x + MC.hx - 1.8, barracks[1]], barracks], wp: 0, dir: 1, seq: true, endWait: 35, waitT: 35, talkT: 0, said: 0 }); }
    rt.addInteract('myhei' + i, () => talkPoint(rt, r.u), '話す　我が兵', () => { if (!(watch ? stopTalk(rt, watch, 4) : fixedTalk(rt, r.u))) return; rt.say('兵', guard ? `${my.name}の門を守ります。手勢は${dom.hei}人。調練は${dom.ren}段、強さは${dom.ren * 8}％増しまする` : dom.ren ? `調練は${dom.ren}段。次の戦では手勢の強さが${dom.ren * 8}％増しまする` : `手勢は${dom.hei}人。庭にいるのは、その一部でござる`, 3.5); }, { r: 2.2 });
  }
  // 家臣は主殿の中で待つ。戸口から廊下を通って話せる。
  if (my.lv >= 1) {
    keraiOf(rt.G).filter((k) => k.alive).slice(0, 3).forEach((k, i) => {
      const rooms = my.room.layout.rooms;
      const room = k.role === 'shisha' ? rooms.find(r => /玄関|広間|廊下/.test(r.name)) || rooms[0] : k.role === 'tegei' || k.role === 'kumi' ? rooms.find(r => /土間|廊下/.test(r.name)) || rooms[0] : rooms[0];
      const at = my.room.P((room.x0 + room.x1) / 2, room.z0 + (room.z1 - room.z0) * (.35 + i * .15));
      const r = one('家臣', at.x, at.z, i === 0 ? my.room.inside.rot + Math.PI : i === 1 ? Math.PI : 0, 'samurai', { name: k.name, weapon: 'none' });
      if (r) r.u.pos.y = my.room.y + (room.y || 0);
      if (!r) return;
      rt.addInteract('mykerai' + i, () => talkPoint(rt, r.u), `話す　${k.name}`, () => {
        if (!k.alive || !fixedTalk(rt, r.u)) return;
        const last = (rt.G.history || []).slice(0, rt.G.battle).filter(Boolean).at(-1)?.workers?.find(w => w.role === '家臣' && w.name === k.name);
        rt.say(k.name, last ? `前の戦で${last.kills || 0}人を討ち取り、無事に戻りました` : i === 1 ? `兵糧の帳面を調べております。蓄えは${dom.hyourou}石です` : k.role === 'shisha' ? '使者の支度を整えております' : k.loy >= 70 ? `この${my.name}、留守はお任せくだされ` : k.loy < 40 ? '……殿への忠義が揺らいでおります。家臣の札で様子をご覧くだされ' : 'お呼びとあらば、すぐに参上いたす', 4);
      }, { r: 2.2 });
    });
  }
  // 用のある往来：館が育つと、町と館のあいだを人が行き来する（決まった道を順にたどる。tick の P.seq）
  //   館から：問屋の荷を館へ運ぶ人足（兵糧を蓄えるか六十石から）。砦から：上官屋敷へ登城する家中の侍
  const gx = my.gate.x + 1.6;
  const walker = (name, type, kind, pts, o, lines, i) => {
    const r = one(name, pts[0][0], pts[0][1], 0, type, o);
    if (!r) return;
    if (type === 'porter') dress(rt, r.u, 'townsman', 60 + i);
    r.u.name = name;
    const P = { g: r.g, u: r.u, kind, i: 60 + i, pts, wp: 0, dir: 1, seq: true, endWait: 5 + i * 3, waitT: 1 + i * 4, talkT: 0, said: 0 };
    F.folk.push(P);
    rt.addInteract('myway' + i, () => talkPoint(rt, r.u, P), `話す　${name}`, () => {
      if (!stopTalk(rt, P, 4)) return;
      rt.say(name, lines[(P.said++) % lines.length], 4);
    }, { r: 2.2 });
  };
  if (my.lv >= 2 && (dom.hyourou || (dom.koku || 0) >= 60)) {
    const toiya = [[-3.2, -10], [-3.2, -21.5], [-18, -22], [MY_LANE_X, -21.5], [MY_LANE_X, -8], [gx, MC.z], [MC.x + MC.hx - 2, MC.z], [MC.x + MC.hx - 2, MC.z - 5], [my.kura[0].x, MC.z - 5], [my.kura[0].x, my.kura[0].z + .6]];
    walker('人足', 'porter', 'townsman', toiya, {}, [`問屋の米を${my.name}の蔵へ運んでおりやす`, '殿の蔵は重い荷ばかりで、腰がもちませんわ'], 0);
    if (my.lv >= 4) walker('人足', 'porter', 'townsman', toiya.slice().reverse(), {}, ['城の御用で、問屋へ銭を受け取りに参りやす'], 1);
  }
  if (my.lv >= 3) {
    const tojo = [[gx, MC.z + 2.4], [MY_LANE_X, MC.z + 2.4], [MY_LANE_X, 14], [MY_LANE_X, CROSS_Z - 3], [-30.5, CROSS_Z + 1], [-30, CROSS_Z + ST_W + 0.6]];
    walker('家中の侍', 'samurai', 'samurai', tojo, { weapon: 'none' }, [`上官屋敷へ、${my.name}の様子を申し上げに参る`, '殿の名が上がれば、我らも鼻が高うござる'], 2);
    if (my.lv >= 4) walker('家中の侍', 'samurai', 'samurai', tojo.slice().reverse(), { weapon: 'none' }, ['登城の帰りでござる。上の方々も殿の城を噂しておられた'], 3);
  }
  my.peopleGroups = rt.army.groups.slice(groupStart);
  my.peopleInteracts = rt.interacts.slice(interactStart);
  my.peopleState = `${dom.hei}:${dom.ren}:${dom.hyourou}:${keraiOf(rt.G).filter(k => k.alive).map(k => k.name + ':' + k.role).join(',')}`;
}

// ---- 我が村で見る・調べる所 ----
function myGuide(rt) {
  const my = rt.flags.my, G = rt.G, dom = domOf(G), game = rt.game;
  if (!my) return;
  rt.addInteract('door-yashiki', { x: my.gate.x, z: my.gate.z }, `支度する　${my.name}（知行の札）`, () => game.townOpen('realm'), { r: 3.2 });
  // 武功帳：館の戸口の脇（手柄を読み返す）。手柄がある時だけ
  if ((G.deeds || []).length) rt.addInteract('my-deeds', { x: my.gate.x, z: my.gate.z + 6.4 }, '見る　武功帳（これまでの手柄）', () => game.townOpen('realm', { deeds: true }), { r: 2.2 });
  // 主殿の戸口：家臣の事（召し抱え・褒美）。蔵は内政、使者の間は外交（知行の札のその欄を開く）
  if (my.lv >= 1) rt.addInteract('my-shuden', my.room.P(0, my.room.d / 2 + .8), '家臣の札を開く（中へは戸口から）', () => game.townOpen('realm', { focus: 1 }), { r: 2.2 });
  for (const [i, k] of my.kura.entries()) {
    rt.addInteract('mykura' + i, k, i ? '見る　兵糧蔵' : '見る　納屋', () => { if (rt.flags.heat) { rt.bark('手配中は蔵を使えない。捕り方から離れて騒ぎを収めよう'); return; } if (rt.choice) return; rt.choose(`${i ? '増築した蔵。蓄えを分けて守る' : '元からの納屋。普段の道具を置く'}。兵糧は全ての蔵で${domOf(G).hyourou || 0}石${domOf(G).hyourou ? '。俵は蓄えの目安' : '。今は空'}`, [{ label: '閉じる' }, { label: '内政の札を開く' }], k => { if (k === 1) game.townOpen('realm', { focus: 0 }); }, 20); }, { r: 2.4 });
  }
  let fieldReadyAt = 0;
  rt.addInteract('myta', { x: MY_LANE_X - 2, z: -36 }, '見る　我が田', () => {
    if (rt.choice || rt.t < fieldReadyAt) return;
    fieldReadyAt = rt.t + 8;
    const card = domainCards(G).find((c) => c.id === 'kaikon');
    const work = domainWork(G);
    const hint = G.rank < 2 ? '足軽組頭になれば、知行を賜り田を開ける' : dom.ta >= 5 ? '開ける田は5枚まで。今ある田を守ろう' : !work.left ? '出陣までの内政は済んだ。次の戦の後に田を開ける' : card && (G.kan || 0) < 3 ? '田を開くには3貫必要。銭を蓄えよう' : card ? `${my.name}の内政で「${card.name}」。3貫必要。内政はあと${work.left}回` : '館の内政で支度を確かめよう';
    rt.say('', `殿が開いた田は${dom.ta}枚。周りの田を合わせて${my.ta}枚見える。${hint}`, 4.5);
  }, { r: 3 });
  rt.addInteract('my-market', { x: MY_LANE_X - 2, z: LANE_Z }, '見る　村の市と家', () => { if (!rt.choice && !rt.flags.heat) rt.say('村の売り手', `開いた市は${dom.machi || 0}か所。路地の${my.stalls.length}軒の露店でまとめて示す。市が増えると商人が来て家も増える`, 5); }, { r: 2.5 });
  let prayerReadyAt = 0;
  rt.addInteract('myyashiro', () => { const it = rt.interacts.find(it => it.id === 'myyashiro'); if (it) it.label = rt.flags.heat ? '祈れない　手配中' : rt.flags.prayed ? '祈る　鎮守の社' : '祈る　鎮守の社（息が戻る）'; return my.yashiro; }, '祈る　鎮守の社（初めは息が戻る）', () => {
    if (rt.flags.heat) { rt.bark('手配中は祈れない。捕り方から離れて騒ぎを収めよう'); return; }
    if (rt.choice || rt.t < prayerReadyAt) return;
    prayerReadyAt = rt.t + 8;
    if (!rt.flags.prayed) { rt.flags.prayed = true; const prayer = rt.interacts.find((it) => it.id === 'myyashiro'); if (prayer) prayer.label = '祈る　鎮守の社（無事を祈る）'; if (rt.player.breath != null) rt.player.breath = rt.player.maxBreath || 100; rt.say('', `手を合わせた。心が静まり、息が整った。残りの息は${Math.round(rt.player.breath || 0)}／${rt.player.maxBreath || 100}`, 3.5); }
    else rt.say('', '村の鎮守。戦の無事を祈る', 3);
  }, { r: 2.8 });
}

// 通れる所の判定。町を建てた時の当たりを使い、座標の箱は作らない。
function townPointClear(rt, x, z, y, pad = .45) {
  for (const w of SOLIDS) {
    if (x < w.x0 - pad || x > w.x1 + pad || z < w.z0 - pad || z > w.z1 + pad || (w.yTop != null && y >= w.yTop) || (w.yBot != null && y + 1 < w.yBot)) continue;
    if (w.k === 'r') {
      const dx = x - w.x, dz = z - w.z;
      if (Math.abs(dx * w.c - dz * w.s) < w.hw + pad && Math.abs(dx * w.s + dz * w.c) < w.hd + pad) return false;
    } else if (w.k === 'c') {
      if (Math.hypot(x - w.x, z - w.z) < w.r + pad) return false;
    } else if (w.k === 's') {
      const dx = w.bx - w.ax, dz = w.bz - w.az;
      const t = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - w.ax - t * dx, z - w.az - t * dz) < w.r + pad) return false;
    }
  }
  return true;
}
function townLineClear(rt, a, b, pad = .45) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const y = pad === 0 ? a.y + (b.y - a.y) * t + 1.2 : rt.world.heightAt(x, z);
    if (!townPointClear(rt, x, z, y, pad)) return false;
  }
  return true;
}
function prepareWays(rt, def) {
  const F = rt.flags, nodes = [];
  const add = (x, z) => {
    const y = rt.world.heightAt(x, z);
    if (townPointClear(rt, x, z, y) && !nodes.some((p) => Math.hypot(p.x - x, p.z - z) < .3)) nodes.push({ x, z, y, links: [] });
  };
  for (const path of def.world.paths) for (let j = 1; j < path.length; j++) {
    const a = path[j - 1], b = path[j], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (let k = 0; k <= n; k++) add(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
  }
  for (const p of WALK) add(p[0], p[1]);
  for (const p of F.backPts || []) add(p.fx, p.fz);
  for (const d of Object.values(F.doors)) add(d.x, d.z);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) <= 18 && Math.abs(a.y - b.y) < 1.2 && townLineClear(rt, a, b)) { a.links.push(j); b.links.push(i); }
  }
  F.doorList = Object.values(F.doors);
  F.ways = nodes; F.townKey = `${def.place}:${rt.G.battle}:${MYLV}:${F.tod}:${Object.keys(MYPARTS).filter(k => MYPARTS[k]).sort().join(',')}:${domOf(rt.G).machi || 0}:${domOf(rt.G).ta || 0}`;
  const routes = new Map();
  for (const P of F.folk) {
    const pts = P.pts || WALK;
    if (!routes.has(pts)) routes.set(pts, pts.map((a, i) => pts.reduce((out, b, j) => {
      if (i !== j && (!P.farmer || a[0] === b[0] || a[1] === b[1]) && Math.hypot(a[0] - b[0], a[1] - b[1]) < 26 && townLineClear(rt, { x: a[0], z: a[1] }, { x: b[0], z: b[1] })) out.push(j);
      return out;
    }, [])));
    P.neighbors = routes.get(pts); P.townDest = { x: P.u.pos.x, z: P.u.pos.z };
    P.lastX = P.u.pos.x; P.lastZ = P.u.pos.z; P.stuckT = 0;
  }
}
function townRoute(rt, door, p = rt.player.u.pos) {
  const nodes = rt.flags.ways;
  if (townLineClear(rt, p, door)) return [{ x: door.x, z: door.z, y: rt.world.heightAt(door.x, door.z) }];
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  for (let i = 0; i < nodes.length; i++) if (townLineClear(rt, p, nodes[i])) dist[i] = Math.hypot(p.x - nodes[i].x, p.z - nodes[i].z);
  let end = -1;
  for (let k = 0; k < nodes.length; k++) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && Number.isFinite(dist[i]) && (at < 0 || dist[i] < dist[at])) at = i;
    if (at < 0) break;
    done[at] = true;
    if (townLineClear(rt, nodes[at], door)) { end = at; break; }
    for (const j of nodes[at].links) {
      const d = dist[at] + Math.hypot(nodes[at].x - nodes[j].x, nodes[at].z - nodes[j].z);
      if (d < dist[j]) { dist[j] = d; prev[j] = at; }
    }
  }
  const route = [];
  for (let i = end; i >= 0; i = prev[i]) route.unshift(nodes[i]);
  if (end >= 0) route.push({ x: door.x, z: door.z, y: rt.world.heightAt(door.x, door.z) });
  return route;
}
function restoreDoor(rt) {
  const memo = rt.game.townDoor;
  if (!memo || memo.G !== rt.G || memo.key !== rt.flags.townKey || !townPointClear(rt, memo.x, memo.z, rt.world.heightAt(memo.x, memo.z))) return;
  rt.player.u.pos.set(memo.x, rt.world.heightAt(memo.x, memo.z), memo.z);
  rt.player.u.heading = memo.heading;
  rt.player.yaw = memo.heading; rt.player.camYawOff = 0;
  rt.player.vel.x = rt.player.vel.y = rt.player.vel.z = 0;
  rt.player.u.vel.x = rt.player.u.vel.y = rt.player.u.vel.z = 0;
  if (rt.player.u.push) { rt.player.u.push.x = 0; rt.player.u.push.z = 0; }
  if (rt.player.u.mesh) rt.player.u.mesh.position.copy(rt.player.u.pos);
}
function doorTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.doorCheckAt || 0)) return;
  F.doorCheckAt = rt.t + .5;
  const p = rt.player.u.pos;
  if (F.heat || rt.choice || Math.abs(p.y - rt.world.heightAt(p.x, p.z)) > .6 || !townPointClear(rt, p.x, p.z, p.y)) return;
  for (const d of F.doorList) if (Math.hypot(p.x - d.x, p.z - d.z) < 2.5) {
    const memo = rt.game.townDoor || (rt.game.townDoor = {});
    memo.G = rt.G; memo.key = F.townKey; memo.x = p.x; memo.z = p.z; memo.heading = rt.player.u.heading;
    if (!rt.game.townDoorHelp && !rt.hud.subT && !rt.hud.subQ.length) {
      rt.game.townDoorHelp = true;
      rt.say('', '戸口では支度の札を開ける。建物の中へは「中へ入る」を選ぶ', 3);
    }
    break;
  }
}

// ---- 札から「町を歩いて行く」：道しるべを出す ----
const GO_NAME = { nagaya: '組の長屋', realm: '我が館', boss: '上官屋敷', squad: '組の長屋', shop: '武具屋', toiya: '問屋', train: '訓練場', inn: '宿', stable: '馬屋' };
function guideTo(rt, tab) {
  const D0 = rt.flags.doors || {};
  const d = tab === 'realm' ? D0.yashiki : D0[tab === 'nagaya' ? 'squad' : tab];
  rt.flags.goTo = null; rt.unmark('mk-go'); rt.objRemove('go');
  if (!d) { rt.bark('この施設はまだない。別の行き先を選んでください'); return; }
  const n = tab === 'realm' && rt.flags.my ? rt.flags.my.name : GO_NAME[tab] || '';
  const inside = nakaRoomAt(rt.player.u.pos.x, rt.player.u.pos.z, rt.player.u.pos.y);
  const exit = inside ? inside.I.doorOut : null;
  const route = exit ? [{ x: exit.x, z: exit.z, y: inside.I.levels[0].y }] : townRoute(rt, d);
  if (!route.length) { rt.bark('近くの通りへ出てから、行き先を選んでください'); return; }
  rt.flags.goTo = { x: d.x, z: d.z, name: n, y: rt.world.heightAt(d.x, d.z), route, step: 0, exiting: !!exit, tab };
  if (tab === 'realm') rt.unmark('mk-my');
  const go = rt.flags.goTo;
  rt.marker('mk-go', () => go.route[go.step], exit ? '外へ出る戸口' : route.length > 1 ? `${n}へ向かう道` : n);
  rt.obj('go', `${n}へ・地図の印をたどる`, 'side');
  rt.bark(`${n}へ。小さな地図の印をたどる`);
}
function goTick(rt) {
  const g = rt.flags.goTo;
  if (!g) return;
  const p = rt.player.u.pos;
  if (g.exiting) { if (!nakaRoomAt(p.x, p.z, p.y)) guideTo(rt, g.tab); return; }
  const next = g.route[g.step];
  if (g.step < g.route.length - 1 && Math.hypot(p.x - next.x, p.z - next.z) < 2 && Math.abs(p.y - next.y) < 1.2) { g.step++; rt.marker('mk-go', () => g.route[g.step], g.step < g.route.length - 1 ? `${g.name}へ向かう道` : g.name); }
  if (Math.hypot(p.x - g.x, p.z - g.z) < 2 && Math.abs(p.y - g.y) < 1.2 && townLineClear(rt, p, g, 0)) { rt.flags.goTo = null; rt.unmark('mk-go'); rt.objRemove('go'); rt.bark(`${g.name}に着いた。近くの用を選べる`); }
}

// ---- 戸口に「入る」、門に「出陣」 ----
function guide(rt, def) {
  const D0 = rt.flags.doors, game = rt.game;
  for (const [tab, f] of Object.entries(FAC)) {
    const d = D0[tab];
    if (!d || d.inner) continue;   // 中へ入れる店は、中の帳場で（town_shops.js）
    rt.addInteract('door-' + tab, { x: d.x, z: d.z }, `支度する　${f.n}（札を開く）`, () => game.townOpen(tab), { r: 3 });
  }
  if (nagayaOn(rt.G) && D0.squad) rt.addInteract('door-nagaya', D0.squad, '仲間を迎える　足軽の長屋', () => game.townOpen('nagaya'), { r: 3 });
  rt.addInteract('door-gate', { x: D0.gate.x, z: D0.gate.z }, '任務を受けて出陣する', () => game.townOpen('boss', { go: true }), { r: 3.5 });
  // 上官屋敷と出陣の門を小さな地図に出す
  if (D0.boss) rt.marker('mk-boss', { x: D0.boss.x, z: D0.boss.z }, '上官屋敷');
  rt.marker('mk-gate', { x: D0.gate.x, z: D0.gate.z }, '出陣の門');
  // 知行・内政・家臣・外交（段2）：屋敷・使者の間から、同じ「知行」の札を開く（家臣はここに一本化）
  myGuide(rt);
  if (D0.shisha) rt.addInteract('door-shisha', { x: D0.shisha.x, z: D0.shisha.z }, '外交の札を開く　使者の間', () => game.townOpen('realm', { focus: 2 }), { r: 3 });
  // 携帯の一行に収まる短さに（長いと右上の札が三行になり、小地図に潜る）
  rt.obj('town', '支度をして、出陣する', 'main');
  realmObj(rt, true);
  // 始めの一言（門番）。馬を持っていれば、馬はそばで待つ
  const visited = rt.G.tabSeen || (rt.G.tabSeen = {});
  const visitKey = `${scenarioKey()}:${def.place}`;
  if (!visited['道案内:' + visitKey]) { visited['道案内:' + visitKey] = 1; rt.after(1.2, () => { if (!rt.choice && !(rt.hud.subT > 0)) rt.say('門番', '上官屋敷は北の辻を左へ。小さな地図を見てくだされ', 4); }); }
  if (def.posting) rt.addInteract('town-posting', D0.gate, '見る　所在地と任地', () => { if (!rt.choice && !rt.flags.heat) rt.say('門番', def.posting, 5); }, { r: 3 });
  const machi = domOf(rt.G).machi || 0, marketSeen = `市:${scenarioKey()}`;
  if (machi > (visited[marketSeen] || 0)) { visited[marketSeen] = machi; rt.after(6, () => { if (!rt.over && !rt.choice && !rt.flags.heat) rt.say('村の売り手', '市を開き、商人が来た。西の路地には新しい家も建った', 4); }); }
  let directionsAt = 0;
  rt.addInteract('town-directions', D0.gate, '聞く　町の道案内', () => {
    if (rt.choice || rt.flags.heat || rt.t < directionsAt) return;
    directionsAt = rt.t + 8;
    rt.say('門番', '上官屋敷は北の辻を左へ。我が住まいは西の路地。小さな地図に印がある', 4);
  }, { r: 3 });
  { const my = rt.flags.my, G = rt.G; if (my && (G.myLvSeen ?? -1) < my.lv) { const first = G.myLvSeen == null; G.myLvSeen = my.lv; if (!first && my.lv >= 1) rt.after(16, () => rt.say('', `出世して、我が住まいは${my.name}になった。西の路地の奥`, 4.5)); } }
  { const G = rt.G; if ((G.townLvSeen ?? -1) < MYLV) { const first = G.townLvSeen == null; G.townLvSeen = MYLV; if (!first) rt.after(9, () => rt.say('', ['', '城下に家が建ち始めた。空き地が減っている', '城下が賑わってきた。家ごとに提灯が下がる', '城下に土蔵が建ち、辻に提灯の綱が渡された', '城下は大きな町になった。通りに幟が並ぶ'][MYLV], 4.5)); } }
  rt.flags.doorCheckAt = 0;
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
    rt.obj('realm', `${nm}で支度（残り${left.length}つ）`, 'side');
    if (first && rt.flags.doors.yashiki) rt.after(11, () => { if (realmLeft(rt.G).length && !rt.choice && !rt.flags.heat) rt.say('', `西の路地の奥が${nm}。知行の札で今できる支度を選べる。支度は次の戦に役立つ`, 4.5); });
    if (rt.flags.doors.yashiki) rt.marker('mk-my', { x: rt.flags.doors.yashiki.x, z: rt.flags.doors.yashiki.z }, nm);
  } else { rt.unmark('mk-my'); if (had) { rt.obj('realm', '知行の支度は済んだ', 'side'); rt.objDone('realm'); } }
}

// ---- 町の人と組の者 ----
function people(rt, def, rumors) {
  const F = rt.flags;
  F.folk = [];
  const castAll = ['merchant', 'townsman', 'kid', 'samurai', 'townsman', 'elder', 'merchant', 'kid', 'townsman', 'samurai', 'townsman', 'merchant', 'kid', 'townsman'];
  // 携帯「低」は人を減らして軽くする（一人ひとり作り物の体なので、数がそのまま重さになる）
  const cast = SETTINGS.quality === 'low' ? castAll.filter((_, i) => [0, 1, 2, 3, 5, 8, 11].includes(i)) : castAll;
  cast.forEach((kind, i) => {
    const wp = WALK[(i * 5) % WALK.length];
    let x = wp[0] + ((i * 7) % 5) - 2, z = wp[1] + ((i * 3) % 5) - 2;
    if (!townPointClear(rt, x, z, rt.world.heightAt(x, z))) { x = wp[0]; z = wp[1]; }
    const g = allyGroup(rt, { name: '町の人', anchor: { x, z }, facing: (i * 1.3) % 6.28, order: 'hold', noRout: true, width: 1, speed: kind === 'kid' ? 1.6 : 1.15, march: false, aggro: 0, seekRange: 0 },
      [{ type: 'porter', n: 1, o: { flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) return;
    dress(rt, u, kind, i);
    if (kind === 'kid') u.kid = true;
    u.name = ROLE[kind];
    // 子ども以外は、刀で斬りかかれる「町の人」にする（civScan・civStrike が見る）
    u.townPersonId = `folk:${kind}:${i}`;
    if (kind !== 'kid') { u.civ = true; u.civKind = kind; }
    // 夜も出歩くのは侍だけ（ほかは夕刻から家へ）。半分ほどは雨に傘をさす（town_air.js）
    const P = { g, u, kind, i, wp: (i * 5) % WALK.length, waitT: 2 + (i % 5) * 1.5, talkT: 0, said: 0, night: kind === 'samurai', umbOk: i % 2 === 0 && kind !== 'kid' };
    F.folk.push(P);
    const hasRumor = rumors.length && ['samurai', 'elder', 'townsman'].includes(kind);
    rt.addInteract('folk' + i, () => talkPoint(rt, u, P), hasRumor ? `聞く　${ROLE[kind]}の話と噂` : `話す　${ROLE[kind]}`, () => {
      if (!hasRumor) { talk(rt, P, rumors); return; }
      if (!stopTalk(rt, P, 4.5)) return;
      rt.choose(`${ROLE[kind]}に何を聞く？`, [{ label: '離れる' }, { label: '次の戦の噂を聞く' }, { label: P.said === 1 && HAPPEN[kind] && (kind !== 'kid' || (rt.player.u.wpnKind || rt.player.u.lookWeapon || rt.player.u.weapon) === 'spear') && !F['hap_' + kind] ? '残っている頼みを聞く' : '世間話をする' }], (k) => {
        if (k === 1) { P.nextTalkAt = rt.t + 8; rt.say(ROLE[kind], rumors[(F.rumorI++) % rumors.length], 4.5); }
        else if (k === 2) { P.nextTalkAt = rt.t; talk(rt, P, rumors); }
      }, 20);
    }, { r: 2.4 });
  });
  const messenger = allyGroup(rt, { name: '使者', anchor: { x: -10.5, z: -45 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 }, [{ type: 'samurai', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
  if (messenger.units[0]) messenger.units[0].pos.y = rt.world.heightAt(-10.5, -45) + .165;
  // 市の売り手（台の後ろに立つ）
  for (const [j, stall] of F.marketStalls.filter((_, i) => i % 3 === 1).entries()) {
    const i = 20 + j, x = stall.x - Math.sin(stall.rot) * .9, z = stall.z - Math.cos(stall.rot) * .9, h = stall.rot + Math.PI;
    const g = allyGroup(rt, { name: '売り手', anchor: { x, z }, facing: h, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 }, [{ type: 'porter', n: 1, o: { flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) continue;
    dress(rt, u, 'merchant', i);
    u.name = '売り手';
    const P = { g, u, kind: 'merchant', i, fixed: true, when: [0], home: { x, z }, talkT: 0, said: 0 };
    F.folk.push(P);
    rt.addInteract('folk' + i, () => talkPoint(rt, u, P, Math.sin(h) * 1.2, Math.cos(h) * 1.2), '話す　売り手', () => talk(rt, P, rumors), { r: 2.6 });
  }
  // 組の者：長屋の前に（多くても六人。残りは長屋の中にいることにする）
  const R = (rt.G.roster || []).filter((r) => r.alive).sort((a, b) => Number(!!b.nagaya) - Number(!!a.nagaya)).slice(0, Math.min(6, Math.max(3, RANKS[rt.G.rank].squad || 0)));
  const waiting = (rt.G.roster || []).filter(r => r.alive).length - R.length;
  rt.addInteract('kumi-waiting', F.doors.squad, '聞く　長屋で待つ組の者', () => { if (!rt.choice && !F.heat) rt.say('組の者', `今会える者は${R.length}人。残る${Math.max(0, waiting)}人は長屋で休んでおります。組の札で全員を確かめられます`, 4); }, { r: 3 });
  R.forEach((r, i) => {
    const spot = i < 2 ? F.squadRoom.P(-2 + i * 4, 0) : null;
    const x = spot ? spot.x : 6.2 + (i % 2) * 1.3, z = spot ? spot.z : 8.5 + i * 2.1;
    const g = allyGroup(rt, { name: '組の者', anchor: { x, z }, facing: -Math.PI / 2 + (i % 3 - 1) * 0.5, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 },
      [{ type: r.kind === 'bow' ? 'bow' : 'ashigaru', n: 1, o: { name: r.name, face: r.face, flag: null, invuln: true, hat: i % 2 ? 'hachimaki' : 'none', weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) return;
    let said = 0;
    rt.addInteract('kumi' + i, () => talkPoint(rt, u), `話す　${r.name}`, () => {
      const hurt = r.wound;
      const L = hurt ? ['傷が残っております。組の札で出られるかお確かめくだされ', '宿で組の傷を手当てしていただければ……'] : r.battles > 0 ? ['次の戦も、お頭の後ろに付いてまいります', '前の戦で覚えました。槍は揃えて突くもの'] : ['まだ戦を知りませぬ。どうかご指南を', '国の母に、手柄の知らせを送りとうござる'];
      if (!r.alive || !fixedTalk(rt, u)) return;
      rt.say(r.name, !hurt && r.kills > 0 && said++ % 2 === 0 ? `これまで${r.kills}人を討ち取り、${r.battles || 0}戦から生きて戻りました` : L[said++ % L.length], 4);
    }, { r: 2.2 });
  });
  // 家臣は館の庭に立つ（myPeople）。別棟の詰所は廃したので、ここでは出さない
  myPeople(rt);
  // 用を持って暮らす人・犬・借り馬・店先の買い物（town_life.js）
  lifePeople(rt, { dress, dusk: F.tod === 0 });
  // 通りの人込み（遠い人は軽い形・近い人は本物）と、刻と天気（town_crowd.js・town_air.js）
  shopsPeople(rt, { dress, rumors });
  eventsSetup(rt, { dress, backPts: F.backPts, gate: F.doors.gate, season: def.season, paddies: PADDY_AT.slice(0, F.my ? F.my.ta : 0) });
  crowdSetup(rt, { dress, cloth: CLOTH, lv: MYLV });
  airSetup(rt, { info: def.info, lanterns: F.lanterns, torches: F.torches, lampMat: CHOCHIN.mat, madoMat: mats().koshi });
  F.rumorI = 0;
  setupHeat(rt, def);
}

// ---- 騒ぎ（GTA のような手配）：町の人を斬ると上がり、役人に追われる。捕まると罰 ----
const HEAT_DECAY = [0, 7, 13, 20];      // 捕り方に見つからず、この秒を過ごすと一段下がる
const HEAT_WORD = ['', '騒ぎ　一', '騒ぎ　二', '騒ぎ　三'];
function crimeMemo(rt) {
  const game = rt.game, key = `${rt.def.place}:${rt.G.battle}`;
  if (!game.townCrime || game.townCrime.G !== rt.G || game.townCrime.key !== key) game.townCrime = { G: rt.G, key, heat: 0, remaining: 0, victims: new Set() };
  return game.townCrime;
}
function setupHeat(rt, def) {
  const F = rt.flags;
  const memo = crimeMemo(rt);
  F.heat = memo.heat; F.heatT = rt.t + memo.remaining;
  F.townVictims = memo.victims.size;
  for (const P of F.folk) if (memo.victims.has(P.u.townPersonId)) rt.army.kill(P.u, null);
  if (F.heat) rt.obj('heat', `手配（${HEAT_WORD[F.heat]}）：捕り方の目を避ける`, 'order');
  F.guards = [];
  const gx = 0, gz = GATE_Z + 10;
  for (let i = 0; i < 3; i++) {
    const g = allyGroup(rt, { name: '捕り方', anchor: { x: gx + (i - 1) * 1.6, z: gz }, facing: Math.PI, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 },
      [{ type: i === 0 ? 'samurai' : 'ashigaru', n: 1, o: { name: i === 0 ? '役人' : '捕り方', flag: null, invuln: true } }]);
    const u = g.units[0];
    if (!u) continue;
    u.name = i === 0 ? '役人' : '捕り方';
    F.guards.push({ g, u, anchor: { x: gx + (i - 1) * 1.6, z: gz }, catchT: 0, dest: { x: gx + (i - 1) * 1.6, z: gz } });
  }
  // 斬られた町の人の悲鳴と、まわりの人が逃げ出す
  rt.civScan = (pos, heading, reach, half) => {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const P of F.folk || []) {
      const o = P.u;
      if (!o || !o.alive || !o.civ || o.downed || P.away) continue;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > reach + 0.65 || Math.abs(o.pos.y - pos.y) > 1.2 || interiorBlocked(INTERIOR_WALLS, pos, o.pos) || !townLineClear(rt, pos, o.pos, 0)) continue;
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
    crimeMemo(rt).victims.add(t.townPersonId);
    F.townVictims = crimeMemo(rt).victims.size;
    const journal = rt.G.journal || (rt.G.journal = []);
    journal.push({ t: `${def.when}　町の事件`, s: `${def.place}で${t.name || '町の人'}を斬った。町の人は戻らず、周りの者が逃げた` });
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
    if (!P.away && d < 14 && Math.abs(o.pos.y - t.pos.y) < 1.2 && townLineClear(rt, o.pos, t.pos, 0) && !interiorBlocked(INTERIOR_WALLS, o.pos, t.pos)) {
      const dest = P.townDest || (P.townDest = { x: 0, z: 0 });
      let best = null, score = -Infinity;
      for (const q of F.ways || []) { const walk = Math.hypot(q.x - o.pos.x, q.z - o.pos.z); if (walk > 18 || walk < 2 || !townLineClear(rt, o.pos, q)) continue; const safe = Math.hypot(q.x - t.pos.x, q.z - t.pos.z) - walk * .25; if (safe > score) { score = safe; best = q; } }
      if (!best) continue;
      dest.x = best.x; dest.z = best.z; P.talkT = 0;
      P.g.order = 'move'; P.g.dest = dest; P.waitT = 6;
    }
  }
  rt.army.play('cry', t.pos, 1);
}
function addHeat(rt, def, n, samurai) {
  const F = rt.flags;
  const before = F.heat;
  F.heat = Math.min(3, F.heat + n);
  F.heatT = rt.t + HEAT_DECAY[F.heat];
  for (const guard of F.guards || []) { guard.dest.x = rt.player.u.pos.x; guard.dest.z = rt.player.u.pos.z; guard.sightAt = 0; guard.sees = false; }
  if (F.heat !== before) {
    rt.obj('heat', `手配（${HEAT_WORD[F.heat]}）：過料${120 + F.heat * 90}文・戦功は最大${Math.min(rt.G.merit || 0, 8)}減る。捕り方の目を避ける`, 'order');
    rt.hud.flash(samurai ? '侍を斬った……大ごとになるぞ' : '見られた。人が騒ぎ出す', 'bad');
  }
  const memo = crimeMemo(rt); memo.heat = F.heat; memo.remaining = Math.max(0, F.heatT - rt.t);
  if (F.heat >= 1 && (rt.t - (F.heatCryT || -99) > 8)) { F.heatCryT = rt.t; rt.bark(F.heat >= 3 ? '御用だ、御用だ！' : '人殺しだぞ！', true); }
}
// 毎コマ：役人・足軽を近寄せる（heat が有る間）。追い付かれたら捕まる
function heatTick(rt, dt) {
  const F = rt.flags;
  if (!F.guards) return;
  if (F.heat > 0 && rt.t >= (F.witnessAt || 0)) { F.witnessAt = rt.t + .5; for (const folk of F.folk) { const u = folk.u; if (!u.alive || u.downed || folk.away || Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 18) continue; if (townLineClear(rt, u.pos, rt.player.u.pos, 0) && !interiorBlocked(INTERIOR_WALLS, u.pos, rt.player.u.pos)) { F.heatT = rt.t + HEAT_DECAY[F.heat]; break; } } }
  if (F.heat > 0 && rt.t > F.heatT) { F.heat--; if (F.heat > 0) { F.heatT = rt.t + HEAT_DECAY[F.heat]; rt.obj('heat', `手配（${HEAT_WORD[F.heat]}）：過料${120 + F.heat * 90}文・戦功は最大${Math.min(rt.G.merit || 0, 8)}減る。捕り方の目を避ける`, 'order'); } else { rt.objRemove('heat'); rt.bark('騒ぎは収まったようだ'); } }
  const memo = crimeMemo(rt); memo.heat = F.heat; memo.remaining = Math.max(0, F.heatT - rt.t);
  const P = rt.player.u;
  if (!P.alive || P.downed) return;
  F.guards.forEach((G, i) => {
    const u = G.u;
    if (!u || !u.alive) return;
    if (F.heat > 0) {
      if (rt.t >= (G.sightAt || 0)) {
        G.sightAt = rt.t + .25;
        G.sees = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 32 && Math.abs(u.pos.y - P.pos.y) < 3 && townLineClear(rt, u.pos, P.pos, 0) && !interiorBlocked(INTERIOR_WALLS, u.pos, P.pos);
        if (G.sees) { G.dest.x = P.pos.x; G.dest.z = P.pos.z; F.heatT = rt.t + HEAT_DECAY[F.heat]; }
        G.direct = townLineClear(rt, u.pos, G.dest);
        if (!G.direct && rt.t >= (G.routeAt || 0)) { G.routeAt = rt.t + 1; G.route = townRoute(rt, G.dest, u.pos); G.step = 0; }
      }
      let goal = G.dest;
      if (G.direct) G.route = null;
      else if (G.route?.length) { if (G.step < G.route.length - 1 && Math.hypot(u.pos.x - G.route[G.step].x, u.pos.z - G.route[G.step].z) < 1.2) G.step++; goal = G.route[G.step]; }
      if (Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z) > 1 && (G.direct || G.route?.length)) { G.g.order = 'move'; G.g.dest = goal; }
      else { G.g.order = 'hold'; G.g.dest = null; G.g.anchor.x = u.pos.x; G.g.anchor.z = u.pos.z; }
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (d < 1.9 && Math.abs(u.pos.y - P.pos.y) < 1.2 && townLineClear(rt, u.pos, P.pos, 0) && !interiorBlocked(INTERIOR_WALLS, u.pos, P.pos) && rt.t > G.catchT) {
        G.catchT = rt.t + 2;
        caught(rt);
      }
    } else if (Math.hypot(u.pos.x - G.anchor.x, u.pos.z - G.anchor.z) > 1) {
      G.g.order = 'move'; G.g.dest = G.anchor;
    } else if (G.g.order !== 'hold') {
      G.g.order = 'hold'; G.g.dest = null; G.g.anchor.x = G.anchor.x; G.g.anchor.z = G.anchor.z;
    }
  });
}
function caught(rt) {
  const F = rt.flags;
  if (rt.choice || rt.pendingChoice) { rt.choice = null; rt.pendingChoice = null; rt.hud.renderChoice(null); }
  const fine = 120 + F.heat * 90 + (crimeMemo(rt).debt || 0);
  const paid = Math.min(Math.max(0, Math.round((rt.G.kan || 0) * 1000)), fine);
  crimeMemo(rt).debt = fine - paid;
  const lost = Math.min(rt.G.merit || 0, 8);
  rt.G.kan = Math.max(0, Math.round((rt.G.kan || 0) * 1000) - paid) / 1000;
  rt.G.merit = Math.max(0, (rt.G.merit || 0) - lost);
  (rt.G.journal || (rt.G.journal = [])).push({ t: `${rt.def.when}　町の処罰`, s: `過料${paid}文を払った。未納は${fine - paid}文。戦功は${lost}減った` });
  rt.hud.say('町の記録', `捕縛。過料${paid}文、戦功${lost}を失った`, 4, true);
  rt.banner('役人に捕らえられた', `過料 ${paid}文・戦功 −${lost}`);
  rt.say('役人', paid < fine ? `持ち銭から${paid}文を徴収した。不足の${fine - paid}文は借りとして記す。次に捕まれば合わせて徴収する。戦功は${lost}減る。次はこうはいかぬぞ` : `過料${paid}文を徴収した。町の者に手を上げるとは……次はこうはいかぬぞ`, 4.5);
  F.heat = 0; F.heatT = 0;
  const memo = crimeMemo(rt); memo.heat = 0; memo.remaining = 0;
  rt.objRemove('heat');
  const p = rt.player.u;
  p.stagger = Math.max(p.stagger || 0, 1.2);
}

function talk(rt, P, rumors) {
  const F = rt.flags, u = P.u, pu = rt.player.u;
  if (!stopTalk(rt, P, 6)) return;
  if (F.townVictims) { rt.say(ROLE[P.kind], `斬られた${F.townVictims}人は、もう町に戻りませぬ。皆、恐れております`, 4); return; }
  P.said++;
  const armed = (pu.wpnKind || pu.lookWeapon || pu.weapon) === 'spear';
  const H = P.kind === 'kid' && !armed ? null : HAPPEN[P.kind];
  if (H && P.said === 1 && !F['hap_' + P.kind]) {
    const it = rt.interacts.find((it) => it.id === 'folk' + P.i);
    if (it) it.label = `聞く　${ROLE[P.kind]}の頼み`;
  }
  // 二度目に話しかけると、短い出来事（子ども・商人・年寄り）
  if (H && P.said >= 2 && !F['hap_' + P.kind]) {
    // 頼みを聞くだけでは済みにしない。離れた時は次に聞き直せる。
    const it = rt.interacts.find((it) => it.id === 'folk' + P.i);
    if (it) it.label = `話す　${ROLE[P.kind]}`;
    const answers = [{ label: '礼を言って離れる', say: 'またお立ち寄りくだされ' }, ...H.a];
    rt.choose(`${H.q}（答えずに待つと離れる）`, answers.map((a) => ({ label: a.label })), (k) => {
      const a = answers[k] || answers[0];
      if (k > 0) { F['hap_' + P.kind] = true; P.hapDone = true; }
      else P.said = 1;
      P.nextTalkAt = rt.t + 8;
      rt.say(ROLE[P.kind], a.say, 4);
      if (a.heal && rt.player.breath != null) rt.player.breath = rt.player.maxBreath || 100;
    }, 20);
    return;
  }
  // 世間話。戦の噂は聞く用から別に選ぶ
  if (Math.hypot(u.pos.x - 18, u.pos.z + 20) < 9 && P.kind === 'townsman') { rt.say('町の人', '朝は井戸で水を汲む。炊事の水は家へ運びます', 4); return; }
  if (P.kind === 'merchant' && F.hap_merchant && !P.hapDone) { rt.say('商人', '先ほど町の商人が世話になりました。町で一度の頼みでござる', 4); return; }
  const own = TALK[P.kind] || TALK.townsman;
  let line = own[(P.i + P.said - 1) % own.length];
  if (P.kind === 'kid' && !armed && line.includes('その槍')) line = 'お侍さま、戦の支度はできたんか？';
  rt.say(ROLE[P.kind], line, 4.5);
}

// ---- 毎コマ：町の人を歩かせる ----
function tick(rt, dt) {
  const F = rt.flags;
  const breath = rt.player.breath, maxBreath = rt.player.maxBreath || 100;
  if (F.lastBreath != null && breath >= maxBreath && F.lastBreath < maxBreath - 1 && rt.t >= (F.breathNoticeAt || 0)) { F.breathNoticeAt = rt.t + 8; rt.bark(`息が整った。残りの息は${Math.round(breath)}／${maxBreath}`); }
  F.lastBreath = breath;
  const kitchen = F.kitchen, smoke = rt.world.smokeCol;
  if (kitchen && kitchen.id != null && smoke && kitchen.visible !== (F.tod !== 1)) { kitchen.visible = F.tod !== 1; for (let k = 0; k < smoke.PER; k++) smoke.pos[(kitchen.id * smoke.PER + k) * 3 + 1] = kitchen.visible ? kitchen.y : -9999; smoke.pts.geometry.attributes.position.needsUpdate = true; }
  doorTick(rt);
  roomTick(F.my && F.my.room, rt.player && rt.player.u.pos);
  townTowerTick(F.my && F.my.towerInside, F.tod === 0, rt);
  if (F.layoutRooms) for (const room of F.layoutRooms) roomTick(room, rt.player && rt.player.u.pos);
  for (const P of F.folk || []) {
    const u = P.u;
    if (!u || !u.alive || P.away || P.busy) continue;
    if (P.talkT > 0) { P.talkT -= dt; continue; }
    const g = P.g, dest = P.townDest || (P.townDest = { x: 0, z: 0 });
    if (g.order === 'move' && g.dest) {
      if (Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 1.6) { g.order = 'hold'; g.anchor.x = u.pos.x; g.anchor.z = u.pos.z; g.dest = null; P.stuckT = 0; P.lastX = u.pos.x; P.lastZ = u.pos.z; P.waitT = P.seq ? P.nextWait || 0 : 2 + Math.random() * 6; }
      if (g.dest) {
        if (Math.hypot(u.pos.x - P.lastX, u.pos.z - P.lastZ) > .25) { P.lastX = u.pos.x; P.lastZ = u.pos.z; P.stuckT = 0; }
        else P.stuckT += dt;
        if (P.stuckT > 3) {
          const pts = P.pts || WALK;
          let best = -1, distance = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.hypot(u.pos.x - pts[i][0], u.pos.z - pts[i][1]);
            dest.x = pts[i][0]; dest.z = pts[i][1];
            if (d < distance && d > .5 && townLineClear(rt, u.pos, dest)) { best = i; distance = d; }
          }
          P.stuckT = 0;
          if (best >= 0) { P.wp = best; dest.x = pts[best][0]; dest.z = pts[best][1]; g.dest = dest; }
          else { g.order = 'hold'; g.dest = null; g.anchor.x = u.pos.x; g.anchor.z = u.pos.z; P.waitT = 3; }
        }
      }
      continue;
    }
    if (P.fixed) continue;
    P.waitT -= dt;
    if (P.waitT > 0) continue;
    // 用のある往来（荷運び・登城の侍）：決まった道を順にたどり、端で用を済ませて引き返す
    if (P.seq) {
      const L = P.pts.length;
      if (L < 2) { P.waitT = 6; continue; }
      if (P.wp + P.dir >= L || P.wp + P.dir < 0) P.dir = -P.dir;
      P.wp += P.dir;
      const w = P.pts[P.wp], end = P.wp === 0 || P.wp === L - 1;
      dest.x = w[0] + (Math.random() - .5) * .8; dest.z = w[1] + (Math.random() - .5) * .8;
      if (!townLineClear(rt, u.pos, dest)) { dest.x = w[0]; dest.z = w[1]; }
      if (!townLineClear(rt, u.pos, dest)) { P.wp -= P.dir; P.waitT = 3; continue; }
      g.order = 'move'; g.dest = dest;
      g.facing = Math.atan2(g.dest.x - u.pos.x, g.dest.z - u.pos.z);
      P.nextWait = end ? P.endWait || 6 : 0;
      continue;
    }
    // 近い道の点のうちから、次の行き先を選ぶ（子どもは市のあたりを走り回る）
    const PT = P.pts || WALK;
    if (!PT.length) { P.waitT = 6; continue; }
    const choices = P.neighbors[P.wp] || P.neighbors[0];
    if (!choices || !choices.length) { P.waitT = 6; continue; }
    const next = choices[Math.floor(Math.random() * choices.length)];
    const w = PT[next];
    dest.x = w[0] + (Math.random() - .5) * .6; dest.z = w[1] + (Math.random() - .5) * .6;
    if (!townLineClear(rt, u.pos, dest)) { dest.x = w[0]; dest.z = w[1]; }
    if (!townLineClear(rt, u.pos, dest)) { P.waitT = 3; continue; }
    P.wp = next; g.order = 'move'; g.dest = dest;
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
