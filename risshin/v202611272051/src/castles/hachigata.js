// 鉢形城（武蔵国男衾郡・荒川の断崖と深沢川に挟まれた崖端の城。北条氏邦の城）。K656 K657② 11/25 クラウドす。
// 手本と出所：docs/journey/h09_hachigata.md・寄居町の解説と国指定史跡の案内（C）。荒川に臨む北の崖の端に本曲輪、
//   南へ二の曲輪・三の曲輪と段に下がり、曲輪の間は堀切と空堀で切る。三の曲輪の土塁の石積み（低い）は寄居町の復元に倣う。曲輪の広さは推定。
// 戦の座標のまま（at: { x: 0, z: 0 }・+z が南＝北国勢の寄せる側・-z の川＝荒川）。大手の口 (0,42)＝h09 の OTE (0,50) の8歩先。
// 西の搦手の口 (-26,28)＝狼煙台 (-80,-10) へ出る道。天正十八年（1590）の頃は土塁・空堀・堀切の城（天守・総石垣は置かない）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const HACHIGATA_PLAN = {
  mon: 'hojo', name: '鉢形城', type: 'hirayama', year: 1590, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'san', name: '三の曲輪', level: -4, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-26, 26, 18, 42), gapAt: [[0, 42], [-26, 28], [2, 18]], gapW: 6 },
    { id: 'ni', name: '二の曲輪', level: -2, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-22, 24, -8, 13), gapAt: [[2, 13], [4, -8]], gapW: 6 },
    { id: 'hon', name: '本曲輪', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-18, 22, -28, -12), gapAt: [[4, -12]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [0, 42], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'karame', name: '搦手の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [-26, 28], rot: Math.PI / 2, w: 5, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 50], [0, 42], [2, 18], [2, 13], [4, -8], [4, -12], [2, -20]] }],
  hori: [
    // 本曲輪と二の曲輪の間の堀切（深い）・二の曲輪と三の曲輪の間の空堀
    { kind: 'horikiri', pts: [[-26, -10], [1, -10]], w: 4, deep: 4 }, { kind: 'horikiri', pts: [[7, -10], [30, -10]], w: 4, deep: 4 },
    { kind: 'karabori', pts: [[-28, 15.5], [-1, 15.5]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[5, 15.5], [32, 15.5]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [18, 37], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-12, -24], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [10, -21], w: 10, d: 5, rot: 0, door: 1, name: '本曲輪の館', where: '本曲輪の館の奥' },
};
