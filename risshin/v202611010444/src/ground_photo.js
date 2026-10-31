import * as THREE from 'three';
import { texOr } from './bin_assets.js';
import { MEM_TIGHT } from './settings.js';
import { canvasToAstc } from './astc_rt.js';

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

// 戦ごとの地面の写真（10/30 ground_photo）：def.groundPhoto = { dirt: '<名>' } の戦だけ、共用の土の写真の代わりに
// assets/tex/ground_b_<名>.jpg（512角。iPhone の作り MEM_TIGHT は _s の 256角）を読む。絵の口は共用の土と入れ替えるだけで増やさない。
// ASTC の使える機械はその場で 4×4 の ASTC にして送る（共用の土の圧縮版と同じ記憶。256角なら四分の一）。
// 材質の map にも渡すので、戦の終わりの片付けで一緒に返る（作り置きにしない）。読めない時は仮の土色のまま。
export function battleGroundTex(name) {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext('2d'); g.fillStyle = '#5c4b37'; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.userData.noAstc = true;   // 下の読み込みで自分で圧縮する（携帯の canvas の自動圧縮と二重にしない）
  t.userData.photoReady = { value: 0 };
  const N = MEM_TIGHT ? 256 : 512;
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    cv.getContext('2d').drawImage(im, 0, 0, N, N);
    let astc = null;
    try { if (window.__renderer?.extensions.has('WEBGL_compressed_texture_astc')) astc = canvasToAstc(cv, { flip: false, alpha: 'opaque' }); } catch (e) { astc = null; }
    t.dispose();   // 仮の絵の領域を返してから、同じ入れ物に本の絵を渡す
    if (astc) {
      t.image = { width: N, height: N }; t.mipmaps = astc.mipmaps; t.isCompressedTexture = true;
      t.format = THREE.RGBA_ASTC_4x4_Format; t.type = THREE.UnsignedByteType; t.generateMipmaps = false; t.flipY = false;
      cv.width = cv.height = 1;
    } else { t.image = cv; t.flipY = false; }
    t.needsUpdate = true; t.userData.photoReady.value = 1;
  };
  im.src = new URL('../assets/tex/ground_b_' + name + (MEM_TIGHT ? '_s' : '') + '.jpg', import.meta.url).href;
  return t;
}

// 手本の写真の地面の色（10/30 top5_ground）：docs/layout-ref/<戦>/ の写真の地面を見て決めた、草と土の二色ずつ。
// 地面の最後の重ね塗りで、画素の明るさの細かさは残したまま色味だけを寄せ、数十mの斑で二色を混ぜる（茶の一枚にしない）。
// k：寄せる量　cover：茶の土の所を大きな斑で草の色へ変える量（草の少ない戦）。絵も面も足さない（uniform だけ）。
const GROUND_GRADE = {
  inou: { grass: [0x9cae48, 0xbcaa4c], soil: [0x847a66, 0x6c6250], k: 0.6, cover: 0.45 },            // 稲の黄緑〜黄金・乾いた灰茶の道
  echizen: { grass: [0x5c8a38, 0x7e9c4a], soil: [0x77735f, 0x666a56], k: 0.55, cover: 0.4 },        // 苔むした石の道と夏草
  echizen_ikko: { grass: [0x6e8c42, 0xa49c5e], soil: [0x857a68, 0x6a6252], k: 0.55, cover: 0.4 },   // 土手の青草と枯れ草
  arioka: { grass: [0x748a48, 0x96925c], soil: [0x887a62, 0x726650], k: 0.45, cover: 0.2 },
  iga: { grass: [0x587a3a, 0x6e8846], soil: [0x7a705c, 0x86827a], k: 0.5, cover: 0.25 },            // 林の下草と灰の石の道
  inabayama: { grass: [0x5c7a3a, 0x748646], soil: [0x8a867c, 0x6c6558], k: 0.5, cover: 0.15 },     // 灰白の岩肌
  nodafukushima: { grass: [0xb0a06a, 0x7c9248], soil: [0x988a6a, 0x7a6e56], k: 0.5, cover: 0.3 },  // 倒れた枯れ葦の淡い黄土と新しい葦の緑
  odani: { grass: [0x6c9a42, 0x86a64e], soil: [0x7a7462, 0x6a6c5a], k: 0.5, cover: 0.3 },          // 曲輪の短い草の明るい緑
  moribe: { grass: [0x5f9040, 0x7a9c48], soil: [0xa6a294, 0x8a8678], k: 0.62, cover: 0.42 },       // 川原の白っぽい砂利と岸の草（岸の土を草の緑へ。10/31）
  tedorigawa: { grass: [0x96805a, 0x847652], soil: [0x6e6c66, 0x7e7a70], k: 0.5, cover: 0 },       // 雪の川原：枯れ草の茶と灰の石
  okehazama: { grass: [0x568a4c, 0x6c9a52], soil: [0x8a5236, 0x6c432e], k: 0.55, cover: 0.2 },     // 濡れた青緑の田と赤茶の泥
  okawachi: { grass: [0x7e8a4c, 0x9e9a5e], soil: [0xae9866, 0xc6b68a], k: 0.58, cover: 0.3 },       // 乾いた黄土と淡い黄の砂の州
};
// photo：戦ごとの土の写真（def.groundPhoto）のある戦は、土の所の色寄せを半分にして写真の色を残す（10/30 c_ground_photo2）。
export function groundGrade(key, photo = false) {
  const g = GROUND_GRADE[key], c = (h) => new THREE.Color(h);
  return {
    uLsGrade: { value: new THREE.Vector4(g ? g.k : 0, g ? g.cover : 0, photo ? 0.5 : 1, 0) },
    uLsGradeG0: { value: c(g ? g.grass[0] : 0) }, uLsGradeG1: { value: c(g ? g.grass[1] : 0) },
    uLsGradeS0: { value: c(g ? g.soil[0] : 0) }, uLsGradeS1: { value: c(g ? g.soil[1] : 0) },
  };
}

// 近くの地面の粒（10/28 leap_ground3）：砂利・土・草・霜の写真の濃淡（白黒）四枚を、一枚の絵の四つの色の段へ詰める。
// 描き方は一回か二回読むだけで四つの粒を選べる（絵の口を一つしか使わない）。読み終わるまでは 128（粒なし）。
let detailPack = null;
export function groundDetailPack() {
  if (detailPack) return detailPack;
  const N = 512, data = new Uint8Array(N * N * 4).fill(128);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  detailPack = t;
  if (typeof document === 'undefined') return t;
  const kinds = ['gravel', 'soil', 'grass', 'frost'];
  Promise.all(kinds.map((k) => new Promise((ok, ng) => {
    const im = new Image();
    im.onload = () => ok(im); im.onerror = ng;
    im.src = new URL('../assets/tex/ground_d_' + k + '.jpg', import.meta.url).href;
  }))).then((ims) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    ims.forEach((im, c) => {
      cx.drawImage(im, 0, 0, N, N);
      const px = cx.getImageData(0, 0, N, N).data;
      for (let i = 0; i < N * N; i++) data[i * 4 + c] = px[i * 4];
    });
    t.needsUpdate = true;
  }).catch(() => { /* 読めない時は粒なしのまま */ });
  return t;
}
