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
import { palisade, dobei, ishigaki, sakamogi, makeKitBatch, finalizeKitBatch } from './props.js';
import { addDeck, groundAt } from './floors.js';
import { placeFromSpots, patchGunCover } from './taketaba.js';
import {
  kabukiGate, yaguraGate, ironGate, masugata, sumiyaguraTower, monomi,
  horiboriHeight, mizubori, tategoriWalls,
} from './castle_parts.js';

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
  return (x, z, h0) => {
    let h = h0 != null ? h0 : baseFn(x, z);
    for (const k of kk) {
      const inside = inPoly(k.poly, x, z);
      const d = distToPoly(k.poly, x, z);
      const lvl = k.stone ? k.level - 0.2 : k.level;   // 石垣の曲輪は 0.2 低く作り、床（deck）で本当の高さにする
      if (inside) {
        h = lvl;   // 曲輪の中は平ら
      } else if (d < edgeW) {
        const w = 1 - d / edgeW;   // 外側でも縁に近ければ、切岸の下り坂へ寄せる
        h = h * (1 - w) + (lvl - edgeW * 0.9) * w;
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
function buildKuruwaWall(rt, k, batch, plan, share) {
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
    const pts = [...poly.slice(start), ...poly.slice(0, start), poly[start]];
    const m = ishigaki(rt.world, pts, { top: 1.4, minH: 2.4, maxH: 3.2, batch });
    if (!m.isBatchedPart) rt.scene.add(m);
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
    if (!(o.skipWalls || []).includes(k.id)) C.walls.push(...buildKuruwaWall(rt, k, batch, plan, share));
    if (k.sakamogi) for (const [sx, sz, rot] of k.sakamogi) rt.scene.add(sakamogi(rt.world, sx, sz, rot, 6));
  }
  // 虎口の曲がり：枡形は冠木門→広場→直角に櫓門、それ以外は指定の門を一つ（docs C2）
  if (o.buildGates) C.gateObjs = buildKoguchiGates(rt, plan, o);
  if (o.buildTowers) C.towers = buildYaguraTowers(rt, plan, o, batch);
  finalizeKitBatch(rt, batch);
  // 竹束（taketaba.js）：plan.taba に置き場の列を書くだけで、寄せ手の側に竹束が出る（docs「6. 竹束」）
  if (plan.taba && plan.taba.length) { placeFromSpots(rt, plan.taba, o.tabaTeam ?? 0); patchGunCover(rt); }
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
  const spot = { x: o.spot.x, z: o.spot.z };
  spot.y = groundAt(W, spot.x, spot.z, 999);   // いちばん上の床（天守の最上階・御殿の床）
  const look = { armor: o.armor, flag: o.flag };
  const lordG = A.addGroup({ team, faction: o.faction, name: `${o.name}の居所`, order: 'hold', anchor: { x: spot.x, z: spot.z }, facing: o.facing ?? 0, morale: 100, aggro: 2, noRout: true });
  A.spawn(lordG, [{ type: 'busho', n: 1, o: { x: spot.x, z: spot.z, heading: o.facing ?? 0, name: o.name, hat: o.hat, haori: o.haori, ...look } }]);
  const lord = lordG.units[0];
  if (lord) { lord.pos.y = spot.y; lord.keep = true; lordG.leader = lord; }
  const m = o.mouth || spot;
  const guard = A.addGroup({ team, faction: o.faction, name: `${o.name}の旗本`, order: 'hold', anchor: { x: m.x, z: m.z }, facing: o.facing ?? 0, morale: 100, aggro: 7, width: 5, noRout: true });
  A.spawn(guard, [{ type: 'samurai', n: o.guardN ?? 6, o: { ...look } }]);
  const hp0 = lord ? lord.hp : 0;
  const K = {
    lord, guard, spot, reached: false,
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
