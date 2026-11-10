// 自動計測専用。描く間だけ差し替え、本来の材質・表示と共有資源を壊さない。
import * as THREE from 'three';
import { POST } from './post.js';

const basic = new Map(), changed = [], hidden = [];
let smokeBefore = null;
function unlit(m, object) {
  let variants = basic.get(m);
  if (!variants) { variants = new Map(); basic.set(m, variants); }
  const kind = object.isPoints ? 'points' : object.isSprite ? 'sprite' : object.isLine ? 'line' : 'mesh';
  let out = variants.get(kind);
  if (!out) {
    const options = { color: m.color || 0xffffff, map: m.map || null, transparent: m.transparent,
      opacity: m.opacity, side: m.side, depthTest: m.depthTest, depthWrite: m.depthWrite,
      blending: m.blending, alphaTest: m.alphaTest, vertexColors: m.vertexColors, fog: m.fog,
      toneMapped: m.toneMapped };
    // 独自の束・地形・空は頂点の配置を保つ。照明の計算だけを単色の出力へ置き換える。
    if (m.isShaderMaterial) {
      const shaderOptions = { ...options }; delete shaderOptions.color; delete shaderOptions.map;
      const uv = /varying\s+vec2\s+vUv\s*;/.test(m.vertexShader) && m.uniforms.map?.value;
      const output = uv ? 'texture2D(map, vUv)' : 'vec4(0.6, 0.6, 0.6, 1.0)';
      out = new THREE.ShaderMaterial({ ...shaderOptions, uniforms: m.uniforms, defines: { ...m.defines },
        vertexShader: m.vertexShader, glslVersion: m.glslVersion,
        fragmentShader: m.glslVersion === THREE.GLSL3
          ? 'precision highp float; out vec4 probeColor; void main(){ probeColor = vec4(0.6, 0.6, 0.6, 1.0); }'
          : `${uv ? 'varying vec2 vUv; uniform sampler2D map;' : ''} void main(){ gl_FragColor = ${output}; }` });
    } else if (kind === 'points') out = new THREE.PointsMaterial({ ...options, size: m.size, sizeAttenuation: m.sizeAttenuation });
    else if (kind === 'sprite') out = new THREE.SpriteMaterial(options);
    else if (kind === 'line') { delete options.map; out = new THREE.LineBasicMaterial(options); }
    else out = new THREE.MeshBasicMaterial(options);
    variants.set(kind, out);
  }
  if (m.color && out.color) out.color.copy(m.color);
  out.opacity = m.opacity;
  return out;
}
function hide(object) {
  if (object?.visible) { hidden.push(object); object.visible = false; }
}
export function probeDraw(scene, battle, flags) {
  if (flags.nosmoke && battle?.scene === scene) {
    smokeBefore = POST.smoke; POST.smoke = 0;
    const w = battle.world, a = battle.army;
    hide(w.smokeCol?.pts); hide(w.dustP?.points); hide(w.haze?.mesh); hide(w.dustVeil?.mesh); hide(w.embers?.pts);
    hide(a.smokeBatch?.mesh); hide(a.flashBatch?.mesh);
    for (const s of a.smokes || []) if (!s.sp.isSmokeP) hide(s.sp);
    for (const f of a.flashes || []) if (!f.sp.isSmokeP) hide(f.sp);
    for (const f of w.fires || []) { hide(f.flame); hide(f.inner); hide(f.glow); hide(f.light); }
  }
  if (flags.simplemat) scene.traverse((o) => {
    if (!o.material) return;
    const m = o.material;
    // 複数材質の配列も一度作った物を使い回す。
    let replacement;
    if (Array.isArray(m)) {
      replacement = basic.get(m);
      if (!replacement) { replacement = m.map(v => unlit(v, o)); basic.set(m, replacement); }
    } else replacement = unlit(m, o);
    changed.push(o, m); o.material = replacement;
  });
}
export function restoreProbeDraw() {
  for (let i = 0; i < changed.length; i += 2) changed[i].material = changed[i + 1];
  for (const o of hidden) o.visible = true;
  changed.length = hidden.length = 0;
  if (smokeBefore !== null) { POST.smoke = smokeBefore; smokeBefore = null; }
}
export function disposeProbe() {
  restoreProbeDraw();
  for (const entry of basic.values()) if (entry instanceof Map) for (const m of entry.values()) m.dispose();
  basic.clear();
}
