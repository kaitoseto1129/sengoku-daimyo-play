// ======================================================================
// castles/arioka.js … 有岡城の縄張り（docs/final7-1579-1582-spec.md 16〜29章）
// 惣構えの平城。伊丹段丘の東の縁に主郭、東は低地。惣構え（東西約800m・南北約1,700mを縮尺）は
// 西・北・南は堀と土塁、東は崖と土塁で閉じ、内応で開くのは西の上ろう塚の木戸。北に岸の砦、西に上ろう塚砦。
// 主郭は台地の縁に野面積みの石垣、その手前（町側）に水堀。牢へ上る道の口（石垣の切れ目）は
// 水堀も同じ所を切って、そのまま道が水堀をまたがず上がれるようにする（土橋を別に置かない）。
// 主郭は四方を堀で囲い、南面の坂の所だけ堀と石垣を切る。
// ここは「人の大きさの城」の縄張りのデータだけ。地形・兵の配置・戦い方は b_arioka.js 側の仕事。
// 向き：北は -z、東は +x。主郭は中央〜東寄り、西に滝川の陣。
// 札（HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い）。画面には出さない
// ======================================================================
export const HIST = {
  dankyu: 'HIST_A',     // 伊丹段丘の縁・段差（地形そのもの）
  soukaku: 'HIST_B',    // 惣構えの範囲・堀と土塁（縮尺して再現）
  toride: 'HIST_B',     // 岸・上ろう塚・鵯塚の三砦（おおよその方角だけ合わせた位置）
  honmaru: 'HIST_B',    // 主郭の御殿・櫓・堀（発掘・絵図に沿った推定）
  tenshu: 'HIST_B',     // 天守は置かず館を補う。建物の寸法は推定
  machiya: 'GAME_C',    // 町屋・侍町の並び（当時の町割りの推定の補い）
};

// 寸法は docs/layout-ref/castles.md の有岡に合わせ、全て同じ縮尺にする。
export const SCALE = 0.15;
export const WALL_Z = 20;                        // 南の鵯塚砦（この任務では開かない）
export const SOKAKU_X = 800 * SCALE / 2;
export const SOKAKU_N = WALL_Z - 1700 * SCALE;
export const HON_SIZE = 170 * SCALE;
export const HON_X = SOKAKU_X - HON_SIZE / 2 - 3;
export const HON_CENTER_Z = (WALL_Z + SOKAKU_N) / 2;
export const HON_W = HON_X - HON_SIZE / 2;
export const HON_E = HON_X + HON_SIZE / 2;
export const HON_N = HON_CENTER_Z - HON_SIZE / 2;
export const HON_Z = HON_CENTER_Z + HON_SIZE / 2;
export const HON_GAP = [HON_W + 2, HON_W + 14];   // 南面の西寄りに閉じた主郭の木戸を置く
export const HON_ENTRY_X = (HON_GAP[0] + HON_GAP[1]) / 2;
export const GATE = { x: -SOKAKU_X, z: HON_CENTER_Z, name: '上ろう塚の木戸' };
export const GATE_HALF = 3.5;

// 主郭の堀は幅18m（資料の16〜20mの中ほど）・最大深さ7mを同じ縮尺で表す。
export const HON_MOAT = { depth: 7 * SCALE, width: 18 * SCALE };
export const HON_MOAT_Z = HON_Z + HON_MOAT.width / 2;
export const HON_MOAT_SEGS = [
  [[HON_W - HON_MOAT.width, HON_MOAT_Z], [HON_GAP[0] - 2, HON_MOAT_Z]],
  [[HON_GAP[1] + 2, HON_MOAT_Z], [HON_E + HON_MOAT.width, HON_MOAT_Z]],
  [[HON_W - HON_MOAT.width, HON_N - HON_MOAT.width / 2], [HON_E + HON_MOAT.width, HON_N - HON_MOAT.width / 2]],
  [[HON_E + HON_MOAT.width / 2, HON_N], [HON_E + HON_MOAT.width / 2, HON_Z]],
];
export const HON_W_MOAT_X = HON_W - HON_MOAT.width / 2;
export const HON_W_MOAT = HON_MOAT;
export const HON_W_MOAT_SEGS = [
  [[HON_W_MOAT_X, HON_Z], [HON_W_MOAT_X, HON_N]],
];
export const HON_ISHIGAKI_SEGS = [
  [[HON_W, HON_Z], [HON_GAP[0], HON_Z]],
  [[HON_GAP[1], HON_Z], [HON_E, HON_Z]],
  [[HON_E, HON_Z], [HON_E, HON_N]],
  [[HON_E, HON_N], [HON_W, HON_N]],
  [[HON_W, HON_N], [HON_W, HON_Z]],
];
export const ROU = { x: HON_ENTRY_X, z: HON_CENTER_Z + 1 };
export const TENSHU_POS = { x: HON_X + 5, z: HON_CENTER_Z - 5 };
export const CAMP = { x: -104, z: HON_CENTER_Z - 24 };

// 西の上ろう塚の木戸に土橋を残す。東面は猪名川側の崖、西・北は堀で囲う。
export const SOTO_MOAT_Z = 30;
export const SOTO_MOAT_GAP = 4.5;
export const SOTO_MOAT = { depth: 2.6, width: 8 };
export const SOTO_MOAT_SEGS = [
  [[-SOKAKU_X - 5, SOTO_MOAT_Z], [-SOTO_MOAT_GAP, SOTO_MOAT_Z]],
  [[SOTO_MOAT_GAP, SOTO_MOAT_Z], [SOKAKU_X, SOTO_MOAT_Z]],
  [[-SOKAKU_X - 5, SOTO_MOAT_Z], [-SOKAKU_X - 5, GATE.z + SOTO_MOAT_GAP]],
  [[-SOKAKU_X - 5, GATE.z - SOTO_MOAT_GAP], [-SOKAKU_X - 5, SOKAKU_N - 5], [SOKAKU_X, SOKAKU_N - 5]],
];
export const SOTO_BRIDGE = { a: [-SOKAKU_X - 10.5, GATE.z], b: [-SOKAKU_X + 0.5, GATE.z], w: 7 };
export const KISHI_TORIDE = { x: 0, z: SOKAKU_N, name: '岸の砦' };
export const JORO_TORIDE = { x: -SOKAKU_X, z: HON_CENTER_Z, name: '上ろう塚砦' };
export const HIYODORI_TORIDE = { x: 0, z: WALL_Z, name: '鵯塚砦' };

// castle_plan.js の形（kuruwa の多角形だけ）：惣構えの内を「町屋・侍町・主郭」の場に分け、
// siege_zones.js の区域（曲輪ごとに取ると次が開く流れ・HUD の表示）に使う。
// 壁・床・地形の造成は今まで通り b_arioka.js 側が手組みで作る（buildCastlePlan は skipWalls で壁を作らない）。
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }
export const MACHIYA_Z = [WALL_Z - 2, -46];        // 町屋（木戸に近い南寄り）
export const SAMURAI_Z = [-46, HON_MOAT_Z + HON_MOAT.width / 2];        // 侍町（本丸に近い北寄り）
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
    { id: 'joro', name: '上ろう塚砦', poly: circle(JORO_TORIDE.x, JORO_TORIDE.z, TORIDE_R), level: (bf) => bf(JORO_TORIDE.x, JORO_TORIDE.z) },
    { id: 'machiya', name: '町屋', poly: rect(-SOKAKU_X + 2, MACHIYA_Z[0], SOKAKU_X - 2, MACHIYA_Z[1]), level: (bf) => bf(0, (MACHIYA_Z[0] + MACHIYA_Z[1]) / 2) },
    { id: 'samuraimachi', name: '侍町', poly: rect(-SOKAKU_X + 2, SAMURAI_Z[0], SOKAKU_X - 2, SAMURAI_Z[1]), level: (bf) => bf(0, (SAMURAI_Z[0] + SAMURAI_Z[1]) / 2) },
    { id: 'honmaru', name: '主郭', poly: rect(HON_W, HON_N, HON_E, HON_Z), level: (bf) => bf(TENSHU_POS.x, TENSHU_POS.z) },
  ],
  // nawabari.js（束19）の表に使うだけの口・堀・櫓・道の束（b_arioka.js の塀・門・石垣・堀は今まで通り
  // 手組み。buildGates・buildTowers は渡さないので、ここに書いても建物は増えない＝読むだけで戦いは変わらない）
  koguchi: [
    { id: 'gate', name: GATE.name, from: 'out', to: 'joro', kind: 'masu', gate: 'yaguramon', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 6, fireResistance: 0.2 },
    { id: 'hongap', name: '主郭の木戸', from: 'samuraimachi', to: 'honmaru', kind: 'hira', at: [(HON_GAP[0] + HON_GAP[1]) / 2, HON_Z], role: 'honmaru', maxFlow: 6, fireResistance: 0.1 },
    { id: 'machikido', name: '町の木戸', from: 'machiya', to: 'samuraimachi', kind: 'hira', gate: 'kabuki', at: [0, MACHIYA_Z[1]], role: 'ote', maxFlow: 8, fireResistance: 0.2 },
  ],
  // 堀（切岸と堀）：地形の焼き・実の堀の見た目（b_arioka.js の MOAT_FNS・mizubori）とは別に、nawabari.js の
  // 表と terrain_tags.js の hori タグのためだけに同じ堀の線を持つ。'karabori' は horiboriHeight だけ（何も
  // 建てない）の形になる束なので、kind を 'mizubori' にして実の水堀をもう一つ建ててしまわないよう選ぶ
  hori: [
    ...SOTO_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: SOTO_MOAT.width, deep: SOTO_MOAT.depth })),
    ...HON_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: HON_MOAT.width, deep: HON_MOAT.depth })),
    ...HON_W_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: HON_W_MOAT.width, deep: HON_W_MOAT.depth })),
  ],
  yagura: [
    { id: 'sumi_w', kind: 'sumi', at: [-30, WALL_Z - 5] },
    { id: 'sumi_e', kind: 'sumi', at: [34, WALL_Z - 5] },
    { id: 'sumi_sw', kind: 'sumi', at: [-SOKAKU_X + 4, WALL_Z - 4] },
    { id: 'sumi_se', kind: 'sumi', at: [SOKAKU_X - 4, WALL_Z - 4] },
    { id: 'sumi_nw', kind: 'sumi', at: [-SOKAKU_X + 4, SOKAKU_N + 4] },
    { id: 'sumi_ne', kind: 'sumi', at: [SOKAKU_X - 4, SOKAKU_N + 4] },
    { id: 'monomi_kishi', kind: 'monomi', at: [KISHI_TORIDE.x, KISHI_TORIDE.z] },
    { id: 'monomi_joro', kind: 'monomi', at: [JORO_TORIDE.x, JORO_TORIDE.z] },
  ],
};
