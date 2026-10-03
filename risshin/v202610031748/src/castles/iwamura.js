// ======================================================================
// castles/iwamura.js … 岩村城・水晶山（docs/late6b-1575-1578-spec.md 1〜15章）
// 二つの縄張り：
//  ・IWAMURA_CASTLE_PLAN … 岩村城そのもの（戦国期・秋山虎繁が籠る城）。山麓から本丸まで、
//    外側曲輪→八幡曲輪→二の丸→主郭→本丸と段を重ねる。石垣は本丸の足元の一部だけ（一部石積み）。
//    ほかは土塁・切岸・木柵。今見える六段壁・大石垣・近世の門構えは使わない。
//  ・IWAMURA_SUISHOZAN_PLAN … 水晶山の織田の陣（HIST_B）。大城塞にせず陣幕・柵・簡易な物見。
// castle_plan.js の形（kuruwa・koguchi・paths・yagura・hori）で書く。地形の下地・兵・戦い方は b_iwamura.js 側。
// ======================================================================
import { jinshiroFortPlan } from '../castle_plan.js';

import { switchback } from '../yamalift.js';
function circle(cx, cz, r, n = 10) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 資料に曲輪の寸法・大手と搦手の方位は無いので、既存の寸法と南の攻め口を保つ。
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

// 本丸の南に細長い出丸、東に東曲輪、西の斜面に帯曲輪。寸法は既存の曲輪に合わせた遊び用。
export const SIDE_ROADS = [
  [[SHU.x, SHU.z], [22, -240], [28, -234], [28, -220]],
  [[28, -234], [28, -246], [28, -258]],
  [[NI.x, NI.z], [-26, -222], [-26, -238]],
];

export const IWAMURA_CASTLE_PLAN = {
  mon: 'takeda',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '岩村城', type: 'yama', year: 1575,
  // 大将の居場所（kaito 10/2）：本丸の主殿の奥の間に秋山虎繁（大天守は無い。戸口は南の本丸の木戸の側）
  lordSeat: { kind: 'goten', at: [HON.x, HON.z], w: 12, d: 7, rot: 0, door: 1, name: '主殿', where: '本丸の主殿の奥の間' },
  kuruwa: [
    { id: 'outer', name: '三の丸', poly: circle(OUTER.x, OUTER.z, 12), level: (bf) => bf(OUTER.x, OUTER.z), wall: 'saku', gapAt: [GATE_OUTER.x, GATE_OUTER.z] },
    { id: 'hachiman', name: '八幡曲輪', poly: circle(HACHIMAN.x, HACHIMAN.z, 11), level: (bf) => bf(HACHIMAN.x, HACHIMAN.z) + 1.5, wall: 'saku', gapAt: [GATE_HACHIMAN.x, GATE_HACHIMAN.z] },
    { id: 'ni', name: '二の丸', poly: circle(NI.x, NI.z, 11), level: (bf) => bf(NI.x, NI.z) + 3, wall: 'saku', gapAt: [GATE_NI.x, GATE_NI.z] },
    { id: 'shu', name: '主郭', poly: circle(SHU.x, SHU.z, 10), level: (bf) => bf(SHU.x, SHU.z) + 4.5, wall: 'saku', gapAt: [GATE_SHU.x, GATE_SHU.z] },
    { id: 'demaru', name: '出丸', poly: [[22, -246], [34, -246], [34, -208], [22, -208]], level: (bf) => bf(SHU.x, SHU.z) + 4.5, wall: 'saku' },
    { id: 'higashi', name: '東曲輪', poly: circle(28, -258, 8), level: (bf) => bf(HON.x, HON.z) + 3, wall: 'saku' },
    { id: 'obi', name: '帯曲輪', poly: [[-32, -259], [-20, -259], [-20, -222], [-32, -222]], level: (bf) => bf(NI.x, NI.z) + 3, wall: 'saku' },
    // 本丸：最高所。足元だけ一部石積み（戦国期の在地の積み方。六段壁のような総石垣にはしない）
    { id: 'hon', name: '本丸', poly: circle(HON.x, HON.z, 13), level: (bf) => bf(HON.x, HON.z) + 6, wall: 'ishigaki', gapAt: [GATE_HON.x, GATE_HON.z] },
  ],
  // 堀切：二の丸と主郭の間で尾根を断つ（横に回り込みにくくする）
  hori: [{ kind: 'horikiri', pts: [[-20, -229], [-3, -229]], w: 4.4, deep: 3.6 },
    { kind: 'horikiri', pts: [[7, -229], [20, -229]], w: 4.4, deep: 3.6 }], // 木戸の前は土橋を残す
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
  yagura: [{ id: 'monomi_outer', at: [-9, -166], name: '三の丸の物見' }, { id: 'monomi_hon', at: [10, -255], name: '本丸の櫓' },
    { id: 'taiko', at: [28, -213], name: '出丸の太鼓櫓' }],
};

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

// 水晶山の織田の陣（HIST_B。陣城の形だけ借りる。柵・陣幕・簡易な物見で、大城塞にしない）
export const IWAMURA_SUISHOZAN_PLAN = jinshiroFortPlan({ name: '水晶山砦', r: 30, level: 0.5 });
// 陣の内を真っ平らにすると、周りの丘（gauss の起伏）との段差が目立つので、下地の高さに合わせて平らにする
// （buildCastlePlan に baseHeight を渡した戦でだけ効く。level が関数の時は heightOf が baseFn(0,0) を渡す）
IWAMURA_SUISHOZAN_PLAN.kuruwa[0].level = (baseFn) => baseFn(0, 0);
