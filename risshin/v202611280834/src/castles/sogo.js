// 十河城（讃岐国山田郡十河・十河存保の城。今の高松市十川東町の城跡）。K656 K657② 11/28 クラウドせ。
// 手本と出所：docs/journey/c05_sogo.md・docs/kaito_refs_all/20261126/chosokabe15_spec.md「8 十河城の戦い」（戦場＝城・水路・田・外柵・陣地）・
//   『土佐物語』（B）・高松市の十河城跡の解説（C：春日川の西の低い台地の端に建ち、まわりを堀と沼の田に囲まれた城）。
//   曲輪の並びと広さは推定（南の大手から二の丸、堀切を越えて北の本丸。本丸の北と西に搦手）。
// 戦の座標で at: { x: 0, z: 120 }（c05 の丘 (0,126) の上）・-z が長宗我部の寄せる側。大手の口 (0,-24)＝c05 の GATE (0,96)、
//   降伏の使いを迎える門前 (0,112)＝二の丸の奥 (0,-8)、本丸の旗本 (0,128)＝本丸 (0,8)、存保の退き口 (-40,136)＝本丸の西の外 (-40,16)。
//   段から段へまっすぐ歩く線（大手→西の退き口→本丸→門前）が柵に当たらないよう、二の丸の北西・本丸の西にも口を開けた。
// 天正の頃の讃岐の土の城：土塁と柵・空堀・堀切だけ（天守・石垣・白壁は置かない）。遠景の作りなので水堀は空堀になる（light_castle）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const SOGO_PLAN = {
  mon: 'miyoshi', name: '十河城', type: 'hira', year: 1584, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -3, wall: 'saku', hp: 600, kind: 'ni', capacity: 90, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-24, 22, -24, -5), gapAt: [[0, -24], [-20, -5], [0, -5]], gapW: 10 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-15, 15, -1, 19), gapAt: [[0, -1], [-15, 11], [0, 19]], gapW: 12 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の口', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, -24], rot: 0, w: 8, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'karame', name: '搦手の口', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, 19], rot: 0, w: 7, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -36], [0, -24], [0, -5], [0, -1], [0, 8]] }],
  hori: [
    // 大手の前の堀（口の前だけ土橋で切らない）・二の丸と本丸の間の堀切・東西の外堀
    { kind: 'karabori', pts: [[-30, -29], [-5, -29]], w: 3.2, deep: 2.4 }, { kind: 'karabori', pts: [[5, -29], [28, -29]], w: 3.2, deep: 2.4 },
    { kind: 'horikiri', pts: [[-15, -3], [-5, -3]], w: 2.6, deep: 3 }, { kind: 'horikiri', pts: [[5, -3], [15, -3]], w: 2.6, deep: 3 },
    { kind: 'karabori', pts: [[28, -26], [28, 6]], w: 3, deep: 2.2 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [12, -20], rot: 0 }, { id: 'hon', kind: 'monomi', at: [10, 15], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-6, 14], w: 9, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
