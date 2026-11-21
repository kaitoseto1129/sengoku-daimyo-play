// ======================================================================
// 長篠編　鳥居強右衛門の脱出（天正三年五月十四日 夜〜十五日 夜明け）
// 長篠城の崖の下から、豊川の流れに身を沈めて下り、武田の囲みを抜ける。
// 足軽は強右衛門の供。①岸を巡る見張りの松明をかわして川を下る ②川に張られた鳴子の縄を音を立てずに切る
// ③岸へ上がって雁峰山に登り、城へ知らせる狼煙を上げる ④狼煙に気づいた見回りを退け、強右衛門を岡崎への道へ送り出す
// 向き：北が -z（長篠城）。川は北から南へ流れる。雁峰山は南西
// ======================================================================
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { distToPolyline } from './world.js';
import { jinmaku, nobori, hut, yagura, campfire, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { farHost, volley } from './b_nagashinojo.js';
import { depth as suneDepth } from './sune/depth.js';
import { camp } from './b_mid.js';

// 豊川（寒狭川と宇連川が合わさった流れ）
// ⑥写真の目 11/18 20:40 UTC クラウド sune 持ち主：曲がり目の間が三十〜四十m の真っ直ぐで、川が掘った堀に見えた→間に二〜三m の蛇行を一つずつ足す
//   （鳴子の縄の前後 z=-12 と、岸へ上がる所 z=88 は今のまま）
// ⑥写真の目 11/18 22:46 UTC クラウド sune 持ち主：鳴子の縄の手前（51秒）から下流が五十m 余り真っ直ぐに見えた→縄の下手 z=14.5 に二m の膨らみを一つ（縄の z=-12〜6 は今のまま）
const RIVER = [[-34, -176], [-28, -158], [-26, -140], [-21.5, -122], [-12, -104], [-3.5, -85], [0, -66], [1, -48], [6, -30], [5, -12], [4, 6], [6.2, 14.5], [1.5, 23], [-6, 40], [-15, 56], [-20, 72], [-25, 88], [-30, 104], [-30, 122], [-34, 140], [-34, 158], [-30, 176]];
const RW = 5, RD = 2.4;                        // 川の幅（片側）のならしと深さ
// 11/19 クラウドせ（【難】川が幅の揃った真っ直ぐな帯）：豊川の長篠は淵（片幅七m）と瀬（三・五m）が交互に来る岩の谷。
//   所ごとの片幅＝z に沿って七十m ほどで淵と瀬が入れ替わり、小さな揺れも足す。共通の川（streams の wAt）と岸の石・葦・杭がこの幅に沿う
const RW_MAX = 7;
const riverW = (z) => Math.max(3.5, Math.min(RW_MAX, 5.2 + 1.7 * Math.sin(z * 0.09 + 0.5) + 0.5 * Math.sin(z * 0.23 + 1.1)));
const CASTLE = { x: -70, z: -140 };            // 長篠城（崖の上）
const START = { x: -16, z: -112 };             // 崖の下の川べり
const NET_Z = -8;                              // 鳴子の縄
const EXIT = { x: -30, z: 80 };                // 岸へ上がる所
const KANBO = { x: -100, z: 116 };             // 雁峰山の頂
const ROAD = [[-100, 116], [-130, 124], [-176, 132]];   // 岡崎への道
const SEE = 12, HALF = 0.55;                   // 松明の目の届く所（長さと、扇の半分の角）

// 川のその高さでの x（川は北から南へ、z に沿って一本）
function riverX(z) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    if (z >= az && z <= bz) return ax + (bx - ax) * (z - az) / (bz - az);
  }
  return z < RIVER[0][1] ? RIVER[0][0] : RIVER[RIVER.length - 1][0];
}
const inRiver = (x, z) => distToPolyline(x, z, RIVER) < riverW(z) * 0.85;
const ad = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const gone = (g) => !g || g.count === 0 || g.routed;
const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function height(x, z) {
  let h = 0.7 * Math.sin(x * 0.035 + 0.3) * Math.cos(z * 0.028) + 0.4 * Math.sin(z * 0.06 + x * 0.02);
  // 長篠城の台地（北西の崖の上）
  const r = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  h += 15 * sm(40, 28, r);
  // 雁峰山（南西）・鳶ヶ巣山の尾根（南東）・東の台・西の山
  h += 26 * gauss(x, z, KANBO.x - 8, KANBO.z + 6, 2400) + 18 * gauss(x, z, 86, 96, 2600) + 12 * gauss(x, z, 110, -50, 3200) + 10 * gauss(x, z, -130, -40, 2600);
  // 川から離れるほど少しずつ高く（谷の底を川が流れる）
  h += Math.min(6, Math.max(0, distToPolyline(x, z, RIVER) - 14) * 0.05);
  return h;
}

// 夜と夜明けの色（鳶ヶ巣山砦夜襲と同じ作り）
const LOOK = {
  night: { sky: 0x2e384c, fog: 0x2a3446, sun: 0xa0b2d2, sunI: 0.7, hs: 0x8494b4, hg: 0x2c2c2e, hI: 1.3, top: 0x161d30, glow: 0.06, dir: [0.8, 0.14, -0.4], mount: 0x14181f },
  dawn: { sky: 0x86808c, fog: 0x76727e, sun: 0xffc48a, sunI: 1.15, hs: 0xa8a4b6, hg: 0x3a3028, hI: 1.0, top: 0x4a5470, glow: 0.2, dir: [1, 0.1, -0.25], mount: 0x2a2826 },
};
function applyLook(rt, key) {
  const W = rt.world;
  rt.flags.look = key;
  W.setTime('dusk');
  const L = LOOK[key];
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  W.updateEnv();
}

// 松明の明かり：足もとが一番明るく、外へ柔らかく消える丸いにじみ（加算で淡く。川面ではゆらぐ）
// 地面の起伏に沿うよう、輪を重ねた円板に放射の絵を貼る
const GL_N = 28, GL_R = 6;
let glowTex = null;
function glowMesh() {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.72)'); gr.addColorStop(0.45, 'rgba(255,255,255,.26)');
    gr.addColorStop(0.75, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const V = 1 + GL_R * GL_N;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  const uv = new Float32Array(V * 2);
  uv[0] = uv[1] = 0.5;
  for (let r = 1; r <= GL_R; r++) for (let i = 0; i < GL_N; i++) {
    const a = (i / GL_N) * Math.PI * 2, k = 1 + (r - 1) * GL_N + i;
    uv[k * 2] = 0.5 + 0.5 * (r / GL_R) * Math.cos(a); uv[k * 2 + 1] = 0.5 + 0.5 * (r / GL_R) * Math.sin(a);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let i = 0; i < GL_N; i++) idx.push(0, 1 + (i + 1) % GL_N, 1 + i);
  for (let r = 1; r < GL_R; r++) {
    const a = 1 + (r - 1) * GL_N, b = 1 + r * GL_N;
    for (let i = 0; i < GL_N; i++) { const i2 = (i + 1) % GL_N; idx.push(a + i, a + i2, b + i2, a + i, b + i2, b + i); }
  }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a50, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  m.frustumCulled = false; m.renderOrder = 2;
  return m;
}
function drawGlow(W, m, x, z, R, t) {
  const P = m.geometry.attributes.position;
  const wet = (px, pz) => inRiver(px, pz);
  const yAt = (px, pz) => (wet(px, pz) ? W.heightAt(px, pz) + W.waterDepthAt(px, pz) + 0.05 : W.heightAt(px, pz) + 0.08);   // 本当の水面（川床+RD×0.55 の決め打ちは水面より0.3〜0.4m 上に浮いた・11/18）
  P.setXYZ(0, x, yAt(x, z), z);
  for (let r = 1; r <= GL_R; r++) {
    for (let i = 0; i < GL_N; i++) {
      const a = (i / GL_N) * Math.PI * 2;
      let rr = (R * r) / GL_R;
      let px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      // 川面では照り返しが流れにゆれる
      if (wet(px, pz)) { rr *= 1 + 0.07 * Math.sin(a * 3 + t * 3.1 + r) + 0.05 * Math.sin(pz * 0.9 - t * 2.3); pz += 0.25 * Math.sin(t * 1.7 + a * 2); px = x + Math.cos(a) * rr; }
      P.setXYZ(1 + (r - 1) * GL_N + i, px, yAt(px, pz), pz);
    }
  }
  P.needsUpdate = true;
  // 炎のゆらぎで明るさもわずかに揺れる
  m.material.opacity = 0.2 + 0.03 * Math.sin(t * 9.3) + 0.02 * Math.sin(t * 23.7);   // 0.4 だと六人の見張りの照りが足し合わさり川一面が橙の板（11/18 140秒・230秒の写真）
}
// 見張りの目の届く所：見つかりそうな時だけ、地面に細い朱の線で扇の縁を示す
const FAN_N = 18;
function fanMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((FAN_N + 3) * 3), 3));
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd8583a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.frustumCulled = false; m.renderOrder = 3; m.visible = false;
  return m;
}
function drawFan(W, m, x, z, look, R, half) {
  const P = m.geometry.attributes.position;
  const yAt = (px, pz) => (inRiver(px, pz) ? W.heightAt(px, pz) + W.waterDepthAt(px, pz) + 0.08 : W.heightAt(px, pz) + 0.15);
  // 見張りの足もと → 縁の弧 → 足もと
  P.setXYZ(0, x, yAt(x, z), z);
  for (let i = 0; i <= FAN_N; i++) {
    const a = look - half + (2 * half * i) / FAN_N;
    const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
    P.setXYZ(1 + i, px, yAt(px, pz), pz);
  }
  P.setXYZ(FAN_N + 2, x, yAt(x, z), z);
  P.needsUpdate = true;
}
// 手に持った松明の火を動かす
function moveFire(f, W, x, z, h) {
  f.x = x; f.z = z;
  f.base = W.heightAt(x, z) + h;
  f.flame.position.z = z; f.inner.position.set(x, f.base - f.size * 0.08, z);
  if (f.glow) f.glow.position.set(x, W.heightAt(x, z) + 0.06, z);
  if (f.light) f.light.position.set(x, f.base + 0.4, z);
}
// 鳴子の縄：両岸の杭に張った縄に、板の鳴子が下がる
function naruko(W, z) {
  const grp = new THREE.Group();
  // 夜でも縄と鳴子の板が見えるよう、乾いた藁と白木の色に、わずかな自らの明るさを足す
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a8058, roughness: 0.9, emissive: 0x2a2014 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xcdb98a, roughness: 1, emissive: 0x3a3220 });
  const rx = riverX(z), x0 = rx - 11, x1 = rx + 11;
  for (const x of [x0, x1]) {
    const y = W.heightAt(x, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), mat); p.position.set(x, y + 1, z); grp.add(p);
  }
  const ya = W.heightAt(x0, z) + 1.8, yb = W.heightAt(x1, z) + 1.8;
  const n = 22, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t;
    const water = W.heightAt(rx, z) + RD * 0.55;
    const sag = Math.sin(t * Math.PI);
    pts.push(new THREE.Vector3(x, (ya + (yb - ya) * t) * (1 - sag) + (water + 0.5) * sag, z));
  }
  const cv = new THREE.CatmullRomCurve3(pts);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 30, 0.045, 5, false), rope));
  for (let i = 2; i < n - 1; i += 2) {
    const q = cv.getPoint(i / n);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.035), mat);
    b.position.set(q.x, q.y - 0.18, q.z); b.rotation.y = Math.random() * 0.6;
    grp.add(b);
  }
  return grp;
}

// 川底の乱杭（K355・長篠の漫画「川底には乱杭」）：囲みの川に打ち込んだ杭の列。頭が水面から少し出る。
// 流れの中ほどは古い杭が流されて抜けており、そこを忍んで下る。当たりは無い（見た目だけ・一つの InstancedMesh）
function ranguiRows(W) {
  const geo = new THREE.CylinderGeometry(0.06, 0.09, 1, 5); geo.translate(0, 0.5, 0);
  const rows = [-60, -34, 22, 50], N = rows.length * 14;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 1, emissive: 0x120e08 }), N);
  const at = new THREE.Object3D(); let n = 0;
  for (const [r, z0] of rows.entries()) {
    for (let k = 0; k < 14 && n < N; k++) {
      const rw = riverW(z0), off = -rw + 0.4 + k * ((rw * 2 - 0.8) / 13) + 0.25 * Math.sin(k * 5.1 + r);
      if (Math.abs(off - (r % 2 ? 1.2 : -1.2)) < 1.6) continue;   // 流れの中ほどの抜けた所
      const z = z0 + 0.6 * Math.sin(k * 3.7 + r * 2), x = riverX(z) + off;
      const bed = W.heightAt(x, z), top = bed + W.waterDepthAt(x, z) + 0.15 + 0.2 * Math.abs(Math.sin(k * 2.3));   // 頭は本当の水面から少し出る（決め打ちの水面は0.3〜0.4m 高く、杭が出すぎていた）
      at.position.set(x, bed - 0.2, z);
      at.rotation.set(0.18 * Math.sin(k * 1.9 + r), 0, 0.2 * Math.cos(k * 2.7 + r));
      at.scale.set(1, Math.max(0.6, top - bed + 0.2), 1);
      at.updateMatrix(); m.setMatrixAt(n++, at.matrix);
    }
  }
  m.count = n;
  return m;
}

// 岸の川石（豊川の長篠は岩の谷）：水際に半ば沈んだ丸い岩を連ね、まっすぐな水路の縁を崩す。流れの中ほどは空ける（一つの InstancedMesh・当たりは無い）
function bankRocks(W) {
  let geo = new THREE.IcosahedronGeometry(1, 2);   // 近くで面の角が尖った黒い板に見えた（11/18 21:00 写真）→一段細かく（150個で四万八千面）
  // ⑥写真の目 11/19 08:10 UTC クラウド sune 持ち主（パソコン 1600×900・190秒）：頂点が面ごとに分かれた形のままで法線が面ごと＝近くの川石が角ばった黒い多面体の塊に見えた
  //   →頂点をつないでから法線を求め、丸い川石の陰にする（面の数は同じ・頂点は減る）
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); geo = mergeVertices(geo, 1e-4);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const k = 1 + 0.18 * Math.sin(P.getX(i) * 5.1 + P.getZ(i) * 3.7) + 0.12 * Math.cos(P.getY(i) * 6.3); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.8, P.getZ(i) * k); }
  geo.computeVertexNormals();
  const N = 190;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), N);
  const at = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; n < N && i < N * 3; i++) {
    const z = -124 + ((i * 0.7548) % 1) * 214, side = i % 2 ? 1 : -1;
    if (Math.abs(z - NET_Z) < 3) continue;
    const r = 0.25 + 0.6 * Math.abs(Math.sin(i * 4.1)) ** 3;
    // ⑥写真の目 11/19 05:58 UTC クラウド sune 持ち主：川の段（80秒・874×402）で川が幅の揃った真っ直ぐな帯＝水路か石畳の道に見えた
    //   →四つに一つは縁の内側（片幅の五〜七割）の瀬の石にして、水面から頭を出させる（縁の線を所々で崩す）
    const se = i % 4 === 0;
    const x = riverX(z) + side * (riverW(z) * (se ? 0.5 + 0.2 * Math.abs(Math.sin(i * 5.7)) : 0.78 + 0.4 * Math.abs(Math.sin(i * 5.7))) + r * 0.3);
    const water = W.heightAt(riverX(z), z) + RD * 0.55;
    at.position.set(x, se ? Math.max(W.heightAt(x, z), water - r * 0.45) : Math.min(W.heightAt(x, z), water) - r * 0.15, z);
    at.rotation.set(0.3 * Math.sin(i * 1.3), i * 1.9, 0.3 * Math.cos(i * 2.2));
    at.scale.set(r * (0.9 + 0.4 * Math.abs(Math.sin(i))), r, r * (0.9 + 0.4 * Math.abs(Math.cos(i * 1.7))));
    at.updateMatrix(); m.setMatrixAt(n, at.matrix);
    // ⑥写真の目 11/18 20:50 UTC クラウド sune 持ち主：夜の岸の石が黒い平たい板に見えた（61秒・874×402）→丸みを戻し（高さ 0.62→0.8）、苔と川石の色を一段明るく・石ごとに濃淡
    col.setHex(i % 3 ? 0x4e4b44 : i % 2 ? 0x46503f : 0x5a574d).multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(i * 2.9))); m.setColorAt(n, col);
    n++;
  }
  m.count = n;
  return m;
}

// ⑥写真の目 11/19 02:05 UTC クラウド sune 持ち主：夜明けの見回りの段（230秒・874×402）、頂から西の道の両側十八m は木を置かない（斬り合う坂の枝の直し）ため、
//   霧の奥まで一色の芝の斜面で禿げ山に見えた → 道の際の九〜十七m に、半ば埋まった山の岩を散らす（低いので肩越しの目を塞がない・川石と同じ形と材質の作り・一つの InstancedMesh）
function hillRocks(W, rockGeo, rockMat) {
  const N = 78, m = new THREE.InstancedMesh(rockGeo, rockMat, N), at = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  // ⑥写真の目 11/19 06:05 UTC クラウド sune 持ち主：頂への登り（200秒・874×402）で、頂の丸い背が木も岩も無い一色の芝＝作った芝山に見えた
  //   →頂の縁（十一〜十六m）に、半ば埋まった岩を十八まで散らす（登りの杣道と西の道の六m の内は空ける）
  for (let i = 0; n < 18 && i < 60; i++) {
    const a = i * 2.39996, rr = 11 + 5 * Math.abs(Math.sin(i * 3.7)), x = KANBO.x + Math.cos(a) * rr, z = KANBO.z + Math.sin(a) * rr;
    if (distToPolyline(x, z, [[EXIT.x, EXIT.z], [KANBO.x, KANBO.z]]) < 6 || distToPolyline(x, z, ROAD) < 6) continue;
    const r = 0.35 + 0.6 * Math.abs(Math.sin(i * 4.3)) ** 2;
    at.position.set(x, W.heightAt(x, z) - r * 0.4, z);
    at.rotation.set(0.3 * Math.sin(i * 1.1), i * 2.1, 0.3 * Math.cos(i * 1.9));
    at.scale.set(r * (1 + 0.3 * Math.abs(Math.sin(i))), r * 0.9, r * (0.9 + 0.3 * Math.abs(Math.cos(i * 1.3))));
    at.updateMatrix(); m.setMatrixAt(n, at.matrix);
    col.setHex(i % 3 ? 0x7a7466 : 0x66705a).multiplyScalar(0.9 + 0.3 * Math.abs(Math.sin(i * 2.3))); m.setColorAt(n, col);
    n++;
  }
  // ⑥写真の目 11/19 06:30 UTC クラウド sune 持ち主：頂の縁の岩は登りの目（頂の手前六m）から背の向こうに隠れ、芝の一色が残った
  //   →登りの杣道の脇（頂から六〜二十八m 手前・道の芯から五・五〜九m）にも、低い岩を左右互い違いに十四置く
  { const ux = (EXIT.x - KANBO.x), uz = (EXIT.z - KANBO.z), ul = Math.hypot(ux, uz), dx = ux / ul, dz = uz / ul;
    for (let i = 0; i < 14 && n < N; i++) {
      const along = 6 + i * 1.6 + 0.8 * Math.sin(i * 2.7), side = i % 2 ? 1 : -1, off = 5.5 + 3.5 * Math.abs(Math.sin(i * 5.1));
      const x = KANBO.x + dx * along - dz * off * side, z = KANBO.z + dz * along + dx * off * side;
      const r = 0.25 + 0.45 * Math.abs(Math.sin(i * 3.9)) ** 2;
      at.position.set(x, W.heightAt(x, z) - r * 0.35, z);
      at.rotation.set(0.3 * Math.sin(i * 1.7), i * 2.3, 0.3 * Math.cos(i * 1.4));
      at.scale.set(r * (1.1 + 0.3 * Math.abs(Math.sin(i * 1.9))), r * 0.8, r * (0.9 + 0.3 * Math.abs(Math.cos(i * 2.1))));
      at.updateMatrix(); m.setMatrixAt(n, at.matrix);
      col.setHex(i % 3 ? 0x6f6a5c : 0x5f6a52).multiplyScalar(0.9 + 0.25 * Math.abs(Math.sin(i * 3.1))); m.setColorAt(n, col);
      n++;
    } }
  for (let i = 0; n < N && i < N * 3; i++) {
    const seg = i % 2, [ax, az] = ROAD[seg], [bx, bz] = ROAD[seg + 1], t = (i * 0.618) % 1;
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), side = (i >> 1) % 2 ? 1 : -1, off = 9 + 8 * Math.abs(Math.sin(i * 3.3));
    const x = ax + dx * t - dz / l * off * side, z = az + dz * t + dx / l * off * side;
    if (Math.hypot(x - KANBO.x, z - KANBO.z) < 11) continue;
    const r = 0.3 + 0.7 * Math.abs(Math.sin(i * 4.7)) ** 2;
    at.position.set(x, W.heightAt(x, z) - r * 0.35, z);
    at.rotation.set(0.3 * Math.sin(i * 1.3), i * 1.9, 0.3 * Math.cos(i * 2.2));
    at.scale.set(r * (1 + 0.3 * Math.abs(Math.sin(i))), r * 0.95, r * (0.9 + 0.3 * Math.abs(Math.cos(i * 1.7))));   // 平たいと夜に黒い板に見えた（40秒の写真）→丸く
    at.updateMatrix(); m.setMatrixAt(n, at.matrix);
    col.setHex(i % 3 ? 0x7a7466 : 0x66705a).multiplyScalar(0.9 + 0.3 * Math.abs(Math.sin(i * 2.9))); m.setColorAt(n, col);
    n++;
  }
  m.count = n;
  return m;
}

// 岸の葦：川べりの水際に株を連ねる（一つの InstancedMesh。鳴子の縄の杭と番所の前は空ける）
function bankReeds(W) {
  const parts = [];
  // 旧暦五月の葦は青く伸び盛り（穂は秋）：丸い穂をやめ、細長い葉を茎の上下に互い違いに垂らす
  // ⑥写真の目 11/18 21:55 UTC クラウド sune 持ち主：一株三本では、夜の岸に細い棒が数本立つだけに見えた（111秒・874×402）
  //   →一株を七本の茎の茂みに。葉は箱（十二面）をやめ二面の板（両面）に、茎は蓋なしにして、面の数は前より少ない
  const stem = new THREE.CylinderGeometry(0.01, 0.018, 1.9, 3, 1, true); stem.translate(0, 0.95, 0); parts.push(stem);
  for (let j = 0; j < 4; j++) { const sd = j % 2 ? 1 : -1; const lf = new THREE.PlaneGeometry(0.04, 0.85); lf.translate(0, 0.425, 0); lf.rotateZ(sd * (0.7 + j * 0.15)); lf.rotateY(j * 1.3); lf.translate(0, 0.45 + j * 0.34, 0); parts.push(lf); }
  // 一株に七本の茎を束ねる（高さを揃えず、外の茎ほど外へ傾ける）
  const clump = [];
  for (let k = 0; k < 7; k++) { const a = k * 2.4, r = k ? 0.1 + 0.05 * (k % 3) : 0, h = 0.7 + 0.3 * ((k * 0.618) % 1);
    for (const pg of parts) { const q = pg.clone(); q.scale(1, h, 1); q.rotateY(k * 1.7); q.rotateZ(0.09 * r / 0.15 * (k % 2 ? 1 : -1)); q.rotateX(0.07 * r / 0.15 * Math.sin(a)); q.translate(r * Math.cos(a), 0, r * Math.sin(a)); clump.push(q); } }
  const pos = [], idx = []; let base = 0;
  for (const q of clump) { const P = q.attributes.position.array; for (let i = 0; i < P.length; i++) pos.push(P[i]); for (const i of q.index.array) idx.push(i + base); base += P.length / 3; }
  for (const pg of parts) pg.dispose(); for (const q of clump) q.dispose();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const N = 260;
  // ⑥写真の目 11/19 05:30 UTC クラウド sune 持ち主：岸へ上がる所（175秒・874×402）で、カメラのすぐ前の株の葉が画面の下半分を塞いだ
  //   →カメラから二・二m の内は描かず、三・四m までは網目で薄くする（遠くの株と本人の横の株はそのまま）
  const rm = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  rm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n  { float cd = length(vViewPosition); if (cd < 3.4 && fract(sin(dot(floor(gl_FragCoord.xy * .5), vec2(12.9898, 78.233))) * 43758.5453) > (cd - 2.2) / 1.2) discard; }'); };
  rm.customProgramCacheKey = () => 'suneReedNear';
  const reeds = new THREE.InstancedMesh(geo, rm, N);
  const at = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; n < N && i < N * 3; i++) {
    // 葦は群れて生える：五株ずつの群れにまとめ、群れの間を空ける（等間隔の柵に見えた・写真の目 11/18）
    const c = Math.floor(i / 5), side = c % 2 ? 1 : -1;
    const z = -120 + ((c * 0.618) % 1) * 210 + 2.2 * Math.sin(i * 5.3);
    if (Math.abs(z - NET_Z) < 4) continue;   // 縄の杭と番所の前
    const x = riverX(z) + side * (riverW(z) * (0.8 + 0.25 * Math.abs(Math.sin(c * 3.7))) + 1.3 * Math.abs(Math.sin(i * 7.3)));
    at.position.set(x, W.heightAt(x, z) - 0.05, z);
    at.rotation.set(0.08 * Math.sin(i * 1.7), i * 2.4, 0.1 * Math.cos(i * 2.9));
    const s = 0.8 + 0.4 * Math.abs(Math.sin(i * 3.1));
    at.scale.set(s, s, s);
    at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
    col.setHex(i % 3 ? 0x4c5c30 : 0x5a6636); reeds.setColorAt(n, col);
    n++;
  }
  reeds.count = n;
  return reeds;
}

// 見張りの巡る道（岸の上。side：川の西 -1 ／東 +1）
const PATROLS = [
  { side: 1, z0: -92, z1: -68, off: 10 },
  { side: -1, z0: -80, z1: -50, off: 10 },
  { side: 1, z0: -54, z1: -26, off: 10 },
  { side: -1, z0: 18, z1: 50, off: 10 },
  { side: 1, z0: 40, z1: 70, off: 10 },
];
// 武田の陣（焚き火と、眠る兵）
const CAMPS = [[52, -92], [64, -38], [50, 18], [-58, -34], [-62, 16], [60, 62], [-4, -150]];

const sune = {
  resumeSteps: [[1, 'start'], [2, 'ashore'], [3, 'smoke'], [4, 'pursuit']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  noCouriers: true,   // 夜の忍び寄りに伝令の騎馬は走らない
  victoryTitle: '囲みを抜けた', victoryCaption: '狼煙は城へ届いた',   // 抜け出す戦：共通の「合戦に勝利／敵を退けた」は合わない（写真の目 11/18）
  relief: false,      // 忍びの戦：見張りが崩れても、遠くの勝頼の本陣・旗本は加勢に走らない（11/17 bot：旗本が川べりまで来て討たれた）
  massAssault: false,        // 忍びの戦：大軍の寄せ（mass_assault）で勝頼の本陣・旗本が川へ攻め下りて来た（11/17 bot）。大軍は布陣の備（depth）が見せる
  frontlineDensity: false,   // 同じく、前線の厚み足し（frontline_density）も忍びの川には要らない
  spawn: { x: START.x + 1, z: START.z - 2, heading: 0.1 },
  quietArmyCalls: true,   // K358（検品 11/17）：守る戦・忍ぶ戦で備ひとつの崩れに「味方が追撃に移った」の字が浮いた
  depth: suneDepth,   // 長篠城を囲む武田の備（docs/fujin/sune.md）
  // K285・物差し③（11/18 クラウド sune 持ち主）：川の両岸の陣の眠る兵・遠くの備を見せかけの絵でなく、本人が近づけば本物の兵で立てる（depth_real.js）。
  //   立った備は眠る陣の兵なので、見張りの騒ぎでも持ち場を動かず斬りかからない（下の update の quietCamp）
  world: {
    noFake: true,   // K285（上の書きの通り。世界の側に付ける＝陣の絵の兵を空の入れ物に）
    seed: 514,
    moveLim: 214,   // 11/17 クラウド04 見回り：勝頼の本陣（z=-196）が既定の端 176 の外で、開戦20秒に本陣と旗本が端 (40,-176) へ押し付けられて重なった（act bot 三回とも）
    time: 'dusk',
    muddy: 0.3,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.37) * Math.cos(z * 0.29) * 0.04;
      // 崖と山の急な所は岩肌
      const sl = Math.abs(height(x + 1.5, z) - height(x - 1.5, z)) + Math.abs(height(x, z + 1.5) - height(x, z - 1.5));
      // 11/18 クラウド sune：0.33 の明るい灰茶だと夜の崖が昼の禿げ山に見えた（15秒の写真）→ 暗い苔むした岩（長篠城の下の寒狭川の崖は黒い岩に木が掛かる）
      if (sl > 1.5) c.lerp(new THREE.Color(0.19 + n, 0.21 + n, 0.17 + n), Math.min(0.85, (sl - 1.5) / 2.5));
      // 川原：石まじりの砂
      const rd = distToPolyline(x, z, RIVER);
      // ⑥写真の目 11/18 22:00 UTC クラウド sune 持ち主：川原が両岸に同じ幅（十二m）で縁の切れた明るい灰茶の帯になり、夜の川が掘った水路に見えた（83秒・874×402）
      //   →幅を所ごとに四〜十二m に揺らし、草へ溶かす。水際ほど濡れた暗い石の色、外ほど乾いた灰（夜の明るさに合わせ一段暗く）
      const bw = 8 + 2.6 * Math.sin(z * 0.083 + x * 0.02) + 1.6 * Math.sin(z * 0.27 + 1.3);
      const rw = riverW(z);
      if (rd < bw + 2 && rd > rw) {
        const u = (rd - rw) / Math.max(1, bw + 2 - rw), k = 0.62 * (1 - Math.max(0, (rd - bw + 2) / 4)) ;
        c.lerp(new THREE.Color(0.25 + 0.1 * u + n, 0.25 + 0.09 * u + n, 0.22 + 0.08 * u + n), Math.max(0, Math.min(0.62, k)));
      }
    },
    clear: (x, z) => distToPolyline(x, z, RIVER) < 14,
    // 鳴子の番の松明が、行く手の夜の川面に照りの筋を落とす（板は増やさない）
    waterFireReflections: true,
    waterFireMax: 0.7,   // 11/18 クラウド sune：見張りの松明（点光源 6〜8）の照り返しで、足元の川面が白い板のように光っていた（1.4 でも 140秒・230秒で川一面が橙の板＝0.7 へ・足元の照りの円も薄く）
    // ⑥写真の目 11/21 クラウド sune 持ち主（50秒・874×402）：夜の豊川が共通の灰緑と空の照り返しで、明るい灰色の舗道のように見えた
    //   →夜の淵の暗い水の色にし、空の照り返しを弱める（松明の照りの筋 fireReflection はそのまま）
    streams: [{ pts: RIVER, w: RW_MAX, wAt: (x, z) => riverW(z), depth: RD, fireReflection: true, waterColor: [0x3c4a47, 0x111b1d], waterSheen: 0.3 }],
    // 城の台地の北の地図の外：豊川（寒狭川）の谷の切れ目から 270m 先の遠山の裾が暗い三角に覗いた（11/19 写真の目・1600×900・40秒）。
    //   長篠城の北は山が迫る（宇連川と寒狭川の合う所の奥）。谷の先の野を端から 6〜76m で二十八m まで緩く持ち上げ、木の生えた山の肩で塞ぐ
    //   11/19 03:55 UTC 同じ持ち主（⑥写真の目・追っ手の段 283秒・874×402）：強右衛門を西へ送り出す道の先が、地図の西の端から先の木の無い一色の平らな野で、夜明けの霞まで草原に見えた。
    //   強右衛門は雁峰山から山伝いに岡崎へ走った→西の端の外を十三m まで持ち上げ、道の通る所だけ峠に低く残す（遠くの野の色は高い所ほど森の色になる）
    farLift: (x, z, o) => {
      let h = 0;
      if (!(z > -150 || x < -170 || x > 60)) { const t = Math.min(1, Math.max(0, (o - 6) / 70)), sx = Math.min(1, Math.max(0, (60 - x) / 40, 0)) * Math.min(1, Math.max(0, (x + 170) / 40)); h += 28 * t * t * (3 - 2 * t) * sx; }
      if (x < -178) { const t = Math.min(1, Math.max(0, (o - 4) / 60)), dz = (z - 134) / 24; h += 13 * t * t * (3 - 2 * t) * (1 - 0.6 * Math.exp(-dz * dz)); }
      return h;
    },
    trees: 520,
    tufts: 4200,
    // 川べりの藪と、雁峰山の森
    treeDensity: (x, z) => (distToPolyline(x, z, RIVER) < 22 ? 0.35 : 1),
    // ⑥写真の目 11/18 22:00 UTC クラウド sune 持ち主：見回りを退ける段（186秒・874×402）で、頂の松の枝が肩越しの目の前に被さり画面の右半分が黒い葉の板になった
    //   →狼煙を焚く頂は木を伐った空地に（十m。十六m では頂が芝の禿げ山に見えた・151秒）。見回りと斬り合う頂から道への坂（道の両側十八m）と、騎馬の上がってくる下の道（十二m）には木を置かない。頂の脇の林は少し東へ寄せる
    treePlace: (x, z) => (Math.hypot(x - KANBO.x, z - KANBO.z) < 10 || distToPolyline(x, z, ROAD.slice(0, 2)) < 18 || distToPolyline(x, z, ROAD) < 12 ? 0 : distToPolyline(x, z, RIVER) < 22 ? 0.35 : 1),
    // ⑥写真の目 11/18 22:35 UTC クラウド sune 持ち主：山へ登る段（129秒・874×402）で、岸から頂への登りの真ん中に杉が立ち、肩越しの画面の半分が幹と枝で塞がった
    //   （寄せて足す隣の一本は treePlace を見ない）→ 岸へ上がる所から頂への杣道（両側五m）と頂の空地は、最後の足場の確かめで木を外す
    treeFooting: (_w, x, z) => !(distToPolyline(x, z, [[EXIT.x, EXIT.z], [KANBO.x, KANBO.z]]) < 5 || Math.hypot(x - KANBO.x, z - KANBO.z) < 10),
    // ⑥写真の目 11/19 01:30 UTC クラウド sune 持ち主：岸の奥の長篠城の台地の崖（城から二十八〜四十m の輪）が、木も筋も無い一色の灰青の板に見えた（1600×900・40秒・75m 先）
    //   色や岩の出っ張りは夜霧に沈んで変わらなかった（台帳 1370行）→ 寒狭川の崖に掛かって生える木の小さな林を、川に向いた崖の面（東〜南）に九つ、崖の裾に五つ置く。川の流れの中には置かない
    groves: [{ x: KANBO.x + 22, z: KANBO.z - 18, r: 14, n: 24 }, { x: -44, z: 60, r: 10, n: 14 }, { x: 30, z: 30, r: 10, n: 12 }, { x: -40, z: -20, r: 9, n: 10 },
      ...[-0.7, -0.3, 0.1, 0.45, 0.8, 1.15, 1.5, 1.85, 2.2, 0.62, 0.98, 1.33, 1.68, 2.03].map((a, i) => { const r = i > 8 ? 39 : 33 + (i % 2) * 3; return { x: CASTLE.x + Math.cos(a) * r, z: CASTLE.z + Math.sin(a) * r, r: i > 8 ? 3.5 : 4.5, n: i > 8 ? 3 : 4 + (i % 3) }; })
        .filter((g) => distToPolyline(g.x, g.z, RIVER) > RW_MAX * 1.6 + 6),
      // 11/19 クラウド sune 持ち主：西の端（送り出す道の先）の草原に、道から十五m 以上離して杉と雑木の林を九つ（道の行き止まりの両脇にも）（上の farLift と同じ直し）
      { x: -168, z: 98, r: 9, n: 9 }, { x: -170, z: 166, r: 9, n: 9 }, { x: -173, z: 109, r: 6, n: 7 }, { x: -174, z: 153, r: 6, n: 7 }, { x: -176, z: 117, r: 4, n: 5 }, { x: -177, z: 147, r: 4, n: 5 }, { x: -150, z: 158, r: 7, n: 6 }, { x: -172, z: 62, r: 8, n: 7 }, { x: -146, z: 100, r: 6, n: 5 }],
    // 退く武田兵は、川から離れた陣の奥で消す
    fleeOut: (x, z, team) => team === 1 && Math.abs(x - riverX(z)) > 48,
  },
  // 全戦共通の後詰は、本人の後ろ（武田の陣の奥）に湧かず、城の方から川伝いに下って来る供の足軽にする（11/18 クラウド sune・renraku の「陣の中に後詰が湧く」）
  reserveSpot(rt, P) {
    const z = Math.max(-150, Math.min(160, P.pos.z - 22));
    return { x: riverX(z), z, name: '供の足軽', bark: '城の供の足軽が、川を下って追いついた！' };
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 夜の川に伝令の騎馬は走らない
    // （伝令の騎馬は noCouriers で作らない。古い作りで渡された時だけ片付ける）
    for (const c of rt.couriers || []) rt.scene.remove(c.m);
    if (rt.couriers) rt.couriers.length = 0;
    F.step = 0; F.alert = 0; F.found = 0; F.ek = 0; F.ak = 0;
    // K285：陣の兵を本物で立てる時（depth_real.js）の装束の手本。この戦の組は小さく（8人未満）手本が覚えられず、陣が空のままだった
    { const T = rt._tpl || (rt._tpl = {});
      T.E = T.E || { o: { team: 1, faction: 'takeda', armor: 0x3a2622 }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }] };
      T.A = T.A || { o: { team: 0, faction: 'tokugawa' }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }] }; }

    // ---- 見張り（松明を持って岸を巡る。はじめの四つの松明だけが地面を照らす） ----
    F.pat = PATROLS.map((p, i) => this.makePatrol(rt, p, i));
    // 鳴子の番：縄の両端の番所に一人ずつ、川を見張る
    F.netGuards = [-1, 1].map((s, i) => {
      const x = riverX(NET_Z) + s * 12, z = NET_Z + 2;
      const g = enemyGroup(rt, { faction: 'takeda', name: '鳴子の番', anchor: { x, z }, facing: s > 0 ? -Math.PI / 2 : Math.PI / 2, order: 'hold', noAI: true, noEngage: true, aggro: 0, width: 2, morale: 70, fleeDir: { x: s, z: 0 } , dmgMult: 0.7 },
        [{ type: 'ashigaru', n: 2, o: { flag: null } }]);
      // 11/19 04:30 UTC クラウド sune 持ち主：鳴子の番だけ dmgMult が無く（見張り・番兵は 0.7）、川の中で一突き五十・二突きで倒れた（act bot 116秒）→ 見張りと同じ 0.7 に
      g.noAI = true; g.scriptWatch = true;   // 松明の見張りは筋書きが動かす（大将の頭の「敵が間近なら打って出る」で、気づく前に斬りかかってきた・11/17 bot）
      rt.scene.add(campfire(W, x + s * 2.5, z + 1.5));
      // ⑥写真の目 11/18 22:08 UTC クラウド sune 持ち主：番所の焚き火の炎（既定の大きさ 1.3＝幅一m二・高さ一m七）が、川から見ると右岸のぼやけた橙の四角に見えた（83秒）→ 番の足もとの小さな焚き火の大きさに
      W.addFire(x + s * 2.5, z + 1.5, { h: 0.1, size: 0.8 });
      rt.scene.add(hut(W, x + s * 5, z - 2, 4, 3, s > 0 ? -Math.PI / 2 : Math.PI / 2, { h: 2.2, roof: 0x7a6648 }));   // 11/18 20:55 UTC クラウド sune 持ち主：夜は 0x5a4a38 の屋根が上から黒い板に見えた（61秒の写真）→板葺きの古びた茶を一段明るく
      const w = { g, x, z, idx: 20 + i, fixed: true, ph: i * 0.4, look: 0, sus: 0, R: 11, fan: fanMesh(), glow: glowMesh(), base: Math.atan2(riverX(NET_Z) - x, NET_Z - z) };
      w.fire = W.addFire(x, z, { torch: true, h: 1.9, waterReflection: true, lightStrength: 2.6 });
      rt.scene.add(w.fan, w.glow);
      return w;
    });
    F.net = naruko(W, NET_Z);
    { const br = bankRocks(W); rt.scene.add(F.net, bankReeds(W), br, ranguiRows(W), hillRocks(W, br.geometry, br.material)); }
    applyLook(rt, 'night');

    // ---- 長篠城（北西の崖の上）：塀の上の松明と、奥平の旗 ----
    rt.scene.add(hut(W, CASTLE.x - 6, CASTLE.z - 4, 10, 6, 0.2, { h: 3, wall: 0x6e5a44 }));
    rt.scene.add(yagura(W, CASTLE.x + 16, CASTLE.z + 14), yagura(W, CASTLE.x - 18, CASTLE.z + 12));
    for (const [dx, dz] of [[10, 18], [-4, 22], [-16, 16], [20, 4]]) rt.scene.add(nobori(W, CASTLE.x + dx, CASTLE.z + dz, 'okudaira', 5.5));
    for (const [dx, dz] of [[14, 20], [-8, 23]]) W.addFire(CASTLE.x + dx, CASTLE.z + dz, { h: 1.6 });
    W.addDistantArmy({ x: CASTLE.x, z: CASTLE.z + 16, w: 26, d: 4, count: 40, facing: 0.2, armor: 0x24221f, flagTex: flagTexture('okudaira'), seed: 511 });

    // ---- 武田の囲み：川の両岸の陣に焚き火と眠る兵、旗。遠くの山にも陣の火 ----
    const DA = (x, z, w, d, count, facing, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, team: 1, armor: 0x3a2622, flagTex: flagTexture(flag), seed });
    CAMPS.forEach(([x, z], i) => {
      rt.scene.add(campfire(W, x, z));
      W.addFire(x, z, { h: 0.1 });
      const s = x > riverX(z) ? 1 : -1;
      DA(x + s * 12, z, 22, 12, 110, s > 0 ? -Math.PI / 2 : Math.PI / 2, i % 2 ? 'furin' : 'takeda', 521 + i);
      rt.scene.add(nobori(W, x + s * 4, z - 5, i % 2 ? 'furin' : 'takeda', 6), nobori(W, x + s * 4, z + 5, 'takeda', 6));
      // 物差し③（写真の目 11/18）：陣ごとに幟が二本で、囲みの陣が細く見えた。眠る兵の奥（川から離れる側）に幟の林を立て、一万五千の囲みの厚みを見せる（形と布は使い回し・兵の数は変えない）
      for (let k = 0; k < 5; k++) rt.scene.add(nobori(W, x + s * (20 + (k % 2) * 4), z + (k - 2) * 5, (i + k) % 3 ? 'takeda' : 'furin', 5 + (k % 2)));
    });
    rt.scene.add(jinmaku(W, 72, -40, 16, 10, 5), jinmaku(W, -74, 16, 14, 10, 5));
    rt.scene.add(tawara(W, 58, -26, 0.4, 5));
    // 医王寺山の勝頼の本陣（北東）と、鳶ヶ巣山の砦（南東の尾根）
    // 勝頼の本陣：見に行けば勝頼と旗本がいる（後ろの控えは軽い兵）
    // 11/18 クラウド k365-cloud-07：本陣を戦場の端（176）の内へ。-196 では勝頼の旗本が戦場の外に立ち、開戦で -176 へ一息に飛んだ（bot）
    F.kCamp = camp(rt, { x: 40, z: -166, facing: -Math.PI / 4, team: 1, faction: 'takeda', mon: 'takeda', armor: 0x3a2622, general: { name: '武田勝頼' }, guard: 15, reserve: 300, runTo: { x: 30, z: -158 } });
    for (const g of [F.kCamp.general?.group, F.kCamp.guard]) if (g) { g.aggro = 0; g.seekRange = 0; g.order = 'hold'; g.noAI = true; g.fixed = true; }   // 本陣は遠い医王寺山の背景。強右衛門の忍びには出てこない（史実でも本陣は動かない）
    DA(88, 100, 36, 12, 200, -Math.PI * 0.7, 'furin', 532);
    DA(120, -80, 30, 16, 200, -Math.PI / 2, 'takeda', 533);
    for (const [x, z] of [[54, -150], [84, 92], [118, -74]]) W.addFire(x, z, { h: 0.1 });

    // ---- 強右衛門（供の足軽のあとについてくる） ----
    const sg = allyGroup(rt, { faction: 'tokugawa', name: '鳥居強右衛門', anchor: { x: START.x - 1, z: START.z - 4 }, facing: 0, noRout: true, aggro: 3, width: 1 },
      // horse: false＝強右衛門は川を泳いで抜けた足軽（武将の表に顔があるので、名のある武将の決まりで馬に乗せられ、夜の川を騎馬で下っていた・11/18 写真）
      [{ type: 'ashigaru', n: 1, o: { name: '鳥居強右衛門', flag: null, hat: 'none', horse: false } }]);
    F.suneG = sg; F.sune = sg.units[0];
    sg.noAI = true;   // 強右衛門は供のあとにつく筋書きで動く（味方の持ち場を起こす頭で、開戦すぐ見張りへ斬りかかり見つかった・11/17 bot）
    F.sune.hp = F.sune.maxHp = 320;

    rt.setPhase('brief');
    rt.obj('main', '強右衛門を守り、川を下って武田の囲みを抜けよ', 'main');
    rt.obj('stealth', '見張りに見つからずに抜けよ', 'side');
    rt.marker('sune', unitPos(F.sune), '鳥居強右衛門', { h: 2.6 });
    rt.after(14, () => rt.unmark('sune'));
    rt.say('鳥居強右衛門', `${nm(rt)}殿、ここから忍ぶぞ。流れに身を沈めて下れ`, 4.5);
    rt.say('鳥居強右衛門', '岸に武田の見張りぞ。松明の明かりへ入るな', 4.5);
    if (rt.G.rank > 0) rt.say('鳥居強右衛門', '組の者は城に残してきた。忍ぶには二人が限りじゃ', 3.5);
    rt.say('', '明かりを避け、構えたまま歩け。走れば音で知れる。川の中を忍べ', 7);
    rt.after(18, () => this.start(rt));
  },

  makePatrol(rt, p, i, at) {
    const W = rt.world;
    const z = at ? at.z : p.z0 + (p.z1 - p.z0) * ((i * 0.37) % 1);
    const x = at ? at.x : riverX(z) + p.side * p.off;
    const g = enemyGroup(rt, { faction: 'takeda', name: '武田の見張り', anchor: { x, z }, facing: 0, order: 'hold', noAI: true, noEngage: true, aggro: 0, width: 2, spacing: 1.3, morale: 75, fleeDir: { x: p.side, z: 0 }, dmgMult: 0.7 },
      [{ type: 'ashigaru', n: 2, o: { flag: null } }]);
    g.noAI = true; g.scriptWatch = true;   // 見張りは筋書きが動かす（大将の頭の「敵が間近なら打って出る」で、気づく前に斬りかかってきた・11/17 bot）
    const w = { g, p, x, z, idx: i, dir: i % 2 ? 1 : -1, pause: 0, look: 0, sus: 0, R: SEE, fan: fanMesh(), glow: glowMesh(), ph: i * 1.7 };
    w.fire = W.addFire(x, z, { torch: true, h: 1.9, lightStrength: 2.6 });   // 松明の点光源 6 だと川面が半径10mの橙の板（11/18 写真 160秒）
    rt.scene.add(w.fan, w.glow);
    return w;
  },

  start(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1;
    rt.setPhase('river');
    F.riverT = rt.t;
    rt.say('鳥居強右衛門', '参ろう。……わしから離れすぎぬよう頼む', 3);
    rt.marker('net', { x: riverX(NET_Z), z: NET_Z }, '鳴子の縄', { h: 1.6 });
  },

  // 見つかった：見張りが声を上げ、近くの陣から番兵が出てくる
  spotted(rt, w, why) {
    const F = rt.flags;
    if (w && w.alerted) return;
    if (w) { w.alerted = true; w.on = false; w.sus = 0; w.fan.visible = false; w.g.aggro = 12; w.g.noAI = false; w.g.noEngage = false; w.g.order = 'attack'; w.g.seekRange = 30; w.g.scriptWatch = false; }
    F.found++; F.spotT = rt.t;
    F.alert = Math.min(3, F.alert + 1);
    if (F.found === 1) rt.objFail('stealth');
    // 11/19 06:50 UTC クラウド sune 持ち主：山の段（198秒）で見つかっても『川に誰かおるぞ』、静まると『また流れに身を沈めて』と言った（描かずの通しの台詞）→ 山では山の言葉に
    // 同じ持ち主：見張りが続けて気づくと、同じ叫びが一秒おきに三度・『見つかった』の札が二枚続いた（101〜103秒）→ 札と声は八秒に一度まで
    const sayOk = rt.t - (F.spotSayT ?? -99) >= 8; if (sayOk) F.spotSayT = rt.t;
    if (sayOk) rt.banner('見つかった', why);
    if (sayOk) rt.say('武田の見張り', F.step >= 2 ? '曲者じゃ！　山に誰かおるぞ！' : '曲者じゃ！　川に誰かおるぞ！', 2.5);
    const p = rt.player.u.pos;
    rt.army.play('eshout', p, 1.6);
    rt.after(0.8, () => sfx('taiko', 0.6));
    // 近くの陣から番兵が駆けつける
    let best = null, bd = Infinity;
    for (const [x, z] of CAMPS) { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = { x, z }; } }
    if (best && bd < 90 && (F.guards || []).filter((g) => !gone(g)).length < 2) {
      const s = best.x > riverX(best.z) ? 1 : -1;
      // 退く時は川に沿って本人から離れる向きへ（真横の陣へ退くと陣幕の壁 x64 に六人重なって止まった・11/18 06:05 act bot 131秒）
      // 焚き火の川寄り8mから出る（(64,-38) の陣は焚き火の東が陣幕の壁 x64 で、番兵6人が壁を挟んで重なり止まった）
      const g = enemyGroup(rt, { faction: 'takeda', name: '番兵', anchor: { x: best.x - s * 8, z: best.z }, facing: -s * Math.PI / 2, order: 'attack', seekRange: 70, aggro: 12, width: 4, morale: 70, fleeDir: { x: s * 0.35, z: Math.sign(best.z - p.z) || -1 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 + F.alert }]);
      F.guards = [...(F.guards || []), g];
      rt.marker('guard' + F.guards.length, centerOf(g), () => `番兵・${moraleWord(g.morale)}`, { red: true, group: g });
    }
    if (sayOk) rt.after(2.5, () => rt.say('鳥居強右衛門', F.found > 1 ? 'またか……！　斬り抜けて、闇に紛れるほかない' : 'しまった！　斬り抜けるぞ。騒ぎが大きくなる前に片を付けよ', 3.5));
    // しばらくして騒ぎが静まれば、見張りの目は厳しくなる
    rt.obj('flee', '追っ手を退けよ', 'order');
  },

  // 見張りを一つ動かし、目の届く所に誰かいれば怪しむ
  watch(rt, w, dt) {
    const F = rt.flags;
    const W = rt.world;
    const g = w.g;
    if (gone(g)) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } return; }
    // 斬られた見張りは声を上げる
    if (!w.alerted && g.units.some((u) => !u.alive || u.hp < u.maxHp)) this.spotted(rt, w, '見張りに斬りかかった');
    const u0 = g.units.find((u) => u.alive);
    if (w.alerted) {
      w.fan.visible = false;
      if (w.fire && u0) moveFire(w.fire, W, u0.pos.x + Math.sin(u0.heading + 0.6) * 0.4, u0.pos.z + Math.cos(u0.heading + 0.6) * 0.4, 1.9);
      if (w.fire) drawGlow(W, w.glow, w.fire.x, w.fire.z, 5.5, rt.t + w.ph); else w.glow.visible = false;
      return;
    }
    const t = rt.t + w.ph;
    if (w.fixed) {
      // 鳴子の番：その場で、川と岸をゆっくり見渡す
      w.look = w.base + Math.sin(t * 0.62) * 0.95;
    } else {
      const p = w.p;
      const spd = 1.3 * (1 + F.alert * 0.15);
      if (w.pause > 0) {
        w.pause -= dt;
        // 角で立ち止まり、松明を振って川を照らす
        const toRiver = -p.side * Math.PI / 2;
        w.look = toRiver + Math.sin(t * 0.9) * 0.9;
      } else {
        w.z += w.dir * spd * dt;
        if (w.z > p.z1) { w.z = p.z1; w.dir = -1; w.pause = 4; }
        if (w.z < p.z0) { w.z = p.z0; w.dir = 1; w.pause = 4; }
        w.x = riverX(w.z) + p.side * p.off;
        // 歩きながら、ときどき川の方をうかがう
        const along = w.dir > 0 ? 0 : Math.PI;
        w.look = along + ad(along, -p.side * Math.PI / 2) * (0.35 + 0.3 * Math.sin(t * 0.7));
      }
      g.anchor.x = w.x; g.anchor.z = w.z;
    }
    g.facing = w.look;
    for (const u of g.units) if (u.alive && !u.target) u.heading += ad(u.heading, w.look) * Math.min(1, dt * 3);
    if (w.fire && u0) moveFire(w.fire, W, u0.pos.x + Math.sin(u0.heading + 0.6) * 0.4, u0.pos.z + Math.cos(u0.heading + 0.6) * 0.4, 1.9);
    const R = w.R * (1 + F.alert * 0.12) * (F.look === 'dawn' ? 1.3 : 1);
    const ex = w.x, ez = w.z;
    w.on = true;
    // 明かりは松明の足もと（少し前へ寄る）に。目の届く扇より小さい
    if (w.fire) drawGlow(W, w.glow, w.fire.x + Math.sin(w.look) * 1.2, w.fire.z + Math.cos(w.look) * 1.2, 5.5, t);
    // 目と耳：自分と強右衛門
    const P = rt.player;
    const sp = Math.hypot(P.u.vel.x, P.u.vel.z);
    const sneak = P.guard || sp < 2.6;
    const run = sp > 4.6;
    let gain = 0;
    for (const t2 of [P.u, F.sune]) {
      if (!t2 || !t2.alive) continue;
      const dx = t2.pos.x - ex, dz = t2.pos.z - ez, d = Math.hypot(dx, dz);
      const wet = inRiver(t2.pos.x, t2.pos.z);
      let v = 0;
      if (d < R && Math.abs(ad(w.look, Math.atan2(dx, dz))) < HALF) v = 1.15 - (d / R) * 0.7;
      if (d < 2.4) v = Math.max(v, 1.4);
      // 足音：走れば遠くまで聞こえる（川の中なら水音）
      if (run && d < (wet ? 15 : 13)) v = Math.max(v, 0.35 + 0.4 * (1 - d / 15));
      else if (!sneak && d < 4.5) v = Math.max(v, 0.3);
      let mul = sneak ? 0.45 : run ? 1.5 : 1;
      if (wet && !run) mul *= 0.5;
      gain = Math.max(gain, v * mul);
    }
    if (F.step < 1) gain = 0;   // K358：強右衛門の話の間（川へ入る前）は見つからない。始まってすぐ見つかり番兵と本陣が下りて来ていた
    if (gain > 0) w.sus = Math.min(1, w.sus + gain * dt * 0.95);
    else w.sus = Math.max(0, w.sus - dt * 0.22);
    // 怪しんだら、灯りを向けて立ち止まる
    if (w.sus > 0.35 && !w.fixed) w.pause = Math.max(w.pause, 1.2);
    const id = 'sus' + w.idx;
    if (w.sus > 0.3 && !w.susMark) { w.susMark = true; rt.marker(id, () => ({ x: w.x, z: w.z }), '見張り', { red: true, h: 2.4 }); if (!(F.susT > rt.t)) { F.susT = rt.t + 10; rt.bark('見張りがこちらをうかがっている……動くな、灯りの外へ', true); } }
    if (w.sus < 0.15 && w.susMark) { w.susMark = false; rt.unmark(id); }
    // 頭上の赤い印は名だけ（「怪しんでいる」「見つかりそう！」の字は出さない・kaito 10/23 字は名だけ）。怪しみの強さは扇の縁の濃さで見せる。毎コマ印を作り直さない
    F.maxSus = Math.max(F.maxSus || 0, w.sus);
    // 怪しんでいる間だけ、目の届く扇の縁を薄く見せる
    w.fan.visible = w.sus > 0.12;
    if (w.fan.visible) { w.fan.material.opacity = Math.min(0.75, 0.15 + w.sus * 0.6); drawFan(W, w.fan, ex, ez, w.look, R, HALF); }
    if (w.sus >= 1) { rt.unmark(id); w.susMark = false; this.spotted(rt, w, w.hill ? '中腹の見回りの松明に照らされた' : w.fixed ? '鳴子の番に見つかった' : '見張りの松明に照らされた'); }   // 中腹の見回りも fixed を立てるので、山で『鳴子の番』と出た（131秒・11/19 07:10 UTC クラウド sune 持ち主）
  },

  // 鳴子の縄を切る
  cutNet(rt) {
    const F = rt.flags;
    if (F.netCut) return;
    F.netCut = true;
    rt.uninteract('net');
    rt.unmark('net');
    rt.scene.remove(F.net);
    sfx('ui');
    rt.bark('鳴子の縄を切った。鳴子は音もなく流れに沈んだ');
    rt.say('鳥居強右衛門', '見事じゃ。……さあ、この先は囲みの外れ。岸へ上がる所まで、あと少し', 4);
    rt.marker('exit', EXIT, '岸へ上がる所', { h: 1.5 });
    rt.zone('exit', EXIT.x, EXIT.z, 6);
    rt.obj('main', '川を下り、武田の囲みの外れの岸へ上がる', 'main');
  },

  // 鳴子が鳴った
  netRang(rt) {
    const F = rt.flags;
    if (F.netCut) return;
    F.netCut = true; F.netRang = true;
    rt.uninteract('net');
    rt.unmark('net');
    rt.army.play('knock', { x: riverX(NET_Z), z: NET_Z }, 1.4);
    rt.bark('からからから……！　鳴子が鳴った', true);
    for (const w of F.netGuards) this.spotted(rt, w, '鳴子の縄に掛かった');
    rt.marker('exit', EXIT, '岸へ上がる所', { h: 1.5 });
    rt.zone('exit', EXIT.x, EXIT.z, 6);
    rt.obj('main', '川を下り、武田の囲みの外れの岸へ上がる', 'main');
  },

  // 岸へ上がり、雁峰山へ
  ashore(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2;
    rt.setPhase('hill');
    rt.unmark('exit'); rt.unzone('exit');
    rt.award((t) => t.side.push('武田の囲みを抜けた'), '武田の囲みを抜けた');
    rt.banner('囲みを抜けた', '豊川の流れを下り、武田の陣の外れへ');
    rt.say('鳥居強右衛門', 'ここまで来れば……。あの山が雁峰山じゃ。頂で狼煙を上げれば、城からも見える', 4.5);
    rt.say('鳥居強右衛門', '殿（奥平信昌）とは、抜けたら狼煙で知らせると約してある', 3.5);
    rt.obj('main', '南の雁峰山の頂に登り、城へ知らせる狼煙を上げる', 'main');
    rt.marker('kanbo', KANBO, '雁峰山の頂（狼煙）', { h: 2 });
    // 山の中腹の見回り
    const w = this.makePatrol(rt, { side: -1, z0: 0, z1: 0, off: 0 }, 9, { x: -52, z: 98 });
    w.hill = true; w.pts = [[-52, 98], [-74, 88]]; w.k = 1; w.fixed = true; w.base = 0;
    F.pat.push(w);
    rt.addInteract('smoke', KANBO, '狼煙を上げる', () => this.smoke(rt), { r: 3.2, hold: 2.5 });
    // 山を登るだけの間を空けない：中腹の見回りと、夜明けの近さを告げる
    rt.after(12, () => { if (F.step === 2) rt.say('鳥居強右衛門', '中腹に見回りの松明じゃ。木の陰を回って登れ', 3.5); });
    rt.after(30, () => { if (F.step === 2) { rt.bark('東の空が白みはじめた。頂はもうすぐ'); rt.army.play('eshout', { x: CASTLE.x, z: CASTLE.z }, 0.6); } });
  },

  // 狼煙を上げる
  smoke(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3;
    rt.setPhase('smoke');
    rt.uninteract('smoke'); rt.unmark('kanbo');
    rt.objProgress('main', '狼煙が上がった');
    const W = rt.world;
    const y = W.heightAt(KANBO.x, KANBO.z);
    // 狼煙の焚き場：積んだ薪の上に火。火より煙が主（火が大きすぎると、近くで光の塊に見える）
    // ⑥写真の目 11/18 22:52 UTC クラウド sune 持ち主：焚き場が頂の印の一m 東で、狼煙を上げた本人が火の上に立ち、足もとに炎が重なった（141秒・874×402）
    //   →焚き場は本人の立つ所から三m 北（城の向き）に置く。頂の空地（十m）の中に収める
    const pp = rt.player.u.pos;
    let fx = pp.x, fz = pp.z - 3;
    { const dx = fx - KANBO.x, dz = fz - KANBO.z, d = Math.hypot(dx, dz); if (d > 6) { fx = KANBO.x + dx / d * 6; fz = KANBO.z + dz / d * 6; } }
    rt.scene.add(campfire(W, fx, fz));
    const f = W.addFire(fx, fz, { h: 0.2 }); f.size = 1.5;
    // 11/19 07:50 UTC クラウド sune 持ち主（物差し⑥ 写真の目・262秒・874×402）：太さ 3.2・2.6 の二本だけでは、頂の十m の内から見ると粒が画面より大きく写り
    //   world_smoke の「画面より大きい粒は消す」で狼煙の柱がほぼ見えなかった→近くで写る細い柱（1.3〜1.6）を四本重ね、遠くから見せる太い一本（2.6）を残す（煙の入れ物は同じ・48本の内）
    F.smokeCols = [W.addSmokeColumn(fx, y + 1.2, fz, { size: 1.6 }), W.addSmokeColumn(fx + 0.5, y + 1.4, fz - 0.3, { size: 1.4 }), W.addSmokeColumn(fx - 0.4, y + 1.3, fz + 0.4, { size: 1.3 }),
      W.addSmokeColumn(fx + 0.2, y + 6, fz + 0.2, { size: 1.5 }), W.addSmokeColumn(fx + 0.4, y + 2, fz + 0.4, { size: 2.6 })];
    for (const w of F.pat) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } }
    for (const w of F.netGuards) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } }
    applyLook(rt, 'dawn');
    rt.award((t) => { t.special = { label: '狼煙を上げた', pts: 20 }; }, '狼煙を上げた');
    rt.banner('狼煙が上がった', '夜が白む。長篠城から、かすかに鬨の声');
    rt.after(1.5, () => { rt.player.cine = { x: CASTLE.x, z: CASTLE.z, t: 3.5 }; rt.army.play('eshout', { x: CASTLE.x * 0.4 + KANBO.x * 0.6, z: CASTLE.z * 0.4 + KANBO.z * 0.6 }, 1.2); });
    rt.say('鳥居強右衛門', '聞こえるか……城の者が、狼煙に応えておる！', 3.5);
    rt.say('鳥居強右衛門', 'あとは岡崎へ走るだけじゃ。家康公と信長公に後詰を願い、必ず戻る', 4);
    rt.after(9, () => this.pursuit(rt));
  },

  // 狼煙に気づいた武田の見回りが、岡崎への道から山へ上がってくる
  pursuit(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.pT = rt.t;
    rt.setPhase('pursuit');
    // 11/19 02:58 UTC クラウド sune 持ち主：頂へ駆け上がった息のまま騎馬六と当たり、気力三割で受けに回って退き続ける回が3回に1回（討ち取り0〜1）。
    //   狼煙を焚く九秒の間に息を整えた形にして、気力を満たしてから見回りを迎える（傷は戻さない＝重さは残す）
    { const P = rt.player; if (P && P.maxSta) P.sta = Math.max(P.sta, P.maxSta); }
    // 11/19 08:00 UTC クラウド sune 持ち主：川の段の傷（足軽70）を負ったまま見回りを迎えると命が六割を切っていて、act bot が退き続け討ち取り0・突き4（bot_act_noroshi_0749）。
    //   狼煙を焚く九秒の間に傷を縛った形にして、命を七割までは戻す（七割より上は戻さない＝見回りとの斬り合いの重さは残す）
    { const u = rt.player && rt.player.u; if (u && u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.7); }
    sfx('taiko', 0.8);
    rt.army.play('hooves', { x: -150, z: 128 }, 1.4);
    rt.banner('武田の見回り', '狼煙に気づき、岡崎への道を駆け上がってくる');
    rt.say('足軽', `${nm(rt)}殿、下の道に騎馬が！　狼煙を見られた！`, 3);
    rt.say('鳥居強右衛門', '道をふさがれては岡崎へ行けぬ。……頼む、あの者どもを退けてくれ', 4);
    const g = enemyGroup(rt, { faction: 'takeda', name: '武田の見回り', anchor: { x: -160, z: 128 }, facing: Math.PI / 2, order: 'attack', seekRange: 120, aggro: 14, width: 6, morale: 80, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.6, speed: 3 },
      [{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 4 }]);
    // 11/18 15:58 UTC クラウド sune 持ち主：騎馬の傷を dmgMult 0.6 にさらに 0.6 を掛けて 0.36 にしていた＝act bot の受けた傷が毎回0で「重く斬り合いたい」。二重の弱めを外す（騎馬も徒も 0.6・徒の二の手は 0.75）
    F.purs = g;
    // 11/19 04:40 UTC クラウド sune 持ち主：頂から下りた所で見回りの騎馬に二十秒で命を半分削られ（騎馬84）、あとは退き続けて追っ手の段の討ち取り0（act bot 351秒）。
    //   本人に当たる時だけ 0.6→0.4（army_combat の dmgMultPlayer・味方の供と物見への強さは同じ）。受ける傷は0にしない
    g.dmgMultPlayer = 0.4;
    // 下の道には、見回りの後ろに武田の騎馬の塊が控える（軽い作り。kaito 0929）
    farHost(rt, -166, 146, 26, 14, 120, Math.PI / 2, 0x3a2622, 'takeda', 521, 'cavalry');
    farHost(rt, -150, 164, 20, 12, 80, Math.PI / 2 - 0.3, 0x8e1f16, 'akazonae', 522, 'cavalry');
    // 勝ち筋：狼煙を見た徳川の物見の鉄砲が、頂の岩の陰に着いている。坂を上る騎馬を引きつけて撃つ
    // 11/18 20:05 クラウド sune 持ち主：物見の鉄砲（0.7）と供で味方の討ち取り8・本人0の回が残った（act bot）→ 0.5 に。一斉射は崩しの手（士気）で残す
    F.mimi = allyGroup(rt, { faction: 'tokugawa', name: '徳川の物見の鉄砲', anchor: { x: KANBO.x - 5, z: KANBO.z + 7 }, facing: -Math.PI / 2, width: 5, spacing: 1.6, aggro: 26, noRout: true, holdFire: true, order: 'hold', dmgMult: 0.3 },
      [{ type: 'gun', n: 4 }]);
    rt.after(3.5, () => rt.say('徳川の物見', '岡崎から参った。騎馬を坂へ引きつけて撃つ。崩れた所を突かれよ', 4.5));
    rt.obj('main', '武田の見回りを退け、強右衛門を西へ送り出せ', 'main');
    rt.marker('purs', centerOf(g), () => `武田の見回り・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.after(70, () => { if (!gone(g)) { g.morale = 0; g.noRout = false; } });
    // 11/18 14:50 UTC クラウド sune 持ち主：追っ手が騎馬九人だけで、斬り合いが27秒で済み「斬り合う相手が少なくて退屈」（act bot）。
    //   騎馬の後から、下の道の陣の徒の兵（槍六・侍一）が遅れて坂を上がってくる＝騎馬を退けた所へ二の手。退ければ送り出す
    rt.after(14, () => {
      if (F.step !== 4 || F.ending) return;
      F.purs2 = enemyGroup(rt, { faction: 'takeda', name: '武田の徒の追っ手', anchor: { x: -168, z: 136 }, facing: Math.PI / 2, order: 'attack', seekRange: 120, aggro: 14, width: 5, morale: 70, noRout: true, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.75, speed: 2.6 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
      rt.say('足軽', '騎馬の後ろから、徒の兵も上がってくるぞ！', 3);
      // 11/21 クラウド sune 持ち主：三の手と同じく、徒の追っ手も下の四十五秒の区切りまでは崩れず斬り合う（本人の討ち取り0〜2の回の直し）
      // 11/19 クラウド sune 持ち主：徒の追っ手が坂の下に残り、追っ手の段で百五十秒何も起きない回があった（act bot）→ 四十五秒で崩れて退く
      rt.after(45, () => { const g2 = F.purs2; if (g2 && !gone(g2)) { g2.morale = 0; g2.noRout = false; } });
    });
  },

  depart(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5;
    rt.setPhase('end');
    rt.unmark('purs');
    F.noArmyBar = true;   // 11/18 cloud-04 の見回り：送り出した後の11秒、874×402 で小さな地図と数の棒が重なった（三回とも）。斬り合いは済んだので数の棒を下げる
    const g = F.suneG;
    g.order = 'path'; g.path = ROAD.slice(1).map((q) => [...q]); g.pathIdx = 0; g.speed = 4.5;
    F.sune.speed = F.sune.run = 5.5;
    F.sune.invuln = true;   // 送り出した後は岡崎への道を駆けるだけ。残った敵に背を斬られて「討たれた」で任務が失敗に戻った（act bot 428秒）
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '強右衛門を送り出した');
    if (!F.found) rt.award((t) => t.side.push('見つからずに抜けた'), '副任務：見つからずに抜けた');
    if (!F.found) rt.objDone('stealth');
    rt.say('鳥居強右衛門', `${nm(rt)}殿、かたじけない。城の皆に伝えてくだされ。……後詰は、必ず来ると`, 4.5);
    rt.banner('強右衛門、岡崎へ', '朝の道を、ひとり駆けていった');
    // ⑥写真の目 11/18 20:40 UTC クラウド sune 持ち主：送り出した後の画面が足もとの草ばかりで、駆けていく強右衛門の背が見えなかった→道の先へ目を向ける
    rt.after(1.2, () => { if (!F.ending && rt.player.u.alive) rt.player.cine = { x: ROAD[1][0], z: ROAD[1][1], t: 3.2 }; });
    rt.after(5, () => rt.say('', `――${nm(rt)}は夜を待ち、崖の細道から城へ戻った。奥平信昌に強右衛門の脱出を告げた`, 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  fail(rt, why) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.banner('強右衛門が討たれた', why);
    rt.say('', '――使いは岡崎へ届かなかった。城は、別の者を出すことになる', 4.5);
    rt.finish({}, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    const P = rt.player, p = P.u.pos;
    const S = F.sune, SG = F.suneG;
    if (F.ending) return;
    if (!S.alive) { this.fail(rt, '囲みの中で、武田の兵に討たれた'); return; }
    // 11/19 06:50 UTC クラウド sune 持ち主：見回りを退ける段で、強右衛門は焚き場の東で物見の後ろに控えるだけなのに、本人が坂で倒れかけ（命4）る間に寄った騎馬に討たれて負けた（描かずの通し 322秒）
    //   →控える段（step 4）は命の四割より下へは減らない（その前の川と山の段は今のまま討たれうる）
    if (F.step === 4 && S.hp < S.maxHp * 0.4) S.hp = S.maxHp * 0.4;
    // K358：夜の囲みの備（勝頼の本陣・旗本ほか）は持ち場を動かない。見つかった騒ぎで本陣ごと川へ下りて来て、忍びの戦が乱戦になっていた
    if (!F.stayDone && rt.t > 1) { F.stayDone = true; for (const g of rt.army.groups) if (g.team === 1 && !F.pat.some((w) => w.g === g) && !F.netGuards.some((w) => w.g === g)) g.stay = true; }
    // 本人が近づいて本物になった陣の備（depth_real の _fjN）は、眠る陣の兵：持ち場を動かず、斬りかからない（見つかって駆けつけるのは番兵だけ）
    if ((F.qcT || 0) <= rt.t) { F.qcT = rt.t + 1; for (const g of rt.army.groups) if (g.team === 1 && g._fjN && !g._quiet) { g._quiet = true; g.stay = true; g.order = 'hold'; g.aggro = 0; g.seekRange = 0; g.noEngage = true; g.noAI = true; } }
    // 終わりの地図の味方の数は城の五百（force）で見せる：川の供・山の物見など数人の味方の組は数に入れない（入れると、討たれ・退いた後に「味方0人」になった・11/18 07:55）
    for (const g of rt.army.groups) if (g.team === 0 && !g.noReplay) g.noReplay = true;
    // 11/18 06:05 UTC クラウド sune 持ち主：供の足軽（後詰）が陣へ逃げる番兵を追って (64,-39) の陣幕の壁に十人重なって止まり、その間に本人が川で囲まれて倒れた（act bot 281秒）→ 本人から離れて追わず、本人の後ろに寄る
    if ((F.tomoT || 0) <= rt.t) { F.tomoT = rt.t + 1; for (const g of rt.army.groups) if (g.team === 0 && g.name === '供の足軽' && !g.routed) {
      g.seekRange = 16;
      // 11/18 14:55 UTC クラウド sune 持ち主：川を忍ぶ間（気づいた見張り・番兵がいない間）は、供は眠る陣の兵のそばでも斬りかからずに控える（hold）。
      //   「攻めよ」のまま眠る兵の30m内で止まり、歴史好きの bot に「敵が近いのに棒立ち」と見えた（70秒・river・供の足軽6人）
      const alert = F.step >= 2 || F.pat.some((w) => w.alerted && !gone(w.g)) || F.netGuards.some((w) => w.alerted && !gone(w.g)) || (F.guards || []).some((q) => !gone(q));
      g.order = alert ? 'attack' : 'hold';
      // 11/18 20:00 クラウド sune 持ち主：追っ手の段で供の足軽が先に駆け寄って討ち、本人は十二太刀当てて討ち取り0（act bot「斬り合う相手が少なくて退屈」）→ 見回りを退ける段は供の刃を四割に（本人が討つ）
      // 11/19 08:55 UTC クラウド sune 持ち主：act bot 3回のうち2回、追っ手の段の討ち取りが味方6〜8・本人2（突き6）で「斬り合う相手が少なくて退屈」→ 供の刃 0.4→0.25・物見の鉄砲 0.5→0.3（一斉射の崩しの手＝士気はそのまま）
      g.dmgMult = F.step >= 4 ? 0.25 : 1;
      const c = g.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 14 || Math.hypot(g.anchor.x - p.x, g.anchor.z - p.z) > 10) { g.anchor.x = p.x - Math.sin(P.u.heading) * 4; g.anchor.z = p.z - Math.cos(P.u.heading) * 4; }
    } }
    // 強右衛門は供のすぐ後ろにつく（忍び足なら忍び足で）
    if (F.step < 5) {
      // 11/18 クラウド sune 持ち主：見回りを退ける段で、強右衛門が本人について坂の斬り合いへ下り、騎馬に囲まれて討たれた（act bot 437秒）→ 狼煙の焚き場の東、物見の鉄砲の後ろで待つ
      const back = F.step === 4 ? { x: KANBO.x + 4, z: KANBO.z + 3 } : { x: p.x - Math.sin(P.u.heading) * 2.2, z: p.z - Math.cos(P.u.heading) * 2.2 };
      // 11/18 07:40 クラウド sune 持ち主：川の段で本人が岸を向くと、後ろの点が東の岸に出て、強右衛門が見張りの松明の5m横に立っていた（10秒の写真）→ 川を下る間は流れの中に留める
      if (F.step <= 1) { const rx = riverX(back.z), lim = riverW(back.z) * 0.6; back.x = Math.max(rx - lim, Math.min(rx + lim, back.x)); }
      //   同じ写真：強右衛門が気づいていない見張りへ自分から斬りかかりに岸へ上がっていた（11秒で的を持つ）→ 忍ぶ間は見つかるまで手を出さない
      const hush = F.step <= 1 && !F.pat.some((w) => w.alerted && !gone(w.g)) && !F.netGuards.some((w) => w.alerted && !gone(w.g)) && !(F.guards || []).some((g) => !gone(g));
      // 11/18 19:50 クラウド sune 持ち主：川の段で騒ぎの後、強右衛門が十二歩先の岸の見張り・退く見張りへ寄ろうとして流れに留まり、
      //   本人と六歩で待ち合って (3,-25) で二百五十秒・(-15,45) で岸へ上がれず止まった（描かずの足跡）→ 川の間は身に迫る五歩の敵だけを払う
      const riverStep = F.step <= 1;
      SG.aggro = hush ? 0 : 3; SG.seekRange = hush ? 0 : riverStep ? 5 : 12;
      if (hush && S.target) { S.target = null; if (S.moveTo) S.moveTo = null; }
      if (!hush && riverStep && S.target && (S.target.fleeing || Math.hypot(S.target.pos.x - S.pos.x, S.target.pos.z - S.pos.z) > 6)) { S.target = null; if (S.moveTo) S.moveTo = null; }
      if (Math.hypot(SG.anchor.x - back.x, SG.anchor.z - back.z) > 1.2) { SG.anchor.x = back.x; SG.anchor.z = back.z; }
      SG.facing = P.u.heading;
      const sp = Math.hypot(P.u.vel.x, P.u.vel.z);
      // 11/18 クラウド sune 持ち主：一戦が長い（474〜707秒）。山へ上がってからは忍び足でなく早足でついてくる（坂で本人が遅れて強右衛門も遅れ、待ち合いで頂まで180秒かかった）
      // 11/18 クラウド sune 持ち主：山の段で本人が先に頂へ登り、遅れた強右衛門が中腹の見回りに一人で囲まれ討たれた（act bot 425秒）→ 山で追っ手が迫れば、本人の所まで駆け上がる
      const hunted = F.step === 2 && Math.hypot(S.pos.x - p.x, S.pos.z - p.z) > 6 && rt.army.nearestEnemy(S, 14, (o) => !o.fleeing && o.group.order === 'attack');
      S.speed = hunted ? 6.2 : F.step >= 2 ? 3.4 : P.guard || sp < 2.6 ? 2.1 : 3.6;
      S.run = 6.2;
    }
    // 見張り
    F.maxSus = 0;
    for (const w of F.pat) {
      if (w.hill && !w.alerted && !gone(w.g)) {
        // 中腹の見回りは二つの点を行き来する
        const q = w.pts[w.k];
        const dx = q[0] - w.x, dz = q[1] - w.z, d = Math.hypot(dx, dz);
        if (w.pause > 0) w.pause -= dt;
        else if (d < 0.5) { w.k = 1 - w.k; w.pause = 4; }
        else { w.x += dx / d * 1.3 * dt; w.z += dz / d * 1.3 * dt; }
        w.fixed = true; w.base = w.pause > 0 ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
        w.g.anchor.x = w.x; w.g.anchor.z = w.z;
      }
      if (F.step < 3) this.watch(rt, w, dt);
    }
    if (F.step < 3) for (const w of F.netGuards) this.watch(rt, w, dt);
    // 騒ぎ：追っ手がいなくなれば静まる
    const chasers = [...F.pat.filter((w) => w.alerted).map((w) => w.g), ...F.netGuards.filter((w) => w.alerted).map((w) => w.g), ...(F.guards || [])].filter((g) => !gone(g));
    // 11/19 07:00 UTC クラウド sune 持ち主：見張り一人を一太刀で討つと、『曲者じゃ』と同じ秒に『今のうちじゃ』が続いた（81・99・115秒）→ 見つかって五秒は静まらない
    if (F.found && !chasers.length && !F.calm && rt.t - (F.spotT ?? -99) > 5) {
      F.calm = true;
      rt.objDone('flee'); rt.objRemove('flee');
      rt.bark('騒ぎは静まった。じゃが、見張りの目は厳しくなった');
      if (rt.t - (F.calmSayT ?? -99) >= 8) F.calmSayT = rt.t, rt.say('鳥居強右衛門', F.step >= 2 ? '……今のうちじゃ。木の陰を伝って登ろう' : '……今のうちじゃ。また流れに身を沈めて進もう', 3);
    }
    if (chasers.length) F.calm = false;
    // 11/18 18:40 クラウド sune 持ち主：逃げた番兵の赤い印『番兵・崩れかけ』と、斬りかかって騒ぎになった見張りの『見張り』の印が、
    //   その場に残ったまま戦の終わりまで七つ並んだ（act bot の POSLOG）→ 崩れて去った組・騒ぎになった見張りの印は下ろす
    (F.guards || []).forEach((g, i) => { if (gone(g) && !g._unmarked) { g._unmarked = true; rt.unmark('guard' + (i + 1)); } });
    for (const w of [...F.pat, ...F.netGuards]) if (w.susMark && (w.alerted || gone(w.g))) { w.susMark = false; rt.unmark('sus' + w.idx); }
    // 追っ手から遠く離れれば、振り切れる
    for (const g of chasers) {
      const c = g.center();
      // 11/18 07:50 クラウド sune 持ち主：頭（侍）の立つ番兵は morale 0 でも崩れず（army_groups の headUp）、70m 先から追い続けた。
      //   act bot が岸へ上がる前にそれを追って斬り合い、川の段が六百秒（5回中2回）→ 離れれば、その場で背を向けて陣へ退く
      // 11/18 クラウド17（一戦が長い 541・675秒：川の段で見つかった後、番兵と見張りが川の中で百秒あまり斬り合い続けた。決まりは一戦4〜7分）：
      //   川の段で四十秒追っても討てなければ、追っ手は流れに阻まれて陣へ退く（強右衛門は流れに乗って下った）
      if (F.step === 1 && g.order === 'attack') { if (g._chaseT == null) g._chaseT = rt.t; } else g._chaseT = null;
      const tired = F.step === 1 && g._chaseT != null && rt.t - g._chaseT > 40;
      if ((tired || Math.hypot(c.x - p.x, c.z - p.z) > 45) && g.order === 'attack') { const s = c.x > riverX(c.z) ? 1 : -1; g.morale = 0; g.noRout = false; g.routed = true; g.order = 'flee'; g.focus = null; g.fleeDir = { x: s, z: 0 }; }
    }
    // 11/18 cloud-04 の見回り（始めの印『鳥居強右衛門』に着いても何も起きない）：話を聞いた後、そばに寄れば十八秒を待たずに下り始める
    if (F.step === 0 && rt.t > 3 && F.sune && Math.hypot(F.sune.pos.x - p.x, F.sune.pos.z - p.z) < 6) this.start(rt);
    if (F.step === 1) {
      // 11/18 クラウド sune 持ち主：川の段が長い（川の深みで足が四割五分に落ち、強右衛門と二人で 0.5m/秒・川だけで三百秒超）。
      // 強右衛門は川に潜って流れに乗って下った（本・指示書）→ 下流へ向かう間は流れが運ぶ（縄の手前三歩では止める＝切らずに越えて鳴らさない）
      const flow = (u, mv) => {
        if (!u || !u.alive || !inRiver(u.pos.x, u.pos.z) || !mv) return;
        if (!F.netCut && u.pos.z > NET_Z - 3) return;
        const k = 1.1 * dt;
        u.pos.z += k; u.pos.x += (riverX(u.pos.z + 2) - riverX(u.pos.z)) * k * 0.5;
      };
      flow(P.u, P.u.vel.z > 0.3);
      flow(S, Math.hypot(S.pos.x - p.x, S.pos.z - p.z) > 1.5 && p.z > S.pos.z);
      // 11/18 19:55 クラウド sune 持ち主：強右衛門が縄の二十歩手前 (2,-31) で本人の六歩後ろに留まり（後ろの点へ寄らない）、本人が待ち戻る往復で
      //   川の段が二百五十秒〜五百秒止まった（描かずの足跡 三回に三回）→ 川の間は、本人から四歩半より離れれば流れの中を自ら寄る
      const sd = Math.hypot(S.pos.x - p.x, S.pos.z - p.z);
      if (S.alive && sd > 4.5 && sd < 40 && inRiver(S.pos.x, S.pos.z) && !(S.target && S.target.alive)) {
        const k = Math.min(sd - 3, 1.9 * dt);
        S.pos.x += (p.x - S.pos.x) / sd * k; S.pos.z += (p.z - S.pos.z) / sd * k;
        const rx = riverX(S.pos.z), lim = riverW(S.pos.z) * 0.7; S.pos.x = Math.max(rx - lim, Math.min(rx + lim, S.pos.x));
        S.heading = Math.atan2(p.x - S.pos.x, p.z - S.pos.z);
      }
      // 鳴子の縄：川の中ほどで切る。切らずに越えれば鳴る
      if (!F.netCut) {
        const rx = riverX(NET_Z);
        if (!rt.interacts.some((i) => i.id === 'net')) rt.addInteract('net', { x: rx, z: NET_Z - 1 }, '鳴子の縄を切る（音を立てずに）', () => this.cutNet(rt), { r: 3, hold: 2.2 });
        const crossed = [P.u, S].some((u) => u.pos.z > NET_Z + 0.6 && Math.abs(u.pos.x - rx) < 13);
        if (crossed) this.netRang(rt);
        const d = Math.hypot(p.x - rx, p.z - NET_Z);
        // K358：縄の前で番の目がそれるのを長く待ち続けた（bot が千秒止まり・強右衛門が討たれた）。百秒を過ぎて縄のそばにいれば、強右衛門が潜って縄を切る
        if (rt.t - F.riverT > 55 && d < 10 && !F.netCut) { rt.say('鳥居強右衛門', 'わしが潜って切る。……切れたぞ、参ろう', 3); this.cutNet(rt); }
        if (d < 16 && !F.netSaid) {
          F.netSaid = true;
          rt.say('鳥居強右衛門', '見よ、川に縄が張ってある。鳴子じゃ。触れれば鳴って番所に知れる', 4);
          rt.say('鳥居強右衛門', '番の目がよそを向いた隙に、流れの中ほどで縄を切ってくだされ', 4);
        }
      }
      const left = Math.max(0, Math.round(EXIT.z - p.z));
      // 11/18 cloud-04 の見回り（川の段で「岸へ上がる」のまま45秒何も起きない、が三回とも）：下るにつれ強右衛門が小声で添える
      F.riverSaid ??= {};
      for (const [k, line] of [[165, '水が冷たい……息を殺して参れ'], [130, '篝火の明かりじゃ。流れの影を伝え'], [60, '囲みの外れが近い。あと一息'], [30, 'あの岸じゃ。音を立てずに上がるぞ']])
        if (left < k && !F.riverSaid[k] && (k > 90 || F.netCut)) { F.riverSaid[k] = true; F.riverSayT = rt.t; rt.say('鳥居強右衛門', line, 2.8); break; }
      // 見張りの隙を待つ間も、四十秒に一度は強右衛門が小声で様子を告げる
      if (rt.t - Math.max(F.riverSayT || 0, F.riverT) > 38) { F.riverSayT = rt.t; F.riverMur = (F.riverMur || 0) + 1; rt.say('鳥居強右衛門', ['……松明が向こうを向いた。今じゃ', '焦るな。目がそれた隙に進め', '流れに身を沈めよ。あと少しで囲みの外じゃ'][F.riverMur % 3], 2.6); }
      const state = F.maxSus > 0.7 ? '見つかりそう！' : F.maxSus > 0.3 ? '見張りが怪しんでいる' : '気づかれていない';
      rt.objProgress('main', `${F.netCut ? '' : '鳴子の縄の先・'}岸へ上がる所まで ${left}歩`);
      rt.objProgress('stealth', F.found ? '' : state);
      if (F.netCut && Math.hypot(p.x - EXIT.x, p.z - EXIT.z) < 10) this.ashore(rt);   // 印の「着いた」は十歩（七歩では印の縁で何も起きなかった）
      // 夜が明けかける（長くかかりすぎたとき）
      if (rt.t - F.riverT > 300 && !F.late) { F.late = true; F.alert = Math.min(3, F.alert + 1); rt.bark('東の空が白みはじめた。急げ', true); }
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - KANBO.x, p.z - KANBO.z);
      rt.objProgress('main', `頂まで ${Math.max(0, Math.round(d))}歩`);
      // K358：頂に着けば、強右衛門が薪に火を移す（着いて何も起きない間を作らない。手で「上げる」も残す）
      if (d < 10) { F.kanboT = (F.kanboT || 0) + dt; if (F.kanboT > 0.2 && !F.kanboSaid) { F.kanboSaid = true; rt.say('鳥居強右衛門', '着いた……薪を積め。火を移すぞ', 2.5); } if (F.kanboT > 3) this.smoke(rt); }
    }
    if (F.step === 4) {
      const g = F.purs;
      // 一斉射：見回りが頂の手前（三十mほど）まで上がってきたら、物見の鉄砲が揃えて放つ
      if (!F.pVol && !gone(g) && Math.hypot(g.center().x - KANBO.x, g.center().z - KANBO.z) < 34) {
        F.pVol = true;
        volley(rt, [F.mimi], { who: '徳川の物見', wait: 1.8, waitLine: 'まだ撃つな……坂を上りきる所じゃ', line: '放てぇっ！', banner: ['一斉射', '物見の鉄砲が、坂を上る騎馬へ放つ'], r: 45, hit: 30 });
      }
      const g2 = F.purs2;
      // 11/19 00:50 UTC クラウド sune 持ち主：一戦が 237秒（4分に届かず）・act bot が毎回「重く斬り合いたい」。
      //   騎馬と徒を退けた所へ、下の陣から武田の侍の三の手（侍三・槍五）が尾根の道を上がる＝甲冑の侍と重く斬り合ってから送り出す
      if (!F.purs3 && !F.ending && gone(g) && g2 && (gone(g2) || g2.count <= 2 || rt.t - F.pT > 60) && rt.t - F.pT > 24) {
        F.p3T = rt.t;
        // 11/21 クラウド sune 持ち主：act bot 3回に2回、本人の追っ手の段の討ち取りが2・1（味方が4〜5討ち、残りは崩れて去った）＝甲冑の侍は六十秒の区切り（下の after）までは崩れず踏みとどまる
        F.purs3 = enemyGroup(rt, { faction: 'takeda', name: '武田の侍の三の手', anchor: { x: -164, z: 120 }, facing: Math.PI / 2, order: 'attack', seekRange: 120, aggro: 14, width: 4, morale: 75, noRout: true, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.85, speed: 2.8 },
          [{ type: 'samurai', n: 3, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 5 }]);
        rt.say('鳥居強右衛門', 'まだ来る……甲冑の侍じゃ。これを退ければ道が開く', 3);
        rt.marker('purs', centerOf(F.purs3), () => `武田の侍・${moraleWord(F.purs3.morale)}`, { red: true, group: F.purs3 });
        rt.after(60, () => { const g3 = F.purs3; if (g3 && !gone(g3)) { g3.morale = 0; g3.noRout = false; } });
      }
      const g3 = F.purs3;
      rt.objProgress('main', `見回り ${g.count + (g2 && !gone(g2) ? g2.count : 0) + (g3 && !gone(g3) ? g3.count : 0)}人`);
      if (gone(g) && g2 && !gone(g2) && !F.p2Mark && !g3) { F.p2Mark = true; rt.marker('purs', centerOf(g2), () => `武田の徒の追っ手・${moraleWord(g2.morale)}`, { red: true, group: g2 }); }
      if (gone(g) && (!g2 ? rt.t - F.pT > 16 : gone(g2)) && (g2 ? g3 && gone(g3) : true) && !chasers.length) this.depart(rt);
      // 保険：追っ手が何かで残り続けても、しばらくすれば強右衛門は道へ駆け出す（三の手が出た時は、出てから55秒まで待つ。11/19 act bot：騎馬が坂で残った回に150秒何も起きなかった）
      else if (rt.t - F.pT > 110 && (!F.purs3 || rt.t - F.p3T > 55)) { for (const q of [g, F.purs2, F.purs3, ...chasers]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; } this.depart(rt); }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else if (!v.isPlayer) F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.purs) rt.say('鳥居強右衛門', '見回りが逃げていく！　今じゃ！', 2.5);
  },
};

// 両軍の総勢（城兵 五百、囲む武田 一万五千）
sune.force = (rt) => {
  const F = rt.flags;
  return { a: 500, a0: 500, b: 15000 - (F.ek || 0) * 18, b0: 15000 };
};
sune.sides = { a: { name: '徳川方・奥平勢', mon: 'okudaira' }, b: { name: '武田軍', mon: 'takeda' } };
sune.date = (rt) => (rt.flags.look === 'dawn' ? '天正三年五月十五日とも　夏・夜明け' : '天正三年五月十四日とも　夏・夜');
sune.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '川を下りはじめる' : '');
sune.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
sune.history = '天正三年五月十四日の夜、長篠城の足軽・鳥居強右衛門は城を抜け出し、川に潜って武田の囲みをくぐったと伝わる。武田方は川に縄を張り、鳴子を下げて見張っていたが、強右衛門はそれを切って下ったという。翌朝、雁峰山で狼煙を上げて脱出を城に知らせ、その日のうちに岡崎へ走って家康と信長に後詰を願った。城へ戻る途中で捕らえられ、「援軍は来ない」と告げるよう命じられたが、「援軍はすぐに来る」と叫んで磔にされた。日付や最期の細部には異なる伝えがあり、この戦の日付・道筋は伝承をもとにした復元である。晴れだったと確定はしない。この戦に出てくる供の足軽は、遊びのための人物である。';

// 素直な遊び手：川の真ん中を下り、見張りの扇が近ければ止まって待つ。鳴子は番の目がそれた時に切る。
// 岸へ上がれば頂へ登って狼煙を上げ、最後は見回りを突く
function danger(F, x, z, pad) {
  for (const w of [...F.pat, ...F.netGuards]) {
    if (w.alerted || gone(w.g) || !w.on) continue;
    const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
    const R = w.R * (1 + F.alert * 0.12) + pad;
    if (d < 4 + pad || (d < R && Math.abs(ad(w.look, Math.atan2(dx, dz))) < HALF + 0.3)) return true;
  }
  return false;
}
sune.botOrders = true;   // bot：性格の突進で強右衛門から離れない（下の頭に任せる）
sune.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive || F.ending) return;
  // 振りを受けてから返す（共通の patientStrike）。くじで突き・構えを決めると、侍二人に囲まれて倒れた（11/8）
  const fight = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2.2);
    patientStrike(p, inp, e, d);
  };
  // 追っ手・見回りと戦う（まだ気づいていない見張りには手を出さない）
  // 守る間（段4より前）は強右衛門のそばの敵だけを払う。追っ手を追って離れると、残った強右衛門が討たれた（11/8 bot）
  const S = F.sune;
  const e = F.step >= 4 ? b.army.nearestEnemy(u, 80, (o) => !o.fleeing)
    : b.army.nearestEnemy(S, 10, (o) => !o.fleeing && o.group.order === 'attack');
  if (e && (F.step >= 4 || Math.hypot(e.pos.x - S.pos.x, e.pos.z - S.pos.z) < 10)) { fight(e); return; }
  // 川（段1）までは強右衛門を待つ。山（段2）は囲みの外なので、本人は頂へ先に登る（坂で遅れる強右衛門を待ち合って頂まで160秒かかった・11/18）
  // 11/18 09:50 クラウド sune 持ち主：斬り合いで本人が岸に上がると、強右衛門は流れの中に留まる（川幅の六割まで）。8m を超えれば寄り・6〜8m は待つ、
  //   の間に二人が 6〜8m で互いに待ち合い、(8,24) で三百秒止まった（act bot 6回中2回）→ 6m を超えれば本人が川の強右衛門の所へ下りる
  if (F.step < 2 && Math.hypot(S.pos.x - u.pos.x, S.pos.z - u.pos.z) > 6) { goTo(p, inp, S.pos.x, S.pos.z, 2.5); return; }
  if (F.step === 1) {
    const rx = riverX(NET_Z);
    if (!F.netCut) {
      const cut = { x: rx, z: NET_Z - 1.5 };
      const d = Math.hypot(cut.x - u.pos.x, cut.z - u.pos.z);
      if (d < 2.4) { if (!danger(F, u.pos.x, u.pos.z, 0)) inp.k.add('KeyE'); return; }
      const nz = Math.min(NET_Z - 1.5, u.pos.z + 5);
      // 11/18 クラウド17：見張りが通るのを待つのは八秒まで（扇の外を待ち続けて川の段が四十秒延びた）。過ぎれば構えて忍んで進む
      if (danger(F, riverX(nz), nz, 1) && d > 4) { if (F.botWait == null) F.botWait = b.t; if (b.t - F.botWait < 8) return; inp.guardHold = true; } else F.botWait = null;
      if (u.pos.z > NET_Z - 12) goTo(p, inp, cut.x, cut.z, 1); else goTo(p, inp, riverX(nz), nz, 0.8);
      return;
    }
    const nz = Math.min(EXIT.z - 4, u.pos.z + 5);
    const tgt = u.pos.z > EXIT.z - 10 ? EXIT : { x: riverX(nz), z: nz };
    if (danger(F, tgt.x, tgt.z, 1) && !danger(F, u.pos.x, u.pos.z, 0)) { if (F.botWait == null) F.botWait = b.t; if (b.t - F.botWait < 8) return; inp.guardHold = true; } else F.botWait = null;
    goTo(p, inp, tgt.x, tgt.z, 0.8);
    return;
  }
  if (F.step === 2) {
    const d = Math.hypot(KANBO.x - u.pos.x, KANBO.z - u.pos.z);
    if (d < 2.4) { inp.k.add('KeyE'); return; }
    goTo(p, inp, KANBO.x, KANBO.z, 1.5);
    return;
  }
  if (F.step === 4) { const q = F.purs && F.purs.count ? F.purs : F.purs2 && F.purs2.count ? F.purs2 : null; if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 3); } }
};

export { sune };
