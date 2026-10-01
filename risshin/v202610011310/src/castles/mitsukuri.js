// ======================================================================
// castles/mitsukuri.js … 箕作城の縄張り（永禄十一年・夜攻め）
// 山城の曲輪三つ：三の郭（坂の上・開けた段）→ 二の郭（木戸構え）→ 本丸（切岸の上）。
// castle_plan.js の形（kuruwa・koguchi・paths）で書く。地形・兵の配置・戦い方は b_mitsukuri.js 側。
// 向き：南（+z）が織田の陣・大手。北（-z）へ登るほど高い。木戸は三の郭と二の郭の間、
// 二の郭から本丸へは門を構えず、切岸（急な縁。heightOf の edgeW）をそのまま攻め登る。
// ======================================================================

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const SAN_C = { x: 0, z: -56 };   // 三の郭：坂の守りの段
export const NI_C = { x: 0, z: -80 };    // 二の郭：木戸構え
export const HON_C = { x: 0, z: -100 };  // 本丸
export const KIDO = { x: 0, z: -64, name: '木戸' };
export const NISHI_TANI_X = -34;         // 西の谷（松明を消して回る道）

// 大手道（南の陣から、三の郭→木戸→二の郭→切岸→本丸）
export const ROAD_OTE = [[0, 40], [0, 0], [0, -30], [SAN_C.x, SAN_C.z], [0, -64], [KIDO.x, KIDO.z], [0, -80], [NI_C.x, NI_C.z], [0, -92], [HON_C.x, HON_C.z]];
// 谷の道（西の谷筋を松明を消して忍び登り、木戸を避けて二の郭の脇へ出る）
export const ROAD_TANI = [[-30, -4], [NISHI_TANI_X, -36], [-24, -60], [-10, -74], [NI_C.x - 4, NI_C.z - 2]];

export const MITSUKURI_PLAN = {
  name: '箕作城', type: 'yama', year: 1568,
  kuruwa: [
    // 三の郭：まだ柵を構えぬ開けた坂の段（坂の守りが槍を並べる場。sakamogi は b_mitsukuri.js 側で飾る）
    { id: 'san', name: '三の郭（坂の上）', level: 2, poly: rect(-20, 20, -64, -44) },
    // 二の郭：木戸を構えた曲輪。南に木戸、北は切岸で本丸へ
    { id: 'ni', name: '二の郭（木戸構え）', level: 6, wall: 'saku', hp: 460, poly: rect(-16, 16, -92, -64), gapAt: [[KIDO.x, KIDO.z], [0, -92]] },
    // 本丸：いちばん高い。切岸を登った先。城将の衆が最後に守る
    { id: 'hon', name: '本丸', level: 11, wall: 'saku', hp: 560, poly: rect(-10, 10, -110, -92), gapAt: [[0, -92]] },
  ],
  koguchi: [
    { id: 'kido', name: KIDO.name, from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [KIDO.x, KIDO.z], rot: 0, w: 3.6 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'tani', kind: 'tani', pts: ROAD_TANI },
  ],
  hori: [],
  yagura: [
    { id: 'monomi_ni', kind: 'monomi', at: [13, -78] },
  ],
};
