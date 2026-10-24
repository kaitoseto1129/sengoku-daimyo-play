// 一括描画の拡張が無い機種でも、馬防柵を近い区画ごとに一つの形へ。
import * as THREE from 'three';
import { S } from './settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeFenceBatch(scene, list, mat, cam = true, near = false, world = null) {
  const meshes = [];
  const materialBatch = world?.def?.distantMaterialBatch || false && world?.def?.lowMaterialBatch;
  const cells = new Map();
  for (const entry of list) {
    entry.geo.computeBoundingBox();
    const b = entry.geo.boundingBox;
    // 小谷と設楽原は、材質の束自身が部品・面の区画を選別する。
    // さらに三十二メートルごとに描画を分けず、同じ材質を一回で送る。
    const key = materialBatch ? '' : Math.floor((b.min.x + b.max.x) / 64) + ',' + Math.floor((b.min.z + b.max.z) / 64);
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(entry);
  }
  for (const cell of cells.values()) {
    const geo = mergeGeometries(cell.map((e) => e.geo));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = cam; mesh.userData.camNear = near;
    mesh.userData.noFreeze = true;   // 静止物の再結合で、壊れる区画の窓口を失わない。
    const parts = [], v = new THREE.Vector3(), normal = new THREE.Matrix3();
    let offset = 0, visible = cell.length;
    // 元の位置と法線は一度だけ保存。壊れて傾く時だけ、該当区画を書き換える。
    for (const { geo: src } of cell) {
      parts.push({ offset, pos: src.attributes.position.array, norm: src.attributes.normal.array, matrix: new THREE.Matrix4(), visible: true });
      offset += src.attributes.position.count;
    }
    const write = (p, id) => {
      // 開閉・破壊の後は元の形で受ける。古い遠景の形を見せない。
      mesh.userData.detailChanged = true; mesh.geometry = geo;
      const P = geo.attributes.position, N = geo.attributes.normal;
      normal.getNormalMatrix(p.matrix);
      v.fromArray(p.pos).applyMatrix4(p.matrix);
      const hx = v.x, hy = v.y, hz = v.z;
      for (let i = 0; i < p.pos.length / 3; i++) {
        if (p.visible) v.fromArray(p.pos, i * 3).applyMatrix4(p.matrix);
        else v.set(hx, hy, hz);   // 区画の場所で面を潰し、描く範囲が原点まで広がるのを防ぐ。
        P.setXYZ(p.offset + i, v.x, v.y, v.z);
        v.fromArray(p.norm, i * 3).applyNormalMatrix(normal);
        N.setXYZ(p.offset + i, v.x, v.y, v.z);
      }
      P.needsUpdate = true; N.needsUpdate = true;
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      if (mesh.userData.refreshMaterialPart) mesh.userData.refreshMaterialPart(id);
      mesh.visible = visible > 0;
    };
    // BatchedPart と同じ窓口で、壊れ方・素材への差し替えを受ける。
    const adapter = {
      setMatrixAt(id, matrix) { const p = parts[id]; p.matrix.copy(matrix); if (p.visible) write(p, id); },
      setVisibleAt(id, value) {
        const p = parts[id];
        if (p.visible === value) return;
        p.visible = value; visible += value ? 1 : -1; write(p, id);
      },
    };
    cell.forEach((e, id) => { e.part._addInst(adapter, id); });
    if (materialBatch) materialShape(mesh, world, cell, parts);
    else if (world && false) distantShape(mesh, world);
    cell.forEach((e) => e.geo.dispose());
    scene.add(mesh); meshes.push(mesh);
  }
  return meshes;
}

// 遠景の細かな凹凸を格子へ寄せ、潰れた面を外す。設営時に一度だけ作る。
function distantShape(mesh, world) {
  const hi = mesh.geometry, lo = hi.clone(), P = lo.attributes.position;
  const grid = world.def?.distantDetailGrid || 0.25;
  for (let i = 0; i < P.count; i++) P.setXYZ(i,
    Math.round(P.getX(i) / grid) * grid, Math.round(P.getY(i) / grid) * grid, Math.round(P.getZ(i) / grid) * grid);
  const indices = [], I = hi.index, count = I ? I.count : P.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const ia = I ? I.getX(i) : i, ib = I ? I.getX(i + 1) : i + 1, ic = I ? I.getX(i + 2) : i + 2;
    a.fromBufferAttribute(P, ia); b.fromBufferAttribute(P, ib); c.fromBufferAttribute(P, ic);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) indices.push(ia, ib, ic);
  }
  // 減らせない区画や、細い柵ばかりで大半が消える区画は元の形を使う。
  if (indices.length >= count * 0.95 || indices.length < count * 0.2) { lo.dispose(); return; }
  lo.setIndex(indices); lo.computeBoundingBox(); lo.computeBoundingSphere();
  hi.computeBoundingBox();
  const bounds = hi.boundingBox.clone().union(lo.boundingBox), cameraPos = new THREE.Vector3(), nearest = new THREE.Vector3();
  const detail = { hi, lo, far: false, before: count / 3, after: indices.length / 3 };
  mesh.userData.distantDetail = detail;
  (world.buildingDetails || (world.buildingDetails = [])).push(detail);
  mesh.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(cameraPos); bounds.clampPoint(cameraPos, nearest);
    const d2 = cameraPos.distanceToSquared(nearest);
    detail.far = false && !mesh.userData.detailChanged && d2 > (detail.far ? 55 * 55 : 60 * 60);
    mesh.geometry = detail.far ? lo : hi;
  };
}

// 面の向きを六方向と斜面の四象限で分ける。石垣と屋根が混じっても裏の面を省ける。
// 設営時だけ作り、視点を動かすたびに全三角の頂点を調べ直さない。
function staticFaceGroups(indices, position, grid, cellSize = 0, normalStep = 0) {
  const groups = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), unit = new THREE.Vector3();
  const read = (v, i) => {
    v.fromBufferAttribute(position, i);
    if (grid) v.divideScalar(grid).round().multiplyScalar(grid);
  };
  for (let i = 0; i < indices.length; i += 3) {
    read(a, indices[i]); read(b, indices[i + 1]); read(c, indices[i + 2]);
    const cell = cellSize ? Math.floor((a.x + b.x + c.x) / (3 * cellSize)) + ',' +
      Math.floor((a.y + b.y + c.y) / (3 * cellSize)) + ',' + Math.floor((a.z + b.z + c.z) / (3 * cellSize)) : '';
    b.sub(a).cross(c.sub(a));
    const length = b.length();
    if (!length) continue; // 面積のない面は、影にも画面にも現れない。
    unit.copy(b).divideScalar(length);
    const axis = Math.abs(b.x) >= Math.abs(b.y) && Math.abs(b.x) >= Math.abs(b.z) ? 0 : Math.abs(b.y) >= Math.abs(b.z) ? 1 : 2;
    const value = b.getComponent(axis), sign = value < 0 ? -1 : 1;
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const us = b.getComponent(u) < 0 ? -1 : 1, vs = b.getComponent(v) < 0 ? -1 : 1;
    // 同じ象限でも屋根・石・丸太の面の向きが混じると、法線の余裕が
    // 広がって裏側まで残る。設営時に向きを分け、毎コマは囲みだけ調べる。
    const orientation = normalStep > 0 ? ':' + Math.round(unit.x / normalStep) + ',' +
      Math.round(unit.y / normalStep) + ',' + Math.round(unit.z / normalStep) : '';
    const key = cell + ':' + ((axis * 2 + (value < 0 ? 1 : 0)) * 4 + (us < 0 ? 2 : 0) + (vs < 0 ? 1 : 0)) + orientation;
    let group = groups.get(key);
    if (!group) {
      // 実際の最初の面を基準にする。屋根や柵の平行な面は、角度の余裕を付けずに裏を判定できる。
      const normal = unit.clone();
      group = { indices: [], box: new THREE.Box3(), axis, sign, cosine: 1, sine: 0, normal, coneCosine: 1, coneSine: 0, spread: 0, planeMin: Infinity, drawPass: -1,
        origin: a.clone(), normalMin: [Infinity, Infinity, Infinity], normalMax: [-Infinity, -Infinity, -Infinity], faceOffset: -Infinity };
      groups.set(key, group);
    }
    group.cosine = Math.min(group.cosine, length ? Math.abs(value) / length : 0);
    group.coneCosine = Math.min(group.coneCosine, length ? group.normal.dot(b) / length : 0);
    group.spread = Math.max(group.spread, group.normal.distanceTo(unit));
    // 各面の平面を原点から測る。囲みの半径を余裕に足す方式では、
    // 細い柵のすぐ裏や斜めの石垣まで表として残る。
    // 法線の各成分と平面の上限を保存し、全ての面が裏の束だけを外す。
    for (let axis = 0; axis < 3; axis++) {
      const n = unit.getComponent(axis);
      group.normalMin[axis] = Math.min(group.normalMin[axis], n);
      group.normalMax[axis] = Math.max(group.normalMax[axis], n);
    }
    group.faceOffset = Math.max(group.faceOffset, unit.x * (group.origin.x - a.x)
      + unit.y * (group.origin.y - a.y) + unit.z * (group.origin.z - a.z));
    for (let k = 0; k < 3; k++) {
      read(c, indices[i + k]);
      group.box.expandByPoint(c);
      group.planeMin = Math.min(group.planeMin, group.normal.dot(c));
    }
    group.indices.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  for (const group of groups.values()) {
    // 小区画は格子へ寄せた後の頂点を囲み、視点の行列が変わるたびに選び直す。
    // 移動・格子の余裕を重ねると、画面外の城壁や柵まで残る。丸め誤差だけ残す。
    group.box.expandByScalar(cellSize ? 0.002 : grid * 1.74 + 0.6);
    // 材質全体の囲みでは、長い城壁の裏面まで近景として残る。
    // 面の束自身の囲みを一度だけ作り、柵と城の見えない面を判定する。
    group.sphere = group.box.getBoundingSphere(new THREE.Sphere());
    group.terrainHidden = false;
    group.indices = Uint32Array.from(group.indices);
    group.sine = Math.sqrt(Math.max(0, 1 - group.cosine * group.cosine));
    group.coneSine = Math.sqrt(Math.max(0, 1 - group.coneCosine * group.coneCosine));
  }
  return Array.from(groups.values());
}

// 小谷の城：区画を消しても、同じ材質は一回で描く。破壊後は既存の窓口で元の形へ戻す。
function materialShape(mesh, world, entries, parts) {
  const hi = mesh.geometry, lo = new THREE.BufferGeometry();
  // 書き換える位置と法線だけ複製する。色・木目などは近景と共有し、
  // 直後に置き換える索引も複製しない。城全体の支度で写しを重ねない。
  for (const [name, attribute] of Object.entries(hi.attributes))
    lo.setAttribute(name, name === 'position' || name === 'normal' ? attribute.clone() : attribute);
  const P = lo.attributes.position;
  const grid = world.def.distantDetailGrid || 0.25;
  const farGrid = world.def.distantDetailFarGrid || grid;
  const farDetail = farGrid > grid;
  const beforeDraw = !!world.def.staticBatchBeforeDraw;
  // 両面の布・半透明の物は対象外。画面と影で、それぞれ映る向きの面を残す。
  const faceCull = world.def.staticBackfaceCull && mesh.material.side === THREE.FrontSide && !mesh.material.transparent;
  const faceCache = new WeakMap();
  const faceCell = world.def.staticFaceCell || 0;
  const normalStep = world.def.staticFaceNormalStep || 0;
  for (let i = 0; i < P.count; i++) P.setXYZ(i,
    Math.round(P.getX(i) / grid) * grid, Math.round(P.getY(i) / grid) * grid, Math.round(P.getZ(i) / grid) * grid);
  const ranges = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let vertex = 0;
  for (const entry of entries) {
    const src = entry.geo, I = src.index, count = I ? I.count : src.attributes.position.count;
    const full = new Uint32Array(count), light = [], distant = [];
    for (let i = 0; i < count; i += 3) {
      const ia = vertex + (I ? I.getX(i) : i), ib = vertex + (I ? I.getX(i + 1) : i + 1), ic = vertex + (I ? I.getX(i + 2) : i + 2);
      full[i] = ia; full[i + 1] = ib; full[i + 2] = ic;
      a.fromBufferAttribute(P, ia); b.fromBufferAttribute(P, ib); c.fromBufferAttribute(P, ic);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) light.push(ia, ib, ic);
      if (farDetail) {
        a.fromBufferAttribute(hi.attributes.position, ia).divideScalar(farGrid).round().multiplyScalar(farGrid);
        b.fromBufferAttribute(hi.attributes.position, ib).divideScalar(farGrid).round().multiplyScalar(farGrid);
        c.fromBufferAttribute(hi.attributes.position, ic).divideScalar(farGrid).round().multiplyScalar(farGrid);
        if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) distant.push(ia, ib, ic);
      }
    }
    // 細い柵が格子へ潰れすぎる場合は、輪郭を保つ元の面を選ぶ。
    const usable = light.length >= count * 0.2 && light.length < count * 0.95;
    src.computeBoundingBox(); src.computeBoundingSphere();
    const middle = usable ? Uint32Array.from(light) : full;
    // 細い杭や横木を失う区画は、遠くでも元の輪郭を残す。
    const farUsable = farDetail && distant.length >= count * 0.2 && distant.length < middle.length;
    const farIndices = farUsable ? Uint32Array.from(distant) : middle;
    if (faceCull) {
      faceCache.set(full, staticFaceGroups(full, hi.attributes.position, 0, faceCell, normalStep));
      if (middle !== full) faceCache.set(middle, staticFaceGroups(middle, hi.attributes.position, grid, faceCell, normalStep));
      if (farIndices !== middle) faceCache.set(farIndices, staticFaceGroups(farIndices, hi.attributes.position, farGrid, faceCell, normalStep));
    }
    ranges.push({ full, light: middle, distant: farIndices,
      box: src.boundingBox.clone().expandByScalar(farGrid + 3), sphere: src.boundingSphere.clone(),
      vertex, vertices: src.attributes.position.count, far: null });
    vertex += src.attributes.position.count;
  }
  // 頂点は区画の遠さが変わる時だけ写す。二組を並べず、携帯の素材の容量を抑える。
  const packed = lo;
  const indices = new Uint32Array(ranges.reduce((n, r) => n + r.full.length, 0));
  packed.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage));
  packed.computeBoundingSphere(); mesh.geometry = packed;
  (world.buildingDetails || (world.buildingDetails = [])).push({ hi, lo: packed });
  const cameraPos = new THREE.Vector3(), nearest = new THREE.Vector3(), frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const lastPos = new THREE.Vector3(Infinity, Infinity, Infinity), lastDir = new THREE.Vector3(), direction = new THREE.Vector3();
  const detailNear = world.def.distantDetailNear ?? 50;
  const detailFar = world.def.distantDetailFar ?? Infinity;
  // 束にする前の部品の囲みで測る。近い柵と門は残し、遠くの小部品だけを省く。
  const smallPart = (r, shadow = false) => {
    if (!world.def.distantPartCull) return false;
    const d2 = r.sphere.center.distanceToSquared(cameraPos);
    return d2 > 28 * 28 && r.sphere.radius ** 2 < d2 * (shadow ? 0.02 ** 2 : 0.008 ** 2);
  };
  let lastCamera = null, lastProjection = 0;
  // 画面の描き込み（m）と影の描き込み（s）で入る区画が違う。影は本人の回りの影の箱に入る区画だけを描く
  //   （前は画面に入る城の全部を影でも描いていた）。索引を「画面だけ・両方・影だけ」の順に並べ、描く範囲だけを替える
  const onM = new Uint8Array(ranges.length), onS = new Uint8Array(ranges.length), lastSh = new THREE.Matrix4();
  const shadowDirection = new THREE.Vector3();
  const mainFrustum = new THREE.Frustum(), shadowFrustum = new THREE.Frustum();
  const lastMainMatrix = new THREE.Matrix4();
  let shadowSide = THREE.DoubleSide, parallelShadow = false;
  let mainN = 0, shStart = 0, shN = 0, dirty = true, shFirst = true;
  // 壊れた一区画だけ元の形へ戻す。残る城の区画の省略と遠景の形は保つ。
  mesh.userData.refreshMaterialPart = (id) => {
    const r = ranges[id], first = r.vertex * 3, end = first + r.vertices * 3;
    r.changed = true; r.far = 0;
    r.box.makeEmpty();
    for (let k = first; k < end; k += 3) {
      a.fromArray(hi.attributes.position.array, k); r.box.expandByPoint(a);
      for (let axis = 0; axis < 3; axis++) {
        P.array[k + axis] = hi.attributes.position.array[k + axis];
        packed.attributes.normal.array[k + axis] = hi.attributes.normal.array[k + axis];
      }
    }
    r.box.expandByScalar(farGrid + 3); r.box.getBoundingSphere(r.sphere);
    P.needsUpdate = true; packed.attributes.normal.needsUpdate = true;
    packed.computeBoundingBox(); packed.computeBoundingSphere();
    mesh.geometry = packed; lastCamera = null; shFirst = true; dirty = true;
  };
  const setFar = (r) => {
    if (r.changed) return false;
    r.box.clampPoint(cameraPos, nearest);
    const d2 = cameraPos.distanceToSquared(nearest);
    const near = r.far ? Math.max(0, detailNear - 5) : detailNear;
    const farNear = r.far === 2 ? Math.max(0, detailFar - 5) : detailFar;
    const far = farDetail && d2 > farNear * farNear ? 2 : d2 > near * near ? 1 : 0;
    if (far === r.far) return false;
    const distant = far === 2 && r.distant !== r.light;
    // 格子へ寄せた座標の全城分の写しは持たず、遠さを切り替える区画だけ計算する。
    const source = hi.attributes.position.array;
    const snapGrid = distant ? farGrid : far && r.light !== r.full ? grid : 0;
    const first = r.vertex * 3, end = first + r.vertices * 3;
    for (let k = first; k < end; k++) P.array[k] = snapGrid ? Math.round(source[k] / snapGrid) * snapGrid : source[k];
    r.far = far;
    return true;
  };
  const pack = () => {
    dirty = false;
    let n = 0, changed = false;
    const write = (list) => { for (let k = 0; k < list.length; k++, n++) if (indices[n] !== list[k]) { indices[n] = list[k]; changed = true; } };
    const put = (j, pass) => {
      const r = ranges[j], chosen = r.far === 2 ? r.distant : r.far ? r.light : r.full;
      if (!faceCull || r.changed) {
        if ((onM[j] ? (onS[j] ? 1 : 0) : 2) === pass) write(chosen);
        return;
      }
      const groups = faceCache.get(chosen);
      const perspective = lastCamera?.isPerspectiveCamera;
      for (const group of groups) {
        // 画面だけ・両方・影だけの三巡で、同じ面の判定を繰り返さない。
        // 画面の区画は最初の巡回、影だけの区画は最後の巡回で一度だけ選ぶ。
        if (pass === 0 || !onM[j]) {
          const center = group.sphere.center;
          const dx = lastPos.x - center.x, dy = lastPos.y - center.y, dz = lastPos.z - center.z;
          const distance = perspective ? Math.hypot(dx, dy, dz) : 1;
          // 囲みは格子への寄せと半メートルの視点移動を含む。
          const margin = perspective ? group.sphere.radius : 0.02;
          const component = perspective ? (group.axis === 0 ? dx : group.axis === 1 ? dy : dz) : -lastDir.getComponent(group.axis);
          const cone = perspective ? group.normal.x * dx + group.normal.y * dy + group.normal.z * dz : -group.normal.dot(lastDir);
          // 平行な壁では、囲みの半径を丸ごと余裕にすると裏の面まで残る。
          // 基準面からの位置と法線の差の上限で、全三角が確実に裏になる束だけを外す。
          // 区画で選ぶ戦は視点の行列が変わるたびに詰め直すため、
          // 半メートルの移動の余裕は不要。薄い柵や壁の裏まで送らない。
          // 格子へ寄せた後の面で作った基準面と、法線の広がりは保つ。
          const plane = group.normal.dot(lastPos) - group.planeMin;
          const allowance = group.spread * (distance + margin) + (faceCell ? 0.002 : 0.6);
          const fx = lastPos.x - group.origin.x, fy = lastPos.y - group.origin.y, fz = lastPos.z - group.origin.z;
          const faceUpper = group.faceOffset + fx * (fx >= 0 ? group.normalMax[0] : group.normalMin[0])
            + fy * (fy >= 0 ? group.normalMax[1] : group.normalMin[1])
            + fz * (fz >= 0 ? group.normalMax[2] : group.normalMin[2]);
          const main = onM[j] && !group.terrainHidden && (!faceCell || mainFrustum.intersectsBox(group.box)) && component * group.sign >= -group.sine * distance - margin && cone >= -group.coneSine * distance - margin && (!perspective || plane >= -allowance && faceUpper >= -(faceCell ? 0.002 : 0.6));
          // 平行光の影だけ、深度材質が元々描かない向きの面を送らない。
          // 法線の広がりと余裕を残すため、斜面の影や輪郭は削らない。
          const facing = -group.normal.dot(shadowDirection);
          const shadow = onS[j] && (!faceCell || shadowFrustum.intersectsBox(group.box)) && (!parallelShadow || shadowSide === THREE.DoubleSide ||
            (shadowSide === THREE.BackSide ? facing <= group.coneSine + 0.02 : facing >= -group.coneSine - 0.02));
          group.drawPass = main ? (shadow ? 1 : 0) : shadow ? 2 : -1;
        }
        if (group.drawPass === pass) write(group.indices);
      }
    };
    for (let j = 0; j < ranges.length; j++) if (onM[j]) put(j, 0);
    shStart = n;
    for (let j = 0; j < ranges.length; j++) if (onM[j] && onS[j]) put(j, 1);
    mainN = n;
    for (let j = 0; j < ranges.length; j++) if (onS[j]) put(j, 2);
    shN = n - shStart;
    if (changed) packed.index.needsUpdate = true;
  };
  mesh.onBeforeShadow = (renderer, object, camera, shadowCamera) => {
    if (!world.def.distantMaterialBatch) return;
    // 専用の深度材質は独自の面指定を持てるので、元の面を全て渡す。
    const parallel = shadowCamera.isOrthographicCamera && !mesh.customDepthMaterial && !mesh.customDistanceMaterial;
    const side = mesh.material.shadowSide ?? (renderer.shadowMap.type === THREE.VSMShadowMap ? mesh.material.side :
      mesh.material.side === THREE.FrontSide ? THREE.BackSide : mesh.material.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
    shadowCamera.getWorldDirection(direction);
    if (parallel !== parallelShadow || side !== shadowSide || direction.distanceToSquared(shadowDirection) > 1e-12) {
      parallelShadow = parallel; shadowSide = side; shadowDirection.copy(direction); dirty = true;
    }
    pm.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    if (shFirst || !pm.equals(lastSh)) {
      shFirst = false; lastSh.copy(pm); frustum.setFromProjectionMatrix(pm);
      shadowFrustum.setFromProjectionMatrix(pm); if (faceCell) dirty = true;
      camera.getWorldPosition(cameraPos);
      let moved = false;
      for (let j = 0; j < ranges.length; j++) {
        const on = parts[j].visible && !smallPart(ranges[j], true) && frustum.intersectsBox(ranges[j].box) ? 1 : 0;
        if (on !== onS[j]) { onS[j] = on; dirty = true; }
        if (!beforeDraw && on && !onM[j] && setFar(ranges[j])) { moved = true; dirty = true; }
      }
      if (moved) P.needsUpdate = true;
    }
    // 転送前に準備する戦は、影の向きと範囲の変更も次の転送へまとめる。
    // ここで詰め直すと、転送済みの索引と描く範囲が食い違う。
    if (dirty && !beforeDraw) pack();
    packed.setDrawRange(shStart, shN);
  };
  const prepareDraw = (renderer, scene, camera) => {
    if (!world.def.distantMaterialBatch) { mesh.geometry = hi; return; }
    mesh.geometry = packed;
    camera.getWorldPosition(cameraPos); camera.getWorldDirection(direction);
    const projection = camera.projectionMatrix.elements[0];
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const sameView = faceCell ? pm.equals(lastMainMatrix) : cameraPos.distanceToSquared(lastPos) < 0.25
      && direction.dot(lastDir) > 0.99995 && projection === lastProjection;
    if (lastCamera === camera && sameView) { if (dirty) pack(); packed.setDrawRange(0, mainN); return; }
    lastCamera = camera; lastPos.copy(cameraPos); lastDir.copy(direction); lastProjection = projection;
    lastMainMatrix.copy(pm);
    if (faceCull) dirty = true;
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    mainFrustum.setFromProjectionMatrix(pm);
    let moved = false;
    for (let j = 0; j < ranges.length; j++) {
      const r = ranges[j];
      const on = parts[j].visible && !smallPart(r) && frustum.intersectsBox(r.box) && !(camera.isPerspectiveCamera && world.terrainHidden(cameraPos.x, cameraPos.y, cameraPos.z, r.sphere)) ? 1 : 0;
      if (on !== onM[j]) { onM[j] = on; dirty = true; }
      if (on && setFar(r)) { moved = true; dirty = true; }
      // 長い塀の一端が見えていても、山腹の裏の区画は画面へ送らない。
      // 影の範囲は別に保つ。視点を替えた時だけ調べ、詰め直しの三巡で使い回す。
      if (on && faceCull && !r.changed && world.def.staticTerrainCull) {
        const chosen = r.far === 2 ? r.distant : r.far ? r.light : r.full;
        for (const group of faceCache.get(chosen)) group.terrainHidden = !!camera.isPerspectiveCamera
          && mainFrustum.intersectsBox(group.box) && world.terrainHidden(cameraPos.x, cameraPos.y, cameraPos.z, group.sphere, group.box);
      }
    }
    if (dirty) pack();
    packed.setDrawRange(0, mainN);
    if (moved) P.needsUpdate = true;
  };
  if (beforeDraw) {
    (world.materialDrawPreparers || (world.materialDrawPreparers = [])).push(prepareDraw);
    // 画面と影を描く時は、同じ転送で確定した範囲だけを切り替える。
    mesh.onBeforeRender = () => { packed.setDrawRange(0, mainN); };
  } else mesh.onBeforeRender = prepareDraw;
}

// iPhone の静止物。同じ形と材質をそのまま共有し、増やすのは配置の行列だけ。
// 当たりは描画と別の箱に控える。戸口を塞がないよう、箱は元の部品ごとに持つ。
export function* staticPropInstances(items, material) {
  const geometry = items[0].geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const boxes = [];
  let ready = false;
  try {
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      mesh.setMatrixAt(i, o.matrixWorld);
      boxes.push(geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      yield;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mesh.userData.staticCollisionBoxes = boxes;
    // 箱で絞ってから元の面で判定する。屋根の斜面・戸口・柵の隙間を保つ。
    mesh.raycast = function (raycaster, hits) {
      for (let i = 0; i < items.length; i++) {
        if (!raycaster.ray.intersectsBox(boxes[i])) continue;
        const first = hits.length;
        THREE.Mesh.prototype.raycast.call(items[i], raycaster, hits);
        for (let j = first; j < hits.length; j++) { hits[j].object = this; hits[j].instanceId = i; }
      }
    };
    // 影の距離処理が共有の形へ足した補助属性だけを返す。元の形と材質は捨てない。
    const dispose = mesh.dispose;
    mesh.dispose = function () {
      const state = this._nearShadow;
      if (state && geometry.attributes[state.key] === state.attribute) geometry.deleteAttribute(state.key);
      dispose.call(this);
    };
    ready = true;
    return mesh;
  } finally {
    if (!ready) mesh.dispose();
  }
}

// 静止した小道具も材質ごとの束へ。元の形と行列を保ち、壊れた時は呼び手が元へ戻す。
// 作成を小分けにし、大量の幟の竿や床几でも一コマへ転送を集中させない。
export function* staticPropBatch(items, material) {
  let vertices = 0, indices = 0;
  for (const o of items) {
    vertices += o.geometry.attributes.position.count;
    indices += o.geometry.index?.count || o.geometry.attributes.position.count;
  }
  const mesh = new THREE.BatchedMesh(items.length, vertices, indices, material);
  let ready = false;
  try {
    // 影の初回に全ての囲みを new・計算しない。形を転送する小分けの枠で支度する。
    // この束は場面の直下へ単位行列で置くので、部品の行列がそのまま世界の行列になる。
    const shadowParts = [];
    for (const o of items) {
      const id = mesh.addGeometry(o.geometry);
      mesh.setMatrixAt(id, o.matrixWorld);
      const sphere = new THREE.Sphere();
      mesh.getBoundingSphereAt(id, sphere).applyMatrix4(o.matrixWorld);
      shadowParts.push({ sphere, near: true });
      yield;
    }
    mesh.userData.staticShadowParts = shadowParts;
    // 画面と影はそれぞれのカメラで部品ごとに判定する。面や細部は削らない。
    mesh.userData.staticPartCount = items.length;
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    const hidden = [];
    mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, mat, group) {
      hidden.length = 0;
      const parts = this.userData.staticShadowParts;
      if (parts) for (let i = 0; i < parts.length; i++) {
        if (!parts[i].near && this.getVisibleAt(i)) { this.setVisibleAt(i, false); hidden.push(i); }
      }
      THREE.BatchedMesh.prototype.onBeforeRender.call(this, renderer, null, shadowCamera, geometry, mat, group);
    };
    mesh.onAfterShadow = function () {
      for (const id of hidden) this.setVisibleAt(id, true);
      hidden.length = 0;
    };
    // カメラの壁判定は元の形で受ける。場面から外した部品も行列は保持している。
    mesh.raycast = function (raycaster, hits) {
      for (const o of items) {
        const material = o.material, first = hits.length;
        o.material = this.material;
        try { THREE.Mesh.prototype.raycast.call(o, raycaster, hits); }
        finally { o.material = material; }
        for (let i = first; i < hits.length; i++) hits[i].object = this;
      }
    };
    ready = true;
    return mesh;
  } finally {
    if (!ready) { mesh.dispose(); }
  }
}
