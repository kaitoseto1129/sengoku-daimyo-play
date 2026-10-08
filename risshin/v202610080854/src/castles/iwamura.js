// ======================================================================
// castles/iwamura.js … 岩村城・水晶山（docs/late6b-1575-1578-spec.md 1〜15章）
// 二つの縄張り：
//  ・IWAMURA_CASTLE_PLAN … 岩村城そのもの（戦国期・秋山虎繁が籠る城）。山麓から本丸まで、
//    外側曲輪→八幡曲輪→二の丸→主郭→本丸と段を重ねる。本丸は土塁・板葺きの土塀で復元する。
//    土塁・切岸・木柵を主にする。今見える六段壁・大石垣・近世の門構えは使わない。
//  ・IWAMURA_SUISHOZAN_PLAN … 水晶山の織田の陣（HIST_B）。大城塞にせず陣幕・柵・簡易な物見。
// castle_plan.js の形（kuruwa・koguchi・paths・yagura・hori）で書く。地形の下地・兵・戦い方は b_iwamura.js 側。
// ======================================================================
// 参照：docs/layout-ref/castles.md 岩村、docs/yamajiro-1003.md。
// 戦国期の寸法・建物・虎口・堀の細部は不明。東美濃の土の山城として推定。

import { switchback } from '../yamalift.js';
function circle(cx, cz, r, n = 10) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 平場を縮めず並べるため、城内だけ尾根方向へ広げる。麓と夜討ちの道は動かさない。
// 岐阜県の史跡解説（https://www.pref.gifu.lg.jp/page/7261.html）の享保三年の寸法を
// 地形の広さの参考にする。戦国期の門・石垣・建物を確定する根拠にはしない。
const RIDGE_STATIONS = [[-160, -160], [-172, -172], [-196, -206], [-218, -268], [-240, -320], [-246, -333], [-258, -354], [-271, -375]];
export function castlePoint(x, z) {
  if (z >= -160) return [x, z];
  for (let i = 1; i < RIDGE_STATIONS.length; i++) {
    const a = RIDGE_STATIONS[i - 1], b = RIDGE_STATIONS[i];
    if (z >= b[0]) return [x, a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0])];
  }
  return [x, -375 + (z + 271)];
}

// 戦国期の寸法・虎口の細部は未確定。曲輪の並びと南の攻め口を保ち、輪郭は推定で補う。
// 曲輪の中心（山麓→登城道→外側曲輪→八幡曲輪→二の丸→主郭→本丸。細い登城道が折れながら登る）
export const OUTER = { x: 0, z: -172 };      // 外側曲輪（登城道の最初の段）
export const HACHIMAN = { x: 16, z: -196 };  // 八幡曲輪（八幡方面）
export const NI = { x: -10, z: -218 };       // 二の丸方面
export const SHU = { x: 6, z: -240 };        // 主郭
export const HON = { x: 0, z: -258 };        // 本丸（最高所。大天守は置かない）

export const GATE_OUTER = { x: 0, z: -160, name: '大手の木戸' };
export const GATE_HACHIMAN = { x: 9, z: -184, name: '八幡曲輪の木戸' };
export const GATE_NI = { x: -3, z: -206, name: '二の丸の木戸' };
export const GATE_SHU = { x: 2, z: -229, name: '主郭の木戸' };
export const GATE_HON = { x: 1, z: -246, name: '本丸の木戸' };

// 登城道：山麓（b_iwamura.js の FOOT）から折れながら本丸へ。七曲りのような大きな折れでなく、細い一本道
export const ROAD = [...switchback([0, -96], [0, -148], 6, 30), [GATE_OUTER.x, GATE_OUTER.z], [OUTER.x, OUTER.z], [10, -178], [GATE_HACHIMAN.x, GATE_HACHIMAN.z], [HACHIMAN.x, HACHIMAN.z],
  [-4, -202], [GATE_NI.x, GATE_NI.z], [NI.x, NI.z], [0, -224], [GATE_SHU.x, GATE_SHU.z], [SHU.x, SHU.z], [2, -244], [GATE_HON.x, GATE_HON.z], [HON.x, HON.z]];

// 本丸の南に出丸、東に東曲輪、西から本丸裏へ帯曲輪。輪郭の細部は推定。
export const SIDE_ROADS = [
  [[SHU.x, SHU.z], [22, -240], [28, -234], [28, -220]],
  [[28, -234], [28, -246], [28, -258]],
  [[NI.x, NI.z], [-18, -218], [-26, -222], [-26, -238]],
  [[16, -196], [24, -196], [34, -189]],
  [[24, -196], [34, -199]],
  [[24, -196], [24, -184], [0, -184], [0, -186]],
  [[-10, -218], [-10, -211], [-16, -211], [-16, -212]],
  [[6, -240], [6, -233], [1, -233], [1, -234]],
  [[0, -172], [0, -168], [-7, -168], [-7, -171]],
  [[-26, -238], [-26, -264], [-15, -272], [-8, -267], [-9, -251], [1, -250]],
];

export const IWAMURA_CASTLE_PLAN = {
  mon: 'takeda',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '岩村城', type: 'yama', year: 1575,
  // 大将の居場所（kaito 10/2）：本丸の主殿の奥の間に秋山虎繁（大天守は無い。戸口は南の本丸の木戸の側）
  lordSeat: { profile: 'iwamura', kind: 'goten', at: [HON.x, HON.z], w: 12, d: 7, rot: 0, door: 1, name: '主殿', where: '本丸の主殿の奥の間' },
  // 同じ山頂の下地から段を下げる。二の丸の下地の尾根が本丸より高くなる逆転を防ぐ。
  kuruwa: [
    { id: 'outer', name: '三の丸', poly: [[-12, -160], [8, -160], [14, -174], [5, -182], [-12, -180]], level: (bf) => bf(HON.x, HON.z) - 28, wall: 'saku', gapAt: [GATE_OUTER.x, GATE_OUTER.z] },
    { id: 'hachiman', name: '八幡曲輪', poly: [[-12, -182], [28, -181], [44, -187], [44, -209], [19, -210], [-5, -203]], level: (bf) => bf(HON.x, HON.z) - 18, wall: 'dobei', wallOpt: { ita: true }, dorui: 1.6, gapAt: [GATE_HACHIMAN.x, GATE_HACHIMAN.z] },
    { id: 'ni', name: '二の丸', poly: [[-22, -208], [-2, -207], [3, -216], [-1, -227], [-22, -227]], level: (bf) => bf(HON.x, HON.z) - 10, wall: 'saku', gapAt: [GATE_NI.x, GATE_NI.z] },
    { id: 'shu', name: '主郭', poly: [[-5, -230], [14, -230], [16, -239], [8, -246], [-5, -245]], level: (bf) => bf(HON.x, HON.z) - 2, wall: 'saku', gapAt: [GATE_SHU.x, GATE_SHU.z] },
    { id: 'demaru', name: '出丸', poly: [[22, -246], [34, -246], [34, -214], [29, -208], [22, -213]], level: (bf) => bf(HON.x, HON.z) - 2, wall: 'saku' },
    { id: 'higashi', name: '東曲輪', poly: circle(28, -258, 8), level: (bf) => bf(HON.x, HON.z) + 3, wall: 'saku' },
    { id: 'obi', name: '帯曲輪', poly: [[-32, -259], [-20, -259], [-20, -222], [-32, -222]], level: (bf) => bf(HON.x, HON.z) - 10, wall: 'saku' },
    // 本丸を最高所にそろえる。江戸期の石垣の輪を戦国期の確定した形にしない。
    { id: 'hon', name: '本丸', poly: [[-13, -246], [10, -246], [13, -255], [8, -271], [-10, -271], [-14, -259]], level: (bf) => bf(HON.x, HON.z) + 6, wall: 'dobei', wallOpt: { ita: true }, dorui: 1.5, gapAt: [GATE_HON.x, GATE_HON.z] },
  ],
  // 堀切：二の丸と主郭の間で尾根を断つ（横に回り込みにくくする）
  hori: [{ kind: 'horikiri', pts: [[-20, -229], [-3, -229]], w: 4.4, deep: 3.6 },
    { kind: 'horikiri', pts: [[7, -229], [20, -229]], w: 4.4, deep: 3.6 },
    // 土橋と枝道を避けた尾根の堀切・斜面の竪堀（位置と寸法は推定）。
    { kind: 'horikiri', pts: [[-42, -281], [-7, -281]], w: 6, deep: 3 },
    { kind: 'horikiri', pts: [[7, -281], [40, -281]], w: 6, deep: 3 },
    { kind: 'tatebori', pts: [[-37, -251], [-52, -231], [-60, -206]], w: 4, deep: 2.4 },
    { kind: 'tatebori', pts: [[48, -255], [61, -237], [66, -214]], w: 4, deep: 2.4 }], // 木戸の前は土橋を残す
  // gate: 'kabuki'（冠木門。戦国期の簡素な木戸。近世の櫓門・鉄門は使わない）
  koguchi: [
    { id: 'kido_outer', name: GATE_OUTER.name, at: [GATE_OUTER.x, GATE_OUTER.z], gate: 'kabuki' },
    { id: 'kido_hachiman', name: GATE_HACHIMAN.name, at: [GATE_HACHIMAN.x, GATE_HACHIMAN.z], gate: 'kabuki' },
    { id: 'kido_ni', name: GATE_NI.name, at: [GATE_NI.x, GATE_NI.z], gate: 'kabuki' },
    { id: 'kido_shu', name: GATE_SHU.name, at: [GATE_SHU.x, GATE_SHU.z], gate: 'kabuki' },
    { id: 'kido_hon', name: GATE_HON.name, at: [GATE_HON.x, GATE_HON.z], gate: 'kabuki' },
  ],
  paths: [{ id: 'tozan', kind: 'ote', pts: ROAD }, ...SIDE_ROADS.map((pts, i) => ({ id: 'eda' + i, pts }))],
  // 物見の櫓（天守でなく、尾根を見張る程度の高い建物）
  yagura: [{ id: 'monomi_outer', at: [-9, -166], name: '三の丸の物見' }, { id: 'monomi_hon', at: [7, -265], name: '本丸の櫓' },
    { id: 'taiko', at: [28, -217], name: '出丸の太鼓櫓' },
    { id: 'hachiman_monomi', at: [39, -205], name: '八幡曲輪の物見' }],
};

// 読み込み時に一度だけ、曲輪・道・堀・建物の基準点を同じ尾根へ移す。
for (const p of [OUTER, HACHIMAN, NI, SHU, HON, GATE_OUTER, GATE_HACHIMAN, GATE_NI, GATE_SHU, GATE_HON]) [p.x, p.z] = castlePoint(p.x, p.z);
for (const path of IWAMURA_CASTLE_PLAN.paths) for (const p of path.pts) [p[0], p[1]] = castlePoint(p[0], p[1]);
for (const k of IWAMURA_CASTLE_PLAN.kuruwa) {
  k.poly = k.poly.map(([x, z]) => castlePoint(x, z));
  if (k.gapAt) k.gapAt = castlePoint(...k.gapAt);
}
for (const h of IWAMURA_CASTLE_PLAN.hori) h.pts = h.pts.map(([x, z]) => castlePoint(x, z));
// 二の丸と主郭の間に4.4m幅の堀を収め、中央の土橋を残す。
for (const h of IWAMURA_CASTLE_PLAN.hori.slice(0, 2)) for (const p of h.pts) p[1] = -294.13;
// 裏の堀切・竪堀は広げた帯曲輪の外へ出す。平場をならす処理で堀が埋まらないようにする。
IWAMURA_CASTLE_PLAN.hori[2].pts = [[-60, -398], [-7, -398]];
IWAMURA_CASTLE_PLAN.hori[3].pts = [[7, -398], [64, -398]];
IWAMURA_CASTLE_PLAN.hori[4].pts = [[-58, -360], [-70, -326], [-80, -288]];
IWAMURA_CASTLE_PLAN.hori[5].pts = [[60, -350], [72, -320], [80, -280]];
for (const y of IWAMURA_CASTLE_PLAN.yagura) y.at = castlePoint(...y.at);
IWAMURA_CASTLE_PLAN.lordSeat.at = [HON.x, HON.z];
// 二の丸は約53×62m、出丸は約33×44m。本丸の南北は42m、既存の東西幅は縮めない。
IWAMURA_CASTLE_PLAN.kuruwa.find((k) => k.id === 'ni').poly = [[-36.5, -229.9], [4, -229.9], [16.5, -247.9], [11, -291.9], [-36.5, -291.9]];
IWAMURA_CASTLE_PLAN.kuruwa.find((k) => k.id === 'demaru').poly = [[23, -313], [56, -313], [56, -274], [42.5, -269], [23, -274]];
IWAMURA_CASTLE_PLAN.yagura.find((y) => y.id === 'taiko').at = [38, -278];
// 帯曲輪は西だけで終わらせず、本丸裏を回って東曲輪へつなぐ。外側は板葺きの土塀。
const obi = IWAMURA_CASTLE_PLAN.kuruwa.find((k) => k.id === 'obi');
obi.poly = [[-52, -246], [-40, -246], [-40, -376], [42, -376], [42, -324], [54, -324], [54, -388], [-52, -388]];
obi.wall = 'dobei'; obi.wallOpt = { ita: true };
SIDE_ROADS[2].splice(0, SIDE_ROADS[2].length, [NI.x, NI.z], [-24, -268], [-46, -278], [-46, -318]);
SIDE_ROADS[9].splice(0, SIDE_ROADS[9].length, [-46, -318], [-46, -382], [0, -382], [48, -382], [48, -354], [28, -354]);
// 建物そのものの大きさは広げない。枝道の終点だけを、移した建物の南の戸口へ戻す。
SIDE_ROADS[4].splice(0, SIDE_ROADS[4].length, [24, -206], [34, -214], [34, castlePoint(34, -201)[1] + 2]);
SIDE_ROADS[6].splice(0, SIDE_ROADS[6].length, [NI.x, NI.z], [-10, -274], [-16, -274], [-16, castlePoint(-16, -216)[1] + 3]);
SIDE_ROADS[7].splice(0, SIDE_ROADS[7].length, [SHU.x, SHU.z], [6, -326], [1, -326], [1, castlePoint(1, -238)[1] + 3]);
const backRoad = [[0, -382], [-15, -375], [-17, -361], [-9, -341], [1, -340]];
SIDE_ROADS.push(backRoad); IWAMURA_CASTLE_PLAN.paths.push({ id: 'ura', pts: backRoad });
IWAMURA_CASTLE_PLAN.koguchi.push({ id: 'kido_ura', name: '本丸の裏木戸', at: [-15, -375], gate: 'kabuki', rot: 0, w: 3.8 });

// 木戸は道の点だけでなく、道が曲輪の縁を横切る所へ置く。門の柱と塀の口を一致させる。
for (const [index, g] of IWAMURA_CASTLE_PLAN.koguchi.entries()) {
  const path = index < 5 ? ROAD : backRoad;
  if (index < 5) g.at = castlePoint(...g.at);
  const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => q.id === ['outer', 'hachiman', 'ni', 'shu', 'hon', 'hon'][index]);
  const i = path.findIndex(([x, z]) => x === g.at[0] && z === g.at[1]);
  let best = Infinity, at = g.at, rot = 0, crossing = 1;
  for (let n = index < 5 ? Math.max(1, i) : 1; n <= (index < 5 ? Math.min(path.length - 1, i + 1) : path.length - 1); n++) {
    const a = path[n - 1], b = path[n], dx = b[0] - a[0], dz = b[1] - a[1];
    for (let j = 0; j < k.poly.length; j++) {
      const c = k.poly[j], d = k.poly[(j + 1) % k.poly.length], ex = d[0] - c[0], ez = d[1] - c[1];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 1e-8) continue;
      const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / cross;
      const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / cross;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const p = [a[0] + t * dx, a[1] + t * dz], distance = Math.hypot(p[0] - g.at[0], p[1] - g.at[1]);
      if (distance < best) { best = distance; at = p; rot = Math.atan2(-dx, -dz); crossing = n; }
    }
  }
  if (index < 5 && i >= 0) path[i] = at;
  else path.splice(crossing, 0, at);
  g.at = at; g.rot = rot; g.w = 3.8; k.gapAt = at;
  if (index < 5) { const marker = [GATE_OUTER, GATE_HACHIMAN, GATE_NI, GATE_SHU, GATE_HON][index]; [marker.x, marker.z] = at; }
}

// 道が曲輪の縁を横切る所は、入口も出口も柵を空ける。読み込み時に一度だけ求める。
for (const k of IWAMURA_CASTLE_PLAN.kuruwa) {
  const gaps = k.gapAt ? [k.gapAt] : [];
  for (const { pts } of IWAMURA_CASTLE_PLAN.paths) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], dx = pts[i][0] - ax, dz = pts[i][1] - az;
    for (let j = 0; j < k.poly.length; j++) {
      const [bx, bz] = k.poly[j], q = k.poly[(j + 1) % k.poly.length], ex = q[0] - bx, ez = q[1] - bz;
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 1e-8) continue;
      const t = ((bx - ax) * ez - (bz - az) * ex) / cross;
      const u = ((bx - ax) * dz - (bz - az) * dx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const at = [ax + t * dx, az + t * dz];
        if (!gaps.some(([x, z]) => Math.hypot(x - at[0], z - at[1]) < 1)) gaps.push(at);
      }
    }
  }
  if (gaps.length) k.gapAt = gaps;
}

// 水晶山：汎用の原点中心の陣城をやめ、実際の柵・本陣・小屋の位置へ合わせる。
// 水精山の夜襲以外、砦の寸法・土塁・兵糧所の位置は推定。北の口は8m幅。
export const IWAMURA_SUISHOZAN_PLAN = {
  name: '水晶山砦', mon: 'oda', type: 'jin', year: 1575,
  kuruwa: [
    { id: 'honjin', name: '水晶山の陣', poly: [[-60, -2], [-8, -6], [8, -6], [60, -2], [60, 80], [-60, 80]], level: (bf) => bf(0, 44), wall: 'saku', dorui: 1.2, gapAt: [[0, -6], [60, 12], [0, 80]] },
  ],
  koguchi: [{ id: 'kido', name: '陣の北の口', at: [0, -6], w: 8 }],
  paths: [{ pts: [[0, -90], [0, -6], [0, 34]] }, { pts: [[-15, 35], [-15, 60], [0, 60], [0, 48]] }],
  yagura: [{ id: 'monomi_west', at: [-30, 2], name: '陣の西の物見' }, { id: 'monomi_east', at: [30, 2], name: '陣の東の物見' }],
  hori: [],
};
