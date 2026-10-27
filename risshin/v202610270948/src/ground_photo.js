import * as THREE from 'three';
import { texOr } from './bin_assets.js';

// 同梱の二次元・四角四画素の圧縮画像だけを読む。携帯では展開も再圧縮もしない。
export function groundMipmaps(buffer) {
  const v = new DataView(buffer);
  const signature = [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10];
  if (buffer.byteLength < 80 || !signature.every((n, i) => v.getUint8(i) === n)) throw new Error('地面の画像形式が違います');
  const u = o => v.getUint32(o, true);
  const width = u(20), height = u(24), count = u(40);
  if (u(12) !== 158 || u(16) !== 1 || width !== 512 || height !== 512 || u(28) || u(32) || u(36) !== 1 || count !== 10 || u(44)) throw new Error('地面の圧縮方式が違います');
  if (buffer.byteLength < 80 + count * 24) throw new Error('地面の縮小段が足りません');
  const mipmaps = [];
  for (let i = 0; i < count; i++) {
    const p = 80 + i * 24, offset = Number(v.getBigUint64(p, true)), length = Number(v.getBigUint64(p + 8, true));
    const w = Math.max(1, width >> i), h = Math.max(1, height >> i);
    if (!Number.isSafeInteger(offset) || offset < 80 + count * 24 || offset % 16 || length !== Math.ceil(w / 4) * Math.ceil(h / 4) * 16 || offset + length > buffer.byteLength || v.getBigUint64(p + 16, true) !== BigInt(length)) throw new Error('地面の縮小段が壊れています');
    mipmaps.push({ data: new Uint8Array(buffer, offset, length), width: w, height: h });
  }
  return mipmaps;
}

export async function loadGroundPhoto(kind) {
  if (window.__renderer?.extensions.has('WEBGL_compressed_texture_astc')) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL('../assets/tex/ground_' + kind + '.ktx2', import.meta.url), { signal: controller.signal });
      if (!response.ok) throw new Error('地面の圧縮画像を読めません');
      const mipmaps = groundMipmaps(await response.arrayBuffer());
      const t = new THREE.CompressedTexture(mipmaps, 512, 512, THREE.RGBA_ASTC_4x4_Format, THREE.UnsignedByteType);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.flipY = false; t.generateMipmaps = false; t.needsUpdate = true;
      return t;
    } catch (e) { /* 古い同梱版や圧縮非対応の機械は従来の読み口へ戻る。 */ }
    finally { clearTimeout(timer); }
  }
  return texOr('ground_' + kind, new URL('../assets/tex/ground_' + kind + '.jpg', import.meta.url).href);
}
