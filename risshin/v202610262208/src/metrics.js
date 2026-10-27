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
  reloadPrev();
  watchLeave(game);
  watchErrors(() => (cur && cur.id) || (game.inTown ? 'town' : '-'));

  const falls = {};   // 戦の id ごとに、今回の遊びで倒れた回数
  let cur = null;     // いま戦っている戦 { id, mode }
  let titleAt = null;
  const prepared = new WeakSet();
  document.addEventListener('click', e => {
    const button = e.target?.closest?.('[data-first-depart], #b-next');
    if (!button || button.disabled) return;
    metric('depart_tap', { battle_id: button.hasAttribute('data-first-depart') ? 'inou' : bid(game.G?.battle || 0) });
  }, true);
  window.addEventListener('risshin-battle-ready', () => {
    const b = game.battle, timing = b?.startTiming;
    if (!b || !timing?.ready || prepared.has(b)) return;
    prepared.add(b);
    metric('preparation_ready', { battle_id: bid(b.index), loading_ms: timing.loadingMs, total_ms: timing.totalMs,
      title_ms: titleAt == null ? -1 : Math.round(performance.now() - titleAt) });
  });
  const begin = (id, mode) => {
    cur = { id, mode };
    once('first-battle', 'first_battle_start', { battle_id: id });
    metric('battle_start', { battle_id: id, mode, tries: (falls[id] || 0) + 1 });
    perfBegin(game, id);
    stepBegin(game, id);
  };
  // 10/26：iPhone は戦の前に頁を読み直して続ける（memReloadGate）。読み直す前の呼び出しは数えない（読み直した後にもう一度呼ばれる）
  wrap(game, 'startBattle', null, function (_c, i) {
    if (window.__memReloading) return;
    const G = this.G || {};
    begin(bid(i), G.lord ? 'lord' : G.practice ? 'practice' : 'ashigaru');
  });
  wrap(game, 'startDojo', () => begin('dojo', 'dojo'));
  wrap(game, 'startMapBattle', () => begin('mapcastle', 'map'));
  // 戦の途中で題へ戻った＝途中でやめた
  wrap(game, 'title', function () {
    const b = this.battle;
    perfEnd(); stepEnd();
    if (b && !b.over && cur) metric('battle_quit', { battle_id: cur.id, sec: Math.round(b.t || 0), falls: falls[cur.id] || 0, kills: (b.stats && b.stats.kills) || 0 });
    cur = null;
  }, function () {
    titleAt = performance.now();
    metric('title_view', { battle_id: document.querySelector('[data-first-depart]') ? 'inou' : bid(this.G?.battle || 0) });
  });
  wrap(game, 'endBattle', function (b) {
    return { prevResult: this.lastResult, id: (b.def && b.def.dojo) ? 'dojo' : (b.def && b.def.mapCastle) ? 'mapcastle' : bid(b.index) };
  }, function (c, b) {
    perfEnd(); stepEnd();
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
  // link_text・file_name は GA の決まりの欄（カスタム定義なしで読み出せる。10/26）
  metric('js_error', { msg: m, file: fileOf(file), line: Number(line) || 0, battle_id: bidNow(), link_text: m, file_name: fileOf(file) + ':' + (Number(line) || 0), level: liveStage() });
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
  const p95 = a[Math.min(n - 1, Math.floor(n * 0.95))];
  metric('perf', { content_type: p95 > 100 ? 'bad' : p95 > 50 ? 'slow' : 'ok', level: liveStage(), battle_id: P.id, sec: Math.round((b && b.t) || 0), ms_med: Math.round(a[n >> 1] * 10) / 10, ms_p95: Math.round(a[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10, over50: over, frames: n, heat, quality: cleanId(S.quality), men, dev: P.dev });
}
function perfEnd() { if (pf) { cancelAnimationFrame(pf.raf); pf = null; } }

// ③ crash_prev：前回の落ち（main.js が risshin-crashes に [時刻, 戦の id, 画質, 秒?, 熱?, 軽さ?] を残す）。まだ送っていない物だけ、二件まで
function crashPrev() {
  // 記録が読めなかった事（save_guard.js が risshin-save-bad に、どの欄が崩れていたかを残す）。一度だけ送る
  try {
    const sb = JSON.parse(localStorage.getItem('risshin-save-bad') || 'null');
    if (sb && Number(sb.at) > (Number(localStorage.getItem(MARK + 'savebad-sent')) || 0) && S.sendMetrics !== false) {
      metric('save_bad', { why: String(sb.why || '?').replace(/[^a-zA-Z0-9_,]/g, '').slice(0, 80), dev: deviceClass() });
      localStorage.setItem(MARK + 'savebad-sent', String(sb.at));
    }
  } catch (e) { /* noop */ }
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

// ---------------- どこまで進んでやめたか（10/26） ----------------
// GA の決まりの欄だけで読めるように、段は level、どう終わったかは method に入れる（battle_id は登録済み）。
//   battle_step：任務の段が変わった（一戦12回まで）
//   battle_leave：戦の途中で画面を離れた（hide＝ほかのアプリへ・pagehide＝閉じた。一戦3回まで）
//   battle_reload：前の頁が戦の途中で終わりの知らせなしに消えた（落ち・固まって読み直し）。次に開いた時に一度
//   battle_stuck：勝ち負けが決まって60秒たっても結果へ進まない（over）／戦の時計が20秒止まった（frozen）。一戦一度
//   gl_lost：描く力（WebGL）を失った
const LIVE_KEY = 'risshin-metrics-live';
let st = null;
function stageOf(b) {
  const def = b.def || {}, list = def.missions || def.stages, of = def.missionOf || def.stageOf;
  if (list && of) { try { return Math.max(0, Math.min(list.length - 1, of.call(def, b) | 0)); } catch (e) { return -1; } }
  const o = (b.objectives || []).find((x) => x.kind === 'main' && !x.state), t = o ? o.text : '';
  if (st && t && t !== st.lastText) { st.lastText = t; st.texts++; }
  return st ? Math.max(0, st.texts - 1) : 0;
}
function liveStage() { return st ? String(st.stage) : '-'; }
const liveSec = () => { try { const b = st && st.game.battle; return Math.round((b && b.t) || 0); } catch (e) { return 0; } };
function saveLive() {
  try { if (st) sessionStorage.setItem(LIVE_KEY, JSON.stringify({ id: st.id, level: st.stage, sec: liveSec(), at: Date.now() })); } catch (e) { /* noop */ }
}
function stepBegin(game, id) {
  stepEnd();
  if (S.sendMetrics === false || BLOCKED || !GA_ID) return;
  const S0 = st = { game, id, prev: game.battle, b: null, stage: 0, steps: 0, leaves: 0, stuck: false, lastText: '', texts: 0, overAt: 0, tAt: 0, lastT: -1, iv: 0 };
  S0.iv = setInterval(() => {
    try {
      if (st !== S0) return;
      const b = game.battle;
      if (!b || b === S0.prev || b.ended) return;   // 読み込みの間
      if (S0.b !== b) { S0.b = b; S0.stage = 0; S0.lastText = ''; S0.texts = 0; S0.overAt = 0; S0.tAt = 0; S0.lastT = -1; }
      const now = performance.now();
      if (!b.over) {
        const k = stageOf(b);
        if (k > S0.stage && S0.steps < 12) { S0.stage = k; S0.steps++; metric('battle_step', { battle_id: id, level: String(k), sec: Math.round(b.t || 0) }); }
      }
      saveLive();
      if (S0.stuck || document.hidden) { S0.tAt = 0; return; }
      if (b.over) {
        if (!S0.overAt) S0.overAt = now;
        else if (now - S0.overAt > 60000) { S0.stuck = true; metric('battle_stuck', { battle_id: id, method: 'over', level: String(S0.stage), sec: Math.round(b.t || 0) }); }
      } else if (!game.paused && game.battle === b && $hidden() && !b.retryOpen && !document.querySelector('dialog[open]')) {
        if (b.t !== S0.lastT) { S0.lastT = b.t; S0.tAt = now; }
        else if (S0.tAt && now - S0.tAt > 20000) { S0.stuck = true; metric('battle_stuck', { battle_id: id, method: 'frozen', level: String(S0.stage), sec: Math.round(b.t || 0) }); }
      } else S0.tAt = 0;
    } catch (e) { /* noop */ }
  }, 1000);
}
// 読み込みの札が出ている間は時計が止まって当たり前
const $hidden = () => { const el = document.getElementById('loading'); return !el || el.hidden; };
function stepEnd() {
  if (st) { clearInterval(st.iv); st = null; }
  try { sessionStorage.removeItem(LIVE_KEY); } catch (e) { /* noop */ }
}
function watchLeave(game) {
  const leave = (how) => {
    try {
      if (!st || window.__memReloading) return;
      const b = game.battle;
      if (!b || b === st.prev || b.over || st.leaves >= 3) return;
      st.leaves++;
      metric('battle_leave', { battle_id: st.id, method: how, level: String(st.stage), sec: Math.round(b.t || 0) });
    } catch (e) { /* noop */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave('hide'); });
  addEventListener('pagehide', () => {
    leave('pagehide');
    // 頁を閉じた・読み直す時は印を消す（残っていれば、次に開いた時に「消えた」と分かる）
    try { sessionStorage.removeItem(LIVE_KEY); } catch (e) { /* noop */ }
  });
  // 描く器（game.renderer）は initMetrics の後に置かれるので、一拍おいてから見る
  setTimeout(() => {
    try {
      game.renderer?.domElement?.addEventListener('webglcontextlost', () => {
        if (window.__memReloading) return;
        metric('gl_lost', { battle_id: st ? st.id : '-', level: liveStage(), sec: liveSec() });
      });
    } catch (e) { /* noop */ }
  }, 0);
}
function reloadPrev() {
  try {
    const r = JSON.parse(sessionStorage.getItem(LIVE_KEY) || 'null');
    sessionStorage.removeItem(LIVE_KEY);
    if (!r || !r.id || !(Date.now() - r.at < 30 * 60 * 1000)) return;
    metric('battle_reload', { battle_id: cleanId(r.id), method: 'reload', level: String(r.level | 0), sec: r.sec | 0, dev: deviceClass() });
  } catch (e) { /* noop */ }
}
