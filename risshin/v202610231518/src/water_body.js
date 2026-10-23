import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';

// 水面の補修は兵の更新の入口で一度だけ。川床・渡り口・戦の進行には触れない。
const preparedWorlds = new WeakSet();
function prepareWaterSurface(world) {
  if (!world?.scene || preparedWorlds.has(world)) return;
  preparedWorlds.add(world);
  world.scene.traverse((mesh) => {
    // 戦の側で岸と浅瀬まで仕上げた水面は、分割数と透け方を保つ。
    if (mesh.userData?.waterSurfaceReady) return;
    const base = mesh.material, geo = mesh.geometry;
    if (!mesh.isMesh || !base?.isMaterial || !geo?.attributes.position) return;
    const key = base.customProgramCacheKey();
    const ripple = key.startsWith('ripple|');
    // 海と水堀は既存の専用材質・形で識別し、旗や濡れた衣を拾わない。
    const sea = base.isMeshBasicMaterial && base.map && geo.type === 'PlaneGeometry' &&
      geo.parameters.width === 2000 && geo.parameters.height === 2000;
    const moat = base.color?.getHex() === 0x2c3a36 && base.transparent && geo.attributes.uv && !mesh.isInstancedMesh;
    if (!ripple && !sea && !moat) return;
    const stream = !!geo.attributes.waterFlow;
    const across = new Float32Array(geo.attributes.position.count);
    if (stream) for (let i = 0; i < across.length; i++) across[i] = i % 2 ? -1 : 1;
    else if (moat) for (let i = 0; i < across.length; i++) across[i] = geo.attributes.uv.getY(i) * 2 - 1;
    else if (ripple && world.def.water) {
      const w = world.def.water, width = (w.x2 ?? w.x + 700) - w.x;
      for (let i = 0; i < across.length; i++) across[i] =
        ((geo.attributes.position.getX(i) + mesh.position.x - w.x) / width) * 2 - 1;
    }
    geo.setAttribute('waterAcross', new THREE.BufferAttribute(across, 1));
    // 海の等間隔の縞絵は外し、共通の波と空の反射で水面を作る。船の影は受け続ける。
    const mat = sea ? new THREE.MeshLambertMaterial({ color: 0x527d76 }) : base.clone();
    const compile = sea ? null : base.onBeforeCompile;
    // 標準材質の拡張設定は既存のものを保ち、ない時だけ用意して開戦時の例外を防ぐ。
    mat.extensions ??= {};
    mat.extensions.derivatives = true;
    mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.fog = true;
    if (mat.isMeshStandardMaterial) { mat.roughness = Math.max(0.48, mat.roughness); mat.envMapIntensity = Math.min(0.35, mat.envMapIntensity); }
    mat.customProgramCacheKey = () => key + `|surfaceWaves|${sea}|${stream}`;
    mat.onBeforeCompile = (sh, renderer) => {
      if (compile) compile.call(base, sh, renderer);
      sh.uniforms.uSurfaceTime = { get value() { return SETTINGS.reduceMotion ? 0 : world.time || 0; } };
      sh.uniforms.uSurfaceSky = { value: world.hemi.color };
      sh.vertexShader = 'attribute float waterAcross; varying float vSurfaceAcross; varying vec3 vSurfaceWorld;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSurfaceAcross = waterAcross; vSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uSurfaceTime; uniform vec3 uSurfaceSky; varying float vSurfaceAcross; varying vec3 vSurfaceWorld;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 surfaceFlow = ${stream ? 'normalize(vWaterFlow + vec2(0.00001))' : 'vec2(0.0, 1.0)'};
        float alongWater = dot(vSurfaceWorld.xz, surfaceFlow);
        float acrossWater = dot(vSurfaceWorld.xz, vec2(-surfaceFlow.y, surfaceFlow.x));
        float bankWater = smoothstep(0.62, 0.98, abs(vSurfaceAcross));
        float closeWater = 1.0 - smoothstep(30.0, 160.0, length(vSurfaceWorld - cameraPosition));
        // 交差するうねりで波の峰を途切れさせる。細波は遠景と画素以下で消し、ちらつかせない。
        vec2 waterUV = vec2(acrossWater, alongWater);
        float swellA = dot(waterUV, vec2(0.38, 0.21)) - uSurfaceTime * 0.72;
        float swellB = dot(waterUV, vec2(-0.27, 0.49)) - uSurfaceTime * 0.93;
        float ripplePhase = dot(waterUV, vec2(2.4, 1.7)) - uSurfaceTime * 1.65
          + sin(swellB) * 1.4;
        float rippleFade = closeWater * (1.0 - smoothstep(0.5, 2.0, fwidth(ripplePhase)));
        vec2 waterSlope = vec2(0.38, 0.21) * cos(swellA) * 0.18
          + vec2(-0.27, 0.49) * cos(swellB) * 0.12
          + vec2(2.4, 1.7) * cos(ripplePhase) * 0.025 * rippleFade;
        vec2 slopeWorld = vec2(-surfaceFlow.y, surfaceFlow.x) * waterSlope.x + surfaceFlow * waterSlope.y;
        vec3 surfaceNormal = normalize(vec3(-slopeWorld.x, 1.0, -slopeWorld.y));
        // 深みと岸の浅い層を同じ面に塗る。海は縞の明暗を焼き込まない。
        vec3 waterLayer = mix(vec3(0.045, 0.095, 0.085), vec3(0.17, 0.22, 0.145), bankWater);
        diffuseColor.rgb = mix(clamp(diffuseColor.rgb, vec3(0.025), vec3(0.23, 0.29, 0.26)), waterLayer, 0.52);
        diffuseColor.rgb *= 0.96 + sin(swellA) * sin(swellB) * 0.04;
        float bankFoam = smoothstep(0.87, 0.99, abs(vSurfaceAcross)) *
          smoothstep(0.25, 0.85, sin(ripplePhase));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.38, 0.33), bankFoam * closeWater * 0.42);
      `).replace('#include <opaque_fragment>', `
        // 見下ろすと深い色、水平に見ると空色。法線で反射を砕き、光を波の峰へ集める。
        vec3 surfaceView = normalize(cameraPosition - vSurfaceWorld);
        float surfaceFresnel = 0.035 + 0.60 * pow(1.0 - max(dot(surfaceNormal, surfaceView), 0.0), 5.0);
        vec3 surfaceReflection = reflect(-surfaceView, surfaceNormal);
        float skyBreak = smoothstep(-0.08, 0.4, surfaceReflection.y);
        vec3 surfaceSky = uSurfaceSky * mix(vec3(0.15, 0.22, 0.24), vec3(0.48, 0.55, 0.54), skyBreak);
        outgoingLight = mix(outgoingLight, surfaceSky, surfaceFresnel * (1.0 - bankWater * 0.65));
        // 空や強い日差しでも白い板にならない。霧と画面の色の仕上げはこの後に通す。
        outgoingLight = min(outgoingLight, vec3(0.34, 0.43, 0.40));
        #include <opaque_fragment>
      `);
    };
    mesh.material = mat; mesh.receiveShadow = true;
  });
  addWaterBanks(world);
}

// 細い川の両岸へ少数だけ足す。草と石はそれぞれ一回の描画、形と材質は共有。
function addWaterBanks(world) {
  const banks = [];
  for (const st of world.def.streams || []) {
    if (st.w > 12 || !st.mesh?.geometry.attributes.waterFlow || st.mesh.userData?.waterSurfaceReady) continue;
    const p = st.mesh.geometry.attributes.position;
    const step = Math.max(1, Math.ceil(p.count / 48));
    for (let row = 0; row < p.count / 2 && banks.length < 64; row += step) {
      const a = row * 2, b = a + 1;
      const dx = p.getX(a) - p.getX(b), dz = p.getZ(a) - p.getZ(b), len = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) {
        const i = side > 0 ? a : b;
        const x = p.getX(i) + st.mesh.position.x + dx / len * side * 0.65;
        const z = p.getZ(i) + st.mesh.position.z + dz / len * side * 0.65;
        if (Math.abs(x) > world.half - 2 || Math.abs(z) > world.half - 2 || world.waterDepthAt(x, z) > 0.15) continue;
        banks.push([x, world.heightAt(x, z), z]);
      }
    }
  }
  if (!banks.length) return;
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.3, 0, 0, 0.1, 0.85, 0, 0.15, 0, 0, -0.1, 0, 0, -0.2, 0.6, 0, 0.3, 0, 0,
    0, 0, -0.3, 0, 0.7, 0.1, 0, 0, 0.3
  ], 3));
  grassGeo.computeVertexNormals();
  // 細い草の裏側も黒くつぶさず、岸の緑として読めるよう上向きに照らす。
  const normals = grassGeo.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x626d3e, side: THREE.DoubleSide }), banks.length);
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x68695b }), banks.length);
  const pose = new THREE.Object3D();
  for (let i = 0; i < banks.length; i++) {
    const [x, y, z] = banks[i], size = 0.25 + (Math.sin(i * 7.1) + 1) * 0.14;
    pose.position.set(x, y - 0.04, z); pose.rotation.set(0, i * 2.4, 0); pose.scale.setScalar(0.75 + size);
    pose.updateMatrix(); grass.setMatrixAt(i, pose.matrix);
    pose.position.set(x, y + size * 0.2, z); pose.scale.set(size * 1.3, size * 0.55, size);
    pose.updateMatrix(); stones.setMatrixAt(i, pose.matrix);
  }
  grass.receiveShadow = true; stones.castShadow = stones.receiveShadow = true;
  world.scene.add(grass, stones);
}

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
  // 濡れの段は uWet の値だけで、絵の仕組み（シェーダ）の中身は元と同じ。元と同じ鍵にして、川へ入るたびに新しく作らない（戦の途中で一つ作ると数十 ms 固まる）
  mat.customProgramCacheKey = () => base.customProgramCacheKey();
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
  prepareWaterSurface(world);
  // 援軍も含め十組へ散らす。全兵の水深・地面・濡れた材質を半秒ごとに一斉に調べない。
  // 初回と遅いコマも実際の経過だけ乾かし、次回までの端数を保つ。
  if (u.waterBodyT == null) u.waterBodyT = ((u.id % 10 + 10) % 10 + 1) * 0.05;
  u.waterBodyT -= dt;
  u.waterBodyElapsed = (u.waterBodyElapsed || 0) + dt;
  if (u.waterBodyT > 1e-9 || !u.mesh) return;
  const elapsed = u.waterBodyElapsed;
  u.waterBodyElapsed = 0;
  u.waterBodyT = 0.5 - Math.max(0, -u.waterBodyT) % 0.5;
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
