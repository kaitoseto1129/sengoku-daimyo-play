import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { compressedTex } from './bin_assets.js';

// 自作の模様は置き場の素材の箱から読む。外への画像の問い合わせはしない。
const cache = new Map();
let source;
let lastQuality = SETTINGS.quality;
export function trimGeneratedTex() {
  if (lastQuality === SETTINGS.quality) return;
  lastQuality = SETTINGS.quality;
  const size = 1024;
  for (const tex of cache.values()) {
    tex.anisotropy = 4;
    const canvas = tex.image;
    if (!(canvas instanceof HTMLCanvasElement)) continue;   // 圧縮した絵（ASTC）はそのまま
    if (canvas.width > size) {
      // 設定が下がった時だけ縮める。毎コマは比較だけで、絵や材質を作らない。
      const small = document.createElement('canvas'); small.width = small.height = size;
      small.getContext('2d').drawImage(canvas, 0, 0, size, size);
      tex.dispose(); // 古い大きさの描画用の領域を解放する。材質は同じ絵を参照し続ける。
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(small, 0, 0);
    }
    tex.needsUpdate = true;
  }
}
export function generatedTex(kind, detail = false) {
  const key = kind + (detail ? '-detail' : '');
  if (cache.has(key)) return cache.get(key);
  // 圧縮した絵（src/bin/tex/gen_<名>.astc.bin。ASTC の機械だけ）：canvas に描かず、読めたら texture を圧縮の形へ差し替える
  // （材質は同じ texture を指し続けるので、物を作り直さない）。読めない時は下の canvas の道へ
  const comp = compressedTex('gen_' + key, { srgb: true, anisotropy: 4, wrap: THREE.MirroredRepeatWrapping });
  const size = 1024;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
  const g = canvas.getContext('2d');
  g.fillStyle = detail ? '#d4d0c8' : kind === 'nozura' ? '#99958b' : kind === 'cedar' ? '#8c7764' : '#79634c';
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  // 隣を裏返して同じ端同士を合わせる。圧縮後の端も色が飛ばずにつながる。
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  comp.then((ct) => {
    if (!ct) { drawJpeg(); return; }
    // 圧縮の形へ：three は isCompressedTexture と mipmaps を見て送る
    tex.image = { width: ct.image.width, height: ct.image.height }; tex.mipmaps = ct.mipmaps;
    tex.isCompressedTexture = true; tex.format = ct.format; tex.type = ct.type; tex.flipY = false; tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  }).catch(drawJpeg);
  function drawJpeg() {
  canvas.width = canvas.height = size;
  g.fillStyle = detail ? '#d4d0c8' : kind === 'nozura' ? '#99958b' : kind === 'cedar' ? '#8c7764' : '#79634c';
  g.fillRect(0, 0, size, size);
  tex.needsUpdate = true;
  // 一度だけ開き、同じ絵の入れ物に描く。読み終わっても材質を作り直さない。
  source ||= import('./asset_reader.js').then(({ readAsset }) => readAsset('tex_generated', 'images')).finally(() => { source = null; });
  source.then(({ default: images }) => {
    const image = new Image();
    const address = URL.createObjectURL(images[kind]);
    image.onload = () => {
      URL.revokeObjectURL(address);
      // 木と一つずつ積んだ石は、今ある頂点の色に木目・石肌の濃淡だけを重ねる。
      g.filter = detail ? 'grayscale(1) brightness(1.8)' : 'none';
      if (detail && kind === 'nozura') {
        // 石垣全体の目地を石一つの中に描かない。生成した大石の石肌だけを使う。
        g.drawImage(image, image.width * 0.45, image.height * 0.16, image.width * 0.23, image.height * 0.2, 0, 0, canvas.width, canvas.height);
      } else g.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = "";
      tex.needsUpdate = true;
    };
    image.onerror = () => { URL.revokeObjectURL(address); }; // 読めない時も下地の色で遊べる。
    image.src = address;
  }).catch(() => {});
  }
  return tex;
}
