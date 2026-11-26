// 登城帳の札（K600・docs/kaito_toyo_1121.md 67〜72）。openTojo(root, { save, onSave, onDone(goToyo) })。
//   上に「今月の登城武将 〇〇 14回登城で獲得 現在 N/14」。短い演出（城門→登城→印が一つ押される・約1.5秒・押せばすぐ終わる・全画面の強制は無し）。
//   巻物に「今月 N回目の登城」・28の印・今日・次・その先の褒美。受け取ると onDone（index.js が「本日の無料登用 5回［登用へ］［あとで］」へ）。
//   押せる所は 44px・間 8px。字は 13px 以上。「動きを減らす」の時は演出を飛ばす。
import { DAYS, view, claim, choicesOf, rewardOf } from './tojo.js';
import { face, esc } from './house.js';
import { isEn, addEn } from '../i18n.js';
if (isEn()) import('./i18n_toyo.js').then((m) => addEn(m.default)).catch(() => {});   // K516：登城帳・軍団の編成の英訳

const MARK = { SSR: '◆◆', SR: '◆', R: '▲', N: '■' };
const CSS = `
.tj{position:fixed;inset:0;z-index:9002;display:flex;align-items:center;justify-content:center;background:#0b0806ee;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}
.tj *{box-sizing:border-box}
.tj-box{width:min(820px,100%);max-height:100%;display:flex;flex-direction:column;gap:6px;background:#1c1813;border:1px solid #8a7350;border-radius:6px;padding:8px 12px;overflow:auto}
.tj-head{display:flex;align-items:center;gap:10px;border-bottom:1px solid #3a2f22;padding-bottom:6px}
.tj-face{width:44px;height:44px;flex:none;border:1px solid #8a7350;border-radius:4px;overflow:hidden;background:#0006;display:flex;align-items:center;justify-content:center}
.tj-face img{width:100%;height:100%;object-fit:cover}
.tj-head .t{flex:1;min-width:0}.tj-head small{font-size:13px;color:#cdbf9f}
.tj-head b{color:#e8c77a;font-size:17px;font-weight:600}
.tj-meter{height:6px;background:#0008;border-radius:3px;overflow:hidden;margin-top:3px}.tj-meter i{display:block;height:100%;background:#c9a24a}
.tj-main{display:flex;gap:10px;min-height:0}
.tj-anim{flex:0 0 34%;min-width:150px;aspect-ratio:4/3;max-height:190px;border:1px solid #3a2f22;border-radius:4px;background:#2a231b;display:block;width:100%}
.tj-scroll{flex:1;min-width:0;background:#e9dcc0;color:#2a1d12;border-radius:3px;padding:6px 8px;box-shadow:inset 0 0 0 3px #c9b48a}
.tj-scroll h2{margin:0 0 4px;font-size:16px;font-weight:600;color:#5a1f17}
.tj-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.tj-c{position:relative;aspect-ratio:1;max-height:30px;border:1px solid #a8916a;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#7a6548}
.tj-c.big{border-color:#5a1f17;border-width:2px;color:#5a1f17;font-weight:600}
.tj-c.on{background:#b3261e;color:#fff2dc;border-color:#7a1410}
.tj-c.now{outline:2px solid #e8a33a;outline-offset:1px}
.tj-c.stamp{animation:tjStamp .35s ease-out}
@keyframes tjStamp{0%{transform:scale(2.2);opacity:0}70%{transform:scale(.92);opacity:1}100%{transform:scale(1)}}
.tj-rows{display:flex;gap:8px;flex-wrap:wrap}
.tj-r{flex:1 1 0;min-width:140px;border:1px solid #3a2f22;border-radius:4px;padding:4px 8px;background:#0004}
.tj-r small{display:block;font-size:13px;color:#cdbf9f}.tj-r.today{border-color:#e8c77a;background:#3a1d14}
.tj button{font:inherit;color:inherit;min-height:44px;min-width:110px;border-radius:4px;cursor:pointer;border:1px solid #e8c77a;background:#5a1f17;padding:4px 12px}
.tj button.sec{background:#0007;border-color:#8a7350}
.tj button:disabled{opacity:.45;cursor:default}
.tj-foot{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.tj-pick{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-height:150px;overflow:auto}
.tj-pick button{min-width:120px;background:#2a1d12;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 10px}
.tj-pf{width:56px;height:56px}
.tj-msg{color:#f3d68a;text-align:center;min-height:1.4em}
@media (max-height:430px){.tj-anim{max-height:150px}.tj-c{max-height:24px;font-size:12px}.tj-scroll h2{font-size:15px;margin-bottom:2px}}
@media (prefers-reduced-motion:reduce){.tj-c.stamp{animation:none}}
`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion'); } catch (e) { return false; } };

// 城門→主人公が登城→印。t は 0〜1。字は使わない（絵だけ）
function drawGate(cv, t) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#5d6b78'); sky.addColorStop(1, '#c9b48a'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // 石垣と城門（高麗門の形）
  g.fillStyle = '#6d6458'; g.beginPath(); g.moveTo(0, H * .62); g.lineTo(W * .3, H * .5); g.lineTo(W * .7, H * .5); g.lineTo(W, H * .62); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  const gx = W * .5, gy = H * .5, gw = W * .32, gh = H * .3;
  const open = Math.min(1, t / .35);
  g.fillStyle = '#20180f'; g.fillRect(gx - gw / 2, gy - gh, gw, gh);
  g.fillStyle = '#4a3523'; g.fillRect(gx - gw / 2, gy - gh, gw / 2 * (1 - open * .8), gh); g.fillRect(gx + gw / 2 - gw / 2 * (1 - open * .8), gy - gh, gw / 2 * (1 - open * .8), gh);
  g.fillStyle = '#2b2a2e'; g.beginPath(); g.moveTo(gx - gw * .7, gy - gh); g.lineTo(gx + gw * .7, gy - gh); g.lineTo(gx + gw * .5, gy - gh * 1.45); g.lineTo(gx - gw * .5, gy - gh * 1.45); g.fill();
  g.fillStyle = '#3a2a1c'; g.fillRect(gx - gw / 2 - 5, gy - gh, 5, gh); g.fillRect(gx + gw / 2, gy - gh, 5, gh);
  // 道
  g.fillStyle = '#a89470'; g.beginPath(); g.moveTo(gx - gw * .3, gy); g.lineTo(gx + gw * .3, gy); g.lineTo(gx + W * .2, H); g.lineTo(gx - W * .2, H); g.fill();
  // 主人公（手前から門へ歩む。小さくなっていく）
  const w = Math.min(1, Math.max(0, (t - .2) / .55)), py = H * .98 - (H * .98 - gy) * w, s = 1 - w * .62;
  if (w < 1) {
    g.fillStyle = '#1a140f'; g.beginPath(); g.ellipse(gx, py - 26 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(gx - 6 * s, py - 24 * s, 12 * s, 18 * s);
    g.fillStyle = '#7a1410'; g.fillRect(gx - 2 * s, py - 44 * s, 1.5 * s, 22 * s); g.fillRect(gx - 2 * s, py - 44 * s, 8 * s, 10 * s);
    const st = Math.sin(t * 40) * 3 * s; g.fillStyle = '#1a140f'; g.fillRect(gx - 5 * s + st, py - 7 * s, 3 * s, 7 * s); g.fillRect(gx + 2 * s - st, py - 7 * s, 3 * s, 7 * s);
  }
  // 印（朱の角印が押される）
  const k = Math.max(0, (t - .78) / .22);
  if (k > 0) {
    const sz = W * .2 * (1 + (1 - Math.min(1, k * 1.4)) * 1.2);
    g.globalAlpha = Math.min(1, k * 2); g.fillStyle = '#b3261e'; g.fillRect(W * .8 - sz / 2, H * .25 - sz / 2, sz, sz);
    g.strokeStyle = '#f3d6b0'; g.lineWidth = 2; g.strokeRect(W * .8 - sz * .36, H * .25 - sz * .36, sz * .72, sz * .72); g.globalAlpha = 1;
  }
}

export function openTojo(root, o = {}) {
  const save = o.save || {}, now = o.now || Date.now();
  if (!document.getElementById('tj-css')) { const s = document.createElement('style'); s.id = 'tj-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'tj'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '登城帳');
  root.appendChild(el);
  let msg = '', stamped = false, raf = 0;
  const v0 = view(save, now);
  const draw = () => {
    const v = view(save, now), g = v.general;
    const cell = (n) => { const r = rewardOf(n, now); return `<div class="tj-c${r.big ? ' big' : ''}${n <= v.count ? ' on' : ''}${n === v.count ? ' now' : ''}${n === v.count && !stamped ? ' stamp' : ''}" aria-label="${n}回目 ${esc(r.label)}">${n <= v.count ? '印' : n}</div>`; };
    const row = (cls, head, r) => `<div class="tj-r ${cls}"><small>${head}</small>${r ? `${r.n}回目　${esc(r.label)}` : '今月の褒美はここまで'}</div>`;
    el.innerHTML = `<div class="tj-box">
      <div class="tj-head"><div class="tj-face" id="tj-face"></div><div class="t"><small>今月の登城武将</small>　<b>${esc(g ? g.name : '')}</b>　<small>${g ? `${MARK[g.rank]} ${g.rank}　` : ''}${v.genAt}回登城で獲得　現在 ${Math.min(v.count, v.genAt)}/${v.genAt}</small>
        <div class="tj-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, v.count / v.genAt))}%"></i></div></div></div>
      <div class="tj-main"><canvas class="tj-anim" width="320" height="240" aria-hidden="true"></canvas>
        <div class="tj-scroll"><h2>今月 ${v.count}回目の登城</h2><div class="tj-grid">${Array.from({ length: DAYS }, (_, i) => cell(i + 1)).join('')}</div></div></div>
      <div class="tj-rows">${row('today', v.todayGot ? '今日（受け取った）' : '今日', v.today)}${row('', '次', v.next)}${row('', 'その先', v.after)}</div>
      <p class="tj-msg" role="status">${esc(msg)}</p>
      <div class="tj-foot">${v.today && !v.todayGot ? '<button data-a="get">受け取る</button>' : '<button data-a="done">進む</button>'}</div></div>`;
    stamped = true;
    const fe = el.querySelector('#tj-face'); if (g && fe) face(fe, g.name);
    const cv = el.querySelector('.tj-anim'); if (cv) drawGate(cv, 1);
  };
  // 演出：約1.5秒。押すとすぐ終わる。動きを減らす時は最後の絵だけ
  const play = () => {
    const cv = el.querySelector('.tj-anim'); if (!cv || reduced()) return;
    const t0 = performance.now(), D = 1500;
    const step = (ts) => { const t = Math.min(1, (ts - t0) / D); if (!cv.isConnected) return; drawGate(cv, t); if (t < 1) raf = requestAnimationFrame(step); };
    drawGate(cv, 0); raf = requestAnimationFrame(step);
  };
  const skip = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; const cv = el.querySelector('.tj-anim'); if (cv) drawGate(cv, 1); } };
  const persist = () => { try { o.onSave && o.onSave(save); } catch (e) { /* 持てなくても画面は進む */ } };
  const resultText = (r) => r.b ? `${MARK[r.b.rank]} ${r.b.rank} ${r.b.name}を登用した${r.dup ? `（重なり 武将印${r.seal}）` : ''}` : r.kin ? `小判 ${r.kin}を受け取った` : `武将印 ${r.seals}を受け取った`;
  const pickScreen = (r) => {
    const list = choicesOf(r, now);
    el.innerHTML = `<div class="tj-box"><div class="tj-head"><div class="t"><b>${esc(r.label)}</b><br><small>一人を選んで登用する</small></div></div>
      <div class="tj-pick">${list.map((b) => `<button data-a="pick" data-id="${b.id}"><span class="tj-face tj-pf" data-n="${esc(b.name)}" aria-hidden="true"></span>${MARK[b.rank]} ${b.rank}<br><b>${esc(b.name)}</b>${save.owned?.includes(b.name) ? '<br><small>持っている</small>' : ''}</button>`).join('')}</div>
      <div class="tj-foot"><button class="sec" data-a="back">選ばずに戻る</button></div></div>`;
    el.querySelectorAll('.tj-pf').forEach((f) => face(f, f.dataset.n));
  };
  const finish = () => { skip(); el.remove(); o.onDone && o.onDone(); };
  el.onclick = (e) => {
    skip();
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const a = b.dataset.a, v = view(save, now);
    if (a === 'done') return finish();
    if (a === 'back') { draw(); return; }
    if (a === 'get') { if (v.today.kind === 'pick3' || v.today.kind === 'sel') return pickScreen(v.today); }
    if (a === 'get' || a === 'pick') {
      const r = claim(save, a === 'pick' ? b.dataset.id : null, now);
      try { r && window.risshinMetrics?.tojoClaim?.({}); } catch (e) {}
      if (r) { persist(); msg = resultText(r); }
      draw();
    }
  };
  draw(); play();
  return { el, close: () => { skip(); el.remove(); }, first: v0.count };
}
