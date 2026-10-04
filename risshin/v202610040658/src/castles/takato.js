// ======================================================================
// castles/takato.js … 高遠城の縄張り（docs/siege-plan.md C2・docs/castle-design.md 6章）
// 梯郭式の平山城。南は崖（三峰川・藤沢川の合流の崖）を背にし、東から大手、西から搦手。
// castle_plan.js の形（kuruwa・koguchi・paths・hori・yagura）で書く。地形・兵の配置・戦い方は
// b_takato_siege.js（C7）側の仕事。ここは「人の大きさの城」の縄張りのデータだけ。
// 向き：北（-z）は藤沢川の谷。南（+z）は三峰川の崖。東（+x）が大手・法幢院曲輪、西（-x）が搦手。
// 門は喰い違いに東西へ振ってあり、大手から本丸へ一直線には行けない（docs C2「虎口の曲がり」）。
// ======================================================================

export const OTE = { x: 28, z: -38, name: '大手門' };           // 戦国期の東の口
export const GATE_NI = { x: 10, z: -18, name: '二の丸の門' };    // 三の丸→二の丸（東へ振る）
export const GATE_HON = { x: -8, z: 14, name: '本丸の門' };      // 二の丸→本丸（西へ振り返す）
export const KARAMETE = { x: -24, z: 0, name: '搦手門' };        // 信忠が寄せる西の口
export const GATE_HODOIN = { x: 24, z: 0, name: '法幢院の口' };  // 法幢院曲輪→二の丸
export const CLIFF_Z = 44;      // これより南（本丸の裏）は崖。攻めても行けない
export const NISHI_X = -24;     // これより西は切岸（梯子が要る。攻めのルート「西の切岸」）

// 東の大手道（外→枡形→三の丸→二の丸の門→本丸。門ごとに東西へ折れ、一直線に走り込めない）
export const ROAD_OTE = [[100, -38], [48, -38], [OTE.x, OTE.z], [23.5, -38], [25.075, -42.5], [4, -38], [GATE_NI.x, GATE_NI.z], [2, 0], [GATE_HON.x, GATE_HON.z], [-2, 30]];
// 西の搦手道（尾根→搦手門→二の丸）
export const ROAD_KARAMETE = [[-68, 0], [-40, 0], [KARAMETE.x, KARAMETE.z], [-12, 0], [2, 0]];
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
  mon: 'takeda',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '高遠城', type: 'hira', year: 1547, stone: 'nozura',
  // kuruwa の束19 の欄（castle-fort-system-spec 81 章）：kind・capacity（一度に戦える数）・fallbackTo（退き先）・defenseValue
  kuruwa: [
    // 三の丸：大手の枡形を受ける。北の塀に小さな折れ（横矢）を入れる。南の門は東へ振る（喰違い）
    {
      id: 'san', name: '三の丸', level: 0, wall: 'dobei', hp: 460,
      kind: 'san', capacity: 120, fallbackTo: 'ni', defenseValue: 0.5,
      poly: [[-28, -58], [-6, -58], [-6, -54], [6, -54], [6, -58], [28, -58], [28, -18], [-28, -18]],
      gapAt: [[OTE.x, OTE.z], [GATE_NI.x, -18]],
    },
    // 二の丸：城の中心。北の門（東寄り）・東の法幢院への口・南の門（西寄り）
    {
      id: 'ni', name: '二の丸', level: 4, wall: 'dobei', hp: 520,
      kind: 'ni', capacity: 140, fallbackTo: 'hon', defenseValue: 0.7,
      poly: rect(-24, 24, -18, 14),
      gapAt: [[GATE_NI.x, -18], [24, 0], [KARAMETE.x, KARAMETE.z], [GATE_HON.x, 14]],
    },
    // 法幢院曲輪：搦手を受ける側曲輪。南へ張り出し、本丸の東＝南の端の際まで続く
    // （docs final7-1579-1582-spec 71〜75章「法幢院は南の端の曲輪の辺り」。今の桂泉院の建物は使わない）
    {
      id: 'hodoin', name: '法幢院曲輪', level: 3, wall: 'dobei', hp: 400,
      kind: 'koshi', capacity: 80, fallbackTo: 'ni', defenseValue: 0.45,
      poly: rect(24, 48, -14, 30),
      gapAt: [[24, 0]],
    },
    // 本丸：いちばん奥・いちばん高い。石垣。南は崖
    {
      id: 'hon', name: '本丸', level: 9, wall: 'ishigaki', stone: true, hp: 900,
      kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(-18, 18, 14, 44),
      gapAt: [[GATE_HON.x, 14]],
    },
  ],
  // koguchi の束19 の欄（castle-fort-system-spec 82 章）：role（大手・搦手）・maxFlow（同時に通れる人数）・
  // fireResistance（燃えにくさ 0〜1）・sideFire（横矢 [x, z, 撃つ向き, 幅]。三の丸の北の折れ）
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'san', kind: 'masu', gate: ['kabuki', 'yagura'], at: [OTE.x, OTE.z], rot: Math.PI / 2, turn: 1, w1: 4.6, w2: 4.2, size: 4.5,
      role: 'ote', maxFlow: 8, fireResistance: 0.4, sideFire: [[26, -46, 0, 4], [26, -30, Math.PI, 4]] },
    { id: 'gate_ni', name: GATE_NI.name, from: 'san', to: 'ni', kind: 'kuichigai', gate: 'yagura', at: [GATE_NI.x, GATE_NI.z], rot: 0, w: 5, maxFlow: 6, fireResistance: 0.4 },
    { id: 'gate_hon', name: GATE_HON.name, from: 'ni', to: 'hon', kind: 'masu', gate: ['kabuki', 'yagura'], at: [GATE_HON.x, GATE_HON.z], rot: Math.PI, turn: -1, w1: 4.2, w2: 4.0, size: 4, maxFlow: 6, fireResistance: 0.5 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [KARAMETE.x, KARAMETE.z], rot: -Math.PI / 2, w: 4.4, role: 'karamete', maxFlow: 6, fireResistance: 0.2 },
    { id: 'gate_hodoin', name: GATE_HODOIN.name, from: 'hodoin', to: 'ni', kind: 'hira', gate: 'kabuki', at: [GATE_HODOIN.x, GATE_HODOIN.z], rot: Math.PI / 2, w: 4, maxFlow: 5, fireResistance: 0.2 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'nishi', kind: 'nishi', pts: ROAD_NISHI },
    { id: 'yodou', kind: 'yodou', pts: ROAD_YODOU },
  ],
  // 堀切：曲輪の間を断つ（橋の所は BRIDGES の幅だけ切って空ける）
  hori: [
    { kind: 'horikiri', pts: [[-28, -18], [GATE_NI.x - 3, -18]], w: 7, deep: 4.2 },
    { kind: 'horikiri', pts: [[GATE_NI.x + 3, -18], [28, -18]], w: 7, deep: 4.2 },
    { kind: 'horikiri', pts: [[-18, 14], [GATE_HON.x - 3, 14]], w: 6.5, deep: 4.5 },
    { kind: 'horikiri', pts: [[GATE_HON.x + 3, 14], [18, 14]], w: 6.5, deep: 4.5 },
    { kind: 'horikiri', pts: [[24, -14], [24, -3]], w: 5, deep: 3.4 },
    { kind: 'horikiri', pts: [[24, 3], [24, 12]], w: 5, deep: 3.4 },
    // 三の丸の外を巡る空堀。東の大手道（z -44〜-32）だけを土橋として掘り残す。
    // 北は藤沢川の谷、南東は法幢院曲輪。三の丸から本丸へ北から南に進む。
    { kind: 'karabori', pts: [[-36, -18], [-36, -74], [36, -74], [36, -44]], w: 9, deep: 3.0 },
    { kind: 'karabori', pts: [[36, -32], [36, -18]], w: 9, deep: 3.0 },
    // 西の切岸の下の竪堀（回り込めないように。梯子の道はここを避けて通る）
    { kind: 'tatebori', pts: [[-30, -20], [-30, -5]], w: 3, deep: 3.0 },
    { kind: 'tatebori', pts: [[-30, 5], [-30, 20]], w: 3, deep: 3.0 },
    // 南斜面（三峰川側・崖の上）の竪堀群（kaito 10/1「南斜面に竪堀を複数」）。崖そのものが攻めを拒むが、
    // 横に動いて迂回する事も防ぐ。実の攻め筋には使わない（南は大きな攻めに向かない＝飾りと張出しの当たり）
    { kind: 'tatebori', pts: [[-12, 36], [-12, 56]], w: 3, deep: 3.0 },
    { kind: 'tatebori', pts: [[2, 38], [2, 58]], w: 3, deep: 3.0 },
    { kind: 'tatebori', pts: [[16, 36], [16, 56]], w: 3, deep: 3.0 },
  ],
  yagura: [
    { id: 'sumi_san_e', kind: 'sumi', at: [24, -54], rot: 0 },
    { id: 'sumi_san_w', kind: 'sumi', at: [-24, -54], rot: 0 },
    { id: 'sumi_ni', kind: 'sumi', at: [16, 10], rot: Math.PI },
    { id: 'sumi_hon_e', kind: 'sumi', at: [14, 40], rot: Math.PI },
    { id: 'sumi_hon_w', kind: 'sumi', at: [-14, 40], rot: Math.PI },
    { id: 'monomi_hodoin', kind: 'monomi', at: [40, 8] },
  ],
  // 横矢の点（束9・yokoya.js）：点と向きだけ（縄張りの形は変えない）。三の丸の北の折れ・二の丸の門の脇
  yokoya: [
    { id: 'san_kado_w', at: [26, -46], dir: 0 },
    { id: 'san_kado_e', at: [26, -30], dir: Math.PI },
    { id: 'ni_waki', at: [GATE_NI.x + 4, GATE_NI.z], dir: 0 },
  ],
  // 大将の居場所（kaito 10/2）：天守の無い城（1582 年の高遠は土の城）なので、本丸の主殿の奥の間。
  // 戸口は北（二の丸の側・-z）。castle_plan.js が中に入れる主殿を建て、C.seat.spot が仁科盛信の立ち所
  lordSeat: { profile: 'takato', kind: 'goten', at: [0, 37], w: 12, d: 7, rot: 0, door: -1, name: '主殿', where: '主殿の奥の間' },
  // 竹束（castle_plan.js が自動で置く。寄せ場＝大手門・二の丸の門・搦手門の手前に数個ずつ）
  // 道（ROAD_OTE）の折れで、片方が道の上に乗ってしまわないよう [3,-40] は [8,-40] へ離す
  taba: [
    [48, -44], [48, -32], [14, -26], [6, -26], [-42, -5], [-42, 5],
  ],
};
