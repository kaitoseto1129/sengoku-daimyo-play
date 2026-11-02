// 勝った後だけ流れる広告（kaito 11/1）。戦の途中・負けた後・題やホームには出さない。一戦ごとに一回まで。
// 出すのはアプリの橋（webkit.messageHandlers.ads）に頼む形だけ。Web・Steam・自動の道具では何もしない。
// 『広告を消す』（月額の定期購読）を持っている人には出さない。完全版・豊臣編・徳川編を買った人には出す。docs/ads_1101.md
import { ownsNoAds, canBuyInApp, buyProduct, NOADS_PID } from './paywall.js';

const shown = new Set();
const bridge = () => { try { return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ads; } catch (e) { return null; } };
// 広告のあるアプリか（『広告を消す』の釦を出すかの目安）
export const offerNoAds = () => !!window.__iosApp && !!bridge() && canBuyInApp() && !ownsNoAds();
export const buyNoAds = () => buyProduct(NOADS_PID);

// 勝った後の結果の画面を閉じた所で呼ぶ。battleId は一戦ごとの印（同じ戦で二度は出さない）
export function showAfterWin(battleId) {
  const b = bridge();
  if (!b || ownsNoAds() || window.__autoplayUnlock) return false;
  const key = String(battleId ?? '');
  if (shown.has(key)) return false;
  shown.add(key);
  try { b.postMessage({ op: 'show_after_win' }); return true; } catch (e) { return false; }
}
