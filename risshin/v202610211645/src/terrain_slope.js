import * as THREE from 'three';
import { rockShape, rockTuftShape } from './rock_shape.js';
import { drawGroundAt } from './render_camera.js';

// 山道の外の露岩と根草。設営時だけ配置し、形と材質を各一束で使い回す。
// 描く三角形へ据える。歩行の高さ・当たり・兵の密度には触れない。
export function dressSlope(world, o) {
  const rocks = new THREE.InstancedMesh(rockShape(1, true, 1),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), o.rocks);
  const tufts = new THREE.InstancedMesh(rockTuftShape(true),
    new THREE.MeshLambertMaterial({ color: 0x74764b, side: THREE.DoubleSide }), o.tufts);
  const pose = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
  const color = new THREE.Color();
  let seed = world.def.seed || 1, nr = 0, nt = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < (o.rocks + o.tufts) * 16 && (nr < o.rocks || nt < o.tufts); i++) {
    const x = o.x0 + random() * (o.x1 - o.x0), z = o.z0 + random() * (o.z1 - o.z0);
    if (!o.allow(x, z) || world.inWaterAt(x, z)) continue;
    const y = drawGroundAt(world, x, z);
    const dx = drawGroundAt(world, x + .4, z) - drawGroundAt(world, x - .4, z);
    const dz = drawGroundAt(world, x, z + .4) - drawGroundAt(world, x, z - .4);
    const slope = Math.hypot(dx, dz) / .8;
    if (slope < .3 || slope > 3) continue;
    normal.set(-dx / .8, 1, -dz / .8).normalize();
    if (nr < o.rocks && (slope > .85 || random() < .2)) {
      const size = .45 + random() * 1.15;
      pose.quaternion.setFromUnitVectors(up, normal);
      pose.rotateY(random() * Math.PI * 2);
      pose.scale.set(size * (1 + random() * .6), size * .65, size);
      // 中心を斜面の内へ引き、地山から出た部分だけを見せる。
      pose.position.set(x, y, z).addScaledVector(normal, -size * .3);
      pose.updateMatrix(); rocks.setMatrixAt(nr, pose.matrix);
      color.setHex(nr % 3 ? 0xb2a48a : 0x899172); rocks.setColorAt(nr++, color);
    }
    if (nt < o.tufts && slope < 1.65) {
      pose.quaternion.setFromUnitVectors(up, normal);
      pose.rotateY(random() * Math.PI * 2);
      const size = 1 + random() * 1.8;
      pose.scale.set(size, size * (.85 + random() * .4), size);
      pose.position.set(x, y - .035, z); pose.updateMatrix();
      tufts.setMatrixAt(nt, pose.matrix);
      color.setHex(nt % 4 ? 0x89945e : 0xb3a075); tufts.setColorAt(nt++, color);
    }
  }
  for (const [mesh, count] of [[rocks, nr], [tufts, nt]]) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); world.scene.add(mesh);
  }
}
