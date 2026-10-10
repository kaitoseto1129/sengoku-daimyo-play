// 遊びの数字（Google Analytics 4）：どの戦で何人がやめたか・何分遊んだか・何回倒れたか・完全版の札を見て買ったか、を作り手が見て直すための記録。
// 送り先は GA4 だけ。測定 ID（GA_ID）が空なら何も送らない。名前・保存の中身・端末の識別子は送らない（出来事の名前と、戦の id・秒・回数だけ）。
// 広告の個人化・Google シグナルは切って読み込む。自動の道具（navigator.webdriver）・手元（localhost）・?notrack では送らない。
// 設定「遊びの記録を送る」（S.sendMetrics）が切なら送らない。本体には手を入れず、window.__game の出入り口を包む（count.js と同じ作り）。
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

  const falls = {};   // 戦の id ごとに、今回の遊びで倒れた回数
  let cur = null;     // いま戦っている戦 { id, mode }
  const begin = (id, mode) => {
    cur = { id, mode };
    once('first-battle', 'first_battle_start', { battle_id: id });
    metric('battle_start', { battle_id: id, mode, tries: (falls[id] || 0) + 1 });
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
    if (b && !b.over && cur) metric('battle_quit', { battle_id: cur.id, sec: Math.round(b.t || 0), falls: falls[cur.id] || 0, kills: (b.stats && b.stats.kills) || 0 });
    cur = null;
  });
  wrap(game, 'endBattle', function (b) {
    return { prevResult: this.lastResult, id: (b.def && b.def.dojo) ? 'dojo' : (b.def && b.def.mapCastle) ? 'mapcastle' : bid(b.index) };
  }, function (c, b) {
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
