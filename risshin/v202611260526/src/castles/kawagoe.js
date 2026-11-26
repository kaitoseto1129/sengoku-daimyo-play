// 河越城（武蔵国入間郡・太田道灌が築いた平城。川越市の遺構は本丸御殿・富士見櫓跡・土塁・空堀）。K657② 11/25 ヒ三。
// 手本と出所：docs/journey/h01_kawagoe.md・川越市の解説（C）。曲輪の広さと並びは推定。戦の座標のまま（at: { x: 0, z: 0 }）。
// 11/26 クラウドか：城が門の北（連合の側）にあり、連合の兵が城の中から湧いて北条が外で守る形だった→城を門の南へ移した（門は北の口＝連合の陣の側）。
//   本人の出 (0,40) と綱成の手は本丸の中。西の口は狼煙の櫓台 (-70,30) へ出る搦手。東に二の丸、南西の隅に富士見櫓（川越市の富士見櫓跡の所）。
//   土塁を高く（dorui 2.4）・門の前の空堀を広く深くし、本丸の館を置いて、連合の側から城と分かるようにした。石垣は江戸の頃の物なので置かない。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KAWAGOE_PLAN = {
  mon: 'hojo', name: '河越城', type: 'hirajiro', year: 1546, lifeDense: 0.8, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', dorui: 2.4, hp: 800, kind: 'hon', capacity: 80, fallbackTo: null, defenseValue: 1,
      poly: rect(-24, 26, 20, 58), gapAt: [[0, 20], [-24, 32], [26, 38]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: 0, wall: 'saku', dorui: 2, hp: 560, kind: 'ni', capacity: 60, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(32, 60, 24, 54), gapAt: [[32, 38]], gapW: 6 },
  ],
  koguchi: [
    { id: 'kita', name: '北の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, 20], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: 0.35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 4], [0, 20], [0, 36]] }],
  hori: [
    { kind: 'karabori', pts: [[-32, 14], [-5, 14]], w: 5, deep: 3 }, { kind: 'karabori', pts: [[5, 14], [62, 14]], w: 5, deep: 3 },
    { kind: 'karabori', pts: [[-30, 16], [-30, 27]], w: 4, deep: 2.5 }, { kind: 'karabori', pts: [[-30, 37], [-30, 64]], w: 4, deep: 2.5 },
  ],
  yagura: [{ id: 'mon', kind: 'monomi', at: [17, 24], rot: 0 }, { id: 'nw', kind: 'monomi', at: [-20, 24], rot: 0 },
    { id: 'fujimi', kind: 'monomi', at: [-20, 54], rot: 0 }, { id: 'ni', kind: 'monomi', at: [56, 28], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [10, 52], w: 12, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
