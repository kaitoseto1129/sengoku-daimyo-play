// 二俣城（遠江・天竜川と二俣川の落ち合いに突き出た丘の城。元亀三年に中根正照が守った）。手本と出所は docs/battle_refs/futamata.md（K656 K655 武田編 d06・11/25 クラウドさ）。
// 座標は城の中心（d06 の城山の頂 (0,-40)）を原点にした局所の値。-z が北＝天竜川の崖、+z が南＝大手と寄せ手の側。段の高さは頂からの差。
// 並び：北から 北曲輪（崖の上・水の手の井楼へ下りる）・本丸・二の丸・南曲輪（蔵屋敷）を尾根に一列。間は堀切。
// 元亀の頃の土の城（石垣と天守台は後の堀尾の代の物なので出さない）。寸法は戦の広さに合わせて縮めた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const FUTAMATA_PLAN = {
  mon: 'tokugawa', name: '二俣城', type: 'yama', year: 1572, lifeDense: 1.2, lifeNoFlags: true,
  gateSlope: 8,   // 口ごとに坂（切り通し）。段の差を崖にしない
  kuruwa: [
    { id: 'minami', name: '南曲輪', level: -8, wall: 'saku', hp: 480, kind: 'ni', capacity: 60, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-10, 12, 25, 35), gapAt: [[2, 35], [2, 25]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: -4, wall: 'saku', hp: 600, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-14, 14, 7, 22), gapAt: [[2, 22], [0, 7]], gapW: 6 },
    { id: 'kita', name: '北曲輪', level: -6, wall: 'saku', hp: 480, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-10, 10, -33, -21), gapAt: [[0, -21]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 12, -18, 4), gapAt: [[0, 4], [0, -18]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手', from: 'out', to: 'minami', kind: 'hira', gate: 'kabuki', at: [2, 35], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'ni_s', name: '二の丸の口', from: 'minami', to: 'ni', kind: 'hira', gate: 'kabuki', at: [2, 22], rot: 0, w: 5, maxFlow: 7 },
    { id: 'hon', name: '本丸の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, 4], rot: 0, w: 5, maxFlow: 7 },
    { id: 'kita', name: '北曲輪の口', from: 'hon', to: 'kita', kind: 'hira', gate: 'kabuki', at: [0, -18], rot: 0, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[2, 44], [2, 35], [2, 22], [0, 4], [0, -6]] }],
  hori: [
    { kind: 'horikiri', pts: [[-20, 5.5], [-4, 5.5]], w: 3, deep: 3.5 }, { kind: 'horikiri', pts: [[4, 5.5], [20, 5.5]], w: 3, deep: 3.5 },     // 本丸と二の丸の間
    { kind: 'horikiri', pts: [[-18, 23.5], [-2, 23.5]], w: 2.5, deep: 3 }, { kind: 'horikiri', pts: [[6, 23.5], [20, 23.5]], w: 2.5, deep: 3 },   // 二の丸と南曲輪の間
    { kind: 'horikiri', pts: [[-16, -19.5], [-4, -19.5]], w: 2.5, deep: 3 }, { kind: 'horikiri', pts: [[4, -19.5], [16, -19.5]], w: 2.5, deep: 3 }, // 本丸と北曲輪の間
    { kind: 'tatebori', pts: [[16, 14], [30, 18]], w: 2.2, deep: 2.5 }, { kind: 'tatebori', pts: [[-16, 14], [-30, 18]], w: 2.2, deep: 2.5 },
  ],
  yagura: [{ id: 'kita', kind: 'monomi', at: [6, -30], rot: 0 }, { id: 'ote', kind: 'monomi', at: [9, 32], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-3, -7], w: 9, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
