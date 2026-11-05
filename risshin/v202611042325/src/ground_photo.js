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
  okehazama: { grass: [0x697953, 0x788160], soil: [0x756751, 0x605541], k: 0.55, cover: 0.06 },    // 濡れた草と灰褐色の泥。裸地へ緑の斑を塗り足さない
  okawachi: { grass: [0x7e8a4c, 0x9e9a5e], soil: [0xae9866, 0xc6b68a], k: 0.58, cover: 0.3 },       // 乾いた黄土と淡い黄の砂の州
  // 11/2 c_ground_1102c：点付けで「地面が一様で暗い土」の戦（手本の写真の地面の色。暗い一色を手本の明るさへ寄せる）
  shiga: { grass: [0x8e8a5c, 0x6f7c48], soil: [0x857561, 0x96866c], k: 0.5, cover: 0.2 },          // 冬の坂本：枯れ草と落ち葉の茶
  anegawa: { grass: [0x6e9a44, 0x8aa452], soil: [0xb0aa9a, 0x968e7e], k: 0.45, cover: 0 },         // 灰白の玉石の川原と岸の夏草
  t01_yamazaki: { grass: [0x5e8a3c, 0x7a9a48], soil: [0x7a6a52, 0x6a5c48], k: 0.45, cover: 0.3 },  // 円明寺川の湿った田と草
  t05_ichinomiya: { grass: [0x6c9444, 0x92a052], soil: [0x9a8a6c, 0x847660], k: 0.45, cover: 0.25 },
  t09_yamanaka: { grass: [0x5e8a3c, 0x7c9a4a], soil: [0x8a5e44, 0x744e3a], k: 0.45, cover: 0.2 },  // 関東ロームの赤土
  t12_odawara: { grass: [0x6c9040, 0x8c9c50], soil: [0x8c7e66, 0x76694f], k: 0.45, cover: 0.25 },
};
const GROUND_DEFAULT = { grass: [0x6c8a44, 0x8c9258], soil: [0x8a7e68, 0x726a58], k: 0, cover: 0 };
// photo：戦ごとの土の写真（def.groundPhoto）のある戦は、土の所の色寄せを半分にして写真の色を残す（10/30 c_ground_photo2）。
export function groundGrade(key, photo = false) {
  // 色の指定の無い戦（10/31 gap_ground2）：既定の二色ずつ（夏の青草と乾いた灰茶の土）を、量は共通の LAND_GAP2 で掛ける（w＝1 が目印）
  const g = GROUND_GRADE[key] || (key ? GROUND_DEFAULT : null), c = (h) => new THREE.Color(h);
  return {
    uLsGrade: { value: new THREE.Vector4(g ? g.k : 0, g ? g.cover : 0, photo ? 0.5 : 1, g === GROUND_DEFAULT ? 1 : 0) },
    uLsGradeG0: { value: c(g ? g.grass[0] : 0) }, uLsGradeG1: { value: c(g ? g.grass[1] : 0) },
    uLsGradeS0: { value: c(g ? g.soil[0] : 0) }, uLsGradeS1: { value: c(g ? g.soil[1] : 0) },
  };
}

// 土地ごとの地面の物（11/2 c_ground_1102c）：点付けで「地面が一様で暗い土」。手本の写真の地面は、色むらより先に
// 玉石・草の株・水たまり・田と畦のような「物」が目に入る。量を戦ごとに決め、重ね塗りで計算だけで描く（絵も面も足さない）。
// stone：玉石と小石　tuft：草・葦の株　puddle：水たまり（空を映す）　paddy：田と畦（稲株の列・水の張った田）　sc：石の色
const GROUND_FEAT = {
  moribe: { stone: 0.7, tuft: 0.6, puddle: 0.7, paddy: 0.7, sc: 0xb4b0a4 },        // 雨の川原の白い砂利と田
  kanegasaki: { stone: 0.45, tuft: 0.55, puddle: 0.35, paddy: 0, sc: 0x8c8678 },   // 山道の土と石・笹の株
  anegawa: { stone: 1, tuft: 0.6, puddle: 0.12, paddy: 0, sc: 0xc2beb2 },          // 灰白の玉石の川原と草の株
  nodafukushima: { stone: 0.25, tuft: 1, puddle: 0.6, paddy: 0, sc: 0x9a9284 },    // 葦の株と湿地の水たまり
  shiga: { stone: 0.5, tuft: 0.6, puddle: 0.3, paddy: 0, sc: 0x9c968a },         // 坂本の町口：石の多い踏み固めた道と枯れ草の株（町の中に田の畦を引かない）
  iwamura: { stone: 0.6, tuft: 0.55, puddle: 0.25, paddy: 0.3, sc: 0x9a958a },     // 山城の麓の石と草
  tedorigawa: { stone: 1, tuft: 0.4, puddle: 0.8, paddy: 0, sc: 0xa8a59c },        // 雨の川原の砂利と水たまり
  iga: { stone: 0.5, tuft: 0.5, puddle: 0.3, paddy: 0.4, sc: 0x948e82 },           // 盆地の田と灰の石の道
  t01_yamazaki: { stone: 0.3, tuft: 0.7, puddle: 0.7, paddy: 0.9, sc: 0x9a9488 },  // 円明寺川の湿った田と葦
  t05_ichinomiya: { stone: 0.6, tuft: 0.55, puddle: 0.3, paddy: 0.4, sc: 0xa09a8c },
  t09_yamanaka: { stone: 0.45, tuft: 0.8, puddle: 0.35, paddy: 0, sc: 0x8e8278 },   // 関東ロームの赤土と曲輪の草の株
  t12_odawara: { stone: 0.35, tuft: 0.6, puddle: 0.4, paddy: 0.6, sc: 0x9a9488 },
};
const GROUND_FEAT_DEFAULT = { stone: 0.35, tuft: 0.4, puddle: 0.25, paddy: 0, sc: 0x9c968a };
// snowy：雪の積もり得る戦（def.snow・winter・springSnowPatch）。それ以外は明るい灰の地面を雪と見なさない（戦でない所は従来どおり）
export function groundFeat(key, snowy = true) {
  const f = key === null ? { stone: 0, tuft: 0, puddle: 0, paddy: 0, sc: 0x9c968a } : GROUND_FEAT[key] || GROUND_FEAT_DEFAULT;
  return { uLsFeat: { value: new THREE.Vector4(f.stone, f.tuft, f.puddle, f.paddy) }, uLsStoneC: { value: new THREE.Color(f.sc) }, uLsSnowOk: { value: key === null || snowy ? 1 : 0 } };
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
