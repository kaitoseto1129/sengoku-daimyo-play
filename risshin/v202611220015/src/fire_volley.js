// fire_volley.js … 全戦共通の部品 P6「火矢 → 燃え広がる」（kaito 11/20・K428）
// 頃合いに、射手の居る所（from）から的（at：屋根・門・小屋）へ火矢が弧を描いて飛ぶ（火の筋）。
// 当たった所に小さな火がつき、数秒かけて大きくなり、黒い煙が上がり、近くへ燃え移る。
// 火・煙の形は world_fire.js の addFire・addSmokeColumn をそのまま使う（新しい炎の作りは足さない）。
// 携帯で重くしない：飛ぶ火矢は同時に 24 本まで（形と材質は一度だけ作って使い回す）。
//   燃える所は一つの火矢の群れで既定 8 か所、一つの戦の全部で 20 か所まで。光は addFire の決まり（近い数個だけ）。
// 当たりの判定・建物の焼け落ち・士気には触らない（見た目だけ。戦の筋書きの火の段はそのまま）。
//
// 使い方：
//   import { fireVolley } from './fire_volley.js';
//   const v = fireVolley(rt, { from: [{ x, z }], at: [{ x, z, h: 屋根の高さ }], n: 10, over: 3 });
//   v.stop();   // 火を消す（焼け跡は戦の側で）
// o.n：火矢の本数　o.over：射ち終わるまでの秒　o.size：燃え広がった火の大きさ（既定 1.6）
// o.max：この群れで燃える所の上限　o.spread：一か所から燃え移る数（既定 2）　o.spreadTo：燃え移る先の候補 [{x,z,h}]
// o.delay：射ち始めるまでの秒　o.onLand(spot)：火が付いた時

import * as THREE from 'three';

const POOL_MAX = 24, LIVE_MAX = 20;
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // 火の筋：鏃の火（明るい玉）から後ろへ細く伸びる橙の尾。足し合わせの光で夜でも遠くから見える
  const tail = new THREE.CylinderGeometry(0.025, 0.11, 2.6, 5, 1, true);
  tail.rotateX(Math.PI / 2); tail.translate(0, 0, -1.3);
  const head = new THREE.SphereGeometry(0.16, 6, 4);
  const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  SHARED = { tail, head, tailMat: add(0xff7a1e, 0.85), headMat: add(0xffe2a0, 1) };
  return SHARED;
}
function makeStreak() {
  const S = shared(), g = new THREE.Group();
  const t = new THREE.Mesh(S.tail, S.tailMat), h = new THREE.Mesh(S.head, S.headMat);
  t.renderOrder = h.renderOrder = 3; t.frustumCulled = h.frustumCulled = false;
  g.add(t, h);
  return g;
}

// 一つの戦の中の数（rt ごと）
const STATE = new WeakMap();
function stateOf(rt) {
  let s = STATE.get(rt);
  if (!s) STATE.set(rt, s = { pool: [], flying: [], live: 0, ticking: false, volleys: [] });
  return s;
}

function tick(rt) {
  const st = stateOf(rt);
  if (rt.over || rt.ended) { st.ticking = false; return; }
  const now = rt.t ?? 0, dt = Math.min(0.1, Math.max(0, now - (st.last ?? now))); st.last = now;
  // 飛ぶ火矢
  for (let i = st.flying.length - 1; i >= 0; i--) {
    const a = st.flying[i];
    a.t += dt;
    if (a.t < 0) { a.mesh.visible = false; continue; }
    if (!a.mesh.parent) { rt.scene.add(a.mesh); if (a.t < 0.2) rt.army?.play?.('string', a.p0, 0.5); }
    a.mesh.visible = true;
    const s = Math.min(1, a.t / a.T);
    const x = a.p0.x + (a.p1.x - a.p0.x) * s, z = a.p0.z + (a.p1.z - a.p0.z) * s;
    const y = a.p0.y + (a.p1.y - a.p0.y) * s + 4 * a.peak * s * (1 - s);
    // 向き：弧の傾き（微分）の方へ
    const dy = (a.p1.y - a.p0.y) + 4 * a.peak * (1 - 2 * s);
    a.mesh.position.set(x, y, z);
    a.look.set(x + (a.p1.x - a.p0.x), y + dy, z + (a.p1.z - a.p0.z));
    a.mesh.lookAt(a.look);
    if (s >= 1) {
      st.flying.splice(i, 1);
      rt.scene.remove(a.mesh);
      if (st.pool.length < POOL_MAX) st.pool.push(a.mesh);
      land(rt, a.v, a.target);
    }
  }
  // 燃える所：大きくなり、煙が立ち、燃え移る
  for (const v of st.volleys) {
    if (v.stopped) continue;
    for (const sp of v.spots) grow(rt, v, sp, now);
  }
  if (st.flying.length || st.volleys.some((v) => !v.stopped && v.spots.some((sp) => !sp.done))) rt.after(0, () => tick(rt), true, true);
  else st.ticking = false;
}
function ensureTick(rt) {
  const st = stateOf(rt);
  if (st.ticking) return;
  st.ticking = true; st.last = rt.t ?? 0;
  rt.after(0, () => tick(rt), true, true);
}

function ignite(rt, v, p, gen) {
  const st = stateOf(rt), W = rt.world;
  if (v.stopped || v.spots.length >= v.max || st.live >= LIVE_MAX || !W?.addFire) return null;
  // 同じ所に二つ重ねない
  for (const sp of v.spots) if ((sp.x - p.x) ** 2 + (sp.z - p.z) ** 2 < 2.2 * 2.2) return sp;
  const h = p.h || 0.2, s0 = 0.35;
  let f = null;
  try { f = W.addFire(p.x, p.z, { size: s0, h, smoke: false }); } catch (e) { console.warn(e); }
  if (!f) return null;
  st.live++;
  const sp = { x: p.x, z: p.z, h, f, s0, sT: v.size * (gen ? 0.8 + Math.random() * 0.25 : 1), t0: rt.t ?? 0, gen, spreadLeft: gen < 2 ? v.spread : 0, nextSpread: 0, smoke: null, done: false };
  sp.y0 = f.base - s0 * 0.35;
  v.spots.push(sp);
  v.onLand?.(sp);
  return sp;
}
function land(rt, v, target) {
  if (v.stopped) return;
  ignite(rt, v, target, 0);
  rt.army?.play?.('knock', target, 0.3);
}
function grow(rt, v, sp, now) {
  if (sp.done) return;
  const k = Math.min(1, Math.max(0, (now - sp.t0) / v.grow));
  const size = sp.s0 + (sp.sT - sp.s0) * (k * (2 - k));
  const f = sp.f;
  if (f && Math.abs(f.size - size) > 0.01) {
    f.size = size; f.base = sp.y0 + size * 0.35;
    f.flame.scale.set(size * 0.95, size * 1.3, 1); f.inner.scale.set(size * 0.6, size * 0.85, 1);
    f.flame.position.y = f.base; f.inner.position.y = f.base - size * 0.08;
    f.big = size >= 2;
  }
  // 火が育ったら黒い煙の柱
  if (!sp.smoke && k > 0.5 && rt.world.addSmokeColumn) {
    try { sp.smoke = rt.world.addSmokeColumn(sp.x, sp.y0 + sp.sT, sp.z, { size: Math.min(3, sp.sT * 0.9), black: true }); } catch (e) { sp.smoke = 1; }
  }
  if (k < 1) return;
  // 燃え移る：育ち切ってから数秒ごとに、近くの燃える物へ
  if (sp.spreadLeft > 0) {
    if (!sp.nextSpread) sp.nextSpread = now + 3 + Math.random() * 4;
    if (now >= sp.nextSpread) {
      sp.spreadLeft--; sp.nextSpread = now + 4 + Math.random() * 4;
      const p = spreadPoint(v, sp);
      if (p) ignite(rt, v, p, sp.gen + 1);
    }
    return;
  }
  sp.done = true;
}
function spreadPoint(v, sp) {
  if (v.spreadTo) {
    let best = null, bd = 12 * 12;
    for (const q of v.spreadTo) {
      if (v.spots.some((o) => (o.x - q.x) ** 2 + (o.z - q.z) ** 2 < 2.2 * 2.2)) continue;
      const d = (q.x - sp.x) ** 2 + (q.z - sp.z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  const a = Math.random() * Math.PI * 2, r = 2.6 + Math.random() * 2.2;
  return { x: sp.x + Math.sin(a) * r, z: sp.z + Math.cos(a) * r, h: sp.h };
}

export function fireVolley(rt, o = {}) {
  const st = stateOf(rt), W = rt.world;
  const from = [].concat(o.from || []), at = [].concat(o.at || []);
  const v = { spots: [], size: o.size ?? 1.6, max: o.max ?? 8, spread: o.spread ?? 2, spreadTo: o.spreadTo || null, grow: o.grow ?? 6, onLand: o.onLand, stopped: false };
  st.volleys.push(v);
  v.stop = () => {
    v.stopped = true;
    for (const sp of v.spots) {
      if (sp.f) { rt.world.removeFire?.(sp.f); st.live--; }
      if (sp.smoke && sp.smoke !== 1) rt.world.removeSmokeColumn?.(sp.smoke);
    }
    v.spots.length = 0;
  };
  if (!from.length || !at.length || !W) return v;
  const n = Math.max(1, o.n ?? at.length * 3), over = o.over ?? 3, delay = o.delay ?? 0;
  for (let i = 0; i < n; i++) {
    const f0 = from[i % from.length], tg = at[i % at.length];
    const jx = (Math.random() - 0.5) * (o.fromSpread ?? 4), jz = (Math.random() - 0.5) * (o.fromSpread ?? 4);
    const p0 = new THREE.Vector3(f0.x + jx, W.heightAt(f0.x + jx, f0.z + jz) + (f0.h ?? 0) + 1.6, f0.z + jz);
    // 一本目は的の真ん中へ。後の矢は少し散る
    const sc = i < at.length ? 0 : (o.aimSpread ?? 1.6);
    const tx = tg.x + (Math.random() - 0.5) * sc, tz = tg.z + (Math.random() - 0.5) * sc;
    const p1 = new THREE.Vector3(tx, W.heightAt(tx, tz) + (tg.h || 0.2), tz);
    const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const mesh = st.pool.pop() || makeStreak();
    st.flying.push({ v, mesh, p0, p1, look: new THREE.Vector3(), target: { x: tg.x, z: tg.z, h: tg.h }, T: Math.max(1.1, d / 24), peak: Math.max(3, d * 0.22), t: -(delay + (i / n) * over + Math.random() * 0.3) });
  }
  ensureTick(rt);
  return v;
}
