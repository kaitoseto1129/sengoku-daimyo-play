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

// 地理院5m標高読み（docs/layout-ref/nawabari-measured.md「岩村（二回目）」、±10m）。
// 本丸51×31m、北の次段70×33m・比高6m、北西への平場約250m。縮尺は1対1。
// b_iwamura.js の北は -z。明和三年平面図と標高図の平場の並びを照合し、城内だけ反転する。
// 旧座標を使う兵・建物も同じ点へ移す。夜討ち・追撃が起きる麓（z >= -160）は保つ。
const RIDGE_STATIONS = [[-160, -150, -408], [-172, -150, -390], [-184, -86, -358], [-196, -86, -335],
  [-218, 10, -273], [-240, -6, -238], [-246, 0, -220], [-258, 0, -190], [-271, 0, -164.5]];
export function castlePoint(x, z) {
  if (z > -160) return [x, z];
  for (let i = 1; i < RIDGE_STATIONS.length; i++) {
    const a = RIDGE_STATIONS[i - 1], b = RIDGE_STATIONS[i];
    if (z >= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      return [x + a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return [x, -164.5 - (z + 271)];
}

// 戦国期の虎口の細部は未確定。輪郭は標高読みへ寄せ、細部は推定で補う。
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

// 枝道も平場と一緒に移す。曲輪名と輪郭の細部は推定。
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
  // 切岸の縁と木戸脇で高さを跳ねさせず、土の段を連続した山肌へつなぐ。
  continuousEdges: true,
  // 大将の居場所（kaito 10/2）：本丸の主殿の奥の間に秋山虎繁（大天守は無い。戸口は南の本丸の木戸の側）
  lordSeat: { profile: 'iwamura', kind: 'goten', at: [HON.x, HON.z], w: 12, d: 7, rot: 0, door: 1, earth: 0x9b805b, name: '主殿', where: '本丸の主殿の奥の間' },
  // 同じ山頂の下地から段を下げる。二の丸の下地の尾根が本丸より高くなる逆転を防ぐ。
  kuruwa: [
    { id: 'outer', name: '三の丸', poly: [[-12, -160], [8, -160], [14, -174], [5, -182], [-12, -180]], level: (bf) => bf(HON.x, HON.z) - 28, wall: 'saku', gapAt: [GATE_OUTER.x, GATE_OUTER.z] },
    { id: 'hachiman', name: '八幡曲輪', poly: [[-12, -182], [28, -181], [44, -187], [44, -209], [19, -210], [-5, -203]], level: (bf) => bf(HON.x, HON.z) - 18, wall: 'dobei', wallOpt: { ita: true, tera: true, earth: 0x9b805b }, dorui: 1.6, gapAt: [GATE_HACHIMAN.x, GATE_HACHIMAN.z] },
    { id: 'ni', name: '二の丸', poly: [[-22, -208], [-2, -207], [3, -216], [-1, -227], [-22, -227]], level: (bf) => bf(HON.x, HON.z) - 10, wall: 'saku', gapAt: [GATE_NI.x, GATE_NI.z] },
    { id: 'shu', name: '主郭', poly: [[-5, -230], [14, -230], [16, -239], [8, -246], [-5, -245]], level: (bf) => bf(HON.x, HON.z) - 2, wall: 'saku', gapAt: [GATE_SHU.x, GATE_SHU.z] },
    { id: 'demaru', name: '出丸', poly: [[22, -246], [34, -246], [34, -214], [29, -208], [22, -213]], level: (bf) => bf(HON.x, HON.z) - 2, wall: 'saku' },
    { id: 'higashi', name: '東曲輪', poly: circle(28, -258, 8), level: (bf) => bf(HON.x, HON.z) + 3, wall: 'saku' },
    { id: 'obi', name: '帯曲輪', poly: [[-32, -259], [-20, -259], [-20, -222], [-32, -222]], level: (bf) => bf(HON.x, HON.z) - 10, wall: 'saku' },
    // 本丸を最高所にそろえる。江戸期の石垣の輪を戦国期の確定した形にしない。
    { id: 'hon', name: '本丸', poly: [[-13, -246], [10, -246], [13, -255], [8, -271], [-10, -271], [-14, -259]], level: (bf) => bf(HON.x, HON.z) + 6, wall: 'dobei', wallOpt: { ita: true, tera: true, earth: 0x9b805b }, dorui: 1.5, gapAt: [GATE_HON.x, GATE_HON.z] },
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

// 設営前に一度だけ移す。兵と建物の基準点・道・木戸を共通にする。
for (const p of [OUTER, HACHIMAN, NI, SHU, HON, GATE_OUTER, GATE_HACHIMAN, GATE_NI, GATE_SHU, GATE_HON]) [p.x, p.z] = castlePoint(p.x, p.z);
for (const path of IWAMURA_CASTLE_PLAN.paths) for (const p of path.pts) [p[0], p[1]] = castlePoint(p[0], p[1]);
for (const k of IWAMURA_CASTLE_PLAN.kuruwa) {
  k.poly = k.poly.map(([x, z]) => castlePoint(x, z));
  if (k.gapAt) k.gapAt = castlePoint(...k.gapAt);
}
for (const y of IWAMURA_CASTLE_PLAN.yagura) y.at = castlePoint(...y.at);
IWAMURA_CASTLE_PLAN.lordSeat.at = [HON.x, HON.z];
const curve = (id) => IWAMURA_CASTLE_PLAN.kuruwa.find((k) => k.id === id);
// 平場の外形は標高読み。曲輪名・塀・建物の細部は推定のまま。
curve('hon').poly = [[-15.5, -215.5], [15.5, -215.5], [15.5, -164.5], [-15.5, -164.5]];
curve('shu').poly = [[-16.5, -290], [16.5, -290], [16.5, -220], [-16.5, -220]];
curve('shu').level = (bf) => bf(HON.x, HON.z);
// 二の丸は同じ大きな段の北半分。内側に柵や土手を重ねて道を塞がない。
curve('ni').poly = [[-16.5, -290], [16.5, -290], [16.5, -255], [-16.5, -255]];
curve('ni').level = curve('shu').level; curve('ni').wall = null; curve('ni').dorui = 0;
curve('outer').poly = [[-162, -408], [-138, -408], [-136, -390], [-145, -380], [-162, -384]];
curve('hachiman').poly = [[-98, -358], [-48, -358], [-48, -312], [-98, -312]];
curve('demaru').poly = [[-58, -225], [-22, -225], [-22, -173], [-58, -173]];
curve('demaru').level = (bf) => bf(HON.x, HON.z) - 4;
curve('higashi').poly = circle(59, HON.z, 8);
curve('higashi').level = (bf) => bf(HON.x, HON.z) + 2;
const obi = curve('obi');
obi.poly = [[-39, -290], [-27, -290], [-27, -154], [78, -154], [78, -198], [90, -198], [90, -142], [-39, -142]];
obi.wall = 'dobei'; obi.wallOpt = { ita: true, tera: true, earth: 0x9b805b };
// 麓から北西の低い段へ回る。山頂の南面・東面を突き抜ける一本道を残さない。
// 元の終点も置き換える。迂回の後で南の山腹へ戻る線を残さない。
ROAD.splice(6, 1, [45, -165], [45, -240], [24, -315], [-110, -370]);
SIDE_ROADS[0].splice(0, SIDE_ROADS[0].length, [SHU.x, SHU.z], [-30, -238], [-40, -210]);
SIDE_ROADS[1].splice(0, SIDE_ROADS[1].length, [-40, -210], [-40, -199], [-22, -199], [15.5, -199], [59, -190]);
SIDE_ROADS[2].splice(0, SIDE_ROADS[2].length, [NI.x, NI.z], [-33, -273], [-33, -238]);
SIDE_ROADS[9].splice(0, SIDE_ROADS[9].length, [-33, -238], [-33, -148], [0, -148], [84, -148], [84, -190], [59, -190]);
// 移した各建物の南の戸口へつなぐ。建物の大きさは変えない。
for (const [index, from, x, z, door] of [[4, HACHIMAN, 34, -201, 2], [6, NI, -16, -216, 3], [7, SHU, 1, -238, 3], [8, OUTER, -7, -174, 2]]) {
  const at = castlePoint(x, z);
  SIDE_ROADS[index].splice(0, SIDE_ROADS[index].length, [from.x, from.z], [at[0], at[1] + door]);
}
const backRoad = [[0, -148], [0, -164.5], [0, -176], [1, -186]];
SIDE_ROADS.push(backRoad); IWAMURA_CASTLE_PLAN.paths.push({ id: 'ura', pts: backRoad });
IWAMURA_CASTLE_PLAN.koguchi.push({ id: 'kido_ura', name: '本丸の裏木戸', at: [0, -164.5], gate: 'kabuki', rot: 0, w: 3.8 });
// 同じ平場の途中にあった堀切は北側の段間へ出し、道の土橋を残す。
IWAMURA_CASTLE_PLAN.hori = [
  { kind: 'horikiri', pts: [[-65, -301], [-43, -301]], w: 4.4, deep: 3.6 },
  { kind: 'horikiri', pts: [[-27, -301], [37, -301]], w: 4.4, deep: 3.6 },
  { kind: 'horikiri', pts: [[-180, -419], [-153, -419]], w: 6, deep: 3 },
  { kind: 'horikiri', pts: [[-143, -419], [-115, -419]], w: 6, deep: 3 },
  { kind: 'tatebori', pts: [[-45, -275], [-60, -253], [-72, -228]], w: 4, deep: 2.4 },
  { kind: 'tatebori', pts: [[35, -273], [50, -251], [62, -229]], w: 4, deep: 2.4 },
];
IWAMURA_CASTLE_PLAN.yagura.find((y) => y.id === 'taiko').at = [-48, -181];
IWAMURA_CASTLE_PLAN.yagura.find((y) => y.id === 'hachiman_monomi').at = [-55, -322];
IWAMURA_CASTLE_PLAN.gateSlope = 8;
// 写真の土の山城を形の参考に、上段は板塀、尾根の出丸は丸太柵に分ける。
// 戦国期の個々の囲いは推定。平場・切岸・堀切と門の位置は動かさない。
for (const id of ['outer', 'shu', 'demaru', 'higashi']) {
  curve(id).wallOpt = { openFence: true, noBrace: true, mound: false };
}
// 本の板塀は乱杭の尖端ではなく、雨を流す板の笠で頂部をそろえる。
// 高画質だけで選ぶ形。縁・狭間・通路の口と当たりは従来のまま。
for (const id of ['hon', 'hachiman', 'obi']) curve(id).wallOpt.boardCap = true;
// 板塀を内側の横桟で留める。凹んだ帯曲輪も輪郭の巻き順から内面を決める。
// 外面の縦目地・狭間・笠板は前巡の形を保つ。高画質だけで使う指定。
for (const id of ['hon', 'hachiman', 'obi']) {
  const k = curve(id);
  const area = k.poly.reduce((sum, p, i) => {
    const q = k.poly[(i + 1) % k.poly.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  k.wallOpt.boardRailsSide = area >= 0 ? 1 : -1;
}
// 主殿と侍屋敷は薄い板葺きへ。寺社の屋根はそのまま残す（材の細部は推定）。
IWAMURA_CASTLE_PLAN.lordSeat.boardRoof = true;
// 一律十メートルの物見をやめ、上段の高井楼と下段の低い物見を分ける。
// 高さは復元上の推定。梯子・床・射手の立ち位置は同じ指定から組まれる。
for (const y of IWAMURA_CASTLE_PLAN.yagura) {
  y.height = { monomi_outer: 6.4, monomi_hon: 9.2, taiko: 7.2, hachiman_monomi: 6.4 }[y.id];
}

// 木戸は道の点だけでなく、道が曲輪の縁を横切る所へ置く。門の柱と塀の口を一致させる。
for (const [index, g] of IWAMURA_CASTLE_PLAN.koguchi.entries()) {
  const path = index < 5 ? ROAD : backRoad;
  if (index < 5) g.at = castlePoint(...g.at);
  const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => q.id === ['outer', 'hachiman', 'ni', 'shu', 'hon', 'hon'][index]);
  const i = path.findIndex(([x, z]) => x === g.at[0] && z === g.at[1]);
  let best = Infinity, at = g.at, rot = 0, crossing = 1;
  for (let n = 1; n < path.length; n++) {
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
  if (index < 5 && i >= 0 && (crossing === i || crossing === i + 1)) path[i] = at;
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
  // 柵の両口を結ぶ道（z14）から十二メートル離す。柱・南の梯子と小屋の間も空ける（配置は推定）。
  yagura: [{ id: 'monomi_west', at: [-34, 26], name: '陣の西の物見' }, { id: 'monomi_east', at: [34, 26], name: '陣の東の物見' }],
  hori: [],
};
