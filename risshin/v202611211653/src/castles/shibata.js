// 新発田城（越後・平城。新発田重家の居城）。手本と出所は docs/battle_refs/shibata.md（K563 上杉編 u14・11/21 クラウド35）。
// 局所の座標（原点＝u14 の (0,115)。-z が南＝寄せ手の側）。大手は南の二の丸の口（u14 の GATE (0,70) の先）、その奥に本丸。
// 天正十五年（1587）の頃は土塁と柵・堀の城（今の石垣・櫓は江戸の溝口氏の作りなので置かない）。寸法は推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const SHIBATA_PLAN = {
  mon: 'maru', name: '新発田城', type: 'hira', year: 1582,   // 本当は1587。石垣の無い土の城の作り（板塀・板葺き・塀を一つの束に）は year ≤ 1582 で選ばれるので1582と書く
  lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: 0.6, wall: 'saku', hp: 600, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-24, 24, -31, -3), gapAt: [[0, -31], [0, -3]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 1.2, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-20, 20, 1, 31), gapAt: [[0, 1]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '大手', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, -31], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -36], [0, -31], [0, -3], [0, 1], [0, 16]] }],
  hori: [
    { kind: 'mizubori', pts: [[-28, -1], [-4, -1]], w: 3, deep: 2, water: true }, { kind: 'mizubori', pts: [[4, -1], [28, -1]], w: 3, deep: 2, water: true },
    { kind: 'mizubori', pts: [[-27, -31], [-27, 34], [27, 34], [27, -31]], w: 3, deep: 2, water: true },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [14, 26], rot: 0 }, { id: 'ote', kind: 'monomi', at: [16, -26], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-2, 16], w: 12, d: 7, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
