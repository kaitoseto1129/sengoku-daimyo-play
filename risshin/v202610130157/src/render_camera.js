// 描く地面の三角形を読む。歩行用の四隅の補間は変えない。
// 鳥取のように三角形を細分した地面も、実際の頂点から調べる。
const terrainCells = new WeakMap();

export function drawGroundAt(world, x, z) {
  const geo = world.terrain?.geometry, p = geo?.attributes.position, index = geo?.index?.array;
  const half = world.half, step = world.step, n = Math.round(half * 2 / step);
  if (!p || !index || Math.abs(x) >= half || Math.abs(z) >= half) return world.heightAt(x, z);
  let cells = terrainCells.get(geo);
  if (!cells) {
    // 格子ごとの面の番号だけを一度作る。以後は足もとの数枚だけを読む。
    const counts = new Uint32Array(n * n), starts = new Uint32Array(n * n + 1);
    const visit = (k, faces) => {
      const a = index[k], b = index[k + 1], c = index[k + 2];
      const x0 = Math.max(0, Math.floor((Math.min(p.getX(a), p.getX(b), p.getX(c)) + half) / step + 1e-5));
      const x1 = Math.min(n - 1, Math.floor((Math.max(p.getX(a), p.getX(b), p.getX(c)) + half) / step - 1e-5));
      const z0 = Math.max(0, Math.floor((Math.min(p.getZ(a), p.getZ(b), p.getZ(c)) + half) / step + 1e-5));
      const z1 = Math.min(n - 1, Math.floor((Math.max(p.getZ(a), p.getZ(b), p.getZ(c)) + half) / step - 1e-5));
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const cell = iz * n + ix;
        if (faces) faces[starts[cell] + counts[cell]++] = k;
        else counts[cell]++;
      }
    };
    for (let k = 0; k < index.length; k += 3) visit(k, null);
    for (let k = 0; k < counts.length; k++) starts[k + 1] = starts[k] + counts[k];
    const faces = new Uint32Array(starts[n * n]);
    counts.fill(0);
    for (let k = 0; k < index.length; k += 3) visit(k, faces);
    cells = { starts, faces }; terrainCells.set(geo, cells);
  }
  const cell = Math.floor((z + half) / step) * n + Math.floor((x + half) / step);
  let height = -Infinity;
  for (let j = cells.starts[cell]; j < cells.starts[cell + 1]; j++) {
    const k = cells.faces[j], a = index[k], b = index[k + 1], c = index[k + 2];
    const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b) - ax, bz = p.getZ(b) - az;
    const cx = p.getX(c) - ax, cz = p.getZ(c) - az, det = bx * cz - bz * cx;
    if (Math.abs(det) < 1e-8) continue;
    const u = ((x - ax) * cz - (z - az) * cx) / det;
    const v = (bx * (z - az) - bz * (x - ax)) / det;
    if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) {
      height = Math.max(height, p.getY(a) + (p.getY(b) - p.getY(a)) * u + (p.getY(c) - p.getY(a)) * v);
    }
  }
  // 穴として取り除かれた地面には、歩行用の高さを描く面として戻さない。
  return height;
}

// 視点を直接切り替えた後も、手前の描く面の四隅を地面・水面の上へ保つ。
// 測定値は同じ入れ物へ書く。描画・兵・任務を増やさない。
export function guardDrawCamera(world, camera, measure) {
  camera.updateMatrixWorld();
  const p = camera.position, e = camera.matrixWorld.elements;
  const h = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  let lift = 0, groundGap = Infinity, waterGap = Infinity;
  measure.interpolationGap = p.y - world.heightAt(p.x, p.z);
  for (let i = 0; i < 5; i++) {
    const dx = i === 0 ? 0 : (i & 1 ? h : -h) * camera.aspect;
    const dy = i === 0 ? 0 : (i & 2 ? h : -h), dz = i === 0 ? 0 : -camera.near;
    const x = p.x + e[0] * dx + e[4] * dy + e[8] * dz;
    const y = p.y + e[1] * dx + e[5] * dy + e[9] * dz;
    const z = p.z + e[2] * dx + e[6] * dy + e[10] * dz;
    const gap = y - drawGroundAt(world, x, z);
    groundGap = Math.min(groundGap, gap); lift = Math.max(lift, 0.08 - gap);
    const depth = world.waterDepthAt(x, z);
    if (depth > 0.02) {
      const water = y - world.heightAt(x, z) - depth;
      waterGap = Math.min(waterGap, water); lift = Math.max(lift, 0.08 - water);
    }
  }
  measure.groundGap = groundGap; measure.waterGap = waterGap; measure.lift = lift;
  measure.frames = (measure.frames || 0) + 1;
  measure.groundClips = (measure.groundClips || 0) + (groundGap < 0 ? 1 : 0);
  measure.waterClips = (measure.waterClips || 0) + (waterGap < 0 ? 1 : 0);
  measure.maxLift = Math.max(measure.maxLift || 0, lift);
  if (lift > 0) { p.y += lift; camera.updateMatrixWorld(); }
  return lift;
}
