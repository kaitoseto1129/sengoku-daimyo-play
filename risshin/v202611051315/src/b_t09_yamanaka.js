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
import DEM from './asset_dem_yamanaka.js';
import { demSample } from './dem.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, kagaribi, tawara, yagura, palisade, solidRect, shogi } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { bankTex } from './nature.js';
import { siegePlan, siegeHeight, buildSiege } from './siege_kit.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, broke } from './stages.js';
import { addSite } from './map_sites.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 東海道（城の中を通る土の道）。三島の側（南）から本丸の脇へ
const ROAD = [[34, 340], [24, 270], [14, 200], [10, 140], [10, 64], [10, 30], [14, -40], [24, -100], [30, -170]];
const SEAT = { x: 44, z: 232 };             // 豊臣秀次の本陣の床几（街道の後ろの陣幕の中）
const START = { x: 22, z: 220 };           // 地面の格子（groundHalf 240）と動ける所（moveLim 236）の内。前は 292 で、兵がみな z=176 の端に寄せられていた
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
const TOYO = { flag: 'toyotomi' };

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
  const dh = S.une ? 99 : S.alongZ ? Math.abs(x - (S.x0 + S.x1) / 2) : Math.abs(z - (S.z0 + S.z1) / 2);
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
  const W = rt.world, pos = [], col = [], uvs = [], idx = [];
  const rim = (x, z) => kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  // 本物の障子堀（山中城跡の発掘・復元：関東ロームを削り残した畝）に寄せる：畝の背は丸く崩れ、法は踏み跡と雨の筋で凸凹。
  //   断面は七つの点（裾・法の下・法の上・肩・背・肩・法…）で、点ごとに少し揺らす。土の絵（bankTex）を張り、色は赤い関東ローム、
  //   底ほど湿って暗く、背は乾いて明るい（平らな茶色の板に見せない）
  const PROF = [[-1, 0], [-0.62, 0.34], [-0.34, 0.74], [-0.12, 0.97], [0.12, 0.97], [0.34, 0.74], [0.62, 0.34], [1, 0]];
  const hz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const rib = (ax, az, bx, bz, wTop, wBot, tone) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
    const nx = -(bz - az) / L, nz = (bx - ax) / L, NP = PROF.length;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = rim(x, z) - 0.8 + (hz(i, tone) - 0.5) * 0.35, bot = Math.min(W.heightAt(x, z), top - 0.5) - 0.7;
      let v = 0, px = 0, py = 0;
      for (let k = 0; k < NP; k++) {
        const [f, hgt] = PROF[k], edge = k === 0 || k === NP - 1;
        const half = Math.abs(f) <= 0.12 ? wTop * 0.6 : wTop + (wBot - wTop) * (1 - hgt);
        const jit = edge ? 0 : (hz(i * 7 + k, tone * 3) - 0.5) * 0.28;
        const off = Math.sign(f) * half + jit * Math.sign(f || 1), y = bot + (top - bot) * hgt + (edge ? 0 : (hz(i + k * 5, tone) - 0.5) * 0.18);
        if (k) v += Math.hypot(off - px, y - py) / 3; px = off; py = y;
        pos.push(x + nx * off, y, z + nz * off); uvs.push(L * t / 3 + tone * 0.37, v);
        // 色：底は湿った濃い赤土、背は乾いて白っぽく、ところどころ枯れ草の黄
        const wet = 1 - hgt, r1 = hz(i * 3 + k, tone + 1), dry = hgt > 0.9 ? 0.12 : 0;
        let c = [1.72 - wet * 0.42 + dry, 1.5 - wet * 0.38 + dry * 0.9, 1.22 - wet * 0.3 + dry * 0.7];   // 絵（bankTex）が暗い赤土なので、堀の法の地面の色に合うまで持ち上げる
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
      rib(...P(u, v0 - 0.6), ...P(u, v1 + 0.6), wT, wB, tone++);
    }
    if (S.une) continue;
    const vm = (v0 + v1) / 2;
    rib(...P(u0 - 0.6, vm), ...P(u1 + 0.6, vm), wT, wB, tone++);
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
  box(w + 1.2, 1.2, d + 1.2, 0, -0.4, 0, 0x6a5a44);            // 足もとの土の基壇（踏み固めた土）
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
  noFrontFill: true,          // 城の外の思わぬ所に作りの乱戦を置かない（敵は城の中・味方は街道の坂。kaito AP 10）
  frontlineDensity: false,    // 数人の物見の組を湧かせない（kaito AW 6）
  goalSignOnly: true,         // 行き先は頭上の金の▼一つ（旗の印・輪・枠を重ねない。kaito AL・AV 15）
  noLeaderFollow: true,   // 行き先は目標の印一つだけ（ついていく相手の青い印を重ねない。kaito AV 15）
  goalSignNoLabel: true,     // ▼の上に「敵をたおせ」などの字を出さない（標準 三の1・五の1）
  meleeGuide: () => false,   // 「敵をたおせ」の札と敵を指す矢印は出さない。敵は頭上の▼で分かる（BH6）
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    seed: 15900,
    // 格子は 480m を 144 に割る（3.33m。障子堀の渡る畝 x=10 が格子の線に乗る）。出丸の前から始められるように広げた
    groundHalf: 240,
    moveLim: 236,
    time: 'day',
    mist: true,
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
    // ---- 三の丸の大手（角馬出し・枡形・横矢・畝堀・狭間からの鉄砲）。出丸の柵からも撃つ（近づくほど弾が降る。kaito BA 5） ----
    F.K = buildSiege(rt, SP, { team: 1, earth: true, wall: 'saku', umadashiWall: 'saku', wallHp: 520, gateHp: 460, masuHp: 600,
      fire: { hurt: 0.2, near: 90, close: 18, base: 0.8, peak: 4, rain: 0.3 },   // 寄せ手も撃たれて倒れるが、柵に着く前に一隊が消えない強さ
      extraWalls: [{ structs: F.daiWall, inside: { x: D.x - 2, z: D.z } }] });
    shojiRibs(rt);
    // ---- 城の建物（北条の土の城：板の櫓と柵だけ。天守閣は無く、本丸の北西の高まりに天守櫓） ----
    itaYagura(rt, HN.x - 9, HN.z - 9, { w: 6.4, d: 5.4, floors: 2, rot: 0.2 });   // 天守櫓
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
      dress([{ type: 'busho', n: 1, o: { name: '一柳直末', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 8 }], TOYO));
    F.naka = allyGroup(rt, { name: '中村一氏の隊', fullStrength: true, anchor: { x: 30, z: 202 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '中村一氏', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '渡辺勘兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], TOYO));
    F.hori = allyGroup(rt, { name: '堀秀政の隊', fullStrength: true, anchor: { x: 66, z: 188 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], TOYO));
    F.toyo = [F.ichi, F.naka, F.hori];
    for (const g of F.toyo) { g.defMult = 1.2; g.dmgMult = 0.85; }
    // 山内一豊の隊（秀次の先手の一つ。史実：中村・一柳と並んで攻め上った）。一柳の隊の後ろに続く二陣
    F.yama = allyGroup(rt, { name: '山内一豊の隊', fullStrength: true, anchor: { x: -4, z: 220 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, hat: 'kabuto_w', haori: 0x33302a } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }], TOYO));
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
    for (const [x, z] of [[34, 226], [54, 226], [START.x - 14, START.z + 10]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    // 秀次の後ろに続く七万の本隊は、街道の坂のずっと下（動ける所の外・近づけない遠さ）にだけ置く
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2b2723, team: 0, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', seed });
    F.host = [DA(16, 340, 70, 26, 420, Math.PI, 15901), DA(-60, 320, 40, 20, 220, Math.PI * 0.9, 15902)];
    for (const g of F.host) if (g && g.army) g.army.noWake = true;
    // ---- 岱崎出丸の間宮康俊の隊（数百。柵の内に鉄砲、後ろに槍と騎馬） ----
    F.dai = enemyGroup(rt, { faction: 'hojo', name: '間宮康俊の隊', anchor: { x: D.x + 6, z: D.z }, facing: 0.8, order: 'hold', aggro: 20, width: 12, morale: 95, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'busho', n: 1, o: { name: '間宮康俊', hat: 'kabuto_m', haori: 0x4a3a28 } }, { type: 'gun', n: 22 }, { type: 'ashigaru', n: 52 + more(rt, 0.4) }, { type: 'samurai', n: 10 }, { type: 'cavalry', n: 8 }], HOJO));
    for (const u of F.dai.units) if (u.type === 'gun') u.dmg *= 0.5;

    W.setTime('day');
    rt.setPhase('brief');
    // 戦の前の会話（待つ目標は出さない。始めから出丸へ寄る。kaito AZ・BA 3）
    rt.say('豊臣秀次', '半日で落とせ。先手は岱崎出丸から掛かれ', 4.5);
    rt.after(4.8, () => rt.say('一柳直末', '北条の鉄砲は多いぞ。出丸の前で足を止めるな', 4));
    rt.after(9.2, () => rt.say('堀秀政', '我らは東の尾根から三の丸の横へ回る。挟んで落とすぞ', 3.5));
    this.dai(rt);
  },

  // ① 岱崎出丸の東の柵を破り、間宮康俊の隊を討つ
  dai(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('dai');
    sfx('horagai', 0.8);
    rt.obj('main', '出丸の柵を破り、間宮康俊の隊を討ち取る', 'main');
    const D = KURUWA.dai;
    rt.marker('dai', centerOf(F.dai), '間宮康俊', { red: true, group: F.dai });
    // 先手は柵の前へ寄り、柵を打ち破って出丸へ斬り込む（柵の向こうの敵を追って立ち往生しない）
    const fence = (u) => {
      let best = null, bd = Infinity;
      for (const s of F.daiWall) if (s.alive !== false) { const d = Math.hypot((s.seg[0] + s.seg[2]) / 2 - u.pos.x, (s.seg[1] + s.seg[3]) / 2 - u.pos.z); if (d < bd) { bd = d; best = s; } }
      return best && bd < 40 ? best : { x: D.x, z: D.z };
    };
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (q) => { q.order = 'assault'; q.assault = fence; q.anchor = { x, z }; }; };
    go(F.ichi, D.x + 26, D.z + 4); go(F.naka, D.x + 34, D.z - 4); go(F.yama, D.x + 30, D.z + 14);  // 出丸の東の土橋の口へ（出丸の前の畝堀を避ける）
    // 堀秀政は東の尾根を登り、障子堀の東の端の外で待つ
    go(F.hori, SHOJI.x1 + 22, SHOJI.z1 + 18);
  },

  // ② 障子堀の畝の上を渡る
  shoji(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('shoji'); rt.unmark('dai');
    if (!gone(F.dai)) { F.dai.noRout = false; F.dai.morale = 0; }
    rt.award((t) => t.side.push('岱崎出丸を抜いた'), '岱崎出丸を抜いた');
    rt.banner('障子堀', '畝の上を渡れ');
    rt.obj('main', '北の障子堀を畝の上で渡り、向こう岸へ出る', 'main');
    rt.say('中村一氏', '堀へ落ちれば這い上がれぬ。畝から足を外すな', 4);
    // 堀の底に潜む槍（落ちた者を下から突く）と、向こうの縁の鉄砲
    const mz = (SHOJI.z0 + SHOJI.z1) / 2;
    F.pit = enemyGroup(rt, { faction: 'hojo', name: '堀の底の槍', anchor: { x: CROSS_X + 9, z: mz + 4 }, facing: 0, order: 'hold', aggro: 7, width: 10, morale: 80, ambush: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'ashigaru', n: 8 + more(rt, 0.3) }], HOJO));
    F.rim = enemyGroup(rt, { faction: 'hojo', name: '堀の縁の鉄砲', anchor: { x: CROSS_X + 4, z: SHOJI.z0 - 6 }, facing: 0, order: 'hold', aggro: 10, width: 16, morale: 85, formation: 'line', fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 8 }], HOJO));
    for (const u of F.rim.units) if (u.type === 'gun') u.dmg *= 0.45;
    F.cross = { x: CROSS_X, z: SHOJI.z0 - 5 };
    rt.marker('cross', F.cross, '', { h: 2 });
    const path = (g, dx) => { g.order = 'path'; g.path = [[CROSS_X + dx, SHOJI.z1 + 6], [CROSS_X + dx, SHOJI.z0 - 5]]; g.pathIdx = 0; g.speed = 1.8; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; };
    path(F.ichi, -SHOJI.cell); path(F.naka, SHOJI.cell); if (!gone(F.yama)) path(F.yama, 0);
    if (!gone(F.hori)) path(F.hori, SHOJI.cell * 4);
  },

  // ③ 三の丸の大手：馬出しへ寄せる → 打って出た北条の隊を迎え撃つ → 退く兵に続いて大手門から入る（付け入り。docs/kaito_refs_1103 の ref04〜07）
  ote(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.sub = 'yose';
    rt.setPhase('koguchi'); rt.unmark('cross');
    for (const g of [F.pit, F.rim]) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    rt.award((t) => t.side.push('障子堀を渡った'), '障子堀を渡った');
    rt.obj('main', '三の丸の大手の馬出しへ攻め寄せる', 'main');
    rt.banner('三の丸の大手', '馬出しへ攻め寄せよ');
    const A = SP.at, M = A.mouths;
    // 馬出しに詰める北条の隊（騎馬と槍）。寄せ手が来ると脇の口から打って出て、一柳の隊の横を突く
    F.uma = enemyGroup(rt, { faction: 'hojo', name: '馬出しの北条の隊', fixed: true, formation: 'yari', anchor: { ...A.uma }, facing: 0, width: 6, aggro: 4, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 5 }, { type: 'ashigaru', n: 16 }], HOJO));
    F.uma.historicalOrders = true;
    F.san = enemyGroup(rt, { faction: 'hojo', name: '三の丸の守り', anchor: { ...A.plaza }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], HOJO));
    F.sortie = F.K.sortie(F.uma, { fight: 18, mouth: 1, R: 12,
      strike: () => { const g = gone(F.ichi) ? F.naka : F.ichi, c = g.center(); return { x: c.x, z: c.z }; },
      when: (r) => { const u = r.player.u; return r.flags.step === 3 && r.t - r.flags.stepT > 10 && u.alive && Math.hypot(u.pos.x - A.uma.x, u.pos.z - A.uma.z) < 46; },
      onOut: (r) => this.sally(r), onBack: (r) => this.sallyBack(r), onTsukeiri: (r) => this.openGate(r, true) });
    rt.marker('ote', { x: M[1].far.x, z: M[1].far.z }, '', { h: 3 });
    // 寄せ手は馬出しの左右の口の前へ（大手を攻める）
    const go = (g, P) => { if (gone(g)) return; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.anchor = { x: P.x, z: P.z }; }; };
    go(F.ichi, M[1].far); go(F.naka, M[0].far); go(F.yama, { x: M[1].far.x + 4, z: M[1].far.z + 8 });go(F.hori, { x: SP.x + 34, z: SP.z + 26 });
    rt.after(8, () => { if (F.step === 3) rt.say('渡辺勘兵衛', '一番乗りは、この勘兵衛がもらう！', 3.5); });
  },
  sally(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.sub !== 'yose') return;
    F.sub = 'sally';
    rt.unmark('ote');
    rt.obj('main', '馬出しから打って出た北条の隊を、口の前で迎え撃つ', 'main');
    rt.banner('打って出たぞ', '迎え撃て');
    rt.marker('uma', centerOf(F.uma), '', { red: true, group: F.uma });
    rt.say('一柳直末', '横から来たぞ！　槍を揃えて受け止めよ！', 3.5);
    for (const g of F.toyo) if (!gone(g)) { g.order = 'attack'; g.seekRange = 34; }
  },
  sallyBack(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.gateOpen) return;
    F.sub = 'back';
    rt.unmark('uma');
    rt.obj('main', '退く北条の兵に続いて、大手門から三の丸へ入る', 'main');
    rt.marker('gate', { ...SP.at.gate }, '', { red: true, h: 3 });
    rt.say('中村一氏', '退くぞ！　門を閉めさせるな。続いて入れ！', 3.5);
    // 寄せ手は退く兵の後ろについて、馬出しの口から土橋・門へ
    const A = SP.at, M = A.mouths[1];
    const pts = [[M.lane.x, M.lane.z], [M.outer.x, M.outer.z], [M.inner.x, M.inner.z], [A.uma.x, A.uma.z], [A.bridgeOut.x, A.bridgeOut.z], [A.gateOut.x, A.gateOut.z]];
    for (const g of F.toyo) if (!gone(g)) { g.order = 'path'; g.path = pts; g.pathIdx = 0; g.speed = 2.8; g.onArrive = (q) => { q.order = 'assault'; q.assault = () => { const s = F.K.gate && F.K.gate.struct; return s && s.alive && !s.opened ? s : A.plaza; }; }; }
  },
  openGate(rt, tsuke) {
    const F = rt.flags;
    if (F.gateOpen) return;
    F.gateOpen = true;
    for (const G of [F.K.gate, F.K.masu && F.K.masu.inner]) if (G && G.struct && G.struct.alive !== false) { G.struct.opened = true; G.open && G.open(); }
    for (const id of ['gate', 'ote', 'uma']) rt.unmark(id);
    sfx('kane', 0.4);
    if (tsuke) rt.award((t) => t.side.push('退く敵に続いて大手門へ付け入った'), '大手門へ付け入った');
    rt.banner(tsuke ? '付け入った' : '大手門を破った', '三の丸へなだれ込め');
    rt.after(2, () => rt.say('堀秀政', '東の柵を越えた！　三の丸を挟め！', 3.5));
    this.honmaru(rt);
  },

  // ④ 二の丸を抜け、本丸の松田康長の旗本を崩す
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.award((t) => t.side.push('三の丸の大手を破った'), '三の丸の大手を破った');
    rt.obj('main', '本丸へ上り、松田康長の旗本を討ち取る', 'main');
    const H = KURUWA.hon, N = KURUWA.ni;
    // 二の丸の守り（攻め上る途中で戦う）と、本丸の松田康長の旗本（城将は奥で守られ、前に出ない）
    F.ni = enemyGroup(rt, { faction: 'hojo', name: '二の丸の守り', anchor: { x: N.x, z: N.z + 8 }, facing: 0, order: 'hold', aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HOJO));
    F.hon = enemyGroup(rt, { faction: 'hojo', name: '松田康長の旗本', anchor: { x: H.x, z: H.z + 4 }, facing: 0, order: 'hold', fixed: true, aggro: 6, width: 12, morale: 100, noRout: true, formation: 'yari', fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, defMult: 1.15 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康長', invuln: true, hat: 'kabuto_m', haori: 0x5a2a1c, horse: false } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }, { type: 'gun', n: 6 }], HOJO));
    F.hon.historicalOrders = true;   // 城将の旗本は本丸を離れない（共通の寄せの下知で前へ出さない。kaito AR 3）
    F.honU = F.hon.units[0];
    F.honN = F.hon.units.length;
    rt.marker('hon', centerOf(F.hon), '松田康長', { red: true, group: F.hon });
    rt.after(3, () => rt.say('松田康長', 'ここは小田原の西の門ぞ。一足も通すな！', 4));
    // 寄せ手は三の丸の広場から、二の丸の虎口・本丸の土橋を通って攻め上る（戦いながら進む）
    //   本丸の土橋の下（二の丸の北の虎口）で揃い、本人が来たら一緒に本丸へ攻め上る（最後の見せ場を本人の目の前で）
    const route = UP_ROUTE.slice(2, 7);
    for (const g of F.toyo) if (!gone(g)) { g.order = 'path'; g.path = route; g.pathIdx = 0; g.speed = 2.2; g.march = false; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 14; q.anchor = { x: 21, z: -66 }; }; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['hon', 'gate', 'cross', 'dai', 'ote', 'uma']) rt.unmark(id);
    if (F.hon && !gone(F.hon)) F.hon.morale = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山中城を半日で落とした', pts: 24 }; }, '任務達成・山中城の本丸を崩した');
    sfx('kane', 0.5);
    rt.banner('山中城、落つ', '北条の西の守りは、半日で崩れた');
    // 戦の後の会話
    rt.say('豊臣秀次', '一柳殿が撃たれた。だが城は落ちた', 4.5);
    rt.after(13.4, () => rt.say('使番', '松田康長、討ち死に。一番乗りは渡辺勘兵衛！', 3.4));
    rt.after(4.8, () => rt.say(nm(rt), '北条の西の門は、開きました', 4));
    rt.after(9, () => rt.say('豊臣秀次', '箱根を越えるぞ。小田原はもう目の前じゃ', 4));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 17.5);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('先手が崩れた', '退け');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.K) F.K.tick(dt);
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending || !F.step) return;
    const p = rt.player.u.pos, T = rt.t - F.stepT;
    // 負け方：一柳の旗の隊が全部崩れる（本人が倒れるのは共通の仕組み）
    if (F.toyo.every((g) => g.count === 0) && (!rt.canFailMission || rt.canFailMission())) { this.lose(rt, '先手の隊がみな崩れた'); return; }
    if (F.step === 1) {
      rt.objProgress('main', '');
      if (!F.daiOn && Math.hypot(p.x - KURUWA.dai.x, p.z - KURUWA.dai.z) < 60) { F.daiOn = true; F.dai.order = 'attack'; F.dai.seekRange = 30; }
      // 一柳直末は出丸の鉄砲に当たって討ち死に（史実。『一柳家記』）。本当に倒れ、隊は旗を守って攻め続ける
      if (!F.ichiShot && T > 30 && F.dai.count > 0) {
        F.ichiShot = true; rt.banner('一柳直末、撃たれる', '旗を倒すな'); rt.say('中村一氏', '一柳殿が鉄砲に当たられた！　隊は旗を守れ！', 4);
        const iu = F.ichi.units.find((u) => u.type === 'busho' && u.alive);
        if (iu) { sfx('gun', 0.7); iu.invuln = false; iu.hp = 0; rt.army.kill(iu, F.dai.units.find((u) => u.type === 'gun' && u.alive) || null); }
      }
      if (F.dai.count < 8 && !gone(F.dai)) F.dai.morale = Math.min(F.dai.morale, 20);
      if (gone(F.dai)) this.shoji(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.cross.x, p.z - F.cross.z);
      rt.objProgress('main', `堀の向こうまで あと${Math.round(d)}m`);
      // 堀の縁の兵は縁を離れず、上がって来る寄せ手を縁で迎える（一人を追って堀へ降りない）
      if (!F.rimOn && p.z < SHOJI.z1 + 30) { F.rimOn = true; F.rim.seekRange = 12; }
      // 本人が畝の上を渡り切ったら。堀の中で迷っても、本人が堀に入っていれば三分で次へ（立っているだけでは進まない）
      if ((p.z < SHOJI.z0 - 1 && d < 18) || (T > 180 && p.z < SHOJI.z1 + 10)) this.ote(rt);
    }
    if (F.step === 3) {
      const gate = F.K.gate && F.K.gate.struct;
      const dg = Math.hypot(p.x - SP.at.gate.x, p.z - SP.at.gate.z);
      rt.objProgress('main', F.sub === 'back' ? `大手門まで あと${Math.round(dg)}m` : '');
      // 打って出た隊が皆討たれた時は、門へ攻め寄せる段へ
      if (F.sub === 'sally' && gone(F.uma)) this.sallyBack(rt);
      if (!F.gateOpen && gate && (gate.alive === false || (gate.opened && F.K.tsukeiri))) this.openGate(rt, !!F.K.tsukeiri);
      // 付け入りが閉め切られた時は、寄せ手が門を打ち破る（長くかかる）
      if (!F.gateOpen && F.sub === 'back' && T > 200) this.openGate(rt, false);
    }
    if (F.step === 4) {
      const g = F.hon;
      rt.objProgress('main', '');
      if (!F.honOn && (Math.hypot(p.x - KURUWA.hon.x, p.z - KURUWA.hon.z) < 50 || T > 240)) {
        F.honOn = true; g.fixed = false; g.aggro = 14; g.order = 'attack'; g.seekRange = 26;
        rt.say('中村一氏', '本丸へ掛かれ！　松田の旗を倒せ！', 3.5);
        for (const q of F.toyo) if (!gone(q)) { q.order = 'path'; q.path = UP_ROUTE.slice(6); q.pathIdx = 0; q.speed = 2.4; q.onArrive = (r) => { r.order = 'attack'; r.seekRange = 40; }; }
      }
      if (F.ni && !gone(F.ni) && F.ni.count < 6) F.ni.morale = Math.min(F.ni.morale, 20);
      // 旗本の半ばが討たれると、城将も討てるようになる
      if (F.honOn && g.count < F.honN * 0.4 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 25); if (F.honU) F.honU.invuln = false; }
      if (gone(g) || (F.honU && !F.honU.alive)) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
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
t09_yamanaka.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.45) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = (F.toyo.find((g) => !gone(g)) || F.ichi).center();
  if (b.botRest && F.step !== 2) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  // 堀の中では寄り道をせず、畝の筋をまっすぐ渡る
  //   （目の前に来た敵だけは斬り払う）
  const e = b.army.nearestEnemy(u, F.step === 2 ? 3.5 : 12, (o) => !o.fleeing && !o.isStruct);
  if (F.step === 2 && !e) { inp.guardHold = false; goTo(p, inp, CROSS_X, u.pos.z > SHOJI.z0 - 4 ? SHOJI.z0 - 7 : F.cross.z, 1.5); return; }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1 && F.dai && !gone(F.dai)) { const t = F.dai.center(); goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 1) { goTo(p, inp, CROSS_X, SHOJI.z1 + 8, 3); return; }
  if (F.step === 3) {
    // 馬出しの右の口の前で待ち、打って出た隊と戦い、退く兵に続いて口・馬出し・土橋・門へ
    const A = SP.at, M = A.mouths[1];
    if (F.sub !== 'back') { goTo(p, inp, M.far.x, M.far.z, 3); return; }
    const W = [M.lane, M.outer, M.inner, A.uma, A.bridgeOut, A.bridgeIn, A.gateOut, A.plaza];
    b.botWp = Math.min(b.botWp || 0, W.length - 1);
    if (Math.hypot(u.pos.x - W[b.botWp].x, u.pos.z - W[b.botWp].z) < 2.5 && b.botWp < W.length - 1) b.botWp++;
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
const cnt = (u) => u.alive && !u.dying && !u.evacuatedWound;   // gone（b_inabayama.js）と同じ：皆倒れるか退けば崩れた
KILLS.t09_yamanaka = (rt) => {
  const F = rt.flags;
  return F.ending ? null : F.step === 1 ? broke([F.dai], cnt) : null;   // 人数を数える目標は出丸の一つだけ（kaito AR 1）
};
withGuard(t09_yamanaka);

export { t09_yamanaka };
export default t09_yamanaka;
