// ======================================================================
// castles/arioka.js … 有岡城の縄張り（docs/siege-plan.md 7-4／docs/castle-design.md 1-4・1-5・1-7）
// 惣構えの平城。南に惣構えの木戸（内応で開く）、その外に水堀と土橋。
// 本丸は台地の縁に打込接の石垣、その手前（町側）に水堀。牢へ上る道の口（石垣の切れ目）は
// 水堀も同じ所を切って、そのまま道が水堀をまたがず上がれるようにする（土橋を別に置かない）。
// ここは「人の大きさの城」の縄張りのデータだけ。地形・兵の配置・戦い方は b_arioka.js 側の仕事。
// 向き：北（-z）が本丸・奥。南（+z）に織田の陣。東西に惣構えの土塁。
// ======================================================================

export const WALL_Z = 20;                        // 惣構えの土塁と木戸（南）
export const GATE = { x: 0, z: WALL_Z, name: '惣構えの木戸' };
export const GATE_HALF = 3.5;                     // 木戸の開口の半幅

// 惣構えの水堀（木戸の外・南側）。木戸の正面だけ切って、土橋で渡す
export const SOTO_MOAT_Z = 30;
export const SOTO_MOAT_GAP = 4.5;                 // 土橋の口の半幅
export const SOTO_MOAT = { depth: 2.6, width: 8 };
export const SOTO_MOAT_SEGS = [
  [[-90, SOTO_MOAT_Z], [-SOTO_MOAT_GAP, SOTO_MOAT_Z]],
  [[SOTO_MOAT_GAP, SOTO_MOAT_Z], [90, SOTO_MOAT_Z]],
];
export const SOTO_BRIDGE = { a: [0, SOTO_MOAT_Z - 5.5], b: [0, SOTO_MOAT_Z + 5.5], w: 7 };

export const ROU = { x: -30, z: -96 };            // 牢（本丸の脇）
export const CAMP = { x: 4, z: 96 };              // 織田の陣

// 本丸の台地の縁（打込接の石垣）。牢へ上る道の口はここで切る（HON_GAP）
export const HON_Z = -84;
export const HON_GAP = [-46, -8];
export const HON_ISHIGAKI_SEGS = [
  [[-90, HON_Z], [HON_GAP[0], HON_Z]],
  [[HON_GAP[1], HON_Z], [90, HON_Z]],
];

// 本丸の水堀（石垣の手前・町側）。道の口（HON_GAP）はそのまま切って、水に入らず上がれる土橋代わりの地続きにする
export const HON_MOAT_Z = HON_Z + 6;
export const HON_MOAT = { depth: 2.2, width: 7 };
export const HON_MOAT_SEGS = [
  [[-90, HON_MOAT_Z], [HON_GAP[0], HON_MOAT_Z]],
  [[HON_GAP[1], HON_MOAT_Z], [90, HON_MOAT_Z]],
];

// 天守（石垣の上）
export const TENSHU_POS = { x: -8, z: -122 };
