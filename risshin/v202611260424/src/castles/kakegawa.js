// 掛川城（遠江・龍頭山の城。永禄十二年〔1569〕に朝比奈泰朝が今川氏真を迎えて籠り、徳川家康の囲みを五か月しのいだ）。K656 K655 今川編 i15・11/26 クラウドさ。
// 手本と出所：掛川市の掛川城の解説（C）・『三河物語』B。今川の代の掛川城は朝比奈泰熙が築いた土の城で、石垣と天守は後の山内一豊の代の物なので出さない。
// 座標は i15 の城山の頂 KAKE=(-85,52) を原点にした局所の値。+x が東南＝大手と徳川の寄せの側（GATE=(-30,22) は局所 (55,-30)）。
// 並び：西の頂に本丸（氏真の館）・東に一段低い二の丸・その外に空堀と大手門。本丸と二の丸の間は堀切。寸法は戦の広さに合わせた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KAKEGAWA_PLAN = {
  mon: 'imagawa', name: '掛川城', type: 'yama', year: 1569, lifeDense: 1.0, lifeNoFlags: true,
  gateSlope: 7,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-26, -7, -4, 20), gapAt: [[-7, 3]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: -3, wall: 'saku', hp: 650, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-3, 12, -10, 16), gapAt: [[-3, 3], [12, -5]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: '大手門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [12, -5], rot: Math.PI / 2, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'hon', name: '本丸の口', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-7, 3], rot: Math.PI / 2, w: 5, maxFlow: 7 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[22, -10], [12, -5], [-3, 3], [-7, 3], [-14, 6]] }],
  hori: [
    { kind: 'horikiri', pts: [[-5, -12], [-5, 0]], w: 2.5, deep: 3 }, { kind: 'horikiri', pts: [[-5, 6], [-5, 22]], w: 2.5, deep: 3 },   // 本丸と二の丸の間
    { kind: 'karabori', pts: [[16, -16], [16, -8]], w: 3.5, deep: 3 }, { kind: 'karabori', pts: [[16, -2], [16, 20]], w: 3.5, deep: 3 },  // 二の丸の外（大手の前）
    { kind: 'karabori', pts: [[16, 20], [-4, 20]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [9, -8], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-22, 0], rot: 0 }, { id: 'ni', kind: 'monomi', at: [9, 13], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-19, 16], w: 9, d: 4, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
