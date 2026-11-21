// 春日山城（越後・春日山。上杉謙信の居城）。手本と出所は docs/battle_refs/kasugayama.md（K563 上杉編・11/21 クラウド42）。
// 山頂に本丸と天守台、その南に毘沙門堂。西へ下りて大井戸・直江屋敷、直江屋敷の南に千貫門と柿崎屋敷。
// 東の尾根へ二の丸・景勝屋敷・三の丸。大手は西の麓（-z の側）から直江屋敷へ、搦手は東の三の丸から。
// 石垣は無い土の城（土塁・空堀・堀切・竪堀）。並び順と曲輪の名は春日山城跡の案内図から、寸法・段の高さは推定（平面は実長の約0.5倍）。
export const OTE = { x: -50, z: -10, name: '大手口' };
export const KARAMETE = { x: 66, z: 2, name: '搦手口' };
export const ROAD_OTE = [[-52, -80], [-56, -50], [-48, -28], [-50, -10], [-50, 0], [-34, 0], [-12, 0], [0, 0]];
export const ROAD_KARAMETE = [[110, 4], [86, 2], [66, 2], [52, 2], [38, 0], [12, 0], [0, 0]];
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const KASUGAYAMA_PLAN = {
  mon: 'uesugi', name: '春日山城', type: 'yama', year: 1578, lifeDense: 1.8, lifeNoFlags: true,
  kuruwa: [
    { id: 'naoe', name: '直江屋敷', level: -14, wall: 'saku', hp: 480, kind: 'san', capacity: 100, fallbackTo: 'ido', defenseValue: .5,
      poly: rect(-64, -34, -10, 10), gapAt: [[-50, -10], [-34, 0], [-50, 10]], gapW: 5 },
    { id: 'kakizaki', name: '柿崎屋敷', level: -18, wall: 'saku', hp: 420, kind: 'koshi', capacity: 60, fallbackTo: 'naoe', defenseValue: .45,
      poly: rect(-64, -36, 10, 32), gapAt: [[-50, 10]], gapW: 4.5 },
    { id: 'ido', name: '大井戸', level: -6, wall: 'dobei', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(-34, -12, -8, 8), gapAt: [[-34, 0], [-12, 0]], gapW: 4.5 },
    { id: 'hon', name: '本丸', level: 0, wall: 'dobei', hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 12, -8, 8), gapAt: [[-12, 0], [12, 0], [0, 8], [0, -8]] },
    { id: 'tenshu', name: '天守台', level: 3, wall: 'dobei', hp: 600, kind: 'koshi', capacity: 30, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-6, 6, -18, -8), gapAt: [[0, -8]], gapW: 3.5 },
    { id: 'bishamon', name: '毘沙門堂', level: -3, wall: 'dobei', hp: 520, kind: 'koshi', capacity: 30, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(-8, 8, 8, 20), gapAt: [[0, 8]], gapW: 3.5 },
    { id: 'ni', name: '二の丸', level: -9, wall: 'dobei', hp: 640, kind: 'ni', capacity: 100, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(12, 38, -10, 10), gapAt: [[12, 0], [38, 0], [24, 10]], gapW: 4.5 },
    { id: 'kagekatsu', name: '景勝屋敷', level: -12, wall: 'saku', hp: 460, kind: 'koshi', capacity: 50, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(14, 36, 10, 28), gapAt: [[24, 10]], gapW: 4 },
    { id: 'san', name: '三の丸', level: -16, wall: 'saku', hp: 480, kind: 'san', capacity: 100, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(38, 66, -8, 12), gapAt: [[38, 0], [66, 2]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'naoe', kind: 'kuichigai', gate: 'kabuki', at: [-50, -10], rot: Math.PI, w: 4.6, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'senkan', name: '千貫門', from: 'naoe', to: 'kakizaki', kind: 'hira', gate: 'yagura', at: [-50, 10], rot: 0, w: 4.2, maxFlow: 6, fireResistance: .45 },
    { id: 'ido_gate', name: '大井戸の門', from: 'naoe', to: 'ido', kind: 'hira', gate: 'kabuki', at: [-34, 0], rot: -Math.PI / 2, w: 4.4, maxFlow: 6, fireResistance: .4 },
    { id: 'hon_gate', name: '本丸の門', from: 'ido', to: 'hon', kind: 'masu', gate: ['kabuki', 'yagura'], at: [-12, 0], rot: -Math.PI / 2, turn: 1, w1: 4.2, w2: 4, size: 4, maxFlow: 6, fireResistance: .5 },
    { id: 'ni_gate', name: '二の丸の門', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: [12, 0], rot: Math.PI / 2, w: 4.2, maxFlow: 6, fireResistance: .45 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'san', kind: 'hira', gate: 'kabuki', at: [66, 2], rot: Math.PI / 2, w: 4, role: 'karamete', maxFlow: 5, fireResistance: .3 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'tenshu', kind: 'koshi', pts: [[0, 0], [0, -8], [0, -14]] },
    { id: 'bishamon', kind: 'koshi', pts: [[0, 0], [0, 8], [0, 14]] },
    { id: 'kagekatsu', kind: 'koshi', pts: [[24, 0], [24, 10], [24, 20]] },
    { id: 'kakizaki', kind: 'koshi', pts: [[-50, 0], [-50, 10], [-50, 22]] },
  ],
  hori: [
    { kind: 'horikiri', pts: [[-66, -12], [-66, 34]], w: 4, deep: 3.5 },   // 直江屋敷の西の堀切
    { kind: 'horikiri', pts: [[68, -10], [68, 14]], w: 4, deep: 3.5 },     // 三の丸の東の堀切
    { kind: 'tatebori', pts: [[-22, -8], [-28, -32]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[28, -10], [32, -34]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[52, 12], [56, 36]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-26, 8], [-30, 30]], w: 2.6, deep: 2.4 },   // 大井戸の南の竪堀（畝状は light_castle が pts しか読まないので一本ずつ）
    { kind: 'tatebori', pts: [[-18, 8], [-20, 30]], w: 2.6, deep: 2.4 },
  ],
  yagura: [
    { id: 'hon_w', kind: 'monomi', at: [-9, -5], rot: Math.PI },
    { id: 'hon_e', kind: 'monomi', at: [9, 5], rot: 0 },
    { id: 'tenshu', kind: 'monomi', at: [0, -14], rot: Math.PI },
    { id: 'naoe', kind: 'monomi', at: [-60, -6], rot: Math.PI },
    { id: 'san', kind: 'monomi', at: [62, -4], rot: Math.PI / 2 },
  ],
  yokoya: [
    { id: 'ote_waki', at: [-44, -8], dir: Math.PI },
    { id: 'hon_waki', at: [-14, 6], dir: -Math.PI / 2 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [4, -2], w: 12, d: 7, rot: 0, door: 1, name: '本丸の御殿', where: '本丸の御殿の奥' },
  taba: [[-56, -40], [-46, -40]],
};
