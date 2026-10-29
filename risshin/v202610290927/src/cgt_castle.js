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
function styledMat(name, style) {
  const base = cgtMat(name);
  if (!base) return null;
  const t = TINT[style]?.[name];
  if (!t) return base;
  const k = name + ':' + style;
  let m = MATS.get(k);
  if (!m) { m = base.clone(); m.color.setRGB(t[0], t[1], t[2]); MATS.set(k, m); }
  return m;
}

// ---- 部品を積む入れ物（建物一つぶん。材質ごとに形をためる） ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
class Pile {
  constructor(style) { this.style = style; this.by = new Map(); this.tris = 0; this.n = 0; }
  _push(mat, g) { let a = this.by.get(mat); if (!a) this.by.set(mat, (a = [])); a.push(g); this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  // cgt.js の KitBatch.add と同じ形（kitStoneSeg・kitStoneRect もこれに積める）
  add(name, x, y, z, rot = 0, sx = 1, sy = 1, sz = 1) {
    const ps = cgtParts(name);
    if (!ps) return false;
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, rot), _s.set(sx, sy, sz));
    for (const { geo, m } of ps) { const mt = styledMat(cgtMatName(m), this.style); if (mt) this._push(mt, geo.clone().applyMatrix4(_m)); }
    this.n++;
    return true;
  }
  addBox(matName, cx, cy, cz, w, h, d, rot = 0) {
    const mt = styledMat(matName, this.style);
    if (!mt) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    g.rotateY(rot); g.translate(cx, cy, cz);
    this._push(mt, g);
  }
  addGeo(matName, geo) { const mt = styledMat(matName, this.style); if (mt) this._push(mt, geo); }
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
  const D = (globalThis.__kitDbg ||= { call: 0, built: 0, over: 0, err: 0 }); D.call++;
  if (!ret || !cgtOn()) return;
  const need = o.gate ? loadGate() : null;
  Promise.resolve(need).then(() => whenCgt(() => {
    const scene = o.scene || cgtScene();
    if (!scene) return;
    if (Q.scene !== scene) { if (Q.timer) clearTimeout(Q.timer); Q = { scene, pend: new Map(), timer: 0, tris: 0, house: 0 }; WATCH.length = 0; }
    const pile = new Pile(style);
    try { if (build(pile) === false) return; } catch (e) { D.err++; D.e = String(e); return; }
    if (!pile.by.size || Q.tris + pile.tris > BUDGET || (o.house && Q.house + pile.tris > HOUSE_BUDGET)) { D.over++; for (const l of pile.by.values()) for (const g of l) g.dispose(); return; }
    Q.tris += pile.tris; if (o.house) Q.house += pile.tris; D.built++; D.tris = Q.tris;
    const px = new KitProxy();
    hideHandmade(ret, px, o.hide);
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
