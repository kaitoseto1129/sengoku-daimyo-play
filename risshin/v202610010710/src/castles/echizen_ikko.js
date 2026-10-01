// ======================================================================
// castles/echizen_ikko.js … 越前一向一揆の山の寺（大滝寺）の縄張り（docs/siege-plan.md 7-9・mountain-spec 32）
// castle_plan.js の形（kuruwa・koguchi・paths・yagura）で書く。地形・部品・兵の配置は b_echizen_ikko.js 側。
// 山麓の村→参道（表）→外堂（講堂・僧坊）→中心伽藍（本堂）→奥の院（逃げ道・加賀側の山へ）の四段。
// 谷の道は森の中を回り、伏兵に向く（mountain-spec 8・21章）。比叡山（hiei.js）と同じ考え方の、別の山。
// ======================================================================

// 山麓の村（攻め手の陣）
export const VILLAGE = { x: 0, z: -200, name: '山麓の村' };
// 口（惣門・山門）
export const GATE_SOMON = { x: 0, z: -86, name: '惣門' };
export const GATE_SANMON = { x: 0, z: -6, name: '本堂前の山門' };
// 奥の院から、さらに山奥（加賀側）へ逃げる道の出口
export const OKUYAMA = { x: -36, z: 118, name: '奥山道（加賀側へ）' };

// 参道（表）：村 → 惣門 → 外堂 → 山門 → 本堂
export const SANDO = [[VILLAGE.x, VILLAGE.z], [0, -150], [-2, -110], [GATE_SOMON.x, GATE_SOMON.z], [2, -46], [0, -20], [GATE_SANMON.x, GATE_SANMON.z], [0, 20]];
// 谷の道（森の中を右から回り込む。伏兵に向く・見通しが悪い）
export const VALLEY_ROAD = [[26, -140], [34, -104], [28, -62], [16, -26], [6, 2]];
// 奥の院から奥山道（加賀側）への逃げ道
export const OKU_ROAD = [[0, 44], [-14, 72], [OKUYAMA.x, OKUYAMA.z]];

// 森の区域（この外は見通しが開ける）
export const FOREST_POLY = [[14, -150], [48, -130], [50, -40], [20, 20], [0, -10], [8, -140]];
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
  paths: [{ pts: SANDO }, { pts: VALLEY_ROAD }, { pts: OKU_ROAD }],
  yagura: [{ id: 'monomi', kind: 'monomi', at: [30, -34] }],
};
