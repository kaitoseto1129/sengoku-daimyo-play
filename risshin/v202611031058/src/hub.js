// 本陣（家）と、戦を選ぶ（サムネの並び）・戦の前の一枚（docs/app_structure_1031.md の①②）
// 字は名・年・数だけ。解禁・評定・次の戦は絵（暗さ・錠・前の戦の小さな絵・縁・印）で示す。
import { showScreen, topBack, RM } from './screens.js';
import { ODA_LINE, lineOf, LADDER, ladderStep } from './state.js';
import { sfx } from './audio.js';
import { offerNoAds, buyNoAds } from './ads.js';
import { isBattleLocked, isWebOpen, showPaywall } from './paywall.js';
import { TOYOTOMI_LINE } from './toyotomi_line.js';
import { TOKUGAWA_LINE } from './tokugawa_line.js';
import { TOKUGAWA_PLAN } from './tokugawa_plan.js';
import { secretOpen, secretLeft, tokuWon } from './tokugawa_secret.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const thumbURL = (id) => new URL(`../assets/thumbs/${id}.webp`, import.meta.url).href;
// あらすじ（二行・一文を短く）。screens.js の LORE に無い二戦だけここに
const MORE = {
  okawachi: ['伊勢の北畠氏が、大河内城にこもった', '城を囲み、夜の攻め口で木戸へ寄せる'],
  echizen_ikko: ['越前の一向一揆が、大滝寺に集まった', '夜に寺を討ち、逃げる一揆を追う'],
};
const yearNum = (b) => typeof b.year === 'number' ? String(b.year) : (String(b.year || '').match(/（(\d{4})）/) || [])[1] || '';
// 難しさの星（並びの先ほど難しい。1〜5）
const starsOf = (k) => Math.min(5, 1 + Math.floor(k / 7));
const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L10 14.6l-5.1 2.8 1.1-5.7L1.8 7.8l5.7-.7z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
// 攻略済みの印：朱の丸に白い印（字は使わない）
const WON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
  toiya: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 22c0-6 8-10 18-10s18 4 18 10v22c0 6-8 10-18 10s-18-4-18-10z" fill="currentColor" opacity=".85"/><path d="M14 30c4 4 32 4 36 0M14 40c4 4 32 4 36 0" fill="none" stroke="#1d1a16" stroke-width="2.5"/><path d="M26 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
  zukan: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 8h40v48H12z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="26" r="8" fill="currentColor"/><path d="M18 52c0-10 6-15 14-15s14 5 14 15z" fill="currentColor"/></svg>',
  log: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 8h30l8 8v40H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M22 26h22M22 36h22M22 46h14" stroke="currentColor" stroke-width="3"/></svg>',
  merit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18" stroke="currentColor" stroke-width="2"/><path d="M7 4h12l-3 4 3 4H7z" fill="currentColor"/></svg>',
};

const CSS = `<style>
  .hub, .pk, .pc { --gap: 10px; color: var(--washi); }
  /* ホーム（kaito 11/1）：横画面で、左に入口のボタン、右に今の自分の姿と出世の階段 */
  .hub { display: grid; grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr); gap: 14px; max-width: 1200px; margin: 0 auto; align-items: stretch; }
  .hub-col { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1.5fr repeat(4, minmax(48px, 1fr)); gap: var(--gap); }
  .hub-col .hub-go { grid-column: 1 / -1; }
  @media (min-height: 501px) { .hub { height: min(720px, calc(100dvh - 120px)); margin-top: 8px; } .hub-c svg { width: 44px; height: 44px; } .hub-c { font-size: max(16px, calc(17px * var(--text-scale, 1))); } }
  .hub-me { position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 300px; overflow: hidden; background: radial-gradient(ellipse at 50% 40%, rgba(236,228,210,.07), transparent 70%); border: 1px solid rgba(236,228,210,.14); }
  .hub-me canvas { position: absolute; left: 0; top: 0; width: 100%; height: calc(100% - var(--stair-h, 92px)); }
  .hub-rank { position: absolute; z-index: 1; left: 12px; top: 8px; font: 800 max(18px, calc(28px * var(--text-scale, 1))) var(--display); letter-spacing: .14em; text-shadow: 0 1px 4px #000; }
  .hub-stairs { position: relative; z-index: 1; display: flex; align-items: flex-end; gap: 2px; height: var(--stair-h, 92px); padding: 0 6px 4px; }
  .hub-stairs i { position: relative; flex: 1; min-width: 0; height: calc(54px + var(--n) * 4px); background: #2b2620; border-top: 2px solid rgba(236,228,210,.35); display: flex; justify-content: center; padding-top: 3px; font: 700 max(12px, calc(12px * var(--text-scale, 1))) var(--ui); font-style: normal; color: rgba(236,228,210,.55); writing-mode: vertical-rl; letter-spacing: .02em; overflow: hidden; white-space: nowrap; }
  .hub-stairs i.past { background: #4a3d26; border-top-color: #a8843c; color: #e4dccb; }
  .hub-stairs i.now { background: linear-gradient(180deg, #8a6b2c, #4a3d26); border-top-color: #e6c77a; color: #fff; overflow: visible; }
  .hub-stairs i.now::before { content: ''; position: absolute; left: 50%; top: -16px; transform: translateX(-50%); border: 7px solid transparent; border-top: 10px solid #e6c77a; }
  .hub-bar { position: absolute; z-index: 1; right: 12px; top: 12px; display: flex; align-items: center; gap: 8px; width: 46%; max-width: 260px; font: 700 max(13px, calc(14px * var(--text-scale, 1))) var(--ui); text-shadow: 0 1px 3px #000; }
  .hub-bar i { flex: 1; height: 10px; background: rgba(236,228,210,.18); border: 1px solid rgba(236,228,210,.35); overflow: hidden; }
  .hub-bar i b { display: block; height: 100%; background: linear-gradient(90deg, #a8843c, #e6c77a); }
  .hub-bar svg { width: 18px; height: 18px; color: var(--kin); }
  .hub-go { position: relative; display: block; width: 100%; min-height: 110px; padding: 0; border: 2px solid var(--kin); background: #000; cursor: pointer; overflow: hidden; color: #fff; }
  .hub-go img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .hub-go::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.75)); }
  .hub-go .nm { position: absolute; z-index: 1; left: 12px; bottom: 10px; display: flex; align-items: center; gap: 8px; font: 800 max(18px, calc(24px * var(--text-scale, 1))) var(--display); letter-spacing: .16em; text-shadow: 0 1px 4px #000; }
  .hub-go .nm::before { content: ''; border: 9px solid transparent; border-left: 14px solid var(--kin); border-right: 0; }
  .hub-c { position: relative; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 8px; min-height: 48px; padding: 4px 10px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--washi); cursor: pointer; font: 600 max(14px, calc(15px * var(--text-scale, 1))) var(--ui); letter-spacing: .06em; text-align: left; }
  .hub-c svg { flex: none; width: 32px; height: 32px; color: var(--kin); }
  .hub-c.lock { opacity: .45; cursor: default; }
  .hub-c.lock::after { content: ''; position: absolute; right: 8px; top: 8px; width: 16px; height: 16px; background: currentColor; -webkit-mask: var(--lk) center/contain no-repeat; mask: var(--lk) center/contain no-repeat; }
  .hub-set { position: fixed; z-index: 21; top: max(8px, env(safe-area-inset-top, 0px)); right: max(12px, env(safe-area-inset-right, 0px)); width: 44px; height: 44px; padding: 6px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--kin); cursor: pointer; }
  .hub-noads { position: fixed; z-index: 3; right: max(12px, env(safe-area-inset-right, 0px)); bottom: max(8px, env(safe-area-inset-bottom, 0px)); min-height: 44px; padding: 6px 12px; font-size: 14px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--kin); cursor: pointer; }
  .hub-set svg { width: 100%; height: 100%; }
  .hub-c:hover, .hub-c:focus-visible, .hub-go:hover, .hub-go:focus-visible, .hub-set:focus-visible { border-color: #e6c77a; outline: none; }
  .pk { margin: 0 calc(-1 * max(12px, env(safe-area-inset-left, 0px))); }
  /* 戦の並び（kaito 11/2 R）：縦に流れる格子。見出し（織田家編・豊臣編・徳川編）の下に並べ、最後に秘密の一枚 */
  .pk-ch { margin-bottom: 10px; }
  .pk-chn { margin: 6px max(14px, env(safe-area-inset-left, 0px)) 4px; font: 800 max(17px, calc(20px * var(--text-scale, 1))) var(--display); color: var(--kin); letter-spacing: .1em; }
  .pk-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 4px max(14px, env(safe-area-inset-right, 0px)) 10px max(14px, env(safe-area-inset-left, 0px)); }
  .pk-no { position: absolute; left: 8px; top: 30px; z-index: 1; min-width: 22px; padding: 1px 5px; font: 800 max(12px, calc(13px * var(--text-scale, 1))) var(--ui); text-align: center; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.45); }
  .pk-why { position: fixed; z-index: 4; left: 50%; bottom: max(12px, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: 12px; width: min(560px, calc(100vw - 32px)); box-sizing: border-box; padding: 10px 12px; background: rgba(20,18,15,.96); border: 1px solid #e6c77a; color: var(--washi); font: 600 max(15px, calc(15px * var(--text-scale, 1))) var(--ui); line-height: 1.5; }
  .pk-why img { flex: none; width: 96px; height: 54px; object-fit: cover; border: 1px solid rgba(236,228,210,.4); }
  .pk-why svg { flex: none; width: 22px; height: 22px; fill: #e6c77a; }
  .pk-why span { flex: 1; }
  .pk-why button { flex: none; min-height: 44px; }
  .pk-c { position: relative; display: block; width: 100%; aspect-ratio: 16/9; padding: 0; border: 2px solid rgba(236,228,210,.22); background: #1d1a16; overflow: hidden; cursor: pointer; color: #fff; text-align: left; }
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
  .pk-won { position: absolute; left: 7px; top: 7px; padding: 2px 8px; font: 700 max(12px, calc(13px * var(--text-scale, 1))) var(--display); letter-spacing: .1em; color: #fff3e2; background: #a3271b; border: 1px solid #f0c27a; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,.6); transform: rotate(-4deg); }
  .pk-c.won .pk-grade { top: 34px; }
  .pk-grade b { width: 7px; height: 7px; border-radius: 50%; background: #d8cfb9; }
  .pk-grade.top { border-color: #e6c77a; box-shadow: 0 0 0 1px #e6c77a inset; }
  .pk-grade.top b { background: #e6c77a; }
  .pk-won { position: absolute; right: 7px; top: 26px; width: 26px; height: 26px; }
  .pk-won svg { width: 100%; height: 100%; fill: #b8322a; filter: drop-shadow(0 1px 3px #000); }
  .pk-c.next { border-color: #e6c77a; animation: pkGlow 2.6s ease-in-out infinite; }
  @keyframes pkGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(230,199,122,.0); } 50% { box-shadow: 0 0 14px 2px rgba(230,199,122,.55); } }
  body.rm .pk-c.next { animation: none; }
  @media (prefers-reduced-motion: reduce) { .pk-c.next { animation: none; } }
  .pk-c.lock { cursor: default; }
  /* 錠の戦もサムネは見せる。影は薄く、錠の印は小さく右下の端に（kaito 11/2） */
  .pk-c.lock { border-color: rgba(236,228,210,.16); }
  .pk-c.lock img { filter: brightness(.78) saturate(.8); }
  .pk-lk { position: absolute; z-index: 1; right: 6px; bottom: 6px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(20,18,15,.78); color: #e4dccb; }
  .pk-lk > svg { width: 14px; height: 14px; fill: currentColor; }
  /* 徳川編の秘密の戦：虹色の縁（kaito 11/1 夜） */
  .pk-c.secret, .pk-c.secret.lock { border: 3px solid transparent; background: linear-gradient(#1d1a16, #1d1a16) padding-box, linear-gradient(120deg, #e0473c, #e8a93a, #e6d65a, #5fbf6a, #4a8fd8, #8a5ad0, #e0473c) border-box; }
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
    .pk-row { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; padding-bottom: 6px; }
    .pk-why img { width: 80px; height: 45px; }
    .hub { gap: 10px; height: calc(100dvh - 76px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
    .hub-col { gap: 8px; grid-template-rows: 1.4fr repeat(4, minmax(44px, 1fr)); }
    .hub-me { min-height: 0; --stair-h: 78px; }
    .hub-stairs i { height: calc(50px + var(--n) * 2.6px); }
    .hub-rank { font-size: 20px; }
    .hub-go { min-height: 0; }
    .hub-c { min-height: 44px; padding: 2px 8px; gap: 6px; }
    .hub-c svg { width: 26px; height: 26px; }
    .pc { gap: 14px; }
    .pc h2 { font-size: 20px; }
    .pc p { margin: 3px 0; line-height: 1.5; font-size: 15px; }
    .pc .go { margin-top: 8px; min-height: 48px; }
  }
  @media (max-width: 640px) and (orientation: portrait) {
    .hub, .pc { grid-template-columns: 1fr; }
    .hub { height: auto; }
    .hub-me { min-height: 300px; order: -1; }
    .pk-row { grid-template-columns: repeat(2, 1fr); }
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

// 勝った戦か（保存の値を読むだけ）。戦の記録の won（kiroku.js）を先に、無ければ評定（丙は負け）で見る
export function battleWon(G, j) {
  const h = G?.history?.[j], g = (G?.grades || [])[j];
  return h?.won === true || (h?.won !== false && !!g && g !== '丙');
}
// 本編で次に出陣する戦の番号：前の戦に勝って初めて開く（kaito 11/2 W）。負けても G.battle は先へ進むので、ここで勝っていない一番前の戦へ戻す
export function openIndex(G) {
  const n = G.battle | 0;
  for (let j = 0; j < n; j++) if (!battleWon(G, j)) return j;
  return n;
}
const unlockAll = () => typeof window !== 'undefined' && !!window.__autoplayUnlock;
// 豊臣編の勝ち（試しの出陣で遊ぶので、保存と別の鍵に覚える。徳川編の tokuWon と同じ形）
const TOYO_KEY = 'risshin_toyo_won';
export function toyoWon() {
  try { const a = JSON.parse(localStorage.getItem(TOYO_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
export function markToyoWon(id) {
  if (!id || !TOYOTOMI_LINE.some((b) => b.id === id)) return;
  const a = toyoWon();
  if (a.includes(id)) return;
  a.push(id);
  try { localStorage.setItem(TOYO_KEY, JSON.stringify(a)); } catch (e) { /* 書けなくても遊びは止めない */ }
}

// 戦の並び：ODA_LINE の32戦。保存の並び（lineOf）での番号と、解禁（前の戦に勝って初めて開く。kaito 11/2 W）
// state：done＝攻略済み・next＝開いていてまだ勝っていない・lock＝まだ。won は攻略済みの印
export function battleRows(G) {
  const line = lineOf(G);
  return ODA_LINE.map((b, k) => {
    const j = line.findIndex((x) => x.id === b.id);
    // 前の保存（尾張統一戦が並びに無い）の稲生は、いつも遊べる
    const won = j < 0 || battleWon(G, j);
    const open = j <= 0 || battleWon(G, j - 1) || unlockAll() || isWebOpen();   // Web は全部開く（kaito 11/2 Y）
    const state = won ? 'done' : open ? 'next' : 'lock';
    return { b, k, j, state, won: j >= 0 && won, grade: j >= 0 ? (G.grades || [])[j] : null, best: j >= 0 ? (G.best || [])[j] || 0 : 0, pay: isBattleLocked('oda', b.id) };
  });
}
// 豊臣編・徳川編は買えば最初から全部遊べる（順番も織田家編の攻略も縛らない。kaito 11/2 X）。Web は全部無料で開く（Y）。攻略済みの印だけ付ける
const chain = (rows) => { for (const r of rows) { if (r.soon) continue; r.state = r.won ? 'done' : 'next'; } return rows; };
// 第二章「豊臣編」の行（kaito 11/1）：サムネは見せ、アプリで買った人だけ開く（Web は全部開く）。開いた戦は侍大将で出陣と同じ試し
export function toyoRows(from) {
  const won = new Set(toyoWon());
  return chain(TOYOTOMI_LINE.map((b, n) => ({ b, k: from + n, j: -1, state: 'next', won: won.has(b.id), grade: null, best: 0, pay: isBattleLocked('toyotomi', b.id), scn: 'toyotomi' })));
}
// 第三章「徳川編」の行（kaito 11/1）：15戦ぜんぶのサムネを見せる。まだできていない戦は買った後も錠（soon）、できた戦はアプリで買った人だけ開く
export function tokuRows(from) {
  const won = new Set(tokuWon().map((id) => id.slice(0, 3)));
  return chain(TOKUGAWA_PLAN.map((p, n) => {
    const made = TOKUGAWA_LINE.find((e) => e.id.slice(0, 3) === p.id.slice(0, 3));
    const b = made ? { cap: 240, place: '', ...made } : p;
    return { b, k: from + n, j: -1, state: made ? 'next' : 'lock', soon: !made, won: !!made && won.has(p.id.slice(0, 3)), grade: null, best: 0, pay: made ? isBattleLocked('tokugawa', b.id) : false, scn: 'tokugawa' };
  })).concat(TOKUGAWA_LINE.filter((e) => e.secret).map((e, n) => {
    // 秘密の最後の戦：15戦すべてに勝つと開く（tokugawa_secret.js）
    const open = secretOpen();
    return { b: { cap: 240, place: '', ...e }, k: from + TOKUGAWA_PLAN.length + n, j: -1, state: open || isWebOpen() ? 'next' : 'lock', secret: true, won: false, grade: null, best: 0, pay: open || isWebOpen() ? isBattleLocked('tokugawa', e.id) : false, scn: 'tokugawa' };
  }));
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
  // 出世の階段：段の名を下から上へ（今の段に金の印）
  const st = ladderStep(G);
  const stairs = LADDER.map((L, i) => `<i class="${i < st ? 'past' : i === st ? 'now' : ''}" style="--n:${i}">${esc(L.name)}</i>`).join('');
  const s = showScreen(`${CSS}<div class="hub" style="--lk:url('data:image/svg+xml;utf8,${encodeURIComponent(LOCK.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}')">
    <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">ホーム</h1>
    <div class="hub-col">
      <button type="button" class="hub-go" id="hub-go" aria-label="出陣"><img src="${thumbURL(nx.b.id)}" alt="" decoding="async"><span class="nm">出陣</span></button>
      ${card('toiya', 'toiya', '問屋', o.toiyaOn !== false)}${card('shop', 'shop', '武具屋')}${card('town', 'town', '城下町')}${card('train', 'train', '訓練所')}${card('realm', 'realm', '内政', o.realmOn)}${card('map', 'map', '天下の地図', o.mapOn)}${card('extra', 'log', '記録')}${card('zukan', 'zukan', '武将図鑑')}
    </div>
    <div class="hub-me"><canvas id="hub-pv" aria-hidden="true"></canvas><div class="hub-rank">${esc(cur.name)}</div>
      <div class="hub-bar" role="img" aria-label="${nr ? `次の位まであと${need}` : '最上の位'}">${ICON.merit}<i><b style="width:${pct}%"></b></i>${nr && need ? `<span>あと${need}</span>` : ''}</div>
      <div class="hub-stairs" role="img" aria-label="出世の階段。今は${esc(LADDER[st]?.name || '')}">${stairs}</div></div>
    </div>
    <button type="button" class="hub-set" id="hub-set" aria-label="設定">${ICON.set}</button>${offerNoAds() ? '<button type="button" class="hub-noads" id="hub-noads">広告を消す（月300円）</button>' : ''}`);
  held = s.querySelector('.hub');
  const out = (f) => () => { freePv(); leave(f)(); };
  topBack(out(o.onTitle), '題の画面へ');
  $q('#hub-go').onclick = out(() => pickScreen(G, game, o));
  $q('#hub-set').onclick = out(() => o.on.set());
  const noads = $q('#hub-noads');
  if (noads) noads.onclick = async () => { if (noads.disabled) return; noads.disabled = true; const ok = await buyNoAds(); if (ok) noads.remove(); else noads.disabled = false; };
  for (const b of s.querySelectorAll('.hub-c')) b.onclick = b.classList.contains('lock') ? () => sfx('ui') : out(() => o.on[b.dataset.k]());
  const cv = $q('#hub-pv');
  // 今の姿は骨の入った本物の人（実写の顔・胴丸・陣笠）で。素材がまだなら読んでから描き直す（読むまでは簡単な形）
  if (cv && !o.noPreview) import('./preview.js').then(async ({ Preview }) => {
    if (!cv.isConnected) return; freePv(); pv = new Preview(cv); if (!pv.renderer) { pv = null; return; }
    const p = pv; p.setLook(G); if (p.faceFront()) return;
    await p.loadGeneral(); if (p !== pv || !cv.isConnected) return; p.setLook(G); p.faceFront();
  }).catch(() => {});
  if (!('ontouchstart' in window)) $q('#hub-go').focus({ preventScroll: true });
}
const $q = (sel) => document.querySelector('#screen ' + sel);

// ---------------- 戦を選ぶ ----------------
export function pickScreen(G, game, o) {
  release();
  const rows = battleRows(G);
  const oda = rows.length;
  const toyo = toyoRows(oda);
  rows.push(...toyo);
  const toku = rows.length;
  rows.push(...tokuRows(toku));
  const stars = (n) => [1, 2, 3, 4, 5].map((i) => STAR.replace('<svg', `<svg class="${i <= n ? '' : 'off'}"`)).join('');
  const cardHtml = (r) => {
    const lock = r.state === 'lock';
    return `<button type="button" class="pk-c ${r.state}${r.secret ? ' secret' : ''}" data-k="${r.k}" ${lock ? 'aria-disabled="true"' : ''} aria-label="${esc(r.b.name)}${lock ? '（まだ）' : ''}">
      <img src="${thumbURL(r.b.id)}" alt="" loading="lazy" decoding="async" width="480" height="270" onerror="this.style.visibility='hidden'">${lock || r.pay ? `<span class="pk-lk">${LOCK}</span>` : gradeHtml(r.grade)}${r.won ? `<span class="pk-won" role="img" aria-label="攻略済み">${WON}</span>` : ''}
      <span class="pk-no" aria-hidden="true">${r.n + 1}</span>
      <span class="pk-yr">${esc(yearNum(r.b))}</span>
      <span class="pk-nm">${esc(r.b.name)}</span>
      <span class="pk-st" role="img" aria-label="難しさ ${starsOf(r.k)}">${stars(starsOf(r.k))}</span>
      ${r.best ? `<span class="pk-best" aria-label="最高の手柄 ${r.best}">${ICON.merit}${r.best}</span>` : ''}
    </button>`;
  };
  const nSecret = rows.filter((r) => r.secret).length;
  const end = rows.length - nSecret;
  const chs = [{ name: '織田家編', from: 0, to: oda }, { name: '豊臣編', from: oda, to: toku }, { name: '徳川編', from: toku, to: end }, { name: '', from: end, to: rows.length }].filter((c) => c.to > c.from);
  const chapters = chs.map((c) => `<div class="pk-ch">${c.name ? `<h2 class="pk-chn">${esc(c.name)}</h2>` : ''}<div class="pk-row" role="group" aria-label="${esc(c.name || '秘密の戦')}">${rows.slice(c.from, c.to).map((r, i) => cardHtml({ ...r, n: i })).join('')}</div></div>`).join('');
  const s = showScreen(`${CSS}<div class="pk" id="pk-row"><h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">本陣</h1>${chapters}</div>`, false,
    (e) => { if (e.key === 'Escape') { e.preventDefault(); back(); } });
  held = s.querySelector('.pk');
  const back = leave(() => o.onBack());
  topBack(back, 'ホームへ戻る');
  const row = $q('#pk-row');
  // 錠の戦を押したら、何をすれば解けるかを一枚の札で（kaito 11/1）
  let whyT = 0;
  const why = (r) => {
    row.querySelector('.pk-why')?.remove(); clearTimeout(whyT);
    let prev = null;
    if (!r.soon && !r.secret) for (let k = r.k - 1; k >= 0; k--) if (!rows[k].soon) { prev = rows[k]; break; }
    // 章の頭は、前の章の戦を全部攻略して開く
    const head = r.scn && prev && prev.scn !== r.scn;
    if (head) prev = null;
    // 完全版が要る錠の戦：完全版を買い、かつ前の戦に勝って開く。札から買える（kaito 11/3 AC）
    const buyable = r.pay && !r.soon && !(r.secret && r.state === 'lock');
    const text = r.secret && r.state === 'lock' ? `徳川編の十五の戦に、すべて勝つと開きます（あと${secretLeft()}）` : r.soon ? 'まだできていません' : buyable ? (r.state === 'lock' && prev ? `完全版を買い、「${prev.b.name}」に勝つと開きます` : '完全版で開きます') : head ? '前の章の戦に、すべて勝つと開きます' : prev ? `「${prev.b.name}」に勝つと開きます` : '前の戦に勝つと開きます';
    row.insertAdjacentHTML('beforeend', `<div class="pk-why" role="status">${prev && !buyable ? `<img src="${thumbURL(prev.b.id)}" alt="">` : LOCK}<span>${esc(text)}</span>${buyable ? '<button type="button" class="btn small primary" id="pk-why-buy">完全版を買う</button>' : ''}${prev && !buyable && prev.state !== 'lock' ? '<button type="button" class="btn small" id="pk-why-go">その戦へ</button>' : ''}</div>`);
    const gb = row.querySelector('#pk-why-buy');
    if (gb) gb.onclick = () => { sfx('ui'); clearTimeout(whyT); row.querySelector('.pk-why')?.remove(); showPaywall(() => { release(); pickScreen(G, game, o); }, () => {}, r.scn || 'oda'); };
    const go = row.querySelector('#pk-why-go');
    if (go) go.onclick = () => { sfx('ui'); row.querySelector('.pk-why')?.remove(); const p = row.querySelector(`.pk-c[data-k="${prev.k}"]`); if (p) { p.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'center' }); p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 900); p.focus({ preventScroll: true }); } };
    whyT = setTimeout(() => row.querySelector('.pk-why')?.remove(), 6000);
  };
  for (const b of row.querySelectorAll('.pk-c')) b.onclick = () => {
    const r = rows[+b.dataset.k];
    // 完全版・追加の章の錠：その場で買う札へ進む（買えたら並びを描き直す。kaito 11/2 P「完全版で開きます」で止めない）
    if (r.pay && !r.soon && !(r.secret && r.state === 'lock')) { sfx('ui'); clearTimeout(whyT); row.querySelector('.pk-why')?.remove(); showPaywall(() => { release(); pickScreen(G, game, o); }, () => b.focus({ preventScroll: true }), r.scn || 'oda'); return; }
    if (r.state === 'lock') { sfx('ui'); why(r); return; }
    if (r.scn && r.pay) { sfx('ui'); clearTimeout(whyT); row.querySelector('.pk-why')?.remove(); showPaywall(() => { release(); pickScreen(G, game, o); }, () => b.focus({ preventScroll: true }), r.scn); return; }
    const x = [];
    clearTimeout(whyT);
    leave(() => preCard(G, game, o, r, { x, y: row.parentElement?.scrollTop || 0 }))();
  };
  // 次に遊ぶ戦（か、戻ってきた札）を見える所へ
  if (o.scrollX != null) { if (row.parentElement) row.parentElement.scrollTop = o.scrollX.y || 0; }
  else row.querySelector('.pk-c.next')?.scrollIntoView({ block: 'center' });
  if (!('ontouchstart' in window)) (row.querySelector('.pk-c.next') || row.querySelector('.pk-c'))?.focus({ preventScroll: true });
}

// ---------------- 戦の前の一枚 ----------------
import { playTalk } from './talk_scene.js';
export function preCard(G, game, o, r, scrollX) {
  release();
  const lore = MORE[r.b.id] || o.lore(r.b.id) || [];
  const stars = [1, 2, 3, 4, 5].map((i) => STAR.replace('<svg', `<svg class="${i <= starsOf(r.k) ? '' : 'off'}"`)).join('');
  let done = false;
  const go = () => { if (done) return; done = true; release(); sfx('ui'); playTalk(r.b.id, 'b', () => o.onLaunch(r)); };
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
