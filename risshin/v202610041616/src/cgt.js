// 買った素材（CGTrader：姫路城の作りの城の部品・石垣と白壁の塀・武家屋敷の門・和の部屋）の読み込み口。
// 素材は src/asset_cgt.js と asset_cgt_naibu.js（tools/cgt_kit.mjs・cgt_naibu.mjs で、軽くして専用の箱に詰め、鍵の流れで XOR した base64）。ここで XOR を戻して形と絵に開く。
// 必要になった時だけ遅れて読む。画質「低」と描かない時（norender）は読まない（手作りの形のまま）。出所と許しは docs/CREDITS.md。
// 使い方：
//   const kb = new KitBatch();  kb.add('Wall_White_Plain', x, y, z, rotY, sx, sy, sz);  kb.addBox('Gravel', cx, cy, cz, w, h, d, rotY);
//   const group = kb.build();   // 材質ごとに一つの Mesh にまとめた Group（部品の足もとが y=0、幅は +x へ 2m、外は +z）
//   kb.add('naibu_japanese_lamp_emissive', x, y, z); // 和の部屋は中央の足もとが原点、長さはメートル。cgtBox で大きさを調べる。
//   whenCgt(() => { … });       // 読めたら呼ぶ（もう読めていればすぐ。読めない時は呼ばない）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { cgtKey } from './cgt_key.js';

let LIB = null, loading = null;
const waiting = [];
const off = () => typeof window !== 'undefined' && (window.__norender === true || (typeof location !== 'undefined' && /[?&]norender/.test(location.search)));
// 使ってよい時（低でなく、描く時）
export const cgtOn = () => SETTINGS.quality !== 'low' && !off();
const partName = name => LIB?.aliases[name] || name;
export const cgtHas = name => !!LIB?.parts[partName(name)];
// 和の部屋の収録名。cgtParts・cgtKitGroup・KitBatch.add で同じ名前が使える。
export const cgtNaibuNames = () => LIB ? LIB.naibuNames.slice() : [];
// 部品の大きさ：{ c: 中心 [x,y,z], h: 半分の大きさ [x,y,z] }（部品の座標）。無ければ null
export const cgtBox = name => {
  const p = LIB?.parts[partName(name)];
  return p ? { c: p.c.slice(), h: p.h.slice() } : null;
};

async function open(b64) {
  const bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
  const key = cgtKey(n);
  for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i) ^ key[i];
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'CGT1') throw new Error('cgt');
  const jl = new DataView(bytes.buffer).getUint32(4, true), base = 8 + jl;
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jl)));
  const mats = await Promise.all(head.mats.map(async (m) => {
    const bmp = await createImageBitmap(new Blob([bytes.subarray(base + m.o, base + m.o + m.l)], { type: 'image/jpeg' }));
    const map = new THREE.Texture(bmp);
    map.flipY = false; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true;
    const solid = /^(Stone|Stone_Dark|Gravel|IshigakiHei)$/.test(m.n);
    const mt = new THREE.MeshLambertMaterial({ map, side: solid ? THREE.FrontSide : THREE.DoubleSide });
    if (/^Stone|^Gravel/.test(m.n)) mt.color.setScalar(1.5);   // 石の絵は暗い（実物の灰色の石に近づける）
    return mt;
  }));
  return { head, bytes, base, mats, parts: head.parts, names: head.mats.map((m) => m.n), aliases: head.aliases || {}, sources: new Map(), naibuNames: [], cache: new Map() };
}

export function loadCgt() {
  if (loading) return loading;
  if (off() || SETTINGS.quality === 'low') return Promise.resolve(null);
  loading = (async () => {
    const [castle, naibu] = await Promise.all([
      import('./asset_cgt.js').then(m => open(m.default)),
      import('./asset_cgt_naibu.js').then(m => open(m.default)),
    ]);
    // 箱は別々に保ち、材質番号だけ通し番号にする。既存の城の部品名と座標は変えない。
    const offset = castle.mats.length;
    castle.mats.push(...naibu.mats); castle.names.push(...naibu.names);
    for (const [name, part] of Object.entries(naibu.parts)) {
      for (const p of part.p) p.m += offset;
      castle.parts[name] = part;
      castle.sources.set(name, naibu);
    }
    Object.assign(castle.aliases, naibu.aliases);
    castle.naibuNames = Object.keys(naibu.parts);
    LIB = castle;
    for (const f of waiting.splice(0)) { try { f(); } catch (e) { /* 一つの失敗で他を止めない */ } }
    return LIB;
  })().catch(() => { loading = null; return null; });
  return loading;
}
export function whenCgt(f) {
  if (!cgtOn()) return;
  if (LIB) { f(); return; }
  waiting.push(f);
  loadCgt();
}

// 部品の形（名前 -> [{ geo, mat }]）。城は元の座標、和の部屋は中央の足もとが原点。同じ geo を使い回す（変えない）
export function cgtParts(name) {
  if (!LIB) return null;
  name = partName(name);
  let r = LIB.cache.get(name);
  if (r) return r;
  const pt = LIB.parts[name];
  if (!pt) return null;
  const { bytes, base } = LIB.sources.get(name) || LIB;
  r = pt.p.map((p) => {
    const v = p.v, t = p.t;
    let o = base + p.o;
    const p4 = (n) => (n + 3) & ~3;   // 箱の塊は 4 バイトの倍数に詰めてある（tools/cgt_kit.mjs の push）
    const Q = new Int16Array(bytes.buffer, o, v * 3); o += p4(v * 6);
    const Nq = new Int8Array(bytes.buffer, o, v * 3); o += p4(v * 3);
    const Uq = new Int16Array(bytes.buffer, o, v * 2); o += p4(v * 4);
    const Iq = new Uint16Array(bytes.buffer, o, t * 3);
    const P = new Float32Array(v * 3), N = new Float32Array(v * 3), U = new Float32Array(v * 2);
    for (let i = 0; i < v * 3; i++) { P[i] = pt.c[i % 3] + Q[i] / 32767 * pt.h[i % 3]; N[i] = Nq[i] / 127; }
    for (let i = 0; i < v * 2; i++) U[i] = Uq[i] / p.us;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(new THREE.BufferAttribute(Iq.slice(), 1));
    geo.computeBoundingSphere();
    return { geo, mat: LIB.mats[p.m], m: p.m };
  });
  LIB.cache.set(name, r);
  return r;
}
// 中（光を絵や頂点に焼いてある室内）用の、光に当たらない材質。tint：明るさ（暗い室内に合わせて落とす）
const BASIC = new Map();
function basicMat(m, tint) {
  const k = m + ':' + tint;
  let b = BASIC.get(k);
  if (!b) { b = new THREE.MeshBasicMaterial({ map: LIB.mats[m].map, color: new THREE.Color(tint, tint, tint), side: THREE.DoubleSide }); BASIC.set(k, b); }
  return b;
}
// 部品を一つ、Group にして返す（室内の部品を差し替える用。形は使い回し、材質は光に当たらない物）。読めていなければ null
export function cgtKitGroup(name, sx = 1, sy = 1, sz = 1, tint = 0.8) {
  const ps = cgtParts(name);
  if (!ps) return null;
  const g = new THREE.Group();
  for (const { geo, m } of ps) g.add(new THREE.Mesh(geo, basicMat(m, tint)));
  g.scale.set(sx, sy, sz);
  return g;
}
const matIndex = (n) => (LIB ? LIB.names.indexOf(n) : -1);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// 部品を並べて、材質ごとに一つの Mesh にまとめる（描く回数を増やさない）。部品は一つずつ変形を焼き込む
export class KitBatch {
  constructor() { this.by = new Map(); this.n = 0; }
  _push(m, g) { let a = this.by.get(m); if (!a) this.by.set(m, (a = [])); a.push(g); }
  add(name, x, y, z, rot = 0, sx = 1, sy = 1, sz = 1) {
    const ps = cgtParts(name);
    if (!ps) return false;
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, rot), _s.set(sx, sy, sz));
    for (const { geo, m } of ps) this._push(m, geo.clone().applyMatrix4(_m));
    this.n++;
    return true;
  }
  // 平たい箱（材質の名前で絵を選ぶ。絵の繰り返しは 1m に一つ）
  addBox(matName, cx, cy, cz, w, h, d, rot = 0) {
    const m = matIndex(matName);
    if (m < 0) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    g.rotateY(rot); g.translate(cx, cy, cz);
    this._push(m, g);
  }
  build(o = {}) {
    const grp = new THREE.Group();
    grp.userData.cgt = true;
    for (const [m, list] of this.by) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, o.basic ? basicMat(m, o.tint ?? 0.7) : LIB.mats[m]);
      mesh.castShadow = o.shadow !== false; mesh.receiveShadow = true; mesh.userData.camBlock = o.camBlock ?? true; mesh.userData.ext = true;
      grp.add(mesh);
      for (const g of list) g.dispose();
    }
    this.by.clear();
    return grp;
  }
}

// いまの舞台（戦・町）と、その舞台で買った素材に使ってよい面の数。舞台を作る時に cgtBind で入れ直す
let SCENE = null, BUDGET = 0;
export function cgtBind(scene) { SCENE = scene; BUDGET = SETTINGS.quality === 'high' ? 380000 : 160000; }
export const cgtScene = () => SCENE;
export function cgtSpend(tris) { if (BUDGET < tris) return false; BUDGET -= tris; return true; }

// 旧い手作りの形 ret（Group か、props.js の BatchedPart）を隠し、買った素材の形 grp に替える。ret の動き（壊れて傾く・消える）は grp が受け継ぐ
export function kitAttach(ret, grp, scene) {
  if (ret.isBatchedPart) { ret.setKit(grp); (scene || SCENE).add(grp); return; }
  for (const c of ret.children) c.visible = false;
  ret.add(grp);
}

const hash = (a) => { let h = Math.imul(a | 0, 2654435761) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return h; };
const HS = [2, 4, 6, 8];
// 石垣の一辺：進む向き a→b の左手が外（side = -1 なら右手）。topAt(t)・botAt(t)：辺の上の割合 t での天端と足もとの高さ。
// 2m ごとの石垣の部品を、高さに近い物（2・4・6・8m）から選んで縦に伸び縮みさせて並べる。継ぎ目の角は turnA・turnB（折れ角が大きい端だけ）で端を少し伸ばす
export function kitStoneSeg(kb, s) {
  const flip = s.side < 0;
  const ax = flip ? s.bx : s.ax, az = flip ? s.bz : s.az, bx = flip ? s.ax : s.bx, bz = flip ? s.az : s.bz;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.5) return;
  const dx = (bx - ax) / len, dz = (bz - az) / len, rot = Math.atan2(-dz, dx);
  const ext0 = flip ? s.extB : s.extA, ext1 = flip ? s.extA : s.extB;   // 始まり・終わりの伸ばし（m）
  const L = len + ext0 + ext1, N = Math.max(1, Math.round(L / 2)), w = L / N;
  for (let i = 0; i < N; i++) {
    const u = ext0 ? -ext0 + (i + 0.5) * w : (i + 0.5) * w;
    const t = Math.min(1, Math.max(0, u / len)), tt = flip ? 1 - t : t;
    const top = s.topAt(tt), bot = s.botAt(tt), H = Math.max(1.2, top - bot);
    let k = 0, best = 9; for (let j = 0; j < 4; j++) { const e = Math.abs(Math.log(H / HS[j])); if (e < best) { best = e; k = j; } }
    const hm = HS[k], v = hm === 8 ? '' : ['', '_B', '_C'][hash(s.seed * 7 + i * 3 + k) % 3];
    const sy = H / hm, sz = s.zs ?? Math.sqrt(Math.max(0.7, sy));
    const u0 = (ext0 ? -ext0 : 0) + i * w;
    kb.add(`Base_H${hm}_Straight${v}`, ax + dx * u0, bot, az + dz * u0, rot, w / 2, sy, sz);
  }
}
