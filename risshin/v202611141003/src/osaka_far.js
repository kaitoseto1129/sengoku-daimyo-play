// 豊臣の大坂城の遠景（徳川編 k08・k09・k10・k15 で見える城。真田丸は b_osaka.js）
// 手本と出所は docs/battle_refs/k15_tennoji_okayama.md。縄張りは中井家の「豊臣時代大坂城本丸図」と『大坂冬の陣図屏風』：
//   本丸は三段（北の低い山里曲輪・いちばん高い詰ノ丸（奥の段。北東の隅に天守）・南の表の段）を野面積みの石垣で積み、内堀が囲む。
//   二の丸は北が石垣・東西が腰巻石垣（下だけ石で上は土）・南が土塁。各虎口の前に土塁の大きな馬出。外堀が囲む。
//   惣構えは北の大川・東の猫間川・西の東横堀川・南の空堀と土塁。天守は望楼型の五重で、黒漆の下見板に金の飾り。
// 夏（era: 'summer'）は冬の陣の和議で二の丸・三の丸・惣構えが壊され、堀が埋められた後の「裸城」：本丸と内堀だけ。
// 向きは北が −z。座標の 1 は s（ゲームの s 単位 ≒ 実の 8m）。遠景なので当たりは無い（天守の台だけ）。形は色ごとに一つへ束ねる。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
const WATER = new THREE.MeshStandardMaterial({ color: 0x33474b, roughness: 0.2, metalness: 0.2 });
const C = { stone: 0x726c62, earth: 0x6c5c42, grass: 0x5d673c, top: 0x66654a, black: 0x26221f, roof: 0x4b4b4e, gold: 0xb8952e, dark: 0x3a3530, kara: 0x5a4c38 };

// 描く距離（カメラの奥 150）の外の城を、山並み（world_sky.js）と同じく奥の深さで描く：深さは距離の順のまま
// 奥の 140 より先は 0.9999〜0.99999 に詰め（手前の物の後ろ・山の前。近くでは元の深さ）、霞は cap まで（白く消えない）。材質は一度だけ複製する
const FAR = new Map();
function farMat(src, cap = 0.32) {
  const fk = src.uuid + cap;
  let m = FAR.get(fk);
  if (m) return m;
  m = src.clone(); m.transparent = true; m.opacity = 1; m.depthWrite = true; FAR.set(fk, m);
  const key = src.customProgramCacheKey();
  m.customProgramCacheKey = () => `${key}|大坂の遠景${cap}`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  if (-mvPosition.z > 140.0) gl_Position.z = gl_Position.w * (0.9999 + 0.000089 * clamp((-mvPosition.z - 140.0) / 900.0, 0.0, 1.0));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
      .replace(/gl_FragColor\.rgb = mix\( gl_FragColor\.rgb, (\w+), fogFactor \);/g, (s) => `fogFactor = min(fogFactor, ${cap.toFixed(2)});\n  ${s}`);
  };
  return m;
}
function farOnly(grp, cap) {
  grp.traverse((q) => {
    q.userData.camBlock = false;
    if (!q.isMesh) return;
    // 野の霞の板（world_haze.js。描く順 1〜3）の後に描く：霞は材質の霧（cap）だけで掛け、二重に白くしない
    q.frustumCulled = false; q.castShadow = false; q.renderOrder = 4;
    q.material = Array.isArray(q.material) ? q.material.map((x) => farMat(x, cap)) : farMat(q.material, cap);
  });
}

function paint(geo, hex, shade = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(hex), P = g.attributes.position, n = P.count, a = new Float32Array(n * 3);
  let y0 = Infinity, y1 = -Infinity;
  if (shade) for (let i = 0; i < n; i++) { y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); }
  for (let i = 0; i < n; i++) {
    const k = shade && y1 > y0 ? 1 - shade * (1 - (P.getY(i) - y0) / (y1 - y0)) : 1;   // 下ほど湿りと苔で暗い
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// 外向きの四角の面（向きは中心 cx,cz から外へ）
function quad(parts, p, hex, cx, cz, shade) {
  const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2], bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
  const nx = ay * bz - az * by, nz = ax * by - ay * bx;
  const out = nx * ((p[0][0] + p[2][0]) / 2 - cx) + nz * ((p[0][2] + p[2][2]) / 2 - cz) >= 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute((out ? [p[0], p[1], p[2], p[0], p[2], p[3]] : [p[0], p[2], p[1], p[0], p[3], p[2]]).flat(), 3));
  g.computeVertexNormals();
  parts.push(paint(g, hex, shade));
}

export function osakaFar(rt, o = {}) {
  const W = rt.world, s = o.s || 2, cx = o.x, cz = o.z, summer = o.era === 'summer';
  const L = (lx, lz) => [cx + lx * s, cz + lz * s];
  const parts = [], water = [];
  // 堀の水面の高さ：城の足もと一帯のいちばん高い地面（地面より下に水を張ると見えない）
  let g = -Infinity;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const [x, z] = L(i * 40, j * 40); g = Math.max(g, W.heightAt(x, z)); }
  g += 0.15;
  const Y = (h) => g + h * s;

  // 台（切岸の石垣・土塁）：四方の面を帯（下からの割合と色）で塗る。bat は上の引っ込み（s）。辺ごとに {n,s,w,e} でも渡せる（0 は垂直）
  function dai(x0, z0, x1, z1, h0, h1, bat, bands, topHex = C.top) {
    const [ax, az] = L(x0, z0), [bx, bz] = L(x1, z1), mx = (ax + bx) / 2, mz = (az + bz) / 2, yb = Y(h0) - 1.5, yt = Y(h1);
    const B = typeof bat === 'number' ? { n: bat, s: bat, w: bat, e: bat } : bat, bn = B.n * s, bs = B.s * s, bw = B.w * s, be = B.e * s;
    const sides = { n: [[ax, az], [bx, az], [bw, bn], [-be, bn]], s: [[bx, bz], [ax, bz], [-be, -bs], [bw, -bs]], w: [[ax, bz], [ax, az], [bw, -bs], [bw, bn]], e: [[bx, az], [bx, bz], [-be, bn], [-be, -bs]] };
    for (const k of ['n', 's', 'w', 'e']) {
      const [[px, pz], [qx, qz], [dpx, dpz], [dqx, dqz]] = sides[k];
      let f0 = 0;
      for (const [f1, hex] of bands[k] || bands.all) {
        const ya = yb + (yt - yb) * f0, yc = yb + (yt - yb) * f1, ia = Math.max(0, (ya - yb) / (yt - yb)), ic = (yc - yb) / (yt - yb);
        quad(parts, [[px + dpx * ia, ya, pz + dpz * ia], [qx + dqx * ia, ya, qz + dqz * ia], [qx + dqx * ic, yc, qz + dqz * ic], [px + dpx * ic, yc, pz + dpz * ic]], hex, mx, mz, hex === C.stone ? 0.3 : 0.15);
        f0 = f1;
      }
    }
    const t = new THREE.PlaneGeometry(bx - ax - bw - be, bz - az - bn - bs); t.rotateX(-Math.PI / 2); t.translate((ax + bw + bx - be) / 2, yt, (az + bn + bz - bs) / 2); parts.push(paint(t, topHex));
    return yt;
  }
  const box = (x, y, z, w, h, d, hex) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y + h / 2, z); parts.push(paint(b, hex)); };
  const roof = (x, y, z, w, d, h, hex = C.roof) => { const r = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); r.rotateY(Math.PI / 4); r.scale(w, h, d); r.translate(x, y + h / 2, z); parts.push(paint(r, hex)); };
  // 塀：線の上の黒い板塀と瓦の笠（狭間は遠くて見えないので形だけ）
  const hei = (pts, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = L(...pts[i]), [bx, bz] = L(...pts[i + 1]), len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
      const w = new THREE.BoxGeometry(0.16 * s, 0.42 * s, len); w.rotateY(a); w.translate((ax + bx) / 2, y + 0.21 * s, (az + bz) / 2); parts.push(paint(w, C.black));
      const c = new THREE.BoxGeometry(0.34 * s, 0.1 * s, len + 0.2 * s); c.rotateY(a); c.translate((ax + bx) / 2, y + 0.47 * s, (az + bz) / 2); parts.push(paint(c, C.roof));
    }
  };
  // 櫓：黒い下見板の重ね（floors 重）と入母屋の代わりの寄棟、棟に金
  const yag = (lx, lz, y, w, d, floors = 2) => {
    const [x, z] = L(lx, lz); let ww = w * s, dd = d * s, yy = y;
    for (let k = 0; k < floors; k++) {
      const fh = 0.95 * s;
      box(x, yy, z, ww, fh, dd, C.black);
      if (k < floors - 1) { box(x, yy + fh, z, ww + 0.5 * s, 0.14 * s, dd + 0.5 * s, C.roof); yy += fh + 0.12 * s; ww *= 0.72; dd *= 0.72; }
      else { roof(x, yy + fh, z, ww + 0.7 * s, dd + 0.7 * s, 0.75 * s); box(x, yy + fh + 0.62 * s, z, ww * 0.5, 0.09 * s, 0.09 * s, C.gold); }
    }
  };
  // 御殿：低い壁と大きな屋根
  const goten = (lx, lz, y, w, d) => { const [x, z] = L(lx, lz); box(x, y, z, w * s, 0.7 * s, d * s, C.dark); roof(x, y + 0.7 * s, z, (w + 1) * s, (d + 1) * s, Math.min(w, d) * 0.45 * s); };
  // 堀の水面：四角の輪（内 x0..x1 / 外へ wd）
  const ring = (x0, z0, x1, z1, wd) => {
    for (const [a, b, c, d] of [[x0 - wd, z0 - wd, x1 + wd, z0], [x0 - wd, z1, x1 + wd, z1 + wd], [x0 - wd, z0, x0, z1], [x1, z0, x1 + wd, z1]]) {
      const [ax, az] = L(a, b), [bx, bz] = L(c, d), p = new THREE.PlaneGeometry(bx - ax, bz - az); p.rotateX(-Math.PI / 2); p.translate((ax + bx) / 2, g, (az + bz) / 2); water.push(p);
    }
  };
  const ST = [[1, C.stone]], KOSHI = [[0.45, C.stone], [1, C.grass]], DO = [[0.12, C.earth], [1, C.grass]];

  // ---- 二の丸（冬）：北は石垣、東西は腰巻石垣、南は土塁。外堀と虎口の馬出 ----
  const N2 = { x0: -80, z0: -58, x1: 50, z1: 82 };
  const IN = { x0: -33, z0: -39, x1: 33, z1: 39 };   // 内堀の外の縁（ここから内は堀と本丸）
  const H2 = 2.3, H_YAMA = 3.6, H_OMOTE = 5.0, H_TSUME = 7.2;
  const hash = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  if (!summer) {
    ring(N2.x0, N2.z0, N2.x1, N2.z1, 11);
    // 二の丸は内堀を囲む四つの帯（上面で内堀を塞がない）。内堀に面する側は石垣
    const b2 = 0.9;
    dai(N2.x0, N2.z0, N2.x1, IN.z0, 0, H2, { n: b2, s: 0, w: b2, e: b2 }, { n: ST, s: ST, w: KOSHI, e: KOSHI });
    dai(N2.x0, IN.z1, N2.x1, N2.z1, 0, H2, { n: 0, s: b2, w: b2, e: b2 }, { n: ST, s: DO, w: KOSHI, e: KOSHI });
    dai(N2.x0, IN.z0, IN.x0, IN.z1, 0, H2, { n: 0, s: 0, w: b2, e: 0 }, { w: KOSHI, all: ST });
    const y2 = dai(IN.x1, IN.z0, N2.x1, IN.z1, 0, H2, { n: 0, s: 0, w: 0, e: b2 }, { e: KOSHI, all: ST });
    const e = 0.6;
    hei([[N2.x0 + e, N2.z0 + e], [N2.x1 - e, N2.z0 + e], [N2.x1 - e, N2.z1 - e], [N2.x0 + e, N2.z1 - e], [N2.x0 + e, N2.z0 + e]], y2);
    for (const [x, z] of [[N2.x0 + 3, N2.z0 + 3], [N2.x1 - 3, N2.z0 + 3], [N2.x1 - 3, N2.z1 - 3], [N2.x0 + 3, N2.z1 - 3], [-15, N2.z0 + 3], [N2.x1 - 3, 20], [N2.x0 + 3, 10], [-15, N2.z1 - 3]]) yag(x, z, y2, 5, 4, 2);
    // 馬出（土塁の四角・塀・前に水堀）：大手口（西）・玉造口（東）・京橋口（北）・南の口
    for (const [x, z, f] of [[N2.x0 - 22, 30, 'w'], [N2.x1 + 22, 46, 'e'], [-46, N2.z0 - 22, 'n'], [-20, N2.z1 + 22, 's']]) {
      const h = 7, ym = dai(x - h, z - h, x + h, z + h, 0, 1.5, 0.7, { all: DO });
      hei([[x - h + 0.5, z - h + 0.5], [x + h - 0.5, z - h + 0.5], [x + h - 0.5, z + h - 0.5], [x - h + 0.5, z + h - 0.5], [x - h + 0.5, z - h + 0.5]], ym);
      ring(x - h, z - h, x + h, z + h, 3);
      // 二の丸の虎口の門（櫓門）
      const gx = f === 'w' ? N2.x0 + 2 : f === 'e' ? N2.x1 - 2 : x, gz = f === 'n' ? N2.z0 + 2 : f === 's' ? N2.z1 - 2 : z;
      yag(gx, gz, y2, f === 'n' || f === 's' ? 7 : 3.2, f === 'n' || f === 's' ? 3.2 : 7, 1);
    }
    // 二の丸の中：大名の屋敷（白い塀と瓦屋根）と木立が詰まる（『大坂冬の陣図屏風』）
    let k = 0;
    for (let z = N2.z0 + 9; z < N2.z1 - 6; z += 11) for (let x = N2.x0 + 9; x < N2.x1 - 6; x += 12) {
      k++;
      if (x > IN.x0 - 4 && x < IN.x1 + 4 && z > IN.z0 - 4 && z < IN.z1 + 4) continue;
      const r = hash(k), w = 6 + r * 4, d = 5 + hash(k + 50) * 3;
      if (r < 0.18) { const [tx2, tz2] = L(x, z); const c = new THREE.ConeGeometry(2.6 * s, 4.5 * s, 6); c.translate(tx2, y2 + 2.25 * s, tz2); parts.push(paint(c, 0x2f3a24)); continue; }
      const [hx, hz] = L(x, z); box(hx, y2, hz, (w + 2) * s, 0.35 * s, (d + 2) * s, 0x9a9384);   // 屋敷の塀の囲い（低い白い帯）
      goten(x, z, y2, w, d);
    }
  }   // 夏：二の丸は塀も櫓も壊され、堀は埋められて野と同じ高さ（何も置かない）

  // ---- 内堀と本丸の三段（野面積み） ----
  ring(-25, -31, 25, 31, 8);
  const yYama = dai(-21, -31, 19, -20, 0, H_YAMA, 0.8, { all: ST });            // 山里曲輪（北の低い段）
  const yOmote = dai(-25, 1, 25, 31, 0, H_OMOTE, 1.0, { all: ST });              // 表の段（南。表御殿）
  const yTsume = dai(-19, -21, 21, 3, 0, H_TSUME, 1.2, { all: ST });             // 詰ノ丸（いちばん高い。奥御殿と天守）
  dai(-31, 8, -25, 22, 0, H_OMOTE - 0.8, 0.6, { all: ST });                            // 表の段の西の出丸
  const e = 0.6;
  hei([[-20.2 + e, -30.2 + e], [18.2 - e, -30.2 + e], [18.2 - e, -20.8]], yYama); hei([[-20.2 + e, -20.8], [-20.2 + e, -30.2 + e]], yYama);
  hei([[-24 + e, 2], [-24 + e, 30 - e], [24 - e, 30 - e], [24 - e, 2]], yOmote);
  hei([[-17.8 + e, -19.8 + e], [19.8 - e, -19.8 + e], [19.8 - e, 1.8 - e], [-17.8 + e, 1.8 - e], [-17.8 + e, -19.8 + e]], yTsume);
  // 本丸の櫓（三重・二重）と、南の桜門の櫓門・北の極楽橋
  yag(-21, 27, yOmote, 4.5, 4, 3); yag(21, 27, yOmote, 4.5, 4, 3); yag(0, 29.6, yOmote, 8, 3, 1);
  yag(-15.5, -17.5, yTsume, 4, 3.6, 3); yag(-15.5, -1, yTsume, 3.6, 3.4, 2);
  yag(-17.5, -28, yYama, 3.4, 3, 2); yag(15.5, -28, yYama, 3.4, 3, 2);
  goten(-4, 14, yOmote, 22, 10); goten(-12, 24, yOmote, 10, 6); goten(14, 12, yOmote, 8, 12);   // 表御殿（千畳敷）
  goten(-3, -8, yTsume, 14, 9);                                                                  // 奥御殿
  if (!summer) {
    // 極楽橋：山里曲輪から北の二の丸へ、内堀を渡る屋根付きの橋（金の飾り。豊臣期大坂図屏風）
    const [bx, bz] = L(-6, -35), bh = Y(H2 + 0.1);
    box(bx, bh - 0.2 * s, bz, 2.4 * s, 0.25 * s, 9 * s, C.dark); roof(bx, bh + 0.6 * s, bz, 3.2 * s, 9.6 * s, 0.9 * s, C.roof); box(bx, bh + 1.38 * s, bz, 0.12 * s, 0.1 * s, 6 * s, C.gold);
  }

  // 天守：詰ノ丸の北東の隅の天守台に、望楼型の五重。黒漆の下見板、軒に金箔の瓦、最上階に金の彫り物の帯と廻縁、金の鯱
  //   （宮上茂隆の復元・『大坂夏の陣図屏風』）。遠くから城だと分かるように実の割りより大きく（o.big。既定は実の三倍ほど）
  const [tx, tz] = L(13, -14), u = s * (o.big || 1.5);
  const eave = (y, w, d) => { box(tx, y, tz, w * u, 0.16 * u, d * u, C.roof); box(tx, y - 0.07 * u, tz, (w + 0.06) * u, 0.07 * u, (d + 0.06) * u, C.gold); };
  let ty = Y(H_TSUME);
  { const [ax, az] = [tx - 3.8 * u, tz - 3.5 * u], [bx, bz] = [tx + 3.8 * u, tz + 3.5 * u];   // 天守台（詰ノ丸より一段高い野面積み）
    for (const [p, q] of [[[ax, az], [bx, az]], [[bx, az], [bx, bz]], [[bx, bz], [ax, bz]], [[ax, bz], [ax, az]]]) quad(parts, [[p[0], ty - 1, p[1]], [q[0], ty - 1, q[1]], [q[0] + (tx - q[0]) * 0.06, ty + 1.6 * u, q[1] + (tz - q[1]) * 0.06], [p[0] + (tx - p[0]) * 0.06, ty + 1.6 * u, p[1] + (tz - p[1]) * 0.06]], C.stone, tx, tz, 0.3);
    ty += 1.6 * u; }
  box(tx, ty, tz, 6.6 * u, 1.6 * u, 6.0 * u, C.black); eave(ty + 1.6 * u, 7.6, 7.0);                 // 一重
  box(tx, ty + 1.75 * u, tz, 6.0 * u, 1.5 * u, 5.4 * u, C.black);                                            // 二重
  roof(tx, ty + 3.25 * u, tz, 8.0 * u, 7.4 * u, 2.2 * u); eave(ty + 3.25 * u, 8.0, 7.4);                     // 大きな入母屋（下の二重を覆う）
  for (const sx of [-1, 1]) roof(tx, ty + 3.6 * u, tz + sx * 2.7 * u, 2.6 * u, 1.0 * u, 1.3 * u);                // 千鳥破風（前と後ろ）
  box(tx, ty + 4.3 * u, tz, 4.0 * u, 1.3 * u, 3.6 * u, C.black); eave(ty + 5.6 * u, 5.0, 4.6);               // 四重
  box(tx, ty + 5.75 * u, tz, 3.8 * u, 0.12 * u, 3.4 * u, C.dark);                                            // 廻縁
  box(tx, ty + 5.85 * u, tz, 3.0 * u, 1.3 * u, 2.6 * u, C.black);                                            // 望楼（五重）
  box(tx, ty + 6.55 * u, tz, 3.04 * u, 0.42 * u, 2.64 * u, C.gold);                                          // 金の彫り物の帯
  roof(tx, ty + 7.15 * u, tz, 4.2 * u, 3.8 * u, 1.5 * u); eave(ty + 7.15 * u, 4.2, 3.8);
  box(tx, ty + 8.45 * u, tz, 1.6 * u, 0.14 * u, 0.14 * u, C.gold);                                           // 棟
  for (const sx of [-1, 1]) box(tx + sx * 0.8 * u, ty + 8.45 * u, tz, 0.22 * u, 0.5 * u, 0.22 * u, C.gold);  // 金の鯱

  const land = [];
  // 地図の外の野（o.land：世界の座標の四角 [x0, z0, x1, z1] の並び）。地面の格子の外では城が空に浮くので、城の下に野を敷く
  for (const [x0, z0, x1, z1] of o.land || []) { const p = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 8); p.rotateX(-Math.PI / 2); p.translate((x0 + x1) / 2, g - 0.3, (z0 + z1) / 2); land.push(paint(p, 0x5f6040)); }

  const grp = new THREE.Group(); grp.name = '大坂城（遠景）';
  const m = new THREE.Mesh(mergeGeometries(parts), MAT); m.receiveShadow = true; grp.add(m);
  if (water.length) grp.add(new THREE.Mesh(mergeGeometries(water), WATER));
  farOnly(grp);
  // 野は地面の霞に合わせて濃く霞ませる（城より手前の野と境が見えないように）
  if (land.length) { const lg = new THREE.Group(); lg.add(new THREE.Mesh(mergeGeometries(land), MAT)); farOnly(lg, 0.85); grp.add(lg); }
  rt.scene.add(grp);
  if (o.sogamae) for (const line of o.sogamae) rt.scene.add(sogamae(W, line));
  return { group: grp, tenshu: { x: tx, z: tz }, center: { x: cx, z: cz } };
}

// 惣構え：世界の座標の線（pts）に沿う土塁と黒い塀・二重櫓、外側（side：進む向きの左 +1 か右 −1）の堀。
// water が偽なら空堀（南の惣構え）
export function sogamae(W, { pts, side = 1, water = true, s = 2 }) {
  const parts = [], wat = [];
  const add = (geo, hex) => parts.push(paint(geo, hex));
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
    const nx = -(bz - az) / len * side, nz = (bx - ax) / len * side;
    const n = Math.max(1, Math.round(len / 30));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2, l = len / n, y = W.heightAt(mx, mz);
      // 土塁（台形）・塀・笠
      const d = new THREE.BoxGeometry(5 * s, 1.6 * s, l + 0.1, 1, 1, 1);
      const P = d.attributes.position; for (let q = 0; q < P.count; q++) if (P.getY(q) > 0) P.setX(q, P.getX(q) * 0.45);
      d.rotateY(a); d.translate(mx, y - 0.4 + 0.8 * s, mz); add(d, 0x5d673c);
      const w = new THREE.BoxGeometry(0.16 * s, 0.42 * s, l); w.rotateY(a); w.translate(mx, y - 0.4 + 1.6 * s + 0.21 * s, mz); add(w, 0x26221f);
      const c = new THREE.BoxGeometry(0.34 * s, 0.1 * s, l + 0.2); c.rotateY(a); c.translate(mx, y - 0.4 + 1.6 * s + 0.47 * s, mz); add(c, 0x4b4b4e);
      // 堀（外側）：水か、空堀の暗い土
      const hx = mx + nx * 6 * s, hz = mz + nz * 6 * s, p = new THREE.PlaneGeometry(6 * s, l); p.rotateX(-Math.PI / 2); p.rotateY(a); p.translate(hx, W.heightAt(hx, hz) + 0.12, hz);
      if (water) wat.push(p); else add(p, 0x4a3f30);
      if (k % 2 === 1) {   // 二重櫓（三十歩ほどおき）
        const yy = y - 0.4 + 1.6 * s, bw = new THREE.BoxGeometry(4 * s, 0.95 * s, 3.4 * s); bw.rotateY(a); bw.translate(mx, yy + 0.47 * s, mz); add(bw, 0x26221f);
        const r = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); r.rotateY(Math.PI / 4); r.scale(4.8 * s, 0.8 * s, 4.2 * s); r.rotateY(a); r.translate(mx, yy + 0.95 * s + 0.4 * s, mz); add(r, 0x4b4b4e);
      }
    }
  }
  const grp = new THREE.Group(); grp.name = '惣構え';
  grp.add(new THREE.Mesh(mergeGeometries(parts), MAT));
  if (wat.length) grp.add(new THREE.Mesh(mergeGeometries(wat), WATER));
  farOnly(grp);
  return grp;
}
