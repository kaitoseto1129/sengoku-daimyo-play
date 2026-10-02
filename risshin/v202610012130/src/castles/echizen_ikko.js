// ======================================================================
// castles/echizen_ikko.js … 越前一向一揆の山の寺（大滝寺）の縄張り（late6-1573-1575-spec 80-96）
// castle_plan.js の形（kuruwa・koguchi・paths・yagura）で書く。地形・部品・兵の配置は b_echizen_ikko.js 側。
// 山麓の村・五箇和紙の里→参道（表）→外堂（講堂・僧坊）→中心伽藍（本堂）→奥の院（逃げ道・加賀側の山へ）の四段。
// 入る道は A 参道（表）・B 谷川沿い（右）・C 森の小道（左・遠回りだが静か）の三つ（spec 80-96）。
// 谷川沿いの道は森の中を回り、伏兵に向く。森の小道は左の森を抜け、音が少ないが長い。
// ======================================================================

// 山麓の村（攻め手の陣）と、寺と一体の五箇和紙の里
export const VILLAGE = { x: 0, z: -200, name: '山麓の村' };
export const GOKA_MURA = { x: -30, z: -176, name: '五箇の和紙の里' };
// 口（惣門・山門）
export const GATE_SOMON = { x: 0, z: -86, name: '惣門' };
export const GATE_SANMON = { x: 0, z: -6, name: '本堂前の山門' };
// 奥の院から、さらに山奥（加賀側）へ逃げる道の出口
export const OKUYAMA = { x: -36, z: 118, name: '奥山道（加賀側へ）' };

// A 参道（表）：村 → 惣門 → 外堂 → 山門 → 本堂
export const SANDO = [[VILLAGE.x, VILLAGE.z], [0, -150], [-2, -110], [GATE_SOMON.x, GATE_SOMON.z], [2, -46], [0, -20], [GATE_SANMON.x, GATE_SANMON.z], [0, 20]];
// B 谷川沿いの道（右の森の中を回り込む。伏兵に向く・見通しが悪い）
export const VALLEY_ROAD = [[26, -140], [34, -104], [28, -62], [16, -26], [6, 2]];
// C 森の小道（左・五箇の里の裏手から回る。静かだが長い）
export const FOREST_ROAD = [[-30, -150], [-26, -108], [-18, -60], [-10, -22], [-4, 6]];
// 奥の院から奥山道（加賀側）への逃げ道
export const OKU_ROAD = [[0, 44], [-14, 72], [OKUYAMA.x, OKUYAMA.z]];

// 森の区域（この外は見通しが開ける）。右（谷川沿い）と左（森の小道・五箇の里の裏）
export const FOREST_POLY = [[14, -150], [48, -130], [50, -40], [20, 20], [0, -10], [8, -140]];
export const FOREST2_POLY = [[-46, -160], [-8, -150], [-6, -20], [-22, 10], [-48, -40]];
export const CLIFF_X = 50; // これより東は谷底の崖（通れない）

export const ECHIZEN_IKKO_PLAN = {
  name: '大滝寺（越前一向一揆の山の寺）',
  kuruwa: [
    { id: 'gezan', name: '外堂（講堂・僧坊）', poly: [[-18, -70], [18, -70], [18, -34], [-18, -34]], level: 0.12 },
    { id: 'hondo', name: '本堂（中心伽藍）', poly: [[-18, -4], [18, -4], [18, 32], [-18, 32]], level: 0.26 },
    { id: 'oku', name: '奥の院', poly: [[-16, 40], [16, 40], [16, 70], [-16, 70]], level: 0.4 },
  ],
  koguchi: [
    { id: 'gate_somon', name: GATE_SOMON.name, at: [GATE_SOMON.x, GATE_SOMON.z] },
    { id: 'gate_sanmon', name: GATE_SANMON.name, at: [GATE_SANMON.x, GATE_SANMON.z] },
    { id: 'okuyama', name: OKUYAMA.name, at: [OKUYAMA.x, OKUYAMA.z] },
  ],
  paths: [{ pts: SANDO }, { pts: VALLEY_ROAD }, { pts: FOREST_ROAD }, { pts: OKU_ROAD }],
  yagura: [{ id: 'monomi', kind: 'monomi', at: [30, -34] }, { id: 'monomiL', kind: 'monomi', at: [-26, -36] }],
  // 竹束（castle_plan.js が自動で置く。惣門・本堂前の山門の手前に数個ずつ）
  taba: [
    [-3, -92], [3, -92], [-3, -12], [3, -12],
  ],
};
