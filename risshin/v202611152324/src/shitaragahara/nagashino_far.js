// ======================================================================
// 長篠城と鳶ヶ巣山の砦を、設楽原の東の遠景に置く（11/15 kaito K329「長篠城も作ってね。材料はすでにたくさんある」）
//   ・長篠城：寒狭川（豊川）と宇連川の落ち合う断崖の上。本丸と北の野牛曲輪は板塀と柵・板葺の小屋と櫓（天守は無い）。
//     城には奥平の白い幟、城の北と西の段には武田の包囲の陣（陣幕と幟。兵の絵は置かない＝K285 noFake）。
//   ・鳶ヶ巣山：城の南、宇連川の向こうの山の上の武田の砦（柵と小屋と幟）。落ちる煙と火は plus.js の tobiTick（同じ所）。
//   作りは真田丸の遠景の大坂城（b_k11_sanadamaru.js の farCastle）と同じ：陰と霞を頂点の色に一度だけ焼き、
//   霧の外でも見えるよう深さを奥へ寄せる（手前の物には必ず隠れる）。一つの形・一つの材質にまとめて一回で描く。当たりは無い。
//   実の長篠城は柵から東へ約三・五キロ。鳶ヶ巣山の煙（TOBI）に合わせて一キロ余りに寄せ、見えるように実より大きくした。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOBI } from './plus.js';

export const NAGASHINO = { x: 905, z: 470 };   // 鳶ヶ巣山（TOBI 880,620）の北、宇連川を挟んだ向かい

let MAT = null;
function farMat() {
  if (MAT) return MAT;
  MAT = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z = gl_Position.w * (0.99998 + 0.0000018 * clamp((-mvPosition.z - 150.0) / 450.0, 0.0, 1.0));');
  };
  MAT.customProgramCacheKey = () => '長篠の遠景';
  return MAT;
}

// 部品を一つの形へ。陰（光の向き）と霞を頂点の色へ焼く
function builder(W, cx, cz, sc) {
  const parts = [], L = new THREE.Vector3(-0.35, 0.8, 0.5).normalize(), haze = new THREE.Color(0xb4b8ba), c = new THREE.Color();
  const y0 = W.farH ? W.farH(cx, cz) : W.heightAt(cx, cz);
  const add = (g, hex, x, y, z, ry = 0) => {
    if (ry) g.rotateY(ry);
    g.scale(sc, sc, sc); g.translate(cx + x * sc, y0 + y * sc, cz + z * sc);
    g = g.index ? g.toNonIndexed() : g;
    g.computeVertexNormals();
    const N = g.attributes.normal, n = N.count, col = new Float32Array(n * 3);
    c.set(hex);
    for (let i = 0; i < n; i++) {
      const k = 0.5 + 0.55 * Math.max(0, N.getX(i) * L.x + N.getY(i) * L.y + N.getZ(i) * L.z);
      col[i * 3] = c.r * k * 0.8 + haze.r * 0.2; col[i * 3 + 1] = c.g * k * 0.8 + haze.g * 0.2; col[i * 3 + 2] = c.b * k * 0.8 + haze.b * 0.2;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
  const roof = (w, d, h) => { const g = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h, 4); g.rotateY(Math.PI / 4); g.scale(w / Math.max(w, d), 1, d / Math.max(w, d)); g.translate(0, h / 2, 0); return g; };
  // 板塀（濃い板・笠木）と柵の列：a→b の線に沿って
  const wall = (ax, az, bx, bz, y, hex = 0x5a3f2c, h = 2.4) => {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    add(box(0.7, h, len), hex, (ax + bx) / 2, y, (az + bz) / 2, ry);
  };
  const hut = (x, z, y, w, d, ry = 0) => {   // 板葺の小屋：濃い板壁に灰の屋根
    const g = box(w, 3, d); add(g, 0x6a4e36, x, y, z, ry);
    add(roof(w + 1.2, d + 1.2, 2.2), 0x4c4a46, x, y + 3, z, ry);
  };
  const yagura = (x, z, y) => {   // 一重の櫓：脚と箱と屋根
    add(box(4, 6, 4), 0x4e3a2a, x, y, z);
    add(box(5, 2.6, 5), 0x6a4e36, x, y + 6, z);
    add(roof(6.4, 6.4, 2.4), 0x3c3a38, x, y + 8.6, z);
  };
  const nobori = (x, z, y, hex, h = 7) => {   // 幟：竿と縦長の布
    add(box(0.25, h, 0.25), 0x2a2420, x, y, z);
    add(box(0.15, h * 0.6, 1.3), hex, x, y + h * 0.36, z + 0.7);
  };
  const done = () => { const m = new THREE.Mesh(mergeGeometries(parts), farMat()); return m; };
  return { add, box, roof, wall, hut, yagura, nobori, done, y0 };
}

// 長篠城の断崖：二つの川の落ち合う角へ突き出た台。崖の面は岩の灰茶、上は草
function castle(W) {
  const B = builder(W, NAGASHINO.x, NAGASHINO.z, 2.2), TOP = 16;
  const { add, box, wall, hut, yagura, nobori } = B;
  // 崖：上が少し細い台を二つ（本丸の台と北の野牛曲輪の台）。南と東の縁は切り立つ
  const cliff = (x, z, w, d, h) => {
    const g = new THREE.CylinderGeometry(Math.hypot(w, d) * 0.5, Math.hypot(w, d) * 0.56, h, 6); g.scale(w / Math.hypot(w, d), 1, d / Math.hypot(w, d)); g.translate(0, h / 2 - 2, 0);
    add(g, 0x6e6658, x, 0, z);
    add(box(w * 0.86, 0.6, d * 0.86), 0x56603a, x, h - 2.3, z);   // 上の草
  };
  // 足もとの野と川の段：遠景の地面は霧の外で描かれないので、城と陣の下に低い台地を敷き、裾は下へ沈めて地平に溶かす
  //   11/16 iMac K329：裾が22（約48m）では、柵の所から見ると台地の下に空と遠い森が透けて城が宙に浮いて見えた。裾を90（約200m）まで下ろし広げる
  const land = new THREE.CylinderGeometry(78, 200, 90, 12); land.translate(0, -45.2, 0); add(land, 0x4e5a36, -14, 0, -18);
  cliff(0, 0, 40, 30, TOP);        // 本丸
  cliff(-6, -30, 34, 22, TOP - 2); // 野牛曲輪（北）
  cliff(-24, -6, 18, 24, TOP - 5); // 二の丸の低い段（西）
  // 崖の下の川：南を宇連川、東を寒狭川（暗い水の帯）
  add(box(110, 0.3, 7), 0x3a4648, -14, 0, 21);
  add(box(7, 0.3, 90), 0x3a4648, 23, 0, -24);
  // 本丸の板塀と櫓、小屋
  const y = TOP - 2;
  for (const [ax, az, bx, bz] of [[-15, -11, 15, -11], [15, -11, 15, 11], [15, 11, -15, 11], [-15, 11, -15, -11]]) wall(ax, az, bx, bz, y);
  yagura(14, 10, y); yagura(-14, -10, y); yagura(14, -10, y);
  hut(-4, 0, y, 9, 6); hut(6, 2, y, 6, 5, 0.3);
  // 野牛曲輪の柵と小屋
  const y2 = TOP - 4;
  for (const [ax, az, bx, bz] of [[-20, -38, 8, -38], [8, -38, 8, -22], [-20, -22, -20, -38]]) wall(ax, az, bx, bz, y2, 0x4e3626, 1.8);
  hut(-8, -31, y2, 7, 5);
  // 奥平の白い幟（籠城の印）
  for (const [x, z] of [[-10, -11], [0, -11], [10, -11], [-15, 0], [15, 0], [-12, -38], [2, -38]]) nobori(x, z, z < -20 ? y2 : y, 0xe8e4da);
  // 武田の包囲の陣：城の北と西の段に陣幕（白地に黒）と赤と黒の幟の列。兵の絵は置かない
  const camp = (x, z, ry, n) => {
    add(box(14, 2, 0.4), 0xdedad0, x, 0, z, ry);
    add(box(14, 0.5, 0.45), 0x2a2622, x, 1.2, z, ry);
    const s = Math.sin(ry), co = Math.cos(ry);
    for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) * 3.2; nobori(x + co * t + s * 2, z - s * t + co * 2, 0, i % 2 ? 0x2a2622 : 0x9a2a22, 6); }
  };
  camp(-60, -20, Math.PI / 2, 5); camp(-62, 14, Math.PI / 2, 4); camp(-30, -64, 0, 5); camp(6, -70, 0.2, 4);
  return B.done();
}

// 鳶ヶ巣山の砦：山の上の柵の輪と小屋、武田の幟。落ちた後の煙と火は plus.js（同じ TOBI）
function tobigasu(W) {
  const B = builder(W, TOBI.x, TOBI.z, 2), { add, box, wall, hut, nobori } = B;
  // 山：杉と雑木の暗い森の、頂の平たい山（裾は下へ沈めて地平に溶かす）
  const g = new THREE.CylinderGeometry(13, 62, 34, 9); g.translate(0, 0, 0); add(g, 0x2c3824, 0, 0, 0);
  { const sk = new THREE.CylinderGeometry(62, 150, 60, 9); sk.translate(0, -47, 0); add(sk, 0x2c3824, 0, 0, 0); }   // 裾（宙に浮かせない。11/16 iMac K329）
  const y = 16.6;
  add(box(22, 0.5, 18), 0x4a5232, 0, y - 0.4, 0);   // 頂の切り開き
  for (const [ax, az, bx, bz] of [[-9, -7, 9, -7], [9, -7, 9, 7], [9, 7, -9, 7], [-9, 7, -9, -7]]) wall(ax, az, bx, bz, y, 0x4e3626, 1.8);
  hut(-2, 0, y, 6, 4); hut(5, 2, y, 4, 4, 0.4);
  for (const [x, z] of [[-9, -7], [9, -7], [-9, 7], [9, 7], [0, -7]]) nobori(x, z, y, (x + z) % 2 ? 0x9a2a22 : 0x2a2622, 6);
  return B.done();
}

export function nagashinoFar(rt) {
  const W = rt.world;
  if (!W?.scene || typeof document === 'undefined') return null;
  const list = [castle(W), tobigasu(W)];
  for (const m of list) {
    m.userData.noBatch = true; m.userData.camBlock = false;
    m.renderOrder = -0.5; m.frustumCulled = false; m.castShadow = m.receiveShadow = false;
    W.scene.add(m);
  }
  return list;
}
