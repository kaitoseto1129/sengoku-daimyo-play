// 記録の入口：日々のお題・武将の記録・武具の図鑑・実績・遊び方・クレジット・規約とプライバシー・問い合わせ
// ホームの「記録」から入る。字は短く、押す所は 44px 以上
import { showScreen, topBack, contactMail } from './screens.js';
import { ITEMS } from './state.js';
import { sfx } from './audio.js';
import { dailyView } from './daily.js';
import { gcShow, hasGameCenter } from './native_bridge.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `<style>
  .ex { max-width: 760px; margin: 0 auto; color: var(--washi); font: 500 max(15px, calc(16px * var(--text-scale, 1))) var(--ui); line-height: 1.7; }
  .ex h2 { font: 800 max(20px, calc(24px * var(--text-scale, 1))) var(--display); letter-spacing: .14em; margin: 8px 0 12px; }
  .ex-g { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .ex-b { min-height: 64px; padding: 8px 10px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); color: var(--washi); font: 700 max(15px, calc(16px * var(--text-scale, 1))) var(--ui); letter-spacing: .08em; cursor: pointer; }
  .ex-b:hover, .ex-b:focus-visible { border-color: #e6c77a; outline: none; }
  .ex-q { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 12px; margin-bottom: 8px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); }
  .ex-q.done { border-color: #e6c77a; } .ex-q.done::before { content: '✓'; color: #e6c77a; font-weight: 800; }
  .ex-q span { flex: 1; } .ex-q small { color: var(--kin); }
  .ex-fl { display: flex; gap: 4px; margin-bottom: 12px; } .ex-fl i { width: 22px; height: 28px; background: rgba(236,228,210,.15); border: 1px solid rgba(236,228,210,.35); } .ex-fl i.on { background: linear-gradient(180deg, #e6c77a, #a8843c); }
  .ex-it { padding: 8px 10px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); min-height: 64px; } .ex-it.no { opacity: .35; } .ex-it b { display: block; } .ex-it small { color: var(--washi-dim); }
  .ex p { margin: 0 0 10px; } .ex ol { padding-left: 1.4em; margin: 0 0 12px; } .ex a { color: #e6c77a; }
</style>`;
function view(title, body, back) {
  const s = showScreen(`${CSS}<div class="ex"><h2>${esc(title)}</h2>${body}</div>`);
  topBack(() => { sfx('ui'); back(); }, '戻る');
  return s;
}
export function extrasScreen(G, onLeave, o = {}) {
  const self = () => extrasScreen(G, onLeave, o);
  const btn = (k, t) => `<button type="button" class="ex-b" data-k="${k}">${t}</button>`;
  const s = view('記録', `<div class="ex-g">${btn('daily', '今日のお題')}${btn('busho', '武将の記録')}${btn('gear', '武具の図鑑')}${btn('ach', '実績')}${hasGameCenter() ? btn('gc', 'ランキング') : ''}${btn('how', '遊び方')}${btn('credit', 'クレジット')}${btn('terms', '規約・プライバシー')}${btn('mail', '問い合わせ')}</div>`, onLeave);
  const go = {
    daily: () => dailyScreen(G, self),
    busho: () => import('./zukan.js').then((z) => z.zukanOpen('busho')),
    ach: () => import('./zukan.js').then((z) => z.zukanOpen('ach')),
    gear: () => gearScreen(G, self),
    gc: () => gcShow(),
    how: () => howScreen(self),
    credit: () => creditScreen(self),
    terms: () => termsScreen(self),
    mail: () => { location.href = contactMail(); },
  };
  for (const b of s.querySelectorAll('.ex-b')) b.onclick = () => { sfx('ui'); go[b.dataset.k](); };
}
export function dailyScreen(G, back) {
  const v = dailyView();
  const flags = [3, 7, 14, 30].map((d) => `<i class="${v.streak >= d ? 'on' : ''}" title="${d}日"></i>`).join('');
  view('今日のお題', `<p>続けて開いた日：${v.streak}日${v.next ? `（あと${v.next.d - v.streak}日で褒美）` : ''}</p><div class="ex-fl" role="img" aria-label="褒美の旗 3日・7日・14日・30日">${flags}</div>
    ${v.items.map((q) => `<div class="ex-q${q.done ? ' done' : ''}"><span>${esc(q.name)} ${q.prog ? `<small>${q.prog}</small>` : ''}</span><small>${q.kan}貫</small></div>`).join('')}`, back);
}
const SLOT = { weapon: '得物', hat: '頭', body: '胴', arm: '腕', thigh: '腿', shin: '脛', gun: '鉄砲', horse: '馬' };
export function gearScreen(G, back) {
  const own = new Set(G.owned || []);
  const ids = Object.keys(ITEMS);
  const got = ids.filter((id) => own.has(id)).length;
  const cells = ids.map((id) => { const it = ITEMS[id], has = own.has(id); return `<div class="ex-it${has ? '' : ' no'}"><b>${has ? esc(it.name) : '？'}</b><small>${esc(SLOT[it.slot] || '')}</small></div>`; }).join('');
  view('武具の図鑑', `<p>${got} / ${ids.length}</p><div class="ex-g">${cells}</div>`, back);
}
// 遊び方：絵で短く（一枚の絵に一言）
const HOW = [
  ['<path d="M8 50h48" stroke="currentColor" stroke-width="3"/><path d="M14 50V22l14-8 14 8v28" fill="none" stroke="currentColor" stroke-width="3"/><path d="M40 12v38" stroke="#e6c77a" stroke-width="3"/><path d="M41 13h14l-4 5 4 5H41z" fill="#e6c77a"/>', '出陣で戦を選ぶ'],
  ['<circle cx="18" cy="38" r="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="18" cy="38" r="5" fill="currentColor"/><circle cx="46" cy="38" r="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M38 38h16M46 30v16" stroke="currentColor" stroke-width="2.5"/>', '左で歩く・右で見る'],
  ['<path d="M32 8c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z" fill="#e6c77a"/><circle cx="32" cy="22" r="5" fill="#14120f"/><path d="M14 56h36" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4"/>', 'ピンへ向かう'],
  ['<path d="M20 10v46" stroke="currentColor" stroke-width="3"/><rect x="21" y="12" width="24" height="18" fill="#14120f" stroke="#c8402c" stroke-width="4"/><path d="M48 50 30 32" stroke="currentColor" stroke-width="4"/><path d="M28 30l-4-6 7 3z" fill="currentColor"/>', '赤い縁の旗が敵'],
  ['<rect x="12" y="40" width="10" height="14" fill="currentColor" opacity=".5"/><rect x="27" y="30" width="10" height="24" fill="currentColor" opacity=".75"/><rect x="42" y="16" width="10" height="38" fill="#e6c77a"/><path d="M47 6v8M43 10l4-4 4 4" fill="none" stroke="#e6c77a" stroke-width="2.5"/>', '手柄で位が上がる'],
  ['<path d="M18 54 46 12" stroke="currentColor" stroke-width="4"/><path d="M44 8l6-2-2 7z" fill="currentColor"/><circle cx="20" cy="22" r="10" fill="none" stroke="#e6c77a" stroke-width="3"/><path d="M20 16v12M16 20h8" stroke="#e6c77a" stroke-width="2"/>', '武具を買って次へ'],
];
export function howScreen(back) {
  const css = `<style>.ex-how { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; } .ex-how div { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; background: rgba(20,18,15,.82); border: 1px solid rgba(236,228,210,.28); } .ex-how svg { width: 64px; height: 64px; color: var(--washi); } .ex-how b { font-size: max(15px, calc(15px * var(--text-scale, 1))); text-align: center; }</style>`;
  view('遊び方', `${css}<div class="ex-how">${HOW.map(([g, t], i) => `<div><svg viewBox="0 0 64 64" aria-hidden="true">${g}</svg><b>${i + 1}．${t}</b></div>`).join('')}</div>`, back);
}
export function creditScreen(back) {
  view('クレジット', `<p>作：kaito</p><p>標高：国土地理院 地理院タイル</p><p>3Dの頭：Lee Perry-Smith（CC BY 3.0）</p><p>胴丸のスキャン：Giravolt（CC BY 4.0）</p><p>人の動き：three.js の見本（Mixamo）</p><p>そのほかの写真・素材の出所は、アプリの docs/CREDITS.md にまとめてある。</p>`, back);
}
export function termsScreen(back) {
  view('規約・プライバシー', `<p><b>プライバシー</b><br>名前・メール・位置など、あなたを特定する情報は集めません。進みの記録は、この端末（と、使う設定なら iCloud）にだけ置きます。</p><p><b>広告</b><br>アプリでは、戦に勝った後にだけ広告が出ます（戦の中・負けた後・題の画面には出ません）。広告の会社は、端末の広告用の番号を使う事があります。使わせるかは、初めに出る問いと端末の設定で選べます。『広告を消す』を買うと出なくなります。</p><p><b>買い物</b><br>支払いは App Store（Android は Google Play）で行い、カードの番号などはこのゲームに届きません。買った品は、端末を替えても「購入を復元する」で戻せます。</p><p><b>利用</b><br>個人で楽しむために使えます。史実をもとにした物語で、描き方には創作が混じります。</p><p><b>問い合わせ</b><br><a href="${esc(contactMail())}">メールを書く</a></p>`, back);
}
