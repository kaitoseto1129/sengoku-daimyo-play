// 大きな素材（GLB・城の部品の箱）の読み口。
// iPhone（WebKit）は asset_<名>.js の base64 の文字列を、元の文（16 bit）と文字列の値の二重で持ち続け、
// 一つの戦の WebContent（上限 2GB）を 100MB ほど食っていた（10/19 実機）。
// そこで src/bin/<名>.bin（base64 を戻した生の bytes。prototype/tools/asset_bin.mjs が作る）を fetch で読み、
// 無い時だけ asset_<名>.js（base64）へ戻る。読んだ bytes は使い終われば手放される。
// 応答や本文が途中で止まっても、出陣の支度を待ち続けず既存の代替素材へ進む。
async function binaryBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    return r.ok ? await r.arrayBuffer() : null;
  } finally { clearTimeout(timer); }
}
// 人・具足・馬はアプリ同梱の形だけを読む。失敗時も巨大な文字列を取り込まない。
const battleModels = new Set(['mhbody', 'mhhead', 'mhhand', 'soldier', 'head', 'domaru', 'kabuto', 'menpo', 'horse', 'yoroi']);
export async function assetBytes(name) {
  if (battleModels.has(name)) {
    let buf = null;
    try { buf = await binaryBytes(new URL('../assets/battle/' + name + '.glb', import.meta.url)); }
    catch (e) { /* 軽量版を置いていないアプリでは、従来の同梱バイナリを読む */ }
    // 実機が写す .bin も bootload_glb.mjs が同じ軽量版に揃える。形・動きの負荷を保つ。
    if (!buf) buf = await binaryBytes(new URL('./bin/' + name + '.bin', import.meta.url));
    if (!buf) throw new Error('同梱の形を読めませんでした：' + name);
    return new Uint8Array(buf);
  }
  try {
    const buf = await binaryBytes(new URL('./bin/' + name + '.bin', import.meta.url));
    if (buf) return new Uint8Array(buf);
  } catch (e) { /* 置いていない・取れない時は base64 へ */ }
  const { readAsset } = await import('./asset_reader.js');
  return readAsset(name, 'bytes');
}

// ---- K675（11/26 iPad の桶狭間 2分で 2,268MB）：ファイルから読んだ圧縮の絵の中身を、GPU へ送った後に JS から手放す ----
// 送り終えた絵の mipmaps（読んだ束そのもの）を JS が持ち続け、桶狭間で約15MB が WebContent に残っていた（人・馬・甲冑・地面・草木の絵）。
// 送った後（three の onUpdate）に、その絵の mipmaps を「大きさだけの段」に替える。後でまた中身が要る時（片付けの後に描く・送り直し・写し）は、
// 同じ大きさの灰色の段（ASTC の一色の塊）をその場で渡して描きを止めず、裏でファイルを読み直して本物に戻す（読み直しは手元のファイル）。
// 描く物・絵は同じ。?nofiledrop で前と比べる
const FILE_MIPS = new WeakMap();   // mipmaps の配列 → { reload：同じ段を読み直す, bw, bh, srgb }
let fileDropOn = null;
function fileDropInstall(THREE) {
  if (fileDropOn !== null) return fileDropOn;
  fileDropOn = !/[?&]nofiledrop/.test(location.search) && !/nofiledrop/.test(String(window.__autoplay || ''));
  if (!fileDropOn) return false;
  // three は送り終えた直後に texture.onUpdate(texture) を呼ぶ。絵ごとに付けず、印の付いた段を持つ絵だけを見る既定の口を置く（自分で onUpdate を付けた絵はそちらが先）
  const P = THREE.Texture.prototype;
  const own = new WeakMap();
  Object.defineProperty(P, 'onUpdate', {
    configurable: true,
    get() { return own.get(this) || fileDropAfterUpload; },
    set(v) { if (v) own.set(this, v); else own.delete(this); },
  });
  return true;
}
function fileDropAfterUpload(t) {
  const arr = Object.getOwnPropertyDescriptor(t, 'mipmaps')?.value, e = arr && FILE_MIPS.get(arr);
  if (!e || !t.isCompressedTexture) return;
  try { const R = window.__renderer; if (!R || !R.properties.get(t).__webglTexture || R.properties.get(t.source).__version !== t.source.version) return; } catch (err) { return; }
  const dims = arr.map((m) => [m.width, m.height]);
  FILE_DROP.n++; for (const m of arr) FILE_DROP.bytes += m.data ? m.data.byteLength : 0;
  Object.defineProperty(t, 'mipmaps', {
    configurable: true, enumerable: true,
    // 中身が要る時：灰色の段を渡し、裏で本物を読み直して送り直す
    get() {
      const ph = dims.map(([w, h]) => ({ width: w, height: h, data: flatBlocks(w, h, e) }));
      Object.defineProperty(this, 'mipmaps', { value: ph, writable: true, configurable: true, enumerable: true });
      FILE_DROP.restore++; if (window.__fdLog) { const k = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^)]*\/([\w.]+\.js):(\d+):\d+/, '$1:$2').slice(0, 60)).join(' < '); window.__fdLog[k] = (window.__fdLog[k] || 0) + 1; }   // 確かめ用：誰が中身を読んだか
      e.reload().then((m) => { if (m && this.mipmaps === ph) { this.mipmaps = m; this.needsUpdate = true; } }).catch(() => { /* 読めなければ灰色のまま */ });
      return ph;
    },
    set(v) { Object.defineProperty(this, 'mipmaps', { value: v, writable: true, configurable: true, enumerable: true }); },
  });
}
export const FILE_DROP = { n: 0, bytes: 0, restore: 0 };
// 一色の ASTC の塊（void extent・LDR）。色の絵は灰色、色でない絵（法線など）は平らな向き
function flatBlocks(w, h, e) {
  const n = Math.ceil(w / e.bw) * Math.ceil(h / e.bh), out = new Uint8Array(n * 16);
  const c = e.srgb ? [0x80, 0x80, 0x80] : [0x80, 0x80, 0xff];
  const blk = [0xfc, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, c[0], c[0], c[1], c[1], c[2], c[2], 0xff, 0xff];
  for (let i = 0; i < n; i++) out.set(blk, i * 16);
  return out;
}
// 読んだ段に「読み直し方」を付ける（ground_photo.js の地面の写真も）
export async function markFileMips(mipmaps, reload, { bw = 4, bh = 4, srgb = true } = {}) {
  const THREE = await import('three');
  if (!fileDropInstall(THREE)) return mipmaps;
  FILE_MIPS.set(mipmaps, { reload: async () => { const m = await reload(); if (m) FILE_MIPS.set(m, FILE_MIPS.get(mipmaps)); return m; }, bw, bh, srgb });
  return mipmaps;
}

// ---- 圧縮した絵（ASTC 4x4）。prototype/tools/astc_tex.py が src/bin/tex/<名>.astc.bin に書く ----
// iPhone の WebContent は GPU の texture も 2GB の壁に乗るので、jpg（4 byte/px）を ASTC（1 byte/px・mip 込み）で読む。
// ASTC の無い機械（古い Windows など）では null を返し、呼ぶ側が jpg へ戻る。
let astcOK = null;
function astcSupported() {
  if (astcOK !== null) return astcOK;
  try {
    const rd = window.__renderer;
    if (rd && rd.extensions) astcOK = !!rd.extensions.has('WEBGL_compressed_texture_astc');
    else { const gl = document.createElement('canvas').getContext('webgl2'); astcOK = !!(gl && gl.getExtension('WEBGL_compressed_texture_astc')); }
  } catch (e) { astcOK = false; }
  return astcOK;
}
export async function compressedTex(name, { srgb = true, anisotropy = 4, wrap = null } = {}) {
  if (!astcSupported()) return null;
  let buf;
  try { buf = await binaryBytes(new URL('./bin/tex/' + name + '.astc.bin', import.meta.url)); if (!buf) return null; } catch (e) { return null; }
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x41535443) return null;   // 'ASTC'
  const width = dv.getUint16(4, true), height = dv.getUint16(6, true), levels = dv.getUint8(8);
  // ブロックの大きさ（tools/astc_enc.py が 9・10 byte 目に書く。無い古い書式は 4x4）
  let bw = 4, bh = 4, o = 9;
  if (buf.byteLength > 15 && dv.getUint16(11, true) === width && dv.getUint16(13, true) === height && [4, 5, 6, 8, 10, 12].includes(dv.getUint8(9)) && [4, 5, 6, 8, 10, 12].includes(dv.getUint8(10))) { bw = dv.getUint8(9); bh = dv.getUint8(10); o = 11; }
  const mipmaps = [];
  for (let i = 0; i < levels; i++) {
    const w = dv.getUint16(o, true), h = dv.getUint16(o + 2, true), n = dv.getUint32(o + 4, true); o += 8;
    mipmaps.push({ data: new Uint8Array(buf, o, n), width: w, height: h }); o += n;
  }
  const THREE = await import('three');
  await markFileMips(mipmaps, () => compressedTex(name, { srgb, anisotropy, wrap }).then((r) => r && r.mipmaps), { bw, bh, srgb });
  const fmt = THREE['RGBA_ASTC_' + bw + 'x' + bh + '_Format'] || THREE.RGBA_ASTC_4x4_Format;
  const t = new THREE.CompressedTexture(mipmaps, width, height, fmt, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = anisotropy;
  if (wrap) t.wrapS = t.wrapT = wrap;
  t.needsUpdate = true;
  return t;
}
// 読み込みの支度で一度だけ縮める。圧縮済みの縮小段を共有し、再圧縮・距離の巡回はしない。
// 返した絵は呼ぶ側で保管して全員に共用する。元の絵は本人・名将用として残せる。
export async function textureAtMost(t, maxSize) {
  if (Math.max(t.image.width, t.image.height) <= maxSize) return t;
  const THREE = await import('three');
  let small;
  if (t.isCompressedTexture) {
    const first = t.mipmaps.findIndex(m => Math.max(m.width, m.height) <= maxSize);
    if (first < 0) throw new Error('絵の縮小段が足りません');
    const mipmaps = t.mipmaps.slice(first), base = mipmaps[0];
    const e = FILE_MIPS.get(t.mipmaps);
    if (e) FILE_MIPS.set(mipmaps, { ...e, reload: () => e.reload().then((m) => { const r = m && m.slice(first); if (r) FILE_MIPS.set(r, FILE_MIPS.get(mipmaps)); return r; }) });
    small = new THREE.CompressedTexture(mipmaps, base.width, base.height, t.format, t.type);
    small.generateMipmaps = false;
  } else {
    const c = document.createElement('canvas'), scale = maxSize / Math.max(t.image.width, t.image.height);
    c.width = Math.max(1, Math.floor(t.image.width * scale)); c.height = Math.max(1, Math.floor(t.image.height * scale));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t.image, 0, 0, c.width, c.height);
    small = new THREE.CanvasTexture(c);
    small.generateMipmaps = t.generateMipmaps;
    small.userData.astcStatic = true;
  }
  small.minFilter = t.minFilter; small.magFilter = t.magFilter; small.flipY = t.flipY;
  small.colorSpace = t.colorSpace; small.anisotropy = t.anisotropy;
  small.wrapS = t.wrapS; small.wrapT = t.wrapT;
  small.repeat.copy(t.repeat); small.offset.copy(t.offset); small.center.copy(t.center); small.rotation = t.rotation;
  small.needsUpdate = true;
  return small;
}
// 圧縮した絵があればそれを、無ければ jpg を読む（flipY=false・色空間・異方性は揃える）
export async function texOr(name, url, { srgb = true, anisotropy = 4 } = {}) {
  const t = await compressedTex(name, { srgb, anisotropy });
  if (t) return t;
  const THREE = await import('three');
  const j = await new THREE.TextureLoader().loadAsync(url);
  j.flipY = false; j.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; j.anisotropy = anisotropy;
  j.userData.freeImage = true;
  return j;
}
