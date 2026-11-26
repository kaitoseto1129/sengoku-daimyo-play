// 野田城（三河・豊川の東の段丘の端の小さな城。元亀四年に菅沼定盈が守った）。手本と出所は docs/battle_refs/noda.md（K656 K655 武田編 d08・11/26 クラウドさ）。
// 座標は城の中心（d08 の城の丘 (10,70)）を原点にした局所の値。-z が南＝武田の囲みの陣と大手の側、+z が北。段の高さは丘の頂からの差。
// 並び：南から 三の丸・二の丸・本丸を一列に並べた連郭（間は堀切）。両脇は崖と沼（桑淵・竜淵）なので竪堀で切る。
// 元亀の頃の土の城（柵と土塁・堀切だけ。石垣は出さない）。寸法は戦の広さに合わせて縮めた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const NODA_PLAN = {
  mon: 'tokugawa', name: '野田城', type: 'yama', year: 1573, lifeDense: 1.2, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'san', name: '三の丸', level: -7, wall: 'saku', hp: 480, kind: 'ni', capacity: 60, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-12, 12, -16, -4), gapAt: [[0, -16], [0, -4]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: -3.5, wall: 'saku', hp: 600, kind: 'ni', capacity: 70, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-11, 11, -1, 10), gapAt: [[0, -1], [0, 10]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 90, fallbackTo: null, defenseValue: 1,
      poly: rect(-10, 10, 13, 26), gapAt: [[0, 13]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '大手', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [0, -16], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'ni_s', name: '二の丸の口', from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, -4], rot: 0, w: 5, maxFlow: 7 },
    { id: 'hon', name: '本丸の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, 13], rot: 0, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -26], [0, -16], [0, -4], [0, 13], [0, 20]] }],
  hori: [
    { kind: 'horikiri', pts: [[-18, -2.5], [-4, -2.5]], w: 3, deep: 3.5 }, { kind: 'horikiri', pts: [[4, -2.5], [18, -2.5]], w: 3, deep: 3.5 },    // 三の丸と二の丸の間
    { kind: 'horikiri', pts: [[-16, 11.5], [-4, 11.5]], w: 3, deep: 3.5 }, { kind: 'horikiri', pts: [[4, 11.5], [16, 11.5]], w: 3, deep: 3.5 },     // 二の丸と本丸の間
    { kind: 'horikiri', pts: [[-14, 28], [14, 28]], w: 2.5, deep: 3 },                                                                            // 本丸の北の背
    { kind: 'tatebori', pts: [[13, -10], [26, -14]], w: 2.2, deep: 2.5 }, { kind: 'tatebori', pts: [[-13, -10], [-26, -14]], w: 2.2, deep: 2.5 },  // 両脇の崖（桑淵・竜淵）へ
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [8, -13], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-6, 23], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [3, 19], w: 8, d: 5, rot: 0, door: -1, name: '本丸の館', where: '本丸の館の奥' },
};
