// ======================================================================
// castles/sunomata.js … 墨俣の砦の縄張り（docs/quality-upgrade-plan.md 束2・fort-spec 4・22）
// castle_plan.js の riverFortPlan（岸の広場・本陣・水の堀・川）の形に倣い、長良川の洲に結った砦を書く。
// 川は東（x 62〜112）。砦の内（柵・土塁）は b_sunomata.js の buildFort が手で結う（壊せる柵・破れ目の当たりを持つため）。
// ここでは、場の当たり（砦の内・岸の舟着き）・物見・外の空堀・寄せの道（斎藤の寄せ手が選ぶ三つ）を持つ。
// ======================================================================
import { riverFortPlan, rectPoly } from '../castle_plan.js';

export const FORT = 18;
// 南西の在所からの街道と、北の稲葉山への道
export const ROAD3 = [[-176, 120], [-90, 86], [-36, 44], [0, 24]];
export const ROAD3N = [[0, -176], [0, -24]];

// 寄せの道（斎藤の寄せ手の頭が、毎回ここから選ぶ）。side は assaultFn の柵の向き（n 北・w 西）
// yose は寄せ場（竹束を押してここまでゆっくり寄せ、柵へ取り付く）。far は二の手（遠くから出る）の出口
export const YOSE = {
  kita: { id: 'kita', name: '北の畑', side: 'n', from: { x: 2, z: -64 }, far: { x: 2, z: -112 }, yose: { x: 0, z: -FORT - 14 }, dir: { x: 0, z: 1 }, flee: { x: 0, z: -1 }, pathLen: 46, chokeWidth: 3.2 },
  nishi: { id: 'nishi', name: '西の林の口', side: 'w', from: { x: -66, z: 2 }, far: { x: -122, z: 2 }, yose: { x: -FORT - 14, z: 0 }, dir: { x: 1, z: 0 }, flee: { x: -1, z: 0 }, pathLen: 48, chokeWidth: 3.4 },
};
export const SIDE_WORD = { n: '北', w: '西', e: '東', s: '南' };

// 外の空堀：北と西の柵の外を回る（北の道の所は土橋として切る）。深さ 1.1・幅 8 で、
// 斜面は 35 度より緩い（world.walkable で登れる）。寄せ手はここで足が鈍る
export const HORI = [
  { kind: 'karabori', pts: [[-31, 24], [-31, -31], [-4, -31]], deep: 1.1, w: 8 },
  { kind: 'karabori', pts: [[4, -31], [31, -31], [31, -22]], deep: 1.1, w: 8 },
];

const R = riverFortPlan({ name: '墨俣の砦', w: 2 * FORT });

export const SUNOMATA_PLAN = {
  ...R,
  name: '墨俣の砦',
  kuruwa: [
    // 砦の内（柵は buildFort が結うので wall は持たない）
    { id: 'toride', name: '砦の内', poly: rectPoly(-FORT, FORT, -FORT, FORT), level: 0.35 },
    // 岸の舟着き（riverFortPlan の「岸の広場」に当たる。東の柵と川の間）
    { id: 'kishi', name: '岸の舟着き', poly: rectPoly(FORT + 4, 48, -16, 16), level: 0.1 },
  ],
  koguchi: [{ id: 'minami', name: '南の冠木門', at: [0, FORT] }],
  paths: [{ pts: ROAD3 }, { pts: ROAD3N }],
  hori: HORI,
  // 物見：北西の外（寄せ手の来る北と西が見える）と、岸の舟着き（川向こうと舟が見える）
  yagura: [{ id: 'monomiNW', name: '北西の物見', at: [-FORT - 6, -FORT - 6] }, { id: 'monomiKishi', name: '岸の物見', at: [FORT + 14, -15] }],
  river: { x: 62, x2: 112 },
};
