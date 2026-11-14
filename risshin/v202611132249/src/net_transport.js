// 運び屋（オンライン P0）。同じ形の返り値で ws・rtc 版へ差し替えられる。
// 返す物：{ id, send(msg, to?), onMessage(fn), close() }
export function openTransport(kind, room) {
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
