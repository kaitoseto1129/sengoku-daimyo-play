// ======================================================================
// castles/hiei.js … 比叡山の山岳戦の縄張り（docs/siege-plan.md M2・mountain-spec 33、0章4）
// castle_plan.js の形（kuruwa・koguchi・paths・yagura）で書く。地形・部品・兵の配置は
// b_hiei_mtn.js（M5、戦の定義）側。ここは道・区域・見張り所・森・退路の「データ」だけを持つ。
// 山道2（坂本からの本坂・無動寺坂）・尾根道1（東塔→西塔）・谷道1（谷沿いに東塔の裏へ）の四つの道。
// ======================================================================

// 坂本側の二つの登り口
export const SAKAMOTO_GATE = { x: 0, z: -190, name: '坂本の総門' };
export const MUDOJI_TRAILHEAD = { x: 40, z: -190, name: '無動寺坂の登り口' };

// 口（門・木戸）
export const GATE_MUDOJI = { x: 45, z: -80, name: '無動寺谷の木戸' };
export const GATE_TODO = { x: 0, z: -15, name: '東塔の山門' };
export const GATE_SAITO = { x: -50, z: 55, name: '西塔の山門' };
export const KIRARA = { x: -95, z: 85, name: '雲母坂（退路・八瀬へ）' };

// 大比叡の峰（高所の見張り）
export const OBIE_PEAK = { x: -20, z: 120 };

// 森の区域（this の外は視界が開ける）と、崖で通れない側
export const FOREST_POLY = [[20, -160], [70, -140], [80, -40], [40, 10], [10, -30], [10, -140]];
export const CLIFF_X = 70; // これより東（無動寺谷の外）は谷底の崖

// 山道1：本坂（坂本の総門 → 東塔の山門 → 東塔の中）
export const HONZAKA = [[SAKAMOTO_GATE.x, SAKAMOTO_GATE.z], [-4, -150], [2, -110], [-3, -70], [0, -40], [GATE_TODO.x, GATE_TODO.z], [0, 0]];
// 山道2：無動寺坂（無動寺坂の登り口 → 無動寺谷の木戸）
export const MUDOJIZAKA = [[MUDOJI_TRAILHEAD.x, MUDOJI_TRAILHEAD.z], [46, -150], [42, -110], [GATE_MUDOJI.x, GATE_MUDOJI.z]];
// 尾根道：東塔 → 西塔の山門 → 西塔の中（見晴らしが良く、伏兵が隠れにくい）
export const RIDGE = [[0, 0], [-15, 15], [-30, 30], [-42, 45], [GATE_SAITO.x, GATE_SAITO.z], [-50, 70]];
// 谷道：無動寺谷の木戸 → 東塔の裏（谷沿い・森の中を通り、伏兵に向く危険な道）
export const VALLEY = [[GATE_MUDOJI.x, GATE_MUDOJI.z], [35, -40], [15, -10], [5, 5]];
// 退路：西塔から雲母坂を下って八瀬へ（ふさげば追い詰められる）
export const KIRARA_ROAD = [[GATE_SAITO.x, GATE_SAITO.z], [-70, 70], [KIRARA.x, KIRARA.z]];

export const HIEI_PLAN = {
  name: '比叡山',
  kuruwa: [
    { id: 'mudoji', name: '無動寺谷の外堂', poly: [[30, -100], [60, -100], [60, -60], [30, -60]], level: 0.15 },
    { id: 'todo', name: '東塔の僧坊（根本中堂）', poly: [[-20, -20], [20, -20], [20, 20], [-20, 20]], level: 0.3 },
    { id: 'saito', name: '西塔', poly: [[-70, 50], [-30, 50], [-30, 90], [-70, 90]], level: 0.5 },
  ],
  koguchi: [
    { id: 'gate_mudoji', name: GATE_MUDOJI.name, at: [GATE_MUDOJI.x, GATE_MUDOJI.z] },
    { id: 'gate_todo', name: GATE_TODO.name, at: [GATE_TODO.x, GATE_TODO.z] },
    { id: 'gate_saito', name: GATE_SAITO.name, at: [GATE_SAITO.x, GATE_SAITO.z] },
    { id: 'kirara', name: KIRARA.name, at: [KIRARA.x, KIRARA.z] },
  ],
  paths: [{ pts: HONZAKA }, { pts: MUDOJIZAKA }, { pts: RIDGE }, { pts: VALLEY }, { pts: KIRARA_ROAD }],
  yagura: [{ id: 'obie', kind: 'monomi', at: [OBIE_PEAK.x, OBIE_PEAK.z] }],
};
