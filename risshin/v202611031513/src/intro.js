// 初めて入れた人への短い語り（kaito 11/3 AC「初めての人」）。一枚目は語り、二枚目はこのゲームがどういう物か。遊び方の説明ではない。二度目からは出さない
import { showScreen } from './screens.js';
import { sfx } from './audio.js';
import { thumbURL } from './hub.js';

const KEY = 'risshin_intro_seen';
export function introDue() {
  if (/[?&]bot/.test(location.search) || window.__cardTown) return false;
  try { return !localStorage.getItem(KEY); } catch (e) { return false; }
}
const seen = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* 書けなくても先へ進む */ } };

const CSS = `<style>
  .in { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); background: #0b0a09; color: var(--washi); overflow: hidden; }
  .in-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .28; filter: saturate(.6) blur(1px); }
  .in::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(11,10,9,.35), rgba(11,10,9,.92) 75%); pointer-events: none; }
  .in > *:not(.in-bg) { position: relative; z-index: 1; }
  .in-say { margin: 0; text-align: center; font: 700 max(18px, calc(24px * var(--text-scale, 1))) var(--display); letter-spacing: .16em; line-height: 2; text-shadow: 0 1px 6px #000; }
  .in-say span { display: block; opacity: 0; animation: inUp 1.4s ease forwards; }
  .in-say span:nth-child(2) { animation-delay: 1.3s; } .in-say span:nth-child(3) { animation-delay: 2.6s; }
  @keyframes inUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .in h1 { margin: 0; font: 800 max(20px, calc(26px * var(--text-scale, 1))) var(--display); letter-spacing: .18em; color: var(--kin); text-shadow: 0 1px 6px #000; }
  .in-ls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; max-width: 900px; margin: 0; padding: 0; list-style: none; }
  .in-ls li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(20,18,15,.78); border-left: 3px solid var(--kin); font: 600 max(15px, calc(16px * var(--text-scale, 1))) var(--ui); line-height: 1.55; opacity: 0; animation: inUp .9s ease forwards; }
  .in-ls li:nth-child(2) { animation-delay: .35s; } .in-ls li:nth-child(3) { animation-delay: .7s; } .in-ls li:nth-child(4) { animation-delay: 1.05s; }
  .in-ls svg { flex: none; width: 34px; height: 34px; color: var(--kin); }
  .in .btn { min-width: 180px; min-height: 48px; }
  body.rm .in-say span, body.rm .in-ls li { animation: none; opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .in-say span, .in-ls li { animation: none; opacity: 1; } }
  @media (max-height: 500px) { .in { gap: 10px; } .in-ls { gap: 6px 12px; } .in-ls li { padding: 6px 10px; line-height: 1.4; } .in-ls svg { width: 28px; height: 28px; } .in-say { line-height: 1.8; } }
  @media (max-width: 640px) and (orientation: portrait) { .in-ls { grid-template-columns: 1fr; } }
</style>`;
// 二枚目の印（字に添える絵）：出世の階段・山の等高線・兜・旗
const ICON = [
  '<path d="M8 54h12V42h12V30h12V18h12" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M52 6v12M47 11l5-5 5 5" fill="none" stroke="currentColor" stroke-width="3"/>',
  '<path d="M4 52 22 22l10 14 8-10 20 26z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 46c6-3 12-3 18 0s12 3 18 0" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/>',
  '<path d="M12 40c0-13 9-22 20-22s20 9 20 22z" fill="currentColor"/><path d="M6 40h52l-5 8H11z" fill="currentColor" opacity=".8"/><path d="M32 18 22 4M32 18 42 4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  '<path d="M18 6v54" stroke="currentColor" stroke-width="3"/><path d="M19 8h28v20H19z" fill="currentColor"/><path d="M40 60 54 36M30 60l10-12" stroke="currentColor" stroke-width="3" opacity=".7"/>',
];
const ABOUT = [
  '足軽になりきって手柄を立て、出世して天下を取る',
  '地形は国土地理院の標高から作った、本物の土地',
  '甲冑や城は、今に残る甲冑・史料・復元図が手本',
  '合戦は、史実の出来事と人物のとおりに進む',
];

// 一枚目（語り）→ 二枚目（どういうゲームか）→ done。どちらも一度押せば次へ
export function introScreen(done) {
  let step = 0, gone = false;
  const bg = `<img class="in-bg" src="${thumbURL('inou')}" alt="" decoding="async" onerror="this.remove()">`;
  const next = () => {
    if (gone) return;
    sfx('ui');
    if (step === 0) { step = 1; page2(); return; }
    gone = true; seen(); done();
  };
  const keys = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); } };
  const bind = (s) => { const b = s.querySelector('#in-go'); b.onclick = next; if (!('ontouchstart' in window)) b.focus({ preventScroll: true }); };
  const page2 = () => bind(showScreen(`${CSS}<div class="in">${bg}<h1>戦国立身</h1>
    <ul class="in-ls">${ABOUT.map((t, i) => `<li><svg viewBox="0 0 64 64" aria-hidden="true">${ICON[i]}</svg><span>${t}</span></li>`).join('')}</ul>
    <button type="button" class="btn primary" id="in-go">ホームへ進む</button></div>`, false, keys));
  bind(showScreen(`${CSS}<div class="in">${bg}<p class="in-say" role="heading" aria-level="1"><span>時は戦国。</span><span>あなたは、名もなき一人の足軽として生まれた。</span><span>槍一本で手柄を立て、やがて天下を取る。</span></p>
    <button type="button" class="btn primary" id="in-go">次へ</button></div>`, true, keys));
}
