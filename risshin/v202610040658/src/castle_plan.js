// ======================================================================
// 縄張りの書き方（castle_plan.js）… docs/castle-design.md 6章
// 城一つを「曲輪（段）・虎口・道・堀・櫓」のデータで書き、そこから
// 地形の高さ（曲輪を平らに・縁を切岸に）・塀と門・床（floors.js）・兵の置き場を組み立てる。
// C2（攻城）で「曲輪の段の差」（堀 plan.hori の窪みを高さに混ぜる）と
// 「虎口の曲がり」（plan.koguchi の gate・kind から、枡形・門を castle_parts.js で実際に建てる）を足した。
// 門・櫓を建てるのは o.buildGates／o.buildTowers を渡した時だけ（既定 false。稲葉山・木ノ芽峠は
// 自分で手置きしているので、今まで通り何も増えない＝後方互換）。
// ======================================================================
import { wallLine } from './bhelp.js';
import { palisade, dobei, ishigaki, sakamogi, makeKitBatch, finalizeKitBatch, kuruwaBldg, nobori, SOLIDS } from './props.js';
import { addDeck, groundAt } from './floors.js';
import { makePerchGuards } from './perch.js';
import { placeFromSpots, patchGunCover } from './taketaba.js';
import { placeLadder } from './siege_ladder.js';
import { hashigo } from './props.js';
import {
  kabukiGate, yaguraGate, ironGate, masugata, sumiyaguraTower, monomi,
  horiboriHeight, mizubori, tategoriWalls, goten,
} from './castle_parts.js';
import { tenshu } from './props.js';
import { NAKA, nakaFind, nakaGuide } from './naka.js';
import { makeInteriorGuards } from './shironaka.js';
import { S as SETTINGS } from './settings.js';

// 点が多角形の内かどうか（点は [x,z] の並び）
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    const hit = (zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
// 点から多角形の縁までの最短距離（内外を問わない）
function distToPoly(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}
export function polyCenter(poly) {
  let x = 0, z = 0;
  for (const [px, pz] of poly) { x += px; z += pz; }
  return { x: x / poly.length, z: z / poly.length };
}

// 高さの関数を作る：baseFn(x,z) の地形に、曲輪ごとの平らな段と切岸（急な縁）を重ねる
// 奥（level の高い）曲輪ほど勝つ（二つの曲輪が重なって見えても、高い方を採る）
// k.level は数でも関数（baseFn）=>数でもよい（DEM などで baseFn を差し替えても、曲輪の高さが追随する）
export function heightOf(plan, baseFn, edgeW = 3.2) {
  const kk = plan.kuruwa
    .map((k) => ({ ...k, level: typeof k.level === 'function' ? k.level(baseFn) : k.level }))
    .sort((a, b) => a.level - b.level);   // 低い順に重ね、高い段を上から被せる
  const gates = (plan.koguchi || []).filter((g) => g.at).map((g) => g.at);
  // 土塁（kaito 10/2「土塁が低く無い」）：土の塀・柵の曲輪は、縁に高さ k.dorui（既定 1.3m）の土の土手を盛る。
  // 頂（幅 0.8m の武者走り）に塀・柵が乗り、内へ 2.2m で曲輪の床へ下りる。外の切岸も同じだけ持ち上げる。
  // 門（虎口）と口（gapAt）の 5m 内は盛らない（通り道）。石垣の曲輪・k.dorui === 0 は盛らない
  for (const k of kk) {
    k.bank = (k.wall === 'dobei' || k.wall === 'saku' || k.wall === 'palisade') && !k.stone ? (k.dorui ?? 1.3) : 0;
    k.mouths = [...gates, ...(k.gapAt ? (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt]) : [])];
  }
  const bankAt = (k, x, z) => {
    let m = 1;
    for (const [gx, gz] of k.mouths) { const dd = Math.hypot(gx - x, gz - z); if (dd < 7) m = Math.min(m, Math.max(0, (dd - 4.5) / 2.5)); }
    return k.bank * m;
  };
  return (x, z, h0) => {
    let h = h0 != null ? h0 : baseFn(x, z);
    for (const k of kk) {
      const inside = inPoly(k.poly, x, z);
      const d = distToPoly(k.poly, x, z);
      const lvl = k.stone ? k.level - 0.2 : k.level;   // 石垣の曲輪は 0.2 低く作り、床（deck）で本当の高さにする
      if (inside) {
        h = lvl;   // 曲輪の中は平ら
        if (k.bank && d < 3) h += bankAt(k, x, z) * Math.min(1, Math.max(0, (3 - d) / 2.2));
      } else if (d < edgeW) {
        const w = 1 - d / edgeW;   // 外側でも縁に近ければ、切岸の下り坂へ寄せる
        const blend = h * (1 - w) + (lvl - edgeW * 0.9) * w;
        // 石垣の曲輪：縁のすぐ外で地面を急に落とす（石の面が切岸の土に埋もれず、下の地面から立ち上がって見える）。
        // 門（虎口）の 7m 内は今まで通りの坂（上り口）にする
        if ((k.stone || k.wall === 'ishigaki') && !gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 7)) h = Math.max(h, Math.min(blend, lvl - 0.3 - d * 6));
        else h = blend + (k.bank ? bankAt(k, x, z) * Math.max(0, 1 - d / 1.4) : 0);
      }
    }
    return h;
  };
}

// 虎口の口の幅（kaito 10/1「四方を切れ目なく」）：gapAt の近く（8m 以内）の門の幅だけを開ける。
// 枡形（kind 'masu'）は枡形の塀が口を囲うので、今まで通り辺を丸ごと開ける（null）。門の無い口は k.gapW（既定 5m）
function gapWidthAt(plan, k, gp) {
  let best = null, bd = 8;
  for (const g of (plan && plan.koguchi) || []) {
    if (!g.at) continue;
    const d = Math.hypot(g.at[0] - gp[0], g.at[1] - gp[1]);
    if (d < bd) { bd = d; best = g; }
  }
  if (best && best.kind === 'masu') return null;
  if (best) return (best.w ?? best.w1 ?? 4.4) + 0.3;
  return k.gapW ?? 5;
}

// 曲輪の縁を、口の所だけ短く切った点の並びと、口になる辺の番号にする。
// 前は口のある辺を丸ごと抜いていたので、長い辺では門の脇に何十 m も穴が開き、塀の外から回り込めた（kaito 10/1）
function splitGaps(plan, k, poly, gapPts) {
  const cuts = poly.map(() => []);   // 辺ごとの [t0, t1]（'all' は辺を丸ごと）
  for (const gp of gapPts) {
    let best = Infinity, bi = -1;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const mx = (poly[i][0] + poly[j][0]) / 2, mz = (poly[i][1] + poly[j][1]) / 2;
      const d = Math.hypot(mx - gp[0], mz - gp[1]);
      if (d < best) { best = d; bi = i; }
    }
    if (bi < 0) continue;
    const w = gapWidthAt(plan, k, gp);
    const [ax, az] = poly[bi], [bx, bz] = poly[(bi + 1) % poly.length];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    if (w == null || w >= len - 1) { cuts[bi].push('all'); continue; }
    const t = Math.max(0, Math.min(1, ((gp[0] - ax) * (bx - ax) + (gp[1] - az) * (bz - az)) / (len * len)));
    const h = w / 2 / len;
    cuts[bi].push([Math.max(0, t - h), Math.min(1, t + h)]);
  }
  const pts = [], gaps = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    pts.push(poly[i]);
    if (cuts[i].includes('all')) { gaps.push(pts.length - 1); continue; }
    const iv = cuts[i].sort((p, q) => p[0] - q[0]);
    for (const [t0, t1] of iv) {
      if (t0 > 0.001) pts.push([ax + (bx - ax) * t0, az + (bz - az) * t0]);
      gaps.push(pts.length - 1);
      if (t1 < 0.999) pts.push([ax + (bx - ax) * t1, az + (bz - az) * t1]);
    }
  }
  return { pts, gaps };
}

// 曲輪の縁に塀を作る（gapAt があれば、そこを避けて切る＝虎口の口）
function buildKuruwaWall(rt, k, batch, plan, share, lvl = null) {
  if (!k.wall) return [];
  const mesh = k.wall === 'ishigaki' ? null : k.wall === 'dobei' ? dobei : palisade;
  const poly = k.poly;
  // gapAt は一点でも、並び（喰違いのように二か所＝入口と出口）でもよい
  const gapPts = k.gapAt ? (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt]) : [];
  const gapIdx = gapPts.map((gp) => {
    let best = Infinity, bi = -1;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const mx = (poly[i][0] + poly[j][0]) / 2, mz = (poly[i][1] + poly[j][1]) / 2;
      const d = Math.hypot(mx - gp[0], mz - gp[1]);
      if (d < best) { best = d; bi = i; }
    }
    return bi;
  }).filter((i) => i >= 0);
  if (k.wall === 'ishigaki') {
    const start = gapIdx.length ? (gapIdx[0] + 1) % poly.length : 0;
    let pts = [...poly.slice(start), ...poly.slice(0, start), poly[start]];
    // 口のある辺は、口の前後 6m を空ける（張り出した石垣が門の前を塞がないように。口の所は切岸の坂が上り口）
    if (gapPts.length) pts = cutRing(poly, gapPts[0], 6) || pts;
    // 石の面を外へ向ける：ishigaki() は進む向きの左手を外とするので、多角形の巻きの向きに合わせて out を選ぶ
    // （前は高遠の本丸のような巻きで石の面が内を向き、外からは石の背の平たい段しか見えなかった）
    const c = polyCenter(poly);
    const [p0x, p0z] = pts[0], [p1x, p1z] = pts[1];
    const out = (-(p1z - p0z)) * ((p0x + p1x) / 2 - c.x) + (p1x - p0x) * ((p0z + p1z) / 2 - c.z) >= 0 ? 1 : -1;
    // 本物の石垣の曲輪（安土のころの野面積み）は高さ 4〜7m。切岸の下まで石で覆う。
    // 中・高は天端を低く（0.3m）して、その上に土塀（狭間・控柱）を載せる＝石垣の上の塀。低は石の天端だけ（1.4m）
    // 地形の網は 2.5m ごとなので、切岸を縁で垂直に落としても網の上では坂に均され、石の面の下半分が土に埋もれる。
    // そこで石垣は縁から PUSH m 外へ張り出して積み（均された坂より外）、縁との間は天端の石敷きで上から塞ぐ
    const withHei = SETTINGS.quality !== 'low';
    // 天端の高さは曲輪の中の地面から取る（戦によっては世界の高さが別の下地で作られ、計算した level とずれる＝岩村で石垣が床より 4m 高かった）
    const PUSH = 2.6, lvlTop = rt.world.heightAt(c.x, c.z) + (withHei ? 0.3 : 1.4);
    const pp = offsetPoly(pts, out * PUSH);
    const m = ishigaki(rt.world, pp, { topY: lvlTop, capIn: PUSH + 0.2, lean: 0.22, minH: 3.4, maxH: 7, out, batch, scene: rt.scene, big: withHei ? 1 : 1.5 });   // 低は石を大きく粗く（数を 1/3 に）
    if (!m.isBatchedPart) rt.scene.add(m);
    if (withHei) for (let i = 0; i < pp.length - 1; i++) {
      const [ax, az] = pp[i], [bx, bz] = pp[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      // 石垣の天端の外の縁から 0.7m 内に土塀を建てる（塀の足もとは天端の石敷きの上）
      const ix = (bz - az) / len * out * 0.7, iz = -(bx - ax) / len * out * 0.7;
      dobei(rt.world, [ax + ix, az + iz, bx + ix, bz + iz], { hikae: -out, batch, baseY: lvlTop - 0.05 });
    }
    return [m];
  }
  // segLen: 999 で「多角形の一辺＝一つの壁」に（ringWall と同じやり方）。口は門の幅だけを切った短い辺にする
  const sp = splitGaps(plan, k, poly, gapPts);
  if (!share) return wallLine(rt, sp.pts, { closed: true, gaps: sp.gaps, team: 1, hp: 380, segLen: 999, mesh, meshOpt: { batch }, name: k.name || '塀' });
  // 隣の曲輪と縁を分け合う所（高遠の三の丸の南＝二の丸の北など）は、塀を二重に建てず、隣の口も塞がない
  const out = [];
  const n = sp.pts.length;
  for (let i = 0; i < n; i++) {
    if (sp.gaps.includes(i)) continue;
    const a = sp.pts[i], b = sp.pts[(i + 1) % n];
    for (const [p0, p1] of uncovered(a, b, [...share.gaps.filter((g) => g.k !== k.id), ...share.built])) {
      out.push(...wallLine(rt, [p0, p1], { team: 1, hp: 380, segLen: 999, mesh, meshOpt: { batch }, name: k.name || '塀' }));
    }
    share.built.push({ a, b, k: k.id });
  }
  return out;
}

// 攻め手の梯子を城の縁に掛ける（kaito 10/2「梯子が使えない」）。曲輪の縁（門・口の 9m 内を除く）を 5m おきに見て、
// 外の足もとから縁の内 1.6m の床まで 1.5〜10m 上がる所を候補にし、攻め手の出だし（def.spawn）に近い順に、
// 20m 以上離して o.n（既定 3）本。梯子は見える形（hashigo：塀・切岸の天端に掛けた形）を添え、守りが近いと押し倒される。
// 足もとに来た味方の兵は自分で登る（autoUse）。自分は足もとで「梯子を登る」の札
export function castleLadders(rt, C, o = {}) {
  const W = rt.world, plan = C.plan, team = o.team ?? 0, n = o.n ?? 3;
  const sp = o.from || (rt.def && rt.def.spawn) || { x: 0, z: 0 };
  const mouths = [...(plan.koguchi || []).filter((g) => g.at).map((g) => g.at)];
  for (const k of plan.kuruwa) if (k.gapAt) for (const g of (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt])) mouths.push(g);
  const cand = [];
  for (const k of plan.kuruwa) {
    const poly = k.poly, c = polyCenter(poly), stone = k.stone || k.wall === 'ishigaki';
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 3) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      let nx = -tz, nz = tx; if ((ax + bx) / 2 * nx - c.x * nx + (az + bz) / 2 * nz - c.z * nz < 0) { nx = -nx; nz = -nz; }
      for (let u = Math.min(2.5, len / 2); u < len; u += 5) {
        const ex = ax + tx * u, ez = az + tz * u;
        if (mouths.some(([gx, gz]) => Math.hypot(gx - ex, gz - ez) < 9)) continue;
        const out = stone ? 5.2 : 3.2;
        const fx = ex + nx * out, fz = ez + nz * out, ix = ex - nx * 1.6, iz = ez - nz * 1.6;
        if (!inPoly(poly, ix, iz) || plan.kuruwa.some((q) => q !== k && inPoly(q.poly, fx, fz) && (C.kuruwa[q.id] ? C.kuruwa[q.id].level : 0) >= (C.kuruwa[k.id] ? C.kuruwa[k.id].level : 0))) continue;
        const y0 = W.heightAt(fx, fz), y1 = W.heightAt(ix, iz) + 0.05, dh = y1 - y0;
        if (dh < 1.5 || dh > 10) continue;
        if (W.walkable && !W.walkable(fx, fz)) continue;
        cand.push({ k, ex, ez, fx, fz, ix, iz, y0, y1, d: Math.hypot(fx - sp.x, fz - sp.z), wallH: k.wall === 'ishigaki' ? 0.6 : k.wall ? 2.2 : 0.4 });
      }
    }
  }
  cand.sort((a, b) => a.d - b.d);
  const pick = [];
  for (const pass of [0, 1]) for (const q of cand) {
    if (pick.length >= n) break;
    if (pick.includes(q) || pick.some((p) => Math.hypot(p.fx - q.fx, p.fz - q.fz) < 20)) continue;
    if (pass === 0 && pick.some((p) => p.k === q.k)) continue;
    pick.push(q);
  }
  return pick.map((q) => {
    const l = placeLadder(W, { foot: { x: q.fx, z: q.fz }, topY: q.y1, topX: q.ix, topZ: q.iz, team, hp: o.hp ?? 60, name: o.name || '城の梯子', autoKnock: true, rt });
    l.autoUse = o.autoUse !== false;
    l.mesh = hashigo({ x: q.fx, y: q.y0, z: q.fz }, { x: q.ex + (q.fx - q.ex) * 0.08, y: W.heightAt(q.ex, q.ez) + q.wallH, z: q.ez + (q.fz - q.ez) * 0.08 });
    rt.scene.add(l.mesh);
    return l;
  });
}

const LIFE_KINDS = { hon: ['kura', 'ido', 'bansho', 'kura'], ni: ['umaya', 'kura', 'bansho', 'ido'], san: ['umaya', 'bansho'] };
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function autoKuruwaLife(rt, plan, C, o) {
  if (!rt.scene || !rt.world || (C.lifeDone)) return;
  C.lifeDone = true;
  const low = SETTINGS.quality === 'low';
  const batch = makeKitBatch();
  const mouths = (plan.koguchi || []).filter((g) => g.at).map((g) => g.at);
  const paths = (plan.paths || []).map((p) => p.pts || []);
  const avoid = [...(plan.yagura || []).filter((y) => y.at).map((y) => [y.at[0], y.at[1], 8]), ...(plan.lordSeat ? [[plan.lordSeat.at[0], plan.lordSeat.at[1], 11]] : [])];
  const SIZE = { kura: [5.8, 4.4], bansho: [4.8, 3.8], ido: [2.6, 2.6], umaya: [11.2, 4.8] };
  const free = (x, z, w, d, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot), r = Math.hypot(w, d) / 2 + 0.8;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (!inPoly(kk.poly, px, pz)) return why('poly');
    }
    if (mouths.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < r + 4)) return why('mouth');
    if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < r + ar - 4)) return why('avoid');
    for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) if (segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < r + 0.8) return why('path');
    for (const q of SOLIDS) { if (q.x1 == null) continue; if (q.x1 > x - r && q.x0 < x + r && q.z1 > z - r && q.z0 < z + r) return why('solid'); }
    let near = false;
    if (rt.army.forNear) rt.army.forNear(x, z, r + 1, (u) => { if (u.alive && !u.isStruct) near = true; });
    return near ? why('unit') : true;
  };
  const why = (w) => { C.lifeWhy = C.lifeWhy || {}; C.lifeWhy[w] = (C.lifeWhy[w] || 0) + 1; return false; };
  let kk = null, any = false;
  for (const k of plan.kuruwa) {
    const id = String(k.id || '');
    const role = k.kind === 'hon' || id === 'hon' || id === 'shu' || id.endsWith('_hon') ? 'hon' : k.kind === 'ni' || id === 'ni' ? 'ni' : k.kind === 'san' || id === 'san' ? 'san' : null;
    if (!role) continue;
    kk = k;
    const poly = k.poly, c = polyCenter(poly);
    let area = 0; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; area += ax * bz - bx * az; }
    area = Math.abs(area) / 2;
    if (area < 350) continue;
    if (k.gapAt) for (const g of (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt])) mouths.push(g);
    const want = LIFE_KINDS[role].slice(0, Math.min(LIFE_KINDS[role].length, Math.floor(area / 380)));
    const lvlY = C.kuruwa[k.id] ? C.kuruwa[k.id].level : 0;
    // 候補：辺ごとに、縁から 6.5m 内の線の上を 3m おき
    const cand = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 8) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      let ix = -tz, iz = tx; if ((c.x - ax) * ix + (c.z - az) * iz < 0) { ix = -ix; iz = -iz; }
      for (const ins of [6.5, 11]) for (let u = 4; u < len - 4; u += 3) cand.push({ x: ax + tx * u + ix * ins, z: az + tz * u + iz * ins, rot: Math.atan2(ix, iz), ix, iz });
    }
    let n = 0;
    for (const kind of want) {
      const [w, d] = SIZE[kind];
      const off = (d - 4.4) / 2;
      const hit = cand.find((q) => !q.used && free(q.x - q.ix * off, q.z - q.iz * off, w, d, q.rot));
      if (!hit) continue;
      for (const q of cand) if (Math.hypot(q.x - hit.x, q.z - hit.z) < w / 2 + 6) q.used = true;
      kuruwaBldg(rt.world, kind, hit.x - hit.ix * off, hit.z - hit.iz * off, hit.rot, { batch, one: low });
      n++; any = true; C.life = (C.life || 0) + 1;
    }
    // 幟：塀の内 2.5m に 14m おき（口の 8m 内は空ける）。画質「低」は立てない（一本で描く回数が二つ）
    if (!low && plan.mon) {
      let f = 0;
      for (let i = 0; i < poly.length && f < 5; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        let ix = -tz, iz = tx; if ((c.x - ax) * ix + (c.z - az) * iz < 0) { ix = -ix; iz = -iz; }
        for (let u = 6; u < len - 4 && f < 5; u += 14) {
          const x = ax + tx * u + ix * 2.5, z = az + tz * u + iz * 2.5;
          if (mouths.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 8)) continue;
          rt.scene.add(nobori(rt.world, x, z, plan.mon, 5.5)); f++; C.lifeFlags = (C.lifeFlags || 0) + 1;
        }
      }
    }
    void lvlY; void n;
  }
  if (any) finalizeKitBatch(rt, batch);
}

// 柵の曲輪の外に、逆茂木を自動で並べる（kaito 10/2「砦がチープ」：本物の柵の外には逆茂木と乱杭がある）。
// 辺に沿って 9m ごとに 5m の束を、柵から 2.6m 外へ、梢を外へ向けて。口（門・gapAt）の 7m 内と、隣の曲輪の中は空ける。
// 形は城の kit の入れ物（batch）へ積むだけ（描く回数は増えない）。画質「低」は置かない
function autoSakamogi(rt, plan, k, batch) {
  const poly = k.poly, c = polyCenter(poly);
  const mouths = [...(plan.koguchi || []).filter((g) => g.at).map((g) => g.at), ...(k.gapAt ? (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt]) : [])];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 6) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    let nx = -tz, nz = tx;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) { nx = -nx; nz = -nz; }
    const n = Math.max(1, Math.floor(len / 9));
    for (let q = 0; q < n; q++) {
      const u = (q + 0.5) * len / n, x = ax + tx * u + nx * 2.6, z = az + tz * u + nz * 2.6;
      if (mouths.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 7)) continue;
      if (plan.kuruwa.some((o) => o !== k && inPoly(o.poly, x, z))) continue;
      sakamogi(rt.world, x, z, Math.atan2(nx, nz), Math.min(5, len / n - 1.5), batch);
    }
  }
}

// 閉じた多角形の輪から、点 g の半径 r の内を切り取った一本の開いた点の並びを返す（g の直後から回って直前まで）。
// 輪が円に触れなければ null
function cutRing(poly, g, r) {
  const n = poly.length, out = [];
  let first = -1;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const fx = a[0] - g[0], fz = a[1] - g[1], B = 2 * (fx * dx + fz * dz), Cc = fx * fx + fz * fz - r * r, D = B * B - 4 * L2 * Cc;
    let t0 = 2, t1 = 2;
    if (D > 0) { const sq = Math.sqrt(D); t0 = (-B - sq) / (2 * L2); t1 = (-B + sq) / (2 * L2); }
    segs.push({ a, b, t0: Math.max(0, t0), t1: Math.min(1, t1), hit: D > 0 && t1 > 0 && t0 < 1 });
  }
  if (!segs.some((q) => q.hit)) return null;
  // 円から出る所（t1 < 1 の辺）から回り始める
  for (let i = 0; i < n; i++) if (segs[i].hit && segs[i].t1 < 1) { first = i; break; }
  if (first < 0) return null;
  const at = (q, t) => [q.a[0] + (q.b[0] - q.a[0]) * t, q.a[1] + (q.b[1] - q.a[1]) * t];
  out.push(at(segs[first], segs[first].t1));
  for (let k = 1; k <= n; k++) {
    const q = segs[(first + k) % n];
    out.push(q.a);
    if (q.hit && q.t0 > 0) { out.push(at(q, q.t0)); break; }
    if (q.hit) break;
  }
  return out.length >= 2 ? out : null;
}

// 開いた点の並び（最後が最初と同じ閉じた輪でもよい）を、進む向きの左手へ d m ずらす（角は留め＝二辺の法線の和の向き）
function offsetPoly(pts, d) {
  const closed = pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;
  const n = pts.length;
  const nrm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 2] : null, next = i < n - 1 ? pts[i + 1] : closed ? pts[1] : null;
    const n1 = prev ? nrm(prev, p) : null, n2 = next ? nrm(p, next) : null;
    let mx = (n1 ? n1[0] : 0) + (n2 ? n2[0] : 0), mz = (n1 ? n1[1] : 0) + (n2 ? n2[1] : 0);
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const ref = n1 || n2, cosH = Math.max(0.35, mx * ref[0] + mz * ref[1]);
    return [p[0] + mx * d / cosH, p[1] + mz * d / cosH];
  });
}

// 辺 a→b のうち、並びの辺（list の {a,b}。同じ線の上・0.6m 以内）に重ならない所を [[p0,p1],...] で返す
function uncovered(a, b, list) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.3) return [];
  const ux = dx / len, uz = dz / len;
  const off = (p) => Math.abs((p[0] - a[0]) * uz - (p[1] - a[1]) * ux);
  const along = (p) => ((p[0] - a[0]) * ux + (p[1] - a[1]) * uz) / len;
  const iv = [];
  for (const e of list) {
    if (off(e.a) > 0.6 || off(e.b) > 0.6) continue;
    const t0 = Math.max(0, Math.min(along(e.a), along(e.b))), t1 = Math.min(1, Math.max(along(e.a), along(e.b)));
    if (t1 - t0 > 0.3 / len) iv.push([t0, t1]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  const res = [];
  let t = 0;
  for (const [t0, t1] of iv) { if (t0 > t + 0.4 / len) res.push([t, t0]); t = Math.max(t, t1); }
  if (t < 1 - 0.4 / len) res.push([t, 1]);
  return res.map(([s0, s1]) => [[a[0] + dx * s0, a[1] + dz * s0], [a[0] + dx * s1, a[1] + dz * s1]]);
}

// 曲輪どうしの分け合う縁の下ごしらえ：塀を建てる曲輪の口の辺を、先に全部集めておく
function shareOf(plan, o) {
  const gaps = [];
  for (const k of plan.kuruwa) {
    if (!k.wall || k.wall === 'ishigaki' || (o.skipWalls || []).includes(k.id)) continue;
    const gapPts = k.gapAt ? (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt]) : [];
    const sp = splitGaps(plan, k, k.poly, gapPts);
    for (const i of sp.gaps) gaps.push({ a: sp.pts[i], b: sp.pts[(i + 1) % sp.pts.length], k: k.id });
  }
  return { gaps, built: [] };
}

// 堀（plan.hori の一つ）から、高さへ混ぜる窪みの関数を作る（docs 1-4）。
// kind：'horikiri'|'karabori'（空堀・堀切。既定）・'tatebori'（竪堀。横に歩けない当たりも置く）・
// 'une'（畝状竪堀。along の線に沿って n 本を並べる）・'mizubori'（水堀。水面も置く）
// 窪みの関数 fn に添えて、底を見る印（tag：'hori' 空堀・堀切／'tate' 竪堀・畝／null 水堀）と
// 深さ（deep）、竪堀の線（lines：[{pts, w}]。横に当たって止まった兵を上下へ回すため）を返す（束21）
function buildHoriInfo(rt, h) {
  const pts = h.pts || (h.a && h.b ? [h.a, h.b] : null);
  if (h.kind === 'mizubori' && pts) return { fn: mizubori(rt, pts, { depth: h.deep, width: h.w, closed: h.closed }).heightAt, tag: null };
  if (h.kind === 'une' && h.along) {
    const along = h.along, n = h.n || 6, spacing = h.spacing || 2.4;
    const [ax, az] = along[0], [bx, bz] = along[along.length - 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const fns = [], lines = [];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      const lp = [[ax + nx * off, az + nz * off], [bx + nx * off, bz + nz * off]];
      const r = tategoriWalls(rt, lp, { depth: h.deep, width: h.w });
      fns.push(r.heightAt); lines.push({ pts: lp, w: h.w ?? 2.6 });
    }
    return { fn: (x, z) => Math.min(0, ...fns.map((f) => f(x, z))), tag: 'tate', deep: h.deep ?? 1.8, lines };
  }
  if (h.kind === 'tatebori' && pts) return { fn: tategoriWalls(rt, pts, { depth: h.deep, width: h.w }).heightAt, tag: 'tate', deep: h.deep ?? 1.8, lines: [{ pts, w: h.w ?? 2.6 }] };
  if (pts) return { fn: horiboriHeight(pts, { depth: h.deep ?? 2, width: h.w ?? 6, closed: h.closed }), tag: 'hori', deep: h.deep ?? 2 };
  return { fn: () => 0, tag: null };
}

// 堀の底にいるか（束21）：窪みが深さの 35% より深い所を「底」とする。'hori'|'tate'|null
function makeHoriAt(infos) {
  const list = infos.filter((h) => h.tag);
  if (!list.length) return null;
  return (x, z) => {
    for (const h of list) if (h.fn(x, z) < -h.deep * 0.35) return h.tag;
    return null;
  };
}

// 虎口（plan.koguchi の一つ）に、実の門を建てる（docs 1-3・5-2）。g.gate が無ければ道の点のままにする（今まで通り）
// g.kind：'masu'（枡形：冠木門→広場→直角に櫓門）・それ以外は単に g.gate（'kabuki'|'yagura'|'tetsu'）の門を一つ
function buildKoguchiGates(rt, plan, o) {
  const objs = {};
  for (const g of plan.koguchi || []) {
    if (!g.at || !g.gate) continue;
    const team = o.gateTeam ?? o.team ?? 1;
    if (g.kind === 'masu') {
      const obj = masugata(rt, g.at[0], g.at[1], g.rot ?? 0, { team, turn: g.turn ?? 1, size: g.size, w1: g.w1, w2: g.w2, fort: !!o.fort, gate: 0 });
      objs[g.id] = obj;
    } else {
      const last = Array.isArray(g.gate) ? g.gate[g.gate.length - 1] : g.gate;
      const fn = last === 'yagura' ? yaguraGate : last === 'tetsu' ? ironGate : kabukiGate;
      objs[g.id] = fn(rt, g.at[0], g.at[1], g.w, g.rot ?? 0, { team });
    }
  }
  return objs;
}

// 櫓（plan.yagura の一つずつ）を建てる（docs 5-2）。y.kind：'sumi'（隅櫓・二段）・既定は物見櫓（一段）
function buildYaguraTowers(rt, plan, o, batch) {
  return (plan.yagura || []).filter((y) => y.at).map((y) => {
    const team = o.towerTeam ?? o.team ?? 1;
    const t = y.kind === 'sumi'
      ? sumiyaguraTower(rt, y.at[0], y.at[1], { rot: y.rot ?? 0, w: y.w, d: y.d, team, stone: y.stone, batch })
      : monomi(rt, y.at[0], y.at[1], { team, name: y.name });
    return { id: y.id, kind: y.kind || 'monomi', ...t };
  });
}

// 城一つを建てる。plan は 6-1 のデータ、o = { baseHeight(x,z), skipWalls: [id,...], buildGates, buildTowers }
// 戻り値 C：kuruwa[id]（test・level・centroid）・height（world.height に渡す関数）・garrison(rt, id, list)
// o.buildGates／o.buildTowers（既定 false）を渡した時だけ、koguchi・yagura から実の門・櫓を建てる
// （稲葉山・木ノ芽峠は自分で手置きしているので、渡さなければ今まで通り何も増えない）
export function buildCastlePlan(rt, plan, o = {}) {
  const measured = o.measure;
  let began = measured ? performance.now() : 0;
  const stamp = (name) => { if (measured) { const now = performance.now(); measured[name] = Math.round(now - began); began = now; } };
  const insideStart = NAKA.list.length;
  const baseFn = o.baseHeight || (() => 0);
  const horiInfos = (plan.hori || []).map((h) => buildHoriInfo(rt, h));
  const horiFns = horiInfos.map((h) => h.fn);
  // 曲輪の段の差：堀の窪みを下地に混ぜてから、曲輪の平ら・切岸を重ねる（docs C2「曲輪の段の差」）
  const baseWithHori = horiFns.length ? (x, z) => horiFns.reduce((hh, f) => hh + f(x, z), baseFn(x, z)) : baseFn;
  const height = heightOf(plan, baseWithHori, o.edgeW);
  const nav = buildNav(plan);
  // 塀・石垣・隅櫓は形がそれぞれ違うので InstancedMesh は使えないが、材質ごとに一つの
  // BatchedMesh へまとめて描く（壊れた時の個別の見た目は struct.mesh のふりをする入れ物で保つ）
  const batch = makeKitBatch();
  const C = {
    plan, height, kuruwa: {}, walls: [], decks: [], towers: [],
    nav, route: (a, b, ro) => navFind(nav, a, b, ro),
    gates: (plan.koguchi || []).map((g) => ({ id: g.id, name: g.name, from: g.from, to: g.to, at: g.at })),
    climb: climbSpots(plan),
    // 門で道の網を切る（castle-fort-system-spec 76 章・束19）：閉じた門（閉・閂）の点を通る辺を使わない。
    // 既定は全部開いた形（今の戦は変わらない）。nawabari.js の K.tick が門の様子を見て呼ぶ
    setGateOpen: (id, open) => setGateOpen(nav, plan, id, open),
    gateOpen: (id) => { const i = nav.alias.get(id); return i == null || !nav.closed.has(i); },
  };
  // 堀の底（束21）：terrain_tags.js の tagAt が world.def.horiAt を見て 'hori' を返す。竪堀の線と道の網は、
  // 横に当たって止まった兵を上下へ回すのに army_move.js が使う。buildCastlePlan を使わない戦は何も置かない
  const wdef = rt.world && rt.world.def;
  if (wdef) {
    wdef.horiAt = makeHoriAt(horiInfos);
    wdef.tateLines = horiInfos.filter((h) => h.tag === 'tate').flatMap((h) => h.lines);
    wdef.castleRoute = C.route;
  }
  stamp('道と堀');
  const share = shareOf(plan, o);
  for (const k of plan.kuruwa) {
    const centroid = polyCenter(k.poly);
    const lvl = typeof k.level === 'function' ? k.level(baseFn) : k.level;
    C.kuruwa[k.id] = { id: k.id, name: k.name, level: lvl, poly: k.poly, centroid, test: (x, z) => inPoly(k.poly, x, z), fallen: false };
    // 石垣の曲輪は、地形を 0.2 低く作った分を床（deck）で本当の高さに戻す（docs 6-2 の②）。
    // 床は矩形しか作れないので、多角形の内に収まる四角（内接の目安）だけを床にする（外の角が宙に浮かないように）
    if (k.stone) {
      const r = k.poly.reduce((s, [px, pz]) => s + Math.hypot(px - centroid.x, pz - centroid.z), 0) / k.poly.length;
      const half = r * 0.7;
      addDeck({ x0: centroid.x - half, x1: centroid.x + half, z0: centroid.z - half, z1: centroid.z + half, y: lvl, name: k.name });
    }
    if (!(o.skipWalls || []).includes(k.id)) C.walls.push(...buildKuruwaWall(rt, k, batch, plan, share, lvl));
    if (k.sakamogi) for (const [sx, sz, rot] of k.sakamogi) rt.scene.add(sakamogi(rt.world, sx, sz, rot, 6));
    else if ((k.wall === 'palisade' || k.wall === 'saku') && !(o.skipWalls || []).includes(k.id) && SETTINGS.quality !== 'low') autoSakamogi(rt, plan, k, batch);
  }
  // 虎口の曲がり：枡形は冠木門→広場→直角に櫓門、それ以外は指定の門を一つ（docs C2）
  stamp('曲輪と塀');
  if (o.buildGates) C.gateObjs = buildKoguchiGates(rt, plan, o);
  stamp('門');
  if (o.buildTowers) C.towers = buildYaguraTowers(rt, plan, o, batch);
  // 櫓門・隅櫓・物見櫓の上の守り（perch.js）：o.perch が false でなければ、城の全戦で置く
  if ((o.buildTowers || o.buildGates) && o.perch !== false && rt.army) makePerchGuards(rt, C, { team: o.towerTeam ?? o.team ?? 1, faction: o.perchFaction });
  stamp('櫓と守り');
  finalizeKitBatch(rt, batch);
  stamp('形をまとめる');
  // 大将の居場所（kaito 10/2）：plan.lordSeat に書くだけで、中に入れる天守か御殿を建てる。
  //   { kind: 'tenshu'|'goten', at: [x, z], rot, w, d（御殿）, b, floors, base（天守）, door（±1：戸口の面）, name, where（任務の札の言い方） }
  //   天守の無い城（安土 1576 より前の土の城）は御殿の奥の間、天守のある城は天守の最上階。C.seat.spot が城主の立ち所（makeLordKeep の spot に渡す）
  if (plan.lordSeat && o.buildSeat !== false && rt.army) {
    const L = plan.lordSeat, team = o.team ?? 1;
    if (L.kind === 'tenshu') {
      const n0 = NAKA.list.length;
      rt.scene.add(tenshu(rt.world, L.at[0], L.at[1], { profile: L.profile, rot: L.rot || 0, b: L.b || 9, floors: L.floors || 3, base: L.base, old: L.old ?? true, stone: L.stone || plan.stone, team, name: L.name || '天守', where: L.where }));
      const I = NAKA.list[n0];
      C.seat = I ? { naka: I, spot: I.lordSpot, where: I.where, team } : null;
    } else {
      const g = goten(rt, L.at[0], L.at[1], { team, w: L.w || 11, d: L.d || 7, rot: L.rot || 0, tile: L.tile ?? false, name: L.name || '主殿', naka: true, door: L.door ?? 1, oku: L.oku, profile: L.profile, where: L.where });
      C.seat = { building: g, naka: g.naka, spot: g.naka.lordSpot, where: g.naka.where, team };
    }
    // 総大将（taisho.js）が城方なら、陣所でなくこの中に籠らせる（戦の定義が自分で城主を置く時は、その定義の makeLordKeep が使う）
    if (C.seat && team === 1) rt.castleSeat = C.seat;
  }
  // 曲輪の暮らし（kaito 10/2「曲輪が空っぽ」）：本丸・二の丸（・三の丸）の縁の内に蔵・番所・井戸・厩、塀の内に幟。
  // 戦の側の小屋・兵がそろった後に置く（setTimeout 0）。o.life === false で置かない
  if (o.life !== false && rt.army) setTimeout(() => autoKuruwaLife(rt, plan, C, o), 0);
  // 攻め手の梯子（o.ladders）：塀・切岸に梯子を掛け、自分も味方の兵も登れる。戦の組み立て（床の作り直し）が済んだ後に置く
  if (o.ladders) setTimeout(() => { const t = measured ? performance.now() : 0; C.ladders = castleLadders(rt, C, typeof o.ladders === 'object' ? o.ladders : {}); if (measured) measured['梯子'] = Math.round(performance.now() - t); }, 0);
  // 竹束（taketaba.js）：plan.taba に置き場の列を書くだけで、寄せ手の側に竹束が出る（docs「6. 竹束」）
  if (plan.taba && plan.taba.length) { placeFromSpots(rt, plan.taba, o.tabaTeam ?? 0); patchGunCover(rt); }
  for (let j = insideStart; j < NAKA.list.length; j++) {
    const I = NAKA.list[j];
    makeInteriorGuards(rt, I, { team: I.kind === 'gate' ? o.gateTeam ?? o.team ?? 1 : I.kind === 'yagura' ? o.towerTeam ?? o.team ?? 1 : o.team ?? 1, faction: o.perchFaction });
  }
  stamp('館と室内の守り');
  return C;
}

// ======================================================================
// 砦の分：道の網（C.nav）・口の登録・登れる所・攻めのルート（docs/siege-plan.md F1）
// 砦は「場（本陣・外郭など）」を plan.kuruwa（id・name・poly・level は城と同じ形）にそのまま書けばよい。
// 口（木戸・虎口）は plan.koguchi（id・name・at:[x,z]）、道は plan.paths（pts:[[x,z],...]）。
// C.route(名かid, 名かid) で、その間の点の並び（[[x,z],...]）を返す（小さな A*。点は一つの砦で 60 以下）。
// ======================================================================

// 場（kuruwa）の中心・口（koguchi）の位置・道（paths）の点をつないだ、名で引ける点の網を作る
export function buildNav(plan) {
  const pts = [];          // [{x,z}]
  const adj = [];          // adj[i] = [[j, 距離], ...]
  const alias = new Map(); // 名か id -> 点の番号
  const byKey = new Map(); // 座標の丸め -> 点の番号（同じ場所の点を一つにまとめる）
  const keyOf = (x, z) => `${Math.round(x * 5)}:${Math.round(z * 5)}`;
  function node(x, z) {
    const k = keyOf(x, z);
    if (byKey.has(k)) return byKey.get(k);
    const i = pts.length;
    pts.push({ x, z });
    adj.push([]);
    byKey.set(k, i);
    return i;
  }
  function link(i, j) {
    if (i === j) return;
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
    adj[i].push([j, d]);
    adj[j].push([i, d]);
  }
  function nearAlias(x, z, within) {
    let best = -1, bd = within;
    for (const i of alias.values()) {
      const d = Math.hypot(pts[i].x - x, pts[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // 場（曲輪・本陣・外郭）の真ん中を、id と名の両方で引けるように登録
  for (const k of plan.kuruwa || []) {
    const c = polyCenter(k.poly);
    const i = node(c.x, c.z);
    if (k.id) alias.set(k.id, i);
    if (k.name) alias.set(k.name, i);
  }
  // 口（虎口・木戸）の登録
  for (const g of plan.koguchi || []) {
    if (!g.at) continue;
    const i = node(g.at[0], g.at[1]);
    if (g.id) alias.set(g.id, i);
    if (g.name) alias.set(g.name, i);
  }
  // 道：pts を鎖につなぐ。端が場・口の近く（8m 以内）ならそこへ繋ぎ、無ければそこに口（名の無い点）を作る
  const SNAP = 8;
  for (const p of plan.paths || []) {
    let prev = -1;
    for (let n = 0; n < p.pts.length; n++) {
      const [x, z] = p.pts[n];
      let i = (n === 0 || n === p.pts.length - 1) ? nearAlias(x, z, SNAP) : -1;
      if (i < 0) i = node(x, z);
      if (prev >= 0) link(prev, i);
      prev = i;
    }
  }
  return { pts, adj, alias, closed: new Set() };
}

// 門（plan.koguchi の id か名）の点を開ける・閉める。閉じた点は、始まりと終わりでなければ通らない
function setGateOpen(nav, plan, id, open) {
  const i = nav.alias.get(id);
  if (i == null) return false;
  if (open) nav.closed.delete(i); else nav.closed.add(i);
  return true;
}

// 小さな A*（距離だけを足す・点 60 以下の網なので総当たりで十分軽い）
// ro.ignoreGates：閉じた門も通れる事にする（攻め手が「破って通る」道を引く時）
function navFind(nav, a, b, ro) {
  const from = nav.alias.get(a), to = nav.alias.get(b);
  if (from == null || to == null || !nav.pts.length) return [];
  const n = nav.pts.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const [v, w] of nav.adj[u]) {
      if (v !== to && nav.closed.size && nav.closed.has(v) && !(ro && ro.ignoreGates)) continue;
      const nd = dist[u] + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return [];
  const out = [];
  for (let c = to; c >= 0; c = prev[c]) { out.unshift([nav.pts[c].x, nav.pts[c].z]); if (c === from) break; }
  return out;
}

// 登れる所：物見櫓（plan.yagura）の場所を登録するだけ（形を建てるのは castles/*.js・F2 の側）
function climbSpots(plan) {
  return (plan.yagura || []).map((y, i) => ({ id: y.id || `yagura${i}`, kind: y.kind || 'monomi', at: y.at, garrison: y.garrison || null }));
}

// ======================================================================
// 砦の型の縄張り（docs/fort-spec.md 4 章：河川・街道・峠・森・陣城）。
// buildCastlePlan(rt, plan, o) へそのまま渡せる形（kuruwa・koguchi・paths・hori・yagura）を返すだけで、
// 兵の配置・戦の筋は戦の定義（b_*.js）か castles/*.js のデータの側（docs/siege-plan.md F2 の持ち場）。
// ======================================================================
export function rectPoly(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

// 河川砦：道が川で断たれ、橋を渡る所だけが口（fort-spec 4・22）。橋は koguchi の一つとして登録し、
// 戦の定義の側で props.js の橋・火を使って「壊せる橋」にする（この関数は場と道のデータだけを作る）
export function riverFortPlan(o = {}) {
  const { bridgeZ = 0, bridgeW = 6, w = 40, honjinD = 22, name = '河川砦' } = o;
  return {
    name,
    kuruwa: [
      { id: 'kishi', name: '岸の広場', poly: rectPoly(-w / 2, w / 2, bridgeZ - 12, bridgeZ + 10), level: 0, wall: 'dobei', gapAt: [0, bridgeZ - 12] },
      // 本陣は岸の広場の奥の塀にじかに接して柵で囲う（前は間が空いて、塀の外から本陣へ回り込めた。kaito 10/1）。
      // 岸の広場と本陣の間の口（5m）は、分け合う縁なので castle_plan が両方の塀を切る
      { id: 'honjin', name: '本陣', poly: rectPoly(-w / 2 + 6, w / 2 - 6, bridgeZ + 10, bridgeZ + 14 + honjinD), level: 0.3, wall: 'palisade', gapAt: [0, bridgeZ + 10] },
    ],
    koguchi: [{ id: 'hashi', name: '橋', at: [0, bridgeZ] }],
    paths: [{ pts: [[0, bridgeZ - 60], [0, bridgeZ - 12], [0, bridgeZ], [0, bridgeZ + 14], [0, bridgeZ + 14 + honjinD]] }],
    hori: [{ kind: 'mizubori', pts: [[-w / 2 - 8, bridgeZ], [w / 2 + 8, bridgeZ]], deep: 2.2, w: 14, closed: false }],
    river: { z: bridgeZ, bridgeAt: [0, bridgeZ], bridgeW },
  };
}

// 街道砦：街道を正面から塞ぐ。柵→門→狭い通路→内部広場（fort-spec 4）
export function roadFortPlan(o = {}) {
  const { len = 90, w = 26, name = '街道砦' } = o;
  return {
    name,
    kuruwa: [
      { id: 'kado', name: '門の内', poly: rectPoly(-w / 2, w / 2, -14, 14), level: 0, wall: 'dobei', gapAt: [0, -14] },
      { id: 'naka', name: '内部広場', poly: rectPoly(-w / 2 + 4, w / 2 - 4, 14, len * 0.6), level: 0 },
      { id: 'honjin', name: '本陣', poly: rectPoly(-w / 2 + 8, w / 2 - 8, len * 0.6, len), level: 0.25 },
    ],
    koguchi: [{ id: 'mon', name: '表門', at: [0, -14] }],
    paths: [{ pts: [[0, -len], [0, -14], [0, 14], [0, len * 0.6], [0, len]] }],
    yagura: [{ id: 'monomi', at: [w / 2 - 4, 0] }],
  };
}

// 峠砦：峠道の最も狭い所を柵で断ち切る。両脇は崖か急斜面（fort-spec 4・18：地形が砦より強い）
export function passFortPlan(o = {}) {
  const { len = 150, saddle = 0, w = 20, name = '峠砦' } = o;
  return {
    name,
    kuruwa: [
      { id: 'toge', name: '峠口', poly: rectPoly(-w / 2, w / 2, saddle - 16, saddle + 16), level: 0.1, wall: 'palisade', gapAt: [0, saddle - 16] },
      { id: 'honjin', name: '本陣', poly: rectPoly(-w / 2 + 4, w / 2 - 4, saddle + 20, saddle + 56), level: 0.3 },
    ],
    koguchi: [{ id: 'kido', name: '木戸', at: [0, saddle - 16] }],
    paths: [{ pts: [[0, saddle - len / 2], [0, saddle], [0, saddle + 20], [0, saddle + 56]] }],
    yagura: [{ id: 'monomiL', at: [-w / 2 - 2, saddle] }, { id: 'monomiR', at: [w / 2 + 2, saddle] }],
  };
}

// 森林砦：周りを森（groves）に囲まれ、見通しが悪い。伏兵が置きやすい（fort-spec 4・23・24）
export function forestFortPlan(o = {}) {
  const { r = 50, name = '森林砦', groveR = 60 } = o;
  return {
    name,
    kuruwa: [
      { id: 'honjin', name: '本陣', poly: rectPoly(-r * 0.4, r * 0.4, -r * 0.4, r * 0.4), level: 0.2, wall: 'palisade', gapAt: [0, -r * 0.4] },
    ],
    koguchi: [{ id: 'kido', name: '木戸', at: [0, -r * 0.4] }],
    paths: [{ pts: [[0, -r * 1.6], [0, -r * 0.4], [0, 0]] }],
    groves: [{ x: 0, z: 0, r: groveR }],   // 戦の定義の側で world.def.groves に混ぜ、森の見通し減（siege_vis.js）を効かせる
  };
}

// ======================================================================
// 城主の居所（kaito 10/1）：城主は本丸の天守か御殿の、いちばん上の床にいて、旗本に守られる。
// 攻め手がその床へ上がる（spot から reachR の内・同じ高さ）までは討てない（狙われず、傷も残らない）。
// 上がる口（天守の梯子の足もと・御殿の縁側）には旗本を立たせる。天守の無い頃の城は御殿の中に置く。
// o: { name, spot:{x,z}, facing, mouth:{x,z}（旗本の立つ上がり口）, guardN（既定 6）, reachR（既定 3.5）,
//      team（既定 1）, foeTeam（既定 0）, faction, armor, flag, hat, haori, onReach() }
// 戻り値 K：K.lord（城主の兵）・K.guard（旗本の隊）・K.reached・K.down（討たれたか）・K.tick()（毎コマ）
// ======================================================================
export function makeLordKeep(rt, o) {
  const A = rt.army, W = rt.world;
  const team = o.team ?? 1, foe = o.foeTeam ?? 0, R = o.reachR ?? 3.5;
  // 中に入れる建物（naka.js）の内なら、城主は最上階（御殿は奥の間）の奥。近習が階ごとに守り、上がり口の外を旗本が守る
  const I = o.naka || (o.spot ? nakaFind(o.spot.x, o.spot.z) : null);
  if (I && rt.castleSeat && rt.castleSeat.naka === I) rt.castleSeat.used = true;   // 定義が自分で城主を置いた（taisho.js は動かさない）
  const spot = I ? { x: I.lordSpot.x, z: I.lordSpot.z } : { x: o.spot.x, z: o.spot.z };
  spot.y = I ? I.lordSpot.y : groundAt(W, spot.x, spot.z, 999);   // いちばん上の床（天守の最上階・御殿の床）
  const look = { armor: o.armor, flag: o.flag };
  // o.lordUnit：もういる大将（陣所の大将など。taisho.js が城の中へ移す）。無ければここで出す
  let lordG, lord;
  if (o.lordUnit) {
    lord = o.lordUnit; lordG = lord.group || A.addGroup({ team, faction: o.faction, name: `${o.name}の居所`, order: 'hold', anchor: { x: spot.x, z: spot.z }, morale: 100, aggro: 2, noRout: true });
    lordG.anchor = { x: spot.x, z: spot.z }; lordG.order = 'hold'; lordG.aggro = 2;
    lord.pos.x = spot.x; lord.pos.z = spot.z; if (lord.mesh) lord.mesh.position.set(spot.x, spot.y, spot.z);
  } else {
    lordG = A.addGroup({ team, faction: o.faction, name: `${o.name}の居所`, order: 'hold', anchor: { x: spot.x, z: spot.z }, facing: o.facing ?? 0, morale: 100, aggro: 2, noRout: true });
    A.spawn(lordG, [{ type: 'busho', n: 1, o: { x: spot.x, z: spot.z, heading: o.facing ?? 0, name: o.name, hat: o.hat, haori: o.haori, ...look } }]);
    lord = lordG.units[0];
  }
  if (lord) { lord.pos.y = spot.y; lord.keep = true; lordG.leader = lord; }
  const m = I ? I.doorOut : (o.mouth || spot);
  const guard = A.addGroup({ team, faction: o.faction, name: `${o.name}の旗本`, order: 'hold', anchor: { x: m.x, z: m.z }, facing: o.facing ?? 0, morale: 100, aggro: 7, width: 5, noRout: true });
  A.spawn(guard, [{ type: 'samurai', n: I ? Math.max(3, (o.guardN ?? 6) - 2) : (o.guardN ?? 6), o: { ...look } }]);
  // 近習：建物の中の階ごと（御殿は奥の間の口）に二人ずつ。その階の床に立たせる（units.js が床の高さを保つ）
  const kin = I ? makeInteriorGuards(rt, I, { team, faction: o.faction, ...look }) : [];
  if (I) {
    const Ls = I.levels;
    // 踏み込んだ時の台詞と、上の階へ上がった時の台詞（同じ文は一度だけ）
    I.onEnter = (rt2) => {
      rt2.say(`${o.name}の近習`, '曲者じゃ。殿をお守りせよ', 3);
      if (rt2.bark) rt2.bark(Ls.length > 1 ? `${o.name}は上の階。階段を上れ` : `${o.name}は奥の間にいる`);
    };
    if (Ls.length > 1) I.onLevel = (rt2, I2, k) => { if (k === Ls.length - 1) rt2.say(o.name, 'ここまで上がって来たか。相手になろう', 3); };
  }
  const hp0 = lord ? lord.hp : 0;
  const K = {
    lord, guard, spot, reached: false, kin, naka: I, where: I ? I.where : null,
    // 任務の印の行き先（中に入れる建物は、戸口→階段→奥の間→城主と一歩ずつ指す）
    guide: I ? nakaGuide(I, () => (lord && lord.alive ? lord.pos : null)) : () => (lord && lord.alive ? lord.pos : null),
    get down() { return !lord || !lord.alive; },
    tick() {
      if (!lord || !lord.alive || K.reached) return;
      // 上がるまでは居所から動かさず、狙わせず、傷も残さない（下から撃たれても倒れない）
      lord.noTarget = true;
      if (lord.hp < hp0) lord.hp = hp0;
      lord.pos.x = spot.x; lord.pos.z = spot.z; lord.pos.y = spot.y;
      if (lord.vel) { lord.vel.x = 0; lord.vel.z = 0; }
      let up = false;
      A.forNear(spot.x, spot.z, R, (u) => {
        if (!up && u.alive && u.team === foe && !u.isStruct && Math.abs((u.pos.y || 0) - spot.y) < 1.3) up = true;
      });
      if (up) {
        K.reached = true;
        lord.noTarget = false;
        lordG.aggro = 6;
        if (o.onReach) o.onReach();
      }
    },
  };
  return K;
}

// 陣城（攻め手の付城・包囲の前線基地。fort-spec 35・36：三木の付城・鳥取の太閤ヶ平・岩村の水晶山）。
// 柵・土塁・物見櫓だけの簡素な一区画。本陣を見下ろす高所に置く想定（level は呼び手が o.level で渡す）
export function jinshiroFortPlan(o = {}) {
  const { r = 34, name = '陣城', level = 0.4 } = o;
  return {
    name,
    kuruwa: [
      { id: 'honjin', name: '陣', poly: rectPoly(-r, r, -r, r), level, wall: 'dobei', gapAt: [0, -r] },
    ],
    koguchi: [{ id: 'kido', name: '木戸', at: [0, -r] }],
    paths: [{ pts: [[0, -r * 3], [0, -r]] }],
    yagura: [{ id: 'monomi', at: [0, r * 0.5] }],
  };
}

// 兵を置く：曲輪の真ん中に、渡された名簿（bhelp の list と同じ形）で敵の隊を作る
export function garrisonKuruwa(rt, enemyGroupFn, C, id, faction, list, o = {}) {
  const k = C.kuruwa[id];
  if (!k) return null;
  return enemyGroupFn(rt, { faction, name: (o.name || k.name + 'の守り'), anchor: { x: k.centroid.x, z: k.centroid.z }, facing: o.facing ?? 0, order: 'hold', aggro: o.aggro ?? 12, width: o.width ?? 8, morale: o.morale ?? 90, fleeDir: o.fleeDir || { x: 0, z: -1 }, dmgMult: o.dmgMult ?? 0.7 }, list);
}
