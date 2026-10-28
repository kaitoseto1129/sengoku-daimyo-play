// 高遠城。『史跡高遠城跡二ノ丸Ⅱ』第3図（1996、100m棒・標高点）。
// docs/layout-ref/nawabari-measured.md「高遠」の図読みを基準にする。
// 携帯の戦場と行軍時間に収めるため平面の曲輪寸法は実長の0.5倍。
// 本丸は東西35×南北45、二ノ丸は東西34×南北75。堀幅・深さ・比高は縮めない。
// 東（+x）の三ノ丸→二ノ丸→西の本丸。北は-z。搦手は図に無く、西口を遊び用に残す。
export const OTE = { x: 77, z: 0, name: '大手門' };
export const GATE_NI = { x: 17, z: 10, name: '二の丸の門' };
export const GATE_HON = { x: -41, z: -8, name: '本丸の門' };
export const KARAMETE = { x: -76, z: 0, name: '搦手門' };
export const GATE_HODOIN = { x: -58, z: 22.5, name: '南曲輪の口' };
export const CLIFF_Z = 80;
export const NISHI_X = -76;
// 折れと木戸の前後の点数を保つ。狭い口と寄せ場の間隔は実兵の密度を優先する。
export const ROAD_OTE = [[149, 0], [97, 0], [77, 0], [72.5, 0], [74.075, -4.5], [74.075, -8], [65, -8], [57, 10], [17, 10], [-2.125, -8], [-41, -8], [-45, -8], [-43.6, -4], [-45, 0], [-57, 0], [-59, 0]];
export const ROAD_KARAMETE = [[-120, 0], [-92, 0], [-76, 0], [-64, 0], [-52, 0]];
export const ROAD_NISHI = [[-98, 10], [-82, 6], [-76, 6], [-68, 8]];
export const ROAD_YODOU = [[-48, -74], [-28, -64], [-23, -58]];
export const BRIDGES = [
  { a: [37, 10], b: [17, 10], w: 6 },
  { a: [-17, -8], b: [-41, -8], w: 6.5 },
  { a: [-58, 22.5], b: [-58, 26.5], w: 5 },
];
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const TAKATO_PLAN = {
  mon: 'takeda', name: '高遠城', type: 'hira', year: 1547, stone: 'nozura', lifeDense: 2.2, lifeNoFlags: true,
  kuruwa: [
    // 東と北に回る三ノ丸。北側の低い段は別の床として同じ区域に属する。
    { id: 'san', name: '三の丸', level: 3.5, wall: 'saku', hp: 460,
      kind: 'san', capacity: 120, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(37, 77, -55, 28), gapAt: [[77, 0], [37, 10], [37, -49]], gapW: 6 },
    { id: 'san_north', name: '三の丸の北の段', level: -6, wall: 'saku', hp: 460,
      kind: 'san', capacity: 0, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-17, 37, -55, -43), gapAt: [[37, -49]], gapW: 6 },
    { id: 'ni', name: '二の丸', level: 1, wall: 'saku', hp: 520,
      kind: 'ni', capacity: 140, fallbackTo: 'hon', defenseValue: .7,
      poly: rect(-17, 17, -37.5, 37.5), gapAt: [[17, 10], [-17, -8]] },
    { id: 'minami', name: '南曲輪', level: 0, wall: 'saku', hp: 400,
      kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(-76, -41, 26.5, 50.5), gapAt: [[-58, 26.5], [-58, 50.5]], gapW: 5 },
    { id: 'hodoin', name: '法幢院曲輪', level: -5, wall: 'saku', hp: 400,
      kind: 'koshi', capacity: 60, fallbackTo: 'minami', defenseValue: .4,
      poly: rect(-76, -41, 54.5, 76.5), gapAt: [[-58, 54.5], [-41, 66]], gapW: 5 },
    { id: 'sasa', name: '笹曲輪', level: -3, wall: 'saku', hp: 350,
      kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .4,
      poly: rect(-36, -22, 26.5, 44.5), gapAt: [[-36, 32]], gapW: 5 },
    { id: 'kansuke', name: '勘助曲輪', level: -11, wall: 'saku', hp: 350,
      kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .4,
      poly: rect(-104, -80, -48, -24), gapAt: [[-92, -24], [-104, -36]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', stone: false, hp: 900,
      kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(-76, -41, -22.5, 22.5), gapAt: [[-41, -8], [-76, 0], [-76, 6], [-58, 22.5], [-41, 20]] },
  ],
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'san', kind: 'masu', gate: ['kabuki', 'kabuki'], at: [77, 0], rot: Math.PI / 2, turn: 1, w1: 4.6, w2: 4.2, size: 4.5,
      role: 'ote', maxFlow: 8, fireResistance: .4, sideFire: [[75, -8, 0, 4], [75, 8, Math.PI, 4]] },
    { id: 'gate_ni', name: GATE_NI.name, from: 'san', to: 'ni', kind: 'kuichigai', gate: 'kabuki', at: [17, 10], rot: -Math.PI / 2, w: 5, maxFlow: 6, fireResistance: .4 },
    { id: 'gate_hon', name: GATE_HON.name, from: 'ni', to: 'hon', kind: 'masu', gate: ['kabuki', 'kabuki'], at: [-41, -8], rot: Math.PI / 2, turn: -1, w1: 4.2, w2: 4, size: 4, maxFlow: 6, fireResistance: .5 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-76, 0], rot: -Math.PI / 2, w: 4.4, role: 'karamete', maxFlow: 6, fireResistance: .2 },
    { id: 'gate_hodoin', name: GATE_HODOIN.name, from: 'minami', to: 'hon', kind: 'hira', gate: 'yakui', at: [-58, 22.5], rot: Math.PI, w: 4, maxFlow: 5, fireResistance: .2 },
  ],
  paths: [
    { id: 'south', kind: 'koshi', pts: [[-57, 0], [-58, 16], [-58, 22.5], [-58, 26.5], [-58, 44], [-58, 50.5], [-58, 54.5], [-58, 62], [-41, 66], [-20, 66]] },
    { id: 'sasa', kind: 'koshi', pts: [[-57, 0], [-52, 12], [-48, 20], [-41, 20], [-41, 32], [-36, 32], [-29, 32]] },
    { id: 'kansuke', kind: 'koshi', pts: [[-120, 0], [-114, -12], [-114, -36], [-104, -36], [-92, -36], [-92, -24], [-76, -16], [-64, -16]], levels: [null, -7, -11, -11, -11, -11, 0, 0] },
    { id: 'san_north', kind: 'koshi', pts: [[57, 10], [57, -49], [0, -49]] },
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'nishi', kind: 'nishi', pts: ROAD_NISHI },
    { id: 'yodou', kind: 'yodou', pts: ROAD_YODOU },
  ],
  // 門間の空堀は全幅で掘る。歩く高さだけ橋の道幅で掘り残す。
  hori: [
    { kind: 'horikiri', pts: [[27, -40], [27, 40]], w: 20, deep: 5 },
    { kind: 'horikiri', pts: [[-29, -25], [-29, 25]], w: 24, deep: 8 },
    { kind: 'karabori', pts: [[85, -12], [85, -63], [-25, -63]], w: 9, deep: 3 },
    { kind: 'karabori', pts: [[85, 12], [85, 36]], w: 9, deep: 3 },
    { kind: 'tatebori', pts: [[-82, -20], [-82, -5]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-82, 12], [-82, 22]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-72, 80], [-72, 100]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-58, 82], [-58, 102]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[-44, 84], [-44, 104]], w: 3, deep: 3 },
    { kind: 'karabori', pts: [[-76, 52.5], [-61, 52.5]], w: 4, deep: 3 },
    { kind: 'karabori', pts: [[-55, 52.5], [-41, 52.5]], w: 4, deep: 3 },
  ],
  yagura: [
    { id: 'sumi_san_e', kind: 'monomi', at: [73, -16], rot: 0 },
    { id: 'sumi_san_w', kind: 'monomi', at: [73, -24], rot: -Math.PI / 2 },
    { id: 'sumi_ni', kind: 'monomi', at: [-11.6875, 18], rot: Math.PI / 2 },
    { id: 'sumi_hon_e', kind: 'monomi', at: [-63, 14], rot: Math.PI / 2 },
    { id: 'sumi_hon_w', kind: 'monomi', at: [-63, -14], rot: Math.PI / 2 },
    { id: 'monomi_hodoin', kind: 'monomi', at: [-69, 68], rot: 0 },
  ],
  yokoya: [
    { id: 'san_kado_w', at: [75, -8], dir: 0 },
    { id: 'san_kado_e', at: [75, 8], dir: Math.PI },
    { id: 'ni_waki', at: [17, 14], dir: -Math.PI / 2 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-64, 0], w: 12, d: 7, rot: -Math.PI / 2, door: -1, name: '主殿', where: '主殿の奥の間' },
  taba: [[97, -6], [97, 6], [45, 14], [45, 6], [-94, -5], [-94, 5]],
};
// 建物の寸法は従来どおり。戦う場所と戸口を一緒に移し、兵を薄く散らさない。
export const TAKATO_BUILDINGS = [
  { at: [65, -16], w: 8, d: 5, kind: 'nagaya', name: '三の丸の番所', rot: -Math.PI / 2, path: [[57, -12], [60, -16]] },
  { at: [45, -16], w: 8, d: 5, kind: 'nagaya', name: '三の丸の長屋', rot: Math.PI / 2, path: [[57, 10], [57, -16], [50, -16]] },
  { at: [-6.375, 15], w: 8, d: 5, kind: 'nagaya', name: '二の丸の詰所', rot: Math.PI / 2, path: [[-2.125, -8], [-2.125, 15]] },
  { at: [-54, 9], w: 6, d: 4, kind: 'toiya', name: '本丸の兵糧蔵', rot: Math.PI, path: [[-52, 0], [-54, 5]] },
  { at: [-69, 38], w: 6, d: 5, kind: 'nagaya', name: '南曲輪の長屋', rot: Math.PI / 2, path: [[-58, 38], [-64, 38]] },
  { at: [-69, 62], w: 9, d: 6, kind: 'temple', name: '法幢院の堂', rot: -Math.PI / 2, path: [[-58, 60], [-58, 62], [-63, 62]] },
  { at: [-29, 38], w: 6, d: 4, kind: 'nagaya', name: '笹曲輪の番所', rot: 0, path: [[-29, 32], [-29, 35]] },
  { at: [-92, -30], w: 6, d: 4, kind: 'nagaya', name: '勘助曲輪の番所', rot: Math.PI, path: [[-92, -36], [-92, -34]] },
];
for (const [i, b] of TAKATO_BUILDINGS.entries()) TAKATO_PLAN.paths.push({ id: 'house_' + i, kind: 'koshi', pts: b.path });
const TOWER_PATHS = [
  [[65, -8], [73, -10.5], [73, -13.1]],
  [[57, -12], [57, -22], [67.5, -24], [70.1, -24]],
  [[-2.125, -8], [-12.75, 2], [-12.75, 18], [-14.76875, 18]],
  [[-57, 0], [-58, 0], [-58, 12], [-65.9, 14]],
  [[-57, 0], [-57, -12], [-65.9, -14]],
  [[-58, 62], [-69, 62], [-69, 70.9]],
];
for (const [i, pts] of TOWER_PATHS.entries()) TAKATO_PLAN.paths.push({ id: 'tower_' + i, kind: 'koshi', pts });
