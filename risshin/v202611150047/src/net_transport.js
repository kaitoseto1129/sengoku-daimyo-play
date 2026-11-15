// 運び屋（オンライン P0）。同じ形の返り値で ws・rtc 版へ差し替えられる。
// 返す物：{ id, send(msg, to?), onMessage(fn), close() }
//   bc ：同じブラウザの窓どうし（BroadcastChannel）。試しと一台での遊び。
//   rtc：別々の機械どうし（WebRTC・PeerJS）。ホストに皆が集まる星の形（docs/online_design_1111.md 2 章：ホストが本物を持つ）。
//        客から客へ送る物（to 付き・全員宛て）はホストが中継する。合図（申し出と答え）だけ受け渡し所、動きは直のつながり。
//        受け渡し所を替える時は window.__swordPeerOpts、中継（TURN）を足す時は window.__netIce（net_duel.js と同じ）。
export function openTransport(kind, room, { host = false } = {}) {
  if (kind === 'rtc') return openRtc(room, host);
  if (kind !== 'bc') throw new Error('transport: 未対応 ' + kind);
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const ch = new globalThis.BroadcastChannel('risshin-' + room);
  const fns = [];
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === id) return;
    if (m.to && m.to !== id) return;
    for (const f of fns) f(m);
  };
  return {
    id,
    send(msg, to) { ch.postMessage(Object.assign({}, msg, { from: id, to: to || null })); },
    onMessage(fn) { fns.push(fn); },
    close() { fns.length = 0; ch.close(); },
  };
}

// 部屋の名からホストの名を決める（net_duel.js の一騎打ちとは別の名の帯）
const hostName = (room) => 'risshin-room-' + String(room).replace(/[^\w-]/g, '').slice(0, 40);
function loadScript(rel) {
  return new Promise((ok, ng) => {
    if (window.Peer) return ok();
    const url = new URL(rel, import.meta.url).href;
    const old = document.querySelector(`script[src="${url}"]`);
    if (old) { old.addEventListener('load', ok); old.addEventListener('error', () => ng(new Error('読めない ' + rel))); return; }
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => ng(new Error('読めない ' + rel));
    document.head.appendChild(s);
  });
}

function openRtc(room, host) {
  // 客は自分の名を先に決める（席の取り直し・中継の宛先に使う）。ホストは部屋の名で立つ
  const id = host ? hostName(room) : 'risshin-p-' + Math.random().toString(36).slice(2, 10);
  const fns = [], conns = new Map(), queue = [];
  const T = { id, kind: 'rtc', ready: false, open: false, err: null, peers: 0, closed: false };
  let peer = null;
  const deliver = (m) => { for (const f of fns) f(m); };
  const sendTo = (c, m) => { try { if (c && c.open) c.send(m); } catch (e) { /* 切れた */ } };
  // ホスト：届いた物の差出人をつながりの名で書き直し（偽れない）、宛先へ中継する
  const fromConn = (c, m) => {
    if (!m || typeof m !== 'object') return;
    m.from = c.peer;
    if (!host) { if (!m.to || m.to === id) deliver(m); return; }
    if (m.to && m.to !== id) { sendTo(conns.get(m.to), m); return; }
    if (!m.to) for (const [k, o] of conns) if (k !== c.peer) sendTo(o, m);
    deliver(m);
  };
  const watch = (c) => {
    c.on('open', () => {
      conns.set(c.peer, c); T.peers = conns.size; T.open = true;
      if (!host) for (const m of queue.splice(0)) sendTo(c, m);
    });
    c.on('data', (m) => fromConn(c, m));
    c.on('close', () => { conns.delete(c.peer); T.peers = conns.size; T.open = conns.size > 0; });
    c.on('error', () => { /* 脈で切れたと分かる（net_session.js） */ });
  };
  (async () => {
    try { await loadScript('./vendor/peerjs.min.js'); } catch (e) { T.err = 'script'; return; }
    if (T.closed) return;
    const opts = Object.assign({}, window.__swordPeerOpts || {});
    if (window.__netIce) opts.config = { iceServers: window.__netIce };
    peer = new window.Peer(id, opts);
    peer.on('open', () => {
      T.ready = true;
      if (host) peer.on('connection', watch);
      else watch(peer.connect(hostName(room), { reliable: true, serialization: 'json' }));
    });
    peer.on('error', (e) => { T.err = String((e && e.type) || e); });
  })();
  T.send = (msg, to) => {
    const m = Object.assign({}, msg, { from: id, to: to || null });
    if (host) {
      if (to) sendTo(conns.get(to), m);
      else for (const c of conns.values()) sendTo(c, m);
      return;
    }
    const c = conns.values().next().value;
    if (c && c.open) sendTo(c, m); else if (queue.length < 200) queue.push(m);
  };
  T.onMessage = (fn) => { fns.push(fn); };
  T.close = () => { T.closed = true; fns.length = 0; for (const c of conns.values()) { try { c.close(); } catch (e) { /* 片付け */ } } conns.clear(); try { peer && peer.destroy(); } catch (e) { /* 片付け */ } };
  if (typeof window !== 'undefined') window.__netTp = T;
  return T;
}
