// 完全版の買い切り（500円）。織田家編の最初の3戦は無料、残りは完全版で開く。
// 買った印は、保存とは別の localStorage の鍵に持つ（state.js の save/load/migrate には触らない）。
// iOS アプリ：Swift（StoreKit 2）と橋でやり取りする。Web：Stripe の Payment Link（STRIPE_LINK）。
import { ODA_LINE, BATTLES, scenarioKey } from './state.js';

export const STRIPE_LINK = '';     // Stripe の Payment Link（kaito が作って入れる。空の間は「アプリで買えます」の案内だけ）
export const APPSTORE_URL = '';    // App Store の戻り先（出たら入れる。空なら文だけ）
export const FULL_KEY = 'risshin_full';
export const FULL_MARK = 'kanzen500';   // Stripe の戻り先 ?full=kanzen500 で印を立てる（強い守りは要らない）
export const FREE_BATTLES = 3;
export const PRICE = '500円';

const store = {
  get() { try { return localStorage.getItem(FULL_KEY) === '1'; } catch (e) { return false; } },
  set(on) { try { if (on) localStorage.setItem(FULL_KEY, '1'); else localStorage.removeItem(FULL_KEY); } catch (e) {} },
};
// 自動の道具（bot・録画・漫画の撮影・テストプレイヤー）は裏の Chrome（navigator.webdriver）で動くので鍵を掛けない（10/7）
// 手元の開発用サーバー（localhost・127.0.0.1）も同じ。録画や bot の Chrome は webdriver が立たない事がある。公開の頁とアプリは別の場所なので鍵は掛かる
const auto = (() => { try { return !!navigator.webdriver || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch (e) { return false; } })();
export const isFull = () => auto || store.get();
export const setFull = (on) => store.set(!!on);

// 戻り先 ?full=印 で印を立てる
try {
  const u = new URL(location.href);
  if (u.searchParams.get('full') === FULL_MARK) {
    store.set(true);
    u.searchParams.delete('full');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }
} catch (e) {}

const idsLocked = () => {
  const have = new Set(BATTLES.map((b) => b.id));
  return ODA_LINE.slice(FREE_BATTLES).filter((b) => have.has(b.id));
};
// この戦（BATTLES の番号 i）に鍵が掛かっているか
export function isLocked(i) {
  if (isFull() || scenarioKey() !== 'oda') return false;
  // Web は Stripe のリンクが入るまで鍵を掛けない（買う道が無いまま止めない。kaito 10/7）
  if (!window.__iosApp && !STRIPE_LINK) return false;
  const b = BATTLES[i];
  if (!b) return false;
  const at = ODA_LINE.findIndex((e) => e.id === b.id);
  return at >= FREE_BATTLES;
}

const mt = (k) => { try { window.risshinMetrics && window.risshinMetrics[k] && window.risshinMetrics[k](); } catch (e) {} };
let card = null;
const closeCard = () => { if (card) { card.remove(); card = null; } };

// 鍵の札。買えたら onOpen を呼ぶ。閉じたら onClose
export function showPaywall(onOpen, onClose) {
  closeCard();
  const ios = !!window.__iosApp;
  const n = idsLocked().length;
  const canBuy = ios || !!STRIPE_LINK;
  const el = document.createElement('div');
  el.id = 'paywall';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(10,8,6,.82);padding:12px;overflow:auto';
  const btn = 'min-height:44px;padding:8px 18px;font-size:16px;margin:4px;cursor:pointer';
  el.innerHTML = `<div style="max-width:460px;width:100%;background:#1c1813;color:#f1e8d6;border:1px solid #8a7348;border-radius:8px;padding:16px 18px;font-size:15px;line-height:1.7">
    <h2 style="margin:0 0 6px;font-size:18px;color:#e7c873">ここから先は「完全版」</h2>
    <p style="margin:4px 0">最初の${FREE_BATTLES}戦は、ずっと無料で遊べます。完全版を買うと、残りの${n}戦がすべて開きます。</p>
    <p style="margin:4px 0">一度買えば、ずっと遊べます（買い切り・${PRICE}）。</p>
    <p id="pw-msg" role="status" style="margin:6px 0;min-height:24px;color:#e7c873"></p>
    ${canBuy ? '' : `<p style="margin:4px 0">完全版はアプリで買えます。${APPSTORE_URL ? `<a href="${APPSTORE_URL}" style="color:#e7c873">App Store を開く</a>` : 'App Store で「戦国立身」をさがしてください。'}</p>`}
    <div style="display:flex;flex-wrap:wrap;justify-content:center">
      ${canBuy ? `<button class="btn primary" id="pw-buy" style="${btn}">完全版を買う（${PRICE}）</button>` : ''}
      <button class="btn" id="pw-restore" style="${btn}">買ったのを戻す</button>
      <button class="btn" id="pw-close" style="${btn}">閉じる</button>
    </div></div>`;
  document.body.appendChild(el);
  card = el; mt('fullView');
  const msg = (t) => { const m = el.querySelector('#pw-msg'); if (m) m.textContent = t; };
  const opened = () => { closeCard(); onOpen && onOpen(); };
  window.__iapState = (o) => {
    if (!o) return;
    if (o.error) { msg(o.error); return; }
    if (typeof o.full === 'boolean') {
      setFull(o.full);
      if (o.full && card) { mt('fullBuyOk'); opened(); }
      else if (!o.full && o.restored) msg('買った記録が見つかりませんでした');
    }
  };
  const buy = el.querySelector('#pw-buy');
  if (buy) buy.onclick = () => {
    mt('fullBuyTap');
    if (ios) { msg('購入の画面を開いています…'); try { window.webkit.messageHandlers.iap.postMessage({ op: 'buy' }); } catch (e) { msg('購入の画面を開けませんでした'); } }
    else if (STRIPE_LINK) window.open(STRIPE_LINK, '_blank', 'noopener');
  };
  el.querySelector('#pw-restore').onclick = () => {
    if (ios) { msg('買った記録を確かめています…'); try { window.webkit.messageHandlers.iap.postMessage({ op: 'restore' }); } catch (e) { msg('確かめられませんでした'); } return; }
    if (isFull()) opened();
    else msg('この端末には買った記録がありません。買った時の画面の戻り先から、もう一度開いてください。');
  };
  el.querySelector('#pw-close').onclick = () => { closeCard(); onClose && onClose(); };
  const first = el.querySelector('#pw-buy') || el.querySelector('#pw-restore');
  first && first.focus();
}

// iOS が起動時・買った時に呼ぶ（札が出ていなくても印だけ更新する）
window.__iapState = window.__iapState || ((o) => { if (o && typeof o.full === 'boolean') setFull(o.full); });
