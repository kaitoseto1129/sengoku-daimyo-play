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
