// castle_fall.js … 落城の炎上と、火に近づくと火傷
// 城が落ちた時、敵方の櫓・天守・御殿・塀・門と曲輪の長屋・蔵（castle_bldg.js の burnSpots）を、主人公に近い所から順に燃え広げる。
// 一棟ずつ：炎・黒煙・火の粉（world_fire.js の addBlaze）→ 軒の梁が赤く光る → 屋根が崩れ落ちる（傾いて沈む・土埃と火の粉）
// → 焼け残った柱と落ちた梁が熾火のように赤く光り、だんだん炭の色へ冷める → 焼け跡。
// 燃えている所（どの戦の addBlaze も、army.burning も）へ近づくと主人公は少しずつ傷を負い、画面の端が赤く熱を帯び、咳が出る。
// 兵は落城の火と焼き討ちの火を避けて外へ動く。字は出さない。
// 使い方：battle.js の finish で castleFallStart(this)、update で castleFallTick(this, dt)。
import * as THREE from 'three';

const WOOD = /櫓|天守|御殿|屋敷|館|塀|門|殿|堂|蔵|小屋/;
const MAX_BLAZE = 6;       // 同時に燃やす建物（iPhone の重さのため）
const SPREAD_GAP = 1.1;    // 次の建物へ燃え移る秒
const HEAT_R = 3.2;        // この距離内で熱い
const BURN_PER_SEC = 3.2;  // 主人公の傷（秒あたり）
const FALL_SEC = 2.6;      // 屋根が崩れ落ちるのにかかる秒
const BEAMS = 120;         // 光る梁の数の上限（一つの InstancedMesh）

function pointOf(s) { return s.seg ? { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2, len: Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) } : { x: s.x, z: s.z, len: (s.r || 3) * 2 }; }

// 光る梁：箱一つの形を使い回し、色で「赤く光る → 炭」を表す（材質は一つ・毎コマ new しない）
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const HOT = new THREE.Color(0xff5a14), WARM = new THREE.Color(0x9a2a08), COAL = new THREE.Color(0x15110e);
function beamsOf(rt) {
  const C = rt._cf;
  if (C.beams) return C.beams;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, BEAMS);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.setColorAt(0, COAL);
  rt.scene.add(mesh);
  return (C.beams = { mesh, list: [] });
}
// 一本の梁を置く（中心・長さ・太さ・向き）。返す番号で色を替える
function addBeam(rt, x, y, z, len, th, ry, rx, rz) {
  const B = beamsOf(rt);
  if (B.mesh.count >= BEAMS) return -1;
  const i = B.mesh.count++;
  _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); _s.set(th, th, len);
  B.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  B.mesh.setColorAt(i, HOT);
  B.mesh.instanceMatrix.needsUpdate = true; B.mesh.instanceColor.needsUpdate = true;
  return i;
}

// 建物の形を、地面の真ん中を軸に傾けて沈める（崩れる屋根）。BatchedPart（城の束の一つ）にも普通の Group にも効く
function sinkObj(o, k, piv, axis) {
  if (!o || !o.matrix) return;
  if (!o._cfBase) {
    if (!o.isBatchedPart && o.updateMatrix) o.updateMatrix();
    o._cfBase = new THREE.Matrix4().copy(o.matrix);
    if (!o.isBatchedPart) o.matrixAutoUpdate = false;
  }
  const e = k * k;
  _q.setFromAxisAngle(axis, 0.22 * e); _s.set(1 + 0.08 * e, Math.max(0.12, 1 - 0.78 * e), 1 + 0.08 * e); _p.set(0, 0, 0);
  _m.compose(_p, _q, _s);
  const T = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z), Ti = new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z);
  const M = T.multiply(_m).multiply(Ti).multiply(o._cfBase);
  o.matrix.copy(M);
  if (!o.isBatchedPart) o.matrixWorldNeedsUpdate = true;
}

export function castleFallStart(rt) {
  if (rt._cf?.queue?.length || rt._cf?.started || rt.def.dojo || rt.def.town) return;
  const A = rt.army, W = rt.world, pp = rt.player.u.pos;
  const foe = rt.tracker.main === true ? 1 : null;   // 勝った戦だけ、敵の城が燃え落ちる
  if (foe == null) return;
  const list = (A.structs || []).filter((s) => s.team === foe && s.alive !== false && !s.fireProof && !s.noTarget && WOOD.test(s.name || '') && !(s.burn > 2))
    .map((s) => ({ s, p: pointOf(s), obj: s.mesh, name: s.name })).filter((o) => Number.isFinite(o.p.x));
  for (const b of W.burnSpots || []) list.push({ s: null, p: { x: b.x, z: b.z, len: Math.max(b.w, b.d), w: b.w, d: b.d, y: b.y, h: b.h, rot: b.rot }, obj: b.part, name: b.name });
  list.sort((a, b) => Math.hypot(a.p.x - pp.x, a.p.z - pp.z) - Math.hypot(b.p.x - pp.x, b.p.z - pp.z));
  if (!list.length) return;
  const C = rt._cf || (rt._cf = { blazes: [], t: 0, heat: 0, coughT: 0, scanT: 0 });
  Object.assign(C, { queue: list.slice(0, 24), nextAt: C.t + 0.3, started: true, n: 0, falls: [] });
}

function igniteNext(rt, C) {
  const A = rt.army, W = rt.world;
  const { s, p, obj, name } = C.queue.shift();
  const w = p.w || Math.min(14, Math.max(4, p.len)), d = p.d || (s && s.seg ? 2.5 : w);
  const h = p.h || (/天守/.test(name) ? 9 : /櫓/.test(name) ? 6 : /塀|門/.test(name) ? 2.2 : 4);
  const rot = p.rot ?? (s && s.seg ? Math.atan2(s.seg[3] - s.seg[1], s.seg[2] - s.seg[0]) : 0);
  const b = W.addBlaze(p.x, p.z, { w, d, h, rot, size: h > 5 ? 3.4 : undefined });
  const y = p.y ?? W.heightAt(p.x, p.z);
  // 近い棟ほど早く崩れる（戦の終わりの数秒にも、一棟目が落ちるのが見える）。塀は崩れず燃え尽きる
  const wall = /塀/.test(name) || (s && s.seg && !/門/.test(name));
  const fallAt = wall ? Infinity : 3.2 + C.n * 1.6 + Math.random() * 2;
  C.n++;
  C.blazes.push({ b, x: p.x, z: p.z, y, w, d, h, rot, r: Math.max(HEAT_R, Math.max(w, d) * 0.5 + 1.5), t: 0, life: Number.isFinite(fallAt) ? Math.max(45 + Math.random() * 20, fallAt + 25) : 45 + Math.random() * 20, s, obj, fallAt, eaves: null, own: true });
  // 焦げ色は army の作り（材質を少しずつ黒く）に任せる。束の部品（材質を持たない）は形だけ崩す
  if (s && obj && !obj.isBatchedPart) { try { s.burn = Math.max(s.burn || 0, 2); A.igniteStruct && A.igniteStruct(s, { x: p.x, z: p.z }); } catch (e) { /* 既存の燃え方に任せる */ } }
  C.nextAt = C.t + SPREAD_GAP * (0.7 + Math.random() * 0.8);
}

// 軒の梁：燃え始めて少しすると、長い辺の軒が赤く光る
function eaveBeams(rt, k) {
  const ca = Math.cos(k.rot), sa = Math.sin(k.rot), long = k.w >= k.d, L = (long ? k.w : k.d) * 0.92, off = (long ? k.d : k.w) * 0.5;
  const yy = k.y + Math.max(1.6, k.h * 0.55), ry = long ? k.rot + Math.PI / 2 : k.rot;
  const nx = long ? sa : ca, nz = long ? ca : -sa;
  k.eaves = [addBeam(rt, k.x + nx * off, yy, k.z + nz * off, L, 0.22, ry, 0, 0), addBeam(rt, k.x - nx * off, yy, k.z - nz * off, L, 0.22, ry, 0, 0)];
}
// 崩れた後：焼け残った柱が四本（少し傾く）と、斜めに落ちた梁が二本
function ruinBeams(rt, k) {
  const ca = Math.cos(k.rot), sa = Math.sin(k.rot), hw = k.w * 0.42, hd = k.d * 0.42, ph = Math.max(1.2, k.h * 0.4);
  const out = [];
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
    const x = k.x + lx * ca + lz * sa, z = k.z - lx * sa + lz * ca, hh = ph * (0.55 + Math.random() * 0.45);
    out.push(addBeam(rt, x, k.y + hh / 2, z, hh, 0.26, k.rot, Math.PI / 2 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
  }
  const L = Math.max(k.w, k.d) * 0.8, ry = k.w >= k.d ? k.rot + Math.PI / 2 : k.rot;
  out.push(addBeam(rt, k.x, k.y + ph * 0.45, k.z, L, 0.24, ry, 0.35, 0));
  out.push(addBeam(rt, k.x + sa * hd * 0.4, k.y + ph * 0.3, k.z + ca * hd * 0.4, L * 0.8, 0.22, ry + 0.25, -0.28, 0));
  return out;
}

function tickBlazes(rt, C, dt, hot) {
  const W = rt.world, A = rt.army;
  C.t += dt;
  while (C.queue && C.queue.length && C.t >= C.nextAt && C.blazes.length < MAX_BLAZE) igniteNext(rt, C);
  const B = C.beams;
  let colorDirty = false;
  for (let i = C.blazes.length - 1; i >= 0; i--) {
    const k = C.blazes[i]; k.t += dt;
    if (!k.eaves && k.t > 1.2 && Number.isFinite(k.fallAt)) eaveBeams(rt, k);
    // 屋根が崩れ落ちる：傾いて沈み、土埃と火の粉が吹き上がる
    if (k.t >= k.fallAt && !k.fell) {
      k.fell = true; k.fallT = 0;
      k.axis = new THREE.Vector3(Math.cos(k.rot + (Math.random() < 0.5 ? 0 : Math.PI)), 0, -Math.sin(k.rot));
      if (k.s && k.s.alive !== false) { k.s.alive = false; k.s.hp = 0; }
      try { A.burst && A.burst(k.x, k.y + 0.5, k.z, 14, 'dust'); A.play && A.play('wood', { x: k.x, z: k.z }, 1); } catch (e) { /* 音と埃は無くてもよい */ }
      if (k.b.fires[0]) k.b.fires[0].big = true;   // 崩れる時に火の粉がぱっと上がる
    }
    if (k.fell && k.fallT < FALL_SEC) {
      k.fallT = Math.min(FALL_SEC, k.fallT + dt);
      sinkObj(k.obj, k.fallT / FALL_SEC, { x: k.x, y: k.y, z: k.z }, k.axis);
      if (k.fallT >= FALL_SEC) { k.ruin = ruinBeams(rt, k); if (k.eaves) { for (const j of k.eaves) if (j >= 0) { B.mesh.setColorAt(j, COAL); } k.eaves = []; colorDirty = true; } }
    }
    // 梁の色：燃える間は赤く揺らめき、崩れた後は熾火から炭へ冷める
    if (B) {
      const glow = k.ruin ? Math.max(0, 1 - (k.t - k.fallAt - FALL_SEC) / 30) : Math.min(1, (k.t - 1.2) / 3);
      const flick = 0.8 + 0.2 * Math.sin(C.t * 9 + i * 1.7) * Math.sin(C.t * 3.1 + i);
      _c.copy(COAL).lerp(WARM, Math.min(1, glow * 1.6)).lerp(HOT, Math.max(0, glow * 1.4 - 0.4) * flick);
      for (const j of k.ruin || k.eaves || []) if (j >= 0) { B.mesh.setColorAt(j, _c); colorDirty = true; }
    }
    if (k.t > k.life) {   // 燃え尽きる：火を消して焼け跡を残す（焼け残りの柱は炭の色で残る）
      k.b.stop(); W.addScorch && W.addScorch(k.x, k.z, Math.max(k.w, k.d) * 0.9, Math.min(k.w, k.d) * 0.9, -k.rot);
      C.blazes.splice(i, 1);
      if (C.queue && C.queue.length) C.nextAt = Math.min(C.nextAt, C.t + 0.2);
    }
  }
  if (colorDirty) B.mesh.instanceColor.needsUpdate = true;
}

// 建物の床の形（向きのある四角）までの距離。中なら 0
function rectDist(px, pz, b) {
  const ca = Math.cos(b.rot || 0), sa = Math.sin(b.rot || 0), dx = px - b.x, dz = pz - b.z;
  const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
  return Math.hypot(Math.max(0, Math.abs(lx) - b.w / 2), Math.max(0, Math.abs(lz) - b.d / 2));
}

export function castleFallTick(rt, dt) {
  const A = rt.army, W = rt.world, u = rt.player?.u;
  let C = rt._cf;
  if (C && C.started) tickBlazes(rt, C, dt, null);
  // 燃える所の一覧：落城の炎・どの戦の炎上（addBlaze）も・火矢などで燃えている部品
  const wb = W.blazes, ab = A.burning;
  if (!(wb && wb.length) && !(ab && ab.length)) { if (C && C.heat) { C.heat = 0; const v = document.getElementById('vignette'); v && v.classList.remove('burn'); } return; }
  C = C || (rt._cf = { blazes: [], t: 0, heat: 0, coughT: 0, scanT: 0 });
  const vig = document.getElementById('vignette');
  let heat = 0, own = false;
  if (u && u.alive) {
    // 主人公：熱の中では少しずつ傷を負う。近いほど強く、画面の端が赤く熱を帯び、咳が出る
    for (const b of wb || []) {
      const d = rectDist(u.pos.x, u.pos.z, b), hv = d < 1 ? 1 : Math.max(0, 1 - (d - 1) / 3);
      if (hv > heat) { heat = hv; own = C.blazes.some((k) => k.b.spot === b); }
    }
    for (const s of ab || []) if (s.alive !== false && s.fireF) { const p = pointOf(s); const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z) - HEAT_R * 0.5; if (d < HEAT_R) { const hv = 1 - Math.max(0, d) / HEAT_R; if (hv > heat) { heat = hv; own = true; } } }
  }
  C.heat += (heat - C.heat) * Math.min(1, dt * 3);
  if (vig) { vig.classList.toggle('burn', C.heat > 0.12); vig.style.setProperty('--burn', C.heat.toFixed(2)); }
  if (heat > 0.05) {
    // 戦の筋の炎上（本能寺の御殿など、火の中で戦う所）では傷を軽く。決着の後（invuln）は熱と咳だけ
    if (!u.invuln && !(rt.t < (rt.def.openingSafe || 0))) { u.hp = Math.max(Math.min(u.hp, (rt.def.burnFloor || 0) * u.maxHp), u.hp - BURN_PER_SEC * heat * (own ? 1 : 0.4) * dt);   /* def.burnFloor：その戦だけ火傷では命のこの割合より下げない（本能寺 11/1） */ rt.player.inCombatT = Math.max(rt.player.inCombatT || 0, 1); }   // 火傷は受けも構えも効かない（倒れは戦の側が hp を見る）
    C.coughT -= dt;
    if (C.coughT <= 0) { C.coughT = 1.6 + Math.random(); import('./audio.js').then((m) => m.sfx('cough', 0.5)); }
  }
  // 兵：四回/秒、落城の火と燃える部品の近くの兵を外へ押し出す（避ける）。筋の炎上の中で戦う兵は動かさない
  C.scanT -= dt;
  if (C.scanT > 0) return;
  C.scanT = 0.25;
  const hot = [];
  for (const k of C.blazes) hot.push({ x: k.x, z: k.z, r: k.r });
  for (const s of ab || []) if (s.alive !== false && s.fireF) { const p = pointOf(s); hot.push({ x: p.x, z: p.z, r: HEAT_R }); }
  if (!hot.length) return;
  for (const o of A.units) {
    if (!o.alive || o.isStruct || o.rider || o.isPlayer) continue;
    for (const k of hot) {
      const dx = o.pos.x - k.x, dz = o.pos.z - k.z, d = Math.hypot(dx, dz);
      if (d < k.r && d > 0.01) { const push = Math.min(1.2, (k.r - d) * 0.5); o.pos.x += dx / d * push; o.pos.z += dz / d * push; break; }
    }
  }
}
