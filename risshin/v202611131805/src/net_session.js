// 部屋（オンライン P0）：席・脈・hello/start。ソロでは読み込まない。
import { openTransport } from './net_transport.js';
const PULSE_MS = 1000, DEAD_MS = 4000;
export function openSession({ role, room, kind = 'bc', slots = 2, general = null }) {
  const tp = openTransport(kind, room);
  const host = role === 'host';
  const peers = new Map();   // id -> { slot, general, seen, alive }
  const on = { join: [], leave: [], start: [], msg: [] };
  const S = { host, id: tp.id, slot: host ? 0 : -1, peers, started: false, tp,
    on(ev, fn) { on[ev].push(fn); },
    send(m, to) { tp.send(m, to); } };
  const emit = (ev, a) => { for (const f of on[ev]) f(a); };
  if (host) peers.set(tp.id, { slot: 0, general, seen: Date.now(), alive: true });
  // 切れた席（alive が false）は空き。戻る人・代わりの人が入れる
  const takeSlot = () => { for (let s = 0; s < slots; s++) { let used = false; for (const p of peers.values()) if (p.slot === s && p.alive) used = true; if (!used) return s; } return -1; };
  tp.onMessage((m) => {
    const now = Date.now();
    if (m.t === 'hello' && host) {
      let p = peers.get(m.from);
      if (!p) {
        for (const q of peers.values()) if (m.key && q.key === m.key) p = q;   // 戻り：同じ合言葉
        const slot = p ? p.slot : takeSlot();
        if (slot < 0) { tp.send({ t: 'full' }, m.from); return; }
        if (p) { for (const [k, v] of peers) if (v === p) peers.delete(k); }
        p = { slot, general: m.general || null, key: m.key || null, seen: now, alive: true };
        peers.set(m.from, p);
        emit('join', { id: m.from, slot, back: !!m.key });
      }
      p.seen = now; p.alive = true;
      tp.send({ t: 'welcome', slot: p.slot, started: S.started }, m.from);
    } else if (m.t === 'welcome') { S.slot = m.slot; }
    else if (m.t === 'start') { S.started = true; emit('start', m); }
    else if (m.t === 'ping') { const p = peers.get(m.from); if (p) { p.seen = now; p.alive = true; } else if (!host && m.host) peers.set(m.from, { slot: 0, seen: now, alive: true }); }
    else emit('msg', m);
  });
  const key = 'k' + Math.random().toString(36).slice(2, 8);
  if (!host) tp.send({ t: 'hello', general, key });
  const timer = setInterval(() => {
    tp.send({ t: 'ping', host });
    const now = Date.now();
    for (const [id, p] of peers) if (id !== tp.id && p.alive && now - p.seen > DEAD_MS) { p.alive = false; emit('leave', { id, slot: p.slot }); }
  }, PULSE_MS);
  S.start = (extra) => { S.started = true; tp.send(Object.assign({ t: 'start', slots: [...peers.values()].map(p => ({ slot: p.slot, general: p.general })) }, extra || {})); };
  S.close = () => { clearInterval(timer); tp.close(); };
  return S;
}
