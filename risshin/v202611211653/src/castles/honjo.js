// 本庄城（越後・臥牛山。のちの村上城）。手本と出所は docs/battle_refs/honjo.md（K563 上杉編 u09・11/21 クラウド35）。
// 永禄十一年（1568）本庄繁長の乱の頃は、臥牛山（標高135m）の頂の木柵で守る中世の山城。石垣は後の村上・堀氏の近世の改修なので置かない。
// 曲輪の名と並びは推定（頁に本庄期の曲輪の記述は無い）：麓の大手の曲輪から二の丸・頂の本丸、東の尾根に出丸。
// 座標は u09 の戦の座標そのまま（at: { x: 0, z: 0 }）：大手口 (6,62)＝大手の曲輪の南の口。段の高さは u09 の丘の高さに合わせた。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const HONJO_PLAN = {
  mon: 'honjo', name: '本庄城', type: 'yama', year: 1568, lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '大手の曲輪', level: 18, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-14, 26, 64, 84), gapAt: [[6, 64], [6, 84]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: 25, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-20, 30, 88, 110), gapAt: [[6, 88], [4, 110]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 28, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 22, 114, 138), gapAt: [[4, 114]], gapW: 5 },
    { id: 'demaru', name: '出丸', level: 17, wall: 'saku', hp: 420, kind: 'koshi', capacity: 40, fallbackTo: 'ni', defenseValue: .45,
      poly: rect(34, 56, 96, 118) },
  ],
  koguchi: [
    { id: 'ote', name: '大手口', from: 'out', to: 'ote', kind: 'hira', gate: 'kabuki', at: [6, 64], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[6, 62], [6, 64], [6, 84], [6, 88], [4, 110], [4, 114], [4, 126]] }],
  hori: [
    { kind: 'horikiri', pts: [[-22, 86], [-4, 86]], w: 3, deep: 3 }, { kind: 'horikiri', pts: [[14, 86], [32, 86]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-24, 96], [-40, 100]], w: 3, deep: 3 },
    { kind: 'karabori', pts: [[32, 94], [32, 120]], w: 3, deep: 2.5 },
  ],
  yagura: [{ id: 'hon', kind: 'monomi', at: [16, 132], rot: 0 }, { id: 'ote', kind: 'monomi', at: [20, 70], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [2, 126], w: 11, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
