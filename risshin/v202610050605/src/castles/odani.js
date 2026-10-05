import { demSample } from '../dem.js';
import DEM from '../asset_dem_odani.js';
// ======================================================================
// castles/odani.js … 小谷城の縄張り（docs/late6-1573-1575-spec.md 14〜37章）
// castle_plan.js の形（kuruwa・koguchi・paths・hori・yagura）で書く。地形・兵・戦い方は b_odani.js。
// 向き：主尾根は南北。南（+z）の山麓・番所から、北（-z）の山王丸へ一段ずつ高くなる（梯郭）。
//   番所→御茶屋→御馬屋（馬洗池）→桜馬場→黒金御門→大広間→本丸→（大堀切）→中丸→京極丸→小丸→山王丸
//   本丸は城の一番高い所ではない（中丸・京極丸・小丸・山王丸の方が高い）。
// 清水谷は主尾根の西（-x）の谷。谷底の道の両側に浅井の居館・家臣の屋敷・寺。谷の奥から京極丸の西の口へ登る
//   （羽柴秀吉の攻めを表す道。清水谷を通ったか、細かな道筋には諸説ある）。
// 札：HIST_A（遺構から根拠が強い）／HIST_B（推定復元）／GAME_C（ゲームの補い）
//   曲輪の並びと名・大堀切・本丸が最高所でない事・清水谷の居館＝HIST_A。
//   本丸・大堀切・馬洗池の寸法＝HIST_A。ほかの曲輪の広さ・高さの差・門の形＝HIST_B。周りの砦の場所・寺の名を出さない事＝GAME_C。
// ======================================================================

// 角を落とした長方形（尾根に沿って細長い曲輪）
function rr(x, z0, z1, hw, c = 3) {
  return [[x - hw + c, z1], [x + hw - c, z1], [x + hw, z1 - c], [x + hw, z0 + c], [x + hw - c, z0], [x - hw + c, z0], [x - hw, z0 + c], [x - hw, z1 - c]];
}
// ---- 地形：国土地理院の標高（asset_dem_odani.js・比高 286m）を、尾根が南北（x=0）になるよう回して使う ----
//   実の尾根は北北東〜南南西へ約 29 度傾く。ゲームは尾根を南北に置くので、回してから引く。
//   横（x）は DEM_K 倍に広げて引く＝実の谷（清水谷）はこの縄張りより遠く（約 300m）にあるので、ゲームの数十 m に寄せる（GAME_C）
//   高さは実測のまま（縦は縮めない。麓の谷口から山王丸まで約 140m の登り）
const DEM_A = 0.51, DEM_OX = 20, DEM_OZ = 0, DEM_K = 1.3, DEM_BASE = 40;
const _ca = Math.cos(DEM_A), _sa = Math.sin(DEM_A);
export function demH(X, Z) {
  const kx = X * DEM_K;
  const measured = Math.max(0, demSample(DEM, DEM_OX + kx * _ca - Z * _sa, DEM_OZ + kx * _sa + Z * _ca) - DEM_BASE);
  // 復元映像の二股の山を、遊びの距離へ寄せる。大嶽から西尾根と東の城の尾根が南へ下る。
  const south = Math.max(0, Math.min(1, (Z + 190) / 370));
  const westX = -128 - south * 40;
  const west = 218 * (1 - south) - Math.abs(X - westX) * 1.45;
  const peak = 258 - Math.hypot((X + 128) * 1.1, (Z + 190) * 1.5);
  const fork = Math.max(0, Math.min(1, (Z + 190) / 80));
  const east = Z >= -190 && Z <= -110 ? 218 - fork * 64 - Math.abs(X - (-128 + fork * 128)) * 1.15 : 0;
  return Math.max(measured, west, east, peak, 0);
}
// 尾根の背の高さ（曲輪の間の道もこれに沿う）：背の幅（x -6〜6）と前後（z ±10）をならした値
const _crestCache = new Map();
export function crestAt(z) {
  const k = Math.round(z);
  let v = _crestCache.get(k);
  if (v === undefined) {
    let s = 0, n = 0;
    for (let dz = -10; dz <= 10; dz += 5) for (let dx = -6; dx <= 6; dx += 6) { s += demH(dx, k + dz); n++; }
    v = s / n; _crestCache.set(k, v);
  }
  return v;
}
// 曲輪の高さ：背の高さに沿い、北（奥）の曲輪ほど高く。隣と最低 3m の切岸を付ける
let _prevLv = -1e9;
const K = (id, name, z0, z1, hw, _lv, o = {}) => {
  const cz = (z0 + z1) / 2, level = Math.max(crestAt(cz), _prevLv + (o.step ?? 3));
  _prevLv = level;
  return { id, name, z0, z1, hw, level, x: o.x ?? 0, cz, ...o };
};

// 本丸は南北40m・東西25m。広げた分は前後の曲輪を離し、大堀切の幅15mを確保する。
// 曲輪（z0 が北の縁、z1 が南の縁）。level は DEM の背に沿って K が決める（第6引数は使わない）
export const BANSHO = K('bansho', '番所', 150, 166, 8, 0);
export const OCHAYA = K('ochaya', '御茶屋', 126, 144, 10, 0);
export const ONMAYA = K('onmaya', '御馬屋', 98, 120, 12, 0);
export const SAKURABABA = K('sakurababa', '桜馬場', 72, 94, 10, 0);
export const OOHIROMA = K('oohiroma', '大広間', 34, 64, 16, 0);
export const HON = K('hon', '本丸', -12, 28, 12.5, 0);
export const NAKAMARU = K('nakamaru', '中丸', -49, -32, 10, 0);
export const KYOGOKU = K('kyogoku', '京極丸', -83, -54, 18, 0);
// 映像をもとにした上段の推定復元。京極丸の南の広場と北の広場を分ける。
export const KYOGOKU2 = K('kyogoku2', '京極丸の上の段', -83, -73, 14, 0);
export const KOMARU = K('koma', '小丸', -109, -92, 9, 0);
export const SANNOMARU = K('sannomaru', '山王丸', -153, -119, 8.5, 0);
export const SANNO2 = K('sanno2', '山王丸の上の段', -149, -133, 6.8, 0, { step: 5 });
export const OKURIDGE = [K('oku1', '奥の尾根の曲輪', -171, -158, 6, 0), K('oku2', '尾根先の曲輪', -188, -177, 4.8, 0)];
export const UPPER = [NAKAMARU, KYOGOKU, KYOGOKU2, KOMARU, SANNOMARU, SANNO2, ...OKURIDGE];
export const RIDGE = [BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU, KOMARU, SANNOMARU];

// 馬洗池（御馬屋の目印の水場。HIST_A）
export const UMAARAI = { x: ONMAYA.x - 6, z: ONMAYA.cz + 4, w: 6.6, d: 9 };
// 大堀切（本丸の北。尾根をここで前後に断つ。真ん中に細い土橋だけ残す。HIST_A・土橋は GAME_C）
export const OHORIKIRI = { z: -22, w: 15, deep: 10, len: 40 };

// 門（虎口）
const mid = (a, b) => (a.z0 + b.z1) / 2;
export const GATE_BANSHO = { x: 0, z: BANSHO.z1 + 1, name: '番所の木戸' };
export const GATE_KURO = { x: 0, z: mid(SAKURABABA, OOHIROMA), name: '黒金御門' };
export const GATE_HON_S = { x: 0, z: HON.z1 - 3, name: '本丸の門' }; // 石段を上り切った所の櫓門
export const GATE_HON_N = { x: 0, z: HON.z0, name: '本丸の北の口' };
export const GATE_NAKA_S = { x: 0, z: NAKAMARU.z1, name: '中丸の口' };
export const GATE_NAKA_KYO = { x: 0, z: mid(KYOGOKU, NAKAMARU), name: '中丸と京極丸の門' };
export const GATE_KYO_KOMA = { x: 0, z: mid(KOMARU, KYOGOKU), name: '京極丸と小丸の門' };
export const GATE_KOMA_SANNO = { x: 0, z: mid(SANNOMARU, KOMARU), name: '小丸と山王丸の門' };
// 京極丸の西の口：清水谷から攀じ登る道の出口（羽柴の攻め口）
export const GATE_WEST = { x: KYOGOKU.x - KYOGOKU.hw, z: KYOGOKU.cz + 2, name: '京極丸の西の口' };

// 清水谷：谷の口（南西の山麓）から谷の奥（京極丸の西の下）へ。谷底の高さは口 1・奥 17
export const SHIMIZU = [[-112, 160], [-100, 110], [-88, 62], [-74, 18], [-60, -22], [-46, -50]];
// 谷底の高さ：谷口から奥へ上る。DEM を引き、奥は京極丸より 16m 下で止める（登り道の九十九折りで上る）
export const SHIMIZU_FLOOR = (() => {
  const f = SHIMIZU.map(([x, z]) => demH(x, z)), n = f.length;
  f[n - 1] = Math.max(f[n - 1], KYOGOKU.level - 16);
  // 奥から谷口へ、勾配 0.4 より急にならないよう底を持ち上げ（谷が急に立ち上がらない）、谷口へ向けて必ず下る
  for (let i = n - 2; i >= 0; i--) {
    const d = Math.hypot(SHIMIZU[i + 1][0] - SHIMIZU[i][0], SHIMIZU[i + 1][1] - SHIMIZU[i][1]);
    f[i] = Math.max(f[i], f[i + 1] - d * 0.4);
    f[i] = Math.min(f[i], f[i + 1] - 4);
  }
  return f;
})();
// 虎ヶ谷の斜面の細い土道を、谷の奥から京極丸の西の口へ折れながら登る（細かな道筋は復元）
// 西の口の外は食い違い虎口：二枚の高い土塁（KUICHIGAI）が食い違い、道は北へ折れ、南へ折れ返し、また東へ折れて門に着く
export const KUICHIGAI = [[-27.5, -69, -27.5, -57], [-22.5, -75, -22.5, -63]];   // [ax, az, bx, bz]
export const CLIMB_UP = [[-46, -50], [-68, -108], [-39, -61], [-29.5, -71], [-25, -71], [-25, -61], [-20, -61], [GATE_WEST.x - 2, GATE_WEST.z], [GATE_WEST.x + 4, GATE_WEST.z]];
// 西の腰曲輪の攻め道（遊びの補い）。京極丸の北の口から西の細い土橋を渡り、小丸の脇口へ。
export const KOMA_WEST = [[0, KYOGOKU.cz], [0, KYOGOKU.z0 + 4], [-15, KYOGOKU.z0 + 4], [-16.5, KYOGOKU.z0 + 1.5], [-15, KYOGOKU.z0 - 2], [-15, KOMARU.cz], [-4, KOMARU.cz]];
// 隠し銃座の置き場（x, z, 撃つ向き, 数）：虎口の南北の口に向けて十字に撃つ。大堀切の土橋の前にも一つ
// 横矢の座（虎口の曲がりで側面から撃つ）：x, z, 撃つ向き, 兵の種類
export const YOKOYA = [{ id: 'yA', x: -19.8, z: -70.5, rot: -Math.PI / 2, k: 'gun', n: 2 }, { id: 'yB', x: -31.2, z: -59, rot: Math.PI / 2, k: 'bow', n: 2 }];
export const NESTS = [{ id: 'nA', x: -25, z: -52.5, rot: Math.PI, n: 3 }, { id: 'nB', x: -25, z: -78.5, rot: 0, n: 3 }, { id: 'nC', x: 7.5, z: NAKAMARU.z1 - 1.5, rot: 0, n: 2 }];
// 大野木屋敷（京極丸の直下、清水谷側の斜面。浅井の重臣・大野木氏）と赤尾屋敷（本丸の東の下。長政の最期の所）
export const ONOGI = { x: -31, z: KYOGOKU.z0 - 11, hw: 9, hd: 6, name: '大野木屋敷' };
export const AKAO = { x: 33, z: 4, hw: 9, hd: 8, name: '赤尾屋敷' };
// 谷の中の物（HIST_B：居館・屋敷・寺の並び。名は出さない寺がある＝GAME_C）
export const KYOKAN = { x: -56, z: 38, name: '浅井の居館' };       // 清水谷の浅井氏の館（谷の道の東。門は道へ向く）
export const TERA = { x: -120, z: 112, name: '谷の寺' };
export const YASHIKI = [[-84, 112, 0.2], [-82, 96, -0.1], [-110, 70, 0.4], [-68, 70, -0.3], [-98, 40, 0.1], [-52, 6, -0.4], [-84, -4, 0.3], [-74, -34, 0.2]];

// 尾根の道（南の番所から北の山王丸まで。門を通る）
// 麓から尾根先の番所までの九十九折り。曲輪の正面の門に着く。
export const OTE_CLIMB = [[-28, 220], [20, 205], [-24, 190], [18, 177], [0, 170], [0, BANSHO.z1]];
export const ROAD_RIDGE = [
  [0, 176], [0, BANSHO.cz], [0, OCHAYA.cz], [0, ONMAYA.cz], [0, SAKURABABA.cz], [GATE_KURO.x, GATE_KURO.z], [0, OOHIROMA.cz],
  [0, HON.z1], [0, HON.cz], [0, HON.z0], [0, OHORIKIRI.z], [0, NAKAMARU.cz], [0, KYOGOKU.cz], [0, KOMARU.cz], [0, SANNOMARU.cz], [0, SANNO2.cz], ...OKURIDGE.map((k) => [k.x, k.cz]),
];

const gap = (k, side) => [k.x, side === 'n' ? k.z0 : k.z1];
// 主郭の石垣は推定復元。上段は専用の石垣と土塀に合わせ、土塁を重ねない。
export const STONE_KURUWA = [OOHIROMA, HON, NAKAMARU, KYOGOKU, SANNOMARU];
const kur = (k, o) => ({ id: k.id, name: k.name, level: k.level, wall: UPPER.includes(k) || k === HON || k === OOHIROMA ? 'dobei' : 'palisade', sakamogi: [], wallOpt: { ita: true, tera: true, earth: 0xa38a61 }, dorui: UPPER.includes(k) ? 0 : k === ONMAYA ? 1.3 : 0.65, poly: rr(k.x, k.z0, k.z1, k.hw), ...o });

export const ODANI_PLAN = {
  mon: 'azai',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '小谷城', type: 'yama', year: 1573, stone: 'nozura',
  kuruwa: [
    kur(BANSHO, { hp: 1e9, kind: 'koshi', capacity: 16, fallbackTo: 'ochaya', defenseValue: 0.1, gapAt: [gap(BANSHO, 's'), gap(BANSHO, 'n')] }),
    kur(OCHAYA, { hp: 1e9, kind: 'koshi', capacity: 30, fallbackTo: 'onmaya', defenseValue: 0.12, gapAt: [gap(OCHAYA, 's'), gap(OCHAYA, 'n')] }),
    kur(ONMAYA, { hp: 1e9, kind: 'koshi', capacity: 40, fallbackTo: 'sakurababa', defenseValue: 0.15, gapAt: [gap(ONMAYA, 's'), gap(ONMAYA, 'n')] }),
    kur(SAKURABABA, { hp: 1e9, kind: 'koshi', capacity: 40, fallbackTo: 'oohiroma', defenseValue: 0.2, gapAt: [gap(SAKURABABA, 's'), gap(SAKURABABA, 'n')] }),
    kur(OOHIROMA, { hp: 1e9, kind: 'ni', capacity: 100, fallbackTo: 'hon', defenseValue: 0.35, gapAt: [gap(OOHIROMA, 's'), gap(OOHIROMA, 'n')] }),
    kur(HON, { hp: 1e9, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 0.9, gapAt: [gap(HON, 's'), gap(HON, 'n')] }),
    kur(NAKAMARU, { hp: 1e9, kind: 'ni', capacity: 50, fallbackTo: 'kyogoku', defenseValue: 0.5, gapAt: [gap(NAKAMARU, 's'), gap(NAKAMARU, 'n')] }),
    kur(KYOGOKU, { hp: 1e9, kind: 'ni', capacity: 90, fallbackTo: null, defenseValue: 0.7, gapAt: [gap(KYOGOKU, 's'), gap(KYOGOKU, 'n'), [-16.5, KYOGOKU.z0 + 1.5], [GATE_WEST.x, GATE_WEST.z]] }),
    kur(KYOGOKU2, { hp: 1e9, kind: 'ni', capacity: 30, gapAt: [gap(KYOGOKU2, 's'), gap(KYOGOKU2, 'n')] }),
    kur(KOMARU, { hp: 1e9, kind: 'hon', capacity: 60, fallbackTo: 'sannomaru', defenseValue: 0.7, gapAt: [gap(KOMARU, 's'), gap(KOMARU, 'n'), [-KOMARU.hw, KOMARU.cz]] }),
    kur(SANNOMARU, { hp: 1e9, kind: 'san', capacity: 80, fallbackTo: null, defenseValue: 0.8, gapAt: [gap(SANNOMARU, 's')] }),
    // 上に行くほど平場を狭める。奥の段も推定復元。
    kur(SANNO2, { kind: 'san', capacity: 30, gapAt: [gap(SANNO2, 's'), gap(SANNO2, 'n')] }),
    ...OKURIDGE.map((k) => kur(k, { kind: 'koshi', capacity: 8, gapAt: [gap(k, 's'), gap(k, 'n')] })),
  ],
  koguchi: [
    { id: 'g_bansho', name: GATE_BANSHO.name, from: 'out', to: 'bansho', kind: 'hira', gate: 'kabuki', at: [0, BANSHO.z1], rot: 0, w: 4.4, role: 'ote', maxFlow: 4 },
    { id: 'g_ochaya', name: '御茶屋の木戸', from: 'bansho', to: 'ochaya', kind: 'hira', at: [0, mid(BANSHO, OCHAYA)], rot: 0, w: 4.6 },
    { id: 'g_onmaya', name: '御馬屋の木戸', from: 'ochaya', to: 'onmaya', kind: 'hira', at: [0, mid(OCHAYA, ONMAYA)], rot: 0, w: 4.6 },
    { id: 'g_sakura', name: '桜馬場の木戸', from: 'onmaya', to: 'sakurababa', kind: 'hira', at: [0, mid(ONMAYA, SAKURABABA)], rot: 0, w: 4.6 },
    { id: 'g_kuro', name: GATE_KURO.name, from: 'sakurababa', to: 'oohiroma', kind: 'hira', gate: 'yagura', at: [GATE_KURO.x, GATE_KURO.z], rot: 0, w: 4.4, role: 'ote', maxFlow: 5, fireResistance: 0.5 },
    { id: 'g_hon', name: GATE_HON_S.name, from: 'oohiroma', to: 'hon', kind: 'hira', gate: 'yagura', at: [GATE_HON_S.x, GATE_HON_S.z], rot: 0, w: 6.4, role: 'ote', maxFlow: 5 },
    { id: 'g_hon_n', name: GATE_HON_N.name, from: 'hon', to: 'nakamaru', kind: 'hira', at: [GATE_HON_N.x, GATE_HON_N.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_naka_s', name: GATE_NAKA_S.name, from: 'hon', to: 'nakamaru', kind: 'hira', gate: 'yagura', at: [GATE_NAKA_S.x, GATE_NAKA_S.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_naka_kyo', name: GATE_NAKA_KYO.name, from: 'nakamaru', to: 'kyogoku', kind: 'hira', gate: 'yagura', at: [GATE_NAKA_KYO.x, GATE_NAKA_KYO.z], rot: 0, w: 5, maxFlow: 5 },
    { id: 'g_kyo_koma', name: GATE_KYO_KOMA.name, from: 'kyogoku', to: 'koma', kind: 'hira', gate: 'kabuki', at: [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], rot: 0, w: 5, maxFlow: 5 },
    { id: 'g_koma_sanno', name: GATE_KOMA_SANNO.name, from: 'koma', to: 'sannomaru', kind: 'hira', gate: 'yagura', at: [GATE_KOMA_SANNO.x, GATE_KOMA_SANNO.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_west', name: GATE_WEST.name, from: 'out', to: 'kyogoku', kind: 'hira', gate: 'yagura', at: [GATE_WEST.x, GATE_WEST.z], rot: Math.PI / 2, w: 5.2, role: 'karamete', maxFlow: 5 },
  ],
  paths: [
    { id: 'ridge', kind: 'ote', pts: [...OTE_CLIMB, ...ROAD_RIDGE.slice(1)] },
    { id: 'shimizu', kind: 'karamete', pts: [...SHIMIZU, ...CLIMB_UP.slice(1), [KYOGOKU.x, KYOGOKU.cz]] },
    { id: 'koma_west', kind: 'karamete', pts: KOMA_WEST },
  ],
  // 大堀切：尾根を東西に断つ。真ん中（x -2.4〜2.4）だけ土橋を残す
  hori: [
    { kind: 'horikiri', pts: [[-OHORIKIRI.len / 2, OHORIKIRI.z], [-2.6, OHORIKIRI.z]], w: OHORIKIRI.w, deep: OHORIKIRI.deep },
    { kind: 'horikiri', pts: [[2.6, OHORIKIRI.z], [OHORIKIRI.len / 2, OHORIKIRI.z]], w: OHORIKIRI.w, deep: OHORIKIRI.deep },
    // 堀切の端から斜面へ落とす竪堀。位置と断面は推定復元（HIST_B）。
    // 西の登り道・屋敷・小丸の脇道と交差しない東斜面へ延ばす。
    { kind: 'tatebori', pts: [[21, OHORIKIRI.z], [36, OHORIKIRI.z + 4], [55, OHORIKIRI.z + 12]], w: 5, deep: 3.5 },
    { kind: 'tatebori', pts: [[21, GATE_KYO_KOMA.z], [38, GATE_KYO_KOMA.z - 5], [54, GATE_KYO_KOMA.z - 15]], w: 4.5, deep: 3 },
    // 京極丸と小丸の間の小さな堀切（土橋あり）
    { kind: 'horikiri', pts: [[-20, GATE_KYO_KOMA.z], [-18, GATE_KYO_KOMA.z]], w: 4.4, deep: 3.4 },
    { kind: 'horikiri', pts: [[-12, GATE_KYO_KOMA.z], [-2.6, GATE_KYO_KOMA.z]], w: 4.4, deep: 3.4 },
    { kind: 'horikiri', pts: [[2.6, GATE_KYO_KOMA.z], [20, GATE_KYO_KOMA.z]], w: 4.4, deep: 3.4 },
  ],
  yagura: [
    { id: 'monomi_bansho', kind: 'monomi', at: [-4.5, BANSHO.z0 + 4], name: '番所の物見櫓' },
    { id: 'monomi_kyo', kind: 'monomi', at: [KYOGOKU.x + 9, KYOGOKU.z0 + 5], name: '京極丸の物見櫓' },
    { id: 'monomi_koma', kind: 'monomi', at: [KOMARU.x + 5, KOMARU.z1 - 6], name: '小丸の物見櫓' },
    { id: 'sumi_hon', kind: 'monomi', at: [HON.x + 9, HON.z1 - 4], rot: 0, name: '本丸の物見櫓' },
    { id: 'sumi_sanno', kind: 'monomi', at: [SANNOMARU.x - 5.3, SANNOMARU.z0 + 5], rot: Math.PI, name: '山王丸の物見櫓' },
    { id: 'monomi_oh', kind: 'monomi', at: [OOHIROMA.x - 12, OOHIROMA.z1 - 4], name: '大広間の物見櫓' },
  ],
};
