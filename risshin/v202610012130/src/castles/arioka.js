// ======================================================================
// castles/arioka.js … 有岡城の縄張り（docs/final7-1579-1582-spec.md 16〜29章）
// 惣構えの平城。伊丹段丘の東の縁に主郭、東は低地。惣構え（東西約800m・南北約1,700mを縮尺）は
// 四方を堀と土塁で閉じ、開くのは南（鵯塚砦の木戸・内応で開く）だけ。北に岸の砦、西に上ろう塚砦。
// 主郭は台地の縁に打込接の石垣、その手前（町側）に水堀。牢へ上る道の口（石垣の切れ目）は
// 水堀も同じ所を切って、そのまま道が水堀をまたがず上がれるようにする（土橋を別に置かない）。
// 主郭の西にも堀を切り、道の両脇を区切る（西・南の二方向に人工の堀）。
// ここは「人の大きさの城」の縄張りのデータだけ。地形・兵の配置・戦い方は b_arioka.js 側の仕事。
// 向き：北（-z）が本丸・奥（＝史実の段丘の東の縁に当たる、台地の高い側）。南（+z）に織田の陣。
// 札（HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い）。画面には出さない
// ======================================================================
export const HIST = {
  dankyu: 'HIST_A',     // 伊丹段丘の縁・段差（地形そのもの）
  soukaku: 'HIST_B',    // 惣構えの範囲・堀と土塁（縮尺して再現）
  toride: 'HIST_B',     // 岸・上ろう塚・鵯塚の三砦（おおよその方角だけ合わせた位置）
  honmaru: 'HIST_B',    // 主郭の御殿・櫓・堀（発掘・絵図に沿った推定）
  tenshu: 'GAME_C',     // 三重天守の姿（確かな史料がないための補い）
  machiya: 'GAME_C',    // 町屋・侍町の並び（当時の町割りの推定の補い）
};

export const WALL_Z = 20;                        // 惣構えの土塁と木戸（南＝鵯塚砦）
export const GATE = { x: 0, z: WALL_Z, name: '鵯塚砦の木戸' };
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

// 惣構え全体の囲い（東西約800m・南北約1,700mを縮尺。四方を閉じ、開くのは南の木戸だけ）
export const SOKAKU_X = 95;      // 惣構えの東西の縁
export const SOKAKU_N = -150;    // 惣構えの北の縁
export const KISHI_TORIDE = { x: 0, z: SOKAKU_N, name: '岸の砦' };          // 北の砦
export const JORO_TORIDE = { x: -SOKAKU_X, z: -60, name: '上ろう塚砦' };    // 西の砦
export const HIYODORI_TORIDE = { x: 0, z: WALL_Z, name: '鵯塚砦' };         // 南の砦（惣構えの木戸と同じ場所）

// 主郭の西の人工の堀（牢へ上る道＝HON_GAP の西脇を区切る。西・南の二方向に堀を切る）
export const HON_W_MOAT_X = HON_GAP[0] - 6;
export const HON_W_MOAT = { depth: 2.0, width: 6 };
export const HON_W_MOAT_SEGS = [
  [[HON_W_MOAT_X, HON_Z - 1], [HON_W_MOAT_X, SOKAKU_N + 10]],
];
