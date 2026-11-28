// 大高城（尾張国・知多郡大高。永禄三年〔1560〕は今川方の鵜殿長照が守り、織田の丸根・鷲津の砦に囲まれた）。K656 K655 今川編 i08・11/26 クラウドさ。
// 手本と出所：『三河物語』B・『松平記』B（元康の兵糧入れ）・docs/books/master_shiro.md（平山城＝土塁と空堀に柵、冠木門、櫓）・
//   今の名古屋市緑区の大高城跡（国の史跡）は丘の上に本丸と二の丸が並び、空堀が残る。広さと並びは戦の広さに合わせた推定。
// 座標は i08 の城の丘の頂 OTAKA=(100,-20) を原点にした局所の値。米俵の列は南西（-x・+z）から来る。門の前の段は局所 (-16,14)・(-24,22)。
// 並び：東の頂に本丸（鵜殿の館）・西に一段低い二の丸・二の丸の南に大手の冠木門。北と東の外に空堀。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const OTAKA_PLAN = {
  mon: 'imagawa', name: '大高城', type: 'yama', year: 1560, lifeDense: 0.6, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 700, kind: 'hon', capacity: 60, fallbackTo: null, defenseValue: 1,
      poly: rect(-3, 16, -14, 8), gapAt: [[-3, -2]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: -2, wall: 'saku', hp: 500, kind: 'ni', capacity: 50, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-22, -6, -12, 6), gapAt: [[-12, 6], [-6, -2]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '大手門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [-12, 6], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'hon', name: '本丸の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-3, -2], rot: Math.PI / 2, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[-18, 16], [-12, 6], [-9, -2], [-3, -2], [4, -2]] }],
  hori: [
    { kind: 'karabori', pts: [[-26, -14], [-26, 6]], w: 3.5, deep: 2.5 },   // 二の丸の西
    { kind: 'karabori', pts: [[-20, -17], [16, -17]], w: 3.5, deep: 2.5 },  // 北（鷲津の側）
    { kind: 'karabori', pts: [[20, -14], [20, 8]], w: 3.5, deep: 2.5 },     // 東
    { kind: 'karabori', pts: [[-1, 12], [16, 12]], w: 3, deep: 2 },         // 本丸の南（大手の道は空ける）
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [-19, 3], rot: 0 }, { id: 'hon', kind: 'monomi', at: [12, -10], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [8, 3], w: 8, d: 4, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
