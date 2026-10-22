// 完全版の買い切り（500円）。織田家編の最初の3戦は無料、残りは完全版で開く。
// 買った印は、保存とは別の localStorage の鍵に持つ（state.js の save/load/migrate には触らない）。
// iOS アプリ：Swift（StoreKit 2）と橋でやり取りする。Web：Gumroad の購入と鍵の確認。
import { ODA_LINE, BATTLES, scenarioKey } from './state.js';

export const GUMROAD_URL = 'https://kaito42.gumroad.com/l/qtdtkl';     // 品の公開後に kaito が入れる。空の間は Web に鍵を掛けない。
export const GUMROAD_PRODUCT_ID = 'Q4jStWHqyyqbmLAz6BBgAQ==';
export const GUMROAD_LICENSE_KEY = 'risshin_gumroad_license';
export const FULL_KEY = 'risshin_full';
export const FREE_BATTLES = 3;
export const PRICE = '500円';

const store = {
  get() { try { return localStorage.getItem(FULL_KEY) === '1'; } catch (e) { return false; } },
  set(on) { try { if (on) localStorage.setItem(FULL_KEY, '1'); else localStorage.removeItem(FULL_KEY); } catch (e) {} },
};
// 自動の道具（bot・録画・漫画の撮影・テストプレイヤー）は裏の Chrome（navigator.webdriver）で動くので鍵を掛けない（10/7）
// 手元の開発用サーバー（localhost・127.0.0.1）も同じ。録画や bot の Chrome は webdriver が立たない事がある。公開の頁とアプリは別の場所なので鍵は掛かる
const auto = (() => { try { return !!navigator.webdriver || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch (e) { return false; } })();
// Steam（desktop/）の完全版は買い切りで売るので、中は鍵を掛けない（window.__fullApp）
export const isFull = () => auto || !!window.__fullApp || store.get();
export const setFull = (on) => store.set(!!on);

// 無料の三戦は桶狭間・森部・墨俣のまま。桶狭間より前の尾張統一戦（pre）は数えず、いつも無料
const MAIN_LINE = () => ODA_LINE.filter((b) => !b.pre);
const idsLocked = () => {
  const have = new Set(BATTLES.map((b) => b.id));
  return MAIN_LINE().slice(FREE_BATTLES).filter((b) => have.has(b.id));
};
// この戦（BATTLES の番号 i）に鍵が掛かっているか
export function isLocked(i) {
  if (isFull() || scenarioKey() !== 'oda') return false;
  if (window.__autoplayUnlock) return false;   // 実機の自動の測りの時だけ（10/17 に完全版の鍵で稲葉山から先が測れなかった）
  // Web は品のページが入るまで鍵を掛けない（買う道が無いまま止めない）。
  if (!window.__iosApp && !window.__androidApp && !GUMROAD_URL) return false;
  const b = BATTLES[i];
  if (!b) return false;
  const at = MAIN_LINE().findIndex((e) => e.id === b.id);
  return at >= FREE_BATTLES;
}

// Gumroad の重ねる買い物画面（gumroad.js）を一度だけ読む
function loadGumroad() {
  if (document.querySelector("script[src*='/js/gumroad.js']")) return;
  const sc = document.createElement('script');
  sc.src = 'https://gumroad.com/js/gumroad.js';
  sc.async = true;
  document.head.appendChild(sc);
}

const mt = (k) => { try { window.risshinMetrics && window.risshinMetrics[k] && window.risshinMetrics[k](); } catch (e) {} };
export const canRestorePurchases = () => !!(window.__iosApp || window.__androidApp);
const iap = (op) => { if (window.__androidApp) window.AndroidIap.postMessage(JSON.stringify({ op })); else window.webkit.messageHandlers.iap.postMessage({ op }); };
let pendingRestore = null;
let paywallState = null;
// 復元は設定からも呼べる。二度押しでは同じ確認を待つ。
export function restorePurchases() {
  if (pendingRestore) return pendingRestore.promise;
  if (!canRestorePurchases()) return Promise.reject(new Error('この端末では復元できません'));
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  const timer = setTimeout(() => {
    pendingRestore = null;
    reject(new Error('時間がかかっています。少し後でもう一度'));
  }, 120000);
  pendingRestore = { promise, resolve, reject, timer };
  try { iap('restore'); } catch (e) {
    clearTimeout(timer);
    pendingRestore = null;
    reject(new Error('復元できませんでした。少し後でもう一度'));
  }
  return promise;
}
let card = null;
const closeCard = () => { paywallState = null; if (card) { card.remove(); card = null; } };

// 鍵の札。買えたら onOpen を呼ぶ。閉じたら onClose
export function showPaywall(onOpen, onClose) {
  closeCard();
  const ios = !!(window.__iosApp || window.__androidApp);   // アプリ内課金（iOS は StoreKit・Android は Google Play Billing）
  const n = idsLocked().length;
  const canBuy = ios || !!GUMROAD_URL;
  const el = document.createElement('div');
  el.id = 'paywall';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'pw-title');
  el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(10,8,6,.82);box-sizing:border-box;padding:max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))';
  const btn = 'min-height:44px;padding:8px 18px;font-size:16px;margin:4px;cursor:pointer';
  el.innerHTML = `<div style="max-width:460px;width:100%;max-height:100%;min-height:0;overflow:auto;box-sizing:border-box;background:#1c1813;color:#f1e8d6;border:1px solid #8a7348;border-radius:8px;padding:16px 18px;font-size:15px;line-height:1.7">
    <h2 id="pw-title" style="margin:0 0 6px;font-size:20px;color:#e7c873">完全版の購入</h2>
    <p style="margin:4px 0">最初の${FREE_BATTLES}戦は、ずっと無料で遊べます。完全版を買うと、残りの${n}戦がすべて開きます。</p>
    <p style="margin:4px 0">一度買えば、ずっと遊べます（買い切り・${PRICE}）。</p>
    <p id="pw-msg" role="status" style="margin:6px 0;min-height:24px;color:#e7c873"></p>
    ${canBuy ? '' : '<p style="margin:4px 0">購入の準備中です。今はすべての戦を遊べます。</p>'}
    <div style="display:flex;flex-wrap:wrap;justify-content:center">
      ${canBuy ? (ios ? `<button class="btn primary" id="pw-buy" style="${btn}">完全版を買う（${PRICE}）</button>`
        : `<a class="btn primary" id="pw-buy" href="${GUMROAD_URL}" target="_blank" rel="noopener" style="${btn};display:inline-flex;align-items:center;text-decoration:none">完全版を買う（${PRICE}）</a>`) : ''}
      <button class="btn" id="pw-restore" style="${btn}">${ios ? '購入を復元する' : '買った鍵を入れる'}</button>
      <button class="btn" id="pw-close" style="${btn}">閉じる</button>
    </div>
    ${ios ? '' : `<form id="pw-key-form" hidden style="margin-top:24px">
      <p id="pw-key-help" style="margin:0 0 8px">買った鍵は、購入先からのメールで内容を見ると出ます。鍵をコピーして、ここに貼ってください。</p>
      <label for="pw-key">買った鍵</label>
      <input id="pw-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="pw-key-help" style="display:block;box-sizing:border-box;width:100%;min-height:44px;margin:8px 0;padding:8px;font-size:16px;background:#14120f;color:#f1e8d6;border:1px solid #c2a25a;border-radius:4px">
      <button class="btn" id="pw-verify" type="submit" style="${btn}">鍵を確かめる</button>
    </form>`}</div>`;
  document.body.appendChild(el);
  card = el; mt('fullView');
  // Web は Gumroad の買う画面をこの頁の上に重ねて開く（ほかのサイトへ移らない）。読めない時は新しいタブで開く
  if (!ios && GUMROAD_URL) loadGumroad();
  const msg = (t, error = false) => {
    const m = el.querySelector('#pw-msg');
    if (m) {
      m.textContent = error ? `！${t}` : t;
      m.style.border = error ? '1px solid #e38a74' : 'none';
      m.style.padding = error ? '8px' : '0';
    }
  };
  const opened = () => { closeCard(); onOpen && onOpen(); };
  paywallState = (o) => {
    if (!o) return;
    if (o.error) { msg('購入を確かめられませんでした。少し後でもう一度'); return; }
    if (typeof o.full === 'boolean') {
      if (o.full && card) { mt('fullBuyOk'); opened(); }
      else if (!o.full && o.restored) msg('復元できる購入はありません');
    }
  };
  const buy = el.querySelector('#pw-buy');
  if (buy) buy.onclick = () => {
    mt('fullBuyTap');
    if (ios) { msg('購入の画面を開いています…'); try { iap('buy'); } catch (e) { msg('購入の画面を開けませんでした'); } }
    else if (GUMROAD_URL) {
      // 買い終えると、重ねた画面とメールに鍵が出る。そのまま下に貼れるよう、鍵の欄を先に開いておく
      const form = el.querySelector('#pw-key-form');
      if (form) { form.hidden = false; el.querySelector('#pw-key-help').textContent = '買い終えたら、購入先からのメールで内容を見ると鍵が出ます。鍵をコピーして、ここに貼ってください。'; }
    }
  };
  el.querySelector('#pw-restore').onclick = async () => {
    if (ios) {
      const restore = el.querySelector('#pw-restore');
      if (restore.disabled) return;
      restore.disabled = true;
      if (buy) buy.disabled = true;
      msg('購入を確かめています…');
      try {
        const full = await restorePurchases();
        if (card !== el) return;
        if (full) {
          opened();
          window.dispatchEvent(new Event('購入を復元しました'));
        } else msg('復元できる購入はありません');
      } catch (e) { if (card === el) msg(e.message, true); }
      finally { restore.disabled = false; if (buy) buy.disabled = false; }
      return;
    }
    const form = el.querySelector('#pw-key-form');
    form.hidden = false;
    el.querySelector('#pw-key').focus();
  };
  const form = el.querySelector('#pw-key-form');
  if (form) form.onsubmit = async (event) => {
    event.preventDefault();
    const input = el.querySelector('#pw-key');
    const verify = el.querySelector('#pw-verify');
    if (verify.disabled) return;
    const key = input.value.trim();
    const wrongKey = '鍵が違います。メールの鍵をそのまま貼ってください';
    if (!key) { msg(wrongKey, true); input.focus(); return; }
    input.disabled = verify.disabled = true;
    msg('鍵を確かめています…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        body: new URLSearchParams({ product_id: GUMROAD_PRODUCT_ID, license_key: key, increment_uses_count: 'false' }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) throw new Error();
      const result = await response.json();
      if (card !== el) return;
      const purchase = result.purchase;
      if (!response.ok || result.success !== true || !purchase || purchase.refunded || purchase.chargebacked || purchase.disputed) {
        msg(wrongKey, true);
        return;
      }
      // 起動時は残した印だけを使う。鍵を毎回確かめず、通信なしでも遊べる。
      try { localStorage.setItem(GUMROAD_LICENSE_KEY, key); } catch (e) {}
      setFull(true);
      mt('fullBuyOk');
      opened();
    } catch (e) {
      if (card === el) msg('つながりません。少し後でもう一度', true);
    } finally {
      clearTimeout(timer);
      input.disabled = verify.disabled = false;
    }
  };
  el.querySelector('#pw-close').onclick = () => { closeCard(); onClose && onClose(); };
  // 購入札の操作を、下にある題や設定へ伝えない。
  el.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); el.querySelector('#pw-close').click(); }
  };
  const first = el.querySelector('#pw-buy') || el.querySelector('#pw-restore');
  first && first.focus();
}

// iOS が起動時・買った時に呼ぶ（札が出ていなくても印だけ更新する）
window.__iapState = (o) => {
  if (!o) return;
  if (typeof o.full === 'boolean' && !o.error) setFull(o.full);
  if (pendingRestore) {
    if (o.error || (o.restored && typeof o.full === 'boolean')) {
      const pending = pendingRestore;
      pendingRestore = null;
      clearTimeout(pending.timer);
      if (o.error) pending.reject(new Error('復元できませんでした。少し後でもう一度'));
      else pending.resolve(o.full);
    }
    return;
  }
  if (paywallState) paywallState(o);
};
