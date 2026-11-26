// 丸根砦・鷲津砦（尾張国・大高城を囲む織田の付城。永禄三年〔1560〕五月十九日の朝に今川の先手が落とした）。K656 K655 今川編 i09・11/26 クラウドさ。
// 手本と出所：『信長公記』A（佐久間盛重が丸根、織田秀敏・飯尾定宗が鷲津）・docs/books/master_shiro.md（陣城・付城＝空堀と掻き上げの土塁に柵、冠木門、兵の小屋）・
//   docs/books/chikei_ritchi_sengoku_shiro.md 第10項（信長は鷲津・丸根などの砦で大高城を囲んだ）。今の名古屋市緑区の丸根砦跡・鷲津砦跡は低い丘の上の小さな砦。
// 座標はそれぞれの砦の中心（MARU=(0,0)・WASHI=(170,-70)）を原点にした局所の値。寄せ手（今川）は南西（-x・+z）から来る。広さと並びは推定。
// 戦の段の場所に合わせる：丸根は (-8,8)(-4,4) が本丸の内・(20,-20) が二の曲輪・(-30,20) が堀の前。鷲津は (160,-62)＝局所 (-10,8) が本丸の内。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const MARUNE_PLAN = {
  mon: 'oda', name: '丸根砦', type: 'yamajiro', year: 1560, lifeDense: 0.4, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 500, kind: 'hon', capacity: 40, fallbackTo: null, defenseValue: 1,
      poly: rect(-13, 12, -12, 12), gapAt: [[-13, 6], [12, -6]], gapW: 5 },
    { id: 'ni', name: '二の曲輪', level: -2, wall: 'saku', hp: 350, kind: 'ni', capacity: 30, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(15, 31, -31, -11), gapAt: [[15, -18], [31, -26]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '丸根の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-13, 6], rot: Math.PI / 2, w: 5, role: 'ote', maxFlow: 6, fireResistance: .3 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-34, 26], [-13, 6], [-4, 2]] }],
  hori: [
    { kind: 'karabori', pts: [[-19, -18], [-19, 0]], w: 3.5, deep: 2.5 },   // 西の空堀（門の前は空ける）
    { kind: 'karabori', pts: [[-4, 18], [14, 18]], w: 3.5, deep: 2.5 },     // 南の空堀
    { kind: 'karabori', pts: [[0, -18], [12, -18]], w: 3, deep: 2 },        // 北の空堀（二の曲輪との間）
  ],
  yagura: [{ id: 'mon', kind: 'monomi', at: [-9, 1], rot: 0 }, { id: 'ni', kind: 'monomi', at: [27, -15], rot: 0 }],
};
export const WASHIZU_PLAN = {
  mon: 'oda', name: '鷲津砦', type: 'yamajiro', year: 1560, lifeDense: 0.4, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 500, kind: 'hon', capacity: 40, fallbackTo: null, defenseValue: 1,
      poly: rect(-16, 13, -13, 14), gapAt: [[-16, 6], [13, 4], [-2, -13]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '鷲津の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-16, 6], rot: Math.PI / 2, w: 5, role: 'ote', maxFlow: 6, fireResistance: .3 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-40, 20], [-16, 6], [-6, 6]] }],
  hori: [
    { kind: 'karabori', pts: [[-22, -16], [-22, 0]], w: 3.5, deep: 2.5 },
    { kind: 'karabori', pts: [[-12, 20], [12, 20]], w: 3.5, deep: 2.5 },
  ],
  yagura: [{ id: 'mon', kind: 'monomi', at: [-12, -2], rot: 0 }, { id: 'kita', kind: 'monomi', at: [9, -9], rot: 0 }],
};
