// ======================================================================
// castles/hijiyama.js … 比自山城（docs/final7-1579-1582-spec.md 30〜44章）
// 伊賀では珍しい大きな山城。元は観音寺の平場を転用した主郭（寺の跡）を頂に、
// 尾根の曲輪→堀切→曲輪→堀切→外郭を、北（搦手）と東（脇の尾根）の複数の方向へ延ばす（一本道でない）。
// 南（大手・丹羽の陣の方）だけは b_iga.js 側で手組みの木戸を置く。柵の口と扉の幅をそろえる。
// castle_plan.js の形（kuruwa・hori・koguchi）で書く。地形の下地・兵・戦い方は b_iga.js 側。
// ======================================================================
import { switchback } from '../yamalift.js';

function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

// 口を頂点でなく平らな辺の中央に置く。隣の辺の端が道の中心を塞がない。
function court(cx, cz, r, rz = r) { return [[cx - 3, cz + rz], [cx + 3, cz + rz], [cx + r, cz + 3], [cx + r, cz - 3], [cx + 3, cz - rz], [cx - 3, cz - rz], [cx - r, cz - 3], [cx - r, cz + 3]]; }
function rect(x0, z0, x1, z1) { return [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]; }

// 伊賀市史 ADEAC「比自山城跡 縄張図」（1/2,000）の図読み。
// docs/layout-ref/nawabari-measured.md「比自山」：城域 415×185、平場 70×100、南群 110×75m。
// 輪郭・並びを寄せる。空堀の幅・深さと標高は不明なので、既存の数と高さの基準点を保つ。
export const SHU = { x: 0, z: -90 };          // 主郭内の指揮所の基準。南の木戸と密集する兵は従来の位置。
export const KITA = { x: 0, z: -198 };
export const KITASOTO = { x: 0, z: -232 };
export const HIGASHI = { x: 52, z: -100 };
export const OKU = { x: 0, z: -310 };
export const KITAEND = { x: 0, z: -407 };      // 北端 -422、南群の端 -7：南北 415m。
export const SHU_SOUTH = [0, -72], SHU_NORTH = [0, -172], SHU_EAST = [35, -100];
const NAKAKITA = { x: 0, z: -270 }, OKUKITA = { x: 0, z: -350 };
export const APPROACH = [...switchback([0, 12], [0, -42], 6, 24), [0, -48], [0, -54], [4, -63], SHU_SOUTH];
// 南西の方形曲輪を横切る既存の山道は、交わる辺にだけ口を開ける（準備時に一度）。
function roadMouths(poly) {
  const mouths = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1];
    for (let j = 1; j < APPROACH.length; j++) {
      const c = APPROACH[j - 1], d = APPROACH[j], ex = d[0] - c[0], ez = d[1] - c[1];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 1e-8) continue;
      const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / cross;
      const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const x = a[0] + dx * t, z = a[1] + dz * t;
        const near = mouths.find(p => Math.hypot(p[0] - x, p[1] - z) < 5);
        if (near) { near[0] = (near[0] + x) / 2; near[1] = (near[1] + z) / 2; }
        else mouths.push([x, z]);
      }
    }
  }
  return mouths;
}
const SOUTHWEST = rect(-55, -30, -23, -7);
const NORTH_COURTS = [
  { id: 'kita', name: '北の尾根曲輪', at: KITA, r: 11, sample: -130, rise: 3 },
  { id: 'kitasoto', name: '北外郭', at: KITASOTO, r: 10, sample: -168, rise: 1 },
  { id: 'nakakita', name: '北の中段曲輪', at: NAKAKITA, r: 12, sample: -220, rise: 1 },
  { id: 'oku', name: '奥の尾根曲輪', at: OKU, r: 14, sample: -270, rise: 1 },
  { id: 'okukita', name: '北の奥段曲輪', at: OKUKITA, r: 12, sample: -330, rise: 1 },
  { id: 'kitaend', name: '北端の曲輪', at: KITAEND, r: 17, rz: 15, sample: -388, rise: 1 },
];
export const RIDGE = [SHU_SOUTH, [SHU.x, SHU.z], SHU_NORTH,
  ...NORTH_COURTS.flatMap(k => [[k.at.x, k.at.z + (k.rz ?? k.r)], [k.at.x, k.at.z - (k.rz ?? k.r)]]),
  [0, KITAEND.z - 37]];
export const RIDGE_LEVELS = ['shu', 'shu', 'shu', ...NORTH_COURTS.flatMap(k => [k.id, k.id]), null];
export const EAST = [[SHU.x, SHU.z], [0, HIGASHI.z], SHU_EAST, [42, HIGASHI.z], [HIGASHI.x, HIGASHI.z]];

export const HIJIYAMA_PLAN = {
  name: '比自山城', type: 'yama', year: 1581,
  kuruwa: [
    // 南の口は据え置き、北へ長い不定形の平場にする。物見・指揮所は引き続き内側。
    { id: 'shu', name: '主郭（観音寺跡）', poly: [[-3, -72], [3, -72], [28, -82], [35, -97], [35, -103], [30, -140], [14, -172], [3, -172], [-3, -172], [-28, -164], [-35, -136], [-32, -98], [-20, -78]], level: (bf) => bf(SHU.x, SHU.z) + 5, wall: 'saku', dorui: 2.4, gapAt: [SHU_SOUTH, SHU_EAST, SHU_NORTH] },
    ...NORTH_COURTS.map(k => ({ id: k.id, name: k.name, poly: court(k.at.x, k.at.z, k.r, k.rz), level: bf => bf(0, k.sample) + k.rise, wall: 'saku', gapAt: [[k.at.x, k.at.z + (k.rz ?? k.r)], [k.at.x, k.at.z - (k.rz ?? k.r)]] })),
    // 東の細長い脇曲輪。兵の集まる西側は狭いまま、城域の東端を 130m に伸ばす。
    { id: 'higashi', name: '東の脇曲輪', poly: [[42, -97], [42, -103], [75, -115], [130, -105], [118, -85], [65, -80]], level: (bf) => bf(34, -90) + 4, wall: 'saku', gapAt: [42, HIGASHI.z] },
    // 南群は東西 110m・南北 75m。中央の小曲輪を大手道と南の木戸が通る。
    { id: 'minami', name: '大手の小曲輪', poly: rect(-14, -72, 14, -54), level: bf => bf(0, -90) + 5, wall: 'saku', dorui: 2.4, gapAt: [[0, -54], SHU_SOUTH] },
    { id: 'minaminishi', name: '南西の上段曲輪', poly: rect(-55, -82, -32, -34), level: bf => bf(-43, -58) + 1, wall: 'saku', gapAt: [-32, -58] },
    { id: 'minamihigashi', name: '南東の小曲輪', poly: rect(32, -82, 55, -7), level: bf => bf(44, -46) + 1, wall: 'saku', gapAt: [[32, -48], [55, -46]] },
    { id: 'minamishikaku', name: '南西の方形曲輪', poly: SOUTHWEST, level: bf => bf(-39, -18.5) + 1, wall: 'saku', gapAt: roadMouths(SOUTHWEST) },
  ],
  // 連続の堀切：尾根を断つ。降りて登る間に、上の曲輪から攻め手を叩ける（北へ二重、東へ一つ＝複数の方向）
  hori: [
    // 幅六メートルの掘り残しで、北・東への連絡路と退き口を通す。位置は復元。
    { kind: 'horikiri', pts: [[3, -183], [15, -183]], w: 6, deep: 2.4 },
    { kind: 'horikiri', pts: [[3, -216], [13, -216]], w: 6, deep: 2.6 },
    { kind: 'horikiri', pts: [[38, HIGASHI.z + 3], [38, HIGASHI.z + 13]], w: 5.5, deep: 2.2 },
    { kind: 'horikiri', pts: [[-15, -183], [-3, -183]], w: 6, deep: 2.4 },        // 主郭－北の尾根曲輪
    { kind: 'horikiri', pts: [[-13, -216], [-3, -216]], w: 6, deep: 2.6 },      // 北の尾根曲輪－北外郭
    { kind: 'horikiri', pts: [[38, HIGASHI.z - 13], [38, HIGASHI.z - 3]], w: 5.5, deep: 2.2 },       // 主郭－東の脇曲輪
    // 南の外郭の堀切：大手道の真ん中は土橋（幅 12m）に掘り残し、左右の尾根を断つ（山麓→森→外郭→堀切→主尾根→主郭）
    { kind: 'horikiri', pts: [[-34, -48], [-6, -48]], w: 4, deep: 1.6 },
    { kind: 'horikiri', pts: [[6, -48], [34, -48]], w: 4, deep: 1.6 },
    // 奥の尾根も空堀で分け、中央の六メートルは連絡・退去の土橋に残す。
    ...[-290, -330].flatMap(z => [
      { kind: 'horikiri', pts: [[-18, z], [-3, z]], w: 6, deep: 2.4 },
      { kind: 'horikiri', pts: [[3, z], [18, z]], w: 6, deep: 2.4 },
    ]),
  ],
  // 虎口（木戸の幅だけ開け、ほかは土塁＋柵で閉じる）。南の大手は b_iga.js の手組みの扉（kabukimon・tobira）
  koguchi: [
    { id: 'kido_shu', name: '南の木戸', at: SHU_SOUTH, gate: null, w: 5 },
    ...NORTH_COURTS.map(k => ({ id: 'kido_' + k.id, name: k.name + 'の口', at: [k.at.x, k.at.z + (k.rz ?? k.r)], gate: null })),
    { id: 'kido_higashi', name: '東の口', at: [42, HIGASHI.z], gate: null },
    { id: 'kido_minami', name: '大手の小曲輪の口', at: [0, -54], gate: null, w: 5 },
  ],
  // 道の座標を b_iga.js と共用し、兵と地面が同じ曲輪の口を通る。
  paths: [
    { id: 'inubashiri', kind: 'inuba', pts: [...circle(SHU.x, SHU.z, 13), [0, SHU.z + 13]] },
    { id: 'ote', pts: APPROACH },
    { id: 'ridge', pts: RIDGE.slice(1) },
    { id: 'east', pts: EAST },
  ],
};
