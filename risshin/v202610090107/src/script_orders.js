// 戦の段取りで出した下知だけを運ぶ。隊自身の判断・敗走・道の歩みには触らない。
import { sendOrder, posOf } from './denrei.js';
import { heardRecently } from './notice_source.js';

const KEYS = ['order', 'formation', 'facing', 'focus', 'seekRange', 'aggro', 'speed', 'onArrive', 'holdFire', 'reserve', 'calm', 'path', 'pathIdx'];
const INTENT = ['order', 'dx', 'dz', 'path', 'ax', 'az', 'formation', 'focus', 'holdFire', 'reserve', 'calm'];
function read(g, s) {
  for (const k of KEYS) s[k] = g[k];
  s.ax = g.anchor?.x; s.az = g.anchor?.z;
  s.dx = g.dest?.x; s.dz = g.dest?.z;
  return s;
}
function write(g, s) {
  for (const k of KEYS) g[k] = s[k];
  if (s.ax != null) { g.anchor.x = s.ax; g.anchor.z = s.az; }
  if (s.dx == null) g.dest = null;
  else { g.dest = g.dest || {}; g.dest.x = s.dx; g.dest.z = s.dz; }
}
function changed(a, b) {
  return a.order !== b.order || a.dx !== b.dx || a.dz !== b.dz || a.path !== b.path
    || a.ax !== b.ax || a.az !== b.az || a.formation !== b.formation || a.focus !== b.focus
    || a.holdFire !== b.holdFire || a.reserve !== b.reserve || a.calm !== b.calm;
}
function repeated(next, before, old) {
  if (!old) return false;
  // 使番を待つ隊が自ら動かした位置は、新しい下知の行き先とは数えない。
  for (const k of INTENT) if (next[k] !== before[k] && next[k] !== old[k]) return false;
  return true;
}
function source(rt) {
  if (rt.G.lord) return rt.player.u;
  const u = rt.taisho?.a?.u;
  return u?.alive ? u : null;
}

export function runScriptOrders(rt, fn, dt) {
  if (rt._issuingOrders || !rt.ready || rt.over || rt.def.dojo || rt.def.town) return fn.call(rt.def, rt, dt);
  const rows = rt.scriptOrderRows || (rt.scriptOrderRows = []);
  rows.length = 0;
  for (const g of rt.army.groups) {
    if (g.team !== 0 || g.isPlayerSquad || g.isRunner || g.siegeAI || !g.count || g.routed) continue;
    const s = g._scriptBefore || (g._scriptBefore = {});
    read(g, s); rows.push(g);
  }
  rt._issuingOrders = true;
  try { fn.call(rt.def, rt, dt); } finally { rt._issuingOrders = false; }
  if (rt.over) return;
  const from = source(rt), p = posOf(from);
  if (!p) return;
  for (const g of rows) {
    if (!g.count || g.routed) continue;
    const before = g._scriptBefore, next = read(g, g._scriptNext || (g._scriptNext = {}));
    if (!changed(next, before)) continue;
    const c = g.center();
    if (Math.hypot(c.x - p.x, c.z - p.z) <= 12) {
      g._receivedDispatch = g._dispatchSeq = (g._dispatchSeq || 0) + 1;
      g.dispatch = null; g._lastDispatch = null; continue;
    }
    // 毎コマ同じ下知を書く戦でも、使番を増やしたり着く時を延ばしたりしない。
    const old = g._lastDispatch;
    if (repeated(next, before, old)) { write(g, before); continue; }
    const st = { ...next };
    if (st.path) st.path = st.path.map((pt) => Array.isArray(pt) ? pt.slice() : { ...pt });
    g._lastDispatch = { ...next };
    write(g, before);
    const tag = { seq: g._dispatchSeq = (g._dispatchSeq || 0) + 1 };
    g.dispatch = tag;
    sendOrder(rt, from, g, { id: st.order, apply: () => {
      if (tag.seq < (g._receivedDispatch || 0) || g.routed) return;
      g._receivedDispatch = tag.seq;
      if (g.dispatch === tag) g.dispatch = null;
      write(g, st);
      for (const u of g.units) if (u.alive) u.aiT = 0;
    } }, { team: 0, faction: g.faction, name: g.name, onLost: () => {
      if (g.dispatch === tag) g.dispatch = null;
    } });
  }
}

// 遠い武将の声は直接聞こえない。使番が自分の所まで追って来てから口で伝える。
export function relaySpeech(rt, sp, text, dur) {
  if (!rt.ready || rt.over || rt.G.lord || rt.def.dojo || rt.def.town || sp === '使番') return false;
  let from = null;
  for (const u of rt.army.units) if (u.alive && u.team === 0 && u.name && (u.name === sp || u.name.endsWith(' ' + sp))) { from = u; break; }
  if (!from) return false;
  const p = rt.player.u.pos;
  if (Math.hypot(from.pos.x - p.x, from.pos.z - p.z) <= 12) return false;
  // 足軽へ遠い武将の独り言を使番で届けない戦（桶狭間など）。聞こえない声は捨てる。
  if (rt.def.noAllyReports) return true;
  if (heardRecently(rt, text)) return true;
  const pending = rt._pendingWords || (rt._pendingWords = new Map()), key = sp + ':' + text;
  if (rt.t - (pending.get(key) ?? -Infinity) < 25) return true;
  const t0 = rt.t;
  pending.set(key, t0);
  sendOrder(rt, from, rt.player.u, { id: 'word', apply: () => {
    pending.delete(key);
    // 話した人が今は目の前にいる・古くなった・もう聞いた、のどれかなら運ばない。
    if (rt.over || !from.alive || rt.t - t0 > 25 || heardRecently(rt, text) || (from.alive && Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) <= 25)) return;
    rt.say('使番', `${sp}殿より。「${text}」`, dur);
  } }, { team: 0, faction: from.group?.faction, name: '自分の隊', onLost: () => pending.delete(key) });
  return true;
}

// 下知の札も届くまでは見せない。済んだ任務や新しい下知を古い使番で戻さない。
export function relayObjective(rt, id, text, kind) {
  if (!rt._issuingOrders || !rt.ready || rt.over || rt.G.lord || rt.def.dojo || rt.def.town || !['main', 'order'].includes(kind)) return null;
  const from = source(rt);
  if (!from || Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) <= 12) return null;
  const list = rt.orderObjectives || (rt.orderObjectives = new Map());
  const old = list.get(id);
  if (old?.text === text) return old;
  const o = { id, text, kind, state: '', progress: '', t: rt.t };
  list.set(id, o);
  sendOrder(rt, from, rt.player.u, { id: 'task', apply: () => {
    if (list.get(id) !== o || o.state) return;
    const n = rt.obj(id, text, kind, true);
    n.progress = o.progress;
    rt.say('使番', `殿の下知にござる。「${text}」`);
  } }, { team: 0, faction: from.group?.faction, name: '自分の隊' });
  return o;
}
