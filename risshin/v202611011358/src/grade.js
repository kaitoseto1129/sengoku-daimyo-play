import * as THREE from 'three';

// 露出・彩度・暗部と明部の色・霧をここだけで調整する。時刻名は既存の戦の指定を使う。
// contrast：明るさだけに掛ける S 字の強さ（色相は変えない）。wb：場の色かぶりを写真のように白へ戻す割合（霧の色から求める）。
const profile = (exposure, saturation, shadow, light, fog, contrast = 1.12, wb = 0.25) => ({
  exposure, saturation, shadow: new THREE.Vector3(...shadow), light: new THREE.Vector3(...light), fog, contrast, wb,
});
export const GRADES = {
  morning: profile(1.03, 0.86, [0.93, 0.98, 1.06], [1.05, 1.01, 0.94], 0xbcb9b1, 1.15, 0.3),
  day: profile(1.02, 0.85, [0.95, 0.985, 1.035], [1.035, 1.01, 0.96], 0xadb7b9, 1.2, 0.4),
  dusk: profile(0.98, 0.9, [0.86, 0.95, 1.1], [1.1, 1.0, 0.88], 0xa08d88, 1.14, 0.12),
  storm: profile(1.04, 0.74, [0.92, 0.98, 1.05], [0.99, 1.01, 1.03], 0x9aa5ad, 1.12, 0.35),
  night: profile(1, 0.79, [0.90, 0.97, 1.08], [0.97, 1.01, 1.055], 0x2a3549, 1.06, 0.06),
  after: profile(1.01, 0.83, [0.94, 0.99, 1.04], [1.045, 1.01, 0.955], 0x9ea9ab, 1.12, 0.25),
};
export function gradeOf(key, mood) {
  return GRADES[key === 'noon' || key === 'afternoon' ? 'day' : key === 'day' && mood === 'morning' ? 'morning' : key] || GRADES.day;
}
export function mixGrade(out, a, b, k) {
  out.exposure = a.exposure + (b.exposure - a.exposure) * k;
  out.saturation = a.saturation + (b.saturation - a.saturation) * k;
  out.contrast = (a.contrast ?? 1) + ((b.contrast ?? 1) - (a.contrast ?? 1)) * k;
  out.wb = (a.wb ?? 0) + ((b.wb ?? 0) - (a.wb ?? 0)) * k;
  out.shadow.copy(a.shadow).lerp(b.shadow, k);
  out.light.copy(a.light).lerp(b.light, k);
  return out;
}
export function copyGrade(a) {
  return { exposure: a.exposure, saturation: a.saturation, contrast: a.contrast ?? 1, wb: a.wb ?? 0, shadow: a.shadow.clone(), light: a.light.clone() };
}

// 既存の材質の最後の色計算を置き換える。描画領域・参照画像・描き直しは増やさない。
const uniforms = {
  uGradeShadow: { value: new THREE.Vector3() }, uGradeLight: { value: new THREE.Vector3() },
  uGradeSat: { value: 1 }, uGradeCon: { value: 1 }, uGradeWB: { value: new THREE.Vector3(1, 1, 1) },
};
THREE.ShaderChunk.tonemapping_pars_fragment += '\nuniform vec3 uGradeShadow, uGradeLight, uGradeWB;\nuniform float uGradeSat, uGradeCon;\n';
// 写真の色：白の釣り合い → 明るい所ほど色を抜く（フィルムの肩）→ 日なたと日陰の色 → 明るさだけの S 字（色相を崩さない）→ 黒は締める
THREE.ShaderChunk.tonemapping_fragment = `#if defined(TONE_MAPPING)
 gl_FragColor.rgb = toneMapping(gl_FragColor.rgb);
 {
  vec3 gc = clamp(gl_FragColor.rgb * uGradeWB, 0.0, 1.0);
  float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
  float red = smoothstep(0.01, 0.08, gc.r - max(gc.g, gc.b)) * smoothstep(0.02, 0.1, gc.r);
  float hi = smoothstep(0.5, 0.95, gl);
  gc = mix(vec3(gl), gc, mix(uGradeSat, 1.02, red) * (1.0 - 0.3 * hi));
  float green = clamp((gc.g - max(gc.r, gc.b)) * 6.0, 0.0, 1.0);
  gc.r += (gc.g - gc.r) * 0.2 * green; gc.b -= gc.b * 0.12 * green;
  gc *= mix(uGradeShadow, uGradeLight, smoothstep(0.02, 0.4, gl));
  float l0 = max(dot(gc, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float l1 = l0 < 0.2 ? 0.2 * pow(l0 / 0.2, uGradeCon) : 1.0 - 0.8 * pow((1.0 - min(l0, 1.0)) / 0.8, uGradeCon);
  // 10/30 黒潰れの下限：S 字の足で暗部を元の 8 割より下へ落とさない（黒漆・陰の兵の形を残す）。肩は 0.97 で止めて白飛びさせない。
  l1 = clamp(max(l1, l0 * 0.8), 0.0, max(0.97, l0));
  gc = clamp(gc * (l1 / l0), 0.0, 1.0);
  gl_FragColor.rgb = gc * 0.985 + vec3(0.004, 0.0045, 0.006);
 }
#endif`;

export function installGrade(renderer) {
  const installed = new WeakSet();
  const hooks = new WeakSet();
  function materialGrade(material) {
    if (!material || installed.has(material)) return;
    installed.add(material);
    const before = material.onBeforeCompile;
    // 束用の写しは処理と鍵を引き継ぐ。同じ仕上げを重ねて別の描き方にしない。
    if (hooks.has(before)) return;
    const cache = material.customProgramCacheKey;
    // 元の識別子を保ち、人・草木などの独自の描き方を混ぜない。
    const key = cache.call(material);
    material.customProgramCacheKey = () => key;
    material.onBeforeCompile = function (shader, r) {
      before.call(this, shader, r);
      Object.assign(shader.uniforms, uniforms);
    };
    hooks.add(material.onBeforeCompile);
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
    uniforms.uGradeCon.value = grade.contrast ?? 1;
    // 霧の色（場の色かぶりの目安）を灰へ戻す向きに、一部だけ白の釣り合いを取る。夜と夕は色を残す。
    const wb = grade.wb ?? 0, fc = scene.fog && scene.fog.color, W = uniforms.uGradeWB.value;
    if (wb > 0 && fc) {
      const m = (fc.r + fc.g + fc.b) / 3 + 1e-4;
      W.set(m / (fc.r + 1e-4), m / (fc.g + 1e-4), m / (fc.b + 1e-4)).clampScalar(0.8, 1.25);
      W.set(1 + (W.x - 1) * wb, 1 + (W.y - 1) * wb, 1 + (W.z - 1) * wb);
    } else W.set(1, 1, 1);
    const exposure = this.toneMappingExposure;
    this.toneMappingExposure *= grade.exposure;
    try { return render.call(this, scene, camera); }
    finally { this.toneMappingExposure = exposure; }
  };
}
