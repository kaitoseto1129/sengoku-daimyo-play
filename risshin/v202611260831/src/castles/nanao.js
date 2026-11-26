// 七尾城（能登・城山）。手本と出所は docs/battle_refs/nanao.md（K563 上杉編 u11・11/21 クラウド35）。
// 尾根を東西に置き、東の頂に本丸。西へ下りて桜馬場・温井屋敷・二の丸・西の丸、北（-z）の麓から大手。三の丸は南の尾根。
// 本丸と重臣の屋敷の段は野面積みの石垣（本丸・桜馬場は五段）。並び順と寸法・段の高さは推定（平面は実長の約0.5倍）。
export const OTE = { x: -66, z: -12, name: '大手口' };
export const KARAMETE = { x: 55, z: 10, name: '搦手口' };
export const ROAD_OTE = [[-70, -80], [-74, -50], [-62, -30], [-66, -12], [-66, -2], [-48, -2], [-31, -2], [-16, 0], [14, 2], [40, 2], [55, -2]];
export const ROAD_KARAMETE = [[60, 70], [58, 40], [55, 10], [55, -2]];
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const NANAO_PLAN = {
  mon: 'hatakeyama', name: '七尾城', type: 'yama', year: 1577, stone: 'nozura', lifeDense: 1.8, lifeNoFlags: true,
  kuruwa: [
    { id: 'nishi', name: '西の丸', level: -24, wall: 'saku', hp: 460, kind: 'san', capacity: 100, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-82, -50, -12, 6), gapAt: [[-66, -12], [-50, -2]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: -14, wall: 'saku', hp: 520, kind: 'ni', capacity: 120, fallbackTo: 'nukui', defenseValue: .7,
      poly: rect(-46, -16, -14, 8), gapAt: [[-46, -2], [-16, 0], [-30, 8]], gapW: 5 },
    { id: 'san', name: '三の丸', level: -18, wall: 'saku', hp: 460, kind: 'san', capacity: 80, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-46, -14, 18, 44), gapAt: [[-30, 18]], gapW: 5 },
    { id: 'tera', name: '寺屋敷', level: -20, wall: 'saku', hp: 380, kind: 'koshi', capacity: 40, fallbackTo: 'nishi', defenseValue: .4,
      poly: rect(-80, -56, 10, 28), gapAt: [[-68, 10]], gapW: 4 },
    { id: 'nukui', name: '温井屋敷', level: -9, wall: 'dobei', stone: true, hp: 600, kind: 'koshi', capacity: 60, fallbackTo: 'sakura', defenseValue: .6,
      poly: rect(-16, 14, -8, 12), gapAt: [[-16, 0], [14, 2]], gapW: 4.5 },
    { id: 'sakura', name: '桜馬場', level: -4, wall: 'dobei', stone: true, hp: 700, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(14, 40, -6, 12), gapAt: [[14, 2], [40, 2], [26, -6], [24, 12]], gapW: 4.5 },
    { id: 'chodo', name: '調度丸', level: -6, wall: 'dobei', stone: true, hp: 520, kind: 'koshi', capacity: 40, fallbackTo: 'sakura', defenseValue: .5,
      poly: rect(14, 38, -28, -8), gapAt: [[26, -8]], gapW: 4 },
    { id: 'yusa', name: '遊佐屋敷', level: -8, wall: 'dobei', stone: true, hp: 520, kind: 'koshi', capacity: 40, fallbackTo: 'sakura', defenseValue: .5,
      poly: rect(10, 34, 14, 30), gapAt: [[24, 14]], gapW: 4 },
    { id: 'hon', name: '本丸', level: 0, wall: 'dobei', stone: true, hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(40, 70, -14, 10), gapAt: [[40, 2], [70, -2], [55, 10]] },
    { id: 'naga', name: '長屋敷', level: -6, wall: 'saku', hp: 420, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(72, 96, -12, 8), gapAt: [[72, -2]], gapW: 4 },
  ],
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'nishi', kind: 'kuichigai', gate: 'kabuki', at: [-66, -12], rot: Math.PI, w: 4.6, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'ni_gate', name: '二の丸の門', from: 'nishi', to: 'ni', kind: 'hira', gate: 'kabuki', at: [-48, -2], rot: -Math.PI / 2, w: 4.4, maxFlow: 6, fireResistance: .4 },
    { id: 'sakura_gate', name: '桜馬場の門', from: 'nukui', to: 'sakura', kind: 'hira', gate: 'yagura', at: [14, 2], rot: -Math.PI / 2, w: 4.2, maxFlow: 6, fireResistance: .5 },
    { id: 'hon_gate', name: '本丸の門', from: 'sakura', to: 'hon', kind: 'masu', gate: ['kabuki', 'yagura'], at: [40, 2], rot: -Math.PI / 2, turn: 1, w1: 4.2, w2: 4, size: 4, maxFlow: 6, fireResistance: .5 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [55, 10], rot: 0, w: 4, role: 'karamete', maxFlow: 5, fireResistance: .3 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'san', kind: 'koshi', pts: [[-30, -2], [-30, 8], [-30, 18], [-30, 30]] },
    { id: 'tera', kind: 'koshi', pts: [[-66, -2], [-68, 6], [-68, 10], [-68, 18]] },
    { id: 'chodo', kind: 'koshi', pts: [[26, 2], [26, -6], [26, -8], [26, -18]] },
    { id: 'yusa', kind: 'koshi', pts: [[24, 2], [24, 12], [24, 14], [22, 22]] },
    { id: 'naga', kind: 'koshi', pts: [[55, -2], [70, -2], [72, -2], [84, -2]] },
  ],
  hori: [
    { kind: 'horikiri', pts: [[-48, -16], [-48, 10]], w: 4, deep: 4 },     // 西の丸と二の丸の間
    { kind: 'horikiri', pts: [[71, -16], [71, 12]], w: 3, deep: 3 },        // 本丸と長屋敷の間
    { kind: 'tatebori', pts: [[-30, 10], [-40, 16]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[0, -10], [0, -30]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[86, 10], [86, 30]], w: 3, deep: 3 },
  ],
  yagura: [
    { id: 'hon_w', kind: 'monomi', at: [44, -10], rot: Math.PI },
    { id: 'hon_e', kind: 'monomi', at: [66, 6], rot: 0 },
    { id: 'sakura', kind: 'monomi', at: [36, -2], rot: -Math.PI / 2 },
    { id: 'nishi', kind: 'monomi', at: [-78, -8], rot: Math.PI },
  ],
  yokoya: [
    { id: 'ote_waki', at: [-60, -10], dir: Math.PI },
    { id: 'hon_waki', at: [38, 8], dir: -Math.PI / 2 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [58, -4], w: 12, d: 7, rot: 0, door: 1, name: '本丸の御殿', where: '本丸の御殿の奥' },
  taba: [[-72, -40], [-64, -40]],
};
