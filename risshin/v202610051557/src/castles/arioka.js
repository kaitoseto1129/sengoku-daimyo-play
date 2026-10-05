// ======================================================================
// castles/arioka.js … 有岡城の縄張り（docs/final7-1579-1582-spec.md 16〜29章）
// 惣構えの平城。伊丹段丘の東の縁に主郭、東は低地。惣構え（東西約800m・南北約1,700mを実寸）は
// 西・北・南は堀と土塁、東は崖と土塁で閉じ、内応で開くのは西の上ろう塚の木戸。北に岸の砦、西に上ろう塚砦。
// 主郭は台地の縁に野面積みの石垣、その手前（町側）に水堀。牢へ上る道の口（石垣の切れ目）は
// 水堀も同じ所を切って、土橋の道を地続きで上がれるようにする。
// 伊丹市の解説に従い、主郭の人工の堀は西・南。北・東の堀は補わず、東の段丘で守る。
// ここは「人の大きさの城」の縄張りのデータだけ。地形・兵の配置・戦い方は b_arioka.js 側の仕事。
// 向き：北は -z、東は +x。主郭は中央〜東寄り、西に滝川の陣。
// 札（HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い）。画面には出さない
// ======================================================================
export const HIST = {
  dankyu: 'HIST_A',     // 伊丹段丘の縁・段差（地形そのもの）
  soukaku: 'HIST_B',    // 惣構えの範囲・堀と土塁（実寸で再現）
  toride: 'HIST_B',     // 岸・上ろう塚・鵯塚の三砦（おおよその方角だけ合わせた位置）
  honmaru: 'HIST_B',    // 主郭の御殿・櫓・堀（発掘・絵図に沿った推定）
  tenshu: 'HIST_B',     // 天守は置かず館を補う。建物の寸法は推定
  machiya: 'GAME_C',    // 町屋・侍町の並び（当時の町割りの推定の補い）
};

// 寸法は docs/layout-ref/castles.md の有岡に合わせ、人と同じ一メートル単位で扱う。
// 主郭の人工の堀は伊丹市の説明（西・南）を優先：
// https://www.city.itami.lg.jp/SOSIKI/TOSHIKATSURYOKU/BUNKA/bunnkazai/SINAI_BUNKAZAI/KUNI_SITEI/1386843388423.html
export const SCALE = 1;
export const WALL_Z = -107.5 + 1700 / 2;                        // 南の鵯塚砦（この任務では開かない）
export const SOKAKU_X = 800 * SCALE / 2;
export const SOKAKU_N = WALL_Z - 1700 * SCALE;
export const HON_SIZE = 170 * SCALE;
export const HON_X = SOKAKU_X - HON_SIZE / 2 - 3;
export const HON_CENTER_Z = (WALL_Z + SOKAKU_N) / 2;
export const HON_W = HON_X - HON_SIZE / 2;
export const HON_E = HON_X + HON_SIZE / 2;
export const HON_N = HON_CENTER_Z - HON_SIZE / 2;
export const HON_Z = HON_CENTER_Z + HON_SIZE / 2;
export const HON_GAP = [HON_W + 24, HON_W + 36];   // 南面の西寄り。堀の角から離して土橋の幅を保つ
export const HON_ENTRY_X = (HON_GAP[0] + HON_GAP[1]) / 2;
export const GATE = { x: -SOKAKU_X, z: HON_CENTER_Z, name: '上ろう塚の木戸' };
export const GATE_HALF = 3.5;
// 内応の口から辻までの歩行距離は保つ。城の寸法と局地の任務を分ける。
export const TOWN_X = GATE.x + 60;
export const TOWN_SOUTH_Z = 20;

// 主郭の堀は幅18m（資料の16〜20mの中ほど）・最大深さ7mを実寸で表す。
export const HON_MOAT = { depth: 7 * SCALE, width: 18 * SCALE };
export const HON_MOAT_Z = HON_Z + HON_MOAT.width / 2;
export const HON_APPROACH_Z = HON_Z + HON_MOAT.width + 14;
export const HON_MOAT_SEGS = [
  [[HON_W - HON_MOAT.width / 2, HON_MOAT_Z], [HON_GAP[0] - HON_MOAT.width / 2 - 1, HON_MOAT_Z]],
  [[HON_GAP[1] + HON_MOAT.width / 2 + 1, HON_MOAT_Z], [HON_E, HON_MOAT_Z]],
];
export const HON_W_MOAT_X = HON_W - HON_MOAT.width / 2;
export const HON_W_MOAT = HON_MOAT;
export const HON_W_MOAT_SEGS = [
  [[HON_W_MOAT_X, HON_MOAT_Z], [HON_W_MOAT_X, HON_N]],
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
export const CAMP = { x: GATE.x - 44, z: HON_CENTER_Z - 24 };

// 西の上ろう塚の木戸に土橋を残す。東面は猪名川側の崖、西・北は堀で囲う。
export const SOTO_MOAT_Z = WALL_Z + 10;
export const SOTO_MOAT_GAP = 4.5;
export const SOTO_MOAT = { depth: 2.6, width: 8 };
export const SOTO_MOAT_SEGS = [
  [[-SOKAKU_X - 5, SOTO_MOAT_Z], [SOKAKU_X, SOTO_MOAT_Z]],
  [[-SOKAKU_X - 5, SOTO_MOAT_Z], [-SOKAKU_X - 5, GATE.z + SOTO_MOAT_GAP]],
  [[-SOKAKU_X - 5, GATE.z - SOTO_MOAT_GAP], [-SOKAKU_X - 5, SOKAKU_N - 5], [SOKAKU_X, SOKAKU_N - 5]],
];
export const SOTO_BRIDGE = { a: [-SOKAKU_X - 10.5, GATE.z], b: [-SOKAKU_X + 0.5, GATE.z], w: 7 };
export const KISHI_TORIDE = { x: 0, z: SOKAKU_N, name: '岸の砦' };
export const JORO_TORIDE = { x: -SOKAKU_X, z: HON_CENTER_Z, name: '上ろう塚砦' };
export const HIYODORI_TORIDE = { x: 0, z: WALL_Z, name: '鵯塚砦' };
// 砦の内部は遺構の方角に沿う推定。惣構えの内側へ寄せ、外堀と重ねない。
// 上ろう塚は西・東に口を空け、内応後の往来を保つ。ほかの砦は町側の口。
export const TORIDE_WORKS = [
  { id: 'kishi', name: '岸の砦', x0: -16, x1: 16, z0: SOKAKU_N + 3, z1: SOKAKU_N + 25, side: 'south' },
  { id: 'joro', name: '上ろう塚砦', x0: -SOKAKU_X + 3, x1: -SOKAKU_X + 23, z0: GATE.z - 20, z1: GATE.z + 20, side: 'cross' },
  { id: 'hiyodori', name: '鵯塚砦', x0: -18, x1: 18, z0: WALL_Z - 26, z1: WALL_Z - 3, side: 'north' },
];
export const ARIOKA_ROADS = [
  [[GATE.x - 50, GATE.z], [GATE.x, GATE.z], [TOWN_X - 24, GATE.z], [TOWN_X - 12, -70], [TOWN_X, -14]],
  [[TOWN_X - 12, -70], [HON_ENTRY_X, HON_APPROACH_Z], [HON_ENTRY_X, HON_Z - 6], [ROU.x, ROU.z + 4]],
  [[0, WALL_Z - 26], [0, -46], [0, GATE.z], [0, SOKAKU_N + 25]],
  [[TOWN_X - 24, GATE.z], [0, GATE.z], [8, HON_N - 13]],
  [[TOWN_X, -14], [TOWN_X, -46], [TOWN_X, GATE.z], [TOWN_X, -202]],
];


// castle_plan.js の形（kuruwa の多角形だけ）：惣構えの内を「町屋・侍町・主郭」の場に分け、
// siege_zones.js の区域（曲輪ごとに取ると次が開く流れ・HUD の表示）に使う。
// 壁・床・地形の造成は今まで通り b_arioka.js 側が手組みで作る（buildCastlePlan は skipWalls で壁を作らない）。
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
export const MACHIYA_Z = [WALL_Z - 2, -46];        // 町屋（木戸に近い南寄り）
export const SAMURAI_Z = [-46, SOKAKU_N + 2];    // 侍町は岸の砦まで。本丸とその堀は別の区域
// 三砦の区域は実際に囲った平場と一致させる。内応の口は上ろう塚で、南の鵯塚へ移さない。
export const ARIOKA_PLAN = {
  name: '有岡城', type: 'hira', year: 1579,
  kuruwa: [
    ...TORIDE_WORKS.map((t) => ({ id: t.id, name: t.name, poly: rect(t.x0, t.z0, t.x1, t.z1), level: (bf) => bf((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2) })),
    { id: 'machiya', name: '町屋', poly: rect(-SOKAKU_X + 2, MACHIYA_Z[0], SOKAKU_X - 2, MACHIYA_Z[1]), level: (bf) => bf(0, (MACHIYA_Z[0] + MACHIYA_Z[1]) / 2) },
    { id: 'samuraimachi', name: '侍町', poly: [[-SOKAKU_X + 2, SAMURAI_Z[0]], [SOKAKU_X - 2, SAMURAI_Z[0]], [SOKAKU_X - 2, HON_Z + HON_MOAT.width + 1], [HON_W - HON_MOAT.width - 1, HON_Z + HON_MOAT.width + 1], [HON_W - HON_MOAT.width - 1, HON_N - 2], [SOKAKU_X - 2, HON_N - 2], [SOKAKU_X - 2, SAMURAI_Z[1]], [-SOKAKU_X + 2, SAMURAI_Z[1]]], level: (bf) => bf(0, (SAMURAI_Z[0] + SAMURAI_Z[1]) / 2) },
    { id: 'honmaru', name: '主郭', poly: rect(HON_W, HON_N, HON_E, HON_Z), level: (bf) => bf(TENSHU_POS.x, TENSHU_POS.z) },
  ],
  // nawabari.js（束19）の表に使うだけの口・堀・櫓・道の束（b_arioka.js の塀・門・石垣・堀は今まで通り
  // 手組み。buildGates・buildTowers は渡さないので、ここに書いても建物は増えない＝読むだけで戦いは変わらない）
  koguchi: [
    { id: 'gate', name: GATE.name, from: 'out', to: 'joro', kind: 'hira', gate: 'yaguramon', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 6, fireResistance: 0.2 },
    { id: 'hongap', name: '主郭の木戸', from: 'samuraimachi', to: 'honmaru', kind: 'hira', at: [(HON_GAP[0] + HON_GAP[1]) / 2, HON_Z], role: 'honmaru', maxFlow: 6, fireResistance: 0.1 },
    { id: 'kishikido', name: '岸の砦の木戸', from: 'samuraimachi', to: 'kishi', kind: 'hira', gate: 'kabuki', at: [0, SOKAKU_N + 25], maxFlow: 6 },
    { id: 'hiyodorikido', name: '鵯塚砦の木戸', from: 'machiya', to: 'hiyodori', kind: 'hira', gate: 'kabuki', at: [0, WALL_Z - 26], maxFlow: 6 },
    { id: 'machikido', name: '町の木戸', from: 'machiya', to: 'samuraimachi', kind: 'hira', gate: 'kabuki', at: [TOWN_X, MACHIYA_Z[1]], role: 'ote', maxFlow: 8, fireResistance: 0.2 },
  ],
  paths: ARIOKA_ROADS.map((pts) => ({ pts, w: 4 })),
  // 堀（切岸と堀）：地形の焼き・実の堀の見た目（b_arioka.js の MOAT_FNS・mizubori）とは別に、nawabari.js の
  // 表と terrain_tags.js の hori タグのためだけに同じ堀の線を持つ。'karabori' は horiboriHeight だけ（何も
  // 建てない）の形になる束なので、kind を 'mizubori' にして実の水堀をもう一つ建ててしまわないよう選ぶ
  hori: [
    ...SOTO_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: SOTO_MOAT.width, deep: SOTO_MOAT.depth })),
    ...HON_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: HON_MOAT.width, deep: HON_MOAT.depth })),
    ...HON_W_MOAT_SEGS.map((pts) => ({ kind: 'karabori', pts, w: HON_W_MOAT.width, deep: HON_W_MOAT.depth })),
  ],
  yagura: [
    { id: 'sumi_w', kind: 'monomi', at: [-30, WALL_Z - 5] },
    { id: 'sumi_e', kind: 'monomi', at: [34, WALL_Z - 5] },
    { id: 'sumi_sw', kind: 'monomi', at: [-SOKAKU_X + 4, WALL_Z - 4] },
    { id: 'sumi_se', kind: 'monomi', at: [SOKAKU_X - 4, WALL_Z - 4] },
    { id: 'sumi_nw', kind: 'monomi', at: [-SOKAKU_X + 4, SOKAKU_N + 4] },
    { id: 'sumi_ne', kind: 'monomi', at: [SOKAKU_X - 4, SOKAKU_N + 4] },
    { id: 'monomi_kishi', kind: 'monomi', at: [10, SOKAKU_N + 10] },
    { id: 'monomi_joro', kind: 'monomi', at: [JORO_TORIDE.x + 5, JORO_TORIDE.z - 12] },
    { id: 'monomi_honmaru', kind: 'monomi', at: [HON_E - 3, HON_Z - 4] },
    { id: 'monomi_hiyodori', kind: 'monomi', at: [9, WALL_Z - 11] },
  ],
};
