// 一括描画の拡張が無い機種でも、馬防柵を近い区画ごとに一つの形へ。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeFenceBatch(scene, list, mat) {
  const cells = new Map();
  for (const entry of list) {
    entry.geo.computeBoundingBox();
    const b = entry.geo.boundingBox;
    const key = Math.floor((b.min.x + b.max.x) / 48) + ',' + Math.floor((b.min.z + b.max.z) / 48);
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(entry);
  }
  for (const cell of cells.values()) {
    const geo = mergeGeometries(cell.map((e) => e.geo));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = true;
    mesh.userData.noFreeze = true;   // 静止物の再結合で、壊れる区画の窓口を失わない。
    const parts = [], v = new THREE.Vector3(), normal = new THREE.Matrix3();
    let offset = 0, visible = cell.length;
    // 元の位置と法線は一度だけ保存。壊れて傾く時だけ、該当区画を書き換える。
    for (const { geo: src } of cell) {
      parts.push({ offset, pos: src.attributes.position.array, norm: src.attributes.normal.array, matrix: new THREE.Matrix4(), visible: true });
      offset += src.attributes.position.count;
    }
    const write = (p) => {
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
      mesh.visible = visible > 0;
    };
    // BatchedPart と同じ窓口で、壊れ方・素材への差し替えを受ける。
    const adapter = {
      setMatrixAt(id, matrix) { const p = parts[id]; p.matrix.copy(matrix); if (p.visible) write(p); },
      setVisibleAt(id, value) {
        const p = parts[id];
        if (p.visible === value) return;
        p.visible = value; visible += value ? 1 : -1; write(p);
      },
    };
    cell.forEach((e, id) => { e.part._addInst(adapter, id); e.geo.dispose(); });
    scene.add(mesh);
  }
}
