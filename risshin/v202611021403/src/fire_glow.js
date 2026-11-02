import * as THREE from 'three';

let glowMap;
// 炎の動く点光源を、共有の柔らかい発光板へ置き換える。
export function fireGlow(color, intensity = 0, distance = 10, decay = 2) {
  if (!glowMap) {
    const size = 32, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 255);
    }
    glowMap = new THREE.DataTexture(data, size, size);
    glowMap.magFilter = glowMap.minFilter = THREE.LinearFilter;
    glowMap.needsUpdate = true;
  }
  const material = new THREE.SpriteMaterial({ map: glowMap, color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Sprite(material);
  glow.color = material.color;
  glow.distance = distance;
  glow.decay = decay;
  glow.userData.noFreeze = true;
  glow.scale.setScalar(Math.min(2.4, distance * 0.12));
  let power = 0;
  Object.defineProperty(glow, 'intensity', {
    get() { return power; },
    set(value) {
      power = value;
      material.opacity = Math.min(0.45, Math.max(0, value) * 0.035);
      glow.visible = value > 0;
    },
  });
  glow.intensity = intensity;
  return glow;
}
