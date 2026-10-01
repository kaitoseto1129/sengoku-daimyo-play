// ======================================================================
// castles/kinome.js … 木ノ芽峠の一揆の砦の縄張り（docs/siege-plan.md F2・fort-spec 42・45）
// castle_plan.js の形（kuruwa・koguchi・paths・yagura）で書く。地形・部品・兵の配置は b_kinome.js（戦の定義）側。
// 峠道（南→北）を柵で断ち切った小さな砦。左（西）は崖、右（東）は森。奥に本陣。
// ======================================================================

// 峠道（南の入口→木戸→内郭→本陣）
export const ROAD = [[0, -170], [0, -120], [-3, -70], [0, -30], [2, 0], [0, 30], [-2, 60], [0, 92], [0, 128]];
// 森から回る道（右へ大きく迂回し、本陣の東から迫る＝史実の「浦から回った手」に当たる）
export const FOREST_ROAD = [[20, -18], [26, 14], [24, 48], [14, 70], [4, 84]];
export const GATE_OUT = { x: 0, z: -14, name: '外の木戸' };
export const GATE_IN = { x: 0, z: -4, name: '内の木戸' };
export const HONJIN = { x: 0, z: 66 };
export const TOWER_L = { x: -14, z: 8 };
export const TOWER_R = { x: 14, z: 8 };
export const CLIFF_X = -24;    // これより西は崖（通れない）
export const FOREST_X = 18;    // これより東は森（迂回の道）

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const KINOME_PLAN = {
  name: '木ノ芽峠の砦',
  kuruwa: [
    // 柵・木戸・土塁は b_kinome.js 側で手置きする（ここでは場の当たりと中心だけを持つ）
    // 束19 の欄（castle-fort-system-spec 81 章）：kind・capacity（一度に戦える数）・fallbackTo（退き先）・defenseValue
    { id: 'front', name: '正面の柵の内', poly: rect(-18, 18, -16, 20), level: 0, kind: 'san', capacity: 90, fallbackTo: 'naka', defenseValue: 0.5 },
    { id: 'naka', name: '内郭（予備の詰め所）', poly: rect(-15, 15, 20, 46), level: 0, kind: 'ni', capacity: 70, fallbackTo: 'honjin', defenseValue: 0.6 },
    { id: 'honjin', name: '本陣', poly: rect(-11, 11, 54, 78), level: 0.4, kind: 'hon', capacity: 60, fallbackTo: null, defenseValue: 0.9 },
  ],
  koguchi: [
    // 木戸は狭い（maxFlow 4）。外の木戸が大手の役
    { id: 'gate_out', name: GATE_OUT.name, at: [GATE_OUT.x, GATE_OUT.z], from: 'out', to: 'front', role: 'ote', maxFlow: 4, w: 3, fireResistance: 0.1 },
    { id: 'gate_in', name: GATE_IN.name, at: [GATE_IN.x, GATE_IN.z], from: 'out', to: 'front', maxFlow: 4, w: 3, fireResistance: 0.1 },
  ],
  paths: [{ id: 'touge', kind: 'ote', pts: ROAD }, { id: 'mori', kind: 'karamete', pts: FOREST_ROAD }],
  yagura: [{ id: 'monomiL', at: [TOWER_L.x, TOWER_L.z] }, { id: 'monomiR', at: [TOWER_R.x, TOWER_R.z] }],
};
