// ======================================================================
// castles/kanegasaki.js … 金ヶ崎城・天筒山城（敦賀の海に突き出た岬の山城。元亀元年四月に織田が落とした城）
// 主郭は月見御殿跡と伝わる所（HIST_B：推定）。尾根づたいに二の曲輪、その間は堀切の鞍部。
// 天筒山（標高約170m）の山頂曲輪とは別の山。東南の中池見湿地が天然の守り（b_kanegasaki.js 側）。
// 大型の天守は無い。地形はいじらない（兵の経路を切らない）ので、見た目の堀切と曲輪の形だけをここに書く。
// castle_plan.js の形（kuruwa・hori・koguchi）。
// ======================================================================
function circle(cx, cz, r, n = 10) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

export const KG_SHU = { x: 96, z: -128 };      // 主郭（月見御殿跡の候補）
export const KG_NI = { x: 74, z: -112 };       // 尾根続きの二の曲輪
export const KG_TEZ = { x: 48, z: -98 };       // 天筒山の山頂曲輪

export const KANEGASAKI_PLAN = {
  name: '金ヶ崎城', type: 'yama', year: 1570,
  kuruwa: [
    { id: 'shu', name: '主郭（月見御殿跡）', poly: circle(KG_SHU.x, KG_SHU.z, 9), level: (bf) => bf(KG_SHU.x, KG_SHU.z), wall: 'saku', gapAt: [[KG_SHU.x, KG_SHU.z + 9]] },
    { id: 'ni', name: '二の曲輪', poly: circle(KG_NI.x, KG_NI.z, 7), level: (bf) => bf(KG_NI.x, KG_NI.z), wall: 'saku', gapAt: [[KG_NI.x, KG_NI.z + 7]] },
    { id: 'tez', name: '天筒山の山頂曲輪', poly: circle(KG_TEZ.x, KG_TEZ.z, 7), level: (bf) => bf(KG_TEZ.x, KG_TEZ.z), wall: 'saku', gapAt: [[KG_TEZ.x + 7, KG_TEZ.z]] },
  ],
  // 堀切：尾根を断つ。主郭－二の曲輪の鞍部、二の曲輪－天筒山の鞍部
  hori: [
    { kind: 'horikiri', pts: [[KG_NI.x + 10, KG_NI.z - 9], [KG_NI.x + 10, KG_NI.z + 9]], w: 4.5, deep: 2 },
    { kind: 'horikiri', pts: [[KG_TEZ.x + 12, KG_TEZ.z - 8], [KG_TEZ.x + 12, KG_TEZ.z + 8]], w: 4.5, deep: 2 },
  ],
  // 木戸
  koguchi: [
    { id: 'kido_shu', name: '主郭の木戸', at: [KG_SHU.x, KG_SHU.z + 9], gate: null },
    { id: 'kido_ni', name: '二の曲輪の木戸', at: [KG_NI.x, KG_NI.z + 7], gate: null },
    { id: 'kido_tez', name: '天筒山の木戸', at: [KG_TEZ.x + 7, KG_TEZ.z], gate: null },
  ],
};
