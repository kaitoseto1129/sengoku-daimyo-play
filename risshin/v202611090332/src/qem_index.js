// 形の三角を減らす（面の二次誤差＝QEM）。tools/qem.mjs と同じやり方を、遊ぶ間に使える形にした物（10/24）。
// ・頂点は動かさず、寄せる先は元の頂点。返すのは「元の頂点の番号」で書いた新しい面の並びだけ
//   （位置・法線・絵の座標・骨の重み・色は元の形の物をそのまま使える。描き物の材質も変えない）
// ・絵の継ぎ目と縁は重く見て、形の輪郭を保つ
// 使い方：const I2 = simplifyIndex(位置の Float32Array, 絵の座標の Float32Array か null, 面の並び, 目標の三角の数)
export function simplifyIndex(P, U0, I, target) {
  const SHIFT = 0;
  const U = U0 || new Float32Array(P.length / 3 * 2);
  const nIn = P.length / 3;
  // 位置で結合（同じ位置の頂点を一つに）。UV も同じなら同じ「楔」
  const pkey = new Map(), wkey = new Map();
  const wpos = [], wuv = [], px = [], wrep = [];
  const vw = new Int32Array(nIn);
  for (let i = 0; i < nIn; i++) {
    const k = Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4);
    let p = pkey.get(k);
    if (p === undefined) { p = px.length / 3; pkey.set(k, p); px.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
    const k2 = p + ':' + Math.round(U[i * 2] * 1e5) + ',' + Math.round(U[i * 2 + 1] * 1e5);
    let w = wkey.get(k2);
    if (w === undefined) { w = wpos.length; wkey.set(k2, w); wpos.push(p); wuv.push(U[i * 2], U[i * 2 + 1]); wrep.push(i); }
    vw[i] = w;
  }
  pkey.clear(); wkey.clear();
  const np = px.length / 3, X = Float64Array.from(px);
  let nW = wpos.length;
  const CAP = nW * 3, WP = new Int32Array(CAP), WU = new Float64Array(CAP * 2);
  WP.set(wpos); WU.set(wuv);
  let nf = I.length / 3;
  const F = new Int32Array(nf * 3);
  const alive = new Uint8Array(nf);
  let live = 0;
  for (let f = 0; f < nf; f++) {
    const a = vw[I[f * 3]], b = vw[I[f * 3 + 1]], c = vw[I[f * 3 + 2]];
    F[f * 3] = a; F[f * 3 + 1] = b; F[f * 3 + 2] = c;
    if (WP[a] !== WP[b] && WP[b] !== WP[c] && WP[a] !== WP[c]) { alive[f] = 1; live++; }
  }
  const vf = Array.from({ length: np }, () => []);
  for (let f = 0; f < nf; f++) if (alive[f]) for (let k = 0; k < 3; k++) vf[WP[F[f * 3 + k]]].push(f);
  // 二次誤差
  const Q = new Float64Array(np * 10);
  const addPlane = (p, nx, ny, nz, d, w) => {
    const o = p * 10;
    Q[o] += w * nx * nx; Q[o + 1] += w * nx * ny; Q[o + 2] += w * nx * nz; Q[o + 3] += w * nx * d;
    Q[o + 4] += w * ny * ny; Q[o + 5] += w * ny * nz; Q[o + 6] += w * ny * d;
    Q[o + 7] += w * nz * nz; Q[o + 8] += w * nz * d; Q[o + 9] += w * d * d;
  };
  const fn = new Float64Array(3);
  const faceNormal = (a, b, c, out) => {
    const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
    const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const edges = new Map();
  for (let f = 0; f < nf; f++) {
    if (!alive[f]) continue;
    const a = WP[F[f * 3]], b = WP[F[f * 3 + 1]], c = WP[F[f * 3 + 2]];
    const L = faceNormal(a, b, c, fn);
    if (L < 1e-20) continue;
    const nx = fn[0] / L, ny = fn[1] / L, nz = fn[2] / L, d = -(nx * X[a * 3] + ny * X[a * 3 + 1] + nz * X[a * 3 + 2]);
    for (const p of [a, b, c]) addPlane(p, nx, ny, nz, d, L / 2);
    for (let k = 0; k < 3; k++) {
      const p = WP[F[f * 3 + k]], q = WP[F[f * 3 + (k + 1) % 3]];
      const key = p < q ? p * np + q : q * np + p;
      const e = edges.get(key);
      if (e) e.push(f); else edges.set(key, [f]);
    }
  }
  // 縁と継ぎ目：辺を含み面に直交する平面を重く足す
  const wOf = (f, p) => (WP[F[f * 3]] === p ? F[f * 3] : WP[F[f * 3 + 1]] === p ? F[f * 3 + 1] : F[f * 3 + 2]);
  let nb = 0, ns = 0;
  for (const [key, fs] of edges) {
    const p = Math.floor(key / np), q = key - p * np;
    let border = fs.length !== 2;
    let seam = false;
    if (!border) seam = wOf(fs[0], p) !== wOf(fs[1], p) || wOf(fs[0], q) !== wOf(fs[1], q);
    if (!border && !seam) continue;
    if (border) nb++; else ns++;
    const f = fs[0];
    const L = faceNormal(WP[F[f * 3]], WP[F[f * 3 + 1]], WP[F[f * 3 + 2]], fn);
    if (L < 1e-20) continue;
    const ex = X[q * 3] - X[p * 3], ey = X[q * 3 + 1] - X[p * 3 + 1], ez = X[q * 3 + 2] - X[p * 3 + 2];
    const el2 = ex * ex + ey * ey + ez * ez;
    let nx = ey * fn[2] - ez * fn[1], ny = ez * fn[0] - ex * fn[2], nz = ex * fn[1] - ey * fn[0];
    const nl = Math.hypot(nx, ny, nz); if (nl < 1e-20) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const d = -(nx * X[p * 3] + ny * X[p * 3 + 1] + nz * X[p * 3 + 2]);
    const w = (border ? 40 : 20) * el2;
    addPlane(p, nx, ny, nz, d, w); addPlane(q, nx, ny, nz, d, w);
  }
  edges.clear();
  const qerr = (a, b, x) => {
    const oa = a * 10, ob = b * 10, xx = X[x * 3], yy = X[x * 3 + 1], zz = X[x * 3 + 2];
    const q = (i) => Q[oa + i] + Q[ob + i];
    return q(0) * xx * xx + 2 * q(1) * xx * yy + 2 * q(2) * xx * zz + 2 * q(3) * xx + q(4) * yy * yy + 2 * q(5) * yy * zz + 2 * q(6) * yy + q(7) * zz * zz + 2 * q(8) * zz + q(9);
  };
  // 縮めてよいか（a を b へ寄せる）
  const map = new Map(), na = new Set(), n1 = new Float64Array(3), n2 = new Float64Array(3);
  const uvArea = (w0, w1, w2) => (WU[w1 * 2] - WU[w0 * 2]) * (WU[w2 * 2 + 1] - WU[w0 * 2 + 1]) - (WU[w2 * 2] - WU[w0 * 2]) * (WU[w1 * 2 + 1] - WU[w0 * 2 + 1]);
  function valid(a, b) {
    map.clear(); na.clear();
    let shared = 0;
    for (const f of vf[a]) {
      let hasB = false;
      for (let k = 0; k < 3; k++) { const p = WP[F[f * 3 + k]]; if (p === b) hasB = true; else if (p !== a) na.add(p); }
      if (!hasB) continue;
      shared++;
      const wa = wOf(f, a), wb = wOf(f, b);
      const m = map.get(wa);
      if (m !== undefined && m !== wb) return false;
      map.set(wa, wb);
    }
    if (!shared || shared > 2) return false;
    // 周りの点の数（輪の条件）：a と b の共通の隣は、共有する面の頂点だけ
    let common = 0;
    for (const f of vf[b]) for (let k = 0; k < 3; k++) { const p = WP[F[f * 3 + k]]; if (p !== b && na.has(p)) { na.delete(p); common++; } }
    if (common !== shared) return false;
    for (const f of vf[a]) {
      let hasB = false;
      for (let k = 0; k < 3; k++) if (WP[F[f * 3 + k]] === b) hasB = true;
      if (hasB) continue;
      const wa = wOf(f, a);
      let wb = map.get(wa);
      // 継ぎ目の角：b にこの側の UV が無い。a の UV のまま b の位置へ（絵が少しずれるので、費用を高くしてある）
      if (wb === undefined) { if (!SHIFT || nW > CAP - 16) return false; wb = -1 - wa; }
      const w0 = F[f * 3], w1 = F[f * 3 + 1], w2 = F[f * 3 + 2];
      const p0 = WP[w0], p1 = WP[w1], p2 = WP[w2];
      const L1 = faceNormal(p0, p1, p2, n1);
      const r = (p) => (p === a ? b : p);
      const L2 = faceNormal(r(p0), r(p1), r(p2), n2);
      if (L2 < L1 * 0.02 || L2 < 1e-14) return false;
      if ((n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (L1 * L2) < 0.3) return false;
      const rw = (w) => (w === wa ? (wb < 0 ? wa : wb) : w);
      const u1 = uvArea(w0, w1, w2), u2 = uvArea(rw(w0), rw(w1), rw(w2));
      if (u1 * u2 <= 0 && Math.abs(u1) > 1e-12) return false;
    }
    return true;
  }
  const pm = new Set();
  function uvPen(a, b) {
    if (!SHIFT) return 0;
    pm.clear();
    for (const f of vf[a]) { if (WP[F[f * 3]] === b || WP[F[f * 3 + 1]] === b || WP[F[f * 3 + 2]] === b) pm.add(wOf(f, a)); }
    let pen = 0;
    for (const f of vf[a]) {
      if (pm.has(wOf(f, a))) continue;
      pen += faceNormal(WP[F[f * 3]], WP[F[f * 3 + 1]], WP[F[f * 3 + 2]], fn) * 0.5;
    }
    if (!pen) return 0;
    const dx = X[a * 3] - X[b * 3], dy = X[a * 3 + 1] - X[b * 3 + 1], dz = X[a * 3 + 2] - X[b * 3 + 2];
    return pen * (dx * dx + dy * dy + dz * dz) * SHIFT;
  }
  // 各頂点のいちばん安い寄せ先
  const stamp = new Int32Array(np), dead = new Uint8Array(np);
  const hc = [], ha = [], hs = [], ht = [];
  const push = (c, a, t) => {
    let i = hc.length; hc.push(c); ha.push(a); hs.push(stamp[a]); ht.push(t);
    while (i > 0) { const pa = (i - 1) >> 1; if (hc[pa] <= hc[i]) break; swap(i, pa); i = pa; }
  };
  const swap = (i, j) => { let t = hc[i]; hc[i] = hc[j]; hc[j] = t; t = ha[i]; ha[i] = ha[j]; ha[j] = t; t = hs[i]; hs[i] = hs[j]; hs[j] = t; t = ht[i]; ht[i] = ht[j]; ht[j] = t; };
  const pop = () => {
    const r = [hc[0], ha[0], hs[0], ht[0]];
    const lc = hc.pop(), la = ha.pop(), ls = hs.pop(), lt = ht.pop();
    if (hc.length) {
      hc[0] = lc; ha[0] = la; hs[0] = ls; ht[0] = lt;
      let i = 0; const n = hc.length;
      for (;;) { const l = i * 2 + 1, rr = l + 1; let m = i; if (l < n && hc[l] < hc[m]) m = l; if (rr < n && hc[rr] < hc[m]) m = rr; if (m === i) break; swap(i, m); i = m; }
    }
    return r;
  };
  const nbSet = new Set();
  function best(a) {
    nbSet.clear();
    for (const f of vf[a]) for (let k = 0; k < 3; k++) { const p = WP[F[f * 3 + k]]; if (p !== a) nbSet.add(p); }
    let bc = Infinity, bt = -1;
    for (const b of nbSet) { const c = qerr(a, b, b) + uvPen(a, b); if (c < bc) { bc = c; bt = b; } }
    if (bt >= 0) push(bc, a, bt);
  }
  for (let p = 0; p < np; p++) if (vf[p].length) best(p);
  const stages = [target];
  const tries = new Int32Array(np);
  while (live > stages[stages.length - 1] && hc.length) {
    const [c, a, s, b] = pop();
    if (dead[a] || s !== stamp[a] || dead[b]) continue;
    if (!valid(a, b)) {
      // この寄せ先はだめ：ほかの寄せ先を探す（何度もだめなら諦める）
      if (++tries[a] > 6) continue;
      nbSet.clear();
      for (const f of vf[a]) for (let k = 0; k < 3; k++) { const p = WP[F[f * 3 + k]]; if (p !== a) nbSet.add(p); }
      let bc = Infinity, bt = -1;
      for (const q of nbSet) { if (q === b) continue; const cc = qerr(a, q, q) + uvPen(a, q); if (cc < bc && valid(a, q)) { bc = cc; bt = q; } }
      if (bt >= 0) push(bc, a, bt);
      continue;
    }
    // 寄せる
    const mapc = new Map(map);
    for (const f of vf[a]) {
      let hasB = false;
      for (let k = 0; k < 3; k++) if (WP[F[f * 3 + k]] === b) hasB = true;
      if (hasB) {
        alive[f] = 0; live--;
        for (let k = 0; k < 3; k++) { const p = WP[F[f * 3 + k]]; if (p !== a) { const L = vf[p]; const j = L.indexOf(f); if (j >= 0) { L[j] = L[L.length - 1]; L.pop(); } } }
      } else {
        for (let k = 0; k < 3; k++) if (WP[F[f * 3 + k]] === a) {
          const wa = F[f * 3 + k];
          let wb = mapc.get(wa);
          if (wb === undefined) { wb = nW++; WP[wb] = b; WU[wb * 2] = WU[wa * 2]; WU[wb * 2 + 1] = WU[wa * 2 + 1]; mapc.set(wa, wb); }
          F[f * 3 + k] = wb;
        }
        vf[b].push(f);
      }
    }
    vf[a] = []; dead[a] = 1;
    for (let i = 0; i < 10; i++) Q[b * 10 + i] += Q[a * 10 + i];
    // b とその隣の寄せ先を計算し直す
    const touch = new Set([b]);
    for (const f of vf[b]) for (let k = 0; k < 3; k++) touch.add(WP[F[f * 3 + k]]);
    for (const p of touch) { stamp[p]++; tries[p] = 0; best(p); }
  }
  // 生きている面を、元の頂点の番号で並べて返す（継ぎ目の角を動かさないので、楔はどれも元の頂点のどれか）
  const idx = new Uint32Array(live * 3); let o = 0;
  for (let f = 0; f < nf; f++) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) idx[o++] = wrep[F[f * 3 + k]];
  }
  return o === idx.length ? idx : idx.slice(0, o);
}

// 別の糸で減らす（主の糸を止めない）。返すのは Promise（元の頂点の番号の面の並び。出来なければ null）
//   一つの書き物に入れて Blob から起こす（公開の束ね方でも別のファイルを取りに行かない。army_bodies_worker.js と同じ）
let worker = null, nextId = 0;
const waiting = new Map();
export function simplifyAsync(P, U, I, target) {
  if (worker === false || typeof Worker === 'undefined' || typeof Blob === 'undefined') return Promise.resolve(null);
  try {
    if (!worker) {
      const src = 'const simplifyIndex = ' + simplifyIndex.toString() + ';\nself.onmessage = (e) => { const { id, P, U, I, target } = e.data; let out = null; try { out = simplifyIndex(P, U, I, target); } catch (err) { out = null; } if (out) self.postMessage({ id, I: out }, [out.buffer]); else self.postMessage({ id, I: null }); };';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = (e) => { const f = waiting.get(e.data.id); waiting.delete(e.data.id); if (f) f(e.data.I || null); };
      worker.onerror = () => { for (const f of waiting.values()) f(null); waiting.clear(); worker = false; };
    }
    const id = ++nextId;
    const p = new Promise((res) => waiting.set(id, res));
    worker.postMessage({ id, P, U, I, target }, [P.buffer, I.buffer].concat(U ? [U.buffer] : []));
    return p;
  } catch (e) { return Promise.resolve(null); }
}
// 形の位置と絵の座標を、別の糸へ渡す並びに写す
export function geoArrays(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
  let U = null;
  if (uv) { U = new Float32Array(uv.count * 2); for (let i = 0; i < uv.count; i++) { U[i * 2] = uv.getX(i); U[i * 2 + 1] = uv.getY(i); } }
  return { P, U, I: Uint32Array.from(geo.index.array) };
}
// 形（BufferGeometry）の面を減らした写しを作る。属性（位置・法線・絵・骨・表情の形）は元と共有し、面の並びだけ新しい
//   出来るまでは null を返す（次に呼んだ時に写しを返す）。同じ形は一度だけ作る
const lightGeos = new WeakMap();
export function lighterGeo(geo, target, THREE) {
  let rec = lightGeos.get(geo);
  if (rec) return rec.geo;
  rec = { geo: null }; lightGeos.set(geo, rec);
  if (!geo.index || !geo.attributes.position || geo.index.count / 3 <= target * 1.15) return null;
  const { P, U, I } = geoArrays(geo), n = geo.attributes.position.count;
  simplifyAsync(P, U, I, target).then((J) => {
    if (!J) return;
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? J : Uint16Array.from(J), 1));
    g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
    g.userData = { ...geo.userData, lightOf: geo.uuid };
    rec.geo = g;
  });
  return null;
}
