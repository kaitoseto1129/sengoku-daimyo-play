// 長篠城（三河・寒狭川と宇連川〔大野川〕の合わさる崖の上）。手本と出所は docs/battle_refs/nagashino.md（K563 武田編 d10・11/21 クラウド35）。
// 南の崖の先に本丸、本丸の東に野牛郭（宇連川の側）、北に二の丸、北西に瓢郭。北だけが平らで、寄せ手は北から来る。
// 天正三年（1575）武田勝頼の寄せは瓢郭と野牛郭へ（金掘りで塀を崩した）。土塁と空堀の土の城、塀は板塀と柵。
// 座標は d10 の戦の座標そのまま（at: { x: 0, z: 0 }）：本丸の前 (0,-40)＝二の丸の中・瓢郭の塀 (-46,30)＝瓢郭の北の口の外・野牛郭の口 (50,26)＝野牛郭の北の口の外。
// 寸法・段の高さは推定。二の丸は柵を立てず堀と段だけ（本人と寄せ手が通る広場）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const NAGASHINO_PLAN = {
  mon: 'tokugawa', name: '長篠城', type: 'hira', year: 1575, lifeDense: 1.4, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 9, wall: 'dobei', hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(-22, 22, -92, -54), gapAt: [[0, -54], [22, -74]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: 6, wall: null, hp: 600, kind: 'ni', capacity: 120, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-30, 30, -50, -6) },
    { id: 'hyotan', name: '瓢郭', level: 2, wall: 'saku', hp: 520, kind: 'koshi', capacity: 60, fallbackTo: 'ni', defenseValue: .55,
      poly: rect(-76, -36, -32, 22), gapAt: [[-46, 22], [-36, -20]], gapW: 5 },
    { id: 'yagyu', name: '野牛郭', level: 4, wall: 'saku', hp: 520, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .55,
      poly: rect(36, 76, -84, 18), gapAt: [[50, 18], [36, -74]], gapW: 5 },
  ],
  koguchi: [
    { id: 'hon_gate', name: '本丸の門', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, -54], rot: 0, w: 4.6, maxFlow: 6, fireResistance: .5 },
    { id: 'hyotan_gate', name: '瓢郭の口', from: 'out', to: 'hyotan', kind: 'hira', gate: 'kabuki', at: [-46, 22], rot: 0, w: 4.6, role: 'ote', maxFlow: 6, fireResistance: .35 },
    { id: 'yagyu_gate', name: '野牛郭の口', from: 'out', to: 'yagyu', kind: 'hira', gate: 'kabuki', at: [50, 18], rot: 0, w: 4.6, maxFlow: 6, fireResistance: .35 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: [[0, 150], [6, 82], [0, 20], [0, -6], [0, -40], [0, -54], [0, -70]] },
    { id: 'hyotan', kind: 'koshi', pts: [[-46, 30], [-46, 22], [-46, 0], [-36, -20], [-30, -24]] },
    { id: 'yagyu', kind: 'koshi', pts: [[50, 26], [50, 18], [50, -40], [36, -74], [22, -74]] },
  ],
  hori: [
    { kind: 'karabori', pts: [[-30, -52], [30, -52]], w: 4, deep: 3 },     // 二の丸と本丸の間
    { kind: 'karabori', pts: [[-32, -32], [-32, 22]], w: 4, deep: 2.5 },   // 瓢郭の東の堀
    { kind: 'karabori', pts: [[32, -84], [32, 18]], w: 4, deep: 2.5 },     // 野牛郭の西の堀
    { kind: 'karabori', pts: [[-30, -2], [-14, -2]], w: 4, deep: 2 },      // 二の丸の北の堀（中は道に掘り残す）
    { kind: 'karabori', pts: [[14, -2], [30, -2]], w: 4, deep: 2 },
  ],
  yagura: [
    { id: 'hon', kind: 'monomi', at: [16, -62], rot: 0 },
    { id: 'hyotan', kind: 'monomi', at: [-70, 14], rot: 0 },
    { id: 'yagyu', kind: 'monomi', at: [70, 10], rot: 0 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [0, -76], w: 12, d: 7, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
