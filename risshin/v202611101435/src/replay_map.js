// 戦の振り返りの地図（kaito 11/3）：勝った戦の結果の前に、真上から見た点の地図で戦の流れを十秒ほど早回しで見せる。
//   戦の間は二秒ごとに両軍の備の位置と人数だけを小さな数の並びで覚える（replayTick）。終わりに開戦の地図（intro_map.js）と
//   同じ墨色の地・藍と朱の点・矢印で描く。崩れた備は薄れて消え、自分は白い矢じりで動く。字は戦の名前と両軍の人数だけ。触る・キーで飛ばせる。
//   下地は始めに一度だけ焼き、毎コマは点と矢印を描くだけ（毎コマ new しない）。
import { reduceMotion } from './settings.js';
import { bakeGround, mapColors } from './intro_map.js';

const EVERY = 2, MAX = 300, PLAY = 8.4, HOLD = 1.2, FADE = 0.5;
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",serif';
const REC = 6;   // 一つの備：id・側・x・z・人数・広がり

// 戦の間に呼ぶ（battle.js の毎コマ）。二秒ごとに一度だけ拾う
export function replayTick(rt) {
  if (rt.def.town || rt.def.dojo || rt.def.duel || rt.def.mapCastle) return;
  const me = rt.player?.u; if (!me) return;
  let log = rt.replayLog;
  if (!log) {
    log = rt.replayLog = { team: me.team, ids: new WeakMap(), next: 1, at: -EVERY, samples: [], force: null };
    try { const f = rt.def.force?.(rt); if (f && Number.isFinite(+f.a) && Number.isFinite(+f.b)) log.force = me.team === 0 ? [+f.a, +f.b] : [+f.b, +f.a]; } catch (e) { log.force = null; }
  }
  if (rt.t - log.at < EVERY) return;
  log.at = rt.t;
  const out = [], team = log.team, W = rt.world, sides = rt.def.sides || {};
  const id = (o) => { let v = log.ids.get(o); if (!v) { v = log.next++; log.ids.set(o, v); } return v; };
  const add = (o, side, x, z, n, r) => { if (Number.isFinite(x) && Number.isFinite(z) && n > 0) out.push(id(o), side, x, z, n, r); };
  for (const g of rt.army?.groups || []) {
    if (!g.units || g.hidden || g.hideFlags || g.routed) continue;
    let n = 0, sx = 0, sz = 0, sq = 0;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer || u.gone || u.fleeing || u.type === 'dummy' || u.type === 'porter') continue;
      n++; sx += u.pos.x; sz += u.pos.z; sq += u.pos.x * u.pos.x + u.pos.z * u.pos.z;
    }
    if (n < 2) continue;
    const cx = sx / n, cz = sz / n;
    add(g, g.team === team ? 0 : 1, cx, cz, n, Math.max(2, Math.sqrt(Math.max(0, sq / n - cx * cx - cz * cz)) * 1.2));
  }
  for (const A of W?.armies || []) {
    if (!A.mesh || A.rout || A.hidden) continue;
    const n = (A.n || 0) - (A.took || 0); if (n < 6) continue;
    A.mesh.updateMatrixWorld();
    const e = A.mesh.matrixWorld.elements, ox = (A.cx || 0) + (A.off?.x || 0), oz = (A.cz || 0) + (A.off?.z || 0);
    const t = A.team !== undefined ? A.team : sides.b && A.mon === sides.b.mon ? 1 : sides.a && A.mon === sides.a.mon ? 0 : 1;
    add(A, t === team ? 0 : 1, e[0] * ox + e[8] * oz + e[12], e[2] * ox + e[10] * oz + e[14], n, Math.sqrt(n * 1.5 * 3) / 2);
  }
  for (const Cl of W?.clashes || []) {
    if (!Cl.frontAt || !Cl.nb) continue;
    for (const Sd of [Cl.A, Cl.B]) {
      if (!Sd || !Sd.P || Sd.P.hidden || Sd.routed || !Sd.alive) continue;
      const t = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1;
      const D = ((Sd.rows || 4) * 1.15 + (Sd.host ? 12 : 3)) * Math.max(0.3, Sd.alive / (Sd.n0 || Sd.alive)), g0 = (Cl.o && Cl.o.gap || 3.4) / 2;
      let sx = 0, sz = 0, k = 0;
      for (let j = 0; j < 6; j++) { const p = Cl.frontAt(Math.floor((j + 0.5) * Cl.nb / 6), -Sd.sgn * (g0 + D / 2)); if (p) { sx += p.x; sz += p.z; k++; } }
      if (k) add(Sd, t === team ? 0 : 1, sx / k, sz / k, Sd.alive, Math.max(D / 2, Cl.nb * 0.6));
    }
  }
  log.samples.push({ t: rt.t, mx: me.pos.x, mz: me.pos.z, b: Float32Array.from(out) });
  // 長い戦は一つおきに間引く（覚える量を一定に）
  if (log.samples.length > MAX) log.samples = log.samples.filter((s, i) => i % 2 === 0 || i === log.samples.length - 1);
}

export function replayMap(rt, title, done) {
  const log = rt.replayLog;
  if (!log || log.samples.length < 4 || reduceMotion()) return null;
  if (/HeadlessChrome/.test(navigator.userAgent) && !window.__replayMap) return null;
  const SM = log.samples, N = SM.length;
  // 次の場面で同じ備がどこにいるか（無ければ -1：崩れて消えた）と、前の場面に無かった備（新しく出た）
  const nextIx = [], newIn = [];
  for (let k = 0; k < N; k++) {
    const a = SM[k].b, b = k + 1 < N ? SM[k + 1].b : null, m = new Map(), ix = new Int32Array(a.length / REC).fill(-1);
    if (b) for (let i = 0; i < b.length; i += REC) m.set(b[i], i);
    for (let i = 0, j = 0; i < a.length; i += REC, j++) { const w = m.get(a[i]); if (w !== undefined) { ix[j] = w; m.delete(a[i]); } }
    nextIx.push(ix); newIn.push(b ? Int32Array.from(m.values()) : new Int32Array(0));
  }
  // 画面の上＝敵の方（始めの両軍の重心から）
  let ax = 0, az = 0, an = 0, ex = 0, ez = 0, en = 0;
  { const a = SM[0].b; for (let i = 0; i < a.length; i += REC) { const n = a[i + 4]; if (a[i + 1]) { ex += a[i + 2] * n; ez += a[i + 3] * n; en += n; } else { ax += a[i + 2] * n; az += a[i + 3] * n; an += n; } } }
  let fx = 0, fz = -1;
  if (an && en) { const dx = ex / en - ax / an, dz = ez / en - az / an, l = Math.hypot(dx, dz); if (l > 1) { fx = dx / l; fz = dz / l; } }
  const rx = -fz, rz = fx;
  // 人数の物差し：その側が一番多かった時を総勢とする（後から出る控えで総勢を超えない）
  const sum0 = [0, 0];
  for (const s of SM) { const t = [0, 0]; for (let i = 0; i < s.b.length; i += REC) t[s.b[i + 1]] += s.b[i + 4]; sum0[0] = Math.max(sum0[0], t[0]); sum0[1] = Math.max(sum0[1], t[1]); }
  const { COL, DOT } = mapColors();

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none;background:#0c0d10;opacity:0';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const bake = document.createElement('canvas'), bg = bake.getContext('2d');
  let Wd = 0, Ht = 0, dpr = 1, sc = 1, ox = 0, oy = 0, mx = 0, mz = 0;
  const toS = (x, z, out) => { const dx = x - mx, dz = z - mz; out[0] = ox + (dx * rx + dz * rz) * sc; out[1] = oy - (dx * fx + dz * fz) * sc; return out; };
  const q = [0, 0], q2 = [0, 0];
  function frame() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wd = window.innerWidth; Ht = window.innerHeight;
    cv.width = Math.round(Wd * dpr); cv.height = Math.round(Ht * dpr);
    // 範囲：備の中心の重みつきの 3〜97％（遠くに置いた控えや戦場の外の物に引っぱられない）と、自分の足取り
    const us = [], vs = [], half = rt.world?.half || 200;
    for (const s of SM) for (let i = 0; i < s.b.length; i += REC) {
      const x = s.b[i + 2], z = s.b[i + 3]; if (Math.abs(x) > half * 1.05 || Math.abs(z) > half * 1.05) continue;
      us.push([x * rx + z * rz, s.b[i + 4]]); vs.push([x * fx + z * fz, s.b[i + 4]]);
    }
    const cut = (arr, p) => { arr.sort((m, n) => m[0] - n[0]); let tot = 0; for (const e of arr) tot += e[1]; let acc = 0; for (const e of arr) { acc += e[1]; if (acc >= tot * p) return e[0]; } return arr.length ? arr[arr.length - 1][0] : 0; };
    let a0 = us.length ? cut(us, 0.03) - 20 : Infinity, a1 = us.length ? cut(us, 0.97) + 20 : -Infinity, b0 = vs.length ? cut(vs, 0.03) - 20 : Infinity, b1 = vs.length ? cut(vs, 0.97) + 20 : -Infinity;
    for (const s of SM) { const u = s.mx * rx + s.mz * rz, v = s.mx * fx + s.mz * fz; a0 = Math.min(a0, u - 8); a1 = Math.max(a1, u + 8); b0 = Math.min(b0, v - 8); b1 = Math.max(b1, v + 8); }
    const su = Math.max(70, a1 - a0), sv = Math.max(70, b1 - b0);
    const top = 78, side = 22, bottom = 22;
    sc = Math.min(12, (Wd - side * 2) / (su * 1.06), (Ht - top - bottom) / (sv * 1.06));
    const cu = (a0 + a1) / 2, cvv = (b0 + b1) / 2;
    mx = cu * rx + cvv * fx; mz = cu * rz + cvv * fz;
    ox = Wd / 2; oy = top + (Ht - top - bottom) / 2;
    bake.width = cv.width; bake.height = cv.height;
    bakeGround(bg, rt, { Wd, Ht, dpr, sc, ox, oy, mx, mz, fx, fz, rx, rz });
  }
  frame();

  // 点の散らばり（単位円の中の決まった 48 点。備ごとに回す）
  const OFF = new Float32Array(96);
  for (let i = 0; i < 48; i++) { const r = Math.sqrt((i + 0.5) / 48), a = i * 2.39996; OFF[i * 2] = Math.cos(a) * r; OFF[i * 2 + 1] = Math.sin(a) * r; }
  const fmt = (n) => `${Math.max(0, Math.round(n)).toLocaleString('ja-JP')}人`;
  const cur = [0, 0];
  function blob(side, idv, x, z, n, r, alpha) {
    if (n <= 0.5 || alpha <= 0.02) return;
    toS(x, z, q);
    const R = Math.max(3, r * sc), r0 = Math.max(1.5, Math.min(2.6, 0.9 * sc));
    g.globalAlpha = 0.16 * alpha; g.fillStyle = COL[side];
    g.beginPath(); g.arc(q[0], q[1], R + r0 * 3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = alpha; g.fillStyle = DOT[side];
    const c = Math.min(48, Math.max(4, Math.ceil(n / 2))), rot = idv * 2.1, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < c; i++) {
      const u = OFF[i * 2] * R, v = OFF[i * 2 + 1] * R, px = q[0] + u * cs - v * sn, py = q[1] + u * sn + v * cs;
      if (side) { g.beginPath(); g.moveTo(px, py - r0); g.lineTo(px + r0, py + r0 * 0.8); g.lineTo(px - r0, py + r0 * 0.8); g.closePath(); g.fill(); }
      else g.fillRect(px - r0 * 0.8, py - r0 * 0.8, r0 * 1.6, r0 * 1.6);
    }
  }
  function arrow(side, x, z, dx, dz, len, w, alpha) {
    toS(x, z, q);
    const L = len * sc; if (L < 6) return;
    const ang = Math.atan2(-(dx * fx + dz * fz), dx * rx + dz * rz), head = Math.min(L * 0.45, w * 2.2);
    g.save(); g.globalAlpha = alpha; g.translate(q[0], q[1]); g.rotate(ang);
    g.beginPath(); g.moveTo(0, -w * 0.32); g.lineTo(L - head, -w * 0.5); g.lineTo(L - head, -w); g.lineTo(L, 0);
    g.lineTo(L - head, w); g.lineTo(L - head, w * 0.5); g.lineTo(0, w * 0.32); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(8,8,10,.85)'; g.stroke();
    g.fillStyle = COL[side]; g.fill(); g.restore();
  }
  // 二つ先の場面の同じ備の位置（矢印の向き）。無ければ null
  function ahead(k, i) {
    let kk = k, ii = i;
    for (let s = 0; s < 2 && kk + 1 < N; s++) { const j = nextIx[kk][ii / REC]; if (j < 0) return null; ii = j; kk++; }
    return kk === k ? null : SM[kk].b.subarray(ii, ii + REC);
  }
  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    g.drawImage(bake, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(1, t / PLAY) * (N - 1), k = Math.min(N - 2, Math.floor(s)), f = s - k;
    const A = SM[k].b, B = SM[k + 1].b, ix = nextIx[k];
    cur[0] = cur[1] = 0;
    // 動きの矢印（大きい備だけ、二つ先へ向けて）
    for (let i = 0, j = 0; i < A.length; i += REC, j++) {
      if (A[i + 4] < 20) continue;
      const nx = ahead(k, i); if (!nx) continue;
      const dx = nx[2] - A[i + 2], dz = nx[3] - A[i + 3], d = Math.hypot(dx, dz);
      if (d < 5) continue;
      const w = ix[j] >= 0 ? 1 : 1 - f, cx = A[i + 2] + (ix[j] >= 0 ? (B[ix[j] + 2] - A[i + 2]) * f : 0), cz = A[i + 3] + (ix[j] >= 0 ? (B[ix[j] + 3] - A[i + 3]) * f : 0);
      const r = Math.min(A[i + 5], 24);
      arrow(A[i + 1], cx + dx / d * r, cz + dz / d * r, dx / d, dz / d, Math.min(40, 6 + d * 0.8), Math.max(4, Math.min(9, 3 + Math.sqrt(A[i + 4]) * 0.35)), 0.85 * w);
    }
    // 備：次の場面へ寄せる。次に居ない備は薄れて消える（崩れた所）
    for (let i = 0, j = 0; i < A.length; i += REC, j++) {
      const side = A[i + 1], o = ix[j];
      if (o >= 0) {
        const n = A[i + 4] + (B[o + 4] - A[i + 4]) * f;
        cur[side] += n;
        blob(side, A[i], A[i + 2] + (B[o + 2] - A[i + 2]) * f, A[i + 3] + (B[o + 3] - A[i + 3]) * f, n, A[i + 5] + (B[o + 5] - A[i + 5]) * f, 1);
      } else { cur[side] += A[i + 4] * (1 - f); blob(side, A[i], A[i + 2], A[i + 3], A[i + 4], A[i + 5] * (1 + f * 0.6), 1 - f); }
    }
    for (const o of newIn[k]) { cur[B[o + 1]] += B[o + 4] * f; blob(B[o + 1], B[o], B[o + 2], B[o + 3], B[o + 4], B[o + 5], f); }
    // 自分の足取り（薄い線）と白い矢じり
    const pa = SM[k], pb = SM[k + 1], px = pa.mx + (pb.mx - pa.mx) * f, pz = pa.mz + (pb.mz - pa.mz) * f;
    g.globalAlpha = 0.45; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= k; i++) { toS(SM[i].mx, SM[i].mz, q); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    toS(px, pz, q); g.lineTo(q[0], q[1]); g.stroke();
    g.globalAlpha = 1;
    toS(pa.mx, pa.mz, q2);
    let dirA = Math.atan2(q[0] - q2[0], -(q[1] - q2[1]));
    if (Math.hypot(q[0] - q2[0], q[1] - q2[1]) < 0.5) dirA = 0;
    g.save(); g.translate(q[0], q[1]); g.rotate(dirA);
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 6); g.lineTo(0, 2.5); g.lineTo(-7, 6); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = '#14120f'; g.stroke(); g.fillStyle = '#fff'; g.fill(); g.restore();
    // 戦の名前と両軍の人数（上の真ん中。味方は四角・敵は三角を添える）
    g.fillStyle = 'rgba(8,8,10,.62)'; g.fillRect(0, 0, Wd, 74);
    g.font = `700 20px ${MINCHO}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 4; g.strokeStyle = 'rgba(8,8,10,.9)'; g.strokeText(title, Wd / 2, 30);
    g.fillStyle = '#e8cf8e'; g.fillText(title, Wd / 2, 30);
    const fa = log.force ? log.force[0] * (sum0[0] ? cur[0] / sum0[0] : 1) : cur[0], fb = log.force ? log.force[1] * (sum0[1] ? cur[1] / sum0[1] : 1) : cur[1];
    const y = 60, text0 = fmt(fa), text1 = fmt(fb);
    g.font = `700 17px ${MINCHO}`;
    const wa = g.measureText(text0).width, gap = 34, xa = Wd / 2 - gap / 2 - wa, xb = Wd / 2 + gap / 2 + 18;
    g.fillStyle = COL[0]; g.fillRect(xa - 22, y - 14, 12, 12);
    g.fillStyle = COL[1]; g.beginPath(); g.moveTo(xb - 12, y - 15); g.lineTo(xb - 4, y - 2); g.lineTo(xb - 20, y - 2); g.closePath(); g.fill();
    g.textAlign = 'left'; g.fillStyle = '#f1e9d6'; g.fillText(text0, xa, y); g.fillText(text1, xb, y);
    g.strokeStyle = 'rgba(194,162,90,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(Wd / 2 - 8, y - 8); g.lineTo(Wd / 2 + 8, y - 8); g.stroke();
    // 時の進み：上の帯の下の細い金の線
    g.fillStyle = 'rgba(194,162,90,.75)'; g.fillRect(0, 73, Wd * Math.min(1, t / PLAY), 1.5);
  }

  let t = 0, closed = false;
  function dispose() {
    if (closed) return;
    closed = true; cv.remove();
    window.removeEventListener('pointerdown', tap, true); window.removeEventListener('resize', frame);
  }
  function finish() { dispose(); done(); }
  function jump() { if (!closed) finish(); }
  function tap(e) { e.preventDefault?.(); e.stopPropagation?.(); jump(); }
  window.addEventListener('pointerdown', tap, true);
  window.addEventListener('resize', frame);
  function update(dt) {
    if (closed) return;
    t += Math.min(dt, 0.1);
    if (t >= PLAY + HOLD + FADE) { finish(); return; }
    draw(t);
    cv.style.opacity = String(Math.min(1, t / 0.35, (PLAY + HOLD + FADE - t) / FADE));
  }
  update(0);
  window.__replayMapShown = { samples: N, blobs: SM[N - 1].b.length / REC };
  return { update, jump, dispose };
}
