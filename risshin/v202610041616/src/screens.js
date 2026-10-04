import { validProgress, validExtra, readProgress } from './save_guard.js';
import { isTouch } from './touch.js';
import { TOMO, RANK_CEIL, GRADE_CUT, RANKS, BATTLES, SCENARIOS, SCENARIO_ORDER, SCENARIO_PICK, zeni, scenarioKey, scenarioReady, ITEMS, TITLES, LADDER, HORSES, myHorse, ladderStep, rankLabel, save, equipDef, migrate, relOf } from './state.js';
import { drawMon } from './textures.js';
import { sfx, initAudio } from './audio.js';
import { S, reduceMotion, motionPreference, saveSettings, resetHints, resetSettings, BIND_DEFAULTS, bindReserved, validBind, BIND_LABELS, keyLabel, DIFFICULTY, K, hintSeen } from './settings.js';
import { Preview } from './preview.js';
import { illustHtml, illustKey, mountIllust } from './illust.js';
import { odaTown, odaPromoKakun, setOdaDiagram, ODA_REL_NAME } from './oda_town.js';
import { kakoiGaugeText, kakoiStageWord } from './kakoi.js';
import { kumiHtml, kumiBind } from './kumi.js';
import { toiyaHtml, toiyaBind, TOIYA_ICON, toiyaCheap, spendLog, tnote } from './toiya.js';
import { realmHtml, realmBind, REALM_ICON, realmBossHtml, realmLeft, realmTodo } from './realm.js';
import { monjoHtml, mountMonjo } from './domain.js';
import { rankupHtml, rankupDetailsHtml, drawRankup } from './rankup.js';
import { trackFeedback } from './count.js';
import { readZukanRaw, readDojoBest, readDojoDetail, exportExtra, mergeExtra } from './zukan_store.js';
import { battleTimeline, TIMELINE_STYLE } from './kiroku.js';
import { pickTip } from './tips.js';
import { openGlossary, watchGlossaryScreens } from './glossary.js';
import { watchFirstHelp, stopFirstHelp, resetFirstHelp } from './first_help.js';
import { ronkoHtml } from './ronko.js';
import { battleTalk, battleTalkHtml, bindBattleTalk } from './battle_talk.js';

watchGlossaryScreens();

// ボタンに触れたときの小さな音
let hoverT = 0;
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest && e.target.closest('.btn, .tabs button, .choices button');
  if (!b || b.disabled) return;
  const now = performance.now();
  if (now - hoverT > 60) { hoverT = now; sfx('hover'); }
});

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 画面ごとのキー操作（画面が変わると差し替わる）
let screenKeys = null;
let titleResize = null;
function stopTitleResize() { if (titleResize) window.removeEventListener('resize', titleResize); titleResize = null; }
window.addEventListener('keydown', (e) => {
  if (!screenKeys || $('screen').hidden || e.isComposing || e.repeat) return;
  if (e.target.closest?.('[contenteditable]')) return;
  // 焦点のあるボタン・開閉の見出しでの Enter／Space は、そのボタンの働きに任せる（別の操作が走らないように）
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button, summary, a, [role=button], [role=tab]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
    if (e.key !== 'Escape' && (e.target instanceof HTMLTextAreaElement || e.key !== 'Enter')) return;
  }
  if (e.target.closest?.('.confirm-row')) return;
  screenKeys(e);
});

// 版の番号（題・後日譚のクレジットで同じ物を出す。927）
export const VERSION = '第0.6版';
// 動きを減らす：ゲームの設定か OS の設定
export const RM = reduceMotion;
// 取り消せない操作の確認札（何が消えるかを書き、安全な「やめる」を先に置いて焦点を当てる）
let cfN = 0;
export function confirmBox(box, msg, yesLabel, onYes, { noLabel = 'やめる', sub = '元に戻せません。' } = {}) {
  // 札の名は文から取る（二度読まれないよう aria-live は付けない）。やめたら札を開いた釦へ焦点を戻す
  const opener = document.activeElement;
  const surface = box.closest('#screen, #pause') || box.parentElement;
  surface?.querySelectorAll('.confirm-row [data-cf=no]').forEach((button) => button.click());
  const id = `cf-msg-${++cfN}`;
  box.innerHTML = `<div class="confirm-row" role="alertdialog" aria-labelledby="${id}"${sub ? ` aria-describedby="${id}-s"` : ''}><div class="cf-msg"><b id="${id}">${esc(msg)}</b>${sub ? `<small id="${id}-s">${esc(sub)}</small>` : ''}</div><div class="row"><button class="btn small" data-cf="no">${esc(noLabel)}</button><button class="btn small danger" data-cf="yes">${esc(yesLabel)}</button></div></div>`;
  const no = box.querySelector('[data-cf=no]');
  no.onclick = () => { box.innerHTML = ''; if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true }); };
  const yes = box.querySelector('[data-cf=yes]');
  yes.onclick = () => { yes.disabled = true; onYes(); };
  box.querySelector('.confirm-row').onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); no.click(); }
    else if (e.key === 'Tab') {
      e.stopPropagation();
      if (e.shiftKey && e.target === no) { e.preventDefault(); yes.focus({ preventScroll: true }); }
      else if (!e.shiftKey && e.target === yes) { e.preventDefault(); no.focus({ preventScroll: true }); }
    } else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  no.focus({ preventScroll: true });
  scrollIn(box, 'nearest');
}

// 521〜540 で足した見た目（index.html は別の人が触るので、ここに置く）
const UX_CSS = `<style>
  /* 本文は十五画素、補足は十三画素を下限にする。字だけを拡大し、札の中で折り返す。 */
  #screen .lead { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .story p { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .keys:not(.tk) { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .keys.tk { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .note { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .settings .s-row label { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .settings .s-row output { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .confirm-row .cf-msg { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .legend { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .savebox { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .timeline .tl-row .r { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .titles div, #screen .titles div > small:not(.only) { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .titles div b { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev-more { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev-prog .lbl { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-fail p { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-fail .adv { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-sq { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-rel { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-gnote { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ev-conds span { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ek-realm { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev-pay ul { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ld-cond { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ld-cols p { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .promo-cine .pc-say .who { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .fac { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .prep div { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .roster .rr > span, #screen .base .roster .rr > div { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .tw-first { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .tw-ledger { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .tw-next .m span { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .tw-stage { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .base .rlegend { font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .rel4 small { font-size: max(13px, calc(13px * var(--text-scale, 1))) !important; line-height: 1.6; }
  /* 携帯横でも読む文と数を潰さず、札の中で折り返す。 */
  #screen .records b { font-variant-numeric: tabular-nums; }
  #screen .records > * { min-width: 0; overflow-wrap: anywhere; }
  #screen .timeline .tl-row { grid-template-columns: minmax(0, 160px) minmax(0, 1fr) minmax(80px, max-content); }
  #screen .timeline .tl-row > * { min-width: 0; overflow-wrap: anywhere; }
  #screen .aiji { grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 444px; }
  #screen .aiji button { overflow-wrap: anywhere; line-height: 1.5; }
  #screen .field label { font-size: max(13px, calc(13px * var(--text-scale))); line-height: 1.6; }
  #screen .q :is(p, legend) { font-size: max(15px, calc(15px * var(--text-scale))); line-height: 1.7; }
  #screen .histnote { font-size: max(15px, calc(15px * var(--text-scale))); }
  #screen .talk > div:not(.choices) { font-size: max(15px, calc(15px * var(--text-scale))); line-height: 1.8; }
  #screen .promo .unl { font-size: max(15px, calc(15px * var(--text-scale))); line-height: 1.7; }
  #screen .item .n small { display: inline-block; margin-left: 0; margin-right: 8px; }
  #screen .facts dd { overflow-wrap: anywhere; min-width: 0; }
  #screen .records small { display: block; line-height: 1.5; }
  #screen .keys > div { min-width: 0; overflow-wrap: anywhere; }
  #screen .keybind button b { white-space: normal; overflow-wrap: anywhere; }
  #screen pre.copy { tab-size: 2; overflow-wrap: anywhere; line-height: 1.6; }
  #screen #io-text { line-height: 1.6; }
  #screen .ev-prog .lbl { flex-wrap: wrap; gap: 8px; }
  #screen .grade:not(.g-甲上) { color: var(--shu-text); }

  /* 横向きの札は読みやすさを保ち、操作の結果を重ねない。 */
  #screen .fb-box textarea { box-sizing: border-box; padding: 8px; background: var(--sumi-2); color: var(--washi); border: 1px solid var(--washi-dim); font-size: max(16px, calc(16px * var(--text-scale))); }
  #screen .fb-box [aria-pressed=true] { border-color: var(--kin); background: rgba(194,162,90,.16); }
  #screen .fb-box [aria-pressed=true]::before { content: '● '; color: var(--kin); }
  #screen .confirm-row { scroll-margin-block: 72px 16px; max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y:auto; overscroll-behavior:contain; }
  #screen .confirm-row > .row { position:sticky; bottom:0; background:var(--sumi-2); padding:8px 0; }
  #screen .confirm-row .row { gap: 8px; }
  #screen .keys { line-height: 1.6; }
  #screen .keys.tk { grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); }
  #screen .gloss { grid-template-columns: minmax(0, 9em) minmax(0, 1fr); font-size: max(15px, calc(15px * var(--text-scale))); }
  #screen .facts { grid-template-columns: minmax(0, 10em) minmax(0, 1fr); gap: 8px 16px; }
  #screen .people .p p { font-size: max(15px, calc(15px * var(--text-scale))); }
  #screen .choices button { font-size: max(15px, calc(15px * var(--text-scale))); line-height: 1.6; }
  #screen .item .x { font-size: max(13px, calc(13px * var(--text-scale))); line-height: 1.6; }
  #screen .keybind button { flex-wrap: wrap; }
  #screen .field input { font-size: max(16px, calc(26px * var(--text-scale))); }
  #screen .settings select { font-size: max(16px, calc(16px * var(--text-scale))); }
  #screen .settings .s-row:has(input[type=checkbox]) label { min-height: 44px; display: flex; flex-direction: column; justify-content: center; cursor: pointer; }
  #screen .settings input[type=range] { box-sizing: border-box; }
  #screen #io-text { width: 100%; padding: 8px; min-height: 88px; font-size: 16px; overflow-wrap: anywhere; background: var(--sumi-2); color: var(--washi); border: 1px solid var(--washi-dim); }
  #screen .btn:disabled { opacity: 1; color: var(--washi-dim); border-style: dashed; background: var(--sumi-2); }


  /* 評定は記録を正しく読み、拡大した字も札の中で送れるようにする。 */
  #screen .ev2 .ek .note { color: #5a4a36; font-size: max(13px, calc(13px * var(--text-scale, 1))); }
  #screen .ev2 .ev-big .sb { color: var(--shu-text); }
  #screen .ev2 .evc p { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; display: block; overflow-wrap: anywhere; }
  #screen .ev2 .evc p:is(.g, .l) { display: grid; grid-template-columns: 3.4em minmax(0, 1fr); }
  #screen .ev2 .evc-h { flex-wrap: wrap; }
  #screen .ev2 .ek-h > div { min-width: 0; overflow-wrap: anywhere; }
  #screen .ev2 .ek-foot .ek-t { white-space: normal; }
  #screen .ev2 .ev-body { mask-image: none; -webkit-mask-image: none; }
  #screen .ev2 summary { min-height: 44px; box-sizing: border-box; padding-block: 8px; line-height: 1.6; }
  #screen .ev2 .ledger .ln { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(3em, max-content); }
  #screen .ev2 .ledger .ln > * { min-width: 0; overflow-wrap: anywhere; }
  #screen .ev2 .ek-c ul { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }
  #screen .ev2 .ek-foot q { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.6; }

  .slotcard .sl-g { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .slotcard .sl-g i { font-style: normal; font-size: max(13px, calc(13px * var(--text-scale, 1))); line-height: 1.4; padding: 0 4px; border: 1px solid var(--line); color: var(--washi-dim); }
  .slotcard .sl-g i.g-甲上 { border-color: var(--kin); color: var(--kin); }
  .scn .sc-path { display: block; margin-top: 4px; color: var(--washi-dim); font-size: max(12px, calc(12.5px * var(--text-scale, 1))); line-height: 1.6; }
  .scn .sc-path b { color: var(--kin); font-weight: 500; }
  .story .st-who { font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: .12em; margin: -10px 0 26px; }
  .story .st-who b { color: var(--kin); font-weight: 500; }
  .story .st-tip { max-width: 32em; margin: 4px auto 28px; text-align: left; border: 1px solid rgba(194,162,90,.5); border-left: 3px solid var(--kin); background: rgba(194,162,90,.07); padding: 12px 16px; opacity: 0; animation: ln .8s ease-out forwards; }
  .story .st-tip small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .3em; color: var(--kin); margin-bottom: 4px; }
  .story .st-tip span { font-size: max(12px, calc(15px * var(--text-scale, 1))); line-height: 1.8; color: var(--washi); }
  .story.fast p, .story.fast .st-tip { animation-delay: 0s !important; animation-duration: .01s !important; }
  .story .st-skip { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-faint); margin-top: 6px; }
</style>`;
// 画面（#screen）の中だけを送る。scrollIntoView や焦点の移動は、枠の外（claude.ai の Artifact のページ）まで送ってしまい、
// 戦の画面の上や下が窓の外に出て「札が見えない」元になる
function scrollIn(el, where = 'nearest') {
  const screen = document.getElementById('screen');
  const s = el?.closest('#st-panel') || el?.closest('#pause') || screen;
  if (!el || !s || !s.contains(el)) return;
  const r = el.getBoundingClientRect(), sr = s.getBoundingClientRect();
  // 左上の戻る（画面の上に浮いている）の下に隠れないよう、その高さぶん下で止める
  const top0 = (s.querySelector(':scope > .topback')?.getBoundingClientRect().bottom || sr.top) - sr.top + 8;
  if (where === 'start') s.scrollTop += r.top - sr.top - top0;
  else if (where === 'center') s.scrollTop += (r.top + r.height / 2) - (sr.top + sr.height / 2);
  else if (r.top < sr.top + top0) s.scrollTop += r.top - sr.top - top0;
  else if (r.bottom > sr.bottom) s.scrollTop += r.bottom - sr.bottom + 8;
}
function show(html, clear = false, keys = null) {
  const s = $('screen');
  stopTitleResize();
  stopBind();
  if (titleKotoOnce) { document.removeEventListener('pointerdown', titleKotoOnce); titleKotoOnce = null; }
  // 画面が変わるとき、墨の帯が掃く（「動きを減らす」では出さない）
  if (!RM() && !clear) { const w = $('wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }
  s.hidden = false;
  s.className = clear ? 'clear' : '';
  // 城下の案内の札は body に付くので、城下でない画面（設定など）へ移る時は外す（重ならないように）
  if (!html.includes('data-tab="boss"')) { document.querySelectorAll('.tour').forEach((e) => e.remove()); s.style.paddingBottom = ''; }
  s.innerHTML = UX_CSS + html;
  s.scrollTop = 0;
  // 画面が変わったら、ブラウザの題にも画面の名を入れる（933）
  const hd = s.querySelector('[aria-level="1"]') || s.querySelector('h1') || s.querySelector('h2');
  document.title = hd && hd.textContent.trim() ? `${hd.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}｜戦国立身` : '戦国立身';
  screenKeys = keys;
  return s;
}
// 左上の「戻る」：どの画面も同じ形・同じ置き場所（指の端末には Esc が無いので、戻れない画面を作らない）
export function topBack(fn, label = '戻る', parent = null, pad = true) {
  const s = parent || $('screen');
  if (!s || !fn) return;
  s.querySelector(':scope > .topback')?.remove();
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'topback'; b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(label)}`;
  b.onclick = () => { sfx('ui'); fn(); };
  s.prepend(b);
  if (pad) s.classList.add('has-back');
  return b;
}
export function hideScreen() { stopTitleResize(); stopBind(); if (titleKotoOnce) { document.removeEventListener('pointerdown', titleKotoOnce); titleKotoOnce = null; } stopFirstHelp(); $('screen').hidden = true; $('screen').innerHTML = ''; screenKeys = null; }

// 知らせは同時に三つまで・同じ文は 8 秒に一度まで（docs/ui-guidelines.md）
const noticeSeen = new Map();
// 図鑑・実績を開く（読み込みに失敗した時は、そう知らせる。kind: 'busho' | 'ach' | 'card'）
export function openZukan(kind, name) {
  import('./zukan.js').then((m) => (kind === 'card' ? m.zukanOpenCard(name) : m.zukanOpen(kind))).catch(() => notice('図鑑を開けませんでした。もう一度お試しください'));
}
export function notice(text) {
  const owner = !$('pause')?.hidden ? $('pause') : !$('screen')?.hidden ? $('screen') : null;
  if (owner) {
    let history = owner.querySelector('[data-action-results]');
    if (!history) {
      history = document.createElement('details'); history.dataset.actionResults = '';
      history.innerHTML = '<summary style="min-height:44px;padding:8px;box-sizing:border-box;cursor:pointer">直近の操作の結果を見る</summary><ol></ol>';
      (owner.querySelector('#st-panel') || owner.querySelector('.wrap') || owner).appendChild(history);
    }
    const list = history.querySelector('ol'), row = document.createElement('li');
    row.textContent = String(text); list.appendChild(row);
    while (list.children.length > 3) list.firstElementChild.remove();
    history.open = true;
  }
  const nowT = performance.now();
  if (nowT - (noticeSeen.get(text) ?? -1e9) < 8000) return;
  noticeSeen.set(text, nowT);
  if (noticeSeen.size > 40) { for (const [k, v] of noticeSeen) if (nowT - v > 8000) noticeSeen.delete(k); }
  const live = document.querySelectorAll('.toastbox');
  for (let i = 0; i <= live.length - 3; i++) live[i].remove();
  const el = document.createElement('div');
  el.className = 'toastbox';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = text;
  let rail = $('screen-notices');
  if (!rail) { rail = document.createElement('div'); rail.id = 'screen-notices'; document.body.appendChild(rail); }
  rail.appendChild(el);
  setTimeout(() => el.remove(), Math.min(12000, Math.max(4000, 1200 + String(text).length * 110)));
}

// 感想の欄（戦功評価・一時停止で共通）。畳んだ形から開く。取り消せる操作なので確認は要らない
function fbHtml(id) {
  return `<details class="fb-box" id="${id}"><summary>ひとことを送る（任意）</summary>
    <div class="row" style="margin-top:8px">
      <button class="btn small" data-fb="good" aria-pressed="false">おもしろかった</button>
      <button class="btn small" data-fb="hard" aria-pressed="false">むずかしかった</button>
      <button class="btn small" data-fb="unrewarded" aria-pressed="false">報われなかった</button>
      <button class="btn small" data-fb="unclear" aria-pressed="false">わかりにくかった</button>
    </div>
    <label for="${id}-t" class="note" style="display:block;margin:8px 0 4px">ひとこと（任意・80字まで）</label>
    <textarea id="${id}-t" maxlength="80" rows="2" style="width:100%;resize:vertical;font:inherit"></textarea>
    <small class="note" id="${id}-left" aria-live="off" hidden></small>
    <div class="row" style="margin-top:8px"><button class="btn small primary" id="${id}-send">送る</button><span class="note" id="${id}-done" role="status" hidden>送りました。「感想の欄を閉じる」で閉じられます</span><button type="button" class="btn small" id="${id}-close" hidden>感想の欄を閉じる</button></div>
  </details>`;
}
function fbBind(root, id, where) {
  const box = root.querySelector(`#${id}`);
  if (!box) return;
  const field = box.querySelector(`#${id}-t`), left = box.querySelector(`#${id}-left`);
  field.addEventListener('input', () => { left.hidden = false; left.textContent = `あと${Math.max(0, 80 - field.value.length)}字`; });
  let picked = '';
  box.querySelectorAll('[data-fb]').forEach((b) => b.onclick = (ev) => {
    ev.stopPropagation(); sfx('ui');
    picked = b.dataset.fb;
    box.querySelectorAll('[data-fb]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  const send = box.querySelector(`#${id}-send`);
  if (send) send.onclick = (ev) => {
    ev.stopPropagation(); sfx('ui');
    const t = box.querySelector(`#${id}-t`);
    if (!picked && !(t?.value.trim())) { notice('感想を選ぶか、ひとことを書いてください'); return; }
    trackFeedback(where, picked, t ? t.value.trim() : '');
    send.disabled = true; send.textContent = '送りました';
    if (t) t.value = '';
    left.hidden = true;
    const done = box.querySelector(`#${id}-done`);
    if (done) done.hidden = false;
    const close = box.querySelector(`#${id}-close`);
    if (close) { close.hidden = false; close.onclick = (e) => { e.stopPropagation(); box.open = false; box.querySelector('summary').focus({ preventScroll:true }); }; }
  };
}

// いまのキー割り当てで操作表を作る
const KEYS = () => [
  [`${K('forward')} ${K('left')} ${K('back')} ${K('right')}`, '移動（前へ二度押しで走る）'], ['マウス', '視点（画面をクリックで開始）'], ['ホイール', '視点の距離／狙い定め中は相手を替える'], ['左クリック', '突き（続けて押すと連続突き、押し続けて離すと溜め突き）'],
  ['右クリック', '構え・防御（直前なら受け流し）'], ['構え＋左クリック', '薙ぎ払い'], [K('run'), '走る'], [K('dodge'), '回避'], [K('lock'), '敵を狙い定める'],
  [K('use'), '話す・取る'], [K('command'), '部隊指揮（長押しで号令の輪）'], [`${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}`, 'ついて来い・待て・突撃・退け'], [K('rally'), '鼓舞・鬨の声'],
  [K('map'), '戦術マップ（クリックで組を向かわせる）'], [K('mapzoom'), 'ミニマップの縮尺'], [K('log'), '会話の記録'], [K('shoulder'), '肩越しの左右切替'], [K('view'), '視点の切替（近い・普通・遠い・一人称）'], [K('skip'), '行軍・待ちを飛ばす'],
  [K('photo'), '写真モード'], [K('hud'), '画面の札を消す・出す'], ['1・2', '槍・打刀'], ['左角かっこ・右角かっこ', '視点の感度'], ['エフ1', '操作の早見表'], ['エイチ', '操作説明'], ['戻るキー', '一時停止・設定'],
];
const PB = (k) => `<span class="pb pb-${k.toLowerCase()}">${{ A: 'エー', B: 'ビー', X: 'エックス', Y: 'ワイ' }[k]}</span>`;
const PAD = [['左スティック', '移動'], ['右スティック', '視点'], ['右の引き金・右肩', '攻撃'], ['左の引き金', '構え'], [PB('A'), '回避・決定'], [PB('X'), '話す・取る'], [PB('Y'), '部隊指揮（長押しで号令の輪）'], [PB('B'), '戻る'], ['左肩', '鼓舞'], ['十字キー', '号令（上：ついて来い 左：待て 右：突撃 下：退け）／画面の選択'], ['右スティック押し込み', '狙い定め'], ['左スティック押し込み', '走る'], ['表示の釦（左の小さな釦）', '戦術マップ'], ['メニューの釦（右の小さな釦）', '一時停止']];
// 指の端末の操作（押す所の名は画面の丸の字と同じに）
const TOUCH_KEYS = () => [['左の親指', '触れた所に出る輪で歩く。外まで押し込むと走る'], ['右側をなぞる', '見回す'], ['「突く」', '突く。長押しして離すと溜め突き'], ['「構え」', S.guardToggle ? '一度押すと構え、もう一度押すと解く。「！」の直前で受け流し' : '押している間、構える。「！」の直前で受け流し'], ['「回避」', '跳んでかわす'], ['「号令」', '押して輪を出し、指を滑らせて選ぶ'], ['「持替」', '武器を持ち替える'], ['「ほか」', '鼓舞・武器・馬の追加操作を開く'], ['左上の釦', '止める・地図・視点（一人称）']];
export function touchKeysHtml() {
  const list = TOUCH_KEYS().map(([key, text]) => {
    if (key === '左の親指' && S.runToggle) text = '輪で歩く。一度外まで倒すと、輪へ戻しても指を放すまで走る';
    if (key === '左の親指' && S.touchSwap) key = '右の親指';
    if (key === '右側をなぞる' && S.touchSwap) key = '左側をなぞる';
    if (key === '左上の釦') text = '止める・地図・視点（近い・普通・遠い・一人称）';
    return [key, text];
  });
  return `<div class="keys tk">${list.map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div>`; }
export function keysHtml(pad = false) {
  const list = pad ? PAD : KEYS();
  return `<div class="keys">${list.map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div>`;
}

// ---------------- タイトル ----------------
// 新しく始める時に前に選んだ名・筋書き・難易度（このブラウザに覚える。読めなくても動く）
const shortName = (name) => Array.from(name.trim()).slice(0, 8).join('');
const PICK_KEY = 'sengoku-risshin-newpick-v1';
let titleBack = null;
function newPick(v) {
  if (v) { try { localStorage.setItem(PICK_KEY, JSON.stringify(v)); } catch (e) { /* 覚えられなくても始められる */ } return v; }
  try { const raw = JSON.parse(localStorage.getItem(PICK_KEY)); return raw && typeof raw === 'object' && !Array.isArray(raw) ? { name: typeof raw.name === 'string' ? shortName(raw.name) : '', scn: raw.scn, diff: raw.diff } : {}; } catch (e) { return {}; }
}
// ---------------- 題字（墨）とオープニング ----------------
// 墨の題字：刷毛の一払いの上に「戦国立身」、朱の落款。題の画面とオープニングで使う
const INK_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="inkBleed" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.8"/></filter></svg>';
const INK_STROKE = '<svg class="ink-brush" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M8 70 C 90 40, 200 30, 320 44 C 420 55, 520 48, 592 30 L 596 52 C 520 80, 420 92, 300 84 C 190 78, 90 92, 12 98 Z" fill="rgba(10,8,6,.82)"/><path d="M40 92 C 160 86, 300 96, 470 82" stroke="rgba(10,8,6,.5)" stroke-width="3" fill="none"/></svg>';
const INK_CSS = `<style>
  .ink-title { position: relative; display: inline-block; margin: 8px 0 4px; padding: 6px 28px 10px 18px; }
  .ink-title .ink-brush { position: absolute; left: -4%; top: 18%; width: 108%; height: 78%; z-index: 0; }
  .ink-title h1.title { position: relative; z-index: 1; margin: 0; filter: url(#inkBleed); color: #f1e9d6; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
  .ink-title h1.title span { color: #f1e9d6; }
  .ink-title .seal { position: absolute; z-index: 2; right: -6px; bottom: 2px; width: 34px; height: 34px; display: grid; place-items: center; background: #b23a26; color: #fff4e6; font: 800 max(12px, calc(13px * var(--text-scale, 1)))/1.05 var(--display); font-style: normal; text-align: center; letter-spacing: 0; transform: rotate(4deg); box-shadow: inset 0 0 0 2px #b23a26, inset 0 0 0 3px rgba(255,244,230,.75); }
  @media (max-height: 500px) { .ink-title { padding: 2px 22px 6px 12px; } .ink-title h1.title { font-size: max(12px, calc(44px * var(--text-scale, 1))); } .ink-title .seal { width: 28px; height: 28px; font-size: max(12px, calc(12px * var(--text-scale, 1))); } }
  /* オープニング：黒い間に、墨の題字 → 一言の語り → 年と場所と自分 */
  .op { position: fixed; inset: 0; z-index: 50; background: radial-gradient(ellipse at 50% 45%, #1d1812, #070605 75%); color: #ece4d2; display: grid; place-items: center; overflow: hidden; cursor: pointer; }
  .op .beat { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 14px; padding: 60px 24px; text-align: center; opacity: 0; transition: opacity .9s ease; pointer-events: none; }
  .op .beat.on { opacity: 1; }
  .op .b1 .ink-title { transform: scale(1.1); }
  .op .b1 .ink-brush path:first-child { stroke-dasharray: 2000; animation: opBrush 1.1s ease-out both; }
  .op .b2 p { margin: 0; font-family: var(--display); font-size: max(12px, calc(clamp(22px, 3.6vw, 36px) * var(--text-scale, 1))); letter-spacing: .18em; line-height: 1.7; }
  .op .b3 small { font-size: max(12px, calc(15px * var(--text-scale, 1))); letter-spacing: .4em; color: #c2a25a; }
  .op .b3 b { font-family: var(--display); font-weight: 800; font-size: max(12px, calc(clamp(30px, 5vw, 54px) * var(--text-scale, 1))); letter-spacing: .16em; }
  .op .b3 b span { display: block; font-size: max(12px, .42em); letter-spacing: .3em; color: #d8cfb8; font-weight: 600; margin-bottom: 6px; }
  .op .b3 p { margin: 0; font-size: max(12px, calc(16px * var(--text-scale, 1))); letter-spacing: .12em; color: #d8cfb8; }
  .op .op-skip { position: fixed; right: max(12px, env(safe-area-inset-right, 0px)); top: max(10px, env(safe-area-inset-top, 0px)); z-index: 3; min-height: 44px; min-width: 44px; padding: 0 16px; background: rgba(20,18,15,.88); color: #ece4d2; border: 1px solid rgba(236,228,210,.28); font: 500 max(12px, calc(14px * var(--text-scale, 1))) var(--ui); letter-spacing: .1em; cursor: pointer; }
  .op .op-skip:hover { border-color: var(--kin); }
  .op .op-tap { position: absolute; bottom: max(14px, env(safe-area-inset-bottom, 0px)); left: 0; right: 0; text-align: center; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: #a89d86; letter-spacing: .2em; }
  @keyframes opBrush { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  body.rm .op .beat { transition: none; } body.rm .op .ink-brush path { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { .op .beat { transition: none; } .op .ink-brush path { animation: none !important; } }
  @media (max-height: 500px) { .op .beat { padding: 50px 20px; gap: 8px; } .op .b3 p { font-size: max(12px, calc(14px * var(--text-scale, 1))); } }
</style>`;
function inkTitle() { return `${INK_DEFS}<div class="ink-title">${INK_STROKE}<h1 class="title">戦国<span>立身</span></h1><i class="seal" aria-hidden="true">立<br>身</i></div>`; }
// 新しく始めた時の入り（大河の始まりのように）。押すと次へ、「飛ばす」で終わる。back は題の画面へ
function openingScreen(name, next, back) {
  let done = false, beat = 0, automatic = false;
  const timers = [];
  const finish = () => { if (done) return; done = true; timers.forEach(clearTimeout); next(); };
  const st = show(`${INK_CSS}<div class="op" role="dialog" aria-label="はじまり">
    <div class="beat b1" aria-hidden="true">${inkTitle()}</div>
    <div class="beat b2"><p>応仁の乱から、百年。<br>国は割れ、戦は絶えない。</p></div>
    <div class="beat b3"><small>永禄三年（一五六〇）　尾張</small><b><span>織田の足軽</span>${esc(name)}</b><p>今川の大軍、二万五千が迫る。</p></div>
    <button type="button" class="op-skip" id="op-skip">飛ばす</button><button type="button" class="btn" id="op-auto" aria-pressed="false" style="position:absolute;top:10px;left:24px;min-height:44px">自動で進める</button>
    <button type="button" class="btn op-tap" id="op-next" style="min-height:44px;left:24px;right:auto">次へ進む</button><p class="op-tap" aria-hidden="true" style="pointer-events:none;left:180px">${isTouch ? '押すと次へ' : `押すか ${K('skip')} で次へ・飛ばすには戻るキー`}</p>
  </div>`, false, (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.code === S.binds.skip || ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button'))) { e.preventDefault(); go(beat + 1); }
  });
  const beats = [...st.querySelectorAll('.op .beat')];
  const LEN = [3.2, 3.4, 3.8];
  const go = (k) => {
    if (done) return;
    timers.forEach(clearTimeout); timers.length = 0;
    if (k >= beats.length) { finish(); return; }
    beat = k;
    beats.forEach((el, i) => { el.classList.toggle('on', i === k); el.setAttribute('aria-hidden', String(i !== k)); });
    if (k === 0) sfx('taiko', 0.8); else if (k === 2) sfx('horagai', 0.5);
    if (automatic) timers.push(setTimeout(() => go(k + 1), LEN[k] * 1000));
  };
  st.querySelector('.op').addEventListener('click', (e) => { if (!e.target.closest('button')) go(beat + 1); });
  $('op-auto').onclick = (e) => { e.stopPropagation(); automatic = !automatic; e.currentTarget.setAttribute('aria-pressed', String(automatic)); e.currentTarget.textContent = automatic ? '自動を止める' : '自動で進める'; timers.forEach(clearTimeout); timers.length = 0; if (automatic) timers.push(setTimeout(() => go(beat + 1), LEN[beat] * 1000)); };
  $('op-next').onclick = (e) => { e.stopPropagation(); go(beat + 1); };
  $('op-skip').onclick = (e) => { e.stopPropagation(); sfx('ui'); finish(); };
  // 左上の戻る（題の画面へ）
  topBack(() => { if (done) return; done = true; timers.forEach(clearTimeout); back(); }, 'タイトルへ', null, false);
  $('op-next').focus({ preventScroll: true });
  requestAnimationFrame(() => go(0));
}

let titleKotoOnce = null;
export function titleScreen(saved, onNew, onContinue, onSettings, onImport, onSlot, onChapter, onDojo, onRecords, onLadder, onJapan, onSamurai, onLord) {
  const readings = [0, 1, 2].map(readProgress);
  const slots = readings.map((r) => r.game);
  saved = slots[S.slot];
  const ARGS = arguments;
  // 保存ごとに筋書きが違うので、その保存の筋書きの戦の並びで「次は」を出す
  const scOf = (g) => SCENARIOS[g.scenario || 'okehazama'];
  const nextOf = (g) => { if (g.japan) return `天下の地図・${(g.japan.turn || 0) + 1}季目の続き`; const bs = scOf(g).battles; return g.battle >= bs.length ? `${scOf(g).name}を終えた` : `${scOf(g).name}・次は${bs[g.battle].name}`; };
  const preparation = (g) => `用意：${ITEMS[g.equip?.weapon]?.name || '武器の記録なし'}。${g.injured ? '傷が残っています' : '傷はありません'}。城下で使える手番はあと${g.actions ?? 0}回`;
  const saveInfo = saved ? `${esc(saved.name)}・${esc(RANKS[saved.rank].name)}・${esc(nextOf(saved))}` : '';
  // 前の筋書きも、保存があれば続きからを先に出す。
  const freeSlot = readings.findIndex((r) => !r.game && !r.bad);
  // 天下の地図：本編の保存が足軽大将以上か、筋書きを終えていれば、その保存のまま進める（今の条件のまま。main.js japanMap）
  const mapOn = !!(onJapan && saved && (saved.rank >= 4 || saved.battle >= scOf(saved).battles.length));
  const scnCard = (k, on) => { const sc = SCENARIOS[k]; return `<div class="sc-card"><label><span><input type="radio" name="scn" value="${k}" ${on ? 'checked' : ''}> ${esc(sc.name)}　<small style="display:inline">${esc(sc.year)}</small></span><small>${esc(sc.blurb)}</small><small class="sc-path">全${sc.battles.length}戦<br>届く身分：<b>${esc(RANKS[sc.ceil[sc.ceil.length - 1]].name)}</b>まで</small></label><details class="sc-battles"><summary>${esc(sc.name)}の戦の並びを見る</summary><ol>${sc.battles.map((b) => `<li>${esc(b.name)}</li>`).join('')}</ol></details></div>`; };
  // 新しく始める：名 → 筋書き を一枚ずつ選ぶ（難易度の選びは無し）（前に選んだ物を覚えておく）
  const pre = newPick();
  // 新しく始める時に選べる筋書き（いまは織田家編だけ。一つなら筋書きの歩は飛ばす）
  const scns = SCENARIO_PICK.filter(scenarioReady);
  const scn0 = scns.includes(pre.scn) ? pre.scn : scns[0];
  const diff0 = DIFFICULTY[pre.diff] ? pre.diff : 'normal';
  const NG_HTML = `<style>
    .ng{max-width:760px;margin:0 auto}
    .ng-top{display:flex;align-items:center;gap:14px;margin-bottom:6px}
    .ng-dots{display:flex;gap:6px;list-style:none;margin:0;padding:0}
    .ng-dots li{width:32px;height:4px;background:var(--line)}
    .ng-dots li.on{background:var(--kin)}
    .ng h2{font-family:var(--display);font-size:max(12px, calc(30px * var(--text-scale, 1)));letter-spacing:.12em;margin:6px 0 6px;font-weight:700}
    .ng .field{max-width:420px}
    .ng .field input{min-height:48px;box-sizing:border-box}
    .ng .diffs label{max-width:none}
    .ng .sc-card{min-width:0;overflow-wrap:anywhere}
    .ng .sc-battles{margin-top:8px;font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6}
    .ng .sc-battles summary{min-height:44px;box-sizing:border-box;padding:8px 12px;border:1px solid var(--line);cursor:pointer}
    .ng .sc-battles ol{margin:8px 0;padding-left:2.5em}
    .ng .sc-battles li{padding-block:4px}
    .ng-act{position:sticky;bottom:0;z-index:2;display:flex;gap:12px;align-items:center;margin-top:18px;padding:14px 0 calc(14px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(20,18,15,0),rgba(20,18,15,.94) 26%)}
    .ng-act .hintk{font-size:max(12px, calc(13px * var(--text-scale, 1)));color:var(--washi-dim);margin-left:auto}
    @media (max-height:500px){.ng h2{font-size:max(12px, calc(22px * var(--text-scale, 1)));margin:2px 0 4px}.ng .note{margin:2px 0}.ng-act{padding-top:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom))}}
  </style>
  <div id="ng" class="ng" hidden>
    <div class="ng-top" id="ng-top"><span class="eyebrow" id="ng-count" aria-live="polite">1 / 3</span><ol class="ng-dots" aria-hidden="true"><li class="on"></li><li></li><li></li></ol></div>
    <section class="ng-step" aria-labelledby="ng-h0"><h2 id="ng-h0" tabindex="-1">名を決める</h2><div class="field"><label for="nm">足軽の名</label><input id="nm" value="${esc(pre.name || '弥五郎')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-describedby="nm-help"><small class="note" id="nm-help">8字まで。空のままなら「弥五郎」になります。普通の難しさで始めます</small></div></section>
    <section class="ng-step" aria-labelledby="ng-h1" hidden><h2 id="ng-h1" tabindex="-1">${scns.length === 1 ? '本編を確かめる' : '筋書きを選ぶ'}</h2><p class="note">${scns.length === 1 ? '織田家編を史実の順で進みます' : '遊ぶ時代を選ぶ'}</p><div class="diffs scn scn-all" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px" role="radiogroup" aria-labelledby="ng-h1">${scns.map((k) => scnCard(k, k === scn0)).join('')}</div></section>
    <section class="ng-step" aria-labelledby="ng-h2" hidden><h2 id="ng-h2" tabindex="-1">難易度を選ぶ</h2><p class="note">迷ったら「普通」</p><div class="diffs" role="radiogroup" aria-labelledby="ng-h2">${Object.entries(DIFFICULTY).map(([k, d]) => `<label><span><input type="radio" name="diff" value="${k}" ${k === diff0 ? 'checked' : ''}> ${d.name}</span><small>${d.note}</small></label>`).join('')}</div></section>
    <p class="note">${readings[S.slot].bad ? `新しい物語を始めると、枠${S.slot + 1}の読めない記録を上書きします。ほかの枠は残ります。` : saved ? freeSlot >= 0 ? `新しい物語は枠${freeSlot + 1}へ保存します。枠${S.slot + 1}の「${esc(saved.name)}」は残ります。` : `新しい物語を始めると、枠${S.slot + 1}の「${esc(saved.name)}」を上書きします。はじまりの札から題へ戻れば、前の記録は残ります。ほかの枠の記録は残ります。` : `新しい物語は枠${S.slot + 1}へ保存します。`}</p><div class="ng-act"><button class="btn" id="ng-back">ひとつ前へ戻る</button><button class="btn primary" id="ng-next">決めて次へ進む</button>${isTouch ? '' : '<span class="hintk">決定キーで次へ・戻るキーで戻る</span>'}</div>
  </div>`;
  const scr = show(`<div class="wrap">
    <div id="tt-home">
    ${readings[S.slot].bad ? '<p class="errbox">！ この枠の記録を読めません。別の枠か、控えてある保存コードから再開してください。</p>' : readings[S.slot].recovered ? '<p class="note">前の控えから記録を読み直しました。</p>' : ''}
    <div class="eyebrow">織田家編　桶狭間から天下へ</div>
    ${window.innerHeight > window.innerWidth ? '<p class="note" style="color:var(--kin)">画面を横向きにするか、パソコンで遊ぶことをおすすめします。</p>' : ''}
    ${illustHtml('title', 'title', '合戦図屏風の一枚絵：土煙の中を駆ける赤備えの騎馬と、馬防柵の内の鉄砲')}
    ${INK_CSS}${inkTitle()}
    <style>.tt-lead .ls{display:none}@media (max-height:500px){.tt-lead{margin:2px 0 0;line-height:1.6}.tt-lead .ll{display:none}.tt-lead .ls{display:inline}.tt-gap{height:4px!important}}</style>
    <p class="lead tt-lead">名もなき足軽が、戦国の世に身を立てる。</p>
    <div class="tt-gap" style="height:20px"></div>${!saved ? '<div id="new-confirm"></div>' : ''}
    ${saved ? `${(saved.scenario || 'okehazama') !== 'oda' ? `<p class="note">古い保存：${esc(scOf(saved).name)}。続きから遊べます。<br>いま新しく始められる本編：織田家編。</p>` : ''}<p class="savebox">保存の枠${S.slot + 1}：${saveInfo}<br>${esc(preparation(saved))}${saved.journal && saved.journal.length ? `<br>前回：${esc(saved.journal[saved.journal.length - 1]?.t || '')}　${esc(String(saved.journal[saved.journal.length - 1]?.s || '').slice(0, 40))}` : ''}</p><div id="new-confirm"></div>` : ''}
    ${!saved && slots.some(Boolean) ? '<p class="note">この枠は空きです。別の枠に記録があります。「保存の枠を替える」から続きの枠を選べます。</p>' : ''}
    <div class="title-act">${saved ? `<button class="btn primary" id="b-cont" aria-describedby="tt-save-note">枠${S.slot + 1}の続きから（${esc(scOf(saved).name)}）</button><button class="btn" id="b-new">新しく始める${freeSlot >= 0 ? `（空いている枠${freeSlot + 1}へ）` : ''}</button><small class="note" id="tt-save-note">城下までの記録です。戦の途中は保存されません。</small>` : '<button class="btn primary" id="b-new">新しく始める</button>'}
      <span class="tt-sub" role="group" aria-label="ほかの操作">${mapOn ? '<button class="btn small" id="b-japan">天下の地図へ</button>' : ''}<button class="btn small" id="b-alt" aria-expanded="false" aria-controls="tt-alt">別の遊び方を開く</button><button class="btn small" id="b-data" aria-expanded="false" aria-controls="tt-data">枠${S.slot + 1}・保存の枠を替える</button>${onRecords ? '<button class="btn small" id="b-records">戦の年表を見る</button>' : ''}<button class="btn small" id="b-words">用語集を開く</button><button class="btn small" id="b-set">設定</button></span>${isTouch ? '' : `<span class="hintk">決定キーで「${saved ? '続きから' : '新しく始める'}」</span>`}</div>
    <section class="tt-panel" id="tt-alt" hidden aria-labelledby="tt-alt-h"><h3 class="tt-ph" id="tt-alt-h">別の遊び方</h3><p class="note">本編とは別に遊べます。ここで遊んだ戦は、本編の戦功・身分・保存には残りません。</p><div class="row">${onSamurai ? '<button class="btn small" id="b-samurai">侍大将で出陣</button>' : ''}${onLord ? '' : ''}<button class="btn small" id="b-dojo">稽古場で腕試し</button>${onJapan && !mapOn ? '<button class="btn small" id="b-japan">日本地図を試す</button>' : ''}${location.hash === '#mvp' ? '<button class="btn small" id="b-rojotest">籠城の試し（開発用）</button>' : ''}</div>${onJapan && !mapOn ? '<p class="note">日本地図は、本編で足軽大将になるか、筋書きを終えると、城下から本編の続きとして進められます。</p>' : ''}</section>
    <div id="samurai-pick"></div>
    <section class="tt-panel" id="tt-data" hidden aria-labelledby="tt-data-h"><h3 class="tt-ph" id="tt-data-h">保存データ</h3><p class="note">空き枠を押してから「新しく始める」で始めます。<br>保存はこのブラウザだけに残ります。別の端末やブラウザへは保存コードか保存ファイルで移します。<br>城下で自動保存します。保存コードは城下で保存した時の控えです。進行・図鑑・実績・稽古の記録が入ります。端末の設定と戦の途中の状態は含みません。</p>
    <div class="field" style="max-width:none"><label id="lb-slot">保存の枠</label><div class="slots" role="group" aria-labelledby="lb-slot">${slots.map((g, i) => `<button class="slotcard ${i === S.slot ? 'on' : ''}" data-slot="${i}" aria-pressed="${i === S.slot}"><b>枠 ${i + 1}</b><small>${readings[i].bad ? '！ 読めない記録。保存コードから再開してください' : g ? `${esc(g.name)}・${esc(RANKS[g.rank].name)}<br>${esc(nextOf(g))}<br>累計戦功 ${g.merit || 0}` : '空き'}</small>${g && (g.grades || []).some(Boolean) ? `<span class="sl-g" aria-label="戦ごとの評定">${scOf(g).battles.map((b, j) => (g.grades[j] ? `<i class="g-${esc(g.grades[j])}" title="${esc(b.name)}">${esc(g.grades[j])}</i>` : '')).join('')}</span>` : ''}</button>`).join('')}</div></div>
    ${slots.map((g, i) => g && (g.grades || []).some(Boolean) ? `<details><summary style="min-height:44px;padding:8px;box-sizing:border-box;cursor:pointer">枠${i + 1}・${esc(g.name)}の戦名と評定を見る</summary><ul>${scOf(g).battles.map((b, j) => g.grades[j] ? `<li>${esc(b.name)}：${esc(g.grades[j])}</li>` : '').join('')}</ul></details>` : '').join('')}
    <div class="title-foot">${saved ? '<button class="btn small" id="b-del">この枠の記録を消す</button>' : ''}<button class="btn small" id="b-export" ${saved ? '' : 'disabled aria-describedby="b-export-why"'}>保存コードを書き出す</button>${saved ? '' : '<small class="note" id="b-export-why">保存がある時に書き出せます</small>'}<button class="btn small" id="b-import">保存コード・ファイルから再開</button>${saved && saved.battle >= scOf(saved).battles.length ? '<button class="btn small" id="b-chapter">章を選んで遊ぶ</button>' : ''}</div>
    <div id="chapters"></div>
    <div id="io-box"></div>
    </section>
    <div style="height:36px"></div>
    ${isTouch ? '<details><summary class="note" style="cursor:pointer">操作を見る</summary><div style="height:10px"></div>' + touchKeysHtml() + '<p class="note">キーボードやゲームパッドをつなぐと、そのまま使えます</p><div style="height:14px"></div><p class="note" style="margin:0 0 6px">キーボード・マウスの操作</p>' + keysHtml() + '</details>' : `<details><summary class="note" style="cursor:pointer">キーボード・マウスの操作</summary><div style="height:10px"></div>${keysHtml()}</details>`}
    <div style="height:18px"></div>
    <details><summary class="note" style="cursor:pointer">ゲームパッドの操作</summary><div style="height:10px"></div>${keysHtml(true)}</details>
    <div style="height:22px"></div>
    <p class="note">${isTouch ? '横向きで遊んでください。' : ''}音が出ます。<br>進行は城下に戻るたびにこのブラウザへ自動保存されます。戦の途中は保存されません。</p>
    </div>
    ${NG_HTML}
  </div>`, false, (e) => {
    // 三歩の札を開いている時：Enter で次へ、Esc で戻る
    if (!$('ng').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); $('ng-back').click(); }
      else if (e.key === 'Enter' && !e.isComposing && !e.repeat && !(e.target instanceof HTMLButtonElement) && !e.target.closest?.('summary')) { e.preventDefault(); $('ng-next').click(); }
      return;
    }
    // 釦に焦点がある時の Enter は、その釦を押す（信長・侍大将の札の戦を選べるように）
    if (e.key === 'Enter' && !e.isComposing && !e.repeat && !e.target.closest?.('button, textarea, input, select, summary, [contenteditable]')) { e.preventDefault(); (saved ? $('b-cont') : $('b-new')).click(); }
  });
  const nameField = $('nm');
  const limitName = () => { const name = Array.from(nameField.value).slice(0, 8).join(''); if (nameField.value !== name) nameField.value = name; };
  nameField.addEventListener('input', (e) => { if (!e.isComposing) limitName(); });
  nameField.addEventListener('compositionend', limitName);
  $('b-words').onclick = () => openGlossary();
  // 下に貼り付く「新しく始める」等の帯（.title-act）は position:sticky なので、携帯の低い画面で
  // スクロールすると「操作を見る」などの下の方の札に重なって半分隠れる。帯の高さぶん、下の余白を空けておく
  {
    const wrap = scr.querySelector('.wrap'), ta = scr.querySelector('.title-act');
    if (wrap && ta) {
      // この題の画面が外れたら（別の画面へ移ったら）聞くのをやめる（聞きっぱなしで増えないように）
      const fit = () => {
        if (!document.body.contains(wrap)) { window.removeEventListener('resize', fit); return; }
        wrap.style.paddingBottom = `${ta.offsetHeight + 20}px`;
      };
      fit();
      titleResize = fit;
      window.addEventListener('resize', fit, { passive: true });
    }
  }
  // 難易度の選びは無くした（kaito 2026-09-27）。いつも「普通」で始める
  // 始める：名と筋書きを先に読んでから、織田家編ならオープニングを挟む（題の画面の字は消えるため）
  const start = () => {
    const nm = shortName($('nm').value) || '弥五郎', scn = (document.querySelector('input[name=scn]:checked') || {}).value || scns[0] || 'oda';
    const go = () => onNew(nm, 'normal', scn);
    if (scn !== 'oda') { go(); return; }
    try { initAudio(); } catch (e) { /* 音が出せなくても進める */ }
    openingScreen(nm, go, () => titleScreen.apply(null, ARGS));
  };
  // 保存コード（別のブラウザや端末へ進行を持ち運ぶ）
  $('b-export').onclick = () => {
    if (!saved) return;
    // 図鑑・実績・稽古場の最高も一緒に入れる（別の端末へ移せるように。852）
    let code;
    try { code = btoa(unescape(encodeURIComponent(JSON.stringify({ ...saved, _extra: exportExtra() })))); }
    catch (e) { notice('！ 保存コードを作れませんでした。城下で保存してから、もう一度書き出してください'); return; }
    $('io-box').innerHTML = `<p class="note" id="io-desc">この文字列を控えておけば、「保存コード・ファイルから再開」で続きから遊べます。</p><label for="io-text" class="note">保存コード</label><textarea id="io-text" spellcheck="false" autocapitalize="off" readonly aria-describedby="io-desc" aria-label="保存コード">${code}</textarea><div class="row" style="margin-top:8px"><button class="btn small" id="io-select">保存コードを全部選ぶ</button><button class="btn small" id="io-copy">保存コードを写す</button><button class="btn small" id="io-file-out">保存ファイルを持ち出す</button></div><p class="note">全部選ぶボタンを押し、端末の「コピー」で写してください。保存ファイルは次の端末で「保存ファイルを選ぶ」から読み込めます。中の字を再開の欄へ貼り付けても使えます。</p>`;
    const t = $('io-text'); t.focus({ preventScroll: true }); t.select(); scrollIn(t);
    $('io-select').onclick = () => { t.focus({ preventScroll:true }); t.select(); scrollIn(t); notice('保存コードを全部選びました。端末の「コピー」で写してください'); };
    // 写せなかった時は、そう言う（985）
    const fail = () => { if (!t.isConnected) return; t.focus({ preventScroll: true }); t.select(); scrollIn(t); notice('自動で写せませんでした。選んである字を写してください'); };
    const copy = () => {
      try { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => { if (t.isConnected) notice('保存コードを写しました'); }).catch(fail); else fail(); } catch (e) { fail(); }
    };
    $('io-copy').onclick = copy;
    $('io-file-out').onclick = () => {
      let url;
      try {
        url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = '戦国立身の記録.txt';
        document.body.appendChild(link); link.click(); link.remove();
        notice('保存ファイルを持ち出しました。別の端末では「保存ファイルを選ぶ」で読み込めます');
      } catch (e) { notice('ファイルを作れませんでした。「保存コードを写す」で保存コードを写してください'); }
      finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
    };
    copy();
  };
  $('b-import').onclick = () => {
    $('io-box').innerHTML = '<p class="note" id="io-desc">保存コードを貼るか、持ち出した保存ファイルを選んでください。</p><label for="io-text" class="note">保存コード</label><textarea id="io-text" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="io-desc"></textarea><div class="row" style="margin-top:8px"><button class="btn small" id="io-file-pick">保存ファイルを選ぶ</button><input type="file" id="io-file-in" accept=".txt,text/plain" hidden><button class="btn small primary" id="io-go">この保存で再開</button></div><div id="io-err" role="alert"></div>';
    if (!isTouch) $('io-text').focus({ preventScroll: true });
    scrollIn($('io-box'));
    $('io-file-pick').onclick = () => $('io-file-in').click();
    $('io-file-in').onchange = async (e) => {
      const file = e.target.files[0], field = $('io-text'), err = $('io-err');
      if (!file) return;
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('大きすぎる記録');
        const code = await file.text();
        if (!field.isConnected || e.target.files[0] !== file) return;
        field.value = code; field.removeAttribute('aria-invalid'); err.textContent = '';
        field.focus({ preventScroll: true }); scrollIn(field);
        notice('ファイルの字を欄へ入れました。「この保存で再開」で内容を確かめます');
      } catch (error) { if (err.isConnected) err.textContent = '！ ファイルを読めませんでした。持ち出した保存ファイルを選び直してください。'; }
      e.target.value = '';
    };
    $('io-go').onclick = () => {
      $('io-text').removeAttribute('aria-invalid');
      $('io-err').textContent = '';
      let stage = 'code';
      try {
        if (!$('io-text').value.trim()) { $('io-text').setAttribute('aria-invalid', 'true'); $('io-err').textContent = '！ 保存コードを貼り付けてください。'; $('io-text').focus({ preventScroll: true }); return; }
        if ($('io-text').value.length > 2 * 1024 * 1024) throw new Error('大きすぎる記録');
        const raw = JSON.parse(decodeURIComponent(escape(atob($('io-text').value.replace(/\s/g, '')))));
        const ex = raw && raw._extra; if (raw) delete raw._extra;
        stage = 'data';
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('記録の形が違います');
        if (raw.practice) {
          $('io-text').setAttribute('aria-invalid', 'true');
          $('io-err').innerHTML = '<p class="errbox">！ 稽古の記録から本編は再開できません。城下で保存した本編のコードを選び直してください。</p>';
          scrollIn($('io-err')); $('io-text').focus({ preventScroll: true });
          return;
        }
        if (!validProgress(raw) || !validExtra(ex)) throw new Error('再開できない記録');
        const G = migrate(raw);
        if (!G || typeof G.name !== 'string' || !G.name.trim() || !Number.isInteger(G.rank) || !RANKS[G.rank] || !Number.isInteger(G.battle) || G.battle < 0 || !SCENARIOS[G.scenario || 'okehazama'] || G.battle > SCENARIOS[G.scenario || 'okehazama'].battles.length) throw new Error('bad');
        const go = () => {
          // 図鑑・実績は、いまの記録と合わせる（消さない）。稽古場は良い方
          try {
            const result = onImport(G);
            Promise.resolve(result).then((ok) => { if (ok !== false) mergeExtra(ex); }).catch(() => notice('！ 再開できませんでした。追加の記録は変えていません。題からもう一度お試しください'));
          } catch (e) { notice('！ 再開できませんでした。追加の記録は変えていません。題からもう一度お試しください'); }
        };
        // 989：いまの枠に記録がある時は、上書きを確かめる
        const nextBattle = scOf(G).battles[G.battle];
        const summary = `「${G.name}」・${rankLabel(G)}。次の戦：${nextBattle ? nextBattle.name : 'この章は終わっています'}。`;
        confirmBox($('io-err'), summary + '図鑑・実績は今の記録と合わせ、稽古は良い記録を残します。進行は選んだ枠だけに読み込みます。' + (saved ? `枠${S.slot + 1}の「${saved.name}」の記録を上書きします。` : 'この記録から再開します。'), saved ? '上書きして再開' : 'この記録で再開', go, { sub: saved ? '上書きした記録は戻せません。空いた枠を選ぶこともできます。' : '人物と次の戦を確かめてください。' });
      } catch (e) { $('io-text').setAttribute('aria-invalid', 'true'); $('io-err').innerHTML = stage === 'data' ? '<p class="errbox">！ この記録は再開できません。ゲームで書き出した保存コードを選び直してください。</p>' : '<p class="errbox">！ 保存コードを読み取れませんでした。書き出した文字列を、はじめから終わりまで全部貼り付けてください。</p>'; scrollIn($('io-err')); $('io-text').focus({ preventScroll: true }); }
    };
  };
  // 三歩の札：step 0 名・1 筋書き・2 難易度。最後の「出陣する」で始める
  let step = 0;
  const begin = () => {
    newPick({ name: shortName($('nm').value || ''), scn: (document.querySelector('input[name=scn]:checked') || {}).value, diff: (document.querySelector('input[name=diff]:checked') || {}).value });
    // 空いた枠があれば、いまの保存を消さずにそちらで始める
    if (saved && freeSlot >= 0) { const prev = S.slot; S.slot = freeSlot; saveSettings(); notice(`枠${freeSlot + 1}で新しく始めます（前の保存は枠${prev + 1}に残っています）`); }
    start();
  };
  // 筋書きが一つだけなら、筋書きの歩は飛ばす（その一つが選ばれたまま）
  const ORDER = scns.length > 1 ? [0, 1] : [0];
  const ngShow = (k) => {
    step = k;
    const open = k >= 0;
    $('tt-home').hidden = open; $('ng').hidden = !open;
    // 左上の戻る：新しく始める歩の間だけ（一つ前の歩へ。初めの歩ならタイトルへ）
    if (open) topBack(() => $('ng-back').click(), k === 0 ? 'タイトルへ' : '戻る');
    // 初めの歩では、下の「戻る」は左上の「タイトルへ」と同じ事なので出さない（Esc は効く）
    if (open) $('ng-back').style.display = k === 0 ? 'none' : '';
    else { $('screen').querySelector(':scope > .topback')?.remove(); $('screen').classList.remove('has-back'); }
    if (!open) { $('b-new').focus({ preventScroll: true }); return; }
    const n = ORDER[k], last = k === ORDER.length - 1;
    document.querySelectorAll('#ng .ng-step').forEach((el, i) => { el.hidden = i !== n; });
    document.querySelectorAll('#ng .ng-dots li').forEach((el, i) => { el.hidden = i >= ORDER.length; el.classList.toggle('on', i <= k); });
    // 歩が一つだけなら、数え（1 / 1）と点は出さない（数える意味が無いので）
    $('ng-top').hidden = false;
    $('ng-count').textContent = `${k + 1} / ${ORDER.length}・${n === 0 ? '名を決める' : '本編を確かめる'}`;
    // 「出陣」は物語の札の釦だけに使う。ここは始める合図だけ
    $('ng-next').textContent = last ? "始める" : "決めて次へ進む";
    $('screen').scrollTop = 0;
    // 焦点：名の欄（触る端末では文字盤で画面が隠れるので当てない）か、選んである札
    const touch = isTouch;
    const el = n === 0 ? (touch ? $('ng-h0') : $('nm')) : document.querySelector(`#ng .ng-step:nth-of-type(${n + 1}) input:checked`) || $(`ng-h${n}`);
    if (el) el.focus({ preventScroll: true });
  };
  $('ng-back').onclick = () => { sfx('ui'); ngShow(step - 1); };
  $('ng-next').onclick = () => {
    sfx('ui');
    if (ORDER[step] === 0 && !$('nm').value.trim()) $('nm').value = '弥五郎';
    if (step < ORDER.length - 1) ngShow(step + 1); else begin();
  };
  $('b-new').onclick = () => {
    if (readings[S.slot].bad) return confirmBox($('new-confirm'), `枠${S.slot + 1}の読めない記録を、新しい物語を始めた時に上書きします。元へ戻せません。`, '名を決めて進む', () => ngShow(0));
    if (!saved || freeSlot >= 0) return ngShow(0);
    // 保存データがあるときは上書きの確認をはさむ
    confirmBox($('new-confirm'), `枠${S.slot + 1}の保存データ（${saved.name}・${RANKS[saved.rank].name}）は、新しい物語を始めた時に上書きします。その前なら題へ戻れます。ほかの枠は残ります。`, '名を決めて進む', () => ngShow(0));
  };
  if (saved) $('b-cont').onclick = onContinue;
  // 別の遊び方・保存データ：押すと下に開く（一度に一つだけ）
  const panel = (bid, pid) => { $(bid).onclick = () => {
    sfx('ui');
    const open = $(pid).hidden;
    ['tt-alt', 'tt-data'].forEach((k) => { $(k).hidden = true; }); $('b-alt').setAttribute('aria-expanded', 'false'); $('b-data').setAttribute('aria-expanded', 'false');
    if (!open) { $('samurai-pick').innerHTML = ''; return; }
    $(pid).hidden = false; $(bid).setAttribute('aria-expanded', 'true'); scrollIn($(pid), 'start');
  }; };
  panel('b-alt', 'tt-alt'); panel('b-data', 'tt-data');
  // 保存の枠を選び直した時は、保存データを開いたまま戻す
  if (titleBack === 'b-data') { $('tt-data').hidden = false; $('b-data').setAttribute('aria-expanded', 'true'); }
  document.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { sfx('ui'); titleBack = 'b-data'; onSlot(+b.dataset.slot); });
  const del = $('b-del');
  if (del) del.onclick = () => {
    confirmBox($('io-box'), `枠${S.slot + 1}の記録（${saved.name}・${RANKS[saved.rank].name}）を消します。`, '記録を消す', () => { titleBack = 'b-data'; onSlot(S.slot, true); });
  };
  const ch = $('b-chapter');
  if (ch) ch.onclick = () => {
    $('chapters').innerHTML = `<p class="note">記録を残さずに、好きな戦をもう一度遊べます（いまの身分・装備・組のまま）。</p><div class="row">${BATTLES.map((b, i) => `<button class="btn small" data-ch="${i}">${esc(b.name)}${saved.best && saved.best[i] ? `（最高 ${saved.best[i]}）` : ''}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-ch]').forEach((b) => b.onclick = () => onChapter(+b.dataset.ch));
  };
  // 964：設定・記録帳・出世の道から戻った時は、押して出た釦へ焦点を戻す
  const remember = (id, f) => () => { titleBack = id; f(); };
  $('b-set').onclick = remember('b-set', onSettings);
  if ($('b-records')) $('b-records').onclick = remember('b-records', onRecords);
  $('b-dojo').onclick = onDojo;
  // 開発用（#mvp の時だけ出る）：束16 籠城の日の画面の試し
  if ($('b-rojotest')) $('b-rojotest').onclick = () => { sfx('ui'); window.__game.testRojo(); };
  if (titleBack && $(titleBack)) { const id = titleBack; setTimeout(() => $(id)?.focus({ preventScroll: true }), 0); }
  titleBack = null;
  // 日本地図（武将になってから開く天下の地図。足軽大将より前は試し）
  if (onJapan) $('b-japan').onclick = () => { sfx('ui'); onJapan(); };
  // 侍大将で出陣／織田信長で出陣：同じ戦の一覧から、侍大将でも信長でも選んで出る（記録は残らない）
  // 侍大将なら自分の組（槍・弓・鉄砲・騎馬のおよそ二十人）、信長なら旗本百人と全軍の軍配
  const openPick = (mode0) => {
    sfx('ui');
    const box = $('samurai-pick');
    const fp = S.view === 'first';
    const list = (onLord && onLord.list ? onLord.list : []).filter((L) => SCENARIOS[L.scn] && SCENARIOS[L.scn].battles.some((b) => b.id === L.id));
    const groups = [];
    // 見出しの年は戦ごとの実の年に合わせる（筋書きの代表の年だと、比叡山＝元亀二年・高遠＝天正十年のように食い違う戦がある）
    // L.under がある札（例：越前・大滝寺の夜討ち）は、別の組に離れて出さず、under の戦の札のすぐ後ろへ入れる
    for (const L of list.filter((q) => !q.under)) { const k = SCENARIO_PICK.includes(L.scn) ? SCENARIOS[L.scn].name : `ほかの戦（${(L.year.match(/^[^（]+（\d+）/) || [SCENARIOS[L.scn].year])[0]}）`; let g = groups.find((q) => q.k === k); if (!g) groups.push(g = { k, items: [] }); g.items.push(L); }
    for (const L of list.filter((q) => q.under)) {
      const g = groups.find((q) => q.items.some((it) => it.id === L.under));
      if (g) g.items.splice(g.items.findIndex((it) => it.id === L.under) + 1, 0, L);
      else { let g2 = groups.find((q) => q.k === 'ほかの一戦'); if (!g2) groups.push(g2 = { k: 'ほかの一戦', items: [] }); g2.items.push(L); }
    }
    box.innerHTML = `<div class="confirm-row lord-pick" style="display:block" role="region" aria-labelledby="lp-h"><b id="lp-h">侍大将で、どの戦に出るか</b>
      <div class="field" style="max-width:none;margin-top:10px"><label id="lp-view">視点</label><div class="diffs" role="radiogroup" aria-labelledby="lp-view" style="display:flex;gap:8px;flex-wrap:wrap">
        <label><span><input type="radio" name="lp-view" value="third" ${fp ? '' : 'checked'}> 三人称</span><small>背中から見る</small></label>
        <label><span><input type="radio" name="lp-view" value="first" ${fp ? 'checked' : ''}> 一人称</span><small>自分の目で見る（戦の中で視点のキーで切り替え）</small></label></div></div>
      ${groups.map((g) => `<div class="eyebrow" style="margin-top:12px">${esc(g.k)}</div>
      <div class="lp-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:6px">${g.items.map((L) => `<button class="btn small lp-card" data-lord="${L.id}" data-scn="${L.scn}" style="min-height:64px;text-align:left;display:block;padding:8px 12px"><b style="display:block;font-size:max(12px, calc(15px * var(--text-scale, 1)))">${esc(L.name)}</b><small style="display:block;opacity:.8;margin-top:2px">${esc(L.year.split('　')[0])}</small></button>`).join('')}</div>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn small" id="lp-no">選ぶのをやめる</button></div></div>`;
    const view = () => (box.querySelector('input[name=lp-view]:checked') || {}).value || 'third';
    const who = () => 'sam';   // 織田信長で遊ぶのはやめた（kaito 10/1）。侍大将だけ
    box.querySelectorAll('[data-lord]').forEach((b) => b.onclick = () => {
      if (who() === 'sam' && onSamurai) { if (view() !== S.view) { S.view = view(); saveSettings(); } onSamurai(b.dataset.scn, b.dataset.lord); }
      else if (onLord) onLord.onBattle(b.dataset.lord, view());
    });
    box.querySelectorAll('[data-lordmap]').forEach((b) => b.onclick = () => onLord.onMap(b.dataset.lordmap));
    $('lp-no').onclick = () => { box.innerHTML = ''; const back = $(mode0 === 'sam' ? 'b-samurai' : 'b-nobunaga'); if (back) back.focus({ preventScroll: true }); };
    scrollIn(box, 'center');
    const first = box.querySelector('[data-lord]'); if (first) first.focus({ preventScroll: true });
  };
  if (onSamurai) $('b-samurai').onclick = () => openPick('sam');

  // 触る端末では名の欄に焦点を当てない（文字盤が開いて画面が隠れる）
  if (!isTouch) (saved ? $('b-cont') : $('b-new')).focus({ preventScroll: true });
  $('screen').classList.add('withbg');
  mountIllust($('screen'));
  // 最初の操作で琴の音
  if (titleKotoOnce) document.removeEventListener('pointerdown', titleKotoOnce);   // 押さずに画面を行き来しても溜めない
  titleKotoOnce = () => { initAudio(); sfx('koto', 0.8); document.removeEventListener('pointerdown', titleKotoOnce); titleKotoOnce = null; };
  document.addEventListener('pointerdown', titleKotoOnce);
}

// ---------------- 設定 ----------------
const SET_CAT = {
  操作: ['st-sens', 'st-psens', 'st-tsens', 'st-tswap', 'st-tsize', 'st-talpha', 'st-rtime', 'st-inv', 'st-smooth', 'st-autocam', 'st-view', 'st-twalk', 'st-run', 'st-guard', 'st-aim', 'st-vib'],
  // 914：「画面」を「見やすさ」と「HUD」に分ける
  見やすさ: ['st-fov', 'st-shake', 'st-blood', 'st-rm', 'st-guide', 'st-ca', 'st-ui', 'st-sub', 'st-subbg', 'st-hints', 'st-font'],
  戦の札: ['st-hudmode', 'st-hc', 'st-fade', 'st-float', 'st-mark', 'st-toast', 'st-cross', 'st-north', 'st-fps', 'st-hudMinimap', 'st-hudCompass', 'st-hudArmy', 'st-hudSquad', 'st-hudBottom', 'st-hudObjectives'],
  音: ['st-vol', 'st-vsfx', 'st-vamb', 'st-vmus', 'st-town', 'st-voice', 'st-vrate', 'st-vvoice'],
  描画: ['st-quality', 'st-cap', 'st-dist', 'st-ares'],
};
const SET_DESC = {
  'st-sens': '低くすると、マウスでゆっくり見回せます',
  'st-psens': '低くすると、右の棒でゆっくり見回せます。指の感度とは別です',
  'st-tswap': '歩く場所を右へ、攻撃の丸を左へ移します。見回す場所も左になります',
  'st-inv': '上になぞると下を見るようになります。マウス・指・右の棒に効きます',
  'st-vib': '端末や手持ちの操作器が対応している時だけ震えます',
  'st-float': '討った場所に戦功の数を出します。切っても得られる戦功は同じです',
  'st-hc': '戦の札の下地を濃くし、字を読みやすくします',
  'st-cross': '武器を向ける目安の形です。なしにしても狙いの補助は変わりません',
  'st-hudMinimap': '近くの地図を表示します。切っても戦場の地図は開けます',
  'st-hudCompass': '向いている方角の帯を表示します',
  'st-hudArmy': '敵と味方の兵力の帯を表示します',
  'st-hudSquad': '預かった組の人数や様子を表示します',
  'st-hudBottom': '下の操作の早見表を表示します。指の端末では丸で操作します',
  'st-vol': '効果音・環境音・楽の音・台詞の読み上げをまとめて変えます。零で音を消します',
  'st-shake': '打たれた時などの画面の揺れを変えます',
  'st-blood': '血の見え方だけを変えます。受ける傷は変わりません',
  'st-sub': '台詞の字だけを変えます。全体の字の大きさとも重なります',
  'st-subbg': '台詞の下に暗い地を敷き、景色の上でも読みやすくします',
  'st-hudmode': '最小では札を減らします。下の「表示」で任務の札を切ると、任務も隠れます',
  'st-fov': '広げると周りが見えますが、遠くの人は小さく見えます',
  'st-view': '自分の姿を見る視点と、自分の目で見る視点を選びます',
  'st-hints': '操作の手ほどきを出します。任務の台詞は残ります。見た説明は下の釦で出し直せます',
  'st-run': 'キーでは押すたびに走りと歩きを替えます。指では一度輪の外まで倒すと、輪へ戻しても指を放すまで走ります',
  'st-guard': '一度押すと構え、もう一度押すと構えを解きます。指の丸にも効きます',
  'st-tsens': '低くすると、指でなぞった時にゆっくり見回せます',
  'st-tsize': '大きくすると、指で押す丸も広がります。小さくしても押せる広さは保ちます',
  'st-talpha': '薄くすると景色が見えます。押せる場所は変わりません',
  'st-rtime': '号令を選ぶ間だけ、戦の速さを変えます。ゆっくりでも止まらず、敵も動きます',
  'st-vsfx': '槍・刀・鉄砲と、合図や釦の音です。零にすると合図も聞こえなくなります',
  'st-vamb': '風・雨・遠くの戦の音です。近くの武器や合図は効果音で変えます',
  'st-vmus': '楽の音だけを変えます。合図の音は残ります',
  'st-vvoice': '台詞の声だけを変えます。全体の音量も重なります。零で声を消します',
  'st-vrate': '低くすると台詞をゆっくり読みます。人によって少し速さが違います',
  'st-ares': '画質が「速さに合わせる」の時だけ、重い場面の絵を粗くします。字の大きさは変わりません',
  'st-hudObjectives': '切ると、今の任務の札が見えなくなります',
  'st-twalk': '携帯で重い時は「札で選ぶ」にすると軽くなります',
  'st-guide': '任務の矢印・端の印・迷った時の台詞を消します。行き先が分かりにくくなります',
  'st-smooth': 'マウスの細かなぶれをならす', 'st-autocam': '歩いている間、視点を動かさなければ背後へ回る', 'st-aim': '突きが少し外れても、近くの敵に向き直って当てる',
  'st-rm': '揺れ・点滅・流れる文字を抑えます。端末で動きを減らしている時は、ここを切っても有効です', 'st-ca': '敵味方を色の明るさと形でも見分ける', 'st-fade': '戦いが無い間は、まわりの札を薄くする',
  'st-mark': '遠くの敵にも頭上に小さな印を出す', 'st-toast': '「大事なものだけ」では5点未満の通知を出さない', 'st-north': 'ミニマップを回さず、北を上にしておく',
  'st-quality': '「速さに合わせる」では端末の速さから選びます。手で選ぶとその画質を保ちます。草・木の量は次の戦から変わります', 'st-cap': '30 は熱と電池を抑えます。60 は動きが滑らかです。戦の進む速さは同じです', 'st-dist': '短いほど霧が近づき、遠くが見えにくくなる代わりに軽くなります',
  'st-town': '城下だけの楽の音を入れます。戦の楽の音は上の音量で変えます。風や人の声は残ります', 'st-fps': '左下に一秒の絵の数と兵の数を出す',
  'st-voice': '日本語の声で台詞を読みます。声が使えない時も字幕は残ります', 'st-font': '本文の字の形を変えます。題字や戦の見出しはそのままです', 'st-ui': '戦の札・台詞・城下の文・釦をまとめて変えます。大きい字は行が増えます',
};
// あまり使わない項目は「細かな設定」に畳む（押すと出る）。指の端末ではゲームパッドの項目を出さない
const SET_ADV = new Set(['st-psens', 'st-smooth', 'st-rtime', 'st-vib', 'st-inv', 'st-float', 'st-mark', 'st-toast', 'st-cross', 'st-north', 'st-fps', 'st-cap', 'st-dist', 'st-hc', 'st-fade', 'st-subbg', 'st-font', 'st-vrate', 'st-talpha',
  'st-hudMinimap', 'st-hudCompass', 'st-hudArmy', 'st-hudSquad', 'st-hudBottom', 'st-hudObjectives']);
let setAdv = false, setCat = '操作';
let voiceChecked = false;
function voiceDescription() {
  try {
    if (!window.speechSynthesis) return 'この端末では声を使えません。字幕で読めます';
    const voices = window.speechSynthesis.getVoices();
    if (voices.some((v) => /^ja(?:[-_]|$)/i.test(v.lang || ''))) return '日本語の声が使えます。台詞を読み上げます';
    return voices.length || voiceChecked ? '日本語の声が見つかりません。端末の声の設定を確かめ、調べ直してください。字幕で読めます' : '声を準備しています。台詞は字幕で読めます';
  } catch (e) { return 'この端末では声を使えません。字幕で読めます'; }
}
window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
  voiceChecked = true;
  const desc = $('st-voice-desc'); if (desc) desc.textContent = voiceDescription();
});
export function settingsHtml() {
  SET_DESC['st-voice'] = voiceDescription();
  const row = (id, label, input, out = '') => {
    const cat = Object.keys(SET_CAT).find((c) => SET_CAT[c].includes(id)) || '操作';
    // 指の端末でも、つないだマウスと手持ちの操作器の感度を変えられる。   // 指の端末は「指でなぞる見回しの感度」だけ（マウスの感度と二つ並べない）
    return `<div class="s-row ${SET_ADV.has(id) ? 'adv' : ''}" data-cat="${cat}"><label for="${id}">${label}${SET_DESC[id] ? `<small id="${id}-desc">${SET_DESC[id]}</small>` : ''}</label>${SET_DESC[id] ? input.replace('id="' + id + '"', 'id="' + id + '" aria-describedby="' + id + '-desc"') : input}<output aria-live="off" id="${id}-o" for="${id}">${out}</output></div>`;
  };
  const chk = (id, key) => `<input type="checkbox" id="${id}" ${(key === 'reduceMotion' ? motionPreference() : S[key]) ? 'checked' : ''}>`;
  return `<div class="settings ${setAdv ? 'show-adv' : ''}"><div class="tabs st-tabs" role="tablist" aria-label="設定の分類">${Object.keys(SET_CAT).map((c, i) => `<button type="button" role="tab" id="st-tab-${i}" data-stcat="${c}" aria-controls="st-panel" class="${c === setCat ? 'on' : ''}" aria-selected="${c === setCat}" tabindex="${c === setCat ? 0 : -1}">${c}</button>`).join('')}</div>
    <div class="st-tools"><p id="st-feedback" role="status" aria-live="polite" aria-atomic="true">草・木の量は次の戦から、ほかはすぐ変わります</p><button type="button" class="btn small st-advbtn" id="st-adv" aria-pressed="${setAdv}">${setAdv ? '細かな設定を畳む' : '細かな設定を見せる（丸の濃さ・号令の速さなど）'}</button></div>
    <div id="st-panel" role="tabpanel" aria-labelledby="st-tab-${Object.keys(SET_CAT).indexOf(setCat)}" tabindex="0">
    ${row('st-sens', '視点の感度', `<input type="range" id="st-sens" min="0.3" max="2.5" step="0.05" value="${S.sens}">`, S.sens.toFixed(2))}
    ${row('st-psens', 'スティックの感度', `<input type="range" id="st-psens" min="0.3" max="2.5" step="0.05" value="${S.padSens}">`, S.padSens.toFixed(2))}
    ${isTouch ? `${row('st-tsens', '指でなぞる見回しの感度', `<input type="range" id="st-tsens" min="0.4" max="2.5" step="0.05" value="${S.touchSens || 1}">`, (S.touchSens || 1).toFixed(2))}
    ${row('st-tswap', '左右の入れ替え（丸を左、歩く棒を右）', chk('st-tswap', 'touchSwap'))}
    ${row('st-tsize', '丸の大きさ', `<select id="st-tsize"><option value="s" ${S.touchSize === 's' ? 'selected' : ''}>小</option><option value="m" ${(S.touchSize || 'm') === 'm' ? 'selected' : ''}>中</option><option value="l" ${S.touchSize === 'l' ? 'selected' : ''}>大</option></select>`)}
    ${row('st-talpha', '丸の濃さ', `<input type="range" id="st-talpha" min="0.35" max="1" step="0.05" value="${S.touchAlpha || 1}">`, Math.round((S.touchAlpha || 1) * 100) + '%')}<div class="s-row" data-cat="操作"><span>丸の見本<br><small>携帯横の「突く」の押せる広さ。端末の広さで変わります</small></span><span id="st-touch-sample" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid var(--kin);background:var(--sumi-2);color:var(--washi);box-sizing:border-box">突く</span></div>` : ''}
    ${row('st-rtime', '号令の輪を開いている間', `<select id="st-rtime"><option value="slow" ${S.radialTime !== 'run' ? 'selected' : ''}>時がゆっくり流れる</option><option value="run" ${S.radialTime === 'run' ? 'selected' : ''}>そのまま流れる</option></select>`)}
    ${row('st-inv', '上下の反転', chk('st-inv', 'invertY'))}
    ${row('st-smooth', 'マウスのぶれをならす', chk('st-smooth', 'smooth'))}
    ${row('st-autocam', 'カメラが背後へ回る', chk('st-autocam', 'autoCam'))}
    ${row('st-view', '戦の視点', `<select id="st-view"><option value="third" ${S.view !== 'first' ? 'selected' : ''}>三人称（背中から見る）</option><option value="first" ${S.view === 'first' ? 'selected' : ''}>一人称（自分の目で見る）</option></select>`)}
    ${row('st-fov', '見える広さ', `<input type="range" id="st-fov" min="50" max="85" step="1" value="${S.fov}">`, S.fov + '°')}
    ${row('st-vol', '音量（全体）', `<input type="range" id="st-vol" min="0" max="1" step="0.05" value="${S.volume}">`, Math.round(S.volume * 100) + '%')}
    ${row('st-vsfx', '効果音', `<input type="range" id="st-vsfx" min="0" max="1" step="0.05" value="${S.volSfx}">`, Math.round(S.volSfx * 100) + '%')}
    ${row('st-vamb', '環境音', `<input type="range" id="st-vamb" min="0" max="1" step="0.05" value="${S.volAmb}">`, Math.round(S.volAmb * 100) + '%')}
    ${row('st-vmus', '楽の音', `<input type="range" id="st-vmus" min="0" max="1" step="0.05" value="${S.volMusic}">`, Math.round(S.volMusic * 100) + '%')}
    ${row('st-town', '城下の楽の音', chk('st-town', 'townMusic'))}
    ${row('st-twalk', '城下', `<select id="st-twalk"><option value="walk" ${S.townWalk !== 'cards' ? 'selected' : ''}>町を歩く</option><option value="cards" ${S.townWalk === 'cards' ? 'selected' : ''}>札で選ぶ（軽い）</option></select>`)}
    ${row('st-run', '走りを切替式に', chk('st-run', 'runToggle'), '')}
    ${row('st-guard', '構えを切替式に', chk('st-guard', 'guardToggle'), '')}
    ${row('st-aim', '突きの狙いを助ける', chk('st-aim', 'aimAssist'))}
    ${row('st-shake', '画面の揺れ', chk('st-shake', 'shake'))}
    ${row('st-hudmode', '画面の札の量', `<select id="st-hudmode"><option value="min" ${S.hudMode === 'min' ? 'selected' : ''}>最小（戦場を広く）</option><option value="normal" ${(S.hudMode || 'normal') === 'normal' ? 'selected' : ''}>ふつう</option><option value="full" ${S.hudMode === 'full' ? 'selected' : ''}>全部</option></select>`)}
    ${row('st-blood', '血の見せ方', `<select id="st-blood"><option value="on" ${(S.blood || 'on') === 'on' ? 'selected' : ''}>あり</option><option value="low" ${S.blood === 'low' ? 'selected' : ''}>控えめ</option><option value="off" ${S.blood === 'off' ? 'selected' : ''}>なし</option></select>`)}
    ${row('st-rm', '動きを減らす', chk('st-rm', 'reduceMotion'))}
    ${row('st-guide', '手引きを減らす', chk('st-guide', 'reduceGuidance'))}
    ${row('st-ca', '色覚に配慮した配色', chk('st-ca', 'colorAssist'))}
    ${row('st-ui', '字の大きさ', `<select id="st-ui"><option value="s" ${S.uiScale === 's' ? 'selected' : ''}>小</option><option value="m" ${S.uiScale === 'm' ? 'selected' : ''}>中</option><option value="l" ${S.uiScale === 'l' ? 'selected' : ''}>大</option></select>`)}
    ${row('st-vib', isTouch ? '振動' : 'ゲームパッドの振動', chk('st-vib', 'vibrate'))}
    ${row('st-sub', '字幕の大きさ', `<select id="st-sub"><option value="s" ${S.subSize === 's' ? 'selected' : ''}>小</option><option value="m" ${S.subSize === 'm' ? 'selected' : ''}>中</option><option value="l" ${S.subSize === 'l' ? 'selected' : ''}>大</option></select>`)}
    ${row('st-hints', 'ヒントを表示', chk('st-hints', 'hints'))}
    ${row('st-subbg', '字幕に下地を敷く', chk('st-subbg', 'subBg'))}
    ${row('st-hc', '札の字をくっきりさせる', chk('st-hc', 'hudContrast'))}
    ${row('st-fade', '戦いが無い間は札を薄く', chk('st-fade', 'hudAutoFade'))}
    ${row('st-float', '討った場所に戦功を浮かべる', chk('st-float', 'floatMerit'))}
    <p id="st-quality-now" class="note s-row" data-cat="描画">${S.qualityAuto ? `速さに合わせています。今の画質：${{ low: '低', mid: '中', high: '高' }[S.quality]}${S.qualityMeasured ? '（実測済み）' : '（速さを調べる前）'}` : '画質は手で選んだまま保ちます'}。画質の欄から「速さに合わせる」へ戻せます。</p>
    <div class="s-row" data-cat="描画"><button type="button" class="btn small" id="st-quality-remeasure">端末の速さを計り直す</button><small>次に戦が動く間に計ります。速さに合わせる画質へ切り替えます。</small></div>
    ${row('st-quality', '画質', `<select id="st-quality"><option value="auto" ${S.qualityAuto ? 'selected' : ''}>速さに合わせる</option>${[['low', '低（軽い）'], ['mid', '中'], ['high', '高（きれい）']].map(([v, l]) => `<option value="${v}" ${!S.qualityAuto && S.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${row('st-cap', '一秒に描く回数の上限', `<select id="st-cap"><option value="0" ${!S.fpsCap ? 'selected' : ''}>上限なし</option><option value="60" ${S.fpsCap === 60 ? 'selected' : ''}>60</option><option value="30" ${S.fpsCap === 30 ? 'selected' : ''}>30（省電力）</option></select>`)}
    ${row('st-dist', '見える遠さ', `<input type="range" id="st-dist" min="0.6" max="1.4" step="0.01" value="${S.drawDist}">`, Math.round(S.drawDist * 100) + '%')}
    ${row('st-ares', '滑らかさ優先（自動で細かさを下げる）', chk('st-ares', 'autoRes'))}
    ${row('st-fps', '一秒の絵の数を出す', chk('st-fps', 'showFps'))}
    ${row('st-mark', '敵の頭上に常に印', chk('st-mark', 'enemyMark'))}
    ${row('st-toast', '戦功の通知', `<select id="st-toast"><option value="all" ${S.toastLevel === 'all' ? 'selected' : ''}>すべて</option><option value="important" ${S.toastLevel === 'important' ? 'selected' : ''}>大事なものだけ</option></select>`)}
    ${row('st-cross', '照準の形', `<select id="st-cross"><option value="dot" ${S.crosshair === 'dot' ? 'selected' : ''}>点</option><option value="cross" ${S.crosshair === 'cross' ? 'selected' : ''}>十字</option><option value="none" ${S.crosshair === 'none' ? 'selected' : ''}>なし</option></select>`)}
    ${row('st-north', 'ミニマップを北が上に', chk('st-north', 'mapNorth'))}
    ${row('st-font', '文字の書体', `<select id="st-font"><option value="gothic" ${S.fontBody === 'gothic' ? 'selected' : ''}>ゴシック（読みやすい）</option><option value="mincho" ${S.fontBody === 'mincho' ? 'selected' : ''}>明朝（雰囲気）</option></select>`)}
    ${['hudMinimap:ミニマップ', 'hudCompass:方角の帯', 'hudArmy:両軍の兵力', 'hudSquad:組の札', 'hudBottom:下の札', 'hudObjectives:任務の札'].map((x) => { const [k, l] = x.split(':'); return row('st-' + k, `表示：${l}`, `<input type="checkbox" id="st-${k}" ${S[k] ? 'checked' : ''}>`); }).join('')}
    ${row('st-voice', '台詞の読み上げ', `<select id="st-voice"><option value="off" ${S.voice === 'off' ? 'selected' : ''}>読み上げない</option><option value="major" ${S.voice === 'major' ? 'selected' : ''}>主な人物だけ</option><option value="all" ${S.voice === 'all' ? 'selected' : ''}>すべて</option></select>`)}
    ${row('st-vvoice', '台詞の声の音量', `<input type="range" id="st-vvoice" min="0" max="1" step="0.05" value="${S.volVoice}">`, Math.round(S.volVoice * 100) + '%')}
    <div class="s-row" data-cat="音"><div class="row" style="gap:8px"><button type="button" class="btn small" id="st-voice-check">声を調べ直す</button><button type="button" class="btn small" id="st-voice-test">声を試す</button><button type="button" class="btn small" id="st-signal-test">合図を聞く</button><button type="button" class="btn small" id="st-weapon-test">槍の音を聞く</button></div></div>
    ${row('st-vrate', '読み上げの速さ', `<input type="range" id="st-vrate" min="0.7" max="1.5" step="0.05" value="${S.voiceRate}">`, S.voiceRate.toFixed(2))}
    <p class="note st-save-note">変えた設定はこのブラウザに保存されます。画質の草・木の量は次の戦から変わります。</p>
    <div class="row st-reset-row"><button class="btn small" id="st-rehint">手ほどきと初回の説明をもう一度表示する</button><button class="btn small" id="st-reset">設定を初期値に戻す</button></div><div id="st-reset-cf"></div>
    ${isTouch ? '' : `<div id="kb-cf" class="kb-lbl"></div>
    <div class="eyebrow kb-lbl" style="margin-top:10px">キー割り当て（操作を選んでから、割り当てたいキーを押してください）</div>
    <div class="row kb-lbl"><button type="button" class="btn small" id="kb-arrows">矢印キーで移動する</button><button type="button" class="btn small" id="kb-reset">キーを初期に戻す</button></div>
    <div class="keybind">${Object.keys(BIND_DEFAULTS).map((a) => `<button data-bind="${a}"><span>${BIND_LABELS[a]}</span><b>${keyLabel(S.binds[a])}</b></button>`).join('')}</div>`}
    </div>
  </div>`;
}

function settingsFeedback(text) {
  const el = $('st-feedback'); if (!el) return;
  el.textContent = text; el.classList.toggle('errbox', text.startsWith('！'));
  el.setAttribute('role', text.startsWith('！') ? 'alert' : 'status');
}
export function bindSettings(onChange) {
  const touchSample = () => {
    const el = $('st-touch-sample'); if (!el) return;
    const size = Math.ceil(84 * ({ s:0.88, m:1, l:1.14 }[S.touchSize] || 1));
    el.style.width = el.style.height = size + 'px'; el.style.opacity = String(S.touchAlpha || 1);
  };
  touchSample();
  const feedback = settingsFeedback;
  const checkVoice = () => {
    voiceChecked = false;
    if ($('st-voice-desc')) $('st-voice-desc').textContent = voiceDescription();
    const desc = $('st-voice-desc');
    setTimeout(() => { if (!desc?.isConnected) return; voiceChecked = true; desc.textContent = voiceDescription(); }, 2500);
  };
  if ($('st-voice-check')) { $('st-voice-check').onclick = checkVoice; checkVoice(); }
  if ($('st-voice-test')) $('st-voice-test').onclick = () => {
    try {
      const voice = window.speechSynthesis?.getVoices().find((v) => /^ja(?:[-_]|$)/i.test(v.lang || ''));
      if (!voice) { feedback(voiceDescription()); return; }
      if (S.volume <= 0 || S.volVoice <= 0) { feedback('全体と台詞の声の音量を上げてください'); return; }
      speechSynthesis.cancel();
      const line = new SpeechSynthesisUtterance('出陣の用意を整えましょう。');
      line.lang = 'ja-JP'; line.voice = voice; line.rate = S.voiceRate; line.volume = S.volume * S.volVoice;
      line.onerror = () => { if ($('st-voice-test')) feedback('声を出せませんでした。端末の声の設定を確かめてください'); };
      speechSynthesis.speak(line); feedback('選んだ音量と速さで声を試しています');
    } catch (e) { feedback('声を出せませんでした。台詞は字幕で読めます'); }
  };
  for (const [id, sound] of [['st-signal-test', 'horagai'], ['st-weapon-test', 'thrust']]) if ($(id)) $(id).onclick = async (e) => { const button = e.currentTarget; await initAudio(); if (!button.isConnected) return; sfx(sound, 0.6); feedback(S.volume > 0 && S.volSfx > 0 ? '選んだ音量で試しています' : '全体と効果音の音量を上げてください'); };
  if ($('st-quality-remeasure')) $('st-quality-remeasure').onclick = () => {
    S.qualityAuto = true; S.qualityMeasured = false;
    if ($('st-quality')) $('st-quality').value = 'auto';
    onChange?.('qualityMeasure');
    const stored = saveSettings();
    if ($('st-quality-now')) $('st-quality-now').textContent = '次に戦が動く間に、端末の速さを計り直します';
    feedback(stored ? '速さを計り直す設定を保存しました' : '！ 保存できませんでした。今の間だけ計り直します');
  };
  const adv = $('st-adv');
  if (adv) adv.onclick = () => { setAdv = !setAdv; const box = document.querySelector('.settings'); if (box) box.classList.toggle('show-adv', setAdv); adv.setAttribute('aria-pressed', String(setAdv)); adv.textContent = setAdv ? '細かな設定を畳む' : '細かな設定を見せる（丸の濃さ・号令の速さなど）'; sfx('ui'); };
  const bind = (id, key, conv, fmt) => {
    const el = $(id);
    if (!el) return;
    const valueText = () => fmt ? fmt(S[key]) : el.type === 'checkbox' ? ((key === 'reduceMotion' ? motionPreference() : S[key]) ? '入れる' : '切る') : el.selectedOptions[0]?.textContent || el.value;
    const sync = () => {
      if (el.type === 'checkbox') el.checked = key === 'reduceMotion' ? motionPreference() : !!S[key];
      if (fmt || el.type === 'checkbox') {
        const out = $(id + '-o');
        if (out) out.textContent = valueText();
      }
      if (fmt) el.setAttribute('aria-valuetext', valueText());
    };
    sync();
    const persist = () => {
      const stored = saveSettings(), feedback = $('st-feedback');
      const label = el.closest('.s-row')?.querySelector('label')?.firstChild.textContent || '設定';
      settingsFeedback(stored ? `${label}：${valueText()}。保存しました${key === 'quality' ? '（草・木の量は次の戦から）' : ''}` : '！ 設定を保存できませんでした。今の画面では使えます。次に開くと元に戻ります');
    };
    let lastValue;
    const update = () => {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      if (value === lastValue) return;
      lastValue = value;
      if (key === 'quality') {
        S.qualityAuto = el.value === 'auto';
        if (!S.qualityAuto) S[key] = conv(el);
        const qualityNow = $('st-quality-now');
        if (qualityNow) qualityNow.textContent = `${S.qualityAuto ? '速さに合わせています' : '手で選んだ画質を保ちます'}。今の画質：${{ low: '低', mid: '中', high: '高' }[S.quality]}。画質の欄から「速さに合わせる」へ戻せます。`;
      } else S[key] = conv(el);
      sync();
      onChange && onChange(key);
      if (key === 'touchSize' || key === 'touchAlpha') touchSample();
      const feedback = $('st-feedback');
      const label = el.closest('.s-row')?.querySelector('label')?.firstChild.textContent;
      if (el.type !== 'range') settingsFeedback(`${label}：${valueText()}${key === 'quality' ? '（草・木の量は次の戦から）' : ' に変えました'}`);
    };
    el.addEventListener('input', update);
    el.addEventListener('change', () => { update(); persist(); });
  };
  bind('st-sens', 'sens', (e) => +e.value, (v) => v.toFixed(2));
  bind('st-psens', 'padSens', (e) => +e.value, (v) => v.toFixed(2));
  bind('st-tsens', 'touchSens', (e) => +e.value, (v) => v.toFixed(2));
  bind('st-tswap', 'touchSwap', (e) => e.checked);
  bind('st-tsize', 'touchSize', (e) => e.value);
  bind('st-talpha', 'touchAlpha', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-rtime', 'radialTime', (e) => e.value);
  bind('st-smooth', 'smooth', (e) => e.checked);
  bind('st-autocam', 'autoCam', (e) => e.checked);
  bind('st-view', 'view', (e) => e.value);
  bind('st-guard', 'guardToggle', (e) => e.checked);
  bind('st-rm', 'reduceMotion', (e) => e.checked);
  bind('st-guide', 'reduceGuidance', (e) => e.checked);
  bind('st-ca', 'colorAssist', (e) => e.checked);
  bind('st-ui', 'uiScale', (e) => e.value);
  bind('st-vib', 'vibrate', (e) => e.checked);
  bind('st-vsfx', 'volSfx', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-vamb', 'volAmb', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-vmus', 'volMusic', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-town', 'townMusic', (e) => e.checked);
  bind('st-twalk', 'townWalk', (e) => e.value);
  bind('st-subbg', 'subBg', (e) => e.checked);
  bind('st-hc', 'hudContrast', (e) => e.checked);
  bind('st-fade', 'hudAutoFade', (e) => e.checked);
  bind('st-float', 'floatMerit', (e) => e.checked);
  bind('st-quality', 'quality', (e) => e.value);
  bind('st-cap', 'fpsCap', (e) => +e.value);
  bind('st-dist', 'drawDist', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-mark', 'enemyMark', (e) => e.checked);
  bind('st-toast', 'toastLevel', (e) => e.value);
  bind('st-cross', 'crosshair', (e) => e.value);
  bind('st-blood', 'blood', (e) => e.value);
  bind('st-hudmode', 'hudMode', (e) => e.value);
  bind('st-north', 'mapNorth', (e) => e.checked);
  bind('st-font', 'fontBody', (e) => e.value);
  bind('st-voice', 'voice', (e) => e.value);
  bind('st-vvoice', 'volVoice', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-vrate', 'voiceRate', (e) => +e.value, (v) => v.toFixed(2));
  for (const k of ['hudMinimap', 'hudCompass', 'hudArmy', 'hudSquad', 'hudBottom', 'hudObjectives']) bind('st-' + k, k, (e) => e.checked);
  // 分類のタブ
  const show = (cat) => {
    setCat = cat;
    stopBind();
    document.querySelectorAll('[data-bind]').forEach((b) => { b.classList.remove('wait'); b.querySelector('b').textContent = keyLabel(S.binds[b.dataset.bind]); });
    const panel = $('st-panel');
    if (panel) panel.scrollTop = 0;
    document.querySelectorAll('.settings .s-row').forEach((r) => { r.hidden = r.dataset.cat !== cat || r.dataset.pauseHidden === 'true'; });
    document.querySelectorAll('[data-stcat]').forEach((b) => { const on = b.dataset.stcat === cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) $('st-panel')?.setAttribute('aria-labelledby', b.id); });
    document.querySelectorAll('.settings .keybind, .settings .kb-lbl').forEach((r) => { r.hidden = cat !== '操作' || isTouch; });
  };
  document.querySelectorAll('[data-stcat]').forEach((b) => {
    b.onclick = () => show(b.dataset.stcat);
    // ←→ で隣の分類へ（タブの決まり）
    b.onkeydown = (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const all = [...document.querySelectorAll('[data-stcat]')];
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
      const n = all[index];
      e.preventDefault(); e.stopPropagation(); show(n.dataset.stcat); n.focus({ preventScroll: true });
    };
  });
  show(setCat);
  bind('st-inv', 'invertY', (e) => e.checked);
  bind('st-fov', 'fov', (e) => +e.value, (v) => v + '°');
  bind('st-vol', 'volume', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-run', 'runToggle', (e) => e.checked);
  bind('st-aim', 'aimAssist', (e) => e.checked);
  bind('st-shake', 'shake', (e) => e.checked);
  bind('st-sub', 'subSize', (e) => e.value);
  bind('st-hints', 'hints', (e) => e.checked);
  bind('st-ares', 'autoRes', (e) => e.checked);
  bind('st-fps', 'showFps', (e) => e.checked);
  const rh = $('st-rehint');
  if (rh) rh.onclick = () => { const stored = resetHints(); resetFirstHelp(); notice(stored ? '手ほどきと初回の説明を、もう一度はじめから出します' : '！ 手ほどきを出し直しますが、保存できませんでした。次に開くと戻ることがあります'); };
  const rs = $('st-reset');
  if (rs) rs.onclick = () => confirmBox($('st-reset-cf'), '音・画面・操作・キー割り当ての設定を、すべて初期値に戻します。', '初期値に戻す', () => {
    const stored = resetSettings(); onChange && onChange('all');
    const box = rs.closest('.settings');
    const holder = box.parentElement;
    box.outerHTML = settingsHtml();
    bindSettings(onChange);
    void holder;
    settingsFeedback(stored ? '設定を初期値に戻しました' : '！ 初期値に戻しましたが、保存できませんでした');
    $('st-reset')?.focus({ preventScroll: true });
    notice(stored ? '設定を初期値に戻しました' : '！ 初期値を保存できませんでした。今の間だけ使えます');
  });
  const refreshKeys = () => document.querySelectorAll('[data-bind]').forEach((x) => { x.querySelector('b').textContent = keyLabel(S.binds[x.dataset.bind]); });
  const ka = $('kb-arrows');
  if (ka) ka.onclick = () => confirmBox($('kb-cf'), '前後左右の移動を矢印キーに割り当て直します。', '矢印キーにする', () => { $('kb-cf').innerHTML = ''; for (const [act, code] of [['forward', 'ArrowUp'], ['back', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']]) { const other = Object.keys(S.binds).find((key) => key !== act && S.binds[key] === code); if (other) S.binds[other] = S.binds[act]; S.binds[act] = code; } const stored = saveSettings(); refreshKeys(); onChange && onChange('binds'); notice(stored ? '矢印キーで動けるようにしました。前に使っていた操作とはキーを入れ替えました' : '！ 矢印キーの設定を保存できませんでした。今の間だけ使えます'); ka.focus({ preventScroll: true }); }, { sub: 'いまの前後左右のキーの割り当ては消えます。' });
  const kr = $('kb-reset');
  if (kr) kr.onclick = () => confirmBox($('kb-cf'), 'キーの割り当てを、すべて初めの形に戻します。', '初期に戻す', () => { $('kb-cf').innerHTML = ''; S.binds = { ...BIND_DEFAULTS }; const stored = saveSettings(); refreshKeys(); onChange && onChange('binds'); notice(stored ? 'キーを初期に戻しました' : '！ キーの初期値を保存できませんでした。今の間だけ使えます'); kr.focus({ preventScroll: true }); }, { sub: '自分で変えた割り当ては消えます。' });
  // キー割り当て
  // 割り当て中の聞き手は一つだけ。別の釦を押したら前のを外す（二つ残ると次の一押しが二つの操作に入る）
  if (bindHandler) { window.removeEventListener('keydown', bindHandler, true); bindHandler = null; }
  document.querySelectorAll('[data-bind]').forEach((b) => b.onclick = () => {
    if (bindHandler && b.classList.contains('wait')) { stopBind(); refreshKeys(); b.classList.remove('wait'); return; }
    if (bindHandler) { window.removeEventListener('keydown', bindHandler, true); bindHandler = null; }
    document.querySelectorAll('[data-bind]').forEach((x) => { x.classList.remove('wait'); x.querySelector('b').textContent = keyLabel(S.binds[x.dataset.bind]); });
    b.classList.add('wait'); b.querySelector('b').textContent = 'キーを押す・もう一度押してやめる';
    const h = (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || e.isComposing || e.code === 'Process' || !e.code) return;
      if (e.code !== 'Escape' && !validBind(e.code)) { notice(bindReserved(e.code) ? '説明に使うキーです。別のキーを押してください' : 'このキーは使えません。別のキーを押してください'); return; }
      // 入れ替え先も調べ、移動キーが馬の操作へ移るのを防ぐ。
      const act = b.dataset.bind;
      const other = Object.keys(S.binds).find((key) => key !== act && S.binds[key] === e.code);
      if (e.code !== 'Escape' && (!validBind(e.code, act) || (other && !validBind(S.binds[act], other)))) {
        notice('移動のキーは馬の操作に使えません。別のキーを押してください'); return;
      }
      window.removeEventListener('keydown', h, true); if (bindHandler === h) bindHandler = null;
      if (e.code !== 'Escape') {
        // 同じキーが別の操作に割り当てられていたら入れ替える
        for (const [k, v] of Object.entries(S.binds)) if (v === e.code && k !== act) { S.binds[k] = S.binds[act]; notice(`「${BIND_LABELS[k]}」と入れ替えました（${BIND_LABELS[k]}：${keyLabel(S.binds[k])}）`); }
        S.binds[act] = e.code;
        const stored = saveSettings();
        notice(stored ? `${BIND_LABELS[act]}：${keyLabel(S.binds[act])} に変えました` : '！ キーの設定を保存できませんでした。今の間だけ使えます');
        onChange && onChange('binds');
      }
      document.querySelectorAll('[data-bind]').forEach((x) => { x.classList.remove('wait'); x.querySelector('b').textContent = keyLabel(S.binds[x.dataset.bind]); });
    };
    bindHandler = h;
    window.addEventListener('keydown', h, true);
  });
}
let bindHandler = null;
function stopBind() { if (bindHandler) { window.removeEventListener('keydown', bindHandler, true); bindHandler = null; } }

export function townEntryScreen(onWalk, onCards) {
  show('<div class="wrap"><h2>城下の過ごし方を選ぶ</h2><p class="lead">町を歩くか、軽い札で用意を進められます。</p><p class="note">どちらでも、同じ買い物・稽古・出陣ができます。あとから設定で替えられます。</p><div class="row" style="gap:8px"><button type="button" class="btn" id="town-cards">軽い札で進める</button><button type="button" class="btn primary" id="town-walk">町を歩く</button></div></div>');
  $('town-cards').onclick = onCards; $('town-walk').onclick = onWalk;
  $('town-cards').focus({ preventScroll: true });
}

export function settingsScreen(onChange, onClose) {
  const closeSt = () => { window.speechSynthesis?.cancel(); stopBind(); const stored = saveSettings(); onClose(); if (!stored) notice('！ 設定を保存できませんでした。次に開くと元に戻ります'); };
  show(`<div class="wrap st-screen"><h2 class="st-h">設定</h2>
    ${settingsHtml()}
    <div class="title-act st-act"><button class="btn primary" id="st-close">設定を閉じて戻る</button>${isTouch ? '' : '<span class="hintk">戻るキーでも戻れます</span>'}</div></div>`, false, (e) => { if (e.key === 'Escape') closeSt(); });
  bindSettings(onChange);
  $('st-close').onclick = closeSt;
  topBack(closeSt);
  document.querySelector('[data-stcat][aria-selected="true"]')?.focus({ preventScroll: true });
}

// ---------------- 物語の幕間 ----------------
// aim：この戦で上がり得る身分の一言（826）。onBack：城下へ戻る（996。Esc でも）
// 読み込みの間に読む、戦の一言の史実と見どころ（織田家編。無い戦は出さない）
const LORE = {
  okehazama: ['今川義元、二万五千で尾張へ。信長は二千で本陣を突く', '雨の中の行軍と、本陣の旗本との斬り合い'],
  moribe: ['義龍の死に乗じ、信長は美濃へ攻め入った', '林を抜けて、斎藤勢の横腹を突く'],
  sunomata: ['木下藤吉郎が、長良川の西に一夜で砦を築いたと伝わる', '柵の内から、寄せる斎藤勢を突き落とす'],
  inabayama: ['西美濃三人衆が寝返り、稲葉山は裸城となった', '夜明けの城下を抜け、大手口を破る'],
  mitsukuri: ['上洛の道をふさぐ六角氏の城を、一日で落とした', '夜の山道を登り、木戸を破る'],
  kanegasaki: ['浅井長政が背き、信長は朝倉攻めから退いた', '殿（しんがり）として、追う朝倉勢を食い止める'],
  anegawa: ['織田・徳川と、浅井・朝倉が川を挟んで激突した', '浅瀬を渡っての大乱戦'],
  nodafukushima: ['三好三人衆の砦を囲むうち、本願寺が挙兵した', '竹束を担いで堤を上り、砦へ迫る'],
  shiga: ['浅井・朝倉の大軍が、宇佐山城に迫った', '城を守り抜き、援軍を待つ'],
  hieizan: ['浅井・朝倉に味方した比叡山を、信長は焼き討ちにした', '坂を上り、堂塔の間を進む'],
  mikatagahara: ['武田信玄の大軍に、徳川家康が野戦を挑んで敗れた', '崩れる味方の中で生き延びる'],
  tonezaka: ['退く朝倉勢を、織田勢が刀根坂で追い討った', '峠道の追撃戦'],
  odani: ['浅井長政の小谷城が落ち、浅井家は滅んだ', '尾根の曲輪を一つずつ落とす'],
  nagashima: ['一向一揆の輪中を、織田勢は幾度も攻めた', '水と砦の間の戦い'],
  shitaragahara: ['馬防柵と鉄砲で、武田の騎馬を迎え撃った', '柵の内から、押し寄せる赤備えを止める'],
  echizen: ['越前の一向一揆を、信長は大軍で平らげた', '木ノ芽峠の砦攻め'],
  iwamura: ['武田に奪われた岩村城を、織田信忠が取り戻した', '水晶山の夜襲を退ける'],
  tennoji: ['本願寺勢に囲まれた天王寺砦を、信長自ら救った', '寡兵で大軍の囲みを破る'],
  saika: ['小雑賀川の高い岸と鉄砲に阻まれた', '川を引き返し、東岸の列を保つ'],
  tedorigawa: ['上杉謙信が、手取川で織田勢を破った', '夜の渡河と、背後から来る上杉勢'],
  shigisan: ['松永久秀が背き、信貴山城に籠もった', '山城の曲輪を攻め上る'],
  kizugawa: ['鉄の船が、毛利の水軍を木津川口で打ち破った', '大船の上の鉄砲の撃ち合い'],
  miki: ['三木城の兵糧攻めのさなか、毛利の後詰めと戦った', '西の道で味方と合流し、兵糧の荷を止める'],
  arioka: ['荒木村重が背き、有岡城に籠もった', '上ろう塚の木戸へ、滝川の先手に続く'],
  iga: ['伊賀の国衆を、織田勢は四方から攻めた', '山の砦と、忍びの待ち伏せ'],
  tottori: ['羽柴秀吉が、鳥取城を兵糧攻めで落とした', '城の出口をふさぎ、打って出る兵を止める'],
  takato: ['武田攻めで、仁科盛信の高遠城だけが最後まで戦った', '東の大手門へ寄せる組を守る'],
  tano: ['武田勝頼は天目山の麓、田野で最期を迎えた', '山道で追い詰める'],
  honnoji: ['明智光秀が背き、信長は本能寺に倒れた', '回廊を抜け、東の表門まで見回る'],
};
function loadingLore(bt) {
  const L = bt && LORE[bt.id];
  if (!L) return;
  const tip = $('tip');
  if (!tip) return;
  document.getElementById('ld-lore')?.remove();
  const el = document.createElement('div');
  el.id = 'ld-lore';
  el.innerHTML = `<p><small>史実</small>${esc(L[0])}</p><p><small>見どころ</small>${esc(L[1])}</p>`;
  tip.before(el);
  // 読み込みが終わって札が閉じたら消す（次の読み込みに残さない）
  const iv = setInterval(() => { const ld = $('loading'); if (!ld || ld.hidden) { clearInterval(iv); el.remove(); } }, 500);
  setTimeout(() => clearInterval(iv), 60000);
}

export function storyCard({ year, title, text, button = '次の場面へ進む', tips, aim, onBack, battleId, compact = false, boss }, onNext) {
  compact = true;
  let done = false;
  const go = () => { if (done) return; done = true; sfx('ui'); onNext(); loadingLore(bt); };
  const back = () => { if (done || !onBack) return; done = true; sfx('ui'); onBack(); };
  // 523：どこで・どの身分で戦うのかを添える（戦の名から場所を引く。G はゲームから借りる）
  const bt = BATTLES.find((b) => battleId ? b.id === battleId : b.name.startsWith(title) || title.startsWith(b.name));
  const G = window.__game && window.__game.G;
  const talks = scenarioKey() === 'oda' ? battleTalk(G, bt || BATTLES[G?.battle]) : [];
  // 戦ごとの合戦図屏風の一枚（城の戦で専用の絵がなければ城攻めの絵）
  const ik = illustKey(bt && bt.id, title);
  const who = G && G.lord ? `${esc(G.name)}　<b>${esc(G.lordTitle || '当主')}</b>・旗本 百人と、味方の全部の隊を率いる` : G && G.name ? `${esc(G.name)}　<b>${esc(RANKS[G.rank].name)}</b>${compact ? '' : RANKS[G.rank].squad ? `・組 ${RANKS[G.rank].squad}人を預かる` : bt && bt.id === 'moribe' ? '・組頭の見習い（五人を預かる）' : '・組はまだ無い'}` : '';
  // 背の低い画面（スマホ横）：本文は初めの一段だけ、続きは「もっと読む」に畳む。心得は一行、身分の行は小さく（一画面に収める）
  const short = innerHeight < 520;
  // 初めての戦の前は、操作の言い添えを出さない（操作は戦の中で一つずつ、やって覚える）
  const first = S.hints && !hintSeen('c_move');
  const order = tips ? monjoHtml({
    title: G && G.lord ? '出陣の覚え（戦の心得）' : '出陣の下知（戦の命令）',
    body: G && G.lord ? '諸勢を率い、この戦の務めを果たすべきこと。' : '出陣の儀、上役の下知に従い、この戦の務めを果たすべきこと。',
    plain: tips,
    date: `戦の時期：${String(year || '不明').replace(/（\d+）/g, '')}`,
    sender: G && G.lord ? `${G.name || '当主'}の覚え` : `${boss || bt && bt.boss || '上役'}より`,
    recipient: G && G.lord ? '諸将・旗本中' : `${G && G.name || '足軽衆'}殿`,
  }) : '';
  // 背の低い画面では、進む釦を心得の札より上に置く（下へ送らずに押せるように）
  const ROW = `<div class="row" style="justify-content:center">${onBack ? '<button class="btn" id="b-back">城下へ戻る</button>' : ''}<button class="btn primary" id="b-next">${esc(button)}</button></div>`;
  // 織田家編は画面の高さによらず要点をすぐ見せ、背景・心得・昇進の話は一つに畳む。
  const more = (compact || short ? text : text.slice(1)).map((t) => `<p>${esc(t)}</p>`).join('');
  const fold = compact || short;
  const mission = bt?.id === 'shigisan' ? '門を破る組を守る。門の正面の印で「使う」を押し続け、掛矢で門を打つ。' : bt?.id === 'honnoji' && !G?.lord ? '表門を見回り、上様の門を守る。退く下知に従い、門の外へ敵を追わない。' : tips || (text || []).find((line) => line.startsWith('任務：')) || LORE[bt?.id]?.[1] || '';
  const missionHtml = mission ? `<p class="st-mission" style="font-size:max(15px, calc(16px * var(--text-scale, 1)));line-height:1.7"><b>この戦の目的：</b>${esc(mission)}</p>` : '';
  const detail = more + (compact ? `${order}${aim ? `<p>${esc(aim)}</p>` : ''}` : '');
  const body = fold ? `${detail ? `<details class="st-more" style="margin:8px auto;max-width:30em"><summary style="min-height:44px;box-sizing:border-box;padding:10px 8px;cursor:pointer;color:var(--washi);font-size:max(15px, calc(15px * var(--text-scale, 1)));border:1px solid var(--line)">戦の背景と心得を読む</summary>${detail}</details>` : ''}` : text.map((t, i) => `<p style="animation-delay:${0.3 + i * 0.9}s">${esc(t)}</p>`).join('');
  const st = show(`<div class="story ${compact || RM() ? 'fast' : ''} ${ik ? 'has-ill' : ''} ${short ? 'short' : ''}"><div>
    ${illustHtml(ik)}
    <div class="year">${esc(year)}${!compact && bt && bt.place && !year.includes(bt.place.slice(0, 2)) ? `　・　${esc(bt.place)}` : ''}</div>
    <h2>${esc(title)}</h2>
    ${who ? `<div class="st-who">${who}</div>` : ''}
    ${aim && !compact ? `<div class="st-who" style="margin-top:-18px"><b>${esc(aim)}</b></div>` : ''}
    ${missionHtml}${body}
    ${S.hints ? `<p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">${isTouch ? '「構え」を押して敵の打ちに備える。' : '右クリックを押して敵の打ちに備える。'}自分の組か、近くの味方の列と肩を並べる。囲まれる前に、来た道から味方の後ろへ退く。矢玉は物陰で避ける。</p>` : ''}
    ${short ? ROW : ''}
    ${battleTalkHtml(talks)}
    ${compact ? '' : order}${tips && !compact && !short && !first ? `<div class="st-tip"><span>${isTouch ? '左上の「視点」を押す' : K('view') + 'を押す'}と一人称・三人称を替えられます${G && G.lord ? '／地図で軍配の図（全軍を動かす）・使番で近くの備へ命令' : ''}</span></div>` : ''}
    ${short ? '' : ROW}
    ${isTouch ? '' : `<div class="keyhint">決定キーかスペースで進む${onBack ? "・戻るキーで城下へ戻る" : ""}</div>`}
    ${compact || RM() ? '' : '<div class="st-skip">画面を押すと、残りの文をすぐ出します</div>'}
  </div></div>`, false, (e) => { if (e.target.closest?.('details')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } else if (e.key === 'Escape' && onBack) { e.preventDefault(); back(); } });
  if (onBack) $('b-back').onclick = back;
  // 左上の戻る：城下から来た時は城下へ、始めの戦ならタイトルへ
  topBack(onBack ? back : () => { if (done) return; done = true; window.__game && window.__game.title(); }, onBack ? '城下へ戻る' : 'タイトルへ');
  // 文が出るのを待たずに読めるように（ボタン以外を押すと全部出す）
  const box = st.querySelector('.story');
  box.addEventListener('click', (e) => { if (!e.target.closest('button')) box.classList.add('fast'); });
  mountIllust(st);
  mountMonjo(st);
  $('b-next').onclick = go;
  bindBattleTalk(st, talks, $('b-next'));
  $('b-next').focus({ preventScroll: true });
}

// 墨の帯の一枚（827）：「清洲へ戻る」など、場面の区切りを一瞬挟む。押すか Enter で飛ばせる
export function inkBand(big, small, next) {
  let done = false;
  const go = () => { if (done) return; done = true; next(); };
  const st = show(`<div class="story fast" style="display:flex;align-items:center;justify-content:center;min-height:100%"><div style="text-align:center;width:100%;padding:38px 0;background:linear-gradient(90deg, rgba(8,7,6,0), rgba(8,7,6,.92) 18%, rgba(8,7,6,.92) 82%, rgba(8,7,6,0))">
    <div class="year">${esc(small || '')}</div><h2 style="margin:6px 0 0">${esc(big)}</h2></div></div>`, false, (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); go(); } });
  st.querySelector('.story').addEventListener('click', go);
  setTimeout(go, RM() ? 700 : 1600);
}

// ---------------- 戦の後：分捕った馬を持ち帰るか ----------------
// p は戦のプレイヤー。敵の馬を分捕って、その馬がまだ手元（乗っている・そばで待っている）にあれば聞く。無ければそのまま next
// 分捕った馬がまだ手元にあれば、その馬の元の持ち主（無ければ null）
function spoilOf(G, p) {
  const team = p && p.u ? p.u.team : 0;
  let sp = null;
  if (p && p.spoilAwarded) {
    if (p.mounted && p.spoil && p.spoil.team !== team && p.horseHp > 0) sp = p.spoil;
    else for (const o of (p.rt && p.rt.army && p.rt.army.looseHorses) || []) if (o.kept && o.stats && o.stats.spoil && o.stats.spoil.team !== team) { sp = o.stats.spoil; break; }
  }
  return !sp || G.practice || G.lord ? null : { who: sp.who || '敵' };
}
// 801：分捕り馬は評価の中の一行で聞く（持ち帰るのが既定。置いていくも選べる）。keep(G, who, on)
export function spoilKeep(G, who, on) {
  if (on) {
    const h = { id: 'bundori', bond: 0, from: who };
    G._spoilPrev = G._spoilPrev || { horses: G.horses, bond: (G.horseBonds || {}).bundori, horse: G.horse };
    G.horses = [...new Set([...(G.horses || ['tsukikage']), 'bundori'])];
    G.horseBonds = { ...(G.horseBonds || {}), bundori: h };
    if (G.horse && G.horse.id === 'bundori') G.horse = h;
  } else if (G._spoilPrev) {
    const P = G._spoilPrev;
    G.horses = P.horses; G.horseBonds = { ...(G.horseBonds || {}) }; if (P.bond) G.horseBonds.bundori = P.bond; else delete G.horseBonds.bundori; G.horse = P.horse;
  }
}
export function spoilHorseInfo(G, p) { return spoilOf(G, p); }
export function spoilHorseScreen(G, p, next) {
  const sp0 = spoilOf(G, p);
  if (!sp0) { next(); return; }
  const sp = { who: sp0.who };
  const who = sp.who || '敵';
  const had = (G.horses || []).includes('bundori');
  const prev = had ? ((G.horse && G.horse.id === 'bundori' ? G.horse : (G.horseBonds || {}).bundori) || {}) : null;
  let fin = false;
  const done = (keep) => {
    if (fin) return;
    fin = true;
    sfx(keep ? 'neigh' : 'ui', 0.6);
    if (keep) {
      const h = { id: 'bundori', bond: 0, from: who };
      G.horses = [...new Set([...(G.horses || ['tsukikage']), 'bundori'])];
      G.horseBonds = { ...(G.horseBonds || {}), bundori: h };
      // いま分捕り馬に乗っているなら、新しい馬に替える
      if (G.horse && G.horse.id === 'bundori') G.horse = h;
    }
    next();
  };
  show(`<div class="wrap" style="max-width:640px">
    <div class="eyebrow">戦の後</div>
    <h2 style="font-family:var(--display);font-size:max(12px, calc(30px * var(--text-scale, 1)));letter-spacing:.1em;margin:8px 0">${esc(who)}の馬</h2>
    <p class="lead">戦で分捕った馬が、まだ手綱につながれている。持ち帰れば城下の馬屋に並び、乗り換えられる。</p>
    ${ladderStep(G) < 2 ? '<p class="note">馬屋で乗れるのは足軽大将から。それまでは馬屋で預かる。</p>' : ''}
    ${had ? `<p class="note">前に分捕った馬（${esc(prev.name || prev.from || '分捕り馬')}）と入れ替わる。</p>` : ''}
    <div class="row" style="margin-top:18px;gap:12px"><button class="btn" id="sp-leave">置いていく</button><div id="sp-confirm"></div><button class="btn primary" id="sp-keep">持ち帰る</button></div>
  </div>`, false, () => { /* Esc では取り消せない方を決めない（990） */ });
  $('sp-keep').onclick = () => had ? confirmBox($('sp-confirm'), `前の馬（${prev.name || prev.from || '分捕り馬'}）と入れ替えます。`, '入れ替えて持ち帰る', () => done(true), { sub:'前の馬と育てた絆は戻せません。' }) : done(true);
  $('sp-leave').onclick = () => confirmBox($('sp-confirm'), `${who}の馬を置いていきます。`, '馬を置いて進む', () => done(false));
  $('sp-keep').focus({ preventScroll: true });
}

// ---------------- 戦功評価 ----------------
// 四つの区分：武（自ら戦う）・任（任務）・将（組の指揮）・忠（下知を守る）。ref はその区分で「よく働いた」と言える目安
const CAT_INFO = {
  武: { long: '自ら戦う', ref: 50 },
  任: { long: '任務を果たす', ref: 55 },
  将: { long: '組を率いる', ref: 60 },
  忠: { long: '下知を守る', ref: 10 },
};
// 人間関係の鍵から名へ
const REL_NAME = { ...ODA_REL_NAME, okudaira: '奥平信昌', sakai: '酒井忠次', okubo: '大久保忠世', yashichi: '弥七', genpachi: '源八', osawa: '大沢勘兵衛', tokichiro: '木下藤吉郎', ieyasu: '徳川家康' };
const REL_KEYS = [['trust', '信頼'], ['like', '好感'], ['respect', '尊敬'], ['wary', '警戒']];
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
// 区分ごとに「良かったこと」と「足りなかったこと」を一言ずつ
function catNotes(c, r, hadSquad) {
  const L = r.lines.filter((l) => (l.cat || '任') === c);
  const one = (lb) => L.find((l) => l.label === lb);
  const num = (d) => String(d || '').replace(/（.*$/, '');
  const st = r.stats || {};
  const good = [], lack = [], neutral = [];
  if (c === '武') {
    const bs = L.filter((l) => l.label === '敵武将撃破');
    if (bs.length) good.push(`敵将 ${bs.map((b) => b.detail).join('・')} を討ち取る`);
    const sm = one('敵侍撃破'), as = one('敵足軽撃破');
    if (sm) good.push(`侍を${num(sm.detail)}討つ`);
    if (as) good.push(`足軽を${num(as.detail)}討つ`);
    if ((st.parries || 0) >= 5) good.push(`受け流し ${st.parries}回`);
    if (as && /上限/.test(as.detail)) lack.push('足軽の討ち取りは上限に達した');
    else if (!bs.length && !sm && !as) lack.push('討ち取りの記録なし');
    if (st.parries === 0) lack.push('受け流しの記録なし（敵の打ち込み直前に構える）');
  } else if (c === '任') {
    if (one('任務達成')) good.push('任務を果たした');
    for (const l of L.filter((x) => x.label === '副任務達成')) good.push(`副任務：${l.detail}`);
    if (one('味方救援')) good.push('囲まれた味方を救った');
    if (one('伝令成功')) good.push('伝令を届けた');
    if (one('拠点制圧')) good.push('拠点を落とした');
    for (const l of L.filter((x) => x.sp)) good.push(l.label);
    if (one('任務失敗')) lack.push('任務を果たせなかった');

  } else if (c === '将') {
    if (!hadSquad) return { good, lack, neutral, locked: '組を預かると、ここに組の働きが記される' };
    const fl = one('側面攻撃成功'), sv = L.find((x) => /部下生存率/.test(x.label)), sk = one('部下の撃破');
    if (fl) good.push(`横槍 ${num(fl.detail)}`);
    if (sv && sv.pts > 0) good.push(`組の${String(sv.detail).replace(/人.*$/, '人')}が生き残る`);
    if (sk) good.push(`組で${num(sk.detail)}を討つ`);
    if (sv && sv.pts < 0) lack.push(`組の半ばより多くを失った（${num(sv.detail)}）`);
    else if (sv && sv.pts === 0) neutral.push(`組の生き残り ${num(sv.detail)}（加点・減点なし）`);
    if (!fl) lack.push('横槍の記録なし（敵の横へ回り込む）');
  } else {
    if (one('下知を守り通した')) good.push('下知を守り通した');
    for (const l of L.filter((x) => x.label === '命令違反')) lack.push(`下知に背く：${l.detail}`);
    const pu = L.filter((x) => x.label === '勝手な追撃').length;
    if (pu) lack.push(`勝手な追撃 ${pu}回`);
    if (!L.length) neutral.push('下知を守った加点・背いた減点の記録なし');
  }
  const gains = L.filter((l) => l.pts > 0).sort((a, b) => b.pts - a.pts);
  const losses = L.filter((l) => l.pts < 0).sort((a, b) => a.pts - b.pts);
  if (gains.length) good.splice(0, good.length, ...gains.map((l) => `${narrate(l)}（＋${l.pts}点）`));
  if (losses.length) {
    const hints = lack.filter((text) => /記録なし|上限/.test(text));
    lack.splice(0, lack.length, ...losses.map((l) => `${narrate(l)}（${l.pts}点）`), ...hints);
  }
  return { good, lack, neutral };
}
function catMark(c, sum) {
  if (sum.minus < 0 && sum.plus + sum.minus <= 0) return ['欠', 'ng'];
  const k = sum.plus / CAT_INFO[c].ref;
  return k >= 0.8 ? ['上', 'top'] : k >= 0.4 ? ['中', 'mid'] : k > 0 ? ['下', 'low'] : ['—', 'none'];
}
const EVAL_CSS = `<style>
  .ev2 .grade .gw { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .1em; font-family: inherit; margin-top: 2px; }
  .ev2 .ev-gtab { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .ev2 .ev-gtab span { border: 1px solid var(--line); padding: 2px 8px; font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); display: inline-flex; gap: 6px; align-items: baseline; }
  .ev2 .ev-gtab span.on { border-color: var(--kin); color: var(--washi); }
  .ev2 .ev-gtab small { font-size: max(13px, calc(13px * var(--text-scale, 1))); } .ev2 .ev-gtab b { font-weight: 500; font-variant-numeric: tabular-nums; }
  .ev2 .ev-fail { border: 1px solid #b85a44; border-left: 4px solid #e38a74; background: rgba(192,69,46,.08); padding: 12px 16px; margin: 12px 0; }
  .ev2 .ev-fail > b { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .3em; color: #e38a74; }
  .ev2 .ev-fail p { margin: 6px 0 0; font-size: max(12px, calc(15px * var(--text-scale, 1))); } .ev2 .ev-fail p span { color: var(--washi-dim); margin-right: 6px; }
  .ev2 .ev-fail .adv { font-size: max(12px, calc(13.5px * var(--text-scale, 1))); color: var(--washi); }
  .ev2 .ev-purse { color: var(--kin); vertical-align: middle; margin-right: 6px; }
  .ev2 .ev-eiraku { display: block; font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); margin-top: 2px; }
  .ev2 .ev-sq { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(15em, 1fr)); gap: 2px 14px; font-size: max(12px, calc(13px * var(--text-scale, 1))); }
  .ev2 .ev-sq li.dead { background: #0b0a08; color: var(--washi); padding: 0 6px; outline: 1px solid var(--washi-faint); outline-offset: -2px; }
  /* 下の釦の帯（ev-actbar）はいつも見えるようにしつつ、巻物など中身の最後の段に重ならないよう、
     .eval を画面の高さぴったりの入れ物にし、帯を除く中身（.ev-body）だけを縦に流す
     （帯は入れ物の最後に並ぶだけの兵（flex）なので、中身が短くても画面下に貼りつかず重ならない） */
  .eval.ev2 { max-width: 760px; padding-bottom: 0; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; }
  .ev2 .ev-body { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; min-height: 0; }
  .ev2 .ev-bigs { display: grid; gap: 8px; margin: 4px 0 14px; }
  .ev2 .ev-big { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 12px 18px; border: 1px solid var(--kin); background: linear-gradient(100deg, rgba(194,162,90,.18), rgba(194,162,90,.02) 70%); opacity: 0; animation: evPop .55s cubic-bezier(.2,.9,.3,1.2) forwards; }
  .ev2 .ev-big small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .3em; color: var(--kin); }
  .ev2 .ev-big b { font-family: var(--display); font-size: max(12px, calc(30px * var(--text-scale, 1))); letter-spacing: .1em; }
  .ev2 .ev-big .p { font-family: var(--display); font-size: max(12px, calc(34px * var(--text-scale, 1))); color: var(--kin); font-variant-numeric: tabular-nums; }
  .ev2 .ev-big .sb { display: grid; place-items: center; width: 46px; height: 46px; border: 2px solid var(--shu); color: var(--shu); font-family: var(--display); font-weight: 800; font-size: max(12px, calc(24px * var(--text-scale, 1))); transform: rotate(-5deg); }
  .ev2 .evcs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  @media (max-width: 620px) { .ev2 .evcs { grid-template-columns: 1fr; } }
  .ev2 .evc { border: 1px solid var(--line); border-left-width: 3px; padding: 10px 14px 12px; background: rgba(0,0,0,.18); opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .evc.top { border-left-color: var(--kin); }
  .ev2 .evc.mid { border-left-color: var(--washi-dim); }
  .ev2 .evc.low, .ev2 .evc.none { border-left-color: var(--washi-faint); }
  .ev2 .evc.ng { border-left-color: var(--shu); background: rgba(192,69,46,.06); }
  .ev2 .evc-h { display: flex; align-items: baseline; gap: 8px; }
  .ev2 .evc-h .k { font-family: var(--display); font-size: max(12px, calc(26px * var(--text-scale, 1))); font-weight: 800; line-height: 1; }
  .ev2 .evc.top .evc-h .k { color: var(--kin); }
  .ev2 .evc.ng .evc-h .k { color: var(--shu-text); }
  .ev2 .evc-h small { font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: .1em; }
  .ev2 .evc-h .evmk { margin-left: auto; font-size: max(13px, calc(13px * var(--text-scale, 1))); letter-spacing: .1em; color: var(--washi-dim); border: 1px solid var(--line); padding: 1px 7px; }
  .ev2 .evc.top .evmk { color: var(--kin); border-color: var(--kin); }
  .ev2 .evc.ng .evmk { color: var(--shu-text); border-color: var(--shu); }
  .ev2 .evc-h .p { font-family: var(--display); font-size: max(12px, calc(22px * var(--text-scale, 1))); font-variant-numeric: tabular-nums; min-width: 2.6em; text-align: right; }
  .ev2 .evc.ng .evc-h .p { color: var(--shu-text); }
  .ev2 .evc-bar { display: block; height: 4px; background: var(--sumi-3); margin: 8px 0 8px; position: relative; overflow: hidden; }
  .ev2 .evc-bar b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .ev2 .evc-bar s { position: absolute; top: 0; bottom: 0; right: 0; background: var(--shu); }
  .ev2 .evc p { margin: 3px 0 0; font-size: max(12px, calc(13.5px * var(--text-scale, 1))); line-height: 1.55; display: grid; grid-template-columns: 3.4em 1fr; gap: 6px; }
  .ev2 .evc p em { font-style: normal; font-size: max(13px, calc(13px * var(--text-scale, 1))); letter-spacing: .1em; text-align: center; padding: 1px 0; align-self: start; margin-top: 2px; }
  .ev2 .evc p.g em { color: var(--kin); border: 1px solid rgba(194,162,90,.55); }
  .ev2 .evc p.l { color: var(--washi-dim); }
  .ev2 .evc p.l em { color: #e38a74; border: 1px solid rgba(192,69,46,.55); }
  .ev2 .evc p.lk { color: var(--washi-faint); grid-template-columns: 1fr; }
  .ev2 .ev-sum { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 10px 20px; border-top: 1px solid var(--line); padding-top: 12px; opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .ev-sum .verdict { margin: 0; }
  .ev2 .ev-sum .t { text-align: right; }
  .ev2 .ev-sum .t small { display: block; font-size: max(13px, calc(13px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--washi-dim); }
  .ev2 .ev-sum strong { font-family: var(--display); font-size: max(12px, calc(56px * var(--text-scale, 1))); line-height: 1; color: var(--kin); font-variant-numeric: tabular-nums; }
  .ev2 .ev-sum em { font-style: normal; font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-faint); display: block; }
  .ev2 .ev-rel { font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); margin: 2px 0 10px; }
  .ev2 .ev-rel b { color: var(--washi); font-weight: 500; margin-right: 6px; }
  .ev2 .ev-rel span { margin-right: 12px; white-space: nowrap; }
  .ev2 .ev-rel .up { color: var(--kin); } .ev2 .ev-rel .dn { color: #e38a74; }
  .ev2 details.ev-detail { margin: 18px 0; border-top: 1px solid var(--line); }
  .ev2 details.ev-detail summary { cursor: pointer; padding: 12px 0; font-size: max(12px, calc(13.5px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: .1em; }
  .ev2 details.ev-detail summary:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
  .ev2 .ledger .ln { font-size: max(12px, calc(14px * var(--text-scale, 1))); padding: 6px 0; animation: none; opacity: 1; }
  .ev2 .ledger .ln .p { font-size: max(12px, calc(16px * var(--text-scale, 1))); }
  .ev2 .ledger .ln.big { color: var(--kin); }
  .ev2 .ev-actbar { flex: 0 0 auto; margin: 0 -16px calc(-1 * env(safe-area-inset-bottom, 0px)); padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(180deg, rgba(20,18,15,0), rgba(20,18,15,.94) 30%); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .ev-gnote { clear: both; margin: 4px 0 0; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
  .ev2 .ev-conds { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .ev2 .ev-conds span { border: 1px solid var(--line); padding: 6px 10px; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); display: grid; grid-template-columns: auto 1fr; column-gap: 8px; }
  .ev2 .ev-conds span b { grid-column: 2; font-weight: 500; color: var(--washi); font-variant-numeric: tabular-nums; }
  .ev2 .ev-conds em { font-style: normal; grid-row: span 2; align-self: center; font-size: max(12px, calc(18px * var(--text-scale, 1))); }
  .ev2 .ev-conds .ok em { color: var(--kin); } .ev2 .ev-conds .ng { border-color: rgba(192,69,46,.6); } .ev2 .ev-conds .ng em { color: #e38a74; }
  .ev2 .ev-prog i { height: 10px; }
  .ev2 .ev-prog .ev-gain { color: var(--kin); font-weight: 500; }
  .ev2 .ev-actbar .skiphint { margin: 0 0 0 auto; font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .eval.fast .evc, .eval.fast .ev-big, .eval.fast .ev-sum, .eval.fast .ev-more-wrap, .eval.fast .ev-actbar { animation-delay: 0s !important; animation-duration: .01s !important; }
  @keyframes evPop { 0% { opacity: 0; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
  /* 絵巻：和紙に墨で書いた一枚。両端に軸、上に墨絵の山と旗。字は少なく */
  .ev2 .ek { position: relative; margin: 0 14px 14px; padding: 0; color: #1d1a16; background:
      radial-gradient(ellipse at 20% 30%, rgba(160,130,80,.10), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(150,120,70,.12), transparent 55%),
      repeating-linear-gradient(97deg, rgba(120,95,60,.05) 0 2px, transparent 2px 9px), #ece2cc;
    box-shadow: 0 10px 30px rgba(0,0,0,.55), inset 0 0 40px rgba(120,90,50,.25); animation: ekOpen .9s cubic-bezier(.3,.8,.3,1) both; }
  .ev2 .ek::before, .ev2 .ek::after { content: ''; position: absolute; top: -8px; bottom: -8px; width: 14px; background: linear-gradient(90deg, #2a1c12, #5a3e26 45%, #2a1c12); border-radius: 3px; box-shadow: 0 0 0 1px #0e0906; }
  .ev2 .ek::before { left: -14px; } .ev2 .ek::after { right: -14px; }
  .ev2 .ek-sky { display: block; width: 100%; height: 64px; }
  .ev2 .ek-in { padding: 0 22px 16px; }
  .ev2 .ek-h { display: flex; align-items: center; gap: 14px; margin-top: -30px; position: relative; }
  .ev2 .ek-h h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: max(12px, calc(30px * var(--text-scale, 1))); letter-spacing: .16em; color: #14110d; }
  .ev2 .ek-h small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .3em; color: #5a4a36; }
  .ev2 .ek-seal { flex: 0 0 auto; display: grid; place-items: center; width: 56px; height: 56px; background: #b23a26; color: #fff4e6; font-family: var(--display); font-weight: 800; font-size: max(12px, calc(22px * var(--text-scale, 1))); line-height: 1.05; text-align: center; transform: rotate(-4deg); box-shadow: inset 0 0 0 3px #b23a26, inset 0 0 0 4px rgba(255,244,230,.8); }
  .ev2 .ek-seal small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: 0; color: #fff4e6; }
  .ev2 .ek-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-top: 12px; border-top: 2px solid #1d1a16; }
  .ev2 .ek-c small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); line-height: 1.5; color: #5a4a36; }
  .ev2 .ek-c .ek-change { font-size: max(12px, calc(15px * var(--text-scale, 1))); font-weight: 600; }
  .ev2 .ev-ach-notices .zk-toasts { position: static; max-width: none; margin: 8px 0; }
  .ev2 .ev-ach-notices .zk-toasts:empty { margin: 0; }
  .ev2 .ev-ach-notices .zk-toast { width: auto; box-sizing: border-box; }
  .ev2 .ek-c { padding: 8px 14px 4px; border-left: 1px solid rgba(29,26,22,.35); min-width: 0; }
  .ev2 .ek-c:first-child { border-left: 0; padding-left: 2px; }
  .ev2 .ek-c.wide { grid-column: 1 / -1; border-left: 0; padding-left: 2px; }
  .ev2 .ek-c > b { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .1em; color: #5a4a36; font-weight: 600; margin-bottom: 4px; }
  .ev2 .ek-c p { margin: 0; font-family: var(--display); font-size: max(12px, calc(17px * var(--text-scale, 1))); line-height: 1.45; color: #14110d; overflow-wrap: anywhere; }
  .ev2 .ek-c p.none { font-family: inherit; font-size: max(12px, calc(14px * var(--text-scale, 1))); color: #5a4a36; }
  .ev2 .ek-c ul { list-style: none; margin: 0; padding: 0; font-size: max(12px, calc(14.5px * var(--text-scale, 1))); line-height: 1.55; color: #14110d; }
  .ev2 .ek-c ul li::before { content: '一、'; color: #5a4a36; }
  .ev2 .ek-men { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .ev2 .ek-men i { width: 9px; height: 13px; border-radius: 4px 4px 1px 1px; background: #1d1a16; }
  .ev2 .ek-men i.d { background: none; box-shadow: inset 0 0 0 1.5px #8a3a26; position: relative; }
  .ev2 .ek-men i.d::after { content: ''; position: absolute; left: 50%; top: -1px; bottom: -1px; width: 1.5px; background: #8a3a26; transform: rotate(35deg); }
  .ev2 .ek-foot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px 18px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(29,26,22,.35); }
  .ev2 .ek-nextmini { display: none; margin: 4px 0 0; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: #3a2f22; gap: 10px; flex-wrap: wrap; }
  .ev2 .ek-nextmini b { font-family: var(--display); }
  .ev2 .ek-nextmini .pm { color: #8a2f1e; font-weight: 600; }
  @media (max-height: 500px) { .ev2 .ek-nextmini { display: flex; } }
  .ev2 .ek-next { margin: 8px 0 0; font-size: max(12px, calc(14px * var(--text-scale, 1))); color: #3a2f22; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .ev2 .ek-next small { font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .2em; color: #fff4e6; background: #1d1a16; padding: 1px 6px; }
  .ev2 .ek-next b { font-family: var(--display); font-size: max(12px, calc(16px * var(--text-scale, 1))); color: #14110d; }
  .ev2 .ek-foot q { font-size: max(12px, calc(14px * var(--text-scale, 1))); color: #3a2f22; quotes: '「' '」'; }
  .ev2 .ek-foot q b { font-weight: 600; margin-right: 4px; }
  .ev2 .ek-foot .ek-t { white-space: nowrap; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: #5a4a36; letter-spacing: .1em; }
  .ev2 .ek-foot .ek-t strong { font-family: var(--display); font-size: max(12px, calc(34px * var(--text-scale, 1))); color: #14110d; margin: 0 4px; font-variant-numeric: tabular-nums; letter-spacing: 0; }
  .ev2 .ek-realm { margin: 6px 0 0; padding: 6px 8px; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: #3a2f22; background: rgba(194,162,90,.22); border-left: 3px solid #8a6a2a; border-radius: 2px; }
  .ev2 .ek-realm b { font-weight: 600; }
  .ev2 details.ek-more { margin: 4px 0 0; }
  .ev2 details.ek-more > summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font-size: max(12px, calc(14px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: .1em; border-top: 1px solid var(--line); }
  .ev2 details.ek-more > summary:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
  @keyframes ekOpen { from { clip-path: inset(0 50% 0 50%); } to { clip-path: inset(-12px -20px -12px -20px); } }
  .eval.fast .ek { animation-duration: .01s !important; }
  body.rm .ev2 .ek { animation: none; }
  @media (prefers-reduced-motion: reduce) { .ev2 .ek { animation: none; } }
  /* 携帯の横向き：絵巻を低く。四つの欄は並べたまま、字を少し小さく */
  @media (max-height: 500px) {
    /* #screen.has-back が既に上へ 58px 空けている。ここでは .ev-body の中身だけ下げ、
       下の釦の帯の分の高さ（.eval の外枠）を削らない（削ると巻物の下の段が切れて隠れる） */
    .ev2 .ev-body { padding-top: 8px; padding-bottom: 28px; -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 30px), transparent); mask-image: linear-gradient(180deg, #000 calc(100% - 30px), transparent); }
    .ev2 .ek-sky { height: 40px; }
    .ev2 .ek-in { padding: 0 16px 10px; }
    .ev2 .ek-h { margin-top: -22px; gap: 10px; }
    .ev2 .ek-h h2 { font-size: max(12px, calc(22px * var(--text-scale, 1))); }
    .ev2 .ek-seal { width: 44px; height: 44px; font-size: max(12px, calc(17px * var(--text-scale, 1))); }
    .ev2 .ek-cols { margin-top: 8px; }
    .ev2 .ek-c { padding: 6px 10px 2px; }
    .ev2 .ek-c p { font-size: max(12px, calc(15px * var(--text-scale, 1))); } .ev2 .ek-c ul { font-size: max(12px, calc(13px * var(--text-scale, 1))); line-height: 1.45; }
    .ev2 .ek-foot { margin-top: 6px; padding-top: 4px; } .ev2 .ek-foot .ek-t strong { font-size: max(12px, calc(26px * var(--text-scale, 1))); }
    .ev2 .ek-foot q { font-size: max(12px, calc(13px * var(--text-scale, 1))); }
    .ev2 .ev-actbar { padding: 8px 16px 10px; } .ev2 .ev-actbar .skiphint { display: none; }
  }
  @media (max-width: 560px) { .ev2 .ek-cols { grid-template-columns: 1fr 1fr; } .ev2 .ek-c:nth-child(odd) { border-left: 0; padding-left: 2px; } .ev2 .ek-c:nth-child(n+3) { border-top: 1px solid rgba(29,26,22,.35); } }
</style>`;
// 絵巻の上の墨絵（遠い山と、並ぶ旗）。一度描いた物を使い回す
const EK_SKY = `<svg class="ek-sky" viewBox="0 0 600 64" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <path d="M0 50 C 60 30, 110 34, 160 22 C 210 12, 250 30, 300 26 C 360 20, 400 8, 450 16 C 500 24, 540 18, 600 28 V64 H0 Z" fill="rgba(40,34,26,.16)"/>
  <path d="M0 58 C 80 44, 140 50, 220 40 C 300 30, 360 46, 440 38 C 510 32, 560 42, 600 40 V64 H0 Z" fill="rgba(40,34,26,.26)"/>
  ${Array.from({ length: 14 }, (_, i) => { const x = 330 + i * 19 + (i % 3) * 3, y = 46 - (i % 2) * 3; return `<path d="M${x} ${y} V${y - 22}" stroke="rgba(29,26,22,.55)" stroke-width="1.2"/><rect x="${x}" y="${y - 22}" width="6" height="12" fill="rgba(29,26,22,.45)"/>`; }).join('')}
  <circle cx="90" cy="18" r="11" fill="rgba(178,58,38,.55)"/>
</svg>`;
// 数を漢数字で（一〜九十九）
const kanNum = (n) => { n = Math.round(n); if (n <= 0 || n >= 100) return String(n); const K = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']; const t = Math.floor(n / 10), o = n % 10; return (t ? (t > 1 ? K[t] : '') + '十' : '') + K[o]; };
// 銭を「三貫二百文」のように
const kanZeni = (kan) => { const m = Math.round((kan || 0) * 1000); const k = Math.floor(m / 1000), r = m % 1000; const h = Math.floor(r / 100), rest = r % 100; const mon = (h ? `${h > 1 ? kanNum(h) : ''}百` : '') + (rest ? kanNum(rest) : ''); return (k ? `${k < 100 ? kanNum(k) : k}貫` : '') + (mon ? `${mon}文` : k ? '' : '零'); };
// 戦功の項目を、行いを語る言葉にする（809。数字の名は小さく添える）
function narrate(l) {
  const n = parseInt(String(l.detail || '').match(/\d+/) || '0', 10);
  const T = {
    敵足軽撃破: () => `足軽を${kanNum(n)}人突き伏せた`, 敵侍撃破: () => `侍を${kanNum(n)}人討った`, 敵武将撃破: () => `${l.detail}を討ち取った`,
    首級獲得: () => `首を${kanNum(n)}つ挙げた`, 伝令成功: () => '伝令を届けた', 味方救援: () => '囲まれた味方を救った', 指示地点の確保: () => '示された場所を押さえた',
    拠点制圧: () => '拠点を取った', 敵旗奪取: () => '敵の旗を奪った', 副任務達成: () => l.detail || '副の務めを果たした', 任務達成: () => '任務を果たした', 任務失敗: () => '任務を果たせなかった',
    部下の撃破: () => `組の者が${kanNum(n)}人を討った`, 側面攻撃成功: () => `敵の横腹を${kanNum(n)}度突いた`, 部下生存率: () => `組の${l.detail}が生き残った`,
    '部下生存率50%未満': () => '組の半ばより多くを失った', 命令違反: () => `下知に背いた${l.detail ? `（${l.detail}）` : ''}`, 勝手な追撃: () => '下知なく追い討ちをかけた', 下知を守り通した: () => '下知を最後まで守り通した',
  };
  return T[l.label] ? T[l.label]() : l.label;
}
const GRADE_WORD = { 甲上: '上々', 甲: 'よし', 乙: 'まずまず', 丙: 'しくじり' };
// 読み上げは三秒ほど。飛ばしても支給済みの褒美と日誌は失わない。
export function ronkoScreen(G, r, onNext) {
  let done = false, received = false, timer;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onNext();
  };
  const receive = () => {
    if (done) return;
    if (received) { finish(); return; }
    received = true;
    clearTimeout(timer);
    $('rk-deeds').hidden = true;
    $('rk-gifts').hidden = false;
    $('rk-next').textContent = '評定へ進む';
  };
  const screen = show(ronkoHtml(G, r), false, (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); receive(); }
  });
  drawRankup($('rk-room'));
  $('rk-skip').onclick = finish;
  $('rk-next').onclick = receive;
  $('rk-next').focus({ preventScroll: true });
  if (RM()) receive();
  else timer = setTimeout(() => { if (screen.querySelector('#rk-gifts')) receive(); }, 2800);
}

let evalCategoriesExplained = false;
export function evalScreen(G, r, actions) {
  const previousSpoil = G._spoilPrev?.bond || G.horseBonds?.bundori || (G.horse?.id === 'bundori' ? G.horse : null);
  const spoilReplace = !!(r.spoilHorse && (G.horses || []).includes('bundori') && !G._spoilPrev);
  const categoryHelp = !evalCategoriesExplained;
  evalCategoriesExplained = true;
  const talks = scenarioKey() === 'oda' ? battleTalk(G, BATTLES[r.battleIndex], r) : [];
  const squadLine = r.lines.find((l) => /部下生存率/.test(l.label));
  const hadSquad = r.stats?.squad != null ? r.stats.squad > 0 : squadLine ? true : r.rankBefore >= 1;
  const t0 = 0.3;
  // 大事な物（敵将撃破・特別戦功）だけを大きく
  const bigs = r.lines.filter((l) => l.big);
  const bigHtml = bigs.map((l, i) => `<div class="ev-big" style="animation-delay:${t0 + i * 0.35}s"><span class="sb">${l.label === '敵武将撃破' ? '討' : '功'}</span><div><small>${l.label === '敵武将撃破' ? '敵 将 撃 破' : '特 別 戦 功'}</small><b>${esc(l.label === '敵武将撃破' ? l.detail : l.label)}</b></div><span class="p">+${l.pts}</span></div>`).join('');
  const t1 = t0 + bigs.length * 0.35 + (bigs.length ? 0.3 : 0);
  // 四つの札
  const cats = r.cats || {};
  const cards = ['武', '任', '将', '忠'].map((c, i) => {
    const sum = cats[c] || { pts: 0, plus: 0, minus: 0 };
    const nt = catNotes(c, r, hadSquad);
    const [mk, cls] = nt.locked ? ['—', 'none'] : catMark(c, sum);
    const ref = CAT_INFO[c].ref;
    const w = Math.min(100, (sum.plus / ref) * 100), wm = Math.min(100, (-sum.minus / ref) * 100);
    const body = nt.locked ? `<p class="lk">${esc(nt.locked)}</p>`
      : (nt.good.slice(0, 1).map((g) => `<p class="g"><em>良し</em><span>${esc(g)}</span></p>`).join('') + nt.lack.slice(0, 1).map((g) => `<p class="l"><em>足りぬ</em><span>${esc(g)}</span></p>`).join('') + nt.neutral.map((g) => `<p class="lk">${esc(g)}</p>`).join('')) || '<p class="lk">この区分の加点・減点なし</p>';
    return `<div class="evc ${cls}" role="group" style="animation-delay:${t1 + i * 0.22}s" aria-label="${c}：${CAT_INFO[c].long}">
      <div class="evc-h"><span class="k">${c}</span><small>${CAT_INFO[c].long}</small><span class="evmk">${mk}</span><span class="p">${nt.locked ? '' : sgn(sum.pts)}</span></div>
      <i class="evc-bar"><b style="width:${w}%"></b>${wm ? `<s style="width:${wm}%"></s>` : ''}</i><small>棒の端は加点・減点それぞれ${ref}点の目安。実際は${sgn(sum.pts)}点。端を超えた点も数えます。</small>${body}${nt.good.length > 1 || nt.lack.length > 1 ? `<details><summary style="min-height:44px;cursor:pointer">ほかの評価${Math.max(0, nt.good.length - 1) + Math.max(0, nt.lack.length - 1)}件を見る</summary>${nt.good.slice(1).map((g) => `<p class="g"><em>良し</em><span>${esc(g)}</span></p>`).join('')}${nt.lack.slice(1).map((g) => `<p class="l"><em>足りぬ</em><span>${esc(g)}</span></p>`).join('')}</details>` : ''}${c === '武' && r.stats?.parries === 0 ? '<details><summary style="min-height:44px;cursor:pointer">受け流しの方法を見る</summary><p>敵の打ち込みの直前に、構えを押します。</p><p>' + (isTouch ? '右の「構え」の丸を押します。' : '右クリックで構えます。') + '矢と鉄砲は構えで防げません。</p></details>' : ''}</div>`;
  }).join('');
  // 絵巻が開いたら、すぐ戦功を数え上げる（細かな札は「くわしく見る」の中）
  const delay = Math.max(0.9, t1 * 0.5);
  // 内訳（区分ごと。普段は畳んでおく）
  const ledger = ['武', '任', '将', '忠'].map((c) => {
    const ls = r.lines.filter((l) => (l.cat || '任') === c);
    if (!ls.length) return '';
    return `<div class="ev-cat"><i class="seal">${c}</i>${CAT_INFO[c].long}</div>` + ls.map((l) => `<div class="ln ${l.pts < 0 ? 'neg' : ''} ${l.big ? 'big' : ''} ${l.sp ? 'sp' : ''}"><span>${esc(narrate(l))}</span><span class="d">${esc(l.label)}${l.detail && narrate(l) !== l.detail ? `・${esc(l.detail)}` : ''}</span><span class="p">${l.pts > 0 ? '+' : ''}${l.pts}</span></div>`).join('');
  }).join('');
  const next = RANKS[G.rank + 1];
  const prevMerit = r.meritAfter - r.total;
  const progTarget = next ? next.min : r.meritAfter;
  // 526：昇進の四つの条件を、満たしたか一つずつ見せる
  const nx = RANKS[r.rankBefore + 1];
  const nViol = r.lines.filter((l) => l.label === '命令違反').length;
  const conds = !r.promoted && nx && r.reason ? [
    [r.meritAfter >= nx.min, '累計戦功', `${r.meritAfter} ／ ${nx.min}`],
    [r.superiorAfter >= 50, '上官の評価', `${r.superiorAfter} ／ 50`],
    [!!r.mainDone, '任務', r.mainDone ? '果たした' : '果たせず'],
    [nViol <= 2, '命令違反', `${nViol}回 ／ 2回まで`],
  ] : null;
  // 昇進の場面を先に見せた時（殿で遊ぶ時のほか）は、評価の中は一行だけにする
  const promoSeen = r.promoted && !G.lord;
  // この戦で上がれる身分の上限にいる時は、推挙の言葉ではなく「この戦ではここまで」と言う（807）
  const atCeil = !r.promoted && !r.reason && nx;
  const bossName = (r.bossLine && r.bossLine[0]) || '上役';
  const recLine = atCeil ? `${bossName}「この戦で上がれるのはここまでじゃ。次の戦の働きを見ておる」` : r.recommend;
  // 昇進しなかった時の次の目当て（825）
  const aim = !r.promoted && nx && r.meritAfter < nx.min ? `「${nx.name}」の戦功条件まで あと ${nx.min - r.meritAfter}（任務・上官の評価も必要）` : '';
  const promo = promoSeen
    ? `<div class="promo" style="animation-delay:${delay + 0.6}s"><div class="unl"><b>${esc(RANKS[r.rankBefore].name)} → ${esc(RANKS[r.rankAfter].name)}</b>　に取り立てられた${r.granted.length ? `（賜った物は城下の武具屋で着けている）` : ''}</div></div>`
    : r.promoted
    ? `<div class="promo" style="animation-delay:${delay + 0.6}s">
        <div class="lbl">昇　進</div>
        <div class="rk">${esc(RANKS[r.rankBefore].name)}<span class="arrow">→</span>${esc(RANKS[r.rankAfter].name)}</div>
        <div class="unl">できるようになった事：<b>${esc(r.unlock)}</b></div>
        ${r.granted.length ? `<div class="unl" style="margin-top:6px">殿から賜った物：${r.granted.map((id) => esc(ITEMS[id].name)).join('・')}（城下の武具屋で着けている）</div>` : ''}
        ${r.recommend ? `<div class="unl" style="margin-top:6px;color:var(--washi-dim)">${esc(r.recommend)}</div>` : ''}
      </div>`
    : `<div class="promo no" style="animation-delay:${delay + 0.6}s">
        <div class="lbl">${atCeil ? (/候補$/.test(nx.name) ? `${esc(nx.name.replace(/候補$/, ''))}に取り立てられる見込み（次の戦でも条件が必要）` : `${esc(nx.name)}の候補に名が挙がった`) : '昇進なし'}</div>
        <div class="unl" style="margin-top:8px">${atCeil ? '次の戦でも任務・戦功・上官の評価の条件を満たす必要がある。昇進はまだ決まっていない' : esc(r.reason || 'この戦で上がれる身分の上限に達している')}</div>
        ${conds ? `<div class="ev-conds" aria-label="${esc(nx.name)}への条件">${conds.map(([ok, a, b]) => `<span class="${ok ? 'ok' : 'ng'}"><em>${ok ? '○' : '×'}</em>${a}<b>${esc(b)}</b></span>`).join('')}</div>` : ''}
        ${aim ? `<div class="unl" style="margin-top:6px">次の目当て：<b>${esc(aim)}</b></div>` : ''}
        ${recLine ? `<div class="unl" style="margin-top:6px;color:var(--washi-dim)">${esc(recLine)}</div>` : ''}
      </div>`;
  const st = r.stats || {};
  const mm = Math.floor((st.time || 0) / 60), ss = Math.floor((st.time || 0) % 60);
  // 組の生き残りは、戦功の「部下生存率」と同じ数（戦の終わりの数）で見せる。
  // 終わりの合図のあと引き上げるまでに討たれた者がいれば、それも書き添える（名簿からはその者が外れるため）
  const svLine = r.lines.find((l) => /部下生存率/.test(l.label));
  const svm = svLine && String(svLine.detail).match(/(\d+)\/(\d+)/);
  const svAlive = svm ? +svm[1] : st.squadAlive, svAll = svm ? +svm[2] : st.squad;
  const svAfter = svm && st.squadAlive != null && st.squadAlive < svAlive ? svAlive - st.squadAlive : 0;
  const svHtml = svAll ? `<span>組の生き残り<b>${svAlive}/${svAll}人</b></span>` : '';
  const best = r.best;
  const primary = actions.find((a) => a.primary);
  // 525：評定の目安（何割で何か・一つ上まであと何点か）
  let gNote = '';
  // 評定の目安：一文目で決まりを言い、数は小さな表に（983）
  const gTable = r.grade ? `<span class="ev-gtab">${GRADE_CUT.map(([g, k]) => `<span class="${g === r.grade ? 'on' : ''}">${g}<small>${GRADE_WORD[g]}</small><b>${Math.ceil(r.cap * k)}</b></span>`).join('')}</span>` : '';
  if (r.grade) {
    const cutTxt = GRADE_CUT.map(([g, k]) => `${g} ${Math.ceil(r.cap * k)}`).join('・');
    void cutTxt;
    if (!r.mainDone) gNote = '任務を果たせなかったので「丙」。任務を果たせば、戦功の多さで評定が上がる。';
    else {
      const i = GRADE_CUT.findIndex(([g]) => g === r.grade);
      const up = i < 0 ? GRADE_CUT[GRADE_CUT.length - 1] : GRADE_CUT[i - 1];
      gNote = up ? `任務を果たし、戦功の多さで評定が決まる。「${up[0]}（${GRADE_WORD[up[0]]}）」まで あと ${Math.max(1, Math.ceil(r.cap * up[1]) - r.total)}点。` : '任務を果たし、最上の評定を得た。';
    }
  }
  // 戦の結果は、討ち取り・手柄・家臣・知行の四つにそろえる。
  const ekFoes = [...new Set(r.lines.filter((l) => l.label === '敵武将撃破').map((l) => l.detail))];
  const ekAllDeeds = [...new Set([...bigs.filter((l) => l.label !== '敵武将撃破').map((l) => l.label), ...r.lines.filter((l) => !l.big && l.pts > 0 && !/部下生存率|部下の撃破/.test(l.label)).sort((a, b) => b.pts - a.pts).map(narrate)])];
  const ekDeeds = ekAllDeeds.slice(0, 3);
  const ekMen = svAll ? Array.from({ length: Math.min(svAll, 30) }, (_, i) => `<i class="${i < Math.round(svAlive * Math.min(svAll, 30) / svAll) ? '' : 'd'}"></i>`).join('') : '';
  const ekKerai = (r.keraiLines || []).map((x) => `${x.name}：${x.kills}人を討つ・${x.alive ? '無事' : '討死'}${x.growth ? `。手柄で育った（${x.growth}）` : ''}`);
  const land = r.landChange;
  const landDelta = land ? land.after - land.before : 0;
  const landHtml = land ? `<p>${land.before} → ${land.after}石</p><p class="ek-change">${landDelta > 0 ? `＋${landDelta}石 増えた` : landDelta < 0 ? `−${-landDelta}石 減った` : '増減なし'}</p>` : '<p class="none">この戦の知行の増減記録なし</p>';
  // 段2：城下で選んだ内政・家臣・外交が、この戦にどう効いたかを一行で（畳まずに見せる）
  const realmHot = (r.realmLines || []).find((l) => /討ち取った|寝返|加わらな|討死|出奔|援軍が加勢|仲が深まった|弱みが役に立った/.test(l));
  const ekRealm = realmHot ? `<p class="ek-realm"><b>城下の備え：</b>${esc(realmHot)}</p>` : '';
  const nextBattle = r.mainDone && r.battleIndex != null ? BATTLES[r.battleIndex + 1] : null;
  const nextLore = nextBattle && LORE[nextBattle.id];
  // 背の低い画面（スマホ横）では、巻物の下まで送らなくても「次の戦」「昇進の見込み」が分かるよう、見出しのすぐ下に一行で出す
  const promoMini = promoSeen || r.promoted ? `${esc(RANKS[r.rankAfter].name)}に取り立てられた`
    : atCeil ? `${esc((nx.name || '').replace(/候補$/, ''))}に取り立てられる見込み（次の戦でも条件が必要）`
    : '';
  const nextMini = (nextLore || promoMini) ? `<p class="ek-nextmini">${nextLore ? `<span>次の戦　<b>${esc(nextBattle.name)}</b></span>` : ''}${promoMini ? `<span class="pm">${promoMini}</span>` : ''}</p>` : '';
  const emaki = `<section class="ek" aria-label="${esc(r.battle)}の戦功">${EK_SKY}<div class="ek-in">
    <div class="ek-h">${r.grade ? `<span class="ek-seal" role="img" aria-label="評定 ${r.grade}（${GRADE_WORD[r.grade]}）">${r.grade}<small>${GRADE_WORD[r.grade]}</small></span>` : ''}<div><small>戦功評価</small><h2>${esc(r.battle)}</h2></div></div>
    ${downHtml(r.downInfo)}${r.damageNote ? `<p class="note">${esc(r.damageNote)}</p>` : ''}
    ${nextMini}
    <p class="note">${r.promoted ? 'この戦の後に昇進した' : G.rank >= (RANK_CEIL[r.battleIndex] ?? RANKS.length - 1) ? 'この戦で上がれる身分の上限に達した。戦功は累計に残る' : esc(r.reason || '昇進には戦功・任務・上官の評価が必要')}</p>
    <div class="ek-cols">
      <div class="ek-c"><b>討ち取った武将</b>${ekFoes.length ? `<p>${ekFoes.map(esc).join('<br>')}</p>` : '<p class="none">討ち取りなし</p>'}</div>
      <div class="ek-c"><b>手柄</b>${ekDeeds.length ? `<ul>${ekDeeds.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="none">加点された手柄の記録なし</p>'}</div>
      <div class="ek-c"><b>家臣と組の働き</b>${ekKerai.length ? `<ul>${ekKerai.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="none">家臣の働きの記録なし</p>'}${svAll ? `<small>組の生き残り ${svAlive}／${svAll}人</small>${svAfter ? `<table><caption>組の人数</caption><tbody><tr><th>戦の終わり</th><td>${svAlive}人</td></tr><tr><th>帰還時</th><td>${st.squadAlive}人</td></tr></tbody></table>` : ''}${svAll > 30 ? '<small>人形は生き残った割合の印です。一つが一人とは限りません。</small>' : ''}<span class="ek-men" aria-hidden="true">${ekMen}</span>` : ''}</div>
      <div class="ek-c"><b>知行の増減</b>${landHtml}</div>
    </div>
    <div class="ek-foot">${r.bossLine ? `<q><b>${esc(r.bossLine[0])}</b>${esc(r.bossLine[1])}</q>` : '<span></span>'}<span class="ek-t">戦功<strong id="ev-total">0</strong>褒美 ${esc(kanZeni(r.reward))}</span></div>
    ${ekRealm}
    ${nextLore ? `<p class="ek-next"><small>次の戦の心得</small>${esc(nextLore[1])}</p>` : ''}
  </div></section>`;
  const rel = (r.relChange || []).map((x) => `<p class="ev-rel"><b>${esc(REL_NAME[x.k] || x.k)}の覚え</b>${REL_KEYS.filter(([k]) => x.d[k]).map(([k, n]) => `<span class="${(k === 'wary' ? -x.d[k] : x.d[k]) > 0 ? 'up' : 'dn'}">${n} ${sgn(x.d[k])}（${x.after[k]}）</span>`).join('') || '<span>変わらず</span>'}</p>`).join('');
  const screen = show(`${EVAL_CSS}<div class="eval ev2"><div class="ev-body">
    ${emaki}
    ${conds?.find(([ok]) => !ok) ? `<p class="note">昇進へ足りない条件：${esc(conds.find(([ok]) => !ok)[1])}（${esc(conds.find(([ok]) => !ok)[2])}）。ほかの条件は下の昇進札で読めます。</p>` : ''}
    ${categoryHelp ? '<p class="note">戦功の四区分：武は自ら戦う働き。任は任務。将は組の指揮。忠は下知を守る働き。</p>' : ''}
    ${battleTalkHtml(talks)}
    <div class="ev-ach-notices" aria-label="得た実績"></div>
    ${!r.mainDone && r.bossLine ? `<div class="ev-fail"><b>${r.taishoLost ? '殿を討たれた' : 'しくじり'}</b><p><span>${esc(r.bossLine[0])}</span>「${esc(r.bossLine[1])}」</p>${r.advice ? `<p class="adv">次への一言：${esc(r.advice)}</p>` : ''}<div class="row" id="ev-fail-acts" style="margin:8px 0 0"></div></div>` : ''}
    ${promo}
    ${(() => { const notes = ['武','任','将','忠'].map((c) => catNotes(c, r, hadSquad)); const good = notes.find((n) => n.good.length)?.good[0]; const lack = notes.find((n) => n.lack.length)?.lack[0]; return `<div class="histnote">${good ? `<p>良かったこと：${esc(good)}</p>` : ''}${lack ? `<p>次の課題：${esc(lack)}</p>` : ''}${r.stats?.parries === 0 ? `<details><summary style="min-height:44px;cursor:pointer">受け流しの方法を見る</summary><p>敵が打ち込む直前に${isTouch ? '右の「構え」の丸を押す' : '右クリックで構える'}。矢と鉄砲は物陰で避ける。</p></details>` : ''}</div>`; })()}
    ${r.spoilHorse ? `<div class="histnote" style="border-color:var(--kin)"><b>分捕った馬</b><br>${esc(r.spoilHorse.who)}の馬。${spoilReplace ? `持ち帰ると前の馬（${esc(previousSpoil?.name || previousSpoil?.from || '分捕り馬')}）と入れ替わる。持ち帰る釦で決めるまでは前の馬を残す` : '持ち帰って城下の馬屋に並べる'}${ladderStep(G) < 2 ? '（乗れるのは足軽大将から）' : ''}。<div class="row" style="margin:6px 0 0"><button class="btn small" id="ev-spoil" aria-pressed="${spoilReplace}">${spoilReplace ? '持ち帰る' : '置いていく'}</button></div><div id="ev-spoil-confirm"></div></div>` : ''}
    <details class="ek-more" id="ek-more"><summary>くわしく見る（手柄はほか${Math.max(0, ekAllDeeds.length - 3)}件・評定の内訳・褒美・組の働き）</summary>
    ${(window.__game?.hud?.resultNotices || []).length ? `<div class="histnote"><b>戦で届いた大事な成果</b>${window.__game.hud.resultNotices.map((line) => `<p>${esc(line.text)}</p>`).join('')}</div>` : ''}
    ${gNote ? `<p class="ev-gnote">${esc(gNote)}${gTable}</p>` : ''}
    ${bigs.length ? `<div class="ev-bigs">${bigHtml}</div>` : ''}
    <div class="evcs">${cards}</div>
    <div class="ev-sum" style="animation-delay:${delay}s"><div><div class="verdict">${esc(r.verdict)}</div>${r.bossLine ? `<p class="bossline"><b>${esc(r.bossLine[0])}</b>「${esc(r.bossLine[1])}」</p>` : ''}</div>
      <div class="t"><small>合計戦功</small><strong>${r.total}</strong><em>${r.capped ? `上限${r.cap}に到達（計算上 ${r.raw}）` : `この戦の上限 ${r.cap}`}${r.prevTotal !== undefined ? `　前の戦より ${r.total - r.prevTotal >= 0 ? '+' : ''}${r.total - r.prevTotal}` : ''}</em></div></div>
    <div style="opacity:0;animation:ln .4s ease-out ${delay + 0.3}s forwards" class="ev-more-wrap">
      ${(r.realmLines || []).length ? `<p class="ev-rel"><b>知行と家中</b>${r.realmLines.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : ''}
      ${rel}
      <dl class="facts">
        <dt>褒美</dt><dd><style>.ev-pay summary{cursor:pointer;font-size:max(12px, calc(13px * var(--text-scale, 1)));color:var(--washi-dim);min-height:44px;display:flex;align-items:center}.ev-pay ul{list-style:none;margin:0 0 6px;padding:0;font-size:max(12px, calc(13px * var(--text-scale, 1)))}.ev-pay li{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dashed var(--line);padding:3px 0}.ev-pay li small{color:var(--washi-dim);font-size:max(12px, calc(12px * var(--text-scale, 1)))}.ev-pay li b{font-weight:500;font-variant-numeric:tabular-nums}</style><span class="ev-purse" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5 Q12 8 16 5 L15 8 Q21 12 19 18 Q17 21 12 21 Q7 21 5 18 Q3 12 9 8 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8 H15" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="15" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="11.2" y="14.2" width="1.6" height="1.6" fill="currentColor"/></svg></span><b id="ev-kan">${zeni(0)}</b>（所持 ${zeni(G.kan)}）<small class="ev-eiraku">${esc(bossName)}より、永楽銭 ${kanZeni(r.reward)}を賜る</small>${(r.pay || []).length ? `<details class="ev-pay"><summary>褒美の内訳</summary><ul>${r.pay.map((l) => `<li><span>${esc(l.label)}${l.detail ? `<small>　${esc(l.detail)}</small>` : ''}</span><b>${l.kan < 0 ? '−' : '+'}${zeni(Math.abs(l.kan))}</b></li>`).join('')}</ul></details>` : ''}${r.tomoLeft ? `<br><small>給金が払えず、${esc(r.tomoLeft)}に暇を出した</small>` : ''}</dd>
        <dt>上官の評価</dt><dd>${r.superiorBefore} → ${r.superiorAfter}${r.superiorAfter < 50 ? '（50未満では昇進できない）' : ''}</dd>
        <dt>累計戦功</dt><dd>${prevMerit} → ${r.meritAfter}</dd>
        ${G.injured ? '<dt>負傷</dt><dd>重傷。城下の宿で休まねばならない</dd>' : ''}
      </dl>
      ${next ? `<div class="ev-prog"><div class="lbl"><span>次の身分「${esc(next.name)}」まで</span><span><b class="ev-gain">今回 +${r.total}</b>　あと ${Math.max(0, next.min - r.meritAfter)}</span></div><i><s style="width:${Math.min(100, prevMerit / progTarget * 100)}%"></s><b id="ev-bar"></b></i></div>` : ''}
    </div>
    ${r.drillNote ? `<div class="histnote" style="border-color:var(--kin)"><b>稽古の成果</b><br>${esc(r.drillNote)}</div>` : ''}
    ${r.damageNote ? `<div class="histnote"><b>倒れた時の手掛かり</b><br>${esc(r.damageNote)}</div>` : ''}
    ${r.advice ? `<div class="histnote" style="border-color:var(--ai)"><b>次の戦への心得</b><br>${esc(r.advice)}</div>` : ''}
    ${r.squadReport ? `<div class="histnote" style="border-color:var(--moegi)"><b>組の働き</b><br>${esc(r.squadReport)}${(r.squadLines || []).length ? `<ul class="ev-sq">${r.squadLines.map((x) => `<li class="${x.alive ? '' : 'dead'}">${esc(x.name)}、${x.kills ? `${kanNum(x.kills)}人を討ち` : x.alive ? '槍を並べ' : '槍を合わせ'}、${x.alive ? '生き残る' : '討死'}</li>`).join('')}</ul>` : ''}</div>` : ''}
    ${r.tomoReport ? `<div class="histnote" style="border-color:var(--moegi)"><b>供の働き</b><br>${esc(r.tomoReport)}</div>` : ''}
    ${(r.newMet || []).length ? `<div class="histnote"><b>新たに会った武将</b><div class="row" style="margin:6px 0 0">${r.newMet.slice(0, 8).map((n) => `<button class="btn small" data-zk="${esc(n)}" aria-label="${esc(n)}の図鑑の札を開く">${esc(n)}</button>`).join('')}</div></div>` : ''}
    ${r.newTitles && r.newTitles.length ? `<div class="titles">${r.newTitles.map((id) => `<div class="got"><b>称号「${esc(TITLES[id].name)}」</b><small>${esc(TITLES[id].note)}</small></div>`).join('')}</div>` : ''}
    <details class="ev-detail" id="ev-detail"><summary>戦功の内訳と戦いの記録を見る（${r.lines.length}項目）</summary>
      <div class="ev-more"><span>戦った時間<b>${mm}分${String(ss).padStart(2, '0')}秒</b></span><span>自ら討った敵<b>${st.kills ?? 0}人</b></span>${svHtml}<span>受けた傷<b>${Math.round(st.taken || 0)}</b></span><span>傷の内訳<b>鉄砲 ${Math.round(st.gunTaken || 0)}・矢 ${Math.round(st.arrowTaken || 0)}・槍 ${Math.round(st.spearTaken || 0)}・刀 ${Math.round(st.swordTaken || 0)}・騎馬 ${Math.round(st.horseTaken || 0)}${st.fireTaken ? `・火傷 ${Math.round(st.fireTaken)}` : ''}</b></span><span>受け流し<b>${st.parries || 0}回</b></span><span>防いだ攻撃<b>${st.blocks || 0}回</b></span><span>敵に防がれた<b>${st.guarded || 0}回</b></span><span>駆けた距離<b>${Math.round(st.dist || 0)}メートル</b></span>${st.cavStops ? `<span>止めた騎馬<b>${st.cavStops}騎</b></span>` : ''}${best ? `<span>これまでの最高<b>${best}</b></span>` : ''}</div>
      <p class="note">区分ごとの一律の上限はありません。働きごとの上限があります。<br>武：足軽の討ち取りは40、侍は30、首級は20まで。武将は一人30。<br>任：主の任務は50、地点の確保は15。副任務と救援は各20。<br>将：組の討ち取りは20、横槍は50、生き残りは30まで。<br>忠：下知を守り通すと10。違反と追撃は差し引く。合計はこの戦の上限まで。</p><div class="ledger">${ledger || '<div class="ln"><span>記すべき働きなし</span><span></span><span class="p">0</span></div>'}</div>
    </details>
    ${r.history ? `<details class="histnote"><summary style="min-height:44px;cursor:pointer;display:flex;align-items:center">史実と後日談を読む</summary>${esc(r.history)}</details>` : ''}
    </details>
    ${fbHtml('ev-fb')}
    </div>
    <div class="ev-actbar" style="animation-delay:0s"><div class="row" id="ev-actions" style="margin:0"></div><div id="ev-retry-cf"></div><p class="skiphint">${isTouch ? '画面を押すと演出を飛ばします ・ 下の釦で次へ進みます' : `画面を押すと演出を飛ばします ・ 決定キーで「${esc(primary ? primary.label : '')}」 ・ <kbd class="cap">ディー</kbd> で内訳`}</p></div>
  </div>`, false, (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target.tagName === 'SUMMARY')) { e.preventDefault(); if (primary) { sfx('ui'); primary.fn(); } }
    else if (e.key === 'd' || e.key === 'D') { const d = $('ev-detail'); if (d) { d.open = !d.open; if (d.open && $('ek-more')) $('ek-more').open = true; } }
  });
  // 戦が終わった直後の実績の札も、巻物に重ならない専用欄へ移す。
  const achNotices = document.querySelector('.zk-toasts');
  bindBattleTalk(screen, talks, null);
  if (achNotices) screen.querySelector('.ev-ach-notices').appendChild(achNotices);
  const evs = $('ev-spoil');
  if (evs) {
    if (!spoilReplace) { spoilKeep(G, r.spoilHorse.who, true); save(G); }
    evs.onclick = (ev) => {
      ev.stopPropagation();
      const leave = evs.getAttribute('aria-pressed') !== 'true';
      const apply = () => {
        $('ev-spoil-confirm').innerHTML = '';
        spoilKeep(G, r.spoilHorse.who, !leave); save(G);
        evs.setAttribute('aria-pressed', String(leave)); evs.textContent = leave ? '持ち帰る' : '置いていく';
        evs.focus({ preventScroll:true }); sfx(leave ? 'ui' : 'neigh', 0.5);
      };
      if (leave) confirmBox($('ev-spoil-confirm'), `${r.spoilHorse.who}の馬を置いていきます。`, '馬を置く', apply, { sub:'次へ進むまでは持ち帰り直せます。' });
      else if (previousSpoil) confirmBox($('ev-spoil-confirm'), `前の馬（${previousSpoil.name || previousSpoil.from || '分捕り馬'}）と入れ替えます。`, '入れ替えて持ち帰る', apply, { sub:'次へ進むと、前の馬と育てた絆は戻せません。' });
      else apply();
    };
  }
  document.querySelectorAll('[data-zk]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); openZukan('card', b.dataset.zk); });
  fbBind(screen, 'ev-fb', 'eval');
  const box = $('ev-actions');
  for (const a of actions) {
    const b = document.createElement('button');
    // やり直すは主の釦と並べない（小さく）。押すと、評定を捨てる確かめを挟む（取り消せない操作）
    b.className = 'btn' + (a.primary ? ' primary' : a.confirm ? ' small' : '');
    b.textContent = a.label;
    b.onclick = (ev) => {
      ev.stopPropagation();
      if (a.confirm) { confirmBox($('ev-retry-cf'), '今の評定は消えて、この戦をもう一度始めからやり直します。', 'やり直す', () => { delete G._spoilPrev; a.fn(); }); return; }
      sfx('ui'); delete G._spoilPrev; a.fn();
    };
    box.appendChild(b);
  }
  // 左上の戻る：戦には戻れないので、戻る先は城下（無ければタイトル・日本地図）
  { const home = actions.find((x) => /城下/.test(x.label)) || actions.find((x) => /地図|タイトル/.test(x.label)); if (home) topBack(() => { delete G._spoilPrev; home.fn(); }, home.label.replace(/（[^）]*）/g, '').replace(/へ戻る$|に戻る$/, 'へ').replace(/^(.{0,8}).*$/, '$1')); }
  // しくじった時は、やり直しの釦を叱りの札のすぐ下にも出す（821）
  const fa = $('ev-fail-acts');
  if (fa) for (const a of actions.filter((x) => /再挑戦|やり直す/.test(x.label))) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = a.label; b.onclick = (ev) => { ev.stopPropagation(); if (a.confirm) { confirmBox($('ev-retry-cf'), '今の評定は消えて、この戦をもう一度始めからやり直します。', 'やり直す', () => { delete G._spoilPrev; a.fn(); }); return; } sfx('ui'); delete G._spoilPrev; a.fn(); }; fa.appendChild(b); }
  // 合計戦功を数え上げる
  const tot = $('ev-total');
  const countUp = (dur) => {
    const t0c = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0c) / dur); tot.textContent = Math.round(r.total * (1 - (1 - k) ** 3)); if (k < 1 && tot.isConnected) requestAnimationFrame(step); };
    step();
  };
  // 大きな戦功が出る時だけ、太鼓を一つ
  const bigT = bigs.map((l, i) => setTimeout(() => sfx('taiko', 0.7), (t0 + i * 0.35) * 1000));
  const cuT = setTimeout(() => {
    countUp(900);
    const kan = $('ev-kan');
    // 十回ほどに分けて数え上げ、音もその回数だけ（637）
    if (kan) { let n = 0; const N = 10; const iv = setInterval(() => { n++; kan.textContent = zeni(Math.round(r.reward * Math.min(1, n / N) * 1000) / 1000); if (n >= N || !kan.isConnected) clearInterval(iv); else sfx('hover', 0.6); }, 70); }
  }, delay * 1000);
  const ev = screen.querySelector('.eval');
  const skip = () => { clearTimeout(cuT); bigT.forEach(clearTimeout); tot.textContent = r.total; const kan = $('ev-kan'); if (kan) kan.textContent = zeni(r.reward); ev.classList.add('fast'); const bar = $('ev-bar'); if (bar) bar.style.width = Math.min(100, r.meritAfter / progTarget * 100) + '%'; };
  ev.addEventListener('click', (e) => { if (!e.target.closest('summary, details')) skip(); });
  // 動きを減らす時は、数え上げも出てくる動きも飛ばして、すぐ全部を見せる
  if (RM()) skip();
  setTimeout(() => { const bar = $('ev-bar'); if (bar) bar.style.width = Math.min(100, r.meritAfter / progTarget * 100) + '%'; }, (delay + 0.4) * 1000);
  if (r.promoted && !promoSeen) { setTimeout(() => sfx('promote', 0.9), (delay + 0.6) * 1000); setTimeout(() => sfx('flute', 0.8), (delay + 1.8) * 1000); }
  // すぐ Tab で主のボタンへ行けるように
  const pb = box.querySelector('.primary'); if (pb) pb.focus({ preventScroll: true });
}

// ---------------- 昇進の場面 ----------------
// 上官の言葉（筋書き・戦・新しい身分で変わる）
const PROMO_WORDS = {
  nagashino: [
    { who: '長篠城主　奥平信昌', mon: 'okudaira', say: { 1: '{n}、五百でこの城を守り抜けたのは、その方らの槍のおかげじゃ。今日より五人を預ける。組頭の見習いとして、背に印を負え' } },
    { who: '長篠城主　奥平信昌', mon: 'okudaira', say: { 1: '{n}、強右衛門をよう川まで送り届けた。あの男の走りに、城の命がかかっておる。今日より五人を預ける', 2: '{n}、強右衛門の道を守り抜いた働き、見事じゃ。組頭に取り立てる' } },
    { who: '徳川の宿老　酒井忠次', mon: 'katabami', say: { 2: '鳶ヶ巣山、その方の組が一番に柵を越えたと聞いた。足軽組頭に取り立てる。十五人を、その方の旗の下に置け', 1: '夜の山でよう黙って待てた。組頭の見習いとして、五人を預ける' } },
    { who: '侍大将　大久保忠世', mon: 'okubo', say: { 3: '{n}！　柵の内でよう踏みとどまった。足軽大将の候補として二十人を預ける。弓も使いこなしてみせよ', 2: '柵をよう守った。足軽組頭じゃ。十五人、死なせるでないぞ' } },
    { who: '侍大将　大久保忠世', mon: 'okubo', say: { 4: '諏訪原の門を破ったのは、その方の組じゃ。殿のお許しが出た。今日より足軽大将。馬に乗り、組を率いよ', 3: '城攻めの働き、殿にも申し上げた。足軽大将の候補として励め' } },
  ],
  okehazama: [
    { who: '組頭　源八', mon: 'oda', say: { 1: '{n}、よう生き残った。殿のお下知じゃ、今日からお主は組頭の見習い。五人預ける。死なせるなよ' } },
    { who: '足軽大将　大沢勘兵衛', mon: 'oda', say: { 2: '森部の横槍、しかと見た。足軽組頭に取り立てる。十五人と弓を預ける' } },
    { who: '普請奉行　木下藤吉郎', mon: 'oda', say: { 4: '殿が墨俣の働きをいたくお喜びじゃ。今日からお主は足軽大将。……わしも負けてはおれんのう', 3: '墨俣の働き、殿のお耳に入れておきましたぞ。足軽大将の候補じゃ' } },
  ],
};
// 織田家編は戦の id で引く（戦を足したら、ここにも一つ足す。無ければ上役の名で決まりの言葉）
PROMO_WORDS.oda = {
  moribe: { who: '組頭　源八', mon: 'oda', say: { 1: '{n}、五人を一人も欠かさず横槍を入れたな。殿のお下知じゃ、今日からお主は組頭の見習い。背に印を負え' } },
  sunomata: { who: '普請奉行　木下藤吉郎', mon: 'oda', say: { 2: '砦が建ったのは、そなたの組が守ってくれたからじゃ。殿に申し上げて、足軽組頭に取り立ててもろうた。十五人を預けるぞ', 1: '墨俣の働き、殿のお耳に入れておいた。組頭の見習いとして励め' } },
  inabayama: { who: '木下藤吉郎', mon: 'oda', say: { 2: '{n}、稲葉山が落ちたのは、町に火を放ち、搦手を登ったそなたの組のおかげじゃ。足軽組頭に取り立てる' } },
  mitsukuri: { who: '木下藤吉郎', mon: 'oda', say: { 2: '箕作の夜攻め、見事じゃった。足軽組頭として、十五人を預ける' } },
  nodafukushima: { who: '前田利家', mon: 'maeda', say: { 3: '{n}、早鐘の夜に堤を守り抜いたのは、その方の組じゃ。足軽大将の候補として二十人を預ける', 2: '堤の守り、ようやった。足軽組頭じゃ' } },
  odani: { who: '羽柴秀吉', mon: 'oda', say: { 4: '{n}、京極丸を取ったのはそなたの組じゃ。殿のお許しが出た。今日より足軽大将。馬に乗れ' } },
  nagashima: { who: '柴田勝家', mon: 'oda', say: { 4: '柵の前でよう踏みとどまった。今日より足軽大将じゃ。組を率いよ' } },
  kanegasaki: { who: '木下藤吉郎', mon: 'oda', say: { 2: '{n}、あの退き口でわしの後ろを守り抜いた。足軽組頭じゃ。十五人、死なせるでないぞ' } },
  anegawa: { who: '森可成', mon: 'oda', say: { 3: '{n}、川を渡っての押し合い、よう組を崩さなんだ。足軽大将の候補として二十人を預ける。弓も使いこなしてみせよ', 2: '姉川の働き、見事。足軽組頭に取り立てる' } },
  hieizan: { who: '明智光秀', mon: 'akechi', say: { 4: '{n}、下知を守り、刃向かう者だけを討った。殿のお許しが出た。今日より足軽大将。馬に乗り、組を率いよ', 3: '山道でよう組をまとめた。足軽大将の候補として励め' } },
  shitaragahara: { who: '鉄砲奉行　前田利家', mon: 'maeda', say: { 4: '{n}、柵の内でよう踏みとどまった。桶狭間の足軽が、いまや足軽大将か。殿もお喜びじゃ' } },
};
const MON_NAME = { ichimonji: '一文字', maru: '丸', igeta: '井桁', tokugawa: '三つ葉葵', oda: '木瓜' };
function promoWords(G, r) {
  const PW = PROMO_WORDS[scenarioKey()];
  const B = BATTLES[r.battleIndex];
  const P = PW && !Array.isArray(PW) ? (B && PW[B.id]) : (PW || [])[r.battleIndex];
  const n = G.name;
  let t = P && (P.say[r.rankAfter] || Object.values(P.say)[0]);
  if (B?.id === 'moribe' && t?.includes('五人を一人も欠かさず')) {
    const line = (r.lines || []).find((l) => /部下生存率/.test(l.label));
    const m = line && String(line.detail).match(/(\d+)\/(\d+)/);
    const alive = m ? +m[1] : r.stats?.squadAlive, total = m ? +m[2] : r.stats?.squad;
    t = t.replace('五人を一人も欠かさず', total > 0 && alive === total ? `${total}人を一人も欠かさず` : alive != null && total > 0 ? `組の${total}人のうち${alive}人が生き残った。よう` : 'よう');
  }
  if (P && t) return { who: P.who, mon: P.mon, text: t.replace('{n}', n) };
  return { who: (B && B.boss) || '上官', mon: SCENARIOS[scenarioKey()].mon, text: `${n}、よう働いた。今日より${RANKS[r.rankAfter].name}に取り立てる` };
}
const PROMO_CSS = `<style>
  .pc-joy { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin: 10px 0 12px; }
  .pc-joy > div { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 8px 16px 8px 12px; border: 1px solid var(--kin); background: linear-gradient(100deg, rgba(194,162,90,.22), rgba(194,162,90,.04)); animation: pcJoy .5s cubic-bezier(.2,.9,.3,1.2) both; }
  @keyframes pcJoy { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: none; } }
  .pc-joy svg { grid-row: span 2; width: 34px; height: 34px; fill: none; stroke: var(--kin); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .pc-joy small { font-size: max(13px, calc(13px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--kin); }
  .pc-joy b { font-family: var(--display); font-size: max(12px, calc(20px * var(--text-scale, 1))); letter-spacing: .06em; }
  .promo-cine.still .pc-joy > div { animation: none; }
  @media (max-height: 500px) { .pc-joy { margin: 4px 0 6px; } .pc-joy b { font-size: max(12px, calc(16px * var(--text-scale, 1))); } .pc-road { display: none !important; } }
  #screen .promo-cine .pc-lbl { font-size: max(12px, calc(12px * var(--text-scale, 1))); }   /* 低い画面でも 12px を割らない（820） */
  .promo-cine .pc-band { display: grid; grid-template-columns: auto minmax(0, 460px); gap: 26px; align-items: end; justify-content: center; text-align: left; margin: 2px 0 6px; }
  @media (max-width: 720px) { .promo-cine .pc-band { grid-template-columns: 1fr; justify-items: center; } }
  .promo-cine .pc-flags { display: flex; align-items: flex-end; gap: 14px; }
  .promo-cine .pc-flag { position: relative; padding-left: 4px; border-left: 3px solid #5a4630; height: 160px; display: flex; align-items: flex-start; transform-origin: bottom left; }
  .promo-cine .pc-flag canvas { width: 54px; height: 126px; box-shadow: 0 6px 18px rgba(0,0,0,.5); }
  .promo-cine .pc-flag.rise { animation: pcRise 1.1s cubic-bezier(.2,.8,.2,1) .5s both, pcSway 2.4s ease-in-out 1.7s 2 alternate; }
  .promo-cine .pc-squad { display: grid; grid-template-columns: repeat(10, 12px); gap: 5px 5px; align-content: end; }
  .promo-cine .pc-squad i { display: block; width: 10px; height: 24px; border-left: 2px solid #5a4630; position: relative; }
  .promo-cine .pc-squad i b { position: absolute; left: 0; top: 0; width: 9px; height: 15px; background: var(--fl, #ddd); }
  .promo-cine .pc-squad i.old { opacity: .45; }
  .promo-cine .pc-squad i.nw { animation: pcRise .5s ease-out both; }
  .promo-cine .pc-flagcap { font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: .1em; margin-top: 8px; }
  .promo-cine .pc-flagcap b { color: var(--kin); font-weight: 500; }
  .promo-cine .pc-say { border-left: 2px solid var(--kin); padding: 6px 0 6px 16px; opacity: 0; animation: ln .6s ease-out .9s forwards; }
  .promo-cine .pc-say .who { display: flex; align-items: center; gap: 10px; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--kin); letter-spacing: .12em; margin-bottom: 6px; }
  .promo-cine .pc-say .who canvas { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 0 1px var(--line); }
  .promo-cine .pc-say p { margin: 0; font-family: var(--display); font-size: max(12px, calc(19px * var(--text-scale, 1))); line-height: 1.8; color: var(--washi); }
  .promo-cine { gap: 10px; padding-block: 22px; }
  .promo-cine .pc-ladder { margin-bottom: 6px; }
  .promo-cine .pc-ladder i:not(.done):not(.now) { box-shadow: inset 0 0 0 1px #8a8170; }   /* 先の段も 3:1 以上の枠で（955） */
  .promo-cine .pc-look .preview3d { width: 200px; height: 220px; }
  .promo-cine .pc-look .preview3d.wide { width: 300px; height: 240px; }
  .promo-cine .card.eq { border-color: var(--washi-dim); background: rgba(236,228,210,.05); }
  .promo-cine .card.eq small { color: var(--washi-dim); }
  .promo-cine .card.rk { border-color: var(--shu); background: rgba(192,69,46,.1); }
  .promo-cine .card.rk small { color: #e38a74; }
  .promo-cine .card .w { display: block; margin-top: 4px; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); letter-spacing: 0; }
  .promo-cine .pc-road { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin: 2px 0 6px; }
  .promo-cine .pc-road span { display: flex; align-items: baseline; gap: 6px; padding: 2px 10px; border: 1px solid var(--line); color: var(--washi-dim); }
  .promo-cine .pc-road small { font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .promo-cine .pc-road b { font-family: var(--display); font-size: max(12px, calc(16px * var(--text-scale, 1))); color: var(--washi); font-variant-numeric: tabular-nums; }
  .promo-cine #pc-next { position: sticky; bottom: 14px; z-index: 2; box-shadow: 0 6px 20px rgba(0,0,0,.6); }
  .promo-cine .pc-road em { font-style: normal; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--shu-text, #e38a74); }
  .promo-cine .pc-road .now { border-color: var(--kin); background: rgba(194,162,90,.1); }
  .promo-cine .pc-road .now b { color: var(--kin); }
  .promo-cine .pc-road .sum { border-style: dashed; }
  .promo-cine.still .pc-flag.rise, .promo-cine.still .pc-squad i.nw { animation: none; }
  @keyframes pcRise { from { transform: translateY(60px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes pcSway { from { transform: rotate(-.6deg); } to { transform: rotate(.8deg); } }
</style>`;
export function promoScreen(Gbefore, G, r, onNext) {
  let done0 = false;
  let fluteTimer, drumTimer;
  const done = () => { if (done0) return; done0 = true; clearTimeout(fluteTimer); clearTimeout(drumTimer); onNext(); };
  const unlocks = (r.unlock || '').split(' ／ ').flatMap((u) => u.split('・')).filter(Boolean);
  const sA = ladderStep(Gbefore), sB = ladderStep(G);
  if (sB >= 2 && sA < 2) unlocks.push('騎乗（馬上で戦う）', '馬屋');
  // 解放を「率いる兵」「できること」「装備」に分けて見せる
  const isEq = (u) => /兜|槍|刀|胴|陣羽織|具足/.test(u) && !/槍衾|陣形|号令/.test(u);
  const cards = [
    { k: 'rk', l: '率いる兵', t: `${RANKS[r.rankAfter].squad}人の組` },
    ...unlocks.filter((u) => !/の組$|を率いる|^小隊指揮/.test(u) && !isEq(u)).map((u) => ({ k: '', l: 'できること', t: u })),
    // 加増（毎戦の禄）と、連れて行ける供の数
    ...((RANKS[r.rankAfter].roku || 0) > (RANKS[r.rankBefore].roku || 0) ? [{ k: '', l: '加増', t: `禄 ${zeni(RANKS[r.rankBefore].roku)} → ${zeni(RANKS[r.rankAfter].roku)}／戦` }] : []),
    ...((RANKS[r.rankAfter].tomo || 0) > (RANKS[r.rankBefore].tomo || 0) ? [{ k: '', l: 'できること', t: `供を${RANKS[r.rankAfter].tomo}人まで連れて行ける` }] : []),
    ...r.granted.map((id) => ({ k: 'eq', l: '下賜の装備', t: ITEMS[id].name, id })),
    ...unlocks.filter((u) => isEq(u) && !r.granted.some((id) => ITEMS[id].name === u)).map((u) => ({ k: 'eq', l: '買える装備', t: u })),
  ].filter((c) => c.t && !(c.k === 'rk' && !RANKS[r.rankAfter].squad));
  // 528：どこで使えるか（行き先）を札に添える
  const WHERE = [[/^禄 /, '戦の後の褒美に入る'], [/^供を/, '城下の「問屋」で雇う'], [/合印/, '城下へ戻る前に定める'], [/弓|編成/, '城下の「組」で割合を選ぶ'], [/陣形|号令|小隊/, '戦で号令の輪を開く'], [/馬屋|騎乗/, '城下の「馬屋」'], [/打刀/, '城下の「武具屋」で買える']];
  for (const c of cards) {
    if (c.k === 'rk') c.w = '城下の「組」で名簿を見る';
    else if (c.k === 'eq') c.w = c.id ? Object.values(G.equip || {}).includes(c.id) ? '下賜され、いま着けている' : '下賜され、所持している。城下の「武具屋」で着ける' : '城下の「武具屋」で買える';
    else { const w = WHERE.find(([re]) => re.test(c.t)); if (w) c.w = w[1]; }
  }
  // 529：これまでの戦の歩み（今回の戦を光らせる）
  const road = BATTLES.map((b, i) => { const h = G.history[i]; return `<span class="${i === r.battleIndex ? 'now' : h ? 'done' : ''}"><small>${esc(b.name)}</small><b>${h ? h.total : '—'}</b>${h && h.grade ? `<em>${h.grade}</em>` : ''}</span>`; }).join('');
  const W = promoWords(G, r);
  const kakun = scenarioKey() === 'oda' ? odaPromoKakun(r.rankAfter) : '';
  // 旗：合印を定めていれば合印、まだなら家の紋
  const flagMon = G.aijirushi || SCENARIOS[scenarioKey()].mon;
  const nOld = RANKS[r.rankBefore].squad, nNew = RANKS[r.rankAfter].squad;
  const small = [];
  for (let i = 0; i < nNew; i++) small.push(`<i class="${i < nOld ? 'old' : 'nw'}" style="${i >= nOld ? `animation-delay:${1.6 + (i - nOld) * 0.06}s` : ''}"><b></b></i>`);
  const flagCap = G.aijirushi ? `<b>${esc(MON_NAME[G.aijirushi] || '')}</b>の合印を掲げる組　${nOld ? `${nOld}人 → ` : ''}<b>${nNew}人</b>` : nNew ? `<b>${nNew}人</b>を預かる。組の合印は、城下へ戻る前に定める` : '';
  show(`${PROMO_CSS}<div class="promo-cine ${RM() ? 'still' : ''}">
    <div class="pc-lbl">昇　進</div>
    <div class="pc-rank"><span class="old">${esc(RANKS[r.rankBefore].name)}</span><span class="arrow">→</span><span class="new">${esc(RANKS[r.rankAfter].name)}</span></div>
    ${rankupHtml(Gbefore, G, r, W, '<div><div class="pc-flag"><canvas id="pc-flag" width="64" height="150" role="img" aria-label="新しい役目を受けた組の旗"></canvas></div><div class="pc-flagcap">組の旗</div></div>')}
    <details class="pc-more"><summary>人数・装備・出世の歩みを見る</summary>
    ${kakun ? `<p class="note" role="note">${esc(kakun)}</p>` : ''}
    ${rankupDetailsHtml(Gbefore, G, r)}
    <div class="pc-ladder" role="img" aria-label="出世の道　${KANSUJI[sB]}の段 ／ 十段">${LADDER.map((L, i) => `<i class="${i < sB ? 'done' : i === sB ? 'now' : ''}" style="--i:${i}" title="${esc(L.name)}"></i>`).join('')}</div>
    <div class="pc-ladder-lbl">出世の道　${KANSUJI[sB]}の段 ／ 十段</div>
    <div class="pc-road" aria-label="戦ごとの戦功">${road}<span class="sum"><small>保存枠の合計戦功</small><b>${r.meritAfter - r.total} → ${r.meritAfter}</b></span></div>
    <div class="pc-band">
      <div><div class="pc-flags">${nNew ? `<div class="pc-squad" aria-label="組の旗 ${nNew}本">${small.join('')}</div>` : ''}</div>
        ${flagCap ? `<div class="pc-flagcap">${flagCap}</div>` : ''}</div>
      <div class="pc-say"><div class="who"><canvas id="pc-mon" width="44" height="44"></canvas>${esc(W.who)}</div><p>「${esc(W.text)}」</p></div>
    </div>
    <div class="pc-unl">${cards.map((c, i) => `<div class="card ${c.k}" style="animation-delay:${1.8 + i * 0.3}s"><small>${esc(c.l)}</small>${esc(c.t)}${c.w ? `<span class="w">${esc(c.w)}</span>` : ''}</div>`).join('')}</div>
    </details>
    <button class="btn primary" id="pc-next">戦功の評価を見る</button>
    <p class="skiphint">${isTouch ? '上の釦で次へ' : '決定キーかスペースで次へ'}</p>
  </div>`, false, (e) => { if (e.target?.closest?.('summary, button')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } });
  // 主君の広間は一度だけ描く。立体の見本を二つ動かさない。
  drawRankup($('pc-audience'));
  // 旗と上官の紋
  const fc = $('pc-flag'); if (fc) drawMon(fc.getContext('2d'), flagMon, 64, 150);
  const mc = $('pc-mon'); if (mc) { const g = mc.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, W.mon, 44, 88); g.restore(); }
  // 小さな旗の地の色は、大きな旗の地の色に合わせる
  if (fc) { const px = fc.getContext('2d').getImageData(3, 140, 1, 1).data; document.querySelectorAll('.pc-squad i b').forEach((b) => { b.style.background = `rgb(${px[0]},${px[1]},${px[2]})`; }); }
  $('pc-next').onclick = done;
  // 左上：昇進の場面は一度きりの演出なので、閉じると戦功の評価へ進む
  topBack(done, '閉じる');
  $('pc-next').focus({ preventScroll: true });
  sfx('promote', 1);
  fluteTimer = setTimeout(() => sfx('flute', 0.9), 1200);
  drumTimer = setTimeout(() => sfx('taiko', 0.6), 600);
}

function downHtml(info) {
  return info ? `<div style="margin:16px 0;padding:12px;border:1px solid var(--line);font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.7"><b>${esc(info.wound)}</b><br>${esc(info.attack)}${info.detail ? `<br>${esc(info.detail)}` : ''}<br>次の備え：${esc(info.tip)}</div>` : '';
}

// ---------------- 討死（難易度「難」） ----------------
export function deathScreen(G, battleName, onTitle, downInfo, last = {}) {
  const hit = last.hit;
  const who = hit && (hit.name || { ashigaru: '敵の足軽', samurai: '敵の侍', busho: '敵の武将', bow: '敵の弓兵', gun: '敵の鉄砲兵', cavalry: '敵の騎馬' }[hit.type] || '敵');
  const how = hit ? hit.ranged ? hit.type === 'bow' ? '矢を受けた' : '撃たれた' : hit.mounted ? '馬上から突かれた' : hit.back ? '背後から突かれた' : hit.side ? '横から突かれた' : '正面から打ち負けた' : '';
  const wounds = hit ? `${who}に${how}。${hit.exhausted ? '息が切れていた。' : ''}${hit.guardBroken ? '構えを崩されていた。' : ''}` : '最後に受けた傷の記録はない。';
  show(`<div class="story"><div>
    <div class="year">${esc(battleName)}</div>
    <h2>討　死</h2>
    ${downHtml(downInfo)}
    <p>${esc(G.name)}（${esc(RANKS[G.rank].name)}）、この地に果てる。<br>累計戦功 ${G.merit}。その名は、組の者たちだけが覚えていた。</p>
    <p>最後の傷：${esc(wounds)}</p>
    <p>最後の任務：${last.objectives?.length ? last.objectives.map((x) => `${esc(x.text)}（${x.state === 'done' ? '果たした' : x.state === 'fail' ? '果たせなかった' : '途中'}）`).join('・') : '記録なし'}${last.time != null ? `<br>戦っていた時間：${Math.floor(last.time / 60)}分${Math.floor(last.time % 60)}秒。` : ''}</p>
    <button class="btn primary" id="b-dead">タイトルへ</button>
  </div></div>`, false, (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onTitle(); } });
  $('b-dead').onclick = onTitle;   // 左上にも同じ釦を置かない（W048）
  $('b-dead').focus({ preventScroll: true });
  sfx('horagai', 0.5);
}

// ---------------- 合印を定める ----------------
export function aijirushiScreen(G, onDone) {
  const kinds = [['ichimonji', '一文字', 'まっすぐな一本の線。遠くからでも見分けやすい'], ['maru', '丸', '円い印。組の和を表す'], ['igeta', '井桁', '井戸の枠の形。固い守りを表す']];
  // 530：押してすぐ決めず、選ぶ → 組の旗の並びで確かめる → 決める の二段にする
  let sel = null;
  const pick = (k) => {
    sel = k; sfx('ui');
    document.querySelectorAll('.aiji button').forEach((b) => { b.classList.toggle('on', b.dataset.k === sel); b.setAttribute('aria-pressed', b.dataset.k === sel); });
    const K = kinds.find(([x]) => x === k);
    $('aj-look').innerHTML = `<div class="aj-row">${Array.from({ length: Math.min(8, RANKS[G.rank].squad || 5) }, () => '<canvas width="30" height="60"></canvas>').join('')}</div><p><b>${esc(K[1])}</b>　${esc(K[2])}</p>`;
    $('aj-look').querySelectorAll('canvas').forEach((c) => drawMon(c.getContext('2d'), k, 30, 60));
    const ok = $('aj-ok'); ok.disabled = false; ok.textContent = `「${K[1]}」に決める`;
  };
  const decide = () => { if (!sel) return; G.aijirushi = sel; sfx('taiko', 0.6); onDone(); };
  show(`<style>
    .aiji button.on { border-color: var(--kin); box-shadow: inset 0 0 0 1px var(--kin); background: rgba(194,162,90,.08); }
    .aiji button { min-height: 44px; }
    #aj-look { min-height: 96px; margin: 4px 0 16px; }
    #aj-look .aj-row { display: flex; gap: 10px; align-items: flex-end; }
    #aj-look canvas { width: 30px; height: 60px; border-left: 2px solid #5a4630; padding-left: 2px; }
    #aj-look p { margin: 8px 0 0; font-size: max(12px, calc(14px * var(--text-scale, 1))); color: var(--washi-dim); } #aj-look b { color: var(--kin); font-weight: 500; }
  </style><div class="wrap">
    <div class="eyebrow">組の合印</div>
    <h2 style="font-family:var(--display);font-size:max(12px, calc(34px * var(--text-scale, 1)));letter-spacing:.1em;margin:8px 0 12px">預かる組に、印を定める</h2>
    <p class="lead">組頭の見習いとなった者は、配下の足軽の指物に組の合印を付ける。<br>戦場で、自分の後ろに並ぶ旗がこれになる。</p>
    <div class="aiji" role="group" aria-label="合印">${kinds.map(([k, n], i) => `<button data-k="${k}" aria-pressed="false" aria-label="${n}の合印を選ぶ"><canvas width="60" height="120" data-mon="${k}"></canvas>${i + 1}．${n}</button>`).join('')}</div>
    <div id="aj-look" aria-live="polite"><p>印を選ぶと、組の旗の並びがここに出ます。</p></div>
    <div class="row"><button class="btn primary" id="aj-ok" disabled>印を選んでください</button></div>
    <p class="note">${isTouch ? '印を押して選び、下の釦で決めます' : '数字キー 1〜3 で選び、決定キーで決めます'}。一度決めた印は、この先ずっと組の旗になります。</p>
  </div>`, false, (e) => { const i = ['1', '2', '3'].indexOf(e.key); if (i >= 0) pick(kinds[i][0]); else if (e.key === 'Enter') { e.preventDefault(); decide(); } });
  document.querySelectorAll('canvas[data-mon]').forEach((c) => drawMon(c.getContext('2d'), c.dataset.mon, 60, 120));
  document.querySelectorAll('.aiji button').forEach((b) => b.onclick = () => pick(b.dataset.k));
  $('aj-ok').onclick = decide;
  document.querySelector('.aiji button')?.focus({ preventScroll: true });
}

// ---------------- 城下（拠点） ----------------
const TOWNS_O = {
  1: { place: '清洲 城下', when: '永禄三年　夏' },
  2: { place: '清洲 城下', when: '永禄四年　夏' },
};

// 宿で聞く噂（次の戦の手がかり）
const RUMORS_O = {
  1: ['美濃の斎藤勢は、先手を前に出して様子を見るのが常らしい', '林の陰から横を突かれると、どんな備えも崩れるものよ'],
  2: ['墨俣は川に面しておる。川沿いから回り込まれると厄介じゃ', '柵の内からなら、槍は届いても敵の刀は届かん'],
};

// 施設の小さな絵
const TAB_ICON = {
  boss: '<svg viewBox="0 0 24 24"><path d="M3 11 L12 4 L21 11"/><path d="M5 10 V20 H19 V10"/><path d="M10 20 V14 H14 V20"/></svg>',
  squad: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20 C3 14, 13 14, 13 20"/><path d="M11 20 C11 14, 21 14, 21 20"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M4 20 L18 6"/><path d="M18 6 L21 3 L20 7 Z"/><path d="M8 4 C 11 6, 11 10, 8 12"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M6 20 V8"/><path d="M4 8 H8"/><path d="M12 20 L18 4"/><circle cx="18" cy="16" r="3"/></svg>',
  inn: '<svg viewBox="0 0 24 24"><path d="M3 18 H21"/><path d="M5 18 V10 H19 V18"/><path d="M8 10 V7 H16 V10"/></svg>',
  people: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18"/><path d="M8 8 H16 M8 12 H16 M8 16 H13"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M5 4 H17 L19 6 V20 H5 Z"/><path d="M8 9 H15 M8 13 H15"/></svg>',
  stable: '<svg viewBox="0 0 24 24"><path d="M4 14 C 6 8, 12 7, 15 9 L 19 6 L 18 11 L 16 12 L 16 19"/><path d="M7 14 V19 M12 13 V19"/></svg>',
  realm: REALM_ICON,
};

// 次の戦の作戦図（上官が見せる）
function missionDiagramO(town) {
  if (town === 1) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect x="0" y="0" width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <text x="10" y="16" fill="#b9b09c" font-size="12">北（斎藤勢）</text>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${100 + i * 12}" y="40" width="9" height="6" fill="#c0452e"/>`).join('')}<text x="98" y="34" fill="#e36a52" font-size="12">敵の先手</text>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${100 + i * 12}" y="100" width="9" height="6" fill="#5b7aa6"/>`).join('')}<text x="98" y="122" fill="#8fb0e0" font-size="12">前備</text>
    <circle cx="240" cy="70" r="16" fill="rgba(111,138,78,.35)"/><text x="228" y="98" fill="#b9b09c" font-size="12">林の端</text>
    <path d="M240 70 L175 45" stroke="#c2a25a" stroke-width="2" marker-end="url(#ar)"/><text x="190" y="72" fill="#c2a25a" font-size="12">横腹を突く</text>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#c2a25a"/></marker></defs>
  </svg>`;
  if (town === 2) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect x="0" y="0" width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <rect x="240" y="0" width="60" height="150" fill="rgba(70,95,105,.45)"/><text x="248" y="140" fill="#8fb0c0" font-size="12">長良川</text>
    <rect x="120" y="50" width="60" height="50" fill="none" stroke="#c2a25a" stroke-width="2"/><text x="128" y="80" fill="#c2a25a" font-size="12">墨俣の砦</text>
    <path d="M150 5 L150 45" stroke="#e36a52" stroke-width="2" marker-end="url(#ar2)"/><text x="156" y="20" fill="#e36a52" font-size="12">北から</text>
    <path d="M20 75 L115 75" stroke="#e36a52" stroke-width="2" marker-end="url(#ar2)"/><text x="24" y="68" fill="#e36a52" font-size="12">西から</text>
    <path d="M225 10 L185 50" stroke="#e36a52" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ar2)"/><text x="196" y="16" fill="#e36a52" font-size="12">川沿い？</text>
    <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#e36a52"/></marker></defs>
  </svg>`;
  return '';
}

// 戦の道のり（尾張・美濃）
function campaignMapO(G) {
  const nodes = [
    { n: '清洲', x: 150, y: 150, home: true },
    { n: '桶狭間', x: 250, y: 215, b: 0 },
    { n: '森部', x: 95, y: 70, b: 1 },
    { n: '墨俣', x: 150, y: 45, b: 2 },
  ];
  const next = G.battle;
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%">
    <path d="M10 110 C 80 100, 200 90, 310 110" stroke="rgba(236,228,210,.15)" stroke-dasharray="4 4" fill="none"/>
    <text x="16" y="100" fill="#7d7566" font-size="11">美濃</text><text x="16" y="130" fill="#7d7566" font-size="11">尾張</text>
    <path d="M60 10 C 90 60, 120 90, 110 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".6"/><text x="118" y="236" fill="#6f8aa0" font-size="11">木曽川</text>
    <path d="M40 10 C 70 50, 90 80, 70 250" stroke="#4f6f86" stroke-width="2" fill="none" opacity=".45"/><text x="44" y="236" fill="#6f8aa0" font-size="11">長良川</text>
    ${nodes.filter((d) => !d.home).map((d) => `<line x1="150" y1="150" x2="${d.x}" y2="${d.y}" stroke="rgba(194,162,90,.25)" stroke-dasharray="3 3"/>`).join('')}
    ${nodes.map((d) => {
      const done = d.b !== undefined && d.b < next;
      const cur = d.b === next;
      return `<g><circle cx="${d.x}" cy="${d.y}" r="${d.home ? 7 : 9}" fill="${d.home ? '#ece4d2' : done ? '#c2a25a' : cur ? '#c0452e' : '#2c2821'}" stroke="#14120f" stroke-width="2">${cur && !RM() ? '<animate attributeName="r" values="9;12;9" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      <text x="${d.x}" y="${d.y + 24}" fill="${cur ? '#f3e6c4' : '#b9b09c'}" font-size="12" text-anchor="middle">${d.n}${done ? '　済' : cur ? '　次' : ''}</text></g>`;
    }).join('')}
  </svg>`;
}

// 人物録
const PEOPLE_O = [
  { k: 'nobunaga', n: '織田信長', r: '尾張の大名', t: '桶狭間で今川義元を破り、名を天下に知られる。手柄を立てた者を身分に関わりなく取り立てる。' },
  { k: 'genpachi', n: '源八', r: '組頭', t: '桶狭間での最初の上官。口は悪いが面倒見がよい。「首は捨てよ」の下知を叩き込んだ男。' },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', t: '同じ組で槍を並べた同輩。気のいい男で、何かと話しかけてくる。' },
  { k: 'osawa', n: '大沢勘兵衛', r: '足軽大将', t: '森部で初めて組を預けてくれた上官。機を待てる者を重んじる。' },
  { k: 'tokichiro', n: '木下藤吉郎', r: '普請奉行', t: '草履取りから身を起こしたと噂される男。口が達者で、妙に人に好かれる。のちの羽柴秀吉。', min: 2 },
  { k: 'yoshimoto', n: '今川義元', r: '駿河・遠江・三河の大名', t: '「海道一の弓取り」と呼ばれた大大名。桶狭間で討たれた。' },
  { k: 'hibino', n: '日比野下野守', r: '斎藤方の武将', t: '森部の戦いで斎藤勢を率いて戦い、討ち死にした。', min: 1 },
];

const MISSIONS_O = {
  1: { title: '美濃・森部へ', text: '斎藤義龍が急死した。殿は美濃へ兵を出される。その方には五人を預け、先手の横を突く役を与える。' },
  2: { title: '墨俣の砦普請を守れ', text: '長良川の西、墨俣に砦を築く。普請を任されたのは木下藤吉郎という男じゃ。斎藤勢の邪魔が入る。組を率いて守り抜け。' },
};

function talksO(G, town, lastResult) {
  const n = G.name;
  const T = [];
  if (town === 1) {
    const headV = lastResult?.lines.some((l) => l.label === '命令違反' && l.detail.includes('首'));
    T.push({
      id: 'gen1', who: '組頭 源八', rel: 'genpachi', at: 'boss',
      lines: [
        headV ? `${n}、首は捨てよと言うたのを忘れたか。……まあよい、よう戦うた` : `${n}、桶狭間ではよう働いた。わしも鼻が高いわ`,
        '殿は手柄を立てた者を身分に関わりなく取り立てなさる。お主にも目をかけておられるぞ',
      ],
      choices: [
        { t: '源八殿のお引き立てのおかげにございます', fx: { like: 6 }, sup: 3, reply: 'はっは、口の上手い奴め。次も頼むぞ' },
        { t: '次は、もっと大きな手柄を立ててご覧に入れます', fx: { trust: 6 }, reply: 'その意気じゃ。じゃが命あっての物種ぞ' },
      ],
    });
    T.push({
      id: 'ya1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、聞いたか。お主、組頭の見習いになるそうじゃな`, 'わしはまだ槍一本の足軽よ。……ちと羨ましいのう'],
      choices: [
        { t: '弥七、わしの組に来ぬか', fx: { like: 8, trust: 4 }, join: 'yashichi', reply: 'ほ、本当か！　お主の下なら喜んで槍を振るうわ（弥七が組に加わった）' },
        { t: '運がよかっただけだ', fx: { like: 4 }, reply: '運も実力のうちよ。次の戦でも死ぬなよ' },
      ],
    });
  } else if (town === 2) {
    T.push({
      id: 'osa1', who: '足軽大将 大沢勘兵衛', rel: 'osawa', at: 'boss',
      lines: [`${n}、森部の働き、しかと見た`, lastResult && lastResult.lines.some((l) => l.label === '命令違反')
        ? 'じゃが合図の前に動いたのはいかん。組頭は、待つことも仕事のうちじゃ'
        : lastResult && lastResult.lines.some((l) => l.label === '側面攻撃成功')
          ? '横槍を入れる機を待てる者は少ない。組頭として申し分ない'
          : '先手を崩したのは見事。次は横腹を突くことも覚えよ'],
      choices: [
        { t: '部下がよく動いてくれました', fx: { trust: 6, like: 4 }, sup: 3, reply: '手柄を部下に分けられる者は、よい大将になる' },
        { t: 'もっと大きな組を率いとうございます', fx: { trust: 3 }, reply: '焦るな。次の戦で結果を出せば、わしが推挙してやる' },
      ],
    });
    T.push({
      id: 'ya2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['近ごろ、木下藤吉郎という男の噂を聞くか？', '草履取りから成り上がったとかで、口が達者で妙に人に好かれるそうじゃ'],
      choices: [
        { t: '会ってみたいものだ', fx: { like: 3 }, reply: 'お主と気が合うかもしれんな。どっちも成り上がり者じゃ' },
        { t: '口先だけの男ではないか', fx: { trust: 3 }, reply: 'さあのう。じゃが殿はそういう者を好まれるからの' },
      ],
    });
  }
  return T;
}

// ---------------- 長篠編の城下 ----------------
// place・when：見出し。mood：その場の一言。fac：施設ごとの場の説明。next：城下での選択が次の戦にどう効くか
const TOWNS_N = {
    1: { place: '長篠城 本丸', when: '天正三年　五月十八日', mood: '囲みが解けた。焼け落ちた櫓の煙が、まだ川霧に混じっている',
    sky: 'linear-gradient(180deg, #3b2a22 0%, #5a3a2a 45%, #2a2019 100%)',
    fac: { boss: '本丸の城主の間。奥平様が、煤けた鎧のまま座っておられる', squad: '本丸の石垣の陰。預かる者たちが槍を磨いている', shop: '本丸の武具蔵。籠城で残った具足を分けてもらう', train: '本丸の広場。焼け跡を片付けながら槍を振る', inn: '炊き出しの小屋。久しぶりの粥の湯気が立つ', stable: '城の厩。籠城で痩せた馬が数頭残るのみ' },
    next: { spear: '夜の砦は狭い。柵の内での一突きが重くなる', vit: '夜の山越えは長い。走っても気力が尽きにくい', lead: '初めて預かる五人が、砦の兵に崩されにくくなる', drill: '五人の体と槍が鍛えられ、夜討ちで押し負けにくい', shop: '暗い砦の中では、兜と胴が不意の一撃を防ぐ', feast: '夜の山越えの前の腹ごしらえ。組の士気が高いまま砦へ着く', rest: '傷を抱えたまま夜の山は越えられない' } },
  2: { place: '設楽原 徳川の陣所', when: '天正三年　五月二十一日 朝', mood: '連吾川の西、三重の柵の内。朝霧の向こうに武田の旗が並ぶ',
    sky: 'linear-gradient(180deg, #27313a 0%, #45525a 50%, #1f2226 100%)',
    fac: { boss: '酒井様の陣幕の内。床几の前に絵図が広げてある', squad: '柵の裏の持ち場。組の者が杭を打ち直している', shop: '陣の具足方。出陣前の最後の手入れ', train: '柵の裏の空き地。騎馬を止める槍の構えを繰り返す', inn: '陣小屋。鉄砲衆が火縄を干している', stable: '陣の馬繋ぎ。使番の馬が行き来する' },
    next: { spear: '柵の前で足の止まった騎馬を突く一撃が重くなる', vit: '柵の切れ目へ駆けつける足が保つ', lead: '十五人の組が、騎馬の突っ込みに怯みにくい', drill: '十五人の練度が上がり、柵の守りが固くなる', shop: '鉄砲の流れ弾と騎馬の槍に、具足の防御が効く', feast: '長い待ちでも、組の士気が落ちにくい', rest: '傷を抱えたままでは、柵の内で踏みとどまれない' } },
  3: { place: '岡崎 城下', when: '天正三年　夏', mood: '長篠の勝ち戦に沸く町。市が立ち、鍛冶の槌の音が響く',
    sky: 'linear-gradient(180deg, #3a3a30 0%, #6a5f45 55%, #2a261e 100%)',
    fac: { boss: '岡崎城下、大久保様の屋敷。庭で若い侍が弓を引いている', squad: '長屋の前の路地。組の者が褒美の銭を数えている', shop: '鍛冶町の具足屋。長篠の褒美で賑わう', train: '城下の馬場。城攻めの梯子を掛ける稽古もできる', inn: '伝馬町の旅籠。旅の商人が遠江の噂を運んでくる', stable: '城下の馬喰町。遠江攻めに備えて馬が集まる' },
    next: { spear: '門の内の乱戦で押し負けにくくなる', vit: '堀を越えて門まで走る間、息が切れにくい', lead: '二十人の組の攻めが強まり、門で崩れにくい', drill: '弓も槍も練度が上がり、城からの打って出に耐える', shop: '城から降る矢玉に、具足が効く', feast: '城攻めの長丁場でも、組の士気が保つ', rest: '傷を抱えたまま城攻めには出られない' } },
};
// 見出しの絵（城と町の影）
function townArtN(town) {
  const hill = (d, c, o = 1) => `<path d="${d}" fill="${c}" opacity="${o}"/>`;
  // 簡単な櫓・天守（x,y は石垣の下の中ほど、s は大きさ）
  const keep = (x, y, s, tiers = 2, c = '#15120e') => {
    let g = `<path d="M${x - 22 * s} ${y} L${x - 17 * s} ${y - 12 * s} L${x + 17 * s} ${y - 12 * s} L${x + 22 * s} ${y} Z" fill="${c}"/>`;
    let yy = y - 12 * s, w = 15 * s;
    for (let i = 0; i < tiers; i++) {
      g += `<rect x="${x - w * 0.8}" y="${yy - 9 * s}" width="${w * 1.6}" height="${9 * s}" fill="${c}"/>`;
      g += `<path d="M${x - w * 1.25} ${yy - 8 * s} L${x} ${yy - 16 * s} L${x + w * 1.25} ${yy - 8 * s} Z" fill="${c}"/>`;
      yy -= 11 * s; w *= 0.7;
    }
    return g;
  };
  const roofs = (x0, x1, y, c, seed = 1) => {
    let g = '', x = x0, k = seed;
    while (x < x1) { k = (k * 9301 + 49297) % 233280; const w = 14 + (k % 12), h = 5 + (k % 5); g += `<rect x="${x}" y="${y - h}" width="${w - 2}" height="${h + 8}" fill="${c}"/><path d="M${x - 3} ${y - h} L${x + w / 2 - 1} ${y - h - 6} L${x + w + 1} ${y - h} Z" fill="${c}"/>`; x += w + 1; }
    return g;
  };
  const flags = (xs, y, c, h = 16) => xs.map((x) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#15120e" stroke-width="1"/><rect x="${x}" y="${y - h}" width="3.5" height="${h * 0.55}" fill="${c}"/>`).join('');
  const smoke = (x, y, h) => `<path d="M${x} ${y} C ${x - 10} ${y - h * 0.3}, ${x + 12} ${y - h * 0.55}, ${x - 4} ${y - h}" stroke="rgba(200,190,175,.28)" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  const svg = (inner) => `<svg viewBox="0 0 600 132" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style="position:absolute;inset:0" aria-hidden="true">${inner}</svg>`;
  // 左の見出しの字が読めるよう、左ほど暗くする
  const shade = '<defs><linearGradient id="thShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".55" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="600" height="132" fill="url(#thShade)"/>';
  if (town === 1) return svg(`
    ${hill('M0 88 C 80 74, 160 80, 240 76 C 330 70, 420 80, 600 72 V132 H0 Z', '#3a2a22', 0.8)}
    ${flags([60, 72, 84, 130, 142, 196], 80, '#8e2f1f', 11)}
    ${hill('M300 132 V96 C 330 86, 360 66, 392 60 L 520 58 C 540 66, 556 84, 580 132 Z', '#1d1813')}
    ${keep(450, 60, 1.4, 2)}
    <path d="M392 62 L 400 48 M404 61 L 412 47 M505 58 L 512 45 M518 58 L 523 48" stroke="#15120e" stroke-width="2"/>
    ${smoke(404, 52, 50)}${smoke(512, 50, 44)}
    <path d="M0 120 C 120 110, 220 124, 320 116 C 420 108, 500 122, 600 114 V132 H0 Z" fill="#2c3a40" opacity=".85"/>
    <path d="M0 127 C 150 119, 260 131, 600 123" stroke="rgba(200,215,220,.25)" stroke-width="1" fill="none"/>${shade}`);
  if (town === 2) return svg(`
    ${hill('M0 70 C 100 60, 200 66, 300 60 C 400 54, 500 64, 600 58 V132 H0 Z', '#3d474e', 0.75)}
    ${flags([250, 262, 274, 330, 342, 354, 420, 432, 444, 520, 532, 544, 556], 66, '#8e2f1f', 11)}
    <path d="M0 84 C 200 80, 400 86, 600 82 V88 C 400 92, 200 86, 0 90 Z" fill="#5a7384" opacity=".55"/>
    ${hill('M0 132 V96 C 150 92, 300 98, 600 94 V132 Z', '#232a2e')}
    ${[0, 1, 2].map((j) => Array.from({ length: 44 }, (_, i) => `<line x1="${170 + i * 10 + j * 4}" y1="${98 + j * 4}" x2="${170 + i * 10 + j * 4}" y2="${85 + j * 4}" stroke="#121211" stroke-width="1.7"/>`).join('') + `<line x1="${168 + j * 4}" y1="${90 + j * 4}" x2="${604}" y2="${90 + j * 4}" stroke="#121211" stroke-width="1.1"/>`).join('')}
    ${flags([260, 330, 390, 520], 110, '#ece4d2', 30)}
    <path d="M450 132 V110 Q 490 114, 530 110 Q 570 114, 604 110 V132 Z" fill="#b8ae98" opacity=".16"/>
    <path d="M446 108 Q 490 113, 530 108 Q 570 113, 604 108" stroke="rgba(20,18,15,.7)" stroke-width="1.5" fill="none"/>
    ${[470, 490, 510, 550, 570, 590].map((x) => `<line x1="${x}" y1="112" x2="${x}" y2="132" stroke="rgba(20,18,15,.35)" stroke-width="1"/>`).join('')}
    <circle cx="530" cy="121" r="6" fill="none" stroke="rgba(20,18,15,.55)" stroke-width="2"/>
    <rect x="0" y="0" width="600" height="132" fill="url(#mistN2)"/>
    <defs><linearGradient id="mistN2" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#9fb0ba" stop-opacity="0"/><stop offset=".6" stop-color="#9fb0ba" stop-opacity=".2"/><stop offset=".78" stop-color="#9fb0ba" stop-opacity="0"/></linearGradient></defs>${shade}`);
  if (town === 3) return svg(`
    ${hill('M0 80 C 120 68, 240 76, 360 70 C 460 64, 540 72, 600 68 V132 H0 Z', '#4a4434', 0.7)}
    ${hill('M420 132 V96 C 450 80, 470 64, 500 60 L 560 60 C 575 70, 590 90, 600 132 Z', '#1f1b15')}
    ${keep(530, 60, 1.25, 3)}
    ${roofs(180, 440, 108, '#1a1712', 3)}
    ${roofs(140, 470, 122, '#15120e', 7)}
    ${smoke(250, 98, 30)}${smoke(360, 98, 26)}
    ${flags([300, 410], 100, '#ece4d2', 18)}
    <path d="M0 128 C 180 122, 360 132, 600 126 V132 H0 Z" fill="#3c4a48" opacity=".7"/>${shade}`);
  return '';
}
// 強右衛門を送り出す前の城下は、長篠城本丸の中身を使い回す（日付と気配だけ替える）
TOWNS_N[0.5] = { ...TOWNS_N[1], when: '天正三年　五月十四日 夕', mood: '囲まれて四日。兵糧蔵の焼け跡に、夕餉の煙も上がらない' };

const RUMORS_N = {
  0.5: ['川の瀬は夜なら渡れる。武田の見張りは松明で分かる', '強右衛門殿は足が速い。見つからねば、三日で岡崎に着く'],
  1: ['鳶ヶ巣山の砦は尾根に五つ並んでおるそうな。一つ落とせば、隣の砦からも見える', '夜の山では声を立てるな。松明も消して進むのが酒井様のやり方じゃ'],
  2: ['武田の騎馬は、柵の前でいったん足が止まる。そこが突きどころよ', '鉄砲は込め直しに間がかかる。その間を槍で埋めるのが足軽の役目'],
  3: ['諏訪原の城は、丸い馬出と三日月の堀で守られておるそうな', '門さえ破れば、城の中は狭い。組をまとめて押し込め'],
};
const MISSIONS_N = {
  0.5: { title: '鳥居強右衛門を岡崎へ送り出せ', text: '城の兵糧は尽きかけておる。強右衛門が囲みを抜け、岡崎の殿へ後詰を願いに走る。夜の川を下る道を、その方が守れ。見つかれば全てが終わる。' },
  1: { title: '鳶ヶ巣山の砦を夜討ちせよ', text: '酒井忠次様が別働隊を率い、夜の山を越えて鳶ヶ巣山の砦を背後から突く。城を抜けたその方にも五人を預ける。声を立てず、法螺の合図で一斉にかかれ。' },
  2: { title: '設楽原の馬防柵を守れ', text: '鳶ヶ巣山が落ち、武田は背を断たれた。勝頼は設楽原へ打って出てくる。その方の組は大久保忠世様の手に加わり、柵の内を守れ。' },
  3: { title: '遠江・諏訪原城を攻めよ', text: '殿は長篠の勢いのまま遠江へ攻め入られる。大井川を見下ろす諏訪原の城を落とせ。丸馬出から打って出る敵を受け止め、門を破れ。' },
};
const PEOPLE_N = [
  { k: 'ieyasu', n: '徳川家康', r: '三河・遠江の大名', mon: 'tokugawa', t: '武田に押され続けた三河の主。長篠の勝ちで、遠江を取り戻す足がかりを得る。' },
  { k: 'okudaira', n: '奥平信昌', r: '長篠城主', mon: 'okudaira', t: '武田から徳川へ寝返り、わずか五百で長篠城を守り抜いた若い城主。' },
  { k: 'sune', n: '鳥居強右衛門', r: '奥平家の足軽', mon: 'okudaira', t: '囲みを抜けて岡崎へ走り、援軍の報せを持ち帰ろうとして捕らえられた。「援軍は来る」と城へ叫んだと伝わる。', min: 1 },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', mon: 'tokugawa', t: '籠城で槍を並べた同輩。気のいい男で、何かと話しかけてくる。' },
  { k: 'sakai', n: '酒井忠次', r: '徳川の宿老', mon: 'katabami', t: '鳶ヶ巣山の夜討ちを進言し、自ら別働隊を率いた。', min: 1 },
  { k: 'okubo', n: '大久保忠世', r: '徳川の侍大将', mon: 'okubo', t: '設楽原で柵の内の一手を率いた。兵を叱るのも褒めるのも大きな声の男。', min: 2 },
  { k: 'katsuyori', n: '武田勝頼', r: '甲斐・信濃の大名', mon: 'takeda', t: '信玄の跡を継いだ武田の主。長篠で多くの宿将を失う。' },
  { k: 'yamagata', n: '山県昌景', r: '武田の宿将', mon: 'akazonae', t: '赤備えを率いた武田随一の猛将。設楽原で討ち死にした。', min: 3 },
];
const REL_N = [['okudaira', '奥平'], ['sakai', '酒井'], ['okubo', '大久保'], ['yashichi', '弥七']];
function missionDiagramN(town) {
  const ar = (id, c) => `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${c}"/></marker></defs>`;
  if (town === 1) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <path d="M10 60 C 80 40, 200 35, 290 55" stroke="rgba(236,228,210,.3)" stroke-width="10" fill="none"/><text x="12" y="30" fill="#b9b09c" font-size="11">尾根（鳶ヶ巣山）</text>
    ${[50, 100, 150, 200, 255].map((x, i) => `<rect x="${x}" y="${44 - (i === 4 ? 6 : 0)}" width="${i === 4 ? 16 : 11}" height="${i === 4 ? 16 : 11}" fill="none" stroke="#e36a52" stroke-width="2"/>`).join('')}
    <path d="M40 140 C 60 110, 80 90, 95 70" stroke="#c2a25a" stroke-width="2" stroke-dasharray="4 3" fill="none" marker-end="url(#an1)"/><text x="50" y="132" fill="#c2a25a" font-size="11">夜の山越え</text>
    <text x="210" y="90" fill="#e36a52" font-size="11">五つの砦を順に</text>${ar('an1', '#c2a25a')}
  </svg>`;
  if (town === 2) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <path d="M190 0 C 185 50, 195 100, 188 150" stroke="#4f6f86" stroke-width="4" fill="none"/><text x="196" y="140" fill="#8fb0c0" font-size="11">連吾川</text>
    ${[120, 132, 144].map((x) => `<line x1="${x}" y1="10" x2="${x}" y2="140" stroke="#c2a25a" stroke-width="2" stroke-dasharray="10 4"/>`).join('')}<text x="60" y="20" fill="#c2a25a" font-size="11">三重の馬防柵</text>
    ${[35, 75, 115].map((y) => `<path d="M285 ${y} L205 ${y}" stroke="#e36a52" stroke-width="2" marker-end="url(#an2)"/>`).join('')}<text x="232" y="20" fill="#e36a52" font-size="11">武田の騎馬</text>${ar('an2', '#e36a52')}
  </svg>`;
  if (town === 3) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <circle cx="210" cy="75" r="48" fill="rgba(236,228,210,.06)" stroke="#e36a52" stroke-width="2"/><text x="190" y="80" fill="#e36a52" font-size="11">本曲輪</text>
    <path d="M150 40 A 45 45 0 0 0 150 110" stroke="#4f6f86" stroke-width="4" fill="none"/><text x="100" y="30" fill="#8fb0c0" font-size="11">三日月堀</text>
    <circle cx="140" cy="75" r="10" fill="none" stroke="#e36a52" stroke-width="2"/><text x="112" y="100" fill="#e36a52" font-size="11">丸馬出</text>
    <path d="M30 75 L125 75" stroke="#c2a25a" stroke-width="2" marker-end="url(#an3)"/><text x="30" y="68" fill="#c2a25a" font-size="11">寄せ手</text>${ar('an3', '#c2a25a')}
  </svg>`;
  return '';
}
function campaignMapN(G) {
  const home = { n: '岡崎', x: 90, y: 185 };
  // 名の置き場（dx, dy, 寄せ）：近い三つの名が重ならないように
  // 印の番号は戦の id から引く（戦が増えても済・次がずれない）
  const bi = (id) => BATTLES.findIndex((x) => x.id === id);
  const nodes = [{ n: '長篠城', x: 205, y: 95, b: bi('nagashinojo'), lx: 16, ly: 22, a: 'start' }, { n: '豊川', x: 190, y: 138, b: bi('sune'), lx: 0, ly: 20, a: 'middle' }, { n: '鳶ヶ巣山', x: 238, y: 72, b: bi('tobinosu'), lx: 0, ly: -16, a: 'middle' }, { n: '設楽原', x: 172, y: 110, b: bi('shitaragahara'), lx: -14, ly: 20, a: 'end' }, { n: '諏訪原', x: 292, y: 205, b: bi('suwahara') }].filter((d) => d.b >= 0);
  const next = G.battle;
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%">
    <path d="M250 0 C 240 80, 260 160, 250 250" stroke="rgba(236,228,210,.15)" stroke-dasharray="4 4" fill="none"/>
    <text x="16" y="30" fill="#7d7566" font-size="11">三河</text><text x="266" y="30" fill="#7d7566" font-size="11">遠江</text>
    <path d="M210 20 C 190 90, 150 150, 70 240" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".6"/><text x="60" y="232" fill="#6f8aa0" font-size="11">豊川</text>
    <path d="M300 60 C 300 120, 296 180, 304 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".45"/><text x="262" y="244" fill="#6f8aa0" font-size="11">大井川</text>
    ${nodes.map((d) => `<line x1="${home.x}" y1="${home.y}" x2="${d.x}" y2="${d.y}" stroke="rgba(194,162,90,.25)" stroke-dasharray="3 3"/>`).join('')}
    <circle cx="${home.x}" cy="${home.y}" r="7" fill="#ece4d2" stroke="#14120f" stroke-width="2"/><text x="${home.x}" y="${home.y + 22}" fill="#b9b09c" font-size="12" text-anchor="middle">${home.n}</text>
    ${nodes.map((d) => {
      const done = d.b < next, cur = d.b === next;
      return `<g><circle cx="${d.x}" cy="${d.y}" r="9" fill="${done ? '#c2a25a' : cur ? '#c0452e' : '#2c2821'}" stroke="#14120f" stroke-width="2">${cur && !RM() ? '<animate attributeName="r" values="9;12;9" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      <text x="${d.x + (d.lx || 0)}" y="${d.y + (d.ly ?? 24)}" fill="${cur ? '#f3e6c4' : '#b9b09c'}" font-size="12" text-anchor="${d.a || 'middle'}">${d.n}${done ? '　済' : cur ? '　次' : ''}</text></g>`;
    }).join('')}
  </svg>`;
}
function talksN(G, town, lastResult) {
  const n = G.name;
  const T = [];
  const viol = lastResult && lastResult.lines.some((l) => l.label === '命令違反');
  if (town === 1) {
    T.push({ id: 'oku1', who: '長篠城主 奥平信昌', rel: 'okudaira', at: 'boss',
      lines: [`${n}、よう持ちこたえてくれた。五百でこの城を守れたのは、皆の槍のおかげじゃ`, '強右衛門は……「援軍は来る」と叫んで果てた。あの男の声が、わしらを生かしたのだ'],
      choices: [
        { t: '強右衛門殿の分まで、槍を振るいます', fx: { like: 8, trust: 3, respect: 2 }, sup: 3, reply: 'うむ。その心を忘れるな。酒井様の手に、その方を推しておいた' },
        { t: '次は城の外で手柄を立てとうございます', fx: { trust: 4, respect: 4 }, reply: '頼もしい。鳶ヶ巣山へ、その方の組を出す' },
      ] });
    T.push({ id: 'yaN1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、お主、組頭の見習いになるそうじゃな`, '籠城で飯も食えなんだが、わしはまだ生きとる。……お主と一緒なら、夜の山も怖くない'],
      choices: [
        { t: '弥七、わしの組に来ぬか', fx: { like: 8, trust: 4 }, join: 'yashichi', reply: 'ほ、本当か！　お主の下なら喜んで槍を振るうわ（弥七が組に加わった）' },
        { t: '腹ごしらえが先じゃ', fx: { like: 4 }, reply: 'ちがいない！　城の粥も、今日は旨かろう' },
      ] });
  } else if (town === 2) {
    T.push({ id: 'sak1', who: '酒井忠次', rel: 'sakai', at: 'boss',
      lines: [`${n}、鳶ヶ巣山の働き、見ておったぞ`, viol ? 'じゃが合図の前に声を立てたのはいかん。夜討ちは、黙って待てる者の勝ちじゃ' : '砦を背から落とされ、勝頼は退くか、前に出るかを迫られた。……奴は前に出る。設楽原じゃ'],
      choices: [
        { t: '組の者がよう動いてくれました', fx: { trust: 6, like: 4, respect: 3 }, sup: 3, reply: '手柄を部下に分けられる者は、よい大将になる。大久保の手へ行け' },
        { t: '設楽原でも槍を振るいとうございます', fx: { trust: 4, respect: 2 }, reply: 'よう言うた。大久保忠世の柵の内に、その方の組を置く' },
        ...(viol ? [{ t: '声を立てたのは、組の者にございます', fx: { wary: 8, like: -4 }, reply: '……組の者の咎は、組頭の咎じゃ。覚えておけ' }] : []),
      ] });
    T.push({ id: 'yaN2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['見たか、あの柵。川に沿って、どこまでも続いておる', '鉄砲も三千挺とか申す。……本当に騎馬が止まるのかのう'],
      choices: [
        { t: '止まるとも。止まった所を突くのがわしらの役目じゃ', fx: { trust: 4, like: 3 }, reply: 'そうか……そうじゃな。お主が言うと、そんな気がしてくる' },
        { t: '止まらなんだら、逃げるまでよ', fx: { like: 5 }, reply: 'はっは、正直な奴め！' },
      ] });
  } else if (town === 3) {
    T.push({ id: 'okb1', who: '侍大将 大久保忠世', rel: 'okubo', at: 'boss',
      lines: [`${n}！　設楽原では柵をよう守った`, viol ? 'じゃが下知なく柵を出たのは許さん。次に背けば、組を取り上げるぞ' : '武田は山県・内藤・馬場を失った。今が遠江を取り戻す時じゃ'],
      choices: [
        { t: '殿のお役に立てるなら、どこへでも', fx: { like: 6, respect: 2 }, sup: 3, reply: 'よし。諏訪原の城攻め、その方の組を先手に加える' },
        { t: '城攻めは初めてにございます。心得を', fx: { trust: 6 }, reply: '堀と馬出に気をつけよ。門が破れるまでは、組を散らして矢玉を避けよ' },
        ...(viol ? [{ t: '柵の外に、討てる敵が見えたゆえ', fx: { wary: 10, trust: -4 }, reply: '言い訳は要らん！　次は下知を待て' }] : [{ t: '次は、わしの組が一番に門をくぐります', fx: { respect: 4, wary: 4 }, reply: '大きく出たな。……口にした以上は、やってみせよ' }]),
      ] });
    T.push({ id: 'yaN3', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['岡崎の町は、長篠の話で持ちきりじゃ', '強右衛門の話を、子どもらが芝居にして遊んでおった'],
      choices: [
        { t: 'あの男のことは、忘れてはならぬ', fx: { like: 5, trust: 3 }, reply: 'ああ。……わしらも、ああいう死に方ができるかのう' },
        { t: 'わしらの話も、いずれ芝居になるわ', fx: { like: 6 }, reply: 'はっは、それなら派手に槍を振るわんとな！' },
      ] });
  }
  return T;
}
// 筋書きごとの城下の中身を引く（織田家編は oda_town.js。次に向かう戦の番号で引く）
setOdaDiagram(missionDiagramO);
const town_ = () => (scenarioKey() === 'oda' ? odaTown() : scenarioKey() === 'nagashino'
  ? { TOWNS: TOWNS_N, RUMORS: RUMORS_N, MISSIONS: MISSIONS_N, PEOPLE: PEOPLE_N, REL: REL_N, diagram: missionDiagramN, map: campaignMapN, talks: talksN, art: townArtN }
  : { TOWNS: TOWNS_O, RUMORS: RUMORS_O, MISSIONS: MISSIONS_O, PEOPLE: PEOPLE_O, REL: [['genpachi', '源八'], ['yashichi', '弥七'], ['osawa', '大沢'], ['tokichiro', '藤吉郎']], diagram: missionDiagramO, map: campaignMapO, talks: talksO, art: null });
// 城下での選択が次の戦にどう効くか（筋書きに一言が無い時の決まり文句）
const NEXT_DEF = { spear: '突きと薙ぎが重くなる', vit: '走っても気力が尽きにくい', lead: '組が崩れにくくなる', drill: '組の者が押し負けにくくなる', shop: '防御が上がり、受ける傷が減る', feast: '組の士気が高いまま戦を始められる', rest: '傷が癒えねば出陣できない' };
const nextHint = (town, k) => ((town_().TOWNS[town] || {}).next || {})[k] || NEXT_DEF[k];

// ---------------- 組の者の負傷・練度・忠誠 ----------------
// 古い保存には無いので、無ければ作る
function soldierOf(r) {
  if (r.loyal == null) r.loyal = r.special === 'yashichi' ? 80 : Math.min(75, 55 + (r.battles || 0) * 5);
  if (r.wound == null) r.wound = 0;
  return r;
}
// 練度（戦場での強さの段。戦歴と稽古で上がり、3が上限。一段ごとに体力と攻撃 +8%）
const skillOf = (r) => Math.max(0, Math.min(3, (r.battles || 0) + (r.drill || 0)));
const WOUND = ['なし', '浅手', '深手'];
// 名から決まる数（開くたびに変わらないように）
const hashOf = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
// 城下に着いた時：戦の傷と、組頭への忠誠を名簿に写す（一つの城下で一度だけ）
function rosterArrive(G, town, last) {
  const R = (G.roster || []).filter((r) => r.alive);
  // 出陣の時に下げた練度を戻す（城下にいる間は傷の重みを掛けない）
  for (const r of R) if (r.woundPen) { r.drill = (r.drill || 0) + r.woundPen; delete r.woundPen; }
  R.forEach(soldierOf);
  const notes = [];
  if (G.rosterAt === town) return notes;
  G.rosterAt = town;
  const st = last && last.stats;
  if (!st || !st.squad) return notes;
  const lost = 1 - st.squadAlive / st.squad;
  const viol = last.lines.filter((l) => l.label === '命令違反').length;
  for (const r of R) {
    if (!(r.battles > 0)) continue;   // 新しく加わった者は、まだ戦に出ていない
    const h = hashOf(r.id + ':' + town);
    const p = 0.12 + lost * 0.6;
    r.wound = Math.max(r.wound, h < p * 0.35 ? 2 : h < p ? 1 : 0);
    let d = (last.mainDone ? 3 : -2) + (lost === 0 ? 3 : lost > 0.4 ? -6 : 0) + (last.promoted ? 3 : 0) - viol * 3;
    if (r.special === 'yashichi') d = Math.max(d, 1);
    r.loyal = Math.max(0, Math.min(100, r.loyal + d));
  }
  // 忠誠が尽きた者は組を去る
  for (const r of R) {
    if (r.loyal < 25 && r.special !== 'yashichi') { G.roster = G.roster.filter((x) => x !== r); notes.push(`${r.name}が暇を願い出て、組を去った`); }
  }
  const w = R.filter((r) => r.wound && G.roster.includes(r));
  if (w.length) notes.push(`手負い：${w.map((r) => `${r.name}（${WOUND[r.wound]}）`).join('、')}`);
  return notes;
}
// 出陣の時：手当てしていない傷は、その戦の練度を下げる（戻すのは次の城下）
function rosterDepart(G) {
  for (const r of (G.roster || []).filter((x) => x.alive)) {
    soldierOf(r);
    if (r.wound && !r.woundPen) { r.woundPen = r.wound; r.drill = (r.drill || 0) - r.wound; r.loyal = Math.max(0, r.loyal - 3); }
  }
}
const TOWN_CSS = `
  .base .th { position: relative; height: 150px; margin: -6px 0 10px; border: 1px solid var(--line); overflow: hidden; }
  .base .th .tt { position: absolute; left: 18px; right: 18px; bottom: 12px; text-shadow: 0 1px 4px #000, 0 0 12px rgba(0,0,0,.8); }
  .base .th .tt small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .3em; color: var(--washi-dim); }
  .base .th .tt b { display: block; font-family: var(--display); font-size: max(12px, calc(30px * var(--text-scale, 1))); letter-spacing: .14em; font-weight: 800; }
  .base .th .tt span { display: block; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi); opacity: .85; margin-top: 2px; }
  .base .fac { font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); margin: -6px 0 14px; padding-left: 12px; border-left: 2px solid var(--line); }
  .base .nx { display: block; margin-top: 4px; font-size: max(12px, calc(12.5px * var(--text-scale, 1))); color: var(--kin); }
  .base .nx::before { content: '次の戦では　'; color: var(--washi-faint); font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .1em; }
  .base .prep { border: 1px solid var(--line); margin: 12px 0; }
  .base .prep h3 { margin: 0; padding: 8px 14px; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .25em; color: var(--washi-dim); font-weight: 500; border-bottom: 1px solid var(--line); }
  .base .prep div { display: grid; grid-template-columns: 6.5em 7.5em 1fr; gap: 10px; padding: 7px 14px; font-size: max(12px, calc(13px * var(--text-scale, 1))); border-bottom: 1px dashed var(--line); align-items: baseline; }
  .base .prep div:last-child { border-bottom: 0; }
  .base .prep span { color: var(--washi-dim); }
  .base .prep em { font-style: normal; font-variant-numeric: tabular-nums; }
  .base .prep .ok em { color: var(--kin); } .base .prep .todo em { color: var(--washi); } .base .prep .warn em { color: #e38a74; }
  .base .prep small { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-faint); }
  .base .choices button .fx { display: block; margin-top: 4px; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-faint); letter-spacing: .04em; }
  .base .choices button .fx i { font-style: normal; margin-right: 10px; }
  .base .choices button .fx .up { color: var(--kin); } .base .choices button .fx .dn { color: #e38a74; }
  .base .roster .rr { grid-template-columns: minmax(8em, 1fr) 30px 58px 44px 52px 50px 108px; gap: 8px; align-items: center; }
  .base .roster .rr > span, .base .roster .rr > div { font-size: max(12px, calc(13px * var(--text-scale, 1))); }
  .base .roster .sk { letter-spacing: 2px; color: var(--kin); }
  .base .roster .sk i { font-style: normal; color: #9a917f; }
  .base .roster .w1 { color: #d9b36a; } .base .roster .w2 { color: #e38a74; } .base .roster .w0 { color: var(--washi-faint); }
  .base .roster .ly { display: grid; grid-template-columns: 1fr 26px; gap: 6px; align-items: center; }
  .base .roster .ly i { display: block; height: 5px; background: var(--sumi-3); position: relative; }
  .base .roster .ly i b { position: absolute; inset: 0; right: auto; background: var(--moegi); }
  .base .roster .ly.low i b { background: var(--shu); }
  .base .roster .talkb { background: none; border: 1px solid var(--line); color: var(--washi); font-size: max(12px, calc(13px * var(--text-scale, 1))); padding: 6px 10px; min-height: 44px; min-width: 44px; cursor: pointer; margin-left: 6px; }
  .base .roster .talkb:disabled { opacity: .38; cursor: default; }
  .base .roster .talkb:hover:not(:disabled) { border-color: var(--washi-dim); color: var(--washi); }
  .base .rlegend { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-faint); margin: 10px 0 0; }
  .base .rlegend b { color: var(--washi-dim); font-weight: 500; margin-right: 4px; }
  .base .tw-prog { margin: 0 0 8px; }
  .base .tw-prog .lbl { display: flex; justify-content: space-between; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-prog .lbl b { color: var(--kin); font-weight: 500; }
  .base .tw-prog i { display: block; height: 8px; background: var(--sumi-3); margin: 6px 0 4px; position: relative; box-shadow: 0 0 0 1px rgba(236,228,210,.35); }
  .base .tw-prog i b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .base .tw-prog small { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-faint); }
  .base .tw-warn { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: #e38a74; font-weight: 400; }
  .base details.tw-more summary { cursor: pointer; font-size: max(12px, calc(13.5px * var(--text-scale, 1))); color: var(--washi-dim); padding: 12px 0; min-height: 44px; box-sizing: border-box; border-bottom: 1px solid var(--line); }
  .base details.tw-more summary small { color: var(--washi-faint); font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .base .tw-day { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 6px; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-day .koku { display: inline-flex; gap: 4px; }
  .base .tw-day .koku i { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--kin); }
  .base .tw-day .koku i.on { background: var(--kin); }
  .base .tw-day b { color: var(--washi); font-weight: 500; }
  .base .tw-day small { color: var(--washi-faint); font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .base .tabs .tdot.td2 { background: none; color: var(--kin); box-shadow: inset 0 0 0 1px var(--kin); }
  .base .tw-up { margin-left: 10px; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--kin); border: 1px solid rgba(194,162,90,.6); padding: 0 6px; }
  .base .tw-said { margin-top: 6px; color: var(--washi-dim); }
  .base .tw-said .fx { display: inline; margin-left: 10px; font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .base .tw-said .fx i { font-style: normal; margin-right: 8px; }
  .base .tw-said .fx .up { color: var(--kin); } .base .tw-said .fx .dn { color: #e38a74; }
  .base .tw-left { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  .base .tw-left > span { width: 100%; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .th .tw-steps, .base .tw-steps { position: absolute; right: 12px; top: 10px; display: flex; gap: 0; margin: 0; padding: 0; list-style: none; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-steps li { display: flex; align-items: center; gap: 4px; }
  .base .tw-steps li + li::before { content: ''; order: -2; width: 14px; height: 1px; background: var(--washi-faint); margin: 0 6px; }
  .base .tw-steps li::after { content: ''; order: -1; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--washi-dim); }
  .base .tw-steps li.on { color: var(--washi); } .base .tw-steps li.on::after { background: var(--kin); border-color: var(--kin); }
  .base > main > .tw-steps { position: static; margin: 0 0 8px; }
  .base .tw-walk { min-height: 44px; margin: 0 0 12px; }
  .base .tw-first { border: 1px solid rgba(194,162,90,.55); border-left: 3px solid var(--kin); padding: 8px 12px; margin: 0 0 12px; font-size: max(12px, calc(13.5px * var(--text-scale, 1))); line-height: 1.7; }
  .base .tw-first b { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--kin); font-weight: 500; }
  .base .tw-new { display: inline-block; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--kin); border: 1px solid rgba(194,162,90,.6); padding: 0 4px; margin-right: 6px; line-height: 1.4; }
  .base .tw-stage { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--kin); letter-spacing: .08em; margin: 2px 0 4px; }
  .base .tw-dead { border: 1px solid #0b0a08; background: #0b0a08; color: var(--washi); padding: 4px 10px; font-size: max(12px, calc(13px * var(--text-scale, 1))); letter-spacing: .1em; margin: 6px 0 0; outline: 1px solid var(--washi-faint); outline-offset: -4px; }
  .base .tw-ledger { font-size: max(12px, calc(12.5px * var(--text-scale, 1))); color: var(--washi-dim); margin: 4px 0 0; font-variant-numeric: tabular-nums; }
  .base .tw-autosave { color: var(--washi-faint); }
  .base .btn.tw-sorton { box-shadow: inset 0 -3px 0 var(--kin); border-color: var(--kin); color: var(--washi); }
  .base .tw-realm { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
  .base .tw-realm small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--kin); margin-bottom: 6px; }
  .base .tw-legend { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); margin: 4px 0 8px; }
  .base .tw-next { display: flex; align-items: center; gap: 12px; border: 1px solid var(--gold-line, var(--line)); border-left: 4px solid var(--shu); background: rgba(20,18,15,.6); padding: 8px 8px 8px 14px; margin: 0 0 10px; }
  .base .tw-next .m { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
  .base .tw-next .m small { font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--washi-dim); }
  .base .tw-next .m b { font-family: var(--display); font-size: max(12px, calc(20px * var(--text-scale, 1))); letter-spacing: .1em; }
  .base .tw-next .m span { flex-basis: 100%; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-next .btn { min-height: 48px; flex: none; }
  .base .tw-next .btn.tw-map { min-height: 44px; }
  .base .tw-next .m span.lock { font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .base .tw-tabg { gap: 4px 0; align-items: flex-end; }
  .base .tw-tabg .grp { display: inline-flex; flex-wrap: wrap; align-items: center; padding-right: 10px; margin-right: 10px; border-right: 1px solid var(--line); }
  .base .tw-tabg .grp:last-child { border-right: 0; margin-right: 0; }
  .base .tw-tabg .gl { font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .1em; color: var(--washi-faint); margin-right: 4px; writing-mode: horizontal-tb; }
  .base .tw-recs { margin-top: 10px; }
  .base .tw-recs small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .15em; color: var(--washi-dim); margin-bottom: 4px; }
  .base .tw-recs small span { margin-left: 8px; padding: 0 6px; border: 1px solid var(--line); letter-spacing: .05em; color: var(--washi-dim); }
  .base .tw-recs .row, .base .tw-self { gap: 8px; flex-wrap: wrap; margin-top: 0; }
  .base .tw-mis { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-left: 3px solid var(--shu); padding: 8px 8px 8px 14px; margin: 0; }
  .base .tw-mis .m { flex: 1; font-size: max(12px, calc(16px * var(--text-scale, 1))); letter-spacing: .06em; }
  .base .tw-mis .m small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .2em; color: var(--washi-dim); }
  .base .tw-mis .btn { min-height: 48px; }
  .base details.tw-misd summary { border-bottom: 0; padding: 8px 0; }
  .base .tw-h { display: flex; align-items: baseline; gap: 12px; font-size: max(12px, calc(15px * var(--text-scale, 1))); letter-spacing: .16em; font-weight: 500; margin: 14px 0 8px; font-family: var(--display); }
  .base .tw-h small { font-family: var(--sans, inherit); font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .08em; color: var(--washi-dim); font-weight: 400; }
  .base .tw-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .base .tw-card { border: 1px solid var(--line); background: rgba(236,228,210,.035); padding: 12px; display: flex; flex-direction: column; gap: 6px; min-height: 150px; box-sizing: border-box; }
  .base .tw-card .ic svg { width: 24px; height: 24px; stroke: var(--kin); fill: none; stroke-width: 1.6; }
  .base .tw-card b.t { font-family: var(--display); font-size: max(12px, calc(18px * var(--text-scale, 1))); letter-spacing: .06em; line-height: 1.35; }
  .base .tw-card .ef { margin: 0; font-size: max(12px, calc(13.5px * var(--text-scale, 1))); line-height: 1.5; color: var(--kin); }
  .base .tw-card .ef::before { content: '次の戦　'; color: var(--washi-dim); font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  .base .tw-card .btn { margin-top: auto; min-height: 44px; width: 100%; }
  .base .tw-card.off { opacity: .55; }
  .base .tw-card.done { border-color: var(--kin); background: rgba(194,162,90,.12); }
  .base .tw-card .res { margin-top: auto; display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; }
  .base .tw-card .res b { font-family: var(--display); font-size: max(12px, calc(30px * var(--text-scale, 1))); line-height: 1.1; color: var(--kin); font-variant-numeric: tabular-nums; }
  .base .tw-card .res span { font-size: max(12px, calc(14px * var(--text-scale, 1))); }
  .base .tw-card .res small { flex-basis: 100%; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-card.pop { animation: twpop .7s ease-out; }
  @keyframes twpop { 0% { transform: scale(.97); box-shadow: 0 0 0 0 rgba(194,162,90,.7); } 60% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(194,162,90,0); } 100% { transform: none; } }
  @media (prefers-reduced-motion: reduce) { .base .tw-card.pop { animation: none; } }
  .base .tw-ready { color: var(--kin); margin: 8px 0 0; }
  .base .tw-ev { position: relative; }
  .base .tw-ev .where { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); letter-spacing: .16em; color: var(--washi-dim); }
  .base .tw-gain { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 4px 0 6px; }
  .base .tw-gain span { display: inline-flex; align-items: baseline; gap: 6px; border: 1px solid var(--kin); background: rgba(194,162,90,.12); padding: 2px 10px; font-size: max(12px, calc(13px * var(--text-scale, 1))); }
  .base .tw-gain b { font-family: var(--display); font-size: max(12px, calc(20px * var(--text-scale, 1))); color: var(--kin); }
  .base .tw-gain small { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-sup { margin: 10px 0; }
  .base .tw-sup .lbl { display: flex; justify-content: space-between; align-items: baseline; font-size: max(12px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
  .base .tw-sup .lbl b { font-size: max(12px, calc(18px * var(--text-scale, 1))); color: var(--washi); font-weight: 500; }
  .base .tw-sup .lbl b small { font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); margin-left: 4px; }
  .base .tw-sup i { display: block; position: relative; height: 8px; background: var(--sumi-3); margin: 6px 0 4px; box-shadow: 0 0 0 1px rgba(236,228,210,.35); }
  .base .tw-sup i b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .base .tw-sup i b.lo { background: #c98a5a; }
  .base .tw-sup i s { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 2px; background: var(--washi); }
  .base .tw-sup > small { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); line-height: 1.6; color: var(--washi-dim); }
  .base .tw-sup > small em { font-style: normal; color: #e9a58f; display: block; }
  .base .tw-free { display: block; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); font-weight: 400; text-align: right; }
  @media (max-height: 520px) {
    .base .tw-cards { gap: 8px; }
    .base .tw-card { min-height: 0; padding: 8px 10px; gap: 4px; }
    .base .tw-card .ic { display: none; }
    .base .tw-card b.t { font-size: max(12px, calc(15px * var(--text-scale, 1))); }
    .base .tw-card .ef { font-size: max(12px, calc(12.5px * var(--text-scale, 1))); }
    .base .tw-card .res b { font-size: max(12px, calc(24px * var(--text-scale, 1))); }
    .base .tw-h { margin: 10px 0 6px; }
    .base .tw-mis { padding: 4px 4px 4px 10px; }
    .base .tw-mis .m { font-size: max(12px, calc(15px * var(--text-scale, 1))); }
    #screen .base .th { height: 54px; }
    #screen .base .th .tt small { display: none; }
    #screen .base .th .tt { bottom: 8px; }
    .base .tw-mis { margin-top: 8px; }
    .base .tw-next { padding: 4px 4px 4px 10px; margin-bottom: 6px; }
    .base .tw-next .m b { font-size: max(12px, calc(17px * var(--text-scale, 1))); }
    .base .tw-next .m span { flex-basis: auto; }
  }
  @media (max-width: 560px) { .base .tw-cards { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .base .roster .rr { grid-template-columns: minmax(7em, 1fr) 28px 50px 40px 48px 44px 90px; gap: 6px; } }
`;
function townCssOnce() {
  if (!document.getElementById('town-card-css')) { const st = document.createElement('style'); st.id = 'town-card-css'; st.textContent = TOWN_CSS; document.head.appendChild(st); }
  return '';
}

// opts（城下を歩く時。main.js の townOpen）：{ tab 開く札, go 出陣の確かめから, onLeave 町へ戻る }
export function baseScreen(G, town0, lastResult, game, opts = {}) {
  // 稽古や買い物で描き直しても、一言は開いた時のままにする。
  const townTip = pickTip();
  // 長篠編は戦が増えても（強右衛門の脱出など）、城下の中身は「次に向かう戦」で引く
  const nextId = BATTLES[town0] && BATTLES[town0].id;
  const town = scenarioKey() === 'nagashino' ? ({ sune: 0.5, tobinosu: 1, shitaragahara: 2, suwahara: 3 }[nextId] ?? town0) : town0;
  const TW = town_();
  const info = { ...TW.TOWNS[town] };
  // 長島・三木・鳥取：前の戦で動いた包囲の値（kakoi.js）を、城下の一言に小さく足す
  const kInfo = (G.kakoi || {})[(lastResult && lastResult.kakoiId) || nextId];
  if (kInfo) info.mood = `${info.mood || ''}　――　${kakoiGaugeText(kInfo)}・${kakoiStageWord(kInfo)}`;
  // 戦の傷と忠誠を名簿へ（古い保存には無い値もここで作る）
  const arriveNotes = rosterArrive(G, town, lastResult);
  for (const [k] of TW.REL) relOf(G, k);
  save(G);
  let tab = opts.tab || 'boss';
  let confirmGo = !!opts.go;
  const T = TW.talks(G, town, lastResult);
  // 施設は消さずに、組に分けて並べる：城下（始めの札）／準備／生活・成長／記録（kaito 9/30 UI 整理）
  // 城下の「稽古」は本編の槍・体力・統率・組の稽古（3D の稽古場＝腕試しとは別）
  const TAB_GROUPS = [
    ['', [['boss', '城下']]],
    ['準備', [...(scenarioKey() === 'oda' && !G.lord ? [['realm', '知行']] : []), ['squad', '組'], ['shop', '武具屋'], ['toiya', '問屋']]],
    ['生活・成長', [['train', '稽古'], ['inn', '宿'], ['stable', '馬屋']]],
    ['記録（この物語）', [['people', '人物録'], ['journal', '日誌']]],
  ];
  const tabs = TAB_GROUPS.flatMap(([, L]) => L);
  let rosterSort = 'battles';
  const trainedNow = {};   // この城下で稽古して伸ばした物（札に残す）
  const free = S.freeMoney !== false && G.kan >= 99999;   // 試しの間は銭が使い放題
  // ---- 入口の「今日やると良いこと」：やった事と、その場で見せる効き目 ----
  const res = {};          // 札の鍵 → { big, lbl, sub }（やった後に札へ出す）
  let pickKeys = null;     // 城下に入った時に決めた三つ（やっても入れ替えない）
  const pickT = {};        // その札の題
  let popKey = null;       // いま光らせる札
  const talkGain = {};     // 話の id → 上官の評価の前後
  const trainK = (k) => {
    const before = G.stats[k];
    G.stats[k]++; G.actions--; trainedNow[k] = (trainedNow[k] || 0) + 1; sfx('taiko', 0.5);
    // 次の戦の評価で「稽古が効いた」を出すために覚えておく（792）
    G.trainedFor = G.trainedFor && G.trainedFor.battle === G.battle ? G.trainedFor : { battle: G.battle }; G.trainedFor[k] = (G.trainedFor[k] || 0) + 1;
    (G.journal = G.journal || []).push({ t: `${TW.TOWNS[town].when}　稽古`, s: `${{ spear: '槍の稽古', vit: '走り込み', lead: '采配の稽古' }[k]}に励んだ。` });
    return before;
  };
  const drillAll = () => { let n = 0; for (const r of G.roster || []) if (r.alive && !r.wound) { r.drill = Math.min(2, (r.drill || 0) + 1); n++; } G.drilled = town; G.trainedFor = G.trainedFor && G.trainedFor.battle === G.battle ? G.trainedFor : { battle: G.battle }; G.trainedFor.drill = 1; G.actions--; sfx('taiko', 0.5); return n; };
  const feastDo = () => { if (!free) G.kan -= 5; spendLog(G, '振る舞い', 5); G.feast = true; for (const r of G.roster || []) if (r.alive) { soldierOf(r); r.loyal = Math.min(100, r.loyal + 6); } sfx('merit'); };
  const treatCostOf = () => Math.max(2, (G.roster || []).filter((r) => r.alive && r.wound).reduce((a, r) => a + r.wound, 0));
  const treatDo = () => { const L = (G.roster || []).filter((r) => r.alive && r.wound); const cost = treatCostOf(); if (G.kan < cost) return 0; G.kan -= cost; spendLog(G, '傷の手当て', cost); for (const r of L) { r.wound = 0; r.loyal = Math.min(100, r.loyal + 4); } sfx('ui'); return L.length; };
  const restDo = () => { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions--; sfx('ui'); };
  const buyable = (id, it) => it.cost && !G.owned.includes(id) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank);
  // 買える物のうち、防御（槍なら威力）がいちばん上がる物
  const recItem = () => {
    let rec = null, recGain = 0;
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it.slot || it.slot === 'side' || it.slot === 'gun' || it.slot === 'bow' || !buyable(id, it)) continue;
      const cur = G.equip[it.slot] ? ITEMS[G.equip[it.slot]] : null;
      const gain = (it.def || 0) - (cur?.def || 0) + ((it.mult || 0) - (cur?.mult || 0)) * 0.5;
      if (gain > recGain) { recGain = gain; rec = id; }
    }
    return rec;
  };
  // 買うと何が変わるか（防御の % か、槍の威力の %）
  const gainOf = (id) => {
    const it = ITEMS[id];
    if (it.mult !== undefined) { const cur = G.equip[it.slot] ? ITEMS[G.equip[it.slot]] : null; const a = Math.round((cur?.mult || 1) * 100), b = Math.round(it.mult * 100); return { lbl: '槍の威力', a, b }; }
    const keep = G.equip[it.slot]; const a = Math.round(equipDef(G) * 100); G.equip[it.slot] = id; const b = Math.round(equipDef(G) * 100); G.equip[it.slot] = keep;
    return { lbl: '防御', a, b };
  };
  const PICK_IC = {
    rest: TAB_ICON.inn, treat: TAB_ICON.inn, feast: TAB_ICON.inn, drill: TAB_ICON.squad, spear: TAB_ICON.train, vit: TAB_ICON.train, lead: TAB_ICON.train, care: TAB_ICON.stable, talk: TAB_ICON.people,
  };
  // いま出せる「やると良いこと」を、効きの大きい順に
  const candidates = () => {
    const C = [];
    const R = (G.roster || []).filter((r) => r.alive);
    const can = G.actions > 0 && !G.injured;
    if (G.injured) C.push({ k: 'rest', t: '宿で傷を癒やす', ef: '癒えねば出陣できない', btn: '一刻休む' });
    const hurt = R.filter((r) => r.wound).length;
    if (hurt) C.push({ k: 'treat', t: '組の傷を手当てする', ef: `手負い${hurt}人が本来の力で戦う`, btn: free ? '手当てする' : `${zeni(treatCostOf())}で手当て` });
    const bt = T.find((t) => t.at === 'boss' && !G.talked[t.id]);
    if (bt) C.push({ k: 'talk', id: bt.id, t: `${bt.who}に会う`, ef: bt.choices.some((c) => c.sup) ? '上官の評価が上がる（昇進に要る）' : '信頼が上がる', btn: '話を聞く' });
    if (G.rank >= 1 && can && G.drilled !== town && R.some((r) => !r.wound)) C.push({ k: 'drill', t: '組の者を鍛える', ef: '組の強さ +8%（練度 +1）', btn: '一刻かけて鍛える' });
    const rec = recItem();
    if (rec) { const g = gainOf(rec); C.push({ k: 'buy', id: rec, t: `${ITEMS[rec].name}を買う`, ef: `${g.lbl} ${g.a}% → ${g.b}%`, btn: free ? '買って着ける' : `${zeni(ITEMS[rec].cost)}で買う` }); }
    if (can) C.push({ k: 'spear', t: '槍の稽古', ef: `突きの重さ +10%（槍術 ${G.stats.spear} → ${G.stats.spear + 1}）`, btn: '一刻かけて稽古' });
    if (G.rank >= 1 && !G.feast && (free || G.kan >= 5)) C.push({ k: 'feast', t: '組に酒を振る舞う', ef: '始めの組の士気 +10', btn: free ? '振る舞う' : '5貫で振る舞う' });
    if (ladderStep(G) >= 2 && can && ((G.horse || {}).bond || 0) < 5) C.push({ k: 'care', t: '馬の手入れ', ef: '馬の体力と息 +4%', btn: '一刻かけて手入れ' });
    const it = T.find((t) => t.at !== 'boss' && !G.talked[t.id]);
    if (it) C.push({ k: 'talk', id: it.id, t: `${it.who}の話を聞く`, ef: '好感が上がる', btn: '話を聞く' });
    if (can) C.push({ k: 'vit', t: '走り込み', ef: `息が長くなる（体力 ${G.stats.vit} → ${G.stats.vit + 1}）`, btn: '一刻かけて走る' });
    return C;
  };
  const pickNow = () => {
    const C = candidates();
    if (!pickKeys) { pickKeys = C.slice(0, 3).map((c) => c.k + ':' + (c.id || '')); C.slice(0, 3).forEach((c) => { pickT[c.k + ':' + (c.id || '')] = c.t; }); }
    return pickKeys.map((key) => {
      const [k, id] = key.split(':');
      return { key, k, id, c: C.find((c) => c.k === k && (c.id || '') === id), r: res[key] };
    });
  };
  const doPick = (key) => {
    const [k, id] = key.split(':');
    let r = null;
    if (k === 'spear' || k === 'vit') { const b = trainK(k); r = k === 'spear' ? { big: '+10%', lbl: '突きの重さ', sub: `槍術 ${b} → ${G.stats.spear}` } : { big: '+10', lbl: '体力', sub: `気力も +12（体力 ${b} → ${G.stats.vit}）` }; }
    else if (k === 'drill') { const n = drillAll(); r = { big: '+8%', lbl: '組の強さ', sub: `${n}人の練度が一段上がった` }; }
    else if (k === 'treat') { const n = treatDo(); if (!n) return; r = { big: `${n}人`, lbl: '傷が癒えた', sub: '本来の力で出陣できる・忠誠 +4' }; }
    else if (k === 'feast') { feastDo(); r = { big: '+10', lbl: '始めの士気', sub: '組の者の忠誠 +6' }; }
    else if (k === 'rest') { restDo(); r = { big: '癒えた', lbl: '', sub: '出陣できる' }; }
    else if (k === 'care') { G.horse = G.horse || { id: 'tsukikage', bond: 0 }; const b = G.horse.bond || 0; G.horse.bond = Math.min(5, b + 1); G.actions--; sfx('neigh', 0.4); r = { big: '+4%', lbl: '馬の体力と息', sub: `絆 ${b} → ${G.horse.bond}` }; }
    else if (k === 'buy') {
      const it = ITEMS[id]; if (!it || G.kan < it.cost) return;
      const g = gainOf(id);
      if (!free) G.kan -= it.cost; G.owned.push(id); spendLog(G, it.name, it.cost); G.equip[it.slot] = id; sfx('merit');
      r = { big: `+${g.b - g.a}%`, lbl: g.lbl, sub: `${g.a}% → ${g.b}%・着けると戦場の姿も変わる` };
    }
    else if (k === 'talk') { const el = document.getElementById('tw-ev-' + id); if (el) { scrollIn(el, 'start'); el.querySelector('button')?.focus({ preventScroll: true }); } return; }
    if (!r) return;
    res[key] = r; popKey = key; saved(); render();
  };
  // 城下での事はその場で保存する。知らせは出さず、出陣の前に一度だけ（780）
  // 買う・着ける・話すの後は、描き直しても見ていた所と押した釦（無ければ施設の札）に戻す（961）
  let keepNext = false;
  const saved = () => { save(G); keepNext = true; };
  let preview = null;

  // 城下 → 心得 → 出陣 の三つの点（いまは城下。797）
  const stepsHtml = '<ol class="tw-steps" aria-label="出陣までの流れ：いまは城下"><li class="on" aria-current="step">城下</li><li>心得</li><li>出陣</li></ol>';
  // 出陣の前のやり残し（無ければ、出陣は一度押すだけで出る。781）
  const leftoversOf = () => {
    const L = [];
    const cheap = Object.values(ITEMS).some((it) => it.cost && it.slot !== 'gun' && it.slot !== 'bow' && !G.owned.includes(Object.keys(ITEMS).find((k) => ITEMS[k] === it)) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank));
    if (G.actions > 0 && !G.injured) L.push(['train', `稽古の時間があと${G.actions}刻`]);
    if ((G.roster || []).some((r) => r.alive && r.wound)) L.push(['inn', '手負いの者が組にいる']);
    if (cheap) L.push(['shop', free ? '今の銭で買える具足がある' : `${zeni(G.kan)}で買える具足がある`]);
    if (G.rank >= 1 && !G.feast && G.kan >= 5) L.push(['inn', 'まだ組に振る舞っていない']);
    return L;
  };
  // 出陣の前に確かめの札を挟むのは、手負いの者が組にいる時だけ（稽古や買い物のやり残しでは止めない。手数を減らす）
  const needAsk = () => leftoversOf().some(([k, t]) => k === 'inn' && /手負い/.test(t));
  // 出陣する：ここで一度だけ「保存しました」を出す
  const depart = () => { sfx('ui'); rosterDepart(G); save(G); notice('出陣する'); game.nextBattle(); };
  const render = () => {
    stopFirstHelp();
    const keep = keepNext; keepNext = false;
    const sy0 = $('screen') ? $('screen').scrollTop : 0;
    const actEl = document.activeElement;
    const aKey = keep && actEl && actEl.attributes ? [...actEl.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-tab') : null;
    const aSel = aKey ? `[${aKey.name}="${CSS.escape(aKey.value)}"]` : null;
    const next = RANKS[G.rank + 1];
    const eqNames = ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat'].map((k) => G.equip[k]).filter(Boolean).map((id) => ITEMS[id].name).join('・');
    const aside = `<aside>
      <div class="eyebrow">${TW.art ? '' : `${esc(info.place)}　・　${esc(info.when)}　・　`}${['夕刻', '昼', '朝'][Math.max(0, Math.min(2, G.actions))]}</div>
      <h2>${esc(G.name)}</h2>
      <div class="rank">${esc(RANKS[G.rank].name)}</div>
      <details class="tw-more aside-more"><summary>その他</summary>
      <div class="row tw-self" style="margin-top:10px;gap:8px"><button class="btn small" id="b-ladder-town">出世の道を見る</button><button class="btn small" id="b-set-town">設定</button><button class="btn small" id="b-title-town">タイトルへ</button></div>
      <div class="tw-recs" role="group" aria-labelledby="tw-recs-h"><small id="tw-recs-h">記録<span>全保存データ共通</span></small><div class="row"><button class="btn small" id="b-zukan-town">武将図鑑</button><button class="btn small" id="b-ach-town">実績</button><button class="btn small" id="b-rec-town">戦の年表を見る</button></div></div>
      ${G.rank >= 4 || G.battle >= BATTLES.length ? `<div class="tw-realm" role="group" aria-label="天下の地図"><small>天下の地図</small><div class="row"><button class="btn small" data-jp="naisei">領地と内政</button><button class="btn small" data-jp="busho">家臣</button><button class="btn small" data-jp="shiro">城攻めと外交</button><button class="btn small" data-jp="tenka">天下の動き</button></div></div>` : ''}
      </details>
      <div style="height:12px"></div>
      ${(() => {
        if (!next) return `<div class="stat"><span>累計戦功</span><b>${G.merit}</b></div>`;
        // 戦功は足りても、戦ごとに上がれる身分の上限（RANK_CEIL）で止まる事がある。その時は「あと0」と言わず、上がれる戦の名で言う
        const ceilNow = RANK_CEIL[G.battle] ?? RANKS.length - 1;
        if (G.merit >= next.min && ceilNow < G.rank + 1) {
          const bi = RANK_CEIL.findIndex((c, idx) => idx >= G.battle && c >= G.rank + 1);
          const when = bi >= 0 && BATTLES[bi] ? `${BATTLES[bi].name.replace(/の戦い$/, '')}の後に取り立て` : 'この先の戦で取り立て';
          return `<div class="tw-prog" role="group" aria-label="次の身分「${esc(next.name)}」まで"><div class="lbl"><span>次は「${esc(next.name)}」</span><b>戦功は足りた</b></div><i><b style="width:100%"></b></i><small>${esc(when)}</small></div>`;
        }
        return `<div class="tw-prog" role="progressbar" aria-label="次の身分「${esc(next.name)}」まで" aria-valuemin="${RANKS[G.rank].min}" aria-valuemax="${next.min}" aria-valuenow="${Math.min(next.min, G.merit)}" aria-valuetext="累計戦功 ${G.merit}／${next.min}"><div class="lbl"><span>次は「${esc(next.name)}」</span><b>あと ${Math.max(0, next.min - G.merit)}</b></div><i><b style="width:${Math.min(100, Math.max(0, (G.merit - RANKS[G.rank].min) / (next.min - RANKS[G.rank].min)) * 100)}%"></b></i><small>累計戦功 ${G.merit} ／ ${next.min}</small></div>`;
      })()}
      <div class="tw-sup" role="group" aria-label="上官の評価 ${G.superior}。昇進には50が要る"><div class="lbl"><span>上官の評価</span><b>${G.superior}<small>／昇進に 50</small></b></div><i><b style="width:${G.superior}%" class="${G.superior < 50 ? 'lo' : ''}"></b><s></s></i><small>${G.superior < 50 ? `<em>あと ${50 - G.superior} で昇進できる。</em>` : ''}上げ方：任務 +10・手柄 +5・上役と話す +2</small></div>
      <div class="stat"><span>所持金</span><b>${free ? '使い放題<small class="tw-free">試しの間</small>' : zeni(G.kan)}</b></div>
      ${G.injured ? '<div class="stat"><span>負傷</span><b style="color:#e38a74">重傷（要休息）</b></div>' : ''}
      <details class="tw-more"><summary>細かな力　<small>槍${G.stats.spear}・体${G.stats.vit}・統${G.stats.lead}・防${Math.round(equipDef(G) * 100)}%</small></summary>
        <div class="stat"><span>槍術</span><b>${G.stats.spear}</b></div>
        <div class="stat"><span>体力</span><b>${G.stats.vit}</b></div>
        <div class="stat"><span>統率</span><b>${G.stats.lead}</b></div>
        <div class="stat"><span>具足の防御</span><b>${Math.round(equipDef(G) * 100)}%</b></div>
        <div class="stat"><span>組の人数</span><b>${RANKS[G.rank].squad}人</b></div>
      </details>
    </aside>`;
    let body = '';
    if (tab === 'boss') {
      const m = TW.MISSIONS[town] || { text: "" };   // 任務の無い町（野田・福島の前など）でも落ちない
      const cheap = Object.values(ITEMS).filter((it) => it.cost && it.slot !== 'gun' && it.slot !== 'bow' && !G.owned.includes(Object.keys(ITEMS).find((k) => ITEMS[k] === it)) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank));
      const leftovers = leftoversOf();
      // 次の戦への備え：城下での選択が、次の戦のどこに効くかをまとめて見せる
      const R0 = (G.roster || []).filter((r) => r.alive);
      const hurt = R0.filter((r) => r.wound).length;
      const prep = [
        ['稽古', G.actions > 0 && !G.injured ? `あと ${G.actions} 刻` : '済', G.actions > 0 && !G.injured ? 'todo' : 'ok', '訓練場で槍・体力・采配を伸ばす'],
        ['具足', `防御 ${Math.round(equipDef(G) * 100)}%`, cheap.length ? 'todo' : 'ok', cheap.length ? `${nextHint(town, 'shop')}（${zeni(G.kan)}で買える物がある）` : nextHint(town, 'shop')],
        ...(R0.length ? [['組の傷', hurt ? `${hurt}人が手負い` : 'みな無事', hurt ? 'warn' : 'ok', hurt ? '手負いのまま出ると、その者の練度が下がる。宿で手当てを' : '全員が本来の力で戦える']] : []),
        ...(G.rank >= 1 ? [['振る舞い', G.feast ? '済' : 'まだ', G.feast ? 'ok' : 'todo', nextHint(town, 'feast')]] : []),
        ['上官の評価', String(G.superior), G.superior < 50 ? 'warn' : 'ok', G.superior < 50 ? '50未満では昇進できない。上官と話して挽回を' : '昇進の条件を満たしている'],
        ...(G.injured ? [['自分の傷', '重傷', 'warn', nextHint(town, 'rest')]] : []),
      ];
      // 出陣の釦を上に置く（上官との話は下へ。狭い画面でも、開いてすぐ「出陣」に指が届くように）
      // 入口：次の任務と出陣を一行 → 今日やると良いこと三つ → 人との出来事。細かな表は畳む
      const P = pickNow();
      const cardHtml = ({ key, k, id, c, r }) => {
        if (r) return `<div class="tw-card done ${popKey === key ? 'pop' : ''}" role="group" aria-label="済んだ：${esc(r.lbl)} ${esc(r.big)}"><span class="ic" aria-hidden="true">${PICK_IC[k] || TAB_ICON.shop}</span><b class="t">${esc(pickT[key] || r.t || '')}</b><div class="res"><b>${esc(r.big)}</b><span>${esc(r.lbl)}</span><small>${esc(r.sub)}</small></div></div>`;
        if (!c) return `<div class="tw-card off"><span class="ic" aria-hidden="true">${PICK_IC[k] || TAB_ICON.shop}</span><b class="t">${esc(pickT[key] || '')}</b><p class="ef">${G.actions <= 0 ? '今日の時間はもう無い' : '済んだ'}</p></div>`;
        const ic = k === 'buy' ? TAB_ICON.shop : PICK_IC[k];
        return `<div class="tw-card"><span class="ic" aria-hidden="true">${ic}</span><b class="t">${esc(c.t)}</b><p class="ef">${esc(c.ef)}</p><button class="btn small ${k === 'rest' ? 'primary' : ''}" data-pick="${esc(key)}">${esc(c.btn)}</button></div>`;
      };
      const allDone = P.length && P.every((p) => p.r || !p.c);
      body = `
        <h2 class="tw-h">今日やると良いこと<small>${G.actions ? `残り ${G.actions} 刻` : '今日の時間は使い切った'}</small></h2>
        ${P.length ? `<div class="tw-cards">${P.map(cardHtml).join('')}</div>${allDone ? '<p class="note tw-ready">備えは整った。いつでも出陣できる。</p>' : ''}` : '<p class="note tw-ready">備えは整っている。いつでも出陣できる。</p>'}
        ${realmBossHtml(G)}
        ${m.text ? `<details class="tw-more tw-misd"><summary>任務の中身と図を見る</summary><p class="note">${esc(m.text)}</p>${TW.diagram(town)}</details>` : ""}
        ${confirmGo ? `<div class="confirm-row"><b>出陣の前に</b>
          <div class="note">身につけた物：${esc(eqNames)}${G.owned.includes('katana') ? '・打刀' : ''}</div>
          <div class="note">組：${R0.length}人（${[['spear', '槍'], ['bow', '弓']].map(([k, n]) => [n, R0.filter((r) => r.kind === k).length]).filter(([, c]) => c).map(([n, c]) => `${n} ${c}`).join('・') || 'なし'}／古参 ${R0.filter((r) => r.battles > 0).length}人${hurt ? `・手負い ${hurt}人` : ''}）　・　組の人数の上限 ${RANKS[G.rank].squad}人</div>
          ${(G.tomo || []).filter((t) => t.alive).length ? `<div class="note">供：${esc(G.tomo.filter((t) => t.alive).map((t) => `${t.name}（${(TOMO[t.kind] || {}).name || ''}）`).join('、'))}</div>` : ''}
          ${leftovers.length ? `<div class="tw-left"><span>やり残し（押すとその施設へ）</span>${leftovers.map(([k, t]) => `<button class="btn small" data-goto="${k}">${esc(t)}　→ ${esc(tabs.find(([x]) => x === k)[1])}</button>`).join('')}</div>` : '<div class="note">やり残しはない。</div>'}
          <div class="row"><button class="btn small" id="go-no">城下に残る</button><button class="btn primary small" id="go2">出陣する</button></div></div>` : ''}
        ${T.length ? `<h2 class="tw-h">人との出来事<small>答えで仲と評価が変わる</small></h2>${talkHtml(T)}` : ''}
        <details class="tw-more"><summary>次の戦への備え（一覧）</summary><div class="prep">${prep.map(([a, b, c, d]) => `<div class="${c}"><span>${a}</span><em>${esc(b)}</em><small>${esc(d)}</small></div>`).join('')}</div></details>
        <details class="tw-more"><summary>戦の道のりと人間関係</summary>${TW.map(G)}${relHtml(G)}</details>`;
      popKey = null;
    } else if (tab === 'shop') {
      const slots = [['weapon', '槍'], ['hat', '兜・笠'], ['body', '胴'], ['arm', '籠手'], ['thigh', '佩楯'], ['shin', '脛当'], ['coat', '陣羽織']];
      const SLOT_ICON = { weapon: 'shop', hat: 'hat', body: 'body', arm: 'arm', thigh: 'body', shin: 'arm', coat: 'coat' };
      const IC = {
        shop: TAB_ICON.shop,
        hat: '<svg viewBox="0 0 24 24"><path d="M3 15 C 6 6, 18 6, 21 15 Z"/><path d="M2 15 H22"/></svg>',
        body: '<svg viewBox="0 0 24 24"><path d="M6 4 H18 L20 10 L18 20 H6 L4 10 Z"/><path d="M6 9 H18 M6 13 H18 M6 17 H18"/></svg>',
        arm: '<svg viewBox="0 0 24 24"><path d="M8 3 H16 V17 L12 21 L8 17 Z"/><path d="M8 8 H16 M8 12 H16"/></svg>',
        coat: '<svg viewBox="0 0 24 24"><path d="M7 3 L12 6 L17 3 L21 8 L18 10 V21 H6 V10 L3 8 Z"/></svg>',
      };
      // 買える物のうち、防御がいちばん上がる物をおすすめに
      let rec = null, recGain = 0;
      for (const [id, it] of Object.entries(ITEMS)) {
        if (!it.cost || G.owned.includes(id) || it.cost > G.kan || (it.minRank && G.rank < it.minRank)) continue;
        const cur = G.equip[it.slot] ? ITEMS[G.equip[it.slot]] : null;
        const gain = (it.def || 0) - (cur?.def || 0) + ((it.mult || 0) - (cur?.mult || 0)) * 0.5;
        if (gain > recGain) { recGain = gain; rec = id; }
      }
      body = `<canvas class="preview3d" id="pv" aria-hidden="true"></canvas><p class="note" style="text-align:center">戦場での姿（着け替えるとすぐ変わる）</p><div class="row" style="justify-content:space-between"><p class="note">褒美の銭で具足を整える。所持金 ${zeni(G.kan)}<span class="nx">${esc(nextHint(town, 'shop'))}</span></p><div class="row"><button class="btn small" data-goto="toiya">鉄砲・弓・馬・供は問屋へ →</button><button class="btn small" id="auto-eq">一番よい物を着ける</button><button class="btn small" id="own-only">${G.shopOwned ? 'すべて表示' : '持ち物だけ表示'}</button></div></div><div class="items">` + slots.map(([slot, label]) => {
        const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === slot && (!G.shopOwned || G.owned.includes(id)));
        if (!ids.length) return `<div class="item"><div class="n">${esc(label)}</div><div class="x note">この区分の持ち物はまだない</div><div class="a"></div></div>`;
        const cur = G.equip[slot] ? ITEMS[G.equip[slot]] : null;
        return ids.map((id) => {
          const it = ITEMS[id];
          const own = G.owned.includes(id);
          const eq = G.equip[slot] === id;
          const lock = it.minRank && G.rank < it.minRank;
          // いま着けている物との比較
          let cmp = '';
          if (!eq) {
            if (it.def !== undefined) { const d = Math.round(((it.def || 0) - (cur?.def || 0)) * 100); if (d) cmp = `<span class="cmp ${d < 0 ? 'neg' : ''}">防御 ${d > 0 ? '+' : ''}${d}%</span>`; }
            if (it.mult !== undefined && cur?.mult !== undefined) { const d = Math.round((it.mult - cur.mult) * 100); if (d) cmp = `<span class="cmp ${d < 0 ? 'neg' : ''}">威力 ${d > 0 ? '+' : ''}${d}%</span>`; }
          }
          let act;
          if (eq) act = '<span class="note">着用中</span>';
          else if (own) act = `<button class="btn small" data-eq="${id}">身につける</button>`;
          else if (lock) act = `<span class="note">${esc(RANKS[it.minRank].name)}から</span>`;
          else if (it.cost === undefined) act = '<span class="note">下賜の品（昇進で賜る）</span>';
          else act = G.kan < it.cost ? `<span class="note">${zeni(it.cost)}（あと${zeni(it.cost - G.kan)}）</span>` : `<button class="btn small" data-buy="${id}">${zeni(it.cost)}で買う</button>`;
          return `<div class="item ${eq ? 'eq' : ''}"><div class="n"><span class="sic">${IC[SLOT_ICON[slot]]}</span>${esc(it.name)}<small>${esc(label)}</small>${cmp}${id === rec ? '<span class="rec">おすすめ</span>' : ''}</div><div class="x">${esc(tnote(it.note))}</div><div class="a">${act}</div></div>`;
        }).join('');
      }).join('') + `<div class="item"><div class="n">打刀<small>刀</small></div><div class="x">${esc(tnote(ITEMS.katana.note))}</div><div class="a">${G.owned.includes('katana') ? '<span class="note">所持</span>' : (G.kan < ITEMS.katana.cost ? `<span class="note">${zeni(ITEMS.katana.cost)}（あと${zeni(ITEMS.katana.cost - G.kan)}）</span>` : `<button class="btn small" data-buy="katana">${ITEMS.katana.cost}貫で買う</button>`)}</div></div></div>`;
    } else if (tab === 'realm') {
      // 知行：内政・家臣・外交（realm.js）
      body = realmHtml(G);
    } else if (tab === 'toiya') {
      // 問屋：供・飛び道具・馬・槍と具足（toiya.js）
      body = toiyaHtml(G);
    } else if (tab === 'train') {
      const tr = [
        { id: 'spear', n: '槍の稽古', x: '槍術 +1（突きと薙ぎの威力 +10%）' },
        { id: 'vit', n: '走り込み', x: '体力 +1（体力 +10・気力 +12）' },
        { id: 'lead', n: '采配の稽古', x: '統率 +1（組の攻撃力 +8%・士気 +3）', min: 1 },
        { id: 'drill', n: '組の稽古', x: '組の全員の練度 +1（一段ごとに体力・攻撃 +8%。城下ごとに一度。手負いの者は加われない）', min: 1 },
      ];
      body = `<p class="note">一日に使える時間は二刻。稽古・休息のいずれかに使う。残り ${G.actions} 刻</p><div class="items">` + tr.map((t) => {
        const lock = t.min && G.rank < t.min;
        if (t.id === 'drill') {
          const done = G.drilled === town;
          return `<div class="item"><div class="n">${t.n}<small>${(G.roster || []).filter((r) => r.alive && !r.wound).length}人</small></div><div class="x">${t.x}<span class="nx">${esc(nextHint(town, 'drill'))}</span></div><div class="a">${lock ? '<span class="note">組頭候補から</span>' : done ? '<span class="note">済み</span>' : (G.injured ? '<span class="note">重傷のため休む</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : '<button class="btn small" data-drill="1">一刻使う</button>')}</div></div>`;
        }
        return `<div class="item ${trainedNow[t.id] ? 'eq' : ''}"><div class="n">${t.n}<small>現在 ${G.stats[t.id]}</small>${trainedNow[t.id] ? `<span class="tw-up">今日 +${trainedNow[t.id]}（${G.stats[t.id] - trainedNow[t.id]} → ${G.stats[t.id]}）</span>` : ''}</div><div class="x">${t.x}<span class="nx">${esc(nextHint(town, t.id))}</span></div><div class="a">${lock ? '<span class="note">組頭候補から</span>' : (G.injured ? '<span class="note">重傷のため休む</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : `<button class="btn small" data-train="${t.id}">一刻使う</button>`)}</div></div>`;
      }).join('') + `</div>${G.injured ? '<p class="note">重傷のため稽古はできない。</p>' : ''}`;
    } else if (tab === 'squad') {
      const R = (G.roster || []).filter((r) => r.alive).map(soldierOf);
      const fallen = (G.fallen || []);
      const key = { battles: (r) => r.battles, kills: (r) => r.kills, loyal: (r) => r.loyal, wound: (r) => r.wound }[rosterSort] || ((r) => r.battles);
      const sk = (r) => { const n = skillOf(r); return `<span class="sk" role="img" aria-label="練度 ${n}／3" title="練度 ${n}／3">${'●'.repeat(n)}<i>${'○'.repeat(3 - n)}</i></span>`; };
      const hurt = R.filter((r) => r.wound).length, low = R.filter((r) => r.loyal < 40).length;
      body = R.length ? `<p class="note">${esc(G.aijirushi ? '合印を掲げる' : '')}組の者たち（${R.length}人${hurt ? `・手負い ${hurt}人` : ''}）。生き残った者は古参となり、練度が上がる。</p>
        ${G.recruitsNote ? `<p class="note" style="color:var(--kin)">${esc(G.recruitsNote)}</p>` : ''}
        ${arriveNotes.length ? `<p class="note" style="color:#e3a08c">${arriveNotes.map(esc).join('<br>')}</p>` : ''}
        ${kumiHtml(G)}
        <div class="row" style="margin:10px 0 4px" role="group" aria-label="並べ替え">${[['battles', '戦歴'], ['kills', '討取'], ['wound', '負傷'], ['loyal', '忠誠']].map(([k, n]) => `<button class="btn small ${rosterSort === k ? 'tw-sorton' : ''}" data-sort="${k}" aria-pressed="${rosterSort === k}">${n}の順</button>`).join('')}</div>
        <div class="roster" role="table" aria-label="組の名簿"><div class="rr head" role="row">${['名', '役', '戦歴', '討取', '練度', '負傷', '忠誠'].map((h) => `<span role="columnheader">${h}</span>`).join('')}</div>
        ${[...R].sort((x, y) => key(y) - key(x)).map((r) => `<div class="rr" role="row" data-who="${esc(r.name)}"><div role="cell" class="${r.battles > 0 ? 'vet' : ''}">${esc(r.name)}<small style="color:var(--washi-faint);font-size: max(12px, calc(12px * var(--text-scale, 1)))">${r.special === 'yashichi' ? '（同輩）' : r.battles >= 2 ? '（古参）' : r.battles === 1 ? '（二度目）' : '（新参）'}</small><button class="talkb" data-spk="${esc(r.id)}" ${r.spoke === town ? 'disabled' : ''} title="声をかける（忠誠 +3・城下ごとに一度）" aria-label="${esc(r.name)}${r.spoke === town ? 'とはもう話した' : 'に声をかける'}">${r.spoke === town ? '話した' : '声をかける'}</button><button class="talkb" data-ren="${esc(r.id)}" title="名を改める" aria-label="${esc(r.name)}の名を改める">改名</button></div>
          <span role="cell">${r.kind === 'bow' ? '弓' : '槍'}</span><span role="cell">${r.battles}戦</span><span role="cell">${r.kills}人</span><span role="cell">${sk(r)}</span><span role="cell" class="w${r.wound}">${WOUND[r.wound]}</span>
          <span role="cell" class="ly ${r.loyal < 40 ? 'low' : ''}" title="忠誠 ${r.loyal}"><i><b style="width:${r.loyal}%"></b></i><span>${r.loyal}</span></span></div>`).join('')}</div>
        <div class="rlegend"><span><b>練度</b>戦歴と稽古で上がる。一段ごとに体力・攻撃 +8%（3段まで）</span><span><b>負傷</b>手当てせずに出ると、その戦では練度が浅手 −1・深手 −2</span><span><b>忠誠</b>勝ち戦・組を死なせぬ采配・振る舞い・声かけで上がる。25を切ると組を去る${low ? `（いま40未満が${low}人）` : ''}</span></div>
        ${fallen.length ? `<p class="note" style="margin-top:14px">討たれた者：${esc(fallen.join('、'))}</p>` : ''}`
        : '<p class="note">まだ組を持っていない。組頭候補になれば、足軽を預かる。</p>';
    } else if (tab === 'journal') {
      const J = G.journal || [];
      const led = (l) => l ? `<p class="tw-ledger">褒美 +${zeni(l.pay)}${l.wage ? `・給金 −${zeni(-l.wage)}` : ''}${l.spent ? `・城下の買い物 −${zeni(-l.spent)}${l.items && l.items.length ? `（${esc(l.items.slice(0, 4).join('・'))}${l.items.length > 4 ? ' ほか' : ''}）` : ''}` : ''}</p>` : '';
      const spentNow = (G.spend || []).reduce((a, x) => a + x.kan, 0);
      body = (spentNow ? `<p class="note">この城下での買い物：−${zeni(spentNow)}（${esc(G.spend.map((x) => x.n).join('・'))}）</p>` : '') + (J.length ? `<div class="people">${[...J].reverse().map((j) => `<div class="p"><canvas class="pmon" width="44" height="44" data-m="${j.m || G.aijirushi || 'oda'}"></canvas><b>${esc(j.t)}</b><p>${esc(j.s.replace(/討死：[^。]*。/, ''))}</p>${j.dead && j.dead.length ? `<p class="tw-dead">討死　${esc(j.dead.join('・'))}</p>` : ''}${led(j.ledger)}</div>`).join('')}</div>` : '<p class="note">まだ記すことはない。</p>');
    } else if (tab === 'people') {
      body = `<div class="people">${TW.PEOPLE.filter((p) => !p.min || town >= p.min || (p.k === 'tokichiro' && G.battle >= 3)).map((p) => {
        const r = G.rel[p.k];
        const mon = p.mon || { nobunaga: 'oda', genpachi: 'oda', yashichi: 'oda', osawa: 'oda', tokichiro: 'oda', yoshimoto: 'imagawa', hibino: 'saito' }[p.k];
        const log = (G.relLog || []).filter((l) => l.who === p.k).slice(-2);
        const st = r ? relStage(relOf(G, p.k)) : null;
        return `<div class="p"><canvas class="pmon" width="44" height="44" data-m="${mon}"></canvas><b>${esc(p.n)}</b><small>${esc(p.r)}</small>${st ? `<span class="tw-stage" aria-label="仲の段：${st[1]}">${'◆'.repeat(st[0])}${'◇'.repeat(3 - st[0])}　${st[1]}</span>` : ''}<p>${esc(p.t)}</p>${r ? `<p>信頼 ${r.trust} ・ 好感 ${r.like} ・ 尊敬 ${relOf(G, p.k).respect} ・ 警戒 ${relOf(G, p.k).wary}${relWord(relOf(G, p.k)) ? `　— ${relWord(relOf(G, p.k))}` : ''}</p>` : ''}${log.map((l) => `<p class="note">${esc(l.s)}</p>`).join('')}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'inn') {
      const rum = TW.RUMORS[town] || [];
      const hurtL = (G.roster || []).filter((r) => r.alive && r.wound);
      const hurtN = hurtL.length, lightN = hurtL.filter((r) => r.wound === 1).length;
      const hurtNames = hurtL.map((r) => `${r.name}・${WOUND[r.wound]}`).join('、');
      const treatCost = Math.max(2, hurtL.reduce((a, r) => a + r.wound, 0));
      const yDead = (G.fallen || []).includes('弥七');
      const yIn = (G.roster || []).some((r) => r.special === 'yashichi' && r.alive);
      const yLine = yDead ? '<div class="histnote" style="border-color:var(--washi-faint)"><b>弥七の弔い</b><br>宿の主人が、弥七の好きだった濁り酒を一杯、黙って置いていった。</div>'
        : yIn ? `<div class="talk"><div><span class="sp">弥七</span>　${esc(G.name)}の組に入ってから、槍の振り方が変わったと皆に言われるわ</div></div>` : '';
      const heard = G.rumorHeard = G.rumorHeard || {};
      const rumHtml = rum.map((r) => `${heard[r] ? '' : '<span class="tw-new">新</span>'}${esc(r)}`).join('<br>');
      for (const r of rum) heard[r] = 1;
      body = (rum.length ? `<div class="histnote"><b>宿で聞いた噂</b><br>${rumHtml}</div>` : '') + yLine + `<div class="items">
        <div class="item"><div class="n">組に振る舞う<small>5貫</small></div><div class="x">酒と飯を振る舞い、次の戦の始めの組の士気 +10・組の者の忠誠 +6<span class="nx">${esc(nextHint(town, 'feast'))}</span></div><div class="a">${G.feast ? '<span class="note">振る舞い済み</span>' : G.rank < 1 ? '<span class="note">組頭候補から</span>' : G.kan < 5 ? '<span class="note">あと' + zeni(5 - G.kan) + '</span>' : '<button class="btn small" id="feast">振る舞う</button>'}</div></div>
        ${hurtN ? `<div class="item"><div class="n">組の傷の手当て<small>${treatCost}貫</small></div><div class="x">医者を呼び、手負い${hurtN}人（${esc(hurtNames)}）の傷をすべて治す・その者の忠誠 +4<span class="nx">手負いのまま出れば、その戦では練度が下がる（浅手 −1・深手 −2）</span></div><div class="a">${G.kan < treatCost ? `<span class="note">あと${zeni(treatCost - G.kan)}</span>` : '<button class="btn small" id="treat">手当てする</button>'}</div></div>` : ''}
        <div class="item"><div class="n">休息する<small>一刻</small></div><div class="x">${G.injured ? '自分の重傷を癒やす' : '自分は無事'}${lightN ? `・組の浅手${lightN}人も癒える` : ''}${G.injured ? `<span class="nx">${esc(nextHint(town, 'rest'))}</span>` : ''}</div><div class="a">${G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : !G.injured && !lightN ? '<span class="note">休む必要はない</span>' : '<button class="btn small" id="rest">休む</button>'}</div></div></div>`;
    } else {
      // 馬屋：足軽大将から。馬を選ぶ・買う・手入れする・名を付ける
      const st = ladderStep(G);
      if (st < 2) {
        body = `<div class="stable-lock"><canvas class="preview3d" id="pv-st" aria-hidden="true"></canvas><div><div class="n" style="font-family:var(--display);font-size:max(12px, calc(22px * var(--text-scale, 1)));letter-spacing:.1em">馬屋は足軽大将から</div><p class="note">足軽大将になると、自分の馬を持ち、馬上で戦える。駆けて突けば重い一撃。${isTouch ? '駆ける・手綱を引くは、画面の釦で。' : `<kbd class="cap">${esc(K('run'))}</kbd> で駆け、<kbd class="cap">${esc(K('dodge'))}</kbd> で手綱を引く。`}</p><p class="note">いまの累計戦功 ${G.merit} ／ 足軽大将まで ${Math.max(0, RANKS[4].min - G.merit)}</p><button class="btn small" id="st-ladder">出世の道で馬上の姿を見る</button></div></div>
          <p class="note" style="margin-top:12px">馬は先に買っておける（乗れるのは足軽大将から）。月影は足軽大将になると賜る。</p>
          <div class="items">${Object.entries(HORSES).filter(([, h]) => !h.spoil).map(([id, h]) => {
            const own = (G.horses || []).includes(id) && id !== 'tsukikage';
            const act = id === 'tsukikage' ? '<span class="note">足軽大将になると賜る</span>' : own ? '<span class="note">買ってある</span>' : G.kan < h.cost ? `<span class="note">${zeni(h.cost)}（あと${zeni(h.cost - G.kan)}）</span>` : `<button class="btn small" data-horse="${id}" aria-label="${zeni(h.cost)}で買う：${esc(h.name)}">${zeni(h.cost)}で買う</button>`;
            const bar = (v) => `<i class="hb"><b style="width:${Math.round(Math.min(1, v / 1.4) * 100)}%"></b></i>`;
            return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(h.name)}<small>${esc(h.grade || '')}・${esc(h.kind)}</small></div><div class="x">${esc(h.note)}<div class="hstats"><span>体力</span>${bar(h.hp)}<span>息</span>${bar(h.breath)}<span>速さ</span>${bar(h.speed)}</div></div><div class="a">${act}</div></div>`;
          }).join('')}</div>`;
      } else {
        const H = myHorse(G);
        G.horses = G.horses || ['tsukikage'];
        body = `<div class="stable"><div><canvas class="preview3d" id="pv-st" aria-hidden="true"></canvas><div class="st-name">${esc(H.name)}<small>${esc(H.kind)}・絆 ${'●'.repeat(H.bond)}${'○'.repeat(5 - H.bond)}</small></div>
          <div class="row" style="justify-content:center"><button class="btn small" id="st-rename">名を付ける</button>${H.bond >= 5 ? '<span class="note">絆はもう満ちている</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : '<button class="btn small" id="st-care">手入れする（一刻）</button>'}</div>
          <p class="note" style="text-align:center">手入れで絆が深まると、馬の体力と息が少しずつ伸びる（絆一つにつき4%）</p></div>
          <div class="items">${Object.entries(HORSES).filter(([id, h]) => !h.spoil || G.horses.includes(id)).map(([id, h0]) => {
            const own = G.horses.includes(id), on = H.id === id;
            // 分捕り馬は、どこの誰の馬だったかと付けた名を添える
            const hb = (on ? G.horse : (G.horseBonds || {})[id]) || {};
            const h = h0.spoil ? { ...h0, name: hb.name || h0.name, note: `${hb.from ? `${hb.from}から分捕った馬。` : ''}${h0.note}` } : h0;
            const act = on ? '<span class="note">乗っている</span>' : own ? `<button class="btn small" data-ride="${id}">この馬に乗る</button>` : G.kan < h.cost ? `<span class="note">${h.cost}貫（あと${h.cost - G.kan}貫）</span>` : `<button class="btn small" data-horse="${id}">${h.cost}貫で買う</button>`;
            const bar = (v) => `<i class="hb"><b style="width:${Math.round(v / 1.4 * 100)}%"></b></i>`;
            return `<div class="item ${on ? 'eq' : ''}"><div class="n">${esc(h.name)}<small>${h.grade ? `${esc(h.grade)}・` : ''}${esc(h.kind)}</small></div><div class="x">${esc(h.note)}<div class="hstats"><span>体力</span>${bar(h.hp)}<span>息</span>${bar(h.breath)}<span>速さ</span>${bar(h.speed)}</div></div><div class="a">${act}</div></div>`;
          }).join('')}</div></div>`;
      }
    }
    const talkLeft = T.filter((t) => !G.talked[t.id]);
    const todo = {};
    const mark = (k, m, why) => { (todo[k] = todo[k] || []).push([m, why]); };
    if (talkLeft.length) mark('boss', '話', 'まだ話していない人がいる');
    if (G.actions > 0 && !G.injured) mark('train', '稽', `稽古の時間があと${G.actions}刻`);
    if ((G.roster || []).some((r) => r.alive && r.wound) || G.injured) mark('inn', '傷', '手当て・休息が要る者がいる');
    if (Object.entries(ITEMS).some(([id, it]) => it.cost && it.slot !== 'side' && it.slot !== 'gun' && it.slot !== 'bow' && !G.owned.includes(id) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank))) mark('shop', '買', S.freeMoney !== false && G.kan >= 99999 ? '今の銭で買える具足がある' : `${zeni(G.kan)}で買える具足がある`);
    { const rl = realmLeft(G); if (rl.length) mark('realm', '知', `まだ選んでいない：${rl.map((t) => t.n).join('・')}`); }
    if (toiyaCheap(G)) mark('toiya', '買', `${zeni(G.kan)}で雇える供・買える物がある`);
    const hero = TW.art ? `<div class="th" style="background:${info.sky}">${TW.art(town === 0.5 ? 1 : town, tab)}<div class="tt"><small>${esc(info.when ?? '')}${info.gap ? `　・　${esc(info.gap)}` : ''}</small><b role="heading" aria-level="1">${esc(info.place)}</b><span>${esc(info.mood || '')}</span></div>${stepsHtml}</div>` : `<div class="townsky"></div>${stepsHtml}`;
    const fac = (info.fac || {})[tab];
    // 城下を歩いている時：開いた札の場所へ、町を歩いて行ける（town3d.js の guideTo が道しるべを出す）
    const walkName = { realm: '我が館', boss: '上官屋敷', squad: '組の長屋', shop: '武具屋', toiya: '問屋', train: '訓練場', inn: '宿', stable: '馬屋' }[tab];
    const walkTo = opts.onLeave && walkName && tab !== (opts.tab || 'boss') && game && game.battle && game.battle.def && game.battle.def.guideTo;
    const walkBtn = (walkTo ? `<button class="btn small tw-walk" id="tw-walk">町を歩いて${esc(walkName)}へ行く</button>` : '') + (opts.onLeave && game?.battle?.flags.goTo ? '<button class="btn small tw-walk" id="tw-stop-walk">道案内をやめる</button>' : '');
    // はじめて開いた施設には、一度だけ短い案内を出す（783。最初の案内で済んだ施設は出さない）
    const FIRST = { toiya: '褒美の銭で、供を雇い、鉄砲・弓・馬を買う所。雇った供は毎戦の給金がかかる。', people: 'これまでに会った人と、その人との仲。話した事がここに残る。', journal: '戦ごとの評定・討った数・討死した者・銭の出入りを記す帳面。', stable: '馬を選び、手入れし、名を付ける所。乗れるのは足軽大将から。', squad: '預かった足軽の名簿。生き残った者は古参となって強くなる。' };
    const seen = G.tabSeen = G.tabSeen || {};
    const firstNote = G.toured && FIRST[tab] && !seen[tab] ? `<p class="tw-first" role="note"><b>はじめての${esc((tabs.find(([k]) => k === tab) || [])[1] || '')}</b>${esc(FIRST[tab])}</p>` : '';
    if (G.toured) seen[tab] = 1;
    const visTabs = tabs;
    // 城下の上でいちばん目立つのは「次の戦・出陣する」（どの施設を開いていても同じ所に）
    const nb = BATTLES[G.battle], mis = TW.MISSIONS[town];
    // 国の地図は副（足軽大将から、または筋書きを終えた後。今の条件のまま）
    const mapOpen = G.rank >= 4 || G.battle >= BATTLES.length;
    const nextBand = `<div class="tw-next" role="group" aria-label="次の戦"><div class="m"><small>次の戦</small><b>${esc(nb ? nb.name : '')}</b>${mis ? `<span>任務：${esc(mis.title)}</span>` : ''}${mapOpen ? '' : '<span class="lock">足軽大将になると、国の地図が開く</span>'}</div>${mapOpen ? '<button class="btn small tw-map" id="tw-map">国の地図を見る</button>' : ''}<button class="btn primary" id="${tab === 'boss' ? 'go' : 'go-any'}">${G.injured ? '休んでから出陣する' : '出陣する'}</button></div>`;
    const legendNow = !seen.legend && G.toured;
    if (G.toured) seen.legend = 1;
    show(`${townCssOnce()}<div class="base tod-${Math.max(0, Math.min(2, G.actions))}">${aside}<main>
      ${hero}
      ${nextBand}
      ${['train', 'inn', 'stable'].includes(tab) ? `<div class="tw-day" role="group" aria-label="今日の残り ${G.actions}刻"><span>今日の残り</span><span class="koku">${Array.from({ length: 2 }, (_, i) => `<i class="${i < G.actions ? 'on' : ''}"></i>`).join('')}</span><b>${G.actions ? `${G.actions}刻` : 'もう無い'}</b></div>` : ''}
      <div class="tabs tw-tabg" role="tablist" aria-label="城下の施設">${TAB_GROUPS.map(([gl, L]) => `<span class="grp">${gl ? `<span class="gl" aria-hidden="true">${esc(gl)}</span>` : ''}${L.map(([k, nme]) => `<button role="tab" id="tw-tab-${k}" aria-controls="tw-panel" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}">${TAB_ICON[k] || ''}${nme}${(todo[k] || []).map(([m, why]) => `<span class="tdot ${m === '話' ? '' : 'td2'}" title="${why}" aria-label="${why}">${m}</span>`).join('')}</button>`).join('')}</span>`).join('')}</div>
      ${!legendNow ? '' : '<p class="tw-legend" aria-hidden="true">札の印：話＝話す人あり・稽＝稽古できる・買＝銭で買える物あり・傷＝手当てが要る</p>'}
      <div id="tw-panel" role="tabpanel" aria-labelledby="tw-tab-${tab}">${fac ? `<p class="fac">${esc(fac)}</p>` : ''}${walkBtn}${firstNote}${info.kakun && info.kakun[tab] ? `<p class="note" role="note">${esc(info.kakun[tab])}</p>` : ''}${body}</div>
      <p role="note" style="margin:16px 0;font-size:max(12px, calc(15px * var(--text-scale, 1)));line-height:1.6;color:var(--washi)">戦の心得・豆知識：${esc(townTip)}</p>
    </main></div>`, false, (e) => {
      // 城下の案内の間は、数字キーで施設を替えない（782）
      if (document.querySelector('.tour')) return;
      if (e.key === 'Escape' && opts.onLeave) { e.preventDefault(); opts.onLeave(); return; }
      const i = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
      if (i >= 0 && tabs[i]) { tab = tabs[i][0]; confirmGo = false; sfx('ui'); render(); }
    });
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => {
        tab = b.dataset.tab; confirmGo = false; sfx('ui'); render(); document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true });
        // 背の低い画面（スマホ横）では、施設の札の並びを上に寄せて、中身がすぐ見えるように
        if (innerHeight < 520) scrollIn(document.querySelector('#screen .tabs'), 'start');
      };
      // ←→ で隣の施設へ（タブの決まり）
      b.onkeydown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = visTabs.findIndex(([k]) => k === b.dataset.tab);
        tab = visTabs[(i + (e.key === 'ArrowRight' ? 1 : visTabs.length - 1)) % visTabs.length][0]; confirmGo = false; sfx('ui'); render();
        document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true });
      };
    });
    const bl = $('b-ladder-town'); if (bl) bl.onclick = () => { sfx('ui'); game.ladder('town'); };
    // 919・995：城下から図鑑・設定・タイトルへ（城下の事はその場で保存してある）
    const bz = $('b-zukan-town'); if (bz) bz.onclick = () => { sfx('ui'); openZukan('busho'); };
    const ba = $('b-ach-town'); if (ba) ba.onclick = () => { sfx('ui'); openZukan('ach'); };
    const br = $('b-rec-town'); if (br) br.onclick = () => { sfx('ui'); if (preview) { preview.dispose(); preview = null; } recordsScreen(() => { render(); $('b-rec-town')?.focus({ preventScroll: true }); }, G); };
    const bs = $('b-set-town'); if (bs && game.openSettings) bs.onclick = () => { sfx('ui'); if (preview) { preview.dispose(); preview = null; } game.openSettings(() => game.base()); };
    const bt = $('b-title-town'); if (bt) bt.onclick = () => { sfx('ui'); save(G); if (preview) { preview.dispose(); preview = null; } document.querySelectorAll('.tour').forEach((e) => e.remove()); game.title(); };
    // 左上の戻る：施設（問屋・武具屋…）を開いていれば上官屋敷（城下の始めの札）へ、上官屋敷ならタイトルへ
    // 城下の始めの札（boss）では左上の戻るは出さない。「タイトルへ」は左の欄に一つだけ（重ねない）
    if (opts.onLeave) topBack(opts.onLeave, '町へ戻る');
    else if (tab !== 'boss') topBack(() => { tab = 'boss'; confirmGo = false; render(); }, '城下へ戻る');
    // 問屋の釦
    // 買ったあとも、見ていた所（送った位置）のままにする（上へ戻されると続けて買いにくい）
    // 押した品の釦（無ければ施設の札）へ焦点を戻す（961）
    toiyaBind(G, (msg, snd, sel) => { const sy = $('screen').scrollTop; sfx(snd || 'ui'); save(G); notice(msg); render(); $('screen').scrollTop = sy; (sel && document.querySelector(sel) || document.querySelector('[data-tab="toiya"]'))?.focus({ preventScroll: true }); }, confirmBox);
    realmBind(G, (msg, snd) => { sfx(snd || 'ui'); save(G); notice(msg); render(); import('./zukan.js').then((m) => m.zukanProgress(G)).catch(() => {}); }, confirmBox);
    if (tab === 'realm' && S.hints) {
      const todo = realmTodo(G);
      watchFirstHelp([
        { id: 'domain', k: 'dom', selector: '.dm' },
        { id: 'retainer', k: 'kerai', selector: '.kr' },
        { id: 'diplomacy', k: 'dip', selector: '.dp' },
      ].filter((x) => todo.some((t) => t.k === x.k && t.can && !t.lock)).map((x) => ({ id: x.id, el: $('screen').querySelector(x.selector) })));
    }
    const stopWalk = $('tw-stop-walk'); if (stopWalk) stopWalk.onclick = () => { const b = game.battle; b.flags.goTo = null; b.unmark('mk-go'); b.objRemove('go'); stopWalk.remove(); };
    const twk = $('tw-walk'); if (twk) twk.onclick = () => { sfx('ui'); const b = game.battle, t = tab; if (preview) { preview.dispose(); preview = null; } opts.onLeave(); if (b && b.def.guideTo) b.def.guideTo(b, t); };
    // 天下の地図：内政・家臣・城攻めと外交・天下の動きの札を選んで入る
    const twm = $('tw-map'); if (twm) twm.onclick = () => { sfx('ui'); if (preview) { preview.dispose(); preview = null; } game.japanMap('town'); };
    document.querySelectorAll('[data-jp]').forEach((b) => b.onclick = () => { sfx('ui'); if (preview) { preview.dispose(); preview = null; } const k = b.dataset.jp; import('./japan.js').then((m) => { m.japanTab(k); game.japanMap('town'); }); });
    const flashPv = () => { const c = $('pv'); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } };
    document.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => { const it = ITEMS[b.dataset.eq]; G.equip[it.slot] = b.dataset.eq; sfx('ui'); saved(); render(); flashPv(); });
    document.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
      const id = b.dataset.buy; const it = ITEMS[id];
      if (G.kan < it.cost) return;
      const buy = () => {
        G.kan -= it.cost; G.owned.push(id); spendLog(G, it.name, it.cost);
        if (it.slot !== 'side') G.equip[it.slot] = id;
        sfx('merit'); saved(); render(); flashPv();
        document.querySelector('[data-tab="shop"]')?.focus({ preventScroll: true });
      };
      // 所持金の半分を超える買い物は、一度確かめる（991）
      if (it.cost > G.kan / 2) {
        const item = b.closest('.item');
        let box = item.nextElementSibling && item.nextElementSibling.classList.contains('tw-cf') ? item.nextElementSibling : null;
        if (!box) { box = document.createElement('div'); box.className = 'tw-cf'; item.after(box); }
        confirmBox(box, `${it.name}を${zeni(it.cost)}で買います`, '買う', buy, { sub: `所持金の半分を超える買い物です（買うと残り ${zeni(G.kan - it.cost)}）。` });
        return;
      }
      buy();
    });
    document.querySelectorAll('[data-train]').forEach((b) => b.onclick = () => {
      const k = b.dataset.train; const before = G.stats[k];
      G.stats[k]++; G.actions--; trainedNow[k] = (trainedNow[k] || 0) + 1; sfx('taiko', 0.5);
      // 次の戦の評価で「稽古が効いた」を出すために覚えておく（792）
      G.trainedFor = G.trainedFor && G.trainedFor.battle === G.battle ? G.trainedFor : { battle: G.battle }; G.trainedFor[k] = (G.trainedFor[k] || 0) + 1;
      save(G);
      notice(`${{ spear: '槍術', vit: '体力', lead: '統率' }[k]} ${before} → ${G.stats[k]}`);
      (G.journal = G.journal || []).push({ t: `${TW.TOWNS[town].when}　稽古`, s: `${{ spear: '槍の稽古', vit: '走り込み', lead: '采配の稽古' }[k]}に励んだ。` });
      render();
    });
    const fe = $('feast');
    if (fe) fe.onclick = () => { if (G.kan < 5 || G.feast) return; let loyalGain = 0; G.kan -= 5; spendLog(G, '振る舞い', 5); G.feast = true; for (const r of G.roster || []) if (r.alive) { soldierOf(r); const before = r.loyal; r.loyal = Math.min(100, r.loyal + 6); loyalGain += r.loyal - before; } sfx('merit'); saved(); render(); notice(`振る舞いに${zeni(5)}。組の忠誠は合わせて${loyalGain}増えた`); };
    const trt = $('treat');
    if (trt) trt.onclick = () => {
      const L = (G.roster || []).filter((r) => r.alive && r.wound);
      const cost = Math.max(2, L.reduce((a, r) => a + r.wound, 0));
      if (G.kan < cost) return;
      G.kan -= cost; spendLog(G, '傷の手当て', cost); for (const r of L) { r.wound = 0; r.loyal = Math.min(100, r.loyal + 4); }
      sfx('ui'); notice(`${L.length}人の傷を手当てした`); saved(); render();
    };
    const ae = $('auto-eq');
    if (ae) ae.onclick = () => {
      for (const slot of ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat']) {
        let best = G.equip[slot], bv = best ? (ITEMS[best].def || 0) + (ITEMS[best].mult || 0) : -1;
        for (const id of G.owned) { const it = ITEMS[id]; if (it.slot !== slot) continue; const v = (it.def || 0) + (it.mult || 0); if (v > bv) { bv = v; best = id; } }
        if (best) G.equip[slot] = best;
      }
      sfx('ui'); saved(); render(); flashPv();
    };
    const oo = $('own-only');
    if (oo) oo.onclick = () => { G.shopOwned = !G.shopOwned; render(); };
    document.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { rosterSort = b.dataset.sort; render(); });
    // 組の中身（槍・鉄砲・弓・騎馬の割り振り。kumi.js）
    kumiBind(G, $('screen'), saved);
    document.querySelectorAll('[data-ren]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      const r = (G.roster || []).find((x) => x.id === b.dataset.ren);
      if (!r) return;
      const row = b.closest('.rr > div');
      row.innerHTML = `<span class="note" id="ren-limit">六字まで</span><input id="ren-in" aria-describedby="ren-limit" maxlength="6" value="${esc(r.name)}" aria-label="新しい名" style="background:var(--sumi-2);color:var(--washi);border:1px solid var(--line);padding:8px 8px;min-height:44px;box-sizing:border-box;width:7em;font-size:max(16px, calc(16px * var(--text-scale, 1)))"><button class="talkb" id="ren-ok">この名に決める</button>`;
      const inp = $('ren-in'); inp.focus({ preventScroll: true }); inp.select();
      const ok = () => { const v = inp.value.trim().slice(0, 6); if (v) r.name = v; saved(); render(); };
      $('ren-ok').onclick = ok;
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); render(); } };
    });
    // 組の者に声をかける：その者の様子で返事が変わる
    document.querySelectorAll('[data-spk]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      const r = (G.roster || []).find((x) => x.id === b.dataset.spk);
      if (!r || r.spoke === town) return;
      soldierOf(r);
      const L = r.wound === 2 ? ['この傷では、次は槍が上がりませぬ……', '手当てさえ受けられれば、また戦えまする']
        : r.wound === 1 ? ['かすり傷にござる。次も出まする', '少し痛みますが、なんの']
          : r.loyal < 40 ? ['……組頭は、わしらのことを考えておいでか', '在所へ帰ろうかと、考えておりまする']
            : r.loyal >= 75 ? ['組頭の後ろなら、どこまでも付いて行きまする', '次の戦も、組頭の旗の下で']
              : ['次の戦でも、生きて帰りとうござる', '手柄を立てて、在所の母に楽をさせたい', '槍の稽古、欠かしておりませぬ', '組頭、腹が減りました'];
      r.spoke = town; r.loyal = Math.min(100, r.loyal + 3);
      notice(`${r.name}「${L[hashOf(r.id + town) * L.length | 0]}」　忠誠 +3`);
      sfx('ui'); saved(); render();
    });
    document.querySelectorAll('canvas.pmon').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
    document.querySelectorAll('[data-drill]').forEach((b) => b.onclick = () => { for (const r of G.roster || []) if (r.alive && !r.wound) r.drill = Math.min(2, (r.drill || 0) + 1); G.drilled = town; G.trainedFor = G.trainedFor && G.trainedFor.battle === G.battle ? G.trainedFor : { battle: G.battle }; G.trainedFor.drill = 1; G.actions--; sfx('taiko', 0.5); saved(); render(); });
    // 武具屋の姿見
    const pv = $('pv');
    if (preview) { preview.dispose(); preview = null; }
    if (pv) { preview = new Preview(pv); preview.setLook(G); }
    const rest = $('rest');
    if (rest) rest.onclick = () => { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions--; sfx('ui'); saved(); render(); };
    // 馬屋
    const pvSt = $('pv-st');
    if (pvSt) { const pvs = new Preview(pvSt); pvs.setStep(G, Math.max(2, ladderStep(G))); }
    const stl = $('st-ladder'); if (stl) stl.onclick = () => { sfx('ui'); game.ladder('town'); };
    // 乗り換える前に、いまの馬の絆と名を覚えておく
    const stash = () => { const c = G.horse || { id: 'tsukikage', bond: 0 }; G.horseBonds = { ...(G.horseBonds || {}), [c.id]: c }; };
    document.querySelectorAll('[data-horse]').forEach((b) => b.onclick = () => {
      const id = b.dataset.horse, h = HORSES[id];
      if (G.kan < h.cost) { notice(`馬を買うには、あと${zeni(h.cost - G.kan)}必要です`); return; }
      if ((G.horses || []).includes(id)) return;
      stash();
      G.kan -= h.cost; spendLog(G, h.name, h.cost); G.horses = [...(G.horses || ['tsukikage']), id];
      G.horse = { id, bond: 0 };
      sfx('neigh', 0.7); saved(); render(); notice(`${h.name}を買った。残り${zeni(G.kan)}`);
    });
    document.querySelectorAll('[data-ride]').forEach((b) => b.onclick = () => {
      const id = b.dataset.ride;
      stash();
      G.horse = G.horseBonds[id] || { id, bond: 0 };
      sfx('neigh', 0.5); saved(); render(); notice(`${myHorse(G).name}に乗り換えた`);
    });
    const care = $('st-care');
    if (care) care.onclick = () => { G.horse = G.horse || { id: 'tsukikage', bond: 0 }; if (G.actions <= 0 || G.horse.bond >= 5) return; const before = G.horse.bond || 0; G.horse.bond = Math.min(5, before + 1); G.actions--; sfx('neigh', 0.4); saved(); render(); notice(`馬の絆 ${before} → ${G.horse.bond}。今日の残り${G.actions}刻`); };
    const ren = $('st-rename');
    if (ren) ren.onclick = () => {
      const H = myHorse(G);
      ren.outerHTML = `<input id="st-nm" maxlength="6" value="${esc(H.name)}" aria-label="馬の名" style="width:8em;min-height:44px;box-sizing:border-box;background:var(--sumi-2);color:var(--washi);border:1px solid var(--line);padding:8px;font-size:max(12px, calc(15px * var(--text-scale, 1)))"><button class="btn small primary" id="st-nm-ok">この名に決める</button>`;
      const inp = $('st-nm'); inp.focus({ preventScroll: true }); inp.select();
      const ok = () => { const v = inp.value.trim().slice(0, 6); if (v) { G.horse = { ...(G.horse || { id: 'tsukikage', bond: 0 }), name: v }; saved(); } render(); };
      $('st-nm-ok').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); render(); } };
    };
    const go = $('go');
    if (go) go.onclick = () => {
      // 重傷なら、ここで一刻休んで癒やしてから出陣の確かめへ（宿へ回らなくても進めるように）
      if (G.injured) { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions = Math.max(0, (G.actions || 0) - 1); saved(); }
      // やり残しが無ければ、確かめの札を挟まずにすぐ出る
      if (!confirmGo && needAsk()) { confirmGo = true; sfx('ui'); render(); const g2 = $('go2'); if (g2) { scrollIn(g2, 'center'); g2.focus({ preventScroll: true }); } return; }
      depart();
    };
    const go2 = $('go2');
    if (go2) go2.onclick = depart;
    // どの施設からでも出陣（確かめが要る時だけ上官屋敷の札を開く）
    const ga = $('go-any');
    if (ga) ga.onclick = () => {
      if (G.injured) { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions = Math.max(0, (G.actions || 0) - 1); saved(); }
      if (needAsk()) { tab = 'boss'; confirmGo = true; sfx('ui'); render(); const g2 = $('go2'); if (g2) { scrollIn(g2, 'center'); g2.focus({ preventScroll: true }); } return; }
      depart();
    };
    document.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => { tab = b.dataset.goto; confirmGo = false; sfx('ui'); render(); document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true }); });
    const goNo = $('go-no');
    if (goNo) goNo.onclick = () => { if (opts.go && opts.onLeave) { opts.onLeave(); return; } confirmGo = false; render(); };
    document.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => doPick(b.dataset.pick));
    document.querySelectorAll('[data-talk]').forEach((b) => b.onclick = () => {
      const t = T.find((x) => x.id === b.dataset.talk);
      const c = t.choices[+b.dataset.c];
      const R = relOf(G, t.rel);
      const sup0 = G.superior;
      for (const [k, v] of Object.entries(c.fx)) R[k] = Math.max(0, Math.min(100, (R[k] || 0) + v));
      if (c.sup) G.superior = Math.min(100, G.superior + c.sup);
      // 答えで何が上がったかを、話の札とその場の札に大きく出す
      const RN = Object.fromEntries(REL_KEYS);
      const list = [];
      if (c.sup) list.push(['上官の評価', `+${G.superior - sup0}`, `${sup0} → ${G.superior}${G.superior >= 50 && sup0 < 50 ? '　昇進できる' : ''}`]);
      for (const [k, v] of Object.entries(c.fx)) if (v) list.push([`${t.who.replace(/^.*\s/, '')}の${RN[k] || k}`, sgn(v), '']);
      if (c.kan) list.push(['銭', `+${zeni(c.kan)}`, '']);
      if (c.join) list.push(['組に加わる', '弥七', '']);
      talkGain[t.id] = { list };
      const pk = 'talk:' + t.id;
      if (pickKeys && pickKeys.includes(pk) && list[0]) { res[pk] = { t: t.who, big: list[0][1], lbl: list[0][0], sub: list[0][2] || list.slice(1).map((x) => x[0] + ' ' + x[1]).join('・') }; popKey = pk; }
      if (c.kan) G.kan = (G.kan || 0) + c.kan;
      if (c.join === 'yashichi' && !(G.roster || []).some((r) => r.special === 'yashichi')) {
        G.roster = G.roster || [];
        // 弥七は古参として組に加わる（新参の一人と入れ替え）
        const i = G.roster.findIndex((r) => r.kind === 'spear' && r.battles === 0 && !r.special);
        const y = { id: 'yashichi', name: '弥七', kind: 'spear', battles: 1, kills: 0, alive: true, special: 'yashichi' };
        if (i >= 0) G.roster[i] = y; else G.roster.push(y);
      }
      G.talked[t.id] = c.reply;
      (G.relLog = G.relLog || []).push({ who: t.rel, s: `${TW.TOWNS[town].when}：「${c.t}」と答えた` });
      sfx('ui'); saved(); render();
    });
    if (keep) {
      $('screen').scrollTop = sy0;
      const el = (aSel && document.querySelector(aSel)) || document.querySelector(`[data-tab="${tab}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  };

  // 答えがどう効くか（上官の評価は昇進に要る。人間関係の値）
  const fxHtml = (c) => {
    const parts = [];
    if (c.sup) parts.push(`<i class="up">上官の評価 +${c.sup}</i>`);
    for (const [k, n] of REL_KEYS) { const v = c.fx[k]; if (v) parts.push(`<i class="${(k === 'wary' ? -v : v) > 0 ? 'up' : 'dn'}">${n} ${sgn(v)}</i>`); }
    if (c.kan) parts.push(`<i class="up">銭 +${zeni(c.kan)}</i>`);
    if (c.join) parts.push('<i class="up">組に加わる</i>');
    return parts.length ? `<span class="fx">${parts.join('')}</span>` : '';
  };
  const talkHtml = (list) => list.map((t) => {
    const done = G.talked[t.id];
    const gn = talkGain[t.id];
    const gain = gn && gn.list.length ? `<div class="tw-gain" role="status">${gn.list.map(([n, v, s]) => `<span><b>${esc(v)}</b>${esc(n)}${s ? `<small>${esc(s)}</small>` : ''}</span>`).join('')}</div>` : '';
    return `<div class="talk tw-ev ${done ? 'said' : ''}" id="tw-ev-${t.id}"><small class="where">${t.at === 'boss' ? '上役の屋敷で' : '宿で'}</small>${gain}${t.lines.map((l) => `<div><span class="sp">${esc(t.who)}</span>　${esc(l)}</div>`).join('')}
      ${done ? `${(() => { const c = t.choices.find((x) => x.reply === done); return c ? `<div class="tw-said"><span class="sp">${esc(G.name)}</span>　「${esc(c.t)}」${fxHtml(c)}</div>` : ''; })()}<div style="margin-top:6px"><span class="sp">${esc(t.who)}</span>　${esc(done)}</div>` : `<div class="choices">${t.choices.map((c, i) => `<button data-talk="${t.id}" data-c="${i}">「${esc(c.t)}」${fxHtml(c)}</button>`).join('')}</div>`}
    </div>`;
  }).join('');

  render();
  // 初めての城下では、施設を順に案内する
  if (!G.toured && !opts.onLeave) {
    // 初めての案内は多すぎると渋滞するので二枚だけ（今日やると良いこと・出陣する）。ほかの施設は押せば分かる
    const steps = [
      ['boss', '城下', '今日やると良いことが三つ出る。押すと、次の戦で何が効くかがその場で分かる。人との出来事もここで。'],
      ['#go, #go-any', '出陣する', '支度が済んだら、この釦で次の戦へ出陣する。'],
    ];
    let i = 0;
    document.querySelectorAll('.tour').forEach((e) => e.remove());   // 前の案内が残っていれば外す（二重にしない）
    const tour = document.createElement('div');
    tour.className = 'tour';
    document.body.appendChild(tour);
    const stepFn = () => {
      document.querySelectorAll('.tourhl').forEach((e) => e.classList.remove('tourhl'));
      if (i >= steps.length) { tour.remove(); removeEventListener('keydown', escAll, true); $('screen').style.paddingBottom = ''; G.toured = true; save(G); return; }
      const [k, t, d] = steps[i];
      const btn = k.startsWith('#') ? document.querySelector(k) : document.querySelector(`[data-tab="${k}"]`);
      if (btn) btn.classList.add('tourhl');
      tour.innerHTML = `<div class="box" role="dialog" aria-label="城下の案内"><b>城下の案内　${i + 1}/${steps.length}　${t}</b>${d}<div class="row" style="margin-top:8px"><button class="btn small" id="tour-skip">案内を閉じる</button><button class="btn primary small" id="tour-next">${i === steps.length - 1 ? '案内を終える' : '次へ'}</button></div></div>`;
      // 案内の札は、光らせた札のすぐ下に置く（本文を隠さない）
      const bx = tour.querySelector('.box');
      if (bx && innerHeight < 520) {
        // 背の低い画面（スマホ横）では、札を画面の下に固定して、光らせた施設と中身を隠さない（784）
        bx.style.left = 'auto'; bx.style.right = '8px'; bx.style.width = '250px'; bx.style.maxWidth = '34vw'; bx.style.top = 'auto'; bx.style.bottom = '8px'; bx.style.maxHeight = '40vh'; bx.style.overflow = 'auto'; bx.style.fontSize = 'max(12px, calc(12px * var(--text-scale, 1)))'; bx.style.padding = '8px 10px'; bx.style.setProperty('--arrow', '-99px');
        $('screen').style.paddingBottom = '';
      } else if (btn && bx) {
        const r = btn.getBoundingClientRect();
        const w = Math.min(420, innerWidth - 32);
        const left = Math.max(16, Math.min(r.left, innerWidth - w - 16));
        const rowsBottom = Math.max(r.bottom, ...[...document.querySelectorAll('[data-tab]')].map((q) => q.getBoundingClientRect().bottom));   // 二段目の札も隠さない
        bx.style.left = left + 'px'; bx.style.top = (rowsBottom + 12) + 'px';
        bx.style.setProperty('--arrow', Math.max(12, r.left + r.width / 2 - left - 6) + 'px');
      } else if (bx) { bx.style.left = '50%'; bx.style.bottom = '12vh'; bx.style.transform = 'translateX(-50%)'; }
      $('tour-next').onclick = () => { i++; stepFn(); };
      $('tour-skip').onclick = () => { i = steps.length; stepFn(); };
      $('tour-next').focus({ preventScroll: true });
      // Tab は札の中の釦を回る。Esc は焦点がどこにあっても案内を閉じる（967）
      tour.onkeydown = (e) => {
        if (e.key !== 'Tab') return;
        const bs = [...tour.querySelectorAll('button')]; const k = bs.indexOf(document.activeElement);
        e.preventDefault(); bs[(k + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
      };
    };
    const escAll = (e) => { if (e.key !== 'Escape') return; if (!document.body.contains(tour)) { removeEventListener('keydown', escAll, true); return; } e.stopPropagation(); e.preventDefault(); i = steps.length; stepFn(); removeEventListener('keydown', escAll, true); };
    addEventListener('keydown', escAll, true);
    stepFn();
  }
}

// ---------------- 記録帳 ----------------
// 桶狭間編でしか取れない称号（ほかの筋書きでは「桶狭間編」と添えるか、並べない）
const TITLE_ONLY = { noHead: ['okehazama', 'oda'], perfect: ['okehazama', 'oda'], drill: ['okehazama', 'oda'], rescue: ['okehazama', 'oda'] };
// 843：どの戦で得られるか（筋書きの名より細かく）
const TITLE_WHERE = { noHead: '桶狭間', perfect: '墨俣', drill: '桶狭間の手ほどき', rescue: '桶狭間' };
const titlesFor = (k) => Object.entries(TITLES).filter(([id]) => !TITLE_ONLY[id] || TITLE_ONLY[id].includes(k));
export function recordsScreen(onBack, current = null) {
  const readings = [0, 1, 2].map(readProgress);
  const slots = readings.map((r) => r.game);
  if (current && !current.practice) slots[current.slot ?? S.slot] = current;
  const all = slots.filter(Boolean);
  const sum = (f) => all.reduce((a, g) => a + (f(g) || 0), 0);
  const titles = new Set(all.flatMap((g) => g.titles || []));
  let dojoBest = 0;
  dojoBest = readDojoBest();
  // 538：枠ごとに、その枠の筋書きの戦の名で評定を印の列にして並べる
  const slotRow = (g) => {
    const sc = SCENARIOS[g.scenario || 'okehazama'];
    return `<div class="rc-slot"><div class="rc-h"><b>枠${(g.slot || 0) + 1}：${esc(g.name)}</b><small>${esc(sc.name)}・${esc(rankLabel(g))}・累計戦功 ${g.merit || 0}</small></div>
      <details><summary style="min-height:44px;padding:8px;box-sizing:border-box;cursor:pointer">最高の評定を見る（年表は最後の結果）</summary><ul>${sc.battles.map((b, i) => g.grades?.[i] ? `<li>${esc(b.name)}：${esc(g.grades[i])}${g.best?.[i] != null ? `・最高戦功${g.best[i]}` : ''}</li>` : '').join('') || '<li>最高の評定の記録なし</li>'}</ul></details>${battleTimeline(g, sc.battles)}</div>`;
  };
  show(`<style>
    ${TIMELINE_STYLE}
    .rc-slot { border: 1px solid var(--line); padding: 10px 14px; margin: 10px 0; }
    .rc-h { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; } .rc-h b { font-family: var(--display); font-size: max(12px, calc(17px * var(--text-scale, 1))); } .rc-h small { color: var(--washi-dim); font-size: max(13px, calc(13px * var(--text-scale, 1))); }
    .rc-gr { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .rc-gr span { display: grid; justify-items: center; min-width: 96px; padding: 4px 8px; border: 1px dashed var(--line); color: var(--washi-faint); }
    .rc-gr span.on { border-style: solid; color: var(--washi-dim); }
    .rc-gr small { font-size: max(13px, calc(13px * var(--text-scale, 1))); } .rc-gr em { font-style: normal; font-family: var(--display); font-size: max(12px, calc(20px * var(--text-scale, 1))); color: var(--washi-dim); }
    .rc-gr span.on em { color: #e38a74; } .rc-gr em.top { color: var(--kin) !important; }
    .titles .only { display: block; font-size: max(13px, calc(13px * var(--text-scale, 1))); color: var(--washi-dim); }
    .records .rc-zk { background: none; border: 1px solid var(--line); color: inherit; font: inherit; cursor: pointer; min-height: 44px; display: grid; justify-items: start; text-align: left; padding: 6px 10px; }
    .records { padding-bottom: 48px; } .records #rec-back { margin-top: 18px; } .records #rec-clear { margin-bottom: 16px; }
    .records .rc-zk:hover, .records .rc-zk:focus-visible { border-color: var(--kin); }
  </style><div class="wrap"><div class="eyebrow">記録帳　・　全保存データ共通</div><h2 style="font-family:var(--display);font-size:max(12px, calc(32px * var(--text-scale, 1)));letter-spacing:.1em;margin:8px 0 6px">これまでの戦い</h2>
    <p class="note">保存の枠ごとの年表です。合計には同じ人の複製も含みます。延べの戦は別の記録です。同じ戦をやり直すと、最後の結果を残します。勝ち負けは任務を果たせたかで決まります。古い保存で分からない所は「記録なし」と出ます。</p>
    <div class="records">
      <div><b>${sum((g) => g.merit)}</b><small>保存枠の合計戦功</small></div>
      <div><b>${sum((g) => g.life && g.life.kills)}</b><small>保存枠の合計討ち取り</small></div>
      <div><b>${sum((g) => g.life && g.life.parries)}</b><small>保存枠の合計受け流し</small></div>
      <div><b>${sum((g) => (g.history || []).filter(Boolean).length)}</b><small>保存枠の結果の件数</small></div>
      <div><b>${titles.size}/${Object.keys(TITLES).length}</b><small>得た称号</small></div>
      <div><b>${dojoBest}</b><small>稽古場の最高${(() => { try { const d = readDojoDetail(); return d ? `（第${d.wave}陣・${Math.floor(d.time / 60)}分${String(d.time % 60).padStart(2, '0')}秒・${d.date != null && Number.isFinite(new Date(d.date).getTime()) ? new Date(d.date).toLocaleDateString('ja-JP') : '記録なし'}）` : ''; } catch (e) { return ''; } })()}</small></div>
      ${(() => { try { const z = readZukanRaw(); const n = z.n || {}; return `<div><b>${n.battles || 0}</b><small>延べの戦</small></div><div><b>${n.kills || 0}</b><small>延べの討ち取り</small></div><button class="rc-zk" id="rec-zk"><b>${Object.keys(z.met || {}).length}</b><small>武将図鑑を開く</small></button><button class="rc-zk" id="rec-ach"><b>${Object.keys(z.ach || {}).length}</b><small>実績を開く</small></button>`; } catch (e) { return ''; } })()}
    </div>
    ${all.map(slotRow).join('') || '<p class="note">まだ記録がありません。戦を終えると、ここに戦ごとの評定が並びます。</p>'}
    <details><summary style="min-height:44px;padding:8px;box-sizing:border-box;cursor:pointer">段ごとの稽古の最高を見る</summary>${(() => { try { const best = JSON.parse(localStorage.getItem('sengoku-risshin-dojo-trial') || '{}'); return `<ul>${LADDER.map((l, i) => `<li>${esc(l.name)}：${best[i] != null ? best[i] + '人' : '記録なし'}</li>`).join('')}</ul>`; } catch (e) { return '<p>段の記録を読めませんでした。</p>'; } })()}</details>
    <div class="eyebrow" style="margin-top:20px">称号</div>
    <div class="titles">${Object.entries(TITLES).map(([id, t]) => `<div class="${titles.has(id) ? 'got' : ''}"><b>${esc(t.name)}</b><small>${esc(t.note)}</small>${slots.map((g, i) => g?.titles?.includes(id) ? `<small>枠${i + 1}・${esc(g.name)}が得た</small>` : '').join('')}${TITLE_ONLY[id] ? `<small class="only">${esc(TITLE_WHERE[id] || TITLE_ONLY[id].map((k) => SCENARIOS[k].name).join('・'))}で得られる</small>` : ''}</div>`).join('')}</div>
    <div class="row" style="margin-top:18px"><button class="btn small" id="rec-clear">図鑑・実績・稽古場の記録を消す</button></div><div id="rec-cf"></div>
    <button class="btn primary" id="rec-back">戻る</button></div>`, false, (e) => { if (e.key === 'Escape') onBack(); });
  $('rec-back').onclick = onBack;
  topBack(onBack);
  // 854：図鑑・実績・稽古場の記録を消す（保存の枠とは別。確かめてから）
  $('rec-clear').onclick = () => confirmBox($('rec-cf'), '武将図鑑の会った武将・実績・稽古場の最高を消します。', '記録を消す', () => {
    try { ['sengoku-risshin-zukan', 'sengoku-risshin-dojo', 'sengoku-risshin-dojo-detail', 'sengoku-risshin-dojo-trial'].forEach((k) => localStorage.removeItem(k)); }
    catch (e) {
      $('rec-cf').innerHTML = '';
      $('rec-clear').focus({ preventScroll: true });
      notice('記録を消しきれませんでした。保存先を使えません。ブラウザの保存設定を確かめて、もう一度お試しください');
      return;
    }
    notice('図鑑・実績・稽古場の記録を消しました。ページを読み直すと空から始まります');
    recordsScreen(onBack, current);
  }, { sub: '保存の枠の戦の記録は残ります。消した図鑑と実績は戻せません。' });
  const rz = $('rec-zk'); if (rz) rz.onclick = () => openZukan('busho');
  const ra = $('rec-ach'); if (ra) ra.onclick = () => openZukan('ach');
  $('rec-back').focus({ preventScroll: true });
}

// ---------------- 稽古場の結果 ----------------
// trial：出世の道から先の身分を試したとき（記録は残さない）
export function dojoResult(kills, wave, time, onAgain, onTitle, trial = null, onLadder = null) {
  let best = 0;
  try { best = +(localStorage.getItem('sengoku-risshin-dojo') || 0); } catch (e) { /* noop */ }
  let isBest = false, saveFailed = false;
  if (trial == null && kills > best) {
    try {
      localStorage.setItem('sengoku-risshin-dojo', String(kills));
      localStorage.setItem('sengoku-risshin-dojo-detail', JSON.stringify({ kills, wave, time: Math.round(time), date: Date.now() }));
      isBest = true;
    } catch (e) { saveFailed = true; }
  }
  // 出世の道の試しは、保存できた時だけ段ごとの最高更新を知らせる。
  let trialBest = 0, trialNew = false;
  if (trial != null) {
    try {
      const T = JSON.parse(localStorage.getItem('sengoku-risshin-dojo-trial') || '{}');
      trialBest = T[trial] || 0;
      if (kills > trialBest) {
        T[trial] = kills;
        localStorage.setItem('sengoku-risshin-dojo-trial', JSON.stringify(T));
        trialNew = true;
      }
    } catch (e) { saveFailed = true; }
  }
  show(`<div class="story"><div>
    <div class="year">稽古場　${trial != null ? `${esc(LADDER[trial].name)}の姿で試し（本編の戦功・身分は変わらない）` : '腕試し'}</div>
    <h2>討ち取り ${kills}人</h2>
    <p>第${wave}陣まで耐えた。　${Math.floor(time / 60)}分${String(Math.floor(time % 60)).padStart(2, '0')}秒${trial != null ? (trialNew ? `<br><b style="color:var(--kin)">${esc(LADDER[trial].name)}の段の最高を更新した</b>` : `<br>${esc(LADDER[trial].name)}の段の最高 ${trialBest} 人`) : isBest ? '<br><b style="color:var(--kin)">これまでの最高を更新した</b>' : `<br>これまでの最高 ${best} 人`}</p>
    ${saveFailed ? '<p role="status">稽古の成績は上に表示しました。最高の記録を保存しきれませんでした。ブラウザの保存設定を確かめてください。</p>' : ''}
    <div class="row" style="justify-content:center"><button class="btn" id="dj-title">タイトルへ</button>${onLadder ? '<button class="btn" id="dj-ladder">出世の道へ</button>' : ''}<button class="btn primary" id="dj-again">もう一度稽古する</button></div>
  </div></div>`, false, (e) => { if (e.key === 'Enter') onAgain(); else if (e.key === 'Escape') { e.preventDefault(); onTitle(); } });
  $('dj-again').onclick = onAgain;
  $('dj-title').onclick = onTitle;
  topBack(onTitle, 'タイトルへ');
  if (onLadder) $('dj-ladder').onclick = onLadder;
  $('dj-again').focus({ preventScroll: true });
}

// ---------------- 出世の道 ----------------
// 足軽から天下人までの十段を、登っていく階段で見せる。段を選ぶと、その身分の姿（足軽大将からは馬上）と、できることが分かる
const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function ladderScreen(G, onBack, onTry) {
  const cur = ladderStep({ ...G, trialStep: null });
  const PLAYABLE = 2;   // 検証版で遊べるのは足軽大将（三段目）まで
  let sel = Math.min(LADDER.length - 1, cur + (cur < PLAYABLE ? 1 : 0));
  let pv = null;
  const need = (i) => {
    const r = LADDER[i].ranks[0];
    return r == null ? null : RANKS[r].min;
  };
  const stepState = (i) => (i < cur ? 'done' : i === cur ? 'now' : i === cur + 1 ? 'next' : 'far');
  const render = () => {
    const L = LADDER[sel];
    const st = stepState(sel);
    const n = need(sel);
    const cond = st === 'done' ? '到達済み' : st === 'now' ? 'いまの身分' : sel > PLAYABLE ? 'この先は天下の地図で（姿は稽古場で見られる）' : (() => {
      const r = LADDER[sel].ranks[0];
      const bi = RANK_CEIL.findIndex((c) => c >= r);
      const ceilNote = bi > 0 && BATTLES[bi] ? `「${BATTLES[bi].name.replace(/の戦い$/, '')}」の後から（戦ごとに上がれる身分に限りがある）` : '';
      // 戦功はもう足りているのに、戦ごとの上限で上がれない時は、先に「足りている」事と、いつ上がれるかを言う（「あと0」で止まらないように）
      if (n != null && G.merit >= n && ceilNote) return `戦功の条件は満たした。任務と上官の評価も必要。上がれるのは${ceilNote}`;
      return `戦功の目安 ${n}（いま ${G.merit}・あと ${Math.max(0, n - G.merit)}）。任務と上官の評価も必要${ceilNote ? `。ただし上がれるのは${ceilNote}` : ''}`;
    })();
    // 537：届くまでの道のりを帯でも見せる
    const base0 = RANKS[G.rank].min;
    const bar = (st === 'next' || st === 'far') && sel <= PLAYABLE && n != null ? `<div class="ld-bar" role="progressbar" aria-valuemin="${base0}" aria-valuemax="${Math.max(base0 + 1, n)}" aria-valuenow="${Math.max(base0, Math.min(n, G.merit))}" aria-valuetext="累計戦功 ${G.merit}、目標 ${n}" aria-label="${esc(L.name)}までの累計戦功"><i style="width:${Math.min(100, Math.max(0, (G.merit - base0) / Math.max(1, n - base0)) * 100)}%"></i></div><p class="note" style="margin-top:4px">戦功の上限は戦ごとに違う。戦の中の戦功札で確かめられる。任務を果たし、組を死なせず、下知を守るほど多く入る。</p>` : '';
    $('ld-detail').innerHTML = `
      <div class="ld-name"><small>${KANSUJI[sel]}の段</small>${esc(L.name)}</div>
      <div class="ld-cmd">率いる兵　<b>${esc(L.cmd)}</b></div>
      <div class="ld-cond st-${st}">${esc(cond)}</div>${bar}
      <div class="ld-cols">
        <div><h5>できること</h5>${L.can.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
        <div><h5>姿</h5>${L.gear.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
      </div>
      <div class="row"><button class="btn" id="ld-back">戻る</button><button class="btn primary" id="ld-try">${sel >= 2 ? '馬上の姿で' : 'この姿で'}稽古場へ</button></div>
      <p class="note">本編の戦功・身分は変わりません。稽古場では、この段の最高の討ち取り数を残します。${isTouch ? '段を押して選び、下の釦で出陣します。' : '左右の矢印キーで段を選び、決定キーで出陣します。戻るキーで戻ります。'}</p>`;
    document.querySelectorAll('.ld-step').forEach((el) => { el.classList.toggle('sel', +el.dataset.i === sel); el.setAttribute('aria-pressed', +el.dataset.i === sel); });
    $('ld-try').onclick = () => { dispose(); onTry(sel); };
    $('ld-back').onclick = () => { dispose(); onBack(); };
    if (pv) pv.setStep(G, sel);
  };
  const dispose = () => { if (pv) { pv.dispose(); pv = null; } };
  show(`<style>
    .ladder .ld-bar { height: 8px; background: var(--sumi-3); max-width: 360px; margin: 8px 0 0; position: relative; }
    .ladder .ld-bar i { position: absolute; inset: 0; right: auto; background: var(--kin); }
    .ladder .ld-step .ld-left { color: var(--kin); }
  </style><div class="wrap ladder">
    <div class="eyebrow">出世の道</div>
    <h2 class="ld-title">足軽から、天下人へ</h2>
    <p class="note">いまの身分：<b style="color:var(--kin)">${esc(rankLabel({ ...G, trialStep: null }))}</b>（累計戦功 ${G.merit}）。本編の身分は足軽大将まで。この先は天下の地図で（姿は稽古場で試せます）。</p>
    <div class="ld-stair" role="group" aria-label="十の段">${LADDER.map((L, i) => `<button type="button" aria-label="${KANSUJI[i]}の段 ${esc(L.name)}（${esc(L.cmd)}）・${{ done:'到達済み', now:'いまの身分', next:'次の身分', far:'この先の身分' }[stepState(i)]}" class="ld-step st-${stepState(i)} ${i > PLAYABLE ? 'beyond' : ''}" data-i="${i}" style="--i:${i}">
        <span class="k">${KANSUJI[i]}</span><b>${esc(L.name)}</b><small>${esc(L.cmd)}</small>${stepState(i) === 'now' ? '<em>いま</em>' : stepState(i) === 'next' ? '<em class="nx">次</em>' : ''}${stepState(i) === 'next' && i <= PLAYABLE && need(i) != null ? `<small class="ld-left">${G.merit >= need(i) ? '戦功条件は達成' : `戦功 あと ${need(i) - G.merit}`}</small>` : ''}
      </button>`).join('')}<div class="ld-line" aria-hidden="true"><i style="width:${(cur / (LADDER.length - 1)) * 100}%"></i></div></div>
    <div class="ld-body"><div class="ld-look"><canvas class="preview3d" id="ld-pv"></canvas></div><div id="ld-detail"></div></div>
  </div>`, false, (e) => {
    const stepFocus = () => { if (document.activeElement && document.activeElement.classList.contains('ld-step')) document.querySelector(`.ld-step[data-i="${sel}"]`)?.focus({ preventScroll: true }); };
    if (e.key === 'ArrowRight') { sel = Math.min(LADDER.length - 1, sel + 1); sfx('ui'); render(); stepFocus(); }
    else if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); sfx('ui'); render(); stepFocus(); }
    else if (e.key === 'Enter') { e.preventDefault(); dispose(); onTry(sel); }
    else if (e.key === 'Escape') { dispose(); onBack(); }
  });
  document.querySelectorAll('.ld-step').forEach((el) => { el.onclick = () => { sel = +el.dataset.i; sfx('ui'); render(); }; });
  topBack(() => { dispose(); onBack(); });
  pv = new Preview($('ld-pv'));
  pv.spin = 0.006;
  render();
}

// ---------------- 後日譚とエンディング ----------------
export function epilogueScreen(G, onDone) {
  const vetL = (G.roster || []).filter((r) => r.alive && r.battles >= 2).sort((a, b) => (b.battles - a.battles) || ((b.kills || 0) - (a.kills || 0)));
  const vets = vetL.length;
  // 539：自分の組の者の名を一人添える（いちばん長く付き従った者。弥七がいれば弥七）
  const y = vetL.find((r) => r.special === 'yashichi') || vetL[0];
  const vetName = y ? `中でも${y.name}は${KANSUJI[y.battles - 1] || y.battles}つの戦を共にし、${y.kills ? `${y.kills}人を討った。` : '一度も列を離れなかった。'}` : '';
  const lastB = BATTLES[BATTLES.length - 1] || {};
  const lines = scenarioKey() === 'oda' ? [
    lastB.id === 'honnoji' ? '天正十年六月二日、本能寺と二条御所は焼け落ち、信長と信忠は帰らなかった。' : lastB.id === 'shitaragahara' ? '天正三年五月、設楽原の柵の前で武田の騎馬は崩れ、宿将の多くが帰らなかった。' : `${lastB.name || '戦'}が終わった。`,
    lastB.id === 'honnoji' ? `燃える京を落ちのびた${G.name}は、${RANKS[G.rank].name}として、ただ一つ残った合印の旗を背に、東へ歩いた。` : `桶狭間の雨の中で槍を握った${G.name}は、${RANKS[G.rank].name}として岐阜へ戻った。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、長く共に戦った古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    (G.tomo || []).length ? `供の${G.tomo.map((t) => t.name).join('・')}も、主の後ろを離れなかった。` : '褒美の銭は、いつも組の者の酒と飯に消えた。',
    lastB.id === 'honnoji' ? '十日の後、中国から駆け戻った羽柴秀吉が、山崎で明智光秀を破る。――墨俣で砦を建てていた、あの藤吉郎である。' : '織田家の戦は、まだ続いていく。',
  ] : scenarioKey() === 'nagashino' ? [
    '天正三年八月、諏訪原城は落ち、牧野城と名を改められた。',
    `${G.name}は${RANKS[G.rank].name}として、その城の門をくぐった。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、長篠の籠城からの古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    '長篠で宿将の多くを失った武田家は、ゆっくりと傾いていく。徳川家康は、奥三河と遠江を一つずつ取り戻していった。',
    (G.rel.okubo || {}).like >= 60 ? '大久保忠世は、「あの足軽上がりは、いずれ一軍を率いる」と周りに言ってはばからなかった。' : '鳥居強右衛門の名は、三河の者たちの間で長く語り継がれた。',
  ] : [
    `永禄十年、織田信長は稲葉山城を落とし、城下を岐阜と改めた。`,
    `${G.name}は${RANKS[G.rank].name}として、その軍勢の中にいた。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、桶狭間の頃からの古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    G.rel.tokichiro.like >= 60 ? '墨俣で出会った木下藤吉郎は、やがて羽柴秀吉と名を改め、天下へと駆け上がっていく。その傍らで――。' : '墨俣で出会った木下藤吉郎は、やがて羽柴秀吉と名を改めていく。',
  ];
  const st = show(`<div class="story has-ill ${RM() ? 'fast' : ''}"><div style="max-width:640px">
    ${illustHtml(`epilogue:${SCENARIOS[scenarioKey()].mon || 'tokugawa'}:${G.aijirushi || ''}`, 'epi', '結びの一枚：戦の終わった秋、実った田と、合印の旗の立つ城')}
    <div class="year">後日譚</div>
    ${lines.flatMap((t) => t.match(/[^。]+。?|。/g) || [t]).map((t, i) => `<p style="animation-delay:${0.3 + i * 0.6}s">${esc(t)}</p>`).join('')}
    ${RM() ? '<style>.credits { height: auto !important; mask-image: none !important; -webkit-mask-image: none !important; } .credits .roll { position: static !important; animation: none !important; }</style>' : '<style>.credits.stop { height:auto !important; max-height:240px; overflow-y:auto; touch-action:pan-y; mask-image:none; -webkit-mask-image:none; } .credits.stop .roll { position:static !important; animation:none !important; transform:none !important; } .credits .roll b { display:block; margin-top:16px; }</style><button class="btn small" id="ep-stop" aria-pressed="false" style="margin-top:8px">字幕を止める</button>'}
    <div class="credits"><div class="roll">
      <b>戦国立身　${VERSION}</b>企画：かいと
      <b>作り</b>クロード（画面・使いやすさ・設計・制作）
      <b>道具</b>スリー・ジェイエス／ウェブの音／グーグルの書体（しっぽり明朝・禅角ゴシック）
      <b>甲冑の立体素材</b><a href="https://sketchfab.com/3d-models/armadura-samurai-do-maru-bmvb-b35366f45556412d98b70276e03853af">胴丸の甲冑</a>　作者：<a href="https://sketchfab.com/giravolt">ジラボルト</a>（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。形を減らし色を一部変更）
      <b>顔の立体素材</b><a href="https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf/LeePerrySmith">リー・ペリー・スミス／インフィニット・リアリティーズ</a>（<a href="https://creativecommons.org/licenses/by/3.0/deed.ja">作者を示す利用許可・第3版</a>）
      <b>兜の立体素材</b><a href="https://sketchfab.com/3d-models/samurai-helmet-3d-scan-8c6b74ecc37f4b938a30eff44f687557">武士の兜</a>　作者：<a href="https://sketchfab.com/chrr273u">シーエイチアールアール273ユー</a>（コペンハーゲン国立博物館の兜。<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。形を減らし台を除く）
      <b>面頬の立体素材</b><a href="https://sketchfab.com/3d-models/menpo-samurai-mask-5c96f417588146c3a101a6375bb30d51">武士の面頬</a>　作者：<a href="https://sketchfab.com/denis_cliofas">デニス・クリオファス</a>（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。色を一部変更）
      <b>飾りの具足の立体素材</b><a href="https://sketchfab.com/3d-models/yoroi-c84d40493afa4dc8b9bf4ab10bab0a4c">鎧</a>　作者：<a href="https://sketchfab.com/kokutochi-sankokan">國學院大學栃木学園参考館</a>（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。形を減らし床を除く）
      <b>人の骨と動き</b>スリー・ジェイエスの兵士の見本（ミクサモ）
      <b>馬の立体素材</b><a href="https://sketchfab.com/3d-models/horse-a6f860e43e364619bccb174a1ac7d0c9">馬</a>　作者：<a href="https://sketchfab.com/henrysteve973">ヘンリースティーブ973</a>（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。形と色を一部変更）
      <b>武器の立体素材</b><a href="https://sketchfab.com/3d-models/tanegasima-c0242870eaa245bbbaa12b9926673b72">種子島</a>　作者：<a href="https://sketchfab.com/stalkerlis180">ストーカーリス180</a>。<a href="https://sketchfab.com/3d-models/yari-b5a4864a97fa40799314a45bb54d1ece">槍</a>　作者：<a href="https://sketchfab.com/sublimehurdle_1542">サブライムハードル1542</a>。<a href="https://sketchfab.com/3d-models/katana-japanese-sword-21110de810f84a4999dc3b3275c3ad41">日本刀</a>　作者：<a href="https://sketchfab.com/bermudavid">ベルム</a>（どれも<a href="https://creativecommons.org/licenses/by/4.0/deed.ja">作者を示す利用許可・第4版</a>。形を減らし寸法と色を変更）
      <b>史実の拠り所</b>『信長公記』ほか
      <b>遊んでくれた人</b>${esc(G.name)}
      <b>　</b>ここまで遊んでくださり、ありがとうございました。
    </div></div>
    <button class="btn primary" id="ep-next">最終評価へ</button>
    ${RM() ? '' : '<div class="st-skip">画面を押すと、残りの文をすぐ出します</div>'}
  </div></div>`, false, (e) => { if (e.key === 'Enter') onDone(); });
  const box = st.querySelector('.story');
  box.addEventListener('click', (e) => { if (!e.target.closest('button')) box.classList.add('fast'); });
  mountIllust(st);
  $('ep-next').onclick = onDone;
  topBack(onDone, '閉じる');
  // 974：流れる字幕はいつでも止められる。動きを減らす時は流さず全文を並べる
  const eps = $('ep-stop');
  if (eps) eps.onclick = () => { const c = st.querySelector('.credits'); const on = !c.classList.contains('stop'); c.classList.toggle('stop', on); eps.setAttribute('aria-pressed', on); eps.textContent = on ? '字幕を流す' : '字幕を止める'; };
  $('ep-next').focus({ preventScroll: true });
  sfx('koto', 0.8);
}

// 人間関係：信頼・好感・尊敬・警戒（警戒だけは高いほど悪い）
const REL_COLOR = { trust: 'var(--kin)', like: '#c86a54', respect: '#8fb0e0', wary: 'var(--washi-faint)' };
// 仲の段（795）：知り合い・信を得る・頼られる
function relStage(R) {
  const v = ((R.trust || 0) + (R.like || 0) + (R.respect || 0)) / 3 - (R.wary || 0) / 3;
  return v >= 60 ? [3, '頼られる'] : v >= 38 ? [2, '信を得る'] : [1, '知り合い'];
}
function relWord(R) {
  if (R.wary >= 50) return '目を付けられている';
  if (R.respect >= 60 && R.trust >= 55) return '一目置かれている';
  if (R.respect >= 55) return '腕を認められている';
  if (R.like >= 65) return '可愛がられている';
  if (R.trust < 40) return 'まだ信を置かれていない';
  return '';
}
const REL_CSS = `<style>
  .rel4 { display: grid; grid-template-columns: 64px repeat(4, 1fr); gap: 4px 10px; align-items: center; margin: 4px 0; font-size: max(12px, calc(12px * var(--text-scale, 1))); color: var(--washi-dim); }
  .rel4 > b { font-weight: 500; color: var(--washi); font-size: max(12px, calc(13px * var(--text-scale, 1))); }
  .rel4 .m { display: grid; grid-template-columns: 2.4em 1fr 22px; gap: 5px; align-items: center; }
  .rel4 .m i { display: block; height: 5px; background: var(--sumi-3); position: relative; }
  .rel4 .m i b { position: absolute; inset: 0; right: auto; }
  .rel4 .m span { font-variant-numeric: tabular-nums; text-align: right; }
  .rel4 .m.wary.hi span, .rel4 .m.wary.hi small { color: #e38a74; }
  .rel4 small { font-size: max(12px, calc(12px * var(--text-scale, 1))); }
  @media (max-width: 900px) { .rel4 { grid-template-columns: 1fr 1fr; } .rel4 > b { grid-column: 1 / -1; margin-top: 6px; } }
</style>`;
function relHtml(G) {
  const who = town_().REL;
  return `${REL_CSS}<div style="margin-top:18px"><div class="eyebrow" style="margin-bottom:6px">人間関係</div>
    <p class="note" style="margin:0 0 6px">尊敬は戦の働きで上がる。警戒は下知破り・言い訳・大口で上がる（警戒だけは低いほどよい）。</p>
    ${who.map(([k, n]) => {
    const R = relOf(G, k);
    const w = relWord(R);
    return `<div class="rel4"><b>${n}${w ? `<small style="display:block;color:var(--washi-faint);font-weight:400">${w}</small>` : ''}</b>${REL_KEYS.map(([rk, rn]) => `<div class="m ${rk} ${rk === 'wary' && R[rk] >= 40 ? 'hi' : ''}"><small>${rn}</small><i><b style="width:${R[rk]}%;background:${REL_COLOR[rk]}"></b></i><span>${R[rk]}</span></div>`).join('')}</div>`;
  }).join('')}</div>`;
}

// ---------------- 最終評価 ----------------
const QUESTIONS = [
  '戦場の一兵士になった感覚があった',
  '合戦後の戦功評価が嬉しかった',
  '昇進が嬉しかった',
  '初めて部下を持った瞬間が面白かった',
  '部隊への指揮が分かりやすかった',
  '次の戦を遊びたくなった',
];

// 戦いぶりの型と、藤吉郎の言葉
function finalWords(G) {
  const L = G.life || {};
  const type = L.parries >= 15 ? ['受けの達人', '敵の攻めを受け流し、隙を突く戦い方'] : (G.titles || []).includes('flank2') ? ['横槍の将', '敵の横腹を見抜き、組ごと突き崩す戦い方']
    : (G.titles || []).includes('allAlive') ? ['兵を惜しむ将', '部下を死なせず、確かに勝つ戦い方'] : L.kills >= 45 ? ['一騎当千', '自ら槍を振るって道を拓く戦い方'] : ['実直な組頭', '下知を守り、務めを果たす戦い方'];
  if (scenarioKey() === 'nagashino') {
    const ok = G.rel.okubo || { like: 50 };
    const okLine = ok.like >= 60 ? '「柵の内で槍を立てておった小僧が、ここまで来たか」' : ok.like >= 45 ? '「次も、しかと務めよ」' : '「……下知は守れ。それだけじゃ」';
    return `<div class="histnote"><b>戦いぶり：${type[0]}</b><br>${type[1]}。</div><div class="histnote" style="border-color:var(--washi-faint)"><b>大久保忠世</b>${okLine}</div>`;
  }
  const tk = G.rel.tokichiro;
  const tkLine = tk.like >= 60 ? '「お主とはいずれ、もっと大きな戦をしたいものじゃ」' : tk.like >= 45 ? '「また墨俣のような働きを頼みますぞ」' : '「……まあ、よろしゅうに」';
  return `<div class="histnote"><b>戦いぶり：${type[0]}</b><br>${type[1]}。</div><div class="histnote" style="border-color:var(--washi-faint)"><b>木下藤吉郎</b>${tkLine}</div>`;
}

// 戦ごとの戦功を折れ線で（上限の目盛りは、その筋書きの戦の上限から決める）
function finalChart(G) {
  const vals = BATTLES.map((b, i) => (G.history[i] ? G.history[i].total : null));
  const W = 570, H = 170, padL = 48, padR = 56, padT = 26, padB = 30;
  const max = Math.ceil(Math.max(100, ...BATTLES.map((b) => b.cap || 0), ...vals.filter((v) => v != null)) / 50) * 50;
  const x = (i) => padL + i * ((W - padL - padR) / Math.max(1, BATTLES.length - 1)), y = (v) => H - padB - (v / max) * (H - padT - padB);
  const pts = vals.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:10px 0" role="img" aria-label="戦ごとの戦功：${BATTLES.map((b, i) => `${esc(b.name)} ${vals[i] ?? 'なし'}`).join('、')}">
    ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(236,228,210,.12)"/><text x="4" y="${y(v) + 4}" fill="#b0a894" font-size="12">${v}</text>`).join('')}
    ${BATTLES.map((b, i) => (b.cap ? `<line x1="${x(i) - 14}" x2="${x(i) + 14}" y1="${y(b.cap)}" y2="${y(b.cap)}" stroke="rgba(194,162,90,.85)" stroke-width="1.5" stroke-dasharray="3 2"/>` : '')).join('')}
    <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#c2a25a" stroke-width="2"/>
    ${vals.map((v, i) => (v === null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#c2a25a"/><text x="${x(i)}" y="${y(v) + 18}" fill="#ece4d2" font-size="12" text-anchor="middle">${v}${(G.grades || [])[i] ? `・${G.grades[i]}` : ''}</text>`)).join('')}
    ${BATTLES.map((b, i) => `<text x="${x(i)}" y="${H - 8}" fill="#b9b09c" font-size="12" text-anchor="middle">${esc(b.name.replace(/の戦い|の決戦/, ''))}</text>`).join('')}
    <text x="${W - padR - 60}" y="${padT - 10}" fill="#b0a894" font-size="12">点線＝上限</text>
  </svg></div>`;
}
// 最終評価の結びの一文（筋書きごと）
function finalLead(G) {
  const n = RANKS[G.rank].squad;
  const k = scenarioKey();
  if (k === 'nagashino') return `長篠城の塀の内で槍を握っていた名もなき足軽は、わずか三月の後、自らの合印を掲げた${n}人を率いて諏訪原の門をくぐった。`;
  if (k === 'okehazama') return `桶狭間で信長の軍旗を見上げていた足軽は、六年の後、自らの合印を掲げた${n}人を率いている。`;
  if (k === 'oda') { const L = BATTLES[BATTLES.length - 1] || {}; const y0 = 1560, y1 = +((String(L.year).match(/（(\d{4})）/) || [])[1] || 1575); return `桶狭間の雨の中で信長の軍旗を見上げていた足軽は、${y1 - y0}年の後、自らの合印を掲げた${n}人を率いて${String(L.name || '').replace(/の戦い$|攻め$|の決戦$|の変$/, '')}にいた。`; }
  return `名もなき足軽は、自らの合印を掲げた${n}人を率いるまでになった。`;
}

// 大きい所持金は万で区切って出す（表示だけ。保存の値は変えない）
function zeniBig(kan) {
  const k = Math.floor(Math.abs(kan || 0));
  if (k < 10000) return zeni(kan);
  const man = Math.floor(k / 10000), r = k % 10000;
  return (kan < 0 ? '−' : '') + man + '万' + (r ? r + '貫' : '');
}
export function finalScreen(G, onRestart, onJapan) {
  const rows = BATTLES.map((b, i) => {
    const h = G.history[i];
    const best = (G.best || [])[i];
    return `<div class="tl-row"><div class="b">${esc(b.name)}</div><div class="r">${h ? `戦後の身分：${esc(RANKS[h.rankAfter].name)}${h.promoted ? '（昇進）' : ''}` : '—'}${best && h && best > h.total ? `　・　最高 ${best}` : ''}</div><div class="m">${h ? h.total : '—'}</div></div>`;
  }).join('');
  const eq = ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin'].map((k) => G.equip[k]).filter(Boolean).map((id) => ITEMS[id].name);
  if (G.owned.includes('katana')) eq.push('打刀');
  const hasHistory = (G.history || []).some((h) => h);
  const japanLabel = onJapan ? (scenarioKey() === 'oda' ? 'この先を遊ぶ（天下の地図へ）' : '日本地図へ（天下取りの続き）') : null;
  const nextBtns = `<div class="row">${japanLabel ? `<button class="btn primary" data-fin-japan>${japanLabel}</button>` : ''}<button class="btn" data-fin-restart>最初から遊ぶ</button></div>`;
  const followers = (G.roster || []).filter((r) => r.alive && (r.battles > 0 || r.kills > 0));
  show(`<div class="wrap">
    <div class="eyebrow">${scenarioKey() === 'oda' ? '織田家編　これまでの道' : 'これまでの道'}</div>
    <h2 style="font-family:var(--display);font-size:max(12px, calc(clamp(32px,6vw,52px) * var(--text-scale, 1)));letter-spacing:.1em;margin:8px 0 6px">${esc(G.name)}、${esc(RANKS[G.rank].name)}となる</h2>
    <p class="lead">${esc(finalLead(G))}</p>
    ${nextBtns}
    ${scenarioKey() === 'oda' ? (hasHistory ? `<div class="eyebrow" style="margin-top:16px">歩んだ戦の道のり</div><div style="max-width:420px">${odaTown().map({ ...G, battle: BATTLES.length })}</div>` : '') : ''}
    ${hasHistory ? finalChart(G) : '<p class="note">まだ戦の記録がない。</p>'}
    <div class="timeline">${rows}<div class="tl-row"><div class="b">累計</div><div class="r">上官の評価 ${G.superior}　・　所持金 ${zeniBig(G.kan)}</div><div class="m">${G.merit}</div></div></div>
    <p class="note">身につけた物：${esc(eq.join('・'))}</p>
    <div class="eyebrow" style="margin-top:22px">称号（${titlesFor(scenarioKey()).filter(([id]) => G.titles.includes(id)).length}/${titlesFor(scenarioKey()).length}）</div>
    <div class="titles">${titlesFor(scenarioKey()).map(([id, t]) => `<div class="${G.titles.includes(id) ? 'got' : ''}"><b>${esc(t.name)}</b><small>${esc(t.note)}</small></div>`).join('')}</div>
    ${followers.length ? `<p class="note">最後まで付き従った者：${esc(followers.map((r) => `${r.name}（${r.battles}戦・${r.kills}人）`).join('、'))}</p>` : ''}
    ${finalWords(G)}
    <div class="histnote"><b>この先の道</b><br>足軽大将の先には、侍大将として数百人を率い、城主として城を築き、やがて大名として国を動かす道が続く。</div>
    ${relHtml(G)}
    <div style="height:30px"></div>
    <details class="q">
      <summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:500">感想を書く</summary>
      <div class="eyebrow" style="margin:10px 0 6px">遊んだ感想（1＝そう思わない 〜 5＝とてもそう思う）</div>
      ${QUESTIONS.map((q, i) => `<fieldset class="q" style="border:0;padding:0;margin:0 0 12px"><legend>${i + 1}. ${esc(q)}</legend><div class="scale">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="q${i}" id="q${i}-${v}" value="${v}" ${G.feedback?.a?.[i] === v ? 'checked' : ''}>${v}</label>`).join('')}</div></fieldset>`).join('')}
      <div class="q"><label for="fb-note" style="display:block;margin-bottom:6px">気づいたこと・面白かった瞬間・分かりにくかった点</label><textarea id="fb-note">${esc(G.feedback?.note || '')}</textarea></div>
      <div class="row"><button class="btn" id="fb-copy">結果をまとめてコピー</button></div>
      <pre class="copy" id="fb-out" hidden></pre>
    </details>
    ${nextBtns}
    <div id="rs-confirm"></div>
  </div>`);
  const collect = () => {
    const a = QUESTIONS.map((_, i) => { const r = document.querySelector(`input[name="q${i}"]:checked`); return r ? +r.value : null; });
    G.feedback = { a, note: $('fb-note').value };
    save(G);
    const lines = [`戦国立身 ${scenarioKey() === 'oda' ? '織田家編 ' : ''}結果 — ${G.name}（${RANKS[G.rank].name}）`];
    BATTLES.forEach((b, i) => { const h = G.history[i]; lines.push(`${b.name}: 戦功 ${h ? h.total : '-'} / 戦後 ${h ? RANKS[h.rankAfter].name : '-'}`); });
    lines.push(`累計戦功 ${G.merit} / 上官評価 ${G.superior}`);
    QUESTIONS.forEach((q, i) => lines.push(`${i + 1}. ${q}: ${a[i] ?? '未回答'}`));
    if (G.feedback.note) lines.push('メモ: ' + G.feedback.note);
    return lines.join('\n');
  };
  document.querySelectorAll('input[type=radio], #fb-note').forEach((el) => el.addEventListener('change', collect));
  $('fb-copy').onclick = () => {
    const text = collect();
    const out = $('fb-out');
    out.hidden = false;
    out.textContent = text;
    const done = () => { notice('結果を写しました'); };
    const fail = () => { notice('自動で写せませんでした。下の結果の文を選んで写してください'); out.tabIndex = 0; out.focus({ preventScroll:true }); scrollIn(out); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(fail);
    else fail();
  };
  if (onJapan) document.querySelectorAll('[data-fin-japan]').forEach((el) => { el.onclick = () => { sfx('ui'); onJapan(); }; });
  document.querySelectorAll('[data-fin-restart]').forEach((el) => {
    el.onclick = () => confirmBox($('rs-confirm'), 'この記録を消して、足軽から始め直します。', '記録を消して始め直す', onRestart);
  });
}

export function helpOverlay(on) {
  if (!on) { hideScreen(); return; }
  show(`<div class="wrap"><h1 class="eyebrow" style="font-size:inherit;font-weight:inherit;margin:0">操作説明</h1><div style="height:14px"></div>${isTouch ? touchKeysHtml() : keysHtml()}
    <div style="height:14px"></div><details><summary class="note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">ゲームパッドの操作を見る</summary><div style="height:8px"></div>${keysHtml(true)}</details>
    <div style="height:22px"></div>
    <div class="eyebrow" style="margin-bottom:8px">戦い方のこつ</div>
    <p class="note">敵の頭上に「！」が出たら斬りかかってくる合図。その直前に${isTouch ? '構えの丸' : '右クリック'}で構えると受け流しになり、次の一撃が「反撃」になる。<br>
    照準が朱色になったら槍が届く。${isTouch ? '狙いの丸' : K('lock')}で狙い定めると相手を見失わない。一度に斬りかかってくる敵は3人まで。</p>
    <p class="note">危険の印：赤い画面の縁は、見える弓兵や鉄砲足軽に狙われる合図。左右の暗い縁は、見える敵に囲まれる合図。敵の頭上の「！」は打ち込みの合図です。</p>
    <div class="eyebrow" style="margin:16px 0 8px">用語集</div>
    <p class="note">下線のある言葉を押すと、短い説明が出ます。</p>
    <button class="btn" id="help-words">用語集を開く</button>
    <div class="eyebrow" style="margin:16px 0 8px">戦功の仕組み</div>
    <ul class="note" style="margin:0;padding-left:1.2em;line-height:1.9">
      <li>任務を果たすと +40。いちばん大きい。</li>
      <li>囲まれた味方を救うと +20、組で敵の横を突くと +25。</li>
      <li>組の八割が生き残ると +30。</li>
      <li>敵の足軽は一人 +2（11人目から +1、21人目からは 0）。侍は +5、武将は +30。</li>
      <li>下知に背くと −15、勝手に追い討ちすると −10。</li>
    </ul>
    <button class="btn" id="help-close">閉じる${isTouch ? '' : '（エイチ）'}</button></div>`, true, (e) => { if (e.key === 'Escape') $('help-close')?.click(); });
  topBack(() => $('help-close')?.click(), '閉じる');
  $('help-words').onclick = () => openGlossary();
}

// ---------------- 一時停止メニュー ----------------
export function pauseMenu(el, o) {
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'pm-h'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="pmenu">
    <h3 id="pm-h">${esc(o.title || '一時停止')}</h3>
    <div class="btns">
      <button class="btn primary" id="pm-resume">再開する${isTouch ? '' : '（戻るキー）'}</button>
      <button class="btn" id="pm-settings" aria-expanded="false" aria-controls="pm-set">設定</button>
      <button class="btn" id="pm-help">操作を見る</button>
      <button class="btn" id="pm-words">用語集を開く</button>
      <button class="btn" id="pm-retry">${o.town ? '町に入り直す' : 'やり直す'}${isTouch ? '' : '（アール）'}</button>
      <button class="btn" id="pm-title">タイトルへ</button>
    </div>
    <div class="objs"><div class="eyebrow" style="margin-bottom:6px">現在の任務</div>${o.objectives.map((x) => `<div>${x.state === 'done' ? '済み' : x.state === 'fail' ? '失敗' : '進行中'} <b>${esc(x.text)}</b>${x.progress ? `　<small>${esc(x.progress)}</small>` : ''}</div>`).join('') || 'いまは任務がありません'}
      <div style="height:12px"></div><div>${o.town ? '城下を歩いた時間' : `この戦の戦功 <b>${o.merit}</b>　／　経過`} ${Math.floor(o.time / 60)}分${String(Math.floor(o.time % 60)).padStart(2, '0')}秒</div>
      ${o.lines && o.lines.length ? `<details style="margin-top:8px"><summary class="note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">戦功の内訳（${o.lines.length}件）</summary>${o.lines.map((l) => `<div>${esc(l.label)}${l.detail ? `（${esc(l.detail)}）` : ''}　<b>${l.pts > 0 ? '+' : ''}${l.pts}</b></div>`).join('')}</details>` : ''}</div>
    <div style="grid-column:1/-1;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start"><canvas id="pm-map" role="img" aria-label="戦場の地図（味方は青、敵は朱）" width="400" height="400" style="width:220px;height:220px;border:1px solid var(--line)"></canvas>
      ${o.error ? '<div class="objs" style="max-width:320px"><div class="eyebrow">不具合の記録</div><p class="note">不具合が起きていました。作り手に伝えるときは、この内容を写してください。</p><button class="btn small" id="pm-err">不具合の内容を写す</button></div>' : ''}</div>
    ${(window.__game?.hud?.warningLog || []).length ? `<details class="objs" style="grid-column:1/-1"><summary style="min-height:44px;cursor:pointer">大事な警告の記録を見る</summary>${window.__game.hud.warningLog.map((line) => `<p>${Math.floor(line.t / 60)}分${line.t % 60}秒　${esc(line.text)}</p>`).join('')}</details>` : ''}
    <div id="pm-confirm" style="grid-column:1/-1"></div>
    <div id="pm-set" style="grid-column:1/-1"></div>
    ${(o.hud?.log || []).length || (o.hud?.orderLog || []).length ? `<details class="objs" style="grid-column:1/-1"><summary style="min-height:44px;cursor:pointer">止めたまま会話の記録を読む</summary><p>通常の会話は直近40件。下知と伝令は戦の終わりまで残ります。</p>${[...new Set([...(o.hud?.orderLog || []), ...(o.hud?.log || [])])].sort((a, b) => a.t - b.t).map((line) => `<p>${esc(line.speaker || '報せ')}：${esc(line.text)}</p>`).join('')}</details>` : ''}
    <div style="grid-column:1/-1">${fbHtml('pm-fb')}</div>
  </div>`;
  fbBind(el, 'pm-fb', 'pause');
  el.querySelector('#pm-resume').onclick = o.resume;
  if (o.hud && o.battle) o.hud.drawMap(el.querySelector('#pm-map'), o.battle, 170, false);
  const pe = el.querySelector('#pm-err');
  if (pe) pe.onclick = () => {
    // 写せなかった時は、欄に全文を出して選んで写せるようにする（986）
    const show2 = () => { if (!el.querySelector('#pm-err-text')) pe.insertAdjacentHTML('afterend', `<label for="pm-err-text" class="note" style="display:block;margin-top:6px">不具合の内容（全部選んで写してください）</label><textarea id="pm-err-text" readonly style="width:100%;min-height:90px">${esc(o.error)}</textarea>`); const t = el.querySelector('#pm-err-text'); t.focus(); t.select(); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(o.error).then(() => notice('写しました')).catch(show2); else show2();
  };
  el.querySelector('#pm-help').onclick = o.help;
  el.querySelector('#pm-words').onclick = () => openGlossary();
  el.querySelector('#pm-settings').onclick = () => {
    const box = el.querySelector('#pm-set'), btn = el.querySelector('#pm-settings');
    if (box.innerHTML) { box.innerHTML = ''; btn.setAttribute('aria-expanded', 'false'); return; }
    // 一時停止では、音量・字幕・HUD の三つだけを出す（916。全部の設定はタイトルの「設定」から）
    // 戦の途中でも変えたい物（画質・動きを減らす・見回しの感度）も出す（kaito 10/2）
    const keep = new Set(['st-psens', 'st-inv', 'st-vrate', 'st-fov', 'st-town', 'st-cap', 'st-tswap', 'st-tsize', 'st-talpha', 'st-vib', 'st-guard', 'st-run', 'st-quality', 'st-rm', 'st-sens', 'st-tsens', 'st-vol', 'st-vsfx', 'st-vamb', 'st-vmus', 'st-ui', 'st-sub', 'st-subbg', 'st-voice', 'st-hudmode', 'st-fade', 'st-hudMinimap', 'st-hudCompass', 'st-hudArmy', 'st-hudSquad', 'st-hudBottom', 'st-hudObjectives']);
    box.innerHTML = settingsHtml();
    box.querySelector('.settings')?.classList.add('show-adv');
    box.querySelector('#st-adv')?.setAttribute('hidden', '');
    box.querySelectorAll('.keybind, .kb-lbl, #st-rehint, #st-reset').forEach((x) => { x.hidden = true; x.style.display = 'none'; });
    box.querySelectorAll('.s-row').forEach((r) => { const id = r.querySelector('label')?.getAttribute('for'); r.dataset.pauseHidden = String(!keep.has(id)); r.hidden = !keep.has(id); });
    bindSettings(o.onSettings);
    box.insertAdjacentHTML('beforeend', '<p class="note">ほかの設定は、タイトルの「設定」から変えられます。</p>');
    btn.setAttribute('aria-expanded', 'true');
    box.querySelector('.s-row:not([hidden]) input, .s-row:not([hidden]) select')?.focus({ preventScroll: true });
  };
  const box = el.querySelector('#pm-confirm');
  el.querySelector('#pm-retry').onclick = () => confirmBox(box, o.town ? '町に入り直します。' : 'この戦を最初からやり直します。', o.town ? '町に入り直す' : 'やり直す', o.retry, { sub: o.town ? '城下までの記録は残ります。' : 'この戦で得た戦功は消えます。城下までの記録は残ります。' });
  el.querySelector('#pm-title').onclick = () => confirmBox(box, 'タイトルへ戻ります。', 'タイトルへ戻る', o.title2, { sub: 'この戦の進み具合は消えます。城下までの記録は残ります。' });
  el.querySelector('#pm-resume').focus({ preventScroll: true });
  // 戦の中のキー（Tab・Enter・Space）は戦の操作に取られるので、一時停止の札の中ではボタンの操作に戻す
  el.onkeydown = (e) => {
    if (e.key === 'Tab') {
      e.stopPropagation();
      // Tab は札の中を回る（966）
      const f = [...el.querySelectorAll('button, input, select, textarea, summary')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (f.length) { const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      return;
    }
    const b = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button, summary');
    if (b) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
  };
}
