// ======================================================================
// castles/hijiyama.js … 比自山城（docs/final7-1579-1582-spec.md 30〜44章）
// 伊賀では珍しい大きな山城。元は観音寺の平場を転用した主郭（寺の跡）を頂に、
// 尾根の曲輪→堀切→曲輪→堀切→外郭を、北（搦手・柏原方面）と東（脇の尾根）の複数の方向へ延ばす（一本道でない）。
// 南（大手・丹羽の陣の方）だけは b_iga.js 側で手組みの木戸（破れる扉）のままにする（skipWalls）。
// castle_plan.js の形（kuruwa・hori・koguchi）で書く。地形の下地・兵・戦い方は b_iga.js 側。
// ======================================================================
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 曲輪の中心
export const SHU = { x: 0, z: -90 };          // 主郭（観音寺跡。全曲輪で最高所＝指揮所・見張り）
export const KITA = { x: 0, z: -130 };        // 北の尾根曲輪（搦手。柏原方面への退路）
export const KITASOTO = { x: 0, z: -168 };    // 北外郭（さらに奥。殿の最後の口）
export const HIGASHI = { x: 34, z: -90 };     // 東の脇曲輪（林側の尾根。山から下りる伊賀衆の出口）

export const HIJIYAMA_PLAN = {
  name: '比自山城', type: 'yama', year: 1581,
  // 大将の居場所（kaito 10/2）：主郭の観音寺の堂（城主の建物へ転用）の奥に百地丹波（戸口は南の木戸の側）
  lordSeat: { kind: 'goten', at: [SHU.x - 3, SHU.z - 7], w: 8, d: 6, rot: 0, door: 1, name: '堂', where: '主郭の堂の奥' },
  kuruwa: [
    // 主郭（観音寺の平場を転用）：南だけ木戸の分を開け、他は土塁＋柵で四周を囲む（南は b_iga.js が手組みで作る＝skipWalls）
    { id: 'shu', name: '主郭（観音寺跡）', poly: circle(SHU.x, SHU.z, 18), level: (bf) => bf(SHU.x, SHU.z) + 5, wall: 'saku', gapAt: [[0, SHU.z + 18], [21, SHU.z], [0, KITA.z + 13]] },
    { id: 'kita', name: '北の尾根曲輪', poly: circle(KITA.x, KITA.z, 11), level: (bf) => bf(KITA.x, KITA.z) + 3, wall: 'saku', gapAt: [[0, KITA.z + 11], [0, KITA.z - 11]] },
    { id: 'kitasoto', name: '北外郭', poly: circle(KITASOTO.x, KITASOTO.z, 10), level: (bf) => bf(KITASOTO.x, KITASOTO.z) + 1, wall: 'saku', gapAt: [0, KITASOTO.z + 10] },
    { id: 'higashi', name: '東の脇曲輪', poly: circle(HIGASHI.x, HIGASHI.z, 10), level: (bf) => bf(HIGASHI.x, HIGASHI.z) + 4, wall: 'saku', gapAt: [HIGASHI.x - 10, HIGASHI.z] },
  ],
  // 連続の堀切：尾根を断つ。降りて登る間に、上の曲輪から攻め手を叩ける（北へ二重、東へ一つ＝複数の方向）
  hori: [
    { kind: 'horikiri', pts: [[-15, SHU.z - 22], [15, SHU.z - 22]], w: 6, deep: 2.4 },        // 主郭－北の尾根曲輪
    { kind: 'horikiri', pts: [[-13, KITA.z - 19], [13, KITA.z - 19]], w: 6, deep: 2.6 },      // 北の尾根曲輪－北外郭
    { kind: 'horikiri', pts: [[21, SHU.z - 13], [21, SHU.z + 13]], w: 5.5, deep: 2.2 },       // 主郭－東の脇曲輪
    // 南の外郭の堀切：大手道の真ん中は土橋（幅 12m）に掘り残し、左右の尾根を断つ（山麓→森→外郭→堀切→主尾根→主郭）
    { kind: 'horikiri', pts: [[-34, -48], [-6, -48]], w: 4, deep: 1.6 },
    { kind: 'horikiri', pts: [[6, -48], [34, -48]], w: 4, deep: 1.6 },
  ],
  // 虎口（木戸の幅だけ開け、ほかは土塁＋柵で閉じる）。南の大手は b_iga.js の手組みの扉（kabukimon・tobira）
  koguchi: [
    { id: 'kido_kita', name: '搦手の木戸', at: [0, KITA.z + 11], gate: null },
    { id: 'kido_kitasoto', name: '北外郭の口', at: [0, KITASOTO.z + 10], gate: null },
    { id: 'kido_higashi', name: '東の口', at: [HIGASHI.x - 10, HIGASHI.z], gate: null },
  ],
  // 犬走り：斜面沿いの細道（主郭の周りを巡り、北・東の曲輪へつながる）。守り手の移動・連絡用、攻め手からは見えにくい
  paths: [{ id: 'inubashiri', kind: 'inuba', pts: [...circle(SHU.x, SHU.z, 13), [0, KITA.z + 11], [0, KITA.z - 11], [HIGASHI.x - 10, HIGASHI.z]] }],
};
