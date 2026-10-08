// ======================================================================
// castles/hijiyama.js … 比自山城（docs/final7-1579-1582-spec.md 30〜44章）
// 伊賀では珍しい大きな山城。元は観音寺の平場を転用した主郭（寺の跡）を頂に、
// 尾根の曲輪→堀切→曲輪→堀切→外郭を、北（搦手）と東（脇の尾根）の複数の方向へ延ばす（一本道でない）。
// 南（大手・丹羽の陣の方）だけは b_iga.js 側で手組みの木戸を置く。柵の口と扉の幅をそろえる。
// castle_plan.js の形（kuruwa・hori・koguchi）で書く。地形の下地・兵・戦い方は b_iga.js 側。
// ======================================================================
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 口を頂点でなく平らな辺の中央に置く。隣の辺の端が道の中心を塞がない。
function court(cx, cz, r) { return [[cx - 3, cz + r], [cx + 3, cz + r], [cx + r, cz + 3], [cx + r, cz - 3], [cx + 3, cz - r], [cx - 3, cz - r], [cx - r, cz - 3], [cx - r, cz + 3]]; }

// 曲輪の中心
export const SHU = { x: 0, z: -90 };          // 主郭（観音寺跡。全曲輪で最高所＝指揮所・見張り）
export const KITA = { x: 0, z: -130 };        // 北の尾根曲輪（搦手。裏の尾根への退路）
export const KITASOTO = { x: 0, z: -168 };    // 北外郭（さらに奥。殿の最後の口）
export const HIGASHI = { x: 34, z: -90 };     // 東の脇曲輪（林側の尾根。山から下りる伊賀衆の出口）
// 伊賀市の解説は城域南北350m・比高150m・多数の曲輪を確認できる。
// 縄張図の画像は取得できないため、追加する北尾根の輪郭・位置・段差は復元値。
// 南の堀（z=-48）から北端（z=-398）までを実寸にし、既存の四曲輪は動かさない。
export const OKU = { x: 0, z: -270 };
export const KITAEND = { x: 0, z: -388 };

export const HIJIYAMA_PLAN = {
  name: '比自山城', type: 'yama', year: 1581,
  kuruwa: [
    // 主郭（観音寺の平場を転用）：南だけ木戸の分を開け、他は土塁＋柵で四周を囲む（南の扉は b_iga.js が作る）
    { id: 'shu', name: '主郭（観音寺跡）', poly: court(SHU.x, SHU.z, 18), level: (bf) => bf(SHU.x, SHU.z) + 5, wall: 'saku', dorui: 2.4, gapAt: [[0, SHU.z + 18], [18, SHU.z], [0, SHU.z - 18]] },
    { id: 'kita', name: '北の尾根曲輪', poly: court(KITA.x, KITA.z, 11), level: (bf) => bf(KITA.x, KITA.z) + 3, wall: 'saku', gapAt: [[0, KITA.z + 11], [0, KITA.z - 11]] },
    { id: 'kitasoto', name: '北外郭', poly: court(KITASOTO.x, KITASOTO.z, 10), level: (bf) => bf(KITASOTO.x, KITASOTO.z) + 1, wall: 'saku', gapAt: [[0, KITASOTO.z + 10], [0, KITASOTO.z - 10]] },
    { id: 'higashi', name: '東の脇曲輪', poly: court(HIGASHI.x, HIGASHI.z, 10), level: (bf) => bf(HIGASHI.x, HIGASHI.z) + 4, wall: 'saku', gapAt: [HIGASHI.x - 10, HIGASHI.z] },
    { id: 'oku', name: '奥の尾根曲輪', poly: court(OKU.x, OKU.z, 14), level: (bf) => bf(OKU.x, OKU.z) + 1, wall: 'saku', gapAt: [[0, OKU.z + 14], [0, OKU.z - 14]] },
    { id: 'kitaend', name: '北端の曲輪', poly: court(KITAEND.x, KITAEND.z, 10), level: (bf) => bf(KITAEND.x, KITAEND.z) + 1, wall: 'saku', gapAt: [[0, KITAEND.z + 10], [0, KITAEND.z - 10]] },
  ],
  // 連続の堀切：尾根を断つ。降りて登る間に、上の曲輪から攻め手を叩ける（北へ二重、東へ一つ＝複数の方向）
  hori: [
    // 幅六メートルの掘り残しで、北・東への連絡路と退き口を通す。位置は復元。
    { kind: 'horikiri', pts: [[3, SHU.z - 22], [15, SHU.z - 22]], w: 6, deep: 2.4 },
    { kind: 'horikiri', pts: [[3, KITA.z - 19], [13, KITA.z - 19]], w: 6, deep: 2.6 },
    { kind: 'horikiri', pts: [[21, SHU.z + 3], [21, SHU.z + 13]], w: 5.5, deep: 2.2 },
    { kind: 'horikiri', pts: [[-15, SHU.z - 22], [-3, SHU.z - 22]], w: 6, deep: 2.4 },        // 主郭－北の尾根曲輪
    { kind: 'horikiri', pts: [[-13, KITA.z - 19], [-3, KITA.z - 19]], w: 6, deep: 2.6 },      // 北の尾根曲輪－北外郭
    { kind: 'horikiri', pts: [[21, SHU.z - 13], [21, SHU.z - 3]], w: 5.5, deep: 2.2 },       // 主郭－東の脇曲輪
    // 南の外郭の堀切：大手道の真ん中は土橋（幅 12m）に掘り残し、左右の尾根を断つ（山麓→森→外郭→堀切→主尾根→主郭）
    { kind: 'horikiri', pts: [[-34, -48], [-6, -48]], w: 4, deep: 1.6 },
    { kind: 'horikiri', pts: [[6, -48], [34, -48]], w: 4, deep: 1.6 },
    // 奥の尾根も空堀で分け、中央の六メートルは連絡・退去の土橋に残す。
    ...[-220, -330].flatMap(z => [
      { kind: 'horikiri', pts: [[-18, z], [-3, z]], w: 6, deep: 2.4 },
      { kind: 'horikiri', pts: [[3, z], [18, z]], w: 6, deep: 2.4 },
    ]),
  ],
  // 虎口（木戸の幅だけ開け、ほかは土塁＋柵で閉じる）。南の大手は b_iga.js の手組みの扉（kabukimon・tobira）
  koguchi: [
    { id: 'kido_shu', name: '南の木戸', at: [0, SHU.z + 18], gate: null, w: 5 },
    { id: 'kido_kita', name: '搦手の木戸', at: [0, KITA.z + 11], gate: null },
    { id: 'kido_kitasoto', name: '北外郭の口', at: [0, KITASOTO.z + 10], gate: null },
    { id: 'kido_higashi', name: '東の口', at: [HIGASHI.x - 10, HIGASHI.z], gate: null },
    { id: 'kido_oku', name: '奥の口', at: [0, OKU.z + 14], gate: null },
    { id: 'kido_kitaend', name: '北端の口', at: [0, KITAEND.z + 10], gate: null },
  ],
  // 犬走り：斜面沿いの細道（主郭の周りを巡り、北・東の曲輪へつながる）。守り手の移動・連絡用、攻め手からは見えにくい
  paths: [
    { id: 'inubashiri', kind: 'inuba', pts: [...circle(SHU.x, SHU.z, 13), [0, SHU.z + 13]] },
    { id: 'ridge', pts: [[0, SHU.z], [0, SHU.z - 18], [0, KITA.z + 11], [0, KITA.z - 11], [0, KITASOTO.z + 10], [0, KITASOTO.z - 10], [0, OKU.z + 14], [0, OKU.z - 14], [0, KITAEND.z + 10], [0, KITAEND.z - 10]] },
    { id: 'east', pts: [[0, SHU.z], [18, SHU.z], [HIGASHI.x - 10, HIGASHI.z], [HIGASHI.x, HIGASHI.z]] },
  ],
};
