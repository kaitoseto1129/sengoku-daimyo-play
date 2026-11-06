// 開戦の陣立ての地図（kaito 11/3）：真上から見た戦場に、両軍の備を色の点の塊、動きの向きを矢印、自分の行き先をピンで五秒ほど見せ、
//   自分の居場所へ寄りながら今のカメラへ降りる。合戦解説の動画（docs/yt_model_1102.md）と同じ墨色の地に藍と朱。
//   字は武将の名前と両軍の人数だけ。触る・キーで飛ばせる（ボタンは足さない）。地図は戦の定義（兵・遠景の大軍・地形・道・水）から作る。
//   地形と点は始めに一度だけ焼き、毎コマは焼いた絵と矢印・名前を描くだけ（毎コマ new しない）。
import * as THREE from 'three';
import { reduceMotion, S } from './settings.js';
import { missionTarget } from './mission_pin.js';

const HOLD = 8, DESCEND = 2.2, CAP = 900;   // 布陣図はゆっくり（kaito 11/3 AV17）。触る・キーで飛ばせる
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",serif';

// 決まった種の乱数（戦ごとに同じ散らばり）
function rng(seed) { let s = seed | 0 || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// 戦の今の姿から地図の中身を拾う（描かない確かめでも呼べる。three の物は作らない）
export function introLayout(rt) {
  const W = rt.world, me = rt.player?.u, team = me ? me.team : 0;
  const ally = (t) => t === team;
  const dots = [[], []], blobs = [], names = [];   // dots[0] 味方・[1] 敵（x, z の並び）
  const R = rng(rt.index * 131 + 17);
  const push = (side, x, z) => { if (Number.isFinite(x) && Number.isFinite(z) && dots[side].length < CAP * 2) dots[side].push(x, z); };
  // 本物の兵：隊ごと。伏兵（隠れた隊）は見せない
  for (const g of rt.army?.groups || []) {
    if (!g.units || g.hidden || g.hideFlags || g.routed) continue;
    let n = 0, sx = 0, sz = 0;
    const side = ally(g.team) ? 0 : 1;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer || u.gone || u.type === 'dummy' || u.type === 'porter') continue;
      push(side, u.pos.x, u.pos.z); n++; sx += u.pos.x; sz += u.pos.z;
    }
    if (n >= 3) blobs.push({ side, x: sx / n, z: sz / n, n });
  }
  // 遠景の大軍（軽い作り）：数から広がりを見積もり、点を散らす
  const sides = rt.def.sides || {};
  for (const A of W?.armies || []) {
    if (!A.mesh || A.rout || A.hidden) continue;
    const n = (A.n || 0) - (A.took || 0);
    if (n < 6) continue;
    A.mesh.updateMatrixWorld();
    const e = A.mesh.matrixWorld.elements, ox = (A.cx || 0) + (A.off?.x || 0), oz = (A.cz || 0) + (A.off?.z || 0);
    const x = e[0] * ox + e[8] * oz + e[12], z = e[2] * ox + e[10] * oz + e[14];
    const t = A.team !== undefined ? A.team : sides.b && A.mon === sides.b.mon ? 1 : sides.a && A.mon === sides.a.mon ? 0 : 1;
    const side = ally(t) ? 0 : 1;
    const wd = Math.sqrt(n * 1.5 * 3), dp = n * 1.5 / wd, F = A.facing || 0, fc = Math.cos(F), fs = Math.sin(F);
    const k = Math.min(260, Math.max(12, Math.round(n / 3)));
    for (let i = 0; i < k; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()), lx = Math.cos(a) * r * wd / 2, lz = Math.sin(a) * r * dp / 2;
      push(side, x + lx * fc + lz * fs, z - lx * fs + lz * fc);
    }
    blobs.push({ side, x, z, n });
  }
  // 軽い大軍の押し合い：前線の列から後ろへ、残った数の厚み
  for (const Cl of W?.clashes || []) {
    if (!Cl.frontAt || !Cl.nb) continue;
    for (const Sd of [Cl.A, Cl.B]) {
      if (!Sd || !Sd.P || Sd.P.hidden || Sd.routed || !Sd.alive) continue;
      const t = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1, side = ally(t) ? 0 : 1;
      const D = ((Sd.rows || 4) * 1.15 + (Sd.host ? 12 : 3)) * Math.max(0.3, Sd.alive / (Sd.n0 || Sd.alive)), g0 = (Cl.o && Cl.o.gap || 3.4) / 2;
      const k = Math.min(260, Math.max(12, Math.round(Sd.alive / 3)));
      let sx = 0, sz = 0;
      for (let i = 0; i < k; i++) {
        const p = Cl.frontAt(Math.floor(R() * Cl.nb), -Sd.sgn * (g0 + R() * D));
        if (p) { push(side, p.x, p.z); sx += p.x; sz += p.z; }
      }
      blobs.push({ side, x: sx / k, z: sz / k, n: Sd.alive });
    }
  }
  // 隊の駒（布陣図の駒の形。kaito 十三2）：塊ごとに一つ。向きは近い相手の塊へ
  const units = [];
  for (const b of blobs) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
    let fx = 0, fz = 0, bd = Infinity;
    for (const f of blobs) if (f.side !== b.side) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d < bd && d > 1) { bd = d; fx = (f.x - b.x) / d; fz = (f.z - b.z) / d; } }
    if (bd === Infinity) { fx = 0; fz = b.side ? -1 : 1; }
    units.push({ side: b.side, x: b.x, z: b.z, n: b.n, dx: fx, dz: fz });
  }
  // 同じ側の近い塊はまとめる（矢印を一つにする）
  const merged = [];
  for (const b of blobs.sort((p, q) => q.n - p.n)) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
    const m = merged.find((c) => c.side === b.side && Math.hypot(c.x - b.x, c.z - b.z) < 30 + Math.sqrt(c.n) * 1.2);
    if (m) { const n = m.n + b.n; m.x = (m.x * m.n + b.x * b.n) / n; m.z = (m.z * m.n + b.z * b.n) / n; m.n = n; } else merged.push({ ...b });
  }
  // 動きの向き：大きい塊から近い相手の塊へ（一つの側に四つまで）
  const arrows = [];
  for (const side of [0, 1]) {
    const mine = merged.filter((c) => c.side === side).slice(0, 4), foes = merged.filter((c) => c.side !== side);
    for (const c of mine) {
      let best = null, bd = Infinity;
      for (const f of foes) { const d = Math.hypot(f.x - c.x, f.z - c.z); if (d < bd) { bd = d; best = f; } }
      if (!best || bd < 6) continue;
      const dx = (best.x - c.x) / bd, dz = (best.z - c.z) / bd, r = Math.min(bd * 0.25, 6 + Math.sqrt(c.n) * 0.9);
      const L = Math.max(8, Math.min(bd * 0.45, 22 + Math.sqrt(c.n) * 2.2));
      arrows.push({ side, x: c.x + dx * r, z: c.z + dz * r, dx, dz, len: L, w: Math.min(1.6, 0.7 + Math.sqrt(c.n) / 40) });
    }
  }
  // 名前：両軍の総大将を先に、次に名のある武将（一つの側に三人まで）
  const seen = new Set(), count = [0, 0];
  const addName = (u) => {
    if (!u || !u.name || seen.has(u) || !u.alive || u.gone || u.isPlayer || u.group?.hidden) return;
    // 役の呼び名（組頭・城将・寺の指揮役など）は名前でないので出さない
    if (/(組頭|守将|城将|指揮役|使いの侍|陣代|大将|の将)$/.test(String(u.name))) return;
    const side = ally(u.team) ? 0 : 1;
    if (count[side] >= 3 || names.some((p) => p.name === u.name)) return;
    seen.add(u); count[side]++; names.push({ side, name: String(u.name).replace(/（.*?）/g, ''), x: u.pos.x, z: u.pos.z });
  };
  addName(rt.taisho?.a?.u); addName(rt.taisho?.b?.u);
  for (const u of rt.army?.units || []) if (u.name && (u.type === 'busho' || u.invuln || u.isTaisho)) addName(u);
  // 行き先のピン（任務の印と同じ所）
  let pin = null;
  const at = (v) => { try { v = typeof v === 'function' ? v() : v; v = v?.pos || v; return v && Number.isFinite(v.x) && Number.isFinite(v.z) ? { x: v.x, z: v.z } : null; } catch (e) { return null; } };
  pin = at(() => missionTarget(rt));
  // 任務の手引きは開戦の後に決まる戦が多い。その時は今立っている印、無ければ近い敵の塊へ
  for (const m of rt.markers || []) { if (pin) break; pin = at(m.pos ?? m.intelPos); }
  if (!pin && me) {
    let bd = Infinity;
    for (const c of merged) if (c.side === 1) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; pin = { x: c.x, z: c.z }; } }
  }
  // 両軍の人数（戦の定義の総勢。無ければ点の数）
  let force = null;
  try { const f = rt.def.force?.(rt); if (f && Number.isFinite(+f.a) && Number.isFinite(+f.b)) force = team === 0 ? [+f.a, +f.b] : [+f.b, +f.a]; } catch (e) { force = null; }
  return { me: me ? { x: me.pos.x, z: me.pos.z } : { x: 0, z: 0 }, dots, units, arrows, names, pin, force, half: W?.half || 200 };
}

// 布陣図の駒：正方形の左上と右上を切り欠いた形（kaito 十三2）。切り欠いた側を前（相手の方）へ向ける。g は原点が駒の真ん中
export function komaPath(g, r) {
  const c = r * 0.5;
  g.beginPath(); g.moveTo(-r + c, -r); g.lineTo(r - c, -r); g.lineTo(r, -r + c); g.lineTo(r, r); g.lineTo(-r, r); g.lineTo(-r, -r + c); g.closePath();
}
// 隊の駒を並べる。toS は地図の点へ写す関数。敵の駒は縁を太く、中に一本の横線（色だけに頼らない）
export function drawKoma(g, units, toS, COL, size) {
  const q = [0, 0], q2 = [0, 0];
  for (const u of units || []) {
    toS(u.x, u.z, q); toS(u.x + u.dx * 10, u.z + u.dz * 10, q2);
    const ang = Math.atan2(q2[0] - q[0], -(q2[1] - q[1]));
    const r = size * Math.max(1, Math.min(1.9, 0.7 + Math.sqrt(u.n) / 14));
    g.save(); g.translate(q[0], q[1]); g.rotate(ang);
    komaPath(g, r);
    g.fillStyle = COL[u.side]; g.fill();
    g.lineJoin = 'round'; g.lineWidth = u.side ? 2.6 : 1.8; g.strokeStyle = '#14120f'; g.stroke();
    if (u.side) { g.beginPath(); g.moveTo(-r * 0.55, r * 0.15); g.lineTo(r * 0.55, r * 0.15); g.lineWidth = 2; g.stroke(); }
    g.restore();
  }
}

// 地図の下地（墨色の陰影の地形・水・道・塀）を焼く。v は画面の大きさと地図の向き・縮尺（開戦の地図と戦の振り返りで同じ絵にする）
export function bakeGround(bg, rt, v) {
  const W = rt.world, { Wd, Ht, dpr, sc, ox, oy, mx, mz, fx, fz, rx, rz } = v;
  const q = [0, 0], q2 = [0, 0];
  const toS = (x, z, out) => { const dx = x - mx, dz = z - mz; out[0] = ox + (dx * rx + dz * rz) * sc; out[1] = oy - (dx * fx + dz * fz) * sc; return out; };
    const NX = Math.min(240, Math.round(Wd / 3)), NY = Math.max(2, Math.round(NX * Ht / Wd));
  const img = bg.createImageData(NX, NY), H = new Float32Array(NX * NY), half = W.half || 200;
  const wx = (i, j) => mx + rx * ((i + 0.5) * Wd / NX - ox) / sc + fx * (oy - (j + 0.5) * Ht / NY) / sc;
  const wz = (i, j) => mz + rz * ((i + 0.5) * Wd / NX - ox) / sc + fz * (oy - (j + 0.5) * Ht / NY) / sc;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = Math.max(-half, Math.min(half, wx(i, j))), z = Math.max(-half, Math.min(half, wz(i, j)));
    const h = W.heightAt(x, z) || 0; H[j * NX + i] = h; if (h < lo) lo = h; if (h > hi) hi = h;
  }
  const cell = Wd / NX / sc, span = Math.max(4, hi - lo);
  const ww = W.waterW, seg = ww ? Math.round(Math.sqrt(ww.length)) - 1 : 0, step = W.step || half * 2 / Math.max(1, seg);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, h = H[k];
    const hx = (H[j * NX + Math.min(NX - 1, i + 1)] - H[j * NX + Math.max(0, i - 1)]) / (2 * cell);
    const hy = (H[Math.min(NY - 1, j + 1) * NX + i] - H[Math.max(0, j - 1) * NX + i]) / (2 * cell);
    const shade = Math.max(0, Math.min(1, 0.62 + (-hx * 0.55 - hy * 0.55) * 1.4));
    const e = (h - lo) / span;
    let r = 30 + e * 26 + shade * 30, gg = 32 + e * 22 + shade * 28, b = 30 + e * 14 + shade * 22;
    const x = wx(i, j), z = wz(i, j);
    if (Math.abs(x) > half || Math.abs(z) > half) { r *= 0.45; gg *= 0.45; b *= 0.5; }
    else if (seg) {
      const ci = Math.max(0, Math.min(seg, Math.round((x + half) / step))), cj = Math.max(0, Math.min(seg, Math.round((z + half) / step)));
      const wet = ww[cj * (seg + 1) + ci] || 0;
      if (wet > 0.3) { const t = Math.min(1, (wet - 0.3) * 2); r += (24 - r) * t; gg += (46 - gg) * t; b += (70 - b) * t; }
    }
    // 周りを暗く（目を真ん中の陣へ）
    const vx = (i / NX - 0.5) * 2, vy = (j / NY - 0.5) * 2, v = 1 - Math.min(0.55, (vx * vx + vy * vy) * 0.28);
    img.data[k * 4] = r * v; img.data[k * 4 + 1] = gg * v; img.data[k * 4 + 2] = b * v; img.data[k * 4 + 3] = 255;
  }
  const small = document.createElement('canvas'); small.width = NX; small.height = NY;
  small.getContext('2d').putImageData(img, 0, 0);
  bg.setTransform(1, 0, 0, 1, 0, 0);
  bg.imageSmoothingEnabled = true; bg.drawImage(small, 0, 0, bg.canvas.width, bg.canvas.height);
  bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 道と塀
  bg.lineCap = bg.lineJoin = 'round';
  bg.strokeStyle = 'rgba(196,170,120,.32)'; bg.lineWidth = Math.max(1.2, 3 * sc);
  for (const path of W.def?.paths || []) {
    const pts = Array.isArray(path) ? path : path?.pts; if (!pts?.length) continue;
    bg.beginPath(); pts.forEach(([x, z], i) => { toS(x, z, q); i ? bg.lineTo(q[0], q[1]) : bg.moveTo(q[0], q[1]); }); bg.stroke();
  }
  bg.strokeStyle = 'rgba(214,208,192,.55)'; bg.lineWidth = Math.max(1, 1.6 * sc);
  for (const s of rt.army?.structs || []) {
    if (!s.seg) continue;
    toS(s.seg[0], s.seg[1], q); toS(s.seg[2], s.seg[3], q2);
    bg.beginPath(); bg.moveTo(q[0], q[1]); bg.lineTo(q2[0], q2[1]); bg.stroke();
  }
}

// 両軍の色（藍と朱。色の助けでは青と橙）
export function mapColors() {
  const ca = S.colorAssist;
  return { COL: [ca ? '#2f8fd0' : '#3c62c0', ca ? '#e07a10' : '#cf4a30'], DOT: [ca ? '#7cc0ef' : '#7f9cf0', ca ? '#ffb15c' : '#ff8466'] };
}

// 地図は斜めにしない：味方の塊から敵の塊への線を画面の上向きにそろえ、四方位のどれかへ寄せる（味方が下・敵が上。kaito 11/3 BG 2）。塊が近い・片方だけなら北を上
export function tidyAxis(L) {
  const cen = (d) => { let sx = 0, sz = 0; for (let i = 0; i < d.length; i += 2) { sx += d[i]; sz += d[i + 1]; } return d.length ? [sx / (d.length / 2), sz / (d.length / 2)] : null; };
  const ca = cen(L.dots[0]), ce = cen(L.dots[1]);
  let ex = 0, ez = -1;
  if (ca && ce && Math.hypot(ce[0] - ca[0], ce[1] - ca[1]) > 40) { ex = ce[0] - ca[0]; ez = ce[1] - ca[1]; }
  const ang = Math.round(Math.atan2(ez, ex) / (Math.PI / 2)) * (Math.PI / 2);
  return [Math.round(Math.cos(ang)), Math.round(Math.sin(ang))];
}

// 戦の支度の画面の布陣図：左に味方の大将、真ん中に真上の地図、右に敵の大将（待つ間の画面を空にしない。kaito 11/3 BG 1）
export function loadingMap(rt, host) {
  let L;
  try { L = introLayout(rt); } catch (e) { return null; }
  if (!L.dots[0].length && !L.dots[1].length) return null;
  const { COL, DOT } = mapColors();
  const short = window.innerHeight < 520;
  const Wd = Math.min(window.innerWidth - 32, short ? 560 : 520), Ht = short ? 118 : 200, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.id = 'ld-map'; cv.setAttribute('aria-hidden', 'true');
  cv.width = Math.round(Wd * dpr); cv.height = Math.round(Ht * dpr);
  cv.style.cssText = `display:block;margin:10px auto;width:${Wd}px;height:${Ht}px;border:1px solid rgba(194,162,90,.5);background:#0c0d10`;
  const g = cv.getContext('2d');
  const [fx, fz] = tidyAxis(L), rx = -fz, rz = fx;
  const cardW = Math.min(110, Wd * 0.22), mapX = cardW, mapW = Wd - cardW * 2;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  const take = (x, z) => { const u = x * rx + z * rz, v = x * fx + z * fz; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; };
  for (const d of L.dots) for (let i = 0; i < d.length; i += 2) take(d[i], d[i + 1]);
  take(L.me.x, L.me.z); if (L.pin) take(L.pin.x, L.pin.z);
  const su = Math.max(70, a1 - a0), sv = Math.max(70, b1 - b0), pad = 10;
  const sc = Math.min(12, (mapW - pad * 2) / (su * 1.1), (Ht - pad * 2) / (sv * 1.1));
  const cu = (a0 + a1) / 2, cvv = (b0 + b1) / 2, mx = cu * rx + cvv * fx, mz = cu * rz + cvv * fz;
  const bake = document.createElement('canvas'), bg = bake.getContext('2d');
  bake.width = Math.round(mapW * dpr); bake.height = Math.round(Ht * dpr);
  bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ox = mapW / 2, oy = Ht / 2, q = [0, 0];
  try { bakeGround(bg, rt, { Wd: mapW, Ht, dpr, sc, ox, oy, mx, mz, fx, fz, rx, rz }); } catch (e) { /* 地形が描けなくても点だけ出す */ }
  const toS = (x, z, out) => { const dx = x - mx, dz = z - mz; out[0] = ox + (dx * rx + dz * rz) * sc; out[1] = oy - (dx * fx + dz * fz) * sc; return out; };
  const r0 = Math.max(1.2, Math.min(2.4, 0.9 * sc));
  for (const side of [0, 1]) {
    const d = L.dots[side];
    bg.globalAlpha = 0.16; bg.fillStyle = COL[side];
    for (let i = 0; i < d.length; i += 2) { toS(d[i], d[i + 1], q); bg.beginPath(); bg.arc(q[0], q[1], r0 * 3.2, 0, Math.PI * 2); bg.fill(); }
    bg.globalAlpha = 1; bg.fillStyle = DOT[side];
    for (let i = 0; i < d.length; i += 2) {
      toS(d[i], d[i + 1], q);
      if (side) { bg.beginPath(); bg.moveTo(q[0], q[1] + r0); bg.lineTo(q[0] + r0, q[1] - r0 * 0.8); bg.lineTo(q[0] - r0, q[1] - r0 * 0.8); bg.closePath(); bg.fill(); }
      else bg.fillRect(q[0] - r0 * 0.8, q[1] - r0 * 0.8, r0 * 1.6, r0 * 1.6);
    }
  }
  g.drawImage(bake, mapX, 0, mapW, Ht);
  // 自分（白い矢じり）
  toS(L.me.x, L.me.z, q);
  g.save(); g.translate(mapX + q[0], q[1]); g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 5); g.lineTo(0, 2); g.lineTo(-6, 5); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = '#14120f'; g.stroke(); g.fillStyle = '#fff'; g.fill(); g.restore();
  // 大将の絵（兜・前立・肩）と名前
  const sd = rt.def.sides || {}, team = rt.player?.u?.team || 0;
  const fallback = [sd[team === 0 ? 'a' : 'b']?.name, sd[team === 0 ? 'b' : 'a']?.name].map((n) => String(n || '').replace(/（.*?）/g, ''));
  const who = [0, 1].map((side) => L.names.find((n) => n.side === side)?.name || fallback[side] || (side ? '敵の大将' : '味方の大将'));
  const bust = (cx, side) => {
    const base = Ht - 26, c = COL[side], w = cardW * 0.62, top = 18;
    g.save(); g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 2;
    g.fillStyle = c; g.beginPath(); g.moveTo(cx - w * 0.62, base + 8); g.quadraticCurveTo(cx - w * 0.6, base - 14, cx - w * 0.2, base - 18); g.lineTo(cx + w * 0.2, base - 18); g.quadraticCurveTo(cx + w * 0.6, base - 14, cx + w * 0.62, base + 8); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#d9b48f'; g.beginPath(); g.ellipse(cx, top + 40, w * 0.26, w * 0.32, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#2b2a2e'; g.beginPath(); g.moveTo(cx - w * 0.36, top + 38); g.quadraticCurveTo(cx - w * 0.34, top + 2, cx, top + 2); g.quadraticCurveTo(cx + w * 0.34, top + 2, cx + w * 0.36, top + 38);
    g.lineTo(cx + w * 0.5, top + 52); g.lineTo(cx + w * 0.3, top + 46); g.lineTo(cx + w * 0.26, top + 30); g.lineTo(cx - w * 0.26, top + 30); g.lineTo(cx - w * 0.3, top + 46); g.lineTo(cx - w * 0.5, top + 52); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#d9b44a'; g.lineWidth = 3; g.beginPath();
    if (side) { g.moveTo(cx - w * 0.3, top - 6); g.lineTo(cx, top + 10); g.lineTo(cx + w * 0.3, top - 6); }   // 敵：山形の前立
    else g.arc(cx, top + 8, w * 0.28, Math.PI * 1.05, Math.PI * 1.95);   // 味方：月の前立
    g.stroke();
    g.fillStyle = '#14120f'; g.fillRect(cx - w * 0.15, top + 38, w * 0.1, 2); g.fillRect(cx + w * 0.05, top + 38, w * 0.1, 2);
    g.restore();
    g.font = `700 ${short ? 13 : 15}px ${MINCHO}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 4; g.strokeStyle = 'rgba(8,8,10,.9)'; g.strokeText(who[side], cx, Ht - 6, cardW - 6); g.fillStyle = '#f1e9d6'; g.fillText(who[side], cx, Ht - 6, cardW - 6);
  };
  bust(cardW / 2, 0); bust(Wd - cardW / 2, 1);
  // 人数は両軍の絵の上へ（四角＝味方・三角＝敵）
  if (L.force) {
    g.font = `700 ${short ? 12 : 14}px ${MINCHO}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = '#f1e9d6';
    g.fillText(`${Math.round(L.force[0]).toLocaleString('ja-JP')}人`, cardW / 2, 3);
    g.fillText(`${Math.round(L.force[1]).toLocaleString('ja-JP')}人`, Wd - cardW / 2, 3);
  }
  host.appendChild(cv);
  return () => cv.remove();
}

export function introMap(rt, camera, done) {
  if (rt.def.town || rt.def.dojo || rt.def.duel || rt.def.mapCastle && !rt.def.sides || rt.startAutomatic) return null;
  // 撮る道具（裏の Chrome）は今までどおり見渡し無しで始める。見る時だけ window.__introMap = true
  if (/HeadlessChrome/.test(navigator.userAgent) && !window.__introMap) return null;
  let L;
  try { L = introLayout(rt); } catch (e) { console.warn('陣立ての地図を作れない', e); return null; }
  if (!L.dots[0].length && !L.dots[1].length) return null;
  const W = rt.world, p = rt.player;
  p.introT = 0; p.camShot = null; p.cine = null; p.shotZoom = 0;
  p.updateCamera(1, camera);
  const endPos = camera.position.clone(), endRot = camera.quaternion.clone(), far = camera.far;
  const fog = rt.scene.fog, fogFar = fog?.far;
  // 画面の上＝今のカメラの向き。降りた先と地図の向きを合わせる
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  let fx = dir.x, fz = dir.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  if (fl < 1e-3) { fx = 0; fz = -1; }
  const cfx = fx, cfz = fz;   // 降りる 3D の向きは今のカメラのまま
  // 地図は斜めにしない：味方の塊から敵の塊への線を画面の上向きにそろえる（味方が下・敵が上。傾いて分かりにくい、kaito 11/3 BG 2）。塊が近い・片方だけなら北を上
  { const ax = tidyAxis(L); fx = ax[0]; fz = ax[1]; }
  const rx = -fz, rz = fx;
  // 降りる前の 3D の視点：自分の真上から見下ろす
  const topPos = new THREE.Vector3(L.me.x - cfx * 4, W.heightAt(L.me.x, L.me.z) + 95, L.me.z - cfz * 4);
  const topRot = new THREE.Quaternion();
  { const m = new THREE.Matrix4().lookAt(topPos, new THREE.Vector3(L.me.x, W.heightAt(L.me.x, L.me.z), L.me.z), new THREE.Vector3(cfx, 0, cfz)); topRot.setFromRotationMatrix(m); }
  const { COL, DOT } = mapColors();

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:45;pointer-events:none;background:#0c0d10';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const bake = document.createElement('canvas'), bg = bake.getContext('2d');
  let Wd = 0, Ht = 0, dpr = 1, sc = 1, ox = 0, oy = 0, mx = 0, mz = 0;
  // 地図の座標：自分たちの塊の広がりに合わせて、画面に収める
  const toS = (x, z, out) => { const dx = x - mx, dz = z - mz; out[0] = ox + (dx * rx + dz * rz) * sc; out[1] = oy - (dx * fx + dz * fz) * sc; return out; };
  const q = [0, 0], q2 = [0, 0];
  function frame() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wd = window.innerWidth; Ht = window.innerHeight;
    cv.width = Math.round(Wd * dpr); cv.height = Math.round(Ht * dpr);
    // 回した座標で範囲を取る（両軍の点・自分・ピン）
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    const take = (x, z) => { const u = x * rx + z * rz, v = x * fx + z * fz; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; };
    for (const d of L.dots) for (let i = 0; i < d.length; i += 2) take(d[i], d[i + 1]);
    take(L.me.x, L.me.z); if (L.pin) take(L.pin.x, L.pin.z);
    for (const a of L.arrows) take(a.x + a.dx * a.len, a.z + a.dz * a.len);
    let su = Math.max(70, a1 - a0), sv = Math.max(70, b1 - b0);
    const top = 64, side = 28, bottom = 24;
    sc = Math.min((Wd - side * 2) / (su * 1.12), (Ht - top - bottom) / (sv * 1.12));
    sc = Math.min(sc, 12);
    const cu = (a0 + a1) / 2, cvv = (b0 + b1) / 2;
    mx = cu * rx + cvv * fx; mz = cu * rz + cvv * fz;
    ox = Wd / 2; oy = top + (Ht - top - bottom) / 2;
    bakeMap();
  }
  // 地形（墨色の陰影）・水・道・塀・兵の点を一枚に焼く
  function bakeMap() {
    bake.width = cv.width; bake.height = cv.height;
    bakeGround(bg, rt, { Wd, Ht, dpr, sc, ox, oy, mx, mz, fx, fz, rx, rz });
    // 兵の広がりは淡いにじみだけ。隊は布陣図の駒（正方形の左上と右上を切り欠いた形。kaito 十三2）で示す
    const r0 = Math.max(1.1, Math.min(2.4, 0.9 * sc));
    for (const side of [0, 1]) {
      const d = L.dots[side];
      bg.globalAlpha = 0.16; bg.fillStyle = COL[side];
      for (let i = 0; i < d.length; i += 2) { toS(d[i], d[i + 1], q); bg.beginPath(); bg.arc(q[0], q[1], r0 * 3.2, 0, Math.PI * 2); bg.fill(); }
      bg.globalAlpha = 0.55; bg.fillStyle = DOT[side];
      for (let i = 0; i < d.length; i += 2) { toS(d[i], d[i + 1], q); bg.fillRect(q[0] - r0 * 0.4, q[1] - r0 * 0.4, r0 * 0.8, r0 * 0.8); }
    }
    bg.globalAlpha = 1;
    drawKoma(bg, L.units, toS, COL, Math.max(7, Math.min(13, 2.6 * sc)));
  }
  frame();

  const fmt = (n) => `${Math.max(0, Math.round(n)).toLocaleString('ja-JP')}人`;
  function arrow(a, grow) {
    const len = a.len * grow * sc, w = Math.max(5, a.w * 6 * Math.min(1.6, sc));
    if (len < 2) return;
    toS(a.x, a.z, q);
    const ang = Math.atan2(-(a.dx * fx + a.dz * fz), a.dx * rx + a.dz * rz);
    g.save(); g.translate(q[0], q[1]); g.rotate(ang);
    const head = Math.min(len * 0.45, w * 2.2);
    g.beginPath(); g.moveTo(0, -w * 0.32); g.lineTo(len - head, -w * 0.5); g.lineTo(len - head, -w); g.lineTo(len, 0);
    g.lineTo(len - head, w); g.lineTo(len - head, w * 0.5); g.lineTo(0, w * 0.32); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(8,8,10,.85)'; g.stroke();
    g.fillStyle = COL[a.side]; g.fill();
    g.restore();
  }
  function label(text, x, y, color, size) {
    g.font = `600 ${size}px ${MINCHO}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 4; g.strokeStyle = 'rgba(8,8,10,.9)'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }
  function pinMark(x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(-3, 10); g.lineTo(-3, -12); g.lineTo(11, -12); g.lineTo(6, -6); g.lineTo(11, 0); g.lineTo(-3, 0);
    g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 4.5; g.stroke(); g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }
  function draw(t, k) {
    // k：降りる割合（0〜1）。自分の居場所へ寄りながら、画面の真ん中へ寄せて溶かす
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    toS(L.me.x, L.me.z, q); const px = q[0], py = q[1];
    const z = 1 + k * k * 7 + (calm ? 0 : Math.min(t, HOLD) / HOLD * 0.05), tx = (Wd / 2 - px) * k, ty = (Ht * 0.6 - py) * k;
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (px + tx - px * z), dpr * (py + ty - py * z));
    g.drawImage(bake, 0, 0, Wd, Ht);
    const grow = calm ? 1 : Math.max(0, Math.min(1, (t - 0.45) / 1.2)), ease = 1 - (1 - grow) ** 3;
    for (const a of L.arrows) arrow(a, ease);
    const fade = Math.max(0, 1 - k * 2.5);
    g.globalAlpha = fade;
    // 名は重ねない：先に置いた名と重なる時は一段上へ（それでも重なれば出さない。上の人数の札にも重ねない）
    const put = draw.put || (draw.put = []); put.length = 0;
    for (const n of L.names) {
      toS(n.x, n.z, q); if (Math.hypot(q[0] - px, q[1] - py) < 26 / z) continue;
      const fs = 15 / z, w = n.name.length * fs * 1.05, h = fs * 1.25, hit = (y) => put.some((r) => Math.abs(r[0] - q[0]) < (r[2] + w) / 2 && Math.abs(r[1] - y) < h);
      let y = q[1] - 8;
      for (let tries = 0; tries < 3 && hit(y); tries++) y -= h;
      if (hit(y) || (z < 1.2 && y < 66)) continue;
      put.push([q[0], y, w]); label(n.name, q[0], y, '#f1e9d6', fs);
    }
    // 自分（白い矢じり）と行き先のピン
    g.globalAlpha = 1;
    g.save(); g.translate(px, py); g.rotate(0); const s = 1 / Math.sqrt(z);
    g.beginPath(); g.moveTo(0, -11 * s); g.lineTo(7 * s, 6 * s); g.lineTo(0, 2.5 * s); g.lineTo(-7 * s, 6 * s); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 3.5 * s; g.strokeStyle = '#14120f'; g.stroke(); g.fillStyle = '#fff'; g.fill(); g.restore();
    if (L.pin) {
      const bob = calm ? 0 : Math.sin(t * 4) * 2;
      toS(L.pin.x, L.pin.z, q); g.globalAlpha = fade; pinMark(q[0], q[1] - 10 + bob, 1.1 / Math.sqrt(z)); g.globalAlpha = 1;
    }
    // 両軍の人数（上の真ん中。味方は四角・敵は三角を添える）
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalAlpha = fade;
    if (L.force) {
      const y = 40, text = [fmt(L.force[0]), fmt(L.force[1])];
      g.font = `700 18px ${MINCHO}`;
      const wa = g.measureText(text[0]).width, wb = g.measureText(text[1]).width, gap = 34;
      const xa = Wd / 2 - gap / 2 - wa, xb = Wd / 2 + gap / 2 + 18;
      g.fillStyle = 'rgba(8,8,10,.62)'; g.fillRect(xa - 30, y - 26, wa + wb + gap + 66, 36);
      for (const [side, x] of [[0, xa - 16], [1, xb - 12]]) {
        g.save(); g.translate(x, y - 9); komaPath(g, 7); g.fillStyle = COL[side]; g.fill(); g.lineWidth = side ? 2.4 : 1.6; g.strokeStyle = '#14120f'; g.stroke();
        if (side) { g.beginPath(); g.moveTo(-4, 1); g.lineTo(4, 1); g.lineWidth = 1.8; g.stroke(); }
        g.restore();
      }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f1e9d6';
      g.fillText(text[0], xa, y); g.fillText(text[1], xb, y);
      g.strokeStyle = 'rgba(194,162,90,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(Wd / 2 - 8, y - 9); g.lineTo(Wd / 2 + 8, y - 9); g.stroke();
    }
    g.globalAlpha = 1;
    cv.style.opacity = String(Math.min(1, t / 0.35, 1 - Math.max(0, (k - 0.35) / 0.65)));
  }

  let t = 0, k = 0, calm = reduceMotion(), closed = false, departing = false, departT = 0;
  const pos = new THREE.Vector3();
  function place3d(e) {
    // 地図の裏の 3D は真上から始め、降りる間に今のカメラへ
    pos.lerpVectors(topPos, endPos, e); camera.position.copy(pos);
    camera.quaternion.slerpQuaternions(topRot, endRot, e);
    camera.far = Math.max(far, 260); if (fogFar !== undefined) fog.far = fogFar + (Math.max(fogFar, 220) - fogFar) * (1 - e);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    W.sky?.position.set(pos.x, 0, pos.z); W.mountains?.position.set(pos.x, 0, pos.z);
  }
  const sky0 = W.sky?.position.clone(), mtn0 = W.mountains?.position.clone();
  function dispose() {
    if (closed) return;
    closed = true; cv.remove(); window.removeEventListener('pointerdown', tap, true); window.removeEventListener('resize', frame);
    camera.position.copy(endPos); camera.quaternion.copy(endRot); camera.far = far;
    if (fogFar !== undefined) fog.far = fogFar;
    if (sky0) W.sky.position.copy(sky0); if (mtn0) W.mountains.position.copy(mtn0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  function finish() { dispose(); done(); }
  function jump(immediate = false) {
    if (closed) return;
    if (immediate || departing || calm || reduceMotion()) { finish(); return; }
    departing = true;
  }
  function tap() { jump(); }
  window.addEventListener('pointerdown', tap, true);
  window.addEventListener('resize', frame);
  function update(dt) {
    if (closed) return;
    calm = calm || reduceMotion();
    t += Math.min(dt, 0.1);
    if (!departing && t >= HOLD) { if (calm) { finish(); return; } departing = true; }
    if (departing) {
      departT += Math.min(dt, 0.1);
      if (departT >= DESCEND) { finish(); return; }
      const x = departT / DESCEND; k = x * x * (3 - 2 * x);
    }
    place3d(k);
    draw(t, k);
  }
  update(0);
  window.__introMapShown = { arrows: L.arrows.length, dots: [L.dots[0].length / 2, L.dots[1].length / 2], names: L.names.length, pin: !!L.pin };
  return { update, jump, dispose };
}
