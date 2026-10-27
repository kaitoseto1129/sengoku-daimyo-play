// ======================================================================
// 城の小さな建物と櫓の種類（castle_bldg.js）
// 本の CG（reports/ref/cg：春日山・清洲・岡崎・小田原・長浜・躑躅ヶ崎）は、曲輪の縁に沿って
// 小さな板葺きの建物がびっしり並ぶ（長屋・小屋・蔵・台所・遠侍・馬屋）。櫓も井楼だけでなく、
// 隅櫓・物見・高櫓と形が違う。ここではそれを曲輪の縄張りから自動で並べる。
// 形は箱と三角の柱だけ・材質は城の kit（板・下見板・土壁・鉄）を使い回し、城ひとつの束へ積む
// （描く回数は材質の数のまま。建物の数では増えない）。真ん中は戦う場として空ける。
// ======================================================================
import * as THREE from 'three';
import { kitBuild, solidRect, SOLIDS, makeKitBatch, finalizeKitBatch } from './props.js';

const Lr = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function polyArea(poly) {
  let a = 0; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; a += ax * bz - bx * az; }
  return Math.abs(a) / 2;
}
function centroid(poly) {
  let x = 0, z = 0; for (const [px, pz] of poly) { x += px; z += pz; }
  return { x: x / poly.length, z: z / poly.length };
}

function hitSolid(px, pz) {
  for (const q of SOLIDS) {
    if (q.x1 == null || px < q.x0 || px > q.x1 || pz < q.z0 || pz > q.z1) continue;
    if (q.k === 'r') { const dx = px - q.x, dz = pz - q.z; if (Math.abs(dx * q.c - dz * q.s) < q.hw && Math.abs(dx * q.s + dz * q.c) < q.hd) return true; }
    else if (q.k === 'c') { if (Math.hypot(px - q.x, pz - q.z) < q.r) return true; }
    else if (q.k === 's') { if (segDist(px, pz, q.ax, q.az, q.bx, q.bz) < q.r + 0.15) return true; }
    else return true;
  }
  return false;
}
// 切妻の妻（三角の柱）。幅 d・高さ rh・長さ w の形を一つ作って使い回す（置く時は複製して動かす）
const GABLE = new Map();
function gableGeo(w, d, rh) {
  const key = `${w.toFixed(1)}:${d.toFixed(1)}:${rh.toFixed(2)}`;
  let g = GABLE.get(key);
  if (!g) {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, rh); s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    GABLE.set(key, g);
  }
  return g.clone();
}

// 板葺きの切妻屋根（軒の出 e・押さえ木）。y は軒桁の上
function boardRoof(B, kbox, paint, vary, x, y, z, w, d, rh, rot, tone, seed, e = 0.55) {
  const half = d / 2 + e, slope = Math.atan2(rh, d / 2), len = half / Math.cos(slope);
  for (const sd of [-1, 1]) {
    const g = new THREE.BoxGeometry(w + e * 2, 0.1, len);
    g.rotateX(sd * slope); g.translate(0, rh - half * Math.tan(slope) / 2 + 0.05, sd * half / 2);
    g.rotateY(rot); g.translate(x, y, z); B.wood.push(paint(g, vary(tone, seed + sd)));
    // 押さえ木（板屋根を押さえる横木）
    const [px, pz] = Lr(x, z, rot)(0, sd * d * 0.22);
    kbox(B.wood, 0x3b3127, px, y + rh * 0.56 + 0.1, pz, w + e * 2, 0.08, 0.1, rot);
  }
  kbox(B.wood, 0x3a3026, x, y + rh + 0.08, z, w + e * 2 + 0.1, 0.14, 0.2, rot);
}

// 四方の貫（横木）だけを一周（床の板にしない）
function ring(B, kbox, P, x, y, a, rot, hex) {
  for (const [lx, lz, w, d] of [[0, a, 2 * a + 0.3, 0.1], [0, -a, 2 * a + 0.3, 0.1], [a, 0, 0.1, 2 * a + 0.3], [-a, 0, 0.1, 2 * a + 0.3]]) {
    const [px, pz] = P(lx, lz); kbox(B.wood, hex, px, y, pz, w, 0.12, d, rot);
  }
}
// 一棟（前は +z＝曲輪の内）。kind：koya・nagaya・kura・daidokoro・tozamurai・umaya
const KINDS = {
  koya: { w: 4.2, d: 3.2, H: 2.0, rh: 1.1 },
  nagaya: { w: 11, d: 3.6, H: 2.2, rh: 1.3 },
  kura: { w: 3.6, d: 3.0, H: 2.6, rh: 1.1 },
  daidokoro: { w: 6.6, d: 4.6, H: 2.5, rh: 1.6 },
  tozamurai: { w: 8.6, d: 5.6, H: 2.7, rh: 1.9 },
  umaya: { w: 9.0, d: 3.8, H: 2.3, rh: 1.3 },
};
function building(batch, kind, x, y, z, rot, w, seed, foot) {
  const K = KINDS[kind], d = K.d, H = K.H, rh = K.rh;
  return kitBuild(batch, (B, kbox, paint, vary) => {
    const P = Lr(x, z, rot);
    // 根石と土台（傾いた地面に沈める）
    kbox(B.wood, 0x3a3026, x, y + 0.12 - foot / 2, z, w + 0.12, 0.24 + foot, d + 0.12, rot);
    const tone = kind === 'tozamurai' ? 0x9a8468 : vary(0x8f7a60, seed);
    if (kind === 'kura') {
      // 土壁の蔵：腰は下見板、上は土壁。小さな窓と黒い戸
      kbox(B.wood, 0x4a3f33, x, y + 0.24 + 0.55, z, w, 1.1, d, rot, 2);
      kbox(B.tsuchi, vary(0xa8957a, seed), x, y + 0.24 + 1.1 + (H - 1.1) / 2, z, w - 0.04, H - 1.1, d - 0.04, rot);
      const [dx, dz] = P(0, d / 2 + 0.03); kbox(B.iron, 0x1b1915, dx, y + 1.25, dz, 1.0, 1.9, 0.06, rot);
      const [wx, wz] = P(-w / 2 - 0.03, 0); kbox(B.iron, 0x1b1915, wx, y + H - 0.35, wz, 0.06, 0.4, 0.6, rot);
    } else {
      kbox(B.wood, tone, x, y + 0.24 + H / 2, z, w, H, d, rot, 2);
      // 柱（四隅と長い壁の途中）
      const bays = Math.max(1, Math.round(w / 1.9));
      for (let i = 0; i <= bays; i++) for (const sz of [-1, 1]) {
        if (i > 0 && i < bays && sz < 0 && kind !== 'nagaya') continue;
        const [px, pz] = P(-w / 2 + i * w / bays, sz * d / 2);
        kbox(B.wood, 0x3d3226, px, y + 0.24 + H / 2, pz, 0.16, H, 0.16, rot);
      }
      // 戸口と窓（長屋は間ごとに戸）
      const doors = kind === 'nagaya' ? Math.max(2, Math.floor(w / 2.8)) : kind === 'umaya' ? 0 : 1;
      for (let i = 0; i < doors; i++) {
        const lx = doors === 1 ? -w * 0.18 : -w / 2 + (i + 0.5) * w / doors - 0.45;
        const [dx, dz] = P(lx, d / 2 + 0.03); kbox(B.iron, 0x1e1a15, dx, y + 0.24 + 0.85, dz, 0.85, 1.7, 0.05, rot);
        const [wx, wz] = P(lx + 1.0, d / 2 + 0.03); if (Math.abs(lx + 1.0) < w / 2 - 0.4) kbox(B.wood, 0x2a241d, wx, y + 0.24 + 1.35, wz, 0.6, 0.45, 0.05, rot);
      }
      if (kind === 'umaya') {
        // 馬屋：前は開け、馬栓棒の横木を二段
        for (const hy of [0.8, 1.25]) { const [mx, mz] = P(0, d / 2 + 0.1); kbox(B.wood, 0x4a3a2a, mx, y + 0.24 + hy, mz, w - 0.3, 0.08, 0.08, rot); }
        const [ox, oz] = P(0, d / 2 + 0.02); kbox(B.iron, 0x15120f, ox, y + 0.24 + 1.0, oz, w - 0.4, 1.4, 0.03, rot);
      }
      if (kind === 'tozamurai') {
        // 遠侍：縁と庇
        const [ex, ez] = P(0, d / 2 + 0.55); kbox(B.wood, 0x5a4a38, ex, y + 0.55, ez, w, 0.12, 1.0, rot);
        kbox(B.wood, 0x4a3d2f, ex, y + 0.24 + H - 0.05, ez, w + 0.4, 0.08, 1.4, rot);
      }
    }
    // 軒桁と妻、板葺きの屋根
    kbox(B.wood, 0x3d3226, x, y + 0.24 + H, z, w + 0.2, 0.16, d + 0.2, rot);
    const ry = y + 0.24 + H + 0.08;
    const gg = gableGeo(w, d, rh); gg.rotateY(rot); gg.translate(x, ry, z); B.wood.push(paint(gg, vary(0x8a765c, seed + 3)));
    boardRoof(B, kbox, paint, vary, x, ry, z, w, d, rh, rot, kind === 'kura' ? 0x6a6156 : 0x766a5a, seed);
    if (kind === 'daidokoro') {
      // 台所の煙出し（棟の上の小屋根）
      kbox(B.wood, 0x4a3f33, x, ry + rh + 0.3, z, 1.4, 0.5, 0.9, rot);
      kbox(B.wood, 0x3a3127, x, ry + rh + 0.62, z, 1.8, 0.1, 1.4, rot);
    }
  });
}

// 櫓の種類（kind）：sumi＝隅櫓（二重・板張り）・monomi＝物見（四本柱の台と小屋根）・taka＝高櫓（下は柱、上は板囲い）
function tower(batch, kind, x, y, z, rot, seed) {
  return kitBuild(batch, (B, kbox, paint, vary) => {
    const P = Lr(x, z, rot);
    if (kind === 'sumi') {
      const w = 5.2, H1 = 3.4, w2 = 3.8, H2 = 2.3;
      kbox(B.wood, 0x3a3026, x, y - 0.3, z, w + 0.3, 0.9, w + 0.3, rot);
      kbox(B.wood, vary(0x857360, seed), x, y + 0.15 + H1 / 2, z, w, H1, w, rot, 2);
      // 腰の庇（四方の板屋根）
      for (const [lx, lz, rw, rd, ax] of [[0, w / 2 + 0.45, w + 1.6, 1.2, 1], [0, -w / 2 - 0.45, w + 1.6, 1.2, -1], [w / 2 + 0.45, 0, 1.2, w + 1.6, 2], [-w / 2 - 0.45, 0, 1.2, w + 1.6, -2]]) {
        const g = new THREE.BoxGeometry(rw, 0.1, rd);
        if (Math.abs(ax) === 1) g.rotateX(ax * 0.45); else g.rotateZ(-Math.sign(ax) * 0.45);
        const [px, pz] = P(lx, lz); g.rotateY(rot); g.translate(px, y + H1 + 0.05, pz); B.wood.push(paint(g, 0x52483b));
      }
      kbox(B.wood, vary(0x8c7a64, seed + 1), x, y + H1 + 0.55 + H2 / 2, z, w2, H2, w2, rot, 2);
      // 狭間（三角と四角）と武者窓
      for (const sd of [-1, 1]) for (let i = -1; i <= 1; i++) {
        const [px, pz] = P(i * 1.4, sd * (w / 2 + 0.03));
        kbox(B.iron, 0x14110e, px, y + 1.4, pz, 0.28, i % 2 ? 0.28 : 0.4, 0.05, rot);
        const [qx, qz] = P(sd * (w / 2 + 0.03), i * 1.4);
        kbox(B.iron, 0x14110e, qx, y + 1.4, qz, 0.05, 0.3, 0.3, rot);
      }
      for (const sd of [-1, 1]) { const [px, pz] = P(0, sd * (w2 / 2 + 0.03)); kbox(B.wood, 0x231d17, px, y + H1 + 0.55 + H2 * 0.55, pz, 1.6, 0.5, 0.05, rot); }
      const ry = y + H1 + 0.55 + H2 + 0.08;
      kbox(B.wood, 0x3d3226, x, ry - 0.08, z, w2 + 0.2, 0.16, w2 + 0.2, rot);
      const gg = gableGeo(w2, w2, 1.5); gg.rotateY(rot); gg.translate(x, ry, z); B.wood.push(paint(gg, 0x5d4f3e));
      boardRoof(B, kbox, paint, vary, x, ry, z, w2, w2, 1.5, rot, 0x4f4538, seed, 0.75);
      return;
    }
    if (kind === 'monomi') {
      // 物見：四本柱の上に手すり付きの台、小さな切妻屋根。下は筋交い
      const a = 1.25, T = 4.8;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * a, sz * a); kbox(B.wood, 0x7a6a56, px, y + (T + 2.1) / 2 - 0.4, pz, 0.2, T + 2.5, 0.2, rot); }
      for (const hy of [1.6, 3.2]) ring(B, kbox, P, x, y + hy, a, rot, 0x6a5a48);
      kbox(B.wood, 0x5d4f3e, x, y + T, z, 3.2, 0.16, 3.2, rot);
      for (const [lx, lz, ww, dd] of [[0, 1.55, 3.2, 0.08], [0, -1.55, 3.2, 0.08], [1.55, 0, 0.08, 3.2], [-1.55, 0, 0.08, 3.2]]) {
        const [px, pz] = P(lx, lz); kbox(B.wood, 0x5a4c3b, px, y + T + 0.5, pz, ww, 0.9, dd, rot, 2);
      }
      const ry = y + T + 2.1;
      kbox(B.wood, 0x3d3226, x, ry - 0.08, z, 2.8, 0.14, 2.8, rot);
      boardRoof(B, kbox, paint, vary, x, ry, z, 2.6, 2.6, 0.9, rot, 0x50463a, seed, 0.45);
      return;
    }
    // 高櫓：下 5m は柱と貫、上は板囲いの見張り部屋（窓）、板葺きの切妻
    const a = 1.6, T = 5.2, H = 2.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * a, sz * a); kbox(B.wood, 0x7a6a56, px, y + T / 2 - 0.3, pz, 0.24, T + 0.6, 0.24, rot); }
    for (const hy of [1.2, 2.6, 4.0]) ring(B, kbox, P, x, y + hy, a, rot, 0x6a5a48);
    kbox(B.wood, 0x5d4f3e, x, y + T, z, 2 * a + 0.5, 0.16, 2 * a + 0.5, rot);
    kbox(B.wood, vary(0x8a7862, seed), x, y + T + H / 2, z, 2 * a + 0.5, H, 2 * a + 0.5, rot, 2);
    for (const sd of [-1, 1]) {
      const [px, pz] = P(0, sd * (a + 0.28)); kbox(B.iron, 0x16130f, px, y + T + H * 0.6, pz, 1.8, 0.45, 0.05, rot);
      const [qx, qz] = P(sd * (a + 0.28), 0); kbox(B.iron, 0x16130f, qx, y + T + H * 0.6, qz, 0.05, 0.45, 1.8, rot);
    }
    const ry = y + T + H + 0.08;
    kbox(B.wood, 0x3d3226, x, ry - 0.08, z, 2 * a + 0.7, 0.16, 2 * a + 0.7, rot);
    const gg = gableGeo(2 * a + 0.5, 2 * a + 0.5, 1.3); gg.rotateY(rot); gg.translate(x, ry, z); B.wood.push(paint(gg, 0x5d4f3e));
    boardRoof(B, kbox, paint, vary, x, ry, z, 2 * a + 0.5, 2 * a + 0.5, 1.3, rot, 0x4f4538, seed, 0.6);
  });
}

// 曲輪に入れない物（町・寺・堀・木戸の札など）
const SKIP = /machi|temple|tera|town|hori|kido|gate|kishi|hashi|mon$|_mon|ote$|road|michi|hondo|oku$|todo|sakamoto|hiyoshi/;

// 城ひとつの曲輪の縁に、小さな建物を並べ、角に櫓の種類を混ぜる。batch は城の kit の入れ物
// 戻り値：{ bldg, towers }（数）
export function denseCastle(rt, plan, C, batch, o = {}) {
  const W = rt.world; if (!W || !rt.scene) return { bldg: 0, towers: 0 };
  let sd = ((plan.seed ?? 0) * 97 + (plan.name ? plan.name.length * 131 : 7) + 13) >>> 0;
  const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const mouths = (plan.koguchi || []).filter((g) => g.at).map((g) => g.at);
  for (const k of plan.kuruwa) if (k.gapAt) for (const g of (Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt])) mouths.push(g);
  const paths = (plan.paths || []).map((p) => p.pts || []);
  const avoid = [...(plan.yagura || []).filter((y) => y.at).map((y) => [y.at[0], y.at[1], 6]), ...(plan.lordSeat ? [[plan.lordSeat.at[0], plan.lordSeat.at[1], 10]] : [])];
  const placed = [], why = {}, byK = {};
  let curWays = [], wayPad = 3.5, mouthPad = 5;
  const no = (w) => { why[w] = (why[w] || 0) + 1; return null; };
  const free = (poly, x, z, w, d, rot, clearC, clearR) => {
    const c = Math.cos(rot), s = Math.sin(rot), r = Math.hypot(w, d) / 2;
    const hs = [];
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (!inPoly(poly, px, pz)) return no('poly');
      hs.push(W.heightAt(px, pz));
    }
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 1.1) return no('slope');
    if (clearR && Math.hypot(x - clearC.x, z - clearC.z) < clearR + r * 0.3) return no('center');
    if (mouths.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < r + mouthPad)) return no('mouth');
    if (curWays.some(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) < r * 0.75 + wayPad)) return no('way');
    if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < r + ar)) return no('avoid');
    for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) if (segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < r * 0.75 + 1.4) return no('path');
    // 当たりは形どおりに見る（斜めの塀の外接の四角で、縁の内を丸ごと捨てない）
    const nx = Math.max(2, Math.ceil(w / 1.5)), nz = Math.max(2, Math.ceil(d / 1.5));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const lx = -w / 2 + w * i / nx, lz = -d / 2 + d * j / nz;
      if (hitSolid(x + lx * c + lz * s, z - lx * s + lz * c)) return no('solid');
    }
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.82)) return no('placed');
    let near = false;
    if (rt.army?.forNear) rt.army.forNear(x, z, r + 1.5, (u) => {
      if (!u.alive || u.isStruct) return;
      const dx = u.pos.x - x, dz = u.pos.z - z;
      if (Math.abs(dx * c - dz * s) < w / 2 + 1.2 && Math.abs(dx * s + dz * c) < d / 2 + 1.2) near = true;
    });
    return near ? no('unit') : lo;
  };
  const cap = o.cap ?? 90;
  let nB = 0, nT = 0;
  const ita = (plan.year ?? 1575) <= 1582 && plan.name !== '安土城';
  void ita;
  // 大きい曲輪から順に
  const list = plan.kuruwa.filter((k) => k.poly && k.poly.length >= 3 && k.dense !== false && (k.dense === true || (!SKIP.test(String(k.id || '')) && !SKIP.test(String(k.kind || '')))))   // dense: true は名で外さない（野田の岸の広場など）
    .map((k) => ({ k, area: polyArea(k.poly), c: centroid(k.poly) })).filter((e) => e.area >= 140).sort((a, b) => b.area - a.area);
  const towerKinds = ['sumi', 'monomi', 'taka', 'monomi', 'sumi'];
  const towerCap = Math.min(o.towerCap ?? 6, Math.max(1, Math.round(list.length * 0.8)));
  let ti = Math.floor(R() * 3);
  for (const { k, area, c } of list) {
    if (nB >= cap) break;
    const poly = k.poly;
    // 口から曲輪の中ほど、口と口の間は通り道として空ける（兵と自分が門から奥へ抜ける線）
    const ends = mouths.filter(([gx, gz]) => inPoly(poly, gx, gz) || poly.some((q, i) => { const n = poly[(i + 1) % poly.length]; return segDist(gx, gz, q[0], q[1], n[0], n[1]) < 8; }));
    // 細い段（山城の腰曲輪・帯曲輪）：o.thin の時、幅の狭い曲輪は外の縁に小さな小屋を一列に並べ、通り道は口と口の間だけを細く空ける
    //   （春日山の CG の段々の曲輪。中心へ向かう通り道を取ると、細い段では全部が通り道になって一棟も置けなかった。10/28 志賀）
    let perim = 0; for (let i = 0; i < poly.length; i++) { const q = poly[i], n2 = poly[(i + 1) % poly.length]; perim += Math.hypot(n2[0] - q[0], n2[1] - q[1]); }
    const isHon = k.kind === 'hon' || k.id === 'hon' || k.id === 'shu' || String(k.id).endsWith('_hon') || k.id === 'honmaru';
    // 本丸は戦う場なので細い段の置き方にしない（並べると通路が路地になった）
    const thin = !!o.thin && !isHon && 2 * area / perim < (o.thinW ?? 16);
    wayPad = thin ? 1.2 : (o.wayPad ?? 3.5); mouthPad = thin ? 2.5 : 5;
    const ways = [];
    for (const m of ends) { if (!thin) ways.push([m[0], m[1], c.x, c.z]); for (const m2 of ends) if (m2 !== m) ways.push([m[0], m[1], m2[0], m2[1]]); }
    curWays = ways;
    const role = k.kind === 'hon' || k.id === 'hon' || k.id === 'shu' || String(k.id).endsWith('_hon') || k.id === 'honmaru' ? 'hon' : 'other';
    // 真ん中は戦う場として空ける（広さに応じて）
    const clearR = thin ? 0 : Math.min(9, Math.sqrt(area) * 0.16);
    const per = thin ? Math.min(10, Math.floor(perim / 18) + 1) : Math.min(role === 'hon' ? 18 : 14, Math.floor(area / 80) + 1);
    let n = 0, foot = 0;
    // 角に櫓（凸の角だけ）
    for (let i = 0; i < poly.length && nT < towerCap; i++) {
      const p0 = poly[(i + poly.length - 1) % poly.length], p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const ax = p0[0] - p1[0], az = p0[1] - p1[1], bx = p2[0] - p1[0], bz = p2[1] - p1[1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 8 || lb < 8) continue;
      const cos = (ax * bx + az * bz) / (la * lb);
      if (cos < -0.55) continue;   // 平らな角は櫓にしない
      let ix = ax / la + bx / lb, iz = az / la + bz / lb; const li = Math.hypot(ix, iz) || 1; ix /= li; iz /= li;
      const x = p1[0] + ix * 4.6, z = p1[1] + iz * 4.6;
      if (!inPoly(poly, x, z)) continue;
      if ((plan.yagura || []).some((y) => y.at && Math.hypot(y.at[0] - x, y.at[1] - z) < 18)) continue;
      if (placed.some((p) => p.tower && Math.hypot(p.x - x, p.z - z) < 30)) continue;
      const kind = towerKinds[ti % towerKinds.length];
      const size = kind === 'sumi' ? 5.6 : kind === 'taka' ? 4.0 : 3.0;
      const rot = Math.atan2(ix, iz);
      const y = free(poly, x, z, size, size, rot, c, 0);
      if (y == null) continue;
      tower(batch, kind, x, y, z, rot, nT * 7 + 3);
      solidRect(x, z, size + 0.3, size + 0.3, rot);
      placed.push({ x, z, r: size * 0.75, tower: true }); nT++; ti++;
    }
    // 辺に沿って建物の列（一列目は縁の内 2m、広ければ二列目）
    const rows = !thin && Math.sqrt(area) > 48 ? [0, 1] : [0];
    for (const row of rows) {
      for (let i = 0; i < poly.length && n < per && nB < cap; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az);
        if (len < 7) continue;
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        let ix = -tz, iz = tx; if ((c.x - ax) * ix + (c.z - az) * iz < 0) { ix = -ix; iz = -iz; }
        const rot = Math.atan2(ix, iz);
        let u = 2.5 + R() * 2;
        while (u < len - 2.5 && n < per && nB < cap) {
          const r = R();
          let kind = thin ? (r < 0.6 ? 'koya' : r < 0.85 ? 'kura' : 'nagaya') : role === 'hon' && !n ? 'tozamurai' : r < 0.32 ? 'nagaya' : r < 0.58 ? 'koya' : r < 0.74 ? 'kura' : r < 0.88 ? 'daidokoro' : 'umaya';
          const K = KINDS[kind];
          let w = kind === 'nagaya' ? Math.min((thin ? 6 : K.w) + R() * 3 - 1.5, len - u - 2.5) : K.w;
          if (w < 4) { kind = 'koya'; w = KINDS.koya.w; }
          if (u + w > len - 2) { u += 2; continue; }
          const ins = (thin ? 1.8 : 3.4) + K.d / 2 + row * (K.d + 4.2);
          const x = ax + tx * (u + w / 2) + ix * ins, z = az + tz * (u + w / 2) + iz * ins;
          const y = foot + w * K.d < area * (thin ? 0.5 : 0.38) ? free(poly, x, z, w + 0.6, K.d + 0.6, rot + (row ? Math.PI : 0), c, clearR) : null;
          if (y != null) {
            // 二列目は縁を背にせず、一列目と背中合わせ（通りは列の間）
            const rr = row ? rot + Math.PI : rot;
            building(batch, kind, x, y, z, rr, w, nB * 13 + i, 0.6);
            solidRect(x, z, w + 0.3, K.d + 0.3, rr);
            placed.push({ x, z, r: Math.hypot(w, K.d) / 2 });
            n++; nB++; foot += w * K.d; byK[k.id] = (byK[k.id] || 0) + 1;
            u += w + 1.0 + R() * 1.4;
          } else u += 1.5;
        }
      }
    }
  }
  return { bldg: nB, towers: nT, why, byK };
}

// 縄張りを buildCastlePlan で建てない戦（陣城・付城）の口：plan の曲輪を (dx,dz) だけ動かして、兵を置いた後に並べる
export function denseCamp(rt, plan, dx = 0, dz = 0, o = {}) {
  const mv = (p) => [p[0] + dx, p[1] + dz];
  const P = { ...plan,
    kuruwa: plan.kuruwa.map((k) => ({ ...k, poly: k.poly.map(mv), gapAt: k.gapAt ? (Array.isArray(k.gapAt[0]) ? k.gapAt.map(mv) : mv(k.gapAt)) : undefined })),
    koguchi: (plan.koguchi || []).map((g) => (g.at ? { ...g, at: mv(g.at) } : g)),
    paths: (plan.paths || []).map((p) => ({ ...p, pts: (p.pts || []).map(mv) })),
    yagura: (plan.yagura || []).map((y) => (y.at ? { ...y, at: mv(y.at) } : y)),
    lordSeat: plan.lordSeat ? { ...plan.lordSeat, at: mv(plan.lordSeat.at) } : undefined };
  setTimeout(() => {
    if (!rt.scene || globalThis.__noDense) return;
    const batch = makeKitBatch();
    rt.flags.dense = denseCastle(rt, P, null, batch, o);
    finalizeKitBatch(rt, batch);
  }, 0);
}
