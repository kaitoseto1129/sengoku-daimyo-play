// 人の処理：馬の形と読み込み。外部向けの入口は humans.js。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';


// ---------------- 本物の馬（骨の入った馬） ----------------
// ・形と動き：assets/horse_lite/horse.glb（tools/horse.mjs で軽くした物。src/asset_horse.js に base64 で入れてある）
// ・作者表記（CC BY 4.0）：This work is based on "Horse" by henrysteve973（docs/CREDITS.md）
// ・本人の馬・名のある武将の馬・カメラの近く（30m ほど）の馬だけを骨の入った馬にする。遠くは units.js の今の形のまま
// ・今の形の馬（buildHorse の root）の子に付け、今の形は隠す。動かすのは units.js の animateHorse から（HORSE_HOOK）
// ・洋鞍は描かず、和鞍（漆の前輪・後輪、鞍褥、障泥）・舌長鐙・手綱・胸繋と尻繋の房を骨に付けて作る
// ・毛色は色の絵（明るさだけにしてある）に色を掛けて、栗毛・鹿毛・青毛などにする
const HORSE = { on: true, ready: false, failed: false, near: 30, far: 34, max: 14, lod: 14 };
// 画質ごとの数（騎馬の突撃が一面の本物の馬に見えるよう「高」は多め）
// must：この近さより内の馬は、上限を越えても骨の入った馬にする
const HORSE_Q = { high: { near: 40, far: 44, max: 30, must: 32, mustMax: 60 }, mid: { near: 30, far: 34, max: 14, must: 27, mustMax: 36 }, low: { near: 0, far: 0, max: 1 }, lowN: { near: 16, far: 19, max: 3 } };
let HR = null;
const HS = 1.3 / 15.9;      // 元の形の単位 → m（肩の高さを 1.3m に）
const HX = 0.039;           // 元の形は左右が少しずれているので、真ん中へ
const SEAT_B = 'BN_Spine_01_03_03';
const CHEST_B = 'BN_Spine_03_05_05';
const HIP_B = 'BN_Pelvis_060_066';
const HEAD_B = 'BN_Head_01_029_028';
const POLL_B = 'BN_Head_00_016_015';
const LIP_B = 'BN_UP_Lip_030_029';
// 録った動きから別の足運びを作る（読み込みの時に一度だけ）。脚ごとに拍子をずらし（shift：一回りの割合。正で早まる）、
// 回りの振りを amp 倍に（fore＝前脚・hind＝後脚・body＝背と首。low は膝から下にさらに掛ける）
const LEG_RE = { LF: /BN_L_(Clavicle|UpperArm|Hand|Toe_042)|BN_l_Forearm/, RF: /BN_R_(Clavicle|UpperArm|Forearm|Hand|Toe_047)/, LH: /BN_L_(Thing|Calf|HorseLink|Foot|Toe_2)/, RH: /BN_R_(Thing|Calf|HorseLink|Foot|Toe_2)/ };
function gaitClip(src, name, shift, amp) {
  const T = src.duration, N = 48, times = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) times[i] = T * i / N;
  const q = new THREE.Quaternion(), m = new THREE.Quaternion(), d = new THREE.Quaternion(), q0 = new THREE.Quaternion(), ax = new THREE.Vector3();
  const tracks = src.tracks.map((tr) => {
    const bn = tr.name.split('.')[0], leg = Object.keys(LEG_RE).find((k) => LEG_RE[k].test(bn));
    const k = leg ? (amp[leg[1] === 'F' ? 'fore' : 'hind'] || 1) * (/Forearm|Calf/.test(bn) ? amp.low || 1 : /Hand|HorseLink|Foot|Toe/.test(bn) ? amp.tip ?? 1 : 1) : (amp.body && /Spine|Neck|Pelvis/.test(bn) ? amp.body : 1);
    const s = leg ? shift[leg] || 0 : 0;
    if ((!s && k === 1) || tr.times.length < 2) return tr;
    const it = tr.createInterpolant(), n = tr.getValueSize(), vals = new Float32Array((N + 1) * n);
    for (let i = 0; i <= N; i++) vals.set(it.evaluate((((times[i] + s * T) % T) + T) % T), i * n);
    if (k !== 1 && n === 4) {
      // 中心の形から回りの角を k 倍に。脚は地面を踏む真ん中の形（amp.cen：元の動きの一回りの割合）を中心にする（踏む脚が浮かない）
      if (leg && amp.cen) m.fromArray(it.evaluate(amp.cen[leg] * T));
      else {
        m.set(0, 0, 0, 0); q0.fromArray(vals, 0);
        for (let i = 0; i < N; i++) { q.fromArray(vals, i * 4); const sg = q.dot(q0) < 0 ? -1 : 1; m.set(m.x + q.x * sg, m.y + q.y * sg, m.z + q.z * sg, m.w + q.w * sg); }
        m.normalize();
      }
      for (let i = 0; i <= N; i++) {
        q.fromArray(vals, i * 4); d.copy(m).invert().multiply(q);
        if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
        const sn = Math.sqrt(Math.max(0, 1 - d.w * d.w));
        if (sn > 1e-5) { d.setFromAxisAngle(ax.set(d.x / sn, d.y / sn, d.z / sn), 2 * Math.acos(Math.min(1, d.w)) * k); q.copy(m).multiply(d).toArray(vals, i * 4); }
      }
    }
    return new tr.constructor(tr.name, times, vals);
  });
  return new THREE.AnimationClip(name, T, tracks);
}
// 鬣と尾：歩く姿に組んだ骨の上で、首の峰（体の形の一番上の線）から首の脇へ垂れる房と、尾の骨から地へ垂れる房を作る。
// 作った点は骨の動きの逆で縛りの形へ戻す（立ち姿と元の縛りの座標がずれていても、毛が地にもぐったり宙に浮いたりしない）。
// 抜き絵の粒は使わない。少ない面を全距離で共用し、骨・材質・描く回数は増やさない。
function horseHairGeometry(mesh, body, walk) {
  let root = mesh; while (root.parent && root.parent.parent) root = root.parent;
  const bones = mesh.skeleton.bones;
  // 骨の今の形を覚え、歩きの初めの形に組む（作り終えたら戻す）
  const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mixer = walk ? new THREE.AnimationMixer(root) : null;
  if (mixer) { mixer.clipAction(walk).play(); mixer.setTime(walk.duration * 0.1); }
  root.updateMatrixWorld(true);
  const bIdx = new Map(bones.map((b, i) => [b, i]));
  const bodyB = body.skeleton.bones;
  const wp = (nm) => { const b = bones.find((x) => x.name === nm); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  // 体の形の点（組んだ姿、根元の座標 m）
  const N = body.geometry.attributes.position.count, BP = new Float32Array(N * 3), v = new THREE.Vector3();
  const bSI = body.geometry.attributes.skinIndex, bSW = body.geometry.attributes.skinWeight, bPos = body.geometry.attributes.position;
  {
    const bmB = bodyB.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, body.skeleton.boneInverses[i]).multiply(body.bindMatrix));
    const u = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.set(0, 0, 0);
      for (let c = 0; c < 4; c++) { const w = bSW.getComponent(i, c); if (w > 0) v.addScaledVector(u.fromBufferAttribute(bPos, i).applyMatrix4(bmB[bSI.getComponent(i, c)]), w); }
      BP[i * 3] = v.x; BP[i * 3 + 1] = v.y; BP[i * 3 + 2] = v.z;
    }
  }
  const skinOf = (i) => { const si = [], sw = []; for (let c = 0; c < 4; c++) { const w = bSW.getComponent(i, c); if (w > 0.001) { si.push(bIdx.get(bodyB[bSI.getComponent(i, c)]) ?? 0); sw.push(w); } } while (si.length < 4) { si.push(0); sw.push(0); } return [si, sw]; };
  const P = [], UV = [], SI = [], SW = [], IX = [];
  const put = (p, uv, sk) => { P.push(p.x, p.y, p.z); UV.push(uv[0], uv[1]); SI.push(...sk[0]); SW.push(...sk[1]); };
  const quad = (a, b, c, d) => IX.push(a, b, c, b, d, c);
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // ---- 鬣 ----
  const withers = wp('BN_Spine_03_05_05'), poll = wp(POLL_B);
  if (withers && poll) {
    const z0 = withers.z - 0.06, z1 = poll.z - 0.05, NB = 30, xc = withers.x;
    const crest = [];
    for (let k = 0; k <= NB; k++) {
      const zc = z0 + (z1 - z0) * k / NB;
      let best = -1, by = -1e9;
      for (let i = 0; i < N; i++) { const x = BP[i * 3], y = BP[i * 3 + 1], z = BP[i * 3 + 2]; if (Math.abs(z - zc) < 0.025 && Math.abs(x - xc) < 0.03 && y > by) { by = y; best = i; } }
      if (best >= 0 && !crest.some((c) => c.i === best)) crest.push({ i: best, p: new THREE.Vector3(BP[best * 3], by, BP[best * 3 + 2]) });
    }
    // 首の脇の面：高さ y・前後 z の所で、首の外側（side の向き）の一番外の x
    const sideX = (y, z, side) => { let m = null; for (let i = 0; i < N; i++) { if (Math.abs(BP[i * 3 + 2] - z) < 0.03 && Math.abs(BP[i * 3 + 1] - y) < 0.03) { const x = BP[i * 3] * side; if (m === null || x > m) m = x; } } return m; };
    const side = 1, ROWS = 6;
    // 三枚重ね：首に沿う内の房・半房ずらした中の房・外へ膨らむ短い房（すだれの隙間と鋸の歯を見せない）
    for (let layer = 0; layer < 3; layer++) {
      for (let k = 0; k < crest.length; k++) {
        const c = crest[k], f = k / (crest.length - 1);
        const nxt = crest[Math.min(crest.length - 1, k + 1)].p, prv = crest[Math.max(0, k - 1)].p;
        const dir = new THREE.Vector3().subVectors(nxt, prv).normalize();
        const sk = skinOf(c.i);
        // 首の中ほどが長く、き甲と耳の際は短い。房ごとに長さを揃えない
        const L = (0.12 + 0.15 * Math.sin(Math.PI * Math.min(1, f * 1.1)) + 0.07 * rnd(k * 3 + layer)) * [1, 0.92, 0.7][layer];
        const w = 0.06 + 0.015 * rnd(k * 7 + layer);
        const base = P.length / 3;
        let xo = 0;
        for (let j = 0; j <= ROWS; j++) {
          const t = j / ROWS;
          const y = c.p.y + (j === 0 ? 0.03 : 0.018) - L * t;
          const z = c.p.z - L * t * 0.18 + (rnd(k * 11 + j) - 0.5) * 0.008 - (rnd(k * 5 + layer) - 0.5) * 0.05 * t + (layer === 1 ? 0.014 : 0);
          const sx = sideX(y, z, side);
          if (sx !== null) xo = Math.max(xo, sx * side - c.p.x * side + 0.008 + 0.028 * t + layer * 0.012);
          // 峰の上は向こう側から少し被せ、隙間を見せない
          const x = c.p.x + side * (j === 0 ? -0.024 + layer * 0.01 : xo);
          // 裾は細る（板の四角い端を見せない）
          const ww = w * (1 - 0.75 * Math.pow(t, 3)) * (1 + 0.2 * Math.sin(t * Math.PI));   // 毛先は細って尖る（裾を四角い板の端にしない）
          for (const s of [-1, 1]) put(new THREE.Vector3(x, y, z).addScaledVector(dir, s * ww * 0.5), [(s + 1) / 2, t], sk);
          if (j) { const a = base + (j - 1) * 2; quad(a, a + 1, a + 2, a + 3); }
        }
      }
    }
    // 前髪：耳の間から額へ垂れる房
    const head = wp(HEAD_B);
    let pi = 0, pd = 1e9;
    for (let i = 0; i < N; i++) { const d = (BP[i * 3] - poll.x) ** 2 + (BP[i * 3 + 1] - poll.y) ** 2 + (BP[i * 3 + 2] - poll.z) ** 2; if (d < pd) { pd = d; pi = i; } }
    const skP = skinOf(pi);
    if (head) for (let q = 0; q < 3; q++) {
      const a = poll.clone(); a.y += 0.03; a.z += 0.02; a.x += (q - 1) * 0.022;
      const d = head.clone().sub(a).normalize();
      const out = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
      const base = P.length / 3;
      for (let j = 0; j <= 4; j++) {
        const t = j / 4, p = a.clone().addScaledVector(d, 0.16 * t * (0.85 + 0.2 * rnd(q))).addScaledVector(out, 0.012 + 0.01 * t);
        const ww = 0.03 * (1 - 0.6 * t);
        for (const s of [-1, 1]) put(p.clone().add(new THREE.Vector3(s * ww * 0.5, 0, 0)), [(s + 1) / 2, t], skP);
        if (j) { const b0 = base + (j - 1) * 2; quad(b0, b0 + 1, b0 + 2, b0 + 3); }
      }
    }
  }
  // ---- 尾：尾の骨に沿って出て、下へ垂れる房。横向きと前後向きの板を混ぜ、どの向きからも厚く見せる ----
  const tb = TAIL_B.map((nm) => { const b = bones.find((x) => x.name === nm); return b ? { i: bIdx.get(b), p: new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) } : null; }).filter(Boolean);
  if (tb.length > 2) {
    const gN = tb[tb.length - 1].p;
    const yEnd = 0.36;   // 飛節の下ほどまで
    for (let s = 0; s < 14; s++) {
      const a = s * 2.399, rr = 0.012 + 0.02 * Math.sqrt(rnd(s * 5 + 1));
      const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr * 0.8;
      const along = s % 2 === 0;
      const yE = yEnd + 0.08 * rnd(s * 13) - 0.02;
      const base = P.length / 3, ROWS = 10;
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;
        // 上の四割半は骨の鎖に沿い、その先は下へ垂れる
        let p, bi;
        const tt = t / 0.45;
        if (tt <= 1) {
          const fk = tt * (tb.length - 1), k0 = Math.min(tb.length - 2, Math.floor(fk));
          p = tb[k0].p.clone().lerp(tb[k0 + 1].p, fk - k0); bi = tb[Math.round(fk)].i;
        } else {
          const u = (t - 0.45) / 0.55;
          p = gN.clone(); p.y = gN.y + (yE - gN.y) * u; p.z = gN.z - 0.04 * u; bi = tb[tb.length - 1].i;
        }
        const spread = 1 + 1.6 * t;
        p.x += ox * spread; p.z += oz * spread;
        const ww = (0.03 + 0.012 * rnd(s)) * (1 - 0.5 * t * t) * (t < 0.1 ? 0.6 + 4 * t : 1);
        const off = along ? new THREE.Vector3(0, 0, ww * 0.5) : new THREE.Vector3(ww * 0.5, 0, 0);
        const sk = [[bi, 0, 0, 0], [1, 0, 0, 0]];
        put(p.clone().sub(off), [0, t], sk); put(p.clone().add(off), [1, t], sk);
        if (j) { const b0 = base + (j - 1) * 2; quad(b0, b0 + 1, b0 + 2, b0 + 3); }
      }
    }
  }
  // 組んだ姿の点 → 縛りの形の点（頂点ごとに骨の重みの行列の逆を掛ける）
  const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i]));
  const S = new THREE.Matrix4(), bindInv = mesh.bindMatrix.clone().invert();
  for (let n = 0; n < P.length / 3; n++) {
    const o = S.elements; o.fill(0);
    for (let c = 0; c < 4; c++) { const w = SW[n * 4 + c]; if (w <= 0) continue; const e = bm[SI[n * 4 + c]].elements; for (let q = 0; q < 16; q++) o[q] += e[q] * w; }
    S.invert();
    v.set(P[n * 3], P[n * 3 + 1], P[n * 3 + 2]).applyMatrix4(S).applyMatrix4(bindInv);
    P[n * 3] = v.x; P[n * 3 + 1] = v.y; P[n * 3 + 2] = v.z;
  }
  // 骨を元へ
  if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  root.updateMatrixWorld(true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(IX); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
// ---- 遠めの馬の形：本物の馬を立ち姿で固め、部位（胴・首と頭・尾・四本の脚の上と下）に切り分けて、今の形の馬の骨組みに付ける ----
// 骨の重みを毎コマ計算しない（今の形の馬と同じ、部品を回すだけ）。毛色と筋肉の陰は頂点の色に焼き込む
const PX_HORSE_K = 0.86;   // units_model.js の HORSE_K と同じ
const PX_LEG = [['BN_L_UpperArm', 'BN_L_Hand'], ['BN_R_UpperArm', 'BN_R_Hand'], ['BN_L_Thing', 'BN_L_HorseLink'], ['BN_R_Thing', 'BN_R_HorseLink']];
function proxySource(sc, skMesh, parts, clip, tex) {
  const bones = skMesh.skeleton.bones;
  const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mixer = new THREE.AnimationMixer(sc);
  mixer.clipAction(clip).play(); mixer.setTime(0);
  let top = sc; while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const find = (re) => bones.findIndex((b) => b.name.startsWith(re));
  // 骨ごとの部位：祖先をたどって、脚の下・脚の上・首・尾・胴のどれか
  const gOf = bones.map((b) => {
    for (let p = b; p && p.isBone; p = p.parent) {
      const n = p.name;
      for (let i = 0; i < 4; i++) { if (n.startsWith(PX_LEG[i][1])) return 'l' + i; if (n.startsWith(PX_LEG[i][0])) return 'u' + i; }
      if (n.startsWith('BN_Neck_00')) return 'neck';
      if (n.startsWith('BN_Tail_00')) return 'tail';
    }
    return 'body';
  });
  const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skMesh.skeleton.boneInverses[i]).multiply(skMesh.bindMatrix));
  const wpos = (i) => new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld);
  const piv = { neck: wpos(find('BN_Neck_00')), tail: wpos(find('BN_Tail_00')) };
  for (let i = 0; i < 4; i++) { piv['u' + i] = wpos(find(PX_LEG[i][0])); piv['l' + i] = wpos(find(PX_LEG[i][1])); }
  // 体の色の絵を小さく読み、明るさ（毛の基準 0.214）を頂点に焼く
  let img = null;
  try {
    const im = tex.horse_col.image, cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 256, 256); img = cx.getImageData(0, 0, 256, 256).data;
  } catch (e) { img = null; }
  const G = {};
  const v = new THREE.Vector3(), u = new THREE.Vector3();
  for (const [geo, kind] of parts) {
    const pos = geo.attributes.position, uv = geo.attributes.uv, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const n = pos.count, P = new Float32Array(n * 3), grp = new Array(n), sh = new Float32Array(n).fill(1), tv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      v.set(0, 0, 0); let bw = -1, bi = 0;
      for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w <= 0) continue; const b = SI.getComponent(i, c); v.addScaledVector(u.fromBufferAttribute(pos, i).applyMatrix4(bm[b]), w); if (w > bw) { bw = w; bi = b; } }
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; grp[i] = gOf[bi];
      if (uv) tv[i] = uv.getY(i);
      if (img && uv && kind === 0) {
        const x = Math.min(255, Math.max(0, Math.floor(uv.getX(i) * 256))), y = Math.min(255, Math.max(0, Math.floor(uv.getY(i) * 256))), o = (y * 256 + x) * 4;
        sh[i] = Math.min(1.18, Math.max(0.72, (img[o] * 0.3 + img[o + 1] * 0.59 + img[o + 2] * 0.11) / 255 / 0.214));
      }
    }
    const ix = geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i);
    // 三角形は、どれかの頂点がその部位なら入れる（境目を重ねて、回した時に隙間を見せない）
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      for (const g of new Set([grp[a], grp[b], grp[c]])) {
        const o = G[g] || (G[g] = { P: [], C: [], K: [], T: [], IX: [], map: new Map() });
        // 毛の房は表と裏の両面（材質は片面なので、裏向きの三角形を別の頂点で足す）
        for (const [q0, q1, q2, bk] of kind === 2 ? [[a, b, c, 0], [a, c, b, 5e5]] : [[a, b, c, 0]]) for (const q of [q0, q1, q2]) {
          const key = kind * 1e6 + q + bk;
          let k = o.map.get(key);
          if (k === undefined) { k = o.P.length / 3; o.map.set(key, k); o.P.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]); o.C.push(sh[q]); o.K.push(kind); o.T.push(tv[q]); }
          o.IX.push(k);
        }
      }
    }
  }
  for (const g in G) delete G[g].map;
  mixer.stopAllAction(); mixer.uncacheRoot(sc);
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  top.updateMatrixWorld(true);
  // 銜の場所（首の支点からの、今の形の馬の首の座標）
  const lip = wpos(find(LIP_B)), poll = wpos(find(POLL_B));
  const bitN = lip.lerp(poll, 0.16).sub(piv.neck).multiplyScalar(1 / PX_HORSE_K);
  return { G, piv, bitN, styles: new Map(), lo: new Map() };
}
// 今の形の馬の部品の形を、切り分けた本物の馬の形に替える（支点も本物の関節へ）。遠くの形（lo）は元の形を同じ所に残す
const _pxOff = new THREE.Vector3();
function proxyLo(geo, off) {
  const PX = HR.proxy, k = geo.uuid + '|' + off.toArray().map((x) => x.toFixed(3)).join(',');
  if (!PX.lo.has(k)) { const g = geo.clone(); g.translate(off.x, off.y, off.z); PX.lo.set(k, g); }
  return PX.lo.get(k);
}
function prepHorse(gl, tex) {
  const sc = gl.scene;
  const lo = {}, rm = [];
  sc.traverse((o) => { if (o.isSkinnedMesh && /_lo$/.test(o.name)) { lo[o.name.replace(/^horse_|_lo$/g, '')] = o.geometry; rm.push(o); } });
  for (const o of rm) o.parent.remove(o);
  const holder = new THREE.Group();
  holder.scale.setScalar(HS); holder.position.x = HX;
  holder.add(sc); holder.updateMatrixWorld(true);
  const bones = {};
  sc.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // 形の座標 → 馬の根元の座標（m。前が +z、上が +y）：汗・泡・泥の場所を、鞍や胸繋と同じ物差しで描く
  const toRoot = {};
  sc.traverse((o) => { if (o.isMesh) toRoot[o.name.replace(/^horse_|_hi$/g, '')] = o.matrixWorld.clone(); });
  {
    let hairM = null, bodyM = null;
    sc.traverse((o) => { if (o.isSkinnedMesh) { const k = o.name.replace(/^horse_|_hi$/g, ''); if (k === 'hair') hairM = o; if (k === 'body') bodyM = o; } });
    if (hairM && bodyM) { hairM.geometry = horseHairGeometry(hairM, bodyM, gl.animations.find((c) => c.name === 'walk')); lo.hair = hairM.geometry; }
  }
  // 遠めの馬の形の元（立ち姿で固めた本物の馬）
  let proxy = null;
  try {
    let hairM = null, shoeM = null, eyeM = null;
    sc.traverse((o) => { if (o.isSkinnedMesh) { const k = o.name.replace(/^horse_|_hi$/g, ''); if (k === 'hair') hairM = o; if (k === 'shoe') shoeM = o; if (k === 'eye') eyeM = o; } });
    const parts = [[lo.body, 0]]; if (shoeM) parts.push([shoeM.geometry, 1]); if (hairM) parts.push([hairM.geometry, 2]); if (eyeM) parts.push([eyeM.geometry, 3]);
    if (hairM && lo.body) proxy = proxySource(sc, hairM, parts, gl.animations.find((c) => c.name === 'idle1') || gl.animations[0], tex);
  } catch (e) { console.warn('遠めの馬の形を作れませんでした', e); }
  // 骨の立ち姿の行列（馬の根元の座標、m）
  const rest = {}, restInv = {};
  for (const nm of [SEAT_B, CHEST_B, HIP_B, HEAD_B, POLL_B, LIP_B]) { rest[nm] = bones[nm].matrixWorld.clone(); restInv[nm] = rest[nm].clone().invert(); }
  const P = (nm) => new THREE.Vector3().setFromMatrixPosition(rest[nm]);
  // 銜（はみ）の位置：上唇から頭の方へ少し戻った、口の両脇
  const lip = P(LIP_B), poll = P(POLL_B);
  const bit = lip.clone().lerp(poll, 0.16);
  holder.remove(sc);
  const clips = {};
  for (const c of gl.animations) clips[c.name] = c;
  // 録った動きは並足（四拍）と駆け足（三拍の駆歩・右手前）だけ。速歩（対角の二拍）と襲歩（四拍の全速）はそこから作る
  // shift と cen は、録った動きの蹄が地面に着く拍子を測って決めた値（速歩は対角の脚がそろい、襲歩は 左後→右後→左前→右前 の順）
  clips.trot = gaitClip(clips.walk, 'trot', { LH: 0.34, RH: 0.25 }, { fore: 1.3, hind: 1.3, low: 1.4, cen: { LF: 0.44, RF: 0.94, LH: 0.28, RH: 0.71 } });
  clips.run = gaitClip(clips.gallop, 'run', { RH: 0.06, LF: -0.04, RF: 0.04 }, { fore: 1.15, hind: 1.15, body: 1.25, cen: { LH: 0.57, RH: 0.72, LF: 0.77, RF: 0 } });
  HR = { scene: sc, lo, tex, rest, restInv, clips, bitL: bit.clone().setX(bit.x + 0.05), bitR: bit.clone().setX(bit.x - 0.05), head0: P(HEAD_B), pool: [], mats: new Map(), tack: new Map(), toRoot, proxy };
  // 幅広い洋式の革の面繋を、同じ描き物のまま丸い組紐へ替える。
  const bridleMesh = sc.getObjectByName('horse_bridle');
  if (bridleMesh) {
    HR.bridle = bridleGeometry(lip, poll);
  }
}

// 面繋：項・鼻の輪と左右の頬の紐。口の銜から手綱につながる。
function bridleGeometry(lip, poll) {
  const axis = poll.clone().sub(lip).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const nose = lip.clone().lerp(poll, 0.28), crown = lip.clone().lerp(poll, 0.94), bit = lip.clone().lerp(poll, 0.16);
  const parts = [];
  for (const [center, radius] of [[nose, 0.075], [crown, 0.1]]) {
    const g = new THREE.TorusGeometry(radius, 0.009, 5, 14);
    g.applyQuaternion(q); g.translate(center.x, center.y, center.z); parts.push(g.toNonIndexed());
  }
  for (const sd of [1, -1]) {
    const pts = [crown.clone().add(new THREE.Vector3(sd * 0.1, 0, 0)), nose.clone().add(new THREE.Vector3(sd * 0.075, 0, 0)), bit.clone().add(new THREE.Vector3(sd * 0.05, 0, 0))];
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.009, 5, false).toNonIndexed());
  }
  return mergeGeometries(parts);
}
// 組紐の交差する筋は小さな一枚の絵で共有し、細い紐の描く回数を増やさない。
let cordMap = null;
function braidedCordMap() {
  if (cordMap) return cordMap;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'); cx.fillStyle = '#bbbbbb'; cx.fillRect(0, 0, 64, 64);
  cx.lineWidth = 7;
  for (let i = -64; i <= 128; i += 16) {
    cx.strokeStyle = '#eeeeee'; cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 64, 64); cx.stroke();
    cx.strokeStyle = '#888888'; cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i - 64, 64); cx.stroke();
  }
  cordMap = new THREE.CanvasTexture(cv); cordMap.colorSpace = THREE.SRGBColorSpace;
  cordMap.wrapS = cordMap.wrapT = THREE.RepeatWrapping; cordMap.repeat.set(1, 16);
  return cordMap;
}
const TAIL_B = ['BN_Tail_00_061_067', 'BN_Tail_01_062_068', 'BN_Tail_02_063_069', 'BN_Tail_03_064_070', 'BN_Tail_04_065_071'];

export { HORSE, HORSE_Q, HR, HS, HX, SEAT_B, CHEST_B, HIP_B, HEAD_B, PX_HORSE_K, _pxOff, proxyLo, prepHorse, cordMap, braidedCordMap, TAIL_B };
