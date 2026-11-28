// 骨の入った人に付く小さな部品（髪の房・髷・元結・目玉・戦の傷と泥・近くの指物の布）を束ねて描く（一人ずつ描かない）。
//   同じ形と材質の組は一つの InstancedMesh へ。顔の形ごとに形の違う小さな部品（目玉・髷・元結）は、
//   材質ごとに一つの BatchedMesh（一括描画の拡張がある機種）へ入れて、顔の形が違っても一回で描く。
//   形・材質・色・影はそのまま。元の部品は layers を空にして描きから外す（行列と動きは今までどおり）。
//   束ねてよい材質だけ（userData.humanBatch・unitBatch・nearFlag）。人ごとに値の違う材質（顔の表情）・形の変わる物（歯）・骨の入った物は元のまま。
import * as THREE from 'three';
import { hasMultiDraw } from './world.js';
import { boneHolder } from './humans_bones.js';
import { MEM_TIGHT } from './settings.js';
import { memBudgetScale } from './device_tier.js';

// HB.on = false で元の一つずつの描き方に戻す（測り・見比べ用）。multi = false で BatchedMesh を使わない
export const HB = { on: true, multi: true, shared: true };   // shared = false で鐙・面繋を束ねない（11/21 K564 の見比べ用）
const NO_OBR = THREE.Object3D.prototype.onBeforeRender;
const okMat = (m) => !!m && m.isMaterial && !!(m.userData.humanBatch || m.userData.unitBatch || m.userData.nearFlag) && !m.userData.faded;
// BatchedMesh へ入れる小さな形（頂点がこれ以下）と、一つの入れ物の場所の数（近くで顔の見える人の数より多め）
const MULTI_V = 1500, SLOTS = 64;
// 11/21 K564【難】（クラウドし）：骨入りの馬の馬具（鞍・胸繋・尻繋。材質 TACK_GLOSS・MATTE・SILK、印 tackBatch）は拵えごとに形が違い（1500〜6200頂点）、
//   同じ形の組が二つ無いと一頭ずつ描かれていた（道明寺30秒で M:BN_* 約35回）。材質ごとに一つの BatchedMesh へ入れ、形が違っても一回で描く。
//   大きい形なので入れ物は頂点の総数で決める（一つ約12万頂点＝約4MB・場所24）。入らない形は今までどおり一つずつ
const TACK_V = 11000, TACK_SLOTS = 24, TACK_POOL_V = 120000;
// 携帯の人の束の入れ物の合わせた上限（CPU の写しのバイト。GPU にも同じだけ置く）。?apx の hbnocap で上限なしと比べる
const HB_BUDGET = 56 * 1048576;
const multiOk = (m) => !!(m.userData.humanBatch || m.userData.tackBatch);
// 11/21 K564【難】（クラウドせ）：近くの武将・名のある者（keepQuality。固有の材質を保つので束の輪を通らない人）と骨の入った兵の体の部品（受け sock:* の下の
//   胴・腕・脚・手・頭の物）は、形が一人ずつ違い一つずつ描かれていた（本能寺の前夜6秒で 色の描き126・影の描き122＝材質は二つ三つ）。
//   同じ材質の部品を材質ごとの BatchedMesh へ入れて一回で描く（形・材質・影はそのまま。材質は同じ物の写しで、色と透けは毎コマ写す）。
//   半透けの物・独自の描き方（onBeforeRender）・影の材質を持つ物・形の変わる物は元のまま
const BODY_V = 6000, BODY_SLOTS = 192, BODY_POOL_V = 100000;
// 11/27 K564【難】（クラウドさ）：体の入れ物は 75000〜100000頂点を取って使うのは 1000〜6000（u12 手取川で入れ物13・39MB が携帯の上限に届き、断り414回）。
//   満ちたら同じ鍵の次の入れ物へ回す（put の鎖）ので、体の入れ物は小さく取る。?apx の hbnochain で前の大きさと鎖なし
const BODY_POOL_V_SMALL = 20000;
const okBody = (c) => { const m = c.material; return !!m && m.isMaterial && !m.transparent && !m.userData.faded && !c.customDepthMaterial && !c.customDistanceMaterial; };
// 馬具は骨の立ち姿の逆を掛けた鏡写しの行列（determinant が負）。束の一回の描きでは表裏が逆になり、布が暗く・金の房が消えた。
//   鏡写しの物は別の入れ物に入れ、入れ物の行列を左右の鏡にして（three が表裏を返す）、中の一つずつの行列には同じ鏡を先に掛けて打ち消す
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1), _mm = new THREE.Matrix4();

// 束専用の材質の写し。同じ材質を一つずつの形と束で使い回すと、three が描くたびに描き方を選び直す（文字列の鍵・ゴミ）。
//   元の材質が変われば（version）写し直す。onBeforeCompile・鍵・userData は元と共有
const variants = new WeakMap();
function variantOf(mat, kind) {
  let vs = variants.get(mat);
  if (!vs) variants.set(mat, vs = {});
  let v = vs[kind];
  if (v && v._srcVersion === mat.version) return v;
  if (!v) { v = mat.clone(); vs[kind] = v; } else { v.copy(mat); v.needsUpdate = true; }
  v.onBeforeCompile = mat.onBeforeCompile;
  if (mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) v.customProgramCacheKey = mat.customProgramCacheKey;
  if (mat.defines) v.defines = Object.assign({}, mat.defines);
  v.userData = mat.userData;
  v._srcVersion = mat.version;
  return v;
}

// 二人以上が同じ束に入る時だけ束ねる（一人だけの束は、描く回数が減らずに行列の転送だけ増える）。前のコマの数で決める
function counted(B, k) {
  if (k.cur === undefined) { k.cur = 0; k.prev = 0; }
  if (k.cur++ === 0) B.hSeen.push(k);
  return k.prev >= 2;
}
// 材質と頂点の作りごとの BatchedMesh の入れ物（の数え札）。小さくない形・作りの違う形は null
function poolKey(B, c, cast, neg) {
  const g = c.geometry;
  let sig = B.hSig.get(g);
  if (sig === undefined) {
    sig = (g.index ? 'i' : 'n') + Object.keys(g.attributes).sort().map((k) => { const a = g.attributes[k]; return a.isInterleavedBufferAttribute ? '!' : k + a.itemSize + (a.normalized ? 'n' : ''); }).join(',');
    if (sig.includes('!')) sig = '';
    B.hSig.set(g, sig);
  }
  if (!sig || g.attributes.position.count > (B.hBody ? BODY_V : c.material.userData.tackBatch ? TACK_V : MULTI_V)) return null;
  let bySig = B.hPK.get(c.material);
  if (!bySig) B.hPK.set(c.material, bySig = new Map());
  const s2 = (cast ? sig + '|c' : sig) + (neg ? '|m' : '') + (B.hBody ? '|b' : '');
  let k = bySig.get(s2);
  if (!k) bySig.set(s2, k = { pool: null });
  return k;
}
function poolOf(army, B, c, cast, k, neg) {
  if (k.pool) return k.pool;
  if (B.hMade >= 1 || B.hWorkMs >= 1) return null;
  const started = performance.now();
  const g = c.geometry, nv = g.attributes.position.count, ni = g.index ? g.index.count : 0;
  const body = !!B.hBody, tack = !body && !!c.material.userData.tackBatch, slots = body ? BODY_SLOTS : tack ? TACK_SLOTS : SLOTS;
  const PV = Math.round((body ? (window.__apx?.hbnochain ? BODY_POOL_V : BODY_POOL_V_SMALL) : TACK_POOL_V) * (MEM_TIGHT ? Math.max(0.6, memBudgetScale()) : 1));   // 11/22 K623：記憶の少ない携帯・落ちた端末は束の入れ物を 0.75〜0.6 に（束一つ約3MB。数は over300 が測る）
  const vMax = body || tack ? Math.max(PV, Math.ceil(nv * 1.1) * 2) : Math.ceil(nv * 1.1) * SLOTS;
  const iMax = ni ? (body || tack ? Math.max(PV, Math.ceil(ni * 1.1) * 2) : Math.ceil(ni * 1.1) * SLOTS) : 0;
  // K626（iPhone 16 Pro の実機：戦の5〜9分で WebContent が約2GB で落ちた。人の束の入れ物が戦の間に増え続け、CPU の写しと GPU の両方で 300MB を越えた）：
  //   記憶の少ない端末（携帯）は、入れ物の合わせた大きさに上限を置く。越えた部品は束へ入れず、今までどおり一つずつ描く（形・材質・影は同じ。描く回数が少し増える）
  const vb = Object.values(g.attributes).reduce((n, at) => n + at.itemSize * (at.array?.BYTES_PER_ELEMENT || 4), 4), est = vMax * vb + (iMax || 3) * 4;
  if (MEM_TIGHT && (B.hPoolBytes || 0) + est > HB_BUDGET * memBudgetScale() && !window.__apx?.hbnocap) { B.hCapped = (B.hCapped || 0) + 1; return null; }
  B.hPoolBytes = (B.hPoolBytes || 0) + est;
  const bm = new THREE.BatchedMesh(slots, vMax, iMax || 3, variantOf(c.material, 'b'));
  bm.name = 'humanBatch'; bm.matrixAutoUpdate = false; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false;
  if (neg) { bm.matrix.copy(MIRROR); bm.matrixWorld.copy(MIRROR); }
  // 馬具は元の一頭ずつの形と同じく影を受けない（受けると暗く見えた）
  // 11/21 クラウド 戸次川の持ち主：上の注釈が同じ行の unitShadowBatch・visible を飲み込み、束が景色の影の焼き込みに入り・兵の影が外されていたのを戻す
  bm.castShadow = cast; bm.receiveShadow = tack || body ? !!c.receiveShadow : true; bm.userData.unitShadowBatch = cast; bm.visible = false;
  army.scene.add(bm);
  k.pool = { bm, owner: [], geo: [], last: [], used: [], vMax, iMax, slots, neg: !!neg, v: 0, i: 0, src: body ? c.material : null };
  B.hPools.push(k.pool);
  B.hMade++; B.hWorkMs += performance.now() - started;
  return k.pool;
}
function needsReadback(g) {
  for (const k in g.attributes) if (g.attributes[k]._gpuRef) return true;
  return !!(g.index && g.index._gpuRef);
}
// 部品 c の場所（id）。前と同じなら使い回し、無ければ 2 秒見えない人の場所へ上書きするか、新しく足す。入らなければ -1
function slotOf(pool, c, frame, B) {
  const s = c.userData.hbSlot;
  if (s && s.pool === pool && pool.owner[s.id] === c && pool.geo[s.id] === c.geometry) return s.id;
  if (B.hCopied >= 4 || B.hWorkMs >= 1) return -1;
  // 11/18 K365（クラウド12）：CPU の写しを手放した形は、写す時に GPU から読み戻す（GPU の描き終わりを待つ）。関ヶ原の開戦一秒に髪・目の形の読み戻しが
  //   許しを待たずに続き、一コマが固まっていた。units.js の soloDraw と同じく、読み戻しを許すコマ（main.js の may）だけ写し、ほかのコマは今までの束で描く
  const GO = globalThis.__gpuOnly;
  if (GO && !GO.may() && needsReadback(c.geometry) && !window.__apx?.hbrbfree) { B.hWaitRb = (B.hWaitRb || 0) + 1; return -1; }
  const started = performance.now();
  B.hCopied++;
  try {
    const g = c.geometry, nv = g.attributes.position.count, ni = g.index ? g.index.count : 0, R = pool.bm._reservedRanges;
    let id = -1;
    for (let k = 0; k < R.length; k++) {
      if (pool.owner[k] && frame - pool.last[k] < 120) continue;
      if (R[k].vertexCount < nv || ni && R[k].indexCount < ni) continue;
      try { if (pool.geo[k] !== g) pool.bm.setGeometryAt(k, g); } catch (e) { continue; }
      id = k; break;
    }
    if (id < 0) {
      if (R.length >= pool.slots || pool.v + nv > pool.vMax || ni && pool.i + ni > pool.iMax) { pool.full = true; return -1; }
      try { id = pool.bm.addGeometry(g); } catch (e) { return -1; }
      pool.v += nv; pool.i += ni;
    }
    const prev = pool.owner[id];
    if (prev && prev !== c && prev.userData.hbSlot && prev.userData.hbSlot.pool === pool) prev.userData.hbSlot = null;
    pool.owner[id] = c; pool.geo[id] = g;
    c.userData.hbSlot = { pool, id };
    return id;
  } finally { B.hWorkMs += performance.now() - started; }
}

// 束へ入れたら true（元の部品を描きから外す）。一人だけの束になる物は false（元のまま描く）
function put(army, B, c, cast) {
  const tack = !!c.material.userData.tackBatch, neg = (tack || B.hBody) && c.matrixWorld.determinant() < 0;
  if (B.multi && (B.hBody || multiOk(c.material)) && !(HB.shared && c.userData.hbShared)) {
    const k0 = poolKey(B, c, cast, neg);
    if (k0) {
      if (!counted(B, k0)) return false;
      // 11/27 K564【難】（クラウドさ）：入れ物が満ちた（場所24・頂点の枠）材質は、同じ鍵の次の入れ物へ（三つまで）。
      //   前は一つ目が満ちると残りが一つずつ描かれた（上杉 u12 手取川の騎馬17騎で鞍・胸繋・尻繋 M:BN_* 約30回）。?apx の hbnochain で前
      const s0 = c.userData.hbSlot;
      let k = k0;
      if (s0 && !window.__apx?.hbnochain && s0.pool.owner[s0.id] === c && s0.pool.geo[s0.id] === c.geometry) for (let q = k0; q; q = q.next) if (q.pool === s0.pool) { k = q; break; }
      for (let d = 0; k && d < 3; k = k.next, d++) {
        const pool = poolOf(army, B, c, cast, k, neg);
        if (!pool) return false;
        const id = slotOf(pool, c, B.hFrame, B);
        if (id >= 0) {
          pool.bm.setMatrixAt(id, neg ? _mm.multiplyMatrices(MIRROR, c.matrixWorld) : c.matrixWorld);
          pool.bm.setVisibleAt(id, true);
          pool.last[id] = B.hFrame; pool.used.push(id); pool.bm.visible = true;
          return true;
        }
        if (!pool.full || window.__apx?.hbnochain || B.hCopied >= 4) break;
        if (!k.next) k.next = { pool: null };
      }
    }
  }
  // 鏡写しの馬具は InstancedMesh の束でも表裏が逆になるので、束へ入らなければ一つずつ描く（元の形のまま）。
  //   11/21 K564（クラウドせ）：全頭で同じ形の鐙・面繋（hbShared）だけは、鏡写しの束（入れ物の行列を左右の鏡に・中の行列にも同じ鏡を先に掛ける＝units.js の neg と同じ）へ
  const shared = HB.shared && !!c.userData.hbShared, mneg = shared && c.matrixWorld.determinant() < 0;
  // 11/27 K564（クラウド Sanae）：体の部品で頂点の多い形（兜など・BatchedMesh へ入らない）は、束ねてよい印の無い材質だと一つずつ描いていた。
  //   同じ形と同じ材質の物が二つ以上ある時だけ束になる（counted）ので、人ごとに材質の違う物は今まで通り。描く前の手（onBeforeRender）の物は walk で外してある。?apx の oldbodyim で前の通り
  if (neg && !shared || B.hBody && !shared && !okMat(c.material) && (window.__apx?.oldbodyim || !c.material.isMaterial)) return false;
  let gm = B.hKeys.get(c.material);
  if (!gm) B.hKeys.set(c.material, gm = new WeakMap());
  let ks = gm.get(c.geometry);
  if (!ks) gm.set(c.geometry, ks = [{}, {}, {}, {}]);
  const key = ks[(cast ? 1 : 0) + (mneg ? 2 : 0)];
  if (!counted(B, key)) return false;
  let e = B.mapH.get(key);
  if (!e || e.n >= e.cap) {
    if (B.hMade >= 1 || B.hWorkMs >= 1) return false;
    const started = performance.now();
    e = army.batchGrow(c.geometry, e, B.mapH, cast, variantOf(c.material, 'i'), key, mneg);
    B.hMade++; B.hWorkMs += performance.now() - started;
    e.im.receiveShadow = shared ? !!c.receiveShadow : true;
    e.im.name = 'humanBatch';
  }
  // 体の部品の束：元の材質の色・光り・透けを写す（傷・濡れ・討たれた後の色替えも束に。BatchedMesh の束の humanBatchBegin と同じ）
  if (B.hBody && e.n === 0) { const v = e.im.material, m = c.material; if (v !== m) { if (m.color && v.color) v.color.copy(m.color); if (m.emissive && v.emissive) v.emissive.copy(m.emissive); v.opacity = m.opacity; } }
  if (mneg) _mm.multiplyMatrices(MIRROR, c.matrixWorld).toArray(e.arr, e.n * 16);
  else c.matrixWorld.toArray(e.arr, e.n * 16);
  e.n++;
  return true;
}

function walk(army, o, B, tag) {
  const ch = o.children;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (!c || !c.visible) continue;
    const shown = (c.layers.mask & B.cameraMask) || c.userData.bT !== undefined;   // 前のコマに束ねた部品は layers が空のまま
    // 11/24 K564【難】（クラウドさ）：形を選ぶだけの描く前の手（兜の遠近 userData.lodObr）は、ここで今のカメラで先に呼んで束へ入れる。?apx の nolodobr で前の通り
    const obrOk = c.onBeforeRender === NO_OBR || c.isMesh && shown && B.cam && c.userData.lodObr === c.onBeforeRender && !window.__apx?.nolodobr && (c.onBeforeRender(null, null, B.cam), c.visible);
    if (c.isMesh && shown && c.userData.bT !== tag && !c.isSkinnedMesh && !c.isInstancedMesh && obrOk && ((B.hBody ? okBody(c) : okMat(c.material)) || HB.shared && c.userData.hbShared && c.material?.isMaterial)
      && !c.geometry.morphAttributes.position && !c.geometry.groups.length) {
      const cast = c.castShadow;
      // 画面の外の人は、影を落とす部品だけ（影の描き込みのため）
      if (!(B.on || cast) || put(army, B, c, cast)) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); }
    }
    if (c.children.length) walk(army, c, B, tag);
  }
}

// コマの初め（Army.batchDraw が兵を回る前に呼ぶ）：前のコマに描いた場所を隠す（今のコマで見えた人だけ、もう一度出す）
export function humanBatchBegin(B) {
  if (!B.mapH) { B.mapH = new Map(); B.hKeys = new WeakMap(); B.maps.push(B.mapH); B.hPools = []; B.hPK = new WeakMap(); B.hSig = new WeakMap(); B.hSeen = []; B.hFrame = 0; }
  B.hFrame++;
  // 装いの切替で顔・髪・傷の束を一斉に作らない。未完成の部品は元の形で描く。
  // 既存の場所の行列は全員更新し、新しい入れ物は一つ・形の転送は四つ・実作業一ミリ秒まで。
  B.hMade = 0; B.hCopied = 0; B.hWorkMs = 0;
  for (const k of B.hSeen) { k.prev = k.cur; k.cur = 0; }
  B.hSeen.length = 0;
  B.multi = HB.multi && hasMultiDraw();
  for (const pool of B.hPools) {
    for (const id of pool.used) pool.bm.setVisibleAt(id, false);
    pool.used.length = 0; pool.bm.visible = false;
    // 体の束：元の材質の色・透け・光りを写す（傷・濡れ・討たれた後の色替えを束にも）。作りが変われば写し直す
    const m = pool.src;
    if (m) {
      const v = pool.bm.material;
      if (v._srcVersion !== m.version) pool.bm.material = variantOf(m, 'b');
      else { if (m.color) v.color.copy(m.color); if (m.emissive) v.emissive.copy(m.emissive); v.opacity = m.opacity; }
    }
  }
}
// 一人分の骨の入った人の部品を束へ。Army.batchDraw が、軽い兵の部品を束ねた後に呼ぶ
export function batchHumanParts(army, u, B, tag) {
  if (!HB.on) return;
  const h = u.human;
  if (!h || !h.root || !h.root.visible || !h.root.parent || !h.root.parent.visible) return;
  if (!B.mapH) return;
  // 束ねる部品の付く所だけを辿る（骨六十本の全部は辿らない）：顔（髪・目）・胴の傷の入れ物・指物の持ち手
  const W = B.hW || (B.hW = { children: [null, null, null] }), w = u.armorWear;
  W.children[0] = h.parts.face || null;
  W.children[1] = w && w.root.parent === boneHolder(h.bones.Spine1) ? w.root : null;
  W.children[2] = h.flagHolder || null;
  walk(army, W, B, tag);
  // 乗っている骨の入った馬の馬具（鞍・胸繋・尻繋。馬の骨ごとに付いた形）も同じ束へ（11/17 n-map・重さ）
  batchHorseTack(army, u, B, tag);
}
// 骨の入った人の体の部品（受け sock:* の下の全部）を材質ごとの束へ（11/21 K564 クラウドせ）。本人は元のまま
export function batchHumanBody(army, u, B, tag) {
  if (!HB.on || !B.mapH || u.isPlayer || window.__apx?.nobody) return;
  const h = u.human;
  if (!h || !h.rigs || !h.root || !h.root.visible || !h.root.parent || !h.root.parent.visible) return;
  B.hBody = true;
  try {
    const S = B.hS || (B.hS = { children: null });
    for (const R of h.rigs) { S.children = R.socks; walk(army, S, B, tag); }
    S.children = null;
  } finally { B.hBody = false; }
}
// 乗っている骨の入った馬の馬具だけを束へ。近くの武将（固有の材質を保つので batchHumanParts を通らない人）の馬も、馬具は共有の材質なのでここから（11/21 K564）
export function batchHorseTack(army, u, B, tag) {
  if (!HB.on || !B.mapH) return;
  // 11/28 K564【難】（クラウドさ）：討たれて降りた武将の馬（乗り手は居ないが馬は場に残る）の馬具も束へ（u12 手取川 金森長近の馬で M:BN_* 7回）。?apx の nodeadtack で前
  const R = (u.mounted || !window.__apx?.nodeadtack && u.horse?.visible && u.horse.parent?.visible) && u.horse?.userData?.horse?.real;
  // 11/21 K564（クラウドせ）：鐙二つと面繋も（全頭で同じ形・一頭ずつ描いて近い馬一頭で三回）。馬具の表が替わった時だけ並べ直す
  if (R && R.on && R.holder.visible && R.tack && R.tack.length) {
    if (R.hbSrc !== R.tack) { R.hbSrc = R.tack; R.hbAll = R.tack.concat(R.stir || [], R.meshes?.bridle ? [R.meshes.bridle] : []); }
    const T = B.hT || (B.hT = { children: null }); T.children = HB.shared ? R.hbAll : R.tack; walk(army, T, B, tag); T.children = null;
  }
}
