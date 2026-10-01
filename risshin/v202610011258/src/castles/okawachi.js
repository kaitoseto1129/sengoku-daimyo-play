// ======================================================================
// castles/okawachi.js … 大河内城の縄張り（永禄十二年九月八日の夜攻め）
// 平山城。西の搦手（からめて）に木戸、北へ回ると大手。ここでは搦手の夜攻めだけを縄張りにする
// （大手は b_okawachi.js 側で遠景の囲みとして描くだけで、曲輪には含めない＝史実どおり力攻めは搦手のみ）。
// 曲輪は一つ（搦手口の曲輪）。奥（本丸・北畠具教の陣）は囲みの外・遠景のまま（落とす戦ではないため）。
// 向き：南（+z）に織田の陣。北（-z）へ上がった先、搦手口の木戸の向こう（さらに -z）が城の内。
// ======================================================================

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const GATE = { x: 0, z: -60, name: '搦手の木戸' };
export const MAE_C = { x: 0, z: -40 };   // 搦手の前（味方が保てば WIN.timeHeld）
export const JO_C = { x: 0, z: -76 };    // 搦手口の曲輪（木戸の内。押し返されても良い場）
export const OTE_HINT = { x: 86, z: -70 }; // 大手（遠景。引きつけの的）

export const ROAD_KARAMETE = [[0, 40], [0, 0], [0, -24], [MAE_C.x, MAE_C.z], [0, -52], [GATE.x, GATE.z], [JO_C.x, JO_C.z]];

export const OKAWACHI_PLAN = {
  name: '大河内城（搦手）', type: 'hira',
  kuruwa: [
    // 搦手の前：味方の攻め口。曲輪ではなく只の段だが、siege_zones の場として使うため kuruwa に書く（wall なし）
    { id: 'mae', name: '搦手の前', level: 1, poly: rect(-30, 30, -52, -28) },
    // 搦手口の曲輪：木戸の内。押し返されれば味方はここから退く
    { id: 'jo', name: '搦手口の曲輪', level: 3, wall: 'saku', hp: 700, poly: rect(-40, 40, -92, -62), gapAt: [[GATE.x, GATE.z]] },
  ],
  koguchi: [
    { id: 'karamete', name: GATE.name, from: 'mae', to: 'jo', kind: 'hira', gate: 'kabuki', at: [GATE.x, GATE.z], rot: 0, w: 7 },
  ],
  paths: [
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
  ],
  hori: [],
  yagura: [
    { id: 'yagura_w', kind: 'sumi', at: [-16, GATE.z - 4], rot: 0 },
    { id: 'yagura_e', kind: 'sumi', at: [16, GATE.z - 4], rot: 0 },
  ],
};
