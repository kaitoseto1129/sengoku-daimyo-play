// ======================================================================
// castles/miki.js … 三木城の曲輪と、三木城を囲む付城網。
// 天正六〜八年、三木合戦で羽柴方が三木城の周りに築いた多数の付城（兵糧攻め）。
// 付城は位置が分かる代表だけを置く。個々の寸法が不明な砦は今の形を保つ。
// ======================================================================
import { jinshiroFortPlan } from '../castle_plan.js';

// 三木城そのもの（別所長治の平山城。石垣・天守は置かない）の曲輪の並び（原点は b_miki.js の MIKI の位置を基準にした相対）。
// docs/layout-ref/castles.md：東西600m・南北700mを五分の一に縮める。
// 本丸を台地の北端に置き、南へ尾根を延ばす。個々の曲輪の寸法・門の方角は資料に無い。
// 建物の寸法と既存の南からの道は保ち、曲輪の細かな配置は遊び用の補完。
export const MIKI_JO = {
  honmaru: { name: '三木城・本丸', dx: 0, dz: 0, w: 16, d: 10 },
  ninomaru: { name: '三木城・二の丸', dx: -20, dz: 10, w: 10, d: 6 },
  shinjo: { name: '三木城・新城', dx: 18, dz: 40, w: 9, d: 6 },
  takao: { name: '鷹尾山城', dx: -24, dz: 74, w: 9, d: 6 },
  miyanoue: { name: '宮ノ上要害', dx: 18, dz: 104, w: 9, d: 6 },
  sotogamae: { name: '三木城・外郭', dx: 0, dz: 50, w: 120, d: 140 },
  jokamachi: { name: '三木の城下', dx: 0, dz: 58, n: 8, r: 20 },
};
export const MIKI_KURUWA = [MIKI_JO.honmaru, MIKI_JO.ninomaru, MIKI_JO.shinjo, MIKI_JO.takao, MIKI_JO.miyanoue];
// 南の口から曲輪の脇を通る尾根道。大手・搦手の史実の向きは未確認なので決めない。
export const MIKI_ROAD = [[0, 140], [0, 120], [-10, 100], [-10, 74], [0, 40], [10, 24], [14, 0]];
// 付城の網（戦場の絶対座標）。城内を横切らず、北西から北東へ遠巻きに並ぶ。
// 場所・寸法は縮尺の復元。川と荷駄道を横切る柵は戦の準備時に除く。
export const TSUKESHIRO_CHAIN = [[-100, 90], [-80, -64], [-160, -140], [20, -110], [172, 70]];

export const MIKI_TSUKEJIRO_PLAN = jinshiroFortPlan({ name: '三木の付城', r: 26, level: 0.3 });
