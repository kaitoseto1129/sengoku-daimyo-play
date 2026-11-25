// 試合後の上空の見返し（K580・11/24 Sanae）：試合の画面の UI を全部消し、上から両軍の動きを見せる。早送り・スロー・シーク・もう一度。
//   元は match_record.js の見返しの写し（rep＝{ units, frames, ev }）。二秒ごとの写しの間を滑らかに繋ぎ、青（自軍）・赤（敵）の通った跡を引く。
//   崩れ・討死・本陣の危機の前後は、自動で四分の一にゆっくり（見どころ）。字は使わず、釦は絵（SNS で共有する時は画面を録る）。
//   描くのは一枚の canvas だけ（毎コマ new しない）。「動きを減らす」の時は自動で始めず、シークで見る。
import { S as SET } from '../settings.js';

const CSS = `
.sky{position:fixed;inset:0;z-index:95;background:#0b0e0a;display:flex;flex-direction:column;color:#ece4d2;font-family:var(--ui,sans-serif);touch-action:none}
.sky canvas{flex:1;min-height:0;width:100%;display:block}
.sky-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(10,8,6,.92);border-top:1px solid rgba(230,199,122,.3)}
.sky-bar button{flex:none;width:48px;height:44px;border-radius:6px;border:1px solid rgba(236,228,210,.35);background:rgba(30,26,20,.95);color:#fff4e0;font:700 14px var(--ui,sans-serif);cursor:pointer;display:grid;place-items:center}
.sky-bar button[aria-pressed="true"]{background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070}
.sky-bar button svg{width:22px;height:22px;fill:currentColor}
.sky-bar input{flex:1;min-width:60px;height:44px;accent-color:#e6c77a}
.sky-x{position:absolute;top:10px;right:10px;width:48px;height:44px;border-radius:6px;border:1px solid rgba(236,228,210,.35);background:rgba(10,8,6,.7);color:#fff4e0;display:grid;place-items:center;cursor:pointer}
.sky-x svg{width:22px;height:22px;stroke:currentColor;stroke-width:2.4;fill:none}
`;
const IC = {
  play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  slow: '<path d="M11 5v14L2 12zM21 5v14l-9-7z"/>', fast: '<path d="M3 5v14l9-7zM13 5v14l9-7z"/>', again: '<path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const SPEEDS = { slow: 2, norm: 8, fast: 30 };   // 試合の一秒を何倍で見せるか

export function openSky(rep, o = {}) {
  if (!rep?.frames?.length || typeof document === 'undefined') return null;
  const en = !!o.en;
  if (!document.getElementById('sky-css')) { const st = document.createElement('style'); st.id = 'sky-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.className = 'sky'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', en ? 'Battle replay from above' : '上空からの見返し');
  const label = (ja, e) => (en ? e : ja);
  el.innerHTML = `<canvas></canvas><button class="sky-x" type="button" aria-label="${label('見返しを閉じる', 'Close replay')}"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg></button>
    <div class="sky-bar"><button type="button" data-a="pp" aria-label="${label('一時停止・再生', 'Pause / play')}">${ico('pause')}</button>
    <button type="button" data-s="slow" aria-pressed="false" aria-label="${label('スロー', 'Slow')}">${ico('slow')}</button>
    <button type="button" data-s="norm" aria-pressed="true" aria-label="${label('ふつうの早さ', 'Normal speed')}">${ico('play')}</button>
    <button type="button" data-s="fast" aria-pressed="false" aria-label="${label('早送り', 'Fast forward')}">${ico('fast')}</button>
    <input type="range" min="0" max="1000" value="0" aria-label="${label('試合の時刻', 'Match time')}">
    <button type="button" data-a="again" aria-label="${label('もう一度', 'Watch again')}">${ico('again')}</button></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), range = el.querySelector('input');
  const F = rep.frames, N = F.length, T0 = F[0].t, T1 = F[N - 1].t, span = Math.max(1, T1 - T0);
  // 盤：全コマの居所の外枠（自軍は画面の下＝z の符号を裏返す。match_record の Q と同じ）
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of F) for (const [x, z, n] of f.s) { if (n <= 0) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (!(x1 > x0)) { x0 = -50; x1 = 50; } if (!(z1 > z0)) { z0 = -50; z1 = 50; }
  const bw = x1 - x0 + 120, bh = z1 - z0 + 120, bcx = (x0 + x1) / 2, bcz = (z0 + z1) / 2;
  let W = 0, H = 0, dpr = 1;
  const fit = () => { dpr = Math.min(2, window.devicePixelRatio || 1); const r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro?.observe(cv);
  // カメラ：始めは全体。戦っている隊が多い間はその重なりへ寄る（なめらかに）
  const cam = { x: bcx, z: bcz, k: 0 }; const kFull = () => Math.min(W / bw, H / bh);
  let t = T0, speed = 'norm', playing = !SET.reduceMotion, last = 0, raf = 0, tipT = -1e9;
  const at = (tt) => { const u = Math.max(0, Math.min(N - 1.0001, ((tt - T0) / span) * (N - 1))), i = Math.floor(u); return { a: F[i], b: F[i + 1] || F[i], k: u - i }; };
  const trail = [];   // 跡：隊ごとの [x,z]（二秒ごと）。シークで作り直す
  const trailTo = (tt) => { trail.length = 0; const m = Math.floor(((tt - T0) / span) * (N - 1)); for (let i = Math.max(0, m - 40); i <= m; i++) F[i].s.forEach((s, j) => { (trail[j] ||= []).push(s); }); };
  const evNear = (tt) => rep.ev.some((e) => (e.k === 'rout' || e.k === 'taisho' || e.k === 'hq') && tt >= e.t - 3 && tt <= e.t + 5);
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    const slowMo = evNear(t);
    if (playing) { t += dt * SPEEDS[speed] * (slowMo && speed !== 'slow' ? 0.25 : 1); if (t >= T1) { t = T1; playing = false; pp(); } }
    const { a, b, k } = at(t);
    const pos = a.s.map((s, i) => { const q = b.s[i] || s; return [s[0] + (q[0] - s[0]) * k, s[1] + (q[1] - s[1]) * k, s[2] + (q[2] - s[2]) * k, k < 0.5 ? s[3] : q[3]]; });
    // 跡：二秒ごとの写しが替わる時に足す
    const idx = Math.floor(((t - T0) / span) * (N - 1)); if (idx !== trail._i) { trail._i = idx; if (!trail.length || idx < (trail._p ?? 0)) trailTo(t); else F[idx].s.forEach((s, j) => { const tr = (trail[j] ||= []); tr.push(s); if (tr.length > 40) tr.shift(); }); trail._p = idx; }
    // カメラ：戦っている隊（code 1）の重なりへ寄る。無ければ全体へ
    const eng = pos.filter((p) => p[3] === 1 && p[2] > 0); let tx = bcx, tz = bcz, tk = kFull();
    if (eng.length >= 2) { let ex0 = 1e9, ex1 = -1e9, ez0 = 1e9, ez1 = -1e9; for (const p of eng) { ex0 = Math.min(ex0, p[0]); ex1 = Math.max(ex1, p[0]); ez0 = Math.min(ez0, p[1]); ez1 = Math.max(ez1, p[1]); } tx = (ex0 + ex1) / 2; tz = (ez0 + ez1) / 2; tk = Math.min(Math.min(W / (ex1 - ex0 + 220), H / (ez1 - ez0 + 220)), kFull() * 2.4); }
    if (!cam.k) { cam.k = kFull(); } const s = SET.reduceMotion ? 1 : 1 - Math.pow(0.05, dt || 0.016);
    cam.x += (tx - cam.x) * s; cam.z += (tz - cam.z) * s; cam.k += (tk - cam.k) * s;
    const P = (x, z) => [W / 2 + (x - cam.x) * cam.k, H / 2 - (z - cam.z) * cam.k];   // 自軍（−z）が下
    g.fillStyle = '#2f3a24'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; const gs = 100 * cam.k, ox = (W / 2 - cam.x * cam.k) % gs, oz = (H / 2 + cam.z * cam.k) % gs;
    for (let x = ox; x < W; x += gs) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = oz; y < H; y += gs) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // 跡（線）：青＝自軍・赤＝敵
    g.lineWidth = 2; g.lineCap = 'round';
    trail.forEach((tr, i) => { const u = rep.units[i]; if (!u || tr.length < 2) return; g.strokeStyle = u.team ? 'rgba(200,67,46,.45)' : 'rgba(63,127,208,.5)'; g.beginPath(); tr.forEach(([x, z], j) => { const [px, py] = P(x, z); j ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); });
    // 隊：丸（兵の数で大きさ）・崩れは×・斬り合いは輪・本陣は金の縁
    pos.forEach(([x, z, n, c], i) => {
      const u = rep.units[i]; if (!u) return; const [px, py] = P(x, z), r = Math.max(5, (3 + Math.sqrt(Math.max(0, n)) * 0.22) * Math.min(2.2, cam.k * 6)), col = u.team ? '#c8432e' : '#3f7fd0';
      if (n <= 0) return;
      if (c === 2) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(px - r, py - r); g.lineTo(px + r, py + r); g.moveTo(px + r, py - r); g.lineTo(px - r, py + r); g.stroke(); return; }
      g.fillStyle = col; g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill();
      g.lineWidth = u.wing === 'honjin' ? 3 : 1.5; g.strokeStyle = u.wing === 'honjin' ? '#f2d27a' : 'rgba(255,255,255,.55)'; g.stroke();
      if (c === 1) { g.strokeStyle = 'rgba(255,240,200,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, r + 5 + 2 * Math.sin(now / 160), 0, 6.2832); g.stroke(); }
    });
    // 見どころの光（崩れ・討死・本陣）：画面の縁がその軍の色に
    for (const e of rep.ev) if ((e.k === 'rout' || e.k === 'taisho' || e.k === 'hq') && Math.abs(t - e.t) < 3) { g.fillStyle = e.team ? 'rgba(200,67,46,.22)' : 'rgba(63,127,208,.22)'; g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6); }
    range.value = String(Math.round(((t - T0) / span) * 1000));
  };
  const pp = () => { el.querySelector('[data-a="pp"]').innerHTML = ico(playing ? 'pause' : 'play'); };
  const setSpeed = (s) => { speed = s; for (const b of el.querySelectorAll('[data-s]')) b.setAttribute('aria-pressed', String(b.dataset.s === s)); };
  el.querySelector('[data-a="pp"]').addEventListener('click', () => { if (t >= T1) { t = T0; trailTo(t); } playing = !playing; pp(); });
  for (const b of el.querySelectorAll('[data-s]')) b.addEventListener('click', () => { setSpeed(b.dataset.s); if (t < T1) { playing = true; pp(); } });
  el.querySelector('[data-a="again"]').addEventListener('click', () => { t = T0; trailTo(t); trail._i = -1; playing = true; pp(); });
  range.addEventListener('input', () => { t = T0 + (Number(range.value) / 1000) * span; trailTo(t); trail._i = Math.floor(((t - T0) / span) * (N - 1)); playing = false; pp(); });
  const close = () => { cancelAnimationFrame(raf); ro?.disconnect(); document.removeEventListener('keydown', key, true); el.remove(); o.onClose?.(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.querySelector('[data-a="pp"]').click(); } };
  document.addEventListener('keydown', key, true);
  el.querySelector('.sky-x').addEventListener('click', close);
  pp(); trailTo(t); raf = requestAnimationFrame(draw);
  el.querySelector('[data-a="pp"]').focus({ preventScroll: true });
  return { close, el, get t() { return t; }, seek(tt) { t = Math.max(T0, Math.min(T1, tt)); trailTo(t); trail._i = -1; }, setSpeed, play() { playing = true; pp(); }, pause() { playing = false; pp(); } };
}
