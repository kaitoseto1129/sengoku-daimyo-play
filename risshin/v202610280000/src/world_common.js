import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

// 結合先は独立した配列を持つ。使い終えた元の部品は絵の仕組みに保持させない。
function mergeVegetationParts(parts) {
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  parts.length = 0;
  return merged;
}

// 地形・植生・天候・時間帯
export const HALF = 180;
const SEG = 144;
const NO_STREAMS = [];
const SMOKE_SOOT = new THREE.Color(0.065, 0.058, 0.052);
// 残り火の照明は視点の周囲128mを64角の升へ焼く。頂点ごとに一度だけ読み、兵の束も同じ材質で照らす。
const FIRE_FILL = { map: { value: null }, area: { value: new THREE.Vector3() } };
const FIRE_FILL_MATS = new WeakSet();
function fireFillMaterial(mat) {
  if (!mat || FIRE_FILL_MATS.has(mat) || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
  FIRE_FILL_MATS.add(mat);
  const before = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  // 火の照りを足した材質から作った派生（近くの肌・倒れ・薄く等）は、元の処理で既に照らされる。鍵だけ二重に伸ばして描き方を作り直さない（10/28 小谷：開戦後に十余り）
  if (key.includes('|fire-fill')) return;
  mat.onBeforeCompile = function (sh, renderer) {
    before.call(this, sh, renderer);
    // 濡れ・倒れなどの派生材質は元の処理も呼ぶ。材質が別でも、同じ絵へ火を二度足さない。
    if (sh.uniforms.uFireFill === FIRE_FILL.map) return;
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <opaque_fragment>')) return;
    sh.uniforms.uFireFill = FIRE_FILL.map; sh.uniforms.uFireArea = FIRE_FILL.area;
    // 手取川の広い地面は画素ごとに距離を測る。頂点の暖色を三角形いっぱいへ伸ばさない。
    if (mat.userData.fragmentGroundFire) {
      sh.fragmentShader = 'uniform sampler2D uFireFill; uniform vec3 uFireArea;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 fireUV = (vWP.xz - uFireArea.xy) / 128.0;
        if (uFireArea.z > 0.0 && all(greaterThanEqual(fireUV, vec2(0.0))) && all(lessThan(fireUV, vec2(1.0)))) {
          vec4 fireSource = texture2D(uFireFill, fireUV);
          if (fireSource.w > 0.0) {
            vec3 fireDelta = fireSource.xyz - vWP;
            float fireDistance = length(fireDelta);
            float fireReach = max(0.0, 1.0 - fireDistance / fireSource.w);
            float fireAmount = fireReach * fireReach * (0.12 + 0.88 * max(0.0,
              dot(normalize(vWN), fireDelta / max(0.01, fireDistance)))) * uFireArea.z;
            outgoingLight += diffuseColor.rgb * vec3(1.0, 0.32, 0.08) * fireAmount;
          }
        }
        #include <opaque_fragment>`);
      return;
    }
    sh.vertexShader = 'uniform sampler2D uFireFill; uniform vec3 uFireArea; varying float vFireFill;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec3 fireWorld = vec3(dot(viewMatrix[0].xyz, mvPosition.xyz), dot(viewMatrix[1].xyz, mvPosition.xyz), dot(viewMatrix[2].xyz, mvPosition.xyz)) + cameraPosition;
      vec2 fireUV = (fireWorld.xz - uFireArea.xy) / 128.0;
      vFireFill = 0.0;
      if (uFireArea.z > 0.0 && all(greaterThanEqual(fireUV, vec2(0.0))) && all(lessThan(fireUV, vec2(1.0)))) {
        vec4 fireSource = texture2D(uFireFill, fireUV);
        if (fireSource.w > 0.0) {
          vec3 fireDelta = (viewMatrix * vec4(fireSource.xyz, 1.0)).xyz - mvPosition.xyz;
          float fireDistance = length(fireDelta);
          float fireReach = max(0.0, 1.0 - fireDistance / fireSource.w);
          vFireFill = fireReach * fireReach * (0.12 + 0.88 * max(0.0, dot(normalize(transformedNormal), fireDelta / max(0.01, fireDistance)))) * uFireArea.z;
        }
      }`);
    sh.fragmentShader = 'varying float vFireFill;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vec3(1.0, 0.32, 0.08) * vFireFill;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key + (mat.userData.fragmentGroundFire ? '|fire-fill-ground' : '|fire-fill');
  mat.needsUpdate = true;
}
function fireFillObject(o) {
  if (Array.isArray(o.material)) { for (const mat of o.material) fireFillMaterial(mat); }
  else fireFillMaterial(o.material);
}
export function isNoRender() {
  return typeof window !== 'undefined' && (window.__norender === true ||
    typeof location !== 'undefined' && /[?&]norender\b/.test(location.search));
}

// 山道の全区間を兵ごとにたどらず、足もとの十二メートルの升だけを見る。
// 幅を含む囲みを登録するので、曲がり角・道の端・石段の境目も元の距離判定で拾える。
const roadGrids = new WeakMap(), NO_ROADS = [];
const roadKey = (x, z) => (x + 20000) * 40000 + z + 20000;
export function roadTag(world, x, z) {
  const paths = world.def.paths;
  if (!paths?.length) return '';
  let G = roadGrids.get(world);
  if (!G || G.paths !== paths || G.n !== paths.length || G.width !== world.def.pathWidth) {
    G = { paths, n: paths.length, width: world.def.pathWidth, cells: new Map(), wide: [] };
    for (let order = 0; order < paths.length; order++) {
      const p = paths[order], pts = p?.pts || p, w = p.w ?? world.def.pathWidth ?? 2;
      if (!pts || !(w > 0)) continue;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const dx = bx - ax, dz = bz - az;
        const s = { ax, az, dx, dz, l2: dx * dx + dz * dz || 1, w2: w * w, order,
          tag: p.stairs || p.kind === 'stairs' ? 'stairs' : 'path' };
        if (!Number.isFinite(w)) { G.wide.push(s); continue; }
        for (let ix = Math.floor((Math.min(ax, bx) - w) / 12); ix <= Math.floor((Math.max(ax, bx) + w) / 12); ix++) {
          for (let iz = Math.floor((Math.min(az, bz) - w) / 12); iz <= Math.floor((Math.max(az, bz) + w) / 12); iz++) {
            const k = roadKey(ix, iz);
            let cell = G.cells.get(k);
            if (!cell) G.cells.set(k, cell = []);
            cell.push(s);
          }
        }
      }
    }
    roadGrids.set(world, G);
  }
  let best = 1, order = Infinity, tag = '';
  const near = G.cells.get(roadKey(Math.floor(x / 12), Math.floor(z / 12))) || NO_ROADS;
  for (let j = 0; j < 2; j++) {
    const list = j ? G.wide : near;
    for (const s of list) {
      const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2));
      const dx = s.ax + s.dx * t - x, dz = s.az + s.dz * t - z;
      const d = (dx * dx + dz * dz) / s.w2;
      if (d < best || d === best && d < 1 && s.order < order) { best = d; order = s.order; tag = s.tag; }
    }
  }
  return tag;
}
// 旗の模様を保った薄い月の照り返し。霧と色の仕上げは通常どおり通す。
export const FLAG_MOON = { value: 0 };
export function flagMoonlight(sh, night = FLAG_MOON) {
  sh.uniforms.uFlagMoon = night;
  sh.fragmentShader = 'uniform float uFlagMoon;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    'outgoingLight += diffuseColor.rgb * vec3(0.55, 0.7, 0.95) * uFlagMoon * 0.08;\n#include <opaque_fragment>');
}
const TUFT_AUTUMN = new THREE.Color(0.4, 0.35, 0.21);   // 秋の草むらの枯れ色
// 近い草と遠い草で同じ群落を使う。場所だけで決まり、歩いても斑が動かない。
function tuftClumpAt(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.18 + Math.sin(z * 0.11) * 2.4)
    * Math.cos(z * 0.16 - Math.sin(x * 0.09) * 1.8);
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function distToPolyline(x, z, pts) {
  pts = pts && (pts.pts || pts);
  if (!pts || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

// 浅瀬は遊び用の復元。川床を上げ、水面はほかの流れと同じ高さに保つ。
function fordLift(st, x) {
  if (!st.fords) return 0;
  let k = 0;
  for (const f of st.fords) k = Math.max(k, Math.max(0, Math.min(1, (f.w - Math.abs(x - f.x)) / 4)));
  return Math.max(0, st.depth - 0.35) * k;
}


export { fireFillObject, FIRE_FILL, SEG, NO_STREAMS, fordLift, SMOKE_SOOT, tuftClumpAt, mergeVegetationParts, TUFT_AUTUMN };
