// ======================================================================
// 豊臣編　山中城の戦い（天正十八年三月二十九日の朝）。docs/chapter2_toyotomi.md の 9 を正とする
// 豊臣秀次を大将におよそ七万が、松田康長らおよそ四千の守る北条の山中城（箱根の西の坂）を攻める。
// 一柳直末が鉄砲に当たって討たれるほどの激戦だったが、城は半日で落ちた。岱崎出丸の間宮康俊も討ち死に。
// 主人公は城主として自分の手勢を率い、秀次の下で岱崎出丸の側から寄る。
// ①岱崎出丸の鉄砲の中を寄る ②障子堀の畝の上を渡る ③三の丸の虎口（枡形）を破る ④二の丸を抜け、本丸の松田康長の隊を崩す
// 地形：国土地理院の標高（asset_dem_yamanaka.js・tools/dem.mjs の yamanaka）。高さは 0.6 倍に詰め、曲輪は平らに削る。
// 座標：x が東、z が南（+z が三島の側の下り坂）。寄せ手は南から北（−z）へ坂を上る。縄張りは史跡の形を手本にした推定。
// ======================================================================
import * as THREE from 'three';
import { siegeStages } from './siege_stages.js';
import DEM from './asset_dem_yamanaka.js';
import { demSample } from './dem.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, kagaribi, tawara, yagura, palisade, solidRect, shogi, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { bankTex } from './nature.js';
import { siegePlan, siegeHeight, buildSiege, makeSamaFire } from './siege_kit.js';
import { withGuard } from './toyo_bot.js';
import { KILLS } from './stages.js';
import { addSite } from './map_sites.js';
import { addTaba } from './taketaba.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 12）：段の中身は t09_yamanaka/ に一段一ファイル
import * as shutsujin from './t09_yamanaka/shutsujin.js';   // 出陣：全国の諸将の旗と山中城の遠景・別の戦線の知らせ
import * as tahoumen from './t09_yamanaka/tahoumen.js';     // 別の口：東の尾根と西の丸の寄せ手・「別曲輪、突破！」
import * as rakujo from './t09_yamanaka/rakujo.js';
import * as shoshou from './t09_yamanaka/shoshou.js';       // 二巡：北条氏勝の落ち延び・徳川の旗・諸将の知らせ         // 落城の後：曲輪ごとに豊臣の旗・小田原はまだ先

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 東海道（城の中を通る土の道）。三島の側（南）から本丸の脇へ
const ROAD = [[34, 340], [24, 270], [14, 200], [10, 140], [10, 64], [10, 30], [14, -40], [24, -100], [30, -170]];
const SEAT = { x: 44, z: 232 };             // 豊臣秀次の本陣の床几（街道の後ろの陣幕の中）
const START = { x: 22, z: 220 };           // 地面の格子（groundHalf 240）と動ける所（moveLim 236）の内。前は 292 で、兵がみな z=176 の端に寄せられていた
const SIGN = { x: 0, z: 0, label: '' };
// 曲輪（中心・半径・削った面の高さの足し）。切岸の縁は 10m で地形へ戻す。手本は docs/battle_refs/t09_yamanaka.md
//   seg：細長い曲輪（尾根に沿う）。rim：縁の内に盛る土塁の高さ（北条の城は石垣を使わない土の城）。gaps：土塁を切る虎口の点
const KURUWA = {
  // 岱崎出丸（間宮康俊）：街道の脇から三島の側へ尾根に沿って細長く延びる出丸。脇を畝堀（一の堀）が並ぶ
  dai: { x: -46, z: 176, r: 18, up: 1.6, seg: [-44, 146, -50, 212], rim: 1.5, gaps: [[-29, 176], [-44, 128]] },
  san: { x: 10, z: 14, r: 34, up: 1.2 },     // 三の丸（南の口は城攻めの部品の塀と枡形）
  ni: { x: 16, z: -46, r: 24, up: 1.6, rim: 1.5, gaps: [[16, -22], [21, -69]] },     // 二の丸
  hon: { x: 25, z: -106, r: 22, up: 2.2, rim: 1.7, gaps: [[24, -84]] },   // 本丸（松田康長）。北西の隅に天守櫓の高まり
  nishi: { x: -54, z: -50, r: 16, up: 1.4, rim: 1.3, gaps: [[-70, -50]] }, // 西の丸（まわりを障子堀が囲む）
  kita: { x: 46, z: -152, r: 15, up: 2.8, rim: 1.3, gaps: [[40, -138]] },  // 北の丸（本丸の奥の高み）
};
// 曲輪の芯（細長い曲輪は芯の線）への近さと、その点
function kNear(k, x, z) {
  if (!k.seg) return [Math.hypot(x - k.x, z - k.z), k.x, k.z];
  const [ax, az, bx, bz] = k.seg, dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1), px = ax + dx * t, pz = az + dz * t;
  return [Math.hypot(x - px, z - pz), px, pz];
}
// 障子堀：出丸と三の丸の間を東西に切る深い堀。底を格子の畝で仕切る（縦の畝の上だけを一列で渡れる）
const SHOJI = { x0: -40, x1: 60, z0: 90, z1: 110, depth: 4.6, cell: 6, rib: 0.7 };
const CROSS_X = 10;                          // 渡る筋（縦の畝の一つ。道の筋）
SHOJI.cx = CROSS_X;
// 岱崎出丸の東の柵の前の障子堀（史実：出丸の前も障子堀・畝堀で囲まれていた。始めの25秒に出丸へ寄る所の目の前に見える）。
//   南北に長い堀を二つ。間（z 170〜182）は掘らずに土橋として残し、寄せ手はそこを通って柵へ寄る
//   出丸の脇の堀は、史跡の一の堀と同じ畝堀（une：堀を横切る畝だけが梯子のように並ぶ。縦の畝は無い）
const SHOJI_DAI = [
  { x0: -27, x1: -12, z0: 140, z1: 169, depth: 3.4, cell: 5, rib: 0.6, cx: 140, alongZ: true, une: true },
  { x0: -27, x1: -12, z0: 183, z1: 210, depth: 3.4, cell: 5, rib: 0.6, cx: 183, alongZ: true, une: true },
];
// 城の奥の堀（見せるだけ・遊びの筋の外）：西の丸を囲む障子堀（史跡でいちばん名高い格子の堀）と、二の丸と本丸の間の畝堀。
//   本丸の堀は、二の丸から攻め上る筋（x 17〜27）を土橋として掘り残す（gap）
const SHOJI_OKU = [
  { x0: -78, x1: -30, z0: -31, z1: -20, depth: 4.2, cell: 5.5, rib: 0.6, cx: -78 },
  { x0: -36, x1: -25, z0: -72, z1: -31, depth: 4.2, cell: 5.5, rib: 0.6, cx: -72, alongZ: true },
  { x0: -78, x1: -36, z0: -80, z1: -70, depth: 4.2, cell: 5.5, rib: 0.6, cx: -78 },
  { x0: -8, x1: 52, z0: -83, z1: -74, depth: 3.8, cell: 5, rib: 0.6, cx: -8, une: true, gap: [16, 28] },
];
const ALL_HORI = [SHOJI, ...SHOJI_DAI, ...SHOJI_OKU];
// 三の丸の大手：枡形虎口・横矢・畝堀・切岸・逆茂木（城攻めの共通部品）
const SP = siegePlan({ x: 10, z: 48, rot: 0, W: 26, koguchi: 'masu', turn: 1,
  yokoya: { at: 14, w: 6, d: 4 }, moat: { w: 8, depth: 3.4, une: 4 }, kirigishi: 1.4,
  umadashi: { kind: 'kaku', r: 5, moatW: 3, depth: 2.2, bank: 0.9 }, sakamogi: { at: 5 }, shiyori: false });
const SP_H = siegeHeight(SP);
// 大手門から本丸への攻め上りの筋：門・枡形の中・東へ折れた櫓門の外・三の丸・二の丸の虎口・本丸の土橋（枡形は東へ折れる。turn 1）
const UP_ROUTE = [[SP.x, SP.z], [SP.x, SP.z - 4.5], [SP.x + 9, SP.z - 3], [SP.x + 9, SP.z - 20], [16, -20], [16, -46], [21, -68], [22, -80], [25, -94]];
const HOJO = { flag: 'hojo', armor: 0x2e2a26, hatColor: 0x1e1b18, lace: 0x5a4632, cloth: 0x6a5a40 };
const TOYO = { flag: 'toyotomi' };   // 秀次の本陣・中村一氏の手（中村の紋は確かな物が無く、主家の桐）
// 先手の諸将は自家の旗で寄せる（一柳の釘抜・山内の丸に三つ柏・堀の旗。textures。豊臣の旗だけで揃えない）
const ICHI = { flag: 'kuginuki' }, YAMA = { flag: 'kashiwa' }, HORI = { flag: 'hori' };

const NAT = (x, z) => (demSample(DEM, x, z) - 100) * 0.6;
function kuruwaH(x, z, h) {
  for (const k of Object.values(KURUWA)) {
    const [d, px, pz] = kNear(k, x, z);
    if (d > k.r + 10) continue;
    const top = NAT(px, pz) + k.up;
    h += (top - h) * (1 - sstep(k.r, k.r + 10, d));
    // 縁の内に盛った土塁（幅 7m ほど・上は丸い）。虎口の所は切る
    if (k.rim && d > k.r - 7.5 && d < k.r + 0.5) {
      let g = 1;
      for (const [gx, gz] of k.gaps || []) g = Math.min(g, sstep(4, 8, Math.hypot(x - gx, z - gz)));
      const u = (d - (k.r - 3.5)) / 3.8;
      if (u > -1 && u < 1) h += k.rim * (1 - u * u) * g;
    }
  }
  return h;
}
function shojiH(x, z, S = SHOJI) {
  if (x < S.x0 - 3 || x > S.x1 + 3 || z < S.z0 - 3 || z > S.z1 + 3) return 0;
  const ex = Math.min(x - S.x0, S.x1 - x), ez = Math.min(z - S.z0, S.z1 - z);
  let edge = sstep(-3, 1.2, Math.min(ex, ez));           // 法（のり）は急
  // 土橋（gap）：掘り残した土の道
  if (S.gap) { const u = S.alongZ ? z : x; edge *= 1 - Math.min(sstep(S.gap[0] - 2.5, S.gap[0] + 0.5, u), 1 - sstep(S.gap[1] - 0.5, S.gap[1] + 2.5, u)); }
  let dig = S.depth * edge;
  // 縦の畝（南北の筋）と横の畝（東西の中ほど）：上は堀の縁から 0.8m 下
  //   alongZ の堀（南北に長い）は、畝の向きを入れ替える。畝堀（une）は堀を横切る畝だけ
  const q = (((S.alongZ ? z : x) - S.cx) % S.cell + S.cell) % S.cell, dv = Math.min(q, S.cell - q);
  const v = S.alongZ ? x : z, mid = S.alongZ ? (S.x0 + S.x1) / 2 : (S.z0 + S.z1) / 2;
  const qh = ((v - mid) % S.cell + S.cell) % S.cell;
  const dh = S.une ? 99 : Math.min(qh, S.cell - qh);
  const rib = Math.max(1 - sstep(S.rib, S.rib + 0.6, dv), 1 - sstep(S.rib, S.rib + 0.6, dh));
  dig -= rib * (S.depth - 0.8) * edge;
  return -Math.max(0, dig);
}
const inShoji = (x, z, pad = 0, S = SHOJI) => x > S.x0 - pad && x < S.x1 + pad && z > S.z0 - pad && z < S.z1 + pad;
function height0(x, z) {
  let h = kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  for (const S of ALL_HORI) h += shojiH(x, z, S);
  return h;
}
// 二の丸の虎口から本丸の虎口へ上る坂（畝堀の土橋の上）。切岸の段（8m で 6m 上がる）を、登れる坂にならす
const RAMP = { x: 22, w: 3.5, z0: -66, z1: -92 };
function height(x, z) {
  const h = height0(x, z), dx = Math.abs(x - RAMP.x);
  if (dx > RAMP.w + 3 || z > RAMP.z0 || z < RAMP.z1) return h;
  const t = (RAMP.z0 - z) / (RAMP.z0 - RAMP.z1), a = height0(RAMP.x, RAMP.z0), b = height0(RAMP.x, RAMP.z1);
  const k = 1 - sstep(RAMP.w, RAMP.w + 3, dx);
  return h + (a + (b - a) * t - h) * k;
}
// 障子堀の畝の形（地面の格子は 3.3m で細い畝を描けないので、畝の土の背を形で足す。見た目だけ・一つの形にまとめて一回で描く）
//   畝ごとに、上が細く裾の広い土の背（台形の断面）を、堀の縁の高さに沿って続ける。色は関東ローム（赤みの土）
function shojiRibs(rt) {
  const pos = [], col = [], uvs = [], idx = [];
  const rim = (x, z) => kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  // 三島市の発掘記録（docs/battle_refs/t09_yamanaka.md）に沿う、まっすぐな畝と丸い背。
  //   断面を左右対称に揃え、頂点ごとの揺れで尖った塊を作らない。土の絵（bankTex）を張り、色は赤い関東ローム、
  //   底ほど湿って暗く、背は乾いて明るい（平らな茶色の板に見せない）
  const PROF = [[-1, 0], [-0.62, 0.34], [-0.34, 0.74], [-0.12, 0.97], [0.12, 0.97], [0.34, 0.74], [0.62, 0.34], [1, 0]];
  const hz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const rib = (ax, az, bx, bz, wTop, wBot, tone, depth) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
    const nx = -(bz - az) / L, nz = (bx - ax) / L, NP = PROF.length;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = rim(x, z) - 0.8, bot = rim(x, z) - depth - 0.1;
      let v = 0, px = 0, py = 0;
      for (let k = 0; k < NP; k++) {
        const [f, hgt] = PROF[k], edge = k === 0 || k === NP - 1;
        const half = Math.abs(f) <= 0.12 ? wTop * 0.6 : wTop + (wBot - wTop) * (1 - hgt);
        const off = Math.sign(f) * half, y = bot + (top - bot) * hgt;
        if (k) v += Math.hypot(off - px, y - py) / 3; px = off; py = y;
        pos.push(x + nx * off, y, z + nz * off); uvs.push(L * t / 3 + tone * 0.37, v);
        // 色：底は湿った濃い赤土、背は乾いて白っぽく、ところどころ枯れ草の黄
        // 11/8 critic60 山中 23：切岸の上が白っぽいのっぺりした板に見えた。乾いた背の明るみを抑え、関東ロームの赤土の色に寄せる
        const wet = 1 - hgt, r1 = hz(i * 3 + k, tone + 1), dry = hgt > 0.9 ? 0.05 : 0;
        let c = [1.16 - wet * 0.26 + dry, 0.8 - wet * 0.22 + dry * 0.9, 0.58 - wet * 0.18 + dry * 0.7];
        if (hgt > 0.3 && r1 > 0.78) c = [c[0] * 0.92, c[1] * 1.0, c[2] * 0.72];
        const k2 = 0.9 + r1 * 0.18; col.push(c[0] * k2, c[1] * k2, c[2] * k2);
      }
      if (i < n) {
        const a = base + i * NP, b = a + NP;
        for (let p = 0; p < NP - 1; p++) idx.push(a + p, a + p + 1, b + p, a + p + 1, b + p + 1, b + p);
      }
    }
  };
  let tone = 0;
  for (const S of ALL_HORI) {
    const [u0, u1, v0, v1] = S.alongZ ? [S.z0, S.z1, S.x0, S.x1] : [S.x0, S.x1, S.z0, S.z1];
    const P = (u, v) => (S.alongZ ? [v, u] : [u, v]);
    const wT = S.rib * 0.9, wB = S.rib + 1.5, G = S.gap;
    for (let u = S.cx + Math.ceil((u0 + 0.8 - S.cx) / S.cell) * S.cell; u < u1 - 0.8; u += S.cell) {
      if (G && u > G[0] - 2.5 && u < G[1] + 2.5) continue;
      rib(...P(u, v0 + 0.8), ...P(u, v1 - 0.8), wT, wB, tone++, S.depth);
    }
    if (S.une) continue;
    const vm = (v0 + v1) / 2;
    for (let v = vm + Math.ceil((v0 + 0.8 - vm) / S.cell) * S.cell; v < v1 - 0.8; v += S.cell)
      rib(...P(u0 + 0.8, v), ...P(u1 - 0.8, v), wT, wB, tone++, S.depth);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: bankTex(), side: THREE.DoubleSide }));
  m.receiveShadow = true;
  rt.scene.add(m);
  return m;
}
// 北条の板の櫓（天守櫓・西櫓）：土の高まりに建つ板壁・板葺の櫓。漆喰も瓦も石垣も無い（戦国の関東の土の城）。
//   各面に狭間（黒い小窓）。floors は一重か二重。形を一つにまとめて一回で描く
function itaYagura(rt, x, z, o = {}) {
  const { w = 6, d = 5, floors = 2, rot = 0 } = o, parts = [], y0 = rt.world.heightAt(x, z);
  const box = (bw, bh, bd, px, py, pz, col) => {
    const g = new THREE.BoxGeometry(bw, bh, bd); g.translate(px, py, pz);
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = 0.92 + ((i * 7) % 5) * 0.03; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g);
  };
  const roof = (rw, rd, py, rh) => {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(rw, rh, rd); g.translate(0, py + rh / 2, 0);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const c = new THREE.Color(0x5b5448), a = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(ng);
  };
  box(w + 0.8, 0.8, d + 0.8, 0, -0.5, 0, 0x5a4a38);            // 足もとの土の基壇（踏み固めた土）。大きな茶色の箱に見えた（山中 23）ので低く小さく
  let y = 0.2, cw = w, cd = d;
  for (let f = 0; f < floors; f++) {
    const h = f ? 2.6 : 3.4;
    box(cw, h, cd, 0, y + h / 2, 0, 0x4b4034);                  // 板壁（褪せた黒茶）
    for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t++) {   // 狭間：各面に三つ
      box(0.32, 0.36, 0.06, t * cw * 0.3, y + h * 0.55, s * (cd / 2 + 0.03), 0x0c0a08);
      box(0.06, 0.36, 0.32, s * (cw / 2 + 0.03), y + h * 0.55, t * cd * 0.3, 0x0c0a08);
    }
    y += h;
    if (f < floors - 1) { roof(cw + 1.6, cd + 1.6, y - 0.1, 0.9); cw *= 0.66; cd *= 0.66; y += 0.35; }
  }
  roof(cw + 1.8, cd + 1.8, y - 0.1, Math.max(1.6, cw * 0.38));  // 板葺の寄棟（浅い四方の屋根）
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.position.set(x, y0, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true;
  solidRect(x, z, w + 0.6, d + 0.6, rot);
  rt.scene.add(m);
  return m;
}
const nearKuruwa =(x, z, pad) => Object.values(KURUWA).some((k) => kNear(k, x, z)[0] < k.r + pad);

const t09_yamanaka = {
  resumeSteps: [[1, 'dai'], [2, 'shoji'], [3, 'ote'], [4, 'honmaru']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  minutes: 15, expectMin: 15,
  playerTaken: 0.18, playerRegen: 0.07,   // 15分の長い攻め（出丸の矢と鉄砲の前で倒れ続けた。11/8 bot）
  // 始まりの札の二三行（critic60 山中 34「七万対四千がこの戦の芯なのに札では分からない」）
  introText: '豊臣のおよそ七万が、北条のおよそ四千の守る山中城へ攻め上る。岱崎出丸の鉄砲と障子堀を越え、三の丸から本丸の松田康長の旗本へ。',
  // 見出しは大きな出来事だけ（指示の見出しは出さない。標準 五の1）
  bannerAllowed: (rt, t) => ['一柳直末、撃たれる', '間宮康俊、討ち死に', '山中城、落つ', '先手が崩れた'].includes(t),
  lethal: { soft: true },   // 命懸けの戦場（11/9 係A：bot が倒れるので soft）
  noFrontFill: true,          // 城の外の思わぬ所に作りの乱戦を置かない（敵は城の中・味方は街道の坂。kaito AP 10）
  frontlineDensity: false,    // 数人の物見の組を湧かせない（kaito AW 6）
  goalSignOnly: true,         // 行き先は頭上の金の▼一つ（旗の印・輪・枠を重ねない。kaito AL・AV 15）
  goalsAllRows: true,         // ①〜⑤を始めから並べる（共通画面の既定では今の一件だけになる）。
  goalSignTriangle: true,
  goalSignNoEdge: true,      // 画面外の行き先を縁へ張り付けたり、方向矢印へ替えたりしない。
  actionGuideTarget: () => null,
  missionSignTarget: () => null, // 敵の頭上の赤い▼以外の選択印を付けない。
  noLeaderFollow: true,   // 行き先は目標の印一つだけ（ついていく相手の青い印を重ねない。kaito AV 15）
  goalSignNoLabel: false,    // 行き先には曲輪と門の名を残す。
  goalSignTarget(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending) return null;
    if (!F.step) { SIGN.x = shutsujin.LINE.x; SIGN.z = shutsujin.LINE.z; SIGN.label = '先手の列'; return SIGN; }
    let x, z, label;
    if (F.step === 1) { x = KURUWA.dai.x; z = KURUWA.dai.z; label = '岱崎出丸'; }
    else if (F.step === 2) { x = CROSS_X; z = SHOJI.z0 - 5; label = '障子堀'; }
    else if (F.step === 3) { const a = F.gateOpen ? SP.at.plaza : F.sub === 'back' ? SP.at.gate : SP.at.mouths[1].far; x = a.x; z = a.z; label = F.gateOpen ? '三の丸' : F.sub === 'back' ? '大手門' : '馬出し'; }
    else {
      if (F.signRoute == null) F.signRoute = 2;
      let i = F.signRoute;
      while (i < UP_ROUTE.length - 1 && Math.hypot(p.x - UP_ROUTE[i][0], p.z - UP_ROUTE[i][1]) < 7) i++;
      F.signRoute = i; [x, z] = UP_ROUTE[i];
      label = i < 4 ? '三の丸' : i < 6 ? '二の丸' : i < 8 ? '本丸の土橋' : '本丸';
    }
    SIGN.x = x; SIGN.z = z; SIGN.label = label; return SIGN;
  },
  meleeGuide: () => false,   // 「敵をたおせ」の札と敵を指す矢印は出さない。敵は頭上の▼で分かる（BH6）
  // 布陣図の地名（docs/fujin/t09_yamanaka.md）
  introMapPlaces: [{ x: -46, z: 196, name: '岱崎出丸' }, { x: 10, z: 120, name: '障子堀' }, { x: 25, z: -128, name: '本丸' }],
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    // 人の背の何倍もある切岸（54°より急な所）には兵も主人公も立たない（critic60 山中 21「崖に兵が張り付いて宙に立つ」）。道と坂は通れる
    climbTan: 1.4,
    // 11/8 critic60 山中 29：斬り合いで片足を高く上げた跳ねた形のまま止まって見えた。急な坂で腿を上げすぎないよう歩幅の上限を抑える
    strideLimit: 0.85,
    seed: 15900,
    restrainedFaces: true,
    // 格子は 480m を 144 に割る（3.33m。障子堀の渡る畝 x=10 が格子の線に乗る）。出丸の前から始められるように広げた
    groundHalf: 240,
    moveLim: 236,
    time: 'day',
    mist: true,
    // 11/8 critic60 山中 38：霧の中の光の筋（shafts）が遠くの山に雨のような縦の帯に見えた。この戦は光の筋を立てない
    noShafts: true,
    mood: 'plain',   // 霧は朝の初めだけ（昼も朝霧の厚い層が白い平らな丘・雪に見えた。同 38）
    muddy: 0.25,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 堀の底と法は関東ローム（赤みの土）、曲輪は踏まれた草地、道は土
      if (ALL_HORI.some((S) => inShoji(x, z, 1, S)) || (Math.abs(x - SP.x) < SP.W + 6 && z > SP.z + SP.mIn - 1 && z < SP.z + SP.mOut + 1)) c.lerp({ r: 0.46, g: 0.3, b: 0.2 }, 0.75);
      else if (distToPolyline(x, z, ROAD) < 4) c.lerp({ r: 0.48, g: 0.4, b: 0.3 }, 0.45);
      else if (nearKuruwa(x, z, 2)) c.setRGB(c.r * 0.92, c.g * 0.97, c.b * 0.86);
      else c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.78);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || nearKuruwa(x, z, 8) || ALL_HORI.some((S) => inShoji(x, z, 8, S)) || (Math.abs(x - SP.x) < SP.W + 10 && z > SP.z - 8 && z < SP.z + SP.mOut + 12) || Math.hypot(x - START.x, z - START.z) < 30,
    trees: 900,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 18 ? 0.15 : 1),
    groves: [{ x: -110, z: 60, r: 16, n: 18 }, { x: 110, z: -20, r: 16, n: 18 }, { x: -90, z: -120, r: 14, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -175,
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    const D = KURUWA.dai, HN = KURUWA.hon, NS = KURUWA.nishi;
    // ---- 岱崎出丸の柵（南と東へ向く。柵の内から間宮の鉄砲が撃つ。煙と弾は下の城攻めの部品が出す） ----
    F.daiWall = wallLine(rt, [[D.x - 16, D.z + 14], [D.x + 4, D.z + 18], [D.x + 18, D.z + 6], [D.x + 18, D.z - 10]], { team: 1, hp: 300, name: '出丸の柵', segLen: 8 });
    for (const s of F.daiWall) { s.noClimb = true; s.bodyPadding = 0.3; }
    // ---- 三の丸の大手（角馬出し・枡形・横矢・畝堀・狭間からの鉄砲）。出丸の柵からも撃つ（近づくほど弾が降る。kaito BA 5） ----
    F.K = buildSiege(rt, SP, { team: 1, earth: true, wall: 'saku', umadashiWall: 'saku', wallHp: 520, gateHp: 460, masuHp: 600,
      fire: { hurt: () => (rt.flags.step === 1 ? 0.004 : 0.03), near: 90, close: 18, base: 0.8, peak: 4, rain: 0.3 },   // 寄せ手も撃たれて倒れるが、柵に着く前に一隊が消えない強さ
      extraWalls: [{ structs: F.daiWall, inside: { x: D.x - 2, z: D.z } }] });
    shojiRibs(rt);
    // ---- 城の建物（北条の土の城：板の櫓と柵だけ。天守閣は無く、本丸の北西の高まりに天守櫓） ----
    itaYagura(rt, HN.x - 9, HN.z - 9, { w: 6.4, d: 5.4, floors: 2, rot: 0.2 });   // 天守櫓
    // 本丸の土塁の内に柵を巡らせ、南の虎口だけ開ける。進む土橋を塞がない。
    F.honWall = wallLine(rt, [[20, -87], [9, -94], [7, -113], [20, -123], [39, -118], [43, -103], [35, -89], [28, -87]], { team: 1, hp: 400, name: '本丸の柵', segLen: 6 });
    // 二の丸の虎口は開け、左右の柵の内から登り道へ横矢を掛ける。
    F.niWall = wallLine(rt, [[-1, -30], [8, -25]], { team: 1, hp: 300, name: '二の丸の柵', segLen: 5 });
    F.niWall.push(...wallLine(rt, [[24, -25], [33, -30]], { team: 1, hp: 300, name: '二の丸の柵', segLen: 5 }));
    for (const s of [...F.niWall, ...F.honWall]) { s.noClimb = true; s.bodyPadding = 0.3; }
    rt.scene.add(kabukimon(W, 24, -87, 8));
    itaYagura(rt, 32, -90, { w: 4, d: 3.5, floors: 1 });
    itaYagura(rt, NS.x - 6, NS.z + 4, { w: 5, d: 4.2, floors: 1, rot: -0.3 });        // 西櫓
    itaYagura(rt, KURUWA.ni.x - 12, KURUWA.ni.z - 6, { w: 5, d: 4.2, floors: 1 });     // 元西櫓
    rt.scene.add(yagura(W, -48, 204, { kind: 'ro', rot: Math.PI }));                 // 出丸の先の物見
    // 出丸の西の縁の土塁の上の柵（見せるだけ）
    for (const [ax, az, bx, bz] of [[-61, 206, -62, 184], [-62, 184, -61, 162], [-61, 162, -57, 142]]) rt.scene.add(palisade(W, [ax, az, bx, bz], { lightFence: true }));
    // 右上の地図に出す城の印（出丸・三の丸の大手・本丸。kaito AQ 7）
    addSite(rt, 'fort', D.x, D.z, '岱崎出丸'); addSite(rt, 'castle', SP.x, SP.z, '三の丸'); addSite(rt, 'castle', HN.x, HN.z, '本丸');
    // ---- 旗と陣（北条と豊臣の旗だけ） ----
    for (const [x, z] of [[D.x - 6, D.z - 8], [D.x + 10, D.z - 4]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
    for (const [x, z] of [[SP.x - 20, SP.z - 8], [SP.x + 20, SP.z - 8], [KURUWA.ni.x - 10, KURUWA.ni.z], [HN.x - 8, HN.z + 6], [HN.x + 10, HN.z - 6]]) rt.scene.add(nobori(W, x, z, 'hojo', 6));
    rt.scene.add(jinmaku(W, HN.x, HN.z - 10, 14, 9, 5.5, { mon: 'hojo' }));
    rt.scene.add(tawara(W, HN.x - 9, HN.z - 4, 0.3, 3));
    for (const [x, z] of [[SP.x - 4, SP.z - 6], [SP.x + 5, SP.z - 10]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: 0.6 }); }
    // ---- 豊臣方の先手：街道の坂の下に、隊ごとの塊で並ぶ（一柳・中村は街道の西、堀秀政は東の尾根）。本物の兵 ----
    F.ichi = allyGroup(rt, { name: '一柳直末の隊', fullStrength: true, anchor: { x: 2, z: 204 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '一柳直末', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24, horo: 0xb8962a, mon: 'kuginuki' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 8 }], ICHI));   // 一柳は秀吉の黄母衣衆
    F.naka = allyGroup(rt, { name: '中村一氏の隊', fullStrength: true, anchor: { x: 30, z: 202 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '中村一氏', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '渡辺勘兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], TOYO));
    F.hori = allyGroup(rt, { name: '堀秀政の隊', fullStrength: true, anchor: { x: 66, z: 188 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], HORI));   // 姿は units_data の堀秀政
    F.toyo = [F.ichi, F.naka, F.hori];
    for (const g of F.toyo) { g.defMult = 1.2; g.dmgMult = 0.85; }
    // 山内一豊の隊（秀次の先手の一つ。史実：中村・一柳と並んで攻め上った）。一柳の隊の後ろに続く二陣
    F.yama = allyGroup(rt, { name: '山内一豊の隊', fullStrength: true, anchor: { x: -4, z: 220 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, hat: 'kabuto_w', haori: 0x33302a, mon: 'kashiwa' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }], YAMA));
    F.toyo.push(F.yama);
    F.yama.defMult = 1.2; F.yama.dmgMult = 0.85;
    // 大将の豊臣秀次は街道の後ろの本陣の陣幕の中で床几に座り、旗本に囲まれて動かない（前に出ない。kaito AR 3・標準 一の2）
    F.hide = allyGroup(rt, { name: '秀次の旗本', fullStrength: true, anchor: { x: SEAT.x, z: SEAT.z - 7 }, facing: Math.PI, width: 9, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', formation: 'line' },
      dress([{ type: 'samurai', n: 12 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], TOYO));
    F.hideS = allyGroup(rt, { name: '秀次の本陣', fullStrength: true, anchor: SEAT, facing: Math.PI, width: 2, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([{ type: 'busho', n: 1, o: { name: '豊臣秀次', invuln: true, hat: 'kabuto_w', horse: false } }], TOYO));
    for (const u of F.hideS.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z - 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };
    }
    rt.scene.add(jinmaku(W, SEAT.x, SEAT.z, 16, 10, 3, { mon: 'toyotomi' }));
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, Math.PI, { gunbai: true }));
    // 白地の幟が六尺の竿の上で木と同じ高さの白い板に見えた（critic60 山中 41）。人の背の倍ほどの丈へ
    for (const [x, z] of [[34, 226], [54, 226], [START.x - 14, START.z + 10]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 4));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    // 秀次の後ろに続く七万の本隊は、街道の坂のずっと下（動ける所の外・近づけない遠さ）にだけ置く
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, farFill: true, armor: 0x2b2723, team: 0, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', seed });
    // 外の尾根にも後続を残す。近くでは本物の兵だけを描く共通の距離制限を保つ。
    F.host = [DA(16, 340, 100, 50, 700, Math.PI, 15901), DA(-60, 320, 65, 40, 500, Math.PI * 0.9, 15902),
      DA(310, 150, 45, 90, 600, Math.PI, 15903), DA(-310, 80, 45, 100, 600, Math.PI, 15904),
      DA(310, -80, 45, 100, 600, Math.PI, 15905)];
    for (const g of F.host) if (g && g.army) g.army.noWake = true;
    // 段が進むごとに、遠くの本隊も街道の坂を城へ詰める（標準 十二の2。動ける所の外のまま）
    F.hostUp = (d, secs) => { for (const g of F.host) if (g && g.advance) g.advance(d, secs); };
    // ---- 岱崎出丸の間宮康俊の隊（数百。柵の内に鉄砲、後ろに槍と騎馬） ----
    F.dai = enemyGroup(rt, { faction: 'hojo', name: '間宮康俊の隊', anchor: { x: D.x + 6, z: D.z }, facing: 0.8, order: 'hold', aggro: 20, width: 12, morale: 95, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.3 },
      dress([{ type: 'busho', n: 1, o: { name: '間宮康俊', hat: 'kabuto_m', haori: 0x4a3a28 } }, { type: 'gun', n: 16 }, { type: 'ashigaru', n: 28 + more(rt, 0.3) }, { type: 'samurai', n: 5 }, { type: 'cavalry', n: 3 }], HOJO));   // 騎馬は三騎（八騎の当たりで出丸の前で倒れ続けた。11/8 bot）
    for (const u of F.dai.units) if (u.type === 'gun') u.dmg *= 0.12;   // 15分の構成：出丸の鉄砲で倒れ続けた（11/8 bot）
    // 寄せ手の竹束（critic60 山中 7「竹束は一つも無い」）：出丸の鉄砲に向けて、街道の坂の上り口に横へ並べる。玉と矢を本当に止める
    {
      const vx = START.x - D.x, vz = START.z - D.z, L = Math.hypot(vx, vz) || 1, ux = vx / L, uz = vz / L;
      const rot = Math.atan2(-ux, -uz);
      for (let k = -3; k <= 3; k++) {
        const x = D.x + ux * 30 - uz * k * 3.2, z = D.z + uz * 30 + ux * k * 3.2;
        if (rt.world.walkable && !rt.world.walkable(x, z, rt.world.heightAt(x, z))) continue;
        addTaba(rt, x, z, 0, { rot, fixed: true });
      }
    }
    F.daiN = F.dai.units.length;
    F.dai.noRout = true;   // 出丸は手勢を討ち取る目標。間宮の最期の後も敗走だけで完了にしない。
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：岱崎出丸 → 障子堀 → 三の丸の虎口 → 二の丸 → 本丸。
    //   段の守りは段に入ってから出て来るので、組は getter で渡す。今の段の守りだけが打って出て、奥は持ち場で構えて待つ
    const alive = (...gs) => gs.filter((g) => g && g.count > 0 && !g.routed);
    F.stages = siegeStages(rt, [
      { get groups() { return alive(F.dai); }, done: () => F.step >= 2, report: '岱崎出丸の鉄砲、まだ止みませぬ！', reportAfter: 200 },
      { get groups() { return alive(F.pit, F.rim); }, done: () => F.step >= 3, report: '障子堀の畝で、味方が足を取られております！', reportAfter: 70 },
      { get groups() { return alive(F.uma, F.san); }, done: () => F.step >= 4, report: '三の丸の虎口、まだ破れず！', reportAfter: 70 },
      { get groups() { return alive(F.ni); }, done: () => !alive(F.ni).length || F.ni.count < (F.ni._stN || 1) * 0.4, report: '二の丸の守り、しぶとく粘っております！', reportAfter: 70 },
      { get groups() { return alive(F.hon, F.kogo); }, done: () => false },
    ], { runner: '使番' });

    W.setTime('day');
    rt.setPhase('brief');
    // 戦の前の会話（待つ目標は出さない。始めから出丸へ寄る。kaito AZ・BA 3）
    rt.say('豊臣秀次', '今日のうちに山中を揉み落とす。先手は岱崎出丸へ掛かれ', 4.5);
    rt.after(4.8, () => rt.say('一柳直末', '北条の鉄砲は多いぞ。出丸の前で足を止めるな', 4));
    rt.after(9.2, () => rt.say('堀秀政', '我らは東の尾根から三の丸の横へ回る。挟んで落とすぞ', 3.5));
    // 出陣（段0）：諸将の旗と山中城を見上げ、先手の列へ。少しして出丸攻め（t09_yamanaka/shutsujin.js）
    tahoumen.install(rt);
    shoshou.install(rt);
    shutsujin.install(rt, {});
  },

  // ① 岱崎出丸の東の柵を破り、間宮康俊の隊を討つ
  dai(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('dai');
    sfx('horagai', 0.8);
    rt.obj('main', '出丸の柵を破り、間宮康俊の手勢二百を討ち取る', 'main');
    const D = KURUWA.dai;
    rt.marker('dai', centerOf(F.dai), '間宮康俊', { red: true, group: F.dai });
    // 先手は柵の前へ寄り、柵を打ち破って出丸へ斬り込む（柵の向こうの敵を追って立ち往生しない）
    const inside = { x: D.x, z: D.z };
    // 破れ口の少し内側まで進んでから城内へ向かう。残った柵を全部壊すまで足止めしない。
    const mouths = F.daiWall.map((s) => {
      const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      const dx = D.x - x, dz = D.z - z, d = Math.hypot(dx, dz) || 1;
      return { s, x: x + dx / d * 3, z: z + dz / d * 3, dx, dz };
    });
    const fence = (u) => {
      let best = null, bd = Infinity, mouth = null, md = Infinity;
      for (const m of mouths) {
        const s = m.s, d = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
        if (s.alive === false || s.hp <= 0) { if (d < md) { md = d; mouth = m; } }
        else if (d < bd) { bd = d; best = s; }
      }
      if (mouth) return (u.pos.x - mouth.x) * mouth.dx + (u.pos.z - mouth.z) * mouth.dz >= 0 ? inside : mouth;
      return best && bd < 40 ? best : inside;
    };
    // 全員の整列を待つと、柵に阻まれた後列が着けず攻撃へ移れない。先頭から柵を攻める。
    const go = (g, x, z) => { g.formation = 'column'; g.colW = 3; g.order = 'assault'; g.assault = fence; g.anchor = { x, z }; g.speed = 3; g.onArrive = null; };
    go(F.ichi, D.x + 26, D.z + 4); go(F.naka, D.x + 34, D.z - 4);  // 出丸の東の土橋の口へ
    // 二陣まで柵に押し込まず、出丸を抜いた後に障子堀へ続く兵を残す。
    const reserve = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 3; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x, z }; }; };
    reserve(F.yama, 12, 194);
    // 堀の手を、到着後に出丸の柵へ引き返させない。
    reserve(F.hori, SHOJI.x1 + 22, SHOJI.z1 + 18);
  },

  // ② 障子堀の畝の上を渡る
  shoji(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('shoji'); rt.unmark('dai');
    tahoumen.step(rt, 2);
    if (!gone(F.dai)) { F.dai.noRout = false; F.dai.morale = 0; }
    rt.award((t) => t.side.push('岱崎出丸を抜いた'), '岱崎出丸を抜いた');
    rt.obj('main', '障子堀を畝の上で渡る', 'main');
    F.hostUp(18, 30);
    rt.say('中村一氏', '堀へ落ちれば這い上がれぬ。畝から足を外すな', 4);
    // 堀の底に潜む槍（落ちた者を下から突く）と、向こうの縁の鉄砲
    const mz = (SHOJI.z0 + SHOJI.z1) / 2;
    F.pit = enemyGroup(rt, { faction: 'hojo', name: '堀の底の槍', anchor: { x: CROSS_X + 9, z: mz + 4 }, facing: 0, order: 'hold', aggro: 7, width: 10, morale: 80, ambush: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.35 },
      dress([{ type: 'ashigaru', n: 8 + more(rt, 0.3) }], HOJO));
    F.rim = enemyGroup(rt, { faction: 'hojo', name: '堀の縁の鉄砲', anchor: { x: CROSS_X + 4, z: SHOJI.z0 - 6 }, facing: 0, order: 'hold', aggro: 10, width: 16, morale: 85, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 8 }], HOJO));
    for (const u of F.rim.units) if (u.type === 'gun') u.dmg *= 0.45;
    F.cross = { x: CROSS_X, z: SHOJI.z0 - 5 };
    rt.marker('cross', F.cross, '障子堀', { h: 2 });
    // 対岸の柵の内から、畝へ詰めた寄せ手を鉄砲と矢で狙う。兵は増やさない。
    F.rimWall = wallLine(rt, [[-4, SHOJI.z0 - 3], [7, SHOJI.z0 - 3], [13, SHOJI.z0 - 3], [28, SHOJI.z0 - 3]], { team: 1, hp: 180, name: '障子堀の柵', gaps: [2], segLen: 6 });
    for (const s of F.rimWall) { s.noClimb = true; s.bodyPadding = 0.3; }
    F.rimFire = makeSamaFire(rt, [{ structs: F.rimWall, inside: { x: 10, z: SHOJI.z0 - 12 } }], { heads: false, near: 70, close: 15, base: 1.2, peak: 5, arrows: 0.45, hurt: 0.25, rain: 0.6 });
    const path = (g, dx) => {
      if (gone(g)) return;
      g.formation = 'column'; g.colW = 1; g.march = false; g.order = 'path';
      // 出丸から北東へ直進すると、脇の畝堀へ斜めに落ちる。西の先手だけ土橋へ戻して渡す。
      // 東の二陣は戻さず、それぞれの畝へ続く。
      const c = g.center();
      g.path = c.x < -11 ? [[Math.min(c.x, -32), 176], [-6, 176]] : [];
      g.path.push([CROSS_X + dx, SHOJI.z1 + 10], [CROSS_X + dx, SHOJI.z0 - 5]);
      g.pathIdx = 0; g.speed = 3;
      g.onArrive = (q) => { q.order = 'assault'; q.assault = () => F.rimWall.find((s) => s.alive !== false) || F.cross; q.seekRange = 30; };
    };
    path(F.ichi, -SHOJI.cell); path(F.naka, SHOJI.cell); if (!gone(F.yama)) path(F.yama, 0);
    if (!gone(F.hori)) path(F.hori, SHOJI.cell * 4);
  },

  // ③ 三の丸の大手：馬出しへ寄せる → 打って出た北条の隊を迎え撃つ → 退く兵に続いて大手門から入る（付け入り。docs/kaito_refs_1103 の ref04〜07）
  ote(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.sub = 'yose';
    // 堀を渡り切った所で一息（11/9 bot：堀の縁の鉄砲で削られたまま馬出しの突き出しに当たり、三度倒れた）
    { const u = rt.player.u; if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.6); }
    rt.setPhase('koguchi'); rt.unmark('cross');
    tahoumen.step(rt, 3);
    for (const g of [F.pit, F.rim]) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    rt.award((t) => t.side.push('障子堀を渡った'), '障子堀を渡った');
    rt.obj('main', '馬出しから出た北条の隊を迎え撃つ', 'main');
    F.hostUp(18, 30);
    // 北条氏勝の手（玉縄の援兵）は、間宮の勧めで出丸の戦の前に城を落ちている（間宮が「氏勝殿も直元も落とした」と言う）。
    //   障子堀の後に退く隊として出すと、退いた人の名札が本丸の前に残り、話の順も逆になった（critic60 山中 10）。ここでは出さない
    const A = SP.at, M = A.mouths;
    // 馬出しに詰める北条の隊（騎馬と槍）。寄せ手が来ると脇の口から打って出て、一柳の隊の横を突く
    F.uma = enemyGroup(rt, { faction: 'hojo', name: '馬出しの北条の隊', fixed: true, formation: 'yari', anchor: { ...A.uma }, facing: 0, width: 6, aggro: 4, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.4 },
      dress([{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 5 }, { type: 'ashigaru', n: 16 }], HOJO));
    F.uma.historicalOrders = true;
    F.san = enemyGroup(rt, { faction: 'hojo', name: '三の丸の守り', anchor: { ...A.plaza }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.42 },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], HOJO));
    for (const u of F.san.units) if (u.type === 'gun') u.dmg *= 0.5;
    F.sortie = F.K.sortie(F.uma, { fight: 18, mouth: 1, R: 12,
      strike: () => { const g = gone(F.ichi) ? F.naka : F.ichi, c = g.center(); return { x: c.x, z: c.z }; },
      when: (r) => { const u = r.player.u; return r.flags.step === 3 && r.t - r.flags.stepT > 10 && u.alive && Math.hypot(u.pos.x - A.uma.x, u.pos.z - A.uma.z) < 46; },
      onOut: (r) => this.sally(r), onBack: (r) => this.sallyBack(r), onTsukeiri: (r) => this.openGate(r, true) });
    rt.marker('ote', { x: M[1].far.x, z: M[1].far.z }, '馬出し', { h: 3 });
    // 寄せ手は馬出しの左右の口の前へ（大手を攻める）
    const go = (g, P) => { if (gone(g)) return; g.formation = 'column'; g.colW = 2; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.speed = 3; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.anchor = { x: P.x, z: P.z }; }; };
    go(F.ichi, M[1].far); go(F.naka, M[0].far); go(F.yama, { x: M[1].far.x + 4, z: M[1].far.z + 8 });go(F.hori, { x: SP.x + 34, z: SP.z + 26 });
    rt.after(8, () => { if (F.step === 3) rt.say('渡辺勘兵衛', '一番乗りは、この勘兵衛がもらう！', 3.5); });
  },
  sally(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.sub !== 'yose') return;
    F.sub = 'sally';
    rt.unmark('ote');
    rt.marker('uma', centerOf(F.uma), '馬出しの北条の隊', { red: true, group: F.uma });
    rt.say(F.ichiShot ? '一柳直盛' : '一柳直末', '横から来たぞ！　槍を揃えて受け止めよ！', 3.5);   // 直末が撃たれた時だけ、弟が隊を率いる。
    // 馬出しへ寄る下知を打ち切る。到着処理が残ると、迎撃中も行軍用の持ち場補正が働く。
    for (const g of F.toyo) if (!gone(g)) { g.onArrive = null; g.order = 'attack'; g.seekRange = 34; }
  },
  sallyBack(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.gateOpen || F.sub === 'back') return;
    F.sub = 'back'; F.backT = rt.t; F.gatePress = 0;
    rt.unmark('uma');
    rt.obj('main', '退く兵に続いて大手門から入る', 'main');
    rt.marker('gate', { ...SP.at.gate }, '大手門', { red: true, h: 3 });
    rt.say('中村一氏', '退くぞ！　門を閉めさせるな。続いて入れ！', 3.5);
    // 寄せ手は退く兵の後ろについて、馬出しの口から土橋・門へ
    const A = SP.at, M = A.mouths[1];
    const pts = [[M.lane.x, M.lane.z], [M.outer.x, M.outer.z], [M.inner.x, M.inner.z], [A.uma.x, A.uma.z], [A.bridgeOut.x, A.bridgeOut.z], [A.gateOut.x, A.gateOut.z]];
    for (const g of F.toyo) if (!gone(g)) { g.order = 'path'; g.path = pts.map((p) => p.slice()); g.pathIdx = 0; g.speed = 2.8; g.onArrive = (q) => { q.order = 'assault'; q.assault = () => { const s = F.K.gate && F.K.gate.struct; return s && s.alive && !s.opened ? s : A.plaza; }; }; }
  },
  openGate(rt, tsuke) {
    const F = rt.flags;
    if (F.gateOpen) return;
    F.gateOpen = true; F.gateOpenT = rt.t;
    for (const G of [F.K.gate, F.K.masu && F.K.masu.inner]) if (G && G.struct && G.struct.alive !== false) { G.struct.opened = true; G.open && G.open(); }
    for (const id of ['gate', 'ote', 'uma']) rt.unmark(id);
    sfx('kane', 0.4);
    if (tsuke) rt.award((t) => t.side.push('退く敵に続いて大手門へ付け入った'), '大手門へ付け入った');
    rt.say('渡辺勘兵衛', '中村が内、渡辺勘兵衛、一番乗り！', 3.5);
    rt.after(4, () => rt.say('堀秀政', '東の柵を越えた！　三の丸を挟め！', 3.5));
    F.hostUp(18, 30);
    // 開門だけでは「門から入る」を果たさない。寄せ手も枡形の中へ続く。
    for (const g of F.toyo) if (!gone(g)) {
      if (g.order !== 'path') { g.path = [[SP.at.gateOut.x, SP.at.gateOut.z]]; g.pathIdx = 0; }
      g.path = [...g.path, [SP.at.plaza.x, SP.at.plaza.z]]; g.order = 'path';
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
    }
  },

  // ④ 二の丸を抜け、本丸の松田康長の旗本を崩す
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    tahoumen.step(rt, 4);
    rt.award((t) => t.side.push('三の丸の大手を破った'), '三の丸の大手を破った');
    rt.obj('main', '本丸へ上り、松田康長の旗本を討ち取る', 'main');
    const H = KURUWA.hon, N = KURUWA.ni;
    // 二の丸の守り（攻め上る途中で戦う）と、本丸の松田康長の旗本（城将は奥で守られ、前に出ない）
    F.ni = enemyGroup(rt, { faction: 'hojo', name: '二の丸の守り', anchor: { x: N.x, z: N.z + 8 }, facing: 0, order: 'hold', aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HOJO));
    F.hon = enemyGroup(rt, { faction: 'hojo', name: '松田康長の旗本', anchor: { x: H.x, z: H.z + 4 }, facing: 0, order: 'hold', fixed: true, aggro: 6, width: 12, morale: 100, noRout: true, formation: 'yari', fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, defMult: 1.15 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康長', hat: 'kabuto_m', haori: 0x5a2a1c, horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }, { type: 'gun', n: 6 }], HOJO));
    // 松田康郷（康長の弟・「松田の赤鬼」）は本丸の奥にいて、兄の旗本が崩れかけると落ち延びる（史実：脱出して生き延びた）
    F.kogo = enemyGroup(rt, { faction: 'hojo', name: '松田康郷の手', anchor: { x: H.x + 6, z: H.z - 10 }, facing: 0, order: 'hold', fixed: true, aggro: 6, width: 6, morale: 100, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康郷', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 4 }], HOJO));
    F.hon.historicalOrders = true;   // 城将の旗本は本丸を離れない（共通の寄せの下知で前へ出さない。kaito AR 3）
    for (const g of [F.ni, F.hon]) for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5;   // 城の中の鉄砲も出丸・堀の縁と同じ強さ（枡形で一発で倒れない）
    F.honU = F.hon.units[0];
    F.honN = F.hon.units.length;
    // 建物を置くだけでは登り道へ撃たない。近くに守り手がいる柵だけ射撃する。
    F.okuFire = makeSamaFire(rt, [
      { structs: F.niWall, inside: { x: N.x, z: N.z } },
      { structs: F.honWall, inside: { x: H.x, z: H.z } },
    ], { heads: false, near: 65, close: 18, base: 0.8, peak: 4, arrows: 0.45, hurt: 0.2, rain: 0.3 });
    rt.marker('hon', centerOf(F.hon), '松田康長', { red: true, group: F.hon });
    rt.after(3, () => rt.say('松田康長', 'ここは小田原の西の門ぞ。一足も通すな！', 4));
    // 寄せ手は三の丸の広場から、二の丸の虎口・本丸の土橋を通って攻め上る（戦いながら進む）
    //   本丸の土橋の下（二の丸の北の虎口）で揃い、本人が来たら一緒に本丸へ攻め上る（最後の見せ場を本人の目の前で）
    const route = UP_ROUTE.slice(2, 7);
    for (const g of F.toyo) if (!gone(g)) { g.formation = 'column'; g.colW = 2; g.order = 'path'; g.path = route.map((p) => p.slice()); g.pathIdx = 0; g.speed = 3; g.march = false; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 14; q.anchor = { x: 21, z: -66 }; }; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['hon', 'gate', 'cross', 'dai', 'ote', 'uma']) rt.unmark(id);
    // 落城までは踏みとどまり、決着後は残兵を退かせる。敗走禁止のままでは締めの間も戦い続ける。
    for (const g of [F.dai, F.pit, F.rim, F.uma, F.san, F.ni, F.hon, ...(F.kogoOut ? [] : [F.kogo])]) if (g && !gone(g)) { g.noRout = false; g.order = 'retreat'; g.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山中城を半日で落とした', pts: 24 }; }, '任務達成・山中城の本丸を崩した');
    sfx('kane', 0.5);
    rt.banner('山中城、落つ', '北条の西の守りは、半日で崩れた');
    // 戦の後の会話
    rt.say('豊臣秀次', F.ichiShot ? '一柳伊豆を失うたは痛い。されど山中は落ちた' : '山中は落ちた。先手の者ども、よく攻めた', 4.5);
    rt.after(5, () => rt.say('使番', '松田康長、討ち死に。一番乗りは渡辺勘兵衛！', 3.4));
    rt.after(13.4, () => rt.say(nm(rt), '北条の西の門は、開きました', 4));
    rt.after(9, () => rt.say('豊臣秀次', '箱根を越えるぞ。小田原はもう目の前じゃ', 4));
    rt.player.u.invuln = true;
    // 余韻：曲輪ごとに豊臣の旗・箱根の向こうの小田原（t09_yamanaka/rakujo.js）
    rakujo.play(rt);
    rt.finish({ scriptedEnd: true }, 27);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('先手が崩れた');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 落城後の会話中は守りの射撃を止める。勝った後まで寄せ手を撃ち倒さない。
    if (F.ending) return;
    // 討死・やり直しの札の裏で、味方の討ち取りや経過時間だけで目標を果たさない。
    if (!rt.player.u.alive || rt.retryOpen) return;
    if (F.K && F.step) F.K.tick(dt);   // 出陣の段は出丸の鉄砲を撃たせない
    if (F.rimFire) F.rimFire.tick(dt);
    if (F.okuFire) F.okuFire.tick(dt);
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (!F.ending && !F.step) { if (shutsujin.update(rt, {})) this.dai(rt); return; }
    if (F.ending || !F.step) return;
    const p = rt.player.u.pos, T = rt.t - F.stepT;
    // 負け方：一柳の旗の隊が全部崩れる（本人が倒れるのは共通の仕組み）
    if (F.toyo.every((g) => g.count === 0) && (!rt.canFailMission || rt.canFailMission())) { this.lose(rt, '先手の隊がみな崩れた'); return; }
    if (F.step === 1) {
      rt.objProgress('main', '');
      if (!F.daiOn && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) { F.daiOn = true; F.dai.order = 'attack'; F.dai.seekRange = 30; }
      // 一柳直末は出丸の鉄砲に当たって討ち死に（史実。『一柳家記』）。本当に倒れ、隊は旗を守って攻め続ける
      // 主人公が一柳の旗の近く（45m）にいる時に撃たれる。時間だけでは遠くで討たない。
      const iu0 = F.ichi.units.find((u) => u.type === 'busho' && u.alive);
      const ichiNear = iu0 && Math.hypot(iu0.pos.x - p.x, iu0.pos.z - p.z) < 45;
      if (!F.ichiShot && T > 30 && F.dai.count > 0 && ichiNear) {
        F.ichiShot = true; F.ichi.name = '一柳直盛の隊'; rt.banner('一柳直末、撃たれる'); rt.say('中村一氏', '伊豆守殿が鉄砲に当たられた！　一柳の者ども、旗を守れ！', 4);
        rt.after(5, () => rt.say('一柳直盛', '兄の首は渡さぬ。一柳の旗は、この直盛が預かる！', 4));
        const iu = F.ichi.units.find((u) => u.type === 'busho' && u.alive);
        if (iu) {
          const shooter = F.dai.units.find((u) => u.type === 'gun' && u.alive) || null;
          // 撃った出丸の鉄砲の煙と、一柳の倒れる所を同じ時に見せる
          if (shooter) rt.world.gunSmoke?.(shooter.pos.x, shooter.pos.z);
          sfx('gun', 0.9); iu.invuln = false; iu.hp = 0; rt.army.kill(iu, shooter);
        }
      }
      // 間宮康俊の最期（史実：氏勝と孫の直元を落とし、白髪を墨で染めて敵の中へ突き入り討ち死に。七十三歳）
      const mu = F.dai.units.find((u) => u.type === 'busho');
      // 間宮の突き入りは主人公の見える所（60m）で始める。柵の内で突っ立ったまま字だけで死なない（critic60 山中 8）
      const muNear = mu && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 60;
      // 一柳が撃たれる所に本人がいなくても、二分半で間宮は突き入る（11/9 見回り：突き入らず出丸に籠もった残りが討てず十八分止まった）
      if ((F.ichiShot || T > 150) && !F.mamiya && mu && mu.alive && F.dai.count > 0 && muNear && (F.dai.count < F.daiN * 0.6 || T > 25)) {
        F.mamiya = true; F.mamiyaT = rt.t;
        F.dai.noRout = true; F.dai.morale = 100; F.dai.order = 'attack'; F.dai.seekRange = 60; F.dai.aggro = 40; F.dai.fixed = false;
        rt.say('間宮康俊', '氏勝殿も直元も落とした。白髪首を渡すは恥ぞ、墨で染めたわ。者ども、続け！', 5);
      }
      // 時切れの討ち死には主人公が近く（40m）にいる時だけ（知らない所で死なない）。
      const muClose = mu && Math.hypot(mu.pos.x - p.x, mu.pos.z - p.z) < 40;
      // 突き入り前に本人が討った場合も最期を記録する。死んだ間宮の突き入りを待たない。
      if (!F.mamiyaDead && (mu && !mu.alive || F.mamiya && rt.t - F.mamiyaT > 40 && muClose)) {
        F.mamiyaDead = true; // 手勢を討ち取る目標なので、残兵を敗走だけで討ち取り扱いにしない。
        // 突き入って四十秒のうちに討たれなければ、寄せ手の槍に囲まれて討ち死に（史実の最期を必ず見せる）
        //   （討ち取りの大きな字が出る時は重ねない。見出しは時切れの討ち死にの時だけ）
        if (mu && mu.alive) { mu.invuln = false; mu.hp = 0; rt.army.kill(mu, F.naka.units.find((u) => u.alive && u.type !== 'busho') || null); rt.banner('間宮康俊、討ち死に'); }
      }
      // 味方だけが出丸を抜いても、主人公が寄るまでは次の目標を達成扱いにしない。
      // 残兵を探し回らせず、間宮を失った手勢が近くの寄せ手へ突き入る。
      // 時間だけで敗走・柵の破壊・討ち取りの達成を起こさない。
      if (!F.daiLast && (F.mamiyaDead ? T > 180 : T > 240) && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) {
        F.daiLast = true; F.dai.order = 'attack'; F.dai.fixed = false; F.dai.seekRange = 60; F.dai.aggro = 40;
      }
      // 柵に誰も傷をつけられないまま本人が柵の前で戦い続ける時は、先手が柵を引き倒す（11/9 bot：出丸の前で13分止まり倒れた）
      if (!F.daiPulled && T > 120 && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 45 && !F.daiWall.some((s) => s.alive === false || s.hp <= 0)) {
        F.daiPulled = true;
        const c = F.naka.count ? F.naka.center() : p;
        let best = null, bd = Infinity;
        for (const s of F.daiWall) { const d = Math.hypot((s.seg[0] + s.seg[2]) / 2 - c.x, (s.seg[1] + s.seg[3]) / 2 - c.z); if (d < bd) { bd = d; best = s; } }
        if (best && best.alive) { rt.army.damage(best, best.hp + 1, null); sfx('gateBreakWood', 0.8); rt.say('中村一氏', '縄を掛けよ！　柵を引き倒せ！', 3); }
      }
      // 「手勢二百を討ち取る」は残兵の退去や経過時間では果たさない。
      if (F.dai.units.every((u) => !cnt(u)) && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 40 && F.daiWall.some((s) => s.alive === false || s.hp <= 0)) this.shoji(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.cross.x, p.z - F.cross.z);
      rt.objProgress('main', `堀の向こうまで あと${Math.round(d)}m`);
      // 堀の縁の兵は縁を離れず、上がって来る寄せ手を縁で迎える（一人を追って堀へ降りない）
      if (!F.rimOn && p.z < SHOJI.z1 + 30) { F.rimOn = true; F.rim.seekRange = 12; }
      // 畝を渡り切るまで次へ進めない。堀の手前や底で時間を待っても達成にしない。
      if (p.z < SHOJI.z0 - 1 && d < 18) this.ote(rt);
    }
    if (F.step === 3) {
      const gate = F.K.gate && F.K.gate.struct;
      const dg = Math.hypot(p.x - SP.at.gate.x, p.z - SP.at.gate.z);
      rt.objProgress('main', F.sub === 'back' ? `大手門まで あと${Math.round(dg)}m` : '');
      // 打って出た隊が皆討たれた時は、門へ攻め寄せる段へ
      if (F.sub === 'sally' && gone(F.uma)) this.sallyBack(rt);
      if (!F.gateOpen && gate && (gate.alive === false || (gate.opened && F.K.tsukeiri))) this.openGate(rt, !!F.K.tsukeiri);
      // 本人と寄せ手が門へ詰めている間だけ数える。遠くで待つだけでは門を破らない。
      if (!F.gateOpen && F.sub === 'back' && dg < 40 && F.toyo.some((g) => g.units.some((u) => cnt(u) && Math.hypot(u.pos.x - SP.at.gate.x, u.pos.z - SP.at.gate.z) < 20))) {
        F.gatePress = (F.gatePress || 0) + dt;
        if (F.gatePress > 70) this.openGate(rt, false);
      }
      // 本人が門の前の三の丸の守りと斬り合い続け、寄せ手が門へ着けない時も、長くは止めない（11/9 bot：九分止まった）
      if (!F.gateOpen && F.sub === 'back' && dg < 60 && rt.t - F.backT > 150) this.openGate(rt, false);
      // 三の丸の広場に入って果たす。時間で半径を広げると門の外でも達成してしまう。
      const dpz = Math.hypot(p.x - SP.at.plaza.x, p.z - SP.at.plaza.z);
      // 広場の真ん中に三の丸の守りが固まって着けない時も、門をくぐって三の丸の内に入れば入ったとする（11/9 見回り：門の内で九分止まった）
      if (F.gateOpen && (dpz < 10 || (Math.hypot(p.x - KURUWA.san.x, p.z - KURUWA.san.z) < 30 && p.z < SP.at.gate.z - 3))) this.honmaru(rt);
    }
    if (F.step === 4) {
      const g = F.hon;
      rt.objProgress('main', '');
      if (!F.honOn && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 50) {
        F.honOn = true; g.fixed = false; g.aggro = 14; g.order = 'attack'; g.seekRange = 26;
        rt.say('中村一氏', '本丸へ掛かれ！　松田の旗を倒せ！', 3.5);
        for (const q of F.toyo) if (!gone(q)) { q.order = 'path'; q.path = UP_ROUTE.slice(6); q.pathIdx = 0; q.speed = 2.4; q.onArrive = (r) => { r.order = 'attack'; r.seekRange = 40; }; }
      }
      if (F.ni && !gone(F.ni) && F.ni.count < 6) F.ni.morale = Math.min(F.ni.morale, 20);
      // 旗本が崩れ始めると康郷が脱出する。康長は初めから本人の攻撃で討てる。
      if (F.honOn && !F.kogoOut && F.kogo && g.count < F.honN * 0.65) {
        F.kogoOut = true; F.kogo.fixed = false; F.kogo.noRout = true; F.kogo.morale = 100;
        // 本丸の北と東は柵で閉じている。南の虎口から出て、東の尾根を回って落ちる。
        // 士気を零にすると敗走の下知がこの退路を上書きし、北の柵へ突き当たる。
        F.kogo.order = 'path'; F.kogo.path = [[24, -94], [24, -82], [52, -70], [70, -130], [52, -200]]; F.kogo.pathIdx = 0; F.kogo.speed = 2.8;
        F.kogo.noPursue = true; F.kogo.historicalOrders = true;
        F.kogo.onArrive = (q) => { for (const u of q.units) if (u.alive && !u.gone) rt.army.despawn(u); };
        rt.say('松田康郷', '兄上、御免！　この康郷は落ち延び、松田の家を残す', 4);
      }
      // 旗本は退かせず、松田康長が討たれるまで本丸で戦う（critic60 山中 37「退いただけで落城・康長の討たれる所が見えない」）
      // 旗本が崩れなくても、三分余りで康長が自ら打って出る（討つのは本人と寄せ手。時間で討ち死にはさせない。11/9 見回り：本丸で十分止まった）
      if (F.honOn && !F.honOut && T > 200 && F.honU?.alive) { F.honOut = true; g.fixed = false; g.order = 'attack'; g.aggro = 40; g.seekRange = 60; rt.say('松田康長', '者ども、討って出るぞ！', 3); }
      if (F.honOn && g.count < F.honN * 0.4 && F.honU?.alive && !F.honLast) { F.honLast = true; g.aggro = Math.max(g.aggro || 0, 20); rt.say('松田康長', '本丸を枕に討ち死にいたす。かかれ！', 3.5); }
      // 康長の討死は実際の攻撃で決める。近くで待った時間だけで命を尽かせない。
      if (F.honOn && Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 50 && (g.count === 0 || (F.honU && !F.honU.alive))) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.routSaid) return;   // 同じ隊の退きは一度だけ言う
    g.routSaid = true;
    rt.say('足軽', `${g.name}が奥へ退いた`, 2.5);
  },
};

// 両軍の総勢（豊臣秀次の寄せ手およそ七万、山中城の北条勢およそ四千。数には諸説ある）
t09_yamanaka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 40), a0: 70000, b: Math.max(0, 4000 - (F.ek || 0) * 25), b0: 4000 };
};
t09_yamanaka.sides = { a: { name: '豊臣軍（豊臣秀次）', mon: 'toyotomi' }, b: { name: '北条軍（松田康長）', mon: 'hojo' } };
t09_yamanaka.date = () => '天正十八年三月二十九日　春・朝';
t09_yamanaka.history = '天正十八年（1590）、豊臣秀吉は小田原の北条氏を攻めた。三月二十九日の朝、豊臣秀次を大将におよそ七万が、箱根の西の坂にある山中城を攻めた。城は松田康長らおよそ四千が守り、堀の底を畝で仕切った障子堀・畝堀と、折れた虎口で固めていた。寄せ手の一柳直末は鉄砲に当たって討たれたが、中村一氏（家臣の渡辺勘兵衛が一番乗り）・堀秀政・山内一豊らの手がいくつもの方から攻め上り、城は半日で落ちた。岱崎出丸を守った間宮康俊も、城主の松田康長も討ち死にした。北条の西の守りは一日で崩れ、秀吉の軍は箱根を越えて小田原を囲んだ。兵の数には諸説ある。';

// 素直な遊び手：出丸の隊と戦い、障子堀を縦の畝の上で渡り、虎口が開いたら三の丸から本丸へ
t09_yamanaka.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (!F.step) { goTo(p, inp, shutsujin.LINE.x, shutsujin.LINE.z, 2); return; }
  // 一太刀で命の半分を失うため、半分のまま二太刀目を待たず味方の後ろへ退く。
  if (u.hp < u.maxHp * 0.65) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = (F.toyo.find((g) => !gone(g)) || F.ichi).center();
  if (b.botRest && F.step !== 2) {
    inp.guardHold = false;
    // 先手の中心は出丸の内へ進む。そこを休息先にすると、深手の本人が敵陣へ戻ってしまう。
    // 西側からは畝堀の土橋へ戻り、東の街道の二陣で手当てを待つ。
    if (F.step === 1) {
      if (u.pos.x < -10) {
        if (Math.abs(u.pos.z - 176) > 4) goTo(p, inp, Math.min(u.pos.x, -32), 176, 1.5);
        else goTo(p, inp, -6, 176, 1.5);
      } else goTo(p, inp, 12, 194, 2);
    } else goTo(p, inp, c.x, c.z + 18, 2);
    return;
  }
  // 堀の中では寄り道をせず、畝の筋をまっすぐ渡る
  //   （目の前に来た敵だけは斬り払う）
  // 切岸の上や柵の向こうへ斬り掛からず、味方と同じ虎口・土橋を通る。
  const inUne = (q) => q.x > -28 && q.x < -11 && q.z > 138 && q.z < 212 && (q.z < 170 || q.z > 182);   // 出丸の脇の畝堀の中
  const e = b.army.nearestEnemy(u, F.step === 2 ? 3.5 : 12, (o) => !o.fleeing && !o.isStruct && !(F.step === 1 && inUne(o.pos)) &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, p.weapon === 'spear'));
  if (F.step === 2 && !e) { inp.guardHold = false; goTo(p, inp, CROSS_X, u.pos.z > SHOJI.z0 - 4 ? SHOJI.z0 - 7 : F.cross.z, 1.5); return; }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 振りを受けてから返す（共通の patientStrike）。くじの突きと構えでは、騎馬と侍に削られて二度とも倒れた（11/8）
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2.2);
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 出丸の東の畝堀（x −27〜−12）は、間の土橋（z 170〜182）だけを渡る（堀の中に落ちて槍に囲まれ、三度とも倒れた。11/8 bot）
  if (F.step === 1 && u.pos.x > -30 && (u.pos.z < 171 || u.pos.z > 181)) { goTo(p, inp, u.pos.x > -10 ? -6 : -32, 176, 1.5); return; }
  if (F.step === 1 && F.dai && !gone(F.dai)) { const t = F.dai.center(); goTo(p, inp, t.x, t.z, 2); return; }
  // 出丸の手勢が尽きても、出丸へ寄るまでは次の段にならない。先に障子堀へ向かうと進行が止まる。
  if (F.step === 1) { goTo(p, inp, KURUWA.dai.x, KURUWA.dai.z, 3); return; }
  if (F.step === 3) {
    // 馬出しの右の口の前で待ち、打って出た隊と戦い、退く兵に続いて口・馬出し・土橋・門へ
    const A = SP.at, M = A.mouths[1];
    if (F.sub !== 'back') { goTo(p, inp, M.far.x, M.far.z, 3); return; }
    const W = [M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.plaza];
    b.botWp = Math.min(b.botWp || 0, W.length - 1);
    // 角や土塁の縁で行き先の点へ届かず止まったら、次の点へ（11/9 bot：馬出しの前で十分止まった）
    const st = b.botStk ||= { x: u.pos.x, z: u.pos.z, t: b.t };
    if (Math.hypot(u.pos.x - st.x, u.pos.z - st.z) > 1.5) { st.x = u.pos.x; st.z = u.pos.z; st.t = b.t; }
    if ((Math.hypot(u.pos.x - W[b.botWp].x, u.pos.z - W[b.botWp].z) < 2.5 || b.t - st.t > 8) && b.botWp < W.length - 1) { b.botWp++; st.t = b.t; }
    goTo(p, inp, W[b.botWp].x, W[b.botWp].z, 1.2); return;
  }
  if (F.step === 4 && F.hon && !gone(F.hon)) {
    // 枡形を折れて三の丸・二の丸の虎口を通り、本丸へ（近い点から先へ）
    if (b.botUp === undefined) { let bi = 0, bd = Infinity; UP_ROUTE.forEach(([x, z], i) => { const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; bi = i; } }); b.botUp = bi; }
    const [x, z] = UP_ROUTE[b.botUp];
    if (Math.hypot(u.pos.x - x, u.pos.z - z) < 2.5 && b.botUp < UP_ROUTE.length - 1) b.botUp++;
    if (b.botUp >= UP_ROUTE.length - 1) { const t = F.hon.center(); goTo(p, inp, t.x, t.z, 2); return; }
    goTo(p, inp, x, z, 1.2); return;
  }
  goTo(p, inp, c.x, c.z - 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
const cnt = (u) => u.alive && !u.dying && !u.evacuatedWound;   // 敗走しただけの兵は討ち取りに含めない。
KILLS.t09_yamanaka = (rt) => {
  const F = rt.flags;
  if (F.ending || F.step !== 1) return null;
  const units = F.dai?.units || [], n = units.length;
  const down = n - units.reduce((sum, u) => sum + (cnt(u) ? 1 : 0), 0);
  return n ? [Math.min(200, Math.floor(down * 200 / n)), 200] : [0, 200];
};
withGuard(t09_yamanaka);

export { t09_yamanaka };
export default t09_yamanaka;
