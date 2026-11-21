// 花沢城（駿河・標高150mの丘陵の山城。今川方の小原鎮実が守った）。手本と出所は docs/battle_refs/hanazawa.md（K563 武田編 d05・11/21 クラウド35）。
// 座標は d05 の戦の座標そのまま（at: { x: 0, z: 0 }。+z が南＝麓と寄せ手の側）。段の高さは d05 の丘からの差（at の地面 35）。
// 頁の並び：山頂に本曲輪（29m×65m）と二ノ曲輪（28m×66m）、その間に大堀切、稜線に堀切・竪堀。虎口 (2,-6)・本曲輪 (0,-40) は戦の段の場所。
// 永禄十三年（1570）の頃の土の城（石垣なし）。寸法は頁の大きさを戦の広さに合わせて縮めた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const HANAZAWA_PLAN = {
  mon: 'imagawa', name: '花沢城', type: 'yama', year: 1570, lifeDense: 1.2, lifeNoFlags: true,
  gateSlope: 8,   // 口ごとに坂（切り通し）。段の差を崖にしない（d02 箕輪の act で分かった）
  kuruwa: [
    { id: 'ni', name: '二ノ曲輪', level: 4, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-13, 15, -30, -9), gapAt: [[2, -9], [1, -30]], gapW: 6 },
    { id: 'hon', name: '本曲輪', level: 5, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 14, -70, -36), gapAt: [[0, -36]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '虎口', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [2, -9], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'ni_n', name: '二ノ曲輪の北の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [1, -30], rot: 0, w: 5, maxFlow: 7 },
    { id: 'hon', name: '本曲輪の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, -36], rot: 0, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[2, -2], [2, -9], [1, -30], [0, -36], [0, -44]] }],
  hori: [
    { kind: 'horikiri', pts: [[-20, -33], [-4, -33]], w: 3.5, deep: 4 }, { kind: 'horikiri', pts: [[4, -33], [20, -33]], w: 3.5, deep: 4 },   // 大堀切
    { kind: 'horikiri', pts: [[-12, -74], [12, -74]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-15, -20], [-30, -24]], w: 2.5, deep: 2.5 }, { kind: 'tatebori', pts: [[17, -20], [32, -24]], w: 2.5, deep: 2.5 },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [8, -66], rot: 0 }, { id: 'ote', kind: 'monomi', at: [10, -14], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-4, -60], w: 9, d: 5, rot: 0, door: 1, name: '本曲輪の館', where: '本曲輪の館の奥' },
};
