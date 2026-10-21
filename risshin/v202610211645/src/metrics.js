// 遊びの数字（Google Analytics 4）：どの戦で何人がやめたか・何分遊んだか・何回倒れたか・完全版の札を見て買ったか、を作り手が見て直すための記録。
// 送り先は GA4 だけ。測定 ID（GA_ID）が空なら何も送らない。名前・保存の中身・端末の識別子は送らない（出来事の名前と、戦の id・秒・回数だけ）。
// 広告の個人化・Google シグナルは切って読み込む。自動の道具（navigator.webdriver）・手元（localhost）・?notrack では送らない。
// 設定「遊びの記録を送る」（S.sendMetrics）が切なら送らない。本体には手を入れず、window.__game の出入り口を包む（count.js と同じ作り）。
// 10/21（kaito の許し）：直すための匿名の三つ＝js_error（誤りの文の頭・場所）・perf（戦ごとに30秒おきの重さ・一戦6回まで）・crash_prev（前回の落ち）も同じ設定に従って送る。
// 手順は docs/metrics-setup.md。送ろうとした物は window.__metricsLog に残る（確かめ用）。
import { BATTLES, RANKS } from './state.js';
import { S } from './settings.js';

export const GA_ID = 'G-XQ8KRZ0WHH';   // 例 'G-XXXXXXXXXX'。GA4 のデータストリームの測定 ID を入れる（空なら送らない）

const LOG = (window.__metricsLog = window.__metricsLog || []);
const MARK = 'sengoku-risshin-metrics-';
let ready = false;

const cleanId = (s) => String(s == null ? '' : s).replace(/[^-\w.ぁ-んァ-ヶー一-龠々]/g, '').slice(0, 40) || '-';
const isApp = () => { try { return location.protocol === 'app:' || !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iap); } catch (e) { return false; } };
const isPhone = () => { try { return matchMedia('(pointer: coarse)').matches ? 'phone' : 'pc'; } catch (e) { return 'pc'; } };

function blocked() {
  try {
    if (navigator.webdriver) return true;
    if (/[?&]notrack/.test(location.search)) localStorage.setItem('sengoku_notrack', '1');
    if (/[?&](bot|notrack|debug)\b/.test(location.search)) return true;
    if (localStorage.getItem('sengoku_notrack') === '1') return true;
  } catch (e) { /* 読めなくても続ける */ }
  return false;
}
// 確かめ用：?metricslog を付けると、自動の道具でも「送ろうとした物」を記録だけする（実際には送らない）
const DRY = (() => { try { return /[?&]metricslog\b/.test(location.search); } catch (e) { return false; } })();
const BLOCKED = DRY ? false : blocked();
const local = () => DRY || (!isApp() && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));

function boot() {
  if (ready || !GA_ID || BLOCKED) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // 個人の追跡はしない：広告の機能・個人化・Google シグナルを切り、頁の見出しの自動送信もしない
  window.gtag('config', GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true, anonymize_ip: true });
  const sc = document.createElement('script');
  sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(sc);
}

// 出来事を一か所で送る。name は半角の英小文字と _（GA4 の決まり）。params の値は数か短い字だけ
export function metric(name, params) {
  try {
    if (!GA_ID || BLOCKED || S.sendMetrics === false) return;
    const p = Object.assign({ platform: isApp() ? 'app' : 'web', device: isPhone() }, params || {});
    LOG.push({ name, params: p }); if (LOG.length > 400) LOG.shift();
    if (local()) return;   // 手元・確かめでは記録だけ。送らない
    boot();
    if (typeof window.gtag === 'function') window.gtag('event', name, p);
  } catch (e) { /* 記録の失敗で遊びを止めない */ }
}
const once = (key, name, params) => {
  try { const k = MARK + key; if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { /* 覚えられなければ毎回 */ }
  metric(name, params);
};

// 完全版の札（買い物の画面）が呼ぶ：window.risshinMetrics.fullView() / fullBuyTap() / fullBuyOk()
const API = {
  fullView: () => metric('full_offer_view'),
  fullBuyTap: () => metric('full_buy_tap'),
  fullBuyOk: () => metric('full_buy_ok'),
};
window.risshinMetrics = Object.assign(window.risshinMetrics || {}, API);
export const fullView = API.fullView, fullBuyTap = API.fullBuyTap, fullBuyOk = API.fullBuyOk;

const bid = (i) => cleanId((BATTLES[i] && (BATTLES[i].id || BATTLES[i].name)) || `b${i}`);
function wrap(obj, name, before, after) {
  const f = obj[name];
  if (typeof f !== 'function') return;
  obj[name] = function (...a) {
    let ctx;
    try { ctx = before && before.apply(this, a); } catch (e) { /* noop */ }
    const r = f.apply(this, a);
    try { if (after) after.call(this, ctx, ...a); } catch (e) { /* noop */ }
    return r;
  };
}

export function initMetrics(game) {
  if (!game || game.__metrics) return;
  game.__metrics = true;
  metric('app_open');
  crashPrev();
  watchErrors(() => (cur && cur.id) || (game.inTown ? 'town' : '-'));

  const falls = {};   // 戦の id ごとに、今回の遊びで倒れた回数
  let cur = null;     // いま戦っている戦 { id, mode }
  const begin = (id, mode) => {
    cur = { id, mode };
    once('first-battle', 'first_battle_start', { battle_id: id });
    metric('battle_start', { battle_id: id, mode, tries: (falls[id] || 0) + 1 });
    perfBegin(game, id);
  };
  wrap(game, 'startBattle', function (i) {
    const G = this.G || {};
    begin(bid(i), G.lord ? 'lord' : G.practice ? 'practice' : 'ashigaru');
  });
  wrap(game, 'startDojo', () => begin('dojo', 'dojo'));
  wrap(game, 'startMapBattle', () => begin('mapcastle', 'map'));
  // 戦の途中で題へ戻った＝途中でやめた
  wrap(game, 'title', function () {
    const b = this.battle;
    perfEnd();
    if (b && !b.over && cur) metric('battle_quit', { battle_id: cur.id, sec: Math.round(b.t || 0), falls: falls[cur.id] || 0, kills: (b.stats && b.stats.kills) || 0 });
    cur = null;
  });
  wrap(game, 'endBattle', function (b) {
    return { prevResult: this.lastResult, id: (b.def && b.def.dojo) ? 'dojo' : (b.def && b.def.mapCastle) ? 'mapcastle' : bid(b.index) };
  }, function (c, b) {
    perfEnd();
    if (!c || !b) return;
    const res = b.result || {};
    const mission = b.tracker && b.tracker.main === true;
    const out = res.dead ? 'dead' : !res.down && mission ? 'win' : 'lose';
    if (out === 'dead') falls[c.id] = (falls[c.id] || 0) + 1;
    metric(out === 'win' ? 'battle_win' : 'battle_lose', { battle_id: c.id, result: out, sec: Math.round(b.t || 0), falls: falls[c.id] || 0, kills: (b.stats && b.stats.kills) || 0 });
    cur = null;
    const r = this.lastResult;
    if (r && r !== c.prevResult && r.promoted) metric('stage_up', { rank: cleanId((RANKS[r.rankAfter] || {}).name || r.rankAfter) });
  });

  // 設定を変えた（どの項目かだけ。値は送らない）
  document.addEventListener('change', (e) => {
    const id = e.target && e.target.id;
    if (id && /^st-/.test(id) && id !== 'st-metrics') metric('setting_change', { key: cleanId(id.slice(3)) });
  }, true);
}

// ---------------- 直すための匿名の記録（10/21） ----------------
// 端末のおおまかな区分（機種名や識別子は取らない）：種類＋画面の短い辺の段＋芯の数の段
function deviceClass() {
  try {
    const ua = navigator.userAgent || '';
    const os = /iPhone/.test(ua) ? 'iphone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ipad' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'win' : 'other';
    const side = Math.min(screen.width || 0, screen.height || 0), sb = side < 400 ? 's' : side < 800 ? 'm' : 'l';
    const c = navigator.hardwareConcurrency || 0, cb = c >= 8 ? 'c8' : c >= 6 ? 'c6' : c ? 'c4' : 'c0';
    return `${os}_${sb}_${cb}`;
  } catch (e) { return 'other'; }
}
// 誤りの文から場所の長い道（URL・端末の道）を外し、ファイルの名だけにする
const scrub = (s) => String(s == null ? '' : s).replace(/(?:https?|app|file|blob|capacitor):\/\/[^\s)'"]*\/([^\s/)'"?#]+)(?:[?#][^\s)'"]*)?/g, '$1').replace(/\/(?:Users|var|private|home)\/[^\s)'"]*/g, '~').replace(/\s+/g, ' ').trim();
const fileOf = (u) => { const m = String(u || '').split(/[?#]/)[0].match(/([^/]+)$/); return m ? m[1].slice(0, 40) : '-'; };

// ① js_error：一度の起動で4件まで・同じ誤りは一度だけ
let errN = 0; const errSeen = new Set();
function sendError(msg, file, line, bidNow) {
  if (errN >= 4) return;
  const m = scrub(msg).slice(0, 100) || '-', key = m + '|' + file + '|' + line;
  if (errSeen.has(key)) return;
  errSeen.add(key); errN++;
  metric('js_error', { msg: m, file: fileOf(file), line: Number(line) || 0, battle_id: bidNow() });
}
function watchErrors(bidNow) {
  addEventListener('error', (e) => {
    try {
      if (!e || !e.message) return;   // 絵や音の読み込みの失敗（文の無い出来事）は数えない
      if (!e.filename && /^Script error\.?$/.test(e.message || '')) return;   // 外の頁の中身の分からない誤り
      sendError(e.message, e.filename, e.lineno, bidNow);
    } catch (x) { /* noop */ }
  });
  addEventListener('unhandledrejection', (e) => {
    try {
      const r = e && e.reason, st = (r && r.stack) || '';
      const at = st.match(/([^\s/()@]+\.m?js)[^:\s]*:(\d+):\d+/);
      sendError('約束：' + ((r && r.message) || r), at ? at[1] : '-', at ? at[2] : 0, bidNow);
    } catch (x) { /* noop */ }
  });
}

// ② perf：戦の間だけ一コマの間を測り、30秒ごとに中央・95%・50ms 超の数を送る（一戦6回まで）
const PERF_EVERY = 30, PERF_MAX = 6;
const ft = new Float32Array(4096);
let pf = null;
function perfBegin(game, id) {
  perfEnd();
  if (S.sendMetrics === false || BLOCKED || !GA_ID) return;
  const P = pf = { game, id, prev: game.battle, n: 0, sent: 0, last: 0, t0: 0, raf: 0, dev: deviceClass() };
  const step = (now) => {
    if (pf !== P) return;
    const b = game.battle, live = b && b !== P.prev && !b.over && (b.t || 0) > 1;   // 読み込みの間は数えない
    if (!live) P.t0 = 0;
    if (P.last && live && !document.hidden) {
      const d = now - P.last;
      if (d > 0 && d < 1000) { if (P.n < ft.length) ft[P.n++] = d; }
      if (!P.t0) P.t0 = now;
      if (now - P.t0 >= PERF_EVERY * 1000) { perfFlush(P); P.t0 = now; }
    }
    P.last = document.hidden ? 0 : now;
    if (P.sent < PERF_MAX) P.raf = requestAnimationFrame(step);
  };
  P.raf = requestAnimationFrame(step);
}
function perfFlush(P) {
  const n = P.n; P.n = 0;
  if (n < 30 || P.sent >= PERF_MAX) return;
  const a = Array.from(ft.subarray(0, n)).sort((x, y) => x - y);
  let over = 0; for (let i = 0; i < n; i++) if (a[i] > 50) over++;
  const b = P.game.battle, heat = (() => { try { return window.__heat ? window.__heat().level : 0; } catch (e) { return 0; } })();
  let men = 0; try { const us = b && b.army && b.army.units; if (us) for (const u of us) if (u.alive) men++; } catch (e) { /* noop */ }
  P.sent++;
  metric('perf', { battle_id: P.id, sec: Math.round((b && b.t) || 0), ms_med: Math.round(a[n >> 1] * 10) / 10, ms_p95: Math.round(a[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10, over50: over, frames: n, heat, quality: cleanId(S.quality), men, dev: P.dev });
}
function perfEnd() { if (pf) { cancelAnimationFrame(pf.raf); pf = null; } }

// ③ crash_prev：前回の落ち（main.js が risshin-crashes に [時刻, 戦の id, 画質, 秒?, 熱?, 軽さ?] を残す）。まだ送っていない物だけ、二件まで
function crashPrev() {
  try {
    const log = JSON.parse(localStorage.getItem('risshin-crashes') || '[]');
    if (!Array.isArray(log) || !log.length) return;
    const mk = MARK + 'crash-sent', done = Number(localStorage.getItem(mk)) || 0;
    const fresh = log.filter((r) => Array.isArray(r) && Number(r[0]) > done).slice(-2);
    if (!fresh.length || S.sendMetrics === false) return;
    const count = Number(localStorage.getItem('risshin-crashcount')) || log.length;
    for (const r of fresh) metric('crash_prev', { battle_id: cleanId(r[1]), sec: r[3] == null ? -1 : Math.round(Number(r[3]) || 0), count, quality: cleanId(r[2]), heat: r[4] == null ? -1 : Number(r[4]) || 0, dev: deviceClass() });
    localStorage.setItem(mk, String(Math.max(...log.map((r) => Number(r && r[0]) || 0))));
  } catch (e) { /* noop */ }
}
