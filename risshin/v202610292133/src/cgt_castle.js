// 城と砦の建物を、買った城の部品（CGTrader「Japanese Castle Modular Kit」。cgt.js）と、Sketchfab の櫓門（Object_4・CC BY 4.0）で組む共通の口。
// 当たり・火・壊れる仕組みは、今までの手作りの形（props.js の sumiyagura・yaguramon・tamon・dobei、castle_bldg.js の櫓）がそのまま持つ。
// ここでは見た目だけを替える：部品が読めたら手作りの形の絵の部分を隠し、同じ所に部品で組んだ形を置く。手作りの形の傾き・倒れ・消えるは、部品の形が受け継ぐ。
// 同じ材質の部品は、城ひとつで材質ごとに一つの BatchedMesh へ束ねる（props.js の kitBatchMesh。建物一つが一つの実体）。
// 細かさは三段：近く（42m まで）は部品のまま、その先は頂点をまとめた粗い形、95m より先はもっと粗い形（kitBatchMesh の lodPair）。画面で小さすぎる物は描かない。
// 壁の仕上げは戦ごとに選ぶ（castleStyle）：shikkui＝白漆喰（安土より後の石垣の城）・kuro＝黒い下見板と白壁・ita＝板壁（褪せた板）・tsuchi＝土壁。
// 部品の向き：部品の座標で幅は +x へ 2m、外は +z、足もとが y=0（cgt.js）。建物の座標（Lr と同じ）の局所 +z が建物の前。
import * as THREE from 'three';
import { cgtOn, cgtParts, cgtMat, cgtMatName, whenCgt, cgtScene } from './cgt.js';
import { kitBatchMesh } from './props.js';

// ---- 戦ごとの壁の仕上げ ----
// 織田の頃の城は白漆喰ばかりでない（kaito 10/28）：本の写真と縄張りの頃に合わせる。def.world.castleWall があればそれを使う
export const NO_HIDE = new Set();   // 隠さない（手作りの形の外に部品を張るだけ）
const STYLE = {
  inabayama: 'kuro', gifu: 'kuro', odani: 'ita', iwamura: 'kuro', takato: 'ita', takato_siege: 'ita', miki: 'ita', tottori: 'ita',
  shigisan: 'tsuchi', arioka: 'shikkui', azuchi: 'shikkui', nagashinojo: 'ita', kanegasaki: 'ita', kiyosu: 'kuro', sunomata: 'ita',
  mitsukuri: 'ita', kinome: 'ita', okawachi: 'ita', tennoji: 'ita', nagashima: 'ita',
};
export function castleStyle(world) {
  const d = world?.def || {};
  return d.castleWall || STYLE[d.battleKey] || STYLE[d.key] || 'kuro';
}
// 仕上げごとの材質の色（買った部品の絵に掛ける。1 より大きいと明るく）。無い物は部品のまま
const TINT = {
  tsuchi: { Plaster: [0.8, 0.69, 0.53] },
  ita: { Wood_Black: [2.3, 2.0, 1.65], Plaster: [0.86, 0.8, 0.7] },
  kuro: {},
  shikkui: {},
};
const MATS = new Map();
// extra：部品の棚（下の castlePart）が一つの積み物だけに掛ける色（石垣の積み方・塀の土の色）。{ id, 材質名: [r,g,b] }
function styledMat(name, style, extra) {
  const base = cgtMat(name);
  if (!base) return null;
  const t = extra?.[name] || TINT[style]?.[name];
  if (!t) return base;
  const k = name + ':' + style + ':' + (extra?.[name] ? extra.id : '');
  let m = MATS.get(k);
  if (!m) { m = base.clone(); m.color.setRGB(t[0], t[1], t[2]); MATS.set(k, m); }
  return m;
}

// ---- 部品を積む入れ物（建物一つぶん。材質ごとに形をためる） ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
class Pile {
  constructor(style) { this.style = style; this.by = new Map(); this.tris = 0; this.n = 0; this.swap = null; this.extra = null; }
  _mat(name) { return styledMat(this.swap?.[name] || name, this.style, this.extra); }
  _push(mat, g) { let a = this.by.get(mat); if (!a) this.by.set(mat, (a = [])); a.push(g); this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  // cgt.js の KitBatch.add と同じ形（kitStoneSeg・kitStoneRect もこれに積める）
  add(name, x, y, z, rot = 0, sx = 1, sy = 1, sz = 1) {
    const ps = cgtParts(name);
    if (!ps) return false;
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, rot), _s.set(sx, sy, sz));
    for (const { geo, m } of ps) { const mt = this._mat(cgtMatName(m)); if (mt) this._push(mt, geo.clone().applyMatrix4(_m)); }
    this.n++;
    return true;
  }
  addBox(matName, cx, cy, cz, w, h, d, rot = 0) {
    const mt = this._mat(matName);
    if (!mt) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    g.rotateY(rot); g.translate(cx, cy, cz);
    this._push(mt, g);
  }
  addGeo(matName, geo) { const mt = this._mat(matName); if (mt) this._push(mt, geo); }
}

// 建物の座標の枠：中心 x,z、向き rot、足もとの高さ y。部品の座標（2m の升）を SX・SZ 倍して建物の大きさに合わせ、高さは SY 倍
function frame(pile, x, z, rot, y, SX, SY, SZ) {
  const c = Math.cos(rot), s = Math.sin(rot);
  // lx・lz：部品の座標（升の単位のまま）、r：建物の中での向き（0・π/2・π・-π/2）、sy：この部品だけの高さの倍率
  return (name, lx, ly, lz, r = 0, sy = SY) => {
    const X = lx * SX, Z = lz * SZ, odd = Math.abs(Math.sin(r)) > 0.5;
    return pile.add(name, x + X * c + Z * s, y + ly * SY, z - X * s + Z * c, rot + r, odd ? SZ : SX, sy, odd ? SX : SZ);
  };
}
const SIDES = (N, M) => [
  // [始まりの x, z, 向き, 升の数, 進む向き dx, dz]
  [-N, M, 0, N, 2, 0], [N, M, Math.PI / 2, M, 0, -2], [N, -M, Math.PI, N, -2, 0], [-N, -M, -Math.PI / 2, M, 0, 2],
];
const H = (i, j) => { let h = Math.imul(i * 73 + j * 151 + 7, 2654435761) >>> 0; return (h ^ (h >>> 13)) % 1000 / 1000; };
// 一つの階の四方の壁（N×M 升の半分の数＝外のり 2N×2M）。courses：下から 'P'（2m の段）・'h'（1m の段）・'W'（窓の 2m の段）
// panel(面, 升)：2m の段の部品の種類。front：前の面（面 0）の真ん中の升に戸
function storey(put, st, N, M, y, courses, o = {}) {
  const W = st === 'shikkui' || st === 'tsuchi' ? 'White' : 'Black';
  let yy = y;
  for (const c of courses) {
    const hgt = c === 'h' ? 1 : 2;
    SIDES(N, M).forEach(([sx, sz, r, n, dx, dz], f) => {
      for (let i = 0; i < n; i++) {
        let name;
        if (c === 'h') name = st === 'ita' ? 'Wall_Black_Plain' : 'Wall_White_Plain_H1';
        else if (c === 'W') name = (st === 'ita' ? 'Wall_Black_' : 'Wall_White_') + ((i + f) % 2 === 0 || n <= 2 ? 'Window' : 'Plain');
        else {
          const k = H(i + f * 5, yy * 3 + (o.seed || 0));
          name = `Wall_${W}_` + (o.loop === false ? 'Plain' : k < 0.45 ? 'Loophole' : k < 0.75 ? 'Window' : 'Plain');
        }
        put(name, sx + dx * i, yy, sz + dz * i, r, c === 'h' && st === 'ita' ? 0.5 * put.SY : undefined);
      }
    });
    // 隅の柱（段ごと）
    for (const [px, pz] of [[-N, M], [N, M], [N, -M], [-N, -M]]) put((W === 'Black' && c !== 'h') || st === 'ita' ? 'Post_Black' : 'Post_White', px, yy, pz, 0, hgt / 2 * put.SY);
    yy += hgt;
  }
  return yy;
}
// 腰の段の屋根（下の階 N×M の壁の上。上の階は一升ずつ内へ）
function tierRoof(put, N, M, y, sr) {
  SIDES(N, M).forEach(([sx, sz, r, n, dx, dz]) => {
    put('Roof_Tier_S1_CornerOut', sx, y, sz, r, sr);
    for (let i = 1; i < n - 1; i++) put('Roof_Tier_S1_Straight', sx + dx * i, y, sz + dz * i, r, sr);
  });
}
// 上の屋根（奥行き 2 升＝D2 の寄棟。N 升の長さ）と、棟の両端の鯱
function topRoof(put, N, y, sr, shachi = true) {
  put('Roof_Top_D2_EndHip', -N, y, 2, 0, sr);
  put('Roof_Top_D2_EndHip', N, y, -2, Math.PI, sr);
  for (let i = 1; i < N - 1; i++) put('Roof_Top_D2_Middle', -N + 2 * i, y, 2, 0, sr);
  if (shachi) { put('Shachi', -N + 2.1, y + 2.0 * sr / put.SY, 0, 0, sr); put('Shachi', N - 2.1, y + 2.0 * sr / put.SY, 0, Math.PI, sr); }
}

// ---- 建物の形 ----
// 二重櫓・隅櫓：中心 x,z、向き rot、足もと y（台の天端）、外のり w×d（長い方を x へ）、一重の高さ h1・二重の高さ h2
export function kitNijuYagura(pile, s) {
  let { x, z, rot = 0, y, w, d, h1 = 3.35, h2 = 2.6, stone } = s;
  if (d > w) { [w, d] = [d, w]; rot += Math.PI / 2; }
  const N = Math.max(2, Math.round(w / 2)), M = 2;   // 下は N×3 升の半分→外のり 2N×4。上の階は奥行き 2 升
  const Ml = 3 / 2 * M;   // 一重の奥行きの半分（3 升＝6m を d に合わせる）
  const SX = w / (2 * N), SZ = d / (2 * Ml), SY = h1 / 4;
  const put = frame(pile, x, z, rot, y, SX, SY, SZ); put.SY = SY;
  if (stone) kitStoneRect(pile, x, z, w + 1.2, d + 1.2, rot, y + 0.02, stone);
  const st = pile.style;
  storey(put, st, N, Ml, 0, ['P', 'h', 'h'], { seed: s.seed });
  tierRoof(put, N, Ml, 4, 1);
  // 二重目：内へ一升ずつ（N-1 × 2 升）。高さ h2
  const put2 = frame(pile, x, z, rot, y + h1, SX, h2 / 4, SZ); put2.SY = h2 / 4;
  storey(put2, st, N - 1, Ml - 1, 0, ['h', 'W', 'h']);
  topRoof(put2, N - 1, 4, Math.max(0.85, SY));
}
// 多聞櫓・渡櫓（一重の長屋）：中心 x,z、向き rot（局所 x が長さ）、足もと y、長さ len・奥行き d・壁の高さ h
export function kitNagaYagura(pile, s) {
  const { x, z, rot = 0, y, len, d, h = 2.8, roof = 1 } = s;
  const N = Math.max(2, Math.round(len / 2)), SX = len / (2 * N), SZ = d / 4, SY = h / 3;
  const put = frame(pile, x, z, rot, y, SX, SY, SZ); put.SY = SY;
  storey(put, pile.style, N, 2, 0, ['P', 'h'], { seed: s.seed });
  topRoof(put, N, 3, roof * Math.max(0.8, SY), s.shachi ?? false);
}
// 城の中の家（長屋・台所・遠侍・蔵）の四方の壁：手作りの箱の壁の 0.16m 外に、部品の壁（腰の 2m の段と 1m の段）を張る。
// 屋根・妻・柱は手作りのまま（隠さない）。gaps：前の面（局所 +z）の戸口の位置（局所 x）。その升は張らず、奥の手作りの戸が見える
export function kitHouseWalls(pile, s) {
  const { x, z, rot = 0, y, w, d, h, gaps = [] } = s;
  const W2 = w + 0.32, D2 = d + 0.32, N = Math.max(1, Math.round(W2 / 2)), M = Math.max(1, Math.round(D2 / 2));
  const SX = W2 / (2 * N), SZ = D2 / (2 * M), SY = h / 2;   // 家は 2m の段一つを壁の高さに伸ばす（面を増やさない）
  const put = frame(pile, x, z, rot, y, SX, SY, SZ); put.SY = SY;
  const st = pile.style, B = st === 'shikkui' || st === 'tsuchi' ? 'White' : 'Black';
  SIDES(N, M).forEach(([sx, sz, r, n, dx, dz], f) => {
    for (let i = 0; i < n; i++) {
      const lx0 = (sx + dx * i) * SX, lx1 = lx0 + 2 * SX;
      if (f === 0 && gaps.some((g) => g > lx0 - 0.5 && g < lx1 + 0.5)) continue;
      const win = (f === 0 || f === 2) && n > 1 && H(i + f * 3, Math.round(x)) < 0.4;
      put(`Wall_${B}_${win ? 'Window' : 'Plain'}`, sx + dx * i, 0, sz + dz * i, r);
    }
  });
  for (const [px, pz] of [[-N, M], [N, M], [N, -M], [-N, -M]]) put(B === 'Black' ? 'Post_Black' : 'Post_White', px, 0, pz, 0, SY);
}
// 土塀の一区画 a→b（足もと yAt(t)、塀の高さ h）。2m ごとに Dobei_Plain と Dobei_Loophole を交互に
export function kitDobeiSeg(pile, s) {
  const { ax, az, bx, bz, h = 2.3, yAt } = s;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.8) return;
  const n = Math.max(1, Math.round(len / 2)), w = len / n, dx = (bx - ax) / len, dz = (bz - az) / len, rot = Math.atan2(-dz, dx);
  const sy = (h + 0.35) / 2.52;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, y = Math.min(yAt(t0), yAt(t1), yAt((t0 + t1) / 2)) - 0.12;
    pile.add(i % 2 ? 'Dobei_Loophole' : 'Dobei_Plain', ax + dx * w * i, y, az + dz * w * i, rot, w / 2, sy, 1);
  }
}
// 四角い石垣の台（kitStoneRect と同じ：足もとが輪郭に収まるよう天端の線を内へ）。top：天端、bot：足もと
export function kitStoneRect(pile, cx, cz, w, d, rot, top, bot) {
  const c = Math.cos(rot), s = Math.sin(rot), P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const Hh = top - bot, zs = 0.34, inset = Math.min(0.55 * Hh * zs, w / 2 - 0.2, d / 2 - 0.2), hw = w / 2 - inset, hd = d / 2 - inset;
  const q = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)], HS = [2, 4, 6, 8];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = q[i], [bx, bz] = q[(i + 1) % 4];
    // 角を順に回ると外は右手側：部品の外（+z）を右手へ向ける＝b→a の向きで並べる
    const len = Math.hypot(bx - ax, bz - az) + 1.4, dx = (ax - bx) / (len - 1.4), dz = (az - bz) / (len - 1.4), rr = Math.atan2(-dz, dx);
    const n = Math.max(1, Math.round(len / 2)), ww = len / n;
    let k = 0, best = 9; for (let j = 0; j < 4; j++) { const e = Math.abs(Math.log(Math.max(1.2, Hh) / HS[j])); if (e < best) { best = e; k = j; } }
    const hm = HS[k], sy = Math.max(1.2, Hh) / hm;
    for (let j = 0; j < n; j++) pile.add(`Base_H${hm}_Straight${hm === 8 ? '' : ['', '_B', '_C'][(i + j) % 3]}`, bx - dx * 0.7 + dx * ww * j, bot, bz - dz * 0.7 + dz * ww * j, rr, ww / 2, sy, zs);
  }
  pile.addBox('Gravel', cx, top - 0.38, cz, w - inset * 2 + 0.6, 0.7, d - inset * 2 + 0.6, rot);
}

// ---- Sketchfab の櫓門（Object_4）：形だけを使い、面の種類ごとに買った部品の絵を張る（tools/gate_obj4.mjs） ----
const GATE_MAT = ['Plaster', 'Wood', 'Wood_Black', 'Kawara', 'Stone', 'Iron'];
let GATE = null, gateLoading = null;
function loadGate() {
  if (gateLoading) return gateLoading;
  gateLoading = import('./asset_gate4.js').then(({ default: b64 }) => {
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)), dv = new DataView(bin.buffer);
    const n = dv.getUint32(4, true), out = [];
    let o = 8 + n * 12;
    const p4 = (k) => (k + 3) & ~3;
    for (let g = 0; g < n; g++) {
      const k = bin[8 + g * 12], v = dv.getUint32(8 + g * 12 + 4, true), t = dv.getUint32(8 + g * 12 + 8, true);
      const Pq = new Int16Array(bin.buffer, o, v * 3); o += p4(v * 6);
      const Nq = new Int8Array(bin.buffer, o, v * 4); o += p4(v * 4);
      const Uq = new Int16Array(bin.buffer, o, v * 2); o += p4(v * 4);
      const Iq = new Uint16Array(bin.buffer, o, t * 3); o += p4(t * 6);
      const P = new Float32Array(v * 3), N = new Float32Array(v * 3), U = new Float32Array(v * 2);
      for (let i = 0; i < v; i++) for (let c = 0; c < 3; c++) { P[i * 3 + c] = Pq[i * 3 + c] / 32767 * 8; N[i * 3 + c] = Nq[i * 4 + c] / 127; }
      for (let i = 0; i < v * 2; i++) U[i] = Uq[i] / 256;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geo.setIndex(new THREE.BufferAttribute(Iq.slice(), 1));
      out.push({ mat: GATE_MAT[k], geo });
    }
    GATE = out;
    return out;
  }).catch(() => null);
  return gateLoading;
}
// 元の大きさ：x -2.30〜2.26・y 0〜4.71・z -1.90〜0.48。外のり Lw×D・高さ Ht に合わせて置く（足もと y）
export function kitGateObj4(pile, s) {
  if (!GATE) return false;
  const { x, z, rot = 0, y, Lw, D = 4.2, Ht = 7.6 } = s;
  const sx = Lw / 4.56, sy = Ht / 4.71, sz = D / 2.38;
  _m.compose(_p.set(0, 0, 0), _q.identity(), _s.set(sx, sy, sz));
  const T = new THREE.Matrix4().makeTranslation(0.02, 0, 0.71).premultiply(_m);
  T.premultiply(new THREE.Matrix4().makeRotationY(rot)).premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
  for (const { mat, geo } of GATE) {
    const g = geo.clone().applyMatrix4(T);
    // 張った絵の大きさは元の 1m に 1 のまま（伸ばした分だけ絵も伸びる）。瓦は細かく
    if (mat === 'Kawara') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 1.6); }
    pile.addGeo(mat, g);
  }
  return true;
}

// ---- 手作りの形の見た目を替える ----
// 城ひとつ（舞台ひとつ）で、材質ごとに形をためて、少し待ってまとめて一つずつの BatchedMesh にする
let Q = { scene: null, pend: new Map(), timer: 0, tris: 0 };
const BUDGET = 240000, HOUSE_BUDGET = 90000;   // 舞台ひとつで部品の建物に使う面（細かい形の合計。描くのは近くだけ・遠くは粗い形）。家の壁はその内の 9 万まで
// 手作りの形の傾き・見える見えないを受け継ぐ代わりの物（props.js の BatchedPart.setKit に渡す grp の代わりにもなる）
class KitProxy {
  constructor() {
    this.insts = []; this._vis = true; this.matrixAutoUpdate = false; this.matrixWorldNeedsUpdate = false;
    const self = this;
    this.matrix = new (class extends THREE.Matrix4 { copy(m) { super.copy(m); self._sync(); return this; } })();
  }
  _addInst(mesh, id) { this.insts.push([mesh, id]); if (!this._vis) mesh.setVisibleAt(id, false); else if (this._moved) mesh.setMatrixAt(id, this.matrix); }
  _sync() { this._moved = true; for (const [mesh, id] of this.insts) mesh.setMatrixAt(id, this.matrix); }
  get visible() { return this._vis; }
  set visible(v) { if (v === this._vis) return; this._vis = v; for (const [mesh, id] of this.insts) mesh.setVisibleAt(id, v); }
}
// Group の手作りの形は、描く前に世界の行列と見える見えないを見て写す（壊れて傾く・倒れて消えるを受け継ぐ）
const WATCH = [];
const _w = new THREE.Matrix4();
function watchGroup(ret, px) {
  WATCH.push({ ret, px, last: new THREE.Matrix4().identity() });
}
function tick() {
  for (let i = WATCH.length - 1; i >= 0; i--) {
    const e = WATCH[i];
    let o = e.ret, vis = true, root = null;
    while (o) { if (!o.visible) vis = false; root = o; o = o.parent; }
    if (!root || !root.isScene) { if (!e.ret.parent) { e.px.visible = false; } continue; }
    e.px.visible = vis;
    if (!vis) continue;
    e.ret.updateWorldMatrix(true, false);
    _w.copy(e.ret.matrixWorld);
    if (!_w.equals(e.last)) { e.last.copy(_w); e.px.matrix.copy(_w); }
  }
}
function flush() {
  Q.timer = 0;
  const scene = Q.scene;
  if (!scene) { Q.pend.clear(); return; }
  for (const [mat, list] of Q.pend) {
    if (!list.length) continue;
    const bm = kitBatchMesh(list, mat);
    bm.userData.camBlock = true; bm.userData.cgtCastle = true;
    if (WATCH.length) { const ob = bm.onBeforeRender; let f = -1; bm.onBeforeRender = function (r, sc, cam, g, m) { const k = r.info.render.frame; if (k !== f) { f = k; tick(); } ob.call(this, r, sc, cam, g, m); }; }
    scene.add(bm);
  }
  Q.pend.clear();
}
// ret（手作りの形：Group か BatchedPart）の見た目を、build(pile) で組んだ部品の形に替える。
// hide：隠す手作りの材質（Material の Set。無ければ全部）。部品が読めない・面の予算を超えた時は手作りのまま
export function kitReplace(ret, style, build, o = {}) {
  if (!ret) return;
  kitQueue(style, build, o, (px) => hideHandmade(ret, px, o.hide));
}
// 手作りの形が無い時（部品の棚で置くだけ）も同じ入れ物に積む。px（KitProxy）を作って onPx(px) に渡す
function kitQueue(style, build, o, onPx) {
  const D = (globalThis.__kitDbg ||= { call: 0, built: 0, over: 0, err: 0 }); D.call++;
  if (!cgtOn()) return;
  const need = o.gate ? loadGate() : null;
  Promise.resolve(need).then(() => whenCgt(() => {
    const scene = o.scene || cgtScene();
    if (!scene) return;
    if (Q.scene !== scene) { if (Q.timer) clearTimeout(Q.timer); Q = { scene, pend: new Map(), timer: 0, tris: 0, house: 0 }; WATCH.length = 0; }
    const pile = new Pile(style);
    try { if (build(pile) === false) return; } catch (e) { D.err++; D.e = String(e); return; }
    if (!pile.by.size || Q.tris + pile.tris > BUDGET || (o.house && Q.house + pile.tris > HOUSE_BUDGET)) { D.over++; for (const l of pile.by.values()) for (const g of l) g.dispose(); return; }
    Q.tris += pile.tris; if (o.house) Q.house += pile.tris; D.built++; D.tris = Q.tris;
    const px = o.px || new KitProxy();
    onPx(px);
    for (const [mat, list] of pile.by) {
      const geo = list.length > 1 ? mergeAll(list) : list[0];
      if (!geo) continue;
      geo.computeBoundingSphere();
      let a = Q.pend.get(mat); if (!a) Q.pend.set(mat, (a = []));
      a.push({ geo, part: px });
    }
    if (!Q.timer) Q.timer = setTimeout(flush, 0);
  }));
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function mergeAll(list) { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); return g; }
function hideHandmade(ret, px, hide) {
  if (ret.isBatchedPart) { ret.setKit(px, hide); return; }
  ret.traverse((c) => { if (c.isMesh && (!hide || hide.has(c.material))) c.visible = false; });
  watchGroup(ret, px);
}

// ======================================================================
// 城の部品の棚（ui/parts_castle）：櫓門・高麗門・薬医門・冠木門・二重櫓・隅櫓・多聞櫓・石垣（野面積み・打込み接ぎ）・
// 塀（白漆喰・黒い下見板・土壁・板塀）・狭間・石落とし・土橋・木橋・馬出し・枡形・喰違。
// 見た目だけ：当たり・火・壊れる仕組みは castle_parts.js などの手作りの形（箱）が持つ。
//   castlePartOver(ret, world, '種類', 寸法)：手作りの形 ret の絵を隠し、同じ所に棚の部品を置く（kitReplace と同じ。傾き・倒れ・消えるを受け継ぐ）
//   castlePart(world, '種類', 寸法)：手作りの形の無い所に置くだけ（飾りの塀・遠くの櫓）。戻り値の px.visible=false で消せる
// 時代で選べる（castleEra）：'early'＝織田の前半（土と板：冠木門・板の櫓門・板塀や土壁・低い野面積み）、
//   'late'＝安土より後（石垣と白壁：高麗門・大きな櫓門・白漆喰の土塀・野面積み）、'keicho'＝関ヶ原・大坂の頃（打込み接ぎ）。
//   def.castleEra があればそれ、無ければ壁の仕上げ（castleStyle）と戦の名から決める。寸法の era で一つずつ替えてもよい。
// 寸法の座標は今までと同じ：中心 x,z・向き rot（局所 +z が外・前）・足もと y（無ければ地面の高さ）。線の部品は pts：[[x,z],…]。
// 同じ材質は舞台ひとつで束ね（BatchedMesh）、細かさは三段（kitBatchMesh の lodPair）。毎コマ new しない（置く時だけ組む）。
// ======================================================================
const KEICHO = new Set(['sekigahara', 'osaka', 'osaka_fuyu', 'osaka_natsu', 'fushimi', 'gifu1600', 'ueda']);
export function castleEra(world) {
  const d = world?.def || {};
  if (d.castleEra) return d.castleEra;
  if (KEICHO.has(d.battleKey) || KEICHO.has(d.key)) return 'keicho';
  return castleStyle(world) === 'shikkui' ? 'late' : 'early';
}
// 局所の座標で置く道具（メートル）。P(lx, lz)→世界の [x, z]
function local(pile, x, z, rot, y) {
  const c = Math.cos(rot), s = Math.sin(rot), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  return {
    P,
    put: (name, lx, ly, lz, r = 0, sx = 1, sy = 1, sz = 1) => { const [X, Z] = P(lx, lz); return pile.add(name, X, y + ly, Z, rot + r, sx, sy, sz); },
    // 箱：足もと ly0 から高さ h（中心でなく下の面で置く）
    box: (mat, lx, ly0, lz, w, h, d, r = 0) => { const [X, Z] = P(lx, lz); pile.addBox(mat, X, y + ly0 + h / 2, Z, w, h, d, rot + r); },
  };
}
const flatY = (s) => (s.y ?? s.yAt?.(s.x, s.z) ?? 0);
// 木の色：黒い下見板の城は柿渋の黒、ほかは素木（Wood）
const woodOf = (st) => (st === 'kuro' ? 'Wood_Black' : 'Wood');

// ---- 門 ----
// 冠木門（土と板の頃の門）：二本の鏡柱に冠木を渡し、控柱と貫で支える。屋根は無し。Lw＝柱の間、Ht＝冠木の高さ
export function kitKabukimon(pile, s) {
  const { x, z, rot = 0, Lw = 4.2, Ht = 4.0, doors = true } = s, y = flatY(s);
  const { box } = local(pile, x, z, rot, y), W = woodOf(pile.style), hx = Lw / 2 + 0.17;
  for (const sd of [-1, 1]) {
    box(W, sd * hx, -0.3, 0, 0.34, Ht + 0.3, 0.34);                  // 鏡柱
    box(W, sd * hx, -0.3, -1.5, 0.22, Ht * 0.62 + 0.3, 0.22);         // 控柱
    box(W, sd * hx, Ht * 0.48, -0.75, 0.12, 0.16, 1.5);               // 控柱との貫
    box('Stone', sd * hx, -0.32, 0, 0.62, 0.36, 0.62);                // 礎石
  }
  box(W, 0, Ht - 0.05, 0, Lw + 1.6, 0.36, 0.4);                       // 冠木（両へ突き出す）
  box(W, 0, Ht - 0.62, 0, Lw + 0.3, 0.16, 0.2);                       // 貫
  if (doors) for (const sd of [-1, 1]) {                              // 扉（閉じた二枚。横の桟）
    box('Wood', sd * Lw / 4, 0.05, -0.1, Lw / 2 - 0.06, Ht - 0.75, 0.1);
    for (const k of [0.18, 0.5, 0.82]) box('Wood_Black', sd * Lw / 4, 0.05 + (Ht - 0.75) * k, -0.04, Lw / 2 - 0.2, 0.12, 0.06);
  }
}
// 高麗門（買った Gate_Kourai。幅 5.1m・高さ 6.1m）：Lw＝外のりの幅
export function kitKourai(pile, s) {
  const { x, z, rot = 0, Lw = 5.1, Ht } = s, k = Lw / 5.1;
  pile.add('Gate_Kourai', x, flatY(s), z, rot, k, (Ht ?? 6.06 * k) / 6.06, k);
}
// 薬医門（買った SM_Yakuimon。門を抜ける向きが部品の x 軸。屋根ごとの幅 8.9m・抜ける向きの長さ 10.9m）：Lw＝屋根ごとの幅
export function kitYakuimon(pile, s) {
  const { x, z, rot = 0, Lw = 8.9 } = s, k = Lw / 8.94;
  local(pile, x, z, rot, flatY(s)).put('SM_Yakuimon', -0.8 * k, 0, 0, -Math.PI / 2, k, k, k);
}
// 櫓門：late は大きな櫓門（Object_4。読めていない時は板の櫓門）、early は板の櫓門（冠木門の上に板壁の渡櫓）
// w＝門の口の幅、len＝渡櫓の長さ（既定 w+5.6）、D＝奥行き、Ht＝渡櫓の床の高さ
export function kitYaguramon(pile, s) {
  const { x, z, rot = 0, w = 4.6, D = 4.2, era = 'late' } = s, y = flatY(s), len = s.len ?? w + 5.6;
  if (era !== 'early' && kitGateObj4(pile, { x, z, rot, y: y - 0.05, Lw: len, D: D + 0.2, Ht: 7.7 })) return;
  const Ht = s.Ht ?? 3.7, { box } = local(pile, x, z, rot, y), W = woodOf(pile.style);
  kitKabukimon(pile, { x, z, rot, y, Lw: w, Ht: Ht - 0.45 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(W, sx * (len / 2 - 0.3), -0.3, sz * (D / 2 - 0.3), 0.32, Ht + 0.3, 0.32);   // 四隅の柱
  for (const sz of [-1, 1]) box(W, 0, Ht - 0.4, sz * (D / 2 - 0.3), len, 0.36, 0.36);                                              // 桁
  box('Wood', 0, Ht - 0.04, 0, len, 0.2, D);                                                                                         // 床
  kitNagaYagura(pile, { x, z, rot, y: y + Ht + 0.16, len, d: D, h: 2.5, seed: Math.round(x + z * 5) });
}

// ---- 櫓 ----
// 石落とし：壁の面（局所 z=0）から外へ張り出す小さな出窓。底が開いて真下へ石や鉄砲を落とす。w・h＝幅・高さ、out＝張り出し
export function kitIshiotoshi(pile, s) {
  const { x, z, rot = 0, w = 1.9, h = 1.7, out = 0.6 } = s, y = flatY(s);
  const { box, put } = local(pile, x, z, rot, y), st = pile.style;
  const face = st === 'shikkui' || st === 'tsuchi' ? 'Plaster' : 'Wood_Black';
  box(face, 0, 0.35, out / 2, w, h - 0.35, out);                     // 張り出しの箱
  box('Wood_Black', 0, 0, out * 0.3, w, 0.35, out * 0.4, 0);          // 開いた底（暗い板）
  for (const sd of [-1, 1]) box('Wood_Black', sd * (w / 2 - 0.05), 0, out / 2, 0.1, h, out + 0.04);   // 両の柱
  put('Roof_Tier_S1_Straight', -w / 2 - 0.15, h + 0.05, out - 0.25, 0, (w + 0.3) / 2, 0.42, 0.36);    // 小さな屋根
}
// 隅櫓：二重櫓を石垣（stone＝足もと。無ければ石垣なし）の台に載せ、外の二面（+z・+x）に石落とし
export function kitSumiYagura(pile, s) {
  let { x, z, rot = 0, w = 7.2, d = 6.2, h1 = 3.6, h2 = 2.5, otoshi = true } = s; const y = flatY(s);
  kitNijuYagura(pile, { x, z, rot, y, w, d, h1, h2, stone: s.stone, seed: s.seed ?? Math.round(x * 3 + z * 7) });
  if (!otoshi) return;
  const { P } = local(pile, x, z, rot, y);
  { const [X, Z] = P(w * 0.18, d / 2 + 0.12); kitIshiotoshi(pile, { x: X, z: Z, rot, y: y + 0.1, h: Math.min(1.8, h1 * 0.5) }); }
  { const [X, Z] = P(w / 2 + 0.12, -d * 0.12); kitIshiotoshi(pile, { x: X, z: Z, rot: rot + Math.PI / 2, y: y + 0.1, h: Math.min(1.8, h1 * 0.5) }); }
}
// 二重櫓・多聞櫓は上の kitNijuYagura・kitNagaYagura（棚の名は niju・tamon）

// ---- 石垣 ----
// 線の石垣：pts の順に歩いて右手が外。top（数か (x,z)→高さ）が天端、yAt が足もと（その 0.9m 下から積む）。
// kind：'nozura'＝野面積み（自然の石。色に濃淡・勾配ゆるく）、'uchikomi'＝打込み接ぎ（割って面をそろえた石。明るく・勾配きつく）
const STONE_TINT = { nozura: { id: 'nz', Stone: [1.02, 0.96, 0.8], Stone_Dark: [0.62, 0.58, 0.5] }, uchikomi: { id: 'uk', Stone_Dressed: [1.45, 1.43, 1.36], Stone_Dark: [1.1, 1.08, 1.02] } };
export function kitIshigaki(pile, s) {
  const { pts, yAt, closed = false } = s, kind = s.kind || (s.era === 'keicho' ? 'uchikomi' : 'nozura');
  const topAt = typeof s.top === 'function' ? s.top : () => s.top;
  const zs = s.slope ?? (kind === 'uchikomi' ? 0.28 : 0.4), HS = [2, 4, 6, 8];
  const keepE = pile.extra, keepS = pile.swap; pile.extra = STONE_TINT[kind] || null;
  if (kind === 'uchikomi') pile.swap = { Stone: 'Stone_Dressed' };   // 割った石の面（土塀の腰の切石の絵）
  const n = pts.length - (closed ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
    const dx = (ax - bx) / L, dz = (az - bz) / L, rr = Math.atan2(-dz, dx), m = Math.max(1, Math.round(L / 2)), ww = L / m;
    for (let j = 0; j < m; j++) {
      const px = bx + dx * ww * j, pz = bz + dz * ww * j, cx = px + dx * ww / 2, cz = pz + dz * ww / 2;
      const bot = Math.min(yAt(px, pz), yAt(cx, cz), yAt(px + dx * ww, pz + dz * ww)) - 0.9, Hh = Math.max(1.2, topAt(cx, cz) - bot);
      let k = 0, best = 9; for (let q = 0; q < 4; q++) { const e = Math.abs(Math.log(Hh / HS[q])); if (e < best) { best = e; k = q; } }
      const hm = HS[k], v = kind === 'uchikomi' || hm === 8 ? '' : ['', '_B', '_C'][(i * 7 + j) % 3];
      pile.add(`Base_H${hm}_Straight${v}`, px, bot, pz, rr, ww / 2, Hh / hm, zs);
    }
  }
  pile.extra = keepE; pile.swap = keepS;
}
// 石垣と白壁の塀の一続き（買った SM_IshigakiHei。長さ 15.5m・高さ 3.9m）を a→b に伸ばして並べる
export function kitIshigakiHei(pile, s) {
  const { ax, az, bx, bz, yAt } = s, L = Math.hypot(bx - ax, bz - az); if (L < 1) return;
  const m = Math.max(1, Math.round(L / 15.5)), ww = L / m, dx = (bx - ax) / L, dz = (bz - az) / L, rr = Math.atan2(-dz, dx);
  for (let j = 0; j < m; j++) {
    const ex = ax + dx * ww * (j + 1), ez = az + dz * ww * (j + 1);   // 部品の原点は右の端（x=0.12）。左へ 15.5m 伸びる
    const y = Math.min(yAt(ex, ez), yAt(ex - dx * ww, ez - dz * ww), yAt(ex - dx * ww / 2, ez - dz * ww / 2)) - 0.2;
    pile.add('SM_IshigakiHei', ex, y, ez, rr, ww / 15.48, s.sy ?? 1, 1);
  }
}

// ---- 塀・狭間 ----
// 狭間（板塀の面の穴を暗い鉄の色で）：kind 'shikaku'（鉄砲）・'naga'（矢の縦長）
export function kitSama(pile, s) {
  const { x, z, rot = 0, kind = 'shikaku' } = s, y = flatY(s), { box } = local(pile, x, z, rot, y);
  if (kind === 'naga') box('Iron', 0, 0, 0, 0.13, 0.42, 0.05); else box('Iron', 0, 0, 0, 0.2, 0.2, 0.05);
}
// 塀：pts の線に沿って。kind：'shikkui'（白漆喰の土塀・瓦）・'kuro'（土塀の下を黒い下見板）・'tsuchi'（土壁の色の土塀）・'ita'（板塀・板の笠木と狭間）
// h＝塀の高さ、yAt＝地面、sama＝狭間の間（m。0 で無し）
const TSUCHI = { id: 'tc', Plaster: [0.8, 0.68, 0.52], Stone_Dressed: [0.8, 0.74, 0.66] };
export function kitHei(pile, s) {
  const { pts, yAt, h = 2.3, closed = false } = s, sama = s.sama ?? 1.8;
  const st = pile.style, kind = s.kind || (s.era === 'early' ? (st === 'kuro' ? 'kuro' : st === 'tsuchi' ? 'tsuchi' : 'ita') : st === 'kuro' ? 'kuro' : 'shikkui');
  const n = pts.length - (closed ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.8) continue;
    const yA = (t) => yAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (kind === 'ita') { itaHei(pile, ax, az, bx, bz, L, h, yA, sama); continue; }
    const keepE = pile.extra; if (kind === 'tsuchi') pile.extra = TSUCHI;
    kitDobeiSeg(pile, { ax, az, bx, bz, h, yAt: yA });
    pile.extra = keepE;
    if (kind === 'kuro') {   // 腰の黒い下見板（両の面。2m ごと）
      const m = Math.max(1, Math.round(L / 2)), ww = L / m, dx = (bx - ax) / L, dz = (bz - az) / L, rr = Math.atan2(-dz, dx);
      for (let j = 0; j < m; j++) {
        const t = (j + 0.5) / m, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, y0 = yA(t) - 0.05;
        for (const sd of [-1, 1]) pile.addBox('Wood_Black', cx - dz * sd * 0.2, y0 + 0.45 + (h * 0.6 - 0.45) / 2, cz + dx * sd * 0.2, ww, h * 0.6 - 0.45, 0.04, rr);
      }
    }
  }
}
function itaHei(pile, ax, az, bx, bz, L, h, yA, sama) {
  const dx = (bx - ax) / L, dz = (bz - az) / L, rr = Math.atan2(-dz, dx), m = Math.max(1, Math.round(L / 1.8)), ww = L / m, W = woodOf(pile.style);
  for (let j = 0; j <= m; j++) {   // 柱
    const t = j / m, X = ax + (bx - ax) * t, Z = az + (bz - az) * t, y0 = yA(t);
    pile.addBox(W, X, y0 + (h + 0.4) / 2 - 0.3, Z, 0.16, h + 0.4, 0.16, rr);
  }
  for (let j = 0; j < m; j++) {
    const t = (j + 0.5) / m, X = ax + (bx - ax) * t, Z = az + (bz - az) * t, y0 = yA(t) - 0.08;
    pile.addBox('Wood', X, y0 + h / 2, Z, ww + 0.02, h, 0.06, rr);                       // 縦の板の面
    pile.addBox(W, X, y0 + h * 0.62, Z, ww, 0.1, 0.14, rr);                             // 胴縁
    pile.addBox('Wood', X, y0 + h + 0.04, Z, ww + 0.04, 0.08, 0.34, rr);                // 板の笠木
    if (sama > 0 && (j % Math.max(1, Math.round(sama / ww)) === 0)) for (const sd of [-1, 1]) {
      pile.addBox('Iron', X - dz * sd * 0.035, y0 + h * 0.5, Z + dx * sd * 0.035, j % 2 ? 0.13 : 0.2, j % 2 ? 0.42 : 0.2, 0.02, rr);
    }
  }
}

// ---- 橋 ----
// 土橋：a→b の土の道（堀を掘り残した所）。道の面に砂利、両の縁に石（late・keicho）か木の杭（early）
export function kitDobashi(pile, s) {
  const { a: [ax, az], b: [bx, bz], w = 3, yAt, era = 'late' } = s, L = Math.hypot(bx - ax, bz - az); if (L < 1) return;
  const dx = (bx - ax) / L, dz = (bz - az) / L, rr = Math.atan2(-dz, dx), m = Math.max(1, Math.round(L / 2)), ww = L / m;
  for (let j = 0; j < m; j++) {
    const t = (j + 0.5) / m, X = ax + (bx - ax) * t, Z = az + (bz - az) * t, y0 = yAt(X, Z);
    pile.addBox('Gravel', X, y0 - 0.12, Z, ww + 0.05, 0.3, w - 0.3, rr);
    for (const sd of [-1, 1]) {
      const ex = X - dz * sd * w / 2, ez = Z + dx * sd * w / 2;
      if (era === 'early') pile.addBox('Wood', ex, y0 + 0.05, ez, 0.14, 0.6, 0.14, rr);
      else pile.addBox('Stone_Dressed', ex, y0 - 0.05, ez, ww, 0.4, 0.4, rr);
    }
  }
}
// 木橋：a→b に架ける。y＝橋の面の高さ（無ければ両端の地面の高い方）、bed＝橋脚の足もと（無ければ面の 3m 下）。欄干つき
export function kitKibashi(pile, s) {
  const { a: [ax, az], b: [bx, bz], w = 3.2, yAt } = s, L = Math.hypot(bx - ax, bz - az); if (L < 1) return;
  const y = s.y ?? Math.max(yAt(ax, az), yAt(bx, bz)) + 0.1, bed = s.bed ?? y - 3, W = woodOf(pile.style);
  const dx = (bx - ax) / L, dz = (bz - az) / L, rr = Math.atan2(-dz, dx), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const side = (sd, k) => [-dz * sd * k, dx * sd * k];
  pile.addBox('Wood', cx, y - 0.1, cz, L, 0.2, w, rr);                                                  // 床板
  for (const sd of [-1, 1]) { const [ox, oz] = side(sd, w / 2 - 0.25); pile.addBox(W, cx + ox, y - 0.42, cz + oz, L, 0.3, 0.26, rr); }   // 桁
  const nb = Math.max(1, Math.round(L / 4));
  for (let j = 1; j < nb; j++) for (const sd of [-1, 1]) {                                               // 橋脚
    const t = j / nb, [ox, oz] = side(sd, w / 2 - 0.4), X = ax + (bx - ax) * t + ox, Z = az + (bz - az) * t + oz;
    pile.addBox(W, X, (y - 0.5 + bed) / 2, Z, 0.26, y - 0.5 - bed, 0.26, rr);
  }
  const np = Math.max(1, Math.round(L / 2));
  for (const sd of [-1, 1]) {                                                                            // 欄干
    const [ox, oz] = side(sd, w / 2 - 0.08);
    for (let j = 0; j <= np; j++) { const t = j / np; pile.addBox(W, ax + (bx - ax) * t + ox, y + 0.45, az + (bz - az) * t + oz, 0.13, 0.9, 0.13, rr); }
    pile.addBox(W, cx + ox, y + 0.86, cz + oz, L, 0.1, 0.12, rr);
    pile.addBox(W, cx + ox, y + 0.45, cz + oz, L, 0.07, 0.07, rr);
  }
}

// ---- 縄張りの組み（門と塀を並べる） ----
// 枡形虎口：castle_parts.js の masugata と同じ並び（一の門 x,z・外向き rot、四角い広場、直角に折れて二の門）。
// late：一の門は高麗門・二の門は大きな櫓門・塀は白漆喰。early：冠木門・板の櫓門・板塀（壁の仕上げによる）
export function kitMasugata(pile, s) {
  const { x, z, rot = 0, era = 'late', yAt } = s, turn = s.turn ?? 1, hs = s.size ?? 4.5, w1 = s.w1 ?? 4.6, w2 = s.w2 ?? 4.2;
  const ux = Math.sin(rot), uz = Math.cos(rot), px = turn * uz, pz = -turn * ux, cx = x - ux * hs, cz = z - uz * hs;
  const P2 = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
  if (era === 'early') kitKabukimon(pile, { x, z, rot, y: yAt(x, z), Lw: w1 }); else kitKourai(pile, { x, z, rot, y: yAt(x, z), Lw: w1 + 0.5 });
  const walls = [[[-hs, -hs], [-hs, hs]], [[-hs, hs], [hs, hs]], [[hs, hs], [hs, 1.6]]];
  for (const [[a0, b0], [a1, b1]] of walls) kitHei(pile, { pts: [P2(a0, b0), P2(a1, b1)], yAt, h: s.h ?? 2.4, era, kind: s.kind });
  const [ix, iz] = P2(hs, -hs * 0.35);
  kitYaguramon(pile, { x: ix, z: iz, rot: rot + turn * Math.PI / 2, y: yAt(ix, iz), w: w2, era });
}
// 馬出し：門（x,z・外向き rot）の前の小さな曲輪。kind 'kaku'（角馬出し）・'maru'（丸馬出し・甲州流）。
// 前の面と両の脇を塀で囲い、脇の門側の端は口として開ける。w＝幅、d＝門からの深さ、gap＝脇の口の幅。stone で塀の下に低い石垣
export function kitUmadashi(pile, s) {
  const { x, z, rot = 0, era = 'early', yAt, kind = 'kaku', w = 18, d = 11, gap = 4 } = s;
  const ux = Math.sin(rot), uz = Math.cos(rot), rx = Math.cos(rot), rz = -Math.sin(rot);
  const P = (a, b) => [x + rx * a + ux * b, z + rz * a + uz * b];
  let pts;
  if (kind === 'maru') { pts = []; const N = 9; for (let i = 0; i <= N; i++) { const t = -Math.PI / 2 + Math.PI * i / N; pts.push(P(Math.sin(t) * w / 2, gap + Math.cos(t) * (d - gap))); } }
  else pts = [P(-w / 2, gap), P(-w / 2, d), P(w / 2, d), P(w / 2, gap)];
  const hp = { pts, yAt, h: s.h ?? 2.2, era, kind: s.hei };
  if (!(s.stone ?? era !== 'early')) { kitHei(pile, hp); return; }
  // 石垣の上の塀：外は低い石垣、内は塀の足もとまでの土の段（武者走り）
  kitIshigaki(pile, { pts: pts.slice().reverse(), yAt, top: (X, Z) => yAt(X, Z) + 1.4, era });
  kitHei(pile, { ...hp, yAt: (X, Z) => yAt(X, Z) + 1.4 });
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const mx = (ax + bx) / 2 + dz * 1.3, mz = (az + bz) / 2 - dx * 1.3, y0 = Math.min(yAt(ax, az), yAt(bx, bz)) - 0.5;
    pile.addBox('Gravel', mx, (y0 + yAt(mx, mz) + 1.38) / 2, mz, L + 1.2, yAt(mx, mz) + 1.38 - y0, 2.4, Math.atan2(-dz, dx));
  }
}
// 喰違虎口：二つの塀（か土塁の上の塀）を食い違いに重ね、間を S の字に折れて通す。x,z が口の真ん中、rot の局所 x が塀の向き。
// len＝片方の塀の長さ、gap＝二つの塀の間（通り道の幅）、lap＝重なり
export function kitKuichigai(pile, s) {
  const { x, z, rot = 0, era = 'early', yAt, len = 14, gap = 4, lap = 5 } = s, c = Math.cos(rot), sn = Math.sin(rot);
  const P = (a, b) => [x + a * c + b * sn, z - a * sn + b * c];
  const hp = { yAt, h: s.h ?? 2.3, era, kind: s.hei };
  kitHei(pile, { ...hp, pts: [P(-len, gap / 2), P(lap / 2, gap / 2)] });
  kitHei(pile, { ...hp, pts: [P(-lap / 2, -gap / 2), P(len, -gap / 2)] });
  // 重なりの端を塞ぐ短い折れ（敵がまっすぐ抜けない）
  kitHei(pile, { ...hp, pts: [P(lap / 2, gap / 2), P(lap / 2, gap / 2 + 2.5)] });
  kitHei(pile, { ...hp, pts: [P(-lap / 2, -gap / 2), P(-lap / 2, -gap / 2 - 2.5)] });
}

// ---- 棚の口 ----
export const CASTLE_SHELF = {
  yaguramon: kitYaguramon, kourai: kitKourai, yakuimon: kitYakuimon, kabukimon: kitKabukimon,
  // gate：時代で門を選ぶ（early は冠木門、late・keicho は高麗門）
  gate: (p, s) => (s.era === 'early' ? kitKabukimon(p, s) : kitKourai(p, { ...s, Lw: (s.Lw ?? 4.6) + 0.5 })),
  niju: (p, s) => kitNijuYagura(p, { ...s, y: flatY(s) }), sumi: kitSumiYagura, tamon: (p, s) => kitNagaYagura(p, { ...s, y: flatY(s) }),
  ishigaki: kitIshigaki, ishigakiHei: kitIshigakiHei, hei: kitHei, sama: kitSama, ishiotoshi: kitIshiotoshi,
  dobashi: kitDobashi, kibashi: kitKibashi, masugata: kitMasugata, umadashi: kitUmadashi, kuichigai: kitKuichigai,
};
function shelfBuild(world, kind, s, o) {
  const f = CASTLE_SHELF[kind];
  if (!f) throw new Error('城の部品が無い ' + kind);
  const spec = { era: o.era || castleEra(world), yAt: (X, Z) => world.heightAt(X, Z), ...s };
  return { style: o.style || castleStyle(world), build: (p) => f(p, spec), gate: kind === 'masugata' || (kind === 'yaguramon' && spec.era !== 'early') };
}
// 手作りの形の無い所に棚の部品を置く。戻り値の px：visible=false で消す（壊れた・焼けた時に呼び手が消す）
export function castlePart(world, kind, s, o = {}) {
  const { style, build, gate } = shelfBuild(world, kind, s, o), px = new KitProxy();
  kitQueue(style, build, { ...o, gate, px }, () => {});
  return px;
}
// 手作りの形 ret（当たり・火・壊れるを持つ）の見た目を棚の部品に替える。hide は kitReplace と同じ
export function castlePartOver(ret, world, kind, s, o = {}) {
  const { style, build, gate } = shelfBuild(world, kind, s, o);
  kitReplace(ret, style, build, { ...o, gate });
}
