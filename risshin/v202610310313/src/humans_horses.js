// 人の処理：馬の形と読み込み。外部向けの入口は humans.js。
import { assetBytes, texOr } from './bin_assets.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepHorse, HORSE, HORSE_Q, HR, PX_HORSE_K, proxyLo, _pxOff } from './humans_horse_model.js';
import { horseMaterials, _lin } from './humans_horse_materials.js';
import { HORSE_HOOK } from './units.js';
import { driveHorse, placeHorseExtras } from './humans_horse_animate.js';
import { S, MEM_TIGHT } from './settings.js';
import { makeRealHorse, dressHorse, tackGeometry, colGeo, tf, strap, mergeG } from './humans_horse_tack.js';
import { preparationFrame } from './humans_shared.js';
import { MK } from './units_model.js';
import { PLAIN_UV } from './humans_dress.js';
import { stirrupParts } from './horse_tack.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodSwap } from './units_flags.js';

let hrLoading = null;
function loadHorse() {
  if (hrLoading) return hrLoading;
  hrLoading = (async () => {
    const buf = await assetBytes('horse');
    const tl = new THREE.TextureLoader();
    const names = ['horse_col', 'horse_nrm', 'hair_col', 'hair_nrm', 'shoe_col', 'tack_col'];
    const [gl, ...ts] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...names.map((n) => texOr(n, new URL('../assets/horse_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: 4 })),
    ]);
    const tex = {};
    names.forEach((n, i) => { tex[n] = ts[i]; });
    prepHorse(gl, tex);
    // 毛色と家ごとの馬具の色の材質を先に作っておく（戦の中で new しない。形の下ごしらえは一つを使い回す）
    try {
      const { COATS, horseStyleFor, FACTION } = await import('./units.js');
      for (const fac of ['', ...Object.keys(FACTION)]) for (const rk of [0, 1, 2]) for (const c of COATS) horseMaterials({ ...horseStyleFor(0, rk, fac), coat: c.coat, mane: c.mane, points: c.points });
    } catch (e) { /* 先に作れなくても、要る時に作る */ }
    HORSE.ready = true;
    HORSE_HOOK.drive = driveHorse;
  })().catch((e) => { HORSE.failed = true; HORSE.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の馬を読めませんでした（今の形の馬で描きます）', e); });
  return hrLoading;
}
// 支度中の戦場の光を明示して、馬の形・馬具・描き方を先に用意する。
// game.battle への引き渡し前でも動き、二戦目もその戦場の光で準備する。
async function primeHorses(rt, current = () => true) {
  // 本能寺などの徒歩の戦で、使わない馬の展開と最大八秒の待ちを挟まない。
  if (rt.def?.noHorse || !current()) return;
  let timer;
  try {
    const ready = await Promise.race([loadHorse().then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 8000); })]);
    if (!ready) return;
  } finally { clearTimeout(timer); }
  if (!HORSE.ready || !current()) return;
  const horses = new Set(rt.army.units.map(u => u.horse).filter(Boolean));
  if (rt.player.horse) horses.add(rt.player.horse);
  // 遠い馬の静かな形は残す。骨と動きの作り置きは、開幕で使う距離だけ。
  // 戦中の選び方・上限は updateHorses のまま、近づいた馬は通常どおり作る。
  const near = new Set(), cam = rt.camera.position;
  const range = HORSE_Q[S.quality].near;
  for (const u of rt.army.units) {
    if (u.gone || !u.mounted || !u.horse || u.horse.visible === false || (!u.alive && u.deadT > 30)) continue;
    const named = u.look?.officer || u.type === 'busho' || typeof u.look?.face === 'string' && u.look.face.startsWith('g:');
    if (u.isPlayer || Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) < (named ? (60) : range)) near.add(u.horse);
  }
  if (rt.player.horse) near.add(rt.player.horse);
  const prepared = [], styles = new Set();
  const cap = Math.min(near.size, HORSE_Q[S.quality].max);
  try {
    for (const h of horses) {
      if (!current()) return;
      applyProxy(h);
      const st = h.userData.style || {};
      // 階級・家を持たない拵えもあるため、実際の馬具の色も鍵に含める。
      const key = [st.coat, st.mane, st.points, st.rank, st.faction, st.tack, st.saddle, st.rim, st.cushion, st.aori, st.tassels, st.big, st.reins].join('|');
      if (near.has(h) && !styles.has(key)) {
        styles.add(key);
        const R = prepared.length < cap ? (HR.pool.pop() || makeRealHorse()) : prepared[0];
        if (prepared.length < cap) prepared.push(R);
        dressHorse(R, st);
      }
      await preparationFrame();
    }
  } finally {
    HR.pool.push(...prepared);
    if (typeof window !== 'undefined' && window.__loadTimes) window.__loadTimes.horsesPrimed = prepared.length;
  }
}
// 毛色・馬具ごとの形（部位ごとの BufferGeometry。今の形の馬の部品の座標＝根元の座標 / HORSE_K から支点を引いた所）
function proxyGeos(st) {
  const PX = HR.proxy, K = PX_HORSE_K;
  const key = [st.coat, st.mane, st.points ?? 0, st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (PX.styles.has(key)) return PX.styles.get(key);
  const coat = new THREE.Color(st.coat ?? 0x5a321c), mane = new THREE.Color(st.mane ?? 0x1a1410), hoof = new THREE.Color(0x1a1511), skin = new THREE.Color(0x231a14);
  const pts = st.points ?? 0, c = new THREE.Color();
  const out = {};
  const mtlSkin = MK.skin + MK.skin * 8 + 0.2 * 0.9, mtlHair = MK.cloth + MK.cloth * 8;
  for (const g in PX.G) {
    const S = PX.G[g], n = S.P.length / 3, pv = PX.piv[g] || new THREE.Vector3();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = S.P[i * 3], y = S.P[i * 3 + 1], z = S.P[i * 3 + 2];
      pos[i * 3] = (x - pv.x) / K; pos[i * 3 + 1] = (y - pv.y) / K; pos[i * 3 + 2] = (z - pv.z) / K;
      const kd = S.K[i];
      if (kd === 1) c.copy(hoof);
      else if (kd === 2) c.copy(mane).multiplyScalar(0.7 + 0.5 * S.T[i]);
      else if (kd === 3) c.setRGB(0.02, 0.016, 0.014);
      else {
        c.copy(coat).multiplyScalar(0.85 * S.C[i]);
        // 鹿毛の脚先は黒い。鼻づらは暗い肌。腹の下は少し淡い（体の色の絵の陰と合わせる）
        const legs = (1 - THREE.MathUtils.smoothstep(y, 0.24, 0.55)) * Math.min(1, pts);
        c.lerp(mane, legs * 0.85);
        c.lerp(skin, THREE.MathUtils.smoothstep(z, 1.62, 1.78) * 0.6 * (1 - THREE.MathUtils.smoothstep(y, 0.6, 0.8)));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mt[i] = kd === 2 ? mtlHair : mtlSkin;
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(S.IX);
    // 尾は今の形の馬が 0.35 だけ持ち上げて置くので、その分を戻しておく
    if (g === 'tail') geo.rotateX(-0.35);
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
    geo.setAttribute('mtl', new THREE.BufferAttribute(mt, 1));
    const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (g === 'body') {
      // 和鞍・胸繋・尻繋（本物の馬と同じ形）を胴に混ぜる
      const T = tackGeometry(st), add = [geo];
      const stir = [];
      for (const sd of [1, -1]) {
        for (const [g, color] of stirrupParts()) stir.push(colGeo(tf(g.clone(), sd * 0.3, 0.76, 0.1), color));
        stir.push(colGeo(strap([[sd * 0.19, 1.3, 0.03], [sd * 0.3, 0.96, 0.15]], 0.012), st.tack));
      }
      for (const [k, arr] of Object.entries({ ...T, stir: [mergeG(stir)] })) arr.forEach((tg, j) => {
        if (!tg) return;
        const t = tg.clone();
        for (const nm of Object.keys(t.attributes)) if (!['position', 'normal', 'color'].includes(nm)) t.deleteAttribute(nm);
        if (!t.attributes.normal) t.computeVertexNormals();
        t.scale(1 / K, 1 / K, 1 / K);
        const m = t.attributes.position.count;
        if (!t.attributes.color) { const cc = new Float32Array(m * 3).fill(0.3); t.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
        t.setAttribute('col2', new THREE.BufferAttribute(t.attributes.color.array.slice(), 3));
        const kind = j === 0 && k !== 'seat' ? MK.lac : j === 0 ? MK.lac : MK.cloth;
        t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(kind + MK.cloth * 8 + 0.2), 1));
        const tu = new Float32Array(m * 2); for (let i = 0; i < m; i++) { tu[i * 2] = PLAIN_UV[0]; tu[i * 2 + 1] = PLAIN_UV[1]; }
        t.setAttribute('uv', new THREE.BufferAttribute(tu, 2));
        const nx = t.index ? t : (() => { const q = t; const ii = new Uint32Array(m); for (let i = 0; i < m; i++) ii[i] = i; q.setIndex(new THREE.BufferAttribute(ii, 1)); return q; })();
        add.push(nx);
      });
      geo = mergeGeometries(add) || geo;
    }
    if (g === 'neck' && HR.bridle) {
      const t = HR.bridle.clone();
      t.translate(-pv.x, -pv.y, -pv.z); t.scale(1 / K, 1 / K, 1 / K);
      const m = t.attributes.position.count, col = new Float32Array(m * 3), color = _lin(st.tack);
      for (let i = 0; i < m; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
      t.setAttribute('color', new THREE.BufferAttribute(col, 3));
      t.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
      t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(MK.cloth + MK.cloth * 8), 1));
      const uv = t.attributes.uv;
      for (let i = 0; i < m; i++) uv.setXY(i, PLAIN_UV[0], PLAIN_UV[1]);
      const ix = new Uint32Array(m); for (let i = 0; i < m; i++) ix[i] = i;
      t.setIndex(new THREE.BufferAttribute(ix, 1));
      geo = mergeGeometries([geo, t]) || geo;
    }
    geo.computeBoundingSphere();
    out[g] = geo;
  }
  PX.styles.set(key, out);
  return out;
}
function applyProxy(h) {
  const H = h.userData.horse; if (!H || h.userData.px) return;
  h.userData.px = true;
  const P = proxyGeos(h.userData.style || {}), PV = HR.proxy.piv, K = PX_HORSE_K;
  const meshOf = (g) => g.isMesh ? g : g.children.find((o) => o.isMesh);
  const swap = (mesh, hi, off) => {
    if (!mesh || !hi) return;
    const L = mesh.userData.lod, lo = L ? L[1] : mesh.geometry;
    lodSwap(mesh, hi, proxyLo(lo, off), 30);
  };
  // 胴（支点は動かさない）
  swap(H.body, P.body, _pxOff.set(0, 0, 0));
  // 首と頭
  {
    const np = PV.neck.clone().multiplyScalar(1 / K), off = H.neck.position.clone().sub(np);
    H.neck.position.copy(np); swap(meshOf(H.neck), P.neck, off);
    for (const e of H.ears || []) e.visible = false;
    // 銜の場所（首の座標）：上唇の少し奥
    H.bitN = new THREE.Vector3(0.05 / K, 0, 0).add(HR.proxy.bitN);
  }
  // 尾
  { const tp = PV.tail.clone().multiplyScalar(1 / K), off = H.tail.position.clone().sub(tp); H.tail.position.copy(tp); swap(meshOf(H.tail), P.tail, off); }
  // 脚
  for (let i = 0; i < 4; i++) {
    const Lg = H.legs[i], Kg = H.lowers[i];
    const up = PV['u' + i].clone().multiplyScalar(1 / K), lw = PV['l' + i].clone().multiplyScalar(1 / K);
    const oldL = Lg.position.clone(), oldKA = oldL.clone().add(Kg.position);
    Lg.position.copy(up); Kg.position.copy(lw.clone().sub(up));
    swap(meshOf(Lg), P['u' + i], oldL.clone().sub(up));
    swap(meshOf(Kg), P['l' + i], oldKA.sub(lw));
  }
}
// 今の形の馬に、骨の入った馬を付ける・外す
function attachReal(h) {
  const H = h.userData.horse;
  if (!H.real) H.real = HR.pool.pop() || makeRealHorse();
  const R = H.real;
  dressHorse(R, h.userData.style || {});
  if (R.holder.parent !== h) { h.add(R.holder); h.add(R.extra); }
  R.on = true; R.holder.visible = R.extra.visible = true;
  H.pose.visible = false;
  // 付けたコマのうちに姿勢を合わせる（立ち姿のまま一コマ出ないように）
  R.yaw = undefined; R.prev = H.speed || 0; R.oneK = H.dead ? 'death' : null; R.oneT = H.dead ? H.deadT : 0; R.flinch = 0;
  driveHorse(h, 0, H.speed || 0);
}
function detachReal(h) {
  const H = h.userData.horse, R = H.real;
  if (!R) return;
  h.remove(R.holder); h.remove(R.extra);
  R.on = false;
  H.pose.visible = true;
  H.real = null;
  HR.pool.push(R);
}
// 毎コマ（updateHumans から）：近い馬を選んで、骨の入った馬に入れ替える
const horsesOn = new Set();
const horseCandidates = [];
const horseWanted = new Map();
const HORSE_TIGHT = { near: 36, far: 40, max: 16, must: 28, mustMax: 28 };
let madeHorses = 0;
function updateHorses(rt) {
  madeHorses = 0;
  const on = HORSE.on && !rt.def?.noHorse && !(typeof location !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search)));
  if (on && !hrLoading && !rt.horseLoadPending) loadHorse();
  const want = horseWanted; want.clear();
  if (on && HORSE.ready) {
    const cam = rt.camera, cx = cam.position.x, cz = cam.position.z;
    // 馬の見た目は画質に関わらず写実。だが何頭を骨の入った馬にするかは、人と同じく画質なり（10/2 測って直す：
    //   姉川の騎馬で、携帯でも 40m の内の十頭あまりが一頭 2〜9万面・20〜37 回の描きのまま並び、一コマの三分の一を食っていた）
    // iPhone（MEM_TIGHT）は骨の入った馬を十六頭・32m の内でも二十八頭まで（設楽原の武田の騎馬の突撃で六十頭まで本物の馬になり、WebContent が落ちた 10/30）。その先は今の形の馬（写実の形）で描く
    const HQ = MEM_TIGHT ? HORSE_TIGHT : HORSE_Q.high;
    const cand = horseCandidates; cand.length = 0;
    let pxMade = 0;
    // 同じコマに毛色別の形をまとめて作らない。本人を先に、残りは一頭ずつ次のコマへ。
    const P = rt.player;
    if (P && P.horse && HR.proxy && !P.horse.userData.px) { applyProxy(P.horse); pxMade++; }
    // 兵でない馬（使番・戦ごとの飾りの馬）も、作られた順に本物の馬の形へ
    while (HR.proxy && HORSE_HOOK.made.length && pxMade < 1) { const h = HORSE_HOOK.made.pop(); if (!h.userData.px) { applyProxy(h); pxMade++; } }
    const add = (h, u, x, z, pri) => {
      if (!h || !h.userData.horse || h.visible === false) return;
      const d = Math.hypot(x - cx, z - cz), H = h.userData.horse;
      const lim = H.real ? HQ.far : HQ.near;
      if (d < lim || pri < 0) {
        let entry = h.userData.horseCandidate;
        if (!entry) entry = h.userData.horseCandidate = { h, u: null, d: 0, dist: 0 };
        entry.u = u; entry.d = pri === -2 ? -1e9 : pri < 0 ? -1 + d * 0.001 : d * pri; entry.dist = d; cand.push(entry);
      }
    };
    for (const u of rt.army.units) {
      if (u.gone || !u.mounted || !u.horse || (!u.alive && u.deadT > 30)) continue;
      if (HR.proxy && !u.horse.userData.px && pxMade < 1) { applyProxy(u.horse); pxMade++; }
      const named = u.look && (u.look.officer || typeof u.look.face === 'string' && u.look.face.startsWith('g:') || u.type === 'busho');
      // 名のある武将の馬は本人の馬と同じ：60m までは必ず骨の入った馬に
      const near60 = named && Math.hypot(u.pos.x - cx, u.pos.z - cz) < (60);   // 低（携帯）は 20m まで
      add(u.horse, u, u.pos.x, u.pos.z, u.isPlayer ? -2 : near60 ? -1 : named ? 0.6 : 1);
    }
    if (P && P.horse && !P.mounted && P.horse.parent) add(P.horse, null, P.horse.position.x, P.horse.position.z, -2);
    // 降馬した後も、近くで倒れる途中の馬は同じ枠で描く。
    for (const o of rt.army.fallenHorses || []) if (o.h?.parent && o.t < 4) add(o.h, null, o.h.position.x, o.h.position.z, 1);
    // 乗り手を失って駆け回る馬
    for (const o of rt.army.looseHorses || []) if (o.h && o.h.parent) add(o.h, null, o.h.position.x, o.h.position.z, 1.2);
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length && want.size < HQ.max; i++) want.set(cand[i].h, cand[i].u);
    if (HQ.must) for (let i = 0; i < cand.length && want.size < HQ.mustMax; i++) { const c = cand[i]; if (!want.has(c.h) && c.dist < HQ.must) want.set(c.h, c.u); }
  }
  for (const h of horsesOn) if (!want.has(h)) { detachReal(h); horsesOn.delete(h); }
  for (const h of want.keys()) {
    if (horsesOn.has(h)) continue;
    if (madeHorses >= 2 && !h.userData.horse.real) continue;   // 一コマに作るのは二頭まで（一コマが重くならないよう）
    if (!HR.pool.length) madeHorses++;
    attachReal(h); horsesOn.add(h);
  }
  return want;
}
function horseCount() { return horsesOn.size; }
// 見本の画面（開発用）から：今の形の馬に骨の入った馬を付ける・鐙と手綱を置く
function showHorse(h) { if (!HORSE.ready || !h.userData.horse) return false; attachReal(h); horsesOn.add(h); return true; }
// 見本の画面（開発用）から：今の形の馬を、切り分けた本物の馬の形にする
function proxyHorse(h) { if (HR && HR.proxy) applyProxy(h); }
function horseExtras(h, u) { if (h.userData.horse && h.userData.horse.real) placeHorseExtras(h, u); }


export { loadHorse, primeHorses, detachReal, horsesOn, horseCandidates, horseWanted, updateHorses, horseCount, showHorse, proxyHorse, horseExtras };
