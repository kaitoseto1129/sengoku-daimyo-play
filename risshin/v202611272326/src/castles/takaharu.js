// 高原城（日向国諸県郡・伊東方の山城。今の宮崎県高原町）。K656 K655 11/26 クラウドさ：s12 のサムネに当てられる城を戦場に足す。
// 手本と出所：docs/journey/s12_takahara.md・『上井覚兼日記』A・高原町の解説（C）。曲輪の広さと並びは推定（南九州のシラス台地の城＝土塁・空堀・柵・切岸。石垣と天守は無い）。
// 戦の座標：城の中心 at=(0,-50)。局所の +z が寄せ手（島津）の来る側。段は三つ：本丸（奥）・二の曲輪・三の曲輪（麓の側）。
// 門は戦の段の道筋に合わせて置き、広く開ける（門の柱が本人と兵の立ち位置にかからないよう 8.4 歩。act bot が本丸の門で倒れた 11/26 の一回目の後）。（三の曲輪の門→二の曲輪の門→本丸の門が、沢から本丸の門へ登る筋に並ぶ）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const TAKAHARU_PLAN = {
  mon: 'ito', name: '高原城', type: 'yamajiro', year: 1576, lifeDense: 0.5, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 600, kind: 'hon', capacity: 50, fallbackTo: null, defenseValue: 1,
      poly: rect(-13, 13, -24, -6), gapAt: [[-2, -6]], gapW: 11 },
    { id: 'ni', name: '二の曲輪', level: -3, wall: 'saku', hp: 500, kind: 'ni', capacity: 60, fallbackTo: 'hon', defenseValue: 1,
      poly: rect(-24, 24, -6, 12), gapAt: [[-2, -6], [-3, 12]], gapW: 11 },
    { id: 'san', name: '三の曲輪', level: -6, wall: 'saku', hp: 400, kind: 'koshi', capacity: 60, fallbackTo: 'ni', defenseValue: 1,
      poly: rect(-32, 32, 12, 26), gapAt: [[-3, 12], [5, 26]], gapW: 11 },
  ],
  koguchi: [
    { id: 'san', name: '三の曲輪の門', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [5, 26], rot: 0, w: 8.4, role: 'ote', maxFlow: 5, fireResistance: 0.3 },
    { id: 'ni', name: '二の曲輪の門', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [-3, 12], rot: 0, w: 8.4, role: 'naka', maxFlow: 5, fireResistance: 0.3 },
    { id: 'hon', name: '本丸の門', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-2, -6], rot: 0, w: 8.4, role: 'hon', maxFlow: 5, fireResistance: 0.3 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[10, 46], [5, 26], [-3, 12], [-2, -6], [0, -14]] }],
  hori: [
    { kind: 'karabori', pts: [[-38, 31], [38, 31]], w: 4, deep: 2.2 },     // 三の曲輪の前の空堀（シラスの谷を切った堀・推）
    { kind: 'karabori', pts: [[-22, -30], [22, -30]], w: 5, deep: 3 },     // 本丸の背の堀切
  ],
  yagura: [{ id: 'hw', kind: 'monomi', at: [-9, -20], rot: 0 }, { id: 'he', kind: 'monomi', at: [9, -20], rot: 0 },
    { id: 'nw', kind: 'monomi', at: [-20, 8], rot: 0 }, { id: 'se', kind: 'monomi', at: [28, 22], rot: 0 }],
  lordSeat: { at: [2, -17], w: 10, d: 6, rot: 0 },
};
