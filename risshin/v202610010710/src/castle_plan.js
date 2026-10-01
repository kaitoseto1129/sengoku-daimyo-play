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
import { palisade, dobei, ishigaki, sakamogi } from './props.js';
import { addDeck } from './floors.js';
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

// 曲輪の縁に塀を作る（gapAt があれば、そこを避けて切る＝虎口の口）
function buildKuruwaWall(rt, k) {
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
    const m = ishigaki(rt.world, pts, { top: 1.4, minH: 2.4, maxH: 3.2 });
    rt.scene.add(m);
    return [m];
  }
  // segLen: 999 で「多角形の一辺＝一つの壁」に（ringWall と同じやり方）。gaps の番号が辺の番号とそのまま合う
  return wallLine(rt, poly, { closed: true, gaps: gapIdx, team: 1, hp: 380, segLen: 999, mesh, name: k.name || '塀' });
}

// 堀（plan.hori の一つ）から、高さへ混ぜる窪みの関数を作る（docs 1-4）。
// kind：'horikiri'|'karabori'（空堀・堀切。既定）・'tatebori'（竪堀。横に歩けない当たりも置く）・
// 'une'（畝状竪堀。along の線に沿って n 本を並べる）・'mizubori'（水堀。水面も置く）
function buildHori(rt, h) {
  const pts = h.pts || (h.a && h.b ? [h.a, h.b] : null);
  if (h.kind === 'mizubori' && pts) return mizubori(rt, pts, { depth: h.deep, width: h.w, closed: h.closed }).heightAt;
  if (h.kind === 'une' && h.along) {
    const along = h.along, n = h.n || 6, spacing = h.spacing || 2.4;
    const [ax, az] = along[0], [bx, bz] = along[along.length - 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const fns = [];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      const r = tategoriWalls(rt, [[ax + nx * off, az + nz * off], [bx + nx * off, bz + nz * off]], { depth: h.deep, width: h.w });
      fns.push(r.heightAt);
    }
    return (x, z) => Math.min(0, ...fns.map((f) => f(x, z)));
  }
  if (h.kind === 'tatebori' && pts) return tategoriWalls(rt, pts, { depth: h.deep, width: h.w }).heightAt;
  if (pts) return horiboriHeight(pts, { depth: h.deep ?? 2, width: h.w ?? 6, closed: h.closed });
  return () => 0;
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
function buildYaguraTowers(rt, plan, o) {
  return (plan.yagura || []).filter((y) => y.at).map((y) => {
    const team = o.towerTeam ?? o.team ?? 1;
    const t = y.kind === 'sumi'
      ? sumiyaguraTower(rt, y.at[0], y.at[1], { rot: y.rot ?? 0, w: y.w, d: y.d, team, stone: y.stone })
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
  const horiFns = (plan.hori || []).map((h) => buildHori(rt, h));
  // 曲輪の段の差：堀の窪みを下地に混ぜてから、曲輪の平ら・切岸を重ねる（docs C2「曲輪の段の差」）
  const baseWithHori = horiFns.length ? (x, z) => horiFns.reduce((hh, f) => hh + f(x, z), baseFn(x, z)) : baseFn;
  const height = heightOf(plan, baseWithHori, o.edgeW);
  const nav = buildNav(plan);
  const C = {
    plan, height, kuruwa: {}, walls: [], decks: [], towers: [],
    nav, route: (a, b) => navFind(nav, a, b),
    gates: (plan.koguchi || []).map((g) => ({ id: g.id, name: g.name, from: g.from, to: g.to, at: g.at })),
    climb: climbSpots(plan),
  };
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
    if (!(o.skipWalls || []).includes(k.id)) C.walls.push(...buildKuruwaWall(rt, k));
    if (k.sakamogi) for (const [sx, sz, rot] of k.sakamogi) rt.scene.add(sakamogi(rt.world, sx, sz, rot, 6));
  }
  // 虎口の曲がり：枡形は冠木門→広場→直角に櫓門、それ以外は指定の門を一つ（docs C2）
  if (o.buildGates) C.gateObjs = buildKoguchiGates(rt, plan, o);
  if (o.buildTowers) C.towers = buildYaguraTowers(rt, plan, o);
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
  return { pts, adj, alias };
}

// 小さな A*（距離だけを足す・点 60 以下の網なので総当たりで十分軽い）
function navFind(nav, a, b) {
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
      { id: 'honjin', name: '本陣', poly: rectPoly(-w / 2 + 6, w / 2 - 6, bridgeZ + 14, bridgeZ + 14 + honjinD), level: 0.3 },
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
