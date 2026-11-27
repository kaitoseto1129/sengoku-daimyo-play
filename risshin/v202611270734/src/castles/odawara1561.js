// 北条の小田原城（永禄四年〔1561〕上杉政虎の小田原攻めの頃）。手本と出所は docs/battle_refs/odawara1561.md（K563 上杉編 u04・11/21 クラウド35）。
// 北条の居館（今の天守の辺り）と、その後ろの八幡山の詰の城（八幡山古郭：東曲輪・本曲輪・西曲輪）。居館の前に蓮池。
// 北条の時は石垣の無い土の城（土塁と空堀）。石垣は後の大久保氏の改修。総構えは天正の頃なので置かない。
// 座標は u04 の戦の座標そのまま（at: { x: 0, z: 0 }）：蓮池門の前 (20,40)＝居館の南の口 (20,62) の外。寸法と段の高さは推定。
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const ODAWARA1561_PLAN = {
  mon: 'hojo', name: '小田原城', type: 'hira', year: 1561, lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'kyokan', name: '北条の居館（御本城）', level: 12, wall: 'dobei', hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(0, 48, 62, 100), gapAt: [[20, 62]], gapW: 6 },
    { id: 'kyokan_e', name: '居館の東の曲輪', level: 9, wall: 'saku', hp: 520, kind: 'ni', capacity: 80, fallbackTo: 'kyokan', defenseValue: .6,
      poly: rect(52, 84, 62, 96) },
    { id: 'higashi', name: '八幡山の東曲輪', level: 16, wall: 'saku', hp: 520, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-40, -6, 104, 130) },
    { id: 'hon', name: '八幡山の本曲輪', level: 20, wall: 'saku', hp: 700, kind: 'ni', capacity: 80, fallbackTo: null, defenseValue: .8,
      poly: rect(-80, -44, 112, 146) },
    { id: 'nishi', name: '八幡山の西曲輪', level: 15, wall: 'saku', hp: 480, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(-116, -84, 118, 144) },
  ],
  koguchi: [
    { id: 'hasuike', name: '蓮池門', from: 'out', to: 'kyokan', kind: 'hira', gate: 'kabuki', at: [20, 62], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .4 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -150], [-30, -80], [10, -20], [20, 40], [20, 62]] }],
  hori: [
    { kind: 'karabori', pts: [[-4, 57], [54, 57]], w: 6, deep: 2 },          // 蓮池（遠景では空堀）。門の前は道に掘り残さず橋の代わりに口の幅で切る
    { kind: 'karabori', pts: [[50, 60], [50, 98]], w: 3, deep: 2 },          // 居館と東の曲輪の間
    { kind: 'horikiri', pts: [[-42, 102], [-42, 148]], w: 4, deep: 3 },      // 八幡山の東曲輪と本曲輪の間
    { kind: 'horikiri', pts: [[-82, 110], [-82, 148]], w: 4, deep: 3 },      // 本曲輪と西曲輪の間
  ],
  yagura: [
    { id: 'kyokan_w', kind: 'monomi', at: [6, 94], rot: 0 },
    { id: 'kyokan_e', kind: 'monomi', at: [44, 68], rot: 0 },
    { id: 'hon', kind: 'monomi', at: [-62, 140], rot: 0 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [24, 84], w: 14, d: 8, rot: 0, door: 1, name: '北条の居館', where: '居館の奥' },
};
