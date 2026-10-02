// ======================================================================
// castles/hiei1571.js … 元亀二年（1571）の比叡山：坂本〜本坂〜文殊楼〜東塔（根本中堂）〜西塔〜横川（データだけ）
// docs/hiei-1571-spec.md（kaito 10/1）の第一〜第三段階（61章）。三塔は一つの広場に置かない（2・44章）。
// 西塔は東塔から約1km（19〜25章）。横川は西塔からさらに約4km、長い山道の先（26〜32章）。
// 地形は terrain_hiei.js の広域の標高（国土地理院）を 1/10 に縮めて切り出す（宇佐山の志賀の陣と同じ土地）。
// 堂は造成した平場（TERRACES）に置き、道（PATHS）は斜面を切って通す（33〜34章）。城の物（天守・櫓・石垣・枡形・堀）は置かない（36〜39章）。
// 建物ごとに史実の確度の札（hist：HIST_A・HIST_B・GAME_C。62章）を持たせる。今の延暦寺の建物の姿は写さない（58章）。
// ローカル座標：x＝東+（琵琶湖・坂本）、z＝南+。西へ登ると東塔、さらに西が西塔。
// ======================================================================
import { hieiWindow } from '../terrain_hiei.js';

// 切り出し：坂本と西塔が両端に収まる所を原点に、1/10 に縮める。高さは 1/9（少しだけ強めて山らしく）
export const WIN = hieiWindow({ lat: 35.0700, lon: 135.8460, xy: 10, vs: 1 / 9 });

// ---- 名所（ゲームの座標） ----
export const P = {
  spawn: { x: 168, z: 6 },                    // 坂本の東の外れ（湖の側）。根本中堂の前には出さない（46章）
  sakamoto: { x: 156, z: 4 },                 // 坂本の里
  hiyoshi: { x: 140, z: -24 },                // 日吉社（山王）の社殿
  trailhead: { x: 124, z: 2 },                // 本坂の登り口
  switch1: { x: 86, z: 9 },                   // 一つ目のつづら折り
  midHall: { x: 40, z: -12 },                 // 中腹の小堂（平場）
  branch: { x: 44, z: -2 },                   // 無動寺谷への分かれ道
  forest: { x: 10, z: -8 },                   // 杉林
  stairsFoot: { x: 2, z: -6 },                // 文殊楼の石段の下
  monjuro: { x: -17, z: -6 },                 // 文殊楼（東塔の入口）
  chumon: { x: -28, z: -5 },                  // 根本中堂の中門
  court: { x: -38, z: -5 },                   // 中庭
  chudo: { x: -55, z: -5 },                   // 根本中堂
  daikodo: { x: -50, z: -35 },                // 大講堂
  shoro: { x: -33, z: -31 },                  // 東塔の鐘楼
  westGate: { x: -76, z: -21 },               // 西塔へ続く山道の口（P4 の行き先）
  jodoin: { x: -96, z: -33 },                 // 浄土院
  saito: { x: -130, z: -44 },                 // 西塔（釈迦堂の前身）
  rurido: { x: -156, z: -80 },                // 瑠璃堂
  ninaido: { x: -115, z: -44 },               // にない堂（常行堂・法華堂）
  yokawaGate: { x: -112, z: -95 },            // 西塔から横川への山道の分かれ（第三段階の口）
  yokawa: { x: -94, z: -228 },                // 横川中堂（前身。西塔から約4km、長い山道の先）
  shikikodo: { x: -86, z: -220 },             // 四季講堂
};

// ---- 道（42章の階層。w は道の半分の幅） ----
//   L1 主の参道（坂本の通り・本坂）／L2 三塔をつなぐ道／L3 谷へ下る山道／L4 僧坊の間の小道
export const PATHS = [
  { id: 'sakamoto', lv: 1, w: 3.0, name: '坂本の通り', pts: [[184, 7], [170, 7], [158, 5], [146, 4], [134, 3], [124, 2]] },
  { id: 'hiyoshi', lv: 4, w: 1.8, name: '日吉社への参道', pts: [[150, 5], [148, -6], [143, -16], [141, -20]] },
  // 本坂：狭い道（横2〜3人）と少し広い所（横5〜8人）が混じる。つづら折り二つ、杉林、石段（6章）
  { id: 'honzaka', lv: 1, w: 1.7, name: '本坂', pts: [
    [124, 2], [114, 1], [104, -1], [97, 0],
    [90, 9], [84, 11], [80, 2], [77, -9], [73, -13], [69, -5], [64, 0],
    [56, -2], [48, -4], [40, -4], [30, -6], [22, -4],
    [14, -10], [8, -12], [4, -8], [2, -6],
    [-4, -6], [-11, -6], [-17, -6],
  ] },
  { id: 'todo', lv: 1, w: 2.4, sm: 1, name: '東塔の参道', pts: [[-17, -6], [-24, -5], [-28, -5], [-38, -5], [-46, -5]] },
  { id: 'todo_n', lv: 4, w: 1.5, name: '大講堂への小道', pts: [[-18, -11], [-21, -18], [-28, -25], [-38, -29], [-46, -27]] },
  { id: 'todo_s', lv: 4, w: 1.3, name: '南谷への小道', pts: [[-18, -1], [-21, 8], [-28, 16], [-34, 22]] },
  { id: 'todo_e', lv: 3, w: 1.2, name: '東谷への小道', pts: [[-10, -6], [-6, -14], [-2, -22], [0, -28]] },
  // 西塔へ（L2）。浄土院のそばを通る。東塔とは 1km ほど離れている（20・44章）
  { id: 'saito', lv: 2, w: 1.6, name: '西塔への山道', pts: [[-38, -29], [-50, -24], [-60, -22], [-70, -20], [-76, -21], [-86, -27], [-96, -30], [-108, -37], [-120, -41], [-130, -44]] },
  { id: 'rurido', lv: 3, w: 1.1, name: '瑠璃堂への谷道', pts: [[-132, -46], [-140, -58], [-148, -70], [-156, -79]] },
  // 無動寺谷へ下る道（L3）。主戦場から外れた別の道（18章：一本道でない事を見せる）
  { id: 'mudoji', lv: 3, w: 1.2, name: '無動寺谷への道', pts: [[44, -2], [46, 12], [42, 26], [34, 40], [30, 56], [26, 72]] },
  // 西塔→横川（L2）。尾根・谷・分岐を経る長い山道。東塔→西塔（約1km）より明確に長く見せる（26・44章）
  { id: 'yokawa', lv: 2, w: 1.4, sm: 6, name: '横川への山道', pts: [
    [-126, -33], [-118, -50], [-112, -68], [-108, -86], [-110, -104],
    [-106, -124], [-100, -144], [-96, -164], [-92, -184], [-90, -204], [-94, -228],
  ] },
  // 横川六谷（32章：般若・香芳・戒心・解脱・兜率・飯室）。外周の細い山道。全部をメインルートにしない
  { id: 'hannyadani', lv: 3, w: 0.9, name: '般若谷への道', pts: [[-94, -228], [-84, -236], [-76, -244]] },
  { id: 'kogadani', lv: 3, w: 0.9, name: '香芳谷への道', pts: [[-90, -216], [-78, -214], [-68, -210]] },
  { id: 'kaishindani', lv: 3, w: 0.9, name: '戒心谷への道', pts: [[-98, -236], [-104, -248], [-110, -260]] },
  { id: 'gedatsudani', lv: 3, w: 0.9, name: '解脱谷への道', pts: [[-104, -220], [-116, -222], [-126, -220]] },
  { id: 'tosotsudani', lv: 3, w: 0.9, name: '兜率谷への道', pts: [[-88, -240], [-86, -254], [-82, -268]] },
  { id: 'iimurodani', lv: 3, w: 0.9, name: '飯室谷への道', pts: [[-80, -224], [-66, -228], [-54, -232]] },
];
export const pathById = (id) => PATHS.find((p) => p.id === id);

// ---- 造成した平場（33〜34章）。lv：平場の高さ（無ければ真ん中の地面＋rise）。edge：法面の幅 ----
export const TERRACES = [
  // 坂本・日吉社
  { id: 'hiyoshi', x: 140, z: -22, w: 16, d: 12, rot: 0, rise: 0.4, edge: 3 },
  // 本坂の途中
  { id: 'midHall', x: 40, z: -13, w: 14, d: 9, rot: 0, rise: 0.2, edge: 2.5 },
  { id: 'midBo', x: 31, z: 7.5, w: 20, d: 10, rot: 0.2, rise: 0.2, edge: 2.5 },
  // 東塔
  { id: 'monjuro', x: -17, z: -6, w: 10, d: 14, rot: 0, lv: 59.5, edge: 2.5 },
  { id: 'court', x: -45, z: -5, w: 40, d: 34, rot: 0, lv: 65.2, edge: 3 },
  { id: 'daikodo', x: -50, z: -35, w: 28, d: 16, rot: 0, lv: 63, edge: 3 },
  { id: 'shoro', x: -33, z: -31, w: 8, d: 8, rot: 0, lv: 63.4, edge: 2 },
  { id: 'kaidan', x: -21, z: -30, w: 11, d: 10, rot: 0.1, rise: 0.3, edge: 2.5 },
  { id: 'kyozo', x: -68, z: -10, w: 9, d: 9, rot: 0, rise: 0.2, edge: 2 },
  // 僧坊の平場（谷ごとに小さく、不規則に）
  { id: 'kitadani1', x: -44, z: -50, w: 16, d: 10, rot: 0.25, rise: 0.2, edge: 2.5 },
  { id: 'kitadani2', x: -62, z: -58, w: 18, d: 12, rot: -0.2, rise: 0.2, edge: 2.5 },
  { id: 'higashidani1', x: -2, z: -26, w: 14, d: 9, rot: 0.4, rise: 0.2, edge: 2.5 },
  { id: 'minamidani1', x: -30, z: 20, w: 18, d: 10, rot: -0.15, rise: 0.2, edge: 2.5 },
  { id: 'minamidani2', x: -48, z: 27, w: 12, d: 9, rot: 0.3, rise: 0.2, edge: 2.5 },
  { id: 'nishidani1', x: -80, z: 2, w: 20, d: 14, rot: 0.1, rise: 0.2, edge: 2.5 },
  // 西塔（第二段階の入口まで）
  { id: 'jodoin', x: -96, z: -34, w: 12, d: 10, rot: 0.3, rise: 0.2, edge: 2.5 },
  { id: 'ninaido', x: -115, z: -44, w: 12, d: 22, rot: 0.15, rise: 0.2, edge: 2.5 },
  { id: 'shakado', x: -132, z: -44, w: 18, d: 21, rot: 0, rise: 0.3, edge: 3 },
  { id: 'saitoBo', x: -140, z: -28, w: 16, d: 10, rot: -0.3, rise: 0.2, edge: 2.5 },
  { id: 'rurido', x: -156, z: -80, w: 9, d: 9, rot: 0.2, rise: 0.2, edge: 2 },
  // 横川（第三段階。谷と一体の斜面に段状平場。東塔・西塔より平場が小さく分散する＝26〜28章）
  { id: 'yokawa_chudo', x: -94, z: -228, w: 22, d: 16, rot: 0.1, rise: 0.3, edge: 3 },
  { id: 'shikikodo', x: -86, z: -220, w: 14, d: 10, rot: -0.1, rise: 0.2, edge: 2.5 },
  { id: 'eshindo', x: -108, z: -238, w: 10, d: 8, rot: 0.2, rise: 0.2, edge: 2.5 },
];

// ---- 建物（62章の札つき）。kind は temple1571.js の形。dist：描くまとまり（遠い物は影を落とさない・軽い作り） ----
//   rot は正面（+z）をどちらへ向けるか（π/2 で東 +x、-π/2 で西）
const E = Math.PI / 2, Wd = -Math.PI / 2, S = 0, N = Math.PI;
export const BUILDINGS = [
  // ===== ZONE0 坂本・日吉社（5章）=====
  { id: 'hiyoshi_honden', name: '日吉社の社殿', kind: 'honden', hist: 'HIST_B', x: 140, z: -25, rot: S, w: 9, d: 6, dist: 'sakamoto' },
  { id: 'hiyoshi_sessha', name: '日吉社の摂社', kind: 'hokora', hist: 'HIST_B', x: 133, z: -20, rot: E, w: 3, d: 3, dist: 'sakamoto' },
  { id: 'hiyoshi_torii', name: '日吉社の鳥居', kind: 'torii', hist: 'HIST_B', x: 148, z: -4, rot: S, w: 5, d: 1, dist: 'sakamoto', noBurn: true },
  { id: 'satobo_1', name: '坂本の里坊', kind: 'sobo', var: 1, hist: 'HIST_B', x: 152, z: -10, rot: E, w: 8, d: 6, dist: 'sakamoto', cl: 'sakamoto_n' },
  { id: 'satobo_2', name: '坂本の里坊', kind: 'sobo', var: 2, hist: 'HIST_B', x: 162, z: -9, rot: S, w: 7, d: 6, dist: 'sakamoto', cl: 'sakamoto_n' },
  { id: 'satobo_3', name: '坂本の里坊', kind: 'sobo', var: 0, hist: 'HIST_B', x: 131, z: -9, rot: E, w: 7, d: 5.5, dist: 'sakamoto', cl: 'sakamoto_n' },
  { id: 'minka_1', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 144, z: 13, rot: N, w: 6.5, d: 5, dist: 'sakamoto', cl: 'sakamoto_s' },
  { id: 'minka_2', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 152, z: 15, rot: N, w: 6, d: 5, dist: 'sakamoto', cl: 'sakamoto_s' },
  { id: 'minka_3', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 161, z: 14, rot: N + 0.1, w: 7, d: 5, dist: 'sakamoto', cl: 'sakamoto_s' },
  { id: 'minka_4', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 170, z: 16, rot: N, w: 6, d: 5, dist: 'sakamoto', cl: 'sakamoto_s' },
  { id: 'minka_5', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 176, z: -6, rot: S, w: 6, d: 5, dist: 'sakamoto', cl: 'sakamoto_n' },
  { id: 'minka_6', name: '坂本の家', kind: 'minka', hist: 'GAME_C', x: 135, z: 12, rot: N - 0.15, w: 5.5, d: 4.5, dist: 'sakamoto', cl: 'sakamoto_s' },
  { id: 'kura_sakamoto', name: '坂本の倉', kind: 'kura', hist: 'GAME_C', x: 157, z: 21, rot: N, w: 4.5, d: 4, dist: 'sakamoto', cl: 'sakamoto_s' },

  // ===== ZONE1 本坂（6章）=====
  { id: 'hokora_1', name: '道の祠', kind: 'hokora', hist: 'GAME_C', x: 92, z: 13, rot: E, w: 1.6, d: 1.4, dist: 'path' },
  { id: 'hokora_2', name: '道の祠', kind: 'hokora', hist: 'GAME_C', x: 18, z: -1, rot: S, w: 1.6, d: 1.4, dist: 'path' },
  { id: 'mid_hall', name: '中腹の小堂', kind: 'do', hist: 'GAME_C', x: 40, z: -14, rot: S, w: 7, d: 5.5, h: 2.9, dist: 'path', cl: 'mid' },
  { id: 'mid_bo_1', name: '中腹の僧坊', kind: 'sobo', var: 0, hist: 'GAME_C', x: 27, z: 6, rot: N + 0.2, w: 6.5, d: 5, dist: 'path', cl: 'mid' },
  { id: 'mid_bo_2', name: '中腹の僧坊', kind: 'sobo', var: 2, hist: 'GAME_C', x: 35, z: 9, rot: N + 0.2, w: 5.5, d: 4.5, dist: 'path', cl: 'mid' },
  { id: 'mid_kura', name: '中腹の倉', kind: 'kura', hist: 'GAME_C', x: 49, z: -15, rot: S, w: 3.5, d: 3, dist: 'path', cl: 'mid' },
  { id: 'haka_1', name: '墓所', kind: 'haka', hist: 'GAME_C', x: 56, z: 9, rot: N, w: 6, d: 4, dist: 'path', noBurn: true },
  { id: 'temporary_watch_platform', name: '見張り台（番所）', kind: 'bansho', hist: 'GAME_C', x: 55, z: -12, rot: E, w: 2.4, d: 2.4, dist: 'path' },

  // ===== ZONE2 東塔（8〜17章）=====
  { id: 'monjuro_1571', name: '文殊楼', kind: 'romon', hist: 'HIST_A', x: -17, z: -6, rot: E, w: 6.4, d: 4, dist: 'todo', slow: 1.5 },
  { id: 'konponchudo_chumon', name: '根本中堂の中門', kind: 'chumon', hist: 'HIST_A', x: -28, z: -5, rot: E, w: 5, d: 3.4, dist: 'todo', cl: 'chudo' },
  { id: 'konponchudo_kairo', name: '根本中堂の廻廊', kind: 'kairo', hist: 'HIST_A', x: -38, z: -5, rot: E, w: 24, d: 20, dist: 'todo', cl: 'chudo', slow: 2 },
  { id: 'konponchudo_1571', name: '根本中堂', kind: 'chudo', hist: 'HIST_A', x: -55, z: -5, rot: E, w: 26, d: 13, h: 6.2, dist: 'todo', cl: 'chudo', slow: 3.5 },
  { id: 'daikodo_old', name: '大講堂', kind: 'kodo', hist: 'HIST_A', x: -50, z: -36, rot: S, w: 20, d: 11, h: 5, dist: 'todo', cl: 'kodo', slow: 2.6 },
  { id: 'todo_shoro', name: '東塔の鐘楼', kind: 'shoro', hist: 'HIST_B', x: -33, z: -31, rot: S, w: 3.4, d: 2.8, dist: 'todo', cl: 'kodo' },
  { id: 'kaidan_area', name: '戒壇院', kind: 'do', hist: 'HIST_B', x: -21, z: -31, rot: S + 0.1, w: 8, d: 7, h: 3.4, dist: 'todo', cl: 'kodo' },
  { id: 'todo_kyozo', name: '東塔の経蔵', kind: 'kyozo', hist: 'HIST_B', x: -68, z: -10, rot: E, w: 5, d: 5, dist: 'todo', cl: 'nishidani' },
  { id: 'todo_kuri', name: '東塔の厨房', kind: 'kuri', hist: 'GAME_C', x: -70, z: -29, rot: S, w: 7, d: 5, dist: 'todo', cl: 'kodo' },
];

// 僧坊の小さな集落（16〜17・40〜41章）：平場ごとに 3・5・8 棟と不規則に。一直線に並べない。
// 近くの物は実体（sobo）、遠い谷の物は軽い作り（lite：影なし・当たり無し）
const BO_CLUSTERS = [
  { cl: 'higashidani', name: '東谷の僧坊', x: -2, z: -26, n: 4, r: 6, rot: 0.4, dist: 'todo', seed: 3, kura: 1 },
  { cl: 'kitadani', name: '北谷の僧坊', x: -44, z: -50, n: 3, r: 6, rot: 0.25, dist: 'todo', seed: 5 },
  { cl: 'kitadani', name: '北谷の僧坊', x: -62, z: -58, n: 5, r: 7, rot: -0.2, dist: 'todo', seed: 7, kuri: 1 },
  { cl: 'minamidani', name: '南谷の僧坊', x: -30, z: 20, n: 5, r: 7, rot: -0.15, dist: 'todo', seed: 11, kura: 1 },
  { cl: 'minamidani', name: '南谷の僧坊', x: -48, z: 27, n: 3, r: 5, rot: 0.3, dist: 'todo', seed: 13 },
  { cl: 'nishidani', name: '西谷の僧坊', x: -80, z: 2, n: 8, r: 8, rot: 0.1, dist: 'todo', seed: 17, kuri: 1, kura: 1 },
  { cl: 'saito_bo', name: '西塔の僧坊', x: -140, z: -28, n: 5, r: 6, rot: -0.3, dist: 'saito', seed: 19 },
  // 遠い谷（軽い作り）：無動寺谷・北谷の下・南谷の奥・西塔の北
  { cl: 'mudoji_far', name: '無動寺谷の坊', x: 30, z: 66, n: 6, r: 10, rot: 0.5, dist: 'far', seed: 23, lite: true },
  { cl: 'kita_far', name: '北谷の奥の坊', x: -30, z: -74, n: 5, r: 9, rot: -0.4, dist: 'far', seed: 29, lite: true },
  { cl: 'minami_far', name: '南谷の奥の坊', x: -12, z: 40, n: 4, r: 8, rot: 0.2, dist: 'far', seed: 31, lite: true },
  { cl: 'saito_far', name: '西塔の北の坊', x: -118, z: -70, n: 6, r: 10, rot: 0.1, dist: 'far', seed: 37, lite: true },
  { cl: 'higashi_far', name: '東谷の下の坊', x: 14, z: -40, n: 4, r: 8, rot: 0.6, dist: 'far', seed: 41, lite: true },
  // 横川（31・40〜41章）：東塔・西塔より森が深く、僧坊が小さな平場ごとに分散する
  { cl: 'yokawa_bo', name: '横川の僧坊', x: -98, z: -214, n: 5, r: 8, rot: 0.15, dist: 'yokawa', seed: 43, kura: 1 },
  { cl: 'yokawa_bo', name: '横川の僧坊', x: -112, z: -236, n: 4, r: 7, rot: -0.3, dist: 'yokawa', seed: 47, kuri: 1 },
  { cl: 'yokawa_far', name: '横川の奥の坊', x: -90, z: -250, n: 5, r: 9, rot: 0.3, dist: 'far', seed: 53, lite: true },
];
function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
for (const C of BO_CLUSTERS) {
  const R = rng(C.seed);
  const placed = [];
  for (let i = 0, tries = 0; i < C.n && tries < 160; tries++) {
    const a = R() * Math.PI * 2, rr = C.r * (0.25 + R() * 0.75) * (1 + Math.floor(tries / 40) * 0.3);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    const w = 5 + R() * 2.5, d = 4 + R() * 1.6;
    if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < (q.w + w) * 0.5 + 3.2)) continue;
    // 急すぎる斜面には建てない（平場を切れる所だけ）
    const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => WIN.height(x + a * w / 2, z + b * w / 2));
    if (Math.max(...hs) - Math.min(...hs) > (C.lite ? 4.5 : 3.5)) continue;
    const kind = C.kura && i === C.n - 1 ? 'kura' : C.kuri && i === C.n - 2 ? 'kuri' : 'sobo';
    placed.push({ x, z, w });
    BUILDINGS.push({
      id: `${C.cl}_${C.seed}_${i}`, name: kind === 'kura' ? '僧坊の倉' : kind === 'kuri' ? '僧坊の厨房' : C.name, kind: C.lite ? 'lite' : kind,
      var: Math.floor(R() * 3), hist: C.lite || kind !== 'sobo' ? 'GAME_C' : 'HIST_B', x, z, rot: C.rot + (R() - 0.5) * 0.5 + (R() < 0.3 ? Math.PI / 2 : 0),
      w: kind === 'kura' ? 3.6 : w, d: kind === 'kura' ? 3.2 : d, dist: C.dist, cl: C.cl, lite: !!C.lite,
    });
    i++;
  }
}
// 西塔（第二段階の入口まで。19〜25章）
BUILDINGS.push(
  { id: 'jodoin', name: '浄土院（最澄の御廟）', kind: 'do', hist: 'HIST_A', x: -96, z: -35, rot: S + 0.3, w: 7, d: 6, h: 3, dist: 'saito', quiet: true },
  { id: 'jogyodo', name: '常行堂', kind: 'do', hist: 'HIST_A', x: -114, z: -51, rot: E + 0.15, w: 8, d: 8, h: 3.4, dist: 'saito', cl: 'ninaido' },
  { id: 'hokkedo', name: '法華堂', kind: 'do', hist: 'HIST_A', x: -116, z: -37, rot: E + 0.15, w: 8, d: 8, h: 3.4, dist: 'saito', cl: 'ninaido' },
  { id: 'ninaido_roka', name: 'にない堂の廊下', kind: 'roka', hist: 'HIST_B', x: -115, z: -44, rot: 0.15, w: 2.6, d: 7, dist: 'saito', cl: 'ninaido' },
  { id: 'shakado_old', name: '西塔の釈迦堂（前身）', kind: 'kodo', hist: 'HIST_A', x: -133, z: -45, rot: E, w: 16, d: 10, h: 4.6, dist: 'saito', cl: 'shakado' },
  { id: 'saito_shoro', name: '西塔の鐘楼', kind: 'shoro', hist: 'HIST_B', x: -126, z: -33, rot: S, w: 3.2, d: 2.6, dist: 'saito', cl: 'shakado' },
  { id: 'rurido', name: '瑠璃堂', kind: 'rurido', hist: 'HIST_A', x: -156, z: -80, rot: E + 0.2, w: 6, d: 6, dist: 'saito', noBurn: true },
);
// 横川（第三段階。26〜32章）：西塔から約4km、長い山道の先。東塔より森が深く、建物が分散し道が狭い。
// 横川中堂・四季講堂は1571年焼失前の前身堂として推定復元（今の建物は1971・1652年の再建、写さない＝58章）
BUILDINGS.push(
  { id: 'yokawa_chudo_1571', name: '横川中堂（前身）', kind: 'kodo', hist: 'HIST_A', x: -94, z: -228, rot: S + 0.1, w: 15, d: 11, h: 4.8, dist: 'yokawa', cl: 'yokawa_chudo', slow: 2.4 },
  { id: 'shikikodo_1571', name: '四季講堂（前身）', kind: 'do', hist: 'HIST_A', x: -86, z: -220, rot: Wd - 0.1, w: 9, d: 8, h: 3.4, dist: 'yokawa', cl: 'yokawa_chudo' },
  { id: 'eshindo', name: '恵心堂', kind: 'do', hist: 'HIST_B', x: -108, z: -238, rot: E + 0.2, w: 6, d: 5.5, h: 2.8, dist: 'yokawa', cl: 'yokawa_bo' },
  { id: 'yokawa_shoro', name: '横川の鐘楼', kind: 'shoro', hist: 'HIST_B', x: -98, z: -221, rot: S, w: 3, d: 2.6, dist: 'yokawa', cl: 'yokawa_chudo' },
);

// 平場に乗っていない建物には、建物ごとに小さな平場を切る（僧坊の一つ一つが自分の平場に建つ）
function inTerrace(x, z) {
  for (const T of TERRACES) {
    const c = Math.cos(T.rot || 0), sn = Math.sin(T.rot || 0), dx = x - T.x, dz = z - T.z;
    if (Math.abs(dx * c - dz * sn) < T.w / 2 && Math.abs(dx * sn + dz * c) < T.d / 2) return T;
  }
  return null;
}
// 建物の四隅が一つの平場に収まっているか
function wholeIn(b) {
  const c = Math.cos(b.rot || 0), sn = Math.sin(b.rot || 0);
  let T0;
  for (const [a, k] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = a * b.w / 2, lz = k * b.d / 2, T = inTerrace(b.x + lx * c + lz * sn, b.z - lx * sn + lz * c);
    if (!T || (T0 && T !== T0)) return false;
    T0 = T;
  }
  return true;
}
for (const b of BUILDINGS) {
  if (b.lite || b.kind === 'torii' || wholeIn(b)) continue;
  const T = inTerrace(b.x, b.z);
  TERRACES.push({ id: 'pad_' + b.id, x: b.x, z: b.z, w: b.w + 2.4, d: b.d + 2.4, rot: b.rot || 0, rise: 0.15, edge: 2.2, lv: T ? T.lv : undefined });
}

// ---- 地面の高さ：広域の標高に、平場と道の切り盛りを重ねる ----
const sstep = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
for (const T of TERRACES) {
  T.c = Math.cos(T.rot || 0); T.s = Math.sin(T.rot || 0);
  if (T.lv === undefined) T.lv = WIN.height(T.x, T.z) + (T.rise || 0);
  // 法面の幅：平場と、まわりの地面の高さの差に合わせて広げる（切り立った崖にしない。人が上り下りできる勾配）
  let dmax = 0;
  for (let a = 0; a < 6.28; a += 0.5) {
    const lx = Math.cos(a) * T.w / 2, lz = Math.sin(a) * T.d / 2;
    dmax = Math.max(dmax, Math.abs(T.lv - WIN.height(T.x + lx * T.c + lz * T.s, T.z - lx * T.s + lz * T.c)));
  }
  T.edge = Math.min(9, Math.max(T.edge, dmax * 1.5));
}
// 道の縦の断面：中心線に沿って 1m ごとに地面（平場を重ねた後）を測り、前後をならす（段差の無い、斜面を切った道）
function terraced(x, z) { return terraceBlend(WIN.height(x, z), x, z); }
// 平場の重みを足し合わせて均す：平場の中は（縁から少し入れば）その平場の高さそのもの、法面は近い平場の高さへ寄せる。
// 重みはどこでも途切れないので、平場が隣り合っても段が切れない（崖にならない）
function terraceBlend(h, x, z) {
  let sw = 0, sh = 0;
  for (const T of TERRACES) {
    const dx = x - T.x, dz = z - T.z;
    if (Math.abs(dx) > T.w + T.d + T.edge || Math.abs(dz) > T.w + T.d + T.edge) continue;
    const lx = Math.abs(dx * T.c - dz * T.s) - T.w / 2, lz = Math.abs(dx * T.s + dz * T.c) - T.d / 2;
    let w;
    if (lx <= 0 && lz <= 0) { const k = Math.min(1, Math.min(-lx, -lz) / 0.8); w = 1 + 400 * k * k; }
    else {
      const out = Math.hypot(Math.max(0, lx), Math.max(0, lz));
      if (out > T.edge) continue;
      w = 1 - sstep(0, T.edge, out);
    }
    sw += w; sh += w * T.lv;
  }
  if (sw <= 0) return h;
  return sw >= 1 ? sh / sw : sh + h * (1 - sw);
}
function profile(P2) {
  const pts = P2.pts, seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, bx, bz, l, s0: L }); L += l;
  }
  const n = Math.max(2, Math.ceil(L)), raw = new Float32Array(n + 1);
  for (let k = 0; k <= n; k++) {
    const s = k / n * L; let q = seg[seg.length - 1];
    for (const sg of seg) if (s <= sg.s0 + sg.l) { q = sg; break; }
    const t = q.l ? (s - q.s0) / q.l : 0;
    raw[k] = terraced(q.ax + (q.bx - q.ax) * t, q.az + (q.bz - q.az) * t);
  }
  const sm = new Float32Array(n + 1), R2 = P2.sm ?? 4;
  for (let k = 0; k <= n; k++) {
    let a = 0, c = 0;
    for (let j = -R2; j <= R2; j++) { const i = Math.max(0, Math.min(n, k + j)); a += raw[i]; c++; }
    sm[k] = a / c;
  }
  // 端（平場につながる所）は地面そのものの高さに合わせる
  sm[0] = raw[0]; sm[n] = raw[n];
  P2.seg = seg; P2.L = L; P2.n = n; P2.prof = sm;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  P2.box = [x0 - P2.w - 4, x1 + P2.w + 4, z0 - P2.w - 4, z1 + P2.w + 4];
}
// 点から道の中心線への一番近い所（距離と、道の高さ）
function nearOnPath(P2, x, z) {
  let bd = Infinity, bs = 0;
  for (const q of P2.seg) {
    const dx = q.bx - q.ax, dz = q.bz - q.az, l2 = q.l * q.l || 1e-6;
    const t = Math.max(0, Math.min(1, ((x - q.ax) * dx + (z - q.az) * dz) / l2));
    const d = Math.hypot(x - (q.ax + dx * t), z - (q.az + dz * t));
    if (d < bd) { bd = d; bs = q.s0 + t * q.l; }
  }
  const f = bs / P2.L * P2.n, i = Math.min(P2.n - 1, Math.floor(f)), k = f - i;
  return { d: bd, h: P2.prof[i] * (1 - k) + P2.prof[i + 1] * k, s: bs };
}
let READY = false;
function ready() { if (READY) return; READY = true; for (const p of PATHS) profile(p); }

export function height(x, z) {
  ready();
  // 平場を均してから道を切る（道の縦の断面は平場を重ねた地面から作るので、平場の中では道も平場の高さ）
  let h = terraced(x, z);
  for (const p of PATHS) {
    const b = p.box;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const q = nearOnPath(p, x, z);
    if (q.d > p.w + 3.2) continue;
    const t = 1 - sstep(p.w, p.w + 3.2, q.d);
    h += (q.h - h) * t;
  }
  return h;
}
// 平場か道の上か（地面の細かな起伏を足さない所）
export function onFlat(x, z) {
  ready();
  for (const T of TERRACES) {
    const dx = x - T.x, dz = z - T.z;
    if (Math.abs(dx * T.c - dz * T.s) < T.w / 2 && Math.abs(dx * T.s + dz * T.c) < T.d / 2) return true;
  }
  for (const p of PATHS) { const b = p.box; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (nearOnPath(p, x, z).d < p.w + 0.5) return true; }
  return false;
}
// 道の上の、s（中心線の長さ）の所の点と傾き（石段を置く・bot の道筋）
export function pathPoint(p, s) {
  ready();
  s = Math.max(0, Math.min(p.L, s));
  let q = p.seg[p.seg.length - 1];
  for (const sg of p.seg) if (s <= sg.s0 + sg.l) { q = sg; break; }
  const t = q.l ? (s - q.s0) / q.l : 0;
  const f = s / p.L * p.n, i = Math.min(p.n - 1, Math.floor(f)), k = f - i;
  return { x: q.ax + (q.bx - q.ax) * t, z: q.az + (q.bz - q.az) * t, h: p.prof[i] * (1 - k) + p.prof[i + 1] * k, dir: Math.atan2(q.bx - q.ax, q.bz - q.az), grade: (p.prof[Math.min(p.n, i + 1)] - p.prof[i]) / (p.L / p.n) };
}
export function pathLen(p) { ready(); return p.L; }
export function nearPath(p, x, z) { ready(); return nearOnPath(p, x, z); }
