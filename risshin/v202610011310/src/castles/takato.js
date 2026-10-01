// ======================================================================
// castles/takato.js … 高遠城の縄張り（docs/siege-plan.md C2・docs/castle-design.md 6章）
// 梯郭式の平山城。南は崖（三峰川・藤沢川の合流の崖）を背にし、北から大手、東から搦手。
// castle_plan.js の形（kuruwa・koguchi・paths・hori・yagura）で書く。地形・兵の配置・戦い方は
// b_takato_siege.js（C7）側の仕事。ここは「人の大きさの城」の縄張りのデータだけ。
// 向き：北（-z）が大手・外。南（+z）が本丸の奥＝崖。東（+x）が搦手・法幢院曲輪。西（-x）は切岸。
// 門は喰い違いに東西へ振ってあり、大手から本丸へ一直線には行けない（docs C2「虎口の曲がり」）。
// ======================================================================

export const OTE = { x: 0, z: -58, name: '大手門' };            // 三の丸の北の枡形
export const GATE_NI = { x: 10, z: -18, name: '二の丸の門' };    // 三の丸→二の丸（東へ振る）
export const GATE_HON = { x: -8, z: 14, name: '本丸の門' };      // 二の丸→本丸（西へ振り返す）
export const KARAMETE = { x: 52, z: 0, name: '搦手門' };         // 法幢院曲輪の東の口
export const GATE_HODOIN = { x: 24, z: 0, name: '法幢院の口' };  // 法幢院曲輪→二の丸
export const CLIFF_Z = 44;      // これより南（本丸の裏）は崖。攻めても行けない
export const NISHI_X = -24;     // これより西は切岸（梯子が要る。攻めのルート「西の切岸」）

// 北の大手道（外→枡形→三の丸→二の丸の門→本丸。門ごとに東西へ折れ、一直線に走り込めない）
export const ROAD_OTE = [[0, -100], [0, -80], [OTE.x, OTE.z], [4, -38], [GATE_NI.x, GATE_NI.z], [2, 0], [GATE_HON.x, GATE_HON.z], [-2, 30]];
// 東の搦手道（外→搦手門→法幢院曲輪→二の丸）
export const ROAD_KARAMETE = [[76, 0], [KARAMETE.x, KARAMETE.z], [36, 0], [GATE_HODOIN.x, GATE_HODOIN.z], [8, 0]];
// 西の切岸（梯子で登る。docs 1-8「西の切岸（梯子）」。切岸の下から、二の丸の西の縁へ）
export const ROAD_NISHI = [[-46, 10], [-30, 6], [NISHI_X, 6], [-16, 8]];
// 陽動：三の丸の西の塀へ、破らずに取り付くだけの道（守りを引きつける。docs 1-8「陽動」）
export const ROAD_YODOU = [[-50, -70], [-30, -60], [-25, -54]];

// 土橋の場所（堀を渡る所。実の床・見た目は castle_parts.dobashi を b_takato_siege.js 側で呼ぶ）
export const BRIDGES = [
  { a: [GATE_NI.x - 3, GATE_NI.z], b: [GATE_NI.x + 3, GATE_NI.z], w: 6 },     // 三の丸↔二の丸
  { a: [GATE_HON.x - 3, GATE_HON.z], b: [GATE_HON.x + 3, GATE_HON.z], w: 6.5 }, // 二の丸↔本丸
  { a: [24, -3], b: [24, 3], w: 5 },                                          // 二の丸↔法幢院曲輪
];

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const TAKATO_PLAN = {
  name: '高遠城', type: 'hira', year: 1547, stone: 'nozura',
  kuruwa: [
    // 三の丸：大手の枡形を受ける。北の塀に小さな折れ（横矢）を入れる。南の門は東へ振る（喰違い）
    {
      id: 'san', name: '三の丸', level: 0, wall: 'dobei', hp: 460,
      poly: [[-28, -58], [-6, -58], [-6, -54], [6, -54], [6, -58], [28, -58], [28, -18], [-28, -18]],
      gapAt: [[0, -58], [GATE_NI.x, -18]],
    },
    // 二の丸：城の中心。北の門（東寄り）・東の法幢院への口・南の門（西寄り）
    {
      id: 'ni', name: '二の丸', level: 4, wall: 'dobei', hp: 520,
      poly: rect(-24, 24, -18, 14),
      gapAt: [[GATE_NI.x, -18], [24, 0], [GATE_HON.x, 14]],
    },
    // 法幢院曲輪：搦手を受ける側曲輪
    {
      id: 'hodoin', name: '法幢院曲輪', level: 3, wall: 'dobei', hp: 400,
      poly: rect(24, 48, -14, 12),
      gapAt: [[24, 0], [48, 0]],
    },
    // 本丸：いちばん奥・いちばん高い。石垣。南は崖
    {
      id: 'hon', name: '本丸', level: 9, wall: 'ishigaki', stone: true, hp: 900,
      poly: rect(-18, 18, 14, 44),
      gapAt: [[GATE_HON.x, 14]],
    },
  ],
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'san', kind: 'masu', gate: ['kabuki', 'yagura'], at: [OTE.x, OTE.z], rot: 0, turn: 1, w1: 4.6, w2: 4.2, size: 4.5 },
    { id: 'gate_ni', name: GATE_NI.name, from: 'san', to: 'ni', kind: 'kuichigai', gate: 'yagura', at: [GATE_NI.x, GATE_NI.z], rot: 0, w: 5 },
    { id: 'gate_hon', name: GATE_HON.name, from: 'ni', to: 'hon', kind: 'masu', gate: ['kabuki', 'yagura'], at: [GATE_HON.x, GATE_HON.z], rot: 0, turn: -1, w1: 4.2, w2: 4.0, size: 4 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'hodoin', kind: 'hira', gate: 'kabuki', at: [KARAMETE.x, KARAMETE.z], rot: Math.PI / 2, w: 4.4 },
    { id: 'gate_hodoin', name: GATE_HODOIN.name, from: 'hodoin', to: 'ni', kind: 'hira', gate: 'kabuki', at: [GATE_HODOIN.x, GATE_HODOIN.z], rot: Math.PI / 2, w: 4 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'nishi', kind: 'nishi', pts: ROAD_NISHI },
    { id: 'yodou', kind: 'yodou', pts: ROAD_YODOU },
  ],
  // 堀切：曲輪の間を断つ（橋の所は BRIDGES の幅だけ切って空ける）
  hori: [
    { kind: 'horikiri', pts: [[-28, -18], [GATE_NI.x - 3, -18]], w: 7, deep: 2.4 },
    { kind: 'horikiri', pts: [[GATE_NI.x + 3, -18], [28, -18]], w: 7, deep: 2.4 },
    { kind: 'horikiri', pts: [[-18, 14], [GATE_HON.x - 3, 14]], w: 6.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[GATE_HON.x + 3, 14], [18, 14]], w: 6.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[24, -14], [24, -3]], w: 5, deep: 2 },
    { kind: 'horikiri', pts: [[24, 3], [24, 12]], w: 5, deep: 2 },
    // 西の切岸の下の竪堀（回り込めないように。梯子の道はここを避けて通る）
    { kind: 'tatebori', pts: [[-30, -20], [-30, 20]], w: 3, deep: 2 },
  ],
  yagura: [
    { id: 'sumi_san_e', kind: 'sumi', at: [24, -54], rot: 0 },
    { id: 'sumi_san_w', kind: 'sumi', at: [-24, -54], rot: 0 },
    { id: 'sumi_ni', kind: 'sumi', at: [16, 10], rot: Math.PI },
    { id: 'sumi_hon_e', kind: 'sumi', at: [14, 40], rot: Math.PI },
    { id: 'sumi_hon_w', kind: 'sumi', at: [-14, 40], rot: Math.PI },
    { id: 'monomi_hodoin', kind: 'monomi', at: [40, 8] },
  ],
  // 竹束（castle_plan.js が自動で置く。寄せ場＝大手門・二の丸の門・搦手門の手前に数個ずつ）
  taba: [
    [-3, -82], [3, -82], [-3, -40], [3, -40], [-3, -22], [3, -22], [58, -4], [58, 4],
  ],
};
