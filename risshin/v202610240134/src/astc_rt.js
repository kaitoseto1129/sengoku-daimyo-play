// canvas に描いた絵を、GPU へ送る時に ASTC 4x4（1 byte/px・mip 込み）へ圧縮する（iPhone 用。10/19）
//   iPhone の WebKit は GPU process が約 500MB で切られ、WebGL の texture・buffer が乗る。戦の中は 440〜520MB で縁にいて、
//   戦の切り替わり（前の戦の絵が返る前に次の絵を送る）で越えて WebContent ごと落ちていた（理由 3＝crash・JetsamEvent は出ない）。
//   canvas の絵（地面・木・小物・甲冑の atlas）は 4 byte/px のまま 130MB ほど乗っていたので、ここで 1/4 にする。
//   符号化は prototype/tools/astc_tex.py と同じ簡素な物（一分割・RGB 直接・重み 3 bit・端点は主成分→最小二乗を三度）。
//   透ける所（alpha < 255）のある絵は圧縮しない（RGB だけなので）。描き直す絵（needsUpdate を二度目に立てた物）は元の canvas から作り直す
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

const W8 = [0, 9, 18, 27, 37, 46, 55, 64];
const MODE = 83;   // 4x4・重み 8 段・一面
const _c = new Float64Array(9), _ts = new Float64Array(16), _a = new Float64Array(16), _ws = new Uint8Array(16);
// 16 画素（RGB×16 の Uint8/Float）を 16 byte の block へ
function encodeBlock(px, out, o) {
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < 48; i += 3) { mr += px[i]; mg += px[i + 1]; mb += px[i + 2]; }
  mr /= 16; mg /= 16; mb /= 16;
  _c.fill(0);
  for (let i = 0; i < 48; i += 3) {
    const dr = px[i] - mr, dg = px[i + 1] - mg, db = px[i + 2] - mb;
    _c[0] += dr * dr; _c[1] += dr * dg; _c[2] += dr * db; _c[4] += dg * dg; _c[5] += dg * db; _c[8] += db * db;
  }
  _c[3] = _c[1]; _c[6] = _c[2]; _c[7] = _c[5];
  let vx = 1, vy = 1, vz = 1;
  for (let k = 0; k < 6; k++) {
    const nx = _c[0] * vx + _c[1] * vy + _c[2] * vz, ny = _c[3] * vx + _c[4] * vy + _c[5] * vz, nz = _c[6] * vx + _c[7] * vy + _c[8] * vz;
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (L < 1e-6) break;
    vx = nx / L; vy = ny / L; vz = nz / L;
  }
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0, j = 0; i < 48; i += 3, j++) { const t = (px[i] - mr) * vx + (px[i + 1] - mg) * vy + (px[i + 2] - mb) * vz; _ts[j] = t; if (t < t0) t0 = t; if (t > t1) t1 = t; }
  const cl = (x) => x < 0 ? 0 : x > 255 ? 255 : Math.round(x);
  let e0r = cl(mr + vx * t0), e0g = cl(mg + vy * t0), e0b = cl(mb + vz * t0);
  let e1r = cl(mr + vx * t1), e1g = cl(mg + vy * t1), e1b = cl(mb + vz * t1);
  _ws.fill(0);
  for (let it = 0; it < 3; it++) {
    const dx = e1r - e0r, dy = e1g - e0g, dz = e1b - e0b, l2 = dx * dx + dy * dy + dz * dz;
    if (l2 === 0) { _ws.fill(0); break; }
    for (let i = 0, j = 0; i < 48; i += 3, j++) {
      let t = ((px[i] - e0r) * dx + (px[i + 1] - e0g) * dy + (px[i + 2] - e0b) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      // 8 段の重み（0..64 を 64 で割った値）の一番近い物
      let best = 0, bd = 9;
      for (let k = 0; k < 8; k++) { const d = Math.abs(W8[k] / 64 - t); if (d < bd) { bd = d; best = k; } }
      _ws[j] = best;
    }
    let saa = 0, sa = 0;
    for (let j = 0; j < 16; j++) { const a = W8[_ws[j]] / 64; _a[j] = a; saa += a * a; sa += a; }
    const det = 16 * saa - sa * sa;
    if (det < 1e-9) break;
    for (let k = 0; k < 3; k++) {
      let sp = 0, spa = 0;
      for (let i = k, j = 0; i < 48; i += 3, j++) { sp += px[i]; spa += px[i] * _a[j]; }
      const E0 = (saa * sp - sa * spa) / det, D = (16 * spa - sa * sp) / det;
      const a0 = cl(E0), a1 = cl(E0 + D);
      if (k === 0) { e0r = a0; e1r = a1; } else if (k === 1) { e0g = a0; e1g = a1; } else { e0b = a0; e1b = a1; }
    }
  }
  // CEM 8 は v1+v3+v5 >= v0+v2+v4 なら直接。そうでないと blue contraction に入るので並べ替える
  if (e1r + e1g + e1b < e0r + e0g + e0b) {
    let t = e0r; e0r = e1r; e1r = t; t = e0g; e0g = e1g; e1g = t; t = e0b; e0b = e1b; e1b = t;
    for (let j = 0; j < 16; j++) _ws[j] = 7 - _ws[j];
  }
  for (let i = 0; i < 16; i++) out[o + i] = 0;
  const put = (pos, n, v) => { for (let b = 0; b < n; b++) if ((v >> b) & 1) out[o + ((pos + b) >> 3)] |= 1 << ((pos + b) & 7); };
  put(0, 11, MODE); put(11, 2, 0); put(13, 4, 8);
  let p = 17;
  put(p, 8, e0r); p += 8; put(p, 8, e1r); p += 8; put(p, 8, e0g); p += 8; put(p, 8, e1g); p += 8; put(p, 8, e0b); p += 8; put(p, 8, e1b);
  // 重みは末尾から逆順（stream の bit k → block の bit 127-k）
  let k = 0;
  for (let j = 0; j < 16; j++) { const w = _ws[j]; for (let b = 0; b < 3; b++) { if ((w >> b) & 1) { const pos = 127 - k; out[o + (pos >> 3)] |= 1 << (pos & 7); } k++; } }
}
// 透ける絵（旗）：RGBA 直接（CEM 12・端点 8 bit ×8）と重み 2 bit（4 段。端点に 8 bit を残すには重みを 32 bit に抑える要がある）・一面・一分割
const W4 = [0, 21, 43, 64];
const MODE_A = 66;   // 4x4・重み 4 段・一面（83 の R を 0b111 → 0b100 に）
const _c4 = new Float64Array(16), _m4 = new Float64Array(4), _v4 = new Float64Array(4), _e0 = new Float64Array(4), _e1 = new Float64Array(4);
// 16 画素（RGBA×16）を 16 byte の block へ
function encodeBlockRGBA(px, out, o) {
  for (let c = 0; c < 4; c++) { let m = 0; for (let i = c; i < 64; i += 4) m += px[i]; _m4[c] = m / 16; }
  _c4.fill(0);
  for (let i = 0; i < 64; i += 4) for (let a = 0; a < 4; a++) { const da = px[i + a] - _m4[a]; for (let b = 0; b < 4; b++) _c4[a * 4 + b] += da * (px[i + b] - _m4[b]); }
  _v4.fill(1);
  for (let k = 0; k < 6; k++) {
    let L = 0; for (let a = 0; a < 4; a++) { let n = 0; for (let b = 0; b < 4; b++) n += _c4[a * 4 + b] * _v4[b]; _ts[a] = n; L += n * n; }
    L = Math.sqrt(L); if (L < 1e-6) break;
    for (let a = 0; a < 4; a++) _v4[a] = _ts[a] / L;
  }
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < 64; i += 4) { let t = 0; for (let a = 0; a < 4; a++) t += (px[i + a] - _m4[a]) * _v4[a]; if (t < t0) t0 = t; if (t > t1) t1 = t; }
  const cl = (x) => x < 0 ? 0 : x > 255 ? 255 : Math.round(x);
  for (let a = 0; a < 4; a++) { _e0[a] = cl(_m4[a] + _v4[a] * t0); _e1[a] = cl(_m4[a] + _v4[a] * t1); }
  _ws.fill(0);
  for (let it = 0; it < 3; it++) {
    let l2 = 0; for (let a = 0; a < 4; a++) l2 += (_e1[a] - _e0[a]) * (_e1[a] - _e0[a]);
    if (l2 === 0) { _ws.fill(0); break; }
    for (let i = 0, j = 0; i < 64; i += 4, j++) {
      let t = 0; for (let a = 0; a < 4; a++) t += (px[i + a] - _e0[a]) * (_e1[a] - _e0[a]);
      t /= l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      let best = 0, bd = 9;
      for (let k = 0; k < 4; k++) { const d = Math.abs(W4[k] / 64 - t); if (d < bd) { bd = d; best = k; } }
      _ws[j] = best;
    }
    let saa = 0, sa = 0;
    for (let j = 0; j < 16; j++) { const a = W4[_ws[j]] / 64; _a[j] = a; saa += a * a; sa += a; }
    const det = 16 * saa - sa * sa;
    if (det < 1e-9) break;
    for (let c = 0; c < 4; c++) {
      let sp = 0, spa = 0;
      for (let i = c, j = 0; i < 64; i += 4, j++) { sp += px[i]; spa += px[i] * _a[j]; }
      const E0 = (saa * sp - sa * spa) / det, D = (16 * spa - sa * sp) / det;
      _e0[c] = cl(E0); _e1[c] = cl(E0 + D);
    }
  }
  // CEM 12 も v1+v3+v5 >= v0+v2+v4（RGB の和）で直接。そうでないと並べ替える（alpha も一緒に入れ替わる）
  if (_e1[0] + _e1[1] + _e1[2] < _e0[0] + _e0[1] + _e0[2]) {
    for (let a = 0; a < 4; a++) { const t = _e0[a]; _e0[a] = _e1[a]; _e1[a] = t; }
    for (let j = 0; j < 16; j++) _ws[j] = 3 - _ws[j];
  }
  for (let i = 0; i < 16; i++) out[o + i] = 0;
  const put = (pos, n, v) => { for (let b = 0; b < n; b++) if ((v >> b) & 1) out[o + ((pos + b) >> 3)] |= 1 << ((pos + b) & 7); };
  put(0, 11, MODE_A); put(11, 2, 0); put(13, 4, 12);
  let p = 17;
  for (let a = 0; a < 4; a++) { put(p, 8, _e0[a]); p += 8; put(p, 8, _e1[a]); p += 8; }
  let k = 0;
  for (let j = 0; j < 16; j++) { const w = _ws[j]; for (let b = 0; b < 2; b++) { if ((w >> b) & 1) { const pos = 127 - k; out[o + (pos >> 3)] |= 1 << (pos & 7); } k++; } }
}
const _blk = new Float64Array(64);
// ImageData（RGBA）一段を符号化。flip：下の行から（canvas の絵は flipY=true で送っていたのと同じ向きにする）。alpha：透ける絵は RGBA で
function encodeLevel(data, w, h, flip, alpha = false) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2, out = new Uint8Array(bw * bh * 16), C = alpha ? 4 : 3;
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let q = 0;
    for (let y = 0; y < 4; y++) {
      let yy = by * 4 + y; if (yy >= h) yy = h - 1; if (flip) yy = h - 1 - yy;
      for (let x = 0; x < 4; x++) {
        let xx = bx * 4 + x; if (xx >= w) xx = w - 1;
        const i = (yy * w + xx) * 4;
        _blk[q++] = data[i]; _blk[q++] = data[i + 1]; _blk[q++] = data[i + 2]; if (C === 4) _blk[q++] = data[i + 3];
      }
    }
    if (alpha) encodeBlockRGBA(_blk, out, o); else encodeBlock(_blk, out, o);
    o += 16;
  }
  return out;
}
// 作業用の canvas は二枚を使い回す（段ごとに新しく作ると、GPU process に IOSurface が溜まる）。終わったら 1×1 に戻す
const _works = [null, null];
function workCtx(i, w, h) {
  if (!_works[i]) _works[i] = document.createElement('canvas');
  const c = _works[i]; c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: true });
}
function shrinkWorks() { for (const c of _works) if (c) { c.width = 1; c.height = 1; } }
// canvas → { mipmaps, width, height }。透ける画素があれば null（圧縮しない）。mips：mipmap 有りなら 4×4 まで
//   alpha：'skip'（透ける絵は圧縮しない）・'rgba'（RGBA で。旗）・'opaque'（alpha を見ない。顔：材質が alpha を使わない）
// canvas から各段の画素（RGBA）を読む。透ける画素があれば null（alpha:'skip'）。mips：mipmap 有りなら 4×4 まで
function readLevels(canvas, { mips = true, alpha = 'skip' } = {}) {
  const w = canvas.width, h = canvas.height;
  if (!(w > 0 && h > 0)) return null;
  try {
    const ctx = workCtx(0, w, h);
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, w, h).data;
    let rgba = false;
    if (alpha !== 'opaque') for (let i = 3; i < img.length; i += 4) if (img[i] !== 255) { if (alpha === 'skip') return null; rgba = true; break; }
    const levels = [{ data: img, width: w, height: h }];
    if (mips) {
      let cw = w, ch = h, cur = 0;
      // 4×4 の block より小さい段は作らない
      while (cw > 4 && ch > 4) {
        cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
        const nxt = 1 - cur;
        const c2 = workCtx(nxt, cw, ch);
        c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
        c2.drawImage(_works[cur], 0, 0, cw, ch);   // 一つ上の段から縮める
        levels.push({ data: c2.getImageData(0, 0, cw, ch).data, width: cw, height: ch });
        cur = nxt;
      }
    }
    return { levels, rgba, width: w, height: h };
  } finally { shrinkWorks(); }
}
// canvas → { mipmaps, width, height }。透ける画素があれば null（圧縮しない）
//   alpha：'skip'（透ける絵は圧縮しない）・'rgba'（RGBA で。旗）・'opaque'（alpha を見ない。顔：材質が alpha を使わない）
export function canvasToAstc(canvas, { flip = true, mips = true, alpha = 'skip' } = {}) {
  const L = readLevels(canvas, { mips, alpha });
  if (!L) return null;
  return { mipmaps: L.levels.map((l) => ({ data: encodeLevel(l.data, l.width, l.height, flip, L.rgba), width: l.width, height: l.height })), width: L.width, height: L.height };
}
// 符号化は裏の糸（Worker）で。主の糸で符号化すると 512² の顔で 100〜300ms・1024² の名将で約 1 秒止まっていた（iPhone 10/20 カクつき）。
//   Worker の中身はこの file の符号化の関数をそのまま文字列にして Blob から作る（app:// の scheme から別の file を読まない）。
//   裏で符号化している間は 4×4（平均の色）の仮の絵を送っておき、出来たら差し替える
let _worker = null, _workerURL = null, _wid = 0, _wdog = 0; const _wjobs = new Map();
// 作り直した WKWebView で Worker の返事が 8 秒来なければ（待ちがあるのに一つも返らない）、Worker を捨てて主の糸で符号化する（絵は仮のままにしない）。
//   一つの仕事ごとの時間切れにすると、重い絵が列に並んだ時（1024² が十数枚）に正常でも切れる。返事が来るたびに見張りを掛け直す
const WORKER_WAIT_MS = 8000;
function stopWorker(reason) {
  ASTC_RT[reason] = (ASTC_RT[reason] || 0) + 1;
  if (_worker) { try { _worker.terminate(); } catch (e) { /* 既に無い */ } }
  _worker = false;
  if (_workerURL) { URL.revokeObjectURL(_workerURL); _workerURL = null; }
  clearTimeout(_wdog); _wdog = 0;
  const js = [..._wjobs.values()]; _wjobs.clear(); ASTC_RT.pending = 0;
  for (const j of js) j(null);
}
export function disposeAstcWorker() {
  if (_worker || _wjobs.size || _wdog) stopWorker('workerStopped');
  _worker = null;
}
function armWatchdog() { clearTimeout(_wdog); _wdog = _wjobs.size ? setTimeout(() => stopWorker('workerTimeout'), WORKER_WAIT_MS) : 0; }
function workerSrc() {
  return `const W8=${JSON.stringify(W8)},MODE=${MODE},W4=${JSON.stringify(W4)},MODE_A=${MODE_A};
const _c=new Float64Array(9),_ts=new Float64Array(16),_a=new Float64Array(16),_ws=new Uint8Array(16);
const _c4=new Float64Array(16),_m4=new Float64Array(4),_v4=new Float64Array(4),_e0=new Float64Array(4),_e1=new Float64Array(4),_blk=new Float64Array(64);
${encodeBlock.toString()}
${encodeBlockRGBA.toString()}
${encodeLevel.toString()}
onmessage = (e) => { const { id, levels, flip, rgba } = e.data; const out = levels.map((l) => ({ data: encodeLevel(new Uint8Array(l.data), l.width, l.height, flip, rgba), width: l.width, height: l.height })); postMessage({ id, out }, out.map((o) => o.data.buffer)); };`;
}
function getWorker() {
  if (_worker !== null) return _worker || null;
  try {
    _workerURL = URL.createObjectURL(new Blob([workerSrc()], { type: 'text/javascript' }));
    _worker = new Worker(_workerURL);
    _worker.onmessage = (e) => {
      const j = _wjobs.get(e.data.id);
      _wjobs.delete(e.data.id); ASTC_RT.pending = _wjobs.size; armWatchdog();
      if (!j) return;
      ASTC_RT.completed = (ASTC_RT.completed || 0) + 1;
      j(e.data.out);
    };
    _worker.onerror = _worker.onmessageerror = () => stopWorker('workerErr');
  } catch (e) { stopWorker('workerErr'); }
  return _worker || null;
}
function encodeInWorker(L, flip) {
  const w = getWorker();
  if (!w) return null;
  const id = ++_wid;
  return new Promise((res) => {
    _wjobs.set(id, res);
    ASTC_RT.pending = _wjobs.size; if (!_wdog) armWatchdog();
    const levels = L.levels.map((l) => ({ data: l.data.buffer, width: l.width, height: l.height }));
    try { w.postMessage({ id, levels, flip, rgba: L.rgba }, levels.map((l) => l.data)); } catch (e) { stopWorker('workerErr'); }
  });
}
// 仮の絵：平均の色の 4×4 一 block
function placeholderBlock(L) {
  const d = L.levels[L.levels.length - 1].data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  r /= n || 1; g /= n || 1; b /= n || 1;
  const C = L.rgba ? 4 : 3; let q = 0;
  for (let k = 0; k < 16; k++) { _blk[q++] = r; _blk[q++] = g; _blk[q++] = b; if (C === 4) _blk[q++] = 255; }
  const out = new Uint8Array(16);
  if (L.rgba) encodeBlockRGBA(_blk, out, 0); else encodeBlock(_blk, out, 0);
  return [{ data: out, width: 4, height: 4 }];
}
export const ASTC_RT = { on: false, n: 0, ms: 0, skipped: 0, bytes: 0 };
// 透ける絵でも圧縮する印を付けて、もう一度送る（作った時は alpha で飛ばしている）。alpha：true＝RGBA で（旗）、false＝alpha を見ない（顔）
export function astcRetry(t, alpha) {
  if (!ASTC_RT.on || !t || !t.userData) return;
  if (alpha) t.userData.astcAlpha = true; else t.userData.astcOpaque = true;
  t.userData.noAstc = false; t.userData.astcN = 0;
  t.needsUpdate = true;
}
const isCanvas = (im) => !!im && (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement || typeof globalThis.OffscreenCanvas !== 'undefined' && im instanceof globalThis.OffscreenCanvas);
// needsUpdate が立った時に canvas の絵を ASTC に置き換える（三 Texture の仕掛けをそのまま使う：isCompressedTexture と mipmaps を見る）
// 圧縮をやめて元の canvas の送り方へ戻す（描き直しの多い絵）
function revert(t) {
  t.isCompressedTexture = false; t.mipmaps = []; t.format = THREE.RGBAFormat; t.generateMipmaps = t.userData.astcGenMips !== false; t.flipY = t.userData.astcFlip !== false;
  if (t.userData.astcMin !== undefined) t.minFilter = t.userData.astcMin;
  t.userData.noAstc = true; ASTC_RT.reverted = (ASTC_RT.reverted || 0) + 1;
}
function applyAstc(t, mipmaps, useMips) {
  t.mipmaps = mipmaps;
  t.isCompressedTexture = true;
  t.format = THREE.RGBA_ASTC_4x4_Format; t.type = THREE.UnsignedByteType;
  t.generateMipmaps = false; t.flipY = false;
  if (useMips && t.minFilter !== THREE.LinearMipmapLinearFilter && t.minFilter !== THREE.LinearMipmapNearestFilter && t.minFilter !== THREE.NearestMipmapLinearFilter && t.minFilter !== THREE.NearestMipmapNearestFilter) t.minFilter = THREE.LinearMipmapLinearFilter;
  if (!useMips) t.minFilter = THREE.LinearFilter;
}
function convert(t) {
  if (t.userData.astcReady) { t.userData.astcReady = false; return; }   // 裏で符号化した結果を送る時（下の then）
  if (t.userData.astcBusy) { t.userData.astcAgain = true; return; }   // 裏で符号化中：出来てから描き直す
  const src = isCanvas(t.image) ? t.image : t.userData.astcCanvas;
  if (!src || t.userData.noAstc) return;
  if (Math.min(src.width, src.height) < 128 || src.width * src.height > 4194304) { t.userData.noAstc = true; return; }
  // 描き直しの多い絵（四度目）は圧縮をやめる（毎コマ符号化すると重い）
  t.userData.astcN = (t.userData.astcN || 0) + 1;
  if (t.userData.astcN > 3) { if (t.isCompressedTexture) revert(t); else t.userData.noAstc = true; return; }
  const t0 = performance.now();
  if (t.userData.astcN === 1) { t.userData.astcGenMips = t.generateMipmaps; t.userData.astcFlip = t.flipY; t.userData.astcMin = t.minFilter; }
  const useMips = t.generateMipmaps !== false && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter;
  const alpha = t.userData.astcAlpha ? 'rgba' : t.userData.astcOpaque ? 'opaque' : 'skip', flip = t.flipY !== false;
  let r = null;
  if (!t.userData.astcSync && getWorker()) {
    const L = readLevels(src, { mips: useMips, alpha });
    // 透ける絵を 'skip' で読めなかった時は今回だけ見送る（印なしで作られた直後の CanvasTexture が、後で astcAlpha を付けて描き直すのを待つ。
    //   絵札の 10 枚（1024×2048）が作った直後の空の絵で noAstc になり、ずっと圧縮されず canvas も返せていなかった。10/22）。三度まで
    if (!L) { ASTC_RT.skipped++; if (alpha === 'skip' && (t.userData.astcSkipN = (t.userData.astcSkipN || 0) + 1) <= 3) { t.userData.astcN = 0; return; } t.userData.noAstc = true; return; }
    const ph = placeholderBlock(L), p = encodeInWorker(L, flip);
    if (p) {
      r = { mipmaps: ph, width: L.width, height: L.height };
      t.userData.astcBusy = true; ASTC_RT.async = (ASTC_RT.async || 0) + 1;
      p.then((out) => {
        t.userData.astcBusy = false;
        if (!out) { t.userData.astcSync = true; t.needsUpdate = true; return; }   // Worker が壊れた・返事が来ない：主の糸で（仮の絵のままにしない）
        for (const m of out) ASTC_RT.bytes += m.data.byteLength;
        t.dispose();   // 4×4 の仮の絵の GL texture を返し、本物を作り直す（texStorage の大きさが違う）
        applyAstc(t, out, useMips);
        t.userData.astcReady = true; t.needsUpdate = true;
        if (t.userData.astcAgain) { t.userData.astcAgain = false; t.needsUpdate = true; }
      });
    } else {
      r = { mipmaps: L.levels.map((l) => ({ data: encodeLevel(l.data, l.width, l.height, flip, L.rgba), width: l.width, height: l.height })), width: L.width, height: L.height };
    }
  } else r = canvasToAstc(src, { flip, mips: useMips, alpha });
  if (!r) { ASTC_RT.skipped++; if (alpha === 'skip' && (t.userData.astcSkipN = (t.userData.astcSkipN || 0) + 1) <= 3) { t.userData.astcN = 0; return; } t.userData.noAstc = true; return; }
  t.userData.astcCanvas = src;   // image は canvas のまま（three の圧縮の道は mipmaps と image.width/height しか見ない。絵を写して使う所が image を canvas として読む）
  // 描き終えた絵（astcStatic の印）：canvas を 1×1 に戻して GPU process の IOSurface を返す（2D canvas の裏の絵は GPU process に乗る）。
  //   image は大きさだけの物に（CompressedTexture と同じ。width/height を読む所はそのまま動く）
  if (t.userData.astcStatic) { t.image = { width: src.width, height: src.height }; t.userData.astcCanvas = null; src.width = src.height = 1; ASTC_RT.freed = (ASTC_RT.freed || 0) + 1; }
  applyAstc(t, r.mipmaps, useMips);
  ASTC_RT.n++; ASTC_RT.ms += performance.now() - t0; for (const m of r.mipmaps) ASTC_RT.bytes += m.data.byteLength;
  if (ASTC_RT.log) console.warn('astc ' + r.width + 'x' + r.height + ' L' + r.mipmaps.length + ' ' + Math.round(performance.now() - t0) + 'ms n=' + ASTC_RT.n);
}
// 入れる（iPhone、または ?astc=1 で。ASTC の無い機械は何もしない）
export function installCanvasAstc(renderer, force = false) {
  if (ASTC_RT.on) return true;
  const tight = MEM_TIGHT || force;
  if (!tight) return false;
  let ok = false;
  try { ok = !!(renderer && renderer.extensions && renderer.extensions.has('WEBGL_compressed_texture_astc')); } catch (e) { ok = false; }
  if (!ok) return false;
  const P = THREE.Texture.prototype;
  const d = Object.getOwnPropertyDescriptor(P, 'needsUpdate');
  if (!d || !d.set) return false;
  Object.defineProperty(P, 'needsUpdate', {
    configurable: true,
    get: d.get,
    set(v) {
      if (v === true && !this.isDataTexture && !this.isVideoTexture && !this.isDepthTexture && !this.isFramebufferTexture && !this.isCubeTexture && !this.isRenderTargetTexture && !this.isData3DTexture && !this.isDataArrayTexture && (isCanvas(this.image) || this.userData.astcCanvas)) {
        try { convert(this); } catch (e) { this.userData.noAstc = true; }
      }
      d.set.call(this, v);
    },
  });
  ASTC_RT.on = true;
  return true;
}
