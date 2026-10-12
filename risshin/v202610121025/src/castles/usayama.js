// ======================================================================
// castles/usayama.js … 宇佐山城の縄張り（docs/quality-upgrade-plan.md 束5／docs/mid6-1570-1572-spec.md 51章）
// 坂本の町の南の山の上の山城。曲輪は三つ：北の三の丸（大手木戸を受ける）→二の丸（木戸）→奥で一段高い本丸。
// 北東・三の丸東・二の丸西は遺構に合わせ野面積み。他の縁・建物と南の二の丸の方位は推定。castle_plan.js の形
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
// 折り返しは間を１０ｍ空けて直角に曲げる。実寸の比高でも、隣の道の高さが格子で混ざらない。町口の戦いから西へ外す。
export const ROAD = [[30, -190], [26, -80], [22,-20], [-55,-20], [-115,-20], [-115,-10], [-55,-10], [-55,0], [-115,0], [-115,10], [-55,10], [-55,20], [-115,20], [-115,30], [-55,30], [-29,31], [-19,40.5], [-14,44], [-8,47], [GATE_OUT.x,GATE_OUT.z], [-10, 58], [-11, 69], [GATE_NI.x, GATE_NI.z], [-11, 82], [-15, 89], [GATE_HON.x, GATE_HON.z], [-26, 90], [HON_C.x, HON_C.z]];
// 水の手の道：本丸の西の小口から、裏の谷の井戸へ
export const PATH_WELL = [[HON_C.x, HON_C.z], [-110, 101], [URA.x, URA.z], [-139,102], [-139,121], [-142,121], [-142,100], [-146,100], [-146,112], [WELL.x, WELL.z]];
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
    { id: 'san', name: '三の丸', poly: rect(-25, 0, 50, 75), level: SAN_LEVEL, wall: 'saku', dorui: 0.65 },
    // 二の丸：北13×15mと南16×9m、本丸の3m下。南の方位・接続は資料の食い違いがあるため推定。
    { id: 'ni', name: '二の丸の北の段', poly: rect(-20, -7, 75, 90), level: NI_LEVEL },
    { id: 'ni_s', name: '二の丸の南の段', poly: rect(-48, -32, 117, 126), level: NI_LEVEL },
    { id: 'arc', name: '北の小曲輪', poly: [[-24,47],[-22,42],[-16,39],[-8,39],[0,43],[0,47]], level: SAN_LEVEL - 2, wall: 'saku', dorui: 0.5 },
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
  yagura: [{ id: 'monomi_san', at: [-4, 54], name: '大手東の櫓' }, { id: 'monomi_san_w', at: [-15, 54], name: '大手西の櫓' }, { id: 'monomi_ni', at: [-9, 79], name: '二の丸の櫓' }, { id: 'monomi_hon', at: [-25, 85.5], name: '本丸北の櫓台の物見' }, { id: 'monomi_hon_s', at: [-25, 95], name: '本丸南の櫓台の物見' }, { id: 'monomi_arc', at: [-19, 44], name: '北の小曲輪の物見' }],
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
  [[-9.3, 75], [-7, 75], [-7, 90], [-14, 90]],
  // 本丸：東の縁（本丸の木戸を空ける）・南・西（水の手口を空ける）・北
  [[-20, 91], [-20, 114], [-38, 111.75]],
  [[-42, 111.25], [-60, 109], [-80, 114], [-135, 114], [-135, 103.4]],
  [[-135, 100.6], [-135, 84], [-80, 84], [-60, 89], [-20, 84], [-20, 87]],
  [[-48,117],[-48,126],[-32,126],[-32,117],[-38.4,117]],
  [[-41.6,117],[-48,117]],
  [[-24,47],[-22,42],[-20.3,41.15]],
  [[-17,39.5],[-16,39],[-8,39],[0,43],[0,47]],
];

// 位置・用途・屋根は元亀元年の近江の山城からの推定。寺院と天守は根拠がなく置かない。
export const HOUSES = [
  { x: -84, z: 105, w: 12, d: 6, name: '城の詰所', kind: 'goten', door: -1 },
  { x: -118, z: 92, w: 10, d: 5, name: '本丸の長屋', kind: 'nagaya', door: 1 },
  { x: -56, z: 104, w: 6, d: 4, name: '兵糧蔵', kind: 'kura', door: -1 },
  { x: -19, z: 66, w: 7, d: 4, name: '三の丸の番所', kind: 'nagaya', door: 1 },
  { x: -15, z: 84, w: 5, d: 4, name: '二の丸の番所', kind: 'nagaya', door: -1 },
  // 北は曲輪の柵（z=117）。戸口と石段は南の平らな庭へ向ける。
  { x: -35, z: 120, w: 4, d: 3, name: '水番の小屋', kind: 'nagaya', door: 1 },
];
// 柵の口から小屋の西を回る。貯水槽の東縁（x=-39.75）と小屋の壁を避け、南の戸へ。
export const SOUTH_PATH = [[-40,107],[-40,111.5],[-40,118],[-38,118],[-38,123],[-35,123],[-35,121.5]];
export const HOUSE_PATHS = HOUSES.slice(0,5).map(h => {
  const doorZ = h.z + h.d / 2 * h.door;
  const start = h.x < -20 ? [h.x,101] : [-11, h.x === -19 ? 69 : 81];
  return [start, [h.x, doorZ + h.door * 1.5], [h.x, doorZ]];
});
export const ALL_PATHS = [ROAD, PATH_WELL, SOUTH_PATH, ...HOUSE_PATHS,
  ...USAYAMA_PLAN.yagura.map(y => y.id==='monomi_arc' ? [[-14,44],[y.at[0],y.at[1]+2.9]] : [[y.at[0], y.at[1]+4.8], [y.at[0],y.at[1]+2.9]]),
  [[-8,50],[-8,47],[-14,44]]];
USAYAMA_PLAN.paths.push(...ALL_PATHS.slice(2).map((pts,i) => ({id: '枝道' + i, pts})));
RAMPS.push({a:[-40,107], b:[-40,118], from:HON_LEVEL, h:NI_LEVEL, w:2});
export const TANK = { x: -43, z: 123.5, w: 6.5, d: 3.4, deep: 1 };
// 本丸北東、三の丸東、二の丸西の石垣。総石垣にはしない。
export const STONE_LINES = [
  { pts: [[-60,89],[-20,84],[-20,87]], level:HON_LEVEL, out:-1 },
  { pts: [[-20,91],[-20,114]], level:HON_LEVEL, out:-1 },
  { pts: [[0,50],[0,75]], level:SAN_LEVEL, out:-1 },
  { pts: [[-48,126],[-48,117],[-48,108]], level:NI_LEVEL, out:-1 },
];
// 遺構位置の詳しい測量がない堀切・竪堀は推定。道と曲輪を横切らない斜面に限定する。
export const DITCHES = [
  { pts:[[-125,133],[-69,133]], w:4, deep:2 },
  { pts:[[5,79],[17,92],[27,110]], w:2.8, deep:1.6 },
  { pts:[[-154,87],[-164,108],[-170,126]], w:2.8, deep:1.6 },
];

// 寄せ手（浅井・朝倉）の道（siege_ai.js の makeAttackAI）。入口は切岸の下の、取り付く所
export const ATTACK_ROUTES = [
  { id: 'ote', name: '大手の坂', entry: { x: -8, z: 30 }, defThickness: 2.4, pathLen: 110, chokeWidth: 3.4 },
  { id: 'ne', name: '北東の尾根', entry: { x: 12, z: 74 }, defThickness: 1.6, pathLen: 130, chokeWidth: 2.2 },
  { id: 'ura', name: '水の手の谷', entry: { x: -151, z: 112 }, defThickness: 1.2, pathLen: 250, chokeWidth: 2.4 },
];
