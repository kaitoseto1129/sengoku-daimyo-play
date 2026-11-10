// 11/7（critic60・check60 五城の並び）：+x が西。史実の西から東の順（中江・屋長島・長島）に合わせ、手前の砦を長島城（降って舟で退く城）、
// 西の端（x=152）を揖斐川の西の中江城とした（形はそのまま、名と役を入れ替えた）。
// 天正二年の長島。三川の輪中と別々の拠点は史料、外形・寸法・段差・建物は北伊勢の土の城からの推定。
// 山城の比高は加えない。川を堀とし、後世の長島城の天守・瓦・総石垣は写さない。
export const NAKAE_GATE = { x: 0, z: -52, name: '長島城の柵の口' };
export const YANAGASHIMA = { x: 48, z: -70 };
export const NAGASHIMA = { x: 152, z: -90 };
export const TSUTSUMI = { x: -50, z: -60 };
export const NAKASU = { x: 48, z: -49 };

function fort(id, name, poly, level, gate, roads, towers) {
  return {
    name,
    kuruwa: [{ id, name, poly, level, dorui: 1.1, wall: 'palisade', wallOpt: { mound: false, h: 2 }, gapAt: gate, gapW: 4, sakamogi: [] }],
    koguchi: [{ id: `${id}_gate`, name: `${name}の木戸`, at: gate, w: 4 }],
    paths: roads.map(pts => ({ pts, w: 2.4 })),
    // 小さな堤・中洲は低い物見。長島の奥だけ下部を板で囲う二重の井楼。
    // 高さ別の形は共通部品が近景・遠景で使い回す。数と置き場所は前巡のまま。
    yagura: towers.map((at, n) => ({ id: `${id}_watch_${n}`, name: `${name}の物見`, at,
      lookout: { height: id === 'tsutsumi' || id === 'nakasu' ? 6.6 : id === 'nagashima' ? 10 : 8.8,
        boarded: id === 'nagashima' && n === 1, logFrame: true },
    })),
    hori: [],
  };
}
export const NAKAE_PLAN = fort('nakae', '長島城', [[-30, -56], [-10, -52], [10, -52], [30, -56], [30, -102], [-30, -102]], 1.1, [0, -52],
  [[[0, -46], [0, -52], [0, -90]], [[0, -64], [-16, -64]], [[0, -68], [14, -68]], [[0, -90], [-8, -92]], [[0, -90], [16, -90]]], [[-20, -60], [20, -60]]);
export const YANAGASHIMA_PLAN = fort('yanagashima', '屋長島の砦', [[36, -54], [66, -54], [66, -94], [36, -94]], 1, [48, -54],
  [[[48, -52], [48, -54], [48, -86]], [[48, -68], [42, -68]], [[48, -80], [57, -80]]], [[60, -60], [40, -86]]);
export const NAGASHIMA_PLAN = fort('nagashima', '中江城', [[138, -66], [172, -66], [172, -116], [138, -116]], 1.5, [152, -66],
  [[[152, -48], [152, -66], [152, -90], [152, -96]], [[152, -80], [144, -80]], [[152, -84], [166, -84]], [[166, -84], [170, -84], [170, -107], [166, -107]]], [[144, -72], [166, -110]]);
// 長島城のみ奥に小さな詰めの平場を設ける。元の城主の館を使った推定で、天守ではない。
NAGASHIMA_PLAN.kuruwa.push({ id: 'nagashima_oku', name: '中江城の奥の囲み', poly: [[142, -90], [162, -90], [162, -112], [142, -112]], level: 2.1, dorui: .6, wall: 'palisade', wallOpt: { mound: false, h: 1.6 }, gapAt: [152, -90], gapW: 4, sakamogi: [] });
NAGASHIMA_PLAN.koguchi.push({ id: 'nagashima_oku_gate', name: '奥の木戸', at: [152, -90], w: 4 });
export const TSUTSUMI_PLAN = fort('tsutsumi', '堤の砦', [[-58, -53], [-42, -53], [-42, -65], [-58, -65]], .9, [-50, -53],
  [[[-50, -46], [-50, -53], [-50, -57]]], [[-55, -60]]);
// 砦を取った後は南の舟着場へ進む。北の入口だけでは、奥の柵で本人も門徒も閉じ込められる。
// 番所と物見の間を通り、舟着場まで見える木戸・土塁の切れ目・道を同じ座標で作る。
TSUTSUMI_PLAN.kuruwa[0].gapAt = [[-50, -53], [-54, -65]];
TSUTSUMI_PLAN.koguchi.push({ id: 'tsutsumi_oku_gate', name: '舟着場への木戸', at: [-54, -65], w: 4 });
TSUTSUMI_PLAN.paths.push({ pts: [[-50, -57], [-54, -65], [-57, -76]], w: 2.4 });
export const NAKASU_PLAN = fort('nakasu', '中洲の砦', [[40, -43], [58, -43], [58, -51], [40, -51]], .8, [48, -43],
  [[[48, -40], [48, -43], [48, -46], [48, -51], [48, -54]]], [[43, -48.5]]);
// 屋長島への道を中洲の奥の柵で塞がない。包囲の口と同じ筋に、反対側の木戸も開ける。
NAKASU_PLAN.kuruwa[0].gapAt = [[48, -43], [48, -51]];
NAKASU_PLAN.koguchi.push({ id: 'nakasu_oku_gate', name: '中洲の奥の木戸', at: [48, -51], w: 4 });
export const FORT_PLANS = [NAKAE_PLAN, YANAGASHIMA_PLAN, NAGASHIMA_PLAN, TSUTSUMI_PLAN, NAKASU_PLAN];
export const NAGASHIMA_ALL_PLAN = {
  name: '長島の輪中の城と砦',
  kuruwa: FORT_PLANS.flatMap(p => p.kuruwa), koguchi: FORT_PLANS.flatMap(p => p.koguchi),
  paths: FORT_PLANS.flatMap(p => p.paths), yagura: FORT_PLANS.flatMap(p => p.yagura), hori: [],
};
// 本陣の広場と中央の道を空ける。入口はすべて南面。屋根は軍用小屋が板葺き、長島の館だけ檜皮葺き。
export const FORT_BUILDINGS = [
  { id: 'naka_watch', name: '長島城の番所', x: -16, z: -68, w: 7, d: 5, kind: 'bansho', enter: true },
  { id: 'naka_nagaya', name: '長島城の長屋', x: 14, z: -72, w: 9, d: 5, kind: 'nagaya', enter: true },
  { id: 'naka_kura', name: '長島城の蔵', x: -8, z: -96, w: 7, d: 5, kind: 'kura', enter: true },
  { id: 'naka_hut', name: '長島城の小屋', x: 16, z: -94, w: 7, d: 5, kind: 'nagaya', enter: true },
  { id: 'naka_west', name: '長島城の兵糧小屋', x: -23, z: -85, w: 6, d: 5, kind: 'kura', enter: true },
  { id: 'yana_nagaya', name: '屋長島の長屋', x: 42, z: -73, w: 6, d: 5, kind: 'nagaya', enter: true },
  { id: 'yana_kura', name: '屋長島の砦の蔵', x: 57, z: -85, w: 7, d: 5, kind: 'kura', enter: true },
  { id: 'castle_hall', name: '中江城の館', x: 152, z: -102, w: 12, d: 8, kind: 'goten', enter: true },
  { id: 'castle_watch', name: '中江城の番所', x: 144, z: -84, w: 6, d: 5, kind: 'bansho', enter: true },
  { id: 'castle_nagaya', name: '中江城の長屋', x: 166, z: -88, w: 7, d: 5, kind: 'nagaya', enter: true },
  { id: 'castle_kura', name: '中江城の蔵', x: 166, z: -101, w: 6, d: 5, kind: 'kura', enter: true },
  // 木戸の控柱を避け、中洲では外階段の手前まで北の柵の内に収める。
  { id: 'bank_watch', name: '堤の砦の番所', x: -48, z: -61, w: 5, d: 4, kind: 'bansho', enter: true },
  { id: 'island_watch', name: '中洲の砦の番所', x: 52, z: -48.2, w: 5, d: 3, kind: 'bansho', enter: true },
];
export const FORT_ROADS = [...NAGASHIMA_ALL_PLAN.paths.map(p => p.pts),
  [[0, -64], [-20, -57]], [[0, -64], [20, -57]], [[48, -60], [60, -57]], [[48, -86], [40, -83]],
  [[152, -76], [144, -69]], [[170, -107], [166, -107]], [[-50, -57], [-55, -57]], [[48, -44], [43, -45.6]],
  [[-8, -92], [-8, -93.5]], [[16, -90], [16, -91.5]], [[57, -80], [57, -82.5]], [[170, -96.5], [166, -96.5]], [[48, -46], [52, -45.6]], [[-50, -57], [-48, -58]],
];
