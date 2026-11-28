// 田原城（三河国・渥美の田原。天文十六年〔1547〕は戸田康光の城。別名 巨海城・臥龍城）。K656 K655 今川編 i03・11/28 クラウドさ。
// 手本と出所：『三河物語』B（戸田が竹千代を奪い織田へ渡した・義元が田原を攻めた）・田原市の田原城跡の解説 C（田原湾に突き出た丘に建ち、三方を海に囲まれた城）・
//   docs/books/master_shiro.md（戦国の土の城＝土塁と空堀に柵・冠木門・物見櫓）。石垣と白壁は後の代の物なので出さない。広さと並びは戦の広さに合わせた推定。
// 座標は i03 の城の丘 TAHA=(45,-15) を原点にした局所の値。今川の寄せは南西（-x・+z）から、海（浜の舟）は東と南。
// 並び：南西に大手の冠木門のある三の丸・その北東に本丸（戸田の館）・本丸の北に二の丸と物見櫓。本丸の東に浜へ下りる搦手の口。
//   11/28 act bot：大手を南に置くと、西から来る本人が三の丸の西の柵の外で詰まった（門の段を百二十秒越せず）→大手を西の正面へ移し、口を八歩に。段から段へまっすぐ歩く線（門の内→本丸→町口・浜の道→二の丸）が柵に当たらないよう、
//   三の丸と本丸の間の口を十歩に広げ、三の丸の北にも口を開けた（二回目の act bot で三の丸の北の柵の外に詰まった）。
//   戦の段の場所（門の前 (-6,8)・門の内 (-2,2)・本丸 (14,-18)・二の丸の櫓の下 (20,-30)）に曲輪を合わせた。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const TAHARA_PLAN = {
  mon: 'oda', name: '田原城', type: 'yama', year: 1547, lifeDense: 0.6, lifeNoFlags: true,
  kuruwa: [
    { id: 'san', name: '三の丸', level: -1, wall: 'saku', hp: 500, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-14, 10, -12, 13), gapAt: [[-14, 6], [-6, 13], [10, -11], [5, -12]], gapW: 10 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 700, kind: 'hon', capacity: 60, fallbackTo: null, defenseValue: 1,
      poly: rect(10, 30, -26, -2), gapAt: [[10, -11], [30, -14], [20, -26]], gapW: 10 },
    { id: 'ni', name: '二の丸', level: -1, wall: 'saku', hp: 500, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(12, 38, -50, -26), gapAt: [[20, -26], [38, -40]], gapW: 8 },
  ],
  koguchi: [
    // 大手は陸続きの西（城下の道から来る今川の寄せの真正面）。南の口は浜の道へ下りる脇の口
    { id: 'ote', name: '大手門', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [-14, 6], rot: Math.PI / 2, w: 8, role: 'ote', maxFlow: 8, fireResistance: .35 },
    { id: 'hama', name: '浜の口', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [-6, 13], rot: 0, w: 8, maxFlow: 7 },
    { id: 'hon', name: '本丸の口', from: 'san', to: 'hon', kind: 'hira', gate: 'kabuki', at: [10, -11], rot: Math.PI / 2, w: 10, maxFlow: 8 },
    { id: 'kita', name: '三の丸の北の口', from: 'san', to: 'out', kind: 'hira', gate: 'kabuki', at: [5, -12], rot: 0, w: 10, maxFlow: 7 },
    { id: 'kara', name: '搦手（浜の口）', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [30, -14], rot: Math.PI / 2, w: 8, maxFlow: 6 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-34, 12], [-14, 6], [0, 0], [10, -11], [18, -14]] }],
  hori: [
    { kind: 'karabori', pts: [[-18, -14], [-18, 0]], w: 3.5, deep: 2.5 },    // 三の丸の西（陸続きの側・大手の前は土橋で空ける）
    { kind: 'karabori', pts: [[-16, -16], [6, -16]], w: 3.5, deep: 2.5 },    // 三の丸の北
    { kind: 'karabori', pts: [[4, 17], [-1, 17]], w: 3, deep: 2 },           // 大手の脇（門の前の道は空ける）
    { kind: 'karabori', pts: [[8, -54], [8, -30]], w: 3.5, deep: 2.5 },      // 二の丸の西
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [-10, 11], rot: 0 }, { id: 'ni', kind: 'monomi', at: [34, -46], rot: 0 }, { id: 'hon', kind: 'monomi', at: [26, -22], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [21, -8], w: 8, d: 4, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
