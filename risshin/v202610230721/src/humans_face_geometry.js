// 人の処理：顔と髪の形。外部向けの入口は humans.js。
import * as THREE from 'three';
import { headCompile, mhPick } from './humans_face_materials.js';
import { smooth, HEAD } from './humans_shared.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 笠・兜をかぶる人の顔の材質（絵は同じ物を使い、陰の強さだけ変える）
const hatMats = new Map();
// 兵の顔の四通り（汚れ x・汗 y・日焼けの赤み z・斑の位置 w）
const FACE_VAR = [[0.2, 0.3, 0.2, 1.3], [0.45, 0.55, 0.35, 4.1], [0.35, 0.85, 0.6, 7.7], [0.6, 0.4, 0.45, 2.9]];   // 泥は口のまわりの黒い塊にしない（0.95 は泥の面に見えた）
function hatFaceMat(base, amt, fv = -1) {
  const k = base.uuid + '|' + amt + '|' + fv;
  if (!hatMats.has(k)) {
    const m = base.clone();
    m.userData = { ao: { value: amt }, fv: { value: new THREE.Vector4(...(FACE_VAR[fv] || [0, 0, 0, 0])) } };
    m.onBeforeCompile = headCompile; m.customProgramCacheKey = () => 'scanhead'; hatMats.set(k, m);
  }
  return hatMats.get(k);
}
// ---- 髪と髷 ----
// 横と後ろの髪：頭の形の髪の所を、毛の厚みぶん浮かせた殻にする（絵に塗った髪だけでは、頭が剃った坊主の形に見える）
// 髷：剃った頭頂に、後ろから前へ折った髪の束と元結。形は頭の形ごとに一度だけ作る
const hairGeos = new Map();
let HAIR_MATS = null;
function hairAt(x, y, z) {
  const th = Math.abs(Math.atan2(x, z));
  const back = smooth(1.55, 1.95, th) * smooth(0.3, 0.9, y);
  const side = smooth(1.2, 1.5, th) * smooth(1.2, 1.7, y) * smooth(3.5, 3.05, y);
  // 耳の上は髪を浮かせない（耳を覆う帽子に見せない）
  const ear = Math.abs(x) > 3.5 && y < 2.4 && y > 0.2 ? smooth(3.5, 3.9, Math.abs(x)) : 0;
  return Math.max(back, side) * (1 - ear);
}
function hairGeo(hg) {
  if (hairGeos.has(hg.uuid)) return hairGeos.get(hg.uuid);
  const pos = hg.attributes.position, nrm = hg.attributes.normal, idx = hg.index;
  const P = [], Nn = [], A = [];
  const hv = new Float32Array(pos.count).fill(-1);
  const H = (v) => (hv[v] >= 0 ? hv[v] : (hv[v] = hairAt(pos.getX(v), pos.getY(v), pos.getZ(v))));
  for (let i = 0; i < idx.count; i += 3) {
    const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const hs = t.map(H);
    if (Math.max(...hs) < 0.02) continue;
    for (let k = 0; k < 3; k++) {
      const v = t[k], d = 0.1 * hs[k];
      P.push(pos.getX(v) + nrm.getX(v) * d, pos.getY(v) + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d);
      Nn.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v)); A.push(hs[k]);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  shell.setAttribute('hairA', new THREE.Float32BufferAttribute(A, 1));
  // 頭頂の線（真ん中の縦の切り口）：前後の位置ごとの一番上
  const top = new Map();
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getX(v) + 0.09) > 0.35) continue;
    const zb = Math.round(pos.getZ(v) * 4);
    top.set(zb, Math.max(top.get(zb) ?? -9, pos.getY(v)));
  }
  const topY = (z) => { let best = 0, bz = 1e9; for (const [zb, y] of top) { const dz = Math.abs(zb / 4 - z); if (dz < bz) { bz = dz; best = y; } } return best; };
  // 髷：後ろの頭頂（元結）から前へ、頭の丸みに沿って少し浮かせる。先は細く
  const zs = [-1.75, -1.35, -0.9, -0.35, 0.2, 0.6];
  const lift = [0.34, 0.4, 0.38, 0.32, 0.27, 0.24];
  const curve = new THREE.CatmullRomCurve3(zs.map((z, i) => new THREE.Vector3(-0.09, topY(z) + lift[i], z)));
  const mage = new THREE.TubeGeometry(curve, 16, 1, 8, false);
  // 太さ：元結の所が太く、先へ細る（筆の穂のように）
  // 茶筅の穂先のように：元結（ネック）で一度くくって細り、その先は少し広がる
  { const p = mage.attributes.position, n = 16 + 1, r = 8 + 1, neckT = 0.14; for (let s = 0; s < n; s++) { const t = s / (n - 1), c = curve.getPointAt(t), rad = 0.4 * (t < neckT ? 1 - 0.55 * (t / neckT) : 0.45 + 0.65 * Math.pow((t - neckT) / (1 - neckT), 0.7)); for (let j = 0; j < r; j++) { const i = s * r + j; p.setXYZ(i, c.x + (p.getX(i) - c.x) * rad, c.y + (p.getY(i) - c.y) * rad * 0.8, c.z + (p.getZ(i) - c.z) * rad); } } mage.computeVertexNormals(); }
  // 髷の根：頭頂の後ろの小さな盛り上がり（束ねた髪）
  const knot = new THREE.SphereGeometry(0.42, 10, 7); knot.scale(1.05, 0.7, 1.1); knot.translate(-0.09, topY(-1.6) + 0.12, -1.6);
  // 元結（白い紙縒り）
  const tie = new THREE.TorusGeometry(0.3, 0.07, 5, 12); tie.rotateY(Math.PI / 2); tie.rotateZ(0.0); tie.rotateX(0.35);
  const t0 = curve.getPointAt(0.12); tie.translate(t0.x, t0.y, t0.z);
  const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); g.setAttribute('hairA', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1)); return g; };
  const bun = mergeGeometries([strip(mage), strip(knot)]);
  const out = { shell, bun, tie: strip(tie), T: new THREE.Vector3(-0.09, topY(-1.6), -1.6) };
  hairGeos.set(hg.uuid, out);
  return out;
}
function hairMats() {
  if (HAIR_MATS) return HAIR_MATS;
  const mk = (bun) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHairT = m.userData.T;
      sh.vertexShader = 'attribute float hairA;\nvarying float vHA;\nvarying vec3 vHP2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHA = hairA; vHP2 = position;');
      sh.fragmentShader = 'uniform vec3 uHairT;\nvarying float vHA;\nvarying vec3 vHP2;\nfloat hh1(float n) { return fract(sin(n) * 43758.5453); }\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // 毛の筋：どの毛も元結（uHairT）へ向かって梳き上げてある。元結のまわりの角度で細い筋を引く
          vec3 d = vHP2 - uHairT;
          float a = ${bun ? 'atan(d.x, d.y) * 3.0 + d.z * 0.8' : 'atan(d.x, length(d.yz)) * 7.0 + atan(d.y, d.z) * 9.0'};
          float s1 = fract(a * 9.0), s2 = hh1(floor(a * 9.0));
          float strand = 0.6 + 0.5 * smoothstep(0.0, 0.5, abs(s1 - 0.5)) * (0.6 + 0.4 * s2);
          diffuseColor.rgb *= strand;
          // 生え際：毛先の不揃いな縁（殻の縁を一本の線に見せない）。縁は薄く、肌が透ける
          float ragged = hh1(floor(a * 9.0) * 3.7 + floor(vHP2.y * 6.0));
          if (vHA < 0.12 + 0.5 * ragged * (1.0 - smoothstep(0.3, 0.8, vHA))) discard;
          diffuseColor.rgb = mix(diffuseColor.rgb * 1.35, diffuseColor.rgb, smoothstep(0.2, 0.7, vHA));
        }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.42 + 0.2 * hh1(floor(vHP2.x * 40.0) + floor(vHP2.y * 40.0) * 7.0);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // 鬢付け油の照り：毛の筋に沿う細い帯（髪の艶）
        reflectedLight.directSpecular *= 1.4;`);
    };
    m.customProgramCacheKey = () => 'hair' + (bun ? 'b' : 's');
    m.userData.T = { value: new THREE.Vector3() };
    m.userData.humanBatch = true;   // 同じ髪の色の房は、全員で一つの束に描く（army_human_batch.js）
    return m;
  };
  HAIR_MATS = { shell: new Map(), bun: new Map(), mk, tie: new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.8 }) };
  HAIR_MATS.tie.userData.humanBatch = true;
  return HAIR_MATS;
}
function addHair(hm, hg, F, lite) {
  const G = hairGeo(hg), M = hairMats();
  const hex = F.hair || 0x15110d, key = hex + '|' + G.T.toArray().map((v) => v.toFixed(1)).join(',');
  const pick = (map, bun) => {
    if (!map.has(key)) { const m = M.mk(bun); m.color.setHex(hex).multiplyScalar(1.6).add(new THREE.Color(0.018, 0.015, 0.012)); m.userData.T.value.copy(G.T); map.set(key, m); }
    return map.get(key);
  };
  for (const [geo, mat] of [[G.shell, pick(M.shell, false)], [G.bun, pick(M.bun, true)], [G.tie, M.tie]]) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !lite; m.receiveShadow = true; m.frustumCulled = false;
    hm.add(m);
  }
}
// 骨格の彫り：頭の座標（1 が 4cm ほど。眉 y≈2.0、目 y≈1.72、口 y≈0.2、顔の前 z≈2、真ん中 x≈-0.09）で、横と前へのずらし [dx, dz]
const EYE_SINK = 0.05;   // 目のくぼみの深さの分、目を奥へ
function faceSculpt(x0, y, z, xc) {
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  const fr = z > 0.6 ? Math.min(1, (z - 0.6) / 1.0) : 0;
  const t = Math.min(1, Math.max(0, (x0 - 0.65) / 1.0));
  let dx = 0, dz = 0;
  dz -= 0.4 * t * t * (3 - 2 * t) * fr * (y < 2.6 ? 1 : 0.5);                  // 顔の面を横へ回り込ませる
  // 下の顔を顎へ向けて細める（頬から顎先へ、逆さの卵の形に）。首に近い後ろは動かさない
  const lowF = Math.min(1, Math.max(0, (1.0 - y) / 1.8)) * Math.min(1, Math.max(0, (z - 0.2) / 1.2));
  dx -= x0 * 0.2 * lowF * lowF;
  // 頬の縁：目の横から頬の外は、縦にまっすぐな縁にせず、頬骨の所で膨らみ、こめかみと顎の横で絞る
  dx += 0.08 * Gs(x0 - 1.6, y - 1.15, 0.3, 0.45) - 0.07 * Gs(x0 - 1.6, y - 2.2, 0.3, 0.3);
  // 首：顎の下から肩へ太く（細い首に大きな頭が載った人形にしない）。顎の前は動かさない
  const nb = Math.exp(-Math.pow(y + 0.8, 2) / (2 * 0.3 * 0.3)) * (z < 1.1 ? 1 : Math.max(0, 1 - (z - 1.1) / 0.4));
  dx += x0 * 0.2 * nb; dz += z * 0.12 * nb;
  dx -= 0.13 * Gs(x0 - 1.4, y + 0.35, 0.35, 0.45);                              // えらの角を落とす
  const cb = Gs(x0 - 1.2, y - 1.3, 0.28, 0.24) * fr; dx += 0.06 * cb; dz += 0.07 * cb;   // 頬骨
  dz -= 0.06 * Gs(x0 - 1.0, y - 0.6, 0.3, 0.3) * fr;                            // 頬骨の下のこけ
  dz += 0.1 * Gs(x0 - 0.62, y - 2.03, 0.45, 0.09) * fr;                          // 眉弓
  dz -= 0.075 * Gs(x0 - 0.6, y - 1.74, 0.28, 0.14) * fr;                         // 目のくぼみ
  dz += 0.06 * Gs(xc, y - 1.55, 0.13, 0.3) * (z > 1.8 ? 1 : 0);                  // 鼻筋
  dz += 0.05 * Gs(xc, y + 0.55, 0.35, 0.28) * fr;                                // 顎先
  return [dx, dz];
}
// MakeHuman の頭の彫り（MakeHuman の頭の座標：目 y 1.72・x ±0.64、眉 y≈2.05、鼻先 y≈0.85、鼻の下 y≈0.5、口 y≈0.15、顎 y≈-0.9、顔の前 z≈2.2）
// 元の形は丸く滑らかで、人形の顔に見える：眉弓と鼻筋を立て、頬骨を張り、その下をこけさせ、顎の線を締める（戦国の日本人の骨格：頬骨が張り、鼻筋は低め）
const MH_NARROW = 0.9;
function mhSculpt(x0, y, z, xc) {
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  const fr = Math.min(1, Math.max(0, (z - 0.8) / 1.0));
  let dx = 0, dz = 0;
  dz += 0.1 * Gs(x0 - 0.62, y - 2.06, 0.42, 0.11) * fr;                         // 眉弓
  dz += 0.04 * Gs(xc, y - 1.98, 0.2, 0.12) * fr;                                // 眉間
  dz -= 0.035 * Gs(x0 - 0.66, y - 1.93, 0.25, 0.06) * fr;                       // 眉と瞼の間のくぼみ
  dz += 0.07 * Gs(xc, y - 1.6, 0.11, 0.22) * (z > 1.9 ? 1 : 0);                 // 鼻筋
  dx += 0.05 * Gs(x0 - 1.3, y - 1.3, 0.25, 0.25) * fr;                          // 頬骨（横へ）
  dz += 0.07 * Gs(x0 - 1.15, y - 1.3, 0.28, 0.2) * fr;                          // 頬骨（前へ）
  dz -= 0.1 * Gs(x0 - 1.05, y - 0.55, 0.28, 0.3) * fr;                          // 頬骨の下のこけ
  dx -= 0.04 * Gs(x0 - 1.35, y - 0.5, 0.3, 0.3);
  dz += 0.03 * Gs(x0 - 0.75, y - 0.6, 0.15, 0.25) * fr;                         // ほうれい線の外の頬
  const lowF = Math.min(1, Math.max(0, (0.9 - y) / 1.5)) * fr;
  dx -= x0 * 0.07 * lowF;                                                       // 下の顔を細く
  dx += 0.03 * Gs(x0 - 1.3, y + 0.45, 0.22, 0.2);                               // えらの角
  dz += 0.05 * Gs(xc, y + 0.6, 0.3, 0.22) * fr;                                 // 顎先
  return [dx, dz];
}
// 実写の頭の形（顔の形の値で少し変える：幅・えら・大きさ）
const headGeos = new Map();
function headGeo(key, F) {
  if (headGeos.has(key)) return headGeos.get(key);
  const g = (HEAD.mh ? HEAD.vars[mhPick(key, F)] : HEAD.geo).clone();
  const p = g.attributes.position;
  const w = F.w || 1, jaw = F.jaw || 1;
  const eyes = HEAD.mh && HEAD.eyes && HEAD.eyes[mhPick(key, F)];
  // 顔の彫り（名のある武将ほど強く）：頬骨・頬のこけ・鼻の高さと幅・眉の張り・目の間隔・年の頬の下がり
  // MakeHuman の頭は兜で額から上が隠れるので、名のある武将は顔の違いを強めに出す（皆が同じ顔に見えないよう）
  const kk = String(key).startsWith('g:') || key === 'player' ? (HEAD.mh ? 1.7 : 1) : 0.6;
  const cheek = (F.cheek ?? 1) - 1, gaunt = (F.gaunt ?? 0.5) - 0.5, nose = (F.nose ?? 1) - 1, nw = (F.nw ?? 1) - 1, brow = (F.brow ?? 1) - 1, esp = (F.esp ?? 1) - 1;
  const old = Math.max(0, Math.min(1, ((F.age ?? (F.t >= 6 ? 58 : 35)) - 30) / 30));
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const low = Math.min(1, Math.max(0, (1.2 - y) / 2.2));
    const xc = x + 0.09, x0 = Math.abs(xc), sx = Math.sign(xc) || 1;
    const fr = z > 0.8 ? Math.min(1, (z - 0.8) / 1.0) : 0;
    x *= w * (1 + (jaw - 1) * 0.35 * low);
    z *= 1 + (F.chin - 1 || 0) * 0.05 * low;
    if (fr > 0) {
      const cb = Gs(x0 - 1.25, y - 1.25, 0.35, 0.33) * fr;
      x += sx * cheek * 0.4 * cb * kk; z += cheek * 0.18 * cb * kk;
      const gh = Gs(x0 - 1.05, y - 0.4, 0.32, 0.35) * fr;
      x -= sx * gaunt * 0.16 * gh * kk; z -= gaunt * 0.08 * gh * kk;
      const nz = Gs(xc, y - 1.25, 0.32, 0.5) * (z > 1.8 ? Math.min(1, (z - 1.8) / 0.4) : 0);
      z += nose * 0.9 * nz * kk; x += xc * nw * 0.6 * nz * kk;
      const bz = Gs(x0 - 0.65, y - 2.05, 0.5, 0.18) * fr;
      z += brow * 0.25 * bz * kk;
      const ez = Gs(x0 - 0.6, y - 1.72, 0.38, 0.32) * fr;
      x += sx * esp * 0.6 * ez;
      // 目の穴の周りだけを変える。目玉・兜・頭頂の形は変えない。
      const ec = eyes ? (Math.sign(eyes.l[0] + 0.09) === sx ? eyes.l : eyes.r) : null;
      const eyeX = ec ? ec[0] : sx * 0.6 - 0.09, eyeY = ec ? ec[1] : 1.72;
      const ex = Math.abs(p.getX(i) - eyeX), ey = p.getY(i) - eyeY;
      const ew = Gs(ex, ey, 0.32, 0.2) * fr;
      y += (ey * (1 / (F.eye || 1) - 1) + (x0 - Math.abs(eyeX + 0.09)) * (F.eyeTilt || 0)) * ew;
      // 顎先の長短は首に届かない範囲で付ける。
      const chin = ((F.chin ?? 1) - 1) * Gs(xc, p.getY(i) + 0.8, 0.55, 0.3) * fr;
      y -= chin * 0.4; z += chin * 0.25;
      const jw = Gs(x0 - 0.95, y + 0.15, 0.45, 0.5) * fr;
      y -= old * 0.12 * jw; x += sx * old * 0.05 * jw;
      if (HEAD.mh) {
        // 年：ほうれい線の溝・目の下のたるみ・頬のこけ
        const nlx = 0.38 + (0.62 - y) * 0.45;
        z -= old * 0.05 * Gs(x0 - nlx, y - 0.45, 0.07, 0.4) * fr;
        z += old * 0.03 * Gs(x0 - 0.62, y - 1.42, 0.25, 0.06) * fr;
        z -= old * 0.04 * Gs(x0 - 1.05, y - 0.7, 0.3, 0.3) * fr;
      }
    }
    // 骨格の彫り（誰にでも）：顔の面を丸め、えらの角を落とし、頬骨・眉弓・鼻筋・顎を出し、目と頬の下をくぼませる（四角い箱に絵を貼った顔にしない）
    if (!HEAD.mh) { const d = faceSculpt(x0, y, z, xc); x += sx * d[0]; z += d[1]; } else {
      const d = mhSculpt(x0, y, z, xc); x += sx * d[0]; z += d[1];
      // 頭の幅を細める（MakeHuman の頭は兜の鉢と同じほど幅があり、大きな丸顔に見える）。首の付け根はそのまま
      const nk = MH_NARROW + (1 - MH_NARROW) * Math.min(1, Math.max(0, (-0.7 - y) / 0.5));
      x = -0.09 + (x + 0.09) * nk;
    }
    p.setXYZ(i, x, y, z);
  }
  // 表情の差も顔の幅に合わせる（横は顔の幅と細め、縦と前はそのまま）
  if (g.morphAttributes.position) g.morphAttributes.position = g.morphAttributes.position.map((a) => { const b = a.clone(), kx = w * (HEAD.mh ? MH_NARROW : 1); for (let i = 0; i < b.count; i++) b.setX(i, b.getX(i) * kx); return b; });
  g.computeVertexNormals();
  headGeos.set(key, g);
  return g;
}

const scalpGeos = new Map();
// 兜をかぶる頭：眉より上を低く押し下げ、少し内へ寄せて鉢の内に収める（穴を開けると切り口が見えるので、形を縮める）
function clipScalp(g) {
  if (scalpGeos.has(g.uuid)) return scalpGeos.get(g.uuid);
  const out = g.clone(), p = out.attributes.position = g.attributes.position.clone();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > SCALP.y) {
      const t = y - SCALP.y;
      y = SCALP.y + t * SCALP.ky;
      const k = 1 - SCALP.kin * Math.min(1, t / 1.2);
      x *= k; z = SCALP.zc + (z - SCALP.zc) * k;
    }
    p.setXYZ(i, x, y, z);
  }
  out.computeVertexNormals();
  scalpGeos.set(g.uuid, out);
  return out;
}
// 頭の座標（スキャン：眉は y≈2.0、顔の前は z≈2）。眉の少し上から上を ky 倍に低く、kin だけ内へ
const SCALP = { y: 2.15, ky: 0.35, kin: 0.12, zc: 0.2 };
// 開いた目：スキャンの顔は目を閉じているので、まぶたの上に白目・黒目・上まぶた・まつげの影を置く（スキャンの頭の座標で）
const EYE = { geo: null, mats: null };
function addEyes(hm, F) {
  if (!EYE.geo) {
    const white = new THREE.SphereGeometry(1, 16, 10); white.scale(0.22, 0.075, 0.06);
    const iris = new THREE.SphereGeometry(1, 12, 8); iris.scale(0.1, 0.095, 0.03);
    const pupil = new THREE.SphereGeometry(1, 8, 6); pupil.scale(0.042, 0.042, 0.012);
    const lid = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); lid.scale(0.29, 0.07, 0.085);
    const lash = new THREE.TorusGeometry(1, 0.06, 4, 16, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
    const lower = new THREE.TorusGeometry(1, 0.1, 4, 14, Math.PI * 0.8); lower.rotateZ(Math.PI * 1.1); lower.scale(0.24, 0.07, 0.06);
    EYE.geo = { white, iris, pupil, lid, lash, lower };
    EYE.mats = {
      white: new THREE.MeshStandardMaterial({ color: 0x74695c, roughness: 0.3 }),
      iris: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.15 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.1 }),
      lash: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }),
    };
  }
  // まぶたは目のくぼみの影の中（顔の肌より暗く。明るいと目の上に貼った帯に見える）
  const skinM = EYE.lidM || (EYE.lidM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4e3528), roughness: 0.6 }));
  const w = F.w || 1, open = 1 / (F.eye || 1), esp = (F.esp ?? 1) - 1;
  for (const cx of [-0.69, 0.51]) {
    const g = new THREE.Group();
    g.position.set(cx * w + Math.sign(cx + 0.09) * esp * 0.6, 1.72, 1.965 - EYE_SINK);
    g.rotation.y = (cx < -0.09 ? -1 : 1) * 0.22;
    const add = (geo, mat, x, y, z, sy = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m; };
    add(EYE.geo.white, EYE.mats.white, 0, 0, 0, open);
    add(EYE.geo.iris, EYE.mats.iris, 0.01, 0.006, 0.045, open);
    add(EYE.geo.pupil, EYE.mats.pupil, 0.01, 0.006, 0.068, open);
    // 上まぶたは黒目の上を少し覆う（白目が黒目を囲む見開いた目にしない）
    add(EYE.geo.lid, skinM, 0, 0.042 + 0.02 * (1 - open), 0.004);
    add(EYE.geo.lash, EYE.mats.lash, 0, 0.018, 0.012, open);
    add(EYE.geo.lower, skinM, 0, -0.004, 0.006, open);
    hm.add(g);
  }
}

// ---------------- 人を作る ----------------
// 部品を骨に付ける。体の座標（立ち姿）で作った部品を、その骨の立ち姿の位置に合わせて置く
// MakeHuman の頭の目玉：まぶたの穴の奥に、白目と黒目を描いた球を二つ（一つの形・一つの材質）。形は作り分けと顔の幅ごとに一つ
const EYE_MH = { geos: new Map(), mat: null };
function addEyesMH(hm, key, F) {
  const vi = mhPick(key, F), E = HEAD.eyes && HEAD.eyes[vi];
  if (!E) return;
  const w = F.w || 1, esp = (F.esp ?? 1) - 1;
  const gk = vi + '|' + w.toFixed(2) + '|' + esp.toFixed(2);
  if (!EYE_MH.geos.has(gk)) {
    const gs = [];
    for (const c of [E.l, E.r]) {
      const g = new THREE.SphereGeometry(E.rad * 0.96, 20, 14);
      // 球の前（+z）が黒目：uv の u=0.25 が +z。外へ少し向ける
      const sx = Math.sign(c[0] + 0.09) || 1;
      g.rotateY(sx * 0.08);
      g.translate((-0.09 + (c[0] + 0.09) * MH_NARROW) * w + sx * esp * 0.55, c[1], c[2] - E.rad * 0.06);
      gs.push(g);
    }
    EYE_MH.geos.set(gk, mergeGeometries(gs));
  }
  if (!EYE_MH.mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    // 白目：真っ白にしない（少し黄みの灰）。目頭・目尻へ赤み
    g.fillStyle = '#7f7466'; g.fillRect(0, 0, 256, 128);
    const cx = 64, cy = 64;
    const gr = g.createRadialGradient(cx, cy, 10, cx, cy, 60); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,60,50,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    // 黒目（焦げ茶）と瞳。縁は暗く
    // 黒目は眼球の幅の半分ほど（小さい黒目は白目が広く見え、驚いた人形の目になる）
    const ir = g.createRadialGradient(cx, cy, 3, cx, cy, 20); ir.addColorStop(0, '#1a0f07'); ir.addColorStop(0.6, '#2a190d'); ir.addColorStop(0.88, '#1a0f08'); ir.addColorStop(1, '#0a0604');
    g.fillStyle = ir; g.beginPath(); g.ellipse(cx, cy, 20, 20, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050302'; g.beginPath(); g.ellipse(cx, cy, 7, 7, 0, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    EYE_MH.mat = new THREE.MeshPhysicalMaterial({ map: t, color: 0xc8c0b8, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.7 });
    // 目はまぶたと眼窩の陰の中：上ほど暗く（白目が光って浮かないよう）。目の玉の上半分は上まぶたの影
    EYE_MH.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying float vEyY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEyY = normal.y;');
      sh.fragmentShader = 'varying float vEyY;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n float eyS = mix(1.0, 0.6, smoothstep(-0.1, 0.6, vEyY));\n reflectedLight.directDiffuse *= eyS; reflectedLight.indirectDiffuse *= eyS * 0.85;\n // 空の映り込みは瞳の上の小さな照りだけ（目の玉いっぱいに灰色の空が映ると、青白く光る人形の目になる）。上まぶたと眼窩の陰で上ほど消す\n reflectedLight.indirectSpecular *= 0.35 * eyS * eyS;\n #ifdef USE_CLEARCOAT\n clearcoatSpecularIndirect *= 0.3 * eyS * eyS;\n #endif');
    };
    EYE_MH.mat.customProgramCacheKey = () => 'mheye';
    EYE_MH.mat.userData.humanBatch = true;
  }
  const m = new THREE.Mesh(EYE_MH.geos.get(gk), EYE_MH.mat);
  m.frustumCulled = false; m.receiveShadow = true;
  hm.add(m);
}
// 口の中：開いた唇の奥は暗い口の洞（頭の裏の面が覗かないよう）、上と下の歯（MakeHuman の歯の形。下の歯は表情の差で顎と回る）
const MOUTH_MH = { geos: new Map(), teethM: null };
function addMouthMH(hm, key, F) {
  const vi = mhPick(key, F), w = F.w || 1;
  const gk = vi + '|' + w.toFixed(2);
  if (!MOUTH_MH.teethM) {
    // 歯：真っ白にしない（黄ばみと、奥ほど暗く）。口の洞（cav が 1 の所）は暗い赤黒
    MOUTH_MH.teethM = new THREE.MeshStandardMaterial({ color: 0x6e6352, roughness: 0.75 });
    MOUTH_MH.teethM.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float cav;\nvarying vec3 vTp;\nvarying float vCav;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTp = position; vCav = cav;');
      // 一本ずつの歯の境（細い暗い筋）と、歯の根の歯茎の赤み。奥の歯と口の奥は陰に沈む（白い塊に見せない）
      sh.fragmentShader = 'varying vec3 vTp;\nvarying float vCav;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float tx = abs(vTp.x + 0.09) * 5.2, gap = smoothstep(0.08, 0.0, abs(fract(tx) - 0.5) - 0.42);
        diffuseColor.rgb *= (1.0 - 0.3 * gap) * (0.75 + 0.25 * smoothstep(0.45, 0.1, abs(vTp.y - 0.17)));
        float gum = smoothstep(0.32, 0.5, abs(vTp.y - 0.17));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.065, 0.055), gum * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.035, 0.03), vCav);`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n float tk = smoothstep(1.35, 1.95, vTp.z) * smoothstep(0.9, 0.3, abs(vTp.x + 0.09)) * (1.0 - vCav); reflectedLight.directDiffuse *= tk * 0.45; reflectedLight.indirectDiffuse *= 0.1 + 0.35 * tk; reflectedLight.directSpecular *= tk; reflectedLight.indirectSpecular *= tk;');
    };
    MOUTH_MH.teethM.customProgramCacheKey = () => 'mhteeth';
  }
  if (!MOUTH_MH.geos.has(gk)) {
    const t = HEAD.teeth && HEAD.teeth[vi];
    let g = null;
    if (t) {
      // 歯と口の洞（歯の少し奥の、横に長い楕円の球）を一つの形に（描く回数を一つに）
      t.computeBoundingBox(); const bb = t.boundingBox, kx = w * MH_NARROW;
      const cg = new THREE.SphereGeometry(1, 12, 8); cg.deleteAttribute('uv'); cg.deleteAttribute('normal');
      cg.scale(0.55 * kx, 0.42, 0.5); cg.translate(-0.09, (bb.min.y + bb.max.y) / 2 - 0.05, bb.min.z - 0.4);
      const tg = t.clone(); tg.deleteAttribute('normal');
      const p = tg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, -0.09 + (p.getX(i) + 0.09) * kx);
      const nT = p.count, nC = cg.attributes.position.count;
      const P = new Float32Array((nT + nC) * 3); P.set(p.array, 0); P.set(cg.attributes.position.array, nT * 3);
      const I = [...tg.index.array, ...Array.from(cg.index.array, (i) => i + nT)];
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      const C = new Float32Array(nT + nC); C.fill(1, nT); g.setAttribute('cav', new THREE.BufferAttribute(C, 1));
      g.setIndex(I);
      if (t.morphAttributes.position) {
        g.morphAttributes.position = t.morphAttributes.position.map((a) => { const D = new Float32Array((nT + nC) * 3); for (let i = 0; i < nT; i++) { D[i * 3] = a.getX(i) * kx; D[i * 3 + 1] = a.getY(i); D[i * 3 + 2] = a.getZ(i); } return new THREE.BufferAttribute(D, 3); });
        g.morphTargetsRelative = true;
      }
      g.computeVertexNormals();
    }
    MOUTH_MH.geos.set(gk, g);
  }
  const G = MOUTH_MH.geos.get(gk);
  // 口を閉じている間は描かない（描く回数を増やさない）
  if (G) { const m = new THREE.Mesh(G, MOUTH_MH.teethM); m.frustumCulled = false; m.visible = false; hm.add(m); hm.userData.teeth = m; }
}
// 表情の値（x 口を開く・y 痛み・z 怒り）を、顔と歯の形の差の重みへ
function setFaceMorph(h) {
  const m = h.faceM, E = h.expr;
  if (!m || !m.morphTargetInfluences || !E) return;
  const I = m.morphTargetInfluences;
  // 痛みと叫びが重なる時は、叫びの顎を少し閉じる（食いしばって歯を剥く）
  I[0] = E.x * (1 - 0.35 * Math.min(1, E.y)); I[1] = E.y; I[2] = E.z * (1 - 0.5 * Math.min(1, E.y));
  const t = m.userData.teeth;
  if (t && t.morphTargetInfluences) { t.morphTargetInfluences[0] = I[0]; t.morphTargetInfluences[1] = I[1]; t.morphTargetInfluences[2] = I[2]; t.visible = I[0] + I[1] > 0.04; }
}

export { hatMats, hatFaceMat, hairGeos, HAIR_MATS, addHair, EYE_SINK, headGeos, headGeo, scalpGeos, clipScalp, addEyes, EYE_MH, addEyesMH, MOUTH_MH, addMouthMH, setFaceMorph };
