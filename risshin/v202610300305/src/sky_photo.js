import * as THREE from 'three';

// 空の写真（Poly Haven の CC0 の空を、雲の濃淡だけの「比」の絵にした 1024×256）。
// 絵の値 v は「その高さの空の平均に対する比」を sqrt(比/4) で収めたもの。日の輪は抜いてあり、日の位置は uSun に置く。
// 空の色・朝焼け・雨の暗さは今までの空の作りに任せ、雲の形だけを写真から借りる。戦ごとに一枚だけ読む（約10〜40KB）。
const PHOTOS = {
  morning: { file: 'sky_morning.jpg', sun: 0.5312 },
  day: { file: 'sky_day.jpg', sun: 0.5938 },
  dusk: { file: 'sky_dusk.jpg', sun: 0.6367 },
  overcast: { file: 'sky_overcast.jpg', sun: 0.5859 },
  night: { file: 'sky_night.jpg', sun: 0.6211 },
};
const cache = new Map();

export function skyPhotoKey(timeKey, mood) {
  if (timeKey === 'dusk') return 'dusk';
  if (timeKey === 'night') return 'night';
  if (timeKey === 'storm' || timeKey === 'after') return 'overcast';
  if (timeKey === 'morning' || mood === 'morning') return 'morning';
  return 'day';
}

export function loadSkyPhoto(key) {
  const p = PHOTOS[key] || PHOTOS.day;
  if (!cache.has(key)) {
    cache.set(key, new THREE.TextureLoader().loadAsync(new URL('../assets/tex/' + p.file, import.meta.url).href).then((t) => {
      // 色ではなく比の値なので、色空間の変換をしない。縮小画像は作らない（方位の継ぎ目に線が出るため）
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.userData.sun = p.sun;
      return t;
    }).catch(() => null));
  }
  return cache.get(key);
}

// 本物の空の光（Poly Haven の CC0 の HDR の空を 256×64 の上半分に縮めた物。tools/sky_env.mjs）。
// 映り込み（scene.environment）と半球光の色を、この空から作る。日の輪は空の平均の六倍で抑えてある（日差しは平行光が受け持つ）。
// sun は日のある列（雲の写真と同じ向き）、irr は上から受ける光の平均、col はその色、keep は戦の空の色を残す割合。
const ENVS = {
  morning: { file: 'env_morning.hdr', sun: 0.5312, irr: 0.8101, col: [0.594, 0.748, 1], keep: 0.3 },
  day: { file: 'env_day.hdr', sun: 0.5938, irr: 0.464, col: [0.588, 0.683, 1], keep: 0.3 },
  dusk: { file: 'env_dusk.hdr', sun: 0.6367, irr: 1.069, col: [0.716, 0.703, 1], keep: 0.5 },
  overcast: { file: 'env_overcast.hdr', sun: 0.5859, irr: 1.284, col: [0.782, 0.849, 1], keep: 0.3 },
  rain: { file: 'env_rain.hdr', sun: 0.4668, irr: 1.486, col: [1, 0.991, 0.996], keep: 0.3 },
  night: { file: 'env_night.hdr', sun: 0.6211, irr: 0.6341, col: [1, 0.983, 0.987], keep: 0.75 },
};
const envCache = new Map();

export function skyEnvKey(timeKey, mood) {
  if (timeKey === 'storm') return 'rain';
  return skyPhotoKey(timeKey, mood);
}

// 圧縮しない RGBE を読み、半精度の絵にする（iPhone でも線形の補間ができる）。戦ごとに一枚（64KB）
export function loadSkyEnv(key) {
  const p = ENVS[key] || ENVS.day;
  if (!envCache.has(key)) {
    envCache.set(key, fetch(new URL('../assets/sky/' + p.file, import.meta.url).href).then((r) => r.arrayBuffer()).then((ab) => {
      const b = new Uint8Array(ab), text = new TextDecoder('latin1').decode(b.subarray(0, 120));
      const m = text.match(/-Y (\d+) \+X (\d+)\n/);
      const H = +m[1], W = +m[2], off = m.index + m[0].length, data = new Uint16Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const e = b[off + i * 4 + 3], f = e ? Math.pow(2, e - 136) : 0;
        data[i * 4] = THREE.DataUtils.toHalfFloat(b[off + i * 4] * f);
        data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(b[off + i * 4 + 1] * f);
        data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(b[off + i * 4 + 2] * f);
        data[i * 4 + 3] = 15360;
      }
      const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      t.userData = { ...p };
      return t;
    }).catch(() => null));
  }
  return envCache.get(key);
}
