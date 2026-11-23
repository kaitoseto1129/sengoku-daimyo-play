// 箕輪城（上野・榛名の麓の平山城。長野業盛の城）。手本と出所は docs/battle_refs/minowa.md（K563 武田編 d02・11/21 クラウド35）。
// 座標は d02 の戦の座標そのまま（at: { x: 0, z: 0 }。+z が南＝寄せ手の側）。段の高さは d02 の丘（頂 27 前後）からの差。
// 大手の木戸 (6,38)＝d02 の OTE (6,46) の8歩先。二の丸の前 (4,6)・本丸 (0,-34) は戦の段の場所。間に大堀切。
// 永禄九年（1566）の頃は土塁・空堀・堀切の城（石垣は後の井伊氏の頃の物なので置かない）。曲輪の名と並びは推定を含む（紙に）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const MINOWA_PLAN = {
  mon: 'maru', name: '箕輪城', type: 'hirayama', year: 1566, lifeDense: 1.2, lifeNoFlags: true,
  gateSlope: 8,   // 口ごとに坂（切り通し）。曲輪の段の差が崖になり、本人と兵が二の丸へ登れず段が時間切れになった（11/21 act）
  kuruwa: [
    { id: 'san', name: '三の丸', level: -9, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-24, 30, 16, 36), gapAt: [[6, 36], [4, 16]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: -3, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-22, 26, -14, 11), gapAt: [[4, 11], [2, -14]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-20, 22, -58, -22), gapAt: [[1, -22]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の木戸', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [6, 36], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'san_n', name: '三の丸の北の口', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [4, 16], rot: 0, w: 5, maxFlow: 7 },
    { id: 'ni_s', name: '二の丸の口', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [4, 11], rot: 0, w: 5, maxFlow: 7 },
    { id: 'ni_n', name: '二の丸の北の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [2, -14], rot: 0, w: 5, maxFlow: 7 },
    { id: 'hon', name: '本丸の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [1, -22], rot: 0, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[6, 44], [6, 36], [4, 16], [4, 11], [2, -14], [1, -22], [0, -34]] }],
  hori: [
    { kind: 'horikiri', pts: [[-30, -18], [-3, -18]], w: 4, deep: 4 }, { kind: 'horikiri', pts: [[6, -18], [32, -18]], w: 4, deep: 4 },
    { kind: 'karabori', pts: [[-28, 13.5], [0, 13.5]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[8, 13.5], [34, 13.5]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [22, 30], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-14, -52], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [12, -50], w: 9, d: 5, rot: 0, door: 1, name: '持仏堂', where: '本丸の持仏堂' },
};
