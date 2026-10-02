// ======================================================================
// castles/okawachi.js … 大河内城の縄張り（永禄十二年・長い囲み。docs/first6-1560-1569-spec.md 42〜57）
// 丘陵の先端の城（標高 110m 余り・城域 300m 四方ほどを縮めて組む）。大きな石垣は使わず、
// 天然の谷・堀切・造成した曲輪・柵・木戸・木造の建物で守る。
// 配置（崩さない）：北が大手、南が搦手。中央に本丸、西に西ノ丸、東に二ノ丸、その南に御納戸、さらに南に馬場。
// 向き：北が -z。南（+z）に織田の搦手の封鎖の陣。東に阪内川、北に矢津川、南西と西に深い谷（地形は b_okawachi.js）。
// 札：HIST_A＝史実・遺構から根拠が強い／HIST_B＝推定復元／GAME_C＝ゲームの補い（hist に持つ。画面には出さない）
// ======================================================================

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export const HON_C = { x: 0, z: -111 };      // 本丸（中央）
export const NISHI_C = { x: -45, z: -114 };  // 西ノ丸（西。西は深い谷）
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
export const ROAD_KARAMETE = [[0, 40], [0, 0], [0, -24], [MAE_C.x, MAE_C.z], [0, -52], [GATE.x, GATE.z], [JO_C.x, JO_C.z]];
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
  nishiE: [-30, -114], niW: [30, -117], niS: [47, -98],
  onN: [48, -88], onS: [48, -70], babaN: [48, -62],
  oteS: [0, -138], oteN: [OTE_GATE.x, OTE_GATE.z],
};

export const OKAWACHI_PLAN = {
  name: '大河内城', type: 'yama', year: 1569,
  kuruwa: [
    // 搦手の前：攻め口の段（曲輪ではない。siege_zones の場として使う。塀なし）
    { id: 'mae', name: '搦手の前', level: (bf) => bf(0, -30), poly: rect(-30, 30, -60, -28) },
    // 搦手口の曲輪：南の木戸の内。北の縁は本丸と分け合い、本丸の南の木戸だけで続く
    { id: 'jo', name: '搦手口の曲輪', level: (bf) => bf(0, -30) + 2.2, wall: 'saku', hp: 700, poly: rect(-18, 18, -94, -60), gapAt: [G.kara] },
    { id: 'hon', name: '本丸', level: (bf) => bf(HON_C.x, HON_C.z) + 1.5, wall: 'saku', hp: 900, poly: rect(-18, 18, -128, -94), gapAt: [G.honS, G.honN, G.honW, G.honE] },
    { id: 'nishi', name: '西ノ丸', level: (bf) => bf(NISHI_C.x, NISHI_C.z) + 0.6, wall: 'saku', hp: 700, poly: rect(-60, -30, -132, -96), gapAt: [G.nishiE] },
    { id: 'ni', name: '二ノ丸', level: (bf) => bf(NI_C.x, NI_C.z) + 0.6, wall: 'saku', hp: 800, poly: rect(30, 64, -136, -98), gapAt: [G.niW, G.niS] },
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
  ],
  // 堀切：本丸と西ノ丸・二ノ丸の間で尾根を断つ（木戸の前は土橋で渡す）。大手の北にも尾根を断つ堀切（道の所は土橋）
  hori: [
    { kind: 'horikiri', pts: [[-24, -140], [-24, -116]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[-24, -106], [-24, -90]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[24, -142], [24, -124]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[24, -106], [24, -90]], w: 4.5, deep: 2.6 },
    { kind: 'horikiri', pts: [[-44, -170], [-5, -170]], w: 5, deep: 2.8 },
    { kind: 'horikiri', pts: [[5, -170], [44, -170]], w: 5, deep: 2.8 },
  ],
  yagura: [
    { id: 'yagura_w', kind: 'monomi', at: [-12, GATE.z - 5] },
    { id: 'yagura_e', kind: 'monomi', at: [12, GATE.z - 5] },
    { id: 'yagura_ote', kind: 'monomi', at: [10, OTE_GATE.z + 5] },
  ],
};
