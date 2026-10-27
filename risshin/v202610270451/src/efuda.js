// 絵札（impostor）：カメラから EFUDA.far（既定 40m）より遠い骨入りの兵を、前もって描いた板で描く（10/21）
//   姿の組（甲冑・笠・得物・陣）ごとに、その姿の人を 8 方向 × 7 コマ（立ち 1・歩き 4・駆け 2）＋ 倒れ 1 を一枚の絵（1024×2048・一枚 128×256）に焼く。
//   焼くのは戦の場面そのもの（光と霧は同じ）で、人の根元を一時に場面の上へ移し、ほかの物を隠して小さな的に描く。
//   描くのは姿ごとに一つの束（InstancedBufferGeometry。位置・向き・コマ・倒れ具合・背丈だけ）。向きはカメラとの角から 8 方向を選ぶ。
//   倒れる途中は板を倒す向きへ傾け、倒れ切ったら上から見た板を地面に置く。指物・馬印・足もとの影は units.js の束がそのまま描く。
//   絵は iPhone では astc_rt.js が ASTC（1 byte/px）に圧縮する（userData.astcAlpha）。
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';
import { DEATH_END } from './units.js';

const qs = typeof location !== 'undefined' ? location.search : '';
const qFar = /[?&]efuda=([0-9.]+)/.exec(qs);
export const EFUDA = {
  on: MEM_TIGHT && (!qFar || +qFar[1] > 0) && !(typeof window !== 'undefined' && /x_noefuda/.test(String(window.__autoplay || ''))),   // x_noefuda：実機の記憶の切り分け（10/22）
  far: qFar && +qFar[1] > 0 ? +qFar[1] : 40,   // 遠景の絵札は35mで戻す。記憶の上限は骨の枠で守る
  hyst: 5,
  tileW: MEM_TIGHT ? 64 : 128, tileH: MEM_TIGHT ? 128 : 256, cols: 8, rows: 8,   // iPhone は一枚 64×128（絵は 512×1024。焼きと圧縮の一時の記憶を 1/4 に。10/22）
  boxW: 2.4, boxH: 4.8, foot: 0.3,   // 一枚が映す箱（m）。足もとは下から 0.3m
  dirs: 8, frames: 7,   // 立ち・歩き×4・駆け×2
  cap: MEM_TIGHT ? 256 : 512,
  maxKeys: MEM_TIGHT ? 10 : 16,
  keys: new Map(),
  stat: { keys: 0, baked: 0, bakeMs: 0, n: 0, dropped: 0, over: 0 },
};
const W = EFUDA.cols * EFUDA.tileW, H = EFUDA.rows * EFUDA.tileH;
const DEAD_TILE = EFUDA.dirs * EFUDA.frames;   // 56
const HIDE_KEEP = ['flag', 'blob', 'uma', 'horse', 'seat'];

let rt = null, pixels = null, bakeCam = null, deadCam = null, wrap = null, quadGeo = null;
let bakedThisFrame = 0;
export function efudaFrameStart() { bakedThisFrame = 0; }

const VERT = /* glsl */`
uniform vec2 uBox; uniform float uFoot; uniform vec2 uGrid;
attribute vec3 aPos; attribute vec4 aInfo; attribute float aDir;
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  float yaw = aInfo.x, fr = aInfo.y, tilt = aInfo.z, sc = aInfo.w;
  vec3 toCam = cameraPosition - aPos;
  float az = atan(toCam.x, toCam.z);
  float dir = mod(floor((yaw - az) / (PI * 0.25) + 0.5), 8.0);
  vec3 fall = vec3(sin(yaw + aDir), 0.0, cos(yaw + aDir));
  vec3 side, up, lift = vec3(0.0);
  float tile;
  if (fr >= 7.0) {
    up = fall; side = vec3(fall.z, 0.0, -fall.x); tile = 56.0; lift.y = 0.05;
  } else {
    float l = length(toCam.xz);
    side = l > 1e-3 ? vec3(toCam.z, 0.0, -toCam.x) / l : vec3(1.0, 0.0, 0.0);
    float a = tilt * 1.5708;
    up = cos(a) * vec3(0.0, 1.0, 0.0) + sin(a) * fall;
    tile = dir * 7.0 + fr;
  }
  vec3 wp = aPos + lift + side * (position.x * uBox.x * sc) + up * ((position.y + 0.5) * uBox.y * sc - uFoot * sc);
  float col = mod(tile, uGrid.x), row = floor(tile / uGrid.x);
  vUv = (uv + vec2(col, row)) / uGrid;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uLight;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.3) discard;   // 細い槍の柄が縮小で消えないよう、切る閾は低め
  gl_FragColor = vec4(c.rgb * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function ensure() {
  if (rt) return;
  rt = new THREE.WebGLRenderTarget(W, H, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
  rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
  rt.scissorTest = true;
  pixels = new Uint8Array(W * H * 4);
  // 立ち姿：箱 2.4×4.8m を 6m 先から（画角は箱の高さに合わせる）。箱の真ん中は y=2.1（足もと −0.3）
  const D = 6, cy = EFUDA.boxH / 2 - EFUDA.foot;
  bakeCam = new THREE.PerspectiveCamera(2 * Math.atan(EFUDA.boxH / 2 / D) * 180 / Math.PI, EFUDA.tileW / EFUDA.tileH, 1, 30);
  bakeCam.position.set(0, cy, D); bakeCam.lookAt(0, cy, 0); bakeCam.updateMatrixWorld();
  // 倒れ：上から（頭は −Z へ）
  deadCam = new THREE.PerspectiveCamera(bakeCam.fov, bakeCam.aspect, 1, 30);
  deadCam.up.set(0, 0, -1); deadCam.position.set(0, D, -cy); deadCam.lookAt(0, 0, -cy); deadCam.updateMatrixWorld();
  wrap = new THREE.Group();
  const pg = new THREE.PlaneGeometry(1, 1);
  quadGeo = pg;
}

function makeKey(key) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = quadGeo.index; g.setAttribute('position', quadGeo.attributes.position); g.setAttribute('uv', quadGeo.attributes.uv);
  const cap = EFUDA.cap;
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aDir = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPos', aPos); g.setAttribute('aInfo', aInfo); g.setAttribute('aDir', aDir);
  g.instanceCount = 0;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.userData.astcAlpha = true; tex.userData.astcStatic = true;
  tex.userData.noAstc = false; tex.userData.astcN = 0;   // 作った直後（空の絵）の needsUpdate で付いた noAstc を消す（焼いた後に ASTC にし、canvas を返す。10/22）
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uBox: { value: new THREE.Vector2(EFUDA.boxW, EFUDA.boxH) }, uFoot: { value: EFUDA.foot }, uGrid: { value: new THREE.Vector2(EFUDA.cols, EFUDA.rows) } }]),
    vertexShader: VERT, fragmentShader: FRAG, fog: true, side: THREE.DoubleSide, transparent: false,
  });
  mat.uniforms.map.value = tex;
  mat.customProgramCacheKey = () => 'efuda';
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.renderOrder = 1;
  mesh.name = 'efuda';
  return { key, g, aPos, aInfo, aDir, tex, canvas, mat, mesh, n: 0, ready: false, baking: false, failed: false, light: 1, scene: null };
}

// 姿の組の名（名のある者・騎馬は絵札にしない）
export function efudaKeyOf(u) {
  if (u.efudaKey !== undefined && u.efudaLook === u.look) return u.efudaKey;
  const L = u.look;
  let k = null;
  if (L && !u.mounted && !u.isPlayer && !u.name && !L.hero && !L.real && !L.kosode && !L.uma && !L.standard && !L.horo && !u.tatake && u.type !== 'porter' && u.type !== 'dummy' && u.type !== 'busho' && !u.isStruct) {
    // 20m の先で見分けの付く物だけ（兜か笠か・甲冑の色・得物・羽織・陣）。鉢の形・籠手・袖・笠の色の違いは同じ絵で
    k = [u.team, u.type, L.armor, String(L.hat || '').replace(/_.*$/, ''), L.weapon, L.spear || '', L.sohei ? 1 : 0, L.haori || 0].join('|');
  }
  u.efudaKey = k; u.efudaLook = L;
  return k;
}

function lightLevel(world) {
  const s = world?.sun, h = world?.hemi;
  return (s ? s.intensity : 1) * 0.6 + (h ? h.intensity : 1) * 0.4;
}

// 絵札に替えたい兵か（距離はカメラから）
export function efudaWants(u, d, force = false) {
  if (!EFUDA.on || u.name || u.type === 'busho' || u.qualityTier != null && u.qualityTier !== 2 || u.isPlayer || u.imp || u.camHidden || u.mounted || !u.mesh || !u.mesh.visible || u.gone || u.isSub || u.isStandard || u.isStruct || u.climb || u.downed || u.dragging || u.iwaFlagRig || u.tennojiFlagRig) return false;
  // 倒れる途中は骨の姿を保つ。寝た後にだけ亡骸の絵へ渡す。
  if ((!u.alive || u.dying) && (u.death ? u.death.t < DEATH_END || u.death.aid : (u.deadT || 0) < 1)) return false;
  if (!force && !(d > (u.efuda ? EFUDA.far - EFUDA.hyst : EFUDA.far))) return false;   // 骨の枠を越えても、品質の段が近景・中景の兵は絵札にしない
  return efudaKeyOf(u) !== null;
}

// 兵を絵札の状態に出し入れする（体の部品を隠す・戻す。指物・足もとの影・馬印は残す）
export function efudaSet(u, K) {
  if (K) {
    if (u.efuda === K) return;
    if (!u.efuda) {
      const hid = u.efudaHid || (u.efudaHid = []);
      hid.length = 0;
      const keep = HIDE_KEEP.map((k) => u[k]);
      for (const c of u.mesh.children) {
        if (!c.visible || keep.includes(c) || (u.human && c === u.human.root)) continue;
        c.visible = false; hid.push(c);
      }
    }
    u.efuda = K;
  } else if (u.efuda) {
    u.efuda = null;
    const hid = u.efudaHid;
    if (hid) { for (const c of hid) c.visible = true; hid.length = 0; }
    if (u.body) u.body.visible = !(u.human && u.human.root.visible);
  }
}

export function efudaKeyState(u) {
  const key = efudaKeyOf(u);
  if (!key) return null;
  let K = EFUDA.keys.get(key);
  if (!K) {
    if (EFUDA.keys.size >= EFUDA.maxKeys) { EFUDA.stat.over++; return null; }
    ensure();
    K = makeKey(key); EFUDA.keys.set(key, K); EFUDA.stat.keys = EFUDA.keys.size;
  }
  if (K.failed) return null;
  // 裏で ASTC に圧縮している間（仮の 4×4 の絵）は、まだ人のまま
  if (K.baked && !K.ready && !K.tex.userData.astcBusy) K.ready = true;
  return K;
}

// 人 h（場面に居る・骨と部品が出来ている）の姿を K の絵に焼く。pose(h, mode, phase) は humans.js の姿決め（0 立ち・1 歩き・2 駆け）
export function efudaBake(renderer, scene, world, camPos, h, K, pose) {
  if (!renderer || K.baked || K.baking || bakedThisFrame > 0) return false;
  bakedThisFrame++;
  ensure();
  const t0 = performance.now();
  // 兵の根元（u.mesh：人の根・手と得物・指物を含む）ごと場面の上の焼き場へ移す（得物は人の骨でなく兵の根元の手に付いている）
  const u = h.u, m = u.mesh, par = m.parent;
  if (!par) return false;
  const cam0 = renderer.getRenderTarget();
  const autoClear = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  const smAuto = renderer.shadowMap.autoUpdate, smOn = renderer.shadowMap.enabled, smNeed = renderer.shadowMap.needsUpdate, mwAuto = scene.matrixWorldAutoUpdate, bg = scene.background, obr = scene.onBeforeRender, oar = scene.onAfterRender;
  const wpn = u.wpn, wpnMask = wpn ? wpn.layers.mask : 0;
  const hidden = [];
  const hideParts = [u.flag, u.blob, u.uma].filter((o) => o && o.visible);
  const saved = { px: m.position.x, py: m.position.y, pz: m.position.z, qx: m.quaternion.x, qy: m.quaternion.y, qz: m.quaternion.z, qw: m.quaternion.w, sx: m.scale.x, sy: m.scale.y, sz: m.scale.z, vis: m.visible, off: u.offscreen, force: u.forceSpd, mw0: h.mw0, hold: h.mwHold, ph: h.poseHidden };
  let ok = false;
  try {
    for (const c of scene.children) { if (c.visible && !c.isLight) { c.visible = false; hidden.push(c); } }
    scene.background = null; scene.matrixWorldAutoUpdate = false;
    scene.onBeforeRender = noop; scene.onAfterRender = noop;   // 軍の束ね直し（batchDraw）を焼く度に走らせない
    renderer.shadowMap.autoUpdate = false;
    // 戦と同じ影の有無で焼く（影なしで焼くと、同じ人の材質が開戦後に影つきで組み直され、一コマ止まる。10/28）。影の絵は描き直さない
    if (window.__battleShadow) { renderer.shadowMap.enabled = window.__battleShadow(); renderer.shadowMap.needsUpdate = false; }
    renderer.autoClear = true; renderer.setClearColor(0x000000, 0);
    if (wpn) wpn.layers.enable(0);   // 遠い人の槍は farSpears が層を外して束で描いている。焼く間は元の網を出す
    // 焼く場所：カメラの 80m 上（影の的の外・霧の外）
    wrap.position.set(camPos ? camPos.x : 0, (camPos ? camPos.y : 0) + 80, camPos ? camPos.z : 0);
    wrap.rotation.set(0, 0, 0); wrap.scale.set(1, 1, 1);
    scene.add(wrap);
    m.position.set(0, 0, 0); m.quaternion.set(0, 0, 0, 1); m.scale.set(1, 1, 1); m.visible = true; u.offscreen = false;
    wrap.add(m);
    for (const o of hideParts) o.visible = false;
    h.mwHold = false; h.mw0 = null; h.poseHidden = false;
    const place = (cam, camPos, lookAt) => { cam.position.copy(wrap.position).add(camPos); cam.lookAt(wrap.position.x + lookAt.x, wrap.position.y + lookAt.y, wrap.position.z + lookAt.z); cam.updateMatrixWorld(); };
    const D = 6, cy = EFUDA.boxH / 2 - EFUDA.foot;
    const vTile = (idx) => { const col = idx % EFUDA.cols, row = Math.floor(idx / EFUDA.cols); rt.viewport.set(col * EFUDA.tileW, row * EFUDA.tileH, EFUDA.tileW, EFUDA.tileH); rt.scissor.copy(rt.viewport); renderer.setRenderTarget(rt); };
    const FR = [[0, 0], [1, 0], [1, 0.25], [1, 0.5], [1, 0.75], [2, 0], [2, 0.5]];
    for (let f = 0; f < EFUDA.frames; f++) {
      wrap.rotation.set(0, 0, 0); wrap.updateMatrixWorld(true);
      pose(h, FR[f][0], FR[f][1]);
      for (let d = 0; d < EFUDA.dirs; d++) {
        wrap.rotation.set(0, d * Math.PI * 2 / EFUDA.dirs, 0); wrap.updateMatrixWorld(true);
        place(bakeCam, _v.set(0, cy, D), _v2.set(0, cy, 0));
        vTile(d * EFUDA.frames + f);
        renderer.render(scene, bakeCam);
      }
    }
    // 倒れ：立ち姿のまま仰向けに（頭は −Z）、上から
    wrap.rotation.set(0, 0, 0); wrap.updateMatrixWorld(true);
    pose(h, 0, 0);
    wrap.rotation.set(-Math.PI / 2, 0, 0); wrap.updateMatrixWorld(true);
    deadCam.up.set(0, 0, -1);
    place(deadCam, _v.set(0, D, -cy), _v2.set(0, 0, -cy));
    vTile(DEAD_TILE);
    renderer.render(scene, deadCam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
    // iPhone：前の焼きの後に astc_rt が canvas を 1×1 に返している（astcStatic）。描き直す時は戻し、絵をまた canvas にする
    if (K.canvas.width !== W || K.canvas.height !== H) { K.canvas.width = W; K.canvas.height = H; K.tex.image = K.canvas; K.tex.userData.astcCanvas = K.canvas; K.tex.isCompressedTexture = false; K.tex.mipmaps = []; }
    const ctx = K.canvas.getContext('2d');
    const img = ctx.createImageData(W, H); img.data.set(pixels); ctx.putImageData(img, 0, 0);
    K.tex.needsUpdate = true;
    K.light = lightLevel(world);
    K.baked = true; K.ready = !K.tex.userData.astcBusy;
    ok = true;
  } catch (e) {
    K.failed = true; EFUDA.stat.err = String(e && e.message || e);
  } finally {
    wrap.remove(m); scene.remove(wrap);
    m.position.set(saved.px, saved.py, saved.pz); m.quaternion.set(saved.qx, saved.qy, saved.qz, saved.qw); m.scale.set(saved.sx, saved.sy, saved.sz); m.visible = saved.vis; u.offscreen = saved.off;
    par.add(m);
    for (const o of hideParts) o.visible = true;
    if (saved.force === undefined) delete u.forceSpd; else u.forceSpd = saved.force;
    h.mw0 = saved.mw0; h.mwHold = saved.hold; h.poseHidden = saved.ph;
    for (const c of hidden) c.visible = true;
    scene.background = bg; scene.matrixWorldAutoUpdate = mwAuto; scene.onBeforeRender = obr; scene.onAfterRender = oar;
    if (wpn) wpn.layers.mask = wpnMask;
    renderer.shadowMap.autoUpdate = smAuto; renderer.shadowMap.enabled = smOn; renderer.shadowMap.needsUpdate = smNeed;
    renderer.setRenderTarget(cam0); renderer.autoClear = autoClear; renderer.setClearColor(cc, ca);
    m.updateMatrixWorld(true);
    EFUDA.stat.baked++; EFUDA.stat.bakeMs += performance.now() - t0;
  }
  return ok;
}
// 携帯の遠景は、近景の骨を作らず、すでにある軽い兵から絵札を用意する。
// 同じ姿の全兵で一枚を共有。焼く時の入れ物も使い回す。
const lightHuman = { u: null, mw0: null, mwHold: false, poseHidden: false };
const lightMeshes = [], lightMasks = [];
function showLightMesh(o) {
  if (!o.isMesh) return;
  lightMeshes.push(o); lightMasks.push(o.layers.mask); o.layers.enable(0);
}
function lightPose(h, mode, phase) {
  const u = h.u, a = mode === 0 ? 0 : Math.sin(phase * Math.PI * 2) * (mode === 2 ? 0.65 : 0.4);
  if (u.legL) u.legL.rotation.x = a;
  if (u.legR) u.legR.rotation.x = -a;
}
export function efudaBakeLight(renderer, scene, world, camPos, u, K) {
  if (!MEM_TIGHT || K.baked || K.baking || bakedThisFrame > 0) return false;
  const lx = u.legL?.rotation.x, rx = u.legR?.rotation.x;
  lightHuman.u = u;
  // 一括描画に移した元の部品も、焼く間だけ直接描く。
  lightMeshes.length = lightMasks.length = 0;
  u.mesh.traverse(showLightMesh);
  try { return efudaBake(renderer, scene, world, camPos, lightHuman, K, lightPose); }
  finally {
    if (u.legL) u.legL.rotation.x = lx;
    if (u.legR) u.legR.rotation.x = rx;
    for (let i = 0; i < lightMeshes.length; i++) lightMeshes[i].layers.mask = lightMasks[i];
    lightMeshes.length = lightMasks.length = 0;
    lightHuman.u = null;
    u.mesh.updateMatrixWorld(true);
  }
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const noop = () => {};

// 毎コマ：絵札の兵の位置・向き・コマを束へ書く
export function efudaUpdate(scene, world, units, time) {
  if (!EFUDA.keys.size) return;
  for (const K of EFUDA.keys.values()) K.n = 0;
  let total = 0;
  for (const u of units) {
    const K = u.efuda;
    if (!K) continue;
    if (K.n >= EFUDA.cap) { efudaSet(u, null); EFUDA.stat.dropped++; continue; }
    const i = K.n++;
    const P = K.aPos.array, I = K.aInfo.array;
    P[i * 3] = u.pos.x; P[i * 3 + 1] = u.pos.y; P[i * 3 + 2] = u.pos.z;
    let fr = 0, tilt = 0, dir = Math.PI;
    if (!u.alive || u.dying) {
      const D = u.death;
      tilt = D ? Math.min(1, D.t / (DEATH_END * 0.5)) : Math.min(1, (u.deadT || 0) / 0.55);
      if (D) dir = D.kind === 'side' ? (D.side < 0 ? -Math.PI / 2 : Math.PI / 2) : D.fwd ? 0 : Math.PI;
      else if (u.fallAxis === 'z') dir = (u.fall || 1) < 0 ? -Math.PI / 2 : Math.PI / 2;
      else dir = (u.fall || 1) < 0 ? 0 : Math.PI;
      if (tilt >= 1) fr = 7;
    } else {
      const v = u.mv ? Math.hypot(u.mv.x, u.mv.z) : 0;
      if (v > 0.3) {
        // 歩みの拍子：速さに合わせて 4 コマを回す（人ごとに位相をずらす）
        const ph = (time * (v > 2.8 ? 2.2 : 1.6) + (u.id * 0.37) % 1) % 1;
        fr = v > 2.8 ? 5 + Math.floor(ph * 2) : 1 + Math.floor(ph * 4);
      }
    }
    I[i * 4] = u.heading; I[i * 4 + 1] = fr; I[i * 4 + 2] = tilt; I[i * 4 + 3] = u.mesh.scale.y || 1;
    K.aDir.array[i] = dir;
    total++;
  }
  const L = lightLevel(world);
  for (const K of EFUDA.keys.values()) {
    if (K.mesh.parent !== scene) { if (K.mesh.parent) K.mesh.parent.remove(K.mesh); scene.add(K.mesh); }
    K.g.instanceCount = K.n;
    K.mesh.visible = K.n > 0;
    if (!K.n) continue;
    K.aPos.needsUpdate = true; K.aInfo.needsUpdate = true; K.aDir.needsUpdate = true;
    const k = Math.max(0.2, Math.min(2, L / (K.light || 1)));
    K.mat.uniforms.uLight.value.set(k, k, k);
  }
  EFUDA.stat.n = total;
}

export function efudaDispose(units) {
  if (units) for (const u of units) { if (u.efuda) efudaSet(u, null); u.efudaKey = undefined; }
  for (const K of EFUDA.keys.values()) {
    if (K.mesh.parent) K.mesh.parent.remove(K.mesh);
    K.g.dispose(); K.mat.dispose(); K.tex.dispose();
    K.canvas.width = K.canvas.height = 1;
  }
  EFUDA.keys.clear(); EFUDA.stat.keys = 0; EFUDA.stat.n = 0;
  if (rt) { rt.dispose(); rt = null; pixels = null; }
}
