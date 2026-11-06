// 人の処理：手。外部向けの入口は humans.js。
import * as THREE from 'three';
import { SRC, HUM, gc } from './humans_shared.js';

// ---------------- 本人の写実の手（MakeHuman の左右の手。tools/mhhand.mjs） ----------------
// 見本の体（Soldier.glb）の手は角ばった低い形で、一人称で目の前に来ると肌色の塊に見える。本人だけ MakeHuman の手（指の節・爪・甲の筋）に替える
// 形は MakeHuman の座標で持ち、骨の区間（前腕・手・指の三節）ごとに、その区間の節から見本の体の骨の立ち姿へ移して、体の骨に付けて描く（指の曲げは体の骨のまま）
let MHHAND = null;
function prepHand(gl, tex) {
  const ex = gl.parser.json.extras || {};
  if (!ex.bones || !ex.joints) return;
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const src = {};
  gl.scene.traverse((o) => { if (o.isMesh) src[o.name] = o.geometry; });
  if (!src.Right || !src.Left) return;
  MHHAND = { src, bones: ex.bones, joints: ex.joints, tex, geo: undefined, mats: new Map() };
}
// 区間の向き（x：節から先の節へ、y：手のひらの向き、z：その二つに直角）の行列。戻りは区間の長さ
function mhFrame(a, c, n, ref, out) {
  const X = new THREE.Vector3().subVectors(c, a), len = X.length();
  X.multiplyScalar(1 / len);
  const Y = (Math.abs(n.dot(X)) > 0.95 ? ref : n).clone();
  Y.addScaledVector(X, -Y.dot(X)).normalize();
  out.makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)).setPosition(a);
  return len;
}
// 左右の手を一つの形に（見本の体の立ち姿の座標）。一度だけ作って使い回す
function handGeo() {
  if (MHHAND.geo !== undefined) return MHHAND.geo;
  MHHAND.geo = null;
  const sk = SRC.body.skeleton, BN = SRC.bname, NB = MHHAND.bones.length;
  // 骨の立ち姿の行列（体の形の座標）。指先の骨や重みの無い骨は体の骨の並びに無いので、親の骨の行列に自分の行列を掛けて求める
  const nodes = {};
  SRC.scene.traverse((o) => { nodes[o.name.replace(/^mixamorig:?/, '')] = o; });
  const bindOf = (n) => {
    const i = BN.indexOf(n);
    if (i >= 0) return new THREE.Matrix4().copy(sk.boneInverses[i]).invert();
    const o = nodes[n]; if (!o || !o.parent) return null;
    const pm = bindOf(o.parent.name.replace(/^mixamorig:?/, ''));
    o.updateMatrix();
    return pm ? pm.multiply(o.matrix) : null;
  };
  const inv = (n) => { const i = BN.indexOf(n); if (i >= 0) return sk.boneInverses[i]; const m = bindOf(n); return m ? m.invert() : null; };
  const posOf = (n) => { const m = bindOf(n); return m ? new THREE.Vector3().setFromMatrixPosition(m) : null; };
  const end = (b) => (b === 'ForeArm' ? 'Hand' : b === 'Hand' ? 'HandMiddle1' : b.replace(/\d$/, (d) => String(+d + 1)));
  const iI = MHHAND.bones.indexOf('HandIndex1'), iP = MHHAND.bones.indexOf('HandPinky1');
  const palm = (S) => { const r = new THREE.Vector3().subVectors(S[iI][0], S[iP][0]); const n = new THREE.Vector3().subVectors(S[iI][0], S[1][0]).cross(new THREE.Vector3().subVectors(S[iP][0], S[1][0])).normalize(); return [n, r.clone().normalize(), r.length()]; };
  const out = { P: [], N: [], U: [], J: [], W: [], I: [], K: [] }, names = [], invs = [];
  const v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3(), nn = new THREE.Vector3(), an = new THREE.Vector3();
  for (const [si, side] of [[0, 'Right'], [1, 'Left']]) {
    const g = MHHAND.src[side];
    const segM = MHHAND.joints[side].map((j) => [new THREE.Vector3(j[0], j[1], j[2]), new THREE.Vector3(j[3], j[4], j[5])]);
    const segS = MHHAND.bones.map((b) => [posOf(side + b), posOf(side + end(b))]);
    if (segS.some(([a, c]) => !a || !c)) { HUM.handErr = "骨が無い " + MHHAND.bones.filter((b, i) => !segS[i][0] || !segS[i][1]).join(","); return null; }
    const [nM, rM, wM] = palm(segM), [nS, rS, wS] = palm(segS);
    // 太さ：手のひらは見本の体の手の幅に合わせ、指と前腕は手の長さの比で（見本の体の手は幅が広く、幅で太らせると指が芋虫のように太る）
    const sw = wS / wM, Ms = [], Rs = [];
    let kL = 0, kN = 0; for (let b = 2; b < NB; b++) { kL += segS[b][0].distanceTo(segS[b][1]); kN += segM[b][0].distanceTo(segM[b][1]); }
    const kG = kL / kN;
    MHHAND.unit = kG;
    // 手甲の所（手の甲の真ん中：手首の少し先から指の付け根の手前まで、人差し指から小指の幅の内）。指の曲がる向きの逆が甲
    let curl = 0; for (let b = 5; b < NB; b++) curl += new THREE.Vector3().subVectors(segM[b][1], segM[b][0]).dot(nM);
    const dors = nM.clone().multiplyScalar(curl > 0 ? -1 : 1), hA = segM[1][0], hD = new THREE.Vector3().subVectors(segM[1][1], hA), hL2 = hD.lengthSq();
    const mid = new THREE.Vector3().addVectors(segM[iI][0], segM[iP][0]).multiplyScalar(0.5);
    for (let b = 0; b < NB; b++) {
      const FM = new THREE.Matrix4(), FS = new THREE.Matrix4();
      const lM = mhFrame(segM[b][0], segM[b][1], nM, rM, FM), lS = mhFrame(segS[b][0], segS[b][1], nS, rS, FS);
      Ms.push(FS.clone().multiply(new THREE.Matrix4().makeScale(lS / lM, kG, b === 1 ? sw : kG)).multiply(FM.clone().invert()));
      Rs.push(new THREE.Matrix3().setFromMatrix4(FS).multiply(new THREE.Matrix3().setFromMatrix4(FM).transpose()));
      names.push(side + MHHAND.bones[b]); invs.push(inv(side + MHHAND.bones[b]));
    }
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, JJ = g.attributes._joints, WW = g.attributes._weights;
    const base = out.P.length / 3;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i);
      acc.set(0, 0, 0); an.set(0, 0, 0);
      let ws = 0; const jb = [0, 0], wb = [0, 0];
      for (let k = 0; k < 2; k++) {
        const w = gc(WW, i, k); if (w <= 0) continue;
        const b = gc(JJ, i, k);
        acc.addScaledVector(t.copy(v).applyMatrix4(Ms[b]), w);
        an.addScaledVector(t.copy(nn).applyMatrix3(Rs[b]), w);
        jb[k] = si * NB + b; wb[k] = w; ws += w;
      }
      acc.multiplyScalar(1 / ws); an.normalize();
      out.P.push(acc.x, acc.y, acc.z); out.N.push(an.x, an.y, an.z); out.U.push(U.getX(i), U.getY(i));
      out.J.push(jb[0], jb[1], 0, 0); out.W.push(wb[0] / ws, wb[1] / ws, 0, 0);
      {
        const tt = t.copy(v).sub(hA).dot(hD) / hL2, lat = Math.abs(t.copy(v).sub(mid).dot(rM)) / (wM * 0.5), up = nn.dot(dors);
        const sm = (a, b, x) => { const q = Math.max(0, Math.min(1, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
        out.K.push(sm(0.0, 0.12, tt) * (1 - sm(0.78, 0.9, tt)) * (1 - sm(0.95, 1.2, lat)) * sm(0.05, 0.35, up), si);
      }
    }
    const ix = g.index;
    for (let i = 0; i < ix.count; i++) out.I.push(base + ix.getX(i));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.U, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.J, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.W, 4));
  geo.setAttribute('tk', new THREE.Float32BufferAttribute(out.K, 2));
  geo.setIndex(out.I);
  MHHAND.names = names; MHHAND.inv = invs;
  return (MHHAND.geo = geo);
}
// 見本の体の肘（右・左）と、肘から手首への向き（体の形の座標 ×0.01 ＝ 体の材質の vBind の座標）
let FORE_AX = null;
function foreAxes() {
  if (FORE_AX) return FORE_AX;
  const sk = SRC.body.skeleton, BN = SRC.bname, bi = SRC.body.bindMatrixInverse;
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[BN.indexOf(n)]).invert()).applyMatrix4(bi).multiplyScalar(0.01);
  const e = [], d = [];
  for (const sd of ['Right', 'Left']) { const a = at(sd + 'ForeArm'), b = at(sd + 'Hand'); e.push(a); d.push(b.sub(a).normalize()); }
  return (FORE_AX = { e, d });
}

export { MHHAND, prepHand, handGeo, foreAxes };
