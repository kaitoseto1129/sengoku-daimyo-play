// ======================================================================
// castles/usayama.js … 宇佐山城の縄張り（docs/quality-upgrade-plan.md 束5／docs/mid6-1570-1572-spec.md 51章）
// 坂本の町の南の山の上の山城。曲輪は三つ：北の三の丸（大手木戸を受ける）→二の丸（木戸）→奥で一段高い本丸。
// 北東・三の丸東・二の丸西は遺構に合わせ野面積み。他の縁・建物と南の二の丸の方位は推定。castle_plan.js の形
// （kuruwa・koguchi・paths・yagura）で書く。地形・兵・戦い方は b_shiga.js 側の仕事。
// 向き：北（-z）の坂の下に坂本の町、東（+x）は琵琶湖、西は比叡山の尾根。
// ======================================================================

export const HON_C = { x: -26.6667, z: 146.5 };                  // 本丸の真ん中（南北115m・東西約20m）
export const HILL_C = { x: -24, z: 94 };                        // 山の頂（地形の盛りの中心）
export const SAN_LEVEL = 21, NI_LEVEL = 24, HON_LEVEL = 27;
export const GATE_OUT = { x: -8, z: 50, rot: Math.PI, name: '宇佐山城の大手木戸' };  // 三の丸の北の口（外は北＝坂本の町の側）
export const GATE_NI = { x: -11, z: 75, rot: Math.PI, name: '二の丸の木戸' };        // 三の丸→二の丸（外は北＝三の丸の側）
export const GATE_HON = { x: -26.6667, z: 89, rot: Math.PI, name: '本丸の木戸' };     // 二の丸→本丸（外は北＝二の丸の側）
export const URA = { x: -28.6667, z: 204, name: '水の手口' };                            // 本丸の南の小口（水の手へ下りる）
export const WELL = { x: -35.3333, z: 214 };                                             // 城の裏の谷の井戸（水の手）

// 大手道：坂本の町口から坂を上り、大手木戸→三の丸→二の丸の木戸→二の丸→本丸の木戸→本丸
// 折り返しは間を１０ｍ空けて直角に曲げる。実寸の比高でも、隣の道の高さが格子で混ざらない。町口の戦いから西へ外す。
export const ROAD = [[30, -190], [26, -80], [22,-20], [-55,-20], [-115,-20], [-115,-10], [-55,-10], [-55,0], [-115,0], [-115,10], [-55,10], [-55,20], [-115,20], [-115,30], [-55,30], [-29,31], [-19,40.5], [-14,44], [-8,47], [GATE_OUT.x,GATE_OUT.z], [-10, 58], [-11, 69], [GATE_NI.x, GATE_NI.z], [-11, 79], [GATE_HON.x, 79], [GATE_HON.x, 84], [GATE_HON.x, GATE_HON.z], [GATE_HON.x, 95], [HON_C.x, HON_C.z]];
// 水の手の道：本丸の南の小口から、裏の谷の井戸へ
export const PATH_WELL = [[HON_C.x, HON_C.z], [-28, 179], [URA.x, URA.z], [-28.6667, 208], [-41.3333, 208], [-41.3333, 211], [-27.3333, 211], [-27.3333, 215], [-35.3333, 215], [WELL.x, WELL.z]];
// 道の坂（切岸の口を、歩ける坂にならす）：[始めの点, 終わりの点, 終わりの高さ（始めは地形のまま）, 幅]
export const RAMPS = [
  { a: [12, 38], b: [-8, 51], h: SAN_LEVEL, w: 3.6 },
  { a: [-8, 63], b: [-11, 76], h: NI_LEVEL, w: 3.6 },
  { a: [-26.6667, 81], b: [-26.6667, 90], h: HON_LEVEL, w: 3.4, from: NI_LEVEL },
  { a: [-34, 212], b: [-28.6667, 203], h: HON_LEVEL, w: 3, from: null },
];

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const USAYAMA_PLAN = {
  name: '宇佐山城', type: 'yama', year: 1570,
  kuruwa: [
    // 三の丸：約25m四方。北の大手木戸を受ける。
    { id: 'san', name: '三の丸', poly: rect(-25, 0, 50, 75), level: SAN_LEVEL, wall: 'saku', dorui: 0.65 },
    // 二の丸：北13×15mと南16×9m、本丸の3m下。南の段は南寄りに置き、長辺16mを南北へ向ける。接続は推定。
    { id: 'ni', name: '二の丸の北の段', poly: rect(-20, -7, 75, 90), level: NI_LEVEL },
    { id: 'ni_s', name: '二の丸の南の段', poly: rect(-13, -4, 183, 199), level: NI_LEVEL },
    { id: 'arc', name: '北の小曲輪', poly: [[-24,47],[-22,42],[-16,39],[-8,39],[0,43],[0,47]], level: SAN_LEVEL - 2, wall: 'saku', dorui: 0.5 },
    // 本丸：地理院1m標高の南北の尾根（約126m・幅15〜24m）に合わせる。本文の長さ115mを保ち、幅は20m。
    // 出所：docs/layout-ref/nawabari-measured.md「宇佐山（二回目）」。木戸・建物・接続は推定。
    { id: 'hon', name: '本丸', poly: [[-16.6667, 204], [-16.6667, 149], [-19, 129], [-16.6667, 89], [-36.6667, 89], [-34, 129], [-36.6667, 149], [-36.6667, 204]], level: HON_LEVEL },
  ],
  koguchi: [
    { id: 'kido_san', name: GATE_OUT.name, at: [GATE_OUT.x, GATE_OUT.z] },
    { id: 'kido_ni', name: GATE_NI.name, at: [GATE_NI.x, GATE_NI.z] },
    { id: 'kido_hon', name: GATE_HON.name, at: [GATE_HON.x, GATE_HON.z] },
    { id: 'ura', name: URA.name, at: [URA.x, URA.z] },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROAD }, { id: 'mizunote', kind: 'karamete', pts: PATH_WELL }],
  yagura: [{ id: 'monomi_san', at: [-4, 54], name: '大手東の櫓' }, { id: 'monomi_san_w', at: [-15, 54], name: '大手西の櫓' }, { id: 'monomi_ni', at: [-9, 87], name: '二の丸の櫓' }, { id: 'monomi_hon', at: [-19, 96], name: '本丸北の櫓台の物見' }, { id: 'monomi_hon_s', at: [-32, 194], name: '本丸南の櫓台の物見' }, { id: 'monomi_arc', at: [-19, 44], name: '北の小曲輪の物見' }],
};

// 柵（味方＝城方の柵。口を開けて線で書く。castle_plan の塀は寄せ手の側の物なので、ここは手で置く）
// 三の丸：北の縁（大手木戸を空ける）・東・西
export const WALLS = [
  [[-25, 50], [-25, 75], [-20, 75]],
  [[0, 50], [0, 75], [-7, 75]],
  [[-25, 50], [-9.7, 50]],
  [[-6.3, 50], [0, 50]],
  // 二の丸：北の木戸・西の本丸への道を空け、東と南を囲う
  [[-12.7, 75], [-20, 75], [-20, 77]],
  [[-9.3, 75], [-7, 75], [-7, 90], [-14, 90]],
  // 本丸：北の木戸と南の水の手口、南の段への枝道を空ける。
  [[-28.6667,89],[-36.6667,89],[-34,129],[-36.6667,149],[-36.6667,204],[-30.0667,204]],
  [[-27.2667,204],[-16.6667,204],[-16.6667,188]],
  [[-16.6667,184],[-16.6667,149],[-19,129],[-16.6667,89],[-24.6667,89]],
  [[-13,184.4],[-13,183],[-4,183],[-4,199],[-13,199]],
  [[-13,199],[-13,187.6]],
  [[-24,47],[-22,42],[-20.3,41.15]],
  [[-17,39.5],[-16,39],[-8,39],[0,43],[0,47]],
];

// 位置・用途・屋根は元亀元年の近江の山城からの推定。寺院と天守は根拠がなく置かない。
export const HOUSES = [
  { x: -32, z: 153, w: 6, d: 12, name: '城の詰所', kind: 'goten', door: -1 },
  { x: -32, z: 184, w: 5, d: 10, name: '本丸の長屋', kind: 'nagaya', door: 1 },
  { x: -30.5, z: 125, w: 4, d: 6, name: '兵糧蔵', kind: 'kura', door: -1 },
  { x: -19, z: 66, w: 7, d: 4, name: '三の丸の番所', kind: 'nagaya', door: 1 },
  { x: -15, z: 84, w: 5, d: 4, name: '二の丸の番所', kind: 'nagaya', door: -1 },
  // 南の段の小屋。北の庭から戸口へ入る。
  { x: -7, z: 186, w: 4, d: 3, name: '水番の小屋', kind: 'nagaya', door: -1 },
];
// 本丸の東の口から南の段へ。小屋と貯水槽の北を回る。
export const SOUTH_PATH = [[-22,186],[-17.5,186],[-11,186],[-11,184],[-7,184],[-7,184.5]];
export const HOUSE_PATHS = HOUSES.slice(0,5).map((h,i) => {
  const doorZ = h.z + h.d / 2 * h.door;
  const start = i < 3 ? [HON_C.x,h.z + h.d / 2 * h.door + h.door * 1.5] : [-11, h.x === -19 ? 69 : 81];
  return [start, [h.x, doorZ + h.door * 1.5], [h.x, doorZ]];
});
export const ALL_PATHS = [ROAD, PATH_WELL, SOUTH_PATH, ...HOUSE_PATHS,
  ...USAYAMA_PLAN.yagura.map(y => y.id==='monomi_arc' ? [[-14,44],[y.at[0],y.at[1]+2.9]] : [[y.at[0], y.at[1]+4.8], [y.at[0],y.at[1]+2.9]]),
  [[-8,50],[-8,47],[-14,44]]];
USAYAMA_PLAN.paths.push(...ALL_PATHS.slice(2).map((pts,i) => ({id: '枝道' + i, pts})));
RAMPS.push({a:[-22,186], b:[-11,186], from:HON_LEVEL, h:NI_LEVEL, w:2});
export const TANK = { x: -10.5, z: 195.5, w: 3.4, d: 6.5, deep: 1 };
// 本丸北東、三の丸東、二の丸西の石垣。総石垣にはしない。
export const STONE_LINES = [
  { pts: [[-19,129],[-16.6667,89],[-24.6667,89]], level:HON_LEVEL, out:-1 },
  { pts: [[-28.6667,89],[-36.6667,89]], level:HON_LEVEL, out:-1 },
  { pts: [[0,50],[0,75]], level:SAN_LEVEL, out:-1 },
  { pts: [[-13,199],[-13,187.6]], level:NI_LEVEL, out:-1 },
];
// 遺構位置の詳しい測量がない堀切・竪堀は推定。道と曲輪を横切らない斜面に限定する。
export const DITCHES = [
  { pts:[[-45,194],[-45,138]], w:4, deep:2 },
  { pts:[[5,79],[17,92],[27,110]], w:2.8, deep:1.6 },
  { pts:[[-14,223],[-28,233],[-40,239]], w:2.8, deep:1.6 },
];

// 寄せ手（浅井・朝倉）の道（siege_ai.js の makeAttackAI）。入口は切岸の下の、取り付く所
export const ATTACK_ROUTES = [
  { id: 'ote', name: '大手の坂', entry: { x: -8, z: 30 }, defThickness: 2.4, pathLen: 110, chokeWidth: 3.4 },
  { id: 'ne', name: '北東の尾根', entry: { x: 12, z: 74 }, defThickness: 1.6, pathLen: 130, chokeWidth: 2.2 },
  { id: 'ura', name: '水の手の谷', entry: { x: -35.3333, z: 220 }, defThickness: 1.2, pathLen: 250, chokeWidth: 2.4 },
];
