// 蒲原城（駿河・標高138mの山城。北条氏信が守った）。手本と出所は docs/battle_refs/kanbara.md（K563 武田編 d04・11/21 クラウド35）。
// 座標は d04 の戦の座標そのまま（at: { x: 0, z: 0 }。+z が南西＝寄せ手と町の側）。段の高さは d04 の丘からの差（頂 28 前後・at の地面 17）。
// 頁の並び：山頂に本曲輪、北東に善福寺曲輪（大空堀）、南西へ二ノ曲輪・三ノ曲輪が段に下がる。大手の坂 (0,10)・本曲輪 (-2,-32) は戦の段の場所。
// 永禄十二年（1569）の頃は土塁・空堀・堀切の城（石垣なし）。寸法は推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KANBARA_PLAN = {
  mon: 'hojo', name: '蒲原城', type: 'yama', year: 1569, lifeDense: 1.2, lifeNoFlags: true,
  gateSlope: 8,   // 口ごとに坂（切り通し）。段の差を崖にしない（d02 箕輪の act で分かった）
  kuruwa: [
    { id: 'san', name: '三ノ曲輪', level: 1, wall: null,   // 柵なし（11/21：大手の坂の段の敵が柵の内に立ち、段が150秒の限りまで延びた）
      hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-22, 18, -8, 4), gapAt: [[0, 4], [-2, -8]], gapW: 10 },
    { id: 'ni', name: '二ノ曲輪', level: 7, wall: null,   // 柵なし（11/21 章の通しで味方が本曲輪へ寄れず本人が倒れた。口も 6→10 歩）
      hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-22, 14, -22, -12), gapAt: [[-2, -12], [-2, -22]], gapW: 10 },
    { id: 'hon', name: '本曲輪', level: 10.5, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-20, 16, -54, -26), gapAt: [[-2, -26]], gapW: 10 },
    { id: 'zen', name: '善福寺曲輪', level: 2.5, wall: 'saku', hp: 420, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(24, 44, -62, -40) },
  ],
  koguchi: [
    { id: 'ote', name: '大手の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [0, 4], rot: 0, w: 8, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'san_n', name: '三ノ曲輪の北の口', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [-2, -8], rot: 0, w: 8, maxFlow: 9 },
    { id: 'ni_s', name: '二ノ曲輪の口', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [-2, -12], rot: 0, w: 8, maxFlow: 9 },
    { id: 'ni_n', name: '二ノ曲輪の北の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-2, -22], rot: 0, w: 8, maxFlow: 9 },
    { id: 'hon', name: '本曲輪の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-2, -26], rot: 0, w: 8, maxFlow: 9 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 10], [0, 4], [-2, -8], [-2, -12], [-2, -22], [-2, -26], [-2, -32]] }],
  hori: [
    { kind: 'karabori', pts: [[20, -66], [20, -36]], w: 4, deep: 4 },   // 善福寺曲輪の前の大空堀
    { kind: 'horikiri', pts: [[-28, -24], [-6, -24]], w: 3, deep: 3 }, { kind: 'horikiri', pts: [[2, -24], [18, -24]], w: 3, deep: 3 },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [10, -48], rot: 0 }, { id: 'ote', kind: 'monomi', at: [12, -2], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-12, -46], w: 9, d: 5, rot: 0, door: 1, name: '本曲輪の館', where: '本曲輪の館の奥' },
};
