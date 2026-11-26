// ランク戦の画面を一つのデザインに揃える部品（K580・11/24 Sanae）：段の札（印・段の名・次の階までの棒）。
//   相手探し（sagashi_ui）・試合の後の札（match_link.showMatchEnd）・上空の見返し（replay_sky）が同じ札を使う。字は段の名と点だけ。
import { isEn, addEn } from '../i18n.js';
import { tierOf, rankName, moveOf, RANK_EN, TIERS } from './rank_tier.js';

const CSS = `
.rk{display:inline-flex;align-items:center;gap:12px;padding:8px 14px;border:1px solid var(--rk,#d9b45a);border-radius:6px;background:#17130ecc;color:#ece4d2;text-align:left;font-family:var(--ui,sans-serif)}
.rk-mon{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 38%,#2a2016,#0c0a07);border:3px solid var(--rk,#d9b45a);box-shadow:0 0 0 2px #0008,0 0 14px color-mix(in srgb,var(--rk,#d9b45a) 40%,transparent)}
.rk-mon svg{width:34px;height:34px}
.rk-b{display:block;font:700 19px var(--display,serif);letter-spacing:.1em;color:var(--rk,#e6c77a)}
.rk-p{display:block;font-size:14px;color:#cbbd9c;margin-top:2px;font-variant-numeric:tabular-nums}
.rk-bar{position:relative;display:block;width:150px;height:8px;margin-top:6px;border-radius:4px;background:rgba(236,228,210,.14);overflow:hidden}
.rk-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--rk,#d9b45a);transition:width .9s cubic-bezier(.2,.7,.2,1)}
.rk.up{animation:rkUp 1.2s ease-out}.rk.down{animation:rkDown .9s ease-out}
@keyframes rkUp{0%{box-shadow:0 0 0 0 #e6c77a}60%{box-shadow:0 0 0 14px #e6c77a00}100%{box-shadow:none}}
@keyframes rkDown{0%,40%{transform:translateY(0)}20%{transform:translateY(3px)}}
.rk-mv{display:inline-flex;align-items:center;gap:4px;font:700 20px var(--ui,sans-serif);font-variant-numeric:tabular-nums}
.rk-mv.up{color:#8fd68a}.rk-mv.down{color:#ef8a7a}.rk-mv svg{width:18px;height:18px}
@media (max-height:500px){.story:has([data-match-end]) h2{font-size:40px;line-height:1.1;margin:0 0 2px}.story:has([data-match-end]) .year{margin:0}.story:has([data-match-end]) p{margin:2px 0}.story:has([data-match-end]) .mt-report td,.story:has([data-match-end]) .mt-report th{padding-top:0!important;padding-bottom:0!important}.rk{padding:3px 10px;gap:8px}.rk-mon{width:32px;height:32px;border-width:2px}.rk-mon svg{width:20px;height:20px}.rk-b{font-size:16px}.rk-p{font-size:13px;margin-top:0}.rk-bar{margin-top:3px;width:120px}.rk-mv{font-size:18px}}
@media (prefers-reduced-motion:reduce){.rk.up,.rk.down{animation:none}.rk-bar i{transition:none}}
`;
let done = false;
export function rankCss() {
  if (typeof document === 'undefined' || done || document.getElementById('rk-css')) return; done = true;
  const s = document.createElement('style'); s.id = 'rk-css'; s.textContent = CSS; document.head.appendChild(s);
  addEn(RANK_EN);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 段の印：段の数だけ横の線（足軽一本〜天下人六本の冠）。色と形の両方で段を示す
export function monSvg(idx) {
  const n = idx + 1, bars = Array.from({ length: n }, (_, i) => `<rect x="${12 - n * 1.8 + i * 3.6 + 0.4}" y="${6 + (n - 1 - i) * 0}" width="2.6" height="${10 + i * 1.6}" rx="1"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><g transform="translate(0 2)">${bars}</g><path d="M3 21h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;
}
/** 段の札の HTML。r＝点。o：{ en, cls, id } */
export function rankCardHtml(r, o = {}) {
  const en = o.en ?? isEn(), t = tierOf(r), col = t.tier.col;
  const next = t.hi == null ? '' : `<span class="rk-bar" aria-hidden="true"><i style="width:${Math.round(t.progress * 100)}%"></i></span>`;
  return `<div class="rk ${o.cls || ''}" ${o.id ? `id="${o.id}"` : ''} style="--rk:${col}" role="img" aria-label="${esc(rankName(r, en))} ${t.rating}">
    <span class="rk-mon" style="color:${col}">${monSvg(t.idx)}</span><span><b class="rk-b">${esc(rankName(r, en))}</b><span class="rk-p">${t.rating}${t.hi == null ? '' : ` / ${t.hi}`}</span>${next}</span></div>`;
}
/** 前後の変わり：矢印（上下）と点の差。段が上がった・下がった時は枠が光る・揺れる */
export function moveHtml(before, after) {
  const m = moveOf(before, after), up = m.delta > 0, dn = m.delta < 0, cls = up ? 'up' : dn ? 'down' : '';
  const ar = up ? '<path d="M12 4 5 12h4.5v8h5v-8H19z"/>' : dn ? '<path d="M12 20l7-8h-4.5V4h-5v8H5z"/>' : '<path d="M4 10h16v4H4z"/>';
  return `<span class="rk-mv ${cls}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ar}</svg>${m.delta > 0 ? '+' : ''}${m.delta}</span>`;
}
export { rankName, tierOf, moveOf, TIERS };
