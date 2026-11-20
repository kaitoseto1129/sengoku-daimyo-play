// 景色の束（InstancedMesh）の遠近の分け：視点から near m の内は今までの形、外は軽い形で描く（K374 三角の数・11/19 クラウド12）。
//   同じ材質・色・置き場のまま、二つの束へ分ける。視点が step m 動いた時だけ分け直す（毎コマの仕事はほぼ無い）。
//   近くの見た目は変えない。遠くは画素数個の差の形に限って使う（細い葦の茎の段数・小石の細分など）。
import * as THREE from 'three';
export function instLod(scene, hi, loGeo, near = 18, step = 2) {
  const n = hi.count, mats = [], cols = [], pos = new Float32Array(n * 2), m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    hi.getMatrixAt(i, m); mats.push(m.clone()); pos[i * 2] = m.elements[12]; pos[i * 2 + 1] = m.elements[14];
    if (hi.instanceColor) { hi.getColorAt(i, c); cols.push(c.clone()); }
  }
  // 株ごとの値（InstancedBufferAttribute：森部の苗の接地の高さなど）も一緒に並べ替える。遠い形には同じ名の入れ物を作る
  const inst = [];
  for (const [name, at] of Object.entries(hi.geometry.attributes)) if (at.isInstancedBufferAttribute) {
    if (!loGeo.attributes[name]) loGeo.setAttribute(name, new THREE.InstancedBufferAttribute(new at.array.constructor(at.array.length), at.itemSize));
    inst.push({ hi: at, lo: loGeo.attributes[name], src: at.array.slice(), k: at.itemSize });
  }
  const lo = new THREE.InstancedMesh(loGeo, hi.material, Math.max(1, n));
  lo.castShadow = hi.castShadow; lo.receiveShadow = hi.receiveShadow; lo.renderOrder = hi.renderOrder;
  if (cols.length) for (let i = 0; i < n; i++) lo.setColorAt(i, cols[i]);
  for (let i = 0; i < n; i++) lo.setMatrixAt(i, mats[i]);
  for (const A of inst) { A.lo.array.set(A.src.subarray(0, Math.min(A.src.length, A.lo.array.length))); A.lo.needsUpdate = true; }
  lo.count = n; hi.count = 0;
  const last = new THREE.Vector3(Infinity, 0, Infinity), cam = new THREE.Vector3();
  const assign = (camera) => {
    camera.getWorldPosition(cam);
    if (Math.hypot(cam.x - last.x, cam.z - last.z) < step) return;
    last.copy(cam);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const close = Math.hypot(pos[i * 2] - cam.x, pos[i * 2 + 1] - cam.z) < near, M = close ? hi : lo, k = close ? a++ : b++;
      M.setMatrixAt(k, mats[i]); if (cols.length) M.setColorAt(k, cols[i]);
      for (const A of inst) { const T = (close ? A.hi : A.lo).array; for (let q = 0; q < A.k; q++) T[k * A.k + q] = A.src[i * A.k + q]; }
    }
    for (const A of inst) { A.hi.needsUpdate = true; A.lo.needsUpdate = true; }
    hi.count = a; lo.count = b;
    for (const M of [hi, lo]) { M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; }
  };
  for (const M of [hi, lo]) { M.frustumCulled = false; M.onBeforeRender = (r, sc, camera) => assign(camera); }
  scene.add(lo);
  return lo;
}
