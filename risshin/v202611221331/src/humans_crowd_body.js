// 中景・遠景の兵（VAT と骨の人の遠い形）の体を、近くの兵と同じ MakeHuman の体と頭（CC0。docs/CREDITS.md）にする（kaito 11/3「筒や玉の人形」）。
//   これまでの遠い形は units_model.js の筒（腕・袴の卵・関節の玉）と玉の顔を骨に一つずつ付けた人形だった。
//   ここでは、読み込んだ体（SRC.body）と頭（HEAD）を升で減らした軽い形を、人の根元の立ち姿の座標へ写し、骨の重みを束ねた形の骨（ALLB）へ直して渡す。
//   形は全員で一つ（色だけ姿ごと）。甲冑の部品（胴・草摺・袖・笠・脛当・草鞋）はこれまで通りその上に着せる。
//   ?realbody=0 で元の人形に戻す（比べ用）。
import * as THREE from 'three';
import { SRC, HEAD, ALLB, PART } from './humans_shared.js';
import { MK } from './units_model.js';
import { simplifyIndex, simplifyAsync, geoArrays } from './qem_index.js';

const qs = typeof location !== 'undefined' ? location.search : '';
// bodyTri・headTri：一人の体と頭の三角の数（面の二次誤差で減らす。体 1.4 万・頭 8.6 千から）
// K341④：?crowdface=0 で月代・剃り跡・凹凸の陰の前の顔に戻す（前と後を並べて撮る時だけ）
const CROWD_FACE = !/[?&]crowdface=0/.test(qs);
export const REAL_BODY = { on: !/[?&]realbody=0/.test(qs), bodyTri: 1500, headTri: 520, stat: {} };
// 本物の体に替わる部品（腕の筒・袴の卵・関節の玉・肩の当て布・人形の顔）。甲冑の部品は残す
export const REAL_DROP = new Set(['face', 'yoke', 'thighP', 'thighN', 'sleeveP', 'sleeveN',
  'jShP', 'jShN', 'jElP', 'jElN', 'jHpP', 'jHpN', 'jKnP', 'jKnN']);
// 体の骨（Mixamo の名）→ 束ねた形の骨（ALLB の初めの CB）
function crowdBone(nm) {
  const n = nm.replace(/Twist\d*$/, '').replace(/Twist/, '');
  if (/^(Left|Right)Hand/.test(n)) return n.startsWith('Left') ? 'LeftHand' : 'RightHand';
  if (/^(Left|Right)(Foot|Toe)/.test(n)) return n.startsWith('Left') ? 'LeftFoot' : 'RightFoot';
  if (/^(Left|Right)Shoulder/.test(n)) return 'Spine2';
  if (/^Neck|^Head/.test(n)) return /^Neck/.test(n) ? 'Spine2' : 'Head';
  if (n === 'Spine') return 'Spine1';
  return ALLB.indexOf(n) >= 0 ? n : 'Spine1';
}
let base = null;   // { body: {geo, part}, head: {geo, tex, hair} }
let qem = null;    // { body: 面の並び, head: 面の並び }（元の頂点の番号）
function ready() { return REAL_BODY.on && !!qem && SRC && SRC.body && SRC.scene?.userData?.mhbody && HEAD && HEAD.mh && HEAD.geo; }
// 読み込みの終わりに一度：体と頭の面を別の糸で減らしておく（主の糸を止めない。出来なければ主の糸で）
let preparing = null;
export function prepareRealBody() {
  if (preparing) return preparing;
  if (!REAL_BODY.on || !SRC?.body || !SRC.scene?.userData?.mhbody || !HEAD?.mh) return Promise.resolve();
  const t0 = performance.now();
  const one = (g, n) => { const a = geoArrays(g); const b = geoArrays(g); return simplifyAsync(a.P, a.U, a.I, n).then((J) => J || simplifyIndex(b.P, b.U, b.I, n)); };
  preparing = Promise.all([one(SRC.body.geometry, REAL_BODY.bodyTri), one(HEAD.geo, REAL_BODY.headTri)])
    .then(([b, h]) => { qem = { body: b, head: h }; REAL_BODY.stat.qemMs = +(performance.now() - t0).toFixed(1); })
    .catch((e) => { REAL_BODY.stat.err = String(e && e.message || e).slice(0, 120); });
  return preparing;
}
// 体：減らした面だけを残し、根元の立ち姿へ写し、骨を束ねる（一度だけ）
function buildBody() {
  const lo = SRC.body.geometry;
  const pos = lo.attributes.position, nor = lo.attributes.normal, uv = lo.attributes.uv, part = lo.attributes.part;
  const SI = lo.attributes.skinIndex, SW = lo.attributes.skinWeight, n = pos.count;
  const M = SRC.bodyToRest, NM = new THREE.Matrix3().getNormalMatrix(M), mirror = M.determinant() < 0;
  const keep = new Int32Array(n).fill(-1), P = [], N = [], U = [], SIo = [], SWo = [], PT = [];
  const bmap = SRC.bname.map((nm) => ALLB.indexOf(crowdBone(nm)));
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = part ? Math.round(part.getX(i)) : 0;
    // 足先・頭・首・襟（体の材質も描かない所）と手（指が開いた立ち姿のままなので、握った手の部品に任せる）
    if (p > 3 || p === PART.hand) continue;
    keep[i] = P.length / 3;
    v.fromBufferAttribute(pos, i).applyMatrix4(M); P.push(v.x, v.y, v.z);
    w.fromBufferAttribute(nor, i).applyMatrix3(NM).normalize(); N.push(w.x, w.y, w.z);
    U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    // 同じ束ねた骨へ行く重みを足し、重い順に四つまで
    const acc = new Map();
    for (let k = 0; k < 4; k++) { const wt = SW.getComponent(i, k); if (!(wt > 0)) continue; const b = bmap[SI.getComponent(i, k)]; acc.set(b, (acc.get(b) || 0) + wt); }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), t = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { SIo.push(top[k] ? top[k][0] : 0); SWo.push(top[k] ? top[k][1] / t : 0); }
    PT.push(p);
  }
  const ix = qem.body, I = [];
  for (let t = 0; t < ix.length; t += 3) {
    const a = keep[ix[t]], b = keep[ix[t + 1]], c = keep[ix[t + 2]];
    if (a < 0 || b < 0 || c < 0) continue;
    if (mirror) I.push(a, c, b); else I.push(a, b, c);
  }
  const g = compact(makeGeo(P, N, U, SIo, SWo, I)), keepB = g.userData.keep;
  return { geo: g, part: keepB ? PT.filter((_, i) => keepB[i] >= 0) : PT };
}
// 頭：MakeHuman の頭（顔の作り分けの一つ）を升で減らし、頭の骨（首の下は胸の骨へ）に付ける。肌の絵の色を頂点へ写す
function buildHead() {
  const lo = HEAD.geo;
  // K622 三回目（kaito 11/22 写真 8.webp「顔が大きく人形のよう」）：軽い体の頭は近くの人の頭（HEAD.k）と同じ大きさで、細い体に載ると
  //   三頭身の人形に見えた。軽い体の頭だけ八割八分に（頭の骨の所を軸に縮める＝首・笠の位置は変わらない）
  const hd = SRC.rest.Head, k = HEAD.k * 0.88;
  // humans_face.js の scanFace と同じ置き方（頭の骨の立ち姿の位置から）
  const fitF = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeTranslation(0, 0.048, 0.006)).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -1.2, -0.1));
  const NM = new THREE.Matrix3().getNormalMatrix(fitF);
  const pos = lo.attributes.position, nor = lo.attributes.normal, uv = lo.attributes.uv, n = pos.count;
  const P = [], N = [], U = [], SIo = [], SWo = [];
  const hB = ALLB.indexOf('Head'), cB = ALLB.indexOf('Spine2');
  const v = new THREE.Vector3(), bb = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(fitF); P.push(v.x, v.y, v.z); bb.expandByPoint(v);
    v.fromBufferAttribute(nor, i).applyMatrix3(NM).normalize(); N.push(v.x, v.y, v.z);
    U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  // 首の付け根は胸の骨へ寄せる（頭を回しても首が胴から離れない）
  const neckLo = hd.y - 0.1, neckHi = hd.y - 0.02;
  for (let i = 0; i < n; i++) {
    const y = P[i * 3 + 1], f = Math.min(1, Math.max(0, (y - neckLo) / (neckHi - neckLo)));
    SIo.push(hB, cB, 0, 0); SWo.push(f, 1 - f, 0, 0);
  }
  const g = compact(makeGeo(P, N, U, SIo, SWo, Array.from(qem.head)));
  // 髪：頭の上と後ろ（顔・耳の前は肌のまま）。笠や鉢巻の下から黒い髪がのぞく
  const gp = g.attributes.position, m = gp.count;
  const H = bb.max.y - bb.min.y, D = bb.max.z - bb.min.z, zc = (bb.max.z + bb.min.z) / 2, hair = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    const t = (gp.getY(i) - bb.min.y) / H, z = (gp.getZ(i) - zc) / D;
    hair[i] = (t > 0.8 && z < 0.3) || (t > 0.86) || (t > 0.5 && z < -0.18) ? 1 : 0;
    // K341④（11/16 iMac）：頭頂の前（額の上〜頭頂）は月代＝剃った肌（2）。黒い髪の帽子を被った人形の頭にしない
    if (CROWD_FACE && hair[i] && t > 0.84 && z > -0.12 && !(t < 0.9 && Math.abs(gp.getX(i) - (bb.max.x + bb.min.x) / 2) > (bb.max.x - bb.min.x) * 0.36)) hair[i] = 2;
  }
  // 肌の絵（顔の作り分けの真ん中の年）の色を、頂点の絵の座標で拾う
  const tex = sampleSkin(g.attributes.uv.array, m);
  return { geo: g, tex, hair, feat: faceMarks(gp, m, bb) };
}
// 11/16 K339（kaito「顔がのっぺらぼう」）：遠目の頭は目が別の形で、肌の絵だけでは目鼻が消えて肌色の卵に見えた。
//   鼻先（前へ一番出た所）を目印に、目の窪み・眉・口の陰を頂点の色に置く（形・三角の数は同じ。重さは増えない）
function faceMarks(gp, m, bb) {
  const out = new Float32Array(m * 4);   // [暗さ, 赤み, 髭の剃り跡, 照り（頬骨・鼻筋＋／顎の下−）]
  if (/[?&]facemark=0/.test(qs)) return out;   // 前と後を並べて撮る時だけ
  const H = bb.max.y - bb.min.y, lo = bb.min.y + H * 0.35, hi = bb.min.y + H * 0.85;
  let nz = -1e9, nx = 0, ny = 0;
  for (let i = 0; i < m; i++) { const y = gp.getY(i), z = gp.getZ(i); if (y > lo && y < hi && z > nz) { nz = z; nx = gp.getX(i); ny = y; } }
  if (nz < -1e8) return out;
  const s = (bb.max.x - bb.min.x) / 0.16;   // 頭の幅でおよその寸法を合わせる
  const g = (dx, dy, sx, sy) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2));
  for (let i = 0; i < m; i++) {
    const x = (gp.getX(i) - nx) / s, y = (gp.getY(i) - ny) / s, z = (gp.getZ(i) - nz) / s;
    if (z < -0.06) continue;   // 顔の前の面だけ
    const ax = Math.abs(x);
    const eye = g(ax - 0.032, y - 0.032, 0.016, 0.011);
    const brow = g(ax - 0.03, y - 0.05, 0.022, 0.007);
    const mouth = g(x, y + 0.03, 0.02, 0.005);
    const under = g(x, y + 0.012, 0.012, 0.006) * 0.5;   // 鼻の下の陰
    // K341④（11/16 iMac）：顔の凹凸を色で（イラスト調の平たい顔にしない）。鼻の脇の溝・頬の下の窪み・顎の下は沈み、頬骨と鼻筋は明るむ
    const side = !CROWD_FACE ? 0 : g(ax - 0.02, y - 0.004, 0.006, 0.014) * 0.35;                 // 鼻の脇
    const hollow = !CROWD_FACE ? 0 : g(ax - 0.05, y + 0.03, 0.014, 0.02) * 0.22;                  // 頬の下の窪み
    const chinU = !CROWD_FACE ? 0 : y < -0.07 ? Math.min(1, (-0.07 - y) / 0.03) * 0.45 : 0;     // 顎の下
    const lit = g(ax - 0.045, y - 0.012, 0.016, 0.01) * 0.16 + g(x, y - 0.025, 0.006, 0.02) * 0.12;   // 頬骨・鼻筋
    out[i * 4] = Math.min(0.74, eye * 0.82 + brow * 0.66 + mouth * 0.36 + under * 0.25 + side + hollow + chinU);
    // 剃り跡（顎・頬の下・口のまわり。唇は除く）：遠目でも青黒い陰で男の顔の下半分が締まる
    const lip = g(x, y + 0.03, 0.022, 0.007);
    out[i * 4 + 1] = CROWD_FACE ? Math.max(mouth, g(x, y + 0.03, 0.026, 0.011)) : mouth;
    out[i * 4 + 2] = y < -0.012 && y > -0.1 ? Math.max(0, Math.min(1, (0.075 - ax) / 0.03)) * (1 - lip) : 0;
    out[i * 4 + 3] = lit;
  }
  return out;
}
function sampleSkin(U, n) {
  const out = new Float32Array(n * 3).fill(1);
  const img = HEAD.col && HEAD.col.image;
  if (!img || typeof document === 'undefined') return out;
  try {
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data;
    let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.min(S - 1, Math.max(0, Math.floor(U[i * 2] * S))), y = Math.min(S - 1, Math.max(0, Math.floor(U[i * 2 + 1] * S)));
      const o = (y * S + x) * 4;
      out[i * 3] = d[o] / 255; out[i * 3 + 1] = d[o + 1] / 255; out[i * 3 + 2] = d[o + 2] / 255;
      mr += out[i * 3]; mg += out[i * 3 + 1]; mb += out[i * 3 + 2];
    }
    // 絵の平均の肌を 1 にした明るさの比（兵ごとの肌の色に掛ける）
    mr /= n; mg /= n; mb /= n;
    // 遠目の顔は陰影を和らげる（減らした面に目・眉の濃い所が斑に乗らないよう）
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = 1 + (out[i * 3 + c] / ([mr, mg, mb][c] || 1) - 1) * 0.75;
  } catch (e) { out.fill(1); }
  return out;
}
// 面の並びに使われた頂点だけを残す（頭は 4.5 千の頂点のうち面を減らした後に要る物だけ）
function compact(g) {
  const ix = g.index.array, n = g.attributes.position.count, map = new Int32Array(n).fill(-1);
  for (let i = 0; i < ix.length; i++) map[ix[i]] = 0;
  let m = 0; for (let i = 0; i < n; i++) if (map[i] === 0) map[i] = m++;   // 元の並びの順のまま詰める
  if (m === n) return g;
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const A = new a.array.constructor(m * a.itemSize);
    for (let i = 0; i < n; i++) if (map[i] >= 0) for (let c = 0; c < a.itemSize; c++) A[map[i] * a.itemSize + c] = a.array[i * a.itemSize + c];
    out.setAttribute(k, new THREE.BufferAttribute(A, a.itemSize));
  }
  out.setIndex(Array.from(ix, (i) => map[i]));
  out.userData.keep = map;
  out.computeBoundingSphere();
  return out;
}
function makeGeo(P, N, U, SIo, SWo, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(N), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(U), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(SIo), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(SWo), 4));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
// 色を付けた写し（位置・骨は共有。色 color・col2・mtl だけ姿ごと）
const painted = new Map();
const mtlOf = (kind, dirt) => kind + kind * 8 + Math.min(1, dirt) * 0.9;
function paint(src, key, colorAt) {
  let g = painted.get(key);
  if (g) return g;
  const n = src.attributes.position.count, C = new Float32Array(n * 3), M = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { M[i] = colorAt(i, c); C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }
  g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) g.setAttribute(k, src.attributes[k]);
  g.setIndex(src.index); g.boundingSphere = src.boundingSphere;
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('col2', new THREE.BufferAttribute(C, 3));
  g.setAttribute('mtl', new THREE.BufferAttribute(M, 1));
  painted.set(key, g);
  return g;
}
// 姿 L の体と頭（束ねた形の部品の並びに足す物）。支度が出来ていなければ null（元の人形のまま）
export function realBodyParts(L) {
  if (!ready()) return null;
  try {
    if (!base) {
      const t0 = performance.now();
      base = { body: buildBody(), head: buildHead() };
      REAL_BODY.stat = { bodyTri: base.body.geo.index.count / 3, headTri: base.head.geo.index.count / 3, ms: +(performance.now() - t0).toFixed(1) };
    }
  } catch (e) { REAL_BODY.on = false; REAL_BODY.stat.err = String(e && e.message || e).slice(0, 120); return null; }
  const tier = L.tier || 0, dirt = L.dirt ?? [0.85, 0.6, 0.45, 0.3][tier] ?? 0.5;
  // 布の色：humans_materials.js の bodyMaterial と同じ褪せ方（洗いざらしの生成り・茶・柿渋へ寄せる。青くしない）
  const fade = ((L.face | 0) + (L.vi | 0)) % 3, named = !!(L.hero || typeof L.face === 'string' || tier >= 2);
  const fc = new THREE.Color(L.cloth || 0x2b2622), hsl = fc.getHSL({});
  fc.setHSL(hsl.h, hsl.s * [0.9, 0.76, 0.62][fade], Math.min(0.5, hsl.l * [1.0, 1.1, 1.22][fade] + 0.01 * fade)).lerp(new THREE.Color([0x5a5044, 0x6a4028, named ? 0x5a5850 : 0x6e6450][fade]), named ? [0.04, 0.1, 0.16][fade] : [0.04, 0.16, 0.18][fade]);
  const hk = tier === 0 ? fc.clone() : fc.clone().multiplyScalar(0.8).lerp(new THREE.Color([0x3a3430, 0x2e2a26, 0x4e3a28][fade]), named ? 0 : [0, 0.55, 0.5][fade]);
  const sk = new THREE.Color(L.skin || 0xb58c68);
  const hairC = new THREE.Color(0x17130f);
  const B = base.body, Hd = base.head;
  const bodyKey = 'b|' + fc.getHexString() + '|' + hk.getHexString() + '|' + sk.getHexString() + '|' + dirt;
  const body = paint(B.geo, bodyKey, (i, c) => {
    const p = B.part[i];
    if (p === PART.hand) { c.copy(sk).multiplyScalar(0.92); return mtlOf(MK.skin, dirt * 0.5); }
    c.copy(p === PART.leg ? hk : fc); return mtlOf(MK.cloth, dirt);
  });
  const headKey = 'h|' + sk.getHexString() + (L.monk ? '|m' : '');
  // K341④：髭の濃さと口髭は肌の色から決める（色の鍵は今のまま。束の数・描く数は増えない）
  const hv = ((sk.r * 255) | 0) * 7 + ((sk.g * 255) | 0) * 3 + ((sk.b * 255) | 0), stubK = [0.22, 0.34, 0.46][hv % 3];
  const head = paint(Hd.geo, headKey, (i, c) => {
    if (Hd.hair[i] === 1 && !L.monk) { c.copy(hairC); return mtlOf(MK.cloth, 0); }
    c.setRGB(Math.min(1, sk.r * Hd.tex[i * 3]), Math.min(1, sk.g * Hd.tex[i * 3 + 1]), Math.min(1, sk.b * Hd.tex[i * 3 + 2]));
    // 月代（僧は頭全体）：伸びかけの毛で青黒く沈んだ剃った肌
    if (Hd.hair[i]) { c.setRGB(c.r * 0.66, c.g * 0.66, c.b * 0.74); return mtlOf(MK.skin, 0.2); }
    const F4 = Hd.feat, dk = F4 ? 1 - F4[i * 4] : 1, rd = F4 ? F4[i * 4 + 1] : 0;
    if (dk < 1) c.setRGB(c.r * dk * (1 + 0.12 * rd), c.g * dk * (1 - 0.1 * rd), c.b * dk * (1 - 0.06 * rd));
    if (F4 && CROWD_FACE) {
      const st = F4[i * 4 + 2] * (L.monk ? 0.15 : stubK), lt = 1 + F4[i * 4 + 3];
      c.setRGB(Math.min(1, c.r * (1 - st * 0.75) * lt), Math.min(1, c.g * (1 - st * 0.72) * lt), Math.min(1, c.b * (1 - st * 0.58) * lt));
      // 唇：写真の肌の紅い唇は紅を差した人形に見える。日焼けした肌の色へ寄せ、少し暗く
      if (rd > 0.05) { const k = Math.min(1, rd * 1.4) * 0.7; c.setRGB(c.r + (sk.r * 0.72 - c.r) * k, c.g + (sk.g * 0.68 - c.g) * k, c.b + (sk.b * 0.66 - c.b) * k); }
    }
    return mtlOf(MK.skin, 0.2);
  });
  return [body, head];
}
