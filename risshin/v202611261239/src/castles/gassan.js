// 月山富田城（出雲国能義郡・今の安来市広瀬町。尼子の本城）。K656 K655 毛利編 m12 第一次月山富田城・11/26 クラウドさ。
// 手本と出所：安来市の月山富田城跡の解説（C・国史跡）＝月山の頂に本丸・二の丸・三の丸が尾根に沿って一列に並び、間を堀切で切る。
//   山の中ほどに山中御殿、そこへ七曲りの道が上る。『陰徳太平記』（B）＝天文十二年に大内勢は塩谷口などから攻めたが落とせなかった。
//   docs/books/master_shiro.md（土の山城＝切岸・堀切・柵・冠木門・物見櫓）。石垣は後の堀尾の代の物なので置かない（天文の頃の土の城）。
//   曲輪の広さと並びは推定（尾根の向きは戦場に合わせて南北にした）。
// 戦の座標で at: { x: 0, z: -60 }（m12 の月山の頂）。+z が南＝大内勢の寄せる側。大手の門 (0,22)＝塩谷口の柵 (20,-12) の上の尾根の先。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const GASSAN_PLAN = {
  mon: 'kyogoku', name: '月山富田城', type: 'yamajiro', year: 1543, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 6,
  kuruwa: [
    { id: 'san', name: '三の丸', level: -5, wall: 'saku', hp: 520, kind: 'san', capacity: 70, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-13, 13, 6, 22), gapAt: [[0, 22], [-7, 22], [7, 22], [0, 6], [8, 6], [-8, 6], [13, 14], [-13, 14]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: -2, wall: 'saku', hp: 640, kind: 'ni', capacity: 70, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-12, 12, -12, 2), gapAt: [[0, 2], [8, 2], [-8, 2], [0, -12], [7, -12], [-7, -12], [12, -5], [-12, -5]], gapW: 6 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 90, fallbackTo: null, defenseValue: 1,
      poly: rect(-11, 11, -34, -16), gapAt: [[0, -16], [7, -16], [-7, -16], [11, -25], [-11, -25]], gapW: 7 },
  ],
  koguchi: [
    { id: 'ote', name: '大手の門', from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [0, 22], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[6, 40], [-4, 32], [0, 22], [0, 6], [0, 2], [0, -12], [0, -16], [0, -24]] }],   // 七曲りを短く折った大手の道
  hori: [
    // 三の丸と二の丸の間の堀切（口を空けて二つに）
    { kind: 'karabori', pts: [[-13, 4], [-4, 4]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[4, 4], [13, 4]], w: 3, deep: 2.5 },
    // 二の丸と本丸の間の堀切
    { kind: 'karabori', pts: [[-12, -14], [-4, -14]], w: 3, deep: 3 }, { kind: 'karabori', pts: [[4, -14], [12, -14]], w: 3, deep: 3 },
    // 大手の脇の竪堀（尾根の斜面を縦に切る）
    { kind: 'karabori', pts: [[16, 10], [18, 26]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[-16, 10], [-18, 26]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [8, 18], rot: 0 }, { id: 'ote2', kind: 'monomi', at: [-8, 18], rot: 0 },
    { id: 'ni', kind: 'monomi', at: [9, -9], rot: 0 }, { id: 'hon', kind: 'monomi', at: [8, -31], rot: 0 }, { id: 'hon2', kind: 'monomi', at: [-8, -31], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-1, -26], w: 12, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
