// ======================================================================
// castles/usayama.js … 宇佐山城の縄張り（docs/quality-upgrade-plan.md 束5／docs/mid6-1570-1572-spec.md 51章）
// 坂本の町の南の山の上の山城。曲輪は三つ：北の三の丸（大手木戸を受ける）→二の丸（木戸）→奥で一段高い本丸。
// 曲輪の縁は切岸（急な坂）で、登れるのは道（大手道・水の手の道）だけ。castle_plan.js の形
// （kuruwa・koguchi・paths・yagura）で書く。地形・兵・戦い方は b_shiga.js 側の仕事。
// 向き：北（-z）の坂の下に坂本の町、東（+x）は琵琶湖、西は比叡山の尾根。
// ======================================================================

export const HON_C = { x: -77.5, z: 99 };                       // 本丸の真ん中（東西115m・南北30m）
export const HILL_C = { x: -24, z: 94 };                        // 山の頂（地形の盛りの中心）
export const SAN_LEVEL = 21, NI_LEVEL = 24, HON_LEVEL = 27;
export const GATE_OUT = { x: -8, z: 50, rot: Math.PI, name: '宇佐山城の大手木戸' };  // 三の丸の北の口（外は北＝坂本の町の側）
export const GATE_NI = { x: -11, z: 75, rot: Math.PI, name: '二の丸の木戸' };        // 三の丸→二の丸（外は北＝三の丸の側）
export const GATE_HON = { x: -20, z: 89, rot: Math.PI / 2, name: '本丸の木戸' };     // 二の丸→本丸（外は東＝二の丸の側）
export const URA = { x: -135, z: 102, name: '水の手口' };                            // 本丸の西の小口（水の手へ下りる）
export const WELL = { x: -145, z: 112 };                                             // 城の裏の谷の井戸（水の手）

// 大手道：坂本の町口から坂を上り、大手木戸→三の丸→二の丸の木戸→二の丸→本丸の木戸→本丸
import { switchback } from '../yamalift.js';
export const ROAD = [[30, -190], [26, -80], [22, -20], ...switchback([20, 4], [GATE_OUT.x, GATE_OUT.z], 4, 16), [-10, 58], [-11, 69], [GATE_NI.x, GATE_NI.z], [-11, 82], [-15, 89], [GATE_HON.x, GATE_HON.z], [-26, 90], [HON_C.x, HON_C.z]];
// 水の手の道：本丸の西の小口から、裏の谷の井戸へ
export const PATH_WELL = [[HON_C.x, HON_C.z], [-110, 101], [URA.x, URA.z], [-140, 106], [WELL.x, WELL.z]];
// 道の坂（切岸の口を、歩ける坂にならす）：[始めの点, 終わりの点, 終わりの高さ（始めは地形のまま）, 幅]
export const RAMPS = [
  { a: [12, 38], b: [-8, 51], h: SAN_LEVEL, w: 3.6 },
  { a: [-8, 63], b: [-11, 76], h: NI_LEVEL, w: 3.6 },
  { a: [-12, 89], b: [-21, 89], h: HON_LEVEL, w: 3.4, from: NI_LEVEL },
  { a: [-143, 110], b: [-134, 102], h: HON_LEVEL, w: 3, from: null },
];

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const USAYAMA_PLAN = {
  name: '宇佐山城', type: 'yama', year: 1570,
  kuruwa: [
    // 三の丸：約25m四方。北の大手木戸を受ける。
    { id: 'san', name: '三の丸', poly: rect(-25, 0, 50, 75), level: SAN_LEVEL },
    // 二の丸：北の13m×15mを使う。本丸の3m下。南の別区画の位置は未確定。
    { id: 'ni', name: '二の丸', poly: rect(-20, -7, 75, 90), level: NI_LEVEL },
    // 本丸：資料の東西115m・南北30mを使った「く」の字。東の木戸位置と曲輪の並びは推定を保つ。
    { id: 'hon', name: '本丸', poly: [[-135, 84], [-80, 84], [-60, 89], [-20, 84], [-20, 114], [-60, 109], [-80, 114], [-135, 114]], level: HON_LEVEL },
  ],
  koguchi: [
    { id: 'kido_san', name: GATE_OUT.name, at: [GATE_OUT.x, GATE_OUT.z] },
    { id: 'kido_ni', name: GATE_NI.name, at: [GATE_NI.x, GATE_NI.z] },
    { id: 'kido_hon', name: GATE_HON.name, at: [GATE_HON.x, GATE_HON.z] },
    { id: 'ura', name: URA.name, at: [URA.x, URA.z] },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROAD }, { id: 'mizunote', kind: 'karamete', pts: PATH_WELL }],
  yagura: [{ id: 'monomi_san', at: [-4, 54], name: '大手東の櫓' }, { id: 'monomi_san_w', at: [-15, 54], name: '大手西の櫓' }, { id: 'monomi_ni', at: [-5, 76], name: '二の丸の櫓' }, { id: 'monomi_hon', at: [-36, 88], name: '本丸の櫓' }],
};

// 柵（味方＝城方の柵。口を開けて線で書く。castle_plan の塀は寄せ手の側の物なので、ここは手で置く）
// 三の丸：北の縁（大手木戸を空ける）・東・西
export const WALLS = [
  [[-25, 50], [-25, 75], [-20, 75]],
  [[0, 50], [0, 75], [-7, 75]],
  [[-25, 50], [-9.7, 50]],
  [[-6.3, 50], [0, 50]],
  // 二の丸：北の縁（木戸を空ける）・東・南。西の縁は本丸の東の柵が受け持つ
  [[-12.7, 75], [-20, 75], [-20, 84]],
  [[-9.3, 75], [-7, 75], [-7, 90], [-20, 90]],
  // 本丸：東の縁（本丸の木戸を空ける）・南・西（水の手口を空ける）・北
  [[-20, 90.6], [-20, 114], [-60, 109], [-80, 114], [-135, 114], [-135, 103.4]],
  [[-135, 100.6], [-135, 84], [-80, 84], [-60, 89], [-20, 84], [-20, 87.4]],
];

// 寄せ手（浅井・朝倉）の道（siege_ai.js の makeAttackAI）。入口は切岸の下の、取り付く所
export const ATTACK_ROUTES = [
  { id: 'ote', name: '大手の坂', entry: { x: -8, z: 30 }, defThickness: 2.4, pathLen: 110, chokeWidth: 3.4 },
  { id: 'ne', name: '北東の尾根', entry: { x: 12, z: 74 }, defThickness: 1.6, pathLen: 130, chokeWidth: 2.2 },
  { id: 'ura', name: '水の手の谷', entry: { x: -151, z: 112 }, defThickness: 1.2, pathLen: 250, chokeWidth: 2.4 },
];
