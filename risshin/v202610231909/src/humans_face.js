// 人の処理：顔の取り付け。外部向けの入口は humans.js。
import { SRC, HEAD, restMatrix } from './humans_shared.js';
import { faceStyle, headMaterial, headCompile } from './humans_face_materials.js';
import { clipScalp, headGeo, hatFaceMat, addHair, addEyesMH, addEyes, addMouthMH, EYE_SINK } from './humans_face_geometry.js';
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function scanFace0(h, key, L, F, full) {
  const hd = SRC.rest.Head;
  F = faceStyle(full ? key : 'c' + ((L.face | 0) % 12), F);
  let gk = full ? key : 'c' + ((L.face | 0) % 12);
  // 兵の顔の形は、顔の型（12）ごとにさらに三通りへ散らす（幅・えら・顎・鼻・頬骨を少しずつ。隣に同じ顔が並ばないよう）。絵は型ごとに同じ
  if (!full) {
    const v = Math.floor(((h.seed || 0) * 13.7) % 1 * 3);
    const J = [[-0.03, 0.08, 0.06, 0, 0.1], [0, -0.07, -0.05, 0.08, -0.05], [0.035, 0, 0, -0.07, 0]][v];
    F = { ...F, w: (F.w || 1) * (1 + J[0]), jaw: (F.jaw || 1) * (1 + J[1]), chin: (F.chin || 1) * (1 + J[2]), nose: (F.nose ?? 1) * (1 + J[3]), cheek: (F.cheek ?? 1) * (1 + J[4]) };
    gk += '|v' + v;
  }
  const hat = L.hat || '';
  // 笠の遮光を残しつつ、目鼻と頬へ空からの回り込みを残す。
  const ao = hat.startsWith('jingasa') ? 0.78 : hat.startsWith('kabuto') ? 0.8 : 0;
  // スキャンの兜をかぶる武将：兜に隠れる頭（眉より上と、耳の後ろ）は描かない（鉢の内から頭の肌が覗かないよう）
  const hg = h.helmScan ? clipScalp(headGeo(gk, F)) : headGeo(gk, F);
  // 兵は一人ずつ汚れ・汗・日焼けを変える（絵は型ごとに同じで、材質の値だけ四通り）
  // 武将と本人も、戦場の埃と汗を薄く（いちばん軽い型）
  const fv = full ? 0 : Math.floor((((h.seed || 0) * 7.31) % 1) * 4);
  const hm = new THREE.Mesh(hg, ao || h.helmScan || fv >= 0 ? hatFaceMat(headMaterial(key, L, F), h.helmScan ? 0.8 : ao, fv) : headMaterial(key, L, F));
  // 表情は人ごと：材質を一人に一つ写す（形の作りと絵は同じ。値だけ別）
  if (MEM_TIGHT) {
    h.expr = new THREE.Vector4(0, 0, 0, 0);   // 表情の形だけ個別。肌の材質・絵は共有する。
  } else {
    const b = hm.material, m2 = b.clone();
    m2.userData = { ...(b.userData || {}), ex: { value: new THREE.Vector4(0, 0, 0, 0) } };
    m2.onBeforeCompile = headCompile; m2.customProgramCacheKey = () => 'scanhead';
    hm.material = m2; h.expr = m2.userData.ex.value;
  }
  // 髪（横と後ろの髪の房）と髷：兜の中と僧は付けない
  if (!h.helmScan && !hat.startsWith('kabuto') && !L.monk && (!L.sohei || L.kosode)) addHair(hm, hg, F, !full);
  const k = HEAD.k;
  const fitF = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeTranslation(0, 0.048, 0.006)).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -1.2, -0.1));
  hm.castShadow = true; hm.receiveShadow = true;
  if (HEAD.mh) addEyesMH(hm, gk, F); else if (full) addEyes(hm, F); else addEyesFast(hm, F, soldierTint(L.skin || 0xb58c68));
  if (HEAD.mh && HEAD.exMorph) { h.faceM = hm; addMouthMH(hm, gk, F); }
  const M = new THREE.Matrix4().copy(restMatrix('Head')).invert().multiply(fitF);
  hm.matrixAutoUpdate = false; hm.matrix.copy(M); hm.frustumCulled = !full;
  h.bones.Head.add(hm);
  // 遅れて作った顔も、最初に描く前に頭の位置と縮尺へそろえる。
  // 静止中の骨の更新を省いたコマに、原寸の顔だけ原点へ残さない。
  hm.matrixWorldNeedsUpdate = true;
  hm.updateWorldMatrix(true, true);
  h.mw0 = null;
  return hm;
}
// 目の下頬（面頬）：実写の顔の形から、目の下・頬・鼻・顎の所を少し浮かせて鉄の打ち出しの面にする。口もとは開け、口の上に打ち出しの髭。裏は赤漆
const menpoGeos = new Map();
let MENPO_TEX = null;
const menpoMats = new Map();
function scanMenpo(hm, key, col) {
  key = key + '|' + hm.geometry.uuid;   // 顔の形（兵は型ごとに三通り）ごとに作る
  if (!menpoGeos.has(key)) {
    const g = hm.geometry, pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index;
    const keep = [];
    const mTop = (x0) => 1.4 + 0.24 * Math.exp(-(x0 * x0) / (2 * 0.2 * 0.2));   // 上の縁：目の下。鼻筋は目の間まで
    for (let i = 0; i < idx.count; i += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { const v = idx.getX(i + k); x += pos.getX(v) / 3; y += pos.getY(v) / 3; z += pos.getZ(v) / 3; }
      const x0 = Math.abs(x + 0.09);
      const top = mTop(x0);
      const mouth = x0 < 0.62 - (y - 0.42) * (y - 0.42) * 0.9 && y > 0.1 && y < 0.72;
      if (z > 0.7 - (1.45 - y) * 0.25 && y < top && y > -1.5 && x0 < 2.15 && !mouth) keep.push(i);
    }
    // 打ち出しの凹凸：顔をなぞるだけだと平らな板に見える。鉄を打ち出した面頬らしく、鼻筋を高く、頬骨を張り、頬に皺（しわ）を刻み、口の縁を外へ反らせ、顎を張る
    const G1 = (a, s) => Math.exp(-(a * a) / (2 * s * s));
    const relief = (x0, y) => {
      const nose = 0.13 * G1(x0, 0.16) * G1(y - 1.12, 0.3);                 // 鼻筋（高く細く）
      const cheek = 0.16 * G1(x0 - 1.3, 0.3) * G1(y - 1.1, 0.26);          // 頬骨
      let wr = 0;                                                            // 頬の皺：口の脇から頬へ斜めに三筋
      if (x0 > 0.75 && x0 < 1.95) for (let k = 0; k < 3; k++) { const yc = 0.95 - (x0 - 0.75) * 0.35 - k * 0.2; wr -= 0.075 * G1(y - yc, 0.06) * (1 - Math.abs(x0 - 1.35) / 0.6); }
      const r = Math.hypot(x0 / 0.62, (y - 0.42) / 0.32);                    // 口の縁：外へ反る唇
      const lip = r > 0.95 && r < 1.45 ? 0.17 * (1 - (r - 0.95) / 0.5) ** 1.5 : 0;
      const chin = 0.07 * G1(x0, 0.45) * G1(y + 0.55, 0.25);                 // 顎
      return nose + cheek + wr + lip + chin;
    };
    const DISP = (x0, y, off, inner) => {
      // 口の上の打ち出しの髭：少し高く盛る
      const mus = x0 < 0.85 && y > 0.7 && y < 0.92 ? 0.1 * Math.cos((y - 0.81) * 14) * (1 - x0 / 0.85) : 0;
      // 鼻の所は顔の鼻のまわりを浮かせすぎない（打ち出しの鼻筋は relief で立てる）
      const base = off * (1 - 0.55 * G1(x0, 0.3) * G1(y - 1.1, 0.35));
      return base + (inner ? relief(x0, y) * 0.8 : mus + relief(x0, y));
    };
    const build = (off, inner) => {
      // 頂点を分け合う形にして、法線をなめらかに（打ち出しの面が角張った多面体に見えないよう）
      const P = [], C = [], I = [], at = new Map();
      for (const i of keep) {
        const tri = [0, 1, 2].map((k) => idx.getX(i + k));
        const order = inner ? [tri[0], tri[2], tri[1]] : tri;
        for (const v of order) {
          if (!at.has(v)) {
            // 上の縁ははみ出た頂点を縁の線にそろえる（三角のぎざぎざを消す）
            const x = pos.getX(v), x0 = Math.abs(x + 0.09), y = Math.min(pos.getY(v), mTop(x0));
            const d = DISP(x0, y, off, inner);
            at.set(v, P.length / 3);
            P.push(x + nrm.getX(v) * d, y + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d);
            // 窪み（皺・口の縁の内・鼻の脇）は暗く、高い所（鼻筋・頬骨・唇）は明るく：凹凸を色でも見せる
            const k = Math.max(0.35, Math.min(1.05, 0.72 + relief(x0, y) * 3.2));
            C.push(k, k, k);
          }
          I.push(at.get(v));
        }
      }
      const o = new THREE.BufferGeometry();
      o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      o.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      o.setIndex(I);
      o.computeVertexNormals();
      return o;
    };
    // 縁の厚み：表の面と裏の面を、形の縁（一つの三角にしか使われない辺）でつなぐ（貼った板でなく、打ち出した鉄の厚みに）
    const P3 = (v, off, inner) => {
      const x = pos.getX(v), x0 = Math.abs(x + 0.09), y = Math.min(pos.getY(v), mTop(x0));
      const d = DISP(x0, y, off, inner);
      return [x + nrm.getX(v) * d, y + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d];
    };
    const ecount = new Map();
    const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    for (const i of keep) { const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]; for (let e = 0; e < 3; e++) { const k2 = ek(t[e], t[(e + 1) % 3]); ecount.set(k2, (ecount.get(k2) || 0) + 1); } }
    const RP = [];
    for (const i of keep) {
      const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      for (let e = 0; e < 3; e++) {
        const va = t[e], vb = t[(e + 1) % 3];
        if (ecount.get(ek(va, vb)) !== 1) continue;
        const oa = P3(va, 0.2, false), ob = P3(vb, 0.2, false), ia = P3(va, 0.15, true), ib = P3(vb, 0.15, true);
        RP.push(...oa, ...ib, ...ob, ...oa, ...ia, ...ib);
      }
    }
    const rim = new THREE.BufferGeometry();
    rim.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
    rim.computeVertexNormals();
    menpoGeos.set(key, { out: build(0.2, false), inn: build(0.15, true), rim });
  }
  const G = menpoGeos.get(key);
  // 鉄の地：錆と擦れのむら（小さな絵を一度だけ作る）
  if (!MENPO_TEX) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#c8c0b8'; g.fillRect(0, 0, 128, 128);
    let a = 7; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? `rgba(120,70,40,${0.05 + r() * 0.1})` : `rgba(30,28,26,${0.05 + r() * 0.12})`; g.beginPath(); g.arc(r() * 128, r() * 128, 0.4 + r() * 1.6, 0, 7); g.fill(); }
    // 擦れ（細い傷）
    g.lineWidth = 0.5; for (let i = 0; i < 120; i++) { const x = r() * 128, y = r() * 128; g.strokeStyle = `rgba(235,228,220,${0.1 + r() * 0.15})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 5); g.stroke(); }
    MENPO_TEX = new THREE.CanvasTexture(c); MENPO_TEX.colorSpace = THREE.SRGBColorSpace; MENPO_TEX.wrapS = MENPO_TEX.wrapT = THREE.RepeatWrapping;
  }
  if (!G.out.attributes.uv) for (const gg of [G.out, G.inn]) { const p = gg.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.3; } gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  // 漆を掛けた鉄：真っ黒の艶消しだと、黒い板を貼ったように形が見えない。少し明るく、照りを強くして、打ち出しの頬・鼻・髭の形を光で見せる
  // 漆の艶：上塗りの透明な層（clearcoat）で、鼻筋・頬骨・唇の縁に細い照りが走るように
  if (!menpoMats.has(col)) menpoMats.set(col, [new THREE.MeshStandardMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0x6a5e52), 0.5), map: MENPO_TEX, vertexColors: true, roughness: 0.4, metalness: 0.45, envMapIntensity: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.3, metalness: 0, vertexColors: true })]);
  const [iron, red] = menpoMats.get(col);
  const a = new THREE.Mesh(G.out, iron), b = new THREE.Mesh(G.inn, red);
  if (!G.rim.attributes.uv) { const p = G.rim.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.3; } G.rim.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  const rimM = menpoMats.get(col + '|rim') || (menpoMats.set(col + '|rim', iron.clone()), menpoMats.get(col + '|rim'));
  rimM.side = THREE.DoubleSide; rimM.vertexColors = false;
  const c = new THREE.Mesh(G.rim, rimM);
  for (const m of [a, b, c]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; hm.add(m); }
}
// 兵の目：白目・黒目・まぶた・まつげを一つの形にまとめる（描く回数を一回に）
const eyeFast = new Map();
const EYE_FAST_MATS = new Map();
// いちばん多い肌の色（0xb58c68）の顔の材質の色。まぶたの色はこの肌に合わせて作ってあるので、他の肌はこの比で掛ける
const EYE_REF_INV = (() => { const c = soldierTint(0xb58c68); return new THREE.Color(1 / c.r, 1 / c.g, 1 / c.b); })();
function soldierTint(skin) {
  const sk = new THREE.Color(skin).getHSL({});
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  return new THREE.Color().setRGB(Math.min(255, 140 + tn.r * 110) / 255, Math.min(255, 150 + tn.g * 115) / 255, Math.min(255, 145 + tn.b * 110) / 255, THREE.SRGBColorSpace);
}
function addEyesFast(hm, F, tint = null) {
  // 目の開きは細めに（白目が広く見えると、貼った目の絵に見える。日焼けした兵の目は細く、影に沈む）
  const w = F.w || 1, open = 0.78 / (F.eye || 1);
  const key = w.toFixed(2) + '|' + open.toFixed(2);
  if (!eyeFast.has(key)) {
    const gs = [];
    const col = (g, hex) => {
      g = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    for (const cx of [-0.69, 0.51]) {
      const M = new THREE.Matrix4().makeTranslation(cx * w, 1.72, 1.965 - EYE_SINK).multiply(new THREE.Matrix4().makeRotationY((cx < -0.09 ? -1 : 1) * 0.22));
      const put = (g, hex, x, y, z, sy) => { g.scale(1, sy, 1); g.translate(x, y, z); g.applyMatrix4(M); gs.push(col(g, hex)); };
      const s = (rx, ry, rz, ws, hs, a, b) => { const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, b ?? Math.PI); g.scale(rx, ry, rz); return g; };
      // 白目は真っ白にしない（影の中の白目は灰色がかった黄み）。上下のまぶたが黒目の縁に掛かる（白目が黒目を囲むと、見開いた人形の目になる）
      put(s(0.22, 0.066, 0.06, 12, 8), 0x524a40, 0, 0, 0, open);
      // 目頭の赤み（涙丘）：白目の内の端に小さく
      put(s(0.05, 0.04, 0.035, 6, 4), 0x6e3a30, (cx < -0.09 ? 1 : -1) * 0.2, -0.004, 0.012, open);
      put(s(0.095, 0.085, 0.03, 10, 6), 0x24160e, 0.01, 0.006, 0.045, open);
      put(s(0.036, 0.036, 0.012, 6, 4), 0x050303, 0.01, 0.006, 0.068, open);
      put(s(0.29, 0.07, 0.085, 12, 6, 0, Math.PI * 0.55), 0x7e5842, 0, 0.043 + 0.02 * (1 - open), 0.004, 1);
      { const lo = s(0.28, 0.05, 0.08, 12, 5, 0, Math.PI * 0.5); lo.rotateZ(Math.PI); put(lo, 0x7e5842, 0, -0.04, -0.002, 1); }
      const lash = new THREE.TorusGeometry(1, 0.06, 4, 12, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
      put(lash, 0x2a2018, 0, 0.012, 0.014, open);
    }
    const g = new THREE.BufferGeometry();
    let n = 0; for (const x of gs) n += x.attributes.position.count;
    const Pp = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
    let o = 0;
    for (const x of gs) { Pp.set(x.attributes.position.array, o * 3); Nn.set(x.attributes.normal.array, o * 3); Cc.set(x.attributes.color.array, o * 3); o += x.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.computeBoundingSphere();
    eyeFast.set(key, g);
  }
  // まぶたの色を顔の肌の色（材質の色 tint）に合わせる：色の違うまぶたは、顔に貼った目の絵に見える。材質は肌の色ごとに一つ
  const tc = tint ? tint.getHexString() : '-';
  if (!EYE_FAST_MATS.has(tc)) { const mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, envMapIntensity: 0.8 }); if (tint) mm.color.copy(tint).multiply(EYE_REF_INV); mm.userData.humanBatch = true; EYE_FAST_MATS.set(tc, mm); }
  const m = new THREE.Mesh(eyeFast.get(key), EYE_FAST_MATS.get(tc));
  m.frustumCulled = false; m.receiveShadow = true;   // 笠の影の中の目は暗く（白目が光って見開いた目に見えないよう）
  hm.add(m);
  // 目のうるみ：白目と黒目の上の涙の膜。照りだけを足す（黒の色に加算）ので、空と日の小さな映り込みが瞳に乗る
  if (!eyeFast.has('wet|' + key)) {
    const gs = [];
    for (const cx of [-0.69, 0.51]) {
      const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); g.rotateX(Math.PI / 2);
      g.scale(0.235, 0.066 * open, 0.07); g.translate(0, -0.002, 0.012);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(cx * w, 1.72, 1.965).multiply(new THREE.Matrix4().makeRotationY((cx < -0.09 ? -1 : 1) * 0.22)));
      gs.push(g.toNonIndexed());
    }
    for (const g of gs) for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
    eyeFast.set('wet|' + key, mergeGeometries(gs));
  }
  if (!EYE_FAST_MATS.has('wet')) EYE_FAST_MATS.set('wet', new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, envMapIntensity: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  EYE_FAST_MATS.get('wet').userData.humanBatch = true;   // 照りを足すだけの膜は、描く順に関わらない。全員で一つの束に
  const wet = new THREE.Mesh(eyeFast.get('wet|' + key), EYE_FAST_MATS.get('wet'));
  wet.frustumCulled = false; wet.receiveShadow = true;
  hm.add(wet);
}

export { scanFace0, menpoGeos, MENPO_TEX, menpoMats, scanMenpo, eyeFast, EYE_FAST_MATS };
