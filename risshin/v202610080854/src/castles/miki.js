// ======================================================================
// castles/miki.js … 三木城の曲輪と、三木城を囲む付城網。
// 天正六〜八年、三木合戦で羽柴方が三木城の周りに築いた多数の付城（兵糧攻め）。
// 付城は位置が分かる代表だけを置く。個々の寸法が不明な砦は、天正期の播磨の土の砦として推定する。
// ======================================================================
import { jinshiroFortPlan } from '../castle_plan.js';

// 三木城そのもの（別所長治の平山城。石垣・天守は置かない）の曲輪の並び（原点は b_miki.js の MIKI の位置を基準にした相対）。
// 城域は東西約６００ｍ・南北約７００ｍ。城外の戦の座標は保ち、台地を南東へ実寸で延ばす。
// 本丸・二の丸は北西端、新城は東、鷹尾山城は二の丸の南東、宮ノ上は南の尾根。
// 個々の輪郭・寸法・比高・門・建物の位置は未確定。平場は旧復元の五倍を目安にした推定。
// 出所：https://www.shirofan.com/shiro/kinki/miki/miki.html
export const MIKI_JO = {
  honmaru: { name: '三木城・本丸', dx: 100, dz: 80, w: 16, d: 10, cw: 190, cd: 140, level: 22 },
  ninomaru: { name: '三木城・二の丸', dx: -20, dz: 220, w: 10, d: 6, cw: 130, cd: 100, level: 19 },
  shinjo: { name: '三木城・新城', dx: 320, dz: 150, w: 9, d: 6, cw: 150, cd: 120, level: 20 },
  takao: { name: '鷹尾山城', dx: 180, dz: 390, w: 9, d: 6, cw: 180, cd: 120, level: 18 },
  miyanoue: { name: '宮ノ上要害', dx: 180, dz: 570, w: 9, d: 6, cw: 150, cd: 120, level: 16 },
  sotogamae: { name: '三木城の台地', dx: 220, dz: 330, w: 600, d: 700 },
  jokamachi: { name: '三木の城下', dx: -160, dz: 240, n: 8, r: 24 },
};
export const MIKI_KURUWA = [MIKI_JO.honmaru, MIKI_JO.ninomaru, MIKI_JO.shinjo, MIKI_JO.takao, MIKI_JO.miyanoue];
// 北の荷駄道を接続し、主殿を横切らず南の尾根へ。大手・搦手の向きは断定しない。
export const MIKI_ROAD = [[0, -20], [0, 20], [70, 35], [205, 60], [205, 180], [205, 240],
  [80, 270], [80, 400], [80, 480], [80, 560], [80, 650], [180, 680]];
// 付城の網（戦場の絶対座標）。城内を横切らず、北西から北東へ遠巻きに並ぶ。
// 場所・寸法は縮尺の復元。川と荷駄道を横切る柵は戦の準備時に除く。
export const TSUKESHIRO_CHAIN = [[-100, 90], [-80, -64], [-160, -140], [20, -110], [640, 150]];

export const MIKI_TSUKEJIRO_PLAN = jinshiroFortPlan({ name: '三木の付城', r: 26, level: 0.3 });

// 曲輪の寸法・標高・虎口は縄張り図未確認のため推定。建物と平場の寸法を分ける。
// 通り道から南の木戸を経て戸口へ。門の内側で曲がる素朴な虎口とする。
const MIKI_APPROACHES = [MIKI_ROAD[4], MIKI_ROAD[6], MIKI_ROAD[5], MIKI_ROAD[8], MIKI_ROAD[10]];
export const MIKI_BRANCHES = MIKI_KURUWA.map((q, i) => [MIKI_APPROACHES[i],
  [q.dx + 7, q.dz + q.cd / 2 + 14], [q.dx + 7, q.dz + q.cd / 2],
  [q.dx + 7, q.dz + q.d / 2 + 3], [q.dx, q.dz + q.d / 2 + 3], [q.dx, q.dz + q.d / 2 + 1]]);
// 本丸の区画堀・本丸と二の丸の堀切・鷹尾山城北の東西堀。
// 本丸の堀の存在は市の発掘資料。断面・位置・年代は推定。伝天守台は堀を埋めた後なので足さない。
// https://www.city.miki.lg.jp/site/mikirekishishiryokan/13225.html
export const MIKI_HORI = [[[15, 120], [82, 120]], [[-65, 112], [0, 150], [40, 165]],
  [[75, 300], [300, 300]], [[250, 220], [395, 220]]];
// 平田以外の代表付城へは南から入り、台地に番所・蔵・井楼を置く。
export const MIKI_FORTS = TSUKESHIRO_CHAIN.filter(([x, z]) => x !== -80 || z !== -64)
  .map(([x, z]) => ({ x, z, r: 13 }));
