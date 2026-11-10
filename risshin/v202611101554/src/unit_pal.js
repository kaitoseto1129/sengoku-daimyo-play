// 画質「低」（携帯）：形が同じで色だけ違う兵の部品（着物・威糸・顔の色が頂点色に焼き込んである）を、
// 一つの形・一つの束にまとめるための「色の表」。
//   形（頂点・法線・UV・材質の値）が同じ部品どうしを一つの組にし、組の先頭の形の「頂点色の種類」に番号（pslot）を振る。
//   部品ごとに、その番号に当たる色（color・col2）を表（DataTexture の一行）に持つ。束の InstancedMesh は、
//   instanceColor.x に行の番号を入れ、頂点シェーダーが表から色を引く（MAT_P）。見た目は元の頂点色と同じ。
//   色の種類が多い・形が合わない部品は null を返し、今までどおり部品ごとの束にする。
import * as THREE from 'three';
import { PAL_U } from './units_model.js';

const NS = 32, W = NS * 2;
let cap = 0, rows = 0, data = null;
function grow() {
  const nc = cap ? cap * 2 : 128;
  const nd = new Float32Array(nc * W * 4);
  if (data) nd.set(data);
  const old = PAL_U.value;
  const t = new THREE.DataTexture(nd, W, nc, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  PAL_U.value = t; data = nd; cap = nc;
  if (old) old.dispose();
}
grow();

const cache = new WeakMap();   // 元の形 → { geo（組の形）, row } か null
const groups = new Map();      // 形の目印 → 組の並び

function eq(a, b) {
  if (!a || !b) return !a && !b;
  const x = a.array, y = b.array;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
function shapeKey(g) {
  const p = g.attributes.position.array, m = g.attributes.mtl.array;
  let h = p.length | 0;
  const st = Math.max(1, (p.length / 40) | 0);
  for (let i = 0; i < p.length; i += st) h = (h * 31 + Math.round(p[i] * 1000)) | 0;
  for (let i = 0; i < m.length; i += Math.max(1, (m.length / 20) | 0)) h = (h * 31 + Math.round(m[i] * 100)) | 0;
  return h + '|' + (g.index ? g.index.count : 0);
}
function sameShape(a, b) {
  const A = a.attributes, B = b.attributes;
  return eq(A.position, B.position) && eq(A.normal, B.normal) && eq(A.uv, B.uv) && eq(A.mtl, B.mtl) && eq(a.index, b.index);
}
function makeGroup(g) {
  const A = g.attributes, n = A.position.count, c = A.color.array, c2 = A.col2.array;
  const map = new Map(), slot = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const k = c[v * 3] + ',' + c[v * 3 + 1] + ',' + c[v * 3 + 2] + ',' + c2[v * 3] + ',' + c2[v * 3 + 1] + ',' + c2[v * 3 + 2];
    let s = map.get(k);
    if (s === undefined) { s = map.size; if (s >= NS) return { src: g, bad: true }; map.set(k, s); }
    slot[v] = s;
  }
  const g2 = new THREE.BufferGeometry();
  for (const k in A) g2.setAttribute(k, A[k]);
  if (g.index) g2.setIndex(g.index);
  g2.setAttribute('pslot', new THREE.BufferAttribute(slot, 1));
  g2.userData.pal = true;
  return { src: g, geo: g2, slot };
}

// 元の形 g の、まとめ用の形と表の行。まとめられない時は null
export function palOf(g) {
  let r = cache.get(g);
  if (r !== undefined) return r;
  r = null;
  const A = g.attributes;
  if (A.color && A.col2 && A.mtl && A.position && A.normal && A.color.array instanceof Float32Array && A.col2.array instanceof Float32Array
    && A.color.count === A.position.count && A.col2.count === A.position.count && !g.morphAttributes.position && !(g.groups && g.groups.length)) {
    const key = shapeKey(g);
    let list = groups.get(key);
    if (!list) groups.set(key, list = []);
    let gr = null;
    for (const q of list) if (q.src === g || sameShape(q.src, g)) { gr = q; break; }
    if (!gr) { gr = makeGroup(g); list.push(gr); }
    if (!gr.bad) {
      const n = A.position.count, slot = gr.slot, c = A.color.array, c2 = A.col2.array;
      const pal = new Float32Array(NS * 6), fill = new Uint8Array(NS);
      let ok = true;
      for (let v = 0; v < n && ok; v++) {
        const s = slot[v];
        if (fill[s]) {
          for (let i = 0; i < 3; i++) if (pal[s * 6 + i] !== c[v * 3 + i] || pal[s * 6 + 3 + i] !== c2[v * 3 + i]) { ok = false; break; }
        } else {
          fill[s] = 1;
          for (let i = 0; i < 3; i++) { pal[s * 6 + i] = c[v * 3 + i]; pal[s * 6 + 3 + i] = c2[v * 3 + i]; }
        }
      }
      if (ok) {
        if (rows >= cap) grow();
        const row = rows++, o = row * W * 4;
        for (let s = 0; s < NS; s++) {
          data[o + s * 8] = pal[s * 6]; data[o + s * 8 + 1] = pal[s * 6 + 1]; data[o + s * 8 + 2] = pal[s * 6 + 2]; data[o + s * 8 + 3] = 1;
          data[o + s * 8 + 4] = pal[s * 6 + 3]; data[o + s * 8 + 5] = pal[s * 6 + 4]; data[o + s * 8 + 6] = pal[s * 6 + 5]; data[o + s * 8 + 7] = 1;
        }
        PAL_U.value.needsUpdate = true;
        r = { geo: gr.geo, row };
      }
    }
  }
  cache.set(g, r);
  return r;
}
