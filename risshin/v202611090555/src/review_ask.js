// App Store のレビューの窓を、ゲームの中で出す（kaito 10/17「アプリの中でレビューをお願いする仕組み」・11/2 勝った後だけ）
// 出すのは Apple の決まりの窓（SKStoreReviewController）だけ。星の数を誘ったり、ご褒美を付けたりしない（Apple の決まり）。
// 出す時：戦に勝って城下へ戻った時だけ。初めての戦・負けた後・練習では出さない。
// 回数：Apple の決まり（一年に三回まで）の中で、こちらも一年に三回まで・前に頼んでから 120 日は空ける。
// 待ちの印は保存に残す（戦の後に WKWebView を作り直しても消えない）。iOS のアプリの時だけ動く。
const KEY = 'risshin.reviewAsk';
const YEAR = 365 * 864e5, GAP = 120 * 864e5;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const keep = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 保存が使えない時は出さない */ } };
const asks = (s, now) => (Array.isArray(s.asks) ? s.asks : s.at ? [s.at] : []).filter((t) => now - t < YEAR);
export function noteWin(G) {
  if (!G || G.practice) return;
  const s = load(), now = Date.now(), a = asks(s, now);
  s.wins = (s.wins || 0) + 1;
  // 初めての戦（一勝目）では出さない。二勝目から、年三回・120 日空けの中で
  s.pending = s.wins >= 2 && a.length < 3 && (!a.length || now - Math.max(...a) >= GAP);
  keep(s);
}
// 負けた・やめた時は待ちを消す（城下へ戻っても出さない）
export function noteLoss() {
  const s = load();
  if (s.pending) { s.pending = false; keep(s); }
}
export function maybeAskReview() {
  const s = load();
  if (!s.pending) return;
  const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.review;
  if (!h) return;
  s.pending = false;
  keep(s);
  setTimeout(() => {
    try {
      h.postMessage('ask');
      const now = Date.now(), t = load();
      t.asks = [...asks(t, now), now]; delete t.at; keep(t);
    } catch (e) { /* 次に */ }
  }, 2500);   // 勝った後の広告が閉じてから
}
