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

// castle_plan.js の形（kuruwa の多角形だけ）：惣構えの内を「町屋・侍町・主郭」の場に分け、
// siege_zones.js の区域（曲輪ごとに取ると次が開く流れ・HUD の表示）に使う。
// 壁・床・地形の造成は今まで通り b_arioka.js 側が手組みで作る（buildCastlePlan は skipWalls で壁を作らない）。
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }
export const MACHIYA_Z = [WALL_Z - 2, -46];        // 町屋（木戸に近い南寄り）
export const SAMURAI_Z = [-46, HON_MOAT_Z];        // 侍町（本丸に近い北寄り）
// 三つの砦（岸・上ろう塚・鵯塚）を「攻め落とせる区域」にする（docs/final7-1579-1582-spec.md 16〜29章）。
// 鵯塚砦＝惣構えの木戸と同じ場所で、実際に①で戦う場（F.g1・滝川の手）をそのまま区域にする（矩形・やや広め）。
// 岸・上ろう塚は惣構えの縁の砦そのもの（丸い区域）。盤面には出すが、戦うのは鵯塚砦の口だけ（遠景の二砦は
// 別働の織田勢が落とす出来事として進む＝b_arioka.js 側の仕事）。
export const HIYODORI_Z = [WALL_Z - 20, WALL_Z + 16];
export const TORIDE_R = 18;
export const ARIOKA_PLAN = {
  name: '有岡城', type: 'hira', year: 1579,
  kuruwa: [
    { id: 'hiyodori', name: '鵯塚砦', poly: rect(-40, HIYODORI_Z[0], 40, HIYODORI_Z[1]), level: (bf) => bf(0, WALL_Z) },
    { id: 'kishi', name: '岸の砦', poly: circle(0, SOKAKU_N, TORIDE_R), level: (bf) => bf(0, SOKAKU_N) },
    { id: 'joro', name: '上ろう塚砦', poly: circle(-SOKAKU_X, -60, TORIDE_R), level: (bf) => bf(-SOKAKU_X, -60) },
    { id: 'machiya', name: '町屋', poly: rect(-SOKAKU_X + 2, MACHIYA_Z[0], SOKAKU_X - 2, MACHIYA_Z[1]), level: (bf) => bf(0, (MACHIYA_Z[0] + MACHIYA_Z[1]) / 2) },
    { id: 'samuraimachi', name: '侍町', poly: rect(-SOKAKU_X + 2, SAMURAI_Z[0], SOKAKU_X - 2, SAMURAI_Z[1]), level: (bf) => bf(0, (SAMURAI_Z[0] + SAMURAI_Z[1]) / 2) },
    { id: 'honmaru', name: '主郭', poly: rect(-SOKAKU_X + 2, HON_Z, SOKAKU_X - 2, SOKAKU_N + 2), level: (bf) => bf(TENSHU_POS.x, TENSHU_POS.z) },
  ],
  // nawabari.js（束19）の表に使うだけの口・堀・櫓・道の束（b_arioka.js の塀・門・石垣・堀は今まで通り
  // 手組み。buildGates・buildTowers は渡さないので、ここに書いても建物は増えない＝読むだけで戦いは変わらない）
  koguchi: [
    { id: 'gate', name: GATE.name, from: 'out', to: 'hiyodori', kind: 'masu', gate: 'yaguramon', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 6, fireResistance: 0.2 },
    { id: 'hongap', name: '牢へ上る道の口', from: 'samuraimachi', to: 'honmaru', kind: 'hira', at: [(HON_GAP[0] + HON_GAP[1]) / 2, HON_Z], role: 'honmaru', maxFlow: 6, fireResistance: 0.1 },
  ],
  // 堀（切岸と堀）：地形の焼き・実の堀の見た目（b_arioka.js の MOAT_FNS・mizubori）とは別に、nawabari.js の
  // 表と terrain_tags.js の hori タグのためだけに同じ堀の線を持つ。'karabori' は horiboriHeight だけ（何も
  // 建てない）の形になる束なので、kind を 'mizubori' にして実の水堀をもう一つ建ててしまわないよう選ぶ
  hori: [
    { kind: 'karabori', pts: SOTO_MOAT_SEGS[0], w: SOTO_MOAT.width, deep: SOTO_MOAT.depth },
    { kind: 'karabori', pts: SOTO_MOAT_SEGS[1], w: SOTO_MOAT.width, deep: SOTO_MOAT.depth },
    { kind: 'karabori', pts: HON_MOAT_SEGS[0], w: HON_MOAT.width, deep: HON_MOAT.depth },
    { kind: 'karabori', pts: HON_MOAT_SEGS[1], w: HON_MOAT.width, deep: HON_MOAT.depth },
    { kind: 'karabori', pts: HON_W_MOAT_SEGS[0], w: HON_W_MOAT.width, deep: HON_W_MOAT.depth },
  ],
  yagura: [
    { id: 'sumi_w', kind: 'sumi', at: [-30, WALL_Z - 5] },
    { id: 'sumi_e', kind: 'sumi', at: [34, WALL_Z - 5] },
    { id: 'monomi_kishi', kind: 'monomi', at: [KISHI_TORIDE.x, KISHI_TORIDE.z] },
    { id: 'monomi_joro', kind: 'monomi', at: [JORO_TORIDE.x, JORO_TORIDE.z] },
  ],
};
