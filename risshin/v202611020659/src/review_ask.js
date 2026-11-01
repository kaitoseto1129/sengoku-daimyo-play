// App Store のレビューの窓を、ゲームの中で出す（kaito 10/17「アプリの中でレビューをお願いする仕組み」）
// 出すのは Apple の決まりの窓（SKStoreReviewController）だけ。星の数を誘ったり、ご褒美を付けたりしない（Apple の決まり）。
// 出す時：戦に勝って城下へ戻った時。勝ちが3回目以降・一度出したら二度と出さない。負けた後・練習では出さない。
// 実際に窓を出すかは Apple が決める（一年に三回まで）。iOS のアプリの時だけ動く。
const KEY = 'risshin.reviewAsk';
let pending = false;
export function noteWin(G) {
  if (!G || G.practice) return;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    s.wins = (s.wins || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(s));
    if (s.wins >= 3 && !s.at) pending = true;   // 3戦目に勝った後に一度だけ（何度も出さない）
  } catch (e) { /* 保存が使えない時は出さない */ }
}
export function maybeAskReview() {
  if (!pending) return;
  pending = false;
  const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.review;
  if (!h) return;
  setTimeout(() => {
    try {
      h.postMessage('ask');
      const s = JSON.parse(localStorage.getItem(KEY) || '{}'); s.at = Date.now(); localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* 次に */ }
  }, 1500);
}
