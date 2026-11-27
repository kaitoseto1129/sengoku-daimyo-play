// K718④（11/26 kaito 伊達編「少年の政宗（相馬）→老いた政宗（道明寺）の見た目の変化」）
// K705④ の武将の体（K697 の体に当世具足）は、顔が体の絵（升の 0〜0.5 の顔・肌・目）の一枚で、名のある武将の
// 顔の絵（humans_face_materials.js の髭・年）を使わない。そのため政宗の若・壮・老（units_data.js）が三つとも同じ顔だった。
// ここでは K705 の材質を顔の年ごとに写し、顔の升の上に髭（口髭・顎鬚・頬）と剃り跡・年の皺とこけた頬を描き足す。
// 場所は体の形の頭（骨 Head の重み）の点から測った鼻・口・顎の高さで決める（体の形が替わっても測り直す）。
import * as THREE from 'three';
import { GENERALS } from './units_data.js';

// 顔を描き足す武将（名の頭）。顔の値は GENERALS[名].face（age・gaunt・hair・beard）
const WHO = /^伊達政宗/;
const MATS = new Map();
let LM = null;
const lin = (hex) => new THREE.Color(hex);

// 頭の目印（体の形の座標）：鼻の先・顎の先・口の高さ
function landmarks(mesh) {
  if (LM) return LM;
  const g = mesh.geometry, P = g.attributes.position, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const hi = mesh.skeleton.bones.findIndex((b) => /Head$/.test(b.name) && !/HeadTop/.test(b.name));
  if (hi < 0 || !UV || !SI) return null;
  let nose = null, chin = null, top = -1e9;
  const pts = [];
  for (let i = 0; i < P.count; i++) {
    if (!(UV.getX(i) < 0.5 && UV.getY(i) < 0.5)) continue;
    let w = 0; for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === hi) w += SW.getComponent(i, k);
    if (w < 0.5) continue;
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    pts.push(x, y, z); top = Math.max(top, y);
  }
  if (!pts.length) return null;
  // 顔の前は z の+と−のどちらか（体の形は z を裏返して置く）：端から 1.5cm の点の横幅が狭い方が鼻（広い方は後頭部）
  let zl = 1e9, zh = -1e9; for (let i = 2; i < pts.length; i += 3) { zl = Math.min(zl, pts[i]); zh = Math.max(zh, pts[i]); }
  const wid = (f, z0) => { let a = 1e9, b = -1e9; for (let i = 0; i < pts.length; i += 3) if ((pts[i + 2] - z0) * f > -0.015) { a = Math.min(a, pts[i]); b = Math.max(b, pts[i]); } return b - a; };
  const F = wid(1, zh) < wid(-1, zl) ? 1 : -1;
  for (let i = 0; i < pts.length; i += 3) { pts[i + 2] *= F; if (!nose || pts[i + 2] > nose.z) nose = { x: pts[i], y: pts[i + 1], z: pts[i + 2] }; }
  for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (Math.abs(x - nose.x) < 0.025 && z > nose.z - 0.05 && y < nose.y && (!chin || y < chin.y)) chin = { x, y, z }; }
  if (!chin) return null;
  LM = { nose: new THREE.Vector3(nose.x, nose.y, nose.z), chinY: chin.y, chinZ: chin.z, mouthY: chin.y + (nose.y - chin.y) * 0.5, top, F };
  return LM;
}

// K705 を着た骨の人 h に、顔の年の材質を着せる（政宗の外は何もしない）
export function k718Face(h, L) {
  const nm = typeof L?.face === 'string' && L.face.startsWith('g:') ? L.face.slice(2) : '';
  if (!WHO.test(nm)) return false;
  const F = GENERALS[nm]?.face;
  if (!F) return false;
  let mesh = null;
  h.model.traverse((o) => { if (!mesh && o.name === 'k705' && o.isSkinnedMesh) mesh = o; });
  if (!mesh) return false;
  const lm = landmarks(mesh);
  if (!lm) return false;
  const base = mesh.material, key = base.uuid + '|' + nm;
  let m = MATS.get(key);
  if (!m) {
    const B = F.beard || {}, age = F.age ?? 30;
    const U = {
      uKNose: { value: lm.nose }, uKMouth: { value: new THREE.Vector3(lm.chinY, lm.mouthY, lm.chinZ) }, uKF: { value: lm.F },
      uKHair: { value: lin(F.hair ?? 0x1a1612) },
      uKBeard: { value: new THREE.Vector4(B.mus ?? 0, B.goat ?? 0, B.side ?? 0, B.stub ?? 0.5) },
      uKShape: { value: new THREE.Vector4(B.musW ?? 1, B.musH ?? 1, B.droop ?? 0.4, B.goatW ?? 1) },
      // 年：皺（30 から増える）・こけた頬（gaunt）
      uKAge: { value: new THREE.Vector2(Math.max(0, Math.min(1, (age - 30) / 18)), Math.max(0, F.gaunt ?? 0)) },
    };
    m = base.clone();
    m.userData = { ...base.userData, k718U: U };
    const pre = base.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      pre.call(base, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vK718P; varying vec2 vK718U;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vK718P = position; vK718U = uv;');
      sh.fragmentShader = 'varying vec3 vK718P; varying vec2 vK718U; uniform vec3 uKNose, uKMouth, uKHair; uniform vec4 uKBeard, uKShape; uniform vec2 uKAge; uniform float uKF;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vK718U.x < 0.5 && vK718U.y < 0.5 && vK718P.z * uKF > uKNose.z - 0.075 && vK718P.y > uKMouth.x - 0.025 && vK718P.y < uKNose.y + 0.05) {
        vec3 p = vec3(vK718P.xy, vK718P.z * uKF); float dx = abs(p.x - uKNose.x), my = uKMouth.y, ch = uKMouth.x;
        // 毛の筋（細かい揺らぎ）：縦に長い粒で一本ずつの毛に見せる
        vec2 hp = vec2(p.x * 900.0, p.y * 260.0 + p.z * 300.0);
        float n = fract(sin(dot(floor(hp), vec2(12.9898, 78.233))) * 43758.5453);
        float lip = step(dx, 0.024) * step(abs(p.y - my), 0.0065);
        float below = step(p.y, uKNose.y - 0.014);
        // 剃り跡：鼻の下から顎まで・頬の下（唇は外す）
        float jaw = below * smoothstep(0.075, 0.05, dx) * (1.0 - lip);
        diffuseColor.rgb *= 1.0 - uKBeard.w * 0.16 * jaw;
        // 口髭：上唇の上の帯。端は下がる（droop）
        float t = dx / (0.032 * uKShape.x);
        float yc = my + 0.0105 - uKShape.z * 0.012 * t * t;
        float mus = step(t, 1.0) * smoothstep(0.009 * uKShape.y, 0.004 * uKShape.y, abs(p.y - yc)) * step(0.004, dx + 0.004);
        // 顎鬚：下唇の下から顎の先の下まで
        float goat = smoothstep(0.019 * uKShape.w, 0.012 * uKShape.w, dx) * step(p.y, my - 0.009) * step(ch - 0.02, p.y);
        // 頬の髭：顎の線にそって耳の方へ
        float side = smoothstep(0.045, 0.06, dx) * below * step(p.y, my + 0.02) * step(ch - 0.01, p.y);
        float hair = max(max(mus * uKBeard.x, goat * uKBeard.y), side * uKBeard.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, uKHair * (0.7 + 0.6 * n), clamp(hair * (0.8 + 0.5 * n), 0.0, 1.0));
        // 年の皺：小鼻から口の端への溝（ほうれい線）・目の下・こけた頬の影
        float a = uKAge.x;
        float s = clamp((uKNose.y - 0.006 - p.y) / max(uKNose.y - my, 0.01), 0.0, 1.2);
        float fold = smoothstep(0.0028, 0.0, abs(dx - (0.021 + 0.013 * s))) * step(p.y, uKNose.y - 0.004) * step(my - 0.008, p.y);
        float eye = smoothstep(0.003, 0.0, abs(p.y - (uKNose.y + 0.017 - 0.004 * smoothstep(0.012, 0.04, dx)))) * smoothstep(0.012, 0.02, dx) * smoothstep(0.045, 0.035, dx);
        float hollow = smoothstep(0.06, 0.045, abs(dx - 0.052) + abs(p.y - (my + 0.012)) * 1.4);
        diffuseColor.rgb *= 1.0 - (fold * 0.32 + eye * 0.22) * a - hollow * 0.2 * uKAge.y;
      }`);
    };
    m.customProgramCacheKey = () => 'k705|k718';
    MATS.set(key, m);
  }
  mesh.material = m;
  return true;
}
