// ======================================================================
// castles/inabayama.js … 稲葉山城（金華山）の縄張り（docs/siege-plan.md 7章「稲葉山（山城）」）
// castle_plan.js の形（kuruwa・hori）で書く。地形の下地・兵の配置・戦い方は b_inabayama.js 側の仕事。
// 大手道は七曲り（七つの折れ）で町から木戸まで登る。搦手（水手道）は二段の腰曲輪を経て本丸の裏へ。
// 竪堀（tatebori）は、七曲りの最後の折れの両脇と、搦手の腰曲輪の西側（崖寄り）に置き、
// 斜面を横に回り込めないようにする。腰曲輪の東側（物見櫓のある側）だけは竪堀を置かず、
// 回り込む脇道として残す（docs castle-design 7-1「畝状竪堀の無い斜面だけ」）。
// ======================================================================

import { switchback } from '../yamalift.js';
export const HON = { x: 0, z: -116 };            // 本丸（山の上）
// 略図の座標を本丸に足す。二の丸の「東寄り」は座標と食い違うため、数で書かれた西40・南25を採る。
export const NI = { x: HON.x - 40, z: HON.z + 25 };
export const MATSU = { x: HON.x + 50, z: HON.z + 60 };
// 天守台に付く方五間の小曲輪（約9.1m四方）。東の石垣以外の囲い方は今のまま。
export const TSUKE = { x: HON.x + 20 + 9.1 / 2, z: HON.z, half: 9.1 / 2 };
export const OTE = { x: 0, z: -62 };             // 大手の木戸（七曲りの道の上がりきった所）
export const GAP_A = Math.PI * 1.5;              // 本丸の柵の口（西向き）

// 大手道（七曲り）：井口の町から、七つ折れて大手の木戸まで。さらに木戸の先、本丸の手前まで
// 七曲り（kaito 10/3：山を高くしたので、麓の町の上からは左右に大きく振って、折れを増やして登る）
// 実道は約1900m（百曲りは約1100m）。遊びの時間に合わせた縮め方と上の折れは保ち、麓の入口を南西に寄せる。
export const ROAD = [[-56, 150], [-42, 112], [-34, 82], [-36, 50], ...switchback([-20, 32], [OTE.x, OTE.z], 10, 40), [0, -96]];
// 搦手の道（水手道）：大手の西の麓から、山の西の肩をまわって本丸の裏の口へ。途中に二段の腰曲輪
export const KARA = [[-6, -34], [-44, -58], [-64, -92], [-54, -120], [-26, -118], [-9, -116]];
export const TOWER = { x: KARA[2][0] + 7, z: KARA[2][1] - 3 };   // 水手道の途中に立つ物見櫓（腰曲輪1の東＝回り込める側）
// 百曲り（山の東の肩を幾重にも折れて登る細道）：大手の木戸を通らず、木戸の奥（本丸の手前の道）へ出る
export const HYAKU = [[26, -26], [44, -48], [34, -70], [46, -90], [28, -104], [24, -94], [0, -96]];
// 長良川の舟着き（城の西の麓）。斎藤龍興は城を明け渡し、ここから舟で川を下った（退路＝siege_zones の escape）
export const FUNA = { x: -100, z: -46 };
// 本丸の柵の口（西）の外。本丸へ攻め上る者は、ここで口へ回る
export const HON_GATE_OUT = { x: -21, z: -114 };
// 腰曲輪2（新しい段。KARA[1]-KARA[2] の間）の中心
const KOSHI2 = { x: (KARA[1][0] + KARA[2][0]) / 2 - 4, z: (KARA[1][1] + KARA[2][1]) / 2 - 2 };

// 出丸・厩は絵図に名前がある。1567年の位置・寸法は確定せず、美濃の尾根の土の城として推定。
export const DEMARU = { x: 78, z: -8 };
export const UMAYA = { x: 78, z: -38 };
export const YAKATA = { x: -86, z: 50 };
export const NI_ROAD = [KARA[3], [NI.x, NI.z], KARA[4]];
// 主郭の南の柵を横切らず、二ノ門と中枢曲輪を経て西の虎口へ。
export const NIMON = { x: -13, z: -94 };   // 二ノ門（入口曲輪と中枢曲輪の間の冠木門）
export const TOP_ROAD = [[0, -96], [NIMON.x, NIMON.z], [-26, -96], [-26, -114], [HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[5]];
export const EAST_ROAD = [HYAKU[1], [MATSU.x, MATSU.z], [78, -56], [UMAYA.x, UMAYA.z], [DEMARU.x, DEMARU.z]];
const YAKATA_ROAD = [ROAD[3], [-60, 50], [YAKATA.x, YAKATA.z]];
const TSUKE_ROAD = [[12, -116], [TSUKE.x, TSUKE.z]];
export const CASTLE_PATHS = [ROAD, KARA, HYAKU, NI_ROAD, TOP_ROAD, EAST_ROAD, TSUKE_ROAD, YAKATA_ROAD];
function rect(x, z, w, d) { return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]]; }

function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 山頂（Z5）は大きな平城の本丸にせず、狭い平場を小曲輪に分ける（docs/first6 29）：
// 入口曲輪（七曲りと百曲りが合う所）→ 二ノ門 → 中枢曲輪（本丸の柵の口の前）→ 主郭（本丸。斎藤龍興の主殿）
export const IRI = { x: 0, z: -88 };       // 入口曲輪
export const NAKA = { x: -26, z: -104 };   // 中枢曲輪
// 層（docs/first6 28）：Z0 井ノ口・山麓／Z1 登山口／Z2 中腹道／Z3 中腹の守り所／Z4 山頂直下／Z5 山頂城郭
export const LAYERS = [
  { id: 'Z0', name: '井ノ口の町（山麓）', test: (x, z) => z > 26 },
  { id: 'Z1', name: '登山口', test: (x, z) => z > -12 },
  { id: 'Z2', name: '中腹の道', test: (x, z) => z > -46 },
  { id: 'Z3', name: '中腹の守り所', test: (x, z) => z > -80 },
  { id: 'Z4', name: '山頂の直下', test: (x, z) => Math.hypot(x - HON.x, z - HON.z) > 30 },
  { id: 'Z5', name: '山頂の城', test: () => true },
];
// 札（HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い）。画面には出さない
export const INABAYAMA_HIST = {
  terrain: 'HIST_A',        // 金華山の急な斜面・岩場・尾根（国土地理院の標高）
  roads: 'HIST_B',          // 七曲り（長く歩きやすい）・百曲り（短く急）の二つの道
  smallKuruwa: 'HIST_B',    // 本丸を基準に二の丸・松の丸。出丸・厩の位置と各曲輪の未確認の広さは補い
  saku: 'HIST_B',           // 柵・木戸・切岸・土塁（中世の山城）
  someStone: 'HIST_B',      // 絵図の東の約3mの石垣を一部だけ。1567年の形の細部は推定
  shuden: 'HIST_B',         // 主郭の主殿の形と大きさ
  ambush: 'GAME_C',         // 曲がり角の伏兵・中腹の鉄砲
  hideyoshiRoute: 'GAME_C', // 搦手の別ルート（太閤記の伝え。確かな史実として扱わない）
  buildings: 'HIST_B',      // 番所・長屋・蔵・小祠・斎藤期の山麓館。形と位置は同時代の美濃から推定
  demaruUmaya: 'HIST_B',    // 後世の絵図に名前はあるが、斎藤期の位置・広さは未確定
  funa: 'HIST_A',           // 龍興は長良川を舟で下った
};

export const INABAYAMA_PLAN = {
  mon: 'saito',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '稲葉山城', type: 'yama',
  // 大将の居場所（kaito 10/2）：天守・二重櫓の無い土の城。本丸の主殿の奥の間に斎藤龍興（戸口は南の縁側）
  lordSeat: { kind: 'goten', profile: 'inabayama', oku: 0.42, at: [HON.x + 2, HON.z - 6], w: 11, d: 6.5, rot: 0, door: 1, name: '主殿', where: '主殿の奥の間' },
  kuruwa: [
    // 主郭の広さ・外形は推定。建物を縁の内に収め、西の虎口と東の小曲輪の口を空ける
    { id: 'hon', name: '本丸', poly: rect(HON.x, HON.z - 2, 40, 36), level: (bf) => bf(HON.x, HON.z), wall: 'saku', dorui: 1.3 },
    { id: 'tsuke', name: '本丸の小曲輪', poly: [[TSUKE.x - TSUKE.half, TSUKE.z - TSUKE.half], [TSUKE.x + TSUKE.half, TSUKE.z - TSUKE.half], [TSUKE.x + TSUKE.half, TSUKE.z + TSUKE.half], [TSUKE.x - TSUKE.half, TSUKE.z + TSUKE.half]], level: (bf) => bf(HON.x, HON.z) },
    { id: 'iri', name: '入口曲輪', poly: circle(IRI.x, IRI.z, 7, 10), level: (bf) => bf(IRI.x, IRI.z) + 0.5 },
    { id: 'naka', name: '中枢曲輪', poly: circle(NAKA.x, NAKA.z, 7, 10), level: (bf) => bf(NAKA.x, NAKA.z) + 0.8 },
    { id: 'ote', name: '三の丸（大手）', poly: circle(OTE.x, OTE.z, 15, 10), level: (bf) => bf(OTE.x, OTE.z) },
    { id: 'ni', name: '二の丸', poly: rect(NI.x, NI.z, 22, 22), level: (bf) => bf(NI.x, NI.z) + 2, wall: 'saku', dorui: 1.3 },
    // 松の丸の広さは不明。二の丸と同じ小さな平場を補い、百曲りの交点は口として空ける。
    { id: 'matsu', name: '松の丸', poly: rect(MATSU.x, MATSU.z, 22, 22), level: (bf) => bf(MATSU.x, MATSU.z), wall: 'saku', dorui: 1.2 },
    { id: 'umaya', name: '厩の曲輪', poly: rect(UMAYA.x, UMAYA.z, 24, 18), level: (bf) => bf(UMAYA.x, UMAYA.z), wall: 'saku', dorui: 1.3 },
    { id: 'demaru', name: '出丸', poly: rect(DEMARU.x, DEMARU.z, 24, 20), level: (bf) => bf(DEMARU.x, DEMARU.z), wall: 'saku', dorui: 1.4 },
    { id: 'yakata', name: '山麓の館', poly: rect(YAKATA.x, YAKATA.z, 34, 28), level: (bf) => bf(YAKATA.x, YAKATA.z), wall: 'saku', dorui: 1 },
    // 腰曲輪1：搦手の水手道の途中、物見櫓が立つ段。喰違いの柵で囲い、入口と出口を前後にずらす
    { id: 'koshi1', name: '腰曲輪（上の段）', poly: circle(KARA[2][0], KARA[2][1], 13, 10), level: (bf) => bf(KARA[2][0], KARA[2][1]) + 1, wall: 'saku', gapAt: [KARA[1], KARA[3]] },
    // 腰曲輪2：その下の段。手前で一度足を止めさせる（docs「腰曲輪の段」＝複数）
    { id: 'koshi2', name: '腰曲輪（下の段）', poly: circle(KOSHI2.x, KOSHI2.z, 9, 10), level: (bf) => bf(KOSHI2.x, KOSHI2.z) + 0.5, wall: 'saku', dorui: 1 },
  ],
  paths: CASTLE_PATHS.map((pts) => ({ pts })),
  koguchi: [
    { id: 'hon_w', name: '本丸の木戸', at: [-20, -116], w: 7 },
    { id: 'hon_e', name: '小曲輪の口', at: [20, -116], w: 5 },
    { id: 'ni_n', name: '二の丸の口', at: [-45.3, NI.z - 11], w: 6 },
    { id: 'yakata_e', name: '山麓の館の口', at: [YAKATA.x + 17, YAKATA.z], w: 6 },
    { id: 'demaru_n', name: '出丸の木戸', at: [DEMARU.x, DEMARU.z - 10], w: 6 },
  ],
  // 竪堀：七曲りの最後の折れの両脇（木戸へ一直線に寄せられないように）と、腰曲輪1の崖寄り（西）の脇
  // （東の物見櫓の側は竪堀を置かず、回り込める脇道として残す＝ docs 7-1）
  hori: [
    { kind: 'tatebori', pts: [[-50, -10], [-50, -52]], w: 3, deep: 3.0 },
    { kind: 'tatebori', pts: [[50, -10], [50, -52]], w: 3, deep: 3.0 },
    { kind: 'tatebori', pts: [[KARA[2][0] - 16, KARA[2][1] + 10], [KARA[2][0] - 16, KARA[2][1] - 20]], w: 2.6, deep: 2.8 },
  ],
  // 竹束（castle_plan.js が自動で置く。大手の木戸の手前と、腰曲輪の木戸の手前に数個ずつ。
  // 道（ROAD・KARA）そのものの上に乗らないよう、道の折れを避けて左右へ十分に離す）
  taba: [
    [-9, -50], [3, -50], [KARA[2][0] - 7, KARA[2][1] + 6], [KARA[2][0] + 9, KARA[2][1] + 6],
  ],
};

// 通り道と縁の交点を口にする。中心や遠い道の点を指定して隣の辺を切ると柵が道を塞ぐ。
// 曲輪の作成時だけ計算し、遠い曲輪の柵も共通の描画にまとめる。
for (const k of INABAYAMA_PLAN.kuruwa) {
  if (!k.wall) continue;
  const mouths = [];
  for (const pts of CASTLE_PATHS) for (let j = 0; j + 1 < pts.length; j++) {
    const a = pts[j], b = pts[j + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    for (let i = 0; i < k.poly.length; i++) {
      const c = k.poly[i], e = k.poly[(i + 1) % k.poly.length], ex = e[0] - c[0], ez = e[1] - c[1];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 0.00001) continue;
      const qx = c[0] - a[0], qz = c[1] - a[1];
      const t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const p = [a[0] + dx * t, a[1] + dz * t];
      if (!mouths.some((m) => Math.hypot(m[0] - p[0], m[1] - p[1]) < 0.5)) { p.edge = i; mouths.push(p); }
    }
  }
  // 同じ辺の近い口は一つにまとめる。重なった切り口を二つ渡すと、間に短い逆向きの柵が残る。
  const merged = [];
  for (const p of mouths) {
    const m = merged.find((q) => q.edge === p.edge && Math.hypot(q[0] - p[0], q[1] - p[1]) < 6);
    if (m) { m[0] = (m[0] + p[0]) / 2; m[1] = (m[1] + p[1]) / 2; }
    else { const q = [p[0], p[1]]; q.edge = p.edge; merged.push(q); }
  }
  k.gapAt = merged.length ? merged : null;
  k.gapW = 6;
}
