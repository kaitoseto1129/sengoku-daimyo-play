// ======================================================================
// castles/mitsukuri.js … 箕作城の縄張り（永禄十一年・夜攻め）
// 参照：docs/layout-ref/nawabari-measured.md「二回目・箕作」。村田修三氏原図（30ｍ棒）と五個荘町位置図（100ｍ棒）。
// 水平縮尺１：１。主郭は西北西→東南東の長さ39ｍ、西幅10ｍ・東幅15ｍ。城域は約270×170ｍ。
// 主郭から東へ約170ｍ、西北西へ約110ｍ、南へ約85ｍ。東約59ｍ・５ｍ下の段を遊びの二の丸に充てる。
// 南の攻め口→三の郭→木戸→東の段（二の丸）→西の主郭という任務順を保つ。名称・守り所・柵は遊びの補い。
// 主郭西端の内側の弧は段として補う（土塁か段か不明）。西外面の石垣の一部は根拠あり。
// 周辺小郭の細かな寸法・高さ、堀切の幅・深さ、虎口の向きは推定。比高210ｍ・大天守なし。
// ======================================================================

import { switchback } from '../yamalift.js';
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const SAN_C = { x: 0, z: -56 };   // 三の郭：坂の守りの段
export const NI_C = { x: 0, z: -80 };    // 二の丸：木戸構え
export const HON_C = { x: -55, z: -100 };  // 本丸
export const KIDO = { x: 0, z: -64, name: '木戸' };
export const NISHI_TANI_X = -34;         // 西の谷（松明を消して回る道）

// 主郭の長軸に沿う座標。素材を増やさず、開戦前に一度だけ点を作る。
export function honPoint(s, t = 0) { return [HON_C.x + s * Math.cos(Math.PI / 9) - t * Math.sin(Math.PI / 9), HON_C.z + s * Math.sin(Math.PI / 9) + t * Math.cos(Math.PI / 9)]; }
export const HON_ENTRY = honPoint(19.5);
export const HON_EXIT = honPoint(-19.5);
export const ROAD_HON = [[NI_C.x, NI_C.z], [-16, -86], honPoint(26), HON_ENTRY, honPoint(10), [HON_C.x, HON_C.z]];
export const ROAD_HON_LEVELS = [6, 6, 8, 10, 11, 11];
// 大手道（南から木戸へ登り、東西の尾根を西へ折れて主郭へ）
// 比高２１０ｍと南の攻め口を保ち、尾根では主郭まで西へ進む。[0,-30] は添字７。
export const ROAD_OTE = [...switchback([0, 56], [0, -30], 7, 50), [SAN_C.x, SAN_C.z], [0, -64], [KIDO.x, KIDO.z], [0, -80], [NI_C.x, NI_C.z], ...ROAD_HON.slice(1)];
// 谷の道（西の谷筋を松明を消して忍び登り、坂の正面を避けて三の郭の柵の口の脇へ出る。柵は越えられないので口から入る）
// 逆茂木は z=-39。西端の外を回り、南の空いた帯から中央の口へ入る。
// 谷も左右へ折り、斜めの折返しで短い急坂ができないよう南北の線から振る。
export const ROAD_TANI = [...ROAD_OTE.slice(0, 5), ...switchback([NISHI_TANI_X, ROAD_OTE[4][1]], [NISHI_TANI_X, -36], 5, 40), [-26, -35], [0, -35], [0, -41]];
// 全周を柵で閉じて退けなくしない。北の小口と山道は推定復元。
export const ROAD_URA = [[HON_C.x, HON_C.z], honPoint(0, -6), [-62, -120], [-78, -140], [-88, -160]];

export const MITSUKURI_PLAN = {
  name: '箕作城', type: 'yama', year: 1568,
  continuousEdges: true, // 土の切岸を郭の縁へつなぎ、縁の外だけ約２．３ｍ落ちる段差をなくす。
  // 本丸の館。大天守は無い。城将と旗本の配置は戦の定義が扱う。
  // 館は西寄りに置く。東の入口から守備の持ち場・集合地まで白壁を横切らずに進める。
  lordSeat: { kind: 'goten', profile: 'mitsukuri', oku: 0.32, at: honPoint(-7, -1.5), w: 11, d: 4, rot: -Math.PI / 9, door: 1, name: '館', where: '本丸の館の奥の間' },
  kuruwa: [
    // 三の郭：外側の防御線。柵で囲い、南の柵の口だけを開ける（口の前に逆茂木。sakamogi は b_mitsukuri.js 側で飾る）
    { id: 'san', name: '三の郭（坂の上）', level: 2, wall: 'saku', hp: 360, poly: rect(-20, 20, -64, -44), gapAt: [[0, -44]] },
    // 東約59ｍの段。南の木戸から入り、西の口を抜けて主郭へ。広さと木戸は遊びの推定。
    { id: 'ni', name: '二の丸（木戸構え）', level: 6, wall: 'saku', hp: 460, poly: rect(-16, 16, -92, -64), gapAt: [[KIDO.x, KIDO.z], [-16, -86], [16, -86]] },
    { id: 'hon', name: '本丸', level: 11, wall: 'saku', hp: 560,
      poly: [[-19.5,-5],[-4,-5],[2,-7.5],[15,-7.5],[19.5,-5],[19.5,5],[15,7.5],[2,7.5],[-4,5],[-19.5,5]].map(([s,t]) => honPoint(s,t)),
      gapAt: [HON_ENTRY, HON_EXIT, honPoint(0,-6)], gapW: 7 },
    { id: 'hon_arc', name: '主郭西端の弧の段（推定）', level: 12,
      poly: [[-19,-5],[-16,-4],[-14,-2],[-13,0],[-14,2],[-16,4],[-19,5],[-18,3],[-16,1.5],[-15,0],[-16,-1.5],[-18,-3]].map(([s,t]) => honPoint(s,t)) },
    // 主郭直東の約６ｍの小段。その先の小郭の形と高さは推定、追加の柵で道を閉じない。
    { id: 'east', name: '主郭東の小段', level: 8, poly: [[20,-5],[26,-5],[26,5],[20,5]].map(([s,t]) => honPoint(s,t)) },
    { id: 'west', name: '西の段', level: 9, poly: rect(-90,-76,-120,-106) },
    { id: 'west2', name: '西尾根の中段（推定）', level: 6, poly: rect(-127,-104,-145,-126) },
    { id: 'west3', name: '西北西尾根の端の段（推定）', level: 2, poly: rect(-155,-133,-185,-149) },
    { id: 'east2', name: '東尾根の中段（推定）', level: 3, poly: rect(36,60,-112,-94) },
    { id: 'east3', name: '東尾根の端の段（推定）', level: 0, poly: rect(85,115,-142,-118) },
    { id: 'south', name: '南尾根の段（推定）', level: 0, poly: rect(-63,-47,-36,-15) },
  ],
  koguchi: [
    // 三の郭の柵の口（戸は無く、冠木だけ。b_mitsukuri.js が冠木の枠を飾る）。門の幅だけ開ける
    { id: 'san_kuchi', name: '三の郭の柵の口', from: 'out', to: 'san', kind: 'hira', at: [0, -44], rot: 0, w: 7 },
    { id: 'kido', name: KIDO.name, from: 'san', to: 'ni', kind: 'hira', gate: 'kabuki', at: [KIDO.x, KIDO.z], rot: 0, w: 3.6 },
    { id: 'ura_kuchi', name: '北の小口', from: 'hon', to: 'out', kind: 'hira', at: honPoint(0,-6), rot: 0, w: 3 },
  ],
  paths: [
    // 小祠まで道の高さを保つ。手前で切ると山の肩の地面と戸口に段差が残る。
    { id: 'west', kind: 'tani', pts: [[HON_C.x,HON_C.z], HON_EXIT, [-83,-113], [-115,-135], [-144,-166]], levels: [11,11,9,6,2] },
    { id: 'east', kind: 'tani', pts: ROAD_HON, levels: ROAD_HON_LEVELS },
    { id: 'east_ridge', kind: 'tani', pts: [[0,-80],[16,-86],[48,-103],[100,-130]], levels: [6,6,3,0] },
    { id: 'south_ridge', kind: 'tani', pts: [[-83,-113],[-55,-75],[-55,-25]], levels: [9,4,0] },
    { id: 'shrine', kind: 'tani', pts: [[-83,-113],[-86,-113]], levels: [9,9] },
    { id: 'bansho', kind: 'tani', pts: [[0, -53], [-9, -53]] },
    { id: 'kura', kind: 'tani', pts: [[0, -51], [9, -51]] },
    { id: 'nagaya', kind: 'tani', pts: [[0, -73], [-6, -73]] },
    { id: 'tsume', kind: 'tani', pts: [[0, -84], [8, -84]] },
    { id: 'monomi', kind: 'tani', pts: [[0, -76], [13, -76]] },
    { id: 'san_w_monomi', kind: 'tani', pts: [[0, -58], [-9, -58]] },
    { id: 'san_e_monomi', kind: 'tani', pts: [[0, -58], [10, -58]] },
    { id: 'hon_ura', kind: 'tani', pts: ROAD_URA, levels: [11,11,9,6,2] },
    { id: 'east_monomi', kind: 'tani', pts: [[48,-103],[53,-103],[53,-106]], levels: [3,3,3] },
    { id: 'water', kind: 'tani', pts: [[48,-103],[50,-101]], levels: [3,3] },
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'tani', kind: 'tani', pts: ROAD_TANI },
    { id: 'ura', kind: 'tani', pts: ROAD_URA },
  ],
  // 西北西尾根を横切る堀切と竪堀。幅4.5ｍ・深さ1.6ｍ、幅2.6ｍ・深さ1.8ｍは従来の推定を保つ。
  // 大手道・西の谷道から離し、今の攻め口と登り道を塞がない。
  hori: [
    { kind: 'horikiri', pts: [[-127, -149], [-109, -158]], w: 4.5, deep: 1.6 },
    { kind: 'tatebori', pts: [[-127, -149], [-143, -137], [-161, -117]], w: 2.6, deep: 1.8 },
  ],
  yagura: [
    { id: 'monomi_ni', name: '木戸の物見', kind: 'monomi', at: [13, -78] },
    { id: 'monomi_san_w', name: '大手の物見', kind: 'monomi', at: [-9, -61] },
    { id: 'monomi_san_e', name: '谷の物見', kind: 'monomi', at: [10, -61] },
    { id: 'monomi_east', name: '東の物見', kind: 'monomi', at: [53, -109] },
  ],
};
