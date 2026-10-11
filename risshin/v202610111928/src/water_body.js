// 川を出た後も濡れた衣がゆっくり乾く。材質は三段階を兵どうしで共有する。
const materials = new WeakMap();
const batchKeys = new WeakMap();

// 元の材質への参照は JSON 化しない。複製後にも本物の材質を引き継ぐ。
export function cloneWaterMaterial(base) {
  if (!base?.isMaterial || typeof base.clone !== 'function') return base;
  const mat = base.clone();
  const source = base.userData?.waterSource;
  if (source) Object.defineProperty(mat.userData, 'waterSource', { value: source, configurable: true });
  return mat;
}

export function refreshWaterMaterials(base) {
  const levels = materials.get(base);
  if (levels) for (const mat of levels) if (mat) mat.needsUpdate = true;
}

export function waterMaterial(base, level) {
  if (!level || !base?.isMaterial || typeof base.clone !== 'function') return base;
  let levels = materials.get(base);
  if (!levels) { levels = []; materials.set(base, levels); }
  if (levels[level]) return levels[level];
  const mat = base.clone();
  mat.defines = base.defines;
  Object.defineProperty(mat.userData, 'waterSource', { value: base, configurable: true });
  mat.userData.waterLevel = level;
  mat.customProgramCacheKey = () => base.customProgramCacheKey() + '|waterBody';
  mat.onBeforeCompile = (sh, renderer) => {
    base.onBeforeCompile(sh, renderer);
    if (sh.uniforms.uWet) {
      const rain = sh.uniforms.uWet;
      sh.uniforms.uWet = { get value() { return Math.max(rain.value, level * 0.3); } };
    }
  };
  levels[level] = mat;
  return mat;
}

export function waterBatchKey(geo, mat) {
  if (!mat?.isMaterial || !mat.userData?.waterLevel || !geo || typeof geo !== 'object') return geo;
  let keys = batchKeys.get(mat);
  if (!keys) { keys = new WeakMap(); batchKeys.set(mat, keys); }
  let key = keys.get(geo);
  if (!key) { key = {}; keys.set(geo, key); }
  return key;
}

export function updateWaterBody(u, world, dt) {
  u.waterBodyT = (u.waterBodyT || 0) - dt;
  if (u.waterBodyT > 0 || !u.mesh) return;
  const elapsed = 0.5 - u.waterBodyT;
  u.waterBodyT = 0.5;
  // 屋内・橋・櫓の床の上は、下を流れる川で濡らさない。
  const water = u.naka ? 0 : world.waterDepthAt(u.pos.x, u.pos.z);
  const depth = water > 0.02 ? Math.max(0, world.heightAt(u.pos.x, u.pos.z) + water - u.pos.y) : 0;
  const soaking = u.mounted ? Math.max(0, depth - 0.5) : depth;
  u.waterBody = Math.max(Math.min(0.9, soaking * 1.6), (u.waterBody || 0) - elapsed * 0.008);
  const level = Math.min(3, Math.ceil(u.waterBody / 0.3));
  if (level === (u.waterBodyLevel || 0)) return;
  u.waterBodyLevel = level;
  u.mesh.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material) return;
    // 複数の材質を持つ具足も濡らす。配列は濡れの段が変わる時だけ作る。
    const wet = (mat) => {
      if (!mat) return mat;
      const base = mat.userData?.waterSource || mat;
      // 影・火縄の火・旗の透け具合は変えない。
      return base.isMeshBasicMaterial || base.isShaderMaterial ? base : waterMaterial(base, level);
    };
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(wet);
    else mesh.material = wet(mesh.material);
  });
}
