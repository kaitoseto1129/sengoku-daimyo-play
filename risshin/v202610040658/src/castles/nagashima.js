// 長島の二砦。遺構・当日の縄張り図がないため、形と距離は推定。
// 川は戦の地形で描く。汎用の河川砦から、史料にない橋・人工の堀を足さない。
export const NAKAE_GATE = { x: 0, z: -52, name: '中江の柵の口' };
export const YANAGASHIMA = { x: 48, z: -70 };

export const NAKAE_PLAN = {
  name: '中江の砦',
  kuruwa: [{ id: 'nakae', name: '中江の囲み', poly: [[-30, -56], [-10, -52], [10, -52], [30, -56], [30, -102], [-30, -102]], level: 0, wall: 'palisade', gapAt: [0, -52] }],
  koguchi: [{ id: 'nakae_gate', name: '柵の口', at: [0, -52] }],
  paths: [{ pts: [[0, -52], [0, -80]], w: 2 }],
  hori: [],
};
export const YANAGASHIMA_PLAN = {
  name: '屋長島の砦',
  kuruwa: [{ id: 'yanagashima', name: '屋長島の囲み', poly: [[36, -54], [66, -54], [66, -94], [36, -94]], level: 0, wall: 'palisade', gapAt: [48, -54] }],
  koguchi: [{ id: 'yana_gate', name: '柵の口', at: [48, -54] }],
  paths: [{ pts: [[48, -54], [48, -70]], w: 2 }],
  hori: [],
};
