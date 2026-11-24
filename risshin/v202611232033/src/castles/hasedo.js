// 長谷堂城（出羽・長谷堂城山の山城。最上の山形城の前の守り）。手本と出所は docs/battle_refs/hasedo.md（K563 上杉編 u15・11/21 クラウド35）。
// 局所の座標（原点＝u15 の丘の頂の近く (-34,20)。-z が南＝麓の田と寄せ手の側）。頂に本丸、南へ二の丸、その下に帯曲輪。
// 慶長五年（1600）の頃は土塁・柵・空堀・堀切の山城（石垣なし）。段の高さは u15 の丘に合わせた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const HASEDO_PLAN = {
  mon: 'ichimonji', name: '長谷堂城', type: 'yama', year: 1582,   // 本当は1600。石垣の無い土の城の作り（板塀・板葺き・塀を一つの束に）は year ≤ 1582 で選ばれるので1582と書く
  lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'obi', name: '帯曲輪', level: -6, wall: 'saku', hp: 420, kind: 'koshi', capacity: 40, fallbackTo: 'ni', defenseValue: .45,
      poly: rect(-14, 14, -28, -18), gapAt: [[0, -28], [0, -18]], gapW: 4 },
    { id: 'ni', name: '二の丸', level: -2.5, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-16, 16, -14, -2), gapAt: [[0, -14], [0, -2]], gapW: 4 },
    { id: 'hon', name: '本丸', level: 1, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 12, 2, 18), gapAt: [[0, 2]], gapW: 4 },
  ],
  koguchi: [
    { id: 'ote', name: '大手口', from: 'out', to: 'obi', kind: 'hira', gate: 'kabuki', at: [0, -28], rot: 0, w: 4, role: 'ote', maxFlow: 6, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -34], [0, -28], [0, -18], [0, -14], [0, -2], [0, 2], [0, 10]] }],
  hori: [
    { kind: 'horikiri', pts: [[-12, 22], [12, 22]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-18, -8], [-30, -12]], w: 2.5, deep: 2.5 }, { kind: 'tatebori', pts: [[18, -8], [30, -12]], w: 2.5, deep: 2.5 },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [8, 14], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-2, 10], w: 10, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
