// 岡本城（伊予国宇和郡三間・土居清良の城。宇和島市三間町の城山）。K656 K657② 11/27 クラウドか。
// 手本と出所：docs/journey/c12_okamoto.md・『清良記』（B）・宇和島市の岡本城跡の解説（C）。三間の盆地の南の小さな山城で、
//   頂の本丸から北へ二の曲輪・木戸の曲輪と段に下がり、曲輪の間は堀切・空堀で切る。斜面の竪堀と搦手の口は南予の山城の型に倣う（推）。曲輪の広さは推定。
// 戦の座標で at: { x: 2, z: 106 }（丘の頂）・-z が長宗我部の寄せる側。木戸の口 (2,-36)＝c12 の GATE (4,70)、
//   二の曲輪＝c12 の KURUWA (-10,96)、本丸＝HONMARU (0,118)、本丸の門の前 (0,104) は二の曲輪の奥。
// 天正の頃の南予の土の城：土塁・柵・堀切・竪堀だけ（天守・石垣は置かない）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const OKAMOTO_PLAN = {
  mon: 'maru', name: '岡本城', type: 'yamajiro', year: 1579, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'kido', name: '木戸の曲輪', level: -4.5, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-14, 16, -36, -20), gapAt: [[2, -36], [-2, -20]], gapW: 10 },
    { id: 'ni', name: '二の曲輪', level: -2.5, wall: null,   // 柵は置かない段の平場（軽い型の兵は柵を回り込めず、柵の中の戦で味方が外に残った・11/27 act bot）
      hp: 560, kind: 'ni', capacity: 90, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-26, 18, -16, 4), gapAt: [[-2, -16], [-2, 4]], gapW: 10 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 10, 7, 22), gapAt: [[-2, 7], [-2, 22]], gapW: 10 },
  ],
  koguchi: [
    { id: 'ote', name: '木戸の口', from: 'out', to: 'kido', kind: 'hira', gate: 'kabuki', at: [2, -36], rot: 0, w: 8, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'karame', name: '搦手の口', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-2, 22], rot: 0, w: 7, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[2, -46], [2, -36], [-2, -20], [-2, -16], [-2, 4], [-2, 7], [-2, 14]] }],
  hori: [
    // 木戸の曲輪と二の曲輪の間の空堀・二の曲輪と本丸の間の堀切（深い）・東西の斜面の竪堀
    { kind: 'karabori', pts: [[-16, -18], [-5, -18]], w: 2.6, deep: 2.2 }, { kind: 'karabori', pts: [[1, -18], [18, -18]], w: 2.6, deep: 2.2 },
    { kind: 'horikiri', pts: [[-14, 5.5], [-5, 5.5]], w: 2.8, deep: 3.5 }, { kind: 'horikiri', pts: [[1, 5.5], [12, 5.5]], w: 2.8, deep: 3.5 },
    { kind: 'tatebori', pts: [[20, -6], [32, -12]], w: 2.4, deep: 2.2 }, { kind: 'tatebori', pts: [[-28, -6], [-40, -12]], w: 2.4, deep: 2.2 },
  ],
  yagura: [{ id: 'kido', kind: 'monomi', at: [12, -32], rot: 0 }, { id: 'hon', kind: 'monomi', at: [6, 18], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-6, 16], w: 9, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
