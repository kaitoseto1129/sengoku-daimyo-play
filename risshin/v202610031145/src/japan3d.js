// 日本地図の3D：山や川の起伏がある日本を、斜め上から見下ろす（信長の野望の地図のように）
// japan.js が地図の描画をここに任せる。天下の動き・季節・外交・急使は japan.js のまま
// 地形は一枚の平面の頂点を上下させ、色（草・森・岩・雪・海・川・家の色・街道）は一枚の絵に描いて貼る（軽く）
// 城の幟・軍勢の駒・上の帯・知らせの列は HTML で重ねる（字がくっきり読め、キーボードでも押せるように）
import * as THREE from 'three';
import { GRID, PROVINCES } from './japan_data.js';
import { drawMon } from './textures.js';
import { MON_OF, TYPE_NAME } from './b_castle.js';
import { ELEV_SENTINEL, decodeElevation } from './japan_elevation.js';

const S = GRID.step;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------------- 2D と 3D の切り替え（端末ごとに覚える） ----------------
const PREF = 'sr-jp-map';
let mode = (() => {
  try { if (/[?&]map=2d/.test(location.search)) return '2d'; return localStorage.getItem(PREF) || '3d'; } catch (e) { return '3d'; }
})();
function setMode(m) { mode = m; try { localStorage.setItem(PREF, m); } catch (e) { /* 保存できない環境 */ } }

// ---------------- 乱れ（値のノイズ） ----------------
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 31, y * f - i * 17); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(vnoise(x * f + 17 * i, y * f - 9 * i) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }
const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };

// ---------------- 升目のぼかしと等高線（japan.js と同じ作り） ----------------
function blur(F, w, h) {
  const T = new Float32Array(F.length), O = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; T[i] = (F[i] * 2 + (x > 0 ? F[i - 1] : F[i]) + (x < w - 1 ? F[i + 1] : F[i])) / 4; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; O[i] = (T[i] * 2 + (y > 0 ? T[i - w] : T[i]) + (y < h - 1 ? T[i + w] : T[i])) / 4; }
  return O;
}
function contours(F, w, h, th, box) {
  const [x0, y0, x1, y1] = box || [0, 0, w - 1, h - 1];
  const pts = new Map(); const segs = [];
  const at = (i, j) => F[j * w + i];
  const lerp = (a, b) => (th - a) / (b - a);
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const k = (a > th ? 8 : 0) | (b > th ? 4 : 0) | (c > th ? 2 : 0) | (d > th ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const T = () => ['h' + i + ',' + j, i + lerp(a, b), j];
    const R = () => ['v' + (i + 1) + ',' + j, i + 1, j + lerp(b, c)];
    const B = () => ['h' + i + ',' + (j + 1), i + lerp(d, c), j + 1];
    const L = () => ['v' + i + ',' + j, i, j + lerp(a, d)];
    const E = { 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]], 8: [[L, T]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] }[k];
    for (const [p, q] of E) { const P = p(), Q = q(); pts.set(P[0], [P[1], P[2]]); pts.set(Q[0], [Q[1], Q[2]]); segs.push([P[0], Q[0]]); }
  }
  const adj = new Map();
  segs.forEach((s, n) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(n); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1;
    const line = [segs[n][0], segs[n][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const end = dir ? line[line.length - 1] : line[0];
        const nx = (adj.get(end) || []).find((m) => !used[m]);
        if (nx === undefined) break;
        used[nx] = 1;
        const o = segs[nx][0] === end ? segs[nx][1] : segs[nx][0];
        if (dir) line.push(o); else line.unshift(o);
      }
    }
    let P = line.map((e) => pts.get(e));
    const closed = line[0] === line[line.length - 1];
    for (let it = 0; it < 2 && P.length > 3; it++) {
      const Q = closed ? [] : [P[0]];
      for (let s = 0; s < P.length - 1; s++) { const [ax, ay] = P[s], [bx, by] = P[s + 1]; Q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
      if (closed) Q.push(Q[0]); else Q.push(P[P.length - 1]);
      P = Q;
    }
    lines.push({ P, closed });
  }
  return lines;
}

// ---------------- 地形（一度だけ作る） ----------------
// 切り出す範囲（升目）。陸は q 18〜265・r 89〜344
const Q0 = 6, Q1 = 280, R0 = 76, R1 = 356;
const X0 = Q0 * S + 1.5, Z0 = R0 * S + 1.5, X1 = (Q1 - 1) * S + 1.5, Z1 = (R1 - 1) * S + 1.5;
const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const K = MOBILE ? 1.5 : 2; // 絵の細かさ（地図の1升＝3 に対して何画素か）
const TW = Math.round((X1 - X0) * K), TH = Math.round((Z1 - Z0) * K);
const tx = (x) => (x - X0) * K, tz = (z) => (z - Z0) * K;
const SEA_DEEP = [52, 84, 102];
// 城の 3D の大きさ（本城・城・砦）。寄ると形が分かるように、升目（3）より大きく
const CASTLE_SC = { hq: 5.2, '': 4, tr: 3 };
const HAZE = 0xb4c0bf;

let TER = null;
function terrain() {
  if (TER) return TER;
  const { gc, gr, alpha } = GRID;
  const N = gc * gr;
  const idx = new Map([...alpha].map((ch, i) => [ch, i]));
  const cell = new Int16Array(N).fill(-1);
  let k = 0;
  for (let i = 0; i < GRID.prov.length; i += 2) { const v = idx.get(GRID.prov[i]) - 1, n = idx.get(GRID.prov[i + 1]); cell.fill(v, k, k + n); k += n; }
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = cell[i] >= 0 ? 1 : 0;
  // 海岸からの隔たり（升）：陸は海まで、海は陸まで
  const chamfer = (inside) => {
    const D = new Float32Array(N);
    for (let i = 0; i < N; i++) D[i] = inside(i) ? 1e4 : 0;
    for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) {
      const i = r * gc + q; if (!D[i]) continue;
      let d = D[i];
      if (q > 0) d = Math.min(d, D[i - 1] + 1);
      if (r > 0) { d = Math.min(d, D[i - gc] + 1); if (q > 0) d = Math.min(d, D[i - gc - 1] + 1.414); if (q < gc - 1) d = Math.min(d, D[i - gc + 1] + 1.414); }
      D[i] = d;
    }
    for (let r = gr - 1; r >= 0; r--) for (let q = gc - 1; q >= 0; q--) {
      const i = r * gc + q; if (!D[i]) continue;
      let d = D[i];
      if (q < gc - 1) d = Math.min(d, D[i + 1] + 1);
      if (r < gr - 1) { d = Math.min(d, D[i + gc] + 1); if (q < gc - 1) d = Math.min(d, D[i + gc + 1] + 1.414); if (q > 0) d = Math.min(d, D[i + gc - 1] + 1.414); }
      D[i] = d;
    }
    return D;
  };
  const dLand = chamfer((i) => L[i] > 0), dSea = chamfer((i) => !L[i]);
  // 国土地理院 標高タイル（build_japan_elevation.mjs が一度だけ下ごしらえした、升ごとの実の高さ・m）
  const ELEV = decodeElevation();
  let elevMax = 1;
  for (let i = 0; i < N; i++) if (ELEV[i] > ELEV_SENTINEL) elevMax = Math.max(elevMax, ELEV[i]);
  const ELEV_SCALE = 10 / elevMax; // 一番高い所が絵の高さ 10 ほどになるよう目盛る（見た目の誇張）
  let H = new Float32Array(N);
  const HM = new Float32Array(N); // 山の尾根（ぼかさずに足す。標高の割合が高いほど強く）
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) {
    const i = r * gc + q, x = q * S + 1.5, z = r * S + 1.5;
    if (L[i]) {
      const em = ELEV[i] > ELEV_SENTINEL ? Math.max(0, ELEV[i]) : 0;
      const m = Math.min(1, em / elevMax);
      const dc = Math.min(dLand[i], 14);
      let h = 0.35 + Math.min(dc, 3) * 0.12 + em * ELEV_SCALE + fbm(x / 26, z / 26, 3) * 0.7 * (0.35 + m);
      HM[i] = Math.pow(m, 1.3) * 6 * ridged(x / 44, z / 44, 5) * (0.6 + 0.8 * fbm(x / 150 + 5, z / 150 - 3, 2));
      H[i] = h;
    } else H[i] = -0.8 - Math.min(dSea[i], 22) * 0.32;
  }
  H = blur(H, gc, gr);
  const HMb = blur(HM, gc, gr);
  for (let i = 0; i < N; i++) if (L[i]) H[i] += HM[i] * 0.6 + HMb[i] * 0.4;
  for (let i = 0; i < N; i++) H[i] = L[i] ? Math.max(0.3, H[i]) : Math.min(-0.5, H[i]);
  // 陰（北西からの光）と斜面・森の斑
  const shade = new Float32Array(N), slope = new Float32Array(N), fn = new Float32Array(N);
  const lx = -0.55, ly = 0.62, lz = -0.55, ll = Math.hypot(lx, ly, lz);
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) {
    const i = r * gc + q;
    const hx = (H[r * gc + Math.min(gc - 1, q + 1)] - H[r * gc + Math.max(0, q - 1)]) / (2 * S);
    const hz = (H[Math.min(gr - 1, r + 1) * gc + q] - H[Math.max(0, r - 1) * gc + q]) / (2 * S);
    // 陰だけは起伏を 1.6 倍に見立てて強く（高さそのものは変えない）
    const ex = hx * 1.6, ez = hz * 1.6, nl = Math.hypot(ex, 1, ez);
    shade[i] = Math.max(0, (-ex * lx + ly - ez * lz) / (nl * ll));
    slope[i] = Math.hypot(hx, hz);
    fn[i] = fbm(q / 4.5, r / 4.5, 3);
  }
  // 谷と尾根（まわりより低い所は暗く、高い所は明るく。山の襞が立って見えるように）
  let Hs = H;
  for (let i = 0; i < 4; i++) Hs = blur(Hs, gc, gr);
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) curv[i] = L[i] ? clamp((H[i] - Hs[i]) * 0.09, -0.32, 0.26) : 0;
  // 川：海から陸へ水の道をたどり（窪みは埋める）、集まる水の多い所を川に
  const Lb = blur(blur(L, gc, gr), gc, gr);
  const riv = riversOf(H, L, gc, gr);
  // 海岸線・国境（絵の座標の道）
  const w2 = gc + 2, h2 = gr + 2;
  const land2 = new Float32Array(w2 * h2), pv = new Int16Array(w2 * h2).fill(-1);
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) { const v = cell[r * gc + q]; pv[(r + 1) * w2 + q + 1] = v; if (v >= 0) land2[(r + 1) * w2 + q + 1] = 1; }
  const toTex = (lines, path = new Path2D(), sh = 1) => {
    for (const { P, closed } of lines) {
      if (P.length < 2) continue;
      const X = (p) => tx((p[0] - sh) * S + 1.5), Z = (p) => tz((p[1] - sh) * S + 1.5);
      path.moveTo(X(P[0]), Z(P[0]));
      for (let i = 1; i < P.length; i++) path.lineTo(X(P[i]), Z(P[i]));
      if (closed) path.closePath();
    }
    return path;
  };
  const coast = toTex(contours(blur(land2, w2, h2), w2, h2, 0.5));
  const borders = new Path2D();
  const box = new Map();
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) { const v = pv[j * w2 + i]; if (v < 0) continue; const b = box.get(v) || [i, j, i, j]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], j); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], j); box.set(v, b); }
  const F = new Float32Array(w2 * h2);
  for (const [v, b] of box) {
    const bb = [Math.max(0, b[0] - 2), Math.max(0, b[1] - 2), Math.min(w2 - 1, b[2] + 2), Math.min(h2 - 1, b[3] + 2)];
    F.fill(0);
    for (let j = bb[1]; j <= bb[3]; j++) for (let i = bb[0]; i <= bb[2]; i++) if (pv[j * w2 + i] === v) F[j * w2 + i] = 1;
    const out = [];
    for (const { P } of contours(blur(F, w2, h2), w2, h2, 0.5, bb)) {
      let cur = [];
      for (const p of P) { const q = Math.round(p[0]), r = Math.round(p[1]); const inland = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, c]) => pv[(r + c) * w2 + q + a] >= 0); if (inland) cur.push(p); else { if (cur.length > 1) out.push({ P: cur, closed: false }); cur = []; } }
      if (cur.length > 1) out.push({ P: cur, closed: false });
    }
    toTex(out, borders);
  }
  let bx0 = 1e9, bz0 = 1e9, bx1 = 0, bz1 = 0;
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) if (L[r * gc + q]) { bx0 = Math.min(bx0, q); bx1 = Math.max(bx1, q); bz0 = Math.min(bz0, r); bz1 = Math.max(bz1, r); }
  TER = { cell, L, H, shade, slope, fn, curv, Lb, riv, coast, borders, bounds: [bx0 * S, bz0 * S, (bx1 + 1) * S, (bz1 + 1) * S], base: {} };
  return TER;
}
// 地面の高さ（世界の座標 x・z で）
function hAt(x, z) {
  const T = TER, { gc, gr } = GRID;
  const gx = clamp((x - 1.5) / S, 0, gc - 1.001), gz = clamp((z - 1.5) / S, 0, gr - 1.001);
  const q = Math.floor(gx), r = Math.floor(gz), fx = gx - q, fz = gz - r, i = r * gc + q;
  const H = T.H;
  return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fz) + (H[i + gc] * (1 - fx) + H[i + gc + 1] * fx) * fz;
}
function riversOf(H, L, gc, gr) {
  const N = gc * gr;
  const done = new Uint8Array(N), recv = new Int32Array(N).fill(-1), order = new Int32Array(N);
  let on = 0;
  // 小さな二分ヒープ（高さの低い順）
  const hv = new Float32Array(N), hi = new Int32Array(N); let hn = 0;
  const push = (i, v) => { let c = hn++; while (c > 0) { const p = (c - 1) >> 1; if (hv[p] <= v) break; hv[c] = hv[p]; hi[c] = hi[p]; c = p; } hv[c] = v; hi[c] = i; };
  const pop = () => { const top = hi[0], lv = hv[--hn], li = hi[hn]; let c = 0; for (;;) { let m = c * 2 + 1; if (m >= hn) break; if (m + 1 < hn && hv[m + 1] < hv[m]) m++; if (hv[m] >= lv) break; hv[c] = hv[m]; hi[c] = hi[m]; c = m; } hv[c] = lv; hi[c] = li; return top; };
  const fh = new Float32Array(H);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) {
    const i = r * gc + q; if (L[i]) continue;
    done[i] = 1;
    for (const [a, b] of NB) { const qq = q + a, rr = r + b; if (qq < 0 || rr < 0 || qq >= gc || rr >= gr) continue; const n = rr * gc + qq; if (L[n] && !done[n]) { done[n] = 1; recv[n] = i; push(n, fh[n]); } }
  }
  while (hn) {
    const i = pop(); order[on++] = i;
    const q = i % gc, r = (i / gc) | 0;
    for (const [a, b] of NB) { const qq = q + a, rr = r + b; if (qq < 0 || rr < 0 || qq >= gc || rr >= gr) continue; const n = rr * gc + qq; if (done[n]) continue; done[n] = 1; fh[n] = Math.max(fh[n], fh[i] + 0.002); recv[n] = i; push(n, fh[n]); }
  }
  const acc = new Float32Array(N);
  for (let k = 0; k < on; k++) acc[order[k]] = 1;
  for (let k = on - 1; k >= 0; k--) { const i = order[k], rc = recv[i]; if (rc >= 0 && L[rc]) acc[rc] += acc[i]; }
  // 川の筋：源から海（か、もう描いた川）まで
  const TH_ = 70;
  const isR = (i) => L[i] && acc[i] >= TH_;
  const hasUp = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isR(i) && recv[i] >= 0) hasUp[recv[i]] = 1;
  const drawn = new Uint8Array(N);
  const paths = [];
  for (let i = 0; i < N; i++) {
    if (!isR(i) || hasUp[i]) continue;
    const P = [];
    let c = i;
    while (c >= 0) {
      P.push([(c % gc) * S + 1.5, ((c / gc) | 0) * S + 1.5, acc[c]]);
      if (drawn[c] || !L[c]) break;
      drawn[c] = 1;
      c = recv[c];
    }
    if (P.length > 3) paths.push(P);
  }
  return paths;
}

// 季節ごとの地の絵（草・森・岩・雪・海・川）。四季それぞれ一度だけ作る
function baseCanvas(season) {
  const T = terrain();
  if (T.base[season]) return T.base[season];
  const { gc, gr } = GRID;
  const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
  const g = cv.getContext('2d');
  const img = g.createImageData(TW, TH);
  const dat = img.data;
  const { H, shade, slope, fn, Lb } = T;
  const snowLine = season === '冬' ? 11 : season === '春' ? 22 : 27;
  const autumn = season === '秋', winter = season === '冬', spring = season === '春';
  const NT = 128, ntab = new Float32Array(NT * NT);
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) { const a = x / 6, b = y / 6; ntab[y * NT + x] = (vnoise(a, b) - vnoise(a + 0.5, b + 0.5)) + 0.5 * (vnoise(a * 2.3, b * 2.3) - vnoise(a * 2.3 + 0.5, b * 2.3 + 0.5)); }
  const bl = (A, i, w00, w10, w01, w11) => A[i] * w00 + A[i + 1] * w10 + A[i + gc] * w01 + A[i + gc + 1] * w11;
  for (let py = 0; py < TH; py++) {
    const z = Z0 + (py + 0.5) / K;
    const gz = clamp((z - 1.5) / S, 0, gr - 1.001), r = Math.floor(gz), fz = gz - r;
    for (let px = 0; px < TW; px++) {
      const x = X0 + (px + 0.5) / K;
      const gx = clamp((x - 1.5) / S, 0, gc - 1.001), q = Math.floor(gx), fx = gx - q;
      const i = r * gc + q;
      const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
      const h = bl(H, i, w00, w10, w01, w11), lb = bl(Lb, i, w00, w10, w01, w11);
      const grain = (hash2(px, py) - 0.5) * 9;
      let R, G, B;
      if (lb > 0.5) {
        const sh = bl(shade, i, w00, w10, w01, w11), sl = bl(slope, i, w00, w10, w01, w11), n = bl(fn, i, w00, w10, w01, w11);
        // 平野（田と畑。淡い緑から、やや乾いた黄緑へ）
        R = mix(144, 126, n); G = mix(166, 150, n); B = mix(104, 88, n);
        // 低い丘は緑から少し茶へ（信長の野望 新生の地図のように）
        const hillBrown = sstep(3, 9, h) * (1 - sstep(10, 18, h)) * 0.3;
        R = mix(R, 146, hillBrown); G = mix(G, 118, hillBrown); B = mix(B, 78, hillBrown);
        if (winter) { R = mix(R, 176, 0.45); G = mix(G, 170, 0.45); B = mix(B, 150, 0.45); }
        if (autumn) { R = mix(R, 176, 0.35); G = mix(G, 156, 0.35); B = mix(B, 92, 0.35); }
        // 浜
        const beach = (1 - sstep(0.5, 0.6, lb)) * (1 - sstep(1.2, 3, h)) * 0.7;
        R = mix(R, 198, beach); G = mix(G, 186, beach); B = mix(B, 148, beach);
        // 森（丘から山）
        const fw = clamp(sstep(1.8, 7, h + (n - 0.5) * 5) * 0.95, 0, 1);
        let fr = mix(74, 56, sstep(8, 20, h)), fg = mix(94, 76, sstep(8, 20, h)), fb = mix(58, 50, sstep(8, 20, h));
        if (autumn) { const a = 0.55 * (1 - sstep(18, 26, h)); fr = mix(fr, 132, a); fg = mix(fg, 86, a); fb = mix(fb, 46, a); }
        if (spring) { const a = 0.12 * (1 - sstep(6, 12, h)) * (n > 0.6 ? 1 : 0); fr = mix(fr, 196, a); fg = mix(fg, 160, a); fb = mix(fb, 164, a); }
        R = mix(R, fr, fw); G = mix(G, fg, fw); B = mix(B, fb, fw);
        // 岩（高い所と急な斜面）
        const rw = clamp(sstep(30, 42, h) * 0.75 + sstep(1.6, 2.8, sl) * 0.3, 0, 1);
        R = mix(R, 124, rw); G = mix(G, 116, rw); B = mix(B, 102, rw);
        // 雪
        const sw = sstep(snowLine, snowLine + 7, h + (n - 0.5) * 9 - sl * 3);
        R = mix(R, 238, sw); G = mix(G, 240, sw); B = mix(B, 238, sw);
        // 山肌の細かな襞（画素ごとの小さな陰）
        let det = 0;
        if (h > 2.5) det = ntab[((Math.floor(z * 3) & 127) << 7) | (Math.floor(x * 3) & 127)] * 0.5 * sstep(2.5, 12, h);
        // 光の当たる面と陰の面の差をはっきり（信長の野望の地図のような立体の起伏）。谷は暗く、尾根は明るく
        const cv = bl(T.curv, i, w00, w10, w01, w11) * sstep(1.5, 8, h);
        const lit = 0.3 + 1.1 * Math.pow(sh, 1.35) + det + cv;
        R *= lit; G *= lit; B *= lit;
      } else {
        // 海：浅瀬は明るい浅葱、沖は深い藍。海岸に白い波の縁
        const d = -h;
        const shallow = 1 - sstep(0, 1.6, d);
        const t = sstep(0.8, 7, d);
        R = mix(98, SEA_DEEP[0], t); G = mix(142, SEA_DEEP[1], t); B = mix(146, SEA_DEEP[2], t);
        R = mix(R, 168, shallow * 0.5); G = mix(G, 206, shallow * 0.5); B = mix(B, 196, shallow * 0.5);
        const foam = Math.max(0, 1 - Math.abs(lb - 0.46) / 0.05) * 0.85 + Math.max(0, 1 - Math.abs(lb - 0.36) / 0.035) * 0.25;
        R = mix(R, 236, foam); G = mix(G, 240, foam); B = mix(B, 236, foam);
        // 絵の縁では沖の海の色へなじませる（地形の板の四角が海に見えないように）
        const eg = sstep(0, 1, Math.min(px, py, TW - 1 - px, TH - 1 - py) / (70 * K));
        R = mix(SEA_DEEP[0], R, eg); G = mix(SEA_DEEP[1], G, eg); B = mix(SEA_DEEP[2], B, eg);
      }
      const o = (py * TW + px) * 4;
      dat[o] = R + grain; dat[o + 1] = G + grain; dat[o + 2] = B + grain * 0.8; dat[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 川（谷を通って海へ。下流ほど太く）
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const P0 of T.riv) {
    // 角を丸める
    let P = P0;
    for (let it = 0; it < 2; it++) { const Q = [P[0]]; for (let s = 0; s < P.length - 1; s++) { const a = P[s], b = P[s + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2]], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, b[2]]); } Q.push(P[P.length - 1]); P = Q; }
    for (let s = 0; s < P.length - 1; s++) {
      const a = P[s], b = P[s + 1];
      const w = (0.35 + Math.sqrt(a[2]) * 0.045) * K;
      g.strokeStyle = winter ? 'rgba(92,120,132,0.95)' : 'rgba(76,116,132,0.95)'; g.lineWidth = w;
      g.beginPath(); g.moveTo(tx(a[0]), tz(a[1])); g.lineTo(tx(b[0]), tz(b[1])); g.stroke();
    }
  }
  // 海岸の細い線
  g.strokeStyle = 'rgba(40,52,48,0.55)'; g.lineWidth = 1; g.stroke(T.coast);
  T.base[season] = cv;
  return cv;
}

// ---------------- 小さな絵（家紋・武将の顔） ----------------
const monCache = new Map();
function monCanvas(kind) {
  if (monCache.has(kind)) return monCache.get(kind);
  const src = document.createElement('canvas'); src.width = 96; src.height = 192;
  drawMon(src.getContext('2d'), kind, 96, 192);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.clip();
  const cy = 192 * 0.32, r = 96 * 0.34 * 1.18;
  g.drawImage(src, 48 - r, cy - r, r * 2, r * 2, 0, 0, 64, 64);
  monCache.set(kind, c);
  return c;
}
const urlCache = new Map();
function monURL(clan, col) {
  const key = 'm|' + clan.name + '|' + col;
  if (urlCache.has(key)) return urlCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const mk = MON_OF[clan.name];
  if (mk) g.drawImage(monCanvas(mk), 0, 0);
  else {
    g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = col; g.stroke();
    g.fillStyle = '#1d1712'; g.font = '700 36px "Shippori Mincho B1", "Hiragino Mincho ProN", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(clan.crest || clan.name[0], 32, 34);
  }
  const u = c.toDataURL();
  urlCache.set(key, u);
  return u;
}
// 武将の顔（墨絵ふうの胸像）。look：{ lk 似顔の手がかり（頭 k 兜・e 烏帽子・m 髷・b 坊主 ＋ 髭 0〜3）, age 年 }。無ければ名から決める
export function faceURL(name, clan, col, look) {
  const lk = look && look.lk, age = look && look.age;
  const key = 'f|' + name + '|' + col + '|' + (lk || '') + '|' + (age ? Math.floor(age / 8) : '');
  if (urlCache.has(key)) return urlCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const h = hashStr(name);
  const monk = lk ? lk[0] === 'b' : /顕如|宗麟|信玄|謙信|入道|坊|院/.test(name) || clan.name === '本願寺';
  const old = age >= 50, veryOld = age >= 63, young = age && age < 22;
  // 髪と髭の色（年を取ると白髪まじり）
  const hair = veryOld ? '#a9a49c' : old ? '#5e5953' : '#1b1815';
  const beardC = veryOld ? '#b3aea6' : old ? '#6a645d' : '#1e1813';
  // 地：家の色を暗く
  g.fillStyle = col; g.fillRect(0, 0, 128, 128);
  let gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,245,225,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // 胴（鎧か法衣）
  g.fillStyle = monk ? '#35302a' : '#221e1b';
  g.beginPath(); g.moveTo(6, 128); g.bezierCurveTo(10, 104, 30, 94, 50, 92); g.lineTo(78, 92); g.bezierCurveTo(98, 94, 118, 104, 122, 128); g.closePath(); g.fill();
  if (monk) { g.strokeStyle = '#9a7a44'; g.lineWidth = 7; g.beginPath(); g.moveTo(44, 94); g.lineTo(80, 128); g.stroke(); }
  else {
    g.save(); g.clip();
    g.strokeStyle = col; g.globalAlpha = 0.85; g.lineWidth = 2.5;
    for (let y = 104; y < 128; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    g.restore();
    g.fillStyle = '#3a332c'; g.fillRect(22, 98, 20, 10); g.fillRect(86, 98, 20, 10);
  }
  // 首と顔（年寄りは頬がこけ、若者は丸い）
  const skin = ['#c99a74', '#bf8f6a', '#cfa582'][h % 3];
  const fw = young ? 21 : old ? 19 : 20, fh = young ? 24 : 25;
  g.fillStyle = skin; g.fillRect(55, 80, 18, 16);
  g.beginPath(); g.ellipse(64, 62, fw, fh, 0, 0, Math.PI * 2); g.fill();
  gr = g.createLinearGradient(44, 0, 84, 0); gr.addColorStop(0, 'rgba(255,240,220,0.12)'); gr.addColorStop(1, 'rgba(60,30,10,0.32)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(64, 62, fw, fh, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = skin; g.beginPath(); g.ellipse(44, 64, 3.5, 6, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(84, 64, 3.5, 6, 0, 0, Math.PI * 2); g.fill();
  // 頭
  const hat = lk ? ({ k: 0, e: 1, m: 2, b: 3 }[lk[0]] ?? 2) : monk ? 3 : (h >> 4) % 3;
  if (hat === 0) {
    // 兜：鉢・しころ・前立て
    g.fillStyle = '#2a2622';
    g.beginPath(); g.ellipse(64, 50, 26, 19, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(38, 48); g.lineTo(90, 48); g.lineTo(104, 76); g.lineTo(92, 72); g.lineTo(84, 52); g.lineTo(44, 52); g.lineTo(36, 72); g.lineTo(24, 76); g.closePath(); g.fill();
    g.fillStyle = '#3d3630'; g.fillRect(40, 47, 48, 5);
    g.strokeStyle = '#caa24a'; g.lineWidth = 4; g.lineCap = 'round';
    const mt = (h >> 7) % 3;
    if (mt === 0) { g.beginPath(); g.moveTo(64, 44); g.quadraticCurveTo(46, 30, 40, 10); g.moveTo(64, 44); g.quadraticCurveTo(82, 30, 88, 10); g.stroke(); }
    else if (mt === 1) { g.beginPath(); g.arc(64, 30, 13, Math.PI * 0.1, Math.PI * 0.9, true); g.stroke(); }
    else { g.fillStyle = '#caa24a'; g.beginPath(); g.arc(64, 32, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a2622'; g.beginPath(); g.arc(64, 32, 3, 0, Math.PI * 2); g.fill(); }
  } else if (hat === 1) {
    // 烏帽子
    g.fillStyle = '#1b1815';
    g.beginPath(); g.moveTo(44, 50); g.quadraticCurveTo(46, 30, 60, 12); g.quadraticCurveTo(78, 18, 84, 50); g.closePath(); g.fill();
    g.fillStyle = '#26211d'; g.fillRect(44, 45, 40, 6);
    g.fillStyle = hair; g.fillRect(43, 50, 5, 14); g.fillRect(80, 50, 5, 14);
  } else if (hat === 2) {
    // 月代と髷
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(64, 50, 21, 15, 0, Math.PI * 1.02, Math.PI * 1.25); g.lineTo(52, 56); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(43, 50); g.quadraticCurveTo(44, 64, 46, 70); g.lineTo(49, 70); g.quadraticCurveTo(46, 58, 50, 44); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(85, 50); g.quadraticCurveTo(84, 64, 82, 70); g.lineTo(79, 70); g.quadraticCurveTo(82, 58, 78, 44); g.closePath(); g.fill();
    g.fillRect(60, 34, 8, 12); g.fillRect(56, 32, 16, 5);
  } else {
    // 坊主頭（剃った跡を少し）
    g.fillStyle = 'rgba(60,50,45,0.25)'; g.beginPath(); g.ellipse(64, 48, 19, 12, 0, Math.PI, 0); g.fill();
  }
  // 眉・目・鼻・口
  g.strokeStyle = old ? beardC : '#231a14'; g.lineCap = 'round';
  g.lineWidth = 3; g.beginPath(); g.moveTo(51, 58); g.lineTo(60, 56 + (h & 1)); g.moveTo(68, 56 + (h & 1)); g.lineTo(77, 58); g.stroke();
  g.strokeStyle = '#231a14';
  g.lineWidth = 2; g.beginPath(); g.moveTo(53, 64); g.lineTo(59, 64.5); g.moveTo(69, 64.5); g.lineTo(75, 64); g.stroke();
  g.strokeStyle = 'rgba(90,50,30,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(64, 66); g.lineTo(62, 74); g.lineTo(66, 75); g.stroke();
  g.strokeStyle = '#3a2418'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(58, 81); g.lineTo(70, 81); g.stroke();
  // 年の皺
  if (old) { g.strokeStyle = 'rgba(70,40,25,0.45)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(52, 53); g.lineTo(60, 52); g.moveTo(68, 52); g.lineTo(76, 53); g.moveTo(55, 72); g.quadraticCurveTo(53, 78, 56, 82); g.moveTo(73, 72); g.quadraticCurveTo(75, 78, 72, 82); g.stroke(); }
  // 髭
  const beard = young ? 0 : lk ? +lk[1] || 0 : ((h >> 9) % 3 !== 0 ? 1 : 0) + ((h >> 11) % 3 === 0 ? 1 : 0);
  if (beard >= 1 && !monk) { g.fillStyle = beardC; g.beginPath(); g.moveTo(55, 79); g.quadraticCurveTo(64, 74, 73, 79); g.quadraticCurveTo(64, 77, 55, 79); g.fill(); }
  if (beard >= 2) { g.fillStyle = monk ? 'rgba(40,34,30,0.35)' : beardC; g.beginPath(); g.moveTo(56, 84); g.quadraticCurveTo(64, 96, 72, 84); g.quadraticCurveTo(64, 88, 56, 84); g.fill(); }
  if (beard >= 3 && !monk) { g.fillStyle = beardC; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(45, 68); g.quadraticCurveTo(47, 90, 64, 98); g.quadraticCurveTo(81, 90, 83, 68); g.quadraticCurveTo(80, 84, 64, 88); g.quadraticCurveTo(48, 84, 45, 68); g.fill(); g.globalAlpha = 1; }
  // 縁の暗がり
  gr = g.createRadialGradient(64, 60, 40, 64, 64, 92); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const u = c.toDataURL('image/jpeg', 0.86);
  urlCache.set(key, u);
  return u;
}
// 武将の能力（名のある大名は手で、ほかは名から決める）
const ABIL = {
  織田信長: [96, 83, 95], 徳川家康: [93, 80, 93], 武田勝頼: [86, 92, 62], 武田信玄: [98, 86, 96], 上杉謙信: [99, 99, 80], 北条氏政: [72, 64, 70],
  毛利輝元: [72, 62, 70], 豊臣秀吉: [93, 72, 99], 羽柴秀吉: [93, 72, 99], 石田三成: [72, 48, 90], 島津義久: [88, 78, 90], 伊達輝宗: [72, 66, 74], 伊達政宗: [90, 86, 90],
  長宗我部元親: [88, 84, 82], 大友宗麟: [78, 62, 80], 本願寺顕如: [72, 34, 88], 浅井長政: [80, 86, 68], 朝倉義景: [62, 54, 60], 松永久秀: [76, 72, 95],
  龍造寺隆信: [86, 88, 72], 佐竹義重: [86, 90, 76], 三好長治: [48, 52, 46], 宇喜多直家: [76, 68, 94], 豊臣秀頼: [56, 50, 62], 徳川秀忠: [72, 62, 74],
  上杉景勝: [86, 84, 76], 真田昌幸: [90, 76, 97], 前田利家: [86, 88, 72], 今川義元: [84, 62, 86], 北条氏康: [94, 84, 92],
};
function abilOf(name) {
  if (ABIL[name]) return ABIL[name];
  const h = hashStr(name);
  return [50 + (h % 36), 46 + ((h >> 6) % 42), 44 + ((h >> 12) % 44)];
}
function rgbOf(css) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = css; const v = c.fillStyle;
  if (v.startsWith('#')) { const n = parseInt(v.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = v.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [100, 100, 100];
}
const KANM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

// ---------------- 見た目（CSS） ----------------
function injectStyle() {
  if (document.getElementById('j3-style')) return;
  const st = document.createElement('style'); st.id = 'j3-style';
  st.textContent = `
.jp.j3 .jp-map { background: #b4c0bf; }
.jp.j3 .jp-map > canvas#jp-cv, .jp.j3 .jp-season, .jp.j3 .jp-legend, .jp.j3 .jp-hint { display: none; }
.jp.j3 .jp-map::after { box-shadow: inset 0 0 0 1px rgba(0,0,0,.45), inset 0 0 90px rgba(24,20,14,.42); z-index: 1; }
.j3-gl { position: absolute; inset: 0; display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; outline: none; }
.j3-gl.drag { cursor: grabbing; }
.j3-layer { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.jp.j3 .jp-tools { top: 76px; z-index: 2; }
.j3-top { position: absolute; left: 0; right: 0; top: 0; z-index: 2; display: flex; align-items: stretch; gap: 0; min-height: 60px; padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px); background: linear-gradient(180deg, rgba(20,17,13,.94), rgba(20,17,13,.84)); border-bottom: 1px solid rgba(194,162,90,.55); box-shadow: 0 2px 12px rgba(0,0,0,.35); color: var(--washi); font-size: 13px; }
.j3-top > * { display: flex; align-items: center; padding: 6px 14px; border-right: 1px solid rgba(236,228,210,.12); }
.j3-date { gap: 10px; }
.j3-date b { font-family: var(--display); font-size: 22px; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: #8e2f1f; color: #f6ecd8; box-shadow: inset 0 0 0 2px rgba(243,234,214,.35); }
.j3-date span { font-family: var(--display); font-size: 15px; line-height: 1.3; letter-spacing: .06em; }
.j3-date small { display: block; font-family: var(--ui); font-size: 12px; color: var(--washi-dim); letter-spacing: 0; }
.j3-clan { gap: 10px; }
.j3-clan img { width: 40px; height: 40px; border-radius: 50%; box-shadow: 0 0 0 2px var(--c), 0 0 0 3px rgba(0,0,0,.6); }
.j3-clan b { font-family: var(--display); font-size: 17px; letter-spacing: .08em; display: block; }
.j3-clan small { font-size: 12px; color: var(--washi-dim); }
.j3-res { margin: 0; gap: 18px; flex: 1; flex-wrap: wrap; }
.j3-res div { display: flex; align-items: baseline; gap: 6px; }
.j3-res dt { font-size: 12px; color: var(--kin); letter-spacing: .1em; }
.j3-res dd { margin: 0; font-family: var(--display); font-size: 17px; font-variant-numeric: tabular-nums; }
.j3-res dd small { font-family: var(--ui); font-size: 12px; color: var(--washi-dim); margin-left: 2px; }
.j3-res dd em { display: block; font-family: var(--ui); font-style: normal; font-size: 12px; line-height: 1.1; color: var(--washi-dim); letter-spacing: 0; }
.j3-res dd em.up { color: #b9d39a; } .j3-res dd em.down { color: #f2a48e; }
.j3-res div { flex-direction: row; }
.j3-top .j3-act { border-right: 0; gap: 8px; }
.j3-top .j3-act .btn { min-height: 44px; white-space: nowrap; }
.j3-top .j3-act #j3-nextb { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; line-height: 1.2; border-color: rgba(200,86,60,.8); }
.j3-top .j3-act #j3-nextb small { font-size: 12px; color: #f3c9a8; }
/* 城の印：上に家紋の旗、竿の根が城の場所、下に横書きの名札（格で大きさと縁を変える） */
.j3-ban { position: absolute; left: 0; top: 0; pointer-events: auto; appearance: none; border: 0; background: transparent; padding: 0; margin: 0; cursor: pointer; color: inherit; font: inherit; display: flex; flex-direction: column; align-items: center; min-width: 44px; will-change: transform; }
.j3-ban::after { content: ''; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); }   /* 小さな旗でも指が当たる広さ（44px）にする */
.j3-ban:focus-visible { outline: none; }
.j3-ban:focus-visible .j3-flag { outline: 3px solid #f3d27a; outline-offset: 2px; }
.j3-flag { position: relative; display: grid; place-items: center; width: 28px; height: 28px; box-sizing: border-box; background: var(--c); border-top: 3px solid #1d1711; box-shadow: 0 0 0 1px rgba(0,0,0,.6), 2px 3px 6px rgba(0,0,0,.35); }
.j3-flag i { width: 20px; height: 20px; border-radius: 50%; background: #efe6cf center / cover; box-shadow: 0 0 0 1.5px rgba(20,16,12,.7); }
.j3-pole { width: 2px; height: 10px; background: #2a2017; box-shadow: 0 0 0 1px rgba(243,234,214,.3); }
.j3-plate { display: flex; align-items: baseline; gap: 5px; margin-top: 1px; padding: 2px 6px 2px 5px; background: rgba(20,17,13,.88); border-left: 3px solid var(--c); color: #f3ead6; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,.35); }
.j3-plate b { font-family: var(--display); font-size: 13px; font-weight: 700; letter-spacing: .04em; line-height: 1.25; }
.j3-plate small { font-size: 12px; color: #d9ccb0; font-variant-numeric: tabular-nums; }
.j3-ty { font-style: normal; font-size: 12px; color: #d9ccb0; margin-right: 2px; }
/* 本城：大きな旗・金の縁・「本」の印 */
.j3-ban.hq .j3-flag { width: 36px; height: 36px; box-shadow: 0 0 0 2px #d4ab52, 0 0 0 3.5px rgba(0,0,0,.65), 2px 4px 8px rgba(0,0,0,.4); }
.j3-ban.hq .j3-flag i { width: 27px; height: 27px; }
.j3-ban.hq .j3-pole { height: 12px; }
.j3-ban.hq .j3-plate { padding: 3px 8px 3px 6px; border-top: 1px solid rgba(212,171,82,.75); }
.j3-ban.hq .j3-plate b { font-size: 15px; }
.j3-hq { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; display: grid; place-items: center; font-family: var(--display); font-style: normal; font-size: 12px; font-weight: 800; color: #1d1711; background: #e0bb62; box-shadow: 0 0 0 1.5px #1d1711; }
/* 砦：小さな三角の旗・点線の縁 */
.j3-ban.tr .j3-flag { width: 22px; height: 22px; border-top-width: 2px; }
.j3-ban.tr .j3-flag i { width: 15px; height: 15px; }
.j3-ban.tr .j3-pole { height: 8px; }
.j3-ban.tr .j3-plate { border-left-style: dotted; padding: 1px 5px 1px 4px; }
.j3-ban.tr .j3-plate b { font-size: 12px; font-weight: 600; }
.j3-ban.me .j3-plate { box-shadow: inset 0 -2px 0 #d9b45a, 0 2px 5px rgba(0,0,0,.35); }
.j3-ban.tgt .j3-flag { box-shadow: 0 0 0 2px #ff6a4a, 0 0 0 4px rgba(20,16,12,.75), 2px 3px 6px rgba(0,0,0,.35); }
.j3-ban.tgt .j3-plate { background: rgba(78,24,14,.92); }
.j3-ban.sel .j3-flag { box-shadow: 0 0 0 3px #f3d27a, 0 0 0 5px rgba(20,16,12,.8), 0 0 18px rgba(243,210,122,.55); }
.j3-ban.sel .j3-plate { background: #3a2c12; box-shadow: 0 0 0 2px #f3d27a; }
.j3-ban:hover .j3-flag { filter: brightness(1.15); }
.j3-ban:hover .j3-plate { background: rgba(48,38,26,.95); }
.j3-tag { position: absolute; top: -9px; right: -13px; min-width: 20px; height: 20px; display: grid; place-items: center; font-family: var(--display); font-style: normal; font-size: 12px; font-weight: 800; color: #fff5ea; background: #b8402a; box-shadow: 0 0 0 1.5px rgba(20,16,12,.8); }
.j3-tag.kiki { background: #f3ead6; color: #9b3524; box-shadow: 0 0 0 1.5px #9b3524; }
.j3-tag.fell { background: #2a2017; }
.j3-tag.fell.mine { background: #b8402a; }
.j3-tag.atk { background: #d0472e; }
/* 遠くから：家紋の丸だけ（格は大きさで） */
.j3-ban.min { min-width: 24px; }
.j3-ban.min .j3-flag { width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 0; }
.j3-ban.min.hq .j3-flag { width: 22px; height: 22px; box-shadow: 0 0 0 2px #d4ab52, 0 0 0 3px rgba(0,0,0,.6); }
.j3-ban.min.tr .j3-flag { width: 11px; height: 11px; }
.j3-ban.min .j3-plate, .j3-ban.min .j3-tag, .j3-ban.min .j3-hq { display: none; }
.j3-ban.min .j3-flag i { width: calc(100% - 3px); height: calc(100% - 3px); }
.j3-ban.min .j3-pole { height: 5px; }
.j3-ban.min.tgt .j3-flag { box-shadow: 0 0 0 2px #ff6a4a, 0 0 0 3px rgba(20,16,12,.7); }
/* 大名家の名（領地の上に大きく） */
.j3-clan-l { position: absolute; left: 0; top: 0; pointer-events: none; display: flex; flex-direction: column; align-items: center; font-family: var(--display); color: var(--c); white-space: nowrap; will-change: transform, opacity; transition: opacity .25s; }
.j3-clan-l b { font-size: var(--fs, 22px); font-weight: 800; letter-spacing: .18em; line-height: 1.15; color: #fff8e6; padding: 0 .1em 1px .28em; border-bottom: 3px solid var(--c); text-shadow: 0 0 1px #000, 0 0 3px rgba(0,0,0,.95), 0 2px 5px rgba(0,0,0,.75); }
.j3-clan-l small { margin-top: 2px; font-size: 12px; font-weight: 700; letter-spacing: .1em; color: #fff8e6; text-shadow: 0 0 1px #000, 0 1px 3px rgba(0,0,0,.95); }
.j3-clan-l.me b { color: #ffe29a; border-bottom-color: #e8c05c; }
/* 勢力の帯（上の帯のすぐ下） */
.jp.j3 .jp-power { top: var(--j3top, 60px); left: 0; right: 0; border-radius: 0; }
/* 凡例 */
.j3-legend { position: absolute; right: calc(12px + env(safe-area-inset-right, 0px)); bottom: calc(68px + env(safe-area-inset-bottom, 0px)); z-index: 3; width: 268px; max-height: calc(100% - 180px); overflow-y: auto; padding: 10px 12px; background: rgba(20,17,13,.94); box-shadow: 0 0 0 1px rgba(194,162,90,.7), 0 6px 18px rgba(0,0,0,.4); color: var(--washi); font-size: 12px; line-height: 1.5; }
.j3-legend h4 { margin: 0 0 6px; font-family: var(--display); font-size: 14px; letter-spacing: .14em; color: var(--kin); }
.j3-legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.j3-legend li { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 8px; }
.j3-legend .sw { display: grid; place-items: center; height: 22px; }
.j3-legend .fl { width: 18px; height: 18px; background: #7a6a4a; border-top: 3px solid #1d1711; box-sizing: border-box; }
.j3-legend .fl.hq { width: 22px; height: 22px; box-shadow: 0 0 0 2px #d4ab52; }
.j3-legend .fl.tr { width: 13px; height: 13px; border-top-width: 2px; }
.j3-legend .rd { width: 34px; height: 0; border-top: 2px solid rgba(236,214,160,.9); box-shadow: 0 1px 0 rgba(70,50,28,.8); }
.j3-legend .rd.front { border-top: 3px dashed #ff6a4a; box-shadow: none; }
.j3-legend .rd.sup { border-top: 3px solid #e8c05c; box-shadow: 0 1px 0 rgba(30,22,12,.9), 0 -1px 0 rgba(30,22,12,.9); }
.j3-legend .rd.cut { border-top: 3px dotted #8a8a8a; box-shadow: none; }
.j3-legend .fr { width: 6px; height: 22px; background: #c8322a; box-shadow: 0 0 0 1px rgba(20,16,12,.8); }
.j3-legend .rg { width: 18px; height: 18px; border-radius: 50%; border: 2px dashed #ff6a4a; }
.j3-legend .bd { width: 30px; height: 12px; border: 2.5px solid #e2ba5a; box-sizing: border-box; }
.j3-legend .j3-tag { position: static; }
/* 軍勢の駒 */
.j3-piece { position: absolute; left: 0; top: 0; width: 40px; height: 40px; margin: -46px 0 0 -20px; border-radius: 50%; background: #333 center / cover; box-shadow: 0 0 0 2.5px var(--c), 0 0 0 4px rgba(20,16,12,.85), 0 4px 8px rgba(0,0,0,.45); will-change: transform; }
.j3-piece::after { content: ''; position: absolute; left: 50%; bottom: -9px; margin-left: -5px; border: 5px solid transparent; border-top-color: rgba(20,16,12,.85); border-bottom: 0; }
.j3-piece.threat { box-shadow: 0 0 0 2.5px #e8563a, 0 0 0 4px rgba(20,16,12,.85), 0 4px 8px rgba(0,0,0,.45); }
.j3-piece.lose { filter: grayscale(.6) brightness(.85); }
.j3-piece.far { width: 30px; height: 30px; margin: -38px 0 0 -15px; }
/* 城の小さな札（指した時） */
.j3-compass { position: absolute; left: calc(12px + env(safe-area-inset-left, 0px)); top: calc(var(--j3top, 60px) + 10px); z-index: 2; width: 48px; height: 48px; border-radius: 50%; border: 1px solid rgba(194,162,90,.85); background: rgba(24,19,14,.88); color: #f3ead6; padding: 0; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
.j3-compass[hidden] { display: none; }
.j3-compass span { position: absolute; inset: 0; display: block; transition: none; }
.j3-compass b { position: absolute; left: 50%; top: 3px; transform: translateX(-50%); font-family: var(--display); font-size: 13px; line-height: 1; color: #f0c86a; }
.j3-compass i { position: absolute; left: 50%; top: 18px; width: 0; height: 0; margin-left: -6px; border: 6px solid transparent; border-bottom: 14px solid #d0472e; border-top: 0; }
.j3-compass i::after { content: ''; position: absolute; left: -6px; top: 14px; border: 6px solid transparent; border-top: 12px solid #e8e0cc; border-bottom: 0; }
.j3-kv { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 6px 0 0; }
.j3-kv div { display: flex; align-items: baseline; gap: 5px; }
.j3-kv dt { font-size: 12px; color: var(--kin); letter-spacing: .08em; }
.j3-kv dd { margin: 0; font-family: var(--display); font-size: 16px; font-variant-numeric: tabular-nums; }
.j3-kv dd small { font-family: var(--ui); font-size: 12px; color: var(--washi-dim); margin-left: 2px; }
.j3-kv dd.bad { color: #f2a48e; }
.j3-tip { position: absolute; z-index: 3; pointer-events: none; background: rgba(24,19,14,.95); color: #f3ead6; padding: 7px 10px; box-shadow: 0 0 0 1px rgba(194,162,90,.8); font-size: 13px; line-height: 1.5; white-space: nowrap; }
.j3-tip b { font-family: var(--display); font-size: 14px; }
.j3-tip .good { color: #b3c894; } .j3-tip .even { color: #e6c77a; } .j3-tip .bad { color: #f0a08a; }
/* 下の知らせの列 */
.j3-news { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; pointer-events: auto; }
.j3-news::-webkit-scrollbar { display: none; }
.j3-news p { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; margin: 0; padding: 4px 12px 4px 4px; max-width: 320px; min-height: 44px; box-sizing: border-box; background: rgba(20,17,13,.88); border-left: 3px solid var(--c, var(--kin)); color: var(--washi); font-size: 13px; line-height: 1.35; box-shadow: 0 3px 10px rgba(0,0,0,.3); }
.j3-news p img { width: 36px; height: 36px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0 2px var(--c, var(--kin)); }
.j3-news p small { display: block; font-size: 12px; color: var(--washi-dim); }
.j3-news p.good { color: #cfe0b0; } .j3-news p.bad { color: #f5b6a4; } .j3-news p.big { font-weight: 700; }
.j3-news p.old { opacity: .78; }
/* 右の札：武将の顔と能力 */
.j3-bust { display: grid; grid-template-columns: 84px 1fr; gap: 12px; align-items: start; margin: 12px 0 4px; padding: 10px; background: rgba(14,11,8,.55); border: 1px solid var(--gold-line); }
.j3-bust img { width: 84px; height: 84px; display: block; box-shadow: 0 0 0 2px var(--c), 0 0 0 3px rgba(0,0,0,.6); }
.j3-bimg { appearance: none; border: 0; padding: 0; background: none; cursor: pointer; min-width: 44px; min-height: 44px; }
.j3-bimg:focus-visible { outline: 2px solid var(--kin); outline-offset: 3px; }
.j3-trs { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0 4px; }
.j3-trs span { font-size: 12px; padding: 1px 6px; border: 1px solid rgba(194,162,90,.6); color: #e6cf94; }
.j3-bust h5 { margin: 0 0 2px; font-family: var(--display); font-size: 18px; letter-spacing: .08em; font-weight: 800; }
.j3-bust h5 small { display: block; font-family: var(--ui); font-size: 12px; font-weight: 400; color: var(--washi-dim); letter-spacing: .02em; }
.j3-ab { display: grid; grid-template-columns: 36px 1fr 34px; align-items: center; gap: 6px; font-size: 12px; margin-top: 4px; }
.j3-ab span { color: var(--washi-dim); }
.j3-ab i { display: block; height: 7px; background: rgba(236,228,210,.1); position: relative; }
.j3-ab i::after { content: ''; position: absolute; inset: 0; right: auto; width: var(--v); background: linear-gradient(90deg, #8e6f2e, #d9b45a); }
.j3-ab b { text-align: right; font-family: var(--display); font-size: 14px; font-variant-numeric: tabular-nums; }
.j3-note { position: absolute; left: 50%; top: 80px; transform: translateX(-50%); z-index: 3; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; background: rgba(20,17,13,.94); box-shadow: 0 0 0 1px rgba(194,162,90,.7); font-size: 13px; color: var(--washi); }
.j3-note .btn { min-height: 44px; }
.j3-wait { position: absolute; inset: 0; z-index: 1; display: grid; place-items: center; font-family: var(--display); font-size: 16px; letter-spacing: .12em; color: #2a2017; }
/* 左上の「戻る」の釦（画面に固定）と重ならないよう、帯の頭を空ける */
.j3-top { padding-left: 150px; }
@media (max-width: 1280px) {
  .j3-top > * { padding: 4px 10px; }
  .j3-res { gap: 2px 12px; }
  .j3-res dd { font-size: 15px; }
  .j3-clan small { display: none; }
  .j3-date span { font-size: 14px; }
}
@media (max-width: 900px) {
  .j3-top { flex-wrap: wrap; }
  .j3-news p { max-width: 260px; }
}
/* iPhone の横：帯は一段に詰め、地図を広く。見え方の釦は右の縁に縦に */
@media (max-height: 500px) {
  .j3-top { flex-wrap: nowrap; min-height: 0; height: 52px; padding-left: 132px; font-size: 12px; }
  .j3-top > * { padding: 2px 8px; }
  .j3-date { gap: 6px; }
  .j3-date b { width: 34px; height: 34px; font-size: 17px; }
  .j3-date span { font-size: 13px; }
  .j3-date small, .j3-clan, .j3-res dd em, .j3-res .j3-koku, .j3-res .j3-shiro { display: none; }
  .j3-res { flex-wrap: nowrap; gap: 10px; overflow: hidden; }
  .j3-res dd { font-size: 14px; }
  .j3-top .j3-act { margin-left: auto; }
  .j3-top .j3-act .btn { padding: 0 10px; font-size: 13px; }
  .jp.j3 .jp-tools { display: grid; grid-template-columns: repeat(2, 50px); right: 8px; gap: 8px; }
  .jp.j3 .jp-tools .btn { min-height: 44px; min-width: 0; padding: 0 4px; font-size: 13px; }
  .j3-res div, .j3-res dt, .j3-res dd { white-space: nowrap; }
  .j3-date span { display: none; }
  .j3-news { right: 124px; bottom: 8px; left: 8px; }
  .j3-news p:not(:first-child) { display: none; }
  .j3-news p { max-width: 100%; min-height: 40px; font-size: 12px; }
  .j3-news p > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .j3-news p img { width: 30px; height: 30px; }
  .j3-legend { right: 124px; bottom: 60px; top: auto; max-height: calc(100% - 130px); width: 240px; }
  .j3-clan-l small { display: none; }
  .j3-note { top: 64px; max-width: calc(100% - 100px); flex-wrap: wrap; }
}
body.rm .j3-ban, body.rm .j3-piece { transition: none; }
`;
  document.head.appendChild(st);
}

// ---------------- 描き手（一つだけ作って使い回す。携帯は WebGL の数に限りがあるので） ----------------
let GL = null;
function gl() {
  if (GL) return GL;
  const canvas = document.createElement('canvas');
  canvas.className = 'j3-gl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '日本の3D地図。城は幟を押すか、右の一覧から選べます');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  GL = { renderer, canvas };
  return GL;
}

// ---------------- 地図を据える ----------------
// api は japan.js から：J・D・P・sel()・setSel(c)・anim()・still()・attackable(c)・troops(c)・danger(c)・odds(c)・army()・koku(c)・when(t)・allied(a,b)・attack()・next()・reopen()
export function mount3D(api) {
  const mapEl = api.mapEl;
  const tools = mapEl.querySelector('.jp-tools');
  // 切り替えの押しボタン（2D の時も出す）
  const tg = document.createElement('button');
  tg.className = 'btn small'; tg.id = 'jp-mode';
  const small = typeof matchMedia === 'function' && matchMedia('(max-height: 500px)').matches;
  tg.textContent = mode === '3d' ? (small ? '平面' : '平面の地図') : (small ? '立体' : '立体の地図');
  tg.setAttribute('aria-label', mode === '3d' ? '平面（2D）の地図に切り替える' : '立体（3D）の地図に切り替える');
  tg.onclick = () => { setMode(mode === '3d' ? '2d' : '3d'); api.reopen(); };
  if (tools) tools.appendChild(tg);
  if (mode !== '3d') return null;
  let G3;
  try { G3 = gl(); } catch (e) { tg.remove(); setMode('2d'); return null; }
  injectStyle();
  const { J, D, P } = api;
  const root = mapEl.closest('.jp'); root.classList.add('j3');
  const side = document.getElementById('jp-side');
  const { renderer, canvas } = G3;
  mapEl.insertBefore(canvas, mapEl.firstChild);
  const layer = document.createElement('div'); layer.className = 'j3-layer';
  mapEl.appendChild(layer);
  const top = document.createElement('div'); top.className = 'j3-top';
  mapEl.appendChild(top);
  const news = document.createElement('div'); news.className = 'j3-news'; news.setAttribute('role', 'log'); news.setAttribute('aria-label', '近ごろの知らせ');
  mapEl.appendChild(news);
  const tip = document.createElement('div'); tip.className = 'j3-tip'; tip.hidden = true;
  // 方角（回したり傾けたりした時だけ出る。押すと北を上に戻す）
  const compass = document.createElement('button'); compass.type = 'button'; compass.className = 'j3-compass'; compass.hidden = true;
  compass.setAttribute('aria-label', '北を上に戻す');
  compass.innerHTML = '<span aria-hidden="true"><b>北</b><i></i></span>';
  compass.onclick = () => { goal.yaw = Math.round(goal.yaw / (2 * Math.PI)) * 2 * Math.PI; goal.tilt = 0; need = true; };
  mapEl.appendChild(compass);
  mapEl.appendChild(tip);
  // 凡例（見え方の押しボタンの「凡例」で開け閉め。開いたかは端末ごとに覚えない）
  const leg = document.createElement('div'); leg.className = 'j3-legend'; leg.id = 'j3-legend'; leg.hidden = true;
  leg.innerHTML = `<h4>地図の見方</h4><ul>
    <li><span class="sw"><i class="fl hq"></i></span><span>本城（家の要。大きな旗・金の縁・「本」）</span></li>
    <li><span class="sw"><i class="fl"></i></span><span>城（▲山城・■平城）</span></li>
    <li><span class="sw"><i class="fl tr"></i></span><span>砦（◆。小さな旗）</span></li>
    <li><span class="sw"><i class="bd"></i></span><span>自分の家の領地の境（金の線）</span></li>
    <li><span class="sw"><i class="rd"></i></span><span>街道（隣り合う城をつなぐ道）</span></li>
    <li><span class="sw"><i class="rd front"></i></span><span>攻め口（自分の城から攻められる城へ）</span></li>
    <li><span class="sw"><i class="rd sup"></i></span><span>補給線（本城から味方の城だけを通る道）</span></li>
    <li><span class="sw"><i class="rd cut"></i></span><span>補給の断たれた城への道</span></li>
    <li><span class="sw"><i class="fr"></i></span><span>前線（敵の城と向き合う道）</span></li>
    <li><span class="sw"><i class="rg"></i></span><span>いま攻められる城</span></li>
    <li><span class="sw"><em class="j3-tag atk">攻</em></span><span>攻められる城の印</span></li>
    <li><span class="sw"><em class="j3-tag kiki">危</em></span><span>隣の敵が強い自分の城</span></li>
    <li><span class="sw"><em class="j3-tag">急</em></span><span>敵が攻め寄せている自分の城</span></li>
    <li><span class="sw"><em class="j3-tag fell">落</em></span><span>この季節に持ち主が替わった城</span></li>
  </ul>`;
  mapEl.appendChild(leg);
  const lg = document.createElement('button');
  lg.className = 'btn small'; lg.id = 'jp-leg'; lg.type = 'button';
  lg.setAttribute('aria-controls', 'j3-legend'); lg.setAttribute('aria-expanded', 'false');
  lg.textContent = '凡例';
  lg.setAttribute('aria-label', '地図の見方（凡例）を開く');
  lg.onclick = () => { leg.hidden = !leg.hidden; lg.setAttribute('aria-expanded', String(!leg.hidden)); lg.setAttribute('aria-label', leg.hidden ? '地図の見方（凡例）を開く' : '地図の見方（凡例）を閉じる'); };
  if (tools) tools.insertBefore(lg, tg);
  const wait = document.createElement('div'); wait.className = 'j3-wait'; wait.textContent = '地図を広げています…';
  mapEl.appendChild(wait);
  const still = () => api.still();

  let ready = false, disposed = false, raf = 0;
  let scene, camera, mesh, tex, texCv, texG, clouds = [], keeps = [];
  const cam = { x: 500, z: 700, d: 900, yaw: 0, tilt: 0 }, goal = { x: 500, z: 700, d: 900, yaw: 0, tilt: 0 };
  const FOV = 34;
  let goalId = null, homeD = 520, need = true, texSig = '', lastT = performance.now(), topH0 = 0;
  const inkRGB = {};
  for (const [id, css] of Object.entries(D.ink)) inkRGB[id] = rgbOf(css);
  const rgba = (id, a, k = 0) => { const c = inkRGB[id] || [120, 120, 120]; return `rgba(${Math.round(c[0] * (1 - k))},${Math.round(c[1] * (1 - k))},${Math.round(c[2] * (1 - k))},${a})`; };
  const season = () => api.when(J.turn).season;

  // 道（隣り合う城どうし）。向きによらず同じ曲がり方に
  const roads = [];
  for (const c of D.castles) for (const n of D.adj[c.id]) if (c.id < n) roads.push([c, D.byId[n]]);
  const curve = (a, b) => {
    const lo = a.id < b.id ? a : b, hi = lo === a ? b : a;
    const dx = hi.c - lo.c, dz = hi.r - lo.r, len = Math.hypot(dx, dz) || 1;
    const off = (hash2(lo.id, hi.id) - 0.5) * 0.14 * len;
    const mx = (lo.c + hi.c) / 2 - (dz / len) * off, mz = (lo.r + hi.r) / 2 + (dx / len) * off;
    return (t) => { if (lo !== a) t = 1 - t; const u = 1 - t; return [u * u * lo.c + 2 * u * t * mx + t * t * hi.c, u * u * lo.r + 2 * u * t * mz + t * t * hi.r]; };
  };

  // ---------------- 三次元の場 ----------------
  const build = () => {
    const T = terrain();
    scene = new THREE.Scene();
    // 地図は霞ませず、くっきり（空は沖の海の色にそろえて、地平の継ぎ目を消す）
    const seaC = new THREE.Color(`rgb(${SEA_DEEP.join(',')})`);
    scene.background = seaC;
    scene.fog = new THREE.Fog(seaC, 1e5, 2e5);
    camera = new THREE.PerspectiveCamera(FOV, 1, 5, 8000);
    // 地形：切り出した升目に一つずつ頂点
    const nx = Q1 - Q0, nz = R1 - R0;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let r = 0; r < nz; r++) for (let q = 0; q < nx; q++) {
      const k = r * nx + q, gi = (r + R0) * GRID.gc + (q + Q0);
      const x = (q + Q0) * S + 1.5, z = (r + R0) * S + 1.5;
      pos[k * 3] = x; pos[k * 3 + 1] = T.H[gi]; pos[k * 3 + 2] = z;
      uv[k * 2] = (x - X0) / (X1 - X0); uv[k * 2 + 1] = 1 - (z - Z0) / (Z1 - Z0);
    }
    const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let n = 0;
    for (let r = 0; r < nz - 1; r++) for (let q = 0; q < nx - 1; q++) {
      const a = r * nx + q, b = a + 1, c = a + nx, d = c + 1;
      index[n++] = a; index[n++] = c; index[n++] = b; index[n++] = b; index[n++] = c; index[n++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    texCv = document.createElement('canvas'); texCv.width = TW; texCv.height = TH;
    texG = texCv.getContext('2d');
    tex = new THREE.CanvasTexture(texCv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // 細かな地のざらつき（寄っても絵がぼやけて見えないように、小さな斑を繰り返して掛ける）
    const uv1 = new Float32Array(nx * nz * 2);
    for (let i = 0; i < nx * nz; i++) { uv1[i * 2] = pos[i * 3] / 24; uv1[i * 2 + 1] = pos[i * 3 + 2] / 24; }
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    const dc = document.createElement('canvas'); dc.width = dc.height = 128;
    const dg = dc.getContext('2d'); const di = dg.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = 0.5 * vnoise(x / 8, y / 8) + 0.3 * vnoise(x / 3.2, y / 3.2) + 0.2 * hash2(x, y);
      const o = (y * 128 + x) * 4; const c = 200 + v * 55; di.data[o] = di.data[o + 1] = di.data[o + 2] = c; di.data[o + 3] = 255;
    }
    // 継ぎ目が出ないよう、四隅を混ぜる
    dg.putImageData(di, 0, 0);
    dg.globalAlpha = 0.5; dg.drawImage(dc, 64, 64); dg.drawImage(dc, -64, -64); dg.drawImage(dc, 64, -64); dg.drawImage(dc, -64, 64); dg.globalAlpha = 1;
    const detail = new THREE.CanvasTexture(dc);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.channel = 1;
    mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, aoMap: detail, aoMapIntensity: 1 }));
    scene.add(mesh);
    // 沖の海（地平まで）
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: new THREE.Color(`rgb(${SEA_DEEP.join(',')})`) }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(450, -8.2, 650);
    scene.add(sea);
    scene.add(new THREE.HemisphereLight(0xf4efe4, 0x4a4a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6); sun.position.set(-1, 1.4, -1); scene.add(sun);
    // 城の格で形を変える：本城は石垣に三重の天守、城は二重、砦は木の柵と物見櫓。格ごと・部品ごとに InstancedMesh 一つ
    const hip = (r, h) => { const g = new THREE.ConeGeometry(r, h, 4); g.rotateY(Math.PI / 4); return g; };
    const wall = (rt, rb, h) => { const g = new THREE.CylinderGeometry(rt, rb, h, 4); g.rotateY(Math.PI / 4); return g; };
    const STONE = 0x8c8576, WHITE = 0xece6d8, ROOF = 0x2e3138, WOOD = 0x6e4c2c, GOLD = 0xc9a24a;
    // [形, 色, 底からの高さ（中心）, 横の伸び x, z]
    const KEEP = {
      hq: [[wall(0.95, 1.3, 0.62), STONE, 0.31], [new THREE.BoxGeometry(1.15, 0.42, 0.95), WHITE, 0.83], [hip(1.0, 0.34), ROOF, 1.21, 1.08, 0.9],
        [new THREE.BoxGeometry(0.8, 0.36, 0.66), WHITE, 1.52], [hip(0.72, 0.3), ROOF, 1.84, 1.1, 0.92], [new THREE.BoxGeometry(0.5, 0.32, 0.42), WHITE, 2.1],
        [hip(0.5, 0.36), ROOF, 2.44, 1.08, 0.94], [new THREE.BoxGeometry(0.1, 0.1, 0.36), GOLD, 2.6],
        [new THREE.BoxGeometry(0.42, 0.34, 0.42), WHITE, 0.79, 1, 1, -0.95, 0.75], [hip(0.38, 0.22), ROOF, 1.07, 1, 1, -0.95, 0.75]],
      '': [[wall(0.8, 1.08, 0.5), STONE, 0.25], [new THREE.BoxGeometry(0.95, 0.38, 0.78), WHITE, 0.69], [hip(0.85, 0.3), ROOF, 1.03, 1.08, 0.9],
        [new THREE.BoxGeometry(0.58, 0.32, 0.48), WHITE, 1.32], [hip(0.55, 0.32), ROOF, 1.63, 1.08, 0.92]],
      tr: [[(() => { const g = new THREE.CylinderGeometry(1, 1, 0.42, 12, 1, true); return g; })(), WOOD, 0.21],
        [new THREE.BoxGeometry(0.34, 0.95, 0.34), WOOD, 0.48], [hip(0.36, 0.26), ROOF, 1.06], [new THREE.BoxGeometry(0.5, 0.28, 0.5), 0x9a7a52, 0.14, 1, 1, 0.45, 0.35]],
    };
    const SC = CASTLE_SC;
    const mats = new Map();
    const matOf = (col) => { if (!mats.has(col)) mats.set(col, new THREE.MeshLambertMaterial({ color: col, side: col === WOOD ? THREE.DoubleSide : THREE.FrontSide })); return mats.get(col); };
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
    for (const gr of Object.keys(KEEP)) {
      const list = D.castles.filter((c) => (c.hq ? 'hq' : c.type === 'toride' ? 'tr' : '') === gr);
      if (!list.length) continue;
      const sc = SC[gr];
      for (const [g, col, y, sx = 1, sz = 1, ox = 0, oz = 0] of KEEP[gr]) {
        const im = new THREE.InstancedMesh(g, matOf(col), list.length);
        list.forEach((c, i) => {
          // 城ごとに少し向きを変え、斜面では低い側へ石垣を沈める
          const rot = hash2(c.id, 77) * Math.PI * 0.5;
          q4.setFromAxisAngle(yAx, rot);
          const cs = Math.cos(rot), sn = Math.sin(rot);
          const gx = c.c + (ox * cs + oz * sn) * sc, gz = c.r + (-ox * sn + oz * cs) * sc;
          const base = Math.min(hAt(c.c, c.r), hAt(c.c + sc, c.r), hAt(c.c - sc, c.r), hAt(c.c, c.r + sc), hAt(c.c, c.r - sc)) - 0.15;
          s4.set(sc * sx, sc, sc * sz); p4.set(gx, base + y * sc, gz);
          m4.compose(p4, q4, s4); im.setMatrixAt(i, m4);
        });
        im.frustumCulled = false;
        scene.add(im); keeps.push(im);
      }
    }
    // 雲（遠くから見た時だけ）
    const cc = document.createElement('canvas'); cc.width = cc.height = 256;
    const cg = cc.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 60 + Math.random() * 136, y = 90 + Math.random() * 76, r = 26 + Math.random() * 44;
      const gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = gr; cg.fillRect(0, 0, 256, 256);
    }
    const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace;
    const [bx0, bz0, bx1, bz1] = T.bounds;
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0 }));
      const s = 140 + hash2(i, 7) * 200;
      sp.scale.set(s, s * 0.55, 1);
      sp.position.set(mix(bx0, bx1, hash2(i, 3)), 70 + hash2(i, 5) * 40, mix(bz0, bz1, hash2(i, 9)));
      sp.userData.v = 1.5 + hash2(i, 11) * 2.5;
      scene.add(sp); clouds.push(sp);
    }
    paint(true);
  };

  // ---------------- 地の絵（季節の地＋家の色＋国境＋街道＋攻めの道） ----------------
  const clanPaths = () => {
    // 升ごとの持ち主
    const { gc, gr } = GRID;
    const own = new Int32Array(gc * gr).fill(-1);
    for (let i = 0; i < own.length; i++) { const k = D.near[i]; if (k >= 0) own[i] = J.own[D.castles[k].id]; }
    const out = [];
    const ids = [...new Set(Object.values(J.own))];
    const w2 = gc + 2, h2 = gr + 2;
    const F = new Float32Array(w2 * h2);
    for (const id of ids) {
      let b0 = 1e9, b1 = 1e9, b2 = -1, b3 = -1;
      F.fill(0);
      for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) if (own[r * gc + q] === id) { F[(r + 1) * w2 + q + 1] = 1; b0 = Math.min(b0, q + 1); b1 = Math.min(b1, r + 1); b2 = Math.max(b2, q + 1); b3 = Math.max(b3, r + 1); }
      if (b2 < 0) continue;
      const bb = [Math.max(0, b0 - 3), Math.max(0, b1 - 3), Math.min(w2 - 1, b2 + 3), Math.min(h2 - 1, b3 + 3)];
      const path = new Path2D();
      for (const { P, closed } of contours(blur(F, w2, h2), w2, h2, 0.5, bb)) {
        if (P.length < 3) continue;
        const X = (p) => tx((p[0] - 1) * S + 1.5), Z = (p) => tz((p[1] - 1) * S + 1.5);
        path.moveTo(X(P[0]), Z(P[0])); for (let i = 1; i < P.length; i++) path.lineTo(X(P[i]), Z(P[i])); if (closed) path.closePath();
      }
      out.push([+id, path]);
    }
    // 家の名を置く所：いちばん大きな一続きの領地の真ん中（海に落ちないよう、その領地の升に寄せる）
    const comp = new Int32Array(gc * gr).fill(-1), stack = [];
    clanAt = [];
    let cn = 0;
    const best = {};
    for (let i0 = 0; i0 < own.length; i0++) {
      if (own[i0] < 0 || comp[i0] >= 0) continue;
      const id = own[i0], cells = [];
      comp[i0] = cn; stack.push(i0);
      while (stack.length) {
        const i = stack.pop(); cells.push(i);
        const q = i % gc, r = (i - q) / gc;
        for (const j of [q > 0 ? i - 1 : -1, q < gc - 1 ? i + 1 : -1, r > 0 ? i - gc : -1, r < gr - 1 ? i + gc : -1]) if (j >= 0 && comp[j] < 0 && own[j] === id) { comp[j] = cn; stack.push(j); }
      }
      cn++;
      if (!best[id] || cells.length > best[id].length) best[id] = cells;
    }
    let total = 0;
    for (const cells of Object.values(best)) total += cells.length;
    for (const [id, cells] of Object.entries(best)) {
      let sx = 0, sz = 0;
      for (const i of cells) { sx += i % gc; sz += Math.floor(i / gc); }
      sx /= cells.length; sz /= cells.length;
      let bi = cells[0], bd = 1e9;
      for (const i of cells) { const d = (i % gc - sx) ** 2 + (Math.floor(i / gc) - sz) ** 2; if (d < bd) { bd = d; bi = i; } }
      clanAt.push({ id: +id, x: (bi % gc) * S + 1.5, z: Math.floor(bi / gc) * S + 1.5, n: cells.length });
    }
    clanAt.sort((a, b) => (b.id === P) - (a.id === P) || b.n - a.n);
    return out;
  };
  let clanAt = [];
  // 大名家の名（領地の上に大きく。寄りすぎ・引きすぎ・狭すぎる時は出さない）
  const clanEls = new Map();
  const layoutClans = (W, H, topH) => {
    const seen = new Set(), boxes = [];
    const scale = H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * cam.d);
    for (const a of clanAt) {
      const size = Math.sqrt(a.n) * S * scale;
      const cl = D.clans[a.id];
      if (!cl || cam.d < 170 || (size < 90 && a.id !== P) || size < 50) continue;
      const [x, y, z] = project(a.x, hAt(a.x, a.z) + 0.5, a.z, W, H);
      if (z >= 1 || x < 20 || x > W - 20 || y < topH + 24 || y > H - 20) continue;
      const fs = clamp(size * 0.16, 15, 34);
      const nm = cl.name;
      const bw = nm.length * fs * 1.2 + 10, bh = fs * 1.2 + 16;
      const bx = x - bw / 2, by = y - bh / 2;
      if (boxes.some((b) => bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1])) continue;
      boxes.push([bx, by, bw, bh]);
      seen.add(a.id);
      let e = clanEls.get(a.id);
      const head = api.head ? api.head(a.id) : cl.daimyo;
      const sig = nm + '|' + (head || '');
      if (!e) { e = { el: document.createElement('div'), sig: '' }; e.el.setAttribute('aria-hidden', 'true'); layer.insertBefore(e.el, layer.firstChild); clanEls.set(a.id, e); }
      if (e.sig !== sig) { e.sig = sig; e.el.className = 'j3-clan-l' + (a.id === P ? ' me' : ''); e.el.style.setProperty('--c', D.ink[a.id] || '#555'); e.el.innerHTML = `<b>${esc(nm)}</b>${head ? `<small>${esc(head)}</small>` : ''}`; }
      e.el.style.display = '';
      e.el.style.zIndex = '1500';
      e.el.style.setProperty('--fs', fs.toFixed(0) + 'px');
      e.el.style.opacity = String(clamp((cam.d - 170) / 140, 0, 1));
      e.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    for (const [id, e] of clanEls) if (!seen.has(id)) e.el.style.display = 'none';
  };
  let clanCache = null, ownSig = '', staticCv = null, staticSig = '';
  const paint = (force) => {
    const sel = api.sel();
    const oSig = JSON.stringify(J.own);
    const sig = [season(), sel ? sel.id : -1, J.turn, (J.moves || []).length, J.threats.length, oSig.length, hashStr(oSig)].join('|');
    if (!force && sig === texSig) return;
    texSig = sig;
    const T = terrain();
    const g = texG;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // 動かない絵（季節の地・家の色・国境・国の名・街道）は、持ち主か季節が変わった時だけ描き直す
    const stSig = season() + '|' + oSig;
    if (stSig !== staticSig || !staticCv) {
      staticSig = stSig;
      if (oSig !== ownSig || !clanCache) { clanCache = clanPaths(); ownSig = oSig; }
      if (!staticCv) { staticCv = document.createElement('canvas'); staticCv.width = TW; staticCv.height = TH; }
      const g = staticCv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(baseCanvas(season()), 0, 0);
      // 家の色（半透明）。境の内側に濃い色の帯を引き、国ごとの色分けを一目で（信長の野望の地図のように）
      g.save(); g.clip(T.coast, 'evenodd');
      // 色合いだけを家の色に染め（明るさ＝山の陰は残す）、上から薄く重ねる。山の起伏と家の色が両方見える
      g.globalCompositeOperation = 'color';
      for (const [id, path] of clanCache) { g.fillStyle = rgba(id, id === P ? 0.4 : 0.34); g.fill(path, 'evenodd'); }
      g.globalCompositeOperation = 'source-over';
      for (const [id, path] of clanCache) { g.fillStyle = rgba(id, id === P ? 0.2 : 0.17); g.fill(path, 'evenodd'); }
      g.lineJoin = 'round';
      for (const [id, path] of clanCache) { g.save(); g.clip(path, 'evenodd'); g.lineWidth = 9 * K; g.strokeStyle = rgba(id, 0.5, 0.1); g.stroke(path); g.restore(); }
      // 国境（細い金の線。信長の野望の地図のように）
      g.lineWidth = 1.5 * K / 2 + 0.4; g.strokeStyle = 'rgba(60,44,16,0.4)'; g.stroke(T.borders);
      g.lineWidth = 0.7 * K / 2 + 0.2; g.strokeStyle = 'rgba(214,176,92,0.85)'; g.stroke(T.borders);
      // 家の境（家の色の濃い線、自分の家は金）
      for (const [id, path] of clanCache) {
        if (id === P) continue;
        g.lineWidth = 2.2 * K / 2 + 0.6; g.strokeStyle = rgba(id, 0.95, 0.4); g.stroke(path);
      }
      for (const [id, path] of clanCache) if (id === P) { g.lineWidth = 4.4 * K / 2; g.strokeStyle = 'rgba(30,22,12,0.75)'; g.stroke(path); g.lineWidth = 2.6 * K / 2 + 0.4; g.strokeStyle = 'rgba(232,192,92,1)'; g.stroke(path); }
      // 国の名（薄い墨で。寄ると読める）
      g.font = `600 ${Math.round(8 * K)}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 2.2 * K / 2; g.strokeStyle = 'rgba(240,232,210,0.45)'; g.fillStyle = 'rgba(34,26,18,0.62)';
      for (const pv of PROVINCES) { const x = tx(pv.c), z = tz(pv.r) + 9 * K; g.strokeText(pv.name, x, z); g.fillText(pv.name, x, z); }
      g.restore();
      // 街道（淡い土の道。隣り合う城どうし）
      g.lineCap = 'round'; g.lineJoin = 'round';
      const road = (a, b, w, col, t0 = 0, t1 = 1) => { const f = curve(a, b); g.lineWidth = w; g.strokeStyle = col; g.beginPath(); for (let i = 0; i <= 16; i++) { const [x, z] = f(t0 + (i / 16) * (t1 - t0)); if (i) g.lineTo(tx(x), tz(z)); else g.moveTo(tx(x), tz(z)); } g.stroke(); };
      for (const [a, b] of roads) road(a, b, 2 * K / 2 + 0.6, 'rgba(58,40,20,0.5)');
      for (const [a, b] of roads) road(a, b, 0.9 * K / 2 + 0.3, 'rgba(238,218,168,0.9)');
    }
    g.drawImage(staticCv, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const road = (a, b, w, col, t0 = 0, t1 = 1) => { const f = curve(a, b); g.lineWidth = w; g.strokeStyle = col; g.beginPath(); for (let i = 0; i <= 16; i++) { const [x, z] = f(t0 + (i / 16) * (t1 - t0)); if (i) g.lineTo(tx(x), tz(z)); else g.moveTo(tx(x), tz(z)); } g.stroke(); };
    // 補給線（自分の城どうしの道を金で太く。補給の断たれた城への道は灰の点線）と前線（敵の城と向き合う道に朱の横棒）
    const cut = J.cut || {};
    for (const [a, b] of roads) {
      const oa = J.own[a.id] === P, ob = J.own[b.id] === P;
      if (oa && ob) {
        if (cut[a.id] || cut[b.id]) { g.setLineDash([1.2 * K, 2.4 * K]); road(a, b, 2.2 * K / 2 + 0.6, 'rgba(120,120,120,0.95)'); g.setLineDash([]); continue; }
        road(a, b, 3.6 * K / 2 + 1.2, 'rgba(30,22,12,0.7)'); road(a, b, 2.2 * K / 2 + 0.4, 'rgba(232,192,92,0.95)');
      } else if ((oa || ob) && !api.allied(P, J.own[oa ? b.id : a.id])) {
        const f = curve(a, b), [x0, z0] = f(0.47), [x1, z1] = f(0.53);
        const ang = Math.atan2(tz(z1) - tz(z0), tx(x1) - tx(x0)), hl = 5 * K / 2 + 3;
        g.save(); g.translate(tx((x0 + x1) / 2), tz((z0 + z1) / 2)); g.rotate(ang);
        g.fillStyle = 'rgba(20,16,12,0.8)'; g.fillRect(-1.6 * K / 2 - 1, -hl - 1, 3.2 * K / 2 + 2, hl * 2 + 2);
        g.fillStyle = '#c8322a'; g.fillRect(-1.6 * K / 2, -hl, 3.2 * K / 2, hl * 2);
        g.restore();
      }
    }
    // 攻め口（自分の城から、いま攻められる城への道。朱の点線と小さな矢じり）
    for (const c of D.castles) {
      const from = api.attackable(c); if (!from || (sel && sel === c)) continue;
      g.setLineDash([3 * K, 2.2 * K]);
      road(from, c, 3 * K / 2 + 1.4, 'rgba(20,16,12,0.55)', 0.08, 0.84);
      road(from, c, 1.8 * K / 2 + 0.3, 'rgba(255,112,80,0.98)', 0.08, 0.84);
      g.setLineDash([]);
      const f = curve(from, c), [x1, z1] = f(0.84), [x0, z0] = f(0.78);
      const ang = Math.atan2(tz(z1) - tz(z0), tx(x1) - tx(x0)), hs = 4 * K / 2 + 2.5;
      g.save(); g.translate(tx(x1), tz(z1)); g.rotate(ang);
      g.fillStyle = 'rgba(255,112,80,1)'; g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(hs, 0); g.lineTo(-hs * 0.7, hs * 0.7); g.lineTo(-hs * 0.7, -hs * 0.7); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // この季節の攻め（家の色の太い道と矢じり。落ちなかった攻めは破線）
    const arrow = (m, col, w, dash) => {
      const a = D.byId[m.from], b = D.byId[m.to]; if (!a || !b) return;
      const f = curve(a, b);
      g.setLineDash(dash ? [6 * K / 2, 5 * K / 2] : []);
      g.lineWidth = w + 2.4; g.strokeStyle = 'rgba(20,16,12,0.7)';
      g.beginPath(); for (let i = 1; i <= 15; i++) { const [x, z] = f(0.06 + (i / 15) * 0.8); if (i > 1) g.lineTo(tx(x), tz(z)); else g.moveTo(tx(x), tz(z)); } g.stroke();
      g.lineWidth = w; g.strokeStyle = col; g.stroke();
      g.setLineDash([]);
      const [x1, z1] = f(0.86), [x0, z0] = f(0.8);
      const ang = Math.atan2(tz(z1) - tz(z0), tx(x1) - tx(x0)), hs = 7 * K / 2 + 3;
      g.save(); g.translate(tx(x1), tz(z1)); g.rotate(ang);
      g.fillStyle = col; g.strokeStyle = 'rgba(20,16,12,0.8)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(hs, 0); g.lineTo(-hs * 0.7, hs * 0.75); g.lineTo(-hs * 0.7, -hs * 0.75); g.closePath(); g.fill(); g.stroke();
      g.restore();
    };
    for (const m of J.moves || []) arrow(m, m.threat ? '#d0472e' : rgba(m.clan, 1, -0.15), 3 * K / 2, !m.won && !m.threat);
    // 攻められる城（朱の破線の輪）・選んだ城（金の輪）
    const ring = (c, r, col, w, dash) => { g.setLineDash(dash || []); g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.arc(tx(c.c), tz(c.r), r * K, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); };
    for (const c of D.castles) if (api.attackable(c)) { ring(c, 7.5, 'rgba(20,16,12,0.55)', 4 * K / 2 + 1); ring(c, 7.5, '#e0513a', 2.4 * K / 2, [5 * K / 2, 3.5 * K / 2]); }
    if (sel) {
      const from = api.attackable(sel);
      if (from) arrow({ from: from.id, to: sel.id }, '#e0513a', 4.2 * K / 2, false);
      ring(sel, 10, 'rgba(20,16,12,0.6)', 5 * K / 2 + 1); ring(sel, 10, '#f3d27a', 3 * K / 2);
    }
    tex.needsUpdate = true;
    need = true;
  };

  // ---------------- 城の幟・駒（HTML） ----------------
  const bans = new Map();
  for (const c of D.castles) {
    const b = document.createElement('button');
    b.className = 'j3-ban';
    b.type = 'button';
    b.dataset.c = c.id;
    b.onclick = (e) => { e.stopPropagation(); api.setSel(api.sel() === c ? null : c); };
    b.onpointerenter = () => showTip(c);
    b.onpointerleave = () => { tip.hidden = true; };
    b.onfocus = () => showTip(c);
    b.onblur = () => { tip.hidden = true; };
    layer.appendChild(b);
    bans.set(c.id, { el: b, sig: '', cls: '', x: 0, y: 0, vis: true });
  }
  const pieces = [];
  const pieceEl = (m) => {
    const el = document.createElement('div');
    el.className = 'j3-piece';
    el.setAttribute('aria-hidden', 'true');
    const cl = D.clans[m.clan];
    el.style.setProperty('--c', D.ink[m.clan] || '#777');
    el.style.backgroundImage = `url(${faceURL(cl.daimyo || cl.name, cl, D.ink[m.clan] || '#777')})`;
    layer.appendChild(el);
    return el;
  };
  let movesRef = null, anim = null, lastAnimT0 = -1;
  const syncPieces = () => {
    const mv = J.moves || [];
    const sel = api.sel(), from = sel && api.attackable(sel);
    const list = [...mv.map((m) => ({ ...m })), ...(from ? [{ from: from.id, to: sel.id, clan: P, pending: true }] : [])];
    const key = list.map((m) => `${m.from}-${m.to}-${m.clan}-${m.won ? 1 : 0}${m.threat ? 't' : ''}${m.pending ? 'p' : ''}`).join(',');
    if (key === movesRef) return;
    movesRef = key;
    for (const p of pieces) p.el.remove();
    pieces.length = 0;
    for (const m of list) {
      const a = D.byId[m.from], b = D.byId[m.to];
      if (!a || !b) continue;
      const el = pieceEl(m);
      if (m.threat) el.classList.add('threat');
      if (!m.won && !m.threat && !m.pending) el.classList.add('lose');
      pieces.push({ m, el, f: curve(a, b) });
    }
  };
  // 駒のいる所（0→1 の道の上）。送った直後は進み、落ちなかった攻めは押し返される
  const pieceT = (m, k) => {
    const rest = m.pending ? 0.3 : m.threat ? 0.7 : m.won ? 0.62 : 0.45;
    if (k >= 1 || m.pending) return rest;
    const e = 1 - Math.pow(1 - k, 3);
    if (m.won || m.threat) return 0.05 + (rest - 0.05) * e;
    return k < 0.7 ? 0.05 + 0.8 * (1 - Math.pow(1 - k / 0.7, 3)) : 0.85 - (0.85 - rest) * ((k - 0.7) / 0.3);
  };

  const showTip = (c) => {
    const cl = D.clans[J.own[c.id]];
    const mine = J.own[c.id] === P;
    const at = api.attackable(c);
    const odd = !mine && at ? api.odds(c) : null;
    const l3 = mine ? (api.danger(c) >= 2 ? '<span class="bad">隣の敵が強い。守りを固めたい</span>' : `守りの固さ ${'●'.repeat(J.fort[c.id] || 0)}${'○'.repeat(3 - (J.fort[c.id] || 0))}`)
      : odd ? `攻めれば：<span class="${odd[1]}">${odd[0]}</span>` : api.allied(P, J.own[c.id]) ? '味方の家' : '隣り合っていない';
    tip.innerHTML = `<b>${esc(c.name)}${c.hq ? '（本城）' : ''}</b><br>${esc(cl.name)}・${TYPE_NAME[c.type]}・兵およそ${api.troops(c).toLocaleString('ja-JP')}<br>${l3}`;
    tip.hidden = false;
    const s = bans.get(c.id);
    const r = mapEl.getBoundingClientRect();
    tip.style.left = Math.min(r.width - tip.offsetWidth - 8, s.x + 28) + 'px';
    tip.style.top = clamp(s.y - 90, 70, r.height - tip.offsetHeight - 60) + 'px';
  };

  const v3 = new THREE.Vector3();
  const project = (x, y, z, W, H) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H, v3.z]; };
  const rankOf = (c, sel, tgt) => (c === sel ? 9 : J.threats.some((t) => t.to === c.id) ? 8 : J.own[c.id] === P ? (c.hq ? 7 : 6) : tgt ? 5 : c.hq ? 4 : J.fallen[c.id] === J.turn && J.turn > 0 ? 3.5 : 1);
  // 城の格：本城（大きな旗・金の縁）／城／砦（小さな旗）。型は名札の頭の印（▲山城・■平城・◆砦）
  const gradeOf = (c) => (c.hq ? 'hq' : c.type === 'toride' ? 'tr' : '');
  const KEEP_H = { hq: 2.7 * CASTLE_SC.hq, '': 1.8 * CASTLE_SC[''], tr: 1.2 * CASTLE_SC.tr };
  const TY = { yama: '▲', hira: '■', toride: '◆' };
  // 竿の根（城の場所）から旗の上までの高さ
  const ANCH = { hq: 48, '': 38, tr: 30, min: 21, minhq: 27, mintr: 16 };
  const layout = () => {
    const W = mapEl.clientWidth, H = mapEl.clientHeight;
    const sel = api.sel();
    const far = cam.d > 1000, veryFar = cam.d > 1500, mid = cam.d > Math.min(520, homeD * 0.8);
    const topH = topH0 || top.offsetHeight || 60;
    const items = [];
    for (const c of D.castles) {
      // 旗の竿の根は天守の屋根の上（寄った時に天守を隠さない）
      const [x, y, z] = project(c.c, hAt(c.c, c.r) + KEEP_H[gradeOf(c)], c.r, W, H);
      const s = bans.get(c.id);
      const on = z < 1 && x > -40 && x < W + 40 && y > topH + 30 && y < H + 60;
      s.x = x; s.y = y;
      if (!on) { if (s.vis) { s.el.style.display = 'none'; s.vis = false; } continue; }
      if (!s.vis) { s.el.style.display = ''; s.vis = true; }
      const tgt = !!api.attackable(c);
      items.push({ c, s, x, y, tgt, rank: rankOf(c, sel, tgt) });
    }
    items.sort((a, b) => b.rank - a.rank);
    const boxes = [];
    for (const it of items) {
      const { c, s, x, y, tgt, rank } = it;
      const cl = D.clans[J.own[c.id]];
      const col = D.ink[J.own[c.id]] || '#777';
      const gr = gradeOf(c);
      const nm = c.name.replace(/城$/, '');
      const fh = ANCH[gr], pw = nm.length * (gr === 'hq' ? 15 : 13) + 52;
      const bw = Math.max(44, pw), bx = x - bw / 2, by = y - fh, bh = fh + 22;
      // 遠目（はじめの見え方も）では家の名と旗だけ。城の名と兵の数は、寄った時・選んだ城・攻め寄せられた城・目標の城だけ
      let min = c.id !== goalId && ((veryFar && rank < 7) || (far && rank < 3) || (far && gr === 'tr' && rank < 5) || (mid && rank < 8));
      if (!min && boxes.some((b) => bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1])) min = rank < 7;
      if (!min) boxes.push([bx, by, bw, bh]);
      const mine = J.own[c.id] === P;
      const th = mine && J.threats.some((t) => t.to === c.id);
      const fell = J.fallen[c.id] === J.turn && J.turn > 0;
      const cls = `j3-ban${gr ? ' ' + gr : ''}${mine ? ' me' : ''}${tgt ? ' tgt' : ''}${c === sel ? ' sel' : ''}${min ? ' min' : ''}`;
      if (cls !== s.cls) { s.el.className = cls; s.cls = cls; }
      const tag = th ? '<em class="j3-tag">急</em>' : fell ? `<em class="j3-tag fell${mine ? ' mine' : ''}">落</em>` : tgt ? '<em class="j3-tag atk">攻</em>' : mine && api.danger(c) >= 2 ? '<em class="j3-tag kiki">危</em>' : '';
      const troops = api.troops(c);
      const sig = `${J.own[c.id]}|${troops}|${tag}`;
      if (sig !== s.sig) {
        s.sig = sig;
        s.el.style.setProperty('--c', col);
        s.el.innerHTML = `<span class="j3-flag"><i style="background-image:url(${monURL(cl, col)})"></i>${c.hq ? '<em class="j3-hq" aria-hidden="true">本</em>' : ''}${tag}</span><span class="j3-pole"></span><span class="j3-plate"><b><em class="j3-ty" aria-hidden="true">${TY[c.type] || '■'}</em>${esc(nm)}</b><small>${troops.toLocaleString('ja-JP')}</small></span>`;
        s.el.setAttribute('aria-label', `${c.name}${c.hq ? '（本城）' : ''}、${cl.name}、${TYPE_NAME[c.type]}、兵およそ${troops}人${tgt ? '、攻められる城' : ''}${th ? '、敵が攻め寄せている' : ''}`);
      }
      s.el.tabIndex = rank >= 5 ? 0 : -1;
      s.el.setAttribute('aria-pressed', c === sel ? 'true' : 'false');
      const off = ANCH[min ? 'min' + gr : gr];
      s.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - off).toFixed(1)}px, 0) translateX(-50%)`;
      s.el.style.zIndex = String(Math.round(y) + (min ? 0 : 2000) + (c === sel ? 5000 : 0));
    }
    layoutClans(W, H, topH);
    // 駒
    const k = anim ? clamp((performance.now() - anim.t0) / anim.dur, 0, 1) : 1;
    for (const p of pieces) {
      const t = pieceT(p.m, k);
      const [wx, wz] = p.f(t);
      const [x, y, z] = project(wx, hAt(wx, wz) + 1, wz, W, H);
      p.el.style.display = z < 1 ? '' : 'none';
      p.el.classList.toggle('far', far);
      p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      p.el.style.zIndex = String(Math.round(y) + 1000);
    }
  };

  // ---------------- 上の帯・右の札・下の知らせ ----------------
  const hud = () => {
    if (disposed) return;
    const now = api.when(J.turn);
    const month = ((D.m - 1 + 3 * J.turn) % 12 + 12) % 12;
    const pc = D.clans[P];
    const mine = Object.keys(J.own).filter((id) => J.own[id] === P).map((id) => D.byId[id]);
    const koku = mine.reduce((a, c) => a + api.koku(c), 0);
    const man = (v) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}<small>万</small>` : Math.round(v).toLocaleString('ja-JP'));
    const col = D.ink[P];
    const R = api.res ? api.res() : null;
    const headN = api.head ? api.head(P) : pc.daimyo;
    const hb = api.busho ? api.busho(headN) : null;
    const look = (b) => (b ? { lk: b.lk, age: b.age } : undefined);
    // 増減は「ひと月あたり」（一季は三月）。秋は年貢が入るので兵糧が大きく増える
    const per = (v, lb) => { const r = Math.round(v); return `<em class="${r > 0 ? 'up' : r < 0 ? 'down' : ''}" aria-label="${lb}ひと月あたり ${r >= 0 ? '増える' : '減る'} ${Math.abs(r)}">${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toLocaleString('ja-JP')}/月</em>`; };
    top.innerHTML = `<div class="j3-date"><b>${now.season}</b><span>${esc(now.era)}<small>${KANM[month]}月・${esc(D.name)}</small></span></div>
      <div class="j3-clan" style="--c:${col}"><img alt="" src="${faceURL(headN || pc.name, pc, col, look(hb))}"><div><b>${esc(pc.name)}</b><small>${esc(headN || '')}${R ? `・あなたは${esc(R.mibun)}` : ''}</small></div></div>
      <dl class="j3-res" aria-label="${esc(pc.name)}の力">
        <div class="j3-koku"><dt>石高</dt><dd>${man(koku)}<small>石</small></dd></div>
        ${R ? `<div><dt>金</dt><dd>${man(R.gold)}<small>貫</small>${per(R.flow.g / 3, '金')}</dd></div>
        <div title="${R.season === '秋' ? 'この秋は年貢が入る' : `秋の年貢の見込み +${Math.round(R.tax).toLocaleString('ja-JP')}石`}"><dt>兵糧</dt><dd>${man(R.food)}<small>石</small>${per(R.flow.f / 3, '兵糧')}</dd></div>
        <div><dt>兵</dt><dd>${man(R.pool)}<small>人</small>${per(R.flow.h / 3, '兵')}</dd></div>` : `<div><dt>兵</dt><dd>${api.army().toLocaleString('ja-JP')}<small>人</small></dd></div>`}
        <div class="j3-shiro"><dt>城</dt><dd>${mine.length}</dd></div>
      </dl>
      ${api.nextName ? `<div class="j3-act"><button class="btn small" id="j3-nextb" aria-label="城下へ戻って、次の戦（${esc(api.nextName)}）の支度をする">次の戦へ<small>${esc(api.nextName)}</small></button></div>` : ''}`;
    // 季節を送るは右の欄の「今の目標」の所だけ（二か所に出さない）
    { const nb = top.querySelector('#j3-nextb'); if (nb) nb.onclick = () => api.goNext(); }
    goalId = api.goalId ? api.goalId() : null; need = true;
    // 勢力の帯と見え方の押しボタンは、帯のすぐ下に（帯の高さは幅で変わる）
    mapEl.style.setProperty('--j3top', top.offsetHeight + 'px');
    const pw = mapEl.querySelector('.jp-power');
    topH0 = top.offsetHeight + (pw ? pw.offsetHeight : 0);
    if (tools) tools.style.top = (topH0 + 8) + 'px';
    // 右の札：選んだ城の城主（選んでいなければ自分の家の当主）の顔と能力
    const sel = api.sel();
    const cid = sel ? J.own[sel.id] : P;
    const cl = D.clans[cid], c2 = D.ink[cid];
    const L = sel && api.lord ? api.lord(sel) : null;
    const who = L ? L.n : (api.head ? api.head(cid) : cl.daimyo) || cl.name;
    const wb = L || (api.busho ? api.busho(who) : null);
    const [tou, bu, chi] = wb ? [wb.lea, wb.war, wb.int] : abilOf(who);
    const sei = wb ? wb.pol : null;
    const dm = sel && api.dom ? api.dom(sel) : null;
    const hei = sel ? api.troops(sel) : R ? R.pool : api.army();
    const bar = (lb, v, max = 100, shown = v) => `<div class="j3-ab"><span>${lb}</span><i style="--v:${clamp(v / max * 100, 4, 100)}%"></i><b>${shown}</b></div>`;
    const bust = document.createElement('div');
    bust.className = 'j3-bust'; bust.style.setProperty('--c', c2);
    const role = L ? `${sel.name}の城主` : sel ? `${sel.name}・城主なし` : '当主';
    bust.innerHTML = `<button class="j3-bimg" type="button" aria-label="${esc(who)}の札を開く"><img alt="${esc(who)}の顔" src="${faceURL(who, cl, c2, look(wb))}"></button><div><h5>${esc(who)}<small>${esc(cl.name)}${cid === P ? '（自分の家）' : api.allied(P, cid) ? '（味方）' : ''}・${esc(role)}${wb && wb.age ? `・${wb.age}歳` : ''}</small></h5>
      ${wb && wb.tr && wb.tr.length ? `<div class="j3-trs">${wb.tr.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${bar('統率', tou)}${bar('武勇', bu)}${bar('知略', chi)}${sei != null ? bar('政治', sei) : ''}
      ${bar(sel ? '籠る兵' : '兵数', hei, 12000, hei.toLocaleString('ja-JP'))}${dm ? bar('堅さ', dm.kata, 100, dm.kata) : ''}
      ${sel ? `<dl class="j3-kv">${dm ? `<div><dt>石高</dt><dd>${man(dm.k)}<small>石</small></dd></div>` : ''}${api.food ? `<div><dt>兵糧</dt><dd>${man(api.food(cid))}<small>石</small></dd></div>` : ''}${wb && wb.loy != null && !wb.me ? `<div><dt>忠誠</dt><dd class="${wb.loy < 45 ? 'bad' : ''}">${wb.loy}</dd></div>` : ''}</dl>` : ''}</div>`;
    const bi = bust.querySelector('.j3-bimg');
    bi.onclick = () => { if (api.openGen && (L || wb)) api.openGen(who); };
    side.querySelector('.j3-bust')?.remove();
    // 顔と能力の札は、城を選んだ時だけ（はじめは目標と自分の城だけを見せる）
    const anchor = side.querySelector('.jp-me');
    if (sel) { if (anchor) anchor.after(bust); else side.prepend(bust); }
    // 下の知らせの列（新しい順。武将の顔つき）
    const clanIn = (s) => { let best = null, bi = 1e9; for (const [id, c] of Object.entries(D.clans)) { const i = s.indexOf(c.name); if (i >= 0 && i < bi) { bi = i; best = id; } } return best; };
    const lines = J.log.slice(-6).reverse();
    news.innerHTML = lines.map((l, i) => {
      const id = clanIn(l.s) ?? (l.s.includes('急使') ? null : String(P));
      const c = id != null ? D.clans[id] : null;
      const cc = id != null ? D.ink[id] : '#b8402a';
      const face = c ? `<img alt="" src="${faceURL(c.daimyo || c.name, c, cc)}">` : '';
      const when2 = l.t ? api.when(l.t - 1) : null;
      return `<p class="${l.k || ''}${i > 2 ? ' old' : ''}" style="--c:${cc}">${face}<span><small>${when2 ? esc(when2.era + ' ' + when2.season) : 'はじめ'}</small>${esc(l.s)}</span></p>`;
    }).join('');
    need = true;
  };

  // ---------------- カメラ ----------------
  // 傾き：寄るほど寝かせ（山を横から）、引くほど立てる（全国を上から）。二本指で上下に動かすと変えられる
  const pitchOf = (d, tl = 0) => THREE.MathUtils.degToRad(clamp(mix(34, 64, sstep(120, 1400, d)) + tl, 22, 82));
  const place = () => {
    const p = pitchOf(cam.d, cam.tilt);
    const gy = Math.max(0, hAt(cam.x, cam.z)) * 0.5;
    const hd = cam.d * Math.cos(p);
    camera.position.set(cam.x + hd * Math.sin(cam.yaw), gy + cam.d * Math.sin(p), cam.z + hd * Math.cos(cam.yaw));
    camera.lookAt(cam.x, gy, cam.z);
    if (compass) { const on = Math.abs(cam.yaw) > 0.03 || Math.abs(cam.tilt) > 1; compass.hidden = !on; if (on) compass.firstChild.style.transform = `rotate(${(cam.yaw * 180 / Math.PI).toFixed(1)}deg)`; }
    scene.fog.near = 1e5; scene.fog.far = 2e5;
  };
  const DMIN = 70, DMAX = 1900;
  const bounded = () => {
    const [bx0, bz0, bx1, bz1] = TER.bounds;
    goal.d = clamp(goal.d, DMIN, DMAX); goal.tilt = clamp(goal.tilt, -14, 20);
    goal.x = clamp(goal.x, bx0 - 40, bx1 + 40); goal.z = clamp(goal.z, bz0 - 40, bz1 + 40);
  };
  const fit = (x0, z0, x1, z1) => {
    const W = mapEl.clientWidth || 800, H = Math.max(200, (mapEl.clientHeight || 600) - 130);
    const tn = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const need2 = Math.max((x1 - x0) / (W / H), (z1 - z0) * 1.15);
    goal.x = (x0 + x1) / 2; goal.z = (z0 + z1) / 2 + 12; goal.d = (need2 / (2 * tn)) * 0.9;
    bounded();
  };
  const home = () => {
    const mine = Object.keys(J.own).filter((id) => J.own[id] === P).map((id) => D.byId[id]);
    const pts = [...mine]; for (const c of mine) for (const n of D.adj[c.id]) pts.push(D.byId[n]);
    if (!pts.length) { fit(...TER.bounds); return; }
    const xs = pts.map((c) => c.c), zs = pts.map((c) => c.r);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const half = Math.max(70, (Math.max(...xs) - Math.min(...xs)) / 2 + 30, (Math.max(...zs) - Math.min(...zs)) / 2 + 30);
    fit(cx - half, cz - half * 0.75, cx + half, cz + half * 0.75);
    homeD = goal.d;
  };
  const focus = (c) => { if (!c) return; goal.x = c.c; goal.z = c.r + 6; goal.d = Math.min(goal.d, 460); bounded(); need = true; };
  const zoomBy = (k, sx, sy) => {
    const before = sx != null ? ground(sx, sy) : null;
    goal.d = clamp(goal.d * k, DMIN, DMAX);
    // 指した所へ寄る
    if (before) { const t = 1 - k; goal.x += (before[0] - goal.x) * t * 0.9; goal.z += (before[1] - goal.z) * t * 0.9; }
    bounded(); need = true;
  };
  // 画面の点 → 地面（y = 0 の平面）の点
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  const ground = (sx, sy) => {
    const W = mapEl.clientWidth, H = mapEl.clientHeight;
    ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hitP) ? [hitP.x, hitP.z] : null;
  };

  // ---------------- 手の動き ----------------
  const ptrs = new Map();
  let drag = null, pinch = null, spin = null;
  const rel = (e) => { const r = mapEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // 地図の或る点を、画面の或る点の下に留める（寄せ・引き・回しの中心を指の間に）
  const pinTo = (g0, sx, sy) => {
    if (!g0) return;
    cam.x = goal.x; cam.z = goal.z; cam.d = goal.d; cam.yaw = goal.yaw; cam.tilt = goal.tilt; place(); camera.updateMatrixWorld();
    const g1 = ground(sx, sy);
    if (g1) { goal.x += g0[0] - g1[0]; goal.z += g0[1] - g1[1]; }
    bounded(); cam.x = goal.x; cam.z = goal.z; need = true;
  };
  const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; };
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onpointerdown = (e) => {
    if (!ready) return;
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, rel(e));
    tip.hidden = true; fling = null;
    const [x, y] = rel(e);
    // パソコン：右か真ん中のボタン（または Shift を押しながら）で引くと、回す（左右）・傾ける（上下）
    if (ptrs.size === 1 && (e.button === 2 || e.button === 1 || e.shiftKey)) { spin = { x, y, yaw: goal.yaw, tilt: goal.tilt }; drag = null; canvas.classList.add('drag'); return; }
    if (ptrs.size === 1) { drag = { x, y, g: ground(x, y), moved: false, hist: [[performance.now(), goal.x, goal.z]] }; canvas.classList.add('drag'); }
    else if (ptrs.size === 2) { const t = two(); pinch = { ...t, dist: goal.d, yaw: goal.yaw, tilt: goal.tilt, g: ground(t.mx, t.my), mode: null }; drag = null; spin = null; }
  };
  canvas.onpointermove = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, rel(e));
    if (pinch && ptrs.size >= 2) {
      const t = two();
      const dd = Math.abs(t.d - pinch.d), dy = t.my - pinch.my;
      let da = t.ang - pinch.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      // 動き始めで決める：二本の指が揃って上下に動けば「傾け」、それ以外は「寄せ・引き・回し」
      if (!pinch.mode && (dd > 14 || Math.abs(dy) > 14 || Math.abs(da) > 0.12)) pinch.mode = Math.abs(dy) > dd * 1.4 && Math.abs(da) < 0.12 ? 'tilt' : 'zoom';
      if (pinch.mode === 'tilt') { goal.tilt = clamp(pinch.tilt - dy * 0.18, -14, 20); cam.tilt = goal.tilt; need = true; return; }
      if (pinch.mode === 'zoom') {
        goal.d = clamp(pinch.dist * (pinch.d / Math.max(10, t.d)), DMIN, DMAX);
        goal.yaw = pinch.yaw + da;
        pinTo(pinch.g, t.mx, t.my);
      }
      return;
    }
    const [x, y] = rel(e);
    if (spin) {
      goal.yaw = spin.yaw - (x - spin.x) * 0.006; goal.tilt = clamp(spin.tilt - (y - spin.y) * 0.12, -14, 20);
      cam.yaw = goal.yaw; cam.tilt = goal.tilt; need = true; return;
    }
    if (!drag) return;
    if (Math.hypot(x - drag.x, y - drag.y) > 5) drag.moved = true;
    if (drag.moved && drag.g) {
      const g2 = ground(x, y);
      if (g2) {
        goal.x += drag.g[0] - g2[0]; goal.z += drag.g[1] - g2[1]; bounded(); cam.x = goal.x; cam.z = goal.z; place(); need = true;
        const now = performance.now(); drag.hist.push([now, goal.x, goal.z]); while (drag.hist.length > 2 && now - drag.hist[0][0] > 90) drag.hist.shift();
      }
    }
  };
  let fling = null;
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2 && pinch) {
      pinch = null;
      // 一本の指が残ったら、そこから引き直せるように
      if (ptrs.size === 1) { const [x, y] = [...ptrs.values()][0]; drag = { x, y, g: ground(x, y), moved: true, hist: [[performance.now(), goal.x, goal.z]] }; }
    }
    if (drag && !drag.moved && ptrs.size === 0) {
      // 何もない所を押したら、近くの城を選ぶ（なければ選ぶのをやめる）
      const [x, y] = rel(e);
      let best = null, bd = 30;
      for (const c of D.castles) { const s = bans.get(c.id); if (!s.vis) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = c; } }
      api.setSel(best);
    } else if (drag && drag.moved && ptrs.size === 0 && !still()) {
      // 弾いた勢いで少し滑る
      const h = drag.hist, a = h[0], b = h[h.length - 1], dt = (performance.now() - a[0]) / 1000;
      if (h.length > 1 && dt > 0.01 && dt < 0.2) { goal.x += ((b[1] - a[1]) / dt) * 0.22; goal.z += ((b[2] - a[2]) / dt) * 0.22; bounded(); need = true; }
    }
    if (ptrs.size === 0) { drag = null; spin = null; canvas.classList.remove('drag'); }
  };
  canvas.onpointerup = up; canvas.onpointercancel = up;
  canvas.onwheel = (e) => {
    e.preventDefault(); if (!ready) return;
    const [x, y] = rel(e);
    // トラックパッドのつまみ（ctrl 付き）は細かく、滑り車はひと刻みずつ
    if (e.shiftKey) { goal.yaw -= e.deltaY * 0.004; need = true; return; }
    zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0014)), x, y);
  };
  const keys = (e) => {
    if (!ready || disposed || !document.querySelector('.jp.j3')) return;
    if (e.target instanceof HTMLInputElement || document.querySelector('.jp-result')) return;
    const st = goal.d * 0.12, cs = Math.cos(goal.yaw), sn = Math.sin(goal.yaw);
    // 矢印は画面の向きで動かす（回していても、上の矢印で画面の奥へ）
    const mv = (fx, fz) => { goal.x += (fx * cs + fz * sn) * st; goal.z += (-fx * sn + fz * cs) * st; };
    if (e.key === 'ArrowLeft') mv(-1, 0); else if (e.key === 'ArrowRight') mv(1, 0);
    else if (e.key === 'ArrowUp') mv(0, -1); else if (e.key === 'ArrowDown') mv(0, 1);
    else if (e.key === 'q' || e.key === 'Q') goal.yaw += 0.2; else if (e.key === 'e' || e.key === 'E') goal.yaw -= 0.2;
    else if (e.key === 'n' || e.key === 'N') { goal.yaw = 0; goal.tilt = 0; }
    else if (e.key === '+' || e.key === '=') zoomBy(1 / 1.35);
    else if (e.key === '-') zoomBy(1.35);
    else return;
    bounded(); need = true;
  };
  window.addEventListener('keydown', keys);
  // 見え方の押しボタンを、3D の地図に向け直す
  const bind = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = () => { if (ready) fn(); }; };
  bind('jp-in', () => zoomBy(1 / 1.4));
  bind('jp-out', () => zoomBy(1.4));
  bind('jp-home', () => home());
  bind('jp-all', () => fit(...TER.bounds));
  const ro = new ResizeObserver(() => { need = true; sized = false; });
  ro.observe(mapEl);
  let sized = false;

  // ---------------- 回す ----------------
  let frames = 0, slow = 0, noted = false;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!ready) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!sized) {
      const W = mapEl.clientWidth, H = mapEl.clientHeight;
      renderer.setSize(W, H, false); camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix(); sized = true; need = true;
    }
    // 季節を送った直後の駒の動き
    const a = api.anim();
    if (a && a.t0 !== lastAnimT0) { lastAnimT0 = a.t0; if (!still()) anim = { t0: now, dur: 2600 }; }
    if (anim && now - anim.t0 > anim.dur + 50) { anim = null; need = true; }
    // カメラを目当てへ滑らかに
    const k = still() ? 1 : 1 - Math.exp(-dt * 9);
    const moving = Math.abs(goal.x - cam.x) + Math.abs(goal.z - cam.z) + Math.abs(goal.d - cam.d) * 0.3 + Math.abs(goal.yaw - cam.yaw) * 60 + Math.abs(goal.tilt - cam.tilt) > 0.05;
    if (moving) { cam.x += (goal.x - cam.x) * k; cam.z += (goal.z - cam.z) * k; cam.d += (goal.d - cam.d) * k; cam.yaw += (goal.yaw - cam.yaw) * k; cam.tilt += (goal.tilt - cam.tilt) * k; need = true; }
    // 雲（遠くから見た時だけ。動きを減らす設定では流さない）
    const cop = clamp((cam.d - 900) / 800, 0, 1) * 0.2;
    let cloudMove = false;
    for (const c of clouds) {
      if (c.material.opacity !== cop) { c.material.opacity = cop; need = true; }
      c.visible = cop > 0.01;
      if (c.visible && !still()) { c.position.x += c.userData.v * dt; if (c.position.x > TER.bounds[2] + 200) c.position.x = TER.bounds[0] - 200; cloudMove = true; }
    }
    // 雲だけが動く時は、三つに一度だけ描く（軽く）
    if (!need && !anim && !(cloudMove && (frames % 3 === 0))) { frames++; return; }
    need = false; frames++;
    place();
    renderer.render(scene, camera);
    layout();
    // 重さを見る（はじめの 90 枚の描画で、遅ければ平面の地図を勧める）
    if (frames > 60 && frames < 460 && dt > 0.08) slow++;
    if (!noted && slow > 40) { noted = true; offer2D('この端末では立体の地図が重いようです。'); }
  };
  const offer2D = (msg) => {
    const n = document.createElement('div'); n.className = 'j3-note'; n.setAttribute('role', 'status');
    n.innerHTML = `<span>${esc(msg)}</span><button class="btn small" type="button">平面の地図にする</button><button class="btn small" type="button" aria-label="このまま使う">このまま</button>`;
    const [b1, b2] = n.querySelectorAll('button');
    b1.onclick = () => { setMode('2d'); api.reopen(); };
    b2.onclick = () => n.remove();
    mapEl.appendChild(n);
  };
  const lost = (e) => { e.preventDefault(); offer2D('立体の地図を描けなくなりました。'); };
  canvas.addEventListener('webglcontextlost', lost);

  // 重い下ごしらえは、「地図を広げています…」を見せてから
  setTimeout(() => {
    if (disposed) return;
    const tb = performance.now();
    try { build(); window.__j3 = { cam, goal, all: () => fit(...TER.bounds), home, focus, zoom: (k) => zoomBy(k), ms: Math.round(performance.now() - tb) }; } catch (e) { console.error(e); wait.textContent = ''; offer2D('立体の地図を作れませんでした。'); return; }
    wait.remove();
    ready = true;
    hud();
    syncPieces();
    home(); cam.x = goal.x; cam.z = goal.z; cam.d = goal.d * 1.25;
    if (still()) cam.d = goal.d;
    need = true;
  }, 30);
  loop();

  return {
    // japan.js の描き直し（季節・選択・駒が変わった時）
    redraw() { if (!ready) return; paint(false); syncPieces(); need = true; },
    // 城の持ち主が変わった時
    paint() { if (!ready) return; paint(true); need = true; },
    hud() { if (ready) hud(); },
    focus(c) { if (ready) focus(c); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', keys);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      if (scene) {
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      }
      canvas.remove();
      lg.remove(); compass.remove();
    },
  };
}
