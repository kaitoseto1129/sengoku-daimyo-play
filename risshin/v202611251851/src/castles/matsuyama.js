// 武蔵松山城（比企郡・市野川の南の岸の丘の北の端に本曲輪を置く平山城。上杉方の上杉憲勝が守る）。K656 K657② 11/25 クラウドせ。
// 手本と出所：docs/journey/h12_matsuyama.md・吉見町の解説と県指定史跡の案内（C）。市野川に臨む北の崖の端に本曲輪、
//   その脇に二の曲輪、西に春日丸（三の曲輪）を置き、曲輪の間は堀切と空堀で切る（兵糧丸は略）。曲輪の広さと並びは推定。
// 戦の座標のまま（at: { x: 0, z: 0 }・+z が南＝北条・武田の寄せる側・-z の川＝市野川）。本曲輪の門 (0,-28)＝h12 の HON (0,-20) の8歩先。
// 遊ぶ道（SOTO (6,80)→金掘の穴 ANA (-30,40)→HON→SOTO→追い (50,110)）には塀を置かない：塀で道を切ると、軽い型の兵は口を回り込めず
//   段で詰まって act bot が倒れた（三の曲輪を南に置いた初めの形・11/25 クラウドせ）。永禄六年（1563）の頃は土塁・空堀・堀切・柵の城（天守・石垣は置かない）。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const MATSUYAMA_PLAN = {
  mon: 'uesugi', name: '武蔵松山城', type: 'hirayama', year: 1563, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 8,
  kuruwa: [
    { id: 'kasuga', name: '春日丸', level: -4, wall: 'saku', hp: 460, kind: 'san', capacity: 60, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(-60, -32, -24, 14), gapAt: [[-32, -10]], gapW: 6 },
    { id: 'ni', name: '二の曲輪', level: -2, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(24, 52, -50, -18), gapAt: [[24, -40]], gapW: 6 },
    { id: 'hon', name: '本曲輪', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-16, 18, -58, -28), gapAt: [[0, -28], [18, -40], [-16, -40]], gapW: 6 },
  ],
  koguchi: [
    { id: 'ote', name: '本曲輪の門', from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, -28], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -20], [0, -28], [0, -42]] }],
  hori: [
    // 本曲輪と二の曲輪の間の堀切（深い・真ん中は土橋）・本曲輪と春日丸の間の空堀
    { kind: 'horikiri', pts: [[21, -56], [21, -43]], w: 4, deep: 4 }, { kind: 'horikiri', pts: [[21, -37], [21, -20]], w: 4, deep: 4 },
    { kind: 'karabori', pts: [[-24, -56], [-24, -43]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[-24, -37], [-24, -26]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'ote', kind: 'monomi', at: [12, -32], rot: 0 }, { id: 'kasuga', kind: 'monomi', at: [-54, 8], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [6, -50], w: 10, d: 5, rot: 0, door: 1, name: '本曲輪の館', where: '本曲輪の館の奥' },
};
