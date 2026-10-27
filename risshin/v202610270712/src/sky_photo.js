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
