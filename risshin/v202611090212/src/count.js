// 数え（GoatCounter）：戦国大名と同じサイト（kaito.goatcounter.com）に、道の頭を /risshin/ にして送る。
// 送るのは github.io で開いた時と、iPhone アプリ（ios/。app:// の scheme で読む）だけ。
// 手元（localhost）・claude.ai の Artifact では送らず、window.__countLog に記すだけ。
// 本体には手を入れず、window.__game（main.js の game）の出入り口を包んで数える。保存（state.js）には触らない。
// 管理画面：https://kaitoseto1129.github.io/sengoku-daimyo-play/admin/?game=risshin
import { BATTLES, RANKS, SCENARIOS, scenarioKey } from './state.js';

const ENDPOINT = 'https://kaito.goatcounter.com/count';
const PREFIX = '/risshin/';
const MARK = 'sengoku-risshin-count-';   // この数えだけが使う鍵（保存とは別）
const LOG = (window.__countLog = window.__countLog || []);

function off() {
  try {
    const isApp = location.protocol === 'app:';   // iPhone アプリ（GameSchemeHandler）の中
    if (!isApp && !/(^|\.)github\.io$/.test(location.hostname)) return true;   // Artifact・手元では送らない
    if (/[?&]notrack/.test(location.search)) localStorage.setItem('sengoku_notrack', '1');
    if (/[?&](bot|notrack|debug)\b/.test(location.search)) return true;
    if (navigator.webdriver) return true;                            // 自動のテストでは送らない
    if (localStorage.getItem('sengoku_notrack') === '1') return true; // 戦国大名と同じ「数えない」の印
  } catch (e) { /* 読めなくても続ける */ }
  return false;
}
const OFF = off();
const clean = (s) => String(s).replace(/[^-\w:.ぁ-んァ-ヶー一-龠々〆ヵヶ]/g, '').slice(0, 40) || '-';

let queue = [];
function send(p, pageview) {
  const path = PREFIX + p;
  LOG.push(path); if (LOG.length > 300) LOG.shift();
  if (OFF) return;
  const gc = window.goatcounter;
  const arg = pageview ? { path, title: '戦国立身' } : { path, title: p.replace(/^ev\//, ''), event: true };
  if (gc && gc.count) { try { gc.count(arg); } catch (e) { /* 送れなくても遊べる */ } } else queue.push(arg);
}
export function track(ev) { try { send('ev/' + ev); } catch (e) { /* noop */ } }
function trackOnce(key, ev) {
  try { const k = MARK + 's-' + key; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { /* 覚えられなければ毎回 */ }
  track(ev);
}

function loadScript() {
  if (OFF) return;
  window.goatcounter = Object.assign(window.goatcounter || {}, { no_onload: true, no_events: true });
  const sc = document.createElement('script');
  sc.async = true; sc.dataset.goatcounter = ENDPOINT; sc.src = 'https://gc.zgo.at/count.js';
  sc.onload = () => { const q = queue; queue = []; for (const a of q) { try { window.goatcounter.count(a); } catch (e) { /* noop */ } } };
  document.head.appendChild(sc);
}

function firstVisit() {
  try {
    const q = new URLSearchParams(location.search);
    const w = innerWidth, h = innerHeight;
    trackOnce('dev', `dev/${w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop'}/${Math.round(w / 10) * 10}x${Math.round(h / 10) * 10}`);
    let src = q.get('utm_source') || q.get('src') || 'direct';
    if (src === 'direct' && document.referrer) { try { src = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (e) { /* noop */ } }
    trackOnce('src', `src/${String(src).replace(/[^a-z0-9.-]/gi, '').slice(0, 24) || 'direct'}` + (q.get('utm_campaign') ? `/${q.get('utm_campaign').replace(/[^a-z0-9\-_]/gi, '').slice(0, 24)}` : ''));
    // 読み込みの秒数：開いてから本体（main.js と絵・音の組み立て）が動き出すまで
    const lt = Math.round(performance.now());
    trackOnce('load', `load/${lt < 1000 ? '1s' : lt < 3000 ? '3s' : lt < 8000 ? '8s' : 'slow'}`);
    const now = Date.now();
    const first = +localStorage.getItem(MARK + 'first') || 0;
    if (!first) { localStorage.setItem(MARK + 'first', String(now)); trackOnce('new', 'user/new'); }
    else {
      trackOnce('ret0', 'user/return');
      const day = Math.floor((now - first) / 86400000), last = +(localStorage.getItem(MARK + 'lastday') ?? -1);
      if (day !== last && [1, 2, 3, 7, 14, 30].includes(day)) track(`ret/day${day}`);
      localStorage.setItem(MARK + 'lastday', String(day));
    }
  } catch (e) { /* noop */ }
}

// 遊んだ時間（画面が見えている間だけ数える）
function stayWatch() {
  let seen = 0, t = Date.now();
  const sent = {};
  setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible') seen += now - t;
    t = now;
    const m = seen / 60000;
    for (const [k, name] of [[1, '1分'], [5, '5分'], [15, '15分'], [30, '30分'], [60, '60分'], [120, '120分']]) {
      if (m >= k && !sent[name]) { sent[name] = 1; track('stay/' + name); }
    }
  }, 5000);
}

// 不具合（一度の遊びで三つまで）
function errWatch(game) {
  let n = 0;
  const EXT = /invoking postMessage|Script error|ResizeObserver loop|fbclid|instantMessag/i;
  const where = () => (game.battle ? '/battle' : '/menu');
  addEventListener('error', (e) => {
    if (n++ >= 3) return;
    const m = String(e.message || '?');
    const ext = EXT.test(m) || (e.filename && !/\/risshin\/|localhost|github\.io/.test(String(e.filename)));
    track((ext ? 'err-ext/' : 'err/') + m.replace(/[^a-zA-Z0-9 _:.-]/g, '').slice(0, 40) + where());
  });
  addEventListener('unhandledrejection', (e) => {
    if (n++ >= 3) return;
    track('err/rej/' + String((e.reason && e.reason.message) || '?').replace(/[^a-zA-Z0-9 _:.-]/g, '').slice(0, 40) + where());
  });
}

const scnName = () => clean((SCENARIOS[scenarioKey()] || {}).name || scenarioKey());
const battleName = (i) => clean((BATTLES[i] || {}).name || `戦${i}`);
function mode(game) {
  const G = game.G || {};
  return G.lord ? 'lord' : G.trialStep === 3 && G.rank === 4 ? 'samurai' : G.practice ? 'practice' : 'ashigaru';
}

// main.js の game の出入り口を包む（中身はそのまま呼ぶ）
function wrap(obj, name, before, after) {
  const f = obj[name];
  if (typeof f !== 'function') return;
  obj[name] = function (...a) {
    let ctx;
    try { ctx = before && before.apply(this, a); } catch (e) { /* 数えの失敗で遊びを止めない */ }
    const r = f.apply(this, a);
    try { if (after) after.call(this, ctx, ...a); } catch (e) { /* noop */ }
    return r;
  };
}

export function initCount(game) {
  if (!game || game.__counted) return;
  game.__counted = true;
  loadScript();
  send('', true);   // 頁を開いた（訪問）
  firstVisit();
  stayWatch();
  errWatch(game);

  let fromTitle = true;   // 題の画面から、まだ出陣していない
  const started = (kind) => {
    if (!fromTitle) return;
    fromTitle = false;
    track(`start/${scnName()}/${kind}`);
    trackOnce('depth0', 'depth/始めた');
  };
  trackOnce('title', 'title/view');
  // 題の画面のまま頁を離れたら「題でやめた」を一度だけ
  const titleLeave = () => { if (fromTitle) trackOnce('title-leave', 'title/leave'); };
  addEventListener('pagehide', titleLeave);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') titleLeave(); });
  wrap(game, 'title', function () {
    // 戦の途中（勝ち負けが付く前）に一時停止からタイトルへ戻った時は「途中でやめた」
    const b = this.battle;
    if (b && !b.over) track(`quit/${battleName(b.index)}/${Math.round(b.t || 0)}s`);
    fromTitle = true; trackOnce('title', 'title/view');
  });
  wrap(game, 'base', () => track('town/enter'));
  wrap(game, 'startBattle', function (i) { started(mode(this)); track(`battle/${battleName(i)}`); });
  wrap(game, 'startDojo', () => { started('dojo'); track('battle/稽古場'); });
  wrap(game, 'startMapBattle', function () { started('map'); track('battle/城攻め'); });
  wrap(game, 'endBattle', function (b) {
    const dojo = !!(b && b.def && b.def.dojo), map = !!(b && b.def && b.def.mapCastle);
    const G = this.G || {};
    return { dojo, map, i: b.index, prevResult: this.lastResult, practice: !!G.practice, lord: !!G.lord, last: b.index === BATTLES.length - 1, name: battleName(b.index) };
  }, function (c, b) {
    if (!c || !b) return;
    const res = b.result || {};
    const mission = b.tracker && b.tracker.main === true;
    const out = res.dead ? 'dead' : !res.down && mission ? 'win' : 'lose';
    const nm = c.dojo ? '稽古場' : c.map ? '城攻め' : c.name;
    track(`battle-end/${out}/${nm}`);
    if (!c.dojo) track(`mission/${mission ? 'ok' : 'ng'}/${nm}`);
    if (!c.dojo && !c.map) {
      try { if (!localStorage.getItem(MARK + 'act1')) { localStorage.setItem(MARK + 'act1', '1'); track('activation/first-battle-complete'); } } catch (e) { /* noop */ }
      if (res.dead) { if (!c.practice) track(`result/dead/${scnName()}`); return; }
      const r = this.lastResult;
      if (r && r !== c.prevResult) {
        if (r.promoted && !c.lord) {
          const rk = clean((RANKS[r.rankAfter] || {}).name || r.rankAfter);
          track(`promote/${rk}`);
          trackOnce('depth-' + rk, `depth/${rk}`);
        }
        if (c.last && !c.practice) track(`result/${c.lord ? 'lord' : 'clear'}/${scnName()}`);
      }
    }
  });
}

// 感想（戦功評価・一時停止の「ひとこと」欄）：個人を特定する物は送らない。
// 改行・@から後ろ・数字の並び（2桁以上）を落とし、URLの道に使える字だけ残して80字まで
const cleanText = (s) => String(s || '')
  .replace(/[\r\n]+/g, ' ').replace(/@\S*/g, '').replace(/\d{2,}/g, '#')
  .replace(/[^\wぁ-んァ-ヶー一-龠々〆ヵヶ 、。！？]/g, '').trim().slice(0, 80);
export function trackFeedback(where, kind, text) {
  const t = cleanText(text).replace(/\s+/g, '_');
  track(`fb/${where}/${kind || 'text'}${t ? '/' + t : ''}`);
}
