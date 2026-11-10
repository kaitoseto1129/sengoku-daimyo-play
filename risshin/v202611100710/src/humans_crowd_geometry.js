// 人の処理：兵の形のまとめ。外部向けの入口は humans.js。
import { humanLook, isSohei, SRC, HSTAT, gc, humanBoneMap, ALLB, XB, humanInv, memTight, crowdGeos, crowdShapes, kusaPlates, plateOf, realNear } from './humans_shared.js';
import { nearArmorParts, layParts } from './humans_dress.js';
import { lookParts } from './units.js';
import { DOMARU, wantsDomaru, crowdDomaru } from './humans_armor.js';
import { GUSOKU, wantsGusoku } from './gusoku_scan.js';
import { lookPartSteps } from './units_look.js';
import * as THREE from 'three';
import { WORLD } from './humans_context.js';
import { thighGeometry, shinGeometry } from './units_model.js';
import { HORO_HEIGHT, HORO_TOP } from './units_model.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BSPH } from './humans_lod.js';
import { realBodyParts, REAL_DROP } from './humans_crowd_body.js';
const REAL_FIT = new THREE.Matrix4();

// 形の作り方を小さな手順に分けて並べる：近い部品の形を一つずつ → 打ち出しの縅 → 遠い部品の形を一つずつ → 束ねた形を一つずつ
function preQueue(u) {
  const look = humanLook(u.look), sohei = isSohei(u.look);
  const near = () => { const P = nearArmorParts(lookParts(look)); P.look.sohei = sohei; return P; };
  // 束ねた形は兵の装い（dressCrowd の道）の人だけ。胴丸・南蛮・名将・本人は作る時に任せる
  const crowd = (f) => () => {
    const P = near(), L = P.look;
    if (DOMARU.ready && wantsDomaru(L)) return;
    if (L.nanban || L.hero) return;
    f(P, L, lookParts(look, false), DOMARU.ready && crowdDomaru(L) ? DM_KEEP : DOMARU.ready && GUSOKU.ready && wantsGusoku(L, u) ? GS_KEEP : null);
  };
  return [...lookPartSteps(look, true), near, ...lookPartSteps(look, false),
    // 顔を束ねた形（face=true の geoF・geoLoF）は前もって作らず、要る時に作る（dressCrowd の faceGeo）
    crowd((P, L, Plo, only) => crowdGeometry(P, L, only)), crowd((P, L, Plo, only) => crowdGeometry(Plo, L, only)), crowd((P, L, Plo) => crowdGeometry(Plo, L, null, true, true))];
}
// 形を前もって作る（ms の間だけ。手順の一つは必ず進める）。済んでいれば false
function preStep(u, ms = 0) {
  if (!SRC || !u.look) return false;
  if (u._hpreLook !== u.look) { u._hpreLook = u.look; u._hpre = 0; u._hq = null; }
  if (u._hpre >= 3) return false;
  HSTAT.preSteps = (HSTAT.preSteps || 0) + 1;
  const t0 = performance.now();
  try {
    const q = u._hq || (u._hq = preQueue(u));
    while (q.length) { q.shift()(); if (performance.now() - t0 >= ms) break; }
    if (!q.length) { u._hpre = 3; u._hq = null; }
  } catch (e) { u._hpre = 3; u._hq = null; /* 前もって作れなくても、作る時に作る */ }
  const TX = HSTAT.tx || (HSTAT.tx = {}), dt = performance.now() - t0; TX.pre = +((TX.pre || 0) + dt).toFixed(1); TX.preMax = +Math.max(TX.preMax || 0, dt).toFixed(1);
  return true;
}
const PART_BONE = { hips: 'swHips', sodeP: 'swSodeP', sodeN: 'swSodeN', haori: 'swHaori', back: 'swBack', hat: 'swHat', pole: 'swPole' };
// 部品の骨の名が並び（ALLB）に無いと -1 が Uint16 で 65535 になり、骨の絵の外を読んで頂点が原点へ飛ぶ（足軽の黒い長い三角 11/1）。
//   近い骨の名へ読み替え、それも無ければ胸の骨へ
const BONE_ALIAS = [[/Neck|HeadTop|Head/, 'Head'], [/LeftShoulder/, 'Spine2'], [/RightShoulder/, 'Spine2'], [/LeftToe/, 'LeftFoot'], [/RightToe/, 'RightFoot'], [/Spine2|Chest|UpperChest/, 'Spine2'], [/Spine/, 'Spine1'], [/hat|kabuto|kasa/i, 'swHat'], [/hips|waist|koshi/i, 'Hips']];
function boneIdx(bn) {
  let i = ALLB.indexOf(bn);
  if (i >= 0) return i;
  for (const [re, to] of BONE_ALIAS) if (re.test(String(bn))) { i = ALLB.indexOf(to); if (i >= 0) return i; }
  HSTAT.boneMiss = (HSTAT.boneMiss || 0) + 1;
  return ALLB.indexOf('Spine2');
}
const humanGeoMaps = new Map();
const humanMappedGeos = new WeakSet();
function humanGeometryMap(indices) {
  const key = indices.join(',');
  if (humanGeoMaps.has(key)) return humanGeoMaps.get(key);
  const cache = new WeakMap(), unchanged = indices.every((at, i) => at === i);
  const remap = (geo) => {
    if (unchanged) return geo;
    // 袖の仕立て直しで複製された形も、骨番号は既に共通の並び。
    // 形そのものの印だけでは複製のたびに再変換し、胴や腕が別の骨へ飛ぶ。
    if (humanMappedGeos.has(geo) || geo.userData.humanBoneOrder === key) return geo;
    if (cache.has(geo)) return cache.get(geo);
    // 位置・法線・絵の座標は元の形と共有し、骨番号だけを作る（一度だけ）。
    const g = new THREE.BufferGeometry();
    g.index = geo.index; g.attributes = { ...geo.attributes };
    g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;
    g.groups = geo.groups; g.drawRange = geo.drawRange;
    g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
    g.userData = { ...geo.userData, humanBoneOrder: key };
    const src = geo.attributes.skinIndex, a = new Uint16Array(src.count * 4);
    for (let i = 0; i < src.count; i++) for (let k = 0; k < 4; k++) a[i * 4 + k] = indices[gc(src, i, k)];
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a, 4));
    cache.set(geo, g); humanMappedGeos.add(g);
    return g;
  };
  humanGeoMaps.set(key, remap);
  return remap;
}
// 共有し終えた骨格だけを対象にする。体・具足・手が別の骨格でも、同じ印で全て更新する。
function cacheHumanSkeleton(h) {
  // 鳥取の坂では、画面外への出入り・日送りで親の位置も変わる。
  // 古い骨と逆行列を持ち越さず、共有済みの骨格を描く時に通常どおり更新する。
  if (WORLD?.def.drawTimeUnitParts) return;
  const skeletons = new Set(), meshes = [];
  h.root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    skeletons.add(m.skeleton);
    const inverse = m.bindMatrixInverse.clone(), update = m.updateMatrixWorld;
    meshes.push({ mesh: m, inverse });
    m.updateMatrixWorld = function (force) {
      update.call(this, force);
      // 骨の絵は前回の世界座標を含む。逆行列もその時点に揃え、移動・旋回は今の modelMatrix で描く。
      // bindMode と骨の世界行列は変えず、指や武器の位置を求める処理も従来どおり。
      if (!h.skelDirty) this.bindMatrixInverse.copy(inverse);
    };
  });
  const update = function () {
    if (!h.skelDirty) return;
    // 隠れた皮（遠近切替の体・手）も、骨と同じ時点の逆行列を覚える。
    // 非表示の間の古い逆行列を残すと、再表示時に皮が放射状に伸びる。
    for (const part of meshes) {
      part.mesh.updateWorldMatrix(true, false);
      part.inverse.copy(part.mesh.matrixWorld).invert();
      part.mesh.bindMatrixInverse.copy(part.inverse);
    }
    for (const sk of skeletons) THREE.Skeleton.prototype.update.call(sk);
    h.skelDirty = false;
  };
  for (const sk of skeletons) sk.update = update;
}
function shareHumanSkeleton(h) {
  const meshes = [], old = new Set();
  h.root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const sk = m.skeleton;
    const names = sk.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const indices = humanBoneMap(names, sk.boneInverses);
    meshes.push([m, humanGeometryMap(indices)]); old.add(sk);
  });
  // 全身型では使わない揺れる骨の枠は親の骨を置く（描かれない枠のために骨を増やさない）。
  const sk = new THREE.Skeleton(ALLB.map((nm) => h.bones[nm] || h.bones[XB[nm]]), humanInv.slice());
  h.skeleton = sk;
  for (const [m, remap] of meshes) {
    m.geometry = remap(m.geometry);
    m.userData.humanBoneMap = remap;
    // 距離で体や胴丸の形を替える時も同じ並びにする。形と番号は全員で使い回す。
    const before = m.onBeforeRender;
    m.onBeforeRender = function (r, scene, cam, geo, mat, group) { before.call(this, r, scene, cam, geo, mat, group); this.geometry = remap(this.geometry); };
    m.bind(sk, m.bindMatrix);
  }
  for (const sk0 of old) sk0.dispose();
  old.clear(); meshes.length = 0;   // 描く前の閉包が持ち続けるので、元の骨組み（骨と行列）を手放す
}

// 胴丸の侍に重ねる部品（兜・顔・母衣・陣羽織）
const DM_KEEP = new Set(['hat', 'back', 'haori', 'koshi', 'pole']);   // 確かめ用（記憶の数え）
// 具足のスキャンを着る侍・武将に重ねる部品（兜は兜のスキャン。gusoku_scan.js）
const GS_KEEP = new Set(['back', 'koshi', 'pole']);
function shapeId(geo) {
  if (geo.__shapeId) return geo.__shapeId;
  let h = 2166136261;
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619); };
  const hashF = (arr) => { const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length); for (let i = 0; i < u.length; i++) mix(u[i]); };
  const pos = geo.attributes.position.array, uv = geo.attributes.uv && geo.attributes.uv.array, nr = geo.attributes.normal && geo.attributes.normal.array;
  hashF(pos); if (uv) hashF(uv); if (nr) hashF(nr);
  if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) mix(ix[i]); }
  return (geo.__shapeId = pos.length + ':' + (h >>> 0).toString(36));
}
function colorId(geo) {
  if (geo.__colorId) return geo.__colorId;
  let h = 2166136261;
  const A = geo.attributes;
  for (const nm of ['color', 'col2', 'mtl']) {
    const a = A[nm] && A[nm].array; if (!a) { h = Math.imul(h ^ 7, 16777619); continue; }
    const u = (a.byteOffset & 3) || (a.byteLength & 3) ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619); }
  }
  return (geo.__colorId = (h >>> 0).toString(36));
}
const fitKey = (m) => m.elements.map((e) => Math.round(e * 1e4)).join(',');
const to8 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
function crowdGeometry(P, L, only = null, face = false, whole = false) {
  // 遠目で中の体を隠す時は、甲冑だけでなく袴と脛の布も残す。
  // 近景の体と二重にせず、形は既存の置き場と一体の描画を使う。
  if (whole && !L.sohei && !L.nanban) {
    P = { ...P, thigh: thighGeometry(P.look, false), leg: shinGeometry(P.look, false, 'coveredLeg') };
  }
  const list = [];
  // 全身の形（遠い形・VAT）は、筒と玉の人形の体と顔をやめ、近くの兵と同じ MakeHuman の体と頭にする（humans_crowd_body.js。kaito 11/3）
  const real = whole && !L.sohei && !L.nanban && !L.kosode ? realBodyParts(L) : null;
  layParts(P, L, (k, nm, geo, fit) => { if (real && REAL_DROP.has(k)) return; if (geo && geo.attributes.position.count && (k === 'face' ? face : (!only || only.has(k)))) list.push({ k, bn: (/Arm$/.test(nm) ? null : PART_BONE[k]) || nm, geo, fit }); });
  if (real) for (const geo of real) list.push({ bn: '@real', geo, fit: REAL_FIT, skinned: true });
  // iPhone は鍵を中身（形と色）で：部品の形が表から外れて作り直されると uuid が変わり、同じ姿の束の形を何度も新しく作っていた（森部の乱戦で 8 回/秒。10/21）
  const kp = L.sohei ? 0 : ((L.tier || 0) === 0 ? 5 : 7);
  let shapeKey = null;
  const key = memTight() ? (shapeKey = list.map((p) => p.bn + ':' + shapeId(p.geo) + ':' + fitKey(p.fit)).join('|') + '|' + kp) + '#' + list.map((p) => colorId(p.geo)).join(',') : list.map((p) => p.geo.uuid).join('|');
  if (crowdGeos.has(key)) { HSTAT.crowdHit++; const g0 = crowdGeos.get(key); const sh0 = g0 && crowdShapes.get(g0.userData.shapeKey); if (sh0) sh0.use = performance.now(); if (g0 && g0.userData) g0.userData.use = performance.now(); return g0; }
  if (!shapeKey) shapeKey = list.map((p) => p.bn + ':' + shapeId(p.geo) + ':' + fitKey(p.fit)).join('|') + '|' + kp;
  let shape = crowdShapes.get(shapeKey);
  if (!shape) {
    const gs = [];
    for (const p of list) {
      const g = p.geo.clone();
      // 本物の体と頭：立ち姿の根元の座標で、骨の重みも束ねた骨の並びで出来ている
      if (p.skinned) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k); gs.push(g); continue; }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.index) { const n = g.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
      g.applyMatrix4(p.fit);
      const n = g.attributes.position.count, bi = boneIdx(p.bn);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      // 母衣は肩で留め、裾ほど背の揺れを受ける。既存の胸と背の骨で布を曲げ、袋全体の硬い揺れを避ける。
      if (p.bn === 'swBack') {
        const P0 = p.geo.attributes.position, chest = ALLB.indexOf('Spine2');
        for (let i = 0; i < n; i++) {
          const w = Math.max(0, Math.min(1, (HORO_TOP - P0.getY(i)) / HORO_HEIGHT));
          si[i * 4 + 1] = chest; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
        }
      }
      // 足軽の小さな袖（二の腕の骨に付く）：袖は肩から紐で吊るす板なので、腕を上げても腕と一緒に棒のように持ち上がらない。
      //   上の端は胸の骨に半ば残し、裾ほど腕に従わせる（腕を前へ上げると袖は斜めに垂れる。11/8 上げた腕ののっぺりした棒）
      if ((p.k === 'sodeP' || p.k === 'sodeN') && /Arm$/.test(p.bn)) {
        const P0 = p.geo.attributes.position, chest = ALLB.indexOf('Spine2');
        for (let i = 0; i < n; i++) {
          const f = Math.min(1, Math.max(0, (1.4 - P0.getY(i)) / 0.3));
          si[i * 4 + 1] = chest; sw[i * 4] = 0.35 + 0.4 * f; sw[i * 4 + 1] = 0.65 - 0.4 * f;
        }
      }
      // 草摺は板ごとの骨へ（体の座標の、まだ骨に合わせる前の位置で板を見分ける）
      if (p.bn === 'swHips' && !L.sohei) {
        const KP = kusaPlates(L), P0 = p.geo.attributes.position;
        // 板は上の端を腰に残し、裾ほど板の骨に従わせる（一枚の硬い板が蝶番で回るのでなく、歩くと裾がしなって揺れる）
        const hipB = ALLB.indexOf('swHips');
        for (let i = 0; i < n; i++) {
          const y = P0.getY(i), k = plateOf(P0.getX(i), y, P0.getZ(i), KP);
          if (k < 0) continue;
          const f = Math.pow(Math.min(1, Math.max(0, (0.885 - y) / 0.27)), 0.75);
          si[i * 4] = ALLB.indexOf('swK' + k); sw[i * 4] = 0.15 + 0.85 * f; si[i * 4 + 1] = hipB; sw[i * 4 + 1] = 0.85 - 0.85 * f;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      gs.push(g);
    }
    // 胴丸の兵は鉢巻などを別に着けるため、重ねる具足が一つも無い場合がある。
    // 空の束は結合へ渡さず、頂点ゼロの形として共有する。遠目の全身への切替は残す。
    const m = gs.length ? mergeGeometries(gs) : new THREE.BufferGeometry();
    if (!gs.length) {
      for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['skinWeight', 4]]) {
        m.setAttribute(name, new THREE.BufferAttribute(new Float32Array(0), size));
      }
      m.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(0), 4));
    }
    for (const g of gs) g.dispose();
    if (!m) { crowdGeos.set(key, null); return null; }
    quantizeAttr(m, 'skinWeight', Uint16Array, 65535);   // 骨の重みは 16 bit で足りる
    shape = { attrs: m.attributes, index: m.index, n: m.attributes.position.count, use: 0 };
    crowdShapes.set(shapeKey, shape);
    HSTAT.shapeMade++;
  }
  shape.use = performance.now();
  // 色だけ姿ごとに（8 bit）。部品の並びと頂点数は形と同じ
  const n = shape.n, color = new Uint8Array(n * 3), col2 = new Uint8Array(n * 3), mtl = new Float32Array(n);
  let o = 0;
  for (const p of list) {
    const A = p.geo.attributes, c = A.color, c2 = A.col2 || A.color, mk = A.mtl, cnt = A.position.count;
    if (o + cnt > n) break;
    for (let i = 0; i < cnt; i++) {
      const j = o + i;
      if (c) { color[j * 3] = to8(c.getX(i)); color[j * 3 + 1] = to8(c.getY(i)); color[j * 3 + 2] = to8(c.getZ(i)); }
      if (c2) { col2[j * 3] = to8(c2.getX(i)); col2[j * 3 + 1] = to8(c2.getY(i)); col2[j * 3 + 2] = to8(c2.getZ(i)); }
      if (mk) mtl[j] = mk.getX(i);
    }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  for (const k in shape.attrs) g.setAttribute(k, shape.attrs[k]);
  g.setIndex(shape.index);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
  g.setAttribute('col2', new THREE.BufferAttribute(col2, 3, true));
  g.setAttribute('mtl', new THREE.BufferAttribute(mtl, 1));
  g.boundingSphere = BSPH.clone();
  g.userData.use = performance.now(); g.userData.shapeKey = shapeKey;
  crowdGeos.set(key, g);
  HSTAT.crowdMade++;
  return g;
}
// 0〜1 の float の属性を、正規化した整数の属性に置き換える（three は normalized の属性を shader へ 0〜1 の float で渡す）
function quantizeAttr(g, name, Ctor, max) {
  const a = g.attributes[name];
  if (!a || a.normalized || !(a.array instanceof Float32Array)) return;
  const src = a.array, out = new Ctor(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, src[i])) * max);
  g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, true));
}
const crowdSweep = { keys: null, left: 0, at: 0 };
// 支度は開戦時に近い兵だけ。遠い姿は近づく時に従来の小分けの作成でそろえる。
// 実体の人数・近景へ替える距離・画質は変えない。
function preparationUnits(rt, camera) {
  const p = rt.player?.u?.pos || camera.position, c = camera.position;
  const distance = u => Math.min((u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2,
    (u.pos.x - c.x) ** 2 + (u.pos.z - c.z) ** 2);
  return rt.army.units.filter(u => !u.gone && u.mesh && u.look && u.type !== 'dummy' &&
    (u.isPlayer || distance(u) <= (realNear() + 8) ** 2))
    .sort((a, b) => Number(!!b.isPlayer) - Number(!!a.isPlayer) || distance(a) - distance(b));
}

export { preStep, PART_BONE, humanGeoMaps, cacheHumanSkeleton, shareHumanSkeleton, DM_KEEP, GS_KEEP, crowdGeometry, quantizeAttr, crowdSweep, preparationUnits };
