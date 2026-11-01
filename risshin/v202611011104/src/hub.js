// 本陣（家）と、戦を選ぶ（サムネの並び）・戦の前の一枚（docs/app_structure_1031.md の①②）
// 字は名・年・数だけ。解禁・評定・次の戦は絵（暗さ・錠・前の戦の小さな絵・縁・印）で示す。
import { showScreen, topBack, RM } from './screens.js';
import { ODA_LINE, lineOf } from './state.js';
import { sfx } from './audio.js';
import { isBattleLocked } from './paywall.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const thumbURL = (id) => new URL(`../assets/thumbs/${id}.webp`, import.meta.url).href;
// あらすじ（二行・一文を短く）。screens.js の LORE に無い二戦だけここに
const MORE = {
  okawachi: ['伊勢の北畠氏が、大河内城にこもった', '城を囲み、夜の攻め口で木戸へ寄せる'],
  echizen_ikko: ['越前の一向一揆が、大滝寺に集まった', '夜に寺を討ち、逃げる一揆を追う'],
};
const yearNum = (b) => (String(b.year || '').match(/（(\d{4})）/) || [])[1] || '';
// 難しさの星（並びの先ほど難しい。1〜5）
const starsOf = (k) => Math.min(5, 1 + Math.floor(k / 7));
const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L10 14.6l-5.1 2.8 1.1-5.7L1.8 7.8l5.7-.7z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const GRADE_PIPS = { '丙': 1, '乙': 2, '甲': 3, '甲上': 3 };
const gradeHtml = (g) => g ? `<i class="pk-grade${g === '甲上' ? ' top' : ''}" role="img" aria-label="評定 ${esc(g)}">${'<b></b>'.repeat(GRADE_PIPS[g] || 1)}</i>` : '';

// 絵の印（本陣の札）
const ICON = {
  shop: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 52 46 12M18 52 52 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M44 10l8-2-2 8z" fill="currentColor"/><path d="M20 40c0-9 6-15 12-15s12 6 12 15H20z" fill="currentColor" opacity=".85"/><path d="M16 40h32" stroke="currentColor" stroke-width="3"/><path d="M26 25l-8-9M38 25l8-9" stroke="currentColor" stroke-width="2.5"/></svg>',
  train: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="40" cy="26" r="14" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="26" r="7" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="26" r="2.5" fill="currentColor"/><path d="M40 40v16M32 56h16" stroke="currentColor" stroke-width="3"/><path d="M8 52 33 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  ladder: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 58V10M38 58V10" stroke="currentColor" stroke-width="3"/><path d="M18 50h20M18 40h20M18 30h20M18 20h20" stroke="currentColor" stroke-width="3"/><path d="M46 8v26" stroke="currentColor" stroke-width="2.5"/><path d="M46 9h12l-3 5 3 5H46z" fill="currentColor"/></svg>',
  set: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 20a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" fill="currentColor"/><path d="M29 6h6l1 7 5 2 6-4 4 4-4 6 2 5 7 1v6l-7 1-2 5 4 6-4 4-6-4-5 2-1 7h-6l-1-7-5-2-6 4-4-4 4-6-2-5-7-1v-6l7-1 2-5-4-6 4-4 6 4 5-2z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  town: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 30 22 18l16 12M40 30l10-8 10 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M10 28v24h24V28M43 28v24h14V28" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 52V40h8v12" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 14l16-6 16 6 16-6v42l-16 6-16-6-16 6z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 8v42M40 14v42" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="30" r="4" fill="currentColor"/></svg>',
  realm: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 50h52M10 50V30h44v20" fill="none" stroke="currentColor" stroke-width="3"/><path d="M4 30 32 12l28 18z" fill="currentColor"/><path d="M16 50V38h8v12M40 50V38h8v12" fill="currentColor" opacity=".8"/><path d="M10 58c6-4 12-4 18 0s12 4 18 0 8-3 10-2" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  merit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18" stroke="currentColor" stroke-width="2"/><path d="M7 4h12l-3 4 3 4H7z" fill="currentColor"/></svg>',
};

const CSS = `<style>
  .hub, .pk, .pc { --gap: 10px; color: var(--washi); }
  .hub { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1fr); gap: 14px; max-width: 1200px; margin: 0 auto; align-items: stretch; }
  .hub-col { display: grid; gap: var(--gap); align-content: stretch; }
  .hub-col:first-child { grid-template-rows: 1.8fr 1fr; }
  @media (min-height: 501px) { .hub { height: min(720px, calc(100dvh - 120px)); margin-top: 8px; } .hub-me { min-height: 0; } .hub-c svg { width: 52px; height: 52px; } .hub-c { font-size: max(16px, calc(17px * var(--text-scale, 1))); } }
  .hub-me { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-height: 300px; position: relative; }
  .hub-me canvas { position: absolute; inset: 0 0 64px 0; width: 100%; height: calc(100% - 64px); }
  .hub-rank { position: relative; z-index: 1; font: 800 max(18px, calc(28px * var(--text-scale, 1))) var(--display); letter-spacing: .14em; text-shadow: 0 1px 4px #000; }
  .hub-bar { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; width: 100%; max-width: 280px; font: 700 max(13px, calc(14px * var(--text-scale, 1))) var(--ui); }
  .hub-bar i { flex: 1; height: 10px; background: rgba(236,228,210,.18); border: 1px solid rgba(236,228,210,.35); overflow: hidden; }
  .hub-bar i b { display: block; height: 100%; background: linear-gradient(90deg, #a8843c, #e6c77a); }
  .hub-bar svg { width: 18px; height: 18px; color: var(--kin); }
  .hub-go { position: relative; display: block; width: 100%; min-height: 120px; padding: 0; border: 2px solid var(--kin); background: #000; cursor: pointer; overflow: hidden; color: #fff; }
  .hub-go img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .hub-go::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.75)); }
  .hub-go .nm { position: absolute; z-index: 1; left: 12px; bottom: 10px; display: flex; align-items: center; gap: 8px; font: 800 max(18px, calc(24px * var(--text-scale, 1))) var(--display); letter-spacing: .16em; text-shadow: 0 1px 4px #000; }
  .hub-go .nm::before { content: ''; border: 9px solid transparent; border-left: 14px solid var(--kin); border-right: 0; }
  .hub-c { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 88px; padding: 8px 4px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--washi); cursor: pointer; font: 600 max(14px, calc(15px * var(--text-scale, 1))) var(--ui); letter-spacing: .08em; }
  .hub-c svg { width: 40px; height: 40px; color: var(--kin); }
  .hub-c.lock { opacity: .45; cursor: default; }
  .hub-c.lock::after { content: ''; position: absolute; right: 8px; top: 8px; width: 16px; height: 16px; background: currentColor; -webkit-mask: var(--lk) center/contain no-repeat; mask: var(--lk) center/contain no-repeat; }
  .hub-set { position: fixed; z-index: 3; top: max(8px, env(safe-area-inset-top, 0px)); right: max(12px, env(safe-area-inset-right, 0px)); width: 44px; height: 44px; padding: 6px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--kin); cursor: pointer; }
  .hub-set svg { width: 100%; height: 100%; }
  .hub-c:hover, .hub-c:focus-visible, .hub-go:hover, .hub-go:focus-visible, .hub-set:focus-visible { border-color: #e6c77a; outline: none; }
  .pk { margin: 0 calc(-1 * max(12px, env(safe-area-inset-left, 0px))); }
  .pk-row { display: grid; grid-auto-flow: column; grid-template-rows: repeat(3, auto); grid-auto-columns: 352px; gap: 12px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; padding: 4px max(16px, env(safe-area-inset-left, 0px)) 12px; scrollbar-width: thin; }
  .pk-c { position: relative; display: block; width: 100%; aspect-ratio: 16/9; padding: 0; border: 2px solid rgba(236,228,210,.22); background: #1d1a16; overflow: hidden; cursor: pointer; scroll-snap-align: start; color: #fff; text-align: left; }
  .pk-c img, .pc-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .pk-c::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.35) 0, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 52%, rgba(0,0,0,.78) 100%); pointer-events: none; }
  .pk-c > span, .pk-c > i { z-index: 1; }
  .pk-nm { position: absolute; left: 10px; right: 54px; bottom: 26px; font: 700 max(13px, calc(15px * var(--text-scale, 1))) var(--display); letter-spacing: .06em; line-height: 1.25; text-shadow: 0 1px 3px #000, 0 0 10px rgba(0,0,0,.9); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-yr { position: absolute; right: 8px; top: 6px; font: 600 max(12px, calc(12px * var(--text-scale, 1))) var(--ui); text-shadow: 0 1px 3px #000; opacity: .95; }
  .pk-st { position: absolute; left: 9px; bottom: 7px; display: flex; gap: 1px; }
  .pk-st svg, .pc-st svg { width: 14px; height: 14px; fill: var(--kin); stroke: rgba(0,0,0,.6); stroke-width: 1; }
  .pk-st svg.off, .pc-st svg.off { fill: rgba(236,228,210,.25); }
  .pk-best { position: absolute; right: 8px; bottom: 6px; display: flex; align-items: center; gap: 3px; font: 700 max(12px, calc(14px * var(--text-scale, 1))) var(--ui); text-shadow: 0 1px 3px #000; }
  .pk-best svg { width: 14px; height: 14px; color: var(--kin); }
  .pk-grade { position: absolute; left: 7px; top: 7px; display: flex; gap: 3px; padding: 4px 5px; background: rgba(20,18,15,.78); border: 1px solid rgba(236,228,210,.4); border-radius: 10px; }
  .pk-grade b { width: 7px; height: 7px; border-radius: 50%; background: #d8cfb9; }
  .pk-grade.top { border-color: #e6c77a; box-shadow: 0 0 0 1px #e6c77a inset; }
  .pk-grade.top b { background: #e6c77a; }
  .pk-c.next { border-color: #e6c77a; animation: pkGlow 2.6s ease-in-out infinite; }
  @keyframes pkGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(230,199,122,.0); } 50% { box-shadow: 0 0 14px 2px rgba(230,199,122,.55); } }
  body.rm .pk-c.next { animation: none; }
  @media (prefers-reduced-motion: reduce) { .pk-c.next { animation: none; } }
  .pk-c.lock { cursor: default; }
  .pk-c.lock { background: linear-gradient(160deg, #26221c, #12100d); border-color: rgba(236,228,210,.12); color: rgba(236,228,210,.6); }
  .pk-c.lock::after { content: none; }
  .pk-lk { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 6px; color: #e4dccb; }
  .pk-lk > svg { width: 34px; height: 34px; fill: currentColor; }
  .pk-c.flash { border-color: #e6c77a; box-shadow: 0 0 0 3px rgba(230,199,122,.7); }
  .pk-c:focus-visible { outline: 3px solid #e6c77a; outline-offset: 2px; }
  .pc { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; max-width: 1200px; margin: 0 auto; align-items: center; }
  .pc-art { position: relative; aspect-ratio: 16/9; border: 1px solid rgba(236,228,210,.3); overflow: hidden; background: #1d1a16; }
  .pc h2 { margin: 0 0 4px; font: 800 max(18px, calc(28px * var(--text-scale, 1))) var(--display); letter-spacing: .1em; }
  .pc .yr { font: 500 max(12px, calc(14px * var(--text-scale, 1))) var(--ui); color: var(--washi-dim, #c9bfa9); letter-spacing: .06em; }
  .pc-st { display: flex; gap: 2px; margin: 8px 0; align-items: center; }
  .pc-st .pk-best { position: static; margin-left: 12px; }
  .pc p { margin: 6px 0; font-size: max(15px, calc(16px * var(--text-scale, 1))); line-height: 1.6; }
  .pc .go { margin-top: 12px; min-height: 52px; width: 100%; font-size: max(16px, calc(18px * var(--text-scale, 1))); }
  @media (max-height: 500px) {
    #screen.has-back:has(> .pk) { padding-top: calc(52px + env(safe-area-inset-top, 0px)); }
    .pk-row { grid-template-rows: repeat(2, auto); grid-auto-columns: 228px; gap: 10px; padding-bottom: 8px; }
    .hub { gap: 10px; }
    .hub-me { min-height: 0; height: calc(100dvh - 76px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
    .hub-me canvas { inset: 0 0 52px 0; height: calc(100% - 52px); }
    .hub-rank { font-size: 20px; }
    .hub-go { min-height: 0; }
    .hub-c { min-height: 0; padding: 4px 2px; }
    .hub-c svg { width: 30px; height: 30px; }
    .pc { gap: 14px; }
    .pc h2 { font-size: 20px; }
    .pc p { margin: 3px 0; line-height: 1.5; font-size: 15px; }
    .pc .go { margin-top: 8px; min-height: 48px; }
  }
  @media (max-width: 640px) and (orientation: portrait) {
    .hub, .pc { grid-template-columns: 1fr; }
    .hub-me { min-height: 260px; order: -1; }
    .pk-row { grid-template-rows: repeat(3, auto); grid-auto-columns: 220px; }
  }
</style>`;

// 画面を出る時に、サムネの画像を手放す（記憶を増やさない）
let held = null;
function release() {
  if (!held) return;
  for (const im of held.querySelectorAll('img')) { im.removeAttribute('srcset'); im.src = ''; }
  held = null;
}
const leave = (f) => () => { release(); sfx('ui'); f(); };

// 戦の並び：ODA_LINE の32戦。保存の並び（lineOf）での番号と、解禁（次の戦まで）
export function battleRows(G) {
  const line = lineOf(G);
  const prog = G.battle | 0;
  return ODA_LINE.map((b, k) => {
    const j = line.findIndex((x) => x.id === b.id);
    // 前の保存（尾張統一戦が並びに無い）の稲生は、いつも遊べる
    // 最初の3戦はいつも開いている（kaito 10/31 夜）
    const state = j < 0 ? 'done' : j === prog ? 'next' : j < prog || j < 3 ? 'done' : 'lock';
    return { b, k, j, state, grade: j >= 0 ? (G.grades || [])[j] : null, best: j >= 0 ? (G.best || [])[j] || 0 : 0, pay: isBattleLocked('oda', b.id) };
  });
}

// ---------------- ホーム（真ん中に今の自分・周りに入口） ----------------
let pv = null;
const freePv = () => { if (pv) { try { pv.dispose(); } catch (e) { /* 捨てられなくてもよい */ } pv = null; } };
export function hubScreen(G, game, o) {
  release(); freePv();
  const rows = battleRows(G);
  const nx = rows.find((r) => r.state === 'next') || rows[rows.length - 1];
  const R = o.ranks, cur = R[G.rank] || R[0], nr = R[G.rank + 1];
  const m = G.merit || 0, need = nr ? Math.max(0, nr.min - m) : 0;
  const pct = nr ? Math.max(0, Math.min(100, Math.round((m - cur.min) / Math.max(1, nr.min - cur.min) * 100))) : 100;
  const card = (k, icon, label, open = true) => `<button type="button" class="hub-c${open ? '' : ' lock'}" data-k="${k}" ${open ? '' : 'aria-disabled="true"'}>${ICON[icon]}<span>${label}</span></button>`;
  const s = showScreen(`${CSS}<div class="hub" style="--lk:url('data:image/svg+xml;utf8,${encodeURIComponent(LOCK.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}')">
    <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">ホーム</h1>
    <div class="hub-col">
      <button type="button" class="hub-go" id="hub-go" aria-label="出陣"><img src="${thumbURL(nx.b.id)}" alt="" decoding="async"><span class="nm">出陣</span></button>
      ${card('town', 'town', '城下町')}
    </div>
    <div class="hub-me"><canvas id="hub-pv" aria-hidden="true"></canvas><div class="hub-rank">${esc(cur.name)}</div>
      <div class="hub-bar" role="img" aria-label="${nr ? `次の位まであと${need}` : '最上の位'}">${ICON.merit}<i><b style="width:${pct}%"></b></i>${nr && need ? `<span>あと${need}</span>` : ''}</div></div>
    <div class="hub-col">
      ${card('realm', 'realm', '内政', o.realmOn)}${card('map', 'map', '天下の地図', o.mapOn)}${card('train', 'train', '訓練所')}
    </div></div>
    <button type="button" class="hub-set" id="hub-set" aria-label="設定">${ICON.set}</button>`);
  held = s.querySelector('.hub');
  const out = (f) => () => { freePv(); leave(f)(); };
  topBack(out(o.onTitle), '題の画面へ');
  $q('#hub-go').onclick = out(() => pickScreen(G, game, o));
  $q('#hub-set').onclick = out(() => o.on.set());
  for (const b of s.querySelectorAll('.hub-c')) b.onclick = b.classList.contains('lock') ? () => sfx('ui') : out(() => o.on[b.dataset.k]());
  const cv = $q('#hub-pv');
  if (cv && !o.noPreview) import('./preview.js').then(({ Preview }) => { if (!cv.isConnected) return; freePv(); pv = new Preview(cv); if (pv.renderer) pv.setLook(G); else pv = null; }).catch(() => {});
  if (!('ontouchstart' in window)) $q('#hub-go').focus({ preventScroll: true });
}
const $q = (sel) => document.querySelector('#screen ' + sel);

// ---------------- 戦を選ぶ ----------------
export function pickScreen(G, game, o) {
  release();
  const rows = battleRows(G);
  const stars = (n) => [1, 2, 3, 4, 5].map((i) => STAR.replace('<svg', `<svg class="${i <= n ? '' : 'off'}"`)).join('');
  const cardHtml = (r) => {
    const lock = r.state === 'lock';
    return `<button type="button" class="pk-c ${r.state}" data-k="${r.k}" ${lock ? 'aria-disabled="true"' : ''} aria-label="${esc(r.b.name)}${lock ? '（まだ）' : ''}">
      ${lock ? `<span class="pk-lk">${LOCK}</span>` : `<img src="${thumbURL(r.b.id)}" alt="" loading="lazy" decoding="async" width="480" height="270">${gradeHtml(r.grade)}`}
      <span class="pk-yr">${esc(yearNum(r.b))}</span>
      <span class="pk-nm">${esc(r.b.name)}</span>
      <span class="pk-st" role="img" aria-label="難しさ ${starsOf(r.k)}">${stars(starsOf(r.k))}</span>
      ${r.best ? `<span class="pk-best" aria-label="最高の手柄 ${r.best}">${ICON.merit}${r.best}</span>` : ''}
    </button>`;
  };
  const s = showScreen(`${CSS}<div class="pk"><h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">本陣</h1><div class="pk-row" id="pk-row">${rows.map(cardHtml).join('')}</div></div>`, false,
    (e) => { if (e.key === 'Escape') { e.preventDefault(); back(); } });
  held = s.querySelector('.pk');
  const back = leave(() => o.onBack());
  topBack(back, 'ホームへ戻る');
  const row = $q('#pk-row');
  for (const b of row.querySelectorAll('.pk-c')) b.onclick = () => {
    const r = rows[+b.dataset.k];
    if (r.state === 'lock') {
      // 解禁の条件：前の戦の札へ送って光らせる（字で言わない）
      sfx('ui');
      const p = row.querySelector(`.pk-c[data-k="${r.k - 1}"]`);
      if (p) { p.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' }); p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 900); }
      return;
    }
    const x = row.scrollLeft;
    leave(() => preCard(G, game, o, r, x))();
  };
  // 次に遊ぶ戦（か、戻ってきた札）を見える所へ
  const at = o.scrollX != null ? null : row.querySelector('.pk-c.next');
  if (o.scrollX != null) row.scrollLeft = o.scrollX;
  else if (at) row.scrollLeft = Math.max(0, at.offsetLeft - 16);
  // 縦の輪で横へ送る（パソコン）
  row.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  if (!('ontouchstart' in window)) (row.querySelector('.pk-c.next') || row.querySelector('.pk-c'))?.focus({ preventScroll: true });
}

// ---------------- 戦の前の一枚 ----------------
export function preCard(G, game, o, r, scrollX) {
  release();
  const lore = MORE[r.b.id] || o.lore(r.b.id) || [];
  const stars = [1, 2, 3, 4, 5].map((i) => STAR.replace('<svg', `<svg class="${i <= starsOf(r.k) ? '' : 'off'}"`)).join('');
  let done = false;
  const go = () => { if (done) return; done = true; release(); sfx('ui'); o.onLaunch(r); };
  const back = () => { if (done) return; done = true; release(); sfx('ui'); pickScreen(G, game, { ...o, scrollX }); };
  const s = showScreen(`${CSS}<div class="pc">
    <div class="pc-art"><img src="${thumbURL(r.b.id)}" alt="" decoding="async"></div>
    <div><h2>${esc(r.b.name)}</h2><div class="yr">${esc(String(r.b.year || '').replace(/（\d+）.*$/, ''))}　${esc(yearNum(r.b))}　${esc(r.b.place || '')}</div>
      <div class="pc-st" role="img" aria-label="難しさ ${starsOf(r.k)}">${stars}${r.best ? `<span class="pk-best" aria-label="最高の手柄 ${r.best}">${ICON.merit}${r.best}</span>` : ''}</div>
      ${lore.slice(0, 2).map((t) => `<p>${esc(t)}。</p>`).join('')}
      <button type="button" class="btn primary go" id="pc-go">出陣する</button></div>
  </div>`, false, (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); back(); } });
  held = s.querySelector('.pc');
  topBack(back, '本陣へ戻る');
  $q('#pc-go').onclick = go;
  if (!('ontouchstart' in window)) $q('#pc-go').focus({ preventScroll: true });
}
export { release as releaseThumbs };
