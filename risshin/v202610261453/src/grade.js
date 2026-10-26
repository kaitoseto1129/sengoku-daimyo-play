import * as THREE from 'three';

// 露出・彩度・暗部と明部の色・霧をここだけで調整する。時刻名は既存の戦の指定を使う。
const profile = (exposure, saturation, shadow, light, fog) => ({
  exposure, saturation, shadow: new THREE.Vector3(...shadow), light: new THREE.Vector3(...light), fog,
});
export const GRADES = {
  morning: profile(1.02, 0.86, [0.94, 0.99, 1.05], [1.045, 1.01, 0.95], 0xbcb9b1),
  day: profile(1, 0.84, [0.96, 0.99, 1.025], [1.035, 1.01, 0.965], 0xadb7b9),
  dusk: profile(0.97, 0.88, [0.88, 0.96, 1.09], [1.09, 1.01, 0.90], 0xa08d88),
  storm: profile(1.01, 0.76, [0.91, 0.98, 1.06], [0.98, 1.015, 1.04], 0x9aa5ad),
  night: profile(1, 0.79, [0.90, 0.97, 1.08], [0.97, 1.01, 1.055], 0x2a3549),
  after: profile(1, 0.83, [0.94, 0.99, 1.04], [1.045, 1.01, 0.955], 0x9ea9ab),
};
export function gradeOf(key, mood) {
  return GRADES[key === 'noon' || key === 'afternoon' ? 'day' : key === 'day' && mood === 'morning' ? 'morning' : key] || GRADES.day;
}
export function mixGrade(out, a, b, k) {
  out.exposure = a.exposure + (b.exposure - a.exposure) * k;
  out.saturation = a.saturation + (b.saturation - a.saturation) * k;
  out.shadow.copy(a.shadow).lerp(b.shadow, k);
  out.light.copy(a.light).lerp(b.light, k);
  return out;
}
export function copyGrade(a) {
  return { exposure: a.exposure, saturation: a.saturation, shadow: a.shadow.clone(), light: a.light.clone() };
}

// 既存の材質の最後の色計算を置き換える。描画領域・参照画像・描き直しは増やさない。
const uniforms = {
  uGradeShadow: { value: new THREE.Vector3() }, uGradeLight: { value: new THREE.Vector3() },
  uGradeSat: { value: 1 },
};
THREE.ShaderChunk.tonemapping_pars_fragment += '\nuniform vec3 uGradeShadow, uGradeLight;\nuniform float uGradeSat;\n';
THREE.ShaderChunk.tonemapping_fragment = `#if defined(TONE_MAPPING)
 gl_FragColor.rgb = toneMapping(gl_FragColor.rgb);
 {
  vec3 gc = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
  float red = smoothstep(0.01, 0.08, gc.r - max(gc.g, gc.b)) * smoothstep(0.02, 0.1, gc.r);
  gc = mix(vec3(gl), gc, mix(uGradeSat, 1.02, red));
  float green = clamp((gc.g - max(gc.r, gc.b)) * 6.0, 0.0, 1.0);
  gc.r += (gc.g - gc.r) * 0.2 * green; gc.b -= gc.b * 0.12 * green;
  gc *= mix(uGradeShadow, uGradeLight, smoothstep(0.02, 0.4, gl));
  gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), 0.25);
  gl_FragColor.rgb = gc * 0.96 + vec3(0.008, 0.0085, 0.01);
 }
#endif`;

export function installGrade(renderer) {
  const installed = new WeakSet();
  function materialGrade(material) {
    if (!material || installed.has(material)) return;
    installed.add(material);
    const before = material.onBeforeCompile;
    const cache = material.customProgramCacheKey;
    // 元の識別子を保ち、人・草木などの独自の描き方を混ぜない。
    const key = cache.call(material);
    material.customProgramCacheKey = () => key + ':grade';
    material.onBeforeCompile = function (shader, r) {
      before.call(this, shader, r);
      Object.assign(shader.uniforms, uniforms);
    };
    material.needsUpdate = true;
  }
  function prepare(object) {
    object.traverse(o => {
      if (Array.isArray(o.material)) o.material.forEach(materialGrade);
      else materialGrade(o.material);
    });
  }
  const compile = renderer.compile, compileAsync = renderer.compileAsync;
  renderer.compile = function (scene, camera, target) { prepare(scene); return compile.call(this, scene, camera, target); };
  if (compileAsync) renderer.compileAsync = function (scene, camera, target) { prepare(scene); return compileAsync.call(this, scene, camera, target); };
  const direct = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    materialGrade(material);
    return direct.call(this, camera, scene, geometry, material, object, group);
  };
  const render = renderer.render;
  renderer.render = function (scene, camera) {
    const grade = scene.userData.colorGrade || GRADES.day;
    uniforms.uGradeShadow.value.copy(grade.shadow);
    uniforms.uGradeLight.value.copy(grade.light);
    uniforms.uGradeSat.value = grade.saturation;
    const exposure = this.toneMappingExposure;
    this.toneMappingExposure *= grade.exposure;
    try { return render.call(this, scene, camera); }
    finally { this.toneMappingExposure = exposure; }
  };
}
