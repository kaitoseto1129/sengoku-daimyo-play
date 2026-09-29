// 日本地図：武将になってから開く天下の地図。和紙の地図に城と家の色を置き、隣の敵の城を選んで出陣する
// 地図の上の天下の動き（季節ごとに他の家も隣の城を攻める）もここで持つ。進み具合は G.japan に
import { tenkaEvents, tenkaAhead } from './tenka_events.js';
import { GRID, PROVINCES, MAP_SCENARIOS } from './japan_data.js';
import { drawMon } from './textures.js';
import { sfx } from './audio.js';
import { MON_OF, TYPE_NAME } from './b_castle.js';
import { confirmBox } from './screens.js';
import { S as S_ } from './settings.js';
import { mount3D, faceURL } from './japan3d.js';
import * as N from './naisei.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = GRID.step;

// 物語の筋書きから、地図の筋書きへ（桶狭間編は織田家の信長包囲網）
export const MAP_KEYS = ['nagashino', 'hoi', 'sekigahara', 'osaka'];
const mapKeyOf = (scn) => (MAP_SCENARIOS[scn] ? scn : (scn === 'okehazama' || scn === 'nobunaga_hoi' || scn === 'oda') ? 'hoi' : 'nagashino');

// ---------------- 暦 ----------------
const SEASONS = ['春', '夏', '秋', '冬'];
const ERAS = [['元和', 1615], ['慶長', 1596], ['文禄', 1592], ['天正', 1573], ['元亀', 1570], ['永禄', 1558]];
const KAN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const kanNum = (n) => (n === 1 ? '元' : n <= 10 ? KAN[n] : n < 20 ? '十' + KAN[n - 10] : KAN[Math.floor(n / 10)] + '十' + (n % 10 ? KAN[n % 10] : ''));
function when(D, turn) {
  const s0 = Math.floor((D.m - 1) / 3);
  const y = D.y + Math.floor((s0 + turn) / 4);
  const era = ERAS.find(([, y0]) => y >= y0);
  return { season: SEASONS[(s0 + turn) % 4], y, era: `${era[0]}${kanNum(y - era[1] + 1)}年` };
}

// ---------------- 家の色 ----------------
const COLOR_OF = { 徳川家: '#34558c', 織田家: '#a8862c', 武田家: '#9b3524', 豊臣家: '#8c2f4a', 石田家: '#5b4a82', 上杉家: '#4f6d6a', 北条家: '#4b6b35', 毛利家: '#3a4a78', 浅井家: '#6a5a8a', 朝倉家: '#7a5634', 本願寺: '#6d3d5e', 今川家: '#7a4a2a', 島津家: '#3d3d3d', 伊達家: '#2f5f5a' };
function hsl(str) {
  let r, g, b;
  if (str.startsWith('#')) { const n = parseInt(str.slice(1), 16); r = (n >> 16) / 255; g = ((n >> 8) & 255) / 255; b = (n & 255) / 255; }
  else { const m = str.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/); if (!m) return [0, 0, 0.4]; return [+m[1], +m[2] / 100, +m[3] / 100]; }
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0; const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
// 「戦国大名」の鮮やかな色を、和紙に載る落ち着いた色に
function clanInk(cl) {
  if (COLOR_OF[cl.name]) return COLOR_OF[cl.name];
  const [h, s, l] = hsl(cl.color || '#777');
  return `hsl(${Math.round(h)}, ${Math.round(Math.min(0.5, s) * 80)}%, ${Math.round(Math.max(0.3, Math.min(0.44, l)) * 100)}%)`;
}
function rgbOf(css) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = css; const v = c.fillStyle;
  if (v.startsWith('#')) { const n = parseInt(v.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = v.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [100, 100, 100];
}

// ---------------- 地図の形（一度だけ作る） ----------------
let SHAPE = null;
function blur(F, w, h) {
  const T = new Float32Array(F.length), O = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; T[i] = (F[i] * 2 + (x > 0 ? F[i - 1] : 0) + (x < w - 1 ? F[i + 1] : 0)) / 4; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; O[i] = (T[i] * 2 + (y > 0 ? T[i - w] : 0) + (y < h - 1 ? T[i + w] : 0)) / 4; }
  return O;
}
// 等高線（marching squares）を線につなぎ、角を丸める。返す座標は升目（col・row）
function contours(F, w, h, th, box) {
  const [x0, y0, x1, y1] = box || [0, 0, w - 1, h - 1];
  const pts = new Map(); const segs = [];
  const key = (a, b) => `${a}|${b}`;
  const at = (i, j) => F[j * w + i];
  const lerp = (a, b) => (th - a) / (b - a);
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const k = (a > th ? 8 : 0) | (b > th ? 4 : 0) | (c > th ? 2 : 0) | (d > th ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const T = () => ['h' + i + ',' + j, i + lerp(a, b), j];
    const R = () => ['v' + (i + 1) + ',' + j, i + 1, j + lerp(b, c)];
    const B = () => ['h' + i + ',' + (j + 1), i + lerp(d, c), j + 1];
    const L = () => ['v' + i + ',' + j, i, j + lerp(a, d)];
    const E = { 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]], 8: [[L, T]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] }[k];
    for (const [p, q] of E) {
      const P = p(), Q = q();
      pts.set(P[0], [P[1], P[2]]); pts.set(Q[0], [Q[1], Q[2]]);
      segs.push([P[0], Q[0]]);
    }
  }
  const adj = new Map();
  segs.forEach((s, n) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(n); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1;
    const line = [segs[n][0], segs[n][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const end = dir ? line[line.length - 1] : line[0];
        const nx = (adj.get(end) || []).find((m) => !used[m]);
        if (nx === undefined) break;
        used[nx] = 1;
        const o = segs[nx][0] === end ? segs[nx][1] : segs[nx][0];
        if (dir) line.push(o); else line.unshift(o);
      }
    }
    let P = line.map((e) => pts.get(e));
    const closed = line[0] === line[line.length - 1];
    // 角を二度削って、筆で引いたような線に
    for (let it = 0; it < 2 && P.length > 3; it++) {
      const Q = closed ? [] : [P[0]];
      const m = closed ? P.length - 1 : P.length - 1;
      for (let s = 0; s < m; s++) { const [ax, ay] = P[s], [bx, by] = P[s + 1]; Q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
      if (closed) Q.push(Q[0]); else Q.push(P[P.length - 1]);
      P = Q;
    }
    lines.push({ P, closed });
  }
  return lines;
}
function toPath(lines, path = new Path2D()) {
  for (const { P, closed } of lines) {
    path.moveTo(P[0][0] * S + 1.5, P[0][1] * S + 1.5);
    for (let i = 1; i < P.length; i++) path.lineTo(P[i][0] * S + 1.5, P[i][1] * S + 1.5);
    if (closed) path.closePath();
  }
  return path;
}
function shape() {
  if (SHAPE) return SHAPE;
  const { gc, gr, alpha } = GRID;
  const idx = new Map([...alpha].map((ch, i) => [ch, i]));
  const cell = new Int16Array(gc * gr).fill(-1);
  let k = 0;
  for (let i = 0; i < GRID.prov.length; i += 2) { const v = idx.get(GRID.prov[i]) - 1, n = idx.get(GRID.prov[i + 1]); cell.fill(v, k, k + n); k += n; }
  // 縁を海にして、輪がみな閉じるように
  const w = gc + 2, h = gr + 2;
  const land = new Float32Array(w * h);
  const pv = new Int16Array(w * h).fill(-1);
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) { const v = cell[r * gc + q]; pv[(r + 1) * w + q + 1] = v; if (v >= 0) land[(r + 1) * w + q + 1] = 1; }
  const shift = (lines) => lines.map(({ P, closed }) => ({ P: P.map(([x, y]) => [x - 1, y - 1]), closed }));
  const coastLines = shift(contours(blur(land, w, h), w, h, 0.5));
  const coast = toPath(coastLines);
  // 国境：国ごとの囲いの線（隣の国と同じ所を通るので一本に見える）
  const box = new Map();
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = pv[j * w + i]; if (v < 0) continue; const b = box.get(v) || [i, j, i, j]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], j); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], j); box.set(v, b); }
  const borders = new Path2D();
  const F = new Float32Array(w * h);
  for (const [v, b] of box) {
    const bb = [Math.max(0, b[0] - 2), Math.max(0, b[1] - 2), Math.min(w - 1, b[2] + 2), Math.min(h - 1, b[3] + 2)];
    F.fill(0);
    for (let j = bb[1]; j <= bb[3]; j++) for (let i = bb[0]; i <= bb[2]; i++) if (pv[j * w + i] === v) F[j * w + i] = 1;
    const Fb = blur(F, w, h);
    // 海に面した所は海岸の線が引くので、国境は陸の内だけ
    toPath(shift(contours(Fb, w, h, 0.5, bb).map(({ P }) => ({ P, closed: false })).flatMap(({ P }) => {
      const out = []; let cur = [];
      for (const p of P) { const q = Math.round(p[0]), r = Math.round(p[1]); const inland = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, c]) => pv[(r + c) * w + q + a] >= 0); if (inland) cur.push(p); else { if (cur.length > 1) out.push({ P: cur, closed: false }); cur = []; } }
      if (cur.length > 1) out.push({ P: cur, closed: false });
      return out;
    })), borders);
  }
  // 山がちの所（筆で「へ」の字を重ねる所）
  const bin = atob(GRID.mtn);
  const mtn = [];
  for (let r = 0; r < GRID.mr; r++) for (let q = 0; q < GRID.mc; q++) {
    const kk = r * GRID.mc + q;
    if (!(bin.charCodeAt(kk >> 3) & (1 << (kk & 7)))) continue;
    // 升目どおりに並ばないよう、間を抜いて少しずらす
    const hsh = ((q * 73856093) ^ (r * 19349663)) >>> 0;
    if (hsh % 10 < 3) continue;
    mtn.push([q * GRID.mstep + 3 + ((hsh >> 4) % 7) - 3, r * GRID.mstep + 3 + ((hsh >> 8) % 7) - 3, (hsh >> 12) % 5]);
  }
  // 陸の広がり
  let bx0 = 1e9, by0 = 1e9, bx1 = 0, by1 = 0;
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) if (cell[r * gc + q] >= 0) { bx0 = Math.min(bx0, q); bx1 = Math.max(bx1, q); by0 = Math.min(by0, r); by1 = Math.max(by1, r); }
  SHAPE = { cell, coast, borders, mtn, bounds: [bx0 * S, by0 * S, (bx1 + 1) * S, (by1 + 1) * S] };
  // 和紙の地（繊維と斑）
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#e9dfc6'; pg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { pg.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,70' : '255,250,235'},${0.03 + Math.random() * 0.05})`; pg.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 90; i++) { pg.strokeStyle = `rgba(110,90,60,${0.05 + Math.random() * 0.07})`; pg.lineWidth = 0.6; pg.beginPath(); const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 6.3, l = 6 + Math.random() * 18; pg.moveTo(x, y); pg.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); pg.stroke(); }
  SHAPE.paper = pc;
  return SHAPE;
}

// ---------------- 筋書きの中身と進み具合 ----------------
const DATA_CACHE = {};
// pl：自分の家を替える時（織田家の当主として始める時など）。無ければ筋書きの家
function dataOf(key, pl) {
  const ck = pl == null ? key : `${key}|${pl}`;
  if (DATA_CACHE[ck]) return DATA_CACHE[ck];
  const D0 = MAP_SCENARIOS[key];
  const D = pl == null ? D0 : { ...D0, player: pl };
  const byId = {};
  for (const c of D.castles) byId[c.id] = c;
  // 隣は双方向に
  const adj = {};
  for (const c of D.castles) adj[c.id] = new Set();
  for (const c of D.castles) for (const n of c.nb) if (byId[n]) { adj[c.id].add(n); adj[n].add(c.id); }
  const ink = {};
  for (const [id, cl] of Object.entries(D.clans)) ink[id] = clanInk(cl);
  // 升ごとに、いちばん近い城（同じ国の城を先に）。家の色で塗る地の下ごしらえ
  const sh = shape();
  const near = new Int16Array(sh.cell.length).fill(-1);
  for (let r = 0; r < GRID.gr; r++) for (let q = 0; q < GRID.gc; q++) {
    const i = r * GRID.gc + q, p = sh.cell[i];
    if (p < 0) continue;
    const x = q * S + 1.5, y = r * S + 1.5;
    let best = -1, bd = 1e9;
    for (let k = 0; k < D.castles.length; k++) {
      const c = D.castles[k];
      const d = Math.hypot(c.c - x, c.r - y) + (c.prov === p ? 0 : 30);
      if (d < bd) { bd = d; best = k; }
    }
    if (bd < 70) near[i] = best;
  }
  return (DATA_CACHE[ck] = { ...D, key, byId, adj, ink, near });
}
export function ensureJapan(G, key) {
  key = key || (G.japan && G.japan.scn) || mapKeyOf(G.scenario);
  if (!G.japan || G.japan.scn !== key) {
    const D = MAP_SCENARIOS[key];
    const own = {};
    for (const c of D.castles) own[c.id] = c.clan;
    G.japan = { scn: key, turn: 0, own, log: [{ t: 0, s: `${D.name}の世。${D.desc}` }], moves: [], taken: 0, lost: 0 };
    // 家の当主として始める（G.lordClan：'織田家' など）。その地図に家があれば、自分の家をそこに替える
    if (G.lordClan) {
      const pl = Object.keys(D.clans).find((id) => D.clans[id].name === G.lordClan);
      if (pl != null) { G.japan.pl = +pl; G.japan.mibun = 0; G.japan.lordInit = false; }
    }
  }
  prep(G.japan);
  // 内政と武将（古い保存にもここで足す。身分は試しなら城主から、本番なら足軽大将から）
  N.initNaisei(dataOf(G.japan.scn, G.japan.pl), G.japan, { me: G.name && !['bot', '名無し'].includes(G.name) ? G.name : 'あなた', practice: !!G.practice });
  if (G.japan.pl != null && !G.japan.lordInit) makeLord(dataOf(G.japan.scn, G.japan.pl), G.japan);
  return G.japan;
}
// 自分がその家の当主（国持）になる：内政で作った「自分」の代わりに、家の大名その人を自分にする
function makeLord(D, J) {
  J.lordInit = true;
  const P = D.player, head = D.clans[P] && D.clans[P].daimyo;
  const me0 = J.me;
  if (!head || !J.gen[head]) { J.mibun = N.MIBUN.length - 1; J.kou = Math.max(J.kou || 0, N.KOU_NEED[J.mibun]); return; }
  if (me0 && me0 !== head && J.gen[me0]) {
    delete J.gen[me0];
    for (const [cid, n] of Object.entries(J.lord)) if (n === me0) delete J.lord[cid];
  }
  J.me = head;
  J.gen[head].me = true;
  J.gen[head].loy = 100;
  J.post = J.gen[head].at;
  J.head = J.head || {};
  J.head[P] = head;
  if (J.post != null) J.lord[J.post] = head;
  J.mibun = N.MIBUN.length - 1;   // 国持
  J.kou = Math.max(J.kou || 0, N.KOU_NEED[J.mibun]);
  J.log.push({ t: J.turn, s: `${D.clans[P].name}の当主として、天下へ` });
}
// 古い保存にも、あとから足した入れ物を用意する
// fort：自分の城の守りの固さ 0〜3（naisei.js の普請の積みから） ／ levy：古い保存の集めた兵 ／ pact：同盟の続く季節 ／ grudge：寝返りを誘われて怒った家
// hist：季節ごとの家の城の数 ／ threats：いま攻め寄せられている自分の城 ／ fallen：持ち主が替わった季節 ／ koku：古い保存の開いた田
function prep(J) {
  J.fort = J.fort || {}; J.levy = J.levy || 0; J.pact = J.pact || {}; J.grudge = J.grudge || {};
  J.threats = J.threats || []; J.fallen = J.fallen || {}; J.koku = J.koku || {};
  if (J.acted == null) J.acted = -1;
  if (J.envoy == null) J.envoy = -1;
  if (!J.hist) J.hist = [{ t: J.turn, c: countOf(J) }];
  return J;
}
function countOf(J) { const c = {}; for (const id of Object.keys(J.own)) c[J.own[id]] = (c[J.own[id]] || 0) + 1; return c; }
// 同盟：筋書きの同盟に、使者で結んだ同盟（J.pact）を足す
const allied = (D, a, b, J) => a === b || (!(J && J.broken && ((+a === D.player && J.broken[b]) || (+b === D.player && J.broken[a])))
  && ((D.clans[a] && D.clans[a].allies.includes(+b)) || (D.clans[b] && D.clans[b].allies.includes(+a))))
  || !!(J && ((+a === D.player && J.pact[b] > J.turn) || (+b === D.player && J.pact[a] > J.turn)));
const castlesOf = (J, cid) => Object.keys(J.own).filter((k) => J.own[k] === cid);
function attackable(D, J, c) {
  const P = D.player;
  if (J.own[c.id] === P || allied(D, P, J.own[c.id], J)) return null;
  const from = [...D.adj[c.id]].filter((n) => J.own[n] === P).map((n) => D.byId[n]);
  if (!from.length) return null;
  return from.sort((a, b) => J.dom[b.id].h - J.dom[a.id].h)[0];
}
const kokuOf = (J, c) => J.dom[c.id].k;
const troopsOf = (c, J) => J.dom[c.id].h;
// 城の堅さ（型と本城から。直した分も）0〜4
const hardOf = (J, c) => ({ yama: 2, hira: 1, toride: 0 }[c.type] ?? 1) + (c.hq ? 1 : 0) + (J.fort[c.id] || 0);
// 出陣の兵（城の兵から。金と兵糧が足りないと減る）
const armyOf = (D, J) => N.campaign(D, J).army;
// 594：勝ちの見込み（出せる兵と、城の兵・堅さ・城主の采配）
function oddsOf(D, J, c) {
  const r = armyOf(D, J) / Math.max(1, N.defPow(J, c));
  return r >= 2 ? ['有利', 'good'] : r >= 1.2 ? ['五分', 'even'] : ['不利', 'bad'];
}
// ---- 城ごとの違い：落とせば手に入る物と、敵の出方（3D の城攻めの兵の数と門の固さにそのまま効く） ----
const r10 = (v) => Math.round(v / 10) * 10;
// 平城は町の銭、山城は蔵の兵糧、砦は少し。本城は五割増し
function spoilsOf(J, c) {
  const k = kokuOf(J, c) || c.koku || 20000;
  const m = { hira: [1.6, 0.8], yama: [0.7, 1.3], toride: [0.4, 0.4] }[c.type] || [1, 1], hq = c.hq ? 1.5 : 1;
  return { g: r10(k * 0.003 * m[0] * hq), f: r10(k * 0.05 * m[1] * hq) };
}
// 敵の出方：兵糧の乏しい家は門が弱く、隣に兵の多い城があれば後詰めが来て、山城は固く籠もり、平城は打って出る
function stanceOf(D, J, c) {
  const cl = J.own[c.id], bank = J.bank && J.bank[cl];
  if (bank && bank.f < 800) return { k: 'hungry', s: '兵糧が尽きかけ・門が弱い', kata: -20, b: 0.85 };
  const help = [...D.adj[c.id]].filter((n) => J.own[n] === cl && J.dom[n] && J.dom[n].h >= 1200).map((n) => J.dom[n].h).sort((a, b) => b - a)[0];
  if (help) return { k: 'aid', s: '隣の城から後詰めが来る', kata: 0, b: 1 + Math.min(0.5, (help * 0.3) / Math.max(1, troopsOf(c, J))) };
  if (c.type === 'yama' || hardOf(J, c) >= 3) return { k: 'hold', s: '固く籠城する', kata: 15, b: 1 };
  return { k: 'sally', s: '城兵が打って出る', kata: -10, b: 1.1 };
}
// 季節ごとの外交の動き（一季に一つまで）：同盟の申し出・同盟破り・味方の城主の寝返り・敵の城主の降り
function seasonEvent(D, J, logs, t) {
  if (Math.random() > 0.45) return;
  const P = D.player, me = N.clanPow(J, P) || 1;
  const J2 = J;
  const neigh = new Set();
  for (const id of castlesOf(J, P)) for (const n of D.adj[id]) if (J.own[n] !== P) neigh.add(J.own[n]);
  const pow = (cid) => N.clanPow(J, cid);
  const cand = [];
  for (const cid of neigh) {
    const nm = D.clans[cid].name;
    if (allied(D, P, cid, J2)) {
      if (pow(cid) > me * (J.marry && J.marry[cid] ? 2.2 : 1.1)) cand.push(() => { J.pact[cid] = t; J.broken = J.broken || {}; J.broken[cid] = true; J.grudge[cid] = t + 3; logs.push({ t, s: `${nm}が同盟を破った`, k: 'bad' }); });
    } else if (!(J.grudge[cid] > t) && pow(cid) < me) {
      cand.push(() => { J.pact[cid] = t + 4; if (J.broken) delete J.broken[cid]; logs.push({ t, s: `${nm}から同盟の申し出。四季の間、手を結ぶ`, k: 'good' }); });
    }
  }
  for (const id of castlesOf(J, P)) {
    const c = D.byId[id], ln = J.lord[id], e = ln && J.gen[ln];
    if (!e || e.me || id === J.post || (e.loy ?? 100) >= 40) continue;
    const foe = [...D.adj[id]].map((n) => J.own[n]).find((o) => o !== P && !allied(D, P, o, J2));
    if (foe != null) cand.push(() => { N.turnCastle(D, J, c, foe, logs, t); J.lost++; J.fallen[id] = t; logs.push({ t, s: `${ln}が${c.name}ごと${D.clans[foe].name}へ寝返った`, k: 'bad' }); });
  }
  for (const cid of neigh) for (const id of castlesOf(J, cid)) {
    const c = D.byId[id], ln = J.lord[id], e = ln && J.gen[ln];
    if (!e || c.hq || (e.loy ?? 100) >= 35 || ![...D.adj[id]].some((n) => J.own[n] === P) || allied(D, P, cid, J2)) continue;
    cand.push(() => { N.turnCastle(D, J, c, P, logs, t); J.taken++; J.fallen[id] = t; logs.push({ t, s: `${c.name}の${ln}が降ってきた`, k: 'good' }); });
  }
  if (cand.length) cand[Math.floor(Math.random() * cand.length)]();
}

// 600：自分の城の危うさ（隣に敵の家があり、その家が強いほど・怒っているほど危ない）0〜2
function dangerOf(D, J, c) {
  let d = 0;
  const me = N.clanPow(J, D.player);
  for (const n of D.adj[c.id]) {
    const o = J.own[n];
    if (allied(D, D.player, o, J)) continue;
    const v = (N.clanPow(J, o) >= me * 0.8 || J.grudge[o] > J.turn ? 2 : 1) - (J.fort[c.id] >= 2 ? 1 : 0);
    d = Math.max(d, v);
  }
  return Math.max(0, d);
}

// 季節を一つ進める：内政と金・兵糧の計算（naisei.js）→ 評定の始末 → 他の家の城攻め（兵と城の堅さと城主で決まる）
function advance(D, J, first = []) {
  const P = D.player;
  const moves = [...first];
  const touched = new Set(first.map((m) => m.to));
  const t = J.turn + 1;
  const season = when(D, J.turn).season;
  const logs = [];
  // 評定で自分が何もしなかった時は、主君が一番の進言を採る
  if (J.hyo && J.hyo.t === J.turn) lordDecides(D, J, logs, t);
  // 自分の手の届く城は、家老が勝手に内政しない
  const skip = new Set(N.scopeCastles(D, J).map((c) => c.id));
  logs.push(...N.seasonTick(D, J, season, (a, b) => allied(D, a, b, J), skip));
  const ids = Object.keys(D.clans).map(Number).filter((id) => id !== P).sort(() => Math.random() - 0.5);
  let threats = 0;
  for (const cid of ids) {
    const mine = castlesOf(J, cid);
    if (!mine.length) continue;
    const angry = J.grudge[cid] > J.turn;
    const bank = J.bank[cid] || { f: 0 };
    // 兵糧が乏しい家は攻めに出にくい
    const fed = bank.f > 800 ? 1 : 0.4;
    if (Math.random() > ((mine.length >= 8 ? 0.42 : 0.28) + (angry ? 0.3 : 0)) * fed) continue;
    const opts = [];
    for (const id of mine) for (const n of D.adj[id]) {
      const o = J.own[n];
      if (allied(D, cid, o, J) || touched.has(n)) continue;
      // 勝てそうな城ほど選ばれやすい
      const w = 0.3 + N.aiOdds(D, J, +id, n, cid) * 2 + (angry && o === P ? 1.5 : 0);
      opts.push([+id, n, w]);
    }
    if (!opts.length) continue;
    let r = Math.random() * opts.reduce((a2, x) => a2 + x[2], 0), pick = opts[0];
    for (const x of opts) { r -= x[2]; if (r <= 0) { pick = x; break; } }
    const [from, to] = pick;
    const dcl = J.own[to];
    const an = D.clans[cid].name, bn = D.clans[dcl].name, cn = D.byId[to].name;
    // 593：自分の城に攻め寄せたら、すぐには決めず急使の知らせに（一季節に二つまで）
    if (dcl === P) {
      if (threats >= 2 || Math.random() > 0.55) continue;
      threats++;
      touched.add(to);
      J.threats.push({ from, to, clan: cid, t });
      moves.push({ from, to, clan: cid, def: dcl, won: false, threat: true });
      logs.push({ t, s: `急使：${an}が${cn}に攻め寄せる`, k: 'bad' });
      continue;
    }
    touched.add(to);
    const sub = [];
    const { won } = N.aiBattle(D, J, from, to, cid, sub, t);
    moves.push({ from, to, clan: cid, def: dcl, won });
    if (won) {
      J.fallen[to] = t;
      logs.push({ t, s: `${an}、${bn}の${cn}を攻め落とす`, k: '' });
      logs.push(...sub.filter((l) => l.k === 'big' || l.k === 'good' || l.k === 'bad'));
      if (!castlesOf(J, dcl).length) logs.push({ t, s: `${bn}、城をすべて失い滅ぶ`, k: 'big' });
    }
  }
  seasonEvent(D, J, logs, t);
  // 史実の出来事（桶狭間・上洛・包囲網…）。条件しだいで起こらない・形が変わる（tenka_events.js）
  logs.push(...tenkaEvents(D, J, t, when(D, t)));
  // 同盟の切れ目
  for (const [cid, until] of Object.entries(J.pact)) if (until === t && !(J.broken && J.broken[cid])) logs.push({ t, s: `${D.clans[cid].name}との同盟の約束が切れた`, k: '' });
  J.turn = t;
  J.moves = moves;
  N.fixPost(D, J);
  J.log.push(...logs);
  if (J.log.length > 80) J.log.splice(0, J.log.length - 80);
  // 595：形勢の移り変わりを覚える（多くて40季節分）
  J.hist.push({ t, c: countOf(J) });
  if (J.hist.length > 40) J.hist.splice(0, J.hist.length - 40);
  // 598：この季節の報せ（自分の家に関わる事を先に）
  const mineFirst = [...first.map((m) => ({ s: m.won ? `${D.clans[P].name}、${D.byId[m.to].name}を攻め落とす` : `${D.byId[m.to].name}攻め、城は落ちず`, k: m.won ? 'good' : 'bad' })), ...logs];
  mineFirst.sort((a, b) => (b.k === 'bad' || b.k === 'good' ? 1 : 0) - (a.k === 'bad' || a.k === 'good' ? 1 : 0));
  J.report = { t, lines: mineFirst.slice(0, 6), more: Math.max(0, mineFirst.length - 6) };
  return moves;
}
// 評定の進言を採った時の始末（who の武将が奉行・使者になる）。結果の一行を返す
function runProposal(D, J, it, logs, t) {
  const b = N.bushoOf(J, it.who), c = it.cid != null ? D.byId[it.cid] : null, P = D.player;
  let s = null, k = 'good';
  if (it.kind === 'act' && c && J.own[c.id] === P) s = N.doAct(D, J, c, it.act, b, when(D, J.turn).season) || `${c.name}の${N.ACTS[it.act].name}は、金が足りず見送った`;
  else if (it.kind === 'attack' && c) { J.order = { cid: c.id, t: J.turn, until: J.turn + 3 }; s = `主命：三季のうちに${c.name}を攻め落とせ`; }
  else if (it.kind === 'turn' && c && J.own[c.id] !== P) {
    const p = N.turnChance(D, J, c, b);
    if (Math.random() < p) { N.turnCastle(D, J, c, P, logs, t); J.taken++; J.fallen[c.id] = J.turn; s = `${it.who}の調略が実り、${c.name}の${J.lord[c.id] || '城主'}が寝返った`; }
    else { J.grudge[J.own[c.id]] = J.turn + 4; s = `${it.who}の調略は見破られ、${D.clans[J.own[c.id]].name}の怒りを買った`; k = 'bad'; }
  } else if (it.kind === 'reward' && J.gen[it.target]) {
    if (J.bank[P].g >= 200) { J.bank[P].g -= 200; J.gen[it.target].loy = Math.min(100, J.gen[it.target].loy + 18); s = `${it.target}に褒美を与えた（忠誠 +18）`; } else { s = '褒美の金が足りなかった'; k = 'bad'; }
  } else if (it.kind === 'hire' && J.gen[it.target]) {
    if (J.bank[P].g >= 300) { J.bank[P].g -= 300; const e = J.gen[it.target]; e.c = P; e.at = J.post; e.loy = 70; J.offer = null; s = `${it.target}を召し抱えた`; } else { s = '支度金が足りなかった'; k = 'bad'; }
  }
  // 採られた者は喜び、ほかは少し不満
  if (J.gen[it.who]) J.gen[it.who].loy = Math.min(100, J.gen[it.who].loy + 4);
  if (s && logs) logs.push({ t, s: `評定：${s}`, k });
  return s;
}
function lordDecides(D, J, logs, t) {
  const hy = J.hyo;
  if (!hy || hy.lordDone) return;
  hy.lordDone = true;
  if (N.MIBUN[J.mibun].decide > 0 && hy.decided > 0) return;
  const it = N.lordPick(hy);
  if (!it) return;
  it.state = 'lord';
  runProposal(D, J, it, logs, t);
}

// 593：攻め寄せられた自分の城の始末。how：'aid'（後詰め）・'hold'（籠城）・'yield'（明け渡す）・'won'/'lost'（3D の守りの戦の結果）
function resolveThreat(D, J, th, how) {
  const P = D.player, c = D.byId[th.to], an = D.clans[th.clan].name;
  J.threats = J.threats.filter((x) => x !== th);
  if (J.own[c.id] !== P) return null;
  let held;
  const helper = aidFrom(D, J, c);
  if (how === 'won' || how === 'lost') held = how === 'won';
  else if (how === 'yield') held = false;
  else {
    const atk = (J.dom[th.from] ? J.dom[th.from].h * 0.6 : 1500) * N.lordFactor(N.bushoOf(J, J.lord[th.from]));
    let d = N.defPow(J, c);
    if (how === 'aid' && helper) { const n = Math.min(600, Math.round(J.dom[helper.id].h * 0.4 / 10) * 10); J.dom[helper.id].h -= n; J.dom[c.id].h += n; d = N.defPow(J, c) * 1.25; }
    const p = 0.12 + 0.8 * (d / (d + atk)) + (c.type === 'yama' ? 0.05 : 0);
    held = Math.random() < Math.min(0.93, p);
  }
  const t = J.turn;
  const logs = [];
  if (held) {
    if (how === 'hold') J.dom[c.id].kt = Math.max(0, (J.dom[c.id].kt || 0) - 6);
    J.dom[c.id].h = Math.max(100, Math.round(J.dom[c.id].h * 0.85 / 10) * 10);
    if (J.dom[th.from]) J.dom[th.from].h = Math.max(100, Math.round(J.dom[th.from].h * 0.75 / 10) * 10);
    N.syncFort(D, J);
    J.log.push({ t, s: `${an}の寄せ手を退け、${c.name}を守り抜く`, k: 'good' });
    const up = N.addKou(D, J, how === 'won' ? 20 : 6);
    if (up) promoted(J, up, t);
  } else {
    // 明け渡す時は、城兵の六割を近くの自分の城へ退かせる
    if (how === 'yield') { const to = aidFrom(D, J, c); if (to) J.dom[to.id].h += Math.round(J.dom[c.id].h * 0.6 / 10) * 10; J.dom[c.id].h = Math.round(J.dom[c.id].h * 0.4 / 10) * 10; }
    N.capture(D, J, c, th.clan, logs, t, th.from);
    J.lost++; J.fallen[c.id] = t;
    if (how === 'yield') J.log.push({ t, s: `${c.name}を${an}に明け渡し、城兵を退かせた`, k: 'bad' });
    else J.log.push({ t, s: `${an}、${c.name}を攻め落とす`, k: 'bad' });
    J.log.push(...logs);
    N.fixPost(D, J);
  }
  const m = (J.moves || []).find((x) => x.threat && x.to === c.id);
  if (m) { m.threat = false; m.won = !held; }
  J.hist[J.hist.length - 1] = { t: J.turn, c: countOf(J) };
  return held;
}
// 後詰めを出せる隣の自分の城（兵の多い順）
function aidFrom(D, J, c) {
  const P = D.player;
  const nb = [...D.adj[c.id]].filter((n) => J.own[n] === P).map((n) => D.byId[n]);
  const all = nb.length ? nb : castlesOf(J, P).map((id) => D.byId[id]).filter((x) => x.id !== c.id);
  return all.filter((x) => J.dom[x.id].h >= 500).sort((a, b) => J.dom[b.id].h - J.dom[a.id].h)[0] || null;
}
// 身分が上がった知らせ（地図を開いた時に札で見せる）
function promoted(J, up, t) {
  J.log.push({ t, s: `勲功が認められ、${up.name}に取り立てられた`, k: 'big' });
  J.promo = { name: up.name, can: up.can, t };
}

// 地図の城攻めの結果を地図に書く（main.js が戦のあとに呼ぶ）
// info.defend が真なら、攻め寄せられた自分の城の守りの戦（3D）の結果
export function japanResult(G, info, won) {
  const J = ensureJapan(G, info.scn);
  const D = dataOf(J.scn, J.pl);
  if (info.defend) {
    const th = J.threats.find((x) => x.to === info.castleId) || { to: info.castleId, clan: info.clan, from: info.fromId };
    resolveThreat(D, J, th, won ? 'won' : 'lost');
    return;
  }
  const c = D.byId[info.castleId];
  const dcl = J.own[c.id];
  const t = J.turn + 1;
  const first = [{ from: info.fromId, to: c.id, clan: D.player, def: dcl, won, mine: true }];
  const logs = [];
  const sp = spoilsOf(J, c), food0 = N.campaign(D, J).food;
  N.afterCampaign(D, J, c, info.fromId, won, logs, t);
  const bank = J.bank && J.bank[D.player];
  if (bank) {
    // 冬の陣は兵糧が五割増しでかかる
    if (info.season === '冬') { const ex = r10(food0 * 0.5); bank.f = Math.max(0, bank.f - ex); logs.push({ t, s: `冬の陣で兵糧が余計にかかった（−${ex.toLocaleString('ja-JP')}石）`, k: 'bad' }); }
    if (won) { bank.g += sp.g; bank.f += sp.f; logs.push({ t, s: `${c.name}の蔵を押さえた（金 +${sp.g.toLocaleString('ja-JP')}・兵糧 +${sp.f.toLocaleString('ja-JP')}石）`, k: 'good' }); }
  }
  if (won) { J.taken++; J.fallen[c.id] = t; J.lastTaken = c.id; }
  J.log.push({ t, s: won ? `${D.clans[D.player].name}、${c.name}を攻め落とす` : `${c.name}攻め、城は落ちず兵を退く`, k: won ? 'good' : 'bad' });
  J.log.push(...logs);
  if (won && !castlesOf(J, dcl).length) J.log.push({ t, s: `${D.clans[dcl].name}、城をすべて失い滅ぶ`, k: 'big' });
  // 勲功：主命の城なら上乗せ
  if (won) {
    const ord = J.order && J.order.cid === c.id && J.turn <= J.order.until;
    if (ord) { J.log.push({ t, s: `主命を果たした。主君より感状を賜る`, k: 'good' }); J.order = null; }
    // 城主になる時は、いま落とした城を預かる
    if (J.mibun < 4 && J.kou + (ord ? 50 : 35) >= N.KOU_NEED[4]) J.post = c.id;
    const up = N.addKou(D, J, ord ? 50 : 35);
    if (up) promoted(J, up, t);
  }
  advance(D, J, first);
}

// ---------------- 家紋の小さな絵 ----------------
const monCache = new Map();
function monImage(kind) {
  if (monCache.has(kind)) return monCache.get(kind);
  const src = document.createElement('canvas'); src.width = 96; src.height = 192;
  drawMon(src.getContext('2d'), kind, 96, 192);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.clip();
  // drawMon の紋は幅の真ん中、高さの 0.32 に、半径は幅の 0.34
  const cy = 192 * 0.32, r = 96 * 0.34 * 1.18;
  g.drawImage(src, 48 - r, cy - r, r * 2, r * 2, 0, 0, 64, 64);
  monCache.set(kind, c);
  return c;
}

// ---------------- 画面 ----------------
// あとから足した札の見た目（index.html は他の人の係なので、ここで足す）
function injectStyle() {
  if (document.getElementById('jp-style2')) return;
  const st = document.createElement('style'); st.id = 'jp-style2';
  st.textContent = `
.jp-h small { font-family: var(--ui); font-size: 12px; letter-spacing: 0; color: var(--washi-dim); margin-left: 6px; font-weight: 400; }
.jp-duty { display: grid; gap: 6px; }
.jp-duty .btn, .jp-choice .btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 48px; text-align: left; padding: 8px 12px; }
.jp-duty .btn b, .jp-choice .btn b { font-size: 14px; }
.jp-duty .btn small, .jp-choice .btn small { font-size: 12px; opacity: .85; font-weight: 400; }
.jp-duty .btn:disabled, .jp-choice .btn:disabled, .jp-dip .btn:disabled { opacity: .45; cursor: not-allowed; }
.jp-dip { display: grid; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); }
.jp-dip > span { font-size: 12px; color: var(--washi-dim); }
.jp-dip .btn { min-height: 44px; text-align: left; }
.jp-choice { display: grid; gap: 8px; margin-top: 12px; }
.jp-odd { font-weight: 700; }
.jp-odd.good { color: #b3c894; } .jp-odd.even { color: #e6c77a; } .jp-odd.bad { color: #f0a08a; }
.jp-link small.jp-odd { font-size: 11px; margin-left: 5px; }
.jp-bad { color: #f0a08a; }
.jp-legend .lgs { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-right: 5px; font-size: 11px; border: 1.5px solid #9b3524; color: #9b3524; background: #f3ead6; vertical-align: -3px; }
.jp-legend .lgs.red { background: #2a2017; border-color: #2a2017; color: #f3ead6; }
.jp-legend .lgd { color: #9a7a2e; margin-right: 4px; }
.jp-legend .lgr { display: inline-block; width: 22px; height: 0; margin-right: 5px; vertical-align: 3px; border-top: 2px solid #b39a6a; }
.jp-legend .lgr.front { border-top: 2.5px dashed #c8452c; }
/* 左上の「戻る」の釦と重ならないよう、季節の札を右へ。操作の案内は勢力の帯の下へ */
.jp:not(.j3) .jp-season { left: 150px; top: 10px; }
.jp:not(.j3) .jp-hint { top: 112px; }
.jp-pips { letter-spacing: 2px; color: var(--kin); }
.jp-pw { grid-template-columns: 118px 1fr 26px 30px; }
.jp-pw em { font-style: normal; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.jp-pw em.up { color: #b3c894; } .jp-pw em.down { color: #f0a08a; }
.jp-trend { display: block; width: 100%; margin-top: 8px; background: rgba(14,11,8,.4); box-shadow: inset 0 0 0 1px var(--line); }
.jp-news { border-left: 3px solid var(--kin); padding: 2px 0 4px 10px; margin: 10px 0 4px; }
.jp-news .jp-h { margin-top: 4px; }
.jp-news p { margin: 0; padding: 3px 0; font-size: 13px; line-height: 1.6; color: var(--washi); }
.jp-news p.good { color: #b3c894; } .jp-news p.bad { color: #f0a08a; } .jp-news p.big { font-weight: 700; }
.jp-news p.jp-more { color: var(--washi-dim); font-size: 12px; }
.jp-threat .jp-rc { border-color: #b8402a; }
.jp-threat .jp-rc h3 { color: #f0a08a; }
body.rm .jp-threat, body.rm .jp-result { animation: none; }
/* 内政・評定・武将（信長の野望の札を、和紙と墨の世界で） */
.jp-rank { flex-basis: 100%; display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; }
.jp-rank > span { color: var(--washi-dim); }
.jp-rank > b { font-family: var(--display); font-size: 15px; color: var(--kin); letter-spacing: .08em; }
.jp-rank > i { height: 6px; background: rgba(236,228,210,.1); position: relative; }
.jp-rank > i::after { content: ''; position: absolute; inset: 0; right: auto; width: var(--v); background: linear-gradient(90deg, #8e6f2e, #d9b45a); }
.jp-rank small { color: var(--washi-dim); font-variant-numeric: tabular-nums; }
.jp-res2 { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 12px; color: var(--washi-dim); }
.jp-res2 b { font-family: var(--display); font-size: 15px; color: var(--washi); font-variant-numeric: tabular-nums; }
.jp-res2 em, .jp-econ em { font-style: normal; font-size: 12px; } .jp-res2 em.up, .jp-econ em.up { color: #b9d39a; } .jp-res2 em.down, .jp-econ em.down { color: #f2a48e; }
.jp-order { margin: 10px 0 0; padding: 8px 10px; font-size: 13px; background: rgba(142,47,31,.28); border-left: 3px solid #c8563c; }
.jp-order b { font-family: var(--display); color: #f3c9a8; margin-right: 8px; letter-spacing: .1em; }
.jp-ord { font-style: normal; color: #f3c9a8; }
.jp-tabs { display: grid; grid-template-columns: repeat(5, 1fr); margin: 12px 0 4px; border-bottom: 1px solid var(--gold-line); }
.jp-tabs button { position: relative; appearance: none; background: transparent; border: 0; border-bottom: 3px solid transparent; color: var(--washi-dim); min-height: 44px; font-family: var(--display); font-size: 15px; letter-spacing: .12em; cursor: pointer; padding: 0 2px; }
.jp-tabs button:hover { color: var(--washi); background: rgba(236,228,210,.05); }
.jp-tabs button[aria-selected="true"] { color: var(--washi); border-bottom-color: var(--kin); font-weight: 700; background: rgba(194,162,90,.1); }
.jp-badge { position: absolute; top: 4px; right: 4px; min-width: 18px; height: 18px; border-radius: 9px; background: #b8402a; color: #fff5ea; font: 700 12px/18px var(--ui); font-style: normal; letter-spacing: 0; }
.jp-badge.soft { background: rgba(194,162,90,.85); color: #1b1510; }
.jp-face { width: 36px; height: 36px; flex: 0 0 auto; object-fit: cover; background: #2a2420; box-shadow: 0 0 0 1px rgba(194,162,90,.55); }
.jp-face.big { width: 60px; height: 60px; } .jp-face.huge { width: 88px; height: 88px; }
.jp-lord { display: grid; grid-template-columns: 60px 1fr; gap: 10px; align-items: center; width: 100%; margin: 8px 0 4px; padding: 8px; text-align: left; background: rgba(236,228,210,.04); border: 1px solid var(--line); color: var(--washi); cursor: pointer; font-family: var(--ui); }
.jp-lord:hover { border-color: var(--kin); }
.jp-lw { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.jp-lw small { font-size: 12px; color: var(--kin); letter-spacing: .1em; }
.jp-lw b { font-family: var(--display); font-size: 17px; letter-spacing: .06em; }
.jp-lw em { font-style: normal; font-size: 12px; color: var(--washi-dim); }
.jp-st { display: inline-flex; gap: 2px 6px; flex-wrap: wrap; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--washi); }
.jp-st i { font-style: normal; font-size: 12px; color: var(--washi-dim); margin-right: 1px; }
.jp-trs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.jp-tr { font-size: 12px; padding: 1px 6px; border: 1px solid rgba(194,162,90,.6); color: #e6cf94; white-space: nowrap; }
.jp-karo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 12px; color: var(--washi-dim); margin-bottom: 4px; }
.jp-karo .jp-link small { color: var(--washi-dim); margin-left: 4px; font-size: 12px; }
.jp-dom { display: grid; gap: 4px; margin: 8px 0 4px; }
.jp-mt { display: grid; grid-template-columns: 52px 1fr 76px; align-items: center; gap: 8px; font-size: 12px; }
.jp-mt > span { color: var(--washi-dim); }
.jp-mt > i { height: 7px; background: rgba(236,228,210,.08); position: relative; }
.jp-mt > i::after { content: ''; position: absolute; inset: 0; right: auto; width: var(--v); background: linear-gradient(90deg, #7d6a3e, #cfb071); }
.jp-mt.bad > i::after { background: linear-gradient(90deg, #7a2f22, #d4694f); }
.jp-mt > b { text-align: right; font-family: var(--display); font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 500; }
.jp-econ { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 12px 0 4px; }
.jp-econ > div { display: flex; flex-direction: column; gap: 2px; padding: 8px; background: rgba(14,11,8,.55); border: 1px solid var(--line); }
.jp-econ span { font-size: 12px; color: var(--kin); letter-spacing: .1em; }
.jp-econ b { font-family: var(--display); font-size: 18px; font-variant-numeric: tabular-nums; }
.jp-econ b small { font-family: var(--ui); font-size: 12px; color: var(--washi-dim); margin-left: 2px; }
.jp-econ em { color: var(--washi-dim); line-height: 1.35; }
.jp-h2 { font-size: 12px; letter-spacing: .14em; color: var(--kin); margin: 10px 0 4px; }
.jp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.jp-chips button { appearance: none; min-height: 44px; padding: 0 12px; background: transparent; color: var(--washi-dim); border: 1px solid var(--line); font-size: 13px; cursor: pointer; font-family: var(--ui); }
.jp-chips button:hover { color: var(--washi); border-color: var(--washi-dim); }
.jp-chips button[aria-checked="true"] { background: var(--washi); color: var(--sumi); border-color: var(--washi); font-weight: 700; }
.jp-chips.sort button { padding: 0 9px; }
.jp-bugyo { display: grid; gap: 4px; }
.jp-bugyo button { display: grid; grid-template-columns: 36px 1fr; gap: 8px; align-items: center; min-height: 48px; padding: 4px 8px; text-align: left; background: transparent; border: 1px solid var(--line); color: var(--washi); cursor: pointer; font-family: var(--ui); }
.jp-bugyo button b { display: block; font-size: 14px; font-weight: 600; }
.jp-bugyo button small { font-size: 12px; color: var(--washi-dim); }
.jp-bugyo button[aria-checked="true"] { border-color: var(--kin); background: rgba(194,162,90,.14); box-shadow: inset 3px 0 0 var(--kin); }
.jp-acts { display: grid; gap: 6px; margin-top: 10px; }
.jp-acts .btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 52px; text-align: left; padding: 7px 12px; letter-spacing: .06em; }
.jp-acts .btn b { display: flex; justify-content: space-between; width: 100%; font-size: 15px; font-family: var(--display); }
.jp-acts .btn b em { font-style: normal; font-family: var(--ui); font-size: 12px; font-weight: 400; opacity: .85; }
.jp-acts .btn small { font-size: 12px; opacity: .9; font-weight: 400; letter-spacing: 0; }
.jp-acts .btn:disabled, .jp-say .btn:disabled, .jp-prop .btn:disabled { opacity: .45; cursor: not-allowed; }
.jp-nres { min-height: 1.4em; margin: 8px 0 0; font-size: 13px; line-height: 1.6; color: #cfe0b0; }
/* 内政は部将から：鍵の印で「まだ使えない」をはっきり（薄くせず、字の対比は保つ） */
.jp-lock { flex: none; vertical-align: -2px; }
.jp-tabs .jp-lock { margin-left: 4px; color: var(--washi-dim); }
.jp-lockcard { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0 4px; padding: 10px 12px; background: rgba(14,11,8,.6); border: 1px solid var(--gold-line); border-left: 3px solid var(--kin); }
.jp-lockcard > .jp-lock { margin-top: 3px; color: var(--kin); }
.jp-lockcard b { display: block; font-family: var(--display); font-size: 15px; color: var(--washi); letter-spacing: .06em; }
.jp-lockcard p { margin: 4px 0 0; font-size: 13px; line-height: 1.6; color: var(--washi); }
.jp-lockcard .jp-mt { margin-top: 8px; }
.jp-acts .btn.locked { cursor: not-allowed; background: rgba(14,11,8,.55); border: 1px dashed rgba(236,228,210,.38); color: var(--washi-dim); box-shadow: none; }
.jp-acts .btn.locked b { color: var(--washi-dim); }
.jp-acts .btn.locked b span { display: inline-flex; align-items: center; gap: 6px; }
.jp-acts .btn.locked:hover { background: rgba(14,11,8,.7); }
.jp-lockmsg { margin: -2px 0 2px; padding: 6px 10px; font-size: 13px; line-height: 1.55; color: #f3e6c4; background: rgba(40,32,20,.92); border-left: 3px solid var(--kin); }
.jp-lockmsg:empty { display: none; }
.jp-lstep { color: var(--kin); }
.jp-open { margin: 10px 0; padding: 10px 12px; border-left: 3px solid var(--kin); background: rgba(194,162,90,.14); font-size: 14px; line-height: 1.6; }
.jp-open b { display: block; color: var(--kin); font-family: var(--display); font-size: 16px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.jp-hyo-head { display: grid; grid-template-columns: 60px 1fr; gap: 10px; align-items: center; margin-top: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.jp-hyo-head b { display: block; font-family: var(--display); font-size: 19px; letter-spacing: .1em; }
.jp-hyo-head small { display: block; font-size: 12px; color: var(--washi-dim); }
.jp-role { margin: 10px 0 4px; padding: 8px 10px; font-size: 13px; line-height: 1.6; background: rgba(194,162,90,.1); border-left: 3px solid var(--kin); }
.jp-hyo-p span.on, .note span.on { color: var(--kin); font-weight: 700; }
.jp-prop { display: grid; grid-template-columns: 48px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.jp-prop .jp-face { width: 48px; height: 48px; }
.jp-pw2 b { font-family: var(--display); font-size: 15px; letter-spacing: .06em; margin-right: 6px; }
.jp-pw2 small { font-size: 12px; color: var(--washi-dim); }
.jp-prop p { margin: 4px 0 6px; font-family: var(--display); font-size: 14px; line-height: 1.7; }
.jp-prop .row { display: flex; gap: 6px; margin: 0; }
.jp-prop .btn { min-height: 44px; padding: 6px 14px; }
.jp-prop.adopted, .jp-prop.lord { background: rgba(120,150,80,.1); }
.jp-prop.rejected, .jp-prop.failed { opacity: .62; }
.jp-pst { font-size: 13px; font-weight: 700; padding: 4px 0; }
.jp-pst.adopted, .jp-pst.lord { color: #b9d39a; } .jp-pst.rejected, .jp-pst.failed { color: var(--washi-dim); }
.jp-say { display: grid; gap: 6px; }
.jp-say .btn { display: flex; justify-content: space-between; align-items: center; min-height: 48px; text-align: left; padding: 6px 12px; letter-spacing: .04em; }
.jp-say .btn small { font-size: 12px; opacity: .8; }
.jp-trial { margin-top: 16px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 12px; color: var(--washi-dim); }
.jp-glist { display: grid; gap: 2px; margin: 4px 0 8px; }
.jp-grow { display: grid; grid-template-columns: 36px 1fr auto; gap: 8px; align-items: center; min-height: 48px; padding: 4px 6px; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--line); color: var(--washi); cursor: pointer; font-family: var(--ui); }
.jp-grow:hover, .jp-grow.on { background: rgba(194,162,90,.1); }
.jp-grow .nm { min-width: 0; }
.jp-grow .nm b { display: block; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jp-grow .nm small { display: block; font-size: 12px; color: var(--washi-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jp-grow .jp-st { flex-wrap: nowrap; gap: 0 4px; font-size: 12px; }
.jp-bd { margin: 12px 0 8px; padding: 12px; background: rgba(14,11,8,.6); border: 1px solid var(--gold-line); outline: none; }
.jp-bd:focus-visible { box-shadow: 0 0 0 2px var(--kin); }
.jp-bdh { display: grid; grid-template-columns: 88px 1fr auto; gap: 12px; align-items: start; margin-bottom: 8px; }
.jp-bdh b { display: block; font-family: var(--display); font-size: 22px; letter-spacing: .08em; }
.jp-bdh small { display: block; font-size: 12px; color: var(--washi-dim); }
.jp-bdh .btn { min-width: 44px; min-height: 44px; padding: 0; }
.jp-bd .jp-mt { margin: 3px 0; }
.jp-bio { font-family: var(--display); font-size: 13px; line-height: 1.8; margin: 8px 0; color: var(--washi); }
.jp-bd > .btn { display: flex; flex-direction: column; align-items: flex-start; min-height: 48px; margin-top: 6px; }
.jp-bd > .btn small { font-size: 12px; opacity: .8; letter-spacing: 0; }
.jp-left { margin: 0 0 6px; flex-basis: 100%; color: #e6c77a; }
.jp-foot { flex-wrap: wrap; }
/* 大きな武将の一覧 */
.jp-roster { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; background: rgba(10,9,7,.55); padding: 24px; }
.jp-rs { width: min(1100px, 100%); height: min(760px, 100%); display: grid; grid-template-rows: auto 1fr; background: var(--sumi-2); border: 1px solid var(--gold-line); box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.jp-rsh { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--gold-line); }
.jp-rsh h3 { margin: 0; font-family: var(--display); font-size: 22px; letter-spacing: .14em; }
.jp-rsh h3 small { font-family: var(--ui); font-size: 12px; color: var(--washi-dim); margin-left: 8px; letter-spacing: 0; }
.jp-rsh .jp-chips { margin: 0; flex: 1; }
.jp-rsh .btn { min-height: 44px; }
.jp-rsb { overflow: auto; }
.jp-rsb table { width: 100%; border-collapse: collapse; font-size: 13px; }
.jp-rsb thead th { position: sticky; top: 0; z-index: 1; background: #1f1a14; color: var(--kin); font-weight: 600; text-align: left; padding: 0 8px; height: 44px; border-bottom: 1px solid var(--gold-line); white-space: nowrap; font-size: 12px; letter-spacing: .1em; }
.jp-rsb thead th button { appearance: none; background: none; border: 0; color: inherit; font: inherit; min-height: 44px; padding: 0 4px; cursor: pointer; letter-spacing: .1em; }
.jp-rsb thead th[aria-sort="ascending"], .jp-rsb thead th[aria-sort="descending"] { color: var(--washi); background: #2a231a; }
.jp-rsb tbody tr { border-bottom: 1px solid var(--line); }
.jp-rsb tbody tr:hover { background: rgba(194,162,90,.08); }
.jp-rsb tbody tr.me { background: rgba(194,162,90,.14); }
.jp-rsb td, .jp-rsb tbody th { padding: 3px 8px; white-space: nowrap; font-weight: 400; text-align: left; }
.jp-rsb tbody th button { display: flex; align-items: center; gap: 8px; min-height: 44px; background: none; border: 0; color: var(--washi); font: 600 14px var(--ui); cursor: pointer; padding: 0; }
.jp-rsb tbody th button:hover span { color: var(--kin); text-decoration: underline; }
.jp-rsb td.v { text-align: right; font-family: var(--display); font-size: 15px; font-variant-numeric: tabular-nums; }
.jp-rsb td.v.hi { color: #f0d58a; font-weight: 700; } .jp-rsb td.v.lo { color: #e79a86; }
.jp-promo .jp-rc h3 { color: var(--kin); }
/* 勢力の帯（地図の上。家ごとの城の数を帯の長さで） */
.jp-power { position: absolute; z-index: 1; left: 16px; right: 16px; top: 72px; display: flex; align-items: stretch; gap: 2px; padding: 4px 10px 3px 8px; background: rgba(20,17,13,.86); box-shadow: 0 0 0 1px rgba(194,162,90,.45); pointer-events: none; }
.jp-power > span { flex: 0 0 auto; align-self: center; font-family: var(--display); font-size: 12px; color: var(--kin); letter-spacing: .14em; margin-right: 6px; }
.jp-power i { display: flex; flex-direction: column; gap: 2px; min-width: 3px; font-style: normal; overflow: hidden; }
.jp-power i::before { content: ''; display: block; height: 7px; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0,0,0,.35); }
.jp-power i.me::before { height: 9px; margin-top: -1px; box-shadow: 0 0 0 1.5px #e8c05c; }
.jp-power i.etc::before { background: repeating-linear-gradient(135deg, #6b6254 0 3px, #4a4338 3px 6px); }
.jp-power i b { min-height: 15px; font-size: 12px; font-weight: 500; color: #e9dfc8; white-space: nowrap; overflow: hidden; line-height: 15px; font-variant-numeric: tabular-nums; }
.jp-power i.me { flex-shrink: 0; min-width: max-content; }
.jp-power i.me b { color: #f0d58a; font-weight: 700; padding-right: 2px; }
.jp-power em { font-style: normal; margin-left: 2px; } .jp-power em.up { color: #b9d39a; } .jp-power em.down { color: #f2a48e; }
@media (max-height: 500px) {
  .jp { grid-template-columns: minmax(0, 1fr) 290px; }
  .jp-side { padding: 12px 12px 16px; }
  .jp-when { font-size: 22px; margin: 2px 0 6px; }
  .jp-tabs button { font-size: 14px; letter-spacing: .04em; }
  .jp-power { top: 64px; left: 8px; right: 8px; }
  .jp-hint { display: none; }
  .jp:not(.j3) .jp-season { left: 132px; top: 8px; padding: 4px; }
  .jp:not(.j3) .jp-season b { width: 36px; height: 36px; font-size: 18px; }
  .jp:not(.j3) .jp-season span { display: none; }
  .jp:not(.j3) .jp-tools { top: 8px; right: 8px; }
  .jp:not(.j3) .jp-tools .btn { min-height: 44px; padding: 0 8px; }
  .jp:not(.j3) .jp-legend { display: none; left: 8px; bottom: 8px; padding: 6px 10px; gap: 4px 12px; max-width: calc(100% - 70px); }
  .jp:not(.j3) .jp-map.leg .jp-legend { display: flex; }
  .jp:not(.j3) .jp-leg2 { display: inline-flex; align-items: center; }
}
.jp-leg2 { display: none; }
/* 低い画面でも「承る」まで届くように、札の中を巻けるように */
.jp-promo .jp-rc { max-height: calc(100% - 16px); overflow-y: auto; }
@media (max-height: 520px) { .jp-promo .jp-rc { padding: 14px 18px; } .jp-promo .jp-rc h3 { margin: 4px 0; } .jp-promo .jp-open { margin: 6px 0; padding: 6px 10px; } }
`;
  document.head.appendChild(st);
}
let active = null;
// 画面を開き直しても覚えておく物（開いていた札）
const UI = { tab: 'shiro' };
// 城下などから、開いた時の札を決めて入る（'shiro' 城と外交・'naisei' 内政・'busho' 家臣・'hyo' 評定・'tenka' 天下）
export function japanTab(k) { if (['shiro', 'naisei', 'hyo', 'busho', 'tenka'].includes(k)) UI.tab = k; }
export function closeJapan() { if (active) { active.dispose(); active = null; } }

// o：{ from: 'town'|'title', practice, onBack, onAttack(info), onSave(), result }
export function japanScreen(G, o) {
  closeJapan();
  const J = ensureJapan(G);
  const D = dataOf(J.scn, J.pl);
  const P = D.player;
  const sh = shape();
  // 城下の案内の札が残っていれば外す（地図の上に重ならないように）
  document.querySelectorAll('.tour').forEach((e) => e.remove());
  document.querySelectorAll('.tourhl').forEach((e) => e.classList.remove('tourhl'));
  const scr = $('screen');
  scr.hidden = false;
  scr.className = 'jp-open';
  scr.scrollTop = 0;
  const wipe = $('wipe'); if (wipe) { wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go'); }
  scr.innerHTML = `<div class="jp">
    <div class="jp-map" id="jp-map"><canvas id="jp-cv" role="img" aria-label="日本地図。攻められる城は右の一覧からも選べます"></canvas>
      <div class="jp-season" id="jp-season"></div>
      <div class="jp-moves" id="jp-moves" role="status" aria-live="polite"></div>
      <div class="jp-tools" role="group" aria-label="地図の見え方"><button class="btn small" id="jp-in" title="寄る（+）" aria-label="地図に寄る">＋</button><button class="btn small" id="jp-out" title="引く（−）" aria-label="地図を引く">－</button><button class="btn small" id="jp-home" aria-label="自分の国を見る">自国</button><button class="btn small" id="jp-all" aria-label="日本全体を見る">全国</button><button class="btn small jp-leg2" id="jp-leg2" type="button" aria-expanded="false" aria-label="地図の見方（凡例）を開く">凡例</button></div>
      <div class="jp-legend"><span><i class="lg yama"></i>山城</span><span><i class="lg hira"></i>平城</span><span><i class="lg toride"></i>砦</span><span><i class="lg hq"></i>本城</span><span><i class="lg tgt"></i>攻められる城</span><span><b class="lgs">危</b>狙われそうな自分の城</span><span><b class="lgs red">落</b>この季節に落ちた城</span><span><b class="lgd">●</b>守りの固さ</span><span><i class="lgr"></i>街道</span><span><i class="lgr front"></i>攻め口</span></div>
      <div class="jp-power" id="jp-power" role="img" aria-label="勢力"></div>
      <p class="jp-hint">ドラッグ・矢印キーで動かす ・ ホイール・＋－で寄る ・ 城を押して選ぶ</p>
    </div>
    <aside class="jp-side" id="jp-side"></aside>
  </div>`;
  const cv = $('jp-cv'), mapEl = $('jp-map');
  { const lb = $('jp-leg2'); if (lb) lb.onclick = () => { const on = mapEl.classList.toggle('leg'); lb.setAttribute('aria-expanded', String(on)); lb.setAttribute('aria-label', on ? '地図の見方（凡例）を閉じる' : '地図の見方（凡例）を開く'); }; }
  const ctx = cv.getContext('2d');
  const inkRGB = {};
  for (const [id, css] of Object.entries(D.ink)) inkRGB[id] = rgbOf(css);
  let sel = null, hover = null;
  let view = { s: 1, ox: 0, oy: 0 };
  let dirty = true, raf = 0;
  let result = o.result || null;
  injectStyle();
  // 596：季節を送った直後、駒が城から城へ進む（動きを減らす設定では出さない）
  const still = () => !!S_.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anim = null;
  let m3 = null; // 3D の地図（japan3d.js）。使えない時・平面を選んだ時は null で、下の 2D の地図のまま
  const startAnim = () => { if (!still() && (J.moves || []).length) { anim = { t0: performance.now(), dur: 1400 }; dirty = true; } };

  // 家の色で塗る地（城の持ち主が変わるたびに作り直す）
  const terr = document.createElement('canvas'); terr.width = GRID.gc; terr.height = GRID.gr;
  const terrBig = document.createElement('canvas'); terrBig.width = GRID.gc * 4; terrBig.height = GRID.gr * 4;
  const paintTerritory = () => {
    // 天下に占める城の割合（半分で最も濃い）。攻め落とすほど自分の国の色が濃く、はっきりしてくる
    const share = Math.min(1, (castlesOf(J, P).length / Math.max(1, D.castles.length)) * 2);
    const g = terr.getContext('2d');
    const img = g.createImageData(GRID.gc, GRID.gr);
    const own = (i) => { const k = D.near[i]; return k < 0 ? null : J.own[D.castles[k].id]; };
    for (let r = 0; r < GRID.gr; r++) for (let q = 0; q < GRID.gc; q++) {
      const i = r * GRID.gc + q, cl = own(i);
      if (cl == null) continue;
      const rgb = inkRGB[cl] || [120, 120, 120];
      // 別の家との境は濃く（形勢の境目が見えるように）
      let edge = false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qq = q + a, rr = r + b; if (qq < 0 || rr < 0 || qq >= GRID.gc || rr >= GRID.gr) continue; const o2 = own(rr * GRID.gc + qq); if (o2 != null && o2 !== cl) edge = true; }
      if (cl === P && !edge) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o3 = own((r + b) * GRID.gc + q + a); if (o3 !== cl) edge = true; }
      // 594：自分の国は縁を金で囲み、海と見分けやすく
      if (cl === P && edge) img.data.set([200, 160, 70, 230], i * 4);
      else {
        // 色を和紙の地に寄せて、青い家の国が海に見えないように
        // 地図の色は濃く（japan-map）、天下に占める城が増えるほど自分の国はさらに濃く（japan-play）
        const k = edge ? 0.08 : cl === P ? 0.3 - 0.2 * share : 0.16;
        img.data.set([rgb[0] + (232 - rgb[0]) * k, rgb[1] + (214 - rgb[1]) * k, rgb[2] + (178 - rgb[2]) * k, edge ? 190 : cl === P ? Math.round(130 + 60 * share) : 118], i * 4);
      }
    }
    g.putImageData(img, 0, 0);
    clanAt = clanAnchors();
    // 升目の角が出ないよう、四倍に引き伸ばしてにじませる（水彩の色の境）
    const bg = terrBig.getContext('2d');
    bg.clearRect(0, 0, terrBig.width, terrBig.height);
    bg.filter = 'blur(3px)'; bg.imageSmoothingEnabled = true;
    bg.drawImage(terr, 0, 0, terrBig.width, terrBig.height);
    bg.filter = 'none';
    if (m3) m3.paint();
  };
  // 家の名を置く所：いちばん大きな一続きの領地の真ん中（その領地の升に寄せる）
  let clanAt = [];
  function clanAnchors() {
    const { gc, gr } = GRID, n = gc * gr;
    const own = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) { const k = D.near[i]; if (k >= 0) own[i] = J.own[D.castles[k].id]; }
    const comp = new Uint8Array(n), stack = [], best = {};
    for (let i0 = 0; i0 < n; i0++) {
      if (own[i0] < 0 || comp[i0]) continue;
      const id = own[i0], cells = [];
      comp[i0] = 1; stack.push(i0);
      while (stack.length) {
        const i = stack.pop(); cells.push(i);
        const q = i % gc, r = (i - q) / gc;
        for (const j of [q > 0 ? i - 1 : -1, q < gc - 1 ? i + 1 : -1, r > 0 ? i - gc : -1, r < gr - 1 ? i + gc : -1]) if (j >= 0 && !comp[j] && own[j] === id) { comp[j] = 1; stack.push(j); }
      }
      if (!best[id] || cells.length > best[id].length) best[id] = cells;
    }
    const out = [];
    for (const [id, cells] of Object.entries(best)) {
      let sx = 0, sz = 0;
      for (const i of cells) { sx += i % gc; sz += Math.floor(i / gc); }
      sx /= cells.length; sz /= cells.length;
      let bi = cells[0], bd = 1e9;
      for (const i of cells) { const d = (i % gc - sx) ** 2 + (Math.floor(i / gc) - sz) ** 2; if (d < bd) { bd = d; bi = i; } }
      out.push({ id: +id, x: (bi % gc) * S + 1.5, y: Math.floor(bi / gc) * S + 1.5, n: cells.length });
    }
    return out.sort((a, b) => (b.id === P) - (a.id === P) || b.n - a.n);
  }
  paintTerritory();

  const resize = () => {
    const r = mapEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    dirty = true;
  };
  const W = () => cv.width / Math.min(2, window.devicePixelRatio || 1), H = () => cv.height / Math.min(2, window.devicePixelRatio || 1);
  const fit = (x0, y0, x1, y1, pad = 40) => {
    const s = Math.min((W() - pad * 2) / (x1 - x0), (H() - pad * 2) / (y1 - y0));
    view.s = Math.max(0.5, Math.min(9, s));
    view.ox = W() / 2 - ((x0 + x1) / 2) * view.s;
    view.oy = H() / 2 - ((y0 + y1) / 2) * view.s;
    dirty = true;
  };
  const home = () => {
    const mine = castlesOf(J, P).map((id) => D.byId[id]);
    const pts = [...mine];
    for (const c of mine) for (const n of D.adj[c.id]) pts.push(D.byId[n]);
    if (!pts.length) { fit(...sh.bounds); return; }
    let x0 = Math.min(...pts.map((c) => c.c)), x1 = Math.max(...pts.map((c) => c.c)), y0 = Math.min(...pts.map((c) => c.r)), y1 = Math.max(...pts.map((c) => c.r));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = Math.max(70, (x1 - x0) / 2 + 30, (y1 - y0) / 2 + 30);
    fit(cx - half, cy - half * 0.75, cx + half, cy + half * 0.75, 30);
  };
  const zoomAt = (k, sx, sy) => {
    const s2 = Math.max(0.5, Math.min(9, view.s * k));
    view.ox = sx - (sx - view.ox) * (s2 / view.s);
    view.oy = sy - (sy - view.oy) * (s2 / view.s);
    view.s = s2; dirty = true;
  };
  const scr2 = (c) => [view.ox + c.c * view.s, view.oy + c.r * view.s];
  const iconR = (c) => Math.max(6, Math.min(15, view.s * 3.2)) * (c.hq ? 1.2 : 1);

  // ---------------- 描く ----------------
  // この季節の大名の動き：誰が・どの城へ・どうなったかを、地図の上に短い字で（色だけに頼らず、家の名と結果の字も）
  let movesKey = '';
  const updMoves = () => {
    const el = $('jp-moves'); if (!el) return;
    const ms = (J.moves || []).filter((m) => D.byId[m.to]);
    const key = J.turn + ':' + ms.length;
    if (key === movesKey) return;
    movesKey = key;
    if (!ms.length) { el.hidden = true; return; }
    const row = (m) => { const cl = D.clans[m.clan] || {}, c = D.byId[m.to]; const res = m.threat ? '狙う' : m.won ? '落とす' : '退く'; return `<li class="${m.threat ? 'th' : m.won ? 'wn' : ''}"><i style="background:${D.ink[m.clan] || '#555'}"></i><b>${esc(cl.name || '')}</b>→${esc(c.name)}<em>${res}</em></li>`; };
    el.hidden = false;
    el.innerHTML = `<small>この季節の動き</small><ul>${ms.slice(0, 4).map(row).join('')}</ul>${ms.length > 4 ? `<small>ほか ${ms.length - 4}</small>` : ''}`;
  };
  const draw = () => {
    updMoves();
    if (m3) { m3.redraw(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = W(), h = H(), s = view.s;
    const now = when(D, J.turn);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 海：薄い藍に和紙の目
    ctx.fillStyle = '#9fb2b3'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.3; ctx.fillStyle = ctx.createPattern(sh.paper, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    // 沖の波（細い弧を散らす）
    ctx.strokeStyle = 'rgba(40,62,80,0.22)'; ctx.lineWidth = 1;
    const wv = 46, off = ((view.ox % wv) + wv) % wv, offy = ((view.oy % wv) + wv) % wv;
    for (let y = -wv + offy; y < h + wv; y += wv) for (let x = -wv + off + ((Math.round((y - offy) / wv) & 1) * wv) / 2; x < w + wv; x += wv) {
      ctx.beginPath(); ctx.arc(x, y + 6, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 9, y + 8, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
    // 波の線：海岸に沿って薄く幾重にも
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [lw, a] of [[16, 0.07], [9, 0.1], [4, 0.12]]) { ctx.strokeStyle = `rgba(52,74,92,${a})`; ctx.lineWidth = lw / Math.sqrt(s); ctx.stroke(sh.coast); }
    // 陸
    ctx.fillStyle = '#e8dcc0'; ctx.fill(sh.coast, 'evenodd');
    ctx.save(); ctx.clip(sh.coast, 'evenodd');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(terrBig, 0, 0, GRID.gc * S, GRID.gr * S);
    // 季節の色
    const tint = { 春: 'rgba(214,160,170,0.10)', 夏: 'rgba(110,140,70,0.08)', 秋: 'rgba(190,120,50,0.11)', 冬: 'rgba(245,245,250,0.22)' }[now.season];
    ctx.fillStyle = tint; ctx.fillRect(0, 0, GRID.cols, GRID.rows);
    ctx.restore();
    // 和紙の目を陸にも
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = ctx.createPattern(sh.paper, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore();
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
    // 山：筆の「へ」を重ねる（冬は北の山に雪）
    const vx0 = -view.ox / s - 10, vy0 = -view.oy / s - 10, vx1 = (w - view.ox) / s + 10, vy1 = (h - view.oy) / s + 10;
    const mk = s < 1.2 ? 2 : 1;
    ctx.lineWidth = 1.1 / s;
    for (let i = 0; i < sh.mtn.length; i += mk) {
      const [x, y, v] = sh.mtn[i];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const hh = 2.6 + v * 0.4, ww = 2.8 + v * 0.35, ox = 0;
      if (now.season === '冬' && y < 760) { ctx.fillStyle = 'rgba(250,250,252,0.75)'; ctx.beginPath(); ctx.moveTo(x + ox - ww * 0.45, y - hh * 0.35); ctx.lineTo(x + ox, y - hh); ctx.lineTo(x + ox + ww * 0.45, y - hh * 0.35); ctx.fill(); }
      ctx.strokeStyle = 'rgba(70,58,44,0.42)';
      ctx.beginPath(); ctx.moveTo(x + ox - ww, y + 0.4); ctx.quadraticCurveTo(x + ox - ww * 0.3, y - hh * 0.7, x + ox, y - hh); ctx.quadraticCurveTo(x + ox + ww * 0.35, y - hh * 0.6, x + ox + ww, y + 0.4); ctx.stroke();
    }
    // 国境（墨の細い線）と海岸（太い線）
    ctx.strokeStyle = 'rgba(62,48,34,0.5)'; ctx.lineWidth = 0.9 / s; ctx.setLineDash([3 / s, 2.2 / s]); ctx.stroke(sh.borders); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(30,24,18,0.9)'; ctx.lineWidth = 1.7 / s; ctx.stroke(sh.coast);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 国の名
    if (s >= 1.1) {
      const fs = Math.max(12, Math.min(20, s * 4.2));
      ctx.font = `${fs}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(60,46,30,0.42)';
      for (const p of PROVINCES) {
        const x = view.ox + p.c * s, y = view.oy + p.r * s;
        if (x < -40 || y < -20 || x > w + 40 || y > h + 20) continue;
        ctx.fillText(p.name, x, y - (s > 2.5 ? 18 : 0));
      }
    }
    // 大名家の名（領地の上に大きく。狭すぎる所は出さない）
    {
      const lb = [];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (const a of clanAt) {
        const size = Math.sqrt(a.n) * S * s;
        const cl = D.clans[a.id];
        if (!cl || (size < 90 && a.id !== P) || size < 50) continue;
        const x = view.ox + a.x * s, y = view.oy + a.y * s;
        if (x < 20 || y < 20 || x > w - 20 || y > h - 20) continue;
        const fs = Math.max(15, Math.min(32, size * 0.15));
        const bw = cl.name.length * fs * 1.2, bh = fs * 1.3;
        if (lb.some((b) => Math.abs(b[0] - x) < (b[2] + bw) / 2 && Math.abs(b[1] - y) < (b[3] + bh) / 2)) continue;
        lb.push([x, y, bw, bh]);
        ctx.font = `800 ${fs}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
        ctx.letterSpacing = `${(fs * 0.18).toFixed(1)}px`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(245,236,214,0.9)'; ctx.strokeText(cl.name, x, y);
        ctx.fillStyle = a.id === P ? '#6e4f10' : D.ink[a.id] || '#333'; ctx.globalAlpha = 0.95; ctx.fillText(cl.name, x, y); ctx.globalAlpha = 1;
        ctx.letterSpacing = '0px';
        ctx.fillStyle = D.ink[a.id] || '#333'; ctx.fillRect(x - bw / 2 + fs * 0.2, y + fs * 0.62, bw - fs * 0.4, 3);
      }
    }
    // 街道（隣り合う城どうし、淡い土の道）と攻め口（朱の点線と矢じり）
    if (s >= 0.8) {
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const c of D.castles) for (const nid of D.adj[c.id]) { if (nid < c.id) continue; const b = D.byId[nid]; const [x0, y0] = scr2(c), [x1, y1] = scr2(b); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.strokeStyle = 'rgba(70,50,28,0.35)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(246,232,196,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    for (const c of D.castles) {
      const from = attackable(D, J, c); if (!from || c === sel) continue;
      const [x0, y0] = scr2(from), [x1, y1] = scr2(c);
      const len = Math.hypot(x1 - x0, y1 - y0); if (len < 20) continue;
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len, ra = iconR(from) + 2, rb = iconR(c) * 1.95 + 4;
      const sx = x0 + ux * ra, sy = y0 + uy * ra, ex = x1 - ux * rb, ey = y1 - uy * rb;
      ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 2.4; ctx.strokeStyle = '#c8452c';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#c8452c'; ctx.beginPath(); ctx.moveTo(ex + ux * 2, ey + uy * 2); ctx.lineTo(ex - ux * 8 - uy * 5, ey - uy * 8 + ux * 5); ctx.lineTo(ex - ux * 8 + uy * 5, ey - uy * 8 - ux * 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 軍勢の駒：この季節の攻め（矢印と駒）
    const moves = J.moves || [];
    for (const m of moves) drawMove(m, false);
    // 選んだ城へ攻め入るなら、その道も
    const pend = sel && attackable(D, J, sel);
    if (pend) drawMove({ from: pend.id, to: sel.id, clan: P, pending: true }, true);
    // 城
    const tgts = new Set(D.castles.filter((c) => attackable(D, J, c)).map((c) => c.id));
    const order = [...D.castles].sort((a, b) => (a === sel) - (b === sel) || (J.own[a.id] === P) - (J.own[b.id] === P));
    for (const c of order) {
      const [x, y] = scr2(c);
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) continue;
      drawCastle(c, x, y, tgts.has(c.id));
    }
    // 名札（重ならないよう、大事な城から）
    const boxes = [];
    const names = [...D.castles].sort((a, b) => rank(b, tgts) - rank(a, tgts));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const c of names) {
      const imp = rank(c, tgts);
      if (s < 2.6 && imp < 2) continue;
      if (s < 1.2 && imp < 3) continue;
      const [x, y] = scr2(c);
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) continue;
      const fs = imp >= 3 ? 13 : 12;
      ctx.font = `${imp >= 3 ? 700 : 500} ${fs}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
      const tw = ctx.measureText(c.name).width;
      const R = iconR(c), bx = x - tw / 2 - 2, by = y + R + 3, bw = tw + 4, bh = fs + 3;
      if (boxes.some((b) => bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1])) continue;
      boxes.push([bx, by, bw, bh]);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(236,226,202,0.92)'; ctx.strokeText(c.name, x, by + 1);
      ctx.fillStyle = c === sel ? '#8e2f1f' : J.own[c.id] === P ? '#1f2f4c' : '#241c14';
      ctx.fillText(c.name, x, by + 1);
    }
    // 594：指した城の小さな札（名・持ち主・見込み）
    if (hover && hover !== sel) drawTip(hover);
    // 方位と縮尺の飾り
    ctx.save(); ctx.translate(w - 44, h - 58);
    ctx.strokeStyle = 'rgba(40,30,20,0.7)'; ctx.fillStyle = 'rgba(40,30,20,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, 0); ctx.lineTo(0, 14); ctx.lineTo(-4, 0); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
    ctx.font = '13px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('北', 0, -18);
    ctx.restore();
  };
  function drawTip(c) {
    const [x, y] = scr2(c);
    const cl = D.clans[J.own[c.id]];
    const mine = J.own[c.id] === P;
    const l1 = c.name + (c.hq ? '（本城）' : '');
    const l2 = `${cl.name}・${TYPE_NAME[c.type]}・兵およそ${troopsOf(c, J).toLocaleString('ja-JP')}`;
    const l3 = mine ? (dangerOf(D, J, c) >= 2 ? '隣の敵が強い。守りを固めたい' : `守りの固さ ${'●'.repeat(J.fort[c.id] || 0)}${'○'.repeat(3 - (J.fort[c.id] || 0))}`) : attackable(D, J, c) ? `攻めれば：${oddsOf(D, J, c)[0]}` : allied(D, P, J.own[c.id], J) ? '味方の家' : '隣り合っていない';
    ctx.save();
    ctx.font = '600 14px "Shippori Mincho B1", "Hiragino Mincho ProN", serif';
    const w1 = ctx.measureText(l1).width;
    ctx.font = '13px "Hiragino Sans", sans-serif';
    const bw = Math.max(w1, ctx.measureText(l2).width, ctx.measureText(l3).width) + 20, bh = 64;
    let bx = x + iconR(c) * 2 + 8, by = y - bh / 2;
    if (bx + bw > W() - 8) bx = x - iconR(c) * 2 - 8 - bw;
    by = Math.max(8, Math.min(H() - bh - 8, by));
    ctx.fillStyle = 'rgba(28,22,16,0.94)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(194,162,90,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#f3ead6'; ctx.font = '600 14px "Shippori Mincho B1", "Hiragino Mincho ProN", serif'; ctx.fillText(l1, bx + 10, by + 7);
    ctx.font = '13px "Hiragino Sans", sans-serif'; ctx.fillStyle = '#d9ccb0'; ctx.fillText(l2, bx + 10, by + 26);
    const odd = !mine && attackable(D, J, c) ? oddsOf(D, J, c)[1] : '';
    ctx.fillStyle = odd === 'good' ? '#b3c894' : odd === 'bad' || (mine && dangerOf(D, J, c) >= 2) ? '#f0a08a' : '#e6c77a'; ctx.fillText(l3, bx + 10, by + 44);
    ctx.restore();
  }
  const rank = (c, tgts) => (c === sel || c === hover ? 5 : J.own[c.id] === P ? 4 : tgts.has(c.id) ? 3.5 : c.hq ? 3 : 1);

  function drawCastle(c, x, y, isTgt) {
    const cl = J.own[c.id];
    const col = D.ink[cl] || '#777';
    const R = iconR(c);
    ctx.save();
    // 型の印（山城は土の盛り上がり、平城は堀の四角、砦は柵の輪）
    ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(30,24,18,0.85)';
    if (c.type === 'yama') {
      ctx.fillStyle = 'rgba(120,98,66,0.55)';
      ctx.beginPath(); ctx.moveTo(x - R * 1.7, y + R * 0.95); ctx.quadraticCurveTo(x - R * 0.6, y - R * 1.9, x, y - R * 1.55); ctx.quadraticCurveTo(x + R * 0.6, y - R * 1.9, x + R * 1.7, y + R * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (c.type === 'hira') {
      ctx.fillStyle = 'rgba(80,110,130,0.35)';
      const a = R * 1.4; ctx.fillRect(x - a, y - a, a * 2, a * 2); ctx.strokeRect(x - a, y - a, a * 2, a * 2);
      ctx.strokeRect(x - a + 2.5, y - a + 2.5, a * 2 - 5, a * 2 - 5);
    } else {
      ctx.setLineDash([2.2, 1.8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R * 1.45, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // 攻められる城：朱の破線の輪
    if (isTgt) {
      ctx.strokeStyle = '#b8402a'; ctx.lineWidth = 2.2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(x, y, R * 1.95 + 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // 攻められる城には、勝ち目の一言（有利・五分・不利）を札で添える。押して選べば右に詳しく
      const [ot, ok] = oddsOf(D, J, c);
      ctx.save(); ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(ot).width + 10, ty = y + R * 1.95 + 12;
      ctx.fillStyle = ok === 'good' ? '#2f5a2a' : ok === 'even' ? '#6a5220' : '#7a2a1c'; ctx.fillRect(x - tw / 2, ty - 8, tw, 16);
      ctx.fillStyle = '#f4ecd8'; ctx.fillText(ot, x, ty + 0.5); ctx.restore();
    }
    // 本城：金の輪
    if (c.hq) { ctx.strokeStyle = '#b8963e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, R + 3, 0, Math.PI * 2); ctx.stroke(); }
    // 家の色の丸と家紋
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b1510'; ctx.stroke();
    if (R >= 9) {
      const clan = D.clans[cl];
      const mk = MON_OF[clan.name];
      if (mk) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, R - 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(monImage(mk), x - R + 2, y - R + 2, (R - 2) * 2, (R - 2) * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f3ead6'; ctx.font = `700 ${Math.max(11, Math.round(R * 1.15))}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(clan.crest || clan.name[0], x, y + 1);
      }
    }
    if (c === sel || c === hover) { ctx.strokeStyle = c === sel ? '#c2a25a' : 'rgba(40,30,20,0.6)'; ctx.lineWidth = c === sel ? 3 : 2; ctx.beginPath(); ctx.arc(x, y, R * 2.25 + 3, 0, Math.PI * 2); ctx.stroke(); }
    // 591：自分の城の守りの固さ（下に小さな点）
    if (cl === P && R >= 7) {
      const f = J.fort[c.id] || 0;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 7 + i * 7, y - R - 6, 2.4, 0, Math.PI * 2); ctx.fillStyle = i < f ? '#c2a25a' : 'rgba(236,226,202,0.85)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#1b1510'; ctx.stroke(); }
    }
    // 597：この季節に持ち主が替わった城は、墨の煙と「落」の印（自分が取った城は朱）
    if (J.fallen[c.id] === J.turn && J.turn > 0) {
      ctx.fillStyle = 'rgba(40,34,30,0.28)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + R * 0.5 + i * 3, y - R - 6 - i * 6, R * 0.45 + i * 1.6, 0, Math.PI * 2); ctx.fill(); }
      stamp(x + R + 3, y + R * 0.2, '落', cl === P ? '#b8402a' : '#2a2017');
    }
    // 600：隣の敵が強い自分の城に「危」、攻め寄せられている城に「急」
    if (cl === P) {
      if (J.threats.some((t) => t.to === c.id)) stamp(x - R - 13, y + R * 0.2, '急', '#b8402a');
      else if (dangerOf(D, J, c) >= 2) stamp(x - R - 13, y + R * 0.2, '危', '#9b3524', true);
    }
    ctx.restore();
  }
  // 小さな角印
  function stamp(x, y, ch, col, hollow) {
    ctx.save();
    ctx.fillStyle = hollow ? 'rgba(243,234,214,0.95)' : col; ctx.fillRect(x - 1, y - 8, 17, 17);
    ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.strokeRect(x - 1, y - 8, 17, 17);
    ctx.fillStyle = hollow ? col : '#f3ead6'; ctx.font = '700 13px "Shippori Mincho B1", "Hiragino Mincho ProN", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x + 7.5, y + 1.5);
    ctx.restore();
  }
  // 攻めの矢印と駒（将棋の駒の形に家の一字）
  function drawMove(m, pending) {
    const a = D.byId[m.from], b = D.byId[m.to];
    if (!a || !b) return;
    const [x0, y0] = scr2(a), [x1, y1] = scr2(b);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 6) return;
    const col = m.threat ? '#b8402a' : D.ink[m.clan] || '#555';
    // 596：動きの進み（0→1）。送った直後だけ、線が伸びて駒が進む
    const k = anim && !pending ? Math.min(1, (performance.now() - anim.t0) / anim.dur) : 1;
    const ease = 1 - Math.pow(1 - k, 3);
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const ra = iconR(a) + 3, rb = iconR(b) * 1.9 + 4;
    const sx = x0 + ux * ra, sy = y0 + uy * ra, ex = x1 - ux * rb, ey = y1 - uy * rb;
    // 少し弧を描く
    const mx = (sx + ex) / 2 - uy * len * 0.12, my = (sy + ey) / 2 + ux * len * 0.12;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = pending ? '#b8402a' : col; ctx.globalAlpha = pending || m.threat ? 0.95 : m.won ? 0.9 : 0.6;
    ctx.lineWidth = pending || m.threat ? 3.4 : 2.6;
    if (!m.won && !pending && !m.threat) ctx.setLineDash([5, 4]);
    const bez = (t) => [(1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey];
    ctx.beginPath(); ctx.moveTo(sx, sy);
    if (k < 1) { for (let i = 1; i <= 16; i++) { const [qx, qy] = bez((i / 16) * ease); ctx.lineTo(qx, qy); } }
    else ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke(); ctx.setLineDash([]);
    if (k < 1) {
      // 駒だけ進める（負けた攻めは、城の手前で押し返される）
      const tt = m.won || m.threat ? 0.08 + 0.72 * ease : k < 0.7 ? 0.08 + 0.8 * (1 - Math.pow(1 - k / 0.7, 3)) : 0.88 - 0.43 * ((k - 0.7) / 0.3);
      const [px, py] = bez(tt);
      piece(px, py, Math.atan2(ey - my, ex - mx), 11, col, m);
      ctx.restore();
      return;
    }
    const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty) || 1;
    const hx = tx / tl, hy = ty / tl, hs = pending ? 11 : 9;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(ex + hx * 3, ey + hy * 3); ctx.lineTo(ex - hx * hs - hy * hs * 0.6, ey - hy * hs + hx * hs * 0.6); ctx.lineTo(ex - hx * hs + hy * hs * 0.6, ey - hy * hs - hx * hs * 0.6); ctx.closePath(); ctx.fill();
    // 駒
    const [px, py] = bez(m.threat ? 0.7 : 0.45);
    piece(px, py, Math.atan2(hy, hx), pending ? 13 : 11, D.ink[m.clan] || '#555', m);
    ctx.restore();
  }
  // 将棋の駒の形に家の一字
  function piece(px, py, ang, K, col, m) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(px, py); ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -K * 1.15); ctx.lineTo(K * 0.8, -K * 0.55); ctx.lineTo(K * 0.95, K * 0.95); ctx.lineTo(-K * 0.95, K * 0.95); ctx.lineTo(-K * 0.8, -K * 0.55); ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = '#e2cf9e'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.4; ctx.strokeStyle = '#3a2a18'; ctx.stroke();
    ctx.rotate(-(ang + Math.PI / 2));
    ctx.fillStyle = col; ctx.font = `700 ${Math.max(11, K)}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cl = D.clans[m.clan]; ctx.fillText(cl ? (cl.crest || cl.name[0]) : '?', 0, 1);
    ctx.restore();
  }

  // ---------------- 横の札（上に家と自分の様子、下に五つの札：城・内政・評定・武将・天下） ----------------
  const nf = (v) => Math.round(v).toLocaleString('ja-JP');
  const man = (v) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : nf(v));
  const sgn = (v) => (v > 0 ? `+${nf(v)}` : v < 0 ? `−${nf(-v)}` : '±0');
  const faceOf = (b, cid) => faceURL(b.n, D.clans[cid] || { name: '浪人', crest: '浪' }, D.ink[cid] || '#5f574c', { lk: b.lk, age: N.ageOf(D, J, b.b) });
  const face = (b, cid, cls = '') => (b ? `<img class="jp-face ${cls}" alt="" src="${faceOf(b, cid)}">` : '');
  const stat4 = (b) => `<span class="jp-st" aria-label="統率${b.lea}・武勇${b.war}・知略${b.int}・政治${b.pol}"><i>統</i>${b.lea}<i>武</i>${b.war}<i>知</i>${b.int}<i>政</i>${b.pol}</span>`;
  const trChips = (b) => b.tr.map((t) => `<span class="jp-tr" title="${esc(N.TRAIT_NOTE[t] || '')}">${esc(t)}</span>`).join('');
  const meter = (label, v, max, shown, cls = '') => `<div class="jp-mt ${cls}"><span>${label}</span><i style="--v:${Math.max(3, Math.min(100, (v / Math.max(1, max)) * 100)).toFixed(0)}%"></i><b>${shown}</b></div>`;
  const clanOfGen = (n) => (J.gen[n] ? J.gen[n].c : -1);
  // 城の内政の値（石高・商業・兵・堅さ・民の心）
  const domBlock = (c) => {
    const d = J.dom[c.id], kata = N.kataOf(J, c);
    return `<div class="jp-dom">${meter('石高', d.k, c.koku * 2.2, `${man(d.k)}石`)}${meter('商業', d.s, (c.koku / 40) * 3.2, nf(d.s))}${meter('兵', d.h, Math.max(d.h, d.k * 0.07), `${nf(d.h)}人`)}${meter('堅さ', kata, 100, kata)}${meter('民の心', d.m, 100, d.m, d.m < 35 ? 'bad' : '')}${d.kj ? meter('鍛冶', d.kj, 10, d.kj) : ''}</div>`;
  };
  // 城主（顔と能力）と家老
  // karoOnly：立体の地図では右上の札に城主の顔が出るので、家老だけ
  const lordBlock = (c, karoOnly) => {
    const cid = J.own[c.id], L = N.lordOf(J, c), K = N.karoOf(J, c);
    if (!L) return '<p class="note">城主はいない（城代が守っている）</p>';
    const age = N.ageOf(D, J, L.b);
    if (karoOnly) return K.length ? `<div class="jp-karo"><span>家老</span>${K.map((k) => `<button class="jp-link" data-gen="${esc(k.n)}" style="--c:${D.ink[cid]}">${esc(k.n)}<small>${k.lea}/${k.pol}</small></button>`).join('')}</div>` : '';
    return `<button class="jp-lord" data-gen="${esc(L.n)}" aria-label="城主 ${esc(L.n)} の札を開く">${face(L, cid, 'big')}<span class="jp-lw"><small>城主${L.me ? '（自分）' : ''}</small><b>${esc(L.n)}</b><em>${age ? `${age}歳` : ''}</em>${stat4(L)}<span class="jp-trs">${trChips(L)}</span></span></button>
      ${K.length ? `<div class="jp-karo"><span>家老</span>${K.map((k) => `<button class="jp-link" data-gen="${esc(k.n)}" style="--c:${D.ink[cid]}">${esc(k.n)}<small>${k.lea}/${k.pol}</small></button>`).join('')}</div>` : ''}`;
  };
  const cmdLeft = () => { if (J.cmdT !== J.turn) { J.cmdT = J.turn; J.cmdN = 0; } return N.MIBUN[J.mibun].cmd - J.cmdN; };
  const ensureCouncil = () => {
    if (J.hyo && J.hyo.t === J.turn) return J.hyo;
    J.hyo = N.makeCouncil(D, J, { attackable: (c) => attackable(D, J, c), odds: (c) => oddsOf(D, J, c), danger: (c) => dangerOf(D, J, c), allied: (a, b) => allied(D, a, b, J), season: when(D, J.turn).season });
    return J.hyo;
  };
  let tab = UI.tab || 'shiro';
  let naiseiSel = null, bugyoSel = null, nMsg = '', hMsg = '', bFilter = 'mine', bSort = 'lea', bDetail = null, roster = null;
  const TABS = [['shiro', '城'], ['naisei', '内政'], ['hyo', '評定'], ['busho', '武将'], ['tenka', '天下']];
  // 鍵の印（内政は部将から）
  const LOCK = '<svg class="jp-lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4.6 7V5.2a3.4 3.4 0 0 1 6.8 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="2.8" y="7" width="10.4" height="7.6" rx="1.3" fill="currentColor"/></svg>';

  const side = () => {
    const now = when(D, J.turn);
    const counts = countOf(J);
    const mineN = counts[P] || 0;
    const pc = D.clans[P];
    const mb = N.MIBUN[J.mibun], next = N.KOU_NEED[J.mibun + 1];
    const hy = ensureCouncil();
    const left = cmdLeft();
    const open = hy.items.filter((x) => !x.state).length;
    const bank = J.bank[P] || { g: 0, f: 0 };
    const fl = N.flowOf(D, J, P, now.season);
    const ord = J.order && J.order.until >= J.turn && J.own[J.order.cid] !== P ? D.byId[J.order.cid] : null;
    const panel = { shiro: shiroPanel, naisei: naiseiPanel, hyo: hyoPanel, busho: bushoPanel, tenka: tenkaPanel }[tab]();
    $('jp-side').innerHTML = `
      <div class="eyebrow">日本地図${o.practice ? '（記録は残りません）' : ''}</div>
      <h2 class="jp-when">${esc(now.era)}　<span>${now.season}</span></h2>
      <div class="jp-scn" role="group" aria-label="地図の筋書き">${MAP_KEYS.map((k) => `<button class="${k === J.scn ? 'on' : ''}" aria-pressed="${k === J.scn}" data-scn="${k}">${esc(MAP_SCENARIOS[k].name.replace(/の戦い$/, ''))}</button>`).join('')}</div>
      <div id="jp-cf"></div>
      <div class="jp-me"><i class="dot" style="background:${D.ink[P]}"></i><b>${esc(pc.name)}</b><span>当主 ${esc(N.headOf(D, J, P))}・城 ${mineN}</span>
        <div class="jp-rank"><span>身分</span><b>${esc(mb.name)}</b><i style="--v:${next ? Math.min(100, ((J.kou - N.KOU_NEED[J.mibun]) / (next - N.KOU_NEED[J.mibun])) * 100).toFixed(0) : 100}%" role="img" aria-label="勲功 ${J.kou}${next ? `、次の身分まで ${next - J.kou}` : ''}"></i><small>勲功 ${J.kou}${next ? `／${next}` : ''}</small></div>
        ${m3 ? '' : `<div class="jp-res2"><span>金 <b>${nf(bank.g)}</b>貫 <em class="${fl.g >= 0 ? 'up' : 'down'}">${sgn(Math.round(fl.g / 3))}/月</em></span><span>兵糧 <b>${man(bank.f)}</b>石 <em class="${fl.f >= 0 ? 'up' : 'down'}">${sgn(Math.round(fl.f / 3))}/月</em></span><span>兵 <b>${nf(N.campaign(D, J).pool)}</b>人</span></div>`}
      </div>
      ${ord ? `<p class="jp-order" role="note"><b>主命</b>${esc(ord.name)}を攻め落とせ（あと${J.order.until - J.turn + 1}季）</p>` : ''}
      <div class="jp-tabs" role="tablist" aria-label="地図の札">${TABS.map(([k, nm]) => `<button role="tab" id="jp-tab-${k}" data-tab="${k}" aria-selected="${k === tab}" aria-controls="jp-panel" tabindex="${k === tab ? 0 : -1}">${nm}${k === 'naisei' && !N.canNaisei(J) ? `${LOCK}<span class="sr-only">（部将から）</span>` : ''}${k === 'hyo' && open ? `<i class="jp-badge" aria-label="決まっていない進言 ${open}">${open}</i>` : ''}${k === 'naisei' && left > 0 ? `<i class="jp-badge soft" aria-label="残りの命 ${left}">${left}</i>` : ''}</button>`).join('')}</div>
      <div id="jp-panel" role="tabpanel" aria-labelledby="jp-tab-${tab}">${panel}</div>
      <div class="row jp-foot">${left > 0 && N.scopeCastles(D, J).length ? `<p class="note jp-left">内政をあと${left}つ命じられる${open ? `・評定の進言が${open}つ残っている` : ''}</p>` : open ? `<p class="note jp-left">評定の進言が${open}つ残っている</p>` : ''}<button class="btn small" id="jp-next" ${J.threats.length ? 'disabled' : ''}>季節を送る（N）</button><button class="btn small" id="jp-back">${o.from === 'town' ? '城下へ戻る' : 'タイトルへ'}（Esc）</button></div>`;
    bindSide();
    $('jp-season').innerHTML = `<b>${now.season}</b><span>${esc(now.era)}<br>${esc(D.name)}</span>`;
    drawTrend();
    powerStrip();
    if (m3) m3.hud();
  };
  // 勢力の帯：家ごとの城の数を、家の色の帯の長さで（前の季節からの増減も）
  const powerStrip = () => {
    const el = $('jp-power'); if (!el) return;
    const cnt = countOf(J);
    const prev = (J.hist || []).filter((h) => h.t < J.turn).pop();
    const tot = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
    const list = Object.entries(cnt).map(([id, n]) => ({ id: +id, n })).filter((x) => D.clans[x.id]).sort((a, b) => b.n - a.n);
    const big = list.filter((x) => x.n / tot >= 0.015 || x.id === P), rest = list.filter((x) => !big.includes(x)).reduce((a, x) => a + x.n, 0);
    // 帯の幅から、名まで書けるか・数だけか・何も書かないかを決める
    const bw = Math.max(200, (el.clientWidth || 600) - 60 - big.length * 2);
    const seg = (x) => {
      const px = (x.n / tot) * bw, nm = D.clans[x.id].name.replace(/家$/, '');
      const d = prev ? x.n - (prev.c[x.id] || 0) : 0;
      const dd = d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>` : '';
      const lb = x.id === P ? `${esc(nm)} ${x.n}${dd}` : px >= nm.length * 12 + 22 + (d ? 18 : 0) ? `${esc(nm)} ${x.n}${dd}` : px >= nm.length * 12 + 20 ? `${esc(nm)} ${x.n}` : px >= 18 ? `${x.n}` : '';
      return `<i class="${x.id === P ? 'me' : ''}" style="flex:${x.n};--c:${D.ink[x.id] || '#777'}"><b>${lb}</b></i>`;
    };
    el.innerHTML = `<span>勢力</span>${big.map(seg).join('')}${rest ? `<i class="etc" style="flex:${rest};--c:#6b6254"><b>${(rest / tot) * bw >= 52 ? `ほか ${rest}` : ''}</b></i>` : ''}`;
    el.setAttribute('aria-label', `勢力（城の数）：${list.slice(0, 8).map((x) => `${D.clans[x.id].name} ${x.n}`).join('、')}${list.length > 8 ? '、ほか' : ''}`);
  };
  const bindSide = () => {
    const S2 = $('jp-side');
    S2.querySelectorAll('[data-scn]').forEach((b) => { b.onclick = () => switchScn(b.dataset.scn); });
    S2.querySelectorAll('.jp-link[data-c]').forEach((b) => { b.onclick = () => { select(D.byId[b.dataset.c], true); ($('jp-go') || $('jp-unsel'))?.focus({ preventScroll: true }); }; });
    S2.querySelectorAll('[data-gen]').forEach((b) => { b.onclick = () => { bDetail = b.dataset.gen; tab = 'busho'; sfx('ui'); side(); $('jp-bd')?.focus({ preventScroll: true }); }; });
    const tabs = [...S2.querySelectorAll('[role=tab]')];
    tabs.forEach((b, i) => {
      b.onclick = () => { setTab(b.dataset.tab); };
      b.onkeydown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault(); e.stopPropagation();
        const nb = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        setTab(nb.dataset.tab); $('jp-tab-' + nb.dataset.tab)?.focus({ preventScroll: true });
      };
    });
    const go = $('jp-go'); if (go) go.onclick = attack;
    const un = $('jp-unsel'); if (un) un.onclick = () => { select(null, false); document.querySelector('.jp-tlist .jp-link')?.focus({ preventScroll: true }); };
    const pa = $('jp-pact'); if (pa) pa.onclick = () => envoy('pact');
    const mr = $('jp-marry'); if (mr) mr.onclick = () => envoy('marry');
    const tu = $('jp-turn'); if (tu) tu.onclick = () => envoy('turn');
    // 内政
    S2.querySelectorAll('[data-nc]').forEach((b) => { b.onclick = () => { naiseiSel = +b.dataset.nc; bugyoSel = null; sfx('ui'); side(); S2.querySelector(`[data-nc="${naiseiSel}"]`)?.focus({ preventScroll: true }); }; });
    S2.querySelectorAll('[data-bg]').forEach((b) => { b.onclick = () => { bugyoSel = b.dataset.bg; sfx('ui'); side(); S2.querySelector(`[data-bg="${CSS.escape(bugyoSel)}"]`)?.focus({ preventScroll: true }); }; });
    S2.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => doNaisei(b.dataset.act); });
    // まだ内政できない時：押す・焦点で「部将から」を短く出す
    const lockMsg = $('jp-nlock-msg');
    S2.querySelectorAll('[data-lock]').forEach((b) => {
      // 知らせは押した釦のすぐ下に出す
      const tell = () => { const lk = N.naiseiLock(J); if (!lk || !lockMsg) return; if (b.nextElementSibling !== lockMsg) b.after(lockMsg); if (lockMsg.textContent !== lk.short) lockMsg.textContent = lk.short; };
      b.onfocus = tell;
      b.onclick = (e) => { e.preventDefault(); tell(); sfx('neg'); };
    });
    // 評定
    S2.querySelectorAll('[data-hy]').forEach((b) => { b.onclick = () => hyoAct(b.dataset.hy, +b.dataset.i); });
    S2.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => sayOwn(b.dataset.say); });
    S2.querySelectorAll('[data-mibun]').forEach((b) => { b.onclick = () => { J.mibun = +b.dataset.mibun; if (J.gen[J.me]) J.gen[J.me].s = null; N.initNaisei(D, J, {}); fixMe(); side(); } ; });
    // 武将
    S2.querySelectorAll('[data-bf]').forEach((b) => { b.onclick = () => { bFilter = b.dataset.bf; side(); S2.querySelector(`[data-bf="${bFilter}"]`)?.focus({ preventScroll: true }); }; });
    S2.querySelectorAll('[data-bs]').forEach((b) => { b.onclick = () => { bSort = b.dataset.bs; side(); S2.querySelector(`[data-bs="${bSort}"]`)?.focus({ preventScroll: true }); }; });
    const ro = $('jp-roster-open'); if (ro) ro.onclick = openRoster;
    const bx = $('jp-bd-close'); if (bx) bx.onclick = () => { bDetail = null; side(); };
    const rw = $('jp-reward'); if (rw) rw.onclick = () => reward(bDetail);
    const hr = $('jp-hire'); if (hr) hr.onclick = () => hire(bDetail);
    const es = $('jp-escort'); if (es) es.onclick = () => { J.escort = J.escort === bDetail ? null : bDetail; sfx('ui'); if (o.onSave) o.onSave(); side(); };
    S2.querySelectorAll('[data-appoint]').forEach((b) => { b.onclick = () => appoint(bDetail, +b.dataset.appoint); });
    $('jp-next').onclick = nextSeason;
    $('jp-back').onclick = back;
  };
  const setTab = (k) => { if (tab === k) return; tab = k; UI.tab = k; sfx('ui'); side(); };
  // 身分を替えた時（試し）に、自分の能力と持ち場の城を合わせる
  const fixMe = () => {
    const e = J.gen[J.me]; if (!e) return;
    const m = J.mibun; e.s = [44 + m * 7, 56 + m * 5, 46 + m * 5, 40 + m * 7];
    for (const [id, n] of Object.entries(J.lord)) if (n === J.me && (m < 4 || +id !== J.post)) { const k = N.karoOf(J, D.byId[id])[0]; if (k) J.lord[id] = k.n; else delete J.lord[id]; }
    if (m >= 4 && J.post != null && J.own[J.post] === P) J.lord[J.post] = J.me;
  };

  // ---- 城の札 ----
  function shiroPanel() {
    const pc = D.clans[P];
    const counts = countOf(J);
    const acted = J.envoy === J.turn;
    let card = '';
    if (sel) {
      const cl = D.clans[J.own[sel.id]];
      const from = attackable(D, J, sel);
      const prov = PROVINCES.find((p) => p.id === sel.prov);
      const nb = [...D.adj[sel.id]].map((n) => D.byId[n]);
      const mine = J.own[sel.id] === P;
      const isAlly = !mine && allied(D, P, J.own[sel.id], J);
      const why = mine ? `${pc.name}の城` : isAlly ? `${cl.name}は${pc.name}と手を結んでいる${J.pact[J.own[sel.id]] > J.turn ? `（あと${J.pact[J.own[sel.id]] - J.turn}季節）` : ''}` : `${pc.name}の城と隣り合っていない`;
      const hard = hardOf(J, sel);
      const odd = from ? oddsOf(D, J, sel) : null;
      const cp = N.campaign(D, J);
      // 592：使者（隣り合う他家に、同盟か寝返りの誘い）。見込みを先に見せる（699）
      const bordering = !mine && !isAlly && castlesOf(J, P).some((id) => [...D.adj[id]].some((n) => J.own[n] === J.own[sel.id]));
      const spy = N.bestSpy(D, J);
      const tp = from && !sel.hq ? N.turnChance(D, J, sel, spy) : 0;
      const tw = tp >= 0.4 ? '見込み高い' : tp >= 0.2 ? '五分' : '難しい';
      const envoyHtml = bordering ? `<div class="jp-dip"><span>使者${acted ? '（この季節はもう送った）' : ''}</span>
          <button class="btn small" id="jp-pact" ${acted ? 'disabled' : ''}>${esc(cl.name)}に同盟を申し入れる</button>
          ${from && !sel.hq ? `<button class="btn small" id="jp-turn" ${acted ? 'disabled' : ''}>${esc(sel.name)}の城主に寝返りを誘う<small>${spy ? `${esc(spy.n)}が使者・` : ''}${tw}</small></button>` : ''}</div>` : '';
      // 婚姻（家老から）：家の娘を嫁がせ、四年の固い同盟を結ぶ。強い家に破られにくい
      const selCid = J.own[sel.id];
      const marryHtml = !mine && (bordering || isAlly) && J.mibun >= 3 && !(J.marry || {})[selCid]
        ? `<div class="jp-dip"><span>婚姻</span><button class="btn small" id="jp-marry" ${acted || (J.bank[P] || {}).g < 500 ? 'disabled' : ''}>${esc(cl.name)}と婚姻を結ぶ<small>金500貫・四年の固い同盟</small></button></div>` : '';
      const isOrd = J.order && J.order.cid === sel.id && J.order.until >= J.turn;
      card = `<div class="jp-card">
        <div class="jp-cn"><b>${esc(sel.name)}</b><small>${esc(prov ? prov.name + '国' : '')}・${TYPE_NAME[sel.type]}${sel.hq ? '・本城' : ''}${isOrd ? '・<em class="jp-ord">主命の城</em>' : ''}</small></div>
        <div class="jp-kv"><span>持ち主</span><b><i class="dot" style="background:${D.ink[J.own[sel.id]]}"></i>${esc(cl.name)}（${esc(N.headOf(D, J, J.own[sel.id]))}）・城${counts[J.own[sel.id]] || 0}</b></div>
        ${lordBlock(sel, !!m3)}
        ${domBlock(sel)}
        <div class="jp-kv"><span>城の堅さ</span><b class="jp-pips" aria-label="堅さ ${hard}（5段のうち）">${'●'.repeat(Math.min(5, hard + 1))}${'○'.repeat(Math.max(0, 4 - hard))}</b></div>
        ${mine ? `<div class="jp-kv"><span>危うさ</span><b class="${dangerOf(D, J, sel) >= 2 ? 'jp-bad' : ''}">${['隣に敵はいない', '隣に敵の家がある', '隣の敵が強い。守りを固めたい'][dangerOf(D, J, sel)]}</b></div>` : ''}
        ${odd ? `<div class="jp-kv"><span>勝ちの見込み</span><b class="jp-odd ${odd[1]}">${odd[0]}（こちら${nf(cp.army)}人・${cp.days}日分の兵糧）</b></div>` : ''}
        ${odd && cp.why.length ? `<p class="note jp-bad">${esc(cp.why.join('。'))}。</p>` : ''}
        ${from ? (() => { const st = stanceOf(D, J, sel), sp = spoilsOf(J, sel); return `<div class="jp-kv"><span>敵の出方</span><b>${st.s}</b></div><div class="jp-kv"><span>落とせば</span><b>金 +${nf(sp.g)}・兵糧 +${nf(sp.f)}石</b></div>${when(D, J.turn).season === '冬' ? '<p class="note jp-bad">冬の陣：兵糧が五割増し</p>' : ''}`; })() : ''}
        <div class="jp-kv"><span>隣の城</span><b class="jp-nb">${nb.map((n) => `<button class="jp-link" data-c="${n.id}" style="--c:${D.ink[J.own[n.id]]}">${esc(n.name)}</button>`).join('')}</b></div>
        ${from ? `<p class="note">${esc(from.name)}から兵を出し、${TYPE_NAME[sel.type]}の${esc(sel.name)}を攻める。勝てば城は${esc(pc.name)}のものに。金${nf(cp.gold)}貫と兵糧${nf(cp.food)}石を使う。</p>
          <div class="row"><button class="btn small" id="jp-unsel">選ぶのをやめる</button><button class="btn primary" id="jp-go">出陣する（Enter）</button></div>` : `<div class="row"><button class="btn small" id="jp-unsel">選ぶのをやめる</button></div><p class="note">${esc(why)}。${mine ? '' : '攻められるのは、自分の家の城と隣り合う敵の城（朱の輪）。'}</p>`}
        ${envoyHtml}${marryHtml}
      </div>`;
    } else {
      const tl = D.castles.filter((c) => attackable(D, J, c));
      const risky = castlesOf(J, P).map((id) => D.byId[id]).filter((c) => dangerOf(D, J, c) >= 2);
      const post = J.post != null ? D.byId[J.post] : null;
      card = `${post && J.own[post.id] === P ? `<div class="jp-card"><div class="jp-cn"><b>${esc(post.name)}</b><small>${J.lord[post.id] === J.me ? 'あなたの城' : 'あなたの持ち場'}</small></div>${lordBlock(post)}${domBlock(post)}</div>` : ''}
        <div class="jp-card"><p class="note" style="margin:0">朱の破線の輪が、いま攻められる城です。地図の城か、下の名を押すと城主と様子が分かります。</p>
        ${tl.length ? `<div class="jp-tlist" role="group" aria-label="攻められる城">${tl.map((c) => `<button class="jp-link" data-c="${c.id}" style="--c:${D.ink[J.own[c.id]]}">${esc(c.name)}<small class="jp-odd ${oddsOf(D, J, c)[1]}">${oddsOf(D, J, c)[0]}</small></button>`).join('')}</div>` : '<p class="note">いま攻められる城はありません。季節を送ってください。</p>'}
        ${risky.length ? `<p class="note jp-bad">「危」の城：${risky.slice(0, 4).map((c) => esc(c.name)).join('・')}。隣の敵が強い。内政の「城の普請」で固めておくと守りやすい。</p>` : ''}</div>`;
    }
    // 598：この季節の報せ
    const rep = J.report && J.report.t === J.turn ? `<div class="jp-news" role="status"><h4 class="jp-h">この季節の報せ</h4>${J.report.lines.length ? J.report.lines.map((l) => `<p class="${l.k || ''}">${esc(l.s)}</p>`).join('') : '<p>大きな動きはなかった。</p>'}${J.report.more ? `<p class="jp-more">ほか${J.report.more}件は「天下」の札の出来事に</p>` : ''}</div>` : '';
    return rep + card;
  }

  // ---- 内政の札 ----
  function naiseiPanel() {
    const mb = N.MIBUN[J.mibun];
    const scope = N.scopeCastles(D, J);
    const season = when(D, J.turn).season;
    const left = cmdLeft();
    const bank = J.bank[P] || { g: 0, f: 0 };
    const fl = N.flowOf(D, J, P, season);
    const cp = N.campaign(D, J);
    const econ = `<div class="jp-econ" aria-label="家の蔵">
      <div><span>金</span><b>${nf(bank.g)}<small>貫</small></b><em class="${fl.g >= 0 ? 'up' : 'down'}">毎季 ${sgn(fl.g)}</em></div>
      <div><span>兵糧</span><b>${man(bank.f)}<small>石</small></b><em class="${fl.f >= 0 ? 'up' : 'down'}">${season === '秋' ? `この秋 ${sgn(fl.f)}` : `毎季 ${sgn(fl.f)}・秋の年貢 +${man(N.taxOf(J, P))}`}</em></div>
      <div><span>兵</span><b>${nf(cp.pool)}<small>人</small></b><em>出陣 ${nf(cp.army)}人・${cp.days}日</em></div></div>`;
    const lk = N.naiseiLock(J);
    if (lk) {
      // 部将より下：釦は残し、鍵の印で押せない形に
      const pc = J.post != null && J.own[J.post] === P ? D.byId[J.post] : null;
      const need2 = N.KOU_NEED[N.NAISEI_FROM];
      return `${econ}
      <h4 class="jp-h">内政<small>${esc(lk.to)}から</small></h4>
      <div class="jp-lockcard">${LOCK.replace('width="14" height="14"', 'width="18" height="18"')}<div><b>内政は${esc(lk.to)}になってから</b>
        <p id="jp-nlock-why">${esc(N.MIBUN[J.mibun].name)}のうちは、合戦で勲功を積む時。${esc(lk.to)}に上がると、持ち場の城で開墾や普請を命じられる。<br><span class="jp-lstep">${esc(lk.steps)}</span></p>
        ${meter('勲功', J.kou, need2, `${J.kou}／${need2}`)}</div></div>
      ${pc ? `<div class="jp-card"><div class="jp-cn"><b>${esc(pc.name)}</b><small>持ち場・いまは家老が差配する</small></div>${domBlock(pc)}</div>` : ''}
      <div class="jp-acts" role="group" aria-label="命じる事（${esc(lk.to)}から）">${N.ACT_KEYS.map((k) => {
        const A = N.ACTS[k];
        return `<button type="button" class="btn small locked" data-lock="${k}" aria-disabled="true" aria-describedby="jp-nlock-why"><b><span>${LOCK}${A.name}</span><em>${A.cost}貫</em></b><small>${esc(lk.to)}から</small></button>`;
      }).join('')}</div>
      <p class="jp-lockmsg" id="jp-nlock-msg" role="status" aria-live="polite"></p>`;
    }
    if (!scope.length) return `${econ}<p class="note">内政のできる城がない。</p>`;
    const nc = scope.find((c) => c.id === naiseiSel) || (sel && scope.find((c) => c.id === sel.id)) || scope[0];
    naiseiSel = nc.id;
    const cand = N.bugyoFor(D, J, nc, 'kaikon').slice(0, 5);
    const bg = cand.find((b) => b.n === bugyoSel) || cand[0];
    const who = mb.scope === 'post' ? `${mb.name}のあなたは、持ち場の${nc.name}で内政を手伝える（ほかの城は家老が差配する）。` : mb.scope === 'own' ? 'あなたの城の内政を、奉行を選んで命じる。' : '家中のどの城でも内政を命じられる。';
    return `${econ}
      <h4 class="jp-h">内政<small>今季の命 あと${Math.max(0, left)}／${mb.cmd}</small></h4>
      <p class="note">${esc(who)}奉行の${'政治'}（兵を集めるは統率・検地は知略）で伸び方が変わる。</p>
      ${scope.length > 1 ? `<div class="jp-chips" role="radiogroup" aria-label="内政をする城">${scope.map((c) => `<button role="radio" aria-checked="${c.id === nc.id}" data-nc="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
      <div class="jp-card"><div class="jp-cn"><b>${esc(nc.name)}</b><small>${TYPE_NAME[nc.type]}${nc.hq ? '・本城' : ''}</small></div>${domBlock(nc)}</div>
      <div class="jp-h2">奉行</div>
      <div class="jp-bugyo" role="radiogroup" aria-label="奉行を選ぶ">${cand.map((b) => `<button role="radio" aria-checked="${b === bg}" data-bg="${esc(b.n)}">${face(b, clanOfGen(b.n))}<span><b>${esc(b.n)}${b.me ? '（自分）' : ''}</b><small>政${b.pol}・統${b.lea}・知${b.int}${b.tr.length ? '・' + b.tr.join('・') : ''}</small></span></button>`).join('')}</div>
      <div class="jp-acts" role="group" aria-label="命じる事">${N.ACT_KEYS.map((k) => {
        const A = N.ACTS[k], pv = bg ? N.preview(D, J, nc, k, bg, season) : { ok: false, why: '奉行がいない' };
        const dis = !pv.ok || left <= 0;
        return `<button class="btn small" data-act="${k}" ${dis ? 'disabled' : ''} aria-describedby="jp-an-${k}"><b>${A.name}<em>${A.cost}貫</em></b><small id="jp-an-${k}">${esc(left <= 0 ? '今季の命はもう使った' : pv.ok ? pv.word + (bg && bg.tr.includes(A.tr) ? `（${A.tr}で伸びる）` : '') : pv.why)}</small></button>`;
      }).join('')}</div>
      <p class="jp-nres" role="status" aria-live="polite">${esc(nMsg)}</p>`;
  }
  const doNaisei = (act) => {
    const scope = N.scopeCastles(D, J);
    const c = scope.find((x) => x.id === naiseiSel) || scope[0];
    if (!c || cmdLeft() <= 0) return;
    const cand = N.bugyoFor(D, J, c, act);
    const b = cand.find((x) => x.n === bugyoSel) || N.bugyoFor(D, J, c, 'kaikon')[0];
    if (!b) return;
    const s = N.doAct(D, J, c, act, b, when(D, J.turn).season);
    if (!s) { sfx('neg'); return; }
    J.cmdN++;
    nMsg = s;
    J.log.push({ t: J.turn + 1, s, k: 'good' });
    sfx(act === 'fushin' ? 'wood' : act === 'chohei' ? 'taiko' : 'koto', 0.6);
    if (act === 'fushin') setTimeout(() => sfx('wood', 0.5), 260);
    const up = N.addKou(D, J, 2);
    if (up) { promoted(J, up, J.turn + 1); showPromo(); }
    if (o.onSave) o.onSave();
    dirty = true; side();
    (document.querySelector('[data-act]:not([disabled])') || $('jp-next'))?.focus({ preventScroll: true });
  };

  // ---- 評定の札 ----
  function hyoPanel() {
    const hy = ensureCouncil();
    const mb = N.MIBUN[J.mibun];
    const head = N.bushoOf(J, N.headOf(D, J, P));
    const hq = castlesOf(J, P).map((id) => D.byId[id]).sort((a, b) => b.hq - a.hq)[0];
    const now = when(D, J.turn);
    const decide = mb.decide > 0;
    const role = decide ? `あなたは${mb.name}。進言を採って決められる（あと${Math.max(0, mb.decide - hy.decided)}）。採らなかった進言は流れる。` : `あなたは${mb.name}。進言に賛同して主君に推せる（あと${Math.max(0, mb.say - hy.said)}）。決めるのは${head ? head.n : '主君'}。何もしなければ主君が一番の進言を採る。`;
    const st = { adopted: '採った', rejected: '退けた', lord: '主君が採った', failed: '通らなかった' };
    const items = hy.items.map((it, i) => {
      const b = N.bushoOf(J, it.who);
      if (!b) return '';
      const btns = it.state ? `<span class="jp-pst ${it.state}">${st[it.state]}</span>` : decide
        ? `<button class="btn small primary" data-hy="yes" data-i="${i}" ${hy.decided >= mb.decide ? 'disabled' : ''}>採る</button><button class="btn small" data-hy="no" data-i="${i}">退ける</button>`
        : `<button class="btn small primary" data-hy="push" data-i="${i}" ${hy.said >= mb.say ? 'disabled' : ''}>賛同して推す</button>`;
      return `<div class="jp-prop ${it.state || ''}">${face(b, clanOfGen(it.who))}<div><div class="jp-pw2"><b>${esc(it.who)}</b><small>${b.me ? '自分' : `統${b.lea} 武${b.war} 知${b.int} 政${b.pol}`}${b.tr.length ? '・' + b.tr.join('・') : ''}</small></div><p>「${esc(it.text)}」</p><div class="row">${btns}</div></div></div>`;
    }).join('');
    // 自分からの進言（決める身分でない時）
    let own = '';
    if (!decide && hy.said < mb.say) {
      const tg = D.castles.filter((c) => attackable(D, J, c)).sort((a, b) => ['good', 'even', 'bad'].indexOf(oddsOf(D, J, a)[1]) - ['good', 'even', 'bad'].indexOf(oddsOf(D, J, b)[1])).slice(0, 2);
      const risky = castlesOf(J, P).map((id) => D.byId[id]).filter((c) => dangerOf(D, J, c) >= 1).sort((a, b) => N.kataOf(J, a) - N.kataOf(J, b))[0];
      const opts = [...tg.map((c) => [`atk:${c.id}`, `${c.name}を攻めるべし`, oddsOf(D, J, c)[0]]), ...(risky ? [[`act:fushin:${risky.id}`, `${risky.name}の守りを固めるべし`, '普請']] : []), [`act:kaikon:${J.post}`, '田を開き、兵糧を蓄えるべし', '開墾'], [`act:machi:${J.post}`, '市を開き、金を蓄えるべし', '町づくり']];
      own = `<h4 class="jp-h">自分から進言する<small>通れば勲功</small></h4><div class="jp-say" role="group" aria-label="自分からの進言">${opts.map(([k, s, sm]) => `<button class="btn small" data-say="${k}"><b>${esc(s)}</b><small>${esc(sm)}</small></button>`).join('')}</div>`;
    }
    const trial = o.practice ? `<div class="jp-trial"><span>身分を替えて見る</span><div class="jp-chips" role="radiogroup" aria-label="身分">${N.MIBUN.map((m, i) => `<button role="radio" aria-checked="${i === J.mibun}" data-mibun="${i}">${m.name}</button>`).join('')}</div></div>` : '';
    return `<div class="jp-hyo-head">${face(head, P, 'big')}<div><b>${esc(D.clans[P].name)}の評定</b><small>${esc(now.era)} ${now.season}・${esc(hq ? hq.name : '')}の大広間</small><small>当主 ${esc(head ? head.n : '')}</small></div></div>
      <p class="jp-role">${esc(role)}</p>
      <p class="note">身分が上がるほど、評定で言える事が増える：${N.MIBUN.map((m, i) => `<span class="${i === J.mibun ? 'on' : ''}">${m.name}</span>`).join(' → ')}</p>
      ${items || '<p class="note">今季は目立った進言はない。</p>'}
      <p class="jp-nres" role="status" aria-live="polite">${esc(hMsg)}</p>
      ${own}${trial}`;
  }
  const hyoAct = (kind, i) => {
    const hy = ensureCouncil(), it = hy.items[i], mb = N.MIBUN[J.mibun];
    if (!it || it.state) return;
    const t = J.turn + 1, logs = [];
    const head = N.headOf(D, J, P);
    if (kind === 'yes') {
      if (hy.decided >= mb.decide) return;
      hy.decided++; it.state = 'adopted';
      hMsg = runProposal(D, J, it, logs, t) || '';
      const up = N.addKou(D, J, 3); if (up) promoted(J, up, t);
      sfx('koto', 0.6);
    } else if (kind === 'no') {
      it.state = 'rejected';
      const b = N.bushoOf(J, it.who), e = J.gen[it.who];
      if (e) e.loy = Math.max(0, e.loy - (b.tr.includes('野心家') ? 6 : 3));
      hMsg = `${it.who}の進言を退けた。${b.tr.includes('野心家') ? `${it.who}は不満げだ` : ''}`;
      sfx('ui');
    } else if (kind === 'push') {
      if (hy.said >= mb.say) return;
      hy.said++;
      const p = 0.45 + J.mibun * 0.08 + Math.min(0.2, J.kou / 1500);
      if (Math.random() < p) { it.state = 'adopted'; hy.lordDone = true; hMsg = `${head}「よかろう。」 ${runProposal(D, J, it, logs, t) || ''}`; const up = N.addKou(D, J, 4); if (up) promoted(J, up, t); sfx('koto', 0.6); }
      else { it.state = 'failed'; hMsg = `${head}は首を横に振った。`; sfx('neg'); }
    }
    J.log.push(...logs);
    if (J.promo && J.promo.t === t) showPromo();
    paintTerritory();
    if (o.onSave) o.onSave();
    dirty = true; side();
    (document.querySelector('[data-hy]:not([disabled])') || $('jp-next'))?.focus({ preventScroll: true });
  };
  const sayOwn = (key) => {
    const hy = ensureCouncil(), mb = N.MIBUN[J.mibun];
    if (hy.said >= mb.say) return;
    const [k, a, b] = key.split(':');
    const it = k === 'atk' ? { id: 'mine', who: J.me, kind: 'attack', cid: +a, pr: 99, text: `${D.byId[+a].name}を攻めるべし` }
      : { id: 'mine', who: J.me, kind: 'act', act: a, cid: +b, pr: 99, text: `${N.ACTS[a].name}を${D.byId[+b] ? D.byId[+b].name + 'で' : ''}` };
    hy.items.push(it);
    hy.said++;
    const head = N.headOf(D, J, P);
    const t = J.turn + 1, logs = [];
    const p = 0.35 + J.mibun * 0.08 + Math.min(0.25, J.kou / 1200);
    if (Math.random() < p) { it.state = 'adopted'; hy.lordDone = true; hMsg = `${head}「その儀、もっともじゃ。」 ${runProposal(D, J, it, logs, t) || ''}`; const up = N.addKou(D, J, 8); if (up) promoted(J, up, t); sfx('koto', 0.6); }
    else { it.state = 'failed'; hMsg = `${head}「まだ早い。」 進言は通らなかった。`; sfx('neg'); }
    J.log.push(...logs);
    if (J.promo && J.promo.t === t) showPromo();
    if (o.onSave) o.onSave();
    dirty = true; side();
  };

  // ---- 武将の札 ----
  const SORTS = [['lea', '統率'], ['war', '武勇'], ['int', '知略'], ['pol', '政治'], ['age', '年齢'], ['loy', '忠誠']];
  const genRows = (filter) => {
    const selC = sel ? J.own[sel.id] : P;
    const names = Object.keys(J.gen).filter((n) => {
      const e = J.gen[n]; if (e.dead) return false;
      if (filter === 'mine') return e.c === P;
      if (filter === 'sel') return e.c === selC;
      if (filter === 'ronin') return e.c < 0;
      return true;
    });
    const rows = names.map((n) => { const b = N.bushoOf(J, n); return b && { b, e: J.gen[n], age: N.ageOf(D, J, b.b) || 0 }; }).filter(Boolean);
    const key = bSort;
    rows.sort((x, y) => (key === 'age' ? y.age - x.age : key === 'loy' ? x.e.loy - y.e.loy : y.b[key] - x.b[key]) || y.b.lea - x.b.lea);
    return rows;
  };
  const roleOf = (n) => {
    const e = J.gen[n]; if (!e || e.c < 0) return '浪人';
    if (n === N.headOf(D, J, e.c)) return '当主';
    const lc = Object.keys(J.lord).find((id) => J.lord[id] === n);
    if (lc != null) return `${D.byId[lc].name}の城主`;
    return e.at != null && D.byId[e.at] ? `${D.byId[e.at].name}詰め` : '家臣';
  };
  function bushoPanel() {
    const rows = genRows(bFilter);
    const selC = sel ? J.own[sel.id] : P;
    const detail = bDetail && J.gen[bDetail] ? bushoDetail(bDetail) : '';
    const F = [['mine', '自分の家'], ['sel', sel ? `${D.clans[selC].name}` : '選んだ城の家'], ['all', '全国'], ['ronin', '浪人']];
    return `${detail}
      <div class="jp-chips" role="radiogroup" aria-label="どの武将を見るか">${F.map(([k, nm]) => `<button role="radio" aria-checked="${k === bFilter}" data-bf="${k}">${esc(nm)}</button>`).join('')}</div>
      <div class="jp-chips sort" role="radiogroup" aria-label="並べ替え">${SORTS.map(([k, nm]) => `<button role="radio" aria-checked="${k === bSort}" data-bs="${k}">${nm}${k === bSort ? (k === 'loy' ? '↑' : '↓') : ''}</button>`).join('')}</div>
      <p class="note">${rows.length}人。${bSort === 'loy' ? '忠誠の低い順' : `${SORTS.find((x) => x[0] === bSort)[1]}の高い順`}。名を押すと札が開く。</p>
      <div class="jp-glist">${rows.slice(0, 30).map(({ b, e, age }) => `<button class="jp-grow ${b.n === bDetail ? 'on' : ''}" data-gen="${esc(b.n)}">${face(b, e.c)}<span class="nm"><b>${esc(b.n)}</b><small>${esc(e.c >= 0 ? D.clans[e.c].name : '浪人')}・${esc(roleOf(b.n))}${age ? `・${age}歳` : ''}</small></span>${stat4(b)}</button>`).join('')}</div>
      ${rows.length > 30 ? `<p class="note">ほか${rows.length - 30}人は大きな一覧で。</p>` : ''}
      <button class="btn small" id="jp-roster-open">武将の一覧を大きく開く</button>`;
  }
  function bushoDetail(n) {
    const b = N.bushoOf(J, n), e = J.gen[n];
    if (!b) return '';
    const age = N.ageOf(D, J, b.b);
    const own = e.c === P;
    const mb = N.MIBUN[J.mibun];
    const canReward = own && !b.me && n !== N.headOf(D, J, P) && J.mibun >= 3 && (J.rewardT || {})[n] !== J.turn;
    const canAppoint = own && !b.me && n !== N.headOf(D, J, P) && mb.scope === 'all';
    const lc = Object.keys(J.lord).find((id) => J.lord[id] === n);
    const myCs = canAppoint ? castlesOf(J, P).map((id) => D.byId[id]).filter((c) => J.lord[c.id] !== N.headOf(D, J, P) && +c.id !== +lc) : [];
    return `<div class="jp-bd" id="jp-bd" tabindex="-1" role="region" aria-label="${esc(n)}の札">
      <div class="jp-bdh">${face(b, e.c, 'huge')}<div><b>${esc(n)}</b><small>${esc(b.k || '')}</small><small>${esc(e.c >= 0 ? D.clans[e.c].name : '浪人')}・${esc(roleOf(n))}${age ? `・${age}歳` : ''}</small><span class="jp-trs">${trChips(b)}</span></div><button class="btn small" id="jp-bd-close" aria-label="札を閉じる">×</button></div>
      ${meter('統率', b.lea, 100, b.lea)}${meter('武勇', b.war, 100, b.war)}${meter('知略', b.int, 100, b.int)}${meter('政治', b.pol, 100, b.pol)}
      ${own || e.c < 0 ? meter('忠誠', e.loy, 100, e.loy, e.loy < 45 ? 'bad' : '') : ''}
      ${b.tr.length ? `<p class="note">${b.tr.map((t) => `${esc(t)}：${esc(N.TRAIT_NOTE[t] || '')}`).join('　')}</p>` : ''}
      ${b.bio ? `<p class="jp-bio">${esc(b.bio)}</p>` : ''}
      ${canReward ? `<button class="btn small" id="jp-reward" ${J.bank[P].g < 200 ? 'disabled' : ''}>褒美を与える<small>金200貫・忠誠 +15</small></button>` : ''}
      ${e.c < 0 && J.mibun >= 3 ? `<button class="btn small" id="jp-hire" ${J.bank[P].g < 300 ? 'disabled' : ''}>召し抱える<small>金300貫</small></button>` : ''}
      ${own && !b.me && J.mibun >= 1 ? `<button class="btn small" id="jp-escort" aria-pressed="${J.escort === n}">${J.escort === n ? '次の城攻めに連れて行く（決めた）' : '次の城攻めに連れて行く'}<small>寄せ手の大将になる</small></button>` : ''}
      ${canAppoint && myCs.length ? `<div class="jp-h2">城主に任じる</div><div class="jp-chips">${myCs.slice(0, 12).map((c) => `<button data-appoint="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  const reward = (n) => {
    const e = J.gen[n]; if (!e || J.bank[P].g < 200) return;
    J.bank[P].g -= 200; e.loy = Math.min(100, e.loy + 15);
    J.rewardT = J.rewardT || {}; J.rewardT[n] = J.turn;
    J.log.push({ t: J.turn + 1, s: `${n}に褒美を与えた`, k: 'good' });
    sfx('koto', 0.5);
    if (o.onSave) o.onSave();
    side();
  };
  // 浪人を召し抱える（侍大将から。家に入り、自分の持ち場の城に居る）
  const hire = (n) => {
    const e = J.gen[n]; if (!e || e.c >= 0 || J.bank[P].g < 300) return;
    J.bank[P].g -= 300; e.c = P; e.at = J.post; e.loy = 65;
    J.log.push({ t: J.turn + 1, s: `浪人の${n}を召し抱えた`, k: 'good' });
    sfx('koto', 0.5);
    if (o.onSave) o.onSave();
    side();
  };
  const appoint = (n, cid) => {
    const c = D.byId[cid]; if (!c || J.own[cid] !== P) return;
    const old = J.lord[cid];
    for (const [id, x] of Object.entries(J.lord)) if (x === n) delete J.lord[id];
    J.lord[cid] = n; J.gen[n].at = cid;
    J.gen[n].loy = Math.min(100, J.gen[n].loy + 6);
    if (old && J.gen[old]) J.gen[old].loy = Math.max(0, J.gen[old].loy - 4);
    J.log.push({ t: J.turn + 1, s: `${n}を${c.name}の城主に任じた`, k: 'good' });
    sfx('koto', 0.5);
    if (o.onSave) o.onSave();
    dirty = true; side();
  };
  // 大きな武将の一覧（地図の上に重ねる。見出しを押すと並べ替え）
  const openRoster = () => {
    closeRoster();
    const d = document.createElement('div');
    d.className = 'jp-roster'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '武将の一覧');
    mapEl.appendChild(d);
    roster = d;
    const COLS = [['n', '名'], ['c', '家'], ['r', '役目'], ['age', '年'], ['lea', '統率'], ['war', '武勇'], ['int', '知略'], ['pol', '政治'], ['tr', '個性'], ['loy', '忠誠']];
    const draw2 = () => {
      const rows = genRows(bFilter);
      const selC = sel ? J.own[sel.id] : P;
      const F = [['mine', '自分の家'], ['sel', sel ? D.clans[selC].name : '選んだ城の家'], ['all', '全国'], ['ronin', '浪人']];
      d.innerHTML = `<div class="jp-rs"><div class="jp-rsh"><h3>武将一覧<small>${rows.length}人</small></h3>
        <div class="jp-chips" role="radiogroup" aria-label="どの武将を見るか">${F.map(([k, nm]) => `<button role="radio" aria-checked="${k === bFilter}" data-rf="${k}">${esc(nm)}</button>`).join('')}</div>
        <button class="btn small" id="jp-rs-x">閉じる（Esc）</button></div>
        <div class="jp-rsb"><table><thead><tr>${COLS.map(([k, nm]) => { const sortable = ['lea', 'war', 'int', 'pol', 'age', 'loy'].includes(k); return `<th scope="col" ${sortable ? `aria-sort="${k === bSort ? (k === 'loy' ? 'ascending' : 'descending') : 'none'}"` : ''}>${sortable ? `<button data-rs="${k}">${nm}${k === bSort ? (k === 'loy' ? '↑' : '↓') : ''}</button>` : nm}</th>`; }).join('')}</tr></thead>
        <tbody>${rows.map(({ b, e, age }) => `<tr class="${b.me ? 'me' : ''}"><th scope="row"><button data-rg="${esc(b.n)}"><img class="jp-face" alt="" data-lf="${esc(b.n)}" width="36" height="36"><span>${esc(b.n)}</span></button></th><td><i class="dot" style="background:${D.ink[e.c] || '#6a6258'}"></i>${esc(e.c >= 0 ? D.clans[e.c].name : '浪人')}</td><td>${esc(roleOf(b.n))}</td><td>${age || ''}</td>${['lea', 'war', 'int', 'pol'].map((k) => `<td class="v ${b[k] >= 85 ? 'hi' : b[k] < 40 ? 'lo' : ''}">${b[k]}</td>`).join('')}<td>${esc(b.tr.join('・'))}</td><td class="v ${e.loy < 45 ? 'lo' : ''}">${e.c === P || e.c < 0 ? e.loy : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
      // 顔は見える所だけ描く（数百人でも軽く）
      const io = new IntersectionObserver((ents) => { for (const en of ents) if (en.isIntersecting) { const im = en.target; const b = N.bushoOf(J, im.dataset.lf); if (b) im.src = faceOf(b, clanOfGen(b.n)); io.unobserve(im); } }, { root: d.querySelector('.jp-rsb') });
      d.querySelectorAll('img[data-lf]').forEach((im) => io.observe(im));
      d.querySelectorAll('[data-rf]').forEach((b) => { b.onclick = () => { bFilter = b.dataset.rf; draw2(); d.querySelector(`[data-rf="${bFilter}"]`)?.focus({ preventScroll: true }); side(); }; });
      d.querySelectorAll('[data-rs]').forEach((b) => { b.onclick = () => { bSort = b.dataset.rs; draw2(); d.querySelector(`[data-rs="${bSort}"]`)?.focus({ preventScroll: true }); side(); }; });
      d.querySelectorAll('[data-rg]').forEach((b) => { b.onclick = () => { bDetail = b.dataset.rg; tab = 'busho'; UI.tab = tab; side(); }; });
      $('jp-rs-x').onclick = closeRoster;
    };
    draw2();
    sfx('ui');
    d.querySelector('[data-rs]')?.focus({ preventScroll: true });
  };
  const closeRoster = () => { if (roster) { roster.remove(); roster = null; } };

  // ---- 天下の札 ----
  function tenkaPanel() {
    const counts = countOf(J);
    const prevC = J.hist.length > 1 ? J.hist[J.hist.length - 2].c : counts;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = top.length ? top[0][1] : 1;
    if (!top.some(([id]) => +id === P)) top.push([String(P), counts[P] || 0]);
    const delta = (id, n) => { const d = n - (prevC[id] || 0); return d > 0 ? `<em class="up" aria-label="${d}増えた">▲${d}</em>` : d < 0 ? `<em class="down" aria-label="${-d}減った">▼${-d}</em>` : '<em></em>'; };
    return `<h4 class="jp-h">天下の形勢<small>（城の数と兵の力。▲▼は前の季節から）</small></h4>
      <div class="jp-power">${top.map(([id, n]) => `<div class="jp-pw ${+id === P ? 'me' : ''}"><span class="nm"><i class="dot" style="background:${D.ink[id]}"></i>${esc(D.clans[id].name)}</span><span class="bar"><i style="width:${(n / max) * 100}%;background:${D.ink[id]}"></i></span><b>${n}</b>${delta(id, n)}</div>`).join('')}</div>
      ${J.hist.length > 1 ? `<canvas class="jp-trend" id="jp-trend" role="img" aria-label="季節ごとの、大きな家の城の数の移り変わり"></canvas>` : ''}
      <h4 class="jp-h">近ごろの出来事</h4>
      ${(() => { const y = when(D, J.turn).y; const ah = tenkaAhead(y, 2).filter((e) => !(J.ev || {})[e.id]); const NM = { okehazama: '桶狭間', jyoraku: '上洛', hoi: '信長包囲網', shingen: '信玄の病', nagashino: '長篠', kenshin: '謙信の死', honnoji: '本能寺' }; return ah.length ? `<p class="note">先の世：${ah.map((e) => `${e.y}年${e.season}　${NM[e.id] || ''}`).join('・')}（条件しだいで起こらない）</p>` : ''; })()}
      <div class="jp-log">${J.log.slice(-14).reverse().map((l) => `<p class="${l.k || ''}"><small>${l.t ? esc(when(D, l.t - 1).season) : '始'}</small>${esc(l.s)}</p>`).join('') || '<p>まだ何も起きていない。</p>'}</div>`;
  }
  // 595：形勢の移り変わり（いま大きい五つの家と自分の家の、城の数の折れ線）
  const drawTrend = () => {
    const tc = $('jp-trend'); if (!tc) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = tc.clientWidth || 260, h = 96;
    tc.width = w * dpr; tc.height = h * dpr; tc.style.height = h + 'px';
    const g = tc.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const Hs = J.hist;
    const last = Hs[Hs.length - 1].c;
    const ids = Object.keys(last).sort((a, b) => last[b] - last[a]).slice(0, 5);
    if (!ids.includes(String(P))) ids.push(String(P));
    const mx = Math.max(4, ...Hs.flatMap((e) => ids.map((id) => e.c[id] || 0)));
    const X = (i) => 6 + (i / Math.max(1, Hs.length - 1)) * (w - 12), Y = (v) => h - 14 - (v / mx) * (h - 22);
    g.strokeStyle = 'rgba(236,228,210,0.12)'; g.lineWidth = 1;
    for (let v = 0; v <= mx; v += Math.ceil(mx / 3)) { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); }
    for (const id of ids) {
      g.strokeStyle = D.ink[id] ? `rgb(${inkRGB[id].map((c) => Math.min(255, c + 60)).join(',')})` : '#999';
      g.lineWidth = +id === P ? 3 : 1.6;
      g.beginPath(); Hs.forEach((e, i) => { const y = Y(e.c[id] || 0); if (i) g.lineTo(X(i), y); else g.moveTo(X(i), y); }); g.stroke();
    }
    g.fillStyle = 'rgba(236,228,210,0.6)'; g.font = '11px sans-serif'; g.textBaseline = 'bottom';
    g.textAlign = 'left'; g.fillText(when(D, Hs[0].t).season + '（はじめ）', 2, h); g.textAlign = 'right'; g.fillText('いま', w - 2, h);
  };
  const envoy = (kind) => {
    if (!sel || J.envoy === J.turn) return;
    J.envoy = J.turn;
    const cid = J.own[sel.id], cl = D.clans[cid], t = J.turn + 1;
    const mine = N.clanPow(J, P), theirs = N.clanPow(J, cid);
    if (kind === 'marry') {
      if ((J.bank[P] || {}).g < 500) return;
      J.bank[P].g -= 500;
      const p = Math.max(0.15, Math.min(0.85, 0.3 + 0.4 * mine / (mine + theirs) + (J.pact[cid] > J.turn ? 0.2 : 0) - (J.grudge[cid] > J.turn ? 0.35 : 0)));
      if (Math.random() < p) { J.marry = J.marry || {}; J.marry[cid] = J.turn; J.pact[cid] = Math.max(J.pact[cid] || 0, J.turn + 16); sfx('koto', 0.8); J.log.push({ t, s: `${cl.name}と婚姻を結んだ（四年の同盟）`, k: 'good' }); }
      else { sfx('neg'); J.log.push({ t, s: `${cl.name}は婚姻を断った（結納の金は戻らない）`, k: 'bad' }); }
    } else if (kind === 'pact') {
      const p = Math.max(0.1, Math.min(0.75, 0.2 + 0.45 * mine / (mine + theirs) - (J.grudge[cid] > J.turn ? 0.3 : 0)));
      if (Math.random() < p) { J.pact[cid] = J.turn + 8; sfx('koto', 0.6); J.log.push({ t, s: `${cl.name}と同盟を結んだ（二年）`, k: 'good' }); }
      else { sfx('neg'); J.log.push({ t, s: `${cl.name}は同盟の申し入れを断った`, k: 'bad' }); }
    } else {
      // 685：城主の忠誠・個性と、こちらの使者の知略で成り否が決まる
      const spy = N.bestSpy(D, J);
      const L = J.lord[sel.id];
      if (Math.random() < N.turnChance(D, J, sel, spy)) {
        const logs = [];
        N.turnCastle(D, J, sel, P, logs, t);
        J.taken++; J.fallen[sel.id] = J.turn;
        sfx('fall', 0.8); J.log.push({ t, s: `${spy ? spy.n + 'の調略が実り、' : ''}${sel.name}の${L || '城主'}が寝返り、${D.clans[P].name}に付いた`, k: 'good' }, ...logs);
        const up = N.addKou(D, J, 15); if (up) { promoted(J, up, t); showPromo(); }
        J.hist[J.hist.length - 1] = { t: J.turn, c: countOf(J) };
        paintTerritory();
      } else { J.grudge[cid] = J.turn + 4; sfx('neg'); J.log.push({ t, s: `${L ? L + 'への' : ''}寝返りの誘いが${cl.name}に知れ、怒りを買った`, k: 'bad' }); }
    }
    if (o.onSave) o.onSave();
    dirty = true; side();
  };
  // 651：身分が上がった時の札（開いた「できる事」を見せる）
  const showPromo = () => {
    const pr = J.promo;
    if (!pr || document.querySelector('.jp-promo')) return;
    J.promo = null;
    const d = document.createElement('div');
    d.className = 'jp-result jp-promo'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '取り立ての知らせ');
    const mb = N.MIBUN[J.mibun];
    // 部将に上がって内政が開いた時は、一度だけ知らせる
    const opened = !!J.naiseiNew && N.canNaisei(J);
    J.naiseiNew = false;
    d.innerHTML = `<div class="jp-rc won"><div class="eyebrow">取り立て</div><h3>${esc(pr.name)}</h3>
      <p>勲功が認められ、${esc(N.headOf(D, J, P))}より${esc(pr.name)}に取り立てられた。</p>
      <div class="jp-kv"><span>新しくできる事</span><b>${esc(pr.can)}</b></div>
      ${opened ? `<p class="jp-open" role="note"><b>内政ができるようになった</b>「内政」の札で、開墾・町づくり・城の普請・兵を集める・検地を命じられる。</p>` : ''}
      <div class="jp-kv"><span>一季の内政</span><b>${mb.cmd ? `${mb.cmd}つ` : `${esc(N.MIBUN[N.NAISEI_FROM].name)}から`}</b></div>
      <div class="jp-kv"><span>評定</span><b>${mb.decide ? `進言を${mb.decide}つ採って決める` : `進言を${mb.say}つまで推す`}</b></div>
      ${J.mibun >= 4 && J.post != null ? `<p class="note">${esc(D.byId[J.post].name)}を預かり、城主となった。</p>` : ''}
      <div class="row">${opened ? '<button class="btn" id="jp-popen">内政の札を開く</button>' : ''}<button class="btn primary" id="jp-pok">承る</button></div></div>`;
    mapEl.appendChild(d);
    sfx('horagai', 0.5);
    $('jp-pok').onclick = () => { d.remove(); side(); $('jp-next')?.focus({ preventScroll: true }); };
    const po = $('jp-popen'); if (po) po.onclick = () => { d.remove(); tab = 'naisei'; UI.tab = tab; side(); $('jp-tab-naisei')?.focus({ preventScroll: true }); };
    $('jp-pok').focus({ preventScroll: true });
  };
  // 593：攻め寄せられた自分の城の知らせ（一つずつ決める）
  const showThreat = () => {
    document.querySelector('.jp-threat')?.remove();
    const th = J.threats[0];
    if (!th || result) return;
    const c = D.byId[th.to], an = D.clans[th.clan];
    if (J.own[c.id] !== P) { J.threats.shift(); showThreat(); return; }
    const aid = aidFrom(D, J, c);
    const Lc = N.lordOf(J, c), La = N.bushoOf(J, J.lord[th.from]);
    // 守りの戦（3D）：main.js が onDefend を渡さない時は、城攻めと同じ入口（onAttack → castleBattle が info.defend を見る）を使う
    const onDefend = o.onDefend || o.onAttack;
    const d = document.createElement('div');
    d.className = 'jp-result jp-threat'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-label', '急使の知らせ');
    d.innerHTML = `<div class="jp-rc lost">
      <div class="eyebrow">急使　${esc(when(D, J.turn).era)} ${when(D, J.turn).season}</div>
      <h3>${esc(c.name)}に敵</h3>
      <p>${esc(an.name)}${an.daimyo ? `（${esc(an.daimyo)}）` : ''}の軍勢${La ? `（大将 ${esc(La.n)}）` : ''}が${esc(D.byId[th.from] ? D.byId[th.from].name : '隣の城')}から攻め寄せた。城兵はおよそ${troopsOf(c, J).toLocaleString('ja-JP')}人${Lc ? `、城主は${esc(Lc.n)}（統率${Lc.lea}）` : ''}、城の堅さ ${N.kataOf(J, c)}。</p>
      <div class="jp-choice">
        ${onDefend ? `<button class="btn primary" data-th="3d"><b>自ら守りに行く</b><small>城の守りの戦を戦う</small></button>` : ''}
        <button class="btn ${onDefend ? '' : 'primary'}" data-th="aid" ${aid ? '' : 'disabled'}><b>後詰めを送る</b><small>${aid ? `${esc(aid.name)}から兵を送る（いま${J.dom[aid.id].h.toLocaleString('ja-JP')}人）。守り抜きやすい` : '兵を割ける城がない（内政で「兵を集める」）'}</small></button>
        <button class="btn" data-th="hold"><b>籠城で耐える</b><small>城の堅さと城主の采配次第。守れても城は傷む</small></button>
        <button class="btn" data-th="yield"><b>城を明け渡す</b><small>城は失うが、城兵の六割を連れて退く</small></button>
      </div>
      ${J.threats.length > 1 ? `<p class="note">ほかにも${J.threats.length - 1}つの城に敵が来ている。</p>` : ''}</div>`;
    mapEl.appendChild(d);
    sfx('kyushi', 0.8);
    d.querySelectorAll('[data-th]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.th === '3d') { const info = { ...defendInfo(th), defend: true }; closeJapan(); onDefend(info); return; }
        const held = resolveThreat(D, J, th, b.dataset.th);
        sfx(held ? 'obj' : 'fall', 0.8);
        paintTerritory();
        if (o.onSave) o.onSave();
        dirty = true; side();
        if (J.threats.length) showThreat();
        else { d.remove(); $('jp-next')?.focus({ preventScroll: true }); }
      };
    });
    (d.querySelector('[data-th]:not([disabled])'))?.focus({ preventScroll: true });
    // 知らせの城を見せる
    const [x, y] = scr2(c); view.ox += W() * 0.45 - x; view.oy += H() / 2 - y; dirty = true;
    if (m3) m3.focus(c);
  };
  // 3D の守りの戦へ渡す中身（main.js が onDefend を渡した時だけ使う）
  const defendInfo = (th) => {
    const c = D.byId[th.to], now = when(D, J.turn), prov = PROVINCES.find((p) => p.id === c.prov);
    const me = D.clans[P], en = D.clans[th.clan];
    return { scn: J.scn, castleId: c.id, fromId: th.from, clan: th.clan, castle: c.name, prov: prov ? prov.name : '', type: c.type, koku: c.koku,
      season: now.season, date: now.era, year: now.y,
      atk: { name: en.name, crest: en.crest, color: D.ink[th.clan], daimyo: N.headOf(D, J, th.clan), lord: J.lord[th.from] || null },
      def: { name: me.name, crest: me.crest, color: D.ink[P], daimyo: N.headOf(D, J, P), lord: J.lord[c.id] || null },
      a0: J.dom[th.from] ? Math.round(J.dom[th.from].h * 0.6 / 10) * 10 : troopsOf(c, J) * 3, b0: troopsOf(c, J), fort: J.fort[c.id] || 0, kata: N.kataOf(J, c) };
  };
  const select = (c, center) => {
    sel = c; sfx('ui');
    if (center && c) { const [x, y] = scr2(c); view.ox += W() * 0.45 - x; view.oy += H() / 2 - y; if (m3) m3.focus(c); }
    dirty = true; side();
  };
  const switchScn = (k) => {
    if (k === J.scn) return;
    const go = () => {
      G.japan = null;
      ensureJapan(G, k);
      if (o.onSave) o.onSave();
      japanScreen(G, { ...o, result: null });
    };
    // 進み具合が消える時は、その場の札で確かめる（ブラウザの確認窓は使わない）
    if (J.turn > 0) confirmBox($('jp-cf'), `${MAP_SCENARIOS[k].name}の地図に替えます。いまの地図の進み具合（${J.turn}季節分）は消えます。`, '替える', go);
    else go();
  };
  const attack = () => {
    const from = sel && attackable(D, J, sel);
    if (!from) return;
    const now = when(D, J.turn);
    const atk = D.clans[P], dfc = D.clans[J.own[sel.id]];
    const prov = PROVINCES.find((p) => p.id === sel.prov);
    const cp = N.campaign(D, J);
    const info = {
      scn: J.scn, castleId: sel.id, fromId: from.id, castle: sel.name, prov: prov ? prov.name : '', type: sel.type, koku: sel.koku,
      season: now.season, date: now.era, year: now.y,
      atk: { name: atk.name, crest: atk.crest, color: D.ink[P], daimyo: N.headOf(D, J, P), lord: J.lord[from.id] || null },
      def: { name: dfc.name, crest: dfc.crest, color: D.ink[J.own[sel.id]], daimyo: N.headOf(D, J, J.own[sel.id]), lord: J.lord[sel.id] || null },
      // 675：城の兵と、金・兵糧で決まる出陣の兵と日数を 3D の城攻めへ
      a0: cp.army, b0: troopsOf(sel, J), fort: J.fort[sel.id] || 0, kata: N.kataOf(J, sel), days: cp.days, food: (J.bank[P] || {}).f || 0, gold: (J.bank[P] || {}).g || 0,
    };
    // 連れて行く家臣：寄せ手の大将になり、統率で兵が集まり、武勇で士気が上がる（一度の城攻めで決めは消える）
    const esc0 = J.escort && J.gen[J.escort] && !J.gen[J.escort].dead && J.gen[J.escort].c === P ? N.bushoOf(J, J.escort) : null;
    if (esc0) { info.atk.lord = esc0.n; info.a0 = r10(info.a0 * (1 + esc0.lea / 500)); info.escort = { name: esc0.n, lea: esc0.lea, war: esc0.war }; J.gen[esc0.n].loy = Math.min(100, J.gen[esc0.n].loy + 3); }
    J.escort = null;
    // 敵の出方を 3D の城攻めの数へ（後詰めは城兵が増え、籠城は門が固く、兵糧の尽きた城は門が弱い）
    const st = stanceOf(D, J, sel);
    info.b0 = r10(info.b0 * st.b); info.kata = Math.max(0, Math.min(100, info.kata + st.kata)); info.stance = st.k;
    sfx('taiko', 0.8);
    closeJapan();
    o.onAttack(info);
  };
  const nextSeason = () => {
    if (J.threats.length) { showThreat(); return; }
    const lost0 = J.lost;
    advance(D, J);
    // 599：季節の送りは鐘と太鼓、落城があれば法螺貝
    sfx('season', 0.8);
    if (J.moves.some((m) => m.won)) setTimeout(() => sfx('fall', 0.5), 700);
    void lost0;
    paintTerritory();
    startAnim();
    // 季節の初めは評定から（急使が来ていれば、その後に）
    nMsg = ''; hMsg = '';
    if (!J.threats.length) { tab = 'hyo'; UI.tab = tab; }
    if (o.onSave) o.onSave();
    dirty = true; side();
    if (J.threats.length) setTimeout(showThreat, still() ? 0 : 1300);
    else if (J.promo) setTimeout(showPromo, still() ? 0 : 900);
  };
  const back = () => { closeJapan(); o.onBack(); };
  // 左上の戻る（どの画面も同じ所・同じ形）。下の「城下へ戻る」と同じ事をする
  { const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'topback'; tb.setAttribute('aria-label', o.from === 'town' ? '城下へ戻る' : 'タイトルへ'); tb.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${o.from === 'town' ? '城下へ戻る' : 'タイトルへ'}`; tb.onclick = () => { sfx('ui'); back(); }; scr.prepend(tb); }

  // ---------------- 手の動き ----------------
  let drag = null;
  const hit = (mx, my) => {
    let best = null, bd = 1e9;
    for (const c of D.castles) { const [x, y] = scr2(c); const d = Math.hypot(x - mx, y - my); if (d < Math.max(12, iconR(c) * 1.6) && d < bd) { bd = d; best = c; } }
    return best;
  };
  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { const [x, y] = rel(e); drag = { x, y, ox: view.ox, oy: view.oy, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    const [x, y] = rel(e);
    if (drag) {
      if (Math.hypot(x - drag.x, y - drag.y) > 4) drag.moved = true;
      if (drag.moved) { view.ox = drag.ox + x - drag.x; view.oy = drag.oy + y - drag.y; dirty = true; }
      return;
    }
    const h = hit(x, y);
    if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; dirty = true; }
  });
  cv.addEventListener('pointerup', (e) => {
    const [x, y] = rel(e);
    if (drag && !drag.moved) { const c = hit(x, y); select(c, false); }
    drag = null;
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
  $('jp-in').onclick = () => zoomAt(1.4, W() / 2, H() / 2);
  $('jp-out').onclick = () => zoomAt(1 / 1.4, W() / 2, H() / 2);
  $('jp-home').onclick = () => home();
  $('jp-all').onclick = () => fit(...sh.bounds, 24);
  const keys = (e) => {
    if (scr.hidden || !document.querySelector('.jp')) return;
    if (e.target instanceof HTMLInputElement) return;
    // 焦点のあるボタンでの Enter／Space は、そのボタンに任せる
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button')) return;
    if (result) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeResult(); } return; }
    if (roster) { if (e.key === 'Escape') { e.preventDefault(); closeRoster(); $('jp-roster-open')?.focus({ preventScroll: true }); } return; }
    if (document.querySelector('.jp-promo')) { if (e.key === 'Escape') { e.preventDefault(); document.querySelector('#jp-pok')?.click(); } return; }
    if (document.querySelector('.jp-threat') && e.key !== 'Escape') return;
    if (e.key === 'Escape') { e.preventDefault(); back(); }
    else if (e.key === 'Enter' && sel && attackable(D, J, sel)) { e.preventDefault(); attack(); }
    else if (e.key === 'n' || e.key === 'N') nextSeason();
    else if (e.key === '+' || e.key === '=') zoomAt(1.4, W() / 2, H() / 2);
    else if (e.key === '-') zoomAt(1 / 1.4, W() / 2, H() / 2);
    else if (e.key.startsWith('Arrow')) { const d = 60; if (e.key === 'ArrowLeft') view.ox += d; if (e.key === 'ArrowRight') view.ox -= d; if (e.key === 'ArrowUp') view.oy += d; if (e.key === 'ArrowDown') view.oy -= d; dirty = true; e.preventDefault(); }
  };
  window.addEventListener('keydown', keys);
  const onResize = () => { resize(); };
  window.addEventListener('resize', onResize);
  const loop = () => { raf = requestAnimationFrame(loop); if (anim) { if (performance.now() - anim.t0 > anim.dur) anim = null; dirty = true; } if (dirty) { dirty = false; draw(); } };

  // 戦の結果の札
  const closeResult = () => { result = null; document.querySelector('.jp-result')?.remove(); showThreat(); if (!J.threats.length && J.promo) showPromo(); };
  const showResult = () => {
    if (!result) return;
    const r = result;
    // 守りの戦の結果（城方が自分の家）
    const dfd = r.def === D.clans[P].name;
    const d = document.createElement('div');
    d.className = 'jp-result'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', dfd ? '城の守りの結果' : '城攻めの結果');
    d.innerHTML = `<div class="jp-rc ${r.won ? 'won' : 'lost'}">
      <div class="eyebrow">${esc(r.date)}　${esc(r.castle)}${dfd ? 'の守り' : '攻め'}</div>
      <h3>${dfd ? (r.won ? `${esc(r.castle)}を守り抜く` : `${esc(r.castle)}、落城`) : r.won ? `${esc(r.castle)}、落城` : '城は落ちず'}</h3>
      <p>${dfd ? (r.won ? `${esc(r.atk)}の寄せ手を退けた。${esc(r.castle)}はなお${esc(r.def)}の城。` : `${esc(r.atk)}に攻め落とされた。${esc(r.castle)}はいま、${esc(r.atk)}の城。`) : r.won ? `${esc(r.atk)}の旗が本丸に立った。${esc(r.castle)}はいま、${esc(r.atk)}の城。` : `攻めきれずに兵を退いた。${esc(r.castle)}はなお${esc(r.def)}の手にある。`}</p>
      <div class="jp-kv"><span>自ら討った敵</span><b>${r.kills}人</b></div>
      <div class="jp-kv"><span>かかった時</span><b>${Math.floor(r.t / 60)}分${Math.round(r.t % 60)}秒</b></div>
      <p class="note">地図の戦は、出世の戦功には数えません。季節が一つ進み、他の家も動きました。</p>
      <div class="row"><button class="btn primary" id="jp-rok">地図を見る</button></div></div>`;
    mapEl.appendChild(d);
    $('jp-rok').onclick = closeResult;
    $('jp-rok').focus({ preventScroll: true });
    if (r.won) { const c = D.byId[r.castleId]; if (c) sel = c; }
  };

  // 3D の地図に描画を任せる（地図の中身と操作は、ここの関数をそのまま使う）
  m3 = mount3D({ mapEl, J, D, P, sel: () => sel, setSel: (c) => select(c, false), anim: () => anim, still, attackable: (c) => attackable(D, J, c),
    troops: (c) => troopsOf(c, J), danger: (c) => dangerOf(D, J, c), odds: (c) => oddsOf(D, J, c), army: () => armyOf(D, J), koku: (c) => kokuOf(J, c),
    when: (t) => when(D, t), allied: (a, b) => allied(D, a, b, J), attack, next: nextSeason, reopen: () => japanScreen(G, { ...o, result: null }),
    // 上の帯と右の札（武将の顔と能力・内政の値）の数
    res: () => { const bank = J.bank[P] || { g: 0, f: 0 }, season = when(D, J.turn).season, fl = N.flowOf(D, J, P, season), cp = N.campaign(D, J); return { gold: bank.g, food: bank.f, pool: cp.pool, army: cp.army, days: cp.days, flow: fl, tax: N.taxOf(J, P), season, mibun: N.MIBUN[J.mibun].name, kou: J.kou }; },
    busho: (n) => { const b = N.bushoOf(J, n); return b && { ...b, age: N.ageOf(D, J, b.b), loy: J.gen[n] ? J.gen[n].loy : null }; },
    lord: (c) => { const L = N.lordOf(J, c); return L && { ...L, age: N.ageOf(D, J, L.b) }; },
    dom: (c) => ({ ...J.dom[c.id], kata: N.kataOf(J, c) }),
    head: (cid) => N.headOf(D, J, cid),
    openGen: (n) => { bDetail = n; tab = 'busho'; UI.tab = tab; side(); } });
  active = { dispose() { if (m3) m3.dispose(); cancelAnimationFrame(raf); window.removeEventListener('keydown', keys); window.removeEventListener('resize', onResize); } };
  resize();
  home();
  side();
  showResult();
  if (sel) side();
  // 戦から戻った時は、その季節の駒の動きを見せる
  if (o.result) startAnim();
  if (!result) { showThreat(); if (!J.threats.length && J.promo) showPromo(); }
  loop();
  // 開発用（道具から城を選んで出陣できるように）
  return (window.__japan = { J, D, select: (id) => select(D.byId[id], true), attackable: (id) => !!attackable(D, J, D.byId[id]), attack: () => attack(), next: () => nextSeason(), duty: (k) => doNaisei({ levy: 'chohei', fort: 'fushin', farm: 'kaikon' }[k] || k), threat: () => showThreat(), stats: () => ({ fort: J.fort, threats: J.threats.length, hist: J.hist.length, bank: J.bank[P], mibun: J.mibun, kou: J.kou }), view,
    tab: (k) => { tab = k; UI.tab = k; side(); }, roster: () => openRoster(), hyo: (kind, i) => hyoAct(kind, i), gen: (n) => { bDetail = n; tab = 'busho'; side(); }, redraw: () => { dirty = true; } });
}
