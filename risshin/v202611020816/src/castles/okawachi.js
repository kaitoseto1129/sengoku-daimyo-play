// ======================================================================
// castles/okawachi.js … 大河内城の縄張り（永禄十二年・長い囲み。docs/first6-1560-1569-spec.md 42〜57）
// 丘陵の先端の城（標高 110m 余り・城域 300m 四方ほどを縮めて組む）。大きな石垣は使わず、
// 天然の谷・堀切・造成した曲輪・柵・木戸・木造の建物で守る。
// 配置（崩さない）：北が大手、南が搦手。中央に本丸、西に西ノ丸、東に二ノ丸、その南に御納戸、さらに南に馬場。
// 向き：北が -z。南（+z）に織田の搦手の封鎖の陣。東に阪内川、北に矢津川、南西と西に深い谷（地形は b_okawachi.js）。
// 札：HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い（hist に持つ。画面には出さない）
// ======================================================================

import { switchback } from '../yamalift.js';
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const HON_C = { x: 0, z: -111 };      // 本丸（中央）
export const NISHI_C = { x: -120, z: -114 };  // 西ノ丸（標高読みの西約180mを120mに縮める）
export const NI_C = { x: 47, z: -117 };      // 二ノ丸（東。主な守りの区域）
export const ONANDO_C = { x: 48, z: -79 };   // 御納戸（二ノ丸の南）
export const BABA_C = { x: 53, z: -46 };     // 馬場（御納戸のさらに南。広く平ら＝予備の集まる所）
export const OTE_C = { x: 0, z: -149 };      // 大手の曲輪（北）
export const GATE = { x: 0, z: -60, name: '搦手の木戸' };   // 搦手（南）の木戸
export const OTE_GATE = { x: 0, z: -160, name: '大手の木戸' };
export const MAE_C = { x: 0, z: -40 };   // 搦手の前（味方が保てば WIN.timeHeld）
export const JO_C = { x: 0, z: -77 };    // 搦手口の曲輪（木戸の内）
export const OTE_HINT = { x: 0, z: -200 }; // 大手の寄せ手の陣（北）
// 古い名（ほかの所が使う）
export const ROAD_KARAMETE = [...switchback([0, 48], [0, -24], 5, 26), [MAE_C.x, MAE_C.z], [0, -52], [GATE.x, GATE.z], [JO_C.x, JO_C.z]];
// 大手道（北の矢津川の側から、曲がって大手の木戸へ）
export const ROAD_OTE = [[0, -250], [-16, -222], [12, -196], [-4, -176], [OTE_GATE.x, OTE_GATE.z], [OTE_C.x, OTE_C.z]];

export const OKAWACHI_HIST = {
  layout: 'HIST_A',        // 北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場の並び（遺構と伝え）
  rivers: 'HIST_A',        // 阪内川（東）・矢津川（北）
  valleys: 'HIST_A',       // 南と西の深い谷
  horikiri: 'HIST_B',      // 曲輪を断つ堀切（位置は推定）
  saku: 'HIST_B',          // 柵・木戸・土塁（中世の山城の作りから推定）
  buildings: 'GAME_C',     // 曲輪の中の建物・櫓の数と形
  siegeCamps: 'HIST_B',    // 織田の囲みが城外の四方に分かれる（数と場所は推定）
  nightRain: 'HIST_A',     // 九月八日夜の搦手攻め・雨で鉄砲が使えず退いた（『信長公記』）
  days: 'GAME_C',          // 日ごとの出来事（日数・配置は調整）
  peace: 'HIST_A',         // 十月の和睦（茶筅丸を養子に）
};

// 門（虎口）：どの曲輪にも木戸を構え、門の幅だけを開ける（castle_plan.js の gapAt と同じ点）
const G = {
  kara: [GATE.x, GATE.z],
  honS: [0, -94], honN: [0, -128], honW: [-18, -111], honE: [18, -111],
  nishiE: [-111, -114], niW: [30, -117], niS: [47, -93],
  onN: [48, -88], onS: [48, -70], babaN: [48, -62],
  oteS: [0, -138], oteN: [OTE_GATE.x, OTE_GATE.z],
};

// 標高読み（±10m）：西ノ丸の細長い尾根と本丸の間は約30m低い谷。
// 谷を直登せず、折れた道を下って登る。道の高さは b_okawachi.js で均す。
export const ROAD_NISHI = [[NISHI_C.x, NISHI_C.z], G.nishiE, [-94, -100],
  [-82, -134], [-60, -145], [-43, -135], [-32, -111], G.honW, [HON_C.x, HON_C.z]];

export const OKAWACHI_PLAN = {
  name: '大河内城', type: 'yama', year: 1569,
  continuousEdges: true, // 切岸の外だけ約二メートル落とさず、曲輪の縁まで土をつなぐ。
  terrainBanks: true, // 土塁は高さに含む。別の薄い土面を重ねて切岸に三角の継ぎ目を作らない。
  gateSlope: 8, // 木戸の前後だけ土を切り、曲輪の段差を歩ける坂でつなぐ。
  // 大将の居場所（kaito 10/2）：本丸の館の奥の間に北畠具教（天守の無い城。戸口は南）
  lordSeat: { kind: 'goten', profile: 'okawachi', oku: 0.48, at: [HON_C.x, HON_C.z - 7], w: 12, d: 7, rot: 0, door: 1, name: '館', where: '本丸の館の奥の間' },
  kuruwa: [
    // 搦手の前：攻め口の段（曲輪ではない。siege_zones の場として使う。塀なし）
    // 搦手の前は城の外（織田が竹束を並べて寄せる斜面）。曲輪の小屋で埋めない（10/28 開始の目の前に小屋が並んでいた）。
    { id: 'mae', name: '搦手の前', dense: false, floor: false, level: (bf) => bf(0, -30), poly: rect(-30, 30, -60, -28) },
    // 搦手口の曲輪：南の木戸の内。北の縁は本丸と分け合い、本丸の南の木戸だけで続く
    { id: 'jo', name: '搦手口の曲輪', level: (bf) => bf(0, -30) + 2.2, wall: 'saku', hp: 700, poly: rect(-18, 18, -94, -60), gapAt: [G.kara] },
    { id: 'hon', name: '本丸', level: (bf) => bf(HON_C.x, HON_C.z) + 1.5, wall: 'saku', hp: 900, poly: rect(-18, 18, -128, -94), gapAt: [G.honS, G.honN, G.honW, G.honE] },
    { id: 'nishi', name: '西ノ丸', level: (bf) => bf(HON_C.x, HON_C.z) - 8.5, wall: 'saku', hp: 700, poly: rect(-129, -111, -161.5, -66.5), gapAt: [G.nishiE] },
    { id: 'ni', name: '二ノ丸', level: (bf) => bf(HON_C.x, HON_C.z) - 1.5, wall: 'saku', hp: 800, // 約61×48m。西の縁は本丸の柵と通り道を避けて切り欠く。
      poly: [[16.5, -141], [77.5, -141], [77.5, -93], [30, -93], [30, -128], [16.5, -128]], gapAt: [G.niW, G.niS] },
    { id: 'onando', name: '御納戸', level: (bf) => bf(ONANDO_C.x, ONANDO_C.z) + 0.4, wall: 'saku', hp: 600, poly: rect(34, 62, -88, -70), gapAt: [G.onN, G.onS] },
    { id: 'baba', name: '馬場', level: (bf) => bf(BABA_C.x, BABA_C.z) + 0.3, wall: 'saku', hp: 600, poly: rect(26, 80, -62, -30), gapAt: [G.babaN] },
    { id: 'ote', name: '大手の曲輪', level: (bf) => bf(OTE_C.x, OTE_C.z) + 0.6, wall: 'saku', hp: 800, poly: rect(-14, 14, -160, -138), gapAt: [G.oteS, G.oteN] },
  ],
  koguchi: [
    { id: 'karamete', name: GATE.name, from: 'mae', to: 'jo', kind: 'hira', gate: 'kabuki', at: G.kara, rot: 0, w: 7 },
    { id: 'hon_s', name: '本丸の南の木戸', from: 'jo', to: 'hon', kind: 'hira', gate: 'kabuki', at: G.honS, rot: 0, w: 4 },
    { id: 'hon_n', name: '本丸の北の木戸', from: 'ote', to: 'hon', kind: 'hira', gate: 'kabuki', at: G.honN, rot: 0, w: 4 },
    { id: 'hon_w', name: '本丸の西の木戸', from: 'nishi', to: 'hon', kind: 'hira', gate: 'kabuki', at: G.honW, rot: Math.PI / 2, w: 3.6 },
    { id: 'hon_e', name: '本丸の東の木戸', from: 'ni', to: 'hon', kind: 'hira', gate: 'kabuki', at: G.honE, rot: Math.PI / 2, w: 3.6 },
    { id: 'nishi_e', name: '西ノ丸の木戸', from: 'hon', to: 'nishi', kind: 'hira', gate: 'kabuki', at: G.nishiE, rot: Math.PI / 2, w: 3.6 },
    { id: 'ni_w', name: '二ノ丸の西の木戸', from: 'hon', to: 'ni', kind: 'hira', gate: 'kabuki', at: G.niW, rot: Math.PI / 2, w: 3.6 },
    { id: 'ni_s', name: '二ノ丸の南の木戸', from: 'onando', to: 'ni', kind: 'hira', gate: 'kabuki', at: G.niS, rot: 0, w: 3.6 },
    { id: 'on_n', name: '御納戸の北の木戸', from: 'ni', to: 'onando', kind: 'hira', gate: 'kabuki', at: G.onN, rot: 0, w: 3.6 },
    { id: 'on_s', name: '御納戸の南の木戸', from: 'baba', to: 'onando', kind: 'hira', gate: 'kabuki', at: G.onS, rot: 0, w: 3.6 },
    { id: 'baba_n', name: '馬場の木戸', from: 'onando', to: 'baba', kind: 'hira', gate: 'kabuki', at: G.babaN, rot: 0, w: 4 },
    { id: 'ote_s', name: '大手の曲輪の内の木戸', from: 'ote', to: 'hon', kind: 'hira', gate: 'kabuki', at: G.oteS, rot: 0, w: 4 },
    { id: 'ote_n', name: OTE_GATE.name, from: 'out', to: 'ote', kind: 'hira', gate: 'kabuki', at: G.oteN, rot: 0, w: 5 },
  ],
  paths: [
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'nishi', kind: 'road', pts: ROAD_NISHI },
  ],
  // 堀切：本丸と西ノ丸・二ノ丸の間で尾根を断つ（木戸の前は土橋で渡す）。大手の北にも尾根を断つ堀切（道の所は土橋）
  hori: [
    { kind: 'horikiri', pts: [[-24, -140], [-24, -116]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[-24, -106], [-24, -90]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[24, -142], [24, -124]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[24, -106], [24, -90]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[-44, -170], [-5, -170]], w: 5, deep: 2.8 },
    { kind: 'horikiri', pts: [[5, -170], [44, -170]], w: 5, deep: 2.8 },
    // 曲輪と夜攻めの道を避けた斜面の竪堀。位置・断面は推定。
    { kind: 'tatebori', pts: [[-137, -145], [-148, -127], [-158, -106]], w: 3, deep: 2 },
    { kind: 'tatebori', pts: [[83, -138], [94, -118], [103, -96]], w: 3, deep: 2 },
  ],
  yagura: [
    { id: 'yagura_w', kind: 'monomi', at: [-12, GATE.z - 5] },
    { id: 'yagura_e', kind: 'monomi', at: [12, GATE.z - 5] },
    { id: 'yagura_ote', kind: 'monomi', at: [10, OTE_GATE.z + 5] },
  ],
};

// 本の山城の段々・尾根沿いの柵を参考にした「高」専用の推定復元。
// 門の座標・段の高さ・城外の道は動かさず、谷側の角を尾根に沿って落とす。
const RIDGE_POLYS = {
  // 門のある辺の中央は残し、尾根の肩に当たる隅だけを落とす。
  // 本丸の西木戸と東木戸、搦手の兵の立ち場は動かさない。
  hon: [[-13, -128], [13, -128], [18, -123], [18, -99], [13, -94], [-13, -94], [-18, -99], [-18, -123]],
  jo: [[-13, -94], [13, -94], [18, -89], [18, -66], [12, -60], [-12, -60], [-18, -66], [-18, -89]],
  ote: [[-9, -160], [9, -160], [14, -155], [14, -143], [9, -138], [-9, -138], [-14, -143], [-14, -155]],
  nishi: [[-126, -161.5], [-114, -161.5], [-111, -152], [-111, -76], [-116, -66.5], [-124, -66.5], [-129, -78], [-129, -149]],
  ni: [[16.5, -137], [23, -141], [69, -141], [77.5, -133], [77.5, -102], [69, -93], [30, -93], [30, -128], [16.5, -128]],
  onando: [[39, -88], [57, -88], [62, -83], [62, -75], [57, -70], [39, -70], [34, -75], [34, -83]],
  baba: [[32, -62], [70, -62], [80, -54], [80, -39], [70, -30], [36, -30], [26, -38], [26, -53]],
};
export const OKAWACHI_HIGH_PLAN = {
  ...OKAWACHI_PLAN,
  // 写真の館は厚く反った檜皮の入母屋でなく、薄い葺き板と押さえ木の切妻。
  // 高だけ既存の板葺きを選び、白い側壁も灰土色へ。床・戸口・奥の間は同じ位置。
  lordSeat: { ...OKAWACHI_PLAN.lordSeat, boardRoof: true, earth: 0xa4997f },
  kuruwa: OKAWACHI_PLAN.kuruwa.map(k => ({
    ...k, poly: RIDGE_POLYS[k.id] || k.poly,
    // 上の館と攻め口は板塀、細い尾根と物資の段は隙間のある丸太柵。
    ...(['nishi', 'onando', 'baba'].includes(k.id)
      // 写真の段の柵は細い杭と横木二段。太い外周防柵の四段の横木を減らす。
      ? { wallOpt: { openFence: true, lightFence: true, h: 2.1, mound: false }, dorui: 0.8 }
      // 館・屋敷の囲いは写真の笠板付き板塀。尖った乱杭を重ねず、縦板の目地を見せる。
      : k.wall ? { wallOpt: { boardCap: true } } : {}),
  })),
  // 三基を搦手・東の曲輪・西の尾根へ配る。基数と守兵の枠は増やさない。
  yagura: OKAWACHI_PLAN.yagura.map(y => ({ ...y,
    at: y.id === 'yagura_e' ? [70, -119] : y.id === 'yagura_ote' ? [-120, -151] : y.at,
    // 山頂の天守のように同じ高さでそろえず、搦手は低く、谷を望む西の物見は高く。
    // 写真の井楼のように脚部の丸太組みを見せる。低い画質の指定には触れない。
    height: y.id === 'yagura_w' ? 7.2 : y.id === 'yagura_e' ? 8.8 : 10,
    boarded: false,
  })),
};
