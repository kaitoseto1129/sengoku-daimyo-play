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

// 足場・頂点・材質は同じ。遠い平坦な地面と画面外の面だけ索引から減らす。
export function terrainView(mesh, cellSize = 64, scene = null, clipSize = 0) {
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
    for (const cell of cells) {
      box.copy(cell.box).expandByScalar(0.1);
      cell.box.clampPoint(cameraPoint, nearest);
      const distance2 = cameraPoint.distanceToSquared(nearest);
      // 霧の終点より外の地形は送らない。足場の索引と近い切岸は元のまま。
      const on = (!camera.isPerspectiveCamera || distance2 <= 140 * 140) && frustum.intersectsBox(box);
      const far = camera.isPerspectiveCamera && cell.error <= 0.08 && distance2 > (cell.far ? 75 * 75 : 85 * 85);
      if (on !== cell.on || far !== cell.far) { cell.on = on; cell.far = far; changed = true; }
      if (on && !far && cell.children) {
        const whole = !cell.childCoarse && inside(box);
        if (whole !== cell.whole) { cell.whole = whole; changed = true; }
        if (!whole) for (const child of cell.children) {
          box.copy(child.box).expandByScalar(0.1);
          const visible = frustum.intersectsBox(box);
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
        for (const child of cell.children) if (child.on) {
          const indices = child.far ? child.coarse : child.indices;
          packed.array.set(indices, count); count += indices.length;
        }
        continue;
      }
      const indices = cell.far ? cell.coarse : cell.indices;
      packed.array.set(indices, count); count += indices.length;
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
