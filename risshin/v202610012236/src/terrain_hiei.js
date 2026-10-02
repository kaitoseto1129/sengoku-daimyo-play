// ======================================================================
// terrain_hiei.js … 比叡山と坂本・宇佐山の広域の地形（国土地理院の標高。docs/CREDITS.md）
// docs/hiei-1571-spec.md 2・33章／mid6-1570-1572-spec.md 49〜52・69章：
//   宇佐山・坂本・日吉社・本坂・東塔・西塔・横川を、一枚の標高の格子（asset_dem_hiei_wide.js）から切り出す。
//   1570 志賀の陣（宇佐山城・b_shiga.js）と 1571 比叡山（b_hiei_mtn.js）が同じ土地を使い、
//   「同じ土地へまた来た」と感じられるようにする。建物・軍勢・季節・壊れ方だけを戦ごとに変える。
// 使い方：
//   import { hieiWindow, PLACES } from './terrain_hiei.js';
//   const W = hieiWindow({ lat: 35.07, lon: 135.846, xy: 10, vs: 1 / 9 });
//   W.height(x, z)          … ゲームの (x, z) の地面の高さ（湖の水面＝0）
//   W.at('konponchudo')     … 名所のゲームの座標 { x, z }
// ローカル座標：x＝東+、z＝南+。xy：ゲームの 1 が実の何 m か。vs：実の 1m をゲームの高さいくつにするか。
// ======================================================================
import DEM from './asset_dem_hiei_wide.js';
import { demSample } from './dem.js';

const M_LAT = 111320, M_LON = 111320 * Math.cos(DEM.lat0 * Math.PI / 180);

// 名所（緯度経度は史跡の目安。hist は 62 章の確度の札：HIST_A 存在の確度が高い／HIST_B 存在するが姿・位置は推定／GAME_C ゲームの補い）
export const PLACES = {
  usayama: { name: '宇佐山城', lat: 35.0336, lon: 135.8464, hist: 'HIST_A' },
  sakamoto: { name: '坂本', lat: 35.0690, lon: 135.8640, hist: 'HIST_A' },
  hiyoshi: { name: '日吉社', lat: 35.0716, lon: 135.8616, hist: 'HIST_A' },
  honzaka: { name: '本坂の登り口', lat: 35.0688, lon: 135.8582, hist: 'HIST_B' },
  monjuro: { name: '文殊楼', lat: 35.0707, lon: 135.8432, hist: 'HIST_A' },
  konponchudo: { name: '根本中堂', lat: 35.0705, lon: 135.8414, hist: 'HIST_A' },
  daikodo: { name: '大講堂', lat: 35.0716, lon: 135.8405, hist: 'HIST_A' },
  mudoji: { name: '無動寺谷', lat: 35.0598, lon: 135.8480, hist: 'HIST_A' },
  jodoin: { name: '浄土院', lat: 35.0730, lon: 135.8355, hist: 'HIST_A' },
  shakado: { name: '西塔 釈迦堂', lat: 35.0739, lon: 135.8318, hist: 'HIST_A' },
  rurido: { name: '瑠璃堂', lat: 35.0775, lon: 135.8289, hist: 'HIST_A' },
  yokawa: { name: '横川中堂', lat: 35.0911, lon: 135.8357, hist: 'HIST_A' },
  obie: { name: '大比叡', lat: 35.0667, lon: 135.8353, hist: 'HIST_A' },
};

// 緯度経度 → 格子の中心からの実の m（x 東+、z 南+）
export function realOf(lat, lon) { return { x: (lon - DEM.lon0) * M_LON, z: -(lat - DEM.lat0) * M_LAT }; }
// 実の m の地点の標高（湖の水面からの m。格子の外は端の値）
export function realHeight(rx, rz) { return demSample(DEM, rx, rz); }

// 一つの戦が使う切り出し。center（緯度経度）をゲームの原点にして、xy 倍に縮め、高さは vs を掛ける
export function hieiWindow(o) {
  const c = realOf(o.lat, o.lon), xy = o.xy || 10, vs = o.vs ?? 1 / xy;
  const W = {
    xy, vs,
    height: (x, z) => realHeight(c.x + x * xy, c.z + z * xy) * vs,
    toGame: (lat, lon) => { const r = realOf(lat, lon); return { x: (r.x - c.x) / xy, z: (r.z - c.z) / xy }; },
    at: (key) => { const p = PLACES[key]; return p ? W.toGame(p.lat, p.lon) : null; },
    lakeLevel: 0,
  };
  return W;
}
