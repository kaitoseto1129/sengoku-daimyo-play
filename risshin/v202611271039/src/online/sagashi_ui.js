// 相手探しの画面（K598・11/21 iMac k598-home）。布陣の後〔online/index.js の toFujin〕に開く。
//   通信は k592-net の net_match.js（findMatch の waitCard の口）。この画面は見た目だけ：待ち時間・段位の幅が広がる様子・［探すのをやめる］、
//   見つかったら相手の名・段位・家、見つからなければ［模擬合戦へ］［もう一度探す］［ホームへ］。
//   段位の幅は受け渡し所（server/online/src/core.js）と同じ：始め ±100・一秒ごとに +10・最大 ±600、二十秒を過ぎたら誰とでも。
import { addEn } from '../i18n.js';
import { HOUSES, monCanvas } from './house.js';
import { rankName, RANK_EN } from './rank_tier.js';
import { rankCss, rankCardHtml } from './rank_ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 段位の名：足軽三〜天下人（rank_tier.js）。名は一つの関数から
export const danOf = (r) => rankName(r);
export const bandOf = (sec) => (sec >= 20 ? Infinity : Math.min(600, 100 + 10 * sec));
const houseOf = (id) => HOUSES.find((h) => h.id === id) || null;

const CSS = `
.sg{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(ellipse at 50% 45%,#2a2016,#0a0806);color:#ece4d2;font-family:var(--ui,sans-serif)}
.sg-box{width:min(560px,100%);display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.sg h2{margin:0;font:700 20px var(--display,serif);letter-spacing:.14em;color:#e6c77a}
.sg-ring{position:relative;width:76px;height:76px;border-radius:50%;border:3px solid rgba(230,199,122,.25);border-top-color:#e6c77a;animation:sgSpin 1.4s linear infinite}
.sg-t{font:700 22px var(--ui,sans-serif);font-variant-numeric:tabular-nums;letter-spacing:.06em}
@keyframes sgSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.sg-ring{animation:none}}
.sg-band{width:100%;display:flex;flex-direction:column;gap:6px}
.sg-bar{position:relative;height:14px;border-radius:7px;background:rgba(236,228,210,.12);overflow:hidden}
.sg-bar i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,rgba(230,199,122,.35),rgba(230,199,122,.75),rgba(230,199,122,.35))}
.sg-bar b{position:absolute;top:-3px;width:4px;height:20px;margin-left:-2px;background:#fff;border-radius:2px;box-shadow:0 0 0 2px #b8302a}
.sg-cap{position:relative;height:18px;font-size:13px;color:#cbbd9c}
.sg-cap span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.sg-mid{font-size:14px;color:#ece4d2;font-weight:600}
.sg-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.sg button{min-height:44px;min-width:150px;padding:0 16px;border-radius:4px;font:600 15px var(--ui,sans-serif);letter-spacing:.06em;color:#fff4e0;background:rgba(20,18,15,.9);border:1px solid rgba(236,228,210,.35);cursor:pointer}
.sg button.go{background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070}
.sg-foe{display:flex;align-items:center;gap:14px;padding:10px 16px;border:1px solid #d9b45a;border-radius:6px;background:#17130ecc;text-align:left}
.sg-foe canvas{width:64px;height:64px;flex:none}
.sg-foe b{display:block;font:700 19px var(--display,serif);letter-spacing:.08em}
.sg-foe small{display:block;font-size:14px;color:#cbbd9c;margin-top:2px}
.sg p{margin:0;font-size:15px;line-height:1.5;color:#cbbd9c}
@media (max-height:500px){.sg-box{gap:6px}.sg-me .rk{padding:4px 10px}.sg-me .rk-mon{width:40px;height:40px}.sg-me .rk-mon svg{width:26px;height:26px}.sg>.sg-box>p{font-size:13px}.sg-ring{width:54px;height:54px}.sg h2{font-size:18px}}
`;

// 開く。o：{ onCancel }。返す物：{ waitCard（net_match.js の口へ渡す）, found(foe)→Promise, notFound({practice, retry, home}), close, cancelled }
export function openSagashi(o = {}) {
  en(); rankCss();
  if (!document.getElementById('sg-css')) { const st = document.createElement('style'); st.id = 'sg-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'sg'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '相手を探す');
  document.body.appendChild(el);
  const t0 = Date.now();
  let my = null, tick = 0, cancelFn = null;
  const ui = { cancelled: false };
  const searching = () => {
    el.innerHTML = `<div class="sg-box"><h2>相手を探しています</h2><div class="sg-me"></div><p>同じ兵力・同じ Cost の勝負</p><div class="sg-ring" aria-hidden="true"></div><div class="sg-t" aria-live="off">0:00</div>
      <div class="sg-band"><div class="sg-bar" aria-hidden="true"><i></i><b></b></div><div class="sg-cap" aria-hidden="true"><span class="lo"></span><span class="hi"></span></div><div class="sg-mid">段位の近い相手</div></div>
      <div class="sg-row"><button type="button" data-a="stop">探すのをやめる</button></div></div>`;
    el.querySelector('[data-a="stop"]').addEventListener('click', () => { ui.cancelled = true; (cancelFn || o.onCancel || (() => {}))(); });
    draw();
    clearInterval(tick); tick = setInterval(draw, 500);
  };
  // 段位の帯：横は 600〜2200 点。自分の印と、幅の帯（二十秒を過ぎたら端まで）
  const draw = () => {
    if (!el.isConnected) { clearInterval(tick); return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    const tt = el.querySelector('.sg-t'); if (!tt) return;
    tt.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const meEl = el.querySelector('.sg-me'); if (meEl && meEl._r !== my) { meEl._r = my; meEl.innerHTML = rankCardHtml(my ?? 1000); }
    const r = my ?? 1000, w = bandOf(s), L = 600, R = 2200, x = (v) => Math.max(0, Math.min(100, ((v - L) / (R - L)) * 100));
    const bar = el.querySelector('.sg-bar i'), me = el.querySelector('.sg-bar b');
    const a = w === Infinity ? 0 : x(r - w), b = w === Infinity ? 100 : x(r + w);
    bar.style.left = `${a}%`; bar.style.width = `${b - a}%`; me.style.left = `${x(r)}%`;
    const lo = el.querySelector('.lo'), hi = el.querySelector('.hi');
    lo.textContent = w === Infinity ? '' : danOf(r - w); hi.textContent = w === Infinity ? '' : danOf(r + w);
    lo.style.left = `${Math.max(4, a)}%`; hi.style.left = `${Math.min(96, b)}%`;
    el.querySelector('.sg-mid').textContent = w === Infinity ? 'すべての段位' : my == null ? '段位の近い相手' : `自分 ${danOf(r)}`;
  };
  searching();
  el.querySelector('[data-a="stop"]').focus({ preventScroll: true });
  // net_match.js の findMatch へ渡す札の口：札は消さずにこの画面のまま（見つかった・見つからないを続けて出す）
  ui.waitCard = (onCancel) => { cancelFn = onCancel; return { remove() {}, setN(n, rating) { if (rating != null) { my = rating; draw(); } } }; };
  ui.setRating = (r) => { my = r; draw(); };
  ui.found = (foe = {}) => new Promise((done) => {
    clearInterval(tick);
    const h = houseOf(foe.deck?.house);
    el.innerHTML = `<div class="sg-box"><h2>相手が見つかりました</h2>
      <div class="sg-foe"><span class="mon"></span><div><b>${esc(foe.name || '名無しの将')}</b><small>${h ? `<span>${esc(h.name)}</span>` : ''}</small></div>${rankCardHtml(foe.rating ?? 1000)}</div>
      <div class="sg-row"><button type="button" class="go" data-a="go">合戦へ</button></div></div>`;
    if (h) try { el.querySelector('.mon').appendChild(monCanvas(h.mon, 64, 64)); } catch (e) { /* 紋が無くても進む */ }
    let fin = false; const go = () => { if (fin) return; fin = true; clearTimeout(tm); done(); };
    const tm = setTimeout(go, 3000);
    el.querySelector('[data-a="go"]').addEventListener('click', go);
    el.querySelector('[data-a="go"]').focus({ preventScroll: true });
  });
  ui.notFound = (k = {}) => {
    clearInterval(tick);
    el.innerHTML = `<div class="sg-box"><h2>相手が見つかりませんでした</h2><p>模擬合戦で軍団を試せます</p>
      <div class="sg-row"><button type="button" class="go" data-a="practice">模擬合戦へ</button><button type="button" data-a="retry">もう一度探す</button><button type="button" data-a="home">ホームへ</button></div></div>`;
    for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', () => { const f = k[b.dataset.a]; if (b.dataset.a === 'retry') { ui.cancelled = false; searching(); } else ui.close(); f && f(); });
    el.querySelector('[data-a="practice"]').focus({ preventScroll: true });
  };
  ui.close = () => { clearInterval(tick); el.remove(); };
  return ui;
}

let enDone = false;
function en() {
  if (enDone) return; enDone = true;
  addEn([['相手を探しています', 'Looking for an opponent'], ['段位の近い相手', 'Players near your rank'], ['すべての段位', 'Any rank'], ['探すのをやめる', 'Stop searching'],
    ['相手が見つかりました', 'Opponent found'], ['合戦へ', 'To battle'], ['名無しの将', 'Nameless general'], ['相手が見つかりませんでした', 'No opponent found'],
    ['模擬合戦で軍団を試せます', 'Try your army in a practice battle'], ['模擬合戦へ', 'Practice battle'], ['もう一度探す', 'Search again'], ['ホームへ', 'Home'], ['相手を探す', 'Find an opponent'], ['同じ兵力・同じ Cost の勝負', 'Equal troops, equal Cost'],     [/^自分 (.+)$/, (m, tr) => `You: ${tr(m[1])}`],
    [/^自分 (.+)$/, (m, tr) => `You: ${tr(m[1])}`], ...RANK_EN]);
}
