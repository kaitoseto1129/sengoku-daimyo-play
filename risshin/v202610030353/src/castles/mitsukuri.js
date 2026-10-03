// ======================================================================
// castles/mitsukuri.js … 箕作城の縄張り（永禄十一年・夜攻め）
// 山城の曲輪三つ：三の郭（坂の上・外側の柵の線）→ 二の丸（木戸構え）→ 本丸（切岸の上・石塁の一部）。
// castle_plan.js の形（kuruwa・koguchi・paths）で書く。地形・兵の配置・戦い方は b_mitsukuri.js 側。
// 向き：南（+z）が織田の陣・大手。北（-z）へ登るほど高い。三の郭は柵で囲い、南の柵の口（逆茂木で塞ぐ）から入る。
// 木戸は三の郭と二の丸の間。二の丸から本丸へは門を構えず、切岸（急な縁。heightOf の edgeW）をそのまま攻め登る。
// 四方は閉じる：本丸へは、三の郭の柵の口 → 木戸 → 二の丸を通らないと行けない（kaito 10/1）。
// 札（docs/first6 34〜41）：本丸・二の丸・石塁の一部＝HIST_A。土塁・柵・木戸・切岸＝HIST_B。三の郭の守り所＝GAME_C。大天守は置かない
// ======================================================================

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const SAN_C = { x: 0, z: -56 };   // 三の郭：坂の守りの段
export const NI_C = { x: 0, z: -80 };    // 二の丸：木戸構え
export const HON_C = { x: 0, z: -100 };  // 本丸
export const KIDO = { x: 0, z: -64, name: '木戸' };
export const NISHI_TANI_X = -34;         // 西の谷（松明を消して回る道）

// 大手道（南の陣から、三の郭→木戸→二の丸→切岸→本丸）
export const ROAD_OTE = [[0, 40], [0, 0], [0, -30], [SAN_C.x, SAN_C.z], [0, -64], [KIDO.x, KIDO.z], [0, -80], [NI_C.x, NI_C.z], [0, -92], [HON_C.x, HON_C.z]];
// 谷の道（西の谷筋を松明を消して忍び登り、坂の正面を避けて三の郭の柵の口の脇へ出る。柵は越えられないので口から入る）
export const ROAD_TANI = [[-30, -4], [NISHI_TANI_X, -36], [-26, -40], [-5, -41]];

export const MITSUKURI_PLAN = {
  name: '箕作城', type: 'yama', year: 1568,
  // 大将の居場所（kaito 10/2）：本丸の館の奥の間に城将（大天守は無い。戸口は南）
  lordSeat: { kind: 'goten', at: [0, -105], w: 11, d: 6, rot: 0, door: 1, name: '館', where: '本丸の館の奥の間' },
  kuruwa: [
    // 三の郭：外側の防御線。柵で囲い、南の柵の口だけを開ける（口の前に逆茂木。sakamogi は b_mitsukuri.js 側で飾る）
    { id: 'san', name: '三の郭（坂の上）', level: 2, wall: 'saku', hp: 360, poly: rect(-20, 20, -64, -44), gapAt: [[0, -44]] },
    // 二の丸：木戸を構えた曲輪。南に木戸、北は切岸で本丸へ
    { id: 'ni', name: '二の丸（木戸構え）', level: 6, wall: 'saku', hp: 460, poly: rect(-16, 16, -92, -64), gapAt: [[KIDO.x, KIDO.z], [0, -92]] },
    // 本丸：いちばん高い。切岸を登った先。城将の衆が最後に守る
    { id: 'hon', name: '本丸', level: 11, wall: 'saku', hp: 560, poly: rect(-10, 10, -110, -92), gapAt: [[0, -92]] },
  ],
  koguchi: [
    // 三の郭の柵の口（戸は無く、冠木だけ。b_mitsukuri.js が冠木の枠を飾る）。門の幅だけ開ける
    { id: 'san_kuchi', name: '三の郭の柵の口', from: 'out', to: 'san', kind: 'hira', at: [0, -44], rot: 0, w: 7 },
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
