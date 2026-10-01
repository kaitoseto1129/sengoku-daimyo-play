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

// 曲輪の段の高さ：比叡山は山なので地面そのもの（baseFn）が坂本からの登りで大きく上下する（10m先で数十m違う事も）。
// 平場の高さを決め打ちの小さな数（0.3 等）にすると、周りの急な斜面との差がそのまま深い穴や崖になってしまう。
// なので各曲輪の中心の「周りの地面の高さ」に小さな段差（0.15〜0.5＝本堂・堂舎の土台の高さ違い）を足すだけにし、
// 平場そのものは周りの斜面に合わせて段を均す（寺の平場の形）。本堂・堂舎・石段は world.heightAt を使うので、
// ここで平場が周りに合えば、建物も自然にその平場へ乗る。
const MUDOJI_POLY = [[30, -100], [60, -100], [60, -60], [30, -60]];
const TODO_POLY = [[-20, -20], [20, -20], [20, 20], [-20, 20]];
const SAITO_POLY = [[-70, 50], [-30, 50], [-30, 90], [-70, 90]];
function terraceLevel(poly, riser) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return (baseFn) => baseFn(cx, cz) + riser;
}

export const HIEI_PLAN = {
  name: '比叡山',
  kuruwa: [
    { id: 'mudoji', name: '無動寺谷の外堂', poly: MUDOJI_POLY, level: terraceLevel(MUDOJI_POLY, 0.15) },
    { id: 'todo', name: '東塔の僧坊（根本中堂）', poly: TODO_POLY, level: terraceLevel(TODO_POLY, 0.3) },
    { id: 'saito', name: '西塔', poly: SAITO_POLY, level: terraceLevel(SAITO_POLY, 0.5) },
  ],
  koguchi: [
    { id: 'gate_mudoji', name: GATE_MUDOJI.name, at: [GATE_MUDOJI.x, GATE_MUDOJI.z] },
    { id: 'gate_todo', name: GATE_TODO.name, at: [GATE_TODO.x, GATE_TODO.z] },
    { id: 'gate_saito', name: GATE_SAITO.name, at: [GATE_SAITO.x, GATE_SAITO.z] },
    { id: 'kirara', name: KIRARA.name, at: [KIRARA.x, KIRARA.z] },
  ],
  paths: [{ pts: HONZAKA }, { pts: MUDOJIZAKA }, { pts: RIDGE }, { pts: VALLEY }, { pts: KIRARA_ROAD }],
  yagura: [{ id: 'obie', kind: 'monomi', at: [OBIE_PEAK.x, OBIE_PEAK.z] }],
  // 竹束（castle_plan.js が自動で置く。木戸の手前に数個ずつ。
  // 西塔前の一つ（旧 [-46,48]）が尾根道にほぼ乗っていたので、道から離した）
  taba: [
    [-3, -30], [3, -30], [40, -88], [48, -88], [-39, 48], [-50, 48],
  ],
};
