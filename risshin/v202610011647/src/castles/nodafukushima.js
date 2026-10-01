// ======================================================================
// castles/nodafukushima.js … 野田砦・福島砦の縄張り（docs/quality-upgrade-plan.md 束5）
// castle_plan.js の riverFortPlan（河川砦）を二つ、戦の地図の上へ置き直す（北が砦の奥、南が口）。
// riverFortPlan は「-z が外」なので、z を返して（奥が北＝-z）置く。岸の広場の口は南（織田の陣の側）。
// 水堀は口の前へ移し、口の所だけ土橋で切る。地形・兵・戦い方は b_nodafukushima.js 側の仕事。
// 向き：北（-z）の川の向こうに野田砦、北西の島に福島砦。南（+z）に織田の陣。南東の遠くに石山本願寺。
// ======================================================================
import { riverFortPlan } from '../castle_plan.js';

export const FORT_Z = -46;      // 野田砦の柵（岸の広場の南の塀）
export const LEVEE_Z = -8;      // 堤の背

// riverFortPlan の場所を、(ox, oz) を中心に z を返して置き直す（曲輪・道の点の向きもそろえる）
function place(plan, ox, oz, o) {
  const P = ([x, z]) => [ox + x, oz - z];
  const kuruwa = plan.kuruwa.map((k) => ({
    ...k,
    poly: k.poly.map(P).reverse(),   // z を返すと回りが逆になるので、元の回りに戻す
    gapAt: k.gapAt ? P(k.gapAt) : undefined,
    level: (o.levels && o.levels[k.id]) ?? k.level,
  }));
  return {
    name: o.name,
    kuruwa,
    paths: plan.paths.map((p) => ({ ...p, pts: p.pts.map(P) })),
    koguchi: o.koguchi,
    hori: o.hori,
    yagura: o.yagura,
  };
}

// ---- 野田砦（真ん中、川の北岸）：岸の広場 x -20〜20・z -68〜-46、本陣 z -94〜-72 ----
export const NODA_GATE = { x: 0, z: FORT_Z, name: '野田砦の門' };
export const NODA_PLAN = place(riverFortPlan({ w: 40, honjinD: 22, name: '野田砦' }), 0, -58, {
  name: '野田砦',
  levels: { kishi: 1.4, honjin: 1.7 },
  koguchi: [
    { id: 'mon', name: NODA_GATE.name, at: [NODA_GATE.x, NODA_GATE.z], gate: 'kabuki', rot: 0, w: 4.4 },
    { id: 'hashi', name: '野田砦の土橋', at: [0, -42] },
  ],
  // 水堀：砦の口の前を東西に。土橋（x -4〜4）の所は切る
  hori: [
    { kind: 'mizubori', pts: [[-64, -42], [-4, -42]], deep: 1.6, w: 6 },
    { kind: 'mizubori', pts: [[4, -42], [64, -42]], deep: 1.6, w: 6 },
  ],
  yagura: [{ id: 'monomiW', at: [-16, -52], name: '野田砦の西の櫓' }, { id: 'monomiE', at: [16, -52], name: '野田砦の東の櫓' }],
});

// ---- 福島砦（西の島）：岸の広場 x -136〜-108・z -80〜-58、本陣 z -102〜-84 ----
export const FUKU_GATE = { x: -122, z: -58, name: '福島砦の門' };
export const FUKU_PLAN = place(riverFortPlan({ w: 28, honjinD: 18, name: '福島砦' }), -122, -70, {
  name: '福島砦',
  levels: { kishi: 0.6, honjin: 0.9 },
  koguchi: [
    { id: 'mon', name: FUKU_GATE.name, at: [FUKU_GATE.x, FUKU_GATE.z], gate: 'kabuki', rot: 0, w: 4 },
    { id: 'hashi', name: '福島砦の土橋', at: [-122, -54] },
  ],
  hori: [
    { kind: 'mizubori', pts: [[-146, -54], [-126, -54]], deep: 1.4, w: 5 },
    { kind: 'mizubori', pts: [[-118, -54], [-98, -54]], deep: 1.4, w: 5 },
  ],
  yagura: [{ id: 'monomi', at: [-112, -62], name: '福島砦の櫓' }],
});

// 堤の上の土塁（鉄砲衆の胸壁）。地形の堤の背の、川の側の肩に沿って
export const LEVEE_DORUI = [[-46, LEVEE_Z - 2], [-16, LEVEE_Z - 2.5], [16, LEVEE_Z - 2.5], [46, LEVEE_Z - 2]];
// 堤の上の、はじめから据えてある竹束（鉄砲衆の前）
export const LEVEE_TABA = [[22, LEVEE_Z - 4], [28, LEVEE_Z - 4], [34, LEVEE_Z - 4], [-34, LEVEE_Z - 4], [-26, LEVEE_Z - 4]];

// 持ち場（siege_zones の区域）：堤の上・織田の本陣
export const LEVEE_ZONE = { x0: -46, x1: 46, z0: LEVEE_Z - 9, z1: LEVEE_Z + 6 };
export const ODA_HONJIN = { x: 0, z: 44, r: 14 };

// 夜の一揆の寄せ（siege_ai.js の makeAttackAI）：石山本願寺の台地から、三つの道で織田の陣へ
//   east：堤の東の端（堤を切りにかかる）／south：南の畦道（本陣の背）／levee：堤の上を真っすぐ
export const IKKO_ROUTES = [
  { id: 'east', name: '堤の東の端', entry: { x: 66, z: 12 }, defThickness: 1.4, pathLen: 150, chokeWidth: 5 },
  { id: 'south', name: '南の畦道', entry: { x: 34, z: 62 }, defThickness: 2.2, pathLen: 160, chokeWidth: 6 },
  { id: 'levee', name: '堤の上', entry: { x: 46, z: LEVEE_Z + 2 }, defThickness: 2.6, pathLen: 170, chokeWidth: 4 },
];
