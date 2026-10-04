// ======================================================================
// castles/kinome.js … 木ノ芽峠の城塞群の縄張り（docs/late6-1573-1575-spec.md 65〜79章）
// 「砦ひとつ」でなく、尾根ごとに分かれた四つの城（HIST_A：存在・標高。HIST_B：曲輪の数・並びは推定）。
//   観音丸城（低い前衛・最初の戦い。峠道をふさぐので必ず通る）→ 道が二つに分かれ（junction）、
//   中央は木ノ芽峠城（一揆の中核。十数の郭を木戸内/副郭/主郭の三段で表す）、
//   東は大きな堀切を越えて西光寺丸城（南尾根の堀切）、西は柵口を登って鉢伏城（標高最高・詰の城）。
// 木ノ芽峠城の南北350m・東西100mを物差しに、曲輪・麓・別働の尾根を広げる。
// castle_plan.js の形（kuruwa・koguchi・paths・yagura・hori）で書く。地形・部品・兵の配置は b_kinome.js 側。
// ======================================================================
import { rectPoly } from '../castle_plan.js';

export const KX = (x) => x * 100 / 28;
export const KZ = (z) => z * 350 / 72;

// 峠道（南→北。観音丸城→（分かれ道）→木ノ芽峠城の木戸内→副郭→主郭）
import { switchback } from '../yamalift.js';
export const ROAD = [
  [0, -172], ...switchback([0, -146], [0, -120], 3, 40), [0, -96], [0, -90], ...switchback([0, -84], [0, -60], 3, 40).slice(0, -1), [0, -60],
  [0, -30], [0, -10], [0, 8], [0, 24], [0, 38],
];
export const JUNCTION = { x: 0, z: -60 };
// 分かれ道（junction から東＝西光寺丸城／西＝鉢伏城へ）
export const BRANCH_EAST = [[0, -60], [12, -44], [18, -20], [16, -4], [22, 8], [30, 16], [36, 22], [30, 30], [32, 34], [32, 45]];
export const BRANCH_WEST = [[0, -60], [-14, -44], [-18, -26], [-18, -14], [-22, -6], [-30, -6], [-38, 4], [-34, 14], [-38, 24], [-41, 18]];

export const GATE_KANNON = { x: 0, z: -120, name: '観音丸城の木戸' };
export const GATE_KINOME = { x: 0, z: -30, name: '木ノ芽峠城の木戸' };
export const GATE_SAIKOJI = { x: 22, z: 8, name: '西光寺丸の木戸' };
export const GATE_HACHIBUSE = { x: -22, z: -6, name: '鉢伏城の柵口（倒木と柵）' };

// 奥への口（塀の囲みの奥の辺。峠道・尾根道が抜ける所）。前は四方を閉じたので、木戸を破っても奥の郭へ
// 抜けられず、味方が奥の塀に何分も取り付いたままだった（見回り 10/2：越前の味方が観音丸の北の塀で5分詰まった）
export const EXIT_KANNON = [0, -90];
export const EXIT_KINOME = [0, -6];
export const EXIT_SAIKOJI = [30, 30];
export const EXIT_HACHIBUSE = [-38, 4];

export const KANNON_C = { x: 0, z: -105 };
export const KINOME_HON = { x: 0, z: 31 };
export const SAIKOJI_HON = { x: 32, z: 45 };
export const HACHIBUSE_HON = { x: -41, z: 18 };

export const CLIFF_X = KX(-66);     // 鉢伏城のさらに西は崖（通れない）
export const FOREST_X = KX(20);     // これより東（西光寺丸口）は森が濃い

// 東の尾根の大きな堀切（木ノ芽峠城と西光寺丸城の間。橋のぶん間を空ける＝見た目の窪みで、速さが落ちる）
export const HORIKIRI_E = [[[16, -14], [16, -6]], [[16, 4], [16, 20]]];
// 県史では南の尾根に堀切、北側背後には堀切なし。木戸への道だけ残す。
export const HORIKIRI_SAIKOJI_SOUTH = [[[14, 0], [20, 0]], [[24, 0], [46, 0]]];

// 曲輪の高さ：下地の地形（その曲輪の真ん中）から rise m 上げた平場。前は 0.08〜0.7 の数（m）を直に入れていて、
// 峠道を上るにつれ地面が 10m 余り高くなるのに曲輪だけ 0m に残り、四城が深い穴の底に沈んで、周りが灰色の崖の壁に見えた（見回り 10/2）
const lv = (cx, cz, rise) => (bf) => bf(KX(cx), KZ(cz)) + rise;

export const KINOME_PLAN = {
  name: '木ノ芽峠の城塞群（観音丸・木ノ芽峠・西光寺丸・鉢伏）',
  kuruwa: [
    // ---- 観音丸城（低い前衛。最初の戦い。峠道をふさぐので必ず通る）----
    { id: 'kannon', name: '観音丸城', poly: rectPoly(-14, 14, -120, -90), level: lv(0, -105, 1.6), wall: 'palisade', gapAt: [[GATE_KANNON.x, GATE_KANNON.z], EXIT_KANNON], capacity: 40, fallbackTo: null, defenseValue: 0.35 },
    // ---- 木ノ芽峠城（一揆の中核。十数の郭を木戸内・副郭・主郭の三段で表す）----
    { id: 'kinome_sou', name: '木ノ芽峠城・木戸内の郭', poly: rectPoly(-14, 14, -30, -6), level: lv(0, -18, 2.4), wall: 'palisade', gapAt: [[GATE_KINOME.x, GATE_KINOME.z], EXIT_KINOME], capacity: 60, fallbackTo: 'kinome_fuku', defenseValue: 0.5 },
    { id: 'kinome_fuku', name: '木ノ芽峠城・副郭', poly: rectPoly(-12, 12, -4, 18), level: lv(0, 7, 3.6), capacity: 40, fallbackTo: 'kinome_hon', defenseValue: 0.55 },
    { id: 'kinome_hon', name: '木ノ芽峠城・主郭（本陣）', poly: rectPoly(-10, 10, 20, 42), level: lv(0, 31, 5.2), capacity: 50, fallbackTo: null, defenseValue: 0.75 },
    // ---- 西光寺丸城（木ノ芽峠城の東。南の尾根を堀切で守る）----
    { id: 'saikoji_mae', name: '西光寺丸城・前郭', poly: rectPoly(14, 38, 8, 30), level: lv(26, 19, 3.2), wall: 'palisade', gapAt: [[GATE_SAIKOJI.x, GATE_SAIKOJI.z], EXIT_SAIKOJI], capacity: 30, fallbackTo: 'saikoji_hon', defenseValue: 0.5 },
    { id: 'saikoji_hon', name: '西光寺丸城・本郭', poly: rectPoly(20, 44, 34, 56), level: lv(26, 19, 9.2), capacity: 30, fallbackTo: null, defenseValue: 0.65 },
    // ---- 鉢伏城（標高最高。詰の城。柵と倒木の口を登る）----
    { id: 'hachibuse_mae', name: '鉢伏城・柵口の郭', poly: rectPoly(-48, -22, -18, 4), level: lv(-35, -7, 3.6), wall: 'palisade', gapAt: [[GATE_HACHIBUSE.x, GATE_HACHIBUSE.z], EXIT_HACHIBUSE], capacity: 25, fallbackTo: 'hachibuse_hon', defenseValue: 0.55 },
    { id: 'hachibuse_hon', name: '鉢伏城・本陣（詰の城）', poly: rectPoly(-54, -28, 6, 30), level: lv(-41, 18, 6.5), capacity: 30, fallbackTo: null, defenseValue: 0.8 },
  ],
  koguchi: [
    { id: 'gate_kannon', name: GATE_KANNON.name, at: [GATE_KANNON.x, GATE_KANNON.z], role: 'ote', maxFlow: 4, w: 3 },
    { id: 'gate_kinome', name: GATE_KINOME.name, at: [GATE_KINOME.x, GATE_KINOME.z], role: 'ote', maxFlow: 4, w: 3 },
    { id: 'gate_saikoji', name: GATE_SAIKOJI.name, at: [GATE_SAIKOJI.x, GATE_SAIKOJI.z], maxFlow: 3, w: 3 },
    { id: 'gate_hachibuse', name: GATE_HACHIBUSE.name, at: [GATE_HACHIBUSE.x, GATE_HACHIBUSE.z], maxFlow: 3, w: 3 },
  ],
  paths: [
    { id: 'touge', kind: 'ote', pts: ROAD },
    { id: 'higashi', kind: 'karamete', pts: BRANCH_EAST },
    { id: 'nishi', kind: 'karamete', pts: BRANCH_WEST },
  ],
  hori: [
    { kind: 'horikiri', pts: HORIKIRI_E[0], deep: 3.4, w: 6 },
    { kind: 'horikiri', pts: HORIKIRI_E[1], deep: 3.4, w: 6 },
    { kind: 'horikiri', pts: HORIKIRI_SAIKOJI_SOUTH[0], deep: 3.6, w: 7, closed: false },
    { kind: 'horikiri', pts: HORIKIRI_SAIKOJI_SOUTH[1], deep: 3.6, w: 7, closed: false },
    // 竪堀：斜面を縦に落ちる溝（横へ回り込めない）。観音丸の東西の斜面と、鉢伏城の下の斜面
    { kind: 'tatebori', pts: [[-24, -118], [-30, -96]], deep: 2.2, w: 2.6 },
    { kind: 'tatebori', pts: [[24, -118], [30, -96]], deep: 2.2, w: 2.6 },
    { kind: 'tatebori', pts: [[-52, -14], [-58, -2]], deep: 2.4, w: 2.6 },
  ],
  yagura: [{ id: 'monomi_kinome', at: [10, 16] }, { id: 'monomi_hachibuse', at: [HACHIBUSE_HON.x, HACHIBUSE_HON.z + 6] }],
};

// 広さだけを変える。門・道幅・堀の深さ・建物・兵の数は実寸のまま。
const point = ([x, z]) => [KX(x), KZ(z)];
for (const line of [ROAD, BRANCH_EAST, BRANCH_WEST, ...HORIKIRI_E, ...HORIKIRI_SAIKOJI_SOUTH]) {
  for (let i = 0; i < line.length; i++) line[i] = point(line[i]);
}
for (const at of [JUNCTION, GATE_KANNON, GATE_KINOME, GATE_SAIKOJI, GATE_HACHIBUSE, KANNON_C, KINOME_HON, SAIKOJI_HON, HACHIBUSE_HON]) {
  at.x = KX(at.x); at.z = KZ(at.z);
}
for (const k of KINOME_PLAN.kuruwa) {
  k.poly = k.poly.map(point);
  if (k.gapAt) k.gapAt = k.gapAt.map(point);
}
for (const g of KINOME_PLAN.koguchi) g.at = point(g.at);
for (const h of KINOME_PLAN.hori) if (h.kind === 'tatebori') h.pts = h.pts.map(point);
for (const y of KINOME_PLAN.yagura) y.at = point(y.at);
for (const at of [EXIT_KANNON, EXIT_KINOME, EXIT_SAIKOJI, EXIT_HACHIBUSE]) {
  at[0] = KX(at[0]); at[1] = KZ(at[1]);
}
