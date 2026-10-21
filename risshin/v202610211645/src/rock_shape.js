import * as THREE from 'three';
import { drawGroundAt } from './render_camera.js';

// 設営時に一つ作り、同じ束の岩で共用する。毎コマの作り直しはしない。
export function rockShape(radius = 1, roundedTop = false, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3);
  const stone = new THREE.Color(0x61594d), moss = new THREE.Color(0x424a32);
  const soil = new THREE.Color(0x594733), color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius, y = p.getY(i) / radius, z = p.getZ(i) / radius;
    // 大小の割れを重ねる。同じ座標は同じ形にして面の隙間を防ぐ。
    const fold = Math.sin(x * 4.3 + z * 2.7) * Math.cos(y * 3.8 - z);
    const grain = Math.sin(x * 13 + y * 9 - z * 11);
    const crack = Math.pow(Math.max(0, 1 - Math.abs(y + x * 0.35 - z * 0.18 - 0.24) * 22), 2);
    const f = 0.9 + fold * 0.1 + grain * 0.025 - crack * 0.035;
    // 頂を削って広い割れ面を残す。切岸の岩は丸みを保ち、潰れた頂の裏面が穴に見えないようにする。
    p.setXYZ(i, radius * (x * f + y * 0.09), radius * ((roundedTop ? y : Math.min(y, 0.72)) * f * 0.8 - 0.08), radius * z * f);
    const patch = 0.5 + 0.5 * Math.sin(x * 7 + z * 5 + y * 3);
    color.copy(stone).lerp(moss, Math.max(0, y) * patch * 0.65)
      .lerp(soil, THREE.MathUtils.smoothstep(0.25 - y, 0, 0.9) * 0.55)
      .multiplyScalar(0.98 + grain * 0.05 - crack * 0.22);
    color.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // 三角の面ごとの黒い陰をなくす。同じ頂点の法線だけを設営時に平均する。
  const normals = geo.attributes.normal, sums = new Map(), normal = new THREE.Vector3();
  const keyAt = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 100000 / radius)).join(',');
  for (let i = 0; i < p.count; i++) {
    const key = keyAt(i);
    if (!sums.has(key)) sums.set(key, new THREE.Vector3());
    sums.get(key).add(normal.fromBufferAttribute(normals, i));
  }
  for (const normal of sums.values()) normal.normalize();
  for (let i = 0; i < p.count; i++) {
    const n = sums.get(keyAt(i)); normals.setXYZ(i, n.x, n.y, n.z);
  }
  return geo;
}

// 円錐の代わりに短い葉を束ねる。草の形も設営時だけ作り、束の中で共用する。
export function rockTuftShape(curved = false) {
  const points = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, x = Math.cos(a), z = Math.sin(a), h = 0.22 + i % 3 * 0.07;
    if (!curved) {
      points.push(-z * 0.025, 0, x * 0.025, z * 0.025, 0, -x * 0.025, x * 0.12, h, z * 0.12);
      continue;
    }
    const edge = (t, side) => {
      const bend = .22 * t * t, width = .018 * (1 - t);
      return [x * bend - z * width * side, h * (1.35 * t - .35 * t * t), z * bend + x * width * side];
    };
    for (let j = 0; j < 4; j++) {
      const t = j / 4, next = (j + 1) / 4;
      points.push(...edge(t, -1), ...edge(t, 1), ...edge(next, -1),
        ...edge(t, 1), ...edge(next, 1), ...edge(next, -1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.computeVertexNormals(); return geo;
}

// 動かない岩の足もとだけ。地面の高さに沿う薄い陰と根元の草を各一描画へまとめる。
// 携帯で影を省いても接地を示す。兵の床・当たり・戦の進行は変えない。
export function groundRocks(world, rocks, radius = 1) {
  if (!rocks.count) return;
  // 指定した戦だけ、岩と根草を歩行用の補間でなく描く三角形へ据える。
  const ground = world.def.rockDrawGround ? (x, z) => drawGroundAt(world, x, z) : (x, z) => world.heightAt(x, z);
  const positions = [], shade = [], roots = [];
  const matrix = new THREE.Matrix4(), center = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const tuft = rockTuftShape(!!world.def.curvedRockTufts), blades = tuft.attributes.position;
  const centerGround = !!world.def.rockCenterGround;
  const grounded = !!world.def.groundedSlopeRocks, vertex = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), face = new THREE.Vector3(), turn = new THREE.Quaternion();
  const stonePoints = rocks.geometry.attributes.position;
  for (let i = 0; i < rocks.count; i++) {
    rocks.getMatrixAt(i, matrix); matrix.decompose(center, rotation, scale);
    // 田野の切岸は岩の厚みを斜面の外へ向ける。薄い楕円だけが露出する埋まり方を避ける。
    if (world.def.slopeRockFaces) {
      const dx = (world.heightAt(center.x + 0.5, center.z) - world.heightAt(center.x - 0.5, center.z));
      const dz = (world.heightAt(center.x, center.z + 0.5) - world.heightAt(center.x, center.z - 0.5));
      if (Math.hypot(dx, dz) > 0.55) {
        face.set(-dx, 1, -dz).normalize();
        turn.setFromUnitVectors(up, face); rotation.premultiply(turn);
        scale.y = Math.max(scale.y, Math.min(scale.x, scale.z) * 0.9);
        matrix.compose(center, rotation, scale);
      }
    }
    // 岩の中心を土より下へ。既に深く埋めてある露岩は持ち上げない。
    center.y = world.def.rockDrawGround ? ground(center.x, center.z) - radius * scale.y * 0.08
      : Math.min(center.y, ground(center.x, center.z) - radius * scale.y * 0.08);
    if (grounded && !centerGround) {
      // 指定した戦だけ、回転前の下半分ではなく実際の斜面へ向く腹と縁を調べる。
      // 岩を横へ倒した時も、元の上半分だった縁を宙へ残さない。
      if (world.def.rockSlopeContact) face.set(
        ground(center.x - 0.5, center.z) - ground(center.x + 0.5, center.z), 1,
        ground(center.x, center.z - 0.5) - ground(center.x, center.z + 0.5)).normalize();
      // 急斜面でも下側の縁を土へ埋める。回転した実際の頂点で、設営時だけ調べる。
      for (let j = 0; j < stonePoints.count; j++) {
        // 金ヶ崎では下端だけでなく胴の縁まで埋め、急な肩で岩の腹を宙へ出さない。
        // 指定しない戦は従来の深さを保つ。設営時だけの計算。
        if (!world.def.rockSlopeContact && stonePoints.getY(j) > radius * (world.def.rockBuriedRim ? 0.05 : -0.25)) continue;
        vertex.fromBufferAttribute(stonePoints, j).applyMatrix4(matrix);
        if (world.def.rockSlopeContact &&
            (vertex.x - matrix.elements[12]) * face.x + (vertex.y - matrix.elements[13]) * face.y +
            (vertex.z - matrix.elements[14]) * face.z > radius * Math.min(scale.x, scale.y, scale.z) * 0.05) continue;
        center.y = Math.min(center.y, ground(vertex.x, vertex.z) - (vertex.y - matrix.elements[13]) - 0.12);
      }
    }
    matrix.setPosition(center); rocks.setMatrixAt(i, matrix);
    const rx = radius * scale.x * (centerGround ? .55 : .85), rz = radius * scale.z * (centerGround ? .55 : .85);
    const angle = Math.atan2(-matrix.elements[2], matrix.elements[0]), cs = Math.cos(angle), sn = Math.sin(angle);
    const point = (a, r) => {
      const x = Math.cos(a) * rx * r, z = Math.sin(a) * rz * r;
      const wx = center.x + cs * x - sn * z, wz = center.z + sn * x + cs * z;
      return [wx, ground(wx, wz) + 0.018, wz];
    };
    const middle = point(0, 0);
    // 田野の切岸では大きな扇の影が谷を跨いで宙に出る。接地は埋めた岩と通常の影で示す。
    for (let k = 0; (!grounded || centerGround) && k < 10; k++) {
      positions.push(...middle, ...point(k * Math.PI / 5, 1), ...point((k + 1) * Math.PI / 5, 1));
      shade.push(1, 0, 0);
    }
    for (let k = 0; k < 2; k++) {
      const base = point(k * 2.7 + i * 0.7, 0.82), size = Math.min(1.3, 0.5 + radius * scale.y);
      if (world.inWaterAt(base[0], base[2])) continue;
      for (let j = 0; j < blades.count; j++) {
        const x = base[0] + blades.getX(j) * size, z = base[2] + blades.getZ(j) * size;
        roots.push(x, ground(x, z) - 0.025 + blades.getY(j) * size, z);
      }
    }
  }
  tuft.dispose(); rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = rocks.receiveShadow = true; rocks.computeBoundingSphere();
  const contactGeo = new THREE.BufferGeometry();
  contactGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  contactGeo.setAttribute('rockShade', new THREE.Float32BufferAttribute(shade, 1));
  const contactMat = new THREE.MeshBasicMaterial({ color: 0x393427, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  contactMat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float rockShade; varying float vRockShade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRockShade = rockShade;');
    sh.fragmentShader = 'varying float vRockShade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vRockShade * vRockShade;');
  };
  const contact = new THREE.Mesh(contactGeo, contactMat);
  const rootGeo = new THREE.BufferGeometry();
  rootGeo.setAttribute('position', new THREE.Float32BufferAttribute(roots, 3)); rootGeo.computeVertexNormals();
  const grass = new THREE.Mesh(rootGeo, new THREE.MeshLambertMaterial({ color: 0x77764f, side: THREE.DoubleSide }));
  if (world.def.litRockTufts) {
    // 設営時だけ法線を空へ向ける。急な岩の根でも葉の裏が黒い刃にならない。
    const normals = rootGeo.attributes.normal;
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
    grass.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <lights_lambert_vertex>',
        '#include <lights_lambert_vertex>\n#ifdef DOUBLE_SIDED\nvLightBack = vLightFront;\nvIndirectBack = vIndirectFront;\n#endif');
    };
    grass.material.customProgramCacheKey = () => '空の光を受ける根草';
  }
  grass.receiveShadow = true;
  const parent = grounded ? rocks : world.scene;
  if (!grounded || centerGround) parent.add(contact);
  parent.add(grass);
  const dispose = world.dispose;
  world.dispose = function () {
    parent.remove(contact, grass);
    contactGeo.dispose(); contactMat.dispose(); rootGeo.dispose(); grass.material.dispose();
    if (dispose) dispose.call(this);
  };
}
