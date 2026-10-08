// 天正二年の長島。三川の輪中と別々の拠点は史料、外形・寸法・段差・建物は北伊勢の土の城からの推定。
// 山城の比高は加えない。川を堀とし、後世の長島城の天守・瓦・総石垣は写さない。
export const NAKAE_GATE = { x: 0, z: -52, name: '中江の柵の口' };
export const YANAGASHIMA = { x: 48, z: -70 };
export const NAGASHIMA = { x: 104, z: -90 };
export const TSUTSUMI = { x: -50, z: -60 };
export const NAKASU = { x: 48, z: -49 };

function fort(id, name, poly, level, gate, roads, towers) {
  return {
    name,
    kuruwa: [{ id, name, poly, level, dorui: 1.1, wall: 'palisade', wallOpt: { mound: false, h: 2 }, gapAt: gate, gapW: 4, sakamogi: [] }],
    koguchi: [{ id: `${id}_gate`, name: `${name}の木戸`, at: gate, w: 4 }],
    paths: roads.map(pts => ({ pts, w: 2.4 })),
    yagura: towers.map((at, n) => ({ id: `${id}_watch_${n}`, name: `${name}の物見`, at })),
    hori: [],
  };
}
export const NAKAE_PLAN = fort('nakae', '中江の砦', [[-30, -56], [-10, -52], [10, -52], [30, -56], [30, -102], [-30, -102]], 1.1, [0, -52],
  [[[0, -46], [0, -52], [0, -90]], [[0, -64], [-16, -64]], [[0, -68], [14, -68]], [[0, -90], [-8, -92]], [[0, -90], [16, -90]]], [[-20, -60], [20, -60]]);
export const YANAGASHIMA_PLAN = fort('yanagashima', '屋長島の砦', [[36, -54], [66, -54], [66, -94], [36, -94]], 1, [48, -54],
  [[[48, -52], [48, -54], [48, -86]], [[48, -68], [42, -68]], [[48, -80], [57, -80]]], [[60, -60], [40, -86]]);
export const NAGASHIMA_PLAN = fort('nagashima', '長島城', [[90, -66], [124, -66], [124, -116], [90, -116]], 1.5, [104, -66],
  [[[104, -48], [104, -66], [104, -90], [104, -96]], [[104, -80], [96, -80]], [[104, -84], [118, -84]], [[118, -84], [122, -84], [122, -107], [118, -107]]], [[96, -72], [118, -110]]);
// 長島城のみ奥に小さな詰めの平場を設ける。元の城主の館を使った推定で、天守ではない。
NAGASHIMA_PLAN.kuruwa.push({ id: 'nagashima_oku', name: '長島城の奥の囲み', poly: [[94, -90], [114, -90], [114, -112], [94, -112]], level: 2.1, dorui: .6, wall: 'palisade', wallOpt: { mound: false, h: 1.6 }, gapAt: [104, -90], gapW: 4, sakamogi: [] });
NAGASHIMA_PLAN.koguchi.push({ id: 'nagashima_oku_gate', name: '奥の木戸', at: [104, -90], w: 4 });
export const TSUTSUMI_PLAN = fort('tsutsumi', '堤の砦', [[-58, -53], [-42, -53], [-42, -65], [-58, -65]], .9, [-50, -53],
  [[[-50, -46], [-50, -53], [-50, -57]]], [[-55, -60]]);
export const NAKASU_PLAN = fort('nakasu', '中洲の砦', [[40, -43], [58, -43], [58, -51], [40, -51]], .8, [48, -43],
  [[[48, -40], [48, -43], [48, -46]]], [[43, -48.5]]);
export const FORT_PLANS = [NAKAE_PLAN, YANAGASHIMA_PLAN, NAGASHIMA_PLAN, TSUTSUMI_PLAN, NAKASU_PLAN];
export const NAGASHIMA_ALL_PLAN = {
  name: '長島の輪中の城と砦',
  kuruwa: FORT_PLANS.flatMap(p => p.kuruwa), koguchi: FORT_PLANS.flatMap(p => p.koguchi),
  paths: FORT_PLANS.flatMap(p => p.paths), yagura: FORT_PLANS.flatMap(p => p.yagura), hori: [],
};
// 本陣の広場と中央の道を空ける。入口はすべて南面。屋根は軍用小屋が板葺き、長島の館だけ檜皮葺き。
export const FORT_BUILDINGS = [
  { id: 'naka_watch', name: '中江の番所', x: -16, z: -68, w: 7, d: 5, kind: 'nagaya', enter: true },
  { id: 'naka_nagaya', name: '中江の長屋', x: 14, z: -72, w: 9, d: 5, kind: 'nagaya', enter: true },
  { id: 'naka_kura', name: '中江の砦の蔵', x: -8, z: -96, w: 7, d: 5 },
  { id: 'naka_hut', name: '中江の砦の小屋', x: 16, z: -94, w: 7, d: 5 },
  { id: 'naka_west', name: '中江の兵糧小屋', x: -23, z: -85, w: 6, d: 5 },
  { id: 'yana_nagaya', name: '屋長島の長屋', x: 42, z: -73, w: 6, d: 5, kind: 'nagaya', enter: true },
  { id: 'yana_kura', name: '屋長島の砦の蔵', x: 57, z: -85, w: 7, d: 5 },
  { id: 'castle_hall', name: '長島城の館', x: 104, z: -102, w: 12, d: 8, kind: 'goten', enter: true },
  { id: 'castle_watch', name: '長島城の番所', x: 96, z: -84, w: 6, d: 5, kind: 'nagaya', enter: true },
  { id: 'castle_nagaya', name: '長島城の長屋', x: 118, z: -88, w: 7, d: 5, kind: 'nagaya', enter: true },
  { id: 'castle_kura', name: '長島城の蔵', x: 118, z: -101, w: 6, d: 5 },
  // 木戸の控柱を避け、中洲では外階段の手前まで北の柵の内に収める。
  { id: 'bank_watch', name: '堤の砦の番所', x: -48, z: -61, w: 5, d: 4, kind: 'nagaya', enter: true },
  { id: 'island_watch', name: '中洲の砦の番所', x: 52, z: -48.2, w: 5, d: 3, kind: 'nagaya', enter: true },
];
export const FORT_ROADS = [...NAGASHIMA_ALL_PLAN.paths.map(p => p.pts),
  [[0, -64], [-20, -57]], [[0, -64], [20, -57]], [[48, -60], [60, -57]], [[48, -86], [40, -83]],
  [[104, -76], [96, -69]], [[122, -107], [118, -107]], [[-50, -57], [-55, -57]], [[48, -44], [43, -45.6]],
  [[-8, -92], [-8, -93.5]], [[16, -90], [16, -91.5]], [[57, -80], [57, -82.5]], [[122, -96.5], [118, -96.5]], [[48, -46], [52, -45.6]], [[-50, -57], [-48, -58]],
];
