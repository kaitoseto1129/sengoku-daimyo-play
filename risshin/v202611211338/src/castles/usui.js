// 臼井城（下総・印旛沼の南の台地の城）。手本と出所は docs/battle_refs/usui.md（K563 上杉編 u08・11/21 クラウド35）。
// 局所の座標（原点＝u08 の丘の頂の北 (0,-72)。外の木戸は戦の座標で (0,-24)＝木戸の段の敵の出所 (0,-10)〜(-24,-18) の外。+z が南＝寄せ手の側）。沼に臨む北の端に実城、南へ二の丸、外の木戸の小さな曲輪。
// 永禄九年（1566）の頃は土塁と柵・空堀の中世の城（石垣なし）。段の高さは u08 の丘に合わせた推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const USUI_PLAN = {
  mon: 'hojo', name: '臼井城', type: 'hirayama', year: 1566, lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'kido', name: '外の木戸の曲輪', level: -3, wall: 'saku', hp: 420, kind: 'san', capacity: 40, fallbackTo: 'ni', defenseValue: .45,
      poly: rect(-14, 14, 34, 48), gapAt: [[0, 48], [0, 34]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: 0, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-26, 26, 14, 32), gapAt: [[0, 32], [0, 14]], gapW: 5 },
    { id: 'hon', name: '実城', level: 1.5, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-20, 20, -16, 10), gapAt: [[0, 10]], gapW: 5 },
  ],
  koguchi: [
    { id: 'kido', name: '外の木戸', from: 'out', to: 'kido', kind: 'hira', gate: 'kabuki', at: [0, 48], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 52], [0, 48], [0, 34], [0, 32], [0, 14], [0, 10], [0, 0]] }],
  hori: [
    { kind: 'karabori', pts: [[-30, 12], [-4, 12]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[4, 12], [30, 12]], w: 3, deep: 2.5 },
    { kind: 'karabori', pts: [[-28, 33], [-16, 33]], w: 2.5, deep: 2 }, { kind: 'karabori', pts: [[16, 33], [28, 33]], w: 2.5, deep: 2 },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [14, -10], rot: 0 }, { id: 'kido', kind: 'monomi', at: [10, 38], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-2, -4], w: 11, d: 6, rot: 0, door: 1, name: '実城の館', where: '実城の館の奥' },
};
