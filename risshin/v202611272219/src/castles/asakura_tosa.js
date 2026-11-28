// 朝倉城（土佐国土佐郡朝倉・本山茂辰の城。高知市朝倉の城山）。K656 K657② 11/25 クラウドす。
// 手本と出所：docs/journey/c02_asakura.md・高知市の朝倉城跡の解説（C）。城山の頂に詰ノ段、南へ二ノ段・三ノ段と段に下がり、
//   曲輪の間は堀切で切る。西の尾根に出た曲輪（西の曲輪）と、斜面の竪堀は土佐の山城の型に倣う（推）。曲輪の広さは推定。
// 戦の座標で at: { x: 4, z: 142 }・-z が長宗我部の寄せる側（大手の口 (4,114)＝c02 の CASTLE (4,100) の14歩先）。
// 永禄の頃の土の城：土塁・柵・堀切・竪堀だけ（天守・石垣は置かない）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const ASAKURA_TOSA_PLAN = {
  mon: 'maru', name: '朝倉城', type: 'yamajiro', year: 1562, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'san', name: '三ノ段', level: -6, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-20, 20, -28, -15), gapAt: [[0, -28], [0, -15], [-20, -20]], gapW: 6 },
    { id: 'nishi', name: '西の曲輪', level: -6, wall: 'saku', hp: 420, kind: 'demaru', capacity: 60, fallbackTo: 'ni', defenseValue: .45,
      poly: rect(-42, -26, -24, -8), gapAt: [[-34, -24], [-26, -20]], gapW: 6 },
    { id: 'ni', name: '二ノ段', level: -3, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-16, 16, -10, 2), gapAt: [[0, -10], [0, 2]], gapW: 6 },
    { id: 'hon', name: '詰ノ段', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 12, 7, 22), gapAt: [[0, 7]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [0, -28], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'nishi', name: '西の口', from: 'out', to: 'nishi', kind: 'hira', gate: 'kabuki', at: [-34, -24], rot: 0, w: 5, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -40], [0, -28], [0, -15], [0, -10], [0, 2], [0, 7], [0, 14]] }],
  hori: [
    // 詰ノ段と二ノ段の間の堀切（深い）・二ノ段と三ノ段の間の空堀・西の斜面の竪堀
    { kind: 'horikiri', pts: [[-20, 4.5], [-3, 4.5]], w: 3.5, deep: 4 }, { kind: 'horikiri', pts: [[3, 4.5], [20, 4.5]], w: 3.5, deep: 4 },
    { kind: 'karabori', pts: [[-22, -12.5], [-3, -12.5]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[3, -12.5], [22, -12.5]], w: 3, deep: 2.5 },
    { kind: 'tatebori', pts: [[18, 12], [30, 4]], w: 2.6, deep: 2.4 }, { kind: 'tatebori', pts: [[-18, 14], [-30, 8]], w: 2.6, deep: 2.4 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [14, -24], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-8, 18], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [4, 15], w: 10, d: 5, rot: 0, door: 1, name: '詰ノ段の館', where: '詰ノ段の館の奥' },
};
