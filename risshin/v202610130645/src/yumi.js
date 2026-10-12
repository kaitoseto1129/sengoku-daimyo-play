// 本物の和弓と矢（近くの兵の弓と、近くを飛ぶ矢だけ。遠くは units_model.js の今の軽い形のまま）
// ・形：assets/yumi_lite/yumi.glb（tools/yumi.mjs で作る。src/asset_yumi.js に base64 で入れてある）
// ・作者表記（CC BY 4.0）：和弓は Gintoki1234「10 Bows and Cross Bows」の Yumi、矢は plaggy「CC0 - Wooden Arrow」（docs/CREDITS.md）
// ・弓の座標は今の弓と同じ（握りが原点、長さ 2.2m、弓の先は -z へ反る）。引いた形は三段（0・0.5・1）を読み込みの時に作る
// ・矢の座標も今の矢と同じ（鏃の先が原点、矢筈が -z）。篠竹の柄・節・鷹の切斑の羽・鉄の鏃は材質の中で塗る
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const YUMI = { ready: false, failed: false, near: 28, arrowNear: 40, arrowMax: 60 };
let loading = null;
// 弓を引いた形（今の弓の bowGeometry と同じ曲げ方）：弓の真ん中（0.36）から離れるほど射手の方へ寄る
const bendY = (y, d) => { const kk = (y - 0.36) / 1.1; return y * (1 - 0.05 * d * kk * kk) + 0.36 * 0.05 * d * kk * kk; };
const bendZ = (y, z, d) => { const kk = (y - 0.36) / 1.1; return z - 0.2 * d * kk * kk; };

export function loadYumi() {
  if (loading) return loading;
  if (typeof window !== 'undefined' && (window.__norender === true || (typeof location !== 'undefined' && /[?&]norender/.test(location.search)))) return (loading = Promise.resolve());
  loading = (async () => {
    const b64 = (await import('./asset_yumi.js')).default;
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const tl = new THREE.TextureLoader();
    const [gl, yc, ac] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...['yumi_col.jpg', 'ya_col.jpg'].map((f) => tl.loadAsync(new URL('../assets/yumi_lite/' + f, import.meta.url).href)),
    ]);
    for (const t of [yc, ac]) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
    const geo = {};
    gl.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
    // 弓：弦を張る所（上と下の弭の少し内）を形から測る
    const p0 = geo.yumi.attributes.position;
    let top = -1e9, bot = 1e9;
    for (let i = 0; i < p0.count; i++) { top = Math.max(top, p0.getY(i)); bot = Math.min(bot, p0.getY(i)); }
    const tipAt = (y0, y1) => { let z = 0, n = 0; for (let i = 0; i < p0.count; i++) { const y = p0.getY(i); if (y >= y0 && y <= y1) { z += p0.getZ(i); n++; } } return z / Math.max(1, n); };
    const tT = new THREE.Vector3(0, top - 0.05, tipAt(top - 0.08, top - 0.03)), tB = new THREE.Vector3(0, bot + 0.05, tipAt(bot + 0.03, bot + 0.08));
    const bows = {};
    for (const d of [0, 0.5, 1]) {
      const g = geo.yumi.clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setXYZ(i, p.getX(i), bendY(y, d), bendZ(y, z, d)); }
      g.computeVertexNormals(); g.computeBoundingSphere();
      g.userData.tips = [new THREE.Vector3(0, bendY(tT.y, d), bendZ(tT.y, tT.z, d)), new THREE.Vector3(0, bendY(tB.y, d), bendZ(tB.y, tB.z, d))];
      bows[d] = g;
    }
    geo.ya.computeVertexNormals(); geo.ya.computeBoundingSphere();
    // 弓：竹と櫨を貼り合わせて漆を掛けた弓。少し照る
    const bowMat = new THREE.MeshStandardMaterial({ map: yc, roughness: 0.42, metalness: 0, color: 0xc8c0b8 });
    // 矢：元の絵の木目の濃淡だけを使い、色は和式に塗る
    const arrowMat = new THREE.MeshStandardMaterial({ map: ac, roughness: 0.6, metalness: 0 });
    arrowMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vYaP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vYaP = position;');
      sh.fragmentShader = 'varying vec3 vYaP;\nfloat yaR, yaIron;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float z = vYaP.z, r = length(vYaP.xy), lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float fe = step(0.0068, r) * step(z, -0.69) * step(-0.9, z);
        // 柄：篠竹の淡い黄土色。節（三つ）は少し濃く、細く盛り上がる
        vec3 c = vec3(0.56, 0.45, 0.28) * (0.8 + lum * 1.2);
        float node = 0.0;
        for (int i = 0; i < 3; i++) node = max(node, smoothstep(0.006, 0.0, abs(z + 0.2 + float(i) * 0.24)));
        c *= 1.0 - node * 0.35;
        // 羽の前と鏃の後ろの糸巻き（黒い漆の細い帯）、矢筈は黒
        float wrap = step(abs(z + 0.67), 0.018) + step(abs(z + 0.075), 0.012) + step(z, -0.905);
        c = mix(c, vec3(0.04, 0.035, 0.03), clamp(wrap, 0.0, 1.0));
        // 鏃：鉄
        yaIron = smoothstep(-0.05, -0.035, z);
        c = mix(c, vec3(0.07, 0.07, 0.075), yaIron);
        // 羽：鷹の切斑（黒と白茶の横縞）。羽の先へ少し斜めに、縁は濃い
        float t = fract((z + r * 0.8) * 17.0);
        vec3 f = mix(vec3(0.05, 0.04, 0.035), vec3(0.78, 0.72, 0.6), smoothstep(0.42, 0.5, t) * smoothstep(0.95, 0.88, t));
        f *= 0.85 + lum * 0.4;
        c = mix(c, f, fe);
        diffuseColor.rgb = c;
        yaR = fe;
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(roughnessFactor, 0.85, yaR), 0.35, yaIron);`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = yaIron * 0.7;`);
    };
    arrowMat.customProgramCacheKey = () => 'ya1';
    Object.assign(YUMI, { bows, ya: geo.ya, bowMat, arrowMat, ready: true });
  })().catch((e) => { YUMI.failed = true; YUMI.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の弓と矢を読めませんでした（今の形で描きます）', e); });
  return loading;
}
