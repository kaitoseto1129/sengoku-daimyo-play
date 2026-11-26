// 河越城（武蔵国入間郡・太田道灌が築いた平城。川越市の遺構は本丸御殿・富士見櫓跡・土塁・空堀）。K657② 11/25 ヒ三。
// 手本と出所：docs/journey/h01_kawagoe.md・川越市の解説（C）。曲輪の広さと並びは推定。戦の座標のまま（at: { x: 0, z: 0 }・+z が南＝連合の夜回りが探る側）。
// 南の門 (0,20)＝h01 の MON。城は門の北に土塁と空堀で囲む（石垣は無い・江戸の頃の物なので置かない）。北の陣（扇谷上杉 z≈-50）は城の外。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KAWAGOE_PLAN = {
  mon: 'hojo', name: '河越城', type: 'hirajiro', year: 1546, lifeDense: 0.8, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 800, kind: 'hon', capacity: 80, fallbackTo: null, defenseValue: 1,
      poly: rect(-24, 26, -18, 20), gapAt: [[0, 20]], gapW: 6 },
  ],
  koguchi: [
    { id: 'minami', name: '南の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, 20], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: 0.35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 40], [0, 20], [0, 4]] }],
  hori: [
    { kind: 'karabori', pts: [[-30, 25], [-5, 25]], w: 4, deep: 2.5 }, { kind: 'karabori', pts: [[5, 25], [32, 25]], w: 4, deep: 2.5 },
  ],
  yagura: [{ id: 'mon', kind: 'monomi', at: [14, 17], rot: 0 }, { id: 'kita', kind: 'monomi', at: [-18, -14], rot: 0 }],
};
