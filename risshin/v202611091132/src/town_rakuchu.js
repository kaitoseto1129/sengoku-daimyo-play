// ======================================================================
// 洛中洛外図屏風に寄せた城下（kaito 11/3 AX の 1・docs/town_rakuchu_1103.md）
// 上杉本・舟木本の下京を手本に、表の見世棚と品・町の境の釘貫・寺の五重塔・祇園会の鉾・公家の牛車を足す。
// 店・訓練所・戸口の仕組みには触らない。形は頂点の色の一つの材質（town_life.js の put）で作り、
// town3d.js の mergeStatic が場所ごとに一つへまとめる（描く回数はほぼ増えない）。
// ======================================================================
import { B, C, put } from './town_life.js';
import { solidRect, solidCircle } from './props.js';

// 塔の置き場（寺の南）。遠い町並みの家はここを避ける（town_life.js の farTown）
export const PAGODA = { x: 55, z: -58 };
// 釘貫を立てる所（通りの z）。見世棚はこの前後を空ける
const KUGINUKI_Z = [-66, 25];

// ---- 見世棚：表の格子の前に揚げ見世の台を下ろし、品を並べる ----
//   家の前（local +z）。台の高さ 0.7m・奥行き 0.6m。品は家ごとに組み合わせを変える
const GOODS = [
  // 俵と袋（米・塩）
  (P, x0, x1, y, z) => { for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.55) { P.push(C(0.2, 0.2, 0.5, x, y + 0.2, z, 0xc8b88a, 7, { rz: Math.PI / 2 })); P.push(C(0.205, 0.205, 0.04, x - 0.18, y + 0.2, z, 0x8a7a50, 7, { rz: Math.PI / 2 })); } P.push(B(0.3, 0.16, 0.3, x1 - 0.3, y + 0.08, z + 0.05, 0x9a7a50)); },
  // 反物（色の違う巻き）
  (P, x0, x1, y, z) => { const cols = [0x3a4a6a, 0x8a3a2a, 0xc8b890, 0x4a5a3a, 0x6a3a5a, 0xb08a40]; let i = 0; for (let x = x0 + 0.2; x < x1 - 0.15; x += 0.3, i++) { P.push(C(0.1, 0.1, 0.55, x, y + 0.1 + (i % 2) * 0.2, z, cols[i % cols.length], 6, { rx: Math.PI / 2 })); } },
  // 焼き物（壺・甕・皿）
  (P, x0, x1, y, z) => { let i = 0; for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.42, i++) { const r = 0.12 + (i % 3) * 0.04; P.push(C(r * 0.7, r, r * 2.2, x, y + r * 1.1, z + (i % 2 ? 0.1 : -0.08), [0x6a4a30, 0x5a5048, 0x8a6a48][i % 3], 8)); } P.push(C(0.16, 0.12, 0.05, x1 - 0.25, y + 0.03, z - 0.15, 0xb8a888, 8)); },
  // 笠（重ねた菅笠）と草鞋
  (P, x0, x1, y, z) => { for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.7) for (let j = 0; j < 4; j++) P.push(C(0.02, 0.32, 0.12, x, y + 0.06 + j * 0.06, z, j % 2 ? 0xb8a070 : 0xc8b080, 9)); for (let x = x0 + 0.2; x < x1; x += 0.35) P.push(B(0.12, 0.03, 0.3, x, y + 0.02, z + 0.2, 0xa89060)); },
  // 魚の籠（浅い籠に銀の魚）
  (P, x0, x1, y, z) => { for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.85) { P.push(C(0.36, 0.3, 0.12, x, y + 0.06, z, 0x8a7450, 10)); for (let j = 0; j < 4; j++) P.push(B(0.06, 0.04, 0.42, x - 0.15 + j * 0.1, y + 0.14, z, j % 2 ? 0x9aa4a8 : 0x7c8890, { ry: 0.3 * (j - 1.5) })); } },
];
function misedana(list, ST_W, D) {
  const out = [];
  list.forEach((it, i) => {
    const front = Math.abs(Math.abs(it.x) - (ST_W + D / 2 + 0.3)) < 0.05;
    if (!front || i % 3 === 2 || KUGINUKI_Z.some((z) => Math.abs(it.z - z) < it.w / 2 + 1.6)) return;
    const P = [], f = D / 2, y = 0.7, z = f + 0.42, half = it.w / 2;
    // 戸口の片側だけ（家ごとに左右を変える）
    const sd = i % 2 ? 1 : -1, x0 = sd < 0 ? -half + 0.3 : 0.85, x1 = sd < 0 ? -0.85 : half - 0.3;
    P.push(B(x1 - x0, 0.06, 0.62, (x0 + x1) / 2, y, z, 0x6a5238));                       // 下ろした蔀（台の板）
    P.push(B(x1 - x0, 0.08, 0.05, (x0 + x1) / 2, y - 0.04, z + 0.3, 0x4a3a28));            // 前の框
    for (const x of [x0 + 0.08, x1 - 0.08]) P.push(B(0.07, y, 0.07, x, y / 2, z + 0.25, 0x3e3022));   // 脚
    // 上の蔀は吊り上げて、軒下に斜めに掛ける
    P.push(B(x1 - x0, 0.05, 0.9, (x0 + x1) / 2, 2.35, f + 0.45, 0x5a4634, { rx: -0.9 }));
    GOODS[(i * 7 + (it.x > 0 ? 3 : 0)) % GOODS.length](P, x0, x1, y + 0.03, z - 0.02);
    out.push({ it, P, cx: (x0 + x1) / 2, cw: x1 - x0 });
  });
  return out;
}

// ---- 釘貫：町の境の木戸。二本の柱に冠木と貫、板の小屋根。昼は戸を外して通りを空ける（カメラが戸の板に掛からない） ----
function kuginuki(x0) {
  const P = [], h = 3.4;
  for (const sx of [-1, 1]) {
    const x = sx * x0;
    P.push(B(0.24, h, 0.24, x, h / 2, 0, 0x4a3a2a));
    P.push(B(0.5, 0.25, 0.5, x, 0.12, 0, 0x7a766c));                                   // 礎石
  }
  P.push(B(x0 * 2 + 0.9, 0.26, 0.3, 0, h - 0.2, 0, 0x3e3022));                          // 冠木
  P.push(B(x0 * 2 + 0.5, 0.14, 0.16, 0, h - 0.75, 0, 0x4a3a2a));                         // 貫
  for (const sd of [-1, 1]) P.push(B(x0 * 2 + 1.4, 0.07, 0.75, 0, h + 0.12, sd * 0.3, 0x6a5e4c, { rx: sd * 0.42 }));   // 板の小屋根
  P.push(B(x0 * 2 + 1.5, 0.1, 0.12, 0, h + 0.27, 0, 0x3a342a));
  return P;
}

// ---- 五重塔：石の基壇・五つの軸部と本瓦の屋根・相輪 ----
function pagoda() {
  const P = [];
  P.push(B(8.4, 0.9, 8.4, 0, 0.45, 0, 0x8a8478), B(9.2, 0.25, 9.2, 0, 0.12, 0, 0x6e6a60));
  for (const sd of [-1, 1]) P.push(B(1.6, 0.3, 1.2, 0, 0.15, sd * 4.9, 0x8a8478));         // 石段
  let y = 0.9;
  for (let i = 0; i < 5; i++) {
    const w = 5.2 - i * 0.42, hBody = i === 0 ? 2.9 : 2.0, eave = 2.1 - i * 0.08;
    // 軸部：朱の柱と白い連子の間（一面に柱四本）
    P.push(B(w, hBody, w, 0, y + hBody / 2, 0, 0xd4cab4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(B(0.26, hBody, 0.26, sx * (w / 2 - 0.05), y + hBody / 2, sz * (w / 2 - 0.05), 0x8a3424));
    for (const r of [0, Math.PI / 2]) {
      const g = (a, b, c, d, e, f, col) => { const m = B(a, b, c, d, e, f, col); if (r) m.rotateY(r); return m; };
      for (const s of [-1, 1]) {
        P.push(g(0.24, hBody, 0.05, -w / 6, y + hBody / 2, s * (w / 2 + 0.01), 0x8a3424), g(0.24, hBody, 0.05, w / 6, y + hBody / 2, s * (w / 2 + 0.01), 0x8a3424));
        P.push(g(w / 3 - 0.3, hBody * 0.82, 0.04, 0, y + hBody * 0.45, s * (w / 2 + 0.02), 0x3a2a1e));                        // 扉
        P.push(g(w + 0.1, 0.2, 0.06, 0, y + hBody - 0.1, s * (w / 2 + 0.02), 0x8a3424));                                    // 頭貫
      }
    }
    y += hBody;
    // 組物（斗栱）の段：暗い木の帯を二段
    P.push(B(w + 0.7, 0.32, w + 0.7, 0, y + 0.16, 0, 0x6a3a28), B(w + 1.2, 0.28, w + 1.2, 0, y + 0.46, 0, 0x5a3424));
    y += 0.6;
    // 屋根：四角の錐台（四つの辺を 45 度回す）。軒先は薄く、上へ反りぎみに二段
    const r0 = (w / 2 + eave) * Math.SQRT2, r1 = (w / 2 - 0.2) * Math.SQRT2;
    const roof = C(r1, r0, 0.9, 0, y + 0.25, 0, 0x3c3c40, 4); roof.rotateY(Math.PI / 4);
    // C は平行移動ずみなので、回した後に中心へ戻す必要はない（y 軸まわりの回転）
    const lip = C(r0 + 0.05, r0 + 0.15, 0.16, 0, y - 0.26, 0, 0x2e2e32, 4); lip.rotateY(Math.PI / 4);
    P.push(roof, lip);
    y += 0.7;
  }
  // 相輪：露盤・伏鉢・九輪・水煙・宝珠
  P.push(B(1.4, 0.5, 1.4, 0, y + 0.25, 0, 0x3c3c40), C(0.55, 0.65, 0.5, 0, y + 0.75, 0, 0x4a4a3a, 10));
  y += 1;
  P.push(C(0.08, 0.1, 7.2, 0, y + 3.6, 0, 0x4a4a3a, 6));
  for (let j = 0; j < 9; j++) P.push(C(0.42 - j * 0.015, 0.42 - j * 0.015, 0.1, 0, y + 0.5 + j * 0.42, 0, 0x5a5640, 10));
  P.push(B(0.06, 1.0, 0.7, 0, y + 5.0, 0, 0x5a5640), C(0.16, 0.16, 0.34, 0, y + 6.2, 0, 0x6a6448, 8));
  return P;
}

// ---- 祇園会の鉾：四つの車・台の井桁・胴掛を掛けた櫓・破風の屋根・真木と榊・先の長刀 ----
function hoko() {
  const P = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(C(0.95, 0.95, 0.28, sx * 1.35, 0.95, sz * 1.5, 0x3a2a1c, 14, { rz: Math.PI / 2 }));
    P.push(C(0.22, 0.22, 0.34, sx * 1.35, 0.95, sz * 1.5, 0x8a7040, 8, { rz: Math.PI / 2 }));   // 車の轂（金具）
  }
  for (const sz of [-1, 1]) P.push(C(0.1, 0.1, 3.2, 0, 0.95, sz * 1.5, 0x2a2018, 6, { rz: Math.PI / 2 }));   // 車軸
  P.push(B(2.3, 0.4, 4.4, 0, 1.6, 0, 0x4a3420));                                           // 石持（台の木組み）
  // 櫓：四隅の柱と、四面の胴掛（毛綴の赤・紺・金茶の模様を色の板で）
  const y0 = 1.8, hY = 2.4;
  P.push(B(2.0, hY, 2.8, 0, y0 + hY / 2, 0, 0x2a1e16));
  const DOU = [[0x6e2420, 0x8a7038, 0x283048], [0x283048, 0x8a7038, 0x6e2420]];   // 毛綴の深い緋・金茶・紺（染めの色で、塗りの原色にしない）
  for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) P.push(B(0.04, hY * 0.75, 0.85, sx * 1.02, y0 + hY * 0.42, -0.9 + j * 0.9, DOU[sx < 0 ? 0 : 1][j]));
  for (const sz of [-1, 1]) for (let j = 0; j < 2; j++) P.push(B(0.9, hY * 0.75, 0.04, -0.47 + j * 0.94, y0 + hY * 0.42, sz * 1.42, DOU[0][(j + (sz > 0 ? 1 : 0)) % 3]));
  P.push(B(2.15, 0.2, 2.95, 0, y0 + hY - 0.1, 0, 0x1a1410));                               // 欄縁（黒漆）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(B(0.12, 0.9, 0.12, sx * 1.0, y0 + hY + 0.45, sz * 1.4, 0x1a1410));   // 高欄の柱
  for (const sz of [-1, 1]) P.push(B(2.1, 0.08, 0.06, 0, y0 + hY + 0.55, sz * 1.42, 0xb08a40));
  for (const sx of [-1, 1]) P.push(B(0.06, 0.08, 2.9, sx * 1.03, y0 + hY + 0.55, 0, 0xb08a40));
  // 屋根：黒い板の切妻（破風は前後）
  const yR = y0 + hY + 1.2;
  for (const sx of [-1, 1]) P.push(B(1.45, 0.1, 3.4, sx * 0.62, yR + 0.35, 0, 0x1e1a16, { rz: -sx * 0.5 }));
  P.push(B(0.16, 0.16, 3.5, 0, yR + 0.68, 0, 0x2a2018));
  // 真木：屋根を抜けて天へ。中ほどに榊、先に長刀
  const mY = yR + 0.7, mH = 12;
  P.push(C(0.07, 0.14, mH, 0, mY + mH / 2, 0, 0x8a7a5a, 6));
  for (let j = 0; j < 5; j++) P.push(B(0.7 - j * 0.08, 0.5, 0.7 - j * 0.08, 0, mY + 3.8 + j * 0.5, 0, [0x2e4a22, 0x3a5a28, 0x2a4220][j % 3], { ry: j * 0.5 }));   // 榊
  P.push(B(0.9, 0.08, 0.9, 0, mY + 2.2, 0, 0xb08a40));                                     // 天王座
  P.push(B(0.05, 1.1, 0.16, 0, mY + mH + 0.55, 0, 0xc8ccd0), B(0.12, 0.12, 0.2, 0, mY + mH, 0, 0x8a7040));   // 長刀
  // 前の綱（地に置いて巻く）
  P.push(C(0.05, 0.05, 6, 0, 0.06, 5.2, 0xd8ccb0, 5, { rx: Math.PI / 2 }));
  for (const sx of [-0.3, 0.3]) P.push(C(0.05, 0.05, 3, sx, 0.06, 3.2, 0xd8ccb0, 5, { rx: Math.PI / 2 }));
  return P;
}

// ---- 牛車：網代の屋形・二つの大きな車・前の轅を榻に載せる。牛は外して脇で休む ----
function gissha() {
  const P = [];
  P.push(B(1.5, 1.4, 2.5, 0, 1.55, 0, 0xb09a70));                                          // 屋形（網代）
  for (let j = 0; j < 6; j++) P.push(B(1.52, 0.03, 2.52, 0, 1.0 + j * 0.24, 0, 0x8a7650));     // 網代の目
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(B(0.08, 1.45, 0.08, sx * 0.74, 1.55, sz * 1.22, 0x1a1612));   // 黒い框
  P.push(B(1.4, 1.1, 0.03, 0, 1.6, 1.27, 0xd8cca0));                                        // 前の簾
  P.push(B(1.6, 0.06, 0.04, 0, 2.14, 1.28, 0x7a2a22));
  P.push(B(1.75, 0.12, 2.9, 0, 2.34, 0, 0x1e1a16), B(1.3, 0.14, 2.7, 0, 2.47, 0, 0x2a241c));   // 屋根（反りを二段）
  for (const sx of [-1, 1]) {
    P.push(C(0.92, 0.92, 0.09, sx * 0.9, 0.92, -0.1, 0x2a2018, 16, { rz: Math.PI / 2 }));
    P.push(C(0.15, 0.15, 0.24, sx * 0.9, 0.92, -0.1, 0x6a5a40, 8, { rz: Math.PI / 2 }));
  }
  P.push(C(0.06, 0.06, 2.0, 0, 0.92, -0.1, 0x2a2018, 6, { rz: Math.PI / 2 }));
  for (const sx of [-1, 1]) P.push(B(0.09, 0.09, 3.6, sx * 0.45, 0.72, 2.9, 0x2a2018, { rx: 0.12 }));   // 轅
  P.push(B(1.2, 0.07, 0.2, 0, 0.5, 4.5, 0x1a1612), B(1.0, 0.1, 0.12, 0, 0.6, 4.62, 0x2a2018));             // 軛
  P.push(B(1.3, 0.08, 0.3, 0, 0.52, 3.6, 0x2a2018));                                       // 榻（轅を載せる台）
  for (const sx of [-1, 1]) P.push(B(0.06, 0.48, 0.25, sx * 0.6, 0.24, 3.6, 0x2a2018));
  return P;
}
function ushi() {
  const P = [], col = 0x2a221c;
  P.push(B(0.78, 0.82, 1.7, 0, 1.05, 0, col), B(0.7, 0.4, 0.6, 0, 1.45, 0.45, col));       // 胴と背の峰
  P.push(B(0.42, 0.46, 0.55, 0, 0.92, 1.05, col), B(0.34, 0.3, 0.3, 0, 0.78, 1.38, 0x3a2e26));   // 頭（低く下げて草を食む）
  for (const sx of [-1, 1]) P.push(C(0.03, 0.05, 0.32, sx * 0.24, 1.18, 1.0, 0xc8b890, 5, { rz: -sx * 1.0 }));   // 角
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(B(0.16, 0.66, 0.18, sx * 0.26, 0.33, sz * 0.62, col));
  P.push(B(0.06, 0.6, 0.06, 0, 1.0, -0.88, col, { rx: 0.2 }));                               // 尾
  P.push(B(0.5, 0.5, 0.05, 0, 0.75, 0.82, 0x6a2a22));                                        // 首の房
  return P;
}

// ======================================================================
// ctx：{ list（並べ終えた町家）, ST_W, D, CROSS_Z }
export function buildRakuchu(rt, ctx) {
  const { list, ST_W, D, CROSS_Z } = ctx;
  // 見世棚：家の場所ごとに一つの形（mergeStatic が近所ごとにまとめる）
  for (const m of misedana(list, ST_W, D)) {
    put(rt, m.P, m.it.x, m.it.z, m.it.rot);
    // 台の当たり（家の前 0.75m）
    //   rot ±π/2 の家：local の前（+z）は世界の ±x、local の x は世界の ∓z
    const s = m.it.rot > 0 ? 1 : -1;
    solidRect(m.it.x + s * (D / 2 + 0.42), m.it.z - s * m.cx, 0.62, m.cw, 0);
  }
  // 釘貫：門の内と北の辻
  for (const z of KUGINUKI_Z) {
    put(rt, kuginuki(ST_W - 0.15), 0, z, 0);
    for (const sx of [-1, 1]) solidCircle(sx * (ST_W - 0.15), z, 0.18);
  }
  // 五重塔（寺の南の塔頭）
  put(rt, pagoda(), PAGODA.x, PAGODA.z, 0.08);
  solidRect(PAGODA.x, PAGODA.z, 8.4, 8.4, 0.08);
  // 祇園会の鉾：北の横の通りの東。通りに沿って立てる（向きは東西）
  {
    const x = 18, z = CROSS_Z - 0.3;
    put(rt, hoko(), x, z, Math.PI / 2);
    solidRect(x, z, 4.6, 3.0, 0);
  }
  // 牛車：上官屋敷の冠木門の東の塀ぎわ。牛は外して前で休む
  {
    const x = -16, z = CROSS_Z + 3.0;
    put(rt, gissha(), x, z, -Math.PI / 2);
    solidRect(x - 1.5, z, 7.2, 2.0, 0);
    put(rt, ushi(), x - 7.4, z + 0.6, -Math.PI / 2 - 0.5);
    solidRect(x - 7.4, z + 0.6, 1.8, 1.0, -0.5);
  }
}
