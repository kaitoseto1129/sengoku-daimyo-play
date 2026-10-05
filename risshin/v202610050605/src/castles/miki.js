// ======================================================================
// castles/miki.js … 三木城の曲輪と、三木城を囲む付城網。
// 天正六〜八年、三木合戦で羽柴方が三木城の周りに築いた多数の付城（兵糧攻め）。
// 付城は位置が分かる代表だけを置く。個々の寸法が不明な砦は、天正期の播磨の土の砦として推定する。
// ======================================================================
import { jinshiroFortPlan } from '../castle_plan.js';

// 三木城そのもの（別所長治の平山城。石垣・天守は置かない）の曲輪の並び（原点は b_miki.js の MIKI の位置を基準にした相対）。
// docs/layout-ref/castles.md：東西600m・南北700mを五分の一に縮める。
// 本丸を台地の北端に置き、南へ尾根を延ばす。個々の曲輪の寸法・門の方角は資料に無い。
// 建物の寸法と既存の南からの道は保ち、曲輪の細かな配置は遊び用の補完。
export const MIKI_JO = {
  honmaru: { name: '三木城・本丸', dx: 0, dz: 0, w: 16, d: 10, cw: 38, cd: 28, level: 22 },
  ninomaru: { name: '三木城・二の丸', dx: -35, dz: 10, w: 10, d: 6, cw: 26, cd: 20, level: 19 },
  shinjo: { name: '三木城・新城', dx: 18, dz: 40, w: 9, d: 6, cw: 30, cd: 24, level: 16 },
  takao: { name: '鷹尾山城', dx: -24, dz: 74, w: 9, d: 6, cw: 28, cd: 24, level: 13 },
  miyanoue: { name: '宮ノ上要害', dx: 18, dz: 104, w: 9, d: 6, cw: 30, cd: 24, level: 10 },
  sotogamae: { name: '三木城・外郭', dx: 0, dz: 50, w: 120, d: 140 },
  jokamachi: { name: '三木の城下', dx: -94, dz: 72, n: 8, r: 24 },
};
export const MIKI_KURUWA = [MIKI_JO.honmaru, MIKI_JO.ninomaru, MIKI_JO.shinjo, MIKI_JO.takao, MIKI_JO.miyanoue];
// 南の口から曲輪の脇を通る尾根道。大手・搦手の史実の向きは未確認なので決めない。
export const MIKI_ROAD = [[0, 140], [0, 120], [-10, 100], [-10, 74], [0, 40], [10, 24], [14, 0]];
// 付城の網（戦場の絶対座標）。城内を横切らず、北西から北東へ遠巻きに並ぶ。
// 場所・寸法は縮尺の復元。川と荷駄道を横切る柵は戦の準備時に除く。
export const TSUKESHIRO_CHAIN = [[-100, 90], [-80, -64], [-160, -140], [20, -110], [172, 70]];

export const MIKI_TSUKEJIRO_PLAN = jinshiroFortPlan({ name: '三木の付城', r: 26, level: 0.3 });

// 曲輪の寸法・標高・虎口は縄張り図未確認のため推定。建物と平場の寸法を分ける。
// 通り道から南の木戸を経て戸口へ。門の内側で曲がる素朴な虎口とする。
export const MIKI_BRANCHES = MIKI_KURUWA.map(q => {
  let near = MIKI_ROAD[0], best = Infinity;
  for (const p of MIKI_ROAD) {
    const d = Math.hypot(p[0] - q.dx, p[1] - q.dz - q.cd / 2);
    if (d < best) { best = d; near = p; }
  }
  if (q === MIKI_JO.honmaru) near = MIKI_ROAD[4];
  return [near, [q.dx + 7, q.dz + q.cd / 2 + 7], [q.dx + 7, q.dz + q.cd / 2],
    [q.dx + 7, q.dz + q.d / 2 + 3], [q.dx, q.dz + q.d / 2 + 3], [q.dx, q.dz + q.d / 2 + 1]];
});
// 本丸内部の区画堀（存在は発掘で確認。向き・断面・年代は推定）。東の道は土橋。
export const MIKI_HORI = [[[-18, 18], [-4, 18]], [[22, 62], [40, 62]], [[40, 62], [52, 76]]];
// 平田以外の代表付城へは南から入り、台地に番所・蔵・井楼を置く。
export const MIKI_FORTS = TSUKESHIRO_CHAIN.filter(([x, z]) => x !== -80 || z !== -64)
  .map(([x, z]) => ({ x, z, r: 13 }));
