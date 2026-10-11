import * as THREE from 'three';

// 設営時に一つ作り、同じ束の岩で共用する。毎コマの作り直しはしない。
export function rockShape(radius = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3);
  const stone = new THREE.Color(0x948a7a), moss = new THREE.Color(0x566044);
  const soil = new THREE.Color(0x75634f), color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius, y = p.getY(i) / radius, z = p.getZ(i) / radius;
    // 大小の割れを重ねる。同じ座標は同じ形にして面の隙間を防ぐ。
    const fold = Math.sin(x * 4.3 + z * 2.7) * Math.cos(y * 3.8 - z);
    const grain = Math.sin(x * 13 + y * 9 - z * 11);
    const f = 0.88 + fold * 0.12 + grain * 0.035;
    p.setXYZ(i, radius * (x * f + y * 0.09), radius * y * f * 0.8, radius * z * f);
    const patch = 0.5 + 0.5 * Math.sin(x * 7 + z * 5 + y * 3);
    color.copy(stone).lerp(moss, Math.max(0, y) * patch * 0.65)
      .lerp(soil, THREE.MathUtils.smoothstep(0.25 - y, 0, 0.9) * 0.55)
      .multiplyScalar(0.9 + grain * 0.07);
    color.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
