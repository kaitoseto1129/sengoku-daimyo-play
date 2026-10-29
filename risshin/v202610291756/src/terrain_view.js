import * as THREE from 'three';

// 格子の周囲は一頂点も抜かない。隣が細かい形でも区画の継ぎ目は同じ線になる。
// 高さの差は元の各三角形の頂点でも調べ、急な切岸は元の面のまま残す。
export function terrainPatches(position, source, width, height, size = 8) {
  const cells = [], stride = width + 1;
  for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) {
    const right = Math.min(width, x + size), bottom = Math.min(height, y + size);
    const indices = [], ring = [], coarse = [], box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let j = y; j <= bottom; j++) for (let i = x; i <= right; i++) box.expandByPoint(point.fromBufferAttribute(position, j * stride + i));
    for (let j = y; j < bottom; j++) for (let i = x; i < right; i++) {
      const at = (j * width + i) * 6;
      for (let k = 0; k < 6; k++) indices.push(source.getX(at + k));
    }
    for (let i = x; i < right; i++) ring.push(y * stride + i);
    for (let j = y; j < bottom; j++) ring.push(j * stride + right);
    for (let i = right; i > x; i--) ring.push(bottom * stride + i);
    for (let j = bottom; j > y; j--) ring.push(j * stride + x);
    const center = Math.floor((y + bottom) / 2) * stride + Math.floor((x + right) / 2);
    let error = 0;
    if (right - x < 2 || bottom - y < 2) error = Infinity;
    else {
      for (let k = 0; k < ring.length; k++) coarse.push(center, ring[(k + 1) % ring.length], ring[k]);
      const origin = y * stride + x, east = y * stride + right, south = bottom * stride + x;
      const h0 = position.getY(origin), dx = position.getY(east) - h0, dz = position.getY(south) - h0;
      for (let j = y; j <= bottom; j++) for (let i = x; i <= right; i++) {
        const plane = h0 + dx * (i - x) / (right - x) + dz * (j - y) / (bottom - y);
        error = Math.max(error, 2 * Math.abs(position.getY(j * stride + i) - plane));
      }
    }
    // 全頂点が同じ平面から誤差の半分以内なら、三角形の交差点でも
    // 元の面と粗い面の高さの差は誤差以内。切岸と道の段差は元の形を残す。
    cells.push({ x, y, box, indices: new source.array.constructor(indices), coarse: new source.array.constructor(coarse), error, on: true, far: false });
  }
  return cells;
}

// 区画の全ての面の法線と平面の範囲。細かな形と遠景の形を両方含める。
// 開戦時だけ法線を保存。区画全体の裏面を先に外し、混在する区画だけ面を選ぶ。
function terrainFaceBounds(cell, position) {
  const x = (cell.box.min.x + cell.box.max.x) / 2;
  const y = (cell.box.min.y + cell.box.max.y) / 2;
  const z = (cell.box.min.z + cell.box.max.z) / 2;
  const bounds = { x, y, z, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], offset: -Infinity };
  cell.facePlanes = [];
  for (const indices of [cell.indices, cell.coarse || []]) {
    const planes = new Float64Array(indices.length / 3 * 4);
    cell.facePlanes.push(planes);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a);
      const bx = position.getX(b) - ax, by = position.getY(b) - ay, bz = position.getZ(b) - az;
      const cx = position.getX(c) - ax, cy = position.getY(c) - ay, cz = position.getZ(c) - az;
      let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      const length = Math.hypot(nx, ny, nz);
      if (!length) continue;
      nx /= length; ny /= length; nz /= length;
      const at = i / 3 * 4;
      planes[at] = nx; planes[at + 1] = ny; planes[at + 2] = nz;
      planes[at + 3] = -(nx * ax + ny * ay + nz * az);
      const normal = [nx, ny, nz];
      for (let k = 0; k < 3; k++) {
        bounds.min[k] = Math.min(bounds.min[k], normal[k]);
        bounds.max[k] = Math.max(bounds.max[k], normal[k]);
      }
      bounds.offset = Math.max(bounds.offset, nx * (x - ax) + ny * (y - ay) + nz * (z - az));
    }
  }
  cell.faceBounds = bounds;
}

// 見える面が混じった区画でも裏面だけを外す。法線は設営時の配列を使い回す。
function terrainPackFaces(cell, target, count, point, cull) {
  const indices = cell.far ? cell.coarse : cell.indices;
  if (!cull) { target.set(indices, count); return count + indices.length; }
  const planes = cell.facePlanes[cell.far ? 1 : 0];
  for (let i = 0, p = 0; i < indices.length; i += 3, p += 4) {
    if (planes[p] * point.x + planes[p + 1] * point.y + planes[p + 2] * point.z + planes[p + 3] < -0.01) continue;
    target[count++] = indices[i]; target[count++] = indices[i + 1]; target[count++] = indices[i + 2];
  }
  return count;
}

function terrainFacesHidden(cell, point) {
  const b = cell.faceBounds;
  const x = point.x - b.x, y = point.y - b.y, z = point.z - b.z;
  // 各法線の内積より必ず大きい値。地表すれすれの面も余裕を付けて残す。
  return b.offset + x * (x >= 0 ? b.max[0] : b.min[0])
    + y * (y >= 0 ? b.max[1] : b.min[1]) + z * (z >= 0 ? b.max[2] : b.min[2]) < -0.01;
}

// 足場・頂点・材質は同じ。遠い平坦な地面と画面外の面だけ索引から減らす。
export function terrainView(mesh, cellSize = 64, scene = null, clipSize = 0, backfaceCull = false) {
  mesh.userData.noFreeze = true;
  let geometry = null, cells = [], packed = null;
  const point = new THREE.Vector3(), box = new THREE.Box3(), nearest = new THREE.Vector3();
  const cameraPoint = new THREE.Vector3(), inverse = new THREE.Matrix4();
  const projection = new THREE.Matrix4(), previous = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  // 区画全体が画面内なら、その中の二升ずつを調べ直さない。
  // 各面に最も近い頂点まで内側なら、余裕を付けた箱全体が内側にある。
  const inside = (bounds) => {
    for (const plane of frustum.planes) {
      const n = plane.normal;
      if (n.x * (n.x >= 0 ? bounds.min.x : bounds.max.x)
        + n.y * (n.y >= 0 ? bounds.min.y : bounds.max.y)
        + n.z * (n.z >= 0 ? bounds.min.z : bounds.max.z) + plane.constant < 0) return false;
    }
    return true;
  };
  let first = true;
  const prepare = () => {
    geometry = mesh.geometry;
    const position = geometry.attributes.position, source = geometry.index;
    if (!source) { packed = null; return; }
    const { widthSegments, heightSegments } = geometry.parameters || {};
    if (widthSegments && heightSegments && source.count === widthSegments * heightSegments * 6) {
      cells = terrainPatches(position, source, widthSegments, heightSegments);
      // 長い前線と山城だけ、元の八升の内側を小さく選別する。
      // 遠景の平坦部は元の粗い面を使い、細分化で面数を増やさない。
      if (clipSize > 0 && clipSize < 8 && 8 % clipSize === 0) {
        const columns = Math.ceil(widthSegments / 8);
        for (const cell of cells) cell.children = [];
        for (const child of terrainPatches(position, source, widthSegments, heightSegments, clipSize)) {
          // 二升の扇形は元と同じ八面。減らせない形への切り替えは不要。
          child.reduce = child.coarse.length > 0 && child.coarse.length < child.indices.length;
          cells[Math.floor(child.y / 8) * columns + Math.floor(child.x / 8)].children.push(child);
        }
        for (const cell of cells) cell.childCoarse = cell.children.some(child => child.reduce);
        // 二升の画面端選別を保ち、四升の平坦部だけは中間の粗い面へまとめる。
        // 境界の全頂点を残すため、隣の切岸との継ぎ目も動かさない。
        if (clipSize === 2) {
          for (const cell of cells) cell.middle = [];
          for (const middle of terrainPatches(position, source, widthSegments, heightSegments, 4)) {
            const cell = cells[Math.floor(middle.y / 8) * columns + Math.floor(middle.x / 8)];
            middle.far = false;
            cell.middle.push(middle);
            for (const child of cell.children) if (child.x >= middle.x && child.x < middle.x + 4
              && child.y >= middle.y && child.y < middle.y + 4) child.middle = middle;
          }
        }
      }
    } else {
      const groups = new Map();
      for (let i = 0; i < source.count; i += 3) {
        const a = source.getX(i), b = source.getX(i + 1), c = source.getX(i + 2);
        const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
        const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
        const key = Math.floor(x / cellSize) + ',' + Math.floor(z / cellSize);
        let cell = groups.get(key);
        if (!cell) { cell = { box: new THREE.Box3(), indices: [], error: Infinity, on: true, far: false }; groups.set(key, cell); }
        cell.indices.push(a, b, c);
        for (const id of [a, b, c]) cell.box.expandByPoint(point.fromBufferAttribute(position, id));
      }
      cells = Array.from(groups.values());
      for (const cell of cells) cell.indices = new source.array.constructor(cell.indices);
    }
    if (backfaceCull) for (const cell of cells) {
      terrainFaceBounds(cell, position);
      if (cell.children) for (const child of cell.children) terrainFaceBounds(child, position);
      if (cell.middle) for (const middle of cell.middle) terrainFaceBounds(middle, position);
    }
    // 足場と地形の遮蔽判定は常に元の全ての面を読む。
    geometry.userData.terrainViewIndex = source.array;
    packed = new THREE.BufferAttribute(source.array.slice(), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(packed);
    first = true;
  };
  const before = mesh.onBeforeRender;
  const update = function (renderer, scene, camera, geo, material, group) {
    before.call(this, renderer, scene, camera, geo, material, group);
    if (geometry !== this.geometry) prepare();
    if (!packed) return;
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld);
    if (!first && projection.equals(previous)) return;
    previous.copy(projection); frustum.setFromProjectionMatrix(projection);
    inverse.copy(this.matrixWorld).invert(); cameraPoint.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
    let changed = first;
    first = false;
    // 影・地図・両面材質は従来どおり。地形の裏面だけを描画の前に省く。
    const cullFaces = backfaceCull && camera.isPerspectiveCamera && this.material.side === THREE.FrontSide
      && this.matrixWorld.determinant() > 0;
    // 区画の出入りが同じでも、視点の移動で区画内の面の表裏は変わる。
    if (cullFaces || this.userData.terrainFaceCull !== cullFaces) changed = true;
    this.userData.terrainFaceCull = cullFaces;
    for (const cell of cells) {
      box.copy(cell.box).expandByScalar(0.1);
      cell.box.clampPoint(cameraPoint, nearest);
      const distance2 = cameraPoint.distanceToSquared(nearest);
      // 霧の終点より外の地形は送らない。足場の索引と近い切岸は元のまま。
      const on = (!camera.isPerspectiveCamera || distance2 <= 140 * 140) && frustum.intersectsBox(box)
        && !(cullFaces && terrainFacesHidden(cell, cameraPoint));
      const far = camera.isPerspectiveCamera && cell.error <= 0.08 && distance2 > (cell.far ? 75 * 75 : 85 * 85);
      if (on !== cell.on || far !== cell.far) { cell.on = on; cell.far = far; changed = true; }
      if (on && !far && cell.children) {
        let middleCoarse = false;
        if (cell.middle) for (const middle of cell.middle) {
          middle.box.clampPoint(cameraPoint, nearest);
          // 画面内に丸ごと入る遠い平坦部だけ。画面端は従来の二升で選ぶ。
          const reduce = camera.isPerspectiveCamera && middle.coarse.length > 0
            && middle.coarse.length < middle.indices.length && middle.error <= 0.08
            && cameraPoint.distanceToSquared(nearest) > (middle.far ? 75 * 75 : 85 * 85)
            && inside(box.copy(middle.box).expandByScalar(0.1));
          if (reduce !== middle.far) { middle.far = reduce; changed = true; }
          middleCoarse ||= reduce;
        }
        const fullyInside = inside(box.copy(cell.box).expandByScalar(0.1));
        const whole = !cullFaces && !cell.childCoarse && !middleCoarse && fullyInside;
        if (whole !== cell.whole) { cell.whole = whole; changed = true; }
        if (!whole) for (const child of cell.children) {
          box.copy(child.box).expandByScalar(0.1);
          const visible = (fullyInside || frustum.intersectsBox(box))
            && !(cullFaces && terrainFacesHidden(child, cameraPoint));
          // 大区画に切岸があっても、遠い平坦な小区画まで元の全ての面を送らない。
          // 高さの誤差・距離・境界の頂点は大区画と同じ条件で保つ。
          let childFar = false;
          if (child.reduce && camera.isPerspectiveCamera && child.error <= 0.08) {
            child.box.clampPoint(cameraPoint, nearest);
            childFar = cameraPoint.distanceToSquared(nearest) > (child.far ? 75 * 75 : 85 * 85);
          }
          if (visible !== child.on || childFar !== child.far) { child.on = visible; child.far = childFar; changed = true; }
        }
      }
    }
    if (!changed) return;
    let count = 0;
    for (const cell of cells) if (cell.on) {
      if (!cell.far && cell.children && !cell.whole) {
        if (cell.middle) for (const middle of cell.middle) if (middle.far) {
          count = terrainPackFaces(middle, packed.array, count, cameraPoint, cullFaces);
        }
        for (const child of cell.children) if (child.on && !child.middle?.far) {
          count = terrainPackFaces(child, packed.array, count, cameraPoint, cullFaces);
        }
        continue;
      }
      count = terrainPackFaces(cell, packed.array, count, cameraPoint, cullFaces);
    }
    packed.needsUpdate = true;
    geometry.setDrawRange(0, count);
  };
  // 個々の面の描画直前では、索引の転送が既に終わっている。
  // 面数だけ新しくなると古い末尾が巨大な三角を描くため、転送前に詰める。
  // 視点補正後でも、面自身の描画時には索引を変更しない。
  // 転送済みの索引と新しい面数が混ざると、地面の穴や長大な三角形になる。
  mesh.onBeforeRender = scene ? before : update;
  if (scene) {
    const beforeScene = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, drawnScene, camera, target) {
      beforeScene.call(this, renderer, drawnScene, camera, target);
      if (mesh.parent !== this || mesh.onBeforeRender !== before) return;
      mesh.updateWorldMatrix(true, false);
      update.call(mesh, renderer, drawnScene, camera, mesh.geometry, mesh.material, null);
    };
  }
}
