// その戦の目玉（城・砦・船）を、平野の霧（見通し八十メートルほど）に沈めない。
// 目玉の形の材質だけ複製して、from〜to m より先の霧を cap まで抑える（近くの兵・旗・柵の霧は変えない）。
// ground を渡すと、目玉の足元の地面（中心 x,z から半径 r）も同じだけ霧を抑え、城が霧の中に浮かないようにする。
// 設営の時に一度だけ材質を作る（毎コマ new しない）。描く距離（カメラの奥 150m）は変えない。
import * as THREE from 'three';

const capLine = (cap, from, to, where = '1.0') =>
  // カメラの奥（150m）で切れる所が見えないように、125〜145m でまた霧へ戻す
  `fogFactor = min(fogFactor, mix(1.0, ${cap.toFixed(2)}, smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, fogD) * (1.0 - smoothstep(125.0, 145.0, fogD)) * (${where})));\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );`;

function patch(mat, tag, line) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}|${tag}`;
  mat.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
      .replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );', line);
  };
  mat.needsUpdate = true;
}

// near を渡すと、objs のうち形の中心が near（x,z,r）の内にある物だけ（戦の作りの後に部品の組が足す門や塀を、場所で拾う時）
const _box = new THREE.Box3(), _c = new THREE.Vector3();
export function farSight(objs, { cap = 0.35, from = 45, to = 90, ground = null, W = null, near = null } = {}) {
  // 兵・煙・名札の束（unitBatch・smokeBatch・static-batch・Sprite）は戦じゅうで使い回す材質なので触らない
  objs = [].concat(objs).filter((o) => o && !o.isSprite && !/batch/i.test(o.name || ''));
  if (near) objs = objs.filter((o) => { _box.setFromObject(o).getCenter(_c); return !_box.isEmpty() && Math.hypot(_c.x - near.x, _c.z - near.z) < near.r; });
  const made = new Map(), line = capLine(cap, from, to), tag = `目玉の霧${cap}`;
  const one = (src) => {
    if (!src || !src.fog) return src;
    let m = made.get(src);
    if (!m) { m = src.clone(); patch(m, tag, line); made.set(src, m); }
    return m;
  };
  for (const g of [].concat(objs)) g?.traverse?.((o) => {
    if (!o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  if (ground && W?.terrain) {
    const { x, z, r } = ground;
    const where = `1.0 - smoothstep(${(r * 0.7).toFixed(1)}, ${r.toFixed(1)}, length(cameraPosition.xz + vFogOff.xz - vec2(${x.toFixed(1)}, ${z.toFixed(1)})))`;
    for (const m of [].concat(W.terrain.material)) if (m?.fog) patch(m, `${tag}|足元${x},${z},${r}`, capLine(cap, from, to, where));
  }
}
