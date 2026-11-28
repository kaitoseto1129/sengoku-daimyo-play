// 安城城（三河国 碧海郡・安祥城とも。天文十八年〔1549〕は織田信広の城）。K656 K655 今川編 i05・11/28 クラウドさ。
// 手本と出所：『三河物語』B（雪斎が安城を攻め信広を生け捕り、竹千代と取り替えた）・安城市の安祥城跡の解説 C（碧海台地の南の端の舌のような台地に建ち、
//   まわりは深田と沼。本丸・二の丸・三の丸を空堀で区切った平山城）・docs/books/master_shiro.md（戦国の土の城＝土塁と空堀に柵・冠木門・物見櫓）。
//   石垣と白壁は後の代の物なので出さない。広さと並びは戦の広さに合わせた推定。
// 座標は i05 の城の台地 ANJO=(40,-10) を原点にした局所の値。今川の寄せは南西（-x・+z）から。
// 並び：南西に大手の冠木門のある三の丸・その北に本丸（信広の館）・本丸の東に二の丸と搦手の木戸。
//   戦の段の場所（門の前 (-6,8)・門の内 (-4,4)・本丸 (10,-12)・城門の信広 (4,-6)・搦手の木戸 (20,-20)・本丸の下の曲輪 (30,-10)）に曲輪を合わせた。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const ANJO_PLAN = {
  mon: 'oda', name: '安城城', type: 'yama', year: 1549, lifeDense: 0.6, lifeNoFlags: true,
  kuruwa: [
    { id: 'san', name: '三の丸', level: -1, wall: 'saku', hp: 500, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-16, 6, -4, 16), gapAt: [[-16, 8], [-6, 16], [1, -4], [6, 6]], gapW: 10 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 700, kind: 'hon', capacity: 60, fallbackTo: null, defenseValue: 1,
      poly: rect(-4, 18, -26, -4), gapAt: [[1, -4], [18, -18], [6, -26]], gapW: 10 },
    { id: 'ni', name: '二の丸', level: -1, wall: 'saku', hp: 500, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(18, 40, -32, -2), gapAt: [[18, -18], [40, -16], [28, -32], [28, -2]], gapW: 10 },
  ],
  koguchi: [
    { id: 'ote', name: '大手門', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [-16, 8], rot: Math.PI / 2, w: 8, role: 'ote', maxFlow: 8, fireResistance: .35 },
    { id: 'minami', name: '三の丸の南の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [-6, 16], rot: 0, w: 8, maxFlow: 7 },
    { id: 'hon', name: '本丸の口', from: 'san', to: 'hon', kind: 'hira', gate: 'kabuki', at: [1, -4], rot: 0, w: 10, maxFlow: 8 },
    { id: 'kara', name: '搦手の木戸', from: 'hon', to: 'ni', kind: 'hira', gate: 'kabuki', at: [18, -18], rot: Math.PI / 2, w: 10, maxFlow: 7 },
    { id: 'higashi', name: '二の丸の東の口', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [40, -16], rot: Math.PI / 2, w: 8, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-40, 14], [-16, 8], [-4, 4], [1, -4], [8, -12]] }],
  hori: [
    { kind: 'karabori', pts: [[-20, -6], [-20, 2]], w: 3.5, deep: 2.5 },     // 三の丸の西（大手の前は土橋で空ける）
    { kind: 'karabori', pts: [[-20, 14], [-20, 20], [-12, 20]], w: 3.5, deep: 2.5 }, // 三の丸の南西の角
    { kind: 'karabori', pts: [[-8, -30], [-8, -8]], w: 3.5, deep: 2.5 },     // 本丸の西
    { kind: 'karabori', pts: [[-4, -30], [2, -30]], w: 3, deep: 2 },          // 本丸の北（北の口の脇）
    { kind: 'karabori', pts: [[44, -30], [44, -20]], w: 3.5, deep: 2.5 },    // 二の丸の東（東の口の脇）
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [-12, 12], rot: 0 }, { id: 'hon', kind: 'monomi', at: [14, -22], rot: 0 }, { id: 'ni', kind: 'monomi', at: [36, -28], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [8, -18], w: 8, d: 4, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
