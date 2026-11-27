// 水俣城（肥後国葦北郡水俣・相良義陽の城。水俣市の古城跡）。K656 K655 11/26 クラウドし。
// 手本と出所：docs/journey/s14_minamata.md・水俣市の古城跡の解説（C）。海を西に見る丘の上の土の城（天守・石垣は置かない）。
//   丘の頂に本丸、海側の寄せ手へ向く北の段に二の丸、その間を空堀で切る。曲輪の広さと並びは推定（同じ頃の九州の土の城の型に倣う）。
// 戦の座標で at: { x: 0, z: -82 }・+z が島津の寄せる側。大手の門 (0,26)＝s14 の「水俣城の門」(0,-56)。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const MINAMATA_PLAN = {
  mon: 'sagara', name: '水俣城', type: 'yamajiro', year: 1581, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 6,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -3, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-22, 22, 8, 26), gapAt: [[0, 26], [-12, 26], [12, 26], [0, 8], [-14, 8], [14, 8], [-22, 17]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-18, 18, -26, 4), gapAt: [[0, 4], [-14, 4], [14, 4], [0, -26], [18, -14], [-18, -14]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, 26], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 40], [0, 26], [0, 8], [0, 4], [0, -10]] }],
  hori: [
    // 二の丸と本丸の間の空堀（門の口を空けて二つに）・大手の外の空堀
    { kind: 'karabori', pts: [[-10.5, 6], [-3.5, 6]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[3.5, 6], [10.5, 6]], w: 3, deep: 2.5 },   // 11/26：-14・14 にも口（act bot が二の丸の南の塀で止まった）
    { kind: 'karabori', pts: [[-28, 29.5], [-17, 29.5]], w: 3.5, deep: 2.5 }, { kind: 'karabori', pts: [[17, 29.5], [28, 29.5]], w: 3.5, deep: 2.5 },   // 11/26：大手の脇の -12・12 にも口（act bot が北の塀で止まった）
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [12, 22], rot: 0 }, { id: 'umi', kind: 'monomi', at: [-14, -20], rot: 0 }, { id: 'hon', kind: 'monomi', at: [14, -2], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-4, -16], w: 11, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
