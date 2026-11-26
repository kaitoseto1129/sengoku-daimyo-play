// 上月城（播磨国佐用郡上月・赤松政範の城、天正六年は尼子勝久・山中鹿介が籠る。佐用町の上月城跡）。K656 K655 11/26 クラウドか。
// 手本と出所：佐用町の上月城跡の解説（C）・『陰徳太平記』（B）。荒神山の頂の本丸と、東の尾根を堀切で切った二の丸の土の山城（天守・石垣は置かない）。
//   曲輪の広さと並びは推定（同じ頃の播磨の土の山城の型に倣う）。
// 戦の座標で at: { x: -50, z: 96 }（m09 の HONMARU）・-z が毛利の寄せる側。大手の門 (16,-42)＝m09 の KUGURI (-34,52) のすぐ上（大手の備は (-28,58) の二の丸の中に湧く）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KOZUKI_PLAN = {
  mon: 'kyogoku', name: '上月城', type: 'yamajiro', year: 1578, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 6,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -4, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-16, 24, -42, -14), gapAt: [[16, -42], [22, -42], [6, -42], [-4, -42], [-12, -42], [24, -26], [-16, -26], [0, -14], [12, -14], [-10, -14]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 14, -10, 14), gapAt: [[0, -10], [10, -10], [-10, -10], [14, 2], [-14, 2], [14, -4], [-14, -4], [0, 14]], gapW: 8 },   // 本丸の攻めが塀で延びた（act bot）→口を広く
  ],
  koguchi: [
    { id: 'ote', name: '大手の門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [16, -42], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[16, -54], [16, -42], [6, -24], [0, -14], [0, -10], [0, 2]] }],
  hori: [
    // 二の丸と本丸の間の堀切（口を空けて三つに）
    { kind: 'karabori', pts: [[-15, -12], [-13, -12]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[-7, -12], [-3, -12]], w: 3, deep: 2.5 },
    { kind: 'karabori', pts: [[3, -12], [7, -12]], w: 3, deep: 2.5 },
    // 大手の外の竪堀（門の脇）
    { kind: 'karabori', pts: [[26, -48], [26, -36]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[-18, -48], [-18, -34]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [21, -38], rot: 0 }, { id: 'ni', kind: 'monomi', at: [-12, -38], rot: 0 },
    { id: 'hon', kind: 'monomi', at: [10, 10], rot: 0 }, { id: 'hon2', kind: 'monomi', at: [-10, 10], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-2, 9], w: 11, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
