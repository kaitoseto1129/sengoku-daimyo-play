// 首実検の場面：勝った後、結果の画面の前。陣幕の中で大将が床几に座り、旗本が並ぶ前で、討った将の名と手柄が読み上げられ、褒美と出世が言い渡される。
// 首そのものは見せず、首桶と白布だけ。10〜15秒で、触れば飛ばせる。全60戦の共通。保存には触れない（読み上げは結果 r の中身だけ）。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const quiet = () => typeof window === 'undefined' || window.__autoplay || window.__norender === true || /[?&](autoplay|norender|bot)/.test(location.search);

const CSS = `<style>
.kj{position:fixed;inset:0;z-index:9000;background:#0b0907;color:#ece4d2;font-family:inherit;overflow:hidden;cursor:pointer;touch-action:manipulation;opacity:0;transition:opacity .6s}
.kj.on{opacity:1}
.kj .sky{position:absolute;inset:0 0 62% 0;background:linear-gradient(#1a1410,#2b2018)}
.kj .floor{position:absolute;inset:38% 0 0 0;background:linear-gradient(#3a2d1f,#150f0a)}
.kj .maku{position:absolute;left:0;right:0;top:0;height:30%;display:flex}
.kj .maku i{flex:1;background:linear-gradient(#e9e2cf,#c9c0a8);border-right:2px solid #0006;box-shadow:inset 0 -14px 18px #0005;animation:kjw 6s ease-in-out infinite}
.kj .maku i:nth-child(odd){background:linear-gradient(#1c1814,#0e0c0a);border-right:2px solid #c2a25a55}
.kj .maku i:nth-child(2){animation-delay:-1s}.kj .maku i:nth-child(3){animation-delay:-2s}.kj .maku i:nth-child(4){animation-delay:-3s}
.kj .men{position:absolute;left:0;right:0;top:12%;bottom:27%}
.kj .men svg{position:absolute;inset:0;width:100%;height:100%}
.kj .box{position:absolute;left:4%;right:4%;bottom:5%;min-height:21%;background:#14120fe6;border:1px solid #c2a25a;border-radius:6px;padding:12px 20px;box-sizing:border-box;display:flex;align-items:center;gap:16px}
.kj .box .t{flex:1;font-size:max(16px,calc(18px * var(--text-scale,1)));line-height:1.6;letter-spacing:.08em;transition:opacity .35s}
.kj .box .t b{display:block;font-size:max(20px,calc(24px * var(--text-scale,1)));letter-spacing:.14em}
.kj .box .k{background:#7a1b16;border:1px solid #c2a25a;padding:4px 14px;font-size:max(15px,calc(16px * var(--text-scale,1)));letter-spacing:.2em;white-space:nowrap}
.kj .box .t.off{opacity:0}
.kj .sk{position:absolute;right:12px;top:12px;min-height:44px;min-width:76px;background:#14120fcc;color:#ece4d2;border:1px solid #c2a25a;border-radius:4px;font-size:max(15px,calc(15px * var(--text-scale,1)));cursor:pointer}
@keyframes kjw{50%{transform:translateX(3px) skewX(.6deg)}}
@media (prefers-reduced-motion:reduce){.kj,.kj .box .t{transition:none}.kj .maku i{animation:none}}
</style>`;

// 陣幕の中：奥に大将（床几）、左右に旗本、手前に首桶（白布をかけたまま）。顔は描かず、影の形だけ
function hallSvg() {
  const man = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><path d="M-12 0 L-9 -34 Q0 -42 9 -34 L12 0 Z"/><circle cx="0" cy="-44" r="8"/><path d="M-10 -48 Q0 -62 10 -48 L12 -44 L-12 -44Z" fill="#0d0b09"/><rect x="-1.5" y="-70" width="3" height="40" fill="#1a1612"/></g>`;
  const row = [[70, 150], [140, 160], [210, 150], [610, 150], [680, 160], [750, 150]].map(([x, y], i) => man(x, y, i % 2 ? 1.05 : 1, '#2c2620')).join('');
  const back = [[110, 118], [180, 120], [650, 118], [720, 120]].map(([x, y]) => man(x, y, .8, '#211c17')).join('');
  const lord = `<g transform="translate(420 140)"><path d="M-30 0 L-24 -26 H24 L30 0Z" fill="#5b4326"/><path d="M-26 -26 L-18 -62 Q0 -72 18 -62 L26 -26Z" fill="#2a1f18"/><path d="M-28 -50 L-48 -26 L-30 -22Z M28 -50 L48 -26 L30 -22Z" fill="#241a14"/><circle cx="0" cy="-74" r="9" fill="#2a1f18"/><path d="M-16 -78 Q0 -104 16 -78 L10 -70 H-10Z" fill="#14100c"/><path d="M0 -104 L-9 -118 M0 -104 L9 -118" stroke="#c2a25a" stroke-width="3"/><rect x="-3" y="-4" width="6" height="26" fill="#4a3a28"/></g>`;
  const tubs = [[330, 185], [420, 195], [510, 185]].map(([x, y]) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="22" rx="26" ry="7" fill="#0006"/><path d="M-22 -8 L-26 22 H26 L22 -8Z" fill="#6b4a28"/><path d="M-24 6 H24" stroke="#2a1a0c" stroke-width="2"/><path d="M-24 -10 Q0 -28 24 -10 L22 -4 Q0 -16 -22 -4Z" fill="#efe9d8"/></g>`).join('');
  return `<svg viewBox="0 20 840 220" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${back}${row}${lord}${tubs}</svg>`;
}

// 読み上げる段：討った名のある将ごと → 手柄 → 褒美 → 出世
export function kubijikkenSteps(r) {
  const lines = r.lines || [];
  const heads = [...new Set(lines.filter((l) => l.label === '敵武将撃破' && l.detail).map((l) => String(l.detail).trim()).filter(Boolean))];
  const special = lines.find((l) => l.big && l.label !== '敵武将撃破' && l.pts > 0);
  const steps = [];
  for (const n of heads.slice(0, 3)) steps.push({ k: '首', b: n, x: '討ち取り、見事である' });
  if (heads.length > 3) steps.push({ k: '首', b: `ほか${heads.length - 3}人`, x: 'いずれも確かに改めた' });
  if (special) steps.push({ k: '手柄', b: String(special.label).replace(/。.*$/, ''), x: '功、抜きん出たり' });
  else if (!heads.length) steps.push({ k: '手柄', b: '戦場での働き', x: '皆が見ておった' });
  // 褒美：討った将・特別な手柄・戦功の大きさで変わる（このあとの評定でも褒美を賜る）
  const score = heads.length * 2 + (special ? 2 : 0) + ((r.total || 0) >= 150 ? 2 : (r.total || 0) >= 110 ? 1 : 0);
  steps.push({ k: '褒美', b: score >= 5 ? '感状と、あつい褒美' : score >= 3 ? '感状と、褒美' : '褒美を取らせる', x: '' });
  if (r.promoted) steps.push({ k: '出世', b: `${r.rankNameAfter || ''}に取り立てる`, x: r.rankNameBefore ? `${r.rankNameBefore}より、これよりは${r.rankNameAfter || ''}じゃ` : '' });
  return steps.slice(0, 5);
}

export function kubijikken(r, done, o = {}) {
  if (typeof document === 'undefined' || quiet() || !r || !r.mainDone || r.downInfo || o.skip) return done();
  const steps = kubijikkenSteps(r);
  const per = Math.min(3000, Math.max(2200, 13000 / steps.length));
  const el = document.createElement('div');
  el.className = 'kj'; el.setAttribute('role', 'dialog'); el.tabIndex = -1;
  el.innerHTML = `${CSS}<div class="sky"></div><div class="floor"></div><div class="maku"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="men">${hallSvg()}</div>
    <div class="box"><span class="k"></span><p class="t" aria-live="polite"></p></div><button type="button" class="sk">とばす</button>`;
  document.body.appendChild(el);
  const kEl = el.querySelector('.k'), tEl = el.querySelector('.t');
  requestAnimationFrame(() => el.classList.add('on'));
  let i = 0, over = false, timer = 0;
  const end = () => { if (over) return; over = true; clearTimeout(timer); document.removeEventListener('keydown', onKey, true); el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => { el.remove(); done(); }, 300); };
  const show = () => {
    const s = steps[i];
    tEl.classList.add('off');
    setTimeout(() => { if (over) return; kEl.textContent = s.k; tEl.innerHTML = `<b>${esc(s.b)}</b>${s.x ? esc(s.x) : ''}`; tEl.classList.remove('off'); }, i ? 300 : 0);
    timer = setTimeout(() => { if (++i >= steps.length) end(); else show(); }, per);
  };
  function onKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } }
  document.addEventListener('keydown', onKey, true);
  el.onclick = end;
  el.querySelector('.sk').onclick = (e) => { e.stopPropagation(); end(); };
  show();
}
