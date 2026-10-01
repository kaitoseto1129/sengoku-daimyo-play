// ======================================================================
// castles/inabayama.js … 稲葉山城（金華山）の縄張り（docs/siege-plan.md 7章「稲葉山（山城）」）
// castle_plan.js の形（kuruwa・hori）で書く。地形の下地・兵の配置・戦い方は b_inabayama.js 側の仕事。
// 大手道は七曲り（七つの折れ）で町から木戸まで登る。搦手（水手道）は二段の腰曲輪を経て本丸の裏へ。
// 竪堀（tatebori）は、七曲りの最後の折れの両脇と、搦手の腰曲輪の西側（崖寄り）に置き、
// 斜面を横に回り込めないようにする。腰曲輪の東側（物見櫓のある側）だけは竪堀を置かず、
// 回り込む脇道として残す（docs castle-design 7-1「畝状竪堀の無い斜面だけ」）。
// ======================================================================

export const HON = { x: 0, z: -116 };            // 本丸（山の上）
export const OTE = { x: 0, z: -62 };             // 大手の木戸（七曲りの道の上がりきった所）
export const GAP_A = Math.PI * 1.5;              // 本丸の柵の口（西向き）

// 大手道（七曲り）：井口の町から、七つ折れて大手の木戸まで。さらに木戸の先、本丸の手前まで
export const ROAD = [[-14, 150], [42, 112], [-34, 82], [36, 50], [-26, 18], [16, -14], [-6, -40], [OTE.x, OTE.z], [0, -96]];
// 搦手の道（水手道）：大手の西の麓から、山の西の肩をまわって本丸の裏の口へ。途中に二段の腰曲輪
export const KARA = [[-6, -34], [-44, -58], [-64, -92], [-54, -120], [-26, -118], [-9, -116]];
export const TOWER = { x: KARA[2][0] + 7, z: KARA[2][1] - 3 };   // 水手道の途中に立つ物見櫓（腰曲輪1の東＝回り込める側）
// 百曲り（山の東の肩を幾重にも折れて登る細道）：大手の木戸を通らず、木戸の奥（本丸の手前の道）へ出る
export const HYAKU = [[26, -26], [44, -48], [34, -70], [46, -90], [28, -104], [12, -100], [0, -96]];
// 長良川の舟着き（城の西の麓）。斎藤龍興は城を明け渡し、ここから舟で川を下った（退路＝siege_zones の escape）
export const FUNA = { x: -100, z: -46 };
// 本丸の柵の口（西）の外。本丸へ攻め上る者は、ここで口へ回る
export const HON_GATE_OUT = { x: -21, z: -114 };
// 腰曲輪2（新しい段。KARA[1]-KARA[2] の間）の中心
const KOSHI2 = { x: (KARA[1][0] + KARA[2][0]) / 2 - 4, z: (KARA[1][1] + KARA[2][1]) / 2 - 2 };

function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

export const INABAYAMA_PLAN = {
  name: '稲葉山城', type: 'yama',
  kuruwa: [
    { id: 'hon', name: '本丸', poly: circle(HON.x, HON.z, 20, 12), level: (bf) => bf(HON.x, HON.z), stone: true },
    { id: 'ote', name: '三の丸（大手）', poly: circle(OTE.x, OTE.z, 15, 10), level: (bf) => bf(OTE.x, OTE.z) },
    { id: 'ni', name: '二の丸', poly: circle(-40, -119, 11, 10), level: (bf) => bf(-40, -119) + 2 },
    // 腰曲輪1：搦手の水手道の途中、物見櫓が立つ段。喰違いの柵で囲い、入口と出口を前後にずらす
    { id: 'koshi1', name: '腰曲輪（上の段）', poly: circle(KARA[2][0], KARA[2][1], 13, 10), level: (bf) => bf(KARA[2][0], KARA[2][1]) + 1, wall: 'saku', gapAt: [KARA[1], KARA[3]] },
    // 腰曲輪2：その下の段。手前で一度足を止めさせる（docs「腰曲輪の段」＝複数）
    { id: 'koshi2', name: '腰曲輪（下の段）', poly: circle(KOSHI2.x, KOSHI2.z, 9, 10), level: (bf) => bf(KOSHI2.x, KOSHI2.z) + 0.5 },
  ],
  // 竪堀：七曲りの最後の折れの両脇（木戸へ一直線に寄せられないように）と、腰曲輪1の崖寄り（西）の脇
  // （東の物見櫓の側は竪堀を置かず、回り込める脇道として残す＝ docs 7-1）
  hori: [
    { kind: 'tatebori', pts: [[-50, -10], [-50, -52]], w: 3, deep: 2.2 },
    { kind: 'tatebori', pts: [[50, -10], [50, -52]], w: 3, deep: 2.2 },
    { kind: 'tatebori', pts: [[KARA[2][0] - 16, KARA[2][1] + 10], [KARA[2][0] - 16, KARA[2][1] - 20]], w: 2.6, deep: 2 },
  ],
  // 竹束（castle_plan.js が自動で置く。大手の木戸の手前と、腰曲輪の木戸の手前に数個ずつ。
  // 道（ROAD・KARA）そのものの上に乗らないよう、道の折れを避けて左右へ十分に離す）
  taba: [
    [-9, -50], [3, -50], [KARA[2][0] - 7, KARA[2][1] + 6], [KARA[2][0] + 9, KARA[2][1] + 6],
  ],
};
