import { demSample } from '../dem.js';
import DEM from '../asset_dem_odani.js';
// ======================================================================
// castles/odani.js … 小谷城の縄張り（docs/late6-1573-1575-spec.md 14〜37章）
// castle_plan.js の形（kuruwa・koguchi・paths・hori・yagura）で書く。地形・兵・戦い方は b_odani.js。
// 向き：主尾根は南北。南（+z）の山麓・番所から、北（-z）の山王丸へ一段ずつ高くなる（梯郭）。
//   番所→御茶屋→御馬屋（馬洗池）→桜馬場→黒金御門→大広間→本丸→（大堀切）→中丸→京極丸→小丸→山王丸
//   本丸は城の一番高い所ではない（中丸・京極丸・小丸・山王丸の方が高い）。
// 清水谷は主尾根の西（-x）の谷。谷底の道の両側に浅井の居館・家臣の屋敷・寺。谷の奥から京極丸の西の口へ登る
//   （羽柴秀吉が攻め上った道。道筋には諸説ある＝HIST_B）。
// 札：HIST_A（遺構から根拠が強い）／HIST_B（推定復元）／GAME_C（ゲームの補い）
//   曲輪の並びと名・大堀切・本丸が最高所でない事・清水谷の居館＝HIST_A。
//   曲輪の広さ・高さの差・門の形＝HIST_B（縮めてある）。周りの砦の場所・寺の名を出さない事＝GAME_C。
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
  return Math.max(0, demSample(DEM, DEM_OX + kx * _ca - Z * _sa, DEM_OZ + kx * _sa + Z * _ca) - DEM_BASE);
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

// 曲輪（z0 が北の縁、z1 が南の縁）。level は DEM の背に沿って K が決める（第6引数は使わない）
export const BANSHO = K('bansho', '番所', 136, 152, 8, 0);
export const OCHAYA = K('ochaya', '御茶屋', 112, 130, 10, 0);
export const ONMAYA = K('onmaya', '御馬屋', 84, 106, 12, 0);
export const SAKURABABA = K('sakurababa', '桜馬場', 58, 80, 10, 0);
export const OOHIROMA = K('oohiroma', '大広間', 20, 50, 16, 0);
export const HON = K('hon', '本丸', -12, 14, 13, 0);
export const NAKAMARU = K('nakamaru', '中丸', -42, -27, 10, 0);
export const KYOGOKU = K('kyogoku', '京極丸', -68, -47, 14, 0);
export const KOMARU = K('koma', '小丸', -94, -77, 9, 0);
export const SANNOMARU = K('sannomaru', '山王丸', -138, -104, 13, 0);
export const SANNO2 = K('sanno2', '山王丸の上の段', -134, -118, 7.5, 0, { step: 5 });
export const RIDGE = [BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU, KOMARU, SANNOMARU];

// 馬洗池（御馬屋の目印の水場。HIST_A）
export const UMAARAI = { x: ONMAYA.x - 6, z: ONMAYA.cz + 4, r: 2.6 };
// 大堀切（本丸の北。尾根をここで前後に断つ。真ん中に細い土橋だけ残す。HIST_A・土橋は GAME_C）
export const OHORIKIRI = { z: -19.5, w: 9, deep: 6 };

// 門（虎口）
const mid = (a, b) => (a.z0 + b.z1) / 2;
export const GATE_BANSHO = { x: 0, z: BANSHO.z1 + 1, name: '番所の木戸' };
export const GATE_KURO = { x: 0, z: mid(SAKURABABA, OOHIROMA), name: '黒金御門' };
export const GATE_HON_S = { x: 0, z: mid(OOHIROMA, HON), name: '本丸の門' };
export const GATE_HON_N = { x: 0, z: HON.z0, name: '本丸の北の口' };
export const GATE_NAKA_S = { x: 0, z: NAKAMARU.z1, name: '中丸の口' };
export const GATE_NAKA_KYO = { x: 0, z: mid(KYOGOKU, NAKAMARU), name: '中丸と京極丸の門' };
export const GATE_KYO_KOMA = { x: 0, z: mid(KOMARU, KYOGOKU), name: '京極丸と小丸の門' };
export const GATE_KOMA_SANNO = { x: 0, z: mid(SANNOMARU, KOMARU), name: '小丸と山王丸の門' };
// 京極丸の西の口：清水谷から攀じ登る道の出口（羽柴の攻め口）
export const GATE_WEST = { x: KYOGOKU.x - KYOGOKU.hw, z: KYOGOKU.cz + 2, name: '京極丸の西の口' };

// 清水谷：谷の口（南西の山麓）から谷の奥（京極丸の西の下）へ。谷底の高さは口 1・奥 17
export const SHIMIZU = [[-112, 160], [-100, 110], [-88, 62], [-74, 18], [-60, -22], [-46, -50]];
// 谷底の高さ：谷口から奥へ上る。DEM を引き、奥は京極丸より 38m 下で止める（登り道の九十九折りで上る）
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
// 谷の奥から京極丸の西の口へ（折れながら登る）
// 西の口の外は食い違い虎口：二枚の高い土塁（KUICHIGAI）が食い違い、道は北へ折れ、南へ折れ返し、また東へ折れて門に着く
export const KUICHIGAI = [[-23.5, -58, -23.5, -46], [-18.5, -64, -18.5, -52]];   // [ax, az, bx, bz]
export const CLIMB_UP = [[-46, -50], [-52, -86], [-34, -56], [-25.5, -60], [-21, -60], [-21, -50], [-16, -50], [GATE_WEST.x - 3, GATE_WEST.z], [GATE_WEST.x + 4, GATE_WEST.z]];
// 隠し銃座の置き場（x, z, 撃つ向き, 数）：虎口の南北の口に向けて十字に撃つ。大堀切の土橋の前にも一つ
// 横矢の座（虎口の曲がりで側面から撃つ）：x, z, 撃つ向き, 兵の種類
export const YOKOYA = [{ id: 'yA', x: -15.8, z: -59.5, rot: -Math.PI / 2, k: 'gun', n: 2 }, { id: 'yB', x: -27.2, z: -48, rot: Math.PI / 2, k: 'bow', n: 2 }];
export const NESTS = [{ id: 'nA', x: -21, z: -41.5, rot: Math.PI, n: 3 }, { id: 'nB', x: -21, z: -67.5, rot: 0, n: 3 }, { id: 'nC', x: 7.5, z: -28.5, rot: 0, n: 2 }];
// 大野木屋敷（京極丸の直下、清水谷側の斜面。浅井の重臣・大野木氏）と赤尾屋敷（本丸の東の下。長政の最期の所）
export const ONOGI = { x: -31, z: -79, hw: 9, hd: 6, name: '大野木屋敷' };
export const AKAO = { x: 33, z: 4, hw: 9, hd: 8, name: '赤尾屋敷' };
// 谷の中の物（HIST_B：居館・屋敷・寺の並び。名は出さない寺がある＝GAME_C）
export const KYOKAN = { x: -56, z: 38, name: '浅井の居館' };       // 清水谷の浅井氏の館（谷の道の東。門は道へ向く）
export const TERA = { x: -120, z: 112, name: '谷の寺' };
export const YASHIKI = [[-84, 112, 0.2], [-82, 96, -0.1], [-110, 70, 0.4], [-68, 70, -0.3], [-98, 40, 0.1], [-52, 6, -0.4], [-84, -4, 0.3], [-74, -34, 0.2]];

// 尾根の道（南の番所から北の山王丸まで。門を通る）
export const ROAD_RIDGE = [
  [0, 176], [0, BANSHO.cz], [0, OCHAYA.cz], [0, ONMAYA.cz], [0, SAKURABABA.cz], [GATE_KURO.x, GATE_KURO.z], [0, OOHIROMA.cz],
  [0, HON.z1], [0, HON.cz], [0, HON.z0], [0, OHORIKIRI.z], [0, NAKAMARU.cz], [0, KYOGOKU.cz], [0, KOMARU.cz], [0, SANNOMARU.cz], [0, SANNO2.cz],
];

const gap = (k, side) => [k.x, side === 'n' ? k.z0 : k.z1];
const kur = (k, o) => ({ id: k.id, name: k.name, level: k.level, wall: 'dobei', poly: rr(k.x, k.z0, k.z1, k.hw), ...o });

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
    kur(KYOGOKU, { hp: 1e9, kind: 'ni', capacity: 90, fallbackTo: null, defenseValue: 0.7, gapAt: [gap(KYOGOKU, 's'), gap(KYOGOKU, 'n'), [GATE_WEST.x, GATE_WEST.z]] }),
    kur(KOMARU, { hp: 1e9, kind: 'hon', capacity: 60, fallbackTo: 'sannomaru', defenseValue: 0.7, gapAt: [gap(KOMARU, 's'), gap(KOMARU, 'n')] }),
    kur(SANNOMARU, { hp: 1e9, kind: 'san', capacity: 80, fallbackTo: null, defenseValue: 0.8, gapAt: [gap(SANNOMARU, 's')] }),
    // 山王丸の上の段（四段の石垣の曲輪を、二段に縮めて見せる。HIST_B）
    { id: 'sanno2', name: SANNO2.name, level: SANNO2.level, wall: null, kind: 'san', capacity: 30, fallbackTo: null, defenseValue: 0.9, poly: rr(0, SANNO2.z0, SANNO2.z1, SANNO2.hw, 2) },
  ],
  koguchi: [
    { id: 'g_bansho', name: GATE_BANSHO.name, from: 'out', to: 'bansho', kind: 'hira', gate: 'kabuki', at: [0, BANSHO.z1], rot: 0, w: 4.4, role: 'ote', maxFlow: 4 },
    { id: 'g_ochaya', name: '御茶屋の木戸', from: 'bansho', to: 'ochaya', kind: 'hira', at: [0, mid(BANSHO, OCHAYA)], rot: 0, w: 4.6 },
    { id: 'g_onmaya', name: '御馬屋の木戸', from: 'ochaya', to: 'onmaya', kind: 'hira', at: [0, mid(OCHAYA, ONMAYA)], rot: 0, w: 4.6 },
    { id: 'g_sakura', name: '桜馬場の木戸', from: 'onmaya', to: 'sakurababa', kind: 'hira', at: [0, mid(ONMAYA, SAKURABABA)], rot: 0, w: 4.6 },
    { id: 'g_kuro', name: GATE_KURO.name, from: 'sakurababa', to: 'oohiroma', kind: 'hira', gate: 'yagura', at: [GATE_KURO.x, GATE_KURO.z], rot: 0, w: 4.4, role: 'ote', maxFlow: 5, fireResistance: 0.5 },
    { id: 'g_hon', name: GATE_HON_S.name, from: 'oohiroma', to: 'hon', kind: 'hira', gate: 'yagura', at: [GATE_HON_S.x, GATE_HON_S.z], rot: 0, w: 4.6, role: 'ote', maxFlow: 5 },
    { id: 'g_hon_n', name: GATE_HON_N.name, from: 'hon', to: 'nakamaru', kind: 'hira', at: [GATE_HON_N.x, GATE_HON_N.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_naka_s', name: GATE_NAKA_S.name, from: 'hon', to: 'nakamaru', kind: 'hira', gate: 'kabuki', at: [GATE_NAKA_S.x, GATE_NAKA_S.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_naka_kyo', name: GATE_NAKA_KYO.name, from: 'nakamaru', to: 'kyogoku', kind: 'hira', gate: 'kabuki', at: [GATE_NAKA_KYO.x, GATE_NAKA_KYO.z], rot: 0, w: 5, maxFlow: 5 },
    { id: 'g_kyo_koma', name: GATE_KYO_KOMA.name, from: 'kyogoku', to: 'koma', kind: 'hira', gate: 'kabuki', at: [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], rot: 0, w: 5, maxFlow: 5 },
    { id: 'g_koma_sanno', name: GATE_KOMA_SANNO.name, from: 'koma', to: 'sannomaru', kind: 'hira', gate: 'yagura', at: [GATE_KOMA_SANNO.x, GATE_KOMA_SANNO.z], rot: 0, w: 4.6, maxFlow: 4 },
    { id: 'g_west', name: GATE_WEST.name, from: 'out', to: 'kyogoku', kind: 'hira', gate: 'kabuki', at: [GATE_WEST.x, GATE_WEST.z], rot: Math.PI / 2, w: 5.2, role: 'karamete', maxFlow: 5 },
  ],
  paths: [
    { id: 'ridge', kind: 'ote', pts: ROAD_RIDGE },
    { id: 'shimizu', kind: 'karamete', pts: [...SHIMIZU, ...CLIMB_UP.slice(1), [KYOGOKU.x, KYOGOKU.cz]] },
  ],
  // 大堀切：尾根を東西に断つ。真ん中（x -2.4〜2.4）だけ土橋を残す
  hori: [
    { kind: 'horikiri', pts: [[-34, OHORIKIRI.z], [-2.6, OHORIKIRI.z]], w: OHORIKIRI.w, deep: OHORIKIRI.deep },
    { kind: 'horikiri', pts: [[2.6, OHORIKIRI.z], [34, OHORIKIRI.z]], w: OHORIKIRI.w, deep: OHORIKIRI.deep },
    // 京極丸と小丸の間の小さな堀切（土橋あり）
    { kind: 'horikiri', pts: [[-20, -72.5], [-2.6, -72.5]], w: 4.4, deep: 3.4 },
    { kind: 'horikiri', pts: [[2.6, -72.5], [20, -72.5]], w: 4.4, deep: 3.4 },
  ],
  yagura: [
    { id: 'monomi_kyo', kind: 'monomi', at: [KYOGOKU.x + 9, KYOGOKU.z0 + 5], name: '京極丸の物見櫓' },
    { id: 'monomi_koma', kind: 'monomi', at: [KOMARU.x - 5, KOMARU.z0 + 4], name: '小丸の物見櫓' },
    { id: 'sumi_hon', kind: 'sumi', at: [HON.x + 9, HON.z1 - 4], rot: 0, name: '本丸の隅櫓' },
    { id: 'sumi_sanno', kind: 'sumi', at: [SANNOMARU.x - 8, SANNOMARU.z0 + 5], rot: Math.PI, name: '山王丸の隅櫓' },
    { id: 'monomi_oh', kind: 'monomi', at: [OOHIROMA.x - 12, OOHIROMA.z1 - 4], name: '大広間の物見櫓' },
  ],
};
