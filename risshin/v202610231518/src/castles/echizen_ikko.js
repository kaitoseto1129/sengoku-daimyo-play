// ======================================================================
// castles/echizen_ikko.js … 越前一向一揆の山の寺（大滝寺）の縄張り（late6-1573-1575-spec 80-96）
// castle_plan.js の形（kuruwa・koguchi・paths・yagura）で書く。地形・部品・兵の配置は b_echizen_ikko.js 側。
// 山麓の村・五箇和紙の里→参道（表）→外堂（講堂・僧坊）→中心伽藍（本堂）→奥の院（山奥への道）の四段。
// 入る道は A 参道（表）・B 谷川沿い（右）・C 森の小道（左・遠回りだが静か）の三つ（spec 80-96）。
// 谷川沿いの道は森の中を回り、伏兵に向く。森の小道は左の森を抜け、音が少ないが長い。
// ======================================================================

// 越前和紙の里の由緒は山麓・山頂の堂塔を伝えるが、戦国期の実測図は未確認。
// 三段の平場の寸法、土塁・柵、空堀、門と見張りの位置は越前の山寺としての推定。
// 現在の江戸期の社殿・屋根を1575年へ写さず、堂は板葺きで補う。
// 実測の縄張り図は未確認。+z は山上へ進む向きで、史実の方位・距離は表さない。
// 山麓の村（攻め手の陣）と、寺と一体の五箇和紙の里
export const VILLAGE = { x: 0, z: -200, name: '山麓の村' };
export const GOKA_MURA = { x: -30, z: -176, name: '五箇の和紙の里' };
// 口（惣門・山門）
export const GATE_SOMON = { x: 0, z: -86, name: '惣門' };
export const GATE_SANMON = { x: 0, z: -6, name: '本堂前の山門' };
// 奥の院から、さらに山奥へ逃げる道の出口
export const OKUYAMA = { x: -36, z: 118, name: '奥山道' };

// A 参道（表）：村 → 惣門 → 外堂 → 山門 → 本堂
export const SANDO = [[VILLAGE.x, VILLAGE.z], [0, -150], [-2, -110], [GATE_SOMON.x, GATE_SOMON.z], [2, -46], [0, -20], [GATE_SANMON.x, GATE_SANMON.z], [0, 20]];
// B 谷川沿いの道（右の森の中を回り込む。伏兵に向く・見通しが悪い）
export const VALLEY_ROAD = [[26, -140], [34, -104], [28, -62], [16, -26], [6, 2]];
// C 森の小道（左・五箇の里の裏手から回る。静かだが長い）
export const FOREST_ROAD = [[-30, -150], [-26, -108], [-20, -60], [-20, -38], [-10, -22], [-3, -12], [2, 0], [2, 6]];
// 奥の院から奥山道への逃げ道
export const INNER_ROAD = [[0, 20], [0, 44]];
export const OKU_ROAD = [[0, 44], [0, 74], [-14, 86], [OKUYAMA.x, OKUYAMA.z]];

// 森の区域（この外は見通しが開ける）。右（谷川沿い）と左（森の小道・五箇の里の裏）
export const FOREST_POLY = [[14, -150], [48, -130], [50, -40], [20, 20], [0, -10], [8, -140]];
export const FOREST2_POLY = [[-46, -160], [-8, -150], [-6, -20], [-22, 10], [-48, -40]];
export const CLIFF_X = 50; // これより東は谷底の崖（通れない）

export const ECHIZEN_IKKO_PLAN = {
  name: '大滝寺（越前一向一揆の山の寺）',
  kuruwa: [
    { id: 'gezan', name: '外堂（講堂・僧坊）', poly: [[-22, -70], [22, -70], [22, -34], [-22, -34]], level: (base) => base(0, -52) },
    { id: 'hondo', name: '本堂（中心伽藍）', poly: [[-22, -4], [22, -4], [22, 32], [-22, 32]], level: (base) => base(0, 14) },
    { id: 'oku', name: '奥の院', poly: [[-20, 40], [20, 40], [20, 70], [-20, 70]], level: (base) => base(0, 55) },
  ],
  // 道を横切らない西斜面の浅い空堀。遺構に基づく配置ではない。
  hori: [{ kind: 'karabori', pts: [[-34, -24], [-36, 12], [-32, 34]], w: 5, deep: 1.5 }],
  koguchi: [
    { id: 'gate_somon', name: GATE_SOMON.name, at: [GATE_SOMON.x, GATE_SOMON.z] },
    { id: 'gate_sanmon', name: GATE_SANMON.name, at: [GATE_SANMON.x, GATE_SANMON.z] },
    { id: 'okuyama', name: OKUYAMA.name, at: [OKUYAMA.x, OKUYAMA.z] },
  ],
  paths: [{ pts: SANDO }, { pts: VALLEY_ROAD }, { pts: FOREST_ROAD }, { pts: INNER_ROAD }, { pts: OKU_ROAD }],
  yagura: [{ id: 'monomi', kind: 'monomi', at: [30, -34] }, { id: 'monomiL', kind: 'monomi', at: [-26, -36] }],
  // 竹束（castle_plan.js が自動で置く。惣門・本堂前の山門の手前に数個ずつ）
  taba: [
    [-3, -92], [3, -92], [-3, -12], [3, -12],
  ],
};

// 全ての平場の縁を一度だけ分割。四つの道と門の口を幅十歩で空け、柵と土塁で塞がない。
export const TEMPLE_ROADS = [SANDO, VALLEY_ROAD, FOREST_ROAD, INNER_ROAD, OKU_ROAD];
function roadDistance(x, z) {
  let best = Infinity;
  for (const pts of TEMPLE_ROADS) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
export const TEMPLE_RIMS = ECHIZEN_IKKO_PLAN.kuruwa.flatMap((k) => {
  const out = [];
  for (let i = 0; i < k.poly.length; i++) {
    const [ax, az] = k.poly[i], [bx, bz] = k.poly[(i + 1) % k.poly.length];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    let start = null;
    for (let j = 0; j <= n; j++) {
      const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n;
      const mx = ax + (bx - ax) * (j + .5) / n, mz = az + (bz - az) * (j + .5) / n;
      // 奥の院の社（-10,45）の南の石段へ通す。柵だけでなく、この線から盛る土塁も空ける。
      // 人の半幅と土塁の裾（2.8m）が階段前に残らないよう、左右4mずつ取る。
      const shrineApproach = k.id === 'oku' && az === 40 && bz === 40 && Math.abs(mx + 10) < 4;
      const open = j === n || shrineApproach || roadDistance(mx, mz) < 6;
      if (open && start) { out.push({ id: k.id, pts: [start, [x, z]] }); start = null; }
      if (!open && !start) start = [x, z];
    }
  }
  return out;
});
