// ======================================================================
// castles/mitsukuri.js … 箕作城の縄張り（永禄十一年・夜攻め）
// 山城の曲輪三つ：三の郭（坂の上・外側の柵の線）→ 二の丸（木戸構え）→ 本丸（切岸の上・石塁の一部）。
// castle_plan.js の形（kuruwa・koguchi・paths）で書く。地形・兵の配置・戦い方は b_mitsukuri.js 側。
// 向き：南（+z）が織田の陣・大手。北（-z）へ登るほど高い。三の郭は柵で囲い、南の柵の口（逆茂木で塞ぐ）から入る。
// 木戸は三の郭と二の丸の間。二の丸から本丸へは門を構えず、切岸（急な縁。heightOf の edgeW）をそのまま攻め登る。
// 大手は三の郭の口→木戸→二の丸。北に退ける小口を復元し、全周の袋にしない。
// 札（docs/first6 34〜41）：本丸・二の丸・石塁の一部＝HIST_A。土塁・柵・木戸・切岸＝HIST_B。三の郭の守り所＝GAME_C。大天守は置かない
// 参照で確かな形は山頂主郭・周囲の段・西側面の石垣の一部・北西尾根の堀切と竪堀。
// 曲輪の寸法と大手・搦手の向きは不明。三段の配置・攻め道・柵の線は遊びの補いとして保つ。
// ======================================================================

import { switchback } from '../yamalift.js';
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const SAN_C = { x: 0, z: -56 };   // 三の郭：坂の守りの段
export const NI_C = { x: 0, z: -80 };    // 二の丸：木戸構え
export const HON_C = { x: 0, z: -100 };  // 本丸
export const KIDO = { x: 0, z: -64, name: '木戸' };
export const NISHI_TANI_X = -34;         // 西の谷（松明を消して回る道）

// 大手道（南の陣から、三の郭→木戸→二の丸→切岸→本丸）
// 九十九折り（kaito 10/3：山を本物の比高に近づけたので、麓から [0,-30] までは左右に振って登る。[0,-30] は 添字 7）
export const ROAD_OTE = [...switchback([0, 56], [0, -30], 7, 30), [SAN_C.x, SAN_C.z], [0, -64], [KIDO.x, KIDO.z], [0, -80], [NI_C.x, NI_C.z], [0, -92], [HON_C.x, HON_C.z]];
// 谷の道（西の谷筋を松明を消して忍び登り、坂の正面を避けて三の郭の柵の口の脇へ出る。柵は越えられないので口から入る）
// 逆茂木は z=-39。西端の外を回り、南の空いた帯から中央の口へ入る。
export const ROAD_TANI = [...ROAD_OTE.slice(0, 5), ...switchback([-30, -4], [NISHI_TANI_X, -36], 3, 12), [-26, -35], [0, -35], [0, -41]];
// 全周を柵で閉じて退けなくしない。北の小口と山道は推定復元。
export const ROAD_URA = [[8, -101], [8, -110], [14, -118], [26, -132], [42, -154]];

export const MITSUKURI_PLAN = {
  name: '箕作城', type: 'yama', year: 1568,
  // 本丸の館。大天守は無い。城将と旗本の配置は戦の定義が扱う。
  lordSeat: { kind: 'goten', profile: 'mitsukuri', oku: 0.32, at: [0, -105], w: 11, d: 6, rot: 0, door: 1, name: '館', where: '本丸の館の奥の間' },
  kuruwa: [
    // 三の郭：外側の防御線。柵で囲い、南の柵の口だけを開ける（口の前に逆茂木。sakamogi は b_mitsukuri.js 側で飾る）
    { id: 'san', name: '三の郭（坂の上）', level: 2, wall: 'saku', hp: 360, poly: rect(-20, 20, -64, -44), gapAt: [[0, -44]] },
    // 二の丸：木戸を構えた曲輪。南に木戸、北は切岸で本丸へ
    { id: 'ni', name: '二の丸（木戸構え）', level: 6, wall: 'saku', hp: 460, poly: rect(-16, 16, -92, -64), gapAt: [[KIDO.x, KIDO.z], [0, -92]] },
    // 本丸：いちばん高い。切岸を登った先。城将の衆が最後に守る
    { id: 'hon', name: '本丸', level: 11, wall: 'saku', hp: 560, poly: rect(-10, 10, -110, -92), gapAt: [[0, -92], [8, -110]] },
  ],
  koguchi: [
    // 三の郭の柵の口（戸は無く、冠木だけ。b_mitsukuri.js が冠木の枠を飾る）。門の幅だけ開ける
    { id: 'san_kuchi', name: '三の郭の柵の口', from: 'out', to: 'san', kind: 'hira', at: [0, -44], rot: 0, w: 7 },
    { id: 'kido', name: KIDO.name, from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [KIDO.x, KIDO.z], rot: 0, w: 3.6 },
    { id: 'ura_kuchi', name: '北の小口', from: 'hon', to: 'out', kind: 'hira', at: [8, -110], rot: 0, w: 3 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'tani', kind: 'tani', pts: ROAD_TANI },
    { id: 'ura', kind: 'tani', pts: ROAD_URA },
  ],
  // 北西尾根を横切る堀切と、西の斜面へ下る竪堀。細かな位置・寸法は遊びの補い。
  // 大手道・西の谷道から離し、今の攻め口と登り道を塞がない。
  hori: [
    { kind: 'horikiri', pts: [[-30, -116], [-14, -132]], w: 4.5, deep: 1.6 },
    { kind: 'tatebori', pts: [[-30, -116], [-48, -106], [-64, -88]], w: 2.6, deep: 1.8 },
  ],
  yagura: [
    { id: 'monomi_ni', kind: 'monomi', at: [13, -78] },
  ],
};
