// 二窓 Co-op の画面（オンラインの時だけ読む。net_coop.js から）。合図の輪・武将の選び・終わりの結果。
// 決まり（CLAUDE.md）：字は少なく、絵で。釦は 44px 以上・間は 8px 以上。名前は武将の名前だけ（kaito が頼んだ字）。
//   合図の絵（色と形）は net_coop.js の SIG と同じ：攻撃＝赤い三角／守れ＝青い四角／ここへ＝黄の丸／援護求む＝橙の二重の輪／撤退＝白の下向き三角。
const HEX = (n) => '#' + n.toString(16).padStart(6, '0');
const ICON = {
  attack: (c) => `<polygon points="24,6 42,40 6,40" fill="${c}"/>`,
  hold: (c) => `<rect x="9" y="9" width="30" height="30" fill="${c}"/>`,
  here: (c) => `<circle cx="24" cy="24" r="16" fill="${c}"/>`,
  help: (c) => `<circle cx="24" cy="24" r="17" fill="none" stroke="${c}" stroke-width="4"/><circle cx="24" cy="24" r="8" fill="none" stroke="${c}" stroke-width="4"/>`,
  retreat: (c) => `<polygon points="6,8 42,8 24,42" fill="${c}"/>`,
};
const svg = (inner, size = 48) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
const css = (el, s) => { el.style.cssText = s; return el; };

// ---- 合図の輪：画面を長押し（0.7 秒・動かさない）か、左の釦で、五つの絵が輪に出る。選べば出る ----
export function mountSignalRing({ kinds, colors, onPick, doc = document, hold = 700, canvasSel = 'canvas' }) {
  const root = css(doc.createElement('div'), 'position:fixed;inset:0;z-index:40;display:none;pointer-events:none');
  root.id = 'net-ring';
  const btns = [];
  kinds.forEach((k, i) => {
    const b = css(doc.createElement('button'), 'position:absolute;width:52px;height:52px;border-radius:26px;border:2px solid #e6f2ff;background:rgba(12,22,34,.92);padding:0;pointer-events:auto');
    b.type = 'button'; b.dataset.kind = k; b.setAttribute('aria-label', k);
    b.innerHTML = svg(ICON[k](HEX(colors[k])), 36);
    b.addEventListener('click', (e) => { e.stopPropagation(); const at = ring.at; close(); onPick(k, at); });
    root.appendChild(b); btns.push(b);
  });
  const ring = { at: null, open: false };
  const R = 74;
  const open = (x, y, at) => {
    // 画面の端で切れないよう、輪の中心を内へ寄せる
    const w = doc.documentElement.clientWidth || innerWidth, h = doc.documentElement.clientHeight || innerHeight;
    const cx = Math.max(R + 30, Math.min(w - R - 30, x)), cy = Math.max(R + 30, Math.min(h - R - 30, y));
    btns.forEach((b, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / btns.length; b.style.left = (cx + Math.cos(a) * R - 26) + 'px'; b.style.top = (cy + Math.sin(a) * R - 26) + 'px'; });
    ring.at = at || null; ring.open = true; root.style.display = 'block'; root.style.pointerEvents = 'auto';
  };
  const close = () => { ring.open = false; root.style.display = 'none'; root.style.pointerEvents = 'none'; };
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });   // 輪の外を押せば閉じる
  doc.body.appendChild(root);

  // 画面の長押し：動かさず 0.7 秒。指が動けば（見回し・歩き）取り消す
  let timer = null, start = null;
  const down = (e) => {
    if (ring.open || (e.button && e.button !== 0)) return;
    const cv = e.target && e.target.closest && e.target.closest(canvasSel);
    if (!cv) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    clearTimeout(timer);
    timer = setTimeout(() => { if (start) open(start.x, start.y, { x: start.x, y: start.y }); start = null; }, hold);
  };
  const move = (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) { clearTimeout(timer); start = null; } };
  const up = () => { clearTimeout(timer); start = null; };
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', up, true);
  // 左の釦（押せば輪が出る。長押しが難しい時の入り口）
  const btn = css(doc.createElement('button'), 'position:fixed;left:8px;top:200px;width:44px;height:44px;border-radius:22px;border:2px solid #79b9eb;background:rgba(12,39,69,.9);padding:0;z-index:30;pointer-events:auto');
  btn.id = 'net-ring-btn'; btn.type = 'button'; btn.setAttribute('aria-label', '合図');
  btn.innerHTML = svg('<circle cx="24" cy="24" r="14" fill="none" stroke="#e6f2ff" stroke-width="4"/><circle cx="24" cy="24" r="5" fill="#e6f2ff"/>', 30);
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (ring.open) close(); else { const r = btn.getBoundingClientRect(); open(r.right + R + 12, r.top + 22, null); } });
  doc.body.appendChild(btn);
  return { root, btn, open, close, ring, dispose() { close(); clearTimeout(timer); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true); root.remove(); btn.remove(); } };
}

// ---- 始める前の武将選び：候補の名前を並べ、取られた人は押せない ----
export function showPicker({ names, taken = [], onPick, doc = document }) {
  const box = css(doc.createElement('div'), 'position:fixed;inset:0;z-index:60;background:rgba(10,14,20,.82);display:flex;align-items:center;justify-content:center;pointer-events:auto');
  box.id = 'net-pick';
  const grid = css(doc.createElement('div'), 'display:flex;flex-wrap:wrap;gap:12px;max-width:80vw;justify-content:center');
  box.appendChild(grid);
  const draw = (tk) => {
    grid.replaceChildren(...names.map((n) => {
      const b = css(doc.createElement('button'), 'min-width:120px;height:56px;border-radius:8px;border:2px solid #79b9eb;background:rgba(12,39,69,.95);color:#e6f2ff;font-size:18px;padding:0 14px');
      b.type = 'button'; b.textContent = n; b.dataset.name = n;
      const t = tk.includes(n);
      b.disabled = t; if (t) { b.style.opacity = '.35'; b.style.borderColor = '#666'; }
      b.addEventListener('click', () => onPick(n));
      return b;
    }));
  };
  draw(taken);
  doc.body.appendChild(box);
  return { box, update: draw, close() { box.remove(); } };
}

// ---- 終わりの結果：全体（勝ち・負け）と一人ずつ（討ち取りの数を丸で）。字は名前だけ ----
const COLORS = ['#e8c43a', '#3b78d8', '#d8372a', '#3fb56a'];
export function showResult({ win, players, meSlot, doc = document }) {
  doc.getElementById('net-result')?.remove();
  const box = css(doc.createElement('div'), 'position:fixed;inset:0;z-index:70;background:rgba(10,14,20,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:auto');
  box.id = 'net-result';
  const head = css(doc.createElement('div'), 'width:88px;height:88px');
  head.innerHTML = svg(win
    ? '<circle cx="24" cy="24" r="21" fill="#2f9e57"/><polyline points="12,25 21,34 37,15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="24" cy="24" r="21" fill="#b8352a"/><line x1="14" y1="14" x2="34" y2="34" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="34" y1="14" x2="14" y2="34" stroke="#fff" stroke-width="5" stroke-linecap="round"/>', 88);
  head.dataset.win = win ? '1' : '0';
  box.appendChild(head);
  const list = css(doc.createElement('div'), 'display:flex;flex-direction:column;gap:8px;min-width:260px');
  const max = Math.max(1, ...players.map((p) => p.kills || 0));
  for (const p of players) {
    const row = css(doc.createElement('div'), `display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,${p.slot === meSlot ? '.16' : '.07'});border:${p.slot === meSlot ? '2px solid #7dff9a' : '2px solid transparent'}`);
    row.dataset.slot = p.slot;
    const dot = css(doc.createElement('div'), `width:28px;height:28px;border-radius:14px;background:${COLORS[p.slot % 4]};flex:none`);
    const nm = css(doc.createElement('div'), 'color:#fff;font-size:15px;min-width:90px'); nm.textContent = p.name || '';
    const pips = css(doc.createElement('div'), 'display:flex;gap:3px;flex-wrap:wrap;max-width:200px');
    const n = Math.min(20, p.kills || 0);
    for (let i = 0; i < n; i++) pips.appendChild(css(doc.createElement('i'), `width:9px;height:9px;border-radius:5px;background:${COLORS[p.slot % 4]}`));
    row.dataset.kills = p.kills || 0;
    row.append(dot, nm, pips); list.appendChild(row);
  }
  box.appendChild(list);
  doc.body.appendChild(box);
  return box;
}
