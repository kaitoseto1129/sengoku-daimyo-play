// 寺部城（三河国加茂郡・鈴木氏の小さな山城。豊田市の遺構は土塁と空堀）。K656 11/25 い：i07 のサムネに当てられる城を戦場に足す。
// 手本と出所：docs/journey/i07_terabe.md・『三河物語』B・豊田市の解説（C）。曲輪の広さと並びは推定。戦の座標のまま（TERA=(40,-10) が城の中心）。
// 小さな城：本丸一つ＋東の腰曲輪。門は元康の来る西南（寄せ手の先手の側）。土塁と空堀・木の柵・物見櫓。石垣と天守は無い（小さな国人の城）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const TERABE_PLAN = {
  mon: 'oda', name: '寺部城', type: 'yamajiro', year: 1558, lifeDense: 0.5, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 600, kind: 'hon', capacity: 50, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 14, -12, 12), gapAt: [[-14, 4]], gapW: 5 },
  ],
  koguchi: [
    { id: 'nishi', name: '西の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-14, 4], rot: Math.PI / 2, w: 4, role: 'ote', maxFlow: 5, fireResistance: 0.3 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-34, 10], [-14, 4], [-2, 2]] }],
  hori: [
    { kind: 'karabori', pts: [[-20, -16], [-20, 18]], w: 4, deep: 2.5 }, { kind: 'karabori', pts: [[-20, 18], [18, 18]], w: 4, deep: 2.5 },
  ],
  yagura: [{ id: 'mon', kind: 'monomi', at: [-10, 8], rot: 0 }, { id: 'kita', kind: 'monomi', at: [10, -9], rot: 0 }],
};
