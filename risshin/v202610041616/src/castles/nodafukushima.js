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

// ---- 福島砦（西の島）：野田と違う形の HIST_B の陣地。野田は「岸の広場＋本陣」の二段の四角だが、
// 福島は中州の縁なりに歪んだ一つの囲い（六角）に柵を巡らせただけの、もっと簡素な陣地（kaito 10/1 mid6 26〜37章）。
// 水に面した東側の縁（C-D）に水堀、南西の縁（A-B、門の側）の外に乱杭・逆茂木を別に置く（b_nodafukushima.js 側）。
export const FUKU_GATE = { x: -122, z: -58, name: '福島砦の門' };
const FUKU_POLY = [[-140, -56], [-104, -58], [-94, -76], [-106, -98], [-138, -102], [-152, -80]];
export const FUKU_PLAN = {
  name: '福島砦',
  kuruwa: [{ id: 'kishi', name: '福島砦の囲い', poly: FUKU_POLY, level: 0.5, wall: 'palisade', gapAt: [-122, -57] }],
  koguchi: [{ id: 'mon', name: FUKU_GATE.name, at: [FUKU_GATE.x, FUKU_GATE.z], gate: 'kabuki', rot: 0, w: 4 }],
  paths: [{ pts: [[-122, -40], [-122, -58], [-122, -78]] }],
  // 水堀は東側（水路・中州側）の縁だけ。門の側（南西）は堀を切らず、乱杭・逆茂木で止める
  hori: [{ kind: 'mizubori', pts: [[-98, -70], [-104, -92]], deep: 1.3, w: 5 }],
  yagura: [{ id: 'monomi', at: [-112, -62], name: '福島砦の櫓' }],
};

// 堤の上の土塁（鉄砲衆の胸壁）。地形の堤の背の、川の側の肩に沿って
export const LEVEE_DORUI = [[-46, LEVEE_Z - 2], [-16, LEVEE_Z - 2.5], [16, LEVEE_Z - 2.5], [46, LEVEE_Z - 2]];
// 堤の上の、はじめから据えてある竹束（鉄砲衆の前）
export const LEVEE_TABA = [[22, LEVEE_Z - 4], [28, LEVEE_Z - 4], [34, LEVEE_Z - 4], [-34, LEVEE_Z - 4], [-26, LEVEE_Z - 4]];

// 持ち場（siege_zones の区域）：堤の上・織田の本陣
export const LEVEE_ZONE = { x0: -46, x1: 46, z0: LEVEE_Z - 9, z1: LEVEE_Z + 6 };
export const ODA_HONJIN = { x: 0, z: 44, r: 14 };

// 水際の乱杭（見た目。先を尖らせた杭を水の縁に並べる）：野田の水堀の前・福島の水際（東側）
export const RANKUI_LINES = [[[-64, -40], [-5, -40]], [[5, -40], [64, -40]], [[-98, -70], [-104, -92]]];
// 陸路の逆茂木（柵では塞がない所の、地続きの寄せを止める）：野田砦の柵の左右の外・福島砦の門の外の陸路
export const SAKAMOGI_LINES = [[[-62, FORT_Z + 5], [-30, FORT_Z + 4]], [[30, FORT_Z + 4], [62, FORT_Z + 5]], [[-140, -54], [-152, -78]]];

// 夜の一揆の寄せ（siege_ai.js の makeAttackAI）：石山本願寺の台地から、三つの道で織田の陣へ
//   east：堤の東の端（堤を切りにかかる）／south：南の畦道（本陣の背）／levee：堤の上を真っすぐ
export const IKKO_ROUTES = [
  { id: 'east', name: '堤の東の端', entry: { x: 66, z: 12 }, defThickness: 1.4, pathLen: 150, chokeWidth: 5 },
  { id: 'south', name: '南の畦道', entry: { x: 34, z: 62 }, defThickness: 2.2, pathLen: 160, chokeWidth: 6 },
  { id: 'levee', name: '堤の上', entry: { x: 46, z: LEVEE_Z + 2 }, defThickness: 2.6, pathLen: 170, chokeWidth: 4 },
];
